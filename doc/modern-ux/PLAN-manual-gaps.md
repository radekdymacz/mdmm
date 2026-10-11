# Plan: close the manual gaps in our UI (Machinedrum Editor + Monomachine Editor)

- 2026-10-10. Hammock style: what is, candidates, a pick, the design, keys, slices for subagents. **No code yet.**
- Inputs: [FEATURE-MAP-MD.md](FEATURE-MAP-MD.md) (296 rows: 25 ❌, 35 🟡), [FEATURE-MAP-MM.md](FEATURE-MAP-MM.md)
  (385 rows: 35 ❌, 38 🟡), two firmware-path fact sweeps of the code (this session), [FOUNDATION.md](FOUNDATION.md),
  [DESIGN-keymap.md](DESIGN-keymap.md), [MM-PARITY-2026-10-09.md](MM-PARITY-2026-10-09.md),
  [DESIGN-step-selection.md](DESIGN-step-selection.md), [IDEAS.md](../release/IDEAS.md) (I-011 song library).
- Rules kept: one meaning per modifier (keymap P1-P8), nothing only behind a key (P5), same concept same gesture on
  MD and MM (P7), every gesture is an intent (FOUNDATION "Add a command"), capabilities disable what an engine cannot
  do, never a branch on the engine id.

## 0. Hard facts that shape the plan

1. **The page is the only UI.** The shipped editors have no emulated panel. A "panel only" function needs an
   editor route or it stays out.
2. **Over HW MIDI the editor can press only Start (0xFA) and Stop (0xFC)** (`deskWire.h` `realtimeOf`). No Continue,
   no Song Position Pointer (SPP), no other key. The emulator has a bigger key set (MD `mdpanelsequence.cpp`; MM
   closed `Key` enum: Exit, Enter, arrows, Global, Play, Stop, Record, …), but no FUNCTION chords and no EXIT on MD.
3. **MM dumps (pattern, song, global, stored kit) need SYSEX RECV.** The emulator drives it; over HW the dump waits
   as "SEND n" for the person. A global dump applies only after 0x56 (set active global).
4. **What the firmware cannot do over MIDI at all** (dropped, §8): MD sample send to a computer, sample erase,
   RAM→ROM copy, the UNDO KIT slot; MM factory reset data; MD machine preview on the panel.
5. **Data is often already there.** MD: `level` command (in the schema, no page caller), pattern `swing{editAll,steps}`,
   `tracks[t].swing`, `accent.editAll`, `slide.editAll`, kit `tracks[t].lfo`, song `name`. MM: `saveSong` command (no
   page caller), global `channels{base,span,auto,multiTrig,multiMap}`, `masterTune`, `controlIn`, 8 global slots,
   song `name`. Not decoded: MM `control[6]` (CONTROL OUT1/OUT2, program change), MD trig-in bytes.

## 1. How the UI is shaped today, and where the gaps fall

| Place | MD | MM | Gaps that land here |
|---|---|---|---|
| Workspaces (1-5) | Seq, Sound, Mix, Sampler, Song | Seq, Sound, Mix, Perform, Song | MD LEV, MD swing/accent/slide marks, MD LFO copy, MM step record, MM selection (K7), super copy/clear, play from row |
| Top bar / LCD | transport, tempo, LCD fields, GLOBAL key, KIT/PAT fields | same, no GLOBAL key | pause, panic, tempo nudge, delayed tempo |
| Pop-up panels | kit library, pattern chooser, GLOBAL panel, SysEx import panel, machine picker | kit library, pattern chooser, SysEx import, machine picker | song library (I-011), global slots, MM GLOBAL, waveforms, export ranges, SPEC/verify import, resets |
| Engine menu | Export / Import SysEx, LOAD ROM, GLOBAL… | Export / Import SysEx, LOAD ROM | export ranges, resets |

Two thirds of the gaps are **machine memory** (slots and files: songs, globals, waveforms, SysEx, resets). Today
memory lives in four places (kit library, pattern chooser, GLOBAL panel, engine menu). The rest are small, local
editing and transport features.

## 2. Candidates

| | Shape | For | Against |
|---|---|---|---|
| A | **Add in place.** A song pop-up, an MM GLOBAL pop-up, a waveform pop-up, more engine-menu items, per-feature clipboards (arp, swing, slide, LFO). | Small slices, nothing moves. | Seven pop-ups with seven layouts; the MD and MM libraries stay two copies; four more clipboards; the engine menu grows into a junk drawer. |
| B | **Consolidate memory, add editing in place.** One **Library** panel, shared by both editors, with tabs: Kits · Patterns · Songs · Globals · Waveforms (MM MKII) · File. One **"what" model** for track copy / paste / clear (the manual's SUPER COPY / SUPER CLEAR) instead of separate clipboards. Transport additions in the existing top bar. | One place for every slot; same keys on every tab (arrows, Enter, F2, ⌘C/⌘V, Delete, drag); one copy of the library code; I-011 for free; the MD GLOBAL panel becomes a tab, so the MM gets it at the same time. | The library refactor comes first (a shared shell for two pages that differ: MD page vs MM mockup seam). |
| C | **Full redesign** of the workspaces too. | A clean slate. | The workspaces are not where the gaps are; testers know them; months of journeys break. |

**Pick: B.** The gaps cluster in memory, so consolidate memory; everything else is a small addition where the
person already looks. C fixes nothing the maps found. A makes the problem bigger.

## 3. The Library (shared, both editors)

### 3.1 Shape

- One panel in the modal layer (`DIALOGS` row, kind `panel`), same place and size as the kit library today.
- **Tabs** on the panel's head: `KITS  PATTERNS  SONGS  GLOBALS  [WAVEFORMS]  FILE`. WAVEFORMS only on an MM MKII
  model and only when its probe passes (§7 P4). The tab strip is a data list per machine (`LIBRARY_TABS`), no
  machine name tested.
- **Every slot tab has the same layout:** the slot grid on the left (current slot lit, edited LED, linked info as
  today), an action bar on top (`Current: Save · Reload` | `Slot: Load · Save as · Copy · Paste · Clear · Rename`),
  the selected slot's detail on the right. Same tooltips style (the machine's facts: which SysEx, what is measured).
- **Openers (each opens its tab):** LCD KIT field → KITS; LCD pattern name → PATTERNS; LCD SONG field → SONGS
  (I-011: replaces stepping through songs; the wheel still steps); GLOBAL key → GLOBALS (the MM gets the GLOBAL key
  in its top bar, same place as the MD); engine menu Export/Import SysEx… → FILE. `⌘L` opens the Library on its last
  tab.
- **Keys inside (one set for every tab):** arrows move, Enter loads (patterns: queue; ⇧Enter now), F2 / double-click
  rename, ⌘C / ⌘V copy / paste the slot, Delete clear (asks), ⌘Z undo, drag a slot onto another = copy, ⌘[ / ⌘]
  previous / next tab, Esc closes. Patterns keep A–H for banks.
- **HW MIDI on the MM:** a write that needs SYSEX RECV shows the existing "SEND n" state in the slot and the head.
  Same component for every tab.

### 3.2 Tabs

| Tab | MD | MM | Commands (new ones bold) |
|---|---|---|---|
| KITS | today's kit library, moved | today's, moved | existing `kit*` |
| PATTERNS | today's chooser, moved | today's, moved | existing `pat*` |
| SONGS | 32 slots: name, rows, bars, time; Load, **Save current song here** (MD 0x6D: new builder), Copy, Paste, Clear, Rename, drag-copy | 24 slots, same; Save is the existing `saveSong` (0x6D, live) | **`songCopy`, `songPaste`, `songCopyTo`, `songClear`, `songRename`** on `deskEdits.h` `library` (the kit/pattern `Shelf` pattern), **MD `saveSong`** |
| GLOBALS | 8 slot keys (active lit, click = make active, as today) + Copy / Paste / Clear of a slot; below: today's GLOBAL cards (Control, Sync, Trig in, Map editor, Routing) | 8 slots, same; cards: **MIDI channels** (base, span, multi trig, multi map, auto), **Audio** (master tune 430.0–450.0), **Control in** (tempo sync, transport), **Control out / program change** (after probe P2), Routing (moved from Mix as a link: it stays on Mix too) | **`globalCopy`, `globalPaste`, `globalClear`**, MM **`globalSet {field, v}`** (same op name and shape as the MD), MM **`globalSlot`** (0x56) |
| WAVEFORMS | — | MKII, after P4: 64 user slots, name, a small drawn shape; Receive from .syx, Send to .syx, Copy / Paste / Clear between slots if the dump allows it | **`waveRequest`, `waveSet`** (0x5E / 0x5D) as a new document kind (FOUNDATION "Add a document kind") |
| FILE | **Export…**: choose kinds and ranges (kits 1–64, patterns A01–H16, songs, globals one or all) → one .syx. **Import…**: today's panel + **Place at** (SPEC: first slot; the desk rewrites each item's slot) + **Check only** (VERF: compare, send nothing, the same report). **Reset…**: Empty (writes empty kits, patterns, songs; asks twice), Factory (MD: from `mdfactorybaseline`, if it holds full data; MM: not offered, says "import the factory .syx") | same, MM ranges (kits, patterns A01–H16, songs 24, globals 8) | plug-in rows: **`exportSyx {kinds, ranges}`**, `syxImport` gains **`placeAt`** and **`checkOnly`**; **`resetEmpty`**, MD **`resetFactory`** (each a `set` series, asked) |

### 3.3 Why the GLOBAL panel becomes a tab

The MD's GLOBAL panel already mixes slot choice with settings. As a tab it gains copy/paste/clear for free, and the
MM gets the same layout in the same slice. B-026 (MM refuses mutes and notes outside CHANNEL SPAN) gets a fix
path: the refusal toast gets a **"Set channels…"** button that opens GLOBALS on the MIDI channels card.

## 4. Editing and transport (added in place)

### 4.1 Transport (top bar, both editors)

| Function | Gesture | Engines | How |
|---|---|---|---|
| Pause / continue | **⇧Space**; ⇧-click the play key | emulator: the panel's second PLAY; HW: Stop then **Continue 0xFB** (add to `deskWire.h`) | `pause` machine command; the play lamp blinks while paused. Space stays play / stop (DAW habit, keymap §3.4). |
| Panic | **⌘.** (Ctrl+. off a Mac; the macOS "cancel"); a "Panic" item in the play key's right-click menu | MM: CC 120 on each track channel (needs base; refused with the B-026 button when OFF); MD: Stop twice (emulator panel), HW after probe P6 | `panic` machine command |
| Tempo nudge ±10 % | **hold `-` / `=`** (plain; ⌘- / ⌘= stay zoom); hold the new ◂ ▸ beside TEMPO | both: the desk sends tempo ×0.9 / ×1.1 (0x61) and the base back on release; the LCD shows the base with a ± mark | `tempoNudge {dir: -1\|0\|1}`, no undo step |
| Delayed tempo change | **⌥-drag the tempo** (FUNCTION = ⌥): the value follows the pointer in grey, sent on release | both | page only (one `tempo` on release) |
| Play from a song row | Song page: select a row, **Enter**; row right-click → "Play from here" | after probe P1 (SPP + Continue). If the firmware ignores SPP: emulator only via panel keys, or dropped | `songPlayFrom {row}` |

### 4.2 Sequencer (Seq workspace)

- **MD marks strip (swing, accent, slide).** Under the grid, three thin rows `ACC SWG SLD`, each with an
  `ALL | TRK` switch (the pattern's EDIT ALL flag). ALL: the row is the pattern's; a 16-dot track picker beside it
  says which tracks take it (`tracks[t].accent/swing/slide`). TRK: the row shows the selected track's bits. Click
  toggles, drag paints (as trigs). ⇧-click accent and ⌥⇧-click slide on the grid stay. The step menu gains **Swing**.
  New ops: **`swingTrig`** (copy of `accent`), **`markMode {mark, all}`**, **`markTrack {mark, t, on}`**. Switching
  ALL → TRK copies the shared bits to every chosen track (said in the switch's tooltip; the manual leaves it open).
- **Copy… / Paste… / Clear… "what" (SUPER COPY / SUPER CLEAR, both editors).** One dialog: source = the selected
  track (or the selection); ticks: Trigs/notes · Melody (MM: pitches only) · Locks · Accent · Swing · Slide · Machine
  + sound · LFO (MD) · Arp · Transpose (MM). Remembers the last ticks. Keys **⌘⇧C, ⌘⇧V, ⌘⇧⌫**; also the new
  **track header right-click menu** (Copy…, Paste…, Clear…, Mute, Solo, Randomise). This replaces separate arp,
  swing, slide and LFO clipboards. Core: **`trackCopy {t, what[]}`, `trackPaste {t, what[], to[]}`,
  `trackClear {t, what[]}`** in `deskCore/deskEdits.h`, each machine giving its `what` list as data.
- **Live erase (both).** While live recording, **hold Delete / ⌫**: the selected track's trigs and its locks on the
  steps that pass are erased (the manual's EXIT + TRIG / EXIT + knob). Needs the playhead (capability `telemetry`);
  where the engine has none, the key says so. Ops: `clearSteps` with the playing step, from the page's telemetry.
- **MM selection (K7, designed already).** DESIGN-step-selection §7 + keymap K7 as written: ⌘-click / ⌘-drag on the
  roll, ⌘⇧ extend, ⌘X ⌘D ⌘A, arrows, Enter, Delete only on a selection (D3), fill moves to the step menu, the step
  menu with Note off, Trigless, Chord, Slide, Fill, Copy, Cut, Paste here, Duplicate, Clear, **Lock current value**
  (the lane's parameter, the manual's "click a knob to lock its value"), **note copy** = copy one step's selection.
- **MM step recording.** **`I`** (Input) toggles STEP mode, also ⇧-click the LCD REC key. Stopped only. A step
  cursor (a one-step selection); a played note (computer keys or MIDI in) writes the note at the cursor and moves one
  step; → skips a step (rest), ← back, Delete clears the step under the cursor, Esc or `I` leaves. Page + existing
  `note` edits; no firmware path needed, so both engines.
- **MM live-lock marker:** after probe P5; then the MD's `machine.desk.recLock` shape.

### 4.3 Sound and Mix

- **MD LEV per track.** Mix strip: a LEV value above VOL (default 100, double-click resets, wheel, drag), and a
  thin bar of the stored value beside the strip (no meter: the machine reports none). No lock lane (the manual: LEV
  cannot be locked). Sends the existing `level`.
- **MD machine preview.** In the machine picker, **Space** (or the ▶ beside a machine) auditions: assigns the machine
  to the track (0x5B), plays one note, Enter keeps it, Esc puts the old one back (one undo step, never in history if
  cancelled). Both engines. The panel's EDIT KIT preview is not needed.
- **MD LFO copy / paste / clear.** Covered by the "what" dialog (LFO tick) and by a right-click on the Sound page's
  LFO card header (Copy LFO, Paste LFO, Clear LFO). Ops `trackCopy/Paste/Clear` with `what: ["lfo"]`.
- **MM multi map:** the pattern list offers all 128 (A01–H16) with banks, not 32 (page only).

### 4.4 GLOBAL details

- **MD note map learn.** Each track's note in the Map editor gets a small **LEARN** dot: click, play a note on the
  controller, it is mapped. Needs incoming MIDI notes in the page (a `midiIn {note}` message; the same message
  serves I-002 "show incoming notes"). **Reset map** button: the default C2–D4 map from `mdDeskKeys.h`, written with
  `globalSet keymap` (one undo step).
- **MD trig in A/B:** editable steppers after probe P3; until then read-only as today.

## 5. Keys: the full delta

Checked against `keymap.json` (md 108, mm 68 entries). Free plain keys used: `I`, `-`, `=` (both editors).

| id (new) | Key / gesture | Scope | MD | MM | Notes |
|---|---|---|---|---|---|
| `library-open` | ⌘L | any | ✓ | ✓ | last tab |
| `library-tab` | ⌘[ / ⌘] | library | ✓ | ✓ | |
| `lib-save-song` | button only | library | ✓ | ✓ | ⌘S left to the host (DAW save) |
| `pause` | ⇧Space; ⇧-click play key | any | ✓ | ✓ | Space unchanged |
| `panic` | ⌘. | any | ✓ | ✓ | + play key right-click menu |
| `tempo-nudge` | hold - / = ; hold ◂ ▸ | any | ✓ | ✓ | |
| `tempo-delayed` | ⌥-drag tempo | any | ✓ | ✓ | ⌥ = FUNCTION |
| `song-play-from` | Enter on a row; row menu | song | ✓ | ✓ | after P1 |
| `track-menu` | right-click a track header | seq sound mix | ✓ | ✓ | new menu (deskMenu.js) |
| `copy-what` / `paste-what` / `clear-what` | ⌘⇧C / ⌘⇧V / ⌘⇧⌫ | seq sound | ✓ | ✓ | the "what" dialog |
| `live-erase` | hold Delete / ⌫ while recording | recording | ✓ | ✓ | before `delete` (`when`) |
| `marks-row` | click / drag ACC SWG SLD rows | seq | ✓ | — | MD only (MM has slide/swing rows already) |
| `step-swing` | step menu item | seq | ✓ | — | |
| `step-record` | I; ⇧-click REC | any | — | ✓ | |
| `step-cursor` | ← → Delete Esc in STEP | step rec | — | ✓ | reuses `sel-move` ids |
| `picker-audition` | Space / ▶ in the picker | picker | ✓ | later | MM: same gesture when wanted |
| `map-learn` | LEARN dot | global | ✓ | — | |

Changed: `lib-*` entries move from "kit library / pattern chooser" to "Library (every tab)". The MM gains the
existing MD ids `global-key`, `close-global` (now the Library's), K7's `step-select`, `step-extend`, `step-menu`,
`cut`, `duplicate`, `select-all`, `sel-*`, `deselect`. The parity test (`deskKeymapTest.js`) lists the machine-only
ids above. `keymap.json` and the guide's tables are regenerated (`scripts/keymap-export.js`).

## 6. Shared code shape (for the implementers)

- **Library shell:** `skins/shared/deskLibrary.js` + `.css`: tabs, slot grid, action bar, keys, drag-copy, the
  SEND n state, all as data (`tabs: [{id, label, slots, slotView, actions, detail}]`). The MD page passes providers
  built from `mdDeskLibrary.js` (split into `mdDeskLibKits.js`, `mdDeskLibSongs.js`, …); the MM passes providers
  through new seam calls (`MM_SEAM.host`: `library(op,args)` exists; add `songs()`, `globals()`, `waves()` views).
  `mdDeskGlobal.js` becomes the MD GLOBALS tab provider; the MM gets `mm-mockup/src/126-global.js`.
- **Core:** song and global slot ops on `deskCore/deskEdits.h` `library` (one implementation, two `Shelf`s); the
  "what" ops in `deskEdits.h` with per-machine `what` tables in `mdDeskEdit.cpp` / `mmDeskEdit.cpp`; transport
  commands are `Machine` rows. Every new op: a model table row, `--write-schema`, `intent-cases.json` cases (MM),
  `page_contract_check.py` green.
- **Capabilities (new names):** `pause`, `panic`, `songPlayFrom`, `liveErase`, `waveforms`, `stepRecord` (always
  true, listed for symmetry) — added to the schema and `CAP_CONTROLS` / `NA_SEL`.

## 7. Probes first (firmware facts we do not have)

Each is a firmware test (`mdDeskFirmwareTest` / `mmDeskFirmwareTest` / `mmEditorProbeFirmwareTest`), half a day to a
day, run on the ROMs. A slice that depends on one waits for its answer.

| # | Question | Decides |
|---|---|---|
| P1 | Do MD and MM accept SPP (0xF2) + Continue (0xFB) in song mode and in pattern mode? | play from row on HW; pause on HW |
| P2 | MM global bytes `control[6]` and program change: which bit is which (toggle each on the emulated panel, diff the dump) | MM Control out / PRG cards, internal MIDI out |
| P3 | MD trig in A/B byte layout (same method) | editable trig in |
| P4 | Does the emulated MM (MKII ROM) answer 0x5E and take 0x5D? | WAVEFORMS tab |
| P5 | MM `reclock`: RAM address of the step that gets a live lock | MM live-lock marker |
| P6 | MD: what does Stop twice over MIDI do? Is there an all-voices-off path over MIDI? | MD panic on HW |
| P7 | MD `mdfactorybaseline`: does it hold full kits, patterns, songs, globals? | MD factory reset |

## 8. Not doing (and the words the map gets)

| Function | Why | What the person is told |
|---|---|---|
| MD send samples to a computer | the machine ignores SDS requests (measured) | tooltip on the Sampler, as today |
| MD erase sample, RAM→ROM copy, sample slot copy | panel only, no MIDI path | "On the machine: SAMPLE MGR" |
| MD UNDO KIT slot | SysEx range is 0–63 | editor undo covers it |
| MD STOP+PLAY restart, double-STOP hold in song | two clicks do the same / panel only | — |
| MM factory reset | no factory data in the editor | "Import the factory .syx" in FILE › Reset |
| MM DigiPRO rename / erase / Digibank copy | panel only (unless P4 shows the dump carries the name) | — |
| Hardware-only rows (➖) | jacks, power, LEDs | — |

## 9. Slices for subagents

Each slice: one branch from `main`, one sonnet subagent, the leader-leader brief (goal, deliverables, bounds; the
how is theirs). Checks per CLAUDE.md "Development lifecycle": level 2 only (the area's journeys in the background,
the unit tests for shared code, `--write-schema` + `page_contract_check.py`). Radek plays and accepts each in the dev
loop (`scripts/mdmm-dev.sh play md|mm`). Sizes: S < 1 day, M a few days, L a week.

| # | Slice | Depends | Size | Lane | Acceptance (journeys new in bold) |
|---|---|---|---|---|---|
| S0 | Probes P1–P7 (one agent, a report `doc/modern-ux/PROBES-manual-gaps.md`) | — | M | A | the report; FEATURE-MAP rows updated |
| S1 | **Library shell**, KITS + PATTERNS moved, both editors, no new function | — | L | B | existing lib journeys green; **`md-lib-tabs`**, **`mm-lib-tabs`** |
| S2 | SONGS tab + song slot ops + MD `saveSong` (I-011) | S1 | M | B | **`md-lib-songs`**, **`mm-lib-songs`** (save, rename, copy, clear) |
| S3 | GLOBALS tab: MD panel moved + slot copy/paste/clear; **MM GLOBAL key + MIDI channels + master tune + control in**; B-026 "Set channels…" button | S1 | L | B | **`mm-global-channels`** (span 0 → mute refused → set span 6 → mute works), **`md-lib-globals`** |
| S4 | FILE tab: export ranges, Place at, Check only, Reset (Empty; MD Factory after P7) | S1 (S0 for factory) | M | B | **`md-lib-export-range`**, **`mm-lib-import-check`** |
| S5 | Transport: pause (+0xFB), panic, tempo nudge, delayed tempo | S0 for HW pause/panic | M | C | **`md-transport-pause`**, **`mm-transport-panic`**, **`md-tempo-nudge`** |
| S6 | Track menu + "what" dialog + `trackCopy/Paste/Clear` core, both | — | M | D | **`md-track-copy-what`** (LFO only), **`mm-track-copy-what`** (melody) |
| S7 | MD marks strip (swing trigs, per-track, EDIT ALL) | S6 (menu) | M | D | **`md-seq-swing-marks`** |
| S8 | MD LEV on Mix + machine audition in the picker | — | S | C | **`md-mix-level`**, **`md-picker-audition`** |
| S9 | MM K7 selection + step menu + lock current value (as designed) | S6 | L | E | `mm-seq-select-copy-paste`, `mm-seq-step-menu` |
| S10 | MM step recording + live erase (both editors) | S9 | M | E | **`mm-seq-step-record`**, **`md-live-erase`** |
| S11 | MD note map LEARN + reset; `midiIn` message (serves I-002) | S3 | S | C | **`md-global-map-learn`** |
| S12 | MM multi map 128 patterns | — | S | C | `mm-perform-multi-map` extended |
| S13 | Probe-gated: song play-from-row (P1), MM control out / PRG / internal MIDI out (P2), MD trig in (P3), WAVEFORMS tab (P4), MM live-lock marker (P5) | S0 + S2/S3 | M each | after | one journey each |
| S14 | Words: keymap regenerated, guide tables, release notes "What's new", FEATURE-MAP rows flipped to ✅ | each slice adds its rows; one final pass | S | — | `keymap-export` check, guide check |

**Lanes** run in parallel (separate worktrees under `audio/gearmulator-md-mm-wt/`): A probes, B Library (serial:
S1 → S2/S3/S4, S2–S4 may run in parallel once S1 is merged), C small adds, D sequencer marks, E MM selection.
At most 3–4 agents at once to keep merges simple. Merge order follows "Depends".

**Release cut suggestion:** 0.5 = S1–S5, S8, S12 (Library + Globals + songs + transport: closes the B-026 dead end
and I-011). 0.6 = S6, S7, S9–S11, S13.

## 10. Decisions for Radek

| # | Decision | Option 1 | Option 2 | Recommend |
|---|---|---|---|---|
| R1 | Shape | **B: one shared Library with tabs** | A: add separate pop-ups | 1 |
| R2 | Space | **Space play/stop, ⇧Space pause** | Space = the machine's PLAY (pause when playing) | 1 (DAW habit; Space also stops in every host) |
| R3 | Probe-gated items | **probe first, then build or drop** | drop them now | 1 (S0 is a few days and runs in parallel) |
| R4 | Copy/clear | **one "what" dialog (SUPER COPY) for everything** | separate clipboards per row (arp, swing, slide, LFO) | 1 |
