# RISC-V (ESP32-C, BL602, generic RV32)

RISC-V is the architecture you reach for when the alternative was
proprietary, expensive, or politically inconvenient. In the embedded
space it appears in: Espressif's ESP32-C3, C6, H2, P4 (Andes-IP RV32);
Bouffalo's BL602/BL604/BL808; SiFive's HiFive boards; WCH's CH32V
series; Allwinner's D1 (single-core RV64GC); and a fast-growing list
of others. This chapter covers the RV32 variants you will encounter
in microcontroller firmware, with notes on RV64 where they differ.

## Architectural overview

RISC-V is a clean, fixed-32-bit (with 16-bit compressed extension)
load-store ISA. Compared to ARM:

* **Fewer surprises in the encoding.** Every base instruction is 32
  bits; compressed (`c` extension) instructions are 16 bits. No
  Thumb-vs-ARM mode switching; the decoder figures out length from
  the low 2 bits of the first halfword.
* **No condition flags.** Every conditional branch encodes the
  condition (`beq`, `bne`, `blt`, `bge`, `bltu`, `bgeu`) and the two
  registers it compares.
* **PC-relative everything.** `auipc` (Add Upper Immediate to PC) is
  the building block of position-independent addressing.
* **Lots of registers** (32 integer + 32 float in the floating-point
  variants). Calling convention reserves specific roles.
* **Modular ISA.** A given chip implements some combination of base
  and extensions. Most embedded RV32 cores are `RV32IMC` (integer +
  multiply + compressed) or `RV32IMAC` (+ atomics). Some include
  `F`/`D` for floating-point. ESP32-C3 is RV32IMC.

## Calling convention

ABI register names you should memorise:

| Reg name | ABI name | Role                               |
|----------|----------|------------------------------------|
| x0       | zero     | constant zero                      |
| x1       | ra       | return address                     |
| x2       | sp       | stack pointer                      |
| x3       | gp       | global pointer (linker-fixed)      |
| x4       | tp       | thread pointer                     |
| x5–x7    | t0–t2    | temporaries (caller-saved)         |
| x8       | s0/fp    | saved/frame pointer                |
| x9       | s1       | saved                              |
| x10–x11  | a0, a1   | function args / return values      |
| x12–x17  | a2–a7    | function args                      |
| x18–x27  | s2–s11   | saved (callee-saved)               |
| x28–x31  | t3–t6    | temporaries                        |

* Arguments: `a0..a7` (8 args in registers, more on stack)
* Return: `a0` (and `a1` for 64-bit returns on RV32)
* Saved: `s0..s11` (callee-saved)
* Temporaries: `t0..t6` (caller-saved)

R2 displays both raw (`x10`) and ABI (`a0`) names depending on
`asm.syntax`:

```text
[0x...]> e asm.syntax = att          # ABI names
[0x...]> e asm.syntax = abi          # ABI names (alias)
[0x...]> e asm.syntax = none         # raw register numbers
```

ABI names are easier to read.

## Loading

For a clean ELF (the common case for SiFive, WCH, BL602 with proper
build):

```text
$ r2 firmware.elf
[0x...]> i
arch     riscv
bits     32
machine  riscv
```

R2 reads the architecture from the ELF header. `aaa` and you are off.

For a raw blob:

```text
$ r2 -a riscv -b 32 -c rv32imac -m 0x42000000 firmware.bin       # ESP32-C3
$ r2 -a riscv -b 32 -c rv32imafc -m 0x21010000 firmware.bin      # BL602
$ r2 -a riscv -b 64 -c rv64gc -m 0x80000000 firmware.bin         # generic Linux RV64
```

The `-c` flag matters because it tells r2 which extensions are
available — without `c` (compressed), r2 will not decode 16-bit
opcodes. With `c` enabled, r2 handles both widths transparently.

::: warning
RISC-V's compressed extension uses the same opcode space as base
RV32I, distinguished by the low 2 bits. If you set `-c rv32i` (no
compressed) on a binary that uses compressed, every other instruction
decodes as garbage. Default to `rv32imac` or `rv32imc` for embedded
firmware unless you are sure compressed is disabled.
:::

## ESP32-C3 / C6 specifics

The ESP32-C3 is a single-core RV32IMC chip. The C6 adds an LP
(low-power) RISC-V core alongside the main HP core, both with
slightly different memory maps. From a reverse engineering
standpoint they look like ARM Cortex-M with a different ISA.

Memory map for ESP32-C3:

| Address                       | Region                       |
|-------------------------------|------------------------------|
| `0x40000000–0x40060000`       | ROM                          |
| `0x40380000–0x403E0000`       | IROM (cache, flash-mapped)   |
| `0x4037C000–0x40380000`       | IRAM                         |
| `0x3FC80000–0x3FCE0000`       | DRAM                         |
| `0x42000000–0x42800000`       | DROM (rodata, flash-mapped)  |
| `0x60000000–0x600D0000`       | Peripherals                  |

The image format is the same Espressif format as ESP32 (Chapter 14).
The same multi-segment loading approach applies. ROM symbol files
exist in ESP-IDF under `components/esp_rom/esp32c3/ld/`.

## BL602 specifics

Bouffalo Lab's BL602 is a single-core RV32IMAC at 192 MHz with an
802.11 b/g/n WiFi MAC integrated. Memory map highlights:

* Flash mapped at `0x23000000`
* ITCM (instruction tightly-coupled memory) at `0x22020000`
* DTCM at `0x42008000`
* SRAM at `0x42000000`
* Peripherals at `0x40000000`

The vendor SDK is open-source (`bl_iot_sdk`). Build the SDK once
and use it as a signature source.

## Generic RV32IMAC microcontroller flow

Without a vendor-specific BSP, the flow is:

1. Load with the right `-c` (rv32imac for most chips).
2. The first interesting code is at the reset vector, which on most
   RV32 microcontrollers is the address pointed to by `mtvec` after
   reset — if you have no boot ROM symbols, find it by looking at
   the start of the loaded image. The vendor's startup file usually
   begins with a `j` (jump) to the actual entry, sometimes preceded
   by a few interrupt vectors.
3. The reset handler typically sets `gp` (global pointer):

   ```text
   .option push
   .option norelax
   1: auipc gp, %pcrel_hi(__global_pointer$)
      addi  gp, gp, %pcrel_lo(1b)
   .option pop
   ```

   If you see `auipc gp, ...; addi gp, gp, ...` near the start, that
   is `gp` initialisation. After that, accesses through `gp` reach
   `.sdata` and `.sbss`.
4. After `gp`, the reset handler clears `.bss`, copies `.data` from
   flash to RAM, then calls `main`.

A typical RISC-V function prologue:

```text
addi  sp, sp, -0x20      ; allocate stack frame
sw    ra, 0x1c(sp)       ; save return address
sw    s0, 0x18(sp)       ; save frame pointer
addi  s0, sp, 0x20       ; new frame pointer
...
lw    s0, 0x18(sp)       ; restore
lw    ra, 0x1c(sp)
addi  sp, sp, 0x20
ret
```

Compressed forms are common and shorter:

```text
c.addi sp, -0x20
c.sw   ra, 0x1c(sp)
c.sw   s0, 0x18(sp)
c.addi s0, sp, 0x20
...
c.lw   s0, 0x18(sp)
c.lw   ra, 0x1c(sp)
c.addi sp, 0x20
c.jr   ra
```

R2 displays both with the same readability.

## CSRs (Control and Status Registers)

RISC-V CSRs are accessed with the `csrr*` family:

```text
csrr  a0, mstatus           ; read CSR into a0
csrw  mtvec, a0             ; write a0 to CSR
csrrs a0, mie, a1           ; read mie, then set bits in a1
csrrc a0, mie, a1           ; read mie, then clear bits in a1
```

CSR numbers (12-bit) and names are part of the spec:

* `mstatus` (0x300), `misa` (0x301), `mie` (0x304), `mtvec` (0x305)
* `mscratch` (0x340), `mepc` (0x341), `mcause` (0x342)
* `mip` (0x344)
* `mhartid` (0xF14) — hart ID; useful for SMP code

Vendor-specific CSRs in the `0x7Cx` and `0xBCx` ranges are common. ESP32-C
chips use these for vendor extensions; values come from the
`riscv-private.h` headers in ESP-IDF.

R2 decodes CSR access correctly for the standard set; for vendor CSRs
you may see `csrr a0, 0x7c1` instead of a name. Annotate with `CC`
(comments).

## Instructions worth recognising

A few RISC-V idioms that throw newcomers:

**Computed branch:**

```text
auipc t0, 0x1            ; t0 = pc + 0x1000
jalr  zero, 0x234(t0)    ; jump to t0 + 0x234, no return
```

This is how a non-PIE binary does a long branch. R2 resolves the
target and shows it as a single-line `j` if you have analysis enabled.

**Constant materialisation:**

```text
lui   a0, 0x12345         ; upper 20 bits
addi  a0, a0, 0x678       ; lower 12 bits -> a0 = 0x12345678
```

A2 ESL (and decompilers) collapse this to `a0 = 0x12345678`.

**`jal zero` is an unconditional jump:**

```text
jal   zero, label         ; equivalent to "j label"
```

R2 shows it as `j label`. Some compilers prefer the explicit form.

**Tail call:**

```text
tail other_function       ; pseudo-instruction for: la t1, other_function; jr t1
```

`tail` does not push `ra`; the called function returns directly to
the original caller. Decompilers handle this correctly; pay
attention when reading raw disassembly.

## RISC-V gotchas

**The `c` extension's compressed instructions can confuse stack
analysis.** If a function has both compressed and uncompressed
instructions, automatic stack-frame recovery occasionally picks the
wrong frame size. Verify with `afv` and re-run `afta` if it looks
wrong.

**Position-independent code uses `auipc` heavily.** Every reference
to a global variable starts with `auipc xN, %hi(symbol)`. R2
resolves these correctly when the binary is loaded at the right
address. If references look off, double-check `-m`.

**RISC-V vector extension (`v`) is rare in microcontrollers** but
appears in some HPC-class chips. R2's vector decoding is
incomplete on older versions; if you see undecoded vector
instructions, update r2 from git.

**Interrupt vector layout differs.** Standard RISC-V uses a single
trap vector (`mtvec` direct mode) with software dispatch on
`mcause`. Some vendor extensions (CLIC, CLINT-vectored) use a
table of vectors instead. ESP32-C3 uses CLIC; the layout is in the
TRM.

**Calling convention for floats.** Soft-float (no `F` extension):
floats pass in `a0..a7`. Hard-float (`F`/`D`): floats in `fa0..fa7`.
Mismatched assumptions ruin decompiler output for FP-heavy code.

## Building a RISC-V signature DB

The same approach as Chapter 10 works:

1. Build the vendor SDK (esp-idf, bl_iot_sdk, NuttX, Zephyr) for your
   target with the same toolchain version.
2. Run `aaa` on each `.o` from the build.
3. `zg @@f` then `zo` to save.
4. Load against unknown firmware and `z/`.

Espressif publishes pre-built `.a` archives for each release; using
those directly skips building.

The general rule: RISC-V is the *easiest* of the embedded
architectures to read once you have the right `-c` and the right
load address. The decoder is straightforward, the calling convention
is regular, and the literal-pool tricks of ARM are largely absent
(replaced by the simpler `auipc + addi`/`auipc + lw` pair). It is a
nice architecture to learn r2 on.
