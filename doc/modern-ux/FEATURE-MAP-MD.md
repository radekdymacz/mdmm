> Generated from doc/features/md.json by scripts/mdmm-guide.mjs; edit the JSON.

# Machinedrum manual vs our editor: feature map

Manual: Machinedrum SPS-1 / SPS-1UW MKII user's manual, OS 1.53, rev J (2010), 122 PDF pages; page numbers are the printed ones. Date: 2026-10-10, rechecked 2026-10-11. Code state: `main`.

Checked against main at 6da67ce3e, 2026-10-11.

The question per row: **does our web page (the Machinedrum Editor) offer this?** The page is the only UI: the shipped editor has no emulated front panel or LCD (`mdEditorPages.h`). The firmware runs underneath, so some functions work when the page, MIDI or SysEx asks, or on a real machine's panel via the HW MIDI engine. That is only noted in the last column.

Our UI column: ✅ Yes (own control) · 🟡 Partial · ❌ No · ➖ Not applicable (hardware only, such as power or the LEVEL meter's jacks).

Method: manual read in full; claims checked against the page files (`source/elektron/md/mdJucePlugin/skins/mdStudio/*.js`, `skins/shared/`), the command table `mdDesk/mdDeskModel.cpp`, `elektronData/`, the shared page files in `skins/shared/` and `doc/modern-ux/keymap.json`. Machines are listed per machine; all of them have a group table in `mdDeskSoundGroups.js`. The older plan `manual-mapping.md` was only a guide.

## 1. Introduction, front panel and connectors (pp.1-8)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| p.4 | Master volume knob | Main and headphone level | ➖ | Host / DAW or system volume | Plug-in output level belongs to the host. | – | n/a |
| p.4 | SOUND SELECTION LEDs and wheel | Pick the active track, show trigs | ✅ | Track rail (left); track keys 1-16 via arrows Up/Down | Activity LEDs on Mix strips. | 1 | pass (e2e-md-keys-track-select) |
| p.4 | FUNCTION + TRIG selects a track | Quick track select | ✅ | Click a track in the rail | No FUNCTION needed. | 1 | pass (e2e-md-seq-lock-lane) |
| p.4 | CLASSIC/EXTENDED key | Switch editing mode | ✅ | LCD line 2: MODE (click) | mdDeskTop.js l2step 'mode'. | 1 | pass (md-top-mode-classic) |
| p.4 | FUNCTION key (secondary functions) | Modifier for everything | 🟡 | Alt key, or FN key in top bar | Alt = 'all tracks'; the machine's FUNCTION combos are mapped one by one below. | – | n/a |
| p.4 | BANK key and A/E, B/F, C/G, D/H keys | Pick a pattern bank and pattern | ✅ | Pattern chooser (click Pattern in the LCD; keys A-H) | mdDeskLibrary.js. | 1 | pass (md-pattern-chooser) |
| p.4 | ENTER/YES, EXIT/NO, arrow keys | Menu navigation | ➖ | Not needed | Every menu is a native control. The firmware supports it; only a real machine's panel (HW MIDI engine) can do it today. | – | n/a |
| p.5 | LEVEL knob (per-track overall gain) | LEV, cannot be locked or LFO'd | ✅ | Mix: the LEV box above each strip's VOL fader (drag, wheel, arrows; double-click 100) | The kit's level of the track (`level`), sent as the track's level CC. Not lockable, as on the machine. The level CC measured on OS 1.63 (P9: 0 silent, 64 about 0.4 of 100, 127 about 1.6). | 1 | pass (e2e-md-mix-lev) |
| p.5 | TEMPO key | Open tempo screen | ✅ | LCD: Tempo (drag), T key to tap | See §9. | 5 | pass (e2e-md-top-tempo-drag) |
| p.5 | DATA ENTRY knobs (A-H), pressed = coarse | Eight parameter knobs | ✅ | Value boxes on Sound and Mix; drag, wheel, Shift = fine; ⌘-click or Enter: type a value | Wheel notch 1, Shift 10. | 3 | pass (e2e-md-sound-shape-undo) |
| p.5 | SYNTHESIS/EFFECTS/ROUTING toggle | Switch knob page | ✅ | Sound page shows all three as groups | No page toggle; all pages in one view. | 1 | pass (md-sound-workspace) |
| p.5 | RECORD key (grid record on/off) | Toggle grid edit | ➖ | Grid is always editable | The step grid needs no mode. | – | n/a |
| p.5 | RECORD + PLAY (live recording) | Live record | ✅ | REC button, Alt+Space | LCD top bar. | 1 | fail (e2e-md-seq-live-record-fail) |
| p.5 | PLAY (second press pauses) | Start / pause | ✅ | Play key: ⇧-click or ⇧Space pauses (▶ blinks, the position holds), ▶ goes on; the ▶ menu (right-click or its ▾) | Pause and Continue are MIDI Stop and Continue on both engines (P1, P1b): with CTRL IN off the machine takes neither, and the editor says so. | 3 | pass (md-step-grid) |
| p.5 | STOP; double STOP silences all voices | Stop, panic | ✅ | Panic: ⌘. or the ▶ menu's Panic (the machine's STOP pressed twice) | Over HW MIDI there is no panic: no MIDI message silences the Machinedrum (P5); the menu entry is off and says why. | 1 | pass (e2e-md-top-panic) |
| p.5 | STOP + PLAY restarts from the top | Restart | 🟡 | Stop then Play | Same result in two clicks. | – | n/a |
| p.5 | PATTERN/SONG key | Switch sequencer mode | ✅ | Song page: PATTERN · CHAIN · SONG keys; LCD PLAY value | seqMode command. | 4 | pass (e2e-md-song-mode) |
| p.5 | KIT key (kit menu) / FUNCTION + KIT (song menu) | Open kit / song menus | ✅ | Kit: library popover. Song: the Songs column on the Song page (Load, Save, Save to…, Copy, Paste, Clear, Rename) | The song menu is the Songs column (0.6). | 1 | pass (md-kit-library) |
| p.5 | TRIG keys 1-16 | Play tracks, place notes, pick patterns | ✅ | Step grid; piano keys A-L play the selected track | Right-click a step for its menu. | 2 | pass (md-step-grid) |
| p.5 | SCALE SETUP key (page switch) | Pick pattern page | ✅ | Page key and page LEDs above the grid, [ and ] | ALL view shows every step. | 1 | pass (e2e-md-seq-pages) |
| p.5 | <PATTERN PAGE> LEDs; MKI LEDs | Page indicator | ✅ | Page LEDs (four) in Sequence | MKI 32-step LEDs: see §13. | 1 | pass (md-sequence-workspace) |
| p.6 | Power switch, DC input | Power | ➖ |  |  | – | n/a |
| p.6 | MIDI In / Out / Thru | MIDI ports | 🟡 | AUDIO/MIDI settings (standalone); HW MIDI engine; GLOBAL panel | Since 0.4.0 the machine's own MIDI out (notes, CCs, clock; never its SysEx) reaches the DAW's plug-in MIDI output and the standalone's MIDI output. Thru has no meaning in software. | – | n/a |
| p.6 | Inputs A and B (audio in) | External audio | 🟡 | INP machines on Sound; audio input in settings | Input device choice in AUDIO/MIDI settings. | – | n/a |
| p.7 | Individual outputs A-F, main out, headphones | Output jacks | 🟡 | Mix: OUT key per track; Global: Routing; plug-in output buses | Output buses depend on the host. Headphones: N/A. | – | n/a |
| p.7 | Rack mount kit, connecting, care, battery | Hardware | ➖ |  |  | – | n/a |

## 2. LCD user interface and quick start (pp.9-12)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| p.9 | Tempo display with one decimal | Show BPM | ✅ | LCD: Tempo |  | 1 | pass (e2e-md-top-tempo-drag) |
| p.9 | Four pattern-page boxes | Playback page | ✅ | Page LEDs; LCD Position |  | 1 | pass (md-sequence-workspace) |
| p.9 | Transport symbols | Record/play/pause/stop | ✅ | Play key: blinks while paused; POSITION keeps the held step |  | 1 | pass (e2e-md-top-pause) |
| p.9 | Kit name and number | Current kit | ✅ | LCD: Kit with saved/edited chip |  | 1 | pass (md-kit-library) |
| p.9 | Synth, machine and page text | Focus info | ✅ | Sound: machine button, family; LCD line 2 |  | 1 | pass (md-lcd) |
| p.9 | Level bar (overall volume of the track) | LEV meter | ✅ | Mix: the LEV box's bar shows the stored level | The box's fill is the level, as the LCD's bar. | 1 | pass (e2e-md-mix-lev) |
| p.9 | Eight value boxes with 'clip' between dependent values | Parameter display | ✅ | Sound: an arch over the gap between two boxes the machine joins with a clip; each box of a pair names the other in its tooltip | Clips measured on the firmware for every machine and page (gapProbesFirmwareTest w12clip, elektronData::mdMachineClips) | 1 | pass (md-sound-clips) |
| p.9 | Windows over the main screen, icon help, EXIT closes | Layer edit | ➖ | Popovers close with Esc |  | – | n/a |
| p.10 | Load a kit and trig tracks (quick start) | Basic play | ✅ | Kit library; step grid; piano keys | See §4. | 1 | pass (md-quick-start) |
| p.10 | Accelerated knob editing (pressed knob) | Coarse step | ✅ | Wheel with Shift = 10; Shift-drag = fine |  | 1 | pass (md-sound-knob-steps) |
| p.11 | Hear a machine before loading it (EDIT KIT preview) | Preview default sound | ✅ | Sound > machine picker: ▶ on a machine key (or Space) plays it on the track; Enter or a click keeps it, Esc puts the old one back | The machine goes on the track and the track's note plays, so it is heard with the track's values (the machine's own preview plays its default sound). The audition and the pick are one undo step. Measured on OS 1.63 (P9): the note right behind the machine's SysEx plays the new machine. | 1 | pass (e2e-md-sound-audition) |

## 3. Sound synthesis: kits (pp.13-21)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| p.14 | Kit contents (16 machines, params, track FX, routing, master FX, name) | The kit document | ✅ | Sound, Mix, kit library | Whole kit is read and written as a dump. | 1 | pass (md-kit-library) |
| p.14 | Load kit (64 slots) | LOAD KIT | ✅ | Kit library: click a slot (Enter) | Asks first over unsaved edits. | 1 | pass (e2e-md-lib-load-save-dialog) |
| p.15 | Kits not linked to a pattern marked with a star | Unused-kit marker | ✅ | Kit library slot name ends with * | EXTENDED only. | 1 | pass (md-kit-library) |
| p.15 | Save kit and choose slot | SAVE KIT | ✅ | Kit library: Save, Save as Knn | UNDO KIT keeps the overwritten kit. | 1 | pass (e2e-md-lib-load-save-dialog) |
| p.15 | Name a kit (letters, high-score picker) | Kit name | ✅ | Kit library: Rename (F2 / double-click), 16 chars | Typing replaces the wheel. | 1 | pass (e2e-md-lib-kit-rename-undo) |
| p.16 | UNDO KIT (kit list entry 0) | Restore lost kit | ✅ | Kit library: UNDO KIT (the machine's KIT > LOAD KIT > UNDO KIT through its keys; off over HW MIDI) | Measured: the lost kit plays again unsaved, its own slot current; LOAD KIT 64-127 does not reach it (gapProbesFirmwareTest w12undo) | 1 | pass (e2e-md-lib-undo-kit) |
| p.16 | Copy kit and paste to slot | Kit copy | ✅ | Kit library: Copy, Paste, drag onto slot (Cmd+C/V) |  | 1 | pass (e2e-md-lib-kit-copy-paste-undo) |
| p.17 | Clear kit | CLEAR KIT | ✅ | Kit library: Clear (Delete) writes what the machine's CLEAR KIT leaves | Measured: every track GND-EMPTY at the same values, master effects at their start, name byte 0x7f (gapProbesFirmwareTest w12clearkit, elektronData::mdClearedKit) | 1 | pass (e2e-md-lib-kit-clear-undo) |
| p.17 | Undo paste / clear kit | Undo | ✅ | Cmd+Z |  | 2 | pass (e2e-md-lib-kit-copy-paste-undo) |
| p.17 | Kit assembly: pick MD-synth and machine per track | EDIT KIT | ✅ | Sound: machine button opens the picker by family | All 10 families. | 1 | pass (e2e-md-sound-machine-pick-undo) |
| p.18 | Load machine and keep track FX / routing | FUNCTION + ENTER | ✅ | Picker: 'Keep effects + routing' toggle (default on) | S.keepFx. | 1 | pass (e2e-md-sound-keep-clear) |
| p.18 | Mute relation (mute group) | Track A mutes track B | ✅ | Sound: Relations > Mute | Shown as a note in the group box. | 1 | pass (md-relations) |
| p.19 | Trig relation (layered drums, no chains) | Track A trigs track B | ✅ | Sound: Relations > Trig |  | 1 | pass (md-relations) |
| p.19 | Copy machine | COPY MACHINE | ✅ | Sound: Cmd+C on a track | Copies model, values, level, LFO. | 1 | pass (e2e-md-sound-copy-paste) |
| p.20 | Paste machine (many times, to other kits) | PASTE MACHINE | ✅ | Sound: Cmd+V | Clipboard stays. | 1 | pass (e2e-md-sound-copy-paste) |
| p.20 | Clear machine / undo | CLEAR MACHINE | ✅ | Machine picker: GND-EMPTY (the track has no machine); Cmd+Z undoes it | Clr on the Sound page is a different thing: it resets the sound to neutral values (the machine stays). | 1 | pass (e2e-md-sound-keep-clear) |
| p.21 | Machine parameter editing (up to 8 knobs) | SYNTH page | ✅ | Sound: groups with canvases and boxes | Every knob sits in one group. | 4 | pass (e2e-md-sound-shape-undo) |
| p.21 | Kit changes lost unless saved | Dirty warning | ✅ | Saved / edited chip on LCD kit field |  | 1 | pass (e2e-md-dialog-esc-space-cancel) |

## 4. Track effects (pp.22-24)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| p.22 | AMD: amplitude modulation depth | Tremolo depth | ✅ | Sound > Amp mod |  | 1 | pass (md-sound-workspace) |
| p.22 | AMF: amplitude modulation frequency | Tremolo rate | ✅ | Sound > Amp mod |  | 1 | pass (md-sound-workspace) |
| p.23 | EQF: EQ centre frequency | 1-band EQ | ✅ | Sound > EQ |  | 1 | pass (md-sound-workspace) |
| p.23 | EQG: EQ gain | Boost/cut | ✅ | Sound > EQ | Bipolar in the lock lane. | 1 | pass (md-sound-workspace) |
| p.23 | FLTF: filter base frequency | 24 dB filter | ✅ | Sound > Filter |  | 1 | pass (md-sound-workspace) |
| p.23 | FLTW: filter width | Gap between HP and LP | ✅ | Sound > Filter |  | 1 | pass (md-sound-workspace) |
| p.24 | FLTQ: filter Q | Resonance | ✅ | Sound > Filter |  | 1 | pass (md-sound-workspace) |
| p.24 | SRR: sample rate reducer | Sample and hold | ✅ | Sound > Sample rate |  | 1 | pass (md-sound-workspace) |

## 5. Routing page (pp.25-27)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| p.25 | DIST: output distortion | After track FX | ✅ | Sound > Drive; Mix strip |  | 1 | pass (md-sound-workspace) |
| p.25 | VOL: track volume (lockable) | Separate from LEV | ✅ | Mix fader; Sound > Level |  | 1 | pass (md-mix-strip) |
| p.26 | PAN (-64 to +63) | Stereo position | ✅ | Mix strip; Sound > Level pan | No effect on A-F outputs; Mix shows it. | 1 | pass (e2e-md-mix-pan-undo) |
| p.26 | DEL: delay send | To Rhythm Echo | ✅ | Mix strip; Sound > Sends | Greyed with a note on direct outputs. | 1 | pass (md-sound-workspace) |
| p.27 | REV: reverb send | To Gate Box | ✅ | Mix strip; Sound > Sends | Same. | 1 | pass (md-sound-workspace) |
| p.27 | LFOS, LFOD, LFOM on the routing page | LFO speed, depth, mix | ✅ | Sound > LFO (SPD, DEPTH, SHMIX) | Same kit parameters. | 1 | pass (md-sound-workspace) |

## 6. Stereo master effects (pp.28-31)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| p.28 | Master FX menu (KIT > MASTER FX), only main outputs | Open effects | ✅ | Mix: four effect cards and signal-path line | Saved with the kit. | 1 | pass (e2e-md-mix-master-fx) |
| p.29 | Rhythm Echo: TIME, MOD, MFRQ, FB, FILTF, FILTW, MONO, LEV | Delay | ✅ | Mix > Rhythm Echo card with tap editor | TIME in 128th notes. | 1 | pass (md-master-effects) |
| p.30 | Gate Box: DVOL, PRED, DEC, DAMP, HP, LP, GATE, LEV | Reverb | ✅ | Mix > Gate Box card |  | 1 | pass (md-master-effects) |
| p.30 | Master EQ: LF, LG, HF, HG, PF, PG, PQ, GAIN | Shelves and parametric | ✅ | Mix > EQ card |  | 1 | pass (md-master-effects) |
| p.31 | Dynamix: ATCK, REL, TRHD, RTIO, KNEE, HP, OUTG, MIX | Compressor | ✅ | Mix > Dynamix card |  | 1 | pass (md-master-effects) |
| p.28 | Control master FX by CTR machines | CTR-RE, GB, EQ, DX locks | ✅ | Sound: CTR machine tables | Only way to lock master FX. | 1 | pass (e2e-md-sound-ctr-locks) |

## 7. LFOs (pp.32-34)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| p.32 | LFO edit window (16 LFOs, one per track) | FUNCTION + SYNTH key | ✅ | Sound: LFO row for the selected track | One LFO per track as default. | 1 | pass (md-lfo) |
| p.32 | TRACK target | Which track | ✅ | Sound > LFO target (first menu) |  | 1 | pass (md-lfo) |
| p.32 | PARAM target (synth, FX, routing, other LFO) | Which parameter | ✅ | Sound > LFO target (second menu) | LFO-on-LFO via LFOS/LFOD/LFOM; higher-track rule is the firmware's. | 1 | pass (md-lfo) |
| p.32 | SHP1: six shapes | Waveform 1 | ✅ | Sound > LFO shape keys |  | 1 | pass (md-lfo) |
| p.32 | SHP2: inverted shapes | Waveform 2 | ✅ | Sound > LFO shape keys |  | 1 | pass (md-lfo) |
| p.32 | UPDTE: FREE / TRIG / HOLD | Retrig behaviour | ✅ | Sound > LFO motion |  | 1 | pass (md-lfo) |
| p.32 | SPEED (1/128 notes) | SPD | ✅ | Sound > LFO motion |  | 1 | pass (md-lfo) |
| p.33 | DEPTH | Amount | ✅ | Sound > LFO motion |  | 1 | pass (md-lfo) |
| p.33 | SHMIX | Waveform balance | ✅ | Sound > LFO shape |  | 1 | pass (md-lfo) |
| p.34 | Two LFOs on one target add up | Layering | ✅ | Set same target twice | Not drawn as a total. | 1 | pass (md-lfo) |
| p.34 | Copy, paste, clear, undo of an LFO | LFO clipboard | ✅ | Sound: ⋯ on the LFO card: Copy LFO, Paste LFO, Clear LFO; LCD ▾ Copy… / Paste… / Clear… with LFO ticked; Cmd+Z | An LFO that moved its own track moves the track it is pasted on. | 1 | pass (md-lfo-menu) |

## 8. Pattern sequencer (pp.35-50)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| p.35 | CLASSIC mode | Trigs only, no kit link | ✅ | LCD MODE = CLASSIC | Lock lane greyed; locks kept. | 1 | pass (md-top-mode-classic) |
| p.35 | EXTENDED mode (kit link, locks) | Pattern recalls its kit | ✅ | LCD MODE = EXT; Pattern chooser shows Knn |  | 1 | pass (md-top-mode-classic) |
| p.36 | Tempo: integer and decimal steps | Tempo screen | ✅ | LCD tempo drag (Shift = 0.1) | Arrow keys step it when focused. | 1 | pass (md-top-tempo-steps) |
| p.36 | FUNCTION held: tempo changes on release | Delayed change | ✅ | TEMPO window (a click on the tempo): Change on release; ⌥-drag the tempo does it once |  | 1 | pass (e2e-md-top-tempo-release) |
| p.36 | Temporary +/-10 % tempo shift (LEFT/RIGHT) | Turntable sync | ✅ | TEMPO window: −10 % / +10 % held, or the keys - and = held; back at the release, nothing stored |  | 1 | pass (e2e-md-top-tempo-window) |
| p.36 | Tap tempo | FUNCTION + TEMPO | ✅ | T or B key; Shift+B on every workspace | keymap.json tap-tempo, tap-tempo-shift. On the Monomachine B is Draw on Sequence, so Shift+B is the one key both editors share. | 3 | pass (e2e-md-keys-tap-tempo) |
| p.36 | External sync, EXT shown | MIDI clock follow | ✅ | Global > Sync > Tempo in; host tempo marked on LCD | In a DAW Tempo in is the switch (review 1, I-026): EXT follows the DAW's tempo and transport (a new plug-in starts so), INT runs the machine on its own clock and TEMPO is editable; kept with the project (`followHost`, `deskHostClock.h`; mdDeskFirmwareTest hostclock). | 1 | pass (md-global-panel) |
| p.37 | Pattern selection (8 banks x 16) | A01-H16 | ✅ | Pattern chooser; prev/next arrows |  | 4 | pass (e2e-md-top-pattern-next) |
| p.37 | Uninitialised patterns shown by LEDs | Which are empty | ✅ | Pattern chooser: EMPTY slots |  | 1 | pass (md-pattern-chooser) |
| p.37 | Pending pattern at the pattern end | Queue | ✅ | Pattern chooser Queue / Now; LCD blinks |  | 1 | pass (e2e-md-seq-queue-while-playing) |
| p.37 | Sticky bank keys (two seconds) | One-hand operation | ➖ |  | Not needed with the mouse. | – | n/a |
| p.37 | Pattern chaining (one bank, each pattern once) | Chain | ✅ | Song page > Patterns > Chain | Limit 16 pads in page. | 1 | pass (e2e-md-song-chain) |
| p.37 | STOP jumps to a queued pattern | Chain behaviour | ✅ | STOP (▶ or Space) with a pattern queued: it becomes the current pattern at once (the machine's STOP); the LCD and the chooser say so | Measured: the panel's STOP switches to a pattern cued by LOAD PATTERN; MIDI Stop does not (gapProbesFirmwareTest w12stop) | 1 | pass (e2e-md-top-stop-queued) |
| p.37 | Parameter tweaking: FUNCTION + knob on all tracks | Control All | ✅ | Alt-drag a value; MUTATE | Cmd 'tweak'. | 1 | pass (e2e-md-sound-control-all) |
| p.38 | Filter sweep with FUNCTION + knob E/F in TFX | Whole-pattern sweep | ✅ | Alt-drag FLTF / FLTW | Same. | 1 | pass (e2e-md-sound-filter-sweep) |
| p.38 | FUNCTION + CLASSIC/EXTENDED reloads kit | Revert | ✅ | Kit library: Reload (kit field) |  | 1 | pass (md-kit-reload) |
| p.38 | Scale setup: number of steps | Pattern length | ✅ | LCD LEN with Alt (inner length) |  | 1 | pass (md-seq-scale) |
| p.38 | Scale setup: total length 16/32/48/64 | Pages | ✅ | LCD LEN | Doubling: LEN x2 key. | 1 | pass (md-seq-scale) |
| p.38 | Scale setup: tempo multiplier 1X, 2X, 3/4X, 3/2X | Speed | ✅ | LCD SPD |  | 1 | pass (md-seq-scale) |
| p.38 | First page copied to later pages when extending | Auto fill | ✅ | LCD LEN (total length): a longer total repeats the steps into the new ones, as the machine's SCALE SETUP; a message says so | Measured: copied only when no track has a trig past the old total (gapProbesFirmwareTest w12extend); mdDeskFirmwareTest p4 compares the editor with the panel | 1 | pass (e2e-md-seq-len-repeats) |
| p.39 | Grid recording (trig toggle per step) | Compose | ✅ | Step grid click; drag paints | Undo is one step per drag. | 3 | pass (md-step-grid) |
| p.39 | Pattern pages in grid mode | Switch page | ✅ | Page key |  | 1 | pass (e2e-md-seq-pages) |
| p.39 | No save needed; copy before editing | Work in memory | ✅ | Library copy |  | 1 | pass (md-kit-reload) |
| p.39 | FUNCTION + LEFT/RIGHT moves notes | Rotate | ✅ | Alt + arrows (Sequence) | Moves trigs, accents and locks, wrapping at the length; a run is one undo step. | 2 | pass (e2e-md-seq-rotate) |
| p.39 | MKI pattern page LEDs | 32 steps | ➖ |  | See §13. | – | n/a |
| p.39 | Live recording, quantised | Play TRIG keys | ✅ | REC then click steps / piano keys | Quantised by the machine. | 1 | fail (e2e-md-seq-live-record-fail) |
| p.40 | Remove notes while live recording (EXIT + TRIG) | Erase live | ✅ | Hold Delete while live recording: the selected track's trigs go as they play |  | 1 | pass (e2e-md-seq-live-erase) |
| p.40 | Note copy / paste with locks | COPY NOTE | ✅ | Select a step (Cmd-click), Cmd+C, Cmd+V; also Cmd+X, Cmd+D (duplicate), step menu | Copy carries locks, accents and slides. Shared selection code: skins/shared/deskSelect.js. | 4 | pass (e2e-md-seq-select-copy-paste) |
| p.40 | Clear note parameter locks / undo | CLEAR NOTE LOCKS | ✅ | Step menu clear; lane erase (Alt-drag) |  | 1 | pass (md-lock-lane) |
| p.41 | Track copy / paste (notes, machine, LFO, locks) | COPY TRACK | ✅ | LCD ▾ beside COPY CLR PASTE: Copy…, Paste…, Clear… what (⌘⇧C, ⌘⇧V): tick trigs, accent, swing, slide, locks, machine + sound, LFO; Paste lights the tracks to paste into; one undo step. Also a selection's Cmd+C / Cmd+V | The whole track (all 64 steps) and its sound in one copy. | 2 | pass (md-copy-what-menu) |
| p.41 | Clear track / undo | CLEAR TRACK | ✅ | ALL view then Clr, or select the track's steps (step ruler) and press Delete | Delete clears only selected steps; with none selected it does nothing (a hint says so). | 2 | pass (e2e-md-seq-copy-paste-clear) |
| p.42 | Copy / paste track page | COPY PAGE | ✅ | Cmd+C with no selection copies the page shown |  | 2 | pass (e2e-md-seq-copy-paste-clear) |
| p.42 | Clear track page | CLEAR PAGE | ✅ | Clr key (LCD) | Clears the page shown of the selected track; with Alt held the key reads All and clears the pattern. | 1 | pass (e2e-md-seq-clear-page) |
| p.43 | Pattern copy / paste (with kit link) | COPY PATTERN | ✅ | Pattern chooser: Copy, Paste, drag |  | 1 | pass (md-pattern-chooser) |
| p.44 | Clear pattern / undo | CLEAR PATTERN | ✅ | Alt+Clr / Alt+Delete; pattern chooser Clear | Chooser clear keeps length and kit link. | 2 | pass (e2e-md-seq-clear-pattern-undo) |
| p.44 | Mute window: toggle tracks | Track mute | ✅ | M keys in rail and Mix; M key | Read from machine memory. | 4 | pass (e2e-md-keys-mute) |
| p.44 | Held mute changes applied on release (+ and X marks) | Prepare mutes | ✅ | Shift-click M keys, apply on release |  | 1 | pass (e2e-md-mix-shift-mutes) |
| p.45 | Minimise mute window | Compact HUD | ➖ |  | Always visible. | – | n/a |
| p.45 | Mutes persist across patterns and modes | Behaviour | ✅ | Machine memory |  | 1 | pass (e2e-md-keys-mutes-persist) |
| p.45 | Accent amount 0-15 | ACCENT level | ✅ | LCD ACC |  | 1 | pass (md-seq-swing-accent) |
| p.45 | Accent trigs per step | Accent pattern | ✅ | Shift-click a step; Accent in the trig types under the grid, then click or drag steps | Honours EDIT ALL (All tracks · This track in the trig types). | 2 | pass (md-accent) |
| p.45 | Accent pattern ALL vs per-track edit | EDIT ALL toggle | ✅ | Sequence: choose Accent, Swing or Slide in the trig types under the grid, then All tracks or This track | The pattern's EDIT ALL per mark (markMode). Measured (gapProbesFirmwareTest p7): any nonzero flag is ALL and reaches every track; there is no per-track take setting, so the design's track dots are not built. | 1 | pass (e2e-md-seq-trig-types) |
| p.46 | Copy / paste / clear accent pattern or track | Accent clipboard | ✅ | LCD ▾ beside COPY CLR PASTE: Copy…, Paste…, Clear… what (Accent ticked); a selection's copy includes accents | With EDIT ALL on, the accent row is the pattern's, shared by every track. | 2 | pass (md-copy-what-menu) |
| p.46 | Swing amount 50-80 % | SWING level | ✅ | LCD SWG |  | 1 | pass (md-seq-swing-accent) |
| p.46 | Swing step pattern (which steps swing) | Swing trigs | ✅ | Sequence: Swing in the trig types under the grid, then click or drag steps with a trig; a teal mark on the step | swingStep; a swing mark needs a trig, as accent and slide. | 1 | pass (e2e-md-seq-trig-types) |
| p.46 | Per-track swing | Swing tracks | ✅ | Sequence: Swing in the trig types, This track: each track's own swing steps | All tracks share the SWG amount, as on the machine. | 1 | pass (e2e-md-seq-trig-types) |
| p.47 | Copy / paste / clear swing | Swing clipboard | ✅ | LCD ▾ beside COPY CLR PASTE: Copy…, Paste…, Clear… what (Swing ticked); a selection's copy includes swing marks | With EDIT ALL on, the swing row is the pattern's. | 1 | pass (e2e-md-seq-swing-copy) |
| p.47 | Parameter locks, grid: hold TRIG + knob | Lock a value | ✅ | Lock lane: drag over a step; parameter keys | 64 budget meter on LCD. | 2 | pass (e2e-md-seq-lock-lane) |
| p.48 | View a step's locks (hold TRIG) | Inspect | ✅ | Lock lane shows each step's value; chips show counts |  | 1 | pass (e2e-md-seq-lock-lane) |
| p.48 | Remove all locks of a step / one lock | Unlock | ✅ | Step menu; Alt-drag lane erase; Alt+clear key |  | 2 | pass (e2e-md-seq-lock-lane) |
| p.48 | 64 locked parameters per pattern | Budget | ✅ | LCD Locks counter, refuses past 64 |  | 1 | pass (e2e-md-seq-lock-budget) |
| p.48 | Locks only play in EXTENDED, kept in CLASSIC | Behaviour | ✅ | Lane greyed in CLASSIC |  | 1 | pass (md-top-mode-classic) |
| p.48 | Live-recorded locks (move a value while recording) | Live locks | ✅ | REC and move a value | Locks next unplayed trig. | 1 | stub-only (md-live-recording) |
| p.48 | Remove live locks (EXIT + knob) | Erase live locks | ✅ | Press a track value, then hold Delete while live recording: its locks go as they play | EXIT/NO with the knob's switch on the machine (measured: either order, a tap does not latch, trigs and other locks stay); the core selects the track and shows the knob's page first | 1 | pass (e2e-md-seq-live-unlock) |
| p.49 | Slide trigs (ALL and per track) | Parameter slide | ✅ | Alt+Shift-click a step; Slide in the trig types under the grid, then click or drag steps; All tracks or This track |  | 2 | pass (md-accent) |
| p.50 | Copy / paste / clear slide | Slide clipboard | ✅ | LCD ▾ beside COPY CLR PASTE: Copy…, Paste…, Clear… what (Slide ticked); a selection's copy includes slides | With EDIT ALL on, the slide row is the pattern's. | 1 | pass (md-copy-what-menu) |

## 9. Song mode (pp.51-56)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| p.51 | Song capacity: 256 rows, 32 songs | Limits | ✅ | Song page: Songs column (32 slots); row count |  | 1 | pass (md-song-workspace) |
| p.51 | Load song | LOAD SONG | ✅ | Songs column: select a slot, Load (Enter); LCD SONG; loads when stopped |  | 2 | pass (e2e-md-song-load-play) |
| p.52 | Play, pause, stop a song | Transport | ✅ | Play key: play, pause (⇧-click, ⇧Space), stop; in SONG mode as in pattern mode |  | 2 | pass (md-song-what-plays) |
| p.52 | Move song pointer to a row; start from a row | Navigate, transport | ✅ | Song: ▶ From here on the selected row, or Enter (SONG mode, the song position, Continue) | A LOOP or JUMP before the row cannot be counted through: the editor says so (start the song and let it play there). | 1 | pass (md-song-what-plays) |
| p.52 | Playing row shown, repeats left | Playhead | ✅ | Song: the playing row marked +2, +1, last; the What plays line ends 2 more / last | The machine's own counter (RAM 0x2b1901, gapProbesFirmwareTest w12repeats), telemetry songRepeats | 2 | pass (e2e-md-song-playhead) |
| p.52 | STOP holds, second STOP to start | Stop behaviour | ✅ | Play key: ⇧-click pauses and holds the position; ▶ goes on, Stop in the ▶ menu ends it |  | 1 | pass (e2e-md-top-pause) |
| p.53 | Song editor: pattern, REP, BPM, offset, length, mute | EDIT SONG | ✅ | Song > Selected row; arrangement grid |  | 1 | pass (md-song-loop) |
| p.53 | Insert / remove step | FUNCTION + arrows | ✅ | Add by palette, Duplicate, Delete |  | 2 | pass (e2e-md-song-arrange-rows) |
| p.53 | Copy / paste / clear / undo rows | Row clipboard | ✅ | Cmd+C/V; Delete; Cmd+Z |  | 1 | pass (e2e-md-song-arrange-rows) |
| p.53 | END mark | Song end | ✅ | END cell |  | 1 | pass (md-song-workspace) |
| p.54 | Row offset and length (OF LEN) | Part of a pattern | ✅ | Song > More > Start, Length |  | 1 | pass (md-song-workspace) |
| p.54 | Song loop (count, infinite, nested) | LOOP | ✅ | Add loop; Times; Forever |  | 1 | pass (md-song-loop) |
| p.55 | Song jump | JUMP | ✅ | Command: Jump |  | 1 | pass (md-song-workspace) |
| p.55 | Song halt | HALT | ✅ | Command: Halt |  | 1 | pass (md-song-workspace) |
| p.55 | Song mute per row | MUT | ✅ | Song > More > Mutes |  | 1 | pass (md-song-loop) |
| p.56 | Save song, choose slot, name it | SAVE SONG | ✅ | Songs column: Save (SAVE SONG 0x6D), Save to… with a name, Rename (F2) | Edits are still written into the slot at once; Save is the machine's SAVE SONG. A name has 16 characters. | 1 | pass (e2e-md-song-slots) |
| p.56 | Copy, paste, clear, undo of song slots | Song library | ✅ | Songs column: Copy, Paste, Clear, drag a slot onto another; Cmd+Z | Library slot ops songCopy, songPaste, songCopyTo, songClear, songRename; asks before writing over a song. | 1 | pass (e2e-md-song-slots) |
| p.52 | Song position pointer from MIDI | SPP | ➖ |  | Firmware follows host. | – | n/a |
| p.52 | Song bar counter | Header counter | ✅ | Song: rows, bars, time | Estimate. | 1 | pass (md-song-workspace) |

## 10. Global settings (pp.57-78)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| p.57 | 8 global slots | Switch set-up | ✅ | GLOBAL page (the GLOBAL key in the top bar, or GLOBAL… in the engine menu): slot keys 1-8; Copy · Paste · Clear of the active slot | Page shared with the Monomachine Editor (skins/shared/deskGlobal.js). Copy and Paste are the editor's (the machine's menu has none); Clear is the factory global. | 2 | pass (e2e-md-global-page) |
| p.57 | Turbo menu (speed negotiation) | TurboMIDI | ➖ |  | Emulator and wire use their own pacing. | – | n/a |
| p.59 | Base channel (1-4 ... 13-16, OFF) | MIDI channels | ✅ | GLOBAL > Control |  | 2 | pass (e2e-md-global-reset) |
| p.59 | Map editor: group TRACK | Note to track | ✅ | GLOBAL > Map editor, 16 track keys; a mapped note from a MIDI keyboard lights its track on the rail and on Mix |  | 2 | pass (md-map-editor) |
| p.59 | Map editor: group PAT A-H | Note to pattern | ✅ | GLOBAL > Map a note |  | 1 | pass (e2e-md-global-map-note) |
| p.60 | Map editor: group CTRL (start, stop) | Note to transport | ✅ | GLOBAL > Map a note |  | 1 | pass (e2e-md-global-map-note) |
| p.60 | Map editor: TRIG GATE / START / QUE | Pattern trig mode | ✅ | GLOBAL > Pattern trig |  | 1 | pass (e2e-md-global-channel-trig-slot) |
| p.60 | Assign a note by playing it on a keyboard | MIDI learn of notes | ✅ | GLOBAL > Map editor: the LEARN dot on a track's key, then play the note on a MIDI keyboard | Any channel; the note comes in through the plug-in's MIDI in (the host's or a port: the midiIn message). | 1 | pass (e2e-md-global-learn) |
| p.60 | Local control | LOCAL CTRL | ✅ | GLOBAL > Control | Marked 'not verified' in emulator. | 1 | pass (md-global-panel) |
| p.61 | Program change OFF / IN / OUT | PRG CHANGE | ✅ | GLOBAL > Prg change in / out |  | 1 | pass (md-global-panel) |
| p.61 | Program change channel | Channel | ✅ | GLOBAL > Prg channel |  | 1 | pass (e2e-md-global-channel-trig-slot) |
| p.61 | Encoder resolution 24 / 32 (MKII) | MECH SETTINGS | ➖ |  | No knobs. | – | n/a |
| p.62 | Output routing, tracks to A-F or MAIN | OUTPUT | ✅ | GLOBAL > Routing; Mix OUT key |  | 2 | pass (e2e-md-mix-out-route) |
| p.63 | Trig in A/B: GATE, SENS, VMIN, VMAX, DEST | External pads | ✅ | GLOBAL > Trig in A / B: Gate, Sens, Vmin, Vmax and Dest of each input (− / +, Shift: 10) | The bytes measured (P3). The emulator has no trig inputs, so what the values do to a pulse is not verified there. | 1 | pass (e2e-md-global-trig-in) |
| p.64 | Sysex send all data | Backup | ✅ | Engine menu: EXPORT SYSEX…, All ticked (the default): every kit, pattern, song and global the editor holds as one .syx |  | 1 | stub-only |
| p.66 | Global sysex send (all or one slot) | Send globals | ✅ | Export SysEx…: untick All, tick Globals, set the range G1 to G8 (one slot or all) |  | 1 | stub-only |
| p.66 | Song + pattern (+ kit) sysex send, range | Send songs | ✅ | Export SysEx…: untick All, tick Songs (and Patterns, Kits), each with its own range | The kinds are chosen one by one: a song range does not add its patterns by itself. | 1 | stub-only |
| p.66 | Pattern (+ kit) sysex send, range | Send patterns | ✅ | Export SysEx…: untick All, tick Patterns (and Kits), each with its own range |  | 1 | stub-only |
| p.66 | Kit sysex send, range | Send kits | ✅ | Export SysEx…: untick All, tick Kits, set the range |  | 1 | stub-only |
| p.67 | General sysex receive (any time) | Import | ✅ | Engine menu: IMPORT SYSEX… / drop a .syx: preview by kind and slot, then report |  | 3 | pass (e2e-md-lib-syx-import) |
| p.68 | Original place receive (ORIG) | Same slot | ✅ | Import SysEx | Default. | 1 | stub-only |
| p.68 | Specific place receive (SPEC) | Relocate | ✅ | Import SysEx: PLACE row, Specific place, the first slot per kind; the grid shows where each item lands; Import asks before it lands on a slot that holds data | Each kind has its own first slot; items keep their order and gaps. | 1 | pass (e2e-md-lib-syx-place) |
| p.69 | Sysex verify (VERF) | Check without writing | ✅ | Import SysEx: Verify only beside Import: nothing is written, each slot is read and compared (= the same, ≠ different, ? no answer) | Works with Specific place too. | 2 | pass (e2e-md-lib-syx-verify) |
| p.75 | Tempo in INTERNAL / EXTERNAL | Sync | ✅ | GLOBAL > Sync |  | 1 | pass (md-global-panel) |
| p.76 | Control in ON / OFF (start, stop, continue) | CTRL IN | ✅ | GLOBAL > Sync |  | 1 | pass (md-global-panel) |
| p.77 | Tempo out (send clock) | TEMPO OUT | ✅ | GLOBAL > Sync |  | 2 | pass (e2e-md-global-tempo-out) |
| p.78 | Control out (send start/stop) | CTRL OUT | ✅ | GLOBAL > Sync |  | 1 | pass (md-global-panel) |

## 11. Sample manager, UW only (pp.70-75)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| p.70 | Receive samples by MIDI SDS (closed / open loop) | Sample dump in | 🟡 | Sampler: Load sample..., drag WAV/AIFF into a ROM slot | Files, not SDS from another tool; converted to mono 16-bit. | – | n/a |
| p.72 | General sample receive (any time) | Receive | ➖ |  | Files only. | – | n/a |
| p.73 | Specific place receive (choose slot) | Slot | ✅ | Sampler: select ROM slot, Load... |  | 1 | pass (e2e-md-drop-sample) |
| p.74 | Original place receive (several files in order) | ORG | ✅ | Drop several files; they fill slots after the first |  | – | missing |
| p.74 | Send samples to a computer (one, ALL, RAM) | SEND | ❌ | Disabled with reason | Machine ignores dump requests. | – | n/a |
| p.75 | Erase one / all samples | ERASE | ❌ | None |  | – | n/a |
| p.71 | Preview a sample | FUNCTION + ENTER | ✅ | Sampler: audition button | Plays on plug-in output. | 1 | pass (e2e-md-sampler-audition) |
| p.71 | Slot list with sizes, memory left | POS/SIZE | 🟡 | Sampler: 48 ROM tiles with waveform and length; MEM on LCD | Memory is slot count, not DSP percent. | 1 | n/a |
| p.71 | Sample names / rename | Name slot | ✅ | Sampler: Rename (0x73, then the slot's sample again by SDS) | The firmware renames a sample only when it receives it, so Rename sends the name and the slot's own sample again; it needs the slot's audio (the emulated machine). A real machine cannot send it back: the key is off with the reason. | 1 | pass (e2e-md-sampler-rename) |
| p.71 | Copy / clear / paste / undo in sample manager | Slot clipboard | ❌ | None |  | – | n/a |
| p.71 | RAM to ROM copy | Keep a take | ❌ | Disabled with reason | The firmware supports it; only a real machine's panel (HW MIDI engine) can do it today. | – | n/a |
| p.70 | Sample limits (4-48 kHz, mono, 12-bit playback) | Rules | ✅ | Plug-in converts on load |  | – | missing |
| p.71 | ROM vs RAM machines | Concept | ✅ | Sampler workspace |  | 1 | pass (md-sampler-workspace) |

## 12. Early start-up menu (pp.79-81)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| p.79 | Test mode | Self test | ➖ |  |  | – | n/a |
| p.79 | Empty reset | Clear all | ✅ | Engine menu: Reset machine… > Empty reset… (asked twice): every kit, pattern and song cleared, read back and reported in the SysEx panel | Globals and samples stay: a global is reset in its slot in GLOBAL. | 1 | pass (e2e-md-engine-reset-empty) |
| p.79 | Factory reset | Presets | ✅ | Engine menu: Reset machine… > Factory reset… (asked twice): a second machine started from your ROM gives the factory kits, patterns and songs; sent, read back and reported | Seconds to prepare, minutes to send and read back. Globals and samples stay. Reset machine… > Start from factory memory… is the other way: the whole machine restarts from factory memory in seconds (globals and samples too) and the saved machine memory goes (I-024). | 1 | pass (e2e-md-engine-reset-factory) |
| p.79 | Soft reset | Reload samples | ❌ | None | Restart the editor. | – | n/a |
| p.79 | MIDI upgrade / send upgrade | OS update | ➖ |  | Firmware fixed to OS 1.63. | – | n/a |

## 13. Technical information, MKI vs MKII (pp.82-83)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| p.82 | Specifications (16 tracks, 128 patterns, 32 songs, 64 locks, 384 CC) | Limits | ✅ | All enforced in the page |  | 1 | pass (e2e-md-limits) |
| p.83 | Pattern length 64 (MKII) / 32 (MKI) | Length | 🟡 | MKII lengths | MKI model not offered. | – | n/a |
| p.83 | MKI/MKII sample slots (32/48), RAM machines (2/4) | UW size | 🟡 | 48 ROM, 4 RAM | MKII only. | – | n/a |
| p.83 | MKI / MKII panel colour | Look | ✅ | Top bar plate key | Colour only. | 1 | pass (e2e-md-top-plate) |

## 14. Appendix A: machine reference (pp.A-1 to A-16)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| p.A-1 | TRX-BD Bass drum | PTCH DEC RAMP RDEC STRT NOIS HARM CLIP | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-1 | TRX-B2 Bass drum 2 | PTCH DEC RAMP HOLD TICK NOIS DIRT DIST | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-1 | TRX-SD Snare | PTCH DEC BUMP BENV SNAP TONE TUNE CLIP | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-1 | TRX-XT Tom | PTCH DEC RAMP RDEC DAMP DIST DTYP | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-1 | TRX-CP Clap | CLPY TONE HARD RICH RATE ROOM RSIZ RTUN | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-1 | TRX-RS Rim shot | PTCH DEC DIST | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-1 | TRX-CB Cow bell | PTCH DEC ENH DAMP TONE BUMP | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-1 | TRX-CH Closed hi-hat | GAP DEC HPF LPF MTAL | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-1 | TRX-OH Open hi-hat | GAP DEC HPF LPF MTAL | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-1 | TRX-CY Cymbal | RICH DEC TOP TTUN SIZE PEAK | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-1 | TRX-MA Maracas | ATT SUS REV DAMP RATL RTYP TONE HARD | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-1 | TRX-CL Claves | PTCH DEC DUAL ENH TUNE CLIC | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-1 | TRX-XC Congas | PTCH DEC RAMP RDEC DAMP DIST DTYP | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-4 | EFM-BD Bass drum | PTCH DEC RAMP RDEC MOD MFRQ MDEC MFB | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-4 | EFM-SD Snare | PTCH DEC NOISE NDEC MOD MFRQ MDEC HPF | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-4 | EFM-XT Tom | PTCH DEC RAMP RDEC MOD MFRQ MDEC CLIC | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-4 | EFM-CP Clap | PTCH DEC CLPS CDEC MOD MFRQ MDEC HPF | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-4 | EFM-RS Rim shot | PTCH DEC MOD HPF SNAR SPTC SDEC SMOD | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-4 | EFM-CB Cow bell | PTCH DEC SNAP FB MOD MFRQ MDEC | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-4 | EFM-HH Hi-hat | PTCH DEC TREM TFRQ MOD MFRQ MDEC FB | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-4 | EFM-CY Cymbal | PTCH DEC FB HPF MOD MFRQ MDEC | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-6 | E12-BD Bass drum | PTCH DEC SNAP SPLEN START RTRG RTIM BEND | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-6 | E12-SD Snare | PTCH DEC HP RING STRT RTRG RTIM BEND | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-6 | E12-HT High tom | PTCH DEC HP HPQ STRT RTRG RTIM BEND | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-6 | E12-LT Low tom | PTCH DEC HP HPQ STRT RTRG RTIM BEND | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-6 | E12-CP Clap | PTCH DEC HP HPQ STRT RTRG RTIM BEND | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-6 | E12-RS Rim shot | PTCH DEC HP RRTL STRT RTRG RTIM BEND | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-6 | E12-CB Cow bell | PTCH DEC HP HPQ STRT RTRG RTIM BEND | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-6 | E12-CH Closed hi-hat | PTCH DEC HP HPQ STRT RTRG RTIM BEND | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-6 | E12-OH Open hi-hat | PTCH DEC HP STOP STRT RTRG RTIM BEND | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-6 | E12-RC Ride | PTCH DEC HP BELL STRT RTRG RTIM BEND | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-6 | E12-CC Crash | PTCH DEC HP HPQ STRT RTRG RTIM BEND | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-6 | E12-BR Brushed snare | PTCH DEC HP REAL STRT RTRG RTIM BEND | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-6 | E12-TA Tambourine | PTCH DEC HP HPQ STRT RTRG RTIM BEND | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-6 | E12-TR Triangle | PTCH DEC HP HPQ STRT RTRG RTIM BEND | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-6 | E12-SH Shaker | PTCH DEC HP SLEW STRT RTRG RTIM BEND | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-6 | E12-BC Bongo conga | PTCH DEC HP BC STRT RTRG RTIM BEND | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-9 | P-I-BD Bass drum | PTCH DEC HARD HAMR TENS DAMP | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-9 | P-I-SD Snare | PTCH DEC HARD TENS RVOL RDEC RING | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-9 | P-I-MT Tom (PI-XT) | PTCH DEC HARD HAMR TUNE DAMP SIZE POS | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-9 | P-I-ML Metallica | PTCH DEC HARD TENS | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-9 | P-I-MA Maracas | DEC GRNS GLEN SIZE HARD | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-9 | P-I-RS Rim shot | PTCH DEC HARD RING RVOL RDEC | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-9 | P-I-HH Hi-hat | PTCH DEC CLSN RING AG AU BR CLOS | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-9 | P-I-RC Ride | PTCH DEC HARD RING AG AU BR GRAB | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-9 | P-I-CC Crash | PTCH DEC HARD RING AG AU BR GRAB | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-11 | GND-SIN Sinus | PTCH DEC RAMP RDEC | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-11 | GND-NS Noise | DEC | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-11 | GND-IM Impulse | UP UVAL DOWN DVAL | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-11 | GND-EMPTY Empty machine | none | ✅ | Machine picker | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-11 | INP-GA/GB Input gate A/B | VOL GATE ATCK HLD DEC | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-11 | INP-FA/FB Input filter follower A/B | ALEV GATE FATK FHLD FDEC FDPH FFRQ FQ | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-11 | INP-EA/EB Input envelope A/B | AVOL AHLD ADEC FQ FDPH FHLD FDEC FFRQ | ✅ | Sound: group screens and boxes | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-12 | MID-01 to MID-16 MIDI machines (synth, effect and routing pages) | NOTE N2 N3 LEN VEL PB MW AT; CC1-5 D/V; PCHG; LFO | ✅ | Sound: knob boxes (no picture); routing and effects pages as groups | Machine reference lists no extra gaps. | 1 | pass (md-sound-groups) |
| p.A-12 | CTR-AL Control all | 8 params + TFX + routing pages for all tracks | ✅ | Sound: knob boxes (no picture); routing and effects pages as groups | Machine reference lists no extra gaps. | 1 | pass (md-sound-groups) |
| p.A-12 | CTR-8P Control 8 parameters | P1-P8; TRK/PAR shortcuts | ✅ | Sound: knob boxes (no picture); routing and effects pages as groups | Machine reference lists no extra gaps. | 1 | pass (md-sound-groups) |
| p.A-12 | CTR-RE Control Rhythm Echo | TIME MOD MFRQ FB FILTF FILTW MONO LEV | ✅ | Sound: group screens and boxes | Machine reference lists no extra gaps. | 1 | pass (md-sound-groups) |
| p.A-12 | CTR-GB Control Gate Box | DVOL PRED DEC DAMP HP LP GATE LEV | ✅ | Sound: group screens and boxes | Machine reference lists no extra gaps. | 1 | pass (md-sound-groups) |
| p.A-12 | CTR-EQ Control Master EQ | LF LG HF HG PF PG PQ GAIN | ✅ | Sound: group screens and boxes | Machine reference lists no extra gaps. | 1 | pass (md-sound-groups) |
| p.A-12 | CTR-DX Control Dynamix | ATCK REL TRHD RTIO KNEE HP OUTG MIX | ✅ | Sound: group screens and boxes | Machine reference lists no extra gaps. | 1 | pass (md-sound-groups) |
| p.A-15 | ROM-1 to ROM-24 ROM sample player | PTCH DEC HOLD BRR STRT END RTRG RTIM | ✅ | Sound: sample screen with STRT/END; Sampler tiles | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-15 | ROM-25 to ROM-48 ROM loop player (linear STRT, END) | PTCH DEC HOLD BRR STRT END RTRG RTIM | ✅ | Sound: sample screen with STRT/END; Sampler tiles | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-15 | RAM-R1 to R4 RAM record | MLEV MBAL ILEV IBAL CUE1 CUE2 LEN RATE | ✅ | Sound + Sampler: Set up sampling, recorder editor | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (e2e-md-sampler-setup-undo) |
| p.A-15 | RAM-P1 to P4 RAM play | as ROM-25 to 48 | ✅ | Sound: sample screen with STRT/END; Sampler tiles | Group table in mdDeskSoundGroups.js; each knob is in one group. | 1 | pass (md-sound-groups) |
| p.A-16 | RAM machines tutorial (record main out, play back) | Workflow | ✅ | Sampler: Set up sampling button, capture next loop | Page does steps 1-9. | 3 | pass (md-sampler-ram) |

## 15. Appendix B: MIDI control reference

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| p.B-1 | Default note map (tracks C2.., patterns E4..) | Defaults | ✅ | GLOBAL > Map editor | Set in the machine's global. | 1 | pass (md-map-editor) |
| p.B-1 | CC mapping, 4 channels from base, all parameters | Remote control | ✅ | Live edits go out as CCs; HW MIDI engine; Control (MIDI learn) | Control workspace hidden unless the plug-in enables it. | 1 | pass (e2e-md-sound-cc-channels) |
| p.B-1 | Level and mute CCs per track | CC 8-15 | ✅ | Mix: LEV sends the level CC; the mute keys use machine memory | The level CC measured (P9). | 1 | pass (e2e-md-mix-lev) |

## 16. Appendix C: sysex reference

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| p.C-1 | Kit dump 0x52 / request 0x53 | Kit transfer | ✅ | Kit library; whole page | Desk codec. | 1 | pass (e2e-md-lib-kit-copy-paste-undo) |
| p.C-1 | Set kit name 0x55 | Rename | ✅ | Kit library Rename |  | 1 | pass (e2e-md-lib-kit-name-save) |
| p.C-1 | Global dump 0x50 / request 0x51 | Global | ✅ | GLOBAL panel |  | 1 | pass (md-global-panel) |
| p.C-1 | Set active global 0x56 | Slot | ✅ | GLOBAL slot buttons |  | 1 | pass (e2e-md-global-channel-trig-slot) |
| p.C-2 | Load pattern 0x57; load kit 0x58; save kit 0x59 | Select/save | ✅ | Pattern chooser; Kit library |  | 3 | pass (e2e-md-lib-load-save-dialog) |
| p.C-2 | Set MIDI note mapping 0x5a | Map | ✅ | GLOBAL > Map editor | Via global dump. | 1 | pass (md-map-editor) |
| p.C-2 | Assign machine 0x5b | Machine | ✅ | Sound machine picker |  | 1 | pass (e2e-md-sound-machine-pick-undo) |
| p.C-2 | Set track routing 0x5c | Outputs | ✅ | Mix OUT; GLOBAL Routing |  | 1 | pass (e2e-md-mix-out-route) |
| p.C-2 | Echo / gate / EQ / dynamix params 0x5d-0x60 | Master FX | ✅ | Mix cards |  | 1 | pass (md-master-effects) |
| p.C-3 | Set tempo 0x61; set LFO 0x62 | Tempo, LFO | ✅ | LCD tempo; Sound LFO |  | 2 | pass (md-lfo) |
| p.C-3 | Reset MIDI note map 0x64 | Defaults | ✅ | GLOBAL > Map editor > Reset map (asked first; Undo) | Writes Elektron's map in a global dump: the map 0x64 leaves (mdDeskFirmwareTest factoryglobal checks both). | 1 | pass (e2e-md-global-learn) |
| p.C-3 | Trig group 0x65; mute group 0x66 | Relations | ✅ | Sound > Relations |  | 1 | pass (md-relations) |
| p.C-3 | Pattern dump 0x67 / request 0x68 | Pattern | ✅ | Whole page |  | 1 | pass (md-pattern-chooser) |
| p.C-3 | Song dump 0x69 / request 0x6a; load song 0x6c | Song | ✅ | Song page |  | 1 | pass (e2e-md-song-slots) |
| p.C-3 | Set receive position 0x6b | SPEC receive | ❌ | None | See §10. | – | n/a |
| p.C-3 | Save song 0x6d | Song save | ✅ | Songs column: Save | saveSong; edits are still written as dumps. | 1 | pass (e2e-md-song-slots) |
| p.C-3 | Status request / set / response 0x70-0x72 | Mode, slots | ✅ | PATTERN / SONG switch; MODE |  | 2 | pass (md-song-workspace) |
| p.C-4 | TurboMIDI speed messages 0x10-0x17 | Fast transfer | ➖ |  | Not needed. | – | n/a |

## 17. Beyond the hardware

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys | E2E |
|---|---|---|---|---|---|---|---|
| p. | What you save stays for every new session | The machine keeps its kits, patterns, songs, globals and samples when it is switched off. | ✅ | By itself (a session without a DAW project, and the standalone, start from the saved memory); engine menu: KEEP MEMORY; Reset machine… > Start from factory memory… | I-024, doc/modern-ux/DESIGN-machine-memory.md | 1 | pass (e2e-md-engine-memory) |
| p. | Factory songs play | The songs of factory memory are there and play: load one, SONG mode, PLAY. | ✅ | Song workspace: the song slots, Load; the arrangement follows the machine | e2e: every factory song | 2 | pass (md-real-song-playing) |
| p. | Factory patterns play | The patterns of factory memory are there and play: pick one on the LCD, PLAY. | ✅ | The pattern chooser on the LCD | e2e: patterns spread over all 128 | 2 | pass (md-real-pattern-playing) |
| p. | GEN rolls a rhythm | No such function: you set the hits by hand. The editor rolls a rhythm for you from a few settings. | ✅ | GEN bar on Sequence: Random, Defaults, Hits; R | One undo step | 4 | pass (e2e-md-gen-keys-r) |
| p. | MUTATE changes a sound | No such function. The editor nudges the sound of the tracks at random, within a scope and an amount. | ✅ | GEN bar on Sequence: MUTATE, scope chips, amount | One undo step | 2 | pass (e2e-md-gen-mutate-scope) |
| p. | Solo | Solo plays one track alone; the mutes you had come back when you let go. | ✅ | Mix: S on the strip; the rail | The machine has mute only | 2 | pass (e2e-md-mix-mute-solo) |
| p. | Undo and redo | No undo. Every edit of the editor can be taken back and done again, across kits, patterns and songs. | ✅ | UNDO and REDO in the top bar; Cmd+Z, Cmd+Shift+Z | The machine has no undo | 2 | pass (e2e-md-top-undo-redo) |
| p. | Typed values | Type a value into a knob instead of turning it. | ✅ | Cmd-click or Enter on a value box; the arrow keys step it | A list takes its names | 2 | pass (e2e-md-sound-type-value) |
| p. | The step menu | Right-click a step for accent or slide, copy, paste and fill. | ✅ | Right-click a step (MM: in the roll or a trig row) | Keyboard and mouse | 2 | pass (e2e-md-seq-step-menu) |
| p. | Select, copy and paste steps | Select steps with the mouse, copy, paste and clear them, to one track or several. | ✅ | Cmd-click, Cmd-drag, the top bar's Copy, Paste, Clr; Cmd+C, Cmd+V |  | 4 | pass (e2e-md-seq-select-copy-paste) |
| p. | Copy, Paste and Clear what | Choose what a copy, paste or clear takes: trigs, locks, the sound, the whole track. | ✅ | The what menu on Copy, Paste and Clear |  | 2 | pass (md-copy-what-menu) |
| p. | Drop a file on the window | Drop a SysEx file (or, on the Machinedrum, a sample) on the editor. | ✅ | The window itself | macOS | 2 | pass (e2e-md-drop-syx) |
| p. | SysEx import with a preview | Look inside a SysEx file before you send it: tick the kinds, choose where each goes, read the report. | ✅ | Engine menu: IMPORT SYSEX… |  | 5 | pass (e2e-md-lib-syx-import) |
| p. | Notes from a MIDI keyboard light the track | The track you play lights on the rail and in the mixer. | ✅ | Rail numbers, Mix LEDs |  | 1 | pass (e2e-md-sound-note-light) |
| p. | The CPU meter and the speed-ups | No such function. A meter shows how much of the audio time the emulation takes, with the speed-ups to switch. | ✅ | The CPU meter beside the version; Developer › Speed-ups |  | 2 | pass (e2e-md-top-cpu-meter) |
| p. | The output meter and volume | Two bars and a volume line at the end of the LCD. | ✅ | The LCD's right end |  | 1 | pass (e2e-md-lcd-volume) |
| p. | The editor's menu | A right-click menu for zoom, updates and the developer switches. | ✅ | Right-click the header or the rail |  | 1 | pass (e2e-md-top-editor-menu) |
| p. | The keyboard view | The drawn keyboard, with each key's words and a search. | ✅ | The ? key in the top bar |  | 1 | pass (e2e-md-keys-help) |
| p. | The computer keyboard plays | The two rows of letter keys play the selected track. | ✅ | Letter keys on any workspace |  | 1 | pass (e2e-md-keys-play-notes) |
| p. | Tap tempo | Tap B (Shift+B on every workspace) to set the tempo. | ✅ | The B key |  | 3 | pass (e2e-md-keys-tap-tempo) |
| p. | Pattern queue and chooser | Pick any of the 128 patterns from the chooser; played while it runs, it waits for the end. | ✅ | The pattern on the LCD |  | 3 | pass (md-pattern-chooser) |
| p. | Kit and song slots | The kit library and the song slots: load, copy, paste, rename and clear a slot, each undoable. | ✅ | The kit on the LCD; Song workspace |  | 4 | pass (e2e-md-lib-kit-copy-paste-undo) |
| p. | What you draw is what plays | What you enter in the sequencer is what the machine plays. | ✅ | Sequence: the grid or the roll; Alt+Delete clears the pattern; Cmd+Z takes it back | e2e: drawn, played, cleared, undone, each checked on the machine's output | 1 | pass (md-real-sequence-drawn) |
| p. | Clear (was Revert track) | The machine has no key that puts one track's sound back as stored; LOAD KIT reloads the whole kit. | ✅ | Sound: Clear key at the right end of the MUTATE bar, next to R |  | 1 | pass (e2e-md-sound-revert-track) |

## Summary

| Status | Rows |
|---|---|
| ✅ Yes | 289 |
| 🟡 Partial | 9 |
| ❌ No | 6 |
| ➖ Not applicable | 16 |
| Total | 320 |

Of the 304 applicable rows, 289 are fully covered, 9 partly, 6 not at all.

### Top gaps (our UI), most important first

1. **Song slot management**: no save, rename, copy or clear of song slots; no way to move the song pointer or start from a row (§9).
2. **Sample manager**: no send, erase, RAM to ROM copy, or sample clipboard (§11). The first and last are blocked by the machine; erase and clipboard are not.
3. **Per-track LEVEL (LEV)**: the knob and its meter have no control; the command exists in the desk (§1, §2).
4. **Swing pattern and per-track swing**: only the amount is editable (§8).
5. **Sysex send and receive control**: export is all-or-nothing, no ranges; no specific-place receive; verify is not a dry run (§10). The note map can only be reset together with the rest of the global (§16).
6. **Machine preview before loading** in the picker (§2).
7. **Live-record erase of locks** (EXIT + knob; EXIT + TRIG is Delete held since 0.6) and the tempo helpers (delayed change, +/-10 % nudge) (§8).
8. **Trig in A/B pad settings** are shown but cannot be edited (§10).
9. **Accent / slide ALL vs per-track flag** cannot be changed, only honoured (§8).
10. **Pause, panic (double STOP), reset menu** (empty / factory / soft reset) (§1, §12).

Extras the manual does not have (not counted): GEN rhythm generators, MUTATE, solo, step selection with cut, duplicate and select all, the step menu with fill every 2nd / 4th, the keyboard view (?), GLOBAL Clear, undo/redo across edits, app modulators, MIDI learn, HW MIDI engine, waveform editors for ROM/RAM samples.
