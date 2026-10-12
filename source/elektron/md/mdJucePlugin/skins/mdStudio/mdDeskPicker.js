"use strict";
/* The machine picker (the catalogue's machines by family, opened from the Sound page's machine key) and the
   key-style dropdowns (every <select> on the page gets a key and a popup list of keys). */

/* ===== Machine picker (catalogue from the plug-in) =====
   Audition (the machine's EDIT KIT preview, MD manual p.11; doc/modern-ux/DESIGN-machine-menus.md §2): ▶ on a machine key
   (shown on the hovered and the focused one) or Space puts that machine on the track and plays the track's note, so it is
   heard in the kit as it would be kept. Picking a machine (a click, Enter on its key, or KEEP) keeps it; closing the
   picker any other way (Esc, BACK, a click outside) puts the old one back. S.aud is the audition as a value
   {t, g, was, m, live}: its machine edits share one gesture g (one undo step from the machine before), and BACK is the
   Undo of that step while it is still the newest one (live; any other edit ends that and the machine stays). Measured on
   OS 1.63 (doc/modern-ux/PROBES-manual-gaps.md P9): the note right behind the SysEx plays the new machine, and the old
   machine with its values again gives the old sound. */
const FAMS = [["TRX", "Analogue model"], ["EFM", "FM drums"], ["E12", "12-bit samples"], ["PI", "Physical model"], ["GND", "Tone and noise"], ["INP", "External input"], ["MID", "MIDI out"], ["CTR", "Control"], ["ROM", "ROM samples · UW"], ["RAM", "RAM record + play · UW"]];
function machList(f) { return Cat.list.filter(m => famKey(m.machine, Cat) === f).map(m => m.machine); }
function openPicker() {
	const tr = V.tracks[S.sel]; S.pickFam = S.pickFam && S.pickOpenFor === S.sel ? S.pickFam : famKey(tr.m, Cat); S.pickOpenFor = S.sel; drawPicker();
	const pop = $("#machpop"), b = $("#machbtn").getBoundingClientRect(); pop.hidden = false; pop.style.top = (b.bottom + scrollY + 6) + "px"; pop.style.left = Math.max(16, Math.min(b.left + scrollX, innerWidth - pop.offsetWidth - 16)) + "px"; $("#machbtn").setAttribute("aria-expanded", "true"); pop.querySelector(".mk[aria-pressed=true],.mk")?.focus();
}
/* keep: the auditioned machine stays (a pick); otherwise an audition still on puts the old one back */
function closePicker(keep) { const pop = $("#machpop"); if (pop.hidden) return; endAudition(keep === true); pop.hidden = true; $("#machbtn")?.setAttribute("aria-expanded", "false"); if (pendingRender) scheduleRender(); }
function drawPicker() {
	const tr = V.tracks[S.sel], list = machList(S.pickFam), small = list.length > 16;
	$("#machpop").innerHTML = `<div class="mp-fams">${FAMS.map(([f, n]) => `<button class="mf" data-fam="${f}" aria-pressed="${f === S.pickFam}"><i class="led"></i><b>${f === "PI" ? "P-I" : f}</b><span>${n}</span></button>`).join("")}</div>
  <div class="mp-right"><div class="mp-head"><span class="cap">${S.pickFam === "PI" ? "P-I" : S.pickFam} · ${FAMS.find(x => x[0] === S.pickFam)[1]}</span><span class="note">${list.length} machines</span></div>
  <div class="mp-grid ${small ? "small" : ""}">${list.map(m => `<button class="mk${S.aud && S.aud.m === m ? " aud" : ""}" data-mach="${m}" aria-pressed="${m === tr.m}"><b>${codeOf(m, Cat)}</b><span>${small ? "" : nameOf(m, Cat)}</span><i class="mk-play" data-play="${m}" role="button" aria-label="Hear ${m}" title="Hear ${m} on track ${S.sel + 1} (Space). Enter keeps it, Esc puts ${S.aud ? S.aud.was : tr.m} back."></i></button>`).join("")}</div>
  <div class="mp-foot"><div class="mp-prev" id="mpprev">${prevText(tr.m)}</div>
   <button class="mp-keep" id="mpkeep" aria-pressed="${S.keepFx}"><i class="led ${S.keepFx ? "on" : ""}"></i>Keep effects + routing</button></div>
  ${audBar()}</div>`;
}
/* the audition's line under the preview: what plays, on which track, what was there; KEEP and BACK */
function audBar() {
	const a = S.aud; if (!a) return "";
	return `<div class="mp-aud" id="mpaud" role="status"><span>▶ ${a.m} · track ${a.t + 1} · was ${a.was}</span><button class="mp-audk" data-aud-keep><kbd>Enter</kbd>Keep</button><button class="mp-audk" data-aud-back><kbd>Esc</kbd>Back</button></div>`;
}
function prevText(m) { return `<b>${m}</b> ${nameOf(m, Cat)} · ${names(pages(m, Cat).s).join(" ")}`; }
/* the machine edit: an audition's carries its gesture (the whole audition and the pick are one undo step) */
function sendMachine(v, t, g, onDone) {
	const c = Cat.byName[v]; if (!c) return false;
	cmd("machine", { k: V.kit, t, model: c.model, keepFx: S.keepFx, g }, undefined, [[["tracks", t, "m"], v], [["tracks", t, "fam"], famOf(v, Cat)], [["tracks", t, "name"], nameOf(v, Cat)]], onDone);
	return true;
}
function setMachine(v, t = S.sel) {
	if (!Cat.byName[v]) return;
	const a = S.aud && S.aud.t === t ? S.aud : null;
	if (!a || a.m !== v) sendMachine(v, t, a && a.live ? a.g : undefined);
	if (!params(t).includes(S.lane)) S.lane = params(t).includes("FLTF") ? "FLTF" : params(t)[0] || "FLTF";
	closePicker(true); render();
}
/* hear machine v on the selected track: the machine edit (the audition's gesture), then the track's note once the
   plug-in took it (the note never passes the machine's SysEx: mdDeskMachine.cpp, B-014) */
function audition(v) {
	const t = S.sel, tr = V.tracks[t]; if (!Cat.byName[v] || !tr) return;
	/* a new audition from the machine there now: the first, another track's, or after an edit ended the last one's Undo */
	if (!S.aud || S.aud.t !== t || !S.aud.live) S.aud = { t, g: Bridge.gesture(), was: tr.m, m: tr.m, live: true };
	const a = S.aud, play = r => { if (r && !r.ok) return; if (S.aud === a) audNote(t); };
	if (a.m === v) play();
	else { a.m = v; sendMachine(v, t, a.g, play); }
	drawPicker(); focusMach(v);
}
/* the track's note, let go after 400 ms; a machine with no sound of its own says so (the plug-in's words) */
function audNote(t) {
	if (V.rec) { toast("Recording: the audition plays no note (it would record a trig). The machine is on the track."); return; }
	Bridge.send({ op: "noteOn", t, vel: 100, pitch: 0 }, { onResult: r => { if (r && !r.ok && r.errors?.length) toast(r.errors[0]); } });
	clearTimeout(audNote.off); audNote.off = setTimeout(() => Bridge.send({ op: "noteOff", t, pitch: 0 }), 400);
}
/* the audition ends: kept, or the old machine back (Undo of its step while that is the newest; else it stays, said) */
function endAudition(keep) {
	const a = S.aud; if (!a) return; S.aud = null;
	if (keep || a.m === a.was) return;
	if (a.live) cmd("undo");
	else toast(`${a.m} stays on track ${a.t + 1}: another edit came after it. Undo takes it back.`);
}
/* any edit but the audition's own machine edits (and undo, redo) ends its Undo: the machine then stays */
onEditSent((op, args) => { if (S.aud && !(op === "machine" && args.g === S.aud.g)) S.aud.live = false; });
function focusMach(v) { $(`#machpop .mk[data-mach="${v}"]`)?.focus({ preventScroll: true }); }
document.addEventListener("click", e => {
	if (e.target.closest("#machbtn")) { $("#machpop").hidden ? openPicker() : closePicker(); return; }
	const pop = $("#machpop"); if (pop.hidden) return;
	const f = e.target.closest(".mf"); if (f) { S.pickFam = f.dataset.fam; drawPicker(); return; }
	const p = e.target.closest("[data-play]"); if (p) { audition(p.dataset.play); return; }
	if (e.target.closest("[data-aud-keep]")) { const a = S.aud; if (a) setMachine(a.m, a.t); return; }
	if (e.target.closest("[data-aud-back]")) { closePicker(); $("#machbtn")?.focus(); return; }
	const m = e.target.closest(".mk"); if (m) { setMachine(m.dataset.mach); return; }
	if (e.target.closest("#mpkeep")) { S.keepFx = !S.keepFx; drawPicker(); return; }
	if (!e.target.closest("#machpop")) closePicker();
}, true);
document.addEventListener("mouseover", e => { const m = e.target.closest("#machpop .mk"); if (m) $("#mpprev").innerHTML = prevText(m.dataset.mach); });
/* the key with the keyboard focus is marked (kf: its ▶ shows), by the page's own focus, not :focus (a window in the
   background matches no :focus in WebKit) */
document.addEventListener("focusin", e => { $$("#machpop .mk.kf").forEach(k => k.classList.remove("kf")); const m = e.target.closest("#machpop .mk"); if (m) { m.classList.add("kf"); $("#mpprev").innerHTML = prevText(m.dataset.mach); } });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#machpop").hidden) { closePicker(); $("#machbtn")?.focus(); } });
/* the machine Space hears: the focused machine key's; the hovered one's while no other key of the picker has the focus
   (Space on a family key or Keep effects presses that key) */
let hoverMach = null;
document.addEventListener("mouseover", e => { const m = e.target.closest("#machpop .mk"); hoverMach = m ? m.dataset.mach : null; });
function auditionTarget() { const f = document.activeElement; return f?.closest?.("#machpop .mk")?.dataset.mach || (f?.closest?.("#machpop button") ? null : hoverMach); }
/* a key press of Space on a machine key would also click it (pick it): the audition took the press */
document.addEventListener("keyup", e => { if (e.key === " " && e.target.closest?.("#machpop .mk")) e.preventDefault(); }, true);
/* Enter while an audition plays and no key of the picker has the focus: keep it */
document.addEventListener("keydown", e => {
	if (e.key !== "Enter" || !S.aud || $("#machpop").hidden || e.target.closest?.("#machpop button")) return;
	e.preventDefault(); const a = S.aud; setMachine(a.m, a.t);
});
Keys.bind({ id: "picker-audition", short: "Hear", scope: "sound", keys: ["Space"], group: "Machine picker", modal: "machpop",
	does: "In the machine picker: hear the focused (or hovered) machine on the track; Enter keeps it, Esc puts the old one back",
	when: () => !$("#machpop").hidden && !!auditionTarget(), run: () => audition(auditionTarget()) });

/* ===== Key-style dropdowns: every <select> gets a key + a list of keys ===== */
let kFor = null;
function enhanceSelects(root) {
	root.querySelectorAll("select").forEach(sel => {
		if (sel.dataset.k) return; sel.dataset.k = "1"; sel.hidden = true;
		const b = document.createElement("button"); b.className = "kselbtn"; b.type = "button"; b.dataset.for = sel.id; b.setAttribute("aria-haspopup", "listbox"); b.setAttribute("aria-expanded", "false");
		const lab = sel.closest("label"); b.setAttribute("aria-label", (lab ? lab.firstChild.textContent.trim() + ": " : "") + sel.selectedOptions[0]?.text);
		b.innerHTML = `<span>${sel.selectedOptions[0]?.text ?? ""}</span><svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`; sel.after(b);
	});
}
function openK(btn) {
	const sel = document.getElementById(btn.dataset.for); kFor = btn; const pop = $("#kpop"); let n = 0, h = "";
	for (const node of sel.children) { if (node.tagName === "OPTGROUP") { h += `<div class="kgrp">${node.label}</div>`; for (const o of node.children) { h += kopt(o, sel); n++; } } else { h += kopt(node, sel); n++; } }
	const cols = n > 18 ? 3 : n > 9 ? 2 : 1; pop.innerHTML = `<div class="klist" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${h}</div>`;
	pop.hidden = false; pop.style.minWidth = Math.max(btn.offsetWidth, cols * 150) + "px"; placeK(); btn.setAttribute("aria-expanded", "true");
	(pop.querySelector(".kopt[aria-selected=true]") || pop.querySelector(".kopt"))?.focus({ preventScroll: true });
}
/* The popup beside its button, inside the window: below when it fits, else above; neither: the side
   with more room, its height capped (the list scrolls). Fixed to the viewport, placed again on resize
   and scroll. */
function placeK() {
	const pop = $("#kpop"), btn = kFor; if (pop.hidden || !btn) return;
	if (!btn.isConnected) { closeK(); return; }
	const M = 8, G = 4, r = btn.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
	pop.style.position = "fixed"; pop.style.maxHeight = ""; pop.style.overflowY = ""; pop.style.top = "0px"; pop.style.left = "0px";
	const h = pop.offsetHeight, w = pop.offsetWidth, below = vh - r.bottom - G - M, above = r.top - G - M;
	const down = h <= below || (h > above && below >= above);
	if (h > (down ? below : above)) { pop.style.maxHeight = Math.max(80, down ? below : above) + "px"; pop.style.overflowY = "auto"; }
	const hh = pop.offsetHeight;
	pop.style.top = Math.round(down ? r.bottom + G : Math.max(M, r.top - G - hh)) + "px";
	pop.style.left = Math.round(Math.max(M, Math.min(r.left, vw - w - M))) + "px";
}
addEventListener("resize", placeK);
addEventListener("scroll", e => { if (!$("#kpop").contains(e.target)) placeK(); }, true);
function kopt(o, sel) { if (o.hidden) return ""; return `<button class="kopt" role="option" data-v="${o.value}" aria-selected="${o.value === sel.value}"${o.disabled ? ` disabled aria-disabled="true" title="${o.title || "Not available"}"` : ""}>${o.text}</button>`; }
function closeK() { const pop = $("#kpop"); if (pop.hidden) return; pop.hidden = true; kFor?.setAttribute("aria-expanded", "false"); if (pendingRender) scheduleRender(); }
document.addEventListener("click", e => {
	const b = e.target.closest(".kselbtn"); if (b) { const same = kFor === b && !$("#kpop").hidden; closeK(); if (!same) openK(b); return; }
	const o = e.target.closest("#kpop .kopt"); if (o && o.disabled) return; if (o && kFor) { const sel = document.getElementById(kFor.dataset.for); sel.value = o.dataset.v; kFor.querySelector("span").textContent = sel.selectedOptions[0].text; closeK(); kFor.focus(); sel.dispatchEvent(new Event("change", { bubbles: true })); return; }
	if (!e.target.closest("#kpop")) closeK();
}, true);
document.addEventListener("keydown", e => {
	if ($("#kpop").hidden) return; if (e.key === "Escape") { closeK(); kFor?.focus(); return; }
	const opts = [...document.querySelectorAll("#kpop .kopt")], i = opts.indexOf(document.activeElement), d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key]; if (d && opts.length) { e.preventDefault(); opts[(i + d + opts.length) % opts.length].focus(); }
});
