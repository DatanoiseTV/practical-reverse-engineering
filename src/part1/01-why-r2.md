# The Reverse Engineering Landscape

Reverse engineering is one skill expressed through different tools.
This chapter is about that landscape: what the tools are, which to
reach for in which situation, and why this book uses radare2 as its
running example.

## The shape of the problem

Open up a typical desktop binary in any disassembler and you get a
useful session within seconds: ELF or PE headers, a clean entry point,
named sections, often debug info, well-defined calling conventions,
libraries with public symbols. Most modern reverse-engineering tools
were originally built for that environment.

Open a typical embedded binary — let's say you've just dumped 4 MiB
of SPI flash from a smart plug — and the picture is different:

* The file has no header. No magic, no ELF, no nothing. It's a raw
  image, and you're guessing the load address.
* The CPU is some variant you've barely heard of. Xtensa LX6 with
  windowed registers. RISC-V with vendor extensions. An 8051
  derivative with banked XDATA. A Cortex-M with a private bus and
  TrustZone-M peripheral split.
* If there are symbols, they're a stripped C runtime and your ROM's
  bootloader, not the application code.
* The image is multi-stage: the first 64 KiB is a bootloader that
  sets up RAM and jumps to a second-stage that decodes the
  third-stage out of flash.
* Half the addresses in the disassembly point to memory-mapped
  peripherals, not RAM. Until you tell the disassembler that
  `0x40021000` is the RCC peripheral on an STM32F4, the references
  are noise.

You need tools that cooperate with all of this rather than fighting
it. The Linux-userland case is easier (ELFs, glibc/musl, well-known
ABIs), but the same RE skills apply, plus its own crop of problems
(packers, anti-debug, stripped daemons, position-independent code,
malware-style obfuscation).

This book aims to teach the underlying skill while showing it in
action across both worlds.

## The tools you might use

A short, opinionated survey of the working reverse engineer's
toolkit. Each tool is covered in more depth later in the book
(particularly Chapter 25).

**radare2** — open-source, scriptable, multi-architecture. Best
coverage of obscure architectures (Xtensa, 8051, MIPS variants,
RISC-V vendor extensions). Command-line first; visual mode is fast
once the keys are in your fingers. Free, MIT-licensed.

**Ghidra** — NSA's open-source platform. The decompiler is the best
free one available. Java-based GUI, slow startup, large but
well-supported. Free, Apache 2.0. The `r2ghidra` plugin embeds
Ghidra's decompiler inside radare2, so even radare2-primary users
get Ghidra-quality decompilation. For very large or complex C++
binaries, a standalone Ghidra session is often still the better
choice.

**IDA Pro** — Hex-Rays's commercial flagship. Industry standard for
years. Best decompiler (Hex-Rays). Mature plugins. Expensive
($1000–$10000+ depending on feature pack). Free tier (IDA Free)
covers x86/x64/ARM but is limited.

**Binary Ninja** — Vector 35's commercial tool. Beautiful UI, good
decompiler (HLIL), excellent Python API, reasonable pricing
(~$1500). Popular with security researchers who want a polished
daily driver.

**Cutter** — a Qt GUI for radare2. Open source, looks closer to IDA
than to plain radare2. Good for visual exploration; for scripting
and reproducible workflows, plain radare2 is better.

**binwalk** — the first command you run on any unknown blob.
Scans for embedded magic numbers, file systems, certificates,
compression formats. Open source.

**Capstone / Keystone / Unicorn** — sister projects from Quynh
Nguyen Anh. Capstone disassembles, Keystone assembles, Unicorn
emulates. All multi-architecture, all scriptable. Use them when you
need disassembly/assembly/emulation in your own script and don't
want to drive a full disassembler.

**Qiling** — Python framework on top of Unicorn that emulates whole
binaries including system calls. For "I have a Linux binary, I want
to run it on macOS without a VM," Qiling is the tool.

**Frida** — dynamic instrumentation across Linux, macOS, Windows,
iOS, Android. Inject JavaScript into a running process to hook
functions, modify behaviour, log return values. The fastest way to
understand what a Linux daemon does without static analysis.

**esptool, flashrom, probe-rs, OpenOCD, J-Link tools** — hardware
interaction. Read flash, write flash, halt the CPU, attach a
debugger. Essential when the binary is in silicon rather than on
disk.

**Sigrok / Saleae / DSView** — logic analyser software. For
capturing the wire protocol between an MCU and a sensor or flash.

**YARA, BinDiff, Diaphora** — pattern matching, binary diffing.
For triage, malware classification, and version-to-version analysis.

**LLM coding assistants** (Claude Code, ChatGPT, Cursor, Aider) —
for naming functions in bulk, suggesting structure recovery,
writing one-off scripts, and accelerating the reading of decompiler
output. Covered in Chapter 28 along with the verification discipline
that keeps them honest.

## Why this book uses radare2 in examples

Every working chapter has to pick a primary tool to show commands
in, otherwise the prose becomes uselessly abstract — "use your
disassembler's xref function" doesn't teach anything. This book
chose radare2 for four reasons:

1. **Coverage.** It supports every architecture in this book without
   add-on processor modules. ARM (32 and 64-bit, Thumb and Thumb-2),
   MIPS (big and little endian, MIPS16 and microMIPS), x86 in all
   modes, RISC-V, Xtensa (including ESP32 windowed registers), 8051,
   AVR, PowerPC, SPARC, SH, m68k, MSP430, TriCore, and more.

2. **Free and open.** No license cost; no per-architecture upgrade
   fees; runs on any operating system you can compile C on. For
   community contributions (zignatures, plugins, scripts), there is
   no licensing friction.

3. **Scripting story.** `r2pipe` gives you a Python (or JavaScript,
   Rust, Go) handle to a live radare2 session in 10 lines of code.
   Chapter 24 covers it in detail.

4. **Embeddable decompiler.** Through `r2ghidra`, you get Ghidra's
   decompiler quality without leaving the radare2 session.

The choice is pragmatic. None of the chapters depend on radare2 in
a way that makes the content useless to a Ghidra or IDA user — the
architectural details, vector layouts, ABI gotchas, file formats,
and workflow patterns all transfer. The radare2-specific commands
are just the concrete examples that make the prose land.

## When to use what

A rough decision tree the book returns to in Chapter 25:

| Situation                                                            | Best choice                              |
|----------------------------------------------------------------------|------------------------------------------|
| Unknown blob, no metadata                                            | binwalk + cpu_rec + entropy, then load   |
| Polished GUI from day one                                            | Binary Ninja or Cutter                   |
| Heavy C++ binary, decompiler quality is bottleneck                   | Ghidra (standalone) or IDA + Hex-Rays    |
| Niche embedded architecture (Xtensa, 8051, MSP430, …)                | radare2                                  |
| Emulate one function in isolation                                    | ESIL (in r2), Unicorn, or Qiling         |
| Live instrument a running process (Linux/macOS/Android)              | Frida                                    |
| Read/write hardware flash                                            | esptool, flashrom, OpenOCD, probe-rs     |
| Capture a wire protocol                                              | Logic analyser + Sigrok/Saleae           |
| Compare two firmware versions                                        | BinDiff, Diaphora, or r2pipe-scripted    |
| Scan many binaries for a pattern                                     | YARA                                     |
| Bulk-name functions or recover structure                             | LLM (Claude/Cursor) with verification    |
| Reverse engineer an entire OS-on-chip Linux router image             | binwalk to extract + radare2 per binary  |
| Daily-driver disassembly for a paid commercial engagement            | IDA + Hex-Rays (industry standard)       |

You will almost never reach the "one true tool" answer. Most
serious reverse-engineering work uses three or four tools in
rotation, picking each for the job it does best. This book aims to
make you fluent in that rotation, with radare2 as the cohesive thread.

## How to read this book

If you are new to reverse engineering or to radare2, read Parts I
and II in order. The command grammar chapter (Chapter 3) is short
and feels redundant until you realise the entire rest of the tool
follows the same pattern; once it clicks, the rest of the book
reads faster.

If you have used radare2 before, skim Part I, read the sections of
Part II that match work you actually do, and dive into the
architecture chapter for your current target. The architecture
chapters are deliberately self-contained: each one starts from "I
have a binary for this CPU" and walks through loading, analysis, the
gotchas specific to that platform, and a worked example.

If you came primarily from IDA or Ghidra, start with Chapter 25
(the broader toolkit) to see where radare2 fits next to your daily
driver, then read whatever architecture chapter matches your current
target. The radare2 commands won't transfer one-to-one, but the
architectural content will.

The appendices are a reference, not a tutorial. Use them while
working.
