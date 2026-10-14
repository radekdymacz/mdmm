#!/usr/bin/env node
// The guide filling's briefs (doc/release/E2E.md): for each guide chapter, each section's rows with what the end-to-end run
// did for them (the journeys' steps as the person does them, the result, the pictures taken), so the section can be written
// from what the run actually does. One file a chapter in <evidence>/guide-briefs/. Plain Node, no dependencies.
//   node scripts/mdmm-e2e-briefs.mjs <evidence folder> <run folder>...
// Needs scripts/mdmm-e2e.mjs to have run (e2e-<machine>.json in the evidence folder).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chapterFiles, parseChapter, partsOf, rowsHash } from './mdmm-guide-md.mjs';
import { readJourneys, journeysByRow } from './mdmm-journey-index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [evid, ...runs] = process.argv.slice(2);
if (!evid || !runs.length) { console.error('usage: node scripts/mdmm-e2e-briefs.mjs <evidence folder> <run folder>...'); process.exit(2); }
const out = path.join(path.resolve(evid), 'guide-briefs');
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) fs.unlinkSync(path.join(out, f));

// the steps of each journey, from the runs
const steps = new Map(), shotsOf = new Map();
const walk = (d, f) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, f); else if (e.name === 'journeys.txt') f(p); } };
for (const r of runs) walk(path.resolve(r), (p) => {
	for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
		let m;
		if ((m = /^JOURNEY (\S+) (\d+)\/(\d+) (ok|FAIL) (.*?) \((\d+) ms\)/.exec(line)) || (m = /^JOURNEY (\S+) (\d+)\/(\d+) (ok|FAIL|skip) (.*?)\r?$/.exec(line))) { if (!steps.has(m[1])) steps.set(m[1], []); steps.get(m[1])[+m[2] - 1] = (m[4] === 'skip' ? 'skipped: ' : '') + m[5]; }
		else if ((m = /^JOURNEY (\S+) SHOT (\S+)/.exec(line))) shotsOf.set(m[1], [...(shotsOf.get(m[1]) || []), m[2].trim()]);
	}
});
const shotFile = (n) => fs.existsSync(path.join(path.resolve(evid), 'shots', `${n}.webp`));

const journeys = readJourneys(root);
const byRow = journeysByRow(journeys);
let total = 0;
for (const m of ['md', 'mm']) {
	const data = JSON.parse(fs.readFileSync(path.join(root, 'doc', 'features', `${m}.json`), 'utf8'));
	const byId = new Map(data.rows.map((r) => [r.id, r]));
	const e2e = JSON.parse(fs.readFileSync(path.join(path.resolve(evid), `e2e-${m}.json`), 'utf8')).rows;
	for (const f of chapterFiles(root, m)) {
		const ch = parseChapter(f.src);
		const lines = [`# Brief: ${path.relative(root, f.file)}`, '', 'For each section: the rows it covers, what the end-to-end run did for them on the real firmware (the steps a person takes, in the run\'s words: rewrite them to doc/guide/STYLE.md, do not paste them), the pictures taken (use `![caption](shot:<name>)`), and whether the section is stamped current.', ''];
		for (const part of partsOf(ch)) {
			if (!part.rows.length && part.heading === '(chapter intro)') continue;
			const now = rowsHash(part.rows, byId, byRow);
			const stamped = part.tags.map((t) => t.hash).filter(Boolean);
			const pics = part.blocks.filter((b) => b.type === 'img' && b.src.startsWith('shot:')).map((b) => b.src.slice(5));
			lines.push(`## ${part.heading}`, `stamp: ${part.tags.length && part.tags.every((t) => t.hash === rowsHash(t.ids, byId, byRow)) ? 'current' : 'needs review'}; pictures in the section now: ${pics.join(', ') || 'none'}`, '');
			for (const id of part.rows) {
				const r = byId.get(id), e = e2e[id];
				if (!r) continue;
				lines.push(`- ${id} [${r.status}] ${r.function} (machine: ${r.machine}; our UI: ${r.where}) e2e: ${e?.result || '?'}${e?.why ? ' (' + e.why.slice(0, 160) + ')' : ''}`);
				for (const j of (e?.journeys || [])) {
					const st = (steps.get(j) || []).filter(Boolean);
					const pict = (shotsOf.get(j) || []).filter(shotFile);
					lines.push(`  - journey ${j}: pictures ${pict.join(', ') || 'none'}`);
					for (const [i, s] of st.entries()) lines.push(`      ${i + 1}. ${s}`);
				}
			}
			lines.push('');
		}
		const target = path.join(out, `${m}-${path.basename(f.file, '.md')}.md`);
		fs.writeFileSync(target, lines.join('\n'));
		total++;
	}
}
console.log(`${total} briefs in ${out}`);
