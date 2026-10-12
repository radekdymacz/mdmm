#!/bin/sh
# The development cycle's checks, chosen by what changed (doc/release/DEV-CYCLE.md; the map: scripts/mdmm-affected.tsv).
#
#   scripts/mdmm-check.sh [--save | --quick | --branch] [--dry-run] [--files <path>...]
#   scripts/mdmm-check.sh --watch
#
#   --save    tier 0, on each save (under 30 s): what is not committed yet. The page contract when a page or the
#             schema changed, the unit tests of what changed (built first; the node page tests for a page file),
#             without the Slow and Timing ones
#   --quick   tier 1, "did I break it", the default (under 2 min): what changed since main and is not committed yet.
#             Tier 0 with the Slow and Timing tests, the page journeys of that area (scripts/mdmm-page.mjs, no ROM),
#             one playing golden per machine when emulation code changed (ROM)
#   --branch  tier 2, before a merge, in the background (under 10 min): every unit test, every page journey, the
#             firmware tests (their programs built first, so none runs stale) and the machine journeys of the area (scripts/mdmm-journeys.sh --tier machine), every
#             golden when emulation code changed (the last three need the ROMs; skipped and said without them)
#   --watch   tier 0 again each time a file under source/elektron, source/synthLib, source/baseLib, doc/modern-ux or
#             scripts is saved (node's fs.watch; no fswatch or entr needed)
#   --dry-run what would run, and which row of the map each file took
#   --files   these paths instead of git's
# The build tree is scripts/mdmm-dev.sh's (temp/dev, MDMM_DEV_BUILD); it is configured when there is none. The ROMs:
# GEARMULATOR_MD_FIRMWARE_BIN / GEARMULATOR_MM_FIRMWARE_BIN, else ~/Documents/Gearmulator Preview/<machine>/roms.
# MDMM_CHECK_BASE: the branch to compare with (default main). Exit status: 0 green, 1 a check failed.
case "${1:-}" in -h|--help) sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;; esac
exec python3 "$(cd "$(dirname "$0")" && pwd)/mdmm-check.py" "$@"
