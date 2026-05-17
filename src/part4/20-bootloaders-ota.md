# Bootloaders, Image Headers, and OTA Blobs

Most production embedded firmware is not a single binary; it is a
chain. ROM bootloader -> first-stage bootloader -> second-stage
bootloader -> OS/RTOS -> applications. Each stage may be signed,
encrypted, compressed, or wrapped in a vendor-specific container.
Understanding the chain matters because (a) the application is what
you usually care about but the bootloader controls what it sees,
(b) some of the most interesting bugs live in the bootloader, and
(c) OTA update mechanisms are repeatedly the source of high-impact
vulnerabilities.

This chapter covers how to recognise common image headers, how to
unwrap and analyse them, and what to look for when the goal is the
bootloader itself.

## The boot chain in miniature

A typical Cortex-M boot:

1. **ROM** — vendor-burnt code. Configures clocks, validates the
   first-stage bootloader's signature (if secure boot is enabled),
   jumps to it.
2. **First-stage bootloader (FSBL)** — your code or vendor's. Sets
   up RAM, configures the MPU, decides whether to enter recovery
   mode (button held, magic flag set). Either jumps to the
   application or to a recovery handler.
3. **Application** — your firmware. Runs the actual product.

A typical Linux router boot:

1. **ROM/CFE/U-Boot SPL** — hardware init, loads U-Boot from flash.
2. **U-Boot** — finds and validates the kernel, the DTB, and an
   initramfs; loads them; jumps to the kernel.
3. **Kernel** — early init, mounts the squashfs root, runs init.
4. **userspace** — the actual services.

A typical ESP32 boot:

1. **ROM** — Espressif's first-stage. Reads the second-stage
   bootloader from flash address `0x1000`.
2. **Second-stage bootloader** — Espressif-supplied or custom.
   Reads the partition table, picks an OTA slot, validates the app
   image, copies it to IRAM/DRAM, jumps.
3. **Application** — your ESP-IDF firmware.

Each stage is a separate binary you can analyse separately.

## Common image header formats

The headers you will recognise on sight after a year of embedded
work:

### Intel HEX (.hex)

ASCII format with embedded address records. Every line:

```text
:LL AAAA TT DD..DD CC
```

* `:` — start
* `LL` — byte count
* `AAAA` — 16-bit address
* `TT` — record type (00 data, 01 EOF, 02 extended segment, 04
  extended linear)
* `DD..DD` — data
* `CC` — checksum

Convert with `objcopy`:

```text
$ arm-none-eabi-objcopy -I ihex -O binary firmware.hex firmware.bin
```

R2 reads `.hex` directly with the right architecture flags.

### S-Record (Motorola .s19/.srec/.s37)

Similar to Intel HEX but Motorola's encoding. Same convert/load
flow.

### uImage (U-Boot)

64-byte header at offset 0:

```text
00: 27 05 19 56                   magic IH_MAGIC
04: <header CRC32, big-endian>
08: <unix timestamp>
0C: <data size>
10: <load address>
14: <entry point>
18: <data CRC32>
1C: <OS type>     <arch>          <image type>     <compression>
20: 'image_name........' (32 bytes, null-padded)
40: <payload>
```

Decode:

```text
$ dumpimage -l firmware.uImage
Image Name:   Linux-4.14.146
Created:      Tue Jan  1 00:00:00 2024
Image Type:   MIPS Linux Kernel Image (lzma compressed)
Data Size:    1572800 Bytes = 1536.00 KiB = 1.50 MiB
Load Address: 80000000
Entry Point:  80000400

$ dumpimage -p 0 -o kernel.lzma firmware.uImage
$ unlzma kernel.lzma
$ r2 -a mips -b 32 -e cfg.bigendian=true -m 0x80000000 kernel
```

### FIT (Flattened Image Tree)

U-Boot's modern multi-image format. A DTB-encoded structure that
contains kernel, DTB(s), initramfs, and a `configurations` section
that selects which combination to boot. `dumpimage -l image.itb`
lists everything; `-p N` extracts.

### ESP image format

Already covered (Chapter 14). Magic byte `0xE9`, segment headers,
each segment with its own load address.

### NXP / Freescale `.s32k` / `.fcb` headers

Some NXP families have a "Flash Configuration Block" at offset
0x400 containing chip-config bytes, and the user code follows.
Skip the header before disassembly.

### Atmel SAM-BA bootloader interface

SAM-BA expects a specific layout in the first 0x2000 bytes. The
application starts at 0x2000 (16 KiB in). Load with `-m 0x00002000`
on a SAM-BA-bootloaded image.

### Vendor-specific (Realtek, Allwinner, Rockchip, …)

Each SoC vendor with a custom bootloader has a custom header. The
fastest way to identify one is to ask `binwalk`:

```text
$ binwalk firmware.bin
DECIMAL    HEXADECIMAL  DESCRIPTION
0          0x0          Realtek firmware header, name: "RTKBoot"
40         0x28         ARM executable code (Thumb)
```

Strip the header with `dd` and proceed.

## Recognising compression

A heavily compressed payload is statistically "random-looking" — high
entropy, no obvious structure. `binwalk -E` plots entropy across the
file:

```text
$ binwalk -E firmware.bin
0x0      0.000000
0x40     0.987         # high entropy from here = compressed
0x80     0.989
... (high entropy until)
0x80000  0.620         # back to normal — uncompressed payload follows
```

Or check entropy with a small Python:

```python
import sys, math, collections
data = open(sys.argv[1],'rb').read()
counts = collections.Counter(data)
total = len(data)
entropy = -sum((c/total) * math.log2(c/total) for c in counts.values())
print(f"entropy: {entropy:.3f}")  # 8.0 = max for bytes, 7.5+ = likely compressed
```

For a known compression format, `binwalk` recognises the magic:

| Magic                        | Compression                           |
|------------------------------|---------------------------------------|
| `1F 8B`                      | gzip                                  |
| `5D 00 00`                   | LZMA (older variant)                  |
| `FD 37 7A 58 5A 00`          | XZ                                    |
| `28 B5 2F FD`                | Zstandard                             |
| `42 5A 68`                   | bzip2                                 |
| `89 4C 5A 4F 00 0D 0A 1A 0A` | lzop (LZO container)                  |
| `04 22 4D 18`                | LZ4 frame                             |
| `68 73 71 73`                | squashfs v4 (modern, little-endian)   |
| `73 71 73 68`                | squashfs ≤3.x (legacy, big-endian)    |
| `85 19` (LE) / `19 85` (BE)  | JFFS2 node (`JFFS2_MAGIC_BITMASK = 0x1985`) |
| `2D 72 6F 6D 31 66 73 2D`    | romfs (`-rom1fs-` ASCII)              |

YAFFS2 has no fixed file-magic; identify it structurally via
`binwalk`'s YAFFS detector or by trying to mount with `unyaffs`.

Decompress with the matching tool and continue.

## The application image inside the bootloader

If the bootloader is a separate binary you have, find where it
loads the application from. Patterns:

* A `memcpy(dest, src, len)` or open-coded equivalent where `src`
  is a flash address and `dest` is RAM, followed by a jump to a
  RAM address — this is the loader.
* A function-pointer call where the pointer was loaded from a
  fixed flash address — the bootloader is calling the application's
  reset vector.
* A long `memcmp` against a magic value — signature/integrity check.

Trace from the call to the application's entry point. The address
the bootloader jumps to is the application's load address.

## OTA update mechanisms

OTA (Over-The-Air) updates are where many embedded vulnerabilities
live. Common architectures:

**A/B partitions.** Two slots. Bootloader picks the active slot,
verifies it, runs it. New firmware writes to the *inactive* slot
and flips a pointer. Safe against power loss.

**Single slot with backup.** Same idea, but the inactive slot is
just the previous version, kept for rollback.

**Streamed flash.** New firmware streams in over the network and is
written to flash as it arrives. Risky; partial writes can brick.

**Recovery partition.** A small known-good firmware that can be
booted to repair the main partition. The main partition's update is
still risky; recovery is a fallback.

Things to look for when reverse engineering an OTA implementation:

**Signature verification.** Find the signature check. Common patterns:

* Public-key crypto (Ed25519, ECDSA, RSA) verifying a signature blob
  appended to the image.
* HMAC with a hard-coded key.
* CRC32 (catastrophically weak — anyone can forge a "valid" image).
* No verification at all (more common than you would hope).

Find the verify function:

```text
[0x...]> izz ~ -i sign           # strings about signing
[0x...]> izz ~ -i hash
[0x...]> izz ~ -i verif
```

Or look for the public key as a constant in the firmware: a 32-byte
Ed25519 public key has no plausible compression and looks random.

**Anti-rollback.** A monotonic version counter that the new image
must not decrement. Enforced in eFuse, OTP, or just a flash counter.
If absent, an attacker can install an old, vulnerable firmware over
a patched one.

**Encryption.** AES-CTR, AES-XTS, or vendor-specific. The decrypt
key may be in eFuse (good), in plaintext flash (terrible), or
derived from a chip-unique value (mediocre).

**Boot-time integrity.** Some chains check the application image's
integrity at every boot, not just at update time. Find the boot
integrity routine; it is typically on the critical path of the
bootloader.

## ESP32 OTA specifics

ESP-IDF's OTA scheme uses two app partitions (`ota_0`, `ota_1`) and
a separate `otadata` partition. The bootloader reads `otadata` to
decide which app to run. Each app image carries an SHA-256 hash;
the bootloader verifies it before jumping. With secure-boot enabled,
the bootloader also verifies an Ed25519 signature.

Reverse engineer the second-stage bootloader by extracting the
`bootloader.bin` from the flash image. On the classic ESP32, the
bootloader lives at flash offset `0x1000` and is bounded above by the
partition table at `0x8000` (so up to ~28 KiB). On ESP32-S3, C3, C6,
and H2 the bootloader sits at flash offset `0x0` instead. Treat it as
a regular ESP image with its own segments (Chapter 14).

## Linux router OTA

Most router OTAs are: download a tarball or a custom image, validate
checksum, write to MTD, reboot. The validation is often weak. Look
at the update CGI handler in the web UI binary, trace what command
it executes (`mtd write`, `nandwrite`, vendor-specific tool), and
check what it actually validates.

A common pattern: the update file contains a header with vendor ID,
model ID, and a CRC. The check is "vendor matches, model matches,
CRC valid". Forging is trivial; bricking via deliberate misuse is
trivial; planting persistent backdoors via OTA is one of the most
common router compromise paths.

## Workflow when reverse engineering a bootloader

1. **Identify the format.** binwalk + entropy + visual inspection.
2. **Extract.** Strip headers, decompress, split into segments.
3. **Load each stage in r2** with the right base. The bootloader
   typically runs from ROM or low flash; the application from a
   later flash region.
4. **Find the application hand-off.** The instruction that branches
   from the bootloader to the application gives you both the
   application's load address and the function pointer / vector
   table layout the bootloader expects.
5. **Find the integrity check.** Verify signature/hash routine.
6. **Find the update entry point.** Function that receives a new
   image (over USB, UART, OTA, JTAG mailbox, ...).

Bootloaders are smaller than applications and have very specific
purposes. They are often the most efficient targets for vulnerability
research because the attack surface is constrained, the failure mode
is severe (full device compromise that survives application updates),
and the code is usually written by a small team under time pressure.
