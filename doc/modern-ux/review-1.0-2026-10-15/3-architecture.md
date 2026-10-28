# Architecture review (Hickey lens), MD + MM Editors, before 1.0

Reviewer: System Architecture. Read-only. Branch `codex/native-audio-engine` at f75cf8980 (2026-10-15).
Scope: `source/elektron/md/*`, their CMake graph, `scripts/mdmm-*`, `.github/workflows/mdmm-*.yml`.
Paths are relative to `source/elektron/md/` unless they start with `scripts/`, `.github/` or `source/`.
Builds on DESIGN-REVIEW-2026-10-02.md (whose 16 findings are mostly fixed); nothing from it is repeated.

## Rating: MODERATE

The core, from `elektronData` up to `mdDesk`/`mmDesk`, is **well decoupled**. It has no JUCE, every layer is
tested without the layers above it, and the tables generate the schema. The engine edge is a `DevicePort`
record of functions plus one `EngineRecord`, which is polymorphism through data. The page bridge is isolated.
What pulls the rating down is the plug-in edge and the tooling:

- one blocking mutex is shared between the audio thread and four other threads;
- the processor is a god object;
- a dead UI is still compiled into the product;
- the CMake still does upstream-era surgery on targets after they are made;
- which tests run for what is written down by hand in five places, and push-to-main CI skips the core's own tests.

## Findings, most important first

### 1. The audio thread and every other thread share one blocking device mutex (should-fix; must be measured for the F2 gate)

Evidence:
- `source/synthLib/plugin.cpp:111-122`: `Plugin::process` (the audio thread) takes `m_lock`, a
  `std::recursive_mutex` (`plugin.h:116`), with a blocking `lock()`.
- The same lock is taken through `withDeviceLocked` (`plugin.h:79-81`) from non-RT threads at **57 call sites** in our code:
  - `mdPluginProcessor.cpp` (27 sites): the machine-memory thread copies flash in 64 KiB chunks under it
    (`copyMachineFlash`, around lines 1944-1975), and the processor times how long it holds it (`flashHoldMaxMs`).
  - `mdStudioLink.cpp` (9) and `mmStudioLink.cpp` (6), from the desk's 8 ms message-thread step:
    - `probe()` every 96 ms (`mdSessionMd.cpp:78`);
    - `readSampleBank` every 250 ms;
    - `pressKey`, `turnKnob`, `sendPanel`, `audition`, `auditionStatus`.
  - `mdEditor.cpp` (11), `mdDeskHost.cpp` (2), `mdController.cpp` (1).

Principle: conveyance. Use queues, not shared places with locks, across a real-time boundary. Holding times are
short and are measured (`recordSynthProcessLockWait`), but a non-RT thread can be preempted while it holds the lock,
and then the audio thread waits for the scheduler. This is priority inversion. The F2 gate asks for "no drop-out while
editing, saving, reopening the window", which is exactly when these sites fire.

Path:
1. Every editor-to-device action (panel keys, knob turns, audition, sample sends) becomes a value pushed onto a
   single-producer single-consumer command ring. The device drains the ring at block start, the same way MIDI already
   arrives (`m_midiInRingBuffer`).
2. Every device-to-editor fact (probe state, audition status, sample-bank sequence) is published by the audio thread
   as an atomic snapshot, the way telemetry and the LCD already are (`readTelemetry` is lock-free).
3. The memory copy keeps its chunking, but takes the lock with `try_lock` and retries, so the audio thread never waits.
4. Add the lock-wait maximum to `scripts/mdmm-rt-check.sh` as a pass/fail line of the F2 gate.

### 2. Push-to-main CI does not run the core's tests, and test selection is written down by hand in five places (should-fix)

Evidence:
- `.github/workflows/mdmm-core.yml:84-87`: on a push to main only the `release` mode runs. Its steps build and run
  fixed lists (lines 122-208, e.g. `--tests-regex '^(baseLibBinaryStreamTest|...|mdFlashTest)$'`).
- None of these lists contains `deskCoreTest`, `mdDeskTest`, `mmDeskTest`, `elektronDataTest`, `deskWireTest`,
  `mdPageBridgeTest`, `mdmmUpdateTest` or the `Page`-labelled node tests. They all carry `LABELS "UnitTest"`
  (`deskCore/CMakeLists.txt:46`, `mdDesk/CMakeLists.txt:49`, ...).
- The architecture's heart therefore reaches CI only through the nightly run (`mdmm-nightly.yml` starts
  `mdmm-editors.yml`, whose Linux job runs all of ctest). This contradicts DEV-CYCLE's "push to main: ROM-free CI"
  promise in spirit.

The knowledge of "what tests what" lives in five places:
1. `scripts/mdmm-affected.tsv`: 98 rows, first match wins, mapping path to ctest regex, firmware regex, journey globs
   and gate stage ids;
2. the regex and target lists in `mdmm-core.yml`;
3. the ctest regexes in `scripts/macos/build_mdmm.sh:239-259`;
4. the `paths:` filters, repeated in full for `pull_request` and `push` in `mdmm-core.yml:4-64`, and again in
   `mdmm-editors.yml:31-64`;
5. the CMake labels.

The dependency graph is already in CMake (`target_link_libraries`). The tsv re-types it and drifts already:
- the `deskCore/*` row does not run `mdDataLinkTest`;
- `elektronData/*` does not run `mdDataLinkTest` either, although mdDataLink links elektronData;
- `.github/*` runs nothing (`mdmm-affected.tsv:96`).

Principle: one source of truth. Information should be derived, not restated.

Path:
1. Core CI runs `ctest -L UnitTest` (plus `-L Page` where node exists). This is a one-line change and closes the gap now.
2. Label each test with the libraries it links (a small CMake function wrapped around `add_test`).
3. Let `mdmm-check.py` choose tests by `ctest -L <library>` from the changed folder's target. Keep the tsv only for
   the non-CMake columns (journeys, goldens, gate stages).
4. Put the path filters in one YAML anchor, or drop them for a `dorny/paths-filter`-style job that reads one list.

### 3. The update manifest cannot grow: every installed build refuses schema 2 (must-fix before 1.0; cheap now, impossible later)

Evidence:
- `mdmmUpdate/updateCore.cpp:210-212`: `if(!schema || ... || schema->asNumber() != 1) return fail("schema is not 1");`.
- A single URL, `g_manifestUrl = "https://mdmm.dev/latest.json"` (`updateCore.h:43`).
- `updateKey.h:13` is still the placeholder, so no build installs anything. Every build only opens the download page.

Principle: accretion. Readers ignore what they do not know; a breaking change gets a new name. The page contract
already follows this (open documents, `contract` version). The updater, which is the one channel that must outlive
every shipped binary, does not. Once 1.0 is in users' hands, a manifest with `schema: 2`, or any change to a field
1.0 requires, silently turns 1.0's update check into "error". 1.0 users would then never hear of 1.1.

Path, before the 1.0 tag:
1. Accept `schema >= 1` and read only the members 1.0 knows. Leave the required set as it is.
2. Write the rule into DESIGN-updates.md: "latest.json schema 1 is append-only forever; a breaking change is
   published at a new URL (`latest-v2.json`) beside it".
3. Decide whether 1.0 ships with the real public key. Without it, 1.0 can never self-install a later version,
   because the key is compiled in.

The signed message is already versioned (`mdmm-update-v1`), which is good.

### 4. `AudioPluginAudioProcessor` is a god object; machine memory is a subsystem hidden inside it (should-fix)

Evidence:
- `mdJucePlugin/mdPluginProcessor.cpp` is 2,323 lines.
- About 1,000 of them (from `startMachineMemoryThread` at :1311 to `flushMachineMemory` at :2273) are the machine-memory
  file: its own thread (:195-208), its watch, notices, sample sectors, flush modes and restore generations.
- The header carries about 20 atomics and 3 mutexes for that subsystem alone (`mdPluginProcessor.h:229-275`:
  `m_memoryKeep`, `m_memoryLookMs`, `m_memoryWriteFailed`, `m_memoryNoticePending`, ...).
- The same class also does: boot diagnostics, speed-up levers (:1202-1310), RAM recording mode, exact-ESSI timing,
  CPU and output meters, factory initialisation, and the state chunks (MMEM, RAMF, AUTO, plus the desk's).

Principle: one concern per place. State is braided with identity: the memory thread reaches back into the processor
(`m_processor.lookAtMachineMemory()`), and the processor's `setStateInformation` reaches into the memory subsystem
(`machineMemoryWillBeReplaced`).

Path: a `MachineMemoryService` with its own thread and atomics, built over a narrow port:
- `copyFlash(range) -> bool`;
- `epoch()`;
- `notice(text)`;
- the save and restore events as values.

The processor keeps one member and forwards three events to it. The pure part (`mdMachineMemory.h`) already exists,
so this is a move of code, not a redesign. Do the same, more lightly, for the speed-up and diagnostics toggles: one
`EmulationOptions` value applied in one place.

### 5. A dead UI is still compiled into the product (should-fix)

Evidence:
- `mdJucePlugin/CMakeLists.txt:18-30` compiles all of these into both plug-ins:
  - `mdEditor.cpp` (2,093 lines, the RmlUi panel editor `md::Editor`);
  - `mdPixelPerfectPanel.cpp`;
  - `mdLcdInteractionModel.cpp`;
  - `mdSettingsPanelFeel.cpp`.
- `mdEditorPages.cpp:83-92`: `createEditorPage` always returns `PageEditor`, and nothing constructs `md::Editor`.
  Its only users are `mdLcdEditorPointerTest.cpp` and `mdSettingsPanelFeel.cpp`.
- The upstream skins are filtered out afterwards with `list(FILTER SOURCES EXCLUDE REGEX "^skins/(mdDefault|mmSfx60)/")`
  (`mdmmPlugins.cmake:35`).
- `mdEditor.cpp` alone holds 11 of the 57 device-lock sites from finding 1.

Principle: reduce what is there. Code nobody runs still costs build time, review time, binary size, and lock sites
somebody must reason about.

Path: delete `md::Editor`, the panel-feel settings and the two upstream skins, or move them into a test-only static
library if the LCD-pointer test is still wanted. Then the `list(FILTER ...)` line goes too. The tag
`pre-cleanup-0.5` pattern already exists for history.

### 6. The CMake still performs upstream-era surgery on targets after they are made (should-fix)

Evidence:
- `mdmmEditors.cmake:26-29` reads `mdLib`'s `SOURCES`, removes `mdautomation.*` and writes the list back. Lines 34-43
  then append editor sources to `mdLib` and add `target_link_libraries(mdLib PUBLIC elektronData mdAutomation)`.
- `mdmmEditors.cmake:80-94` rewrites `juce_plugin_modules`' `COMPILE_DEFINITIONS` to swap `JUCE_WEB_BROWSER`.
- `mdmmPlugins.cmake` (814 lines) runs at the end of the directory through `cmake_language(DEFER CALL
  mdmm_plugin_targets)` (:814). It strips JUCE's version definitions from the plug-in targets and fails unless it
  finds exactly six (:306-321). It also re-sets `PROJECT_VERSION` variables for three prefixes (:14-20).
- The stated reason (`mdmmEditors.cmake:3-5`, "upstream's CMakeLists carry one include line each, so a merge from
  upstream meets no lines of ours") ended with 0.5: there are no upstream merges any more (CLAUDE.md, ROADMAP D3-D5).

Principle: no action at a distance. Reading `mdLib/CMakeLists.txt` no longer tells you what `mdLib` is.

Path:
1. Write the final source list and links into `mdLib/CMakeLists.txt`.
2. Move `mdautomation.*` into its own folder (`mdAutomation/`). Today `deskWire/mdWire.h:5` and `mmWire.h:5` include
   `"mdLib/mdautomation.h"`: the path names the emulator while the target, correctly, does not.
3. Set `JUCE_WEB_BROWSER` and the version definitions where `source/juce.cmake` creates them, since that is now our
   own file.
4. Drop the DEFER once the plug-in targets are made in order.

Each step is mechanical and verifiable by a diff of `compile_commands.json`.

### 7. Upward knowledge in the emulator and pure code parked in the plug-in folder (later)

Evidence:
- `mdLib` (the emulated machine) links `elektronData` (`mdmmEditors.cmake:43`).
- It includes editor document types: `mdLib/mddeskdevice.h:11-12` (`mdAudition.h`, `mdSamples.h`),
  `mdLib/mmtelemetry.h:3` (`mmScreen.h`), `mdLib/mdsamplesnapshot.h:11`.
- `deskStubHost/deskStubHost.cpp:21` includes `mdJucePlugin/mdSyxWork.h`, which pulls in `mdSyxSession.h` (1,007
  lines, header-only, JUCE-free). Pure SysEx-session logic lives in the plug-in folder, and the page tier's host
  reaches into that folder to get it.

Principle: dependencies point down, and code lives with its layer. FOUNDATION's table has no row for the
"desk device" or the SysEx work, so these places are not part of the documented architecture.

Path:
- Move `mdSyxWork.h` and `mdSyxSession.h` into a `deskSyx/` library (links mdDesk, mmDesk, elektronData), used by both
  the session and the stub host.
- Make `md::DeskDevice` an adapter in the plug-in that reads the machine through the existing snapshot and exchange
  types, so `mdLib` needs no `elektronData`. If that is too much for 1.0, at least add the "desk device" row to
  FOUNDATION's table, so the edge is named.

### 8. Engine differences are spread as `m_profile.wire` / `m_profile.memory` branches (later)

Evidence: 42 branches in the adapters, for example:
- `mdDeskMachine.cpp:328, 540, 610, 707, 920, 1460, 1604, 1650, 1688, 1822-1828, 1895, 2058, 2113, 2141`;
- `mmDeskCommands.cpp:131, 211, 337, 394, 469`;
- `mmDeskDelivery.cpp:219, 365, 374, 442, 510`.

Many are timing (`g_loadTimeoutMs + (m_profile.wire ? DinPacer::wireMs(...) * 1.5 : 0)`), and some are semantics
(read-back policy, kits-first order).

Principle: polymorphism through data, not conditionals. The Profile is data, which is good, but it is a bag of
booleans that the code interprets at each use site, so a third engine (for example USB MIDI with no DIN pacing, or
Overbridge-like) means auditing every branch.

Path: derive two values once, when the engine is chosen:
- `Timing {loadTimeout(kind), pushTimeout(kind), readBackDelay, settle}`, built from `wire` and `DinPacer`;
- `Sources {memory, telemetry, panel}`, which capabilities already mostly cover.

The adapters then ask `m_timing.pushTimeout(kind)` instead of branching. FOUNDATION's "add a Profile flag only for a
fact the port cannot express" stays true. This finding does not block 1.0.

### 9. The HW MIDI path depends on the host's audio callback, and its inbox locks on the audio thread (should-fix, part of F1)

Evidence:
- `source/jucePluginLib/externalMidi.h:49-56`: `takeIn` (called inside `processBlock`) takes a blocking
  `scoped_lock` and does `m_in.push_back` (it can allocate) on the audio thread. `flushOut` correctly uses `try_lock`.
- What the desk sends to a real machine leaves only in `flushOut`, inside the next audio block, at sample offset 0.
  A DAW that suspends processing (stopped transport with "suspend plug-ins when idle", offline bounce) therefore
  stalls HW MIDI, and with it the desk's DIN pacer, read-backs and time-outs (finding 8's timing).

Principle: conveyance. A fixed-size lock-free queue at the RT boundary, and a clear statement of which clock drives
which side.

Path:
- Make `takeIn` an SPSC ring (drop and count on overflow, as the MIDI ring does).
- For the standalone, and for plug-ins with their own port (`getMidiPorts().getOutputId()`), send from the message
  thread straight to the port rather than through the block.
- Add "host suspends processing" to the F1 checklist.

### 10. Two hops for every device SysEx message (later)

Evidence:
- `mdStudioLink.cpp:341-352`: each SysEx message from the drain thread posts its own `MessageManager::callAsync`
  lambda (copying the bytes). That lambda then pushes onto `MdEmuEngine::m_in` (`mdSessionMd.cpp:47`), which `step()`
  drains.
- During a full dump (the MM's 130+ messages, or factory reset) this floods JUCE's message queue, interleaved with UI
  work.

Principle: one queue per boundary. The engine contract already says "queue it, never call the desk from a callback".
Make the queue the boundary itself.

Path: a mutex-guarded (or SPSC) deque inside StudioLink, filled on the drain thread and drained by `step()`. That
removes `callAsync`, the `weak_ptr` alive-guard and one copy.

### 11. The gate is its own 1,159-line program with opaque stage ids (later)

Evidence:
- `scripts/mdmm-local-gate.sh` has 18 `stage_*` functions (:207-1034) and stage ids `1 2 2b 2c 3 4 5 5b 6a 6b 6c 7a
  7b 7c 7d`. The plug-in stages are a `|`-joined string (:1083-1085).
- The same ids appear as bare tokens in the tsv's `gate` column (`2 2b 2c 4 7d`). Nothing but a reader's memory links
  "7d" to "User journeys".
- `mdmm-full-gate.sh` keeps the release rule's state in `temp/full-gate/last-green` and `history.tsv` on one Mac.

Principle: data over code. Name the things the rules talk about.

Path: one `scripts/gate-stages.tsv` (`id, name, needs ROM, needs plug-in, minutes, command`). The bash runner loops
over it, the tsv's `gate` column uses names (`journeys`, `pluginval`), and `--check-map` validates them against the
table. This is not needed for 1.0, but each new stage today means editing three files.

## Done well (keep these)

- **Engines as data.** `EngineRecord{profile, make, available}` (`mdSessionMd.cpp:150-154`). `DevicePort` is a record
  of `std::function`s (`mdSessionMd.cpp:51-71`), so a capability is "is this function set". No engine id is tested
  anywhere in the desk, the session or the pages; the one `getExternalMidi().isOn()` test, `mdPluginProcessor.cpp:1060`,
  is a fact about input and is fine.
- **A single-threaded desk.** Everything reaches the desk in `step()` on the message thread. Engines queue (wire:
  `ExternalMidi::drainIn`; emulator: telemetry and LCD read lock-free).
- **State format grows by accretion.** Chunks are 4CC plus version plus length. `ChunkReader` skips a chunk whose
  version is newer than it knows (`source/baseLib/binarystream.h:658`). The editor setup is JSON in `MDSK`, a value
  in a mutex-guarded mailbox with a version counter (`mdDeskHost.cpp:294-305`). MMEM v1 is read as "pre-I-024" rather
  than refused.
- **Plug-in identity is pinned** in one file (`scripts/mdmm-product.env`) and checked
  (`scripts/check_mdmm_plugin_ids.py`).
- **Library graph.** For the pure libraries the graph matches FOUNDATION exactly:

  ```
  elektronJson <- elektronData <- deskCore <- {deskHost, deskWire, mdDataLink} <- {mdDesk, mmDesk}
  ```

  No pure library includes JUCE or `mdJucePlugin`. `mdDesk`/`mmDesk` include `deskHost` only from their tests.
- **The page bridge** is one pure header on each side (`mdPageBridge.h`, `deskBridge.js`), ready for JUCE 8's native
  bridge.

## Suggested order for 1.0

1. Finding 3 (the manifest accepts newer schemas, plus a decision on the key): an hour, and irreversible after the tag.
2. Finding 2, step 1 (`ctest -L UnitTest` in core CI): one line.
3. Finding 1 (measure the lock wait in the RT check; move probe, audition and panel actions to a ring and snapshots):
   this is what the F2 gate will find.
4. Finding 9 (the `takeIn` ring; HW MIDI with suspended processing on the F1 list).
5. Findings 5 and 6 (delete the dead editor; flatten the CMake): mechanical, and they shrink everything else.
6. After 1.0: findings 4, 7, 8, 10 and 11.
