# Appendix C: File Format Reference

Concise reference for the file formats you encounter in embedded
firmware reverse engineering. For each: the magic bytes, the layout,
how to recognise it, and how to extract or convert.

## ELF (Executable and Linkable Format)

**Magic:** `7F 45 4C 46` ("`\x7FELF`") at offset 0.

**Layout:**

```text
ELF Header (52 bytes for ELF32, 64 for ELF64)
  e_ident[16]    magic, class, endianness, version, OS ABI
  e_type         executable/dynamic/object/core
  e_machine      EM_ARM, EM_MIPS, EM_RISCV, EM_XTENSA, ...
  e_version      always 1
  e_entry        entry point virtual address
  e_phoff        program header table offset
  e_shoff        section header table offset
  e_flags        machine-specific flags
  e_ehsize       size of this header
  e_phentsize    program header entry size
  e_phnum        number of program headers
  e_shentsize    section header entry size
  e_shnum        number of section headers
  e_shstrndx     index of string table

Program Headers (defines what gets loaded)
Section Headers (defines code/data/symbols/relocations)
... payloads ...
```

**Recognise:** `file binary.elf` shows `ELF 32-bit LSB executable, ARM`
or similar. R2 reads it directly.

**Extract sections:** `objcopy -O binary --only-section=.text` extracts
`.text` to a flat binary. `readelf -S` lists sections.

**Useful sections:** `.text` (code), `.rodata` (constants), `.data`
(initialised globals), `.bss` (zeroed globals, not in file),
`.symtab`/`.strtab` (symbols), `.dynamic` (dynamic linking),
`.note.gnu.build-id`.

## Intel HEX (.hex)

**ASCII format**, line-based. Each line starts with `:`.

**Line format:**

```text
:LL AAAA TT DD..DD CC
```

* `:` — start
* `LL` — byte count (2 hex digits)
* `AAAA` — 16-bit address (high bits set by extended-address records)
* `TT` — record type:
  * `00` data
  * `01` end-of-file
  * `02` extended segment address (older)
  * `04` extended linear address (sets bits 16–31 of address)
  * `05` start linear address (entry point)
* `DD..DD` — data bytes
* `CC` — checksum (two's complement of sum of all bytes from `LL`)

**Convert:**

```text
$ arm-none-eabi-objcopy -I ihex -O binary firmware.hex firmware.bin
```

R2 reads `.hex` natively.

## Motorola S-Record (.s19, .srec, .s37, .mot)

**ASCII format**, line-based. Each line starts with `S`.

**Line format:**

```text
SN <count> <address (2/3/4 bytes)> <data> <checksum>
```

* `S0` — header (filename)
* `S1`/`S2`/`S3` — data with 16/24/32-bit address
* `S5`/`S6` — count
* `S7`/`S8`/`S9` — entry point
* checksum is one's complement of LSB sum

**Convert:**

```text
$ arm-none-eabi-objcopy -I srec -O binary firmware.s19 firmware.bin
```

## UF2 (USB Flashing Format)

**Magic:** every 512-byte block starts with `55 46 32 0A` ("`UF2\n`")
twice (start and end markers).

**Block layout** (512 bytes):

```text
0x00: 0x0A324655          magic1 ("UF2\n")
0x04: 0x9E5D5157          magic2 (start)
0x08: flags
0x0C: target address
0x10: payload size (typically 256)
0x14: block number
0x18: total blocks
0x1C: family ID (defines target chip)
0x20: payload (256 bytes)
0x1FC: 0x0AB16F30         magic3 (end)
```

**Family IDs:** RP2040 = `0xe48bff56`, SAMD21 = `0x68ed2b88`,
nRF52840 = `0x1b57745f`, etc.

**Convert:**

```text
$ uf2conv -c -o firmware.bin firmware.uf2
```

Or `uf2utils.py` (Python).

## ESP image format (Espressif)

**Magic:** byte `0xE9` at offset 0.

**Layout:**

```text
0x00: 0xE9                magic
0x01: number of segments
0x02: SPI flash mode (QIO, QOUT, DIO, DOUT)
0x03: SPI flash size + freq encoded
0x04: 4-byte entry point (little-endian)
0x08: extended header (ESP32+)
0x18: segment headers + payloads
last 16 bytes: SHA-256 of image (ESP32+, optional)
```

Each segment header (8 bytes): load address (4) + length (4),
followed by raw bytes.

**Inspect:**

```text
$ esptool.py --chip esp32 image_info firmware.bin
```

**Extract segments:** see Chapter 14's `split_esp_image.py`.

## U-Boot uImage

**Magic:** `27 05 19 56` ("`'\x05\x19V`") at offset 0.

**Header (64 bytes):**

```text
0x00: 0x27051956          magic
0x04: header CRC32
0x08: timestamp (big-endian)
0x0C: data size
0x10: load address
0x14: entry point
0x18: data CRC32
0x1C: OS (Linux=5, RTEMS=4, ...)
0x1D: arch (ARM=2, MIPS=5, x86=3, ...)
0x1E: image type (kernel=2, ramdisk=3, ...)
0x1F: compression (none=0, gzip=1, bzip2=2, lzma=3, ...)
0x20: image name (32 bytes, null-padded)
0x40: payload
```

**Inspect:**

```text
$ dumpimage -l firmware.uImage
$ dumpimage -p 0 -o kernel.gz firmware.uImage
```

## FIT (Flattened Image Tree)

U-Boot's modern format. A device-tree-encoded structure
containing kernel(s), DTB(s), initramfs, and configurations.

**Recognise:** binwalk reports "Flattened device tree". `dumpimage -l`
expands it.

**Inspect:**

```text
$ dumpimage -l firmware.itb
$ dumpimage -p 0 -o kernel.bin firmware.itb
```

## Flattened Device Tree (DTB / .dtb)

**Magic:** `D0 0D FE ED` at offset 0.

**Header (40 bytes):**

```text
0x00: 0xd00dfeed          magic
0x04: total size
0x08: offset to dt_struct
0x0C: offset to dt_strings
0x10: offset to mem_rsvmap
0x14: version
0x18: last compatible version
0x1C: boot CPU id
0x20: dt_strings size
0x24: dt_struct size
```

**Convert to/from text:**

```text
$ dtc -I dtb -O dts -o board.dts board.dtb
$ dtc -I dts -O dtb -o board.dtb board.dts
```

See Chapter 18 for reading DTS.

## SquashFS

**Magic:** `73 71 73 68` (BE) or `68 73 71 73` (LE) at offset 0.

**Recognise:** binwalk identifies it.

**Extract:**

```text
$ unsquashfs firmware.squashfs
$ sasquatch firmware.squashfs       # for vendor-modified variants
```

## JFFS2

**Magic:** `19 85` at the start of each node.

**Extract:** `jefferson` (Python tool) handles most variants.

```text
$ jefferson firmware.jffs2 -d output/
```

## CramFS, RomFS

Older read-only filesystems. Magic `45 3D CD 28` (CramFS) and
`-rom1fs-` (RomFS). `unromfs`, `cramfsck` for extraction.

## Compression formats

| Magic                        | Format         | Decompress with                |
|------------------------------|----------------|--------------------------------|
| `1F 8B`                      | gzip           | `gunzip`, `zcat`               |
| `42 5A 68`                   | bzip2          | `bunzip2`                      |
| `5D 00 00`                   | LZMA (legacy)  | `unlzma`                       |
| `FD 37 7A 58 5A 00`          | XZ             | `xz -d`                        |
| `28 B5 2F FD`                | Zstandard      | `zstd -d`                      |
| `04 22 4D 18`                | LZ4 frame      | `lz4 -d`                       |
| `89 4C 5A 4F 00 0D 0A 1A 0A` | LZO            | `lzop -d`                      |
| `4F 4E 45 4C` ("ONEL")       | romfs          | `unromfs` (variants exist)     |
| `50 4B 03 04`                | ZIP            | `unzip`                        |
| `52 61 72 21 1A 07`          | RAR            | `unrar`                        |
| `Rar!`                       | ditto, ASCII   | `unrar`                        |

## Cryptographic blobs

**X.509 certificate:** starts with `30 82` (DER SEQUENCE, 2-byte
length). Often inside `-----BEGIN CERTIFICATE-----` PEM headers
when in text form.

**RSA public key (PKCS#1 DER):** starts with `30 82` for the
SEQUENCE, then INTEGER (modulus) and INTEGER (exponent).

**Ed25519 public key:** 32 bytes, indistinguishable from random.
Tell by context (a 32-byte block in `.rodata` near a
signature-verification function).

**ECDSA signature:** typically 70–72 bytes DER-encoded.

**AES key:** 16/24/32 bytes, indistinguishable from random.

## Vendor-specific firmware containers

These vary widely. binwalk recognises many:

* **Realtek RTKBoot:** "RTKBoot" header.
* **Allwinner eGON:** "eGON.BT0" magic.
* **Rockchip RKFW:** "RKFW" header.
* **MediaTek BootROM image:** specific 32-byte preamble.
* **Broadcom CFE bootloader:** custom CFE header.
* **TP-Link Atheros header:** offset 0x100, custom structure.

For each, the recipe is the same: `binwalk` finds the boundary,
`dd` strips, the rest is a normal image you can load in r2.

## Quick triage workflow

For an unknown blob, in order:

1. `xxd file | head -2` — first bytes for instant recognition.
2. `file file` — libmagic guess.
3. `binwalk file` — embedded format scan.
4. `binwalk -E file` — entropy plot.
5. `cpu_rec.py file` — architecture guess if nothing else.
6. `strings -n 8 file | head -50` — human-readable hints.
7. `binwalk -e file` — extract everything binwalk recognises.

This sequence, run on every new binary, will identify 95% of what
you encounter in the field.
