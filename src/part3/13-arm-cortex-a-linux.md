# ARM Cortex-A and Linux Userland

Cortex-A is application-class ARM: cores big enough to run Linux,
Android, and full-stack RTOSes (Zephyr's SMP support, RTEMS, BSDs).
Reverse engineering a Cortex-A target is mostly Linux reverse
engineering — ELF binaries, dynamic linking, the system call
interface, often debug info you can use. This chapter covers the
specifics.

For Linux kernel modules and the device tree, see Chapter 18.

## Architectural overview

Cortex-A comes in three relevant flavours:

* **ARMv7-A** (Cortex-A5/A7/A8/A9/A15/A17). 32-bit. Most older Linux-on-ARM
  systems: original Raspberry Pi, BeagleBone, NXP i.MX6, Allwinner
  H3, Freescale Vybrid. Mode-switchable between ARM and Thumb.
* **ARMv8-A AArch64** (Cortex-A35/A53/A55/A57/A72/A73/A75/A76/A77/
  Apple silicon, Neoverse). 64-bit. Modern phones, Raspberry Pi 4+,
  most current single-board computers.
* **ARMv8-A AArch32** — backward-compatible 32-bit mode for ARMv8
  cores. You will see this in 32-bit Linux distributions running on
  64-bit hardware.

For reverse engineering they differ in:

* **Calling convention.** AArch64 uses x0–x7 for args, x0 for return.
  AArch32 uses r0–r3, r0 return. AAPCS rules; `afc arm32` and
  `afc arm64` in r2.
* **Instruction encoding.** AArch32 is fixed 32-bit ARM or 16/32-bit
  Thumb-2. AArch64 is fixed 32-bit. Thumb does not exist on AArch64.
* **System registers.** Different naming and access pattern. AArch64
  uses `MRS x0, ID_AA64ISAR0_EL1`-style; AArch32 uses
  `MRC p15, 0, r0, c0, c0, 0`.
* **Atomic primitives.** AArch32 uses `LDREX/STREX`; AArch64 uses
  `LDXR/STXR` plus the new `CAS`/`SWP` instructions of ARMv8.1.

For most application userland code these differences are invisible
unless you are reading a libc, kernel, or hand-rolled lock.

## Loading

A Linux ELF binary loads cleanly:

```text
$ r2 /usr/bin/some_binary
[0x...]> aaa
```

R2 reads the ELF, picks up the PLT/GOT, finds imports and exports,
and produces useful disassembly. For a stripped ELF, the function
list is shorter but the binary is still navigable.

For an Android `.so`:

```text
$ r2 libnative.so
```

For an AArch64 binary on a Mac (most likely scenario for a Mac
reverse engineer working on Linux ARM software), no special flags —
r2's `arm` arch handles all variants and reads `bits` from the ELF
header.

If you have only a stripped binary with no ELF header (a `.bin`
extracted from initramfs, an unpacked busybox applet), tell r2 the
arch and bits explicitly:

```text
$ r2 -a arm -b 32 -m 0x10000 stripped32.bin
$ r2 -a arm -b 64 -m 0x400000 stripped64.bin
```

The default load address for a position-independent ELF is `0x10000`
on AArch32 and `0x400000` on AArch64, but kernel images load at
`0xffffffc008080000` (or thereabouts), and PIE binaries get arbitrary
addresses at runtime — r2 picks reasonable defaults but you may need
to override.

## Imports, the PLT, and the GOT

Every Linux ARM binary that uses libc has:

* an **import table** listing the functions it expects from shared
  libraries (`printf`, `malloc`, …);
* a **PLT** (Procedure Linkage Table) — small stubs in `.plt` that
  jump to the resolved address of each import;
* a **GOT** (Global Offset Table) — pointers in `.got` that the
  dynamic linker fills in at runtime.

Inspect:

```text
[0x...]> ii                 # imports
[0x...]> iE                 # exports
[0x...]> iS                 # sections (look for .plt, .got)
[0x...]> afl ~ sym.imp.     # PLT stubs
[0x...]> axt @ sym.imp.malloc       # who calls malloc?
```

`sym.imp.foo` flags refer to the PLT entry for `foo`. R2 names them
during loading. You navigate to a PLT stub and `axt` shows you every
caller in the binary — typical first move when you are looking for,
say, all the `socket()` calls.

## Symbols you almost always have

Even fully stripped Linux binaries leak function names through:

* The **dynamic symbol table** (DT_SYMTAB / .dynsym) — needed for
  dynamic linking, not stripped by `strip`.
* **DT_NEEDED** — list of required shared libraries.
* **`.note.gnu.build-id`** — a build-ID hash you can correlate
  against debug info repositories (debuginfod).
* **DT_RPATH** / **DT_RUNPATH** — search paths embedded for the
  dynamic linker.

```text
[0x...]> ies                 # entry-related symbols
[0x...]> idp                 # PDB info (if any)
[0x...]> iL                  # loaded libraries
```

For a binary you want full symbols for, `debuginfod` is invaluable:

```text
$ debuginfod-find debuginfo /usr/bin/some_binary
$ debuginfod-find source /usr/bin/some_binary /path/to/source.c
```

If the build-ID is in a public debuginfod (e.g., the
`debuginfod.fedoraproject.org` server), you get debug info for free.

## Calling conventions in detail

**AArch32 (ARM/Thumb)**, EABI/AAPCS:

* Arguments: r0, r1, r2, r3, then stack
* Return: r0 (and r1 for 64-bit)
* Variadic: r0–r3 for first 4 args (regardless of int/float), more on
  stack
* Floats: soft-float passes via integer regs; hard-float passes via
  s0–s15 then stack
* Callee-saved: r4–r11
* Stack alignment: 8-byte at function entry

**AArch64**, AAPCS64:

* Arguments: x0..x7 (integer), v0..v7 (float)
* Return: x0 (and x1 for 128-bit)
* Variadic: same registers, more on stack
* Callee-saved: x19..x28, v8..v15 (low 64 bits)
* Stack alignment: 16-byte at function entry

For r2:

```text
[0x...]> e anal.cc = arm32             # AArch32
[0x...]> e anal.cc = arm64             # AArch64
[0x...]> afc arm32 @ sym.foo
[0x...]> afc arm64 @ sym.bar
```

Hard-float on AArch32 needs explicit signatures:

```text
[0x...]> afs float compute(float x, float y) @ sym.compute
```

## Position-independent code

Modern Linux ARM userland is built PIC. Disassembly shows:

* references through `[pc, #imm]` (literal pool with relative offset)
* GOT-relative loads (`adrp x0, :got:foo; ldr x0, [x0, :got_lo12:foo]`
  on AArch64)
* PLT stubs that branch via the GOT

R2 follows these correctly when the binary is loaded with the right
mappings. Where it loses you is in raw memory dumps from `gcore` or
process snapshots — the relocations are partially applied and r2's
analysis sees stale literal-pool entries. For raw process dumps you
typically have to either re-derive the load address from `/proc/PID/maps`
and reload, or accept some xrefs going wrong.

## Linux-specific tricks

**System calls.** Direct `svc` (AArch32) or `svc #0` (AArch64) calls
go through the syscall ABI:

* AArch32: r7 is the syscall number, r0..r5 the arguments
* AArch64: x8 is the syscall number, x0..x5 the arguments

R2 can decode these as comments if you set:

```text
[0x...]> e asm.syscall = true
[0x...]> e asm.syscall.col = 1
```

Or annotate manually with `acs` (analyse comment syscall).

**libc internal symbols.** If `_dl_runtime_resolve`, `__libc_start_main`,
or `__cxa_finalize` show up, you have glibc. Musl uses different
names (`_dlstart`, `__libc_start_init`). Recognise the difference; the
function bodies for each have different shapes.

**Constructors / destructors.** Look at `.init_array` / `.fini_array`:

```text
[0x...]> iS ~ init
[0x...]> pxw 64 @ section..init_array
```

Each entry is a function pointer that runs before/after `main`. They
are popular places for license checks, anti-debug routines, and
backdoors. Always read them.

**RELRO.** Modern binaries have read-only relocations (`.data.rel.ro`).
If a binary is RELRO-disabled or uses lazy binding, GOT entries can
be patched at runtime — relevant for some forms of process injection
analysis.

## Android specifics

Android shared libraries live under `/data/app/<pkg>/lib/<arch>/lib*.so`
or in APKs. Extract from an APK:

```text
$ unzip app.apk -d app/
$ ls app/lib/
arm64-v8a/  armeabi-v7a/  x86/  x86_64/
```

Load the `.so` you want — typically the `arm64-v8a` one for modern
phones. JNI entry points have predictable names:
`Java_<package>_<class>_<method>`. R2 demangles when you set:

```text
[0x...]> e bin.demangle = true
[0x...]> e bin.demanglecmd = true
```

For native-only binaries (CLI tools, system services), they are
ELFs in the conventional sense, but Android's bionic libc has different
internals than glibc. Build a bionic signature DB if you do a lot of
Android RE.

## Kernel-userspace interface

When reversing software that talks to a kernel driver, the interesting
points are typically:

* **`open("/dev/something", ...)`** followed by ioctls.
* **`ioctl(fd, _IOC(...), &buf)`** — the request number encodes
  direction, size, type, command. Decode with the macros in `<linux/ioctl.h>`.
* **`mmap(NULL, size, ...)`** of a device file — typically a hardware
  register window or a DMA buffer.
* **netlink sockets** — `socket(AF_NETLINK, SOCK_RAW, NETLINK_*)`.

For each of these, find the call site (`axt @ sym.imp.ioctl`),
extract the request number from the immediate (often a magic constant),
and look it up in the kernel source if you have it (`grep -r 0x40044901
linux/`).

## Cortex-A gotchas

**Mixed AArch32/AArch64 binaries are rare but exist.** Some firmware
(e.g., bootloaders, secure-world code) has both a 64-bit kernel and
32-bit BL31 code. Check `bits` on each section.

**TBI (Top Byte Ignore).** AArch64 ignores the top 8 bits of pointers
in some address translation modes. Pointer-tagging schemes (HWASAN,
MTE) put metadata in those bits. R2's analysis treats them as
opaque; do not be surprised if a "pointer" has nonsense in the high
byte.

**BTI / PAC.** ARMv8.5+ adds Branch Target Identification and Pointer
Authentication. Function entry instructions like `bti c`,
`paciasp`, `autiasp` show up. They are NOPs on hardware that does
not implement the feature; r2 decodes them but does not currently
treat them specially during analysis.

**Linker-relaxation tricks.** Some ARM linkers can rewrite a
`bl <far>` to `nop; bl <near>` if the call target ends up nearby.
The disassembly is correct but the code looks padded. Recognise the
pattern.

A clean Cortex-A workflow looks the same as desktop x86 RE: load,
analyse, name the imports' callers, follow the strings, follow the
ioctls. Most of the rest of this book applies; the next chapters
cover the architectures where things get weirder.
