# Disassembly Tweaks, Hints, and Architecture Overrides

The default disassembly is rarely the disassembly you want. This chapter
covers the knobs that turn r2's output from "technically correct" into
"actually readable", plus the hints you use to override decisions r2
made wrongly.

## What "good disassembly" looks like

Open a function with the default settings and you typically see:

```text
[0x08001234]> pdf @ sym.main
            ; CALL XREF from sym.reset_handler @ 0x080001fa
┌ 64: int main (void);
│           0x08001234      80b5           push {r7, lr}
│           0x08001236      82b0           sub sp, 8
│           0x08001238      00af           add r7, sp, 0
│           0x0800123a      4ff48050       mov.w r0, 0x1000
│           0x0800123e      00f0c5fa       bl sym.HAL_Init
...
```

That is fine for a 5-line scratch read. For sustained work it is too
busy: the bytes column is noise once you trust the disassembly, the
addresses are too small to scan quickly, and there is no comment column.

A reasonable working configuration:

```text
e asm.bytes = false              # hide bytes column
e asm.cmt.right = true           # comments go to the right
e asm.cmt.col = 60               # column to start comments
e asm.lines.width = 14           # branch arrow width
e asm.flags.middle = 2           # show flags inline at function entry
e asm.var.summary = false        # show full var list at function top
e asm.fcnsig = true              # function signature header line
e asm.calls = true               # call comments inline
e asm.refptr = true              # resolve pointers shown as immediates
e asm.hint.cjmp = true           # mark conditional jumps
e asm.tabs = 0                   # spaces, not tabs
e asm.tabs.once = true           # one tab between mnemonic and operands
e asm.bb.middle = false          # don't show "bb start" in middle of fn
```

After applying these (`eco` themes set most of them), the same function
becomes:

```text
┌ int main (void);
│ 0x08001234      push {r7, lr}
│ 0x08001236      sub sp, 8
│ 0x08001238      add r7, sp, 0
│ 0x0800123a      mov.w r0, 0x1000
│ 0x0800123e      bl HAL_Init                    ; sym.HAL_Init
...
```

Quieter. Still all the information.

## Architecture overrides

Sometimes r2 picked the wrong architecture for a region. Common cases:

* ARM Cortex-M binary with a small ARM-mode bootloader at the start and
  Thumb everywhere else.
* MIPS binary with a few MIPS16 functions for size-constrained interrupt
  handlers.
* RISC-V binary that uses compressed (RVC) instructions in some files
  and full RV32I in others.

Override at the byte level with `ahb` (asm hint bits):

```text
[0x...]> ahb 32 @ 0x08000000     # ARM mode for the bootloader
[0x...]> ahb 16 @ 0x080001cd     # Thumb from here on
[0x...]> ahb 16 @ 0x08001234..0x080013ff   # Thumb for a range
```

For MIPS16 in a MIPS binary:

```text
[0x...]> ahb 16 @ 0x80020000     # MIPS16 here
[0x...]> ahb 32 @ 0x80020100     # back to standard MIPS
```

For RISC-V compressed-only stretches:

```text
[0x...]> aha rvc @ 0x...         # treat as compressed
```

After setting hints, run `aaa` again to re-decode and re-discover
functions in the now-correct mode.

::: tip
Hints persist in r2 projects, so once you have hinted the boundaries
correctly, every future session loads them. This is one of the strongest
reasons to use projects — re-discovering the ARM/Thumb boundary every
session burns time you do not get back.
:::

## Per-instruction tweaks

There are many `ah*` commands. The most useful in daily work:

| Command       | Meaning                                                       |
|---------------|---------------------------------------------------------------|
| `ahb N`       | bits at address (16/32/64)                                    |
| `aha mov`     | force the decoder to interpret as a different instruction     |
| `aho ret`     | set the instruction "type" (call, jmp, ret, …)                |
| `ahi h`       | display immediate as hex (also `b`, `o`, `d`)                 |
| `ahi 8`       | display immediate as 8-bit char                               |
| `ahi p`       | display immediate as pointer (resolve to flag)                |
| `ahS .text`   | set syntax variant                                            |
| `ahd "label"` | display this address with a custom label                      |
| `ahf`         | jump-to address override                                      |
| `ahc 0x...`   | call destination override                                     |
| `ahs N`       | byte size override                                            |
| `ahF N`       | offset format width                                           |

`ahd` is underrated. Use it to label MMIO accesses:

```text
[0x...]> ahd "RCC->APB1ENR" @ 0x4002101c
```

Now every disassembly line that loads `0x4002101c` shows `RCC->APB1ENR`
instead of the bare hex. Combined with `f` flags (named addresses), you
get a peripheral map that reads like real C.

## Marking data inside code

Embedded firmware is full of literal pools — short blocks of constants
embedded in `.text` so that 32-bit immediates can be loaded with a
PC-relative `LDR`. ARM Thumb especially. Without help, r2 will
disassemble the literal pool as if it were code and produce garbage:

```text
0x080012a0      .word 0x40023800        ; r2 doesn't know this
0x080012a4      .word 0x00000001        ; ditto
0x080012a8      bl HAL_Init
```

…unless you tell it. The `Cd` family marks bytes as data:

```text
[0x...]> Cd 4 @ 0x080012a0     # 4 bytes of data here
[0x...]> Cd 4 @ 0x080012a4
```

`Cd 4` is "decode this as a 4-byte word". Use `Cd 1`, `Cd 2`, `Cd 8`
for other sizes. `Cs` marks a string. `Cf` marks a struct.

R2 should auto-detect literal pools after `aaa`, but it sometimes misses
them, especially if the compiler scattered them in odd places. The
"random nonsensical instructions in the middle of an otherwise sensible
function" smell is almost always an unmarked literal pool.

Bulk-mark a range:

```text
[0x...]> Cd 4 @@= 0x080012a0 0x080012a4 0x080012a8
[0x...]> CC- @@= 0x080012a0..0x080012c0    # remove all metadata in range
```

## ARM-specific: distinguishing data and code more aggressively

ARM has a concept of "mapping symbols" (`$a`, `$t`, `$d`) that ELFs
sometimes carry. R2 reads them. If your binary has them, ARM/Thumb
boundaries are picked up automatically.

For binaries without mapping symbols, set:

```text
[0x...]> e anal.armthumb = true
[0x...]> e asm.flags.real = true
```

…then run `aaa`. R2 will use heuristics on call destinations (the low
bit of a Thumb call is set; the low bit of an ARM call is clear) to
infer the mode for each function.

## Architecture-specific syntax variants

Some architectures support multiple disassembly syntaxes. The big ones:

| Arch    | Syntaxes available                                       |
|---------|----------------------------------------------------------|
| x86     | `intel` (default), `att`, `masm`, `nasm`, `jz`           |
| ARM     | `unified` (default), `divided`                           |
| MIPS    | `o32`, `o32-mips32r6`                                    |
| 8051    | `intel-syntax`, `nec-syntax`                             |

Switch with:

```text
[0x...]> e asm.syntax = att      # x86 in AT&T syntax
[0x...]> e asm.syntax = unified  # ARM unified
```

Set per-function with `ahS`:

```text
[0x...]> ahS att @ sym.foo
```

::: warning
Mixing syntaxes within one binary makes the disassembly hard to read
even for experts. Pick one and stick to it. The default is almost
always the right choice; the only time to switch is when you are
copying disassembly into a tool that expects the other syntax (e.g.,
GAS source).
:::

## Sanity-checking after a tweak

Every time you set a hint or override a tweak, do a quick read to
make sure it did what you wanted:

```text
[0x...]> ah                      # list all active hints
[0x...]> ah @ 0x08001234         # hints at this address
[0x...]> ah- @ 0x08001234        # delete a hint
[0x...]> ah-*                    # delete all hints (careful)
```

`ah*` (with `*` suffix) outputs the hints as r2 commands you can save
and replay — useful if you want to share your hint set with a colleague
or commit it to a script.

Once your disassembly reads cleanly, the rest of the static-analysis
toolkit (functions, types, decompilation, signatures) becomes much more
productive — those tools assume the disassembly underneath is right.
