# 8. Low frequency oscillators
<!-- summary: The three LFOs of each track: where they point, when they start, their shape, speed and depth. -->

Each synth track has three LFOs. An LFO moves one parameter of the track, or of the pitch, in a repeating shape. The three LFOs of a track are independent, and an LFO can move a parameter of another LFO.

The LFOs are the bottom row of the **Sound** workspace. Each has its own group, titled **LFO 1**, **LFO 2** and **LFO 3**. A group holds, from the top:

- a picture of the LFO over two bars, with ticks where the LFO is triggered;
- the target: **PAGE** and **DEST** selects, with the **TRIG** keys beside them;
- eleven keys for the shape;
- four value boxes: MULT, SPD, INTL and DPTH.

The group is marked off while its depth is 0.

![The LFO groups](shot:mm-sound-lfos)

## LFO
<!-- rows: MM-135 @079b28 -->

An LFO needs a target. Its target is a page and a destination on that page.

### Choose a target

1. Select the track and go to the **Sound** workspace ({key:workspace-2}).
2. In the LFO's group, open the **PAGE** select. It lists PTCH, SYN, AMP, FLT, EFX, LF1, LF2, LF3 and MIDI.
3. Open the **DEST** select and choose the parameter. It lists the parameters of the page. For PTCH it lists eight ranges: 1/12, 2/12, 7/12, 1OCT, 2OCT, 4OCT, 8OCT and 16OCT. For LF1 to LF3 the parameters are those of the other LFOs. For MIDI they are the parameters of the MIDI page.
4. Set DPTH, the depth, above 0.

Changing the page sets the destination back to the first entry.

### Route by dragging

The key marked **~** and the LFO's number, at the head of the group, is a handle. Drag it onto any value box on the page. The value boxes that can be a target are marked while you drag. Drop the handle on one. The editor sets PAGE and DEST to that value, and gives the depth a start value of 32 if it was 0. A note names the LFO and the value it now moves.

## TRIG
<!-- rows: MM-136 @f9e532 -->

The **TRIG** keys set how the LFO starts.

| Key | What the LFO does |
|---|---|
| FREE | runs on without being restarted |
| TRIG | starts again on each trig |
| HOLD | holds the value it has when a trig comes |
| ONE | plays one cycle after a trig |
| HALF | plays half a cycle after a trig |

Which steps trigger the LFO is set in the sequencer: see "LFO trigs" below.

## WAVE
<!-- rows: MM-137 @17fcf4 -->

Eleven keys, each with a small picture, choose the shape. They are, in order: TRI, ITRI, SAW, ISAW, SQR, ISQR, EXP, IEXP, RMP, IRMP and RND. Click a key to choose a shape. The picture of the LFO redraws.

## MULT
<!-- rows: MM-138 @9dbb04 -->

MULT multiplies the speed. Its values are 1X, 2X, 4X, 8X, 16X, 32X and 64X.

## SPD
<!-- rows: MM-139 @ba6f4b -->

SPD sets the speed of the LFO. MULT multiplies it. Drag the value box.

## INTL
<!-- rows: MM-140 @b72954 -->

INTL is the interlace of the LFO. Drag the value box.

## DPTH
<!-- rows: MM-141 @e437fd -->

DPTH is the depth: how far the LFO moves its target. At 0 the LFO does nothing and its group reads off. Drag the value box.

## LAYERING
<!-- rows: MM-142 @23f3ff -->

Two LFOs can move the same target, and their movements add. A value box that an LFO moves shows a small badge, ~ and the number of the LFO, for example ~1 or ~12 when two LFOs move it. Hover over the badge to read which LFOs these are.

## LFO TRIGS
<!-- rows: MM-143 @ff5866 -->

The sequencer triggers the LFOs on its own. A trig with its LFO trig on triggers the LFOs of the track at that step. It matters for the TRIG, HOLD, ONE and HALF keys. In the **Sequence** workspace right-click the step and choose **Envelopes**, then **LFO**, to switch it. A note without its LFO trig shows the letters of the envelopes it does fire.

## SHARED LFOS
<!-- rows: MM-144 @3b9e4e -->

A MIDI track shares its three LFOs with the synth track of the same number. M1 shares with T1, and so on. An LFO that has PAGE set to MIDI moves the MIDI page.

On a MIDI track, the **Sound** workspace shows the MIDI page, and in the place of the LFO groups a note says which synth track they belong to. Click **Open T1 LFOs** (with the number of the track) to go to them.
