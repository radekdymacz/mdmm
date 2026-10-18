"use strict";
/* The pointer gestures (and the two key runs that are one undo step): each handler begins its own kind of the
   one gesture slot (Held, mdDeskApp.js), replaces it as the pointer moves and ends only its own. What a gesture
   edits is the workspaces' (setLock, setV, sendEditor, songCmd...); here is only how the pointer holds it.
   The kinds that hold the page's renders (interacting(), mdDeskRender.js): value, editor, lane, l2, chop, song,
   paint. */

/* ===== The lock lane: draw (Alt erases), Shift: a ramp ===== */
function laneAt(e, exactValue) {
	const d = Held.as("lane"); if (!d) return;
	/* a slide being drawn (a dot dragged sideways, a Shift rubber band, a press on a ramp): its own, until it hands the press back */
	if (d.slide || d.cut || d.band) { if (slideAt(e)) return; }
	/* a press near the kit line is "maybe": moved more than KIT_MOVE px up or down it is the kit drag, released without
	   that move it was a click on the lane (endLaneDraw) */
	if (d.kit === "maybe") { if (Math.abs(e.clientY - d.y0) <= KIT_MOVE) return; Held.with("lane", { kit: true }); $("#lane").classList.add("kitdrag"); kitAt(e); return; }
	if (d.kit) { kitAt(e); return; }
	if (d.ramp) { rampAt(e); return; }
	const lane = $("#lane"); if (!lane) return; const el = document.elementFromPoint(e.clientX, e.clientY)?.closest(".lb"); if (!el || !lane.contains(el)) return;
	const s = +el.dataset.s, t = S.sel; if (!V.tracks[t].trigs[s]) return; const r = el.getBoundingClientRect(); const v = exactValue ?? clamp(Math.round((r.bottom - 3 - e.clientY) / (r.height - 6) * 127));
	if (d.erase) eraseLock(t, S.lane, s); else if (!setLock(t, S.lane, s, v)) return;
	/* One shape for render and drag (mockup's barHTML): a bipolar bar redraws while it is dragged. */
	el.querySelector("i")?.remove(); if (!d.erase) el.insertAdjacentHTML("beforeend", barHTML(v));
	Held.with("lane", { touched: new Set(d.touched).add(s) }); renderTop();
}
function endLaneDraw() { let d = Held.as("lane"); if (!d) return;
	if (slideEnd()) return;
	d = Held.as("lane");
	/* A click on the kit line locks its exact value. Converting the pointer's rounded pixel position back to
	   0..127 can land one value away at reduced zoom; a drag still follows the pointer normally. */
	if (d.kit === "maybe") { d = Held.with("lane", { kit: false, erase: false, ramp: false, touched: new Set() }); laneAt(d.down, grp(S.sel, S.lane)[S.lane] ?? 0); }
	if (d.ramp) rampSend(); Held.end("lane"); Gesture.end(); $("#lane")?.classList.remove("kitdrag"); refreshRow(S.sel); renderLane(); }

/* ===== A slide drawn in the lock lane (0.8, I-054; the Monomachine lane's gestures, in the Machinedrum's rule). The machine's
   slide is a flag on a step: a parameter locked on that step glides in a straight line to its value on the NEXT TRIG of the
   track and arrives exactly when that trig plays (measured on the firmware, gapProbesFirmwareTest w13slide; the guide's
   "Parameter lock slide"). The value on that trig is its lock of the parameter, or the kit value when it holds none: a lock
   further on is not the target. So the lane draws the ramp from a lock's dot to the next trig's bar top, or to the kit line
   there, and the drag only ever targets that trig. Whether the flag belongs to one track or to the whole pattern (EDIT ALL,
   All tracks) is the trig type's choice, and setMark (mdDeskSeq.js) writes it as the Slide key and ⌥⇧-click do: one slide
   intent. Three gestures, all in the one "lane" slot:
   - slide: a press on the dot of a lock, dragged sideways: a dashed preview ramp, the flag set at the release;
   - band: Shift on a lock bar, dragged out of its column: a rubber band to the cursor, set when it is dropped on the target
     (Esc, a drop elsewhere or left of the start cancels); up and down inside the column stays the Shift ramp of locks;
   - cut: a press on the line of a ramp: a click takes the flag off (every track's, with All tracks).
   Up and down from the dot is the lane's own (the lock's value, or the kit line). ===== */
const DOT_HIT = 8, LINE_HIT = 5, SLIDE_MOVE = 4;
/* the next trig of the track after step s (a lock on a step without a trig is never played), where the glide ends; null at the
   last trig */
function slideNext(t, pid, s) {
	const tr = V.tracks[t];
	for (let x = s + 1; x < Math.min(V.len, tr.trigs.length); x++) if (tr.trigs[x]) return x;
	return null;
}
/* the value the lane's parameter has on a trig: its lock, else the kit value */
function slideVal(t, pid, x) { return V.locks.get(lk(t, pid))?.get(x) ?? grp(t, pid)[pid] ?? 0; }
/* where a lock's bar ends in its key (the bars' scale: 3 px in from the bottom, a bipolar one from the centre) */
function slideY(r, v) { return bipLane() ? r.bottom - r.height * (.5 + (v - 64) / (v >= 64 ? 63 : 64) * .5) : r.bottom - 3 - (r.height - 6) * (v / 127); }
function slidePt(el, v) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: slideY(r, v) }; }
function segDist(p, a, b) { const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy, k = l ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l, 0, 1) : 0; return Math.hypot(p.x - a.x - k * dx, p.y - a.y - k * dy); }
/* the key a press is on (the gap between two keys is the lane itself: the key whose column it is); Alt is erase, never a slide */
function slideKey(e) {
	const lane = $("#lane"); if (e.button !== 0 || e.altKey || !lane || !e.target.closest) return null;
	let el = e.target.closest(".lb");
	if (!el && e.target === lane) el = $$("#lane .lb").find(c => e.clientX < c.getBoundingClientRect().right);
	return el && lane.contains(el) ? el : null;
}
const slideDown = e => ({ button: 0, clientX: e.clientX, clientY: e.clientY, target: e.target, pointerId: e.pointerId, altKey: false, shiftKey: !!e.shiftKey, preventDefault() { } });
/* the lane's own press, replayed from where the slide gesture began (a click, a vertical drag): as if there were no slide */
function slideHandBack(dn, e) {
	if (!dn.shiftKey && kitHit(dn)) Held.begin("lane", { kit: "maybe", y0: dn.clientY, down: { clientX: dn.clientX, clientY: dn.clientY } });
	else { Held.begin("lane", { erase: false, ramp: !!dn.shiftKey, touched: new Set() }); laneAt(dn); }
	if (e) laneAt(e);
}
/* a press: the dot of a lock on a step with a trig, the line of a ramp, or Shift on a lock bar; true when the slide gesture took it */
function slideGrab(e) {
	const el = slideKey(e); if (!el) return false;
	const t = S.sel, tr = V.tracks[t], s0 = +el.dataset.s, lm = V.locks.get(lk(t, S.lane)); if (!lm || pidx(t, S.lane) < 0) return false;
	if (e.shiftKey) {	/* Shift on a lock bar: the slide's rubber band; on any other step Shift is the lane's ramp of locks */
		if (!tr.trigs[s0] || lm.get(s0) == null) return false;
		const r = el.getBoundingClientRect();
		Held.begin("lane", { band: "maybe", s: s0, down: slideDown(e), x0: r.left, x1: r.right }); Gesture.begin(); grabPointer($("#lane"), e); e.preventDefault(); return true;
	}
	const p = { x: e.clientX, y: e.clientY }, v0 = lm.get(s0); let mode = null, s = s0;
	if (tr.trigs[s0] && v0 != null) { const d = slidePt(el, v0); if (Math.hypot(p.x - d.x, p.y - d.y) <= DOT_HIT) mode = "slide"; }
	if (!mode) for (const a of tr.slide) {
		const nx = slideNext(t, S.lane, a), v = lm.get(a), ea = $(`#lane .lb[data-s="${a}"]`), eb = nx == null ? null : $(`#lane .lb[data-s="${nx}"]`);
		if (!ea || !eb || v == null || !tr.trigs[a]) continue;
		const pa = slidePt(ea, v);
		if (segDist(p, pa, slidePt(eb, slideVal(t, S.lane, nx))) <= LINE_HIT && !(a === s0 && tr.trigs[s0] && Math.hypot(p.x - pa.x, p.y - pa.y) <= DOT_HIT)) { mode = "cut"; s = a; break; }
	}
	if (!mode) return false;
	Held.begin("lane", { [mode]: "maybe", s, down: slideDown(e) }); Gesture.begin(); grabPointer($("#lane"), e); e.preventDefault(); return true;
}
/* the rubber band being drawn (the pointer is out of its column, not cancelled), or null */
function bandLive() { const d = Held.as("lane"); return d && d.band === "on" && !d.esc && d.cur && d.cur.x >= d.x0 ? d : null; }
function bandEsc() { const d = Held.as("lane"); if (d && d.band === "on") { Held.with("lane", { esc: true }); drawSlides(); toast("Slide cancelled"); } }
function bandAt(e) {
	let d = Held.as("lane"); const t = S.sel;
	if (d.band === "maybe") {
		const dn = d.down;
		if (e.clientX < d.x0 || e.clientX >= d.x1) d = Held.with("lane", { band: "on" });	/* out of the column sideways: the slide */
		else { if (Math.abs(e.clientY - dn.clientY) <= SLIDE_MOVE) return true; slideHandBack(dn, e); return true; }	/* up and down inside it: the Shift ramp of locks */
	}
	const nx = slideNext(t, S.lane, d.s);
	d = Held.with("lane", { cur: { x: e.clientX, y: e.clientY }, nx });
	if (!d.told && e.clientX >= d.x0) { Held.with("lane", { told: 1 }); toast(nx == null ? "No later trig to slide to" : `Drop on step ${nx + 1}: the next trig, where the glide ends`); }
	drawSlides(); return true;
}
/* true when the event was the slide gesture's; false hands it back to the lane's own paint */
function slideAt(e) {
	let d = Held.as("lane"); const t = S.sel; if (!d) return false;
	if (d.band) return bandAt(e);
	if (d.cut === "maybe" || d.slide === "maybe") {
		const dn = d.down, dx = e.clientX - dn.clientX, dy = e.clientY - dn.clientY;
		if (Math.hypot(dx, dy) <= SLIDE_MOVE) return true;
		if (d.cut === "maybe" || Math.abs(dy) > Math.abs(dx)) { slideHandBack(dn, e); return true; }	/* off the line, or up and down from the dot */
		d = Held.with("lane", { slide: "on" });
	}
	if (d.slide !== "on") return false;
	const nx = slideNext(t, S.lane, d.s), right = e.clientX > d.down.clientX + SLIDE_MOVE, was = d.pv, pv = right && nx != null ? d.s : null;
	if (right && !d.told) { Held.with("lane", { told: 1 }); toast(nx == null ? "No later trig to slide to" : `Slides to step ${nx + 1}: the glide ends on the next trig`); }
	Held.with("lane", { pv });
	if (was !== pv) drawSlides();
	return true;
}
/* the release: true when the slide gesture ended it (a click on the dot, or a vertical drag, is the lane's: handed back, false) */
function slideEnd() {
	const d = Held.as("lane"); if (!d || !(d.slide || d.cut || d.band)) return false;
	const t = S.sel, tr = V.tracks[t];
	const done = () => { Held.end("lane"); Gesture.end(); $("#lane")?.classList.remove("kitdrag"); refreshRow(S.sel); renderLane(); return true; };
	if (d.band === "maybe") { slideHandBack(d.down); return false; }
	if (d.band) {
		const live = bandLive(), nel = live && live.nx != null ? $(`#lane .lb[data-s="${live.nx}"]`) : null, nr = nel?.getBoundingClientRect(),
			hit = !!nr && live.cur.x >= nr.left && live.cur.x < nr.right;
		if (hit && !tr.slide.has(d.s)) setMark(TT_MARK.sld, t, d.s, true);
		return done();
	}
	if (d.slide === "maybe") { slideHandBack(d.down); return false; }
	if (d.cut === "maybe") {
		if (tr.slide.has(d.s)) { setMark(TT_MARK.sld, t, d.s, false); toast(`Slide off on step ${d.s + 1}${V.slideAll ? " (every track: the pattern's slide row)" : ""}: its locked values jump again.`); }
		return done();
	}
	if (d.pv != null && !tr.slide.has(d.s)) setMark(TT_MARK.sld, t, d.s, true);
	return done();
}

/* ===== The lock lane's kit-value line (I-035): grab the line itself (a hit zone of KIT_HIT px each side of it) and
   drag: the kit value of the lane's parameter on the selected track changes, the edit the Kit page's knob makes
   (sendParam), one undo step for the drag. Nothing is locked while it is held. ===== */
const KIT_HIT = 4, KIT_MOVE = 3;
/* the line's y in a step's key (the .base: bottom 3px + (height - 6px) * kit / 127, 2 px thick) */
function kitLineY(r) { const g = grp(S.sel, S.lane); return r.bottom - 3 - (r.height - 6) * ((g[S.lane] ?? 0) / 127) - 1; }
/* the key under the pointer when the pointer is on its kit line, else null */
function kitHit(e) {
	const lane = $("#lane"); if (!lane || !lane.contains(e.target)) return null;
	const el = e.target.closest(".lb"); if (!el || !el.querySelector(".base")) return null;
	return Math.abs(e.clientY - kitLineY(el.getBoundingClientRect())) <= KIT_HIT ? el : null;
}
/* a plain press on the line may begin the drag (Alt erases and Shift ramps: those stay the lane's own) */
function kitGrab(e) {
	if (e.button !== 0 || e.altKey || e.shiftKey || !kitHit(e)) return false;
	Held.begin("lane", { kit: "maybe", y0: e.clientY, down: { clientX: e.clientX, clientY: e.clientY } }); Gesture.begin(); grabPointer($("#lane"), e); e.preventDefault(); return true;
}
function kitAt(e) {
	const el = $("#lane .lb"); if (!el) return; const r = el.getBoundingClientRect(), t = S.sel, g = grp(t, S.lane);
	const v = clamp(Math.round((r.bottom - 3 - e.clientY) / (r.height - 6) * 127));
	if (g[S.lane] === v) return;
	sendParam(t, g === V.tracks[t].syn ? "syn" : g === V.tracks[t].fx ? "fx" : "rt", S.lane, v);
	/* in place: the page's renders wait for the drag (Held) */
	$$("#lane .base").forEach(b => b.style.setProperty("--bf", (v / 127).toFixed(4)));
	const k = $("#lane .kvl"); if (k) { k.textContent = laneFmt(v); k.style.bottom = kitLabelAt(v); k.className = kitLabelCls(v); }
	syncControls(); redraw();
}

/* ===== Song: a palette pad or an arrangement row dragged onto the grid ===== */
document.addEventListener("dragstart", e => {
	const b = e.target.closest(".scell:not(.empty)"), pk = e.target.closest(".padd");
	let d;
	if (b) { d = Held.begin("song", { item: "row", v: +b.dataset.row }); b.classList.add("dragging"); } else if (pk) { d = Held.begin("song", { item: "pat", v: +pk.dataset.addpat }); pk.classList.add("dragging"); } else return;
	e.dataTransfer.effectAllowed = d.item === "row" ? "move" : "copy"; try { e.dataTransfer.setData("text/plain", String(d.v)); } catch (_) { }
});
document.addEventListener("dragover", e => { if (!Held.as("song")) return; const t = dropTarget(e.target); if (!t) return; e.preventDefault(); showTarget(t); });
document.addEventListener("drop", e => {
	const d = Held.as("song"); if (!d) return; const t = dropTarget(e.target); if (!t) return; e.preventDefault();
	if (d.item === "pat") {
		if (V.song.length >= 256) { toast("A song holds 256 rows."); }
		else if (t.mode === "onto" && !V.song[t.i].type) { rowSet(t.i, { ...V.song[t.i], pat: d.v }); S.songSel = t.i; }
		else { const at = t.mode === "onto" ? t.i : V.song.length - 1; songCmd("rowInsert", { i: at, row: rowToContract({ pat: d.v, rep: 1 }, patLen) }); S.songSel = at; }
	}
	else { const from = d.v; let to = t.mode === "onto" ? t.i : V.song.length - 2; if (from !== to && V.song[from].type !== "end") { songCmd("rowMove", { from, to }); S.songSel = to; } }
	Held.end("song"); render();
});
document.addEventListener("dragend", () => { Held.end("song"); showTarget(null); $$(".dragging").forEach(x => x.classList.remove("dragging")); });

/* ===== Sampler: a chop slice's start, dragged up or down ===== */
document.getElementById("main").addEventListener("pointerdown", e => { const c = e.target.closest("[data-cp].on"); if (!c || e.altKey || e.shiftKey) return; const p = +$("#chop").dataset.p, s = +c.dataset.cp, cur = V.locks.get(lk(p, "STRT"))?.get(s) ?? V.tracks[p].syn.STRT; Held.begin("chop", { c, p, s, y: e.clientY, v: cur, moved: false }); Gesture.begin(); grabPointer(c, e); });
document.getElementById("main").addEventListener("pointermove", e => {
	let d = Held.as("chop"); if (!d) return; if (e.buttons === 0 && e.pointerType === "mouse") { Held.end("chop"); Gesture.end(); return; }
	const dv = Math.round((d.y - e.clientY) / 6) * 8; if (!dv && !d.moved) return; d = Held.with("chop", { moved: true });
	const v = clamp(d.v + dv); if (setLock(d.p, "STRT", d.s, v)) { d.c.innerHTML = chopInner(d.p, d.s); renderTop(); redraw(); }
});
document.addEventListener("pointerup", () => { const d = Held.end("chop"); if (d) { d.c.dataset.moved = d.moved ? "1" : ""; Gesture.end(); } });

/* ===== GEN and MUTATE values: dragged up or down (their clicks, wheel and arrows: shared/deskGenBar.js) ===== */
document.addEventListener("pointerdown", e => { const v = e.target.closest(".gv[data-gv]"); if (!v || e.button !== 0) return; Held.begin("gv", { v, y: e.clientY, k: v.dataset.gv, acc: 0 }); delete v.dataset.dragged; grabPointer(v, e); });
/* it ends wherever the button comes up: the bar's redraw drops the pointer capture, so the release can land outside
   the window; a move with no button down, a cancelled pointer and leaving the window end it too (it holds renders) */
function endGv() { const g = Held.end("gv"); if (!g) return; const k = g.k; setTimeout(() => { const n = document.querySelector(`.gv[data-gv="${k}"]`); if (n) delete n.dataset.dragged; }, 0); }
document.addEventListener("pointermove", e => {
	const g = Held.as("gv"); if (!g) return; if (e.buttons === 0 && e.pointerType === "mouse") { endGv(); return; }
	const d = Math.trunc((g.y - e.clientY) / 6) - g.acc; if (!d) return;
	Held.with("gv", { acc: g.acc + d }); g.v.dataset.dragged = "1"; genVal(g.k, d * gvDragStep(g.k));
	/* the bar was drawn again: the value's new element */
	const n = document.querySelector(`.gv[data-gv="${g.k}"]`); if (n) { n.dataset.dragged = "1"; Held.with("gv", { v: n }); }
});
document.addEventListener("pointerup", endGv);
document.addEventListener("pointercancel", endGv);
addEventListener("blur", endGv);

/* ===== Rotate (mdDeskComforts.js): the presses while Alt is down are one run, one undo step ===== */
addEventListener("keyup", e => { if (e.key === "Alt") Held.end("rotate"); }, true);
addEventListener("blur", () => { Held.end("rotate"); });

/* ===== The wheel over a step with a trig moves its lock in the lane's parameter (from the kit value when it has
   none): 4 a notch, Shift 1. A run of notches on one step is one undo step (the slot's "wheel": its step and
   the time of its last notch). Only the vertical wheel (and Shift's sideways one), so a sideways scroll of the
   grid still scrolls. ===== */
const WHEEL_RUN_MS = 700;
let wheelEndT = 0;
$("#main").addEventListener("wheel", e => {
	const st = e.target.closest("#seq .st"); if (!st || S.ws !== "seq") return;
	const t = +st.dataset.t, s = +st.dataset.s, d = e.deltaY || (e.shiftKey ? e.deltaX : 0);
	if (!d || !V.tracks[t].trigs[s] || V.rec || !V.loaded || !params(t).includes(S.lane)) return;
	e.preventDefault();
	if (t !== S.sel) select(t);
	const now = performance.now(), key = t + ":" + s + ":" + S.lane, run = Held.as("wheel");
	const w = !run || run.key !== key || now - run.at > WHEEL_RUN_MS ? Held.begin("wheel", { key, g: Bridge.gesture(), at: now }) : Held.with("wheel", { at: now });
	/* the run ends when the notches stop (it holds the page's renders meanwhile, mdDeskRender.js) */
	clearTimeout(wheelEndT); wheelEndT = setTimeout(() => Held.end("wheel"), WHEEL_RUN_MS);
	const had = V.locks.get(lk(t, S.lane))?.get(s), cur = had ?? grp(t, S.lane)[S.lane] ?? 0, v = clamp(cur + (d < 0 ? 1 : -1) * (e.shiftKey ? 1 : 4));
	if (had != null && v === had) return;
	const ok = setLock(t, S.lane, s, v, false, w.g);
	if (!ok) return;
	renderTop(); refreshRow(t); renderLane();
	toast(`${laneLabel(V.tracks[t].m, S.lane, Cat)} ${v} · track ${t + 1}, step ${s + 1}`);
}, { passive: false });

/* ---- a ramp in the lock lane: Shift-drag draws a straight line from the press to the pointer, shown as it moves;
   at the release every step with a trig under it is locked on the line, one gesture (one undo step). */
function lanePoint(e) {
	const cells = $$("#lane .lb"); if (!cells.length) return null;
	const el = cells.find(c => e.clientX < c.getBoundingClientRect().right) || cells[cells.length - 1], r = el.getBoundingClientRect();
	return { s: +el.dataset.s, v: clamp(Math.round((r.bottom - 3 - e.clientY) / (r.height - 6) * 127)) };
}
function rampPoints() { const d = Held.as("lane"), tr = V.tracks[S.sel]; return d && d.from ? genRamp(d.from.s, d.from.v, d.to.s, d.to.v, s => !!tr.trigs[s]) : []; }
function rampAt(e) {
	const p = lanePoint(e); if (!p) return;
	const d = Held.as("lane");
	Held.with("lane", { from: d.from || p, to: p });
	renderLane();
	for (const [s, v] of rampPoints()) {
		const el = document.querySelector(`#lane .lb[data-s="${s}"]`); if (!el) continue;
		el.querySelector("i")?.remove(); el.insertAdjacentHTML("beforeend", barHTML(v)); el.classList.add("ramp");
	}
}
function rampSend() {
	let first = true;
	for (const [s, v] of rampPoints()) { if (!setLock(S.sel, S.lane, s, v, !first)) break; first = false; }
	renderTop();
}

/* ===== LCD line 2: its values dragged up or down (B-006). SWG and ACC move by their unit (a click without a move
   steps them); LEN, SPD and SONG step through their values, one every 12 px, from where the press found them and
   without wrapping (⌥ held at the press: LEN's inner length, as ⌥-click). A click without a move is still the click's
   step (mdDeskTop.js), a drag's own click is not. One drag, one undo step. ===== */
const L2_DRAG = { len: 12, mult: 12, song: 12 };
document.addEventListener("pointerdown", e => {
	const el = e.target.closest(".l2.ed"); if (!el || e.button !== 0) return; const k = el.dataset.l2;
	if (k === "swing" || k === "accAmt") Held.begin("l2", { k, y: e.clientY, v: V[k], moved: false });
	else if (L2_DRAG[k]) Held.begin("l2", { k, y: e.clientY, v: k === "len" ? (e.altKey ? V.length : V.len) : k === "mult" ? V.mult : V.songSlot, alt: e.altKey, moved: false, stepped: true });
	else return;
	Gesture.begin(); grabPointer(el, e); e.preventDefault();
});
/* a stepped value n steps from where the drag began, clamped to its range */
function l2dragTo(l, n) {
	if (l.k === "len" && l.alt) { const v = clamp(l.v + n, 1, V.len); if (v !== V.length) cmd("length", { p: V.pat, v }, "l2length", [[["length"], v]]); return; }
	if (l.k === "len") { const o = [16, 32, 48, 64], v = o[clamp(o.indexOf(l.v) + n, 0, 3)]; if (v !== V.len) cmd("totalLength", { p: V.pat, v }, "l2total", [[["len"], v]]); return; }
	if (l.k === "mult") { const o = Enums().tempoMultipliers; if (!o.length) return; const v = o[clamp(o.indexOf(l.v) + n, 0, o.length - 1)]; if (v !== V.mult) cmd("speed", { p: V.pat, v }, "l2mult", [[["mult"], v]]); return; }
	if (l.k === "song") { const s = clamp(l.v + n, 0, 31); if (s !== l.at) { Held.with("l2", { at: s }); cmd("selectSong", { s }); } }
}
document.addEventListener("pointermove", e => {
	let l = Held.as("l2"); if (!l) return; if (e.buttons === 0 && e.pointerType === "mouse") { Held.end("l2"); Gesture.end(); return; }
	if (l.stepped) {
		const n = Math.trunc((l.y - e.clientY) / L2_DRAG[l.k]); if (!n && !l.moved) return;
		l = Held.with("l2", { moved: true }); const before = [V.len, V.length, V.mult]; l2dragTo(l, n);
		if (before.join() !== [V.len, V.length, V.mult].join()) renderSub();
		return;
	}
	const d = Math.round((l.y - e.clientY) / (l.k === "swing" ? 3 : 6)); if (d) l = Held.with("l2", { moved: true });
	const before = V[l.k]; l2set(l.k, l.v + d); if (V[l.k] !== before) renderSub();
});
document.addEventListener("pointerup", e => {
	const k = Held.end("l2"); if (!k) return; Gesture.end();
	if (k.stepped) { if (k.moved) { const eat = c => { c.stopPropagation(); c.preventDefault(); }; addEventListener("click", eat, { capture: true, once: true }); setTimeout(() => removeEventListener("click", eat, true), 0); render(); } return; }
	if (!k.moved) l2step(k.k, 1);
});

/* ===== I-022: a value typed (shared/deskValueEdit.js): ⌘-click a value box or fader, or Enter on one that has the focus.
   What may be typed is what the box shows (a signed value as -64 to +63; with a unit, its text too: "1/16", "250 ms").
   One edit, its own gesture: one undo step. ===== */
const ValueBox = {
	range: el => [0, el.dataset.n === "depth" ? 100 : 127],
	shown(el, v) {
		const own = SIGNED.has(el.dataset.n) && el.dataset.g !== "mfx" ? (v - 64 > 0 ? "+" : "") + (v - 64) : String(v);
		const u = el.querySelector(".pu"); return u ? [own, UNITS[u.dataset.unit](v)[0]] : own;
	},
	get: el => getV(el),
	set(el, v) { Gesture.begin(); setV(el, v); Gesture.end(); },
	/* the same box after a render: the same data-g, data-n and the rest */
	find: el => $("#main")?.querySelector(Object.entries(el.dataset).filter(([k]) => ["g", "n", "t", "f", "src", "li"].includes(k)).map(([k, v]) => `[data-${k}="${CSS.escape(v)}"]`).join("")) || null,
	say: t => toast(t)
};

/* ===== Input: a value box or fader ("value"), a curve editor's dot ("editor"), the lock lane ("lane") ===== */
const main = $("#main");
const DRAGS = ["value", "editor", "lane"], dragging = () => DRAGS.some(k => Held.as(k));
main.addEventListener("pointerdown", e => {
	const c = e.target.closest("canvas.ed"); if (c) { const h = nearest(c, e); if (!h) return; Held.begin("editor", { c, k: h.k }); Gesture.begin(); grabPointer(c, e); e.preventDefault(); redraw(); return; }
	const el = e.target.closest(".pc[data-g],.fader[data-g]"); if (el && ValueEdit.isOpenClick(e)) { e.preventDefault(); ValueEdit.open(el, ValueBox); return; }
	if (el) { Held.begin("value", { el, x: e.clientX, y: e.clientY, v: getV(el), vert: el.classList.contains("fader") }); Gesture.begin(); grabPointer(el, e); el.classList.add("act"); e.preventDefault(); return; }
	const lb = e.target.closest(".lb"); if ((lb || e.target.id === "lane") && slideGrab(e)) return;
	if (lb && kitGrab(e)) return;
	if (lb) { Held.begin("lane", { erase: e.altKey, ramp: e.shiftKey && !e.altKey, touched: new Set() }); Gesture.begin(); grabPointer($("#lane"), e); laneAt(e); e.preventDefault(); }
});
main.addEventListener("pointermove", e => {
	if (e.buttons === 0 && e.pointerType === "mouse" && dragging()) { endDrag(); return; }
	const a = Held.as("editor");
	if (a) { const r = a.c.getBoundingClientRect(), h = ED[a.c.dataset.ed].handles(r.width, r.height, a.c).find(h => h.k === a.k); if (h) { sendEditor(a.c, h.drag(clamp(e.clientX - r.left, 0, r.width), clamp(e.clientY - r.top, 0, r.height))); syncControls(); redraw(); } return; }
	/* Mockup v60: a value box follows the axis that moved more (sideways or up/down), one value a pixel. */
	const drag = Held.as("value");
	if (drag) { const fine = e.shiftKey ? .25 : 1, dx = e.clientX - drag.x, dy = drag.y - e.clientY; const d = drag.vert ? dy * 127 / 132 : (Math.abs(dx) >= Math.abs(dy) ? dx : dy); setV(drag.el, drag.v + d * fine); return; }
	if (Held.as("lane")) { laneAt(e); return; }
	const c = e.target.closest("canvas.ed"); if (c && ED[c.dataset.ed]) c.style.cursor = nearest(c, e) ? "grab" : "default";
	/* the kit line is grabbed with a vertical arrow */
	const ln = $("#lane"); if (ln) ln.classList.toggle("kithot", !e.altKey && !e.shiftKey && !!kitHit(e));
});
function endDrag() { if (Held.end("editor")) redraw(); const drag = Held.end("value"); if (drag) drag.el.classList.remove("act"); endLaneDraw(); Gesture.end(); }
/* P7: a gesture ends wherever the button comes up (a pointerup outside #main left the drag on: every later
   mouse move edited the value, and the page waited for the gesture to end before showing the machine again).
   A move with no button down ends it too, and so does leaving the window. */
document.addEventListener("pointerup", endDrag); document.addEventListener("pointercancel", endDrag);
window.addEventListener("blur", () => { if (dragging()) endDrag(); });
/* A gesture ends with any pointer release, wherever it lands. */
document.addEventListener("pointerup", () => setTimeout(() => { if (!interacting()) Gesture.end(); }), true);
main.addEventListener("wheel", e => { const el = e.target.closest(".pc[data-g],.fader[data-g]"); if (!el) return; e.preventDefault(); const d = (e.deltaY || e.deltaX) < 0 ? 1 : -1; setV(el, getV(el) + d * (e.shiftKey ? 10 : 1)); }, { passive: false });
main.addEventListener("dblclick", e => { const el = e.target.closest(".pc[data-g],.fader[data-g]"); if (el && !ValueEdit.isOpenClick(e)) setV(el, el.dataset.n === "VOL" || el.dataset.g === "lev" ? 100 : 64); });
main.addEventListener("keydown", e => { const el = e.target.closest("[data-g]"); if (!el) return; if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.altKey && el.matches(".pc,.fader")) { e.preventDefault(); ValueEdit.open(el, ValueBox); return; } const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 }[e.key]; if (d == null) return; e.preventDefault(); setV(el, getV(el) + d * (e.shiftKey ? 10 : 1)); });

/* ===== Steps: a drag across them paints them (P7): the first step decides (on or off) and every step the pointer
   crosses becomes that, one undo step for the whole drag. A click is a one-step paint. With a trig type other than
   Trig (wave 3) the paint is that mark, on the steps with a trig. ===== */
function paintStep(el) {
	const p = Held.as("paint"); if (!p) return;
	const i = +el.dataset.t, s = +el.dataset.s, t = V.tracks[i], k = i + ":" + s;
	if (p.done.has(k)) return;
	Held.with("paint", { done: new Set(p.done).add(k) });
	/* a trig type other than Trig (mdDeskSeq.js trigTypes): the drag paints that mark on the steps with a trig */
	if (p.mark) { if (t[p.mark.set].has(s) !== p.on) setMark(p.mark, i, s, p.on); return; }
	if (t.trigs[s] === p.on) return;
	const w = [[["tracks", i, "trigs", s], p.on]];
	if (!p.on) w.push(...trigOffWrites(i, s));
	cmd("trig", { p: V.pat, t: i, s, on: p.on }, undefined, w);
	refreshRow(i);
	if (!p.on) Held.with("paint", { locks: true });
}
/* the step the last press on the grid was on, and when: the second click of a double-click on an empty step must not remove the trig the first drew */
let lastPaint = null;
const DBL_MS = 400;
main.addEventListener("pointerdown", e => {
	const st = e.target.closest("#seq .st"); if (!st || e.button !== 0 || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey || V.rec) return;
	if (!V.loaded) { toast("The pattern is not loaded yet."); return; }
	const i = +st.dataset.t, s = +st.dataset.s, mark = TT_MARK[S.tt];
	/* I-036: a plain press on a step that has a trig selects it and keeps the selection (Delete clears it, a double-click removes it, ←/→ move it); no paint starts from it */
	if (!mark && V.tracks[i].trigs[s]) { setSel({ t: i, n: 1, from: s, to: s + 1 }); if (i !== S.sel) select(i); e.preventDefault(); return; }
	lastPaint = { t: i, s, at: Date.now() };
	clearSel();	/* a press on an empty step paints, and ends the selection (DESIGN-step-selection.md §3) */
	if (mark && !V.tracks[i].trigs[s]) { toast(`A ${mark.name.toLowerCase()} needs a trig: step ${s + 1} of track ${i + 1} has none.`); e.preventDefault(); return; }
	Held.begin("paint", { on: mark ? !V.tracks[i][mark.set].has(s) : !V.tracks[i].trigs[s], mark, done: new Set(), first: i });
	Gesture.begin(); grabPointer(main, e); e.preventDefault();
	paintStep(st);
}, true);
/* I-036: a double-click on a trig removes it (the first click selected it): the steps cleared as the selection's Delete does, one undo step */
main.addEventListener("dblclick", e => {
	const st = e.target.closest("#seq .st"); if (!st || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey || V.rec || !V.loaded || TT_MARK[S.tt]) return;
	const i = +st.dataset.t, s = +st.dataset.s; if (!V.tracks[i].trigs[s]) return;
	if (lastPaint && lastPaint.t === i && lastPaint.s === s && Date.now() - lastPaint.at < DBL_MS) return;
	setSel({ t: i, n: 1, from: s, to: s + 1 }); selClear(); clearSel();
	toast(`Removed the trig on track ${i + 1}, step ${s + 1} (⌘Z brings it back).`);
});
main.addEventListener("pointermove", e => {
	if (!Held.as("paint")) return;
	if (e.buttons === 0 && e.pointerType === "mouse") { endPaint(); return; }
	const st = document.elementFromPoint(e.clientX, e.clientY)?.closest("#seq .st"); if (st) paintStep(st);
});
function endPaint() {
	const p = Held.end("paint"); if (!p) return; Gesture.end();
	if (p.locks) renderTop();
	if (p.first !== S.sel) select(p.first); else renderLane();
}
document.addEventListener("pointerup", endPaint); document.addEventListener("pointercancel", endPaint);
window.addEventListener("blur", endPaint);

/* ===== Steps: a selection (DESIGN-step-selection.md, mdDeskSelect.js; on ⌘ since K2, DESIGN-keymap.md). ⌘-press a
   step (Ctrl off a Mac), or press a number of the step ruler: the release decides (selStart says which presses are
   one). No other cell crossed: that one step (⌘⇧ on a step, ⇧ in the ruler, extends the selection to it); cells
   crossed: the block between the press and the release, steps × tracks. A ⌘-press inside a selection of more than one
   step that moves drops a copy of it where it lets go ("drop": its target shown dashed). One slot kind, "select"
   {from: {t, s}, at: {t, s}, ruler, extend, drop, moved}. A press in the workspace outside the grid ends the
   selection. ===== */
function selCell(e, d) {
	const el = document.elementFromPoint(e.clientX, e.clientY);
	const st = el?.closest("#seq .st"); if (st) return { t: +st.dataset.t, s: +st.dataset.s };
	const r = el?.closest("#seq .rul[data-s]"); return r ? { t: d.at.t, s: +r.dataset.s } : null;
}
/* where a dragged selection lands: moved by the drag, within the tracks and the steps shown */
function selDropAt(d) { return StepSel.dropAt(S.stepSel, d, V.len, TRACKS); }
main.addEventListener("pointerdown", e => {
	if (e.button !== 0 || V.rec || S.ws !== "seq") return;
	const st = e.target.closest("#seq .st"), ru = e.target.closest("#seq .rul[data-s]");
	if (!st && !ru) { if (!e.target.closest("#seq")) clearSel(); return; }
	const d = selStart(e, st ? { t: +st.dataset.t, s: +st.dataset.s } : { s: +ru.dataset.s }, !st);
	if (!d) return;
	if (!V.loaded) { toast("The pattern is not loaded yet."); return; }
	Held.begin("select", d);
	e.preventDefault();
}, true);
document.addEventListener("pointermove", e => {
	const d = Held.as("select"); if (!d) return;
	if (e.buttons === 0 && e.pointerType === "mouse") { endSelect(); return; }
	const c = selCell(e, d); if (!c || (c.t === d.at.t && c.s === d.at.s)) return;
	const n = Held.with("select", { at: c, moved: true });
	const w = StepSel.during(n, S.stepSel, V.len, TRACKS);
	if (w.ghost) syncSel(w.ghost); else { S.stepSel = w.sel; syncSel(); }
});
function endSelect() {
	const d = Held.end("select"); if (!d) return;
	if (d.moved) {	/* the drag's own click (it follows the release at once, if at all) is not a click on what it lands on */
		const eat = e => { e.stopPropagation(); e.preventDefault(); };
		addEventListener("click", eat, { capture: true, once: true }); setTimeout(() => removeEventListener("click", eat, true), 0);
	}
	const r = StepSel.end(d, S.stepSel, V.len, TRACKS);
	if (r.drop) { syncSel(); selCopyTo(r.drop.t, r.drop.from); return; }
	const sel = r.sel;
	setSel(sel);
	if (sel.t !== S.sel && sel.n === 1) select(sel.t);
	toast(`Selected ${selSay(sel)} · ⌘C copy · ⌘X cut · ⌘V paste here · ⌘D duplicate · Delete (or Copy, Clr, Paste above) · right-click: more`);
}
document.addEventListener("pointerup", endSelect); document.addEventListener("pointercancel", endSelect);
window.addEventListener("blur", () => { if (Held.as("select")) endSelect(); });

/* ===== BPM: drag up or down, arrows -> global tempo (0x61) ===== */
(() => {
	const b = $("#bpm");
	const set = v => { if (hostTempoRefused()) return; const bpm = clamp(Math.round(v * 10) / 10, 30, 300); cmd("tempo", { bpm }, "tempo", [[["bpm"], bpm]]); renderTop(); };
	/* wave 2, change on release (the TEMPO window's tick, or ⌥ held at the press): the LCD shows the drag, the tempo goes at the release */
	const release = () => { const d = Held.as("bpm"); Held.end("bpm"); if (d && d.late && S.tempoDraft != null) { const v = S.tempoDraft; S.tempoDraft = null; set(v); } else S.tempoDraft = null; Gesture.end(); };
	b.addEventListener("pointerdown", e => { if (hostTempoRefused()) return; Held.begin("bpm", { y: e.clientY, v: V.bpm, late: e.altKey || DeskTransport.delayed() }); Gesture.begin(); grabPointer(b, e); });
	b.addEventListener("pointermove", e => { const d = Held.as("bpm"); if (!d) return; if (e.buttons === 0 && e.pointerType === "mouse") { release(); return; } const v = d.v + (d.y - e.clientY) * (e.shiftKey ? .1 : .5);
		if (d.late) { const t = clamp(Math.round(v * 10) / 10, 30, 300); if (t !== S.tempoDraft) { S.tempoDraft = t; renderTop(); } return; }
		if (Math.abs(v - V.bpm) >= .05) set(v); });
	/* as the GEN values: the release may land outside the button (its capture lost), or never come */
	b.addEventListener("pointerup", () => release());
	document.addEventListener("pointerup", () => { if (Held.as("bpm")) release(); });
	document.addEventListener("pointercancel", () => { if (Held.as("bpm")) release(); });
	document.addEventListener("pointermove", e => { if (Held.as("bpm") && e.buttons === 0 && e.pointerType === "mouse") release(); });
	addEventListener("blur", () => { if (Held.as("bpm")) release(); });
	b.addEventListener("keydown", e => { const k = { ArrowUp: 1, ArrowDown: -1 }[e.key]; if (!k) return; e.preventDefault(); set(V.bpm + k * (e.shiftKey ? .1 : 1)); });
})();
