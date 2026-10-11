#!/bin/bash
# The nightly full gate on main, and the release rule that rests on it (doc/release/DEV-CYCLE.md; decision 2026-10-11:
# a local schedule on this Mac, not a GitHub runner). launchd starts it at night (scripts/macos/mdmm-nightly.plist);
# it runs scripts/mdmm-local-gate.sh on main as origin has it, in a worktree of its own, when the Mac is quiet.
#
#   scripts/mdmm-nightly.sh              the nightly run (nothing when main did not change since the last run)
#   scripts/mdmm-nightly.sh --force      run although that commit ran already
#   scripts/mdmm-nightly.sh --plan       the release rule for HEAD: the last green nightly, and the gate stages the
#                                        diff since it needs (MDMM_GATE_ONLY), as one command to run
#   scripts/mdmm-nightly.sh --status     the last runs
#   scripts/mdmm-nightly.sh --install    how to install the launchd job (prints the commands; installs nothing)
#
# State in <checkout>/temp/nightly: history.tsv (date, commit, verdict, minutes, summary), last-green (the commit of the
# last green run), runs/<date>-<commit>/ (the gate's run folders), main/ (the worktree, its build tree kept for
# ccache and the next night). Sundays add the soak (--soak). Waits up to MDMM_NIGHTLY_WAIT minutes (default 120) for a
# quiet Mac (load under a quarter of the cores) and runs only on mains power. MDMM_NIGHTLY_REF: what to test (default
# origin/main, fetched; main when the fetch fails). The ROMs as the gate takes them. A red run says so in a macOS
# notification; nothing leaves this Mac.
set -u -o pipefail
here="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "${here}/.." && pwd)"
STATE="${ROOT}/temp/nightly"
WT="${STATE}/main"
mkdir -p "${STATE}/runs"
HISTORY="${STATE}/history.tsv"
[ -f "${HISTORY}" ] || printf 'date\tcommit\tverdict\tminutes\tsummary\n' > "${HISTORY}"

note() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
notify() { osascript -e "display notification \"$1\" with title \"MD + MM nightly gate\"" > /dev/null 2>&1 || true; }

case "${1:-}" in
	--status)
		column -t -s $'\t' "${HISTORY}" | tail -n 15
		[ -f "${STATE}/last-green" ] && echo "last green: $(cat "${STATE}/last-green")"
		exit 0 ;;
	--install)
		cat <<EOF
The nightly job (launchd, your user only; it runs at 02:30, or at the next wake when the Mac slept through it):

  mkdir -p "${ROOT}/temp/nightly"
  sed -e "s#__ROOT__#${ROOT}#g" -e "s#__HOME__#\${HOME}#g" "${ROOT}/scripts/macos/mdmm-nightly.plist" \\
    > ~/Library/LaunchAgents/com.futurenativeaudio.mdmm-nightly.plist
  launchctl bootstrap gui/\$(id -u) ~/Library/LaunchAgents/com.futurenativeaudio.mdmm-nightly.plist

Try it at once:   launchctl kickstart -k gui/\$(id -u)/com.futurenativeaudio.mdmm-nightly
Its output:       ${STATE}/launchd.log
Remove it:        launchctl bootout gui/\$(id -u)/com.futurenativeaudio.mdmm-nightly && rm ~/Library/LaunchAgents/com.futurenativeaudio.mdmm-nightly.plist
EOF
		exit 0 ;;
	--plan)
		green="$(cat "${STATE}/last-green" 2> /dev/null)"
		if [ -z "${green}" ]; then
			echo "no green nightly yet: run the full gate (scripts/mdmm-local-gate.sh)"
			exit 1
		fi
		if ! git -C "${ROOT}" merge-base --is-ancestor "${green}" HEAD 2> /dev/null; then
			echo "the last green nightly (${green}) is not in this branch's history: run the full gate (scripts/mdmm-local-gate.sh)"
			exit 1
		fi
		when="$(awk -F'\t' -v c="${green}" '$2 == c && $3 == "green" { d = $1 } END { print d }' "${HISTORY}")"
		echo "last green nightly: ${green} (${when:-?}); HEAD $(git -C "${ROOT}" rev-parse --short=12 HEAD), $(git -C "${ROOT}" rev-list --count "${green}..HEAD") commit(s) since"
		plan="$(python3 "${here}/mdmm-check.py" --gate-plan "${green}")" || exit 1
		printf '%s\n' "${plan}" | grep '^#' | sed 's/^# /  /'
		stages="$(printf '%s\n' "${plan}" | tail -n 1)"
		echo "the release's gate: the stages this diff touches, on top of that nightly:"
		echo "  MDMM_GATE_ONLY=\"${stages}\" scripts/mdmm-local-gate.sh"
		exit 0 ;;
	--force|"") ;;
	*) sed -n '2,/^set -u/p' "$0" | sed '$d; s/^# \{0,1\}//' >&2; exit 2 ;;
esac

# one run at a time
LOCK="${STATE}/lock"
if ! mkdir "${LOCK}" 2> /dev/null; then
	note "another nightly run holds ${LOCK} (remove it if none runs)"
	exit 0
fi
trap 'rmdir "${LOCK}" 2> /dev/null' EXIT

REF="${MDMM_NIGHTLY_REF:-origin/main}"
if [ "${REF}" = origin/main ] && ! git -C "${ROOT}" fetch --quiet origin main 2> /dev/null; then
	note "fetch failed: testing the local main"
	REF=main
fi
COMMIT="$(git -C "${ROOT}" rev-parse --short=12 "${REF}")" || { note "no ${REF}"; exit 1; }
if [ "${1:-}" != --force ] && awk -F'\t' -v c="${COMMIT}" 'NR > 1 && $2 == c { found = 1 } END { exit !found }' "${HISTORY}"; then
	note "main (${COMMIT}) ran already: nothing to do"
	exit 0
fi

# a quiet Mac on mains power
if pmset -g batt 2> /dev/null | grep -q "Battery Power"; then
	note "on battery: not tonight"
	printf '%s\t%s\tskipped\t0\ton battery\n' "$(date '+%Y-%m-%d %H:%M')" "${COMMIT}" >> "${HISTORY}"
	exit 0
fi
cores="$(sysctl -n hw.ncpu)"
waited=0
while :; do
	load="$(sysctl -n vm.loadavg | awk '{print $2}')"
	awk -v l="${load}" -v c="${cores}" 'BEGIN { exit !(l < c / 4) }' && break
	if [ "${waited}" -ge "${MDMM_NIGHTLY_WAIT:-120}" ]; then
		note "the Mac stayed busy (load ${load}) for ${waited} minutes: not tonight"
		printf '%s\t%s\tskipped\t0\tbusy Mac (load %s)\n' "$(date '+%Y-%m-%d %H:%M')" "${COMMIT}" "${load}" >> "${HISTORY}"
		exit 0
	fi
	note "busy (load ${load} on ${cores} cores): waiting"
	sleep 300
	waited=$((waited + 5))
done

# the worktree at that commit (its build tree stays for the next night)
if [ ! -d "${WT}/.git" ] && [ ! -f "${WT}/.git" ]; then
	git -C "${ROOT}" worktree add --detach "${WT}" "${COMMIT}" > /dev/null 2>&1 || { note "worktree add failed"; exit 1; }
else
	git -C "${WT}" checkout --quiet --detach "${COMMIT}" || { note "checkout of ${COMMIT} failed"; exit 1; }
fi
git -C "${WT}" submodule update --init --quiet

RUN="${STATE}/runs/$(date +%Y%m%d-%H%M)-${COMMIT}"
args=()
[ "$(date +%u)" = 7 ] && args+=(--soak)
note "gate on ${COMMIT} -> ${RUN}"
start=${SECONDS}
caffeinate -i -s "${WT}/scripts/mdmm-local-gate.sh" ${args[@]+"${args[@]}"} --out "${RUN}" > "${RUN}.log" 2>&1
status=$?
minutes=$(( (SECONDS - start + 59) / 60 ))
verdict=red
[ "${status}" = 0 ] && verdict=green
printf '%s\t%s\t%s\t%s\t%s\n' "$(date '+%Y-%m-%d %H:%M')" "${COMMIT}" "${verdict}" "${minutes}" "${RUN}/summary.md" >> "${HISTORY}"
if [ "${verdict}" = green ]; then
	echo "${COMMIT}" > "${STATE}/last-green"
	note "green in ${minutes} min"
else
	note "RED in ${minutes} min: ${RUN}/summary.md"
	notify "main ${COMMIT} is red: ${RUN}/summary.md"
fi
exit "${status}"
