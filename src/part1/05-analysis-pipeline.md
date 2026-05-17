# Analysis: From `aaa` to a Clean Call Graph

Loading a binary gives you raw bytes mapped at addresses. Analysis turns
that into functions, basic blocks, cross-references, strings, and a call
graph you can navigate. Radare2's analysis is layered: each `a*` command
runs a different pass with different cost and different risk of being
wrong. This chapter explains the layers, the order they run in, and
which flags to enable or disable for which kind of binary.

## The `a` command family

`a?` lists the analysis subsystem. The headline commands:

| Command  | What it does                                                           |
|----------|------------------------------------------------------------------------|
| `aa`     | analyse all (functions + basic blocks + symbols), default level        |
| `aaa`    | aa + extra passes (calls, code refs, types, jumps from imports)        |
| `aaaa`   | aaa + experimental passes (might rename functions; can be wrong)       |
| `aaaaa`  | aaaa + everything else; slow, last resort                              |
| `af`     | analyse function at current/given address                              |
| `afr`    | analyse function recursively (follow all called functions)             |
| `aac`    | analyse all calls (find call sites you missed)                         |
| `aar`    | analyse all references (data and code)                                 |
| `aap`    | analyse all preludes (find functions by recognising entry sequences)   |
| `aae`    | analyse all by ESIL emulation                                          |
| `ad`     | analyse data (find structures, arrays)                                 |
| `ac`     | classify (auto-set function types from references)                     |

For most well-formed binaries, `aaa` is the right level. For raw firmware
without symbols, `aaaa` finds more functions but is more likely to invent
ones that are not real.

## A safe analysis recipe

Default recipe — works for ELFs, Mach-Os, and most well-formed firmware:

```text
[0x00]> aaa
```

That is it. You then read the result with:

```text
[0x00]> afl              # list functions
[0x00]> afl ~ main       # filter
[0x00]> aflc             # function call counts
[0x00]> agf              # ASCII call graph for current function
[0x00]> agC              # call graph for whole binary (huge, dump to file)
```

For firmware blobs, the recipe needs more care because there is no
entry-point list to seed analysis from. Build it up:

```text
[0x00]> e anal.from = 0x08000000     # restrict analysis to flash
[0x00]> e anal.to   = 0x08100000
[0x00]> e anal.depth = 64            # how deep to recurse on calls
[0x00]> aap                          # find functions by prelude pattern
[0x00]> aac                          # find more by examining call sites
[0x00]> aar                          # propagate references
[0x00]> aaft                         # propagate types (BB-level)
```

`aap` is the workhorse for stripped firmware. It scans the loaded
sections for known function preludes (e.g., ARM Thumb `push {..., lr}`,
MIPS `addiu sp, sp, -N`, RISC-V `addi sp, sp, -N`) and creates function
boundaries at every match. It is fast and usually correct.

::: warning
On architectures where `aap` does not have good preludes (8051, AVR,
some Xtensa builds), it finds nothing. Fall back to `aac` (call-target
discovery), which seeds functions from the destinations of `call`-class
instructions. See the relevant Part III chapter.
:::

## Important `anal.*` knobs

| Variable             | Default | What it does                                                              |
|----------------------|---------|---------------------------------------------------------------------------|
| `anal.depth`         | 16      | recursion depth when following calls. Raise to 64 for deep firmware       |
| `anal.bb.maxsize`    | 4096    | max basic block size. Raise if you have huge unrolled loops               |
| `anal.fcn.maxsize`   | 0x100000 | max function size. Lower if r2 merges two functions together             |
| `anal.hasnext`       | false   | continue after function end if next bytes look like code                  |
| `anal.from / to`     | -1      | restrict analysis address range                                           |
| `anal.in`            | io.maps | scope (`io.maps`, `dbg.map`, `bin.section`, …)                            |
| `anal.jmp.tbl`       | true    | recover jump tables (essential for switch statements)                     |
| `anal.jmp.indir`     | true    | follow indirect jumps via ESIL                                            |
| `anal.calls`         | true    | mark function calls during prelude analysis                               |
| `anal.cc`            | (arch)  | calling convention for new functions                                      |
| `anal.armthumb`      | true    | distinguish ARM and Thumb during analysis                                 |

The two that bite most often are `anal.depth` (too low and call graphs
look truncated) and `anal.in` (too broad and r2 wastes minutes scanning
unmapped regions). For ROM-only firmware, set `anal.in = io.maps` and
restrict `anal.from`/`anal.to` to your code section.

## Reading the analysis output

After analysis, the things you want to look at first:

**Function list:**

```text
[0x00]> afl
0x080001cd    1 18           reset_handler
0x080001df    1 12           default_handler
0x080001eb    4 40           sym.SystemInit
0x08000213    8 124   -> 116 sym.main
0x0800028f    1 14           sym.HAL_GPIO_Init
...
```

Columns: address, basic block count, total size (`-> N` shows decompiled
size if smaller), name. Sort by `aflj` and pipe to `jq` if you need
something specific.

**Strings:**

```text
[0x00]> izz       # all strings (entire binary, not just sections)
[0x00]> iz        # strings in data sections only
```

For embedded the difference matters: `iz` misses strings that live in
flash without being in a recognised data section, which is most of them.
Use `izz` and live with the false positives.

**Imports:**

```text
[0x00]> ii        # imported symbols (libc functions etc., for ELFs)
```

Mostly empty for bare-metal firmware. Useful for Linux userland on
Cortex-A.

**Cross-references:**

```text
[0x00]> axt @ sym.main             # what calls main?
[0x00]> axf @ sym.main             # what does main reference?
[0x00]> ax                         # all xrefs in the database
```

`axt` (xrefs *to* this address) is the single most useful command for
following control flow backwards. Combine with iteration:

```text
[0x00]> pdf @@= `axt @ sym.imp.printf ~[1]`   # disasm every printf caller
```

## Function recovery problems and how to spot them

Real binaries trip up analysis. Watch for these patterns:

**One enormous function.** Two real functions got merged because the
boundary between them looked like a tail call. Check with `afl ~ ` and
look for a function with implausible size. Fix:

```text
[0x...]> af-                        # delete the function
[0x...]> af @ 0x08001234            # recreate at the correct entry
```

**A function with one basic block and 200 instructions.** A jump table
was missed and `aap` saw the whole linear stretch as one block. Fix:

```text
[0x...]> ahb 16                     # hint: this is Thumb (if arch confused)
[0x...]> af-                        # remove
[0x...]> aac                        # rerun call discovery
```

**Functions that "exist" but contain decode-as-data noise.** `aap` matched
a prelude pattern in literal-pool data. Delete with `af-` and add
`Cd 4 @ <addr>` to mark those bytes as data, so analysis ignores them.

**Decompilation produces nonsense for one function but works for others.**
Almost always a calling-convention mismatch. Set the cc explicitly:

```text
[0x...]> afc cdecl @ sym.foo        # set calling convention
```

Or, on ARM, set the right ABI:

```text
[0x...]> e anal.cc = arm32
```

::: tip
`aaa` is idempotent — running it again will not undo your manual fixes.
Combine: load, `aaa`, fix the obvious problems by hand, run `aaa` again
to propagate the fixes through xrefs.
:::

## Hints (`ah`)

When the analysis is wrong about something, you tell r2 with **hints**.
Hints attach to addresses and survive re-analysis.

```text
[0x...]> ahb 16 @ 0x08001234       # bits at this address (Thumb here)
[0x...]> ahb 32 @ 0x08001500       # ARM mode (thumb-interworking)
[0x...]> aha mov @ 0x...           # treat as MOV (override decode)
[0x...]> ahf @ 0x08001234          # this address is a function
[0x...]> ahi 10 @ 0x...            # display this immediate as decimal
[0x...]> ahi h @ 0x...             # ... as hex
[0x...]> ahi b @ 0x...             # ... as binary
[0x...]> ahS .text @ 0x...         # set syntax variant
[0x...]> ahc 0x08001234            # this byte is the start of a call
```

ARM/Thumb interworking is the big use case: a Cortex-M binary with mixed
ARM and Thumb code (rare but it happens with TrustZone secure-side code)
needs `ahb 16` and `ahb 32` hints in the right places, or half the
disassembly will be wrong.

## Re-running analysis

If you change any `anal.*` knob, re-run the relevant pass. `aaa` is
expensive on big firmware; for incremental work, use the narrower commands:

```text
[0x...]> af @ 0x08005000          # just analyse this one function
[0x...]> afr @ 0x08005000         # ... and recursively into its callees
[0x...]> aac                      # find calls you missed
[0x...]> aar                      # data refs only
```

For multi-megabyte firmware, the whole `aaa` run can take minutes;
narrow commands run in milliseconds. Save the project (`Ps`) before
running `aaaa` so you can re-open the saved project (`P name`, formerly
`Po name`) to roll back to a clean state if it makes things
worse.

## When to escalate to `aaaa`

`aaaa` runs additional passes that try to:

* propagate types across calls,
* recover function names from RTTI / vtables,
* find functions that look like noreturn,
* infer signatures from string formatting calls.

It can take 10× longer than `aaa` and occasionally renames functions
incorrectly. Use it on:

* large stripped C++ binaries,
* binaries with extensive vtable use,
* anywhere you want noreturn detection (it improves graph layout).

Skip it on:

* small bare-metal firmware (it adds nothing useful),
* anything where the analysis is already correct.

## What "good" looks like

After analysis, a healthy session looks like:

```text
[0x08000000]> afl | wc -l
347
[0x08000000]> afl ~ ?              # functions matching unknown patterns
0x08000a40    1 12           fcn.08000a40
... (handful, most named or recognisable)

[0x08000000]> agC > /tmp/cg.gv     # full call graph
[0x08000000]> !! dot -Tpng /tmp/cg.gv > /tmp/cg.png && open /tmp/cg.png
```

If the call graph has many disconnected islands, r2 missed call edges.
Run `aac` again and re-check. If the count of `fcn.*`-named functions
is large, you have many functions r2 found but did not name from any
symbol or string — that is normal for stripped firmware and the next
chapters will give you tools to name them.
