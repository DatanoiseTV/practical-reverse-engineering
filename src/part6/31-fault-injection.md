# Fault Injection and Glitching

The chapters so far worked with whatever the chip willingly tells
you: code in flash, output on a UART, registers visible through
SWD. When the chip refuses — readout protection enabled, secure
boot enforced, debug locked — there is a second class of techniques
that does not ask for permission. **Fault injection** (FI) is
deliberately knocking a chip off-rails for a few nanoseconds so it
mis-executes a single instruction or mis-reads a single byte. Done
in the right place, that single fault skips a security check,
returns a wrong value from a fuse read, or breaks a conditional
branch so secret-handling code runs in a non-secret context.

This chapter is an honest, citation-grounded overview of the field.
It does not contain step-by-step recipes for any specific commercial
device. It does explain enough that, combined with the references
at the end, you can decide whether FI is the right tool for your
problem and what hardware to buy if it is.

## What fault injection is, mechanically

A microcontroller is a synchronous digital circuit. Every flip-flop
samples its input on a clock edge; every gate's output is valid
only after a setup time on its inputs. The chip works because every
signal has settled to a clean `0` or `1` before the next clock
edge captures it.

A glitch violates that contract on purpose:

* **Voltage glitching** — briefly drop the core supply rail
  (`Vcore`) below its specified minimum. Some flops fail to retain
  their value; some combinational paths fail to evaluate in time.
  The chip's instruction stream continues but with the wrong bits
  somewhere.
* **Clock glitching** — feed in a much shorter clock cycle than
  the chip expects, or an extra edge between normal edges. Logic
  that takes a full cycle to evaluate gets sampled early, producing
  garbage.
* **Electromagnetic (EM) fault injection** — fire a brief pulse
  from a small coil held against the package. Eddy currents in the
  die's metal layers flip the state of nearby flops.
* **Laser fault injection** — focus a short laser pulse on a
  thinned-down silicon die. The photons generate carriers in the
  doped regions and flip individual gates.

The first two are accessible to anyone with a few hundred dollars
of equipment. EM is harder (the coil and pulse generator are
non-trivial). Laser is laboratory equipment. Most published attacks
against commercial microcontrollers use voltage or EM.

## What you can hope to achieve

Realistic outcomes from a successful glitch in an attack chain:

* **Skip a conditional branch.** The most common useful primitive:
  the chip evaluates `if (rdp_enabled) { lock_debug(); }` and the
  fault causes the branch to fall through.
* **Wrong value from a fuse read.** The eFuse sequencer reads a
  byte; the fault causes the read to return all `1`s or to leak a
  previous bus value, bypassing the "protection enabled" flag.
* **Corrupt a comparison result.** PIN check: `if (memcmp(input,
  stored, 4) == 0)`. The fault forces `==` to be true regardless
  of the inputs.
* **Skip a CRC / signature check.** The bootloader validates the
  application image and would refuse to jump to a tampered one; the
  fault skips the validation.
* **Recover the program counter from an unexpected location.** A
  reset vector glitch, or a fault during context-switch save, can
  expose secrets in registers or memory that should not be readable.

What FI does **not** do well:

* Read out an entire flash image directly — you usually need a
  follow-up step (re-enable the debug port, or chain FI to a flash
  read primitive).
* Defeat strong cryptographic operations — DES/AES still work
  bitwise correctly even with corrupted state; you want SCA
  (Chapter 32) for that.
* Work against properly hardened code with hardware glitch
  detection (modern Cortex-M v8.1 and some secure elements include
  it).

## The tools

**ChipWhisperer** (`https://github.com/newaetech/chipwhisperer`,
`https://newae.com`). Open hardware and software for both SCA and
FI. By Colin O'Flynn (NewAE Technology, Halifax). Variants in
production at time of writing:

* **ChipWhisperer-Nano** — entry-level, USB-powered, ~USD 50–100.
  Voltage glitching only, fixed target. Good for learning.
* **ChipWhisperer-Lite** — the long-standing standard. ~USD 250.
  Voltage + clock glitching, capture for SCA, ARM target on board.
* **ChipWhisperer-Husky** — newer, more capable, ~USD 1k. Adds
  higher trigger speed, better capture depth.
* **ChipWhisperer-Pro** — for serious SCA work, much larger
  capture buffers.

The accompanying **NewAE Wiki** and Jupyter-notebook tutorials are
freely available and step-by-step.

**ChipSHOUTER** (also NewAE). Dedicated EMFI tool. ~USD 10k. Coil
mounted on an XY stage; pulses up to a few hundred volts into the
coil for the EM transient. Used in published research and in
professional pen-test labs.

**Riscure Inspector FI** and **Inspector SCA** — commercial,
professional tooling from Riscure (Delft). Tens of thousands of
dollars. Used by secure-element vendors, automotive OEMs, payment
labs. White papers are often public.

**DIY voltage glitchers** — for hobbyist-level voltage glitching,
people have built crowdsourced PCBs around a fast N-channel MOSFET
(to short Vcore briefly to ground), an FPGA or fast MCU for
timing, and a target socket. The Hardware Hacking Handbook
(reference below) covers this in detail.

The combination "ChipWhisperer-Lite plus the public NewAE
tutorials" is the best entry point for a working engineer. You can
reproduce published academic attacks within a weekend.

## Target preparation

Before you can glitch a chip you need to:

1. **Identify the core voltage rail and its decoupling.** Modern
   MCUs have a `Vcore` separate from I/O voltage (typically 1.2 V
   or 1.8 V for the core; 3.3 V for I/O). Find it on the schematic
   or with a multimeter. Glitching Vcore is what you want; the
   I/O rail's brownout would simply reset the chip.
2. **Reduce decoupling locally.** Glitching means pulling the rail
   low for a few nanoseconds; if there's a 10 µF capacitor right
   at the core pin, you cannot do that fast enough. Many published
   attacks involve removing on-board ceramic caps near the part.
3. **Establish a trigger.** The chip must do the operation you want
   to fault at a known, repeatable time. The trigger can be:
   * a GPIO the firmware toggles before the operation,
   * a pattern in UART output the glitcher matches against,
   * a power-rail pattern the glitcher recognises,
   * a reset event with a fixed timing offset.
4. **Find the glitch parameters.** Three knobs to sweep: offset
   from trigger (when to glitch), width (how long to hold the
   rail low), and amplitude (how low to pull it). The search space
   is huge. Tools provide hill-climbing or genetic search; brute
   force with a few thousand trials per parameter combination is
   also common for first-pass exploration.

A successful glitch campaign on a previously-attacked chip can run
in hours. A campaign against a new target — locating the right
operation in time, finding parameters that produce useful faults
without crashing the chip outright — can take weeks.

## Published real-world attacks

This is not an exhaustive list, but each item is independently
verifiable from the source it cites. Where I am unsure of a
specific year or revision, I have left it general.

**Espressif ESP32 secure boot bypass — LimitedResults
(limitedresults.com).** A widely-cited series of blog posts
(2019–2020) documenting voltage glitching against ESP32 V1 silicon.
The attacks bypassed the secure-boot signature check and, in
follow-up work, recovered the flash-encryption key from eFuses by
faulting the fuse-readout state machine. Espressif issued silicon
revisions and software mitigations in response; later ESP32 variants
(S2/S3/C-series) have additional countermeasures.

**Nordic nRF52 series APPROTECT bypass — LimitedResults and
others.** Voltage glitching used to bypass the readback protection
on nRF52832 / nRF52840 in production silicon. Documented in multiple
blog posts and a Black Hat USA 2020 presentation (Tomas Sušánka,
"nRF52 Debug Resurrection (APPROTECT Bypass)"). Nordic later
released revised silicon that mitigates the attack.

**Trezor One PIN-counter bypass — Kraken Security Labs (2019).**
Voltage glitching used to bypass the PIN-retry counter on the
Trezor One hardware wallet, enabling unlimited PIN guessing.
Required physical possession of the device and disassembly.
Documented in their blog post and a series of follow-up
responses from Trezor (who issued mitigations in firmware).

**STM32 readout-protection downgrade.** Multiple researchers have
demonstrated downgrade attacks against STM32 RDP Level 1 (and in
some published cases against Level 2) using voltage or EM
glitching. Documented in Hardware Hacking Handbook chapters and
in multiple Hardwear.io / Black Hat talks. ST has updated guidance
and recommends additional defensive measures in their AN4701
"Proprietary Code Read-Out Protection on STM32" application note.

**Smartcard glitch attacks.** A long-running research thread in
the academic literature dating from the late 1990s. Eurocrypt,
CHES, and FDTC have decades of papers on faulting smartcard
implementations of RSA, DES, and AES. These attacks are why modern
smartcards include dedicated glitch detectors.

**Tesla Model S/X infotainment dumps.** Multiple researchers
(Comma.ai, KU Leuven and others) have documented eFuse and key
extraction work against Tesla MCU silicon, including techniques
involving fault injection. Tesla has updated countermeasures in
successive hardware revisions.

For each of these, the underlying research is the citation — read
the original sources rather than the press coverage. Press articles
about "hardware hacks" frequently omit or distort the specifics
that matter.

## Mitigations and detection

Defensive techniques the chip designer can deploy, and that you
will increasingly see in modern silicon:

* **Hardware glitch detectors.** Comparators on the supply rail and
  on the clock that trigger a reset if they detect an out-of-spec
  condition. Now standard on ARMv8-M security extension parts and
  on most modern secure elements.
* **Redundant computation.** Compute the security-critical check
  twice (or three times) and compare. A single fault that flips
  one result does not flip the other. The Hardware Hacking
  Handbook calls this "do it twice" and covers patterns in detail.
* **Constant-time / data-independent flow.** Convert the
  branch-on-secret pattern (`if (auth_ok) ...`) into a
  data-flow that uses the result without branching. Even when
  glitched, the path executes the same instructions.
* **Random dummy operations.** Insert non-deterministic delays
  before security-critical operations. The attacker's trigger
  becomes harder to align.
* **Memory and bus parity / ECC.** A faulted bus transfer is
  detected by ECC and either corrected or signals a fault.
* **Defensive programming idioms.** "Never trust a `==` for a
  security decision; use bitwise checks where a single bit flip
  changes the outcome predictably." There is academic literature
  ("Fault-attack-resistant cryptographic implementations") covering
  this in depth.

For a working engineer doing reverse engineering — not defence —
the relevance is that newer silicon is harder to glitch. Attacks
against parts released in the last 2–3 years are typically harder
than against parts from a decade ago.

## When to choose FI vs. another approach

FI is the right tool when:

* The chip refuses to give up its secrets through normal channels.
* Debug is locked; flash is read-out-protected; no remote bug-class
  exploit exists.
* You have physical access to the device, can disassemble it
  without destroying it, and can remove decoupling capacitors.
* The attack target is not strong cryptography (use SCA for that),
  but a single conditional or fuse read.

FI is the wrong tool when:

* The chip you want to attack has only a few units in existence and
  bricking it is unacceptable.
* The secret is protected by a strong cryptographic computation
  that does not depend on a single branch decision.
* The chip has hardware glitch detection in production silicon.
* You only need to recover behaviour, not secrets — Chapter 21's
  dynamic-analysis approach is simpler.

## Reading

The single best resource for getting started:

* **Hardware Hacking Handbook** by Colin O'Flynn and Jasper van
  Woudenberg (No Starch Press, 2021). Three chapters on FI plus
  several on SCA. The current canonical text. Already cited in
  Appendix D.

After that:

* **ChipWhisperer documentation and Jupyter tutorials**
  (`https://chipwhisperer.readthedocs.io` and the
  `chipwhisperer/jupyter` GitHub repo). Reproducible attacks
  against an Atmel/Microchip target you can buy and follow along
  with.
* **LimitedResults blog** (`https://limitedresults.com`) —
  particularly the ESP32 and nRF52 series.
* **Kraken Security Labs blog** — Trezor write-up and related
  hardware-wallet work.
* **Riscure white papers**
  (`https://www.riscure.com/publications`) — long-form treatments
  of SCA and FI from a professional services perspective.
* **CHES** (Cryptographic Hardware and Embedded Systems)
  conference proceedings — the academic state of the art for
  defence and attack on embedded crypto. Free via IACR.
* **FDTC** (Fault Diagnosis and Tolerance in Cryptography)
  workshop — narrower focus on FI specifically.
