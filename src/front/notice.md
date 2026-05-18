# Notice {-}

This book covers techniques for reverse engineering software and
hardware. The techniques themselves are neutral — the same skills
that recover lost firmware, audit a device you own for security
flaws, or rebuild a discontinued product's update process are the
skills used to attack systems you do not own. The difference is
who you are doing it to and whether they consented.

This page is the standard set of expectations the rest of the book
assumes you operate under. None of it is a substitute for legal
advice.

## Use only on systems you have authorization to test {-}

Apply the material in this book only to:

* devices you personally own, or
* devices whose owner has given you explicit, written authorization
  to test, or
* systems within the scope of a written engagement (a penetration
  test contract, a bug-bounty program's defined scope, an
  employment agreement that grants the necessary authorization,
  an academic CTF or hardware-hacking course, etc.), or
* publicly-released firmware images and binaries where the vendor
  or the open-source license does not prohibit your activity.

"Curiosity" is not authorization. "It was on the network" is not
authorization. A device sitting in someone else's hands is not
yours to attack.

When in doubt, do not act. Ask. Get the authorization in writing.
The hour spent obtaining permission is the cheapest insurance
available in this field.

## Laws vary; you are responsible for knowing yours {-}

Reverse engineering, security testing, and hardware modification
are governed by different and frequently-changing laws depending
on your jurisdiction. A partial list of statutes the work in this
book has touched, in various countries:

* **United States** — Computer Fraud and Abuse Act (18 U.S.C.
  §1030); Digital Millennium Copyright Act §1201 (with periodic
  triennial exemptions for security research, software
  preservation, and vehicle repair); Defend Trade Secrets Act;
  state-level computer-crime statutes.
* **United Kingdom** — Computer Misuse Act 1990.
* **European Union** — NIS2 Directive; Cyber Resilience Act
  (2024); Software Directive 2009/24/EC (which contains an
  interoperability-purpose reverse-engineering exception);
  national implementations vary.
* **Germany** — Strafgesetzbuch §202a–202d; the so-called
  "Hackerparagraph."
* **Australia** — Cybercrime Act 2001; Criminal Code Act 1995
  Part 10.7.
* **Canada** — Criminal Code §342.1; Copyright Act technological
  protection measure provisions.

These statutes have exceptions, exemptions, safe-harbours, and
case law that change every few years. Some apply only to
unauthorised access; some apply also to publication. Researchers
have been prosecuted under several of them for activity that was,
in their view, plainly legitimate. *This book is not legal advice;
talk to a lawyer who specialises in the area before publishing or
acting in legally-uncertain territory.*

A few specific notes:

* **Vehicle reverse engineering** in the United States is partially
  covered by current DMCA §1201 exemptions (most recently renewed
  in 2024). The exemptions are time-bound, condition-bound, and
  narrower than they appear. The chapter on CAN bus and ECU
  reverse engineering touches this; consult the current state of
  the exemption before publishing work.
* **Hardware-wallet research** has been the subject of both
  responsible-disclosure successes and bad-faith legal threats.
  Document your authorization carefully.
* **Bug bounty programs** typically include legal safe-harbour
  language for activity within scope. *Read the program rules and
  the scope statement carefully*; deviating from scope can void
  the safe-harbour.

## Hardware safety {-}

A non-trivial fraction of the techniques in this book — fault
injection, side-channel analysis, JTAG / SWD attachment, in-circuit
flash dumping, eFuse manipulation — can permanently destroy the
device being tested. Some can damage the testing equipment.
A small subset can present a physical-safety risk to the operator
(lithium-battery thermal events under fault injection; mains
voltages on automotive test rigs; laser fault injection without
proper safety controls).

This book assumes you bring competent shop discipline: bench power
supply with current limiting, ESD protection, eye protection where
needed, an extinguisher within reach when working with lithium
cells, never working alone on equipment that could hurt you
seriously.

If the technique is new to you, practise on a sacrificial dev
board, not on the only unit of an irreplaceable target.

## Coordinated disclosure {-}

When the work in this book turns up an actual vulnerability in a
shipping product:

* **Notify the vendor first** through their published security
  contact (PSIRT, security@…, vulnerability-disclosure policy).
  Most vendors have one; CERT/CC, CISA, and ZDI can coordinate
  when the vendor is unresponsive or unknown.
* **Agree on a publication timeline**. 90 days is a common default
  (Project Zero, ZDI); some severity classes warrant longer or
  shorter. Document what you agreed.
* **Publish what you committed to publish**, no more and no less.
  Surprising vendors with extra details on disclosure day burns
  trust for everyone.
* **Get a CVE assigned** through MITRE (`cveform.mitre.org`) or
  your nation's coordinating CSIRT. CVEs make patches findable.

ISO/IEC 29147 (vulnerability disclosure) and ISO/IEC 30111
(vulnerability handling) describe the standardised process. Most
modern vendor PSIRTs follow them; many bug-bounty platforms
require they be respected by both sides.

## No warranty {-}

This book is provided "as is", without warranty of any kind. The
author and contributors are not liable for any damage, loss, or
legal consequence arising from following any of the techniques,
example commands, scripts, or recommendations described herein.
Every example was technically correct against the platform
versions named at time of writing; software and silicon change.

The work is licensed under Creative Commons Attribution-ShareAlike
4.0 International (CC BY-SA 4.0); the build scripts and example
code are also available under the MIT License at the reader's
option. See the `LICENSE` file in the source repository for the
full terms.

The point of putting all of this on one page is so the rest of
the book can be about the engineering instead. Operate
responsibly, document your authorization, disclose what you find,
and the field stays a field worth being in.
