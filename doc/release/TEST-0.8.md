# 0.8: what Radek tests on the installed build

About 90 minutes, macOS in full. Install both .pkg files first. Gear: a USB MIDI keyboard, the IAC driver with two buses (Audio MIDI Setup > MIDI Studio > IAC Driver, add a second bus), Ableton Live, Logic, a MIDI monitor app, a real Monomachine for the three hardware questions. Each line: action, then what you should see.

The editor's log shows a `midi: in … out … dropped …` line every 10 seconds while MIDI counts change (Help > Show log). Use it where a line below says "the log".

## macOS standalone: MIDI (both editors)

1. Open AUDIO / MIDI (the [,] key). Switch on the keyboard under MIDI. Play: notes sound. The Monitor row counts IN up as you play, and hovering the number lists the types.
2. MD, factory key map: play the white keys C2 to D4 on the base channel, one at a time. Each key sounds its own track and lights its number on the rail. Play the same keys on a channel outside the four base channels (a keyboard set to channel 10): nothing sounds.
3. MD, GLOBAL > Map editor: move TRACK 1 to another note. The new note plays track 1 and the old note plays nothing.
4. MD, GRID RECORD on, play keyboard notes: the pattern does not change.
5. MM, play a six-note chord with each note on a different channel (T1 to T6), or the same chord through a DAW: all six voices sound (B-011).
6. MIDI out to IAC Bus 2, with a MIDI monitor app on Bus 2: you see notes, and clock and start when Tempo out and Ctrl out are on. No SysEx appears, even when you press a kit load or open the SysEx panel.
7. IAC Bus 1 switched on as an input and chosen as the output: a red MIDI loop line appears under the output and the log carries it. Switch the input to Bus 2 or the output to Bus 2: the line goes. A USB interface in and out never shows it.
8. Live sends clock and Start over IAC Bus 1, Tempo in EXT, a pattern playing: the sound is clean for 2 minutes and the Monitor row shows a steady IN rate (B-154). Then Tempo in INT with notes only from Live: the pattern runs on its own tempo and the notes play.
9. Bluetooth MIDI: click **BLUETOOTH MIDI…**. The pairing window opens and the app stays up (B-155). Pair or cancel.
10. External Input: pick the audio interface. The choice stays. If it goes back to NONE, the note under the row says why. The first time, macOS asks for microphone access.
11. Unplug and replug the keyboard while playing. Note what happens: the input list and the notes after the replug.
12. MD channel 10 drums (base channels): a DAW drum track on channel 10 with the factory base channel plays nothing. Setting the Global base channel so that channel 10 is among the four makes it play the key map notes.

## Stacked LFOs (Machinedrum, B-161)

1. Kick on T1: three LFOs on its PTCH, each on TRIG mode, one hit per step at 120 BPM. Play 1 minute: every hit has its pitch sweep. None is missed.
2. Load a favourite old pattern: the sound may differ slightly from 0.7.0 (the machine's timing is finer now). Note what changed.

## Mode switching (both editors, B-162)

1. On the Song page cycle PATTERN, CHAIN, SONG, PATTERN, CHAIN fast, 10 times. The page's switch always matches the machine's mode. No kit value changes and the pattern is as it was.
2. Chain two pads, then press a pattern pad: the chain ends and the page says PATTERN.

## Pattern and Kit pages (both editors)

1. The first two tabs read **Pattern** and **Kit**, and the keys [1] and [2] switch to them. The key view and the tooltips use the same names.
2. Kit arrows: the KIT field has ‹ and › beside the name. Click › twice: the next kits load (the machine asks first over unsaved edits). Click ‹: back. K01 follows the last kit.
3. Pattern page, click a trig or note: it stays selected. Double-click removes it. Delete removes the selection. MM: with one note selected, up and down arrows change its pitch (shift moves an octave); with nothing selected up and down move the track. MD: left and right move the selection.
4. MM, delete a note from a held note followed by another: no NOTE OFF is written, and the earlier note runs on through the gap (I-037). Cut and drag a selection: the same.
5. MM, computer keyboard Z and X: octave from -4 to +6 in the toast, with the MIDI number. The Perform keyboard reaches MIDI note 0 to 127.

## Lock lane (both editors)

1. A lock lane shows a 2 px kit-value line with its number. Drag the line up or down: the kit value of the lane's parameter changes (the Kit page shows it) and no lock is drawn. One undo takes it back.
2. A short click near the line still sets a lock.
3. MM, a lock on a step without a trig shows as a hollow dashed ghost bar and the step is hatched. Alt-click erases it. A lock of 0 keeps a 2 px mark. The panel says "n locked steps" and the LCD LOCKS tip says "n of 62 locked parameters" (B-164).
4. MM, a slide between two locks draws a ramp, above the bars, only between real locks.
5. On a real Monomachine: a p-locked LFO parameter (for example SPD or DPTH) on one step. Does it revert to the kit value after its step? The LFO preview assumes yes (I-042). Note the answer.

## Monomachine (both testers' items)

1. Filter envelope on the Kit page: one screen of two panes. The big pane draws BOFS (solid) and WOFS (dashed) from -64 on the left to +63 on the right, 0 on the centre line. The small square pane sets ATK and DEC with two dots (I-043).
2. LFO screen: the trace runs the pattern's whole length. With a lock on SPD or DPTH on a step, that step is shaded, its tick taller, and the label names the locked parameters (I-042).
3. DigiPRO D waves: DPRO-DDRW WAV1, WAV2 and DPRO-DENS WAVE show D01 to D64 with the wave's name under the number (SINE, HSIN, TRI, STR4 …). Look at D52, D55, D56, D60, D63 and D64 beside the machine's LCD: they should read MALÄ, MALÅ, MALÖ, FEMÄ, FEMÅ, FEMÖ, with Ä, Å and Ö in that order. Say which letters are wrong.
4. SWAVE-ENS and DPRO-DENS PCH2 to PCH4: OFF, ±12 with interval ratios, as on the machine. FM+ frequencies show 1/64 up to 4.
5. BOFS and WOFS read -64 to +63. A cleared track's FILTER page holds BOFS and WOFS 64.
6. Step menu > **Pitchless trig (the note before)** on a selection with notes: they lose their note and keep their envelope trigs. On the machine, hold a trig and press EXIT: the same.
7. Lock lane trig mark: red means the trig fires all three envelopes (AMP, FILTER, LFO); green means only some or none. The tip says so.
8. Forwarded trig lamp: a track whose Trig position forwards to T2: when T1 trigs, T2's rail number lights blue (unless T2 trigs itself).
9. Mix, the routing graph: a pair of thin bars under each output jack (A/B, C/D, E/F) shows the level, with a hold tick and a clip mark. Play a loud pattern: the A/B pair moves; an output the host did not enable is dimmed. Turn to another page: the meters stop.

## Song and sequencer extras (both editors)

1. Song page: a row with a tempo, a mute or a transpose shows letter marks (B, M, ±, T) or a second line on its arrangement cell. The legend names them. Rows without them look as before.
2. SysEx import: the tick **Read back and compare** is on at first. Import a small .syx with it off: the report says "n sent, not read back", never "imported". On again: the full read-back as before.
3. Engine menu > **FOLLOW PLAYED TRACK**: off at first. Switch on, play notes on the keyboard for another track: the selection follows the track played. A note on another channel changes nothing. Stays set after save and reload (I-003).

## MD live recording

1. Load a sample into the Sampler, then live record on a track: the sample plays and the live recording records. Known (B-133): after a sample sent by SDS (Load sample, a drop, a rename) live recording records nothing until the editor is restarted. Do it, then restart the editor: recording works again.

## macOS VST3 in Ableton Live (both editors)

1. Preferences > Plug-ins: switch off Auto-hide plug-in windows and on Multiple plug-in windows. Both editors open at once, each in its own window.
2. Play, stop, loop 4 bars, move the play head: the machine follows. The DAW tempo shows (B-030).
3. MM: hold a note into T1 and stop: the note ends (B-121).
4. Tempo in INT: the machine keeps its own tempo and Live's Play does not start it. EXT: it follows Live.
5. A clip's Program Change switches the pattern (MD with Prg change in on, MM always).
6. Automate one host parameter per editor (a Kit knob, level, mute): the knob moves with the lane.
7. MD and MM on two tracks, Push on a third: no cross-talk. The `midi:` log lines show only each track's MIDI (B-119).
8. MD MIDI out to a MIDI track, record it: notes are there and no SysEx.
9. FOLLOW PLAYED TRACK on: a MIDI track playing the editor selects the track it plays.
10. MM, switch views and press mute and solo on a track: they still respond, and a solo lit in Mix is lit in Pattern (B-120).

## macOS AU in Logic (one editor)

1. If Logic lists the editor twice or loads an old one, delete the old `GearmulatorMD.component` and `GearmulatorMM.component` from `/Library/Audio/Plug-Ins/Components`, quit Logic and open it again.
2. MIDI in plays; the transport plays and stops. Note whether Logic offers the AU's MIDI out.

## Real-time and CPU

1. Standalone, a busy pattern on both editors, edit steps and turn knobs while playing; open the AUDIO / MIDI panel and drag the buffer. No drop-outs (the audio thread no longer waits for the editor).
2. In Live, open and close the editor window while playing: no click.

## Windows (a machine at hand, else a beta tester after release)

1. Standalone, input on: notes play. With Live holding the same port, the panel says why it cannot open (B-037). Only one program can hold a port.
2. MIDI out to loopMIDI: notes and clock. loopMIDI as input and output: the loop line.
3. VST3 in Live: the Live items 2 to 5 above.
4. Edit steps and MM parameters while playing; listen for crackle (B-156, retest on 0.8).

## Linux (a machine at hand, else a beta tester)

1. Standalone: ALSA ports listed, notes play, MIDI out reaches a second port. Midi Through as input and output: the loop line.
2. VST3 in Reaper: Play and Stop follow.
3. SteamOS (Steam Deck): after the pacman line in the README, both start (B-153).

## MIDI Learn (both editors, VST3 in Live and standalone)

The session side is built (the CONTROL page's new parts follow in L4 and L5, so learn from the page's LEARN key as it is). Check:

1. CONTROL: learn a knob from a controller CC (turn it both ways, or press a button that sends 0 and 127); the knob follows the controller and the machine's sound follows the knob.
2. Learn a CC, save the Live set (or the Reaper project), close, open: the mapping is still there and still moves the parameter.
3. A CC that is also on the firmware CC map (Machinedrum CC 16 to 39 on channel 1): after the learn, only the learned parameter moves, the machine's own target of that CC does not (no double jump). Remove the mapping: the CC reaches the machine again.
4. Learn while the transport plays: no drop-outs, the clock and notes keep reaching the machine.
5. In Cubase or Reaper (VST3): learn a relative encoder and turn it; the value does not jump back (the VST3 echo check), and the DAW records the turns as automation in write mode, one gesture per turn.
6. HW MIDI engine (the page's engine menu): Learn shows it is off with its reason; CCs from the host pass to the machine untouched. Back on the emulator: Learn works again.
7. Close the editor window while it waits for a controller: it stops waiting.

## Items from the log to close

- B-119, B-120, B-121: Live items 7, 10 and 3.
- B-154, B-155, B-153: macOS standalone items 7 to 10, Linux item 3.
- B-156, B-157: ask the testers to retest on 0.8.
