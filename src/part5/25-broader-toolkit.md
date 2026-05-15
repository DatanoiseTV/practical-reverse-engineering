# The Broader Toolkit

Radare2 is the spine of an embedded reverse-engineering workflow,
not the whole skeleton. Every working reverse engineer carries a
small kit of complementary tools — for unpacking, for decompilation,
for emulation, for hardware interaction, for triage of unknown blobs.
This chapter is a tour of the tools you will reach for alongside r2,
what each is good at, what each is bad at, and how they integrate.

## The triage kit

Tools you run before you even open r2.

### binwalk

`binwalk` scans a file for embedded magic numbers — image headers,
filesystems, compression formats, archives, certificates, public
keys, vendor blobs — and reports their offsets. For any new binary,
binwalk is the first command:

```text
$ binwalk firmware.bin
DECIMAL  HEXADECIMAL  DESCRIPTION
0        0x0          uImage header, ...
64       0x40         LZMA compressed data
1572864  0x180000     Squashfs filesystem
2621440  0x280000     Certificate, public key (RSA 2048)
```

Useful flags:

* `-A` — opcode-based architecture detection.
* `-E` — entropy analysis (find compressed/encrypted regions).
* `-e` — extract everything binwalk recognises.
* `-Me` — recursive extract (dig into archives within archives).

binwalk is a single Python tool with a long list of plugins; it is
also wrong sometimes (false positives on random byte patterns that
happen to match a magic). Treat its output as hints to verify.

### sasquatch / unsquashfs / unyaffs / fmk

For squashfs: `unsquashfs` unpacks; `sasquatch` is a fork that
handles non-standard variants common in router firmware.

For YAFFS2: `unyaffs`.

For full router-firmware repacking: **firmware-mod-kit** (`fmk`)
includes tools to extract, modify, and repack OEM firmware images
preserving the proprietary header.

### entropy and statistics

For unknown blobs:

```text
$ binwalk -E firmware.bin            # entropy plot
$ ent firmware.bin                   # statistical tests
$ cpu_rec.py firmware.bin            # architecture by byte n-gram
```

`ent` reports entropy, chi-square distance from uniform, and several
other statistics. High entropy + chi-square close to uniform = likely
compressed or encrypted. Low entropy + bias = probably code or
text.

### file / strings / xxd

The classics:

```text
$ file firmware.bin                  # rough type guess
$ strings firmware.bin | less        # all printable strings
$ strings -n 16 firmware.bin         # only strings ≥ 16 chars
$ xxd firmware.bin | less            # hex dump
$ hexyl firmware.bin | less          # prettier hex dump
```

For embedded work, `strings -n 8 -e l` (8+ chars, little-endian
UTF-16) sometimes pulls strings out that the default ASCII pass
misses, especially in firmware that uses Microsoft-style wide chars.

## Other disassemblers and decompilers

### Ghidra

NSA's open-source reverse-engineering platform. Free, GPL, widely
used. Strengths:

* Best free decompiler.
* Excellent type system and structure recovery.
* Headless mode for scripting (`analyzeHeadless`).
* Wide architecture support, including odd ones (TriCore, V850, AVR).

Weaknesses:

* JVM startup is slow.
* GUI is heavy.
* Project files are large.
* Scripting is Java or Jython (Python 2-ish syntax).

When to use Ghidra alongside r2:

* You need decompilation that r2ghidra cannot produce (very large
  functions, complex C++ exception unwinding).
* You want Ghidra's analysis "for free" via `analyzeHeadless` and
  then export results to r2.

Ghidra and r2 can interoperate via:

* **r2ghidra** — Ghidra's decompiler inside r2 (Chapter 9).
* **GhidraScript** — Java/Jython scripts in Ghidra that emit r2
  commands you can paste into your r2 session.
* **BinExport** — a Ghidra plugin that exports the analysis to a
  protobuf that other tools can consume.

### IDA Pro

Hex-Rays's commercial flagship. Industry standard for many years,
still excellent. Strengths:

* Best decompiler in the industry (Hex-Rays).
* Mature plug-in ecosystem.
* Great UI.
* IDA-Python is straightforward.

Weaknesses:

* Expensive.
* Closed source.
* Architecture support varies; some embedded targets are weak or
  require add-on processor modules.

For commercial reverse-engineering work where the decompiler quality
on big C++ binaries matters, IDA is the gold standard. For
hobbyists and security researchers, the price is prohibitive; the
free version (IDA Free) covers x86/x64/ARM but is limited.

### Binary Ninja

Vector 35's modern, polished commercial reverse-engineering tool.
Strengths:

* Beautiful UI.
* Good decompiler (HLIL is unique and powerful).
* Excellent Python API.
* Headless mode included in Commercial license.
* Reasonable price compared to IDA.

Weaknesses:

* Newer than IDA, fewer integrations.
* Some niche architectures via community plugins only.

Many security researchers use Binary Ninja as their daily driver
for x86 and ARM Linux work and r2 for everything embedded. The
two complement each other.

### Cutter

A Qt GUI front-end for r2. Open source, pre-packaged with a
modified version of r2 underneath. Looks and feels closer to IDA
than to plain r2.

When to use Cutter: when you want r2's analysis power but cannot
get used to the command line. For visual exploration, Cutter is
genuinely pleasant; for scripting and reproducible workflows, plain
r2 is better.

### Iaito

The radare2 project's own Qt front-end (forked from an older
Cutter and kept aligned with mainline r2). Smaller community,
closer feature parity with r2.

## Emulation and instrumentation

### Unicorn Engine

A multi-architecture CPU emulator written in C, with bindings for
most languages. Lightweight, fast, easy to embed. Use it when:

* You want to emulate a single function in isolation.
* You want to fuzz a parser without standing up the whole binary.
* You want to precompute a constant by running an obfuscated
  decoder.

Unicorn does not include peripherals; you mock memory and let the
code run. For embedded targets where the function under test does
no peripheral I/O, Unicorn is faster than QEMU and easier than
ESIL.

### Qiling

A Python framework on top of Unicorn that emulates whole binaries
including OS-level concepts (system calls, file I/O, library calls).
Supports Linux, Windows, macOS, BSD, plus several embedded
formats (UEFI, MBR bootloaders, MIPS bare-metal, even DOS COM).

For "I have a Linux binary, I want to run it on macOS without a
Linux VM", Qiling is the tool. It handles the syscalls
transparently. For embedded, its "MCU mode" can run bare-metal
firmware with a degree of peripheral mocking.

### QEMU and Renode

Already covered (Chapter 21). QEMU is the universal hardware
emulator; Renode is the higher-fidelity embedded-systems emulator.

### Frida

Dynamic instrumentation. Inject JavaScript into a running process
to hook functions, modify behavior, dump arguments, log return
values, replace functions wholesale. Works on Linux, macOS,
Windows, iOS, Android.

For embedded Linux (router firmware running on real hardware or in
QEMU), Frida is the fastest way to understand what a black-box
binary does without static analysis. Hook every `socket`,
`recvfrom`, `send`, and watch the wire protocol assemble in real
time.

```javascript
// frida script
Interceptor.attach(Module.findExportByName(null, "recvfrom"), {
    onEnter(args) { this.buf = args[1]; this.len = args[2]; },
    onLeave(retval) {
        if (retval.toInt32() > 0)
            console.log("recv:", hexdump(this.buf, {length: retval.toInt32()}));
    }
});
```

## Hardware interaction

### esptool.py

The reference tool for ESP family chips. Read flash, write flash,
extract image info, dump fuses, verify signatures.

```text
$ esptool.py --chip esp32 read_flash 0 0x400000 dump.bin
$ esptool.py --chip esp32 image_info firmware.bin
$ esptool.py --chip esp32 erase_flash
$ esptool.py --chip esp32 write_flash 0x10000 firmware.bin
```

### OpenOCD

Already covered (Chapter 21). The Swiss Army knife of debug probes.

### probe-rs

A Rust-native replacement for OpenOCD, focused on Cortex-M. Faster
to start, cleaner UX, GDB-compatible. Good default choice for new
Cortex-M projects.

```text
$ probe-rs run --chip stm32f407vgtx firmware.elf
```

### avrdude

For AVR chips, the standard programming and debugging tool.

### urjtag / openocd / mpsse

For raw JTAG access (boundary scan, reading IDs, manipulating IO
during a halted scan), these handle the low-level stuff.

### flashrom

Reads and writes raw SPI flash chips. The standard tool for SPI
ROM dumps using a USB SPI programmer (CH341A, FT2232H, Bus Pirate).

```text
$ flashrom --programmer ch341a_spi -r dump.bin
```

Once you have `dump.bin`, hand it to binwalk and r2 (Chapter 19).

### Logic analysers and protocol decoders

Saleae Logic, Sigrok (open-source), and various clones. For
firmware reverse engineering, a logic analyser is invaluable for:

* Capturing the host-device protocol of an unknown peripheral.
* Confirming a hypothesis about what GPIO toggles mean.
* Decoding SPI/I2C/UART traffic between the MCU and a sensor or
  flash.

Sigrok includes protocol decoders for dozens of common protocols.
Saleae Logic has a slick UI and supports custom decoders in
Python.

## Static analysis and pattern matching

### Capstone

A multi-architecture disassembler library. Used as the disassembly
backend in many tools (including older versions of binwalk's `-A`
flag). When you want to disassemble in a script without invoking r2:

```python
from capstone import *
md = Cs(CS_ARCH_ARM, CS_MODE_THUMB)
for i in md.disasm(b"\x80\xb5\x82\xb0", 0x08001234):
    print(f"0x{i.address:x}: {i.mnemonic} {i.op_str}")
```

### Keystone

The assembler counterpart of Capstone. Multi-architecture, scriptable
assembler:

```python
from keystone import *
ks = Ks(KS_ARCH_ARM, KS_MODE_THUMB)
encoding, _ = ks.asm("mov r0, #1; bx lr")
print(bytes(encoding).hex())   # 0120... bytes ready to write
```

### YARA

Rules-based pattern matching for binary files. Common uses in
reverse engineering:

* Identify packers, compilers, or known malware families.
* Scan a firmware image for known crypto-library signatures
  (mbedTLS, OpenSSL, wolfSSL).
* Identify a specific RTOS by signatures of its scheduler.

A small example:

```text
rule freertos_scheduler {
    strings:
        $a = "vTaskSwitchContext"
        $b = "xQueueGenericSend"
        $c = "configMINIMAL_STACK_SIZE"
    condition:
        2 of them
}
```

```text
$ yara freertos.yar firmware.bin
freertos_scheduler firmware.bin
```

YARA does not modify the binary; it only reports matches. Combine
with r2pipe to act on matches programmatically.

### dwarf2json, addr2line, objdump

The GNU binutils. For ELF binaries with debug info:

```text
$ addr2line -e firmware.elf 0x080012a0
src/main.c:142
```

`objdump -h` lists sections; `objdump -d` disassembles; `objdump -t`
shows the symbol table; `objdump -p` reads program headers; `objdump
-r` reads relocations.

`readelf` is the more modern variant with cleaner output.

For DWARF debug info specifically, `dwarfdump` (in many distros) and
`pyelftools` (Python library) parse the type information r2 can
sometimes import.

## Diffing and version comparison

### BinDiff

Zynamics's (Google's) binary diffing tool. Free as of recent
versions. Compares two binaries function-by-function with
structural similarity scoring; visualises matched/unmatched/changed
functions.

For firmware version analysis (what changed between v1.0 and v1.1?),
BinDiff is the standard. Workflow:

1. Disassemble both versions in IDA, Ghidra, or via BinExport.
2. Run BinDiff on the resulting `.BinExport` files.
3. Open the result; review matched-but-changed functions to find the
   actual code changes.

For r2 users, the workflow is more manual — see the diff script in
Chapter 24 — but you can also export r2 analysis to a format
BinDiff understands via `BinExport`.

### Diaphora

An open-source IDA plugin for binary diffing. Comparable to BinDiff
in approach, free, IDA-only. If you have IDA and need diffing,
Diaphora is the practical choice.

## When to reach for what

A rough decision tree:

* **Unknown blob, no metadata** -> binwalk + cpu_rec + entropy +
  strings. Then load the right pieces in r2.
* **Want a polished GUI** -> Ghidra (free) or Binary Ninja
  (commercial).
* **Decompilation quality is the bottleneck** -> r2ghidra inside r2,
  or standalone Ghidra. For C++, IDA's Hex-Rays.
* **Need to emulate a function in isolation** -> ESIL (in r2),
  Unicorn (lightweight, multi-arch), Qiling (whole-binary).
* **Need to instrument a live binary** -> Frida.
* **Need to read or write hardware flash** -> esptool, flashrom,
  OpenOCD.
* **Need to debug live silicon** -> OpenOCD or probe-rs + r2's
  GDB-remote.
* **Need to capture a wire protocol** -> logic analyser + Sigrok or
  Saleae Logic.
* **Need to compare two firmware versions** -> BinDiff (with IDA or
  Ghidra), Diaphora (IDA), or scripted diff in r2pipe.
* **Want to scan many binaries for a pattern** -> YARA.

The skill is not knowing every tool deeply; it is knowing which one
to reach for in each situation, so that the tool fits the problem
rather than the problem being twisted to fit the tool.
