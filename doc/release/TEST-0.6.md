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
7. MD (MD-140, polish A): lock a value on a track's trigs (lock lane), start live recording, go to Sound, press that value and keep the mouse down, then hold Delete: the value and the track's header are marked red and that value's locks go as they play (the first step or two may stay while the editor selects the track and the knob page); the value does not move, the trigs and the other locks stay. Delete alone still erases trigs (after a moment: a value pressed just after Delete still wins); a value with no locks (a master effect on Mix) removes nothing and says so; letting the value go first stops the removal until Delete is let go; letting Delete go first leaves the value where it was until the mouse is let go. The MM has no such gesture (its manual removes locks in grid recording only).

## MD sound and mix (wave 8, Machinedrum only)

1. Mix: each strip has a **LEV** box above the VOL fader. Drag one, scroll the wheel over it, focus it and press ↑ ↓: the track gets louder or quieter while it plays, the box's bar follows. Double-click: 100. Undo takes each change back. LEV and VOL are separate values (VOL can be locked, LEV cannot).
2. LEV of a track at 0: the track is silent; save the kit, load another and back: the level is kept.
3. Sound: open the machine picker. Point at a machine: a red ▶ shows on its key. Click ▶: the machine goes on the track and the track plays once; the picker stays open and a line says "▶ machine · track n · was ...". Try several.
4. Esc (or **Back**, or a click outside the picker): the old machine is back, with its sound as it was (also with "Keep effects + routing" off).
5. Move with Tab to a machine and press Space: it plays. Enter (or **Keep**, or a click on the key): it stays. One ⌘Z takes the whole try-and-keep back to the machine before.
6. An audition the machine refuses (start the editor and open the picker before the machine is ready, or base channel OFF): Esc undoes nothing of your earlier edits. ⌘Z while auditioning: the audition ends (no line, no "was"), Esc then changes nothing.
7. Close the editor window (or reload the page) while a machine is being auditioned, open it again: the track has its old machine and values (while the window is closed the tried machine stays; it goes when the page loads again).
8. ▶ on GND-EMPTY or a RAM recorder: the machine goes on the track, no note, a toast says why. During live recording an audition changes the machine but plays no note (no trig is recorded).

## MM Perform: Poly, key tracking, Multi envelope (wave 9, B-064)

1. Perform: click Assign's track key 3, then **Poly** in the Keyboard card. The line under the keyboard modes says T3 plays six voices; key 3 and its lamp under the keyboard read ×6, the others dim. Hold a chord on the computer keys (A D G, or a MIDI keyboard on T3's channel): all its notes sound.
2. Still in Poly, click track key 5: Poly moves to T5 (the first chord there can sound as one note, the next ones are chords). Notes on T3's channel are now silent. On Sequence the rail marks T5 ×6 and dims the others. Pick a MIDI track (MIDI, M2): Poly stays on T5.
3. Reload the page, or turn Poly on at the machine with another TRACK lit: the page shows Poly on the machine's track and selects it, without pressing anything. **Auto track** ends Poly.
4. Sound, a track with a low LPF (WDTH low): the Filter group's title shows **KEY** with HPF and LPF lit. Click it: Perform opens on Assign › KEY for that track. Switch **LPF tracks keys** off: back on Sound the LPF lamp is dark and the filter screen's label says LPF fixed; high notes now sound much quieter than low ones.
5. Perform, Multi envelope card: its title names the kit's MULTI TRIG mode. With the keys on Auto track the hint says to choose Multi trig (pointing at that sentence rings the Multi trig key). Choose Multi trig and SPLIT KEY: the hint says the envelope has no effect.
6. Multi trig, ALL TRK, envelope ATK 0 DEC 0 SUS 0 REL 0: a key gives nothing. Play T1 with the computer's note keys (A S D): silent now too, until Panic (the ▶ menu, or its key). Set DEC, SUS and REL back to 127: the keys sound again.
7. SEQ START with REL 0: a Multi trig key starts the pattern; let go and the pattern goes silent until the next key or STOP.

## Machine memory for new sessions (wave 11, I-024, both editors)

1. Plug-in in a new DAW project: change a kit name, SAVE KIT into a slot (page or panel). Wait two seconds.
2. Add a second instance of the same editor in a new project (or close and add again): the slot holds your kit.
3. Open an older saved project: it has its own memory, not the new kit.
4. Engine menu: RESET MACHINE… > Start from factory memory…, Cancel, then again and confirm: the factory kits are back within seconds; a new instance starts from factory memory. The engine menu has no separate entry for it.
5. KEEP MEMORY: OFF, save a kit, new instance: factory memory. Turn it ON again.
6. Standalone: save a kit in a plug-in, then start the standalone (it has its own saved state): it has that kit, and its own other kits and the kit that played stay. With KEEP MEMORY: OFF it starts with its own state alone.
7. The file: `~/Documents/Gearmulator Preview/<Machine>/memory/machine-memory.bin`. Damage it (change a byte): the next new instance says so, starts from factory memory and keeps `machine-memory.unusable.bin`.
8. MD: load a sample into a UW slot in the Sampler and save nothing else, wait until the machine has stored it, new instance: the sample is there.
9. Only saves write: play a pattern in a DAW with automation on a few parameters for a minute, turn knobs, rename the kit that plays without SAVE KIT: the file's date does not change. SAVE KIT: it changes within two seconds.
10. Save a kit and quit the standalone at once (Cmd+Q): start it again, and a new plug-in instance: both have the kit.
11. Standalone: rename the kit that plays (no SAVE KIT), quit, start again: the name is still there. Quit it, save a kit in a plug-in, start the standalone again: it has the plug-in's kit and still the renamed kit that plays.
12. KEEP MEMORY: OFF, SAVE KIT, KEEP MEMORY: ON: the file's date changes at once; a new instance has the kit and every kit saved before.
13. Make the memory folder read-only (`chmod 555`), SAVE KIT in the standalone: the editor says the file could not be written. Quit, `chmod 755`, start the standalone: the kit is there (not the old file's), and the file is written again.
14. Open an old DAW project and SAVE KIT into one slot: a new instance has that kit and every other slot saved before, not the old project's kits, patterns or songs.
15. Save a kit and at once use MIDI panic's restart (or install the ROM again): a new instance has the kit.
16. MM: load a storage image: a new instance has the image's kits, patterns and songs that differ from what you had.
17. Edit a pattern (a step, a lock), a song row and a global setting from the page: a new instance has each.
