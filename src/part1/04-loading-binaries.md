# Loading Binaries and Project Workflow

Half of embedded reverse engineering is loading the binary correctly.
Once the architecture, base address, and section layout are right, the
analysis commands you will learn in the rest of the book mostly Just Work.
Get any one of those wrong and r2 will produce confident, plausible,
completely wrong disassembly. This chapter covers how to load every
file format you are likely to encounter in firmware work, and how to
save your work in r2 projects so you do not redo it next session.

## ELF, Mach-O, PE: the easy case

If your binary has a header r2 recognises, it Just Works:

```text
$ r2 firmware.elf
[0x08000ed8]> i
file     firmware.elf
format   elf
arch     arm
bits     16              # Thumb
machine  ARM Cortex-M
class    ELF32
endian   little
...
```

`i` (info) shows what r2 figured out from the header. Confirm
architecture, bits, and endian before you do anything else. For ELF
firmware this is enough; r2 reads the program headers, maps the
segments, and you can `aaa` and start reading.

If the file has debug info or symbols, r2 picks them up automatically.
You can list them with `is` (symbols), `iI` (info), `ii` (imports),
`iS` (sections), `iE` (exports).

## Raw flash dumps

The harder case: someone hands you a 16 MiB blob with no header. This
is what comes out of an SPI flash reader, off a JTAG dump, or from
`dd`-ing `/dev/mtdblockN` on a router. There is no metadata. You provide
everything.

```text
$ r2 -a arm -b 16 -m 0x08000000 -e cfg.bigendian=false firmware.bin
```

Flag by flag:

* `-a arm` — architecture (`arm`, `mips`, `xtensa`, `riscv`, `8051`,
  `x86`, etc.)
* `-b 16` — bits (16 for Thumb, 32 for ARM/MIPS/RV32, 64 for AArch64)
* `-m 0x08000000` — map the file at this virtual address
* `-e cfg.bigendian=false` — endianness (true for big-endian MIPS)

For some architectures you also need `-c` for the CPU variant:

```text
$ r2 -a arm -b 32 -c cortex -m 0x08000000 firmware.bin
$ r2 -a xtensa -c esp32 -m 0x40080000 firmware.bin
$ r2 -a riscv -b 32 -c rv32imac -m 0x42000000 firmware.bin
```

The CPU subtype matters: Cortex-A and Cortex-M share the ARMv7
encoding but have different system registers; the M-profile MSR
instructions decode incorrectly with the wrong `-c`.

::: warning
If you do not provide `-m`, the file is mapped at `0x0` by default. For
Cortex-M firmware this means every absolute address in the binary
(vector table entries, literal pools) is offset by the actual flash base
(`0x08000000` for STM32, `0x00020000` for nRF52 application image, etc.).
The disassembly looks fine until you try to follow a reference and land
in nothing.
:::

### Discovering the architecture

If you do not know the architecture, the strings command is your first
move:

```text
$ strings firmware.bin | grep -iE 'arm|cortex|gcc|clang|esp|stm32|nrf'
```

`gcc` and `clang` build IDs leak the target. Vendor strings (`STM32CubeIDE`,
`nRF Connect SDK`, `Espressif IoT Development Framework`) tell you the
SoC family.

Strings rarely tell you the *bits*. For that, look at byte distribution:

```text
$ python3 -c '
import sys, collections
d = open(sys.argv[1],"rb").read()
c = collections.Counter(d)
print("most common:", c.most_common(8))
' firmware.bin
```

ARM 32-bit code has a high frequency of `0xe5` (LDR/STR with register).
Thumb code is denser and shows `0x46` (MOV register) and `0x47` (BX).
MIPS code is full of `0x00` from the upper bytes of zeros and the
delay slot NOP. RISC-V is variable-width and looks more uniform.
Xtensa LX has 24-bit instructions and is lumpy.

A better tool is **binwalk**:

```text
$ binwalk -A firmware.bin   # opcode-pattern detection across the file
```

`binwalk -A` runs Capstone disassembly heuristics across multiple
architectures and tells you which fits best. It is wrong sometimes;
treat it as a strong hint, not gospel.

A better-still tool is **ISA detection scripts** like
`cpu_rec.py` (Airbus CERT) which use byte n-gram statistics. These
classify Xtensa, AVR, 8051, V850, and other oddballs reliably.

### Discovering the load address

The vector table is your friend. On Cortex-M the first word is the
initial stack pointer; the second word is the reset vector. Both must
be within RAM and FLASH respectively:

```text
$ xxd firmware.bin | head -2
00000000: 00f0 0220 d113 0008 1d14 0008 1f14 0008
00000010: 2114 0008 2314 0008 0000 0000 0000 0000
```

* SP = `0x2002f000` — clearly RAM (RAM bases at `0x20000000` on STM32)
* Reset = `0x080013d1` — flash code (flash bases at `0x08000000`); the
  `1` low bit means Thumb mode
* The next handlers (`0x0800141d`, etc.) all live in the same flash window

So the image is mapped at `0x08000000`. Build the command:

```text
$ r2 -a arm -b 16 -m 0x08000000 firmware.bin
```

For other architectures, the equivalent reasoning applies — see Part III's
per-architecture chapters for what the first few words usually look like.

## Format-specific loaders

### Intel HEX, S-Record

`.hex` (Intel HEX) and `.s19`/`.srec` files are ASCII representations
of binary with embedded address records. R2 reads them natively:

```text
$ r2 firmware.hex
```

R2 figures out the load addresses from the records. You still set
`-a` and `-b` because the format does not encode architecture.

You can also convert ahead of time with `objcopy`:

```text
$ arm-none-eabi-objcopy -I ihex -O binary firmware.hex firmware.bin
```

### UF2

UF2 (USB Flashing Format, used by Microsoft, Adafruit, RP2040 boards)
is a 512-byte-block format with embedded target addresses and family IDs.
R2 has a UF2 plugin in recent versions; otherwise convert:

```text
$ uf2conv -c -o firmware.bin firmware.uf2
```

Or use the Python package `uf2utils`. The result is a flat binary you
load with `-m`.

### ESP image format

ESP32 firmware uses Espressif's own image container. Each `.bin` has
an 8-byte header followed by segments, each with its own load address.
Use **esptool.py** to extract:

```text
$ esptool.py --chip esp32 image_info firmware.bin
File size: 1048576 (bytes)
Image version: 1
Entry point: 40080d20
2 segments

Segment 1: len 0x07b48 load 0x40080000 file_offs 0x00000018
Segment 2: len 0x0d2a4 load 0x3ffb0000 file_offs 0x00007b68
...
```

Then either dump each segment to its own file and load them as separate
mappings, or use the r2 ESP image loader (`r2pm -ci esp_image_loader`
in some forks). Chapter 14 covers the ESP-specific workflow.

### Bootloader-stripped images

Some images have a small header you need to skip — Realtek WiFi modules,
TI CC chips, Allwinner SoCs. `binwalk firmware.bin` typically identifies
the boundary:

```text
$ binwalk firmware.bin
DECIMAL    HEXADECIMAL  DESCRIPTION
0          0x0          Realtek firmware header, ...
512        0x200        ARM executable code (Thumb)
```

Then strip with `dd`:

```text
$ dd if=firmware.bin of=stripped.bin bs=1 skip=512
```

Or load directly with an offset:

```text
$ r2 -a arm -b 16 -m 0x08000000 -B 512 firmware.bin
```

`-B` is the in-file offset to start from. R2 maps from there, treating
the rest of the file as the loadable image.

## Multiple files / multiple mappings

For firmware where code lives at one address and data at another (which
is most embedded), open multiple files into the same r2 session:

```text
$ r2 -a arm -b 16 -m 0x08000000 code.bin
[0x08000000]> o data.bin 0x20000000   # map data.bin at 0x20000000
[0x08000000]> o                       # list mappings
 1 -- /path/code.bin @ 0x08000000 ...
 2 -- /path/data.bin @ 0x20000000 ...
```

This is how you reconstruct the runtime memory map when the linker script
puts code in flash and initial RAM contents in a separate region of flash.

You can also do this from the command line:

```text
$ r2 -a arm -b 16 -m 0x08000000 -i load.r2 code.bin
```

Where `load.r2` is a script of `o` commands and other r2 commands run on
startup. Save your loading recipe — you will reload the same firmware
many times.

## Projects

A radare2 project saves your analysis state — function names, comments,
types, flags, configuration — to disk so you can resume later.

Save the current session:

```text
[0x08000000]> Ps router-fw-2024-05
```

Open later:

```text
$ r2 -p router-fw-2024-05
```

Projects are stored under `~/.config/radare2/projects/<name>/`. Each is
a directory with the binary's metadata and your annotations. Commit them
to git if you are working on a long reverse-engineering effort with
others — projects are largely text and diff well.

::: tip
Make a project save part of your routine. After every meaningful
session — every time you would close a tab in IDA — `Ps`. There is no
auto-save; an r2 crash mid-session loses unsaved work.
:::

::: warning
Project saves do not save the binary itself, only the analysis state
plus a path back to the original file. If you move or rename the binary,
the project will not find it. Either keep paths stable or save the
binary inside the project directory and edit the project file's path.
:::

## A reproducible loading script

For any binary you will work on for more than 20 minutes, write a
loading script. Example for an STM32F4 firmware:

```text
# load.r2
e asm.arch=arm
e asm.bits=16
e asm.cpu=cortex
e cfg.bigendian=false

# memory map
o stm32f4-firmware.bin 0x08000000

# label common peripheral bases
f rcc.base = 0x40023800
f gpioa.base = 0x40020000
f gpiob.base = 0x40020400
f usart1.base = 0x40011000
f usart2.base = 0x40004400

# vector table
af reset_handler @ 0x080001cd
afn reset_handler 0x080001cd

# project
P+ stm32f4-fw
```

Run it:

```text
$ r2 -i load.r2 -
```

Or include it in `Ps` and you can reproduce the same starting state every
time. The next chapter takes a loaded binary and walks through r2's
analysis pipeline.
