# Design: machine memory that stays (I-024, wave 11 of 0.6)

Radek chose way A on 2026-10-12 (doc/release/IDEAS.md I-024): what you save on the machine is there in every new
session, like a real Machinedrum or Monomachine with its battery-backed memory. A DAW project still opens with its own
memory. Code: `source/elektron/md/mdJucePlugin/mdMachineMemory.h` (the slot layout, the file, merge and overlay, the
write policy; pure) and the processor's part (`mdPluginProcessor.cpp`, "machine memory").

**The file is a store of saved slots, not a snapshot of the memory** (second review, 2026-10-12; see "Why slots"
below). A save writes only the slots it changed into the file: the file is read, those slots are merged in, the file
is written back in one step. A session with no project state starts from factory memory (or the standalone's own
state) with the file's slots laid over it. A DAW project still opens with its own memory, and a save made in it merges
only the slots it changed. The unsaved working kit never goes to the file.

## Why slots

The first two versions wrote the whole memory on every save. The second review found that any write from any session
then replaced every other session's saves:

- **A.** KEEP MEMORY off at the start, then on: the session's whole memory (factory memory with one new kit) replaced
  the file, and every slot saved before was gone.
- **B.** A DAW project's mark ("this state holds saves the file lacks") could make an old project's whole memory win
  and be written over the file.
- **C.** A standalone state from before I-024 either lost its own stored slots to the file or wrote its whole memory
  over the file's saves.
- **D.** Opening an old project and saving one kit wrote the old project's whole memory: every kit, pattern and song
  saved since in other sessions went back to the project's.

With slots each of these writes only what was saved, so no session can take back another one's saves. The cases and
their tests are in section 3.



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
8       2     major version, little endian (2; 1 was the previews' whole-memory file: not read)
10      2     minor version (0; 0.7 wrote major and minor as one u32 2, the same bytes)
12      1     machine: 0 Machinedrum, 1 Monomachine
13      3     zero (not read; a newer minor's are kept with its entries)
16      4     layout id (machineMemory::layoutId: a hash of the slot table below)
20      4     CRC-32 of everything from 24 on (md::crc32, as zlib's)
24      8     MD: the ROM's fingerprint its flash sectors belong to (FNV-1a 64 of the ROM), else 0
32      4     entry count
36      4     payload size (everything after the header)
40      ...   entries: kind u8 (1 kit, 2 pattern, 3 song, 4 global, 5 other block, 6 flash sector), flags u8 u8 u8
              (zero), index u32, saved at u64 (ms since 1970), size u32, then the slot's bytes as they sit in the machine
```

Since 1.0 the file accretes (FOUNDATION.md, "What 1.0 promises to read"). The major version changes only with an
incompatible change and an editor reads no other major; the minor counts additions an editor of the same major reads
past. Each entry carries its size, so an entry the editor cannot use (a kind or flags it does not know, a slot of
another size or one its layout lacks) is skipped alone, kept (`StoreFile::foreign`) and written back as it was; the
editor's own save of the same slot replaces it, and Start from factory memory drops it with the rest. While such entries
are kept, the file keeps its minor and its reserved header bytes, so an older editor sees a newer file. A file of another
layout id is refused (a layout change is a major bump: a slot matched on size alone could land on other RAM). An entry
cut short, or the same slot twice, is damage.

### The slots (measured, `machineMemory::patchSlots`)

Measured with mdMachineMemoryFirmwareTest's probes (`MDMM_MEMORY_LAYOUT=1`: a changed dump sent to slots 0, 1 and the
last and the bytes it changed; the Monomachine's dumps' raw payloads found byte for byte in its patch RAM;
`MDMM_MEMORY_PROBE=1`: what idle, play, automation, a kit name, SAVE KIT, LOAD PATTERN and LOAD KIT change).

| Patch RAM | Machinedrum (OS 1.63) | Monomachine (OS 1.32B) |
|---|---|---|
| Kits | 64 x 0x460 from 0x0008ca | 128 x 0x2ba from 0x00059c |
| Globals | 8 x 0xb2 from 0x0120cc | 8 x 0x108 from 0x0162a0 |
| Songs | 32 x 0xa10 from 0x0130be | 24 x 0x12d0 from 0x0e39b8 |
| Patterns | 128, three parts each: 0x896 from 0x0272c0, 0xcc from 0x06bdc0, 0x90c from 0x080000 | 128 x 0x1978 from 0x016ae4 |
| Never a save (unwatched) | 0x000000-0x0008c9 (the kit that plays and its copy), 0x0120ca-0x0120cb (the active global's number), 0x0126ae-0x0130bd (the working song), 0x0272be-0x0272bf (the pattern loaded last), 0x0723c0-0x0724bf (the 16 tracks' run state with their mutes, and the sequencer mode), 0x07fff0-0x07fff7 (moves while it plays) | 0x000000-0x00059b (the kit that plays and its copy), 0x01629c-0x01629f (the active global's number), 0x016ae3 (the pattern loaded last), 0x0e26e8-0x0e39b7 (the working song), 0x0ffd38-0x0fffff (its stack) |
| Set by following the DAW (never a save in a plug-in; a save in the standalone) | the global's tempo (+0xa4, two bytes) and TEMPO IN / CTRL IN (+0xad) | the global's TEMPO SYNC (+5) and TRANSPORT ACCEPT (+6); the MM keeps its tempo in no slot |
| Every other byte | in 256-byte "other" blocks, written when a save changes them | the same |

Flash, in 64 KiB sectors: the Machinedrum's sample sectors (from 0x200000; B-054: the OS never writes below), the
Monomachine's 2 MiB DigiPRO user flash. A storage of a sector is a save (below).

The "other" blocks were probed too (`MDMM_MEMORY_OTHER=1`: idle, tempo, track select, song mode, the active global,
the lock mode or POLY, mute CCs, play and stop, the editor reading the machine, a MIDI setting): the working state found
there is in the unwatched rows above; a MIDI setting changes its global, as a save.

What a kit save changes, measured: its slot, and the byte of the playing pattern that names its kit (the pattern is
stored in place). LOAD KIT changes that byte too: on both machines the pattern remembers its kit, as on the hardware.

## 2. When it is read

At the start of a session (a plug-in instance or the standalone), once the machine runs with its ROM (the Machinedrum
also with its factory flash known):

1. A DAW project's state came (the DAW's `setStateInformation`, a ROM-less project held and handed over): **the project
   wins**, the file is not read. A project state that comes later still replaces the memory (one more restart).
2. KEEP MEMORY off: the memory the session has (factory, or the standalone's own state).
3. Else the file's slots are laid over the memory the session has: factory memory for a plug-in, the standalone's own
   state for the standalone (Radek, 2026-10-12: one memory for everything, like a real machine). The result is
   restored the way a project is (`synthLib::Plugin::setState`, a cold boot); when it holds the slots already, nothing
   restarts. The standalone's unsaved working kit stays (it is in no slot).

The standalone's own state names the slots it holds that the file lacks (its "MMEM" chunk, version 2: a write failed,
or KEEP MEMORY was off): those keep the own state's bytes over the file's and are written at once. A DAW project's
"MMEM" chunk is never read: a project's mark drives no write (B).

A standalone state with no such chunk (from before I-024, or a 0.6 preview's version 1) (C): the file's slots win (the
file was written later, by this editor), but the standalone's own slots that differ are first written to
`machine-memory.standalone-kept.bin` beside the file (the same format) and the notice says so; every slot the file
lacks is seeded into the file from the state (and, MD, every sample sector that differs from the factory flash).

## 3. When it is written

**Only a real save writes the file** (Radek, 2026-10-12): a kit, pattern, song or global stored into a slot, from the
page or the machine's own keys. Knob moves, automation and unsaved edits of the kit that plays never write it; a DAW
project that plays with automation writes nothing.

How a save is seen: the editor watches **the stored slots, not the working buffers**, and not the commands. Hooking the
save paths would miss the machine's own keys (SAVE KIT on the panel, a global changed in its menus, a dump received),
which the firmware handles inside the emulation; the stored slots change on every one of them and on nothing else.
The machines store pattern edits in the pattern's slot as they are made (no SAVE PATTERN), so a step or lock entered
is a save. CCs from a DAW with live recording off change the working kit only.

- A background thread ("machine memory", never the audio thread) looks once a second: it copies the 1 MiB patch RAM
  (the Monomachine also its 2 MiB user flash) in 64 KiB pieces, the plug-in's lock taken for each and released between
  (each piece checks it is still the same machine), so the audio thread waits for one piece at most; the hash of the
  watched bytes is made after. A save under way while the pieces are taken can be seen half done (a slot across two
  pieces: the MD's patterns always are, any slot across a 64 KiB line), so **a slot is written only when its bytes
  were the same in the last two looks**; one that differs waits for the next look (while a pattern is recorded into
  live, until it holds still). The looks that write at once take the memory whole, in one hold of the plug-in's lock
  (about 0.1 ms, 0.3 ms with the MM's user flash): the last look at the close and before a memory is replaced (a
  project, the file's slots, factory memory), the base of a new memory. The host saving its state takes no look: it
  writes what the last two looks agree on, as the thread would (hosts autosave while they play, at 32 to 64 sample
  buffers, where one more hold of the plug-in's lock on that path could drop out). The MD's sample sectors, forced
  ones too, are copied twice and a sector that differs between the copies waits (one copy in one hold at the close). Test 3p changes a pattern's two ends between the pieces of every look for 12 s
  (with a write asked for at once and the 10 s busy limit passed): no torn pattern reaches the file, the settled one
  does, and the close writes it whole.
- When the watched memory differs from the last write and has been quiet for one look (10 s at the latest while it
  keeps changing), the slots that differ from the base (the memory at the start, or as last written) are merged into
  the file, holding the file's lock (below): read it, put those slots in, write it to a temporary file in the same folder, flush it to the disk
  (`FileOutputStream::flush`: fsync on POSIX, FlushFileBuffers on Windows) and rename it over the old one
  (`juce::TemporaryFile`). A crash leaves the old file or the new one. The base takes the written slots. A write that
  fails (no lock, no permission, disk full, a file it may not write over) is tried again every 5 s (not at every look;
  a new save waits for those 5 s too, test 3s) and at the close; its slots stay pending meanwhile.
- **Tempo** (Radek, 2026-10-12): the tempo persists as on the machine: a tempo change in the standalone is a save of
  its global. A plug-in in a DAW makes its machine follow the host's tempo and transport (`followHost`): there the
  bytes that following sets (table above) are never a save, and when the global is written for another change they go
  as the file has them (another instance, the standalone, may have saved a newer tempo since), or as the session
  started with them when the file has no global, so a DAW's tempo never reaches the file, also after a project opens
  (test 3q, both machines). A tempo ramp between two looks does not hold such a write back (the two-look check skips
  those bytes while following).
- A sample the page sends (Sampler, ROM-xx) is a save: when its transfer ends (the desk's `sampleLoad` "done") the
  watch waits until the flash has been still for a second after the store began (30 s at the latest), then the sample
  sectors that differ from the base are written. The flash is not watched otherwise (OS 1.63 writes it by itself while
  the factory patterns play). A sample another program sends by SDS is written with the next sample the page sends.
- **A new machine** (another hardware epoch or another device: a reboot, MIDI panic's restart, a ROM installed, the MD's
  factory flash prepared, a storage image): the base stays, so what differs from it is a save, written as one (E). Only
  a memory replaced on purpose (`machineMemoryWillBeReplaced`: a project's state, the file's slots at the start,
  factory memory) writes the saves of the memory before first and then takes the new memory as the base once it holds
  still for a look; opening a project therefore writes nothing until something is saved in it.
- **The file's lock** (`mdMachineMemoryLock.h`). Every read-merge-write, every move of the file, its deletion and the
  start's read hold it: an exclusive `flock` (POSIX) or `LockFileEx` (Windows) on `machine-memory.lock` beside the
  file. Both belong to the open file, not the process, so they hold between processes (a DAW and the standalone) and
  within one: two instances, and the VST3 and the AU of one editor in one host, which are two bundles with their own
  statics (a mutex per path in each bundle queues its own threads first). The bundle's mutex and the file lock
  together are waited for 2 s at most, so the message thread never waits longer; a write that did not get them is
  refused and tried again 5 s later. A lock file that cannot be opened for writing is opened read-only (a read-only
  folder: `flock` and `LockFileEx` work on it). A folder where the lock file cannot be made or opened, or a file system
  without locks (`ENOTSUP`, `ENOLCK`), gets no lock and no wait, said once on stderr: nothing can be written there, or
  there is nothing to wait for (the file is replaced whole by a rename, so a read needs no lock). Tests: 3m (two
  instances saving other slots again and again), 3r (a second handle in the same process, as the AU beside the VST3,
  then a second process: the save waits for each and is written once it lets go; the test fails if the process ends
  early).
- **A storage image** (Monomachine, Load storage image…) is decided to be what it is on the machine: the battery memory
  replaced. Its slots that differ from the base are saves and go to the file.

What closes each way a save could be lost, and its test (mdMachineMemoryFirmwareTest, both machines):

| Way | What the editor does | Session |
|---|---|---|
| A save just before the instance closes | the thread is told to stop and joined (never killed: it may hold the file or the plug-in's lock), then one last look under the lock writes the slots that differ from the base; a state save writes what the last two looks agree on (no look of its own: the audio thread) | 3d, 3e |
| A save, then the machine restarts at once | the base stays across the restart: the save is written after it | 3e |
| KEEP MEMORY off from the start, then on (A) | the base was kept while off; on: the slots that differ are merged, nothing else is touched | 3f |
| A write fails (read-only folder, disk full) | the old file stays; the note says why; the slots stay pending (the base keeps them out), tried again every 5 s and at the close, and named in the standalone's state, which wins over the stale file at its next start and writes them | 3i, 3s |
| A DAW project's mark (B) | never read | 3j |
| A standalone state from before the slot store (C) | the file wins, the own slots that differ are kept aside, the slots the file lacks are seeded | 3k |
| An old project, one kit saved (D) | only that kit's slot is merged | 3 |
| A storage image (E) | its changed slots are saves | 3l (MM) |
| Two instances saving other slots at the same time | the file's lock: every save of both is in the file | 3m |
| The start's slots refused by the machine at once | the file stays as it is, the notice says so, the memory there stays the base: a save that failed, then a restart, is still written | 3n |
| A save under way while a look is taken in pieces | a slot is written only when two looks agree, or from a look in one hold | 3p |
| MD: samples saved with another ROM, a sample saved with this one | the other ROM's sectors go to `machine-memory.samples-<fingerprint>.bin` (never over another) first and the notice says where; if that cannot be written, nothing is replaced | 3o (MD) |
| Start from factory memory (F) | the slots saved before it was asked for go only once the new machine runs on factory memory and the file's lock is had (the clear, or the next write in the same hold of the lock); a slot another editor saved since stays, so a newer save is never deleted; a newer editor's file is moved aside with a time stamp, not deleted; refused: the file stays | 4, 4b, 3n |
| Automation while a pattern plays | nothing is written (12.5 s of CCs on every track, the steps seen moving) | 1 |
| A kit, a pattern step and lock, a song, a global, a sample (MD) from the page | each reaches the file as its slot | 2 |

## 4. The controls

- **RESET MACHINE… > Start from factory memory…** (wave 6's question, its third choice; asked a second time): restarts
  the machine from factory memory (a fresh machine's state, as on a new install); the file's slots saved before it are
  deleted only once the machine runs on it (the watch's next base), after the saves made before were written; a slot
  another editor saved after it stays (the file goes when nothing is left). Nothing is changed when the
  fresh machine has no ROM or the machine refuses the state (the file stays, the note says so); when the file cannot
  be deleted, an empty store replaces it. One place, no
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
| Damaged (size or CRC wrong, an entry cut short or twice), not ours, the previews' version 1 | its slots are not used; the file is renamed `machine-memory.unusable-<date-time>.bin` (never deleted, never over another) and the plug-in says so in a notice; the next save writes a new file (5, 5b) |
| An entry this editor cannot use | that entry is skipped (kept and written back), the rest is used |
| A newer major version, another layout, the other machine's | kept as it is and never written over: the notice says so and every save is refused (its slots stay pending) until the person moves the file or uses that editor (5c) |
| The machine refuses the slots laid over (a restore that fails) | the file stays as it is; the notice says why; the session goes on with the memory it has |
| MD: the samples were saved with another ROM | the sectors are not laid over; the other slots are; when a sample is saved with this ROM the old sectors are kept in their own file first (3o) |
| No ROM | nothing is read until a ROM is installed; then as at a start |
| Two instances of one machine | each merges its own saves under the file's lock (section 3), so none is lost; for one slot the last save wins (the guide says so) |
| Write fails (disk full, no permission) | the old file stays; the note says why; the slots stay pending (section 3) |

## 6. Cost (measured 2026-10-12, M4 Pro, mdMachineMemoryFirmwareTest at 10 looks a second, both machines at once)

| | Machinedrum (OS 1.63) | Monomachine (OS 1.32B) |
|---|---|---|
| A look: the plug-in's lock held, the longest piece (the audio thread can wait this long) | 0.03 ms typical, 0.11 ms worst | 0.002 ms typical, 0.43 ms worst (both under the test's load: two machines at once) |
| A look with its hash, on the thread | about 2.4 ms | about 4.8 ms |
| A write: read the file, merge the slots, temporary file, fsync, rename | 0.6 to 1.4 ms; one kit and the playing pattern's kit byte: a 6 KiB file | 0.5 to 0.8 ms; 7 KiB |
| MD: the sample flash copied: at a new base (a project, the file's slots, factory memory) in one hold, 6 MiB; after a sample store twice, one 64 KiB sector a hold | the one hold at a new base 0.15 to 0.30 ms (two runs, the longest hold of the session); a sector 0.001 to 0.012 ms | (none: the user flash is in every look) |
| Writes while idle or playing (12 s of play, automation on every track) | none | none |

The first look allocates its buffers before it takes the lock; later looks copy into them. The file grows with what is
saved: a kit is about 1 KiB, an MD pattern about 4.4 KiB, an MM pattern 6.4 KiB, an MD sample sector 64 KiB.

## 7. Decided (Radek, 2026-10-12)

- The standalone starts from the file too (above, section 2).
- Start from factory memory is a choice of RESET MACHINE… (section 4); the engine menu keeps KEEP MEMORY only.
- Only a real save writes the file: a kit, pattern, song or global stored into a slot (section 3).
- The file is a store of saved slots, merged on each save ("Why slots").
- Tempo: saved as on the machine, but never a tempo the DAW sets (section 3).
- Decided by the editor, for Radek to confirm: a storage image counts as saves;
  an old standalone state loses its differing slots to the file but keeps them aside; samples of another ROM are kept
  in their own file.
