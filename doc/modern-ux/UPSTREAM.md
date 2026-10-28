# Living on top of upstream

> **History since 0.5.** The editors no longer live on top of upstream (doc/release/PLAN-0.5.md, doc/ROADMAP.md
> D3-D5): the DSP emulator, the 68k core, JUCE and RmlUi are folders we own; the `upstream` and `gearmulator`
> remotes, `scripts/mdmm-sync-upstream.sh`, `scripts/mdmm-upstream-footprint.sh`, the integration-policy workflow
> and the Jenkins files are gone; upstream fixes are copied one commit at a time, never merged. The rules below
> (hooks only, never delete an upstream file) applied until then; they stay as the record of why the code looks
> the way it does.

This fork keeps merging joelanders' work (`upstream`, [joelanders/gearmulator-md-mm](https://github.com/joelanders/gearmulator-md-mm))
with `git merge`, never a rebase. He in turn merges dsp56300/gearmulator, which moves whole folders
(for example `source/jucePluginLib` to `source/framework/juce/jucePluginLib`). Every line we change
in a file he owns is a future conflict; a file we add is not.

## The rule

- **Our code lives in our files.** New libraries, sources, tests, CMake and CI workflows are files
  of ours, in our folders or beside his.
- **Upstream files get hooks only:** one include, one call, one member, one argument. A hook calls
  into our file and carries a comment that points here.
- **Never delete an upstream file.** Keep it out of our build and product from our own files
  (a filtered source list, `EXCLUDE_FROM_ALL`, a disabled test). A deleted file becomes a
  modify/delete conflict every time he edits it.
- **An upstream file that needs no change is byte-identical to the merge base.**
- Check before a merge or a PR: `scripts/mdmm-upstream-footprint.sh` lists every upstream file we
  change, with line counts, and fails if one was deleted.

## The hooks

| Upstream file | Hook | Why it cannot be ours |
|---|---|---|
| `README.md` | the top section | the fork's front page |
| `CLAUDE.md` | the "This fork" section at the top; the Community section at the end | the fork's guide for Claude Code |
| `CMakeLists.txt` | one line right after `cmake_minimum_required`: `include(source/elektron/md/mdmmCMakeVersion.cmake)`, the CMake 3.22 check (his minimum, and the policies it sets, stay his) | JUCE needs 3.22; the message names JUCE instead of failing inside it |
| `.github/workflows/mdmm-integration-policy.yml` | `if: github.repository == 'joelanders/gearmulator-md-mm'` on the job | his gate for pull requests into his release line; this fork merges into `main`, so the job is skipped here (the file stays, byte-identical but for those two lines, the `if` and its comment) |
| `source/elektron/md/mdLibTest/sysexContentOracle.h`, `sdsFirmwareTest.cpp`, `mmSysexExportFirmwareTest.cpp` | copy `event.sysex` into a `std::vector` (`Sysex(begin, end)`, `assign`) instead of assigning it | `synthLib::SysexBuffer` is a `std::pmr::vector` on Linux, which does not assign to a `std::vector`: the three files did not compile there |
| `source/elektron/md/CMakeLists.txt` | `include(mdmmEditors.cmake)` after `mdLib` | adds our libraries (`elektronData`, `desk*`, `mdDesk`, `mmDesk`, `mdDataLink`), our part of `mdLib` (`mdAutomation` split out, `mddeskdevice`, `mdpanelsequence`, the telemetry headers), the JUCE web view switch and our `mdLibTest/mdmmTests.cmake` |
| `source/elektron/md/mdJucePlugin/CMakeLists.txt` | `include(mdmmPlugins.cmake)` after the shared assets list; the product names in `createJucePlugin` are `${MDMM_PRODUCT_NAME_MD}` / `_MM` (`scripts/mdmm-product.env`, read by `mdmmPlugins.cmake`) | the editors' version (`MDMM_EDITOR_VERSION`), sources, page files in the binary data (instead of the panel skins) and icons must be values before his `juce_add_binary_data` and `createJucePlugin`; the rest (libraries, definitions, bundle steps, tests, the disabled panel pointer tests) runs deferred at the end of his file |
| `source/juce.cmake` | `${GEARMULATOR_PLUGIN_EXTRA_ARGS_<target>}` last in `juce_add_plugin` (a repeated one-value argument wins over his: the editors' icons, maker `Future Native Audio`, website, copyright, microphone text, the pinned LV2 URI); `GEARMULATOR_PLUGIN_BUNDLE_ID_<target>` instead of his `local.gearmulator.preview.*` when set | JUCE takes these only as `juce_add_plugin` arguments, at configure time; the editors' own identifiers and names: `doc/release/SIGNING.md`, Identifiers and Names |
| `mdJucePlugin/mdPluginProcessor.h` | `getDeskHost()`, `m_desk`; the `usesMidiLearn` override | the processor owns the editors' state (`mdDeskHost.h`: the setup chunk and the session); MIDI mapping is off, so no learn translator is made (`doc/midilearn/THREADING.md`) |
| `mdJucePlugin/mdPluginProcessor.cpp` | includes; the `MDSK` chunk saved and read; a load starts from the default setup; the host made and started; the host destroyed **after** `destroyEditorState()` (the page detaches from the session); `md::DeskDevice` in `createDevice`; with no ROM `createDevice` returns `makeNoRomDevice()` (`mdDeskHost.h`) instead of throwing `FirmwareMissing` (the throw ended in `jucePluginLib/processor.cpp`'s native "Device Initialization failed" alert and Finder; now the page asks for the ROM); the state-restore alert is `genericUI::MessageBox` (routed to the page) instead of `juce::NativeMessageBox`; the config file named `editorConfigFileName` and copied once from his (`prepareConfig`, `mdSettingsMigration.h`); `productName` returns `MDMM_PRODUCT_NAME_MD` / `_MM` and the data folder's vendor is pinned to his `Gearmulator Preview` (`g_dataFolderVendor`: the maker the DAW shows is ours, the folder stays); the storage-image message names the MM product; `getStateInformation` / `setStateInformation` / `restoreHeldState` (one line each: with no ROM the stand-in keeps the project it was given and hands the same bytes back, so a session without a ROM cannot overwrite the saved project, `DeskHost::holdState`); `usesMidiLearn` returns `deskHost::midiMappingEnabled`; B-037: `machineMidiOut::route` after `getController()` in the constructor and a `machineMidiOut::RouteAfterLoad` at the top of `loadCustomData` (the machine's own MIDI out, all but its SysEx, to the host and the standalone's MIDI output, `mdMachineMidiOut.h`); one `processArch::addSessionFields(context)` in the performance report's session (`mdProcessArch.h`: whether the editor runs translated) | the processor's lifetime and state are upstream's; his routing matrix (`jucePluginLib`) has no Device -> Host route and a project's state carries the whole matrix, so the route is set where the processor is made and where a state is loaded |
| `mdJucePlugin/mdPluginEditorState.cpp` | includes; `editorPageSkins`, `keepEditorPage`, `createEditorPage` (`mdEditorPages.h`); the `addSettingsEntry` override (B-007: none in a plug-in, "Audio/MIDI Settings..." in the standalone); the `fillMenu` override: the editor's whole menu as data (`mdEditorMenu.h`, I-008; the page's Zoom, B-001) | the editor page is the only UI; his panel editor and skin policy are gone; the editor's menu is built there |
| `mdJucePlugin/mdController.h`, `.cpp` | `evDeviceSysex` and its one call in `parseSysexMessage` | the only place every SysEx from the machine passes |
| `jucePluginLib/processor.h`, `.cpp` | `ExternalMidi` member and accessor; `takeIn`, the device output dropped, `flushOut`; `protected:` / `private:` around `get/setStateInformation` (`.h`); `Properties::configFileName` and its two lines in `getConfigFile`; the virtual `usesMidiLearn()` (true by default) checked where the MIDI learn translator is made; `requestLatencyUpdate()` after `setResamplerMode` and `setPreferredDeviceSamplerate` | HW MIDI: the processor's MIDI paths (`externalMidi.h` holds the logic); the md processor overrides the two state calls; the base constructor opens the config file, so its name must be a property, not an override (the editors' own config file, `mdSettingsMigration.h`); the translator is not thread-safe and the editors do not use it (codex review 2026-10, item 8); each resampler has its own delay and hosts compensate only what they are told (item 7) |
| `jucePluginEditorLib/pluginEditorState.h`, `.cpp` | `openMenu` split into a virtual `fillMenu` (+ a null check on Settings); the Settings entry moved into the virtual `addSettingsEntry` | the menu is built inline in `openMenu`; the menu bar and the page's context menu need it as data (`editorPopupMenu.h`); the web page editors have no RmlUi settings page, so `mdPluginEditorState` replaces the entry; since I-008 it builds the whole menu (`mdEditorMenu.h`), which the page draws |
| `jucePluginEditorLib/pluginEditorWindow.h`, `.cpp` | an `EditorWindowFit` member and five calls | free-size pages and the screen fit are the window's sizing (`editorWindowFit.h`, `windowFit.h`) |
| `juceRmlUi/rmlMenu.h` | `forEachEntry` | a menu's entries are private |
| `juceUiLib/messageBox.cpp` | one `messageRoute::offer...` line at the top of each of the five functions (`messageRoute.h` is ours, header only) | every question and warning of the shared code passes here; the editors show them in the page, not as native alerts |
| `synthLib/device.h`, `plugin.cpp` | `Device::StateCapture` and the virtual `beginStateCapture` (null by default: the other synths keep the old path); `Plugin::getState` begins the capture under the process lock and encodes after it; `addMidiEvent` checks the full MIDI ring again under the process lock before it makes room | every synth's plug-in wrapper: a state save no longer holds the audio thread (codex review 2026-10, item 3; the Machinedrum's and Monomachine's capture is ours, `mdLib/mdstatecapture.*`), and a full ring no longer replays a stale event (item 2) |
| `mdLib/mddevice.h`, `.cpp` | the `beginStateCapture` override (defined in our `mdLib/mdstatecapture.cpp`); `getState` is a capture encoded at once | the device's state and its members are upstream's |
| `mdLib/mdhardware.h`, `.cpp` | the ROM held as `shared_ptr<const Rom>` (`sharedRom()`); `factoryFlashBaseline()` and `m_factoryBaseline` (defined in our `mdLib/mdfactorybaseline.cpp`); the captured factory image held by `shared_ptr` (shared with a save, not copied); `replaceFactoryFlashCache` keeps the baseline it decoded; the flash exchange swaps it; the include | a save that encodes without the lock keeps the ROM and the baseline alive after the device swapped its Hardware, and decodes the factory cache once instead of at every save |
| `mdLib/mdstate.h`, `.cpp` | `crc32` declared; the CRC-32 by tables (slicing by eight, the same values) | the state and cache formats' checksum, 15 times faster |
| `mcpServerLib/httpServer.h`, `.cpp`, `httpResponse.h`, `mcpServer.h`, `.cpp`, `mcpPluginServer.h`, `.cpp` | loopback, the Host and Origin check (our `httpGuard.h`), no CORS (`setCorsHeaders` gone); clients reaped and capped, request limits, an idle read timeout (a constructor argument for the tests), shutdown that interrupts the clients and wakes the SSE wait; tool handlers run outside the tools mutex; `send_note`'s duration clamped (`noteDurationMs`) | his MCP server (codex review 2026-10, items 11 and 12): a web page or another machine could drive it, and it could hang the host at shutdown |
| `.github/workflows/mdmm-core.yml`, `scripts/macos/build_mdmm.sh`, `scripts/windows/build_mdmm.ps1` | our test names in his lists of test targets and ctest patterns | our CI runs his scripts and his core workflow; the tests the fork carries (`upstreamTests/`, `mdStateCaptureTest`, `mdProcessorHooksTest`) must run there too |
| `doc/mcp_server.md` | loopback, the Host and Origin check, the limits and the accepted risk (no authentication); the `exit` tool removed (the code no longer has it) | his document of his server |

What moved out of upstream's files: `md::Device`'s telemetry and panel sequences into `md::DeskDevice`
(`mdLib/mddeskdevice.*`, the plug-in makes it); `panelKeySequence` into `mdLib/mdpanelsequence.*`;
the processor's setup chunk and session into `mdJucePlugin/mdDeskHost.*`; the skin choice into
`mdJucePlugin/mdEditorPages.*`; the window title, Audio/MIDI Settings and free size into
`mdStandaloneApp.cpp` and `jucePluginEditorLib/editorTraits.h` (`FreeSizeEditor`,
`AudioMidiSettingsEditor`: the page says so, `Editor` stays his; his "I Agree" disclaimer alert is silenced by `createEditorPage` setting its config value `disclaimerSeen`, no hook); our mdLibTest and mdJucePlugin
tests into `mdLibTest/mdmmTests.cmake` and `mdJucePlugin/mdmmPlugins.cmake` (same targets, labels
and output folders); the tag-time installers into `.github/workflows/mdmm-editors-release.yml`
(his `elektron-prerelease.yml` and `elektron-macos.yml` are his again; a tag also runs his, which
builds without uploading); the build and start test of every push into our `mdmm-editors.yml`, which calls
`mdmm-editors-macos.yml`, `-windows.yml` and `-linux.yml`: they run his `scripts/macos/build_mdmm.sh` and
`scripts/windows/build_mdmm.ps1`, whose only change of ours is our test names in their lists (the hooks; a compiler
cache and Ninja come in through the environment, not through his files), and no longer call his
`elektron-windows.yml`; the release takes their packages ([doc/release/WINDOWS.md](../release/WINDOWS.md), [doc/release/LINUX.md](../release/LINUX.md)). His
`elektron-macos.yml` and `elektron-windows.yml` are byte-identical to his again and still run on their own triggers
(`main`, `release/md-mm-*`), each a second build on a push to our `main` that nothing waits for; turning them off for
this fork is a repository setting (`gh workflow disable`), not an edit of his files.

The tests the fork carries for his code (synthLib's wrapper) are in `source/elektron/md/upstreamTests/`, added from
`mdmmEditors.cmake`. The DSP bridge (`bridge/`, `networkLib/`, `ptypes/`), the MCP server and their tests were
deleted in 0.5; a project saved with the bridge's remote device (the `REMO` chunk) loads on the local device
(`jucePluginLib/processor.cpp`, proven by `mdProcessorHooksTest`). Tests of
ours that once were appended to his test files are files of ours: `mdLibTest/mdStateCaptureTest.cpp`,
`mdJucePlugin/mdProcessorHooksTest.cpp`, `upstreamTests/synthLibStateCaptureTest.cpp` and
`upstreamTests/synthLibMidiQueueTest.cpp`. The state capture and the factory baseline are `mdLib/mdstatecapture.*`
and `mdLib/mdfactorybaseline.*` (his `mddevice.*` and `mdhardware.*` keep the hooks above); the CMake 3.22 check is
`source/elektron/md/mdmmCMakeVersion.cmake`.

The panel editor (`mdEditor.*`), its skins (`skins/mdDefault`, `skins/mmSfx60`), the panel-feel and audio-input settings, the LCD interaction model and the panel tests were removed for 1.0 (the product never created them since the editor page). Older configs that name a panel skin open the page (`keepEditorPage`).

## Files we add in his folders

Our headers in `jucePluginEditorLib/` (`standaloneApp.h`, `windowFit.h`, `editorPopupMenu.h`,
`editorTraits.h`, `editorWindowFit.h`) and `jucePluginLib/` (`externalMidi.h`) sit beside the files
that include them. When upstream moves those folders (the `source/framework/juce/` move), git
moves them along and reports a "file location" conflict for each; accept the move, or merge with
`git -c merge.directoryRenames=true merge ...` and they merge cleanly.

Ours in his other folders: `mdLib/` (`mddeskdevice.*`, `mdpanelsequence.*`, `mdsequencerstate.h`,
`mmtelemetry.h`, `mdromcheck.h`, `mdstatecapture.*`, `mdfactorybaseline.*`; listed in `mdmmEditors.cmake`),
`mdLibTest/` (the rigs in `mdmmTests.cmake`) and `mcpServerLib/httpGuard.h` (header only, included by his
`httpServer.cpp`).

## dsp56300 fixes copied in 0.8

Radek, 2026-10-17: every upstream dsp56300 fix that matters for the Machinedrum and Monomachine goes into 0.8.0. Branch
`perf/0.8-dsp-upstream`, one commit per upstream commit (`dsp56300: <upstream subject> (upstream <sha8>)`, the message
carries the full sha), copied by hand with `git apply --3way` from a clone of dsp56300/dsp56300 and resolved against
our tree. Never merged.

**Where our tree stands.** There is no single upstream commit it matches. The folder came from joelanders'
`dsp56300-md-mm` (1378c43), which is not in dsp56300/dsp56300's history, and since then it carries our own work (L3,
L4, PagedArray, cowMemory, the MD DMA rule) and pieces of helica1's pull requests. Compared by blob, it equals
upstream of about 2026-08-25 to 08-31 in the files nobody touched (152 of 239 files of `e60fff44` are byte equal), and
upstream's `7bb68a1f` (08-31) is the first commit that is clearly not in it. The list below is therefore
`e60fff44..HEAD` of upstream (148 commits, 2026-08-31 to 2026-10-14). Some older upstream fixes are missing too (the
MAX parallel-move fix `36efd0fd` of 2026-06-16 was; found because the test of a later commit needed it, copied first).
Older commits were not audited one by one.

**How each was judged.** A probe over the six golden scenarios (md-busy, md-factory, md-song, mm-a01, mm-busy,
mm-song) listed what the firmwares run:

- the DSP instructions the JIT compiles (76 mnemonics; `cmpu`, `brkcc`, `merge`, `adc`, `sbc`, `rol`, `ror`, `norm`,
  `do forever` do not appear; `normf`, `mpyri`, `dor`, `insert`, `clb`, `div`, `macsu`, `mpysu` do);
- no unimplemented-instruction hit in any of them (the JIT's `errNotImplemented` printed to stderr in a scratch build);
- the SR modes the blocks are compiled for: Scale Up (S1) in 17 of about 2350 block compiles, saturation mode (SM) in 3,
  never Sixteen-bit Arithmetic (SA), never a Rounding mode;
- no write to any timer register on either machine.

Every kept commit passed the dsp56300 unit tests (dsp56kTestRunner, accumulator and ESSI-on-demand tests) on arm64
and on x86_64 under Rosetta (the x64 JIT is the Windows/Linux code), plus a quick golden probe (md-busy, mm-busy); the full 30
golden runs were repeated at the end (below). A commit whose upstream test did not fit our older test file got the
upstream HEAD version of that test (`ds-pulltest`: the function is taken from upstream HEAD and added to the run list).

| Upstream | Date | What | Decision | Our commit | Reason |
|---|---|---|---|---|---|
| `c8da0c58` | 2026-03-09 | Add readRSMA/readRSMB to both peripherals classes | left out |  | readRSMA/readRSMB: already in our tree |
| `7bb68a1f` | 2026-08-31 | jit: sign extend the multiplier's 24 bit immediate, and cover the signed/unsigne | copied | `6ac360fc3` | JIT multiplier immediate sign extension (mpyi/maci immediates at or above $800000; MD/MM run mpyi, maci, mpysu, macsu); tests taken from upstream HEAD |
| `4a654dff` | 2026-08-31 | jit: fold the multiplier's product scale into its operand's sign extension | copied | `552a29788` | x64 JIT only (aarch64 code unchanged); verified with the x64 unit tests under Rosetta |
| `503b0c98` | 2026-08-31 | jit: only split an accumulator into a write latch when the parallel move names i | copied | `4ccae0e3a` | JIT register-pool optimisation (bit-exact; MD instructions per frame -1.7 %) |
| `f151a2eb` | 2026-08-31 | JIT: implement DO FOREVER | left out |  | DO FOREVER / DOR aa / MACRI / LRA / TRAP forms: no unimplemented-instruction hit in any of the six golden scenarios (probe), dor and mpyri are used and already run |
| `cc2415d2` | 2026-09-01 | DSP: clear SR_FV on interrupt entry, in both engines | left out |  | DO FOREVER / DOR aa / MACRI / LRA / TRAP forms: no unimplemented-instruction hit in any of the six golden scenarios (probe), dor and mpyri are used and already run |
| `7d69d7a9` | 2026-09-01 | JIT: only check LA against a block's loop end while a loop is active | left out |  | assert / comment only (debug builds) |
| `05fa6b10` | 2026-09-01 | JIT: support a call at the end of a DO loop | left out |  | call at the end of a DO loop: off by default (supportBranchAtLoopEnd), MD/MM have no such loop |
| `3cccf04e` | 2026-09-01 | JIT: let a device put a memory mapped peripheral on the external bus | left out |  | external bus device (Virus board hardware); MD/MM have none |
| `117d453e` | 2026-09-01 | JIT: note that the loop-end assert guard misses nested ENDDO | left out |  | assert / comment only (debug builds) |
| `ac925c10` | 2026-09-01 | Peripherals56362: implement the Serial Host Interface | left out |  | DSP56362 serial host interface |
| `6943f09b` | 2026-09-01 | JIT: push the correct return address for a call in the interrupt vector region | left out |  | devices that run code in the vector region (dynamicFastInterrupts); MD/MM do not |
| `36a95e8c` | 2026-09-02 | implement CMPU, in the interpreter and the JIT | left out |  | CMPU: never compiled by MD/MM (probe) |
| `4fb5fead` | 2026-09-02 | PLL: read the full three bit DF field from PCTL | left out |  | PLL DF field: latent per upstream (DF=0 everywhere), ESAI clock only |
| `5ea6cdae` | 2026-09-02 | DSP56362: Implement 16-bit arithmetic-mode transfer semantics, missing bitfield/ | left out |  | Sixteen-bit Arithmetic mode (SA) and DSP56362 ESAI: SA is never set in any MD/MM block (probe). 31ee15c0 also carries an x64 JIT shift-count fix: see open items |
| `31ee15c0` | 2026-09-02 | DSP56300: complete the Sixteen-bit Arithmetic mode bus transfers, fix x64 JIT sh | left out |  | Sixteen-bit Arithmetic mode (SA) and DSP56362 ESAI: SA is never set in any MD/MM block (probe). 31ee15c0 also carries an x64 JIT shift-count fix: see open items |
| `3186f1d7` | 2026-09-03 | say on stderr when an instruction is not implemented | left out |  | message / PC advance for unimplemented instructions; MD/MM never reach one (probe) |
| `2ccbbb4f` | 2026-09-03 | implement BRKcc and MPYRI, in the interpreter and the JIT | left out |  | BRKcc/MERGE not used; MPYRI already in our tree |
| `edca7ad2` | 2026-09-03 | skip the whole instruction when it is not implemented, not one word | left out |  | message / PC advance for unimplemented instructions; MD/MM never reach one (probe) |
| `f9a51e03` | 2026-09-03 | implement MERGE, in the interpreter and the JIT | left out |  | BRKcc/MERGE not used; MPYRI already in our tree |
| `6a229bb3` | 2026-09-03 | ENDDO restores the DO FOREVER flag too, not just the loop flag | left out |  | DO FOREVER / DOR aa / MACRI / LRA / TRAP forms: no unimplemented-instruction hit in any of the six golden scenarios (probe), dor and mpyri are used and already run |
| `edae9159` | 2026-09-03 | implement the DAX, the DSP56362 digital audio transmitter | left out |  | DSP56362 digital audio transmitter |
| `f748b184` | 2026-09-03 | move the pp addressing tests off the DAX address | left out |  | DSP56362 digital audio transmitter |
| `1c0694c8` | 2026-09-03 | BSET/BCLR/BCHG on SR: keep the bit change, and let it decide C | copied | `9cb7287d0` | bset/bclr/bchg on SR lost its bit change behind a pending CCR update; MD/MM run bset, bclr |
| `621a1b2f` | 2026-09-03 | SA: a short immediate into an accumulator is not a bus value | left out |  | Sixteen-bit Arithmetic mode (SA) and DSP56362 ESAI: SA is never set in any MD/MM block (probe). 31ee15c0 also carries an x64 JIT shift-count fix: see open items |
| `e73ae097` | 2026-09-03 | MERGE: implement the Sixteen-bit Arithmetic form | left out |  | BRKcc/MERGE not used; MPYRI already in our tree |
| `f50b4dc7` | 2026-09-03 | DSPThread: give the DSP thread an 8 MB stack on POSIX | copied | `4b3c9293d` | DSP thread gets an 8 MB stack (JIT compiles recursively; macOS default 512 KB) |
| `5ea516cd` | 2026-09-04 | catch a device that puts ordinary code in the vector region | left out |  | devices that run code in the vector region (dynamicFastInterrupts); MD/MM do not |
| `554f0fab` | 2026-09-04 | SA: bitfield instructions from measured hardware behaviour | left out |  | Sixteen-bit Arithmetic mode (SA) and DSP56362 ESAI: SA is never set in any MD/MM block (probe). 31ee15c0 also carries an x64 JIT shift-count fix: see open items |
| `ed26920e` | 2026-09-05 | Timers: implement the prescaler instead of ignoring PCE | copied | `ede06b31d` | timer prescaler; MD/MM never touch the timers (probe: no timer register write), so no effect, kept as the base of the timer file |
| `a1a4db79` | 2026-09-05 | declare LF line endings for our own sources | left out |  | line-ending declaration, no source change |
| `ff6a2c85` | 2026-09-05 | NORMF: pin SR before branching, so both arms see the same register pool | left out |  | our op_Normf already goes through If(), which reconciles the register pool |
| `004bea1e` | 2026-09-05 | ASL: set L on overflow | left out |  | already in our tree (verified by reading the code) |
| `e32c7059` | 2026-09-05 | NORMF: leave the carry bit alone | copied | `13faf2c22` | normf (used by MD/MM) leaves C alone; merged with our If()-based op_Normf |
| `0e070bee` | 2026-09-05 | ASR: take the carry from the accumulator, not from the host flag (x64) | left out |  | already in our tree (verified by reading the code) |
| `f7d5f237` | 2026-09-05 | Memory: do not dereference m_mmuBuffer when the host MMU is unavailable | left out |  | already in our tree (verified by reading the code) |
| `65a3c6ce` | 2026-09-06 | MemoryBuffer: reserve 192 MB of address space, not 768 | copied | `5869c89e4` | address space reservation 768 MB -> 192 MB; no emulated behaviour |
| `14864be3` | 2026-09-06 | ASL: take the carry from the right bit on AArch64 | left out |  | our AArch64 ASL right-aligns the accumulator before the shift, so bit 56 is the carry (equivalent) |
| `a31c1dfb` | 2026-09-06 | LE: fix the condition on AArch64 | copied | `1e4a744ab` | AArch64 JIT LE condition wrong when Z is set and N differs from V (ble/blt/bgt/bge/tgt/tge are used by MD/MM) |
| `6235d60e` | 2026-09-06 | ROL/ROR: N comes from bit 23, not bit 23 plus the ALU offset | left out |  | ROL/ROR: never compiled by MD/MM (probe) |
| `f6ae8743` | 2026-09-06 | ROR/ROL: compute Z before N on x64 | left out |  | ROL/ROR: never compiled by MD/MM (probe) |
| `30434b46` | 2026-09-06 | bit-test jumps: apply an updating effective address on both paths | copied | `947d56cfc` | brclr/brset/jclr/jset with an updating effective address kept the old Rn on the fall-through path |
| `4bbbed98` | 2026-09-06 | GT/LE: decode the condition properly on x64, and record the SR read | copied | `5f288fd88` | x64 JIT GT/LE decode (same family) |
| `fa5e0af7` | 2026-09-06 | SUBR: port to the left-aligned ALU | copied | `bad8529ba` | subr (used) on the left-aligned ALU: wrong N, C and Z |
| `2ffbea65` | 2026-09-06 | JitBlockInfo: clear the CCR masks on reset | copied | `7e7627d1a` | recycled JIT blocks started with the previous block's CCR masks (a stale ccrOverwrite could drop a needed flag flush) |
| `9017b0ec` | 2026-09-06 | add a cross-block condition code regression test | left out |  | test only (covered by the tests pulled with 2ffbea65 and 30434b46) |
| `f0398f14` | 2026-09-06 | NR/NN: a zero accumulator is normalized | copied | `16042b372` | NR/NN: a zero accumulator is normalized (interpreter and both JITs); needed by the condition test of 5898ebbd |
| `5898ebbd` | 2026-09-06 | LE: fix the condition in the interpreter | copied | `998cae4d3` | interpreter LE condition; tests cover all 256 CCR values for LE, GT, NR, NN |
| `33af298a` | 2026-09-06 | JIT: parallel X:Y writes ignored memoryWritesCallCpp | left out |  | debug option memoryWritesCallCpp |
| `e3b48602` | 2026-09-06 | bit-test jumps: cover the remaining updating addressing modes | left out |  | test only (covered by the tests pulled with 2ffbea65 and 30434b46) |
| `42611210` | 2026-09-10 | CCR: fix DIV/NEG overflow, Scale Up E and deferred-flag lifetime | copied | `1709fd85c` | partly: NEG/Scale-Up E/x64 DIV V were already in our tree (comments differ); the interpreter's deferred-CCR lifetime and the test ccrGroundTruth are new |
| `04d30c02` | 2026-09-11 | CCR: fix U in Scale Up on AArch64 when the scaling mode is not static | left out |  | already in our tree (verified by reading the code) |
| `65406f8f` | 2026-09-11 | CCR: overflow flags for ADD/SUB/CMP/INC/DEC/ABS/ADDL, and ROL, LSL, CLB, bit-tes | left out |  | OPEN: V/L for ADD/SUB/CMP. Experiment: setting V (and L) from the host flag on AArch64 leaves all goldens equal and costs about 1 % of instructions, so no observed effect; ABS, ADDL, INC, DEC, NEG are already ours |
| `a1a64bc7` | 2026-09-11 | JIT: run a REP's instruction once at a volatile address, and keep the ALU half o | copied | `1c4d9c33b`, REP half undone by `b6ae08ed4` | partly: the ALU-latch half (parallel move writing part of the accumulator its ALU half wrote). The REP-scan half is left out: it moves block boundaries (MD playing hash changed) and the case it fixes (a REP at a volatile P address) is not reached by MD/MM |
| `7eb91002` | 2026-09-11 | Interpreter: continue behind a repeated two-word instruction | left out |  | interpreter-only fixes (MD/MM run the JIT) |
| `8d491c0b` | 2026-09-11 | CMPU: set N from the unsigned borrow, together with C | left out |  | CMPU: never compiled by MD/MM (probe) |
| `848923e5` | 2026-09-11 | Implement ADC and SBC in the interpreter and the JIT | left out |  | ADC/SBC: never compiled by MD/MM (probe) |
| `e8b56f7f` | 2026-09-12 | Audio: publish the callback atomically instead of assigning it in place | copied | `ec54ea98d` | audio callback published atomically (rare bad_function_call abort when a device is torn down with live DSP threads) |
| `f77d69d4` | 2026-09-12 | Logging: stop and join the logger thread at exit | copied | `636e9b1cf` | file logger thread is joined at exit (every process that wrote a log line aborted on exit) |
| `6a37034d` | 2026-09-15 | JitTrampoline: attach the asmjit logger only with asmjitDiagnostics | copied | `b131961b7` | asmjit logger only with asmjitDiagnostics |
| `b58e26b6` | 2026-09-15 | ESAI: log a transmit underrun when it starts and ends in a slot, not on every fr | left out |  | ESAI and ESAI clock (DSP56362/56367); MD/MM use ESSI |
| `c2b2e459` | 2026-09-15 | JIT: make volatile P memory tracking a JitConfig option | left out |  | new JitConfig option, default behaviour unchanged |
| `33fc9e66` | 2026-09-15 | DspBoot: invalidate the decoded opcode cache of booted code, not only the JIT | left out |  | DspBoot (boot of a second program into a running DSP); not used by us |
| `0c151436` | 2026-09-15 | JIT: report ordinary code in the vector region with dynamicFastInterrupts disabl | left out |  | devices that run code in the vector region (dynamicFastInterrupts); MD/MM do not |
| `51c5a452` | 2026-09-15 | Implement MOVE(M) with an absolute short address in the interpreter and the JIT | left out |  | MOVE(M) aa / MOVEP P forms: never reach an unimplemented path in MD/MM (probe) |
| `64a8dd31` | 2026-09-15 | Implement MOVEP between P memory and the low I/O addresses in the interpreter an | left out |  | MOVE(M) aa / MOVEP P forms: never reach an unimplemented path in MD/MM (probe) |
| `95347029` | 2026-09-15 | DspBoot: invalidate the decoded opcode cache of booted code, not only the JIT | left out |  | DspBoot (boot of a second program into a running DSP); not used by us |
| `92ef91d4` | 2026-09-15 | JIT: report ordinary code in the vector region with dynamicFastInterrupts disabl | left out |  | devices that run code in the vector region (dynamicFastInterrupts); MD/MM do not |
| `cb075bf9` | 2026-09-15 | Implement DOR aa in the JIT, DO FOREVER in the interpreter, MACRI, LRA Rn, TRAP, | left out |  | DO FOREVER / DOR aa / MACRI / LRA / TRAP forms: no unimplemented-instruction hit in any of the six golden scenarios (probe), dor and mpyri are used and already run |
| `23242f03` | 2026-09-15 | JIT: let an LA write move the end of the running loop | left out |  | LA written by a fast interrupt (Virus main loop); MD/MM do not |
| `46aa691d` | 2026-09-15 | Register analysis: MOVEP from an I/O address writes its destination register | left out |  | LA written by a fast interrupt (Virus main loop); MD/MM do not |
| `a80242bf` | 2026-09-16 | DSP: query whether a specific interrupt is pending | left out |  | device / assembler API additions |
| `ce9e1380` | 2026-09-17 | assembler: TFR/CMP/CMPM/Tcc encode the other accumulator as JJJ=000 | left out |  | device / assembler API additions |
| `32e69133` | 2026-09-17 | JIT: CMPM must not leave the magnitude of the other accumulator in its register | left out |  | CMPM: we have our own fix (DSP::setJitCmpmFix, behind the speed-ups switch) |
| `cbb2398e` | 2026-09-17 | JIT: bring the peripherals up to date before an instruction that accesses one | left out |  | OPEN: the JIT runs due peripherals before an instruction that accesses one. A timing change of the same family as L3 (moves ESSI/HDI08/DMA events); conflicts with our scheduler work; would change the sound |
| `365fbb16` | 2026-09-17 | DMA: serve a request that was raised before the channel was enabled | left out |  | DMA pending request rule for the DSP56362; our DMA has its own MD rule |
| `8ae1681e` | 2026-09-17 | ESAI: a transmitter that joins running ones adds no slot | left out |  | ESAI and ESAI clock (DSP56362/56367); MD/MM use ESSI |
| `b7ce5603` | 2026-09-17 | MOVE x:aa,D and y:aa,D take one clock cycle | left out |  | cycle count of MOVE x:aa,D |
| `5f22528a` | 2026-09-17 | JIT: do not build an instruction over a block that starts on one of its later wo | left out |  | JIT block scanner / loop edge cases (self-modifying code, jumps into a loop tail, interrupts at an iteration boundary); none is reached by MD/MM, and jitblock.cpp carries our L4 work |
| `1205d060` | 2026-09-17 | JIT: keep the code of a destroyed block until generated code has returned | left out |  | JIT block scanner / loop edge cases (self-modifying code, jumps into a loop tail, interrupts at an iteration boundary); none is reached by MD/MM, and jitblock.cpp carries our L4 work |
| `623c6bce` | 2026-09-18 | Peripherals: a deadline set by one peripheral is not postponed by another | left out |  | OPEN: "a deadline only moves closer" moves the MD playing audio and the MM hashes (experiment); not explainable without hardware, same family as L3 |
| `ddcb6ea5` | 2026-09-18 | ESAI clock: serve slots when they are due, not in bursts | left out |  | ESAI and ESAI clock (DSP56362/56367); MD/MM use ESSI |
| `a33da8d3` | 2026-09-18 | ESAI clock: start over when the DSP is reset | left out |  | ESAI and ESAI clock (DSP56362/56367); MD/MM use ESSI |
| `2117ee05` | 2026-09-18 | DMA: two-dimensional and no-update address modes, a delayed transfer is not stra | left out |  | new DMA modes (2D/3D, request-triggered blocks, DSP56367 ESAI); MD/MM use word transfers |
| `4f2a9cf0` | 2026-09-18 | HDI08Queue: hold a data word until the DSP has seen the host flag change before  | left out |  | HDI08Queue host-command API and its ordering rules (made for hosts that talk through it); depends on cbb2398e for 4f2a9cf0 |
| `e643fa89` | 2026-09-20 | Revert "ESAI clock: serve slots when they are due, not in bursts" | left out |  | ESAI and ESAI clock (DSP56362/56367); MD/MM use ESSI |
| `97530405` | 2026-09-21 | ESAI clock: convert its delay with the cycles per instruction it measures | left out |  | ESAI and ESAI clock (DSP56362/56367); MD/MM use ESSI |
| `57c70182` | 2026-09-21 | Profiler facade, with Superluminal wired into it | left out |  | profiler facade / audio workgroup (tooling) |
| `c6154642` | 2026-09-20 | DspBoot: boot a new program into a DSP that is already running one | left out |  | DspBoot (boot of a second program into a running DSP); not used by us |
| `64757e04` | 2026-09-20 | HDI08: do not log a discarded transmit word identical to the new one | left out |  | already in our tree (verified by reading the code) |
| `989d49f2` | 2026-09-20 | Peripherals56362: make the derivative number of the ID register settable | left out |  | DSP56362 ID register |
| `1393c573` | 2026-09-21 | DMA: the second ESAI of a DSP56367 has its own request sources | left out |  | new DMA modes (2D/3D, request-triggered blocks, DSP56367 ESAI); MD/MM use word transfers |
| `95f6fdd7` | 2026-09-21 | DSPThread: install the callback before the worker starts | left out |  | device / assembler API additions |
| `8ccdd843` | 2026-09-21 | JIT: drop the unsound converse assert on loop body begins | left out |  | assert / comment only (debug builds) |
| `6976b7f9` | 2026-09-23 | SHI: peekTx() returns the word the next transfer shifts out | left out |  | DSP56362 serial host interface |
| `72ece5c7` | 2026-09-23 | HDI08: callback on writes to HDR | left out |  | device / assembler API additions |
| `d6e45147` | 2026-09-23 | DMA: block transfers triggered by request, "transfer done" as a request source | left out |  | new DMA modes (2D/3D, request-triggered blocks, DSP56367 ESAI); MD/MM use word transfers |
| `d81d7857` | 2026-09-23 | JIT: report a P memory write that ends a DO loop | left out |  | JIT block scanner / loop edge cases (self-modifying code, jumps into a loop tail, interrupts at an iteration boundary); none is reached by MD/MM, and jitblock.cpp carries our L4 work |
| `2afc1c4f` | 2026-09-24 | ESAI: even slot interrupts, and the flags behind them | left out |  | ESAI and ESAI clock (DSP56362/56367); MD/MM use ESSI |
| `3cee91c9` | 2026-09-25 | DMA: a channel enabled together with a new request source waits for the next req | left out |  | DMA pending request rule for the DSP56362; our DMA has its own MD rule |
| `e4ce62ad` | 2026-09-25 | DMA: unit test for a request that is raised when a channel is enabled | left out |  | test only for the DMA pending-request rule of 365fbb16/3cee91c9 |
| `ebc6c147` | 2026-09-25 | Build as 32 bit again, interpreter only | left out |  | device boot ROM jump / 32 bit interpreter build |
| `99c11261` | 2026-09-25 | DMA: writes into an external bus device's range go to the device | left out |  | external bus device (Virus board hardware); MD/MM have none |
| `faef176c` | 2026-09-26 | ESAI: reset clears TDE and TFS | left out |  | ESAI and ESAI clock (DSP56362/56367); MD/MM use ESSI |
| `fd087196` | 2026-09-26 | JIT: a branch out of P memory is fine while blocks are not linked | left out |  | device boot ROM jump / 32 bit interpreter build |
| `4f15f23c` | 2026-09-26 | Threads can join the audio workgroup of the host | left out |  | profiler facade / audio workgroup (tooling) |
| `75a86b6b` | 2026-09-26 | HDI08: stopping the DSP no longer hands it host words that nobody sent | copied | `a8218b007` | terminate() no longer feeds 8192 invented zero words to the HDI08 |
| `c29028f2` | 2026-09-26 | DMA: the 56303 serves a raised request like the 56362, ESSI reset clears TDE and | copied | `e9f6f6cf4` | ESSI half only: TDE and TFS start at 0. The DMA half is our own rule already (hasPendingReceiveDmaRequest) |
| `4858fd83` | 2026-09-27 | Memory: mirrors of external memory below the bridged address | left out |  | memory mirror device feature |
| `823e697c` | 2026-09-27 | Interrupts: the peripherals keep running while a masked interrupt waits | left out |  | already in our tree (verified by reading the code) |
| `8506df77` | 2026-09-27 | DSP: writeReg writes every register that readReg reads | left out |  | device / assembler API additions |
| `e8989e41` | 2026-09-28 | JIT: fast forward serial status polls on TDE and RDF, not only on the frame sync | left out |  | serial status poll fast-forward: judged in RESEARCH-emulation-cpu section 5 (no block tests an ESSI status register) |
| `882b9225` | 2026-09-23 | ESSI clock: optional callback once per slot, for boards that derive a clock from | left out |  | ESAI and ESAI clock (DSP56362/56367); MD/MM use ESSI |
| `fdd98fc5` | 2026-09-29 | AGU: the interpreter compares the modulo bounds signed, as the JIT does | copied | `981ab9869` | interpreter modulo compare signed, like the JIT (parity for the unit tests) |
| `cfcb2d85` | 2026-09-29 | AudioWorkgroup: std::atomic<uint32_t> is complete before s_generation, MSVC /LTC | left out |  | profiler facade / audio workgroup (tooling) |
| `4ebb896d` | 2026-09-29 | ESAI: SAICR reads back what the DSP wrote | left out |  | ESAI and ESAI clock (DSP56362/56367); MD/MM use ESSI |
| `1d4cc7f1` | 2026-09-29 | SHI: reset sets HTDE, and an empty HTX requests the transmit interrupt | left out |  | DSP56362 serial host interface |
| `44353be2` | 2026-09-30 | ESAI clock: a slot waits until the DSP has taken the request of the slot before  | left out |  | ESAI and ESAI clock (DSP56362/56367); MD/MM use ESSI |
| `d26552ab` | 2026-10-05 | Transfers: Scale Up limits with the sign of the accumulator | copied | `423909d62` | Scale Up transfers limit with the accumulator's sign; 64 bit compare (17 block compiles in the MD/MM busy scenarios run Scale Up). Sixteen-bit Arithmetic lines left out |
| `56e2632d` | 2026-10-05 | Interpreter: a DO loop ends at the fetch of its last word, not wherever PC meets | left out |  | interpreter-only fixes (MD/MM run the JIT) |
| `8a654fd5` | 2026-10-05 | Interpreter: MOVEP pp,ea reaches a peripheral on the ea side too | left out |  | interpreter-only fixes (MD/MM run the JIT) |
| `c1d6593f` | 2026-10-05 | HDI08: HSR is read-only for the DSP | copied | `3f4329947` | HSR is read-only for the DSP (goldens unchanged, so MD/MM never wrote it) |
| `90d3af66` | 2026-10-06 | BUG-10217: MmuHelper (Linux/macOS): unmapping a region no longer frees its addre | copied | `e9a32143d` | macOS/Linux MmuHelper: a second thread can no longer take the address range between munmap and MAP_FIXED |
| `80bd6c6a` | 2026-10-08 | JIT: a loop that becomes known recompiles the code holding its LA | left out |  | JIT block scanner / loop edge cases (self-modifying code, jumps into a loop tail, interrupts at an iteration boundary); none is reached by MD/MM, and jitblock.cpp carries our L4 work |
| `c0976cbc` | 2026-10-08 | JIT: a loop ends at its LA only while it is the loop that runs | left out |  | JIT block scanner / loop edge cases (self-modifying code, jumps into a loop tail, interrupts at an iteration boundary); none is reached by MD/MM, and jitblock.cpp carries our L4 work |
| `77b5be51` | 2026-10-08 | ESAI: the receive last slot interrupt | left out |  | ESAI and ESAI clock (DSP56362/56367); MD/MM use ESSI |
| `dc89cdff` | 2026-10-08 | Opcodes: an undefined operation code runs as ILLEGAL | left out |  | undefined opcodes as ILLEGAL: robustness for junk code; MD/MM never execute an undefined word |
| `cdaabf25` | 2026-10-08 | DSP: a P write the JIT reports outside the opcode cache is skipped | left out |  | undefined opcodes as ILLEGAL: robustness for junk code; MD/MM never execute an undefined word |
| `2dee93df` | 2026-10-07 | GPIO output read-back, timer input pin, Port E on the 56367 Y space, Y I/O exten | left out |  | GPIO / timer capture / board hooks (DSP56367, boards) |
| `00c2eb0b` | 2026-10-07 | Timers: capture mode reacts to TIO edges; peripherals: exec callback for board l | left out |  | GPIO / timer capture / board hooks (DSP56367, boards) |
| `37f8d809` | 2026-10-07 | Timers: the compare event is the count on which TCR reaches TCPR | left out |  | timers; MD/MM never touch them (probe: no timer register write) |
| `ec40084d` | 2026-10-08 | ESAI: a write to the time slot register | left out |  | ESAI and ESAI clock (DSP56362/56367); MD/MM use ESSI |
| `401b44da` | 2026-10-08 | JIT: debug stores in the middle of a block keep the registers it goes on with | left out |  | debug stores of ILLEGAL/TRAP/DEBUG |
| `d328033e` | 2026-10-08 | Timers: a PWM compare fires only when the counter reaches TCPR | left out |  | timers; MD/MM never touch them (probe: no timer register write) |
| `2277d332` | 2026-10-08 | Timers: a TCPR of zero restarts TRM on the wrap | left out |  | timers; MD/MM never touch them (probe: no timer register write) |
| `f8beadd1` | 2026-10-08 | Timers: an odd instruction count no longer loses half a timer clock | left out |  | timers; MD/MM never touch them (probe: no timer register write) |
| `3db853a2` | 2026-10-08 | Timers: a TRM period is one count longer than the distance from TLR | left out |  | timers; MD/MM never touch them (probe: no timer register write) |
| `cb9895c1` | 2026-10-08 | Undefined opcodes no longer stop in a debugger | left out |  | undefined opcodes as ILLEGAL: robustness for junk code; MD/MM never execute an undefined word |
| `ac901f46` | 2026-10-09 | JIT: a DO loop can leave its block while an interrupt is queued | left out |  | JIT block scanner / loop edge cases (self-modifying code, jumps into a loop tail, interrupts at an iteration boundary); none is reached by MD/MM, and jitblock.cpp carries our L4 work |
| `12380439` | 2026-10-09 | HDI08Queue: host commands, in order with the words and flags around them | left out |  | HDI08Queue host-command API and its ordering rules (made for hosts that talk through it); depends on cbb2398e for 4f2a9cf0 |
| `c8026cde` | 2026-10-09 | SharedAudioReducer: a completed frame wakes producers only if one waits, perf mo | left out |  | SharedAudioReducer is not used |
| `02784dc6` | 2026-10-09 | Interrupts: host commands wait for room instead of overrunning the pending ring | left out |  | HDI08Queue host-command API and its ordering rules (made for hosts that talk through it); depends on cbb2398e for 4f2a9cf0 |
| `7a5390e7` | 2026-10-09 | EMU-118: undefined parallel words run as the reference simulator runs them | left out |  | undefined opcodes as ILLEGAL: robustness for junk code; MD/MM never execute an undefined word |
| `c4b99b8b` | 2026-10-12 | EMU-115: DMA: a two- or three-dimensional block triggered by DE completes after  | left out |  | new DMA modes (2D/3D, request-triggered blocks, DSP56367 ESAI); MD/MM use word transfers |
| `da2ff232` | 2026-10-12 | EMU-116: JIT: a DO loop body block that writes an Mn or the MR leaves the block  | left out |  | JIT block scanner / loop edge cases (self-modifying code, jumps into a loop tail, interrupts at an iteration boundary); none is reached by MD/MM, and jitblock.cpp carries our L4 work |
| `9a7c85bd` | 2026-10-14 | JIT: the block chain's destructor visits only the cache blocks that were written | left out |  | our JIT cache is a PagedArray: it already visits only allocated pages; the shared-page write needs a block at a 16384-word region end |
| `0155c135` | 2026-10-14 | Audio: the output frames of a block are waited for at once, and SpscSemaphoreWit | copied | `a51e0837f` | audio frames of a block waited for at once (one wake per block); copied for the sync, no measurable gain for MD/MM (nothing of ours calls processAudioOutput, see below) |
| `2a7ca1e9` | 2026-10-14 | JIT: a block that starts at the last address of an untouched region of the block | left out |  | our JIT cache is a PagedArray: it already visits only allocated pages; the shared-page write needs a block at a 16384-word region end |

**Also copied, older than the list:** `36efd0fd` (JIT `max a,b x1,a` dropped the move into A; the test of `7bb68a1f` failed
without it).

**Open (left out because they move the sound or cost speed without a hardware reference; Radek decides):**

- `cbb2398e`: the JIT runs the due peripherals before every instruction that accesses one. Timing semantics of the L3
  family; conflicts with jitblock.cpp (L4); would move ESSI/HDI08/DMA events.
- `623c6bce`: a peripheral's deadline only moves closer (ours keeps `min(stored, new)` re-anchored at now, the "halving"
  of RESEARCH 3.4). Tried: the MD playing audio, RAM and MIDI-out hashes and the MM hashes change. Same family as L3.
- `b7ce5603`: `move x:aa,D` and `y:aa,D` count one cycle (table A-1 is garbled there). Tried: both machines' hashes move.
- `65406f8f` (V and L for ADD, SUB, CMP, plus ROL/LSL/CLB/48 bit transfer fixes): our tree has V/L for ABS, ADDL, INC,
  DEC and NEG already; ADD/SUB/CMP keep V clear. Tried on AArch64 (V from the host flag, L by V): all 30 goldens stay
  equal in md-busy/mm-busy, about 1 % more instructions. Upstream emits it out of line behind a stub machinery that
  needs the whole commit. Not worth a percent for no observed effect; the unit test ccrGroundTruth of upstream HEAD
  fails on these cases (`add b,a max + 1`, `sub` and `cmp` overflow).
- `31ee15c0` also carries x64 JIT shift-count and NORM-carry fixes inside the Sixteen-bit Arithmetic work; not split out
  (x64 builds only; `normf`'s carry is covered by `e32c7059`). Worth a look when the x64 builds get a golden of their own.
- **AArch64 `transferSaturation48` under Scale Up, mode not known at compile time** (found by the reviewer, fixed upstream
  inside `65406f8f`): the left-aligned value is scaled up before it is sign-extended, so bit 55 leaves the host word and
  the limit takes the wrong sign (x64 is right). A small fix exists (sign-extend with `asr 8` first, drop the last
  `asr 8` of that path) but could not be built and checked here, so it is not in the branch.
- `f50b4dc7` and `e8b56f7f` (8 MB DSP thread stack, atomic audio callback) help `DSPThread` users; MD/MM run both
  DSPs on the calling thread and never create a `DSPThread`, so they change nothing for the editors.
- `0155c135` needs a single waiter per semaphore (it wakes one waiter per block). Every user in our tree has one.
- Older upstream commits (before 2026-08-31) were not audited one by one.

**Why the headline commit buys little here.** `0155c135` (audio frames waited for at once, `SpscSemaphoreWithCount` wakes
once per block) speeds up `Audio::processAudioOutput` for a host thread that pulls a device's output frames. Nothing in
our code calls `processAudioOutput` (grep over source/elektron, source/synthLib and the dsp56300 folder: only audio.h
itself), and our DSP-to-DSP and codec rings already run single-threaded without their semaphores (LINK_RINGS). The one
`SpscSemaphoreWithCount` the PGO profile still shows is the HDI08 FIFO. The commit is copied anyway (correct, builds,
keeps the next upstream sync clean); the measured gain of the batch is small and comes from the JIT optimisations
(`503b0c98`, MD instructions per frame about -1 %), see RESEARCH-emulation-cpu.md section 5.

**Checked at the end (HEAD of the branch):** 30 of 30 playing goldens equal (24 + the 6 exact-ESSI keys, MD and MM,
speed-ups on and off), dsp56kTestRunner, accumulator and ESSI-on-demand tests green on arm64 and x86_64 (Rosetta).

## Upstream fixes copied for 0.8.1

One commit each, bit-exact (audit of 2026-10-28). Validation runs on CI.

| Upstream | Date | What | Decision | Our commit | Reason |
|---|---|---|---|---|---|
| dsp56300/mc68k `a2cbb6b` | 2026-10-13 | Musashi opcode table built once under `std::call_once` | copied | `42cdda832` | two instances booting together (two plug-ins in one host) ran into a half-built table; the guard sits in `Mc68k::Mc68k` |
| dsp56300/dsp56300 `3ff6610d` | 2026-10-13 | HDI08 pending host flags taken with one `exchange(-1)` | copied | `304bdcedf` | a flag change stored between the load and the reset was lost |
| dsp56300/gearmulator `8b2f9db1` | 2026-09-12 | `AudioBuffer::append` with size 0 | copied | `30f7a449b` | `_dst[oldSize]` one past the end aborts under `_GLIBCXX_ASSERTIONS` |

## Fixes to offer upstream

The fork carries these fixes in upstream files (the hooks above). Each is worth a pull request, so that the hook can
go:

- **to dsp56300/gearmulator** (the shared code; joelanders merges it from there):
  - `synthLib/plugin.cpp`: the MIDI ring checked again under the process lock before `addMidiEvent` pops (one `if`).
  - `jucePluginLib/processor.cpp`: `requestLatencyUpdate()` after a resampler mode or device rate change.
  - the MCP server: loopback and the Host and Origin check without CORS; `httpServer`'s shutdown, reaping, limits
    and idle timeout; the SSE wait woken by `stop()`; tool handlers outside the mutex; the `send_note` clamp; the
    accept thread's `std::exception` catch in `networkLib`.
- **to joelanders/gearmulator-md-mm**: the state save outside the lock (`Device::StateCapture` beside his
  `StateTransaction`, the Machinedrum's capture, the factory baseline decoded once, the CRC by tables); the three
  `std::pmr` SysEx test fixes (Linux).

## Syncing

- `scripts/mdmm-sync-upstream.sh` (on the `chore/upstream-sync-oss-prep` branch) fetches upstream
  and merges it.
- Before and after a merge, run `scripts/mdmm-upstream-footprint.sh` (`--committed` for HEAD only):
  the list should stay the hooks above. A conflict in a hook is resolved by taking his side and
  putting the hook back.
- To see what a branch or PR of his would do before it lands:
  `git merge-tree --write-tree --name-only HEAD upstream/<branch>` (a commit is needed; for
  uncommitted work, make one with `git commit-tree` on a temporary index).
