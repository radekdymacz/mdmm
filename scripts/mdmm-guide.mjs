#!/usr/bin/env node
// One command for the feature maps and the guide. Reads doc/features/{md,mm}.json (the rows), doc/guide/<md|mm>/*.md
// (the hand-written chapters, doc/guide/STYLE.md), the key map, the journeys' `proves:` and the bugs; writes the two
// feature maps (doc/modern-ux/FEATURE-MAP-MD.md, -MM.md) and the guide pages (site/public/guide/md/, mm/).
// Plain Node, no dependencies. The loop: doc/guide/README.md. Plan: doc/release/PLAN-0.6.md. Data: doc/features/README.md.
// Usage: node scripts/mdmm-guide.mjs                 write the maps and the guide
//        node scripts/mdmm-guide.mjs --pdf           the same, then the two PDFs (scripts/mdmm-guide-pdf.sh)
//        node scripts/mdmm-guide.mjs --check         fail if a map is not what the JSON makes, or the guide has a
//                                                    broken reference or a section to review
//        node scripts/mdmm-guide.mjs --stamp <file>  after a section is reviewed: write its rows' hashes again
// Journeys column: how many journeys name the row in `proves:` (scripts/mdmm-features-check.mjs lists them).

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { SITE_SOCIAL, SITE_HEADER, SITE_FOOTER } from './mdmm-guide-site.mjs';
import { readJourneys, journeysByRow } from './mdmm-journey-index.mjs';
import { chapterFiles, parseChapter, renderBlocks, readKeymap, readBugs, checkGuide, stampFile } from './mdmm-guide-md.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MACHINES = ['md', 'mm'];
const SYMBOL = { done: '✅', partial: '🟡', missing: '❌', hardware: '➖' };

const jsonPath = (m) => path.join(root, 'doc', 'features', `${m}.json`);
const mapPath = (m) => path.join(root, 'doc', 'modern-ux', `FEATURE-MAP-${m.toUpperCase()}.md`);

const count = (rows, status) => rows.filter((r) => r.status === status).length;

function tally(rows) {
	const done = count(rows, 'done');
	const partial = count(rows, 'partial');
	const missing = count(rows, 'missing');
	const hardware = count(rows, 'hardware');
	return { done, partial, missing, hardware, total: rows.length, applicable: rows.length - hardware };
}

// MD prints the page as "p.4"; MM prints "<section> <page>".
function firstCell(machine, r) {
	return machine === 'md' ? `p.${r.manual}` : [r.section, r.manual].filter(Boolean).join(' ');
}

// row id -> names of the journeys that prove it (their `proves:` fields; never stored in the JSON)
const journeysOf = journeysByRow(readJourneys(root));

// the end-to-end run's result for each row (doc/features/e2e-<machine>.json, written by scripts/mdmm-e2e.sh --write-data,
// never by hand): the maps' E2E column, when the file is there
const e2eOf = (machine) => {
	const f = path.join(root, 'doc', 'features', `e2e-${machine}.json`);
	return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
};

function tableBlock(machine, data, b) {
	const out = [];
	const pages = b.pages ? ` (${b.pages})` : '';
	const e2e = e2eOf(machine);
	const cols = [...data.columns, 'Journeys', ...(e2e ? ['E2E'] : [])];
	out.push(`## ${b.chapter}${pages}`, '', `| ${cols.join(' | ')} |`, `|${cols.map(() => '---').join('|')}|`);
	for (const r of data.rows.filter((x) => x.chapter === b.chapter)) {
		const e = e2e && e2e.rows[r.id];
		const cells = [firstCell(machine, r), r.function, r.machine, SYMBOL[r.status], r.where, r.notes, (journeysOf.get(r.id) || []).length || '–', ...(e2e ? [e ? `${e.result}${e.shot ? ` (${e.shot})` : ''}` : '–'] : [])];
		out.push(`| ${cells.join(' | ')} |`);
	}
	return out;
}

function countsBlock(data, b) {
	const t = tally(data.rows);
	const values = [t.done, t.partial, t.missing, t.hardware, t.total];
	const out = [`| ${b.header.join(' | ')} |`, `|${b.header.map(() => '---').join('|')}|`];
	b.labels.forEach((label, i) => out.push(`| ${label} | ${values[i]} |`));
	return out;
}

function proseBlock(data, b) {
	const t = tally(data.rows);
	return b.lines.map((l) => l.replace(/\{(applicable|done|partial|missing|hardware|total)\}/g, (_, k) => String(t[k])));
}

function render(machine, data) {
	const parts = [`> Generated from doc/features/${machine}.json by scripts/mdmm-guide.mjs; edit the JSON.`];
	for (const b of data.doc) {
		if (b.type === 'prose') parts.push(proseBlock(data, b));
		else if (b.type === 'table') parts.push(tableBlock(machine, data, b));
		else if (b.type === 'counts') parts.push(countsBlock(data, b));
		else throw new Error(`${machine}.json: unknown block type "${b.type}"`);
	}
	return parts.map((p) => (Array.isArray(p) ? p.join('\n') : p)).join('\n\n') + '\n';
}

function validate(machine, data) {
	const errors = [];
	const seen = new Set();
	const chapters = new Set(data.doc.filter((b) => b.type === 'table').map((b) => b.chapter));
	for (const r of data.rows) {
		if (seen.has(r.id)) errors.push(`${r.id}: duplicate id`);
		seen.add(r.id);
		if (!r.id.startsWith(`${machine.toUpperCase()}-`)) errors.push(`${r.id}: wrong prefix`);
		if (!SYMBOL[r.status]) errors.push(`${r.id}: unknown status "${r.status}"`);
		if (!chapters.has(r.chapter)) errors.push(`${r.id}: chapter "${r.chapter}" has no table block`);
	}
	return errors;
}

/* ===== The guide: the manual, from the hand-written chapters doc/guide/<md|mm>/<nn-slug>.md =====
   (doc/guide/STYLE.md; the reader: scripts/mdmm-guide-md.mjs). One page per written chapter, an index of all the
   manual's chapters (the ones not written yet greyed, "to come") and a print page per machine, in
   site/public/guide/md/ and mm/ (generated: both folders are replaced on every run; the live
   site/public/guide/index.html is not touched). Plain HTML and one hand-written stylesheet,
   site/public/guide/guide.css (screen and print). The chapter list and the manual pages come from the JSON.
   A picture ![caption](shot:name): doc/features/shots/<name>.png (journey snapshots, slice 5; copied to
   guide/shots/), else a picture of the site (site/public/shots/<name>-1440.*), else a placeholder with the caption.
   The PDFs: scripts/mdmm-guide-pdf.sh prints /guide/<md|mm>/print/ with headless Chrome. */

const GUIDE = path.join(root, 'site', 'public', 'guide');
const PRODUCT = { md: 'Machinedrum Editor', mm: 'Monomachine Editor' };
const MANUAL = { md: 'MD manual', mm: 'MM manual' };
const KEYMAP = readKeymap(root), BUGS = readBugs(root);

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cssStr = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const slugOf = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function editorVersion() {
	const m = /set\(MDMM_EDITOR_VERSION\s+([\d.]+)\)/.exec(fs.readFileSync(path.join(root, 'source/elektron/md/mdJucePlugin/mdmmPlugins.cmake'), 'utf8'));
	return m ? m[1] : '';
}

// "8. Pattern sequencer" -> { num: 8, title: "Pattern sequencer", slug: "08-pattern-sequencer" }
function chapterOf(name) {
	const m = /^(\d+)\.\s*(.*)$/.exec(name);
	const num = m ? +m[1] : 0, title = m ? m[2] : name;
	return { name, num, title, slug: `${String(num).padStart(2, '0')}-${slugOf(title)}` };
}

// "MD manual p.47", "MD manual pp.35-50", "MM manual p.1-73", "MM manual pp.1-79, 1-80"
function pageRef(machine, manual) {
	const p = String(manual).replace(/^pp?\.\s*/, '');
	const many = /,| to /.test(p) || (machine === 'md' && p.includes('-'));
	return `${MANUAL[machine]} ${many ? 'pp.' : 'p.'}${p}`;
}

// the manual pages of a section: those of its tagged rows, in order, once each
function sectionPages(machine, rows, byId) {
	const pages = [];
	for (const id of rows) for (const p of String(byId.get(id)?.manual || '').split(/,\s*/)) if (p && !pages.includes(p)) pages.push(p);
	const key = (p) => p.split('-').map((x) => (/^\d+$/.test(x) ? x.padStart(4, '0') : x)).join('-');
	pages.sort((a, b) => key(a).localeCompare(key(b)));
	return pages.length ? pageRef(machine, pages.join(', ')) : '';
}

// width and height of a PNG (its IHDR)
function pngSize(file) {
	const b = fs.readFileSync(file);
	return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

// the newest snapshot of a name: journeys' snapshots (scripts/mdmm-snap.py into temp/journeys/<run>/shots/ or
// temp/shots/), or one kept in doc/features/shots/; a re-run of the journeys refreshes every picture
// (the end-to-end run's, temp/evidence/<version>/shots/<name>.webp: 1440 px wide, scripts/mdmm-e2e.sh; a .png from
// the older helpers works too)
function newestSnapshot(name) {
	const places = [path.join(root, 'doc', 'features', 'shots'), path.join(root, 'temp', 'shots')];
	for (const base of ['journeys', 'evidence']) {
		const runs = path.join(root, 'temp', base);
		if (fs.existsSync(runs)) for (const d of fs.readdirSync(runs)) places.push(path.join(runs, d, 'shots'));
	}
	let best = null;
	for (const dir of places) for (const ext of ['webp', 'png']) {
		const f = path.join(dir, `${name}.${ext}`);
		if (fs.existsSync(f) && (!best || fs.statSync(f).mtimeMs > fs.statSync(best).mtimeMs)) best = f;
	}
	return best;
}

// width and height of a snapshot: a PNG (twice the page's size, the older helpers) or a WebP (the page's size)
function snapSize(file) {
	if (!file.endsWith('.webp')) return pngSize(file);
	const b = fs.readFileSync(file);
	const kind = b.toString('ascii', 12, 16);
	if (kind === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
	if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
	if (kind === 'VP8L') { const v = b.readUInt32LE(21); return { w: 1 + (v & 0x3fff), h: 1 + ((v >> 14) & 0x3fff) }; }
	throw new Error(`${file}: not a WebP`);
}

function shotHtml(machine, name, caption, web = false) {
	const alt = esc(caption || PRODUCT[machine]);
	const cap = caption ? `<figcaption>${esc(caption)}</figcaption>` : '';
	// on the web page a picture opens full size on a click (a plain link to the image)
	const zoom = (href, inner) => (web ? `<a class="gd-zoom" href="${href}" aria-label="Open the picture full size: ${alt}">${inner}</a>` : inner);
	// no new snapshot in this tree (temp/ is per worktree): the picture already published beside the guide
	const kept = path.join(GUIDE, 'shots', `${name}.webp`);
	const snap = newestSnapshot(name) || (fs.existsSync(kept) ? kept : null);
	if (snap) {
		fs.mkdirSync(path.join(GUIDE, 'shots'), { recursive: true });
		const ext = path.extname(snap);
		if (snap !== kept) fs.copyFileSync(snap, path.join(GUIDE, 'shots', `${name}${ext}`));
		const { w, h } = snapSize(snap);
		return `<figure class="gd-shot">${zoom(`/guide/shots/${name}${ext}`, `<img src="/guide/shots/${name}${ext}" width="${w}" height="${h}" alt="${alt}" loading="lazy">`)}${cap}</figure>`;
	}
	const site = (size, ext) => path.join(root, 'site', 'public', 'shots', `${name}-${size}.${ext}`);
	if (fs.existsSync(site(1440, 'png'))) {
		const { w, h } = pngSize(site(1440, 'png'));
		const set = (ext) => [1440, 2880].filter((n) => fs.existsSync(site(n, ext))).map((n) => `/shots/${name}-${n}.${ext} ${n}w`).join(', ');
		const sources = ['avif', 'webp'].filter((e) => fs.existsSync(site(1440, e))).map((e) => `<source type="image/${e}" srcset="${set(e)}" sizes="(min-width: 980px) 720px, 100vw">`).join('');
		return `<figure class="gd-shot">${zoom(`/shots/${name}-1440.png`, `<picture>${sources}<img src="/shots/${name}-1440.png" width="${w}" height="${h}" alt="${alt}" loading="lazy"></picture>`)}${cap}</figure>`;
	}
	return `<figure class="gd-shot gd-todo"><div class="gd-ph" role="img" aria-label="Screenshot to come: ${alt}"><span>Screenshot to come</span></div>${cap}</figure>`;
}

// web = the page for the screen (anchors, the manual page under the heading, merged notes, linked pictures); the print
// page and the PDF use the plain form (the manual page in the margin column)
function chapterBody(machine, ch, text, byId, block, web = false) {
	const headings = new Map();
	for (const s of text.sections) {
		headings.set(slugOf(s.heading), s.heading);
		for (const b of s.blocks) if (b.type === 'h') headings.set(slugOf(b.text), b.text);
	}
	const ctx = { machine, byId, keymap: KEYMAP, bugs: BUGS, web, headings, shot: (name, caption) => shotHtml(machine, name, caption, web) };
	const meta = block?.pages ? `<p class="gd-cmeta">${esc(pageRef(machine, block.pages))}</p>` : '';
	const out = web
		? [`<header class="gd-chead"><h1>${ch.num ? `<span class="gd-cnum" aria-hidden="true">${ch.num}</span>` : ''}<span class="gd-ctitle">${esc(ch.title)}</span></h1>${meta}</header>`]
		: [`<header class="gd-chead"><p class="gd-cnum">${ch.num}</p><h1>${esc(ch.title)}</h1>`, meta, '</header>'];
	if (text.intro.blocks.length) out.push(`<div class="gd-intro gd-prose">${renderBlocks(text.intro.blocks, ctx)}</div>`);
	for (const s of text.sections) {
		const ref = sectionPages(machine, s.rows, byId);
		const id = slugOf(s.heading);
		const html = renderBlocks(s.blocks, ctx);
		if (web) {
			out.push(`<section class="gd-sec" id="${id}" aria-labelledby="${id}-h">`,
				`<div class="gd-body gd-prose"><h2 id="${id}-h">${esc(s.heading)} <a class="gd-anchor" href="#${id}" aria-label="Link to ${esc(s.heading)}">#</a></h2>`,
				ref ? `<p class="gd-ref">${esc(ref)}</p>` : '', html, '</div></section>');
			continue;
		}
		out.push(`<section class="gd-sec" id="${id}">`,
			`<aside class="gd-margin">${ref ? `<span class="gd-ref">${ref.split(/(?<=,) /).map((x) => `<span>${esc(x)}</span>`).join(' ')}</span>` : ''}</aside>`,
			`<div class="gd-body gd-prose"><h2>${esc(s.heading)}</h2>`, html, '</div></section>');
	}
	return out.filter(Boolean).join('\n');
}

function pageShell({ title, desc, canonical, head = '', body, mainClass = '' }) {
	return `<!doctype html>
<html lang="en-GB" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light">
<meta name="theme-color" content="#fbfbf7">
<link rel="canonical" href="https://mdmm.dev${canonical}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
<link rel="stylesheet" href="/design/tokens.css">
<link rel="stylesheet" href="/assets/site.css?v=20261010">
<link rel="stylesheet" href="/guide/guide.css">
<script src="/assets/theme.js?v=20261008"></script>
${head}</head>
<body class="gd">
<a class="skip" href="#main">Skip to content</a>
<header class="top">
  <div class="wrap">
    <a class="brand" href="/" aria-label="MD + MM Editor, home"><i class="dot" aria-hidden="true"></i><b>MD + MM Editor</b></a>
    <nav class="nav" aria-label="Main">
      <a class="keep" href="/guide/">Guide</a>
      <button class="themebtn" type="button" data-theme-toggle aria-label="Switch to dark theme"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.5a6.5 6.5 0 0 1 0 13z" fill="currentColor"/></svg></button>
      <a class="btn btn-primary btn-sm" href="/get/">Download free</a>
    </nav>
  </div>
</header>
<main id="main" class="gd-main${mainClass ? ' ' + mainClass : ''}">
${body}
</main>
<footer class="gd-foot">
  <p>Elektron, Machinedrum and Monomachine are trademarks of Elektron Music Machines. This guide is independent and in our own words. <a href="/guide/">Install and first start</a> · <a href="/releases/">Release notes</a> · <a href="/contact/">Contact</a></p>
</footer>
<script src="/config.js"></script>
<script src="/assets/main.js?v=20261008" defer></script>
<script src="/guide/guide.js" defer></script>
</body>
</html>
`;
}

// the site's own header and footer, for the pages that are the guide's front (/guide/, /guide/start/, /guide/keys/)
function siteShell({ title, desc, canonical, body, mainClass = '' }) {
	return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="color-scheme" content="light">
<meta name="theme-color" content="#fbfbf7">
<link rel="canonical" href="https://mdmm.dev${canonical}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
${SITE_SOCIAL.replaceAll('https://mdmm.dev/guide/', `https://mdmm.dev${canonical}`)}<link rel="stylesheet" href="/design/tokens.css">
<link rel="stylesheet" href="/assets/site.css?v=20261010">
<link rel="stylesheet" href="/guide/guide.css">
<script src="/assets/theme.js?v=20261008"></script>
</head>
<body class="gd">
<a class="skip" href="#main">Skip to content</a>
${SITE_HEADER}
<main id="main" class="gd-main${mainClass ? ' ' + mainClass : ''}">
${body}
</main>

${SITE_FOOTER}

<script src="/config.js"></script>
<script src="/assets/main.js?v=20261008" defer></script>
<script src="/guide/guide.js" defer></script>
</body>
</html>
`;
}

// the left menu: items { text, href, current, todo, subs: [{ text, href }] }; more: [{ text, href }]
function sideNav({ label, title, titleHref, items, more = [] }) {
	const li = (it) => {
		if (it.todo) return `<li><span class="gd-side-todo">${esc(it.text)} <span class="gd-vh">(to come)</span></span></li>`;
		const subs = it.subs?.length ? `<ol class="gd-side-subs">${it.subs.map((x) => `<li><a href="${x.href}">${esc(x.text)}</a></li>`).join('')}</ol>` : '';
		return `<li${it.current ? ' class="gd-side-cur"' : ''}><a href="${it.href}"${it.current ? ' aria-current="page"' : ''}>${esc(it.text)}</a>${subs}</li>`;
	};
	return `<nav class="gd-side" id="gd-side" aria-label="${esc(label)}">
<p class="gd-side-title"><a href="${titleHref}">${esc(title)}</a></p>
<ol class="gd-side-list">${items.map(li).join('\n')}</ol>
<ul class="gd-side-more">${more.map((x) => `<li><a href="${x.href}">${esc(x.text)}</a></li>`).join('')}</ul>
</nav>`;
}
const MENU_BTN = '<button class="gd-menubtn" type="button" aria-expanded="false" aria-controls="gd-side" hidden>Contents</button>';

// the running head: the chapter name between two thin rules (on screen; in print @page draws it on every page)
const runHead = (machine, label) => `<div class="gd-runhead"><span>${esc(label)}</span><span>${PRODUCT[machine]}</span></div>`;

// the manual's chapters (from the JSON), each with its written text when there is one
function guideChapters(machine, data) {
	const chapters = data.doc.filter((b) => b.type === 'table').map((b) => ({ ...chapterOf(b.chapter), block: b }));
	const bySlug = new Map(chapters.map((c) => [c.slug, c]));
	for (const f of chapterFiles(root, machine)) {
		const ch = bySlug.get(f.slug);
		if (!ch) throw new Error(`${path.relative(root, f.file)}: no chapter of the manual is called so (${[...bySlug.keys()].join(', ')})`);
		ch.text = parseChapter(f.src);
		if (ch.text.num !== ch.num) throw new Error(`${path.relative(root, f.file)}: the title's number is ${ch.text.num}, the file's ${ch.num}`);
	}
	return chapters;
}

function writeGuide(machine, data) {
	const dir = path.join(GUIDE, machine);
	fs.rmSync(dir, { recursive: true, force: true });
	const chapters = guideChapters(machine, data);
	const written = chapters.filter((c) => c.text);
	const byId = new Map(data.rows.map((r) => [r.id, r]));
	const base = `/guide/${machine}/`;
	const version = editorVersion();
	const write = (rel, html) => { const p = path.join(dir, rel, 'index.html'); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, html); };

	const more = [{ text: 'Install and first start', href: '/guide/start/' }, { text: 'Keyboard shortcuts', href: '/guide/keys/' }, { text: 'All manuals', href: '/guide/' }];
	const menu = (cur) => sideNav({ label: `Chapters of the ${PRODUCT[machine]} guide`, title: `${PRODUCT[machine]} guide`, titleHref: base, more,
		items: chapters.map((c) => (c.text
			? { text: `${c.num}. ${c.title}`, href: `${base}${c.slug}/`, current: c === cur, subs: c === cur ? c.text.sections.map((x) => ({ text: x.heading, href: `#${slugOf(x.heading)}` })) : [] }
			: { text: `${c.num}. ${c.title}`, todo: true })) });

	written.forEach((ch, i) => {
		const prev = written[i - 1], next = written[i + 1];
		const label = `${ch.num}. ${ch.title}`;
		const link = (c, dir, rel) => (c ? `<a href="${base}${c.slug}/" rel="${rel}"><span class="gd-pdir">${dir}</span><span class="gd-ptitle">${c.num}. ${esc(c.title)}</span></a>` : '<span></span>');
		const body = `<div class="gd-page gd-web">
<nav class="gd-crumbs" aria-label="Breadcrumb"><a href="/guide/">Guide</a> › <a href="${base}">${PRODUCT[machine]}</a> › ${esc(ch.title)}</nav>
${MENU_BTN}
<div class="gd-layout">
${menu(ch)}
<article class="gd-article">
${chapterBody(machine, ch, ch.text, byId, ch.block, true)}
<nav class="gd-pager" aria-label="Previous and next chapter">${link(prev, 'Previous chapter', 'prev')}${link(next, 'Next chapter', 'next')}</nav>
</article>
</div>
</div>`;
		write(ch.slug, pageShell({ title: `${label} · ${PRODUCT[machine]} guide`, desc: ch.text.summary || `${PRODUCT[machine]} guide, chapter ${label}.`, canonical: `${base}${ch.slug}/`, head: `<style>@page { @top-left { content: ${cssStr(label)}; } }</style>\n`, body }));
	});

	// the contents: every chapter of the manual; the written ones with their summary, the rest greyed
	const tocItem = (ch, href) => ch.text
		? `<li><a href="${href}"><span class="gd-tnum">${ch.num}</span><span class="gd-ttitle">${esc(ch.title)}</span>${ch.text.summary ? `<span class="gd-tsum">${esc(ch.text.summary)}</span>` : ''}</a></li>`
		: `<li class="gd-tocome"><span class="gd-tnum">${ch.num}</span><span class="gd-ttitle">${esc(ch.title)}</span><span class="gd-tsum">To come</span></li>`;
	const items = chapters.map((ch) => tocItem(ch, `${base}${ch.slug}/`)).join('\n');
	write('', pageShell({ title: `${PRODUCT[machine]} guide`, desc: `The ${PRODUCT[machine]} guide, chapter by chapter, in the manual's order.`, canonical: base, body: `<div class="gd-page gd-web gd-index">
<nav class="gd-crumbs" aria-label="Breadcrumb"><a href="/guide/">Guide</a> › ${PRODUCT[machine]}</nav>
<header class="gd-chead"><h1><span class="gd-cnum" aria-hidden="true">${machine.toUpperCase()}</span><span class="gd-ctitle">${PRODUCT[machine]} guide</span></h1>
${version ? `<p class="gd-cmeta">Version ${version}</p>` : ''}</header>
<p class="gd-lead">The chapters follow the ${machine === 'md' ? 'Machinedrum' : 'Monomachine'} manual, in its order. Each one says what that part of the machine does and how you do it in the editor. To install the editor and add your ROM, see <a href="/guide/">the user guide</a>.</p>
<ol class="gd-toc">
${items}
</ol>
<p class="gd-print"><a href="${base}print/">All chapters on one page, for print</a></p>
</div>` }));

	// the print page: cover, contents, every written chapter; each chapter is a named page, for its running head
	const named = written.map((ch) => `@page c${ch.num} { @top-left { content: ${cssStr(`${ch.num}. ${ch.title}`)}; } }`).join('\n');
	const toc = chapters.map((ch) => tocItem(ch, `#c${ch.num}`)).join('\n');
	const all = written.map((ch) => `<article class="gd-chapter" id="c${ch.num}" style="page: c${ch.num}">\n${runHead(machine, `${ch.num}. ${ch.title}`)}\n${chapterBody(machine, ch, ch.text, byId, ch.block)}\n</article>`).join('\n')
		// headless Chrome prints without scrolling, so a lazy picture never loads: the print page loads them all at once
		.replace(/ loading="lazy"/g, '');
	write('print', pageShell({ title: `${PRODUCT[machine]} guide, for print`, desc: `The whole ${PRODUCT[machine]} guide on one page, for print and PDF.`, canonical: `${base}print/`, mainClass: 'gd-book',
		head: `<style>\n@page contents { @top-left { content: "Contents"; } }\n${named}\n</style>\n`,
		body: `<div class="gd-page">
<section class="gd-cover"><p class="gd-cnum">${machine.toUpperCase()}</p><h1>${PRODUCT[machine]}</h1><p class="gd-cover-sub">User guide${version ? ` · version ${version}` : ''}</p><p class="gd-cover-note">Future Native Audio · mdmm.dev<br>The chapters follow the ${machine === 'md' ? 'Machinedrum' : 'Monomachine'} manual's order. Every sentence is our own.</p></section>
<section class="gd-contents" style="page: contents">${runHead(machine, 'Contents')}<h2>Contents</h2><ol class="gd-toc gd-toc-print">
${toc}
</ol></section>
${all}
</div>` }));
	console.log(`site/public/guide/${machine}/: ${written.length} of ${chapters.length} chapters written, index, print page`);
	return { written: written.length, total: chapters.length };
}

/* ---------- the front of the guide: /guide/ (the choice of manual), /guide/start/, /guide/keys/ ---------- */

const PDF = { md: 'machinedrum-editor-guide.pdf', mm: 'monomachine-editor-guide.pdf' };
const PICTURE = { md: 'md-seq-mk2', mm: 'mm-seq' };
const COVERS = { md: 'The Machinedrum Editor, chapter by chapter in the order of the Machinedrum manual: the sequencer, sounds, kits, the sampler, songs and the rest.', mm: 'The Monomachine Editor, chapter by chapter in the order of the Monomachine manual: the sequencer, sounds, performance, songs and the rest.' };

function pictureHtml(name, alt) {
	const f = (size, ext) => path.join(root, 'site', 'public', 'shots', `${name}-${size}.${ext}`);
	if (!fs.existsSync(f(1440, 'png'))) return '';
	const { w, h } = pngSize(f(1440, 'png'));
	const set = (ext) => [1440, 2880].filter((n) => fs.existsSync(f(n, ext))).map((n) => `/shots/${name}-${n}.${ext} ${n}w`).join(', ');
	const sources = ['avif', 'webp'].filter((e) => fs.existsSync(f(1440, e))).map((e) => `<source type="image/${e}" srcset="${set(e)}" sizes="(min-width: 900px) 560px, 100vw">`).join('');
	return `<picture>${sources}<img src="/shots/${name}-1440.png" width="${w}" height="${h}" alt="${esc(alt)}" loading="lazy"></picture>`;
}

// the PDFs are made by scripts/mdmm-guide-pdf.sh into temp/guide-pdf/; a copy beside the pages is what the buttons link to
function pdfLink(machine) {
	const made = path.join(root, 'temp', 'guide-pdf', PDF[machine]), here = path.join(GUIDE, PDF[machine]);
	if (fs.existsSync(made)) fs.copyFileSync(made, here);
	return fs.existsSync(here) ? `/guide/${PDF[machine]}` : '';
}

function writeFront(counts) {
	const version = editorVersion();
	const write = (rel, html) => { const p = path.join(GUIDE, rel, 'index.html'); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, html); };
	const card = (m) => {
		const pdf = pdfLink(m), c = counts[m] || { written: 0, total: 0 };
		const state = c.written ? `${c.written} of ${c.total} chapters written` : `${c.total} chapters, in preparation`;
		return `<article class="gd-card">
<a class="gd-card-pic" href="/guide/${m}/" tabindex="-1" aria-hidden="true">${pictureHtml(PICTURE[m], `${PRODUCT[m]}: the sequencer`)}</a>
<div class="gd-card-body">
<h2>${PRODUCT[m]}</h2>
<p>${esc(COVERS[m])}</p>
<p class="gd-card-meta">${state}</p>
<div class="btns"><a class="btn btn-primary" href="/guide/${m}/">Read online<span class="gd-vh">: ${PRODUCT[m]}</span></a>${pdf ? `<a class="btn btn-ghost" href="${pdf}" download>Download PDF<span class="gd-vh">: ${PRODUCT[m]}</span></a>` : '<span class="btn btn-ghost gd-btn-off" aria-disabled="true">PDF to come</span>'}</div>
</div>
</article>`;
	};
	write('', siteShell({ title: 'User guide — MD + MM Editor', desc: 'The manuals of the Machinedrum Editor and the Monomachine Editor, online and as PDF. Install, add your ROM, use the editors in a DAW, every keyboard shortcut.', canonical: '/guide/', mainClass: 'gd-landing', body: `<div class="gd-page gd-home">
<header class="gd-homehead"><span class="eyebrow">MD + MM Editor</span><h1>User guide</h1>
<p>Choose the manual of your machine.${version ? ` For version <span data-version>v${version}</span>.` : ''}</p></header>
<div class="gd-cards">
${card('md')}
${card('mm')}
</div>
<h2 class="gd-quick-h">Also</h2>
<ul class="gd-quick">
<li><a href="/guide/start/"><b>Install and first start</b><span>Install, add your ROM, DAW setup.</span></a></li>
<li><a href="/guide/keys/"><b>Keyboard shortcuts</b><span>Every key of both editors.</span></a></li>
<li><a href="/contact/"><b>Get help</b><span>Write to us, or ask in the <span class="gd-nowrap">community on Discord</span>.</span></a></li>
</ul>
<p class="gd-homefoot">Questions or bugs: <a href="/contact/">contact</a>, or the <a href="https://discord.gg/8xwXwBHbtn">Discord server</a>. Release notes: <a href="/releases/">every version</a>.</p>
</div>` }));

	// start and keys: written in doc/guide/start.md and keys.md (the same voice as the chapters)
	const simple = (slug, file, extra = '') => {
		const text = parseChapter(fs.readFileSync(path.join(root, 'doc', 'guide', file), 'utf8'));
		const ch = { num: 0, title: text.title };
		const sections = text.sections.map((x) => ({ text: x.heading, href: `#${slugOf(x.heading)}` }));
		const items = [{ text: ch.title, href: `/guide/${slug}/`, current: true, subs: sections }];
		const side = sideNav({ label: `${ch.title}: sections`, title: 'User guide', titleHref: '/guide/', items,
			more: [{ text: 'Machinedrum Editor guide', href: '/guide/md/' }, { text: 'Monomachine Editor guide', href: '/guide/mm/' }, ...(slug === 'start' ? [{ text: 'Keyboard shortcuts', href: '/guide/keys/' }] : [{ text: 'Install and first start', href: '/guide/start/' }])] });
		write(slug, siteShell({ title: `${ch.title} — MD + MM Editor guide`, desc: text.summary, canonical: `/guide/${slug}/`, body: `<div class="gd-page gd-web">
<nav class="gd-crumbs" aria-label="Breadcrumb"><a href="/guide/">Guide</a> › ${esc(ch.title)}</nav>
${MENU_BTN}
<div class="gd-layout">
${side}
<article class="gd-article">
${chapterBody('mm', ch, text, new Map(), null, true)}
${extra}
</article>
</div>
</div>` }));
	};
	simple('start', 'start.md');
	const ke = createRequire(import.meta.url)('./keymap-export.js');
	simple('keys', 'keys.md', `<div class="guide gd-keytables">\n    ${ke.guide(KEYMAP.md, KEYMAP.mm)}\n</div>`);
	console.log('site/public/guide/: landing page, start, keys');
}

const args = process.argv.slice(2);
const check = args.includes('--check');
const all = Object.fromEntries(MACHINES.map((m) => [m, JSON.parse(fs.readFileSync(jsonPath(m), 'utf8'))]));
const slugs = Object.fromEntries(MACHINES.map((m) => [m, all[m].doc.filter((b) => b.type === 'table').map((b) => chapterOf(b.chapter).slug)]));

if (args.includes('--stamp')) {
	const files = args.slice(args.indexOf('--stamp') + 1).filter((a) => !a.startsWith('--'));
	if (!files.length) { console.error('--stamp <chapter file>...'); process.exit(1); }
	for (const f of files) {
		const m = path.basename(path.dirname(path.resolve(f)));
		if (!all[m]) { console.error(`${f}: not in doc/guide/md or mm`); process.exit(1); }
		const n = stampFile(path.resolve(f), new Map(all[m].rows.map((r) => [r.id, r])), journeysOf);
		console.log(`${f}: ${n} rows tags stamped`);
	}
	process.exit(0);
}

let failed = false;
const counts = {};
for (const m of MACHINES) {
	const data = all[m];
	const errors = validate(m, data);
	if (errors.length) {
		console.error(errors.join('\n'));
		process.exit(1);
	}
	const text = render(m, data);
	if (check) {
		if (fs.readFileSync(mapPath(m), 'utf8') !== text) {
			console.error(`${path.relative(root, mapPath(m))} is not what ${m}.json makes; run scripts/mdmm-guide.mjs`);
			failed = true;
		}
	} else {
		fs.writeFileSync(mapPath(m), text);
		console.log(`${path.relative(root, mapPath(m))}: ${data.rows.length} rows`);
		counts[m] = writeGuide(m, data);
	}
}

if (!check && !failed) writeFront(counts);

const guide = checkGuide(root, all, journeysOf, slugs);
for (const r of guide.reports) console.log(r);
if (guide.stale.length) console[check ? 'error' : 'log']('\nto review (doc/guide/README.md):\n' + guide.stale.join('\n'));
if (guide.errors.length) console.error('\nguide errors:\n' + guide.errors.join('\n'));
if (guide.errors.length || (check && guide.stale.length)) failed = true;

if (!check && !failed && args.includes('--pdf')) {
	const r = spawnSync(path.join(root, 'scripts', 'mdmm-guide-pdf.sh'), [], { stdio: 'inherit' });
	if (r.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
