# Architecture Quick Reference

Per-architecture summary of registers, calling conventions, and the
disassembly idioms you see most often. Use as a desk reference.

## ARM Cortex-M (ARMv6-M / ARMv7-M / ARMv8-M, Thumb only)

**Registers:**

| Reg     | Role                                                        |
|---------|-------------------------------------------------------------|
| r0–r3   | argument registers, return in r0 (and r1 for 64-bit return) |
| r4–r11  | callee-saved                                                |
| r12 (ip)| intra-procedure scratch                                     |
| r13 (sp)| stack pointer                                               |
| r14 (lr)| link register (return address)                              |
| r15 (pc)| program counter                                             |
| s0–s31         | single-precision FP (Cortex-M4F has SP-only FPv4-SP) |
| d0–d15         | double-precision FP (Cortex-M7 with FPv5-D16 only)   |

**Calling convention (AAPCS):**

* args: r0..r3, then stack
* return: r0 (r0:r1 for 64-bit)
* stack alignment: 8 bytes at function entry
* hard-float: float args in s0..s15

**Common prologue:**

```text
push {r4-r7, lr}        ; save callee-saved + lr
sub  sp, #N             ; allocate locals
```

**Common epilogue:**

```text
add  sp, #N
pop  {r4-r7, pc}        ; restore + return
```

**Memory map (architecture):**

| Range                       | Contents                          |
|-----------------------------|-----------------------------------|
| `0x00000000–0x1FFFFFFF`     | code                              |
| `0x20000000–0x3FFFFFFF`     | SRAM                              |
| `0x40000000–0x5FFFFFFF`     | peripherals                       |
| `0x60000000–0x9FFFFFFF`     | external RAM                      |
| `0xA0000000–0xDFFFFFFF`     | external device                   |
| `0xE0000000–0xE00FFFFF`     | Private Peripheral Bus (PPB) — SCS (NVIC, SysTick, SCB) sub-range at `0xE000E000–0xE000EFFF` |
| `0xE0100000–0xFFFFFFFF`     | vendor-specific                   |

**Vector table (first words at flash base):**

1. Initial SP
2. Reset vector
3. NMI
4. HardFault
5. MemManage (M3+)
6. BusFault (M3+)
7. UsageFault (M3+)
8. SecureFault (M33+) / reserved
9-11. reserved
12. SVCall
13. DebugMon
14. reserved
15. PendSV
16. SysTick
17+. external IRQs (vendor-defined)

## ARM Cortex-A AArch32

Same calling convention as Cortex-M. Adds:

* ARM mode (32-bit instructions) in addition to Thumb
* Coprocessor instructions (`MRC`, `MCR`)
* NEON SIMD (q0..q15)
* MMU, FPU as standard

## ARM Cortex-A AArch64

**Registers:**

| Reg       | Role                                |
|-----------|-------------------------------------|
| x0–x7     | arguments, return in x0/x1          |
| x8        | indirect result location            |
| x9–x15    | temporary (caller-saved)            |
| x16–x17   | intra-procedure scratch             |
| x18       | platform register (sometimes)       |
| x19–x28   | callee-saved                        |
| x29 (fp)  | frame pointer                       |
| x30 (lr)  | link register                       |
| sp        | stack pointer (separate from x31)   |
| xzr       | zero register                       |
| v0–v31    | SIMD/FP                             |

**Calling convention (AAPCS64):**

* args: x0..x7 integer, v0..v7 FP
* return: x0 (x1 for 128-bit), v0
* stack alignment: 16 bytes

**Common prologue:**

```text
stp x29, x30, [sp, #-N]!     ; push fp + lr, allocate frame
mov x29, sp                  ; new fp
```

**Common epilogue:**

```text
ldp x29, x30, [sp], #N       ; restore + dealloc
ret
```

## Xtensa LX6/LX7 (ESP32 family)

**Registers:**

| Reg          | Role                                     |
|--------------|------------------------------------------|
| a0           | return address                           |
| a1 (sp)      | stack pointer                            |
| a2..a7       | arguments (windowed ABI)                 |
| a2..a5       | return values (up to 16 bytes)           |
| a8..a15      | local temporaries                        |
| (physical)   | up to 64 physical ARs; only 16 visible at once via the window |

**Calling convention (windowed):**

* `CALL4/8/12 label` slides the window by 4, 8, or 12 registers
* args in a2..a7
* return in a2..a5
* `RETW` returns and slides window back

**Common prologue:**

```text
ENTRY a1, N             ; allocate N bytes, slide window
```

**Common epilogue:**

```text
RETW.N
```

**ESP32 memory map highlights:**

| Range                        | Region                       |
|------------------------------|------------------------------|
| `0x40000000–0x4005FFFF`      | ROM                          |
| `0x40080000–0x4009FFFF`      | IRAM                         |
| `0x3FFB0000–0x3FFFFFFF`      | DRAM                         |
| `0x400D0000–0x40400000`      | Flash code (cached)          |
| `0x3F400000–0x3F800000`      | Flash data (cached)          |

## RISC-V RV32 (with C extension; ESP32-C, BL602, generic)

**Register names (ABI):**

| ABI    | Reg | Role                       |
|--------|-----|----------------------------|
| zero   | x0  | hardwired 0                |
| ra     | x1  | return address             |
| sp     | x2  | stack pointer              |
| gp     | x3  | global pointer             |
| tp     | x4  | thread pointer             |
| t0–t2  | x5–x7   | temporaries (caller-saved) |
| s0/fp  | x8  | saved / frame pointer      |
| s1     | x9  | saved                      |
| a0–a1  | x10–x11 | args / return          |
| a2–a7  | x12–x17 | args                   |
| s2–s11 | x18–x27 | callee-saved           |
| t3–t6  | x28–x31 | temporaries            |

**Calling convention:**

* args: a0..a7 (8 args in regs)
* return: a0 (a1 for 64-bit on RV32)
* callee-saved: s0..s11
* stack: 16-byte aligned (typically)

**Common prologue:**

```text
addi  sp, sp, -N
sw    ra, (N-4)(sp)
sw    s0, (N-8)(sp)
addi  s0, sp, N
```

**Common epilogue:**

```text
lw    s0, (N-8)(sp)
lw    ra, (N-4)(sp)
addi  sp, sp, N
ret                     ; pseudo for jalr zero, 0(ra)
```

**Compressed (`c` ext) prefix on instructions:** `c.` — half-size
encoding of common operations.

## MIPS32 (O32 ABI, big-endian common)

**Register names:**

| ABI         | Number | Role                              |
|-------------|--------|-----------------------------------|
| `$zero`     | 0      | hardwired 0                       |
| `$at`       | 1      | assembler temp                    |
| `$v0–$v1`   | 2–3    | return values                     |
| `$a0–$a3`   | 4–7    | args                              |
| `$t0–$t7`   | 8–15   | temporaries (caller-saved)        |
| `$s0–$s7`   | 16–23  | callee-saved                      |
| `$t8–$t9`   | 24–25  | temporaries; $t9 holds called fn  |
| `$k0–$k1`   | 26–27  | kernel-reserved                   |
| `$gp`       | 28     | global pointer (caller-saved in PIC O32) |
| `$sp`       | 29     | stack pointer                     |
| `$fp / $s8` | 30     | frame pointer / saved             |
| `$ra`       | 31     | return address                    |

**Calling convention (O32):**

* args: $a0..$a3, then stack
* return: $v0 (and $v1 for 64-bit)
* callee-saved: $s0..$s7, $sp, $fp, $ra
* `$gp`: caller-saved in PIC O32, constant in non-PIC code
* first 16 bytes of caller's stack reserved for arg spill

**Common prologue:**

```text
addiu $sp, $sp, -N
sw    $ra, (N-4)($sp)
sw    $fp, (N-8)($sp)
move  $fp, $sp
```

**Common epilogue:**

```text
move  $sp, $fp
lw    $fp, (N-8)($sp)
lw    $ra, (N-4)($sp)
addiu $sp, $sp, N
jr    $ra
nop                     ; delay slot
```

**Branch delay slots** — the instruction after every branch executes
before the branch is taken.

## 8051

**Registers:**

| Reg      | Role                                                |
|----------|-----------------------------------------------------|
| A        | accumulator                                         |
| B        | secondary, used by MUL/DIV                          |
| R0–R7    | banked register set (4 banks of 8)                  |
| DPTR     | data pointer (16-bit, often DPL/DPH split)          |
| SP       | stack pointer (in IDATA)                            |
| PSW      | program status (carry, register bank select, etc.)  |

**SFRs (special function registers)** at IDATA addresses 0x80–0xFF.
Layout chip-specific. Standard SFRs: P0/P1/P2/P3 (ports), TCON/TMOD
(timers), SCON/SBUF (UART), IE (interrupt enable), IP (priority).

**Calling convention varies by compiler:**

* SDCC: first arg in DPL/DPH for pointer, R7 for char, R7:R6 for int
* Keil C51: args in R7..R3 then memory

**Memory spaces:**

* CODE — flash, read-only at runtime
* IDATA — internal RAM (256 bytes max in classic)
* XDATA — external RAM (up to 64 KiB)
* SFR — special function registers (in IDATA upper half)
* BIT — bit-addressable region

**Common access patterns:**

```text
MOV A, #imm                   ; load immediate
MOVX A, @DPTR                 ; load XDATA
MOVC A, @A+DPTR               ; load CODE (table lookup)
LCALL addr                    ; long call
RET                           ; return
```

## Common opcode magic numbers (first byte)

For raw byte identification:

| First byte | Likely meaning                             |
|------------|--------------------------------------------|
| `7F 45 4C 46` | ELF                                     |
| `02 00 00 EA` | ARM unconditional branch (early ARM image) |
| `27 BD FF E0` | MIPS BE `addiu $sp, -0x20`              |
| `E0 FF BD 27` | MIPS LE same                            |
| `13 ...` or `17 ...` | RISC-V RV32I uncompressed `OP-IMM` / `AUIPC` (low 2 bits = `11`) |
| any byte with low 2 bits `00`/`01`/`10` | RISC-V compressed (RVC) |
| `36 41 00` | Xtensa `entry a1, 0x20` (windowed entry)    |
| `02 xx xx` | 8051 `LJMP` (vector table start)            |
| `E9 xx xx xx xx` | x86 32-bit jump                       |
| `E9` (single byte) | ESP image header magic              |
| `1F 8B`   | gzip                                         |
| `42 5A 68` | bzip2                                       |
| `FD 37 7A 58 5A 00` | xz                                 |
| `28 B5 2F FD` | Zstandard                               |
| `89 50 4E 47 0D 0A 1A 0A` | PNG                          |

## Endianness check shortcuts

For an unknown blob, decode the first 4 bytes as both endiannesses
and check which yields a sensible instruction:

* If big-endian decode is `addiu $sp, $sp, -N` (MIPS frame
  allocation): MIPS BE.
* If little-endian decode is the same: MIPS LE.
* If little-endian decode is a Cortex-M `push` followed by `sub sp`:
  Thumb LE.
* If decode looks like nothing in the candidate ISA: try the other
  endianness, then a different ISA.

## Standard exception/interrupt vector ordering

**Cortex-M (first 16 vectors after SP):**

NMI, HardFault, MemManage, BusFault, UsageFault, [reserved×4], SVC,
DebugMon, [reserved], PendSV, SysTick.

**RISC-V (CLINT mode):**

A single trap handler (`mtvec`); software dispatches on `mcause`.

**RISC-V (vectored mode):**

Trap base + N×4 entries, indexed by `mcause` low bits (interrupt
number).

**MIPS:**

Single exception vector (typically `0x80000180`); software dispatches
on `Cause` register.

**8051:**

Reset (0x0000), IE0 (0x0003), TF0 (0x000B), IE1 (0x0013), TF1
(0x001B), RI/TI (0x0023), TF2/EXF2 (0x002B). Vendor-extended
interrupts at higher addresses.
