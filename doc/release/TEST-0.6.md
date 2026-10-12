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

## Transport (wave 2)

1. Both: ⇧-click ▶ (or ⇧Space) pauses, ▶ goes on from the same step, in a pattern and in a song.
2. The ▾ on ▶: Play/Stop, Pause/Continue, Record, Panic. Panic (⌘.) silences hanging notes.
3. Click the tempo: −/+, TAP, hold +10 % / −10 % (also - and =), Change on release; ⌥-drag the tempo. A plain drag still works as before; in a DAW the tempo stays locked.
4. Song page: select a row, ▶ From here (or Enter).
5. MM on real hardware: the question to set TRANSPORT IN = ACCEPT, then pause, continue and play from a row.

## Copy / paste / clear what (wave 4)

1. The ▾ beside COPY CLR PASTE: Copy… a track's trigs, accent, slide and sound, Paste… into two tracks, then one undo, then redo (pattern and kit both come back).
2. MM: paste melody onto another track's trigs; synth parts do not paste onto MIDI tracks (shown off with the reason).
3. MD Sound: the LFO card's ⋯ menu: Copy, Paste, Clear LFO.
4. The keys ⌘⇧C, ⌘⇧V, ⌘⇧⌫, also in the plug-in in a DAW (⌘⇧V must not do a text "paste and match style").

## GLOBAL page (wave 5, both editors)

1. GLOBAL in the top bar: the page sits under the header, as wide; a workspace key, Esc and GLOBAL all go back. A click anywhere else on the page only closes it (the step under the pointer does not take it).
2. Copy, click another slot, Paste (it asks), Cmd+Z. Clear asks, then Cmd+Z.
3. MD: TRIG IN A / B: − / + on each value (Shift: 10), Dest runs -, T1 … T16.
4. MD: a LEARN dot on a track, then play a note on a MIDI keyboard (the standalone's MIDI input; in a DAW the track's MIDI): the track takes the note. Reset map (it asks), Cmd+Z.
5. MM: Master tune − / + (Shift: 1 Hz); listen to the pitch. Control out 1: Sequencer OUT silences the tracks (the line under the rows says so) and sends NRPN; back to INT.
6. MM on real hardware: a master tune or Control out 1 change waits as SEND n.

## SysEx and reset (wave 6)

1. Both: the engine menu's IMPORT SYSEX…, EXPORT SYSEX… and RESET MACHINE… entries (the kit library and the pattern chooser no longer have SysEx keys); a .syx dropped on the window still opens the import.
2. Export: All ticked saves a full backup. Untick All: Kits K01 to K04 and Globals G1 only (click, ⇧-click, wheel, drag, arrows on a range end), Save .syx…, then import that file and check it holds just those.
3. MM: tick Waveforms W01 to W08 in the export; the file holds the used ones (an empty waveform is left out).
4. Import a file with two kits: Specific place, kits from K05. The grid shows them on K05 and K06, the tooltip says where each came from; Import asks first when a slot holds data. Original place puts them back.
5. Verify only, with and without Specific place: nothing changes on the machine; the report shows = and ≠.
6. Reset machine… > Empty reset… (asked twice): every kit, pattern and song empty, globals unchanged. MD: Factory reset… (seconds to prepare, minutes to send and read back): kits 1 to 4 are TRX UW, EFM UW, E12 UW, P-I UW again. MM: the question says why there is no factory reset.
7. MM on real hardware: an empty reset waits as SEND n until SYSEX RECV; the export of waveforms reads them over the cable.

## Recording (wave 7)

1. MD: select a track with trigs, start live recording (● or ⌥Space), hold Delete: the track's header is marked red and its trigs go as they play. Let go: the other tracks kept theirs.
2. MM: the same with LIVE RECORDING (⌥Space): hold Delete, the selected track's notes go as they pass.
3. MM: stopped, ⇧-click ● (or the ▶ menu's Step record): the key shows STEP and a red cursor on the roll (no new row above the roll). Play A S D: each note goes to the cursor's step and the cursor moves on. → leaves a rest, ← goes back, Delete clears the step, Esc (or ●) ends it.
4. MM: while step recording, pick another synth track: the machine writes that track from the same step. With a step selection made first, ⇧-click ● drops it, and ← → Esc are step recording's.
5. Both: hold Delete while live recording and close the editor window (or reload the page): the erase stops within a second.
6. MM on real hardware: step recording and live erase are refused with the reason (they need the machine's keys).
7. MD (MD-140, polish A): lock a value on a track's trigs (lock lane), start live recording, go to Sound, press that value and keep the mouse down, then hold Delete: the value and the track's header are marked red and that value's locks go as they play (the first step or two may stay while the editor selects the track and the knob page); the value does not move, the trigs and the other locks stay. Delete alone still erases trigs; letting the value go first stops the removal until Delete is let go. The MM has no such gesture (its manual removes locks in grid recording only).
