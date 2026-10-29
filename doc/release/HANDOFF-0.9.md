# Handoff: start of 0.9 (2026-10-29)

Read this first in a new session. The plan is [PLAN-0.9.md](PLAN-0.9.md); each feature's spec is in doc/release/0.9/.

## Where things stand

- **0.8.1 is released** (2026-10-29): tag `mdmm-v0.8.1` on `5f834c7be`, GitHub release published (9 files, unsigned as
  every release so far), mdmm.dev deployed, #announcements posted by the site workflow. Notes: [v0.8.1.md](v0.8.1.md).
- **main** has 0.8.1, the site files and the last BUGS entries. `codex/continue-0.8.0` and `release/0.8.1` are done;
  new work branches from main.
- **History rewrite (2026-10-28):** `artifacts/` was removed from all history and every commit ID changed. Old clones
  must be cloned again. Backup of the old history: `~/mdmm-backup-2026-10-28.git` (with `rewrite-commit-map`, old ID to
  new ID). Details: [BUGFIX-HANDOFF-2026-10-21.md](BUGFIX-HANDOFF-2026-10-21.md), "History rewrite".
- Local worktrees left: `~/mdmm-rel` (old local build, one unsaved change), `~/mdmm-site` (clean main used for the site
  deploy; can be removed), `~/.codex/worktrees/ultralight-spike` (Codex's, do not touch).

## The 0.9 branches (built, not merged; each is 20 to 22 commits behind main)

| Wave | Branch | State | Next step |
|---|---|---|---|
| 1 | `feat/0.9-md-sample-manager` | copy, paste, RAM to ROM, rename, undo (16 steps), WAV and SDS .syx export, memory line and sizes; journeys, guide, feature rows | merge main in; CI. Erase one / erase all / Clear are **not built**: the firmware has no SysEx for it, only the panel route. Radek approved in principle an LCD probe on a `release/*` branch (spec "The erase probe: plan"). Until then MD-194 is missing and MD-198 partial. |
| 2 | `feat/0.9-mm-digipro` | DigiPRO MGR session, GLOBAL page card, 4 page journeys pass, firmware test written | merge main in; the firmware test `mmDigiproManagerFirmwareTest` has never run (ROMs reach only main and release/*), so the feature rows are marked done **before** the firmware proof: run it, fix, then trust the rows. Spec 7.2 has no firmware test yet. Make a screen mock-up of the card for Radek before the merge. |
| 3 | `feat/0.9-mm-song-loop` | B-038: the song row's loop target is row byte 3 | merge main in; firmware run. |
| 4 | `feat/0.9-import-undo` | B-130, B-045: SysEx import and Empty Reset are one undo step; unread slots are read before the job | merge main in; CI. Open for Radek: may the import and reset journeys stop being `alone: true`? |
| 5 | not started | MM encoding and defaults from the firmware (B-176, B-175, B-166, B-189 OJMP bit layout) | spec, then a firmware check of OJMP before any encoding change. |
| 6 to 8 | not started | Windows and Linux stability, hardware MIDI, signing | wait on tester logs, Radek's machines, the Apple account. |
| 9, 10 | not started | fresh E2E evidence, ROADMAP section 6, housekeeping | close the release. |

Suggested order: merge main into each branch, run `mdmm-ci.yml` on it by hand, then merge into main one at a time
(firmware runs on main push). DigiPRO and the sample-manager erase probe need a `release/*` branch or main for their
firmware runs (`release/0.0.0-ci-test` is the free one).

## Open bugs to fix early in 0.9

- **Release workflow, SHA256SUMS job** (`.github/workflows/mdmm-editors-release.yml`): it finds the release by
  `tag_name`, but a draft's `tag_name` is `untagged-...`, so it fails on every tag run. 0.8.1's SHA256SUMS was made by
  hand. Find the draft by name or by the id the macOS job made.
- **Flaky firmware tests** (each passed on a re-run of the same commit): B-192 (MM global change not saved while the
  editor still reads, "machine memory file is busy" retries; the test now waits, the product case is not explained),
  B-193 (MD knob drag disturbed by a late kit load; older than 0.8.1), B-194 (MM follow played track after a key-split
  toast). The nightly firmware run on main has failed every night since 0.8.0 on such tests.
- B-189 (OJMP maybe twice the value) belongs to wave 5.

## Rules that still hold

All validation on CI (CLAUDE.md "Development lifecycle"); poll runs slowly (every 300 s; the API rate limit was hit).
Lock-hold CI budget stays 10 ms. Testers are never named. Every Discord post is shown to Radek first. No tag, publish
or site deploy without his OK. The coordinator delegates; helpers work in worktrees and push branches; remove a worktree
when its branch is merged.
