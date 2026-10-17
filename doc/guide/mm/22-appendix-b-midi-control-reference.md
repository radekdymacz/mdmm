# 22. Appendix B: MIDI control reference
<!-- summary: The MIDI messages the Monomachine understands, and where the editor sends or shows them. -->

The Monomachine takes notes, controllers, NRPN values and a few system messages. This appendix lists them and says where the editor uses each one. The editor sends them to the emulated machine, or to a real Monomachine over MIDI, as you work: you do not write them by hand.

## CHANNELS
<!-- rows: MM-347 @ce2923 -->

Each track listens on its own channel: the base channel plus 0 to 5. You set the base channel and the span in GLOBAL, in the Control section (chapter 19). The on-screen keyboard, the home row keys and the roll keys use these channels. Notes from a MIDI keyboard or a DAW use them too, and a note on a channel that no track listens on plays nothing.

1. Click **GLOBAL** in the top bar. The panel opens with the MIDI channels.
2. Click the minus beside Channel span until it reads 0. No track has a channel, and the panel says so.
3. Close the panel and click the **M** of a track on the rail. The editor refuses and offers the fix in a notice.
4. Open GLOBAL again and click **Give each track its own channel**. The span reads 6 and **M** mutes the track.

![The MIDI channels in GLOBAL](shot:mm-global-panel)

## NOTE ON / OFF
<!-- rows: MM-348 @2d02a0 -->

A note on starts the amp, filter and LFO envelopes of a track and a note off releases them. The on-screen keyboard, the home row keys and the keys of the piano roll send them.

## MULTI TRIG CHANNEL
<!-- rows: MM-349 @4fde21 -->

The multi trig channel plays all tracks at once, splits the keyboard between tracks, starts the sequencer or transposes it. The Perform keyboard sends these notes.

## MULTI MAP CHANNEL
<!-- rows: MM-350 @0dd1eb -->

Notes on the multi map channel trigger patterns. The Perform keyboard sends them.

## AUTO CHANNEL
<!-- rows: MM-351 @5599f1 -->

Notes on the auto channel go to the active track. The Perform workspace has an **Auto track** setting for it.

## CC: JOYSTICK UP / DOWN
<!-- rows: MM-352 @c690eb -->

The joystick sends controller 1 for up and controller 2 for down. The assign pad of the Perform workspace sends them.

## CC: MUTE
<!-- rows: MM-353 @f226d0 -->

Controller 3 mutes a track. The mute keys send it.

## CC: LEVEL
<!-- rows: MM-354 @7c80c6 -->

Controller 7 sets the level of a track. The LEVEL fader sends it.

## CC: PAN
<!-- rows: MM-355 @5ea7a4 -->

Controllers 10 and 62 set the pan of a track. The PAN control sends them.

## CC: SYNTHESIS 1 TO 8
<!-- rows: MM-356 @3da566 -->

Controllers 48 to 55 carry the eight values of the SYN page.

## CC: AMP
<!-- rows: MM-357 @8897f1 -->

Controllers 56 to 63 carry the eight values of the AMP page.

## CC: FILTER
<!-- rows: MM-358 @254d2b -->

Controllers 72 to 79 carry the eight values of the FLT page.

## CC: EFFECTS
<!-- rows: MM-359 @c72369 -->

Controllers 80 to 87 carry the eight values of the EFX page.

## CC: LFO 1 TO 3
<!-- rows: MM-360 @0e9b9b -->

Controllers 88 to 95, 104 to 111 and 112 to 119 carry the values of LFO 1, LFO 2 and LFO 3.

## CC: ALL NOTES OFF
<!-- rows: MM-361 @340375 -->

The panic command, {key:panic} or **Panic** in the transport menu, lets every held note go. It sends controller 123 on the channel of each track. Controller 120, which the manual names for this, does nothing on OS 1.32B.

1. Press {key:play-stop}. The machine plays.
2. Right-click the play key and click **Panic**. Every note goes off and the machine stops.

## NRPN PARAMETERS
<!-- rows: MM-362 @2cabc7 -->

An NRPN message carries a track, a parameter and a value. The values of the MIDI page go out as NRPN 0x38 to 0x3F.

## NRPN PITCH
<!-- rows: MM-363 @1dbe07 -->

The machine takes a pitch for a track by NRPN. The editor does not send it.

## NRPN NOTE OFF, TRIG TRACK
<!-- rows: MM-364 @a309c1 -->

The machine releases a note or triggers the amp, the filter or the LFO of a track by NRPN. The editor does not send these.

## NRPN MULTI ENV
<!-- rows: MM-365 @b6bc83 -->

The multi envelope has the NRPN range 0x40 to 0x45. The multi envelope of the Perform workspace sends it.

## PITCH BEND
<!-- rows: MM-366 @6424ac -->

Pitch bend works per track. The joystick pad sends it.

## PROGRAM CHANGE
<!-- rows: MM-367 @09af8b -->

A program change on the base channel selects a pattern. The firmware reacts to it when your host sends one, for example from a clip. With **Prg change out** on, choosing a pattern in the editor sends one out.

## SONG POINTER, CLOCK, START, CONTINUE, STOP
<!-- rows: MM-368 @048bc1 -->

These system messages sync the machine to a host. The firmware handles them, and the editor uses them when it follows the host's clock (**Tempo in** EXT). A loop in the DAW arrives as a song position and a continue. When the host stops, the editor sends All Notes Off on every channel as well. With **Tempo in** on INT none of these reach the machine.

The machine's own MIDI out carries notes, controllers, program changes, pitch bend, pressure, clock, start, stop and continue. It never carries SysEx.
