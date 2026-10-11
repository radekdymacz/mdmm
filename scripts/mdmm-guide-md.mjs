// The guide's chapters: doc/guide/<md|mm>/<nn-slug>.md, hand-written prose (doc/guide/STYLE.md) with a few marks
// for what changes with the code, so a re-run follows the code (doc/guide/README.md). No dependencies.
// Used by scripts/mdmm-guide.mjs (pages, --check, --stamp) and scripts/mdmm-features-check.mjs.
//
// Blocks: # chapter title, ## section, ### part of a section; paragraphs; numbered and bulleted lists (a line
// indented by two or more spaces goes on the item before); NOTE: and TIP: paragraphs; a picture on its own line,
// ![caption](shot:name); simple pipe tables; {table:<source>} on its own line, a table made from data;
// <!-- summary: ... --> and <!-- rows: MM-251 MM-252 @a1b2c3 --> comments, never shown.
// Inline: **control**, [KEY], <LCD FIELD>, *emphasis*, `code`, [text](link), and from data:
//   {key:<action>}          the key(s) of that action in doc/modern-ux/keymap.json (the machine's list)
//   {gap:<row>}text{/gap}   shown while the row is not done; once it is, the text goes and the check asks for the
//                           section's procedure
//   {bug:<B-nnn>}text{/bug} shown while the bug is open in doc/release/BUGS.md
//   {lcd:SONG 01 · 65 rows}  a readout as the LCD shows it (monospace on the web page)
//   {see:#section-anchor}    a link to a section of the same chapter, named by its heading; {see:#anchor|own text}
//                            for a part (### heading) or another wording. [text](#anchor) works too. The anchor is the
//                            heading in lower case with dashes: "Copy, paste and undo" is #copy-paste-and-undo
// The rows tag's @hash is a short hash of its rows' status, where and missing, and of the journeys that prove them:
// when it no longer matches, the section needs review; `scripts/mdmm-guide.mjs --stamp <file>` writes it again.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const guideDir = (root, machine) => path.join(root, 'doc', 'guide', machine);

// every chapter file of a machine: { file, slug, src }
export function chapterFiles(root, machine) {
	const dir = guideDir(root, machine);
	if (!fs.existsSync(dir)) return [];
	return fs.readdirSync(dir).filter((f) => /^\d\d-[a-z0-9-]+\.md$/.test(f)).sort()
		.map((f) => ({ file: path.join(dir, f), slug: f.replace(/\.md$/, ''), src: fs.readFileSync(path.join(dir, f), 'utf8') }));
}

/* ---------- reading ---------- */

const ROWS_TAG = /^<!--\s*rows:\s*([\s\S]*?)\s*-->\s*$/;

export function parseBlocks(src) {
	const lines = src.replace(/\r\n?/g, '\n').split('\n');
	const blocks = [];
	let i = 0;
	const isStart = (l) => /^(#{1,3}\s|<!--|!\[|\||\d+\.\s|[-*]\s|\{table:)/.test(l) || /^(\{(?:gap|bug):[^}]+\})?(NOTE|TIP):/.test(l);
	while (i < lines.length) {
		const l = lines[i];
		if (!l.trim()) { i++; continue; }
		let m;
		if ((m = ROWS_TAG.exec(l))) {
			const parts = m[1].split(/[\s,]+/).filter(Boolean);
			blocks.push({ type: 'rows', ids: parts.filter((p) => !p.startsWith('@')), hash: (parts.find((p) => p.startsWith('@')) || '').slice(1), line: i + 1 });
			i++; continue;
		}
		if ((m = /^<!--\s*([a-z]+):\s*([\s\S]*?)\s*-->\s*$/.exec(l))) { blocks.push({ type: 'meta', key: m[1], value: m[2], line: i + 1 }); i++; continue; }
		if (/^<!--/.test(l)) { while (i < lines.length && !lines[i].includes('-->')) i++; i++; continue; }
		if ((m = /^(#{1,3})\s+(.*)$/.exec(l))) { blocks.push({ type: 'h', level: m[1].length, text: m[2].trim(), line: i + 1 }); i++; continue; }
		if ((m = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/.exec(l))) { blocks.push({ type: 'img', caption: m[1], src: m[2], line: i + 1 }); i++; continue; }
		if ((m = /^\{table:([^}]+)\}\s*$/.exec(l))) { blocks.push({ type: 'gen', source: m[1].trim(), line: i + 1 }); i++; continue; }
		if (/^\|/.test(l)) {
			const rows = [];
			const line = i + 1;
			while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
			const cells = (r) => r.replace(/^\||\|\s*$/g, '').split('|').map((c) => c.trim());
			const body = rows.filter((r) => !/^\|[\s:|-]+\|?\s*$/.test(r)).map(cells);
			blocks.push({ type: 'table', head: body[0], rows: body.slice(1), line });
			continue;
		}
		if ((m = /^(\d+)\.\s+(.*)$/.exec(l)) || (m = /^([-*])\s+(.*)$/.exec(l))) {
			const ordered = /^\d/.test(m[1]);
			const items = [];
			const start = ordered ? +m[1] : 1, line = i + 1;
			while (i < lines.length) {
				const it = ordered ? /^\d+\.\s+(.*)$/.exec(lines[i]) : /^[-*]\s+(.*)$/.exec(lines[i]);
				if (it) { items.push(it[1]); i++; continue; }
				if (items.length && /^\s{2,}\S/.test(lines[i])) { items[items.length - 1] += ' ' + lines[i].trim(); i++; continue; }
				break;
			}
			blocks.push({ type: ordered ? 'ol' : 'ul', start, items, line });
			continue;
		}
		const para = [l.trim()];
		const line = i + 1;
		i++;
		while (i < lines.length && lines[i].trim() && !isStart(lines[i])) para.push(lines[i++].trim());
		const text = para.join(' ');
		// a note may sit inside a mark ({bug:B-045}NOTE: ...{/bug}): the mark wraps the note's text, so the note goes with it
		if ((m = /^(\{(?:gap|bug):[^}]+\})?(NOTE|TIP):\s*(.*)$/.exec(text))) blocks.push({ type: 'note', kind: m[2].toLowerCase(), text: (m[1] || '') + m[3], line });
		else blocks.push({ type: 'p', text, line });
	}
	return blocks;
}

// a chapter: title, summary, intro and sections; each part has its rows tags (ids, hash, line)
export function parseChapter(src) {
	const ch = { title: '', num: 0, summary: '', intro: { heading: '(chapter intro)', tags: [], blocks: [] }, sections: [] };
	let cur = ch.intro;
	for (const b of parseBlocks(src)) {
		if (b.type === 'h' && b.level === 1) {
			const m = /^(\d+)\.\s*(.*)$/.exec(b.text);
			ch.num = m ? +m[1] : 0;
			ch.title = m ? m[2] : b.text;
			continue;
		}
		if (b.type === 'h' && b.level === 2) { cur = { heading: b.text, tags: [], blocks: [] }; ch.sections.push(cur); continue; }
		if (b.type === 'meta' && b.key === 'summary') { ch.summary = b.value; continue; }
		if (b.type === 'rows') { cur.tags.push(b); continue; }
		if (b.type === 'meta') continue;
		cur.blocks.push(b);
	}
	for (const s of [ch.intro, ...ch.sections]) s.rows = s.tags.flatMap((t) => t.ids);
	return ch;
}
export const partsOf = (ch) => [ch.intro, ...ch.sections];

/* ---------- data: the key map, the bugs, the row hash ---------- */

export function readKeymap(root) {
	return JSON.parse(fs.readFileSync(path.join(root, 'doc', 'modern-ux', 'keymap.json'), 'utf8'));
}

const KEY_NAME = { Space: 'SPACE', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Delete: 'DELETE', Backspace: 'BACKSPACE', Enter: 'ENTER', Escape: 'ESC', Arrows: 'ARROWS' };
const MOD_NAME = { cmd: '⌘', shift: '⇧', alt: '⌥', ctrl: 'CTRL' };

// a key map entry as guide text: "[⌘] + [C]", "[←] or [→]"; a mouse entry (with `area`) gives its modifier only
export function keyText(e) {
	const mods = (e.mod || '').split('+').filter(Boolean).map((m) => `[${MOD_NAME[m] || m.toUpperCase()}]`);
	if (e.area) return mods.join(' + ');
	return e.keys.map((k) => [...mods, `[${KEY_NAME[k] || k.toUpperCase()}]`].join(' + ')).join(' or ');
}

// B-numbers in doc/release/BUGS.md and whether each is open ("**Status:** open...")
export function readBugs(root) {
	const src = fs.readFileSync(path.join(root, 'doc', 'release', 'BUGS.md'), 'utf8');
	const bugs = new Map();
	for (const part of src.split(/^## /m).slice(1)) {
		const id = /^(B-\d+)/.exec(part)?.[1];
		if (!id) continue;
		const status = /\*\*Status:\*\*\s*([^\n]*)/.exec(part)?.[1] || '';
		bugs.set(id, !/^(fixed|closed|done|not a bug|gone)/i.test(status.trim()));
	}
	return bugs;
}

// the hash of a section's rows: status, where, missing and the journeys that prove each
export function rowsHash(ids, byId, journeysOf) {
	const facts = [...new Set(ids)].sort().map((id) => {
		const r = byId.get(id) || {};
		return [id, r.status ?? null, r.where ?? null, r.missing ?? null, [...(journeysOf.get(id) || [])].sort()];
	});
	return crypto.createHash('sha1').update(JSON.stringify(facts)).digest('hex').slice(0, 6);
}

/* ---------- the marks in the text ---------- */

const MARK = /\{(gap|bug):([A-Z]+-[A-Z0-9]+)\}([\s\S]*?)\{\/\1\}|\{key:([a-z0-9-]+)\}/g;

// every mark in a text: [{ kind: 'gap'|'bug'|'key', id }]
export function marksIn(text) {
	return [...String(text).matchAll(MARK)].map((m) => (m[4] ? { kind: 'key', id: m[4] } : { kind: m[1], id: m[2] }));
}

// ctx: { machine, byId, keymap, bugs }; unknown marks are left as they are (the check names them)
export function expand(text, ctx) {
	return String(text).replace(MARK, (all, kind, id, inner, key) => {
		if (key) {
			const e = ctx.keymap[ctx.machine].find((x) => x.id === key);
			return e ? keyText(e) : all;
		}
		if (kind === 'gap') return ctx.byId.get(id)?.status === 'done' ? '' : expand(inner, ctx);
		return ctx.bugs.get(id) === false ? '' : expand(inner, ctx);
	}).replace(/\s{2,}/g, ' ').trim();
}

// the text a reader sees, for the word checks: comments, marks' names and picture names out, captions kept
export function visibleText(src) {
	return src.replace(/<!--[\s\S]*?-->/g, '').replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/\{(gap|bug):[^}]+\}|\{\/(gap|bug)\}|\{key:[^}]+\}|\{table:[^}]+\}/g, '');
}

/* ---------- generated tables ---------- */

// {table:<source>:<arg>}: reference tables made from the code's own data. Sources:
//   keys:<group>   the keys of one group of the key map (doc/modern-ux/keymap.json), with what each does
// To come with the appendices: the machines' parameters (elektronData), the CC and SysEx tables.
export const TABLES = {
	keys: (ctx, group) => {
		const list = ctx.keymap[ctx.machine].filter((e) => e.group === group);
		if (!list.length) return null;
		return { head: ['Key', 'What it does'], rows: list.map((e) => [e.area ? [keyText(e), e.keys.join(', ')].filter(Boolean).join(' + ') : keyText(e), e.does]) };
	},
};
export function genTable(source, ctx) {
	const [name, ...rest] = source.split(':');
	return TABLES[name] ? TABLES[name](ctx, rest.join(':')) : null;
}

/* ---------- writing HTML ---------- */

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const slugOf = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// headings: Map anchor -> heading text of the chapter, for {see:#anchor}
export function inline(s, headings) {
	const keep = [];
	const hold = (html) => `\u0000${keep.push(html) - 1}\u0000`;
	let t = String(s)
		.replace(/`([^`]+)`/g, (_, c) => hold(`<code>${esc(c)}</code>`))
		.replace(/\{lcd:([^}]+)\}/g, (_, c) => hold(`<span class="gd-lcd">${esc(c)}</span>`))
		.replace(/\{see:#([a-z0-9-]+)(?:\|([^}]+))?\}/g, (_, a, own) => hold(`<a class="gd-see" href="#${a}">${esc(own || headings?.get(a) || a.replace(/-/g, ' '))}</a>`))
		.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, txt, href) => hold(`<a href="${esc(href)}">${inline(txt, headings)}</a>`));
	t = esc(t)
		.replace(/\*\*([^*]+)\*\*/g, '<b class="gd-ui">$1</b>')
		.replace(/\[([^\]]+)\]/g, '<kbd class="gd-key">[$1]</kbd>')
		.replace(/&lt;([A-Z0-9][A-Z0-9 /+.·-]*)&gt;/g, '<b class="gd-light">&lt;$1&gt;</b>')
		.replace(/\*([^*]+)\*/g, '<em>$1</em>');
	return t.replace(/\u0000(\d+)\u0000/g, (_, n) => keep[+n]);
}

const tableHtml = (head, rows, x) => `<table class="gd-table"><thead><tr>${head.map((c) => `<th>${x(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${x(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

// blocks as HTML. ctx as for expand, plus shot(name, caption) for a picture. A paragraph, note or item whose text
// is all gaps of done rows is left out.
export function renderBlocks(blocks, ctx) {
	const x = (t) => inline(expand(t, ctx), ctx.headings);
	const web = !!ctx.web;
	const out = [];
	let open = null;	// web: the note box that the next note of the same kind joins
	const close = () => { if (open) { out.push(`<aside class="gd-note gd-${open.kind}"><span class="gd-notelab">${open.kind === 'tip' ? 'Tip' : 'Note'}</span>${open.ps.join('')}</aside>`); open = null; } };
	for (const b of blocks) {
		if (b.type === 'note' && web) {
			const t = expand(b.text, ctx);
			if (!t) continue;
			if (open && open.kind !== b.kind) close();
			(open ||= { kind: b.kind, ps: [] }).ps.push(`<p>${inline(t, ctx.headings)}</p>`);
			continue;
		}
		close();
		if (b.type === 'h') out.push(`<h${b.level + 1} class="gd-h${b.level}"${web ? ` id="${slugOf(b.text)}"` : ''}>${x(b.text)}</h${b.level + 1}>`);
		else if (b.type === 'p') {
			const t = expand(b.text, ctx);
			if (!t) continue;
			const gap = web && /^\{gap:[A-Z]+-[A-Z0-9]+\}(?:(?!\{gap:)[\s\S])*\{\/gap\}$/.test(b.text);
			out.push(gap ? `<p class="gd-gap"><span class="gd-gaplab">Not in the editor yet:</span> ${inline(t, ctx.headings)}</p>` : `<p>${inline(t, ctx.headings)}</p>`);
		}
		else if (b.type === 'note') { const t = expand(b.text, ctx); if (t) out.push(`<aside class="gd-note gd-${b.kind}"><span class="gd-notelab">${b.kind === 'tip' ? 'Tip' : 'Note'}</span><p>${inline(t, ctx.headings)}</p></aside>`); }
		else if (b.type === 'ol' || b.type === 'ul') {
			const items = b.items.map((t) => expand(t, ctx)).filter(Boolean);
			if (!items.length) continue;
			const tag = b.type === 'ol' ? `ol class="gd-steps"${b.start !== 1 ? ` start="${b.start}"` : ''}` : 'ul class="gd-list"';
			out.push(`<${tag}>${items.map((t) => `<li>${inline(t, ctx.headings)}</li>`).join('')}</${b.type}>`);
		}
		else if (b.type === 'table') out.push(tableHtml(b.head, b.rows, x));
		else if (b.type === 'gen') { const t = genTable(b.source, ctx); if (t) out.push(tableHtml(t.head, t.rows, (c) => inline(c, ctx.headings))); }
		else if (b.type === 'img') out.push(ctx.shot(b.src.replace(/^shot:/, ''), b.caption));
	}
	close();
	return out.join('\n');
}

/* ---------- the check ---------- */

const BANNED = ['simply', 'just', 'easily', 'seamless', 'seamlessly', 'powerful', 'intuitive', "let's", 'dive into', "whether you're", "it's worth noting", 'in other words'];

// The guide against the data. errors: broken (unknown ids, keys, tables; banned words, dashes); stale: sections
// to review (hash changed or missing, a gap whose row is done); reports: done rows in no chapter.
// data: { md, mm } as in doc/features/*.json; journeysOf: row id -> journey names.
export function checkGuide(root, data, journeysOf, chapterSlugs) {
	const errors = [], stale = [], reports = [];
	const keymap = readKeymap(root), bugs = readBugs(root);
	const files = fs.existsSync(path.join(root, 'doc', 'guide')) ? fs.readdirSync(path.join(root, 'doc', 'guide'), { recursive: true }).filter((f) => f.endsWith('.md')) : [];
	for (const f of files) {
		if (path.basename(f) === 'STYLE.md') continue;
		const rel = path.join('doc', 'guide', f);
		const src = fs.readFileSync(path.join(root, rel), 'utf8');
		src.split('\n').forEach((line, i) => {
			const vis = visibleText(line);
			if (/[–—]/.test(line)) errors.push(`${rel}:${i + 1}: an en or em dash (STYLE.md: a full stop, comma, colon or brackets)`);
			if (vis.includes('!')) errors.push(`${rel}:${i + 1}: an exclamation mark`);
			for (const w of BANNED) if (new RegExp(`(^|[^a-z'])${w.replace(/'/g, "['’]")}([^a-z]|$)`, 'i').test(vis)) errors.push(`${rel}:${i + 1}: "${w}" (STYLE.md)`);
		});
	}
	const tagged = new Set();
	for (const machine of ['md', 'mm']) {
		const byId = new Map(data[machine].rows.map((r) => [r.id, r]));
		const ctx = { machine, byId, keymap, bugs };
		for (const f of chapterFiles(root, machine)) {
			const rel = path.relative(root, f.file);
			if (chapterSlugs && !chapterSlugs[machine].includes(f.slug)) errors.push(`${rel}: no chapter of the manual is called so`);
			const ch = parseChapter(f.src);
			for (const part of partsOf(ch)) {
				const where = `${rel} "${part.heading}"`;
				for (const t of part.tags) {
					for (const id of t.ids) {
						if (!byId.has(id)) errors.push(`${rel}:${t.line}: rows tag names ${id}, which is not in doc/features/${machine}.json`);
						tagged.add(id);
					}
					const now = rowsHash(t.ids, byId, journeysOf);
					if (!t.hash) stale.push(`${where}: not stamped (scripts/mdmm-guide.mjs --stamp ${rel})`);
					else if (t.hash !== now) stale.push(`${where}: needs review, its rows changed since stamped (now ${t.ids.map((id) => `${id} ${byId.get(id)?.status}`).join(', ')})`);
				}
				const texts = part.blocks.flatMap((b) => [b.text, ...(b.items || []), ...(b.head || []), ...(b.rows || []).flat()].filter(Boolean));
				for (const mk of texts.flatMap(marksIn)) {
					if (mk.kind === 'key' && !keymap[machine].some((e) => e.id === mk.id)) errors.push(`${where}: {key:${mk.id}} is not in the ${machine.toUpperCase()} key map`);
					if (mk.kind === 'gap') {
						if (!byId.has(mk.id)) errors.push(`${where}: {gap:${mk.id}} names a row that is not in the data`);
						else if (!part.rows.includes(mk.id)) errors.push(`${where}: {gap:${mk.id}}: add ${mk.id} to the section's rows tag`);
						else if (byId.get(mk.id).status === 'done') stale.push(`${where}: ${mk.id} is done, its gap sentence is hidden: write the procedure (STYLE.md), then stamp`);
					}
					if (mk.kind === 'bug' && !bugs.has(mk.id)) errors.push(`${where}: {bug:${mk.id}} is not in doc/release/BUGS.md`);
				}
				for (const b of part.blocks) if (b.type === 'gen' && !genTable(b.source, ctx)) errors.push(`${rel}:${b.line}: {table:${b.source}}: no such data`);
			}
		}
		const untagged = data[machine].rows.filter((r) => r.status === 'done' && !tagged.has(r.id));
		if (untagged.length) reports.push(`${machine}: ${untagged.length} done rows are in no guide chapter yet`);
	}
	return { errors, stale, reports };
}

// --stamp: write the current hash into every rows tag of a chapter file
export function stampFile(file, byId, journeysOf) {
	const src = fs.readFileSync(file, 'utf8');
	let n = 0;
	const out = src.split('\n').map((line) => {
		const m = ROWS_TAG.exec(line);
		if (!m) return line;
		const ids = m[1].split(/[\s,]+/).filter((p) => p && !p.startsWith('@'));
		n++;
		return `<!-- rows: ${ids.join(' ')} @${rowsHash(ids, byId, journeysOf)} -->`;
	}).join('\n');
	fs.writeFileSync(file, out);
	return n;
}
