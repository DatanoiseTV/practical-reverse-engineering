# Installing radare2 and the Ecosystem

This chapter gets you to a working installation that includes the things
the rest of the book assumes you have: radare2 itself, the package manager
`r2pm`, the two decompilers (`r2ghidra` and `r2dec`), and a handful of
plugins that come up in the architecture chapters.

## Installing radare2

Radare2 changes fast — the master branch typically has features and bug
fixes that are months ahead of distribution packages. For serious work,
**build from git**. It is a five-minute install on any Unix.

```text
$ git clone https://github.com/radareorg/radare2
$ cd radare2
$ sys/install.sh
```

`sys/install.sh` builds with the project's own bootstrap script (`acr`),
installs to `/usr/local`, and avoids most of the autotools traps. On
macOS it works under Homebrew's prefix or system prefix; on Linux it
needs `gcc`, `make`, `pkg-config`, and `git`. No other dependencies are
required for the core.

To upgrade, pull and run `sys/install.sh` again. The script handles
incremental rebuilds.

::: tip
Use `sys/user.sh` instead of `sys/install.sh` if you do not want to
install to a system prefix. It puts r2 under `~/.local`. Add
`~/.local/bin` to `PATH` and you are done — no `sudo` involved.
:::

Verify the install:

```text
$ r2 -v
radare2 5.9.8 0 @ darwin-arm-64 git.5.9.8-12-g...
```

If you do prefer your distribution's package, `apt install radare2`,
`brew install radare2`, `pacman -S radare2`, and friends all work. They
will be one or two minor versions behind. For everything in this book
that is fine; for chasing a specific bug fix it is not.

## The r2pm package manager

`r2pm` is radare2's plugin and tool manager. It builds plugins from
source against your installed r2, drops them in the right place, and
keeps them in sync as you upgrade.

Initialise the database:

```text
$ r2pm -U
```

`-U` updates the package index. You will need to run it occasionally to
pick up new plugins.

List installed packages:

```text
$ r2pm -l
```

Search:

```text
$ r2pm -s ghidra
```

Install:

```text
$ r2pm -ci r2ghidra
$ r2pm -ci r2dec
```

The `-c` flag tells r2pm to clean the build directory before building.
Use it if a previous build is stale.

Uninstall:

```text
$ r2pm -u r2dec
```

## Installing the decompilers

Two decompilers cover most of the work in this book.

**r2ghidra** is a port of Ghidra's decompiler engine that runs entirely
inside r2. The decompiler binary is C++; r2ghidra wraps it as a native
r2 plugin. Output quality matches standalone Ghidra for the vast majority
of functions. It is the decompiler you will use 90% of the time.

```text
$ r2pm -ci r2ghidra
```

The first build takes a few minutes. After it finishes, the `pdg` command
inside r2 produces decompiled C output for the function under the cursor.

**r2dec** is a JavaScript-based decompiler that ships as a duktape script.
It is much faster to start up than r2ghidra (no C++ engine to load) and
produces shorter, less precise output. It is good for "what does this
function look like, roughly" before you commit to running r2ghidra. It
is also useful in scripts where you want decompilation as a string and
do not want the r2ghidra startup cost.

```text
$ r2pm -ci r2dec
```

The r2dec command is `pdd`.

::: note
If both are installed, `pdg` invokes r2ghidra and `pdd` invokes r2dec.
You can have both installed simultaneously — they do not conflict.
:::

## Architecture-specific plugins

Most architectures the book covers are built into core r2. Two are
worth installing as plugins because they are commonly missing or
under-supported by default builds.

**Xtensa via the V850/Xtensa plugin set.** Modern r2 (5.x) ships with
Xtensa support that handles ESP32 (LX6) and ESP32-S2/S3 (LX7) including
windowed register decoding. Confirm with `e asm.arch=?`:

```text
[0x00000000]> e asm.arch=?
arc arm avr ...
... xtensa ...
```

If `xtensa` is missing, you have an unusually stripped build; rebuild from
git source.

**8051.** First-class. Listed as `8051` in `asm.arch`.

**ESP image format.** Add support for `.bin` ESP firmware images:

```text
$ r2pm -ci esilsolve  # not strictly an arch plugin but useful for ESIL work
```

For loading raw ESP images, you typically use `esptool.py` to extract the
sections first, then load them with `r2 -m`. Chapter 14 covers this.

## Configuration

Radare2 reads `~/.radare2rc` (Linux/macOS) or `%APPDATA%/radare2/radare2rc`
(Windows) on startup. A reasonable starter config:

```text
# ~/.radare2rc
e scr.utf8=true              # use UTF-8 box-drawing in graphs
e scr.color=3                # 256-colour output
e asm.cmt.right=true         # comments on the right of disassembly
e asm.cmt.col=60             # comment column
e asm.bytes=false            # hide raw bytes (cleaner output)
e asm.lines.width=14         # width of branch arrows
e asm.flags.middle=2         # show flags inline at function entry
e dbg.bep=loader             # break at loader entry, not main
e search.in=raw              # /-search the whole file by default
e cfg.fortunes=false         # disable startup fortune cookie
```

Per-project settings go in `~/.config/radare2/projects/<project>/rc`.
Both files are sourced; per-project wins.

## Sanity check

Open a binary you have lying around — anything: an ELF, a Mach-O, an
old firmware blob — and verify the basics:

```text
$ r2 /bin/ls
[0x100003a40]> aaa
[0x100003a40]> afl | head
0x100003a40    1 21           sym.entry
0x100003a55   13 1057 -> 1029 entry0
...
[0x100003a40]> pdf @ entry0 | head -20
```

If you see disassembly, you are done. If `pdf` produces nothing, you have
a binary radare2 cannot analyse and that is a separate adventure (Chapter 14).

## Optional: Iaito or Cutter for a GUI

The book is written around the command-line UI because that is what scales
to scripting and remote debugging. If you want a graphical front-end for
some of the work, install **Iaito** (the radare2 project's official Qt
front-end) or **Cutter** (a community fork that has diverged somewhat).
Both wrap r2 underneath, so commands you learn here work in their console
panel.

```text
$ r2pm -ci iaito
```

Cutter is distributed as an AppImage on Linux and as a notarised .app
on macOS — see its GitHub releases page.

::: warning
Cutter and Iaito periodically diverge from r2's command set. If a command
in this book does not work in their console panel, run it in plain `r2`
first to confirm it works, then file a bug against the GUI.
:::
