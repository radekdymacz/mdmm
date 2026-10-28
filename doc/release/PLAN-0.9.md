# Plan 0.9: the full-feature release

Radek, 2026-10-28: after the 0.8.1 fixes, build everything a full-feature 1.0 needs, as 0.9. Source: the 1.0 feature
check of 2026-10-28 (feature rows in doc/features/md.json and mm.json, ROADMAP section 6, BUGS.md, IDEAS.md).
DigiPRO user waveforms are in (Radek, "all of it").

0.8.1 ships first: the 2026-10-21 Discord batch, the nightly journey repairs, the shorter project-state lock hold
and three upstream fixes (BUGFIX-HANDOFF-2026-10-21.md). 0.9 branches from that.

## Waves

Each feature gets a short spec in doc/release/0.9/ before code (hammock: spec, then build), its own branch
`feat/0.9-<name>`, journeys or firmware tests in the existing style, and the feature rows updated. Validation on CI.

| # | Feature | Rows / bugs | Size | Needs |
|---|---|---|---|---|
| 1 | MD sample manager: erase one or all, copy / paste / clear with undo, RAM to ROM copy, slot sizes and memory left, export to WAV | MD-193, 194, 196, 198, 199 | M | firmware (UW) |
| 2 | MM DigiPRO user waveform manager (MKII): send, receive, erase, rename, copy between Digibanks; 0x5D / 0x5E dumps | MM-010, 310, 378 | L | firmware (MKII) |
| 3 | MM song LOOP row returns to row 1 | B-038 | M | firmware |
| 4 | Undo for SysEx import and Empty Reset; the import pattern pick question | B-130, B-045 | M | page, desk |
| 5 | MM encoding and defaults from the firmware | B-176, B-175, B-166, B-189 | S | firmware test results |
| 6 | Stability: Windows crackle and freeze, Linux black window | B-156, B-036, B-035, B-172, B-153 | L | Windows CI run, tester logs |
| 7 | Hardware MIDI on a real MD and MM, or labelled beta | ROADMAP gate | M-L | Radek's machines |
| 8 | Signed and notarised macOS packages, pluginval and auval green | ROADMAP gate | S | Apple account |
| 9 | Fresh E2E evidence (the e2e-md/mm.json rows are from 0.5.1); order-dependent journeys | B-132, B-160 | M | CI |
| 10 | Housekeeping: ROADMAP section 6 refreshed (F3, F4, F6, F7, F10, F11, F13 are built), VISION.md and DESIGN.md | | S | |

Waves 1 to 5 can be built now. 6 to 8 wait on logs, machines or the Apple account. 9 and 10 close the release.

## Not in 0.9

The other ideas in IDEAS.md (about 40), F9, F12, F15. No auto-update install (Radek, 2026-10-15).
