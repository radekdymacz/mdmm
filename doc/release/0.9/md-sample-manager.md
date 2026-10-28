# 0.9 wave 1: Machinedrum sample manager

Rows: MD-193 (send to a computer), MD-194 (erase), MD-196 (slot list, sizes, memory left), MD-198 (copy, paste, clear, undo), MD-199 (RAM to ROM copy). Roadmap F8. Plan: PLAN-0.9.md, wave 1. Branch `feat/0.9-md-sample-manager`.

## What the person gets

On the Sampler workspace, on the UW machine (the emulated one):

1. **Slot list with sizes and memory left.** Every ROM and RAM slot shows its length in seconds and in KB (16-bit mono), and the card above the tiles shows the memory as the editor counts it: used, free, and the percentage free.
2. **Export.** A selected slot to a WAV file; all ROM slots to a folder; the four RAM slots to a folder. This is the editor's answer to the manual's SEND (one, ALL, RAM): the file is the same samples the machine holds, 16-bit mono at the slot's own rate.
3. **Copy and Paste.** Copy a ROM or RAM slot, select a ROM slot, paste. The clipboard is a snapshot taken at Copy (a RAM take is copied before the recorder overwrites it).
4. **RAM to ROM.** A key on every RAM slot with a take: "Keep as ROM slot..." takes the target ROM slot (the selected one) and sends the take there. This is the manual's FUNCTION + REC, FUNCTION + STOP, without the "reload samples" step: the editor does not clear the other RAM slots.
5. **Undo.** One key: Undo sample. It brings back the sample a Paste, a RAM to ROM copy, a Rename or a Load replaced. Sixteen steps. A step that replaced an empty slot cannot be undone (see "Erase" below).
6. **Erase one, erase all, Clear.** Not in this branch. See "Erase".

A real Machinedrum over HW MIDI keeps its limits: it ignores sample dump requests, so nothing here can read its samples. Every new control is off with the reason (`sampleAudio`), as Rename is.

## How it maps to the firmware

The firmware gives the editor exactly two ways in, and both are used as the existing sample code uses them.

| Function | Firmware mechanism | Status |
|---|---|---|
| Read a slot (list, sizes, export, copy) | The emulated machine's memory (flash for ROM, DSP2 for RAM), read as the bank already is (`elektronData::readMdSampleBank`, P9). No MIDI. | Built |
| Write a slot (paste, RAM to ROM, undo, rename, load) | SDS into a ROM slot, with the 0x73 name, paced by the machine's handshake (`mdDesk::SdsSender`, `Desk::loadSample`). The firmware stores the new record in a free flash sector and frees the old one. | Built |
| Send to a computer | The firmware ignores SDS dump requests (measured on OS 1.63, P3), so the machine cannot send. The editor does not need it: it reads the same bytes from memory and writes a WAV. | Built as export |
| Erase one, erase all | Only the panel's SAMPLE MGR > ERASE. No SysEx or SDS message frees a slot. | Not built, see below |
| RAM to ROM | The panel does it (FUNCTION + REC, FUNCTION + STOP). SDS cannot write a RAM slot, but it can write the ROM slot. | Built as a send of the RAM take |

What the SDS route does not carry: the slot's loop points (the header has them; the existing sender writes none, as Rename already does) and the 12-bit quality of a RAM take (the take is sent as the 16-bit values the expander gives; the firmware plays ROM at 12 bit anyway). Both are said in the result text.

### Erase

The panel route is GLOBAL EDIT (FUNCTION + PATTERN/SONG) > FILE > SAMPLE MGR > ERASE > slot > ENTER > ENTER. The cursor of the global menu and of the file menu is not known from outside, and the editor has no reader for the LCD text. A key macro written without the LCD would press into the wrong row. Two ways are open, both need Radek:

- A. A firmware probe on a `release/*` branch (the ROMs reach only main and release/*): dump the LCD after each key and find how to reach SAMPLE MGR from any state (exit three times, then the menu's fixed start position). Then a panel macro, verified by the bank (the slot reads empty afterwards).
- B. Treat a slot as "cleared" by sending a short silent sample. Rejected: the slot would still list a sample and use memory.

Until A is done, MD-194 stays missing and MD-198 is partial (copy, paste and undo done; clear needs erase).

## Where it sits (the page's rules)

- No new workspace. All of it is on the Sampler workspace, in the ROM slot card (`romsel`) and the RAM slot card (`ramtop`), as keys in the card's existing slot bar. No right-click, no duplicate of a key that already exists (Radek's rules, manual-gaps design).
- ROM slot card: `Put on track`, `Load sample...`, `Rename`, then a second line of keys: `Copy`, `Paste` (off while the clipboard is empty), `Export WAV`, `Undo sample`, and the clipboard chip. The disabled `Send` key is gone (export replaces it).
- RAM slot: a card "Keep and export" under the take: `Copy`, `Keep as ROM...` (asks for the ROM slot, the first empty one offered; the slot's old sample is replaced and Undo sample brings it back), `Export WAV`, `Export all RAM...`, and the chip. The note "no copy to ROM from here" is shortened to "no file load".
- ROM tiles header: `Export all...` (a folder).
- Memory line in the tiles card header: "N of 48 hold a sample · 12.3 s used · 20.1 s free (62 %)", the ROM slots and the four RAM buffers against the DSP memory. The top bar's MEM field is unchanged (used share).
- Key and tile tooltips show the size in seconds, KB (16-bit mono) and samples.
- The clipboard shows as a chip: "Copied: ROM-05 SNR · 0.42 s".

## Commands and messages (the contract)

Desk ops, `Owner::Setup`:
- `sampleCopy {bank, slot}`: copies a slot's samples into the desk's clipboard. Refused for an empty slot, an unreadable bank, a real machine.
- `samplePaste {slot}`: sends the clipboard to ROM `slot` (SDS). Refused when empty, when it does not fit the memory left (the text says by how much), when a sample is already on its way, or while the machine takes no input.
- `ramToRom {ram, slot}`: `sampleCopy` of RAM `ram` and `samplePaste` into `slot` as one gesture.
- `sampleUndo`: sends back what the last step replaced.

Window op (the file chooser is the window's): `sampleExport {bank, slot, all}`. The window asks for a file (one slot) or a folder (all). The session writes the files from `Desk::exportSamples`.

Messages: `sampleHistory {clip, undo}` (the clipboard and the last undo step, `null` when none; on every change and after a ready); `sampleExport {ok, count, text}` (the export's result).

Progress of a send is the existing `sampleLoad` message, with `file` set to "Paste", "RAM 2" or "Undo".

## Undo model

A step is recorded when a send starts and kept when `sampleLoad` says `done` (dropped when it fails or is cancelled). It holds the slot, a words label ("Paste into ROM-05"), and the replaced samples, rate and name, shared (not copied). A step is recorded only when the slot held a sample and the bank could read it. Undo sends the step back and records nothing: there is no redo. The stack holds 16 steps and is forgotten when the machine starts over (the bank is read anew). The samples are the machine's, the undo is the editor's: the editor window's Undo/Redo (documents) is untouched, and Undo sample is a separate key with a separate tooltip.

## Tests

- `mdDeskTest` (no ROM): clipboard copy / paste / RAM to ROM / undo through the Desk with a recording adapter; refusals (empty, real machine, no room, busy); `exportSamples` names and the WAV bytes; `sampleHistory` published; contract schema.
- Page tier (`mdDeskPageTest.js`): the keys' enabled states, the history message, the memory line.
- Journey `md-sampler-manager` (E2E on the firmware): the memory line, copy a ROM slot, paste it into another, the target reads the same length; undo, it reads its old length. Proves MD-196 and MD-198. RAM to ROM (MD-199) and export (MD-193) have no journey: the first needs a RAM take, the second a native file dialog; mdDeskTest covers their bytes.
- Not built here and so not tested: erase.
- State when this was written: nothing was run locally (the rule). The branch goes through `mdmm-ci.yml` by hand; the firmware workflow (the journey) reaches the ROMs only from main or a release branch.

## Decisions for Radek

1. Erase: approve the probe (A) on a `release/*` branch.
2. Export as WAV only, or also as an SDS `.syx` with the slot position (the manual's SEND to C6 does that). The code path is `mdSdsDump(slot, ...).bytes()`; it is small.
3. RAM to ROM: the manual's copy empties the other RAM slots after a prompt. The editor does not. Keep it so?
