"use strict";
/* SysEx import and export (P7, B-019), one file for both editors and both mockups (skins/shared/).
   The host opens, parses and writes the files (the page never reads their bytes). A .syx chosen with
   "Import SysEx…" comes back as a preview, here a panel of the modal layer. The preview informs; it is no gate.
   "Import" sends the chosen messages to the machine as they are, like a MIDI cable (the firmware decides what it
   takes), then the host reads every document back and reports per item what the machine did. No Undo: Export
   SysEx… first keeps a way back.
   The panel (0.3.5): a tab per kind in the file (Kits, Patterns, Songs, Globals, Other), each with its LED (send this
   kind or not) and its counts; the tab shows the kind as the machine's own slot grid (patterns A-H x 16, kits 4 or
   8 x 16, songs 2 x 16, globals 1-8), a slot that holds data on the machine with a lit dot, the one that plays now
   cream with ▶. A click on a slot leaves it out or takes it again, Shift-click a range. Three states, one footer:
   preview (Cancel, Import n), importing (the phases and a bar; Stop, Hide), report (per slot what the machine did,
   the problems as a list; Done only).
   0.6 (wave 6, DESIGN-machine-menus.md §2): the same panel exports too (ALL ticked by default; unticked, each kind with
   its range), the import gets its PLACE row (ORIGINAL, or SPECIFIC from a first slot per kind: the host previews again,
   each item at the slot it lands in, and the panel asks before an item lands on a slot that holds data) and VERIFY ONLY
   (nothing is written: the slots are read and compared), and Reset machine… is a question whose reset runs in the panel
   as an import of the slots it clears (Syx.reset).
     Syx.preview(m)        {type:"syxPreview", ok, text, file, model, fullBackup, items:{kind:[{slot,from?,name,kit?,overwrites,plays,format,
                            readable}]}, skipped, skippedCount, messages, place?, reset?, running?}
     Syx.progress(m)       {type:"syxProgress", phase, done, total, running, text, check?, report?:{taken, converted, ignored, differs,
                            changed, unknown, "no reply", commands, unsent, items:[{kind, slot, name, outcome, text}]} (check: same, differs,
                            unknown, "no reply")}
     Syx.exported(m)       {type:"syxExport", ok, running?, text}
     Syx.exportInfo(m)     {type:"syxExportInfo", model, kinds:{kind:{slots, held, used, first, last}}}
     Syx.resetNews(m)      {type:"syxReset", phase, done, total, text}: a factory reset being prepared
     Syx.openExport()      the export panel (the engine menu's EXPORT SYSEX…)
     Syx.reset()           Reset machine…: the question (the engine menu's RESET MACHINE…)
     Syx.menu(value)       an engine menu entry of the panel's (import, export, reset): true when it was one
     Syx.host = {choose(), start(kinds, skip, {placeAt, checkOnly}), stop(), place(placeAt), exportInfo(), exportSave({kinds?, ranges?}),
                 reset(how), ask(html, keys), say(text), machine, factory, memory(), factoryMemory()}   the app's host (machine:
                 its name; factory: it has a factory reset; I-024: memory() the plug-in's machineMemory, factoryMemory() start
                 from factory memory, a third choice of Reset machine… where memory().available)
     Syx.model             the panel's pure part, as data (deskSyxTest.js) */
const Syx = (() => {
	/* ---- the pure part: the file's items in, what the panel shows out ---- */
	const KINDS = [["kit", "Kits"], ["pattern", "Patterns"], ["song", "Songs"], ["global", "Globals"], ["other", "Other"]];
	const OFF = { global: true, other: true };	// settings and commands: off unless ticked
	const nn = n => String(n).padStart(2, "0");
	const key = (k, slot) => k + ":" + slot;
	function slotLabel(k, slot) {
		if (k === "pattern") return "ABCDEFGH"[slot >> 4] + nn((slot & 15) + 1);
		return ({ kit: "K", song: "S", global: "G", other: "#" })[k] + (k === "global" || k === "other" ? slot + 1 : nn(slot + 1));
	}
	/* the machine's slots of a kind: kits 64 (MD) or 128 (MM), patterns 128, songs 32 (MD) or 24 (MM, its manual 1-73),
	   globals 8; more when a file holds more. Columns: patterns 16 (a bank a row, as the pattern palette); kits, songs and
	   globals 8, so a kit's name is whole (the MM's 128 kits scroll) */
	const columns = k => k === "pattern" ? 16 : 8;
	function capacity(model, k, list) {
		const top = list.reduce((a, i) => Math.max(a, i.slot + 1), 0), mm = /mono/i.test(model || "");
		const base = { kit: mm ? 128 : 64, pattern: 128, song: mm ? 24 : 32, global: 8 }[k] || 0;
		return Math.max(base, Math.ceil(top / columns(k)) * columns(k));
	}
	/* rows of slots as on the machine: {cols, rows:[{label, cells:[{slot, label, item|null}]}]}; "other" has no slots */
	function layout(model, k, list) {
		if (k === "other") return { cols: 0, rows: [{ label: "", cells: list.map(i => ({ slot: i.slot, label: slotLabel(k, i.slot), item: i })) }] };
		const n = capacity(model, k, list), by = new Map(list.map(i => [i.slot, i])), cols = columns(k), rows = [];
		for (let r = 0; r * cols < n; r++) {
			const cells = [];
			for (let c = 0; c < cols; c++) { const slot = r * cols + c; cells.push({ slot, label: slotLabel(k, slot), item: by.get(slot) || null }); }
			rows.push({ label: k === "pattern" ? "ABCDEFGH"[r] || String(r + 1) : k === "global" ? "" : nn(r * cols + 1), cells });
		}
		return { cols, rows };
	}
	/* a kind's counts: in the file, chosen, overwriting, into empty slots, playing now, left out */
	function kindSums(k, list, skip, on) {
		const inn = on ? list.filter(i => !skip.has(key(k, i.slot))) : [];
		return { total: list.length, n: inn.length, over: inn.filter(i => i.overwrites).length, fresh: inn.filter(i => !i.overwrites).length,
			plays: inn.filter(i => i.plays).length, out: on ? list.length - inn.length : list.length };
	}
	/* Shift-click: every item of the kind between the anchor and the clicked slot (by slot) takes the clicked one's new state */
	function toggleRange(k, list, skip, anchor, slot) {
		const next = new Set(skip), out = !skip.has(key(k, slot));
		const lo = Math.min(anchor ?? slot, slot), hi = Math.max(anchor ?? slot, slot);
		for (const i of list) if (i.slot >= lo && i.slot <= hi) { if (out) next.add(key(k, i.slot)); else next.delete(key(k, i.slot)); }
		return next;
	}
	/* per chosen item what the machine did: the report lists every item not taken as in the file; the rest were taken,
	   unless the counts do not add up (stopped, or more problems than the report lists): then "unclear" */
	function outcomes(picked, report) {
		const out = new Map(), listed = new Map((report?.items || []).map(i => [key(i.kind, i.slot), i]));
		const slots = picked.filter(p => p.kind !== "other"), ok = report?.check ? "same" : "taken";
		const whole = (report?.[ok] || 0) + listed.size === slots.length;
		for (const p of picked) {
			const id = key(p.kind, p.slot), l = listed.get(id);
			out.set(id, p.kind === "other" ? { outcome: "sent" } : l ? { outcome: l.outcome, text: l.text } : { outcome: whole ? ok : "unclear" });
		}
		return out;
	}
	/* SPECIFIC place: a kind's first slot, by default the file's first (nothing moves until the person moves it) */
	const placeFirst = list => list.reduce((a, i) => Math.min(a, i.from ?? i.slot), Infinity);
	/* the export: a kind's label and slots; wave is the Monomachine's DigiPRO waveforms (W01..W64) */
	const EXPORT_KINDS = [["kit", "Kits"], ["pattern", "Patterns"], ["song", "Songs"], ["global", "Globals"], ["wave", "Waveforms"]];
	const rangeLabel = (k, n) => k === "wave" ? "W" + nn(n + 1) : slotLabel(k, n);
	/* the export's choices from the host's facts: a kind with data is ticked over its first to last used slot; globals
	   (the MIDI channels) and waveforms (read from the machine) are not, until ticked */
	function exportDefaults(info) {
		const out = {};
		for (const [k] of EXPORT_KINDS) {
			const f = info?.kinds?.[k]; if (!f) continue;
			const used = f.used > 0 && f.first >= 0;
			out[k] = { on: used && k !== "global" && k !== "wave", from: used ? f.first : 0, to: used ? f.last : f.slots - 1, slots: f.slots };
		}
		return out;
	}
	/* what syxExport asks for: {} is everything the editor holds; else the kinds ticked with their ranges */
	function exportRequest(all, kinds) {
		if (all) return {};
		const on = Object.keys(kinds).filter(k => kinds[k].on);
		return { kinds: on, ranges: Object.fromEntries(on.map(k => [k, [Math.min(kinds[k].from, kinds[k].to), Math.max(kinds[k].from, kinds[k].to)]])) };
	}
	function exportLine(all, kinds, info) {
		if (all) {
			const f = info?.kinds || {}, held = ["kit", "pattern", "song", "global"].map(k => f[k] ? `${f[k].held} ${KINDS.find(x => x[0] === k)[1].toLowerCase()}` : "").filter(Boolean);
			return "Full backup: every kit, pattern, song and global the editor holds" + (held.length ? ` (${held.join(", ")})` : "") + ".";
		}
		const on = EXPORT_KINDS.filter(([k]) => kinds[k]?.on);
		if (!on.length) return "Nothing chosen.";
		const span = k => { const a = Math.min(kinds[k].from, kinds[k].to), b = Math.max(kinds[k].from, kinds[k].to); return a === b ? rangeLabel(k, a) : `${rangeLabel(k, a)}–${rangeLabel(k, b)}`; };
		return on.map(([k, l]) => `${l} ${span(k)}`).join(" · ")
			+ (kinds.wave?.on ? ". The waveforms are read from the machine first (an empty one answers nothing)." : ".");
	}
	const OUTCOME = { taken: ["taken", "✓"], converted: ["converted", "≈"], ignored: ["ignored", "✕"], differs: ["different", "≠"], changed: ["not comparable", "~"],
		unknown: ["not comparable", "~"], "no reply": ["no answer", "?"], unclear: ["not known", "?"], sent: ["sent", "→"], same: ["the same as the file", "="] };
	const problem = o => o !== "taken" && o !== "sent" && o !== "same";
	/* the footer's one line before the import */
	function footLine(t) {
		if (!t.n) return "Nothing chosen.";
		const s = [];
		if (t.over) s.push(`${t.over} slot${t.over > 1 ? "s" : ""} on the machine overwritten${t.plays ? `, ${t.plays} playing now` : ""}.`);
		else s.push(`${t.n} item${t.n > 1 ? "s" : ""}, into empty slots.`);
		if (t.globals) s.push("Globals change MIDI channels.");
		s.push("No undo: Export SysEx… first.");
		return s.join(" ");
	}
	/* a kind's line while importing, from syxProgress.kinds[kind] {done, total} of the phase: its words and its bar (%) */
	function kindLine(phase, kp, picked) {
		if (!picked) return { text: "not sent", pct: 0 };
		const verb = { before: "reading the slots", send: "sent", read: "read back" }[phase] || "";
		if (!kp || !kp.total) return { text: "waits", pct: 0 };
		const all = kp.done >= kp.total;
		return { text: `${all ? "✓ " : ""}${verb} ${kp.done} of ${kp.total}`, pct: Math.round(kp.done / kp.total * 100) };
	}
	const model = { KINDS, OFF, slotLabel, capacity, layout, kindSums, toggleRange, outcomes, footLine, kindLine, OUTCOME, placeFirst, EXPORT_KINDS, rangeLabel,
		exportDefaults, exportRequest, exportLine };

	/* ---- the panel ---- */
	const pop = document.createElement("div");
	pop.id = "syxpop"; pop.className = "syxpop libpop"; pop.hidden = true;
	pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", "Import SysEx");
	document.body.appendChild(pop);
	let last = null, state = "idle", tab = null, anchor = null, problemsOnly = true, steps = [], rep = null, picks = [], res = new Map(), follow = true;
	let skip = new Set();
	const on = {};	// kind -> ticked
	/* 0.6: what the panel shows (import or export), the import's PLACE (each kind's first slot) and the export's choices */
	let mode = "import", placing = false, placeT = 0, placeW = 0;
	const place = { specific: false, first: {} };
	const ex = { all: true, kinds: {}, info: null };
	const hostHas = f => !!(Syx.host && Syx.host[f]);
	const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
	const q = s => pop.querySelector(s);
	const kindsIn = () => last ? KINDS.filter(([k]) => (last.items[k] || []).length) : [];
	const chosen = () => kindsIn().map(([k]) => k).filter(k => on[k]);
	const picked = () => chosen().flatMap(k => last.items[k].filter(i => !skip.has(key(k, i.slot))).map(i => Object.assign({ kind: k }, i)));
	const totals = () => {
		const s = kindsIn().map(([k]) => kindSums(k, last.items[k], skip, on[k]));
		return { n: s.reduce((a, x) => a + x.n, 0), over: s.reduce((a, x) => a + x.over, 0), plays: s.reduce((a, x) => a + x.plays, 0), globals: !!on.global && kindSums("global", last.items.global || [], skip, true).n > 0 };
	};
	const HELP = "Everything goes into the same slots as in the file, as from a MIDI cable: the machine decides what it takes. Afterwards the editor reads every item back and says what happened. ▶ plays now: the machine takes the dump over it, and unsaved edits of the kit that plays may be lost. Globals (MIDI channels, sync, machine settings) and other messages are off unless you tick them; the active global becomes active at once. There is no Undo: Export SysEx… first keeps a way back.";

	function tip(k, i, out) {
		const t = [slotLabel(k, i.slot) + (i.name && i.name !== slotLabel(k, i.slot) ? " " + i.name : ""), i.from != null ? "from " + slotLabel(k, i.from) + " in the file" : "",
			i.kit != null ? "kit " + nn(i.kit + 1) : "", i.format ? "format " + i.format : "",
			i.readable === false ? "the editor cannot read this dump (the machine may)" : "", i.plays ? "plays now" : "", i.overwrites ? "overwrites a slot that holds data" : "into an empty slot"];
		if (state === "preview") t.push(!on[k] ? "tick " + KINDS.find(x => x[0] === k)[1] + " to send these" : out ? "left out: click to take it" : "click to leave it out, Shift-click a range");
		const r = res.get(key(k, i.slot));
		if (r) t.push(r.text || OUTCOME[r.outcome]?.[0] || r.outcome);
		return t.filter(Boolean).join(" · ");
	}
	function cell(k, c) {
		if (!c.item) return `<span class="syxc none"><b>${c.label}</b></span>`;
		const i = c.item, id = key(k, i.slot), out = skip.has(id), r = res.get(id);
		const second = k === "pattern" && (!i.name || i.name === c.label) ? (i.kit != null ? "K" + nn(i.kit + 1) : "") : i.name || "—";
		const cls = ["syxc", i.overwrites ? "over" : "fresh", i.plays ? "plays" : "", out ? "off" : "", i.readable === false ? "unread" : "", r && problem(r.outcome) ? "bad" : ""].filter(Boolean).join(" ");
		const mark = r ? `<i class="syxo">${OUTCOME[r.outcome]?.[1] || "?"}</i>` : "";
		return `<button type="button" class="${cls}" data-syxitem="${esc(id)}" data-syxname="${esc(i.name || "")}"${r ? ` data-syxout="${esc(r.outcome)}"` : ""} title="${esc(tip(k, i, out))}"><b>${i.plays ? "▶ " : ""}${c.label}</b><span>${esc(second)}</span>${mark}</button>`;
	}
	function pane(k) {
		const list = last.items[k], g = layout(last.model, k, list);
		const style = g.cols ? `grid-template-columns:${k === "global" ? "" : "26px "}repeat(${g.cols},minmax(0,1fr))` : "grid-template-columns:repeat(auto-fill,minmax(110px,1fr))";
		const body = g.rows.map(r => (g.cols && k !== "global" ? `<span class="syxrl">${r.label}</span>` : "") + r.cells.map(c => cell(k, c)).join("")).join("");
		const note = k === "global" ? `<p class="syxnote"><b>Globals</b> hold the machine's MIDI channels, sync and settings: importing one changes the MIDI channels the machine listens on, and so which tracks the editor can mute, play and edit live (GLOBAL shows them). Off unless you tick them; the active one becomes active at once.</p>`
			: k === "other" ? `<p class="syxnote">Messages that are no kit, pattern, song or global (commands, sounds): sent as they are when ticked.</p>` : "";
		return `<div class="syxpane${on[k] ? "" : " kindoff"}" data-syxpane="${k}" role="tabpanel"${k === tab ? "" : " hidden"}>${note}<div class="syxgrid${k === "global" ? " g8" : ""}" style="${style}">${body}</div></div>`;
	}
	function tabSub(k) {
		const list = last.items[k];
		if (state === "running") {
			const m = lastProgress || {}, l = kindLine(m.phase, m.kinds?.[k], picks.some(p => p.kind === k));
			return { text: l.text, bad: 0, pct: l.pct, work: m.kind === k };
		}
		if (state === "report") {
			const mine = picks.filter(p => p.kind === k), bad = mine.filter(p => problem(res.get(key(k, p.slot))?.outcome)).length;
			if (!mine.length) return { text: "not sent", bad: 0 };
			if (k === "other") return { text: `${mine.length} sent`, bad: 0 };
			if (rep?.report?.check) return { text: `${mine.length - bad} the same${bad ? ` · ${bad} different or unread` : ""}`, bad };
			return { text: `${mine.length - bad} taken${bad ? ` · ${bad} problem${bad > 1 ? "s" : ""}` : ""}`, bad };
		}
		const s = kindSums(k, list, skip, on[k]);
		if (!on[k]) return { text: k === "global" ? "off · MIDI settings" : "off", bad: 0 };
		if (k === "other") return { text: `${s.n} to send${s.out ? ` · ${s.out} out` : ""}`, bad: 0 };
		const t = [s.over ? `<em>${s.over} overwrite</em>` : "", s.fresh ? `${s.fresh} new` : "", s.out ? `${s.out} out` : "", !s.n ? "none chosen" : ""].filter(Boolean).join(" · ");
		return { text: t, html: true, bad: 0, plays: s.plays };
	}
	function tabs() {
		return `<div class="syxtabs" role="tablist">${kindsIn().map(([k, label]) => {
			const s = tabSub(k), lock = state !== "preview";
			return `<div class="syxtab${k === tab ? " sel" : ""}${s.bad ? " bad" : ""}${s.work ? " work" : ""}" data-syxtabk="${k}"><input type="checkbox" data-syxkind="${k}" aria-label="Send ${label}"${on[k] ? " checked" : ""}${lock ? " disabled" : ""}><button type="button" class="syxtabb" role="tab" aria-selected="${k === tab}" data-syxtab="${k}"><span class="t">${label}<span class="syxct">${last.items[k].length}</span><span class="syxpl" title="plays now"${s.plays ? "" : " hidden"}>▶</span></span><span class="s">${s.html ? s.text : esc(s.text)}</span>${state === "running" && picks.some(p => p.kind === k) ? `<i class="syxtb"><b style="width:${s.pct || 0}%"></b></i>` : ""}</button></div>`;
		}).join("")}</div>`;
	}
	function tools() {
		if (state === "report") {
			const bad = [...res.values()].filter(r => problem(r.outcome)).length;
			const leg = rep?.report?.check ? `<i class="lg">=</i>the same as the file <i class="lg bad">≠</i>different <i class="lg bad">?</i>no answer`
				: `<i class="lg">✓</i>taken as in the file <i class="lg bad">≈</i>converted <i class="lg bad">✕</i>ignored <i class="lg bad">≠</i>different`;
			return `<div class="syxtools"><label class="syxfilt"><input type="checkbox" data-syxgo="problems"${problemsOnly && bad ? " checked" : ""}${bad ? "" : " disabled"}> Show problems only</label>
				<span class="syxleg">${leg}</span></div>`;
		}
		return `<div class="syxtools"><span class="syxleg"><i class="lg over"></i>overwrites data <i class="lg"></i>empty slot <i class="lg plays">▶</i>plays now <i class="lg off"></i>left out</span>
			<span class="syxsel">${state === "preview" ? `<button type="button" data-syxsel="all">All</button><button type="button" data-syxsel="fresh">Empty slots only</button><button type="button" data-syxsel="none">None</button>` : ""}</span></div>`;
	}
	function problems() {
		const rows = picks.map(p => ({ p, r: res.get(key(p.kind, p.slot)) })).filter(x => x.r && problem(x.r.outcome));
		if (!rows.length) return `<p class="syxnote">Every item as in the file.</p>`;
		return `<div class="syxlist">${rows.map(({ p, r }) => `<div class="syxli" data-syxitem="${esc(key(p.kind, p.slot))}" data-syxout="${esc(r.outcome)}"><b>${slotLabel(p.kind, p.slot)}</b><span class="nm">${esc(p.name || "")}</span><span class="tag">${esc(OUTCOME[r.outcome]?.[0] || r.outcome)}</span><span class="why">${esc(r.text || "")}</span></div>`).join("")}</div>`;
	}
	function foot() {
		if (state === "report") return `<div class="syxfoot"><div class="syxmsg"><p class="syxsum">${esc(rep.text || "")}</p></div><div class="btnrow"><button type="button" class="go" data-syxgo="close">Done</button></div></div>`;
		if (state === "running") return `<div class="syxfoot"><div class="syxmsg"><div class="syxsteps"></div><div class="syxbar"><i></i><span></span></div></div><div class="btnrow"><button type="button" data-syxgo="close">Hide</button><button type="button" data-syxgo="stop">Stop</button></div></div>`;
		const skipped = last.skippedCount ? `<details class="syxprob"><summary>${last.skippedCount} message${last.skippedCount > 1 ? "s" : ""} cannot be sent</summary>${(last.skipped || []).map(p => `<div>${esc(p)}</div>`).join("")}</details>` : "";
		const verify = hostHas("start") ? `<button type="button" data-syxgo="verify" title="Read the slots the items land in and compare them with the file; nothing is written">Verify only</button>` : "";
		return `<div class="syxfoot"><div class="syxmsg"><p class="syxwarn"></p>${skipped}</div><div class="btnrow"><button type="button" data-syxgo="close">Cancel</button>${verify}<button type="button" class="go" data-syxgo="start">Import</button></div></div>`;
	}
	function head() {
		const what = last.ok ? `<span class="lcdchip">${esc(last.model || "")}${last.fullBackup ? " · full backup" : ""}</span>` : "";
		return `<div class="libhead syxhead"><span class="cap">${esc(last.reset || "Import SysEx")}</span>${what}<span class="syxfile" title="${esc(last.file || "")}">${esc(last.file || "")}</span>${last.ok ? `<button type="button" class="libx syxq" data-syxgo="help" aria-expanded="false" title="How the import works">?</button>` : ""}<button type="button" class="libx" data-syxgo="close" title="Close (Esc)">Esc</button></div>
			<p class="syxhelp" hidden>${esc(HELP)}</p>`;
	}
	/* PLACE (0.6): ORIGINAL, or SPECIFIC from a first slot for the kind shown (each kind its own); the grid shows where each
	   item lands. Not for a reset (it clears every slot where it is) */
	function placeRow() {
		if (state !== "preview" || last.reset || !hostHas("place")) return "";
		const k = tab, list = last.items[k] || [], label = (KINDS.find(x => x[0] === k) || ["", ""])[1];
		const val = place.specific && k !== "other" && list.length ? `<span class="sxfirst">${esc(label)} from <button type="button" class="sxv" role="spinbutton" data-sxv="place" data-k="${k}" aria-valuenow="${place.first[k]}" title="The slot the first of the ${esc(label.toLowerCase())} lands in: click (⇧-click back), the wheel, drag up or down, or the arrow keys">${rangeLabel(k, place.first[k])}</button></span>` : "";
		return `<div class="sxplace"><span class="ilab">Place</span><span class="seg"><button type="button" data-sxp="original" aria-pressed="${!place.specific}">Original place</button><button type="button" data-sxp="specific" aria-pressed="${place.specific}">Specific place</button></span>${val}
			<span class="note">${place.specific ? "The grid shows where each item lands. Each kind starts at its own first slot." : "Each item goes back to the slot it came from."}</span></div>`;
	}
	function drawExport() {
		pop.classList.add("syx-export"); pop.classList.toggle("sxallon", ex.all);
		for (const st of ["preview", "error", "running", "report"]) pop.classList.remove("syx-" + st);
		const f = ex.info?.kinds || {};
		const row = ([k, label]) => {
			const c = ex.kinds[k]; if (!c) return "";
			const v = (end, n) => `<button type="button" class="sxv" role="spinbutton" data-sxv="${end}" data-k="${k}" aria-valuenow="${n}" title="${end === "from" ? "The first" : "The last"} of the ${esc(label.toLowerCase())}: click (⇧-click back), the wheel, drag up or down, or the arrow keys">${rangeLabel(k, n)}</button>`;
			const sub = k === "wave" ? "DigiPRO user waveforms, read from the machine (an empty one answers nothing)"
				: f[k] ? `${f[k].used} used of ${f[k].slots}${f[k].held < f[k].slots ? ` · ${f[k].held} read so far` : ""}${k === "global" ? " · MIDI channels and settings" : ""}${k === "song" ? " · a song's patterns and kits are not added by themselves: tick them too" : ""}` : "";
			return `<label class="sxrow"><input type="checkbox" data-sxk="${k}"${c.on ? " checked" : ""}${ex.all ? " disabled" : ""}><b>${esc(label)}</b><span class="sxrng">${v("from", c.from)}<i>–</i>${v("to", c.to)}</span><small>${esc(sub)}</small></label>`;
		};
		pop.innerHTML = `<div class="libhead syxhead"><span class="cap">Export SysEx</span><span class="lcdchip">${esc(ex.info?.model || "")}</span><span class="syxfile">machine → one .syx file</span><button type="button" class="libx" data-syxgo="close" title="Close (Esc)">Esc</button></div>
			<div class="sxall"><label class="sxrow"><input type="checkbox" data-sxk="all"${ex.all ? " checked" : ""}><b>All</b><span class="sxrng"></span><small>a full backup: every kit, pattern, song and global. Untick to choose kinds and ranges</small></label></div>
			<div class="sxlist">${ex.info ? EXPORT_KINDS.map(row).join("") : `<p class="syxnote">Asking the editor what it holds…</p>`}</div>
			<div class="syxfoot"><div class="syxmsg"><p class="syxsum">${esc(exportLine(ex.all, ex.kinds, ex.info))}</p></div><div class="btnrow"><button type="button" data-syxgo="close">Cancel</button><button type="button" class="go" data-syxgo="save"${!ex.all && !Object.values(ex.kinds).some(c => c.on) ? " disabled" : ""}>Save .syx…</button></div></div>`;
	}
	function draw() {
		if (mode === "export") { drawExport(); return; }
		pop.classList.remove("syx-export", "sxallon");
		if (!last) return;
		for (const st of ["preview", "error", "running", "report"]) pop.classList.toggle("syx-" + st, st === state);
		if (!last.ok) { pop.innerHTML = head() + `<p class="syxwhy">${esc(last.text)}</p><div class="syxfoot"><div class="syxmsg"></div><div class="btnrow"><button type="button" data-syxgo="close">Close</button></div></div>`; return; }
		const list = state === "report" && problemsOnly && [...res.values()].some(r => problem(r.outcome));
		pop.innerHTML = head() + tabs() + `<div class="syxbody">${list ? `<div class="syxpane">${problems()}</div>` : kindsIn().map(([k]) => pane(k)).join("")}</div>` + placeRow() + tools() + foot();
		sums(); bar();
	}
	function sums() {
		if (state !== "preview") return;
		const t = totals(), go = q('[data-syxgo="start"]'), w = q(".syxwarn");
		/* while a new place is previewed, the grid and its overwrite counts are not yet where the items land: no Import or Verify */
		if (go) { go.textContent = placing ? "Placing…" : t.n ? `Import ${t.n}` : "Import"; go.disabled = placing || !t.n; go.classList.toggle("danger", !placing && !!t.over); }
		const vf = q('[data-syxgo="verify"]'); if (vf) vf.disabled = placing || !picked().some(p => p.kind !== "other");
		if (w) { w.textContent = footLine(t); w.classList.toggle("hot", !!t.over); }
		for (const [k] of kindsIn()) {
			const s = tabSub(k), el = q(`[data-syxtab="${k}"] .s`);
			if (el) el.innerHTML = s.html ? s.text : esc(s.text);
			const pl = q(`[data-syxtab="${k}"] .syxpl`); if (pl) pl.hidden = !s.plays;
			q(`[data-syxpane="${k}"]`)?.classList.toggle("kindoff", !on[k]);
		}
	}
	let lastProgress = null;
	function bar() {
		const m = lastProgress, box = q(".syxsteps");
		if (state !== "running" || !box || !m) return;
		const PH = [["before", "Read the slots"], ["send", "Send"], ["read", "Read back"]].filter(([p]) => p !== "before" || steps.includes("before"));
		const at = PH.findIndex(([p]) => p === m.phase);
		box.innerHTML = PH.map(([p, t], n) => `<span class="syxstep${n < at ? " done" : n === at ? " now" : ""}"><i class="led${n <= at ? " on" : ""}"></i>${t}</span>`).join("");
		const b = q(".syxbar");
		b.querySelector("i").style.width = (m.total ? m.done / m.total * 100 : 0) + "%";
		b.querySelector("span").textContent = m.text || (m.total ? `${m.done} of ${m.total}` : "");
		// per kind (0.3.5: syxProgress.kinds and .kind): each tab's line and bar; the shown tab follows the kind at work
		// until the person picks a tab
		for (const [k] of kindsIn()) {
			const s = tabSub(k), t = q(`[data-syxtabk="${k}"]`); if (!t) continue;
			t.classList.toggle("work", !!s.work);
			t.querySelector(".s").textContent = s.text;
			const w = t.querySelector(".syxtb b"); if (w) w.style.width = (s.pct || 0) + "%";
		}
		if (follow && m.kind && m.kind !== tab && last.items[m.kind]?.length) show(m.kind);
	}
	function show(k) {
		tab = k;
		for (const t of pop.querySelectorAll("[data-syxtabk]")) t.classList.toggle("sel", t.dataset.syxtabk === k);
		for (const p of pop.querySelectorAll("[data-syxpane]")) p.hidden = p.dataset.syxpane !== k;
		for (const b of pop.querySelectorAll("[data-syxtab]")) b.setAttribute("aria-selected", b.dataset.syxtab === k);
		const pr = q(".sxplace"); if (pr) pr.outerHTML = placeRow();
	}
	function preview(m) {
		mode = "import";
		const again = placing && m.ok && last && last.ok && m.file === last.file && state === "preview";
		placing = false; clearTimeout(placeW);
		last = m; state = m.ok ? "preview" : "error"; skip = new Set(); anchor = null; res = new Map(); rep = null; picks = []; steps = []; lastProgress = null;
		if (!again) {
			for (const [k] of KINDS) on[k] = !OFF[k];
			tab = kindsIn()[0]?.[0] || null;
			place.specific = false; place.first = {};
			if (m.ok) for (const [k] of kindsIn()) place.first[k] = placeFirst(m.items[k]);
		}
		else if (!kindsIn().some(([k]) => k === tab)) tab = kindsIn()[0]?.[0] || null;
		/* a reset runs already: every kit, pattern and song it sends */
		if (m.ok && m.reset) {
			for (const [k] of KINDS) on[k] = k === "kit" || k === "pattern" || k === "song";
			follow = true; picks = picked(); state = "running";
			lastProgress = { phase: "send", done: 0, total: 0, running: true, text: "Starting" };
		}
		draw(); pop.hidden = false;
	}
	/* the place changed: the host previews again (each item where it lands, what it overwrites there) */
	function placeChanged() {
		if (!hostHas("place")) return;
		clearTimeout(placeT); clearTimeout(placeW);
		/* pending from the first change until the host's preview comes back (or a refusal: then the old preview stands) */
		placing = true; sums();
		placeT = setTimeout(() => { Syx.host.place(placeAt()); placeW = setTimeout(placeLost, 5000); }, 120);
	}
	/* no preview came back for the new place: the place goes back to the one the grid shows (the last preview's) */
	function placeLost() {
		if (!placing) return;
		placing = false;
		const p = last?.place || {};
		place.specific = Object.keys(p).length > 0;
		for (const [k, v] of Object.entries(p)) place.first[k] = v;
		if (state === "preview" && mode === "import" && !pop.hidden) draw();
	}
	const placeAt = () => place.specific ? Object.fromEntries(kindsIn().map(([k]) => k).filter(k => k !== "other").map(k => [k, place.first[k]])) : {};
	/* a value of the panel (a place's first slot, an export range's end): within its kind's slots */
	function slotsOf(k) {
		if (mode === "export") return ex.kinds[k]?.slots || 1;
		return capacity(last?.model, k, []);
	}
	function nudge(el, d) {
		const k = el.dataset.k, what = el.dataset.sxv, n = slotsOf(k);
		if (what === "place") { place.first[k] = Math.max(0, Math.min(n - 1, (place.first[k] || 0) + d)); el.textContent = rangeLabel(k, place.first[k]); el.setAttribute("aria-valuenow", place.first[k]); placeChanged(); return; }
		const c = ex.kinds[k]; if (!c) return;
		c[what] = Math.max(0, Math.min(n - 1, c[what] + d)); el.textContent = rangeLabel(k, c[what]); el.setAttribute("aria-valuenow", c[what]);
		const sum = q(".syxsum"); if (sum) sum.textContent = exportLine(ex.all, ex.kinds, ex.info);
	}
	function start(check) {
		follow = true; picks = picked(); const kinds = chosen(), sk2 = [...skip];
		state = "running"; lastProgress = { phase: check ? "read" : "send", done: 0, total: 0, running: true, text: check ? "Verify only: starting" : "Starting" }; draw();
		Syx.host.start(kinds, sk2, { placeAt: placeAt(), checkOnly: !!check });
	}
	function progress(m) {
		if (!last || !last.ok) return;
		lastProgress = m;
		if (m.phase && !steps.includes(m.phase)) steps.push(m.phase);
		if (m.phase === "done") {
			rep = { text: m.text, report: m.report };
			res = outcomes(picks, m.report);
			problemsOnly = [...res.values()].some(r => problem(r.outcome));
			state = "report"; draw(); return;
		}
		if (m.running) { if (state !== "running") { state = "running"; draw(); } else bar(); return; }
		if (state === "running") { state = "preview"; draw(); }	// the host refused or ended without a report
	}
	pop.addEventListener("change", e => {
		const xk = e.target.dataset?.sxk;
		if (xk && mode === "export") {
			if (xk === "all") ex.all = e.target.checked; else if (ex.kinds[xk]) ex.kinds[xk].on = e.target.checked;
			draw(); return;
		}
		const k = e.target.dataset?.syxkind;
		if (k && state === "preview") { on[k] = e.target.checked; show(k); sums(); return; }
		if (e.target.dataset?.syxgo === "problems") { problemsOnly = e.target.checked; draw(); }
	});
	/* a value (place, from, to): the wheel, a drag up or down, the arrow keys, as other values */
	pop.addEventListener("wheel", e => { const v = e.target.closest?.("[data-sxv]"); if (!v) return; e.preventDefault(); nudge(v, e.deltaY < 0 ? 1 : -1); }, { passive: false });
	pop.addEventListener("keydown", e => {
		const v = e.target.closest?.("[data-sxv]"); if (!v) return;
		const d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 8, PageDown: -8 }[e.key];
		if (d) { e.preventDefault(); e.stopPropagation(); nudge(v, d); }
	});
	pop.addEventListener("pointerdown", e => {
		const v = e.target.closest?.("[data-sxv]"); if (!v || e.button !== 0) return;
		let y = e.clientY, moved = 0;
		const move = ev => { const d = Math.trunc((y - ev.clientY) / 6); if (d) { nudge(v, d); y -= d * 6; moved += Math.abs(d); v.dataset.dragged = "1"; } };
		const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); if (!moved) delete v.dataset.dragged; };
		addEventListener("pointermove", move); addEventListener("pointerup", up);
	});
	function select(how) {
		const list = last.items[tab] || [];
		for (const i of list) { const id = key(tab, i.slot); if (how === "all" || (how === "fresh" && !i.overwrites)) skip.delete(id); else skip.add(id); }
		if (!on[tab] && how !== "none") { on[tab] = true; const b = q(`[data-syxkind="${tab}"]`); if (b) b.checked = true; }
		redrawCells(tab); sums();
	}
	function redrawCells(k) {
		for (const el of pop.querySelectorAll(`[data-syxpane="${k}"] [data-syxitem]`)) {
			const slot = +el.dataset.syxitem.split(":")[1], i = last.items[k].find(x => x.slot === slot), out = skip.has(el.dataset.syxitem);
			el.classList.toggle("off", out); el.title = tip(k, i, out);
		}
	}
	document.addEventListener("click", e => {
		if (!pop.contains(e.target)) return;
		const sv = e.target.closest("[data-sxv]");
		if (sv) { if (!sv.dataset.dragged) nudge(sv, e.shiftKey ? -1 : 1); delete sv.dataset.dragged; return; }
		const sp = e.target.closest("[data-sxp]");
		if (sp && state === "preview" && mode === "import") {
			const specific = sp.dataset.sxp === "specific";
			if (specific !== place.specific) { place.specific = specific; const pr = q(".sxplace"); if (pr) pr.outerHTML = placeRow(); placeChanged(); }
			return;
		}
		if (mode === "export") {
			const g2 = e.target.closest("[data-syxgo]");
			if (g2?.dataset.syxgo === "close") pop.hidden = true;
			else if (g2?.dataset.syxgo === "save" && hostHas("exportSave")) { pop.hidden = true; Syx.host.exportSave(exportRequest(ex.all, ex.kinds)); }
			return;
		}
		const t = e.target.closest("[data-syxtab]");
		if (t) {
			if (state === "running") { follow = false; show(t.dataset.syxtab); return; }
			tab = t.dataset.syxtab; if (state === "report" && problemsOnly) problemsOnly = false; draw(); return;
		}
		const it = e.target.closest("[data-syxitem]");
		if (it && it.tagName === "BUTTON" && state === "preview") {
			const [k, s] = it.dataset.syxitem.split(":"), slot = +s;
			if (!on[k]) return;
			skip = e.shiftKey && anchor != null ? toggleRange(k, last.items[k], skip, anchor, slot) : toggleRange(k, last.items[k], skip, slot, slot);
			anchor = slot; redrawCells(k); sums(); return;
		}
		const sel = e.target.closest("[data-syxsel]");
		if (sel && state === "preview") { select(sel.dataset.syxsel); return; }
		const g = e.target.closest("[data-syxgo]"); if (!g) return;
		const a = g.dataset.syxgo;
		if ((a === "start" || a === "verify") && placing) return;	/* the place's preview is still on its way */
		if (a === "start" && Syx.host && state === "preview") {
			const t = totals(), asked = JSON.stringify(placeAt());
			/* SPECIFIC onto slots that hold data: the question first (ORIGINAL's footer warns as before) */
			if (place.specific && t.over && hostHas("ask")) {
				const over = picked().filter(p => p.overwrites);
				Syx.host.ask(`Import ${t.n}: ${t.over} item${t.over > 1 ? "s land on slots that hold" : " lands on a slot that holds"} data on the machine (${over.slice(0, 6).map(p => slotLabel(p.kind, p.slot)).join(", ")}${t.over > 6 ? ", …" : ""}). What is there is lost: there is no undo. Export SysEx… first keeps a way back.`,
					[[`Import ${t.n}`, "danger", () => { if (state === "preview" && !pop.hidden && !placing && JSON.stringify(placeAt()) === asked) start(false); }], ["Cancel", "cream", () => { }]]);
			}
			else start(false);
		}
		else if (a === "verify" && Syx.host && state === "preview") start(true);
		else if (a === "stop" && Syx.host) Syx.host.stop();
		else if (a === "help") { const h = q(".syxhelp"); h.hidden = !h.hidden; g.setAttribute("aria-expanded", String(!h.hidden)); }
		else if (a === "close") pop.hidden = true;
	});
	/* the export panel: everything by default; the host's facts fill the kinds and their default ranges */
	function openExport() {
		mode = "export"; ex.all = true; ex.info = null; ex.kinds = {};
		draw(); pop.hidden = false;
		if (hostHas("exportInfo")) Syx.host.exportInfo();
	}
	function exportInfo(m) {
		ex.info = m; ex.kinds = exportDefaults(m);
		if (mode === "export" && !pop.hidden) draw();
	}
	function say(t) { if (hostHas("say") && t) Syx.host.say(t); }
	/* Reset machine…: what it destroys, Export SysEx… first, then the reset asks a second time (Cancel is the default:
	   Esc and a click elsewhere answer the last key) */
	function reset() {
		if (!hostHas("ask")) return;
		const name = esc(Syx.host.machine || "machine"), f = !!Syx.host.factory, mem = memoryHere();
		Syx.host.ask(`<b>Reset machine</b> (the machine's start-up menu: hold FUNCTION at power on).<br><br><b>Empty reset</b> clears every kit, pattern and song; ${f ? "samples and globals stay" : "globals stay"}. It asks a second time.<br>`
			+ (f ? `<b>Factory reset</b> brings back the factory kits, patterns and songs, read from a second ${name} started from your own ROM; globals and samples stay.<br>`
				: `Factory reset is not offered: the ${name}'s factory data is not in the editor.<br>`)
			+ (mem ? `<b>Start from factory memory</b> restarts the ${name} as on a new install: its whole memory (kits, patterns, songs, globals${f ? ", samples" : ""}) is the factory's, and the saved machine memory for new sessions is deleted (seconds).<br>` : "")
			+ `<br>There is no undo. Export SysEx… first keeps a way back.`,
			[["Empty reset…", "danger", () => resetAgain("empty")], ...(f ? [["Factory reset…", "", () => resetAgain("factory")]] : []),
				...(mem ? [["Start from factory memory…", "", memoryAgain]] : []), ["Export SysEx…", "", openExport], ["Cancel", "cream", () => { }]]);
	}
	/* I-024 (doc/modern-ux/DESIGN-machine-memory.md): starting from factory memory, where the host keeps a machine memory
	   (its memory() says available) */
	function memoryHere() { const m = hostHas("memory") && hostHas("factoryMemory") ? Syx.host.memory() : null; return !!(m && m.available); }
	function memoryAgain() {
		const name = esc(Syx.host.machine || "machine"), saved = !!(Syx.host.memory() || {}).saved;
		Syx.host.ask(`<b>Start from factory memory:</b> restart the ${name} with its factory memory now${saved ? " and delete the saved machine memory" : ""}? New sessions start from factory memory until you save again. A DAW project keeps its own memory.<br><br>What the machine holds now is lost: there is no undo. Export SysEx… first keeps a way back.`,
			[["Start from factory memory", "danger", () => Syx.host.factoryMemory()], ["Export SysEx…", "", openExport], ["Cancel", "cream", () => { }]]);
	}
	function resetAgain(how) {
		const name = esc(Syx.host.machine || "machine");
		const what = how === "empty" ? `<b>Empty reset:</b> clear every kit, pattern and song on the ${name} now? Each slot is overwritten with an empty one and read back.`
			: `<b>Factory reset:</b> replace every kit, pattern and song on the ${name} with the factory ones? A second ${name} starts from your ROM first (seconds), then each slot is overwritten and read back (a few minutes).`;
		Syx.host.ask(`${what}<br><br>What the machine holds now is lost: there is no undo. Export SysEx… first keeps a way back.`,
			[[how === "empty" ? "Clear everything" : "Factory reset", "danger", () => Syx.host.reset(how)], ["Export SysEx…", "", openExport], ["Cancel", "cream", () => { }]]);
	}
	/* the engine menu's entries of the panel */
	function menu(v) {
		if (v === "import") { if (Syx.host) Syx.host.choose(); return true; }
		if (v === "export") { openExport(); return true; }
		if (v === "reset") { reset(); return true; }
		return false;
	}
	/* an export's news (written, or the waveforms read so far) */
	function exported(m) { say(m.text); return m; }
	return {
		preview, progress, exported, exportInfo, openExport, reset, menu, resetNews: m => say(m.text), host: null, model
	};
})();
