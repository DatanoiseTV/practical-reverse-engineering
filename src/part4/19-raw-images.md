# Loading Raw Images: Memory Maps, Vector Tables, MMIO

When a binary arrives without an ELF header — a raw flash dump, a
`dd` of an MTD partition, an extracted blob from a multi-stage
bootloader — you have to reconstruct everything the loader would have
told r2 automatically. This chapter is the procedural recipe: how to
infer architecture, base address, segment boundaries, and peripheral
mappings from raw bytes. Some of this overlapped with the per-arch
chapters in Part III; this chapter consolidates the reasoning into
one place you can return to.

## What r2 needs to load a blob

The minimum to get useful disassembly:

* **Architecture** (`-a arm`, `-a mips`, etc.)
* **Bits** (`-b 16`, `-b 32`, `-b 64`)
* **Endianness** (`-e cfg.bigendian=true|false`)
* **Base load address** (`-m 0x...`)
* **CPU subtype**, sometimes (`-c cortex`, `-c esp32`, `-c rv32imac`)

Get any one of these wrong and the disassembly is garbage. Get all of
them right and r2 produces the same quality output it would for an
ELF.

The rest of this chapter is how to derive each of those.

## Step 1: Identify the architecture

In rough order of certainty:

**Strings.** Build IDs, vendor banners, and source-file paths
identify the architecture more reliably than any heuristic:

```text
$ strings firmware.bin | grep -iE 'gcc|clang|rust|go|sdcc'
GCC: (Arm GNU Toolchain ...) 13.2.1
$ strings firmware.bin | grep -iE 'arm|cortex|xtensa|mips|riscv|esp32'
$ strings firmware.bin | grep -iE 'stm32|nrf|esp|wch|bouffalo|atheros|broadcom|mediatek'
```

The `GCC: (Arm GNU Toolchain ...)` string is the definitive answer.
A `Espressif IoT Development Framework` string is too. Vendor SoC
names narrow further.

**File-format header.** If the blob starts with `0xE9` byte and a
plausible 4-byte entry point, it is an ESP32 image (Chapter 14). If
it starts with `27051956` (uImage magic, big-endian), it is a U-Boot
image with embedded architecture info — `dumpimage` reads it. If
it starts with `7F 45 4C 46`, it is an ELF (you do not need this
chapter).

**Opcode-statistics tools.** `cpu_rec.py` (Airbus CERT) classifies
unknown blobs by byte n-gram statistics across a corpus of known
architectures. It is the most accurate "unknown blob -> architecture"
tool widely available:

```text
$ cpu_rec.py firmware.bin
firmware.bin                           full(0x100000, ARM)            chunk(ARM)
```

`binwalk -A` runs Capstone disassembly across architectures and
picks the best fit. Less accurate than cpu_rec for short images,
faster for big ones.

**Manual byte inspection.** The signatures of common architectures
in the first 64 bytes are surprisingly recognisable once you have
seen each:

* **ARM Thumb (Cortex-M)**: starts with two 4-byte words that look
  like a RAM-region pointer (`0x20XXXXXX`) and a flash code pointer
  with the low bit set (`0xXXXXXXX1`). Then a vector table of more
  flash pointers.
* **ARM AArch32 application**: starts with branches (`EA xx xx xx`)
  or a literal pool followed by code.
* **MIPS**: bytes like `27 BD FF E0` (big-endian `ADDIU $sp, $sp, -0x20`)
  or `E0 FF BD 27` (little-endian).
* **RISC-V**: bytes whose low byte ends in `11` binary (low 2 bits =
  `11`) are uncompressed 32-bit instructions; `0x13` (RV32I `OP-IMM`,
  the `addi` family) and `0x17` (`AUIPC`) at function entries are
  typical. Bytes ending in `00`/`01`/`10` are 16-bit compressed (RVC)
  instructions. The `auipc/addi` pair for global-pointer setup is a
  strong tell.
* **Xtensa**: 24-bit instructions that look statistically lumpy; first
  bytes often `36 41 00` (entry instruction) or similar.
* **8051**: `02 xx xx` (LJMP) at offset 0; very low-density.

Once you have a candidate, validate by loading it and reading the
first 64 instructions. If they look like a sensible startup sequence
(stack pointer setup, BSS clear, data copy from flash to RAM, call
to main), you are right. If they look random, you are wrong — try
another arch or another endianness.

## Step 2: Determine the base address

The base address is whatever virtual address the firmware was linked
at. Methods:

**The vector table** (Cortex-M, RISC-V with vectored interrupts).
On Cortex-M, the second word is the reset vector. It points into
flash. The flash base on a typical chip is published in the TRM:

| Vendor / family   | Flash base       |
|-------------------|------------------|
| STM32             | `0x08000000`     |
| nRF52             | `0x00000000`     |
| SAMD              | `0x00000000`     |
| LPC55S6x          | `0x10000000` or `0x00000000` (secure/non-secure) |
| RP2040            | `0x10000000`     |

The reset vector word, masked low bit removed, must lie within the
flash region. That is your base address.

**Internal pointers.** A long blob with no obvious structure usually
contains literal-pool pointers to other parts of itself. If you
disassemble the blob at *some* base and see `LDR R0, =0x08001234`,
and `0x08001234` lies within the loaded image, your base is right.
If `0x08001234` lies *outside* the loaded image and looks like it
should point to a string or table, your base is wrong by some
multiple of the image size.

Algorithm: try base `0x00000000`. Disassemble. Find the most common
literal-pool target. Compute the offset between that target and the
likely string/table location in the image. The image is loaded at
that offset.

**Bootloader hand-off.** If the binary follows a bootloader, the
bootloader's last instruction is typically a jump to the application's
reset vector. Reverse engineer the bootloader (which is at the
known reset address) to recover the application's base.

**Padding and alignment.** Linker scripts align section boundaries
to power-of-two addresses. The base address is almost always a
multiple of `0x1000` (page size) or `0x10000` (sector size on common
flash).

::: tip
For Cortex-M specifically, write a small Python script that loads
the binary, reads the first 256 4-byte words, and reports those that
look like valid vectors (low bit set, target within `0x08000000` ±
`flash_size`). If 30+ words match consistently, you have the right
base. This trick works for any architecture with a vector table at
the start of the image — adjust the magic addresses for the chip.
:::

## Step 3: Determine the endianness

For ARM and Xtensa, almost always little-endian. For MIPS, both are
common; check.

Quick test: pick a likely instruction (anything that is *not* zero)
and decode under both endiannesses. The one that produces a sensible
opcode is right. For example, `27 BD FF E0` decodes as a stack
allocation in big-endian MIPS and as nonsense in little-endian.

Set:

```text
[0x...]> e cfg.bigendian = true
[0x...]> e cfg.bigendian = false
```

Endianness can change *within* a binary (rare but happens for
heterogeneous SoCs with different cores). Hint per-region with
`ahb` if you encounter this.

## Step 4: Identify segments

Most embedded firmware is a single contiguous flash blob. But a
fully-linked image often has:

* **`.text`** — code in flash
* **`.rodata`** — strings and constants in flash
* **`.data`** — initial values for RAM-resident global variables,
  *stored in flash* but copied to RAM at startup
* **`.bss`** — RAM-resident, zero-initialised at startup, *not in the
  image*
* **literal pools** — small data interleaved into `.text`

In a raw blob, all of `.text`, `.rodata`, and `.data` are present.
The boundaries between them matter for analysis: instructions live
in `.text`; reading `.rodata` as instructions produces garbage.

Heuristics for finding `.rodata`:

* A run of high-ASCII printable characters is `.rodata`.
* A run of 32-bit words that look like pointers but are followed by
  a string is a const struct array (also `.rodata`).
* A region with very different byte-frequency statistics from the
  preceding region is a section change.

For a raw blob, telling r2 about the boundary lets analysis ignore
non-code regions:

```text
[0x...]> e anal.from = 0x08000000
[0x...]> e anal.to   = 0x08020000   # end of .text estimate
```

Then run analysis. R2 will not waste time disassembling rodata as
code (and will not invent fake functions there).

## Step 5: MMIO regions

After loading, the disassembly will have many references to addresses
in the `0x40000000`-or-similar peripheral region. Annotate them.

For a known SoC, transcribe the peripheral base addresses to flags
once and reuse:

```text
# stm32f4_peri.r2
f peri.RCC      = 0x40023800
f peri.PWR      = 0x40007000
f peri.GPIOA    = 0x40020000
f peri.GPIOB    = 0x40020400
f peri.USART1   = 0x40011000
f peri.SPI1     = 0x40013000
f peri.I2C1     = 0x40005400
f peri.TIM1     = 0x40010000
f peri.NVIC     = 0xE000E100
f peri.SCB      = 0xE000ED00
... (whole TRM)
```

Then `. stm32f4_peri.r2` at session start. Combined with `tl` (link
type to address, Chapter 8) using the CMSIS header, every peripheral
access in the disassembly reads as a struct field.

## Step 6: Reload with a recipe

After steps 1–5 you have a working load configuration. Save it:

```text
# load.r2
e asm.arch = arm
e asm.bits = 16
e asm.cpu = cortex
e cfg.bigendian = false
e anal.from = 0x08000000
e anal.to   = 0x08020000
e anal.depth = 64

o firmware.bin 0x08000000

. stm32f4_peri.r2
to stm32f4_flat.h

aaa

P+ stm32f4_fw_v1
```

Run with `r2 -i load.r2 -`. From now on every session starts in the
same correct state.

## When the blob is not contiguous

Some images are concatenations: bootloader + application + filesystem.
`binwalk` finds the boundaries. Then split:

```text
$ binwalk firmware.bin
0          0x0          uImage header
64         0x40         LZMA compressed kernel
1572864    0x180000     Squashfs filesystem

$ dd if=firmware.bin of=kernel.lzma bs=1 skip=64 count=1572800
$ dd if=firmware.bin of=rootfs.squashfs bs=1 skip=1572864
$ unlzma kernel.lzma
$ unsquashfs rootfs.squashfs
```

Now load each part separately into its own r2 session, or use multiple
mappings within one session if they execute together.

## When you get it wrong: fast checks

After loading, four sanity checks:

1. `pdf @ entry0` produces a sensible function (not an instruction
   stream that decodes random bytes).
2. `pdf @ entry0` ends with a return instruction (not an unconditional
   branch into nothing).
3. `axt @ str.<some-string>` returns at least one xref (the string is
   referenced from code).
4. `afl | head -20` shows function sizes that look plausible
   (40–500 bytes typical, not single-instruction or 50,000-byte
   monsters).

If all four pass, your load is right. If any fail, revisit the
choice they implicate (bad arch / wrong base / endianness / segment
boundary).

The discipline of loading a blob right the first time — taking
twenty minutes to sort out the recipe rather than diving into
analysis on a wrongly-loaded image — saves hours of confusion later.
Every line of disassembly you read against a misloaded image is a
line you read in vain.
