"use strict";
/* The lane toolbox (Sequence): on the lock lane's title row, shapes and tools for the lane shown. The bar is drawn
   by renderSeq (laneToolsHtml), its clicks are clickLaneTools (the router's, mdDeskRender.js); the state, T, is a
   value of this file (the shape's cycles, the steps' filter, Flat's level), kept across renders.
   Shapes: ramp up, ramp down, triangle, sine, square, decay, random, flat (each press the next level: 50, 75, 100,
   25, 0 %); ×1 ×2 ×4 cycles over the steps shown.
   A click replaces the lane's values; ⌘-click adds the shape (around the middle) to them, ⌥-click subtracts it,
   ⇧-click scales them by it. Hovering a shape previews it on the lane (faint bars).
   Which steps: ALL, every 2nd, 3rd, 4th, or OFF (the offbeats), of the steps shown that hold a trig (a lock needs a
   trig). Tools on the locks there: HUMAN (a little random), scale down / up (towards / away from the middle),
   INV (upside down). Every apply is one undo step (one gesture) of ordinary "lock" commands; a lane that has no lock
   yet needs one of the machine's 64 locked parameters, and when they are all used the apply is refused, as a drawn
   lock is (setLock). The shapes are the xox-plocks lane's (ours, copied; the NUDG half is not: the machine has no
   microtiming). The shapes and the maths are shared/deskLaneShapes.js. */
const LT = { cycles: 1, every: "all", flat: 0 };
const laneFlatTip = () => `Flat at ${LANE_FLAT[LT.flat] * 100} % (each press: the next level)`;
/* the steps the tools act on: shown, able to hold a lock (a trig), and through the filter */
function laneTargets() {
	const tr = V.tracks[S.sel], vis = steps().filter(s => tr.trigs[s]);
	const keep = { all: () => true, "2": (s, k) => k % 2 === 0, "3": (s, k) => k % 3 === 0, "4": (s, k) => k % 4 === 0, off: s => s % 2 === 1 }[LT.every];
	return { vis, list: vis.filter((s, k) => keep(s, k)) };
}
/* a step's lock now, or the lane's own (kit) value */
function laneExisting(s) { const v = V.locks.get(lk(S.sel, S.lane))?.get(s); return v != null ? v : (grp(S.sel, S.lane)[S.lane] ?? 64); }
/* the new value of each target step: [[step, value]]; mode: replace, add, sub, scale (a 0 is a lock like any value) */
function laneShapeValues(id, mode) {
	const { vis, list } = laneTargets(), n = Math.max(1, vis.length);
	return list.map(s => [s, laneMix(mode, laneExisting(s), laneShapeAt(id, vis.indexOf(s) / n * LT.cycles, LT.flat) * 127)]);
}
/* HUMAN, scale down / up, INV on the locked steps (none locked yet: on the lane's own value) */
function laneToolValues(id) {
	const { list } = laneTargets(), m = V.locks.get(lk(S.sel, S.lane));
	const locked = list.filter(s => m && m.has(s)), on = locked.length ? locked : list;
	return on.map(s => [s, laneTool(id, laneExisting(s))]);
}
/* one gesture: every lock written in one undo step; refused whole when the lane needs a 65th locked parameter */
function laneWrite(values) {
	if (V.rec) { toast("The lane tools wait while the machine records live."); return; }
	if (!V.loaded) { toast("The pattern is not loaded yet."); return; }
	if (!values.length) { toast("No step with a trig in that scope: nothing to write."); return; }
	if (pidx(S.sel, S.lane) < 0) return;
	const g = Bridge.gesture();
	for (const [s, v] of values) if (!setLock(S.sel, S.lane, s, v, false, g)) return;
	renderTop(); refreshRow(S.sel); renderLane();
}
const laneModeOf = e => Modifiers.cmd(e) ? "add" : e.altKey ? "sub" : e.shiftKey ? "scale" : "replace";
const laneTitleOf = (name, tip) => `${tip}: click replaces · ${Modifiers.say("⌘")} adds · ${Modifiers.say("⌥")} subtracts · ⇧ scales`;
function laneToolsHtml() {
	const seg = (k, opts) => `<span class="xlseg" data-xg="${k}">${opts.map(([v, l, tip]) => `<button data-xv="${v}" aria-pressed="${String(LT[k]) === String(v)}" title="${tip}">${l}</button>`).join("")}</span>`;
	const ico = (id, tip, d) => `<button class="ico" data-xt="${id}" aria-label="${tip}" title="${tip}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="${d}"/></svg></button>`;
	return `<span class="xlane" role="group" aria-label="Lane shapes and tools">
  <span class="xlseg shapes">${LANE_SHAPES.map(([id, name, , svg]) => `<button data-xs="${id}" aria-label="${name}" title="${laneTitleOf(name, id === "flat" ? laneFlatTip() : name)}"><svg viewBox="0 0 16 16" aria-hidden="true">${svg || laneFlatSvg(LT.flat)}</svg></button>`).join("")}</span>
  ${seg("cycles", [[1, "×1", "One cycle over the steps shown"], [2, "×2", "Two cycles"], [4, "×4", "Four cycles"]])}
  ${seg("every", [["all", "All", "Every step with a trig"], ["2", "/2", "Every 2nd step with a trig"], ["3", "/3", "Every 3rd"], ["4", "/4", "Every 4th"], ["off", "Off", "The offbeats"]])}
  <span class="xlseg tools"><button data-xt="human" title="Human: a little random on each lock">Human</button>${ico("shrink", "Scale down: the locks closer to the middle", "M8 3V13M4 9L8 13L12 9")}${ico("stretch", "Scale up: the locks further from the middle", "M8 13V3M4 7L8 3L12 7")}<button data-xt="invert" title="Inv: the locks upside down">Inv</button></span>
</span>`;
}
/* the preview: a faint bar per step over the lane */
const laneClearPreview = () => $$("#lane .xghost").forEach(x => x.remove());
function lanePreview(values) {
	laneClearPreview();
	for (const [s, v] of values || []) $(`#lane .lb[data-s="${s}"]`)?.insertAdjacentHTML("beforeend", `<b class="xghost" style="--g:${(v / 127).toFixed(3)}"></b>`);
}
function clickLaneTools(e) {
	const sh = e.target.closest(".xlane [data-xs]"), sg = e.target.closest(".xlane [data-xg] [data-xv]"), tl = e.target.closest(".xlane [data-xt]");
	if (!sh && !sg && !tl) return false;
	if (sg) { const k = sg.parentElement.dataset.xg; LT[k] = k === "cycles" ? +sg.dataset.xv : sg.dataset.xv; sg.parentElement.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b === sg)); return true; }
	laneClearPreview();
	if (sh) {
		laneWrite(laneShapeValues(sh.dataset.xs, laneModeOf(e)));
		if (sh.dataset.xs === "flat") { LT.flat = (LT.flat + 1) % LANE_FLAT.length; sh.querySelector("svg").innerHTML = laneFlatSvg(LT.flat); sh.title = laneTitleOf("Flat", laneFlatTip()); }
	} else laneWrite(laneToolValues(tl.dataset.xt));
	return true;
}
/* hover a shape (or a tool): its result, faint, on the lane; Random and Human are not previewed (each apply differs) */
document.addEventListener("pointerover", e => {
	const sh = e.target.closest?.(".xlane [data-xs]"), tl = e.target.closest?.(".xlane [data-xt]");
	if (sh && sh.dataset.xs !== "random") lanePreview(laneShapeValues(sh.dataset.xs, laneModeOf(e)));
	else if (tl && tl.dataset.xt !== "human") lanePreview(laneToolValues(tl.dataset.xt));
});
document.addEventListener("pointerout", e => { if (e.target.closest?.(".xlane [data-xs],.xlane [data-xt]")) laneClearPreview(); });
