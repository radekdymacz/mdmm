# MDMM CI layout (coordinator design, Radek 2026-10-18: fail fast, cheap stages first)

One orchestrator workflow `.github/workflows/mdmm-ci.yml` runs every push to main and release/** (and workflow_dispatch for any branch = item 10).
The existing workflows become `workflow_call` building blocks (their own push triggers are removed at the end, so nothing runs twice).
Each stage `needs` the one before; a red stage stops the rest. One run = one SHA = one green/red answer ("release ready" is simply this run green on release/*).

| Stage | Name | Runs | Runner | Target time | Gate |
|---|---|---|---|---|---|
| 0 | Checks | generated files in step (sync-md/mm --check, keymap-export --check, mdmm-guide --check, features-check, mdmm-check.py --check-map), actionlint, page contract tests in plain node (no browser) | ubuntu, 1 job | < 3 min | all pushes |
| 1 | Page + core | page suite (headless Chrome, page-tier journeys) and core unit tests (light mode) in parallel | ubuntu | ~10 min | needs 0 |
| 2 | Editors | build + unit/plug-in tests on macOS, Windows, Linux in parallel; macOS uploads its build tree for stage 3; on release/** also core asan-ubsan + transport-diagnostics in parallel | 3 OS | ~25 min | needs 1 |
| 3 | Firmware | ctest firmware shards + MD E2E + MM E2E, all parallel, reusing stage 2's macOS build (no rebuild); ROM fetched per job, deleted always | macos | as short as sharding allows | needs 2; main + release/** only (ROM Worker) |
| 4 | Packages | release dry run: packages, LTCG Windows (the flavour that ships), start tests, installed-package tests | 3 OS | ~30 min | needs 3; release/** only (and dispatch) |

Path filters: docs-only pushes (doc/**, **/*.md, site/**) run stage 0 only. Concurrency: cancel-in-progress on main and feature branches, queue (no cancel) on release/**.
The tag workflow reuses stage 2/4 artifacts of the same SHA and refuses to publish unless that SHA's mdmm-ci run is fully green (override input for emergencies, default off).
Nightly: later (items 8, 9).
