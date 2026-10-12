# Feature data

`md.json` and `mm.json` hold one row for every function of the Machinedrum and Monomachine manuals, in manual order. They are the source. `doc/modern-ux/FEATURE-MAP-MD.md` and `FEATURE-MAP-MM.md` are generated from them; do not edit those by hand. The plan is [doc/release/PLAN-0.6.md](../release/PLAN-0.6.md).

## Regenerate

```sh
node scripts/mdmm-guide.mjs          # writes both maps
node scripts/mdmm-guide.mjs --check  # fails if a map is not what the JSON makes
```

Plain Node, no dependencies. The same run writes the guide (`site/public/guide/md/`, `mm/`; styles: `site/public/guide/guide.css`, hand-written) from the hand-written chapters in `doc/guide/` ([README](../guide/README.md), [STYLE.md](../guide/STYLE.md)); `--pdf` also prints the two PDFs into `temp/guide-pdf/`. The rows feed the guide in three ways: each section names its rows (`<!-- rows: MM-251 @hash -->`, which gives the manual page in the margin and notices when the rows change), a `{gap:<id>}` sentence shows while its row is not done, and `--check` lists the sections to review.

## File shape

- `machine`: `md` or `mm`.
- `columns`: the six column names of the map tables.
- `doc`: the map in order. A `prose` block holds lines of text as they are written back. A `table` block (`chapter`, `pages`) stands for the rows of that chapter. A `counts` block is the summary table; its numbers are computed from the rows, never stored. In prose, `{applicable}`, `{done}`, `{partial}`, `{missing}`, `{hardware}` and `{total}` are filled in the same way.
- `rows`: one object per line.

## A row

| Field | Meaning |
|---|---|
| `id` | `MD-001`, `MM-001`, in manual order. **Never changes once given.** A new row takes the next number, even if it sits in the middle of a chapter. A dropped row is not reused. |
| `chapter` | The map's chapter heading, without its page range (that is on the `table` block). |
| `section` | The manual's section label (MM; empty for MD). |
| `manual` | Manual page, as printed: `1-57`, `A-3`, `C-4, C-5`; MD without the `p.`. |
| `function` | What the manual describes. |
| `machine` | What the hardware does, one line. |
| `status` | `done` (✅), `partial` (🟡), `missing` (❌), `hardware` (➖, hardware only). |
| `plan` | `0.6`, `later`, `not-needed` or `null`. |
| `planReason` | For `later` and `not-needed`: why, in one line (the gap triage, doc/release/PLAN-0.6.md). |
| `where` | Where it is in our UI. |
| `journeys` | Not stored. Derived from the journeys' `proves: ["MD-107"]` fields (`scripts/mdmm-journey-index.mjs`); the maps show a count. `node scripts/mdmm-features-check.mjs` checks the links and writes `unproved-md.md` / `unproved-mm.md` (done rows with no journey). |
| `missing` | For `partial` and `missing` rows: what is lacking. Taken from `notes` for now. |
| `bugs` | B-numbers named in the row. |
| `notes` | The map's Notes column, as it was (not in the plan's schema). |

Manuals are never copied into the repo (`doc/manuals/` is gitignored). Every sentence here is ours.
