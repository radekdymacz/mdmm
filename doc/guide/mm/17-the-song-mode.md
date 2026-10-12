# 17. The song mode
<!-- summary: Arrange patterns into songs of up to 200 rows, with repeats, transposes, parts, mutes, tempo changes and loops. -->
<!-- rows: MM-251 MM-252 @33be60 -->

The song mode plays patterns in a set order. Each row of a song names a pattern and how it plays: how many times, transposed or not, the whole pattern or a part of it, with some tracks muted, at a tempo of its own. Command rows loop back, jump forward or halt the song. Use a song for a finished arrangement, or for a set of loops to play live.

The Monomachine holds 24 songs. A song has up to 200 rows.

In the editor the song mode is the **Song** workspace. Press {key:workspace-5}, or click the **Song** tab. The **Songs** column on the left holds the 24 song slots. The middle column holds the **PATTERN**, **CHAIN** and **SONG** keys over the pattern palette, and in song mode the **Selected row**. On the right, the **Arrangement** shows every row of the song as a cell, 16 cells to a line.

![The Song workspace](shot:mm-song-workspace)

The machine plays the song. The editor writes the song into the machine and shows what the machine reports: the mode, the row that plays and the tempo.

The three keys over the palette say what the machine plays and what a click on a pad does:

- **PATTERN**: the machine is in pattern mode. A pad click goes to that pattern.
- **CHAIN**: the machine is in pattern mode and a pad click adds the pattern to its chain.
- **SONG**: the machine is in song mode. A pad click adds a row to the song.

To put the machine in song mode:

1. Click **SONG**.
2. The key lights when the machine reports song mode. The line over the bank letters reads the song number and its row count, for example SONG 01 · 65 rows · stopped.

On the machine you press [PATTERN/SONG]. In the editor you can also click <PLAY> on the second line of the LCD, on every workspace: it reads PAT in pattern mode and SONG in song mode, and each click switches.

## LOAD SONG
<!-- rows: MM-253 @76cf01 -->

Loading a song makes it the song the machine plays in song mode, and the song the **Arrangement** shows. Its slot is lit in the **Songs** column, and the chip at the top of the column reads its number and name.

1. Stop the machine. Press {key:play-stop} if it plays.
2. Click a slot in the **Songs** column. The slot is selected. The machine still holds its song.
3. Click **Load**, or press {key:song-slot-load}. The machine loads the song, and its slot is lit.

Each slot shows its number, its name and its rows. An empty slot reads EMPTY and is drawn faint. Press the arrow keys to move the selection while a slot has the focus.

NOTE: The machine loads a song only while it is stopped. While it plays, **Load** is greyed out.

NOTE: **Load** is greyed out while the selected slot is already the one the machine holds.

## SAVE SONG
<!-- rows: MM-254 MM-255 @ac845b -->

The editor writes each edit into the slot of the song the machine holds as you make it. **Save** is the machine's SAVE SONG: the machine stores the song it holds into that slot, with its name.

### Save a song

1. Click **Save**.
2. If the machine has not loaded your latest edits yet, the editor asks first. Click **Load the edits, then save** to store the song as you see it.

### Save a song into another slot, with a name

1. Select an empty slot, or a slot to write over, in the **Songs** column.
2. Click **Save to…**. The slot shows a name field with the name of the machine's song.
3. Type a name, up to 14 characters, and press [RETURN]. Press [ESC] to cancel.

The slot now holds the song, with the new name. The machine still holds the song it had.

### Name a song

1. Select the slot.
2. Click **Rename**, press {key:song-slot-rename}, or double-click the slot.
3. Type the name and press [RETURN].

Names are in capitals. The editor keeps to letters, digits, spaces and a few signs.

### Copy, paste and clear a slot

1. Select a slot and click **Copy**, or press {key:song-slot-copy}.
2. Select another slot and click **Paste**, or press {key:song-slot-paste}. The slot holds a copy of the song, with its name.

You can also drag a slot onto another. The song is copied there.

To empty a slot, select it and click **Clear**, or press {key:song-slot-clear}. The rows and the name are removed. The slot reads EMPTY.

When a paste, a copy or **Clear** would write over a song, the editor asks first. Press {key:undo} to undo a paste, a copy, a name or a clear.

NOTE: A slot is written as a song dump, which the Monomachine takes only on SYSEX RECV. With a real Monomachine over MIDI the write waits: the sync field of the LCD reads SEND and the number of writes that wait.

NOTE: A song stores which patterns it plays, not the patterns themselves. Change a pattern and every row that uses it plays the changed pattern.

## SONG PLAY
<!-- rows: MM-256 MM-257 @ac8d5e -->

In song mode the machine plays the song from row 001, row by row, to its END row.

1. Click **SONG** over the palette, or click <PLAY> on the LCD until it reads SONG.
2. Press {key:play-stop}. The song plays. The **Arrangement** header reads Playing and the arrangement is framed.
3. Read what plays on the line over the bank letters: SONG 01 · row 017 of 65 · B01 means song 01, row 017 of 65 rows, pattern B01. The pattern field of the LCD reads the song and the row in the same way.
4. Press {key:play-stop} again to stop.

![What plays, in song mode: the line over the bank letters](shot:mm-song-what-plays)

You can go to pattern mode and back while the song plays. Click **PATTERN**: the machine plays a pattern and holds its place in the song. Click **SONG** and the song goes on from that place.

On the machine [PLAY] pauses a song that plays, and [STOP] stops it. In the editor hold [⇧] and click the play key, or press {key:pause}: the song holds its row and step, and the play key blinks. Click the play key to go on from there. {key:play-stop} stops.

## SONG TRANSPORT
<!-- rows: MM-258 MM-259 @e81f47 -->

On the machine you move the song pointer to another row while the song plays, and the song goes on from there when the current row ends. In the editor you start the song from the row instead:

1. Click the row's cell in the **Arrangement**.
2. Click **▶ From here** in the **Selected row** card, or press {key:song-play-from}.

The machine goes to SONG mode if it was in pattern mode and plays the song from the first step of that row. The editor sends the machine a MIDI song position, the steps of the rows before it, and then Continue.

NOTE: The Monomachine takes a song position only with <TRANSPORT> set to ACCEPT (GLOBAL, CONTROL IN; the factory setting is IGNORE). The first time, the editor asks to set it, then plays from the row. A loop, jump or halt row before the chosen row cannot be counted through: the editor says so.

The editor shows where the song is. While the song plays, the **Arrangement** marks the row that plays and the bar above the grid fills up to it. The mark comes from the machine itself, so it follows repeats, loops and jumps.

NOTE: A song plays to its END row and stops. A loop set to play forever never reaches the end.

NOTE: A row with a tempo of its own sets the tempo of the machine when it plays.

NOTE: The machine sends and follows MIDI song position by itself. The editor does not change that.

## SONG EDITING
<!-- rows: MM-260 MM-261 MM-262 MM-263 MM-265 MM-268 MM-269 MM-271 MM-275 @2dc0a4 -->

The **Arrangement** is where you build the song. Each cell is a row: the pattern it plays, with marks under the name for what else the row does. You can edit the song while it plays.

On the machine each row has columns that you step through with the arrow keys and set with the LEVEL knob. In the editor you select a cell and set the row in the **Selected row** card.

| On the machine | In the editor |
|---|---|
| ROW | the place of the cell in the **Arrangement**, 001 to 200 |
| PAT | the pattern name in the cell; **‹** and **›** in **Selected row** |
| REP | **Repeat** |
| TRN | **Transpose**; single tracks under **More** |
| OF LN | **Part**, under **More** |
| XTRA | **Tempo**; **Mutes**, under **More** |

![The arrangement and the selected row](shot:mm-song-arrangement)

### Select a row

- Click a cell in the **Arrangement**.
- Press {key:song-row} for the row before or after.
- Click a bar in the time bar above the grid. Each bar is as long as its row plays.

The last row of every song is END. The song stops there.

### Add patterns

1. Click **SONG** over the pattern palette.
2. Click a bank, A to H. The pads show its 16 patterns, each with its length, or "empty".
3. Click a pad. A new row with that pattern goes in after the selected row, and becomes the selected row.

You can also drag a pad onto the **Arrangement**. Drop it on a cell and that row plays the new pattern. Drop it on the free cell after the last row and a new row goes in before END.

### Set a row

1. Select the row.
2. Click **‹** or **›** to step to the pattern before or after.
3. Click **−** or **+** beside **Repeat** to set how many times the row plays, 1 to 64.
4. Click **−** or **+** beside **Transpose** to transpose all the tracks of the pattern for this row, in semitones.

Hold {key:song-steppers} and click **−** or **+** to change a value by ten.

NOTE: Tracks with the transpose scale FIX ignore the row's transpose.

### Play part of a pattern

A row can play part of its pattern: from a start step, for a number of steps. Use it to build odd bar lengths, or to swap the end of a pattern for a fill.

1. Select the row and click **More**.
2. Under **Part**, set **Offset**, the first step that plays, and **Length**, the number of steps. The bar above shows the steps that play.
3. To play the whole pattern again, click **Whole pattern**.

TIP: For a fill at the end of a 64-step pattern, play its steps 1 to 48 on one row, then steps 49 to 64 of a fill pattern on the next.

### Insert, move and delete rows

- **Duplicate** puts a copy of the selected row after it.
- **←** and **→** in the **Selected row** header move the row one place earlier or later. You can also drag a cell to another place.
- **Delete**, {key:delete} or <CLR> on the LCD deletes the selected row.

On the machine you insert a row with [FUNCTION] + [DOWN] and remove one with [FUNCTION] + [UP]. In the editor a new row comes from a pad, from **Duplicate** or from a paste.

### Copy, paste and undo

1. Select a row and press {key:copy}, or click <COPY> on the LCD.
2. Select the row to paste after.
3. Press {key:paste}, or click <PASTE>. The copy goes in after the selected row.

Press {key:undo} to undo the last edit.

NOTE: The END row cannot be copied, moved or deleted.

NOTE: A song holds 200 rows. The editor refuses a row past that.

### Read the cells

The marks under a pattern name say what else the row does.

| Mark | Meaning |
|---|---|
| ×4 | the row plays four times |
| +5, −7 | the row's transpose, in semitones |
| T | single tracks are transposed |
| M | tracks are muted |
| B | the row has a tempo of its own |
| ~ | the row plays part of its pattern |

On the machine a T replaces the TRN value. The editor shows both.

The **Arrangement** header counts the rows, out of 200. The line under the chip in the **Songs** column shows the song's rows, its length in bars and its playing time at the current tempo. On the Song workspace the LCD's second line shows the same: SONG, ROWS, BARS and TIME.

### When the machine hears an edit

The editor writes each edit into the song on the machine. An edit made while the machine is stopped plays at the next start. An edit made while the song plays is heard from the next start of the song. An edit made in pattern mode is there when you switch to song mode.

NOTE: With a real Monomachine over MIDI, edits wait until the machine takes them. The sync field at the right of the LCD, which normally reads Sync, reads SEND and the number of edits that wait. Click it and follow the steps.

## SONG EDIT TRANSPORT
<!-- rows: MM-270 MM-271 @b66d84 -->

On the machine you start the song from any row: select the row and press [ENTER/YES]. In the editor select the row and press {key:song-play-from}, or click **▶ From here** (see "SONG TRANSPORT").

The machine counts the bars and beats the song has played in the EDIT SONG header. The editor shows the same counter in the **Arrangement** header while the song plays: Playing · 002:03 is bar 2, beat 3. The length of the whole song is in the **Songs** column and on the LCD.

## SONG LOOPS
<!-- rows: MM-272 @d50ca1 -->

A loop row sends the song back to an earlier row, a set number of times. Loops keep a song short and its shape clear. They also make parts longer than the 64 steps of one pattern.

On the machine a loop is a value of the PAT column, after END. In the editor a loop is a command row of its own.

1. Select the last row of the part to repeat.
2. Click **Add loop** in the **Selected row** header. A loop row goes in after it. Its cell reads ↺ and the row it goes back to, with ×2 under it.
3. Click **−** or **+** beside **Back to** to set the first row of the part.
4. Click **−** or **+** beside **Times** to set how many times the part plays, 1 to 63. Click **Forever** for a loop that never ends. The cell shows ∞.

![A loop row](shot:mm-song-loop)

NOTE: Loops can sit inside other loops.

NOTE: {bug:B-038}In this version, a loop written by the editor goes back to the first row of the song on the machine, whatever row **Back to** names. This is a known fault.{/bug}

## SONG JUMP
<!-- rows: MM-273 @b7d251 -->

A jump row sends the song forward to a later row. The rows between are not played.

On the machine a loop becomes a jump when you set its row after the loop. In the editor you choose the command.

1. Select a command row, or add one with **Add loop**.
2. Under **Command**, click **JUMP**.
3. Click **−** or **+** beside **Jump to** to set the row to go to. The cell reads → and that row.

## SONG HALT
<!-- rows: MM-274 MM-258 @5babd9 -->

A halt row stops the song where it stands. The song waits there until you choose a row to go on from.

On the machine a loop becomes a halt when it points at itself. In the editor you choose the command.

1. Select a command row, or add one with **Add loop**.
2. Under **Command**, click **HALT**. The cell reads HALT.

To go on after a halt, start the song from a row before it with **▶ From here**. A row after the halt cannot be counted to: start it on the machine.

## SONG TRACK TRANSPOSE
<!-- rows: MM-264 @df7281 -->

Besides the transpose of the whole pattern, a row can transpose single tracks: the six synth tracks and the six MIDI tracks.

1. Select the row and click **More**.
2. Under **Per track**, the INT line holds the synth tracks T1 to T6, the MIDI line the MIDI tracks M1 to M6.
3. Click **−** or **+** on a track to transpose it, in semitones. The track shows its value. The cell shows T.

NOTE: A track transpose holds for that row only.

## SONG EXTRA
<!-- rows: MM-266 MM-267 @ad40f2 -->

A row can mute tracks and set a tempo of its own.

### Mute tracks on a row

1. Select the row and click **More**.
2. Under **Mutes**, click T1 to T6 for the synth tracks, M1 to M6 for the MIDI tracks. A muted track's key is dark. Click it again to unmute.
3. The cell shows M.

On the machine you set the mutes with the [TRIG] keys 1 to 6 and 9 to 14.

### Set a tempo for a row

1. Select the row. Beside **Tempo**, **Keep** is lit: the row plays at the tempo before it.
2. Click **Keep**. The row takes the current tempo as its own, and **Keep** goes out.
3. Click **−** or **+** to set the tempo, 30 to 300 BPM. The cell shows B.

To take the row's tempo off, click **Keep** again.
