# Linux Userland: Stripped Binaries, Daemons, Packers, Malware

The previous chapters in Part IV worked with bare-metal flash images,
hardware debug probes, and silicon-level concerns. This chapter steps
up to Linux userland — ELF binaries you reverse engineer in a
filesystem rather than from a flash dump. Most of the same tools and
patterns apply (radare2 works the same way on a Linux ELF as on a
Cortex-A bare-metal blob), but Linux brings its own complications: a
much richer runtime, dynamic linking, position-independent code,
packers, anti-debug techniques, and the entire ecosystem of Linux
malware. This chapter covers what changes when the target runs under
an OS kernel.

## What's different about Linux userland

Compared to bare-metal firmware:

* **Real symbols, often.** Even stripped binaries keep their dynamic
  symbol table (needed for runtime linking). PLT/GOT structure is
  predictable. Library functions called via `libc.so.6` are named in
  the import table.
* **Position-independent code.** PIE is the default on modern
  distributions. The load address is randomised at startup; literal
  references go through PC-relative addressing modes (`adrp` on
  AArch64, `lea ... [rip+...]` on x86_64).
* **A standard runtime.** glibc, musl, bionic. Each has its own
  internal structure but all expose a recognisable API surface
  (`__libc_start_main`, `_dl_runtime_resolve`, etc.). Build a
  signature DB per libc variant once and you save hours per binary.
* **A loader.** `ld-linux.so` or `ld-musl.so` does the runtime
  linking. Functions imported lazily appear "unresolved" until the
  first call.
* **System calls instead of MMIO.** Hardware access is mediated by
  the kernel: `open("/dev/...")`, `ioctl`, `mmap` of device files,
  netlink sockets. Reverse engineering the wire protocol with the
  kernel is often as interesting as the userland code itself.
* **Inter-process communication.** Pipes, sockets, shared memory,
  D-Bus, UNIX domain sockets. A Linux daemon often makes more sense
  in the context of its peer processes than in isolation.
* **A real filesystem.** Configuration files, log files, persistent
  state in `/var`, often clues to behaviour in `/etc`.

## Triaging a Linux binary

Before you load anything, run the standard triage:

```text
$ file ./mystery_daemon
ELF 64-bit LSB executable, ARM aarch64, version 1 (SYSV),
  dynamically linked, interpreter /lib/ld-linux-aarch64.so.1,
  for GNU/Linux 3.7.0, stripped

$ ldd ./mystery_daemon
        linux-vdso.so.1
        libssl.so.3 => /lib/aarch64-linux-gnu/libssl.so.3
        libcrypto.so.3 => /lib/aarch64-linux-gnu/libcrypto.so.3
        libpthread.so.0 => /lib/aarch64-linux-gnu/libpthread.so.0
        libc.so.6 => /lib/aarch64-linux-gnu/libc.so.6

$ readelf -d ./mystery_daemon | head -20
$ readelf -p .comment ./mystery_daemon    # toolchain hint
$ readelf -n ./mystery_daemon             # notes (incl. build-id)
```

That alone tells you:

* Architecture and bit-width.
* Whether it links to libssl/libcrypto (likely uses TLS for something).
* Whether it links to libpthread (probably multi-threaded).
* Which libc it expects.
* The compiler from `.comment` (`GCC: (Ubuntu 12.2...)` or similar).
* The build-id — query against debuginfod servers for free debug
  info (covered below).

## Bringing back symbols from debuginfod

Modern Linux distributions publish debug info for their packages on
public **debuginfod** servers. Even a fully stripped vendor binary may
have its source on disk in plain sight.

```text
$ debuginfod-find debuginfo /usr/bin/some_binary
$ debuginfod-find source /usr/bin/some_binary src/main.c
```

If the binary's build-id is in any reachable debuginfod, you get
DWARF debug info as if you compiled with `-g` yourself. R2 reads
DWARF (`e dbg.dwarf=true` in some builds; it's automatic for ELFs
with a `.debug_info` section). Function names, parameter types,
local variable names — all restored.

Public debuginfod URLs worth knowing:

* `https://debuginfod.elfutils.org/` — aggregator (slow, sometimes)
* `https://debuginfod.fedoraproject.org/` — Fedora packages
* `https://debuginfod.ubuntu.com/` — Ubuntu packages
* `https://debuginfod.archlinux.org/` — Arch packages

Set the environment variable and let elfutils handle the rest:

```text
$ export DEBUGINFOD_URLS="https://debuginfod.fedoraproject.org/ \
                          https://debuginfod.ubuntu.com/"
$ r2 /usr/bin/some_binary
```

R2 with libelfutils picks up symbols automatically. If you build r2
without debuginfod support, fetch separately and use `objcopy
--add-gnu-debuglink` to attach.

## libc fingerprinting

A stripped binary usually still calls into libc. Identifying which
libc tells you which signatures to apply.

| Tell                                                       | libc            |
|------------------------------------------------------------|-----------------|
| `__libc_start_main`, `_dl_runtime_resolve_xsavec`          | glibc           |
| `_dlstart`, `__libc_start_init`, no `__libc_start_main`    | musl            |
| `__bionic_clone`, `__pthread_internal_find`                | bionic (Android)|
| `_DYNAMIC` interpreter is `/lib64/ld-uClibc.so.0`          | uClibc (older)  |
| `/lib/ld-musl-aarch64.so.1` in PT_INTERP                   | musl            |

Find the interpreter:

```text
$ readelf -l ./binary | grep -i interpreter
      [Requesting program interpreter: /lib/ld-linux-x86-64.so.2]
```

`ld-linux-*` is glibc; `ld-musl-*` is musl; `linker64` or absence is
Android bionic. With the libc identified, you can build a zignature
database from a debug-symbol package of the same version and run
`z/` to recover library function names automatically.

## Reading PLT / GOT and following imports

For a Linux binary, the import table is the highest-yield surface to
read first. Every import is a function someone else's code thought
worth depending on.

```text
$ r2 ./mystery_daemon
[0x...]> aaa
[0x...]> ii                      # list imports
[0x...]> afl ~ sym.imp           # PLT stubs
[0x...]> axt @ sym.imp.recvfrom  # who reads from sockets?
[0x...]> axt @ sym.imp.system    # who shells out?
[0x...]> axt @ sym.imp.execve    # who spawns processes?
[0x...]> axt @ sym.imp.dlopen    # who loads libs at runtime?
[0x...]> axt @ sym.imp.crypt     # any password handling?
[0x...]> axt @ sym.imp.SSL_read  # TLS endpoint
```

For each, walk the call stack upward. The function that calls
`SSL_read` is your TLS connection handler; the function that calls
`recvfrom` is your packet receiver; the function that calls `system`
or `execve` is your command dispatcher (often the vulnerable one in
older daemons).

::: tip
A short r2pipe script (Chapter 25) can emit a "who calls what
high-risk import" report in seconds — invaluable triage on
unfamiliar binaries.
:::

## Tracing syscalls instead of reading code

When static analysis would take too long, run the binary under
**strace** (or **dtrace** on macOS / BSD):

```text
$ strace -f -e trace=network,file ./mystery_daemon
socket(AF_INET, SOCK_STREAM, 0)  = 4
bind(4, {AF_INET, ...:8080}, 16) = 0
listen(4, 128)                   = 0
accept(4, ...                    = 5
read(5, "POST /api/v1 HTTP/1.1...", 4096) = 348
openat(AT_FDCWD, "/etc/myd/config.toml", O_RDONLY) = 6
read(6, "...", 4096) = 312
close(6)
write(5, "HTTP/1.1 200 OK\r\n...", 142) = 142
```

That trace shows you the daemon listens on port 8080, accepts HTTP,
reads its config from `/etc/myd/config.toml`, and serves a response.
Five minutes of strace replaces an hour of reading.

For a daemon that won't run unprivileged or one you don't want to
execute, use **ltrace** (library call trace) or run it under
**ptrace** through r2's debugger backend (Chapter 21).

## Dynamic instrumentation with Frida

For more sophisticated dynamic analysis, **Frida** is the right
tool. Hook any function in a running process and observe arguments
and return values:

```javascript
// hook.js — run with: frida -l hook.js -p <pid>
Interceptor.attach(Module.getExportByName("libc.so.6", "system"), {
    onEnter(args) {
        console.log("system(" + Memory.readCString(args[0]) + ")");
        // dump stack to see who called us
        console.log(Thread.backtrace(this.context, Backtracer.ACCURATE)
                    .map(DebugSymbol.fromAddress).join("\n"));
    }
});

Interceptor.attach(Module.getExportByName(null, "SSL_read"), {
    onEnter(args) { this.ssl = args[0]; this.buf = args[1]; },
    onLeave(retval) {
        if (retval.toInt32() > 0) {
            console.log("SSL_read returned:",
                hexdump(this.buf, {length: retval.toInt32()}));
        }
    }
});
```

For TLS-protected protocols, hooking `SSL_read`/`SSL_write` reveals
the plaintext that flows through the connection without touching
the network. This is the standard technique for reverse engineering
proprietary cloud-management protocols on IoT devices.

## Position-independent code

Modern Linux distributions enable PIE (Position-Independent
Executable) by default. The binary loads at a random base address
chosen by the kernel each run.

For analysis this means:

* **Static addresses don't help.** The address `0x5555555543e0` you
  see in a debug session is `0x43e0` plus a random base. R2's
  `e bin.relocs.apply=true` and proper analysis flow give you
  base-relative addresses consistently.
* **Function pointers and vtables go through GOT.** Reading
  `[rip + 0x...]` style accesses gives a GOT entry, which is filled
  at link time. The GOT entry itself points to the function.
* **Decompiler output looks the same.** Tools handle PIE
  transparently in static analysis; you only notice during dynamic
  debugging.

To map a debugger PC back to a source address:

```text
$ cat /proc/<pid>/maps | head
55a4ef0c0000-55a4ef0c1000 r--p 00000000 00:1f 12345  /usr/bin/myd
55a4ef0c1000-55a4ef0c4000 r-xp 00001000 00:1f 12345  /usr/bin/myd
...
$ # Subtract the base from the PC to get the source-file offset.
```

R2's `dm` command in debug mode shows the same map and aligns
analysis to it.

## Packers

Some binaries are **packed** — the on-disk image is a small
unpacker that decompresses or decrypts the real code at runtime
into memory, then jumps to it. The classic open-source packer is
**UPX** (`https://upx.github.io`). Many malware families use UPX or
a derivative; some use bespoke packers.

Spotting a packed binary:

* Section names like `UPX0`, `UPX1`, `UPX2`.
* High entropy across the entire binary (`binwalk -E` shows a flat
  line near 1.0).
* Tiny `.text` (less than ~4 KB) with one big "data" section that
  is actually code.
* A bizarre or stub-only import table.
* The compiler's `__libc_start_main` doesn't appear; instead an
  obvious "stub then jump" entry sequence.

Unpacking UPX:

```text
$ upx -d packed_binary       # reverses what UPX -9 did
```

For custom packers, the universal technique is **run-then-dump**:

1. Open the binary under r2's debugger (`r2 -d ./packed`).
2. Set a breakpoint at the OEP (Original Entry Point) — typically
   the address where control returns to the "real" code after
   unpacking. Common patterns: a large memcpy or memset right
   before the jump; an `mprotect` call making a page executable;
   the first call to a libc function.
3. Continue (`dc`) until the breakpoint fires.
4. Dump the now-decoded memory: `wt /tmp/dumped.bin <addr> <size>`.
5. Adjust ELF headers if needed and load the dump as a fresh binary.

For a more automated unpack, `unipacker` or `qiling`-based unpackers
work for many common packers without manual stepping.

::: caution
Don't run unknown packed binaries on your normal workstation. Use a
disposable VM or an isolated container — even "just to dump it" can
execute payloads.
:::

## Anti-debug techniques

Hostile binaries (some malware, some commercial DRM, some research
firmware) try to detect debuggers and behave differently when one is
attached. Common Linux anti-debug techniques:

**`ptrace(PTRACE_TRACEME)` from the binary itself.** Only one
process can attach to a process at a time. If the binary calls
`ptrace(TRACEME)` early in startup, any subsequent debugger attach
fails. Defeat by patching the call out:

```text
[0x...]> /c ptrace                  # find call sites
[0x...]> wx 1f2003d5 @ <call addr>  # NOP on AArch64 (1f2003d5)
```

**Reading `/proc/self/status` for `TracerPid:`.** The kernel reports
whether a debugger is attached in `/proc/<pid>/status`. Code that
reads this file and bails out is anti-debug. Defeat by patching the
check or by bind-mounting a fake `/proc/self/status` (LD_PRELOAD a
library that intercepts `open`).

**Timing checks.** Code that measures its own execution time with
`clock_gettime` or `rdtsc` and exits if too slow (debugger overhead).
Defeat by patching out the comparison or providing fast hardware
timing emulation.

**Signal-based tricks.** Installing a SIGTRAP handler and then
triggering `int3` — under no debugger, the handler runs; under
GDB-style debugger, the trap is consumed by the debugger and the
handler never runs.

**Hardware breakpoint detection.** Reading DR0–DR7 (x86) or
similar to detect set breakpoints. Defeat with a kernel-level
debugger or by emulation.

A useful general-purpose anti-anti-debug tool is **scdbg** / **gdb
plugins** that intercept the common syscalls and lie about results.

## Linux malware: a quick patterns survey

Most Linux malware shares a small vocabulary. Recognising the
patterns saves time:

**Persistence:**

* **Cron jobs** — `/etc/cron.d/`, `/var/spool/cron/`, user crontabs
* **systemd units** — `/etc/systemd/system/`, often disguised with
  innocuous names
* **`.bashrc` / `.profile`** for user-level
* **`/etc/rc.local`** on older distros
* **Module insertion** — loadable kernel module via `insmod`
* **Replaced binaries** — common utility (`ls`, `ps`) replaced with
  a wrapper that calls the real binary plus malicious code
* **LD_PRELOAD libraries** for in-process injection

**Command-and-control:**

* HTTP/HTTPS to a hard-coded URL or DNS over HTTPS
* DNS tunnelling (encoding C2 traffic in TXT queries)
* IRC (old-school but still seen)
* Tor (`/usr/bin/tor` linkage or embedded SOCKS proxy)
* P2P protocols for resilient botnets

**Capabilities:**

* `socket(AF_PACKET, ...)` for raw-packet sniffing
* `iptables`/`nftables` manipulation
* Process hollowing or `ptrace`-based injection
* Cryptocurrency mining (look for stratum protocol strings)
* DDoS modules (SYN flood, UDP flood, application-layer)
* SSH lateral movement (calls to `ssh` or libssh2)

A workflow when triaging a suspected Linux malware sample:

1. `file`, `strings -a`, `readelf -d`, `ldd` — surface info.
2. `objdump -d` or `r2 -A` — full disassembly.
3. Search strings for URLs, IPs, file paths, registry-like config
   paths.
4. Cross-reference network imports (`socket`, `connect`, `sendto`,
   `recvfrom`, `getaddrinfo`, `gethostbyname`).
5. Look for persistence-related path manipulation (`/etc/cron`,
   `/etc/systemd`, `~/.bashrc`).
6. Run under strace in a VM, capture syscalls, build a behaviour
   timeline.
7. Decompile suspect functions with r2ghidra and confirm
   hypotheses.

For deep malware analysis, the **MITRE ATT&CK** matrix (the Linux
section in particular) gives names to the techniques you'll see
repeatedly, and **VirusTotal** / **MalwareBazaar** provide context
on previously-seen samples.

## Stripped daemons: a worked example

Suppose you have a stripped Linux ARM64 daemon from a router
firmware. Recipe:

```text
$ r2 ./router_daemon
[0x...]> aaa
[0x...]> i ~ stripped
stripped true
[0x...]> ii                      # imports
[0x...]> izz ~ -i "config\|http\|password" | head -30
[0x...]> axt @ sym.imp.bind      # where does it listen?
[0x...]> # follow to find the listen address and port
[0x...]> axt @ sym.imp.recvfrom  # what does it receive?
[0x...]> pdg @ <handler>         # decompile the request handler
```

Cross-reference with the device's manual to confirm which port the
daemon should be listening on. If you find an extra listener on a
port no one documented, that's potentially interesting.

For commercial firmware, the same recipe finds CGI handlers,
update endpoints, "factory reset" backdoors, and the occasional
hard-coded telnet root password. Each of those is a CVE in waiting
if it's still in shipped firmware.

## When to escalate

A few situations warrant moving beyond r2:

* **Large C++ binaries.** Decompiler quality matters; standalone
  Ghidra or IDA + Hex-Rays will produce cleaner output than
  r2ghidra-embedded.
* **Kernel debugging.** R2 can attach over GDB-remote to a
  kgdb-enabled kernel, but Ghidra has better Linux-kernel-specific
  type recovery.
* **Live malware analysis in production isolation.** Cuckoo
  Sandbox, drakvuf, or commercial sandbox products are designed
  for the malware analysis pipeline and integrate reporting.

Otherwise, the same techniques you used for ESP32 firmware in
Chapter 14 — load, analyse, name, follow references, decompile,
verify — work equally well on a Linux daemon. The runtime is more
complex; the reverse engineering is not.
