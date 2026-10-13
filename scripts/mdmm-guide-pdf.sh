#!/usr/bin/env bash
# Renders the two guide PDFs from the generated print pages (/guide/md/print/, /guide/mm/print/) with headless
# Chrome, served over HTTP (Chrome hangs on file:// and the pages use root paths). Output: temp/guide-pdf/ (not in git).
# Run scripts/mdmm-guide.mjs first. Usage: scripts/mdmm-guide-pdf.sh [md|mm]...   (default: both)
# Plan: doc/release/PLAN-0.6.md, "The guide layout".
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/temp/guide-pdf"
port="${MDMM_GUIDE_PORT:-8797}"
chrome="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$chrome" ] || chrome="$(command -v google-chrome || command -v chromium || true)"
[ -n "$chrome" ] || { echo "No Chrome found; set CHROME=/path/to/chrome" >&2; exit 1; }

machines=("$@")
[ ${#machines[@]} -gt 0 ] || machines=(md mm)
for m in "${machines[@]}"; do
	[ -f "$root/site/public/guide/$m/print/index.html" ] || { echo "No print page for $m: run node scripts/mdmm-guide.mjs" >&2; exit 1; }
done

mkdir -p "$out"
python3 -m http.server "$port" --bind 127.0.0.1 --directory "$root/site/public" >/dev/null 2>&1 &
server=$!
profile="$(mktemp -d)"
cleanup() { local rc=$?; kill "$server" 2>/dev/null || true; wait "$server" 2>/dev/null || true; rm -rf "$profile"; exit "$rc"; }
trap cleanup EXIT
for _ in $(seq 1 50); do curl -sf "http://127.0.0.1:$port/guide/guide.css" >/dev/null && break; sleep 0.1; done

for m in "${machines[@]}"; do
	case "$m" in
		md) name="machinedrum-editor-guide.pdf" ;;
		mm) name="monomachine-editor-guide.pdf" ;;
		*) echo "Unknown machine: $m" >&2; exit 1 ;;
	esac
	"$chrome" --headless=new --disable-gpu --no-first-run --user-data-dir="$profile" --no-pdf-header-footer \
		--virtual-time-budget=20000 --print-to-pdf="$out/$name" "http://127.0.0.1:$port/guide/$m/print/" 2>/dev/null
	python3 "$root/scripts/mdmm-guide-pdf-shrink.py" "$out/$name" >/dev/null
	cp "$out/$name" "$root/site/public/guide/$name"
	echo "$out/$name"
done
