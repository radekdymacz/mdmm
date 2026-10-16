# Ideas from users

*Feature ideas from beta testers and users (Discord, email). Not bugs: see
[BUGS.md](BUGS.md). Newest first. Each entry: who and when, the idea, status.*

## I-044 · Name the workspaces as the manuals do: SEQUENCE becomes PATTERN, SOUND becomes KIT

- **From:** a beta tester on Discord (suggestion to match the machines' manuals); decided by Radek, 2026-10-16.
- **The idea:** the first two workspace tabs are called PATTERN and KIT in both editors. Labels only: the internal ids (`data-ws` seq / sound, the CSS classes, journey names, key ids, saved setup values) are unchanged, so saved projects and tests keep working. Keys 1-5 and the layout stay.
- **Status:** built on branch `feat/0.8-tab-names`, not merged. Changed: the tab markup of both editors, the key view (group "Pattern", the workspace names), toasts, tooltips, journey narration, the guide (both editors), the feature rows' "where" fields, the site's front page captions. Left as they were: chapter titles of the manuals ("Sound synthesis: kits", the Sequencer chapters), the words "sound" and "sequencer" where they mean the machine's own, code comments, past release notes, and the site's screenshots (they show the old tab names until the next shoot).
- **Release-note line:** The first two tabs are now called Pattern and Kit, as in the machines' manuals (they were Sequence and Sound). Nothing else changes.

## I-043 · Filter envelope: a larger display with the full BOFS/WOFS range, the second window smaller (square) with attack and decay only

- **From:** the same tester, 2026-10-16 (0.7.0, Monomachine). The filter envelope display should be larger, and left/right on it show the full BOFS/WOFS range (-64 to +63, B-148); the second window smaller and square, with just attack and decay.
- **Status:** idea; needs Radek's call on the look (Sound > Filter env).

## I-042 · LFO preview: show the p-locked LFO values, not only the trig markers

- **From:** the same tester, 2026-10-16 (0.7.0, Monomachine). The LFO preview marks the trigs; it should draw the LFO as the locks change it.
- **Status:** idea; read the preview's code before sizing (locks on LF1-LF3 are in `S.locks` as `LF1.i`).

## I-041 · Kit: left/right navigation like the pattern selector

- **From:** the same tester, 2026-10-16 (0.7.0, Monomachine). The pattern selector has previous/next arrows; the kit selector should too.
- **Status:** idea; check what the kit field does today in both editors (the Machinedrum has the same field).

## I-040 · Computer keyboard: the octave range does not reach -2 to +8

- **From:** the same tester, 2026-10-16 (0.7.0, Monomachine). Z / X stop at -3 to +3 (`KEYS_OCT=[-3,3]`, `mmStudio/src/75-comforts.js:117`), seven octaves; the tester expects -2 to +8. The Perform page's own keyboard is clamped 0-6 (`130-main.js:207`).
- **Open:** is -3..+3 a choice or the machine's limit? The note range is 0-127 (clamped in `keyNote`); -2..+8 is wider than the 128 notes from a C3 base, so the base or the range label may differ from what the tester sees. Check the Monomachine manual before calling it a bug.
- **Status:** idea (bug if the manual says the machine's range is wider).

## I-039 · Song rows: show and edit mutes, transpose and tempo in the arrangement itself

- **From:** a beta tester on Discord, 2026-10-16: loves Song mode and wants more song options: per-track mutes, per-track transpose and BPM per row.
- **Today:** the editors have all three (feature rows MD-149/MD-157, MM-199/MM-263/MM-264/MM-266/MM-267, as on the machines: MD rows hold pattern, REP, BPM, offset, length, mutes; MM rows hold pattern, repeats, transpose, per-track transpose TR1-6 + six MIDI, offset/length, mutes 6 + 6, BPM). But the arrangement cell shows only the pattern name, `x` repeats and a `~` for offset/length (`mdDeskSong.js:116-120`, `120-song.js:125-128`); mutes and per-track transpose are behind the selected row's inspector > More (`data-rowmute`, `data-rowmore`), and the tempo behind a Keep toggle. The tester probably does not know they are there, or wants them at a glance.
- **The idea:** small marks on the arrangement cells (a tempo number when the row sets one, a mute dot, a transpose number), without a new row above the grid; the inspector stays the place to edit. Needs Radek's call on the look.
- **Status:** idea; first answer the tester that the options exist (Row > More), then decide on the marks.

## I-038 · SysEx import: make the read-back (the second scan) optional

- **From:** a beta tester on Discord, 2026-10-16: the second scan that verifies a SysEx transfer should be optional.
- **Today:** an import is Read the slots (only when the editor does not know them yet), Send, Read back (`SyxJob`, `mdJucePlugin/mdSyxSession.h:49` phases Before / Sending / Reading; the page `skins/shared/deskSyx.js:308`). The read-back compares each slot with the file and fills the report; Verify only is a separate button. Both editors, one code path.
- **The idea:** a tick "Read back and compare" on the import panel (on by default), off = Send then done, report says "not checked". Saves the read time (a pattern per 1.7 s at cable speed). Needs Radek's call where the tick sits.
- **Decision (2026-10-16):** the tick sits beside Verify only in the import footer, on by default (PLAN-0.8 WP10 F).
- **Status:** built on branch `feat/0.8-syx-readback-option`, not merged. The page sends `readBack: false` with `syxImport` when the tick is off (absent means on). Off: the Read the slots phase before still runs where the editor does not know a slot, Send, then done; the report is `{readBack: false, sent, commands, unsent}` and says "n sent, not read back", never "imported". The choice is kept in the page's storage (`deskSyx.readBack`), not in the editor setup: the setup (`MDSK`) is what a DAW project restores (modulators, knob CCs, solo), this is the person's habit, and the page already keeps such conveniences in storage (the transport's delayed start). Reset machine… and Verify only always read back. Tests: `syxImportTest` (job, both paths), `deskSyxTest.js` (tick, saved state, report), journeys `md-lib-syx-noreadback`, `mm-lib-syx-noreadback`.

## I-037 · Piano roll: deleting a note should let the note before it fill the gap, not write a note off

- **From:** a beta tester on Discord, 2026-10-16: deleting a note produces a note off, which is usually not wanted; the previous note filling the gap would fit better.
- **Today (Monomachine only; the Machinedrum has no note off):** `MmRoll.remove` (`mmStudio/src/58-roll.js:41-43`, used by `rollRemove`, `70-seq.js:206`) puts a NOTE OFF where the removed note began when the note before it ran into it, so the earlier note keeps its length. The machine itself does not: a synth note sounds from its trig to the next NOTE OFF or trig (header of `58-roll.js`), so clearing a trig on the machine lets the earlier note run on.
- **The idea:** the removal writes nothing but the removed trig (and, as now, its own closing NOTE OFF), as the machine does. Alt-click and the erase drag use the same function.
- **Status:** built on branch `feat/0.8-mm-note-edit` (0.8, WP10 C; Radek left the call to Claude: A, machine-like). Deleting a note (Alt-click, the erase drag, a double-click, Delete / Clr / the step menu's Clear) writes no NOTE OFF; the note before runs on through the gap. A NOTE OFF that only closed the deleted note goes with it. Cut (⌘X) and a moved selection write none either (a NOTE OFF that only closed the cut or moved note goes with it). Tests: `mmRollTest`, `mmViewTest`, page journey `mm-roll-delete-gap`.

## I-036 · Notes: a click keeps the note selected, arrows move it, Delete removes it, double-click removes a note

- **From:** a beta tester on Discord, 2026-10-16: clicking a note should keep focus (now it needs a ⌘-click) so the up/down arrow keys move it; Delete while the note is held is awkward; maybe a double-click removes a note.
- **Today:** a plain press on a step paints (toggles the trig) and ends the selection (Machinedrum `mdDeskGestures.js:218-221`; Monomachine step grid `clickStep`, `70-seq.js:101-106`); only ⌘-click selects. In the Monomachine piano roll a plain click already selects the note (`rollSelectDown`, `70-seq.js:225`). Up/Down with a selection moves the selection to the next track (`track-prev-next`, `75-comforts.js:145`), never the pitch; Delete clears the selection (`77-select.js:49`). There is no double-click on steps.
- **The idea:** (1) a click on an existing trig selects it instead of removing it (the toggle moves to the empty step or the double-click); (2) Up/Down on one selected note changes its pitch (Monomachine; on the Machinedrum a trig has no pitch, so only left/right); (3) double-click removes.
- **Status:** built on branch `feat/0.8-mm-note-edit` (0.8, WP10 D; Radek left the call to Claude: A). A click on a note (Monomachine roll) or a trig (Machinedrum grid) selects it and keeps the selection; an empty step still draws (drag-paint from an empty step kept); a double-click removes the note or trig (one undo step); Delete / Backspace remove the selection; Monomachine: ↑ / ↓ with exactly one note selected change its pitch a semitone (⇧ an octave), one undo step per press, otherwise ↑ / ↓ stay the track move; ⌘-click still adds to the selection. The Machinedrum has no pitch, so ← → move the selection as before. `clickStep` (70-seq.js) is not wired to the pointer any more and is left for the firmware self-test. Tests: `mmViewTest`, `mmKeysTest`, page journeys `mm-note-click-arrows`, `md-step-click-select`.

## I-035 · Lock lane: a thicker kit-value line, drag it to change it, the value as a number on the line

- **From:** a beta tester on Discord, 2026-10-16: the dashed line that shows the current parameter value should be thicker; it should be changeable by ⌘-drag (or similar) so all the editing happens in the lock window; the value should be a number below it instead of only on hover.
- **Today:** the dashed line is `.lb .base` (a 1 px dashed border at 55 % opacity: `mdStudio/mdDesk.css:139,1152`, `mmStudio/src/*.css`), drawn per trig by `baseHTML` (`70-seq.js:83`) and `mdDeskSeq.js:87`. A lock's value is only in the tooltip (`title` "Locked 64" / "Kit value 64"); the kit value is in the lane's left scale (`.lbscale`, MM only) as a number. A plain drag draws locks (`laneAt`, `mdDeskGestures.js:11-18`); changing the kit value itself is done on the Sound page.
- **The idea:** (1) 2 px line, full opacity; (2) ⌘-drag on the lane moves the kit value (the same value the Sound page edits), shown live; (3) the lane shows the number of the value under the pointer or of the selected step in a small readout under the lane, always visible.
- **Status:** built on branch `feat/0.8-lock-lane-value` (0.8, WP10 E; Radek left the call to Claude: the line itself is dragged, no modifier, no new strip, the layout stays). The kit line is 2 px, solid, full strength, on every key with a trig (and on the Monomachine's ghost keys). Its number sits on it at the lane's right end (the last key with a trig), in the form the knob shows (a signed parameter -64..+63, a Monomachine list or table parameter by name). A lock's number sits at its bar's end while the pointer is on the step or the step is selected. A press within 4 px of the line grabs it (cursor ns-resize); dragging changes the kit value of the lane's parameter on the track, the edit the Sound page's knob makes, one undo step, and draws no lock (a press near the line is a click until it moves more than 3 px up or down: released before that it sets the lock like any click); the Monomachine's old kit number on the left scale is gone (the line carries it); Alt (erase) and Shift (ramp) presses stay the lane's, and a press anywhere else draws as before. Tests: `mdDeskPageTest`, `mmLockLaneTest`, page journeys `md-lane-kit-drag`, `mm-lane-kit-drag`; the journey hands keep 9 px off the line when they press the lane (`deskJourney.js` pointIn).

## I-034 · GEN settings: Keep on for every track by default, placed between the patterns and the mutes/solos

- **From:** a beta tester on Discord, 2026-10-12 (0.5.1 / 0.6 line).
- **The idea:** (1) make the GEN setting "keep" the default for all tracks; (2) put the GEN settings column to the right of the patterns column and before the mutes/solos column, because they act on the patterns, and so the mutes/solos column sits right beside the track names (easy to see what is muted or soloed); (3) a panel/frame round the GEN column so it reads as separate from mutes/solos.
- **Today:** 0.7.0 has a GEN dialog on every track's dice key (release note 2026-10-15); the placement and the Keep default are not discussed in the log.
- **Status:** idea; ask the tester whether 0.7.0's GEN dialog answers it.

## I-033 · Ableton Link for the standalone apps, and the Machinedrum and Monomachine apps that find each other

- **From:** Radek and a beta tester on Discord, 2026-10-10 and 2026-10-14. Radek (10-10): wants the MD and MM standalone apps to detect each other and sync "like in the real world, no need for a DAW" (even two laptops over Wi-Fi), then record jams. Radek (10-14): "thinking about adding Ableton Link for standalone apps". The tester (10-14): "Ableton Link would probably be more accurate than MIDI sync" (after trying Ableton -> the standalone over the IAC driver: notes, sync and remote start worked, B-154).
- **The idea:** Link (tempo and beat phase) in the standalone apps, a switch next to GLOBAL Tempo in (INT / EXT / LINK); optionally songs and patterns that follow each other between the two apps, as two linked machines do.
- **Notes:** Link's SDK is GPL-3 or commercial; the editors are GPL, so it fits, but the licence has to be checked. In a DAW the host's clock stays the source. The standalone's MIDI clock in (IAC) already works (B-154 is about the sound that follows it).
- **Status:** idea; Radek decides.

## I-032 · Mix: a level meter per track, and one per output (the mix buses)

- **From:** a beta tester on Discord, 2026-10-16, 0.7.0 ("meters for each track on the Mix tab, and the same for the MIX buses or the summed levels").
- **Today:** the only meter is the LCD's (I-021): the main output's left and right after the volume, and a clip mark for every output (`mdJucePlugin/mdOutputLevel.h`). The plug-in has three stereo outputs, Main A/B, Out C/D and Out E/F (`mdPluginProcessor.cpp:541`), which carry the machine's own outputs; the emulation gives no audio per track (the DSP mixes the voices inside the firmware), so a true per-track meter is not a cheap tap (the same finding as I-028).
- **The idea, what is honest:** (1) a meter per output pair on Mix (A/B, C/D, E/F): cheap, the plug-in already takes the peaks of every output once a block for the clip mark; on the Monomachine a track routed alone to C/D or E/F would then have its own meter. (2) Per track, the rail lamps of I-028 (trig activity from the pattern, no audio) beside each fader, not a level. A real per-track level needs a tap in the DSP emulation: research, not planned.
- **Status:** planned for 0.8 (WP9, doc/release/PLAN-0.8.md).

## I-031 · A lamp in another colour on a track that plays because another track triggered it

- **From:** a beta tester on Discord, 2026-10-16, 0.7.0 ("a blue LED lit up on a track if it was triggered from another track").
- **Today:** the rail lamps (I-028) light a track only for its own trigs (Monomachine `mmStudio/mmMockup.js` ~6239, Machinedrum `mdStudio/mdDeskTop.js:325`). A track that plays because of the Monomachine's kit Trig position (`trigpos`, Sequence > Trig setup: "Also play T2") or the Machinedrum's trig group (`trigGroup`, `mdDeskSound.js:82`) stays dark.
- **The idea:** light that track's lamp too, in a second colour (blue, or the LCD ink), from the same data the lamps use: the step telemetry, the pattern and the kit's trig relations, no audio. Each track has one trig relation, and the forwarding follows on from track to track (T1 to T2 to T3, at most six hops), so it stays a short look-up a step.
- **Status:** built on feat/0.8-mm-tester-items (WP9), Monomachine only. The data exists on the page: a track's `trigpos` (Sequence > Trig setup > Trig position) names the track its notes are forwarded to, and the forwarding follows on (T1 to T2 to T3, as the journey mm-seq-trig-setup shows). On Sequence and Sound, when a track's own trig lights its rail number, the tracks it forwards to light in blue (`trig2`, `--fwd`) unless they trig themselves on that step; a muted track or one a solo leaves out stays dark. Page only (`130-main.js` railLamps, fwdTargets; `20-mm.css`), journey `mm-seq-rail-lamps-forwarded`. The Machinedrum is not done: its trig group (`trigGroup`) is a different relation (one track's trig plays another's machine), to be decided; the Mix strip squares do not show it either.

## I-030 · Name the trig mark of the lock lane (red and green)

- **From:** a beta tester on Discord, 2026-10-16, 0.7.0 ("in the locked parameters view some trigs were green and some were red at the top, what is that?").
- **Today:** on the Monomachine's lock lane each step with a trig has a small mark at its top: red when the trig fires all three envelopes (AMP, FILTER, LFO), green when it fires only some of them or none (a trigless trig) (`mmStudio/mmStudio.css:1617-1619`, `src/50-state.js:55` stepKind). The step's tip says only "Locked …" or "Kit value …", and the guide's PARAMETER LOCKS section (`doc/guide/mm/13-parameter-locks.md`) does not mention the mark; the roll's step legend (?) names trigless trigs but not this mark.
- **The idea:** say it where it shows: the lane step's tip adds "all envelopes" / "some envelopes" / "trigless", and one sentence in chapter 13 ("A red mark at the top of a bar: the trig fires every envelope; green: only some, or none"). No new control.
- **Status:** done on feat/0.8-mm-tester-items (WP9): the lane bar's tip ends with "all envelopes", "some envelopes" or "trigless" (`70-seq.js`), and doc/guide/mm/13-parameter-locks.md says what the red and green mark mean.

## I-029 · A quick way back to the original sound while you play with the Sound page

- **From:** Radek, 2026-10-13 ("when you play with the Sound page, a way to quickly restore the original settings").
- **Today:** the kit library's **Reload** loads the whole kit again from its slot (bug B-122 notes it). Nothing puts back one track.
- **Built on `feat/0.6-revert-solo`, both editors:** **Revert track** beside the machine key on the Sound page (no new row). It puts the selected track back as the kit's slot stores it, in one undo step: the Machinedrum's machine, its 24 values, level, LFO and the two relations; the Monomachine's machine, seven pages, level, outputs and input, assign rows, key tracking, portamento and legato bits and where it forwards its notes (a MIDI track: its MIDI page). Other tracks, the master effects, the multi envelope and the name stay. The key is on only while the track differs from the slot (Reload = the whole kit, this = one track). Core command `revertTrack {k, t}`.
- **Status:** built, not merged.

## I-028 · A lamp beside each track name that shows which track is playing

- **From:** Discord, 2026-10-12 ("blinkers next to the track names on the pattern and sound pages, to see where sounds come from"); the same need as a per-track meter in Mix (later: per-track audio is not a cheap tap).
- **Built on `fix/0.6-discord`, both editors:** on Sequence and Sound, a track's number on the rail lights for a moment when its trig plays (the Monomachine: the synth or MIDI tracks the rail shows), from the step telemetry and the pattern, no audio; a muted or solo-silenced track stays dark. No new control and no new row: the number box glows as it does for a note from a MIDI keyboard (I-002, the Machinedrum) and as the Perform page's lamps (the Monomachine). All the lamps of a step are set in one animation frame. Page journeys `md-seq-rail-lamps` and `mm-seq-rail-lamps` (PLAY for 2.5 s: only tracks with trigs light; none stays lit after STOP).
- **Status:** built, not merged.

## I-027 · Plug-in: its own MIDI in and out ports, on top of the host's MIDI

- **From:** Discord, 2026-10-10 and 2026-10-11 (a virtual port and a Max patch beside the DAW). The tester was told it is on the list.
- **The idea:** the plug-in can open MIDI input and output ports of its own (as the standalone does), in addition to the MIDI the host routes to it, so a patch or a controller can talk to the editor directly.
- **Status:** later (not 0.6): needs port handling in the plug-in layer; the standalone already has it.
- **More (Discord roundup, 2026-10-16):** [MIDI] a Max-patch user wants outboard MIDI channels or a virtual port next to the host MIDI (2026-10-10, 10-11). Radek's first answer (10-10: MIDI out "should be fixed in new release, settings in GLOBAL top right") was wrong and was corrected on 10-11: the port choice is not in yet; the workaround is DAW routing (a MIDI track from the interface input to the plug-in; the plug-in's MIDI out to a track with the interface output).

## I-026 · In a DAW: the machine's own clock (GLOBAL Tempo in INT)

- **From:** Radek's 0.6 review, 2026-10-12: in the plug-in he must be able to switch the machine to its internal clock. `followHost` set EXT and set it again every 2 s, so Tempo in INT did not stick in a DAW and TEMPO edits were refused ("The DAW sets the tempo").
- **Built on `fix/0.6-review-1`:** the existing GLOBAL › Sync › Tempo in (INT / EXT) is the switch, both editors, no new control. EXT: the machine follows the DAW's tempo and transport (a new plug-in instance starts so: `followHost` sets EXT once). INT: the machine runs on its own clock and tempo, TEMPO edits, `followHost` sets nothing, and the plug-in no longer sends the host's clock and transport (`synthLib::Plugin::setHostClock`). The global is the machine's, saved with the project, so the choice is too: a project that comes back with INT keeps it (`deskCore::HostClock`, the processor's project state). Machine memory (wave 11): the global's host bytes are left out of the memory file only while the machine follows the host; with INT the tempo is a normal save. Tests: `deskCoreTest` (the policy), `mdDeskFirmwareTest hostclock` and `mmDeskFirmwareTest hostclock` (INT stays through three followHosts, PLAY runs on the machine's own clock, EXT again turns it on). Guide: md chapters 1, 8, 10; mm chapters 2, 12, 19; rows MD-093, MM-198, MM-297.
- **Status:** built, not merged. The DAW itself is in the release's host tests (no host journey here: the page tier has no DAW).

## I-024 · Saved kits and patterns stay on the machine for every new session

- **From:** a user, 2026-10-12: "save kits and patterns created/edited and saved in the editor so they persist on the device each time I open the plugin in a new session".
- **Today:** the machine's memory (kits, patterns, songs, globals) is saved in the DAW project and, for the standalone, when the app quits. A new DAW project, or a new instance of the plug-in, starts from the factory memory. So a kit saved in one project is not there in the next one. A real machine keeps what you save.
- **Way A (machine memory file, as a real machine):** one memory file per machine in the editor's user folder. A new session with no project state starts from it. Each SAVE KIT, SAVE PATTERN, song or global save also writes it. An existing DAW project still opens with its own memory. A menu item starts from factory memory again. Risk: two instances of the same machine both write the file; the last save wins.
- **Way B (start-up memory, by hand):** a menu item "Use this memory for new sessions" copies the current memory into the file; new sessions start from it. Nothing is written by itself. Simpler and safe with many instances, but the user must remember to do it.
- **Status:** Radek, 2026-10-12: way A, with a setting to turn it off. Planned for 0.6 (wave 11, PLAN-0.6.md). Built on `feat/0.6-memory` (doc/modern-ux/DESIGN-machine-memory.md): one file per machine in `<data folder>/memory/`, a session with no project state starts from it, a watch thread writes each save, the engine menu's KEEP MEMORY, RESET MACHINE…'s Start from factory memory…; the standalone starts from the file too.
- **More (Discord roundup, 2026-10-16):** a tester (2026-10-14): in the standalone, saved kits and patterns persist across restarts; he asks for the same in the plug-in. No new request.

## I-023 · Monomachine: a real MKII look (silver panel, bluish-white LCD with black text)

- **From:** Discord tester M, 2026-10-11: on the Monomachine "the MKI/MKII button does nothing"; on the Machinedrum it changes the skin. Wants the Monomachine MKII look: silver, black and white, the MKII LCD's bluish-white background with black text.
- **Why nothing changes today:** the MM plate key flips `data-plate` and enables the MKII-only machines, but `mmStudio.css` (~line 1017) gives MKI and MKII the same colours; only a small "MKII" print differs.
- **The look (from a product photo of the SFX-60+ MKII):** brushed silver aluminium panel; a black glass window round the LCD and knobs with the red dot-matrix MONOMACHINE logo; a positive LCD, bluish-white background with black pixels; black keys, white ENTER / EXIT and track keys, a red COPY key; dark brown label bars under the keys with white text; red LEDs, yellow track LEDs; black knobs. Colours to be sampled from photos before building.
- **Sampled 2026-10-11** (pixel averages from product photos; photo white balance varies, so treat as a starting point): SFX-60+ MKII (Vintage King): panel #e9e9e9, key area #ffffff, display window #010101, LCD ground #f2fcfb, LCD pixels #0e1a19, black keys #0a0a0a, white keys #fbf9f7, COPY #e33b21, knobs #010101. SFX-60 and SFX-6 MKI (Vintage Synth Explorer): panel #b2bcbe to #c4c3c3, window #010101 to #323232, LCD ground #b6dde1 to #cfdff0 (light blue), pixels #000000, COPY #f22518, knobs #323d2f (dark green-grey). Ours today (both plates): panel #d4d5d0, LCD #b9c4b0 (grey-green), ink #172014, bezel #0d0f0c, labels #a04d39.
- **Built on `feat/0.6-skins` (2026-10-12, not merged):** the Monomachine true to the product photos, the plate key chooses the look: MKI light-blue LCD, MKII bluish-white LCD, each with its own panel, keys and label colours. The Machinedrum Editor is unchanged by choice (Radek, after the side-by-side comparison: keep the light MKI with the green LCD and the dark MKII), although its photos show silver with a red LCD on both. Final tokens and the photos they came from: [doc/modern-ux/SKIN-COLOURS.md](../modern-ux/SKIN-COLOURS.md).
- **Status:** Monomachine skins accepted by Radek; on its own branch, not merged yet.
- **In the manual review (Radek, 2026-10-12):** the MM MKII panel in 0.6 (`#d2d1cc`) reads as warm grey, not silver. Make it a light cool silver near the photo sample (`#e9e9e9`), fixed while Radek tests the installed 0.6 by hand, without running the automatic tests again for it.
- **Review 1 (Radek, 2026-10-12):** instead, both MM plates take the grey of the Machinedrum's MKI light plate (`--plate` #d9dad6, `--plate2` #cdcec9, `--plate3` #e5e6e2); the big screens (piano roll, lock lane, Sound and Perform plots) take the same grey (`--scr` #cdcec9) instead of the LCD colour; the top bar's LCD keeps the MM colours (MKI light blue, MKII bluish white). Built on `fix/0.6-review-1` (journey `mm-plate-greys`; SKIN-COLOURS.md).

## I-022 · Type a parameter value

- **From:** Discord tester M, 2026-10-11: "being able to type in specific parameter values", as Monomodule and other software instruments.
- **Today:** no value box takes typing; double-click resets to the default (MM `mmMockup.js` ~4694, MD `mdDeskGestures.js` ~171).
- **Idea:** a way to type a value into any parameter (both editors), without losing double-click = default. The gesture to be decided (for example Enter on a focused value, or a modifier + click).
- **Chosen (0.6, polish B):** ⌘-click a value box or fader (Ctrl-click off a Mac), or Enter on one that has the focus (Tab to it). A field opens over the box with the value as the box shows it, selected; Enter sets it, Esc or a click elsewhere leaves it. Why: double-click stays the default, a plain click and drag stay the drag, Alt stays Control All and Shift fine, and right-click is out (Radek's rule, and Ctrl-click is a right-click on a Mac). ⌘ on a value had no meaning yet. Enter is the keyboard path to the same field. No new control: the box itself takes the gesture; the field lives only while typing.
- **What may be typed:** what the box shows. A number takes the nearest value (1200 on a box that shows 1196 or 1210); a signed box takes -64 to +63 with or without the +; a list takes its names in any case (an LFO's wave, a page, OFF), the MM PAN L12 / C / R5 or the number, an MD unit's text ("1/16", "250 ms") or the box's own number. A number past the ends, or a text the box never shows, is refused in the field (red, the range or the names in its tip and a toast) and the field stays open. One edit, its own undo step.
- **Status:** done in 0.6 (polish B): `skins/shared/deskValueEdit.js` (both editors), deskValueEditTest.js, journeys md-sound-type-value and mm-sound-type-value. The machine-name picker and other menus keep their own lists.

## I-021 · An output meter and master volume in the LCD (both editors)

- **From:** Radek, 2026-10-11.
- **Idea:** a small level meter in the LCD (beside LOCKS / COPY CLR PASTE) showing the editor's whole output, which is also its master volume: drag it (or scroll) to set the plug-in's output gain, double-click for 0 dB. One gain for the whole plug-in output (main and the extra outputs alike), applied after the emulation in the plug-in layer, so the emulated machine and its own volume settings are untouched (the goldens measure the emulator's output and stay bit-exact). Peak hold and a clip mark; saved with the project and the standalone's settings; automatable as a plug-in parameter if cheap.
- **Decided (2026-10-11):** one plug-in-layer gain after the emulation on every output bus, beside the machine's own volume settings (they stay as they are); -60 dB (off) to +6 dB, 0 dB by default; peak meter, instant attack, about 300 ms release, peak hold 1.5 s, clip mark. Radek: vertical, at the LCD's right end, stereo.
- **Built for 0.5.1** (branch `feat/lcd-volume`): a strip at the LCD's right end, both rows tall, both editors, plug-in and standalone: two thin bars (the main output's left and right after the volume) each with its peak hold line, a clip mark at the top (lit when any output, main or extra, went over 0 dBFS; a click clears it), and the volume as one line across both bars on the same scale (-60 dB at the foot, +6 dB at the head, a tick at 0 dB). Drag up or down (2 px a dB, Shift five times finer), scroll (a dB for each 100 px), double-click for 0 dB; at the foot it is off. While the volume changes, the dB shows under the LCD (the LCD's tip). Only the LCD's ink and ground, no red. 30 px wide; up to 1500 px window width 20 px, so the Machinedrum's top bar still fits at 1280 and 1440 px (its LCD has no spare width there). The volume is `pluginLib::Processor`'s existing output gain (applied after the emulation, now ramped across a block when it moves, so no zipper; the standalone's fade on quit is smoother too), so the emulated machine is untouched and the bit-exact goldens cannot change. Saved with the project (the GAIN chunk that was already there) and so in the standalone's saved state (written when the app quits). Cost: one pass over the enabled outputs and three lock-free maxima a block, no lock, no allocation; the page gets `outputLevel` every 250 ms (`peakL`, `peakR`, `clip`, `gainDb`) and sends `outputGain {db}` (mdOutputLevel.h, mdDeskSession.cpp, skins/shared/deskVolume.js; data-contract.md). Tests: `mdOutputLevelTest`, `deskVolumeTest`, `mdAudioIoLayoutTest` (the ramp); journeys `md-lcd-volume`, `mm-lcd-volume`.
- **Not done:** a host-automatable parameter. The editors' parameter list is the machines' (built from the controller's descriptions); a volume parameter would be a new entry in every host's list, must stay in step with the saved GAIN chunk and the page, and is not cheap enough for 0.5.1. The volume is saved with the project, not automated.
- **Status:** built for 0.5.1, branch `feat/lcd-volume`, waiting for Radek's play test and the journeys.

## I-020 · LCD-only mini view: a minimise icon in the LCD's top-right corner shrinks the editor to just the LCD

- **From:** a tester on Discord, 2026-10-11 (feature request); Radek: "great idea".
- **Idea:** a small minimise icon in the top-right corner of the LCD itself shrinks the editor window to the LCD alone (its own strip: the machine's screen with pattern, kit and tempo). The same icon on the mini view, or Esc, restores the full editor at its previous size. Not a double-click on the LCD (Radek, 2026-10-11): the LCD keeps its own clicks and drags. Handy in a DAW with many plug-ins open: the editor stays visible but takes almost no room.
- **Shape:** both editors, plug-in and standalone; the page switches to a compact layout and asks the window for the LCD's size (the plug-in editor resizes itself; hosts that refuse a resize keep the full size and the page just centres the LCD); the mini size and state are remembered per instance; the LCD keeps its clicks (tempo drag, pattern ‹ ›) in mini view. Check how Logic, Ableton and the standalone handle a plug-in shrinking itself.
- **Status:** new.

## I-019 · Trigless locks on the Machinedrum (as the Monomachine Editor has)

- **From:** Radek, 2026-10-11, after a Discord conversation: the Monomachine Editor already offers a trigless step (a step that carries only parameter locks, no note; step menu "trigless"); the Machinedrum Editor does not.
- **Idea:** offer the same on the Machinedrum, for the next release, **only if OS 1.63 supports it**. Today a Machinedrum lock lives in the lock lane and needs a trig on its step.
- **First:** a firmware probe (mdDeskFirmwareTest section): write a lock on a step without a trig the way the MD's own pattern format allows (if it has a bit or slot for it), read the pattern back from the machine's memory, and check by ear and by the output whether the machine applies the lock without playing a note. If OS 1.63 cannot, say so in the guide and close the idea (custom firmware such as X.13 may differ: I-016).
- **Probe (2026-10-11, `mdP4ProbeFirmwareTest <ROM> trigless`, OS 1.63):** track 1 a GND-SIN with the longest decay (it sounds through all 16 steps), the other tracks GND-EMPTY; each pattern sent as a SysEx dump (as the editor sends it), read back, played two loops, loop 2 measured step by step.
  - **The format holds it:** there is no trigless bit; a lock is a value in its (track, parameter) row, 0xff = none, and nothing ties it to the trig bits. A lock on a step without a trig (VOL 0 or PTCH 127 on step 5, trigs on 1 and 9) is kept: the read-back has the lock, the lock mask bit and the trigs unchanged.
  - **The machine does not play it:** with the lock on trigless step 5 the sustaining sine is unchanged on steps 5-8 (rms 0.099 with and without the VOL 0 lock; pitch 245 Hz with and without the PTCH 127 lock), and it does not carry to the next note (step 9 rms and pitch as without the lock). No note starts at a trigless locked step (trig on step 1 only, VOL 0 locked on step 9: no onset, steps 9-16 as without the lock, ratio 0.999). The control with a trig on step 5 applies the same locks at once (VOL 0: rms 0.000 on steps 6-8; PTCH 127: 10 kHz).
  - **The front panel cannot make one:** grid recording, TRIG 5 held on an empty step and knob A turned sets a trig on step 5 with the lock.
- **Status:** not supported by OS 1.63 (closed). The user guide says a Machinedrum lock needs a trig. Custom firmware such as X.13 may differ (I-016).

## I-018 · A CPU meter in the editor's top bar (both editors)

- **From:** Radek, 2026-10-11, testing 0.5.0 in Ableton Live ("add a CPU meter somewhere around here", next to SETUP and the version).
- **Idea:** a small meter in the top bar's SETUP corner showing how much of the audio deadline the emulation uses (the share of each audio block's real-time budget spent rendering, smoothed, with the worst recent block marked), so a user sees headroom and drop-out risk without the DAW's meter, and testers can compare Developer > Speed-ups on and off at a glance. A click opens the performance details (realtime ratio, buffer, sample rate, Rosetta). The data exists: the session record's render timing and the boot lines' realtime ratio.
- **Built for 0.5.1** (branch `feat/cpu-meter`): `CPU ▮▮▯` after the version in the Setup label, both editors, plug-in and standalone. The share is processBlock's whole call (the emulation, the resampler, MIDI) against each block's budget (frames / sample rate), smoothed over 0.5 s; a tick marks the worst single block of the last 3 s. Only the page's ink and plate, no red: a block over 100 % shows as a thicker, hatched bar. The number (or STOPPED, BYPASS, RENDER, NO AUDIO instead of 0 %) shows on hover and while the details are open. A click opens the details ("CPU: audio deadline, this editor (one core)"): average, worst block, what the share is of (one core's time for this editor's audio; the page runs elsewhere), machine speed, the host's rate and block size, the speed-ups (all on, off, or which are off; L3), native or Rosetta, and under them the editor menu's own switches: Speed-ups (ticked when on), Speed-ups (each)… and, on the Machinedrum, L3, so the meter is where speed-ups are compared. Cost: two clock reads and a few relaxed atomic adds a block (about 35 ns on an M-series Mac), no lock, no allocation; the page gets a `cpuLoad` message every 250 ms (mdCpuLoad.h, mdDeskSession.cpp, skins/shared/deskCpu.js; data-contract.md).
- **With it (Radek, 2026-10-11):** the brand block is short ("MD / EDITOR", "MM / EDITOR"; the full name in its tooltip, the window title, About and the menu), and every top-bar key fits at 1280 and 1440 CSS px (skins/shared/deskTopFit.css; the journeys `*-top-cpu-meter` check it). The Speed-ups switches: Radek's Machinedrum stayed on "Speed-ups off"; with his settings (legacyEmulation 1) in a sandbox the page menu and the details turn it both ways on both hosts (journeys `*-dev-speedups`: the machine's state, the saved setting and the tick, every lever). Fixed on the way: the menu's switches read the machine's state when chosen, not when the menu was built, and the macOS menu bar's Editor menu is built again each time it opens (JUCE dropped its delegate after the first rebuild, so it kept old ticks and actions). The native editor menu (the one shown when the page is not up, built by `jucePluginEditorLib::toPopupMenu`) gave every entry item ID 0, which JUCE's popup never triggers: a click closed it and ran nothing; each entry now has an ID of its own (`mdProcessorHooksTest`). Every speed-up switch change is a line in the start-up log (`speed-ups: on|off, levers off …, L3 on (menu | start, settings | start, env … | changed, not by the menu), saved legacyEmulation=… speedUpLeversOff=… exactEssiTiming=…`), and every editor-menu pick too (`editor menu: pick n (id) of menu m`, or why it was not run). The old key `legacySimStepping` is read nowhere since 0.5 (ruled out).
- **Menu wording (Radek, 2026-10-11):** "Speed-ups off (legacy emulation, slower)" read backwards (ticked meant off). Now Developer > "Speed-ups (faster, same sound)", ticked when the speed-ups run (the default); the levers under "Speed-ups (each)" are greyed and unticked while it is off. Same saved setting (`legacyEmulation`, inverted only in the menu).
- **Status:** built for 0.5.1, waiting for Radek's play test.

## I-017 · Drag and drop files onto the editor

- **From:** Radek, 2026-10-09.
- **Idea:** drop files from the Finder onto the editor window: a ROM installs it, a `.syx` opens the SysEx import window, samples load into the Sampler.
- **What can be dropped where (macOS only for now):** anywhere on the window. A **ROM** (`.bin`, or a `.zip` with it): asked first ("Install … as the firmware? The machine starts again with it."), at once on the start-up card when no firmware runs yet. A **SysEx file** (`.syx`): the SysEx import window opens with its preview, as **Import SysEx…** does; one file a drop. **Samples** (`.wav`, `.aif`, `.aiff`; Machinedrum UW): open the Sampler and select a ROM slot (or drop onto a ROM slot's tile): the sample goes into that slot; several go into that slot and the ones after it, one after another, after one question. Anything else is named in a note. While files are over the window a frame says what it takes. Windows and Linux: not yet (the web view there takes the file first; it is not opened).
- **Status:** shipped in 0.4.0 (macOS), design in [FOUNDATION.md](../modern-ux/FOUNDATION.md), "Files dropped on the window"; tried by the page tests and the journeys, the Finder drop by hand still to be confirmed by testers. Windows and Linux open: the web view takes the file first (WebView2: `put_AllowExternalDrop(FALSE)` should hand it to the window, as the macOS hook does; webkit2gtk: the drop lands on the page), see the two TODO notes in `mdWebPageHost.cpp`.

## I-016 · Run a custom firmware (ems-monomachine-firmware, ems-machinedrum-firmware) in the editor

- **From:** Radek, 2026-10-09, after the Octahackers Discord thread on custom firmwares. Decided: a spike after 0.4, not in 0.4.
- **What exists:** github.com/emuyia/ems-monomachine-firmware (per-track lengths and speeds, trig conditions, clone
  pattern, trig preview, page copy/randomise, BBOX sample banks; SONG slots 13-24 removed) and a Machinedrum one.
  They ship as patches for a browser patcher (junes.website/goodies/fw-patcher): input Elektron's official OS .syx
  (the MM one is `Elektron_SFX6-60_OS1.32B.syx`, SHA-256 checked), output a patched OS .syx for the machine's
  OS-update mode. Signed manifest, WASM engine, nothing uploaded.
- **What the editor needs:** (1) the patched OS inside an 8 MiB flash image: way A, let the emulated machine
  update itself (boot with FUNC held, send the .syx, the emulated Am29F flash programs itself, save the image as a
  ROM); way B, an offline writer that needs the OS .syx format; (2) the ROM loader accepts an unknown fingerprint
  behind an "at your own risk" switch (today only OS 1.63 and 1.32B pass, mdromcheck.h); (3) a list of what the
  desk gets wrong: it reads RAM at fixed addresses and knows the stock pattern/kit layouts.
- **Spike (two days):** try way A headless with mdFirmwareSession; relax the loader behind the switch; boot the
  custom OS; list what works and what breaks on the page. Decide the product shape after that.
- **Status:** queued after 0.4.
- **More (Discord roundup, 2026-10-16):** 2026-10-14: loading the X.14 custom firmware as a sysex in the LCD's boot menu does nothing (on the hardware it is sent as a sysex file at boot); Radek: the UI is coded against stock firmware, custom firmware is on the list. So the boot-menu route does nothing today. 2026-10-10: a community user pointed to a script in a gearmulator fork (branch md-mm-remote-panel) that converts an OS .syx to a flash image with your own stock .bin; a tester tried it: X.13 and X.14 worked, X.20 did not. Another user named github.com/jmamma/MDX as the newest X.20 and suggested asking Elektron about redistribution (Radek: the original ROM is the issue).

## I-015 · Pattern length per track, and microtiming

- **From:** Discord tester L, 2026-10-09, in #ideas: "pattern length per track and microtiming of course". Radek: "Nice one".
- **Note:** not in the firmware's pattern: the Machinedrum has no per-track length (`DESIGN-generators.md`) and the Monomachine's tracks share one scale length (`manual-mapping.md`). It would be an editor feature on top of the machine (or a new sequencer), not a mapping of what the firmware does. Microtiming is not in the mapped pattern format either (to check).
- **Status:** new.

## I-014 · Make the EXT / CLASSIC mode and LOAD ROM easier to find

- **From:** Discord tester D, 2026-10-08: "everything I tried to do didn't seem to work. The binary loaded automatically and I don't see where to add a different firmware." Tester A, 2026-10-09: "Seems MD editor is in Advanced Mode Always? kits and patterns are always connected? Havent seen an option to select mode."
- **What happened:** both were answered in the channel. LOAD ROM is in the engine menu in the header (Radek posted a screenshot); the mode is the small MODE EXT field in the LCD's second row (click for CLASSIC: patterns do not load their kits, locks stay in the pattern but do not play, the lock lane says "CLASSIC: locks muted").
- **Idea:** say it where people look: the mode in the guide (no word on EXT / CLASSIC today; the guide still describes version 0.3.2) and a tooltip on the field; LOAD ROM also in the editor menu next to Open Log Folder.
- **Status:** new.

## I-013 · Windows: an installer instead of copying folders

- **From:** Discord tester A, 2026-10-08, 0.3.4, on a Windows 10 PC: "there no installer on 0.3.4 / only manual install to folders". The Windows build is a zip (the app and the VST3 folder) with a README for the install paths.
- **Idea:** a setup program (app, VST3, shortcuts, uninstall), signed when the signing account exists ([SIGNING.md](SIGNING.md)).
- **Status:** new.

## I-012 · Switch from song mode to pattern mode

- **From:** Discord tester J, 2026-10-08 (0.3.4), in #bugs: "how do we switch from song mode to just pattern?" Radek: "may not be implemented fully yet".
- **Done:** 0.3.5 has the PATTERN | SONG switch on the Song page ("What plays") and PAT / SONG on the LCD's second line, on every page; the switch lights what the machine reports.
- **Status:** shipped in 0.3.5; tester J has not said whether it is what was meant.

## I-011 · A song library pop-up instead of stepping the SONG field

- **From:** Radek, 2026-10-09: the LCD's SONG nn field steps through songs (click, drag, scroll). It should open a pop-up like the kit library instead: all songs with names, and load, copy, paste, clear and save from one place.
- **Scope:** both editors (MD 32 songs, MM 24). Same layout and keys as the kit library.
- **Status:** planned, after 0.3.5.

## I-010 · Monomachine: note length like Ableton/Digitakt

- **From:** Discord tester C, 2026-10-08: dropping notes in the MM piano roll, a note runs until the next one; wants explicit trig/note length (place 1/16, then 1/8 notes as in Ableton).
- **More:** the notes run on until the next one and are then cut off (tester C's words); Radek on 2026-10-09 in #bugs: the Monomachine piano roll "needs to be better as well". C is used to the Digitakt's trig length and Ableton.
- **Measured (2026-10-10, `mmDeskFirmwareTest notelength` and `lenprobe`):** a synth track has no length per note: a note sounds from its trig to the track's next NOTE OFF or trig, past the pattern's end onto its start. A MIDI track's note lasts LEN ticks, 24 a quarter note (6 a step at 1X; linear 1-126 at 120 and 90 BPM; the roll assumed 8 a step), cut earlier by the track's next trig or a NOTE OFF trig; LEN 127 lasts until a NOTE OFF.
- **Status:** built for 0.5 (MM slice 3, branch `feat/mm-piano-roll`). A new note lasts the draw length (the Len key beside Draw: 1/16 1/8 1/4 1/2 1 bar; dragging a note's end sets it too, as in Ableton): a synth note writes its trig and a NOTE OFF where it ends, a MIDI note its LEN lock (or LEN 127 and a NOTE OFF past 21 steps). A note is drawn up to the track's next trig, and past the pattern's end onto its start (drawn there lighter). Deleting a note leaves the note before it its length. The firmware test stores and plays 1, 2, 4, 8 steps and 6 across the end (136, 262, 512, 1015 and 763 ms for 125-1000 ms: the measuring window adds some 13 ms) and MIDI LENs 1-126 (to the tick).

## I-009 · Option to turn off the "kit has unsaved edits" warning on pattern change

- **From:** Discord tester C, 2026-10-08 (mostly the Machinedrum, maybe the Monomachine too).
- **Status:** new.

## I-008 · The editor menu in the editor's own style (next, after 0.3.4)

- **From:** Radek, 2026-10-08.
- **Idea:** the right-click / editor menu (GUI Scale, Page Zoom, RAM recording, Updates) is JUCE's default dark-blue menu. Draw it in the page with the themed menu from the key map (deskMenu.js): plate colours and fonts, light/dark and MK1/MK2, the same in every DAW and OS. First line "Machinedrum Editor <version>"; Performance diagnostics into a Developer submenu.
- **Status:** shipped in 0.3.5: option A, the menu drawn in the page. The window sends the entries as data (`mdEditorMenu.h`, one tree: the page, the menu bar, and a native menu only when no page is up), the page draws them (`deskMenu.js`: submenus, ticks, keyboard, placement) and the window runs the one chosen. Content: the editor and version as the title; Zoom (the page's zoom steps, with Window Size inside: upstream's GUI Scale, the window at a size of the design); Updates; Open Log Folder; Audio/MIDI Settings (standalone); Developer (performance capture, RAM recording). Screenshots for review first.

## I-007 · Ableton-style editing on the Monomachine piano roll

- **From:** Discord tester C, 2026-10-08.
- **Idea:** B toggles draw mode on the piano roll (as in Ableton); box-select notes.
- **Status:** built for 0.5 (MM slice 3, branch `feat/mm-piano-roll`). B on Sequence (and the Draw key beside PAGE) toggles draw; off, a drag in an empty place boxes notes into the selection both editors share (from the first note's trig to the last one's end, its NOTE OFF in), a press on a note selects it, a drag of the selection moves it (one undo step; ⌘-drag a copy, as before), a double-click adds a note, and the slice-2 keys and step menu act on it. B stays tap tempo on the other workspaces (tap on Sequence is gone: the roll's Draw takes the key there).

## I-005 · Update from inside the app (after 0.3.2)

- **From:** Radek, 2026-10-07.
- **Idea:** the standalone app checks `https://mdmm.dev/latest.json` (once a day, can be turned off; no third-party server), shows "Update available", downloads the new version, verifies it with our own signature (ed25519, independent of Apple/Microsoft), replaces the app and the VST3/AU/CLAP plug-ins and restarts. Plug-ins in a DAW only show a note ("open the app to update"). macOS, Windows (swap after exit; a DAW must be closed for plug-ins) and Linux. A system-wide install asks for the password once.
- **Status:** built on `feat/updates` (2026-10-08), design in [DESIGN-updates.md](../modern-ux/DESIGN-updates.md). As built: the standalone installs (macOS: opens the .pkg in the Installer; Windows, Linux: swaps the app after exit); the plug-ins are never replaced by the app (a DAW may have them loaded). Installs wait for the update key ([SIGNING.md](SIGNING.md)).

## I-004 · The site and latest.json update themselves on release (after 0.3.2)

- **From:** Radek, 2026-10-07.
- **Idea:** when a release is published, a GitHub workflow writes the version into `site/public/config.js` and `site/public/latest.json` and deploys the site. Download links already follow `releases/latest/download/<fixed name>`.
- **Needs:** one Cloudflare API token (Workers edit on the NativeKloud account only) saved as a GitHub secret — Radek.
- **Status:** built on `feat/updates` (2026-10-08): `.github/workflows/mdmm-site-release.yml`. Needs the secrets in [SIGNING.md](SIGNING.md) (update key, Cloudflare token).

## I-003 · Follow the last played track (external MIDI controller)

- **From:** Discord tester B, 2026-10-07.
- **Idea:** an option to switch the selected track (instrument focus) to the one last played from an external MIDI controller.
- **Status:** new.

## I-002 · Show incoming notes on the Sound page

- **From:** Discord tester B, 2026-10-07.
- **Idea:** a visual sign on the Sound page when a note arrives from a MIDI controller (which track was triggered).
- **Also:** Discord tester M, 2026-10-11: light the on-screen keyboard's keys for notes played, as Ableton's (the Monomachine's Perform keyboard; B-062 is the stuck light).
- **Status:** done in 0.6 (polish B). The plug-in also sends the notes held from outside as a state (`midiHeld`, every 32 ms at most, when they changed; a note off is never lost, all notes off clears), so a burst is one message and a key cannot stay lit. Monomachine: the Perform keyboard lights the keys a MIDI keyboard holds (journey mm-perform-keys-lit; mdMidiInTest, mdSessionNoRomTest). Machinedrum (no keyboard): a note on the base channel that the map gives a track makes that track's number on the rail glow a moment, and its LED on Mix (journey md-sound-note-light); no new control. The MM's Sound page shows no note light yet (its rail has none to glow; a later idea).

## I-001 · Select steps, copy, paste and duplicate

- **From:** Discord tester A, 2026-10-07: "copy only one step and paste it, same track".
- **Idea:** select one or more steps with a modifier-drag; copy, cut, paste, duplicate, delete.
- **Status:** shipped in 0.3.4 (select, copy, cut, paste, duplicate, delete; B-015).
