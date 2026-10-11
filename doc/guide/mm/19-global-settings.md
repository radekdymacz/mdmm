# 19. Global settings
<!-- summary: The machine's own settings: MIDI channels, sync, routing, the multi map, and the SysEx import and export. -->

The machine keeps eight global slots. One is active. The settings are in the **GLOBAL** panel. Click **Global** in the top bar, or choose **GLOBAL…** in the engine menu. Press [ESC] to close it.

![The GLOBAL panel](shot:mm-global-panel)

Every change is stored in the active slot and made active at once. The panel has the cards **Control**, **Sync** and **Routing**.

## GLOBAL SLOTS
<!-- rows: MM-285 @9a1a0c -->

The header of the panel holds the keys 1 to 8. The lit key is the active slot. Click another key to make that slot active.

**Reset to defaults** writes the global the machine ships with into the active slot. The editor asks first.

{gap:MM-285}You cannot copy, paste or clear a global slot in the editor yet.{/gap}

## TURBO MENU
<!-- rows: MM-286 @4ae36d -->

The machine negotiates its MIDI speed with a cable. The editor has no cable to negotiate, so it has no turbo menu.

## AUDIO
<!-- rows: MM-287 MM-288 @e66a72 -->

### MASTER TUNE

{gap:MM-287}The GLOBAL panel has no master tune yet.{/gap}

### ROUTING

The **Routing** card sets the routing mode: 3xSTEREO, 3xSTEREO + AB=MIX or 6xMONO. It is the same setting as the **Routing** bar on **Mix**. See chapter 18.

## CONTROL
<!-- rows: MM-289 MM-290 MM-291 MM-292 MM-293 @174c01 -->

### MIDI CHANNELS

The **Control** card sets the channels the machine listens on.

- **Base channel**: OFF, or 1 to 16. Track t listens on the base channel plus t.
- **Channel span**: how many tracks, counting from T1, have a channel of their own. 6 gives all of them.
- **Auto track**: notes on this channel play the selected track.
- **Multi trig**: notes on this channel play the tracks as the multi trig mode says (chapter 9).
- **Multi map**: notes on this channel start patterns as the multi map says.

Click **−** or **+** to change a value. The base channel reads as a range, for example 1 to 6, when the span is more than one.

A track has a channel only if its channel is 15 or lower. A base channel of 16 reaches no track. When a track has no channel of its own, the card says which tracks, and that mutes and notes cannot reach them. The editor then sends their sound values as kit dumps.

### MORE ON THE MONOMACHINE MIDI FUNCTIONALITY
<!-- rows: MM-294 @ba61e3 -->

The machine takes NRPN control and uses program change to select patterns. Automation and MIDI from a DAW reach it as they reach the machine.

### CONTROL OUT1
<!-- rows: MM-295 @63f101 -->

{gap:MM-295}You cannot send the sequencer, the arpeggiator or the keyboard to the MIDI out of the machine in the editor yet.{/gap}

### CONTROL OUT2
<!-- rows: MM-296 @0e638d -->

The **Sync** card holds two switches for what the machine sends. **Tempo out** sends the MIDI clock. **Ctrl out** sends MIDI start and stop. The **Control** card has **Prg change out**: choosing a pattern then sends a program change on the base channel.

### CONTROL IN
<!-- rows: MM-297 MM-298 MM-299 @441353 -->

- **Tempo in**: INT uses the machine's own tempo. EXT follows the MIDI clock.
- **Ctrl in**: ON makes the machine react to MIDI start, stop and continue.
- **Prg change in**: reads BASE. The machine always takes a program change on its base channel, so you cannot change it.

In a DAW the plug-in sets **Tempo in** to EXT and **Ctrl in** to ON itself.

### MULTI MAP EDIT
<!-- rows: MM-300 MM-301 MM-302 MM-303 @d3fcee -->

The multi map starts patterns from key ranges. It is on the **Perform** workspace, in multi map mode. It is stored in the global slot.

1. Press {key:workspace-4}.
2. In the **Keyboard** bar, click **Multi map**.
3. The table lists the ranges from the lowest key. Click **−** or **+** beside a range's upper key to move the limit. The last range always ends at G-9.
4. Choose the pattern in the **Pattern** list. **CUR** plays the current pattern.
5. Set **OFS**, the first step. **LEN** is the number of steps and needs an offset first. **TRN** is the transpose and **TIM** the timing.
6. Click **Split selected range** to cut a range in two. Click × to delete a range.

Bands on the keyboard show the ranges. A key you play shows the pattern it starts.

{gap:MM-301}The pattern list offers CUR and the patterns A01 to B16 only. The machine takes all 128.{/gap}

## MECHANICAL SETTINGS
<!-- rows: MM-304 MM-305 MM-306 @9df19f -->

Knob resolution, the velocity curve and the joystick mapping belong to the hardware. The editor has no setting for them.

## FILE
<!-- rows: MM-307 MM-308 MM-309 @6b9473 -->

### Export

The kit library and the pattern chooser each have an **Export SysEx…** key. It writes every pattern, kit and song, and the global the editor holds, into one .syx file. The plug-in opens a save dialog.

{gap:MM-307}You cannot choose a range of slots to send.{/gap}

### Import

1. Click **Import SysEx…** in the kit library or the pattern chooser, or drop a .syx file on the window (macOS only).
2. The import window previews the file. It has a tab for each kind: Kits, Patterns, Songs, Globals and Other.
3. A slot grid shows the slots. A click leaves a slot out or takes it in again. Hold [⇧] and click to choose a range.
4. Click **Import**. The window shows a bar. **Stop** ends the import, **Hide** puts the window away.
5. A report lists what the machine did with each slot.

Globals and other messages are off unless you tick them. Importing a global changes the channels the machine listens on. There is no undo, so use **Export SysEx…** first.

Files go into the slots they came from.

{gap:MM-308}You cannot choose a first slot to write to, and there is no mode that only verifies a file.{/gap}

### The machine's SYSEX RECV screen

The Monomachine takes a dump only on its SysEx receive screen. The editor opens it for you. With a real Monomachine over MIDI, the sync field on the second line of the LCD reads SEND and the number of waiting edits. Click it and follow the steps.

## DIGIPRO MANAGER
<!-- rows: MM-310 @cd7e9d -->

{gap:MM-310}You cannot send, receive, rename or erase user waveforms in the editor.{/gap}

## +DRIVE SETTINGS
<!-- rows: MM-311 MM-312 MM-313 @25af9c -->

The +Drive, its snapshots and its Digibanks are hardware. The editor does not emulate them.

## MIDI SEQ
<!-- rows: MM-314 MM-315 @457d20 -->

The channel of each MIDI track, and the controller numbers CL1 to CL4, are on the **MIDI page** of **Sequence**. See chapter 16.
