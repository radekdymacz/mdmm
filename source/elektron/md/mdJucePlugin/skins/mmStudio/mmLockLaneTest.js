"use strict";
/* B-164 (a Monomachine Editor tester, 0.7.0): the lock lane and the lock counts, on the page as the plug-in loads it
   (the page of mmViewTest.js on the same stand-in, with a DOM that keeps what the lane writes).
   The tester's pattern: track 4, 8 trigs; the parameter panel counts ATK 4, DEC 4, VOL 4, PAN 4 (16 locked steps),
   the LCD says LOCKS 07/62 (locked parameters over all tracks: another unit), the lane shows ATK, VOL and PAN bars but
   nothing for DEC, and the machine shows 12. Two causes would make a counted lock invisible, both checked here:
   - a lock on a step without a trig (the machine keeps such locks in a backup but plays and shows none): counted in
     the panel, drawn nowhere;
   - a lock of 0: a bar of no height.
   A lock the panel counts must be seen in the lane, or not counted.
     node mmLockLaneTest.js */
const fs = require("fs"), path = require("path");
const SK = path.join(__dirname, ".."), R = path.join(__dirname, "../../../../../..");
let failures = 0;
const check = (ok, what) => { console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) failures++; };
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "mmViewFixture.json"), "utf8"));
const catalogue = JSON.parse(fs.readFileSync(path.join(R, "doc/modern-ux/mm-catalogue.json"), "utf8"));
const FILES = ["shared/deskBridge.js", "shared/deskDocs.js", "shared/deskOverlay.js", "shared/deskDrop.js",
	"mmStudio/mmAdapter.js", "mmStudio/mmMockup.js",
	"mmStudio/mmConvert.js", "mmStudio/mmView.js"].map(f => path.join(SK, f));


/* ---- the page on a stand-in: every unknown name is "any" (callable, constructible, every property any); timers
   run when the test says; the bridge's dev transport collects what the page sends ---- */
/* a DOM that keeps what the page writes to #lane and answers the rest with "any" */
const laneEl = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1, height: 1, bottom: 1 }), querySelector: () => null, innerHTML: "", textContent: "", style: {}, dataset: {}, classList: { add() { }, remove() { } } };
let DOC;
function page() {
	const any = new Proxy(function () { }, {
		get: (t, k) => k === Symbol.toPrimitive ? () => 0 : k === Symbol.iterator ? function* () { } : k === "length" ? 0 : any,
		apply: () => any, construct: () => any, has: () => false, set: () => true });
	DOC = new Proxy({}, { get: (t, k) => k === "querySelector" ? q => q === "#lane" ? laneEl : any : any });
	const timers = [], sent = [], win = {}, frames = { n: 0 };
	const windowP = new Proxy(win, { get: (t, k) => k in t ? t[k] : /EventListener$/.test(String(k)) ? () => { } : undefined,
		set: (t, k, v) => { t[k] = v; return true; }, has: (t, k) => k in t });
	win.gmDev = batch => sent.push(...JSON.parse(JSON.stringify(batch)));
	const real = { Math, JSON, Object, Array, String, Number, Boolean, Set, Map, WeakMap, WeakSet, Symbol, Promise, Date, RegExp, Error, TypeError, parseInt,
		parseFloat, isNaN, isFinite, Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array, Float32Array, Float64Array, DataView, ArrayBuffer,
		console, document: DOC, encodeURIComponent, decodeURIComponent, Infinity, NaN, undefined, URLSearchParams, structuredClone,
		atob: s => Buffer.from(s, "base64").toString("binary"), location: { hash: "", search: "", protocol: "http:" }, window: windowP,
		setTimeout: f => { timers.push(f); return timers.length; }, clearTimeout: () => { }, setInterval: () => 0, clearInterval: () => { },
		queueMicrotask: f => timers.push(f), performance: { now: () => 0 },
		/* the frames the page asks for (redraw: every canvas), counted; run at once */
		requestAnimationFrame: f => { frames.n++; f(0); return 0; }, cancelAnimationFrame: () => { } };
	const scope = new Proxy({}, {
		has: () => true,
		get: (t, k) => k === Symbol.unscopables ? undefined : k in t ? t[k] : k in real ? real[k] : any,
		set: (t, k, v) => { t[k] = v; return true; } });
	/* the mockup calls MMHost.start() at its end, before mmConvert.js and mmView.js are there (later scripts in the
	   plug-in, where start() waits for them): here it is held until they are */
	const hold = "\n;const __start = window.MMHost.start; window.MMHost.start = () => { };\n";
	const src = FILES.map(f => fs.readFileSync(f, "utf8").replace(/^"use strict";/, "") + (/mmAdapter/.test(f) ? hold : "")).join("\n;\n")
		+ "\n;__start();\nreturn { S: () => S, renderLane, Overlay, MmView, docStore, storeDoc, MM_SEAM, Dlg, Banner, mockup: { " +
			"mutApply, genLive, genEnd, setMachine, songAction, secAction, setSel, clearSel, selCut, selDuplicate, selTrigs, selMark, selMove, selGrow, stepMenuItems, Keys, HOST, " +
			"rollAdd, rollLen, rollRemove, editSpan, setRollLen, selMoveTo, selClear, noteSpans, vis } };";
	const out = new Function("scope", "with (scope) {\n" + src + "\n}")(scope);
	const run = () => { for (let n = 0; timers.length && n < 10000; n++) timers.shift()(); };
	run();
	return Object.assign(out, { win, sent, run, frames, host: win.MMHost, recv: msgs => { win.gm.recv(msgs); run(); } });
}
const copy = o => JSON.parse(JSON.stringify(o));

/* ---- the tester's track: 8 trigs (steps 3 5 11 13 19 21 27 29, 1-based), 4 locks each on ATK, DEC, VOL, PAN ---- */
const p = page();
p.recv([{ type: "catalogue", doc: catalogue }]);
p.recv([{ type: "machine", doc: fixture.machine }]);
p.recv(fixture.docs);
p.run();
const S = p.S(), TRK = 3, TRIGS = [2, 4, 10, 12, 18, 20, 26, 28];
S.sel = TRK;
S.tracks[TRK].steps = Array(64).fill(null);
for (const s of TRIGS) S.tracks[TRK].steps[s] = { n: [60], a: 1, f: 1, l: 1 };
S.locks = new Map();
const lane = (pid, byStep) => S.locks.set(TRK + "|" + pid, new Map(Object.entries(byStep).map(([s, v]) => [+s, v])));
const bars = pid => { S.lane = pid; S.lanePage = pid.split(".")[0]; p.renderLane(); return (laneEl.innerHTML.match(/<i style="bottom:6px;height:calc\(\(100% - 14px\)\*([0-9.]+)\)"/g) || []).map(m => +m.match(/\*([0-9.]+)\)/)[1]); };

/* 1. a lock on a step with no trig (a machine's backup holds such locks): counted by the panel, drawn nowhere */
lane("AMP.0", { 2: 90, 10: 90, 18: 90, 26: 90 });
lane("AMP.2", { 3: 90, 11: 90, 19: 90, 27: 90 });
const counted = pid => S.locks.get(TRK + "|" + pid)?.size || 0;	// the panel's number (70-seq.js, the rail)
check(bars("AMP.0").length === counted("AMP.0"), "ATK: the 4 counted locks are 4 bars");
const decBars = bars("AMP.2").length, decCount = counted("AMP.2");
check(decBars === decCount,
	"DEC: the panel counts " + decCount + " locks, the lane draws " + decBars + " bars (locks on steps without a trig are neither shown nor flagged)");

/* 2. a lock of 0 is a bar of no height: it must still be seen */
lane("AMP.5", { 2: 0, 10: 0, 18: 0, 26: 0 });
const vol = bars("AMP.5");
check(vol.length === 4 && vol.every(h => h > 0), "VOL locked to 0: a bar the eye can see (heights " + vol.join(" ") + ")");

console.log(failures ? `mmLockLaneTest: ${failures} failure(s)` : "mmLockLaneTest: PASS");
process.exit(failures ? 1 : 0);
