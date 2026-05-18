# Bluetooth and BLE Protocol Reverse Engineering

Bluetooth Low Energy is the wire for the modern Internet of
Things: smart locks, hardware wallets, fitness trackers,
toothbrushes that send data to your phone, industrial sensors,
and a long tail of consumer devices invented since 2010. BLE is
short-range, low-power, simple compared to its Bluetooth Classic
predecessor, and has been the subject of a thriving research
community — meaning the tooling is mature and the protocols are
well-documented at every layer.

This chapter focuses on BLE (Bluetooth Low Energy / Bluetooth
Smart, introduced in Bluetooth Core 4.0 in 2010 and extended in
4.2, 5.0, 5.1, 5.2, 5.3, and 5.4). Classic Bluetooth (BR/EDR) is
covered briefly at the end.

## The BLE stack in one section

BLE is layered:

| Layer  | Acronym | Role                                                    |
|--------|---------|---------------------------------------------------------|
| PHY    |         | Radio: 40 channels in the 2.4 GHz ISM band              |
| LL     | Link Layer | Channel hopping, connections, ack/retransmit          |
| HCI    |         | Host Controller Interface (between controller and host)|
| L2CAP  |         | Multiplexes channels, fragments PDUs                    |
| ATT    | Attribute Protocol | Read/write attributes by handle                  |
| GATT   | Generic Attribute Profile | Service / characteristic abstraction over ATT |
| SMP    | Security Manager Protocol | Pairing, key generation                     |
| GAP    | Generic Access Profile | Roles, advertising, scanning, discovery          |

The two layers you spend most of your time at when reverse
engineering BLE devices:

* **GAP** — how devices find each other. A peripheral broadcasts
  short **advertising packets** (31 bytes max in 4.x, 255 in 5.x
  extended advertising); a central scans for them; the central
  initiates a connection.
* **GATT** — once connected, the peripheral exposes a hierarchy
  of **services**, each containing **characteristics**, each
  with a 128-bit (or 16-bit shortened) UUID. The central reads,
  writes, and subscribes to notifications on characteristics.

Standard short UUIDs you will recognise constantly:

| UUID      | Service / Characteristic                |
|-----------|-----------------------------------------|
| 0x180F    | Battery Service                         |
| 0x2A19    | Battery Level characteristic            |
| 0x180A    | Device Information Service              |
| 0x2A29    | Manufacturer Name String                |
| 0x2A24    | Model Number String                     |
| 0x2A50    | PnP ID                                  |
| 0x1812    | Human Interface Device Service          |
| 0x180D    | Heart Rate Service                      |
| 0x2A37    | Heart Rate Measurement                  |
| 0x1801    | Generic Attribute (service definition)  |

Anything outside the Bluetooth SIG's assigned-numbers list is a
vendor-specific UUID (a full 128-bit random-looking value). These
are where the interesting protocol typically lives.

## Tools

### Mobile — the easiest start

For most BLE reverse-engineering sessions, the fastest way to see
what's on the wire is your phone:

* **nRF Connect for Mobile** (Nordic Semiconductor, free on iOS
  and Android). Scans nearby BLE devices, connects, enumerates
  all services and characteristics, lets you read/write/subscribe.
  Single most useful BLE RE tool, full stop.
* **LightBlue** (PunchThrough, free on iOS). Similar feature set.
* **BLE Scanner** (Bluepixel, Android). Stable cross-version.

For five minutes' worth of triage — "what does this thing
expose?" — these tools answer the question entirely.

### Linux / desktop

* **bluetoothctl** (BlueZ) — interactive shell for BLE scan,
  connect, gatttool-style operations.
* **gatttool** — older, deprecated in newer BlueZ but still
  ships. Good for one-off commands.
* **bleak** (`https://github.com/hbldh/bleak`) — modern
  cross-platform async Python BLE library. Works on Linux,
  Windows, macOS. The right tool for scripts.
* **btmon** (BlueZ) — kernel-level BLE / Bluetooth traffic
  monitor; dumps every HCI command and event.
* **Wireshark** with the **BTLE** dissector — reads `btsnoop`
  log files (produced by btmon, by Android's HCI snoop, or by
  the sniffer hardware below).

### Air sniffers

These let you observe BLE traffic without being either of the
endpoints — invaluable when reverse engineering an existing
peripheral talking to a vendor app.

* **Nordic nRF Sniffer for BLE.** Free firmware that runs on
  any nRF52840 USB dongle (~USD 10-15 from Adafruit / Mouser /
  SparkFun). Exports captured packets to Wireshark via a Python
  proxy. Captures advertising and connection traffic;
  follows the connection's channel hop sequence. Industry
  standard for hobbyist BLE sniffing.
* **Ubertooth One** by Michael Ossmann / Great Scott Gadgets
  (~USD 110). Open hardware, mature, supports both BLE and
  Classic. Predates the Nordic sniffer.
* **TI CC2540 USB dongle** — older hardware; TI's SmartRF
  Packet Sniffer software. Limited and less actively maintained.
* **Adafruit Bluefruit LE Sniffer** — also nRF-based; uses the
  same Nordic sniffer firmware.

### Active research tools

* **btlejack** by Damien Cauquil (Pen Test Partners). Sniffs an
  existing BLE connection, hijacks it, or jams the connection
  to force a reconnection you can capture from the start. Runs
  on Micro:bit hardware.
* **btlejuice** — older MITM tool for BLE. Supplanted by
  btlejack in most cases.
* **GATTacker** — BLE MITM proxy, in the same family.

## Workflow against an unknown BLE device

A typical first-day session against a new BLE peripheral:

1. **Open nRF Connect on a phone next to the device.** Scan.
   Identify the peripheral by its advertised name (often a
   product model) or by MAC address from the device label /
   pairing screen.
2. **Connect.** nRF Connect lists every service and
   characteristic, their properties (read, write,
   write-without-response, notify, indicate), and their values
   on tap.
3. **Identify standard services.** Battery, Device Info, HID, etc.
   are typically self-explanatory. Note their values for sanity
   (firmware version reported by the Device Info service is
   usually accurate and useful).
4. **Identify vendor services.** Anything with a UUID outside the
   standard set. These typically have one or two characteristics
   used for the proprietary protocol — often one "command" /
   "request" characteristic (writeable) and one "response" /
   "notification" characteristic (notifiable).
5. **Exercise the vendor app.** Open the vendor's mobile app
   while sniffing with nRF Connect (it can run in observer mode)
   or while sniffing the air with the nRF Sniffer. Capture the
   bytes written to the request characteristic and the
   notifications coming back.
6. **Decode the protocol.** Same TLV / fixed-frame approach as
   USB (Chapter 34): magic, length, command, payload, checksum.
7. **Write your own host script** with bleak to drive the device
   without the vendor app.

A scripted version with bleak:

```python
import asyncio
from bleak import BleakClient, BleakScanner

CMD_UUID  = "12345678-1234-1234-1234-12345678abcd"
RESP_UUID = "12345678-1234-1234-1234-12345678abce"

async def main():
    device = await BleakScanner.find_device_by_name("MyDevice")
    if device is None:
        raise RuntimeError("device not found")
    async with BleakClient(device) as client:
        # Subscribe to responses.
        async def on_notify(_, data: bytearray):
            print("<-", data.hex())
        await client.start_notify(RESP_UUID, on_notify)

        # Send a request you reversed earlier.
        await client.write_gatt_char(CMD_UUID, bytes([0xAA, 0x01, 0x00]))

        await asyncio.sleep(2)

asyncio.run(main())
```

## Pairing and encryption

BLE pairing produces a Long-Term Key (LTK) that encrypts the
connection. Reverse engineering an encrypted BLE link requires:

* Capturing the **pairing process** (the LTK is derived from
  this; if you capture pairing you can derive the LTK and
  decrypt subsequent traffic).
* The peripheral and central pairing while you have the sniffer
  running.

If the device pairs once at first use and then re-uses the LTK
across reconnections, you may not be able to passively decrypt
without re-pairing. btlejack can sometimes force re-pairing by
jamming the existing connection.

BLE 4.0 / 4.1 used **LE Legacy Pairing**, which has well-known
cryptographic weaknesses (effectively no MITM protection for
Just Works pairing, brute-force-feasible passkeys). BLE 4.2
introduced **LE Secure Connections** using ECDH (P-256) — much
stronger. Many devices in the wild still use LE Legacy because
they target lowest-common-denominator phones.

Worth knowing: even with LE Secure Connections, **Just Works**
pairing is unauthenticated, meaning a MITM during the initial
pairing can swap public keys and capture the LTK. The mitigation
is to require numeric comparison or passkey display, which most
consumer devices don't do because it requires UI on the
peripheral.

## Published research and case studies

Each of the items below has public writeups; the citations point
to the original sources.

* **KNOB Attack** (Antonioli, Tippenhauer, Rasmussen, USENIX
  Security 2019) — Key Negotiation of Bluetooth attack against
  Classic Bluetooth that downgrades encryption key entropy.
  Affects nearly every Bluetooth Classic stack at the time of
  publication.
* **BLURtooth** (Antonioli et al., 2020) and **BLESA** attacks
  — vulnerabilities in cross-transport key derivation and BLE
  reconnection.
* **SweynTooth** family (ASSET research group, NTU Singapore,
  2020) — implementation vulnerabilities in BLE stacks from
  multiple SoC vendors (Nordic, Cypress, NXP, Texas Instruments,
  Telink). Reachable via crafted link-layer packets.
* **Smart-lock vulnerabilities** — multiple researchers have
  published BLE-based attacks against consumer smart locks.
  Tapplock, August, and Tile have all had public writeups
  involving BLE-protocol-level issues.
* **Hardware wallet BLE work** — published research against
  multiple hardware wallets that added BLE interfaces.
* **Tesla key fob attacks** — researchers from KU Leuven and
  others have published practical BLE relay attacks against
  Tesla and other vehicles supporting BLE-based passive entry.

These are the public landmarks; the day-to-day vulnerability work
in consumer BLE devices is rarely as headline-grabbing but is
generally easier — most consumer devices use Just Works pairing,
unauthenticated GATT writes, and protocols that have not been
publicly reviewed.

## Anti-RE on BLE

* **Application-layer encryption** over GATT (the vendor encrypts
  payloads at the application level, independent of LE pairing).
  Bypassed by finding the key in the vendor's mobile app
  (instrument with Frida — Chapter 26).
* **Custom pairing schemes** — some devices use the standard BLE
  pairing only to establish a transport, then run their own
  authenticated key exchange over GATT.
* **Anti-debug / anti-tamper in the mobile app** — root
  detection, Frida detection, SSL pinning. Bypassed with the
  usual mobile-RE workflow (which deserves its own chapter and
  is beyond this book's scope).
* **Hardware-backed peripherals** — secure elements that
  perform the protocol cryptography in a tamper-resistant
  enclave. The protocol itself is observable but the secret
  material is not.

## Bluetooth Classic (briefly)

For completeness — most modern BLE devices do not also implement
Bluetooth Classic, but a few categories do (headphones, speakers,
older industrial gear, car infotainment). Quick notes:

* Different stack: L2CAP, RFCOMM, SDP, OBEX, A2DP, AVRCP, HFP,
  PBAP.
* `sdptool` enumerates Bluetooth Classic services.
* RFCOMM is essentially serial over Bluetooth; `rfcomm` tool +
  `/dev/rfcomm0` for a serial-style interface.
* Sniffing requires Ubertooth (better) or older TI hardware.
* Most successful attacks against Bluetooth Classic devices over
  the last decade have been against the stack (KNOB, BLURtooth),
  not against individual protocols.

If you find yourself reverse engineering a Bluetooth Classic
device, the references at the end of the chapter cover it.

## Reading

* **Bluetooth Core Specification** (`https://www.bluetooth.com/specifications`)
  — the authoritative reference. Free download; ~3000 pages.
  Volume 6 covers BLE specifically.
* **Bluetooth SIG Assigned Numbers** — the registry of standard
  UUIDs. Use it to recognise standard services.
* **Bleak documentation** — well-organised reference for the
  Python BLE workflows in this chapter.
* **Nordic Semiconductor's nRF Connect SDK documentation** —
  vendor docs that double as a clear BLE protocol explanation
  in code.
* **"Inside Bluetooth Low Energy"** by Naresh Gupta (Artech
  House) — classic textbook on the protocol stack.
* **"Bluetooth Low Energy: The Developer's Handbook"** by Robin
  Heydon (Prentice Hall) — older but the stack hasn't changed
  fundamentally.
* **Pen Test Partners' BLE writeups** (`https://www.pentestpartners.com`)
  — many case studies of consumer-device RE.
* **Damien Cauquil's btlejack documentation and DEF CON talks**.
* **The ASSET research group's SweynTooth disclosures** —
  excellent worked examples of stack-level BLE research.
* **Wireshark's BLE dissector documentation** — for decoding
  captured traffic.

BLE reverse engineering has a low entry cost (one nRF52840
dongle, one phone with nRF Connect) and a high ceiling. Most
consumer BLE devices have not been publicly reverse engineered
in detail; the field is wide open for both research publications
and bug bounty submissions.
