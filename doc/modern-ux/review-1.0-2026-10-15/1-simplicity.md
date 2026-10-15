# Simplicity review (Simple Made Easy), pre-1.0, 2026-10-15

Scope: source/elektron/md/* (our code), doc/modern-ux/mm-mockup (the MM page's real source), the sync scripts.
Branch `codex/native-audio-engine` at 2c59fdb95. Read-only. Findings already fixed in DESIGN-REVIEW-2026-10-02.md
are not repeated; where one is only partly fixed, the residual is reported with new evidence.

## Rating: MOSTLY SIMPLE

The core is in good shape: deskCore's `Core`/`Desk`/`KindSpec`/`Pushes`/`Latest`/`WorkingCopy`, the command tables,
the pure edits, values in and out, effects at the engine edge. The complecting has moved outward: to the plug-in
processor (a persistence service braided into it), to the MM page (a mutable place with two writers), to the two
emulator links and the two adapters (the same feature written twice, state as loose sentinel members), and to how the
two pages are produced (two pipelines, the MM product built from `doc/` with its demo inside).

No finding blocks 1.0 on correctness; none is must-fix. Findings 1 to 4 are the ones worth doing before the 1.0
freeze because they shrink what 1.0 has to support.

---

## 1. The processor is also the machine-memory service (state + identity + when) — should-fix

Evidence
- `mdJucePlugin/mdPluginProcessor.cpp:1304-2312`: about 1,000 of the file's 2,323 lines are the machine-memory
  service: its thread (`startMachineMemoryThread` 1311), file IO (`readMemoryStore` 1459, `writeMemoryFile` 1490),
  base/settle/rebase (`rebaseMachineMemory` 2089), chunked looks under the plug-in lock (`lookMachineMemory` 1983),
  write policy (`writeChanges` 1625), factory start (1868), flushes (2273).
- `mdJucePlugin/mdPluginProcessor.h:253-279`: about 25 members for it on the processor: 18 atomics, two mutexes,
  `m_memoryWatch`, `m_memoryThread`, `m_memoryNote`, test hooks (`m_refuseNextRestoreForTest`, `m_hasLookHookForTest`).
- The machine difference is a boolean re-derived per function: `const bool mm = m_model == Monomachine` at
  `mdPluginProcessor.cpp:1401, 1628, 1719, 1990, 2092`, then `if(mm) userFlash else sampleSectors` branches
  (1641-1665, 1724-1735).

What is complected: the AudioProcessor's identity (host state, buses, audio) with a long-lived, threaded persistence
state machine, and the "which memory does this machine have" fact with every step of that machine.

Why independent: the memory service has its own lifetime (thread), its own lock order, its own clock (look every
`m_memoryLookMs`), and its own tests. Its pure half already lives apart (`mdMachineMemory.h`: `Watch`, `changedSlots`,
`merge`, `startOf`); the impure half does not.

Fix: one `MachineMemory` class (own file) that owns the thread, mutex, watch, note and cost, talking to the machine
through a small port (`look(chunk) -> bytes`, `copyFlash`, `overlay`, `restoreGeneration`). The processor holds one
member and forwards host events (`willBeReplaced`, `sampleStored`, `flush`). Put the per-machine memory shape in
`mdMachineMemory.h` as a record (`{hasUserFlash, hasSampleSectors, sectorSize}`) so `if(mm)` disappears.

## 2. The MM page's `S` is a place with two writers (state + identity) — should-fix (residual of 2026-10-02 #2)

Evidence
- `doc/modern-ux/mm-mockup/src/130-main.js:461-469`: `show(v)` is called "the one writer of S's document members",
  and the same comment says "S is the gestures' to change".
- Gestures write document members of `S` in place, then send the intent: `130-main.js:53` (`S.len=...;edit("length")`),
  `:258` (`S.tracks[t].inp=v;edit("input")`), `:260` (assign), `:311-312` and `128-transport.js:36-37` (`S.bpm=`),
  `75-comforts.js:69` (`S.len=len*2`), `:100` (tap tempo), `125-lib.js:33` (`applyPat` rewrites tracks and locks).
- Because two writers share the place, `show` needs a reconcile layer: `SHOWN`, `sameV`, `copyV`, "a member equal
  to what was shown last is not written again, so a gesture under way keeps its objects" (`130-main.js:470-500`).
- The MD page has no such layer: it renders `view() = Overlay.over(deriveView(Docs, S))` (`skins/mdStudio/mdDeskModel.js:338`)
  with `S` as UI state only.

What is complected: the documents' value (what the machine has plus the overlay) with the page's mutable UI place;
the time a gesture writes with the time a result arrives.

Fix: DESIGN-UNIFY phase 8 as planned: the MM renderers read the derived view `V`; a gesture writes only an overlay
entry keyed to its command id (as `MmView.writes` already computes, `skins/mmStudio/mmView.js:141-200`); delete
`SHOWN`/`sameV`/`copyV` and the document members of `S`. Until then, at least make the `sync-mmstudio-skin.py` check
(`:151, :199`) cover gesture writes, not only `MMView` members, so the doc comment is true.

## 3. Two page pipelines; the MM product UI lives in `doc/` and ships its demo (what + where) — should-fix

Evidence
- MD: `doc/modern-ux/sync-mdstudio-skin.py:1-26` copies only markup and CSS from the mockup: "The mockup's own script
  is example state and is never copied." The MD scripts are hand-written in `skins/mdStudio/`.
- MM: `doc/modern-ux/sync-mmstudio-skin.py:9-11` "the mockup's own script runs in the plug-in: it is the UI, copied as
  it is". Its source is `doc/modern-ux/mm-mockup/src/*` (5,590 lines) concatenated by numeric file prefix into the
  committed `skins/mmStudio/mmMockup.js` (6,311 lines).
- The build order is a shell variable (`mm-mockup/build.sh` `JS="..."`) that the Python script re-parses with a regex
  (`sync-mmstudio-skin.py:39-58`).
- The shipped page carries the standalone demo: `mmMockup.js:542` `/* ---- 54-demo.js ---- */`, and the example kit and
  pattern built at load (`src/50-state.js:14-60`: SuperWave bass, SID arp, VO-6 "monomachine") into `S` before the
  host's documents replace them.

What is complected: product code with design-doc location; the demo fixture with the product's initial state; load
order (when) with file naming.

Fix: move `mm-mockup/src` into `skins/mmStudio/src/` (product code lives with the product); keep the mockup as a
consumer of it. Start `S` empty (as `startEmpty` does), and put the example in `54-demo.js`/`demo-docs.json`, loaded
only by the mockup's `build.sh`. Hold the file list once as data (a JSON manifest both `build.sh` and the Python read).

## 4. The panel editor is compiled, embedded and branched on, but never made (where) — should-fix

Evidence
- `mdJucePlugin/mdEditorPages.cpp:83-93`: `createEditorPage` always returns `new PageEditor(...)`; `editorPageSkins`
  (`:65-70`) lists only the page skins.
- Still built and embedded: `mdJucePlugin/CMakeLists.txt:19` (`mdEditor.cpp`, 2,093 lines), `:35-41, :58` (the
  `mdDefault`/`mmSfx60` RmlUi skins and images).
- Still branched on: `mdPluginEditorState.cpp:204` `dynamic_cast<Editor*>(getEditor())` builds the SysEx menu for an
  editor that cannot exist (always null, so the branch is dead); `mdSettingsPanelFeel.cpp:126-148` reads
  `Editor::g_panelSpeedPercents`; `mdEditor.cpp` holds 10 of the plug-in's 48 device casts.

What is complected: the product's one view with a retired one; every menu and settings path has to know there are two.

Fix: delete `mdEditor.*`, the two RmlUi skins and the `addSysexEntries` branch (or move them behind a dev-only CMake
option); move `g_panelSpeedPercents` to where the page's panel feel lives; drop `mdLcdEditorPointerTest` or retarget it.

## 5. Two emulator links copy the same edge (duplication) — should-fix

Evidence
- `probe()`: `mdStudioLink.cpp:312-338` and `mmStudioLink.cpp:275-292` are the same function except the model, the
  fingerprint and MD's factory-flash wait.
- LCD packing written three times: `mdStudioLink.cpp:299-310` (with `FrontPanel::g_lcdWidth`), `mmStudioLink.cpp:299-306`
  and again `:313-319` (literals `1024`, `64`, `128`).
- `onDeviceSysex`: `mdStudioLink.cpp:340-352` and `mmStudioLink.cpp:340-350` differ only by the device byte (`0x02`/`0x03`).
- Constructor parameter listeners with per-track dirty bits and `drainParameterChanges` (`mdStudioLink.cpp:43-60, 128`,
  `mmStudioLink.cpp:67-92, 323-338`).

What is complected: the emulator edge (lock, probe, LCD, SysEx hop to the message thread) with the machine's facts
(model, fingerprint, id byte, parameter table).

Fix: one `EmulatorLink` over a `LinkFacts` record `{model, fingerprint, sysexId, paramName(page, i), extraLoading}`;
one `packLcd(const FrontPanel&) -> bytes`. The MD and MM links keep only what is truly theirs (sample bank, audition,
key-to-panel map).

## 6. Adapter feature state as loose sentinel members; MM global choice spread over six (state + identity) — should-fix

Evidence
- `mmDesk/mmDeskMachine.h:287, 299-306`: `m_reactivateGlobal`, `m_curGlobal`, `m_activateGlobal`, `m_chooseGlobal`,
  `m_chosenGlobal`, `m_chosenSentMs`: one concept (which global is active, and which is on its way), `-1` meaning
  "none", used in 26 places across `mmDeskCommands.cpp`, `mmDeskLoad.cpp`, `mmDeskMachine.cpp`, `mmDeskTransport.cpp`.
  Its history is bugs (B-067, B-071, the 0.5.0 gate's mm-global-slot, per the comments).
- MM header has 61 members (was about 42 at the last review); the MD 40. Unknown-as-sentinel throughout:
  `mmDeskMachine.h:299` (`m_curPattern = -1, m_curKit = -1, ...`), `:308, :311`; time sentinels `-1e9`/`-1e18`
  (`mdDeskMachine.h:294, 311, 337, 349, 352-355`; `mmDeskMachine.h:309, 330, 335, 357`).

What is complected: each feature's state with the adapter's identity, and "not known" with a number.

Fix: a `GlobalChoice` value (`Idle | Chosen{slot, sentAt?} | Reactivate{slot}`) with a pure `step(choice, event, now)`
beside `mmDeskWatch.h`; `std::optional<int>` for the current slots; group the record-start fields (MD
`m_recordedMs/m_recordedSinceRec/m_recordWaitMs/m_recordPollMs`, `mdDeskMachine.h:351-355`) into one value the same way.

## 7. The same machine behaviour written twice in the two adapters (duplication, what + how) — should-fix

Evidence
- The held-key lease (page says "still held" every 250 ms; let go after quiet): MD `mdDeskMachine.cpp:2132-2133` with
  `struct Erase` (`mdDeskMachine.h:341-350`) and `m_eraseSeenMs`; MM `mmDeskMachine.cpp:249-251` with `m_exitHeld`,
  `m_exitSeenMs`, `m_eraseTrack` and `mmDeskRecord.cpp:86-120`.
- Status poll cadence: MD named constants (`g_statusQueuedMs`/`g_statusIdleMs`, `mdDeskMachine.cpp:2145`), MM literals
  (`250 : 1000`, `mmDeskMachine.cpp:258`).
- The tick order (`setPlaying`, `pump`, release lease, `pumpSequence`, ready gate, status) is hand-written in each
  `tick()` (`mdDeskMachine.cpp:2127-2145`, `mmDeskMachine.cpp:244-260`).

Why independent: a lease and a poll schedule are policies, not machine facts; the last review lifted `Latest`,
`Pushes` and `ChainRequest` for exactly this reason.

Fix: `deskCore::Lease<T>` (`hold(t, now)`, `due(now) -> release?`) and `deskCore::StatusPoll` (`{idleMs, busyMs}`) next to
`Latest`; each adapter keeps only the keys it presses.

## 8. The edit envelope and `applyTrack` duplicated and already diverging (duplication) — should-fix

Evidence
- `applyTrack`: `mdDesk/mdDeskEdit.cpp:1179-1236` and `mmDesk/mmDeskEdit.cpp:1663-1719`, about 55 lines each, same
  shape (parse mask, find pattern, find working kit, `tp::run`, collect changes, `problemsOf`). Already different:
  "is not loaded yet" vs "is not read yet"; MD requires `k` only when kit parts are touched, MM reads the kit whenever
  `k` matches.
- `apply` envelope: `mdDeskEdit.cpp:1606-1636` (op lookup, row check, `CommandTable::check`, a ternary dispatch on
  `group`, clipboard diff once) vs `mmDeskEdit.cpp:2345-2395` (same, with an if-chain and the clipboard diff three times).

Fix: `deskCore::trackParts::apply<Model>(docs, command, clipboard, context)` using the Model's `patterns`/`workingKitOf`;
`deskCore::applyEdit<Model>` for the envelope with a per-model `{group -> function}` table. The per-machine files keep
only the edits themselves.

## 9. Desk setup handling diverged between MD and MM (conditionals vs data) — later

Evidence
- MD: a `DeskSetup` record (modulators, knob CCs, solo) and a table `setups()` (`mdDesk/mdDesk.cpp:53-76`).
- MM: an if-chain (`mmDesk/mmDesk.cpp:58-80`), `m_solo` and `m_mods` as separate members, the setup document composed by
  hand (`setupDoc`, `:82-89`).
- Behaviour drift: MM `loadSetup` and `runModulators` `flush()` (`mmDesk.cpp:122, 144`); MD's do not
  (`mdDesk.cpp:421-433, 456-462`).

Fix: `deskCore::Setup<Extras>` (modulators + solo + a model's extras) with a table dispatch in deskCore; MD's knob CCs
are its extras. Decide the flush rule once.

## 10. Device access and readiness re-stated at every call site (where) — later

Evidence: 48 `dynamic_cast<md::Device*>`/`<md::DeskDevice*>` in non-test plug-in code (21 in `mdPluginProcessor.cpp`,
9 `mdStudioLink.cpp`, 6 `mmStudioLink.cpp`, 10 `mdEditor.cpp`), each followed by its own readiness test, e.g.
`!device || !device->isValid() || device->isProjectStateRestorePending()` at `mdPluginProcessor.cpp:1351, 1723, 2007`
and variants at `:446, 748, 1090, 1960`. Product identity is the same kind of repeated conditional:
`_model == Monomachine ? ... : ...` in `productName`, `dataFolderName`, `getOptions`, AU subtype
(`mdPluginProcessor.cpp:94-134`).

Fix: one `withReadyMachine(fn) -> optional<R>` on the processor (one definition of "ready"); one `ProductFacts` record per
model (name, folder, AU subtype, settings name) selected once.

---

## Not findings (checked and fine)

- The two sound-group tables (`mdDeskSoundGroups.js`, `85-sound-groups.js`) stay apart on purpose and say why.
- `mdSessionMd.cpp` / `mdSessionMm.cpp` engines follow FOUNDATION's engine recipe; little to share.
- Release CI reuses `mdmm-editors.yml` via `workflow_call`; the release-only packaging adds signing, not a copy.
- `MmView.writes` predicting edits in JS is a second statement of each edit, but it is pinned to the C++ edits by
  `intent-cases.json`; acceptable until finding 2 is done.

## Suggested order before 1.0

4 (delete the panel editor: pure removal), 3 (empty `S`, demo out of the product), 1 (extract the memory service), then
5, 8, 7 as one "lift the shared edge" pass; 2 is phase 8; 6, 9, 10 after 1.0.
