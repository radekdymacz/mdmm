# 15. Appendix B: MIDI control reference
<!-- summary: The note map and the control change numbers the Machinedrum answers to, and where the editor sets them. -->

The Machinedrum is played and edited over MIDI. This chapter says which notes play which track and pattern, which control changes move the sound parameters, and which move the level and the mute of a track. The editor keeps to the machine's own messages, so a keyboard or a DAW that plays the machine plays the editor.

## NOTE MAP
<!-- rows: MD-276 @3e2712 -->

By default the 16 tracks answer to notes from C2 upwards, one note a track. The 128 patterns answer to notes from E4 upwards, one note a pattern.

To see or change the map:

1. Choose **GLOBAL…** in the engine menu.
2. Find the map editor in the panel. Each track has a note.
3. Click the note of a track up or down. The track plays from the next note.
4. Click a track's **LEARN** dot to set the note by playing it. The head of the panel asks you to play a note. Play it on a MIDI keyboard. The track takes that note and the dot goes out.
5. Click **Reset map**. The editor asks first. Answer, and the tracks play from C2 and the patterns from E4 again.
6. Press {key:close-dialog} to close the panel.

TIP: {key:undo} takes back a change to the map.

## CONTROL CHANGES
<!-- rows: MD-277 @10cc2d -->

The sound parameters of the 16 tracks are reached by control change messages. The machine uses four MIDI channels, starting from its base channel, and each channel serves a group of four tracks. Every parameter of a track has its own control change number.

In the editor you do not type these numbers. When you move a value on the **Kit** workspace, the editor sends the control change for it. A move on a track of each group of four, tracks 1, 5, 9 and 13, reaches the machine through its own channel.

The editor also learns a controller of your own from the one you move, through its Control page.

## LEVEL AND MUTE
<!-- rows: MD-278 @52366f -->

Each track has its own control change for its level. The mute of a track is a control change of its own too.

1. Click the **Mix** tab.
2. Drag the <LEV> box of a track. The level control change goes out with each move.
3. Double-click the box. It reads 100.
4. Click **Undo** until the level is back.

The mute keys of the editor act on the machine's own memory of the mutes.

