# Appendix A: Command Cheatsheet

Commands grouped by task. Most have variants (`j` for JSON, `q` for
quiet, `*` for replayable form); see the relevant chapter.

## Loading

```text
r2 file                               # ELF/Mach-O/PE: just open it
r2 -a arm -b 16 -m 0x08000000 file    # raw blob
r2 -a mips -b 32 -e cfg.bigendian=true -m 0x80000000 file
r2 -p projectname                     # reopen saved project
r2 -i load.r2 -                       # run script then enter prompt
r2 -d gdb://host:port [file]          # attach to GDB remote
r2 -w file                            # open writable
o file 0xADDR                         # add additional mapping
o                                     # list open files / mappings
o-N                                   # close mapping N
oo+                                   # reopen current file rw
i                                     # binary info
iI                                    # detailed info
iS                                    # sections
iSS                                   # segments (program headers)
iE                                    # exports
ii                                    # imports
is                                    # symbols
iL                                    # libraries
iz                                    # strings in data sections
izz                                   # strings everywhere in file
izzz                                  # strings of any encoding
```

## Analysis

```text
aaa                                   # standard analysis
aaaa                                  # + experimental passes
aaaaa                                 # everything (slow)
af @ addr                             # define function
af-                                   # delete function
afn name                              # rename function
afr @ addr                            # analyse + recurse into callees
afi                                   # function info
afl                                   # list functions
aflj                                  # list functions as JSON
aflq                                  # list functions, quiet
aflc                                  # list with call counts
aar                                   # analyse references
aac                                   # analyse calls
aap                                   # find functions by prelude
aae                                   # analyse via ESIL
afta                                  # propagate types
afv                                   # list local variables
afvn newname oldname                  # rename variable
afvt name "type"                      # type a variable
afs sig                               # set function signature
afS sig                               # set signature (alt syntax)
afc cc                                # set calling convention
afcl                                  # list calling conventions
```

## Navigation

```text
s addr                                # seek
s+                                    # seek forward
s-                                    # seek back
sf                                    # seek to next function
sb                                    # seek to previous block
b N                                   # set block size to N bytes
?v expression                         # evaluate expression value
?  expression                         # evaluate, multiple bases
$$                                    # current seek
$F                                    # current function start
$FE                                   # current function end
@ addr                                # temporary seek (per-command)
@@= a b c                             # iterate over explicit list
@@ glob                               # iterate over flags matching glob
@@i                                   # iterate over imports
@@f                                   # iterate over functions
@@@F                                  # iterate scope: every function
@@@s                                  # every string
@@@i                                  # every import
@@@?                                  # list scope iterators
```

## Disassembly and printing

```text
pd N                                  # N instructions
pd N @ addr                           # N instructions at addr
pdf @ addr                            # disassembly of a function
pdb                                   # disassembly of basic block
pdr                                   # recursive disassembly
pdj                                   # disassembly as JSON
pds                                   # disassembly summary
pdg @ addr                            # decompiled C (r2ghidra)
pdd @ addr                            # decompiled (r2dec)
pdgs                                  # decompile + asm side-by-side
px N                                  # N bytes of hex
pxw N                                 # N bytes as 32-bit words
pxq N                                 # N bytes as 64-bit words
pxr                                   # words + ref resolution
ps                                    # string at cursor
psz                                   # zero-terminated string
psw                                   # wide string (UTF-16)
psp                                   # Pascal string
```

## Cross-references

```text
ax                                    # all xrefs
axt @ addr                            # who points here?
axf @ addr                            # what does here point to?
axg @ addr                            # graph
ax addr1 addr2                        # add xref
ax-                                   # delete xref
aex addr                              # ESIL-trace xrefs
```

## Strings, comments, flags

```text
f                                     # list flags
f name = addr                         # add flag
f-name                                # delete flag
fr oldname newname                    # rename flag
fs space                              # switch flag space
fs                                    # list flag spaces
CC "comment" @ addr                   # add comment
CC- @ addr                            # delete comment
CCa addr,comment                      # alt form
Cd N @ addr                           # mark N bytes as data
Cs N @ addr                           # mark as string
Cf "type" @ addr                      # mark as struct
```

## Types

```text
t                                     # list types
to file                               # parse C header file
tos "C source"                        # parse inline C
tc                                    # print all types as C
tc name                               # one type as C
tp typename @ addr                    # print as struct at addr
tl typename = addr                    # link a type to an address
tk type=name                          # set raw SDB key
te                                    # enum operations
tu                                    # union operations
ts                                    # struct operations
```

## Hints

```text
ah                                    # list hints
ah-                                   # delete a hint
ah-*                                  # delete all hints
ahb 16 @ addr                         # bits at address (Thumb)
ahb 32 @ addr                         # bits at address (ARM)
aha mov @ addr                        # force decode as mnemonic
aho ret @ addr                        # set instruction type
ahi h @ addr                          # display immediate as hex
ahi 10 @ addr                         # as decimal
ahi b @ addr                          # as binary
ahd "label" @ addr                    # custom label for address
ahS .text @ addr                      # syntax variant
ahf @ addr                            # this is a function
ahc addr @ caller                     # call destination override
```

## Search

```text
/ string                              # search for string
/x deadbeef                           # search for hex bytes
/v 0x12345678                         # search for 4-byte value
/V begin end                          # search for value range
/c push                               # search disassembly text
/a mov                                # search by mnemonic
/A mov                                # by mnemonic family
/m magic                              # magic / format pattern
/r main                               # references to symbol
/z 4 32                               # strings length 4..32
e search.in = io.maps                 # restrict search
```

## Configuration (e-vars)

```text
e var                                 # show value
e var = value                         # set
e var?                                # help
e foo.~                               # list matching "foo."
e?                                    # all configuration help
ec scheme                             # color scheme
eco                                   # list color schemes
e scr.color = 3                       # 256-color
e asm.bytes = false                   # hide bytes column
e asm.cmt.right = true                # comments to the right
e asm.cmt.col = 60                    # comment column
e anal.depth = 64                     # call recursion depth
e anal.cc = arm32                     # default calling convention
e cfg.bigendian = true                # endianness
```

## Visual mode

```text
V                                     # enter visual disasm
v                                     # enter panels mode
VV                                    # graph view (or V V)
:                                     # command prompt while visual
;                                     # add comment
d                                     # define cursor (function/string/data)
df                                    # define function
dr                                    # rename function
dc                                    # edit calling convention
f                                     # add a flag
g                                     # go to address
n / N                                 # next / previous function
b                                     # back in seek history
x                                     # xrefs to current function
X                                     # xrefs from current address
/ ?                                   # search / help
p / P                                 # cycle views forward/back
q                                     # quit visual
```

## Debugging

```text
ds                                    # step
dso                                   # step over
dsu addr                              # step until
dc                                    # continue
dr                                    # registers
dr name                               # one register
dr name=value                         # set register
dm                                    # memory map
db addr                               # software breakpoint
dbh addr                              # hardware breakpoint
dbw addr N rw                         # watchpoint (size N, mode rw)
db                                    # list breakpoints
db- addr                              # delete one
db-*                                  # delete all
dts+ on / off                         # tracing start/stop
dx hex                                # execute raw bytes
```

## ESIL emulation

```text
aei                                   # init ESIL VM
aeim                                  # init memory
aeip                                  # set ESIL PC
aer                                   # ESIL registers
aer name                              # one register
aer name=value                        # set
aes                                   # one step
aeso                                  # step over
aess N                                # N steps
aesu addr                             # step until
aef                                   # emulate current function
aeh r addr value                      # hook reads
```

## Patching

```text
oo+                                   # writable session
wx hex                                # write hex bytes
w str                                 # write string
wz str                                # write null-terminated string
wa "asm"                              # assemble & write
waf file                              # assemble & write from file
wo* args                              # ops (xor, and, or, add, sub)
wb byte                               # repeat byte over range
wn N value                            # write N-byte int
wv value                              # write 32-bit
wf path                               # write file at cursor
wt path N                             # write N bytes from cursor to file
wB val                                # bit operations
wc                                    # write cache list
wcr                                   # revert all cached writes
wB                                    # commit cache to file
```

## Projects

```text
P                                     # project commands
Ps name                               # save project
Po name                               # open project
P+                                    # save with current name
P-                                    # delete project
P*                                    # export project as r2 commands
Pn                                    # project notes
```

## Zignatures (FLIRT-like)

```text
z                                     # list loaded zigs
z. @ addr                             # zigs matching current function
zb                                    # best matches
zg                                    # generate for current function
zg @@f                                # generate for every function
zo file.sdb                           # save / load
z/                                    # search and apply matches
zs                                    # list spaces
e zign.threshold = 0.9                # match threshold
e zign.minsz = 0x20                   # minimum function size
```

## Help

```text
?                                     # top-level help
<cmd>?                                # subcommand help (any level)
?*~kw                                 # search command tree for keyword
?V                                    # version info
?t cmd                                # command timing
```

## Shell

```text
!cmd                                  # run shell command
!!cmd                                 # passthrough exec (no stdin/stdout intercept)
.cmd                                  # interpret command output as r2 cmds
.!cmd                                 # interpret shell output as r2 cmds
.script.r2                            # run r2 script
.script.py                            # run Python script via rlang
| cmd                                 # pipe r2 output to shell
> file                                # redirect r2 output to file
~ pattern                             # internal grep
~!pattern                             # negate grep
~ pattern[N]                          # column N of matching lines
```

## Quitting

```text
q                                     # quit
qq                                    # quit without saving
q!                                    # quit, even if dirty
```
