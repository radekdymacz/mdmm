# 15. Additional sequencer features
<!-- summary: Arpeggiator, transpose, swing, slide, the mute window and poly mode. -->

The arpeggiator and transpose are tabs in the header of the lock lane on **Sequence**: **Arp** and **Transpose**. Click a tab to show its keys in the rail and its values and picture under the roll. Swing and slide are in the step menu.

## THE ARPEGGIATOR
<!-- rows: MM-215 @837d12 -->

Each of the twelve tracks has its own arpeggiator, six synth tracks and six MIDI tracks. A pattern holds all twelve. The arpeggiator turns the chord notes of a trig into a run of notes.

1. Select a track and click **Arp**.
2. Write a chord: hold [⇧] and click the steps at the other pitches in the roll.
3. Set the mode and the other values below.

The light notes in the roll show what the arpeggiator plays. Press {key:undo} to take the change back.

![The arpeggiator tab](shot:e2e-mm-seq-arp)

### ARPEGGIATOR BASIC SETTINGS
<!-- rows: MM-216 MM-217 MM-218 MM-219 MM-220 MM-221 @1a41b3 -->

- **SPD** is the speed. 6 is a sixteenth note, so the light notes follow one to a step.
- **RNGE** is the number of octaves the run covers. Scroll over it to raise it. It stops at 9 OCT.
- **OJMP** is the octave jump. Type a value in it.

Each track keeps its own settings: a mode key you click changes the arpeggiator of the selected track and no other.

**Mode** keys:

- **OFF**: the track plays the base note of each trig.
- **KEY**: the arpeggiator runs while keys are held and plays only the held notes.
- **SID**: it needs two or more notes. They stay in the cycle after you release them, until a new chord.
- **ADD**: it starts on the first note. Each extra key joins while one key is held.

**Play** keys: **TRUE** plays the notes in the order of the chord, **UP** from low to high, **DOWN** from high to low, **CYCLE** up and then down, and **RND** in a random order. With RND the roll draws the notes outlined, because the pitches vary.

To copy, paste or clear the arpeggiator of a track:

1. Click **▾** beside **COPY**, **CLR** and **PASTE** on the LCD, then **Copy…**.
2. Tick **Arp** (and anything else the track should carry) and click **Copy**.
3. Select the other track, open **▾** again, choose **Paste…** and click **Paste into 1 track**. The track now has the arpeggiator of the first.
4. A clear from **Clear…** turns the arpeggiator off.

Each is one undo step: press {key:undo} to take it back. See chapter 11, "Super copy".

![The arpeggiator settings](shot:e2e-mm-seq-arp-setup)

### ARPEGGIATOR ENVELOPE TRIGGING SWITCHES
<!-- rows: MM-222 @ee86e3 -->

The **Trig** keys **AMP**, **FLT** and **LFO** choose which envelopes the arpeggiator's notes fire again. A MIDI track has no envelopes, so the keys read "none on MIDI".

### ARPEGGIATOR RHYTHM AND OFFSET TRACK
<!-- rows: MM-223 MM-224 MM-225 @47af59 -->

Under the values is a strip of 16 cells. It repeats while the arpeggiator runs.

- Click a cell to mute it. Click it again to switch it on.
- Drag a cell up or down to give its note an offset from minus 24 to plus 24 semitones. Drag past the top for +24 and past the bottom for minus 24.
- Click a cell past the end, or a key of the **LEN** row under the strip, to set the length of the strip from 1 to 16.

## TRANSPOSE
<!-- rows: MM-226 MM-227 MM-228 MM-229 @d449b7 -->

Transpose changes the pitch of the notes while they play. The programmed notes stay as they are. Click **Transpose**.

1. Set **TRACK**, the transpose of the selected track, by dragging the box. The value runs from −64 to +63 semitones. You can also click a key of the keyboard picture, for example G.
2. Set **PAT · all**, the transpose of the whole pattern, for example by typing +5. All tracks follow it and no track's own transpose moves.
3. Under **Scale** choose **---**, **FIX**, **MAJ** or **MIN**.

Transpose works while the pattern plays. Press {key:play-stop}, click the E key and the pattern goes on playing with the new transpose. Press {key:undo} to take it back.

![The transpose tab](shot:e2e-mm-seq-scale-setup)

The line above the keyboard picture says what the track plays, for example plays +5 semitones.

- **---**: no scale. The transposes of the track, the pattern, the song and the multi trig add up. Any note can sound.
- **FIX**: only the track transpose acts. Use it for drums and effects.
- **MAJ** and **MIN**: transposed notes stay in the major or minor scale of the key. Keys outside the scale are hatched, in the picture and in the roll.

For MAJ and MIN, click a key of the keyboard picture to set the root key. A click on E sets the key to 4. With **---** and **FIX**, a click on a key sets the track transpose so that C plays that key, upward from C. Hold [⌥] and click to go down to it. The note also sounds while you hold the button.

## SWING
<!-- rows: MM-230 @f18ef4 -->

Swing delays every other sixteenth note. The **SWG** field of the LCD sets the amount for the pattern, from 50 to 80 %. Drag the field up or down, or scroll over it.

### THE SWING TRACK
<!-- rows: MM-231 MM-232 @3ab762 -->

Each step of a track can swing. A step that swings comes late by the amount of **SWG**. Swing does something only on a step with a trig.

1. Right-click a step in the roll (Ctrl-click on a Mac), or select steps and click the ⋯ on the selection.
2. Choose **Swing**. A tick shows when every selected step swings. On a selection it sets every step: on when one of them has it off, else off. It is one undo step.
3. A small teal slant over a note shows that its trig swings.

Each track has its own swing steps. The marks show for the selected track. A new pattern swings every second 16th step, so most off beat notes carry the mark.

To copy, paste or clear the swing row of a track, tick **Swing** in **Copy…**, **Paste…** or **Clear…** of the LCD's **▾** menu (chapter 11, "Super copy"). A clear sets it back to every second 16th step. Press {key:undo} to take each back.

## SLIDE
<!-- rows: MM-233 MM-234 @8006fc -->

A slide makes a locked value glide to the next lock instead of jumping. Without a lock on the step a slide does nothing. The glide of a pitch is PORTAMENTO, in the trig setup.

1. Right-click a step in the roll, or select steps and click the ⋯ on the selection.
2. Choose **Slide**. A tick shows when every selected step slides. On a selection it sets every step, in one undo step.
3. A small ramp over a note shows a step that slides and holds a lock. In the lock lane the glide is drawn from one lock to the next.

![The step menu](shot:e2e-mm-seq-step-menu)

To copy, paste or clear the slide row of a track, tick **Slide** in **Copy…**, **Paste…** or **Clear…** of the LCD's **▾** menu (chapter 11, "Super copy"). Press {key:undo} to take each back.

## THE MUTE MODE
<!-- rows: MM-235 MM-236 MM-238 @9cbe3f -->

Mutes are global: they do not belong to the pattern. The machine holds them.

- Click **M** on a track in the rail, or on the **Mix** workspace, to mute it. Click **S** to solo it.
- Press [M] with a track selected to mute it. Press [M] again to unmute it. [⌥] [M] mutes every synth track and [0] unmutes every track.
- Press {key:mute-track} to mute or unmute the selected track.
- Press {key:mute-all} to mute every track. When none is audible, it unmutes every track.
- Press {key:unmute-all}, or click **M/S off** in the rail, to unmute and unsolo everything.
- Drag across **M** or **S** keys to set every track you cross as the first one became.

The **Perform** workspace has a **Mutes** card with all twelve tracks, T1 to T6 and M1 to M6. A lit key means the track is audible.

### Prepare mutes

To change several mutes together:

1. Open **Mix**.
2. Hold [⇧] and click two **M** keys. Each key shows + or X for the change to come. Nothing is sent yet.
3. Let go of [⇧]. Both tracks mute together.

![Prepared mutes](shot:e2e-mm-mix-shift-mutes)

NOTE: A mute acts on notes. A sound that already plays rings out.

NOTE: A MIDI track needs a MIDI channel of its own to be muted over MIDI. If it has none, the page says so and offers **Give each track its own channel**. That sets the channel span of the global to 6.

### MINIMISING THE MUTE WINDOW
<!-- rows: MM-237 @554303 -->

The mute window of the machine is a screen of its own. The editor has no such window, so there is nothing to minimise.

## POLY MODE
<!-- rows: MM-239 @b3299e -->

In poly mode all six engines play the track in focus, with six voices. The sequencer then plays the chord notes of that track's trigs as chords. Out of poly mode a trig plays only its first note.

1. Press {key:workspace-4}.
2. Select the track with the numbered keys in the title of the **Assign** card.
3. In the **Keyboard** bar, click **Poly**.

The other five tracks are silent until you leave poly mode. The line under the keyboard modes says so, and on **Sequence** the rail dims those tracks and marks the poly track ×6. Chapter 5 describes poly mode.
