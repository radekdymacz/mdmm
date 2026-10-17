#!/bin/sh
# B-014: the audio thread's work while the editors edit, measured headless with the firmware (no window, no audio
# device, no sound), as a pass/fail check. The emulator, the desk and the page's commands run as the plug-in runs
# them, one audio block at a time on this thread; the cost is counted in retired instructions, so what else the
# computer runs does not change it.
#   scripts/mdmm-rt-check.sh [--md <MD ROM>] [--mm <MM ROM>] [--build <dir>] [--budget <hot ms/s>] [--plock] [--lock] [--load N] [VAR=value ...]
#     --md / --mm   the ROMs (default: the plug-ins' ROM folders); only read
#     --budget      fail any user action whose blocks run hot (a 5-block mean over 1.3x idle) longer than this
#                   many ms a second (default 100; the stream keeps every action under about 75)
#     --plock       also mdDeskFirmwareTest plocktiming-strict (B-010's sequencer timing, B-014's per-block tables)
#     --lock        also the synth lock (the F2 gate, architecture review 1): mdEditFlowPluginTest, the real processor
#                   with its audio thread at real time and the page's edits on the message thread, per machine; fails
#                   when processBlock waited longer than EDITFLOW_LOCK_WAIT_MS (default 1 ms) for the device lock.
#                   Wall time, so run it on a quiet Mac; a few minutes a machine. It also fails when the
#                   processor counted a dropped panel event (the desk's sends) or a dropped device command (the queue
#                   the desk's sends go through, DESIGN-audio-lock.md step 3) while editing. Each wait is blamed
#                   on the holder's site (file:line of the withDeviceLocked or plugin.cpp hold). The run has MIDI Learn on
#                   (EDITFLOW_LEARN=1, 0.8 L6): four mappings, learned CCs at audio rate and then a burst of 64 a block beside
#                   the edits and the transport; it fails too when the router applied nothing or dropped a captured CC
#     --load N      N busy loops run beside the checks (a busy Mac on purpose, so the --lock result does not depend
#                   on what else the Mac runs); the load average is printed before and after each result
#     VAR=value     passed on: GEARMULATOR_MDMM_EDIT_RATE=0 measures without the stream (0.3.3), ACTIONS=a,b
#                   only some actions, PLOCK_* for plocktiming (mdDeskFirmwareTest.cpp)
# Per action (mdDeskFirmwareTest / mmDeskFirmwareTest actions): what went to the machine, the 128- and 256-frame host
# buffers a second whose work is over 50 / 100 M instructions (idle: about 27 / 55), the hot time a second and the
# worst 256-frame buffer. Output and traces go to a temporary folder (printed at the end).
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)
MD=$(ls "$HOME/Documents/Gearmulator Preview/Machinedrum/roms/"* 2>/dev/null | head -1)
MM=$(ls "$HOME/Documents/Gearmulator Preview/Monomachine/roms/"* 2>/dev/null | head -1)
BUILD=$ROOT/temp/mac_perf
BUDGET=100
PLOCK=0
LOCK=0
LOAD=0
while [ $# -gt 0 ]; do
	case "$1" in
		--md) MD=$2; shift 2 ;;
		--mm) MM=$2; shift 2 ;;
		--build) BUILD=$2; shift 2 ;;
		--budget) BUDGET=$2; shift 2 ;;
		--plock) PLOCK=1; shift ;;
		--lock) LOCK=1; shift ;;
		--load) LOAD=$2; shift 2 ;;
		*) break ;;
	esac
done
find_bin() { find "$BUILD" -name "$1" -type f -perm +111 | head -1; }
MDBIN=$(find_bin mdDeskFirmwareTest)
MMBIN=$(find_bin mmDeskFirmwareTest)
OUT=$(mktemp -d)
mkdir -p "$OUT/data"
STATUS=0
# the load average (1 minute): sysctl on macOS, /proc on Linux
loadavg() { if [ -r /proc/loadavg ]; then cut -d' ' -f1 /proc/loadavg; else sysctl -n vm.loadavg | awk '{print $2}'; fi; }
LOADPIDS=""
stop_load() { [ -n "$LOADPIDS" ] && kill $LOADPIDS 2>/dev/null; LOADPIDS=""; }
trap stop_load EXIT INT TERM
if [ "$LOAD" -gt 0 ] 2>/dev/null; then
	i=0
	while [ "$i" -lt "$LOAD" ]; do
		sh -c 'while :; do :; done' &
		LOADPIDS="$LOADPIDS $!"
		i=$((i + 1))
	done
	echo "load: $LOAD busy loops (load average $(loadavg))"
	sleep 5
fi
if [ -n "$MD" ] && [ -x "$MDBIN" ]; then
	env GEARMULATOR_DATA_ROOT="$OUT/data" ACTIONS_BUDGET="$BUDGET" "$@" "$MDBIN" "$MD" actions > "$OUT/md-actions.txt" 2>&1 || STATUS=1
	grep -E "^== B-014|^  [a-zA-Z]+ +[0-9]+ \||FAIL|actions:" "$OUT/md-actions.txt"
	if [ "$PLOCK" = 1 ]; then
		mkdir -p "$OUT/trace"
		env GEARMULATOR_DATA_ROOT="$OUT/data" PLOCK_TRACE="$OUT/trace" "$@" "$MDBIN" "$MD" plocktiming-strict > "$OUT/md-plock.txt" 2>&1 || STATUS=1
		grep -E "^== |^  [a-z0-9]+ |clock:|Minstr/|FAIL|plocktiming" "$OUT/md-plock.txt" | cut -c1-200
	fi
else
	echo "MD: no ROM or no mdDeskFirmwareTest in $BUILD (cmake --build $BUILD --target mdDeskFirmwareTest)"; STATUS=1
fi
if [ -n "$MM" ] && [ -x "$MMBIN" ]; then
	env GEARMULATOR_DATA_ROOT="$OUT/data" ACTIONS_BUDGET="$BUDGET" "$@" "$MMBIN" "$MM" actions > "$OUT/mm-actions.txt" 2>&1 || STATUS=1
	grep -E "^== B-014|^  [a-zA-Z]+ +[0-9]+ \||FAIL|^PASS" "$OUT/mm-actions.txt"
else
	echo "MM: no ROM or no mmDeskFirmwareTest in $BUILD (cmake --build $BUILD --target mmDeskFirmwareTest)"; STATUS=1
fi
if [ "$LOCK" = 1 ]; then
	FLOWBIN=$(find_bin mdEditFlowPluginTest)
	for m in md mm; do
		rom=$MD; [ "$m" = mm ] && rom=$MM
		if [ -z "$rom" ] || [ ! -x "$FLOWBIN" ]; then
			echo "lock $m: no ROM or no mdEditFlowPluginTest in $BUILD (cmake --build $BUILD --target mdEditFlowPluginTest)"; STATUS=1; continue
		fi
		before=$(loadavg)
		env GEARMULATOR_DATA_ROOT="$OUT/data" EDITFLOW_LEARN=1 "$@" "$FLOWBIN" "$m" "$rom" > "$OUT/$m-lock.txt" 2>&1 || STATUS=1
		line=$(grep "^synth lock wait" "$OUT/$m-lock.txt")
		[ -n "$line" ] || { line="synth lock wait: no result (see $OUT/$m-lock.txt): FAIL"; STATUS=1; }
		echo "lock $m: $line (load average $before to $(loadavg), $LOAD busy loops)"
		grep -E "^learn:|^learned CCs|^dropped panel events|^dropped device commands|^  lock (wait blamed|held at)" "$OUT/$m-lock.txt" | sed "s/^ */lock $m: /"
	done
fi
stop_load
sysctl -n machdep.cpu.brand_string 2>/dev/null || grep -m1 "model name" /proc/cpuinfo
echo "output: $OUT"
[ "$STATUS" = 0 ] && echo "rt-check: PASS (budget $BUDGET ms/s)" || echo "rt-check: FAIL"
exit $STATUS
