# Handoff: 0.9 in progress (2026-10-31)

Read this first in a new session. The plan is [PLAN-0.9.md](PLAN-0.9.md); each feature's spec is in doc/release/0.9/.
Bugs named here are in [BUGS.md](BUGS.md).

## Where things stand

- **0.8.1 is released** (2026-10-29). Notes: [v0.8.1.md](v0.8.1.md).
- **main** (41f5d6594 and after) holds waves 1 to 4 of 0.9, all merged on 2026-10-30 and 2026-10-31:
  - MD Sample Manager (`feat/0.9-md-sample-manager`): copy, paste, RAM to ROM, rename, undo, WAV and SDS export.
    Erase one / erase all / Clear are still **not built** (no SysEx for it; the LCD probe on a `release/*` branch is
    approved in principle, spec "The erase probe: plan"). New firmware journeys `md-sampler-export` (MD-193, test
    hook `GEARMULATOR_MDMM_SAMPLE_EXPORT`, diagnostics builds only) and `md-sampler-ram-rom` (MD-199).
  - MM DigiPRO manager (`feat/0.9-mm-digipro`): the GLOBAL page card. Radek saw the mock-up and said OK. Firmware
    proof: ctest `mmDigiproManagerFirmwareTest` (24 jobs in one session) and journeys `mm-digipro-card`,
    `mm-digipro-jobs` (Load uses the fixture `wvcy.wav` through `GEARMULATOR_MDMM_WAVE_FILE`).
  - MM song loop, B-038 (`feat/0.9-mm-song-loop`).
  - Import undo, B-130 / B-045 (`feat/0.9-import-undo`).
  - Release workflow: the SHA256SUMS and other-platform jobs find the draft by the release id the macOS job made
    (`fix/0.9-release-sha256sums`). Not yet proved by a real tag run: check it on the 0.9 tag.
  - CI: macos-14 runners removed (GitHub brownouts, retired 2026-11-02); the VST3 host and the start tests run on
    macos-15 only.
- **B-195 fixed** (DigiPRO): two causes. (1) The emulated MM hangs for good when a status poll (0x70) arrives while
  it sends a 0x5D: the editor now asks nothing after a 0x5E until the dump is in (`MmMachine`, and
  `Controller::holdStatusPolls` in the plug-in). (2) A desk deadlock: SYSEX RECV waited for a queued waveform job
  that waited for SYSEX RECV; now SYSEX RECV waits only while DIGIPRO MGR has the panel (`WaveRecv::onPanel`). This
  had made 24 to 26 MM journeys fail in a cascade. Whether a real Monomachine hangs on (1) is not measured.
  The branch also added test-only diagnostic hooks (off by default) in mdmc, mdsim, mdhardware and mc68k.
- **Last full CI on main:** run 41179644105 (a31053d99): all green except the firmware E2E. MD 190 passed, 1 failed
  (`md-sound-knob-steps`, flake B-193). MM 221 passed, 3 failed: two are handled (B-197 fixed in the journey,
  B-198 a flake), one is open (B-196). The run on 41f5d6594 (41198483344) was still running at handoff: read it first.

## Next steps, in order

1. **B-196** (open, blocks a green MM firmware E2E): `mm-seq-record-locks` step 5 records no lock in full runs; it
   passes alone. BUGS.md has the traces and the next step: measure in `mmDeskFirmwareTest` reclock (a value right
   after RECORD + PLAY; RECORD pressed while SYSEX RECV is parked), then likely fix = LIVE RECORDING leaves SYSEX RECV
   first (the trial `RecvSession::leaveSoon`, commit b9eb729cf, with its mmDeskTest case) together with the journey
   turning the value after step 0 (already in the journey). The two were never run together. Proof: one full MM
   firmware E2E.
2. Wave 5: MM encoding and defaults from the firmware (B-176, B-175, B-166, B-189 OJMP bit layout): spec, then a
   firmware check of OJMP before any encoding change.
3. MD Sample Manager erase probe (MD-194, MD-198) on a `release/*` branch.
4. Open for Radek: may the import and reset journeys stop being `alone: true`?
5. Waves 6 to 10 as in PLAN-0.9.md (Windows/Linux stability, hardware MIDI, signing, fresh E2E evidence, ROADMAP
   section 6, housekeeping).

## How the work ran (keep doing it this way)

- Fix branches from main; a helper pushes only its branch. Firmware runs need main or `release/*`: push the branch
  head to `release/0.0.0-ci-test` **as a fast-forward only** (never force), cancel only the auto-started runs on
  that branch by id, then start focused runs:
  `gh workflow run mdmm-firmware.yml -R radekdymacz/mdmm --ref release/0.0.0-ci-test -f what=e2e -f e2e_args="--jobs 1 --select <journeys>"`.
  A selector with only MM journeys makes the MD job show "no journey result" (expected).
- A full firmware E2E (`-f what=e2e`, default args) is the proof that counts; focused runs miss cascades and order
  effects (B-195, B-196 both passed alone).
- Before every push to main, run the generated-file checks of the CI's first job: `sync-mdstudio-skin.py --check`,
  `sync-mmstudio-skin.py --check`, `keymap-export.js --check`, `mdmm-guide.mjs --check`,
  `mdmm-features-check.mjs --no-write`. A guide section whose rows changed must be read and re-stamped.
- `gh run download` of the e2e reports is about 100 MB each; the report's `journeys-*.log` names the failures
  (`grep "^JOURNEY .* FAIL"`).

## Rules that still hold

All validation on CI (CLAUDE.md "Development lifecycle"); poll runs slowly (every 300 s). Lock-hold CI budget stays
10 ms. Testers are never named. Every Discord post is shown to Radek first. No tag, publish or site deploy without his
OK. Rows marked done are proved by a firmware journey, not by a unit-test exemption (Radek, 2026-10-30).
