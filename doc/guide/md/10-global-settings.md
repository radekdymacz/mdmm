# 10. Global settings
<!-- summary: The machine's own settings: MIDI channels, the note map, program change, outputs, sync, and the SysEx send and receive. -->

The global settings are the machine's own settings. They hold the MIDI channels, the map of notes to tracks and patterns, program change, the output of each track and the sync. They belong to the machine, not to a pattern or a kit.

In the editor they sit in the **GLOBAL** panel.

![The GLOBAL panel](shot:md-global-panel)

## GLOBAL SETTINGS
<!-- rows: MD-162 @a1609f -->

The machine keeps 8 globals. One is active. On the machine you open the settings with [FUNCTION] and [PATTERN/SONG].

To open the panel:

1. Click **GLOBAL** in the top bar. Or choose **GLOBAL…** in the engine menu, the menu you open from the engine name on the LCD.
2. The header reads GLOBAL and the number of the active global. The keys 1 to 8 are the 8 globals. The lit key is the active one.
3. Click a key to make that global the active one.
4. Press {key:close-global}, or click **GLOBAL** again, to close the panel. A click outside it closes it too.

Every change is stored in the active global and made active at once. There is nothing to save.

To put the active global back to how the machine shipped, click **Reset to defaults**. The editor asks first. Click **Reset** to go on, or **Cancel**.

The panel has five cards: **Control**, **Sync**, **Trig in A / B**, **Map editor** and **Routing**.

NOTE: A setting that the editor could not check on the emulated machine is marked "not verified" in the panel.

## TURBO MENU
<!-- rows: MD-163 @8ce582 -->

The turbo menu is for the speed of the MIDI link. The emulated machine and the editor pace their link themselves, so the editor has no turbo setting.

## BASE CHANNEL
<!-- rows: MD-164 @a8ea32 -->

The base channel is the first of four MIDI channels the machine listens and sends on: channel n to channel n+3.

In the **Control** card, click **−** or **+** beside **Base channel**. The value reads the four channels, for example 1 to 4. It steps one channel at a time, up to 13 to 16.

NOTE: When the global holds a base channel of OFF, the card reads OFF. The machine then takes no notes, mutes or sound values over MIDI, and the editor cannot play it.

## MAP EDITOR
<!-- rows: MD-165 MD-166 MD-167 MD-168 MD-169 @6dc910 -->

The map editor says which MIDI note plays what. A note can play a track, start a pattern, or start or stop the machine. The **Map editor** card has the sixteen track keys and the controls for the other notes.

### Notes for the tracks

Each of the sixteen keys is named TRACK 1 to TRACK 16. It shows the note that plays the track, or -- when the track has none. Click **‹** or **›** on a key to move the note down or up. Notes are named as C4, C#4 and so on, from 0 to 127.

### Notes for patterns and the transport

1. Beside **Map a note**, click **‹** or **›** to choose the note.
2. Choose from the menu what the note plays: nothing, a track, a pattern A01 to H16, START or STOP.

A note plays one thing. If you give it a new job, it leaves the old one. The line beside **Pattern trig** lists the notes that play patterns or the transport.

### How a pattern note starts

Beside **Pattern trig**, click one of:

- **GATE**: the pattern plays while the key is held.
- **START**: the pattern starts at once.
- **QUE**: the pattern starts at the end of the pattern that plays.

{gap:MD-169}You cannot give a note by playing it on a keyboard in the editor yet. Choose the note with the **‹** and **›** keys.{/gap}

## LOCAL CONTROL
<!-- rows: MD-170 @aaf210 -->

Local control sets whether the keys and the sequencer of the machine play its own sounds. In the **Control** card, click **ON** or **OFF** beside **Local ctrl**. With OFF the keys and the sequencer do not play the internal sounds.

NOTE: The panel marks this switch "not verified". The setting is stored in the global, but its effect could not be checked on the emulated machine.

## PROGRAM CHANGE
<!-- rows: MD-171 MD-172 @905078 -->

In the **Control** card:

- **Prg change in**: ON makes a MIDI program change choose a pattern.
- **Prg change out**: ON makes the machine send a program change when a pattern is chosen.
- **Prg channel**: click **−** or **+** to choose the channel, 1 to 16. BASE means the four base channels for the messages in, and the first of them for the messages out.

## MECHANICAL SETTINGS (MKII UNITS ONLY)
<!-- rows: MD-173 @64cf06 -->

The machine sets the resolution of its knobs here: 24 or 32 steps. The editor has no knobs, so it has no such setting.

## OUTPUT
<!-- rows: MD-174 @6e1937 -->

Each track plays on the main output, through the master effects, or on one of the individual outputs A to F, which skip the master effects.

In the **Routing** card the sixteen keys show the output of each track: MAIN, or A to F. Click a key to go to the next output: MAIN, A, B, C, D, E, F, then MAIN again.

You can also click **OUT** on the strip of the track in the **Mix** workspace. Delay and reverb sends reach only the main outputs, so a track on an individual output keeps those values but does not use them.

## TRIG
<!-- rows: MD-175 @ec091c -->

The two trig inputs of the machine turn the pulses of a pad into notes. The **Trig in A / B** card shows what the global holds for each input: **Gate**, **Sens**, **Vmin**, **Vmax** and **Dest**.

{gap:MD-175}The card shows these values as they are stored. You cannot change them in the editor yet. They are marked "not verified".{/gap}

## ALL DATA SYSEX SEND
<!-- rows: MD-176 @ccc069 -->

To save everything the editor holds as a SysEx file:

1. Click the kit name in the <KIT> field of the LCD, or the pattern name in the <PATTERN> field. The kit library or the pattern chooser opens.
2. Click **Export SysEx…** in its header.
3. Choose where to put the file. The name starts as the product name and "backup.syx", in your Documents folder.

The file holds every pattern, kit and song the editor has, and the global. It is one file.

TIP: Export before you import. The import has no undo, and the export keeps a way back.

{gap:MD-176}You cannot choose a range of slots for the export yet.{/gap}

## GLOBAL SYSEX SEND
<!-- rows: MD-177 @f6f201 -->

The export of all data includes the global. {gap:MD-177}You cannot send the global of one slot alone, or all the globals, in the editor yet.{/gap}

## SONG + PATTERN (+ KIT) SYSEX SEND
<!-- rows: MD-178 @bc1ec1 -->

{gap:MD-178}The export holds all the songs with all the patterns and kits. You cannot choose a range of songs in the editor yet.{/gap}

## PATTERN (+ KIT) SYSEX SEND
<!-- rows: MD-179 @3dcf19 -->

{gap:MD-179}The export holds all the patterns and kits. You cannot choose a range of patterns in the editor yet.{/gap}

## KIT SYSEX SEND
<!-- rows: MD-180 @c70e79 -->

{gap:MD-180}The export holds all the kits. You cannot choose a range of kits in the editor yet.{/gap}

## GENERAL SYSEX RECEIVE
<!-- rows: MD-181 @f9ab4b -->

The machine takes SysEx at any time. In the editor you open the file first and choose what to send.

1. Click **Import SysEx…** in the header of the kit library or the pattern chooser. Or drop the .syx file on the window. Drag and drop works on macOS only.
2. Choose the file. The **Import SysEx** panel opens. Its header names the model and says "full backup" when the file is one.
3. Read the tabs: **Kits**, **Patterns**, **Songs**, **Globals** and **Other**. A tab shows the slots of the machine as a grid, and the number of items of that kind in the file. Each tab has a box: tick it to send that kind.
4. A slot in the grid is marked when it overwrites a slot that holds data on the machine. A slot marked ▶ plays now. Click a slot to leave it out. Click it again to take it back. Click with [⇧] to change a range.
5. Click **All**, **Empty slots only** or **None** to set the whole tab.
6. Read the line at the foot. It says how many slots on the machine are overwritten.
7. Click **Import**. The button says how many items it sends.

![The SysEx import panel](shot:md-sysex-import)

While the import runs, the panel shows three steps: **Read the slots**, **Send** and **Read back**, and a bar for each kind. Click **Stop** to cancel or **Hide** to put the panel away.

At the end the panel gives a report, slot by slot:

| Mark | Meaning |
|---|---|
| ✓ | taken as in the file |
| ≈ | converted |
| ✕ | ignored |
| ≠ | different from the file |
| ~ | not comparable |
| ? | no answer, or not known |

Click **Show problems only** to list only the slots that did not go as in the file. Click **Done** to close the panel.

NOTE: The import has no undo. A kit that plays, and has unsaved edits, can lose them when a dump takes its place.

NOTE: **Globals** and **Other** are off until you tick them. A global changes the MIDI channels the machine listens on, and so which tracks the editor can mute, play and edit live. The active global becomes active at once.

## ORIGINAL PLACE SYSEX RECEIVE
<!-- rows: MD-182 @7b772b -->

The import puts each item in the slot it came from, as the machine does with ORIG. This is how every import works in the editor.

## SPECIFIC PLACE SYSEX RECEIVE
<!-- rows: MD-183 @f29fa0 -->

{gap:MD-183}You cannot send an item to another slot than the one it came from. You can leave slots out of the import.{/gap}

## SYSEX VERIFY
<!-- rows: MD-184 @7616a4 -->

The import reads every item back after it sends it. The report lists the items that differ from the file, marked ≠.

{gap:MD-184}The import writes to the machine. You cannot compare a file with the machine without writing it.{/gap}

## SYNC
<!-- rows: MD-185 MD-186 MD-187 MD-188 @c3eccc -->

The **Sync** card sets how the machine takes and sends the MIDI clock and the transport.

### Tempo in

Beside **Tempo in**, click:

- **INT**: the machine runs at its own tempo.
- **EXT**: the machine follows the MIDI clock it receives. MIDI Start waits for the clock.

In a DAW the machine follows the tempo of the host. See "EXTERNAL SYNCHRONIZATION" in chapter 8.

### Ctrl in

Beside **Ctrl in**, click **ON** to make the machine react to MIDI Start, Stop and Continue. Click **OFF** to make it ignore them.

### Tempo out

Beside **Tempo out**, click **ON** to make the machine send the MIDI clock.

### Ctrl out

Beside **Ctrl out**, click **ON** to make the machine send MIDI Start, Stop and Continue.
