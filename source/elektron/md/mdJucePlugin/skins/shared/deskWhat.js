"use strict";
/* COPY / PASTE / CLEAR what (0.6 wave 4, doc/modern-ux/DESIGN-machine-menus.md 2): the machine's SUPER COPY and SUPER
   CLEAR, both editors. The LCD's COPY CLR PASTE keep acting as they do; the small ▾ beside them opens Copy… Paste…
   Clear…, each a dialog of ticks grouped as the machine keeps the data (PATTERN, KIT) and, for Paste, the tracks it
   goes into. The ticks are remembered (per editor and per verb, in this browser). One command goes out:
   trackCopy / trackPaste / trackClear {t | to, what} (deskEdits.h trackParts), one undo step. The dialog is the
   question: Paste and Clear write only from its key. Each page builds the dialog's data (its parts, counts, tracks,
   what its engine says) and sends the command; this file is the dialog, the menu and the remembered ticks.

   open(o): o = {verb: "copy"|"paste"|"clear", editor: "md"|"mm", src, srcNote, fine?,
     groups: [{name, note?, info?, items: [{id, label, n?, why?}]}]  (why: the item cannot be ticked, and the reason)
     to?: [{t, label, name, on, why?}]  (Paste: the target tracks; why: this track cannot take it)
     defaults: [ids ticked the first time], done: (what, to) => void}
   menu(el, run): the ▾'s menu under el; run(verb) opens that verb's dialog.
   label(verb, what, to): the go key's words. ticked(editor, verb, ids, defaults): the remembered ticks among ids. */
const What = (() => {
	const VERBS = {
		copy: { title: "Copy what", go: () => "Copy", fine: "Ticks are remembered. The machine's SUPER COPY.", key: "⌘⇧C" },
		paste: { title: "Paste what", go: (n) => n > 1 ? `Paste into ${n} tracks` : n === 1 ? "Paste into 1 track" : "Paste", fine: "Ticks are remembered. Pastes into every lit track.", key: "⌘⇧V" },
		clear: { title: "Clear what", go: () => "Clear", fine: "Ticks are remembered. The machine's SUPER CLEAR. ⌘Z undoes it.", key: "⌘⇧⌫" }
	};
	const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
	const store = (editor, verb) => "deskWhat." + editor + "." + verb;
	/* the ticks of a verb as this browser remembers them (none: the defaults), among the ids offered */
	function ticked(editor, verb, ids, defaults) {
		let saved = null;
		try { saved = JSON.parse(localStorage.getItem(store(editor, verb)) || "null"); } catch (_) { saved = null; }
		const list = Array.isArray(saved) ? saved : defaults || [];
		return ids.filter(id => list.includes(id));
	}
	function remember(editor, verb, ids) { try { localStorage.setItem(store(editor, verb), JSON.stringify(ids)); } catch (_) { } }
	const label = (verb, what, to) => VERBS[verb].go(to ? to.length : 0);

	/* the dialog's markup (pure): ticks by group, the target tracks, the go key and Cancel */
	function html(o, on) {
		const V = VERBS[o.verb];
		const item = it => `<label class="${it.why ? "dis" : ""}"${it.why ? ` title="${esc(it.why)}"` : ""}><input type="checkbox" data-wid="${esc(it.id)}"${on.includes(it.id) && !it.why ? " checked" : ""}${it.why ? " disabled" : ""}> <span>${esc(it.label)}</span>${it.n != null && it.n !== "" ? `<small>${esc(it.n)}</small>` : ""}</label>`;
		const groups = o.groups.map(g => `<div class="whatgrp"><h4>${esc(g.name)}<small>${esc(g.note || "")}</small></h4><div class="whatgrid">${g.items.map(item).join("")}</div>${g.info ? `<p class="whatinfo">${esc(g.info)}</p>` : ""}</div>`).join("");
		const to = o.to ? `<div class="whatsrc whatto"><span class="ilab">To tracks</span><span class="to" role="group" aria-label="The tracks to paste into">${o.to.map(x =>
			`<button type="button" data-wto="${x.t}" aria-pressed="${!!x.on && !x.why}"${x.why ? ` disabled title="${esc(x.why)}"` : ` title="${esc(x.name)}"`}>${esc(x.label)}</button>`).join("")}</span></div>` : "";
		return `<div class="dlgbox what" role="dialog" aria-modal="true" aria-label="${esc(V.title)}"><h3>${esc(V.title)}</h3>
			<div class="whatsrc"><span class="ilab">${o.verb === "paste" ? "From" : "Track"}</span><span class="lcdchip">${esc(o.src)}</span><span>${esc(o.srcNote || "")}</span></div>
			${groups}${to}<p class="fine">${esc(o.fine || V.fine)}</p>
			<div class="btnrow"><button class="${o.verb === "clear" ? "danger" : "cream"}" data-dlg="0" data-wgo="1">${esc(label(o.verb, [], o.to ? o.to.filter(x => x.on && !x.why) : null))}</button><button data-dlg="1">Cancel</button></div></div>`;
	}
	/* what the dialog says now: the ticked parts and the lit tracks */
	function read(d) {
		return { what: [...d.querySelectorAll("input[data-wid]:checked")].map(x => x.dataset.wid),
			to: [...d.querySelectorAll("[data-wto][aria-pressed=true]")].map(x => +x.dataset.wto) };
	}
	let cur = null;
	/* the go key: off while nothing is ticked (or no track lit), its words say how many tracks */
	function sync(d) {
		if (!cur) return;
		const r = read(d), go = d.querySelector("[data-wgo]"); if (!go) return;
		go.textContent = label(cur.verb, r.what, cur.to ? r.to : null);
		go.disabled = !r.what.length || (!!cur.to && !r.to.length);
	}
	function open(o) {
		const ids = o.groups.flatMap(g => g.items.filter(it => !it.why).map(it => it.id));
		const on = ticked(o.editor, o.verb, ids, o.defaults);
		const run = () => { const d = document.querySelector("#dlg"), r = read(d); cur = null; remember(o.editor, o.verb, r.what); o.done(r.what, r.to); };
		Dlg.show({ key: "what", draw: () => {
			const d = document.querySelector("#dlg");
			cur = o; d.dataset.first = ""; d.innerHTML = html(o, on); d._btns = [["", "", run], ["Cancel", "", () => { cur = null; }]];
			d.hidden = false; sync(d);
		} });
	}
	const isOpen = () => !!cur && !document.querySelector("#dlg")?.hidden;
	/* the target keys toggle; a tick changes the go key (capture: before the pages' own click routers) */
	if (typeof document !== "undefined") {
		document.addEventListener("click", e => {
			const b = e.target.closest?.("#dlg .what [data-wto]"); if (!b || b.disabled) return;
			e.stopPropagation(); b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") !== "true"); sync(document.querySelector("#dlg"));
		}, true);
		document.addEventListener("change", e => { if (e.target.closest?.("#dlg .what")) sync(document.querySelector("#dlg")); }, true);
	}
	function menu(el, run) {
		const r = el.getBoundingClientRect();
		DeskMenu.open([{ id: "copy", label: "Copy…", key: VERBS.copy.key, run: () => run("copy") }, { id: "paste", label: "Paste…", key: VERBS.paste.key, run: () => run("paste") },
			{ id: "clear", label: "Clear…", key: VERBS.clear.key, run: () => run("clear") }, "-",
			{ note: "Choose what of the selected track: the machine's SUPER COPY and SUPER CLEAR" }], Math.max(4, r.right - 230), r.bottom + 4, { title: "Copy / paste / clear what" });
	}
	return { open, menu, html, read, ticked, remember, label, isOpen, VERBS };
})();
