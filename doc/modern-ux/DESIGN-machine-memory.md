# Design: machine memory that stays (I-024, wave 11 of 0.6)

Radek chose way A on 2026-10-12 (doc/release/IDEAS.md I-024): what you save on the machine is there in every new
session, like a real Machinedrum or Monomachine with its battery-backed memory. A DAW project still opens with its own
memory. Code: `source/elektron/md/mdJucePlugin/mdMachineMemory.h` (the file and the write policy, pure) and the
processor's part (`mdPluginProcessor.cpp`, "machine memory").

## 1. What the file holds (the data contract)

One file per machine, `machine-memory.bin`, in the editor's user folder (the same folder as `roms/` and `config/`):

| OS | Machinedrum | Monomachine |
|---|---|---|
| macOS | `~/Documents/Gearmulator Preview/Machinedrum/memory/` | `~/Documents/Gearmulator Preview/Monomachine/memory/` |
| Windows | `Documents\Gearmulator Preview\Machinedrum\memory\` | `...\Monomachine\memory\` |
| Linux | `~/Documents/Gearmulator Preview/Machinedrum/memory/` | `.../Monomachine/memory/` |

(`GEARMULATOR_DATA_ROOT` moves the whole data folder, as for the ROMs: tests and journeys run in a scratch one.)

```
offset  size  field
0       8     magic "MDMMMEM\0"
8       4     format version, little endian (1)
12      1     machine: 0 Machinedrum, 1 Monomachine
13      3     zero
16      4     payload size, little endian
20      4     CRC-32 of the stamp and the payload (md::crc32, as zlib's)
24      8     stamp, little endian: names this write (never 0)
32      n     payload: the device state exactly as a DAW project's "MIDI" chunk holds it
              (synthLib::Plugin::getState(StateTypeGlobal): its two-byte envelope, then md::encodeState)
```

Every state the processor saves (a DAW project's, the standalone's own) carries a small "MMEM" chunk: the stamp of the
file whose saves this memory holds (0: none) and `unsaved`, set when a write failed, so this memory holds saves the
file lacks (`machineMemory::Mark`).

So the file holds what a project holds of the machine, and nothing more:

- **Machinedrum:** the 1 MiB patch RAM (kits, patterns, songs, globals, the kit that plays with its unsaved edits) and
  the UW flash sectors that differ from the factory flash (the user's samples), bound to the ROM by its fingerprint.
  The file is only written once the machine has its factory flash cache, so the flash part is always sparse: no ROM or
  firmware bytes. RAM-machine recordings stay volatile, as on the machine and in a project.
- **Monomachine:** the 1 MiB patch RAM and the 2 MiB DigiPRO user flash window.
- Not in it: the editor's setup, the volume, MIDI routing, automation: those stay the project's.

## 2. When it is read

At the start of a session (a plug-in instance or the standalone), once the machine has its ROM:

1. A DAW project state came (the DAW's `setStateInformation`, a ROM-less project held and handed over): **the project
   wins**, the file is not read. The standalone's own state (JUCE saves it when the app quits) is no project (Radek,
   2026-10-12: one memory for everything, like a real machine; `machineMemory::stateIsProject`).
2. KEEP MEMORY off, or no file: the memory the session has (the standalone's own state, or factory memory).
3. The standalone's own state stays when it holds every save of the file: its mark names the file's stamp (the file is
   the one it wrote last), or it says `unsaved` (a write failed, so the file is stale: the own state is written at once).
   Its unsaved edits of the kit and pattern that play stay too, as on a machine switched off and on.
4. Else the file's payload goes to the machine the way a project's does (`synthLib::Plugin::setState`, the same restore
   path, the same cold boot): a plug-in, or a standalone whose state is older than the file (another instance saved
   since, or a state from before I-024).

The rule never loses a save: the own state wins only when the file has nothing it lacks (the same stamp) or it has
saves the file lacks (a failed write); when another instance saved since, the file is newer and wins, and only the
standalone's unsaved edits of the kit that plays go (they were never saved; two instances are "the last save wins",
section 5). Pure: `machineMemory::startOf`, tested in mdMachineMemoryTest.

A project state that comes after the file was applied still replaces it (project wins, one extra restart).

## 3. When it is written

**Only a real save writes the file** (Radek, 2026-10-12, after the review that failed the first version on data loss):
a kit, pattern, song or global stored into a slot, from the page or the machine's own keys. Knob moves, automation and
unsaved edits of the kit or pattern that plays never write it; a DAW project that plays with automation writes nothing.

How a save is seen: the editor watches **the stored slots, not the working buffers**, and not the commands. Hooking the
save paths would miss the machine's own keys (SAVE KIT on the panel, a global changed in its menus, a dump received),
which the firmware handles inside the emulation; the stored slots change on every one of them and on nothing else.
The patch RAM is watched except the ranges the firmware changes without a save (`machineMemory::unwatched`, measured
with mdMachineMemoryFirmwareTest's probe, `MDMM_MEMORY_PROBE=1`):

| | Machinedrum | Monomachine |
|---|---|---|
| The working area: the kit that plays with its unsaved edits (every knob, CC and automation lands here), its second copy (what LOAD KIT and SAVE KIT go through), the current slot numbers | 0x000000-0x0008c7 (kit slot 1 starts at 0x8c8) | 0x000000-0x00059f (kit slot 1 at 0x5a2) |
| The pattern loaded last (two bytes LOAD PATTERN writes) | 0x0272be-0x0272bf | 0x016ae3-0x016ae4 |
| Bytes that move by themselves | 0x07fff0-0x07fff7 (while it plays) | 0x0ff000-0x0fffff (the firmware's stack) |

Also watched: the Monomachine's 2 MiB user flash (its DigiPRO waveforms change only when one is stored). Not watched:
the Machinedrum's flash (OS 1.63 writes it by itself the first time the factory patterns play, about 590 000 program
and erase operations in 12 s). A sample the page sends (Sampler, ROM-xx) is a save of a slot: when its transfer ends
the watch waits until the flash has been still for a second after the store began (30 s at the latest) and writes
(`machineMemorySampleStored`, from the desk's `sampleLoad` "done"). A sample another program sends by SDS is written
with the next save. The file always holds the whole memory, as a project does: what the watch skips is written with
the next save.

The machine's pattern edits are stored in the pattern's slot as they are made (the Machinedrum and Monomachine have no
SAVE PATTERN), so a step or lock entered is a save; a parameter lock recorded live is too. CCs from a DAW with live
recording off change the working kit only.

- A background thread ("machine memory", never the audio thread) looks once a second: under the plug-in's lock it
  copies the 1 MiB patch RAM (the Monomachine also its 2 MiB user flash) and reads the Machinedrum's last flash write;
  the hash is made after the lock is released.
- It writes when the watched memory differs from what was last written (or from the memory at the start) and has been
  quiet for one look, or at the latest 10 s after the first change while it keeps changing. The write: under one hold
  of the plug-in's lock the check that it is the machine the watch saw (its hardware epoch) with no restore under way,
  and the state capture (`Device::beginStateCapture`, B-034); the encode after the lock; framed with a new stamp,
  written to a temporary file in the same folder, flushed to the disk (`FileOutputStream::flush`: fsync on POSIX,
  FlushFileBuffers on Windows) and renamed over the old one (`juce::TemporaryFile`), so a crash leaves the old file or
  the new one.
- Not while the machine starts, restores a project or prepares its factory flash: it starts watching again once the
  firmware answers MIDI and its watched memory holds still for a look, with that memory as its base. Opening a project
  therefore writes nothing until something is saved.

What closes the ways a save could be lost:

| Way | What the editor does | Test (mdMachineMemoryFirmwareTest) |
|---|---|---|
| A save just before the instance closes (the watch's next look not come) | the thread is told to stop and joined (never killed: it may hold the file or the plug-in's lock), then one last look under the lock writes when the watched memory differs from what was written; the same last look runs before every state save (DAW save, the standalone quitting), so the state's mark names the file that holds its saves | session 3d/3e |
| KEEP MEMORY off, saves, on again | on: the memory is written at the next look, changed or not | session 3e |
| A write fails (read-only folder, disk full) | the old file stays; the note says why; the mark says `unsaved`, so at the standalone's next start its own state wins over the stale file and is written at once; every later save tries again | session 3h |
| The standalone starts with its own state and a file | section 2, rule 3 | sessions 3b, 3f, 3g |
| A DAW project state comes after the file was applied | the project wins (a restore; the watch takes a new base, nothing is written) | session 3c |
| Automation while playing | nothing is written (12.5 s of CCs on every track with the sequencer running) | session 1 |

## 4. The controls

- **RESET MACHINE… > Start from factory memory…** (wave 6's question, its third choice; asked a second time): restarts
  the machine from factory memory (a fresh machine's state, as on a new install), then deletes the file. Nothing is
  changed when the fresh machine has no ROM or the machine refuses the state; when the file cannot be deleted, the
  factory memory is written over it at the next look, so the old file never comes back. One place, no
  separate entry (Radek's rule). Chosen over making wave 6's Factory reset also clear the file: that reset keeps
  globals and samples and exists on the Machinedrum only, while this one is the whole memory, on both machines, in
  seconds; folding the file into it would leave the Monomachine without a way back and change what Factory reset means.
- Engine menu: **KEEP MEMORY: ON / OFF** (the setting, in the editor's config, default on). Off: nothing is read or
  written; the file stays for when it is turned on again.
- The page hears `{"type":"machineMemory", keep, saved, note}` on its ready and when it changes.

## 5. Failure modes

| Case | What happens |
|---|---|
| No file | factory memory, silently |
| Not ours, wrong machine, newer format version, size or CRC wrong (a broken write, a crafted file) | factory memory; the file is renamed `machine-memory.unusable.bin` (one kept) and the plug-in says so in a notice; the next save writes a new file |
| The machine refuses the payload (the Machinedrum's ROM changed: the fingerprint does not match; a bad state inside a good frame) | as above: the restore fails with no change to the machine, the file is moved aside, the notice says why |
| No ROM | nothing is read until a ROM is installed; then as at a start |
| Two instances of one machine | each writes its own saves; the last save wins (the guide says so) |
| Write fails (disk full, no permission) | the old file stays; the note says why; the standalone's state is marked `unsaved` (section 2, rule 3); the next save tries again |

## 6. Cost (measured 2026-10-12, M4 Pro, mdMachineMemoryFirmwareTest at 10 looks a second)

| | Machinedrum (OS 1.63) | Monomachine (OS 1.32B) |
|---|---|---|
| A look: the plug-in's lock held (the audio thread can wait this long, once a second) | 0.018 ms typical, 0.165 ms worst | 0.065 ms typical, 0.355 ms worst |
| A look with its hash, on the thread | about 1 ms | about 4 ms |
| A write: `Plugin::getState` (its lock part is B-034's capture, 0.1 to 0.5 ms), frame, temporary file, rename | 2.3 to 3.9 ms, 1 MiB file (no user samples) | 4 to 8 ms, 3 MiB file |
| Writes while idle or playing (12 s of play) | none | none |

The first look allocates its buffers before it takes the lock; later looks copy into them. Measured on the way: the
Monomachine's firmware changes 0x0ffd38-0x0ffd43 of its patch RAM (its stack) by itself, seconds after the start and
now and then; those 4 KiB are left out of the look (`machineMemory::watchedPatchBytes`), else every session would write
the file once with nothing saved. A save that changes only them is not written until something else changes.

## 7. Decided (Radek, 2026-10-12)

- The standalone starts from the file too (above, section 2).
- Start from factory memory is a choice of RESET MACHINE… (section 4); the engine menu keeps KEEP MEMORY only.
- Only a real save writes the file: a kit, pattern, song or global stored into a slot (section 3).
