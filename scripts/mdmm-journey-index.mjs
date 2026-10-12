// Reads the journey files as text (nothing is run) and lists each journey with the feature rows it proves.
// Shared by mdmm-features-check.mjs and mdmm-guide.mjs. Plain Node, no dependencies.
// A journey names its rows in a `proves: ["MD-107", ...]` field beside `name:` (an object literal), or in the options
// object of a helper that builds journeys (tapWith, genJourney, editorMenuJourney, memoryJourney). `proves: []` says it proves none
// (boot, focus, layout, screenshots). Journey.viewJourneys(prefix, ...) makes two such journeys itself.
// Only names that start with md- or mm- are journeys: demos (demo-md-...) and the view lists of viewJourneys are not.

import fs from 'node:fs';
import path from 'node:path';

export const JOURNEY_FILES = [
	{ machine: 'md', file: 'source/elektron/md/mdJucePlugin/skins/mdStudio/mdDeskJourneys.js' },
	{ machine: 'mm', file: 'source/elektron/md/mdJucePlugin/skins/mmStudio/mmJourneys.js' },
];
const HELPERS = ['tapWith', 'genJourney', 'editorMenuJourney', 'memoryJourney'];

// Same length as src; comments, regex literals and the insides of strings become spaces (quotes stay), so that a
// search for code finds only code. Also returns the matching close index for every bracket.
function mask(src) {
	const out = src.split('');
	const match = new Map();
	const stack = []; // open brackets, or 'tpl' for a ${ in a template
	let i = 0;
	let prev = '';
	const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' '; };
	const template = () => { // i is just after the opening ` or after the } that ends a ${
		const start = i;
		while (i < src.length) {
			const c = src[i];
			if (c === '\\') { i += 2; continue; }
			if (c === '`') { blank(start, i); i++; prev = '`'; return; }
			if (c === '$' && src[i + 1] === '{') { blank(start, i); stack.push('tpl'); i += 2; prev = '{'; return; }
			i++;
		}
	};
	while (i < src.length) {
		const c = src[i];
		if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); const end = e < 0 ? src.length : e; blank(i, end); i = end; continue; }
		if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? src.length : e + 2; blank(i, end); i = end; continue; }
		if (c === '"' || c === "'") {
			let k = i + 1;
			while (k < src.length && src[k] !== c) k += src[k] === '\\' ? 2 : 1;
			blank(i + 1, k); i = k + 1; prev = c; continue;
		}
		if (c === '`') { i++; template(); continue; }
		if (c === '/' && (prev === '' || '(,=:[!&|?{};>+-*%<~^'.includes(prev))) { // a regular expression
			let k = i + 1, cls = false;
			while (k < src.length && (cls || src[k] !== '/')) { if (src[k] === '\\') k++; else if (src[k] === '[') cls = true; else if (src[k] === ']') cls = false; k++; }
			blank(i, k + 1); i = k + 1; prev = ')'; continue;
		}
		if ('({['.includes(c)) stack.push(i);
		else if (')}]'.includes(c)) {
			if (c === '}' && stack[stack.length - 1] === 'tpl') { stack.pop(); i++; template(); continue; }
			const o = stack.pop();
			if (typeof o === 'number') match.set(o, i);
		}
		if (!/\s/.test(c)) prev = c;
		i++;
	}
	return { code: out.join(''), match };
}

// the innermost bracket pair around position p, as [open, close]
function enclosing(match, p) {
	let best = null;
	for (const [o, c] of match) if (o < p && p < c && (best === null || o > best[0])) best = [o, c];
	return best;
}

// the `proves` of an object literal [open, close] (at its own level), or undefined
function provesIn(src, code, match, [open, close]) {
	let k = open + 1;
	while (k < close) {
		if (match.has(k)) { k = match.get(k) + 1; continue; }
		const m = /^proves\s*:\s*/.exec(code.slice(k, close));
		if (m && !/[\w$]/.test(code[k - 1] || ' ')) {
			const a = k + m[0].length;
			if (code[a] !== '[') return null; // not a literal list
			return [...src.slice(a, match.get(a)).matchAll(/"([^"]+)"/g)].map((x) => x[1]);
		}
		k++;
	}
	return undefined;
}

export function parseJourneys(src, machine, file) {
	const { code, match } = mask(src);
	const found = [];
	const add = (name, proves, at) => { if (/^(md|mm)-/.test(name)) found.push({ name, proves, machine, file, line: src.slice(0, at).split('\n').length }); };
	// name: "x" inside an object literal
	for (const m of code.matchAll(/\bname\s*:\s*"(\s*)"/g)) {
		const a = m.index + m[0].indexOf('"');
		const name = src.slice(a + 1, a + 1 + m[1].length);
		const box = enclosing(match, m.index);
		if (!box || code[box[0]] !== '{') continue;
		add(name, provesIn(src, code, match, box), m.index);
	}
	// helper("x", ...)
	for (const m of code.matchAll(new RegExp(`\\b(${HELPERS.join('|')})\\(\\s*"(\\s*)"`, 'g'))) {
		const open = m.index + m[1].length;
		if (/=>\s*\(\{\s*name/.test(code.slice(Math.max(0, open - 120), open))) continue;
		const a = m.index + m[0].indexOf('"');
		const name = src.slice(a + 1, a + 1 + m[2].length);
		const close = match.get(open);
		let proves;
		const inside = /\bproves\s*:\s*\[/.exec(code.slice(open, close));
		if (inside) {
			const at = open + inside.index + inside[0].length - 1;
			proves = [...src.slice(at, match.get(at)).matchAll(/"([^"]+)"/g)].map((x) => x[1]);
		} else { // {...Journey.editorMenuJourney(...), proves: []}
			const box = enclosing(match, m.index);
			if (box && code[box[0]] === '{') proves = provesIn(src, code, match, box);
		}
		add(name, proves, m.index);
	}
	// Journey.viewJourneys("md", [...]) builds two journeys that prove nothing
	for (const m of code.matchAll(/\bviewJourneys\(\s*"(\s*)"/g)) {
		const a = m.index + m[0].indexOf('"');
		const prefix = src.slice(a + 1, a + 1 + m[1].length);
		add(`${prefix}-old-webkit`, [], m.index);
		add(`${prefix}-shots-views`, [], m.index);
	}
	return found;
}

export function readJourneys(root) {
	const all = [];
	for (const { machine, file } of JOURNEY_FILES) {
		const p = path.join(root, file);
		if (fs.existsSync(p)) all.push(...parseJourneys(fs.readFileSync(p, 'utf8'), machine, file));
	}
	return all;
}

// row id -> journey names
export function journeysByRow(journeys) {
	const by = new Map();
	for (const j of journeys) for (const id of j.proves || []) by.set(id, [...(by.get(id) || []), j.name]);
	return by;
}

// every name that a Journey.snapshot("x") takes
export function snapshotNames(root) {
	const names = new Set();
	const dirs = [path.join(root, 'source/elektron/md/mdJucePlugin/skins')];
	const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.js')) for (const m of fs.readFileSync(p, 'utf8').matchAll(/\bsnapshot\(\s*"([^"]+)"/g)) names.add(m[1]); } };
	for (const d of dirs) if (fs.existsSync(d)) walk(d);
	return names;
}
