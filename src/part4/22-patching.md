# Patching, Writing Back, and Re-Flashing

Sometimes the goal is not to understand the firmware but to *change*
it. Bypass a license check, fix a vendor bug the manufacturer will
not address, enable hidden features, instrument the binary for
debugging, or write a research patch that proves a vulnerability is
exploitable. This chapter covers radare2's patching workflow, the
constraints that embedded targets impose, and how to write back to
the underlying file safely.

## Opening a binary for writing

By default r2 opens files read-only. Patches you make exist in r2's
write cache and never touch disk. To enable real writes:

```text
$ r2 -w firmware.bin
```

Or in-session:

```text
[0x...]> oo+                 # reopen current file in read-write mode
```

Confirm:

```text
[0x...]> i ~ rdwr
```

`io.cache = true` is on by default; writes go to a cache layer first
and are committed when you exit (or call `wB` to write the cache
back to the file). You can keep writes in the cache indefinitely and
discard with `o-` if a patch turns out wrong.

## The write commands

| Command     | Action                                                |
|-------------|-------------------------------------------------------|
| `w str`     | write a string                                        |
| `wz str`    | write a zero-terminated string                        |
| `wx hex`    | write hex bytes (e.g., `wx 90909090`)                 |
| `wa <asm>`  | write assembled instruction                           |
| `waf file`  | write assembled instructions from a file              |
| `wo*`       | write with operations (xor, and, or, add, sub, …)     |
| `wb byte`   | write a byte pattern over a range                     |
| `wf path`   | write contents of a file at the cursor                |
| `wF path`   | hex-decode a file and write the bytes                 |
| `wn N val`  | write a value as N-byte int                           |
| `wv val`    | write a 32-bit value                                  |
| `wt path N` | write N bytes from the cursor to a file               |
| `wp script` | write a patch (in hex format) from a file             |
| `wB val`    | bit-write (set/clear bits)                            |

The two you use most often: `wx` for known byte sequences and `wa`
for "assemble this instruction and write it".

## Assembling instructions

`wa` invokes the architecture's assembler. The syntax matches what
the disassembler shows:

```text
[0x08001234]> wa nop                # write a NOP at current address
[0x08001234]> wa "mov r0, #0"       # equivalent of "return 0;"
[0x08001234]> wa "bx lr"            # return
[0x08001234]> wa "b 0x08001260"     # unconditional branch
[0x08001234]> wa "bl 0x08005000"    # call
```

For multi-instruction patches, write them in sequence — `wa` advances
the cursor by the size of the assembled instruction:

```text
[0x08001234]> wa "mov r0, #1"
[0x08001236]> wa "bx lr"            # cursor moved automatically
```

Or use `waf` with a file:

```text
$ cat patch.s
mov r0, #1
bx lr
$ # in r2:
[0x08001234]> waf patch.s
```

## Patches in practice

The most common patches:

**Bypass a check.** A function that returns `0` for "valid" and `1`
for "invalid" — patch the function to always return 0:

```text
[0x...]> wa "mov r0, #0"
[0x...]> wa "bx lr"
```

Two instructions on Thumb (4 bytes). If the original function is
longer, the rest is now dead code; that is fine on flash.

**NOP a specific instruction.** Perhaps a delay or a sleep you want
to skip:

```text
[0x08001234]> pdf @ sym.foo
0x08001234  push {r7, lr}
0x08001236  bl sym.HAL_Delay         <-- nop this
0x0800123a  ...
[0x08001234]> wa nop @ 0x08001236
[0x08001234]> wa nop @ 0x08001238    # bl is 4 bytes on Thumb-2; need 2 nops
```

**Inline a constant change.** Replace a magic constant the firmware
checks against:

```text
[0x...]> /v 0xDEADBEEF              # find every 32-bit reference
[0x...]> wv 0xCAFEBABE @ <addr>     # patch it
```

**Insert a debug write.** On a chip with a working UART you have
identified, insert a `bl puts` call into a function entry to log
when it runs. This is invasive — you have to find a hole big enough
or relocate code.

## Branching to extra code

The hard case: you want to add code that doesn't fit in the existing
function's space. Approaches in order of preference:

**Find unused space.** Many firmware images have padding regions —
the linker rounds section sizes up to alignment, leaving holes.
Look for stretches of `0xFF` bytes (erased flash) or `0x00`. If you
find a 64-byte hole, use it:

```text
[0x...]> wa "<your code>" @ 0x0800ff00     # write your code in the hole
[0x...]> wa "bl 0x0800ff00" @ <call site>  # patch the original to call it
```

Make sure your inserted code preserves all callee-saved registers
and returns to the caller correctly.

**Repurpose a never-called function.** Some firmware contains
default handlers, debug code, or unused HAL functions you can
overwrite. Verify it is never called (`axt @ sym.target` returns
nothing) and rewrite.

**Steal padding inside the patched function.** Sometimes the
function you are patching has alignment padding (NOPs, `0xFF` bytes)
between sub-blocks. You can use that padding for short additions.

::: warning
Branching to extra code requires the right encoding for the
architecture's branch range. ARM Thumb's `BL` reaches ±16 MiB; ARM
Thumb-2 `B.W` reaches ±16 MiB; Cortex-M `LDR.W PC, [PC, #imm]` reaches
arbitrary 32-bit addresses via a literal pool. Pick the right
instruction for the distance you need.
:::

## Embedded constraints on patching

**Flash erase granularity.** You cannot rewrite a single byte of
flash in place — you must erase a whole sector (1–256 KiB,
chip-dependent) and rewrite it. The patched binary you flash back
contains the entire sector, not just your changed bytes.

**Bit semantics.** Flash erases to all-`1`s; programming sets bits
to `0`. You can change a `1` to a `0` without erasing, but not the
reverse. So a "minimal" patch that only flips bits in the same
direction as erase-state changes is sometimes possible without a
full re-flash.

**ECC and parity.** Some chips compute ECC bits per word. A minimal
in-place bit-flip patch can violate ECC. Double-check the chip's
flash spec.

**Signature / integrity check.** If the bootloader verifies the
application image at boot, your patched image fails verification.
You either bypass the check (patch the bootloader too) or compute
the right signature (need the private key — usually impossible).

**Vendor-locked write protect.** Some chips have read-out and
write-protect bits in OTP. Once enabled they cannot be disabled.
Test patches on a sacrificial unit first.

## Writing back to disk

After patching in r2, the changes are in the write cache. To commit:

```text
[0x...]> wcl                # list cached writes
[0x...]> wcr                # revert all cached writes
[0x...]> wB                 # commit cache to the file
[0x...]> q                  # quit (also commits if -w was set)
```

Verify externally:

```text
$ md5sum firmware.bin firmware.bin.bak     # before and after
$ cmp -l firmware.bin firmware.bin.bak | head -10   # which bytes differ
```

For a flashable image, the patched `firmware.bin` is what you flash:

```text
$ st-flash --reset write firmware.bin 0x08000000      # STM32 ST-Link
$ esptool.py write_flash 0x10000 firmware.bin         # ESP32
$ JLinkExe -if SWD -device STM32F407 -speed 4000 -CommanderScript flash.jlink
```

For a router squashfs image you patched: rebuild the squashfs, repack
into the OEM container (which usually means a CRC over the new
content + a vendor-specific header), and flash via the OEM update
mechanism.

## Verifying the patch on hardware

Before considering a patch shipped:

1. Diff the binary against the original to confirm only the intended
   bytes changed:

```text
$ cmp -l firmware.bin firmware.orig.bin
```

2. Disassemble the patched region and confirm it reads correctly:

```text
$ r2 firmware.bin
[0x...]> pdf @ <patched function>
```

3. Test on hardware. Test the modified path (does the bypass actually
   trigger?) and test adjacent paths (did the patch break anything
   else?).

::: warning
"My patch works in the disassembler" is not "my patch works on
hardware". The cache, the FPB (Flash Patch and Breakpoint unit on
Cortex-M), the MPU, the bootloader, the integrity check, and the
data cache can each silently invalidate a patched image. Always
verify on real silicon for production patches.
:::

## Patches as scripts

For repeatable patches, save the commands as an r2 script:

```text
# patch_v1.r2
oo+                                          # writable
wa "mov r0, #0" @ 0x08001234                 # bypass check
wa "bx lr" @ 0x08001236
wv 0xCAFEBABE @ 0x08010000                   # change magic
wcr                                          # actually no, revert (test)
```

Apply:

```text
$ r2 -i patch_v1.r2 firmware.bin
```

Commit the script to git. Diff between firmware versions is then
a script diff, and your patches travel with the project.

## When patches are unsuitable

Some problems should be solved by replacing the whole firmware, not
by patching it:

* Adding a feature larger than your padding budget.
* Changing the linker layout (sections move around).
* Targeting an actively-developed firmware that gets updated
  regularly (each update breaks your patches).

For research, patches are often the right answer. For production,
think hard before shipping a patched binary instead of a rebuilt
one — the maintenance debt of patches accumulates fast.
