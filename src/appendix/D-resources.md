# Further Reading

The reverse-engineering and embedded-systems communities are
fragmented across blogs, conference talks, GitHub repositories, and
mailing lists. This appendix is a curated entry-point list. None of
the items below is exhaustive; each is a doorway to a larger
ecosystem.

## radare2 itself

**Project home.** `https://www.radare.org` and the GitHub
organisation `radareorg`. The book of references is
`https://book.rada.re` — the official online manual, longer than
this book and written by the project maintainers.

**Plugins.** `r2pm -l` lists everything r2pm knows about. The
GitHub organisation has separate repositories for each major plugin
(`r2ghidra`, `r2dec`, `r2frida`, `r2papi`, etc.).

**Issue tracker and discussion.** GitHub Issues for bugs;
GitHub Discussions and the project's Telegram group for usage
questions. Maintainers are responsive.

**Conferences.** "r2con" runs annually with talks on r2 internals,
plugin development, and reverse-engineering case studies. Talks are
on YouTube.

## General reverse engineering

**Practical Reverse Engineering** by Bruce Dang, Alexandre Gazet,
Elias Bachaalany. Covers ARM, x86, and Windows kernel topics.
Foundational text.

**The IDA Pro Book** by Chris Eagle. Even if you do not use IDA,
much of the material on disassembly and analysis transfers directly.

**Practical Binary Analysis** by Dennis Andriesse. Modern,
covers binary instrumentation and dynamic analysis well.

**Reverse Engineering for Beginners** by Dennis Yurichev. Free
PDF, comprehensive, focused on x86 but with ARM and MIPS chapters.
A great companion to this book.

## Embedded-specific

**The Designer's Guide to the Cortex-M Processor Family** by Trevor
Martin. The single best book on Cortex-M architecture from a
firmware-developer perspective; everything reverse engineers need
to know about M-profile is in here.

**Embedded Systems Architecture** by Daniele Lacamera. Modern
embedded-systems textbook; useful for understanding the runtime
your target firmware sits on.

**Hardware Hacking Handbook** by Colin O'Flynn and Jasper van
Woudenberg. Side-channel attacks, fault injection, glitching;
the hardware-security companion to this book.

## ARM

* **ARM Architecture Reference Manual (ARM ARM)** — the canonical
  spec. Free PDF from arm.com. There are separate volumes for ARMv6-M,
  ARMv7-M, ARMv8-M, ARMv7-A, ARMv8-A. Read the relevant one for your
  target.
* **ARM Cortex-M3 / -M4 / -M7 Reference Manuals** — practical
  references shorter than the architecture reference manual.
* **STM32 Reference Manuals** (RM0008, RM0090, RM0440, etc.) —
  per-family register-level documentation. Indispensable for STM32
  RE.
* **Nordic nRF52 Product Specification** documents.
* **Microchip / Atmel SAMD datasheets**.

## RISC-V

* **The RISC-V Reader** by David Patterson and Andrew Waterman. Short,
  excellent introduction to the architecture.
* **RISC-V Instruction Set Manual Vol I (Unprivileged ISA)** and
  **Vol II (Privileged Architecture)**. Free from
  `riscv.org/specifications`.
* **ESP32-C3 Technical Reference Manual** — for the Espressif RV32
  variant. Espressif also publishes ROM symbol mappings on GitHub.

## Xtensa / ESP

* **Xtensa Instruction Set Architecture (ISA) Reference Manual** —
  Cadence document, available with registration. Also in some
  Espressif repositories.
* **ESP32 Technical Reference Manual** — comprehensive (~700 pages),
  free from Espressif. Same for ESP32-S2, S3, C3, C6, P4.
* **ESP-IDF Programming Guide** — for understanding the SDK that
  most ESP firmware is built on. The "internal" sections of the guide
  document things ESP firmware reverse engineers care about (memory
  layout, partition table, FreeRTOS port).
* **`espressif/esp-idf`** GitHub repository — the source of the SDK.
  Reading SDK code is faster than guessing what reverse-engineered
  ESP code is doing.

## MIPS

* **MIPS Architecture for Programmers Vol. I (Introduction), II
  (Instruction Set), III (Privileged Resource Architecture)** —
  free from MIPS, currently from `mips.com`. Different volumes for
  MIPS32 R1/R2 and R6.
* **See MIPS Run** by Dominic Sweetman — the MIPS programmer's
  reference. Excellent for understanding the architecture from a
  C-programmer's perspective.

## 8051

* **Intel MCS-51 Microcontroller Family User's Manual** — the
  original. Still distributed by Intel.
* **The 8051 Microcontroller and Embedded Systems** by Mazidi et al.
  — the textbook most universities use; covers architecture and
  programming idioms in depth.
* **Vendor TRMs** for any specific 8051 derivative (Nordic
  nRF24LE1, Cypress / Infineon FX2/FX3, Texas Instruments CC2540,
  etc.).

## Linux on ARM / MIPS

* **Linux Kernel Development** by Robert Love (older but still
  excellent for understanding the kernel's architecture).
* **Linux Device Drivers** (LDD3) by Corbet, Rubini, Kroah-Hartman
  — free online. Covers the driver model that you reverse engineer
  in Chapter 18.
* **The Linux Source Tree** — `git.kernel.org`. For any kernel
  module you are reversing, the matching source is often online.
* **OpenWrt documentation** — excellent for routers.

## Decompilation theory

* **Decompilation: A Comprehensive Survey** by Cifuentes (PhD thesis
  and book). The foundational academic work on decompilation.
* **Practical C Decompilation** by Eilam et al. (chapters in
  *Reversing: Secrets of Reverse Engineering*).

## Tools and ecosystem

* **Ghidra documentation** — `https://ghidra-sre.org/`. Project
  page, downloads, manual. The "Ghidra Class" course material on
  GitHub is free and excellent.
* **Binary Ninja documentation** — `https://docs.binary.ninja/`.
  Even if you do not have a license, the documentation has good
  examples of HLIL.
* **IDA documentation** — Hex-Rays publishes manuals; the IDA
  Pro book covers more.
* **Frida documentation** — `https://frida.re/`. Many examples.
* **Unicorn / Capstone / Keystone** — three sister projects from
  Quynh Nguyen Anh. Excellent docs and Python examples.
* **Qiling Framework** — `https://qiling.io/`.
* **angr** — `https://angr.io/`. Symbolic execution platform.
  Heavy lift to learn but powerful.

## Vulnerability research and CTFs

* **CTFtime** — `https://ctftime.org`. Many CTFs include embedded
  reverse-engineering challenges. Working through challenge writeups
  is one of the fastest ways to learn.
* **Embedded CTF** specifically — MITRE eCTF, organised annually,
  focused on embedded security.
* **OST2 (Open Security Training)** — free courses on x86 RE,
  ARM RE, malware analysis. The ARM course is excellent.

## Conferences worth following (talks on YouTube)

* **DEF CON** — Hardware Hacking Village, Embedded Systems Village.
* **Black Hat** — yearly, technical embedded talks.
* **Recon (Recon Montréal, Recon Brussels)** — RE-focused
  conference; many embedded talks.
* **Hardwear.io** — hardware security focused.
* **r2con** — radare2 community conference.
* **Chaos Communication Congress (CCC)** — broad hacker culture
  conference; consistently strong embedded RE content.
* **EmbeddedFOSS / FOSDEM Embedded** — for the open-source
  embedded ecosystem side.

## Datasets and corpora

* **Firmadyne / Firmware Analysis Plus (FACT)** — datasets and
  emulation frameworks for IoT firmware research.
* **Awesome Embedded RE** — `https://github.com/fkie-cad/awesome-embedded-and-iot-security`
  — a curated list of resources, tools, and writeups.
* **Vendor SDK repositories on GitHub** — Espressif, Nordic, ST,
  NXP, TI, and others publish their SDKs. Building these gives you
  signature DBs (Chapter 10).

## Learning paths

If you are new to embedded reverse engineering, a reasonable
12-month learning path:

1. Months 1–2: Read this book in full. Pick one architecture
   (Cortex-M is the most common starting point) and reverse engineer
   one open-source firmware end-to-end as practice.
2. Months 3–4: Read Practical Reverse Engineering and the relevant
   ARM ARM volume cover-to-cover. Reverse engineer a vendor-shipped
   firmware (your router, your IoT thermostat) without consulting the
   source.
3. Months 5–6: Pick up a second architecture (Xtensa/ESP32 or RISC-V)
   and repeat. Write your first r2pipe scripts.
4. Months 7–9: Get a hardware debug probe; learn dynamic analysis.
   Try to find a real bug in a vendor firmware.
5. Months 10–12: Pick a niche (router security, IoT crypto, BLE
   reverse engineering, fault injection). Go deep. Publish what
   you find.

The skill plateaus stop being about the tool around year 2; from
then on the bottleneck is the breadth of architectures, vendors, and
silicon you have hands-on familiarity with.

## A closing note

Reverse engineering is a craft that compounds. Every new binary you
read teaches you a pattern that helps with the next. Every script
you write becomes part of a library you reuse. Every architecture
you learn opens up another class of targets. The tools matter; the
discipline matters more; the time on task matters most.

If this book helps you spend that time more productively, it has
done its job. The community that built radare2 and the larger
ecosystem of free reverse-engineering tools is the reason embedded
research is accessible at all. Contribute back when you can — file
bugs, fix bugs, write zignatures and share them, document the chips
nobody else has documented yet. The next person opening a binary
they have never seen before will thank you.
