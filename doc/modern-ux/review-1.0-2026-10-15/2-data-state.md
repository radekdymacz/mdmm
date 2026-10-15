# Data and state review (Hickey lens), before 1.0

Reviewer: Data & State Architect. Read-only. Scope: `source/elektron/md/*` and `doc/features/*.json`, at
`2c59fdb95` (branch codex/native-audio-engine). Paths relative to `source/elektron/md/` unless they start with
`doc/` or `source/`. Findings fixed by the 2026-10-02 review are not repeated.

## Rating: MOSTLY DATA

The core is data-driven and epochal: `DocState{observed, pending}` of whole document values, history as
before/after values, `KindSpec` and command tables that generate the schema, effects at the engine edge. The
strongest data decision is easy to miss: **the durable form of every document is the firmware's own bytes**
(patch RAM, flash, `.syx`); the JSON documents live only on the page wire, which ships inside the same binary,
so exact JSON versions there cost nothing. `getState` follows the append rule everywhere I checked
(`mdLib/mdstatecapture.cpp:41`, `mdLib/mdstate.cpp:329-343, 394-412`: `insert`/`push_back`, never `assign`).

What keeps it from DATA-DRIVEN: the formats that **outlive a session** (the project's setup chunk, the machine
memory file, chunk versions) are closed to accretion just as 1.0 is about to freeze them; the MM page still edits
a place and reconstructs intents from diffs; and a few facts have two homes inside one process.

## Findings, best first

### 1. The project's setup is all-or-nothing, exact-version, and a rejection keeps the previous project's setup (must-fix)

Evidence:
- `mdDesk/mdDeskSetup.cpp:36-38` requires `version == 1`; `:63-65` returns nothing if *any* error was found.
- `deskCore/deskMod.cpp:53-55` (modulators: `version == 1`), closed enums `kind` lfo/random `:74-77`, `rate`
  `:82-88`, `curve` `:114-120`, and `:128-129` drops the whole modulator set on one bad field.
- `mdDesk/mdDesk.cpp:421-427`: `if(!s) return errors;` leaves `m_setup` (the *previous* project's knob CCs,
  modulators, solo) in place.
- `mmDesk/mmDesk.cpp:112-125`: on a rejected modulator set the old modulators stay but solo is reset: a third,
  inconsistent outcome.
- `mdJucePlugin/mdDeskSession.h:505-510` (`loadSetup`) discards the returned errors: nothing tells the person.

Principle: accretion (a reader ignores what it does not know and accepts a newer minor version); identity (a
project's setup must never be another project's).

Impact: a 1.1 project with a new LFO shape, rate or a new setup member, opened in 1.0, silently loses every
modulator, the knob CCs and the solo; in a host that loads a second project into the same instance, the first
project's setup survives and is then saved into the second.

Fix: in one deskCore codec for both machines: `version` is a major number (accept `<=` known major, ignore unknown
members); validate per item and drop only the bad item (with a path in the errors); unknown enum values fall back
to the default for that item; a rejected or absent setup becomes the default, never the previous one; route
errors to the notice sink. Add a fixture test: a "future" setup with extra members and an unknown rate loads the
rest.

### 2. The MM keeps its project setup as the modulators document with a foreign member (should-fix, cheap now)

Evidence: `mmDesk/mmDesk.cpp:82-88` writes `modSetupToJson(...)` (schema `mm-desk/modulators`) and bolts `solo`
onto it; `mdDesk/mdDeskSetup.cpp:69-82` writes an envelope `md-desk/setup {modulators, knobCcs, solo}`.

Principle: one shape per concept; spec over ad hoc nesting. The MM's next setup member (knob CCs, as the MD has)
will need a migration of every saved MM project, and the modulators schema now carries a member it does not own.

Fix: `mm-desk/setup {schema, version, modulators, solo}` with the reader also accepting the bare
`mm-desk/modulators` shape of 0.x projects; both machines through one `deskCore` setup codec parameterised by
`ModLimits` and track count. Do it before 1.0 so 1.0 projects are born in the final shape.

### 3. The MM page still edits a place and reconstructs intents from diffs (should-fix)

Evidence:
- Gestures mutate `S` directly, then send: `skins/mmStudio/mmMockup.js:3591` (`clearPattern`: `tr.steps=...`,
  `S.locks.clear()`, then `edit("clearPattern")`), `:3592`, `:3643-3644` (pattern doubling), `:3880`
  (`S.tracks[t].v[pg][i]=v`), about 32 such write sites.
- `:3090-3092`: `editParams(before)` / `editTrack(t, f)` snapshot `S`, run the mutation, and diff to find which
  `param` intents to send: the intent is inferred from a place, not stated.
- `:6189-6195`: `show(v)` compares the new view with the *last shown view* (`SHOWN`), not with `S`; so a gesture's
  write that no document confirms survives until someone calls `show(v, true)`. That is patched case by case:
  `mmAdapter.js:102-105` (refusal with an overlay entry), `:226` + `:441` (`unsent`).
- The 2026-10-02 status (item 2) says S's document members are "written only by `MMView.show` (checked)". They
  are not: the overlay (`Overlay.add(..., MmView.writes(...))`, `mmAdapter.js:240`) and the direct gesture writes
  are two optimistic mechanisms side by side.

Principle: values over places; one writer per identity. The MD page shows the target: `Docs` written only by the
message handler (`mdStudio/mdDeskRender.js:55-86`), view derived, overlays keyed to command ids.

Fix: gestures compute an intent from the current view value (`MmView`), send it, and let the overlay show it; `S`
keeps UI-only members. As a first step, make `show` diff against `S` (or always `all` after a gesture), and extend
the seam check to fail on any gesture write to `tracks`, `midi`, `locks`, `len`, `song`.

### 4. `DeskHost` re-implements the project's byte format to keep a held project (should-fix)

Evidence: `mdJucePlugin/mdDeskHost.cpp:41-190`: its own parser of pluginLib's frame (`"DSP56300"` magic, versions
1/2, `g_chunkHeadSize = 12`, length read with `memcpy` "BinaryStream's own byte order"), its own readers and writers
of the `AUTO` and `MDSK` chunks (duplicating `mdPluginProcessor.cpp:243-272` and `mdDeskHost.cpp:277-292`), and
`heldState` (`:229-257`) refreshes only `AUTO` and `MDSK`; a MIDI-learn (`MDLN`) or other chunk changed while the
project is held is dropped.

Principle: one spec, one codec; data over bytes-with-offsets. A second reader of a closed binary format drifts the
first time pluginLib changes its frame.

Fix: a pluginLib function pair `parseProject(bytes) -> {header, chunks: [{fourCC, version, bytes}]}` and
`writeProject(value)`; hold the project as that value; on save, replace the chunks the plug-in's own writers
produce (all of them, not two).

### 5. The machine memory file is closed to the next version (should-fix before 1.0)

Evidence: `mdJucePlugin/mdMachineMemory.h:511-513` any `version != 2` is `Problem::Version` (whole file unused);
`:551-557` an entry kind outside Kit..Sector is `Corrupt`; `:534-536` one hash of the whole slot table
(`layoutId`, `:286-300`) refuses the file if any slot in the editor's table changed.

Principle: accretion. This file is the person's "battery-backed memory" across every session and both formats
(standalone and plug-in); after 1.0 a downgrade, or a 1.1 that adds one entry kind, makes the whole store unusable
(it is moved aside, not lost, but not used).

Fix: write the rule into the format now: entries are self-sized; unknown kinds are skipped on read and kept on
rewrite; split `version` into major (incompatible) and minor (accretive); compare layout per slot (key and size)
and drop only the slots that differ.

### 6. Chunk versions drop the whole chunk in an older editor (should-fix, a rule)

Evidence: `source/baseLib/binarystream.h:658`: a chunk whose version is above the reader's is skipped. Our chunks:
`MMEM` v2, `RAMF` v1, `AUTO` v1 (`mdJucePlugin/mdPluginProcessor.cpp:249-271`), `MDSK` v1 (`mdDeskHost.cpp:281`).

Principle: accretion; the version is a promise to old readers.

Fix: write in doc/modern-ux/data-contract.md (or the project format section): a chunk's version is bumped only for
an incompatible change; additions go inside the payload (MDSK is JSON already, so finding 1 is the place); new
facts get new chunks.

### 7. Two images of the kit in memory inside the MD adapter (should-fix)

Evidence: `mdDesk/mdDeskMachine.h:293` `WorkingCopy<MdKit> m_working` (seed, memory image, expectations) and
`:330-336` `std::optional<MdKit> m_memoryKit`, a second decoded image of the same memory region added for B-134
because the working copy's image is dropped at a desk reset; written `mdDeskMachine.cpp:1887`, read `:2058`.

Principle: one fact, one home; the bug fix grew a cache instead of correcting the first one's lifetime.

Fix: one `MemoryImage {position, kit}` value owned by the adapter (it is the machine's memory, so it survives a desk
reset); `WorkingCopy` reads it instead of keeping its own; a reset clears expectations and the seed, not the image.

### 8. The MM adapter encodes selection as a hidden state machine of sentinels (later)

Evidence: `mmDesk/mmDeskMachine.h:299-305, 287`: the active global alone is `m_curGlobal`, `m_activateGlobal`,
`m_chooseGlobal`, `m_chosenGlobal`, `m_chosenSentMs`, `m_reactivateGlobal` (26 touch sites in `mmDesk/*.cpp`);
61 members and 19 `-1`/`-1e9` sentinels in the header (MD: 40 and 17).

Principle: state as named values with pure steps (as `mmDeskWatch.h` already does); `-1` as "unknown" hides the
states.

Fix: a `GlobalSelection` value (`{machine, wanted, phase: Idle | WaitRecvExit | Sent{atMs} | Reactivate}`) with
`step(state, event, now) -> {state, effects}`; the same for the current slots (`std::optional`, not `-1`).

### 9. Machine-memory facts are scattered over about 18 processor members (later)

Evidence: `mdJucePlugin/mdPluginProcessor.h:253-278`: `m_projectStateSeen`, `m_ownStateSeen`, `m_standaloneState`,
`m_loadedMark`, `m_memoryStartDone`, two generations, `m_memoryKeep`, several warning flags, each its own atomic or
guarded by a different lock; `mdPluginProcessor.cpp:1705-1710, 1775` assembles `StartFacts` from separate loads.
The decisions are pure (`machineMemory::startOf`), but their inputs are not one value.

Principle: an identity (the session's memory origin) should have one state value, read as a snapshot.

Fix: `struct MemorySession {Origin origin (Factory, Project, StandaloneOwn, StandaloneOld); std::optional<Mark>
mark; bool startDone; ...}` under `m_memoryMutex`; atomics only to wake the thread.

### 10. Page preferences live in the WebView's own storage (later)

Evidence: `skins/mdStudio/mdDeskTop.js:357-358` (`mddesk.plate`), `skins/shared/deskTransport.js:19, 45-46`
(`desk.tempoDelayed`, not per editor), `skins/shared/deskWhat.js:29-34`, `skins/mmStudio/mmMockup.js:3455-3456`
(`mmeditor.roll`), `:6129-6133` (`mmeditor.plate`).

Principle: one store per kind of fact. The editor's settings are in its config XML, the project's in `MDSK`; these
preferences are a third, invisible store: lost when WebView data is reset, possibly different per host or per
WebView2 user-data folder, never in a backup, and the keys are inconsistent.

Fix: a `prefs` document the plug-in owns (config XML), sent with `ready`, changed by one command.

### 11. Which machine a project is about is not recorded (later; HW MIDI is beta)

Evidence: `mdJucePlugin/mdDeskSession.h:627` a session always starts on `m_engines.front()` (the emulator);
`:540-566` the engine switch is not saved; the project's state is always the emulator's memory
(`mdPluginProcessor.cpp:211-213`). With HW MIDI the edits went to the real machine, and the project saves an
unrelated emulator memory without saying so.

Principle: identity: a saved state should say what it is the state of.

Fix: record the engine id in the setup; on load with a recorded HW engine, tell the person the project holds the
emulator's memory, not the hardware's.

### 12. Feature data carries a dead field, a copied field and a stale axis (later)

Evidence: `doc/features/md.json`, `mm.json`: every one of 730 rows stores `"journeys": []` while
`doc/features/README.md` says the field is "Not stored. Derived"; `missing` equals `notes` on all 13 MD rows that
have it; `plan: "0.6"` remains on 49 rows that are all `done`; no `schema`/`version` member.

Principle: data says one thing once; derived values are not stored.

Fix: drop `journeys` from the stored rows (the index derives it), derive or drop `missing`, clear `plan` on done
rows (or rename to `shippedIn`), add `{"schema": "mdmm/features", "version": 1}`, and let
`scripts/mdmm-features-check.mjs` enforce it.

## Done well

- Firmware bytes are the one durable form; JSON documents are a wire projection, so the page contract can change
  with the binary.
- `getState` appends (`mdstatecapture.cpp:41`); a pending restore is re-emitted as the requested value, not
  recaptured from a half-restored machine (`:39-43`).
- `MMEM` version 1 is read as "a state from before I-024" (`mdPluginProcessor.cpp:286-289`): an old chunk accretes.
- The machine-memory decisions (`startOf`, `conflicts`, `merge`, `encode/decode`) are pure, measured and documented
  as a data contract (doc/modern-ux/DESIGN-machine-memory.md).
- The MD page has one writer of `Docs` (the message handler) and a derived view with id-keyed overlays.

## Recommended order for 1.0

1. Findings 1, 2, 5 and 6 together: one short hammock on "what 1.0 promises to read forever" (setup, memory file,
   chunks), then the codecs. These are the only ones that get harder after 1.0 ships.
2. Finding 4 (one project codec) and 7 (one memory image).
3. After 1.0: 3, 8, 9, 10, 11, 12.
