#!/usr/bin/env bash
set -euo pipefail
shopt -s nullglob

ROOT="$(cd "$(dirname "$0")" && pwd)"
BUILD="$ROOT/build"
mkdir -p "$BUILD"

# Source order. Front matter first, then parts, then appendices.
SRC=()
for f in "$ROOT/src/front"/*.md;    do SRC+=("$f"); done
for f in "$ROOT/src/part1"/*.md;    do SRC+=("$f"); done
for f in "$ROOT/src/part2"/*.md;    do SRC+=("$f"); done
for f in "$ROOT/src/part3"/*.md;    do SRC+=("$f"); done
for f in "$ROOT/src/part4"/*.md;    do SRC+=("$f"); done
for f in "$ROOT/src/part5"/*.md;    do SRC+=("$f"); done
for f in "$ROOT/src/part6"/*.md;    do SRC+=("$f"); done
for f in "$ROOT/src/appendix"/*.md; do SRC+=("$f"); done

if [ ${#SRC[@]} -eq 0 ]; then
  echo "No source files found." >&2
  exit 1
fi

echo "Building from ${#SRC[@]} source files..."

pandoc \
  --from=markdown+fenced_divs+raw_tex+grid_tables+pipe_tables+yaml_metadata_block+definition_lists+fenced_code_attributes+implicit_figures+smart \
  --to=pdf \
  --pdf-engine=tectonic \
  --template="$ROOT/template/eisvogel.latex" \
  --lua-filter="$ROOT/template/callouts.lua" \
  --top-level-division=chapter \
  --metadata-file="$ROOT/metadata.yaml" \
  --output="$BUILD/r3vbook.pdf" \
  "${SRC[@]}"

echo "Built: $BUILD/r3vbook.pdf"
ls -la "$BUILD/r3vbook.pdf"
