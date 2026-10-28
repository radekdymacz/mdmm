# 0.9 wave 2: the Monomachine DigiPRO waveform manager

Rows MM-010, MM-310, MM-378 (doc/features/mm.json). Branch `feat/0.9-mm-digipro`. Spec first (PLAN-0.9.md), then the build.

## 1. What the machine does

Manual 1-99 to 1-104, GLOBAL > FILE > DIGIPRO MGR (MKII only). Two columns: MODE (RECEIVE, SEND, ERASE, RENAME) and
POS NAME (the 64 positions, with ORG for RECEIVE and ALL for SEND and ERASE at the top).

- 64 positions. Each holds a factory waveform unless a user waveform replaced it. A user waveform shows a "u" before
  its name. Factory waveforms cannot be sent, renamed or erased ("NOT A USER WAVEFORM").
- RECEIVE: ORG stores each dump at the position it carries; a chosen position stores one dump there, several from
  there on. The screen says WAITING; after the last dump [EXIT/NO] writes them ("WRITING WAVEFORMS").
- SEND: one user waveform, or ALL user waveforms, as dumps.
- ERASE: one or ALL, asked first. The factory waveform of that position comes back.
- RENAME: four characters, user waveforms only.
- Digibanks (sets of 64 waveforms, switched with snapshots) exist only with a +Drive, which the editor does not
  emulate (MM-311 to MM-313).

## 2. The messages (appendix C, measured: PROBES-manual-gaps.md P4)

**0x5E request:** `F0 00 20 3C 03 00 5E <wave 0-63> F7`. Answered on every screen with the waveform's 0x5D dump when the
position holds a user waveform; a factory position answers nothing (the probe asked 0, 1, 2, 31, 45, 63 and the out of
range 64, 65, 100 on a factory machine: no answer).

**0x5D dump:** 7027 bytes, as the public banks and the machine's SEND carry it.

| Bytes | What |
|---|---|
| 0-5 | `F0 00 20 3C 03 00` (Elektron, Monomachine) |
| 6 | `5D` |
| 7, 8 | version, revision. The machine took 1.1 (P4); it took no other tried first. The editor keeps what a dump carries and writes 1.1 for a waveform it makes. |
| 9 | the position, 0-63. Outside the checksum. ORG stores the dump here. |
| 10-13 | the name, four 7-bit characters (assumed, see 7.1). Inside the checksum. |
| 14-7021 | 7008 bytes: 6132 data bytes, Elektron 7-bit packing (a byte of high bits, then seven bytes) |
| 7022, 7023 | the 14-bit sum of bytes 10 to 7021, high 7 bits first |
| 7024, 7025 | the length, size minus 10, high 7 bits first (7017) |
| 7026 | `F7` |

**The 6132 data bytes** are 2044 signed 24-bit big-endian samples: one cycle at 1024 points, then the same cycle at
512, 256, 128, 64, 32, 16, 8 and 4 points (1024 + 512 + ... + 4 = 2044). The first 1024 are what DDRW plays at MIDI note
48 (digiproAudioOracle.h, measured); that the lower levels are the band-limited cycle for higher notes is assumed (7.2).

**Where it lives on the machine.** The waveforms are in the MKII's user flash (`md::g_mmUserFlash`, 2 MiB at
0x10200000); a received waveform changed 6128 bytes there and 256 bytes of patch RAM (P4), so the patch RAM holds a
table of the 64 positions (4 bytes each, maybe the names). The plug-in's project state keeps the user flash (state
version 2, mdstate.h), so waveforms sent to the emulated machine stay with the project and with KEEP MEMORY.

**Only on RECEIVE.** A 0x5D sent on the normal screens changes nothing (P4). It is taken on DIGIPRO MGR > RECEIVE >
ORG, which the plug-in's file sender and the tests reach with panel keys (sysexPanelDriver.h `enterMmReceive(_, true)`:
SYSEX RECV's path with one more [DOWN] in the FILE menu).

**Erase and rename have no message.** Appendix C has none. Rename is a dump of the same waveform with the new name
(RECEIVE takes it over the old one at its position). Erase is the panel's ERASE, so the editor can erase only where it
presses the machine's keys (the emulator); over HW MIDI the person erases on the machine.

## 3. MKI and MKII

The emulated ROM (OS 1.32B, the one image of SFX-6, SFX-60 MKI and MKII) runs as an MKII: its user flash is emulated
(mdmc.cpp `MonomachineFlash`), DIGIPRO MGR is in its FILE menu, DDRW and DENS play, and a received waveform plays
(mmSysexWorkflowTest, mmDigiProImportAudioOracleTest). So every function of the manager works on the emulator.

The page's MKI plate (130-main.js) says the person runs an MKI: the manager's card says "An MKI has no user waveforms"
and its keys are off, as DDRW and DENS are marked. Over HW MIDI a real MKI answers no 0x5E: every position reads as
factory and a receive changes nothing; the card says so after a read that found nothing.

## 4. Where it is in the editor (the page's rules)

On the machine it is a GLOBAL menu, so in the editor it is a card of the GLOBAL page ("DigiPRO", "GLOBAL > FILE >
DIGIPRO MGR" in its tip), the full width of the page under the global cards. No new workspace, tab or right-click. The
SysEx panel keeps its Waveforms tick for a bank backup; the card's Save uses the same command (no second export).

The card:

- **The 64 positions** as an 8 x 8 grid of keys, the way the machine counts them: `W01` to `W64` (the export's names);
  a user waveform shows `u` and its name, a factory one its position only. The selected one is lit.
- **The selected waveform** drawn (the 1024-point cycle, from the dump), its name, user or factory.
- **Keys**, the machine's MODE words where they fit: **Read** (reads the 64 again), **Load…** (RECEIVE: a .syx of
  waveforms or a WAV / AIFF of one cycle, into the selected position and on), **Save .syx…** (SEND: the selected user
  waveform; Shift: every user waveform), **Rename** (four characters, in place), **Copy**, **Paste** (into the selected
  position), **Erase** (Shift: every user waveform), **Undo** (the manager's last change).
- A line of news: reading 12 of 64, sending, writing, done, or why not.

Questions (the one question dialog): Load, Paste and Rename never ask over a factory position; over a user waveform
they ask ("W05 holds the user waveform SAW1. Replace it?"). Erase always asks, Erase all names how many.

Over HW MIDI: Load, Paste and Rename send when the person has opened DIGIPRO MGR > RECEIVE > ORG on the machine: the
card says so and shows **Send** (as the pattern field's SEND n for SYSEX RECV); Erase is off with the steps on the
machine as its reason (`panelKeys`).

## 5. How it is built (the existing paths)

Nothing new beside the SysEx path: the waveforms are not documents of the core (the machine never pushes them and they
are not in its kit, pattern, song or global), so they are the session's SysEx work, like the export's waveforms today.

| Layer | What | Where |
|---|---|---|
| Data | `MmWave`: decode / encode 0x5D (checksum, length, packing), the name, the position byte; the cycle from audio (resampled to 1024 points, the eight lower levels band-limited by harmonic, DC off, peak to full scale less 0.1 dB); the 1024 points for drawing | `elektronData/mmWave.h/.cpp` |
| Adapter | `MmAdapter::sendWaves(dumps)`, `eraseWave(wave)`, `waveWork()`, `wavesSendNow()`. The emulator: `WaveRecv`, a pure panel session like RecvSession (EXIT to main, the macro to DIGIPRO MGR > RECEIVE > ORG or > ERASE > position > [ENTER] [ENTER], send, [EXIT/NO] to write, wait, back to main), never at the same time as SYSEX RECV. HW MIDI: the dumps wait for the person (`waitsFor`). | `mmDesk/mmWaveRecv.h/.cpp`, `mmDeskMachine.*` |
| Session | `SyxWaves`: the list (one 0x5E at a time, as SyxWaveRead), the open file's preview, the operations, the undo list, the messages to the page; run by SyxWork's `handle` and `step`, so the plug-in and the page tier's stub host run the same code | `mdJucePlugin/mdSyxWaves.h`, `mdSyxWork.h` |
| Window | `chooseWave {wave}`: the native chooser (.syx, .wav, .aif); the session reads the file (JUCE's formats for audio) | `mdPageEditor.cpp`, `mdDeskSession.h` |
| Contract | deskHost rows `waveList`, `waveLoad`, `waveRename`, `waveCopy`, `waveErase`, `waveUndo`, `waveSendNow`, `chooseWave`; messages `waveList`, `waveFile` | `deskHost.cpp`, both schemas |
| Page | the card (`118-digipro.js`), host calls on the seam, `mmAdapter.js` | `skins/mmStudio/` |

The commands:

- `waveList {again}`: the list once a session (the card's first open), again with `again`. A message `waveList`
  follows: `{running, done, total, waves: [{wave, user, name, points}], undo, waitsFor, text}` (`points`: 128 values of
  the cycle for the key's drawing, user waveforms only).
- `chooseWave {wave}` then the file's preview `waveFile {ok, text, file, waves: [{wave, name, replaces}]}`, then
  `waveLoad {}` sends it (the page asked first when `replaces` names a user waveform). A .syx's dumps go from `wave` on,
  in file order (the position byte rewritten; it is outside the checksum); past W64 they are left out and said.
- `waveRename {wave, name}`: the held dump with the new name, sent to its position.
- `waveCopy {from, to}`: the held dump of `from` with the position `to`, sent.
- `waveErase {wave}` or `{all: true}`: the panel's ERASE (emulator only).
- `waveUndo {}`: the last change taken back: the dump that was there sent again, or the position erased when it was
  factory before.
- `waveSendNow {}`: HW MIDI, the person says the machine is on RECEIVE.

Every change ends with the touched positions read again (0x5E), so the list is what the machine holds, not what the
editor sent.

## 6. Undo

The core's undo holds documents; these are not. So the manager has its own list (up to 16 steps, the session's, not
saved with the project): before a change it keeps each touched position's dump (or "factory"). **Undo** on the card
takes back the last one. The page's ⌘Z is the core's and does not reach it; the card says "Undo on this card takes back
the last change to the waveforms". A Load or an Erase all is one step.

## 7. Assumptions the firmware tests settle

1. **The name is bytes 10 to 13.** The manual's names have four characters and the dump has four bytes before its data
   inside the checksum. Test: a dump named `TEST` comes back named `TEST`; a rename on the panel (RENAME, [UP] on the
   first character, [ENTER]) changes byte 10 of the dump the machine sends.
2. **The lower levels.** The editor makes them band-limited. Test: a waveform made from a saw cycle played by DDRW at
   note 48 and at note 96 correlates with the band-limited reference at both.
3. **The panel paths.** MODE is RECEIVE, SEND, ERASE, RENAME from the top; POS NAME starts with ORG or ALL; the
   columns stop at their ends (no wrap), as the global slots do. The macros go to the top of each column first. Tests:
   erase one, then 0x5E for it answers nothing; the others answer as before.
4. **Answer time.** The emulator answers a 0x5E within a few blocks. The list waits 300 ms of machine time for a
   factory position (the export's 700 ms is wall time). Test: the time of each answer, printed.
5. **Writing waveforms.** After [EXIT/NO] the machine writes to flash; the session waits for the screen to leave
   GLOBAL EDIT's waiting state, at most 10 s of machine time (P4 waited 8 s), then reads back.

## 8. Tests

- elektronData (unit, CI page/core): decode the probe's dump, encode it back byte for byte; checksum and length; a
  broken checksum is refused; name in and out (lower case raised, other characters to space); the position byte
  rewritten keeps the checksum valid; a saw from audio: 2044 samples, level 0 is the saw, level k has no harmonic above
  its half, peak at full scale less 0.1 dB.
- mmDeskTest (unit): WaveRecv presses the RECEIVE macro from main, parks, sends, EXIT, waits for writing, leaves; it
  never starts while RecvSession is busy and RecvSession waits for it; ERASE's macro; HW MIDI waits for `wavesSendNow`
  and `eraseWave` is refused.
- Firmware (`mmDeskFirmwareTest --env digipro`, `mmDigiproManagerFirmwareTest`): through the desk on the real ROM: a
  dump round trip (sent, read back byte for byte), rename (7.1), copy to another position, erase one (7.3), erase all,
  a WAV-made waveform plays (7.2). Runs on main and release/* (the ROM Worker); a feature branch runs the rest.
- Page journeys (page tier, the stub host with a fake DIGIPRO MGR): open GLOBAL, the card lists the stub's user
  waveforms; select one, rename, the key shows the new name; copy to an empty position and paste; erase asks, then the
  position is factory; Undo brings it back; Load opens the preview and asks before replacing; the MKI plate turns the
  card off.

## 9. Not in this wave

- Digibanks (+Drive). A .syx of 64 waveforms on the computer plays that role: Save .syx with Shift, Load of that file.
- Waveforms on the machine's knobs by name (DDRW WAV1 shows D01 to D64 as today).
- A WAV dropped on the card (the window's drop goes to the MD's sample slots today).
- B-011 (a DigiPRO voice silent at some MIDI input speeds) is not touched; the manager's dumps go at the stream's speed
  while stopped, the firmware tests' speed.

## 10. Decisions for Radek

1. The card on the GLOBAL page (the machine's place) rather than a dialog from the engine menu.
2. The manager's own Undo (not the page's ⌘Z), up to 16 steps, not kept with the project.
3. "Copy between Digibanks" read as copy between positions plus bank files; real Digibanks need the +Drive.
4. A WAV is taken as one cycle (the whole file), normalised to full scale less 0.1 dB; files over 65536 frames are
   refused as "not one cycle".

## 11. Status (2026-10-28, feat/0.9-mm-digipro)

Built: 2 to 6 and 8 as specified. CI hand run 40656831703 (stages 0 to 2): checks, page suite (the four DigiPRO journeys
pass), core unit tests (mmDataTest, mmDeskTest) and the editors on macOS, Windows and Linux green; only the Linux
SteamOS 3 container start test failed (WebKitGTK crash fallback, not this work). Open:

- `mmDigiproManagerFirmwareTest` (7.1, 7.3, 7.4, 7.5 and the round trip, rename, copy, erase, undo) runs only on main
  and release/* (the ROM Worker): first result after the merge.
- 7.2 (the lower levels at a high note) has no firmware test yet.
