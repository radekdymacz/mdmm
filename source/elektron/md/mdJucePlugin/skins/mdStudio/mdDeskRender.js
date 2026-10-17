"use strict";
/* Documents in, the view derived again, the page rendered (in place while a gesture holds it); the click router;
   the editor's keys; the first render. Loaded last of the page's own files: it starts the page. */

/* ===== Documents in: re-derive, then render (in place while a gesture runs) ===== */
let pendingRender = false, renderRaf = 0;
let Base = null;	// the view last derived from the documents (V is it with the overlay)
/* A machine document often changes only the view's status (TX, round trip, undo counts): then the
   view is the same value with the new status (no render); any other change of the derived view renders. */
const STATUS = ["tx", "roundTrip", "canUndo", "canRedo", "undoCount", "redoCount"];
function sameValue(a, b) {
	if (a === b) return true;
	if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
	if (a instanceof Set || b instanceof Set) return a instanceof Set && b instanceof Set && a.size === b.size && [...a].every(x => b.has(x));
	if (a instanceof Map || b instanceof Map) return a instanceof Map && b instanceof Map && a.size === b.size && [...a].every(([k, x]) => b.has(k) && sameValue(x, b.get(k)));
	if (Array.isArray(a) !== Array.isArray(b)) return false;
	const ka = Object.keys(a), kb = Object.keys(b);
	return ka.length === kb.length && ka.every(k => sameValue(a[k], b[k]));
}
const beyondStatus = v => { const o = { ...v }; for (const k of STATUS) delete o[k]; return o; };
/* an open menu (the machine picker, a key-style dropdown) holds renders too: a document landing would rebuild what it belongs to and close it */
function menuOpen() { return !$("#machpop")?.hidden || !$("#kpop")?.hidden; }
/* a gesture that holds the page (a drag, a paint, a dragged pad, a GEN or MUTATE value dragged, the tempo dragged, a
   run of wheel notches on a lock, the rotate presses while Alt is down): documents re-derive the view, the page
   renders once it ends (pendingRender). Each of them draws its own change in place, so a document that lands meanwhile
   does not rebuild the grid (1.0 review: the unheld ones cost a full render a document, about 50 % WebContent). */
const HOLDS = new Set(["value", "editor", "lane", "l2", "chop", "song", "paint", "mutePaint", "select", "gv", "bpm", "wheel", "rotate"]);
function interacting() { const h = Held.now; return !!(h && HOLDS.has(h.kind)) || menuOpen() || SongSlots.busy(); }
/* the one flush: a render held while a gesture ran is made when it ends, whichever gesture it was (a timer, so
   the gesture's own end handler draws its row first; still held by a menu, it waits for the menu's close) */
Held.onEnd(() => { if (pendingRender) scheduleRender(); });
function scheduleRender() {
	if (renderRaf) return;
	/* A timer, not an animation frame: documents must land while the window is covered. */
	renderRaf = setTimeout(() => {
		renderRaf = 0;
		Base = deriveView(Docs, S);
		V = view();
		if (interacting()) { pendingRender = true; syncControls(); renderTop(); renderSub(); redraw(); return; }
		pendingRender = false;
		render();
	}, 16);
}
Bridge.onMessage(m => {
	switch (m.type) {
	case "catalogue": setCatalogue(m.doc); scheduleRender(); break;
	case "doc": {
		/* stored where its kind keeps it (mdDeskModel.js, storeDoc); the working kit is the kit that
		   plays, "kit" the stored slots */
		const slot = storeDoc(Docs, m); if (slot == null) break;
		/* Background loads of other patterns only matter to the song palette. */
		const relevant = (m.kind === "pattern" && (slot === currentPatternSlot() || S.ws === "song")) || ((m.kind === "kit" || m.kind === "workingKit") && slot === currentKitSlot()) || m.kind === "global" || (m.kind === "song" && (slot === currentSongSlot() || S.ws === "song"));
		if (relevant) scheduleRender();
		break;
	}
	case "machine": {
		Docs.machine = m.doc;
		const next = deriveView(Docs, S);
		if (!Base || !sameValue(beyondStatus(Base), beyondStatus(next))) { scheduleRender(); break; }
		Base = next;
		V = Object.assign({}, V, Object.fromEntries(STATUS.map(k => [k, next[k]])));
		$("#undo").disabled = !V.canUndo; $("#redo").disabled = !V.canRedo; syncUndoCounts(); syncTx();
		break;
	}
	case "telemetry": onTelemetry(m); break;
	case "host": Docs.host = m; scheduleRender(); break;
	case "audioRun": Boot.audio(m); break;
	case "cpuLoad": CpuMeter.update(m); break;
	case "outputLevel": DeskVolume.update(m); break;
	case "midiIn": noteLight(m); followNote(m); break;
	case "midiHeld": break;	/* the notes held: the Monomachine's Perform keyboard lights them; the Machinedrum has no keyboard (its notes are trigs: midiIn) */
	case "mixLevels": break;	/* 0.8 (I-032): the output pair meters; only the Monomachine page draws them (its Mix graph), this page never asks (no mixMeters), so none comes */
	case "midiStats": audioStats(m); break;	/* 0.8: the MIDI monitor's counts: the AUDIO / MIDI panel's Monitor row (WP4) */
	case "result": if (m.op === "followHost" && !m.ok) hostRefused(m); break;
	case "setup": { const before = knobCcs().join(); Docs.setup = m.doc; takeFollowSetup(m.doc); if (knobCcs().join() !== before && S.ws === "control") scheduleRender(); break; }
	case "mod": {
		/* a modSet is still on its way: keep the pending edit, only its values/CC rate are live */
		if (modInFlight) { Mods.applyLive(m); if (S.ws === "control") syncMods(); break; }
		const before = Mods.doc; Mods.onMessage(m);
		if (S.ws === "control") { if (!sameValue(Mods.doc, before) && !interacting()) scheduleRender(); else syncMods(); }
		break;
	}
	case "solo": takeSolo(m); break;
	case "ask": onAsk(m); break;
	case "samples": Docs.samples = m.doc; Waves.clear(); WavesAsked.clear(); if (S.ws === "sampler" || S.ws === "sound") scheduleRender(); break;
	case "sampleWave": onSampleWave(m); break;
	case "audition": onAudition(m); break;
	case "sampleLoad": onSampleLoad(m); break;
	case "error": showLastError([m.message]); break;
	case "learn": { const prev = Docs.learn; Docs.learn = m.doc; applyMapping(m.doc.enabled); if (!S.mapping) break; onLearnDoc(prev, m.doc); } if (!S.mapping) break; if (S.ws === "control") scheduleRender(); else syncControls(); if (!m.doc.learning && S.ctl.learnT) { S.ctl.learnT = null; syncControls(); } break;
	}
});

/* The page's first real render, logged so a blank page fails the self-tests. */
let firstRenderLogged = false;
function logFirstRender() {
	if (firstRenderLogged || !Base) return; firstRenderLogged = true;
	const r = document.querySelector(".app").getBoundingClientRect();
	Bridge.log(`first render: ${S.ws}, ${document.querySelectorAll("#main *").length} elements in #main, page ${Math.round(r.width)} x ${Math.round(r.height)}, window ${innerWidth} x ${innerHeight}, ${Math.round(performance.now())} ms`);
}
/* The focused value keeps the focus across a render (its element is a new one then): its keys stay its own (↑ ↓ step
   it, the key map's promise), also when the machine's read-back of the step it just sent redraws the workspace. */
const FOCUS_KEYS = ["g", "n", "t", "f", "src", "li", "gv"];
function focusedValue() {
	const el = document.activeElement, d = el && el.dataset;
	if (!d || (d.g == null && d.gv == null) || !$("#main")?.contains(el)) return null;
	return FOCUS_KEYS.filter(k => d[k] != null).map(k => `[data-${k}="${d[k]}"]`).join("");
}
function render() {
	const focused = focusedValue();
	renderPage();
	if (focused && document.activeElement !== document.querySelector("#main " + focused)) document.querySelector("#main " + focused)?.focus({ preventScroll: true });
}
function renderPage() {
	endStaleRuns(); closePicker(); closeK(); const sl = $("#seqscroll")?.scrollLeft || 0; renderTop();
	const full = S.ws === "mix" || S.ws === "song" || S.ws === "control"; $("#body").classList.toggle("full", full); document.documentElement.classList.toggle("songpage", S.ws === "song"); $("#rail").hidden = full;
	if (!Base) { $("#main").innerHTML = ""; renderSub(); return; }	/* no document yet */
	if (S.ws === "seq") genEnsure();	/* the GEN specs, the first time they show */
	if (!full) renderRail(); renderSub();
	({ seq: renderSeq, sound: renderSound, mix: renderMix, song: renderSong, sampler: renderSampler, control: renderControl })[S.ws]();
	const sc = $("#seqscroll"); if (sc) { sc.scrollLeft = sl; $("#lanescroll").scrollLeft = sl; } enhanceSelects(document.getElementById("main"));
	if (S.ws === "seq") genDraw(); markCapabilities(); audKeep(); phLast = -1; movePH(); logFirstRender(); alignLock();
}
/* The rail's LOCK PARAMETER block lines up with the lock lane: its top border with the line above the lane, its first key with the
   top of the bars and its last key with their bottom (the keys' rows share the height the lane has). It runs after every
   render of the sequencer, so its reads and writes are batched (1.0 review): every style back to the stylesheet's, then
   the measures, then the new styles, three layouts in all (it was one a read, about a dozen). The lane's title moves with
   the block's margin (it sits in the block), so its line is worked out, not measured again; the chips' last check only
   corrects what is left (nothing, normally). */
function alignLock() {
	const rp = $("#rail .railparams"), lt = $(".lanetop"), ln = $("#lane"), ch = $("#chips");
	if (!rp || !lt || !ln || !ch || S.ws !== "seq") return;
	const keys = [...ch.querySelectorAll(".pk")], lab = ch.querySelector(".plab"), a = rp.querySelector(".rphead .cap"), b = lt.querySelector(".cap");
	const lw = lt.closest(".lanewrap"), top = e => e.getBoundingClientRect().top, mid = e => { const q = e.getBoundingClientRect(); return q.top + q.height / 2; };
	/* 1. writes: the stylesheet's own (the lane's title on its own line) */
	rp.style.removeProperty("margin-top"); ch.style.removeProperty("grid-template-rows"); ch.style.marginTop = ""; ch.style.height = "";
	keys.forEach(k => k.style.removeProperty("height"));
	lt.style.marginTop = "0px";
	/* 2. reads: the line above the lane (its top border), the block's place and the titles' lines, the chips' rows */
	const line = lw ? top(lw) : top(lt), shift = line - top(rp), rpMargin = parseFloat(getComputedStyle(rp).marginTop);
	const title = a && b ? mid(a) + shift - mid(b) : 0;	/* the block's title after the block moved by shift */
	const rows = getComputedStyle(ch).gridTemplateRows.split(" ").length, lh = lab ? lab.getBoundingClientRect().height : 0;
	/* 3. writes: the block on the line, the lane's title on the block's title's line, the keys share the rows */
	rp.style.setProperty("margin-top", (rpMargin + shift) + "px", "important");
	if (a && b) lt.style.marginTop = title + "px";
	ch.style.setProperty("grid-template-rows", `${lh}px repeat(${Math.max(1, rows - 1)}, minmax(0, 1fr))`, "important");
	keys.forEach(k => k.style.setProperty("height", "auto", "important"));
	/* 4. reads, then writes: the first key on the bars' top, the chips down to the bars' bottom */
	let lane = ln.getBoundingClientRect(), chTop = top(ch), dy = keys[0] ? lane.top - top(keys[0]) : 0;
	if (keys[0]) ch.style.marginTop = dy + "px";
	ch.style.height = Math.max(0, lane.bottom - (chTop + dy)) + "px";
	/* 5. the check: what is left (a grid whose rows moved with its height), corrected once */
	if (!keys[0]) return;
	lane = ln.getBoundingClientRect(); const left = lane.top - top(keys[0]);
	if (Math.abs(left) < 0.5) return;
	chTop = top(ch);
	ch.style.marginTop = (dy + left) + "px";
	ch.style.height = Math.max(0, lane.bottom - (chTop + left)) + "px";
}
/* fonts in: the editors and the lock block measure again (a promise: it may settle as soon as this script ends) */
document.fonts && document.fonts.ready.then(() => { redraw(); alignLock(); });
/* No page selection from a drag (an LCD value, a knob box, a plot, steps, the lock lane): the page is a control
   surface, so nothing selects but the text fields (the CSS has user-select: none on the body, text on the
   fields). selectstart is refused outside them (WebKit, the plug-in's engine, too), and a press outside them
   clears what was selected. */
const textField = n => !!(n && (n.nodeType === 1 ? n : n.parentElement)?.closest?.("input,textarea,select,[contenteditable]:not([contenteditable=false]),.selectable"));
document.addEventListener("selectstart", e => { if (!textField(e.target)) e.preventDefault(); }, true);
document.addEventListener("pointerdown", e => {
	if (textField(e.target)) return;
	const sel = getSelection(); if (sel && sel.rangeCount && !sel.isCollapsed && !textField(sel.anchorNode)) sel.removeAllRanges();
}, true);
document.addEventListener("dragstart", e => { if (!e.target.closest?.("[draggable=true]")) e.preventDefault(); }, true);
/* ===== The click router: one listener, each workspace's handler in order, the first that takes the click ends
   it (each returns true when the click was its). The order is the page's: a key inside another (a track's M
   inside its header) is the inner one's. ===== */
/* a segmented switch: its value to the workspace it belongs to */
function clickSeg(e) {
	const sg = e.target.closest(".seg[data-set] button"); if (!sg) return false;
	const k = sg.parentElement.dataset.set, v = sg.dataset.v;
	if (k === "upd") { sendLfo(S.sel, "UPDTE", v); sg.parentElement.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b === sg)); redraw(); }
	else if (k === "srcrate" && S.ws === "control") { const id = S.ctl.sel.slice(4); if (Mods.source(id)) { Mods.setSource(id, { rate: v }); sendMods(); render(); } }
	else if (k === "lcurve" && S.ws === "control") { const li = +sg.parentElement.dataset.li; if (Mods.doc.links[li]) { Mods.setLink(li, { curve: v }); sendMods(); render(); } }
	else if (k === "loopkind" && S.ws === "song") { const r = { ...V.song[S.songSel], type: v }; if (v === "halt") r.to = S.songSel; if (v === "loop") { r.count = r.count || 2; r.to = Math.min(r.to ?? 0, Math.max(0, S.songSel - 1)); } if (v === "jump") r.to = Math.max(r.to ?? 0, S.songSel + 1); rowSet(S.songSel, r); render(); }
	return true;
}
const CLICKS = [clickGen, clickLaneTools, clickTrackKeys, clickSteps, clickSelect, clickSeg, clickLane, clickShape, clickSamplerSteps, clickPage, clickSlots, clickSong, clickOut,
	clickDialogs, clickEdit, clickControl, clickTop];
document.addEventListener("click", e => { for (const f of CLICKS) if (f(e)) return; });
/* The editor's keys (mdDeskKeys.js: dispatched from this map, and listed by ?). */
const dlgOpen = () => !$("#dlg").hidden && $("#dlg").dataset.first !== "1";
Keys.bind({ id: "close-dialog", short: "Close", scope: "any", keys: ["Escape"], group: "Anywhere", does: "Close the dialog", when: dlgOpen, field: true, run: () => { $("#dlg").hidden = true; $("#dlg").dataset.first = ""; } });
Keys.bind({ id: "undo", short: "Undo", scope: "any", keys: ["Z"], mod: "cmd", group: "Anywhere", does: "Undo", modal: "panel", run: () => cmd("undo") });
Keys.bind({ id: "redo", short: "Redo", scope: "any", keys: ["Z"], mod: "cmd+shift", group: "Anywhere", does: "Redo", modal: "panel", run: () => cmd("redo") });
Keys.bind({ id: "redo-y", short: "Redo", scope: "any", keys: ["Y"], mod: "cmd", group: "Anywhere", does: "Redo", modal: "panel", run: () => cmd("redo") });
Keys.bind({ id: "copy", short: "Copy", scope: "any", keys: ["C"], mod: "cmd", group: "Anywhere", does: "Copy (Pattern: the selected steps, or the track page shown; Kit: the sound; Song: the row)", run: () => secAction("copy") });
Keys.bind({ id: "paste", short: "Paste", scope: "any", keys: ["V"], mod: "cmd", group: "Anywhere", does: "Paste (Pattern: at the selected step, the block from its first step and track)", run: () => secAction("paste") });
Keys.bind({ id: "leave-learn", short: "Leave LEARN", scope: "control", keys: ["Escape"], group: "Anywhere", does: "Leave LEARN", mapping: true, when: () => S.mapping && S.ctl.learn, run: () => toggleLearn() });
Keys.bind({ id: "play-stop", short: "Play / stop", scope: "any", keys: ["Space"], group: "Transport", does: "Play / stop (paused: go on from the step)", run: () => playButton() });
Keys.bind({ id: "record", short: "Record", scope: "any", keys: ["Space"], code: "Space", mod: "alt", group: "Transport", does: "Live recording (RECORD + PLAY): Alt + play, the other Alt that is not \"all\"", run: () => cmd("record") });
["seq", "sound", "mix", "sampler", "song", "control"].forEach((ws, i) => Keys.bind({ id: "workspace-" + (i + 1), scope: "any", keys: [String(i + 1)], group: "Workspaces", does: ["Pattern", "Kit", "Mix", "Sampler", "Song", "Control"][i], mapping: ws === "control", when: ws === "control" ? () => S.mapping : null, run: () => { S.ws = ws; render(); } }));
Keys.bind({ id: "page-prev-next", short: "Page − / Page +", scope: "seq sampler", keys: ["[", "]"], group: "Pattern", does: "Previous / next page", when: () => (S.ws === "seq" || S.ws === "sampler") && pages16() > 1, run: e => { const n = pages16(); S.viewAll = false; S.page = (S.page + (e.key === "]" ? 1 : -1) + n) % n; render(); } });
Keys.bind({ id: "delete", short: "Clear selected / Clear selected", scope: "seq song", keys: ["Delete", "Backspace"], group: "Pattern", does: "Clear the selected steps; with none selected nothing (Clr clears the page shown, ⌥Delete the pattern). Song: delete the row", when: () => (S.ws === "song" || S.ws === "seq") && !V.rec,
	run: () => S.ws === "song" ? songAction("del") : S.stepSel ? secAction("clear") : toast(Modifiers.say("Nothing selected: ⌘-click or ⌘-drag steps first. Clr clears the page shown, ⌥Delete the whole pattern.")) });
Keys.bind({ id: "clear-pattern", short: "Clear pattern / Clear pattern", scope: "seq", keys: ["Delete", "Backspace"], mod: "alt", group: "All", does: "Pattern: clear the whole pattern: every track's trigs and locks", when: () => S.ws === "seq", run: () => clearPattern() });
Keys.bind({ id: "clr-key-all", scope: "any", area: "Top bar", keys: ["CLR"], mod: "alt", group: "All", does: "Click: clear the whole pattern, every track's trigs and locks (one undo step)" });
Keys.bind({ id: "song-row", short: "Row − / Row +", scope: "song", keys: ["ArrowLeft", "ArrowRight"], group: "Song", does: "Previous / next row", when: () => S.ws === "song", run: e => { S.songSel = Math.max(0, Math.min(V.song.length - 1, S.songSel + (e.key === "ArrowRight" ? 1 : -1))); render(); } });
Keys.bind({ id: "step-accent", scope: "seq", area: "Steps", keys: ["step"], mod: "shift", group: "Pattern", does: "Click: accent" });
Keys.bind({ id: "step-slide", scope: "seq", area: "Steps", keys: ["step"], mod: "alt+shift", group: "Pattern", does: "Click: slide" });
Keys.bind({ id: "lane-erase", scope: "seq", area: "Lock lane", keys: ["lock lane"], mod: "alt", group: "Pattern", does: "Drag: erase locks" });
Keys.bind({ id: "lane-clear-all", scope: "seq", area: "Lock lane", keys: ["lock lane clear"], mod: "alt", group: "Pattern", does: "Click: clear every lock of the track (all its parameters)" });
Keys.bind({ id: "value-up-down", short: "Value + / Value −", scope: "any", keys: ["ArrowUp", "ArrowDown"], group: "Values", does: "A focused value, tempo or bar: one step (⇧: fine or ×10)" });
Keys.bind({ id: "value-left-right", short: "Value − / Value +", scope: "any", keys: ["ArrowLeft", "ArrowRight"], group: "Values", does: "A focused value: one step" });
new ResizeObserver(() => redraw()).observe(document.body);
render();
Bridge.ready();
