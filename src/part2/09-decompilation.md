# Decompilation: r2ghidra and r2dec

Disassembly tells you what every instruction does. Decompilation tells
you what the function as a whole was trying to do. For all but the
shortest functions, decompilation is the better starting point — even
when it is slightly wrong, it gives you a structure you can verify
against the disassembly faster than reading the raw assembly cold.

Radare2 has two decompiler plugins. They have different strengths,
different weaknesses, and you will use both. This chapter covers when
to reach for which, how to read the output critically, and how to
improve it.

## r2ghidra: the heavyweight

`r2ghidra` ports Ghidra's standalone decompiler engine into r2. It is
the same C++ engine Ghidra ships, exposed through r2's plugin API.
Output quality is essentially equivalent to standalone Ghidra. It is
the right default for any function more complex than 30 instructions.

Install (covered in Chapter 2):

```text
$ r2pm -ci r2ghidra
```

Use:

```text
[0x...]> pdg @ sym.main
```

`pdg` produces decompiled C. Variants:

| Command  | Output                                              |
|----------|-----------------------------------------------------|
| `pdg`    | decompiled C                                        |
| `pdgo`   | output with markers tying lines to instructions     |
| `pdgs`   | C source plus the original disassembly inline       |
| `pdgsd`  | structured C with each statement annotated          |
| `pdgj`   | JSON (for scripting)                                |
| `pdg*`   | r2 commands to recreate the analysis state          |

The `pdgs` form is the most useful when you do not yet trust the
decompiler. It puts each disassembly line next to the C statement it
generated, so you can verify line-by-line. After a few minutes you
develop a sense of when to trust `pdg` directly.

::: tip
`pdg` re-runs the decompiler on every invocation. For a function you
will read many times, decompile once and stash the output:

```text
[0x...]> 'pdg @ sym.foo' > /tmp/foo.c
```

Now `axt @ sym.foo` and any visual mode view shows the decompiled
source as a comment.
:::

## r2dec: the fast lightweight

`r2dec` is a JavaScript decompiler that runs in r2's embedded duktape
JavaScript engine. It is significantly faster to start (no C++ plugin
loading), produces more compact output, and handles common functions
well. It is weaker on complex control flow, exception handling, and
heavy struct-of-struct nesting.

Use:

```text
[0x...]> pdd @ sym.main
```

Variants:

| Command   | Output                                                 |
|-----------|--------------------------------------------------------|
| `pdd`     | decompile                                              |
| `pdda`    | annotated with addresses                               |
| `pddo`    | as comments next to the disassembly                    |
| `pddi`    | JSON                                                   |
| `pddu`    | only show the function signature (no body)             |

Use r2dec for:

* quick "what shape is this function" reads,
* very short functions where ghidra's startup cost is not worth it,
* scripting where you need decompilation as a string and you process
  many functions in a loop.

Use r2ghidra for everything else.

## Reading decompiler output critically

Decompilers are heuristics. They are very good heuristics, but they
make assumptions that are sometimes wrong. The classes of error to
watch for:

**Calling convention guess wrong.** Symptom: a function that obviously
takes two arguments shows up as taking five, with most parameters
unused. Fix: set `afc` correctly (Chapter 8) and re-decompile.

**Tail-call mistaken for fall-through.** Symptom: function A's body
ends with what looks like the start of function B's body. The
disassembler followed the tail-call branch. Fix: mark the boundary
with `af-` then `af` at the right addresses, or `aha ret` at the tail
call.

**Indirect call target unknown.** Symptom: `(*funcptr)(...)` in the
output, with no idea what `funcptr` resolves to. Fix: in r2 mark the
target — `axc 0x... 0x...` to add a manual call edge — and the
decompiler will show a name on next run.

**Switch dispatch table missed.** Symptom: a function with one big
basic block that ends in `bx r0` or `jr $t9`, no edges out. Fix: tell
r2 about the jump table:

```text
[0x...]> ahj @ 0x...                # mark as jump
[0x...]> aaft                       # propagate
```

Or annotate the table directly:

```text
[0x...]> Cd 4 @@= 0x08001000..0x08001020   # mark words as data
[0x...]> ax @ 0x08001000 ... 0x08001020    # add manual xrefs
```

Some switch tables are simply beyond automatic recovery; you write
the table by hand once and the decompiler picks it up.

**Stack frame layout wrong.** Symptom: arguments and locals look
shuffled. Fix: define them manually with `afv` (Chapter 8). The
decompiler reads from r2's variable database; correct that and the
output corrects.

**Pointer types lost.** Symptom: `*(uint32_t*)(arg1 + 0x4)` instead
of `arg1->field`. Fix: define the struct and link the parameter type
(Chapter 8).

## Comparing the two decompilers

The same function, decompiled with both:

```c
// pdg (r2ghidra) output
int32_t handle_uart_irq(USART_TypeDef *uart) {
    uint32_t sr = uart->SR;
    if ((sr & 0x20) != 0) {
        uint32_t data = uart->DR;
        ringbuf_push(&rx_ring, (uint8_t)data);
        if (rx_ring.len > 0x40) {
            uart->CR1 &= 0xffffffdf;
        }
    }
    return 0;
}
```

```c
// pdd (r2dec) output
function handle_uart_irq (uart) {
    var sr = *(uart);
    if ((sr & 0x20) != 0) {
        var data = *(uart + 0x4);
        ringbuf_push(&rx_ring, data & 0xff);
        if (rx_ring + 0x4 > 0x40) {
            *(uart + 0xc) &= 0xffffffdf;
        }
    }
    return 0;
}
```

r2ghidra used your `USART_TypeDef` struct; r2dec ignored it. r2ghidra
gave you a real return type; r2dec gave you a `function` keyword
(JavaScript-y). For reading C-like firmware, r2ghidra wins almost
every time.

## Decompiler-specific configuration

r2ghidra exposes its options through `e r2ghidra.*`:

```text
[0x...]> e r2ghidra.~
e r2ghidra.cmtcpp = true
e r2ghidra.casts = true
e r2ghidra.roprop = true       # propagate read-only data values
e r2ghidra.maximumdecompiletime = 30   # seconds
e r2ghidra.timeout = 30
e r2ghidra.sleighhome = ...    # path to ghidra processor specs
```

`r2ghidra.casts = false` cleans up output where the decompiler is being
overly explicit about width-narrowing casts.
`r2ghidra.maximumdecompiletime = 60` if a complex function is being
truncated.

r2dec uses `e r2dec.*`:

```text
[0x...]> e r2dec.~
e r2dec.casts = true
e r2dec.theme = default        # try "monokai", "ayu"
e r2dec.html = false
```

## When the decompiler refuses

A few patterns make all decompilers struggle.

**Self-modifying code.** Common in obfuscated firmware, occasional in
embedded bootloaders. Decompilers assume code is static; they can't
follow runtime patches. Read the disassembly, simulate with ESIL
(Chapter 21), or give up on auto-decompilation for that function.

**Hand-written assembly.** Vendor crypto routines, RTOS context
switches, interrupt entry stubs. They use registers in ways the C ABI
does not. Decompiler output for these is never useful — read the
assembly directly.

**Indirect dispatch through a table you cannot recover.** Some plug-in
architectures (vtables, function-pointer arrays from config) defeat
static analysis. Recover the table at runtime via debugging
(Chapter 20), then teach r2 about it.

**Code that confuses ESIL.** A few architectures have instructions
r2's ESIL cannot model. The decompiler fails silently or produces
garbage for that one instruction. Workaround: use `aha nop` to make
the decompiler skip that instruction, then read the disassembly to
understand what it actually did.

## Embedding decompiler output in your workflow

Three patterns:

**Quick read in visual mode.** From visual disasm view, press `p` to
cycle through views until you reach the decompiler view. The
decompiled C of the current function is shown live. `j`/`k` scroll.
Press `:` to drop into the prompt for one-off commands.

**Side-by-side in panels mode.** `v` to enter panels mode, `n pdg` to
add a decompiler panel, `Tab` to switch focus. Disasm in one panel,
decompiler in another, both following the cursor.

**Batch decompile to file.** For a binary you will read offline:

```text
[0x...]> for f in `afl ~ [3]`; do "echo === $f ==="; "pdg @ $f"; done > all.c
```

…or in a Python r2pipe script (Chapter 25):

```python
import r2pipe
r2 = r2pipe.open("firmware.bin", flags=["-r", "load.r2"])
r2.cmd("aaa")
for fn in r2.cmdj("aflj"):
    print(f"// {fn['name']} @ 0x{fn['offset']:x}")
    print(r2.cmd(f"pdg @ 0x{fn['offset']:x}"))
```

Now you have a single C file with the whole binary's pseudocode,
suitable for grepping, diffing across firmware versions, and feeding
to other tools.
