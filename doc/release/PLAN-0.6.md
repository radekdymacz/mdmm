# Plan: 0.6 — every feature proven, and a guide laid out like the manuals

*Agreed 2026-10-11 (Radek, with Claude Code). Planning only: nothing here is built yet.*

## Order (Radek, 2026-10-11)

1. The running tests finish (0.5.1).
2. CI/CD and test speed-up, so every later check is faster.
3. Then 0.6: slice 5 (journeys and screenshots) and the waves of doc/modern-ux/PLAN-manual-gaps.md.

Done before that order was set: slices 1 to 4, the guide's chapters 1-13 (MD) and 1-19 (MM).

## Handover (2026-10-12, stopped by the weekly usage limit)

Read this first in a new session. Rule from Radek: build all of 0.6 without per-piece play tests; merge a piece into
`feat/0.6-features` when its DEV-CYCLE tier checks are green and an independent reviewer agent passes it; at most 3
agents at once; Radek tests the whole release at the end from doc/release/TEST-0.6.md. Never commit with conflict
markers: resolve, grep for `<<<<<<<`, then commit, as separate steps.

**Merged into `feat/0.6-features`** (each reviewed, tier 2 green): wave P (probes, doc/modern-ux/PROBES-manual-gaps.md,
B-069), wave 1 song slots, wave 2 transport, wave 3 trig types and marks, wave 4 copy / paste / clear what, the top-bar
and LCD fit (B-061, B-065, B-066), the volume-strip fix; the feature data, journey links and guide (slices 1-4).

**Pushed, not merged** (each its own worktree under `audio/gearmulator-md-mm-wt/`):

| Branch | State | Next step |
|---|---|---|
| `feat/0.6-global` (wave 5) | built, tier 2 green on its own base; review not done | merge `feat/0.6-features` into it (conflicts in generated files: regenerate with `node scripts/mdmm-guide.mjs`); review with care `jucePluginLib/processor.*` (the new `midiIn` note message: audio thread, callAsync guard, MIDI floods) and `deskModal` (new `page` kind); tier 2; merge. Decision for Radek at the end: "Reset to defaults" renamed **Clear** (the mock-up had both) |
| `feat/0.6-sysex` (wave 6) | core committed (c118e4fa7); page, journeys and mock-up in one unchecked WIP commit (d880b0c67) | finish the page and MD journeys, rows, guide; tier 1 and 2; review; merge |
| `feat/0.6-recording` (wave 7) | probes, MD live erase, MM step recording and live erase in the core, firmware tests, stub host; `feat/0.6-features` merged in; step 0 (tier 1 on the combined base after waves 2 + 4, 2026-10-12): green in 231 s (125 unit tests, the page journeys of both editors, one golden per machine); page part, journeys, rows, guide and TEST-0.6.md done | review, merge |

**Wave 11 (added 2026-10-12, I-024):** machine memory that stays for every new session, way A: one memory file per
machine in the editor's user folder; a session with no project state starts from it; each save on the machine (kit,
pattern, song, global) writes it; a DAW project still opens with its own memory; a menu item starts from factory memory;
a setting turns it off. Two instances of one machine: the last save wins (say so in the guide). Branch `feat/0.6-memory`.

**Not started:** wave 8 (MD LEV on Mix, machine audition), wave 9 (MM Perform: see and set up, B-064: mock-up and
self-review against Radek's UI rules first), wave 10 (MM MKII look, I-023: colours sampled in IDEAS.md I-023; the
Machinedrum photos also disagree with our MD skins, see the open choice below), slice 5 (journeys and snapshots for the
unproved rows, doc/features/unproved-*.md), the guide appendices and "Beyond the hardware" chapter, the polish pass
(B-070, B-062, I-022 typed values, B-063 waits for the tester's host and screenshots, I-002 lights for incoming notes),
doc/guide/OPEN-FACTS.md, then `scripts/mdmm-full-gate.sh` on a quiet Mac and `release/0.6.0`.

**Known flaky under parallel load** (pass alone): md-boot-card, md-song-mode, mm-top-pattern-next, the MD intent cases
when several worktrees run firmware tests at once. Look at shared state between worktrees before the release gate.

**Radek's choices (2026-10-12):** (1) skins true to the product photos on both editors (MD silver with a red LCD; MM MKI
light-blue LCD, MKII bluish-white), built on their own branch `feat/0.6-skins` and compared side by side with the
current skins before any merge; (2) no Discord reply for now; (3) wave 5 keeps the name **Clear**.

## Execution (started 2026-10-11, after 0.5.1 and the dev-cycle work)

- Integration branch `feat/0.6-features` (rebased on main 249ba623a; the old history is `backup/0.6-before-rebase`). Each piece of work: its own branch and worktree from it, checks by doc/release/DEV-CYCLE.md (tier 1 before Radek plays, tier 2 before a merge), Radek plays and accepts, merged back into `feat/0.6-features`.
- Radek, 2026-10-11: "don't stop until everything is done for the 0.6 release, then we test." So no play-and-accept per piece: a piece is merged into `feat/0.6-features` when its tier checks are green and an independent reviewer agent passes it; Radek tests the whole of 0.6 at the end. Waves 9 and 10 are mocked up and self-reviewed against his UI rules, then built; he sees them at the end.
- At most 3 agents at once. Batch 1: wave P (probes), wave 1 (song slots; continues the paused worktrees), the fit fix (B-061, B-065, B-066). Then waves 2-4, then 5-8, then 9-10 (mock-ups to Radek first), slice 5 journeys and the appendices alongside.

## Summary

- **0.5.x carries the CPU work** (0.5.1, 0.5.2, 0.5.3: the levers of [RESEARCH-emulation-cpu.md](../modern-ux/RESEARCH-emulation-cpu.md), each on its own). 0.6 has no CPU work.
- **0.6 is stability and feature completeness.** The editors do everything the manuals describe that can be done from outside the machine. One list holds every function of the Machinedrum and Monomachine manuals. Each row says what the editor does, which journey proves it, and which screenshot shows it.
- **The user guide is made from that list.** It follows the manuals' layout (chapters, section names, page style), in our own words and our own design. It is on mdmm.dev/guide, and the same pages print to a PDF.
- A journey that fails shows a feature we thought was done and is not. That is the stability part: each one becomes a bug in [BUGS.md](BUGS.md).

## Done when

1. **The editors are feature complete against the manuals:** every row is ✅ or ➖ (hardware only). A row may stay 🟡 or ❌ only with `plan: "not-needed"` or `"later"` and a one-line reason Radek agreed (for example: the firmware cannot do it from outside, or the mouse makes it pointless).
2. Every ✅ row has at least one journey that passes, on both hosts, and a snapshot.
3. The guide at mdmm.dev/guide and its PDF are made by `scripts/mdmm-guide.mjs` from the hand-written chapters and the data, with no section to review (`--check` green).
4. The usual release gate is green ([LOCAL-GATE.md](LOCAL-GATE.md), [CI.md](CI.md)).

The map is the backlog: the 🟡 and ❌ rows are the work list of 0.6, worked through chapter by chapter.

## Rules

- **No Elektron text, logo, fonts or PDFs in the repo.** The repo is public. The manuals stay on Radek's Mac in a gitignored folder (`doc/manuals/` goes into `.gitignore`). We copy the chapter order, the section names and the page style. Every sentence is ours. A section cites the manual page ("MM manual p.13").
- **The data and the chapters are the sources.** `FEATURE-MAP-*.md`, the guide pages and the evidence report are generated. Nobody edits them by hand.
- **Testers stay anonymous** in everything generated.
- **Screenshots come from journeys** (`Journey.snapshot`, `scripts/mdmm-snap.py`), never from a hand capture. So they can be made again at each release.

## The data

Two outputs, two sources.

**The feature list and its evidence.** One file per machine: `doc/features/md.json`, `doc/features/mm.json`. One row per manual function, in manual order. It makes `FEATURE-MAP-*.md` and, with the journeys, the evidence.

```json
{
  "id": "MM-127",
  "chapter": "13. Parameter locks",
  "section": "PARAMETER LOCKS",
  "manual": "1-57",
  "function": "Lock a parameter on one step",
  "machine": "Lock a value to one step, in grid or live recording.",
  "status": "done | partial | missing | hardware",
  "plan": "0.6 | later | not-needed | null",
  "where": "Sequence: the lock lane under the track; Sound: drag a value while a step is held",
  "missing": null,
  "bugs": []
}
```

- Editor features with no manual counterpart (GEN, MUTATE, solo, undo, the piano roll's draw and box select, file drop, SysEx import preview…) get rows too, in a last chapter "Beyond the hardware", ids `MD-X01`, `MM-X01`. They need journeys and guide sections like any other row.
- `id` never changes once given. New rows get the next number.
- `machine`: one line, our words, what the hardware does.
- `missing`: what a 🟡 or ❌ row lacks, in one line.
- Journeys name the rows they prove: a `proves: ["MM-127"]` field next to `name:` in `mdDeskJourneys.js` and `mmJourneys.js`. That is the only place the link is written: the row's `journeys` list is derived from it by the generator, never stored by hand.

**The manual.** Hand-written prose, one file per chapter: `doc/guide/md/<nn-slug>.md`, `doc/guide/mm/<nn-slug>.md`, in the Elektron manual's chapter order and section names ([doc/guide/STYLE.md](../guide/STYLE.md)). Prose stays hand-written; what changes with the code comes from data, and the prose that needs a rewrite is flagged ([doc/guide/README.md](../guide/README.md), the loop):

- Each section names its rows, invisibly: `<!-- rows: MM-251 MM-252 @a1b2c3 -->`. The hash covers the rows' status, where and missing and the journeys that prove them; when it no longer matches, `scripts/mdmm-guide.mjs --check` fails and names the section; `--stamp <file>` writes it again after a review.
- `{key:<action>}`: the current keys from `doc/modern-ux/keymap.json`. No shortcut is typed where the key map has the action.
- `{gap:<row>}...{/gap}`: a sentence shown while the row is not done ("You cannot rename a song in the editor yet."). Once the row is done it goes, and the check asks for the procedure. `{bug:B-nnn}...{/bug}`: shown while the bug is open.
- `![caption](shot:<name>)`: the newest journey snapshot of that name (slice 5); until there is one, a placeholder with the caption.
- `{table:<source>}`: reference tables made from the code's data. Now: `keys:<group>` (the key map). The appendices add the machines' parameters (elektronData), the CC and SysEx tables.
- `scripts/mdmm-features-check.mjs` fails on a tag or mark that names nothing, an en or em dash, an exclamation mark or a banned word, and reports the done rows in no chapter.

## The guide layout (from the manuals, in our design)

- **Chapters and section names** as in each manual, in its order. One written chapter is one web page: `/guide/mm/17-the-song-mode/`. An index page per machine lists every chapter of the manual: the written ones with a one-line summary, the rest greyed as "to come" (no pages are made from the table). One shared "Install and first start" page.
- **A chapter reads like a manual:** a short intro (what this part of the machine is for, how the editor shows it), then the sections. A section explains the idea in a paragraph or two, then the exact procedure as numbered steps, keys as **[KEY]**, LCD fields as **\<PLAY\>**, on-screen controls in bold, what you see happen, a screenshot where it helps, NOTE and TIP paragraphs. Where the editor works differently from the machine, it says so. No status marks, row ids, journey names or code names in the visible text.
- **The page style:** the chapter name across the top between two thin rules; the big chapter number; headings in capitals; the manual page of each section in a wide left margin; the page number at the foot in the PDF.
- **Fonts and colours:** the mdmm.dev design tokens (`site/public/design/`), light and dark, MK1 and MK2 screenshots where the look differs.
- **The PDF:** print CSS on the same pages (A4, running header, page numbers, a table of contents), one PDF per machine by headless Chrome: `/guide/machinedrum-editor-guide.pdf`, `/guide/monomachine-editor-guide.pdf`.
- **Generator:** one command, `scripts/mdmm-guide.mjs`: reads `doc/features/*.json`, `doc/guide/`, the key map, the journeys and the snapshots; writes the two maps, `site/public/guide/` and, with `--pdf`, the PDFs. The Markdown reader is `scripts/mdmm-guide-md.mjs` (no dependencies). Plain HTML, no framework, like the rest of the site.

## Slices

Sizes: S = up to a day, M = 2-4 days, L = a week or more. Implementation goes to subagents; Claude Code (the coordinator) writes the briefs and reviews.

| # | Slice | What comes out | Size | Depends on |
|---|---|---|---|---|
| 1 | **Clean the map branch** | `docs/manual-feature-map` without the PDFs (`doc/manuals/` gitignored); both maps checked again against `main` at 0.5.0 (the MM map still says GLOBAL and step selection are missing) | S | – |
| 2 | **Map → data** | `doc/features/md.json` and `mm.json` with ids; the generator writes the two `.md` maps from them, the same rows as today | M | 1 |
| 3 | **Link the journeys** | `proves:` on all 342 journeys; `scripts/mdmm-features-check.mjs`: fails on a ✅ row with no journey, a journey with no row, or an unknown id; reports a guide picture with no snapshot. The first output is the list of ✅ rows without proof | M | 2 |
| 4 | **Guide template** | The page template and print CSS, with 2 sample chapters (MD "Parameter locks", MM "The song mode"), in light and dark, as web pages and PDF. Radek looks at it before slice 6 starts | M | 2 |
| 5 | **Missing journeys + snapshots** | One journey for each ✅ row without proof, each with a snapshot at the moment that proves it. Done by manual chapter, several subagents at once. A row whose journey fails goes to 🟡 or ❌ and gets a B-number | L | 3 |
| 6 | **Fill the guide** | Every chapter of both machines written to doc/guide/STYLE.md, each done row tagged in a section; the PDFs | L | 4, alongside 5 |
| 7 | **Gap triage (one session with Radek)** | The default for every 🟡 and ❌ row (about 135) is **build in 0.6**. The session only picks out the exceptions ("later" or "not-needed", each with its reason) and groups the rest into waves of related rows (one wave = one feature, for example "song slot menu": save, rename, copy, clear, jump to a row) | S | 2 (better after 5) |
| 8 | **Build the gaps, wave by wave** | Each wave: the feature on both editors where both have it, its journeys with `proves:`, its guide sections, its rows to ✅. One branch per wave, played and accepted by Radek (dev loop), merged to main. First waves, from the maps' top gaps: song slot menu; transport (pause, panic, restart, tempo nudge); per-track LEVEL; swing pattern and accent / slide / swing ALL flags; trig in A/B; reset menu; live-record erase and step recording; MM track, super and melody copy; SysEx send and receive ranges; MD sample manager (erase, clipboard) | L (the bulk of 0.6) | 7 |
| 9 | **Stability fixes** | The bugs from slice 5, plus the open ones: B-054, B-052, B-045, B-038; the Windows and Linux reports (B-029, B-033, B-035, B-036) as far as testers' logs allow | M-L | 5 |
| 10 | **Evidence report** | `scripts/mdmm-evidence.sh`: all journeys on both hosts, every snapshot, one HTML page: row → journeys → pass or fail → picture, in `temp/evidence/<version>/` (not in git). Run once per 0.6.x release, after the local gate | S | 3, 5 |
| 11 | **Release** | 0.6.0 with the guide live and the PDFs linked from the release notes | S | all |

Order of work: 1 → 2 → (3 and 4 at once) → (5 and 6 at once) → 7 → (8 and 9) → 10 → 11.

## From testers (in 0.6)

- B-064: Monomachine Poly, filter key tracking and the Multi envelope: easy to see and set up, journeys that prove the sound. Wave 9 of doc/modern-ux/PLAN-manual-gaps.md.
- B-063: window resizing (waiting for the tester's host and screenshots).
- B-062: the Perform keyboard's stuck key light; I-002: light keys for MIDI in.
- B-065: the LCD keeps one size on every workspace. B-061 (from 0.5.1, now also a user report): the top bar's MKI / MKII key cut off at the right edge; fit the bar as the MM GEN bar does, on both editors. B-066 (0.5.1 regression): the LCD's PLAY value cut off on the MM. One measured fit for the top bar and LCD row 2 fixes B-061, B-065 and B-066, with a journey that checks every slot and key on every workspace.
- I-022: type a parameter value (both editors).
- I-023: a real Monomachine MKII look (silver panel, bluish-white LCD with black text) on the MKI / MKII key. Wave 10 of PLAN-manual-gaps.md.
- CPU on an M1 (MM 57-60 %, MD 47-50 %, macOS 26): goes to the 0.5.x CPU work, not here.

## Out of 0.6

- CPU levers (they are in 0.5.x).
- Custom firmware (I-016), per-track length (I-015), DigiPRO user waveforms (F14), TurboMIDI (F15).
- Signing and in-app update (I-005): they go in whenever the Apple account and the keys exist, in any release.
- HW MIDI on real machines (F1): in 0.6 only if both machines are on the desk; otherwise 0.7.

## Open questions

- Screenshots: MK1 and MK2 both, or MK2 only with MK1 where the layout differs? (Proposal: MK2 by default.)
- Guide language: British English, as the site?
