# Rich Hickey review before 1.0 (2026-10-15)

Scope: our code only (source/elektron/md/*, scripts/, .github/workflows/mdmm-*.yml). Not dsp56300, mc68k, JUCE, RmlUi.
Five read-only reviews ran side by side. Each finding has file:line evidence in its detail report:
[1 simplicity](review-1.0-2026-10-15/1-simplicity.md), [2 data and state](review-1.0-2026-10-15/2-data-state.md),
[3 architecture](review-1.0-2026-10-15/3-architecture.md), [4 security](review-1.0-2026-10-15/4-security.md),
[5 performance](review-1.0-2026-10-15/5-performance.md). The top findings were checked again against the code.

## Scorecard

| Dimension | Rating |
|---|---|
| Simplicity | MOSTLY SIMPLE |
| Data orientation | MOSTLY DATA |
| Architecture | MODERATE |
| Security | no critical or high; 3 medium |
| Performance | no must-fix in the audio path; 5 should-fix |

The core (elektronData, deskCore, the desk, command tables, engine records) is clean. The complexity sits at the edge:
the plug-in processor, the MM page, the two emulator links and adapters, and the build and test tooling.

## The one theme: 1.0 freezes formats

Most code findings can wait until after 1.0. The formats cannot. Once 1.0 builds are in the field, every format they
read is a promise. Today several of them refuse anything newer, so a 1.1 file would break a 1.0 user. These must be
fixed before the tag:

1. **Update manifest accepts only schema 1** (mdmmUpdate/updateCore.cpp:211). A schema 2 feed makes every 1.0 build go
   silent. Fix: accept schema >= 1 and read only known fields, or write down "schema 1 is append-only forever".
   **Done (fix/1.0-ci-release):** the reader accepts schema 1 or newer and reads only the fields it knows.
2. **Project setup is all-or-nothing and needs an exact version** (mdDesk/mdDeskSetup.cpp:36-38, deskCore/deskMod.cpp,
   mdDesk/mdDesk.cpp:425). A 1.1 project with one new member loses every modulator, knob CC and solo in 1.0, with no
   message. A rejected setup also keeps the previous project's setup. Fix: one shared setup codec that ignores unknown
   members, drops only the bad item, falls back to the default, and reports errors.
3. **MM setup has no wrapper** (mmDesk/mmDesk.cpp:82-88). Add `mm-desk/setup` now, so 1.0 projects are born in the
   final shape. The reader still accepts the old bare shape.
4. **Machine memory file needs version exactly 2** (mdJucePlugin/mdMachineMemory.h:511, 534, 551). Fix: entries carry
   their size, unknown kinds are skipped and kept, major/minor version, slot-by-slot layout check.
5. **Chunk version rule** (baseLib/binarystream.h:658 skips a newer chunk whole). Write down: bump a chunk version only
   for a breaking change; additions go inside the payload or into a new chunk.

Do 1 to 5 as one short hammock: "what 1.0 promises to read forever", then the codecs.

## Before 1.0 (should-fix)

**Security and release**
- The update key is still the placeholder (mdmmUpdate/updateKey.h:14). In-app install is off. **Not done: no
  auto-update (Radek, 2026-10-15).** No key is set and the install code is untouched; the update check stays.
- Packages are unsigned and no checksums are published. Publish SHA256SUMS with each release (**done**: the release workflow's `checksums` job); sign and notarise when
  the Apple account exists (the workflow already supports it).
- Pin third-party actions by SHA (sccache-action, msvc-dev-cmd) and pin wrangler in the site release; it holds the
  Cloudflare token. **Done:** all actions by SHA, wrangler@4.149.0, site workflow's write permissions per job.
- Before installs go on: stage updates in a private 0700 temp dir, not a fixed shared path (mdUpdater.cpp:82-86, 560-585).
  **Not done: no auto-update (Radek, 2026-10-15).**

**Real-time and performance**
- The audio thread takes the device mutex (synthLib/plugin.cpp:111-122) that 57 other call sites also take, some on
  the 8 ms desk step and the flash-copy thread. Measure lock wait in `scripts/mdmm-rt-check.sh`; move editor actions
  onto a queue.
- No watchdog: `while(schedStep())` (mdLib/mdhardware.cpp:1838) under the lock can freeze the whole DAW on a stuck
  machine (the known corrupted-flash hang is not fixed). Add an iteration budget that goes silent and marks the device
  bad.
- Hardware MIDI depends on the host's audio callback: `ExternalMidi::takeIn` locks and can allocate on the audio thread,
  and output stalls when the host suspends processing.
- Page re-renders in full during GEN/MUTATE drag, wheel, rotate and tempo drag: add `gv`, `wheel`, `rotate`, `bpm` to
  `HOLDS` (skins/mdStudio/mdDeskRender.js:25); check MM for the same gap.
- Desk timer runs at 125 Hz per instance with the editor closed (mdDeskSession.cpp:184). Slow it to 50-100 ms when no
  page is attached.
- Re-measure overruns at 64/128/256 frames after the speed-ups. Default latency is 0 blocks; changing it changes
  reported latency (Radek's decision).

**Build and CI**
- Core CI on push to main skips the core's own tests (deskCoreTest, mdDeskTest, mmDeskTest, elektronDataTest,
  mdPageBridgeTest, mdmmUpdateTest, page tests). One-line fix: `ctest -L UnitTest` in mdmm-core.yml. **Done (fix/1.0-ci-release):** by label, `scripts/mdmm-ci-unit-targets.py`.

**Simplicity (reduces what 1.0 must support)**
- Delete the dead panel editor: `mdEditor.cpp` (2,093 lines), the `mdDefault`/`mmSfx60` skins and the panel-feel
  settings. `createEditorPage` always returns `PageEditor` (mdEditorPages.cpp:92). It also holds 11 of the 57 lock sites.
- Move the MM page source out of `doc/modern-ux/mm-mockup/src` into `skins/mmStudio/`, start `S` empty, and keep the
  demo out of the shipped page.
- Extract the machine-memory service (about 1,000 lines, its own thread, about 20 atomics) out of
  mdPluginProcessor.cpp (2,323 lines).
- `DeskHost` re-parses the project byte format by hand (mdDeskHost.cpp:41-190) and loses MIDI-learn (`MDLN`) changes
  made while a project is held. Use one codec that reads a project into a value.

## After 1.0

- MM page: gestures write the document `S` in place and work out intents from diffs; the 2026-10-02 review's
  "written only by show" claim does not hold. Move it to the MD model (view + overlay).
- One `EmulatorLink`, one `packLcd`, shared `trackParts::apply`, `applyEdit`, `Lease` and `StatusPoll` in deskCore:
  MD and MM duplicates are already drifting.
- MM global-slot choice as one value with a pure step (6 members, 26 touch sites, sentinels -1/-1e9/-1e18).
- One kit memory image in the MD adapter, not two (`m_working` and `m_memoryKit`).
- Engine timing as one derived value, not 42 `m_profile` checks.
- `withReadyMachine(fn)` instead of 48 `dynamic_cast<md::Device*>` with their own readiness checks.
- CMake: stop editing targets from outside their folder (mdmmEditors.cmake, mdmmPlugins.cmake); move `mdautomation`
  out of mdLib; a `deskSyx` library for `mdSyxWork`/`mdSyxSession`.
- One source for test selection (now in 5 places: mdmm-affected.tsv, workflow regexes, build_mdmm.sh, path filters,
  CMake labels). One stage table for mdmm-local-gate.sh (1,159 lines, stage ids like `2b`, `7d`).
- Page prefs in localStorage: move to a `prefs` document in the plug-in config.
- Save the engine id in the project (HW MIDI).
- Feature data: stop storing `journeys`, clean `plan`, add schema/version.
- Low security items: size caps on .syx/WAV and MM RLE output, Linux /tmp page files O_EXCL 0600, curl size poll.

## What is done well

- Layering matches FOUNDATION.md: no back-edges between the pure libraries, no JUCE in them.
- Engines are data (`EngineRecord` + `DevicePort`); nothing branches on an engine id.
- The desk runs on one thread and is fed only in `step()`. Edits coalesce, dedupe and use bounded queues.
- Document state is whole values (`DocState{observed, pending}`); history is before/after values; tables generate schema.
- The durable form of a document is the firmware's own bytes.
- `getState` appends with `insert`. Chunks carry versions; plug-in identity is pinned and checked.
- Page-to-native bridge is tight: no remote content, the page never names a path, commands are table-checked.
- SysEx and dump parsers, WAV/AIFF chunk parsers and state restore check their lengths.
- No secrets in the tree or history. No `pull_request_target`, no event-text injection in workflows.
- PGO profile current; no `std::isfinite` left; diagnostics excluded from release builds.

---
*"Simplicity is a prerequisite for reliability." — Rich Hickey*
