.PHONY: all build pdf html clean watch tools-check serve dev

PDF := build/r3vbook.pdf

all: pdf html

build: $(PDF)
pdf:   $(PDF)

html:
	./scripts/build-html.sh

# VitePress dev server with hot-reload, served at http://localhost:5173.
# Useful while iterating on styling or content.
dev:
	./scripts/build-html.sh --dev-only || true
	cd web && npx vitepress dev .

# Serve the production build over a static HTTP server (post-build).
serve: html
	@cd web/dist && python3 -m http.server 8080

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
	rm -rf build web/dist web/.vitepress/cache web/.vitepress/sidebar.json
	rm -rf web/front web/part1 web/part2 web/part3 web/part4 web/part5 web/appendix
	rm -f  web/index.md

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
	@command -v node     >/dev/null || { echo "missing: node";     exit 1; }
	@command -v npm      >/dev/null || { echo "missing: npm";      exit 1; }
	@echo "pandoc:   $$(pandoc --version | head -1)"
	@echo "tectonic: $$(tectonic --version 2>&1 | head -1)"
	@echo "node:     $$(node --version)"
	@echo "npm:      $$(npm --version)"
