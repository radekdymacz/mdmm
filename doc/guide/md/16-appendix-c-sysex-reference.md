# 16. Appendix C: sysex reference
<!-- summary: The system exclusive messages of the Machinedrum, and the part of the editor that sends or reads each. -->

The Machinedrum is also edited by system exclusive messages. A message has a number, which the machine's own appendix lists in hexadecimal. A dump carries a whole object, a kit, a pattern, a song or a global. A request asks the machine for one. The other messages change one thing, such as a tempo or a routing.

You never send these by hand. The editor sends and reads them for you, and this chapter says where. The numbers are written for reference.

## KITS
<!-- rows: MD-279 MD-280 @2284d3 -->

A kit dump is 0x52 and its request 0x53. The kit library and the whole page use them. A kit moves between the editor and the machine as a dump.

Set kit name is 0x55. **Rename** in the kit library sends it.

To see the kit messages work:

1. Click <KIT> on the LCD. The kit library opens.
2. Alt-click a slot. It is selected, not loaded.
3. Click **Copy**, Alt-click another slot and click **Paste**. Answer **Overwrite** when the editor asks. Press {key:undo} and the slot is back as it was.
4. Double-click the current kit, type a name and press [Enter]. The working kit is renamed and not saved yet.
5. Click **Save**. The slot holds the new name.

## GLOBALS
<!-- rows: MD-281 MD-282 @35728a -->

A global dump is 0x50 and its request 0x51. The **GLOBAL** panel shows the global the machine reported: its slot, its base channel and its sync settings.

Set active global is 0x56. The slot keys in the **GLOBAL** panel send it.

1. Choose **GLOBAL…** in the engine menu.
2. Click another global slot key. The active global of the machine is that one.
3. Click the key of the first slot again to put it back.

## LOADING AND SAVING
<!-- rows: MD-283 MD-294 @cde8ac -->

Load pattern is 0x57, load kit is 0x58 and save kit is 0x59. The pattern chooser and the kit library send them.

Save song is 0x6d. **Save** in the Songs column sends it.

1. Click <KIT> on the LCD. Click another kit. It loads at once.
2. Alt-click a third kit. It is selected, not loaded.
3. Click **Save as**. The editor asks before it overwrites. Click **Overwrite** and the kit is saved into that slot.
4. Click the pattern on the LCD, then another pattern. With the machine stopped, it switches.

## NOTE MAP
<!-- rows: MD-284 MD-289 @3a4306 -->

Set MIDI note mapping is 0x5a. The map editor in the **GLOBAL** panel sends it when you change the note of a track.

Reset MIDI note map is 0x64. **Reset map** sends it. The editor asks first, and {key:undo} takes it back.

## SOUND SETTINGS
<!-- rows: MD-285 MD-286 MD-287 MD-288 MD-290 @f993f1 -->

These messages change one part of the sound.

- Assign machine is 0x5b. The machine picker on the **Kit** workspace sends it.
- Set track routing is 0x5c. The **OUT** key of a track on the **Mix** workspace sends it, and so does the routing in the **GLOBAL** panel.
- The Rhythm Echo, Gate Box, Master EQ and Dynamix messages are 0x5d to 0x60. The cards of the **Mix** workspace send them.
- Set tempo is 0x61. Dragging the <TEMPO> field in the LCD sends it.
- Set LFO is 0x62. The LFO cards of the **Kit** workspace send it.
- Trig group is 0x65 and mute group is 0x66. **Mute** and **Trig** in the relations of the **Kit** workspace send them.

## PATTERNS AND SONGS
<!-- rows: MD-291 MD-292 MD-295 @83e43c -->

Pattern dump is 0x67 and its request 0x68. The editor uses them for the whole page, and the pattern chooser shows what they hold.

Song dump is 0x69 and its request 0x6a. Load song is 0x6c. The **Song** workspace uses them. A song slot you click is only selected. **Load** puts the machine's song in the editor.

Status request, set and response are 0x70 to 0x72. The editor reads the machine's mode with them. Click <PLAY> on the second line of the LCD and the machine's mode is SONG. Click it again to go back to PATTERN.

## NOT IN THE EDITOR
<!-- rows: MD-293 MD-296 @337de9 -->

Set receive position is 0x6b. The editor does not send it. When you import a SysEx file, the editor places the items itself.

The TurboMIDI speed messages are 0x10 to 0x17. They belong to the hardware link and the editor has no control for them.
