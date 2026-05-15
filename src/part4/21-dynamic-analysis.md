# Dynamic Analysis: GDB, OpenOCD, J-Link, ESIL

Static analysis tells you what the firmware *can* do. Dynamic
analysis tells you what it *does*. For embedded targets, the dynamic
analysis story is built around three pieces:

* **Hardware debug** through a probe (J-Link, ST-Link, CMSIS-DAP,
  OpenOCD-supported probes) that exposes a GDB-remote interface,
  which r2 attaches to.
* **Emulation** in QEMU, Renode, or Wokwi, again exposing GDB-remote.
* **ESIL** — radare2's internal symbolic emulator — when you have
  no hardware and want to step a function in pure software.

This chapter covers all three.

## R2's debugger overview

The `d` (debug) family:

| Command  | Action                                            |
|----------|---------------------------------------------------|
| `db`     | breakpoint commands                               |
| `dc`     | continue                                          |
| `ds`     | step                                              |
| `dso`    | step over                                         |
| `dsu`    | step until address/condition                      |
| `dr`     | registers                                         |
| `dm`     | memory map                                        |
| `do`     | open another process / file for debugging         |
| `dp`     | processes / threads                               |
| `dt`     | trace                                             |
| `dx`     | execute raw bytes                                 |

Visual mode in debug shows registers and stack alongside disassembly.
`v` (panels) lets you arrange them however you like.

## Connecting to a GDB remote

OpenOCD, J-Link GDB Server, QEMU's `-s` flag, Renode, pyOCD, and
probe-rs all expose a GDB-remote stub on a TCP port. R2 connects to
any of them with `-d gdb://`:

```text
$ r2 -d gdb://localhost:3333 firmware.elf
```

Or attach inside r2:

```text
[0x...]> e dbg.backend = gdb
[0x...]> e dbg.profile = ...
[0x...]> :dc gdb://localhost:3333
```

The same command set then works against the remote target. `dr`
shows registers, `dm` shows memory regions, `db` sets breakpoints,
`dc` continues, `ds` steps.

::: warning
Some GDB stubs do not implement every part of the protocol. If a
breakpoint type fails to set, it is usually because the stub does
not implement hardware breakpoints (or has none free) or does not
support write watchpoints. Check the stub's documentation.
:::

## OpenOCD

OpenOCD is the most flexible debug-probe driver. It speaks to
JTAG/SWD probes (FT232H, FT2232, J-Link, ST-Link, CMSIS-DAP, Black
Magic Probe, ULINK, …) and exposes a GDB stub.

Typical session:

```text
# Terminal 1
$ openocd -f interface/cmsis-dap.cfg -f target/stm32f4x.cfg
... 
Info : Listening on port 3333 for gdb connections

# Terminal 2
$ r2 -d gdb://localhost:3333 firmware.elf
[0x...]> :dc
... runs ...
[Ctrl+C in r2]
[0x...]> :dr pc
0x080001fa
[0x...]> :db 0x080012a0      # set breakpoint
[0x...]> :dc                 # continue, hits breakpoint
```

For chips OpenOCD does not support out of the box, you can write a
config file that combines a generic interface with a custom target
description. The OpenOCD source tree under `src/target/` has
hundreds of examples.

## J-Link GDB Server

SEGGER's J-Link probes come with `JLinkGDBServer` — a vendor GDB
stub that supports more chips than OpenOCD and is rock-solid for
ARM. Same usage pattern:

```text
$ JLinkGDBServerCL -if SWD -device STM32F407ZG -port 3333
$ r2 -d gdb://localhost:3333 firmware.elf
```

The SEGGER stub supports unlimited software breakpoints in flash via
its own RAM-based monitor — useful when the chip has only 4–8
hardware breakpoints and you want to set 30.

## QEMU

QEMU emulates many embedded targets: ARM (system), AArch64,
MIPS, RISC-V, Xtensa, x86, PowerPC. Run a kernel:

```text
$ qemu-system-arm -M virt -nographic -kernel zImage -dtb board.dtb \
    -append 'console=ttyAMA0' -gdb tcp::1234 -S
```

`-S` halts the CPU at start; `-gdb tcp::1234` exposes a GDB stub.
Connect:

```text
$ r2 -d gdb://localhost:1234 vmlinux
[0x...]> :dc
```

For bare-metal ARM (Cortex-M):

```text
$ qemu-system-arm -M netduinoplus2 -kernel firmware.elf -gdb tcp::1234 -S
```

QEMU's Cortex-M support is not perfect — some peripherals are
modelled, others are not. For peripherals that are not modelled,
reads return zero and writes are dropped. The disassembly executes,
but behaviour diverges from real hardware. This is fine for following
control flow; it is wrong for testing peripheral interactions.

## Renode

Renode is a more sophisticated embedded-systems emulator from
Antmicro. It models RTOS interactions, multiple cores,
interconnects, and a wider range of peripherals. Setup is more
involved than QEMU but the fidelity is higher. Same GDB-remote story
once running.

## Wokwi

Wokwi runs ESP32, Arduino, Raspberry Pi Pico, and STM32 firmware in
the browser, with virtual sensors and displays. It exposes GDB-remote
via a CLI tool. For ESP32 reverse engineering without hardware, it
is surprisingly capable.

## Breakpoints, watchpoints, stepping

```text
[0x...]> :db 0x08001234         # software breakpoint
[0x...]> :dbh 0x08001234        # hardware breakpoint (limited supply)
[0x...]> :dbw 0x20000040 4 rw   # watchpoint on 4 bytes, read+write
[0x...]> :db                    # list
[0x...]> :db- 0x08001234        # delete one
[0x...]> :db-*                  # delete all

[0x...]> :ds                    # step one instruction
[0x...]> :dso                   # step over
[0x...]> :dsu sym.HAL_GPIO_Init # step until
[0x...]> :dc                    # continue
```

Watchpoints are the most powerful tool for understanding peripheral
interaction. Set a watchpoint on the data register of a UART, run,
and every time the firmware writes a byte to the UART, the debugger
breaks with the call stack showing exactly where the byte came from.

## Inspecting state

```text
[0x...]> :dr            # all registers
[0x...]> :dr r0         # one register
[0x...]> :dr=           # registers and their values aligned
[0x...]> :dr r0=0x100   # set register
[0x...]> :pxw 32 @ sp   # 32 bytes of words at the stack pointer
[0x...]> :pxw 32 @ 0x20000000  # SRAM
```

Register-relative seeking works the same way as before:

```text
[0x...]> :pdf @ pc
[0x...]> :pxw 16 @ r0
```

## Tracing

`dt` traces execution. Useful when you want to record what happens
between two breakpoints rather than step interactively:

```text
[0x...]> :dts+ on             # start tracing
[0x...]> :dc                  # run
[0x...]> :dts+ off            # stop
[0x...]> :dts                 # list traced instructions
```

Each traced address gets a flag in the `traces` flag space, so you
can later iterate over them with `@@= trace.*`.

## ESIL: emulation without hardware

ESIL (Evaluable Strings Intermediate Language) is r2's tiny stack-
based language for representing every instruction. The ESIL VM
executes ESIL strings; r2 emulates the whole instruction set by
translating instructions to ESIL on demand.

Why use ESIL:

* You have no hardware (the chip is unobtainable, expensive, or
  destroyed).
* You want to recover constant arguments to a function from a
  caller that computes them.
* You want to follow control flow through a deobfuscation routine
  without ever running the binary.
* You want to fuzz a single function in isolation.

Setup:

```text
[0x...]> aei                 # init ESIL VM
[0x...]> aeim                # init memory (creates a stack at SP)
[0x...]> aeip                # set ESIL pc to current seek
[0x...]> aer                 # ESIL register state
```

Step:

```text
[0x...]> aes                 # one ESIL step
[0x...]> aeso                # step over (skips into calls)
[0x...]> aesu sym.target     # step until address
[0x...]> aess N              # N steps
```

Inspect:

```text
[0x...]> aer r0              # value of r0 in ESIL VM
[0x...]> aer                 # all
[0x...]> aex `aer pc`        # disassembly of current ESIL pc
```

Set state:

```text
[0x...]> aer r0=0x12345678   # set
[0x...]> wx 11 22 33 44 @ 0x20000000   # write memory
```

Analyse functions with ESIL:

```text
[0x...]> aae                 # analyse all by ESIL emulation
[0x...]> aef                 # ESIL-emulate the current function
```

`aae` is part of `aaaa`. It improves call-graph and xref recovery in
binaries with computed jumps and indirect calls — ESIL can sometimes
resolve a `bx r0` if it can determine the value of r0 statically.

## A worked example: recovering an indirect call target

Suppose you see:

```text
0x08001234  ldr r3, [pc, #0x10]   ; load function ptr table base
0x08001236  ldrb r0, [...]        ; load index
0x08001238  ldr r3, [r3, r0, lsl 2]
0x0800123a  blx r3                ; what does this call?
```

Static analysis can't resolve the target (the index varies). With
ESIL:

```text
[0x...]> aei
[0x...]> aeim
[0x...]> aeip
[0x...]> aer r0=0           # try index 0
[0x...]> aesu 0x0800123a    # step until the blx
[0x...]> aer r3             # the resolved function pointer
0x080020a0
[0x...]> ax 0x0800123a 0x080020a0    # add manual xref

[0x...]> aer r0=1           # try index 1
[0x...]> aeip
[0x...]> aesu 0x0800123a
[0x...]> aer r3
0x080020c4
[0x...]> ax 0x0800123a 0x080020c4
```

A short Python r2pipe loop (Chapter 23) iterates through every
plausible index and adds xrefs for each. The decompiler then sees
all the call destinations.

## Memory and peripherals during emulation

ESIL's default memory is sparse — reads from unmapped addresses
return zero, writes are buffered. For peripherals, this is wrong:
real hardware has side effects. You can:

* Map a region and pre-fill it: `wx ff... @ 0x40021000`.
* Mock peripheral behaviour with ESIL hooks (`aeh` family). For
  example, every read from `0x40004404` returns 0x80 (UART TX
  ready):

```text
[0x...]> aeh r 0x40004404 0x80
```

* For complex peripherals, scripting with r2pipe is more practical.

## Limitations of ESIL

ESIL covers the common subset of every supported architecture. It
misses:

* Floating-point (limited support; many FP instructions are not
  modelled).
* Vector/SIMD instructions (mostly absent).
* System-level instructions (MSR, CSR writes, cache operations).
* Some architecture-specific oddities (Thumb-2 IT blocks behave
  correctly only with recent r2; Xtensa windowed register slides
  are partially modelled).

For floating-point or vector-heavy code, ESIL is not the right
tool. Use Unicorn (Chapter 24) or hardware emulation.

## Putting it together

A common workflow:

1. Statically reverse engineer the firmware to the point where
   you understand the major functions and want to verify a
   hypothesis.
2. Set up hardware debug via OpenOCD / J-Link, or QEMU/Renode if
   no hardware available.
3. Set breakpoints at the functions you want to observe.
4. Run, hit breakpoints, inspect state, step.
5. For functions where stepping is too slow or hardware is
   unavailable, fall back to ESIL.

Dynamic analysis closes the loop on static analysis. The combination
— "I think this function does X, let me set a breakpoint and confirm"
— is much faster than either alone.
