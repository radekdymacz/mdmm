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

"Where" names the workspace (Sequence, Sound, Mix, Perform, Song; Control is hidden unless the plug-in enables MIDI mapping) or the header (LCD fields, kit library, pattern chooser, SysEx panel, AUDIO / MIDI panel). Every claim marked ✅ or 🟡 was checked in the page source (`doc/modern-ux/mm-mockup/src/*`, built into `skins/mmStudio/mmMockup.js`, plus `mmAdapter.js`) and the desk (`mmDesk/mmDeskModel.cpp` command table, `mmDeskEdit.cpp`, `mmDeskCommands.cpp`). The older `mm-manual-mapping.md` was design-time and is stale in places (chaining, rotate, tap tempo, live recording, the GLOBAL panel and step selection are now built). Since 0.5.0 the GLOBAL panel lives in `skins/shared/deskGlobal.js` with the Monomachine's cards in `mm-mockup/src/117-global.js`, step selection in `mm-mockup/src/77-select.js` with `skins/shared/deskSelect.js`, and the piano roll's lengths, Draw and box select in `58-roll.js` and `70-seq.js`.

Manual page numbers are the manual's own (1-xx, A-x, B-x, C-x).

## 1. Introduction, philosophy, highlights (1-1 to 1-3)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys |
|---|---|---|---|---|---|---|
| Conventions 1-1 | Key, knob, LED conventions | How the manual writes controls | ➖ | – | Documentation only | – |
| Highlights 1-2 | 6 track internal sequencer with synthesis | Six sequenced mono synth tracks | ✅ | Sequence, Sound | `mmDesk` kit + pattern documents | – |
| Highlights 1-2 | 6 track external MIDI sequencer | Six MIDI tracks per pattern | ✅ | Sequence, SYNTH / MIDI switch in the rail | Edits `p` tracks 6-11 | – |
| Highlights 1-2 | 5 Monosynths (SuperWave, SID, DigiPRO, FM+, VO) | Machine families | ✅ | Sound > machine picker | All 14 sound machines, see section 21 | 2 |
| Highlights 1-2 | Dynamically controlled stereo effects (FX machines) | Four FX machines plus reverb, chorus etc. | ✅ | Sound > machine picker, Mix > INPUT | See section 21 | – |
| Highlights 1-2 | 6 tape style tempo synced delays | One delay per track | ✅ | Sound > Effects (DTIM DSND DFB DBAS DWID) |  | – |
| Highlights 1-2 | 18 tempo synced LFOs | 3 per track | ✅ | Sound > LFO 1-3 |  | – |
| Highlights 1-2 | 12 arpeggiators | One per track, synth and MIDI | ✅ | Sequence dock > Arp |  | – |
| Highlights 1-2 | Full real-time control | Every DATA value live | ✅ | Every value box, drag or wheel | Sent as CC while dragging | – |
| Highlights 1-2 | DigiPRO user waveforms (MKII) | 64 user waveform slots | ❌ | – | The page can pick waveform 1-64 (WAV1, WAV2, WAVE) but cannot send, receive, rename or erase user waveforms. Measured (P4): a request (0x5E) returns a used waveform byte for byte; a dump (0x5D) is taken only on DIGIPRO MGR > RECEIVE. | – |
| +Drive 1-3 | Snapshots, Digibanks, 8192 waveforms | Optional storage drive | ➖ | – | Not emulated, see section 19 | – |

## 2. User interface and connectors (1-4 to 1-9)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys |
|---|---|---|---|---|---|---|
| Front panel 1-4 | 1 Master volume | Main and headphone level | ➖ | – | The app or DAW sets the level | – |
| Front panel 1-4 | 2 LCD graphical display | Shows tempo, level, 8 parameters, positions, kit, pattern, machine | 🟡 | Header LCD: tempo, position, pattern, kit, locks, line 2 | The firmware screen itself is not shown after start-up. Its content is spread over the page | – |
| Front panel 1-4 | 3 LEVEL knob | Track level (CC 7) | ✅ | Mix > LEVEL fader per track |  | 2 |
| Front panel 1-4 | 4 DATA ENTRY knobs A-H | Eight parameters of the page | ✅ | Every value box (drag, wheel, arrows, double click resets) |  | 2 |
| Front panel 1-4 | 4 Accelerated edit (press and turn) | Bigger steps | 🟡 | Shift = fine, Page Up / Down = x10 | Different gesture | – |
| Front panel 1-4 | 5 DATA PAGE keys, seven pages | SYN, AMP, FLT, EFX, LFO 1-3 | ✅ | Sound shows every page at once; lock lane page tabs |  | – |
| Front panel 1-4 | 5 Both DATA PAGE keys open MULTI ENV | Multi envelope window | ✅ | Perform > Multi envelope |  | – |
| Front panel 1-4 | 6 TRACK keys, select | Pick the track in focus | ✅ | Rail, Up / Down keys, Mix node click |  | 1 |
| Front panel 1-4 | 6 TRACK keys, mute / unmute (FUNCTION) | Mute a track | ✅ | M key per track, Perform > Mutes, key M | Shift + M prepares mutes | 6 |
| Front panel 1-4 | 6 TRACK LED colours | Active, muted, in focus | 🟡 | Rail row dims when muted, selected row lit |  | – |
| Front panel 1-4 | 7 TEMPO key, tempo window | Tempo screen | ✅ | LCD > TEMPO (drag, arrows) |  | 1 |
| Front panel 1-4 | 7 Tap tempo (FUNCTION + TEMPO) | Tap | ✅ | Shift + B on every workspace; plain B on the others than Sequence | On Sequence, B is the piano roll's Draw (`75-comforts.js`) | 2 |
| Front panel 1-4 | 8 FUNCTION key (secondary functions) | Modifier | ➖ | – | Replaced by Alt, Shift, Cmd and buttons | – |
| Front panel 1-4 | 9 KIT / SONG key | Kit menu or song menu | ✅ | LCD > KIT (kit library); Song workspace |  | 1 |
| Front panel 1-4 | 9 GLOBAL (FUNCTION + KIT / SONG) | Global menu | ✅ | GLOBAL key in the top bar, engine menu > GLOBAL…, link in the AUDIO / MIDI panel | 8 slots, Control, Sync, Routing; master tune is not on it (`deskGlobal.js`, `117-global.js`) | – |
| Front panel 1-5 | 10 TRIG keys as keyboard | Play notes | ✅ | Home-row keys A-L and W-P, on-screen keyboard (Perform), roll keys |  | 2 |
| Front panel 1-5 | 10 Velocity 80, or 127 with FUNCTION | Key velocity | ✅ | Keys C / V (20 40 60 80 100 127) |  | – |
| Front panel 1-5 | 10 TRIG keys edit notes in grid mode | Step trigs | ✅ | Roll click (Draw on), ENV dots, step menu |  | – |
| Front panel 1-5 | 10 BANK + TRIG selects pattern | Pattern pick | ✅ | LCD > PATTERN (‹ ›, chooser) |  | 1 |
| Front panel 1-5 | 11 PATTERN / SONG key | Sequencer mode | ✅ | LCD line 2 PLAY PAT / SONG, Song > What plays | `seqMode` op | 1 |
| Front panel 1-5 | 11 POLY (FUNCTION + PATTERN / SONG) | Poly mode | ✅ | Perform > Keyboard > Poly | `poly` op | 1 |
| Front panel 1-5 | 12 ENTER / YES, EXIT / NO | Confirm, cancel | ➖ | – | Page dialogs | – |
| Front panel 1-5 | 13 ARROW keys; octave for TRIG keys | Navigate; octave | ✅ | Keys Z / X octave; arrows step values |  | – |
| Front panel 1-5 | 14 BANK GROUP A-D / E-H | Bank group | ✅ | Pattern chooser shows all 8 banks |  | – |
| Front panel 1-5 | 14 MUTE MODE (FUNCTION + BANK GROUP) | Mute window | ✅ | Perform > Mutes |  | – |
| Front panel 1-5 | 15 BANK keys A-H | Pattern bank | ✅ | Pattern chooser |  | – |
| Front panel 1-5 | 15 BANK secondary: ARP, TRANSPOSE, SWING, SLIDE | Track settings windows | ✅ | Sequence dock > Arp, Transpose; Slide and Swing under the roll; LCD SWG |  | – |
| Front panel 1-5 | 16 REC key (grid recording) | Grid mode on / off | 🟡 | LCD record key | Stopped = grid record; the page's step editing does not need it | 1 |
| Front panel 1-5 | 16 PLAY (pause on second press) | Start, pause | 🟡 | LCD play key, Space | Toggle start / stop, no pause. Measured (P1, doc/modern-ux/PROBES-manual-gaps.md): MIDI Stop + Continue pauses and resumes when TRANSPORT IN is ACCEPT. | 2 |
| Front panel 1-5 | 16 STOP; STOP twice rewinds and silences | Stop, reset | 🟡 | Same key | One press only; no rewind or all-notes-off key | 2 |
| Front panel 1-5 | 16 REC + PLAY = live recording | Live recording | ✅ | Alt + Space, record key while playing | `record` op | 1 |
| Front panel 1-5 | 16 STOP + REC = step recording | Step recording | ❌ | – | Not in the page | – |
| Front panel 1-5 | 16 Secondary: COPY, PASTE, CLEAR | Copy / paste / clear | ✅ | LCD COPY / CLR / PASTE, Cmd+C / V, Delete | Scope depends on the workspace; on Sequence it is the selected steps, else the page shown (`130-main.js` secAction) | 4 |
| Front panel 1-5 | 17 SCALE key: page of 16 steps | Track page | ✅ | Sequence PAGE key and 4 page LEDs, keys [ ] |  | 1 |
| Front panel 1-5 | 17 SCALE SETUP (FUNCTION + SCALE) | Length and speed | ✅ | LCD line 2 LEN, SPD |  | – |
| Front panel 1-5 | 18 TRIG SELECT: AMP / FILTER / LFO / ALL | Trig track | ✅ | ENV row of A F L dots per trig | Different UI, same data | – |
| Front panel 1-5 | 18 MIDI SEQ mode (FUNCTION + TRIG SELECT) | Edit MIDI tracks | ✅ | SYNTH / MIDI switch |  | – |
| Keyboard SFX-6 1-6 | Joystick (real time) | Expression control | ✅ | Perform > Assign pad (springs back) | Mouse; pitch bend / CC 1 / CC 2 map | 1 |
| Keyboard SFX-6 1-6 | Keyboard | Real-time play and record | ✅ | Perform on-screen keyboard; home row |  | 2 |
| Keyboard SFX-6 1-6 | MULTI TRIG key | Toggle multi trig | ✅ | Perform > Multi trig |  | 1 |
| Keyboard SFX-6 1-6 | MULTI MAP (FUNCTION + MULTI TRIG) | Toggle multi map | ✅ | Perform > Multi map |  | 1 |
| Keyboard SFX-6 1-6 | OCTAVE keys | Keyboard octave | ✅ | Perform Octave stepper |  | – |
| Keyboard SFX-6 1-6 | KEYBOARD LEDs | Notes shown | ➖ | – | The roll shows pitches | – |
| Rear 1-7 | Power switch, power in, voltage selector, fuse | Power | ➖ | – |  | – |
| Rear 1-7 | MIDI Thru / Out / In | MIDI ports | 🟡 | AUDIO / MIDI panel (standalone): inputs, output, Bluetooth | In a DAW the host routes MIDI. Machine MIDI out reaches the host since 0.4.0. No MIDI THRU | – |
| Rear 1-7 | Audio inputs B / A | External audio into FX machines | 🟡 | Mix > IN select (INP A, B, AB) | Host audio goes to the input; the page chooses which input an FX machine reads | – |
| Rear 1-7 | Individual outputs F / E / D / C; main outputs B / A | Six outputs | 🟡 | Mix > OUT buses AB CD EF; routing mode | Extra pairs only in a multi-output VST3 host | – |
| Rear 1-7 | Headphones | Copy of AB | ➖ | – |  | – |
| Rack kit, connecting, care 1-8, 1-9 | Mounting, cabling, cleaning, battery | Hardware care | ➖ | – |  | – |

## 3. The LCD user interface (1-10)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys |
|---|---|---|---|---|---|---|
| LCD 1-10 | Tempo, "EXT" when synced | Tempo display | 🟡 | LCD TEMPO (marked when the DAW sets it) | "EXT" shown as host tempo | – |
| LCD 1-10 | Level bar | Track level | ✅ | Mix LEVEL fader |  | 1 |
| LCD 1-10 | Eight parameter circles with names | Data page | ✅ | Value boxes with names |  | – |
| LCD 1-10 | Four boxes: playback position | Position | ✅ | LCD POSITION, page LEDs, playhead |  | – |
| LCD 1-10 | Record / play / pause / stop symbols | Status | 🟡 | Record and play lamps | No pause state | – |
| LCD 1-10 | Kit name and number | Current kit | ✅ | LCD KIT (saved / edited) |  | – |
| LCD 1-10 | Pattern index A01-H16 | Current pattern | ✅ | LCD PATTERN |  | 1 |
| LCD 1-10 | Machine of the track in focus | Machine | ✅ | Rail, Sound header |  | – |
| Layer edit and windows 1-10 | Windows on top, keys still work below | Window behaviour | ➖ | – | Page dialogs | – |

## 4. Quick start (1-11 to 1-14)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys |
|---|---|---|---|---|---|---|
| Selecting and playing 1-11 | Select a pattern; kit loads with it | Pattern pick | ✅ | LCD ‹ ›, chooser | Asks before losing kit edits | 2 |
| Selecting and playing 1-11 | Pending pattern shown with arrow | Cued pattern | ✅ | Queued name blinks in the LCD |  | 1 |
| Selecting and playing 1-11 | Play, pause, stop | Transport | 🟡 | Play key | See section 2 | – |
| Playing in multi trig 1-12 | Play MULTI TRIG from a keyboard | Multi trig | ✅ | Perform > Multi trig; MIDI channel 7 |  | – |
| Exploring a pattern 1-12 | Try each track, tweak SYNTHESIS | Auditioning | ✅ | Sound; roll keys play the track |  | – |
| Grid recording 1-12 | Load kit for the pattern | LOAD KIT | ✅ | Kit library |  | 1 |
| Grid recording 1-12 | Add a note trig | Trig on | ✅ | Roll click |  | 4 |
| Grid recording 1-13 | Hold a trig, set pitch on the mini keyboard | Pitch of a trig | ✅ | Roll: click or drag for pitch |  | – |
| Grid recording 1-13 | NOTE OFF (FUNCTION + TRIG) | Note off trig | ✅ | Alt-click an empty step; drag a bar's end |  | 1 |
| Live recording 1-13 | Record notes in real time, quantised | Live record | ✅ | Alt + Space, record key | Quantising done by firmware | 1 |
| Live recording 1-13 | Erase with EXIT while notes sound | Live erase | ❌ | – | Not in the page | – |
| Parameter locks 1-13 | Lock a value on a step | P-lock | ✅ | Lock lane (draw bars), wheel on a step |  | 2 |
| Parameter locks 1-14 | Record locks live by turning a knob | Live lock | ✅ | Value boxes while live recording | The machine records; the page marks the step's cell and lock lane for about 3 s and says which value it locked (`70-seq.js` setRecLock) | – |
| Parameter locks 1-14 | Remove one lock; remove all locks of a trig | Clear locks | 🟡 | Lane: Alt-drag erases one parameter's steps; a selected step's Delete or step-menu Clear takes its note, slide and locks together | No key that drops a step's locks and keeps its note | 1 |

## 5. Monomachine overview (1-15, 1-16)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys |
|---|---|---|---|---|---|---|
| Six individual tracks 1-15 | Per track machine and effects | Multitimbral | ✅ | Sound, Mix |  | – |
| Six track sequencing 1-15 | Notes, envelope trigs, parameters | Sequencer | ✅ | Sequence |  | – |
| MIDI sequencing 1-15 | Six MIDI tracks | MIDI seq | ✅ | Sequence (MIDI side) |  | – |
| Poly mode 1-15 | One track with six voices | POLY | ✅ | Perform > Poly | Other tracks dimmed | 1 |
| Multi trig mode 1-15 | All tracks from one source | MULTI TRIG | ✅ | Perform |  | – |
| Multi map mode 1-15 | Keyboard triggers patterns | MULTI MAP | ✅ | Perform > Multi map |  | – |
| Figure 1 1-16 | Synthesis overview | Diagram | ➖ | – | The Mix page draws the routing graph | – |

## 6. Synthesis arrangement: kits and machines (1-17 to 1-25)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys |
|---|---|---|---|---|---|---|
| Arrangement 1-17 | Machines grouped in Mono-synths | Families | ✅ | Machine picker families |  | – |
| Arrangement 1-17 | Track effects per track (filter, EQ, SRR, distortion, delay) | Effects | ✅ | Sound AMP, FLT, EFX |  | – |
| Kits 1-18 | Kit holds machines, pages, LFOs, MIDI pages, routing, trig, multi env, name | Kit content | ✅ | Whole kit editable in the working kit | `WorkingKit` document | – |
| Link kits and patterns 1-18 | Pattern recalls its kit; same kit not reloaded | Link | ✅ | Pattern chooser shows kit per pattern | Dialog "Save kit, then switch" | – |
| Link kits and patterns 1-18 | Change which kit a pattern uses | Relink | 🟡 | Kit library LOAD relinks current pattern | No direct "set kit of pattern N" control | – |
| Loading a kit 1-19 | Kit list of 128, load | LOAD KIT | ✅ | Kit library |  | 1 |
| Loading a kit 1-19 | Star on kits with no pattern | Unlinked mark | ✅ | Star in kit slot |  | – |
| Loading an empty kit 1-19 | Six GND-SIN tracks | Empty kit | ✅ | Load an empty slot |  | – |
| Saving and naming 1-19 | SAVE KIT | Save | ✅ | Kit library Save, Save as |  | 1 |
| Saving and naming 1-20 | Name a kit (11 characters) | Rename | ✅ | Kit library Rename, F2 |  | 1 |
| Saving and naming 1-20 | "High score" character picker | Text entry | ➖ | – | Text field | – |
| Undo kit 1-20 | UNDO KIT keeps lost edits | Safety slot | 🟡 | Dialogs name it; page undo on top | Firmware keeps the slot; no control to open it | – |
| Copy kit 1-21 | Copy and paste kit slot | Kit copy | ✅ | Kit library Copy / Paste, drag a slot | Through SYSEX RECV | 1 |
| Clear kit 1-21 | Clear kit slot | Kit clear | ✅ | Kit library Clear |  | 1 |
| Assigning a machine 1-22 | SYNTH, MACHINE, MIX columns in EDIT KIT | Machine picker | ✅ | Sound > machine key |  | – |
| Assigning a machine 1-22 | "Keep effects" vs init pages | Init data | ✅ | "Keep track effects + LFOs" toggle | `machine` op | – |
| Copy machine 1-23 | Machine and settings to another track or kit | Copy machine | ✅ | Sound COPY / PASTE | `copySound` | 1 |
| Clear machine 1-24 | Back to GND-SIN | Clear machine | ✅ | Sound CLR |  | – |
| Setting the mix bus 1-24 | OUT BUS per track | Mix bus | ✅ | Mix > Out AB CD EF | A track can feed two | – |
| Parameter editing 1-25 | 7 pages of 8, 56 parameters | Edit | ✅ | Sound |  | – |
| Parameter editing 1-25 | TUNE on every synth machine | Fine tune | ✅ | SYN page TUNE (not on BeatBox) | Per the OS 1.32B screens | – |
| Parameter editing 1-25 | Kit changes are unsaved until SAVE | Dirty state | ✅ | KIT "edited / saved" |  | 1 |

## 7. Track effects (1-26 to 1-34)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys |
|---|---|---|---|---|---|---|
| Level 1-26 | LEV, not lockable | Track level | ✅ | Mix LEVEL |  | – |
| Amp envelope 1-26 | ATK | Attack | ✅ | Sound > Amp |  | – |
| Amp envelope 1-27 | HOLD | Hold | ✅ | Sound > Amp |  | – |
| Amp envelope 1-27 | DEC | Decay | ✅ | Sound > Amp |  | – |
| Amp envelope 1-27 | REL | Release | ✅ | Sound > Amp |  | – |
| Distortion 1-27 | DIST (headroom below 0) | Distortion | ✅ | Sound > Amp > Drive |  | – |
| Track volume 1-28 | VOL (lockable) | Volume | ✅ | Sound > Amp; Mix trim |  | – |
| Pan 1-29 | PAN | Stereo place | ✅ | Sound > Amp; Mix PAN |  | 1 |
| Portamento 1-29 | PORT | Glide time | ✅ | Sound > Amp > Glide; Sequence > Trig setup |  | – |
| Filter 1-30 | BASE | Filter base | ✅ | Sound > Filter |  | – |
| Filter 1-30 | WDTH | Filter width | ✅ | Sound > Filter |  | – |
| Filter 1-30 | HPQ | High pass Q | ✅ | Sound > Filter |  | – |
| Filter 1-30 | LPQ | Low pass Q | ✅ | Sound > Filter |  | – |
| Filter envelope 1-31 | ATK, DEC | Filter envelope | ✅ | Sound > Filter env |  | – |
| Filter envelope 1-31 | BOFS, WOFS | Envelope offsets | ✅ | Sound > Filter env |  | – |
| Filter tracking 1-31 | Filter follows pitch; switch off HPF / LPF | Key tracking | ✅ | Perform > Assign > KEY > HPF, LPF | `assign` op | – |
| EQ 1-32 | EQF, EQG | One band EQ | ✅ | Sound > Effects |  | – |
| Sample rate reduction 1-32 | SRR | Lo-fi | ✅ | Sound > Effects |  | – |
| Delay 1-33 | DSND (sign: stereo kept / ping-pong) | Delay send | ✅ | Sound > Effects; Mix trim |  | – |
| Delay 1-33 | DTIM (256th notes) | Delay time | ✅ | Sound > Effects |  | – |
| Delay 1-33 | DFB | Feedback | ✅ | Sound > Effects (warns above 64) |  | – |
| Delay 1-33 | DBAS, DWID | Feedback filter | ✅ | Sound > Effects |  | – |

## 8. Low frequency oscillators (1-35 to 1-37)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys |
|---|---|---|---|---|---|---|
| LFO 1-35 | PAGE and DEST (incl. PTCH, eight ranges, MIDI page, other LFOs) | Target | ✅ | Sound > LFO page and dest selects; drag the ~ handle onto a value |  | – |
| LFO 1-35 | TRIG: FREE, TRIG, HOLD, ONE, HALF | Trig mode | ✅ | LFO TRIG keys |  | – |
| LFO 1-35 | WAVE, 11 shapes | Waveform | ✅ | 11 shape keys |  | – |
| LFO 1-35 | MULT | Multiplier | ✅ | LFO MULT |  | – |
| LFO 1-36 | SPD | Speed | ✅ | LFO SPD |  | – |
| LFO 1-36 | INTL | Interlace | ✅ | LFO INTL |  | – |
| LFO 1-36 | DPTH | Depth | ✅ | LFO DPTH |  | – |
| LFO 1-37 | Two LFOs on one target add | Layering | ✅ | Any; badge ~n shows modulation |  | – |
| LFO 1-37 | LFO trigs sequenced separately | LFO trig | ✅ | ENV row L dot |  | – |
| LFO 1-35 | LFOs shared with the MIDI track of the same number | Shared | ✅ | MIDI page notes it; link to T LFOs |  | – |

## 9. Additional kit settings (1-38 to 1-44)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys |
|---|---|---|---|---|---|---|
| Assign 1-38 | Two rows of PAGE, DEST, ADD per source | Modulation assign | ✅ | Perform > Assign |  | 1 |
| Assign 1-39 | Joystick R / L with MIRR | Joystick | ✅ | Assign tab JOY RL, Mirror |  | – |
| Assign 1-39 | Joystick U, D tabs | Joystick | ✅ | Assign tabs JOY U, JOY D |  | – |
| Assign 1-39 | Velocity assign | Velocity | ✅ | Assign tab VEL | Sequencer plays velocity 100 | – |
| Assign 1-40 | Key tracking assign | Key | ✅ | Assign tab KEY |  | – |
| Assign 1-39 | Copy, clear, paste, undo assign | Assign clipboard | ✅ | Perform COPY / CLR / PASTE |  | – |
| Trig track settings 1-40 | TRIG POS (forward notes, chainable) | Trig position | ✅ | Sequence dock > Trig setup | Dotted cord on Mix graph | – |
| Trig track settings 1-41 | PORTAMENTO ALWAYS / ONLY LEGATO | Portamento mode | ✅ | Trig setup > Port |  | 1 |
| Trig track settings 1-41 | Legato trig modes AMP, FILTER, LFO | Legato | ✅ | Trig setup > Legato |  | – |
| Multi trig 1-41 | ALL TRK | All tracks play | ✅ | Perform > Multi trig |  | – |
| Multi trig 1-42 | SPLIT KEY: TRACK and KEY zones | Split | ✅ | Perform: split marker, "Upper from" |  | – |
| Multi trig 1-42 | SEQ START | Restart pattern per note | ✅ | Perform > Multi trig |  | – |
| Multi trig 1-43 | SEQ TRNSP | Transpose, loop unbroken | ✅ | Perform > Multi trig |  | – |
| Multi trig 1-43 | TIMING context tab | Delay to bar | ✅ | Perform Timing stepper |  | – |
| Multi trig 1-43 | Arpeggiators work in all-track mode | Arp | ✅ | Per track arp | Firmware | – |
| Multi env 1-43 | ATK, DEC, SUS, REL | ADSR on top | ✅ | Perform > Multi envelope |  | 2 |
| Multi env 1-44 | PORT | Multi portamento | ✅ | Same |  | – |

## 10. The pattern sequencer: pattern operation (1-45 to 1-47)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys |
|---|---|---|---|---|---|---|
| Pattern selection 1-45 | 8 banks x 16, A01-H16 | Pattern select | ✅ | Pattern chooser |  | 1 |
| Pattern selection 1-45 | Red LEDs show patterns with data | Used mark | ✅ | Chooser slot shows length or empty |  | – |
| Pattern selection 1-45 | Switch waits for pattern end | Cued switch | ✅ | Queue; Shift-click or "Now" switches at once | "Now" = STOP, LOAD, PLAY | 1 |
| Pattern chaining 1-46 | Chain patterns of one bank, each once | Chain | ✅ | Song > Patterns > Chain | `chain` op; STOP resets, pick ends the chain | 1 |
| Scale setup 1-46 | Total steps up to 64 | Length | ✅ | LCD LEN (2-64), x2 key |  | 1 |
| Scale setup 1-46 | Scale length in pages | Pages | ✅ | PAGE key, LEDs |  | 1 |
| Scale setup 1-47 | Tempo multiplier 1X, 2X, 3/4X, 3/2X | Speed | ✅ | LCD SPD |  | – |
| Scale setup 1-47 | Lower pages auto-copied when lengthened | Page copy | ✅ | Firmware; x2 key copies the first half |  | – |
| Scale setup 1-47 | Song rows override length | Row length | ✅ | Song > Part |  | – |
| Recording preparations 1-47 | Select kit, track, trig tracks all lit | Setup | ✅ | Implicit in the page |  | – |

## 11. Composing a pattern (1-47 to 1-55)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys |
|---|---|---|---|---|---|---|
| Grid recording 1-47 | Trig on / off | Step trig | ✅ | Roll click |  | 2 |
| Grid recording 1-48 | Pitch of a trig | Note | ✅ | Roll vertical position |  | – |
| Grid recording 1-48 | Octave shift (FUNCTION + arrows) | Octave | ✅ | Roll drag; wheel + Shift = octave |  | – |
| Grid recording 1-48 | NOTE OFF trig | Note off | ✅ | Alt-click; drag bar end |  | 1 |
| Grid recording 1-48 | Chords | Chord | ✅ | Shift-click in the roll | Same-length notes on MIDI tracks | – |
| Grid recording 1-49 | Rotate trigs and locks (FUNCTION + arrows) | Rotate | ✅ | Alt + Left / Right | `rotate` op | 2 |
| Grid recording 1-49 | Copy / clear / paste act on the track in grid mode | Scope | ✅ | LCD COPY / CLR / PASTE | Page shown of the selected track | 1 |
| Live recording 1-49 | Record played notes, quantised | Live | ✅ | Alt + Space |  | 1 |
| Live recording 1-49 | Chords recorded | Live chords | 🟡 | Played one key at a time | Chords are drawn with Shift-click in the roll | – |
| Live recording 1-49 | Erase with EXIT | Live erase | ❌ | – |  | – |
| Step recording 1-50 | Step-by-step input | Step rec | ❌ | – | Roll painting is the page's way | – |
| Note copy 1-50 | Copy one trig with locks to another step | Note copy | ✅ | Sequence: Cmd-click a step (Ctrl on Windows and Linux), Cmd+C, select the target, Cmd+V; Cmd-drag drops a copy; Cmd+D duplicates | Notes, NOTE OFFs, envelope trigs, slides and locks go along (`77-select.js`, `copySteps`) | 5 |
| Clear note parameter locks 1-50 | Clear locks of one note, undoable | Clear locks | 🟡 | Lane Alt-drag per parameter; Alt + lane clear for a track; a selected step's Delete clears the step whole | No key for the locks of one step alone | – |
| Track page copy 1-51 | Copy a page to another page | Page copy | ✅ | LCD COPY on the page shown (no step selected), PASTE on another page; or select the steps | Steps, slides and locks (`130-main.js` secAction) | – |
| Clear track page 1-51 | Clear a page | Page clear | ✅ | CLR with a page shown |  | 1 |
| Track copy 1-52 | Track data to another track incl. machine, arp, transpose, swing, slide | Track copy | 🟡 | Select a track's steps (drag the step ruler), Cmd+C, Cmd+V on another track; Cmd+A takes all six; machine through Sound COPY; Shift-click track headers marks tracks to paste into | Steps, slides and locks, not machine in the same copy, and not arp / transpose / swing | – |
| Clear track 1-53 | Clear a track | Track clear | 🟡 | Select the track's steps with the ruler and Delete; Alt + lane clear for locks | No single clear-this-track key; the LCD CLR clears the page shown | – |
| Pattern copy 1-53 | Whole pattern incl. kit link and MIDI tracks | Pattern copy | ✅ | Pattern chooser Copy / Paste, drag a slot |  | – |
| Clear pattern 1-54 | Clear all, keep kit link | Pattern clear | ✅ | Alt + CLR, chooser Clear | Keeps the kit link | 2 |
| Super copy 1-54 | Choose what to copy (melody, machine) | Super copy | ❌ | – | A step selection copies a block of tracks and steps, but not a chosen part of them (no melody-only copy) | – |
| Super clear 1-55 | Choose what to clear | Super clear | ❌ | – | Separate clears exist (steps, locks, pattern, machine) | – |

## 12. Tempo (1-55 to 1-57)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys |
|---|---|---|---|---|---|---|
| Tempo 1-55 | Global tempo, not stored in patterns | Global tempo | ✅ | LCD TEMPO |  | 1 |
| Tempo screen 1-56 | Integer and decimal tempo | Edit tempo | ✅ | Drag, arrows, Shift = 0.1 | 30-300 BPM | – |
| Tempo screen 1-56 | Delay change until FUNCTION released | Delayed change | ❌ | – |  | – |
| Tempo screen 1-56 | Temporary +/-10 % shift | Nudge | ❌ | – |  | – |
| Tap tempo 1-56 | Average of taps | Tap | ✅ | Shift + B everywhere; B off Sequence | The last five taps are averaged; a pause of 2 s starts over | 2 |
| External synchronisation 1-56 | Internal or external MIDI clock; EXT shown | Sync | ✅ | GLOBAL > Sync > Tempo in (INT / EXT); in a DAW the machine follows the host automatically (`followHost`) | See Control In | – |
| Tempo 1-57 | Songs store tempo changes | Song tempo | ✅ | Song row Tempo |  | – |

## 13. Parameter locks (1-57, 1-58)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys |
|---|---|---|---|---|---|---|
| Locks in grid mode 1-57 | Hold a trig, turn a knob | Lock | ✅ | Lane: draw; wheel; ramp with Shift |  | 1 |
| Locks in grid mode 1-57 | Click a knob to lock its current value | Lock to current | 🟡 | Lane draw sets any value | No "lock current" click | – |
| Locks in grid mode 1-57 | View locks of a step | View | ✅ | Lane shows bars per parameter |  | 1 |
| Locks in grid mode 1-57 | Remove one / all locks of a step | Remove | 🟡 | See section 4 and section 11 |  | – |
| Locks in grid mode 1-57 | Note copy and paste | Note copy | ✅ | See section 11 | Locks travel with the copied step | – |
| Locks 1-58 | 62 locked parameters per pattern, pooled | Lock budget | ✅ | LCD LOCKS nn/62; lane budget | Blocks a 63rd | – |
| Locks 1-58 | Parameter locked once can hold a value on every step | Lane | ✅ | Lock lane |  | – |
| Locks in live recording 1-58 | Locks recorded while turning knobs | Live locks | ✅ | Value boxes; the step and lane are marked | The machine records; see section 4 | – |
| Locks in live recording 1-58 | Edit afterwards in grid mode | Fine tune | ✅ | Lock lane |  | – |

## 14. Advanced sequencer control (1-58 to 1-60)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys |
|---|---|---|---|---|---|---|
| Trig tracks 1-58 | AMP, FILTER, LFO sub tracks | Split trigs | ✅ | ENV row dots |  | – |
| Trig tracks 1-59 | ALL mode adds a pitch by default | All trig | ✅ | Click in the roll |  | – |
| Trig tracks 1-59 | AMP only, FILTER only, LFO only | Single trig | ✅ | Toggle single dots |  | – |
| Trig tracks 1-59 | LED colours green, red, yellow | State | 🟡 | Dot colours red / yellow / green in the ENV row |  | – |
| Trigless trigs 1-59 | Trig with no envelopes, for pitch or locks | Trigless | ✅ | All three dots off; roll shows outlined bar |  | – |
| Pitchless trigs 1-59 | Trig without own pitch (EXIT) | Pitchless | ✅ | ENV row on a step with no pitch; dashed bar |  | – |

## 15. Additional sequencer features (1-61 to 1-69)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys |
|---|---|---|---|---|---|---|
| Arpeggiator 1-61 | 12 arpeggiators, one per track | Arp | ✅ | Sequence dock > Arp, any of 12 tracks |  | 1 |
| Arpeggiator 1-61 | SPD (6 = 16th) | Speed | ✅ | Arp SPD |  | – |
| Arpeggiator 1-61 | MODE OFF, KEY, SID, ADD | Mode | ✅ | Arp Mode keys |  | 1 |
| Arpeggiator 1-62 | PLAY TRUE, UP, DOWN, CYCLE, RND | Direction | ✅ | Arp Play keys |  | – |
| Arpeggiator 1-62 | RNGE | Octave range | ✅ | Arp RNGE |  | 1 |
| Arpeggiator 1-62 | OJMP | Octave jump | ✅ | Arp OJMP | Low bit / upper bits split, see mapping note 6 | – |
| Arpeggiator 1-62 | Copy, clear, paste, undo arp | Arp clipboard | ❌ | – | Page undo only | – |
| Arp envelope switches 1-62 | AMP, FLT, LFO trigging (not on MIDI) | Arp trigs | ✅ | Arp Trig keys | Disabled on MIDI tracks | – |
| Arp rhythm and offset 1-63 | Up to 16 steps, on / off | Rhythm | ✅ | 16-cell strip: click mutes |  | – |
| Arp rhythm and offset 1-63 | Note offset per step | Offset | ✅ | Drag a cell up / down (+/-24) |  | – |
| Arp rhythm and offset 1-63 | Length by LEVEL | Length | ✅ | Click past the end, or the LEN row |  | – |
| Transpose 1-63 | Per track, live, pattern data untouched | Track transpose | ✅ | Dock > Transpose > TRACK |  | 2 |
| Transpose 1-64 | PAT, shared by all tracks | Pattern transpose | ✅ | Transpose > PAT; LCD |  | – |
| Transpose 1-64 | SCALE ---, FIX, MAJ, MIN | Scale | ✅ | Transpose Scale keys |  | – |
| Transpose 1-64 | KEY for MAJ / MIN | Key | ✅ | Click the keyboard picture |  | – |
| Swing 1-64 | Amount 50-80 %, per pattern | Swing | ✅ | LCD SWG |  | – |
| Swing track 1-65 | Per-track swing steps, default every second 16th | Swing track | ✅ | Sequence: Swing under the roll, then click or drag the step columns; marks along the roll's foot | Drag paints, one undo step | 1 |
| Swing 1-65 | Copy, clear, paste, undo swing track | Swing clipboard | ❌ | – |  | – |
| Slide 1-66 | Slide track per track | Slide | ✅ | Sequence: Slide under the roll, then click or drag the step columns; marks along the roll's foot; lock lane draws the glide |  | 2 |
| Slide 1-66 | Copy, clear, paste, undo slide | Slide clipboard | ❌ | – |  | – |
| Mute mode 1-67 | Mute window, 6 + 6 | Mutes | ✅ | Perform > Mutes; rail M | MIDI mutes through the MUTE window keys | 2 |
| Mute mode 1-67 | Held changes until FUNCTION released | Prepared mutes | ✅ | Shift + M prepares, applies on release |  | 1 |
| Mute mode 1-68 | Minimise the window | Small window | ➖ | – | Page | – |
| Mute mode 1-68 | Mutes are global and remembered | Persistence | ✅ | Machine holds them | A track with no MIDI channel cannot be muted over MIDI: the page says so and offers "Give each track its own channel" (GLOBAL > Control) | – |
| Poly mode 1-69 | Six voices on the track in focus | Poly | ✅ | Perform > Poly |  | 1 |

## 16. The MIDI sequencer (1-70 to 1-72)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys |
|---|---|---|---|---|---|---|
| Using the MIDI sequencer 1-70 | Switch internal / MIDI editing | Side switch | ✅ | SYNTH / MIDI |  | 1 |
| Using the MIDI sequencer 1-70 | Select MIDI track, mute | Track | ✅ | Rail |  | 1 |
| Using the MIDI sequencer 1-70 | Notes, chords (one length), locks | MIDI notes | ✅ | Roll with real lengths |  | – |
| MIDI page 1-71 | LEN (127 = until note off) | Length | ✅ | MIDI page, drag a note end |  | 1 |
| MIDI page 1-71 | VEL | Velocity | ✅ | MIDI page, VEL row |  | – |
| MIDI page 1-71 | PB | Pitch bend | ✅ | MIDI page |  | – |
| MIDI page 1-71 | PCHG (only when locked) | Program change | ✅ | MIDI page |  | – |
| MIDI page 1-71 | CC 1-4 | Controllers | ✅ | MIDI page CL / CC boxes |  | – |
| Comparison 1-71 | No trig tracks; arp without switches; swing and slide; transpose | Differences | ✅ | Same docks |  | – |
| Comparison 1-71 | MIDI page stored in the kit | Kit part | ✅ | Kit edits |  | – |
| Comparison 1-71 | Internal tracks can send MIDI too | Internal MIDI out | ❌ | – | CONTROL OUT1 not editable. Measured (P2): global bytes 0x07-0x09, 0 INT, 1 OUT, 2 INT+OUT. | – |

## 17. The song mode (1-73 to 1-80)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys |
|---|---|---|---|---|---|---|
| Song mode 1-73 | Enter song mode | Mode switch | ✅ | Song > What plays; LCD PLAY |  | 1 |
| Song mode 1-73 | 24 songs, 200 rows | Capacity | ✅ | Song picker, 200 cells |  | 1 |
| Load song 1-73 | Load a song slot | LOAD SONG | ✅ | Song > "Load on the machine" | Only while stopped | 2 |
| Save song 1-74 | Save and name a song | SAVE SONG | ❌ | – | `saveSong` is in the desk, not in the page. Row edits go into the slot as dumps | – |
| Save song 1-74 | Copy, paste, clear, undo a song slot | Song slots | ❌ | – | Rows can be copied (`copyRow`) | – |
| Song play 1-75 | Play, pause, stop | Transport | 🟡 | Play key |  | – |
| Song play 1-75 | Switch to pattern mode and back; pointer held | Mode toggle | ✅ | PATTERN / SONG switch |  | 2 |
| Song transport 1-75 | Move the song pointer to a row and continue | Jump to row | ❌ | – | Page shows the playing row (0.3.5) but cannot set it. Measured (P1): with TRANSPORT IN = ACCEPT, Song Position Pointer + Continue starts the row that holds the pointer (at its first step on the internal clock). | – |
| Song transport 1-75 | Song pointer position over MIDI | SPP | ➖ | – | Firmware, via global transport setting | – |
| Song editing 1-76 | ROW count | Rows | ✅ | Arrangement grid |  | – |
| Song editing 1-76 | PAT column, END mark | Pattern | ✅ | Pattern palette, drag, ‹ › |  | 3 |
| Song editing 1-76 | REP | Repeats | ✅ | Repeat stepper |  | 1 |
| Song editing 1-77 | TRN pattern transpose | Row transpose | ✅ | Transpose stepper |  | – |
| Song editing 1-77 | Song track transpose (TR1-6, six MIDI) | Per-track transpose | ✅ | Row > More > Per track |  | – |
| Song editing 1-77 | OF LN offset and length | Part | ✅ | Row > More > Part |  | – |
| Song editing 1-77 | XTRA: row mutes (6 + 6) | Row mutes | ✅ | Row > More > Mutes |  | 1 |
| Song editing 1-77 | XTRA: row BPM | Row tempo | ✅ | Row Tempo |  | – |
| Song editing 1-77 | Insert / remove rows (FUNCTION + arrows) | Row edit | ✅ | Row Duplicate, Delete, Add loop, drag |  | 1 |
| Song editing 1-77 | Copy, paste, clear, undo rows | Row clipboard | ✅ | LCD COPY / PASTE / CLR; page undo |  | – |
| Song edit transport 1-77 | Start from any row (ENTER) | Play from row | ❌ | – |  | – |
| Song edit transport 1-77 | Counter in bars and beats | Song time | 🟡 | Song header: rows, bars, time | Not a live counter | – |
| Song loops 1-78 | Loop to a row, repeat count, nesting | Loop | ✅ | Row command LOOP |  | 1 |
| Song jump 1-78 | Forward jump | Jump | ✅ | Row command JUMP |  | – |
| Song halt 1-78 | Pause playback | Halt | ✅ | Row command HALT |  | – |
| Song extra 1-79, 1-80 | Row mutes and BPM; bold M / B marks | XTRA | ✅ | Cell marks T M B ~ |  | – |

## 18. Routing (1-81 to 1-86)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys |
|---|---|---|---|---|---|---|
| Mixer 1-81 | OUT BUS AB, CD, EF per track | Mix buses | ✅ | Mix > Out |  | – |
| FX machines 1-81 | Need input and a trig | FX input | ✅ | Mix IN select; new FX sets DEC and REL to 127 |  | – |
| Audio inputs 1-82 | INP A, INP B, INP AB | External audio | ✅ | Mix IN select |  | – |
| Audio inputs 1-82 | THRU machine as a start | THRU | ✅ | Machine picker |  | – |
| Neighbour routing 1-83 | NEIBOR input; chainable | Neighbour | ✅ | Mix IN = NEIBOR | Drawn as an arrow | – |
| Mix bus routing 1-84 | BUS AB / CD / EF input; insert or send | Bus FX | ✅ | Mix IN = BUS xx; flow line says insert |  | – |
| Routing mode AB=MIX 1-85 | CD and EF added to A/B | Mix mode | ✅ | Mix routing bar, LCD ROUTE |  | – |
| Routing mode 6xMONO 1-85 | Each track to its own output | Mono outs | ✅ | Mix routing bar |  | – |
| Routing 3xSTEREO 1-89 | Default routing | Stereo | ✅ | Mix routing bar |  | – |

## 19. Global settings (1-87 to 1-111)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys |
|---|---|---|---|---|---|---|
| Global slots 1-87 | 8 global slots; select, copy, paste, clear | Global slots | 🟡 | GLOBAL panel: slot keys 1-8 make one active; Reset to defaults (asked first) | No copy, paste or clear of a slot (`deskGlobal.js`, `globalSlot`, `globalReset`) | 2 |
| Turbo menu 1-87, 1-88 | TURBO negotiate speed | MIDI speed | ➖ | – | The emulator's own transfers use it internally; no cable to negotiate | – |
| Audio > Master tune 1-88 | 440.0 Hz default | Master tune | ❌ | – | Not on the GLOBAL page yet (release notes 0.5.0, Known); some bytes of the global are not decoded | – |
| Audio > Routing 1-89 | Three routing modes | Routing | ✅ | Mix routing bar |  | 1 |
| Control > MIDI channels 1-89 | Base channel | Base | ✅ | GLOBAL > Control > Base channel (OFF, 1-16) | Track t listens on base + t while t is inside the span (`117-global.js`) | – |
| Control > MIDI channels 1-90 | Channel span | Span | ✅ | GLOBAL > Control > Channel span | A warning names the tracks without a channel of their own | 2 |
| Control > MIDI channels 1-90 | Multi trig channel | Multi trig ch | ✅ | GLOBAL > Control > Multi trig |  | – |
| Control > MIDI channels 1-90 | Multi map channel | Multi map ch | ✅ | GLOBAL > Control > Multi map |  | – |
| Control > MIDI channels 1-90 | Auto track channel | Auto ch | ✅ | GLOBAL > Control > Auto track |  | – |
| MIDI functionality 1-90 | NRPN control, program change selects pattern | MIDI in | ➖ | – | Firmware; automation and DAW MIDI reach it | – |
| Control out 1 1-91 | SEQUENCER, ARP, KEYBOARD to INT / OUT / INT+OUT | Output routing | ❌ | – | Not on the GLOBAL page. Measured (P2): global bytes 0x07 SEQUENCER, 0x08 ARP, 0x09 KEYBOARD; 0 INT, 1 OUT, 2 INT+OUT; factory INT, INT, INT+OUT. | – |
| Control out 2 1-92 | TRANSPORT, MIDI CLOCK, PRG CHANGE out | Output control | ✅ | GLOBAL > Sync > Ctrl out, Tempo out; Control > Prg change out | `globalMidi` (clockOut, transportOut, programChangeOut). Machine MIDI out reaches the host since 0.4.0 | 1 |
| Control in 1-92 | TEMPO SYNC internal / external | Sync | ✅ | GLOBAL > Sync > Tempo in (INT / EXT) | A DAW sets EXT itself (`followHost`) | – |
| Control in 1-92 | TRANSPORT ACCEPT / IGNORE | Transport in | ✅ | GLOBAL > Sync > Ctrl in | A DAW turns it on itself; the page also asks once when PLAY needs it | – |
| Control in 1-93 | PRG CHANGE in | Program change in | 🟡 | GLOBAL > Control > Prg change in, shown as BASE | Shown, not changeable: measured, the machine always takes it on the base channel | – |
| Multi map edit 1-93 | Ranges, upper key, insert / delete | Key ranges | ✅ | Perform > Multi map table, Split, delete |  | 1 |
| Multi map edit 1-93 | PAT (CUR or pattern) | Pattern | 🟡 | Pattern select | The list offers CUR and A01-B16 only (32 patterns); the machine takes all 128 | – |
| Multi map edit 1-93 | OFS, LEN | Offset, length | ✅ | OFS, LEN boxes |  | – |
| Multi map edit 1-93 | TRN, TIM | Transpose, timing | ✅ | TRN, TIM boxes |  | – |
| Mechanical settings 1-94 | Knob resolution (MKII) | Encoder resolution | ➖ | – | Hardware knobs | – |
| Mechanical settings 1-94 | Velocity curve, fixed velocity (SFX-6) | Keyboard response | ➖ | – | Hardware keys. The editor's own velocity is keys C / V | – |
| Mechanical settings 1-94 | Joystick mapping TIGHT / FULL | Joystick | ➖ | – | Hardware joystick | – |
| File 1-95 | Sysex send: ALL, KIT, PAT+KIT, SONG+PAT+KIT with ranges | Send dumps | 🟡 | Right-click menu > export all as one .syx | No range choice | – |
| File 1-97 | Sysex receive: ORIG, SPEC, VERF | Receive dumps | 🟡 | SysEx import panel: choose slots, preview, report | ORIG-style (original positions); no SPEC start slot and no VERF-only mode | 2 |
| File 1-95, 1-97 | Needs the machine on SYSEX RECV | Receive session | ✅ | Editor drives it itself; pattern field shows RECV / SEND n | HW MIDI: user opens the screen | 2 |
| DigiPRO manager 1-99 | Send, receive, erase, rename user waveforms; copy between Digibanks | Waveform manager | ❌ | – | MKII only. Measured (P4): send (0x5E, used waveforms only) and receive (0x5D on the RECEIVE screen) work on the emulator; rename, erase and copy were not probed. | – |
| +Drive settings 1-105 | Quick mode, format | +Drive | ➖ | – | Not emulated | – |
| Snapshot manager 1-106 | Load, save, rename, erase, lock snapshots | +Drive | ➖ | – |  | – |
| Digibank manager 1-107 | Switch, rename, erase, lock banks | +Drive | ➖ | – |  | – |
| MIDI seq 1-108 | Track channel per MIDI track | MIDI seq channel | ✅ | MIDI page > Channel keys | `midiTrack` op | – |
| MIDI seq 1-109 | CL1-4 (CC 0-127 or AFT) | CC numbers | ✅ | MIDI page > CL1-4 |  | – |

## 20. Early startup menu, technical information (1-110 to 1-116)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys |
|---|---|---|---|---|---|---|
| Test mode 1-110 | Hardware self test, joystick calibration | Test | ➖ | – |  | – |
| Empty reset 1-110 | Clear kits, patterns, songs, globals | Reset | 🟡 | Clear single slots in the libraries; Alt + CLR for a pattern; GLOBAL > Reset to defaults for the active global | No "clear everything" key | – |
| Factory reset 1-110 | Restore factory data | Reset | ❌ | – | Remove and add the ROM or import the factory .syx | – |
| Soft reset 1-111 | Restart keeping data | Restart | ➖ | – | Reopen the editor | – |
| MIDI upgrade, send upgrade 1-111, 1-112 | OS update over MIDI | OS update | ➖ | – | The editor loads the OS 1.32B image | – |
| Specifications 1-113 | Data sheet | Specs | ➖ | – |  | – |
| MKI / MKII differences 1-114 | Hardware, user waveforms | Model | 🟡 | MKI / MKII plate key greys MKII-only machines | Plate looks the same | – |
| Credits, contact 1-115, 1-116 | – | – | ➖ | About box |  | – |

## 21. Appendix A: machine reference (A-1 to A-15)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys |
|---|---|---|---|---|---|---|
| SWAVE-SAW A-1 | UNIL, UNIW, UNIX, SUBX, SUB1, SUB2, TUNE | Eight saw oscillators | ✅ | Sound with unison and sub screens |  | – |
| SWAVE-PULSE A-2 | UNIL, UNIW, SUB1, SUB2, PW, PWAD, PWRS, TUNE | Pulse oscillators | ✅ | Sound with pulse screen |  | – |
| SWAVE-ENS A-2 | PCH2-4, WAVE, PW, CHRL, CHRW, TUNE | Chord ensemble | ✅ | Sound with chord keyboard | Offset-ratio options of PCH not modelled | – |
| SID 6581 A-3 | PW, PWAD, PWRS, WAVE, MOD, MSRC, MFRQ, TUNE | SID | ✅ | Sound with waveform and pulse screens |  | – |
| DPRO-WAVE A-4 | WAVE, WP, WPM, WPRS, SYNC, SFRQ, TUNE | Wave morph | ✅ | Sound > morph screen |  | – |
| DPRO-BBOX A-4 | PTCH, STRT, RTRG, RTIM; 24 drums by key | Beat box | ✅ | Sound; roll names the drums |  | – |
| DPRO-DDRW A-5 | WAV1, MIX, WAV2, TIME, BR1, WID, BR2, TUNE | Doubledraw (MKII) | ✅ | Sound; MKII only | User waveforms cannot be loaded | – |
| DPRO-DENS A-5 | PCH2-4, WAVE, CHRL, CHRW, TUNE | Ensemble (MKII) | ✅ | Sound; MKII only |  | – |
| FM+STAT A-6 | 1FRQ, 1FIN, 1ENV, 1FB, 2FRQ, 2VOL, TONE, TUNE | FM static | ✅ | Sound > FM screen |  | – |
| FM+PAR A-7 | 1-3FRQ, 1-3ENV, TONE, TUNE | FM parallel | ✅ | Sound > FM blocks |  | – |
| FM+DYN A-7 | 1FRQ, 1FEN, 1VOL, 1VEN, 2FRQ, 2ENV, 2FB, TUNE | FM dynamic | ✅ | Sound |  | – |
| VO-6 A-8 | VOC1-2, V-SW, VOIC, CONS, CLEN, CVOL, TUNE | Voice | ✅ | Sound > vowel map; roll shows consonant |  | – |
| VO-6 tutorial A-9 | Spell a word with locks | Tutorial | ✅ | Example in the mockup | Pattern recipe, doable with the lane | – |
| GND-GND A-10 | Silence | Ground | ✅ | Machine picker |  | – |
| GND-SIN A-10 | Sine, TUNE | Sine | ✅ | Machine picker |  | – |
| GND-NOIS A-10 | ST, RED, STON, TUNE | Noise | ✅ | Sound > noise screen |  | – |
| FX-THRU A-12 | INP | Pass through | ✅ | Sound; Mix IN |  | – |
| FX-REVERB A-12 | DEC, DAMP, GATE, MIX, HP, LP, INP | Gated reverb | ✅ | Sound > reverb screen |  | – |
| FX-CHORUS A-13 | DEL, DEP, SPD, MIX, FB, WID, LP, INP | Chorus | ✅ | Sound > sweep screen |  | – |
| FX-DYNAMIX A-13 | ATK, REL, THRS, MIX, RAT, GAIN, RMS, INP | Compressor | ✅ | Sound > compressor curve |  | – |
| FX-RINGMOD A-14 | WAVE, EXT, MIX, INP | Ring modulator | ✅ | Sound > carrier screen |  | – |
| FX-PHASER A-14 | CNTR, DEP, SPD, MIX, FB, WID | Phaser | ✅ | Sound > sweep screen |  | – |
| FX-FLANGER A-14, A-15 | DEL, DEP, SPD, MIX, FB, WID, INP | Flanger | ✅ | Sound > sweep screen |  | – |

## 22. Appendix B: MIDI control reference (B-1 to B-6)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys |
|---|---|---|---|---|---|---|
| Channels B-1 | Base channel + 0..5 per track | Track channels | ✅ | GLOBAL > Control; keys and keyboard use them | See Control > MIDI channels | 1 |
| Note on / off B-1 | Trig amp, filter, LFO; note off releases | Notes | ✅ | On-screen keyboard, home row, roll keys | `noteOn` / `noteOff` | – |
| Multi trig channel B-2 | All track, split, seq start, seq transpose | Multi trig notes | ✅ | Perform keyboard |  | – |
| Multi map channel B-2 | Triggers patterns | Multi map notes | ✅ | Perform keyboard |  | – |
| Auto channel B-2 | Notes go to the active track | Auto | ✅ | Perform "Auto track" |  | – |
| CC: joystick up / down B-2 | CC 1, 2 | Joystick | ✅ | Assign pad |  | – |
| CC: mute B-2 | CC 3 | Mute | ✅ | Mute keys |  | – |
| CC: level B-2 | CC 7 | Level | ✅ | LEVEL fader |  | – |
| CC: pan B-2 | CC 10 and 62 | Pan | ✅ | PAN |  | – |
| CC: synthesis 1-8 B-2 | CC 48-55 | Synth page | ✅ | SYN values |  | – |
| CC: amp B-2, B-3 | CC 56-63 | Amp page | ✅ | AMP values |  | – |
| CC: filter B-3 | CC 72-79 | Filter page | ✅ | FLT values |  | – |
| CC: effects B-3 | CC 80-87 | Effects page | ✅ | EFX values |  | – |
| CC: LFO 1-3 B-3 | CC 88-95, 104-111, 112-119 | LFO pages | ✅ | LFO values |  | – |
| CC: all notes off B-3 | CC 120 | Panic | ❌ | – | No panic key | – |
| NRPN parameters B-5 | Track, parameter, value | NRPN | ✅ | MIDI page values go as NRPN 0x38-0x3F |  | – |
| NRPN pitch B-5 | Pitch for a track | Pitch | ➖ | – | Firmware in; not used by the page | – |
| NRPN note off, trig track B-5 | Release, trig A / L / F | Extra trigs | ➖ | – | Not sent; manual bit order erratum recorded | – |
| NRPN multi env B-5 | Range 0x40-0x45 | Multi env | ✅ | Perform multi envelope |  | – |
| Pitch bend B-6 | Per track | Pitch bend | ✅ | Joystick pad |  | – |
| Program change B-6 | Selects pattern | Pattern by PC | ➖ | – | Firmware reacts to host MIDI | – |
| Song pointer, clock, start, continue, stop B-6 | System messages | Sync | ➖ | – | Firmware; used by `followHost` | – |

## 23. Appendix C: SysEx reference (C-1 to C-6)

| Manual § / page | Function | What it does | Our UI | Where in our UI | Notes | Journeys |
|---|---|---|---|---|---|---|
| 0x50 / 0x51 Global dump, request C-1 | Global slot data | Global | 🟡 | Read and written for routing, MIDI channels, sync, MIDI seq, multi map | Master tune and some bytes are not decoded on the page; CONTROL OUT 1 is measured (P2, bytes 0x07-0x09) but not on the page. | – |
| 0x52 / 0x53 Kit dump, request C-1 | Kit data | Kit | ✅ | Kit library, SysEx panel |  | – |
| 0x54 Unused C-1 | – | – | ➖ | – |  | – |
| 0x55 Set current kit name C-1 | Live kit rename | Kit name | ✅ | Kit library Rename (current kit) |  | – |
| 0x56 Set active global C-1 | Choose global slot | Global select | ✅ | GLOBAL panel slot keys | `globalSlot`; a slot made active during a SYSEX RECV dump stays active | 1 |
| 0x57 Load pattern C-2 | Switch pattern | LOAD PATTERN | ✅ | Pattern chooser |  | – |
| 0x58 / 0x59 Load / save kit C-2 | Kit load, save | LOAD / SAVE KIT | ✅ | Kit library |  | – |
| 0x5B Assign machine C-2 | Machine and init mode | Machine | ✅ | Machine picker |  | – |
| 0x5C Set track routing C-2 | Output bus, input | Routing | ✅ | Mix |  | – |
| 0x5D / 0x5E Digipro waveform dump, request C-2 | User waveforms | Waveforms | ❌ | – | Measured (P4): a request (0x5E) returns a used waveform byte for byte, nothing for an empty one; a dump (0x5D) is taken only on DIGIPRO MGR > RECEIVE. | – |
| 0x5E Set Gate box parameter C-2 | Reverb parameter | Reverb | ➖ | – | Not used; reverb values go as CC | – |
| 0x61 Set tempo C-2 | Tempo | Tempo | ✅ | LCD TEMPO | 30-300 BPM | – |
| 0x67 / 0x68 Pattern dump, request C-3 | Pattern data | Pattern | ✅ | All sequence edits, chooser |  | – |
| 0x69 / 0x6A Song dump, request C-3 | Song data | Song | ✅ | Song workspace |  | – |
| 0x6C / 0x6D Load / save song C-3 | Song slot | Load song | 🟡 | Load only | Save not in the page | – |
| 0x70-0x72 Status request, set, response C-3, C-4 | Slot, mode, poly, tracks | Status | ✅ | Pattern / song mode, poly, kit state |  | – |
| TurboMIDI speed messages C-4, C-5 | Speed negotiation | Turbo | ➖ | – | Cable protocol | – |

## 24. Editor features with no manual counterpart (for orientation)

The page also has things the manual does not: GEN and MUTATE generators, step selection with a box select and Draw mode in the piano roll, note lengths drawn by dragging a note's end, Control All (Alt-drag), paste to many tracks, ghost notes, ramps in the lock lane, undo and redo, DAW tempo follow, the AUDIO / MIDI panel, ROM and engine menu, SysEx import preview and report. They are not counted below.

## 25. Summary

Counts are rows of sections 1 to 23 by the Our UI column. (Computed from this file.)

| Our UI | Rows |
|---|---|
| ✅ | 295 |
| 🟡 | 33 |
| ❌ | 23 |
| ➖ | 34 |
| Total | 385 |

### Top gaps, ranked (our UI)

1. **No DigiPRO user waveform manager (1-99 to 1-104, 0x5D / 0x5E).** MKII machines can pick waveforms 1-64 but the user cannot send, receive, rename or erase them.
2. **Step recording and live-record erase (1-50, 1-49) are not in the page.** Live recording works and marks the step that gets a lock; the roll's drawing is the page's way of entering notes.
3. **Song: no pointer jump or play-from-row (1-75, 1-77), no SAVE SONG, song-slot copy or rename (1-74).** The page shows the playing row but cannot set it; `saveSong` exists in the desk but no control uses it.
4. **GLOBAL is mostly there, with holes (1-87, 1-88, 1-91).** Master tune, CONTROL OUT 1 (sequencer, arp, keyboard to INT / OUT), and copy / paste / clear of a global slot are missing; some bytes of the global are not decoded.
5. **Super copy / super clear (1-54, 1-55) and whole-track copy (1-52).** A step selection copies steps, slides and locks of chosen tracks, but not a chosen part (melody only) and not arp, transpose or swing with it.
6. **SysEx file functions are partial (1-95 to 1-98).** Export is all-in-one; there is no ranged send, no SPEC write position and no VERIFY-only receive.
7. **Transport details (1-5, 1-56).** No pause, no double-STOP rewind and all-notes-off, no +/-10 % tempo nudge, no delayed tempo change, no panic (CC 120).
8. **Arpeggiator, swing and slide have no copy / clear / paste / undo of their own (1-62, 1-65, 1-66).** Page undo only.
9. **Lock helpers (1-14, 1-57).** No key that drops only the locks of one step and keeps its note, and no "lock the current value" click.
10. **Reset functions (1-110).** No empty reset or factory reset from the editor (GLOBAL has Reset to defaults for one slot); the page cannot show or open the UNDO KIT slot.
