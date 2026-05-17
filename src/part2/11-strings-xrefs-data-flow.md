# Strings, Cross-References, and Data Flow

Strings are the cheapest, fastest source of insight in any binary.
Cross-references turn the binary from a flat byte sequence into a
graph you can walk. Following data flow turns "this register holds a
value" into "this register holds the second argument that was set 80
instructions ago by a configuration parser". This chapter covers the
three together because they reinforce each other constantly: a useful
string leads to its xrefs, which lead to a function, whose locals
flow back to the original input.

## Strings

Three commands, three different scopes:

| Command   | Scope                                                          |
|-----------|----------------------------------------------------------------|
| `iz`      | strings in data sections (`.rodata`, `.data`)                  |
| `izz`     | strings *anywhere* in the file (slow on big binaries)          |
| `izzz`    | every string, including encodings beyond ASCII/UTF-8           |

For embedded firmware, **always use `izz`**. Section information is
unreliable for raw blobs; strings live wherever the linker happened
to put them.

```text
[0x08000000]> izz | head -20
0x080001a0  "ARM_MATH_CM4"
0x080001ad  "stm32f4xx_hal_gpio.c"
0x080001c2  "GPIOx is NULL"
0x080001d0  "Init->Pin invalid"
...
```

Each string entry shows the address, the string, and (in the full
output) length and encoding. Filter:

```text
[0x...]> izz ~ \.c            # source file names
[0x...]> izz ~ ^http
[0x...]> izz ~i password      # case-insensitive
[0x...]> izz~ %d              # likely format strings
```

The `~` operator is r2's grep (Chapter 3). For repeating patterns
(MAC address-shaped strings, IPv4 literals, URL prefixes), use a
shell pipe:

```text
[0x...]> izz | grep -E '([0-9a-f]{2}:){5}[0-9a-f]{2}'  # MACs
[0x...]> izz | grep -E '\b[0-9]{1,3}(\.[0-9]{1,3}){3}\b'  # IPs
```

## Strings as flags

Each discovered string becomes a flag in the `strings` flag space:

```text
[0x...]> fs strings
[0x...]> f
0x080001a0  12  str.ARM_MATH_CM4
0x080001ad  20  str.stm32f4xx_hal_gpio_c
0x080001c2  13  str.GPIOx_is_NULL
...
```

Now you can reference the string by name everywhere:

```text
[0x...]> axt @ str.GPIOx_is_NULL    # who references this error message?
[0x...]> pdf @ `axt @ str.GPIOx_is_NULL ~[1]`   # decompile the caller
```

This is the single most useful debugging trick in r2: an error string
points back to the function that emitted it, which gives you the
function's purpose for free.

## Cross-references

`ax*` is the cross-reference subsystem.

| Command           | What it does                                          |
|-------------------|-------------------------------------------------------|
| `ax`              | list all xrefs                                        |
| `axt @ addr`      | xrefs **to** `addr` (who points here?)                |
| `axf @ addr`      | xrefs **from** `addr` (who/what does `addr` point to?) |
| `axg @ addr`      | xref graph at `addr`                                  |
| `ax addr1 addr2`  | manually create xref from `addr1` to `addr2`          |
| `ax-`             | delete xref                                           |
| `aex addr`        | track xrefs by ESIL emulation                         |
| `aax`             | analyse all xrefs                                     |
| `aar`             | analyse references in data                            |

`axt` and `axf` are the workhorses. The mnemonic that helps remember
which is which: **t** is **t**oward (xrefs that come toward this
address); **f** is **f**rom (xrefs that go from this address). Most
of the time you want `axt` — "who calls this function?"

Iteration patterns:

```text
[0x...]> pd 1 @@= `axt @ sym.imp.malloc ~[1]`   # disasm of every malloc caller
[0x...]> pdf @@= `axt @ str.password ~[1]`      # decompile every caller of pwd code
[0x...]> CC "calls printf" @@= `axt @ sym.printf ~[1]`  # comment every caller
```

For a function-level view, `axg` produces a graph in dot/mermaid
format you can render:

```text
[0x...]> axg @ sym.handle_packet > /tmp/g.dot
$ dot -Tpng /tmp/g.dot > g.png
```

## Data references

R2 distinguishes three kinds of cross-references:

* **CALL** — a function call (BL on ARM, JAL on RISC-V, …).
* **JMP** — a branch within or to another function.
* **DATA** — a load/store that addresses some location.

The third is the one that catches strings, MMIO accesses, and lookup
tables. You can filter by type:

```text
[0x...]> axt @ 0x40021018         # all xrefs (probably DATA from MMIO accesses)
[0x...]> ax | grep DATA           # all DATA xrefs in the binary
```

For a peripheral register, the DATA xrefs tell you every place in the
firmware that touches that register — invaluable for understanding
peripheral usage. Combine with type linking (Chapter 8) and you can
trace every write to `USART1->CR1` and figure out the UART
configuration sequence.

## Manual xrefs

Sometimes r2 misses a reference. The most common case is a computed
function pointer call:

```text
[0x...]> pd 5 @ 0x08001234
ldr r3, =fn_table
ldr r4, [r3, r0, lsl 2]   ; r0 is the index
blx r4                    ; r2 has no idea where this goes
```

If you can statically resolve the table and the index, add the xrefs
manually:

```text
[0x...]> ax 0x08001234 0x08010000   # call from caller to table[0]
[0x...]> ax 0x08001234 0x08010100   # call from caller to table[1]
[0x...]> ax 0x08001234 0x08010200   # call from caller to table[2]
```

Now `axt @ 0x08010000` reports the call site. The decompiler also picks
up the resolution and renders meaningful names (if you set them).

For very large dispatch tables, write an r2pipe script (Chapter 25)
that walks the table and emits `ax` commands.

## Following data flow

For non-trivial flow analysis, r2 has two approaches: **ESIL emulation**
and **type propagation**.

ESIL emulation runs a function symbolically:

```text
[0x...]> aei                       # initialise ESIL VM
[0x...]> aeim                      # initialise memory
[0x...]> aeip                      # set ESIL pc to current
[0x...]> aes                       # step
[0x...]> aer                       # ESIL register state
[0x...]> aer r0                    # value of r0
```

Step through a function until you reach the line whose data flow you
want to inspect, then read registers. For a constant-folding question
("what value reaches this comparison?"), this is faster than reading
the disassembly cold. Chapter 21 covers ESIL in depth.

Type propagation (`aft`) follows variables through a function based on
the types you set:

```text
[0x...]> afs int handle_packet(uint8_t *buf, size_t len) @ sym.handle_packet
[0x...]> aft @ sym.handle_packet
```

After `aft`, every load through `buf` is typed `uint8_t`, every
arithmetic on `len` is typed `size_t`. The decompiler renders the
function with those types intact.

## A worked example

Suppose you find an interesting string:

```text
[0x...]> izz ~ "fan speed"
0x080012a8  "fan speed: %d RPM"
```

Find who references it:

```text
[0x...]> axt @ str.fan_speed_d_RPM
0x08001234  -> str.fan_speed_d_RPM   (DATA in fcn.print_status)
```

Open the function:

```text
[0x...]> pdf @ fcn.print_status
```

You see it loads the address of the string, calls `printf` with it,
and the second argument comes from a pointer parameter dereferenced
at offset `+0x4`. The function reads:

```c
void print_status(struct sensor_state *st) {
    printf("fan speed: %d RPM", st->fan_rpm);
    ...
}
```

Now find who calls `print_status`:

```text
[0x...]> axt @ fcn.print_status
0x08001500  -> fcn.print_status   (CALL in fcn.main_loop)
```

Walk up: who calls `main_loop`? Eventually you reach the entry
function. Now you have a top-down map of the firmware's reporting
path, all from one string.

## Stable workflow patterns

Three patterns that come up daily:

**String -> function -> caller**: find an error string, trace its
references back to find the function emitting it, then find the
function's callers. Typically gets you from "what does this firmware
do?" to "here's the part that handles X" in five minutes.

**Constant -> users**: find a magic constant (a vendor product ID, a
protocol opcode, a CRC polynomial) and trace its references to find
every place that touches that protocol/feature.

**Peripheral -> users**: find a peripheral base address (`0x40021000`
for STM32 RCC), trace DATA xrefs to find every clock manipulation in
the firmware. Combine with HAL signatures and you have a clock
configuration map.

Get good at these three patterns and you will understand new firmware
faster than people who try to read it linearly.
