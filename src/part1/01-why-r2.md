# Why radare2 for Embedded

Embedded reverse engineering rewards tools that are scriptable, portable,
and not picky about file formats. Radare2 is all three. This chapter makes
the case for using it as your primary tool, names the trade-offs honestly,
and tells you where it stops being the right answer.

## The shape of the problem

Open up a typical desktop binary in any disassembler and you get a useful
session within seconds: ELF or PE headers, a clean entry point, named
sections, often debug info, well-defined calling conventions, libraries
with public symbols. The tooling reflects that environment.

Open a typical embedded binary — let's say you've just dumped 4 MiB of SPI
flash from a smart plug — and the picture is different:

* The file has no header. No magic, no ELF, no nothing. It's a raw image,
  and you're guessing the load address.
* The CPU is some variant you've barely heard of. Xtensa LX6 with windowed
  registers. RISC-V with vendor extensions. An 8051 derivative with banked
  XDATA. A Cortex-M with a private bus and TrustZone-M peripheral split.
* If there are symbols, they're a stripped C runtime and your ROM's
  bootloader, not the application code.
* The image is multi-stage: the first 64 KiB is a bootloader that sets
  up RAM and jumps to a second-stage that XIP-decodes the third-stage
  out of flash.
* Half the addresses in the disassembly point to memory-mapped peripherals,
  not RAM. Until you tell the disassembler that `0x40021000` is the RCC
  peripheral on an STM32F4, the references are noise.

You need a tool that cooperates with all of this rather than fighting it.
Radare2 was built by people who reverse engineer firmware as their day job,
and it shows.

## What radare2 gives you

**Architecture coverage that is genuinely broad.** ARM (32 and 64-bit, Thumb
and Thumb-2), MIPS (big and little endian, MIPS16 and microMIPS), x86 in all
modes, RISC-V (32 and 64), Xtensa (LX6/LX7, including windowed register
handling), 8051, AVR, PowerPC, SPARC, SH, m68k, MSP430, PIC, V850, TriCore,
6502, Z80, EBC, and more via plugins. Some are first-class; some are good
enough to read; a few are read-only stubs. The chapters in Part III tell
you which is which for the targets the book covers.

**A file-format-agnostic loader.** ELF, Mach-O, PE, COFF, Java class, dyld
cache, a dozen firmware formats (Intel HEX, S-Record, UF2, ESP image, NSO,
RTOS-specific containers), and — when nothing else works — `r2 -m <addr>
file.bin` to load any blob at any address with any architecture. The same
analysis commands work regardless.

**A scripting story that is mature.** `r2pipe` lets you drive r2 from
Python, JavaScript, Rust, Go, Haskell, and a half-dozen other languages.
You can write a script that loads a firmware image, finds every call to
a particular function, walks the arguments, and writes a CSV — in 30 lines.
Part V has the details.

**ESIL — radare2's intermediate language and emulator.** If you can read
an instruction, r2 can usually emulate it. ESIL means you can step through
code that you have no hardware for, recover constant arguments to a
function, or partially execute a deobfuscation routine without ever
running the binary on real silicon. Chapter 20 covers ESIL in depth.

**A debugger frontend that talks to everything.** Native debugging on
Linux/macOS/Windows, GDB remote (which means OpenOCD, J-Link GDB Server,
QEMU, and Renode all work), WinDbg, native LLDB, and frida. The same
visual mode you used for static analysis works during a live debug
session, with the same shortcuts.

**It is free, MIT-licensed, and not going away.** Ghidra is free but
NSA-owned and slow. IDA is excellent but expensive and closed. Binary
Ninja is excellent and reasonably priced but commercial. Radare2 is
open, owned by the community, and has been actively developed since 2006.

## What radare2 does not give you

Honesty matters here. Radare2 is not the right tool for every job.

**The decompiler is not as strong as IDA's Hex-Rays or Ghidra's standalone.**
`r2ghidra` brings most of Ghidra's decompiler quality inside r2, which
narrows the gap considerably, and `r2dec` is fine for short functions, but
on a 5000-line C++ binary you will often want a real Ghidra session
alongside.

**The UI is not pretty.** Visual mode is functional and fast once you know
the keys, but it is not Binary Ninja's interactive graph or IDA's polished
GUI. There are forks (Iaito, Cutter — see Chapter 23) that wrap r2 in a
Qt UI, and they are usable, but if you came here for graphical comfort
this is not your tool.

**Some commands have changed names between versions.** The project moves
fast. Older blog posts will reference commands that have been renamed.
`?*~<keyword>` is your friend for finding them.

**Bugs exist.** Niche file formats, niche architectures, and combinations
of analysis flags can produce wrong output, hangs, or crashes. The
project is responsive on GitHub and the bugs typically get fixed, but
expect to file an occasional issue. Chapter 23 lists the classes of
bugs that come up most often and how to work around them.

## When to reach for something else

| Situation                                                         | Better choice                                  |
|-------------------------------------------------------------------|------------------------------------------------|
| Large C++ codebase with rich RTTI and templates                   | IDA + Hex-Rays                                 |
| Heavy collaborative reversing across a team                       | Binary Ninja with its team server, or Ghidra Server |
| Decompilation quality is the bottleneck and `r2ghidra` falls short | Standalone Ghidra                              |
| You need a polished GUI from day one                              | Cutter (r2 underneath) or Binary Ninja         |
| Hardware-assisted dynamic analysis on Windows kernel              | WinDbg + IDA                                   |
| Symbolic execution on a non-trivial scale                         | angr (which can read r2 projects)              |

For everything else — and especially for everything embedded — radare2
earns its place as the default.

## How to read this book

If you are new to radare2, read Parts I and II in order. The command
grammar chapter is short and feels redundant until you realise the entire
rest of the tool follows the same pattern; once it clicks, the rest of the
book reads faster.

If you have used r2 before, skim Part I, read the sections of Part II that
match work you actually do, and dive into the architecture chapter for
your current target. The architecture chapters are deliberately
self-contained: each one starts from "I have a binary for this CPU" and
walks through loading, analysis, the gotchas specific to that platform,
and a worked example.

The appendices are a reference, not a tutorial. Use them while working.
