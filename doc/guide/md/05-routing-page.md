# 5. Routing page
<!-- summary: Distortion, volume, pan, the delay and reverb sends and the LFO controls of each track, on the Sound and Mix workspaces. -->

The routing parameters set how a track's sound goes through the distortion, the volume and pan, and on to the effect buses. They are part of the kit.

There are two places to set them:

- On the Sound workspace they are groups of the second row, after the track effects: **Drive**, **Level · pan** and **Sends**. A small word at the right of the first one names the machine's ROUTING page.
- On the Mix workspace each track has a strip with its **VOL** fader and the **PAN**, **DIST**, **DEL** and **REV** boxes.

![A strip on the Mix workspace](shot:md-mix-strip)

To lock a routing parameter to a step, open the Sequence workspace and click its key in the lock lane, in the row of keys labelled **Routing**.

## DISTORTION
<!-- rows: MD-064 @401a3e -->

**DIST** controls the distortion of the track. It acts after the track effects and before the volume and pan.

The group **Drive** shows input against output. The dashed line is a clean signal.

To set it:

1. Click the **Sound** tab.
2. Select the track on the rail. The page shows the synthesis, effects and routing groups together.
3. Drag the dot in **Drive**, or click the **DIST** box and press the up or down arrow key. The value changes in the kit.

On the Mix workspace use the **DIST** box of the strip.

![The Sound workspace with the routing groups in the second row](shot:md-sound-workspace)

## VOLUME
<!-- rows: MD-065 @475bc1 -->

**VOL** is the volume of the track. It is separate from the overall gain of the track and, unlike it, can be locked and moved by an LFO.

On the Mix workspace **VOL** is the fader of the strip. Drag the fader, or press {key:value-up-down} while it has focus. Double-click it to set 100. On the Sound workspace **VOL** is in the group **Level · pan**.

To take a change back, press {key:undo}. The fader goes back to where it was.

## PAN
<!-- rows: MD-066 @fc471d -->

**PAN** places the track in the stereo field of the main outputs. It shows -64 for hard left to +63 for hard right, and 0 for the centre.

On the Sound workspace the group **Level · pan** has one dot: sideways sets **PAN**, upward sets **VOL**. On the Mix workspace drag the **PAN** box of the strip sideways. Press {key:undo} to take the change back.

NOTE: PAN has no effect on a track that goes to an individual output, A to F. The Mix workspace still shows its value.

## DELAY SEND
<!-- rows: MD-067 @bd563f -->

**DEL** sets how much of the track goes to the Rhythm Echo, the delay of the master effects.

On the Sound workspace the group **Sends** has two bars, one for **DEL** and one for **REV**. Drag the dot on a bar, or click the box and press the up or down arrow key. On the Mix workspace use the **DEL** box.

A track on an individual output, A to F, has no delay. Its **DEL** box is greyed on the Mix workspace, with a note, and the value is kept.

## REVERB SEND
<!-- rows: MD-068 @c6369b -->

**REV** sets how much of the track goes to the Gate Box, the reverb of the master effects. It is set in the same places as **DEL**.

A track on an individual output has no reverb. Its **REV** box is greyed in the same way.

## LFO CONTROL
<!-- rows: MD-069 @17c9ae -->

The three routing parameters **LFOS**, **LFOD** and **LFOM** are the speed, depth and mix of the track's LFO. They are the same kit values as **SPD**, **DEPTH** and **SHMIX** in the LFO group of the Sound workspace, so the LFO group holds all three. Chapter 7 describes the LFO.

Click any of the three boxes in the LFO group and press the up or down arrow key. Each one moves its own routing value and no other.

When you lock **LFOS**, **LFOD** or **LFOM** on a step, the lock also shows on the box of the LFO group.
