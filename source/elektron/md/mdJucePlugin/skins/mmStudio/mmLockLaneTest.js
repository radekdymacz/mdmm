"use strict";
/* B-164 (a Monomachine Editor tester, 0.7.0): the lock lane and the lock counts, on the page as the plug-in loads it
   (the page of mmViewTest.js on the same stand-in, with a DOM that keeps what the lane writes).
   The tester's pattern: track 4, 8 trigs; the parameter panel counts ATK 4, DEC 4, VOL 4, PAN 4 (16 locked steps),
   the LCD says LOCKS 07/62 (locked parameters over all tracks: another unit), the lane shows ATK, VOL and PAN bars but
   nothing for DEC, and the machine shows 12. Two causes would make a counted lock invisible, both checked here:
   - a lock on a step without a trig (the machine plays such a lock, B-168, but its screens show none): counted in
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
const keyEl = s => ({ dataset: { s: String(s) }, getBoundingClientRect: () => ({ left: s * 10, top: 0, width: 10, right: s * 10 + 10, height: 124, bottom: 124 }), querySelector: () => null, closest: q => q === ".lb" ? keyEl(s) : null });
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
			"drawSlides, slideGrab, slideNext, bandLive, bandEsc, laneDown, laneMenuItems, rollStepTip, arpCells, arpTicks, dockHelp, lockPicker, kitHit, kitGrab, kitAt, kitNudge, laneAt, endLaneDraw, commit, laneMeta, valueHTML, kitLabelHTML, laneNow: () => laneDraw, laneSet: d => { laneDraw = d; }, renderTop, laneAlt: s => { window.__pick = s; laneDraw = { erase: true, touched: false }; try { laneAt({ clientX: 0, clientY: 0 }); } catch (e) { console.log('ERR', e.message); } }, rollAdd, rollLen, rollRemove, editSpan, setRollLen, selMoveTo, selClear, noteSpans, vis } };";
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

/* 1. a lock on a step with no trig (the machine plays it, B-168): kept, and drawn as a ghost bar */
lane("AMP.0", { 2: 90, 10: 90, 18: 90, 26: 90 });
lane("AMP.2", { 3: 90, 11: 90, 19: 90, 27: 90 });
const counted = pid => S.locks.get(TRK + "|" + pid)?.size || 0;	// the panel's number (70-seq.js, the rail)
check(bars("AMP.0").length === counted("AMP.0") && bars("AMP.0").every(b => !b.ghost), "ATK: the 4 counted locks are 4 solid bars");
const dec = bars("AMP.2");
check(dec.length === counted("AMP.2") && dec.every(b => b.ghost), "DEC: the 4 locks on steps without a trig are 4 ghost bars (" + dec.length + " drawn, " + dec.filter(b => b.ghost).length + " ghost)");
check(dec.every(b => /without a trig: the machine plays it/.test(b.title)), "a ghost bar's tooltip says the machine plays it");
check(counted("AMP.2") === 4 && S.locks.has(TRK + "|AMP.2"), "the locks stay in the data (nothing is dropped)");

/* 2. a lock of 0 is a bar of no height by value: it keeps a minimum mark (CSS max(2px, ...)) */
lane("AMP.5", { 2: 0, 10: 0, 18: 0, 26: 0 });
const vol = bars("AMP.5");
check(vol.length === 4 && vol.every(b => !b.ghost) && /max\(2px,/.test(draw("AMP.5")), "VOL locked to 0: four bars with a 2 px minimum");

/* 3. a slide starts on a lock on a step with a trig and runs to the parameter's next lock, whether its step has a trig or not (measured, w13mmslide: K); no line starts on a lock without a trig */
S.tracks[TRK].slide = new Set();
const lines = () => { p.mockup.drawSlides(); return (svgEl.innerHTML.match(/stroke-width="2" /g) || []).length; };
lane("AMP.0", { 2: 90, 10: 40, 11: 70, 18: 60 });	// 11 is a ghost
S.lane = "AMP.0"; S.sel = TRK;
S.tracks[TRK].slide = new Set([2]);
check(lines() === 1, "slide on a real lock: one line (" + lines() + ")");
check(/M25 \S+ L105 /.test(svgEl.innerHTML), "the line joins step 2 to the next lock, step 10");
S.tracks[TRK].slide = new Set([11]);
check(lines() === 0, "slide on a ghost lock: no line");
S.tracks[TRK].slide = new Set([10]);
check(lines() === 1 && /M105 \S+ L115 /.test(svgEl.innerHTML), "slide on 10 ends on the ghost lock at 11: the machine's next lock, trig or not");
S.tracks[TRK].slide = new Set([2, 10]);
check(lines() === 2, "two slides in a row: two lines");
S.locks.get(TRK + "|AMP.0").delete(18); S.locks.get(TRK + "|AMP.0").delete(11); S.tracks[TRK].slide = new Set([10]);
check(lines() === 0, "no later lock after the slide step: no line");

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

/* 6. B-184: the kit handle and lock bars have disjoint targets, even at equal values. */
{
	S.lane = "AMP.0"; S.sel = TRK; S.lanePage = "AMP"; lane("AMP.0", { 2: 80 }); S.tracks[TRK].v.AMP[0] = 80;
	const classes = new Set();
	const laneBox = Object.assign(Object.create(laneEl), { contains: () => true, setPointerCapture() { }, classList: { add: c => classes.add(c), remove: c => classes.delete(c), toggle() { } } });
	const key = { dataset: { s: "2" }, getBoundingClientRect: () => ({ bottom: 124, top: 0, height: 124, left: 20, right: 30, width: 10 }), insertAdjacentHTML() { }, querySelector: q => q === ".base" ? {} : null };
	key.closest = q => q === ".lb" ? key : null;
	const handle = { closest: q => q === "[data-kitvalue]" ? handle : null, style: {}, setAttribute() { } };
	hooks["#lane"] = laneBox; hooks["#lane .lb"] = key; hooks["#lane [data-kitvalue]"] = handle; hooks.under = key;
	const at = (y, target = key, m = {}) => Object.assign({ button: 0, clientX: 25, clientY: y, target, pointerId: 1, preventDefault() { } }, m);
	const M = p.mockup, yOf = v => 124 - 6 - 110 * v / 127;
	const ops = () => p.sent.map(m => JSON.stringify(m));
	M.laneSet(null);
	check(!M.kitHit(at(yOf(80))) && !M.kitGrab(at(yOf(80))), "a lock at the kit baseline cannot grab the kit");
	check(!!M.kitHit(at(yOf(80), handle)), "the separate KIT handle is the kit's target");
	check(!M.kitGrab(at(48, handle, { altKey: true })) && !M.kitGrab(at(48, handle, { shiftKey: true })) && !M.kitGrab(at(48, handle, { button: 2 })), "Alt, Shift and a right button do not grab the kit handle");
	for (const value of [79, 80, 81]) {
		lane("AMP.0", { 2: value }); p.sent.length = 0; M.laneSet(null);
		M.slideGrab(at(yOf(value))); M.laneAt(at(yOf(value) + 20)); M.endLaneDraw(); p.run();
		check(ops().some(o => /"lock"/.test(o)) && !ops().some(o => /"param"/.test(o)) && S.tracks[TRK].v.AMP[0] === 80,
			`drag a lock at ${value} beside kit value 80: only the lock changes`);
	}
	p.sent.length = 0; M.kitGrab(at(yOf(80), handle)); M.laneAt(at(yOf(80) + 2, handle)); M.endLaneDraw(); p.run();
	check(!p.sent.length && !M.laneNow(), "click the KIT handle with a small jitter: no kit or lock edit");
	p.sent.length = 0; let commits = 0; const hc = M.HOST.commit; M.HOST.commit = () => { commits++; };
	M.kitGrab(at(yOf(80), handle)); M.laneAt(at(yOf(80) - 3, handle));
	check(M.laneNow()?.kit === "maybe" && !classes.has("kitdrag"), "3 px of movement still waits");
	M.laneAt(at(20, handle)); M.laneAt(at(5, handle)); M.commit(); p.run();
	check(!ops().some(o => /"lock"/.test(o)) && ops().some(o => /"param"/.test(o)) && S.tracks[TRK].v.AMP[0] === 127,
		"drag the KIT handle: changes the kit to 127 and paints no lock");
	check(commits === 0 && M.laneNow(), "the drag remains one gesture while held");
	M.endLaneDraw(); M.commit(); p.run();
	check(!M.laneNow() && commits === 1 && !classes.has("kitdrag"), "release ends the kit gesture once");
	M.HOST.commit = hc;
	for (const k of Object.keys(hooks)) delete hooks[k];
	S.tracks[TRK].v.AMP[0] = 80; lane("AMP.0", { 2: 90, 10: 30 });
	let html = draw("AMP.0");
	check(/data-kitvalue class="kitvalue"/.test(html) && /aria-label="Kit value 80"/.test(html), "the gutter visibly labels KIT and names its current value");
	check(/<span class="vl"[^>]*>90<\/span>/.test(html) && /<span class="vl"[^>]*>30<\/span>/.test(html) && /<span class="kvl"[^>]*>80<\/span>/.test(html), "locks and kit retain their separate value labels");
	check(/<div class="base"/.test(html.slice(html.indexOf('data-s="2"'))), "the baseline remains a reference on a trig step");
	check((html.match(/class="kvl"/g) || []).length === 1 && html.lastIndexOf('class="kvl"') > html.lastIndexOf('data-s="10"'), "the kit value label is still once at the lane's right end");
	const m0 = M.laneMeta().m;
	check(/class="kvl fl"/.test(M.kitLabelHTML(m0, 127, 127)) && /class="kvl"/.test(M.kitLabelHTML(m0, 40, 127)), "near the top the kit's number still moves left of its key");
	S.lane = "LF1.3"; S.lanePage = "LF1"; const m = M.laneMeta().m;
	lane("LF1.3", { 2: 1, 10: 2 }); S.tracks[TRK].v.LF1[3] = 0; html = draw("LF1.3");
	check(m.en && new RegExp(">" + m.en[1] + "</span>").test(html) && new RegExp(">" + m.en[2] + "</span>").test(html) && new RegExp('class="kvl"[^>]*>' + m.en[0] + "<").test(html), "list parameters retain their names on lock and kit labels");
	S.lane = "AMP.0"; S.lanePage = "AMP";

	lane("AMP.0", { 5: 70 }); html = draw("AMP.0");
	check(/data-s="5"[^>]*><div class="base"/.test(html), "the baseline remains a reference on a ghost step");
}

/* 7. a slide drawn in the lane: the dot dragged sideways sets the slide flag of its step (the machine's slide track: every
   parameter locked there glides to its own next lock, past trigs without one), one undo step; up and down is the lock's value;
   a click on the ramp's line takes the flag off */
{
	const M = p.mockup, classes = new Set();
	const laneBox = Object.assign(Object.create(laneEl), { contains: () => true, setPointerCapture() { }, classList: { add: c => classes.add(c), remove: c => classes.delete(c), toggle() { } } });
	const keys = {}; for (const k of TRIGS.concat([3])) { keys[k] = Object.assign(keyEl(k), { insertAdjacentHTML() { }, querySelector: () => null }); keys[k].closest = q => q === ".lb" ? keys[k] : null; }
	const setHooks = () => { hooks.under = keys[2]; hooks["#lane"] = laneBox; hooks["#lane .lb"] = keys[2]; for (const k of Object.keys(keys)) hooks[`#lane .lb[data-s="${k}"]`] = keys[k]; };
	const clearHooks = () => { for (const k of Object.keys(hooks)) delete hooks[k]; };
	const at = (x, y, el = keys[2], m = {}) => Object.assign({ button: 0, clientX: x, clientY: y, target: Object.assign(Object.create(el), { closest: q => q === ".lb" ? el : null }), pointerId: 1, preventDefault() { } }, m);
	const yOf = v => 124 - 6 - 110 * v / 127;	// the bar's top for a value, in the 124 px key
	const ops = () => p.sent.map(m => JSON.stringify(m));
	const slides = () => ops().filter(o => /"slide"/.test(o)), lockOps = () => ops().filter(o => /"lock"/.test(o));
	const fresh = (locks, slide = []) => { setHooks(); M.laneSet(null); S.sel = TRK; S.lane = "AMP.0"; S.lanePage = "AMP"; S.tracks[TRK].v.AMP[0] = 5; S.tracks[TRK].slide = new Set(slide); lane("AMP.0", locks); p.renderLane(); p.sent.length = 0; };
	let commits = 0; const hc = M.HOST.commit; M.HOST.commit = () => { commits++; };

	/* the target: the parameter's next lock; step 4 has a trig and no lock, 3 has a ghost lock (no trig) */
	fresh({ 2: 90, 3: 20, 10: 30 });
	check(M.slideNext(TRK, "AMP.0", 2) === 3, "the slide of step 3 (index 2) goes to the parameter's next lock, the one on step 4 although it has no trig (measured, K)");
	check(M.slideNext(TRK, "AMP.0", 10) == null, "a parameter with no later lock has no target");

	/* a press on the dot (8 px) is a maybe-slide; elsewhere on the bar it is the lane's */
	fresh({ 2: 90, 10: 30 });
	check(!!M.slideGrab(at(25, yOf(90) + 7)) && M.laneNow()?.slide === "maybe", "a press within 8 px of the dot is a maybe-slide");
	M.laneSet(null);
	check(!M.slideGrab(at(25, yOf(90) + 12)) && !M.laneNow(), "12 px below the dot is the lane's own paint");
	check(!M.slideGrab(at(25, yOf(90), keys[2], { altKey: true })) && (M.slideGrab(at(25, yOf(90), keys[2], { shiftKey: true })), M.laneNow()?.slide == null && M.laneSet(null) == null) && !M.slideGrab(at(25, yOf(90), keys[2], { button: 2 })), "Alt (erase), Shift (ramp) and a right button never grab the dot");
	check(!M.slideGrab(at(25, yOf(90), keys[4])), "a step with no lock has no dot");

	/* drag sideways, far past the next lock: the preview runs to it only; the release sets the flag, one commit, no lock edit */
	commits = 0; M.slideGrab(at(25, yOf(90)));
	M.laneAt(at(27, yOf(90))); check(M.laneNow()?.slide === "maybe", "2 px sideways is still a click");
	M.laneAt(at(60, yOf(90) + 1)); check(M.laneNow()?.slide === "on" && M.laneNow().pv === 2 && /stroke-dasharray/.test(svgEl.innerHTML) && /L105 /.test(svgEl.innerHTML), "sideways: a dashed ramp preview from step 3 to step 11 (x 105), no flag yet");
	M.laneAt(at(600, yOf(90) + 3)); check(/L105 /.test(svgEl.innerHTML) && !S.tracks[TRK].slide.has(2), "dragged far past it, still the next lock only (x 105)");
	M.laneAt(at(5, yOf(90))); check(M.laneNow().pv == null, "dragged back left of the press: no preview");
	M.laneAt(at(80, yOf(90)));
	check(commits === 0 && !slides().length && !lockOps().length, "nothing is written while the drag runs");
	M.endLaneDraw(); p.run();
	check(slides().length === 1 && /"t":3,"s":2,"on":true/.test(slides()[0]) && S.tracks[TRK].slide.has(2) && !lockOps().length && commits === 1 && !M.laneNow(),
		"release: one slide intent on step index 2, no lock edit, one commit (one undo step): " + ops().join(" ").slice(0, 120));
	check(/M25 \S+ L105 /.test(svgEl.innerHTML) && !/stroke-dasharray/.test(svgEl.innerHTML), "the ramp is now drawn solid, lock to lock");

	/* no later lock: nothing is set */
	fresh({ 2: 90 }); commits = 0; M.slideGrab(at(25, yOf(90))); M.laneAt(at(80, yOf(90))); M.laneAt(at(200, yOf(90)));
	check(M.laneNow()?.pv == null, "no later lock: no preview"); M.endLaneDraw(); p.run();
	check(!slides().length && !S.tracks[TRK].slide.has(2), "and the release sets nothing");

	/* dragging left sets nothing */
	fresh({ 2: 90, 10: 30 }); M.slideGrab(at(25, yOf(90))); M.laneAt(at(5, yOf(90))); M.endLaneDraw(); p.run();
	check(!slides().length && !S.tracks[TRK].slide.has(2), "a drag to the left sets no slide");

	/* up and down from the dot: the lock's value, as today */
	fresh({ 2: 90, 10: 30 }); M.slideGrab(at(25, yOf(90))); M.laneAt(at(26, yOf(90) - 12)); M.laneAt(at(26, yOf(90) + 30)); M.endLaneDraw(); p.run();
	check(!slides().length && lockOps().length >= 1 && /"s":2/.test(lockOps()[lockOps().length - 1]) && !/"v":90\b/.test(lockOps()[lockOps().length - 1]), "a vertical drag changes the lock's value, no slide: " + ops().join(" ").slice(0, 100));

	/* a click on the dot is the lane's click: the lock goes to the value under the pointer */
	fresh({ 2: 90, 10: 30 }); M.slideGrab(at(25, yOf(90) + 5)); M.endLaneDraw(); p.run();
	check(!slides().length && lockOps().length === 1, "a click on the dot is a lane click (a lock, no slide): " + ops().join(" ").slice(0, 100));

	/* the ramp line: a click removes the flag; moving cancels without painting underlying locks */
	fresh({ 2: 90, 10: 30 }, [2]); const mid = { x: 65, y: (yOf(90) + yOf(30)) / 2 };
	check(!!M.slideGrab(at(mid.x, mid.y, keys[3])) && M.laneNow()?.cut === "maybe", "a press on the ramp's line is a maybe-cut");
	M.laneSet(null); check(!M.slideGrab(at(mid.x, mid.y + 12, keys[3])), "12 px off the line is the lane's");
	commits = 0; M.slideGrab(at(mid.x, mid.y, keys[3])); M.endLaneDraw(); p.run();
	check(slides().length === 1 && /"s":2,"on":false/.test(slides()[0]) && !S.tracks[TRK].slide.has(2) && commits === 1 && !lockOps().length, "a click on the line removes the slide: one intent, one commit: " + ops().join(" ").slice(0, 100));
	fresh({ 2: 90, 10: 30 }, [2]); M.slideGrab(at(mid.x, mid.y, keys[3])); M.laneAt(at(mid.x + 1, mid.y - 20, keys[3])); M.endLaneDraw(); p.run();
	check(S.tracks[TRK].slide.has(2) && !slides().length && !lockOps().length, "dragging the ramp line keeps the slide and never paints intervening locks");


	/* Shift on a lock bar: the rubber band. Out of the column sideways it follows the cursor, the parameter's next lock is the one
	   target; dropped on its column it sets the slide, anywhere else (or Esc, or left of the start) nothing is written */
	const sh = (x, y, el = keys[2]) => at(x, y, el, { shiftKey: true });
	fresh({ 2: 90, 10: 30 });
	check(!!M.slideGrab(sh(25, 100)) && M.laneNow()?.band === "maybe", "Shift on a lock bar (anywhere on it) is a maybe-band");
	M.laneSet(null); check(!M.slideGrab(sh(25, 100, keys[4])) && !M.laneNow(), "Shift on a step without a lock on this parameter is the lane's ramp (no grab)");
	check(!M.slideGrab(at(25, 100)) || M.laneNow()?.band !== "maybe", "without Shift a press low on the bar is not a band"); M.laneSet(null);
	fresh({ 2: 90, 10: 30 }); M.slideGrab(sh(25, 60)); M.laneAt(sh(26, 60)); check(M.laneNow()?.band === "maybe", "inside the column, without vertical movement, it waits");
	M.laneAt(sh(26, 100)); check(M.laneNow()?.band === "maybe" && !M.laneNow()?.ramp && !lockOps().length, "vertical jitter inside the start column never changes a slide gesture into lock painting"); M.endLaneDraw(); p.run(); check(!lockOps().length && !slides().length, "release inside the start column makes no edit");
	fresh({ 2: 90, 10: 30 }); commits = 0; M.slideGrab(sh(25, 70));
	M.laneAt(sh(33, 70)); check(M.laneNow()?.band === "on" && !!M.bandLive() && M.laneNow().nx === 10, "out of the column to the right: the band, target step index 10 (past the trig at 4 with no lock)");
	M.laneAt(sh(60, 50)); check(/M25 \S+ L60 50/.test(svgEl.innerHTML) && /r="9"/.test(svgEl.innerHTML) && !/stroke-dasharray/.test(svgEl.innerHTML), "a solid line to the cursor and a ring on the target");
	M.laneAt(sh(300, 20)); check(/L300 20/.test(svgEl.innerHTML), "the line follows the pointer freely, far past the target");
	check(commits === 0 && !slides().length && !lockOps().length, "nothing is written while it runs");
	M.laneAt(sh(105, 60)); M.endLaneDraw(); p.run();
	check(slides().length === 1 && /"t":3,"s":2,"on":true/.test(slides()[0]) && S.tracks[TRK].slide.has(2) && !lockOps().length && commits === 1 && !M.laneNow(), "dropped on the next lock: one slide intent, one commit: " + ops().join(" ").slice(0, 100));
	check(/M25 \S+ L105 /.test(svgEl.innerHTML) && !/r="9"/.test(svgEl.innerHTML), "the line snaps to the next lock as the normal ramp");
	for (const x of [45, 300, 99]) { fresh({ 2: 90, 10: 30 }); commits = 0; M.slideGrab(sh(25, 70)); M.laneAt(sh(33, 70)); M.laneAt(sh(x, 60)); M.endLaneDraw(); p.run();
		check(!slides().length && !lockOps().length && commits === 0 && !M.laneNow(), `dropped at x ${x}: cancelled, nothing written`); }
	fresh({ 2: 90, 10: 30 }); M.slideGrab(sh(25, 70)); M.laneAt(sh(33, 70)); M.laneAt(sh(105, 60)); M.bandEsc(); check(!M.bandLive(), "Esc: the band is gone"); M.endLaneDraw(); p.run();
	check(!slides().length, "Esc: nothing is set");
	fresh({ 2: 90, 10: 30 }); M.slideGrab(sh(25, 70)); M.laneAt(sh(33, 70)); M.laneAt(sh(105, 60)); M.laneAt(sh(5, 60)); check(!M.bandLive(), "left of the start: no band"); M.endLaneDraw(); p.run();
	check(!slides().length, "released left of the start: nothing set");
	fresh({ 2: 90 }); M.slideGrab(sh(25, 70)); M.laneAt(sh(33, 70)); M.laneAt(sh(105, 60));
	check(!!M.bandLive() && M.laneNow().nx == null && !/r="9"/.test(svgEl.innerHTML), "no later lock: the band follows, no target"); M.endLaneDraw(); p.run();
	check(!slides().length, "and the drop sets nothing");
	M.HOST.commit = hc; clearHooks(); S.tracks[TRK].slide = new Set();
}

/* 8. B-183: a menu press never paints; its explicit clear reaches ghost locks as well as notes. */
{
	const M = p.mockup;
	S.sel = TRK; S.lane = "AMP.2"; S.lanePage = "AMP"; S.tracks[TRK].steps[3] = null;
	lane("AMP.2", { 3: 90, 11: 50 }); p.sent.length = 0; M.laneSet(null);
	for (const mod of [{ button: 2 }, { button: 0, ctrlKey: true }, { button: 0, metaKey: true }]) {
		M.laneDown({ target: keyEl(3), clientX: 35, clientY: 30, pointerId: 1, preventDefault() { }, ...mod });
	}
	p.run();
	check(!p.sent.length && !M.laneNow() && S.locks.get(TRK + "|AMP.2").get(3) === 90, "right-click, Ctrl-click and Cmd-click never paint a lock");
	const menu = M.laneMenuItems(TRK, "AMP.2", 3), erase = menu.find(x => x.id === "lane-clear-lock");
	check(erase.enabled && !menu.find(x => x.id === "lane-slide").enabled, "a ghost lock has an enabled Clear command and no slide start");
	erase.run(); p.run();
	const clears = p.sent.filter(x => x.op === "lock" && x.v === null);
	check(clears.length === 1 && clears[0].s === 3 && clears[0].t === TRK && !S.locks.get(TRK + "|AMP.2")?.has(3) && S.locks.get(TRK + "|AMP.2")?.has(11), "menu erase sends one exact lock deletion and keeps the other ghost lock");
	check(S.tracks[TRK].steps[3] === null && !p.sent.some(x => x.op === "param" || x.op === "step"), "erasing a ghost lock creates no note and changes no kit value");
	check(!M.laneMenuItems(TRK, "AMP.2", 3).find(x => x.id === "lane-clear-lock").enabled, "an empty step cannot issue a second erase");
}

/* 9. B-179/B-180: explicit ON/OFF rhythm state, with the documented one-note mode rules unchanged. */
{
	const M = p.mockup, tr = S.tracks[TRK], saved = tr.arp;
	tr.arp = { ...saved, MODE: 1, SPD: 6, PLAY: 0, RNGE: 1, len: 2, ofs: [0, 0], rhy: [true, false] };
	const html = M.arpCells(tr.arp);
	check(/class="ac on"[^>]*aria-pressed="true"[^>]*data-ac="0"/.test(html) && /class="ac mute"[^>]*aria-pressed="false"[^>]*data-ac="1"/.test(html), "ARP keys expose the actual rhythm enable state");
	check(/class="arpstate">ON<\/span>/.test(html) && /class="arpstate">OFF<\/span>/.test(html), "ARP on/off is readable without relying on plate colours");
	const span = { s: 0, e: 4, n: [60] }, ticks = () => M.arpTicks(TRK, span);
	check(JSON.stringify(ticks().map(q => [q.x, q.n])) === "[[0,60],[2,60]]", "KEY repeats one held note, with disabled rhythm steps silent");
	tr.arp.MODE = 3; check(ticks().length === 2, "ADD also starts with one held note");
	tr.arp.MODE = 2; check(!ticks().length && /SID needs a chord/.test(M.dockHelp(TRK, "arp")[0]), "SID keeps its documented two-note rule and makes that requirement visible");
	tr.arp = saved;
}

/* 10. B-182: explain the glyph and pitch independently from selection or envelope flags. */
{
	const M = p.mockup, tr = S.tracks[TRK], original = tr.steps;
	tr.steps = Array(64).fill(null); tr.steps[0] = { n: [60], a: 1, f: 1, l: 1 };
	tr.steps[2] = { n: [64], a: 0, f: 0, l: 0 }; tr.steps[3] = { a: 1, f: 0, l: 0 }; tr.steps[4] = { off: 1 };
	const before = JSON.stringify(tr.steps);
	check(/Trigless trig \(hollow square\).*no envelopes; pitch/.test(M.rollStepTip(TRK, 2)), "a trigless trig can carry a pitch: the square does not mean pitchless");
	check(/Pitchless trig \(dashed bar\).*previous pitch.*fires AMP/.test(M.rollStepTip(TRK, 3)), "a pitchless trig inherits the earlier pitch and names its active envelope");
	check(/NOTE OFF/.test(M.rollStepTip(TRK, 4)) && /fires AMP, FILTER, LFO/.test(M.rollStepTip(TRK, 0)), "note-off and normal note descriptions remain distinct");
	check(JSON.stringify(tr.steps) === before, "descriptions never change the pattern");
	tr.steps = original;
}

console.log(failures ? `mmLockLaneTest: ${failures} failure(s)` : "mmLockLaneTest: PASS");
process.exit(failures ? 1 : 0);
