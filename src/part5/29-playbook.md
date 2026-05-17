# The Reverse Engineer's Playbook

The chapters so far covered tools and architectures. This chapter
covers practice — the tricks, recognition patterns, and habits that
distinguish someone who has been doing this for ten years from
someone who has been doing it for one. None of the items here are
deep individually; together they are most of what makes the
difference.

## Recognition patterns: things you should spot at a glance

Spot the pattern, and you save the read.

**Function prologue and epilogue.** Every architecture has them.
Memorise the canonical forms (Chapter 12, 13, 15, 16, 17). When
you see a prologue mid-function, you have the wrong function
boundary; when you see no prologue at all, you may be looking at
hand-written assembly or a tail-called function.

**String-decode loops.** A short loop reading bytes from one buffer,
applying an operation, writing to another. Very often a deobfuscator,
checksum, or trivial XOR/RC4-style cipher. The shape is the same
across architectures.

**S-box lookups.** A `lookup[A] ^ lookup[B] ^ lookup[C] ^ lookup[D]`
sequence in 16-byte blocks is AES. A 64-byte lookup at the start of
the function is DES or Blowfish. A 256-byte lookup with a
permutation pattern is RC4. Memorise the constants:

| Constant                     | Algorithm                       |
|------------------------------|---------------------------------|
| `0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476` | MD5 IV |
| `0x6a09e667, 0xbb67ae85, ...` | SHA-256 IV                     |
| `0x428a2f98, 0x71374491, ...` (64 entries)       | SHA-256 round constants |
| `0xc3a5c85c, 0x97f4a7c1, ...` | xxHash                         |
| `0xed5b9b91, ...`             | CityHash                       |
| `0x9e3779b9`                  | TEA / golden ratio (also various hashes) |
| `0xdeadbeef`, `0xcafebabe`    | filler/marker, often bug pattern |
| `0x5a5a5a5a`, `0xa5a5a5a5`    | RAM-test / stack-canary fill   |

**CRC tables.** A 256-entry table of 32-bit values that look
random-ish is almost always a CRC32 lookup. The polynomial
determines the variant (Ethernet CRC, ZIP CRC, USB CRC).

**LZSS / LZMA / Deflate decoders.** Look for sliding-window history
buffers (~4 KiB or 32 KiB), bit-stream readers, and Huffman tree
walking. The distinctive shape: a tight inner loop with byte-level
input, table lookups, and pointer-back copies into the output.

**State machines.** A switch on a state variable that updates the
state in each case is a state machine. Common in network stacks,
protocol parsers, and bootloader update logic. Map the state
transitions on paper.

**Function-pointer dispatch tables.** A const array of function
pointers, indexed by some message ID or command code. Find the
table, enumerate the handlers, name them by index.

**Vtables.** Inheritance in C++ — an object's first word points to
a vtable. The vtable's entries are virtual function pointers. RTTI
(if present) names them. Without RTTI, you infer names by reading
each handler.

## Naming discipline

A function with a meaningful name is half-understood. A function
with `fcn.080012a0` requires you to re-read it every time. Spend
the time to name.

A naming convention that scales:

* **Verbs for actions:** `parse_packet`, `init_uart`, `setup_dma`.
* **Nouns for accessors:** `get_temperature`, `read_status`.
* **`is_` / `has_` for predicates:** `is_valid_header`,
  `has_pending_irq`.
* **`sub_` / `helper_` prefix when you do not yet know what it
  does** but you need to call it something. Easier to recognise as
  "to be revisited" than `fcn.X`.
* **Vendor / module prefix when applicable:** `HAL_GPIO_Init`,
  `lwip_tcp_send`, `ble_event_handler`. Keeps related functions
  visually grouped.

Avoid:

* Generic names like `do_thing`, `process`, `handle`. They look
  named but tell you nothing.
* Names from another binary. If you copied "rsa_verify" from a
  reference but you have not verified the function does RSA, you
  will trust it later when you should not.
* Hyper-specific names that bake in an assumption: `parse_ipv4_packet`
  is fine if you know it parses IPv4; `parse_packet_assuming_v4`
  is better if you are still guessing.

## Note-taking discipline

Findings that are not written down are findings that have to be
rediscovered. Keep a markdown file alongside the r2 project:

```text
project/
├── firmware.bin
├── firmware.r2 project files...
├── load.r2                # load script
├── notes.md               # human notes
├── types.h                # exported types from r2
├── peripherals.r2         # flag definitions
└── scripts/               # r2pipe scripts
```

Commit the directory to git. The git history becomes a chronological
log of what you understood about the binary and when.

In `notes.md`, structure by topic, not date:

```markdown
# firmware-v1.2

## Overview
- STM32F407, 1 MiB flash, 192 KiB RAM
- Built with arm-none-eabi-gcc 13.2
- HAL version: STM32CubeF4 1.27.1
- FreeRTOS port detected (PendSV handler at 0x08001234)

## Key functions
- `main` @ 0x080012a0 — sets up clocks, peripherals, starts FreeRTOS
- `usb_handle_setup` @ 0x08005000 — USB control transfer dispatch
- `firmware_update_handler` @ 0x0801a000 — update mechanism, see TODO

## Findings
### USB descriptor strings reveal product identity
- VID 0x0483 (STMicroelectronics), PID 0xdf11 (DfuSe)
- This is a DFU-class device

### Update protocol uses CRC32 only — no signature
- crc32 verify at 0x0801a4d0
- No public-key check anywhere
- WARN: TODO: verify exploitability

### Serial number derivation is from chip UID
- reads 96-bit UID at 0x1FFF7A10
- truncates to 64 bits
- prints as hex
```

A future you (or a colleague) opens `notes.md` and is up to speed
in 5 minutes. Without it, you spend 2 hours rediscovering.

## Project hygiene

A working project, in addition to the binary and notes:

* **Always save before risky operations.** Before `aaaa`, before
  bulk renames, before LLM-driven naming. `Ps something_v2`.
* **Tag known-good states with descriptive project names.** Not
  `firmware_v2`, but `firmware_v2_after_string_pass`,
  `firmware_v2_irqs_named`. You will want to fork from a specific
  point and the tags help.
* **Keep your r2 commands reproducible.** Every annotation you make
  should be reproducible from a script (`P*` exports the project
  as r2 commands). If the project file gets corrupted, you can
  rebuild.

## Differential techniques

Many problems get easier when you have a comparison.

**Diff two firmware versions.** Chapter 25 has the script. Look at
the changed functions. Bug fixes leak: the function that got fixed
is a clue to what was broken in the prior version, which is a
candidate vulnerability for users who have not updated yet.

**Diff vendor SDK builds.** Same SDK, different config (debug vs
release; different feature flags). Identify which functions are
debug-only and which appear in both.

**Diff against a known-good binary.** When you suspect tampering,
compare against a clean download. Match by structural signature,
not byte-for-byte (which is too sensitive to compiler version).

**Diff the live device against the released image.** A device
in the field whose flash content differs from the released image
has been modified — by the vendor (silent update), by previous
owner (root, jailbreak), or by an attacker (persistent malware).

## Coverage as a navigation aid

When you have a binary you can run (in QEMU, on hardware, in Frida-
hooked Linux):

1. Run the binary while exercising different features.
2. Capture which functions were executed (via tracing, via Frida
   `Stalker`, via QEMU's `qemu-log`).
3. In r2, mark the executed functions.

Now you can see, while reading, which paths you have actually
exercised. The functions that never get touched are dead code or
require specific input to reach. Both are interesting.

For a network daemon: open every TCP/UDP port from the outside,
hit it with a junk message, see which handler fired. Map the dispatch
table by observation, not by reading.

## The "find printf" reflex

In any binary, find printf (or its non-standard equivalents:
`puts`, `_log`, `ESP_LOG`, `RTT_printf`, `LOG_TRACE`). Then look at
every caller. Every caller is a function whose author considered
something worth logging — typically an error path, a state change,
or a user-facing event. Each call site has a format string that
hints at what the function does.

This is the single highest-yield search in any non-trivial binary.

## "Find imports, follow them backwards"

For a Linux binary, list every import. For each import that looks
interesting (`socket`, `ioctl`, `mmap`, `recv`, `crypt`,
`SHA256_Update`, anything dlopen-ish), find every caller. Each
caller is a leaf of attack surface or business logic. Build the
inverse graph in your head: imports -> users -> users-of-users ->
entry points.

## Dead-code recognition

Some functions get included in the binary but are never reached at
runtime. Reasons:

* Compiled-in debug code that is conditionally compiled but the
  condition never holds at runtime (e.g., `if (build == DEBUG)
  with build = RELEASE`).
* Vendor SDK functions that the linker did not garbage-collect
  because they are referenced from a `__attribute__((used))`
  table, even if no live code calls them.
* Backdoor or development backdoor code that the vendor "removed"
  by `#if 0`-ing the call site but left the function body.

To find dead code: build the call graph from `entry0`, mark
reachable functions, list the rest:

```python
import r2pipe
r2 = r2pipe.open("firmware.bin", flags=["-2"])
r2.cmd("aaa")
all_fns = {f["offset"] for f in r2.cmdj("aflj")}
reachable = set()
queue = [int(r2.cmd("?v entry0").strip(), 16)]
while queue:
    addr = queue.pop()
    if addr in reachable: continue
    reachable.add(addr)
    for ref in r2.cmdj(f"axffj @ 0x{addr:x}") or []:
        if ref.get("type") == "CALL":
            t = ref.get("ref", 0)
            if t in all_fns:
                queue.append(t)
print(f"Dead functions: {len(all_fns - reachable)}")
for addr in sorted(all_fns - reachable):
    print(f"  0x{addr:x}")
```

Read every dead function. Some are duds (compiler artefacts); some
are surprising.

## Padding and entropy mapping

Walk the entropy of the binary in 4 KiB windows. Boundaries between
high- and low-entropy regions are the section boundaries. A high-
entropy region surrounded by low-entropy is probably compressed or
encrypted data; a low-entropy region surrounded by high-entropy is
probably padding or a string table.

```text
$ binwalk -E firmware.bin
```

Or in Python:

```python
import math, collections
data = open("firmware.bin","rb").read()
W = 4096
for i in range(0, len(data), W):
    chunk = data[i:i+W]
    c = collections.Counter(chunk)
    e = -sum((v/W)*math.log2(v/W) for v in c.values())
    print(f"0x{i:08x}  entropy={e:.2f}")
```

You will spot OTA blobs, compressed images, encrypted partitions,
and accidentally-shipped debug data without ever loading them.

## Magic-number cross-reference

Build a personal table of "I have seen this number before".
Examples that come up constantly:

* `0xDEADBEEF`, `0xCAFEBABE`, `0xBAADF00D` — common markers
* `0x1BADB002` — Multiboot magic
* `0x000FF000` — common SAM-BA bootloader signature
* `0x1F8B` — gzip
* `0x424D` — BMP image
* `0x89504E47` — PNG image
* `0x7F454C46` — ELF
* `0xE9` (single byte at start of file) — ESP image
* `0x27051956` — uImage
* `0x68737173` — squashfs (BE)
* `0x18B52FD9` (or `0xFD2FB528` LE) — Zstandard

Recognising any of these from a hex dump is one fewer Google search.

## Time discipline

Reverse engineering expands to fill all available time. To stay
productive:

* **Box your sessions.** A 4-hour focused session is more productive
  than a distracted day. Take real breaks between.
* **Set a goal per session.** "Today I want to map the USB
  initialisation path." Not "today I want to understand this
  binary."
* **Stop when you are guessing.** If you have read the same code
  three times and your guesses are getting more elaborate, you are
  past the point of diminishing returns. Sleep, then come back.
* **Write down dead ends.** "I thought function X was Y but it
  turned out to be Z" — write it. Future you will go down the same
  dead end without the note.

## Stay curious about the architecture

The fastest improvement in your reverse engineering skill is
learning new architectures. Each one teaches a new way of thinking
about computation: 8051's harvard architecture, Xtensa's register
windows, RISC-V's compressed extension, MIPS's delay slots. Once
you have read code for five architectures, the sixth feels familiar
on the first day, not the third week.

The same applies to compilers. Read the same C function compiled by
GCC, Clang, ICC, and ARMCC. Recognise each compiler's idioms. When
you see them in production binaries, you save the read.

## A short list of attitudes

* **Verify before believing.** Decompiler output, LLM suggestions,
  documentation. Trust nothing you have not seen in the binary.
* **Respect the original author.** The code you are reading was
  almost certainly written by a smart engineer under constraints
  you do not see. "What were they thinking?" is a more useful
  question than "what idiot wrote this?".
* **Record everything.** Notes, scripts, projects, hypothesis
  branches. Future you will thank present you.
* **Share findings.** Publish the techniques (this book is one).
  The field gets better when everyone shares; you get better by
  having to explain.

These habits compound. None of them is hard. The discipline of
applying them every session is what separates enthusiasm from
expertise.
