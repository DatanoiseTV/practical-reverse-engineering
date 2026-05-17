# LLM-Assisted Reverse Engineering

Large language models — Claude (via Claude Code or the API), GPT-4o,
Gemini, open-source models like Llama and Qwen — can do a useful job
of reading disassembly, summarising decompiler output, suggesting
function names, and writing r2pipe scripts. They also confidently
make things up. This chapter covers how to use LLMs as a productivity
multiplier in reverse-engineering work without being misled by their
confident wrongness.

The chapter focuses on Claude Code as the working example because of
its tight integration with the developer's workflow (file system, git,
shell), but the principles apply to any LLM tool: ChatGPT, the
Anthropic Workbench, Cursor, Aider, Continue, llm-cli, plain API
calls, or local models served via Ollama.

## What LLMs are actually good at, in this context

In rough order of usefulness:

**Naming and explaining.** Given a decompiled function, an LLM will
produce a plausible name and a high-level description. For 80% of
ordinary functions (string manipulation, parameter validation,
peripheral configuration sequences) the suggestion is right or close
to right. The remaining 20% need verification.

**Recognising library code.** "Here is the disassembly of a function;
is this a known crypto primitive?" The LLM has read enough open
source that it identifies AES key schedules, SHA round constants,
mbedTLS function patterns, and FreeRTOS scheduler shapes from a
short snippet.

**Writing r2pipe scripts.** Given a goal in English, the LLM can
write the Python r2pipe script that achieves it. You should still
read the script; it occasionally invents commands that do not exist.

**Translating between formats.** Decompiler output -> C -> equivalent
Python implementation. Disassembly -> ESIL. CMSIS header -> r2 type
definitions. These are mechanical translations the model handles
well.

**Brainstorming.** "I see these patterns in the disassembly; what
might this function be doing?" The LLM proposes a few hypotheses,
some of which are wrong but trigger the line of reasoning that gets
you to the right answer faster than thinking alone.

**Code structure recovery.** "Here are five disassembled functions
that all access the same struct; what does the struct look like?"
The LLM proposes a layout, you adjust, you save it as a `t` type
in r2.

## What LLMs are bad at

In rough order of how often they bite:

**Specific addresses.** The model will confidently tell you "this
function lives at 0x08001234" when it does not. Treat any specific
numeric claim as suspect.

**Architecture-specific details.** "On Cortex-M3, the MSR instruction
encodes ..." — sometimes right, sometimes wrong. The model has read
the ARM ARM but does not always recall it precisely. Check vendor
documentation for anything you would commit to.

**Subtle semantics.** "This function returns 0 on success" — maybe;
or maybe it returns the negation of a flag, and the LLM glossed over
the difference. Decompiled code is full of small inversions.

**The latest features of any tool.** R2 is updated weekly. The
model's training cutoff is months ago. Commands the model suggests
may have been renamed or replaced. Confirm with `?` in r2.

**Long contexts.** When you give the LLM 50 functions of disassembly,
quality degrades. It conflates function bodies, suggests names that
mix two functions, and produces sweeping summaries that hide errors.
Smaller chunks, focused questions.

**Anything safety-critical or legally-binding.** Do not let an LLM
decide whether a binary contains malware, whether a vulnerability is
exploitable, whether code is GPL-derivative, or whether a patch is
safe. These are judgements you make.

## Practical workflows

### Workflow 1: Function naming pass

For a binary with hundreds of unnamed functions, the bulk-naming
script in Chapter 25 produces names like `ref_error_invalid_handle`.
Better names need understanding the function, which is where an LLM
helps.

A pattern that works:

```python
import r2pipe, anthropic   # or openai, etc.

client = anthropic.Anthropic()
r2 = r2pipe.open("firmware.bin", flags=["-2"])
r2.cmd("aaa")

unnamed = [fn for fn in r2.cmdj("aflj")
           if fn["name"].startswith("fcn.") and fn["size"] < 200]

for fn in unnamed[:50]:
    asm = r2.cmd(f"pdf @ 0x{fn['offset']:x}")
    pdg = r2.cmd(f"pdg @ 0x{fn['offset']:x}")
    prompt = f"""You are reverse engineering ARM Cortex-M firmware. Below is the
disassembly and decompiler output of one function. Suggest a short snake_case
name (1-3 words) describing what this function does. Reply with ONLY the name,
no explanation.

DISASSEMBLY:
{asm}

DECOMPILER:
{pdg}
"""
    msg = client.messages.create(
        model="claude-opus-4-7",
        max_tokens=64,
        messages=[{"role": "user", "content": prompt}],
    )
    name = msg.content[0].text.strip()
    if name and "_" in name and len(name) < 40:
        r2.cmd(f"afn {name} 0x{fn['offset']:x}")
        print(f"  named 0x{fn['offset']:x} -> {name}")

r2.cmd("Ps llm_named")
```

After 50 calls, you have 50 plausible names. Spot-check 10 of them
by reading the function. If accuracy looks good (~80%+), let it run
on the whole binary. If accuracy is bad, your prompt needs work or
the architecture is too unusual for the model.

::: warning
Always commit to a project save *before* running an LLM-driven
naming pass, so you can re-open the saved project (`P name`) to roll back if the names turn out to be
garbage. LLM-generated names are easy to write and tedious to undo.
:::

### Workflow 2: Hypothesis generation for one function

For a single hard function, the dialogue pattern works well. Open
your editor (or Claude Code's chat), paste the function, ask:

> Below is a decompiled function from an STM32F4 firmware image.
> What is it doing? What would you guess the original C looks like?
> If anything is ambiguous, ask me clarifying questions instead of
> guessing.
>
> ```c
> int32_t fcn_080012a0(int32_t arg1, int32_t arg2) { ... }
> ```

The model may answer with a hypothesis and a few clarifying
questions ("is `arg1` a pointer? do you know the signature of the
function called at line 12?"). Answer them; the model refines.

This is a much higher quality interaction than the bulk naming
above. It is also slower. Use it for the 10–20 functions that are
hardest to read; use bulk naming for the long tail.

### Workflow 3: Asking the LLM to write the script

Many r2pipe scripts you would otherwise hand-write can be specified
in English and generated:

> Write a Python r2pipe script that:
>
> 1. Opens "firmware.bin" with arch arm, bits 16, base 0x08000000.
> 2. Runs `aaa`.
> 3. Reads the vector table from 0x08000000 (the first 256 bytes,
>    treated as 32-bit little-endian words).
> 4. For each non-zero entry that points into flash, defines a
>    function at that address.
> 5. Names the first 16 with the standard Cortex-M exception names
>    (NMI, HardFault, MemManage, BusFault, UsageFault, SVC, DebugMon,
>    PendSV, SysTick).
> 6. Saves the project as "firmware_vt".

The model produces a script you can read and run in 30 seconds.
Read it; the LLM occasionally generates plausible-but-wrong commands
(e.g., it once suggested `r2.cmd("aaaa-rename")` which is not a
thing). Treat the output as a draft.

### Workflow 4: Type recovery

Given several functions that operate on the same memory region:

> The following five functions all read and write to a buffer
> pointed to by their first argument. Based on the field offsets
> they access (0, 4, 8, 16, 20, 32), suggest a C struct definition.
>
> ```
> [paste the five functions]
> ```

The model looks at the access patterns, considers the operations
(byte reads vs word reads, contiguous loops, …), and proposes a
struct. You import the struct into r2 with `tos`, link it with `tl`,
and the disassembly becomes much more readable.

### Workflow 5: Architecture-specific Q&A

For specific architectural questions ("how does Xtensa's CALL12 differ
from CALL8?", "what does the ESP32 EFUSE_RD_DIS_FLASH_CRYPT_CNT
field control?"), the LLM is faster than skimming the TRM. Verify
anything you act on.

## Claude Code as a session driver

Claude Code (and similar agentic tools — Aider, Continue, OpenAI's
Codex CLI) can drive your reverse-engineering session more directly.
With access to the terminal, it can:

* Open r2 itself with the right flags.
* Run analysis commands and read their output.
* Iterate on naming and type definitions across many functions.
* Save and restore project state.
* Write and run r2pipe scripts on your behalf.

A useful pattern: keep a session-spanning markdown notes file
(`notes.md`) where you and the LLM both write findings. When you
return to the session a week later, both you and the LLM read the
notes file and resume in context. This compensates for the LLM's
short conversational memory.

A typical Claude Code interaction:

> User: Open firmware.bin in r2 with arch arm, bits 16, base
> 0x08000000. Run analysis. Then look at the functions called from
> the reset handler and tell me what each one does. Save your
> findings to notes.md.
>
> Claude: \[runs r2, runs aaa, reads the vector table, follows the
> reset handler's calls, summarises each, writes to notes.md\]

You read the notes, sanity-check the most important claims, then
proceed. Saves an hour of manual stepping through reset code.

## Verification discipline

The single most important rule when working with LLMs on reverse
engineering: **every concrete claim is a hypothesis until verified
against the binary**. Specifically:

* If the LLM names a function, read the function and confirm the
  name matches.
* If the LLM identifies code as "AES-128-CBC encryption", check the
  S-box constants, the round count, the mode-of-operation
  scaffolding.
* If the LLM says "this loop iterates 16 times", count the loop.
* If the LLM claims "the second argument is a length in bytes",
  trace the argument back to its source.

The cost of verification is small (you would have read the function
anyway); the cost of acting on a wrong claim can be hours of
debugging the wrong hypothesis.

A useful framing: the LLM is an enthusiastic junior who has read
every reverse-engineering blog post on the internet and produces
plausible-sounding answers very fast. You are the senior engineer
who reviews the answers before they become decisions. Treat every
LLM output as a PR you are reviewing, not a fact you are accepting.

## Privacy and exfiltration

When you paste firmware into a hosted LLM, you are sending the
firmware to that company's servers. For:

* **Open-source firmware** (OpenWrt, ESP-IDF reference apps, vendor
  SDKs): no privacy concern. Use freely.
* **Customer-owned firmware** (something you are reverse engineering
  under contract): check your contract. Usually customer firmware
  must not leave your environment.
* **Malware samples**: cloud LLMs may flag, log, or share with
  third parties. Use a local model (Ollama with Llama, Qwen, or
  similar) for malware work.
* **Corporate or trade-secret firmware**: same — local model only,
  or self-hosted Anthropic / OpenAI deployments under enterprise
  agreement.

If in doubt, run a local model. Modern 70B-parameter open-weights
models are 80% as capable as the frontier closed models for
reverse-engineering tasks, and they run on a consumer GPU.

## When LLMs replace tools, and when they do not

LLMs do not replace:

* radare2 itself — the disassembly, the analysis, the project
  database, the hardware debug. The LLM consumes r2's output; r2
  produces the ground truth.
* The decompiler — r2ghidra is a real decompiler; the LLM
  paraphrases what the decompiler produced.
* Hardware analysis tools (logic analyser, scope, spectrum
  analyser, multimeter). Physical signals are out of the LLM's
  scope.
* Your judgement about whether a vulnerability is real, exploitable,
  or worth disclosing.

LLMs replace, partially:

* Manual function naming for the long tail.
* Looking up architectural minutiae you have forgotten.
* Writing one-off scripts.
* Drafting reports and write-ups.
* Pair-programming a difficult function decomposition.

The right framing is "LLMs are a force multiplier on the parts of
reverse engineering that involve reading and writing English". The
parts that involve reading binaries, running tools, and judging
correctness remain yours.

## A modest closing claim

Reverse engineering work that used to take a week takes three days
when you use an LLM well, and ten days when you use one badly.
Knowing where the gains and traps are — that is what this chapter
is for.
