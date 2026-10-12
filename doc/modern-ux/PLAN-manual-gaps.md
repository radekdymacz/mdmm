# Plan: build the manual gaps (the waves of 0.6)

- 2026-10-11. The design is [DESIGN-machine-menus.md](DESIGN-machine-menus.md) (approved). The work list is the ❌ and
  🟡 rows of [FEATURE-MAP-MD.md](FEATURE-MAP-MD.md) and [FEATURE-MAP-MM.md](FEATURE-MAP-MM.md), checked against main at
  0.5.0. In `doc/release/PLAN-0.6.md` this is **slice 8, "build the gaps, wave by wave"**; the design review stood in
  for most of slice 7's triage (the exceptions are §4 of the design).
- Each wave: one branch from `feat/0.6-features` (the 0.6 integration branch; merged back there, and the branch goes to `release/0.6.0` then main), both editors where both have the feature, its journeys (with `proves:` once the
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
| 9 | **MM Perform: see and set up** (B-064) | Poly visible in the track rail (the focus track marked as six voices, the others shown silent) and a one-line hint on the Keyboard card; filter key tracking shown and switched in the Sound page's Filter group (the same `assign` hpf / lpf switch as Perform > Assign > KEY, not a second control); the Multi envelope card says it shapes multi-trig notes only and offers to switch the keyboard mode when it has no effect. Journeys prove the sound: six voices, key tracking off changes the filter, the envelope shapes multi-trig notes. Mock in mockup-next with the other waves | – | S-M |
| 10 | **MM MKII look** (I-023) | The Monomachine's MKI / MKII plate key changes the whole look, as on the Machinedrum: MKII = brushed silver panel, black window round the LCD with the red dot logo, a positive LCD (bluish-white ground, black pixels), black keys with white ENTER / EXIT and track keys, a red COPY key, dark brown label bars, red and yellow LEDs (sampled from product photos). MKI keeps today's look. The plate key says what it does (tooltip, the toast names the look) so the switch is found; both editors' plate keys behave the same. Light and dark both. Mock in mockup-next with the other waves | – | M |

Order: P and 1 at once; then 2, 3, 4 (separate lanes); then 5, 6, 7, 8, 9, 10. At most 3 agents at once.

## Wave 9: MM Perform, see and set up (B-064), mock-up and self-review

2026-10-12, branch `feat/0.6-perform`. The firmware facts first, measured, not read from the manual:
[PROBES-manual-gaps.md](PROBES-manual-gaps.md) P10 (`gapProbesFirmwareTest p10`). What they changed in the plan:

- **POLY plays the machine's track in focus**, the TRACK key's, not the page's track. The page played the selected
  track's channel while the machine might hold POLY on another track: silence ("poly mode doesn't seem to be working").
  So the `poly` command takes `t` and presses TRACK t first; the page sends it on entering POLY and again whenever the
  selected track changes while in POLY (the TRACK key moves POLY there, measured).
- **The MULTI ENV is more than "multi trig only".** It shapes MULTI TRIG notes in ALL TRK, SEQ START and SEQ TRNSP, not
  in SPLIT KEY; and once a MULTI TRIG note has played, the envelope's level holds every track: with REL under 127 the
  machine is silent after that note off (own notes and the pattern) until the next MULTI TRIG note or STOP. That is the
  tester's "works sometimes, only on a single track, no effect with a pattern playing". The card says it per mode.
- **Key tracking** does what the manual says (off: the filter stays at BASE and WDTH whatever the note).

**The mock-up** is in the review mockup with the other waves: `doc/modern-ux/mockup-next/mm.html`, group "Perform (wave
9)" in the REVIEW strip (`mm-next.js`; shots `mockup-next/shots/mm-15-w9poly.png` to `mm-20-w9key.png`):

| State | What changes |
|---|---|
| Perform: POLY | The hint under the Keyboard mode keys says which track plays six voices (the machine's TRACK n, the track selected here) and that the other five are silent, their channels too; the sequencer plays that track's chord notes. Assign's track keys 1-6 and the track lamps under the keyboard mark that track ×6 and dim the others. Selecting another track there (or on the rail) moves POLY to it. |
| Sequence rail in POLY | The rail already dimmed the other tracks; the POLY track's name gets ×6. |
| Multi envelope, AUTO TRACK keys | The card's header names the kit's MULTI TRIG mode; its hint says what the envelope shapes in that mode, and, while the keys play AUTO TRACK, POLY or MULTI MAP, to choose **Multi trig** under Keyboard (pointing at the hint rings that key). |
| Multi envelope, SPLIT KEY | "No effect in SPLIT KEY", and which modes it works in. |
| Multi envelope, SEQ START | It shapes the pattern a MULTI TRIG note starts; with REL under 127 the machine is silent after that note until the next one or STOP. |
| Sound: Filter key tracking | The Filter group's header gets **KEY** with two lamps (HPF, LPF: lit while that filter follows the note); a click opens Perform › Assign › KEY for this track, where the switches are. The Filter screen's label says which filter is fixed. |

**Self-review against Radek's UI rules:**

1. *No duplicate controls.* The plan's line "shown and switched in the Sound page's Filter group" would have put a second
   HPF / LPF switch there: not done. The Filter header shows the state (two lamps) and is a way to the one switch
   (Perform › Assign › KEY), as the Sound page's Arp / Transpose / Trig setup keys lead to the Sequence dock. "Offers to
   switch the keyboard mode" would have been a second Multi trig key in the card: not done; the hint names the key and
   rings it on hover. POLY's track is chosen with the track keys there are (Assign's 1-6, the rail), no POLY track
   picker.
2. *No right-click menus.* None; everything is a click or a hover.
3. *The layout stays.* No card, column or control moves: words go into the hints that are there (the Keyboard hint, the
   card hints, the Filter screen's label), marks onto keys and lamps that are there, one small key into the Filter
   group's existing header line.
4. *No new rows above the grid.* The Sequence workspace is untouched but for the rail's ×6.
5. Worth Radek's look at the end: the card hints are longer than before (one or two lines; the cards keep their size at
   1440 x 924); the ×6 badge on Assign's track keys; the KEY key in the Filter header.

**Built** (after the self-review, Radek sees it with the release): the core (`poly {on, t}`), the page (Perform,
Sound, rail), the journeys with `proves:`, the firmware test of the sound (`mmPerformSoundFirmwareTest`), the guide
sections, TEST-0.6.md.
