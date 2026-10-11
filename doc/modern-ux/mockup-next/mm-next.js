"use strict";
/* Monomachine review mockup: DESIGN-machine-menus.md on top of the approved MM mockup (mm-mockup, built page copied).
   The header stays; it gains one key, GLOBAL (the MM has none today). The rest: the ▾ "what" on COPY CLR PASTE, the
   play key's pause and panic, the TEMPO popover, the GLOBAL page (settings only), Export / Import SysEx in the existing panel, Reset machine…, the song slots on the
   Song workspace, STEP recording and the step menu on the roll, the track menu, B-026's "Set channels…". Example data. */
(() => {
const { $, $$, esc } = NX;
const nn2 = i => String(i + 1).padStart(2, "0");

/* ================= header (unchanged): the ▾, the play key, tempo click ================= */
$("#globkey").title = "GLOBAL: the machine's own settings, as a full page. GLOBAL again or Esc goes back";
$(".lcdsec").insertAdjacentHTML("beforeend", `<button class="secmore nx" data-nxsec="more" aria-haspopup="menu" title="Copy… / Clear… / Paste… what (the machine's SUPER COPY / SUPER CLEAR)">▾</button>`);
$("#play").title = "Play / stop (Space). ⇧-click: pause, ▶ again continues (⇧Space). Right-click: pause, panic";
NX.mark($("#play").closest(".lcdt"), true);
$("#rec").title += " ⇧-click: STEP recording (stopped): a cursor on the roll, each played note writes and moves on.";
$("#bpm").title = "Click: the TEMPO window. Drag up or down: tempo; ⌥-drag: change on release";
NX.mark($("#bpm").closest(".f"), true);

/* the "what" ticks, grouped by where the data lives: the pattern or the kit */
const WHAT = {
	copy: { go: "Copy", pat: [["Notes", "14", 1], ["Melody", "pitches", 0], ["Slide", "3", 1], ["Swing", "16", 1], ["Locks", "9", 1], ["Arp", "", 0], ["Transpose", "", 0]], kit: [["Machine + sound", "", 0]] },
	paste: { go: "Paste into 2 tracks", pat: [["Notes", "14", 1], ["Melody", "pitches", 0], ["Slide", "3", 1], ["Swing", "16", 1], ["Locks", "9", 1], ["Arp", "", 0], ["Transpose", "", 0]], kit: [["Machine + sound", "", 0]] },
	clear: { go: "Clear", pat: [["Notes", "14", 0], ["Melody", "", 0], ["Slide", "3", 0], ["Swing", "16", 0], ["Locks", "9", 1], ["Arp", "back to OFF", 1], ["Transpose", "", 0]], kit: [["Machine + sound", "", 0]] }
};
const tName = t => (typeof tLabel === "function" ? tLabel(t) : "T" + (t + 1)) + " " + trk(t).m;
function what(verb) {
	const t = S.sel, w = WHAT[verb];
	const it = l => l.map(([label, n, on]) => ({ label, n, on }));
	NX.whatOpen({ verb, go: w.go, src: tName(t), srcNote: verb === "paste" ? "copied from T1 · pattern A01" : `pattern ${patName(S.pat)} · all steps`,
		groups: [{ name: "Pattern", note: patName(S.pat), items: it(w.pat) }, { name: "Kit", note: "K" + String(S.kit + 1).padStart(2, "0"), items: it(w.kit) }],
		to: verb === "paste" ? S.tracks.map((x, i) => ({ label: "T" + (i + 1), name: x.m, on: i === 2 || i === 3 })) : null,
		fine: verb === "clear" ? "Ticks are remembered. The machine's SUPER CLEAR." : verb === "copy" ? "Ticks are remembered. The machine's SUPER COPY." : "Ticks are remembered. Pastes into every lit track.",
		done: () => toast(`${w.go}: done (example).`) });
}
function whatMenu(el) {
	NX.menuAt(el, [{ label: "Copy…", key: "⌘⇧C", run: () => what("copy") }, { label: "Paste…", key: "⌘⇧V", run: () => what("paste") },
		{ label: "Clear…", key: "⌘⇧⌫", run: () => what("clear") }, "-", { note: "Choose what: notes, melody, locks, slide, swing, arp, transpose, sound" }], "Copy / clear / paste what", -150, 0);
}
function pause() {
	if (!S.playing) return; const pos = $("#pos").textContent; togglePlay(); $("#pos").textContent = pos;
	S.nxPaused = true; $("#play").classList.add("paused"); $("#play").setAttribute("aria-pressed", "true");
	toast(`Paused at ${pos}. ▶ or ⇧Space continues from here.`);
}
function cont() { S.nxPaused = false; $("#play").classList.remove("paused"); togglePlay(); }
function playMenu(x, y) {
	DeskMenu.open([{ label: S.playing ? "Stop" : "Play", key: "Space", run: () => togglePlay() },
		{ label: S.nxPaused ? "Continue" : "Pause", key: "⇧Space", enabled: S.playing || !!S.nxPaused, run: () => S.nxPaused ? cont() : pause() },
		{ label: "Live record", key: "⌥Space", run: () => {} }, { label: "Step record", key: "⇧-click ●", run: () => stepOn() }, "-",
		{ label: "Panic: all voices off", key: "⌘.", run: () => toast("Panic: CC 120 on each track channel.") }], x, y, { title: "Transport" });
}

/* ================= STEP recording on the roll ================= */
const STEP = { on: false, s: 6 };
function stepOn() { if (S.playing) togglePlay(); STEP.on = true; if (S.ws !== "seq") S.ws = "seq"; render(); }
function stepOff() { STEP.on = false; render(); }
function stepDraw() {
	const rec = $("#rec"); rec.classList.toggle("step", STEP.on);
	rec.innerHTML = STEP.on ? `<i class="led on" id="recled"></i>●<span class="stepm">STEP</span>` : `<i class="led" id="recled"></i>●`;
	$(".steprec")?.remove(); $$(".stepcur").forEach(x => x.remove());
	if (!STEP.on || S.ws !== "seq") return;
	const lane = $(".nlane.big"), ru = $(`#seq .ruler .rul[data-s="${STEP.s}"]`); if (!lane || !ru) return;
	lane.style.position = "relative";
	const lr = lane.getBoundingClientRect(), r = ru.getBoundingClientRect();
	lane.insertAdjacentHTML("beforeend", `<div class="stepcur" data-l="STEP ${String(STEP.s + 1).padStart(2, "0")}" style="left:${r.left - lr.left - 1}px;top:0;width:${r.width + 2}px;height:${lr.height}px"></div>`);
	$("#seqscroll")?.insertAdjacentHTML("beforebegin", `<div class="steprec nx"><span>● STEP RECORDING · ${esc(tName(S.sel))} · step ${STEP.s + 1}: play a note to write it</span><kbd>→</kbd> rest <kbd>←</kbd> back <kbd>⌫</kbd> clear step <kbd>Esc</kbd> done</div>`);
}


/* ================= Sequence: the trig-type selector above the roll (NOTE · SLIDE · SWING) ================= */
/* The MM keeps slide and swing per track (no EDIT ALL, 1-65 / 1-66), so there is no All tracks | This track toggle. */
const TT = { type: "note" };
const TTN = [["note", "Note", ""], ["sld", "Slide", ""], ["swg", "Swing", ""]];
function ttSetOf(k) { const tr = trk(S.sel); return k === "sld" ? tr.slide : tr.swing; }
function ttMarks() {
	const lane = $(".nlane.big"); if (!lane) return; lane.style.position = "relative"; lane.querySelectorAll(".rollmk").forEach(x => x.remove());
	const lr = lane.getBoundingClientRect(), tr = trk(S.sel);
	for (const [k, set] of [["sld", tr.slide], ["swg", tr.swing]]) for (const st of set) {
		const ru = $(`#seq .ruler .rul[data-s="${st}"]`); if (!ru) continue; const r = ru.getBoundingClientRect();
		lane.insertAdjacentHTML("beforeend", `<i class="rollmk ${k}" style="left:${r.left - lr.left + (k === "swg" ? r.width / 2 + 1 : 2)}px;width:${Math.min(11, r.width / 2 - 3)}px"></i>`);
	}
}
function ttRow() {
	$(".ttrow")?.remove(); const tl = $("#tlanes"); if (!tl || S.ws !== "seq") return;
	tl.insertAdjacentHTML("afterend", `<div class="ttrow ttunder nx"><span class="ttkeys" role="radiogroup" aria-label="What a click paints">${TTN.map(([id, n]) => `<button class="ttk ${id === "note" ? "trig" : id}" role="radio" data-tt="${id}" aria-checked="${TT.type === id}" title="${id === "note" ? "A click writes notes (Esc comes back here)" : `A click on a step paints ${n.toLowerCase()} for ${tName(S.sel)}`}"><i class="led"></i><span>${n}</span><em class="ttm"></em></button>`).join("")}</span>
		<span class="note">Click a step's column to paint slide / swing · Esc: Note</span></div>`);
	document.documentElement.dataset.tt = TT.type;
	requestAnimationFrame(ttMarks);
}
let ttPaint = null;
function ttStepAt(x) { for (const ru of $$("#seq .ruler .rul[data-s]")) { const r = ru.getBoundingClientRect(); if (x >= r.left && x <= r.right) return +ru.dataset.s; } return null; }
function ttAt(e) { const s = ttStepAt(e.clientX); if (s == null || ttPaint.done.has(s)) return; ttPaint.done.add(s); const set = ttSetOf(TT.type); if (ttPaint.on == null) ttPaint.on = !set.has(s); ttPaint.on ? set.add(s) : set.delete(s); ttMarks(); }
addEventListener("pointerdown", e => { if (TT.type === "note" || !e.target.closest?.(".nlane.big") || e.button !== 0) return; e.preventDefault(); e.stopImmediatePropagation(); ttPaint = { on: null, done: new Set() }; ttAt(e); }, true);
addEventListener("pointermove", e => {
	if (ttPaint) ttAt(e);
	const lane = TT.type !== "note" && e.target.closest?.(".nlane.big"); const col = $(".rollcol");
	if (!lane) { col?.remove(); return; }
	const st = ttStepAt(e.clientX), ru = st != null && $(`#seq .ruler .rul[data-s="${st}"]`); if (!ru) { col?.remove(); return; }
	const lr = lane.getBoundingClientRect(), r = ru.getBoundingClientRect(), el = col || (lane.insertAdjacentHTML("beforeend", `<i class="rollcol"></i>`), $(".rollcol"));
	el.style.left = (r.left - lr.left) + "px"; el.style.width = r.width + "px";
}, true);
addEventListener("pointerup", () => { if (ttPaint) { ttPaint = null; rerenderSeq(); } }, true);
document.addEventListener("click", e => { const k = e.target.closest("[data-tt]"); if (k) { TT.type = k.dataset.tt; render(); } });

/* ================= events ================= */
addEventListener("click", e => {
	const p = e.target.closest?.("#play");
	if (p && (e.shiftKey || S.nxPaused)) { e.preventDefault(); e.stopImmediatePropagation(); S.nxPaused ? cont() : pause(); return; }
	if (e.target.closest?.("#rec") && (e.shiftKey || STEP.on)) { e.preventDefault(); e.stopImmediatePropagation(); STEP.on ? stepOff() : stepOn(); return; }
	const m = e.target.closest?.("[data-nxsec]"); if (m) { e.preventDefault(); e.stopImmediatePropagation(); whatMenu(m); return; }
	if (e.target.closest?.("#globkey")) { e.preventDefault(); e.stopImmediatePropagation(); G.open ? gClose() : gOpen(); return; }
	if (G.open && e.target.closest?.("#tabs button")) gClose(false);
}, true);
addEventListener("contextmenu", e => {
	if (e.target.closest?.("#play")) { e.preventDefault(); e.stopImmediatePropagation(); playMenu(e.clientX, e.clientY); return; }
}, true);
addEventListener("keydown", e => {
	if (e.target.closest?.("input,select,textarea")) return;
	if (e.key === " " && e.shiftKey && !e.metaKey && !e.altKey) { e.preventDefault(); e.stopImmediatePropagation(); S.nxPaused ? cont() : pause(); return; }
	if (e.key === "Escape" && TT.type !== "note" && !STEP.on && !G.open && (typeof Modal === "undefined" || !Modal.top())) { e.preventDefault(); e.stopImmediatePropagation(); TT.type = "note"; render(); return; }
	if (STEP.on && (typeof Modal === "undefined" || !Modal.top())) {
		if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); stepOff(); return; }
		if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); e.stopImmediatePropagation(); STEP.s = Math.max(0, Math.min(S.len - 1, STEP.s + (e.key === "ArrowRight" ? 1 : -1))); render(); return; }
	}
	if (G.open && e.key === "Escape" && (typeof Modal === "undefined" || !Modal.top())) { e.preventDefault(); e.stopImmediatePropagation(); gClose(); }
}, true);
(() => { const b = $("#bpm"); let d = null;
	b.addEventListener("pointerdown", e => { d = { x: e.clientX, y: e.clientY }; }, true);
	b.addEventListener("pointerup", e => { if (d && Math.abs(e.clientY - d.y) < 3 && Math.abs(e.clientX - d.x) < 3) setTimeout(tempo, 0); d = null; }, true); })();
function tempo() { NX.tempoOpen({ tapTitle: "Tap the tempo (as today: B, Shift+B on Sequence)", extra: `<div class="tr"><span class="ilab">Sync</span><span class="seg"><button aria-pressed="true">INT</button><button aria-pressed="false">EXT</button></span><button data-tp="glob" style="margin-left:auto" title="GLOBAL › SYNC">Sync in GLOBAL →</button></div>`,
	onClick: a => { if (a === "glob") { NX.tempoClose(); gOpen(); } } }); }


/* ================= the engine menu: Import / Export SysEx…, Reset machine… ; the SysEx panel ================= */
function syxExport(o = {}) {
	NX.syxExport({ all: o.all, sumAll: "Full backup: 128 kits, 128 patterns, 24 songs, 8 globals · about 760 KB", model: "Monomachine", sum: "8 kits, 8 patterns, 3 songs · about 74 KB. Over HW MIDI the machine sends what you ask on its SYSEX SEND.", kinds: [
		{ id: "kit", label: "Kits", from: "K001", to: "K008", sub: "8 used of 128", on: true }, { id: "pattern", label: "Patterns", from: "A01", to: "A08", sub: "8 used of 128", on: true },
		{ id: "song", label: "Songs", from: "S01", to: "S03", sub: "3 used of 24", on: true }, { id: "global", label: "Globals", from: "G1", to: "G1", sub: "the active one, or 1–8", on: false },
		{ id: "wave", label: "Waveforms", from: "W01", to: "W12", sub: "DigiPRO user waveforms, MKII", on: false, dis: true, tag: "after probe P4" }] });
}
function resetAsk() {
	ask(`<b>Reset machine</b> (the machine's start-up menu, hold FUNCTION at power on).<br><br><b>Empty reset</b> clears every kit, pattern and song. It asks a second time.<br>Factory reset is not offered: the MM's factory data is not in the editor.<br><br>Export SysEx… first keeps a way back.`,
		[["Empty reset…", "danger", () => toast("It asks a second time (example).")], ["Cancel", "cream", () => {}]]);
}
NX.engineItems([["import", "IMPORT SYSEX…", () => Syx.host.choose()], ["export", "EXPORT SYSEX…", syxExport], ["reset", "RESET MACHINE…", resetAsk]]);
Syx.host.exportAll = syxExport;
NX.syxPlace((k, n) => k === "pattern" ? "ABCDEFGH"[n >> 4] + String((n & 15) + 1).padStart(2, "0") : ({ kit: "K", song: "S", global: "G" })[k] + (k === "global" ? n + 1 : String(n + 1).padStart(k === "kit" ? 3 : 2, "0")));

/* ================= the GLOBAL page (settings only), Export / Import SysEx in the existing panel, Reset machine… ================= */
const G = { open: false, tune: 440.0, flash: null };
const wsName = () => ({ seq: "Sequence", sound: "Sound", mix: "Mix", perform: "Perform", song: "Song", control: "Control" })[S.ws] || "the page";
/* today's shared GLOBAL panel (deskGlobal.js + 117-global.js) drawn as a page: its slots, Reset to defaults and cards
   as they are; new: Copy / Paste / Clear beside the slots, and the AUDIO card (master tune), which the panel lacks */
function gDraw() {
	if (!G.open) return;
	$("#body").className = "body full ws-global"; $("#rail").hidden = true;
	$("#main").innerHTML = NX.gpHtml({ ws: wsName(), extra: () => `<section class="card nx"><header><h3>Audio</h3><span>the machine's outputs</span></header>
		${GlobalUi.row("Master tune", `<span class="stepper" title="430.0–450.0 Hz, the pitch of A (the global's masterTune). Drag, wheel or click ± as other values">${""}<button data-gt="-1" aria-label="Lower">−</button><b class="mono">${G.tune.toFixed(1)} Hz</b><button data-gt="1" aria-label="Higher">+</button></span>`)}</section>` });
	if (typeof enhanceSelects === "function") enhanceSelects($("#main"));
	$("#globkey").setAttribute("aria-pressed", "true"); $("#globkey .led")?.classList.add("on");
}
function gOpen(flash) { if (LIB.open) closeLib(false); G.open = true; G.flash = flash || null; gDraw(); }
function gClose(rerender = true) { G.open = false; $("#globkey").setAttribute("aria-pressed", "false"); $("#globkey .led")?.classList.remove("on"); if (rerender) render(); }
const origDrawGlobal = drawGlobal;
window.openGlobal = () => G.open ? gClose() : gOpen();
window.closeGlobal = () => { if (G.open) gClose(); else origDrawGlobal(); };
window.drawGlobal = () => { if (G.open) gDraw(); else origDrawGlobal(); };
NX.gpEvents(() => G.open, gDraw, k => { if (k === "close") gClose(); else toast("Example only."); });
document.addEventListener("click", e => { const t = G.open && e.target.closest("#main [data-gt]"); if (t) { G.tune = Math.max(430, Math.min(450, G.tune + +t.dataset.gt * .5)); gDraw(); } });

const origRe = rerenderSeq; window.rerenderSeq = function () { origRe.apply(this, arguments); if (!G.open && S.ws === "seq") { $(".ttrow")?.remove(); $(".steprec")?.remove(); ttRow(); stepDraw(); } };
const origPage = renderPage;
window.renderPage = function () { origPage.apply(this, arguments); if (G.open) gDraw(); else { ttRow(); stepDraw(); } };


/* ================= Song: the 24 song slots column ================= */
const SONGN = ["MONO SONG", "ACID LIVE", "VOCODER JAM", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""];
const SG = { sel: 0, cur: 0 };
function songCol() {
	const slots = SONGN.map((nm, i) => `<button class="ls ss${nm ? "" : " empty"}${i === SG.cur ? " cur" : ""}" data-ss="${i}" aria-selected="${i === SG.sel}"><span class="lsh"><b>${nn2(i)}</b>${i === SG.cur ? `<em><i class="led on"></i>ed</em>` : ""}</span><span class="lsn">${nm || "EMPTY"}</span><span class="lsl">${nm ? [12, 20, 7][i] + " rows" : ""}</span></button>`).join("");
	return `<aside class="songlib card nx"><header><h3>Songs</h3><span>24 slots</span></header>
		<div class="sltop"><span class="lcdchip">${nn2(SG.cur)} ${esc(SONGN[SG.cur])} · edited</span></div>
		<div class="slacts"><span class="sgrp"><button data-sa="load" title="LOAD SONG (stopped) (Enter)">Load</button><button class="cream" data-sa="save" title="SAVE SONG (0x6D) with its name">Save</button><button data-sa="saveas"${SG.sel === SG.cur ? " disabled" : ""} title="${SG.sel === SG.cur ? "The selected slot is the current song: SAVE stores it" : "SAVE SONG into slot " + nn2(SG.sel)}">Save to…</button></span><span class="sgrp"><button data-sa="copy">Copy</button><button data-sa="paste">Paste</button><button class="danger" data-sa="clear">Clear</button><button data-sa="rename" title="F2 or double-click">Rename</button></span></div>
		<div class="libgrid songs">${slots}</div>
		<div class="slfoot note">Replaces the song picker of the Song card. Writes go through SYSEX RECV (hardware: SEND n).</div></aside>`;
}
SG.mode = "song";
const MODES = [["pattern", "Pattern", "A pad click goes to that pattern (queued; ⇧-click now). The machine plays patterns."], ["chain", "Chain", "Pad clicks build the machine's chain: one bank, the numbers show the order, it loops."], ["song", "Song", "A pad click adds a row after the selected row. The machine plays the song."]];
const origSong = renderSong; window.renderSong = function () {
	const m = SG.mode; S.songPick = m === "chain" ? "chain" : "arrange"; if (!HOST.seqMode) S.plays.songMode = m === "song";
	origSong.apply(this, arguments);
	const ui = $("#main .songui"); if (!ui) return; ui.classList.add("withlib"); ui.insertAdjacentHTML("afterbegin", songCol());
	ui.querySelector(".whatplays")?.remove(); const sc = ui.querySelector(".songslot"); if (sc) sc.hidden = true;
	const pal = ui.querySelector(".pgridp")?.closest("section"), info = MODES.find(x => x[0] === m);
	if (pal) {
		pal.querySelector(".phead").innerHTML = `<div class="pmodekeys nx" role="radiogroup" aria-label="What the machine plays, and what a pad click does">${MODES.map(([k, n]) => `<button class="pkey" role="radio" data-pm="${k}" aria-checked="${m === k}"><i class="led"></i><span>${n}</span></button>`).join("")}<span class="note">what plays, what a pad click does</span></div>`;
		if (m === "pattern") pal.querySelectorAll("[data-addpat]").forEach(b => { const p = +b.dataset.addpat; b.dataset.patgo = p; b.removeAttribute("data-addpat"); b.draggable = false; b.title = `${patName(p)}: click queues it (⇧-click: now)`; b.classList.toggle("cur", p === S.pat); });
		const pn = pal.querySelector(".pnote"); if (pn) pn.remove();
		if (m === "chain") pal.querySelector(".chainfoot")?.insertAdjacentHTML("afterbegin", `<div class="irow"><span class="ilab">Plays</span><span class="lcdchip">${esc(playsText())}</span></div>`);
		if (m !== "chain") pal.insertAdjacentHTML("beforeend", `<p class="note pnote nx">${info[2]}</p>`);
		pal.querySelectorAll(".chainacts + .note, .chainacts ~ .note").forEach(n => n.textContent = "Pads chain at once: one bank, each pattern once.");
		pal.querySelectorAll(".chainfoot > .irow").forEach(r => { if (!r.querySelector(".chainacts,.lcdchip,.chainrow")) r.remove(); });
	}
	if (m !== "song") { const insp = ui.querySelector(".insp")?.closest("section"); if (insp) insp.hidden = true; }
	const acts = ui.querySelector(".rowacts"); if (acts) acts.insertAdjacentHTML("afterbegin", `<button class="nx" data-pfrom="1" title="Play the song from this row (Enter). After probe P1">▶ From here</button>`);
};
document.addEventListener("click", e => {
	const m = e.target.closest("[data-pm]"); if (m) { SG.mode = m.dataset.pm; render(); return; }
	const g = e.target.closest("[data-patgo]"); if (g) { goPattern(+g.dataset.patgo, e.shiftKey); render(); }
});
document.addEventListener("click", e => {
	const s = e.target.closest("[data-ss]"); if (s) { SG.sel = +s.dataset.ss; render(); return; }
	const a = e.target.closest("[data-sa]"); if (a) { if (a.dataset.sa === "load") { SG.cur = SG.sel; render(); } toast("Example only."); return; }
	if (e.target.closest("[data-pfrom]")) toast(`Plays the song from row ${String(S.songSel + 1).padStart(3, "0")}.`);
});

/* ================= the review states ================= */
const ws = w => { if (G.open) gClose(false); STEP.on = false; if (S.ws !== w) { S.ws = w; } render(); };
const at = (sel, dx = 0, dy = 0) => { const r = $(sel).getBoundingClientRect(); return [r.left + 20 + dx, r.top + r.height / 2 + dy]; };
NX.onReset = () => { TT.type = "note"; if (S.nxPaused) { S.nxPaused = false; $("#play").classList.remove("paused"); } if (STEP.on) { STEP.on = false; render(); } };
NX.init([
	{ grp: "Header", id: "header", label: "Header (unchanged)", note: "The header is as today. New: the ▾ beside COPY CLR PASTE, ⇧-click and right-click on ▶, ⇧-click on ● (step recording), a click on the tempo opens TEMPO, GLOBAL opens a page, three engine menu entries.", open: () => ws("seq") },
	{ grp: "Header", id: "play", label: "Play key menu: pause, panic", note: "▶ stays play / stop. ⇧-click or ⇧Space pauses. Right-click: Pause, Step record, Panic (CC 120 on each track channel).", open: () => { ws("seq"); const [x, y] = at("#play", 10, 10); playMenu(x, y); } },
	{ grp: "Header", id: "whatmenu", label: "COPY CLR PASTE ▾", note: "New ▾: Copy… / Paste… / Clear… what. A plain click acts as today.", open: () => { ws("seq"); whatMenu($("[data-nxsec]")); } },
	{ grp: "Header", id: "what", label: "Copy what (dialog)", note: "The machine's SUPER COPY, the ticks grouped by where the data lives: PATTERN (notes, melody, slide, swing, locks, arp, transpose, with counts) and KIT (machine + sound). Replaces the separate arp / slide / swing clipboards.", open: () => { ws("seq"); what("copy"); } },
	{ grp: "Header", id: "tempo", label: "TEMPO popover", note: "New: a click on the LCD tempo: BPM ±, TAP, hold-to-nudge ±10 %, change on release, sync INT / EXT with a link to GLOBAL.", open: () => { ws("seq"); tempo(); } },
	{ grp: "GLOBAL", id: "global", label: "GLOBAL page", note: "Today's shared GLOBAL panel (8 slots, Reset to defaults, Control, Sync, Routing) as one full page in the workspace area. New: Copy / Paste / Clear beside the slots, and an AUDIO card with the master tune.", open: () => { ws("seq"); gOpen(); } },
	{ grp: "SysEx + reset", id: "engine", label: "Engine menu: new entries", note: "The engine menu gains IMPORT SYSEX…, EXPORT SYSEX… and RESET MACHINE…. The kit library's keys open the same panel.", open: () => { ws("seq"); setTimeout(() => { closeK(); openK(document.querySelector(".lcdeng")); }, 60); } },
	{ grp: "SysEx + reset", id: "export", label: "Export SysEx: All", note: "In the existing SysEx panel. ALL is ticked by default (a full backup, the common case); untick it to choose kinds and ranges. DigiPRO waveforms are one more kind there (MKII, after probe P4).", open: () => { ws("seq"); syxExport(); } },
	{ grp: "SysEx + reset", id: "exportkinds", label: "Export SysEx: kinds", note: "ALL unticked: each kind with its range; the range values drag, wheel or click like other values.", open: () => { ws("seq"); syxExport({ all: false }); } },
	{ grp: "SysEx + reset", id: "import", label: "Import SysEx: place", note: "Today's import panel plus a PLACE row: ORIGINAL | SPECIFIC (from a first slot). VERIFY ONLY is its own key beside Import.", open: () => { ws("seq"); Syx.host.choose(); setTimeout(() => document.querySelector('[data-sxp="specific"]')?.click(), 120); } },
	{ grp: "SysEx + reset", id: "reset", label: "Reset machine…", note: "New engine menu entry: a question with Empty reset (red, asks twice); Cancel is the default. No factory reset on the MM. No page.", open: () => { ws("seq"); resetAsk(); } },
	{ grp: "Workspaces", id: "steprec", label: "Sequence: STEP recording", note: "New: ⇧-click ● (or the play key's menu): the REC key shows STEP, a cursor sits on the roll; a played note writes and moves on; → rest, ← back, ⌫ clear, Esc done.", open: () => { ws("seq"); STEP.s = 6; stepOn(); } },
	{ grp: "Workspaces", id: "trigtype", label: "Sequence: trig type", note: "In the row under the roll, where the SLIDE and SWING rows were: Note · Slide · Swing keys (the lit one is what a click paints) and a hint. In Slide or Swing the whole step column is the target; the marks sit along the foot of the roll. No All tracks toggle: the MM keeps slide and swing per track. No row above the roll.", open: () => { ws("seq"); TT.type = "swg"; render(); } },
	{ grp: "Workspaces", id: "songs", label: "Song: slots + one palette", note: "New: the 24 song slots as a column on the left (Load, Save, Save to… | Copy, Paste, Clear, Rename; empty slots quieter); the Song card's picker goes. One pattern palette with one switch PATTERN · CHAIN · SONG replaces the What plays card and Arrange | Chain. The inspector shows only in SONG, with ▶ From here (after probe P1).", open: () => { SG.mode = "song"; ws("song"); } },
	{ grp: "Workspaces", id: "songchain", label: "Song: palette in CHAIN", note: "CHAIN: pad clicks build the machine's chain; Back / Clear and the Plays line under the pads. No inspector.", open: () => { SG.mode = "chain"; S.chainDraft = [0, 2, 1]; ws("song"); } }
], "Monomachine: what changes with DESIGN-machine-menus.md. The header gains GLOBAL; the workspaces stay; each button opens one new screen or state.");
})();
