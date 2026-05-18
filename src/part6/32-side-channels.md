# Side-Channel Analysis

Where fault injection (Chapter 31) makes a chip misbehave to skip
a check, **side-channel analysis** (SCA) listens to a chip behaving
correctly and recovers secrets from the way it does so. Every CMOS
gate dissipates a tiny amount of power when it switches; every
computation takes a small, sometimes data-dependent amount of time;
every nearby loop antenna picks up the emanations from the chip's
power and bus activity. The amount of information leaked per
operation is small. The amount of information leaked over millions
of operations is, repeatedly, "all of it."

SCA matters for reverse engineering for two reasons. First, it is
how cryptographic keys come out of devices that otherwise refuse to
release them. Second, it is how protocol details can be recovered
from black-box devices without static analysis (timing differences
in a "PIN correct" path vs a "PIN wrong" path leak the comparison
structure).

This chapter is again grounded in published work, not invented
exploits. The list of references at the end is the safest source
material.

## What "side channel" means

A side channel is information leaked through a channel that is not
the intended output. The intended output of a smartcard's AES
encryption is ciphertext. Its side channels include:

* **Time** — how long the operation took. If the time depends on
  the key, time leaks the key.
* **Power** — the instantaneous current draw of the chip. Each
  switching transistor draws a small amount of power; the total
  trace correlates with the data being processed.
* **EM radiation** — the chip's switching produces small radio
  emanations. A coil held nearby (or just an oscilloscope probe
  on a magnetic loop) captures them.
* **Cache state** — on processors with caches, what's in the
  cache after the operation depends on which addresses the
  operation touched, which depends on the key.
* **Acoustic emissions** — capacitor whine, audible enough to
  matter in some pure cryptanalytic settings (Genkin et al., 2014,
  recovered RSA keys from acoustic emanations of a laptop).
* **Power-supply pin voltage** — variations on the power channel,
  but on the *target's* mains supply rather than its die.

In practice the actionable channels are time, power, and EM.

## Timing attacks

The original side-channel attack. Kocher's 1996 paper "Timing
Attacks on Implementations of Diffie-Hellman, RSA, DSS, and Other
Systems" demonstrated that the running time of modular
exponentiation reveals the secret exponent because individual
multiply operations are key-bit-conditional. The attack is
remote-feasible whenever the server returns a precise enough
timing channel.

Modern relevance:

* **TLS implementations** — historically vulnerable Lucky 13 / CBC
  padding-oracle / MAC-then-encrypt attacks all have timing
  components. Modern TLS stacks (BoringSSL, modern OpenSSL) are
  constant-time for the relevant operations; older or embedded
  TLS stacks may not be.
* **Embedded password / PIN check** — any `memcmp` against a
  secret leaks the position of the first mismatching byte through
  return time. The fix is `memcmp_consttime` (or
  `CRYPTO_memcmp` in OpenSSL parlance).
* **HMAC verification** — same issue.
* **CPU-cache-based timing** — Spectre, Meltdown, and the broader
  microarchitectural-side-channel family (FLUSH+RELOAD, PRIME+PROBE,
  Foreshadow, etc.). Mostly relevant on x86 and Cortex-A; less
  relevant on microcontroller targets that don't have multi-level
  caches.

For embedded reverse engineering specifically, the high-yield
timing target is the boot-time PIN/password check. Many bootloaders
and product debug consoles compare against a string with `strcmp`,
which short-circuits. Over a network with sub-millisecond timing
resolution this can be exploited remotely; over a UART loopback
with a logic analyser it is even faster.

## Power analysis

The headline SCA technique. Two principal variants, both originally
from Kocher, Jaffe, and Jun ("Differential Power Analysis", 1999).

**Simple Power Analysis (SPA).** Look at one power trace from one
encryption with your eye (or a moving-average filter), and see
distinct operations. A textbook example: RSA's square-and-multiply
exponentiation has a "square" step that's always present and a
"multiply" step that's present only when the current key bit is
`1`. With high enough trace SNR, each bit of the secret exponent is
visible as a different shape in the trace. SPA does not require
many traces — sometimes one is enough — but it requires the leakage
to be visible at the level of single operations.

**Differential / Correlation Power Analysis (DPA / CPA).** Take
thousands or millions of traces from different known plaintexts
encrypted with the same unknown key. Compute the Pearson
correlation between the measured power at each time sample and the
predicted Hamming weight of some intermediate value (typically the
AES SubBytes output) under each guess of one byte of the key. The
correct key guess produces a sharp correlation peak at the time
sample where the chip computed that intermediate; wrong guesses
produce noise. Recover one key byte at a time. CPA against a
software AES implementation on a Cortex-M typically succeeds with
a few thousand to a few tens of thousands of traces, depending on
SNR.

DPA/CPA does not require physical disassembly. A wire across the
target's Vcore decoupling cap, an oscilloscope, and many traces
are the entire physical setup. ChipWhisperer's purpose-built
capture hardware automates the wire-and-scope into one device.

## EM analysis

Replace the wire on the power rail with a small coil held over the
package. The same information leaks via EM emanations, often with
higher SNR because the coil can be positioned over the specific
part of the die that does the operation (the FPU, the AES
accelerator, the cache controller). EM analysis is what lets
researchers attack secure elements with anti-tamper meshes on the
power supply — the meshes do not contain the EM signal.

Practical attacks have been published against:

* AES implementations on Cortex-M (countless ChipWhisperer demos
  reproduce these).
* RSA on smartcards.
* TPM 2.0 implementations (Roca et al. "ROCA" attack against
  Infineon TPMs, partly leveraging side-channel observations on
  RSA-2048 key generation — though ROCA itself was a math
  weakness, not pure SCA).
* Trusted Platform Module key extraction (multiple lab
  demonstrations).

## The tools

**ChipWhisperer** (NewAE Technology). The same hardware as for FI
(Chapter 31) is also the standard hobbyist SCA capture device. The
Pro and Husky variants offer larger capture buffers and higher
sample rates. The accompanying Jupyter tutorials walk through
SPA, DPA, and CPA against bundled targets step-by-step.

**Oscilloscope + low-noise amplifier + decoupling-cap shunt.** A
modest scope (e.g., a Picoscope, Rigol, or Lecroy of recent
vintage) at 100 MS/s plus a low-noise amplifier and a current
shunt across the Vcore decoupling cap gives you everything
ChipWhisperer Lite does, at higher cost and more setup friction.

**Riscure Inspector SCA.** Professional commercial system. Drives
arbitrary scopes, automates trace acquisition, and runs analytical
attacks. Tens of thousands of dollars; used by certification labs.

**Software-only tooling.** `pyscard` / `chipsec` for x86 target
work; `lascar` and `scared` for analytical post-processing of
captured traces; `pyESCA` for educational frame.

## Workflow against an AES-128 software implementation

A reasonable first SCA exercise — also the running example in the
ChipWhisperer tutorials:

1. **Trigger.** The target firmware toggles a GPIO right before
   the first SubBytes lookup of round 1. ChipWhisperer arms the
   capture on the trigger edge.
2. **Capture.** Encrypt a few thousand random 16-byte plaintexts;
   capture a power trace for each (~thousands of samples per
   trace).
3. **Align.** Software-align all traces against a common time
   reference (typically the trigger, but sometimes additional
   alignment is needed if the implementation has variable timing).
4. **Hypothesis.** For each key-byte candidate (0..255) and each
   trace, compute the Hamming weight of the SBox output:
   `HW(sbox[plaintext_byte XOR key_byte])`.
5. **Correlation.** For each time sample in the trace, compute
   the Pearson correlation between the column of Hamming-weight
   predictions across traces and the column of measured power
   values across traces.
6. **Pick the maximum.** The correct key byte will produce a
   single sharp peak in correlation at the time sample
   corresponding to the SBox computation; the other 255 byte
   guesses will produce ~zero correlation everywhere.
7. **Repeat per byte.** Recover the full 128-bit key one byte at
   a time. Total: 16 × CPA attacks, each cheap once the traces
   are captured.

Done well with a clean implementation and decent SNR, this is a
weekend project. Done badly — the implementation is masked, the
clock is randomised, the chip has SCA countermeasures — it can be
intractable.

## Defences

The defender's playbook for SCA:

* **Constant-time implementations** — `memcmp_consttime` for
  comparisons; constant-time AES via bit-slicing; constant-time
  RSA exponentiation via Montgomery ladder. The OpenSSL and
  BoringSSL implementations of common primitives are deliberately
  constant-time on modern platforms.
* **Masking** — split each secret intermediate into two or more
  shares whose XOR is the real value. Each share is itself
  uncorrelated with the secret; first-order DPA fails. Higher-order
  attacks (combining samples from multiple time points) can
  defeat masking but require many more traces.
* **Hiding** — randomise the timing of operations (insert
  random delays, shuffle the order of independent operations like
  AES SubBytes lookups). Forces the attacker to use more traces
  to average out the noise.
* **Hardware crypto accelerators** with built-in countermeasures —
  most modern microcontroller crypto blocks include some
  combination of masking, hiding, and dummy operations. Their
  effectiveness varies; certification (CAVP, FIPS, Common
  Criteria EAL levels) gives some evidence.
* **Defensive coding** — avoid `if (secret_byte == known) ...`
  patterns; use bitwise operations on the secret that compile to
  branchless code.

## When to choose SCA vs. FI

* If you want a cryptographic **key**, SCA is the better tool. AES
  keys come out of software AES on a Cortex-M with CPA.
* If you want to **skip a check** (PIN counter, signature verify,
  RDP enforcement), FI is faster.
* If the chip has dedicated SCA countermeasures (modern secure
  element), neither hobbyist-grade tooling will succeed without
  significant additional engineering. Professional labs may.

The two are complementary. A common attack chain on a hardware
wallet or smartcard is to use FI to bypass an access check and
then SCA to extract a key from the now-accessible operation.

## Reading

* **Hardware Hacking Handbook** (already cited). Chapters on SPA,
  DPA, and CPA with worked ChipWhisperer examples.
* **The original Kocher papers**:
  * Kocher, "Timing Attacks on Implementations of Diffie-Hellman,
    RSA, DSS, and Other Systems" (1996).
  * Kocher, Jaffe, Jun, "Differential Power Analysis" (1999).
* **Mangard, Oswald, Popp, "Power Analysis Attacks: Revealing the
  Secrets of Smart Cards"** (Springer, 2007). The standard
  academic textbook.
* **CHES conference proceedings** — annual academic state of the
  art.
* **ChipWhisperer documentation** at chipwhisperer.readthedocs.io.
* **Riscure white papers** at riscure.com/publications.
* **lascar** (`https://github.com/Ledger-Donjon/lascar`) — open
  source SCA analysis library, maintained by Ledger's Donjon
  security team. Code is a good way to understand the algorithms.

A working engineer who finishes the ChipWhisperer tutorials, reads
the Hardware Hacking Handbook, and skims the Kocher papers is
positioned to take on most published SCA targets.
