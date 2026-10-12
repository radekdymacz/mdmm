# 17. Beyond the hardware
<!-- summary: What the editor does that the Machinedrum itself does not have, or does in its own way. -->

The editor runs the real Machinedrum operating system and adds a few things around it. This chapter describes them.

## MACHINE MEMORY
<!-- rows: MD-X01 @152d0b -->

A Machinedrum keeps what you save when you switch it off: its kits, patterns, songs, globals and samples stay in its memory. The editor does the same. When you save on the machine, the editor writes what you saved to a file on your computer, slot by slot. A new session starts from factory memory with the saved slots put back in.

Only a save writes the file: a kit, pattern, song or global stored into its slot. That is SAVE KIT, a change to a pattern (the machine stores pattern edits as you make them), SAVE SONG, a change to a global, a SysEx dump the machine takes in. A sample you load in the Sampler is a save too, written once the machine has stored it. It makes no difference whether you save in the editor or on the machine's own keys. The editor writes the file a second or two after the save. Turning a knob, automation from a DAW and changes to the kit that plays that you have not saved write nothing, and neither does playing. A tempo change is saved with its global, as on the machine; in a DAW, where the machine follows the DAW's tempo, the tempo is never saved.

A new session is a new plug-in in a DAW project, a new DAW project, or a start of the standalone editor. It has every slot you saved, wherever you saved it. The standalone editor also keeps the kit that played when you quit it, with its unsaved changes.

NOTE: A DAW project keeps its own memory. When you open a saved project, the machine starts with the memory of that project, not with the file. A save you then make in that project goes to the file too, and only the slot you saved.

### Start from factory memory

1. Choose **RESET MACHINE…** in the engine menu, the drop-down at the left of the LCD.
2. Click **Start from factory memory…**. The editor asks a second time. **Cancel** leaves the saved memory as it is.
3. Click **Start from factory memory**. The machine restarts with its factory memory, as on a new install, and the saved memory file is deleted. This takes a few seconds.

New sessions now start from factory memory until you save again. The reset has no undo: click **Export SysEx…** in the question first to keep a way back.

### Turn it off

Choose **KEEP MEMORY: ON** in the engine menu. It reads **KEEP MEMORY: OFF**, and new sessions start from factory memory. The editor no longer writes the file. The file stays, so when you turn it on again, new sessions start with the memory you saved before.

![The engine menu with KEEP MEMORY and RESET MACHINE](shot:e2e-md-engine-memory)

### Two editors at once

Two Machinedrum editors open at the same time, in one DAW project or in two, share the same file. Each writes the slots it saves and leaves the others. When two editors save the same slot, the last save wins.

### When the file cannot be used

The file is written in one step, so a crash leaves the old memory or the new one. If the file is damaged, the machine starts from factory memory and the editor says so. It keeps the file beside the new one as machine-memory.unusable with the date and time in its name, and your next save writes a new memory file. If the file was written by a newer editor, the editor leaves it as it is and saves nothing over it. It says so; move the file away to save again.

If the editor cannot write the file, because the disk is full or the folder is read only, it says so and keeps the old file. It tries again at your next save and when it closes. Your saves stay in the session. The standalone editor starts with them next time, not with the old file, and writes them then.

The file is machine-memory.bin in the memory folder of the editor's data folder: Documents/Gearmulator Preview/Machinedrum/memory. It holds the slots you saved and the samples you loaded, nothing else. Samples saved with another ROM are kept in a file of their own when you save a sample with this one. It holds no firmware.

## FACTORY SONGS PLAY
<!-- rows: MD-X02 @8aa428 -->

The songs of factory memory are in the editor, and they play. The arrangement follows what the machine plays. See "LOAD SONG" in chapter 9.

1. Click the **Song** tab.
2. Click a slot that holds a song, such as UW DEMO, and click **Load**.
3. Click **SONG** over the pattern palette. The machine is in song mode.
4. Press {key:play-stop}. The step moves, and the song goes on from row to row. The output is not silent.
5. Press {key:play-stop} again. The song stops.

## FACTORY PATTERNS PLAY
<!-- rows: MD-X03 @fb73fc -->

The patterns of factory memory are in the editor, and they play. See "PATTERN QUEUE AND CHOOSER" below.

1. Click the pattern on the LCD. The chooser opens.
2. Click a pattern that holds trigs. The kit of the pattern loads with it.
3. Press {key:play-stop}. The step moves through the pattern and the output is not silent.
4. Press {key:play-stop} again, and choose another pattern the same way.

## WHAT YOU DRAW PLAYS
<!-- rows: MD-X24 @b7b866 -->

What you draw in the grid is what the machine plays. Four trigs drawn in an empty pattern sound when you press play, a cleared pattern plays silence, and an undo brings the trigs back.

![Four trigs drawn on track 1 of an empty pattern](shot:md-real-sequence-drawn)

1. Click the **Sequence** tab.
2. Click the pattern on the LCD and choose a pattern with no trigs.
3. Pick a track on the rail.
4. Click four steps on that track. Each becomes a trig.
5. Press {key:play-stop}. The position moves through the pattern and the track sounds.
6. Press [⌥] [DELETE]. The pattern is cleared.

![The same pattern after the clear](shot:md-real-sequence-cleared)

7. Press {key:play-stop} again. The position moves and nothing sounds.
8. Press [⌘] [Z] once. The four trigs are back, and they play again.

## GEN ROLLS A RHYTHM
<!-- rows: MD-X04 @ea987e -->

The machine has no such function: you set every hit by hand. The **GEN** bar on the **Sequence** workspace rolls a rhythm for the selected track from a few settings. **Random** rolls a new one, **Defaults** sets the generator the track's sound suits, and **Hits** says how many hits it holds. The key [R] rolls too. A whole roll is one undo step.

## MUTATE CHANGES A SOUND
<!-- rows: MD-X05 @d98851 -->

The machine has no such function. **MUTATE** in the **GEN** bar nudges the sound of the tracks at random. The scope chips choose what moves, and the amount says how far. A mutation is one undo step.

![MUTATE on the Sound workspace with only the effects chip lit](shot:e2e-md-gen-mutate-scope)

1. Click the **Sound** tab and pick a track on the rail.
2. In **MUTATE**, switch the **FX** chip on and the **SYN** chip off. Only the effects move.
3. Raise the amount by one step.
4. Click **Random**. The effect values of the track change and the synth values stay.
5. Press [⌘] [Z]. The sound is as it was.

To mutate and roll together, pick a drum track on the **Sequence** workspace and click **Random** in the **GEN** bar until the rhythm changes. Then click the **Sound** tab and **Random** in **MUTATE**. Click **UNDO** once: the sound is back. Click it again: the rhythm is back.

## SOLO
<!-- rows: MD-X06 @3a9a39 -->

Solo plays one track alone. The mutes you had come back when you let go.

![The Mix workspace with some tracks muted and one soloed](shot:e2e-md-mix-mute-solo)

1. Click the **Mix** tab.
2. Drag across the **M** keys of four tracks. All four are muted.
3. Click **S** on another track. That track plays alone.
4. Click **S** again. The solo ends, and the four mutes are still set.

## UNDO AND REDO
<!-- rows: MD-X07 @4bfdaf -->

The machine cannot take an edit back. In the editor every edit can be taken back and done again, across kits, patterns and songs.

![The UNDO and REDO keys in the top bar](shot:e2e-md-top-undo-redo)

1. Click an empty step on the **Sequence** workspace. It becomes a trig.
2. Press {key:undo}. The trig goes.
3. Press {key:redo}. The trig is back.
4. Click **UNDO** in the top bar to take it back again, and **REDO** to put it back.

A drag, a paint or a run of rotates is one step. Each typed value is one step.

## TYPED VALUES
<!-- rows: MD-X08 @76814e -->

Type a value into a knob instead of turning it.

![A typed value in the Sound workspace](shot:e2e-md-sound-type-value)

1. Click the **Sound** tab and pick a track on the rail.
2. Click a value box with [⌘] held, or focus it and press [ENTER]. A field opens over the box with the value it shows.
3. Type a value and press [ENTER]. The box shows it, and the machine has it.
4. A value out of range, such as 128, is refused. The field stays open and nothing is sent.
5. Press [ESC] to close the field. The value is as it was.

With a value focused, the up and down arrow keys step it. Each typed value is one undo step.

## THE STEP MENU
<!-- rows: MD-X09 @ea5076 -->

Right-click a step for its menu: accent or slide, copy, paste and fill.

![The step menu](shot:e2e-md-seq-step-menu)

1. Click the **Sequence** tab and pick a track on the rail.
2. Click an empty step to make a trig.
3. Right-click the step. Its menu opens. The **⋯** on the selected step opens the same menu.
4. Choose **Accent**. The step is an accent.
5. Right-click the step again and choose **Copy**.
6. Right-click an empty step and choose **Paste here**. The trig lands there.
7. Right-click an empty step and choose **Fill every 2nd from here**. Every second step from there comes on. {key:undo} takes it back.

## SELECT, COPY AND PASTE STEPS
<!-- rows: MD-X10 @fa67a4 -->

Select steps with the mouse, then copy, paste and clear them, on one track or on several. [⌘] click a step to select it, [⌘] drag to select a block. Use **Copy**, **Paste** and **Clr** in the top bar, or {key:copy} and {key:paste} on the keyboard. See "NOTE COPY" in chapter 8.

1. Click the **Sequence** tab and pick a track on the rail.
2. [⌘] click a step with a trig. It is selected.
3. Press {key:copy}, or click **Copy** in the top bar.
4. [⌘] click an empty step of the same track.
5. Press {key:paste}, or click **Paste**. The trig lands on the selected step.
6. [⌘] drag from step 1 of a track to step 4 of the next. The block is selected.
7. Press {key:duplicate}. The block appears again on steps 5 to 8.
8. Click **Clr**. The selected block is cleared and nothing else.
9. Press [ESC]. The selection goes.
10. Press {key:undo} three times. Both tracks are as they were.

To paste into several tracks, copy a track and click the headers of two other tracks with [⇧] held. Press {key:paste}: both tracks get the steps, and one {key:undo} takes both back.

## COPY, PASTE AND CLEAR WHAT
<!-- rows: MD-X11 @e33e53 -->

A copy, a paste or a clear can take only part of what a step holds. The **what** menu on **Copy**, **Paste** and **Clear** chooses: trigs, locks, the sound, or the whole track. The keys {key:copy-what}, {key:paste-what} and {key:clear-what} open it from the keyboard.

## DROP A FILE ON THE WINDOW
<!-- rows: MD-X12 @1ce61e -->

Drop a SysEx file on the editor to open it in the import preview. On the Machinedrum you can drop a WAV or AIFF sample on the **Sampler** too. Drag and drop works on macOS only. See "GENERAL SYSEX RECEIVE" in chapter 10 and "SPECIFIC PLACE SAMPLE RECEIVE" in chapter 11.

To open a SysEx file:

1. Drag the .syx file onto the editor window. The **Import SysEx** panel opens with the preview of the file.
2. Click **Cancel**. The panel closes and nothing is sent.

To load a sample:

1. Click the **Sampler** tab.
2. Click an empty ROM slot.
3. Drag the WAV file onto the waveform of the slot. The editor sends it, and the slot holds the sample.

![A sample dropped on ROM slot 33](shot:e2e-md-drop-sample)

## SYSEX IMPORT WITH A PREVIEW
<!-- rows: MD-X13 @1ada43 -->

Choose **IMPORT SYSEX…** in the engine menu to look inside a SysEx file before you send it. You tick the kinds, choose where each goes and read the report. The steps are in "GENERAL SYSEX RECEIVE" in chapter 10.

## MIDI NOTE LIGHTS
<!-- rows: MD-X14 @9da4be -->

The track you play from a MIDI keyboard lights on the track rail and in the mixer.

![The track rail and the mixer light of a track that plays](shot:e2e-md-sound-note-light)

1. Click the **Sound** tab.
2. Play the note of track 3 from a MIDI keyboard on a channel other than the base channel. No track lights.
3. Play it on the base channel. The number of track 3 on the rail lights for a moment, then goes out.
4. Click the **Mix** tab and play track 3 again. Its light on the strip lights and no other does.

The notes that play each track are set in "MAP EDITOR" in chapter 10.

## THE CPU METER AND THE SPEED-UPS
<!-- rows: MD-X15 @ca9b71 -->

The machine has no such function. A meter after the version in the top bar shows how much of the audio time the emulation takes. Click the meter for its details: the average, the worst block, the machine's speed and the speed-ups. The speed-ups are switched in the Developer menu.

1. Look at the meter after the version in the top bar. It reads a share of the audio time.
2. Press {key:play-stop}. While the machine plays, the meter moves.
3. Click the meter. Its details open under it: the average, the worst block, the machine's speed, the rate and block size, and the speed-ups.
4. The details follow the meter while they are open. Press [ESC] to close them.
5. Open **Developer** and choose **Speed-ups**. The tick turns, and the machine runs with the speed-ups off. Choose it again to turn them on.
6. In the details of the meter, **Speed-ups (each)…** lists every lever. Switch one off and on again.

## THE OUTPUT METER AND VOLUME
<!-- rows: MD-X16 @5888f9 -->

Two bars and a volume line sit at the right end of the LCD. The bars show the left and right peaks of the output. The line sets the volume of the editor.

![The output meter and volume at the end of the LCD](shot:e2e-md-lcd-volume)

1. Drag the meter down. The volume falls, and the readout under the LCD says so while it changes. The readout goes a moment after.
2. Scroll up one notch to raise it by 1 dB.
3. Drag it to the foot to turn the output off.
4. Double-click the meter to go back to 0 dB.
5. Press {key:play-stop}. The bars follow the sound.

## THE EDITOR'S MENU
<!-- rows: MD-X17 @4b7ee6 -->

A right-click menu holds the zoom, the updates and the developer switches.

![The editor's menu](shot:e2e-md-top-editor-menu)

1. Right-click an empty part of the header, or the track rail. The menu opens with the editor's name and version.
2. Focus **Zoom** and press the right arrow key. Its steps open.
3. Click a step. The menu closes and the page zooms. Open the menu again: **Zoom** names the new step.
4. Click **Updates**, then **Check Daily**. Open **Updates** again: the tick has turned.
5. Press [ESC] to close a submenu, and [ESC] again to close the menu.

## THE KEYBOARD VIEW
<!-- rows: MD-X18 @297ddb -->

The keyboard view draws the computer keyboard with the words of each key and a search.

![The keyboard view](shot:e2e-md-keys-help)

1. Press {key:keys-help}, or click **?** in the top bar. The keyboard view opens.
2. Click the [⌥] / [FN] layer to see the keys of that layer.
3. Click a key on the drawn keyboard. Its job is written in words.
4. Type "undo" in the search. The key [⌘] [Z] is marked and the list keeps the undo keys.
5. Press [ESC] to close it.

## THE COMPUTER KEYBOARD PLAYS
<!-- rows: MD-X19 @7969ed -->

The two rows of letter keys play the selected track, on any workspace.

1. Pick a track on the rail.
2. Press [A]. The track plays.

## TAP TEMPO
<!-- rows: MD-X20 @124c24 -->

Tap a key to the beat to set the tempo.

1. Press [B] or [T] five times in time. Or press {key:tap-tempo-shift}, which taps on every workspace.
2. The tempo field takes the tempo you tapped. Taps half a second apart read about 119 beats per minute.

See "TAP TEMPO" in chapter 8.

## PATTERN QUEUE AND CHOOSER
<!-- rows: MD-X21 @c89c1c -->

Pick any of the 128 patterns from the chooser. A pattern chosen while the machine plays waits for the end of the pattern that plays.

![The pattern chooser](shot:md-pattern-chooser)

1. Click the pattern on the LCD. The chooser shows 8 banks of 16. A slot with no trigs says EMPTY. Every other slot gives its length and kit.
2. Press a bank letter, or click the key of a bank. The selection moves to that bank.
3. Click a pattern. With the machine stopped, it switches at once.
4. Press {key:play-stop}. While it plays, click **›** on the LCD. The next pattern is queued, and it starts at the end of the one that plays.
5. Move to a pattern with trigs and click **Copy**. Move to another and click **Clear**. Its tile says EMPTY. Click **Paste**. The slot has the steps and the kit link of the copy.
6. Press {key:undo} twice to bring the slot back. Press [ESC] to close the chooser.

## KIT AND SONG SLOTS
<!-- rows: MD-X22 @740aec -->

The kit library and the song slots load, copy, paste, rename and clear a slot. Each is one undo step.

![The kit library after a copy](shot:e2e-md-lib-kit-copy-paste-undo)

### Kit slots

1. Click **KIT** on the LCD. The kit library opens.
2. Click a slot with [⌥] held. It is selected and not loaded.
3. Click **Copy**. [⌥] click another slot and click **Paste**. Answer **Overwrite** when the editor asks.
4. Press {key:undo}. The slot is back.
5. To rename, click **Rename**, type a name, press [ENTER] and answer the question.
6. To clear, select a slot and press [DELETE]. It is cleared as the machine clears it. {key:undo} brings it back.

### Song slots

1. Click the **Song** tab. Click an empty song slot. It is selected, and the machine's song stays.
2. Click **Load** to make the machine play that slot's song.
3. Press [F2], type a name and press [ENTER]. The slot is named.
4. Click **Copy**, select another slot and click **Paste**. The song is there, with no question.
5. Drag a slot onto an empty one to copy it.
6. Select a slot and click **Save to…**, type a name and press [ENTER]. The machine's song is saved there.
7. Click **Clear**. The editor asks first. Answer **Clear song**. The slot is empty and quiet.
8. Press {key:undo}. The song is back. Press {key:redo} to empty it again.
