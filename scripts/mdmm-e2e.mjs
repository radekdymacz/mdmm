#!/usr/bin/env node
// The evidence report of an end-to-end run (scripts/mdmm-e2e.sh): the editors' journeys on the real firmware, joined to
// the feature rows (doc/features/<md|mm>.json) and to the snapshots the run took. Plain Node, no dependencies.
//
//   node scripts/mdmm-e2e.mjs --out <evidence folder> [--page <page-tier run folder>] [--write-data] <run folder>...
//
// A run folder is the report folder of scripts/mdmm-journeys.sh (md-standalone-1/journeys.txt, ...). The snapshots are
// <evidence folder>/shots/<name>.png (scripts/mdmm-snap.py). Writes
//   <out>/index.html            chapter, section, row, steps, pass or fail, picture; reds first
//   <out>/e2e-<machine>.json    the derived data, one entry per row
//   <out>/report.txt            the counts, for the terminal
// --write-data also writes doc/features/e2e-<machine>.json (what scripts/mdmm-guide.mjs shows as the maps' E2E column;
// derived, never edited by hand).
// Exit status: nonzero when a journey failed, when a full run lacks journeys or rows are missing/failed, or when no
// journey result was read at all. --full says the run was meant to cover every journey of --machines (md, mm, both;
// default both); without it the run is targeted and journeys that did not run are "not selected", not "missing".
// --page: the page tier's run (scripts/mdmm-page.mjs, the stub machine): a row whose
// journeys pass there and not on the firmware is "stub-only".
//
// A row's result: pass (every journey that proves it passed on the firmware), fail (one failed there), stub-only (it
// passed on the stub and failed or was skipped on the firmware), skipped (every journey of it skipped, with the reason),
// missing (FULL run only: a done row no journey proves, or one with a journey that did not run: a red item that fails
// the run), not selected (TARGETED run only: some of its journeys were not asked for; never "pass"), n/a (the row is not done:
// partial, hardware, later, not-needed: listed with its reason, not a red item).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJourneys, journeysByRow } from './mdmm-journey-index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MACHINES = ['md', 'mm'];
const args = process.argv.slice(2);
let out = '', pageRun = '', writeData = false, full = false, machinesArg = 'both';
const runs = [];
for (let i = 0; i < args.length; i++) {
	if (args[i] === '--out') out = path.resolve(args[++i]);
	else if (args[i] === '--page') pageRun = path.resolve(args[++i]);
	else if (args[i] === '--write-data') writeData = true;
	else if (args[i] === '--full') full = true;
	else if (args[i] === '--machines') machinesArg = args[++i];
	else runs.push(path.resolve(args[i]));
}
if (!out || !runs.length) { console.error('usage: node scripts/mdmm-e2e.mjs --out <folder> [--page <run>] [--write-data] [--full] [--machines md|mm|both] <run folder>...'); process.exit(2); }
if (!['md', 'mm', 'both'].includes(machinesArg)) { console.error('--machines: md, mm or both'); process.exit(2); }
const inScope = (m) => machinesArg === 'both' || machinesArg === m;
fs.mkdirSync(out, { recursive: true });
const shotsDir = path.join(out, 'shots');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- what the runs said ---------- */
function readRun(dir) {
	const res = new Map(); // journey name -> {result, reason, steps[], shots[], tidy}
	const get = (n) => { if (!res.has(n)) res.set(n, { name: n, result: '', reason: '', steps: [], shots: [], notes: [] }); return res.get(n); };
	const files = [];
	const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
		const p = path.join(d, e.name);
		if (e.isDirectory()) walk(p); else if (e.name === 'journeys.txt' || e.name === 'report.txt') files.push(p); } };
	walk(dir);
	for (const f of files) {
		for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
			let m;
			if ((m = /^JOURNEY (\S+) (\d+)\/(\d+) (ok|FAIL|skip) (.*?)\r?$/.exec(line))) {
				/* skip: a pageOnly step on the firmware (what the plug-in sends is not reported, I-027) */
				const j = get(m[1]); j.steps.push({ i: +m[2], n: +m[3], ok: m[4] !== 'FAIL', text: m[4] === 'skip' ? 'skipped: ' + m[5] : m[5] });
			} else if ((m = /^JOURNEY (\S+) (PASS|FAIL|SKIP)(?: (.*?))?\r?$/.exec(line))) {
				const j = get(m[1]); j.result = m[2]; j.reason = m[3] || '';
			} else if ((m = /^JOURNEY (\S+) SHOT (\S+)\r?$/.exec(line))) get(m[1]).shots.push(m[2]);
			else if ((m = /^JOURNEY (\S+) (before|tidy): (.*?)\r?$/.exec(line))) get(m[1]).notes.push(`${m[2]}: ${m[3]}`);
		}
	}
	return res;
}
const merge = (list) => { const all = new Map(); for (const r of list) for (const [k, v] of r) all.set(k, v); return all; };
const real = merge(runs.map(readRun));
const page = pageRun ? readRun(pageRun) : null;

/* ---------- the rows ---------- */
const journeys = readJourneys(root);
const by = journeysByRow(journeys);
const known = new Set(journeys.map((j) => j.name));
const shotFile = (n) => fs.existsSync(path.join(shotsDir, `${n}.webp`));
const pictureOf = (names) => {
	const shots = names.flatMap((n) => real.get(n)?.shots || []).filter(shotFile);
	return shots.find((s) => !s.startsWith('e2e-')) || shots[0] || '';
};
function rowResult(row, machine) {
	if (row.status !== 'done') return { result: 'n/a', why: `${row.status}${row.plan ? ', plan ' + row.plan : ''}${row.planReason ? ': ' + row.planReason : ''}` };
	const names = (by.get(row.id) || []).filter((n) => known.has(n));
	if (!names.length) return { result: 'missing', why: 'no journey names this row in proves:', journeys: [] };
	const r = (n) => real.get(n)?.result;
	const failed = names.filter((n) => r(n) === 'FAIL'), passed = names.filter((n) => r(n) === 'PASS'), skipped = names.filter((n) => r(n) === 'SKIP');
	const notRan = names.filter((n) => !r(n));
	const stubOk = (n) => page && page.get(n)?.result === 'PASS';
	let result, why = '';
	if (failed.length) {
		result = failed.every(stubOk) ? 'stub-only' : 'fail';
		why = failed.map((n) => `${n}: ${real.get(n).reason}`).join(' | ');
	} else if (notRan.length && (!inScope(machine) || !full)) {
		result = 'not selected';
		why = `${notRan.length} of ${names.length} journeys not selected in this run: ${notRan.join(' ')}`;
	} else if (notRan.length) {
		result = 'missing';
		why = `${notRan.length} of ${names.length} journeys did not run in a full run: ${notRan.join(' ')}`;
	} else if (passed.length === names.length) result = 'pass';
	else { result = names.every(stubOk) ? 'stub-only' : 'skipped'; why = skipped.map((n) => `${n}: ${real.get(n).reason}`).join(' | '); }
	if (result === 'pass' && !pictureOf(names)) why = 'passed, no picture';
	return { result, why, journeys: names };
}

const data = {};
const lines = [];
const sections = [];
let reds = [];
for (const m of MACHINES) {
	const d = JSON.parse(fs.readFileSync(path.join(root, 'doc', 'features', `${m}.json`), 'utf8'));
	const entries = {};
	const tally = {};
	for (const row of d.rows) {
		const r = rowResult(row, m);
		const e = { result: r.result, journeys: r.journeys || [], shot: r.result === 'n/a' ? '' : pictureOf(r.journeys || []) };
		if (r.why) e.why = r.why;
		entries[row.id] = e;
		tally[r.result] = (tally[r.result] || 0) + 1;
		if (['fail', 'stub-only', 'missing', 'skipped'].includes(r.result)) reds.push({ m, row, e });
		else if (r.result === 'pass' && !e.shot) reds.push({ m, row, e: { ...e, result: 'no picture' } });
	}
	data[m] = { machine: m, run: { version: process.env.MDMM_E2E_VERSION || '', date: new Date().toISOString().slice(0, 10), commit: process.env.MDMM_E2E_COMMIT || '', firmware: process.env.MDMM_E2E_FIRMWARE || '' }, rows: entries };
	fs.writeFileSync(path.join(out, `e2e-${m}.json`), JSON.stringify(data[m], null, '\t') + '\n');
	if (writeData) fs.writeFileSync(path.join(root, 'doc', 'features', `e2e-${m}.json`), JSON.stringify({ machine: m, run: data[m].run, rows: Object.fromEntries(Object.entries(entries).map(([id, e]) => [id, { result: e.result, shot: e.shot, journeys: e.journeys }])) }, null, '\t') + '\n');
	lines.push(`${m.toUpperCase()}: ${d.rows.length} rows: ${Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(', ')}`);
	sections.push({ m, d, entries });
}
const total = { pass: 0, fail: 0, skip: 0 };
for (const j of real.values()) { if (j.result === 'PASS') total.pass++; else if (j.result === 'FAIL') total.fail++; else if (j.result === 'SKIP') total.skip++; }
lines.push(`journeys on the firmware: ${total.pass} pass, ${total.fail} fail, ${total.skip} skip, ${real.size} in all` + (page ? `; on the stub: ${[...page.values()].filter((j) => j.result === 'PASS').length} pass` : ''));
const verdictFail = [];
if (total.fail) verdictFail.push(`${total.fail} journey(s) failed`);
if (!real.size) verdictFail.push('no journey result was read from the run folder(s)');
const rowsBad = reds.filter((x) => x.e.result === 'fail' || (x.e.result === 'missing' && full && inScope(x.m))).length;
if (rowsBad) verdictFail.push(`${rowsBad} row(s) failed or missing`);
const noRow = journeys.filter((j) => real.get(j.name)?.result && !(j.proves || []).length).map((j) => j.name);
const notRun = journeys.filter((j) => !real.get(j.name)?.result).map((j) => j.name);
lines.push(`journeys not in the run: ${notRun.length}`);
const fullMissing = full ? notRun.filter((n) => inScope(n.slice(0, 2))) : [];
if (fullMissing.length) verdictFail.push(`${fullMissing.length} journey(s) missing in a full run`);
lines.push(`run: ${full ? 'full (' + machinesArg + ')' : 'targeted'}`);

/* ---------- the guide's pictures ---------- */
const guideShots = new Map(); // name -> where
for (const m of MACHINES) {
	const dir = path.join(root, 'doc', 'guide', m);
	for (const f of fs.readdirSync(dir)) for (const mm of fs.readFileSync(path.join(dir, f), 'utf8').matchAll(/\(shot:([^)]+)\)/g)) if (!guideShots.has(mm[1])) guideShots.set(mm[1], `${m}/${f}`);
}
const missingShots = [...guideShots].filter(([n]) => !shotFile(n));
lines.push(`guide pictures: ${guideShots.size} asked for, ${guideShots.size - missingShots.length} taken, ${missingShots.length} missing`);

/* ---------- the review's defects (review.json: [{shot, defect, severity}], written by the screenshot review) ---------- */
let review = [];
try { review = JSON.parse(fs.readFileSync(path.join(out, 'review.json'), 'utf8')); } catch { /* none yet */ }
let shotBytes = 0, shotCount = 0;
for (const f of fs.existsSync(shotsDir) ? fs.readdirSync(shotsDir) : []) if (f.endsWith('.webp')) { shotBytes += fs.statSync(path.join(shotsDir, f)).size; shotCount++; }
lines.push(`pictures: ${shotCount} WebP files, ${(shotBytes / 1e6).toFixed(1)} MB in all`);
lines.push(`screenshot review: ${review.length} defects listed`);

lines.push(verdictFail.length ? `VERDICT: FAIL (${verdictFail.join('; ')})` : 'VERDICT: PASS');

/* ---------- index.html ---------- */
const COLOR = { 'not selected': '#6e7781', pass: '#1a7f37', fail: '#cf222e', 'stub-only': '#bc4c00', missing: '#cf222e', skipped: '#9a6700', 'n/a': '#6e7781', 'no picture': '#9a6700' };
const badge = (r) => `<b class="b" style="background:${COLOR[r] || '#6e7781'}">${esc(r)}</b>`;
const img = (n, w = 360) => n && shotFile(n) ? `<a href="shots/${esc(n)}.webp"><img loading="lazy" src="shots/${esc(n)}.webp" width="${w}"></a>` : '';
const stepsHtml = (names) => names.map((n) => {
	const j = real.get(n);
	if (!j) return `<div class="j"><code>${esc(n)}</code> not in this run</div>`;
	return `<details class="j"><summary>${badge(j.result === 'PASS' ? 'pass' : j.result === 'SKIP' ? 'skipped' : 'fail')} <code>${esc(n)}</code>${j.reason ? ` <span class="why">${esc(j.reason)}</span>` : ''}</summary><ol>${j.steps.map((s) => `<li class="${s.ok ? 'ok' : 'bad'}">${esc(s.text)}</li>`).join('')}</ol>${j.shots.filter(shotFile).map((s) => img(s, 280)).join(' ')}</details>`;
}).join('');
const redRows = (list) => list.map(({ m, row, e }) => `<tr><td>${badge(e.result)}</td><td>${row.id}</td><td>${esc(row.chapter)}${row.section ? ' / ' + esc(row.section) : ''}</td><td>${esc(row.function)}</td><td class="why">${esc(e.why || '')}</td><td>${img(e.shot, 160)}</td></tr>`).join('');
const html = [`<!doctype html><meta charset="utf-8"><title>E2E evidence ${esc(data.md.run.version)}</title><style>
body{font:14px/1.45 -apple-system,system-ui,sans-serif;margin:24px;max-width:1280px;background:#fafafa;color:#1f2328}
h1,h2,h3{margin:1.2em 0 .4em} table{border-collapse:collapse;width:100%} td,th{border-bottom:1px solid #d0d7de;padding:4px 8px;vertical-align:top;text-align:left}
.b{color:#fff;border-radius:4px;padding:1px 6px;font-size:12px;font-weight:600} .why{color:#656d76;font-size:12px} .ok{color:#1a7f37} .bad{color:#cf222e}
details.j{margin:2px 0 2px 12px} code{font-size:12px} pre{background:#f0f2f4;padding:8px;overflow:auto} img{border:1px solid #d0d7de;border-radius:4px;margin:2px}
.def{display:inline-block;vertical-align:top;width:380px;margin:6px;font-size:12px}</style>`,
`<h1>End-to-end evidence, ${esc(data.md.run.version)} (${esc(data.md.run.date)})</h1>`];
/* summary.html (written by hand after a run: the morning summary, the findings with their pictures) goes first */
try { html.push(fs.readFileSync(path.join(out, 'summary.html'), 'utf8')); } catch { /* none */ }
html.push(`<h2>Counts</h2><pre>${esc(lines.join('\n'))}</pre>`);

html.push(`<h2>Red items (${reds.length})</h2><p class="why">Failures, stub-only, missing and skipped done rows, and rows that pass with no picture.</p><table><tr><th>Result<th>Row<th>Chapter<th>Function<th>Why<th>Picture</tr>${redRows(reds)}</table>`);
if (review.length) html.push(`<h2>Screenshot review: defects (${review.length})</h2>${review.map((r) => `<div class="def"><b>${esc(r.severity || '')}</b> ${esc(r.shot)}: ${esc(r.defect)}<br>${img(r.shot, 360)}</div>`).join('')}`);
if (missingShots.length) html.push(`<h2>Guide pictures not taken (${missingShots.length})</h2><ul>${missingShots.map(([n, w]) => `<li><code>${esc(n)}</code> asked for in ${esc(w)}</li>`).join('')}</ul>`);
if (noRow.length || notRun.length) html.push(`<h2>Journeys</h2><p class="why">Run, proving no row: ${esc(noRow.join(' '))}</p><p class="why">Not in this run: ${esc(notRun.join(' '))}</p>`);
for (const { m, d, entries } of sections) {
	html.push(`<h2>${m === 'md' ? 'Machinedrum' : 'Monomachine'}</h2>`);
	const chapters = d.doc.filter((b) => b.type === 'table').map((b) => b.chapter);
	for (const ch of chapters) {
		const rows = d.rows.filter((r) => r.chapter === ch);
		const t = {}; for (const r of rows) t[entries[r.id].result] = (t[entries[r.id].result] || 0) + 1;
		html.push(`<details><summary><b>${esc(ch)}</b> <span class="why">${Object.entries(t).map(([k, v]) => `${v} ${k}`).join(', ')}</span></summary>`);
		let sec = null;
		html.push('<table>');
		for (const r of rows) {
			if (r.section && r.section !== sec) { sec = r.section; html.push(`<tr><th colspan="4">${esc(sec)}`); }
			const e = entries[r.id];
			html.push(`<tr><td>${badge(e.result)}<br><span class="why">${r.id}</span></td><td>${esc(r.function)}<div class="why">${esc(r.manual ? 'p.' + r.manual : '')} ${esc(e.why || '')}</div></td><td>${stepsHtml(e.journeys)}</td><td>${img(e.shot)}</td></tr>`);
		}
		html.push('</table></details>');
	}
}
fs.writeFileSync(path.join(out, 'index.html'), html.join('\n'));
fs.writeFileSync(path.join(out, 'report.txt'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
console.log(`report: ${path.join(out, 'index.html')}`);
process.exitCode = verdictFail.length ? 1 : 0;
