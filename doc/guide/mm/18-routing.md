# 18. Routing
<!-- summary: Send tracks to the mix buses and outputs, feed effects from other tracks or the audio inputs, and choose the routing mode. -->

Routing is on the **Mix** workspace. Press {key:workspace-3}, or click the **Mix** tab. The six synth tracks have a strip each. Under the strips is the **Routing** bar, and under it a drawing of the signal path: the tracks, the three buses AB, CD and EF, the outputs and the input jacks.

![The Mix workspace](shot:e2e-mm-mix-routing)

Click a track in the drawing to select its strip. The lines under the drawing say what each bus carries and where it goes, for example AB: T1 + T2 › OUT A/B.

## THE MIXER
<!-- rows: MM-276 @9c50c8 -->

Each strip holds, from the top: the sound's trim values (AMP VOL, DIST, DSND), PAN, the LEVEL fader, the buses the track sends to, the input, and the **M** and **S** keys.

The **Out** keys **AB**, **CD** and **EF** on a strip choose the buses the track feeds. A lit key means the track sends to that bus. A track can feed more than one bus.

Tracks add into a bus in track order. An effect on a bus therefore hears only the tracks before it.

## FX MACHINES
<!-- rows: MM-277 @f5476c -->

An effect machine needs an input and a trig to work. When you choose an effect machine for a track on **Sound**, the editor sets its input and sets the amplitude envelope values DEC and REL to 127 so that the sound passes. The page tells you so. A trig on the track then opens the effect.

## AUDIO INPUTS
<!-- rows: MM-278 MM-279 @458e30 -->

An effect track has an **In** menu on its strip. The audio inputs are **INP A**, **INP B** and **INP AB**. The drawing shows a dashed line from the input jack to the track.

To use an effect as a first stage in a chain, give the track the machine **THRU**. Choose it in the machine picker on **Sound**.

NOTE: A synth track has no input. Its strip reads "synth · none".

## NEIBOR ROUTING
<!-- rows: MM-280 @6960bc -->

**NEIBOR** is an input that takes the sound of the track before. The drawing shows an arrow from the neighbour. Effects can follow each other this way. Track 1 has no neighbour, so its menu has no NEIBOR.

## MIX BUS ROUTING
<!-- rows: MM-281 @d61ed7 -->

**BUS AB**, **BUS CD** and **BUS EF** are inputs that take what a bus carries. If the effect track also sends to the same bus, it replaces what was there: the line below the drawing reads "INSERT". If it sends elsewhere, it takes a copy of the bus: a send. The line names the track that "takes a copy".

## ROUTING MODES
<!-- rows: MM-282 MM-283 MM-284 MM-288 @716ba9 -->

Click a mode on the **Routing** bar. The field ROUTE on the second line of the LCD steps through them on a click. The **Routing** card of the **GLOBAL** panel has the same keys.

- **3xSTEREO**: the three buses go to the three stereo outputs, AB to A/B, CD to C/D and EF to E/F. This is the default.
- **3xSTEREO + AB=MIX**: as 3xSTEREO, and CD and EF are also added to A/B.
- **6xMONO**: each track goes to its own output, A to F. The buses are not sent out.
