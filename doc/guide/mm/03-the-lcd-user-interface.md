# 3. The LCD user interface
<!-- summary: What the fields of the LCD in the top bar show, and where the rest of the machine's screen went. -->

The machine's screen shows the tempo, a level bar, eight parameter circles, four position boxes, the kit and the pattern. The editor's LCD is a strip in the top bar. It shows the same state: the fields that matter all the time stay in view, and the parameters of the screen live in the workspaces.

![The LCD in the top bar](shot:mm-lcd)

The LCD has two lines. The first line, from the left: the engine menu, the record and play keys, <TEMPO>, <POSITION>, <PATTERN>, <KIT> and <LOCKS>. The second line changes with the workspace. At its right end it has the sync field, then the keys <COPY>, <CLR> and <PASTE>.

## LCD
<!-- rows: MM-013 MM-061 MM-062 MM-063 MM-064 MM-065 MM-066 MM-067 MM-068 @780ec5 -->

### Tempo

<TEMPO> shows the tempo in beats per minute, with one decimal. Drag it up or down to change it. When the host sets the tempo, the field is marked as the DAW's tempo and refuses edits. This is the editor's counterpart of the EXT the machine shows when it follows an external clock.

### Level and parameters

The machine's level bar is the **LEVEL** fader of the **Mix** workspace. The eight parameter circles with their names are the value boxes of the **Sound** workspace. Each box has the parameter's name and its value.

### Position

<POSITION> shows the playback position as bar and step, for example 02.05. It reads --.-- when the machine is stopped. In the **Sequence** workspace, four lights beside the **Page** key show which pages the pattern has and the page shown, and a playhead runs across the steps.

### Status

The record key and the play key light while the machine records and plays. The play key reads a triangle when stopped and a square when playing. {gap:MM-065}The editor has no pause state.{/gap}

### Kit

<KIT> shows the number and the name of the current kit, for example K01 MONOMACHINE. Beside the label a small field reads saved or edited. It reads edited when the values of the kit differ from the kit saved in its slot on the machine. Click the field to open the kit library.

### Pattern

<PATTERN> shows the current pattern, A01 to H16. The **‹** and **›** keys beside it step to the pattern before or after. Click the name to open the pattern chooser. A pattern that waits for the end of the current one blinks.

### Machine

The machine of the selected track is named in its row of the track rail and in the header of the **Sound** workspace. The header is also the machine picker: click it to change the machine.

### Locks

<LOCKS> counts the locked parameters in the pattern, out of 62. The Monomachine shares those 62 between all twelve tracks. The field warns when you near the limit.

### Sync

The sync field at the right of the second line reads Sync when the editor and the machine agree. It reads RECV while the emulator takes a dump from the editor. With a real machine it reads SEND and a number when edits wait to go to it. Click it to send them.

## LAYER EDIT AND WINDOWS
<!-- rows: MM-069 @a48c77 -->

On the machine, windows open over the screen and the keys below them stay live. In the editor, dialogs open over the page with their own buttons. The kit library, the pattern chooser, the machine picker and the GLOBAL and AUDIO / MIDI panels are windows of the page. Press {key:close-dialog} to close a dialog or panel.
