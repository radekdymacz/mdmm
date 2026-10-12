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

## SysEx and reset (wave 6)

1. Both: the engine menu's IMPORT SYSEX…, EXPORT SYSEX… and RESET MACHINE… entries; the library headers' Import SysEx… and Export SysEx… keys open the same panels.
2. Export: All ticked saves a full backup. Untick All: Kits K01 to K04 and Globals G1 only (click, ⇧-click, wheel, drag, arrows on a range end), Save .syx…, then import that file and check it holds just those.
3. MM: tick Waveforms W01 to W08 in the export; the file holds the used ones (an empty waveform is left out).
4. Import a file with two kits: Specific place, kits from K05. The grid shows them on K05 and K06, the tooltip says where each came from; Import asks first when a slot holds data. Original place puts them back.
5. Verify only, with and without Specific place: nothing changes on the machine; the report shows = and ≠.
6. Reset machine… > Empty reset… (asked twice): every kit, pattern and song empty, globals unchanged. MD: Factory reset… (about a minute to prepare): kits E12 UW, EFM UW, P-I UW, TRX UW come back. MM: the question says why there is no factory reset.
7. MM on real hardware: an empty reset waits as SEND n until SYSEX RECV; the export of waveforms reads them over the cable.
