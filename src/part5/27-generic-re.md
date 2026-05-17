# Generic Reverse Engineering Techniques

This chapter collects techniques that apply across every reverse
engineering target — embedded or userland, ARM or x86, ELF or PE.
None of them is r2-specific; all of them transfer to Ghidra, IDA,
or any other disassembler. They are the kind of pattern recognition
and recovery tricks that distinguish an experienced reverse
engineer from someone who has learned the tool but not the craft.

## Compiler fingerprinting

Knowing the compiler that produced a binary tells you which
calling-convention quirks to expect, which optimization idioms to
recognise, and which signature databases to apply.

**Leaked compiler strings.** Most compilers embed a version string
somewhere in the binary unless aggressively stripped:

```text
$ strings binary | grep -iE 'gcc|clang|msvc|rustc|go1\.|ldc|icc|tcc' | head
GCC: (Ubuntu 11.2.0-19ubuntu1) 11.2.0
Linker: LLD 15.0.0
clang version 15.0.0
rustc 1.74.0 (79e9716c9 2023-11-13)
go1.21.5
```

For ELF binaries, look in `.comment`:

```text
$ readelf -p .comment binary
String dump of section '.comment':
  [     0]  GCC: (GNU) 11.2.0
  [    14]  rustc version 1.74.0
```

For Mach-O, look at `__LC_BUILD_VERSION` and `__LC_VERSION_MIN_*`.

For PE, look at the rich header (Microsoft's embedded compiler
metadata) — tools like `pefile` or `CFF Explorer` decode it.

**Idiom-based detection.** When strings are scrubbed, compiler
idioms remain:

* **GCC** likes `lea` for arithmetic on x86, uses `endbr64`
  prologue on modern x86_64 with CET, emits switch-table dispatchers
  via indirect `jmp`.
* **Clang/LLVM** often produces tighter code than GCC, uses
  `movabs` more aggressively for 64-bit constants, generates
  distinctive vectorisation patterns.
* **MSVC** emits stack-cookie probes (`__security_cookie`,
  `__security_check_cookie`), uses `__SEH_prolog` and
  `__SEH_epilog` for exception frames on x86, has its own
  characteristic vtable layouts.
* **Rust** binaries have distinctive panic-handling code, the
  `core::panicking::panic` chain, mangled symbol names starting
  with `_ZN` (Itanium) or `_R` (newer Rust v0 mangling).
* **Go** binaries have an unmistakable runtime: `runtime.main`,
  `runtime.morestack`, gigantic moduledata tables, every function
  ending in a stack-growth check. The `golang_loader_assist`
  Ghidra script (and r2's `aag` recovery) recovers Go function
  names from the moduledata.

Knowing the language matters even more for higher-level analysis.
Rust and Go binaries have rich runtime metadata you can mine for
type information; C/C++ binaries are bare to the metal.

## Recognising cryptographic primitives

Cryptography uses public mathematical constants. Find them in the
binary and you find the crypto.

**Constants worth memorising:**

| Constant                                                       | Algorithm                |
|----------------------------------------------------------------|--------------------------|
| `0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476`               | MD5 IV                   |
| `0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, ...`          | SHA-256 IV               |
| `0x428a2f98, 0x71374491, 0xb5c0fbcf, ... (64 entries)`         | SHA-256 round constants  |
| `0xcbbb9d5d, 0x629a292a, 0x9159015a, ...`                      | SHA-384 IV               |
| `0x6a09e667f3bcc908, 0xbb67ae8584caa73b, ...`                  | SHA-512 IV               |
| `0x9e3779b9` (golden ratio constant)                           | TEA, XTEA, many hashes   |
| `0xc6a4a7935bd1e995`                                           | MurmurHash3 64-bit       |
| `0x9747b28c`, `0xed5b9b91`                                     | xxHash seed              |
| `0x01000193`                                                   | FNV-1a 32-bit prime      |
| `0x100000001b3`                                                | FNV-1a 64-bit prime      |
| 256-byte permutation that starts `0x63 0x7c 0x77 0x7b ...`     | AES S-box                |
| 256-byte permutation that starts `0x52 0x09 0x6a 0xd5 ...`     | AES inverse S-box        |
| 256-byte table starting `0x00000000 0x77073096 0xee0e612c ...` | CRC32 (Ethernet poly)    |
| `0x428a2f98d728ae22, 0x7137449123ef65cd, ...` (80 entries)     | SHA-512 round constants  |
| Permutation `0xd3, 0x14, 0x0f, 0x5d, ...` (24 rounds)          | KeccakF[1600] / SHA-3    |
| `0x243f6a88, 0x85a308d3, 0x13198a2e, ...` (π in hex)           | Blowfish P-array         |
| `0x3a39ce37, 0xd3faf5cf, 0xabc27737, ...` (e in hex)           | Various                  |

A 256-entry word table that looks random-ish but is the same in two
unrelated binaries is almost always a CRC lookup; the specific
polynomial determines the variant (Ethernet's `0xedb88320`,
ZIP/PNG's `0x04c11db7`, USB's `0xa001`).

**Structural tells:**

* A function with a 32-bit IV, eight working variables, eight
  parallel arithmetic chains, and sixteen rounds of message
  schedule → SHA-256 compression function.
* A function with a 4×4 byte state, ten rounds (or twelve, or
  fourteen) of `SubBytes`/`ShiftRows`/`MixColumns`/`AddRoundKey` →
  AES.
* A function that does 24 iterations on a 1600-bit state with
  `θ`/`ρ`/`π`/`χ`/`ι` steps → Keccak/SHA-3.
* A long lookup-then-XOR-then-permute loop, often with a 256-byte
  state → RC4 (still in older firmware).
* Big-number arithmetic on multi-word integers, with `mulhi`/`mullo`
  results combined → RSA or ECC.

The free **`findcrypt`** and **`signsrch`** tools (and the
**Ghidra script `findcrypt.py`**, and r2's `iz~AES`) scan binaries
for known crypto constants and tables and report matches with
algorithm names. Run them on any cryptographic-looking binary
first; manually identify what they miss.

## C++ vtables and RTTI recovery

C++ binaries embed runtime polymorphism through **vtables**: each
object's first word points to a per-class table of virtual function
pointers. With RTTI, those tables also reference type-info
structures that contain the original class name as a string.

**Finding vtables:**

A typical vtable in `.rodata` looks like:

```text
[0x405200]> pxw 64 @ 0x405200
0x405200  0x004052f0 0x004053a0 0x00405410 0x00405480
0x405210  0x004054f0 0x00405560 0x00000000 0x00000000
0x405220  ...
```

Each word that resolves to a function in `.text` is a vtable entry.
A vtable typically has 4–20 entries followed by zero terminators or
another vtable.

**RTTI:**

With RTTI enabled (the default in most builds), the word just
before the vtable's first entry is a pointer to a
`type_info` structure. That structure contains a pointer to a
mangled class name (typically beginning with `N` for a
namespaced name or just `9MyClass` style for unnamespaced).

To demangle:

```text
$ c++filt _ZN9MyClass5fnEi
MyClass::fn(int)

$ rabin2 -D ./binary _ZN9MyClass5fnEi
MyClass::fn(int)
```

R2 demangles automatically when you set `e bin.demangle=true`. The
demangled names show up in function lists and disassembly.

**Recovering class hierarchies:**

Each vtable's RTTI links to its base class's RTTI. By walking those
references you can reconstruct the inheritance tree:

```text
[0x...]> pxr 64 @ <vtable - 16>     # walk back to type_info
[0x...]> ps @ <name_addr>
[0x...]> pxw 64 @ <type_info>       # base class pointer
```

For non-trivial codebases, **Ghidra's `ClassRecovery` plugin** does
this automatically and is worth the trip to standalone Ghidra. The
**ClassyShark** project (for Android) and **`vtable_finder`** for r2
also help.

**Calling conventions for virtual functions:**

* **Itanium ABI** (Linux, macOS C++): first argument is the
  `this` pointer (`rdi`/`x0`/`r0`).
* **Microsoft ABI** (Windows C++): same idea on x64 (`rcx`); on
  x86 32-bit, `__thiscall` puts `this` in `ecx`.

A function that takes its first argument in `this`-position and
immediately dereferences it through offsets is almost certainly a
member function.

## Recognising runtime allocators

The `malloc`/`free` of a binary tells you about its provenance.
Each allocator has signatures.

**glibc malloc** (ptmalloc2):

* `arena_for_chunk`, `_int_malloc`, `_int_free` symbols (or their
  patterns).
* Chunks have an 8-byte (32-bit) or 16-byte (64-bit) header with
  size and flag bits.
* Tcaches in glibc 2.26+: per-thread caches with a distinctive
  linked-list shape.

**jemalloc** (FreeBSD, Firefox, some servers):

* Strings like `<jemalloc>: ...` or `je_malloc_init_hard`.
* Size classes that go through `arena_dalloc_small` /
  `arena_dalloc_large`.
* Often paired with `mallctl` for runtime stats.

**tcmalloc** (Google):

* Strings like `TCMALLOC_DEBUG`, `tcmalloc.aggressive_decommit`.
* `central_cache_`, `transfer_cache_`, `thread_cache_` symbols.

**dlmalloc** (Doug Lea):

* The classic, in many small/embedded Linux systems.
* `MAGIC_NUMBER` checks for chunk integrity.

**mimalloc** (Microsoft Research, newer projects):

* `mi_heap_*`, `mi_malloc`, `mi_free`.

**OpenBSD's omalloc / hardened_malloc**:

* Aggressive chunk guards, junk-filling, page-per-chunk for large
  allocations. Distinctive overhead patterns.

For embedded targets, custom allocators are common:

* **FreeRTOS heap_1/2/3/4/5** — distinctive `pvPortMalloc` and
  `vPortFree` entry points; the heap variant affects coalescing
  and fragmentation behaviour.
* **Zephyr `k_malloc`** — wraps a system heap with its own logic.
* **Newlib `_malloc_r`** — re-entrant variants for thread safety.

Each allocator's pattern is visible in disassembly. Once you
identify it, you know how memory is laid out (chunk headers, free
lists), which is invaluable for heap-overflow research.

## Name demangling

C++ and Rust mangle names so the linker can distinguish overloads
and namespaces. To read the source-equivalent names:

**C++ Itanium (Linux, macOS):** prefix `_Z`. Tools: `c++filt`,
`demangler` (Ghidra), `rabin2 -D`, online sites.

```text
$ c++filt '_ZN3foo3barEi'
foo::bar(int)
```

**C++ MSVC:** prefix `?`. Tools: `undname` (Windows SDK), Ghidra,
IDA. Example: `?bar@foo@@QAEHH@Z` → `public: int __thiscall foo::bar(int)`.

**Rust legacy:** Itanium-prefixed `_ZN`. Same demangler works but
output is ugly (`rustc_demangle` cleans it up).

**Rust v0 (current):** prefix `_R`. Tool: `rustc-demangle` or
`r2 -e bin.demangle=true -e bin.lang=rust`.

```text
$ rustfilt _RNvCs1S7gVpKVQAk_4main3foo
main::foo
```

**Swift:** prefix `$s` or `_T`. Tool: `swift-demangle`.

**Objective-C:** mostly readable as-is — `-[ClassName method:]`
selectors appear in the binary.

R2 with `e bin.demangle=true` and `e bin.demanglecmd=true` runs
the right demangler for the detected language. Ghidra handles this
in its analyser.

## Switch tables and indirect dispatch

Many functions compile a C `switch` into an **indirect jump
through a table**. The compiler emits a small bounds check, then
loads a target address from a `.rodata` table and jumps to it.

Patterns:

**x86_64 (GCC/Clang):**

```text
cmp     eax, 0xa            ; bounds check (default if > max case)
ja      .default
lea     rdx, [rip+0x12345]  ; jump table base
movsxd  rax, dword [rdx+rax*4]
add     rax, rdx
jmp     rax
```

The jump table at `[rip+0x12345]` is a list of `int32_t` offsets
relative to the table itself, *not* absolute addresses. R2's
analyser usually recovers these correctly with `aaaa` or `aac`.

**ARM Thumb-2:**

```text
cmp     r0, #10
bhi     .default
tbb     [pc, r0]              ; table branch byte
.tbl:
.byte   (case0-.tbl)/2, (case1-.tbl)/2, ...
```

`TBB` (table branch byte) and `TBH` (table branch halfword) are
ARM's compact dispatch encoding. R2 handles them but the table is
embedded in code and easy to confuse with instructions; mark with
`Cd 1 @ ...` if necessary.

**AArch64:**

```text
adrp    x0, .tbl@PAGE
add     x0, x0, .tbl@PAGEOFF
ldrb    w1, [x0, w2, uxtw]
adr     x3, .tbl
add     x3, x3, w1, sxtb #2
br      x3
```

Many switch tables defeat automatic xref recovery. When you see a
function with an `br` or `jmp` to a register and no recovered
outgoing edges, look for a nearby table. Annotate by hand (Chapter 11).

## Anti-disassembly defeat

Hostile binaries (and some packers) include code that defeats naive
linear disassembly. Common tricks:

**Junk byte after an unconditional branch.** The disassembler tries
to decode the byte after `jmp X` and gets garbage; the next valid
instruction is offset by a few bytes. Defeat by anchoring
disassembly at known good entry points and letting the analyser
follow control flow rather than linearly.

**Overlapping instructions.** Two valid instruction streams share
bytes. Reading the same bytes from different start offsets
produces different instructions. Defeat with a smart-disassembler
that understands the control flow.

**API hashing.** Code computes a hash of a function name and looks
it up in a table at runtime instead of calling it by name. Defeat
by computing the same hash over a list of likely names (GetProcAddress,
LoadLibrary, etc.) and matching.

**Self-modifying code.** Code patches itself before execution.
Pure static analysis fails; dynamic or emulation (Unicorn/Qiling)
is the answer.

**Opaque predicates.** Conditional branches whose condition is
always true (or always false), inserted to fool the analyser into
following both paths. Defeat by recognising the pattern (constant
comparisons, tautologies, dead-code-elimination-resistant tricks).

For each of these, the universal answer is: don't rely on linear
disassembly. Use control-flow-aware analysis (which all modern
disassemblers provide), and verify with dynamic analysis when the
binary actively fights back.

## Stack canaries and other compiler-inserted checks

Modern binaries include compiler-inserted security checks. They
look like code but aren't part of the program's logic:

**Stack canaries:** A magic value is pushed to the stack at
function entry and checked at exit. If the stack was overflowed,
the value changed, and the program aborts. Recognisable:

```text
mov rax, fs:[0x28]      ; load canary
mov [rbp - 8], rax      ; save on stack
...
mov rcx, [rbp - 8]
xor rcx, fs:[0x28]
jne stack_chk_fail
ret
```

Sometimes the canary is `__stack_chk_guard`; the failure handler
is `__stack_chk_fail`. Both are usually imported from libc.

**Shadow stack / CET (Control-flow Enforcement Technology):** On
modern x86_64 binaries with CET, every indirect-jump-target
function starts with `endbr64` (`endbr32` on 32-bit). Without it,
the CPU faults. R2 recognises this as `endbr64` mnemonic.

**Safe-Linking (glibc 2.32+):** Forward pointers in the free list
are XOR'd with the address of the storing chunk, so a heap overflow
can't trivially leak or hijack the list.

These are NOT part of the program's logic — pattern-recognise and
skim past them.

## Code-coverage as an analysis aid

When the binary runs in an environment you control:

1. Run the binary while exercising different inputs/features.
2. Collect **coverage** with `gcov`, `llvm-cov`, AFL's coverage
   collector, DynamoRIO, Frida's `Stalker`, or QEMU's `qemu-log`.
3. Plot which functions were executed and which weren't.

Code that ran during exercise is reachable from the inputs you
gave. Code that didn't is either dead, defensive, or reached by
input you haven't tried yet. The dead path is often the most
interesting — backdoors, debug-only features, opt-in
diagnostics — and is the right starting point for "what does this
binary hide?".

A simple coverage-mark workflow in r2:

```text
[0x...]> .!grep -oE '0x[0-9a-f]+' coverage.log | awk '{print "f covered."$1" = "$1}'
[0x...]> # then visualise via "covered." flag space
```

The same technique is used in fuzzing-driven reverse engineering:
generate inputs that maximise coverage; the inputs that reach new
code are the most interesting because they exercise new paths.

## Diffing as discovery

When you have two versions of a binary (v1 and v2 of a firmware,
patched vs unpatched, original vs malware-infected), **diffing**
reveals what changed. Three tools to know:

**BinDiff** (Zynamics, free as of recent versions): the
industry-standard binary diff tool. Matches functions by structural
similarity, classifies as identical, matched-but-changed, or
unmatched. Used with IDA or Ghidra.

**Diaphora** (free, IDA plugin): comparable approach, open source.

**r2pipe scripted diff** (Chapter 25 covers the script): hash each
function's disassembly text, compare hashes across two binaries.
Catches >80% of what you care about for incremental analysis.

Diffing is invaluable for:

* **Vulnerability research:** Bug fixes leak. The function that
  changed between v1.0.0 and v1.0.1 is your candidate vulnerability
  for v1.0.0 users who haven't updated.
* **Malware analysis:** Compare a clean binary against a possibly-
  tampered version. Differences are payload.
* **Update reverse engineering:** What did the vendor change?
  Often more revealing than the release notes.

## A few cross-target patterns worth knowing

**The "stack frame setup" recognition.** Every architecture has a
canonical function entry idiom — `push rbp; mov rbp, rsp` on x86;
`push {r4-r7, lr}` on Thumb; `stp x29, x30, [sp, #-N]!` on AArch64;
`addiu $sp, $sp, -N; sw $ra, ...; sw $fp, ...` on MIPS. Spotting
these helps you find function boundaries even when analysis is
incomplete.

**The "string table near a function pointer table".** When you
find a `.rodata` block with a list of function pointers
immediately followed by, or interleaved with, strings, you have a
dispatch table — likely command handlers in a daemon, callbacks
in a plugin system, or message handlers in a protocol parser. Map
the table, name each handler after its string.

**The "GOT load then call" pattern.** PIC code calls libc through
the GOT. Recognise `lea reg, [rip+got_entry]; call [reg]` as a
single logical "call function X" even though it's two instructions.

**The "long sequence of identical-looking calls".** Often
initialisation: registering callbacks, setting up a vtable,
populating a config struct. If you decode one and they all look
similar, the pattern likely repeats and you can batch-rename.

**The "everything ends in a tail call to abort()/panic()".** A
function that ends in `bl abort` or `call exit` from many places
is likely an assertion-failure path. Skim and move on.

These patterns are not specific to any tool. They are the texture
of compiled code, learnable by hours of reading regardless of
which disassembler you use.

## The point

The chapter on the playbook (Chapter 29) is about workflow
discipline. This chapter is about pattern recognition. The two
compound: discipline gives you the time to apply pattern
recognition; pattern recognition makes each session productive.

Reverse engineering plateaus stop being about the tool around year
2 or 3; from then on the bottleneck is the *catalogue of patterns
in your head* and the *speed at which you recognise them*. Both
grow with practice. The exercises that grow them fastest are:

* Reverse engineer one open-source binary every few weeks, then
  compare your reconstruction against the actual source.
* Read disassembly produced by every compiler you can install,
  for the same C source, to learn each compiler's idioms.
* Reproduce the constants and patterns in the tables above from a
  binary you grep through, until you can spot them at a glance
  without help.

The tool you use to do this matters less than that you do it. The
sections of this chapter that survive — and the patterns you
recognise from them ten years from now — will not be tied to any
particular disassembler.
