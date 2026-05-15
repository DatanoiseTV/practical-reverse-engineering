# Functions, Types, and Structures

Disassembly is bytes-as-instructions. To turn it into something you can
reason about, you annotate it with structure: function boundaries,
parameter types, local variable layouts, and the C structs that the
code is reading and writing. Radare2 has a complete type system for
this, and using it well changes both the readability of disassembly
and the quality of decompiler output.

## Function commands

You met `af` (analyse function) in Part I. The full family:

| Command        | What it does                                                 |
|----------------|--------------------------------------------------------------|
| `af`           | analyse function at current/given address                    |
| `af-`          | delete function                                              |
| `af+ name`     | create function with explicit name                           |
| `afn name`     | rename current function                                      |
| `afi`          | print function info (size, blocks, vars, callees)            |
| `afv`          | list local variables                                         |
| `afs`          | print/set function signature                                 |
| `afS`          | set function signature from string                           |
| `afc`          | get/set calling convention                                   |
| `afcl`         | list available calling conventions                           |
| `afb`          | list basic blocks                                            |
| `afx`          | list xrefs from this function                                |
| `aft`          | propagate types from signature into body                     |
| `afta`         | analyse types (full pass)                                    |
| `afm name`     | merge into named function                                    |

A common cleanup workflow: r2 found a function but missed the call
that goes to it from elsewhere. Manually:

```text
[0x...]> af @ 0x08005000          # define
[0x...]> afn handle_packet        # name it
[0x...]> afs int handle_packet(uint8_t *buf, size_t len)   # signature
[0x...]> aft                      # propagate types into the body
```

Now decompiling shows `handle_packet(buf, len)` everywhere, with
`buf` as `uint8_t*` and `len` as `size_t`.

## Calling conventions

A wrong calling convention means decompilation guesses parameters
wrong. R2 ships with a calling convention database; list:

```text
[0x...]> afcl
arm32
arm64
arm32fastcall
... (architecture-dependent)
```

Set:

```text
[0x...]> afc arm32 @ sym.foo
[0x...]> e anal.cc = arm32     # global default for new functions
```

For embedded ARM, the relevant ones are:

| Convention   | When to use                                                |
|--------------|------------------------------------------------------------|
| `arm32`      | AAPCS — args in r0..r3 then stack, return in r0            |
| `arm32fastcall` | the few cases where the compiler used a non-standard cc |
| `armcdecl`   | callee-cleanup variant (rare)                              |
| `arm64`      | AArch64 AAPCS — args in x0..x7                             |

For Cortex-M, the floating-point ABI matters: with FP-soft, all FP args
go through integer registers; with FP-hard (most Cortex-M4F+), they
use s0..s15. R2's `arm32` default assumes soft-float; if your binary
is hard-float, function signatures with `float` parameters will be
wrong. Override per function:

```text
[0x...]> afs int dsp_fft(float *in, float *out, int n) @ sym.dsp_fft
```

## Local variables

R2 detects stack and register variables during analysis. List them
in the current function:

```text
[0x...]> afv
arg int arg1 @ r0
arg int arg2 @ r1
var int var_4h @ sp+0x4
var int var_8h @ sp+0x8
```

Rename a variable for readability:

```text
[0x...]> afvn buf var_4h
[0x...]> afvn count var_8h
```

The renames flow through the whole function disassembly *and* through
the decompiler output. This is one of the most impactful things you
can do for a function you will spend more than 5 minutes on.

Set a type for a variable:

```text
[0x...]> afvt buf "uint8_t *"
[0x...]> afvt count size_t
```

Then re-run decompilation (`pdg`) and the C output uses your types.

## The type system

R2 has its own type definition language, accessible through `t*`
commands.

| Command  | Action                                              |
|----------|-----------------------------------------------------|
| `t`      | list all types                                      |
| `tk`     | list types as SDB keys                              |
| `to`     | open / parse a header file                          |
| `tos`    | parse a string of C source                          |
| `t-`     | delete a type                                       |
| `tp`     | print a struct/type at an address                   |
| `tl`     | link a type to an address (variable annotation)     |
| `tc`     | print all types as C definitions                    |
| `ts`     | structure operations                                |
| `tu`     | union operations                                    |
| `te`     | enum operations                                     |
| `tf`     | function-type operations                            |
| `tn`     | typename operations                                 |

Define a struct from C source:

```text
[0x...]> "tos struct usart_regs { uint32_t SR; uint32_t DR; uint32_t BRR; \
        uint32_t CR1; uint32_t CR2; uint32_t CR3; uint32_t GTPR; };"
```

(Note the double-quoted form because the command spans multiple words.)

Or load from a header file:

```text
[0x...]> to /usr/include/arpa/inet.h
[0x...]> to ./stm32f4_regs.h
```

Once a type is known, reference it:

```text
[0x...]> tp usart_regs @ 0x40011000      # print as struct at address
[0x...]> tl usart_regs = 0x40011000      # link the type to that address
```

The link makes references to fields visible everywhere in the disassembly:

```text
str r1, [r3]              ; usart_regs.SR
str r2, [r3, #4]          ; usart_regs.DR
```

Without the link you would see `[r3]` and `[r3, #4]` and have to do
the offset arithmetic in your head.

## Importing vendor headers

The big payoff: load the vendor's CMSIS / SDK headers and r2 understands
the entire peripheral block.

```text
[0x...]> to /opt/STM32CubeF4/Drivers/CMSIS/Device/ST/STM32F4xx/Include/stm32f407xx.h
[0x...]> tl USART_TypeDef = 0x40011000
[0x...]> tl GPIO_TypeDef = 0x40020000
... etc.
```

Now the disassembly reads as actual struct field accesses. Every register
access has a name. The decompiler output looks like the original C.

::: warning
Vendor headers are *huge* and contain a lot of preprocessor magic that
r2's `to` parser cannot fully chew. If `to` fails, run the header
through `cpp` first:

```text
$ cpp -P -DSTM32F407xx -nostdinc -I /opt/STM32CubeF4/Drivers/CMSIS/Include \
      stm32f407xx.h > stm32_flat.h
```

Then `to stm32_flat.h`. You may need to delete a few unsupported
constructs (`__attribute__` extensions r2 does not parse) by hand.
:::

## Enums

Enums are how you make integer constants readable. Define:

```text
[0x...]> "te enum gpio_mode { input=0, output=1, alt=2, analog=3 };"
```

Link a function parameter to the enum so its values render as names:

```text
[0x...]> afvt mode "enum gpio_mode" @ sym.gpio_set_mode
```

Now a call site `mov r1, #2; bl gpio_set_mode` shows `gpio_set_mode(r0, gpio_mode.alt)`
in the decompiler output.

## Function signatures and `aft`

`afs` sets a function's signature. `aft` propagates types from a
function's signature into its body — when you set `arg1` as `uint8_t *buf`,
`aft` follows reads and writes through that pointer and types those
locations too.

The right order is:

1. Set the function signature: `afs`.
2. Run `aft` for that function (or `afta` to do the whole binary).
3. Decompile (`pdg`) and check that types flow.

`afta` (the all-binary type pass) is part of `aaaa`. It is slow on big
binaries but pays for itself: types propagate transitively, so naming
one root function correctly cleans up many descendants.

## Structures from indirect access patterns

When you see code like:

```text
ldr r1, [r0, #0]
ldr r2, [r0, #4]
ldrb r3, [r0, #8]
str r3, [r0, #9]
```

you are looking at struct field access. R2 can sometimes infer the
structure layout, but you usually do better by defining it yourself:

```text
[0x...]> "tos struct packet { uint32_t magic; uint32_t length; uint8_t flags; uint8_t kind; };"
[0x...]> afvt packet "struct packet *" @ sym.handle_packet
[0x...]> aft @ sym.handle_packet
```

After `aft`, the disassembly shows `packet.magic`, `packet.length`,
`packet.flags`, `packet.kind` instead of offsets. Decompiler output is
correspondingly clearer.

## Saving types

Types live in the project (saved by `Ps`). They can also be exported
as C source:

```text
[0x...]> tc                      # all types as C
[0x...]> tc struct packet        # one type
[0x...]> tc > types.h            # to a file
```

Commit `types.h` to your firmware-RE git repo. Reload in another session
with `to types.h`. This is the cleanest way to share the structural
understanding of a binary across people or sessions.
