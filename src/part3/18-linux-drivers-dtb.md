# Linux Device Drivers and the Device Tree

When you reach a Cortex-A or MIPS Linux SoC, the kernel and its
modules are where the most interesting hardware-touching code lives.
The application userspace talks to the kernel via syscalls and
ioctls; the kernel talks to the silicon through device drivers.
Understanding driver code requires understanding the **device tree**
— the binary description of the hardware passed from bootloader to
kernel. This chapter covers both: how to extract and read DTBs, and
how to reverse engineer the matching kernel modules.

## What the device tree is

The Flattened Device Tree (FDT, distributed as `.dtb`) is a binary
format that describes a board's hardware to a generic kernel. Without
it, the kernel would have to hard-code knowledge of every board it
supports; with it, the same kernel image runs on dozens of boards
that differ in memory map, peripheral instances, GPIO connections,
and clock topology.

A DTB describes:

* CPUs (number, arch, frequency)
* memory regions (where DRAM lives, how big, reserved holes)
* every peripheral the SoC exposes that the kernel needs to drive
  (UART, SPI, I2C, USB, Ethernet, watchdog, …)
* peripheral *instances* on the board (which I2C bus, which GPIOs
  are wired to which sensors)
* clock graph (which oscillator drives which divider drives which
  peripheral)
* interrupts (which IRQ wires each peripheral to which controller)
* `chosen` settings the bootloader passed (kernel command line,
  initrd location, RNG seed)

The kernel parses the DTB at boot, walks the tree, and for each
node looks up a matching driver via the node's `compatible` strings.
Then it calls the driver's `probe()` function with the node, the
driver fills in its private state, and the device is live.

For a reverse engineer this means: **the DTB is the index of the
hardware**. If you have one, you can list every driver that gets
loaded, every memory region that gets mapped, every GPIO that gets
configured. If you only have the firmware blob and no DTB, recovering
something close to one is one of your first tasks.

## DTB ↔ DTS

DTBs are binary; DTS (Device Tree Source) is human-readable. The
`dtc` (Device Tree Compiler) converts in either direction.

Decompile:

```text
$ dtc -I dtb -O dts -o board.dts board.dtb
```

Compile:

```text
$ dtc -I dts -O dtb -o board.dtb board.dts
```

A DTS fragment looks like:

```text
/dts-v1/;

/ {
    compatible = "vendor,boardname", "vendor,socname";
    model = "Vendor BoardName Rev2";
    #address-cells = <1>;
    #size-cells = <1>;

    chosen {
        bootargs = "console=ttyS0,115200 root=/dev/mtdblock5 rootfstype=squashfs";
    };

    memory@80000000 {
        device_type = "memory";
        reg = <0x80000000 0x08000000>;     /* 128 MiB at 0x80000000 */
    };

    soc {
        compatible = "simple-bus";
        ranges;

        uart0: serial@10009000 {
            compatible = "ns16550a";
            reg = <0x10009000 0x100>;
            interrupts = <5>;
            clock-frequency = <24000000>;
            status = "okay";
        };

        i2c0: i2c@10010000 {
            compatible = "vendor,soc-i2c";
            reg = <0x10010000 0x40>;
            interrupts = <12>;
            #address-cells = <1>;
            #size-cells = <0>;

            sensor: temp@48 {
                compatible = "ti,tmp75";
                reg = <0x48>;
            };
        };
    };
};
```

That single fragment tells you:

* The board has 128 MiB of DRAM at `0x80000000`.
* Console is on `ttyS0` at 115200, the kernel uses an `ns16550a`
  driver, MMIO base `0x10009000`, IRQ 5, clock 24 MHz.
* I2C controller at `0x10010000`, IRQ 12.
* On that I2C bus, address `0x48` is a TI TMP75 temperature sensor.
* Root filesystem is squashfs on the 6th MTD block.

That is a substantial fraction of the board's hardware, in 30 lines
of text.

## Finding the DTB

Several places to look:

**Inside the firmware blob.** Many bootloaders concatenate the DTB
with the kernel. `binwalk firmware.bin` finds it:

```text
$ binwalk firmware.bin
DECIMAL    HEXADECIMAL  DESCRIPTION
0          0x0          uImage header, ...
64         0x40         LZMA compressed data
2097152    0x200000     Flattened device tree, size: 0x4f80 bytes
2118528    0x205000     ...
```

Extract:

```text
$ binwalk -e firmware.bin
$ ls _firmware.bin.extracted/
```

The DTB is the file with the `.dtb` extension or the offset matching
the FDT find. Decompile with `dtc`.

**Inside `/proc` on a running system.** If you have shell access:

```text
# cat /proc/device-tree/compatible
vendor,boardname

# cat /sys/firmware/fdt > /tmp/board.dtb
```

`/sys/firmware/fdt` exists when the kernel was passed an FDT at
boot. Copy it off; decompile with dtc.

**Bootloader environment.** U-Boot stores the DTB load address in
its environment. From U-Boot prompt:

```text
=> printenv fdtaddr
fdtaddr=0x83000000
=> md.b 0x83000000 0x100
```

Then dump those bytes (`md.b` prints hex; you can use `tftp put` to
exfil to a server, or write to MTD).

**Kernel source.** If the device runs a publicly-available kernel
(OpenWrt, vendor's GPL release), the DTS file is in
`arch/<arch>/boot/dts/`. Use it as your starting point even if the
in-firmware DTB has been modified.

## Reading a DTS

Useful patterns:

**`compatible` strings are the driver-binding key.** Each compatible
string is a vendor + model identifier. The kernel matches it against
each driver's `of_match_table`. So `compatible = "ti,tmp75"` binds
the `tmp75` driver in `drivers/hwmon/tmp75.c` to that node.

**`reg` describes register windows.** A list of `<address, size>`
pairs in the parent's address space. For the I2C example above,
`reg = <0x10010000 0x40>` means the controller's MMIO window is
0x40 bytes starting at `0x10010000`. For the I2C-attached sensor,
`reg = <0x48>` means the sensor lives at I2C address 0x48 (the
parent's "address" is an I2C address, not a memory address).

**`interrupts` is IRQ-controller-specific.** A simple `<5>` means
"interrupt line 5 on the parent's interrupt controller". An
`<GIC_SPI 5 IRQ_TYPE_LEVEL_HIGH>` form encodes type + number for
ARM's GIC. You typically need the SoC's TRM to map these to
hardware IRQ lines.

**`gpios = <&gpio0 7 GPIO_ACTIVE_LOW>`** means "GPIO 7 on the
controller named gpio0, active low". Trace through the gpio0 node
to find which physical pin that is.

**`pinctrl-N` / `pinctrl-names`** describes pin multiplexing setups.
Reading these tells you how the SoC's pads are configured for each
peripheral.

**`status = "okay"` vs `"disabled"`** controls whether the kernel
binds the driver. A node marked `disabled` is described in the DTS
but not active.

## Building a hardware map from the DTB

A productive workflow:

1. Decompile the DTB with `dtc`.
2. Walk the DTS top-down. For each peripheral, note: name, compatible,
   register window, IRQ, GPIO connections.
3. Cross-reference each `compatible` string against the kernel
   source's `MODULE_DEVICE_TABLE(of, ...)` macros to find the
   driver name:

```text
$ grep -rn 'of_device_id .*tmp75' linux/drivers/
linux/drivers/hwmon/tmp75.c:182:static const struct of_device_id tmp75_of_match[] = {
```

4. Read each driver to understand the actual control flow.

For a router, this typically gives you:

* SoC family
* WiFi chip (often `mtxxxx-wmac` style nodes)
* Switch chip (e.g., `vendor,7531-switch`)
* Each LED, button, and reset pin
* USB, MMC, NAND
* Crypto accelerator (if any)
* Watchdog

That is enough to know "what hardware is in this thing" before you
have read a single instruction.

## Reverse engineering kernel modules

Kernel `.ko` files are ELF object files with a few extra sections.
R2 reads them natively:

```text
$ r2 driver.ko
[0x...]> i
arch     mips
bits     32
endian   big
machine  mips
class    ELF32
[0x...]> aaa
```

Useful sections:

* `.text` — code (function bodies)
* `.init.text` — code only used during module load
* `.exit.text` — module unload
* `.rodata` — strings, constant tables
* `.modinfo` — module metadata: version, license, author, parameters
* `.kobj_strtab` — names of exported symbols
* `__ksymtab*` — exported symbols (the module's API)
* `__param` — module parameters

Read the metadata first:

```text
[0x...]> izz ~ depends=
[0x...]> izz ~ vermagic
[0x...]> izz ~ srcversion
[0x...]> iS ~ ksymtab           # exported symbols
```

`vermagic` tells you the exact kernel version the module was built
against. `depends=` lists kernel symbols this module imports
(other modules and the kernel itself).

## The driver model in disassembly

A platform driver registers itself with `platform_driver_register()`,
passing a `struct platform_driver` whose `.probe` and `.remove`
methods are called by the kernel. The structure has a fixed layout
that you can recognise in the binary:

```c
struct platform_driver {
    int (*probe)(struct platform_device *);
    int (*remove)(struct platform_device *);
    void (*shutdown)(struct platform_device *);
    int (*suspend)(struct platform_device *, pm_message_t);
    int (*resume)(struct platform_device *);
    struct device_driver driver;
    const struct platform_device_id *id_table;
    bool prevent_deferred_probe;
};

struct device_driver {
    const char *name;
    struct bus_type *bus;
    ...
    const struct of_device_id *of_match_table;
    ...
};
```

In the binary, search for a region of `.data` that contains:

* a few function pointers,
* a string pointer that resolves to a driver name,
* a pointer to an array that itself contains compatible strings.

That structure is a `platform_driver` instance. Its `.probe` field
points at the function that runs when the kernel binds the driver to
a device tree node — this is where the driver's interesting work
starts.

In r2:

```text
[0x...]> izz ~ "vendor,"           # compatible strings
0x...  "vendor,uart"
0x...  "vendor,i2c"
[0x...]> axt @ str.vendor_uart     # who points at it?
0x...  -> str.vendor_uart (DATA in .data)   ; in an of_device_id
[0x...]> pxw 64 @ <addr from axt>  # examine the structure
```

Walking up: the of_device_id is in the same struct as the driver's
name and (somewhere nearby) the platform_driver pointer. Find the
`probe` field of that platform_driver, follow the pointer, and you
have the driver's entry point.

## A worked example: an unknown ethernet driver

Suppose you have:

* A router's filesystem.
* A DTB extracted from flash.
* No source for the ethernet driver.

Steps:

1. Decompile the DTB:

```text
$ dtc -I dtb -O dts router.dtb > router.dts
$ grep -A 5 ethernet router.dts
ethernet@10100000 {
    compatible = "vendor,gmac-v2";
    reg = <0x10100000 0x1000>;
    interrupts = <23>;
    phy-handle = <&phy0>;
    phy-mode = "rgmii";
};
```

2. Find the driver:

```text
$ grep -lr 'vendor,gmac-v2' /lib/modules/
/lib/modules/4.14.146/kernel/drivers/net/ethernet/vendor/gmac.ko
```

3. Load the module in r2 and find the probe:

```text
$ r2 gmac.ko
[0x...]> aaa
[0x...]> izz ~ "vendor,gmac-v2"
0x000018a0  "vendor,gmac-v2"
[0x...]> axt @ str.vendor_gmac_v2
0x00001a40 -> str.vendor_gmac_v2 (DATA in .data)
[0x...]> pxw 64 @ 0x00001a40       # of_device_id table
[0x...]> # walk to find platform_driver, find .probe
[0x...]> # which points to the probe function
[0x...]> pdf @ <probe_addr>
```

The probe function tells you:

* Which clocks the driver enables (and at what rates).
* Which GPIOs it configures (chip-select, reset pins, etc.).
* Which IRQ handlers it registers and what they do.
* Which DMA channels it claims.
* Which sysfs entries / character devices it creates.

That is enough to write a driver for the same chip from scratch, or
to patch the existing driver, or to identify a vulnerability.

## DTB / driver gotchas

**Compatible string mismatch.** If the DTS uses a string the driver
does not know, the kernel does nothing — no error, no driver bound,
the device is silent. Check both ends.

**DTB overlays.** Some boards apply runtime overlays (`.dtbo`) to
add or change nodes. The base DTB does not show what the overlay
changes. Look in `/sys/kernel/config/device-tree/` on a running
system to see active overlays.

**Multiple kernels in one image.** Some firmware ships fallback
kernels in addition to the primary. Each may have a different DTB.
Check both.

**`memreserve` and `/reserved-memory`.** Holes in DRAM that the kernel
must not allocate from. Often used for DMA buffers, secure-world
firmware, or vendor blobs (e.g., the WiFi firmware blob staged in
RAM by the bootloader). The driver code that uses these regions
references them by `reserved-memory` node name; trace the link.

**Driver code that bypasses the framework.** Vendor drivers
sometimes ignore the standard subsystem APIs and write directly to
hardware. The DTB describes the device, but the driver's behaviour
may be more invasive than the DTB suggests. Read the code, not
just the metadata.

The combination of DTB-as-map and driver-as-implementation is
powerful. Start with the DTB, derive the hardware layout, then
match each peripheral to its driver, then read the drivers in the
order their devices initialise. By the time you reach the userspace
binaries, you already know what kernel surfaces they can call into
— and which calls reach which silicon.
