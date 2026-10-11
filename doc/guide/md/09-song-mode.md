# 9. Song mode
<!-- summary: Arrange patterns into songs of up to 256 rows, with repeats, parts, mutes, tempo changes, loops, jumps and halts. -->

The song mode plays patterns in a set order. Each row of a song names a pattern and how it plays: how many times, the whole pattern or a part of it, with some tracks muted, at a tempo of its own. Command rows loop back, jump forward or halt the song.

In the editor the song mode is the **Song** workspace. Press {key:workspace-5}, or click the **Song** tab. The left column holds, from the top: **What plays**, the **Song** card, the **Patterns** palette and the **Selected row**. On the right, the **Arrangement** shows every row of the song as a cell, 16 cells to a line.

![The Song workspace](shot:md-song-workspace)

The machine plays the song. The editor writes the song into the machine and shows what the machine reports: the mode, the row that plays and the tempo.

To put the machine in song mode:

1. Click **SONG** in the **What plays** card.
2. The switch lights **SONG** when the machine reports song mode. Click **PATTERN** to go back.

You can also click <PLAY> on the second line of the LCD, on every workspace. It reads PAT in pattern mode and SONG in song mode, and each click switches.

## LOAD SONG
<!-- rows: MD-143 MD-144 @ea441d -->

The Machinedrum holds 32 songs. A song has up to 256 rows. The song you see in the editor is the song the machine holds.

1. Stop the machine. Press {key:play-stop} if it plays.
2. Click **‹** or **›** in the **Song** card to go to the previous or next song. You can also click <SONG> on the second line of the LCD, or drag or scroll on it. Click with [⇧] to go back.
3. The machine loads the song. The **Song** card and the LCD read the song number, 01 to 32.

NOTE: The machine loads a song only while it is stopped. While it plays, the editor refuses and says "Stop first".

## PLAYING A SONG
<!-- rows: MD-145 MD-147 MD-160 MD-161 @4a10bb -->

In song mode the machine plays the song from the first row, row by row, to the END row.

1. Click **SONG** in **What plays**, or click <PLAY> on the LCD until it reads SONG.
2. Press {key:play-stop}. The song plays. The **Arrangement** header reads Playing and the arrangement is framed.
3. Read what plays in **What plays**: SONG 01 · row 017 of 65 · B01 means song 01, row 017 of 65 rows, pattern B01. The <PATTERN> field of the LCD reads the song and the row, for example 01·017.
4. Press {key:play-stop} again to stop.

The playing row is marked in the arrangement, and the bar over it fills up to that row.

![What plays, in song mode](shot:md-song-what-plays)

You can go to pattern mode and back while the song plays. Click **PATTERN**: the machine plays a pattern. Click **SONG** to play the song again.

The **Song** card gives the length of the song as rows, bars and playing time at the current tempo. The time is an estimate. The LCD shows the same as <ROWS>, <BARS> and <TIME> on the second line of the Song workspace.

When the host sends a song position, the machine follows it. The editor has no control for this.

{gap:MD-145}You cannot pause a song in the editor. [PLAY] starts and stops it.{/gap}

{gap:MD-147}The editor does not show how many turns of a repeat are left.{/gap}

## NAVIGATING A SONG
<!-- rows: MD-146 @74e5c2 -->

Click a cell of the arrangement to select that row. Press {key:song-row} to move to the previous or next row. A selected row is the one you edit.

{gap:MD-146}Selecting a row does not move the song pointer. You cannot start the song from a chosen row in the editor yet.{/gap}

## SONG EDITING
<!-- rows: MD-149 MD-150 MD-151 MD-152 @a11beb -->

### Add patterns

The **Patterns** palette shows the 128 patterns by bank. **Arrange** is lit. Each pad gives the pattern's name and its length, or "empty".

1. Click a bank letter.
2. Click a pad. The pattern goes into the song after the selected row, and the new row is selected.

You can also drag a pad onto the arrangement. It lands on the cell you drop it on.

### Set how a row plays

Select the row. The **Selected row** card shows its values.

- **Row** shows the row number and the pattern. Click **‹** or **›** to choose another pattern.
- **Repeat** sets how many times the row plays, 1 to 64.
- **Tempo** reads **Keep** while the row plays at the tempo before it. Click **Keep** to give the row a tempo of its own, then click **−** or **+**, 30 to 300 beats per minute. Click **Keep** again to take it off.

Hold [⇧] and click **−** or **+** to change a value ten at a time.

### Change the rows

The buttons in the header of the **Selected row** card are:

- **←** and **→** move the row one place.
- **Duplicate** copies the row to the place after it.
- **Add loop** adds a loop row. See "SONG LOOP".
- **Delete** removes the row.

You can also drag a cell to move it.

### Copy, paste and undo

Press {key:copy} to copy the selected row. Press {key:paste} to put it after the selected row. Press {key:delete} to delete the row. Press {key:undo} to undo the last edit.

NOTE: A song holds 256 rows. The editor refuses a row past that.

### The END row

The last row of a song is END. The song stops there. New rows always go before it. The END row cannot be moved, duplicated or deleted.

### Read the cells

The marks under a pattern name say what else the row does.

| Mark | Meaning |
|---|---|
| ×4 | the row plays four times |
| ~ | the row plays part of its pattern |
| ↺ and a row number | a loop back to that row |
| ×3 or ∞ | the loop plays three times, or for ever |
| → and a row number | a jump to that row |
| HALT | the song halts |
| END | the song ends |

### When the machine hears an edit

The editor writes each edit into the song on the machine. An edit is heard from the next start of the song. The editor loads the song into the machine again when the machine is stopped.

NOTE: With a real Machinedrum over MIDI the editor cannot see the transport. The song card then reads "Edits heard after STOP + reload" and offers **Reload song**. Click it: the machine stops, loads the song and plays again.

## SONG ROW OFFSETS AND LENGTHS
<!-- rows: MD-153 @304985 -->

A row can play a part of its pattern, from a step you choose and for a number of steps you choose.

1. Select the row and click **More**.
2. The **Part** bar shows the pattern's steps and lights the steps the row plays.
3. Click **−** or **+** beside **Start** to set the first step.
4. Click **−** or **+** beside **Length** to set how many steps play.
5. Click **Whole pattern** to play the pattern from step 1 to its end again.

The cell of a row with a part shows ~.

## SONG TRANSPORT
<!-- rows: MD-148 @c42d16 -->

{gap:MD-148}On the machine, [STOP] holds the song and a second [STOP] starts it. The editor has no such key. {key:play-stop} plays and stops.{/gap}

## SONG LOOP
<!-- rows: MD-154 @0fc513 -->

A loop row sends the song back to an earlier row, a set number of times. Loops keep a song short and its shape clear.

1. Select the last row of the part to repeat.
2. Click **Add loop** in the header of the **Selected row** card. A loop row goes in after it. Its cell reads ↺ and the row it goes back to.
3. Click **−** or **+** beside **Back to** to set the first row of the part.
4. Click **−** or **+** beside **Times** to set how many times the part plays, 2 to 64. Click **Forever** for a loop that never ends. The cell shows ∞.

![A loop row](shot:md-song-loop)

NOTE: Loops can sit inside other loops.

TIP: A loop that runs for ever is good live. Select the row you want next while it plays.

## SONG JUMP
<!-- rows: MD-155 @893975 -->

A jump row sends the song forward to a later row. The rows between are not played.

1. Select a command row, or add one with **Add loop**.
2. Under **Command**, click **JUMP**.
3. Click **−** or **+** beside **Jump to** to set the row to go to. It has to be later than the jump. The cell reads → and that row.

## SONG HALT
<!-- rows: MD-156 @8df508 -->

A halt row stops the song where it stands. It waits there until you pick a row to go on from.

1. Select a command row, or add one with **Add loop**.
2. Under **Command**, click **HALT**. The cell reads HALT.

## SONG MUTE
<!-- rows: MD-157 @27744c -->

A row can mute tracks while it plays.

1. Select the row and click **More**.
2. Under **Mutes**, click the keys 1 to 16. A muted track's key is dark. Click it again to unmute.

## SAVE SONG
<!-- rows: MD-158 MD-159 @e46269 -->

On the machine you edit a song and then save it into one of the 32 slots, with a name. The editor works differently. It edits the slot itself: each change goes into the slot you chose in the **Song** card as you make it. There is no separate save, and nothing is lost when you load another song.

{gap:MD-158}You cannot name a song or save it into another slot in the editor yet.{/gap}

{gap:MD-159}You cannot copy, paste or clear a whole song slot in the editor yet. Rows can be copied one at a time: see "Copy, paste and undo" under SONG EDITING.{/gap}

NOTE: A song stores which patterns it plays, not the patterns themselves. Change a pattern and every row that uses it plays the changed pattern.
