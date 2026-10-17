"use strict";
/* Sequence: the step grid, its ruler and page control, the lock lane and its parameter keys. The grid's and the
   lane's pointer gestures (paint, draw, ramp, the wheel) are mdDeskGestures.js; the GEN bar mdDeskGenUi.js. */

/* ===== Sequence ===== */
function pages16() { return V.len / 16; }
function vis() { if (S.viewAll) return [0, V.len]; S.page = Math.min(S.page, pages16() - 1); return [S.page * 16, S.page * 16 + 16]; }
function steps() { const [a, b] = vis(); return Array.from({ length: b - a }, (_, k) => a + k); }
/* Mockup v51: ALL fits every step (minmax 0, a 2 px gap, class "viewall" on html); the page
   boundary is a 2 px shadow in the cell gap, so the lock lane lines up with the steps. */
function cols() { return S.viewAll ? `repeat(${steps().length},minmax(0,1fr))` : `repeat(${steps().length},minmax(18px,1fr))`; }
function stepCls(i, s) {
	const t = V.tracks[i], c = ["st"]; if (s % 4 === 0) c.push("q"); if (s % 16 === 0 && s !== vis()[0]) c.push("gap"); if (s >= V.length) c.push("past");
	if (t.trigs[s]) { c.push("on"); if (t.acc.has(s)) c.push("acc"); if (t.slide.has(s)) c.push("sl"); if (t.swing.has(s)) c.push("sw"); if (stepLocked(i, s)) c.push("lk"); }
	if (inSel(i, s)) c.push("selx");
	return c.join(" ");	/* the play position is the soft playhead (#phcol), not a class on the cells (B-014) */
}
/* The PAGE control sits on the right, above the grid, on the ruler row. */
/* the step gestures, behind a small ? key at the right of the bar under the grid (a click: the list of keys) */
function stepLegend() {
	const row = (cls, what, how) => `<span>${cls != null ? `<i class="lg on ${cls}"></i>` : `<i class="lg none"></i>`}<b>${what}</b>${how}</span>`;
	return `<span class="steplegend"><button class="glegkey" id="steplegend" aria-label="Step gestures" aria-describedby="steplegpop">?</button><span class="legend glegpop" id="steplegpop" role="tooltip">${row("", "Trig", "click")}${row("acc", "Accent", "shift-click" + (V.accAll ? " (all)" : ""))}${row("sl", "Slide", "alt-shift-click" + (V.slideAll ? " (all)" : ""))}${row(null, "Slide in the lock lane", "drag a lock's dot sideways, or ⇧-drag out of a lock bar, to this parameter's next lock; click the ramp to remove it")}${row("sw", "Swing", "choose Swing in the trig types, then click" + (V.swingAll ? " (all)" : ""))}${row("lk", "Has locks", "a lock on the step")}${row(null, "Select", "⌘-click a step, ⌘-drag steps, or drag in the step numbers; ⌘⇧-click extends; then ⌘C ⌘X ⌘V ⌘D, Delete, Esc. ⌘-drag the selection: a copy")}${row(null, "Menu", "right-click a step: trig, accent, slide, copy, paste, duplicate, clear, fill every 2nd / 4th")}<small>? the keyboard and every gesture</small></span></span>`;
}
/* The trig types (wave 3, DESIGN-machine-menus.md §2): Trig · Accent · Swing · Slide in the bar under the grid say what a
   click on a step paints, as the machine's FUNCTION + B/F, C/G, D/H windows say what its TRIG keys do. The lit key is
   S.tt. With Accent, Swing or Slide: All tracks · This track, the pattern's EDIT ALL for that mark (markMode). Esc goes
   back to Trig. ⇧-click (accent) and ⌥⇧-click (slide) work in any type. A mark needs a trig, as before. */
const TT_MARK = {
	acc: { edit: "accent", set: "acc", all: "accAll", mark: "accent", name: "Accent", fn: "B/F" },
	swg: { edit: "swingStep", set: "swing", all: "swingAll", mark: "swing", name: "Swing", fn: "C/G" },
	sld: { edit: "slide", set: "slide", all: "slideAll", mark: "slide", name: "Slide", fn: "D/H" }
};
function trigTypes() {
	const tt = S.tt || "trig", m = TT_MARK[tt];
	const tip = { trig: "A click paints trigs (Esc comes back here)", acc: "A click paints accent: the machine's FUNCTION + B/F. ⇧-click still paints accent in any type",
		swg: "A click paints swing, the steps the SWG amount delays: the machine's FUNCTION + C/G", sld: "A click paints slide, a lock that glides to the next: the machine's FUNCTION + D/H. ⌥⇧-click still paints slide in any type" };
	const key = (id, name, ic) => `<button class="ttk ${id}" role="radio" data-tt="${id}" aria-checked="${tt === id}" title="${tip[id]}"><i class="lg on ${ic}"></i><span>${name}</span></button>`;
	const all = m ? !!V[m.all] : null;
	return `<span class="gbg ttlegend" id="ttlegend"><span class="gbl">Trig type${m ? `<span class="ttall" role="group" aria-label="EDIT ALL" title="The pattern's EDIT ALL for ${m.name.toLowerCase()} (the machine's FUNCTION + ${m.fn}, then [RIGHT]): one ${m.name.toLowerCase()} row every track takes, or each track's own. Both rows stay in the pattern"><button data-ttall="1" aria-pressed="${all}">All tracks</button><button data-ttall="0" aria-pressed="${!all}">This track</button></span>` : ""}</span>`
		+ `<span class="gbc ttkeys" role="radiogroup" aria-label="What a click on a step paints">${key("trig", "Trig", "")}${key("acc", "Accent", "acc")}${key("swg", "Swing", "sw")}${key("sld", "Slide", "sl")}</span></span>`;
}
/* the view writes of a mark set on one step: every track with a trig there while EDIT ALL is on, else the track's own */
function markWrites(m, i, s, on) {
	const ts = V[m.all] ? V.tracks.map((_, j) => j).filter(j => V.tracks[j].trigs[s]) : [i];
	return ts.map(j => [["tracks", j, m.set, s], on]);
}
/* a mark on one step, set or cleared (a paint's step, a key's click); false when the step has no trig */
function setMark(m, i, s, on) {
	if (!V.tracks[i].trigs[s]) return false;
	cmd(m.edit, { p: V.pat, t: i, s, on }, undefined, markWrites(m, i, s, on));
	if (V[m.all]) V.tracks.forEach((_, j) => refreshRow(j)); else refreshRow(i);
	return true;
}
function setTrigType(tt) { S.tt = tt; document.documentElement.dataset.tt = tt; render(); }
function pageCtl() { return `<span class="pagectl seqpage"><button class="pgkey" id="pgkey" ${pages16() < 2 ? "disabled" : ""} title="Next page. Shift-click = previous. Keys [ and ].">Page</button><span class="pleds" aria-hidden="true">${[0, 1, 2, 3].map(k => `<span class="pl ${k < pages16() ? "" : "na"} ${!S.viewAll && k === S.page ? "cur" : ""}" data-plp="${k}"><i class="led"></i></span>`).join("")}</span><button class="ptog ${S.viewAll ? "on" : ""}" id="pgall" aria-pressed="${S.viewAll}" title="Show all steps"><i class="led"></i>All</button><button class="ptog ${S.follow ? "on" : ""}" id="pgfollow" aria-pressed="${S.follow}" title="Page follows the play position"><i class="led"></i>Fol</button></span>`; }
function renderSeq() {
	document.documentElement.classList.toggle("viewall", !!S.viewAll);
	let h = `<div class="panel ${V.mode === "CLASSIC" ? "classic" : ""}" id="seqp"><div class="scroll" id="seqscroll"><div class="seq" id="seq">
  <div class="r" style="grid-template-columns:${cols()}">${steps().map(s => `<div class="rul ${s % 16 === 0 && s !== vis()[0] ? "gap" : ""}${S.stepSel && s >= S.stepSel.from && s < S.stepSel.to ? " selx" : ""}" data-s="${s}">${s % 4 === 0 ? s + 1 : ""}</div>`).join("")}</div>`;
	V.tracks.forEach((t, i) => { h += `<div class="r ${i === S.sel ? "sel" : ""} ${audible(i) ? "" : "off"}" data-row="${i}" style="grid-template-columns:${cols()};--c:${FAMC[t.fam]}">${steps().map(s => `<button class="${stepCls(i, s)}" data-t="${i}" data-s="${s}" aria-label="Track ${i + 1} step ${s + 1}" aria-pressed="${t.trigs[s]}"></button>`).join("")}</div>`; });
	h += `</div></div><div class="genbar">${trigTypes()}${stepLegend()}${pageCtl()}</div><div class="lanewrap"><div class="lanetop"><span class="cap">Lock lane · ${S.sel + 1} ${V.tracks[S.sel].name} · <b id="lanename">${laneLabel(V.tracks[S.sel].m, S.lane, Cat)}</b> <span class="lanescale">${bipLane() ? "L 64 · centre · R 63" : "0–127"}</span></span><span class="lockbudget" id="lockbudget"></span>${V.mode === "CLASSIC" ? `<span class="warnline" title="Locks stay in the pattern but do nothing until you switch to EXTENDED.">CLASSIC: locks muted</span>` : ""}${laneToolsHtml()}</div>
</div>
  <div class="scroll" id="lanescroll"><div class="lanebox"><div class="lane" id="lane" style="grid-template-columns:${cols()}"></div><svg class="lanesvg" id="lanesvg" aria-hidden="true"></svg></div></div></div>`;
	$("#main").innerHTML = h; renderLane(); syncScroll();
}
/* Mockup v57: bipolar lanes draw from the centre (64): up = right / boost / louder, down = left / cut.
   The machine's signed parameters (manual: displayed -64..+63): PAN, EQG, the RAM-R levels and balances
   MLEV MBAL ILEV IBAL, and the master EQ gains LG HG PG (CTR machines). */
const BIP = SIGNED;
function bipLane() { return BIP.has(S.lane); }
function barHTML(v) { return bipLane() ? (v >= 64 ? `<i class="bp up" style="height:${(v - 64) / 63 * 50}%"></i>` : `<i class="bp dn" style="height:${(64 - v) / 64 * 50}%"></i>`) : `<i style="--f:${(v / 127).toFixed(4)}"></i>`; }
function renderLane() {
	const lane = $("#lane"); if (!lane) return;
	const t = S.sel, tr = V.tracks[t], m = V.locks.get(lk(t, S.lane)), g = grp(t, S.lane), base = g[S.lane] ?? 0;
	altLabels(); syncLockBudget();
	const pg = pages(tr.m, Cat); $("#chips").innerHTML = [["Synth", pg.s], ["Effects", pg.e], ["Routing", pg.r]].map(([lab, ps]) => {
		return `<span class="plab">${lab}</span>` + ps.map(p => {
			if (!p) return `<span class="pk empty"></span>`; const n = V.locks.get(lk(t, p))?.size || 0;
			/* review 1 (B-097): the key says the parameter's name alone (its column says SYNTH, EFFECTS or ROUTING; the
			   full name, SYN·DIST or RTG·DIST, in its tip); the count beside the name, never over it */
			const full = laneLabel(tr.m, p, Cat), plain = full.replace(/^(SYN|RTG|FX)·/, "");
			return `<button class="pk ${n ? "has" : ""}" data-lane="${p}" aria-pressed="${p === S.lane}" aria-label="${full}${n ? ", " + n + " locked" : ""}" title="${full}: ${n ? n + " locked step" + (n > 1 ? "s" : "") : "no locks yet"}"><span class="pkn">${plain}</span>${n ? `<i>${n}</i>` : ""}</button>`;
		}).join("");
	}).join("");
	const ons = steps().filter(s => tr.trigs[s]), last = ons.length ? ons[ons.length - 1] : -1;
	lane.innerHTML = steps().map(s => {
		const on = tr.trigs[s], v = m?.get(s);
		return `<div class="lb ${on ? "" : "none"} ${s % 16 === 0 && s !== vis()[0] ? "gap" : ""} ${V.playing && s === S.step ? "ph" : ""} ${inSel(S.sel, s) ? "vsel" : ""}" data-s="${s}">${on ? `<div class="base" style="--bf:${(base / 127).toFixed(4)}"></div>${bipLane() ? `<div class="mid"></div>` : ""}${v != null ? barHTML(v) + valueHTML(v) : ""}${s === last ? kitLabelHTML(base) : ""}` : ""}</div>`;
	}).join("");
	requestAnimationFrame(drawSlides);
}
/* A slide in the lane (I-054): between the locks of the lane's parameter on steps with a trig, a ramp drawn on top of the bars:
   a translucent fill down to the lane floor, a line from bar top to bar top with a light halo, the starting dot. A step that
   slides, on this track (All tracks: the pattern's slide row, so every track with a trig there), glides to this parameter's
   next lock. While a dot is dragged right the same ramp is dashed (the preview); while Shift is held on a lock bar and the
   pointer is out of its column, a rubber band follows the cursor and a ring marks the only target. Drawn after the lane, in
   an SVG over it that takes no pointer. */
function drawSlides() {
	const svg = $("#lanesvg"), lane = $("#lane"); if (!svg || !lane) return;
	const t = S.sel, tr = V.tracks[t], lm = V.locks.get(lk(t, S.lane)); svg.innerHTML = ""; if (!lm) return;
	const box = lane.getBoundingClientRect(), ink = cssv("--ink") || "#000", hl = cssv("--lcd") || "#fff", pv = Held.as("lane")?.pv;
	const locked = [...lm.keys()].filter(x => tr.trigs[x]).sort((a, b) => a - b);
	const pt = (el, v) => { const r = el.getBoundingClientRect(); return { x: r.left - box.left + r.width / 2, y: slideY(r, v) - box.top, floor: r.bottom - box.top - 3 }; };
	let d = "";
	locked.forEach(s => {
		const prev = pv === s;
		if (!tr.slide.has(s) && !prev) return;
		const nx = locked.find(x => x > s); if (nx == null) return;
		const a = lane.querySelector(`.lb[data-s="${s}"]`), b = lane.querySelector(`.lb[data-s="${nx}"]`); if (!a) return;
		const A = pt(a, lm.get(s)), B = b ? pt(b, lm.get(nx)) : { x: box.width, y: slideY(a.getBoundingClientRect(), lm.get(nx)) - box.top };
		const line = `M${A.x} ${A.y} L${B.x} ${B.y}`, fill = `${line} L${B.x} ${A.floor} L${A.x} ${A.floor} Z`;
		d += `<path d="${fill}" fill="${hl}" fill-opacity=".45"/><path d="${fill}" fill="${ink}" fill-opacity=".18"/><path d="${line}" fill="none" stroke="${hl}" stroke-width="5" stroke-linecap="round"/><path d="${line}" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round"${prev && !tr.slide.has(s) ? ' stroke-dasharray="6 4"' : ""}/><circle cx="${A.x}" cy="${A.y}" r="4" fill="${ink}" stroke="${hl}" stroke-width="1.5"/><circle cx="${B.x}" cy="${B.y}" r="3" fill="${ink}" stroke="${hl}" stroke-width="1.5"/>`;
	});
	const lv = bandLive();
	if (lv) {	/* the rubber band: from the lock to the cursor, a ring on the only target */
		const a = lane.querySelector(`.lb[data-s="${lv.s}"]`);
		if (a) {
			const A = pt(a, lm.get(lv.s)), xc = lv.cur.x - box.left, yc = lv.cur.y - box.top;
			d += `<path d="M${A.x} ${A.y} L${xc} ${yc}" fill="none" stroke="${hl}" stroke-width="5" stroke-linecap="round"/><path d="M${A.x} ${A.y} L${xc} ${yc}" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round"/><circle cx="${A.x}" cy="${A.y}" r="4" fill="${ink}" stroke="${hl}" stroke-width="1.5"/>`;
			const b = lv.nx != null && lane.querySelector(`.lb[data-s="${lv.nx}"]`);
			if (b) { const B = pt(b, lm.get(lv.nx)); d += `<circle cx="${B.x}" cy="${B.y}" r="9" fill="${hl}" fill-opacity=".6" stroke="${ink}" stroke-width="2"/><circle cx="${B.x}" cy="${B.y}" r="3" fill="${ink}"/>`; }
		}
	}
	svg.setAttribute("width", box.width); svg.setAttribute("height", box.height); svg.innerHTML = d;
}
/* I-035: a lock's value as a number at its bar's end (shown on hover and on a selected step) and the kit value on the
   kit line at the lane's right end; both in the form the Kit page shows (a signed parameter: -64 to +63) */
function laneFmt(v) { return BIP.has(S.lane) ? (v - 64 > 0 ? "+" : "") + (v - 64) : String(v); }
/* where a value's bar ends, as a CSS length from the key's bottom, and whether the number sits below it (a bar's
   end near the top, or the down end of a bipolar bar, puts the number inside / below) */
function valueHTML(v) {
	const bip = bipLane(), end = bip ? `calc(50% + ${((v - 64) / (v >= 64 ? 63 : 64) * 50).toFixed(2)}%)` : `calc(3px + (100% - 6px) * ${(v / 127).toFixed(4)})`;
	const below = bip ? v < 64 && v > 6 : v / 127 > .8;
	return `<span class="vl" style="bottom:calc(${end} ${below ? "- 13px" : "+ 1px"})">${laneFmt(v)}</span>`;
}
/* near the top the number sits below the line and left of its key, so it never covers the top of a lock's bar */
function kitLabelCls(base) { return base / 127 > .85 ? "kvl fl" : "kvl"; }
function kitLabelHTML(base) { return `<span class="${kitLabelCls(base)}" style="bottom:${kitLabelAt(base)}">${laneFmt(base)}</span>`; }
function kitLabelAt(base) { const f = base / 127; return `calc(3px + (100% - 6px) * ${f.toFixed(4)} ${f > .85 ? "- 15px" : "+ 3px"})`; }
function syncScroll() { const a = $("#seqscroll"), b = $("#lanescroll"); if (!a || !b) return; a.onscroll = () => { b.scrollLeft = a.scrollLeft; }; b.onscroll = () => { a.scrollLeft = b.scrollLeft; }; }
function refreshRow(i) { $$(`.st[data-t="${i}"]`).forEach(b => { const s = +b.dataset.s; b.className = stepCls(i, s); b.setAttribute("aria-pressed", V.tracks[i].trigs[s]); }); }


/* the Sequence's clicks (the router's, mdDeskRender.js CLICKS): true when the click was theirs */
function clickSteps(e) {
	const st = e.target.closest("#seq .st"); if (!st) return false;
	const i = +st.dataset.t, s = +st.dataset.s, t = V.tracks[i];
	if (!V.loaded) { toast("The pattern is not loaded yet."); return true; }
	/* Live recording: a click plays the track like its TRIG key; the machine records it. */
	if (V.rec) { cmd("recTrig", { t: i }); if (i !== S.sel) select(i); return true; }
	/* a Mac's Ctrl-click is the system's right-click: the step menu (mdDeskSelect.js), not a click */
	if (e.ctrlKey && Modifiers.mac) return true;
	/* ⌘-click selects the step, ⌘⇧ extends the selection (K2): the pointer's select gesture did it; the keyboard's click here */
	if (Modifiers.cmd(e)) {
		if (e.detail === 0 && !e.altKey) setSel(e.shiftKey && S.stepSel ? selExtend(S.stepSel, { t: i, s }) : { t: i, n: 1, from: s, to: s + 1 });
		return true;
	}
	/* a plain mouse click was the paint gesture's (pointerdown); the keyboard's click toggles here */
	if (!e.shiftKey && !e.altKey && e.detail > 0) return true;
	/* ⌥ alone on a step was select until 0.3.3; ⌥ is FUNCTION (every track) now: say where select went */
	if (e.altKey && !e.shiftKey) { toast(Modifiers.say("Select is ⌘-click now (⌘-drag a block); ⌥ means every track. Right-click a step for its menu.")); return true; }
	const m = TT_MARK[S.tt];
	if (m && !e.shiftKey && !e.altKey) { if (!setMark(m, i, s, !t[m.set].has(s))) toast(`A ${m.name.toLowerCase()} needs a trig: step ${s + 1} of track ${i + 1} has none.`); if (i !== S.sel) select(i); return true; }
	if (e.altKey && t.trigs[s]) cmd("slide", { p: V.pat, t: i, s }, undefined, [[["tracks", i, "slide", s], !t.slide.has(s)]]);
	else if (e.shiftKey && t.trigs[s]) cmd("accent", { p: V.pat, t: i, s }, undefined, [[["tracks", i, "acc", s], !t.acc.has(s)]]);
	else {
		const on = !t.trigs[s], w = [[["tracks", i, "trigs", s], on]];
		if (!on) w.push(...trigOffWrites(i, s));
		cmd("trig", { p: V.pat, t: i, s, on }, undefined, w);
		if (!on) renderTop();
	}
	refreshRow(i); if (i !== S.sel) select(i); else renderLane(); return true;
}
function clickLane(e) {
	const ch = e.target.closest("[data-lane]"); if (ch) { S.lane = ch.dataset.lane; render(); return true; }
	if (e.target.closest("#clearLane") && e.altKey) { clearTrackLocks(S.sel); return true; }
	if (e.target.closest("#clearLane")) { const i = pidx(S.sel, S.lane); if (i >= 0) cmd("clearLane", { p: V.pat, t: S.sel, i }, undefined, [[["locks", lk(S.sel, S.lane)], DELETE]]); renderTop(); refreshRow(S.sel); renderLane(); return true; }
	return false;
}
/* the page control (Sequence and the Sampler's RAM steps) and the step gestures' ? key */
function clickPage(e) {
	if (e.target.closest("#steplegend")) { toggleKeys(true); return true; }
	const tk = e.target.closest("#ttlegend [data-tt]"); if (tk) { setTrigType(tk.dataset.tt); return true; }
	const ta = e.target.closest("#ttlegend [data-ttall]"); if (ta) { const m = TT_MARK[S.tt], all = ta.dataset.ttall === "1"; if (m && all !== !!V[m.all]) cmd("markMode", { p: V.pat, mark: m.mark, all }, undefined, [[[m.all], all]]); render(); return true; }
	const pgk2 = e.target.closest("#pgkey"); if (pgk2 && !pgk2.disabled) { const n = pages16(); S.viewAll = false; S.page = (S.page + (e.shiftKey ? -1 : 1) + n) % n; render(); return true; }
	const plp = e.target.closest(".pl[data-plp]"); if (plp && !plp.classList.contains("na")) { S.page = +plp.dataset.plp; S.viewAll = false; render(); return true; }
	if (e.target.closest("#pgall")) { S.viewAll = !S.viewAll; render(); return true; }
	if (e.target.closest("#pgfollow")) { S.follow = !S.follow; render(); return true; }
	return false;
}
Keys.bind({ id: "trig-type", short: "Trig", scope: "seq", keys: ["Escape"], group: "Pattern", does: "Back to Trig after Accent, Swing or Slide: a click on a step paints trigs again",
	when: () => S.ws === "seq" && S.tt !== "trig", run: () => setTrigType("trig") });
