# Caveats, Gotchas, and Pitfalls

This chapter collects the things that bite. Some are r2-specific
(bugs, surprising defaults, commands that do not do what they look
like they should). Some are architecture-specific. Some are workflow
mistakes. They are listed here in one place so that when something
unexpected happens, you have a checklist to consult.

## radare2 itself

**`aaa` is non-deterministic on the margin.** With certain
combinations of `anal.*` knobs, two runs of `aaa` on the same binary
produce slightly different sets of functions. This is rare and
usually does not affect correctness, but it can produce mysterious
diffs of project files. Set the knobs explicitly in your load
script.

**Renaming a function does not retroactively rename its callers in
some views.** After `afn`, refresh with `aac` to propagate the new
name into call-comment annotations.

**`Ps name` overwrites without prompting.** If you save a project
with the same name as an existing one, the existing one is gone.
Use unique names per checkpoint.

**`P project` re-opens a project but does not re-open the binary
unless the project file remembers the path correctly.** (`Po project`
is the older, deprecated spelling — it still works as of r2 6.x but
will warn.) Move the binary, and the project breaks silently — `pdf`
produces nothing because the bytes are not loaded. Check `iI` after
opening.

**`o file 0xADDR` adds a mapping silently even if the address
overlaps an existing mapping.** R2 does not warn. Two overlapping
mappings produce undefined behaviour for analysis (which version
is canonical at a given address?). List with `o` and remove
duplicates with `o-N`.

**Hints (`ah*`) survive across project reopens by design.** This
is good — you do not lose them — but if you copied a project from
elsewhere, the hints come with it. If hints from a different binary
or version sneak in, your disassembly is wrong in subtle ways.
Audit with `ah` after re-opening any project.

**`pdg` (r2ghidra) caches results per session.** If you renamed a
function or changed a type, the cache may show stale output. Re-run
`pdg` until it shows fresh output, or restart r2 if the cache
sticks.

**`r2 -p projectname` does not work if the project was created in
a different r2 version with incompatible project schema.** The
project format changes occasionally. Keep r2 versions consistent
across machines that share projects.

**`io.va` can be silently disabled.** If virtual addressing is off,
all addresses become file offsets. Check `e io.va` (should be
`true`); if not, `e io.va = true`.

## Architecture-specific traps

**ARM Cortex-M: forgetting the Thumb bit on function entries.** The
reset vector and most function pointers in a Cortex-M binary have
the low bit set to indicate Thumb mode. When manually defining
functions or following pointers in a script, mask `~1` before using
the address. R2 usually handles this; LLMs and hand-written scripts
sometimes do not.

**ARM hard-float vs soft-float ABI.** Functions that take or return
floats decompile incorrectly if r2's calling convention is the wrong
ABI. Set `afc arm32_hard` (or whatever the cc name is in your r2
version; `afcl` lists them).

**Xtensa windowed register confusion.** A function's "first
argument" is `a2` (after the window slide), not `a0`. R2 mostly
gets this right; if a function decompiles with seven arguments and
takes only one, the windowed convention may not have been
recognised. Check `afc`.

**Xtensa CALL0 vs windowed.** Mixed-convention binaries (rare but
real) need per-function `afc` overrides. The decompiler's output
quality drops when it has the convention wrong.

**RISC-V compressed instructions misdecoded as base.** If `-c
rv32i` (no compressed) on a binary that uses `c` extension, every
other instruction is wrong. Always `-c rv32imc` or `rv32imac` for
embedded firmware unless you know compressed is disabled.

**MIPS branch delay slots.** When writing patches by hand, the
instruction after a branch *executes regardless of whether the
branch is taken*. Putting a `nop` in the wrong place breaks
correctness in a way that runs fine in QEMU but fails on real
silicon (or vice versa).

**MIPS endianness.** Many MIPS binaries are big-endian; many are
little. Get it wrong and disassembly is plausible nonsense. Always
sanity-check a known instruction (frame allocation, the
`addiu $sp, $sp, -N` pattern) under both.

**8051 register banks.** Code in an ISR may run with a different
register bank selected; reading R0 in disassembly might mean bank 0
or bank 1's R0 depending on PSW state. Check the ISR's bank
selection.

**8051 indirect addressing through R0/R1 only addresses 256 bytes.**
Code that needs larger ranges uses DPTR. Mistaking these confuses
analysis of memory operations.

**Cortex-A AArch64 PAC instructions on hardware that does not
support PAC.** They decode as NOPs. R2 shows them as `paciasp`,
`autiasp`, etc. Do not delete them as "useless" — on PAC-capable
silicon they are essential.

**Endianness inversion in literal pools.** ARM little-endian code
with a literal pool of 32-bit words is read in little-endian; if
you `pxw` the pool you see the values directly, but if you `px` you
see them byte-reversed. This bites when comparing literal-pool
values to Python `struct`-extracted equivalents.

## File-format pitfalls

**ELF program headers vs section headers.** The loader uses program
headers; analysis tools often look at section headers. A binary with
stripped section headers loads fine but `iS` shows nothing useful.
Use `iSS` (segments from program headers) instead.

**`.bss` is not in the file.** R2 allocates space for it during
analysis based on the section header. If the section header is
missing or wrong, BSS is not mapped, and code that reads
zero-initialised globals appears to read random memory.

**Intel HEX records can be out of address order.** Most tooling
sorts them, but if you build your own loader, do not assume
sequential.

**ESP image checksums.** Each segment in an ESP image has a checksum
the bootloader verifies. If you patch a segment without updating the
checksum, the chip rejects the image. `esptool.py` recomputes when
re-imaging.

**uImage CRC.** Same story. `mkimage` recomputes when repackaging.

**SquashFS variants.** OEM router builds often use non-standard
LZMA/XZ-based squashfs variants. `unsquashfs` may fail; `sasquatch`
(a fork) handles more variants.

## Toolchain mismatch traps

**Newlib vs glibc vs musl vs bionic.** All implement libc, all have
different internal structures. A signature DB built from one does
not match another. Identify which libc your target uses and build
the right database.

**GCC vs Clang generated code.** Different idioms for: switch
statements, vtable access, range checks, exception unwinding,
stack-protector probes. A signature DB built from one compiler does
not match the other.

**Optimization level.** `-O0`, `-O1`, `-O2`, `-Os`, `-Oz`, `-O3`,
`-flto` produce significantly different binaries. Same source, very
different signatures. Match the optimization of your reference
build to the target.

**Different toolchain versions.** `arm-none-eabi-gcc 7.x` and
`arm-none-eabi-gcc 13.x` differ in inlining, register allocation,
and code-size choices. Match major versions when building reference
DBs.

## Workflow mistakes

**"I'll remember this later" — you will not.** Every named
function, every commented address, every typed struct: write it
down. Memory is not a reliable storage medium for r2 sessions.

**Re-running `aaa` after manual annotations.** Some manual changes
get clobbered (most do not, but some do). Save the project before
any analysis re-run.

**Conflating two firmware versions.** Multiple `firmware.bin` files
on disk, all named the same. Always name files with version + date:
`firmware-v1.2.3-2024-05-15.bin`.

**Editing a project's notes file in r2's `:` prompt.** Your editor
of choice is faster. Use `: !$EDITOR notes.md`.

**Committing the binary to git without confirming licensing.**
Vendor firmware is usually not freely redistributable. Either keep
the binary out of git (use git-LFS or just store separately) or
verify the license.

**Trusting decompiler output for legal evidence or production
patches without verifying.** Decompilers are heuristics. The C they
produce often *looks* equivalent to the assembly but differs in
subtle ways (type promotion, undefined-behaviour assumptions,
elided side effects). Verify before relying.

## Hardware-side traps

**Probing live circuits without thinking about voltages.** A 3.3 V
target with a 5 V probe on the data line corrupts the probe and
sometimes the target. Verify the I/O voltage before connecting.

**Reading flash with the chip still in-circuit.** Other components
on the SPI bus may interfere. Lift the chip's CS line or remove the
chip for a clean read.

**Power-glitching during flash read.** If the device's power is
unstable (a USB cable that drops voltage, a board with a marginal
LDO), reads return inconsistent bytes. Use a powered hub or a
benchtop supply.

**Flashing the wrong region.** Bricked devices result. Always
double-check the start address and byte count of a write command
before pressing enter.

**Bricking via OTP / fuse misconfiguration.** Some chips have
one-time-programmable bits that disable debug, lock flash, or
enable encryption — irreversible. Read the chip's TRM section on
fuses *before* writing anything to OTP.

**Counterfeit chips.** Some labelled "STM32F407VGT6" parts are
re-marked clones with subtly different behaviour. If a binary that
works on a "known good" board fails on your target, suspect the
chip first.

## When r2 hangs or crashes

**Analysis hang on a giant function.** `aaa` on a function with
many basic blocks (10000+) can spin. Set `anal.bb.maxsize`,
`anal.fcn.maxsize`, and `anal.depth` to reasonable bounds before
analysis.

**Crash on an unsupported binary.** R2 occasionally segfaults on
malformed file formats. Run with `--no-bin-info` (`-n` for raw
load) to skip the format-specific code path:

```text
$ r2 -n -a arm -b 16 -m 0x08000000 weird.bin
```

**Plugin load failure.** A stale r2pm-installed plugin built against
an older r2 may fail to load with a cryptic error. Rebuild:

```text
$ r2pm -ci <plugin>
```

**Project corruption.** Rare, but it happens — a power loss
mid-`Ps`, or two r2 instances writing to the same project. Always
keep a backup; export the project's commands with `P*` for an extra
form of recovery.

## When the binary itself is hostile

Anti-RE techniques you may encounter in commercial firmware:

* **Code packing.** The binary you load is a small loader that
  decompresses or decrypts the real code at runtime. Look for a
  decryptor near the entry point and a giant write to RAM.
* **Anti-debug checks.** Code that probes the debug peripherals
  (DCB->DEMCR on Cortex-M, DBGSR on AArch64) and behaves differently
  if a debugger is attached. Patch the check.
* **Timing-dependent code.** Code that measures its own execution
  time and self-destructs if a debugger slowed it down. Hard to
  patch comprehensively; defeat by full emulation.
* **Code obfuscation.** Spaghetti control flow, dummy instructions,
  opaque predicates. Read the code anyway; obfuscators are
  patternful.

For embedded targets, anti-RE is uncommon outside of secure
elements, DRM-bearing chips, and a small set of high-end consumer
products. Most commercial firmware is not obfuscated and does not
even strip symbols thoroughly. Be grateful when it does not, and
do not assume it will not when it does.

## Closing thought

Most reverse-engineering "lost time" comes from one of three
sources: a wrong load (Chapter 19), a wrong calling convention
(Chapter 8), or a stale tool / out-of-date assumption. When you are
stuck, audit those three first. The fix is usually one command, and
you have probably been reading wrong disassembly for an hour
without noticing.

That closes Part V and the body of the book. The appendices follow:
a command cheatsheet, an architecture quick reference, file format
reference, and further reading. They are designed to live next to
your keyboard while you work.
