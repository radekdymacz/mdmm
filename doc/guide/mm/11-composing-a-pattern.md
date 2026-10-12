# 11. Composing a pattern
<!-- summary: Write notes in the piano roll or record them live, and copy, move and clear notes, pages, tracks and patterns. -->

You write a pattern on the **Sequence** workspace. Press {key:workspace-1}, or click the **Sequence** tab. The rail on the left holds the tracks. The piano roll in the middle shows the notes of the selected track, one column to a step. Under the roll are the rows for the envelope trigs, slide and swing, and under them the lock lane.

![The Sequence workspace](shot:mm-sequence-workspace)

## RECORDING PREPARATIONS
<!-- rows: MM-171 @32dbed -->

On the machine you select a kit, a track and the trig tracks before you record. In the editor you only select the track.

1. Click a track in the rail, or press {key:track-prev-next} to move to the track before or after.
2. Click **Synth** under the rail for the six synth tracks, or **MIDI** for the six MIDI tracks.

The roll shows the selected track. The field SEQ on the second line of the LCD also switches between SYNTH and MIDI.

## GRID RECORDING
<!-- rows: MM-172 MM-173 MM-174 MM-175 MM-176 MM-177 MM-178 @a4412d -->

On the machine you step through the grid with the trig keys. In the editor you draw the notes in the piano roll.

### Write notes

1. Make sure **Draw** is lit above the roll. Press [B] to turn it on or off.
2. Click the **Len** key to choose the length a new note gets: 1/16, 1/8, 1/4, 1/2 or 1 bar. Click for the next length. Hold [⇧] and click for the one before.
3. Click an empty step at the pitch you want. A note of that length goes in.
4. To change the pitch, drag the note up or down.
5. To fill steps, drag sideways. Every empty step the pointer crosses gets the note.

A drag, a paint or a run of rotates is one undo step. {key:undo} takes it back whole.

NOTE: With **Draw** dark, a drag in an empty place draws a box round notes and selects them, and a double-click adds a note.

![The piano roll](shot:mm-roll-draw)

The roll shows a range of pitches. Scroll the wheel over it to move the range. Hold [⇧] to move it an octave at a time. On a synth track the keys at the left of the roll play the pitch.

### Note length and NOTE OFF

Drag the end of a note to set its length. New notes take the length too. On a synth track a note sounds until the next NOTE OFF or the next trig of the track, so the editor writes a NOTE OFF where the note ends. On a MIDI track the editor writes the note's LEN, 6 to a step. A note can be drawn up to the next trig of its track. It can run past the end of the pattern onto its start, and the roll draws that part lighter.

To set a NOTE OFF by hand, hold [⌥] and click an empty step. A NOTE OFF is a yellow mark.

To delete a note, hold [⌥] and click it. The note before it keeps its length. Drag on with [⌥] held to delete every step the pointer crosses.

### Chords

Hold [⇧] and click the step at another pitch. The step holds a chord note. A chord on a MIDI track has one length for all its notes. A synth track plays a chord through its arpeggiator (chapter 15) or in poly mode.

### Rotate

Press {key:rotate} to move all the notes, slides and locks of the selected track one step earlier or later. They wrap round at the length of the pattern.

### Copy, clear and paste on the LCD

The LCD keys **Copy**, **Clr** and **Paste** act on the selected track. With no steps selected they act on the page shown (see "Track page copy"). With steps selected they act on the selection (see "Note copy").

NOTE: The machine also has a GRID RECORDING state. When the machine is stopped, **●** on the LCD turns it on, and the machine's own trig keys write steps. The editor reads the steps back. You do not need it to write notes.

## LIVE RECORDING
<!-- rows: MM-179 MM-180 MM-181 @ef0b73 -->

Live recording records the notes you play while the pattern runs.

1. Select a synth track.
2. Press {key:record}. The machine starts to play and to record. While the machine already plays, you can also click **●** on the LCD.
3. Play the computer keys: the white keys A to L and the black keys W E T Y U O P. Z and X move the octave, C and V the velocity.
4. Press {key:record} again, or click **●**, to stop recording.

The machine records each note on the step nearest to it. The notes appear in the roll.

{gap:MM-180}The editor records one key at a time. Draw a chord with [⇧]-click in the roll.{/gap}

To erase while you record, select the track and hold {key:live-erase}. This is the machine's [EXIT]. The notes of the track go on each step that plays while the key is down. The track's header is marked red. Let the key go to stop erasing.

NOTE: Wait until live recording stops before you select steps or open the step menu. The editor refuses them while it records.

NOTE: While the machine takes an edit on its SYSEX RECV screen, ● waits, as ▶ does: the LCD says the machine follows in a moment, and recording starts when the screen is free. Press ● again to cancel it.

NOTE: Values you turn while the pattern records are locked. See "Parameter locks in live recording mode" in chapter 13.

## STEP RECORDING
<!-- rows: MM-182 @f2e0cc -->

In step recording you play one note for each step, and the machine moves on by itself. The tempo does not matter.

1. Stop the machine and select a synth track. The machine writes only this track.
2. Hold [⇧] and click the record key, or choose **Step record** in the play key's menu. The record key shows STEP, and a red cursor on the roll marks the step, with the track and the step number.
3. Play a note with the computer keys or the keys left of the roll. The machine writes it to the step under the cursor, and the cursor moves to the next step.
4. Press {key:step-move} to move. → leaves a rest and moves on. ← goes a step back.
5. Press {key:step-clear} to clear the step under the cursor. The cursor moves on.
6. Press {key:step-done}, or click the record key, to stop.

Select another synth track while step recording is on, and the machine records that track from the same step.

You can also draw notes in the piano roll at any time.

## NOTE COPY
<!-- rows: MM-183 @da0485 -->

You copy notes with a selection of steps. A selection holds steps of one track or of several tracks.

1. Hold [⌘] and click a step in the roll or in the trig rows to select it. Hold [⌘] and drag to select a run of steps. A drag over the step ruler above the roll selects steps of the selected track without a key. Hold [⇧] and click the ruler to extend the selection.
2. Press {key:copy}, or click **Copy** on the LCD.
3. Select the step to copy to.
4. Press {key:paste}, or click **Paste**. The copy goes in with its first step on the selected step.

Notes, NOTE OFFs, envelope trigs, slides and locks go along. Other keys on a selection:

| Key | Does |
|---|---|
| {key:cut} | copy, then clear |
| {key:duplicate} | put a copy right after the selection; again for another |
| {key:select-all} | select every step of the six tracks shown |
| {key:sel-move} | move the selection one step |
| {key:sel-extend} | extend the selection one step |
| {key:deselect} | clear the selection |

Drag the selection with [⌘] held to drop a copy where you let go. A dashed frame shows where it lands. With **Draw** dark, drag the selected notes in the roll without [⌘] to move them.

Select a step or steps and click the small ⋯ on the selection for the step menu (a right-click on a step opens it too): note on or off, NOTE OFF, trigless, slide, a chord note, copy, cut, paste here, duplicate, clear, and fill every 2nd or 4th step from the one you clicked. Synth steps paste onto synth tracks, MIDI steps onto MIDI tracks.

NOTE: [⌘] is [CTRL] on Windows and Linux.

## CLEAR NOTE PARAMETER LOCKS
<!-- rows: MM-184 @bee19e -->

To clear the locks of one parameter on some steps, hold [⌥] and drag across the bars in the lock lane. Click the bin in the lane header to clear all the locks of that parameter. Hold [⌥] and click the bin to clear every lock of the track. A selected step cleared with {key:delete} loses its note and its locks together.

The machine's CLEAR NOTE LOCKS clears the locks of one note and keeps the note:

1. Select the step, or several steps, in the roll or the trig rows.
2. Right-click one of them and choose **Clear locks (keep the notes)**.

The notes stay. Press {key:undo} to get the locks back.

## TRACK PAGE COPY
<!-- rows: MM-185 MM-178 @06846c -->

A page is the 16 steps shown while **Page** is on. While **All** is lit, the page is the whole pattern. With no steps selected, the LCD keys copy and paste the page shown of the selected track.

1. Show the page to copy.
2. Click **Copy** on the LCD. The steps, slides and locks of the page are copied.
3. Show the page to paste into. It can be on another track of the same kind.
4. Click **Paste**.

Pages paste between synth tracks or between MIDI tracks, not between the two. A lock for a parameter the target machine does not have is skipped, and the page says how many.

To paste into several tracks at once, hold [⇧] and click the tracks in the rail. The marked tracks light. Press {key:paste}. The page goes into every marked track as one undo step. Press [ESC] to unmark.

## CLEAR TRACK PAGE
<!-- rows: MM-186 @ceea17 -->

Click **Clr** on the LCD with no steps selected. The notes, slides and locks of the page shown on the selected track go. {key:undo} takes it back.

## TRACK COPY
<!-- rows: MM-187 @c4beb7 -->

1. Drag across the whole step ruler to select all the steps of the selected track.
2. Press {key:copy}.
3. Click the target track in the rail, then click the first step of the ruler.
4. Press {key:paste}.

Press {key:select-all} to select the six tracks shown, and paste them as a block. To copy the machine of a track, use **Copy** and **Paste** on the **Sound** workspace.

To copy a whole track with its machine, its arpeggiator, its transpose and its swing in one copy, use **Copy…** in the LCD's **▾** menu: see "Super copy".

## CLEAR TRACK
<!-- rows: MM-188 @ca1110 -->

Select all the steps of the track with the ruler and press {key:delete}. To clear every lock of the track, hold [⌥] and click the bin in the lane header.

To clear the whole track, or only some of its parts, use **Clear…** in the LCD's **▾** menu: see "Super clear". **Clr** clears the page shown.

## PATTERN COPY
<!-- rows: MM-189 @ffa0ae -->

A pattern copy takes the whole pattern: the notes, locks, MIDI notes, the arpeggiator, transpose, swing and slide, and the link to the kit.

1. Open the pattern chooser: click the pattern field of the LCD.
2. Click the slot to copy, then **Copy**.
3. Click the target slot, then **Paste**.

You can also drag a slot onto another slot to copy it there.

NOTE: A pattern paste goes through the machine's SYSEX RECV. The editor does that by itself. With a real Monomachine over MIDI the sync field on the second line of the LCD shows SEND and the number of waiting edits. See chapter 19, "File".

## CLEAR PATTERN
<!-- rows: MM-190 @83c282 -->

In the pattern chooser, click the slot and then **Clear**. Or, on **Sequence**, press {key:clear-pattern}.

Both clear the notes and locks of every track. The pattern keeps its link to the kit, as on the machine.

## SUPER COPY
<!-- rows: MM-191 @7ac3db -->

Super copy copies the parts of a track you choose, over every step of the pattern.

1. Select the track in the rail.
2. Click **▾** at the right of <COPY> <CLR> <PASTE> on the LCD, then **Copy…**, or press {key:copy-what}. The **Copy what** window opens.
3. Tick the parts. **Pattern** has **Notes**, **Melody**, **Slide**, **Swing**, **Locks**, **Arp** and **Transpose**. **Kit** has **Machine + sound** (a synth track's).
4. Click **Copy**.
5. Select the track to paste into. Click **▾**, then **Paste…**, or press {key:paste-what}.
6. The parts copied are ticked. Under **To tracks** the selected track is lit, or the tracks marked for paste. Click a track key to light or unlight it.
7. Click **Paste into 1 track** (the key says how many). The paste is one undo step.

**Notes** takes the trigs, the envelope trigs, the NOTE OFFs and the pitches. **Melody** takes only the pitches: they go onto the trigs the target track already holds, and a step with no trig stays empty.

NOTE: A synth track's parts paste onto synth tracks, a MIDI track's parts onto MIDI tracks. The keys of the other kind are off. Locks land only on steps that hold a trig.

![Copy what](shot:mm-copy-what)

## SUPER CLEAR
<!-- rows: MM-192 @8f9cc0 -->

1. Select the track in the rail.
2. Click **▾** at the right of <COPY> <CLR> <PASTE>, then **Clear…**, or press {key:clear-what}.
3. Tick the parts to clear and click **Clear**.

Clearing **Notes** clears their locks too. **Melody** leaves the trigs without a pitch. **Swing** goes back to every second 16th step, as in a new pattern. **Arp** turns the arpeggiator off and keeps its settings. **Machine + sound** makes the track GND-SIN.

The window remembers what you ticked the last time. Press {key:undo} to take the clear back.
