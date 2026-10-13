# The end-to-end evidence run

Radek's goal (2026-10-12): an end-to-end suite built from the manual, run on the real firmware, that does every function the way a person does and takes the pictures the guide uses, so the guide is filled from the run.

## The command

```sh
scripts/mdmm-e2e.sh [md|mm|both] [--jobs N] [--page] [--write-data] [--select journey-...] [--report-only] [--no-build]
```

It builds the two standalone editors (diagnostics build), runs every journey in the standalone on the emulated machine with the owner's ROMs (`GEARMULATOR_MD_FIRMWARE_BIN`, `GEARMULATOR_MM_FIRMWARE_BIN`, else the ROM folders in `~/Documents/Gearmulator Preview/<machine>/roms`), in the background (no focus, no sound), from fresh settings (factory memory, so each run starts the same), with the test files the import journeys need (the committed test dumps joined into a `.syx`, a one second sine as a WAV). `--page` also runs the page tier (the stub machine) so a journey that passes only there is named **stub-only**. `--write-data` writes `doc/features/e2e-<machine>.json`, which `scripts/mdmm-guide.mjs` shows as the **E2E** column of the feature maps (derived data: never edit it by hand).

Everything lands in `temp/evidence/<version>/` (not in git): `index.html` (the report), `shots/*.webp` (the pictures), `run/` (the page logs and reports), `e2e-<machine>.json`, `report.txt`.

## Independent journeys: shuffled and alone

Every journey must pass alone and in any order (doc/modern-ux/JOURNEYS.md, "Independent journeys"). The proof on the firmware:

```sh
scripts/mdmm-e2e.sh both --jobs 2 --shuffle 7        # the whole suite in a seeded random order (the seed is in the report: SHUFFLE seed 7)
scripts/mdmm-e2e.sh md --isolate --tier machine --jobs 4   # each machine-tier journey in an editor of its own, fresh from factory memory (one start each)
scripts/mdmm-e2e.sh mm --isolate --select 'journey-mm-song-*'   # a few, alone
```

`--shuffle` and `--isolate` reach `scripts/mdmm-journeys.sh`; `--tier` limits the standalone's journeys to a tier (page, machine, host). The report's `JOURNEY <name> left:` lines name a journey
that did not put back what it changed (its tidy is to). A journey marked `alone: true` (an empty reset) always gets an editor of its own.

## What a run does

- **Every journey, on the firmware.** The page journeys run in the standalone too (`--tier all`), so their `machine:` checks read the firmware's read-back, not the stub's. A journey that fails here and passes on the stub is stub-only.
- **A picture at each journey's proof moment.** `MDMM_JOURNEY_E2E=1` (the selector's `:e2e`, `skins/shared/deskJourney.js`): a journey that takes no snapshot itself leaves `e2e-<journey>` where its last step passed, and `e2e-<journey>-fail` where it failed. `scripts/mdmm-snap.py` renders them, `scripts/mdmm-e2e-webp.py` makes WebP (quality 85, at most 1440 px wide) and removes the raw files. `scripts/mdmm-guide.mjs` takes the newest picture of each name from `temp/evidence/*/shots`.
- **A watch.** After each step the runner reads the toast, the error line and the question: a program word (undefined, NaN, an object, a stack, validation or schema text) fails the journey, and so does a question whose button something covers.
- **Factory content as a person uses it.** `md-real-factory-songs`, `md-real-factory-patterns` and the same for the Monomachine: every factory song that holds rows is loaded, SONG mode, PLAY; patterns spread over the 128 are picked and played. The check is the machine's own: the transport starts, the step moves, the song moves on to a later row, the output is not silent. `md-real-sequence-plays`: four trigs drawn in an empty pattern, played, the pattern cleared (it plays silence), one undo (it plays them again).
- **The output meter in a background run.** A background standalone zeroes its output before the volume, so the meter reads nothing. With `GEARMULATOR_MDMM_BACKGROUND_METER=1` (the e2e script sets it) the output is 0.003 of itself instead (-50 dB, nothing a person hears), so the output meter still reads what the machine plays (`source/elektron/md/mdLib/mddeskdevice.cpp`).

## The report

`scripts/mdmm-e2e.mjs` joins the runs to the rows (`doc/features/<md|mm>.json`, the journeys' `proves:`): chapter, section, row, the journey's steps, pass or fail, the picture. A row is **pass**, **fail**, **stub-only**, **skipped**, **missing** (a done row with no journey, or none in the run: red) or **n/a** (partial, hardware, later, not needed: listed with its reason). Reds come first, then the pictures' review (below), the guide pictures not taken, and the chapters.

## The screenshot review

`node scripts/mdmm-e2e-review.mjs batches temp/evidence/<version> 25` splits the pictures into batches with a prompt; a reviewer (Haiku subagents read WebP fine) writes `review/result-NN.json` for each; `node scripts/mdmm-e2e-review.mjs merge temp/evidence/<version>` writes `review.json`, which the report shows with the pictures.

## The guide

`node scripts/mdmm-e2e-briefs.mjs temp/evidence/<version> temp/evidence/<version>/run` writes a brief for each guide chapter: each section's rows, what the run did for them (the steps), the result, the pictures. The guide sections are written from the briefs (doc/guide/STYLE.md), then `node scripts/mdmm-guide.mjs --stamp <file>`. A picture reference is `![caption](shot:<name>)`; the names that stay the same from run to run are `e2e-<journey>` and the named snapshots.

## Re-taking the pictures after other branches merge

Run the same command again (`scripts/mdmm-e2e.sh both --jobs 2 --page --write-data`). The new pictures replace the old ones with the same names; `node scripts/mdmm-guide.mjs` takes the newest.

## What the page cannot see

The page reads the transport, the step, the song row and the output's peaks. It does not see each trig or note the firmware fires, nor an applied parameter lock, so "plays the trigs" is proved by sound against silence (`md-real-sequence-plays`), and locks by the machine's read-back of the lock, not by what the firmware plays. A per-trig probe in the plug-in (a message for each trig fired, diagnostics builds only) would close that.
