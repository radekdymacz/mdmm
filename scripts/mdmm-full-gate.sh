#!/bin/bash
# The full local gate on main, run by hand, and the release rule that rests on it (doc/release/DEV-CYCLE.md; Radek,
# 2026-10-11: no scheduled job, Claude runs it when the Mac is quiet, e.g. at the start of a release or after a big
# merge). It runs scripts/mdmm-local-gate.sh on main as origin has it, in a worktree of its own, and keeps the record a
# release reads.
#
#   scripts/mdmm-full-gate.sh            the full gate on main (refused when the Mac is busy; --busy-ok runs anyway)
#   scripts/mdmm-full-gate.sh --soak     the same with the soak (6c, 21 minutes more)
#   scripts/mdmm-full-gate.sh --plan     the release rule for HEAD: the last green full gate on main, and the gate stages
#                                        the diff since it needs (MDMM_GATE_ONLY), as one command to run
#   scripts/mdmm-full-gate.sh --status   the last runs
#
# State in <checkout>/temp/full-gate: history.tsv (date, commit, verdict, minutes, summary), last-green (the commit of
# the last green run), runs/<date>-<commit>/ (the gate's run folders), main/ (the worktree; its build tree stays, for
# ccache and the next run). MDMM_FULL_GATE_REF: what to test (default origin/main, fetched; main when the fetch fails).
# The ROMs as the gate takes them. Nothing leaves this Mac.
set -u -o pipefail
here="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "${here}/.." && pwd)"
STATE="${ROOT}/temp/full-gate"
WT="${STATE}/main"
mkdir -p "${STATE}/runs"
HISTORY="${STATE}/history.tsv"
[ -f "${HISTORY}" ] || printf 'date\tcommit\tverdict\tminutes\tsummary\n' > "${HISTORY}"

note() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

SOAK=0; BUSY_OK=0
for arg in "$@"; do
	case "${arg}" in
		--status)
			column -t -s $'\t' "${HISTORY}" | tail -n 15
			[ -f "${STATE}/last-green" ] && echo "last green: $(cat "${STATE}/last-green")"
			exit 0 ;;
		--plan)
			green="$(cat "${STATE}/last-green" 2> /dev/null)"
			if [ -z "${green}" ]; then
				echo "no green full gate on main yet: run scripts/mdmm-full-gate.sh (or the full scripts/mdmm-local-gate.sh here)"
				exit 1
			fi
			if ! git -C "${ROOT}" merge-base --is-ancestor "${green}" HEAD 2> /dev/null; then
				echo "the last green full gate (${green}) is not in this branch's history: run the full scripts/mdmm-local-gate.sh"
				exit 1
			fi
			when="$(awk -F'\t' -v c="${green}" '$2 == c && $3 == "green" { d = $1 } END { print d }' "${HISTORY}")"
			echo "last green full gate on main: ${green} (${when:-?}); HEAD $(git -C "${ROOT}" rev-parse --short=12 HEAD), $(git -C "${ROOT}" rev-list --count "${green}..HEAD") commit(s) since"
			plan="$(python3 "${here}/mdmm-check.py" --gate-plan "${green}")" || exit 1
			printf '%s\n' "${plan}" | grep '^#' | sed 's/^# /  /'
			stages="$(printf '%s\n' "${plan}" | tail -n 1)"
			echo "the release's gate: the stages this diff touches, on top of that run:"
			echo "  MDMM_GATE_ONLY=\"${stages}\" scripts/mdmm-local-gate.sh"
			exit 0 ;;
		--soak) SOAK=1 ;;
		--busy-ok) BUSY_OK=1 ;;
		*) sed -n '2,/^set -u/p' "$0" | sed '$d; s/^# \{0,1\}//' >&2; exit 2 ;;
	esac
done

# one run at a time
LOCK="${STATE}/lock"
if ! mkdir "${LOCK}" 2> /dev/null; then
	note "another full gate holds ${LOCK} (remove it if none runs)"
	exit 1
fi
trap 'rmdir "${LOCK}" 2> /dev/null' EXIT

# a quiet Mac: the timing stages fail from load alone
cores="$(sysctl -n hw.ncpu)"
load="$(sysctl -n vm.loadavg | awk '{print $2}')"
if [ "${BUSY_OK}" != 1 ] && ! awk -v l="${load}" -v c="${cores}" 'BEGIN { exit !(l < c / 4) }'; then
	note "the Mac is busy (load ${load} on ${cores} cores): run the full gate when it is quiet (--busy-ok runs it anyway)"
	exit 1
fi

REF="${MDMM_FULL_GATE_REF:-origin/main}"
if [ "${REF}" = origin/main ] && ! git -C "${ROOT}" fetch --quiet origin main 2> /dev/null; then
	note "fetch failed: testing the local main"
	REF=main
fi
COMMIT="$(git -C "${ROOT}" rev-parse --short=12 "${REF}")" || { note "no ${REF}"; exit 1; }

# the worktree at that commit (its build tree stays for the next run)
if [ ! -e "${WT}/.git" ]; then
	git -C "${ROOT}" worktree add --detach "${WT}" "${COMMIT}" > /dev/null 2>&1 || { note "worktree add failed"; exit 1; }
else
	git -C "${WT}" checkout --quiet --detach "${COMMIT}" || { note "checkout of ${COMMIT} failed"; exit 1; }
fi
git -C "${WT}" submodule update --init --quiet

RUN="${STATE}/runs/$(date +%Y%m%d-%H%M)-${COMMIT}"
args=()
[ "${SOAK}" = 1 ] && args+=(--soak)
note "full gate on main ${COMMIT} -> ${RUN} (log ${RUN}.log)"
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
fi
exit "${status}"
