# 16. The MIDI sequencer
<!-- summary: Write notes, velocities and controller values for the six MIDI tracks. -->

The Monomachine has six MIDI tracks next to its six synth tracks. They send notes and controller values to other instruments. The editor edits them on **Pattern**, with the same roll, docks and rows.

## USING THE MIDI SEQUENCER
<!-- rows: MM-240 MM-241 MM-242 @8c942d -->

1. Press {key:workspace-1}.
2. Click **MIDI** under the rail, or click SEQ on the second line of the LCD until it reads MIDI. The rail shows M1 to M6.
3. Click a track. It shows its MIDI channel, for example CH 03. **M** mutes it and **S** solos it.
4. Draw notes in the roll as on a synth track. See chapter 11. A note you click in the roll of one MIDI track changes that track only.
5. To write a chord, hold [⇧] and click another pitch on a step that has a note. The notes of a chord share one length.

On **Kit** the same **SYNTH** and **MIDI** keys switch between the six synth tracks and the six MIDI tracks. On **Perform**, the **Mutes** card has **M1** to **M6** for the MIDI tracks. Click one to mute the track and click it again to unmute it.

A MIDI note has a real length. To set it:

1. Switch **Draw** on, choose 1/16 and click a cell. The note is 6 ticks long, one step.
2. Drag the end of the note over two more steps. The length reads 18, three steps.
3. Press {key:undo} to take a change back.

The editor writes the note's LEN, 6 to a step. The row under the roll is **VEL**, the velocity of each note. You can lock any value of the MIDI page on a step with the lock lane. See chapter 13.

![A MIDI track in the roll](shot:mm-midi-roll)

## THE MIDI PAGE
<!-- rows: MM-243 MM-244 MM-245 MM-246 MM-247 MM-314 MM-315 @45ce25 -->

Click **MIDI page** in the header of the lock lane. The tab holds these values:

- **LEN**: the length of a note, 1 to 127. 127 lasts until a NOTE OFF. Dragging a note's end sets it.
- **VEL**: the velocity.
- **PB**: the pitch bend.
- **PCHG**: a program change. It is sent only when you lock it on a step.
- **CC 1 to CC 4**: the values of four controllers.

Below the controller values are the boxes **CL1** to **CL4**. They choose the controller number of each. Choose AFT to send aftertouch.

To write a value on a step:

1. Select a MIDI track and a step that has a note.
2. In the lock lane choose **MIDI page**, then the value: **VEL**, **PB** or **PCHG**.
3. Draw the bar on the step. The value is a lock of that step. A program change goes out only when you lock it.
4. Type 74 in **CL1** to make the first controller CC 74. Type AFT in **CL2** to send aftertouch from the second. The numbers belong to the selected track only.

The **Channel** keys 1 to 16 set the MIDI channel of the track. Choose 4 and only that track changes.

NOTE: The LFOs of a MIDI track are shared with the synth track of the same number.

## COMPARISON
<!-- rows: MM-248 MM-249 MM-250 @0b3d7d -->

A MIDI track has no trig tracks, so its row under the roll shows the velocity, without the A, F and L dots. The step menu has no envelopes or trigless trig for it. It has an arpeggiator without envelope switches, swing, slide and transpose, in the same tabs as a synth track.

1. Drag across four step columns of **Slide** under the roll. Those steps slide.
2. Click **Swing** on a column to flip the swing of that step.
3. Open the transpose tab and type +3 in **TRACK**. The pattern holds 3 for the track.
4. Open the **Arp** tab. It says a MIDI track has no envelope switches.

![The docks on a MIDI track](shot:e2e-mm-midi-seq-docks)

The MIDI page is stored in the kit, so edits of it are kit edits. Raise **VEL**, save the kit to its slot and the slot holds the value.

The internal tracks can send MIDI too. On the **GLOBAL** page, the **Control out 1** card sends the notes of the sequencer, the arpeggiator or the keyboard to MIDI out, with or without the sound of the tracks. See chapter 19.

1. Open **GLOBAL**.
2. On **Control out 1**, click **OUT** for **Sequencer**. The page warns that the tracks play no sound.
3. Click **INT+OUT** for **Keyboard**, then **INT** for **Sequencer**. The warning goes.
