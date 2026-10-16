"use strict";
/* The Song page's song slots (0.6 wave 1, doc/modern-ux/DESIGN-machine-menus.md §2, Song): a column of the machine's
   songs on the left of the workspace, the same concept and the same keys on both editors (MD 32 songs, MM 24), so the
   markup and the gestures are here once. The page gives the model and takes the actions (host); the document commands
   behind them are the library's (songCopy, songPaste, songCopyTo, songClear, songRename; deskCore/deskEdits.h) and the
   machine's (the load and the save).
     host.model()   {count, nameMax, cur, edited, playing, clip, note, slots: [{loaded, name, rows}]}
                    cur: the song the machine holds (and the right side edits), edited: its edits are not loaded yet,
                    playing: the machine cannot load, clip: the slot a song was copied from or null, note: markup the
                    page adds under the chip (the HW MIDI's "Reload song")
     host.load(slot)  host.save()  host.saveTo(slot, name)  host.copy(slot)  host.paste(slot)  host.clear(slot)
     host.rename(slot, name)  host.copyTo(from, to)  host.redraw()
   A click selects a slot, it loads nothing: Load does (and Enter). The page calls html() for the column, afterRender()
   once the markup is in, and busy() to hold a render while a name is typed or a slot dragged. */
const SongSlots = (() => {
	let host = null, sel = null, lastCur = null, naming = null, drag = null, refocus = false;
	const nn = i => String(i + 1).padStart(2, "0");
	const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
	/* names: the machines take 7-bit characters, the editor keeps to the safe set the kit names use */
	const BAD = /[^A-Z0-9 \-.\/+&!?'#*():]/g;
	const clean = (v, max) => String(v).toUpperCase().replace(BAD, "").slice(0, max);
	const COLS = 2;
	const doc = () => typeof document !== "undefined" ? document : null;
	const column = () => doc()?.querySelector(".songlib");

	const empty = (s, i, m) => !!s && s.loaded && !s.name && !s.rows && i !== m.cur;
	const label = (s, i, m) => !s || !s.loaded ? "…" : s.name || (s.rows ? "(no name)" : i === m.cur ? "(no name)" : "EMPTY");

	function slotHtml(s, i, m) {
		const cur = i === m.cur, ed = cur && m.edited, emp = empty(s, i, m), loaded = !!s && s.loaded;
		const tip = `Song ${nn(i)} ${loaded ? (s.name || (s.rows ? "(no name)" : "(empty)")) : "(loading)"}${loaded && s.rows ? " · " + s.rows + " rows" : ""}`
			+ `${cur ? " · the machine's song, " + (ed ? "edited here: the machine loads the edits when it is stopped" : "loaded") : ""}. `
			+ "Click selects it (Load or Enter loads it); double-click or F2 renames; drag onto another slot to copy.";
		const nm = naming && naming.slot === i
			? `<input class="lsin" id="slin" maxlength="${m.nameMax}" value="${esc(naming.text)}" aria-label="${naming.mode === "saveas" ? "Name of the song saved to slot " + nn(i) : "Song name"}, up to ${m.nameMax} characters" spellcheck="false" autocomplete="off">`
			: esc(label(s, i, m));
		const draggable = loaded && !(naming && naming.slot === i) && !(emp);
		return `<button class="ls ss${emp ? " empty" : ""}${cur ? " cur" : ""}${ed ? " edited" : ""}" data-ss="${i}" draggable="${draggable}" aria-selected="${i === sel}" title="${esc(tip)}">`
			+ `<span class="lsh"><b>${nn(i)}</b>${cur ? `<em><i class="led${ed ? " on" : ""}"></i>${ed ? "ed" : "ok"}</em>` : ""}</span><span class="lsn">${nm}</span>`
			+ `<span class="lsl">${loaded && s.rows ? s.rows + " rows" : ""}</span></button>`;
	}

	/* the column; called right before the page puts it in (it notes whether the focus is in it now) */
	function html() {
		const m = host.model(), a = doc()?.activeElement;
		if (a && a.closest && a.closest(".songlib")) refocus = true;
		if (sel == null || m.cur !== lastCur) { sel = m.cur; lastCur = m.cur; }
		sel = Math.max(0, Math.min(m.count - 1, sel));
		const s = m.slots[sel], cur = m.slots[m.cur], loaded = !!s && s.loaded, same = sel === m.cur;
		const dis = c => c ? " disabled" : "";
		const chip = `${nn(m.cur)} ${esc(cur && cur.loaded ? cur.name || "(no name)" : "…")} · ${m.edited ? "EDITED" : "LOADED"}`;
		const clipTip = m.clip != null ? `Paste song ${nn(m.clip)} into ${nn(sel)}. ` : "Copy a song first. ";
		return `<aside class="songlib card" aria-label="Songs"><header><h3>Songs</h3><span>${m.count} slots</span></header>
 <div class="sltop"><span class="lcdchip" title="The machine's song: the one the arrangement edits. ${m.edited ? "Edited here: the machine loads the edits when it is stopped." : "The machine has loaded what is shown."}">${chip}</span></div>${m.note || ""}
 <div class="slacts"><span class="sgrp"><button data-sa="load"${dis(same || !loaded || m.playing)} title="${same ? "That is the machine's song. " : m.playing ? "The machine loads another song only when it is stopped. " : ""}LOAD SONG: the machine plays this song in SONG mode (Enter)">Load</button>`
			+ `<button class="cream" data-sa="save" title="SAVE SONG: the machine's song into its slot, with its name">Save</button>`
			+ `<button data-sa="saveas"${dis(same || !loaded)} title="${same ? "The selected slot is the machine's song: Save stores it. " : ""}The machine's song, with a name, into slot ${nn(sel)}">Save to…</button></span>`
			+ `<span class="sgrp"><button data-sa="copy"${dis(!loaded)} title="Copy the song (Cmd+C)">Copy</button><button data-sa="paste"${dis(m.clip == null || !loaded)} title="${esc(clipTip)}(Cmd+V)">Paste</button>`
			+ `<button class="danger" data-sa="clear"${dis(!loaded || empty(s, sel, m))} title="Clear the song: its rows and its name are removed (Delete)">Clear</button><button data-sa="rename"${dis(!loaded)} title="Rename the song (F2 or double-click)">Rename</button></span></div>
 <div class="libgrid songs" role="listbox" aria-label="${m.count} song slots">${m.slots.map((x, i) => slotHtml(x, i, m)).join("")}</div>
 <div class="slfoot note">Arrows · Enter loads · F2 renames · drag a slot onto another = copy. The song being edited is always the one on the right.</div></aside>`;
	}
	function afterRender() {
		const c = column(); if (!c) return;
		const inp = c.querySelector("#slin");
		/* a page that renders while a name is typed (the MM's does not hold) keeps what was typed: naming.text */
		if (inp && naming) { inp.focus({ preventScroll: true }); if (naming.fresh) inp.select(); else inp.setSelectionRange(inp.value.length, inp.value.length); return; }
		if (!refocus) return;
		refocus = false;
		const el = c.querySelector(".ls[aria-selected=true]"); if (!el) return;
		el.focus({ preventScroll: true });
		const g = c.querySelector(".libgrid");
		if (g && g.scrollHeight > g.clientHeight) { const a = el.getBoundingClientRect(), b = g.getBoundingClientRect(); if (a.top < b.top) g.scrollTop -= b.top - a.top + 6; else if (a.bottom > b.bottom) g.scrollTop += a.bottom - b.bottom + 6; }
	}
	/* a render is held while a name is typed or a slot is dragged */
	const busy = () => !!naming || !!drag;

	const select = (i, focus = true) => { sel = i; refocus = refocus || focus; host.redraw(); };
	function startNaming(slot, mode) {
		const m = host.model(), s = m.slots[slot], cur = m.slots[m.cur];
		if (!s || !s.loaded) return;
		sel = slot; refocus = true;
		naming = { slot, mode, fresh: true, text: mode === "saveas" ? (cur && cur.name) || "" : s.name || "" };
		host.redraw();
	}
	function finishNaming(ok) {
		if (!naming) return;
		const n = naming, m = host.model(), v = clean(doc()?.querySelector("#slin")?.value ?? n.text, m.nameMax).trimEnd();
		naming = null; refocus = true;
		if (ok) {
			if (n.mode === "saveas") host.saveTo(n.slot, v);
			else if (v !== (m.slots[n.slot]?.name || "")) host.rename(n.slot, v);
		}
		host.redraw();
	}
	function act(a) {
		const m = host.model(), s = m.slots[sel], loaded = !!s && s.loaded;
		refocus = true;
		if (a === "load") { if (sel !== m.cur && loaded && !m.playing) host.load(sel); }
		else if (a === "save") host.save();
		else if (a === "saveas") { if (sel !== m.cur) startNaming(sel, "saveas"); }
		else if (a === "copy") { if (loaded) host.copy(sel); }
		else if (a === "paste") { if (m.clip != null && loaded) host.paste(sel); }
		else if (a === "clear") { if (loaded && !empty(s, sel, m)) host.clear(sel); }
		else if (a === "rename") startNaming(sel, "rename");
	}
	const inColumn = () => { const a = doc()?.activeElement; return !naming && !!a && !!a.closest && !!a.closest(".songlib") && !a.closest("input"); };
	function move(key) {
		const m = host.model(), d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -COLS, ArrowDown: COLS }[key] || 0;
		select((sel + d + m.count) % m.count);
	}

	/* ----- mouse ----- */
	const dc = doc();
	if (dc) {
		dc.addEventListener("click", e => {
			if (!host || e.target.closest?.("#slin")) return;
			const c = e.target.closest?.(".songlib"); if (!c) return;
			const a = e.target.closest("[data-sa]"); if (a) { if (!a.disabled) act(a.dataset.sa); return; }
			const s = e.target.closest("[data-ss]"); if (s) { if (naming) finishNaming(true); select(+s.dataset.ss); }
		});
		dc.addEventListener("dblclick", e => {
			const s = host && e.target.closest?.(".songlib [data-ss]");
			if (s && !e.target.closest("#slin")) startNaming(+s.dataset.ss, "rename");
		});
		dc.addEventListener("keydown", e => {
			if (e.target.id !== "slin") return;
			if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); finishNaming(e.key === "Enter"); }
			e.stopImmediatePropagation();
		}, true);
		dc.addEventListener("input", e => {
			if (e.target.id !== "slin") return;
			const i = e.target, at = i.selectionStart, v = clean(i.value, host.model().nameMax);
			if (v !== i.value) { i.value = v; i.setSelectionRange(Math.min(at, v.length), Math.min(at, v.length)); }
			if (naming) { naming.text = v; naming.fresh = false; }
		});
		dc.addEventListener("focusout", e => {
			if (e.target.id === "slin" && naming) setTimeout(() => { if (naming && doc().activeElement?.id !== "slin") finishNaming(true); }, 0);
		});
		/* a slot dragged onto another is a copy (the library's songCopyTo) */
		dc.addEventListener("dragstart", e => {
			const s = host && e.target.closest?.(".songlib .ls[data-ss]"); if (!s) return;
			drag = { from: +s.dataset.ss }; s.classList.add("dragging"); e.dataTransfer.effectAllowed = "copy";
			try { e.dataTransfer.setData("text/plain", String(drag.from)); } catch (_) { }
		});
		const target = el => drag && el.closest?.(".songlib .ls[data-ss]");
		dc.addEventListener("dragover", e => {
			if (!drag) return; const t = target(e.target);
			dc.querySelectorAll(".songlib .ls.over").forEach(x => x !== t && x.classList.remove("over"));
			if (!t) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; t.classList.add("over");
		});
		dc.addEventListener("drop", e => {
			if (!drag) return; const t = target(e.target), d = drag; drag = null; if (!t) return;
			e.preventDefault(); const to = +t.dataset.ss; sel = to; refocus = true;
			if (to !== d.from) host.copyTo(d.from, to);
			host.redraw();
		});
		dc.addEventListener("dragend", () => { if (!drag && !dc.querySelector(".songlib .dragging")) return; drag = null; host.redraw(); });
	}

	/* ----- keys: the column's own while a slot has the focus (the library's way: a capture handler, so they come before
	   the page's row keys; the entries below only say what they do). ⌘C and ⌘V may come as the copy and paste events
	   instead of keys (deskKeys.js, B-015). ----- */
	const dialogOpen = () => (typeof Modal !== "undefined" && Modal.top && !!Modal.top()) || doc()?.getElementById("dlg")?.hidden === false;
	if (dc) {
		dc.addEventListener("keydown", e => {
			if (!host || e.altKey || !inColumn() || dialogOpen()) return;
			const mod = Modifiers.cmd(e), k = e.key; let h = true;
			/* Enter (and Delete) on a focused action button is that button's own, not the slot's Load/Clear */
			if ((k === "Enter" || k === "Delete" || k === "Backspace") && doc().activeElement.closest("[data-sa]")) return;
			if (!mod && !e.shiftKey && /^Arrow/.test(k)) move(k);
			else if (!mod && k === "Enter") act("load");
			else if (!mod && k === "F2") act("rename");
			else if (!mod && (k === "Delete" || k === "Backspace")) act("clear");
			else if (mod && !e.shiftKey && (k === "c" || k === "C")) act("copy");
			else if (mod && !e.shiftKey && (k === "v" || k === "V")) act("paste");
			else h = false;
			if (h) { e.preventDefault(); e.stopImmediatePropagation(); }
		}, true);
		for (const [type, a] of [["copy", "copy"], ["paste", "paste"]]) dc.addEventListener(type, e => {
			if (!host || !inColumn() || dialogOpen()) return;
			e.preventDefault(); e.stopImmediatePropagation(); act(a);
		}, true);
	}
	if (typeof Keys !== "undefined") {
		const doc1 = (id, keys, mod, does) => Keys.bind({ id, scope: "song", keys, mod, group: "Song", does });
		doc1("song-slot-move", ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"], "", "Song slots (a slot has the focus): move the selection");
		doc1("song-slot-load", ["Enter"], "", "Song slots: load the selected song (LOAD SONG, only while stopped)");
		doc1("song-slot-rename", ["F2"], "", "Song slots: rename the selected song");
		doc1("song-slot-copy", ["C"], "cmd", "Song slots: copy the selected song");
		doc1("song-slot-paste", ["V"], "cmd", "Song slots: paste the song into the selected slot");
		doc1("song-slot-clear", ["Delete", "Backspace"], "", "Song slots: clear the selected song");
		Keys.bind({ id: "song-slot-drag", scope: "song", area: "Song", keys: ["drag a song slot onto another"], mod: "", group: "Song", does: "Copies the song into that slot" });
	}

	return { init(h) { host = h; }, html, afterRender, busy, select, get sel() { return sel; }, get naming() { return naming; } };
})();

/* I-039: the marks on an arrangement cell. A row that holds a tempo, mutes or a transpose says so in its cell, as
   short as it can be: the tempo as a number, mutes as "M" and their count, the row's transpose as +2 / -3, per-track
   transpose (MM) as "T±". A row with none gets nothing, so a plain song looks as it did. The full detail is for the
   cell's tooltip. A cell can be as narrow as 22 px (it is not wider than its pattern name), so the words cannot
   always fit: the same marks are also short letter codes in the same small line (B tempo, M mutes, ± the row's
   transpose, T single tracks, in that order, e.g. "BM±"), and fit() shows the words when every cell has room for them
   and the codes when one has not: nothing is ever cut and no cell changes its height. Pure apart from fit(): a row in (MD: bpm, mutes; MM: also trn, ttr,
   64 = no transpose), text out. Tested in node by deskSongMarksTest.js. */
const SongMarks = (() => {
	const sgn = n => (n > 0 ? "+" : "") + n;
	/* kind "md": mute k is "Track k+1"; "mm": 0-5 are T1-T6, 6-11 are M1-M6 (the machine's MIDI tracks) */
	const muteName = (kind, k) => kind === "mm" ? (k < 6 ? "T" + (k + 1) : "M" + (k - 5)) : "Track " + (k + 1);
	function marks(r, kind) {
		if (!r || r.type) return { text: "", title: "", any: false, codes: "" };
		const text = [], tip = []; let codes = "";
		if (r.bpm) { text.push(String(r.bpm)); tip.push("Tempo " + r.bpm + " BPM"); codes += "B"; }
		const mutes = (r.mutes || []).slice().sort((a, b) => a - b);
		if (mutes.length) { text.push("M" + mutes.length); tip.push("Muted: " + mutes.map(k => muteName(kind, k)).join(", ")); codes += "M"; }
		const trn = (r.trn ?? 64) - 64;
		if (trn) { text.push(sgn(trn)); tip.push("Transpose " + sgn(trn)); codes += "±"; }
		const ttr = (r.ttr || []).map((v, k) => [k, v - 64]).filter(([, d]) => d);
		if (ttr.length) { text.push("T±"); tip.push("Per track: " + ttr.map(([k, d]) => muteName(kind, k) + " " + sgn(d)).join(", ")); codes += "T"; }
		return { text: text.join(" "), title: tip.join(" · "), any: text.length > 0, codes };
	}
	/* the cell's markup: the words and the codes in one element (a click on it opens Row > More); "" for a plain row */
	function html(r, kind) {
		const m = marks(r, kind);
		return m.any ? `<i class="rmk" data-rowmarks="1"><span class="rt">${m.text}</span><span class="rg">${m.codes}</span></i>` : "";
	}
	/* the words when each cell's small line holds them, else the codes (re-run after a render and when the page resizes) */
	function fit(grid) {
		if (!grid) return;
		grid.classList.add("rmkwide");
		for (const s of grid.querySelectorAll(".scell small")) {
			const c = s.parentNode, cs = getComputedStyle(c), room = c.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
			if (s.getBoundingClientRect().width > room + 0.5) { grid.classList.remove("rmkwide"); return; }
		}
	}
	function watch(gridOf) {
		if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("resize", () => fit(gridOf()));
	}
	return { marks, html, fit, watch };
})();
