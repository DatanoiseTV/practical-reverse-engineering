# Xtensa and the ESP32

Xtensa is the architecture inside Espressif's ESP8266 (Tensilica L106,
single-core), the original ESP32 (Xtensa LX6, dual-core), the ESP32-S2
(LX7, single-core), and the ESP32-S3 (LX7, dual-core). It is also inside a long tail of audio DSPs, smart-NIC
ASICs, and other custom silicon — but for embedded reverse engineers
the ESP family is the case that comes up. This chapter focuses on
ESP32 firmware specifically.

For the RISC-V ESP32 variants (C3, C6, H2, P4) see Chapter 15.

## What makes Xtensa weird

Xtensa is not weird in the way 8051 is weird (Harvard, banked, segmented,
ancient). It is weird in modern, deliberate ways:

* **Configurable ISA.** Xtensa is a "configurable processor" — Tensilica
  (now Cadence) sells the IP and customers pick which extensions to
  include. Each implementation has a slightly different ISA. ESP32's
  LX6 has the floating-point unit, MAC16, and a specific set of
  user registers; LX7 has more.
* **24-bit instructions** are common. Standard Xtensa instructions are
  24 bits; the "code density" extension adds 16-bit narrow encodings.
  Variable-length, byte-aligned. The decoder has to handle both.
* **Register windows.** This is the big one. Xtensa has up to 64
  physical AR registers, but assembly only ever names `a0..a15`; the
  window slides which physical ARs are visible under those names.
  `CALL4`, `CALL8`, `CALL12` mark a window rotation by `n/4` register
  groups (in `PS.CALLINC`); the callee's `ENTRY` instruction commits
  the rotation and allocates the stack frame. When the window
  underflows on `RETW`, exception handlers reload spilled registers
  from the caller's stack — the spill is lazy, not eager.
* **Special return.** `RETW` returns and rotates the window back.
  Standard `RET` (no window slide) is used in the non-windowed CALL0
  ABI.
* **A1 is the stack pointer**, not A15.
* **Two ABIs.** The windowed ABI is the default on ESP32 (classic) and
  ESP32-S3. The CALL0 ABI (windowless) is the *default* on ESP32-S2 and
  is selectable elsewhere for performance-sensitive or RTOS-context
  code. Per-function ABI mismatches happen and need explicit `afc`
  overrides.

For r2's purposes, the windowed ABI is what you almost always see.
R2's Xtensa support handles it, but the disassembly takes some getting
used to.

## Loading ESP32 firmware

ESP32 firmware comes in Espressif's image format. Each `.bin` has an
8-byte common header plus a 16-byte extended header (24 bytes total)
followed by 1..N segments, each with its own load address. Use **esptool.py** to inspect:

```text
$ esptool.py --chip esp32 image_info firmware.bin
File size: 1048576 (bytes)
Image version: 1
Entry point: 40080d20
Checksum: 0x4f
Validation Hash: <sha256>
2 segments

Segment 1: len 0x07b48 load 0x40080000 file_offs 0x00000018  IRAM
Segment 2: len 0x0d2a4 load 0x3ffb0000 file_offs 0x00007b68  DRAM
```

Memory regions on the original ESP32 (from the ESP32 Technical Reference
Manual, §1.3 "System and Memory"):

| Address                       | Region                        |
|-------------------------------|-------------------------------|
| `0x3FF00000–0x3FF7FFFF`       | DPort / peripheral aliases    |
| `0x3FFAE000–0x3FFFFFFF`       | DRAM (data-bus view of SRAM1+SRAM2) |
| `0x3F400000–0x3F800000`       | Flash, data-mapped (rodata)   |
| `0x40000000–0x4005FFFF`       | Internal ROM (Espressif's bootloader) |
| `0x40070000–0x4009FFFF`       | IRAM (instruction-bus SRAM0)  |
| `0x400C0000–0x400C1FFF`       | RTC fast memory               |
| `0x400D0000–0x40400000`       | Flash, instruction-mapped     |
| `0x50000000–0x50001FFF`       | RTC slow memory (8 KiB)       |
| `0x60000000–0x600FFFFF`       | AHB peripherals               |

So a typical ESP32 image has:

* one segment in `0x40080000` (IRAM code)
* one segment in `0x3FFB0000` (DRAM data, including init data)
* one segment in `0x400D0000` (instruction-mapped flash code, the bulk)
* one segment in `0x3F400000` (data-mapped flash, rodata strings)

Load each segment as its own r2 mapping:

```text
$ esptool.py --chip esp32 image_info --version 2 firmware.bin > segments.txt
$ # extract each segment to its own file with dd or with a small Python loop
$ python3 split_esp_image.py firmware.bin
$ ls
firmware.bin
seg_0_iram_40080000.bin
seg_1_dram_3ffb0000.bin
seg_2_flash_code_400d0000.bin
seg_3_flash_data_3f400000.bin
```

A handy splitter:

```python
# split_esp_image.py
import struct, sys

with open(sys.argv[1], "rb") as f:
    data = f.read()

# header: 1 byte magic 0xE9, 1 byte segments, 1 byte spi mode,
# 1 byte spi config, 4 bytes entry point
magic, n_seg, spi_mode, spi_cfg, entry = struct.unpack("<BBBBI", data[:8])
assert magic == 0xE9, "not an ESP image"

off = 0x18  # skip extended header to first segment
for i in range(n_seg):
    load, length = struct.unpack("<II", data[off:off+8])
    off += 8
    seg = data[off:off+length]
    off += length
    name = "code" if 0x40080000 <= load < 0x40100000 or 0x400d0000 <= load < 0x40400000 \
           else "data"
    fn = f"seg_{i}_{name}_{load:08x}.bin"
    with open(fn, "wb") as out:
        out.write(seg)
    print(fn, hex(load), len(seg))
```

Then load all into one r2:

```text
$ r2 -a xtensa -c esp32 -m 0x40080000 seg_0_iram_40080000.bin
[0x40080000]> o seg_1_dram_3ffb0000.bin       0x3ffb0000
[0x40080000]> o seg_2_flash_code_400d0000.bin 0x400d0000
[0x40080000]> o seg_3_flash_data_3f400000.bin 0x3f400000
```

Now the literal-pool references resolve, the strings are at the right
addresses, and `aaa` finds the bulk of the code in the
`0x400D0000`-mapped flash segment.

::: tip
Save the multi-mapping load as a script (Chapter 4). ESP firmware
analysis is tedious to set up the first time and trivial after you
have a script.
:::

## ESP32 ROM symbols

The ESP32 has its own ROM at `0x40000000–0x4005FFFF` containing
Espressif's first-stage bootloader, low-level initialisation routines,
and a small standard library. The application can call these by
absolute address. The symbols are public:

```text
$ git clone https://github.com/espressif/esp-idf
$ ls esp-idf/components/esp_rom/esp32/
ld/esp32.rom.ld
ld/esp32.rom.api.ld
ld/esp32.rom.libgcc.ld
... (linker scripts that map names to addresses)
```

The `.ld` files are GNU linker scripts. They look like:

```text
PROVIDE ( esp_rom_printf = 0x40007d54 );
PROVIDE ( esp_rom_install_uart_printf = 0x4000be0c );
PROVIDE ( ets_delay_us = 0x40008534 );
... etc.
```

Convert these to r2 flag definitions:

```text
$ awk '/PROVIDE.*0x4/ {gsub("[(),;]",""); print "f sym."$3" = "$5}' esp32.rom.ld > rom.r2
$ head rom.r2
f sym.esp_rom_printf = 0x40007d54
f sym.esp_rom_install_uart_printf = 0x4000be0c
...
```

Then load:

```text
[0x...]> . rom.r2
[0x...]> afl ~ esp_rom | head
```

Every call into ROM now has a name. This single-handedly explains
much of what looks like opaque function-pointer dispatch in ESP
firmware.

## Detecting and analysing ESP-IDF

ESP-IDF is the standard SDK. Most ESP32 firmware uses it. Tells:

* Strings: `"E (%d) %s: ..."` (the ESP_LOG format), `"system_api"`,
  `"esp_event"`, `"freertos"`, `"FreeRTOS task XXX"`.
* The two-CPU FreeRTOS port has tasks with `pcCurrentTCB` per-CPU.
* WiFi and BT have huge precompiled blobs in flash with characteristic
  byte patterns.

ESP-IDF version detection: search for the version string:

```text
[0x...]> izz ~ "v[0-9]\.[0-9]"
```

Once you know the IDF version, you can build a signature DB from
that exact version's compiled libraries.

## Windowed register reading

A typical Xtensa function entry:

```text
ENTRY a1, 0x20            ; allocate 0x20 bytes of stack, slide window
mov.n a8, a2              ; a2..a7 are caller args; copy to "high" regs
l32r a9, .Lconst1         ; load a constant
...
RETW.N                    ; return and restore window
```

Reading this:

* `ENTRY a1, N` is the Xtensa equivalent of the prologue. It does the
  window slide and stack allocation in one instruction.
* `a2..a7` hold up to 6 arguments (CALLn convention). Most functions
  immediately copy them somewhere. The first argument is `a2`, *not*
  `a0` or `a1`.
* `a0` is the return address; `a1` is the stack pointer.
* `l32r aX, label` is "load 32-bit relative" — the literal lives in a
  literal pool at a *lower* address than the instruction (negative
  PC-relative offset only, up to ~256 KiB before the PC). The
  disassembler resolves it to the underlying value.
* `RETW.N` (the `.N` suffix means narrow encoding) is the windowed
  return. If you see `RET` in a function with `ENTRY`, something is
  wrong (probably non-windowed code in a windowed context — rare).

Calling convention:

* `CALLn label` calls and slides the window by `n` registers (4, 8, 12).
* Arguments in `a2..a7` for the windowed convention.
* Return value in `a2..a5` (up to 4 words).
* `a0` holds return address; window-slide saves the caller's `a0`.

R2's decompiler (r2ghidra) understands this convention and renders
function bodies in C-like form. Some confusing bits to watch out for:

* "Use of a register before definition" warnings often refer to args
  in `a2..a7` that come from the caller — these are not bugs.
* Functions with no `ENTRY` instruction use the call0 convention.
  Set per-function:

```text
[0x...]> afc xtensa-call0 @ sym.foo
```

## ESP32 dual-core specifics

ESP32 has two LX6 cores (PRO_CPU and APP_CPU). FreeRTOS runs an
SMP scheduler. Code can run on either core, and some peripherals are
core-affinity-locked. For reverse engineering:

* `xPortGetCoreID()` calls return 0 or 1 — control flow that branches
  on this is core-specific.
* The two `pxCurrentTCB` entries (one per core) are at known addresses
  in DRAM if you have ESP-IDF symbols.
* Interrupt allocation (`esp_intr_alloc`) takes a CPU affinity argument.

## ESP8266 differences

ESP8266 is single-core LX106. Most of the above applies, but:

* Memory map is different (smaller — 32KB IRAM instead of 128KB).
* No FPU.
* The SDK is ESP8266 NONOS or ESP8266 RTOS SDK — predecessor of ESP-IDF
  with different naming.
* WiFi is mostly precompiled blobs.

ROM symbols for ESP8266 are at different addresses; use the
`esp8266` SDK's linker scripts.

## ESP32-S2/S3 differences

These are LX7. The decoding is mostly the same as LX6 but:

* Some new instructions (vector ops on S3).
* Different memory map (more IRAM, larger flash MMU windows).
* USB-OTG on S2 and S3 brings new peripherals.
* S3 adds AI / vector instructions; r2's decoder may not know all of
  them.

If you encounter unknown opcodes, file a bug against r2's xtensa
plugin and use `aha` to mark the offending instruction so analysis
can continue.

## Encrypted flash

ESP32 supports flash encryption — flash content is encrypted at rest
and decrypted by the cache controller on read. The original ESP32
uses an AES-256 custom mode with an address-tweaked key; ESP32-S2,
S3, and the RISC-V C-series use XTS-AES. A flash dump from
an encryption-enabled device is opaque ciphertext. You need either:

* the eFuse encryption key (typically not extractable),
* a side-channel attack (Limited Results, see academic papers), or
* a dump from before encryption was enabled.

If you suspect encryption: high-entropy regions across the entire
flash (not just at known data sections) are the tell. `binwalk -E`
gives an entropy plot.

## Wokwi and QEMU for dynamic testing

If you do not have hardware, Wokwi (online) and the espressif QEMU
fork run ESP32 firmware in simulation. Useful for confirming a
hypothesis from static analysis without a soldering iron. See
Chapter 21 (dynamic analysis) for how to attach r2 over GDB-remote.

A fully-loaded ESP32 binary in r2 with ROM symbols, types, and
zignatures from ESP-IDF feels almost as readable as a Cortex-M
binary. The setup is more involved; the payoff is the same.
