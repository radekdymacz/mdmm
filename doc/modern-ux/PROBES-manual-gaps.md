# Probes for the manual gaps (wave P)

- 2026-10-11. Wave P of [PLAN-manual-gaps.md](PLAN-manual-gaps.md): six questions about the firmware that decide parts
  of later waves (§4 of [DESIGN-machine-menus.md](DESIGN-machine-menus.md)). Measured on the emulated firmware, MD OS
  1.63 and MM OS 1.32B, with the user's own ROMs.
- The program: `source/elektron/md/mdLibTest/gapProbesFirmwareTest.cpp` (target `gapProbesFirmwareTest`). Not in
  ctest: it discovers, it does not guard, and all of it takes about 7 minutes. Run it again with

  ```sh
  scripts/mdmm-dev.sh build gapProbesFirmwareTest
  temp/dev/source/elektron/md/mdLibTest/gapProbesFirmwareTest --env --env all   # or p1md p1mm p2 p2panel p3 p4 p5 p6 p6b
  ```

  `--env` takes the ROM from `GEARMULATOR_MD_FIRMWARE_BIN` / `GEARMULATOR_MM_FIRMWARE_BIN`; a path works too, `-`
  skips that machine. Each probe prints a `RESULT` line; the checks only guard the rig (the machine boots, plays,
  answers). `explore md|mm "<keys>"` presses panel keys and, with `EXPLORE_ASCII=1`, prints the LCD.
- Times below are at 120 BPM: one step is 125 ms. Rows and steps are counted from 1.

## Answers in short

| # | Question | Answer | For |
|---|---|---|---|
| P1 | Song Position Pointer (0xF2) + Continue (0xFB) in pattern and song mode | MD: yes, to the step, in both modes. MM: only with TRANSPORT IN = ACCEPT (factory IGNORE); pattern mode to the step, song mode to the start of the row. MIDI Stop + Continue is a pause on both | wave 2 |
| P2 | MM CONTROL OUT 1 bytes | Global bytes 0x07 SEQUENCER, 0x08 ARP, 0x09 KEYBOARD: 0 INT, 1 OUT, 2 INT+OUT | wave 5 |
| P3 | MD TRIG IN A / B bytes | The ten `inputSettings` bytes, A and B interleaved: DEST, GATE, SENS, VMIN, VMAX. A SysEx global sets them | wave 5 |
| P4 | MM DigiPRO 0x5D / 0x5E on the emulator | 0x5E returns a used waveform byte for byte, nothing for an empty one. 0x5D is taken only on DIGIPRO MGR > RECEIVE | wave 6 |
| P5 | MD: what Stop twice over MIDI does | Nothing. No MIDI message silences the voices. Only the panel STOP pressed twice does | wave 2 |
| P6 | MD: does `mdfactorybaseline` hold the factory data | No: it is the sample flash. A machine booted with no patch RAM holds the factory kits, patterns, songs and globals, the same at every boot | wave 6 |
| P1b | After the panel's PLAY: does MIDI Stop + Continue pause, and is PLAY while playing a pause | MIDI Stop + Continue goes on from the step on both, pattern and song mode. The panel's PLAY pauses; PLAY again goes on in pattern mode, starts the row again in song mode | wave 2 |
| P5 MM | MM: what silences held notes | CC 123 lets them go (as note offs: the release rings); CC 120 and MIDI Stop do nothing; the panel's STOP lets them go too | wave 2 |
| P7 | MD: which tracks take the EDIT ALL row (`gapProbesFirmwareTest p7`) | Every track. `editAll` is a flag (any nonzero is ALL), not a track mask; per track only the own row counts | wave 3 |

## P1: Song Position Pointer and Continue

**Question.** Can the editor pause a machine over MIDI and go on from where it stopped, and can it start a song from a
row? Over a HW MIDI cable the editor has only realtime and SysEx messages, no panel keys.

**Method.** Patterns of 64 steps (pattern mode) and a song of five rows of 8 steps; a second song with rows of unequal
length and a repeat (row 1: 8 steps played twice, row 2: 4 steps, rows 3 and 4: 8 steps). For each SPP value: stop
twice on the panel, send SPP, then Continue, and read the playhead and the song row every 20 ms for 400 ms. Then SPP +
Start, SPP + the panel's PLAY, and a pause: play, MIDI Stop, wait 500 ms, MIDI Continue. Each on the factory global, with
the tempo from MIDI clock, and (MD) with CTRL IN off, (MM) with TRANSPORT IN = ACCEPT.

**Machinedrum** (factory global: CTRL IN on).

- Pattern mode: SPP n + Continue plays from step n + 1 (SPP 0, 4, 16, 40 all landed on their step). 4 of 4,
  also with the tempo from MIDI clock.
- Song mode: SPP counts steps through the rows, each row's steps times its plays. It lands on the row and on the step
  inside it: with the unequal song, SPP 12 = row 1, second play, step 5; SPP 18 = row 2 (4 steps), step 3; SPP 24 =
  row 3, step 5; SPP 28 = row 4, step 1. At or past the song's end (SPP 36) it starts row 4. Only rows that start at
  step 1 were measured.
- Pause: MIDI Stop holds the step (500 ms later it is still there); MIDI Continue goes on from it. Pattern and song
  mode, 2 of 2.
- SPP + Start: pattern mode starts at step 1 (Start wins); song mode started at the SPP's step.
- SPP, then the panel's PLAY: plays from the SPP's step in both modes.
- The panel's STOP is no pause: Continue after one STOP does not go on from the step that played.
- The same with the tempo from MIDI clock (TEMPO IN external). With CTRL IN off the machine ignores SPP, Continue and
  Start.
- The song row in RAM (`SongPosition::g_rowAddress`) moves to the next row about 2 steps before a row ends (the
  machine cues the next pattern). A row display that reads it runs early by that much.

**Monomachine.**

- Factory global: TRANSPORT IN = IGNORE. SPP, Continue and Start do nothing (the panel's PLAY still plays).
- TRANSPORT IN = ACCEPT, internal clock: pattern mode, SPP + Continue plays from the step (4 of 4). Song mode: SPP picks
  the row that holds the pointer (repeats counted: SPP 16 = row 2, SPP 18 = row 2, SPP 20 = row 3) and starts it at its
  first step; SPP 1-3 start row 1 at step 1.
- With the tempo from MIDI clock (TEMPO SYNC = EXT) song mode honours the step inside the row as well.
- Pause: MIDI Stop holds, Continue goes on, both modes.
- SPP + Start starts at step 1: Start ignores the pointer. SPP, then the panel's PLAY plays from the pointer.

**For wave 2.** Pause over HW MIDI: send Stop (0xFC), resume with Continue (0xFB). Play from a song row: SPP = the sum
of steps × plays of the rows before it, then Continue (not Start). On the MD this also reaches a step inside a row. On
the MM both need TRANSPORT IN = ACCEPT: the editor must say so or set it (the GLOBAL page already has the field).
`deskWire.h` needs the Continue and SPP builders (PLAN-manual-gaps.md, "Facts").

## P1b: a pause after the panel's PLAY (wave 2)

**Question.** The editor starts the emulated machine with the panel's PLAY; P1 started it with the song position and
Continue. Does MIDI Stop + Continue still go on from the step, and is the panel's PLAY while playing the machine's pause?

**Method.** `p1b` (`p1bmd`, `p1bmm`): panel PLAY, 700 ms, then a pause (MIDI Stop, or the panel's PLAY), 800 ms, then
a resume (MIDI Continue; the song position of the held step and Continue; the panel's PLAY), the playhead and the song
row read every 20 ms. Pattern mode, then song mode with rows of 8 steps. The MM with TRANSPORT IN = ACCEPT.

**Answer.** Both machines the same:

- MIDI Stop holds the step; MIDI Continue goes on from it, in pattern and song mode, after the panel's PLAY too.
- The panel's PLAY while playing holds the step. The panel's PLAY again goes on in pattern mode (from the next step),
  but in song mode it starts the row again from its first step. MIDI Continue after it goes on from the step.
- The song position of the held step before Continue changes nothing in pattern mode; in song mode on the MD it lands
  on row 1 (the position counts from the song's start, not the row's).
- The MM's RAM flag that says it plays stays 0 after a MIDI Continue or the panel's PLAY out of a pause, while the step
  moves: the editor's "playing" is the flag or the step moving (`watchStep`), so the page is told right.

**For wave 2.** Pause on the MD is MIDI Stop and Continue on both engines (CTRL IN on). On the MM emulator the pause is
the panel's PLAY (no setting needed) and the resume MIDI Continue where TRANSPORT IN is ACCEPT, else the panel's PLAY.
Over HW MIDI the MM's pause and resume need ACCEPT.

## P2: MM CONTROL OUT 1

**Question.** Which global bytes hold GLOBAL > CONTROL > CONTROL OUT1 (SEQUENCER, ARP, KEYBOARD to INT, OUT, INT+OUT),
and what does each value do?

**Method.** `p2panel`: the panel opens CONTROL OUT1 and steps each row's value with LEFT and RIGHT; the global dump is
read after every key. `p2`: each value of each byte is written by a SysEx global (on SYSEX RECV) and made active, then
a sequencer track plays, three TRIG keys are pressed, and two MIDI notes go into an arpeggiated track; MIDI out and the
audio are measured. The LCD was read to name the values.

**Answer.**

| Byte | Row | Factory |
|---|---|---|
| 0x07 | SEQUENCER | 0 INT |
| 0x08 | ARP | 0 INT |
| 0x09 | KEYBOARD | 2 INT+OUT |

Values: 0 INT (sound, nothing out), 1 OUT (no sound, sent out), 2 INT+OUT (both). Measured: SEQUENCER OUT silences the
track and sends each trig as NRPN on the base channel (CC 99 = 0x70 with CC 6 the note, then CC 99 = 0x7F, CC 6 = 1),
not as notes. ARP OUT sends the arpeggio as notes (9 for two held notes) and is silent. KEYBOARD INT sends no notes; OUT sends them and is
silent. The bytes 0x36-0x3B, which the code thought held these settings, changed nothing at 0, 1 or 2.

**For wave 5.** Three plain fields of the MM global, sent like the other GLOBAL fields. `mmGlobal.h` now names them;
they still sit in the kept `x07` array.

## P3: MD TRIG IN A / B

**Question.** How does the MD global's `inputSettings[10]` map to TRIG IN A and B (GATE, SENS, VMIN, VMAX, DEST), and
does a SysEx global set them?

**Method.** The panel opens GLOBAL > ROUTING > TRIG IN A, then B; each of the five knobs turns +1, +20, to the top and
to the bottom, and the global dump is read after each turn. Then a global with new values goes by SysEx, its slot is
made active (0x56), and it is read back and shown on the TRIG IN A screen.

**Answer.** A and B interleaved:

| Byte | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|---|
| Field | DEST A | DEST B | GATE A | GATE B | SENS A | SENS B | VMIN A | VMIN B | VMAX A | VMAX B |
| Factory | 16 | 16 | 1 | 1 | 0 | 0 | 0 | 0 | 127 | 127 |

GATE, SENS, VMIN and VMAX run 0-127. DEST is 0-15 for a track (the LCD shows it as "04-MT": track and machine) and
16 for none ("-"); the knob runs 16, 0, 1 ... 15. A SysEx global with DEST A on track 4 (byte 3), GATE 50, SENS 60, VMIN 10 and VMAX 90 read
back unchanged, and the TRIG IN A screen showed it at once after the 0x56 (the slot was already active). The emulator has no trig input, so what the values do to a pulse was
not measured.

The GLOBAL panel's Trig in A / B card read the bytes as five for A, then five for B, so every value sat under the
wrong name (B-069). Fixed on this branch: each column reads its byte, Dest shows the track or -.

**For wave 5.** The Trig in A / B card can become editable: change the bytes, send the global, make it active (the
same path as the other MD global fields). `mdGlobal.h` now documents the layout.

## P4: MM DigiPRO waveforms (0x5D, 0x5E)

**Question.** Does the MM (MKII ROM) answer a waveform request (0x5E), and does it take a waveform dump (0x5D)?

**Method.** 0x5E for waveforms 1, 2, 3, 32, 46, 64 (and out-of-range 65, 66, 101) on the normal screens. A 7027-byte
0x5D dump (a sine cycle in the public bank format) to waveform 61, first on the normal screens, then on DIGIPRO MGR >
RECEIVE (reached with the panel keys, `sysexPanelDriver.h` `enterMmReceive`); the user flash and patch RAM compared
before and after. Then 0x5E for waveform 61 and the empty 62.

**Answer.**

- 0x5E: no answer for an empty waveform (a factory machine answered none of the nine). After an import, waveform 61
  came back byte for byte as sent.
- 0x5D on the normal screens: ignored (no flash byte changed).
- 0x5D on DIGIPRO MGR > RECEIVE: taken (version 1, revision 1): 6128 bytes of user flash and 256 of patch RAM changed.

**For wave 6.** Export: request each of the 64 waveforms and keep the answers; an empty waveform does not answer, so
each request needs a short time-out. Import: on the emulator the editor opens DIGIPRO MGR > RECEIVE with panel keys
(as it does for SYSEX RECV), sends the dump and leaves; over HW MIDI the user must open that screen. Rename, erase and
copy between Digibanks were not probed.

## P5: MD Stop twice over MIDI, and panic

**Question.** The manual's double STOP silences every voice. Does MIDI Stop twice do the same, and what else might?

**Method.** Four tracks of GND-SIN with the longest decay ring out (a tail of about 0.15 RMS). Then one action each and
the RMS 100-500 ms and 500-900 ms after it; "silent" is below 5 % of the level before.

**Answer.** Silent only after:

- the panel STOP pressed twice (playing or stopped): 0.00004, gone at once;
- the level CC set to 0 on the tracks. That changes the kit; setting the level back brings the tail back.

Not silent: MIDI Stop once, twice back to back, twice 100 ms apart, while playing or stopped; CC 123 and CC 120 on the
four base channels; System Reset (0xFF); note off for all 128 notes; LOAD PATTERN; LOAD KIT; assigning the machines
again; the mute CCs.

**For wave 2.** Panic (⌘.) on the emulator presses the panel STOP twice. Over HW MIDI the MD has no panic message; the
editor can only send Stop (which stops the sequencer but lets tails ring) and say so.

## P5 MM: what silences the Monomachine's held notes (wave 2)

**Question.** The Monomachine Editor's panic: which message lets go of every note?

**Method.** `p5mm`: a note held (note on, no note off) on each of the six track channels (1-6 as booted), then one
action and the RMS 100-500 ms and 500-900 ms after it; "silent" is below 5 % of the level before.

**Answer.** Nothing is silent within 500 ms: the voices release as they would at their note off. CC 123 (All Notes Off)
on the six channels does what the note offs do (0.077 -> 0.011 -> 0.005); CC 120 (All Sound Off) and MIDI Stop (once or
twice) do nothing (0.054 after, as the control); the panel's STOP once or twice lets the notes go too (twice: 0.0002 in
the second window).

**For wave 2.** Panic on the MM sends CC 123 on each track's channel, then STOP (the panel's twice on the emulator,
MIDI Stop over a cable).

## P6: MD factory data

**Question.** Does the factory baseline (`mdfactorybaseline`, `md::Hardware::factoryFlashBaseline`) hold the factory
kits, patterns, songs and globals, so that a factory reset can come from it?

**Method.** `p6`: every kit, pattern, song and global is dumped; each dump's 24-byte runs are searched in the baseline,
the patch RAM and the ROM image. `p6b`: a machine boots with no patch RAM and every slot is dumped; a second fresh boot
is dumped again; a stored kit and pattern are changed and the machine boots again with that patch RAM.

**Answer.**

- The baseline is the initialised sample flash. None of the 64 kits, 128 patterns, 5 non-empty songs or 8 globals is in
  it, nor in the ROM image as dumped. The globals are in the patch RAM as they are dumped; kits and patterns are there in
  another form.
- A machine booted with no patch RAM holds the factory data: 64 different kits (kits 1 to 4 "TRX UW", "EFM UW",
  "E12 UW", "P-I UW"; mdFactorySourceFirmwareTest), 128 different patterns. A second fresh boot gave all 232 dumps byte for byte the same.
- The patch RAM carries a stored kit and pattern over a reboot.

**For wave 6.** Factory reset on the MD is possible without factory files: boot a second machine with no patch RAM from
the user's own ROM and read its dumps (the same every time), or restart the emulated machine with an empty patch RAM.
Whether an empty patch RAM keeps the user's samples in the sample flash was not measured; check it before the reset
takes that route.

## P7: MD EDIT ALL, which tracks take the pattern-wide row (wave 3, 2026-10-11)

`gapProbesFirmwareTest <MD ROM> - p7`: a sine on track 1, one trig on step 1, accent amount 15, the accent fields set by a
pattern dump, LOAD PATTERN, PLAY, the level of the first 300 ms (plain 0.172, accented 0.212).

- EDIT ALL 1 with the pattern-wide row on step 1 accents the trig, whatever the track's own row holds; the own row alone
  does nothing.
- EDIT ALL 0: only the track's own row counts; the pattern-wide row and another track's row do nothing.
- `editAll` 0x0002 (a mask without track 1) and 0xFFFF both accent track 1 and are read back as sent: the field is a
  flag (any nonzero is ALL), not a track mask.

So ALL reaches every track and there is no per-track setting of which tracks take the row. Wave 3 builds the EDIT ALL
switch (`markMode`, All tracks · This track) and leaves out the design's track dots (`markTrack`): there is nothing in
the pattern for them to set.
