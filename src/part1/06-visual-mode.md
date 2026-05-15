# Visual Mode, Panels, and Navigation

The visual mode is r2's interactive disassembly browser. It is purely
keyboard-driven, fast, and surprisingly comfortable once you have the
shortcuts in your fingers. This chapter covers visual mode, panels mode,
and the navigation patterns that make working in r2 feel less like
typing commands and more like exploring.

## Entering visual mode

From the command prompt, type `V` to enter visual mode. From visual
mode, `q` returns you to the prompt.

```text
[0x08001234]> V
```

You are now looking at disassembly with the cursor at the current seek.
The view at the top tells you what kind of view you are in:

```
[0x08001234 [xpdr]]> sym.main:
```

Press `p` to cycle through views: hex, disasm, debug, strings, decompiler,
call graph. Press `P` for the reverse direction. The view name updates
in the header.

::: tip
The most useful views are **disasm** (default), **graph** (`V` then
`V` again — small-letter then capital), and **decompiler** (toggle with
`p` until it says `pdg` or `pdd`).
:::

## Disassembly view shortcuts

Once in disasm view:

| Key       | Action                                                      |
|-----------|-------------------------------------------------------------|
| `j` / `k` | scroll down / up by one instruction                         |
| `J` / `K` | scroll by one screen                                        |
| `h` / `l` | move cursor left/right (mostly hex view)                    |
| `c`       | toggle cursor mode (a small block cursor for byte-level work) |
| `g`       | go to address (prompts)                                     |
| `s`       | step (in debugger mode)                                     |
| `S`       | step over (in debugger mode)                                |
| `n` / `N` | next / previous function                                    |
| `b`       | go back in the seek history                                 |
| `u` / `U` | seek backward / forward in history                          |
| `:`       | open a command prompt without leaving visual mode           |
| `;`       | add comment at cursor (prompts)                             |
| `d`       | define cursor: function/string/data/code (prompts)          |
| `df`      | define function at cursor                                   |
| `dr`      | rename function at cursor                                   |
| `dc`      | edit calling convention                                     |
| `f`       | add a flag at cursor (prompts)                              |
| `r`       | rename function/flag at cursor                              |
| `x`       | show xrefs to current function                              |
| `X`       | show xrefs from current address                             |
| `/`       | search                                                      |
| `?`       | help                                                        |

The `:` shortcut is the secret weapon. Anything you would type at the
main r2 prompt — `pdf`, `axt`, `Ps`, `e asm.arch=...` — works inside
visual mode by pressing `:`. So you never need to leave visual mode
just to run a one-off command.

## Graph view

Press `V V` (or `Shift-V` from the disasm view) to enter graph view.
This shows the current function as a control-flow graph with basic
blocks as nodes and edges between them.

| Key         | Graph view                                          |
|-------------|-----------------------------------------------------|
| `j k h l`   | move within a node                                  |
| `J K H L`   | move between nodes                                  |
| `t` / `f`   | follow true / false branch                          |
| `+` / `-`   | zoom in / out                                       |
| `r`         | rename function                                     |
| `R`         | re-layout the graph                                 |
| `space`     | toggle between graph and linear disasm              |
| `c`         | cursor mode (write bytes, jump to specific address) |
| `;`         | add comment                                         |
| `q`         | back to disasm view                                 |

Graph view is genuinely good. For functions of more than ~30 basic
blocks it is faster to navigate than linear disasm. Below that the
linear view shows more context per screen.

::: warning
Graph view has a per-function complexity ceiling — beyond ~500 nodes
the layout pass becomes slow. For very large functions (vendor HALs
that bury a 2000-block dispatcher in one routine), stay in linear disasm.
:::

## Panels mode

`v` (lowercase) enters **panels mode** — a tiled multi-pane view
inspired by tmux. You can have disassembly, hex, registers, stack, and
the call graph all on screen simultaneously.

| Key      | Panels mode                                  |
|----------|----------------------------------------------|
| `Tab`    | move focus between panels                    |
| `|`      | split current panel vertically               |
| `-`      | split horizontally                           |
| `X`      | close current panel                          |
| `m`      | open menu (panels can be assigned commands)  |
| `n`      | new panel (prompts for command, e.g. `pxw`)  |
| `i`      | insert a flag                                |
| `q`      | quit panels mode                             |

Panels are most useful when debugging — you can have disasm, registers,
and stack visible at once. For static analysis a single visual disasm
is often enough.

## Search

`/` in visual mode (or `/?` at the prompt for help) opens a search.

| Form         | What it searches                                    |
|--------------|-----------------------------------------------------|
| `/ hello`    | string literal                                      |
| `/x deadbeef`| hex bytes                                           |
| `/v 0x12345678` | a 4-byte little-endian value                     |
| `/V 0x...`   | range search for a value                            |
| `/c push ebp`| disassembly text match                              |
| `/r main`    | references to the symbol `main`                     |
| `/m foo`     | magic / format pattern                              |
| `/a mov`     | search by mnemonic                                  |
| `/A mov`     | search by mnemonic family                           |
| `/z 4 32`    | strings of length 4..32                             |

The `/c` form is the embedded reverse engineer's friend: search for
a specific instruction sequence to find call gates, syscall stubs,
or peripheral access patterns:

```text
[0x00]> /c ldr r0, [0x40021018]    # find every read of RCC->APB2ENR on STM32
[0x00]> /c ldr r0, =0x40004400     # find references to USART2 base
```

Results land in the flag space `searches` so you can iterate over them
with `@@= search.*`.

## The `g` (go) command

Within visual mode, press `g` and r2 prompts for an address or a flag
name. Flags autocomplete on `Tab`. This is faster than `:s addr` or
`:s flag.name`.

`gn` jumps to the next note (a comment), `gN` to the previous. Useful
when you have annotated a function with reasoning.

## The cursor and writing bytes

In visual mode, press `c` to toggle a hex-style cursor. Now `h`/`l`
move the cursor by one byte; `+` and `-` increment/decrement the byte
value at the cursor. `i` inserts; `r` replaces; `R` opens a small editor.

Anything you write is queued in r2's write cache. To commit the writes
to the underlying file (only if you opened it with `-w`), exit visual
mode and either run `wb` (write back) or quit (r2 prompts).

::: warning
You can write to a file you opened read-only — the writes go into the
in-memory cache and affect the analysis but never touch the file. This
is a feature (you can experiment with patches without risk), but it
surprises people the first time. To actually patch the file, open with
`-w`:

```text
$ r2 -w firmware.bin
```
:::

## Visual configuration

A few `e`-vars improve visual mode dramatically. Add them to
`~/.radare2rc`:

```text
e scr.utf8 = true
e scr.utf8.curvy = true       # rounded box-drawing in graph view
e scr.html = false
e scr.color = 3                # 256-colour
e scr.theme = solarized        # try a few; consolas, behelit, gentoo, ...
e asm.bytes = false            # cleaner disasm
e asm.cmt.right = true
e asm.cmt.col = 60
e asm.lines.width = 14
e asm.flags.middle = 2
e asm.var.summary = false      # full var list
e asm.refptr = true            # show what a pointer points to
e asm.hint.pos = 0             # hint markers above / below opcodes
e asm.hint.cjmp = true         # show conditional jump hints
e asm.fcnsig = true            # show function signature line
e asm.calls = true             # render call comments inline
```

`scr.theme` is worth experimenting with. Run `eco` (no arguments) at
the prompt to list all themes. `eco solarized` switches.

## Working productively in visual mode

A daily workflow that scales:

1. Load and analyse: `r2 -p projectname` or `r2 file && aaa && Ps name`
2. Open a starting function: `s sym.main && V`
3. Read with `j`/`k`, follow calls with `Enter` on the call line, return
   with `b`.
4. Annotate as you go: `;` for comments, `dr` to rename, `f` for flags.
5. Switch to graph view (`V`) on complex functions; back to linear
   (`V` again) for simple ones.
6. When you find something interesting elsewhere (an xref, a string,
   a literal pool entry), `:` to drop into the prompt, run the lookup,
   `q` back to visual.
7. Save the project (`:Ps`) every 15 minutes or so.

You will spend most of your r2 time in visual mode. Investing an hour
in muscle memory here pays back the rest of your career.

That closes Part I. You should now be able to load any binary, drive
analysis, and navigate the result. Part II covers the static analysis
toolkit you reach for once the binary is loaded.
