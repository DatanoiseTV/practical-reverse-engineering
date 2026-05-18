# CAN Bus and Automotive ECU Reverse Engineering

Cars are full of microcontrollers — typical modern vehicles have
50 to 100 ECUs from a dozen suppliers, talking to each other over
CAN, LIN, FlexRay, and (increasingly) automotive Ethernet. The
firmware running on those ECUs is rarely public, the diagnostic
protocols are standardised but often locked behind vendor seed-
and-key schemes, and the consequences of getting something wrong
range from a check-engine light to permanent bricking of a body
control module that costs four figures to replace.

This chapter covers reverse engineering at the CAN-bus level —
identifying messages, decoding their meaning, talking to
diagnostic services, and (with appropriate caution) dumping ECU
firmware via UDS. The chapter is hardware-and-protocol focused;
the actual reverse engineering of the dumped binary uses the
techniques from Parts II and III (TriCore, PowerPC e200, and
Renesas RH850 are the dominant ECU architectures).

::: warning
Working on a real vehicle bus while the vehicle is moving — or
working on safety-critical ECUs (brake, steering, airbag, engine
torque control) at all — has real-world physical risk. Most of
the work in this chapter belongs on a bench with an ECU under
test, an OBD-II simulator, or a dedicated test mule, not on the
family car.
:::

## CAN in one section

**Controller Area Network** (CAN), standardised in ISO 11898, is
a differential serial bus running typically at 125, 250, 500, or
1000 kbit/s ("HS-CAN", high-speed). Two wires (CAN_H, CAN_L)
carry the differential signal; nodes are wired in a bus topology
with 120 Ω termination at each end.

Every frame is one of:

| Frame              | Use                                                  |
|--------------------|------------------------------------------------------|
| Data frame         | The common case — ID + 0..8 bytes of payload         |
| Remote frame       | Request that a node transmit a specific ID (rare)    |
| Error frame        | Bus-level error indication                            |
| Overload frame     | Bus-level flow control                                |

Standard CAN data frames have:

* An **11-bit identifier** (or 29-bit if extended frame format).
  Lower IDs win bus arbitration.
* A **DLC** (data length code): 0..8 bytes payload for classic
  CAN; 0..64 for CAN FD.
* The **payload** itself.
* A CRC, ACK, and EOF that the controller handles transparently.

CAN is broadcast — every node sees every frame. There is no
addressing in the protocol; the ID *is* the addressing convention
between cooperating nodes. The convention is per-vehicle and
per-vendor.

**CAN FD** (Flexible Data-rate, ISO 11898-1:2015) extends payloads
to 64 bytes and increases the data-phase bitrate. It is
increasingly common on newer vehicles. From a reverse-engineering
perspective, the upper-layer protocols (UDS, ISO-TP, J1939) all
work the same; the wire is just faster and wider.

**LIN** (Local Interconnect Network, ISO 17987), **FlexRay** (ISO
17458), and **Automotive Ethernet** (BroadR-Reach / 100/1000BASE-T1)
coexist in modern vehicles for body, safety, and high-bandwidth
needs respectively. CAN is still the bus you spend most of your
time on for diagnostics work.

## Higher-layer protocols

CAN frames carry one of several higher-layer protocols. The ones
that matter for diagnostic and reverse-engineering work:

* **ISO-TP** (ISO 15765-2) — Transport Protocol. CAN frames are
  8 bytes; ISO-TP fragments larger PDUs (up to 4095 bytes for
  classic ISO-TP, more for extended) across multiple frames with
  a small per-frame header. Most diagnostic services run over
  ISO-TP.
* **UDS** (Unified Diagnostic Services, ISO 14229-1) — the
  diagnostic protocol on modern vehicles. Replaces older KWP2000
  (ISO 14230). Used for reading DTCs, reading/writing data
  identifiers, ECU programming, and security access.
* **OBD-II** (ISO 15765-4 over CAN, also ISO 9141 / ISO 14230
  on older vehicles) — the legally-mandated emissions
  diagnostics interface, exposed on the trapezoidal connector
  near the driver's footwell. Defines a fixed subset of PIDs and
  modes (SAE J1979). Less powerful than UDS but always available.
* **J1939** (SAE J1939) — heavy-duty vehicle CAN protocol
  (trucks, buses, agricultural equipment, generators). 29-bit
  IDs, structured PGN/SPN naming. Mostly orthogonal to passenger-
  car UDS work.
* **CANopen** (CiA 301) — industrial automation, not
  automotive, but uses the same physical layer.

## Bench setup

The minimum kit:

* A **CAN interface** for your laptop. Options:
  * **PCAN-USB** (Peak System, ~USD 300, well-supported on every
    OS). The industry default.
  * **Vector VN1610 / VN1640** (~USD 1k+, professional). Same
    quality as PCAN; required for some commercial tooling.
  * **CANable** (open hardware, ~USD 50). Several variants
    (CANable Pro, CANtact). Uses the SLCAN serial protocol or
    direct USB.
  * **Macchina M2 / A0** (open hardware, ~USD 80-150). Built for
    automotive RE specifically; M2 includes multiple buses and
    a J1962 connector.
  * **Comma.ai panda** (~USD 90). Hardware they use for OpenPilot;
    OBD-II form factor.
* An **ECU under test** if benchmarking a specific component.
  Salvage-yard ECUs are cheap; powered with the right harness
  (12 V, ground, ignition signal), they often boot and respond
  to CAN.
* A **CAN bus terminator** (120 Ω) at each end.
* For OBD-II port work: an **OBD-II breakout cable** exposing the
  bare CAN_H / CAN_L pins (pins 6 and 14 on the connector).

On Linux, the kernel includes **SocketCAN**: CAN interfaces appear
as network devices (`can0`, `can1`) and tools speak through them
like sockets.

```text
$ sudo ip link set can0 type can bitrate 500000
$ sudo ip link set can0 up
$ candump can0                    # log every frame
$ cansend can0 7DF#0201050000     # send: Mode 01 PID 05 (coolant temp)
$ cangen can0                     # generate random traffic
$ canplayer -I capture.log        # replay a captured log
```

`candump`, `cansend`, `canplayer`, `cangen`, and friends are part
of **can-utils** (`apt install can-utils` on Debian/Ubuntu).

On Windows: PCAN-View (with PCAN-USB) or vendor-supplied tools.

For graphical capture-and-decode: **SavvyCAN** (open source,
cross-platform, GitHub by Collin Kidder). The de facto
reverse-engineer's tool for CAN — captures, replays, filters,
shows frame timing, supports DBC files.

## DBC files

The industry-standard format for documenting CAN messages is the
**DBC file** (Vector's CAN database format, originally
proprietary but widely tooled and human-readable). A DBC file
maps:

```text
BO_ 100 EngineData: 8 ECM
 SG_ EngineRPM : 0|16@1+ (0.25,0) [0|16383.75] "rpm"
 SG_ ThrottlePos : 16|8@1+ (0.4,0) [0|100] "%"
 SG_ CoolantTemp : 24|8@1+ (1,-40) [-40|215] "C"
```

That fragment says: CAN ID 0x64 (100) carries an 8-byte frame
named "EngineData" from the ECM. Within it, bits 0-15 (intel
byte order) are EngineRPM scaled by 0.25; bits 16-23 are
throttle position scaled by 0.4; bits 24-31 are coolant
temperature offset by -40 °C.

For most production vehicles the DBC is proprietary. Several
public databases exist:

* **OpenDBC** (`https://github.com/commaai/opendbc`) — the
  comma.ai project's library of crowdsourced DBC files for
  vehicles supported by OpenPilot. Includes Honda, Toyota, GM,
  Hyundai, and many others to varying completeness.
* **SocketCAN dbcppp** and **cantools** (Python) parse and
  emit DBC files programmatically.

When you reverse engineer a vehicle's CAN traffic, the output is
typically a partial DBC. Sharing it back to OpenDBC (where
appropriate) is good citizenship.

## CAN reverse-engineering workflow

The standard approach to decoding messages from a live vehicle:

1. **Tap the bus passively.** Connect through the OBD-II port (no
   harness modification) or an accessible CAN bus on a
   bench-mounted ECU. Verify you can `candump` without sending
   anything.
2. **Identify active IDs.** Many vehicles have 50-100 distinct
   IDs broadcasting at various periods (10 ms to 1 s). `candump
   -t a can0 | awk '{print $3}' | sort -u` enumerates them.
3. **Diff captures during specific actions.** Record a baseline
   (engine running, all controls neutral); record again with one
   change (left turn signal, door open, brake pressed). The IDs
   whose data fields changed are candidates for the function you
   exercised.
4. **Identify field boundaries.** Within each candidate ID, look
   at which bytes / bits changed. SavvyCAN's "graphing" view
   plots individual bytes over time and helps visually identify
   counters, scaled sensor values, and flag bits.
5. **Decode and document.** Build up a DBC incrementally. Common
   tricks:
   * Counters increment every frame (rolling 0-15 in the high
     nibble of one byte is common).
   * CRC bytes change every frame even if the data didn't —
     identify them by their statistical uniformity.
   * Scaled values: a temperature reading rising from 20 °C to
     90 °C as you warm up the engine is a byte going from
     `(20+40)=60` to `(90+40)=130` with the standard offset.
   * Direction-of-motion fields are often `0x80` ± offset.

This is iterative work. A patient evening with SavvyCAN and a
willing test vehicle gets you reading lights, doors, gear
position, and basic sensors. Engine internals and chassis
control take longer.

## UDS for the impatient

**UDS** (ISO 14229) is the diagnostic service framework. Every
modern ECU implements some subset. Services you will use
constantly:

| SID  | Service                                  | Use                          |
|------|------------------------------------------|------------------------------|
| 0x10 | DiagnosticSessionControl                 | Switch to programming session|
| 0x11 | ECUReset                                 | Reset the ECU                |
| 0x14 | ClearDiagnosticInformation              | Clear DTCs                   |
| 0x19 | ReadDTCInformation                       | Read diagnostic trouble codes|
| 0x22 | ReadDataByIdentifier                     | Read DID (data identifier)   |
| 0x23 | ReadMemoryByAddress                      | Direct memory read           |
| 0x27 | SecurityAccess                           | Seed-and-key authentication  |
| 0x28 | CommunicationControl                     | Silence the ECU bus output   |
| 0x2E | WriteDataByIdentifier                    | Write DID                    |
| 0x31 | RoutineControl                           | Run a vendor routine         |
| 0x34 | RequestDownload                          | Begin firmware download to ECU |
| 0x35 | RequestUpload                            | Begin upload from ECU        |
| 0x36 | TransferData                             | Transfer block               |
| 0x37 | RequestTransferExit                      | End transfer                 |
| 0x3E | TesterPresent                            | Keep diagnostic session alive|

UDS rides on ISO-TP, which rides on CAN. A request like "read the
VIN" (DID 0xF190) sent over UDS-over-CAN to an ECU at functional
address 0x7DF (the standard OBD-II / UDS broadcast address) looks
like:

```text
$ cansend can0 7DF#02 22 F1 90
```

The ECU's response comes back on the ECU's response ID (0x7E8 for
the powertrain controller in most vehicles):

```text
$ candump can0
  can0  7E8   [8]  10 14 62 F1 90 31 47 31
  can0  7E8   [8]  21 5A 56 35 53 39 4C 56
  can0  7E8   [8]  22 38 31 32 33 34 35 36
```

This is ISO-TP multi-frame: first frame says 0x14 bytes total,
service response is 0x62 (= 0x22 + 0x40 positive ACK), DID is
0xF190, payload is the VIN string. **isotpcat / isotpsend /
isotprecv** in can-utils handle ISO-TP transparently.

Python with **udsoncan** (PyPI, MIT licensed):

```python
from udsoncan.client import Client
from udsoncan.connections import IsoTPSocketConnection

conn = IsoTPSocketConnection('can0', rxid=0x7E8, txid=0x7E0)
with Client(conn) as client:
    vin = client.read_data_by_identifier(0xF190)
    print(vin.service_data.values[0xF190])
    client.change_session(0x03)             # extended diagnostic
    # ... etc
```

## Security Access and seed-key

Most useful UDS services (memory read, firmware download, write
operations) are gated by `0x27 SecurityAccess`:

1. Client requests a seed: `27 01`
2. ECU returns a seed: `67 01 <random bytes>`
3. Client computes the key from the seed using the ECU-specific
   algorithm and sends: `27 02 <key>`
4. ECU compares; if correct, grants access.

The seed-to-key algorithm is vendor- and ECU-specific. It is
also the gate for any deep firmware extraction work. Three
realities:

* For some vehicle families, the algorithms have been publicly
  reverse-engineered (community work, often through reverse-
  engineering vendor diagnostic-tool DLLs). Resources like
  `openecu.org`, the OpenGarages community, and academic papers
  from KU Leuven have published several.
* Modern ECUs (post-2015 or so for many OEMs) use asymmetric
  challenge-response or per-ECU keys that make the algorithm
  largely useless without the keys.
* Some ECUs implement throttling (10-minute lockout after N
  failed attempts) that makes brute force impractical even when
  the key space is small.

## ECU firmware dumping

If you have security access, `0x35 RequestUpload` followed by
`0x36 TransferData` calls dumps the ECU's flash to your laptop.
The exact request shape depends on the ECU's memory layout (you
ask for `0x800000 .. 0x8FFFFF` etc.). Once dumped, the binary
goes into r2 with the appropriate `-a` and `-c` for the ECU's
architecture (TriCore for many Bosch engine ECUs; PowerPC e200
for many Continental / Delphi units; RH850 for newer Renesas-
based ECUs).

Worked examples of full ECU firmware analysis (with public
write-ups):

* **Charlie Miller and Chris Valasek, "Remote Exploitation of an
  Unaltered Passenger Vehicle"** (Black Hat USA 2015). The Jeep
  Cherokee work that prompted Chrysler's 1.4 million-unit
  recall. Includes both bus-level and infotainment RE.
* **comma.ai OpenPilot.** Open-source ADAS that runs on real
  vehicles. The codebase (and OpenDBC) is a reference for how
  cars actually behave on CAN.
* **OpenGarages and the Car Hacker's Handbook** by Craig Smith
  (No Starch Press, 2016). Older but the methodology and
  protocol coverage remain solid.

## Modern complications

Recent vehicles add layers that complicate the older
"plug-in-and-sniff" workflow:

* **Secure Onboard Communication (SecOC)** — AUTOSAR-standard
  authenticated CAN. Frames carry a MAC; nodes drop unauthenticated
  messages. Spoofing requires the key.
* **Diagnostic Authorization (UDS service 0x29)** — modern UDS
  uses certificate-based authorization for some operations,
  replacing the old seed-key scheme.
* **Encrypted firmware updates** with vendor signatures, often
  with rollback prevention via monotonic counters.
* **CAN-FD with shorter overall bus runs** — physical access
  alone is harder on newer vehicles.
* **Service-mode physical disconnect** — some vehicles route
  diagnostic traffic through a gateway ECU that filters which
  IDs reach which buses.

None of these make CAN RE impossible, but they shift the work
from "passively listen on the OBD-II port" to "compromise a
gateway ECU first" or "extract the SecOC keys."

## Legal note

Vehicle reverse engineering in the United States is partially
protected by DMCA exemptions (renewed in 2018, 2021, 2024) for
"diagnosis, repair, and lawful modification" of motorized land
vehicles. The exemptions are time-bound and condition-bound; they
do not cover bypassing safety systems or firmware modifications
that affect emissions on vehicles operated on public roads. In
the EU, the **Right to Repair** directives are evolving;
specifics vary by country. Read the current state of the
exemptions before publishing work; consult a lawyer before
modifying a vehicle you drive on public roads.

## Reading

* **The Car Hacker's Handbook** by Craig Smith (No Starch Press,
  2016). Free PDF available from the publisher; covers CAN, UDS,
  J1939, infotainment, telematics, and bench setups in depth.
* **OpenGarages** (`http://opengarages.org`) — community
  resources, BeagleBone-based bench setups, presentation slides.
* **OpenDBC** (`https://github.com/commaai/opendbc`) — real DBC
  files for many production vehicles.
* **SavvyCAN documentation** at `savvycan.com`.
* **udsoncan and python-can on PyPI** — both well-documented.
* **Miller and Valasek's Black Hat USA 2015 paper and DEF CON
  23 talk** — primary source on what serious automotive RE
  looks like.
* **ISO 14229 and ISO 15765** — the spec documents, available
  from ISO or via academic library access.

Automotive RE rewards patience above almost everything else.
Modern vehicles are large, complex systems with strict safety
properties; the same modesty that good firmware engineering
demands applies double when the firmware in question drives
something that weighs two tonnes.
