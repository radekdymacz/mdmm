# 16. The MIDI sequencer
<!-- summary: Write notes, velocities and controller values for the six MIDI tracks. -->

The Monomachine has six MIDI tracks next to its six synth tracks. They send notes and controller values to other instruments. The editor edits them on **Sequence**, with the same roll, docks and rows.

## USING THE MIDI SEQUENCER
<!-- rows: MM-240 MM-241 MM-242 @e765fe -->

1. Press {key:workspace-1}.
2. Click **MIDI** under the rail, or click SEQ on the second line of the LCD until it reads MIDI. The rail shows M1 to M6.
3. Click a track. It shows its MIDI channel, for example CH 03. **M** mutes it and **S** solos it.
4. Draw notes in the roll as on a synth track. See chapter 11.

A MIDI note has a real length. Drag the end of a note to set it. The editor writes the note's LEN, 6 to a step. Notes of a chord share one length. The row under the roll is **VEL**, the velocity of each note. You can lock any value of the MIDI page on a step with the lock lane. See chapter 13.

![A MIDI track in the roll](shot:mm-midi-roll)

## THE MIDI PAGE
<!-- rows: MM-243 MM-244 MM-245 MM-246 MM-247 MM-314 MM-315 @694a76 -->

Click **MIDI page** in the header of the lock lane. The tab holds these values:

- **LEN**: the length of a note, 1 to 127. 127 lasts until a NOTE OFF. Dragging a note's end sets it.
- **VEL**: the velocity.
- **PB**: the pitch bend.
- **PCHG**: a program change. It is sent only when you lock it on a step.
- **CC 1 to CC 4**: the values of four controllers.

Below the controller values are the boxes **CL1** to **CL4**. They choose the controller number of each. Choose AFT to send aftertouch.

The **Channel** keys 1 to 16 set the MIDI channel of the track.

NOTE: The LFOs of a MIDI track are shared with the synth track of the same number.

## COMPARISON
<!-- rows: MM-248 MM-249 MM-250 @d1c478 -->

A MIDI track has no trig tracks, so its row under the roll shows the velocity in place of the envelope dots. It has an arpeggiator without envelope switches, swing, slide and transpose, in the same tabs as a synth track.

The MIDI page is stored in the kit, so edits of it are kit edits.

The internal tracks can send MIDI too. On the **GLOBAL** page, the **Control out 1** card sends the notes of the sequencer, the arpeggiator or the keyboard to MIDI out, with or without the sound of the tracks. See chapter 19.
