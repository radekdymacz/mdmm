# 1. Introduction, front panel and connectors
<!-- summary: The editor's page in place of the front panel: workspaces, the LCD, the transport, the track rail and the connections to your audio and MIDI. -->

The Machinedrum Editor runs the Elektron Machinedrum firmware (OS 1.63) behind one web page. You work on the page. It has no picture of the machine's front panel and no LCD with menus to step through: every function is a control on the page. The firmware does the work underneath, so the sound and the sequencer are the machine's.

This chapter maps the machine's front panel and rear connectors to the page. Later chapters follow the manual's order and say how to do each job.

## FRONT PANEL
<!-- rows: MD-001 MD-002 MD-003 MD-004 MD-005 MD-006 MD-007 MD-008 MD-009 MD-010 MD-011 MD-012 MD-013 MD-014 MD-015 MD-016 MD-017 MD-018 MD-019 MD-020 MD-021 @b23237 -->

The page has three parts. The top bar holds the workspace tabs, the LCD and the Undo, Redo, GLOBAL and panel colour keys. The track rail runs down the left side. The workspace fills the rest.

![The Machinedrum Editor](shot:md-workspaces)

### The workspaces

The machine has pages that you reach with keys. The editor has workspaces that you reach with the tabs in the top bar.

| Workspace | Key | What it holds |
|---|---|---|
| Pattern | {key:workspace-1} | the step grid, the lock lane and the generators |
| Kit | {key:workspace-2} | the selected track's machine, effects, routing and LFO |
| Mix | {key:workspace-3} | one strip a track, and the four master effects |
| Sampler | {key:workspace-4} | the sample slots and the RAM machines |
| Song | {key:workspace-5} | the song arrangement |

The panel colour key at the right of the top bar switches the page between the silver MKI look and the black MKII look. It changes the colours only.

### From the front panel to the page

| On the machine | In the editor |
|---|---|
| Master volume knob | the volume of your DAW or system |
| SOUND SELECTION wheel and LEDs | the track rail |
| TRIG keys 1 to 16 | the steps of the grid, and the piano keys |
| SYNTHESIS, EFFECTS and ROUTING key | groups on the Kit workspace, all in one view |
| DATA ENTRY knobs A to H | the value boxes |
| SCALE SETUP key and page LEDs | the **Page** key and four LEDs on the Pattern workspace |
| RECORD, PLAY, STOP | **REC** and the Play and Stop key in the LCD |
| TEMPO key | the **Tempo** field of the LCD |
| KIT key | the **Kit** field of the LCD |
| BANK key and the A to H keys | the pattern chooser |
| FUNCTION key | the [⌥] key |
| CLASSIC/EXTENDED key | **MODE** on the Pattern workspace's second LCD line |
| PATTERN/SONG key | **PLAY** on the LCD's second line |
| ENTER/YES, EXIT/NO and the arrow keys | not needed: every menu is a control, and [ESC] closes a window |

On the machine you move through menus with ENTER/YES, EXIT/NO and the arrow keys. In the editor you click the control. The firmware still takes those keys, but only a real machine's panel (the hardware MIDI engine) can send them.

### Select a track

The track rail lists the 16 tracks. Each entry shows the track number, the machine on it, and an **M** and an **S** key for mute and solo.

- Click a track in the rail to select it.
- Press {key:track-prev-next} to select the track before or after.

On the machine you hold FUNCTION and press a TRIG key to select a track. In the editor a plain click selects it.

On the Mix workspace a light on each strip flashes when its track plays a trig. This is the editor's version of the SOUND SELECTION LEDs.

### Classic and extended mode

1. Open the Pattern workspace.
2. Click **MODE** on the LCD's second line.
3. The field reads CLASSIC or EXT. Each click switches.

In CLASSIC mode a pattern holds trigs only. In EXTENDED mode a pattern also holds its kit link and its parameter locks, and locks play only in EXTENDED mode.

In CLASSIC mode the lock lane says that its locks are muted. The locks are not lost: they come back when you switch to EXTENDED. In CLASSIC the pattern chooser shows no kit under any pattern.

4. Click the pattern name in the LCD to open the pattern chooser. In EXTENDED it shows each pattern's kit, in CLASSIC it does not.
5. Press {key:close-dialog} to close it.

![The pattern chooser in CLASSIC mode](shot:md-top-mode-classic)

### The FUNCTION key

The machine's FUNCTION key is the [⌥] key of the computer. Hold it while you press a key or drag a control, and the action reaches every track, or a wider range.

- [⌥] and drag a value: move the same knob on every track.
- {key:randomise-all}: randomise every track.
- {key:mute-all}: mute every track.
- {key:record}: live recording.
- {key:clear-pattern}: clear the whole pattern.

While you hold [⌥], the keys it changes say what they do then. **Clr** becomes **All**.

{gap:MD-005}The editor has no single key for every FUNCTION combination of the machine. Each combination is a control of its own, and the chapter for its job names it.{/gap}

### Pattern banks

Patterns are in eight banks, A to H, of 16 patterns each.

1. Click the pattern name in the LCD. The pattern chooser opens.
2. Press a letter from {key:lib-bank} to jump to that bank, or click a bank key.
3. Click a pattern. While the machine plays, it starts the pattern when the current one ends. When it is stopped, the pattern changes at once.
4. Press {key:close-dialog} to close the chooser.

Every slot shows its name and its length in steps. A slot with no trigs reads EMPTY. To copy a pattern:

1. Select a pattern that has trigs and click **Copy**.
2. Select another slot and click **Paste**. The slot takes the steps and the kit link of the copy.
3. To empty a slot, select it and click **Clear**. Its tile reads EMPTY.
4. Press {key:undo} to take a paste or a clear back, once for each.

The ‹ and › keys beside the pattern name step to the pattern before or after.

![The pattern chooser](shot:md-pattern-chooser)

### Level

The machine's LEVEL knob sets the overall level of the selected track. It is stored in the kit, and it cannot be locked or modulated by an LFO. In the editor it is the **LEV** box at the top of each strip on the Mix workspace.

1. Press {key:workspace-3} for the Mix workspace.
2. Drag the **LEV** box of a track up or down, or scroll the wheel over it. The kit that plays takes the new level at once.
3. Double-click the box to set it back to 100.
4. {key:undo} takes each change back.

![The Mix workspace with a LEV box on each strip](shot:e2e-md-mix-lev)

**VOL** under it is the track's volume on the routing page. It is a different value: VOL can be locked, LEV cannot.

### Tempo

1. Drag the **Tempo** value in the LCD up or down. Each pixel is half a BPM; hold [⇧] for a tenth of a BPM a pixel.
2. Or press {key:tap-tempo} in time with the beat. The tempo is the average of your last taps.

To set the tempo in single steps, click the **Tempo** value without dragging:

1. A TEMPO window opens.
2. Click **+** to go one BPM faster and **-** to go one BPM slower.
3. Hold **+10 %** to play 10 % faster for as long as you hold it. The LCD says so. The tempo you set is not changed, and it returns when you let go.
4. Press {key:close-dialog} to close the window.

In a DAW the machine follows the host's tempo. The Tempo field is marked and does not edit; change the tempo in the DAW, or set **Tempo in** to INT in GLOBAL for the machine's own clock.

### Data entry

Each parameter is a value box. A box shows the name and the value.

- Drag a box up or down, or sideways, to change it.
- Hold {key:value-fine} and drag for fine steps, a quarter as fast.
- Scroll the wheel over a box: one step a notch, ten with [⇧].
- Double-click a box to set it to 64, or to 100 for **VOL**.
- Hold [⌘] and click a box to type its value. A field opens over the box. Type the value and press [ENTER], or press [ESC] to leave it as it was. A box that has the focus opens the field with [ENTER] too.

On the machine you press a DATA ENTRY knob in to turn it in coarse steps. In the editor the wheel with [⇧] does the same.

### The three parameter pages

The machine shows the synthesis, effects and routing parameters one page at a time. The Kit workspace shows all three at once, in groups. A small word at the right of a group's title names the machine's page that holds its knobs.

### Recording and the transport

There is no record mode to switch on. The step grid is always open for editing, so the machine's RECORD key has no counterpart.

To record live, click **REC** or press {key:record}. Click the steps of a track to play and record it, and move a value to lock it. Click **REC** again to stop recording and go on playing.

Press {key:play-stop} to start. The key shows ▶ while the machine is stopped and ■ while it plays. Press it again to stop.

On the machine a second press of [PLAY] pauses. In the editor you pause with [⇧]:

1. Hold [⇧] and click the Play key, or press {key:pause}. The machine holds its step. The Play key blinks and <POSITION> keeps the step.
2. Click the Play key, or press {key:pause} again. The machine goes on from the step it held.
3. To end the pause instead, choose **Stop** in the transport menu. <POSITION> reads --.--.

The transport menu has Play or Stop, Pause or Continue, Record and Panic, each with its key. Right-click the Play key to open it. With the Play key focused, Shift+F10 or the menu key opens it too.

On the machine a double press of [STOP] silences every voice. In the editor this is **Panic**: press {key:panic}, or choose **Panic** in the transport menu. The editor presses the machine's [STOP] twice, and the machine stops.

NOTE: Pause and Continue reach the machine as MIDI Stop and Continue, so the machine's <CTRL IN> must be on (GLOBAL, MIDI). Over a MIDI cable there is no panic: no MIDI message silences the Machinedrum. Press [STOP] twice on the machine.

{gap:MD-016}There is no key that restarts the pattern from the top while it plays. Stop, then play.{/gap}

### Pattern or song

The LCD's second line has a **PLAY** field on every workspace. It reads PAT in pattern mode and SONG in song mode, and each click switches. On the Song workspace the **PATTERN**, **CHAIN** and **SONG** keys over the pattern palette set what plays. **PATTERN** and **CHAIN** keep the machine in pattern mode: in PATTERN a click on a pad queues that pattern, in CHAIN the pads number the chain. **SONG** puts the machine in song mode, and the pads add rows to the arrangement. The field shows what the machine reports.

### Kits and songs

Click the **Kit** field of the LCD to open the kit library. Chapter 3 describes it.

The machine's song menu is the **Songs** column of the Song workspace: load, save, save to another slot with a name, copy, paste, clear and rename. Chapter 9 describes it.

### TRIG keys

The steps of the grid are the TRIG keys. Click an empty step to draw a trig. Click a trig to select it, and it stays selected: {key:delete} removes it and the arrows move the selection. Double-click a trig to remove it. Select more steps with ⌘-click, then click the small ⋯ on a selected step for its menu, or right-click the step.

To play a first beat:

1. Open the Pattern workspace and select a track in the rail.
2. Click four empty steps of that track. Each lights as a trig.
3. Press {key:play-stop}. The pattern plays with your trigs.
4. Press the same key to stop.

![The step grid with trigs](shot:md-step-grid)

The piano keys play the selected track from any workspace: {key:piano-white} play the white keys C to D. {key:octave} moves the octave, two up or down (the PTCH range of the machines) and {key:velocity} sets the velocity.

### Pattern pages

A pattern of 64 steps has four pages of 16.

- Click **Page** to show the next page. Hold [⇧] and click to show the previous one. The left and right square bracket keys do the same.
- Four LEDs beside the key show the pages the pattern has. The page that plays is lit. Click an LED to show that page.
- If the pattern has one page, click **×2** on the LCD to double its length. The LEDs then show the pages of the new length.
- **All** shows every step at once. It is on when the editor starts.
- **Fol** makes the page follow the play position. With **Fol** on and the machine playing, the lit LED moves to the second page when the position passes step 16.

![The Pattern workspace with its page LEDs](shot:md-sequence-workspace)

## REAR CONNECTORS
<!-- rows: MD-022 MD-023 MD-024 MD-025 MD-026 @a52684 -->

The editor has no power switch or power input. It runs as a plug-in in your DAW, or as a standalone program. It has no rack mount, no battery and nothing to care for.

### MIDI

In a DAW the plug-in takes MIDI from the host. In the standalone, open the **AUDIO / MIDI** settings with {key:audio-settings}. The **MIDI** card lists the MIDI inputs, the output and Bluetooth devices. No MIDI input is on until you switch it on. The **Monitor** row counts what came in and went out. A red line under the output warns when a virtual bus, such as an IAC bus, is both an input and the output: switch the input off or send to another bus. See "MIDI and sync" in the installation guide.

The machine's own MIDI out reaches your DAW through the plug-in's MIDI output, and the standalone's MIDI output. It carries notes, controllers, program changes, pitch bend, pressure, clock, start, stop and continue. It never carries SysEx.

The machine's MIDI channels, sync and the rest of its global settings are on the GLOBAL panel. Click **GLOBAL** in the top bar, or choose **GLOBAL…** in the engine menu of the LCD.

{gap:MD-023}MIDI Thru has no meaning in the editor.{/gap}

### Audio inputs A and B

The **Input** card of the **AUDIO / MIDI** settings sets where the external audio comes from.

1. Choose a device under **Device**.
2. Watch **Level** for the signal.
3. Click **LIVE** to pass the input to the machine.

The input starts **MUTED**, so that a microphone and speakers cannot feed back. Keep speakers away from a microphone when it is live.

A track plays the input when its machine is one of the External input machines (INP). Choose one with the machine key on the Kit workspace.

![The AUDIO / MIDI settings](shot:md-audio-midi)

### Outputs

The machine has a main output and six individual outputs, A to F. Each track goes to one of them.

1. Open the Mix workspace.
2. Click **OUT** at the foot of a track's strip. The key reads OUT MAIN, OUT A, and on to OUT F, and each click goes to the next.

A track on A to F skips the master effects. The **Routing** card of the GLOBAL panel has the same 16 keys.

In a DAW the individual outputs appear as output buses of the plug-in, as far as the host offers them. The editor has no headphone output; use your DAW's or your system's.
