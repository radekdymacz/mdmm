#!/usr/bin/env node
// The screenshot review of an end-to-end run (doc/release/E2E.md): the pictures split into batches for reviewers (Haiku
// subagents read WebP fine), their findings merged into review.json, which scripts/mdmm-e2e.mjs puts in the report with the
// pictures. Plain Node, no dependencies.
//   node scripts/mdmm-e2e-review.mjs batches <evidence folder> [size]   writes <evidence>/review/batch-NN.txt (a picture path a
//                                                                      line), prompt.txt and result-NN.json paths to write
//   node scripts/mdmm-e2e-review.mjs merge <evidence folder>            reads review/result-NN.json ([{shot, severity, defect}]),
//                                                                      writes <evidence>/review.json
import fs from 'node:fs';
import path from 'node:path';

const [mode, dir, sizeArg] = process.argv.slice(2);
if (!['batches', 'merge'].includes(mode) || !dir) { console.error('usage: node scripts/mdmm-e2e-review.mjs batches|merge <evidence folder> [size]'); process.exit(2); }
const out = path.resolve(dir);
const rev = path.join(out, 'review');
if (mode === 'batches') {
	fs.mkdirSync(rev, { recursive: true });
	for (const f of fs.readdirSync(rev)) fs.unlinkSync(path.join(rev, f));
	const shots = fs.readdirSync(path.join(out, 'shots')).filter((f) => f.endsWith('.webp')).sort();
	const size = +sizeArg || 25;
	let n = 0;
	for (let i = 0; i < shots.length; i += size) {
		n++;
		const id = String(n).padStart(2, '0');
		fs.writeFileSync(path.join(rev, `batch-${id}.txt`), shots.slice(i, i + size).map((s) => path.join(out, 'shots', s)).join('\n') + '\n');
	}
	fs.writeFileSync(path.join(rev, 'prompt.txt'), `You review screenshots of a web page for visual defects. The page is the Machinedrum Editor or the Monomachine Editor (a drum machine and a synth editor with a green LCD strip at the top, a grid of steps, knobs, a song arrangement). Light theme.
Open each picture of your batch with the Read tool and look at it. List only real defects, such as:
- a graph, curve, meter or canvas that is broken, empty or cut off;
- text that overlaps other text or a control, is cut off, is too small to read, or runs out of its box;
- controls that overlap, or sit outside the window;
- wrong or inconsistent colours (a dark panel in a light page, text with no contrast, a plate in the wrong colours);
- an empty panel where something should be;
- a message the person should never read: a program word such as undefined, NaN, null, [object, schema, validation, an error trace, a raw id or code name;
- a dialog that covers what it should not, or a half drawn page.
Do not report taste, the pixel font, or the green LCD look. Do not guess: if you are not sure, say "unsure" in the severity.
Write your findings to the result file named at the end as a JSON list: [{"shot":"<file name without the folder>","severity":"high|medium|low|unsure","defect":"one plain sentence saying what is wrong and where"}]. Write [] if there is none. Write the file even when empty.`);
	console.log(`${n} batches of up to ${size} in ${rev}`);
} else {
	const all = [];
	for (const f of fs.readdirSync(rev).filter((x) => /^result-\d+\.json$/.test(x)).sort()) {
		try { for (const d of JSON.parse(fs.readFileSync(path.join(rev, f), 'utf8'))) all.push({ shot: String(d.shot).replace(/\.webp$/, '').replace(/^.*\//, ''), severity: d.severity || '', defect: d.defect || '' }); }
		catch (e) { console.error(`${f}: ${e.message}`); }
	}
	fs.writeFileSync(path.join(out, 'review.json'), JSON.stringify(all, null, '\t') + '\n');
	console.log(`${all.length} defects in ${path.join(out, 'review.json')}`);
}
