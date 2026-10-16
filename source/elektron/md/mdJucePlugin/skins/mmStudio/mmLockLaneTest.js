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
/* the lane's keys: one per step, 10 px wide, 124 px tall (what drawSlides measures) */
const keyEl = s => ({ dataset: { s: String(s) }, getBoundingClientRect: () => ({ left: s * 10, top: 0, width: 10, height: 124, bottom: 124 }), querySelector: () => null, closest: () => keyEl(s) });
const meterEl = { title: "", className: "", classList: { add() { }, remove() { } }, style: {}, dataset: {} };
const svgEl = { innerHTML: "", setAttribute() { } };
const laneEl = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 124, bottom: 124 }), contains: () => true, querySelector: q => { const m = /data-s="(\d+)"/.exec(q); return m ? keyEl(+m[1]) : null; }, innerHTML: "", textContent: "", style: {}, dataset: {}, classList: { add() { }, remove() { } } };
let DOC;
/* the elements a test puts behind a selector */
const hooks = {};
function page() {
	const any = new Proxy(function () { }, {
		get: (t, k) => k === Symbol.toPrimitive ? () => 0 : k === Symbol.iterator ? function* () { } : k === "length" ? 0 : any,
		apply: () => any, construct: () => any, has: () => false, set: () => true });
	DOC = new Proxy({}, { get: (t, k) => k === "querySelector" ? q => q in hooks ? hooks[q] : q === "#lane" ? laneEl : q === "#lanesvg" ? svgEl : q === "#meter" ? meterEl : any : k === "elementFromPoint" ? () => hooks.under || keyEl(win.__pick) : any });
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
			"drawSlides, lockPicker, kitHit, kitGrab, kitAt, laneAt, endLaneDraw, commit, laneMeta, valueHTML, kitLabelHTML, laneNow: () => laneDraw, laneSet: d => { laneDraw = d; }, renderTop, laneAlt: s => { window.__pick = s; laneDraw = { erase: true, touched: false }; try { laneAt({ clientX: 0, clientY: 0 }); } catch (e) { console.log('ERR', e.message); } }, rollAdd, rollLen, rollRemove, editSpan, setRollLen, selMoveTo, selClear, noteSpans, vis } };";
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
const draw = pid => { S.lane = pid; S.lanePage = pid.split(".")[0]; p.renderLane(); return laneEl.innerHTML; };
/* bars: [{ s, ghost, h }] with h the bar's fraction (the CSS height is max(2px, calc(... * h))) */
const bars = pid => [...draw(pid).matchAll(/<div class="lb ([^"]*)" data-s="(\d+)" title="([^"]*)">(.*?)<\/div>(?=<div class="lb|$)/g)]
	.map(m => { const h = m[4].match(/<i style="[^"]*height:max\(2px,calc\(\(100% - 14px\)\*([0-9.]+)\)\)"/); return h && { s: +m[2], ghost: /\bghost\b/.test(m[1]), h: +h[1], title: m[3] }; }).filter(Boolean);

/* 1. a lock on a step with no trig (a machine's backup holds such locks): kept, and drawn as a ghost bar */
lane("AMP.0", { 2: 90, 10: 90, 18: 90, 26: 90 });
lane("AMP.2", { 3: 90, 11: 90, 19: 90, 27: 90 });
const counted = pid => S.locks.get(TRK + "|" + pid)?.size || 0;	// the panel's number (70-seq.js, the rail)
check(bars("AMP.0").length === counted("AMP.0") && bars("AMP.0").every(b => !b.ghost), "ATK: the 4 counted locks are 4 solid bars");
const dec = bars("AMP.2");
check(dec.length === counted("AMP.2") && dec.every(b => b.ghost), "DEC: the 4 locks on steps without a trig are 4 ghost bars (" + dec.length + " drawn, " + dec.filter(b => b.ghost).length + " ghost)");
check(dec.every(b => /without a trig: the machine ignores it/.test(b.title)), "a ghost bar's tooltip says the machine ignores it");
check(counted("AMP.2") === 4 && S.locks.has(TRK + "|AMP.2"), "the locks stay in the data (nothing is dropped)");

/* 2. a lock of 0 is a bar of no height by value: it keeps a minimum mark (CSS max(2px, ...)) */
lane("AMP.5", { 2: 0, 10: 0, 18: 0, 26: 0 });
const vol = bars("AMP.5");
check(vol.length === 4 && vol.every(b => !b.ghost) && /max\(2px,/.test(draw("AMP.5")), "VOL locked to 0: four bars with a 2 px minimum");

/* 3. a slide runs between locks on steps with a trig: a lock on a step without one is never played, so no line starts or ends there */
S.tracks[TRK].slide = new Set();
const lines = () => { p.mockup.drawSlides(); return (svgEl.innerHTML.match(/stroke-width="2" /g) || []).length; };
lane("AMP.0", { 2: 90, 10: 40, 11: 70, 18: 60 });	// 11 is a ghost
S.lane = "AMP.0"; S.sel = TRK;
S.tracks[TRK].slide = new Set([2]);
check(lines() === 1, "slide on a real lock, next real lock after a ghost: one line (" + lines() + ")");
check(/M25 \S+ L105 /.test(svgEl.innerHTML), "the line joins step 2 to step 10, over the ghost at 11");
S.tracks[TRK].slide = new Set([11]);
check(lines() === 0, "slide on a ghost lock: no line");
S.tracks[TRK].slide = new Set([10]);
check(lines() === 1 && /M105 \S+ L185 /.test(svgEl.innerHTML), "slide on 10 skips the ghost at 11 and runs to step 18");
S.tracks[TRK].slide = new Set([2, 10]);
check(lines() === 2, "two slides in a row: two lines");
S.locks.get(TRK + "|AMP.0").delete(18); S.tracks[TRK].slide = new Set([10]);
check(lines() === 0, "no real lock after the slide step: no line");

/* 4. Alt on a ghost key removes its lock (the machine's clear) */
lane("AMP.2", { 3: 90, 11: 90 });
S.lane = "AMP.2"; p.sent.length = 0;
p.mockup.laneAlt(3);
p.run();check(!S.locks.get(TRK + "|AMP.2")?.has(3) && S.locks.get(TRK + "|AMP.2")?.has(11) && p.sent.some(m => /lock/i.test(JSON.stringify(m)) && /null/.test(JSON.stringify(m))), "Alt-erase of a ghost lock sends a lock clear for that step only");

/* 5. the tooltips' units */
lane("AMP.2", { 3: 90, 11: 90, 19: 90, 27: 90 });
const picker = p.mockup.lockPicker(TRK);
check(/data-lane="AMP\.2"[^>]*title="4 locked steps \(4 on steps without a trig\)"/.test(picker), "the parameter's tooltip counts the locks without a trig: \"4 locked steps (4 on steps without a trig)\"");
check(/data-lane="AMP\.5"[^>]*title="4 locked steps"/.test(picker), "a parameter with no ghost locks has no such note");
p.mockup.renderTop();
check(/of 62 locked parameters/.test(meterEl.title), "the lock meter's tooltip counts \"of 62 locked parameters\" (" + meterEl.title.slice(0, 40) + ")");

/* 6. I-035: the kit-value line is grabbed within 4 px of it and dragged (one undo step, no lock painted); the numbers on the lane */
{
	S.lane = "AMP.0"; S.sel = TRK; S.lanePage = "AMP"; lane("AMP.0", { 2: 90 }); S.tracks[TRK].v.AMP[0] = 80; p.renderLane();
	/* a key 124 px tall from y 0: the bars' scale is 6 px in from the bottom, 110 px high; the kit line (80 of 127) is at y 47.7 */
	const classes = new Set();
	const laneBox = Object.assign(Object.create(laneEl), { contains: () => true, setPointerCapture() { }, classList: { add: c => classes.add(c), remove: c => classes.delete(c), toggle: (c, on) => on ? classes.add(c) : classes.delete(c) } });
	const key = { dataset: { s: "2" }, getBoundingClientRect: () => ({ bottom: 124, top: 0, height: 124, left: 20, right: 30, width: 10 }), insertAdjacentHTML() { }, querySelector: q => q === ".base" ? {} : null };
	key.closest = () => key;
	hooks["#lane"] = laneBox; hooks["#lane .lb"] = key; hooks.under = key;
	const at = (y, m = {}) => Object.assign({ button: 0, clientX: 25, clientY: y, target: key, pointerId: 1, preventDefault() { } }, m);
	const M = p.mockup; M.laneSet(null);
	const ops = () => p.sent.map(m => JSON.stringify(m));
	check(!!M.kitHit(at(48)) && !!M.kitHit(at(44)) && !!M.kitHit(at(51)), "the line's hit zone: 48, 44 and 51 are on it (4 px each side of 47.7)");
	check(!M.kitHit(at(43)) && !M.kitHit(at(53)) && !M.kitHit(at(100)), "43, 53 and 100 are off it");
	check(!M.kitHit(Object.assign(at(48), { target: { closest: () => ({ querySelector: () => null }) } })), "a key without a line (no trig) has no zone");
	check(!M.kitGrab(at(48, { altKey: true })) && !M.kitGrab(at(48, { shiftKey: true })) && !M.kitGrab(at(48, { button: 2 })) && !M.laneNow(), "Alt (erase), Shift (ramp) and a right button never grab it");
	/* a click on the line (released without moving more than 3 px) is the lane's: it locks the step at the value under the pointer, the kit value */
	p.sent.length = 0; S.tracks[TRK].v.AMP[0] = 80; S.locks.delete(TRK + "|AMP.0");
	const y80 = 124 - 6 - 110 * 80 / 127;	// the value 80 exactly
	check(M.kitGrab(at(y80)) && M.laneNow()?.kit === "maybe" && !classes.has("kitdrag"), "a press on the line is a maybe-drag: nothing is written yet");
	M.laneAt(at(y80 + 2)); M.endLaneDraw(); p.run();
	check(ops().some(o => /"lock"/.test(o) && /"v":80\b/.test(o)) && !ops().some(o => /"param"/.test(o)) && !M.laneNow(), "released after a 2 px move it is a click: the step is locked at the kit value 80, no kit edit: " + ops().join(" ").slice(0, 100));
	p.sent.length = 0; let commits = 0; const hc = M.HOST.commit; M.HOST.commit = () => { commits++; };
	check(M.kitGrab(at(48)) && M.laneNow()?.kit === "maybe", "a press on the line begins as a maybe-drag");
	M.laneAt(at(45)); check(M.laneNow()?.kit === "maybe" && !classes.has("kitdrag"), "3 px of movement is still a click");
	M.laneAt(at(20)); check(M.laneNow()?.kit === true && classes.has("kitdrag"), "more than 3 px up or down is the kit drag (the lane's cursor follows)");
	M.laneAt(at(5)); M.laneAt(at(5)); M.commit(); p.run();
	const prm = ops().filter(o => /"param"/.test(o));
	check(!ops().some(o => /"lock"/.test(o)), "dragging the line paints no lock: " + ops().join(" ").slice(0, 120));
	check(prm.length >= 1 && /"v":127\b/.test(prm[prm.length - 1]) && /"t":3,"page":1,"i":0/.test(prm[0]) && new Set(prm.map(o => JSON.parse(o).g)).size === 1 && S.tracks[TRK].v.AMP[0] === 127, "the drag sets the kit value like the knob (param intents on ATK, ending at 127, one gesture): " + prm.join(" "));
	check(commits === 0 && M.laneNow(), "no commit while the line is held: the whole drag is one undo step");
	M.endLaneDraw(); M.commit(); p.run();
	check(!M.laneNow() && commits === 1 && !classes.has("kitdrag"), "letting go ends it and commits once");
	M.HOST.commit = hc;
	/* elsewhere the lane draws a lock as before */
	p.sent.length = 0; S.tracks[TRK].v.AMP[0] = 80;
	check(!M.kitGrab(at(100)), "a press off the line is the lane's: no grab");
	M.laneSet({ touched: false }); M.laneAt(at(60)); M.laneSet(null); p.run();
	check(ops().some(o => /"lock"/.test(o)) && !ops().some(o => /"param"/.test(o)), "and it edits the lock, no kit value: " + ops().join(" ").slice(0, 100));
	delete hooks["#lane"]; delete hooks["#lane .lb"]; delete hooks.under;
	/* the numbers: a lock's at its bar's end, the kit's on the line; a list parameter shows its name, a signed one -64..+63 */
	S.tracks[TRK].steps[2] = { n: [60], a: 1, f: 1, l: 1 }; lane("AMP.0", { 2: 90, 10: 30 }); S.tracks[TRK].v.AMP[0] = 80;
	let html = draw("AMP.0"); const m0 = M.laneMeta().m;
	check(/<span class="vl"[^>]*>90<\/span>/.test(html) && /<span class="vl"[^>]*>30<\/span>/.test(html) && /<span class="kvl"[^>]*>80<\/span>/.test(html), "ATK: the locks' numbers 90 and 30 and the kit line's 80 are on the lane");
	check((html.match(/class="kvl"/g) || []).length === 1 && html.lastIndexOf('class="kvl"') > html.lastIndexOf('data-s="10"'), "the kit number is once, at the lane's right end (the last key with a trig)");
	check(/class="kvl fl"/.test(M.kitLabelHTML(m0, 127, 127)) && /class="kvl"/.test(M.kitLabelHTML(m0, 40, 127)), "near the top the kit's number moves left of its key");
	check(!/<span>80/.test(html) && !/lbscale[^>]*><b>[^<]*<\/b><span/.test(html), "the scale on the left keeps its top and bottom numbers and no kit value (the line carries it)");
	check(/<div class="base"/.test(html.slice(html.indexOf('data-s="2"'))), "the kit line is drawn on a key with a trig");
	S.lane = "LF1.3"; S.lanePage = "LF1"; const m = M.laneMeta().m;
	lane("LF1.3", { 2: 1, 10: 2 }); S.tracks[TRK].v.LF1[3] = 0; html = draw("LF1.3");
	check(m.en && new RegExp(">" + m.en[1] + "</span>").test(html) && new RegExp(">" + m.en[2] + "</span>").test(html) && new RegExp('class="kvl"[^>]*>' + m.en[0] + "<").test(html), "a list parameter (LFO wave) shows its names: " + m.en.slice(0, 3).join(" "));
	S.lane = "AMP.0"; S.lanePage = "AMP"; S.tracks[TRK].steps[2] = { n: [60], a: 1, f: 1, l: 1 };
	const ghostHtml = (() => { lane("AMP.0", { 5: 70 }); return draw("AMP.0"); })();
	check(/data-s="5"[^>]*><div class="base"/.test(ghostHtml), "the line is drawn on a ghost step too");
	for (const k of Object.keys(hooks)) delete hooks[k];
}

console.log(failures ? `mmLockLaneTest: ${failures} failure(s)` : "mmLockLaneTest: PASS");
process.exit(failures ? 1 : 0);
