# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## This project: Machinedrum Editor + Monomachine Editor

`origin` (radekdymacz/mdmm, default branch `main`) started as a fork of joelanders' Machinedrum/Monomachine emulation (joelanders/gearmulator-md-mm), which is built on dsp56300/gearmulator. Since 0.5 it stands alone (doc/release/PLAN-0.5.md, doc/ROADMAP.md D3-D5): the DSP56300 emulator (`source/dsp56300`), the 68k core (`source/mc68k`), JUCE (`source/JUCE`) and RmlUi (`source/3rdparty/RmlUi`) are plain folders we own (each README says where it came from); upstream fixes are copied one commit at a time, never merged. The product is two editors (standalone, VST3, AU on macOS; Windows and Linux builds exist, not tested) that run the user's own Elektron firmware behind one web page. ROMs are never committed. 

- **Read first:** doc/modern-ux/FOUNDATION.md (the layers; how to add an engine, document kind, command, workspace or dialog; "Build and check"), doc/modern-ux/DESIGN-P6-simple-core.md (why), doc/modern-ux/UPSTREAM.md (history: how the fork lived on top of upstream until 0.5).
- **Where:** source/elektron/md/: elektronData, deskCore, deskHost, deskWire, mdDesk, mmDesk, mdDataLink, mdmmUpdate, mdLib (the emulated machines), mdJucePlugin (plug-ins, bridge, skins/ page files; the Monomachine page's sources are skins/mmStudio/src, their order src/page.txt, generated into mmMockup.js by doc/modern-ux/sync-mmstudio-skin.py; the browser mockup doc/modern-ux/mm-mockup adds its demo), mdLibTest, upstreamTests (our tests for the shared synthLib code). Version: `MDMM_EDITOR_VERSION` in mdJucePlugin/mdmmPlugins.cmake; product names: scripts/mdmm-product.env.
- **Build:** `scripts/mdmm-dev.sh configure|build [target...]|tests|stats` (tree temp/dev, ccache, diagnostics on). Release packages: scripts/macos/build_mdmm.sh, scripts/linux/build_mdmm.sh, scripts/windows/build_mdmm.ps1. CMake 3.22 or newer.
- **Check:** `scripts/mdmm-check.sh` (by what changed, below), `scripts/mdmm-dev.sh tests` (every unit test); **a release rests on the last green full gate on main plus the stages its diff touches** (`scripts/mdmm-full-gate.sh --plan`; the gate: doc/release/LOCAL-GATE.md); firmware tests need your ROM (`GEARMULATOR_MD_FIRMWARE_BIN`, `GEARMULATOR_MM_FIRMWARE_BIN`); scripts/mdmm-page.mjs (page journeys, no ROM), scripts/mdmm-journeys.sh, scripts/mdmm-pluginval.sh.
- **Floats:** Release builds are `-Ofast` (`/fp:fast`): `std::isfinite`/`std::isnan` can fold to constants. Use `baseLib::isFinite` and put code that must see NaN on `-fno-fast-math` (examples: source/elektron/md/elektronData/CMakeLists.txt).
- **Emulation CPU:** the plan and measured results are in doc/modern-ux/RESEARCH-emulation-cpu.md. Every speed-up is bit-exact, on by default and behind one umbrella switch (`GEARMULATOR_MDMM_SPEEDUPS=0`, or Developer > Speed-ups, ticked = on); anything that changes the sound is opt-in and off by default (L3: `GEARMULATOR_MDMM_EXACT_ESSI=1`). macOS release builds use a committed PGO profile (retrain with scripts/macos/train_mdmm_pgo.sh when the build says stale). Switches: doc/md_mm_performance_diagnostics.md, "Switches for testers".
- **Status and plan:** doc/ROADMAP.md (decisions, CPU plan, the 1.0 gate and what is left); the current release's plan in doc/release/PLAN-0.x.md.
- **Plug-in identity:** set once in scripts/mdmm-product.env (AU `FNAu` with `Mded`/`Mmed` since 0.5.1, so the original Gearmulator MD/MM plug-ins can be installed beside the editors). Changing it orphans saved DAW projects: only with Radek's decision.
- **Submodules:** only freetype and lunasvg remain, pinned to their own upstream projects (unmodified third-party code we never change); everything we change is a plain folder.
- **Releases:** `release/0.x.y` branches are merged into `main`; before tagging, the last green full gate on main plus the gate stages of the diff since (`scripts/mdmm-full-gate.sh --plan`), or the full `scripts/mdmm-local-gate.sh`; the tag `mdmm-v0.x.y` runs .github/workflows/mdmm-editors-release.yml; notes in doc/release/vX.Y.Z.md; bugs and ideas in doc/release/BUGS.md and IDEAS.md (testers are never named).

## Current state

0.7.0 was released on 2026-10-15. **0.8.0 (the MIDI release) is being cut** (2026-10-18): every 0.8 branch is merged to main and main is merged into `release/0.8.0` (worktree `audio/gearmulator-md-mm-wt/release-0.8.0`; version bump, notes doc/release/v0.8.0.md, the MD and MM slide rules, B-168, the dsp56300 upstream batch). Left before the tag: retrain the PGO profile (stale for dsp56kEmu/dsp56kBase after the batch), rerun the MD E2E journey `md-song-mode-cycle` (failed once on a loaded Mac), the local .pkg, Radek's hand test (doc/release/TEST-0.8.md), and only after his OK the tag `mdmm-v0.8.0`, the merge to main and the publish. On 2026-10-18 opening some folders and files under ~/Documents froze on this Mac (cmake, shasum): release builds ran from a worktree at ~/mdmm-rel with ROM copies in ~/mdmm-roms. No auto-update (Radek, 2026-10-15): the check stays, install stays off.

What 0.8 is (plan and status table: doc/release/PLAN-0.8.md; logs: doc/release/BUGS.md, IDEAS.md):
- **MIDI:** MD host notes go to the firmware MIDI input through the key map (B-163; notes outside the four base channels no longer play); the transport/clock/Program Change test through the processor (WP2); the MIDI monitor (`midi:` log line, `midiStats`); the standalone AUDIO / MIDI panel (input note, virtual-bus loop warning B-154, Bluetooth key B-155, monitor row); the same MIDI tests on all three OS in CI.
- **MIDI Learn is on** (design doc/midilearn/DESIGN-learn-0.8.md, user page doc/midilearn/midi_learn.md, threads doc/midilearn/THREADING.md): mappings saved only with the project (Radek, option A), realtime router on a seqlock table, CONTROL pages in both editors, overrides of the firmware CC map, off in the HW MIDI engine, alpha MDLN projects imported once.
- **Real time:** the audio thread never waits for the device lock (doc/modern-ux/DESIGN-audio-lock.md; `scripts/mdmm-rt-check.sh --lock` with a learn stream, 0 ms); memory copied in bounded parts as of one moment; a host save never gives up and never writes an empty machine chunk.
- **Sound:** stacked LFOs fixed (MD scheduler quantum 125 to 30 µs, goldens re-recorded with Radek's OK, B-161). B-133 is an OS 1.63 firmware bug: documented, NOT patched (Radek: the emulator stays like the hardware).
- **Page:** tabs PATTERN / KIT; transport menu by right-click on ▶ (the ▾ key is gone, Radek's exception to "no right-click"); PLATE: MKI / MKII in the engine menu; lock lane kit line, values, ghost locks, slides drawn by the dot or Shift-drag; note click/arrows/double-click, delete writes no NOTE OFF; song row marks; kit ‹ ›; MM octave range, Mix meters, LFO preview with locks, filter envelope view, D-wave names, blue forwarded lamp; follow played track; SysEx read-back option; mode switching fixed (B-162); Song page fits narrow windows (B-165).

Open after 0.8 (see BUGS.md Known in v0.8.0.md): B-133 (firmware), B-160 (machine-tier journey order), B-011, B-038, B-045, B-130, B-132; the testers' facts for B-153, B-156, B-157, B-158; on Linux and Windows a preempted low-priority lock holder can still delay the audio thread (DESIGN-audio-lock.md steps 4-5).

Worktrees for every 0.8 branch are in `audio/gearmulator-md-mm-wt/` (`0.8-*`); they can be removed after the tag. The feature data is doc/features/*.json (doc/features/README.md), the user guide doc/guide/ (README.md, STYLE.md; `node scripts/mdmm-guide.mjs --check` is clean on main).

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

## Development lifecycle (rule of 2026-10-13, after 0.6; details: doc/release/DEV-CYCLE.md, doc/release/CI.md)

What changed decides what runs (`scripts/mdmm-affected.tsv`). Use the lowest tier that answers the question.

- **While developing:** build, then the change's own test: `scripts/mdmm-check.sh` (default tier, narrow by area; `--save` or `--watch` for seconds). Claude runs it before it says a change is good. `--branch` is the comprehensive check: when Radek asks, or before a big merge. Not routine.
- **Design and interaction work:** `scripts/mdmm-preview.sh md|mm` (or `page-md`, `page-mm` in `.claude/launch.json`): the real page on the stub, no ROM or app build, live reload on save. Check the result with `scripts/mdmm-check.sh`, not by eye alone.
- **Across the firmware boundary** (a new command, a MIDI or SysEx adapter, recording or timing): one focused firmware test while the change is developed (needs your ROM).
- **Push to main:** ROM-free CI only (the light core job and the page suite, in parallel). No local full run.
- **Before a tag:** the full firmware E2E locally, `scripts/mdmm-e2e.sh` (a real gate: nonzero on a failed journey, and in a full run on a missing one), and the gate stages `scripts/mdmm-full-gate.sh --plan` prints (`MDMM_GATE_ONLY=...`; no green full gate in the history: the full gate). Push `release/0.x.y` (the full CI once), tag the tested head, merge to main, push, publish when the files are attached, ask Radek to deploy the site at once (the Discord post waits for the page). Radek tests by hand before the tag, not per change.
- **Editing the check or E2E scripts:** run their self-tests, `python3 scripts/mdmm-check.py --check-map` and `node scripts/mdmm-e2e-selftest.mjs`.
- Windows-only code: push a `feat/windows-*` branch, CI builds it. The CI nightly still runs the full CI on main.

Journeys have a tier (`deskJourney.js` TIERS): page journeys run in the page tier, machine journeys in the editor, the VST3 host runs only the host ones. Do not add audits or verification rounds before a cut unless asked.

## Community: the mdmm.dev Discord server

Claude Code may check and manage the MD + MM Editor Discord server (invite https://discord.gg/8xwXwBHbtn) through the bot "MD + MM Editor": read channels, round up bugs and ideas into `doc/release/BUGS.md` / `IDEAS.md` (testers are never named in this public repo), create or tidy channels, and post in #dev-log, #general, #bugs, #ideas and #videos (#announcements only through its release webhook, which the release workflow uses; the bot itself may not post there). **Every post or reply is shown to Radek first, with the exact text and any images, and goes out only after his OK.** Posts are written as CC (Claude Code), never as Radek. House rules: `marketing/DISCORD.md`. The bot token lives in `~/.config/mdmm/discord-bot-token` (never print it or commit it); release notes reach #announcements by the release workflow's webhook.
