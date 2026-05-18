# Changelog

All notable changes to this book are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions
follow [Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-05-18

First public release. ~290 pages, 30 chapters + 4 appendices.
Web edition built with VitePress; PDF built with Pandoc + Tectonic.

### Contents

- **Front matter:** preface positioning the book as cross-tool with
  radare2 as the primary running example, conventions, audience.
- **Part I — Foundations** (6 chapters): the reverse-engineering
  landscape and tool survey; installation and the r2pm ecosystem;
  the command grammar; loading binaries (ELF, raw blobs, Intel HEX,
  S-Record, UF2, ESP image, vendor containers); the analysis
  pipeline; visual mode and panels.
- **Part II — Static Analysis Toolkit** (5 chapters): disassembly
  tweaks and hints; functions, types, and structures; decompilation
  with r2ghidra and r2dec; symbol recovery and zignatures; strings,
  cross-references, and data flow.
- **Part III — Architectures** (7 chapters): ARM Cortex-M (STM32,
  nRF52, SAMD); ARM Cortex-A and Linux userland; Xtensa (ESP32,
  ESP32-S2/S3); RISC-V (ESP32-C, BL602, generic RV32); 8051; MIPS
  (routers and embedded Linux); Linux device drivers and the device
  tree (DTB/DTS).
- **Part IV — Firmware and Linux Workflows** (6 chapters): loading
  raw images (memory map / vector table / MMIO recovery);
  bootloaders, image headers, and OTA blobs; dynamic analysis with
  GDB-remote, OpenOCD, J-Link, and ESIL; patching and re-flashing;
  mapping unknown boards via a bit-bang-UART pin-announcer firmware;
  Linux userland reverse engineering (stripped daemons, libc
  fingerprinting, packers, anti-debug, Linux malware patterns).
- **Part V — Automation, Tools, and Practice** (6 chapters):
  scripting with r2pipe (Python and JavaScript); the broader toolkit
  (Ghidra, IDA, Binary Ninja, Cutter, binwalk, Capstone/Keystone/
  Unicorn, Qiling, Frida, esptool, OpenOCD, probe-rs, flashrom,
  Sigrok/Saleae, YARA, BinDiff/Diaphora); generic RE techniques
  (compiler fingerprinting, crypto recognition, C++ vtables and
  RTTI, runtime allocators, name demangling, anti-disassembly
  defeat, code coverage); LLM-assisted reverse engineering with
  verification discipline; the reverse engineer's playbook
  (recognition patterns, naming/note discipline, magic-number
  tables, dead-code hunting); caveats, gotchas, and pitfalls.
- **Appendices** (4): command cheatsheet organised by task,
  architecture quick reference, file format reference, and further
  reading.

### Verified against

- radare2 6.1.4
- r2ghidra and r2dec (current as of release date)
- Pandoc 3.9.0.2
- Tectonic 0.16.9
- Eisvogel template 3.4.0

### Notes

Technical claims in the architecture chapters were audited against
authoritative vendor sources (ARM Architecture Reference Manuals,
STM32 RM0090, Nordic nRF52 product spec, Espressif ESP32/C3/S2/S3
TRMs, RISC-V unprivileged + privileged ISA specs, MIPS Architecture
for Programmers, Intel MCS-51 manual, Devicetree Specification v0.4,
Linux kernel source). File-format details were cross-checked against
the primary specs (UF2, esptool, U-Boot image.h, ELF gABI, RFC 1952,
RFC 8878). Errata reported during the audit pass were applied before
this release.

### Build pipeline

Pandoc + Eisvogel LaTeX template + Lua filter for tinted callout
boxes (note / tip / warning / caution); `build.sh` and `Makefile`;
CC BY-SA 4.0 license; README.
