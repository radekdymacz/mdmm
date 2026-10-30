#!/bin/bash
# The end-to-end evidence run (doc/release/E2E.md): every journey of the manual's rows on the REAL firmware (the
# standalone editor on the emulated machine: the user's ROMs, GEARMULATOR_MD_FIRMWARE_BIN / GEARMULATOR_MM_FIRMWARE_BIN
# or the ones in ~/Documents/Gearmulator Preview/<machine>/roms), a snapshot at each journey's proof moment, the
# pictures rendered, and one report: temp/evidence/<version>/index.html (chapter, section, row, steps, pass or fail,
# picture; the red items first), with the derived data doc/features/e2e-<machine>.json for the feature maps.
#   scripts/mdmm-e2e.sh [md|mm|both] [--jobs N] [--no-build] [--page] [--write-data] [--select journey-...] [--report-only] [--shuffle SEED] [--isolate]
#     --jobs N       editors at once per machine (default 1: the gate's order, so what an earlier journey leaves behind is the same each run; 2 or 4 is faster and
#                    moves such leftovers about)
#     --page         also run the page tier (the stub machine) for the stub-only column (a few minutes)
#     --write-data   write doc/features/e2e-<machine>.json (the maps' E2E column; commit it with the guide)
#     --shuffle SEED the journeys in a seeded random order (SEED an integer; printed in the report): proof that none depends on one before it
#     --tier T       the standalone's journeys of that tier only (page, machine, host; default all: skins/shared/deskJourney.js TIERS)
#     --isolate      every journey in an editor of its own, fresh from factory memory (slow: one start each; with --select, for the journeys in question)
#     --select       a journey selector (default: all), for a part of a run: the report then lists the rest as "not selected" (a full run's absent journeys are "missing" and fail it)
#     --report-only  render the pictures and the report from the last run in temp/evidence/<version>/run
#     (a targeted re-run of a few journeys whose result a harness fault spoiled goes to $OUT/run-fix/<md|mm>, scripts/mdmm-journeys.sh with
#      MDMM_JOURNEY_OUT set to it; --report-only then reads both, the later run winning)
#     --retake       after other branches merged: the same run again, into the same folder (the guide's pictures follow:
#                    scripts/mdmm-guide.mjs takes the newest snapshot of each name), then the report
# Fresh settings (MDMM_JOURNEY_SETTINGS=fresh): the machine starts from factory memory, so the pictures are the same each
# run. Exit status: nonzero when any journey job failed, the page tier failed, a journey failed or (full run) is missing, or the report failed (scripts/mdmm-e2e.mjs; self-test: node scripts/mdmm-e2e-selftest.mjs).
# The editors run in the background (no focus, no sound). Takes about 40 minutes for both machines.
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
WHICH=both JOBS=1 BUILD=1 PAGE=0 WRITE=0 SEL=journey REPORT_ONLY=0 SHUFFLE="" ISOLATE=0 TIER=""
RC=0   # the run fails when any journey job, the page tier or the report failed
while [ $# -gt 0 ]; do
	case "$1" in
		md|mm|both) WHICH=$1 ;;
		--jobs) JOBS=$2; shift ;;
		--no-build) BUILD=0 ;;
		--page) PAGE=1 ;;
		--write-data) WRITE=1 ;;
		--select) SEL=$2; shift ;;
		--report-only) REPORT_ONLY=1 ;;
		--shuffle) SHUFFLE=$2; shift ;;
		--isolate) ISOLATE=1 ;;
		--tier) TIER=$2; shift ;;
		--retake) ;;
		*) sed -n 2,22p "$0"; exit 2 ;;
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
		# the window at the page's design size (1440 x 924, as the page tier and the pictures): the background run's
		# small window zooms the page below 100 %, where WebKit lays 9 px text out at 15 px (its minimum logical font
		# size), so every fit check would measure a page no person sees at full size (0.6 e2e: md/mm-screens-fit)
		GEARMULATOR_MDMM_BACKGROUND_SIZE=${GEARMULATOR_MDMM_BACKGROUND_SIZE:-1440x924} \
		GEARMULATOR_MDMM_BACKGROUND_METER=1 GEARMULATOR_MDMM_SYX_FILE="$OUT/fixtures/$M.syx" GEARMULATOR_MDMM_WAV_FILE="$OUT/fixtures/e2e.wav" GEARMULATOR_MDMM_SAMPLE_EXPORT="$OUT/fixtures/sample-export" \
		MDMM_JOURNEY_TIMEOUT=${MDMM_JOURNEY_TIMEOUT:-3600} MDMM_JOURNEY_SETTINGS=fresh MDMM_JOURNEY_E2E=1 MDMM_JOURNEY_OUT="$RUN/$M" \
			scripts/mdmm-journeys.sh --background --jobs "$JOBS" ${TIER:+--tier "$TIER"} ${SHUFFLE:+--shuffle "$SHUFFLE"} $( [ "$ISOLATE" = 1 ] && echo --isolate ) "$M" "$SEL" > "$OUT/journeys-$M.log" 2>&1 &
		PIDS="$PIDS $!"
	done
	for p in $PIDS; do wait "$p" || { echo "a journey job failed (pid $p, exit $?)"; RC=1; }; done
	tail -qn 1 "$OUT"/journeys-*.log
fi
PAGEARGS=()
if [ $REPORT_ONLY = 1 ] && [ -d "$OUT/page" ]; then PAGEARGS=(--page "$OUT/page")
elif [ $PAGE = 1 ]; then
	cmake --build "$ROOT/temp/dev" --target deskStubHost > "$OUT/stubhost-build.log" 2>&1 || { echo "deskStubHost did not build: $OUT/stubhost-build.log"; exit 1; }
	MDMM_STUB_HOST="$ROOT/temp/dev/source/elektron/md/deskStubHost/deskStubHost" node scripts/mdmm-page.mjs --jobs 2 ${SHUFFLE:+--shuffle "$SHUFFLE"} $( [ "$ISOLATE" = 1 ] && echo --isolate ) --out "$OUT/page" "$WHICH" "$SEL" > "$OUT/page.log" 2>&1 || { echo "the page tier failed: $OUT/page.log"; RC=1; }
	tail -2 "$OUT/page.log"
	PAGEARGS=(--page "$OUT/page")
fi
# the pictures: each unit's page log, in parallel
RAW="$OUT/raw"; rm -rf "$RAW"; mkdir -p "$RAW"; rm -f "$OUT"/shots/*.webp
find "$RUN" "$OUT/run-fix" -name page.log 2>/dev/null | xargs -P 4 -I{} python3 scripts/mdmm-snap.py "$RAW" {} > "$OUT/snap.log" 2>&1
python3 scripts/mdmm-e2e-webp.py "$RAW" "$OUT/shots" | tee "$OUT/shots.size"
rm -rf "$RAW"
FW=""; for r in "$HOME/Documents/Gearmulator Preview/Machinedrum/roms/"* "$HOME/Documents/Gearmulator Preview/Monomachine/roms/"*; do FW="$FW $(basename "$r")"; done
export MDMM_E2E_VERSION=$VERSION MDMM_E2E_COMMIT=$(git rev-parse --short HEAD) MDMM_E2E_FIRMWARE="${GEARMULATOR_MD_FIRMWARE_BIN:+$(basename "$GEARMULATOR_MD_FIRMWARE_BIN") }${GEARMULATOR_MM_FIRMWARE_BIN:+$(basename "$GEARMULATOR_MM_FIRMWARE_BIN")}${FW}"
ARGS=(--out "$OUT" ${PAGEARGS[@]+"${PAGEARGS[@]}"})
# a full run (every journey, every tier) must find every journey of its machines; a part of a run lists the rest as "not selected"
if [ "$SEL" = journey ] && [ -z "$TIER" ] && [ $REPORT_ONLY = 0 ]; then ARGS+=(--full --machines "$WHICH"); fi
[ $WRITE = 1 ] && ARGS+=(--write-data)
FIX=(); [ -d "$OUT/run-fix" ] && FIX=("$OUT/run-fix")
# macOS bash 3.2 with set -u: an empty array is "unbound", hence the ${X[@]+...} form
node scripts/mdmm-e2e.mjs "${ARGS[@]}" "$RUN" ${FIX[@]+"${FIX[@]}"} || { echo "the report says FAIL"; RC=1; }
echo "done in $(( $(date +%s) - START )) s, exit $RC"
exit $RC
