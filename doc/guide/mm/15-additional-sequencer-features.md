# 15. Additional sequencer features
<!-- summary: Arpeggiator, transpose, swing, slide, the mute window and poly mode. -->

The arpeggiator and transpose are tabs in the header of the lock lane on **Sequence**: **Arp** and **Transpose**. Click a tab to show its keys in the rail and its values and picture under the roll. Swing and slide are rows under the roll.

## THE ARPEGGIATOR
<!-- rows: MM-215 @837d12 -->

Each of the twelve tracks has its own arpeggiator, six synth tracks and six MIDI tracks. A pattern holds all twelve. The arpeggiator turns the chord notes of a trig into a run of notes.

1. Select a track and click **Arp**.
2. Write a chord: hold [⇧] and click the steps at the other pitches in the roll.
3. Set the mode and the other values below.

The light notes in the roll show what the arpeggiator plays.

### ARPEGGIATOR BASIC SETTINGS
<!-- rows: MM-216 MM-217 MM-218 MM-219 MM-220 MM-221 @f107b1 -->

- **SPD** is the speed. 6 is a sixteenth note.
- **RNGE** is the number of octaves the run covers.
- **OJMP** is the octave jump.

**Mode** keys:

- **OFF**: the track plays the base note of each trig.
- **KEY**: the arpeggiator runs while keys are held and plays only the held notes.
- **SID**: it needs two or more notes. They stay in the cycle after you release them, until a new chord.
- **ADD**: it starts on the first note. Each extra key joins while one key is held.

**Play** keys: **TRUE** plays the notes in the order of the chord, **UP** from low to high, **DOWN** from high to low, **CYCLE** up and then down, and **RND** in a random order. With RND the roll draws the notes outlined, because the pitches vary.

To copy, paste or clear the arpeggiator of a track, tick **Arp** in **Copy…**, **Paste…** or **Clear…** of the LCD's **▾** menu (chapter 11, "Super copy"). A clear turns it off. Press {key:undo} to take each back.

### ARPEGGIATOR ENVELOPE TRIGGING SWITCHES
<!-- rows: MM-222 @9388c0 -->

The **Trig** keys **AMP**, **FLT** and **LFO** choose which envelopes the arpeggiator's notes fire again. A MIDI track has no envelopes, so the keys read "none on MIDI".

### ARPEGGIATOR RHYTHM AND OFFSET TRACK
<!-- rows: MM-223 MM-224 MM-225 @9f9806 -->

Under the values is a strip of 16 cells. It repeats while the arpeggiator runs.

- Click a cell to mute it or to switch it on again.
- Drag a cell up or down to give its note an offset from minus 24 to plus 24 semitones.
- Click a cell past the end, or a key of the **LEN** row under the strip, to set the length of the strip from 1 to 16.

## TRANSPOSE
<!-- rows: MM-226 MM-227 MM-228 MM-229 @4c013a -->

Transpose changes the pitch of the notes while they play. The programmed notes stay as they are. Click **Transpose**.

1. Set **TRACK**, the transpose of the selected track, by dragging the box. The value runs from −64 to +63 semitones.
2. Set **PAT · all**, the transpose of the whole pattern. All tracks follow it.
3. Under **Scale** choose **---**, **FIX**, **MAJ** or **MIN**.

The line above the keyboard picture says what the track plays, for example plays +5 semitones.

- **---**: no scale. The transposes of the track, the pattern, the song and the multi trig add up. Any note can sound.
- **FIX**: only the track transpose acts. Use it for drums and effects.
- **MAJ** and **MIN**: transposed notes stay in the major or minor scale of the key. Keys outside the scale are hatched, in the picture and in the roll.

For MAJ and MIN, click a key of the keyboard picture to set the root key. With **---** and **FIX**, a click on a key sets the track transpose so that C plays that key, upward from C. Hold [⌥] and click to go down to it. The note also sounds while you hold the button.

## SWING
<!-- rows: MM-230 @d00145 -->

Swing delays every other sixteenth note. The **SWG** field of the LCD sets the amount for the pattern, from 50 to 80 %. Drag the field up or down, or scroll over it.

### THE SWING TRACK
<!-- rows: MM-231 MM-232 @3247aa -->

The keys **Note**, **Slide** and **Swing** under the roll say what a click on the roll does. **Note** writes notes, as always. With **Swing** lit, a click chooses the steps that swing:

1. Click **Swing** under the roll. The key lights.
2. Click anywhere in a step's column of the roll. A teal mark at the foot of the roll shows that the step swings. It comes late by the amount of **SWG**. Click the column again to take the swing off.
3. Drag across columns to paint every step you cross. The first step decides: on or off. The drag is one undo step.
4. Press {key:trig-type}, or click **Note**, to write notes again.

Each track has its own swing steps. The marks show for the selected track.

To copy, paste or clear the swing row of a track, tick **Swing** in **Copy…**, **Paste…** or **Clear…** of the LCD's **▾** menu (chapter 11, "Super copy"). A clear sets it back to every second 16th step. Press {key:undo} to take each back.

## SLIDE
<!-- rows: MM-233 MM-234 @bc431d -->

A slide makes a locked value glide to the next lock instead of jumping.

1. Click **Slide** under the roll.
2. Click a step's column of the roll. A triangle at the foot of the roll marks the step that slides. Click again to take it off.
3. Drag across columns to paint slides on every step you cross, in one undo step.
4. Press {key:trig-type} to write notes again.

The right-click menu has **Slide** too. In the lock lane the glide is drawn from one lock to the next.

To copy, paste or clear the slide row of a track, tick **Slide** in **Copy…**, **Paste…** or **Clear…** of the LCD's **▾** menu (chapter 11, "Super copy"). Press {key:undo} to take each back.

## THE MUTE MODE
<!-- rows: MM-235 MM-236 MM-238 @3849f5 -->

Mutes are global: they do not belong to the pattern. The machine holds them.

- Click **M** on a track in the rail, or on the **Mix** workspace, to mute it. Click **S** to solo it.
- Press {key:mute-track} to mute or unmute the selected track.
- Press {key:mute-all} to mute every track. When none is audible, it unmutes every track.
- Press {key:unmute-all}, or click **M/S off** in the rail, to unmute and unsolo everything.
- Drag across **M** or **S** keys to set every track you cross as the first one became.

The **Perform** workspace has a **Mutes** card with all twelve tracks, T1 to T6 and M1 to M6. A lit key means the track is audible.

### Prepare mutes

To change several mutes together, hold [⇧] and click the **M** keys. Each marked key shows + or X for the change to come. When you let go of [⇧] the changes happen together.

NOTE: A mute acts on notes. A sound that already plays rings out.

NOTE: A MIDI track needs a MIDI channel of its own to be muted over MIDI. If it has none, the page says so and offers **Give each track its own channel**. That sets the channel span of the global to 6.

### MINIMISING THE MUTE WINDOW
<!-- rows: MM-237 @554303 -->

The mute window of the machine is a screen of its own. The editor has no such window, so there is nothing to minimise.

## POLY MODE
<!-- rows: MM-239 @2de77f -->

In poly mode all six engines play the track in focus, with six voices.

1. Press {key:workspace-4}.
2. In the **Keyboard** bar, click **Poly**.

The other five tracks are off until you leave poly mode. The page says so, and the rail marks the tracks that are off.
