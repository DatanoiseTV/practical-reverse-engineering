# Practical Reverse Engineering

A 300+ page practical handbook on reverse engineering — covering
embedded firmware (ARM Cortex-M, Xtensa/ESP32, RISC-V, 8051),
Linux userland (Cortex-A daemons, stripped binaries, packers,
malware patterns), Linux kernel modules + device trees (DTB/DTS),
and MIPS-based router firmware.

The book uses radare2 as its primary running example because it is
the only fully free, fully open, fully scriptable disassembler with
first-class coverage of every architecture covered. Other tools
(Ghidra, IDA, Binary Ninja, binwalk, Frida, Capstone/Keystone/
Unicorn, Qiling, esptool, OpenOCD, probe-rs, flashrom, YARA,
BinDiff, LLM assistants) are surveyed in the toolkit chapter
(Chapter 26) and called out where each shines.

The PDF is built from Markdown sources with Pandoc and the Eisvogel
LaTeX template, producing a Packt/O'Reilly-style typeset book.

## Building the PDF

You need a small toolchain. On macOS with Homebrew:

```
brew install pandoc tectonic
```

On Linux:

```
# pandoc from your package manager (>= 3.0)
sudo apt install pandoc
# tectonic from https://tectonic-typesetting.github.io
cargo install --locked tectonic
# or: sudo apt install texlive-xetex texlive-fonts-extra
#     (then edit build.sh to pass --pdf-engine=xelatex)
```

Then:

```
./build.sh
# or:
make
```

The output lands at `build/r3vbook.pdf`.

The build uses the system fonts Charter (serif body), Helvetica Neue
(sans), and Menlo (monospace). On non-macOS systems substitute via
`metadata.yaml` — any serif body, sans-serif heading, and monospace
code font will do; the layout was designed around oldstyle-figures
Charter but is robust to substitution.

## Repository layout

```
src/
  front/            preface
  part1/  6 ch      foundations (landscape, install, command grammar,
                    loading, analysis, visual mode)
  part2/  5 ch      static analysis toolkit
  part3/  7 ch      architectures
  part4/  6 ch      firmware workflows: raw images, bootloaders,
                    dynamic analysis, patching, pinout discovery,
                    Linux userland
  part5/  6 ch      automation, broader toolkit, generic RE techniques,
                    LLM-assisted RE, playbook, caveats
  appendix/  4 ch   command cheatsheet, arch reference,
                    file formats, further reading
template/           Eisvogel LaTeX template + Lua filter for callouts
metadata.yaml       book-level Pandoc/LaTeX configuration
build.sh            one-shot build
Makefile            convenience targets (build, clean)
CHANGELOG.md        version history
LICENSE             CC BY-SA 4.0
```

## Authoring conventions

Each chapter is one markdown file under `src/<part>/`. Chapter order
is determined by the file's leading number (`12-arm-cortex-m.md`).
Inside a chapter:

* Use `#` for the chapter title (Pandoc converts to a chapter via
  `--top-level-division=chapter`).
* Use `##` and `###` for sections and subsections.
* Use fenced code blocks with language tags (\`\`\`c, \`\`\`text,
  \`\`\`python, etc.) — the highlighter ships pygments-class styles.
* Use Pandoc fenced divs for callouts:
  ```
  ::: note
  This is a note.
  :::

  ::: tip
  This is a tip.
  :::

  ::: warning
  This is a warning.
  :::

  ::: caution
  This is a caution.
  :::
  ```
  The Lua filter in `template/callouts.lua` maps these to coloured
  tcolorbox environments at LaTeX time.

## Versioning

Semantic versioning (see `CHANGELOG.md`):

* Major version bump — chapter additions or restructuring that
  shifts page numbers significantly.
* Minor version bump — new sections, expanded chapters, or
  appendix additions.
* Patch version bump — typo fixes, small clarifications, factual
  corrections that don't change structure.

## Contributing

Pull requests welcome. Useful kinds of contribution:

* Factual corrections — especially in the architecture chapters
  (Part III) and the file-format appendix. Cite a primary source
  (datasheet, spec, vendor TRM) in the PR description.
* New worked examples — a tricky firmware reverse-engineering case
  study makes a great addition to the relevant Part III chapter or
  Part V's playbook.
* Additional architecture chapters — PowerPC, AVR, MSP430, m68k,
  SH, and TriCore would all be welcome.
* New zignatures or signature databases for vendor SDKs (the source
  for these belongs in a sibling project, but PRs that explain how
  to build them belong in Chapter 10).

Open an issue first for anything larger than a typo fix so we can
align on scope before you write.

## License

The book text is licensed under
[Creative Commons Attribution-ShareAlike 4.0 International][cc-by-sa].
The build scripts, LaTeX template, Lua filter, and example code
embedded in the prose are additionally available under the MIT
License at the reader's option. See [LICENSE](LICENSE) for full
terms.

[cc-by-sa]: https://creativecommons.org/licenses/by-sa/4.0/

## Acknowledgements

The radare2 ecosystem exists because of a long line of contributors
who chose to publish hard, niche, often thankless tooling for free.
If this book has any value, that value is theirs first.
