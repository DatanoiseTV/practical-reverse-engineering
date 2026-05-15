# Scripting with r2pipe

Everything you can do interactively in r2 you can do from a script.
The mechanism is `r2pipe`: a thin wrapper around r2's command
interface that returns command output as strings (or, with the
`j` suffix, as JSON you can parse). Bindings exist for Python,
JavaScript, Ruby, Rust, Go, Haskell, Common Lisp, OCaml, and a
half-dozen others. This chapter focuses on Python, because that is
what 90% of working r2pipe scripts are written in.

## Why script

Manual r2 scales for tens of functions. It does not scale for
firmware images with thousands. The cases where scripting pays off
quickly:

* Renaming hundreds of functions based on a pattern (string they
  reference, prologue shape, address range).
* Diffing two firmware versions function by function.
* Bulk-decompiling every function and grep'ing the C output.
* Recovering jump tables programmatically from a known table format.
* Building a peripheral access map across the whole binary.
* Producing a coverage report from dynamic traces.
* Generating documentation from a binary you understand.

A 50-line r2pipe script often replaces a day of mouse work in a GUI
disassembler.

## Installing

```text
$ pip install r2pipe
```

That is it. The package is small and pure-Python; r2 itself must be
installed separately (Chapter 2).

## A first script

```python
import r2pipe

r2 = r2pipe.open("firmware.bin", flags=["-a", "arm", "-b", "16",
                                        "-m", "0x08000000"])
r2.cmd("aaa")

# How many functions did we find?
fns = r2.cmdj("aflj")
print(f"{len(fns)} functions")

# Show the largest five.
for fn in sorted(fns, key=lambda f: -f["size"])[:5]:
    print(f"  {fn['name']:40s} {fn['size']:6d} bytes @ 0x{fn['offset']:x}")
```

The two methods you will use most:

* `r2.cmd("...")` — run a command, get output as a string.
* `r2.cmdj("...j")` — run a command with the `j` suffix, parse the
  JSON, return a Python object.

Always prefer `cmdj` when the data is structured. Parsing r2's
human-readable output by hand is brittle.

## Useful one-shot scripts

### Rename functions by referenced string

A common pattern: you find a string and want to name the function
that references it after that string.

```python
import r2pipe, re

r2 = r2pipe.open("firmware.bin")
r2.cmd("aaa")

# Find all string references via izzj
strings = r2.cmdj("izzj")
for s in strings:
    text = s.get("string", "")
    if not text or len(text) < 6:
        continue
    # Get xrefs to this string
    addr = s["vaddr"]
    refs = r2.cmdj(f"axtj @ {addr}")
    for ref in refs or []:
        fn_addr = ref.get("fcn_addr")
        if not fn_addr:
            continue
        # Build a sanitised function name from the string
        name = re.sub(r"\W+", "_", text[:32]).strip("_").lower()
        if name:
            r2.cmd(f"afn ref_{name} 0x{fn_addr:x}")

r2.cmd("Ps annotated")
```

After running, every function that references a clear string is
named after that string. The names are usually wrong (a function
that calls `printf("error: %s")` is named `ref_error_s`, not
`error_handler`), but they are vastly more useful than `fcn.080012a0`
when scrolling through `afl`.

### Bulk decompile to C

```python
import r2pipe

r2 = r2pipe.open("firmware.bin", flags=["-2"])  # -2 = no stderr
r2.cmd("aaa")

with open("firmware.c", "w") as out:
    for fn in r2.cmdj("aflj"):
        name = fn["name"]
        addr = fn["offset"]
        out.write(f"// === {name} @ 0x{addr:x} ===\n")
        out.write(r2.cmd(f"pdg @ 0x{addr:x}") or "// (decompile failed)\n")
        out.write("\n")

print(f"Wrote {sum(1 for _ in open('firmware.c'))} lines")
```

Now you have `firmware.c` containing pseudocode for every function.
Grep it like a normal source tree:

```text
$ grep -nE 'malloc|memcpy|strncpy' firmware.c
$ grep -nE 'CR1|CR2' firmware.c       # USART control register accesses
```

For 100,000-line decompiled outputs, this is the only way to find
the function you actually want.

### Diff two firmware versions

```python
import r2pipe, hashlib

def fn_signatures(path):
    r2 = r2pipe.open(path, flags=["-2"])
    r2.cmd("aaa")
    sigs = {}
    for fn in r2.cmdj("aflj"):
        # Hash the disassembly text of each function
        body = r2.cmd(f"pdf @ 0x{fn['offset']:x}")
        h = hashlib.sha256(body.encode()).hexdigest()[:16]
        sigs[fn["name"]] = (fn["offset"], fn["size"], h)
    r2.quit()
    return sigs

old = fn_signatures("v1.bin")
new = fn_signatures("v2.bin")

for name in sorted(set(old) | set(new)):
    o = old.get(name)
    n = new.get(name)
    if o and n and o[2] != n[2]:
        print(f"CHANGED {name:40s} v1=0x{o[0]:x} v2=0x{n[0]:x}")
    elif o and not n:
        print(f"REMOVED {name}")
    elif n and not o:
        print(f"ADDED   {name}")
```

A real BinDiff is more sophisticated (it handles renames, fuzzy
matches, structural similarity), but a 30-line hash-diff catches
most of what you care about for incremental firmware analysis.

### Peripheral access map

```python
import r2pipe

PERIPHERALS = {
    0x40020000: ("GPIOA", 0x400),
    0x40020400: ("GPIOB", 0x400),
    0x40021000: ("RCC",   0x400),
    0x40011000: ("USART1", 0x100),
    0x40004400: ("USART2", 0x100),
    # ... etc
}

r2 = r2pipe.open("firmware.bin")
r2.cmd("aaa")

# For each peripheral, find every xref into its register window
for base, (name, size) in PERIPHERALS.items():
    callers = set()
    for off in range(0, size, 4):
        refs = r2.cmdj(f"axtj @ 0x{base+off:x}") or []
        for ref in refs:
            if ref.get("fcn_name"):
                callers.add(ref["fcn_name"])
    if callers:
        print(f"{name} accessed by: {sorted(callers)}")
```

The output is a "who touches what hardware" map. For a firmware you
do not yet understand, this is the fastest way to find the UART
driver, the GPIO setup, the clock configuration.

## Long-running sessions

For interactive scripts where you want to keep an r2 session open
across many commands, `r2pipe.open` returns a session object you
can drive forever:

```python
r2 = r2pipe.open("firmware.bin")
r2.cmd("aaa")
# ... lots of commands ...
r2.quit()
```

`r2.quit()` closes the session cleanly. Skipping it leaks a child
process per script run, which adds up if you script a lot.

For unit-testing-style scripts where you spawn r2 many times,
consider using `r2pipe.open(..., flags=["-q0"])` to suppress noise.

## Connecting to a remote r2

You can run r2 on one machine and drive it from another:

```text
# On the analysis box
$ r2 -c =h firmware.bin     # serve r2 over HTTP
```

Then from a script:

```python
r2 = r2pipe.open("http://analysis-box:9090")
print(r2.cmd("afl"))
```

This is useful for distributed analysis (one r2 instance, many
analysts), or to keep a long-running expensive analysis hot while
you iterate on scripts that drive it.

## Driving r2 from JavaScript

If you prefer Node.js, the same package exists:

```javascript
const r2pipe = require("r2pipe");

r2pipe.open("firmware.bin", (err, r2) => {
    r2.cmd("aaa", () => {
        r2.cmdj("aflj", (err, fns) => {
            console.log(`${fns.length} functions`);
            r2.quit();
        });
    });
});
```

The Promise-based and async/await variants exist too. JavaScript is
a fine choice if you are already in a Node ecosystem.

## Scripting from inside r2

R2 itself can run scripts via `#!python`, `#!js`, and friends — `rlang`
(radare's plugin language interface). For one-off snippets:

```text
[0x...]> #!python
print(r2.cmd("afl ~ main"))
```

Scripts can be loaded with `.script.py`. This is sometimes more
convenient than spawning r2 from outside, especially when the script
is small and the overhead of opening the binary is high.

## Scripting tips

**Always set `-2` to suppress stderr** unless you are debugging.
r2's noisy progress messages corrupt your script output.

**Use `j` variants for everything structural.** Do not try to parse
`afl`'s human-readable output with regex; use `aflj`.

**Cache project state.** If your script requires `aaa` (slow) every
run, instead run it once in r2, save the project, and have the
script open with `-p`:

```python
r2 = r2pipe.open("project_name", flags=["-p"])
# project state is loaded; aaa is not needed
```

**Catch exceptions around `cmdj`.** If a command produces non-JSON
output (for instance, when the address is out of range), `cmdj`
raises. Wrap.

**For long iterations, periodically `r2.quit()` and reopen** to
release memory. R2's analysis databases grow over a long-running
session.

## A complete example: vector table -> IRQ handler names

A worked example that combines several techniques:

```python
"""
For a Cortex-M binary, read the vector table, identify each external
IRQ handler, and rename functions according to the vendor's IRQ
mapping. Vendor mapping comes from a JSON file.
"""
import r2pipe, json, sys

if len(sys.argv) != 3:
    print("usage: rename_vectors.py firmware.bin irq_map.json")
    sys.exit(1)

with open(sys.argv[2]) as f:
    irq_map = json.load(f)   # { "0": "WWDG_IRQHandler", "1": "PVD_IRQHandler", ... }

r2 = r2pipe.open(sys.argv[1], flags=["-a", "arm", "-b", "16",
                                     "-m", "0x08000000", "-2"])
r2.cmd("aaa")

# First 16 entries are SP + 15 system exceptions; external IRQs start at index 16
for idx_str, name in irq_map.items():
    idx = int(idx_str)
    vec_addr = 0x08000000 + (16 + idx) * 4
    target_word = int(r2.cmd(f"pv4 @ {vec_addr}").strip(), 16)
    target = target_word & ~1   # strip Thumb bit
    # Define a function and name it
    r2.cmd(f"af @ 0x{target:x}")
    r2.cmd(f"afn {name} 0x{target:x}")
    print(f"IRQ {idx:3d}: {name:40s} @ 0x{target:08x}")

r2.cmd("Ps with_irq_names")
print("done.")
```

Run:

```text
$ python rename_vectors.py firmware.bin stm32f407_irqs.json
IRQ   0: WWDG_IRQHandler                          @ 0x08000231
IRQ   1: PVD_IRQHandler                           @ 0x08000231
IRQ   6: EXTI0_IRQHandler                         @ 0x08000345
...
```

Now reopen with `r2 -p with_irq_names` and every IRQ handler is
named. Five minutes of scripting saves hours of manual renaming on
every STM32F4 firmware you ever look at.

The pattern — write small focused scripts, save state to projects,
compose scripts together — is the fastest way to make r2 feel like
a powerful platform rather than a command-line tool.
