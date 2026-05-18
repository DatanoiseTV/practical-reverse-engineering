# Fuzzing Embedded Targets

Fuzzing — feeding semi-random inputs to a program and watching for
crashes, hangs, or memory errors — is the single highest-yield
vulnerability-discovery technique of the last fifteen years. Linux
userland fuzzing with AFL++, libFuzzer, and Honggfuzz is by now
routine. Embedded firmware fuzzing is harder: the input surface is
implicit, crashes don't produce signals you can catch, coverage
feedback is inaccessible from the outside, and execution on real
hardware is slow.

The good news is that the field has matured significantly since
2018. Academic and industrial research has produced a small
ecosystem of tools and techniques for re-hosting firmware in
emulators, driving it with fuzzer inputs, and recovering coverage
without source code. This chapter surveys the techniques and
points to the tooling that makes them practical.

## What fuzzing is, conceptually

A fuzzer wraps a target program in a loop that:

1. Picks an input from a corpus (or generates one from scratch).
2. Mutates the input (flips bits, splices fragments from other
   inputs, applies grammar-aware mutations).
3. Runs the target with the mutated input.
4. Observes the result — does the target crash, hang, time out,
   trigger an ASan / UBSan report, or just process the input
   normally?
5. If the result is novel — new coverage edges executed, new
   crash signature seen — keeps the input and uses it as a seed
   for future mutations.

The two operative ideas: **mutation guided by feedback** (you
explore inputs that exercise new code paths preferentially), and
**at scale** (millions of executions per day; many fuzzers run
continuously for days or weeks per target).

## Why embedded fuzzing is hard

* **No standard input source.** Linux userland fuzzing wraps the
  target so it reads input from stdin or a file. Firmware reads
  from UART, USB, BLE, CAN, sensors over I2C — every target has
  a different interface to instrument.
* **Crashes are silent.** On Linux, a process that segfaults
  raises SIGSEGV and the fuzzer notices. A microcontroller that
  faults will typically reset, jump to a fault handler, or hang.
  None of these are easy to detect from outside.
* **No memory error detector.** AddressSanitizer requires
  recompiling with instrumentation. Closed firmware can't be
  recompiled. Bugs that corrupt memory silently may not
  manifest as visible misbehaviour.
* **Execution is slow.** A real Cortex-M at 100 MHz running one
  test case in 100 µs gives you 10,000 tests/second per device.
  An AFL++ instance on a Linux box runs millions/second. Many
  embedded fuzzers need to scale through emulation, parallelism,
  or both.
* **Coverage feedback is closed.** AFL++'s effectiveness comes
  from edge coverage instrumentation. Firmware images don't
  expose coverage to the outside; you have to engineer it via
  emulation, hardware tracing, or static instrumentation.
* **Peripheral interactions are stateful.** Many bugs only
  trigger when the firmware is in a specific state set up by
  prior peripheral interactions. Fuzzing must model that.

Despite all this, embedded fuzzing has produced significant
public bug discoveries — the references at the end include
several.

## Four practical approaches

### 1. Fuzz on the host, ignore the hardware

If the firmware's vulnerable code is a self-contained parser or
state machine — a JSON parser, an OTA-update header validator, a
protocol decoder — extract that code (or reimplement it from your
reverse engineering) and fuzz it on Linux with AFL++ or
libFuzzer.

```c
// Linked into a libFuzzer harness:
#include <stdint.h>
#include <stddef.h>

extern int firmware_parse_ota_header(const uint8_t *buf, size_t len);

int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size) {
    firmware_parse_ota_header(data, size);
    return 0;
}
```

```text
$ clang -fsanitize=fuzzer,address,undefined -o fuzz fuzz.c parser.c
$ ./fuzz corpus/
```

Pros: fastest possible execution, AddressSanitizer catches
memory bugs, AFL++ tooling Just Works. Cons: you've extracted the
code from its environment; bugs that depend on peripheral state or
specific RTOS scheduling won't trigger.

This is the cheapest, highest-yield approach for any
self-contained parser. Many high-impact vulnerabilities in
embedded TLS / TLV / image-format code have been found this way.

### 2. Emulate the firmware whole

Tools like QEMU's user-mode emulation (for Linux userland targets)
and full-system emulation (for whole firmware images) let a fuzzer
drive the firmware as if on real hardware.

**AFL++ in QEMU mode** (`afl-fuzz -Q`) emulates an x86 / ARM
Linux binary on the host with built-in coverage instrumentation.
For any Linux router binary or similar, this is the obvious tool.

**Unicorn-based fuzzers** (Unicorn Engine, the embeddable CPU
emulator from the Capstone project) let you write a Python harness
that loads a single function from firmware, sets up registers,
runs it, and observes the result. Tools built on this idea include
**unicorefuzz** and **fuzzgen**.

**Avatar2** (`https://github.com/avatartwo/avatar2`) — academic
framework from EURECOM. Orchestrates QEMU, real hardware, and
GDB; lets you partially emulate firmware while forwarding
peripheral accesses to real silicon. The "partial emulation"
model handles cases where you can't model a peripheral but you
can leave it on the bench and forward MMIO reads/writes through
JTAG.

### 3. Re-host with synthetic peripherals

The most active research area in embedded fuzzing. Tools in this
family figure out what peripherals the firmware needs and provide
synthetic implementations that return whatever the firmware
expects, so the firmware runs to completion under a fuzzer.

* **HALucinator** (Clements et al., USENIX Security 2020). Maps
  HAL (Hardware Abstraction Layer) function calls in firmware to
  user-supplied handlers, decoupling the firmware from hardware
  models. Works well for firmware built against widely-used HALs
  like STM32 HAL.
* **P²IM** (Feng et al., USENIX Security 2020). Automatically
  models peripheral behaviour by observing firmware accesses to
  MMIO; uses pattern detection to provide plausible peripheral
  responses without manual modelling.
* **Fuzzware** (Scharnowski et al., USENIX Security 2022). Uses
  symbolic execution to determine which bits of MMIO reads
  actually matter to control flow, and only mutates those bits.
  Considerably reduces wasted fuzzing on irrelevant peripheral
  values. The project is open source and actively maintained.
* **µAFL** (Li et al., 2022). Hardware-in-the-loop AFL using the
  on-chip ARM CoreSight trace unit for coverage.
* **GENESIS** (Eceiza et al., 2021). Re-hosting framework
  targeting industrial firmware.

Each of these has corresponding academic papers freely available
through USENIX Security, NDSS, IEEE S&P, or CCS proceedings. The
code repositories are public; reproducing the published
experiments is a good way to learn the techniques.

### 4. Fuzz the protocol, not the firmware

When you can't get inside the firmware but you can talk to it
over a protocol — USB, BLE, CAN, network — you can fuzz the
protocol from outside. Tools:

* **boofuzz** (`https://github.com/jtpereyda/boofuzz`). Active
  fork of Pedram Amini's Sulley. Protocol-fuzzer framework: you
  define request templates with field types (strings, ints,
  delimiters, blocks), and boofuzz generates many semi-valid
  variations and sends them over your transport (TCP, UDP,
  serial, sockets).
* **AFL++ in network mode** with a harness that drives the
  network stack from a captured corpus.
* **Frida-based fuzzers** for protocols where the client-side
  app produces the requests; intercept the requests, mutate
  them, observe the device's response.

Boofuzz against an embedded network daemon is a one-evening
project for a working engineer with some Python comfort. Pair it
with manual analysis (Chapter 24) so you know what to mutate.

## Detecting crashes on embedded targets

The hard problem of embedded fuzzing. Approaches:

* **In emulation**, run the firmware in QEMU/Unicorn with a fault
  handler that translates ARM HardFault into a host-visible
  signal the fuzzer can catch. Trivial for any emulator-based
  workflow.
* **Heartbeat over UART or GPIO**. The firmware sends a heartbeat
  every N ms; the fuzzer notices when it stops. Catches crashes
  and hangs but not silent corruption.
* **JTAG / SWD halt detection**. Attach a debugger to the
  running target; the debugger reports when the CPU enters a
  fault handler. Slower per-iteration but accurate.
* **Hardware watchdog observation**. The firmware's own watchdog
  resets on hang; instrument the reset line.
* **External shadow execution.** Run the same firmware in
  emulation as a reference; compare outputs.

For research-grade work, instrumented emulation (approach 1)
dominates because of the speed advantage. For one-off bug hunts
against deployed devices, heartbeat and watchdog observation can
be enough.

## Triaging crashes

A successful fuzzing campaign produces many crashing inputs. The
work is then to:

* **Minimize.** Reduce each crashing input to the smallest input
  that still crashes. `afl-tmin`, libFuzzer's `-minimize_crash`,
  or manual bisection.
* **Cluster.** Group crashes by stack trace and unique program
  counters; collapse duplicates. `afl-cmin -C`, `crashwalk`, or
  ad-hoc scripts.
* **Categorise.** For each unique crash:
  * Is it a hang or an out-of-memory? Often not exploitable.
  * Is it a NULL-pointer dereference? Generally limited to DoS.
  * Is it a stack/heap buffer overflow? Potentially exploitable;
    needs deeper analysis.
  * Is it a use-after-free or double-free? Often exploitable.
* **Reproduce and root-cause.** Run the minimised input in a
  debugger / emulator; verify the crash; identify the function
  and operation responsible. The reverse-engineering techniques
  from Parts II and III come into play here.
* **Assess impact.** Local crash? Remote? Pre-auth? With what
  side effects? The same disciplined approach as classical
  vulnerability research.
* **Disclose responsibly.** Contact the vendor through their
  PSIRT or coordinated-disclosure address; agree a publication
  timeline; publish after the patch ships. CERT/CC, CISA, and
  CVE.org coordinate when the vendor is unresponsive.

## Real published embedded fuzzing results

A short list of fuzzing-discovered bugs in embedded firmware that
have public writeups, to make the field concrete:

* **SweynTooth** (NTU Singapore, 2020) — BLE link-layer
  vulnerabilities discovered by fuzzing Bluetooth stacks of
  several SoC vendors. Method documented in the academic paper.
* **Fuzzware demonstration results** (Scharnowski et al., 2022)
  — discovered previously-unknown bugs in widely-used embedded
  software components during their evaluation.
* **HALucinator paper evaluation** — discovered several
  previously-unreported issues in HAL-based firmware during
  the published evaluation.
* **Trail of Bits' embedded fuzzing engagements** — multiple
  blog posts documenting bugs found in customer firmware
  through emulator-based fuzzing.
* **Google's Project Zero embedded research** — historically
  including fuzzing-derived findings in WiFi chip firmware
  (Broadcom Wi-Fi research from 2017 onwards by Gal Beniamini).
* **Ledger Donjon's open-source fuzzing tooling** and published
  research on hardware wallet firmware.

The pattern across the literature: significant published bugs
come not from running off-the-shelf AFL++ against a random
firmware image, but from careful target preparation (re-hosting,
harness writing, peripheral modelling) followed by long-running
fuzzing campaigns. The infrastructure investment is the bulk of
the work; the actual fuzzing is the easy part.

## A practical first project

If you have never fuzzed an embedded target before, the cheapest
way to gain ground is:

1. Pick a parser-heavy router firmware (OpenWrt-based; the
   binaries are MIPS Linux).
2. Extract a single binary that handles HTTP requests
   (lighttpd / httpd / vendor CGI).
3. Build a libFuzzer harness around the request-parsing function
   you reversed.
4. Compile the harness for x86 with AddressSanitizer.
5. Run libFuzzer with a corpus of valid HTTP requests as seeds.
6. Triage findings; manually confirm they reproduce against the
   real binary running under QEMU's user-mode emulator.

A weekend of this work routinely produces real crashes, many of
which are at least DoS-class vulnerabilities. The same approach
scales to ESP-IDF code, FreeRTOS network stacks, and any other
embedded software with a self-contained parser.

## Reading

* **AFL++ documentation** (`https://aflplus.plus`). The standard
  fuzzer. The tutorial pages cover both basic usage and
  embedded-specific modes.
* **libFuzzer documentation** in the LLVM project. Best for
  in-process function fuzzing.
* **boofuzz documentation** at `boofuzz.readthedocs.io`. For
  protocol fuzzing.
* **Fuzzware** project on GitHub (`https://github.com/fuzzware-fuzzer`).
  Code and papers.
* **HALucinator** project (`https://github.com/embedded-sec/halucinator`).
  Code and paper.
* **Avatar2** documentation and academic papers from EURECOM.
* **USENIX Security, NDSS, IEEE S&P, ACM CCS** — proceedings
  are free online. Search for "embedded fuzzing" and "firmware
  re-hosting" to find the academic state of the art.
* **The IoT Goat project** by OWASP — intentionally vulnerable
  IoT firmware that's perfect for practising fuzzing without
  legal risk.

Embedded fuzzing is one of the highest-leverage skills a security
researcher can develop in the current decade. The publication
frequency in the field is high, the tooling is improving rapidly,
and the underlying problem (lots of unaudited firmware on lots of
devices) is not going away.
