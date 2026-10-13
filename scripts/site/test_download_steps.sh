#!/usr/bin/env bash
# The download pages show no "Price" step while config.js has no payment provider (Discord, 2026-10-12).
# Serves site/public, loads /get/ and /get/download/ in headless Chrome and checks the progress list as rendered.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
chrome="${MDMM_CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$chrome" ] || chrome="$(command -v google-chrome || command -v chromium)"
port=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')
python3 -m http.server "$port" --bind 127.0.0.1 --directory "$root/site/public" >/dev/null 2>&1 &
srv=$!
profile="$(mktemp -d)"
cleanup() { rc=$?; kill $srv 2>/dev/null; wait $srv 2>/dev/null || true; rm -rf "$profile"; exit $rc; }
trap cleanup EXIT
sleep 0.5
grep -q 'provider: "none"' "$root/site/public/config.js" || { echo "SKIP config.js has a payment provider"; exit 0; }
fail=0
for page in get/ "get/download/?ed=mm&os=mac"; do
	dom="$("$chrome" --headless=new --disable-gpu --user-data-dir="$profile" --virtual-time-budget=3000 --dump-dom "http://127.0.0.1:$port/$page" 2>/dev/null)"
	steps="$(printf '%s' "$dom" | grep 'class="progress"' | head -1 || true)"
	if printf '%s' "$steps" | grep -q 'Price'; then echo "FAIL $page shows a Price step: $steps"; fail=1;
	elif ! printf '%s' "$steps" | grep -q '2 · Download'; then echo "FAIL $page has no '2 · Download': $steps"; fail=1;
	else echo "ok   $page: $(printf '%s' "$steps" | sed 's/<[^>]*>/ /g' | tr -s ' ')"; fi
done
exit $fail
