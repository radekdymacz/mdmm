"use strict";
/* The page's wiring that the model test cannot reach, checked on the page's own scripts (release review
   2026-10-04, code-js S1, S4, S6): they run here as mdDeskKeysTest.js runs them, on a stand-in DOM that answers
   everything and does nothing, with a stand-in Bridge (the commands the page sends are recorded, none is
   answered), timers run by hand and the window's listeners recorded.
   - S1 solo: the machine's own mutes survive a solo and its end; M (click, key, drag) during a solo edits only
     the user's mutes, which the end of the solo gives to the machine;
   - S4: a render held while a gesture ran is made when the gesture ends (paint, l2, chop, song alike; since 1.0 also
     a GEN or MUTATE value drag, the tempo drag, a wheel run, which ends by itself, and the rotate presses);
   - S6: Shift-prepared mutes are dropped when the window loses the focus.
   And, on the page with the real bridge (deskBridge.js) against a model of the plug-in's notice book (mdNoticeBook.h):
   a notice's key answers that notice, never another, the update banner's too (codex review 2026-10: the bridge's
   request id had replaced the notice's number since 0.3.0), and a refused answer is only logged; and against a model
   of the window's drop book (mdDroppedFiles.h), files dropped on the window: a sample with the Sampler closed or a RAM
   slot selected is said, never sent; into the selected ROM slot or the tile it was dropped on; several are asked about,
   then sent one at a time, each when the one before is in; a ROM is asked about, a .syx opens; a refusal is said.
   The Rosetta notice (mdRosettaNotice.h) has "Don't show again" first and OK last: closed another way it answers OK.
     node mdDeskPageTest.js */
const fs = require("fs"), path = require("path");
const FILES = [...fs.readFileSync(path.join(__dirname, "mdStudio.html"), "utf8").matchAll(/<script src="([\w.]+)"><\/script>/g)].map(m => m[1])
	.filter(f => !/SelfTest\.js$/.test(f) && f !== "deskBridge.js").map(f => f.startsWith("desk") ? "../shared/" + f : f);
let failures = 0;
const check = (ok, what) => { console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) failures++; };

/* ---- the stand-ins ---- */
const any = new Proxy(function () { }, {
	get: (t, k) => k === Symbol.toPrimitive ? () => 0 : k === Symbol.iterator ? function* () { } : k === "length" ? 0 : any,
	apply: () => any, construct: () => any, has: () => false, set: () => true });
const orAny = o => new Proxy(o, { get: (t, k) => k in t ? t[k] : any });
const real = { Math, JSON, Object, Array, String, Number, Boolean, Set, Map, WeakMap, WeakSet, Symbol, Promise, Date, RegExp, Error, TypeError, parseInt, parseFloat, isNaN, isFinite,
	Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array, Float32Array, Float64Array, DataView, ArrayBuffer, console, encodeURIComponent, decodeURIComponent,
	Infinity, NaN, undefined };
/* timers: run by hand (run()), never by the clock */
let timers = [];
const setTimeout = (f, ms) => { timers.push(f); return timers.length; }, clearTimeout = () => { };
function run() { for (let n = 0; n < 20 && timers.length; n++) { const t = timers; timers = []; t.forEach(f => { try { f(); } catch (e) { /* a stand-in DOM can throw in a draw: not what is checked */ } }); } }
/* the window's and the document's listeners */
const on = { window: {}, document: {} };
const listen = where => (type, f) => { (on[where][type] = on[where][type] || []).push(f); };
const fire = (where, type, e = {}) => (on[where][type] || []).forEach(f => f(e));
/* the elements a test puts behind a selector (the lane, a key); every other selector answers "any" */
const hooks = {};
const document = orAny({ addEventListener: listen("document"), activeElement: null, readyState: "complete", querySelector: q => hooks[q] || any, elementFromPoint: () => hooks.under || any });
/* the Bridge: records every command; answers none (so the optimistic writes stay, as while they are on their way) */
const sent = [], bridgeListeners = [];
let id = 0;
const Bridge = orAny({ send(msg) { sent.push(msg); return ++id; }, onMessage(f) { bridgeListeners.push(f); }, gesture: () => ++id, ready() { }, log() { } });
const scope = new Proxy({ setTimeout, clearTimeout, document, addEventListener: listen("window"), Bridge }, {
	has: () => true,
	get: (t, k) => k === Symbol.unscopables ? undefined : k in t ? t[k] : k in real ? real[k] : any,
	set: (t, k, v) => { t[k] = v; return true; } });
const src = FILES.map(f => fs.readFileSync(path.join(__dirname, f), "utf8").replace(/^"use strict";/, ""))
	.join("\n;\n").replace(/^render\(\);\s*$/m, "").replace(/^Bridge\.ready\(\);\s*$/m, "");
/* the page's names, reached from inside its scope; its drawing replaced by a count (the stand-in DOM draws nothing) */
const P = new Function("scope", "with (scope) {\n" + src + `
;let renders = 0;
render = () => { renders++; }; syncControls = () => { }; renderTop = () => { }; renderSub = () => { }; redraw = () => { }; refreshAudible = () => { };
return { overridesText, learnName, progressText, onLearnDoc, learnPaused, learnMax, toggleLearn, kitHit, kitGrab, kitAt, kitNudge, laneAt, slideGrab, slideNext, slideVal, bandLive, bandEsc, drawSlides, endLaneDraw, valueHTML, kitLabelHTML, kitHandleHTML, laneFmt, grp, Gesture, Boot, hostTempoRefused, l2step, onTelemetry, pauseNow, playsText, songLcd, S, Docs, Overlay, Held, PREP, scheduleRender, clickSteps, secAction, selStart, stepMenu, stepMenuItems, Modifiers, selCut, selDuplicate, clearSel, setSel, endSelect, interacting, genEnsure, genSpec, setGenSpec, clickTrackKeys, userMute, soloWrites, muteSel, msSet, prepToggle, unmuteAll, Keys,
	get V() { return V; }, setToast(f) { const was = toast; toast = f; return was; }, setV(v) { V = v; }, view, get renders() { return renders; }, get pending() { return pendingRender; } }; }`)(scope);

/* the machine document: its mutes (machine.desk.mutes) as the machine has them */
function machineMutes(list) { P.Docs.machine = Object.assign({}, P.Docs.machine || {}, { desk: { mutes: list } }); P.setV(P.view()); }
const muteCmds = () => sent.filter(m => m.op === "mute").map(m => (m.on ? "+" : "-") + (m.t + 1)).join(" ");
const click = (kind, i) => P.clickTrackKeys({ target: { closest: s => s === `[data-${kind}]` ? { dataset: { [kind]: String(i) } } : null } });
const shown = () => P.V.tracks.map((t, i) => t.mute ? i + 1 : 0).filter(Boolean).join(" ");

/* ---- S1 (a): a project opens with tracks 3 and 7 muted on the machine; solo 1, then un-solo ---- */
machineMutes([2, 6]);
check(shown() === "3 7", "the machine's mutes show on the M keys: " + shown());
sent.length = 0; click("solo", 0);
check(muteCmds() === "+2 +4 +5 +6 +8 +9 +10 +11 +12 +13 +14 +15 +16", "solo 1 mutes every other track not muted yet: " + muteCmds());
check(shown() === "3 7", "during the solo the M keys show the user's mutes (3 and 7): " + shown());
sent.length = 0; click("solo", 0);
check(muteCmds() === "-2 -4 -5 -6 -8 -9 -10 -11 -12 -13 -14 -15 -16", "un-solo gives back every track but 3 and 7, which stay muted: " + muteCmds());
check(shown() === "3 7", "after the solo the M keys show 3 and 7 muted: " + shown());

/* ---- S1 (b): M on a non-soloed track during a solo does not unmute it on the machine ---- */
P.Overlay.clear(); sent.length = 0; P.S.soloSet = new Set(); P.S.userMutes = new Set();
machineMutes([2, 6]);
click("solo", 0); sent.length = 0;
click("mute", 4);	/* M on track 5, muted by the solo */
check(muteCmds() === "", "M on track 5 during the solo sends nothing to the machine (it stays muted by the solo): " + (muteCmds() || "none"));
check(shown() === "3 5 7", "its M key shows it muted, as the user meant: " + shown());
click("mute", 2);	/* M on track 3: the user unmutes it while the solo holds */
check(muteCmds() === "" && shown() === "5 7", "M on track 3 during the solo: no command, the M keys show 5 and 7: " + shown());
sent.length = 0; click("solo", 0);
check(muteCmds() === "-2 -3 -4 -6 -8 -9 -10 -11 -12 -13 -14 -15 -16", "un-solo plays every track but 5 and 7 (3 unmuted, 5 muted by the user): " + muteCmds());
/* the M key and the M/S drag go the same way */
sent.length = 0; click("solo", 1); sent.length = 0;
P.muteSel();	/* the selected track is 1 */
P.msSet({ group: "mute", i: 8 }, true);
check(muteCmds() === "", "the M key and the M/S drag during a solo send nothing: " + (muteCmds() || "none"));
check(P.S.userMutes.has(0) && P.S.userMutes.has(8), "they edit the user's mutes (1 and 9)");
sent.length = 0; P.msSet({ group: "solo", i: 1 }, false);	/* the drag lets the solo go */
check(muteCmds() === "-3 -4 -6 -8 -10 -11 -12 -13 -14 -15 -16", "the drag's un-solo leaves 1, 5, 7 and 9 muted (1 and 9 by the user during the solo): " + muteCmds());

/* ---- S1 (c): with no solo, M is the machine's mute at once ---- */
sent.length = 0; click("mute", 11);
check(muteCmds() === "+12", "with no solo, M mutes on the machine: " + muteCmds());

/* ---- S6: Shift-prepared mutes do not survive leaving the window ---- */
P.prepToggle(1); P.prepToggle(4);
check(P.PREP.size === 2, "Shift-click prepares two mutes");
fire("window", "blur");
check(P.PREP.size === 0, "the window's blur drops them (the Shift keyup never comes)");
sent.length = 0; fire("document", "keyup", { key: "Shift" });
check(muteCmds() === "", "a later Shift keyup applies nothing: " + (muteCmds() || "none"));

/* ---- S4: a render held during a gesture is made when it ends ---- */
for (const kind of ["paint", "l2", "chop", "song", "lane", "value", "mutePaint", "gv", "bpm", "wheel", "rotate"]) {
	run();
	const before = P.renders;
	P.Held.begin(kind, {});
	P.scheduleRender(); run();
	const held = P.pending && P.renders === before;
	P.Held.end(kind); run();
	check(held && !P.pending && P.renders === before + 1, `${kind}: the render waits while it is held, and is made when it ends`);
}
/* the GEN value and tempo drags never stick (they hold renders): a cancelled pointer, leaving the window or a move with
   no button down ends them, and the render they held is made */
for (const [kind, where, type, e] of [["gv", "document", "pointercancel", {}], ["gv", "window", "blur", {}], ["gv", "document", "pointermove", { buttons: 0, pointerType: "mouse" }],
	["bpm", "document", "pointercancel", {}], ["bpm", "window", "blur", {}], ["bpm", "document", "pointermove", { buttons: 0, pointerType: "mouse" }]]) {
	run();
	const before = P.renders;
	P.Held.begin(kind, { k: "k", y: 0, acc: 0, v: 120 });
	P.scheduleRender(); run();
	const held = P.pending && P.renders === before;
	fire(where, type, e); run();
	check(held && !P.Held.now && !P.pending && P.renders === before + 1, `${kind}: ${type}${type === "pointermove" ? " with no button" : ""} ends it and makes the held render`);
}
/* a gesture with no render held meanwhile ends without a render of its own */
run(); { const before = P.renders; P.Held.begin("gv", {}); P.Held.end("gv"); run(); check(P.renders === before, "a gesture with nothing held renders nothing when it ends"); }

/* ---- a rotate run (Alt + arrows, one undo step) ends when an event shows Alt up, not only on Alt's own keyup ---- */
{
	fire("window", "keydown", { altKey: true, key: "ArrowRight" });
	P.Held.begin("rotate", { g: 99 });
	fire("window", "keyup", { altKey: true, key: "ArrowRight" });
	const kept = !!P.Held.as("rotate");
	fire("document", "pointermove", { altKey: false });
	check(kept && !P.Held.as("rotate"), "a rotate run lasts while Alt is down and ends at the first event without Alt");
}

/* ---- a solo leaves a RAM recorder alone: its mute is the sampler's capture and freeze ---- */
{
	const HEX62 = "0".repeat(62);
	const tr = m => ({ machine: m, model: 0, level: 100, synth: Array(8).fill(0), effects: Array(8).fill(0), routing: Array(8).fill(0),
		lfo: { track: 0, param: 0, shape1: 0, shape2: 0, update: 0 }, muteGroup: null, trigGroup: null });
	P.Docs.kits[0] = { schema: "md-desk/kit", version: 2, slot: 0, name: "K", tracks: Array.from({ length: 16 }, (_, i) => tr(i === 9 ? "RAM-R1" : "GND-EMPTY")),
		masterFx: { rhythmEcho: Array(8).fill(0), gateBox: Array(8).fill(0), eq: Array(8).fill(0), dynamix: Array(8).fill(0) },
		firmware: { format: { version: 2, revision: 0 }, lfoState: Array(16).fill(HEX62) } };
	P.Overlay.clear(); P.S.soloSet = new Set(); P.S.userMutes = new Set();
	machineMutes([]);	/* the recorder plays: a capture records */
	sent.length = 0; click("solo", 0);
	check(!/[+-]10\b/.test(muteCmds()), "solo 1 does not mute the recording RAM recorder on track 10: " + muteCmds());
	P.userMute(9, true);	/* the capture's end freezes it during the solo */
	check(/\+10\b/.test(muteCmds()), "the capture's freeze during a solo goes to the machine at once");
	machineMutes([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);	/* the machine now: every track but 1 muted */
	sent.length = 0; click("solo", 0);
	check(!/-10\b/.test(muteCmds()), "un-solo does not unfreeze the take on track 10: " + muteCmds());
	check(P.soloWrites({ soloSet: new Set([0]), userMutes: new Set() }, Array(16).fill(false), new Set([9])).every(([i]) => i !== 9), "soloWrites leaves the kept tracks out");
	delete P.Docs.kits[0];
}

/* ---- GEN: the specs made before the kit came (every track GND-EMPTY: Keep) follow the machines once they come;
   a spec the person changed stays ---- */
{
	const HEX62 = "0".repeat(62);
	const tr = m => ({ machine: m, model: 0, level: 100, synth: Array(8).fill(0), effects: Array(8).fill(0), routing: Array(8).fill(0),
		lfo: { track: 0, param: 0, shape1: 0, shape2: 0, update: 0 }, muteGroup: null, trigGroup: null });
	const kit = ms => ({ schema: "md-desk/kit", version: 2, slot: 0, name: "K", tracks: Array.from({ length: 16 }, (_, i) => tr(ms[i] || "GND-EMPTY")),
		masterFx: { rhythmEcho: Array(8).fill(0), gateBox: Array(8).fill(0), eq: Array(8).fill(0), dynamix: Array(8).fill(0) },
		firmware: { format: { version: 2, revision: 0 }, lfoState: Array(16).fill(HEX62) } });
	P.S.gen = { specs: null, last: [], m: [], edited: [], run: null };
	P.setV(P.view()); P.genEnsure();
	check(P.genSpec(0).kind === "keep", "before the kit, track 1's spec is Keep (GND-EMPTY)");
	P.Docs.kits[0] = kit(["TRX-BD", "TRX-SD"]); P.setV(P.view());
	check(P.V.tracks[0].m === "TRX-BD", "the kit came: track 1 is " + P.V.tracks[0].m);
	check(P.genSpec(0).kind === "euclid", "reading the specs already follows the machine: " + P.genSpec(0).kind);
	P.genEnsure();
	check(P.genSpec(0).kind === "euclid" && P.genSpec(0).k === 4 && P.genSpec(1).kind === "euclid" && P.genSpec(1).k === 2, "the render's genEnsure makes the kick's and the snare's defaults: " + JSON.stringify([P.genSpec(0), P.genSpec(1)]));
	P.setGenSpec(1, { kind: "keep" });
	P.Docs.kits[0] = kit(["TRX-BD", "EFM-SD"]); P.setV(P.view()); P.genEnsure();
	check(P.genSpec(1).kind === "keep", "a spec the person set stays when the machine changes");
	P.Docs.kits[0] = kit(["TRX-CH", "EFM-SD"]); P.setV(P.view()); P.genEnsure();
	check(P.genSpec(0).kind === "euclid" && P.genSpec(0).k === 8, "an untouched spec follows a new machine (a hat): " + JSON.stringify(P.genSpec(0)));
	delete P.Docs.kits[0]; P.setV(P.view());
}

/* ---- a selection of steps (DESIGN-step-selection.md): ⌥-click, ⌥-drag, ⌘C ⌘V ⌘X ⌘D Delete, the dropped copy; the
   step clicks that were there before are as they were ---- */
{
	const HEX62 = "0".repeat(62);
	const tr = m => ({ machine: m, model: 0, level: 100, synth: Array(8).fill(0), effects: Array(8).fill(0), routing: Array(8).fill(0),
		lfo: { track: 0, param: 0, shape1: 0, shape2: 0, update: 0 }, muteGroup: null, trigGroup: null });
	P.Docs.kits[3] = { schema: "md-desk/kit", version: 2, slot: 3, name: "K", tracks: Array.from({ length: 16 }, () => tr("GND-EMPTY")),
		masterFx: { rhythmEcho: Array(8).fill(0), gateBox: Array(8).fill(0), eq: Array(8).fill(0), dynamix: Array(8).fill(0) },
		firmware: { format: { version: 2, revision: 0 }, lfoState: Array(16).fill(HEX62) } };
	P.Docs.patterns[5] = { schema: "md-desk/pattern", version: 2, slot: 5, kit: 3, length: 16, totalLength: 16, tempoMultiplier: "1X", swingAmount: 0, accentAmount: 0,
		accent: { editAll: 0, steps: [] }, slide: { editAll: 0, steps: [] }, swing: { editAll: 0, steps: [] },
		tracks: Array.from({ length: 16 }, (_, i) => ({ trigs: i === 0 ? [0, 1, 4] : i === 1 ? [1] : [], accent: [], slide: [], swing: [] })),
		locks: [{ track: 0, param: 0, steps: [[1, 99]] }], firmware: { format: { version: 2, revision: 0 }, lockedRowsField: 0 } };
	const machine = clip => Object.assign({}, P.Docs.machine || {}, { pattern: { current: 5 }, kit: { current: 3 }, desk: {},
		clipboard: Object.assign({ steps: false, sound: false, songRow: false, kit: null, pattern: null, stepsSize: null }, clip) });
	P.Docs.machine = machine({}); P.Overlay.clear(); P.S.multi = new Set(); P.S.sel = 0; P.S.ws = "seq"; P.setV(P.view());
	check(P.V.loaded && P.V.tracks[0].trigs[1], "a loaded pattern: track 1 has a trig on step 2");
	const stepEv = (t, s, mods = {}) => Object.assign({ detail: 1, target: { closest: q => q === "#seq .st" ? { dataset: { t: String(t), s: String(s) } } : null } }, mods);
	const last = () => sent[sent.length - 1] || {};
	const args = m => { const { op, g, ...rest } = m; return op + " " + JSON.stringify(rest); };

	/* K2 (DESIGN-keymap.md): which presses start the select gesture: ⌘ on a step (metaKey on a Mac, Ctrl elsewhere),
	   ⌘⇧ extends, the ruler plain or ⇧; never ⌥, never a Mac's Ctrl (its right-click) */
	const ev = (m = {}) => Object.assign({ metaKey: false, ctrlKey: false, altKey: false, shiftKey: false }, m);
	P.Modifiers.setPlatform(true);
	P.clearSel();
	check(!!P.selStart(ev({ metaKey: true }), { t: 0, s: 1 }, false), "Mac: ⌘-press on a step starts a selection");
	check(!P.selStart(ev({ ctrlKey: true }), { t: 0, s: 1 }, false), "Mac: Ctrl-press on a step does not select (it is the right-click)");
	check(!P.selStart(ev({ altKey: true }), { t: 0, s: 1 }, false), "⌥-press on a step selects nothing now");
	check(!P.selStart(ev(), { t: 0, s: 1 }, false), "a plain press on a step is the paint's, not a selection");
	check(!!P.selStart(ev(), { s: 3 }, true) && !P.selStart(ev({ metaKey: true }), { s: 3 }, true), "the ruler: a plain press selects, ⌘ does not");
	P.Modifiers.setPlatform(false);
	check(!!P.selStart(ev({ ctrlKey: true }), { t: 0, s: 1 }, false) && !P.selStart(ev({ metaKey: true }), { t: 0, s: 1 }, false), "Windows / Linux: Ctrl-press selects, the Windows key does not");
	P.Modifiers.setPlatform(true);
	P.setSel({ t: 0, n: 1, from: 2, to: 3 });
	const ext = P.selStart(ev({ metaKey: true, shiftKey: true }), { t: 2, s: 6 }, false);
	check(ext && ext.extend && !ext.drop, "⌘⇧-press with a selection extends it");
	P.Held.begin("select", ext); P.endSelect();
	check(JSON.stringify(P.S.stepSel) === '{"t":0,"n":3,"from":2,"to":7}', "⌘⇧-click extends the selection to the step, tracks and steps: " + JSON.stringify(P.S.stepSel));
	P.setSel({ t: 0, n: 2, from: 0, to: 4 });
	check(P.selStart(ev({ metaKey: true }), { t: 1, s: 2 }, false).drop, "⌘-press inside a selection of more than one step is a drop");
	P.clearSel();
	/* ⌘-click a step: the pointer's gesture selects it (no other cell crossed); its click sends nothing */
	sent.length = 0;
	P.Held.begin("select", { from: { t: 0, s: 1 }, at: { t: 0, s: 1 }, ruler: false, extend: false, drop: false, moved: false });
	check(P.interacting(), "the select gesture holds the page's renders while it runs");
	P.endSelect(); P.clickSteps(stepEv(0, 1, { metaKey: true }));
	check(JSON.stringify(P.S.stepSel) === '{"t":0,"n":1,"from":1,"to":2}' && !sent.some(m => m.op === "slide" || m.op === "trig" || m.op === "steps"), "⌘-click selects the one step and sends no edit (no fill): " + JSON.stringify(P.S.stepSel));
	P.clickSteps(stepEv(1, 1, { metaKey: true, detail: 0 }));
	check(P.S.stepSel.t === 1 && P.S.stepSel.from === 1, "⌘ and the keyboard's click on a step select it too");
	sent.length = 0; P.clickSteps(stepEv(2, 0, { ctrlKey: true }));
	check(!sent.length && P.S.stepSel.t === 1, "Mac: a Ctrl-click on a step neither fills nor selects (the step menu opens on its contextmenu)");
	sent.length = 0; P.clickSteps(stepEv(2, 0, { altKey: true }));
	check(!sent.length && P.S.stepSel.t === 1, "⌥-click on a step: no edit, no selection (a hint says select is ⌘-click)");
	/* the main case: one step copied, another step picked, pasted there */
	P.setSel({ t: 0, n: 1, from: 1, to: 2 }); sent.length = 0;
	P.secAction("copy");
	check(args(last()) === 'copySteps {"p":5,"t":0,"n":1,"from":1,"to":2}', "⌘C copies the selected step: " + args(last()));
	P.Docs.machine = machine({ steps: true, stepsSize: { tracks: 1, length: 1 } }); P.setV(P.view());
	P.setSel({ t: 0, n: 1, from: 8, to: 9 }); sent.length = 0;
	P.secAction("paste");
	check(args(last()) === 'pasteSteps {"p":5,"t":0,"from":8}', "⌘V pastes at the selected step: " + args(last()));
	check(P.V.tracks[0].trigs[8] && [...P.V.locks.values()].some(m => m.get(8) === 99), "the paste shows at once: the trig and its lock on step 9");
	/* a block: ⌥-drag from track 1 step 1 to track 2 step 4 */
	P.Held.begin("select", { from: { t: 0, s: 0 }, at: { t: 1, s: 3 }, ruler: false, extend: false, drop: false, moved: true });
	P.endSelect();
	check(JSON.stringify(P.S.stepSel) === '{"t":0,"n":2,"from":0,"to":4}', "⌥-drag selects steps × tracks: " + JSON.stringify(P.S.stepSel));
	sent.length = 0; P.secAction("copy");
	check(args(last()) === 'copySteps {"p":5,"t":0,"n":2,"from":0,"to":4}', "⌘C copies the block: " + args(last()));
	sent.length = 0; P.selCut();
	check(sent.map(m => m.op).join() === "copySteps,clearSteps" && sent[0].g && sent[0].g === sent[1].g, "⌘X: a copy and a clear under one gesture (one undo step)");
	check(!P.V.tracks[0].trigs[0] && !P.V.tracks[1].trigs[1], "the cut shows at once");
	P.Overlay.clear(); P.setV(P.view());
	sent.length = 0; P.selDuplicate();
	check(args(last()) === 'copyStepsTo {"p":5,"t":0,"n":2,"from":0,"to":4,"at":4,"dt":0}' && P.S.stepSel.from === 4 && P.S.stepSel.to === 8,
		"⌘D duplicates the block right after itself and selects the copy: " + args(last()));
	sent.length = 0; P.secAction("clear");
	check(args(last()) === 'clearSteps {"p":5,"t":0,"n":2,"from":4,"to":8}', "Delete clears the selected block: " + args(last()));
	/* ⌥-drag of the selection: a copy where it lets go */
	P.Overlay.clear(); P.setSel({ t: 0, n: 2, from: 0, to: 4 }); P.setV(P.view()); sent.length = 0;
	P.Held.begin("select", { from: { t: 0, s: 1 }, at: { t: 2, s: 6 }, ruler: false, extend: false, drop: true, moved: true });
	P.endSelect();
	check(args(last()) === 'copyStepsTo {"p":5,"t":0,"n":2,"from":0,"to":4,"at":5,"dt":2}' && P.S.stepSel.t === 2 && P.S.stepSel.from === 5,
		"⌥-dragging the selection drops a copy where it lets go: " + args(last()));
	/* the ruler: ⇧-click extends */
	P.setSel({ t: 0, n: 1, from: 2, to: 3 });
	P.Held.begin("select", { from: { t: 0, s: 9 }, at: { t: 0, s: 9 }, ruler: true, extend: true, drop: false, moved: false }); P.endSelect();
	check(JSON.stringify(P.S.stepSel) === '{"t":0,"n":1,"from":2,"to":10}', "⇧-click in the ruler extends the selection: " + JSON.stringify(P.S.stepSel));
	/* Esc clears it; without one, ⌘C is the page of the selected track as before */
	P.clearSel(); sent.length = 0; P.secAction("copy");
	check(!P.S.stepSel && args(last()) === 'copySteps {"p":5,"t":0,"from":0,"to":16}', "no selection: ⌘C copies the track's page as before: " + args(last()));
	/* the step clicks that were there: ⇧-click accent, ⌥⇧-click slide, ⌘-click fill */
	P.Overlay.clear(); P.setV(P.view()); sent.length = 0;
	P.clickSteps(stepEv(0, 4, { shiftKey: true }));
	check(last().op === "accent" && last().s === 4, "⇧-click on a trig is still an accent");
	P.clickSteps(stepEv(0, 4, { shiftKey: true, altKey: true }));
	check(last().op === "slide" && last().s === 4, "⌥⇧-click on a trig is the slide");
	sent.length = 0; P.clickSteps(stepEv(2, 0, { metaKey: true }));
	check(!sent.length, "⌘-click is no fill any more (the step menu has it)");
	P.clearSel();
	/* K2 keys: Delete with nothing selected does nothing (D3); ⌘A; ← → move, ⇧→ extends; Enter: the trigs */
	const key = (id, e = {}) => P.Keys.byId(id).run(Object.assign({ key: "", code: "" }, e));
	P.Overlay.clear(); P.setV(P.view()); P.clearSel(); sent.length = 0;
	key("delete");
	check(!sent.length, "Delete with no selection sends nothing (the page shown is Clr's)");
	sent.length = 0; P.secAction("clear");
	check(args(last()) === 'clearSteps {"p":5,"t":0,"from":0,"to":16}', "Clr (the LCD's) with no selection still clears the page shown: " + args(last()));
	P.Overlay.clear(); P.setV(P.view());
	key("select-all");
	check(JSON.stringify(P.S.stepSel) === '{"t":0,"n":16,"from":0,"to":16}', "⌘A selects every step of every track: " + JSON.stringify(P.S.stepSel));
	P.setSel({ t: 0, n: 1, from: 4, to: 5 });
	key("sel-move", { key: "ArrowRight" });
	check(P.S.stepSel.from === 5 && P.S.stepSel.to === 6, "→ moves the selection a step");
	key("sel-extend", { key: "ArrowRight" });
	check(P.S.stepSel.from === 5 && P.S.stepSel.to === 7, "⇧→ extends it a step");
	sent.length = 0; key("sel-trigs");
	check(last().op === "steps" && JSON.stringify(last().rows) === '[{"t":0,"on":[5,6]}]' && P.V.tracks[0].trigs[5] && P.V.tracks[0].trigs[6], "Enter: the selected steps' trigs on, at once: " + args(last()));
	/* the LCD's COPY CLR PASTE act on the selection (secAction); Delete too, with one */
	P.setSel({ t: 0, n: 1, from: 0, to: 2 }); sent.length = 0; key("delete");
	check(args(last()) === 'clearSteps {"p":5,"t":0,"n":1,"from":0,"to":2}', "Delete with a selection clears it: " + args(last()));
	/* K3: the step menu: each item sends what its key sends */
	P.Overlay.clear(); P.setV(P.view()); P.clearSel();
	P.stepMenu(0, 4, 100, 100);
	check(JSON.stringify(P.S.stepSel) === '{"t":0,"n":1,"from":4,"to":5}', "right-click a step outside the selection: that step is selected first");
	const items = P.stepMenuItems(0, 4).filter(i => i !== "-"), item = id => items.find(i => i.id === id);
	check(["sel-trigs", "step-accent", "step-slide", "copy", "cut", "paste", "duplicate", "delete", "step-fill-2", "step-fill-4"].every(id => item(id)), "the menu has trig, accent, slide, copy, cut, paste, duplicate, clear, fill 2nd / 4th: " + items.map(i => i.id).join(" "));
	check(item("copy").key === "⌘C" && item("step-accent").key === "⇧-click" && item("delete").key === "Delete / ⌫", "each item shows its key: " + items.map(i => i.key).join(" | "));
	const via = f => { sent.length = 0; f(); return sent.map(args).join(" | "); };
	check(via(() => item("copy").run()) === via(() => P.secAction("copy")), "Copy in the menu sends what ⌘C sends: " + via(() => item("copy").run()));
	P.Overlay.clear(); P.setV(P.view());
	const accMenu = via(() => item("step-accent").run());
	check(/^accent \{"p":5,"t":0,"s":4,"on":true\}$/.test(accMenu), "Accent in the menu: the step's accent on: " + accMenu);
	P.Overlay.clear(); P.setV(P.view());
	check(via(() => item("step-fill-2").run()).startsWith("steps "), "Fill every 2nd in the menu: one steps edit");
	P.Overlay.clear(); P.setV(P.view()); P.setSel({ t: 0, n: 1, from: 4, to: 5 });
	check(via(() => item("delete").run()) === 'clearSteps {"p":5,"t":0,"n":1,"from":4,"to":5}', "Clear in the menu clears the selection");
	P.Overlay.clear(); P.setV(P.view());
	P.setSel({ t: 0, n: 2, from: 0, to: 2 }); P.stepMenu(1, 1, 0, 0);
	check(JSON.stringify(P.S.stepSel) === '{"t":0,"n":2,"from":0,"to":2}', "right-click inside the selection keeps it (the menu acts on all of it)");
	P.clearSel(); P.Overlay.clear(); P.setV(P.view());
	/* B-006: LEN, SPD and SONG on LCD line 2 follow a vertical drag (12 px a step, from where the press found them,
	   no wrap), ⌥ at the press drags the inner length; one gesture; the drag's click does not step them again */
	P.Overlay.clear(); P.setV(P.view()); sent.length = 0;
	const l2 = k => ({ button: 0, clientY: 300, altKey: false, preventDefault() { }, target: { closest: q => q === ".l2.ed" ? { dataset: { l2: k } } : null } });
	fire("document", "pointerdown", l2("len"));
	fire("document", "pointermove", { buttons: 1, pointerType: "mouse", clientY: 300 - 25 });
	fire("document", "pointerup", {});
	const total = sent.filter(m => m.op === "totalLength");
	check(total.length === 1 && total[0].v === 48 && total[0].g, "dragging LEN up 25 px steps the total length twice, 16 to 48, in one gesture: " + JSON.stringify(total));
	sent.length = 0;
	fire("document", "pointerdown", Object.assign(l2("len"), { altKey: true }));
	fire("document", "pointermove", { buttons: 1, pointerType: "mouse", clientY: 300 + 40 });
	fire("document", "pointerup", {});
	check(sent.some(m => m.op === "length" && m.v === 13) && !sent.some(m => m.op === "totalLength"), "⌥-drag on LEN moves the inner length (16 down 3 to 13): " + JSON.stringify(sent.map(m => [m.op, m.v])));
	sent.length = 0;
	fire("document", "pointerdown", l2("song"));
	fire("document", "pointermove", { buttons: 1, pointerType: "mouse", clientY: 300 - 1000 });
	fire("document", "pointermove", { buttons: 1, pointerType: "mouse", clientY: 300 - 1012 });
	fire("document", "pointerup", {});
	check(sent.filter(m => m.op === "selectSong").map(m => m.s).join() === "31", "dragging SONG far up stops at song 32 (no wrap), sent once: " + JSON.stringify(sent.map(m => [m.op, m.s])));
	/* 0.3.5: the FN latch is gone (⌥, ⇧ and ⌘ are the modifiers); R and ⌥R still split track and all */
	{
		const keyEv = (key, code, altKey = false) => ({ key, code, altKey, metaKey: false, ctrlKey: false, shiftKey: false, repeat: false, target: { closest: () => null }, preventDefault() { }, stopPropagation() { }, stopImmediatePropagation() { } });
		const press = e => { fire("window", "keydown", e); fire("document", "keydown", e); };
		const ran = [], all = P.Keys.byId("randomise-all"), one = P.Keys.byId("randomise-track"), runs = [all.run, one.run];
		all.run = () => ran.push("all"); one.run = () => ran.push("track");
		P.S.ws = "seq"; P.Overlay.clear(); P.setV(P.view()); run();
		press(keyEv("r", "KeyR"));
		check(ran.join() === "track", "R randomises the selected track");
		ran.length = 0; press(keyEv("r", "KeyR", true));
		check(ran.join() === "all", "⌥R randomises every track");
		all.run = runs[0]; one.run = runs[1];
		check(P.Modifiers.fn === undefined && typeof P.Modifiers.setFn === "undefined", "no FN latch any more");
	}
	/* B-070: a trig removed takes its accent, slide and swing with it in the optimistic write (the core clears all
	   three); its swing mark used to flash back until the core's result came. Also a cut: the block's swings go. */
	{
		P.Docs.patterns[5].tracks[3] = { trigs: [2, 5], accent: [2], slide: [2], swing: [2, 5] };
		P.Docs.machine = machine({}); P.Overlay.clear(); P.S.tt = "trig"; P.S.sel = 3; P.setV(P.view()); sent.length = 0;
		check(P.V.tracks[3].swing.has(2) && P.V.tracks[3].acc.has(2) && P.V.tracks[3].slide.has(2), "B-070: track 4 step 3 has a trig with swing, accent and slide");
		P.clickSteps(stepEv(3, 2, { detail: 0 }));
		const t4 = P.V.tracks[3];
		check(last().op === "trig" && last().on === false, "B-070: the click removes the trig: " + args(last()));
		check(!t4.trigs[2] && !t4.swing.has(2) && !t4.acc.has(2) && !t4.slide.has(2), "B-070: at once (before the core's answer) the step shows no swing, accent or slide");
		check(t4.swing.has(5), "B-070: the swing on another step stays");
		P.setSel({ t: 3, n: 1, from: 4, to: 6 }); sent.length = 0; P.selCut();
		check(!P.V.tracks[3].trigs[5] && !P.V.tracks[3].swing.has(5), "B-070: a cut takes the swing of its steps too, at once");
		P.clearSel(); P.Overlay.clear(); P.Docs.patterns[5].tracks[3] = { trigs: [], accent: [], slide: [], swing: [] }; P.setV(P.view());
	}
	delete P.Docs.patterns[5]; delete P.Docs.kits[3]; P.Overlay.clear(); P.setV(P.view());
}

/* ---- a reset (another engine, a restored project) starts the solos over ---- */
P.S.soloSet = new Set([2]); P.S.userMutes = new Set([4]);
bridgeListeners.forEach(f => { try { f({ type: "reset" }); } catch (_) { } });
check(P.S.soloSet.size === 0 && P.S.userMutes.size === 0, "a reset clears the page's solos and its record of the user's mutes");

/* ---- B-030: TEMPO while the DAW sets it: an edit is refused (drag, arrows and tap go through hostTempoRefused) ---- */
P.setV(Object.assign({}, P.V, { hostTempo: true, bpm: 72 }));
sent.length = 0;
check(P.hostTempoRefused() === true && !sent.some(m => m.op === "tempo"), "the DAW's tempo: a tempo edit is refused, nothing is sent");
P.setV(Object.assign({}, P.V, { hostTempo: false }));
check(P.hostTempoRefused() === false, "the machine's own tempo: edits go through");
/* ---- 0.3.5: LCD line 2's PLAY field switches the mode; the What plays line says the song row the machine plays ---- */
P.setV(Object.assign({}, P.V, { songMode: false }));
sent.length = 0; P.l2step("seqmode", 1);
check(sent.some(m => m.op === "seqMode" && m.song === true), "PLAY PAT clicked: seqMode song (what is lit stays the machine's report)");
P.Docs.machine = Object.assign({}, P.Docs.machine || {}, { songMode: true, song: { current: 0 }, desk: {} });
P.Docs.telemetry = { type: "telemetry", step: 3, pattern: 17, playing: true, recording: false, valid: true, songRow: 1 };
P.setV(Object.assign({}, P.V, { songMode: true, playing: true, songSlot: 0, song: [{ pat: 0, rep: 1 }, { pat: 17, rep: 2 }, { type: "end" }] }));
check(P.playsText() === "SONG 01 · row 002 of 2 · B02", "the What plays line: " + P.playsText());
P.Docs.telemetry = Object.assign({}, P.Docs.telemetry, { playing: false });
P.setV(Object.assign({}, P.V, { playing: false }));
check(P.playsText() === "SONG 01 · 2 rows · stopped", "stopped: no row is said (" + P.playsText() + ")");

/* ---- B-086: a frame the machine sent while it still played, before the pause reached it, keeps the pause ---- */
{
	const frame = (step, playing) => P.onTelemetry({ type: "telemetry", step, pattern: 0, playing, recording: false, valid: true, songRow: -1 });
	frame(4, true); P.S.paused = null;
	sent.length = 0; P.pauseNow();
	check(!!P.S.paused && sent.some(m => m.op === "pause"), "B-086: ⇧-click ▶ while playing: paused, the pause sent");
	frame(5, true);
	check(!!P.S.paused, "B-086: a late frame (still playing) keeps the pause");
	frame(-1, false);
	check(!!P.S.paused && P.S.paused.step === 5, "B-086: the machine stops: paused on the step it held (the late frame's, not the click's)");
	frame(4, true);
	check(P.S.paused === null, "B-086: the machine plays again (PLAY, or its own panel): the pause is over");
	/* a pause the machine never took: still playing a second after it was sent, the pause is dropped */
	sent.length = 0; P.pauseNow();
	frame(5, true);
	check(!!P.S.paused, "B-086: within a second of the pause, frames that still play keep it");
	P.S.paused.at -= 1500; frame(6, true);
	check(P.S.paused === null, "B-086: still playing 1.5 s after the pause was sent: the pause is dropped, the machine plays on");
	frame(-1, false);
}

/* ---- B-035: the start-up card's word about the audio ---- */
check(/not running audio/.test(P.Boot.audioWord({ plugin: true, seconds: 6, blocks: 0, realtime: null })), "a plug-in with no audio block after 5 s: the host is not running its audio");
check(P.Boot.audioWord({ plugin: true, seconds: 3, blocks: 0, realtime: null }) === "" && P.Boot.audioWord({ plugin: false, seconds: 9, blocks: 0, realtime: null }) === "",
	"not before 5 s, and not in the app");
check(P.Boot.audioWord({ plugin: true, seconds: 9, blocks: 900, realtime: 0.6 }) === "The machine runs at 0.6× real time: try a larger buffer.", "slower than real time: says how slow");
check(P.Boot.audioWord({ plugin: true, seconds: 9, blocks: 900, realtime: 1.0 }) === "", "in real time: nothing to say");

/* ---- the plug-in's notices over the real bridge (codex review 2026-10): the page's own scripts, deskBridge.js
   included, against a model of the plug-in's notice book (mdNoticeBook.h: a notice answers once, by its number, with
   one of its buttons; anything else is refused and runs nothing) ---- */
{
	const files = [...fs.readFileSync(path.join(__dirname, "mdStudio.html"), "utf8")
		.matchAll(/<script src="([\w.]+)"><\/script>/g)].map(m => m[1])
		.filter(f => !/SelfTest\.js$|Journeys?\.js$|deskJourney\.js$/.test(f))
		.map(f => f.startsWith("desk") ? "../shared/" + f : f);
	check(files.includes("../shared/deskBridge.js") && files.includes("../shared/deskModal.js"),
		"this page runs the real bridge and modal layer");
	const native = (() => {
		let last = 0; const waiting = new Map(), toPage = [], ran = [], answers = [];
		return {
			notice(title, buttons, modal, text) {
				const id = ++last;
				waiting.set(id, { buttons: Math.max(1, buttons.length), title });
				toPage.push(Object.assign({ type: "notice", id, title, text: text || "", buttons },
					modal === false ? { modal } : {}));
				return id;
			},
			onPageMessage(m) {
				if (this.onDrop && /^drop(Rom|Syx|Sample)$/.test(m.op)) { this.onDrop(m); return; }
				if (m.op !== "noticeAnswer") { toPage.push({ type: "result", op: m.op, id: m.id, ok: true,
					errors: [] }); return; }
				answers.push(m);
				const w = waiting.get(m.notice), ok = !!w && m.button >= 0 && m.button < w.buttons;
				if (ok) { waiting.delete(m.notice); ran.push(w.title + ":" + m.button); }
				toPage.push({ type: "result", op: m.op, id: m.id, ok, errors: ok ? []
					: ["notice " + m.notice + " is not waiting for an answer"] });
			},
			toPage, ran, answers, waiting
		};
	})();
	const timers2 = [], logged = [];
	/* what is under a point of the page (document.elementFromPoint): nothing, unless a test says */
	let pointAt = () => null;
	const win = { addEventListener() { }, gmDev: batch => { for (const m of batch) native.onPageMessage(m); } };
	const scope2 = new Proxy({ setTimeout: f => { timers2.push(f); return timers2.length; }, clearTimeout() { },
		window: win, location: { protocol: "http:", search: "" },
		document: orAny({ addEventListener() { }, activeElement: null, readyState: "complete",
			elementFromPoint: (x, y) => pointAt(x, y) }), addEventListener() { },
		console: { log: (...a) => logged.push(a.join(" ")), error() { }, warn() { } } }, {
		has: () => true,
		get: (t, k) => k === Symbol.unscopables ? undefined : k in t ? t[k] : k in real ? real[k] : any,
		set: (t, k, v) => { t[k] = v; return true; } });
	const src2 = files.map(f => fs.readFileSync(path.join(__dirname, f), "utf8").replace(/^"use strict";/, ""))
		.join("\n;\n").replace(/^render\(\);\s*$/m, "").replace(/^Bridge\.ready\(\);\s*$/m, "");
	const Q = new Function("scope", "with (scope) {\n" + src2 + `
;const asked = [], errors = [];
ask = (html, btns, item) => { asked.push({ html, btns, item }); };
showLastError = e => { errors.push(e); }; toast = t => { errors.push(t); };
render = () => { }; scheduleRender = () => { };
const banners = []; Banner.show = (m, answer) => { banners.push({ m, answer }); };
return { Bridge, cmd, asked, errors, banners, S, Drop, get V() { return V; }, setV(v) { V = v; } }; }`)(scope2);
	const deliver = () => { win.gm.recv(native.toPage.splice(0)); };
	Q.cmd("romInfo"); deliver();	/* a command first: the bridge's request numbers are on */
	const first = native.notice("Delete preset?", ["Yes", "No"]),
		second = native.notice("Overwrite?", ["Overwrite", "Cancel"]);
	deliver();
	Q.asked.find(a => /Delete preset/.test(a.html)).btns[0][2]();
	deliver();
	const a1 = native.answers[native.answers.length - 1];
	check(a1 && a1.notice === first && typeof a1.id === "number" && a1.id !== a1.notice
		&& native.ran.join() === "Delete preset?:0",
		"Yes on notice " + first + ": the answer names notice " + first + " (its own request id " + (a1 && a1.id)
		+ " apart), and that notice runs");
	for (let i = 0; i < 40; i++) Q.cmd("romInfo");
	deliver();
	Q.asked.find(a => /Overwrite\?/.test(a.html)).item.cancel();	/* closed another way: its last key */
	deliver();
	check(native.ran.join() === "Delete preset?:0,Overwrite?:1"
		&& native.answers[native.answers.length - 1].notice === second,
		"40 commands later, the other notice closed by its last key: notice " + second + " takes it");
	for (let i = 3; i <= 30; i++) native.notice("Q" + i, ["Yes", "No"]);
	deliver();
	Q.asked.find(a => /<b>Q7<\/b>/.test(a.html)).btns[0][2]();
	deliver();
	check(native.ran[native.ran.length - 1] === "Q7:0" && native.ran.length === 3 && native.waiting.size === 27,
		"a key on notice 7 among 28 waiting answers notice 7 only");
	/* the update banner ("modal": false): its keys answer the banner's notice */
	const banner = native.notice("Update available: 9.9.9", ["Update", "Later", "Don't check"], false);
	deliver();
	const b = Q.banners[Q.banners.length - 1];
	check(b && b.m.id === banner, "the banner is the banner strip's (Banner.show), not the dialog");
	b.answer(0);
	deliver();
	const ab = native.answers[native.answers.length - 1];
	check(ab.notice === banner && ab.button === 0 && ab.id !== banner
		&& native.ran[native.ran.length - 1] === "Update available: 9.9.9:0",
		"Update on the banner reaches the banner's notice (its action runs in the plug-in)");
	/* answered again (a second click, a replayed batch): refused by the plug-in, only logged on the page */
	const shownBefore = Q.errors.length;
	b.answer(0);
	deliver();
	check(native.ran.length === 4 && Q.errors.length === shownBefore
		&& logged.some(l => /noticeAnswer refused: notice \d+ is not waiting/.test(l)),
		"an answer the plug-in refuses runs nothing, shows nothing, and is logged");
	/* Rosetta (mdRosettaNotice.h, mdProcessArch.h): a dialog with "Don't show again" first and OK last. Closed any
	   other way (Esc, a click outside) the page answers with the last key, OK, which keeps nothing; only its own key
	   sends the first button, which the plug-in keeps in its config. */
	const rosettaText = "This is the Intel version of the editor running translated on an Apple silicon Mac. It uses " +
		"about twice the CPU. Open your DAW as an Apple silicon app (uncheck 'Open using Rosetta'), or use the Apple " +
		"silicon standalone app.";
	const askedBefore = Q.asked.length;
	const rosetta1 = native.notice("Running under Rosetta", ["Don't show again", "OK"], undefined, rosettaText);
	deliver();
	const dialog = Q.asked.slice(askedBefore).find(a => /Running under Rosetta/.test(a.html));
	check(dialog && /uses about twice the CPU/.test(dialog.html) && dialog.item.notice && dialog.btns.length === 2
		&& dialog.btns[0][0] === "Don't show again" && dialog.btns[1][0] === "OK",
			"the Rosetta notice is a dialog the plug-in waits on: its text, Don't show again and OK");
	dialog.item.cancel();
	deliver();
	const closed = native.answers[native.answers.length - 1];
	check(closed.notice === rosetta1 && closed.button === 1
		&& native.ran[native.ran.length - 1] === "Running under Rosetta:1",
		"closed with Esc or a click outside: answered by OK (the last key), so nothing is kept");
	const rosetta2 = native.notice("Running under Rosetta", ["Don't show again", "OK"], undefined, rosettaText);
	deliver();
	Q.asked[Q.asked.length - 1].btns[0][2]();
	deliver();
	const never = native.answers[native.answers.length - 1];
	check(never.notice === rosetta2 && never.button === 0
		&& native.ran[native.ran.length - 1] === "Running under Rosetta:0",
		"Don't show again answers its own notice with button 0 (the plug-in keeps it)");
	/* what the page sends is the command the plug-in's table takes ($defs/command is generated from it, mdDeskTest) */
	const { execFileSync } = require("child_process");
	const root = path.join(__dirname, "..", "..", "..", "..", "..", "..");
	const onContract = m => { try { execFileSync("python3",
		[path.join(root, "doc/modern-ux/page_contract_check.py"),
		path.join(root, "doc/modern-ux/md-data-contract.schema.json"), "command"],
		{ input: JSON.stringify(m) }); return true; } catch (e) { return false; } };
	check(onContract(a1) && onContract(ab) && onContract(closed) && onContract(never)
		&& !onContract({ op: "noticeAnswer", id: a1.notice, button: 0 }),
		"the answers are the contract's noticeAnswer ({notice, button}); the old shape (the notice's number as id) " +
		"is not");

	/* ---- files dropped on the window (shared/deskDrop.js, the Sampler's queue in mdDeskSampler.js) over the real
	   bridge, against a model of the window's drop book (mdDroppedFiles.h: each file serves once, as the kind it was
	   dropped as); a sample the window takes is sampleLoad sending, then done when the test says ---- */
	{
		let book = null, nextDrop = 0;
		const KIND = { dropRom: "rom", dropSyx: "sysex", dropSample: "sample" }, cmds = [];
		native.onDrop = m => {
			cmds.push(m);
			const f = book && book.drop === m.drop ? book.files[m.n] : null, ok = !!f && !f.used
				&& f.kind === KIND[m.op];
			if (ok) f.used = true;
			if (ok && m.op === "dropSample") native.toPage.push({ type: "sampleLoad", slot: m.slot, state: "sending",
				file: f.name, text: "" });
			native.toPage.push({ type: "result", op: m.op, id: m.id, ok, errors: ok ? []
				: ["The window no longer holds that file: drop it again."] });
		};
		const kinds = { bin: "rom", syx: "sysex", wav: "sample", txt: "unknown" };
		/* the window's drop message for these files, at x, y */
		const dropFiles = (names, x = 300, y = 200) => {
			book = { drop: ++nextDrop, files: names.map(name => ({ name, kind: kinds[name.split(".").pop()],
				used: false })) };
			native.toPage.push({ type: "drop", drop: book.drop,
				items: book.files.map((f, n) => ({ n, kind: f.kind, name: f.name })), x, y });
			cmds.length = 0; Q.asked.length = 0; Q.errors.length = 0;
			deliver();
		};
		const done = slot => { native.toPage.push({ type: "sampleLoad", slot, state: "done", file: "", text: "ROM-"
			+ String(slot + 1).padStart(2, "0") + " loaded." }); deliver(); };
		const sent = () => cmds.map(c => c.op + (c.slot != null ? "@" + c.slot : "")).join(" ");
		const can = Object.assign({}, Q.V.caps, { can: Object.assign({}, Q.V.caps.can, { sampleLoad: true }),
			reasons: {} });
		Q.setV(Object.assign({}, Q.V, { lifecycle: "ready", caps: can }));

		/* a sample with the Sampler closed: the toast, no command */
		Q.S.ws = "seq";
		dropFiles(["kick.wav"]);
		check(!cmds.length && Q.errors.join() === "Open the Sampler and select a ROM slot, then drop the samples.",
			"a sample with the Sampler closed: the toast, no command (" + (Q.errors.join() || "none") + ")");
		/* the Sampler open on a RAM slot: no ROM slot to load into */
		Q.S.ws = "sampler"; Q.S.smpSlot = "RAM1";
		dropFiles(["kick.wav"]);
		check(!cmds.length && /Select a ROM slot, then drop the samples/.test(Q.errors.join()),
			"on a RAM slot: the toast, no command");
		/* ROM-05 selected: the sample goes there at once (as Load sample…) */
		Q.S.smpSlot = "ROM5";
		dropFiles(["kick.wav"]);
		check(sent() === "dropSample@4" && cmds[0].drop === nextDrop && cmds[0].n === 0 && !Q.asked.length,
			"ROM-05 selected: dropSample {drop, n, slot 4}, nothing asked");
		done(4);
		/* dropped on a ROM tile: that slot, whatever is selected */
		pointAt = () => ({ closest: () => ({ dataset: { romtile: "9" } }) });
		dropFiles(["snare.wav"]);
		check(sent() === "dropSample@8", "dropped on ROM-09's tile: slot 8 (" + sent() + ")");
		done(8);
		pointAt = () => null;
		/* three onto ROM-47: two fit; asked once; one at a time, the next when the machine has the one before */
		Q.S.smpSlot = "ROM47";
		dropFiles(["a.wav", "b.wav", "c.wav"]);
		check(!cmds.length && Q.asked.length === 1 && /Load 2 samples into ROM-47 to ROM-48\?/.test(Q.asked[0].html)
			&& /ROM-48 is the last slot: 1 sample not loaded\./.test(Q.errors.join()),
			"three onto ROM-47: asked about the two that fit, the third said");
		Q.asked[0].btns.find(b => b[0] === "Load")[2]();
		deliver();
		check(sent() === "dropSample@46", "Load: the first only, while it is on its way (" + sent() + ")");
		done(46);
		check(sent() === "dropSample@46 dropSample@47" && cmds[1].n === 1,
			"its sampleLoad done: the next one, file 1 into ROM-48");
		done(47);
		check(cmds.length === 2, "then nothing more");
		/* a .syx: its import window (the window's preview follows); a ROM while a firmware runs:
		   asked, then installed */
		dropFiles(["kits.syx", "OS.bin"]);
		check(!cmds.length && Q.asked.length === 1 && /Install <b>OS\.bin<\/b>/.test(Q.asked[0].html),
			"a ROM and a .syx: the ROM's question first");
		Q.asked[0].btns.find(b => b[0] === "Cancel")[2]();
		deliver();
		check(sent() === "dropSyx" && cmds[0].n === 0, "Cancel: the .syx opens (dropSyx {drop, n 0})");
		dropFiles(["OS.bin"]);
		Q.asked[0].btns.find(b => b[0] === "Install")[2]();
		deliver();
		check(sent() === "dropRom" && !Q.errors.length, "Install: dropRom, taken");
		/* a command the window refuses (its file used already): the error line, the queue stops */
		Q.S.smpSlot = "ROM1";
		dropFiles(["x.wav", "y.wav"]);
		book.files[0].used = true;
		Q.asked[0].btns.find(b => b[0] === "Load")[2]();
		deliver();
		check(sent() === "dropSample@0" && Q.errors.some(e => /no longer holds that file/.test(String(e))),
			"refused: said (" + Q.errors.join(" | ") + ")");
		done(0);
		check(cmds.length === 1, "and nothing more is sent for that drop");
		/* unknown files: named */
		dropFiles(["notes.txt", "k.syx"]);
		check(sent() === "dropSyx" && /Not a ROM .*notes\.txt/.test(Q.errors.join()),
			"an unknown file beside a .syx: named; the .syx opens");
		check(cmds.length && onContract(Object.assign({}, cmds[0])), "what the page sent is the contract's command");
		const s5 = { op: "dropSample", id: 9, drop: 1, n: 0, slot: 4 };
		check(onContract(s5) && !onContract(Object.assign({}, s5, { slot: 48 })),
			"dropSample's slot is a ROM slot (0-47)");
		native.onDrop = null;
	}
}

/* ---- B-184: kit and lock targets stay separate, including locks equal to the kit baseline. ---- */
{
	const HEX62 = "0".repeat(62);
	const tr = (i) => ({ machine: "GND-EMPTY", model: 0, level: 100, synth: Array(8).fill(0), effects: Array(8).fill(0).map((x, k) => k === 4 && i === 0 ? 64 : 0), routing: Array(8).fill(0),
		lfo: { track: 0, param: 0, shape1: 0, shape2: 0, update: 0 }, muteGroup: null, trigGroup: null });
	P.Docs.kits[3] = { schema: "md-desk/kit", version: 2, slot: 3, name: "K", tracks: Array.from({ length: 16 }, (_, i) => tr(i)),
		masterFx: { rhythmEcho: Array(8).fill(0), gateBox: Array(8).fill(0), eq: Array(8).fill(0), dynamix: Array(8).fill(0) },
		firmware: { format: { version: 2, revision: 0 }, lfoState: Array(16).fill(HEX62) } };
	P.Docs.patterns[5] = { schema: "md-desk/pattern", version: 2, slot: 5, kit: 3, length: 16, totalLength: 16, tempoMultiplier: "1X", swingAmount: 0, accentAmount: 0,
		accent: { editAll: 0, steps: [] }, slide: { editAll: 0, steps: [] }, swing: { editAll: 0, steps: [] },
		tracks: Array.from({ length: 16 }, (_, i) => ({ trigs: i === 0 ? [0, 1, 4] : [], accent: [], slide: [], swing: [] })), locks: [], firmware: { format: { version: 2, revision: 0 }, lockedRowsField: 0 } };
	P.Docs.machine = Object.assign({}, P.Docs.machine || {}, { pattern: { current: 5 }, kit: { current: 3 }, desk: {} });
	P.Overlay.clear(); P.S.multi = new Set(); P.S.sel = 0; P.S.ws = "seq"; P.S.lane = "FLTF"; P.setV(P.view());
	/* 106 px tall: a 100 px meter, kit FLTF 64. The header handle uses relative movement. */
	const classes = new Set();
	const lane = { contains: () => true, classList: { add: c => classes.add(c), remove: c => classes.delete(c), toggle() { } }, innerHTML: "" };
	const key = { dataset: { s: "1" }, insertAdjacentHTML() { }, getBoundingClientRect: () => ({ bottom: 200, height: 106, top: 94, left: 0, right: 20, width: 20 }), querySelector: q => q === ".base" ? { getBoundingClientRect: () => ({ top: -100, bottom: -99 }), style: { getPropertyValue: () => "0.5" } } : null };
	key.closest = q => q === ".lb" ? key : null;
	const handle = { dataset: { kitvalue: "" }, setAttribute() { }, focus() { } }; handle.closest = q => q === "[data-kitvalue]" ? handle : null;
	hooks["#lane"] = lane; hooks["#lane .lb"] = key; hooks["[data-kitvalue]"] = handle; hooks.under = key;
	const at = (y, target = key, m = {}) => Object.assign({ button: 0, clientX: 10, clientY: y, target, preventDefault() { } }, m);
	check(P.grp(0, "FLTF").FLTF === 64, "the kit baseline is FLTF 64");
	check(!P.kitHit(at(146)) && !P.kitGrab(at(146)), "a step at the baseline never grabs the kit");
	check(!!P.kitHit(at(146, handle)), "the KIT handle has its own target");
	check(!P.kitGrab(at(146, handle, { altKey: true })) && !P.kitGrab(at(146, handle, { shiftKey: true })) && !P.kitGrab(at(146, handle, { button: 2 })) && !P.Held.now, "Alt, Shift and a right button never grab the kit");
	for (const value of [63, 64, 65]) {
		P.Docs.patterns[5].locks = [{ track: 0, param: 12, steps: [[1, value]] }]; P.Overlay.clear(); P.setV(P.view()); sent.length = 0;
		const y = 197 - 100 * value / 127;
		P.slideGrab(at(y)); P.laneAt(at(y + 20)); P.endLaneDraw(); run();
		check(sent.some(m => m.op === "lock") && !sent.some(m => m.op === "param") && P.grp(0, "FLTF").FLTF === 64,
			`drag a lock at ${value} beside kit value 64: only the lock changes`);
	}
	sent.length = 0;
	check(P.kitGrab(at(146, handle)) && P.Held.as("lane")?.kit === "maybe", "the KIT handle waits for a drag");
	P.laneAt(at(148, handle)); fire("document", "pointerup"); run();
	check(!sent.length && !P.Held.now, "click the KIT handle with 2 px jitter: no edit");
	sent.length = 0; P.kitGrab(at(146, handle)); P.laneAt(at(143, handle));
	check(P.Held.as("lane")?.kit === "maybe" && !classes.has("kitdrag"), "3 px of movement still waits");
	P.laneAt(at(100, handle)); P.laneAt(at(60, handle)); P.laneAt(at(60, handle));
	const params = sent.filter(m => m.op === "param");
	check(!sent.some(m => m.op === "lock"), "dragging KIT paints no lock");
	check(params.length === 2 && params[0].t === 0 && params[0].i === 12 && params[0].v === 122 && params[1].v === 127, "relative drag sends the FLTF kit values 122 then 127: " + JSON.stringify(params.map(m => m.v)));
	check(new Set(params.map(m => m.g)).size === 1 && params[0].g, "the drag uses one undo gesture");
	check(P.grp(0, "FLTF").FLTF === 127, "the kit view follows immediately");
	fire("document", "pointerup"); run();
	check(!P.Held.now && !classes.has("kitdrag") && P.Gesture.id === 0, "release ends the kit drag");
	sent.length = 0; P.kitNudge({ target: handle, key: "ArrowDown", preventDefault() { }, stopPropagation() { } });
	check(P.grp(0, "FLTF").FLTF === 126 && sent.filter(m => m.op === "param").length === 1 && !sent.some(m => m.op === "lock"), "arrow key on KIT changes the kit alone");
	check(/data-kitvalue/.test(P.kitHandleHTML(64)) && /aria-label="Kit value 64"/.test(P.kitHandleHTML(64)), "the handle names its value without occupying a step column");
	/* the numbers: a lock's at its bar's end, the kit's on the line, a signed parameter as -64..+63 */
	check(/>99</.test(P.valueHTML(99)) && /vl/.test(P.valueHTML(99)), "a lock's value is written as a number: " + P.valueHTML(99));
	check(/0\.7795\) \+ 1px/.test(P.valueHTML(99)) && /0\.9449\) - 13px/.test(P.valueHTML(120)), "the number sits above a bar's end, below it near the top");
	check(/>127</.test(P.kitLabelHTML(127)) && /- 15px/.test(P.kitLabelHTML(127)) && /\+ 3px/.test(P.kitLabelHTML(40)), "the kit line's number sits above the line, below it near the top");
	check(/class="kvl fl"/.test(P.kitLabelHTML(127)) && /class="kvl"/.test(P.kitLabelHTML(40)), "near the top the kit's number moves left of its key (it never covers a bar's top)");
	P.S.lane = "PAN";
	check(P.laneFmt(64) === "0" && P.laneFmt(74) === "+10" && P.laneFmt(0) === "-64" && />\+10</.test(P.valueHTML(74)), "a signed parameter's numbers are -64 to +63 as the knob shows it");
	P.S.lane = "FLTF"; delete P.Docs.kits[3]; delete P.Docs.patterns[5]; P.Overlay.clear(); P.setV(P.view()); for (const k of Object.keys(hooks)) delete hooks[k];
}

/* ---- I-054: a slide drawn in the lock lane (the Monomachine lane's gestures, in the Machinedrum's terms). The slide is a flag on a
   step (this track's, or with All tracks the pattern's row every track with a trig there takes), set by the one slide intent
   (setMark): a lock's dot dragged sideways, Shift-drag out of a lock bar and dropped on the target, a click on the ramp's line
   to take it off. Up and down from the dot, a click, Alt and a press off the dot and the line are the lane's own. ---- */
{
	const HEX62 = "0".repeat(62);
	const tr = (i) => ({ machine: "GND-EMPTY", model: 0, level: 100, synth: Array(8).fill(0), effects: Array(8).fill(0).map((x, k) => k === 4 && i === 0 ? 64 : 0), routing: Array(8).fill(0),
		lfo: { track: 0, param: 0, shape1: 0, shape2: 0, update: 0 }, muteGroup: null, trigGroup: null });
	const pattern = (slideAll, slide) => ({ schema: "md-desk/pattern", version: 2, slot: 5, kit: 3, length: 16, totalLength: 16, tempoMultiplier: "1X", swingAmount: 0, accentAmount: 0,
		accent: { editAll: 0, steps: [] }, slide: { editAll: slideAll, steps: slideAll ? slide : [] }, swing: { editAll: 0, steps: [] },
		tracks: Array.from({ length: 16 }, (_, i) => ({ trigs: i === 0 ? [0, 1, 4, 8, 12] : i === 1 ? [4, 8] : [], accent: [], slide: !slideAll && i === 0 ? slide : [], swing: [] })),
		/* FLTF is parameter 12 of GND-EMPTY: locks on steps 0, 4, 8 (trigs) and 6 (no trig: the machine ignores it) */
		locks: [{ track: 0, param: 12, steps: [[0, 20], [4, 100], [6, 90], [8, 60]] }], firmware: { format: { version: 2, revision: 0 }, lockedRowsField: 0 } });
	const load = (slideAll, slide) => {
		P.Docs.kits[3] = { schema: "md-desk/kit", version: 2, slot: 3, name: "K", tracks: Array.from({ length: 16 }, (_, i) => tr(i)),
			masterFx: { rhythmEcho: Array(8).fill(0), gateBox: Array(8).fill(0), eq: Array(8).fill(0), dynamix: Array(8).fill(0) },
			firmware: { format: { version: 2, revision: 0 }, lfoState: Array(16).fill(HEX62) } };
		P.Docs.patterns[5] = pattern(slideAll, slide);
		P.Docs.machine = Object.assign({}, P.Docs.machine || {}, { pattern: { current: 5 }, kit: { current: 3 }, desk: {} });
		P.Overlay.clear(); P.S.multi = new Set(); P.S.sel = 0; P.S.ws = "seq"; P.S.lane = "FLTF"; P.S.tt = "trig"; P.setV(P.view());
	};
	/* the lane: 16 keys of 20 px from x 0, 106 px tall with the bottom at 200 (the bars' scale: 3 px in, 100 px high) */
	const classes = new Set();
	const BOT = 200, KEYH = 106, dotY = v => BOT - 3 - (KEYH - 6) * v / 127;
	const keyEls = Array.from({ length: 16 }, (_, s) => { const k = { dataset: { s: String(s) }, insertAdjacentHTML() { }, classList: { add() { }, remove() { } }, getBoundingClientRect: () => ({ bottom: BOT, height: KEYH, top: BOT - KEYH, left: s * 20, right: s * 20 + 20, width: 20 }), querySelector: q => q === ".base" ? { getBoundingClientRect: () => ({ top: -100, bottom: -99 }) } : null }; k.closest = () => k; return k; });
	const svg = { innerHTML: "", setAttribute() { } };
	const lane = { contains: () => true, classList: { add: c => classes.add(c), remove: c => classes.delete(c), toggle: (c, on) => on ? classes.add(c) : classes.delete(c) }, innerHTML: "",
		getBoundingClientRect: () => ({ left: 0, top: BOT - KEYH, width: 320, height: KEYH, right: 320, bottom: BOT }), querySelector: q => { const m = /data-s="(\d+)"/.exec(q); return m ? keyEls[+m[1]] : null; } };
	hooks["#lane"] = lane; hooks["#lanesvg"] = svg; keyEls.forEach((k, s) => { hooks[`#lane .lb[data-s="${s}"]`] = k; }); hooks["#lane .lb"] = keyEls[0];
	document.querySelectorAll = q => q === "#lane .lb" ? keyEls : [];
	/* the key under the pointer is the one the event names (document.elementFromPoint) */
	const at = (s, y, m = {}) => { hooks.under = keyEls[s]; return Object.assign({ button: 0, clientX: s * 20 + 10, clientY: y, target: keyEls[s], pointerId: 1, preventDefault() { } }, m); };
	const slides = () => sent.filter(m => m.op === "slide"), locks = () => sent.filter(m => m.op === "lock");
	const up = () => { fire("document", "pointerup"); run(); };
	load(0, []);
	P.S.lane = "FLTF";
	const FL = P.V.locks.get("0:FLTF");
	check(!!FL && FL.get(4) === 100 && FL.get(6) === 90, "the test pattern: FLTF locks 0=20, 4=100, 6=90 (no trig), 8=60: " + (FL ? [...FL].join(" ") : "none"));
	/* the rule (measured on the firmware, gapProbesFirmwareTest w13slide): the glide ends on the track's next trig, whether that trig locks
	   the parameter or not; a lock on a step without a trig (step 6) is never a target */
	check(P.slideNext(0, "FLTF", 0) === 1 && P.slideNext(0, "FLTF", 1) === 4 && P.slideNext(0, "FLTF", 4) === 8 && P.slideNext(0, "FLTF", 8) === 12 && P.slideNext(0, "FLTF", 12) === null,
		"the next trig after 0 is 1, after 4 is 8 (never step 6, which has no trig), after 12 none");
	check(P.slideNext(0, "VOL", 4) === 8, "it is the track's next trig, not the parameter's next lock");
	check(P.slideVal(0, "FLTF", 8) === 60 && P.slideVal(0, "FLTF", 12) === 64, "the value on a trig is its lock (60 on step 9) or the kit value (64) when it has none");

	/* a press on a dot: a maybe-slide; a press off the dot, on the kit line, with Alt, with a right button is not */
	sent.length = 0;
	check(!P.slideGrab(at(4, dotY(100) + 20)) && !P.Held.now, "a press 20 px from the dot is the lane's, not the slide's");
	check(!P.slideGrab(at(4, dotY(100), { altKey: true })) && !P.slideGrab(at(4, dotY(100), { button: 2 })) && !P.Held.now, "Alt (erase) and a right button never begin a slide");
	check(!P.slideGrab(at(1, dotY(100))) && !P.slideGrab(at(2, dotY(100))), "a step with a trig and no lock, or without a trig, has no dot");
	check(!P.slideGrab(at(4, dotY(100), { shiftKey: true, target: keyEls[1], clientX: 30 })) && !P.Held.now, "Shift on a key with no lock is the lane's ramp, not the slide's rubber band");
	check(P.slideGrab(at(4, dotY(100) + 3)) && P.Held.as("lane")?.slide === "maybe" && P.Held.as("lane").s === 4, "a press within 8 px of a lock's dot begins a maybe-slide on that step");
	/* a click (no more than 4 px of move) is the lane's: it locks the step where the pointer is */
	P.laneAt(at(4, dotY(100) + 3, { clientX: 4 * 20 + 12 }));
	check(P.Held.as("lane")?.slide === "maybe", "2 px of movement is still a click");
	up();
	check(slides().length === 0 && !P.Held.now, "released without moving it is no slide: " + sent.map(m => m.op).join(" "));
	check(locks().length === 1 && locks()[0].s === 4, "it is the lane's click: the step's lock is set where the pointer was: " + JSON.stringify(locks().map(m => [m.s, m.v])));

	/* a drag up and down from the dot is the lane's own (the lock's value), no slide */
	sent.length = 0;
	P.slideGrab(at(4, dotY(100)));
	P.laneAt(at(4, dotY(100) - 2)); P.laneAt(at(4, dotY(100) - 30, { clientX: 4 * 20 + 11 }));
	check(P.Held.as("lane") && !P.Held.as("lane").slide && P.Held.as("lane").erase === false, "up and down from the dot hands the press back to the lane's draw");
	up();
	check(slides().length === 0 && locks().length >= 1, "no slide; the lock moved: " + sent.map(m => m.op).join(" "));

	/* a drag sideways from the dot: the preview ramp, then the slide at the release (the slide intent: one command, one undo step) */
	sent.length = 0; P.Docs.patterns[5] = pattern(0, []); P.Overlay.clear(); P.setV(P.view());
	const g0 = P.Gesture.id;
	P.slideGrab(at(4, dotY(100)));
	check(P.Gesture.id && P.Gesture.id !== g0, "the press begins the gesture (one undo step)");
	P.laneAt(at(4, dotY(100), { clientX: 4 * 20 + 40 }));
	check(P.Held.as("lane")?.slide === "on" && P.Held.as("lane").pv === 4, "dragged right: the preview is on step 4 (0-based), the dot's step");
	P.drawSlides();
	check(/M90 \S+ L170 \S+ /.test(svg.innerHTML) && /stroke-dasharray="6 4"/.test(svg.innerHTML), "the preview is a dashed ramp from step 5's bar top to the next lock's, step 9: " + svg.innerHTML.slice(0, 90));
	check(slides().length === 0, "nothing is sent while the drag runs");
	P.laneAt(at(12, dotY(100), { clientX: 4 * 20 + 300 }));
	check(P.Held.as("lane").pv === 4, "however far it goes, the slide is that step's");
	up();
	check(slides().length === 1 && slides()[0].t === 0 && slides()[0].s === 4 && slides()[0].on === true && slides()[0].g === slides()[0].g, "released: one slide intent for track 1 step 5, on: " + JSON.stringify(slides()));
	check(P.V.tracks[0].slide.has(4) && !P.Held.now && P.Gesture.id === 0, "the page shows the slide at once and the gesture is over");
	P.drawSlides();
	check(/M90 \S+ L170 \S+ /.test(svg.innerHTML) && !/stroke-dasharray/.test(svg.innerHTML), "a set slide is a solid ramp");
	P.drawSlides(); check((svg.innerHTML.match(/stroke-width="2"/g) || []).length === 1, "one ramp: only step 5 slides");
	/* a slide on the lock of step 9: the next trig is step 13, which holds no lock of FLTF, so the ramp ends on the kit line there (64) */
	P.Docs.patterns[5] = pattern(0, [4, 8]); P.Overlay.clear(); P.setV(P.view()); P.drawSlides();
	{ const m = /M170 (\S+) L250 (\S+) /.exec(svg.innerHTML); check(!!m && Math.abs(+m[1] - (dotY(60) - 94)) < 1e-6 && Math.abs(+m[2] - (dotY(64) - 94)) < 1e-6, "its end is at the kit value's height (64), its start at the lock's (60): " + (m ? m[1] + " " + m[2] : "no ramp")); }
	P.Docs.patterns[5] = pattern(0, [4]); P.Overlay.clear(); P.setV(P.view()); sent.length = 0;

	/* a click on the ramp's line takes the slide off; a drag from it hands back to the lane */
	sent.length = 0;
	const lineY = (dotY(100) + dotY(60)) / 2, midX = 6 * 20 + 10;	/* between step 5's bar and step 9's */
	check(P.slideGrab(at(6, lineY, { clientX: midX })) && P.Held.as("lane")?.cut === "maybe" && P.Held.as("lane").s === 4, "a press on the ramp's line begins a maybe-cut of that step's slide");
	up();
	check(slides().length === 1 && slides()[0].s === 4 && slides()[0].on === false, "a click on the line sends the slide off: " + JSON.stringify(slides()));
	check(!P.V.tracks[0].slide.has(4), "the page shows it off");
	P.Docs.patterns[5] = pattern(0, [4]); P.Overlay.clear(); P.setV(P.view());
	P.slideGrab(at(6, lineY, { clientX: midX })); P.laneAt(at(6, lineY - 20, { clientX: midX + 1 }));
	check(P.Held.as("lane") && !P.Held.as("lane").cut, "a drag from the line is the lane's draw, as if there were no slide"); sent.length = 0; up();
	check(slides().length === 0, "and sets no slide");
	check(!P.slideGrab(at(6, lineY + 30, { clientX: midX })), "a press away from the line is not the cut's");

	/* Shift on a lock bar: a rubber band out of the column; dropped on the next lock it sets the slide; elsewhere nothing */
	sent.length = 0; P.Docs.patterns[5] = pattern(0, []); P.Overlay.clear(); P.setV(P.view());
	P.slideGrab(at(4, dotY(100) + 30, { shiftKey: true }));
	check(P.Held.as("lane")?.band === "maybe" && P.Held.as("lane").s === 4, "Shift on a lock bar begins a maybe-band");
	P.laneAt(at(4, dotY(100) + 30 - 3, { shiftKey: true, clientX: 4 * 20 + 11 }));
	check(P.Held.as("lane")?.band === "maybe", "inside its column, a few px of movement keep it a maybe");
	P.laneAt(at(5, dotY(100) + 5, { shiftKey: true, clientX: 5 * 20 + 6 }));
	check(P.Held.as("lane")?.band === "on" && P.Held.as("lane").nx === 8 && !!P.bandLive(), "out of the column to the right it is the band, its only target the next trig: step 9 (0-based 8)");
	P.drawSlides();
	check(/r="9"/.test(svg.innerHTML) && /M90 \S+ L106 /.test(svg.innerHTML), "a line follows the pointer from the dot and a ring marks the target");
	P.laneAt(at(8, dotY(60), { shiftKey: true, clientX: 8 * 20 + 8 }));
	up();
	check(slides().length === 1 && slides()[0].s === 4 && slides()[0].on === true && P.V.tracks[0].slide.has(4), "dropped on the target: the slide is set on step 5: " + JSON.stringify(slides()));
	/* dropped elsewhere, Esc, left of the start: nothing */
	for (const [name, drop] of [["elsewhere", () => P.laneAt(at(11, dotY(60), { shiftKey: true, clientX: 11 * 20 + 8 }))], ["Esc", () => { P.laneAt(at(8, dotY(60), { shiftKey: true, clientX: 8 * 20 + 8 })); P.bandEsc(); }],
		["left of the start", () => P.laneAt(at(2, dotY(60), { shiftKey: true, clientX: 2 * 20 + 8 }))]]) {
		sent.length = 0; P.Docs.patterns[5] = pattern(0, []); P.Overlay.clear(); P.setV(P.view());
		P.slideGrab(at(4, dotY(100) + 30, { shiftKey: true })); P.laneAt(at(5, dotY(100), { shiftKey: true, clientX: 5 * 20 + 6 })); drop(); up();
		check(slides().length === 0 && !P.V.tracks[0].slide.has(4) && !P.Held.now, `dropped ${name}: no slide`);
	}
	/* Shift, up and down inside the column: the lane's ramp of locks */
	sent.length = 0;
	P.slideGrab(at(4, dotY(100) + 30, { shiftKey: true })); P.laneAt(at(4, dotY(100) - 20, { shiftKey: true, clientX: 4 * 20 + 11 }));
	check(P.Held.as("lane")?.ramp === true && !P.Held.as("lane").band, "Shift, then up and down inside the column, is the ramp of locks"); up();
	check(slides().length === 0, "no slide from it");

	/* All tracks (the pattern's EDIT ALL row): the slide goes on every track with a trig on the step, and shows on them */
	sent.length = 0; load(1, []);
	P.slideGrab(at(4, dotY(100))); P.laneAt(at(4, dotY(100), { clientX: 4 * 20 + 40 })); up();
	check(slides().length === 1 && slides()[0].on === true && P.V.tracks[0].slide.has(4) && P.V.tracks[1].slide.has(4) && !P.V.tracks[1].slide.has(8), "with All tracks the one intent puts the slide on every track with a trig on step 5 (track 2 has one there)");
	sent.length = 0;
	P.slideGrab(at(6, lineY, { clientX: midX })); up();
	check(slides().length === 1 && slides()[0].on === false && !P.V.tracks[1].slide.has(4), "and a click on the ramp takes it off every track's");

	for (const k of Object.keys(hooks)) delete hooks[k]; delete document.querySelectorAll;
	P.S.lane = "FLTF"; delete P.Docs.kits[3]; delete P.Docs.patterns[5]; P.Overlay.clear(); P.setV(P.view());
}

/* ---- 0.8 (L4): the Control page's words from the plug-in's learn document ---- */
{
	check(P.learnName(99, 3, "DEC") === "DEC" && P.learnName(99, 3, "") === "#4", "a target outside the tracks keeps the plug-in's name, else its number");
	check(P.progressText({ got: 1, need: 2 }) === "Turn a knob on your controller both ways (1 of 2)", "progress says got of need: " + P.progressText({ got: 1, need: 2 }));
	const m = { cc: 21, overrides: [] };
	check(P.overridesText(m) === "" && P.overridesText({ cc: 21 }) === "", "no overrides, no line");
	check(P.overridesText({ cc: 21, overrides: [{ ch: 0, t: 98, i: 0 }] }) === "Overrides the machine's CC 21 on channel 1: T99 #1", "one override: " + P.overridesText({ cc: 21, overrides: [{ ch: 0, t: 98, i: 0 }] }));
	check(P.overridesText({ cc: 22, overrides: [{ ch: 0, t: 98, i: 0 }, { ch: 1, t: 97, i: 1 }, { ch: 0, t: 96, i: 2 }] }) === "Overrides the machine's CC 22 on channel 1: T99 #1, T97 #3; channel 2: T98 #2",
		"overrides are grouped by channel: " + P.overridesText({ cc: 22, overrides: [{ ch: 0, t: 98, i: 0 }, { ch: 1, t: 97, i: 1 }, { ch: 0, t: 96, i: 2 }] }));
	const many = P.overridesText({ cc: 30, overrides: Array.from({ length: 9 }, (_, k) => ({ ch: k, t: 98, i: k })) });
	check(/\+3 more$/.test(many) && (many.match(/T99/g) || []).length === 6, "six overrides at most are listed, the rest counted: " + many);
	check(P.learnMax() === 128 && P.learnPaused() === "", "before the first document: 128 mappings at most, nothing paused");
	/* a toast per document: a finished learn names the CC, its channel and the target; the left list is said once */
	const toasts = []; const t0 = P.setToast(m => toasts.push(m));
	try {
		const doc = (maps, o = {}) => Object.assign({ enabled: true, mappings: maps, learning: null }, o);
		const mm = { index: 0, t: 98, i: 0, name: "DEC", cc: 21, ch: 0, mode: "Absolute", invert: false, overrides: [{ ch: 0, t: 98, i: 0 }] };
		P.onLearnDoc(doc([]), doc([mm]));
		check(!toasts.length, "a mapping added with no learn waiting (the Add row) says nothing");
		P.onLearnDoc(doc([], { learning: { t: 98, i: 0, name: "DEC", got: 1, need: 2 } }), doc([mm]));
		check(toasts.length === 1 && /^CC 21 on channel 1 now moves T99 DEC\. Overrides the machine's CC 21 on channel 1: T99 #1\.$/.test(toasts[0]), "a finished learn names CC, channel, target and what it overrides: " + toasts[0]);
		check(P.S.ctl.sel === "0:21", "and the Control page selects its row: " + P.S.ctl.sel);
		toasts.length = 0;
		P.onLearnDoc(doc([]), doc([], { left: ["a", "b"] }));
		P.onLearnDoc(doc([], { left: ["a", "b"] }), doc([], { left: ["a", "b"] }));
		check(toasts.length === 1 && /^2 mappings left out of the project/.test(toasts[0]), "a project load that left items out is said once: " + toasts.join(" | "));
		P.onLearnDoc(doc([], { left: ["a", "b"] }), doc([]));
		P.onLearnDoc(doc([]), doc([], { left: ["c"] }));
		check(toasts.length === 2 && /^1 mapping left out/.test(toasts[1]), "a later, different list is said again, singular for one: " + toasts.join(" | "));
	} finally { P.setToast(t0); }
}

console.log(failures ? `${failures} failure(s)` : "mdDeskPageTest: all passed");
process.exit(failures ? 1 : 0);
