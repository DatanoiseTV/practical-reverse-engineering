# Preface {-}

Reverse engineering is the discipline of recovering meaning from a
binary you did not write. It is a single discipline, even though the
targets and tools look very different. A stripped Linux daemon, a
1980s 8051-derived Bluetooth chip, a raw flash dump from an
appliance, a Windows DLL, an ESP32 OTA image, a vendor's WiFi
driver: the surface details differ, but the underlying skill —
loading the bytes correctly, recognising functions and data
structures, following control and data flow, naming what you find,
patching when you must — is the same.

This book teaches that skill across a deliberately wide spread of
targets. The embedded side is covered in depth (it is where most
practical work happens these days and where the tooling stories are
weirdest), but the same chapters teach how to attack Linux userland
binaries, kernel modules, router firmware, and anything else you
load.

## Tools

Every chapter has to choose a primary tool to show commands in, or
the prose becomes uselessly abstract. This book chooses **radare2**
as the running example for one reason: it is the only fully free,
fully open, fully scriptable disassembler that covers every
architecture in this book without paid add-ons. The command grammar
takes an hour to internalise (Chapter 3) and the rest comes easily.

That choice is pragmatic, not exclusive. Where another tool does the
job better — Ghidra for heavy decompilation on large C++ binaries,
IDA Pro for industry-standard polish, Binary Ninja for cleaner UI,
Frida for live instrumentation, binwalk for triage, Unicorn for
emulation, Capstone/Keystone for scripting, esptool and OpenOCD for
hardware interaction — the book says so and tells you when to reach
for what. Chapter 25 surveys the broader toolkit; the per-target
chapters call out tool alternatives inline; the LLM chapter
(Chapter 28) covers using AI coding assistants for reverse
engineering work.

If you arrive at this book using IDA or Ghidra primarily, you can
treat radare2 as a complementary tool worth knowing. The architecture
chapters' content (vector table layouts, calling conventions, ABI
gotchas, instruction encoding traps) transfers to any disassembler,
and the playbook chapter (Chapter 29) is entirely tool-neutral.

## Audience

This book is for working engineers: firmware developers who want to
understand the binary their toolchain spits out, security researchers
chasing IoT and Linux vulnerabilities, hardware hackers who just
dumped a SPI flash and don't know where the entry point is,
malware analysts working on Linux samples, and anyone moving into
embedded reverse engineering from desktop RE work.

Some prior exposure to assembly is assumed — you should at least
know what a register and a calling convention are. You do not need
to have used radare2 before; Part I starts from "I have it installed
and don't know what to type".

## What this book covers

The book is organised into five parts plus appendices.

**Part I — Foundations** brings you from "I have my tools installed"
to "I can navigate a binary fluently". The chapters cover installing
the radare2 ecosystem, the command grammar (it is not like other
disassemblers; there is a logic you have to internalise), how to
load both well-formed ELFs and raw firmware blobs, and how to drive
the analysis pipeline.

**Part II — Static Analysis Toolkit** covers the tools you use every
day once the binary is loaded: function recovery, type and structure
annotation, decompilation through r2ghidra and r2dec (and notes on
when to switch to a standalone Ghidra session), symbol recovery via
zignatures, and cross-reference following.

**Part III — Architectures** has one chapter each for ARM Cortex-M,
ARM Cortex-A and Linux userland, Xtensa (the ESP32 family), RISC-V
(ESP32-C-series, BL602, generic RV32), 8051, MIPS (the workhorse of
consumer routers), and a chapter on Linux device drivers and the
device tree (DTB/DTS) — once you reach a Cortex-A or MIPS SoC, the
device tree is often the only honest documentation of the hardware
you have.

**Part IV — Firmware and Linux Workflows** covers raw-image loading,
bootloaders and OTA blobs, dynamic analysis (GDB-remote, OpenOCD,
J-Link, ESIL emulation), patching and re-flashing, mapping unknown
boards via a pin-announcer firmware trick, and a chapter on Linux
userland reverse engineering specifically — stripped daemons, libc
fingerprinting, packers, anti-debug, and the patterns that show up
in Linux malware.

**Part V — Automation, Tools, and Practice** covers `r2pipe` scripting,
the broader toolkit (Ghidra, IDA, Binary Ninja, Cutter, binwalk,
Capstone/Keystone/Unicorn, Qiling, Frida, esptool, OpenOCD, probe-rs,
flashrom, Sigrok/Saleae, YARA, BinDiff/Diaphora), a chapter of generic
reverse-engineering techniques that apply across every target
(compiler fingerprinting, crypto recognition, C++ vtables and RTTI,
runtime allocators, anti-disassembly defeat), LLM-assisted reverse
engineering with verification discipline, the reverse engineer's
playbook (recognition patterns, naming/note discipline, magic-number
tables, dead-code hunting), and a final chapter of caveats, gotchas,
and pitfalls.

**Part VI — Hardware Attacks** covers what to do when the chip
refuses to cooperate through normal channels: fault injection and
glitching (voltage, clock, EM), side-channel analysis (SPA, DPA, CPA,
timing attacks), and a survey of less-known hardware tricks and
pitfalls (debug ports left in production, vendor boot ROM behaviour,
flash and OTP gotchas). The chapters are grounded in published
research and the available open-source tooling (ChipWhisperer,
JTAGulator) rather than invented exploits.

**Part VII — Protocols and Fuzzing** turns from passive analysis to
active interaction with the device under test. Chapters cover USB
protocol reverse engineering (descriptors, capture with Wireshark
and dedicated analysers, libusb / pyusb scripting), CAN bus and
automotive ECU work (SocketCAN, OBD-II, UDS over ISO-TP, security
access, firmware extraction), Bluetooth and BLE (GAP/GATT, the
Nordic nRF Sniffer and Ubertooth, bleak scripting, pairing and
encryption), and fuzzing embedded targets (re-hosting with
HALucinator / Fuzzware / Avatar2, protocol fuzzing with boofuzz,
crash triage, and real-world published results).

The **appendices** are designed to live next to your keyboard: a
command cheatsheet organised by task, a per-architecture quick
reference for registers and calling conventions, a file-format
reference, and a curated list of further reading.

## Conventions

Code, commands, and console sessions are set in a monospace font.
Radare2 sessions are shown with the prompt that radare2 itself uses,
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

Four callouts appear throughout the book:

::: note
A **Note** explains background context, points to related material,
or clarifies a point that is easy to misread.
:::

::: tip
A **Tip** is a workflow shortcut — something that will save you time
once you know it.
:::

::: warning
A **Warning** flags a footgun: a command that will silently corrupt
your project file, an analysis option that hides bugs, a
per-architecture gotcha that has cost real engineers real days.
:::

::: caution
A **Caution** flags something more serious than a warning: a
destructive operation, an irreversible chip configuration, a hardware
risk.
:::

## Versions

The book targets the **radare2 6.x line** (current as of writing) and
was verified against r2 6.1.4. The vast majority of commands have
been stable since the 5.x series; where a feature is recent,
deprecated, or unstable, the text calls it out.

For decompilation, the book covers both **r2ghidra** (a port of
Ghidra's decompiler that runs entirely inside r2) and **r2dec** (a
smaller native JavaScript decompiler). Where output differs
meaningfully, both are shown. Standalone Ghidra is recommended in
Chapter 25 for cases where the in-r2 decompiler falls short.

## Acknowledgements

The radare2 ecosystem, the Ghidra project, the binwalk maintainers,
and the long line of open-source reverse-engineering tool authors
exist because they chose to publish hard, niche, often thankless
tooling for free. If this book has any value, that value is theirs
first.
