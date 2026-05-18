# Hardware Tricks, Backdoors, and Less-Known Pitfalls

The previous two chapters covered fault injection and side-channel
analysis — the academically named techniques. This chapter covers
the long tail of practical hardware-side findings that don't fit
under a single banner. Most of these come up in security-research
work on commercial devices, and most can be discovered with a
multimeter, a logic analyser, and patience. Several have produced
high-impact CVEs and product recalls.

The unifying theme: **a lot of "secure" embedded systems are not
secure against an attacker who has the physical device, a hot-air
station, and a few hundred dollars of equipment.** The reasons are
boring and repetitive, and the same dozen mistakes show up across
products from every vendor.

## Debug interfaces left enabled in production

The single most common finding. A device ships with JTAG, SWD, or
a UART boot console fully enabled. Sometimes the silkscreen labels
the test points; sometimes they're unlabelled vias; sometimes
they're hidden under a sticker. In all cases they survived
production and they let you read flash, attach a debugger, or
break into a boot prompt.

What to look for on an unfamiliar PCB:

* **Headers with 0.1" or 0.05" pitch, 4 to 20 pins.** Common JTAG
  pinouts are 20-pin (ARM legacy), 10-pin (ARM Cortex SWD), 14-pin
  (TI / Renesas), 6-pin (FTDI-style serial). The Hardware Hacking
  Handbook has photos and pinouts.
* **Single rows of 3 to 5 unlabelled vias near a chip.** Very
  often a UART (TX, RX, GND, sometimes VCC and reset).
* **Test pads on the bottom side near a SoC.** Many products
  route their debug signals to test pads, not headers, so the
  programmer connects only at factory.
* **Unpopulated header footprints.** The PCB has the holes, the
  factory did not populate the connector. Solder one in.

Tools that help:

* **JTAGulator** (Joe Grand, Grand Idea Studio). A small open
  hardware device that probes 8–24 pins in turn, trying every
  permutation of TCK / TMS / TDI / TDO, and reports which
  combinations produce a valid JTAG IDCODE. Also tries UART
  bauds. Sold by Adafruit and others. A genuine time-saver on
  any unfamiliar board.
* **Glasgow Interface Explorer** (1bitsquared). FPGA-based
  general-purpose protocol analyser/explorer. Open hardware.
  Good for poking unknown bus protocols.
* **Bus Pirate** (Dangerous Prototypes, originally by Ian Lesnet).
  Older, still useful for SPI / I2C / UART / 1-Wire fingerprinting
  on test pads.
* **A USB-UART adapter** (FTDI, CP2102, CH340) and `picocom` /
  `screen`. For UART discovery once you've identified the candidate
  TX line.
* **An oscilloscope.** For confirming a candidate UART's baud rate
  by measuring the width of a start bit.

The workflow when a new PCB lands on your bench:

1. Photograph both sides at high resolution.
2. Visually scan for headers, vias, and test points near the SoC.
3. Probe candidates for activity at power-on: a TX line will show
   UART traffic; SWCLK will toggle if a debugger is being looked
   for.
4. Run JTAGulator across any cluster of 4–8 unlabelled pins.
5. Once you have JTAG or SWD, try a chip-recognising programmer
   (OpenOCD, J-Link Commander, probe-rs `probe-rs info`).

It is surprising how often steps 1–4 lead directly to a shell
prompt or a flash-readable debug port.

## Boot consoles and recovery modes

Many SoCs have a vendor-supplied boot ROM that lives at a fixed
address and offers a serial command interface for flashing, dumping
memory, or running JTAG. The boot ROM is usually **unkillable** —
it survives bricks, RDP, and most attacker mistakes — and it is
documented in the vendor's datasheet because end customers need it
for manufacturing.

Worth knowing:

* **STMicroelectronics System Bootloader** at `0x1FFF0000` on most
  STM32 parts. Application note AN2606 documents the protocol
  (USART, USB, I2C, SPI variants). The bootloader is **disabled**
  by RDP Level 2 on some families; on Level 1 it usually still
  runs but cannot read out flash.
* **NXP LPC ISP (In-System Programming)** mode on Kinetis / LPC
  parts. Activated by pulling a specific pin low at reset. UART
  protocol documented in the user manual.
* **Microchip / Atmel SAM-BA** monitor on SAM-series parts.
  Activated by pulling a specific pin (typically `ERASE`) and
  resetting. USB or UART interface.
* **Espressif ESP ROM bootloader** at `0x40000000` (ESP32 family).
  Activated by holding `GPIO0` low at reset. Implements the
  `esptool` protocol documented at
  `https://github.com/espressif/esptool`.
* **Raspberry Pi RP2040 BOOTSEL.** Hold BOOTSEL during USB
  connect; the chip enumerates as a USB mass-storage device and
  accepts UF2 firmware drops. Unkillable.
* **Allwinner FEL mode.** USB-based recovery on Allwinner SoCs
  (popular in cheap Linux tablets / SBCs). Many published tools
  for FEL.

These modes are not vulnerabilities, but they are very useful for
recovery during your own work, and they are the entry point for
attackers who have not figured out how to break the chip's main
security.

## Flash and OTP gotchas

**Flash erase is binary and biased.** Most NOR/NAND flash erases
to all-`1`s. Programming sets bits to `0`. You can change a `1` to
`0` without erasing first, but you cannot change a `0` back to `1`
without an erase cycle. Some published attacks exploit this
asymmetry — for instance, you can disable a "valid signature" flag
on a structure by setting bits to `0` without erasing the
surrounding page.

**Read margin and "ghost" data.** Flash cells store charge; the
distinction between `1` and `0` is a voltage threshold. Some
controllers expose a "read margin" command that reads with a
shifted threshold, revealing previously-erased data that has not
fully discharged. Documented for some SPI flash families (Winbond,
Spansion). Hardware Hacking Handbook covers this in detail.

**OTP / eFuse is irreversible.** OTP fuses can be programmed once;
you cannot unburn them. Read the "security fuse" register before
writing anything to OTP. Multiple commercial products have been
permanently bricked by enabling debug-lockout fuses during
"hardening" without leaving themselves a recovery path.

**Sticky bits and reset behaviour.** Some chip security registers
latch the value of a fuse at reset and ignore subsequent fuse
changes within the same power cycle. Others are re-read each reset.
The chip's reference manual is the truth; assumptions are the
problem. Read carefully before relying on either behaviour.

**Mass erase doesn't always erase customer data.** Some "mass
erase" commands erase the application flash but leave info /
configuration pages intact, or leave a small region the bootloader
uses. Customer data — keys, serial numbers — sometimes survives
what looks like a complete wipe.

## Vendor-specific recovery and test modes

Production-test modes that are not removed in customer firmware
are a recurring finding. Examples:

* **Test commands left in serial bootloader.** Several router
  vendors have shipped customer firmware with serial-port
  commands like `printenv`, `loadb`, or vendor-specific
  test-mode entries reachable from a U-Boot prompt. Sometimes the
  prompt is suppressed by default but pressing a specific key
  combination at boot exposes it.
* **GPIO-strap-induced modes.** Some SoCs have boot-mode straps
  that select between "boot from flash", "boot from UART", "boot
  from JTAG", and "boot from external memory". A jumper or wire
  swap can reroute boot through a route the firmware author did
  not consider.
* **Recovery key combinations.** "Hold three buttons during boot
  to enter recovery" is a documented feature on many consumer
  devices, but the recovery mode often grants more access than the
  customer feature implies.
* **Hidden CLI on production daemons.** Many embedded Linux
  products ship with a hidden CLI in their web/UI service that's
  accessible via a specific URL or query parameter. `cgi-bin/`
  paths, magic header values, undocumented JSON-RPC methods.
  Easy to find with a recursive `grep` once the firmware is
  extracted (Chapter 24).

These are not exotic attacks. They are first-pass findings in
half-day device assessments.

## "Encrypted" without thinking

Encrypted firmware update files where the encryption key is
shipped in plaintext inside the device, or generated from a
device-unique value that's also stored in plaintext, or both, are
unfortunately common. Look for:

* **Hard-coded AES keys** in the bootloader or update agent
  binary. They look like high-entropy 16/24/32-byte byte arrays in
  `.rodata`.
* **Hashes of MAC address / serial number** as device-unique
  keys. The device's own MAC address is broadcast over WiFi.
* **Hard-coded RSA private keys.** Less common because the file
  is bigger, but it happens.
* **CRC-only "integrity"** of update images, advertised as
  "secure update". Forge an image with a matching CRC and the
  device accepts it.

The Hardware Hacking Handbook has a worked example. The
**Mirai botnet** family famously exploits default credentials and
similar weaknesses across IoT cameras.

## Bypassing readout protection by side channels

A few chip families publicly known to leak the contents of
readout-protected flash via timing or instruction-fetch side
channels — even without fault injection:

* Various 8-bit microcontrollers (PIC, ATtiny) have published
  read-protect bypasses.
* Some early ARM Cortex-M parts (Hardware Hacking Handbook,
  Riscure white papers, and various Hardwear.io conference talks
  document these).
* Several smartcards (academic literature).

The pattern is the same in each: a debugger-accessible operation
(single-step, branch, single instruction execute) creates a
visible side effect that depends on the contents of the
"protected" memory.

When the vendor's marketing emphasises "secure" and "tamper-proof"
without naming specific countermeasures, assume the protection is
weaker than claimed and search for published research on the
specific part number.

## Glitching peripherals to leak across security boundaries

A subtler family of attacks: glitch not the CPU but a peripheral
that crosses a security boundary. Examples documented in
published research:

* DMA-based attacks: convince the DMA engine to copy out of a
  secure region while the CPU is in non-secure mode.
* Cache flushes that leak across cores in SMP.
* Hardware crypto engines that store keys in registers visible
  via debug interfaces.

These require deep chip-specific knowledge and are usually the
result of a dedicated research project rather than ad-hoc attack
work.

## Pitfalls when doing the work yourself

A short list of things experienced hardware researchers do not
have to be told twice:

* **Lift the chip off the board for a clean SPI flash dump.**
  Other peripherals on the SPI bus can interfere; the SoC itself
  may drive the lines. A hot-air station and a SOIC clip cost
  less than the time spent debugging in-circuit reads.
* **Always have a current-limited supply.** A bench supply set
  to 50 mA limit at 3.3 V is your insurance policy against
  reverse-polarity, shorts, and surprises during glitching.
* **Photograph the board before desoldering.** And after. Document
  every wire you cut.
* **Keep an oscilloscope on the supply rail.** A glitch attempt
  that resets the chip looks identical to a glitch attempt that
  exposed an OTP fuse, until you check the trace.
* **Don't burn the eFuse without a recovery path.** Some chips
  have unrecoverable lockouts. Read every word of the relevant
  errata and application note before writing OTP.
* **Treat the device as evidence if it might end up in court.**
  Forensic work has different rules than research; talk to a
  lawyer before destructively analysing customer-owned devices.

## A short reading list

* **Hardware Hacking Handbook** (O'Flynn + van Woudenberg, No
  Starch 2021) — the consolidated text.
* **The IoT Hacker's Handbook** (Aditya Gupta, Apress 2019) —
  more emphasis on protocol/firmware level.
* **Practical Hardware Pentesting** (Jean-Georges Valle, Packt
  2021) — methodology-focused.
* **OWASP IoT Top 10** — taxonomy of common IoT mistakes.
  Useful for triage.
* **Specific conference talks**: Black Hat USA / EU,
  DEF CON Hardware Hacking Village, Hardwear.io, recon.cx, CCC.
  Most are on YouTube.
* **CVE databases** — searching by chip family
  (`stm32 cve`, `esp32 cve`, `nrf52 cve`) returns the published
  vulnerabilities of the part you're working on. Many include
  enough detail to reproduce.

A working engineer doing security review of embedded devices
develops an instinct for these things over time. The shortcut
is to read every Hardware Hacking Handbook chapter once a year
and keep a notes file of the patterns you've seen in the wild.
