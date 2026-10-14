#!/usr/bin/env node
// The page tier (doc/release/DEV-CYCLE.md): the editors' page journeys without the editor, the emulator or a ROM. Each
// editor's page (skins/mdStudio/mdStudio.html, skins/mmStudio/mmStudio.html, its files as they are) runs in headless
// Chrome, driven over the DevTools protocol (node's own WebSocket: no npm package). In place of the plug-in a host
// answers the page's bridge (?dev=1: window.gmDev takes each batch, gm.recv gets the answers):
//   stub    deskStubHost (source/elektron/md/deskStubHost): the editors' real core with a fake machine. The default.
//   record  no core: every command is answered ok and nothing else (a smoke run of the page's wiring).
// Every command the page sends is recorded (commands.jsonl) and checked against the contract
// (doc/modern-ux/<md|mm>-data-contract.schema.json, $defs/command): a command outside it fails the run.
//
//   node scripts/mdmm-page.mjs [--jobs N] [--tier page|machine|host|all] [--host stub|record] [--timeout S]
//                              [--out DIR] [--verbose] [--shuffle [SEED]] [--isolate] [md|mm|both] [selector]
//     selector: as scripts/mdmm-journeys.sh (journey, journey-seq-*, journey-md-lib-*,mm-mix-*); default journey
//     --tier: the journeys of that tier (skins/shared/deskJourney.js TIERS); default page
//     --jobs N: N pages per editor at once, each with its own host, each every N-th journey (default 2)
//     --shuffle [SEED]: the journeys in a seeded random order (the seed is printed; no SEED: a random one); the same seed, the same order
//     --list: print the names the selector, tier and shuffle choose (one line per editor: "<md|mm>: name name ...") and exit
//     --isolate: every journey in a page and a host of its own, fresh from the start: a journey that passes here and fails in a run
//       (or the other way round) depends on one before it (Radek's rule 2026-10-13: every journey is independent,
//       doc/modern-ux/JOURNEYS.md). --jobs N then means N journeys at once per editor. Combines with --shuffle (the order they start in).
//   node scripts/mdmm-page.mjs --serve md|mm [--port N]
//     the preview (scripts/mdmm-preview.sh): no Chrome, no journeys. Serves the page to your own browser, one stub host per open page
//     (killed when the page closes), live reload: a CSS save swaps the stylesheet in place, a JS or HTML save reloads the page, a design
//     source save runs the sync script first, a C++ save rebuilds deskStubHost (MDMM_PREVIEW_BUILD) and reloads. Default port 8791 (md), 8792 (mm).
// Environment: MDMM_CHROME (Chrome's binary), MDMM_CHROME_ARGS (more Chrome flags, space separated), MDMM_STUB_HOST (deskStubHost's binary; default: the newest under temp/),
// MDMM_PAGE_OUT (the report folder, default temp/page/<date-time>). Prints the JOURNEY lines and a total; exits 1 on any
// FAIL, a page that never said JOURNEYS DONE, a command outside the contract or a page error.
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { contract } from "./mdmm-contract.mjs";
import * as Scn from "./mdmm-scenario.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKINS = path.join(ROOT, "source/elektron/md/mdJucePlugin/skins");
const usage = () => { console.error("usage: node scripts/mdmm-page.mjs --serve md|mm [--port N] | [--jobs N] [--tier page|machine|host|all] [--host stub|record] [--timeout S] [--out DIR] [--verbose] [--shuffle [SEED]] [--isolate] [md|mm|both] [selector]"); process.exit(2); };

/* ---------- arguments ---------- */
const opt = { jobs: 2, tier: "page", host: "stub", timeout: 1800, out: process.env.MDMM_PAGE_OUT || "", verbose: false, shuffle: null, isolate: false, list: false, serve: false, port: 0 };
const rest = [];
for (let a = process.argv.slice(2); a.length;) {
	const x = a.shift();
	const val = () => { const v = x.includes("=") ? x.split("=").slice(1).join("=") : a.shift(); if (v == null) usage(); return v; };
	if (/^--jobs(=|$)/.test(x)) opt.jobs = +val();
	else if (/^--tier(=|$)/.test(x)) opt.tier = val();
	else if (/^--host(=|$)/.test(x)) opt.host = val();
	else if (/^--timeout(=|$)/.test(x)) opt.timeout = +val();
	else if (/^--out(=|$)/.test(x)) opt.out = val();
	else if (x === "--verbose") opt.verbose = true;
	else if (x === "--isolate") opt.isolate = true;
	else if (x === "--list") opt.list = true;
	else if (x === "--serve") opt.serve = true;
	else if (/^--port(=|$)/.test(x)) opt.port = +val();
	else if (x === "--shuffle") opt.shuffle = a.length && /^\d+$/.test(a[0]) ? +a.shift() : Math.floor(Math.random() * 1e9);
	else if (/^--shuffle=\d+$/.test(x)) opt.shuffle = +x.split("=")[1];
	else if (x.startsWith("--")) usage();
	else rest.push(x);
}
if (opt.serve && !["md", "mm"].includes(rest[0])) usage();
const which = rest[0] || "both";
let sel = rest[1] || "journey";
if (!sel.startsWith("journey")) sel = "journey-" + sel;
if (!["md", "mm", "both"].includes(which) || !["page", "machine", "host", "all"].includes(opt.tier) || !["stub", "record"].includes(opt.host)
	|| !(opt.jobs >= 1) || /[@~]/.test(sel)) usage();

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
const OUT = path.resolve(opt.out || path.join(ROOT, "temp/page", stamp));
if (!opt.serve) fs.mkdirSync(OUT, { recursive: true });
const version = (fs.readFileSync(path.join(SKINS, "../mdmmPlugins.cmake"), "utf8").match(/set\(MDMM_EDITOR_VERSION ([\d.]+)\)/) || [])[1] || "0.0.0";

/* ---------- the host program ---------- */
function newest(dir, name) {
	let best = null;
	const walk = d => { let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
		for (const e of es) { const p = path.join(d, e.name);
			if (e.isDirectory()) { if (!/^(CMakeFiles|_deps|\.git|journeys|page|local-gate)$/.test(e.name)) walk(p); }
			else if (e.name === name) { const s = fs.statSync(p); if (s.mode & 0o111 && (!best || s.mtimeMs > best.t)) best = { p, t: s.mtimeMs }; } } };
	walk(dir);
	return best && best.p;
}
const STUB = opt.host === "stub" ? (process.env.MDMM_STUB_HOST || newest(path.join(ROOT, "temp"), "deskStubHost")) : null;
if (opt.host === "stub" && !STUB) { console.error("FAIL no deskStubHost (scripts/mdmm-dev.sh build deskStubHost, or set MDMM_STUB_HOST)"); process.exit(1); }
const CHROME = process.env.MDMM_CHROME || ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find(p => fs.existsSync(p));
if (!CHROME && !opt.serve) { console.error("FAIL no Chrome (set MDMM_CHROME)"); process.exit(1); }

/* ---------- the contract: every command the page sends (scripts/mdmm-contract.mjs) ---------- */
const VALIDATE = { md: contract("md").command, mm: contract("mm").command };


/* ---------- the preview (--serve): the page in your own browser, a stub host per open page, live reload ---------- */
const PREVIEW_PAGE = which => `${which}/${which}Studio.html`;
const pageUrl = scn => `/${PREVIEW_PAGE(which)}?dev=1&version=${version}${scn ? "&scenario=" + encodeURIComponent(scn) : ""}`;
const PREVIEW_CLIENT = `(() => {
	const sid = Math.random().toString(36).slice(2), q = [], scn = new URLSearchParams(location.search).get("scenario") || "";
	const tail = "sid=" + sid + (scn ? "&scenario=" + encodeURIComponent(scn) : "");
	let flushing = false;
	const banner = t => { let b = document.getElementById("__pv"); if (!b) { b = document.createElement("pre"); b.id = "__pv";
		b.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:2147483647;margin:0;padding:8px 12px;max-height:40vh;overflow:auto;background:#b00;color:#fff;font:12px monospace;white-space:pre-wrap";
		(document.body || document.documentElement).appendChild(b); } b.textContent = t; b.style.display = t ? "block" : "none"; };
	const flush = () => { if (flushing) return; flushing = true; const go = () => { while (q.length) { if (!(window.gm && gm.recv)) return setTimeout(go, 20); gm.recv(q.shift()); } flushing = false; }; go(); };
	window.gmDev = batch => { fetch("/__cmd?" + tail, { method: "POST", body: JSON.stringify(batch) }).catch(() => { }); };
	const es = new EventSource("/__events?" + tail);
	es.addEventListener("host", e => { q.push(JSON.parse(e.data)); flush(); });
	es.addEventListener("reload", () => location.reload());
	es.addEventListener("error-text", e => banner(JSON.parse(e.data)));
	es.addEventListener("ok", () => banner(""));
	es.addEventListener("css", () => {
		for (const l of document.querySelectorAll('link[rel="stylesheet"]')) {
			const u = new URL(l.href, location.href); if (u.origin !== location.origin) continue;
			u.searchParams.set("pv", Date.now()); const n = l.cloneNode(); n.href = u.href;
			n.onload = () => l.remove(); l.after(n); }
		banner("");
	});
})();`;
const hosts = new Map();	// sid -> { host, clients: Set<res>, buf: [] }
const sseAll = (event, data) => { for (const h of hosts.values()) for (const c of h.clients) c.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
/* a scenario (doc/modern-ux/scenarios): read when the page opens its host, so a saved file is the next reload's */
function scenarioOf(name) {
	if (!name) return null;
	const f = Scn.files(which).find(x => x.name === name);
	if (!f) { sseAll("error-text", `no scenario ${name} (doc/modern-ux/scenarios/${which})`); console.log(`no scenario ${name}`); return null; }
	const text = fs.readFileSync(f.file, "utf8"), bad = Scn.problems(name, which, text);
	if (bad.length) { sseAll("error-text", `scenario ${name} is not valid:\n${bad.join("\n")}`); console.log(`scenario ${name} is not valid:\n  ${bad.join("\n  ")}`); return null; }
	return JSON.parse(text);
}
const emit = (h, batch) => { const line = JSON.stringify(batch); if (h.clients.size) for (const c of h.clients) c.write(`event: host\ndata: ${line}\n\n`); else h.buf.push(line); };
function scenarioStart(h) {
	if (h.started || !h.scn) return;
	h.started = true;
	console.log(`scenario ${h.scnName}: playing`);
	for (const st of h.scn.steps) if (st.at !== undefined) h.timers.push(setTimeout(() => { const out = h.player.fire(st); if (out.length) emit(h, out); }, st.at));
}
function previewHost(sid, scnName) {
	let h = hosts.get(sid);
	if (h) return h;
	const host = spawn(STUB, [which], { stdio: ["pipe", "pipe", "pipe"] });
	h = { host, clients: new Set(), buf: [], scnName: scnName || "", scn: scenarioOf(scnName), timers: [], started: false, queue: [], paceTimer: null, settle: null };
	if (h.scn) h.player = new Scn.Player(h.scn, which, Scn.fixture(which));
	hosts.set(sid, h);
	const none = h.scn && h.scn.boot === "none", pace = h.scn && h.scn.pace && h.scn.pace.everyMs;
	if (h.scn && !none) h.timers.push(setTimeout(() => scenarioStart(h), 15000));	// the stub never went quiet: start anyway
	let buf = "";
	const deliver = line => { if (h.clients.size) for (const c of h.clients) c.write(`event: host\ndata: ${line}\n\n`); else h.buf.push(line); };
	const out = line => {
		if (!pace) return deliver(line);
		h.queue.push(line);
		if (!h.paceTimer) h.paceTimer = setInterval(() => { const l = h.queue.shift(); if (l === undefined) { clearInterval(h.paceTimer); h.paceTimer = null; return; } deliver(l); }, pace);
	};
	/* the stub's boot is over when it has gone quiet (and, paced, the page has been given all of it) */
	const quiet = () => { if (h.queue.length) { h.settle = setTimeout(quiet, 200); return; } scenarioStart(h); };
	host.stdout.on("data", d => { buf += d; for (let nl; (nl = buf.indexOf("\n")) >= 0;) { let l = buf.slice(0, nl); buf = buf.slice(nl + 1);
		if (!l) continue;
		if (h.scn) {
			if (none) continue;	// boot none: the page hears only the scenario
			let boots = false;	// telemetry, meters and the CPU load go on for ever: only the documents say the boot is still on
			try { const ms = [].concat(JSON.parse(l)); boots = ms.some(m => m.type === "doc" || m.type === "machine" || m.type === "catalogue"); l = JSON.stringify(ms.map(m => h.player.pass(m))); } catch { }
			if (boots) { clearTimeout(h.settle); h.settle = setTimeout(quiet, 700); }
		}
		out(l); } });
	host.stderr.on("data", d => process.stderr.write(`host: ${d}`));
	host.stdin.on("error", () => { });
	host.on("exit", () => { h.timers.forEach(clearTimeout); clearTimeout(h.settle); clearInterval(h.paceTimer); hosts.delete(sid); });
	return h;
}
function previewRoute(req, res, u) {
	if (u.pathname === "/") { res.writeHead(302, { location: pageUrl(u.searchParams.get("scenario")) }); res.end(); return true; }
	if (u.pathname === "/scenarios") {
		const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
		const rows = Scn.files(which).map(f => { let t = {}; try { t = JSON.parse(fs.readFileSync(f.file, "utf8")); } catch { }
			return `<li><a href="${esc(pageUrl(f.name))}"><b>${esc(f.name)}</b></a> ${esc(t.title || "")}<br><small>${esc(t.about || "")}</small></li>`; }).join("");
		res.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" });
		res.end(`<!doctype html><meta charset=utf-8><title>Preview scenarios (${which})</title><body style="font:15px system-ui;max-width:46em;margin:2em auto;padding:0 1em"><h1>Preview scenarios, ${which}</h1><p><a href="${esc(pageUrl(""))}">The page as it is (the stub's own boot)</a></p><ul>${rows}</ul><p><small>doc/modern-ux/scenarios/${which}/README.md. Save a scenario file and its open pages replay it.</small>`);
		return true;
	}
	if (u.pathname === "/__preview.js") { res.writeHead(200, { "content-type": "text/javascript", "cache-control": "no-store" }); res.end(PREVIEW_CLIENT); return true; }
	if (u.pathname === "/__events") {
		const h = previewHost(u.searchParams.get("sid") || "", u.searchParams.get("scenario"));
		res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
		res.write(": open\n\n");
		h.clients.add(res);
		for (const l of h.buf.splice(0)) res.write(`event: host\ndata: ${l}\n\n`);
		req.on("close", () => { h.clients.delete(res); if (!h.clients.size) setTimeout(() => { if (!h.clients.size) { hosts.delete(u.searchParams.get("sid")); h.host.kill(); } }, 3000); });
		return true;
	}
	if (u.pathname === "/__cmd" && req.method === "POST") {
		let body = ""; req.on("data", d => { body += d; });
		req.on("end", () => {
			try { const batch = JSON.parse(body);
				for (const c of batch) { const bad = VALIDATE[which](c); const note = bad ? `  OUTSIDE THE CONTRACT: ${bad}` : "";
					if (bad || process.env.MDMM_PREVIEW_VERBOSE) console.log(`cmd ${which} ${JSON.stringify(c).slice(0, 200)}${note}`); }
				const h = previewHost(u.searchParams.get("sid") || "", u.searchParams.get("scenario"));
				let forward = batch;
				if (h.scn) {
					if (h.scn.boot === "none") scenarioStart(h);	// no stub boot to wait for: the page's first command starts it
					forward = batch.filter(c => {
						let swallowed = false;
						for (const st of h.scn.steps) if (st.on && Scn.matches(st.on, c)) {
							h.timers.push(setTimeout(() => { const out = h.player.fire(st, c); if (out.length) emit(h, out); }, st.delay || 0));
							if (st.swallow !== false) swallowed = true;
						}
						return !swallowed;
					});
				}
				if (forward.length) h.host.stdin.write(JSON.stringify(forward) + "\n");
			} catch (e) { console.log("cmd: " + e.message); }
			res.writeHead(204); res.end(); });
		return true;
	}
	if (u.pathname.endsWith(".html")) {
		const [, ed, ...rel] = u.pathname.split("/"), name = rel.join("/");
		const dirs = ed === "md" ? ["mdStudio", "shared"] : ed === "mm" ? ["mmStudio", "shared", "mdStudio"] : [];
		const file = dirs.map(d => path.join(SKINS, d, name)).find(f => !name.includes("..") && fs.existsSync(f) && fs.statSync(f).isFile());
		if (!file) return false;
		const html = fs.readFileSync(file, "utf8").replace(/<head>/i, m => m + '<script src="/__preview.js"></script>');
		res.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" }); res.end(html);
		return true;
	}
	return false;
}
function startPreview() {
	const BUILD = process.env.MDMM_PREVIEW_BUILD;
	const tell = (what, t0) => console.log(`[${new Date().toTimeString().slice(0, 8)}] ${what}${t0 ? ` (${Date.now() - t0} ms)` : ""}`);
	let busy = false, again = null;
	const run = (cmd, args) => new Promise(done => { const p = spawn(cmd, args, { cwd: ROOT }); let out = ""; p.stdout.on("data", d => { out += d; }); p.stderr.on("data", d => { out += d; }); p.on("close", code => done({ code, out })); });
	/* what a saved file means: css = swap in place; js or html = reload; design source = sync, then as its kind; C++ = rebuild, restart, reload */
	const sync = path.join(ROOT, `doc/modern-ux/sync-${which}studio-skin.py`);
	async function changed(kind, file, t0) {
		if (busy) { again = [kind, file, t0]; return; }
		busy = true;
		try {
			let how = kind;
			if (kind === "sync-css" || kind === "sync-reload") {
				const r = await run("python3", [sync]);
				if (r.code) { sseAll("error-text", `${path.basename(sync)} failed:\n${r.out.slice(-1500)}`); tell(`sync failed: ${file}\n${r.out.slice(-600)}`); return; }
				how = kind === "sync-css" ? "css" : "reload";
				syncedUntil = Date.now() + 400;
			}
			if (how === "cpp") {
				const r = await run("cmake", ["--build", BUILD, "--target", "deskStubHost"]);
				if (r.code) { sseAll("error-text", `deskStubHost build failed:\n${r.out.slice(-2500)}`); tell(`C++ build failed: ${file}\n${r.out.slice(-1500)}`); return; }
				for (const h of hosts.values()) h.host.kill();
				hosts.forEach(h => { h.clients.forEach(c => c.write("event: reload\ndata: 0\n\n")); }); hosts.clear();
				tell(`${file}: rebuilt, host restarted, reload`, t0); return;
			}
			sseAll("ok", 0); sseAll(how, file);
			tell(`${file}: ${how === "css" ? "stylesheet swapped" : "page reload"}`, t0);
		} finally { busy = false; if (again) { const a = again; again = null; changed(...a); } }
	}
	let syncedUntil = 0, timers = new Map();
	const later = (key, fn) => { clearTimeout(timers.get(key)); timers.set(key, setTimeout(fn, 60)); };
	const watch = (dir, onFile) => { try { fs.watch(dir, { recursive: true }, (ev, name) => { if (name) onFile(name.toString()); }); } catch (e) { console.log(`no watch on ${dir}: ${e.message}`); } };
	watch(SKINS, name => {
		if (Date.now() < syncedUntil || busy || !/\.(css|js|html|json)$/.test(name)) return;
		const t0 = Date.now();
		/* a shared or override stylesheet is part of the generated page stylesheet: sync, then swap */
		const kind = /\.css$/.test(name) ? (/(^|\/)(shared\/|[a-z]+Overrides\.css)/.test(name) ? "sync-css" : "css") : "reload";
		later("skin", () => changed(kind, name, t0));
	});
	for (const rel of ["doc/modern-ux/mockup/index.html", "doc/modern-ux/mm-mockup/src", "doc/modern-ux/mm-mockup/build.sh"]) {
		const abs = path.join(ROOT, rel), isDir = fs.statSync(abs).isDirectory();
		if (which === "md" && rel.includes("mm-mockup") || which === "mm" && rel.includes("modern-ux/mockup")) continue;
		(isDir ? watch : (d, f) => fs.watch(d, () => f(path.basename(d))))(abs, name => {
			const t0 = Date.now();
			later("design", () => changed(/\.css$/.test(name) ? "sync-css" : "sync-reload", rel + (isDir ? "/" + name : ""), t0)); });
	}
	/* a saved scenario: checked, then every page playing it reloads (a reload is a fresh host: the scenario starts again); a bad one shows its problems */
	watch(Scn.dirOf(which), name => {
		if (!/\.json$/.test(name)) return;
		const t0 = Date.now(), scn = name.replace(/\.json$/, "");
		later("scn:" + name, () => {
			let bad;
			if (name.startsWith("_")) { const e = contract(which).message(Scn.fixture(which)); bad = e ? [`${name}: ${e}`] : []; }
			else { try { bad = Scn.problems(scn, which, fs.readFileSync(path.join(Scn.dirOf(which), name), "utf8")); } catch (e) { return; /* deleted */ } }
			if (bad.length) { sseAll("error-text", `scenario ${scn} is not valid:\n${bad.join("\n")}`); tell(`scenario ${scn} is not valid:\n  ${bad.join("\n  ")}`); return; }
			let n = 0;
			sseAll("ok", 0);	// takes an earlier problem's red bar away
			for (const h of hosts.values()) if (name.startsWith("_") || h.scnName === scn) { h.clients.forEach(c => c.write("event: reload\ndata: 0\n\n")); n++; }
			tell(`scenario ${scn}: saved, ${n} page(s) replay it`, t0);
		});
	});
	if (BUILD) watch(path.join(ROOT, "source/elektron/md"), name => {
		if (/^mdJucePlugin\/skins\//.test(name) || !/\.(cpp|h|hpp|cmake|txt)$/.test(name)) return;
		const t0 = Date.now(); later("cpp", () => changed("cpp", name, t0)); });
	console.log(`\nPreview of the ${which === "md" ? "Machinedrum" : "Monomachine"} Editor page, stub host ${path.relative(ROOT, STUB)}`);
	console.log(`   http://127.0.0.1:${PORT}/\n   save a skin or design file: the page follows by itself. Ctrl+C stops.`);
	const list = Scn.files(which);
	if (list.length) {
		console.log(`\nScenarios (doc/modern-ux/scenarios/${which}), ?scenario=<name> on the page's URL, or the list at http://127.0.0.1:${PORT}/scenarios:`);
		for (const f of list) { let t = {}; try { t = JSON.parse(fs.readFileSync(f.file, "utf8")); } catch { } console.log(`   ${f.name.padEnd(24)} ${t.title || ""}`); }
	}
	console.log("");
}

/* ---------- the page's files, as the plug-in bundles them (by name) ---------- */
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".ttf": "font/ttf", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((req, res) => {
	const u = new URL(req.url, "http://x");
	if (opt.serve && previewRoute(req, res, u)) return;
	const [, ed, ...rel] = u.pathname.split("/");
	const name = rel.join("/");
	const dirs = ed === "md" ? ["mdStudio", "shared"] : ed === "mm" ? ["mmStudio", "shared", "mdStudio"] : [];
	const file = dirs.map(d => path.join(SKINS, d, name)).find(f => !name.includes("..") && fs.existsSync(f) && fs.statSync(f).isFile());
	if (!file) { res.writeHead(404); res.end(); return; }
	res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
	fs.createReadStream(file).pipe(res);
});
await new Promise((r, j) => { server.once("error", j); server.listen(opt.serve ? opt.port || (which === "md" ? 8791 : 8792) : 0, "127.0.0.1", r); });
const PORT = server.address().port;
if (opt.serve) { startPreview(); await new Promise(() => { }); }

/* ---------- Chrome over the DevTools protocol ---------- */
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "mdmm-page-chrome-"));
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check",
	"--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", "--hide-scrollbars",
	"--mute-audio", "--window-size=1440,924", ...(process.env.MDMM_CHROME_ARGS ? process.env.MDMM_CHROME_ARGS.split(" ") : []), "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
let chromeErr = "";
chrome.stderr.on("data", d => { chromeErr += d; });
const wsUrl = await new Promise((resolve, reject) => {
	const t0 = Date.now();
	const look = () => { try { const [port, p] = fs.readFileSync(path.join(profile, "DevToolsActivePort"), "utf8").split("\n"); if (port && p) return resolve(`ws://127.0.0.1:${port}${p}`); } catch { }
		if (Date.now() - t0 > 20000) reject(new Error("Chrome did not start: " + chromeErr.slice(-400))); else setTimeout(look, 50); };
	look();
});
const ws = new WebSocket(wsUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error("no DevTools connection")); });
let nextId = 1;
let uaCache = null;
const userAgent = async () => uaCache ||= (await send("Browser.getVersion")).userAgent;
const waiting = new Map(), sessions = new Map();
ws.onmessage = ev => {
	const m = JSON.parse(ev.data);
	if (m.id && waiting.has(m.id)) { const w = waiting.get(m.id); waiting.delete(m.id); m.error ? w.reject(new Error(m.error.message)) : w.resolve(m.result); return; }
	if (m.sessionId && sessions.has(m.sessionId)) sessions.get(m.sessionId)(m.method, m.params);
};
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = nextId++; waiting.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params, sessionId })); });

/* ---------- one page with its host ---------- */
function runUnit(ed, selector, dir) {
	return new Promise(async done => {
		fs.mkdirSync(dir, { recursive: true });
		const logf = fs.createWriteStream(path.join(dir, "page.log")), cmdf = fs.createWriteStream(path.join(dir, "commands.jsonl"));
		const lines = [], problems = [];
		let finished = false, host = null, sid = null, timer = null, targetId = null, contextId = null;
		const t0 = Date.now();
		const log = t => { logf.write(`${((Date.now() - t0) / 1000).toFixed(3)} ${t}\n`); };
		const finish = async why => {
			if (finished) return; finished = true; clearTimeout(timer);
			if (why) { problems.push(why); log("FAIL " + why); }
			if (targetId) try { await send("Target.closeTarget", { targetId }); } catch { }
			if (contextId) try { await send("Target.disposeBrowserContext", { browserContextId: contextId }); } catch { }
			if (host) { host.stdin.end(); host.kill(); }
			logf.end(); cmdf.end();
			done({ ed, dir, lines, problems, secs: (Date.now() - t0) / 1000 });
		};
		/* the host: deskStubHost's stdout (one batch per line) to the page, in order */
		let toPage = Promise.resolve();
		const deliver = text => { toPage = toPage.then(() => finished ? null : send("Runtime.evaluate", { expression: `window.gm && gm.recv(${text})` }, sid).catch(e => log("recv: " + e.message))); };
		if (STUB) {
			host = spawn(STUB, [ed], { stdio: ["pipe", "pipe", "pipe"] });
			let buf = "";
			host.stdout.on("data", d => { buf += d; for (let nl; (nl = buf.indexOf("\n")) >= 0;) { const l = buf.slice(0, nl); buf = buf.slice(nl + 1); if (l) deliver(l); } });
			host.stderr.on("data", d => log("host: " + String(d).trimEnd()));
			host.on("exit", code => { if (!finished) finish(`the host ended (exit ${code})`); });
		}
		const fromPage = batch => {
			for (const c of batch) {
				cmdf.write(JSON.stringify(c) + "\n");
				const bad = VALIDATE[ed](c);
				if (bad) { problems.push("outside the contract: " + bad); log("CONTRACT " + bad); }
			}
			if (host) host.stdin.write(JSON.stringify(batch) + "\n");
			else deliver(JSON.stringify(batch.filter(c => c.id != null).map(c => ({ type: "result", id: c.id, op: c.op, ok: true }))));
		};
		/* each page in a browser context of its own: the pages of one run shared one origin, so one page's remembered
		   ticks (localStorage: Copy what, Paste what) were another's starting state, whatever journey it ran then */
		contextId = (await send("Target.createBrowserContext", { disposeOnDetach: true })).browserContextId;
		targetId = (await send("Target.createTarget", { url: "about:blank", browserContextId: contextId })).targetId;
		sid = (await send("Target.attachToTarget", { targetId, flatten: true })).sessionId;
		sessions.set(sid, (method, p) => {
			if (method === "Runtime.bindingCalled" && p.name === "__mdmmPost") { try { fromPage(JSON.parse(p.payload)); } catch (e) { log("post: " + e.message); } }
			/* a journey that visits window sizes (the fit journeys): __mdmmView({width, height}) resizes the page's viewport */
			else if (method === "Runtime.bindingCalled" && p.name === "__mdmmView") { try { const v = JSON.parse(p.payload);
				send("Emulation.setDeviceMetricsOverride", { width: v.width, height: v.height, deviceScaleFactor: 1, mobile: false }, sid).catch(e => log("view: " + e.message)); } catch (e) { log("view: " + e.message); } }
			else if (method === "Runtime.consoleAPICalled") {
				const a = p.args.map(x => x.value !== undefined ? x.value : x.description || "");
				const text = a[0] === "[desk]" ? String(a.slice(1).join(" ")) : a.join(" ");
				log(text);
				if (/^JOURNEY/.test(text)) {
					lines.push(text);
					/* MDMM_PAGE_ON_FAIL: an expression evaluated in the page at each failed journey, its value logged (debugging) */
					if (process.env.MDMM_PAGE_ON_FAIL && /^JOURNEY \S+ FAIL/.test(text))
						send("Runtime.evaluate", { expression: `String(${process.env.MDMM_PAGE_ON_FAIL})` }, sid).then(r => { log("ON FAIL " + r.result.value); if (opt.verbose) console.log("   " + ed + ": ON FAIL " + r.result.value); }).catch(() => { });
					if (opt.verbose || /^JOURNEY \S+ (PASS|FAIL|SKIP)/.test(text)) console.log(`   ${ed}: ${text.slice(0, 300)}`);
					if (/^JOURNEYS DONE/.test(text)) finish(null);
				}
				if (/^page error/.test(text)) problems.push(text.slice(0, 300));
			} else if (method === "Runtime.exceptionThrown") {
				const d = p.exceptionDetails, text = `page error: ${d.exception?.description || d.text} @${d.lineNumber}`;
				log(text); problems.push(text.slice(0, 300));
			}
		});
		await send("Runtime.enable", {}, sid);
		await send("Page.enable", {}, sid);
		await send("Runtime.addBinding", { name: "__mdmmPost" }, sid);
		await send("Runtime.addBinding", { name: "__mdmmView" }, sid);
		await send("Page.addScriptToEvaluateOnNewDocument", { source: "window.gmDev = b => __mdmmPost(JSON.stringify(b)); window.gmView = (width, height) => __mdmmView(JSON.stringify({ width, height }));" }, sid);
		await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 924, deviceScaleFactor: 1, mobile: false }, sid);
		await send("Emulation.setFocusEmulationEnabled", { enabled: true }, sid);
		// the journeys are written for the macOS editor (Cmd chords, metaKey): the page reads its platform from navigator.platform,
		// so a Linux or Windows Chrome says it is a Mac, as the plug-in's WKWebView does
		await send("Emulation.setUserAgentOverride", { userAgent: await userAgent(), platform: "MacIntel" }, sid);
		const page = ed === "md" ? "md/mdStudio.html" : "mm/mmStudio.html";
		timer = setTimeout(() => finish(`no JOURNEYS DONE after ${opt.timeout} s`), opt.timeout * 1000);
		await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/${page}?dev=1&version=${version}&selftest=${encodeURIComponent(selector)}` }, sid);
	});
}

/* ---------- the units, the report ---------- */
const eds = which === "both" ? ["md", "mm"] : [which];
const tierSel = opt.tier === "all" ? "" : "~" + opt.tier;
const shufSel = opt.shuffle != null ? `:shuffle-${opt.shuffle}` : "";
if (!opt.list) console.log(`== page tier: ${sel}${tierSel}, ${eds.join(" + ")}, ${opt.isolate ? "each journey in a page of its own, " + opt.jobs + " at once" : opt.jobs + " page(s) each"}, host ${opt.host === "stub" ? path.relative(ROOT, STUB) : "record"}${opt.shuffle != null ? `, shuffle seed ${opt.shuffle}` : ""}; report: ${OUT}`);
const T0 = Date.now();
let results;
if (opt.list) {
	/* no host, no timing: just the names (the list unit needs only the page) */
	const ls = await Promise.all(eds.map(ed => runUnit(ed, sel + tierSel + shufSel + ":list", path.join(OUT, `${ed}-list`))));
	ws.close(); chrome.kill(); server.close();
	for (const l of ls) { console.log(`LIST ${l.ed}: ${(l.lines.find(x => /^JOURNEYS list: /.test(x)) || "").replace(/^JOURNEYS list: ?/, "")}`);
		console.log(`ALONE ${l.ed}: ${(l.lines.find(x => /^JOURNEYS alone: /.test(x)) || "").replace(/^JOURNEYS alone: ?/, "")}`); }
	process.exit(0);
}
if (!opt.isolate) {
	/* a journey that cannot put back what it changes (alone: true, deskJourney.js) gets a page of its own: the shards leave it out */
	const aloneOf = {};
	await Promise.all(eds.map(async ed => { const l = await runUnit(ed, sel + tierSel + ":list", path.join(OUT, `${ed}-list`));
		aloneOf[ed] = ((l.lines.find(x => /^JOURNEYS alone: /.test(x)) || "").replace(/^JOURNEYS alone: ?/, "")).split(" ").filter(Boolean); }));
	const units = [];
	for (const ed of eds) {
		const excl = aloneOf[ed].map(n => ",!" + n).join(""), base = excl && sel === "journey" ? "journey-*" : sel;
		for (let k = 1; k <= opt.jobs; k++) units.push(runUnit(ed, base + excl + tierSel + (opt.jobs > 1 ? `@${k}/${opt.jobs}` : "") + shufSel, path.join(OUT, `${ed}${opt.jobs > 1 ? "-" + k : ""}`)));
		for (const n of aloneOf[ed]) units.push(runUnit(ed, "journey-" + n, path.join(OUT, `${ed}-alone`, n)));
	}
	results = await Promise.all(units);
} else {
	/* the names first (":list": nothing runs), then each in a unit of its own, opt.jobs at once per editor, in the shuffled order when asked */
	results = [];
	const quiet = opt.verbose; opt.verbose = false;
	await Promise.all(eds.map(async ed => {
		const l = await runUnit(ed, sel + tierSel + shufSel + ":list", path.join(OUT, `${ed}-list`));
		opt.verbose = quiet;
		const names = ((l.lines.find(x => /^JOURNEYS list: /.test(x)) || "").replace(/^JOURNEYS list: ?/, "")).split(" ").filter(Boolean);
		if (!names.length) { results.push(l); return; }
		console.log(`   ${ed}: ${names.length} journeys, each alone`);
		let next = 0;
		const worker = async () => { while (next < names.length) { const n = names[next++]; results.push(await runUnit(ed, "journey-" + n, path.join(OUT, `${ed}-alone`, n))); } };
		await Promise.all(Array.from({ length: opt.jobs }, worker));
	}));
}
ws.close(); chrome.kill(); server.close();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch { }

let passed = 0, failed = 0, skipped = 0, status = 0;
const report = [], leftOver = [];
for (const r of results) {
	if (!opt.isolate || /-list$/.test(path.basename(r.dir))) report.push(`== ${r.ed} (${path.basename(r.dir)}), ${r.secs.toFixed(1)} s`);
	for (const l of r.lines) if (/^JOURNEY \S+ (PASS|FAIL|SKIP)|^JOURNEYS (start|DONE)/.test(l)) report.push(l);
	passed += r.lines.filter(l => /^JOURNEY \S+ PASS/.test(l)).length;
	failed += r.lines.filter(l => /^JOURNEY \S+ FAIL/.test(l)).length;
	skipped += r.lines.filter(l => /^JOURNEY \S+ SKIP/.test(l)).length;
	/* what a journey left for the next one to put right (the page's between and the runner's close of what stays open), and what it left
	   changed in the machine's documents and modes (its tidy was to put it back: "left:") */
	for (const l of r.lines) if (/^JOURNEY \S+ (before|left): /.test(l)) leftOver.push(`${r.ed}: ${l.replace(/^JOURNEY /, "")}`);
	const uniq = [...new Set(r.problems)];
	for (const p of uniq.slice(0, 10)) report.push("FAIL " + p);
	if (uniq.length) status = 1;
	if (!opt.isolate || /-list$/.test(path.basename(r.dir)) || r.problems.length || r.lines.some(l => /^JOURNEY \S+ FAIL/.test(l))) report.push(`   log: ${path.join(r.dir, "page.log")}`);
}
if (failed) status = 1;
if (passed + failed + skipped === 0) { report.push("FAIL no journey matched " + sel + tierSel); status = 1; }
if (leftOver.length) { report.push(`WARN ${leftOver.length} journey(s) left state behind ("<journey> left:" is the one that did not tidy; "<journey> before:" names the one after it that met it):`); for (const l of leftOver) report.push("   " + l.slice(0, 200)); }
if (opt.shuffle != null) report.push(`SHUFFLE seed ${opt.shuffle} (node scripts/mdmm-page.mjs --shuffle ${opt.shuffle}${opt.isolate ? " --isolate" : ""} ... plays the same order)`);
report.push(`PAGE JOURNEYS: ${passed} passed, ${failed} failed, ${skipped} skipped in ${Math.round((Date.now() - T0) / 1000)} s (${opt.jobs} per editor)`);
fs.writeFileSync(path.join(OUT, "report.txt"), report.join("\n") + "\n");
console.log(report.filter(l => !/^JOURNEY \S+ PASS/.test(l)).join("\n"));
process.exit(status);
