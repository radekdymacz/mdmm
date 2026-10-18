# CI and the development loop

Why: on 2026-10-07 and 10-08 there were 182 CI runs, and 0.3.5's Editors job ran 8 times on its release branch. The
same commit was tested on the release branch, again on main, again on the tag, and again in the local gate. A small
fix paid the price of a release. This file is the rule since 0.4.0.

## Dev loop: build and the change's own test

Rule of 2026-10-18 (Radek); the short form is in [CLAUDE.md](../../CLAUDE.md) ("Development lifecycle").

1. Work on a branch.
2. Run only the change's own check locally: `scripts/mdmm-check.sh --quick` ([DEV-CYCLE.md](DEV-CYCLE.md)).
   If the local main branch is behind GitHub, use `MDMM_CHECK_BASE=origin/main` so unrelated commits are not selected.
3. Unit suites, firmware tests, E2E and packages run on CI. A focused firmware check can be dispatched there.
4. Merge to main. CI (`mdmm-ci.yml`, below) runs the whole pipeline on the push, cheapest stage first.
5. Before a tag: the `MD/MM CI` run of the release-branch head is green (stages 0 to 4, firmware included). Radek tests by hand before the tag.

## The pipeline: `mdmm-ci.yml` (fail fast, cheap first)

Rule of 2026-10-18 (Radek). One orchestrator workflow, `MD/MM CI`, runs on every push to `main` and `release/**` and by
hand (Run workflow) on any branch. Its stages are reusable workflows (`workflow_call`); each stage `needs` the one before,
so a red stage stops everything after it and nothing expensive starts on a commit that fails a cheap check. One run is one
commit and one answer: **on a release branch, that run green is "release ready"**, and the tag's release workflow refuses a
commit that has no green run.

| Stage | Job | Runs | Where | Gate |
|---|---|---|---|---|
| 0 | Checks | generated files in step (`sync-mdstudio-skin.py --check`, `sync-mmstudio-skin.py --check`, `keymap-export.js --check`, `mdmm-guide.mjs --check`, `mdmm-features-check.mjs`), the check-selection map and E2E verdict self-tests, actionlint (pinned, SHA-256 checked). No submodules, no compiler, no browser: seconds | ubuntu | every push |
| 1 | Page suite, Core unit tests | `mdmm-page.yml` (node page tests and the page-tier journeys, headless Chrome) and `mdmm-core.yml` (every ROM-free unit test, light build), in parallel | ubuntu | needs 0; skipped for a docs-only push |
| 2 | Editors, Core sanitizers | `mdmm-editors.yml`: macOS, Windows, Linux build + unit/plug-in tests + start tests + pluginval, in parallel. Windows builds LTCG on `release/**`. macOS keeps its test build tree as the artifact `macos-build-tree` (main and `release/**`). On `release/**` also `mdmm-core.yml` with asan-ubsan and transport-diagnostics | 3 OS | needs 1 |
| 3 | Firmware | `mdmm-firmware.yml`: the ROM tests and the firmware E2E, on stage 2's macOS build tree (see "Firmware tests on CI") | macOS, `rom` environment | needs 2; `main` and `release/**` only (the ROM Worker) |
| 4 | Packages | `mdmm-editors-release.yml` as a dry run on stage 2's packages (`reuse_current_run`): the two macOS installers, their install tests and auval, the per-machine Windows and Linux archives. Attaches nothing | macOS, 3 OS | needs 3; `release/**`, or a hand run with `packages` |

Docs-only pushes to `main` (only `*.md`, `site/`, `marketing/`, `doc/release/`, `doc/guide/`) run stage 0 only. Release
branches and hand runs always run everything. Concurrency: a newer push to `main` or a feature branch cancels the older run; on
`release/**` runs queue and nothing is cancelled half way. A hand run on another branch does stages 0 to 2 (and 4 with
`packages`); stage 3 needs `main` or `release/**`.

| Event | Runs |
|---|---|
| Push to `main` | `mdmm-ci.yml` stages 0 to 3 (4 never). A docs-only push: stage 0. |
| Push to `release/**` | `mdmm-ci.yml` stages 0 to 4, with the sanitizer builds and LTCG Windows. Green = release ready. |
| Tag `mdmm-v*` on the green release head | `mdmm-editors-release.yml`: `locate` finds the green `mdmm-ci.yml` run of that commit and takes its packages (macOS universal, Windows LTCG, Linux); it **fails loudly when there is none** (nothing is published, nothing is built). It makes the installers again from them, tests them, attaches them. |
| Run workflow on any branch | `mdmm-ci.yml` (stages 0 to 2, 4 with `packages`). `mdmm-core.yml`, `mdmm-page.yml`, `mdmm-editors.yml`, `mdmm-firmware.yml` and `mdmm-editors-release.yml` can still be run by hand alone. |
| Pull request | `mdmm-core.yml` and `mdmm-page.yml` by their path filters (never firmware). |
| Push to `feat/windows-*`, `feat/linux-*` | `mdmm-editors.yml` alone (path filter), for platform-only work. |
| Nightly, 02:00 UTC (04:00 Polish summer time) | The Editors (LTCG) and the core on main, only if main changed in the last 24 hours (`mdmm-nightly.yml`; its LTCG objects warm main's sccache for release branches); firmware at 02:30. Nobody waits; a red run is there in the morning. |

Reading a run: `gh run view <id>` shows the stage jobs in order (`0 Checks`, `1 ...`, `2 ...`, `3 ...`, `4 ...`); the first red one is
the whole story, the later ones are "skipped". Re-run failed jobs re-runs only that stage and what depends on it.

Packages of a release branch are kept 30 days (14 elsewhere), so a hand test can outlast the run. The tag reuses them; after
30 days the tag finds nothing and fails (push a new head, or `allow_unverified`).

Emergency override: run `mdmm-editors-release.yml` by hand on the tag with `dry_run` off and `allow_unverified` on. It then also
accepts a green `mdmm-editors.yml` run, or builds in the workflow. Default off; use only when CI itself is broken.

Off: upstream's Elektron workflows (disabled in Actions), the per-push installer dry run of the old layout.

## Core job: every ROM-free unit test

The core job (`mdmm-core.yml`, Linux) runs the unit tests picked by CTest label, not by name: `scripts/mdmm-ci-unit-targets.py`
takes every test labelled `UnitTest` except `Slow`, `Timing`, `Page` (the page suite runs those) and `dsp56300` (its own
step), builds their targets and runs them. A new `UnitTest` is in by default. Firmware tests are labelled
`FirmwareTest` or `Integration` and never run here. The plug-in is configured with every format off, only so its unit
tests (`mdPageBridgeTest`, `mdMachineMidiOutTest`, ...) are registered.

## Firmware tests on CI

**Status (2026-10-18, resumed).** The pipeline, artifact fixes and SysEx fixture setup are on `codex/continue-0.8.0`,
being validated on `release/0.0.0-ci-test`. All further validation runs on GitHub Actions, including focused debugging;
the earlier local-check exception was withdrawn by Radek. See [DEV-CYCLE.md](DEV-CYCLE.md).
Run 39127283546 (`dc770ec97`) finished red after passing stages 0–2. Firmware shard 1 passed MIDI Learn but failed
`mdSessionNoRomManageFirmwareTest_md` after first boot; shard 2 failed the two SysEx pick tests using the programmed
corpus; shard 3 failed the Monomachine memory test's project-global save. Shard 4 passed. Firmware E2E had eight MD
failures and seven MM failures. Packages were correctly held back. This run predates the refreshed PGO profile and
private SysEx downloads; the final release must test the newer head.

The next batch waits for final boot readiness and actual readback in the failing journeys, gives import and factory
reset their boot/readback time, draws the 2 px lane marker without a zoom-rounded border, and adds failure diagnostics
to the MM project-global memory check. Run 39135272248 passed checks, core tests and all 34 page unit tests, but stopped
at one page journey: `md-mix-solo-saved` clicked before the startup card finished fading out (339 journeys passed).
Commit `347f3454f` waits for the card to be hidden; run 39137347886 validates that fix.

The following layout batch gives kit names room at reduced zoom, fits song labels and marks inside their cells,
centres dialogs against the viewport including the scrollbar gutter, gives Sound headers a shared line height,
and reduces GEN control padding to avoid a horizontal scrollbar changing its height. The MM machine-reference
journey waits for the selected machine's defaults to settle. Large native page logs are retained compressed for
CI diagnosis. These changes still need CI validation; the MM project-global memory failure remains under investigation.
Keep the existing assertions and the release gate intact.
PGO training on main passed in run 39126917819: the downloaded profile parses, its hash matches, and all four recorded
emulator source trees match this branch. It is included with its metadata.

No full green firmware run yet. Older runs failed B-169's final global-learn checks on both machines (the longer waits
in `81335ff2e` still need CI confirmation), skipped the SysEx pick tests without backups, and had no apps in the E2E archive.
The latter two are fixed in this branch (details below). `mdSysexLifecycleTest` retains its existing exclusion because its
Monomachine factory-memory fixture is unavailable. Next: get the complete pipeline green, then merge the tested changes
into main and `release/0.8.0` before tagging.

`mdmm-firmware.yml` runs the tests that need the Elektron ROMs. It is stage 3 of `mdmm-ci.yml`, and can also run by hand
or at 02:30 UTC nightly. Its separate push trigger is removed so each push runs firmware once. Never a pull request.
The ROM jobs run in the GitHub environment `rom`; main cancels an older push run, `release/**` queues:

| Job | Runs |
|---|---|
| `changes` | dispatch and nightly always run; a pipeline call with a prebuilt tree follows the orchestrator's change selection. |
| `build-tests`, `build-e2e` | standalone workflow runs build once, without ROMs, and upload `fw-test-tree` and `fw-editors-tree` (2 days). Stage 3 receives `build_tree_artifact: macos-build-tree` and skips both builds: stage 2 already built every firmware test and the diagnostics editors. `build-tree.tar.gz` holds `build/` and `bin/plugins/`; the standalone E2E archive holds `bin/plugins/Release/Standalone/`. |
| `firmware` | four shards, each downloads the tree and only runs: every ctest test labelled `FirmwareTest` except `Slow` and `Soak`, on an arm64 tree without ThinLTO. A skipped test fails the job (a skip would mean "no ROM"). |
| `e2e` | one job per machine (`md`, `mm`): `scripts/mdmm-e2e.sh <machine> --jobs 1 --no-build` on the built editors. The report (logs, pictures, no ROM) is the artifact `e2e-report-md` / `-mm`. |

How the ROMs arrive: `scripts/ci-fetch-roms.sh` asks GitHub for an OIDC token (audience `mdmm-rom`) and sends it to the
Worker `ci/rom-worker` ([README](../../ci/rom-worker/README.md)), which streams `md.bin` / `mm.bin` from the private R2
bucket `mdmm-ci-roms`. The script checks size and SHA-256 against the constants in `scripts/macos/build_mdmm.sh`, puts
the files in the runner's temp folder and exports `GEARMULATOR_MD_FIRMWARE_BIN` / `GEARMULATOR_MM_FIRMWARE_BIN`. They
are never printed, cached or uploaded, and an `if: always()` step deletes them. The Worker URL is the environment
variable `MDMM_ROM_URL` of `rom` (not a secret). No long-lived secret exists anywhere.

With `--sysex`, the same script also downloads the owner's two full backups from `/sysex/md` and `/sysex/mm`, pins
their size and SHA-256, and exports `MD_SYX` / `MM_SYX`. Radek approved using the same private storage as the ROMs on
2026-10-18. The files are in that same temporary folder and deleted by the same cleanup step. They never enter Git,
caches or artifacts. The Worker uses exactly the same token rules for both types of file.

Trust rules (the Worker answers 403, no detail, to anything else): repository `radekdymacz/mdmm` and its numeric id;
`ref` is `main` or `release/*`; event is `push`, `workflow_dispatch` or `schedule`; environment `rom`; the workflow is
`mdmm-firmware.yml` at that same ref; GitHub-hosted runner; token fresh and for audience `mdmm-rom`. The environment is
restricted to branches `main` and `release/*`. Rules for the workflow file: no `pull_request` or `pull_request_target`
trigger, no new third-party action unless pinned by full SHA, no step that uploads or caches anything that can hold a
ROM. A change to the Worker's rules is a change to `ci/rom-worker/src/claims.ts` and its tests.

Revoke or rotate: delete the objects (`npx wrangler r2 object delete mdmm-ci-roms/md.bin --remote`, same for `mm.bin`),
or delete the Worker (`npx wrangler delete --name mdmm-rom`), or remove the `MDMM_ROM_URL` variable; any one stops the
workflow. A new ROM version: upload under the same keys and update the two hashes in `build_mdmm.sh`.

### First runs: what failed and why (2026-10-18)

Run 39108554055 (first run, `-j2`, one 3-core runner per job) failed in these groups:

- **Fixtures, not ROMs.** `mdAutomationFirmwareTest`, `mdProgramChangeFirmwareTest`, `mdAutomationRobustnessTest` and
  `mdAutomationSoakTest` build a plug-in processor and found no ROM: the loader looks next to the program and in the
  working folder, and only the other firmware tests add the folder of `GEARMULATOR_MD_FIRMWARE_BIN`. The harness
  (`mdAutomationTestSupport.h`) now adds the folders of both variables. `mdSysexLifecycleTest` needs the Monomachine factory
  patch RAM (`nvram/mm-factory-live3-be.bin`), a file that is on no machine we have (LOCAL-GATE.md says the same); it is left
  out of the CI run by name, as the local gate leaves it out.
- **Slow runner, loaded.** `mdMachineMemoryFirmwareTest_*` and `mdTransportFirmwareTest_mm` timed out or failed their
  "work under the device lock under 1 ms" check at 1.1 to 7 ms: two emulations at once on three shared cores. Now: the
  tests run in four shards, one test at a time per runner (`ctest -I n,,4 -j1`); `-DMDMM_FW_TIMEOUT_SCALE=3` triples the
  time limit of every FirmwareTest (`mdmm_scale_firmware_test_timeouts` in CMakeLists.txt; only limits move, nothing is
  skipped); `MDMM_LOCK_HOLD_BUDGET_MS=10` widens the lock-hold check (1 ms on a Mac of our own, unchanged by default).
- **`mdMachineMidiOutFirmwareTest_mm`** counted exactly 50 clocks and needed more than 50 in a fixed 3 s of a machine that
  plays slower than real time; the test now waits (up to 30 s) until the clocks are enough.
- **E2E.** Both machines passed the journeys that need no running machine and failed nearly all that need one (PLAY ends
  "not playing", edits do not reach the machine, "song S30 is not loaded yet"), and the report step lacked Pillow.
  Pillow is installed; the runner is described in `runner.txt` of the report and the editors' `app.out` files are kept.
  Run the E2E by hand for a part: Run workflow, `what` = `e2e`, `e2e_args` = e.g. `md --jobs 1 --select md-keys-space-play`.
- **E2E after sharding.** Run 39121106409 had no runnable editor on either E2E runner: the archive contained `temp/dev`,
  while JUCE copies the apps to `bin/plugins/Release/Standalone`. The archive now carries the apps; unpacking checks
  both executables before fetching ROMs or starting the journeys. The pipeline's shared tree carries these bundles too.
- **SysEx pick fixtures.** Shard 2 of run 39121366982 skipped `mdSyxPickFirmwareTest` and `mmSyxPickFirmwareTest` because
  `MD_SYX` and `MM_SYX` were unset. The first pipeline trial supplied the committed corpus; the next head uses the full
  private backups from R2, as requested by Radek. E2E imports retain their programmed corpus. Both pick tests must run
  and pass; the no-skips check remains in place. The missing Monomachine factory-memory snapshot is a different file,
  so `mdSysexLifecycleTest` remains excluded until it is available.

## Workflow hardening

Every action is pinned by full commit SHA with its tag in a comment (update both together; check the SHA with
`gh api repos/<owner>/<repo>/git/ref/tags/<tag>`, dereferencing an annotated tag). Each workflow defaults to
`contents: read`; a job that writes asks for it itself. The site workflow's deploy step runs a pinned
`wrangler@4.149.0`, but only when the Cloudflare secrets are set; they are not today, so the site is deployed by hand.

## Page suite (ROM-free, Linux)

`mdmm-page.yml` is stage 1 of `mdmm-ci.yml` (beside the core job), and runs on its own on pull requests that touch the page, the desk
code, the scripts or the schemas. It builds only `deskStubHost` (the
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

Flow: develop locally, all tests on CI. merge main into `release/0.x.y` -> push -> `MD/MM CI` green on the release head
(stages 0 to 4: page, core, editors, sanitizers, firmware, release dry run) -> Radek's hand test of the dry run's installers
-> tag `mdmm-v0.x.y` -> the release workflow attaches -> publish.

1. Cut `release/0.x.y` from main. Bump `MDMM_EDITOR_VERSION`, write `doc/release/v0.x.y.md`, point the README at it.
   If the emulation changed since the PGO profile was trained (the build says "stale", below), retrain it on the
   branch first: `scripts/macos/train_mdmm_pgo.sh`, then commit the two files it writes.
2. Push the branch. `MD/MM CI` runs once, cheapest stage first; a red stage stops the rest. Fix it, push (the run queues
   behind the one in progress), or re-run only the failed jobs. **Release ready = that run green on the head you want to tag**
   (its check on the commit; nothing else to look at). Windows in it is the LTCG flavour that ships; its stage 4
   is the dry run, so the installers to hand-test are the artifacts `macos-mdmm-installers-UNSIGNED` (30 days) of the same run
   (`gh run download <id> -n macos-mdmm-installers-UNSIGNED`).
3. Radek tests by hand.
4. Tag the green head (`git tag -a mdmm-v0.x.y -m "Machinedrum Editor + Monomachine Editor 0.x.y"`) and push the tag.
   `locate` of the release workflow looks for the green `MD/MM CI` run of the tag's commit, with unexpired packages (it
   waits for one still running). **Without it the workflow fails and publishes nothing**: no fallback build. Tag a commit
   other than the tested head and it fails the same way. Emergency (CI itself broken): run the workflow by hand on the
   tag with `allow_unverified` (default off); then local gates are the evidence (`scripts/mdmm-full-gate.sh --plan`).
5. Merge the branch into main and push main (the site workflow reads the notes from main).
6. Publish the release when the tag run has attached the files. The run's last job (`checksums`) attaches `SHA256SUMS`
   (the SHA-256 of every file on the draft, hand-uploaded ones included); re-run the tag's workflow after attaching
   anything by hand, so the list is current. A published release is never changed by it.
7. Deploy the site at once (`cd site && CLOUDFLARE_ACCOUNT_ID=331224f43e4f448483cad2f1185ea965 npx --yes wrangler@4.149.0 deploy`;
   Radek runs it until CI has the Cloudflare secrets). The Discord announcement waits up to an hour for the release
   page to be live, so its link preview has the image.

## PGO (profile-guided optimisation, macOS)

The macOS editors are built with a profile of the emulation at work (lever L6,
[RESEARCH-emulation-cpu.md](../modern-ux/RESEARCH-emulation-cpu.md) "L6 measured": 7.5 % less CPU on the Machinedrum, 5.5 % on the Monomachine, the same
audio bit for bit). Train on CI with `mdmm-firmware.yml`, `train_pgo=true`, then download the `pgo-profile` artifact and
commit its two files. The training job has ROM access and cannot push (`contents: read`):

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
