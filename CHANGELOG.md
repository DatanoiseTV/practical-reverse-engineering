# Changelog

All notable changes to this book are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions
follow [Semantic Versioning](https://semver.org/).

## [1.2.0] — 2026-05-18

Added Part VII — Protocols and Fuzzing (4 new chapters):

- **Chapter 34 — USB Protocol Reverse Engineering.** USB
  descriptor model and standard classes (HID, CDC, MSC, DFU).
  Capture with Wireshark + usbmon (Linux), USBPcap (Windows),
  hardware analysers (Total Phase Beagle, Ellisys, LeCroy).
  Talking back with libusb / pyusb / hidapi. Walks through DFU
  as a special case and documents the vendor-protocol RE
  workflow. Cites MouseJack, hardware-wallet SDKs, OpenRGB-class
  community work.
- **Chapter 35 — CAN Bus and Automotive ECU Reverse Engineering.**
  CAN physical layer (ISO 11898), higher-layer protocols (ISO-TP,
  UDS ISO 14229, OBD-II ISO 15765-4, SAE J1939). SocketCAN +
  can-utils + SavvyCAN workflow. DBC files and OpenDBC. UDS
  service catalogue (sessions, SecurityAccess, RequestUpload).
  ECU firmware extraction overview. Cites Miller / Valasek Jeep
  research, comma.ai OpenPilot, Car Hacker's Handbook. Includes
  a legal note on US DMCA vehicle-RE exemptions.
- **Chapter 36 — Bluetooth and BLE Protocol Reverse Engineering.**
  BLE stack (PHY, LL, HCI, L2CAP, ATT, GATT, SMP, GAP). Tool
  landscape: nRF Connect mobile, bleak (Python), nRF Sniffer,
  Ubertooth, btlejack. Workflow against unknown peripherals.
  Pairing and encryption (LE Legacy vs Secure Connections).
  Cites SweynTooth (NTU), KNOB / BLURtooth / BLESA attacks,
  hardware-wallet research, smart-lock vulnerabilities, Tesla
  BLE relay research.
- **Chapter 37 — Fuzzing Embedded Targets.** Why embedded
  fuzzing is hard; four practical approaches (host-side parser
  fuzzing, whole-firmware emulation, re-hosting with synthetic
  peripherals, protocol fuzzing). Tools: AFL++, libFuzzer,
  boofuzz, Avatar2. Re-hosting tools: HALucinator (USENIX 2020),
  P²IM (USENIX 2020), Fuzzware (USENIX 2022), µAFL, GENESIS.
  Crash detection on embedded; triage workflow. Real published
  results.

Repo topics added: usb-protocol, bluetooth, ble, can-bus,
automotive-security, fuzzing.

Bumped version 1.1.0 → 1.2.0 (semver MINOR: new chapters added
without restructuring existing content).

## [1.1.0] — 2026-05-18

Added Part VI — Hardware Attacks (3 new chapters):

- **Chapter 31 — Fault Injection and Glitching.** Voltage, clock,
  electromagnetic, and laser fault injection. Tool landscape
  (ChipWhisperer, ChipSHOUTER, Riscure Inspector). Target
  preparation, glitch parameter search, trigger setup. Documented
  real-world results with citations (LimitedResults ESP32 / nRF52
  bypasses, Kraken Security Labs Trezor PIN-counter glitch, STM32
  RDP downgrade research, smartcard glitch literature).
  Mitigations and defensive design patterns.
- **Chapter 32 — Side-Channel Analysis.** Timing attacks (Kocher),
  Simple / Differential / Correlation Power Analysis, EM analysis,
  cache-timing context. Tool landscape (ChipWhisperer, lascar by
  Ledger Donjon, Riscure Inspector). Worked workflow against a
  software AES-128 implementation. Defences (constant-time,
  masking, hiding).
- **Chapter 33 — Hardware Tricks, Backdoors, and Less-Known
  Pitfalls.** Debug interfaces left enabled in production
  (JTAGulator, Glasgow Interface Explorer, Bus Pirate). Vendor
  boot ROMs (STM32 System Bootloader, NXP ISP, SAM-BA, ESP ROM
  bootloader, RP2040 BOOTSEL, Allwinner FEL). Flash erase bias /
  read margin / OTP irreversibility / mass-erase surprises.
  Vendor-specific recovery and test modes. "Encrypted" firmware
  with hardcoded keys. Bench-discipline pitfalls.

Repo metadata: removed page-count references from descriptions
(book grows with each release; stating a specific number invites
inaccuracy). Added repo topics: chipwhisperer, fault-injection,
hardware-security, side-channel-analysis.

## [1.0.0] — 2026-05-18

First public release. 30 chapters plus 4 appendices, organised
into five parts. Web edition built with VitePress; PDF built with
Pandoc + Tectonic.

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
