# The guide

The manual of the two editors: one hand-written file per chapter in `md/` and `mm/`, named and ordered as the Elektron manual's chapters, written to [STYLE.md](STYLE.md). What changes with the code comes from data: keys (`{key:...}`, the key map), gaps (`{gap:<row>}...{/gap}`, the row status), pictures (`shot:<name>`, the newest journey snapshot), reference tables (`{table:...}`). Each section's `<!-- rows: ... @hash -->` tag notices when its rows change.

When you change or implement something:

1. Implement it, with its journey (`proves: ["MM-254"]`).
2. Set the row's `status`, `where` and `missing` in `doc/features/<md|mm>.json`.
3. Run `node scripts/mdmm-guide.mjs --check`: it lists the sections to review (rows changed, a gap now done) and anything broken.
4. Rewrite the flagged sections to [STYLE.md](STYLE.md): the procedure in numbered steps, the gap sentence gone.
5. Run `node scripts/mdmm-guide.mjs --stamp doc/guide/<md|mm>/<chapter>.md`, then `node scripts/mdmm-guide.mjs --pdf` to write the maps, the pages and the PDFs.
