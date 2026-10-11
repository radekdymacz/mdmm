"use strict";
/* Machinedrum review mockup: DESIGN-machine-menus.md on top of the approved mockup (mockup/index.html, copied).
   The header stays as it is; the additions: the ▾ "what" on COPY CLR PASTE, the play key's pause and panic, the
   TEMPO popover, the GLOBAL page (settings only), Export / Import SysEx in the existing panel, Reset machine…, the song slots on the Song workspace, and the small
   additions inside the workspaces. Example data only. */
(() => {
const { $, $$, esc } = NX;
const nn2 = i => String(i + 1).padStart(2, "0");

/* ================= header: the ▾ on COPY CLR PASTE, the play key (⇧-click pause, menu), tempo click ================= */
const sec = $(".lcdsec");
sec.insertAdjacentHTML("beforeend", `<button class="secmore nx" data-nxsec="more" aria-haspopup="menu" title="Copy… / Clear… / Paste… what (the machine's SUPER COPY / SUPER CLEAR)">▾</button>`);
$("#play").title = "Play / stop (Space). ⇧-click: pause, ▶ again continues (⇧Space). Right-click: pause, panic";
NX.mark($("#play").closest(".lcdt"), true);
$("#bpm").title = "Click: the TEMPO window. Drag up or down: tempo; ⌥-drag: change on release";
NX.mark($("#bpm").closest(".f"), true);
$("#globkey").title = "GLOBAL: the machine's global settings, its files and sample memory, as a full page (G). GLOBAL again or Esc goes back";
NX.mark($("#globkey"));

/* the "what" ticks, grouped by where the data lives: the pattern or the kit; counts where there is something to count */
const WHAT = {
	copy: { go: "Copy", pat: [["Trigs", "16", 1], ["Accent", "4", 1], ["Swing", "8", 1], ["Slide", "2", 1], ["Locks", "12", 1]], kit: [["Machine + sound", "", 0], ["LFO", "", 0]] },
	paste: { go: "Paste into 2 tracks", pat: [["Trigs", "16", 1], ["Accent", "4", 1], ["Swing", "8", 1], ["Slide", "2", 1], ["Locks", "12", 1]], kit: [["Machine + sound", "", 0], ["LFO", "", 0]] },
	clear: { go: "Clear", pat: [["Trigs", "16", 0], ["Accent", "4", 0], ["Swing", "8", 0], ["Slide", "2", 0], ["Locks", "12", 1]], kit: [["Machine + sound", "back to init", 0], ["LFO", "", 0]] }
};
function what(verb) {
	const t = S.sel, tr = S.tracks[t], w = WHAT[verb], it = l => l.map(([label, n, on]) => ({ label, n, on }));
	NX.whatOpen({ verb, go: w.go, src: `${t + 1} ${tr.m}`, srcNote: verb === "paste" ? "copied from track 2 · pattern A01" : `track ${t + 1} · pattern ${patName(S.pat)} · all steps`,
		groups: [{ name: "Pattern", note: patName(S.pat), items: it(w.pat) }, { name: "Kit", note: kitName(S.kit), items: it(w.kit) }],
		to: verb === "paste" ? S.tracks.map((x, i) => ({ label: i + 1, name: x.m, on: i === 2 || i === 3 })) : null,
		fine: verb === "clear" ? "Ticks are remembered. The machine's SUPER CLEAR." : verb === "copy" ? "Ticks are remembered. The machine's SUPER COPY." : "Ticks are remembered. Pastes into every lit track.",
		done: () => toast(`${w.go}: done (example).`) });
}
function whatMenu(el) {
	NX.menuAt(el, [{ label: "Copy…", key: "⌘⇧C", run: () => what("copy") }, { label: "Paste…", key: "⌘⇧V", run: () => what("paste") },
		{ label: "Clear…", key: "⌘⇧⌫", run: () => what("clear") }, "-", { note: "Choose what: trigs, locks, accent, swing, slide, sound, LFO" }], "Copy / clear / paste what", -150, 0);
}
function pause() {
	if (!S.playing) return;
	const pos = $("#pos").textContent; togglePlay(); $("#pos").textContent = pos;
	S.nxPaused = true; $("#play").classList.add("paused"); $("#play").setAttribute("aria-pressed", "true");
	toast(`Paused at ${pos}. ▶ or ⇧Space continues from here.`);
}
function playMenu(x, y) {
	DeskMenu.open([{ label: S.playing ? "Stop" : "Play", key: "Space", run: () => togglePlay() },
		{ label: S.nxPaused ? "Continue" : "Pause", key: "⇧Space", enabled: S.playing || !!S.nxPaused, run: () => S.nxPaused ? cont() : pause() },
		{ label: "Record", key: "⌥Space", run: () => $("#rec").click() }, "-",
		{ label: "Panic: all voices off", key: "⌘.", run: () => toast("Panic: all voices off (the machine's STOP twice).") }], x, y, { title: "Transport" });
}
function cont() { S.nxPaused = false; $("#play").classList.remove("paused"); togglePlay(); }
addEventListener("click", e => {
	const p = e.target.closest?.("#play");
	if (p && (e.shiftKey || S.nxPaused)) { e.preventDefault(); e.stopImmediatePropagation(); S.nxPaused ? cont() : pause(); return; }
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
	if (G.open && e.key === "Escape" && (typeof Modal === "undefined" || !Modal.top())) { e.preventDefault(); e.stopImmediatePropagation(); gClose(); }
}, true);
/* a click on the tempo (no drag) opens TEMPO */
(() => { const b = $("#bpm"); let d = null;
	b.addEventListener("pointerdown", e => { d = { x: e.clientX, y: e.clientY }; }, true);
	b.addEventListener("pointerup", e => { if (d && Math.abs(e.clientY - d.y) < 3 && Math.abs(e.clientX - d.x) < 3) setTimeout(tempo, 0); d = null; }, true); })();
function tempo() { NX.tempoOpen({ extra: `<div class="tr"><span class="ilab">Sync</span><span class="note">tempo in: ${S.glob.tempoIn === "external" ? "EXTERNAL" : "INTERNAL"}</span><button data-tp="glob" style="margin-left:auto" title="GLOBAL › SYNC">Sync in GLOBAL →</button></div>`,
	onClick: a => { if (a === "glob") { NX.tempoClose(); gOpen(); } } }); }

/* ================= the GLOBAL page: main's shared panel (deskGlobal.js) with the MD's cards as main draws them
   (mdStudio/mdDeskGlobal.js, read from main's file), as a full page; new: Copy / Paste / Clear, LEARN, Reset map ================= */
const G = { open: false };
const wsName = () => ({ seq: "Sequence", sound: "Sound", mix: "Mix", sampler: "Sampler", song: "Song", control: "Control" })[S.ws] || "the page";
fetch("../../../source/elektron/md/mdJucePlugin/skins/mdStudio/mdDeskGlobal.js").then(r => r.text()).then(t => {
	const code = t.slice(0, t.indexOf("/* The plug-in's side"));
	const make = new Function("GlobalUi", "GP", "globSend", "drawGlobal", code + "\nreturn { cards: mdGlobalCards, click: mdGlobalClick };");
	const md = make(GlobalUi, GP, (f, v) => globSend(f, v), () => drawGlobal());
	DeskGlobal.host = { view: glob, cards: md.cards, click: md.click, menu: "FUNCTION + PATTERN/SONG",
		change: (sel, V) => { if (sel.dataset.gsel === "map") globSend("keymap", { note: GP.note, target: sel.value === "" ? null : +sel.value }); },
		slot: n => globSend("slot", n), reset: () => toast("GLOBAL reset to the factory settings (example)."),
		ask: (html, yes) => ask(html, [["Reset", "danger", yes], ["Cancel", "", () => { }]]) };
});
const learnPost = h => h.replace(/<small>TRACK (\d+)<\/small>/g, (_, n) => `<small>TRACK ${n}<i class="learn${n === "2" ? " on" : ""} nx" title="LEARN: the next note played maps to this track"></i></small>`)
	.replace(/<h3>Map editor<\/h3><span>/, `<h3>Map editor</h3><span><button class="mini nx" data-gx="resetmap" title="Back to the machine's map (asks)">Reset map</button> `);
function gDraw() {
	if (!G.open) return;
	$("#body").classList.add("full"); $("#rail").hidden = true; $("#subbar").innerHTML = "";
	$("#main").innerHTML = NX.gpHtml({ ws: wsName(), post: learnPost });
	if (typeof enhanceSelects === "function") enhanceSelects($("#main"));
	$("#globkey").setAttribute("aria-pressed", "true"); $("#globkey .led")?.classList.add("on");
}
function gOpen() { if (typeof closeLib === "function") closeLib(false); G.open = true; gDraw(); }
function gClose(rerender = true) { G.open = false; $("#globkey").setAttribute("aria-pressed", "false"); $("#globkey .led")?.classList.remove("on"); if (rerender) render(); }
window.openGlobal = () => G.open ? gClose() : gOpen();
window.closeGlobal = () => { if (G.open) gClose(); };
window.drawGlobal = () => { if (G.open) gDraw(); else { $("#globpop").hidden = true; } };
const origRender = render;
window.render = function () { origRender.apply(this, arguments); if (G.open) gDraw(); };
NX.gpEvents(() => G.open, gDraw, k => {
	if (k === "close") gClose();
	else if (k === "copy") toast(`Copied global ${S.glob.slot + 1}.`);
	else if (k === "paste") toast("Copy a global first.");
	else if (k === "clear") ask(`Clear <b>global ${S.glob.slot + 1}</b>? Its settings go back to the machine's defaults.`, [["Clear global", "danger", () => toast("Cleared (example).")], ["Cancel", "", () => {}]]);
	else if (k === "resetmap") toast("Reset map asks first (example).");
});



/* ================= the engine menu: Import / Export SysEx…, Reset machine… ; the SysEx panel ================= */
function syxExport(o = {}) {
	NX.syxExport({ all: o.all, sumAll: "Full backup: 64 kits, 128 patterns, 32 songs, 8 globals · about 420 KB", model: "Machinedrum", sum: "12 kits, 18 patterns, 4 songs, global 1 · about 186 KB · about 9 s from the emulator", kinds: [
		{ id: "kit", label: "Kits", from: "K01", to: "K12", sub: "12 used of 64", on: true }, { id: "pattern", label: "Patterns", from: "A01", to: "B16", sub: "18 used of 128", on: true },
		{ id: "song", label: "Songs", from: "S01", to: "S04", sub: "4 used of 32", on: true }, { id: "global", label: "Globals", from: "G1", to: "G1", sub: "the active one, or 1–8", on: false }] });
}
function resetAsk() {
	ask(`<b>Reset machine</b> (the machine's start-up menu, hold FUNCTION at power on).<br><br><b>Empty reset</b> clears every kit, pattern and song; samples and globals stay. It asks a second time.<br><b>Factory reset</b> brings back the factory kits and patterns.<br><br>Export SysEx… first keeps a way back.`,
		[["Empty reset…", "danger", () => toast("It asks a second time (example).")], ["Factory reset…", "", () => toast("Factory reset (example).")], ["Cancel", "cream", () => {}]]);
}
NX.engineItems([["import", "IMPORT SYSEX…", () => Syx.host.choose()], ["export", "EXPORT SYSEX…", syxExport], ["reset", "RESET MACHINE…", resetAsk]]);
Syx.host.exportAll = syxExport;
NX.syxPlace((k, n) => k === "pattern" ? "ABCDEFGH"[n >> 4] + String((n & 15) + 1).padStart(2, "0") : ({ kit: "K", song: "S", global: "G" })[k] + (k === "global" ? n + 1 : String(n + 1).padStart(2, "0")));

/* ================= Sequence: the trig-type selector (TRIG · ACCENT · SWING · SLIDE) ================= */
const TT = { type: "trig", all: { acc: true, swg: false, sld: true }, takes: { acc: new Set([0, 1, 3, 10]), swg: new Set([3, 4, 10]), sld: new Set([12]) } };
S.tracks.forEach((t, i) => { if (!t.swg) t.swg = new Set(i === 3 || i === 4 || i === 10 ? [2, 6, 10, 14, 18, 22, 26, 30] : []); });
const TTN = [["trig", "Trig", ""], ["acc", "Accent", "B/F"], ["swg", "Swing", "C/G"], ["sld", "Slide", "D/H"]];
const origCls = stepCls;
window.stepCls = function (i, s) { const c = origCls(i, s), t = S.tracks[i]; return t.trigs[s] && t.swg && t.swg.has(s) ? c + " sw" : c; };
/* the legend under the grid is the selector: its marks are keys; the chosen one says what a click paints */
function ttLegend() {
	const lg = $(".seqfoot .legend"); if (!lg || S.ws !== "seq") return;
	const k = TT.type, all = k !== "trig" ? TT.all[k] : null;
	const tip = { trig: "A click paints trigs (Esc comes back here)", acc: "A click paints accent (the machine's FUNCTION + B/F). ⇧-click on the grid still paints accent in any mode", swg: "A click paints swing (the machine's FUNCTION + C/G)", sld: "A click paints slide (the machine's FUNCTION + D/H). ⌥⇧-click on the grid still paints slide in any mode" };
	const icon = { trig: "lg on", acc: "lg on acc", swg: "lg on sw", sld: "lg on sl" };
	lg.classList.add("ttlegend", "nx");
	lg.innerHTML = `<span class="ttkeys" role="radiogroup" aria-label="What a click paints">${TTN.map(([id, n]) => `<button class="ttk ${id}" role="radio" data-tt="${id}" aria-checked="${k === id}" title="${tip[id]}"><i class="${icon[id]}"></i><span>${n}</span></button>`).join("")}</span>
		<span class="lgplain"><i class="lg on lk"></i>Has locks</span>
		${all == null ? "" : `<span class="seg ttall" title="The pattern's EDIT ALL: one ${TTN.find(x => x[0] === k)[1].toLowerCase()} row for every track that takes it (the dots on the track headers), or this track's own"><button data-ttall="1" aria-pressed="${all}">All tracks</button><button data-ttall="0" aria-pressed="${!all}">This track</button></span>`}`;
	if (all) $$("#rail .th[data-sel]").forEach(th => { const i = +th.dataset.sel; th.classList.add("ttdot"); th.insertAdjacentHTML("beforeend", `<button class="takes nx" data-takes="${i}" aria-pressed="${TT.takes[k].has(i)}" title="Track ${i + 1} ${TT.takes[k].has(i) ? "takes" : "does not take"} the ${TTN.find(x => x[0] === k)[1].toLowerCase()} row (click toggles)"></button>`); });
}
const origSeq = renderSeq; window.renderSeq = function () { origSeq.apply(this, arguments); document.documentElement.dataset.tt = TT.type; ttLegend(); };
document.addEventListener("click", e => {
	const k = e.target.closest("[data-tt]"); if (k) { TT.type = k.dataset.tt; render(); return; }
	const a = e.target.closest("[data-ttall]"); if (a) { TT.all[TT.type] = a.dataset.ttall === "1"; render(); return; }
});
addEventListener("click", e => { const d = e.target.closest?.("[data-takes]"); if (!d) return; e.preventDefault(); e.stopImmediatePropagation(); const set = TT.takes[TT.type], i = +d.dataset.takes; set.has(i) ? set.delete(i) : set.add(i); render(); }, true);
let ttPaint = null;
function ttSet(t, k) { return k === "acc" ? t.acc : k === "sld" ? t.slide : t.swg; }
function ttAt(st) { const i = +st.dataset.t, s = +st.dataset.s, t = S.tracks[i]; if (!t.trigs[s]) return; const set = ttSet(t, TT.type); if (ttPaint.on == null) ttPaint.on = !set.has(s); ttPaint.on ? set.add(s) : set.delete(s); refreshRow(i); }
addEventListener("pointerdown", e => { const st = e.target.closest?.("#seq .st"); if (!st || TT.type === "trig" || e.button !== 0 || e.shiftKey || e.altKey) return; e.preventDefault(); e.stopImmediatePropagation(); ttPaint = { on: null }; ttAt(st); }, true);
addEventListener("pointermove", e => { if (!ttPaint) return; const st = document.elementFromPoint(e.clientX, e.clientY)?.closest?.("#seq .st"); if (st) ttAt(st); }, true);
addEventListener("pointerup", () => { ttPaint = null; }, true);
addEventListener("click", e => { if (TT.type !== "trig" && e.target.closest?.("#seq .st") && !e.shiftKey && !e.altKey) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
addEventListener("keydown", e => { if (e.key === "Escape" && TT.type !== "trig" && S.ws === "seq" && (typeof Modal === "undefined" || !Modal.top()) && !G.open) { e.preventDefault(); e.stopImmediatePropagation(); TT.type = "trig"; render(); } }, true);

/* ================= Sound: the LFO card menu, the machine picker's audition ================= */
function lfoMenu(x, y) {
	const t = S.sel;
	DeskMenu.open([{ label: "Copy LFO", key: "⌘C", run: () => toast(`Copied LFO ${t + 1}.`) }, { label: "Paste LFO", key: "⌘V", run: () => toast("Pasted (example).") },
		{ label: "Clear LFO", key: "⌫", run: () => toast("LFO back to init (example).") }], x, y, { title: `LFO ${t + 1}` });
}
const origSound = renderSound; window.renderSound = function () { origSound.apply(this, arguments);
	const h = $(".lfocard header"); if (h) { h.insertAdjacentHTML("beforeend", `<button class="lfomenu nx" data-lfom="1" aria-haspopup="menu" title="Copy, paste or clear this LFO">⋯</button>`); } };
document.addEventListener("click", e => { const b = e.target.closest("[data-lfom]"); if (b) { const r = b.getBoundingClientRect(); lfoMenu(r.left - 120, r.bottom + 2); } });
let AUD = null;
const origPicker = drawPicker; window.drawPicker = function () { origPicker.apply(this, arguments);
	$$("#machpop .mk").forEach(m => { m.insertAdjacentHTML("beforeend", `<span class="aud nx" data-aud="${m.dataset.mach}" role="button" title="Audition (Space): plays one note with this machine; Enter keeps it, Esc puts the old one back">▶</span>`); if (AUD === m.dataset.mach) m.classList.add("auditioning"); });
	const foot = $("#machpop .mp-foot");
	if (foot && AUD) foot.insertAdjacentHTML("afterend", `<div class="audbar nx"><span>▶ ${esc(AUD)} · track ${S.sel + 1} · was ${esc(S.tracks[S.sel].m)}</span><kbd>Enter</kbd> keep <kbd>Esc</kbd> back</div>`);
	else if (foot) foot.insertAdjacentHTML("afterend", `<div class="audhint note nx">▶ or Space auditions a machine; Enter keeps it, Esc puts the old one back.</div>`);
};
addEventListener("click", e => { const a = e.target.closest?.("[data-aud]"); if (!a) return; e.preventDefault(); e.stopImmediatePropagation(); AUD = a.dataset.aud; drawPicker(); }, true);

/* ================= Mix: LEV above VOL ================= */
const LEV = [100, 100, 92, 100, 84, 100, 100, 110, 100, 96, 100, 100, 72, 100, 100, 118];
const origMix = renderMix; window.renderMix = function () { origMix.apply(this, arguments);
	$$(".strip").forEach((s, i) => { const f = s.querySelector(".fader"); if (!f) return;
		f.insertAdjacentHTML("beforebegin", `<div class="levk nx" role="slider" tabindex="0" aria-label="Track ${i + 1} level" aria-valuenow="${LEV[i]}" title="LEV: the track's level, stored in the kit (0–127, double-click: 100). Cannot be locked"><span><small>LEV</small><b>${LEV[i]}</b></span><span class="levbar"><i style="height:${(LEV[i] / 127 * 100).toFixed(1)}%"></i></span></div>`); }); };

/* ================= Song: the song slots column, play from here ================= */
const SONGN = ["FIRST SONG", "LIVE SET A", "WAREHOUSE", "SKETCH 4", "", "", "BROKEN RAD", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""];
const SG = { sel: 0, cur: 0, from: null };
function songCol() {
	const n = SONGN[SG.sel] || "", ed = true;
	const slots = SONGN.map((nm, i) => `<button class="ls ss${nm ? "" : " empty"}${i === SG.cur ? " cur" : ""}" data-ss="${i}" aria-selected="${i === SG.sel}" title="Song ${nn2(i)}${nm ? " " + nm : " (empty)"}"><span class="lsh"><b>${nn2(i)}</b>${i === SG.cur ? `<em><i class="led${ed ? " on" : ""}"></i>${ed ? "ed" : "ok"}</em>` : ""}</span><span class="lsn">${nm || "EMPTY"}</span><span class="lsl">${nm ? [14, 22, 9, 4, 0, 0, 31][i] + " rows" : ""}</span></button>`).join("");
	return `<aside class="songlib card nx"><header><h3>Songs</h3><span>32 slots</span></header>
		<div class="sltop"><span class="lcdchip">${nn2(SG.cur)} ${esc(SONGN[SG.cur])} · edited</span></div>
		<div class="slacts"><span class="sgrp"><button data-sa="load" title="LOAD SONG (stopped) (Enter)">Load</button><button class="cream" data-sa="save" title="SAVE SONG to its slot, with its name">Save</button><button data-sa="saveas"${SG.sel === SG.cur ? " disabled" : ""} title="${SG.sel === SG.cur ? "The selected slot is the current song: SAVE stores it" : "SAVE SONG into slot " + nn2(SG.sel)}">Save to…</button></span><span class="sgrp"><button data-sa="copy">Copy</button><button data-sa="paste">Paste</button><button class="danger" data-sa="clear">Clear</button><button data-sa="rename" title="F2 or double-click">Rename</button></span></div>
		<div class="libgrid songs">${slots}</div>
		<div class="slfoot note">Arrows · Enter loads · F2 renames · drag a slot onto another = copy. The song being edited is always the one on the right.</div></aside>`;
}
SG.mode = "song";
const MODES = [["pattern", "Pattern", "A pad click goes to that pattern (queued; ⇧-click now). The machine plays patterns."], ["chain", "Chain", "Pad clicks build the live chain: one bank, the numbers show the order, it loops."], ["song", "Song", "A pad click adds a row after the selected row. The machine plays the song."]];
function songPalette(ui) {
	const left = ui.querySelector(".songleft"); if (!left) return;
	const cards = [...left.querySelectorAll(":scope > section.card")];
	const pal = cards.find(c => c.querySelector(".pgridp")), insp = cards.find(c => c.querySelector(".insp")), chain = cards.find(c => c.querySelector(".chainp"));
	if (!pal) return;
	const m = SG.mode, info = MODES.find(x => x[0] === m);
	const hd = pal.querySelector("header");
	hd.innerHTML = `<div class="pmodekeys nx" role="radiogroup" aria-label="What the machine plays, and what a pad click does">${MODES.map(([k, n]) => `<button class="pkey" role="radio" data-pm="${k}" aria-checked="${m === k}"><i class="led"></i><span>${n}</span></button>`).join("")}<span class="note">what plays, what a pad click does</span></div>`;
	const grid = pal.querySelector(".pgridp");
	if (m === "chain" && chain) {
		grid.className = "pgridp chainp"; grid.innerHTML = chain.querySelector(".chainp").innerHTML;
		const rows = [...chain.querySelectorAll(".irow")]; rows.forEach(r => pal.appendChild(r));
	} else if (m === "pattern") {
		grid.querySelectorAll("[data-addpat]").forEach(b => { const p = +b.dataset.addpat; b.dataset.patgo = p; b.removeAttribute("data-addpat"); b.draggable = false; b.title = `${patName(p)}: click queues it (⇧-click: now)`; b.classList.toggle("cur", p === S.pat); b.classList.toggle("q", p === S.queued); });
	}
	if (m !== "chain") pal.insertAdjacentHTML("beforeend", `<p class="note pnote nx">${info[2]}</p>`);
		pal.querySelectorAll(".chainacts + .note, .chainacts ~ .note").forEach(n => n.textContent = "Pads chain at once: one bank, each pattern once.");
		pal.querySelectorAll(".chainfoot > .irow").forEach(r => { if (!r.querySelector(".chainacts,.lcdchip,.chainrow")) r.remove(); });
	if (chain) chain.remove();
	if (insp && m !== "song") insp.hidden = true;
}
const origSong = renderSong; window.renderSong = function () { origSong.apply(this, arguments);
	const ui = $("#main .songui"); if (!ui) return;
	ui.classList.add("withlib"); ui.insertAdjacentHTML("afterbegin", songCol()); songPalette(ui);
	const acts = ui.querySelector(".rowacts"); if (acts) acts.insertAdjacentHTML("afterbegin", `<button class="nx" data-pfrom="1" title="Play the song from this row (Enter). Needs the machine to take a song position: after probe P1">▶ From here</button>`);
	if (SG.from != null) { ui.querySelector(`.scell[data-i="${SG.from}"]`)?.classList.add("pfrom"); ui.querySelector(`.sblk[data-row="${SG.from}"]`)?.classList.add("pfrom"); }
};
document.addEventListener("click", e => {
	const m = e.target.closest("[data-pm]"); if (m) { SG.mode = m.dataset.pm; render(); return; }
	const g = e.target.closest("[data-patgo]"); if (g) { goPattern(+g.dataset.patgo, e.shiftKey); render(); }
});
document.addEventListener("click", e => {
	const s = e.target.closest("[data-ss]"); if (s) { SG.sel = +s.dataset.ss; render(); return; }
	const a = e.target.closest("[data-sa]"); if (a) { const k = a.dataset.sa; if (k === "load") { SG.cur = SG.sel; render(); toast(`Loaded song ${nn2(SG.sel)}.`); } else toast(`Song ${a.textContent.toLowerCase()} (example).`); return; }
	if (e.target.closest("[data-pfrom]")) { SG.from = S.songSel; render(); toast(`Plays the song from row ${String(S.songSel + 1).padStart(3, "0")}.`); }
});

/* ================= the review states ================= */
const ws = w => { if (G.open) gClose(false); S.ws = w; render(); };
const at = (sel, dx = 0, dy = 0) => { const r = $(sel).getBoundingClientRect(); return [r.left + 20 + dx, r.top + r.height / 2 + dy]; };
NX.onReset = () => { if (TT.type !== "trig") { TT.type = "trig"; } AUD = null; SG.from = null; if (S.nxPaused) { S.nxPaused = false; $("#play").classList.remove("paused"); renderTop(); } };
NX.init([
	{ grp: "Header", id: "header", label: "Header (unchanged)", note: "The header is as today. New: the ▾ beside COPY CLR PASTE, ⇧-click and right-click on ▶, a click on the tempo opens TEMPO, GLOBAL opens a page, three engine menu entries. Turn on <b>Show changes</b>.", open: () => { ws("seq"); } },
	{ grp: "Header", id: "play", label: "Play key menu: pause, panic", note: "▶ stays play / stop. ⇧-click or ⇧Space pauses (▶ blinks; ▶ again continues). Right-click: Pause, Panic (all voices off, ⌘.).", open: () => { ws("seq"); const [x, y] = at("#play", 10, 10); playMenu(x, y); } },
	{ grp: "Header", id: "paused", label: "Paused", note: "Paused: the play key blinks, the position stays. ▶ or ⇧Space continues from here (the machine's PLAY while playing).", open: () => { ws("seq"); if (!S.playing) togglePlay(); setTimeout(pause, 900); } },
	{ grp: "Header", id: "whatmenu", label: "COPY CLR PASTE ▾", note: "New ▾: Copy… / Paste… / Clear… what. A plain click on COPY, CLR, PASTE acts as today.", open: () => { ws("seq"); whatMenu($("[data-nxsec]")); } },
	{ grp: "Header", id: "what", label: "Copy what (dialog)", note: "One dialog for the machine's SUPER COPY / SUPER CLEAR, the ticks grouped by where the data lives: PATTERN (trigs, accent, swing, slide, locks, with counts) and KIT (machine + sound, LFO). The LCD ▾ is its one route. Replaces separate clipboards.", open: () => { ws("seq"); what("copy"); } },
	{ grp: "Header", id: "pastewhat", label: "Paste what, to tracks", note: "Paste… adds the target tracks: every lit track takes the ticked parts.", open: () => { ws("seq"); what("paste"); } },
	{ grp: "Header", id: "tempo", label: "TEMPO popover", note: "New: a click on the LCD tempo opens TEMPO: BPM ±, TAP, hold-to-nudge ±10 %, change on release. Drag still sets the tempo.", open: () => { ws("seq"); tempo(); } },
	{ grp: "GLOBAL", id: "global", label: "GLOBAL page", note: "Main's shared GLOBAL panel (deskGlobal.js with the MD's cards as main draws them: the 8 slots, Reset to defaults, Control, Sync, Trig in, Map editor, Routing) as one full page with a one-line head. New: Copy / Paste / Clear beside the slots, LEARN dots and Reset map on the map editor.", open: () => { ws("seq"); gOpen(); } },
	{ grp: "SysEx + reset", id: "engine", label: "Engine menu: new entries", note: "The engine menu gains IMPORT SYSEX…, EXPORT SYSEX… and RESET MACHINE…. The kit library's Import / Export keys open the same panel.", open: () => { ws("seq"); setTimeout(() => { closeK(); openK(document.querySelector(".lcdeng")); }, 60); } },
	{ grp: "SysEx + reset", id: "export", label: "Export SysEx: All", note: "In the existing SysEx panel. ALL is ticked by default (a full backup, the common case); untick it to choose kinds and ranges.", open: () => { ws("seq"); syxExport(); } },
	{ grp: "SysEx + reset", id: "exportkinds", label: "Export SysEx: kinds", note: "ALL unticked: each kind with its range; the range values drag, wheel or click like other values.", open: () => { ws("seq"); syxExport({ all: false }); } },
	{ grp: "SysEx + reset", id: "import", label: "Import SysEx: place", note: "Today's import panel plus a PLACE row: ORIGINAL | SPECIFIC (from a first slot). VERIFY ONLY is its own key beside Import.", open: () => { ws("seq"); Syx.host.choose(); setTimeout(() => document.querySelector('[data-sxp="specific"]')?.click(), 120); } },
	{ grp: "SysEx + reset", id: "reset", label: "Reset machine…", note: "New engine menu entry: a question with Empty reset (red, asks twice) and Factory reset; Cancel is the default. Factory reset waits for a probe (can the emulator load the factory data?).", open: () => { ws("seq"); resetAsk(); } },
	{ grp: "Workspaces", id: "trigtype", label: "Sequence: trig type", note: "The legend under the grid becomes the selector: Trig · Accent · Swing · Slide are keys (their marks + names); the lit one is what a click paints. Has locks stays a plain legend item. With Accent, Swing or Slide: All tracks | This track (EDIT ALL) in the same row; in All tracks a dot on each track header says it takes the row. Swing has a new teal slant mark. Shortcuts (⇧-click, ⌥⇧-click) are in the tooltips. Esc back to Trig. The grid stays where it is today.", open: () => { ws("seq"); TT.type = "swg"; TT.all.swg = true; render(); } },
	{ grp: "Workspaces", id: "lfo", label: "Sound: LFO menu", note: "New: ⋯ on the LFO card: Copy LFO, Paste LFO, Clear LFO.", open: () => { ws("sound"); const b = $("[data-lfom]").getBoundingClientRect(); lfoMenu(b.left - 120, b.bottom + 2); } },
	{ grp: "Workspaces", id: "audition", label: "Sound: machine audition", note: "New in the machine picker: ▶ on the hovered or selected tile (or Space) auditions a machine on the track; the bar says Enter keeps it, Esc puts the old one back.", open: () => { ws("sound"); AUD = "EFM-CB"; openPicker(); S.pickFam = "EFM"; drawPicker(); } },
	{ grp: "Workspaces", id: "lev", label: "Mix: LEV", note: "New: LEV above VOL on each strip, with a bar of the stored value. LEV cannot be locked (the manual).", open: () => { ws("mix"); } },
	{ grp: "Workspaces", id: "songs", label: "Song: slots + one palette", note: "New: the 32 song slots as a column on the left (Load, Save, Save to… | Copy, Paste, Clear, Rename; empty slots quieter). One pattern palette with one switch PATTERN · CHAIN · SONG: what the machine plays and what a pad click does; the separate CHAIN block goes. The selected-row inspector shows only in SONG, with ▶ From here (Enter; after probe P1).", open: () => { SG.mode = "song"; ws("song"); } },
	{ grp: "Workspaces", id: "songchain", label: "Song: palette in CHAIN", note: "CHAIN: pad clicks build the live chain (one bank, numbers show the order); Back / Clear and the Plays line under the pads. No inspector.", open: () => { SG.mode = "chain"; S.chain.draft = [0, 2, 1]; ws("song"); } },
], "Machinedrum: what changes with DESIGN-machine-menus.md. The header and the workspaces stay; each button opens one new screen or state.");
})();
