#!/usr/bin/env bash
# Build the VitePress HTML site.
#
# We keep the canonical chapter sources in src/ as Pandoc-flavoured
# Markdown (because the PDF build is Pandoc and that is the primary
# deliverable). This script copies src/ into web/, rewrites the
# Pandoc-only bits to VitePress-friendly equivalents, generates the
# sidebar config from the chapter layout, and runs `vitepress build`.

set -euo pipefail
shopt -s nullglob

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/src"
WEB="$ROOT/web"
DST="$WEB"                 # VitePress reads markdown from .vitepress/../

# Wipe the staged markdown from any previous build, but leave the
# VitePress config and node_modules in place.
find "$DST" -mindepth 1 -maxdepth 1 \
    \! -name "node_modules" \
    \! -name ".vitepress" \
    \! -name "package.json" \
    \! -name "package-lock.json" \
    \! -name "yarn.lock" \
    -exec rm -rf {} +

# --------- Transform a single source markdown file. -----------------
# Rewrites:
#   ```{=latex} ... ```           drop (Pandoc-only raw block)
#   ::: note                      -> ::: info Note         (callout)
#   ::: tip                       -> ::: tip Tip
#   ::: warning                   -> ::: warning Warning
#   ::: caution                   -> ::: danger Caution
#   # Heading {-}                 -> # Heading             (strip Pandoc attrs)
transform() {
  python3 - "$1" "$2" <<'PY'
import re, sys, pathlib

src, dst = sys.argv[1], sys.argv[2]
text = pathlib.Path(src).read_text()

# Strip ```{=latex} ... ``` raw-LaTeX blocks.
text = re.sub(r"```\{=latex\}\n.*?\n```\n?", "", text, flags=re.DOTALL)

# Strip Pandoc heading attributes `# Heading {-}` etc.
text = re.sub(r"^(#{1,6}\s+[^\n]*?)\s*\{[^\n}]*\}\s*$", r"\1",
              text, flags=re.MULTILINE)

# Map our fenced-div callouts to VitePress's native container types.
KIND = {
    "note":    ("info",    "Note"),
    "tip":     ("tip",     "Tip"),
    "warning": ("warning", "Warning"),
    "warn":    ("warning", "Warning"),
    "caution": ("danger",  "Caution"),
}
DIV = re.compile(
    r"^:::\s*(note|tip|warning|warn|caution)\s*$\n(.*?)\n^:::\s*$",
    re.MULTILINE | re.DOTALL,
)
def repl(m):
    kind, title = KIND[m.group(1).lower()]
    return f"::: {kind} {title}\n{m.group(2).rstrip()}\n:::"
text = DIV.sub(repl, text)

pathlib.Path(dst).parent.mkdir(parents=True, exist_ok=True)
pathlib.Path(dst).write_text(text)
PY
}

# Copy + transform all chapter markdown into web/.
while IFS= read -r rel; do
  transform "$SRC/$rel" "$DST/$rel"
done < <(cd "$SRC" && find . -name "*.md" -type f | sort)

# Write a homepage at web/index.md.
cat > "$DST/index.md" <<'EOF'
---
layout: home

hero:
  name:     "Practical Reverse Engineering"
  text:     "A field guide for ARM, RISC-V, Xtensa, 8051, MIPS, and Linux."
  tagline:  An open handbook covering embedded firmware (ARM Cortex-M, Xtensa/ESP32, RISC-V, 8051, MIPS), Linux userland, kernel modules and device trees, hardware attacks (FI / SCA), plus cross-target reverse-engineering techniques.
  actions:
    - theme: brand
      text:  Start reading
      link:  /front/notice
    - theme: alt
      text:  Download PDF
      link:  https://github.com/DatanoiseTV/practical-reverse-engineering/releases/latest
    - theme: alt
      text:  GitHub
      link:  https://github.com/DatanoiseTV/practical-reverse-engineering

features:
  - title: Six parts, plus appendices
    details: Foundations, static analysis, architectures, firmware and Linux workflows, automation and tooling, and hardware attacks — plus a command cheatsheet, architecture quick reference, file-format catalogue, and curated further reading.
  - title: Every common embedded target
    details: ARM Cortex-M (STM32/nRF/SAMD), ARM Cortex-A and Linux userland, Xtensa (ESP32), RISC-V (ESP32-C, BL602), 8051, MIPS routers, plus Linux drivers and the device tree.
  - title: radare2 as the daily-driver tool
    details: Each chapter shows commands in radare2 — the only free, open, multi-architecture disassembler that covers every target in the book. Ghidra, IDA, Binary Ninja, Frida, binwalk, and friends are surveyed in the toolkit chapter and called out where each shines.
  - title: Open source
    details: Markdown sources, CC BY-SA 4.0 licensed. PDF built with Pandoc + Tectonic; this site is built with VitePress. Pull requests welcome.
---
EOF

# Generate the sidebar config (one section per Part, plus prefix
# preface and trailing appendices group).
python3 - <<PY > "$WEB/.vitepress/sidebar.json"
import json, pathlib, re

ROOT = pathlib.Path("$DST")

def first_h1(p):
    for line in p.read_text().splitlines():
        s = line.strip()
        if s.startswith("# ") and not s.startswith("## "):
            return s[2:].strip()
    return p.stem

def chapters(slug):
    out = []
    for f in sorted((ROOT / slug).glob("*.md")):
        rel  = f.relative_to(ROOT).with_suffix("")
        link = "/" + str(rel).replace("\\\\", "/")
        out.append({"text": first_h1(f), "link": link})
    return out

# VitePress sidebar can be a single tree shown on every page, or
# different per route. We use the simple "same on every page" form.
sidebar = []

# Front matter (Notice + Preface, in that order).
front_items = []
for slug, title in [("notice", "Notice"), ("preface", "Preface")]:
    p = ROOT / "front" / f"{slug}.md"
    if p.exists():
        front_items.append({"text": title, "link": f"/front/{slug}"})
if front_items:
    sidebar.append({"text": "Front matter", "items": front_items})

PARTS = [
    ("part1", "Part I — Foundations"),
    ("part2", "Part II — Static Analysis Toolkit"),
    ("part3", "Part III — Architectures"),
    ("part4", "Part IV — Firmware and Linux Workflows"),
    ("part5", "Part V — Automation, Tools, and Practice"),
    ("part6", "Part VI — Hardware Attacks"),
    ("part7", "Part VII — Protocols and Fuzzing"),
]
for slug, title in PARTS:
    items = chapters(slug)
    if items:
        sidebar.append({
            "text":      title,
            "collapsed": False,
            "items":     items,
        })

apx = chapters("appendix")
if apx:
    sidebar.append({"text": "Appendices", "collapsed": False, "items": apx})

print(json.dumps(sidebar, indent=2))
PY

# Install deps if missing.
cd "$WEB"
if [ ! -d node_modules ]; then
  npm install --silent
fi

# Build.
npx vitepress build .

echo ""
echo "HTML built: $WEB/dist/index.html"
