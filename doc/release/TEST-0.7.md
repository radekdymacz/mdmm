# 0.7: what Radek tests on the installed build

Install the .pkg for each editor, then test the standalone first. One pass in a DAW at the end for VST3 and AU. Each item: action, then what you should see.

## GEN dialog (both editors)

1. Click the dice key after M S on a track: a small dialog opens, centred. The GEN bar under the grid is gone.
2. Euclid: turn the controls; the track changes live. Random: same. Change the MODE row.
3. Drag the dialog by its head; it stays where you drop it.
4. Change track with the dialog open: it follows to the new track.
5. Cancel: the track is as before. Do it again, Done: the change stays. Each is one undo (Cmd+Z, Cmd+Shift+Z).
6. ESC closes the dialog.
7. Keep on, then ⌥R (roll all): the kept track does not change. ⌘-click a dice key: it toggles Keep without opening.

## Lane shape tools (both editors)

1. Open the lock lane of a track: eight shape tools, ×1 ×2 ×4, every 2nd/3rd/4th, offbeats, Human, scale, Inv.
2. Hover a tool: a preview shows on the lane, nothing is written.
3. Click a shape: the lane takes it. ⌘-click adds, ⌥-click subtracts, ⇧-click scales.
4. Inv and Human act on what is there. One undo takes each back.
5. Hover a lane: only an outline shows, the values stay readable.

## Mix strips and Sound page (both editors)

1. Mix: each strip head shows the number and the machine name; the trig light flashes on trigs and on played notes.
2. A long track name ends with an ellipsis; hover shows the full name.
3. Sound page: the Clear key sits next to R. Clear empties the track's sound; Cmd+Z brings it back. Revert track is no longer there.

## Monomachine

1. Lane row: tabs on the left, tools on the right, at 864 px and at full width.
2. Arp: the LEN box sets the length; the strip shows LEN steps; the values sit under the strips.
3. Trig setup: values under the graph, graph readable; Legato shows the restarts panel.
4. Perform: envelope for all tracks on the left; the track card with T1 to T6, joystick and assign; mutes and keyboard modes on the right. Pick T1 to T6, move the joystick, assign, mute.
5. Roll bar: ? help and 1/16 on the right.

## Machinedrum

1. Sampler: source choice and take status in the card heads; Source and Playback faders on one line.
2. Known B-133: Load a sample, then live record; if nothing records, restart the machine and it records again.

## DAW pass (VST3 and AU)

1. Load each editor in the DAW: open the GEN dialog, apply a lane shape, Cmd+Z. Keys reach the plug-in, not the DAW.
2. Save and reopen the project: tracks and lanes are as left. Both editors open at once still work.
3. Mix trig lights flash from the DAW's transport and from incoming MIDI notes.
