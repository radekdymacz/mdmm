> Generated from doc/features/mm.json by scripts/mdmm-guide.mjs; edit the JSON.

# Feature map: Monomachine manual against the Monomachine Editor

Manual: Monomachine SFX-6 / SFX-60 / SFX-60 MKII / SFX-60+ MKII user's manual, OS 1.32, rev H (`doc/manuals/monomachine-manual.pdf`, 158 pages). Date of this map: 2026-10-10, rechecked 2026-10-11 against the 0.5.0 release and the merges after it.

Checked against main at 6da67ce3e, 2026-10-11.

**The question per row:** does our web page (the editor, not the firmware's LCD or panel) let the person do this?

**Our UI column**

- ✅ Yes: the page has its own control.
- 🟡 Partial: some of it, or a different way, or only part of the range.
- ❌ No: the page has no control for it.
- ➖ N/A: hardware only (power, jacks, rack, test mode) or not a function of an editor.

**Notes column** says how the firmware side stands. The shipped product has no emulated front panel or LCD: the page is the only UI (`mdEditorPages.h`; the panel skin `mmSfx60` is out of the build). The editor presses panel keys itself where it must (PLAY, STOP, RECORD, the MUTE window, BANK + TRIG for chains, SYSEX RECV). So "firmware does it" means the real OS does the work once the page, MIDI or a SysEx dump asks. On the HW MIDI engine the real machine's own panel can do what the page cannot.

"Where" names the workspace (Sequence, Sound, Mix, Perform, Song; Control is hidden unless the plug-in enables MIDI mapping) or the header (LCD fields, kit library, pattern chooser, SysEx panel, AUDIO / MIDI panel). Every claim marked ✅ or 🟡 was checked in the page source (`skins/mmStudio/src/*`, built into `skins/mmStudio/mmMockup.js`, plus `mmAdapter.js`) and the desk (`mmDesk/mmDeskModel.cpp` command table, `mmDeskEdit.cpp`, `mmDeskCommands.cpp`). The older `mm-manual-mapping.md` was design-time and is stale in places (chaining, rotate, tap tempo, live recording, the GLOBAL panel and step selection are now built). Since 0.5.0 the GLOBAL panel lives in `skins/shared/deskGlobal.js` with the Monomachine's cards in `mmStudio/src/117-global.js`, step selection in `mmStudio/src/77-select.js` with `skins/shared/deskSelect.js`, and the piano roll's lengths, Draw and box select in `58-roll.js` and `70-seq.js`.

Manual page numbers are the manual's own (1-xx, A-x, B-x, C-x).

## 1. Introduction, philosophy, highlights (1-1 to 1-3)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| Conventions 1-1 | Key, knob, LED conventions | How the manual writes controls | ➖ | – | Documentation only | – | n/a |
| Highlights 1-2 | 6 track internal sequencer with synthesis | Six sequenced mono synth tracks | ✅ | Sequence, Sound | `mmDesk` kit + pattern documents | 1 | pass (e2e-mm-seq-six-tracks) |
| Highlights 1-2 | 6 track external MIDI sequencer | Six MIDI tracks per pattern | ✅ | Sequence, SYNTH / MIDI switch in the rail | Edits `p` tracks 6-11 | 1 | pass (mm-midi-roll) |
| Highlights 1-2 | 5 Monosynths (SuperWave, SID, DigiPRO, FM+, VO) | Machine families | ✅ | Sound > machine picker | All 14 sound machines, see section 21 | 2 | pass (e2e-mm-sound-machine-pick-undo) |
| Highlights 1-2 | Dynamically controlled stereo effects (FX machines) | Four FX machines plus reverb, chorus etc. | ✅ | Sound > machine picker, Mix > INPUT | See section 21 | 1 | pass (mm-mix-routing) |
| Highlights 1-2 | 6 tape style tempo synced delays | One delay per track | ✅ | Sound > Effects (DTIM DSND DFB DBAS DWID) |  | 1 | pass (e2e-mm-seq-six-tracks) |
| Highlights 1-2 | 18 tempo synced LFOs | 3 per track | ✅ | Sound > LFO 1-3 |  | 1 | pass (mm-sound-lfos) |
| Highlights 1-2 | 12 arpeggiators | One per track, synth and MIDI | ✅ | Sequence dock > Arp |  | 1 | pass (e2e-mm-seq-arp-setup) |
| Highlights 1-2 | Full real-time control | Every DATA value live | ✅ | Every value box, drag or wheel | Sent as CC while dragging | 1 | pass (e2e-mm-seq-six-tracks) |
| Highlights 1-2 | DigiPRO user waveforms (MKII) | 64 user waveform slots | 🟡 | Export SysEx…: Waveforms W01 to W64, read from the machine into the .syx | An empty waveform answers nothing and is left out. | 1 | n/a |
| +Drive 1-3 | Snapshots, Digibanks, 8192 waveforms | Optional storage drive | ➖ | – | Not emulated, see section 19 | – | n/a |

## 2. User interface and connectors (1-4 to 1-9)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| Front panel 1-4 | 1 Master volume | Main and headphone level | ➖ | – | The app or DAW sets the level | – | n/a |
| Front panel 1-4 | 2 LCD graphical display | Shows tempo, level, 8 parameters, positions, kit, pattern, machine | 🟡 | Header LCD: tempo, position, pattern, kit, locks, line 2 | The firmware screen itself is not shown after start-up. Its content is spread over the page | – | n/a |
| Front panel 1-4 | 3 LEVEL knob | Track level (CC 7) | ✅ | Mix > LEVEL fader per track |  | 2 | pass (e2e-mm-mix-level-mute) |
| Front panel 1-4 | 4 DATA ENTRY knobs A-H | Eight parameters of the page | ✅ | Every value box (drag, wheel, arrows, double click resets; ⌘-click or Enter: type a value) |  | 3 | pass (e2e-mm-sound-shape-undo) |
| Front panel 1-4 | 4 Accelerated edit (press and turn) | Bigger steps | 🟡 | Shift = fine, Page Up / Down = x10 | Different gesture | – | n/a |
| Front panel 1-4 | 5 DATA PAGE keys, seven pages | SYN, AMP, FLT, EFX, LFO 1-3 | ✅ | Sound shows every page at once; lock lane page tabs |  | 1 | pass (e2e-mm-seq-locks) |
| Front panel 1-4 | 5 Both DATA PAGE keys open MULTI ENV | Multi envelope window | ✅ | Perform > Multi envelope |  | 1 | pass (mm-perform-menv) |
| Front panel 1-4 | 6 TRACK keys, select | Pick the track in focus | ✅ | Rail, Up / Down keys, Mix node click |  | 1 | pass (e2e-mm-keys-track-select) |
| Front panel 1-4 | 6 TRACK keys, mute / unmute (FUNCTION) | Mute a track | ✅ | M key per track, Perform > Mutes, key M | Shift + M prepares mutes | 7 | pass (e2e-mm-mix-level-mute) |
| Front panel 1-4 | 6 TRACK LED colours | Active, muted, in focus | 🟡 | Rail row dims when muted, selected row lit |  | – | n/a |
| Front panel 1-4 | 7 TEMPO key, tempo window | Tempo screen | ✅ | LCD > TEMPO (drag, arrows) |  | 1 | pass (e2e-mm-top-tempo-drag) |
| Front panel 1-4 | 7 Tap tempo (FUNCTION + TEMPO) | Tap | ✅ | Shift + B on every workspace; plain B on the others than Sequence | On Sequence, B is the piano roll's Draw (`75-comforts.js`) | 2 | pass (e2e-mm-keys-tap-tempo) |
| Front panel 1-4 | 8 FUNCTION key (secondary functions) | Modifier | ➖ | – | Replaced by Alt, Shift, Cmd and buttons | – | n/a |
| Front panel 1-4 | 9 KIT / SONG key | Kit menu or song menu | ✅ | LCD > KIT (kit library); Song workspace |  | 1 | pass (e2e-mm-lib-kit-load) |
| Front panel 1-4 | 9 GLOBAL (FUNCTION + KIT / SONG) | Global menu | ✅ | GLOBAL key in the top bar (a page under the header), engine menu > GLOBAL…, link in the AUDIO / MIDI panel | 8 slots with Copy · Paste · Clear, Control, Sync, Routing, Audio (master tune), Control out 1 (`deskGlobal.js`, `117-global.js`) | 1 | pass (e2e-mm-global-page) |
| Front panel 1-5 | 10 TRIG keys as keyboard | Play notes | ✅ | Home-row keys A-L and W-P, on-screen keyboard (Perform), roll keys |  | 2 | pass (e2e-mm-keys-play-notes) |
| Front panel 1-5 | 10 Velocity 80, or 127 with FUNCTION | Key velocity | ✅ | Keys C / V (20 40 60 80 100 127) |  | 1 | pass (e2e-mm-seq-pitch-keys) |
| Front panel 1-5 | 10 TRIG keys edit notes in grid mode | Step trigs | ✅ | Roll click, step menu (right-click, ⋯ or the Menu key): Note on / off, NOTE OFF, Trigless trig, Envelopes |  | 1 | pass (mm-sequence-workspace) |
| Front panel 1-5 | 10 BANK + TRIG selects pattern | Pattern pick | ✅ | LCD > PATTERN (‹ ›, chooser) |  | 1 | pass (e2e-mm-top-pattern-next) |
| Front panel 1-5 | 11 PATTERN / SONG key | Sequencer mode | ✅ | LCD line 2 PLAY PAT / SONG, Song > What plays | `seqMode` op | 1 | pass (e2e-mm-song-mode) |
| Front panel 1-5 | 11 POLY (FUNCTION + PATTERN / SONG) | Poly mode | ✅ | Perform > Keyboard > Poly, on the track selected (the editor presses its TRACK key) | `poly` op | 2 | pass (mm-perform-poly) |
| Front panel 1-5 | 12 ENTER / YES, EXIT / NO | Confirm, cancel | ➖ | – | Page dialogs | – | n/a |
| Front panel 1-5 | 13 ARROW keys; octave for TRIG keys | Navigate; octave | ✅ | Keys Z / X octave; arrows step values |  | 1 | pass (e2e-mm-seq-pitch-keys) |
| Front panel 1-5 | 14 BANK GROUP A-D / E-H | Bank group | ✅ | Pattern chooser shows all 8 banks |  | 1 | pass (mm-pattern-chooser) |
| Front panel 1-5 | 14 MUTE MODE (FUNCTION + BANK GROUP) | Mute window | ✅ | Perform > Mutes |  | 1 | pass (e2e-mm-perform-mutes) |
| Front panel 1-5 | 15 BANK keys A-H | Pattern bank | ✅ | Pattern chooser |  | 1 | pass (mm-pattern-chooser) |
| Front panel 1-5 | 15 BANK secondary: ARP, TRANSPOSE, SWING, SLIDE | Track settings windows | ✅ | Sequence dock > Arp, Transpose; step menu > Slide, Swing (marks on the notes in the roll); LCD SWG |  | 2 | pass (e2e-mm-seq-slide-swing) |
| Front panel 1-5 | 16 REC key (grid recording) | Grid mode on / off | 🟡 | LCD record key | Stopped = grid record; the page's step editing does not need it | 1 | n/a |
| Front panel 1-5 | 16 PLAY (pause on second press) | Start, pause | ✅ | LCD play key: ⇧-click or ⇧Space pauses (▶ blinks, the position holds), ▶ goes on; the ▶ menu (right-click or its ▾) | Over HW MIDI pause and Continue need GLOBAL › CONTROL IN › TRANSPORT = ACCEPT; the editor asks to set it. | 3 | stub-only (e2e-mm-seq-first-beat) |
| Front panel 1-5 | 16 STOP; STOP twice rewinds and silences | Stop, reset | ✅ | Panic: ⌘. or the ▶ menu's Panic (All Notes Off on each track's channel, then STOP twice) |  | 3 | stub-only (e2e-mm-seq-first-beat) |
| Front panel 1-5 | 16 REC + PLAY = live recording | Live recording | ✅ | Alt + Space, record key while playing | `record` op | 1 | pass (e2e-mm-seq-live-record) |
| Front panel 1-5 | 16 STOP + REC = step recording | Step recording | ✅ | Shift-click REC (stopped), or the ▶ menu's Step record |  | 1 | pass (e2e-mm-seq-step-record) |
| Front panel 1-5 | 16 Secondary: COPY, PASTE, CLEAR | Copy / paste / clear | ✅ | LCD COPY / CLR / PASTE, Cmd+C / V, Delete | Scope depends on the workspace; on Sequence it is the selected steps, else the page shown (`130-main.js` secAction) | 4 | pass (e2e-mm-seq-copy-paste-clear) |
| Front panel 1-5 | 17 SCALE key: page of 16 steps | Track page | ✅ | Sequence PAGE key and 4 page LEDs, keys [ ] |  | 1 | pass (e2e-mm-seq-pages) |
| Front panel 1-5 | 17 SCALE SETUP (FUNCTION + SCALE) | Length and speed | ✅ | LCD line 2 LEN, SPD |  | 1 | pass (e2e-mm-seq-scale-setup) |
| Front panel 1-5 | 18 TRIG SELECT: AMP / FILTER / LFO / ALL | Trig track | ✅ | Step menu > Envelopes > Amp, Filter, LFO (on a selection: every trig); the roll marks a trig that fires only some (their letters on the note) | Different UI, same data | 1 | pass (mm-sequence-workspace) |
| Front panel 1-5 | 18 MIDI SEQ mode (FUNCTION + TRIG SELECT) | Edit MIDI tracks | ✅ | SYNTH / MIDI switch |  | 1 | pass (mm-midi-roll) |
| Keyboard SFX-6 1-6 | Joystick (real time) | Expression control | ✅ | Perform > Assign pad (springs back) | Mouse; pitch bend / CC 1 / CC 2 map | 1 | pass (e2e-mm-perform-joystick-assign) |
| Keyboard SFX-6 1-6 | Keyboard | Real-time play and record | ✅ | Perform on-screen keyboard (keys lit while held, also from a MIDI keyboard); home row |  | 3 | pass (e2e-mm-perform-keyboard) |
| Keyboard SFX-6 1-6 | MULTI TRIG key | Toggle multi trig | ✅ | Perform > Multi trig |  | 1 | pass (e2e-mm-perform-multi-trig) |
| Keyboard SFX-6 1-6 | MULTI MAP (FUNCTION + MULTI TRIG) | Toggle multi map | ✅ | Perform > Multi map |  | 1 | pass (e2e-mm-perform-multi-map) |
| Keyboard SFX-6 1-6 | OCTAVE keys | Keyboard octave | ✅ | Perform Octave stepper |  | 1 | pass (e2e-mm-perform-joystick-midi) |
| Keyboard SFX-6 1-6 | KEYBOARD LEDs | Notes shown | ➖ | – | The roll shows pitches | – | n/a |
| Rear 1-7 | Power switch, power in, voltage selector, fuse | Power | ➖ | – |  | – | n/a |
| Rear 1-7 | MIDI Thru / Out / In | MIDI ports | 🟡 | AUDIO / MIDI panel (standalone): inputs, output, Bluetooth | In a DAW the host routes MIDI. Machine MIDI out reaches the host since 0.4.0. No MIDI THRU | – | n/a |
| Rear 1-7 | Audio inputs B / A | External audio into FX machines | 🟡 | Mix > IN select (INP A, B, AB) | Host audio goes to the input; the page chooses which input an FX machine reads | – | n/a |
| Rear 1-7 | Individual outputs F / E / D / C; main outputs B / A | Six outputs | 🟡 | Mix > OUT buses AB CD EF; routing mode | Extra pairs only in a multi-output VST3 host | – | n/a |
| Rear 1-7 | Headphones | Copy of AB | ➖ | – |  | – | n/a |
| Rack kit, connecting, care 1-8, 1-9 | Mounting, cabling, cleaning, battery | Hardware care | ➖ | – |  | – | n/a |

## 3. The LCD user interface (1-10)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| LCD 1-10 | Tempo, "EXT" when synced | Tempo display | 🟡 | LCD TEMPO (marked when the DAW sets it) | "EXT" shown as host tempo | – | n/a |
| LCD 1-10 | Level bar | Track level | ✅ | Mix LEVEL fader |  | 1 | pass (e2e-mm-mix-level-mute) |
| LCD 1-10 | Eight parameter circles with names | Data page | ✅ | Value boxes with names |  | 1 | pass (mm-machine-picker) |
| LCD 1-10 | Four boxes: playback position | Position | ✅ | LCD POSITION, page LEDs, playhead |  | 1 | pass (e2e-mm-lcd-boxes) |
| LCD 1-10 | Record / play / pause / stop symbols | Status | ✅ | Play key: blinks while paused; POSITION keeps the held step |  | 1 | stub-only (e2e-mm-top-pause-fail) |
| LCD 1-10 | Kit name and number | Current kit | ✅ | LCD KIT (saved / edited) |  | 1 | pass (e2e-mm-lcd-boxes) |
| LCD 1-10 | Pattern index A01-H16 | Current pattern | ✅ | LCD PATTERN |  | 1 | pass (e2e-mm-top-pattern-next) |
| LCD 1-10 | Machine of the track in focus | Machine | ✅ | Rail, Sound header |  | 1 | pass (e2e-mm-lcd-boxes) |
| Layer edit and windows 1-10 | Windows on top, keys still work below | Window behaviour | ➖ | – | Page dialogs | – | n/a |

## 4. Quick start (1-11 to 1-14)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| Selecting and playing 1-11 | Select a pattern; kit loads with it | Pattern pick | ✅ | LCD ‹ ›, chooser | Asks before losing kit edits | 2 | pass (e2e-mm-top-pattern-next) |
| Selecting and playing 1-11 | Pending pattern shown with arrow | Cued pattern | ✅ | Queued name blinks in the LCD |  | 1 | pass (e2e-mm-seq-queue-while-playing) |
| Selecting and playing 1-11 | Play, pause, stop | Transport | ✅ | Play key: play, pause (⇧-click, ⇧Space), stop |  | 1 | stub-only (e2e-mm-top-pause-fail) |
| Playing in multi trig 1-12 | Play MULTI TRIG from a keyboard | Multi trig | ✅ | Perform > Multi trig; MIDI channel 7 |  | 1 | pass (e2e-mm-perform-keys-channels) |
| Exploring a pattern 1-12 | Try each track, tweak SYNTHESIS | Auditioning | ✅ | Sound; roll keys play the track |  | 1 | pass (e2e-mm-seq-pitch-keys) |
| Grid recording 1-12 | Load kit for the pattern | LOAD KIT | ✅ | Kit library |  | 1 | pass (e2e-mm-lib-kit-load) |
| Grid recording 1-12 | Add a note trig | Trig on | ✅ | Roll click |  | 5 | pass (e2e-mm-seq-first-beat) |
| Grid recording 1-13 | Hold a trig, set pitch on the mini keyboard | Pitch of a trig | ✅ | Roll: click or drag for pitch |  | 1 | pass (e2e-mm-seq-pitch-keys) |
| Grid recording 1-13 | NOTE OFF (FUNCTION + TRIG) | Note off trig | ✅ | Alt-click an empty step; drag a bar's end |  | 2 | pass (e2e-mm-roll-draw-length) |
| Live recording 1-13 | Record notes in real time, quantised | Live record | ✅ | Alt + Space, record key | Quantising done by firmware | 1 | pass (e2e-mm-seq-live-record) |
| Live recording 1-13 | Erase with EXIT while notes sound | Live erase | ✅ | Hold Delete while live recording: the selected track's notes go as they play |  | 1 | pass (e2e-mm-seq-live-erase) |
| Parameter locks 1-13 | Lock a value on a step | P-lock | ✅ | Lock lane (draw bars), wheel on a step |  | 2 | pass (e2e-mm-seq-lock-lane) |
| Parameter locks 1-14 | Record locks live by turning a knob | Live lock | ✅ | Value boxes while live recording | The machine records; the page marks the step's cell and lock lane for about 3 s and says which value it locked (`70-seq.js` setRecLock) | 1 | pass (e2e-mm-seq-record-locks) |
| Parameter locks 1-14 | Remove one lock; remove all locks of a trig | Clear locks | ✅ | Lane: Alt-drag erases one parameter's locks; a step's menu (right-click, or the Menu key on a focused step): Clear locks takes all its locks (or the selection's) and keeps the note | No key that drops a step's locks and keeps its note | 2 | pass (e2e-mm-seq-lock-ramp-erase-wheel) |

## 5. Monomachine overview (1-15, 1-16)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| Six individual tracks 1-15 | Per track machine and effects | Multitimbral | ✅ | Sound, Mix |  | 1 | pass (mm-sound-workspace) |
| Six track sequencing 1-15 | Notes, envelope trigs, parameters | Sequencer | ✅ | Sequence |  | 1 | pass (mm-sequence-workspace) |
| MIDI sequencing 1-15 | Six MIDI tracks | MIDI seq | ✅ | Sequence (MIDI side) |  | 1 | pass (mm-midi-roll) |
| Poly mode 1-15 | One track with six voices | POLY | ✅ | Perform > Poly: the track selected (Assign's 1-6, the rail) plays six voices; ×6 on its key and lamp, the others dimmed | `poly {on, t}`; the other tracks silent (P10) | 2 | pass (mm-perform-poly) |
| Multi trig mode 1-15 | All tracks from one source | MULTI TRIG | ✅ | Perform |  | 1 | pass (e2e-mm-perform-keys-channels) |
| Multi map mode 1-15 | Keyboard triggers patterns | MULTI MAP | ✅ | Perform > Multi map |  | 1 | pass (e2e-mm-perform-keys-channels) |
| Figure 1 1-16 | Synthesis overview | Diagram | ➖ | – | The Mix page draws the routing graph | – | n/a |

## 6. Synthesis arrangement: kits and machines (1-17 to 1-25)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| Arrangement 1-17 | Machines grouped in Mono-synths | Families | ✅ | Machine picker families |  | 1 | pass (mm-machine-picker) |
| Arrangement 1-17 | Track effects per track (filter, EQ, SRR, distortion, delay) | Effects | ✅ | Sound AMP, FLT, EFX |  | 1 | pass (mm-sound-workspace) |
| Kits 1-18 | Kit holds machines, pages, LFOs, MIDI pages, routing, trig, multi env, name | Kit content | ✅ | Whole kit editable in the working kit | `WorkingKit` document | 1 | pass (e2e-mm-kit-parts) |
| Link kits and patterns 1-18 | Pattern recalls its kit; same kit not reloaded | Link | ✅ | Pattern chooser shows kit per pattern | Dialog "Save kit, then switch" | 1 | pass (e2e-mm-lib-pattern-same-kit) |
| Link kits and patterns 1-18 | Change which kit a pattern uses | Relink | ✅ | Pattern chooser: Alt-click a pattern, then its Kit list (patternKit); over the pattern that plays the kit loads at once, asked over unsaved edits | Measured: the dump carries the link; over the pattern that plays the machine loads the kit (gapProbesFirmwareTest w12patkit) | 1 | pass (e2e-mm-lib-pattern-kit) |
| Loading a kit 1-19 | Kit list of 128, load | LOAD KIT | ✅ | Kit library |  | 1 | pass (e2e-mm-lib-kit-load) |
| Loading a kit 1-19 | Star on kits with no pattern | Unlinked mark | ✅ | Star in kit slot |  | 1 | pass (mm-kit-library) |
| Loading an empty kit 1-19 | Six GND-SIN tracks | Empty kit | ✅ | Load an empty slot |  | 1 | pass (mm-kit-library) |
| Saving and naming 1-19 | SAVE KIT | Save | ✅ | Kit library Save, Save as |  | 1 | pass (e2e-mm-lib-kit-saveas) |
| Saving and naming 1-20 | Name a kit (11 characters) | Rename | ✅ | Kit library Rename, F2 |  | 1 | pass (e2e-mm-lib-kit-rename-undo) |
| Saving and naming 1-20 | "High score" character picker | Text entry | ➖ | – | Text field | – | n/a |
| Undo kit 1-20 | UNDO KIT keeps lost edits | Safety slot | ✅ | Kit library: UNDO KIT (KIT > LOAD > UNDO KIT through the machine's keys; off over HW MIDI) | Measured: the lost kit plays again unsaved, its own slot current (gapProbesFirmwareTest w12undo) | 1 | pass (e2e-mm-lib-undo-kit) |
| Copy kit 1-21 | Copy and paste kit slot | Kit copy | ✅ | Kit library Copy / Paste, drag a slot | Through SYSEX RECV | 1 | pass (e2e-mm-lib-kit-copy-paste-undo) |
| Clear kit 1-21 | Clear kit slot | Kit clear | ✅ | Kit library Clear |  | 1 | pass (e2e-mm-lib-kit-clear-undo) |
| Assigning a machine 1-22 | SYNTH, MACHINE, MIX columns in EDIT KIT | Machine picker | ✅ | Sound > machine key |  | 1 | pass (e2e-mm-kit-parts) |
| Assigning a machine 1-22 | "Keep effects" vs init pages | Init data | ✅ | "Keep track effects + LFOs" toggle | `machine` op | 1 | pass (e2e-mm-kit-parts) |
| Copy machine 1-23 | Machine and settings to another track or kit | Copy machine | ✅ | Sound COPY / PASTE | `copySound` | 1 | pass (e2e-mm-sound-copy-paste) |
| Clear machine 1-24 | Back to GND-SIN | Clear machine | ✅ | Sound CLR |  | 1 | pass (mm-kit-library) |
| Setting the mix bus 1-24 | OUT BUS per track | Mix bus | ✅ | Mix > Out AB CD EF | A track can feed two | 1 | pass (mm-mix-routing) |
| Parameter editing 1-25 | 7 pages of 8, 56 parameters | Edit | ✅ | Sound |  | 1 | pass (mm-machine-picker) |
| Parameter editing 1-25 | TUNE on every synth machine | Fine tune | ✅ | SYN page TUNE (not on BeatBox) | Per the OS 1.32B screens | 1 | pass (mm-machine-picker) |
| Parameter editing 1-25 | Kit changes are unsaved until SAVE | Dirty state | ✅ | KIT "edited / saved" |  | 1 | pass (e2e-mm-sound-machine-stays) |

## 7. Track effects (1-26 to 1-34)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| Level 1-26 | LEV, not lockable | Track level | ✅ | Mix LEVEL |  | 1 | pass (e2e-mm-seq-locks) |
| Amp envelope 1-26 | ATK | Attack | ✅ | Sound > Amp |  | 1 | pass (mm-sound-workspace) |
| Amp envelope 1-27 | HOLD | Hold | ✅ | Sound > Amp |  | 1 | pass (mm-sound-workspace) |
| Amp envelope 1-27 | DEC | Decay | ✅ | Sound > Amp |  | 1 | pass (mm-sound-workspace) |
| Amp envelope 1-27 | REL | Release | ✅ | Sound > Amp |  | 1 | pass (mm-sound-workspace) |
| Distortion 1-27 | DIST (headroom below 0) | Distortion | ✅ | Sound > Amp > Drive |  | 1 | pass (mm-sound-workspace) |
| Track volume 1-28 | VOL (lockable) | Volume | ✅ | Sound > Amp; Mix trim |  | 1 | pass (mm-sound-workspace) |
| Pan 1-29 | PAN | Stereo place | ✅ | Sound > Amp; Mix PAN |  | 1 | pass (e2e-mm-mix-pan-undo) |
| Portamento 1-29 | PORT | Glide time | ✅ | Sound > Amp > Glide; Sequence > Trig setup |  | 2 | pass (mm-sound-workspace) |
| Filter 1-30 | BASE | Filter base | ✅ | Sound > Filter |  | 1 | pass (mm-sound-workspace) |
| Filter 1-30 | WDTH | Filter width | ✅ | Sound > Filter |  | 1 | pass (mm-sound-workspace) |
| Filter 1-30 | HPQ | High pass Q | ✅ | Sound > Filter |  | 1 | pass (mm-sound-workspace) |
| Filter 1-30 | LPQ | Low pass Q | ✅ | Sound > Filter |  | 1 | pass (mm-sound-workspace) |
| Filter envelope 1-31 | ATK, DEC | Filter envelope | ✅ | Sound > Filter env |  | 1 | pass (mm-sound-workspace) |
| Filter envelope 1-31 | BOFS, WOFS | Envelope offsets | ✅ | Sound > Filter env |  | 1 | pass (mm-sound-workspace) |
| Filter tracking 1-31 | Filter follows pitch; switch off HPF / LPF | Key tracking | ✅ | Perform > Assign > KEY > HPF, LPF; KEY in Sound > Filter shows them and leads there | `assign` op | 1 | pass (mm-sound-key-tracking) |
| EQ 1-32 | EQF, EQG | One band EQ | ✅ | Sound > Effects |  | 1 | pass (mm-sound-workspace) |
| Sample rate reduction 1-32 | SRR | Lo-fi | ✅ | Sound > Effects |  | 1 | pass (mm-sound-workspace) |
| Delay 1-33 | DSND (sign: stereo kept / ping-pong) | Delay send | ✅ | Sound > Effects; Mix trim |  | 1 | pass (mm-sound-workspace) |
| Delay 1-33 | DTIM (256th notes) | Delay time | ✅ | Sound > Effects |  | 1 | pass (mm-sound-workspace) |
| Delay 1-33 | DFB | Feedback | ✅ | Sound > Effects (warns above 64) |  | 1 | pass (mm-sound-workspace) |
| Delay 1-33 | DBAS, DWID | Feedback filter | ✅ | Sound > Effects |  | 1 | pass (mm-sound-workspace) |

## 8. Low frequency oscillators (1-35 to 1-37)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| LFO 1-35 | PAGE and DEST (incl. PTCH, eight ranges, MIDI page, other LFOs) | Target | ✅ | Sound > LFO page and dest selects; drag the ~ handle onto a value |  | 1 | pass (mm-sound-lfos) |
| LFO 1-35 | TRIG: FREE, TRIG, HOLD, ONE, HALF | Trig mode | ✅ | LFO TRIG keys |  | 1 | pass (mm-sound-lfos) |
| LFO 1-35 | WAVE, 11 shapes | Waveform | ✅ | 11 shape keys |  | 1 | pass (mm-sound-lfos) |
| LFO 1-35 | MULT | Multiplier | ✅ | LFO MULT |  | 1 | pass (mm-sound-lfos) |
| LFO 1-36 | SPD | Speed | ✅ | LFO SPD |  | 1 | pass (mm-sound-lfos) |
| LFO 1-36 | INTL | Interlace | ✅ | LFO INTL |  | 1 | pass (mm-sound-lfos) |
| LFO 1-36 | DPTH | Depth | ✅ | LFO DPTH |  | 1 | pass (mm-sound-lfos) |
| LFO 1-37 | Two LFOs on one target add | Layering | ✅ | Any; badge ~n shows modulation |  | 1 | pass (mm-sound-lfos) |
| LFO 1-37 | LFO trigs sequenced separately | LFO trig | ✅ | Step menu > Envelopes > LFO; L on the note in the roll |  | 1 | pass (mm-sequence-workspace) |
| LFO 1-35 | LFOs shared with the MIDI track of the same number | Shared | ✅ | MIDI page notes it; link to T LFOs |  | 1 | pass (mm-sound-lfos) |

## 9. Additional kit settings (1-38 to 1-44)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| Assign 1-38 | Two rows of PAGE, DEST, ADD per source | Modulation assign | ✅ | Perform > Assign |  | 1 | pass (e2e-mm-perform-joystick-assign) |
| Assign 1-39 | Joystick R / L with MIRR | Joystick | ✅ | Assign tab JOY RL, Mirror |  | 1 | pass (e2e-mm-perform-assign) |
| Assign 1-39 | Joystick U, D tabs | Joystick | ✅ | Assign tabs JOY U, JOY D |  | 1 | pass (e2e-mm-perform-assign) |
| Assign 1-39 | Velocity assign | Velocity | ✅ | Assign tab VEL | Sequencer plays velocity 100 | 1 | pass (e2e-mm-perform-assign) |
| Assign 1-40 | Key tracking assign | Key | ✅ | Perform > Assign > KEY; KEY in Sound > Filter leads there |  | 1 | pass (mm-sound-key-tracking) |
| Assign 1-39 | Copy, clear, paste, undo assign | Assign clipboard | ✅ | Perform COPY / CLR / PASTE |  | 1 | pass (e2e-mm-perform-assign) |
| Trig track settings 1-40 | TRIG POS (forward notes, chainable) | Trig position | ✅ | Sequence dock > Trig setup | Dotted cord on Mix graph | 1 | pass (mm-trig-setup) |
| Trig track settings 1-41 | PORTAMENTO ALWAYS / ONLY LEGATO | Portamento mode | ✅ | Trig setup > Port |  | 1 | pass (e2e-mm-perform-menv-portamento) |
| Trig track settings 1-41 | Legato trig modes AMP, FILTER, LFO | Legato | ✅ | Trig setup > Legato |  | 1 | pass (mm-trig-setup) |
| Multi trig 1-41 | ALL TRK | All tracks play | ✅ | Perform > Multi trig |  | 1 | stub-only (e2e-mm-perform-multi-setup-fail) |
| Multi trig 1-42 | SPLIT KEY: TRACK and KEY zones | Split | ✅ | Perform: split marker, "Upper from" |  | 1 | stub-only (e2e-mm-perform-multi-setup-fail) |
| Multi trig 1-42 | SEQ START | Restart pattern per note | ✅ | Perform > Multi trig |  | 1 | stub-only (e2e-mm-perform-multi-setup-fail) |
| Multi trig 1-43 | SEQ TRNSP | Transpose, loop unbroken | ✅ | Perform > Multi trig |  | 1 | stub-only (e2e-mm-perform-multi-setup-fail) |
| Multi trig 1-43 | TIMING context tab | Delay to bar | ✅ | Perform Timing stepper |  | 1 | stub-only (e2e-mm-perform-multi-setup-fail) |
| Multi trig 1-43 | Arpeggiators work in all-track mode | Arp | ✅ | Per track arp | Firmware | 1 | stub-only (e2e-mm-perform-multi-setup-fail) |
| Multi env 1-43 | ATK, DEC, SUS, REL | ADSR on top | ✅ | Perform > Multi envelope: the card names the kit's MULTI TRIG mode and says what the envelope shapes in it |  | 5 | pass (mm-perform-menv) |
| Multi env 1-44 | PORT | Multi portamento | ✅ | Same |  | 1 | pass (mm-trig-setup) |

## 10. The pattern sequencer: pattern operation (1-45 to 1-47)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| Pattern selection 1-45 | 8 banks x 16, A01-H16 | Pattern select | ✅ | Pattern chooser |  | 1 | pass (e2e-mm-lib-pattern-go) |
| Pattern selection 1-45 | Red LEDs show patterns with data | Used mark | ✅ | Chooser slot shows length or empty |  | 1 | pass (mm-pattern-chooser) |
| Pattern selection 1-45 | Switch waits for pattern end | Cued switch | ✅ | Queue; Shift-click or "Now" switches at once | "Now" = STOP, LOAD, PLAY | 1 | pass (e2e-mm-seq-queue-while-playing) |
| Pattern chaining 1-46 | Chain patterns of one bank, each once | Chain | ✅ | Song > Patterns > Chain | `chain` op; STOP resets, pick ends the chain | 1 | pass (e2e-mm-song-chain) |
| Scale setup 1-46 | Total steps up to 64 | Length | ✅ | LCD LEN (2-64), x2 key |  | 1 | pass (e2e-mm-seq-len) |
| Scale setup 1-46 | Scale length in pages | Pages | ✅ | PAGE key, LEDs |  | 1 | pass (e2e-mm-seq-pages) |
| Scale setup 1-47 | Tempo multiplier 1X, 2X, 3/4X, 3/2X | Speed | ✅ | LCD SPD |  | 1 | pass (e2e-mm-seq-scale-setup) |
| Scale setup 1-47 | Lower pages auto-copied when lengthened | Page copy | ✅ | Firmware; x2 key copies the first half |  | 1 | pass (e2e-mm-seq-scale-setup) |
| Scale setup 1-47 | Song rows override length | Row length | ✅ | Song > Part |  | 1 | pass (mm-song-workspace) |
| Recording preparations 1-47 | Select kit, track, trig tracks all lit | Setup | ✅ | Implicit in the page |  | 1 | pass (mm-sequence-workspace) |

## 11. Composing a pattern (1-47 to 1-55)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| Grid recording 1-47 | Trig on / off | Step trig | ✅ | Roll click |  | 2 | pass (e2e-mm-seq-first-beat) |
| Grid recording 1-48 | Pitch of a trig | Note | ✅ | Roll vertical position |  | 1 | pass (e2e-mm-seq-pitch-keys) |
| Grid recording 1-48 | Octave shift (FUNCTION + arrows) | Octave | ✅ | Roll drag; wheel + Shift = octave |  | 1 | pass (e2e-mm-seq-pitch-keys) |
| Grid recording 1-48 | NOTE OFF trig | Note off | ✅ | Alt-click; drag bar end |  | 1 | pass (e2e-mm-roll-draw-length) |
| Grid recording 1-48 | Chords | Chord | ✅ | Shift-click in the roll | Same-length notes on MIDI tracks | 1 | pass (e2e-mm-seq-pitch-keys) |
| Grid recording 1-49 | Rotate trigs and locks (FUNCTION + arrows) | Rotate | ✅ | Alt + Left / Right | `rotate` op | 2 | pass (e2e-mm-seq-rotate) |
| Grid recording 1-49 | Copy / clear / paste act on the track in grid mode | Scope | ✅ | LCD COPY / CLR / PASTE | Page shown of the selected track | 1 | pass (e2e-mm-seq-copy-paste-clear) |
| Live recording 1-49 | Record played notes, quantised | Live | ✅ | Alt + Space |  | 1 | pass (e2e-mm-seq-live-record) |
| Live recording 1-49 | Chords recorded | Live chords | 🟡 | Played one key at a time | Chords are drawn with Shift-click in the roll | – | n/a |
| Live recording 1-49 | Erase with EXIT | Live erase | ✅ | Hold Delete while live recording |  | 1 | pass (e2e-mm-seq-live-erase) |
| Step recording 1-50 | Step-by-step input | Step rec | ✅ | Sequence: Shift-click REC; a played note writes the step under the cursor and moves on; → rest, ← back, Delete clears, Esc done |  | 1 | pass (e2e-mm-seq-step-record) |
| Note copy 1-50 | Copy one trig with locks to another step | Note copy | ✅ | Sequence: Cmd-click a step (Ctrl on Windows and Linux), Cmd+C, select the target, Cmd+V; Cmd-drag drops a copy; Cmd+D duplicates | Notes, NOTE OFFs, envelope trigs, slides and locks go along (`77-select.js`, `copySteps`) | 5 | pass (e2e-mm-seq-paste-steps-keeps-page) |
| Clear note parameter locks 1-50 | Clear locks of one note, undoable | Clear locks | ✅ | The step menu's Clear locks (keep the notes), on a step or a selection; one undo step | No key for the locks of one step alone | 1 | pass (e2e-mm-seq-clear-step-locks) |
| Track page copy 1-51 | Copy a page to another page | Page copy | ✅ | LCD COPY on the page shown (no step selected), PASTE on another page; or select the steps | Steps, slides and locks (`130-main.js` secAction) | 1 | pass (e2e-mm-seq-copy-page) |
| Clear track page 1-51 | Clear a page | Page clear | ✅ | CLR with a page shown |  | 1 | pass (e2e-mm-seq-copy-paste-clear) |
| Track copy 1-52 | Track data to another track incl. machine, arp, transpose, swing, slide | Track copy | ✅ | LCD ▾ beside COPY CLR PASTE: Copy…, Paste…, Clear… what (⌘⇧C, ⌘⇧V): notes, melody, slide, swing, locks, arp, transpose, machine + sound in one copy; Paste lights the tracks (synth onto synth, MIDI onto MIDI); one undo step |  | 1 | pass (mm-copy-what) |
| Clear track 1-53 | Clear a track | Track clear | ✅ | LCD ▾ beside COPY CLR PASTE: Copy…, Paste…, Clear… what (⌘⇧⌫): tick Notes (or any parts) of the selected track; Cmd+Z |  | 1 | pass (e2e-mm-seq-clear-what) |
| Pattern copy 1-53 | Whole pattern incl. kit link and MIDI tracks | Pattern copy | ✅ | Pattern chooser Copy / Paste, drag a slot |  | 1 | pass (mm-pattern-chooser) |
| Clear pattern 1-54 | Clear all, keep kit link | Pattern clear | ✅ | Alt + CLR, chooser Clear | Keeps the kit link | 2 | pass (e2e-mm-seq-clear-pattern-undo) |
| Super copy 1-54 | Choose what to copy (melody, machine) | Super copy | ✅ | LCD ▾ beside COPY CLR PASTE: Copy…, Paste…, Clear… what (⌘⇧C, ⌘⇧V): Melody pastes the pitches onto the trigs already there; Machine + sound the machine |  | 1 | pass (mm-copy-what) |
| Super clear 1-55 | Choose what to clear | Super clear | ✅ | LCD ▾ beside COPY CLR PASTE: Copy…, Paste…, Clear… what (⌘⇧⌫): tick the parts to clear; Cmd+Z | Melody leaves the trigs without a pitch; swing goes back to every second 16th; arp to OFF. | 1 | pass (e2e-mm-seq-clear-what) |

## 12. Tempo (1-55 to 1-57)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| Tempo 1-55 | Global tempo, not stored in patterns | Global tempo | ✅ | LCD TEMPO |  | 1 | pass (e2e-mm-top-tempo-drag) |
| Tempo screen 1-56 | Integer and decimal tempo | Edit tempo | ✅ | Drag, arrows, Shift = 0.1 | 30-300 BPM | 1 | pass (e2e-mm-top-tempo-window) |
| Tempo screen 1-56 | Delay change until FUNCTION released | Delayed change | ✅ | TEMPO window (a click on the tempo): Change on release; ⌥-drag the tempo does it once |  | 1 | pass (e2e-mm-top-tempo-release) |
| Tempo screen 1-56 | Temporary +/-10 % shift | Nudge | ✅ | TEMPO window: −10 % / +10 % held, or the keys - and = held; back at the release |  | 1 | pass (e2e-mm-top-tempo-window) |
| Tap tempo 1-56 | Average of taps | Tap | ✅ | Shift + B everywhere; B off Sequence | The last five taps are averaged; a pause of 2 s starts over | 2 | pass (e2e-mm-keys-tap-tempo) |
| External synchronisation 1-56 | Internal or external MIDI clock; EXT shown | Sync | ✅ | GLOBAL > Sync > Tempo in (INT / EXT); in a DAW EXT follows the host (a new plug-in starts so), INT runs the machine on its own clock (`followHost`, review 1, I-026) | See Control In. INT is kept with the project; the host's clock and transport stop going to the machine (mmDeskFirmwareTest hostclock) | 1 | pass (e2e-mm-top-tempo-window) |
| Tempo 1-57 | Songs store tempo changes | Song tempo | ✅ | Song row Tempo |  | 1 | pass (mm-song-workspace) |

## 13. Parameter locks (1-57, 1-58)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| Locks in grid mode 1-57 | Hold a trig, turn a knob | Lock | ✅ | Lane: draw; wheel; ramp with Shift |  | 1 | pass (e2e-mm-seq-lock-ramp-erase-wheel) |
| Locks in grid mode 1-57 | Click a knob to lock its current value | Lock to current | ✅ | Sequence, Locks: select steps, then the lock key in the rail header locks the lane's parameter at its current (kit) value on each selected note; one undo step | No "lock current" click | 1 | pass (e2e-mm-seq-lock-current) |
| Locks in grid mode 1-57 | View locks of a step | View | ✅ | Lane shows bars per parameter |  | 1 | pass (e2e-mm-seq-lock-lane) |
| Locks in grid mode 1-57 | Remove one / all locks of a step | Remove | ✅ | One lock: Alt-drag on the lane; all locks of a step: the step menu's Clear locks |  | 1 | pass (e2e-mm-seq-clear-step-locks) |
| Locks in grid mode 1-57 | Note copy and paste | Note copy | ✅ | See section 11 | Locks travel with the copied step | 1 | pass (e2e-mm-seq-copy-page) |
| Locks 1-58 | 62 locked parameters per pattern, pooled | Lock budget | ✅ | LCD LOCKS nn/62; lane budget | Blocks a 63rd | 1 | pass (e2e-mm-seq-locks) |
| Locks 1-58 | Parameter locked once can hold a value on every step | Lane | ✅ | Lock lane |  | 1 | pass (e2e-mm-seq-locks) |
| Locks in live recording 1-58 | Locks recorded while turning knobs | Live locks | ✅ | Value boxes; the step and lane are marked | The machine records; see section 4 | 1 | pass (e2e-mm-seq-record-locks) |
| Locks in live recording 1-58 | Edit afterwards in grid mode | Fine tune | ✅ | Lock lane |  | 1 | pass (e2e-mm-seq-locks) |

## 14. Advanced sequencer control (1-58 to 1-60)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| Trig tracks 1-58 | AMP, FILTER, LFO sub tracks | Split trigs | ✅ | Step menu > Envelopes (Amp, Filter, LFO); a note that fires only some shows their letters |  | 1 | pass (mm-sequence-workspace) |
| Trig tracks 1-59 | ALL mode adds a pitch by default | All trig | ✅ | Click in the roll |  | 1 | pass (mm-sequence-workspace) |
| Trig tracks 1-59 | AMP only, FILTER only, LFO only | Single trig | ✅ | Step menu > Envelopes: tick one of Amp, Filter, LFO |  | 1 | pass (mm-sequence-workspace) |
| Trig tracks 1-59 | LED colours green, red, yellow | State | 🟡 | Roll: a NOTE OFF has the yellow lamp of its TRIG LED; a trigless trig a hollow square; a trig that fires only some envelopes their letters |  | 1 | n/a |
| Trigless trigs 1-59 | Trig with no envelopes, for pitch or locks | Trigless | ✅ | Step menu > Trigless trig (adds one on an empty step, or takes a note's envelopes off; again: removes it); the roll shows a small hollow square |  | 1 | pass (mm-sequence-workspace) |
| Pitchless trigs 1-59 | Trig without own pitch (EXIT) | Pitchless | ✅ | Dashed bar in the roll; its envelopes in the step menu > Envelopes |  | 1 | pass (mm-sequence-workspace) |

## 15. Additional sequencer features (1-61 to 1-69)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| Arpeggiator 1-61 | 12 arpeggiators, one per track | Arp | ✅ | Sequence dock > Arp, any of 12 tracks |  | 1 | pass (e2e-mm-seq-arp) |
| Arpeggiator 1-61 | SPD (6 = 16th) | Speed | ✅ | Arp SPD |  | 1 | pass (e2e-mm-seq-arp-setup) |
| Arpeggiator 1-61 | MODE OFF, KEY, SID, ADD | Mode | ✅ | Arp Mode keys |  | 1 | pass (e2e-mm-seq-arp) |
| Arpeggiator 1-62 | PLAY TRUE, UP, DOWN, CYCLE, RND | Direction | ✅ | Arp Play keys |  | 1 | pass (e2e-mm-seq-arp-setup) |
| Arpeggiator 1-62 | RNGE | Octave range | ✅ | Arp RNGE |  | 1 | pass (e2e-mm-seq-arp-range) |
| Arpeggiator 1-62 | OJMP | Octave jump | ✅ | Arp OJMP | Low bit / upper bits split, see mapping note 6 | 1 | pass (e2e-mm-seq-arp-setup) |
| Arpeggiator 1-62 | Copy, clear, paste, undo arp | Arp clipboard | ✅ | LCD ▾ beside COPY CLR PASTE: Copy…, Paste…, Clear… what (Arp ticked): copy, paste, clear (back to OFF); Cmd+Z |  | 1 | pass (mm-copy-what) |
| Arp envelope switches 1-62 | AMP, FLT, LFO trigging (not on MIDI) | Arp trigs | ✅ | Arp Trig keys | Disabled on MIDI tracks | 1 | pass (e2e-mm-seq-arp-setup) |
| Arp rhythm and offset 1-63 | Up to 16 steps, on / off | Rhythm | ✅ | 16-cell strip: click mutes |  | 1 | pass (e2e-mm-seq-arp-setup) |
| Arp rhythm and offset 1-63 | Note offset per step | Offset | ✅ | Drag a cell up / down (+/-24) |  | 1 | pass (e2e-mm-seq-arp-setup) |
| Arp rhythm and offset 1-63 | Length by LEVEL | Length | ✅ | Click past the end, or the LEN row |  | 1 | pass (e2e-mm-seq-arp-setup) |
| Transpose 1-63 | Per track, live, pattern data untouched | Track transpose | ✅ | Dock > Transpose > TRACK |  | 2 | pass (e2e-mm-seq-transpose-keyboard) |
| Transpose 1-64 | PAT, shared by all tracks | Pattern transpose | ✅ | Transpose > PAT; LCD |  | 1 | pass (e2e-mm-seq-scale-setup) |
| Transpose 1-64 | SCALE ---, FIX, MAJ, MIN | Scale | ✅ | Transpose Scale keys |  | 1 | pass (e2e-mm-seq-scale-setup) |
| Transpose 1-64 | KEY for MAJ / MIN | Key | ✅ | Click the keyboard picture |  | 1 | pass (e2e-mm-seq-scale-setup) |
| Swing 1-64 | Amount 50-80 %, per pattern | Swing | ✅ | LCD SWG |  | 1 | pass (e2e-mm-seq-scale-setup) |
| Swing track 1-65 | Per-track swing steps, default every second 16th | Swing track | ✅ | Sequence: step menu > Swing on the selected steps (one undo step); a teal slant on the note of a trig that swings | Drag paints, one undo step | 1 | pass (e2e-mm-seq-slide-swing) |
| Swing 1-65 | Copy, clear, paste, undo swing track | Swing clipboard | ✅ | LCD ▾ beside COPY CLR PASTE: Copy…, Paste…, Clear… what (Swing ticked): copy, paste, clear; Cmd+Z |  | 1 | pass (mm-copy-what) |
| Slide 1-66 | Slide track per track | Slide | ✅ | Sequence: step menu > Slide on the selected steps; a small ramp on a note whose step slides and holds a lock; the lock lane draws the glide |  | 2 | pass (e2e-mm-seq-slide-swing) |
| Slide 1-66 | Copy, clear, paste, undo slide | Slide clipboard | ✅ | LCD ▾ beside COPY CLR PASTE: Copy…, Paste…, Clear… what (Slide ticked): copy, paste, clear; Cmd+Z |  | 1 | pass (mm-copy-what) |
| Mute mode 1-67 | Mute window, 6 + 6 | Mutes | ✅ | Perform > Mutes; rail M | MIDI mutes through the MUTE window keys | 2 | pass (e2e-mm-keys-mute) |
| Mute mode 1-67 | Held changes until FUNCTION released | Prepared mutes | ✅ | Shift + M prepares, applies on release |  | 1 | pass (e2e-mm-mix-shift-mutes) |
| Mute mode 1-68 | Minimise the window | Small window | ➖ | – | Page | – | n/a |
| Mute mode 1-68 | Mutes are global and remembered | Persistence | ✅ | Machine holds them | A track with no MIDI channel cannot be muted over MIDI: the page says so and offers "Give each track its own channel" (GLOBAL > Control) | 1 | pass (e2e-mm-perform-mutes) |
| Poly mode 1-69 | Six voices on the track in focus | Poly | ✅ | Perform > Poly; the sequencer plays the poly track's chord trigs |  | 2 | pass (mm-perform-poly) |

## 16. The MIDI sequencer (1-70 to 1-72)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| Using the MIDI sequencer 1-70 | Switch internal / MIDI editing | Side switch | ✅ | SYNTH / MIDI |  | 1 | pass (e2e-mm-sound-midi-side) |
| Using the MIDI sequencer 1-70 | Select MIDI track, mute | Track | ✅ | Rail |  | 1 | pass (e2e-mm-perform-midi-mutes) |
| Using the MIDI sequencer 1-70 | Notes, chords (one length), locks | MIDI notes | ✅ | Roll with real lengths |  | 1 | pass (mm-midi-roll) |
| MIDI page 1-71 | LEN (127 = until note off) | Length | ✅ | MIDI page, drag a note end |  | 1 | pass (e2e-mm-roll-midi-len) |
| MIDI page 1-71 | VEL | Velocity | ✅ | MIDI page, VEL row |  | 1 | pass (mm-midi-roll) |
| MIDI page 1-71 | PB | Pitch bend | ✅ | MIDI page |  | 1 | pass (mm-midi-roll) |
| MIDI page 1-71 | PCHG (only when locked) | Program change | ✅ | MIDI page |  | 1 | pass (mm-midi-roll) |
| MIDI page 1-71 | CC 1-4 | Controllers | ✅ | MIDI page CL / CC boxes |  | 1 | pass (mm-midi-roll) |
| Comparison 1-71 | No trig tracks; arp without switches; swing and slide; transpose | Differences | ✅ | Same docks |  | 1 | pass (e2e-mm-midi-seq-docks) |
| Comparison 1-71 | MIDI page stored in the kit | Kit part | ✅ | Kit edits |  | 1 | pass (mm-midi-roll) |
| Comparison 1-71 | Internal tracks can send MIDI too | Internal MIDI out | ✅ | GLOBAL > Control out 1 (OUT or INT+OUT) | The sequencer's trigs go out as NRPN on the base channel, the arpeggiator and the keyboard as notes (P2) | 1 | pass (e2e-mm-global-control-out) |

## 17. The song mode (1-73 to 1-80)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| Song mode 1-73 | Enter song mode | Mode switch | ✅ | Song > SONG key; LCD PLAY |  | 2 | pass (e2e-mm-song-playhead) |
| Song mode 1-73 | 24 songs, 200 rows | Capacity | ✅ | Songs column (24 slots), 200 cells |  | 1 | pass (e2e-mm-song-picker-load) |
| Load song 1-73 | Load a song slot | LOAD SONG | ✅ | Songs column: select a slot, Load (Enter) | Only while stopped | 3 | pass (e2e-mm-song-playhead) |
| Save song 1-74 | Save and name a song | SAVE SONG | ✅ | Songs column: Save (SAVE SONG 0x6D), Save to… with a name, Rename (F2) | Edits still go into the slot as dumps (SYSEX RECV); a name has 14 characters. | 1 | pass (e2e-mm-song-slots) |
| Save song 1-74 | Copy, paste, clear, undo a song slot | Song slots | ✅ | Songs column: Copy, Paste, Clear, drag a slot onto another; Cmd+Z | Library slot ops songCopy, songPaste, songCopyTo, songClear, songRename; asks before writing over a song. | 1 | pass (e2e-mm-song-slots) |
| Song play 1-75 | Play, pause, stop | Transport | ✅ | Play key: play, pause (⇧-click, ⇧Space), stop; in SONG mode as in pattern mode |  | 2 | stub-only (e2e-mm-top-pause-fail) |
| Song play 1-75 | Switch to pattern mode and back; pointer held | Mode toggle | ✅ | PATTERN · CHAIN · SONG keys |  | 3 | pass (e2e-mm-song-mode) |
| Song transport 1-75 | Move the song pointer to a row and continue | Jump to row | ✅ | Song: ▶ From here on the selected row, or Enter (SONG mode, the song position, Continue) | Needs TRANSPORT IN = ACCEPT (factory IGNORE): the editor asks to set it, then plays. The row starts at its first step (P1). | 1 | stub-only (e2e-mm-song-play-from-fail) |
| Song transport 1-75 | Song pointer position over MIDI | SPP | ➖ | – | Firmware, via global transport setting | – | n/a |
| Song editing 1-76 | ROW count | Rows | ✅ | Arrangement grid |  | 1 | pass (mm-song-workspace) |
| Song editing 1-76 | PAT column, END mark | Pattern | ✅ | Pattern palette, drag, ‹ › |  | 3 | pass (e2e-mm-song-playhead) |
| Song editing 1-76 | REP | Repeats | ✅ | Repeat stepper |  | 1 | pass (e2e-mm-song-row-inspector) |
| Song editing 1-77 | TRN pattern transpose | Row transpose | ✅ | Transpose stepper |  | 1 | pass (mm-song-workspace) |
| Song editing 1-77 | Song track transpose (TR1-6, six MIDI) | Per-track transpose | ✅ | Row > More > Per track |  | 1 | pass (mm-song-workspace) |
| Song editing 1-77 | OF LN offset and length | Part | ✅ | Row > More > Part |  | 1 | pass (mm-song-workspace) |
| Song editing 1-77 | XTRA: row mutes (6 + 6) | Row mutes | ✅ | Row > More > Mutes |  | 1 | pass (e2e-mm-song-row-inspector) |
| Song editing 1-77 | XTRA: row BPM | Row tempo | ✅ | Row Tempo |  | 1 | pass (mm-song-workspace) |
| Song editing 1-77 | Insert / remove rows (FUNCTION + arrows) | Row edit | ✅ | Row Duplicate, Delete, Add loop, drag |  | 1 | pass (e2e-mm-song-rows) |
| Song editing 1-77 | Copy, paste, clear, undo rows | Row clipboard | ✅ | LCD COPY / PASTE / CLR; page undo |  | 1 | pass (e2e-mm-song-rows-copy) |
| Song edit transport 1-77 | Start from any row (ENTER) | Play from row | ✅ | Song: Enter on the selected row (▶ From here) |  | 1 | stub-only (e2e-mm-song-play-from-fail) |
| Song edit transport 1-77 | Counter in bars and beats | Song time | ✅ | Song: the Arrangement header reads Playing · bar:beat while the song plays (the machine's counter, telemetry songSteps) | RAM 0x2bdf3c, the EDIT SONG header's counter (gapProbesFirmwareTest w12mmcounter); song rows, bars and time stay in the Songs column | 1 | pass (e2e-mm-song-counter) |
| Song loops 1-78 | Loop to a row, repeat count, nesting | Loop | ✅ | Row command LOOP |  | 1 | pass (e2e-mm-song-row-inspector) |
| Song jump 1-78 | Forward jump | Jump | ✅ | Row command JUMP |  | 1 | pass (mm-song-workspace) |
| Song halt 1-78 | Pause playback | Halt | ✅ | Row command HALT |  | 1 | pass (mm-song-workspace) |
| Song extra 1-79, 1-80 | Row mutes and BPM; bold M / B marks | XTRA | ✅ | Cell marks T M B ~ |  | 1 | pass (mm-song-workspace) |

## 18. Routing (1-81 to 1-86)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| Mixer 1-81 | OUT BUS AB, CD, EF per track | Mix buses | ✅ | Mix > Out |  | 1 | pass (mm-mix-routing) |
| FX machines 1-81 | Need input and a trig | FX input | ✅ | Mix IN select; new FX sets DEC and REL to 127 |  | 1 | pass (mm-mix-routing) |
| Audio inputs 1-82 | INP A, INP B, INP AB | External audio | ✅ | Mix IN select |  | 1 | pass (mm-mix-routing) |
| Audio inputs 1-82 | THRU machine as a start | THRU | ✅ | Machine picker |  | 1 | pass (mm-mix-routing) |
| Neighbour routing 1-83 | NEIBOR input; chainable | Neighbour | ✅ | Mix IN = NEIBOR | Drawn as an arrow | 1 | pass (mm-mix-routing) |
| Mix bus routing 1-84 | BUS AB / CD / EF input; insert or send | Bus FX | ✅ | Mix IN = BUS xx; flow line says insert |  | 1 | pass (mm-mix-routing) |
| Routing mode AB=MIX 1-85 | CD and EF added to A/B | Mix mode | ✅ | Mix routing bar, LCD ROUTE |  | 1 | pass (mm-mix-routing) |
| Routing mode 6xMONO 1-85 | Each track to its own output | Mono outs | ✅ | Mix routing bar |  | 1 | pass (mm-mix-routing) |
| Routing 3xSTEREO 1-89 | Default routing | Stereo | ✅ | Mix routing bar |  | 1 | pass (mm-mix-routing) |

## 19. Global settings (1-87 to 1-111)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| Global slots 1-87 | 8 global slots; select, copy, paste, clear | Global slots | ✅ | GLOBAL page head: slot keys 1-8 make one active; Copy, Paste (asked first), Clear (asked first) | `globalCopy`, `globalPaste`, `globalReset` (the factory global), each one undo step | 3 | pass (e2e-mm-global-reset) |
| Turbo menu 1-87, 1-88 | TURBO negotiate speed | MIDI speed | ➖ | – | The emulator's own transfers use it internally; no cable to negotiate | – | n/a |
| Audio > Master tune 1-88 | 440.0 Hz default | Master tune | ✅ | GLOBAL > Audio > Master tune (400.0 to 499.9 Hz; − / + 0.1 Hz, Shift 1 Hz) | `masterTune`; the range is the panel's (P8 in PROBES-manual-gaps.md) | 1 | pass (e2e-mm-global-tune) |
| Audio > Routing 1-89 | Three routing modes | Routing | ✅ | Mix routing bar |  | 1 | pass (e2e-mm-mix-routing) |
| Control > MIDI channels 1-89 | Base channel | Base | ✅ | GLOBAL > Control > Base channel (OFF, 1-16) | Track t listens on base + t while t is inside the span (`117-global.js`) | 1 | pass (e2e-mm-wire-cc) |
| Control > MIDI channels 1-90 | Channel span | Span | ✅ | GLOBAL > Control > Channel span | A warning names the tracks without a channel of their own | 2 | pass (e2e-mm-global-channels) |
| Control > MIDI channels 1-90 | Multi trig channel | Multi trig ch | ✅ | GLOBAL > Control > Multi trig |  | 1 | pass (e2e-mm-perform-keys-channels) |
| Control > MIDI channels 1-90 | Multi map channel | Multi map ch | ✅ | GLOBAL > Control > Multi map |  | 1 | pass (e2e-mm-perform-keys-channels) |
| Control > MIDI channels 1-90 | Auto track channel | Auto ch | ✅ | GLOBAL > Control > Auto track |  | 1 | pass (e2e-mm-perform-keys-channels) |
| MIDI functionality 1-90 | NRPN control, program change selects pattern | MIDI in | ➖ | – | Firmware; automation and DAW MIDI reach it | – | n/a |
| Control out 1 1-91 | SEQUENCER, ARP, KEYBOARD to INT / OUT / INT+OUT | Output routing | ✅ | GLOBAL > Control out 1: Sequencer, Arp, Keyboard to INT, OUT or INT+OUT | Measured (P2): global bytes 0x07-0x09 (`globalMidi` sequencerOut, arpOut, keyboardOut). The page warns when OUT leaves the machine silent | 1 | pass (e2e-mm-global-control-out) |
| Control out 2 1-92 | TRANSPORT, MIDI CLOCK, PRG CHANGE out | Output control | ✅ | GLOBAL > Sync > Ctrl out, Tempo out; Control > Prg change out | `globalMidi` (clockOut, transportOut, programChangeOut). Machine MIDI out reaches the host since 0.4.0 | 1 | pass (e2e-mm-global-reset) |
| Control in 1-92 | TEMPO SYNC internal / external | Sync | ✅ | GLOBAL > Sync > Tempo in (INT / EXT) | In a DAW a new plug-in starts on EXT (`followHost`); INT stays and runs the machine on its own clock (review 1, I-026) | 1 | pass (mm-global-panel) |
| Control in 1-92 | TRANSPORT ACCEPT / IGNORE | Transport in | ✅ | GLOBAL > Sync > Ctrl in | A DAW turns it on itself; the page also asks once when PLAY needs it | 1 | pass (mm-global-panel) |
| Control in 1-93 | PRG CHANGE in | Program change in | 🟡 | GLOBAL > Control > Prg change in, shown as BASE | Shown, not changeable: measured, the machine always takes it on the base channel | – | n/a |
| Multi map edit 1-93 | Ranges, upper key, insert / delete | Key ranges | ✅ | Perform > Multi map table, Split, delete |  | 1 | pass (e2e-mm-perform-multi-map) |
| Multi map edit 1-93 | PAT (CUR or pattern) | Pattern | ✅ | Perform › Multi map: a range's PAT list, CUR and A01-H16 | Measured: the firmware takes and keeps pattern 128 (H16) in a range (intent case on OS 1.32B) | 1 | pass (e2e-mm-perform-map-pattern) |
| Multi map edit 1-93 | OFS, LEN | Offset, length | ✅ | OFS, LEN boxes |  | 1 | stub-only (e2e-mm-perform-multi-setup-fail) |
| Multi map edit 1-93 | TRN, TIM | Transpose, timing | ✅ | TRN, TIM boxes |  | 1 | stub-only (e2e-mm-perform-multi-setup-fail) |
| Mechanical settings 1-94 | Knob resolution (MKII) | Encoder resolution | ➖ | – | Hardware knobs | – | n/a |
| Mechanical settings 1-94 | Velocity curve, fixed velocity (SFX-6) | Keyboard response | ➖ | – | Hardware keys. The editor's own velocity is keys C / V | – | n/a |
| Mechanical settings 1-94 | Joystick mapping TIGHT / FULL | Joystick | ➖ | – | Hardware joystick | – | n/a |
| File 1-95 | Sysex send: ALL, KIT, PAT+KIT, SONG+PAT+KIT with ranges | Send dumps | ✅ | Engine menu: EXPORT SYSEX…: All (every kit, pattern, song and global), or untick All and tick Kits, Patterns, Songs, Globals, Waveforms, each with its range | The kinds are chosen one by one: a song range does not add its patterns by itself. | 1 | stub-only |
| File 1-97 | Sysex receive: ORIG, SPEC, VERF | Receive dumps | ✅ | Import SysEx: PLACE row (Original place, Specific place from a first slot per kind, the grid shows where each item lands); Verify only beside Import | Verify only writes nothing: the slots are read and compared. | 4 | pass (e2e-mm-lib-syx-import) |
| File 1-95, 1-97 | Needs the machine on SYSEX RECV | Receive session | ✅ | Editor drives it itself; pattern field shows RECV / SEND n | HW MIDI: user opens the screen | 2 | pass (e2e-mm-lib-syx-import) |
| DigiPRO manager 1-99 | Send, receive, erase, rename user waveforms; copy between Digibanks | Waveform manager | 🟡 | Export SysEx…: Waveforms (the manager's SEND) |  | – | n/a |
| +Drive settings 1-105 | Quick mode, format | +Drive | ➖ | – | Not emulated | – | n/a |
| Snapshot manager 1-106 | Load, save, rename, erase, lock snapshots | +Drive | ➖ | – |  | – | n/a |
| Digibank manager 1-107 | Switch, rename, erase, lock banks | +Drive | ➖ | – |  | – | n/a |
| MIDI seq 1-108 | Track channel per MIDI track | MIDI seq channel | ✅ | MIDI page > Channel keys | `midiTrack` op | 1 | pass (mm-midi-roll) |
| MIDI seq 1-109 | CL1-4 (CC 0-127 or AFT) | CC numbers | ✅ | MIDI page > CL1-4 |  | 1 | pass (mm-midi-roll) |

## 20. Early startup menu, technical information (1-110 to 1-116)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| Test mode 1-110 | Hardware self test, joystick calibration | Test | ➖ | – |  | – | n/a |
| Empty reset 1-110 | Clear kits, patterns, songs, globals | Reset | ✅ | Engine menu: Reset machine… > Empty reset… (asked twice): every kit, pattern and song cleared on SYSEX RECV, read back and reported in the SysEx panel | Globals stay: a global is reset in its slot in GLOBAL. | 1 | pass (e2e-mm-engine-reset-empty) |
| Factory reset 1-110 | Restore factory data | Reset | ❌ | Engine menu: Reset machine… says why it is not offered; Start from factory memory… restarts the machine as on a new install, with the saved machine memory deleted (I-024) |  | – | n/a |
| Soft reset 1-111 | Restart keeping data | Restart | ➖ | – | Reopen the editor | – | n/a |
| MIDI upgrade, send upgrade 1-111, 1-112 | OS update over MIDI | OS update | ➖ | – | The editor loads the OS 1.32B image | – | n/a |
| Specifications 1-113 | Data sheet | Specs | ➖ | – |  | – | n/a |
| MKI / MKII differences 1-114 | Hardware, user waveforms | Model | ✅ | MKI / MKII plate key: each model its own look (MKI light-blue LCD, MKII bluish-white, wave 10); MKI greys the MKII-only machines | Wave 10 made the plates true to the product photos | 1 | pass (e2e-mm-top-plate) |
| Credits, contact 1-115, 1-116 | – | – | ➖ | About box |  | – | n/a |

## 21. Appendix A: machine reference (A-1 to A-15)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| SWAVE-SAW A-1 | UNIL, UNIW, UNIX, SUBX, SUB1, SUB2, TUNE | Eight saw oscillators | ✅ | Sound with unison and sub screens |  | 1 | pass (mm-machine-picker) |
| SWAVE-PULSE A-2 | UNIL, UNIW, SUB1, SUB2, PW, PWAD, PWRS, TUNE | Pulse oscillators | ✅ | Sound with pulse screen |  | 1 | pass (mm-machine-picker) |
| SWAVE-ENS A-2 | PCH2-4, WAVE, PW, CHRL, CHRW, TUNE | Chord ensemble | ✅ | Sound with chord keyboard | Offset-ratio options of PCH not modelled | 1 | pass (mm-machine-picker) |
| SID 6581 A-3 | PW, PWAD, PWRS, WAVE, MOD, MSRC, MFRQ, TUNE | SID | ✅ | Sound with waveform and pulse screens |  | 1 | pass (mm-machine-picker) |
| DPRO-WAVE A-4 | WAVE, WP, WPM, WPRS, SYNC, SFRQ, TUNE | Wave morph | ✅ | Sound > morph screen |  | 1 | pass (mm-machine-picker) |
| DPRO-BBOX A-4 | PTCH, STRT, RTRG, RTIM; 24 drums by key | Beat box | ✅ | Sound; roll names the drums |  | 2 | pass (mm-machine-picker) |
| DPRO-DDRW A-5 | WAV1, MIX, WAV2, TIME, BR1, WID, BR2, TUNE | Doubledraw (MKII) | ✅ | Sound; MKII only | User waveforms cannot be loaded | 1 | pass (mm-machine-picker) |
| DPRO-DENS A-5 | PCH2-4, WAVE, CHRL, CHRW, TUNE | Ensemble (MKII) | ✅ | Sound; MKII only |  | 1 | pass (mm-machine-picker) |
| FM+STAT A-6 | 1FRQ, 1FIN, 1ENV, 1FB, 2FRQ, 2VOL, TONE, TUNE | FM static | ✅ | Sound > FM screen |  | 1 | pass (mm-machine-picker) |
| FM+PAR A-7 | 1-3FRQ, 1-3ENV, TONE, TUNE | FM parallel | ✅ | Sound > FM blocks |  | 1 | pass (mm-machine-picker) |
| FM+DYN A-7 | 1FRQ, 1FEN, 1VOL, 1VEN, 2FRQ, 2ENV, 2FB, TUNE | FM dynamic | ✅ | Sound |  | 1 | pass (mm-machine-picker) |
| VO-6 A-8 | VOC1-2, V-SW, VOIC, CONS, CLEN, CVOL, TUNE | Voice | ✅ | Sound > vowel map; roll shows consonant |  | 2 | pass (mm-machine-picker) |
| VO-6 tutorial A-9 | Spell a word with locks | Tutorial | ✅ | Example in the mockup | Pattern recipe, doable with the lane | 1 | pass (mm-lock-lane) |
| GND-GND A-10 | Silence | Ground | ✅ | Machine picker |  | 1 | pass (mm-machine-picker) |
| GND-SIN A-10 | Sine, TUNE | Sine | ✅ | Machine picker |  | 1 | pass (mm-machine-picker) |
| GND-NOIS A-10 | ST, RED, STON, TUNE | Noise | ✅ | Sound > noise screen |  | 1 | pass (mm-machine-picker) |
| FX-THRU A-12 | INP | Pass through | ✅ | Sound; Mix IN |  | 1 | pass (mm-machine-picker) |
| FX-REVERB A-12 | DEC, DAMP, GATE, MIX, HP, LP, INP | Gated reverb | ✅ | Sound > reverb screen |  | 1 | pass (mm-machine-picker) |
| FX-CHORUS A-13 | DEL, DEP, SPD, MIX, FB, WID, LP, INP | Chorus | ✅ | Sound > sweep screen |  | 1 | pass (mm-machine-picker) |
| FX-DYNAMIX A-13 | ATK, REL, THRS, MIX, RAT, GAIN, RMS, INP | Compressor | ✅ | Sound > compressor curve |  | 1 | pass (mm-machine-picker) |
| FX-RINGMOD A-14 | WAVE, EXT, MIX, INP | Ring modulator | ✅ | Sound > carrier screen |  | 1 | pass (mm-machine-picker) |
| FX-PHASER A-14 | CNTR, DEP, SPD, MIX, FB, WID | Phaser | ✅ | Sound > sweep screen |  | 1 | pass (mm-machine-picker) |
| FX-FLANGER A-14, A-15 | DEL, DEP, SPD, MIX, FB, WID, INP | Flanger | ✅ | Sound > sweep screen |  | 1 | pass (mm-machine-picker) |

## 22. Appendix B: MIDI control reference (B-1 to B-6)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| Channels B-1 | Base channel + 0..5 per track | Track channels | ✅ | GLOBAL > Control; keys and keyboard use them | See Control > MIDI channels | 1 | pass (e2e-mm-global-channels) |
| Note on / off B-1 | Trig amp, filter, LFO; note off releases | Notes | ✅ | On-screen keyboard, home row, roll keys | `noteOn` / `noteOff` | 1 | pass (e2e-mm-seq-pitch-keys) |
| Multi trig channel B-2 | All track, split, seq start, seq transpose | Multi trig notes | ✅ | Perform keyboard |  | 1 | pass (e2e-mm-perform-keys-channels) |
| Multi map channel B-2 | Triggers patterns | Multi map notes | ✅ | Perform keyboard |  | 1 | pass (e2e-mm-perform-keys-channels) |
| Auto channel B-2 | Notes go to the active track | Auto | ✅ | Perform "Auto track" |  | 1 | pass (e2e-mm-perform-keys-channels) |
| CC: joystick up / down B-2 | CC 1, 2 | Joystick | ✅ | Assign pad |  | 1 | pass (e2e-mm-perform-joystick-midi) |
| CC: mute B-2 | CC 3 | Mute | ✅ | Mute keys |  | 1 | pass (e2e-mm-wire-cc) |
| CC: level B-2 | CC 7 | Level | ✅ | LEVEL fader |  | 1 | pass (e2e-mm-wire-cc) |
| CC: pan B-2 | CC 10 and 62 | Pan | ✅ | PAN |  | 1 | pass (e2e-mm-wire-cc) |
| CC: synthesis 1-8 B-2 | CC 48-55 | Synth page | ✅ | SYN values |  | 1 | pass (e2e-mm-wire-cc) |
| CC: amp B-2, B-3 | CC 56-63 | Amp page | ✅ | AMP values |  | 1 | pass (e2e-mm-wire-cc) |
| CC: filter B-3 | CC 72-79 | Filter page | ✅ | FLT values |  | 1 | pass (e2e-mm-wire-cc) |
| CC: effects B-3 | CC 80-87 | Effects page | ✅ | EFX values |  | 1 | pass (e2e-mm-wire-cc) |
| CC: LFO 1-3 B-3 | CC 88-95, 104-111, 112-119 | LFO pages | ✅ | LFO values |  | 1 | pass (e2e-mm-wire-cc) |
| CC: all notes off B-3 | CC 120 | Panic | ✅ | Panic (⌘., the ▶ menu) sends All Notes Off (CC 123) on each track's channel | Measured (P5 MM): CC 120 does nothing on OS 1.32B; CC 123 lets held notes go as their note offs would. | 1 | stub-only (e2e-mm-top-panic-fail) |
| NRPN parameters B-5 | Track, parameter, value | NRPN | ✅ | MIDI page values go as NRPN 0x38-0x3F |  | 1 | pass (e2e-mm-wire-cc) |
| NRPN pitch B-5 | Pitch for a track | Pitch | ➖ | – | Firmware in; not used by the page | – | n/a |
| NRPN note off, trig track B-5 | Release, trig A / L / F | Extra trigs | ➖ | – | Not sent; manual bit order erratum recorded | – | n/a |
| NRPN multi env B-5 | Range 0x40-0x45 | Multi env | ✅ | Perform multi envelope |  | 1 | pass (e2e-mm-perform-menv-nrpn) |
| Pitch bend B-6 | Per track | Pitch bend | ✅ | Joystick pad |  | 1 | pass (e2e-mm-perform-joystick-midi) |
| Program change B-6 | Selects pattern | Pattern by PC | ➖ | – | Firmware reacts to host MIDI | – | n/a |
| Song pointer, clock, start, continue, stop B-6 | System messages | Sync | ➖ | – | Firmware; used by `followHost` | – | n/a |

## 23. Appendix C: SysEx reference (C-1 to C-6)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| 0x50 / 0x51 Global dump, request C-1 | Global slot data | Global | ✅ | Read and written: routing, MIDI channels, control in, control out 1 and 2, MIDI seq, multi map, master tune | Bytes 0x0d-0x11, 0x30-0x35 and 0x36-0x3b are kept as the machine sends them (no function found, P2) | 1 | pass (e2e-mm-global-tune) |
| 0x52 / 0x53 Kit dump, request C-1 | Kit data | Kit | ✅ | Kit library, SysEx panel |  | 1 | pass (e2e-mm-wire-sysex) |
| 0x54 Unused C-1 | – | – | ➖ | – |  | – | n/a |
| 0x55 Set current kit name C-1 | Live kit rename | Kit name | ✅ | Kit library Rename (current kit) |  | 1 | pass (e2e-mm-kit-parts) |
| 0x56 Set active global C-1 | Choose global slot | Global select | ✅ | GLOBAL panel slot keys | `globalSlot`; a slot made active during a SYSEX RECV dump stays active | 1 | pass (e2e-mm-global-slot) |
| 0x57 Load pattern C-2 | Switch pattern | LOAD PATTERN | ✅ | Pattern chooser |  | 1 | pass (e2e-mm-wire-sysex) |
| 0x58 / 0x59 Load / save kit C-2 | Kit load, save | LOAD / SAVE KIT | ✅ | Kit library |  | 1 | pass (e2e-mm-wire-sysex) |
| 0x5B Assign machine C-2 | Machine and init mode | Machine | ✅ | Machine picker |  | 1 | pass (e2e-mm-wire-sysex) |
| 0x5C Set track routing C-2 | Output bus, input | Routing | ✅ | Mix |  | 1 | pass (mm-mix-routing) |
| 0x5D / 0x5E Digipro waveform dump, request C-2 | User waveforms | Waveforms | 🟡 | Export SysEx…: Waveforms (0x5E requests, the dumps written to the file) |  | – | n/a |
| 0x5E Set Gate box parameter C-2 | Reverb parameter | Reverb | ➖ | – | Not used; reverb values go as CC | – | n/a |
| 0x61 Set tempo C-2 | Tempo | Tempo | ✅ | LCD TEMPO | 30-300 BPM | 1 | pass (e2e-mm-wire-sysex) |
| 0x67 / 0x68 Pattern dump, request C-3 | Pattern data | Pattern | ✅ | All sequence edits, chooser |  | 1 | pass (e2e-mm-wire-sysex) |
| 0x69 / 0x6A Song dump, request C-3 | Song data | Song | ✅ | Song workspace |  | 1 | pass (e2e-mm-wire-sysex) |
| 0x6C / 0x6D Load / save song C-3 | Song slot | Load song | ✅ | Songs column: Load, Save | loadSong 0x6C, saveSong 0x6D. | 1 | pass (e2e-mm-wire-sysex) |
| 0x70-0x72 Status request, set, response C-3, C-4 | Slot, mode, poly, tracks | Status | ✅ | Pattern / song mode, poly, kit state |  | 1 | pass (e2e-mm-wire-sysex) |
| TurboMIDI speed messages C-4, C-5 | Speed negotiation | Turbo | ➖ | – | Cable protocol | – | n/a |

## 24. Beyond the hardware

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| MACHINE MEMORY | What you save stays for every new session | The machine keeps its kits, patterns, songs and globals when it is switched off. | ✅ | By itself (a session without a DAW project, and the standalone, start from the saved memory); engine menu: KEEP MEMORY; Reset machine… > Start from factory memory… | I-024, doc/modern-ux/DESIGN-machine-memory.md | 1 | pass (e2e-mm-engine-memory) |
| FACTORY SONGS PLAY | Factory songs play | The songs of factory memory are there and play: load one, SONG mode, PLAY. | ✅ | Song workspace: the song slots, Load; the arrangement follows the machine | e2e: every factory song | 2 | pass (mm-real-song-playing) |
| FACTORY PATTERNS PLAY | Factory patterns play | The patterns of factory memory are there and play: pick one on the LCD, PLAY. | ✅ | The pattern chooser on the LCD | e2e: patterns spread over all 128 | 2 | pass (mm-real-pattern-playing) |
| GEN ROLLS A RHYTHM | GEN rolls a rhythm | No such function: you set the hits by hand. The editor rolls a rhythm for you from a few settings. | ✅ | GEN bar on Sequence: Random, Defaults, Hits; R | One undo step | 3 | pass (e2e-mm-gen-mutate-undo) |
| MUTATE CHANGES A SOUND | MUTATE changes a sound | No such function. The editor nudges the sound of the tracks at random, within a scope and an amount. | ✅ | GEN bar on Sequence: MUTATE, scope chips, amount | One undo step | 2 | pass (e2e-mm-gen-mutate-undo) |
| SOLO | Solo | Solo plays one track alone; the mutes you had come back when you let go. | ✅ | Mix: S on the strip; the rail | The machine has mute only | 2 | pass (e2e-mm-mix-solo) |
| UNDO AND REDO | Undo and redo | No undo. Every edit of the editor can be taken back and done again, across kits, patterns and songs. | ✅ | UNDO and REDO in the top bar; Cmd+Z, Cmd+Shift+Z | The machine has no undo | 2 | pass (e2e-mm-top-undo-redo) |
| TYPED VALUES | Typed values | Type a value into a knob instead of turning it. | ✅ | Cmd-click or Enter on a value box; the arrow keys step it | A list takes its names | 2 | pass (e2e-mm-sound-type-value) |
| THE STEP MENU | The step menu | Right-click a step for accent or slide, copy, paste and fill. | ✅ | Right-click a step (MM: in the roll or a trig row) | Keyboard and mouse | 1 | pass (e2e-mm-seq-step-menu) |
| SELECT, COPY AND PASTE STEPS | Select, copy and paste steps | Select steps with the mouse, copy, paste and clear them, to one track or several. | ✅ | Cmd-click, Cmd-drag, the top bar's Copy, Paste, Clr; Cmd+C, Cmd+V |  | 5 | pass (e2e-mm-seq-paste-steps-keeps-page) |
| COPY, PASTE AND CLEAR WHAT | Copy, Paste and Clear what | Choose what a copy, paste or clear takes: trigs, locks, the sound, the whole track. | ✅ | The what menu on Copy, Paste and Clear |  | 2 | pass (mm-copy-what) |
| DROP A FILE ON THE WINDOW | Drop a file on the window | Drop a SysEx file (or, on the Machinedrum, a sample) on the editor. | ✅ | The window itself | macOS | 1 | pass (e2e-mm-drop-syx) |
| SYSEX IMPORT WITH A PREVIEW | SysEx import with a preview | Look inside a SysEx file before you send it: tick the kinds, choose where each goes, read the report. | ✅ | Engine menu: IMPORT SYSEX… |  | 4 | pass (e2e-mm-lib-syx-import) |
| NOTES FROM A MIDI KEYBOARD LIGHT THE TRACK | Notes from a MIDI keyboard light the track | The track you play lights on the rail and in the mixer. | ✅ | Rail numbers, Mix LEDs |  | 1 | pass (e2e-mm-perform-keys-lit) |
| THE CPU METER AND THE SPEED-UPS | The CPU meter and the speed-ups | No such function. A meter shows how much of the audio time the emulation takes, with the speed-ups to switch. | ✅ | The CPU meter beside the version; Developer › Speed-ups |  | 2 | pass (e2e-mm-top-cpu-meter) |
| THE OUTPUT METER AND VOLUME | The output meter and volume | Two bars and a volume line at the end of the LCD. | ✅ | The LCD's right end |  | 1 | pass (e2e-mm-lcd-volume) |
| THE EDITOR'S MENU | The editor's menu | A right-click menu for zoom, updates and the developer switches. | ✅ | Right-click the header or the rail |  | 1 | pass (e2e-mm-top-editor-menu) |
| THE KEYBOARD VIEW | The keyboard view | The drawn keyboard, with each key's words and a search. | ✅ | The ? key in the top bar |  | 1 | pass (e2e-mm-keys-help) |
| THE COMPUTER KEYBOARD PLAYS | The computer keyboard plays | The two rows of letter keys play the selected track. | ✅ | Letter keys on any workspace |  | 2 | pass (e2e-mm-keys-play-notes) |
| TAP TEMPO | Tap tempo | Tap B (Shift+B on every workspace) to set the tempo. | ✅ | The B key |  | 2 | pass (e2e-mm-keys-tap-tempo) |
| PATTERN QUEUE AND CHOOSER | Pattern queue and chooser | Pick any of the 128 patterns from the chooser; played while it runs, it waits for the end. | ✅ | The pattern on the LCD |  | 3 | pass (mm-pattern-chooser) |
| KIT AND SONG SLOTS | Kit and song slots | The kit library and the song slots: load, copy, paste, rename and clear a slot, each undoable. | ✅ | The kit on the LCD; Song workspace |  | 5 | pass (e2e-mm-song-slots) |
| PIANO ROLL | Piano roll | Draw notes on a roll with a note length, move or box-select them and play chords; the roll writes the same step data as the machine's own entry. | ✅ | Sequence: the piano roll, Draw (B), Len | MM only | 5 | pass (e2e-mm-seq-transpose-keyboard) |
| WHAT YOU DRAW IS WHAT PLAYS | What you draw is what plays | What you enter in the sequencer is what the machine plays. | ✅ | Sequence: the grid or the roll; Alt+Delete clears the pattern; Cmd+Z takes it back | e2e: drawn, played, cleared, undone, each checked on the machine's output | 1 | pass (mm-real-sequence-drawn) |
| CLEAR | Clear (was Revert track) | The machine has no key that puts one track's sound back as stored; LOAD KIT reloads the whole kit. | ✅ | Sound: Clear key at the right end of the MUTATE bar, next to R |  | 1 | pass (e2e-mm-sound-revert-track) |

## 24. Editor features with no manual counterpart (for orientation)

The page also has things the manual does not: GEN and MUTATE generators, step selection with a box select and Draw mode in the piano roll, note lengths drawn by dragging a note's end, Control All (Alt-drag), paste to many tracks, ghost notes, ramps in the lock lane, undo and redo, DAW tempo follow, the AUDIO / MIDI panel, ROM and engine menu, SysEx import preview and report. They are not counted below.

## 25. Summary

Counts are rows of sections 1 to 23 by the Our UI column. (Computed from this file.)

| Our UI | Rows |
|---|---|
| ✅ | 361 |
| 🟡 | 14 |
| ❌ | 1 |
| ➖ | 34 |
| Total | 410 |

### Top gaps, ranked (our UI)

1. **No DigiPRO user waveform manager (1-99 to 1-104, 0x5D / 0x5E).** MKII machines can pick waveforms 1-64 but the user cannot send, receive, rename or erase them.
2. **Step recording and live-record erase (1-50, 1-49)** are in the page since 0.6 (wave 7): ⇧-click REC, and Delete held while live recording.
3. **Song: no pointer jump or play-from-row (1-75, 1-77), no SAVE SONG, song-slot copy or rename (1-74).** The page shows the playing row but cannot set it; `saveSong` exists in the desk but no control uses it.
4. **GLOBAL is mostly there, with holes (1-87, 1-88, 1-91).** Master tune, CONTROL OUT 1 (sequencer, arp, keyboard to INT / OUT), and copy / paste / clear of a global slot are missing; some bytes of the global are not decoded.
5. **Super copy / super clear (1-54, 1-55) and whole-track copy (1-52).** A step selection copies steps, slides and locks of chosen tracks, but not a chosen part (melody only) and not arp, transpose or swing with it.
6. **SysEx file functions are partial (1-95 to 1-98).** Export is all-in-one; there is no ranged send, no SPEC write position and no VERIFY-only receive.
7. **Transport details (1-5, 1-56).** No pause, no double-STOP rewind and all-notes-off, no +/-10 % tempo nudge, no delayed tempo change, no panic (CC 120).
8. **Arpeggiator, swing and slide have no copy / clear / paste / undo of their own (1-62, 1-65, 1-66).** Page undo only.
9. **Lock helpers (1-14, 1-57).** No key that drops only the locks of one step and keeps its note, and no "lock the current value" click.
10. **Reset functions (1-110).** No empty reset or factory reset from the editor (GLOBAL has Clear for one slot); the page cannot show or open the UNDO KIT slot.
