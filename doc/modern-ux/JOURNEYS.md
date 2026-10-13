# User journeys: features against journeys

Every user-facing feature of the two editors, from the release notes (doc/release: 0.1.0-alpha, 0.2.0, 0.2.1,
0.3.0), the P*-RESULT and MM-P*-RESULT docs and the pages' workspaces and key maps, with the journeys that
cover it and their last result. How to run them and how to add one: [FOUNDATION.md](FOUNDATION.md), Build and
check, User journeys. The journeys are `skins/mdStudio/mdDeskJourneys.js` and `skins/mmStudio/mmJourneys.js`
(names `md-…`, `mm-…`); a subset runs with `scripts/mdmm-journeys.sh md journey-seq-*`.

Last run: 2026-10-05, diagnostics build of `feat/mm-port` (Release, arm64), MD OS 1.63, MM OS 1.32B: Machinedrum
64/64 pass (the window on screen, so the sampler's canvas journeys ran too), Monomachine 71/71 pass (with the rotate
fix, MM-PORT-PLAN.md 2026-10-05; the run before it: 70/71, `mm-seq-roll-paint` found the rotate run holding the
commit). Earlier, on `test/user-journeys`: Machinedrum 60 of 62 (2 skipped, window covered), Monomachine 69/69.

2026-10-10, `feat/mm-piano-roll` (0.5 MM slice 3), MM OS 1.32B, in the background with fresh settings: `mm-roll-*` and
`mm-seq-*` 24/24 after the fix noted in the roll rows (the first run 23/24).

2026-10-11, `fix/0.5.1-paste-journeys`, MD OS 1.63, MM OS 1.32B, standalone, in the background, two at once: fresh
settings MD 78/78 and MM 94/94 (18 skipped: window covered); copied settings 165 of 172, the 7 failures the same with
and without the new GLOBAL reset (doc/release/BUGS.md B-058). Since then every run resets the active GLOBAL to the
factory settings before its first journey (`JOURNEYS before:` in the report): the copied MM machine held CHANNEL
SPAN 0, which failed every MM mute journey.

Status: **PASS**; **FAIL** with the bug (below); **SKIP** (needs the window on screen); **not covered** (reachable,
no journey yet); **not testable** (why). "—": the editor has no such feature.

## Coverage

| | Machinedrum | Monomachine | Both |
|---|---|---|---|
| Features in the inventory (one row a feature; "—" rows not counted) | 85 | 89 | 174 |
| Covered by a journey | 73 | 79 | 152 |
| of which PASS | 73 | 79 | 152 |
| of which FAIL (product bug) | 0 | 0 | 0 |
| of which SKIP here (window covered) | 0 | 0 | 0 |
| Not covered yet (reachable through the page) | 1 | 0 | 1 |
| Not testable through the page (file chooser, hardware, DAW, hidden by design) | 11 | 10 | 21 |

## Start-up, ROM, engine

| Feature | Machinedrum | Monomachine |
|---|---|---|
| Start-up card: covers the window, blocks input, mirrors the firmware LCD, goes when ready | md-boot-card PASS | mm-boot-card PASS |
| Starting without a ROM: card asks for the ROM, file chooser | not testable: needs the owner's ROM moved out of the ROM folder, and the native file chooser | same |
| LOAD ROM: the card shows the firmware in use, Close | md-engine-rom-card PASS | mm-engine-rom-card PASS |
| LOAD ROM replaces or removes the firmware | not testable: would replace the owner's ROM; native file chooser | same |
| HW MIDI with no machine: card "no machine answers", Use the emulator | md-engine-hw-no-machine PASS | mm-engine-hw-no-machine PASS |
| HW MIDI with a real machine (edits, SEND n, TRANSPORT ACCEPT) | not testable: real hardware | not testable: real hardware (the emulated peer is the firmware test's `hw`, not the page) |
| AUDIO / MIDI panel (`,` and the engine menu) | md-audio-panel PASS (opens, closes; devices not changed) | mm-audio-panel PASS |
| DAW: follows host tempo and transport, restores automation and setup | not testable: standalone only | same |

## Top bar, keys, dialogs

| Feature | Machinedrum | Monomachine |
|---|---|---|
| PLAY / STOP key, POSITION | md-seq-first-beat PASS | mm-seq-first-beat PASS |
| Space plays and stops | md-keys-space-play PASS | mm-keys-space-play PASS (see note 2) |
| Tempo: drag the BPM | md-top-tempo-drag PASS | mm-top-tempo-drag PASS |
| Tap tempo (MD: T or B; MM: B, since T is a black key there, 2026-10-05) | md-keys-tap-tempo PASS, md-keys-tap-tempo-b PASS | mm-keys-tap-tempo PASS (B) |
| ⇧B taps on every workspace of both editors, MM Sequence included where B is Draw (Radek, 2026-10-10) | md-keys-tap-tempo-shift PASS (2026-10-10) | mm-keys-tap-tempo-shift PASS (2026-10-10, on Sequence, Draw unchanged) |
| Pattern ‹ › on the LCD | md-top-pattern-next PASS | mm-top-pattern-next PASS |
| A pattern picked while playing is queued, starts at the end | md-seq-queue-while-playing PASS | mm-seq-queue-while-playing PASS |
| Plate MK1 / MK2 | md-top-plate PASS | mm-top-plate PASS |
| Workspace keys 1-5 | md-keys-workspaces PASS | mm-keys-workspaces PASS |
| ? keyboard view (K-view, 2026-10-08: the drawn keyboard, the ⌥ layer, a key's words, the search; MM: the list until K7) | md-keys-help PASS | mm-keys-help PASS |
| Undo / Redo keys and Cmd+Z, Cmd+Shift+Z | md-top-undo-redo PASS | mm-top-undo-redo PASS |
| The editor's menu in the page (I-008): right-click the header and the rail, submenu by keys, Zoom, Updates › Check Daily | md-top-editor-menu PASS | mm-top-editor-menu PASS |
| The CPU meter beside the version (I-018): reads a share, every top-bar key in the window, moves while playing, a click opens its details, Esc closes them (2026-10-11, standalone and VST3) | md-top-cpu-meter PASS | mm-top-cpu-meter PASS |
| The output meter and volume at the LCD's right end (I-021): two bars and one volume line, drag, wheel, double-click 0 dB, off at the foot, each read back from the plug-in; the bars follow the left and right peaks while playing; the top bar still fits (2026-10-11, not run yet) | md-lcd-volume (not run) | mm-lcd-volume (not run) |
| Developer › Speed-ups and Speed-ups (each), and the same from the CPU details: the machine, the saved setting and the tick follow, both ways, every lever (2026-10-11, standalone and VST3) | md-dev-speedups PASS | mm-dev-speedups PASS |
| Undo works over the library | md-lib-kit-copy-paste-undo PASS | mm-lib-kit-copy-paste-undo PASS |
| Questions: start on Cancel, Esc answers Cancel | md-dialog-esc-space-cancel PASS | mm-dialog-esc-cancel PASS |
| Space presses the dialog's focused button (0.3.0) | md-dialog-esc-space-cancel PASS | mm-dialog-keys-behind PASS |
| No shortcuts behind dialogs: Delete, Backspace, digits (0.3.0) | md-lib-load-save-dialog PASS | mm-dialog-keys-behind PASS |
| Dialogs wait their turn (a plug-in question never lost) | not testable: needs two questions at once from the plug-in | same |
| Errors show once under the header, close with × | not testable: no refusal the page can cause on purpose | same |
| Notices per window with two windows open | not testable: one window per standalone | same |
| QWERTY keyboard plays the selected track | md-keys-play-notes PASS (the core takes the note) | mm-keys-play-notes PASS |
| Black keys W E T Y U O P: the two rows play every semitone (2026-10-05) | — (white keys only) | mm-keys-black-keys PASS (the pitches sent: C♯ F♯ D♯, then A S still C D) |
| Track select ↑ / ↓ | md-keys-track-select PASS | mm-keys-track-select PASS |
| M mutes the selected track, Alt+M every track, 0 unmutes all | md-keys-mute PASS | mm-keys-mute PASS |
| Window fits the screen, remembers its size; top bar fits 1280 px | not testable: the window size is the host's | same |
| MIDI mapping (Control workspace, LEARN) | skipped: hidden by design until the controller feature exists | same |
| SysEx import | md-lib-syx-import (with GEARMULATOR_MDMM_SYX_FILE: the file the native chooser would give; kits, as from a cable, read back) | mm-lib-syx-import (the same, on SYSEX RECV) |
| SysEx import with globals, then M on the rail and PLAY (the mute holds), then the pattern ‹ › stopped and playing (B-026, B-031) | md-lib-syx-import-mute | mm-lib-syx-import-mute PASS (2026-10-10, the Autechre backup: its global has CHANNEL SPAN 0, so the M is refused, the notice's "Give each track its own channel" taken, then M mutes and holds while playing) |
| A file dropped on the window (macOS, 2026-10-09): a .syx opens its import window | md-drop-syx (with GEARMULATOR_MDMM_SYX_FILE, dropped through the window's drop path; not run yet) | mm-drop-syx (the same; not run yet) |

## Sequence

| Feature | Machinedrum | Monomachine |
|---|---|---|
| Trigs / notes by click (MM: piano roll) | md-seq-first-beat PASS | mm-seq-first-beat PASS |
| Drag-paint steps, one undo step (MM: the roll: a new note dragged sideways paints, Alt-drag erases, 2026-10-05; slide and swing on a selection from the step menu, one undo step, 2026-10-12) | md-seq-paint-undo PASS | mm-seq-slide-swing PASS, mm-seq-roll-paint PASS (paint, erase, each one undo step) |
| Piano roll note length (I-010, 0.5 slice 3): Draw at 1/16, a note and its NOTE OFF; the Len key at 1/8, a note two steps long; a note's end dragged to the next note (its NOTE OFF goes, Len 3/16); undo | — | mm-roll-draw-length PASS (2026-10-10) |
| Piano roll Draw off (I-007, slice 3): B, a box round a note selects it with its NOTE OFF, a drag moves both, Delete, B again, undo | — | mm-roll-box-move PASS (2026-10-10; the first run found a 1/16 note on narrow columns pressed as its end: the end zone is now at most a third of the bar) |
| A MIDI note's length is its LEN, 6 a step (slice 3, measured): a 1/16 note is LEN 6, its end dragged to three steps locks LEN 18 | — | mm-roll-midi-len PASS (2026-10-10) |
| Accent (Shift-click), slide (Alt-click) | md-seq-accent-slide PASS | — (MM: Slide under the roll, above) |
| Trig types: Trig · Accent · Swing · Slide (MD, with All tracks · This track), Esc back (wave 3). MM since 2026-10-12: no trig type row; slide, swing and the envelopes are in the step menu, marks on the notes | md-seq-trig-types PASS | mm-seq-slide-swing PASS, mm-seq-env-trigs PASS |
| Lock lane: pick a parameter, draw locks, clear | md-seq-lock-lane PASS | mm-seq-lock-lane PASS |
| Lock lane ramp (Shift-drag), erase (Alt-drag), wheel on a step | md-seq-lock-ramp-erase-wheel PASS | mm-seq-lock-ramp-erase-wheel PASS |
| Pages: ALL, PAGE, [ ] | md-seq-pages PASS | mm-seq-pages PASS |
| Copy, paste, clear steps (Cmd+C, Cmd+V; since K2 (MD) and K7 (MM): Delete with no selection does nothing, Clr clears the page) | md-seq-copy-paste-clear PASS | mm-seq-copy-paste-clear PASS (2026-10-10, K7) |
| Select steps with ⌘-click / ⌘-drag (K2; MM K7: the piano roll, ⌘⇧-click on the next track's roll for a two-track block), the LCD's PASTE and CLR on the selection, ⌘D | md-seq-select-copy-paste PASS | mm-seq-select-copy-paste PASS (2026-10-10) |
| The step menu (right-click a step, K3; MM K7: in the roll): accent (MM: slide; since 2026-10-12 also swing, the envelopes, trigless), copy, paste here | md-seq-step-menu PASS | mm-seq-step-menu PASS (2026-10-10) |
| Cmd+C, Cmd+V, Cmd+Z as the operating system delivers them (real `NSEvent`s through AppKit's key path, `u.osKey`; B-015), standalone and VST3, 2026-10-08 | md-seq-os-copy-paste PASS (FAIL without the fix: no key reached the page) | mm-seq-os-copy-paste PASS (2026-10-10, standalone) |
| A selected step copied and pasted with the mouse (the top bar's Copy, Paste, Clr), 2026-10-08 | md-seq-copy-paste-buttons PASS | mm-seq-copy-paste-buttons PASS (2026-10-10) |
| Clear the whole pattern (Alt+Delete), undo | md-seq-clear-pattern-undo PASS | mm-seq-clear-pattern-undo PASS |
| Every-N fill (the step menu: MD since K3, MM since K7) | md-seq-fill-every PASS | mm-seq-fill-every PASS (2026-10-10, the step menu) |
| Rotate (Alt+← →) | md-seq-rotate PASS | mm-seq-rotate PASS |
| A rotate run ends when Alt is seen up in any event: the next rotate is its own undo step (2026-10-05) | md-seq-rotate-undo PASS | mm-seq-rotate-undo PASS (2026-10-10); mm-seq-roll-paint PASS (after mm-seq-rotate, its paint and erase are their own undo steps) |
| Paste to many marked tracks (Shift-click headers) | md-seq-paste-many PASS | mm-seq-paste-many PASS (2026-10-11: a copied four-step selection, each marked track keeps the rest of its page, decision A; FAIL on the 0.5.0 page) |
| Copied steps pasted with nothing selected: only the copied steps, the rest of the page kept (MM decision A, 0.5.1; the MD's paste always did) | not covered (its page sends no "to") | mm-seq-paste-steps-keeps-page PASS (2026-10-11; FAIL on the 0.5.0 page: the rest of the page cleared) |
| Live recording (REC / Alt+Space) | md-seq-live-record PASS | mm-seq-live-record PASS |
| GRID RECORDING (MM RECORD stopped) | — | mm-seq-grid-record PASS (bug 4, fixed; see note 2) |
| LEN on LCD line 2 | — | mm-seq-len PASS |
| Arpeggiator dock | — | mm-seq-arp PASS |
| Arpeggiator RNGE to the machine's end (9 OCT, range 8: 0.3.5), kept | — | mm-seq-arp-range |
| Clickable transpose keyboard | — | mm-seq-transpose-keyboard PASS |
| SYNTH / MIDI side switch | — | mm-sound-midi-side PASS (Sound) |

## Generators and mutation

| Feature | Machinedrum | Monomachine |
|---|---|---|
| GEN: roll a rhythm, one undo step | md-gen-mutate-undo PASS (bug 1, fixed); md-gen-defaults-mutate-undo PASS | mm-gen-mutate-undo PASS |
| GEN keys and values (R, Defaults, Hits) | md-gen-keys-r PASS | mm-gen-keys-r PASS |
| MUTATE a sound, one undo step | md-gen-defaults-mutate-undo PASS | mm-gen-mutate-undo PASS |
| MUTATE scope chips, amount | md-gen-mutate-scope PASS | mm-gen-mutate-scope PASS |

## Sound

| Feature | Machinedrum | Monomachine |
|---|---|---|
| Sound page grouped by function | md-sound-shape-undo PASS | mm-sound-shape-undo PASS |
| Drag a value, undo restores the kit | md-sound-shape-undo PASS | mm-sound-shape-undo PASS |
| Type a value (⌘-click or Enter on a value box): one undo step, refused past the ends, a list takes its names (I-022) | md-sound-type-value PASS (page tier) | mm-sound-type-value PASS (page tier) |
| A note from a MIDI keyboard lights its track: rail number, Mix LED (I-002) | md-sound-note-light PASS (page tier) | — |
| A focused value: ↑ ↓ step it | md-sound-value-keys PASS (bug 2, fixed) | mm-sound-value-keys PASS (bug 3, fixed) |
| Machine picker, undo | md-sound-machine-pick-undo PASS | mm-sound-machine-pick-undo PASS |
| A picked machine stays after a step on Sequence, whose dump reloads the kit on the machine (B-027) | — (mdDeskFirmwareTest machine) | mm-sound-machine-stays |
| Copy / paste a sound | md-sound-copy-paste PASS | mm-sound-copy-paste PASS |
| Screens (curve editors): drag a handle | md-sound-screen-drag PASS | mm-sound-screen-drag PASS |
| Control All (Alt-drag), one undo step | md-sound-control-all PASS | mm-sound-control-all PASS |
| The GLOBAL key in the top bar (where FN was until 0.3.5): opens the panel, lit, Esc closes | md-global-key | mm-global-channels |

## Mix

| Feature | Machinedrum | Monomachine |
|---|---|---|
| Mute and solo; un-solo keeps the mutes (0.3.0) | md-mix-mute-solo PASS | mm-mix-solo PASS |
| Drag across M keys | md-mix-mute-solo PASS | mm-mix-drag-m-keys PASS |
| Shift-armed mutes | md-mix-shift-mutes PASS | mm-mix-shift-mutes PASS |
| M/S off | md-mix-ms-off PASS | mm-mix-ms-off PASS |
| Volume / LEVEL fader, undo | md-mix-fader-undo PASS | mm-mix-level-mute PASS (Undo key), mm-mix-fader-undo PASS (⌘Z, 2026-10-10) |
| Strip mute | md-mix-mute-solo PASS | mm-mix-level-mute PASS |
| PAN / trim boxes | md-mix-pan-undo PASS | mm-mix-pan-undo PASS |
| Outputs: OUT key / routing mode | md-mix-out-route PASS | mm-mix-routing PASS |
| Master effects | md-mix-master-fx PASS | — |
| MIDI track mutes (MUTE window) | — | mm-perform-midi-mutes PASS |

## Song

| Feature | Machinedrum | Monomachine |
|---|---|---|
| Arrange: add a pattern row, delete, undo | md-song-arrange-rows PASS | mm-song-rows PASS |
| Chain: pads chain at once, Clear ends it | md-song-chain PASS | mm-song-chain PASS |
| Song picker (any of 24), Load on the machine | — | mm-song-picker-load PASS |
| Row inspector (repeat, mutes), loops | md-song-row-inspector PASS | mm-song-row-inspector PASS |
| Drag pads and rows on the grid | md-song-drag-drop PASS | mm-song-drag-drop PASS |

## Sampler (Machinedrum) and Perform (Monomachine)

| Feature | Machinedrum | Monomachine |
|---|---|---|
| Sample slots: browser of waveform tiles | md-sampler-slots PASS | — |
| Set up sampling (recorder, player), one undo step; the recorder samples the main mix at VOL 0 (out of the mix), an input gives VOL back | md-sampler-setup-undo PASS | — |
| Audition a sample | md-sampler-audition PASS (SKIP when the machine has no UW sample, B-012) | — |
| A sample dropped on the window into the selected ROM slot (macOS, 2026-10-09) | md-drop-sample (with GEARMULATOR_MDMM_WAV_FILE; not run yet) | — |
| Load a WAV / AIFF and audition it before keeping it | not testable: native file chooser | — |
| RAM view steps; freeze / live | md-sampler-ram-view PASS | — |
| Chops right after Set up sampling keep RAM-R / RAM-P (B-025) | md-sampler-setup-chop PASS | — |
| POLY | — | mm-perform-poly PASS |
| MULTI TRIG mode | — | mm-perform-multi-trig PASS |
| MULTI MAP: split and delete a range | — | mm-perform-multi-map PASS |
| Perform keyboard plays | — | mm-perform-keyboard PASS (the note reaches the plug-in; live notes have no read-back) |
| Perform keyboard: a key lit while held (mouse, computer keys, MIDI keyboard), dark when let go (B-062, I-002) | — | mm-perform-keys-lit PASS (page tier) |
| Joystick, assign rows, multi envelope, PORTAMENTO | — | mm-perform-joystick-assign PASS, mm-perform-menv-portamento PASS |

## Library and GLOBAL

| Feature | Machinedrum | Monomachine |
|---|---|---|
| Kit library: a click loads at once | md-lib-load-save-dialog PASS | mm-lib-kit-load PASS |
| Save as a slot, answering the overwrite question | md-lib-load-save-dialog PASS | mm-lib-kit-saveas PASS |
| Copy / paste a kit slot, undo | md-lib-kit-copy-paste-undo PASS | mm-lib-kit-copy-paste-undo PASS |
| Rename a kit slot (with its question), undo | md-lib-kit-rename-undo PASS | mm-lib-kit-rename-undo PASS |
| Clear a kit slot, undo | md-lib-kit-clear-undo PASS | mm-lib-kit-clear-undo PASS |
| Pattern chooser: a click switches | md-lib-pattern-go PASS | mm-lib-pattern-go PASS |
| Clear a pattern slot (with its question), undo | md-lib-pattern-clear-undo PASS | mm-lib-pattern-clear-undo PASS |
| GLOBAL: a setting read back (TEMPO OUT) | md-global-tempo-out PASS | — (MM globals: the Perform and Mix journeys) |
| GLOBAL › ROUTING fits its dialog, a route read back | md-global-routing PASS | — |
| GLOBAL › MIDI: CHANNEL SPAN 0 refuses a track's mute (a notice with Give each track its own channel), its sound value still reaches the machine; the notice's key, then the mute lands (B-051) | — | mm-global-channels |
| GLOBAL › Clear: asked, then the factory global read back | md-global-reset | mm-global-reset |
| GLOBAL as a page under the header (0.6): as wide as it, the head on one line; a workspace tab goes back | md-global-page | mm-global-page |
| GLOBAL › Copy, a change, Paste (asked), Undo (0.6) | md-global-copy-paste | mm-global-copy-paste |
| GLOBAL › TRIG IN A / B: Gate and Dest stepped, Undo (0.6, P3) | md-global-trig-in | — |
| GLOBAL › Map editor › LEARN: a note from a MIDI keyboard (midiIn) maps to the track; Reset map (asked) (0.6) | md-global-learn | — |
| GLOBAL › AUDIO › MASTER TUNE: 0.1 Hz and 1 Hz steps, Undo (0.6) | — | mm-global-tune |
| GLOBAL › CONTROL OUT1: OUT and its warning, INT+OUT, INT (0.6, P2) | — | mm-global-control-out |
| GLOBAL's slot keys: another slot active, then back | — | mm-global-slot |
| Song page: PATTERN | SONG switch, lit from the machine's status (0.3.5) | md-song-mode | mm-song-mode |
| Song page: the song playhead (the row the machine plays, from RAM), What plays, PAT/SONG on the LCD (0.3.5) | md-song-playhead | mm-song-playhead |
| GLOBAL › Map a note: a note to a pattern of bank C-H and to STOP (the MAP EDITOR's 16-145, 0.3.5), read back | md-global-map-note | — |

## Bugs the journeys found (all four fixed on this branch)

1. **Machinedrum: GEN offers Keep for every track until Defaults is pressed** (md-gen-mutate-undo). The GEN specs
   are made once, at the first render (`genEnsure`, mdDeskGenUi.js), which happens before the kit document is in,
   so every track is still GND-EMPTY and gets Keep. A kick track's GEN bar shows Keep and R says "Track 1 is set to
   keep: nothing to randomise." The Monomachine page makes its specs again when a track's machine changes
   (76-gen.js, `genSpecs`) and does not have it. Log:
   `JOURNEY md-gen-mutate-undo 2/7 FAIL the GEN bar offers the track's generator, not Keep: screen: GEN mode shows keep for TRX-B2 (role kick); every track's spec: kkkkkkkkkkkkkkkk`
   Fixed: a spec the person never changed follows its track's machine (mdDeskGenUi.js `genEnsure`, `genSpecs`,
   `setGenSpec` marks a spec edited); mdDeskPageTest.js checks it.
2. **Machinedrum: a focused value loses the keys after its first step** (md-sound-value-keys). ↑ on a focused Sound
   value sends one step; the read-back re-renders the workspace, the focused box is replaced, the focus falls to the
   page, and the next ↑ selects the previous track instead (the key map says a focused value keeps ↑ ↓). Log:
   `JOURNEY md-sound-value-keys 3/4 FAIL focus an effects value and press ↑ three times: screen: shows 0, want 3 (from 0); selected track 16 (was 1); focus now BODY; machine: kit 2`
   Fixed: `render` (mdDeskRender.js) gives the focus back to the same value (by its data-g/n/t/f/src/li/gv) after
   the workspace is drawn again.

3. **Monomachine: a focused Sound value loses the arrow keys after one step** (mm-sound-value-keys), the same as
   bug 2 was on the Machinedrum: ↑ on a focused value sends one step, the read-back redraws the workspace, the focus
   falls to the page and the next ↑ selects another track. Log:
   `JOURNEY mm-sound-value-keys 3/4 FAIL focus a filter value and press ↑ three times: machine: kit 7, want 9 (from 6); selected 5; focus BODY`
   Fixed: `render` (mm-mockup/src/130-main.js) gives the focus back to the same value after the page is drawn
   again, as the Machinedrum's mdDeskRender.js does.
4. **Monomachine: a panel key pressed while the machine takes a dump on SYSEX RECV was lost** (mm-seq-grid-record).
   After edits and undos the desk parks the machine on GLOBAL › FILE › SYSEX RECV and sends the dumps. Measured
   (`mmDeskFirmwareTest <MM ROM> parked`): a key the machine gets while it is still taking a dump (about 40 ms for a
   pattern) is lost; once the dump is taken, RECORD, PLAY, STOP, the MUTE window and BANK GROUP all work on SYSEX
   RECV. The desk pressed RECORD in that window, answered ok, and the machine stayed at record off. Log:
   `JOURNEY mm-seq-grid-record FAIL step 1 "click RECORD (stopped): GRID RECORDING": machine: record off (seen off); results record:true ; recv parked -> idle; page: toast "GRID RECORDING on the machine: its TRIG keys write steps; the editor reads them back."`
   Fixed: `RecvSession::taking()` (mmDesk/mmRecv.h) says a dump sent is not taken yet (the machine's RECV count, messages
   and errors, has not caught up); `MmMachine::pressKeys` (mmDeskCommands.cpp) and `pressBankTrigs` (mmDeskChain.cpp)
   refuse then with "The panel is busy (SYSEX RECV); try again." (as while RECV enters or leaves), and
   `MmMachine::pumpRecv` (mmDeskDelivery.cpp) holds the next dump while the person's keys are on their way. mmDeskTest
   checks both (RECV session: a dump being taken; the desk against the scripted machine).

## Notes

1. The journeys play the person through synthetic events at an element's centre and refuse a covered element.
   What the browser does by itself on a focused button (Enter, Space click it) is done by the runner the same way.
2. Monomachine: PLAY (Space) and RECORD pressed while the plug-in has the panel in SYSEX RECV for an edit are refused
   with "The panel is busy (SYSEX RECV); try again." The journeys press again, as the toast says. By design, but
   seen right after an edit or an undo.
3. A hidden window (display asleep, covered) gets no animation frames and slow timers: the canvas journeys are
   skipped there; tap tempo checks the BPM against the taps' real spacing.
4. Pointer capture: a drag's moves and release go to the element the page captured (as the browser does), so a redraw
   during the drag (the lock lane's ramp) does not lose it.
5. A journey's Alt chord (`u.key(k, {alt: true})`) sends no keyup of Alt itself. The Monomachine page now ends a
   rotate run on any event without Alt as well (MM-PORT-PLAN.md 2026-10-05), so the journeys after `mm-seq-rotate` keep
   their own undo steps.

## Independent journeys: how to write one

Radek's rule (2026-10-13): **every journey is independent.** Alone, in any order, from fresh settings (factory memory), it passes on
its own: it builds the data it needs itself (pattern, kit, song, global state, mode, selection) and its tidy puts back what it
changed. No journey may rely on what an earlier one left behind, and none may leave anything for the next one to find. The runner
used to put the page right between journeys (close dialogs, stop the transport, back to PATTERN mode); that hid the journey that
left the mess. It is now a guard: it says what the one before left and fixes nothing (only after a journey that FAILED, whose tidy
may not have run to the end, it puts the page right, and says so).

### The four parts

1. **Setup: the journey builds what it needs.** A journey that needs a free step, two trigs, a pattern with a lock free, a kit
   that is saved or two patterns that recall one kit, makes them in its first steps (a trig drawn, a kit saved, a pattern linked)
   and never reads them from what the machine happens to hold ("no free lock row on a track with a trig" and "no two patterns
   with one kit" were the symptoms of a journey that took what an earlier one had left). Modes and UI toggles it depends on are
   set by the journey as a person sets them (More open: click it only when it is shut; PATTERN or SONG mode: the Song page's keys).
2. **Proof: the two checks.** Each step's `screen` and `machine` check what a person sees and what the machine read back. A step
   never waits on timing that another journey's leftovers could move.
3. **Snapshot.** `Journey.snapshot(name)` where a picture is the journey's evidence (the e2e run takes one at the last step otherwise).
4. **Tidy: put back what the journey changed**, pass or fail, with the page's own helpers (below). The check after it is the guard.

### The helpers (each page's journey file, mdDeskJourneys.js and mmJourneys.js: the same names)

| helper | what it does |
|---|---|
| `c.undo0`, `c.mode0`, `c.pat0`, `c.kit0`, `c.kitw0`, `c.chain0` | set by the runner before step 1 (`begin`): the undo depth, PATTERN or SONG mode, the pattern and the kit the machine is on, the kit's `clean` or `edited`, whether a chain plays |
| `await back(u, c)` | the tidy's one call for editor state: transport and recording stopped, every edit undone (one undo at a time, the machine's answer awaited between: a rush left a level behind), the chain cleared, the mode, pattern and kit as found, a kit that was clean and is called edited after an undo saved again (the same sounds), and the slots kept with `keep` pasted back. Edits to restore first, then any command that is itself an edit (an undo after it would take it back) |
| `await keep(c, "kit" \| "pattern" \| "song", slot)` | the slot the journey is about to overwrite and the product cannot undo (a save over a kit, the machine's own live erase): its content goes to the plug-in's clipboard, `back` pastes it back. One slot per kind |
| `await keepTwo(c, kind, a, b)` | two slots (an import writes two kits and two patterns): the first to the clipboard, the second overwritten by a copy of the first, which is an undo step that holds the second's content: `back` undoes it, then pastes the first |
| `await keepImportTargets(c)` | the import panel's preview (`kit:N`, `pattern:N`): `keep` or `keepTwo` for each kind; more than two of a kind is an error (the journey keeps two) |
| `undoTo(u, n)`, `undoUntil(u, done, n)` | the undo, awaiting the machine |
| `freeSteps(t, n, from)`, `soundTrack()`, `empties(n)`, `scratch()` | free steps, a sound track, empty or scratch song slots |

The factory memory the page tier starts from holds a full machine (every kit named, every pattern with trigs, every song with
rows): there is no spare slot to borrow, so a journey that writes a slot keeps it first or does it in a way the undo takes back.

### What the guard says

Before each journey the runner reads the page's `state()` (the machine's documents, its modes, the kit's clean or edited), after the tidy again, and logs the difference by the
journey's name: `JOURNEY <name> left: <what> (at <char>: <was> -> <now>)`. For the ones it cannot read as a document it names them: `before: left a question open`,
`left the machine in SONG mode`. `scripts/mdmm-page.mjs` ends its report with a WARN listing them; `mdmm-journeys.sh` prints them in the report. The UI's own state
(workspace, selection) is not compared: each journey picks what it needs. A slot loaded in only one of the two readings is not a change.

### A journey that cannot put its change back: `alone: true`

An empty reset has no undo and no copy to keep: `md-engine-reset-empty` and `mm-engine-reset-empty` are marked `alone: true`. The runners
(`mdmm-page.mjs`, `mdmm-journeys.sh`, so `mdmm-e2e.sh`) start each in a page or an editor of its own, and in one page it plays last. A journey earns
that mark only when the product offers no way back (finding B-110 in the 0.6 evidence: no undo for a SysEx import or an empty reset).

### Proving it

```sh
node scripts/mdmm-page.mjs --isolate --jobs 4 both        # every page journey in a page and a stub host of its own (about 8 minutes)
node scripts/mdmm-page.mjs --shuffle 101 --jobs 2 both    # a seeded random order; the seed is printed, the same seed plays the same order
scripts/mdmm-e2e.sh both --shuffle 7 --jobs 2             # the real firmware, shuffled
scripts/mdmm-e2e.sh md --isolate --select 'journey-md-song-*'   # each journey in an editor of its own, fresh from factory memory (one start each: for a few)
node scripts/mdmm-page.mjs --list both                    # the names a selector picks ("LIST md: ..."), and the alone ones ("ALONE md: ...")
```

A selector may leave journeys out with `!`: `journey-*,!md-lib-syx-place`. Add `:shuffle-<seed>` or `:list` to a selector the page reads (`?selftest=journey:shuffle-5`, `GEARMULATOR_MDSTUDIO_SELFTEST`).
A journey that passes in a run and fails alone, or the other way round, depends on one before it: find the one that logs `left:` and fix its tidy.

## 0.6 slice 5: the Machinedrum journeys for the rows that had none

Written 2026-10-12 from doc/features/unproved-md.md: each journey names the rows it proves (`proves:`), all in the page tier (headless Chrome on the real core, `scripts/mdmm-page.mjs`), with the guide's pictures as snapshots. Where an existing journey already did the thing, its `proves:` grew instead (MD-279 and MD-283 to MD-295 in the kit, pattern, song, mix and sound journeys). Two rows have none: MD-192 and MD-200 need a dropped sample file, so only the machine tier with a WAV can show them.

| Journey | Rows |
|---|---|
| md-top-mode | MD-004, MD-087, MD-088, MD-138 |
| md-seq-scale | MD-103, MD-104, MD-105 |
| md-seq-swing-accent | MD-126, MD-130 |
| md-top-tempo-steps | MD-089 |
| md-lib-pattern-chooser | MD-006, MD-095, MD-120, MD-291 |
| md-lib-kit-menu | MD-018, MD-030, MD-038, MD-040 |
| md-lib-kit-memory | MD-109, MD-102 |
| md-quick-start | MD-035 |
| md-sound-knob-steps | MD-036 |
| md-sound-machine-reference | MD-211 to MD-274 (63 rows) |
| md-sound-track-effects | MD-011 to MD-069 (13 rows) |
| md-sound-filter-sweep | MD-101 |
| md-sound-relations | MD-049, MD-050, MD-290 |
| md-sound-keep-clear | MD-048, MD-053 |
| md-mix-master-cards | MD-071, MD-072, MD-073, MD-074, MD-287 |
| md-sound-lfo | MD-288 to MD-085 (11 rows) |
| md-sound-ctr-locks | MD-075 |
| md-global-settings | MD-093, MD-170, MD-171, MD-185, MD-186, MD-188, MD-281 |
| md-global-channel-trig-slot | MD-172, MD-168, MD-282 |
| md-global-map-track | MD-165, MD-284, MD-276 |
| md-sound-cc-channels | MD-277 |
| md-lib-syx-original | MD-182 |
| md-sampler-rename | MD-197 |
| md-lib-kit-name-save | MD-280, MD-283 |
| md-song-commands | MD-143, MD-152, MD-153, MD-155, MD-156, MD-161, MD-295 |
| md-top-play-mode | MD-295 |
| md-seq-page-leds | MD-021, MD-028 |
| md-sound-focus-info | MD-031 |
| md-seq-clear-page | MD-119 |
| md-seq-clear-locks | MD-115 |
| md-seq-swing-copy | MD-133 |
| md-keys-mutes-persist | MD-125 |
| md-seq-lock-budget | MD-137 |
| md-seq-live-lock | MD-139 |
| md-limits | MD-207 |

## 0.6 slice 5: the Monomachine journeys for the rows that had none

Written 2026-10-12 from doc/features/unproved-mm.md: 205 done rows had no journey, now every one of the 327 has at least one (`proves:`), all in the page tier (headless Chrome on the real core, `scripts/mdmm-page.mjs`), with the guide's pictures as snapshots. The page tier's stub host (deskStubHost) now also hands the page what the core gives the device edge as `{type: "wire"}` messages: each CC, NRPN and note as the wire engine encodes it (the base channel from the global, deskWire's encoders) and every SysEx's first sixteen bytes and length, so a journey checks the CC number, the channel, the NRPN triple, the note's velocity and the SysEx's id and slot against the manual's Appendix B and C, not only that something was sent. The stub also locks a value turned during live recording (MM-082, MM-207) and keeps the kit when a pattern recalls the kit that plays (the firmware's way: `mmDeskFirmwareTest machine`, "another pattern with the same kit"). Comparisons of lists are in the manual's order, never sorted; each knob's edit is checked against its own kit cell, only that cell, and its own CC.

| Journey | Rows |
|---|---|
| mm-sound-machine-reference | MM-063, MM-091, MM-110, MM-111, MM-324 to MM-335, MM-337 to MM-346 (26) |
| mm-sound-track-effects | MM-084, MM-092, MM-114 to MM-119, MM-121 to MM-127, MM-129 to MM-134 (21) |
| mm-sound-lfo | MM-007, MM-135 to MM-142, MM-144 (10) |
| mm-mix-buses | MM-005, MM-109, MM-276 to MM-284, MM-377 (12) |
| mm-wire-cc | MM-289, MM-353 to MM-360, MM-362 (10) |
| mm-seq-env-trigs | MM-029, MM-047, MM-085, MM-143, MM-171, MM-209, MM-210, MM-211, MM-212, MM-213, MM-214 (11; since 2026-10-12 through the step menu) |
| mm-seq-pitch-keys | MM-028, MM-034, MM-074, MM-077, MM-173, MM-174, MM-176, MM-348 (8) |
| mm-seq-locks | MM-017, MM-113, MM-205, MM-206, MM-208 (5) |
| mm-seq-record-locks | MM-082, MM-207 (2) |
| mm-seq-arp-setup | MM-008, MM-216, MM-218, MM-220, MM-222 to MM-225 (8) |
| mm-seq-scale-setup | MM-046, MM-168, MM-169, MM-227 to MM-230 (7) |
| mm-seq-trig-setup | MM-121, MM-151, MM-153, MM-161 (4) |
| mm-midi-seq | MM-003, MM-048, MM-086, MM-242, MM-244 to MM-247, MM-249, MM-314, MM-315 (11) |
| mm-midi-seq-docks | MM-248 (1) |
| mm-perform-keys-channels | MM-073, MM-088, MM-089, MM-291, MM-292, MM-293, MM-349, MM-350, MM-351 (9) |
| mm-perform-multi-setup | MM-154 to MM-159, MM-302, MM-303 (8) |
| mm-perform-assign | MM-146, MM-147, MM-148, MM-150 (4) |
| mm-perform-joystick-midi | MM-053, MM-352, MM-366 (3) |
| mm-perform-menv-nrpn | MM-365 (1) |
| mm-song-row-settings | MM-170, MM-199, MM-260, MM-263, MM-264, MM-265, MM-267, MM-273, MM-274, MM-275 (10) |
| mm-song-rows-copy | MM-269 (1) |
| mm-global-sync | MM-297, MM-298 (2) |
| mm-seq-spell-word | MM-335, MM-336 (2) |
| mm-seq-bbox-drums | MM-329 (1) |
| mm-lib-pattern-chooser | MM-035, MM-037, MM-163, MM-189 (4) |
| mm-lib-pattern-same-kit | MM-094 (1) |
| mm-lib-kit-slots | MM-097, MM-098, MM-108 (3) |
| mm-kit-parts | MM-093, MM-105, MM-106, MM-372 (4) |
| mm-seq-copy-page | MM-185, MM-204 (2) |
| mm-wire-sysex | MM-370, MM-374, MM-375, MM-376, MM-380 to MM-384 (9) |
| mm-lcd-boxes | MM-064, MM-066, MM-068 (3) |
| mm-perform-mutes | MM-036, MM-238 (2) |
| mm-seq-six-tracks | MM-002, MM-006, MM-009 (3) |
| mm-seq-bank-functions | MM-038 (1; slide and swing from the step menu since 2026-10-12) |

What the journeys found (no row went down): the manual's phaser page lists no INP, the machine has it (every FX machine takes an input), so mm-sound-machine-reference expects it; the Perform assign Copy and Paste take the five tabs' rows (R, U, D, VEL, KEY) and leave the two left-joystick rows alone (the editor has no box for them: MIRR makes them follow the right); PAN goes out as CC 62 only (the machine also answers the standard CC 10); the multi envelope's sixth NRPN (0x45) has no box on the page.

## 0.6 wave 12: the gaps (`feat/0.6-gaps`)

The rows Radek's gap triage (2026-10-12) put in 0.6, each built and proved by a journey of its own; the firmware facts
under them are doc/modern-ux/PROBES-manual-gaps.md W12. Page tier, 2026-10-12: all pass.

| Journey | Rows |
|---|---|
| md-sound-clips | MD-033 |
| md-lib-undo-kit | MD-043 |
| md-lib-kit-clear-undo (values checked now) | MD-045 |
| md-top-stop-queued | MD-099 |
| md-seq-len-repeats | MD-106 |
| md-song-repeats-left | MD-147 |
| mm-lib-undo-kit | MM-102 |
| mm-seq-clear-step-locks | MM-083, MM-184, MM-203 |
| mm-seq-lock-current | MM-201 |
| mm-lib-pattern-kit | MM-095 |
| mm-song-counter | MM-271 |
| mm-perform-map-pattern | MM-301 |
| mm-top-plate (checks the look now) | MM-322 |
