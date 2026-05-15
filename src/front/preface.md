# Preface {-}

Reverse engineering embedded firmware is a different sport from reversing
desktop or server binaries. The targets are smaller, the symbols are gone,
the file formats are weirder, and the assumption that you can just `objdump`
something and get sensible output is wrong about half the time. The CPU might
be a 1980s 8051 derivative pretending to be a Bluetooth chip, an Xtensa core
spliced into an SoC by a company that never published the ABI, or a stock
ARM Cortex-M with the vector table relocated by the bootloader so the addresses
in the disassembly point nowhere useful until you do the math yourself.

This handbook is about doing that work with **radare2** — the open-source,
scriptable, multi-architecture reverse engineering framework that runs on
basically anything and gets out of your way. Other tools have prettier UIs.
Some have stronger decompilers (Ghidra, IDA). None match radare2's
breadth of architecture support, scripting story, and command-line workflow
once you have the muscle memory.

The book is for working engineers: firmware developers who want to understand
the binary their toolchain spits out, security researchers chasing IoT
vulnerabilities, hardware hackers who just dumped a SPI flash and don't know
where the entry point is, and embedded reverse engineers who already use
radare2 occasionally and want to use it well.

## What this book covers {-}

The book is organised into five parts plus appendices.

**Part I — Foundations** brings you from "I have radare2 installed" to
"I can navigate a binary fluently". You will learn the command grammar
(it is not like other disassemblers; it has a logic you have to internalise),
how to load both well-formed ELFs and raw firmware blobs, and how to drive
the analysis pipeline.

**Part II — Static Analysis Toolkit** covers the tools you use every day
once the binary is loaded: function recovery, type and structure annotation,
decompilation through `r2ghidra` and `r2dec`, symbol recovery, and
cross-reference following.

**Part III — Architectures** is the largest part, with one chapter each for
ARM Cortex-M, ARM Cortex-A and Linux userland, Xtensa (the ESP32 family),
RISC-V (ESP32-C-series, BL602, generic RV32), 8051, MIPS (the workhorse of
consumer routers), and a chapter on Linux device drivers and the device
tree (DTB/DTS) — because once you reach a Cortex-A SoC, the device tree
is often the only honest documentation of the hardware you have.

**Part IV — Firmware Workflows** is the part you reach for when the binary
is not an ELF: how to load a raw flash dump, reconstruct a memory map from
vector tables and MMIO accesses, dissect a multi-stage bootloader, debug
with OpenOCD/J-Link/QEMU through r2's gdb remote, emulate selected functions
with ESIL when you have no hardware, and write patches that actually fit.

**Part V — Automation and Practice** covers `r2pipe` scripting (Python and JS)
and a final chapter of caveats, gotchas, and the question of when to switch
to a different tool. Some bugs in radare2 will bite you; some are won't-fix.
Knowing which is which saves hours.

The **appendices** are designed to live next to your keyboard: a command
cheatsheet organised by task, a per-architecture quick reference for
registers and calling conventions, a file-format reference for ELF, the
ESP image format, UF2, Intel HEX, S-Record, and the flattened device tree,
and a curated list of further reading.

## Conventions {-}

Code, commands, and radare2 console interactions are set in a monospace
font. Radare2 sessions are shown with the prompt that radare2 itself uses,
so you can paste them into your own session unchanged:

```text
[0x08000000]> aaa
[0x08000000]> pdf @ main
```

Shell commands are shown with a `$` prompt:

```text
$ r2 -a arm -b 16 -m 0x08000000 firmware.bin
```

C source, disassembly, and decompiler output are clearly labelled.

Three callouts appear throughout the book:

::: note
A **Note** explains background context, points to related material, or
clarifies a point that is easy to misread.
:::

::: tip
A **Tip** is a workflow shortcut — something that will save you time
once you know it.
:::

::: warning
A **Warning** flags a footgun: a command that will silently corrupt
your project file, an analysis option that hides bugs, a per-architecture
gotcha that has cost real engineers real days.
:::

## Versions {-}

The book targets **radare2 5.9.x** (the current stable line at time of
writing). The vast majority of commands have been stable for years and
will continue to work; where a feature is recent or unstable, the text
calls it out.

For decompilation, the book covers both **r2ghidra** (a port of Ghidra's
decompiler that runs entirely inside r2) and **r2dec** (a smaller native
JavaScript decompiler). Where output differs meaningfully, both are shown.

## Acknowledgements {-}

The radare2 ecosystem exists because of a long line of contributors who
chose to publish hard, niche, often thankless tooling for free. If this
book has any value, that value is theirs first.
