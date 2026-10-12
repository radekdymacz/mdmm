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
20      4     CRC-32 of the payload (md::crc32, as zlib's)
24      n     payload: the device state exactly as a DAW project's "MIDI" chunk holds it
              (synthLib::Plugin::getState(StateTypeGlobal): its two-byte envelope, then md::encodeState)
```

So the file holds what a project holds of the machine, and nothing more:

- **Machinedrum:** the 1 MiB patch RAM (kits, patterns, songs, globals, the kit that plays with its unsaved edits) and
  the UW flash sectors that differ from the factory flash (the user's samples), bound to the ROM by its fingerprint.
  The file is only written once the machine has its factory flash cache, so the flash part is always sparse: no ROM or
  firmware bytes. RAM-machine recordings stay volatile, as on the machine and in a project.
- **Monomachine:** the 1 MiB patch RAM and the 2 MiB DigiPRO user flash window.
- Not in it: the editor's setup, the volume, MIDI routing, automation: those stay the project's.

## 2. When it is read

At the start of a session (a plug-in instance or the standalone), once the machine has its ROM:

1. A project state came (the DAW's `setStateInformation`, the standalone's saved state, a ROM-less project held and
   handed over): **the project wins**, the file is not read.
2. Else, with the setting on and a file there: the file's payload goes to the machine the way a project's does
   (`synthLib::Plugin::setState`, the same restore path, the same cold boot).
3. Else the machine starts from factory memory, as before.

A project state that comes after the file was applied still replaces it (project wins, one extra restart). The
standalone saves its own state when it quits, so it reads the file on its first start only.

## 3. When it is written

A save on the machine changes its memory (SAVE KIT, a pattern edit, SAVE SONG, a GLOBAL change, a SysEx dump received,
a sample loaded; from the panel or from the page alike). The editor watches the memory, not the commands:

- A background thread ("machine memory", never the audio thread) looks once a second: under the plug-in's lock it
  copies the 1 MiB patch RAM (the Monomachine also its 2 MiB user flash) and reads the Machinedrum's last flash write;
  the hash is made after the lock is released.
- It writes when the memory differs from what was last written (or from the memory at the start) and has been quiet
  for one look, or at the latest 10 s after the first change while it keeps changing. The write is the full state
  (`Plugin::getState`, the same capture-then-encode as a DAW save, B-034), framed, written to a temporary file in the
  same folder and renamed over the old one (`juce::TemporaryFile`), so a crash leaves the old file or the new one.
- Not while the machine starts, restores a project or prepares its factory flash: it starts watching again once the
  firmware answers MIDI, with the memory of that moment as its base. Opening a project therefore writes nothing until
  something is saved.
- The plug-in instance going away writes a change it has not written yet.

## 4. The controls

- Engine menu: **START FROM FACTORY MEMORY…** asks first; Yes deletes the file and restarts the machine from factory
  memory (a fresh machine's state, as on a new install). No right-click, no second place.
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
| Write fails (disk full, no permission) | the old file stays; the note says why; the next change tries again |

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

## 7. Open for Radek

- Wave 6 (`feat/0.6-sysex`, not merged) adds RESET MACHINE… with Empty reset and the Machinedrum's Factory reset. START
  FROM FACTORY MEMORY… is close to that Factory reset; once both are on `feat/0.6-features`, it becomes the third
  choice of that question (one place, no duplicate) and MD-204 can point to it.
- The standalone keeps its own state when it quits (JUCE's), so it reads the file on its first start only. The other
  way would be to treat the standalone's saved state as no project and always start from the file.
