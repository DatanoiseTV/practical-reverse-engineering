# ARM Cortex-M (STM32, nRF, SAMD)

Cortex-M is the most common 32-bit microcontroller architecture in the
world, and reverse engineering a Cortex-M firmware image is the most
common starting point for an embedded reverse engineer. This chapter
covers the architectural details you need to know, the loading recipe,
the analysis tweaks, the family-specific gotchas (STM32 vs nRF52 vs
SAMD), and a worked example.

## Architectural overview

Cortex-M is an ARMv6-M (M0/M0+/M1), ARMv7-M (M3) / ARMv7E-M (M4/M7), or
ARMv8-M (M23/M33) / ARMv8.1-M (M55) profile. Key facts for reverse engineering:

* **Thumb-only.** Cortex-M cores execute Thumb-2 (M3/M4/M7) or a Thumb
  subset (M0/M0+). They do not execute classic ARM instructions. The
  low bit of every code address is `1` (Thumb interworking convention).
* **Memory map is fixed.** The architecture defines what address ranges
  hold what:
  * `0x00000000` — code (alias for the boot region, often flash)
  * `0x08000000` — flash (STM32 convention; some vendors differ)
  * `0x20000000` — SRAM
  * `0x40000000` — peripherals
  * `0xE0000000`–`0xE00FFFFF` — Private Peripheral Bus (PPB). The
    System Control Space (SCS — NVIC, SysTick, DWT, SCB) is a sub-range
    at `0xE000E000`–`0xE000EFFF`.
* **Vector table.** First 16 words of code are: initial SP, reset vector,
  NMI, HardFault, then four ARMv7-M-only fault vectors (MemManage,
  BusFault, UsageFault, plus SecureFault on v8-M), four reserved slots,
  SVC, DebugMon, one reserved slot, PendSV, SysTick. External interrupt
  handlers start at word 16. The number of external interrupts is
  family-dependent (about 80 on a typical STM32F4). On ARMv6-M (M0/M0+)
  the MemManage/BusFault/UsageFault slots are reserved — only HardFault
  exists for all faults.
* **AAPCS calling convention.** r0–r3 for arguments, return in r0,
  r4–r11 callee-saved, lr is the return address. This is the same as
  Linux ARM, just on smaller cores.
* **Bit-banding (M3/M4 only).** Address ranges `0x22000000–0x23FFFFFF`
  and `0x42000000–0x43FFFFFF` alias bits in SRAM and peripheral space.
  A 32-bit access to `0x22000000 + (off*32 + bit*4)` reads or writes
  bit `bit` of byte `off` in SRAM. This is rare but confusing when you
  see it.
* **No MMU.** What you see in disassembly is what executes. Addresses
  are physical.

## Loading recipe

For a raw firmware blob (no ELF), the canonical command:

```text
$ r2 -a arm -b 16 -c cortex -m 0x08000000 firmware.bin
```

* `-a arm` — the architecture
* `-b 16` — Thumb is 16-bit-aligned
* `-c cortex` — the CPU profile (enables M-profile system register
  decoding such as MSR/MRS to PRIMASK, FAULTMASK, BASEPRI, CONTROL)
* `-m 0x08000000` — STM32 flash base. For nRF52 application image use
  the address just past the SoftDevice — `0x00026000` for S132 v7.x
  (152 KiB) or `0x00027000` for S140 v7.x (156 KiB); older SoftDevice
  versions end at lower addresses, so check the exact SoftDevice version
  in flash. For SAMD21 use `0x00002000` after the UF2 bootloader;
  bare-flash images map at `0x00000000`.

::: warning
Some Cortex-M binaries you find in the wild are extracted from a
larger flash dump and have lost their leading-zero region. The vector
table may not be at offset 0 of the file. Look at the first 32 bytes
in `xxd`: if they look like RAM-pointer + flash-pointer + flash-pointer,
you are at the start; if they look like instructions, you are not.
:::

## The vector table is your map

After loading, dump the first 256 bytes:

```text
[0x08000000]> pxw 256 @ 0x08000000
0x08000000  0x20020000 0x080001cd 0x08000231 0x08000235  ... ...
0x08000010  0x08000239 0x0800023d 0x08000241 0x00000000  ... ...
0x08000020  0x00000000 0x00000000 0x00000000 0x08000245  ... ...
0x08000030  0x08000249 0x00000000 0x0800024d 0x08000251  ... ...
...
```

Reading this:

* Word 0: `0x20020000` — initial SP. `0x20000000 + 0x20000` means
  128 KiB of SRAM ends at this address; SP grows down from here.
* Word 1: `0x080001cd` — reset vector (`0x080001cc` with the Thumb
  bit set). Define a function there and rename it:

```text
[0x08000000]> af @ 0x080001cc
[0x08000000]> afn reset_handler 0x080001cc
```

* Words 2–15: standard exceptions. Names from the Cortex-M architecture:

```text
# (handler addresses shown below are the resolved targets from the
# example vector dump above, not the vector slot offsets — slots 7..10
# and slot 13 are reserved on v7-M, with zero entries you should skip.)
[0x...]> f sym.NMI_Handler         = 0x08000231   # vector slot 2 (offset 0x08)
[0x...]> f sym.HardFault_Handler   = 0x08000235   # slot 3 (0x0C)
[0x...]> f sym.MemManage_Handler   = 0x08000239   # slot 4 (0x10)
[0x...]> f sym.BusFault_Handler    = 0x0800023d   # slot 5 (0x14)
[0x...]> f sym.UsageFault_Handler  = 0x08000241   # slot 6 (0x18)
# slots 7..10 (0x1C..0x28) reserved on v7-M (SecureFault occupies slot 7 on v8-M)
[0x...]> f sym.SVC_Handler         = 0x08000245   # slot 11 (0x2C)
[0x...]> f sym.DebugMon_Handler    = 0x08000249   # slot 12 (0x30)
# slot 13 (0x34) reserved
[0x...]> f sym.PendSV_Handler      = 0x0800024d   # slot 14 (0x38)
[0x...]> f sym.SysTick_Handler     = 0x08000251   # slot 15 (0x3C)
```

* Words 16+: external interrupts. The mapping is family-specific. For
  STM32F407, IRQ 0 is `WWDG_IRQHandler`, IRQ 1 is `PVD_IRQHandler`,
  IRQ 6 is `EXTI0_IRQHandler`, IRQ 37 is `USART1_IRQHandler`. Use the
  vendor's `startup_stm32f407xx.s` (in any STM32CubeF4 install) as your
  ground truth.

A useful trick: vector handlers that are unused typically point to a
`Default_Handler` that loops forever. Functions that are *not*
`Default_Handler` are the IRQs the firmware actually services. Find
them with:

```text
[0x...]> pxw 4*N @ 0x08000040     # the external IRQ vector array
[0x...]> # any value other than the default handler is interesting
```

## Peripheral identification

The next biggest payoff is naming the peripherals. STM32, nRF, and SAMD
all have well-defined memory maps published in the reference manuals.

For STM32F4, the relevant bases are:

```text
[0x...]> f peri.RCC      = 0x40023800   # clock control
[0x...]> f peri.GPIOA    = 0x40020000
[0x...]> f peri.GPIOB    = 0x40020400
[0x...]> f peri.GPIOC    = 0x40020800
[0x...]> f peri.USART1   = 0x40011000
[0x...]> f peri.USART2   = 0x40004400
[0x...]> f peri.SPI1     = 0x40013000
[0x...]> f peri.I2C1     = 0x40005400
[0x...]> f peri.TIM1     = 0x40010000
[0x...]> f peri.TIM2     = 0x40000000
[0x...]> f peri.NVIC     = 0xE000E100
[0x...]> f peri.SCB      = 0xE000ED00
[0x...]> f peri.SysTick  = 0xE000E010
```

After flagging, every reference like `LDR Rn, [Rm]` against an address
that resolves to a flag shows the flag name as a comment.

Better still, load the CMSIS header so structs are typed (Chapter 8):

```text
[0x...]> to /opt/STM32CubeF4/Drivers/CMSIS/Device/ST/STM32F4xx/Include/stm32f407xx.h
[0x...]> tl GPIO_TypeDef = 0x40020000
[0x...]> tl GPIO_TypeDef = 0x40020400
[0x...]> tl USART_TypeDef = 0x40011000
... etc.
```

Now `STR R1, [R3, #0x14]` at a USART base shows `USART_TypeDef.CR1`.

::: tip
The `tl` linking is per-address. For a family with eight GPIO ports
all using the same struct, write a small loop:

```text
[0x...]> .(tl_gpio)          # macro, defined like this:
[0x...]> "(tl_gpio
  tl GPIO_TypeDef = 0x40020000
  tl GPIO_TypeDef = 0x40020400
  tl GPIO_TypeDef = 0x40020800
  tl GPIO_TypeDef = 0x40020c00
)"
```

Save the macro in your `~/.radare2rc` or per-project rc file.
:::

## STM32-specific notes

**Cube HAL.** STM32CubeMX generates code that uses the HAL. Functions
named `HAL_*` are recoverable with zignatures (Chapter 10). Build a
signature database from the vendor's HAL static library — every HAL
function has a stable signature across patch versions.

**LL drivers.** The "low level" drivers in CubeF4+ (`LL_GPIO_*`,
`LL_USART_*`) are inlined heavily. They mostly disappear into the
calling function rather than appearing as separate symbols. Pattern-
match by recognising the inline expansion (a sequence of LDR/STR to
peripheral registers).

**FreeRTOS port.** Most STM32 firmware uses the official ARM Cortex-M4F
port of FreeRTOS. The PendSV handler is the context switcher; SVC is
the syscall entry. Both have stereotyped sequences you learn to spot.
Build a FreeRTOS signature DB and match it; it covers `xTaskCreate`,
`vTaskDelay`, `xQueueSend`, and friends.

**Bootloader region.** ST's reference designs put the system bootloader
in ROM at `0x1FFF0000`. If you see references to that address from your
firmware, they are calls into the ST bootloader. ST publishes the
bootloader's API in AN2606.

## nRF52-specific notes

**SoftDevice.** The Bluetooth stack is a separately-flashed binary
that lives from `0x00000000` to the SoftDevice end (e.g., `0x00026000`
for S132 v7.x; the size varies by version). The application starts
above it. SoftDevice calls happen via SVC: a software interrupt with a
service number. The BLE SVC range starts around `0x60` (`BLE_SVC_BASE`),
so you will see calls in roughly that range and onwards (`sd_ble_*` are
in the `0x60`–`0x9F` block, `sd_ble_gap_*` higher within it).
The exact mapping is in the `s132_nrf52_*_API/include/*.h` headers.

::: note
When loading an nRF52 dump that includes the SoftDevice, load both:
the SoftDevice at `0x00000000` and the application at the SoftDevice's
end. Otherwise the SVC handlers point into nothing and analysis is
incomplete.
:::

**SDK structure.** The Nordic SDK uses a distinct naming convention
(`nrf_drv_*`, `nrf_*`, `app_*`). Build a signature DB from the SDK
once and reuse across projects.

## SAMD-specific notes

**ASF / Atmel Start.** The Atmel Software Framework has its own
naming style (`gpio_set_pin_function`, `usart_*`). Less ubiquitous
than ST's HAL but still common; signature-DB the same way.

**UF2 bootloader.** Many SAMD boards (Adafruit, MakeCode) ship with
a UF2 bootloader at `0x00000000`. The application starts at
`0x00002000`. UF2 is a USB-mountable file format — `firmware.uf2`
on the disk maps to flash with embedded address records. Convert with
`uf2conv` (Chapter 4).

**Debug halt vs reset boot.** SAMD's reset behaviour depends on the
GCLK/PM configuration the bootloader leaves; if your binary hangs in
analysis with a strange initial PC, double-check that the entry point
you defined matches what the chip's internal boot logic actually
jumps to.

## A worked example: identifying the UART setup function

Suppose you have an STM32F407 firmware and you want to find where
USART1 is initialised. Workflow:

```text
[0x08000000]> f peri.USART1 = 0x40011000
[0x08000000]> axt @ peri.USART1
0x08001234  -> peri.USART1 (DATA in fcn.0800122c)
0x08001244  -> peri.USART1 (DATA in fcn.0800122c)
0x08001260  -> peri.USART1 (DATA in fcn.0800122c)
... etc.
```

All references to USART1 are in one function. Open it:

```text
[0x08000000]> pdf @ fcn.0800122c
```

You see writes to `+0x0c` (CR1), `+0x10` (CR2), `+0x14` (CR3), `+0x08`
(BRR). That sequence is the signature of HAL_UART_Init or LL_USART_Init.
Confirm by linking the type:

```text
[0x08000000]> to stm32f407xx.h
[0x08000000]> tl USART_TypeDef = 0x40011000
[0x08000000]> pdf @ fcn.0800122c
```

Now the disassembly reads `STR R1, [R3, USART_TypeDef.CR1]`. Decompile:

```text
[0x08000000]> pdg @ fcn.0800122c
```

The output is recognisably a UART init: BRR computed from a
fractional-clock value, CR1 set with TE/RE/UE bits, CR2 and CR3 cleared.
Rename:

```text
[0x08000000]> afn HAL_UART_Init 0x0800122c
```

…and proceed up the call graph. Five minutes in, you have a usable map
of the firmware's UART initialisation path.

## Cortex-M-specific gotchas

**Vector relocation.** The SCB->VTOR register can move the vector
table from `0x08000000` to anywhere. Bootloaders do this when they
hand off to the application: they set VTOR to the application's
vector table base. If you analyse a bootloader and the disassembly
references vector addresses that look wrong, look for a write to
`0xE000ED08`.

**TrustZone-M (Cortex-M33/M55).** Code lives in two security states
with separately-banked stack pointers. A v8-M dump may have a Secure
and Non-Secure partition with different vector tables. Check
`SAU/IDAU` configuration in the binary; load the two halves
separately.

**Compact branch encoding.** Thumb's `B`, `BL`, `BLX` instructions
use PC-relative offsets that the disassembler must compute. If your
load address is wrong by even 4 bytes, every branch target is
plausible-looking but wrong. The vector-table sanity check above is
the fastest way to catch this.

**Hard-float ABI.** Cortex-M4F and M7 with FPU often use the hard-float
ABI: float arguments in s0–s15. If your function signatures describe
floats as integer args, the decompiler shows nonsense. Set the
calling convention to `arm32_hardfloat` if available, or annotate the
signature explicitly (Chapter 8).

The remaining architecture chapters follow the same shape: how the CPU
works, how to load it, how to identify the vendor's framework, what
bites you. Read in order if you are new to embedded; jump straight to
your target if you already know what you are doing.
