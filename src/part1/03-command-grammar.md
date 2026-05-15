# The radare2 Command Language

Radare2's command-line interface looks like line noise to newcomers. It is
not. There is a precise grammar underneath, and once you internalise it,
you can guess commands you have never seen and they will usually work.
This chapter teaches the grammar.

The grammar matters more than any specific command. Spend an hour on this
chapter and the rest of the book — and the rest of radare2 — becomes
readable instead of cryptic.

## Commands are letters

Every command in radare2 is a sequence of single letters. The letters
group hierarchically.

The first letter is the **subsystem**:

| Letter | Subsystem                              |
|--------|----------------------------------------|
| `a`    | analysis                               |
| `c`    | compare                                |
| `C`    | comments and metadata                  |
| `d`    | debugger                               |
| `e`    | evaluable variables (config)           |
| `f`    | flags (named addresses)                |
| `i`    | info about the binary                  |
| `o`    | open files                             |
| `p`    | print (disassembly, hex, strings, …)   |
| `P`    | project management                     |
| `s`    | seek (move the cursor)                 |
| `t`    | types                                  |
| `V`    | visual mode                            |
| `w`    | write (modify bytes)                   |
| `x`    | examine (hex-style print)              |
| `y`    | yank/paste                             |
| `?`    | help / evaluate expression             |

The second letter narrows. Under `p` (print):

| Command | What it does                                |
|---------|---------------------------------------------|
| `pd`    | print disassembly                           |
| `pdf`   | print disassembly of a function             |
| `pdb`   | print disassembly of a basic block          |
| `pdj`   | print disassembly as JSON                   |
| `pds`   | print disassembly summary (one line each)   |
| `pdr`   | print disassembly of all the function code (recursively) |
| `px`    | print hex                                   |
| `pxw`   | print hex as words (32-bit)                 |
| `pxq`   | print hex as quadwords (64-bit)             |
| `ps`    | print string                                |
| `psz`   | print zero-terminated string                |

You can guess the pattern: under `a` (analyse), `aa` analyses everything,
`af` analyses a function, `ab` a basic block. Under `f` (flags), `f` lists
flags, `fs` selects a flag space, `fr` renames a flag.

::: tip
When you do not know the next letter, append `?`:

```text
[0x00]> p?
| Usage: p[=68abcdDfiImrstuxz?][ J|j|*|?]
| p   show help on print command
| p=  draw analysis bars (entropy, flags, …)
| p6  base64 encode/decode
| p8  print 8-byte hex
| ...
```

Every level of the tree responds to `?`. Use it constantly.
:::

## Suffixes change the form, not the function

A command's last letter or two often modifies the **output format**:

| Suffix | Meaning                                                    |
|--------|------------------------------------------------------------|
| `j`    | output as JSON                                             |
| `q`    | quiet — minimal output, one item per line                  |
| `*`    | output as r2 commands (so you can replay them)             |
| `,`    | output as a table you can sort/filter                      |
| `~...` | grep — see below                                           |

So `afl` lists functions in human form; `aflj` produces JSON; `aflq`
produces just the names; `afl,` produces a sortable table. They are the
same command at heart.

This consistency is the point. When you see a new command, look at the
trailing characters separately from the head.

## The temporary seek `@`

This is the most powerful operator in r2's command line:

```text
<command> @ <address-or-expression>
```

It runs `<command>` *as if you had seeked to that address first*, and
returns you to where you were. You almost never need to seek manually
just to look at something.

```text
[0x08001000]> pdf @ main             # disassemble main
[0x08001000]> pxw 64 @ 0x20000000    # 64 bytes of words at SRAM start
[0x08001000]> ps @ 0x080048a0        # the string at that address
```

The address can be:

* a literal — `0x08000000`
* a flag name — `main`, `sym.imp.printf`, `loc.0x801234`
* an arithmetic expression — `main + 0x20`, `entry0 + 4*8`
* a register name in debugger mode — `pc`, `sp`, `r0`

There is also `@@`, which iterates:

```text
[0x00]> pd 1 @@ str.*    # one disasm line at every flag matching str.*
[0x00]> af @@= 0x100 0x200 0x300   # define functions at three addresses
```

`@@=` takes an explicit list. `@@` followed by a flag glob iterates over
matching flags. `@@i` iterates over imports, `@@f` over functions, and
so on (`@?` lists them all).

## The pipe `|` and grep `~`

Radare2 has its own internal grep, written `~`. It is more powerful than
piping to system grep because it understands columns and indexing.

```text
[0x00]> afl ~ printf       # list functions whose line contains "printf"
[0x00]> afl ~ printf:0     # only the first match
[0x00]> afl ~ printf[0]    # only the first column of matching lines
[0x00]> afl ~! debug       # negate: lines NOT containing "debug"
[0x00]> afl ~ {0,3}        # columns 0 and 3 only
```

You can pipe to a real shell command with `|`:

```text
[0x00]> afl | wc -l
[0x00]> izz | grep -i password
```

Or feed input from a shell command with `!`:

```text
[0x00]> .!cat addresses.txt   # run shell command, treat output as r2 cmds
```

The leading `.` causes r2 to interpret the output as commands rather
than printing it.

## Iterating with `@@@`

`@@@` iterates with **scope** — the iterator knows about r2 concepts
(strings, imports, sections, functions) and runs your command at each
one's address.

```text
[0x00]> pdf @@@F        # disassemble every function
[0x00]> ps @@@s         # print every string
[0x00]> ix @@@i         # show xrefs to every import
```

`@@@?` lists scopes. The capitalised letters tend to mean "all of this
type"; lowercase variants iterate over different sets.

## Expressions and variables

Radare2 has a small expression language. `?` evaluates an expression and
prints it in multiple bases:

```text
[0x00]> ? 0x100 + 32
288 0x120 0440 100.0K 0x100+0x20 288.0 0000:0120 ...
[0x00]> ? sym.main
0x080012a0 134288544 0x80012a0 ...
```

`?v` is the value-only form, useful in scripts:

```text
[0x00]> ?v sym.main + 4
0x080012a4
```

You can store and recall values with `$` variables:

```text
[0x00]> ?v $$           # $$ is the current seek
0x08001000
[0x00]> ?v $s           # $s is the current section size
```

A useful one is `$F` (current function start) and `$FE` (current function end).

## Configuration: the `e` command

Every knob in radare2 is an `e`-variable. Inspect, set, list:

```text
[0x00]> e asm.arch       # show current architecture
[0x00]> e asm.arch = arm # set
[0x00]> e asm.~          # list everything matching "asm."
[0x00]> e?               # full help
```

Configuration variables persist within the session. To make them sticky
across sessions, put `e` lines in `~/.radare2rc`. To make them per-project,
put them in the project's `rc` file.

::: warning
A misconfigured `asm.arch` produces nonsensical disassembly that *looks*
plausible. If a function decodes to garbage, check `asm.arch`,
`asm.bits`, and `asm.cpu` first. This is the single most common
"radare2 is broken" mistake.
:::

## Putting it together

A real one-liner from a debugging session:

```text
[0x08001000]> pd 1 @@= `axt @ sym.imp.malloc ~[1]`
```

Reading right-to-left: `axt @ sym.imp.malloc` lists xrefs to the malloc
import; `~[1]` extracts column 1 (the address); the backticks turn that
into a list; `@@=` iterates over the list; `pd 1` prints one disassembly
line at each iteration. Net effect: one line of disassembly at every
call site of `malloc`.

You will write commands like this within a week of practice. The grammar
is unfamiliar but it is a grammar — every piece is composable with every
other piece, and once you see the rules you stop typing instructions and
start typing sentences.
