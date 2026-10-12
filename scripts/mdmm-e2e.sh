#!/bin/bash
# The end-to-end evidence run (doc/release/E2E.md): every journey of the manual's rows on the REAL firmware (the
# standalone editor on the emulated machine: the user's ROMs, GEARMULATOR_MD_FIRMWARE_BIN / GEARMULATOR_MM_FIRMWARE_BIN
# or the ones in ~/Documents/Gearmulator Preview/<machine>/roms), a snapshot at each journey's proof moment, the
# pictures rendered, and one report: temp/evidence/<version>/index.html (chapter, section, row, steps, pass or fail,
# picture; the red items first), with the derived data doc/features/e2e-<machine>.json for the feature maps.
#   scripts/mdmm-e2e.sh [md|mm|both] [--jobs N] [--no-build] [--page] [--write-data] [--select journey-...] [--report-only]
#     --jobs N       editors at once per machine (default 1: the gate's order, so what an earlier journey leaves behind is the same each run; 2 or 4 is faster and
#                    moves such leftovers about)
#     --page         also run the page tier (the stub machine) for the stub-only column (a few minutes)
#     --write-data   write doc/features/e2e-<machine>.json (the maps' E2E column; commit it with the guide)
#     --select       a journey selector (default: all), for a part of a run: the report then lists the rest as "missing"
#     --report-only  render the pictures and the report from the last run in temp/evidence/<version>/run
#     --retake       after other branches merged: the same run again, into the same folder (the guide's pictures follow:
#                    scripts/mdmm-guide.mjs takes the newest snapshot of each name), then the report
# Fresh settings (MDMM_JOURNEY_SETTINGS=fresh): the machine starts from factory memory, so the pictures are the same each
# run. The editors run in the background (no focus, no sound). Takes about 40 minutes for both machines.
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
WHICH=both JOBS=1 BUILD=1 PAGE=0 WRITE=0 SEL=journey REPORT_ONLY=0
while [ $# -gt 0 ]; do
	case "$1" in
		md|mm|both) WHICH=$1 ;;
		--jobs) JOBS=$2; shift ;;
		--no-build) BUILD=0 ;;
		--page) PAGE=1 ;;
		--write-data) WRITE=1 ;;
		--select) SEL=$2; shift ;;
		--report-only) REPORT_ONLY=1 ;;
		--retake) ;;
		*) sed -n 2,19p "$0"; exit 2 ;;
	esac
	shift
done
VERSION=$(sed -n 's/^set(MDMM_EDITOR_VERSION \([0-9.]*\)).*/\1/p' source/elektron/md/mdJucePlugin/mdmmPlugins.cmake)
OUT=${MDMM_E2E_OUT:-"$ROOT/temp/evidence/$VERSION"}
RUN="$OUT/run"
mkdir -p "$OUT/shots"
START=$(date +%s)
if [ $REPORT_ONLY = 0 ]; then
	if [ $BUILD = 1 ]; then scripts/mdmm-dev.sh build mdJucePlugin_Standalone mmJucePlugin_Standalone >"$OUT/build.log" 2>&1 || { echo "build failed: $OUT/build.log"; exit 1; }; fi
	rm -rf "$RUN"; mkdir -p "$RUN" "$OUT/fixtures"
	# the files the journeys that import SysEx or a sample need (their runs skip without): the committed test dumps of
	# each machine joined into one .syx, and one second of a sine as a WAV
	cat source/elektron/md/elektronData/testdata/programmed_*.syx > "$OUT/fixtures/md.syx"
	cat source/elektron/md/elektronData/testdata/mm/programmed-*.syx > "$OUT/fixtures/mm.syx"
	python3 - "$OUT/fixtures/e2e.wav" <<'PY'
import math, struct, sys, wave
w = wave.open(sys.argv[1], 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(44100)
w.writeframes(b''.join(struct.pack('<h', int(12000 * math.sin(2 * math.pi * 220 * i / 44100))) for i in range(44100))); w.close()
PY
	PIDS=""
	for M in md mm; do
		[ "$WHICH" = both ] || [ "$WHICH" = $M ] || continue
		GEARMULATOR_MDMM_SYX_FILE="$OUT/fixtures/$M.syx" GEARMULATOR_MDMM_WAV_FILE="$OUT/fixtures/e2e.wav" \
		MDMM_JOURNEY_TIMEOUT=${MDMM_JOURNEY_TIMEOUT:-3600} MDMM_JOURNEY_SETTINGS=fresh MDMM_JOURNEY_E2E=1 MDMM_JOURNEY_OUT="$RUN/$M" \
			scripts/mdmm-journeys.sh --background --jobs "$JOBS" "$M" "$SEL" > "$OUT/journeys-$M.log" 2>&1 &
		PIDS="$PIDS $!"
	done
	for p in $PIDS; do wait "$p"; done
	tail -qn 1 "$OUT"/journeys-*.log
fi
PAGEARGS=()
if [ $PAGE = 1 ]; then
	node scripts/mdmm-page.mjs --jobs 2 --out "$OUT/page" "$WHICH" "$SEL" > "$OUT/page.log" 2>&1
	tail -2 "$OUT/page.log"
	PAGEARGS=(--page "$OUT/page")
fi
# the pictures: each unit's page log, in parallel
RAW="$OUT/raw"; rm -rf "$RAW"; mkdir -p "$RAW"; rm -f "$OUT"/shots/*.webp
find "$RUN" -name page.log | xargs -P 4 -I{} python3 scripts/mdmm-snap.py "$RAW" {} > "$OUT/snap.log" 2>&1
python3 scripts/mdmm-e2e-webp.py "$RAW" "$OUT/shots" | tee "$OUT/shots.size"
rm -rf "$RAW"
FW=""; for r in "$HOME/Documents/Gearmulator Preview/Machinedrum/roms/"* "$HOME/Documents/Gearmulator Preview/Monomachine/roms/"*; do FW="$FW $(basename "$r")"; done
export MDMM_E2E_VERSION=$VERSION MDMM_E2E_COMMIT=$(git rev-parse --short HEAD) MDMM_E2E_FIRMWARE="${GEARMULATOR_MD_FIRMWARE_BIN:+$(basename "$GEARMULATOR_MD_FIRMWARE_BIN") }${GEARMULATOR_MM_FIRMWARE_BIN:+$(basename "$GEARMULATOR_MM_FIRMWARE_BIN")}${FW}"
ARGS=(--out "$OUT" "${PAGEARGS[@]}")
[ $WRITE = 1 ] && ARGS+=(--write-data)
node scripts/mdmm-e2e.mjs "${ARGS[@]}" "$RUN"
echo "done in $(( $(date +%s) - START )) s"
