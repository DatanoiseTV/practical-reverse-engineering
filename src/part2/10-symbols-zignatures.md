# Symbol Recovery and Zignatures

A stripped firmware image is a list of unnamed functions. Some of those
functions are application code that nobody outside the original developers
will ever recognise, but a substantial fraction are library code:
the C runtime, vendor HALs, RTOS kernel routines, crypto primitives,
TCP/IP stacks. Those are recoverable. This chapter covers how.

The technique is **function signature matching**: you build a database
of recognisable byte patterns from a known binary (a vendor SDK, a
reference build, an open-source library), and then ask r2 to look for
matches in the unknown binary. When it finds one, the function gets
renamed automatically. The IDA equivalent is FLIRT; r2's is
**zignatures** ("signatures" is taken).

## Why this matters

Imagine you load a 256 KiB STM32 firmware. `aaa` finds 600 functions.
About 200 of them are HAL routines you can recognise from the vendor
SDK. Without signatures, you read each one cold; with signatures, those
200 land already-named (`HAL_GPIO_Init`, `HAL_UART_Transmit`,
`HAL_RCC_OscConfig`, …) and you only have to read the 400 that are
genuinely application code.

The same applies to:

* **Newlib / glibc-arm**: `memcpy`, `memset`, `strcpy`, `strlen`, `printf`,
  `malloc`, `free`. Without these named, every function looks like it
  reinvents string handling.
* **mbedTLS / wolfSSL**: AES, SHA, RSA primitives.
* **lwIP / FreeRTOS+TCP**: socket, packet, ARP, ICMP code.
* **FreeRTOS / Zephyr / NuttX**: scheduler, queue, task management.
* **libgcc**: long division, soft-float, exception unwinding.

A good signature database can name 30–60% of the functions in a typical
embedded firmware. That is hours of reading you do not have to do.

## Zignature commands

The `z*` family:

| Command   | What it does                                                |
|-----------|-------------------------------------------------------------|
| `z`       | list all loaded zignatures                                  |
| `z.`      | list zigs matching the current function                     |
| `zb`      | best matches for current function                           |
| `zg`      | generate a zignature for the current function               |
| `zo`      | save zignatures to a file                                   |
| `z/`      | search the binary for matches against loaded zignatures     |
| `z*`      | print zignatures as r2 commands (re-runnable)               |
| `z-`      | delete a zignature                                          |
| `zs`      | list zignature spaces (group by name)                       |

A zignature is a fingerprint of a function consisting of:

* the **bytes** of the function (with wildcards for relocations and
  immediate operands that vary);
* the **graph** structure (basic blocks, edges);
* the **mnemonics** in order;
* the **xrefs** the function makes (which functions it calls);
* the function's **size**.

You can match on any subset.

## Building a zignature database from a known binary

Step 1: get a binary you do have symbols for. The vendor SDK ships with
example builds and library archives:

```text
$ ls /opt/STM32CubeF4/Drivers/STM32F4xx_HAL_Driver/Lib/
libSTM32F4xx_HAL_Driver.a
$ arm-none-eabi-ar x libSTM32F4xx_HAL_Driver.a
$ ls *.o
stm32f4xx_hal.o
stm32f4xx_hal_gpio.o
stm32f4xx_hal_uart.o
...
```

Step 2: load each `.o` (or the linked archive) in r2 and analyse:

```text
$ r2 stm32f4xx_hal_gpio.o
[0x...]> aaa
```

Step 3: generate zignatures for every function:

```text
[0x...]> zg                   # for current function only
[0x...]> zg @@f               # for every function (preferred)
[0x...]> zs                   # list zig spaces
[0x...]> zo stm32f4_hal.sdb   # save to file
```

Step 4: repeat for every library you care about, then concatenate:

```text
$ ls *.sdb
stm32f4_hal.sdb
newlib_arm_thumb.sdb
freertos.sdb
mbedtls.sdb
```

Or build a single combined database by loading all of them in one r2
session before saving.

## Matching against an unknown binary

Step 1: load the unknown binary with the right architecture and
analyse:

```text
$ r2 -a arm -b 16 -m 0x08000000 unknown.bin
[0x08000000]> aaa
```

Step 2: load the zignature database:

```text
[0x...]> zo stm32f4_hal.sdb       # load
[0x...]> zo newlib_arm_thumb.sdb
[0x...]> zo freertos.sdb
[0x...]> z                         # confirm loaded
[0x...]> zs                        # spaces
```

Step 3: search:

```text
[0x...]> z/                        # search and apply matches
```

`z/` walks every loaded zignature, scores it against every function in
the binary, and renames functions that match above the threshold. The
threshold is `e zign.threshold` (0.0 to 1.0; default 0.0 — match
anything plausible). Higher values produce fewer but more confident
matches.

Step 4: review what changed:

```text
[0x...]> afl ~ ^sym\.            # functions that now have names
[0x...]> afl ~ fcn\.             # still anonymous
```

Adjust the threshold and re-run `z/` until the match count looks
right. Too low and you get false positives (a generic 4-instruction
function matches twenty things in your DB); too high and you miss
real matches because the compiler used slightly different optimisation
settings.

## Per-zignature controls

Inspect a single zignature:

```text
[0x...]> z foo
name: foo
bytes: 80b500f0..fa00bd...
graph: cc=2, nbbs=3, edges=4, ebbs=1
addr: 0x08001234
refs: HAL_GPIO_Init, HAL_RCC_GetClockFreq
```

`bytes` is the byte fingerprint with `..` wildcards where the bytes
are not stable (typically PC-relative offsets, immediate constants
the linker fills in, or BL targets).

`graph` is the structural metric. Two functions with identical byte
sequences but different graph metrics are not a match.

`refs` is the call graph fragment. If the unknown function calls the
same other functions in the same order, the match is strongly
reinforced.

Increase confidence in a match by requiring multiple metrics:

```text
[0x...]> e zign.match.bytes = true     # default true
[0x...]> e zign.match.graph = true
[0x...]> e zign.match.refs  = true
[0x...]> e zign.match.types = true
[0x...]> e zign.threshold = 0.9        # be strict
```

## Caveats

**Compiler flags matter.** A function compiled with `-Os` and the same
function compiled with `-O2` produce different byte patterns and
different graphs. If your unknown binary was built with vendor
defaults and your reference was built with optimisation tweaks, match
rates drop. Build the reference with the vendor's published flags.

**ABI matters.** A HAL built for hard-float ABI matches differently
than one built for soft-float. Match the unknown's ABI when building
the reference.

**Library version matters.** STM32 HAL `1.27.0` and `1.28.0` differ
in dozens of functions. The differences are small (a few extra
instructions, a different return type) but break exact matches.
Either build a database per version, or accept lower match rates and
verify each match by hand.

**Tiny functions match too easily.** A 3-instruction `memset`
fragment matches the same fragment in `memcpy`, `memmove`, and any
other function that ends with a similar `LDR; STR; SUBS; BNE` loop.
Filter out matches below some size:

```text
[0x...]> e zign.minsz = 0x20      # only consider functions ≥ 32 bytes
```

::: warning
Always confirm signature matches before relying on them. A wrong
match is worse than no match because it gives you a confidently
incorrect name. Open the function, read it, decide if the name fits.
:::

## Symbol recovery from elsewhere

Zignatures are not the only source of names. Scan all of these on
every binary:

**Strings near function entries.** When code does `printf("foo: %d\n", ...)`,
the format string is a strong hint about what the function does:

```text
[0x...]> izz~ ":"            # all strings with colons (often format strings)
[0x...]> axt @ str.foo_d     # which functions reference that string?
```

**Error message strings.** RTOSes emit error strings with the function
name in them: `"vTaskDelay called with NULL handle"` tells you the
function nearby is `vTaskDelay`.

**Function pointer tables.** A const array of function pointers with
adjacent string descriptions is a goldmine. Dump:

```text
[0x...]> pxw 256 @ 0x08010000   # words at the table
```

If the table interleaves `function_address, "function_name_string"`,
you can rename them in a loop with an r2pipe script (Chapter 25).

**Build IDs and compiler signatures.** Find them with:

```text
[0x...]> izz ~ GCC
[0x...]> izz ~ clang
[0x...]> izz ~ "Build:"
```

These do not name functions but they tell you the toolchain, which
informs which signature DB to use.

**Vector tables.** On Cortex-M, the first 16+IRQ words are the vector
table. You know the IRQ ordering from the vendor's header file. Each
vector entry's target is an interrupt handler whose name you can
reasonably guess from the IRQ. Chapter 12 covers this in detail.

**Linker section names.** ELF firmware sometimes leaves
`.text.HAL_GPIO_Init` style section names even after symbol stripping.
Check `iS` for them and recover the function names from the sections.

The combination — zignatures plus strings plus vector tables plus
section names plus a careful read of the entry function — typically
names 40–70% of an embedded firmware's functions before you have read
a single line of disassembly cold.
