#!/usr/bin/env node
// Self-test of the evidence report's verdict (scripts/mdmm-e2e.mjs), ROM-free: synthetic run folders, no build.
//   node scripts/mdmm-e2e-selftest.mjs
// Checks: a failed journey gives a nonzero exit; a row is "pass" only when every journey indexed for it passed; a row
// with some journeys absent is "missing" (and fails) in a full run and "not selected" (not "pass") in a targeted one.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { journeysByRow, readJourneys } from './mdmm-journey-index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mdmm-e2e-selftest-'));
const ROW = 'MD-009'; // several journeys prove it (md-top-tempo-drag, md-top-tempo-window, md-keys-tap-tempo...)
const all = journeysByRow(readJourneys(root)).get(ROW) || [];
let bad = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) bad++; };
check(all.length >= 2, `${ROW} has ${all.length} indexed journeys (the test needs at least 2)`);

function run(label, results, extra = []) {
	const dir = path.join(tmp, label, 'run', 'md');
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, 'journeys.txt'), Object.entries(results).map(([n, r]) => `JOURNEY ${n} ${r}${r === 'FAIL' ? ' synthetic failure' : ''}`).join('\n') + '\n');
	const out = path.join(tmp, label, 'out');
	const p = spawnSync(process.execPath, [path.join(root, 'scripts', 'mdmm-e2e.mjs'), '--out', out, ...extra, path.join(tmp, label, 'run')], { encoding: 'utf8' });
	const row = JSON.parse(fs.readFileSync(path.join(out, 'e2e-md.json'), 'utf8')).rows[ROW];
	return { status: p.status, row: row.result, why: row.why || '', text: p.stdout };
}
const some = { [all[0]]: 'PASS' };
const everything = Object.fromEntries(all.map((n) => [n, 'PASS']));

let r = run('passfail', { [all[0]]: 'PASS', [all[1]]: 'FAIL' });
check(r.status !== 0, `one PASS and one FAIL: exit ${r.status} (nonzero)`);
check(r.row === 'fail', `  ${ROW} is "${r.row}" (fail)`);

r = run('full-partial', some, ['--full', '--machines', 'md']);
check(r.status !== 0, `full run, only ${all[0]} present: exit ${r.status} (nonzero)`);
check(r.row === 'missing', `  ${ROW} is "${r.row}" (missing, not passed)`);

r = run('targeted-partial', some);
check(r.row === 'not selected', `targeted run, only ${all[0]} present: ${ROW} is "${r.row}" (not selected, not passed)`);
check(r.status === 0, `  a targeted run with no failure exits ${r.status} (0)`);

r = run('targeted-all', everything);
check(r.row === 'pass' && r.status === 0, `every journey of ${ROW} passed: "${r.row}", exit ${r.status} (pass, 0)`);

r = run('empty', {});
check(r.status !== 0, `no journey result at all: exit ${r.status} (nonzero)`);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(bad ? `e2e verdict self-test: ${bad} FAILED` : 'e2e verdict self-test: all passed');
process.exit(bad ? 1 : 0);
