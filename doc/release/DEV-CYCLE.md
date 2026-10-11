# The development and test cycle

Since 2026-10-11 (after 0.5.1). The proposal of that day, Radek's three decisions on it, and what was built. The short
rules are in [CLAUDE.md](../../CLAUDE.md) ("Development lifecycle"); CI in [CI.md](CI.md); the local gate in
[LOCAL-GATE.md](LOCAL-GATE.md).

## The finding

Every check of the page went through the slowest path there is: the page, JUCE, the emulator, the firmware and its
read-back. A change to one button paid for a 32 s firmware boot and a read-back wait, and a slow or busy firmware failed
a page test. Splitting the page from the machine takes most of that cost away.

Measured on 0.5.1 (M4 Pro, 12 cores): the local gate 62 minutes plus 35 for a re-run of two stages; of that, the
journeys (7d) 32 minutes, one editor at a time, the VST3 host replaying the standalone's page journeys (161 of 362 runs).
CI to green 26.5 minutes, the macOS package job the critical path (two slices, ThinLTO links of the plug-ins and of the
test programs). Bugs B-001 to B-058: about 35 found by testers and Radek, 6 by journeys, 5 by the firmware tests, 3 by
CI's start tests; the goldens, rt-check, core capacity, soak, pluginval and auval logged none (they guard the CPU work:
kept, run nightly and when emulation code changes). The 0.5.1 gate's failures were a cascade (md-dev-speedups left the
CPU details open over md-lcd-volume), a journey that needs a sample the sandbox does not have (md-sampler-audition), and
read-back timing (md-mix-ms-off, md-sampler-setup-undo, md-lib-kit-copy-paste-undo: that one an unanswered Overwrite
question).

## The three seams

```
 page  --command-->  core (deskCore, mdDesk, mmDesk)  --dump/SysEx-->  firmware (emulator)
   page tier             core tests                         command -> firmware tests
   headless Chrome,      C++, fake machine, seconds         C++, ROM, no UI, minutes
   the real core
```

## Decisions (Radek, 2026-10-11)

1. **A page journey's "machine" check means the core's documents.** The page tier runs the page journeys without a ROM:
   their `machine:` checks read the documents the core publishes. The firmware side is proven by the table-driven
   command -> firmware tests (the intent cases) and the machine journeys.
2. **The full local gate runs nightly on Radek's Mac** from a local schedule (launchd, not a GitHub runner). A release
   needs a green nightly on main plus the gate stages its diff touches.
3. **The VST3 host runs only the host-specific journeys.**

And: no release after 0.5.1 until this is done.

## The tiers

| Tier | When | Command | What | Target | Measured |
|---|---|---|---|---|---|
| 0 Save | each save, or by hand | `scripts/mdmm-check.sh --save` (`--watch`: on every save) | the pages against the contract and their mockups, the unit tests of what changed (built first), without the Slow and Timing ones | under 30 s | 2 s (a page file), 4 s (a desk file, rebuilt from ccache) |
| 1 Did I break it | before Radek plays a build, before a merge | `scripts/mdmm-check.sh` | tier 0 with every test of what changed, the page journeys of that area, one golden per machine when emulation code changed | under 2 min | 18 s (a sequencer page change: 28 unit tests, 18 page journeys) |
| 2 Branch check | before a merge, in the background, when desk or emulator code changed | `scripts/mdmm-check.sh --branch` | every unit test, every page journey, the firmware tests and the machine journeys of the area, every golden when emulation changed | under 10 min | to measure |
| 3 Nightly | each night on main | `scripts/mdmm-nightly.sh` (launchd) | the full local gate, the soak on Sundays | nobody waits | to measure |
| 4 Release | cut from a commit with a green nightly | `scripts/mdmm-nightly.sh --plan`, then the command it prints | the gate stages the diff since that nightly touches (`MDMM_GATE_ONLY`), the release CI, the tag | about 30 min, mostly CI | to measure |

What changed decides what runs: `scripts/mdmm-affected.tsv`, one row per path pattern (the first one a path matches):
unit tests, firmware tests, page journeys, machine journeys, goldens, and the gate stages a release runs for it. A path
no row matches runs everything of its tier.

## What was built

- **The page tier.** `scripts/mdmm-page.mjs` loads each page as it is (its files served by name, as the plug-in bundles
  them) in headless Chrome, driven over the DevTools protocol with node's own WebSocket (no npm package), `?dev=1`, and
  puts `deskStubHost` behind the bridge: the editors' real core (`mdDesk`, `mmDesk`) with a fake machine that speaks the
  firmware's SysEx (keeps the dumps, answers requests and status, LOAD PATTERN and KIT, SAVE KIT, the working kit from
  memory, mutes, the transport, chains, the MM's SYSEX RECV and MUTE window, a small MD sample bank). Undo, refusals,
  history, the library and the read-back are the real code. Every command the page sends is checked against the contract
  schema and recorded. Its fixture: the committed test dumps, 16-step patterns, kits named KIT nn, four-row songs,
  factory globals. All 133 page journeys of both editors pass in about a minute at `--jobs 4`.
- **Journey tiers.** `deskJourney.js` `TIERS`: 10 host journeys, 29 machine journeys, every other one a page journey; a
  selector's `~page`, `~machine`, `~host`. `mdmm-journeys.sh --tier` (the standalone, default all) and `--vst3-tier`
  (default host). `deskJourneyTiersTest.js` keeps the table on real names.
- **Journey fixes.** The runner closes what an earlier journey left open (and logs it); the speed-ups journey waits for
  the CPU details to stay closed and toggles each switch once each way; a click after a drag goes where a browser sends
  it (the common parent of the pressed and released element); waits on the read-back instead of fixed sleeps;
  md-sampler-audition quarantined until the sandbox has a sample; md-lib-kit-copy-paste-undo answers Overwrite;
  md-gen-keys-r takes one hit away when R rolled every step a hit (Hits stops at Steps).
- **Command -> firmware.** `doc/modern-ux/intent-cases.json` (125 MM cases, and a first Machinedrum set of 29) is read by
  `mmIntentCases.h` / `mdIntentCases.h` and run by the core tests (`mmDeskTest`, `mdDeskTest`) and, through the desk on
  the firmware, by `mmDeskFirmwareTest intentcases` and `mdDeskFirmwareTest intentcases` (ctest
  `mmIntentCasesFirmwareTest`, `mdIntentCasesFirmwareTest`).
- **ctest lanes.** The 28 node page tests carry the label `Page`; the Timing tests run serially (`RUN_SERIAL`); the slow
  unit tests carry `Slow` (out of the save-time lane).
- **The gate in lanes.** Stage 1 with ccache; the journeys' diagnostics build in the background while the release
  tree's stages run; the new stage 2c (the page tier); 7d the standalone's machine journeys and the VST3 host's host
  journeys at `--jobs 4`; the timing stages (5b, 6a, 6b, 6c) last, alone.
- **The nightly.** `scripts/mdmm-nightly.sh`: main as origin has it, in its own worktree (`temp/nightly/main`), on a
  quiet Mac on mains power, `history.tsv` and `last-green`, a notification when red. `--install` prints the launchd
  commands (`scripts/macos/mdmm-nightly.plist`, 02:30); it is installed by hand.
- **CI.** Tests in their own jobs (macOS: arm64 without ThinLTO; Linux: beside the package), the macOS package job
  builds only the plug-ins with ThinLTO, `mdmm-audio-io.yml` folded into the Editors, and the CI nightly builds Windows
  with LTCG on main so a release branch's LTCG package finds main's cache.

## What stays open

- `deskStubHost` answers the plug-in's own commands (engine map, ROM, audio, menu) with ok and nothing more; the host
  journeys need the editor.
- More Machinedrum intent cases (the commands the journeys use first), and the page side of them (the MM's are in
  `mmViewTest.js`).
- md-sampler-audition comes back with a sample fixture in the journeys' sandbox.
