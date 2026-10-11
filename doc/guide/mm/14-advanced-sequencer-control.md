# 14. Advanced sequencer control
<!-- summary: Choose which envelopes a trig fires, and write trigs that carry only a pitch or only locks. -->

## TRIG TRACKS
<!-- rows: MM-209 MM-210 MM-211 MM-212 @7133ca -->

Every note on a synth track is a trig. A trig can fire the amplitude envelope (AMP), the filter envelope (FILTER), the LFO envelope (LFO), or any of them together. The machine keeps one trig track for each. The editor shows them in the **ENV** row under the piano roll, with the label A F L. A MIDI track has no trig tracks, so its row shows the velocity (see chapter 16).

![The ENV row](shot:mm-env-row)

Each step with a note has three dots in the ENV row: AMP in red, FILTER in yellow and LFO in green. A lit dot means the trig fires that envelope.

- A note you draw in the roll fires all three envelopes.
- Click a dot to switch that envelope off or on for the trig.
- Drag across the dots of a row to switch a run of steps the same way.
- A single trig has one dot lit: AMP only, FILTER only or LFO only.

{gap:MM-212}The editor shows the trig colours as dots, one colour for each envelope. It does not show the machine's trig key lights.{/gap}

## TRIGLESS TRIGS
<!-- rows: MM-213 @719285 -->

A trigless trig fires no envelope. It is there to carry a pitch or locks.

- Switch all three dots of a step off, or
- Right-click the step and choose **Trigless (no envelope trigs)**. Choose it again to put the dots back.

The roll draws a trigless note as an outlined bar. The step menu works on a selection as well.

## PITCHLESS TRIGS
<!-- rows: MM-214 @64db8e -->

A pitchless trig fires envelopes without a pitch of its own. The ENV row shows its dots, and the roll draws it as a dashed bar.
