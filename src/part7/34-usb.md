# USB Protocol Reverse Engineering

Most embedded devices that connect to a host computer speak USB.
That means whenever you have a target you can plug in — a USB-to-
serial bridge, a hardware wallet, a fitness tracker dock, a custom
HID peripheral, a vendor's update tool talking to a USB DFU
loader — you can observe the bytes going back and forth, decode
them, and (often) replay them with your own host-side tooling. No
silicon decap, no JTAG, no firmware extraction required. This
chapter covers that workflow.

## A 30-second USB primer

USB devices announce themselves to the host via **descriptors**: a
nested tree of fixed-format data structures that identifies the
device, its **configurations**, its **interfaces** (each
interface implements one logical function), and within each
interface its **endpoints** (the addresses bulk/interrupt data
flows through). Every device has at least a control endpoint at
address 0 used for descriptor exchange and standard requests.

Four transfer types matter:

| Type      | Use                                                |
|-----------|----------------------------------------------------|
| Control   | Setup, standard requests, class requests           |
| Bulk      | Large, error-checked data (printers, mass storage, vendor) |
| Interrupt | Small, periodic, low-latency (HID, mouse, keyboard)|
| Isochronous | Streaming, time-sensitive, no error retry (audio, video) |

The device exposes a 16-bit **VID** (vendor ID, assigned by
USB-IF) and 16-bit **PID** (product ID, assigned by the vendor).
The pair identifies the device; published databases like
`linux-usb.org/usb.ids` map most public VID/PIDs to vendor and
product names.

Standard device classes simplify a lot of cases:

| Class                | Common subclass / use                  |
|----------------------|----------------------------------------|
| HID (0x03)           | Keyboards, mice, joysticks, custom HID |
| CDC (0x02 / 0x0A)    | Communications class — USB-to-serial   |
| Mass Storage (0x08)  | Removable drives, USB sticks            |
| Audio (0x01)         | Microphones, speakers, sound cards     |
| Video (0x0E)         | Webcams (UVC)                          |
| Printer (0x07)       | Printers                                |
| Vendor Specific (0xFF)| Custom, your-mileage-will-vary        |

Vendor-specific class is the interesting one for reverse
engineering — when a hardware wallet or update tool uses it, the
protocol on the wire is whatever the vendor invented and is what
you will need to decode.

## Step 1 — Identify the device

Linux:

```text
$ lsusb
Bus 003 Device 014: ID 1209:abcd Generic Project Generic Device
$ lsusb -v -d 1209:abcd | less        # full descriptor dump
```

`lsusb -v` walks every descriptor: device, configuration, every
interface, every endpoint, HID report descriptors, class-specific
descriptors. For unknown devices, that dump alone often tells you
"this is HID" or "this is CDC-ACM" without needing to capture
anything.

macOS:

```text
$ system_profiler SPUSBDataType
# Or in Xcode-style UI:
$ open -a "System Information"
```

Windows: **USBDeview** or **USBlyzer** (commercial) provide
similar enumeration UI.

Cross-platform from Python:

```python
import usb.core
for dev in usb.core.find(find_all=True):
    print(f"{dev.idVendor:04x}:{dev.idProduct:04x}  {dev.product}")
```

## Step 2 — Capture traffic

Three options ordered by cost and flexibility:

### Software capture (free, always start here)

**Linux: `usbmon` + Wireshark.** The Linux kernel exposes USB
traffic via the `usbmon` interface; Wireshark reads it directly.

```text
$ sudo modprobe usbmon
$ sudo wireshark
# In Wireshark, pick "usbmon0" (all buses) or "usbmonN" (bus N)
```

The capture shows every URB (USB Request Block) — submit, callback,
data payload. Wireshark dissects HID reports, CDC, MSC, and many
vendor-specific protocols if a dissector exists.

**Windows: USBPcap** (free, by Tomasz Mon) puts USBPcap.sys
between the host's USB stack and the device drivers and pipes the
traffic to Wireshark.

**macOS:** USB capture on modern macOS requires either:

* `tcpdump -i XHC20` style capture on virtual USB interfaces
  (limited),
* Apple's `usbtopcap` from the IOUSB family,
* a Linux VM with USB passthrough,
* hardware capture (next section).

macOS USB capture is genuinely worse than Linux or Windows. For
serious work, a Linux box is easier.

### Hardware capture (when software falls short)

When software capture cannot keep up (high-speed bulk transfers),
when the host OS hides the traffic, or when the device interacts
with two hosts you want to observe simultaneously, dedicated
hardware analysers help:

* **Total Phase Beagle USB 12 / 480** (~USD 300-1500). Sit
  inline; pass traffic through to the target host while
  exporting it to your analysis host.
* **Ellisys USB Explorer 350** (commercial, ~USD 10k+). Full
  USB 3.x support, every protocol detail.
* **LeCroy / Teledyne Voyager** (commercial, similar bracket).

For most embedded RE work the Beagle 12 is enough — full-speed
(12 Mbit/s) USB covers all HID, CDC, and most vendor-specific
embedded devices.

### Mobile-target capture

For iOS devices acting as USB peripherals: `rvictl -s <udid>` on
macOS creates a virtual capture interface that Wireshark can read.
For Android: USB log accessible via `bugreport` and Wireshark's
btsnoop converter; or use the in-emulator capture in Android
Studio.

## Step 3 — Decode

Once you have a capture, the work splits between standard classes
(easy) and vendor-specific protocols (harder).

### Standard classes

* **HID** — Wireshark's `usbhid` dissector decodes report
  descriptors and individual reports. For HID-class devices, the
  descriptor tells you the structure of every report (button N is
  bit X of report ID Y, axis X is signed 16-bit at offset Z).
  Tools: `usbhid-dump`, `usb-devices` (Linux), `hidviz` (GUI for
  decoding HID descriptors).
* **CDC-ACM** — "USB to serial". The bulk endpoint payloads are
  the serial data; just `cat` them through a script.
* **MSC** — SCSI commands over USB; Wireshark decodes them.
* **DFU** (Device Firmware Upgrade, USB-IF spec) — class 0xFE,
  subclass 0x01. The standard protocol many bootloaders use to
  receive firmware. Tools: `dfu-util`. If a device exposes DFU,
  you can often write your own firmware to it directly.

### Vendor-specific

When the class is 0xFF and the bulk endpoint just carries
whatever-the-vendor-wanted-to-send bytes, you reverse engineer:

1. **Capture during specific actions.** Trigger a known event in
   the device (press a button, ask the vendor's app to read a
   sensor, initiate firmware update). The diff between captures
   tells you which bytes correspond to which action.
2. **Identify framing.** Most vendor protocols have:
   * A magic / sync byte or word at the start.
   * A length field.
   * A type / command byte.
   * A payload.
   * Often a checksum or CRC trailer.
   Standard pattern; identify each field across many captures.
3. **Decode the type / command field.** Each command opcode does
   one operation. Build a table.
4. **Decode the payload structure.** Sensor values, status flags,
   firmware blocks, etc.
5. **Replay with a Python script** (next section).

The work is iterative — you build a partial understanding, write
a script that exercises the device, capture the response, and
refine. Usually two or three iterations get you from "what is
this" to "I can drive the device end-to-end".

## Step 4 — Talk back with libusb

Once you have the protocol, you can drive the device yourself
without the vendor's tooling. The standard cross-platform library
for this is **libusb** (with bindings for Python, Go, Rust, Java,
C#).

Python with `pyusb`:

```python
import usb.core, usb.util

dev = usb.core.find(idVendor=0x1209, idProduct=0xabcd)
if dev is None:
    raise RuntimeError("device not found")

dev.set_configuration()
intf = dev.get_active_configuration()[(0, 0)]
ep_out = usb.util.find_descriptor(intf,
    custom_match=lambda e: usb.util.endpoint_direction(e.bEndpointAddress)
                          == usb.util.ENDPOINT_OUT)
ep_in = usb.util.find_descriptor(intf,
    custom_match=lambda e: usb.util.endpoint_direction(e.bEndpointAddress)
                          == usb.util.ENDPOINT_IN)

# Send a request you reversed earlier.
ep_out.write(bytes([0xAA, 0x55, 0x01, 0x00]))

# Read the response.
data = bytes(ep_in.read(64, timeout=1000))
print(data.hex())
```

For HID devices, `hidapi` is friendlier (handles report
prefixing). For CDC-ACM, it's already a serial port — open `/dev/ttyACMx`
and use `pyserial`.

## DFU as a special case

The USB DFU class is interesting in its own right. Many development
boards (STM32 with built-in DFU loader, nRF52, Adafruit boards,
RP2040 via PicoTool) and a smaller number of production devices
expose DFU as a way to flash firmware over USB without any special
tooling beyond `dfu-util`. From a reverse-engineering perspective:

* **Detect DFU**: `lsusb -v` shows interface class `0xFE`,
  subclass `0x01`. `dfu-util -l` enumerates DFU devices.
* **Dump firmware**: `dfu-util -U dump.bin -a 0` — many DFU
  implementations support upload (device-to-host) in addition to
  download.
* **Flash modified firmware**: `dfu-util -D firmware.dfu -a 0`
  — assuming no signature check.
* **Recovery**: bricked DFU devices are often recoverable since
  DFU loaders are in ROM or in a separate small flash partition
  that the application can't erase.

Many published vulnerabilities in DFU implementations involve
missing or weak signature validation on the downloaded firmware.

## Vendor protocols you may encounter

A non-exhaustive list of protocols that have been publicly
documented through community RE work (use as inspiration, not
recipes):

* **STM32 ST-Link / J-Link debug protocols** over USB.
* **Trezor / Ledger / KeepKey hardware-wallet APIs** —
  open-source SDKs published by the vendors themselves; valuable
  reference material.
* **Logitech Unifying protocol** (wireless keyboards/mice via USB
  dongle) — extensively documented by Marc Newlin, Gerhard Klostermeier, and others, including the
  MouseJack family of vulnerabilities.
* **Razer / Corsair / Logitech RGB protocols** — many community
  projects (OpenRGB, ckb-next, etc.) implement these natively.
* **Phison / SMI / Silicon Motion** USB flash controller debug
  protocols — used in BadUSB-class research.
* **HID++ (Logitech extended HID)** — vendor extension to HID
  for reprogramming buttons and macros.

Looking at how those projects implement vendor protocols is the
fastest way to learn what the genre looks like.

## Wireshark dissectors

If you fully reverse a vendor protocol, writing a Wireshark
dissector turns one-off captures into a sustainable workflow.
Two options:

* **Lua dissector**: short, easy, no recompilation. Drop a `.lua`
  file in `~/.local/lib/wireshark/plugins/`. The Wireshark wiki
  has a full tutorial.
* **C dissector**: faster, integrated with the rest of Wireshark.
  Higher contribution bar but the right choice for a protocol
  you want to upstream.

Wireshark already ships dissectors for hundreds of protocols.
Before writing one, search the Wireshark source for the vendor
name — your protocol may already be supported.

## Anti-RE on USB

A few things vendors do that make USB RE harder:

* **Encrypted transport over USB.** AES-CTR / similar over a
  bulk endpoint. You see ciphertext in captures; need to find
  the key on the host (in the vendor's app — Frida-attach,
  Chapter 24/26) or in the device (Chapter 31 / 32).
* **Random nonces / sequence numbers** that prevent direct
  replay.
* **Challenge-response handshake at session start.**
* **Device-binding** — the device only accepts commands from a
  host that authenticated, and re-keys per session.

When you encounter these, the work moves to RE'ing the host-side
software (often easier than the firmware) or to instrumenting the
host with Frida to capture pre-encryption plaintext.

## Reading

* **USB Made Simple** (Jan Axelson) — readable introduction to
  USB. Older but the fundamentals are unchanged.
* **USB-IF documents** (`https://usb.org/documents`) — the
  authoritative specs. Heavy reading, but the HID and CDC class
  specs are essential references when you decode those classes.
* **`linux-usb.org`** — the Linux USB project; usb-devices,
  usb.ids, usbmon documentation.
* **The Wireshark User Guide and Dissector Developer Guide** —
  for both capture and writing dissectors.
* **MouseJack research** (Marc Newlin / Bastille) for an
  example of careful vendor-USB RE turned into published
  vulnerabilities.
* **The libusb wiki** — examples, troubleshooting, and the API
  reference for C, Python, and other bindings.

USB RE is one of the highest-yield reverse-engineering skills you
can develop in a few weekends. The cost barrier is essentially
zero (Wireshark + `usbmon`); the protocol stack is well-documented;
and every modern computer is full of USB devices that haven't been
fully reverse engineered.
