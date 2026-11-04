# 0.9.0: AUTO RECEIVE, a Monomachine dump from MIDI in lands as on the Machinedrum (I-070)

Branch `feat/0.9.0-mm-auto-receive`, from `release/0.9.0`. Monomachine Editor. Source: a user request (2026-11-04,
Ableton Live 12, both editors as VST3, a Max for Live device that makes songs, patterns and kits as SysEx and sends
them to the editors from a MIDI track). Radek moved it into 0.9.0 the same day.

## Problem

The Machinedrum Editor takes a dump from the DAW in one go. The Monomachine Editor ignores it, unless the person has
put the machine on GLOBAL > FILE > SYSEX RECV first. Today the only way is: save the dump as a .syx, IMPORT SYSEX,
confirm. The person asks for an option, off by default: "when a dump arrives from MIDI in, open SYSEX RECV, take it,
go back".

## Why the Machinedrum works and the Monomachine does not (side by side)

Both editors share one MIDI-in path; nothing in the editor differs between them:

| Step | Machinedrum Editor | Monomachine Editor |
|---|---|---|
| The DAW's MIDI (or the standalone's MIDI in) reaches `pluginLib::Processor::processBlock`, which makes an `SMidiEvent` with source Host | same | same |
| `addMidiEvent`: `midiInReceived` (the monitor; SysEx passes by), HW MIDI's `externalMidi.takeIn` (off on the emulator), `consumeMidiIn` (MIDI Learn: SysEx is never learned) | same | same |
| `midiToFirmware`: the bytes go to the emulated machine's MIDI in, raw | same | same |
| The firmware | **MD OS 1.63 takes a kit, pattern, song or global dump on every screen** | **MM OS 1.32B takes a dump only while GLOBAL > FILE > SYSEX RECV is open; on any other screen it drops it** |
| The page | reads what changed in the background (the working kit from memory; slots when read) | nothing changed |

So the difference is the firmware alone. The editor routes, filters and queues nothing differently. The hardware
behaves the same way: a real Monomachine also ignores a dump outside SYSEX RECV.

The editor already knows how to give the Monomachine a dump: every edit the editor makes itself, and IMPORT SYSEX,
go through `Machine::sendAsIs(dump)` -> the adapter's `RecvSession` (mmRecv.h), which drives the emulated panel to
SYSEX RECV, sends while parked (the machine keeps playing), waits until the machine has taken it, and EXITs back
after 3 s idle. On the Machinedrum `sendAsIs` is the plain stream. That is the MD's path and the MM's path for the
same thing: "a dump from outside, as it is; the firmware decides what it takes".

## Design

**Option (a), on the existing IMPORT SYSEX machinery.** With AUTO RECEIVE on, a Monomachine user-data dump that
arrives on the host's MIDI in is taken off the raw path and handed to the session's SysEx work as an import without
the preview and without the read-back (I-038's `readBack: false`), so it goes the way IMPORT SYSEX sends: through
`sendAsIs` and SYSEX RECV, one undo step (B-130), and the desk reads the written slots again afterwards (B-174). No
new route to the machine, no new screen driving.

Option (b) (IMPORT SYSEX opens SYSEX RECV by itself and skips the confirm) is already true for the emulator except
the confirm: the editor opens SYSEX RECV for every import on the emulated machine. It does not help the person's
case: the dump still has to be saved as a file and opened. Not built.

### Data flow

```
DAW MIDI track --SysEx--> processBlock --> addMidiEvent --> consumeMidiIn
     autoReceive off (default) or not an MM user dump: return false --> midiToFirmware (raw, as today)
     autoReceive on and an MM user dump (F0 00 20 3C 03 00 {50,52,67,69} .. F7):
         HostDumpInbox.tryPush (audio thread, no allocation, no lock; full -> false: raw, as today) and return true
session step (message thread) --> MmSession::stepModel: takeHostDump() --> SyxWork::fromHost(bytes)
SyxWork::step, no job running --> SyxJob over the collected dumps ("from MIDI in"), kinds kit/pattern/song/global,
     readBack off --> sendAsIs --> RecvSession: SYSEX RECV, send, taken, EXIT after idle --> reread (B-174)
     --> the page: the library and the open documents update; one toast "Received from MIDI in: ..."
```

### Hardware-true when off

Off is the default and writes nothing to the project. Off, `consumeMidiIn` returns what it returned before: the dump
goes to the firmware raw and the MM drops it outside SYSEX RECV, exactly as the hardware does. A person who opens
SYSEX RECV on the emulated panel by hand and sends from the DAW gets what they got before.

### The setting

- `DeskSetup::autoReceive` (bool), kept with the project in the editor's setup document (`"autoReceive": true`,
  written only when on, read leniently: anything but `true` is off), as FOLLOW PLAYED TRACK (I-003).
- Command `autoReceiveSet {on}` (Owner::Setup), echo `{"type":"autoReceive","on"}`.
- The engine menu's `AUTO RECEIVE: ON / OFF` (beside FOLLOW PLAYED TRACK). Not a host parameter: it is a setup of
  the editor, not of the sound, and an automatable switch for it would make no sense.
- The session tells the processor once a step (`setHostDumpCapture`, a relaxed atomic) whether it captures:
  `autoReceive && engine is the emulator`. HW MIDI: the host's MIDI in is the real machine's own MIDI out
  (`externalMidi` takes it before `consumeMidiIn`), so the switch does nothing there and the menu says so.
- The Machinedrum Editor never sets the capture: its firmware takes the dump raw.

### Default: off (a decision for Radek)

The user asked for off by default "so normal behaviour stays authentic". "Same as the MD" would argue on by default:
from the user's view the MD Editor takes a host dump with no switch. Built off; flipping it is one constant
(`g_autoReceiveDefault` in deskSetup.h; a project that never set it then reads on). Radek decides.

### While the machine is busy

- **Playing:** the machine plays on while parked on SYSEX RECV (MM-P0 §3). A pattern dump into the pattern that
  plays applies when the pattern is loaded again, as on the hardware.
- **A dump over the kit that plays:** the kit is loaded again (LOAD KIT), and the working kit's unsaved edits are
  gone, as with IMPORT SYSEX. The step is one undo step (B-130), so Undo brings the kit back.
- **The person mid-edit:** panel keys and transport the editor sends while the machine is taking a dump wait
  (`RecvSession::taking`, B-099); page edits queue behind the dump as they do behind an import.
- **An import, an export or the DigiPRO manager running:** host dumps wait in order and go as one job when it ends.
  An IMPORT SYSEX asked while a host job runs is refused with "Taking a dump from MIDI in; try again in a moment."
- **Not ready** (booting, no ROM): the dumps wait until the machine is ready (SyxWork steps only then).

### "Back to the previous screen"

The SYSEX RECV session EXITs to the main screen 3 s after the last dump (its idle time), as after the editor's own
edits. The main screen is the screen the editor keeps the machine on; a person who had the emulated panel in a menu
comes back to the main screen, not to the menu. The page itself does not change workspace.

### Edge cases

- **Partial or broken dumps:** a SysEx message is whole when the host delivers it. A dump the import would not send
  (bad checksum, wrong length, another device) is left out with its reason (SyxJob::open), the toast says
  "nothing to take" with it; the firmware would have refused it too.
- **Many dumps in a row** (Max sends a song, its patterns and kits in one burst): they are collected while a job runs
  and go as one job in arrival order; the RecvSession stays parked between them. The inbox holds 256 KB
  (a full MM backup is about 200 KB); past that a dump goes raw (as with the switch off) and the log says so.
- **Other SysEx** (requests, the 0x5x commands, DigiPRO waveforms 0x5D) is not captured: it goes raw as today
  (the commands act on every screen, mmCommands.h; waveforms belong to the DigiPRO manager).
- **The MD side** is unaffected: its session never sets the capture, and an MD dump sent to the MM Editor is not an
  MM dump.
- **The standalone:** its MIDI input device reaches the processor as host MIDI, so a librarian sending to the
  standalone gets the same.

## Tests

- deskCoreTest / setup: `autoReceive` off by default and not written; on kept; lenient read.
- mmDeskTest: `autoReceiveSet` saves the setup and echoes `autoReceive`; a loaded project publishes it.
- mdHostDumpsTest (new, ROM-free): `isMmUserDump` (the four kinds, other SysEx, MD dumps, truncated); the inbox
  (order, capacity, a message that does not fit, empty pop).
- syxImportTest (the SyxWork test doubles): `fromHost` runs one job with `readBack` off, no preview or progress to the
  page, one toast, the slots read again; dumps that arrive while a job runs wait and go together; an import asked
  meanwhile is refused.
- Journey `mm-auto-receive` (machine tier, firmware E2E): kit 120's name is read; with AUTO RECEIVE off a kit dump
  of the run's fixture placed at kit 120 sent as host MIDI changes nothing; on, the same dump lands (the library
  shows its name); Undo puts the kit back; the switch is turned off again. Host MIDI in the standalone is injected
  by the diagnostics build's page-log hook `hostsyx kit <slot>` (as `dropfiles`).
