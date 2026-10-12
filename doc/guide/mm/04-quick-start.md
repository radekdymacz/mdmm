# 4. Quick start
<!-- summary: Pick a pattern, play it, play the keyboard, draw notes, record live and lock a value on a step. -->

This chapter takes you through the first things you do with the machine: choose a pattern, hear it, change it and record into it. Each part gives the steps in the editor and says where they differ from the Monomachine's panel. The editor must be running with the firmware image loaded, and the LCD must show the kit and the pattern.

## SELECTING AND PLAYING
<!-- rows: MM-070 MM-071 MM-072 @630393 -->

A pattern recalls the kit it was saved with. When you pick a pattern, the machine loads its kit.

1. Click the <PATTERN> field in the LCD. The pattern chooser opens: 8 banks, A to H, of 16 patterns.
2. Click a pattern. Stopped, the machine switches at once. Playing, it queues the pattern and starts it when the current pattern ends. The name in the LCD blinks while it waits.
3. To switch at once while the machine plays, hold [⇧] and click, or click **Now**.
4. Press {key:play-stop}. The machine plays and the <POSITION> field counts.
5. Press {key:pause} to pause, and again to go on. Press {key:play-stop} to stop.

You can also step through patterns with the **‹** and **›** keys beside the name.

![The pattern chooser](shot:mm-pattern-chooser)

NOTE: The OS loads the kit of a pattern only for the patterns in banks A to D. In banks E to H the kit that played stays. When you pick an A to D pattern with kit edits that are not saved, the editor asks first and offers to save the kit, to switch and let the machine keep the edits in its UNDO KIT, or to cancel.

Press {key:play-stop} again to stop.

## PLAYING IN MULTI TRIG
<!-- rows: MM-073 @8763d6 -->

In multi trig mode one source plays all six tracks. To use it:

1. Go to the **Perform** workspace ({key:workspace-4}).
2. In the **Keyboard** card, click **Multi trig**.
3. Click or drag across the on-screen keyboard. Every track plays the note. The lamps below the keyboard flash for each track that sounds.

Multi trig takes its notes on MIDI channel 7. Chapter 5 describes the other keyboard modes.

## EXPLORING A PATTERN
<!-- rows: MM-074 @107be5 -->

Play the pattern and listen to each track.

1. Click a track in the rail to select it.
2. Press {key:mute-track} to mute it, or **S** in its rail row to solo it.
3. Go to the **Sound** workspace ({key:workspace-2}) and drag the values of the track. The sound changes as you drag.
4. Play the track from your keyboard with {key:piano-white}.

The piano roll plays the pitch of a note when you click it.

## GRID RECORDING
<!-- rows: MM-075 MM-076 MM-077 MM-078 @8d56a9 -->

In grid recording you place notes on the steps of a pattern one by one. The machine does this with the TRIG keys. In the editor you draw in the piano roll of the **Sequence** workspace.

1. Go to the **Sequence** workspace ({key:workspace-1}) and select a track.
2. If you want the pattern's own kit, open the kit library and load it: click <KIT>, choose a kit, click **Load**. Chapter 6 describes the library.
3. Check that **Draw** is lit. Press {key:roll-draw} to switch it.
4. Click an empty step in the roll. A note goes on it, as long as the **Len** key says.
5. Drag the new note up or down to change its pitch.

To paint the same note on several steps, drag sideways. The steps you cross get the note. A drag is one undo step.

To place a note off, which stops the sound at a step, hold [⌥] and click an empty step. You can also drag the end of a note: the note's length is the distance to its NOTE OFF.

For a chord note on a step, hold [⇧] and click the roll there. Right-click a step for the step menu (Ctrl-click on a Mac). It offers a note on or off, NOTE OFF, trigless, slide and a chord note.

## LIVE RECORDING
<!-- rows: MM-079 MM-080 @fe3ff1 -->

In live recording you play the keys while the pattern runs, and the machine writes the notes to the steps that play. The firmware quantises them.

1. Select the track to record.
2. Press {key:record}. The machine starts if it was stopped, and the record light comes on. Clicking the record key while the machine plays does the same.
3. Play with {key:piano-white} or the on-screen keyboard.
4. Press {key:record} again to stop recording.

To erase while recording, hold {key:live-erase}, the machine's [EXIT]. The selected track's notes go on each step that plays while the key is down.

## PARAMETER LOCKS
<!-- rows: MM-081 MM-082 MM-083 @5c39c9 -->

A parameter lock gives one parameter a value of its own for one step.

### Lock a value

1. In the **Sequence** workspace, click a page tab in the rail, for example FLT.
2. Click the parameter, for example BASE. The lock lane under the roll now edits it.
3. Drag over the bars of the lane. Each step with a trig gets a lock with the value where you dragged.
4. To draw a straight line of values, hold [⇧] and drag.
5. To set a locked value from the keys, turn the wheel over a lock step. Each notch is 4, and [⇧] makes it 1.

The <LOCKS> field of the LCD counts the locks of the pattern, out of 62.

### Lock live

While live recording plays, turn a value on the **Sound** workspace. The machine records the value as a lock on the step that plays when the value arrives. The editor marks that step in the trig row and in the lock lane, for about three seconds, and a note says which value it locked.

### Remove locks

- Hold [⌥] and drag over the lane to erase the locks of one parameter.
- The clear key in the rail header clears the locks of the parameter you are looking at. Hold [⌥] and click it to clear every lock of the track.
- Right-click a step and choose **Clear locks (keep the notes)**. The step loses its locks and keeps its note. On a selected step it works on the whole selection.
- Select a step and press {key:delete}. The step loses its note, its slide and its locks together.
