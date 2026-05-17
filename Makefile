.PHONY: all build clean watch tools-check

PDF := build/r3vbook.pdf

all: build

build: $(PDF)

$(PDF): metadata.yaml template/eisvogel.latex template/callouts.lua \
        $(wildcard src/front/*.md) \
        $(wildcard src/part1/*.md) \
        $(wildcard src/part2/*.md) \
        $(wildcard src/part3/*.md) \
        $(wildcard src/part4/*.md) \
        $(wildcard src/part5/*.md) \
        $(wildcard src/appendix/*.md)
	./build.sh

clean:
	rm -rf build

# Rebuild whenever any source file changes (requires fswatch or inotifywait).
watch:
	@if command -v fswatch >/dev/null 2>&1; then \
	    fswatch -or src/ metadata.yaml template/ | xargs -n1 -I{} make build; \
	elif command -v inotifywait >/dev/null 2>&1; then \
	    while inotifywait -qre modify src/ metadata.yaml template/; do make build; done; \
	else \
	    echo "Install fswatch (mac) or inotify-tools (linux) for watch mode." >&2; \
	    exit 1; \
	fi

tools-check:
	@command -v pandoc   >/dev/null || { echo "missing: pandoc";   exit 1; }
	@command -v tectonic >/dev/null || { echo "missing: tectonic"; exit 1; }
	@echo "pandoc:   $$(pandoc --version | head -1)"
	@echo "tectonic: $$(tectonic --version 2>&1 | head -1)"
