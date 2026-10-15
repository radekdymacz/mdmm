# CI and the development loop

Why: on 2026-10-07 and 10-08 there were 182 CI runs, and 0.3.5's Editors job ran 8 times on its release branch. The
same commit was tested on the release branch, again on main, again on the tag, and again in the local gate. A small
fix paid the price of a release. This file is the rule since 0.4.0.

## Dev loop: build and the change's own test

Rule of 2026-10-13 (Radek, after 0.6); the short form is in [CLAUDE.md](../../CLAUDE.md) ("Development lifecycle").

1. Work on a branch.
2. `scripts/mdmm-check.sh` (default tier, [DEV-CYCLE.md](DEV-CYCLE.md)): what changed decides what runs, from seconds (a
   page file) to under 2 minutes (the page journeys of that area, no ROM). `--branch` is for when asked or before a big
   merge.
3. A change across the firmware boundary gets one focused firmware test while it is developed.
4. Merge to main. CI runs two ROM-free jobs in parallel: the light core job and the page suite. Nothing else runs on a push to main.
5. Before a tag, locally: the full firmware E2E (`scripts/mdmm-e2e.sh`, nonzero on failure) and the gate stages of
   `scripts/mdmm-full-gate.sh --plan`. Radek tests by hand before the tag.

## What CI runs

| Event | Runs |
|---|---|
| Push to `main` | Two light jobs in the background, side by side: the automation core (Linux, unit tests, no memory checker) and the page suite (below). Nobody waits for them. |
| Push to `release/0.*` | The full suite once: Editors on macOS, Windows (LTCG, what ships) and Linux, each with its tests in a job of their own beside the package (macOS: an arm64 tree without ThinLTO; the package job links only the plug-ins with ThinLTO), core with ASan/UBSan and the transport diagnostics, shared controller. A newer push cancels the older run. (The audio I/O workflow is folded into the Editors' test jobs.) |
| Tag `mdmm-v*` on the tested release-branch commit | Finds that branch run and reuses its packages: makes the installers, tests them, attaches them. No second build. |
| Nightly, 02:00 UTC (04:00 Polish summer time) | The full suite on main, only if main changed in the last 24 hours (`mdmm-nightly.yml`), Windows with LTCG so main's sccache holds what a release branch builds. Nobody waits; a red run is there in the morning. The local gate is not scheduled: it runs by hand ([LOCAL-GATE.md](LOCAL-GATE.md)). |
| By hand | Every workflow has Run workflow; the release installers have a dry run. |

Off: upstream's Elektron workflows (disabled in Actions), the per-push installer dry run.

## Core job: every ROM-free unit test

The core job (`mdmm-core.yml`, Linux) runs the unit tests picked by CTest label, not by name: `scripts/mdmm-ci-unit-targets.py`
takes every test labelled `UnitTest` except `Slow`, `Timing`, `Page` (the page suite runs those) and `dsp56300` (its own
step), builds their targets and runs them. A new `UnitTest` is in by default. Firmware tests are labelled
`FirmwareTest` or `Integration` and never run here. The plug-in is configured with every format off, only so its unit
tests (`mdPageBridgeTest`, `mdMachineMidiOutTest`, ...) are registered.

## Workflow hardening

Every action is pinned by full commit SHA with its tag in a comment (update both together; check the SHA with
`gh api repos/<owner>/<repo>/git/ref/tags/<tag>`, dereferencing an annotated tag). Each workflow defaults to
`contents: read`; a job that writes asks for it itself. The site workflow's deploy step runs a pinned
`wrangler@4.149.0`, but only when the Cloudflare secrets are set; they are not today, so the site is deployed by hand.

## Page suite (ROM-free, Linux)

`mdmm-page.yml` runs on every push to `main` and `release/0.*`, and on pull requests that touch the page, the desk
code, the scripts or the schemas. It is a job of its own, beside the core job. It builds only `deskStubHost` (the
editors' real core with a fake machine) and `mmDataCorpusTest`, never an editor or a plug-in; CMake is configured with
the JUCE plug-in on, with every format off, only so that it registers the node page tests. ccache keeps the build
(one archive per branch, falling back to main's). Then it runs, in this order:

1. the node page tests (`ctest -L Page`, 31 tests);
2. every page-tier journey of both editors, headless Chrome from the runner image (`node scripts/mdmm-page.mjs
   --tier page --jobs 3 both`).

A failed test or journey fails the job. A failed run uploads the run folder (`page-run`: the report, each page's log,
the commands, failure screenshots) as an artifact for 14 days. Time: about 8 to 9 minutes in all; the build is under a minute
with a warm cache and the journeys are about 7.5. The runner tells the page it is on a Mac (`navigator.platform`), because the journeys press
Cmd chords; without that every Cmd+Z journey failed on Linux.

### Page suite exclusions

Two journeys measure text against its box to the pixel, and Linux Chrome sets the text a few pixels wider than the
Mac's. They run locally and in the local gate; CI leaves them out by name in `mdmm-page.yml` (`!name`):

| Journey | Why it fails on Linux |
|---|---|
| `md-screens-fit` | the GEN bar's summary line is 2 px wider than its box |
| `mm-global-page` | the GLOBAL modal's head wraps to two lines (42 px) |

Nothing else is left out. Take a name off the list when the page has room for the Linux text.

## Release: once per batch

1. Cut `release/0.x.y` from main. Bump `MDMM_EDITOR_VERSION`, write `doc/release/v0.x.y.md`, point the README at it.
   If the emulation changed since the PGO profile was trained (the build says "stale", below), retrain it on the
   branch first: `scripts/macos/train_mdmm_pgo.sh`, then commit the two files it writes.
2. Push the branch. The full CI runs once.
3. The local gate and the firmware E2E (`scripts/mdmm-e2e.sh`): `scripts/mdmm-full-gate.sh --plan` names the last green full gate on main and prints the gate command
   for the stages the diff since touches (`MDMM_GATE_ONLY=...`); run it. Without a green full gate in the branch's
   history, the full `scripts/mdmm-local-gate.sh`.
4. A failure: fix it, push, and re-run only the failed stage (`MDMM_GATE_ONLY=<stage>`; in Actions, Re-run failed jobs).
5. Tag the branch head (`git tag -a mdmm-v0.x.y -m "Machinedrum Editor + Monomachine Editor 0.x.y"`) and push the tag.
   The tag must be on the commit CI tested, or it builds again.
6. Merge the branch into main and push main (the site workflow reads the notes from main).
7. Publish the release when the tag run has attached the files. The run's last job (`checksums`) attaches `SHA256SUMS`
   (the SHA-256 of every file on the draft, hand-uploaded ones included); re-run the tag's workflow after attaching
   anything by hand, so the list is current. A published release is never changed by it.
8. Deploy the site at once (`cd site && CLOUDFLARE_ACCOUNT_ID=331224f43e4f448483cad2f1185ea965 npx --yes wrangler@4.149.0 deploy`;
   Radek runs it until CI has the Cloudflare secrets). The Discord announcement waits up to an hour for the release
   page to be live, so its link preview has the image.

## PGO (profile-guided optimisation, macOS)

The macOS editors are built with a profile of the emulation at work (lever L6,
[RESEARCH-emulation-cpu.md](../modern-ux/RESEARCH-emulation-cpu.md) "L6 measured": 7.5 % less CPU on the Machinedrum, 5.5 % on the Monomachine, the same
audio bit for bit). CI never has the firmware, so the profile is trained on the Mac and committed:

- `scripts/macos/train_mdmm_pgo.sh` (needs the ROMs, about 3 minutes, silent) builds `mdmmPerfGateTest` instrumented,
  plays every scenario of both machines, and writes `source/elektron/md/pgo/mdmm-macos.proftext` (LLVM's text
  profile: function names, hashes and counts) and `mdmm-macos.json` (the commit, the git tree of each profiled folder,
  the compiler, the workload). It proves the profile holds no firmware before writing it
  (`scripts/macos/mdmm_pgo_profile.py check`: every line parses as profile data, and no run of 31 bytes of either
  ROM is in it); CI repeats the parse on every build.
- The build (`GEARMULATOR_MDMM_APPLE_PGO_MODE=committed`, the default of `scripts/macos/build_mdmm.sh`, CI and the
  local gate) converts the text with its own compiler's `llvm-profdata` and uses it for both slices of the universal
  build. The receipt records `pgo_mode: committed`, the profile's SHA-256 and the stale folders.
- **Stale:** when a profiled folder (mdLib, mc68k, dsp56kEmu, dsp56kBase) changed since training, the build warns
  (a CI annotation "PGO", the local gate's stage 1 line) and still uses the profile: clang ignores the counts of every
  function that changed. Retrain before a release. **Missing** (no profile, no `llvm-profdata`): the build warns and
  is the plain ThinLTO build.
- Windows and Linux are built without PGO: MSVC's `.pgd` and GCC's `.gcda` belong to the exact build that was
  trained, so neither can be trained on the Mac and reused in CI.
