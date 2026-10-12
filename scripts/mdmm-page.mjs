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
//                              [--out DIR] [--verbose] [md|mm|both] [selector]
//     selector: as scripts/mdmm-journeys.sh (journey, journey-seq-*, journey-md-lib-*,mm-mix-*); default journey
//     --tier: the journeys of that tier (skins/shared/deskJourney.js TIERS); default page
//     --jobs N: N pages per editor at once, each with its own host, each every N-th journey (default 2)
// Environment: MDMM_CHROME (Chrome's binary), MDMM_CHROME_ARGS (more Chrome flags, space separated), MDMM_STUB_HOST (deskStubHost's binary; default: the newest under temp/),
// MDMM_PAGE_OUT (the report folder, default temp/page/<date-time>). Prints the JOURNEY lines and a total; exits 1 on any
// FAIL, a page that never said JOURNEYS DONE, a command outside the contract or a page error.
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKINS = path.join(ROOT, "source/elektron/md/mdJucePlugin/skins");
const usage = () => { console.error("usage: node scripts/mdmm-page.mjs [--jobs N] [--tier page|machine|host|all] [--host stub|record] [--timeout S] [--out DIR] [--verbose] [md|mm|both] [selector]"); process.exit(2); };

/* ---------- arguments ---------- */
const opt = { jobs: 2, tier: "page", host: "stub", timeout: 600, out: process.env.MDMM_PAGE_OUT || "", verbose: false };
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
	else if (x.startsWith("--")) usage();
	else rest.push(x);
}
const which = rest[0] || "both";
let sel = rest[1] || "journey";
if (!sel.startsWith("journey")) sel = "journey-" + sel;
if (!["md", "mm", "both"].includes(which) || !["page", "machine", "host", "all"].includes(opt.tier) || !["stub", "record"].includes(opt.host)
	|| !(opt.jobs >= 1) || /[@~]/.test(sel)) usage();

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
const OUT = path.resolve(opt.out || path.join(ROOT, "temp/page", stamp));
fs.mkdirSync(OUT, { recursive: true });
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
if (!CHROME) { console.error("FAIL no Chrome (set MDMM_CHROME)"); process.exit(1); }

/* ---------- the contract: every command the page sends ---------- */
function validator(schemaFile) {
	const schema = JSON.parse(fs.readFileSync(schemaFile, "utf8"));
	const resolve = s => { while (s && s.$ref) s = s.$ref.replace(/^#\//, "").split("/").reduce((o, k) => o[k], schema); return s; };
	const typeOk = (t, v) => t === "integer" ? Number.isInteger(v) : t === "number" ? typeof v === "number" : t === "array" ? Array.isArray(v)
		: t === "object" ? v !== null && typeof v === "object" && !Array.isArray(v) : t === "null" ? v === null : typeof v === t;
	function check(s, v, at) {
		s = resolve(s); if (!s || s === true) return null;
		if (s.oneOf || s.anyOf) { const list = s.oneOf || s.anyOf; for (const x of list) if (!check(x, v, at)) return null; return `${at}: matches none of ${list.length}`; }
		if (s.type && ![].concat(s.type).some(t => typeOk(t, v))) return `${at}: not ${[].concat(s.type).join("|")} (${JSON.stringify(v)})`;
		if ("const" in s && v !== s.const) return `${at}: not ${JSON.stringify(s.const)}`;
		if (s.enum && !s.enum.includes(v)) return `${at}: ${JSON.stringify(v)} not one of ${s.enum.join(", ")}`;
		if (typeof v === "number") { if (s.minimum != null && v < s.minimum) return `${at}: ${v} < ${s.minimum}`; if (s.maximum != null && v > s.maximum) return `${at}: ${v} > ${s.maximum}`; }
		if (Array.isArray(v)) { if (s.minItems != null && v.length < s.minItems) return `${at}: fewer than ${s.minItems}`; if (s.maxItems != null && v.length > s.maxItems) return `${at}: more than ${s.maxItems}`;
			if (s.items) for (let i = 0; i < v.length; i++) { const e = check(s.items, v[i], `${at}[${i}]`); if (e) return e; } }
		if (v && typeof v === "object" && !Array.isArray(v)) {
			for (const r of s.required || []) if (!(r in v)) return `${at}: no ${r}`;
			for (const [k, x] of Object.entries(v)) {
				if (s.properties && k in s.properties) { const e = check(s.properties[k], x, `${at}.${k}`); if (e) return e; }
				else if (s.additionalProperties === false) return `${at}: ${k} is not in the contract`;
			}
		}
		return null;
	}
	const commands = resolve(schema.$defs.command).oneOf.map(resolve);
	return cmd => {
		const c = commands.find(s => s.properties?.op?.const === cmd.op);
		if (!c) return `unknown command ${cmd.op}`;
		return check(c, cmd, cmd.op);
	};
}
const VALIDATE = { md: validator(path.join(ROOT, "doc/modern-ux/md-data-contract.schema.json")), mm: validator(path.join(ROOT, "doc/modern-ux/mm-data-contract.schema.json")) };

/* ---------- the page's files, as the plug-in bundles them (by name) ---------- */
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".ttf": "font/ttf", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((req, res) => {
	const u = new URL(req.url, "http://x");
	const [, ed, ...rel] = u.pathname.split("/");
	const name = rel.join("/");
	const dirs = ed === "md" ? ["mdStudio", "shared"] : ed === "mm" ? ["mmStudio", "shared", "mdStudio"] : [];
	const file = dirs.map(d => path.join(SKINS, d, name)).find(f => !name.includes("..") && fs.existsSync(f) && fs.statSync(f).isFile());
	if (!file) { res.writeHead(404); res.end(); return; }
	res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
	fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const PORT = server.address().port;

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
		const page = ed === "md" ? "md/mdStudio.html" : "mm/mmStudio.html";
		timer = setTimeout(() => finish(`no JOURNEYS DONE after ${opt.timeout} s`), opt.timeout * 1000);
		await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/${page}?dev=1&version=${version}&selftest=${encodeURIComponent(selector)}` }, sid);
	});
}

/* ---------- the units, the report ---------- */
const eds = which === "both" ? ["md", "mm"] : [which];
const tierSel = opt.tier === "all" ? "" : "~" + opt.tier;
console.log(`== page tier: ${sel}${tierSel}, ${eds.join(" + ")}, ${opt.jobs} page(s) each, host ${opt.host === "stub" ? path.relative(ROOT, STUB) : "record"}; report: ${OUT}`);
const T0 = Date.now();
const units = [];
for (const ed of eds) for (let k = 1; k <= opt.jobs; k++) units.push(runUnit(ed, sel + tierSel + (opt.jobs > 1 ? `@${k}/${opt.jobs}` : ""), path.join(OUT, `${ed}${opt.jobs > 1 ? "-" + k : ""}`)));
const results = await Promise.all(units);
ws.close(); chrome.kill(); server.close();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch { }

let passed = 0, failed = 0, skipped = 0, status = 0;
const report = [], leftOver = [];
for (const r of results) {
	report.push(`== ${r.ed} (${path.basename(r.dir)}), ${r.secs.toFixed(1)} s`);
	for (const l of r.lines) if (/^JOURNEY \S+ (PASS|FAIL|SKIP)|^JOURNEYS (start|DONE)/.test(l)) report.push(l);
	passed += r.lines.filter(l => /^JOURNEY \S+ PASS/.test(l)).length;
	failed += r.lines.filter(l => /^JOURNEY \S+ FAIL/.test(l)).length;
	skipped += r.lines.filter(l => /^JOURNEY \S+ SKIP/.test(l)).length;
	/* what a journey left for the next one to put right (the page's between and the runner's close of what stays open) */
	for (const l of r.lines) if (/^JOURNEY \S+ before: /.test(l)) leftOver.push(`${r.ed}: ${l.replace(/^JOURNEY /, "")}`);
	const uniq = [...new Set(r.problems)];
	for (const p of uniq.slice(0, 10)) report.push("FAIL " + p);
	if (uniq.length) status = 1;
	report.push(`   log: ${path.join(r.dir, "page.log")}`);
}
if (failed) status = 1;
if (passed + failed + skipped === 0) { report.push("FAIL no journey matched " + sel + tierSel); status = 1; }
if (leftOver.length) { report.push(`WARN ${leftOver.length} journey(s) started on state the one before left (the journey named comes after the one that left it):`); for (const l of leftOver) report.push("   " + l.slice(0, 200)); }
report.push(`PAGE JOURNEYS: ${passed} passed, ${failed} failed, ${skipped} skipped in ${Math.round((Date.now() - T0) / 1000)} s (${opt.jobs} per editor)`);
fs.writeFileSync(path.join(OUT, "report.txt"), report.join("\n") + "\n");
console.log(report.filter(l => !/^JOURNEY \S+ PASS/.test(l)).join("\n"));
process.exit(status);
