# 0.6: what Radek tests at the end

One list, filled as each piece is merged. Run both editors (`scripts/mdmm-dev.sh play md`, `play mm`) from the
`feat/0.6-features` worktree, standalone first, then the plug-ins in a DAW.

## Top bar and LCD fit (B-061, B-065, B-066)

1. Windows at 1440, about 864 px wide, and 1920: visit every workspace on both editors.
2. CPU meter, GLOBAL and MKI / MKII stay inside the window; PLAY (PAT / SONG) shows on the LCD's second row.
3. The LCD box keeps one size on every workspace.

## GLOBAL Trig in A / B (B-069, MD)

1. Open GLOBAL: the factory global reads Gate 1, Sens 0, Vmin 0, Vmax 127, Dest -.

## Song slots (wave 1, both editors)

1. Click an empty slot, Load, press SONG, click two pads.
2. F2 on that slot, type a name, Enter.
3. Copy, select another slot, Paste; drag one slot onto another.
4. Select a fourth slot, Save to…, name it; then Save.
5. Clear a slot (it asks), then Cmd+Z. Switch between PATTERN, CHAIN and SONG.
6. A slot that holds a song: the Overwrite and Clear questions. MD: Save while the edits are not loaded yet ("Load the edits, then save").
7. MM on real hardware: Save to… (it waits as SEND n).

## Trig types and marks (wave 3)

1. MD: paint Swing, Accent and Slide with the keys under the grid; switch All tracks / This track; Esc goes back to Trig; one undo per drag.
2. MM: Slide and Swing drags on the roll's Note · Slide · Swing row, then one undo; Esc.
3. MD: paint swing on a step, remove the trig, add it again (B-070: no swing mark should flash back).

## GLOBAL page (wave 5, both editors)

1. GLOBAL in the top bar: the page sits under the header, as wide; a workspace key, Esc and GLOBAL all go back.
2. Copy, click another slot, Paste (it asks), Cmd+Z. Clear (the old Reset to defaults) asks, then Cmd+Z.
3. MD: TRIG IN A / B: − / + on each value (Shift: 10), Dest runs -, T1 … T16.
4. MD: a LEARN dot on a track, then play a note on a MIDI keyboard (the standalone's MIDI input; in a DAW the track's MIDI): the track takes the note. Reset map (it asks), Cmd+Z.
5. MM: Master tune − / + (Shift: 1 Hz); listen to the pitch. Control out 1: Sequencer OUT silences the tracks (the line under the rows says so) and sends NRPN; back to INT.
6. MM on real hardware: a master tune or Control out 1 change waits as SEND n.
