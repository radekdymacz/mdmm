# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## This project: Machinedrum Editor + Monomachine Editor

`origin` (radekdymacz/mdmm, default branch `main`) started as a fork of joelanders' Machinedrum/Monomachine emulation (joelanders/gearmulator-md-mm), which is built on dsp56300/gearmulator. Since 0.5 it stands alone (doc/release/PLAN-0.5.md, doc/ROADMAP.md D3-D5): the DSP56300 emulator (`source/dsp56300`), the 68k core (`source/mc68k`), JUCE (`source/JUCE`) and RmlUi (`source/3rdparty/RmlUi`) are plain folders we own (each README says where it came from); upstream fixes are copied one commit at a time, never merged. The product is two editors (standalone, VST3, AU on macOS; Windows and Linux builds exist, not tested) that run the user's own Elektron firmware behind one web page. ROMs are never committed. 

- **Read first:** doc/modern-ux/FOUNDATION.md (the layers; how to add an engine, document kind, command, workspace or dialog; "Build and check"), doc/modern-ux/DESIGN-P6-simple-core.md (why), doc/modern-ux/UPSTREAM.md (history: how the fork lived on top of upstream until 0.5).
- **Where:** source/elektron/md/: elektronData, deskCore, deskHost, deskWire, mdDesk, mmDesk, mdDataLink, mdmmUpdate, mdLib (the emulated machines), mdJucePlugin (plug-ins, bridge, skins/ page files; the Monomachine page's sources are skins/mmStudio/src, their order src/page.txt, generated into mmMockup.js by doc/modern-ux/sync-mmstudio-skin.py; the browser mockup doc/modern-ux/mm-mockup adds its demo), mdLibTest, upstreamTests (our tests for the shared synthLib code). Version: `MDMM_EDITOR_VERSION` in mdJucePlugin/mdmmPlugins.cmake; product names: scripts/mdmm-product.env.
- **Build:** `scripts/mdmm-dev.sh configure|build [target...]|tests|stats` (tree temp/dev, ccache, diagnostics on). Release packages: scripts/macos/build_mdmm.sh, scripts/linux/build_mdmm.sh, scripts/windows/build_mdmm.ps1. CMake 3.22 or newer.
- **Check:** locally only `scripts/mdmm-check.sh --quick` for the change; everything else runs on CI ("Development lifecycle" below). The old local gates (`scripts/mdmm-full-gate.sh`, doc/release/LOCAL-GATE.md, `scripts/mdmm-dev.sh tests`) are kept for a broken CI only; firmware tests need your ROM (`GEARMULATOR_MD_FIRMWARE_BIN`, `GEARMULATOR_MM_FIRMWARE_BIN`); scripts/mdmm-page.mjs (page journeys, no ROM), scripts/mdmm-journeys.sh, scripts/mdmm-pluginval.sh.
- **Floats:** Release builds are `-Ofast` (`/fp:fast`): `std::isfinite`/`std::isnan` can fold to constants. Use `baseLib::isFinite` and put code that must see NaN on `-fno-fast-math` (examples: source/elektron/md/elektronData/CMakeLists.txt).
- **Emulation CPU:** the plan and measured results are in doc/modern-ux/RESEARCH-emulation-cpu.md. Every speed-up is bit-exact, on by default and behind one umbrella switch (`GEARMULATOR_MDMM_SPEEDUPS=0`, or Developer > Speed-ups, ticked = on); anything that changes the sound is opt-in and off by default (L3: `GEARMULATOR_MDMM_EXACT_ESSI=1`). macOS release builds use a committed PGO profile (retrain with scripts/macos/train_mdmm_pgo.sh when the build says stale). Switches: doc/md_mm_performance_diagnostics.md, "Switches for testers".
- **Status and plan:** doc/ROADMAP.md (decisions, CPU plan, the 1.0 gate and what is left); the current release's plan in doc/release/PLAN-0.x.md.
- **Plug-in identity:** set once in scripts/mdmm-product.env (AU `FNAu` with `Mded`/`Mmed` since 0.5.1, so the original Gearmulator MD/MM plug-ins can be installed beside the editors). Changing it orphans saved DAW projects: only with Radek's decision.
- **Submodules:** only freetype and lunasvg remain, pinned to their own upstream projects (unmodified third-party code we never change); everything we change is a plain folder.
- **Releases:** `release/0.x.y` branches are merged into `main`; before tagging, `mdmm-ci.yml` must be green on the release commit (checks, page/core, editors, firmware, packages). The tag `mdmm-v0.x.y` runs .github/workflows/mdmm-editors-release.yml, which requires that green run; notes in doc/release/vX.Y.Z.md; bugs and ideas in doc/release/BUGS.md and IDEAS.md (testers are never named).

## Current state

0.7.0 was released on 2026-10-15. **0.8.0 (the MIDI release) is being cut** (state 2026-10-18). Radek's rules: every fix goes into 0.8.0; the tag waits for his hand test.

- **Done:** every 0.8 branch is on main and main is merged into `release/0.8.0` (worktree `audio/gearmulator-md-mm-wt/release-0.8.0`): MIDI, MIDI Learn, the lock-free audio, the MD and MM slide rules (firmware probes w13slide, w13mmslide), B-168, the dsp56300 upstream batch (28 fixes, goldens 30/30 equal, CPU about -1 %; doc/modern-ux/UPSTREAM.md). Notes: doc/release/v0.8.0.md. The full CI on the release merge is green (page suite, editors, automation core).
- **Packages come from CI, not a local build** (Radek, 2026-10-18): `gh workflow run mdmm-editors-release.yml -R radekdymacz/mdmm --ref release/0.8.0 -f dry_run=true`, download the artifacts, install user-level (~/Applications, ~/Library/Audio/Plug-Ins/{VST3,Components}, `killall AudioComponentRegistrar`). Dry run started 2026-10-18: run 39104857999.
- **Latest handover (2026-10-18):** Radek's hand test passed; he approved cutting 0.8.0 once CI is green. B-169 parts 1 and 2 are on main, as are the firmware workflow fixes (`cc5d001ff`). The release branch still needs those commits. The staged pipeline from `ci/0.8-pipeline-order` is being completed on `codex/continue-0.8.0`: stage 3 reuses the macOS test tree and package creation waits for firmware. The E2E archives must contain the apps in `bin/plugins/Release/Standalone`, not just the CMake build directory.
- **Left before the tag:** get the firmware checks green; validate and merge the staged pipeline; dispatch firmware CI with `train_pgo=true`, download `pgo-profile` and commit both profile files; merge main into `release/0.8.0`, push, and wait for its whole pipeline (including the package dry run). Tag `mdmm-v0.8.0` on that tested head, merge to main, publish when the files are attached, ask Radek to deploy the site; the Discord post only after his OK. See doc/release/CI.md for failures and the fixture exclusion.
- **Open for after 0.8.0:** dsp56300 cbb2398e, 623c6bce, b7ce5603 change the sound (Radek decides); an unverified AArch64 48-bit patch (audio/gearmulator-md-mm-wt/ds-aarch64-48bit-unverified.patch); upstream commits before about 2026-08-25 not audited one by one.
- **This Mac (2026-10-18):** opening some folders and files under ~/Documents froze (cmake, shasum, the MD ROM in Gearmulator Preview). A local build works from a worktree outside it (~/mdmm-rel) with ROM copies in ~/mdmm-roms.

No auto-update (Radek, 2026-10-15): the check stays, install stays off.

## Sister product: xox-plocks

`audio/xox-plocks` (private, `FutureNativeAudio/xox-plocks`) is a closed-source MIDI-out sequencer with this page's grid. Feature parity on the grid is kept by copying code and ideas both ways, never by forking or a shared library. When a grid feature ships here, update its row in `audio/xox-plocks/PARITY.md`. Code may go there only from files Radek wrote alone (its VENDOR.md); code from there may come here as it is.

## Shared code (emulation, JUCE and CMake)

Since 0.5 the tree holds only the two editors and what they need; the other synths, VST2/CLAP/LV2, the consoles
and upstream's deploy scripts and workflows are gone (their history is in the tag `pre-cleanup-0.5`).

**Emulation stack:** DSP56300 emulator (`source/dsp56300/`, JIT via asmjit) + ColdFire/68k core (`source/mc68k/`,
Musashi). `source/elektron/md/mdLib` loads the firmware ROM, sets up processor memory and handles MIDI and audio
via HDI08.

**Shared libraries:**
- `synthLib/` — Device base class, DAC, resampling, MIDI routing
- `jucePluginLib/` — Parameter system, MIDI Learn, Patch Manager, program change routing
- `jucePluginEditorLib/` — Plugin editor UI, parameter overlays, settings pages
- `juceRmlUi/`, `juceRmlPlugin/`, `juceUiLib/` — RmlUi integration (HTML/CSS-like UI framework)
- `baseLib/` — Filesystem, logging, events, binary streams
- `hardwareLib/` — LCD, buttons, encoders abstractions
- `pluginTester/`, `midiLearnTest/` — plug-in host and MIDI-learn tests

**Plugin build flow:** `createJucePlugin()` in `source/juce.cmake` (VST3, AU, Standalone), called from
`source/elektron/md/mdJucePlugin/CMakeLists.txt` → Processor inherits `synthLib::Plugin` wrapping
`synthLib::Device` → skins compiled into binary data.

## Code Conventions

- **Tabs for indentation** (tab size 4, UseTab: Always), 120 char column limit
- **Braces on new lines** for all constructs; namespace content indented
- **Naming:** PascalCase classes, camelCase functions/vars, `m_` member prefix, `_` parameter prefix (`void func(int _param)`)
- **Namespaces:** camelCase (`mdLib`, `synthLib`, `dsp56k`)
- **Early returns** preferred over deep nesting
- `.clang-format` in `source/` directory
- C++17 required

## Git Conventions

- Do NOT include `Co-authored-by` trailers in commit messages
- Do NOT commit without explicit user approval
- Remote here: `origin` (radekdymacz) only. The `upstream` (joelanders) and `gearmulator` (dsp56300) remotes were dropped in 0.5; the list that was here (`private`, `nas`, `codeberg`, `EvilDragon`) is the upstream author's.
- The DSP emulator (`source/dsp56300/`), the 68k core, JUCE and RmlUi are plain folders of this repository (no longer submodules): changes there are fine

## Key Build Files

- `base.cmake` — Compiler flags, platform-specific optimization settings
- `source/juce.cmake` — JUCE plugin configuration and multi-format support
- `source/skins.cmake` — Skin asset compilation
- `.github/workflows/mdmm-*.yml` — CI (GitHub Actions), doc/release/CI.md

## Where to Make Changes

1. **The machines** → `source/elektron/md/mdLib/`
2. **Plugin and page** → `source/elektron/md/mdJucePlugin/` (processor, skins/ page files), the desk libraries beside it
3. **Shared plugin infra** → `jucePluginLib/` or `synthLib/`
4. **DSP emulator** → `dsp56300/source/dsp56kEmu/`

## Critical Implementation Details

- **State save/restore:** Device `getState()` MUST append to `_state` vector with `insert()`, never `assign()` — the Plugin layer prepends version headers
- **RmlUi threading:** DOM modifications MUST happen on JUCE message thread. Use `juce::MessageManager::callAsync` from audio/MIDI callbacks
- **callAsync safety:** Use static instance-set pattern to guard lambdas against use-after-free

## Detailed Reference

MIDI Learn: doc/midilearn/. Upstream's long AI notes (`.github/copilot-instructions.md`: Jenkins, YouTrack, the other synths) were deleted in 0.5; they are in the tag `pre-cleanup-0.5`.

## Development lifecycle (rule of 2026-10-18: develop locally, test on CI; details: doc/release/DEV-CYCLE.md, doc/release/CI.md)

**Local is for developing. CI is for testing and packages.** The Mac is shared with other sessions and the weekly budget is finite: no local test suites, gates or release builds. What changed decides what CI runs (`scripts/mdmm-affected.tsv`).

- **While developing (local):** build the target you change (`scripts/mdmm-dev.sh build <target>`) and run only that change's own test (`scripts/mdmm-check.sh --quick`, narrowed by area; `--save` or `--watch` for seconds). Claude runs it before it says a change is good. Nothing bigger locally.
- **Design and interaction work (local):** `scripts/mdmm-preview.sh md|mm` (or `page-md`, `page-mm` in `.claude/launch.json`): the real page on the stub, no ROM or app build, live reload on save. Check with `scripts/mdmm-check.sh --quick`, not by eye alone.
- **Testing (CI):** `mdmm-ci.yml` runs on main and release pushes: checks → page/core → editors on macOS, Windows and Linux → firmware → packages (release only). Run it by hand for a feature branch (firmware requires main or release/*). Read the result with `gh run list -R radekdymacz/mdmm -b <branch>` and `gh run view <id> --log-failed`; wait with one `gh run watch <id> --exit-status` in the background, never a polling loop. Windows-only code: a `feat/windows-*` branch. The CI nightly runs the full CI on main.
- **Packages (CI):** hand-test packages come from the release workflow's dry run, `gh workflow run mdmm-editors-release.yml -R radekdymacz/mdmm --ref release/0.x.y -f dry_run=true` (builds, tests and starts every package; attaches nothing). Download the `macos-mdmm-universal` artifact (`gh run download <id> -n macos-mdmm-universal`) and install user-level: `~/Applications`, `~/Library/Audio/Plug-Ins/{VST3,Components}`, then `killall AudioComponentRegistrar`. Never a local `build_mdmm.sh` for a release.
- **Firmware tests (CI):** the ROMs are served to GitHub Actions by a Cloudflare Worker that trusts only this repository's OIDC token (`ci/rom-worker`, doc/release/CI.md "Firmware tests on CI"). `mdmm-firmware.yml` runs every firmware ctest and the firmware E2E on push to `main` and `release/**`, nightly and by hand; read it like any other run. Local firmware runs (your own ROM) are for debugging a failure only, never routine.
- **Release:** merge main into `release/0.x.y`, push (the full CI once), the dry run above, the firmware workflow green on the release head, Radek's hand test, then tag the tested head (`mdmm-v0.x.y`, the release workflow builds and attaches), merge to main, push, publish when the files are attached, ask Radek to deploy the site (the Discord post waits for the page).
- **Editing the check or E2E scripts:** run their self-tests, `python3 scripts/mdmm-check.py --check-map` and `node scripts/mdmm-e2e-selftest.mjs`.

Journeys have a tier (`deskJourney.js` TIERS): page journeys run in the page tier, machine journeys in the editor, the VST3 host runs only the host ones. Do not add audits or verification rounds before a cut unless asked.

## Community: the mdmm.dev Discord server

Claude Code may check and manage the MD + MM Editor Discord server (invite https://discord.gg/8xwXwBHbtn) through the bot "MD + MM Editor": read channels, round up bugs and ideas into `doc/release/BUGS.md` / `IDEAS.md` (testers are never named in this public repo), create or tidy channels, and post in #dev-log, #general, #bugs, #ideas and #videos (#announcements only through its release webhook, which the release workflow uses; the bot itself may not post there). **Every post or reply is shown to Radek first, with the exact text and any images, and goes out only after his OK.** Posts are written as CC (Claude Code), never as Radek. House rules: `marketing/DISCORD.md`. The bot token lives in `~/.config/mdmm/discord-bot-token` (never print it or commit it); release notes reach #announcements by the release workflow's webhook.
