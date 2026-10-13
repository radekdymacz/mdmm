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
2. MM: the Note · Slide · Swing row is gone (2026-10-12); see "MM: a trig's marks on the roll" below.
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
18. Two instances (a DAW and the standalone, or two in one DAW): save different kits in both, quickly one after the other: a new instance has every one.
19. Change the active global, mute tracks: the file's date does not change. MD standalone: change the tempo: a new instance has it. MD in a DAW (the machine follows the DAW's tempo): change the DAW's tempo: the file's date does not change.
20. Load the VST3 and the AU of one editor in one host and save different kits in each: a new instance has every one.

## Polish B (B-070, B-062, I-002, I-022, both editors)

1. MD (B-070): paint Swing on a few steps, then click one of those trigs off, drag-paint some off, cut a selection with swing in it, fill every 2nd step over swung steps: no swing mark flashes back on a step whose trig went. Rotate (Alt + ← →) moves the swing marks with the trigs; copy and paste a selection keeps them.
2. MM (B-062): Perform, press a key with the mouse and hold it: lit; let go: dark. Drag across the keys: only the key under the mouse is lit. Hold A, S on the computer keyboard: both lit, each dark when let go. Change the octave while holding: still right.
3. MM (I-002): play a MIDI keyboard into the standalone (AUDIO / MIDI panel input) and into a DAW track with the plug-in: the keys you hold light (any channel), chords too; let go: dark. Send all notes off from the DAW (stop): every key dark. A fast run of notes: the page stays smooth. Only notes on a channel the machine plays light (AUTO, the track channels, MULTI TRIG, MULTI MAP); another channel lights nothing. Hold a key and switch the MIDI input off, bypass the plug-in, or switch to HW MIDI: the key goes dark. In HW MIDI the real machine's own notes light nothing.
4. MD (I-002): GLOBAL base channel set, play a mapped track note on a MIDI keyboard: the track's number on the rail glows a moment (on Mix: its LED). Another channel: nothing. While the sequencer plays, a note does not cut a trig's flash of the Mix LED short. In HW MIDI no note lights a track.
5. Both (I-022): ⌘-click a value box (Ctrl-click on Windows): a field over it with its value, selected. Type a value, Enter: set; ⌘Z takes it back in one step. Type 999 or a word: refused, the field turns red and says the range (or the names), stays open; Esc leaves it. Tab to a value and press Enter: the field. Tab with a refused value keeps the field open; Enter on the tempo or a volume fader does what it did before. Double-click still sets the default, drag and wheel as before.
6. Both (I-022): signed values (PAN, EQG): type -10 or +10. MD: where a box shows a unit beside its number, its text works too. MM lists: on an LFO's WAVE or PAGE type a name in small letters (saw, flt); MM PAN: L12, C or R5.

## The gaps (wave 12, `feat/0.6-gaps`)

1. MM (MM-322): click MKI / MKII at the right of the top bar: the LCD turns light blue (MKI) or bluish white (MKII), the toast names the model's LCD; on MKI the machine list greys the MKII-only machines.
2. MD (MD-033): Sound, put TRX-BD on a track: a small arch over the gap between RAMP and RDEC, AMD and AMF, EQF and EQG, FLTF FLTW FLTQ, SPD and DEPTH. Point at RDEC: the tooltip names RAMP. A ROM machine: no arch on STRT and END. MID machines: the routing page shows CC5D CC5V CC6D CC6V PCHG (B-082).
3. Both (MD-043, MM-102): rename the kit that plays in the kit library, click another kit, Load without saving; then click **UNDO KIT**: the renamed kit plays again, edited, in its own slot (the LCD's KIT field shows it). With unsaved edits UNDO KIT asks first. HW MIDI: the button is off with the reason.
4. MD (MD-045): Clear a kit slot in the library (it asks), load it: every track GND-EMPTY, VOL 127, level 100; the master effects at their start values; the slot reads EMPTY. Cmd+Z brings the kit back. Reset machine > Empty reset leaves the same kits.
5. MD (MD-099): play a pattern, click › on the LCD (the next pattern blinks: queued), press STOP at once: the machine stops and the LCD shows the queued pattern as the current one; PLAY starts it from step 1.
6. MD (MD-106): a 16-step pattern with trigs on page 1 only: click LEN on the LCD to 32 (or 64): the trigs, accents, swing and locks of page 1 repeat on the new pages, a message says so; Cmd+Z takes it back. With a trig on a later page (hidden past the length) nothing is copied.
7. MD (MD-147): Song page, a row with Repeat 3 (×3): play the song: the playing row reads +2, +1, last, and the line over the bank letters ends 2 more, 1 more, last; the next row (×1) shows nothing. The playing row is marked as soon as PLAY starts (it used to show only from the second row).
8. MM (MM-083, MM-184, MM-203): draw locks in the lane over a few notes, right-click one of those steps and choose Clear locks (keep the notes): its locks go (every parameter), the note stays, the other steps keep theirs; ⌘Z brings them back. On a selection of steps it clears all of theirs.
9. MM (MM-201): Sequence, Locks tab, pick a parameter, ⌘-click a note (or drag on the ruler for several), click the lock key beside the bin in the rail header: each selected note gets a lock at the value the kit has now (the bar sits on the dashed kit line); one ⌘Z takes them all back. With no selection the key says to select steps first.
10. MM (MM-095): open the pattern chooser, ⌥-click a pattern (selected, not loaded), choose a kit in the Kit list: the pattern's tile shows the new K number, ⌘Z takes it back. On the pattern that plays the kit loads at once; with unsaved kit edits it asks first. Choosing in the Kit list no longer closes the chooser.
11. MM (MM-271): Song page, SONG, PLAY: the Arrangement header reads Playing · 001:01 and counts bars and beats as the song plays (through repeats and loops, as the machine's EDIT SONG header); STOP: the counter goes.
12. MM (MM-301): Perform › Multi map: a range's PAT list runs CUR, A01 to H16; choose H16, play a key in the range: the machine starts H16. ⌘Z takes it back.

## MM: a trig's marks on the roll (`feat/0.6-mm-foot`, 2026-10-12)

1. MM Sequence: under the roll there is no Note · Slide · Swing row, no hint line and no A F L dots; the roll is taller by that much (a MIDI track keeps its VEL row).
2. A note that fires only some envelopes shows their letters at the start of its bar (A, AF, L ...; small ticks where the bar is narrow); a note with all three shows nothing.
3. Over a note: a dot where the step has a lock, a small ramp where it slides and holds a lock (a slide on a step without a lock shows nothing), a teal slant where its trig swings (the default swing on empty steps shows nothing).
4. A trigless trig is a small hollow square in its step; a NOTE OFF has a small yellow lamp at the top of its step (OFF beside it where it ends no note).
5. Right-click a note (or the ⋯ of a selection): NOTE OFF, Trigless trig (locks only), Envelopes > Amp / Filter / LFO, Slide, Swing, each ticked when every selected step has it; Clear locks after Clear. Each sets every selected step; one ⌘Z takes it back.
6. Trigless trig on an empty step adds one at the track's pitch (draw a lock on it in the lane); choose it again: it goes with its locks.
7. On a MIDI track the menu has Slide and Swing, no Envelopes or Trigless trig.

## Review 1 fixes (`fix/0.6-review-1`, Radek's 0.6 review, 2026-10-12)

1. MM Sound, SWAVE-SAW: UNIW 127, UNIL 100, UNIX 80: the UNISON screen shows thin stems (dashed for the extended pair); SUB1, SUB2, SUBX up: thin stems on SUB too (B-090).
2. MM Perform, Multi envelope: ATK 73, DEC 0, SUS 127, REL 127: up to the top, held to the edge with ∞, every dot on the line. REL 40: the release falls to the foot, its dot there. Drag the REL dot to the right end: REL 127 (B-089).
3. MM: MKI and MKII (the plate key): both panels are the Machinedrum MKI's light grey, and so are the piano roll, the lock lane and the Sound and Perform screens; the top bar's LCD stays light blue on MKI, bluish white on MKII (I-023).
4. Both: GLOBAL opens as a dialog over the dimmed workspace; a click beside it does nothing; Esc or its back key closes it (B-091).
5. Both: open the kit library, the keys view (?), AUDIO / MIDI (,), the machine picker, Export SysEx…, Reset machine…: a click beside each leaves it open; Esc closes it (B-094).
6. Both: Import SysEx… a full backup, Import: the panel keeps its size from the preview to the report; Stop and Hide stay visible; hovering a slot shows its facts in a line over the footer, never over the keys. While it runs, Esc and a click beside it do nothing; Hide, then IMPORT SYSEX… in the engine menu: the same panel (or its report) again (B-094, B-095).
7. MM: a pattern with chords on T5, LIVE RECORDING, hold Delete over a few chord steps; then lock a value on Sequence and add a note: both taken, no message about chord notes (B-093).
8. Both, as a plug-in in a DAW: a new instance follows the DAW (TEMPO marked). GLOBAL › Sync › Tempo in INT: TEMPO edits, ▶ plays on the machine's own clock whatever the DAW does; save the project, reopen it: still INT. Tempo in EXT: follows the DAW again (I-026).
9. MD: Song page, slot 1 (the factory song), Load, SONG, ▶: the song plays; Space stops and plays it again (B-096; if it does not, note standalone or DAW and whether ▶ blinks).
10. MM: make an edit that sends a dump (paste a pattern), then at once ●: the LCD says it follows in a moment and recording starts when the dump is in; ● again during the wait cancels it (B-092).
11. Both, Sequence, the Lock parameter panel at the narrowest window: lock a few parameters (a DIST on SYNTH and on ROUTING on the MD): each key shows its name whole and the count beside it; the tip says SYN·DIST or RTG·DIST (B-097).

## Revert track and solo saved with the project (`feat/0.6-revert-solo`, 2026-10-13)

1. Both: Sound, a track as its kit slot stores it: **Revert track** beside the machine key is off, its tip says so. Turn a knob (or change the machine, an LFO shape, a relation on the MD; an assign row on the MM): the key turns on.
2. Click **Revert track**: the track is as the slot stores it, the other tracks and the master effects are untouched, the key is off. One ⌘Z brings the edit back (and the key); a second ⌘Z undoes the edit itself. Reload in the kit library still reloads the whole kit.
3. MM: on a MIDI track the key reverts its MIDI page only. Save the kit (Save): the saved sound is the stored one, the key is off.
4. Both: Mix, solo a track (the others go silent), save the DAW project (or quit the standalone), reopen it: the solo is still on (S lit on that track, the others muted), M edits still mean the mutes you had before the solo, and letting the solo go gives those mutes back. A project saved with no solo opens with none (B-123).

