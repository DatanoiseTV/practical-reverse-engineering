# MIPS (Routers and Embedded Linux)

MIPS is the architecture in the back office of the consumer internet.
Most home/SMB routers, many cable modems, NAS boxes, and a long tail
of industrial gateways run a MIPS Linux. Atheros, Broadcom, MediaTek,
Realtek, and Lantiq SoCs all spawned generations of MIPS-based gear.
The chips are mostly out of production but the firmware is in active
field service for years to come, and a substantial chunk of CVE
research targets it.

This chapter covers MIPS as you encounter it in router-class firmware.
The Linux device-driver and DTB material in Chapter 18 applies to
MIPS routers directly; read both.

## Architectural overview

The relevant MIPS variants in embedded Linux:

* **MIPS32 R1/R2** — 32-bit, the common case for MT76xx, AR9xxx, BCM63xx.
* **MIPS32 R6** — newer, simplified instruction set, fewer compatible
  binaries. Some Lantiq parts.
* **MIPS64** — used in some high-end gear (Cavium Octeon, some Broadcom
  network processors). Layout differs significantly.
* **microMIPS / MIPS16e** — 16-bit-encoded variants for size-constrained
  code. Common in embedded ROM.

Big-endian is the default in the wild for legacy reasons (most
historical MIPS firmware is BE), but little-endian MIPS exists too
(some MediaTek, some Cavium). Check both.

Key facts:

* 32 general-purpose registers, conventional names below.
* **Branch delay slots** — the instruction *after* a branch executes
  before the branch is taken. Critical for reading flow.
* **No condition flags.** Conditional branches encode the comparison.
* **Load delay slot** historically existed too (MIPS I); modern
  MIPS32 hardware interlocks it. Compilers and assemblers respect
  the historical convention by interleaving.
* **`$t9` (=`$25`) holds the called function's address** in standard
  PIC code, by convention. This matters for indirect calls.
* **Lots of pseudo-instructions** that the assembler expands. R2
  shows the underlying instructions.

## Register names

| ABI    | Number   | Role                                        |
|--------|----------|---------------------------------------------|
| `$zero`| `$0`     | hardwired zero                              |
| `$at`  | `$1`     | assembler temporary                         |
| `$v0`–`$v1` | `$2`,`$3` | return values                          |
| `$a0`–`$a3` | `$4`–`$7` | function arguments                     |
| `$t0`–`$t7` | `$8`–`$15`| temporaries (caller-saved)             |
| `$s0`–`$s7` | `$16`–`$23`| saved (callee-saved)                  |
| `$t8`–`$t9` | `$24`,`$25`| more temporaries (`$t9` is called fn ptr)|
| `$k0`–`$k1` | `$26`,`$27`| reserved for kernel                   |
| `$gp`  | `$28`    | global pointer                              |
| `$sp`  | `$29`    | stack pointer                               |
| `$fp` / `$s8` | `$30` | frame pointer / saved                  |
| `$ra`  | `$31`    | return address                              |

R2 uses ABI names by default. Set:

```text
[0x...]> e asm.syntax = att         # ABI names
[0x...]> e asm.syntax = none        # raw $N numbers
```

ABI is more readable.

## Loading

A clean ELF (kernel module, userspace binary, OpenWRT package):

```text
$ r2 ./busybox
[0x...]> i
arch     mips
bits     32
endian   big       # or little
```

A raw flash dump from a router:

```text
$ binwalk firmware.bin                   # find the boundaries
DECIMAL    HEXADECIMAL  DESCRIPTION
0          0x0          uImage header, ...
64         0x40         LZMA compressed data
1048576    0x100000     Squashfs filesystem
```

Two-stage extraction:

```text
$ binwalk -e firmware.bin               # auto-extract
$ ls _firmware.bin.extracted/
40       40.lzma   100000.squashfs   ...
$ unsquashfs _firmware.bin.extracted/100000.squashfs
$ ls squashfs-root/
bin/  etc/  lib/  sbin/  usr/  var/  www/
```

You now have the root filesystem. Inside, `bin/`, `sbin/`, and
`usr/sbin/` hold the binaries you reverse engineer; `lib/` has shared
libraries. The kernel itself is in `40.lzma` (decompress with `lzma`
or `unlzma`, then `r2` it).

Load a userspace binary:

```text
$ r2 squashfs-root/sbin/httpd
[0x...]> aaa
```

For raw kernel:

```text
$ unlzma -c 40.lzma > vmlinux.bin
$ r2 -a mips -b 32 -e cfg.bigendian=true -m 0x80000000 vmlinux.bin
```

The kernel load address is typically `0x80000000` for 32-bit MIPS
Linux (the unmapped, cached kernel segment). Confirm by looking for
the kernel's first instructions (typically a `lui` setting up the
stack pointer, then a `jal` to a setup function).

## Big vs little endian

Get this wrong and the disassembly is plausible but wrong. The fastest
check: a MIPS instruction always has its 6-bit opcode in the top 6 bits
when read in the *native* endianness. If you read 4 bytes from a
likely-MIPS region and the top 6 bits give a known opcode (0 = SPECIAL,
8 = ADDI, 9 = ADDIU, 0x23 = LW, 0x2B = SW, 0x3 = JAL), you are
matching the endianness; if you get garbage opcodes, swap.

```text
$ xxd firmware.bin | head -1
00000000: 27bd ffe0 afbf 001c afb0 0018 ...
```

`0x27` is `0001 0011` — top 6 bits `0010 01` = 0x09 (ADDIU). That is
a frame allocation: `ADDIU $sp, $sp, -0x20`. Big-endian.

If we read it little-endian we get `0xffffbd27` which decodes to
nonsense.

Switch in r2:

```text
[0x...]> e cfg.bigendian = true
[0x...]> e cfg.bigendian = false
```

## Branch delay slots

The line of code below a branch executes *before* the branch is taken.
Disassembly:

```text
0x000400c0  beqz   $a0, 0x4012c          # if a0==0 jump
0x000400c4  addiu  $sp, $sp, -0x20       # this runs FIRST
0x000400c8  sw     $ra, 0x1c($sp)
...
0x0004012c  ...                          # branch target
```

R2 shows the delay slot indented or commented:

```text
0x000400c0      beqz $a0, 0x4012c
                addiu $sp, $sp, -0x20    ; <delay>
```

The decompiler handles delay slots correctly; you do not have to
think about them when reading C output. But if you write patches by
hand (Chapter 22), respect the delay slot — putting a NOP in the
wrong place breaks behavior subtly.

## Calling convention (O32 ABI)

The dominant MIPS userspace ABI is O32:

* Arguments: `$a0..$a3` (first 4), then stack
* Return: `$v0` (and `$v1` for 64-bit returns)
* Caller-saved: `$at`, `$t0..$t9`, `$v0..$v1`
* Callee-saved: `$s0..$s7`, `$gp`, `$sp`, `$fp`, `$ra`
* Stack alignment: 8-byte
* The first 16 bytes of the caller's stack are reserved for spilling
  `$a0..$a3` if needed

For r2:

```text
[0x...]> e anal.cc = o32           # default
[0x...]> afc o32 @ sym.foo
```

Other ABIs (N32, N64) are uncommon for embedded; you mostly see them
on Cavium and high-end Linux MIPS systems.

## Position-independent code and `$gp`

PIC MIPS code uses `$gp` (global pointer) to access globals. The setup
sequence at function entry:

```text
0x000400c0  lui    $gp, 0x0c
0x000400c4  addiu  $gp, $gp, -0x6f60     # $gp = 0xb0a0
0x000400c8  addu   $gp, $gp, $t9         # $gp += $t9 (function PC)
```

After this, accesses through `$gp` reach the global offset table.
Indirect calls go through `$t9`:

```text
0x...        lw    $t9, -0x7fdc($gp)     # load function ptr from GOT
0x...        jalr  $t9                   # call
0x...        nop                         # delay slot
```

R2 follows these correctly when the binary is loaded with the right
mappings. For raw kernel images (which are not PIC), `$gp` is set
once at boot and used for `.sdata` accesses across the whole kernel.

## Linux router specifics

**OpenWrt and similar.** Most consumer-grade router firmware is
OpenWrt-derived. The toolchain is `mips-openwrt-linux-musl-gcc` for
modern builds; older devices use uClibc. Both have signature DBs you
can build (Chapter 10).

**Init.** `/sbin/init` calls `/etc/init.d/rcS` which loads everything.
The order of services tells you the boot sequence; the binaries each
service starts are the meat.

**Web UI.** Almost always `/sbin/httpd` or `/usr/sbin/uhttpd`. Often
the most fruitful target for vulnerability research.

**Custom binaries.** Vendor-specific config daemons (`acsd`, `wlctld`,
`upgrade.cgi`) are where the bugs are. Look for ioctls into custom
kernel modules.

**WiFi driver.** Always closed-source for older Broadcom/Qualcomm
parts. The driver `.ko` is in `/lib/modules/$(uname -r)/`. Reverse
engineering one is a major undertaking; see Chapter 18.

**Custom proprietary protocols.** A lot of router firmware speaks
non-standard protocols on TCP/UDP for cloud management, OEM
provisioning, or "phone home" telemetry. Find them by:

```text
[0x...]> izz ~ /etc/                # config file paths
[0x...]> izz ~ http://              # URLs
[0x...]> izz ~ <port-ish numbers>
[0x...]> axt @ sym.imp.bind         # listening sockets
[0x...]> axt @ sym.imp.recvfrom     # UDP receivers
```

## MIPS gotchas

**`lui` + `ori`/`addiu` is the constant materialisation pattern.** A
32-bit address split into upper-16 and lower-16. R2 collapses these
into a single comment showing the resolved value, but if your load
address is wrong, both halves point to nothing.

```text
0x...  lui   $a0, 0x402             ; upper half
0x...  addiu $a0, $a0, 0x12c        ; lower half -> $a0 = 0x4020012c
```

**`jal` (Jump And Link) destination is in the same 256 MiB region.**
The 26-bit target field is OR'd with the high 6 bits of the current
PC. If your binary spans a 256 MiB boundary, `jal` cannot reach
across, so the compiler emits `jalr $t9` style indirect calls. This
trips up automatic xref recovery; check `axt` for missing edges.

**MIPS16e and microMIPS use the same opcode space as base MIPS, in
different bits.** Mixed-mode binaries exist; r2 needs hints (`ahb 16`)
to switch.

**The `$t9 = function address` convention is *almost* always
honoured.** When it is not (some hand-written assembly, some
optimised cases), an indirect call through `$t9` may go to the
wrong place because the caller did not load the correct value. If
the decompiler's reconstructed call graph looks broken, check `$t9`.

**Branch delay slots can be NOPped or filled with useful work.** A
useful instruction in the delay slot is a perfectly valid pattern,
not a bug.

A typical router firmware analysis goes: extract with binwalk, mount
the squashfs, identify the web-facing daemon, load it in r2, find
the request dispatch table, trace each handler. The combination of
clear binary structure, often-buggy code, and remote attack surface
makes MIPS routers one of the highest-value targets in embedded
security research today.
