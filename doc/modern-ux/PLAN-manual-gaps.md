# Plan: build the manual gaps (the waves of 0.6)

- 2026-10-11. The design is [DESIGN-machine-menus.md](DESIGN-machine-menus.md) (approved). The work list is the ❌ and
  🟡 rows of [FEATURE-MAP-MD.md](FEATURE-MAP-MD.md) and [FEATURE-MAP-MM.md](FEATURE-MAP-MM.md), checked against main at
  0.5.0. In `doc/release/PLAN-0.6.md` this is **slice 8, "build the gaps, wave by wave"**; the design review stood in
  for most of slice 7's triage (the exceptions are §4 of the design).
- Each wave: one branch from main, both editors where both have the feature, its journeys (with `proves:` once the
  0.6 feature data exists), its FEATURE-MAP rows flipped, played and accepted by Radek (dev loop), merged.
- Checks: level 2 of CLAUDE.md's lifecycle only (the area's journeys in the background, unit tests for shared code,
  `--write-schema` + `page_contract_check.py`). Implementation by subagents; the coordinator briefs and reviews.

## Facts the waves rely on

- The page is the only UI. Over HW MIDI the editor sends only Start (0xFA) and Stop (0xFC); the emulator has panel
  keys (MD `mdpanelsequence.cpp`, MM the closed `Key` enum) but no FUNCTION chords and no MD EXIT.
- MM dumps (pattern, song, global, stored kit) need SYSEX RECV (the emulator drives it; HW waits as "SEND n"); a
  global dump applies after 0x56.
- Already in the data or the command table: MD `level` (no page caller), pattern `swing{editAll,steps}`,
  `tracks[t].swing`, `accent.editAll`, `slide.editAll`, kit `lfo`, song `name`; MM `saveSong` (0x6D, no page
  caller), global `masterTune`. Missing builders: MD 0x6D save song, 0x6B set receive position, 0x64 reset map;
  realtime Continue 0xFB and SPP 0xF2 in `deskWire.h`.

## Waves

| # | Wave | Contents (design §2 rows) | Depends | Size |
|---|---|---|---|---|
| P | **Probes** | P1 SPP + Continue in song and pattern mode (MD, MM); P2 MM CONTROL OUT 1 bytes; P3 MD trig in A/B bytes; P4 MM DigiPRO 0x5D/0x5E on the emulator; P5 MD what Stop twice over MIDI does; P6 MD `mdfactorybaseline` holds full data. Report `doc/modern-ux/PROBES-manual-gaps.md`, map rows updated | – | M |
| 1 | **Song slots** | the Song page's slots column (load, save with name, save to, copy, paste, clear, rename) and the PATTERN · CHAIN · SONG switch with one palette; core song slot ops on `deskEdits.h` `library`; MD 0x6D builder | – | M-L |
| 2 | **Transport** | pause (+ Continue 0xFB), panic, TEMPO pop-up (nudge, change on release), ▶ right-click menu; play from a song row after P1 | P (for HW pause, play-from) | M |
| 3 | **Trig types (MD) and marks (MM)** | the legend selector, swing steps (`swingTrig`), EDIT ALL (`markMode`), track dots (`markTrack`); MM Note · Slide · Swing row | – | M |
| 4 | **Copy / paste / clear what** | the ▾ dialogs, `trackCopy / trackPaste / trackClear {what}` in `deskEdits.h` (per-machine `what` lists), MM melody and whole-track copy, MD LFO ⋯ menu | – | M |
| 5 | **GLOBAL leftovers** | GLOBAL as a full page, slot copy / paste / clear (both), MD LEARN (`midiIn` note message, also I-002) and Reset map, MM master tune; MM CONTROL OUT 1 and MD trig in after P2 / P3 | P (parts) | M |
| 6 | **SysEx and reset** | export kinds and ranges (`exportSyx {kinds, ranges}`), import SPECIFIC (`placeAt`) with the landing preview and the overwrite warning, VERIFY ONLY (`checkOnly`), Reset machine… (empty; MD factory after P6); MM DigiPRO kind after P4 | P (parts) | M |
| 7 | **Recording** | live-record erase (hold Delete), MM step recording | – | M |
| 8 | **MD sound and mix** | LEV on Mix (the existing `level`), machine audition in the picker | – | S |

Order: P and 1 at once; then 2, 3, 4 (separate lanes); then 5, 6, 7, 8. At most 3 agents at once.
