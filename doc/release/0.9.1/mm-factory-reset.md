# 0.9.1: the Monomachine's factory reset (MM-318)

Branch `feat/0.9.1-mm-factory-reset`, from `integ/0.9.1`. Radek's decision of 2026-11-09: the Monomachine Editor gets
a real factory reset, as the Machinedrum Editor has (MD-204, PROBES-manual-gaps.md P6).

## Problem

RESET MACHINE… on the Monomachine offers Empty reset only (`Syx.host.factory` false). The question, the guide (chapter
20), DESIGN-machine-menus.md section 4 and MM-318 say the Monomachine's factory data is not in the editor. The real
machine has FACTORY RESET in its early startup menu (manual 1-110; the ROM holds the menu: "3..FACTORY RESET").

B-175 (closed, not reproduced) stays in view: a tester saw K01 SUPERWAVES keep its factory sound after Empty reset.

## Where the factory data comes from (evidence)

Two candidates: (a) a second emulated Monomachine started from the user's own ROM with no patch RAM, read as dumps
(the Machinedrum's way, `mdFactorySource.h`); (b) the firmware's own FACTORY RESET on the machine that plays (hold a
key at power on, pick 3 in the early startup menu).

The tree already shows that a Monomachine started with no patch RAM holds the factory data, as the Machinedrum does:

- `mmCpuBenchTest` boots with no patch RAM and plays "the factory A01 SUPERWAVES: six synth tracks, 116 trigs over 64
  steps"; its run fails unless the step counter moves.
- `mmDeskFirmwareTest` (no patch RAM) plays "pattern 1 (a factory demo)"; `factoryglobal` reads the eight globals of
  such a machine as the factory ones (`elektronData::mmFactoryGlobal`); `emptyPatternMm` was measured on the 63 empty
  factory pattern slots of such a machine.
- The ROM does not hold "SUPERWAVES" as text: the data is packed in the ROM and unpacked by the firmware's own start
  with an empty patch RAM, as P6 found for the Machinedrum.

(P0-RESULT.md's "without it the MM boots with empty user data" is older than these measurements and wrong.)

**Chosen: (a).** It is the Machinedrum's proven path (one shared class, `MdFactorySource`, now given the model), it
needs no committed ROM content, it leaves the machine that plays alone until the dumps are ready, and its result is
an ordinary import, so read-back, the report and B-130's undo come for free. (b) would need the machine that plays to
be restarted through a timed key hold, would reset the globals and the DigiPRO waveforms as well, and could not be
undone. The new firmware ctest proves the premise: two fresh boots give the same dumps, and K01 is a named kit, not
the empty one.

## What it writes

The 128 kits, 128 patterns and 24 songs of the second machine, sent as an import on SYSEX RECV (the session's
`SyxWork::reset`, the same job as Empty reset), each read back and reported ("restored"). Globals stay, as on the
Machinedrum: B-130's undo holds no global, and GLOBAL > Clear already gives each slot its factory global (measured).
DigiPRO user waveforms stay. The factory data is read once a session (the same at every start).

## Undo

The B-130 undo, unchanged: the job copies every kit, pattern and song it will write and the kit that plays before it
sends, and the copies become one history step when it ends. One Undo puts them back; Redo restores the factory data
again.

## Hardware MIDI (a real Monomachine)

The same job, sent to the real machine: the factory data comes from the user's ROM on the computer (no ROM: the reset
is refused and says so), the dumps go over the cable and the machine must be on its SYSEX RECV screen, as for Empty
reset (the sync field reads SEND and the number of waiting dumps until it is). Undo works the same way.

## Code

- `mdFactorySource.h/.cpp`: `start(rom, name, model)`, `read(…, model)`, `total(model)`: the kinds and slot counts per
  model (MD 64/128/32 with product id 2, MM 128/128/24 with product id 3); the MM settles 9 s after MIDI is ready
  (its start-up animation, MM-P0-RESULT section 6).
- `mdFactoryReset.h`: the request and step of a factory reset (the Machinedrum session's code, moved, model and
  names as data); both sessions hold one.
- Page: `Syx.host.factory` true on the MM; `Syx.host.samples` says whether the machine has samples, so the question's
  "samples stay" no longer follows `factory`.

## Proof

- Firmware ctest `mmFactoryResetFirmwareTest` (`mmDeskFirmwareTest --env factoryreset`): two fresh boots read
  through `MdFactorySource` give the same 280 dumps; K01 is named and is not the empty kit; with K01 renamed and
  active, the production reset makes every kit, pattern and song equal the factory ones (read back) and the working
  kit the factory K01; then Empty reset with the factory K01 playing empties stored K01 and the working kit (B-175 on
  the true factory kit); Undo brings the factory K01 back; a second Undo the renamed K01.
- Journey `mm-engine-reset-factory` (MM-318), independent of what the run's machine holds: Empty reset first (no kit
  named, no trigs), then RESET MACHINE… offers Factory reset…; after it K01 is named, patterns have trigs, the global
  is unchanged and the panel says restored; Cmd+Z empties the machine again.
