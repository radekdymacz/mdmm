# Plan: 0.8, the MIDI release

*Drafted 2026-10-16 by Claude Code (Opus) for Radek. Nothing here is built yet. Inputs: the MIDI audit of origin/main `28b6bcb6c`, the Discord roundup of 2026-10-16, BUGS.md, IDEAS.md, ROADMAP.md, DEV-CYCLE.md, THREADING.md. Assumes `fix/mm-tester-bugs-1016` (B-148 to B-152), `ci/linux-steamos` (B-153) and `fix/1.0-lock-free-audio` are merged.*

## Problem

MIDI in, MIDI out, clock and transport run through the stock plug-in plumbing. Little of it is proven end to end.

- **MIDI out (since 0.4.0)** has unit tests and one processor-level firmware test. No real host or port has run it. B-119 (cross-talk in Ableton) may come from it.
- **Machinedrum notes 36 to 51** from a DAW or port never reach the firmware's MIDI input. `Hardware::pumpScheduledMidi` (`mdLib/mdhardware.cpp`, about line 1929) turns them into TRIG key presses. It ignores the channel, the Global key map and velocity. The key map page (MD-169) has no effect from a DAW. In GRID RECORD a TRIG press writes a step. No test covers this path. The code is from the alpha (`bd5800b8a`), a workaround from before the firmware note path was proven.
- **No test drives a transport through the processor.** Play, Stop, loop, seek, INT/EXT and MM All Notes Off are tested in pieces only.
- **Standalone reports since 0.7.0:** B-154 noise with Ableton over IAC; B-155 Bluetooth MIDI crashes the app, External Input stays None. Likely causes: a MIDI feedback loop through IAC (worse with the pad rewrite); no Bluetooth usage key in Info.plist; a device setup error nobody shows.
- **The page cannot see what MIDI came in or went out.** B-119 and B-154 cannot be settled from a log.
- **MIDI Learn is off.** The translator has a thread-safety hole and a use after free (THREADING.md). Its guide describes UI these editors do not have.
- **CI leaves MIDI tests out.** Windows skips `mdMidiInTest`, `midiRoutingMatrixTest`, `synthLibMidiClockTimingTest`. Linux skips the clock timing test (B-044).

## Options

1. **MIDI features:** Learn, Ableton Link (I-033), own and virtual ports (I-027). Each L. Cannot be hand tested in one sitting.
2. **MIDI solid:** prove and fix the paths that exist, make MIDI visible, fix the three standalone reports, document, one small feature (I-003).
3. **Bugs only:** 0.7.1 with B-133 and the Discord items. MIDI stays unproven.

## Decision: option 2, "MIDI solid"

- It answers B-119, B-154, B-155 with evidence.
- It closes 1.0 gaps without new real-time design. The 1.0 gate (ROADMAP §7) needs no Learn, Link or ports.
- Every package has a test that runs here. Hand test about 75 minutes.

## Decisions for Radek

### D1. MIDI Learn
- **A. Re-enable in 0.8.** THREADING.md's six steps and four tests, `MDMM_MIDI_MAPPING` on, CONTROL workspace finished. L, Opus. Unsolved: a learned CC that is also on the firmware CC map drives the parameter twice; buttons and pads cannot be learned. Doubles the hand test.
- **B. Leave it off, document it.** `doc/midilearn/midi_learn.md` becomes a short page: Learn is not in these editors; use the firmware CC/NRPN map and host automation; the key map LEARN for notes. F13 stays "later".
- Claude's pick was B. **Radek's decision (2026-10-16): A, MIDI Learn is in 0.8** (WP-L, Opus). The hand test grows by a Learn section.

### D2. MD notes 36 to 51 as pad presses
- **A. Remove the rewrite.** Every note goes to the firmware MIDI input, as on a real Machinedrum.
- **B. Keep it, document it.** Limit to the Global base channel and map through the key map.
- **Radek's decision (2026-10-16): A, if WP1's first test agrees** (the native path plays all 16 tracks from the default map). Else B, with the reason in BUGS.md.

## Scope

### In 0.8

| Item | Package |
|---|---|
| MD host notes through the firmware MIDI input: channel, key map, GRID RECORD safety (D2) | WP1 |
| B-011: MM six-note chord at one sample offset (test first; fix only if quick) | WP1 |
| Transport and clock through the processor with a scripted play head; MM All Notes Off (B-121); host Program Change MD and MM | WP2 |
| B-154 feedback-loop reproduction | WP2 |
| MIDI monitor: per-instance in/out counts by type and channel, drop counters, in the log | WP3 |
| B-155 Bluetooth crash, External Input None, MIDI loop warning, monitor row in AUDIO / MIDI panel | WP4 |
| CI parity for MIDI tests; B-044; B-047 | WP5 |
| B-133 live recording after an SDS sample, time box 2 days | WP6 |
| I-003 follow the last played track (page only) | WP7 |
| MIDI Learn back on (D1 A): THREADING.md redesign, its four tests, CONTROL workspace | WP-L |
| Learn docs, guide MIDI and sync sections, log upkeep, TEST-0.8.md, release notes | WP8 |
| Log B-154 to B-160, I-033, I-034 and the roundup's updates | WP0 |
| Monomachine tester items: I-030, B-150 rest, B-152 guide, I-031, I-032 (Radek: must be done in 0.8) | WP9 |
| B-159: confirm deployed `/get/` matches main, then close | release step 11 |
| B-119, B-120, B-121, B-030, B-037: confirm on the hand test sheet | TEST-0.8.md |
| B-148 to B-153: "fixed in 0.8.0" | WP8 |

### Waits

| Item | Why |
|---|---|
| I-027 own and virtual ports | L; WP3 is its first step |
| I-033 Ableton Link | L; licence to check |
| Standalone clock-out jitter | Needs a real port; 0.9 with WP3 counters |
| HW MIDI on real machines (F1), TurboMIDI (F15) | Need the machines |
| B-038, B-045, B-130, B-132 | Not MIDI; 0.9 |
| B-156 Windows crackle | No Windows here; lock-free audio may fix it; retest on 0.8 |
| B-157 MM piano roll delete/copy/paste | Probably fixed; tester to confirm on 0.8 |
| B-158, B-153/B-033, B-063, B-096, B-122, B-039, B-059, B-035, B-036, B-022 | Waiting for testers' facts |
| B-058 (rest), B-005, B-009 | Watching |
| I-034 | Idea, not MIDI |

## Work packages

Shared rules:
- **Worktree:** own branch and worktree under `/Users/radek/Documents/Github/audio/gearmulator-md-mm-wt/<name>`, cut from origin/main.
- **Checks:** build and the package's own test (`scripts/mdmm-check.sh`, by area). Crossing the firmware boundary: one focused firmware test. ROMs: `~/Documents/Gearmulator Preview/Machinedrum/roms/elektron_sps1-1uw_os1.63.bin`, `~/Documents/Gearmulator Preview/Monomachine/roms/elektron_sfx6-60_os1.32b.bin`.
- **Merge:** after own tests and an independent Sonnet review; push (ROM-free CI). At most 3 implementing agents at once.
- **Screenshots:** UI packages produce them; Haiku reviews for cut text, overlap, contrast.
- **Model:** Sonnet for every package. Opus only for WP-L.

### WP0 · Log the Discord roundup (coordinator, before wave 1)
BUGS.md gets B-154 to B-160; IDEAS.md gets I-033, I-034; the 11 updates go into their entries. Done when the entries are in and no tester is named. S.

### WP1 · Notes in (D2, B-011)
- Branch `fix/0.8-notes-in`, worktree `0.8-notes-in`.
- Files: `mdLib/mdhardware.cpp` (`pumpScheduledMidi`), new `mdLibTest/mdHostNotesFirmwareTest.cpp`, `mdLibTest/mdmmTests.cmake`.
- Steps: test against today's code through `Device::sendMidi` at processBlock offsets: MD (a) each factory key map note on the base channel sounds its track; (b) another channel sounds nothing; (c) after a key map edit the new note sounds, the old does not; (d) GRID RECORD on, a host note leaves the pattern unchanged; MM (e) six notes at one offset on six channels, all six voices sound. Record failures, apply D2, run again.
- Done when `mdHostNotesFirmwareTest_md` and `_mm` pass with both ROMs; `mdMidiTimingFirmwareTest`, `mdAutomationFirmwareTest`, `mdP4ProbeFirmwareTest` still pass; BUGS.md says which D2 branch and why. If (e) fails, B-011 stays open with the evidence.
- M. Parallel with WP3, WP5.

### WP2 · Transport and clock through the processor (B-121, B-154)
- Branch `test/0.8-transport`. Starts after WP1 is merged.
- Files: `mdJucePlugin/mdMachineMidiOutTest.cpp`, registration in `mdmmPlugins.cmake`; fixes in `synthLib/plugin.cpp`, `synthLib/midiClock.*` or the desk host clock only if the test finds a defect.
- Cases (scripted `juce::AudioPlayHead`): Play from 0 at 120 BPM; Stop (MM All Notes Off on 16 channels through MidiClock and Plugin); loop jump (SPP + Continue); seek while stopped; INT (no host clock reaches the firmware) and EXT again; host Program Change on MD and MM; notes in and out, no SysEx out; loopback 10 s with external 24 PPQN clock: output finite and within clip budget, no crash, overflow counter reported.
- Done when `mdMachineMidiOutFirmwareTest_md` and `_mm` pass; B-154 records the loopback result; `mdHostStopFirmwareTest`, `mdDeskFirmwareTest hostclock`, `mmDeskFirmwareTest hostclock` still pass.
- M. Parallel with WP4, WP6.

### WP3 · MIDI monitor core
- Branch `feat/0.8-midi-monitor`.
- Files: new `mdJucePlugin/mdMidiMonitor.h`, `mdMidiMonitorTest.cpp`; hooks in `mdPluginProcessor.cpp`; registration in `mdmmPlugins.cmake`.
- Counts by direction (in from host/port, in to firmware, out from machine, out to host), type (note, CC, PC, clock, transport, SysEx, other), channel; existing drop counters. Relaxed atomics, audio thread writes only, no allocation. Log line `midi: in … out … dropped …` every 10 s while counts change. A `midiStats` document for the page.
- Done when `mdMidiMonitorTest` (no ROM) passes: counts for a scripted buffer, no allocation on the hook path, message thread reads while audio writes; `mdSessionNoRomTest` sees the log line.
- S to M. Parallel with WP1, WP5.

### WP4 · Standalone AUDIO / MIDI panel (B-155, loop warning, monitor row)
- Branch `fix/0.8-midi-panel`. Starts after WP3 is merged.
- Files: `mdmmPlugins.cmake` (`BLUETOOTH_PERMISSION_ENABLED TRUE`, `BLUETOOTH_PERMISSION_TEXT`); `mdAudioMidiLink.cpp/.h` (device setup error, input permission state, loop check); new `mdMidiLoop.h` and test; `skins/shared/deskAudio.js`, `skins/mmStudio/src/127-audio.js`, regenerate `mmMockup.js`; scenario `doc/modern-ux/scenarios/<md|mm>/midi-loop.json`.
- Done when `mdMidiLoopTest` passes (same port as in and out warns; two buses do not); a macOS ctest finds the Bluetooth and microphone keys in the built Info.plist; `deskAudioSelfTest`, `mdmmScenariosPageTest` with `midi-loop` pass; Haiku passes the panel screenshots; B-155 checked by hand (TEST-0.8.md).
- M. Parallel with WP2, WP6.

### WP5 · CI parity for MIDI tests (B-044, B-047)
- Branch `ci/0.8-midi-tests`.
- Files: `scripts/windows/build_mdmm.ps1` (add `mdMidiInTest`, `midiRoutingMatrixTest`, `synthLibMidiClockTimingTest`, `midiLearnTests`); `scripts/linux/build_mdmm.sh` (drop the clock test exclusion); `scripts/macos/mdmm_unit_tests.sh` (add the clock test); `setvbuf(…, _IOLBF, 0)` in tests becomes `_IONBF`.
- Done when Windows and Linux workflows on the branch are green and list those tests; B-044 and B-047 closed (or the clock test excluded again with the reason); `python3 scripts/mdmm-check.py --check-map` passes if the map changed.
- S. Parallel with everything.

### WP6 · B-133 live recording after an SDS sample (time box 2 days)
- Branch `fix/0.8-b133`. Starts after WP1 is merged.
- Files: `mdLibTest/mdDeskFirmwareTest.cpp` (`recaftersample`), the SDS receive path wherever the cause is.
- Method: restoring RAM 0x250000 to 0x2b8000 brings recording back. Bisect by halves to the bytes, find the firmware state, find the cleanest way out.
- Done when `mdDeskFirmwareTest <MD ROM> recaftersample` passes with and without a sample; `md-sampler-rename` and `md-drop-sample` lose `alone: true`; `scripts/mdmm-e2e.sh md` passes `md-seq-live-record` and `md-seq-live-lock` after them. If the box ends, B-133 stays in Known with the bytes found.
- M. Parallel with WP2, WP4.

### WP7 · I-003 follow the last played track
- Branch `feat/0.8-follow-track`. Starts after WP1 is merged.
- Files: page only. MD `skins/mdStudio/*.js` (note to track via `G.keymap`); MM `skins/mmStudio/src/*` (channel to track via base channel and span). Fed by `midiIn`. Saved in the existing setup document with the lenient 1.0 setup codec.
- Done when page-tier journeys `md-follow-played-track` and `mm-follow-played-track` pass (off by default; another channel does not move the selection); Haiku passes screenshots; feature rows and guide lines added.
- S. Parallel with WP8.

### WP8 · Docs, guide, log upkeep, test sheet, release notes
- Branch `docs/0.8-midi`. D1 text in wave 1; note and transport lines after WP1 and WP2.
- Files: `doc/midilearn/midi_learn.md` rewritten for the editors' CONTROL workspace (after WP-L); `doc/ROADMAP.md` F13 done; FOUNDATION "MIDI mapping is hidden for now" updated; guide md ch 10 and 15, mm ch 19 and 22, `doc/guide/start.md` (inputs on, Windows single-client rule, loop warning, what MIDI out sends and that it never sends SysEx, notes and key map, Global Program Change, Tempo INT/EXT, CC map and host automation, Ableton "Multiple plug-in windows", Logic and old `.component` files); BUGS.md stale "fixed on branch" entries checked with `git merge-base --is-ancestor`; `doc/release/TEST-0.8.md`, `doc/release/v0.8.0.md`.
- Guide notes from the Discord roundup: Ableton Live opens one plug-in window at a time (Preferences > Plug-ins: switch off "Auto-hide plug-in windows", switch on "Multiple plug-in windows"); Logic needs the old `GearmulatorMD.component` and `GearmulatorMM.component` deleted from `/Library/Audio/Plug-Ins/Components` (the installer does not); the ROM card and getting-started text say where a ROM comes from (we cannot share or link it) and that a .syx is imported by drag and drop or Import SysEx, not received.
- Done when `node scripts/mdmm-guide.mjs --check` is green and no tester is named.
- S to M. Parallel with everything.

### WP9 · Monomachine tester items
- Branch `feat/0.8-mm-tester-items`. Starts in wave 3, after WP3 is merged (the meter feed sits next to the MIDI monitor in `mdPluginProcessor.cpp`).
- I-030: the guide says what the lock lane's trig mark means: red = the trig fires all three envelopes (AMP, FILTER, LFO); green = only some or none (trigless trig). Files: the doc/guide/mm chapter for the lock lane / sequencer. Done when `node scripts/mdmm-guide.mjs --check` is green.
- B-150 rest: show the DigiPRO D-wave names (SINE, HSIN ...) for D01-D64. Read them from the ROM with `mmEditorProbeFirmwareTest enums` (LCD images), put them in the page's table, never commit the ROM. Done when `mmSoundTest` checks the names and Haiku passes a Sound page screenshot.
- B-152 guide: `doc/guide/mm/14-advanced-sequencer-control.md` PITCHLESS TRIGS says how to make one in the editor (step menu > Pitchless trig, on a selection; on the machine: hold a trig, press EXIT); MM-214 in `doc/features/mm.json` done.
- I-031: a lamp in a second colour on a track that plays because another track triggered it. Page only (`mmStudio/src`); a page journey proves it.
- I-032: meters on Mix, per machine output pair (A/B, C/D, E/F), not per track (the editor only gets the three stereo outputs). Needs a level feed from the processor (RT-safe, atomics) plus the page. Done when a no-ROM unit test checks the levels and a page journey shows the meters; Haiku passes the screenshot.
- I-030, I-031 and I-032 are marked "planned for 0.8" in IDEAS.md.
- M. Sonnet.

### WP-L · MIDI Learn back on (D1 A)
- Branch `feat/0.8-midi-learn`. Wave 1 (design and translator), the CONTROL workspace page after WP3 merges.
- Files: `jucePluginLib/midiLearnTranslator.*`, `mdMidiLearnCommands.cpp`, `jucePluginEditorLib/pluginEditor.cpp`, `deskHost/deskHost.h`, CONTROL workspace page files.
- Also settle: a learned CC that is on the firmware CC map (learn refuses it, or it wins and the firmware path is filtered; pick one and say why); pads and buttons (note learn or a toggle mode).
- Done when THREADING.md's four tests pass (thread id, no file I/O on the audio thread, a TSan stress test, the switch on); a page journey learns a CC and moves a knob; mappings survive a project save and load (lenient setup codec); Haiku passes CONTROL screenshots; `scripts/mdmm-rt-check.sh --lock --load 24` still passes.
- Opus for the threading design and translator; Sonnet for the page. L.

### Waves

| Wave | Packages | Shared files |
|---|---|---|
| 0 | WP0 | BUGS.md, IDEAS.md |
| 1 | WP1, WP3, WP5, WP-L design (Opus) | WP-L and WP3 both touch `mdPluginProcessor.cpp`: WP3 merges first, WP-L rebases |
| 2 | WP2, WP4, WP6 | WP2 and WP4 add to `mdmmPlugins.cmake` in different blocks; second to merge rebases |
| 3 | WP7, WP9, WP8 finish | WP9 meter feed sits next to the MIDI monitor in `mdPluginProcessor.cpp`: after WP3 |

## Hand test outline: TEST-0.8.md (about 75 minutes, macOS in full)

Install both .pkg files. Gear: USB MIDI keyboard, IAC driver with two buses, Ableton Live, Logic, a MIDI monitor app.

**macOS standalone (both editors)**
1. AUDIO / MIDI: switch on a keyboard input. Notes play. The monitor row counts in.
2. MD: factory key map on the base channel, each track sounds. Another channel: nothing. Remap a track in GLOBAL > Map; the new note plays it.
3. MD: GRID RECORD on, play notes. The pattern does not change.
4. MM: six-note chord across T1 to T6; all six sound (B-011).
5. MIDI out to IAC Bus 2 in the monitor app: notes and clock, no SysEx.
6. IAC Bus 1 as in and out: loop warning. Two buses: none.
7. Live sends clock and Start over IAC Bus 1 (Tempo in EXT), pattern playing: clean sound for 2 minutes (B-154). Then INT with notes only.
8. Bluetooth: pairing window opens, app stays up (B-155).
9. External Input: pick the interface; it stays, or the panel says why (B-155).
10. Unplug and replug the keyboard while playing. Note what happens.

**macOS VST3 in Ableton Live (both editors)**
1. Play, stop, loop 4 bars, move the play head: the machine follows. DAW tempo shows (B-030).
2. MM: hold a note into T1, stop: the note ends (B-121).
3. Tempo in INT: own tempo. EXT: follows.
4. A clip's Program Change switches the pattern (MD and MM).
5. Automate one host parameter per editor: the knob moves.
6. MD and MM on two tracks, Push on a third: no cross-talk; `midi:` log lines show only each track's MIDI (B-119).
7. MD MIDI out to a MIDI track, record it: notes are there.
8. Follow played track on: playing a track's note selects it (I-003).

**MIDI Learn (both editors, VST3 in Live and standalone)**
1. CONTROL: learn a knob from a controller CC; the knob follows the controller.
2. Save the Live set, close, open: the mapping is still there.
3. A CC that is also on the firmware CC map: the editor does what WP-L decided, with no double jumps.
4. Learn while the transport plays: no drop-outs.

**macOS AU in Logic (one editor)**
1. MIDI in plays; transport plays and stops. Note whether Logic offers the AU's MIDI out.

**Live recording (MD)**
1. Load a sample, live record: trigs and locks record (B-133, if WP6 landed).

**Windows** (if a machine is at hand, else a beta tester after release)
1. Standalone input on, notes play; with Live holding the port, the panel says why (B-037).
2. MIDI out to loopMIDI: notes and clock.
3. VST3 in Live: macOS VST3 items 1 to 4.
4. Edit steps and MM parameters while playing; listen for crackle (B-156).

**Linux** (if a machine is at hand, else a beta tester)
1. Standalone: ALSA ports listed, notes play, MIDI out reaches a second port.
2. VST3 in Reaper: Play and Stop follow.

## Release steps

1. Before: the three branches merged, ROM-free CI on main green, WP0 done.
2. During: each package merged after own test and independent review; each push runs ROM-free CI.
3. Cut `release/0.8.0` from origin/main (worktree `release-0.8.0`); `MDMM_EDITOR_VERSION` 0.8.0 in `mdmmPlugins.cmake`; `doc/release/v0.8.0.md` (discord line, New, Fixes, Known, Platforms); README links the notes.
4. PGO: WP1 changes `pumpScheduledMidi`; if the build says stale, `scripts/macos/train_mdmm_pgo.sh`, commit the profile.
5. Local gate on a quiet Mac: `scripts/mdmm-e2e.sh both`; `scripts/mdmm-full-gate.sh --plan` and its stages (`MDMM_GATE_ONLY=…`), or the full `scripts/mdmm-local-gate.sh`; `scripts/mdmm-rt-check.sh --lock --load 24`.
6. Push `release/0.8.0`: full CI once.
7. Hand test: Radek installs the .pkg files and runs TEST-0.8.md. Fixes on the release branch; rerun what changed.
8. Tag the tested head `mdmm-v0.8.0`, push the tag.
9. Merge `release/0.8.0` into main, push.
10. Publish the GitHub release once files are attached.
11. Ask Radek to deploy the site at once; check `/get/` has no price step; close B-159.
12. Discord: webhook posts #announcements; every other post shown to Radek first (B-154, B-155, B-157, B-119 replies, B-156 retest).
13. After: CLAUDE.md "Current state", BUGS.md "fixed in 0.8.0", start PLAN-0.9.md with the waits.
