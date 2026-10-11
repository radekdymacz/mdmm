# 9. Additional kit settings
<!-- summary: Assign performance controls to parameters, set how a track's notes and glides behave, and play all six tracks from one keyboard. -->

Besides the sound of each track, a kit holds settings for how the tracks are played: what the joystick, the velocity and the key position control, which track a trig also plays, how the portamento and legato behave, and how a single keyboard drives several tracks. The assign settings and the multi trig, multi map and multi envelope settings are on the **Perform** workspace. Press {key:workspace-4}, or click the **Perform** tab. The trig track settings are on **Sequence**.

## ASSIGN
<!-- rows: MM-145 MM-150 @2c11a7 -->

Assign lets a performance control move a parameter of the track. Each control has two rows. A row names a page, a parameter on that page, and an amount to add.

The **Assign** card follows the track selected in the rail. Its header shows the track and its machine, for example Assign · T2 SWAVE-1. The keys 1 to 6 in the header choose another track.

1. Press {key:workspace-4}.
2. Click a tab to choose the control: JOY RL, JOY U, JOY D, VEL or KEY.
3. In a row, choose the page: SYN, AMP, FLT, EFX, LF1, LF2, LF3 or PTCH.
4. Choose the destination. The list holds the parameters of that page for the machine on the track.
5. Set **ADD**, from −64 to +63, by dragging the box up or down. Double-click it to return to 0.

### Copy, clear and paste an assign

The LCD keys **Copy**, **Clr** and **Paste** act on all the assign tabs of the track while **Perform** is open.

1. Click **Copy**, or press {key:copy}.
2. Choose another track in the **Assign** header.
3. Click **Paste**, or press {key:paste}. The track takes all the tabs of the copy.

**Clr** empties the tabs of the track. {key:undo} takes back a paste or a clear.

### JOYSTICK
<!-- rows: MM-146 MM-147 @5531cf -->

The tabs JOY RL, JOY U and JOY D hold the joystick's three directions: right and left together, up and down. Beside the rows the card shows a stick. Drag it with the pointer to try the assignment. It springs back to the middle when you let go.

**MIRR** is on the JOY RL tab. When it is lit, a move to the left acts as the same move to the right with the sign reversed. When it is dark, only the right half of the movement acts.

### VELOCITY
<!-- rows: MM-148 @768dff -->

The VEL tab assigns the velocity of the notes you play to a parameter. The sequencer always plays its notes at velocity 100, so a velocity assign only responds to the keys.

### KEY TRACKING
<!-- rows: MM-149 @65813f -->

The KEY tab assigns the key you played last to a parameter. The value is low for the lowest key and near its maximum for the highest.

Two keys on this tab, **HPF tracks keys** and **LPF tracks keys**, switch the key tracking of the high-pass and low-pass filters.

## TRIG TRACK SETTINGS
<!-- rows: MM-151 MM-152 MM-153 @71480c -->

These settings belong to one track. They sit in the **Trig setup** tab, in the header of the lock lane on **Sequence**. A MIDI track has the **MIDI page** tab in its place (see chapter 16).

1. Press {key:workspace-1}.
2. Select a synth track in the rail.
3. Click **Trig setup** above the lock lane. The keys of the tab appear in the rail.

![The Trig setup tab](shot:mm-trig-setup)

**Trig position** chooses a second track that also plays this track's notes. The keys are T1 to T6, without the track itself, and a dash for none. The **Mix** workspace draws the link as a dotted cord labelled TRIG and the target track.

**Port** sets how the portamento works.

- **ALWAYS**: the track glides to every note.
- **LEGATO**: the track glides only between notes that overlap.

**Legato** has three keys, **AMP**, **FLT** and **LFO**. A lit key means that envelope fires again when a note starts while the one before still sounds. With all three lit every note retriggers, which suits a bass. With all three dark the notes join smoothly, which suits a lead.

The value boxes **ATK**, **HOLD**, **DEC** and **PORT** above the picture are the track's amp envelope and glide amount. The picture draws one gate and the glide between two notes. Drag its dots to change the values.

## MULTI TRIG
<!-- rows: MM-154 MM-155 MM-156 MM-157 MM-158 MM-159 @40c3c4 -->

In multi trig mode one source plays all six tracks, as a single large mono synth.

1. Press {key:workspace-4}.
2. In the **Keyboard** bar, click **Multi trig**.
3. Click one of the four modes: **ALL TRK**, **SPLIT KEY**, **SEQ START** or **SEQ TRNSP**.
4. Play the keyboard on the page, or send notes on the multi trig channel. The second line of the LCD shows the channel in the CH field. You set the channel in **GLOBAL** (chapter 19).

![The Perform workspace in multi trig mode](shot:mm-perform-multi-trig)

### ALL TRK

Every note plays on all six tracks. Each track keeps its own arpeggiator.

### SPLIT KEY

The keyboard splits in two. Keys from the split point up play the tracks from T**n** to T6. Keys below play T1 to the track before T**n**.

1. Click **SPLIT KEY**.
2. Click **−** or **+** beside **Upper from** to choose T**n**.
3. Drag the split marker on the keyboard to choose the split key. The marker reads, for example, SPLIT C-4 · T3-6 above.

In split mode the multi envelope does not act.

### SEQ START

Each note you play restarts the pattern. The pattern is transposed by the distance of the note from C-4.

### SEQ TRNSP

The first note you play starts the pattern. Later notes only transpose it, so the loop never breaks.

### Timing

**SEQ START** and **SEQ TRNSP** show a **Timing** stepper. Click **−** or **+** to choose DIRECT, 1/16, 2/16, 4/16, 8/16, 16/16 or 32/16. With DIRECT the note acts at once. With another value it acts at the next division of that length, and the page says so when you play.

## MULTI ENV
<!-- rows: MM-160 MM-161 @bee3e7 -->

The **Multi envelope** card holds an ADSR that acts on top of every track's own envelope. It acts in multi trig mode.

The five boxes are **ATK**, **DEC**, **SUS**, **REL** and **PORT**. PORT is the portamento for all tracks. The plot above them shows the envelope. Drag its dots to change ATK, DEC with SUS, and REL. A REL of 127 never fades, and the plot says so.

TIP: For no effect from the multi envelope, set ATK to 0, and DEC, SUS and REL to 127.
