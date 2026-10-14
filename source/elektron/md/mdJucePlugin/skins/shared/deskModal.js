"use strict";
/* The modal layer (P7): one modal system for every dialog of both editors, one file for both editors and
   both mockups (skins/shared/, its stylesheet deskModal.css). The dialogs keep their own open and close
   functions; this layer watches them (their hidden attribute) and gives every one the same behaviour:
   centred on the window over a dimmed backdrop, focus inside it (Tab goes round), Esc by its kind, focus back where it
   was when it closes. Every dialog locks (Radek, review 1, 2026-10-12): a click outside never closes it (the box nudges);
   it closes by its own keys (Cancel, Close, Done, OK, Esc) or Esc. While it works (an import, a reset: the dialog says
   so with data-busy) Esc is refused too, so the work stays in sight. Stacked: the newest is on top and only it answers.
   The kinds, as data:
     confirm  a question (the plug-in's asks, the first-run notice): Esc is its last key (Cancel, Close), the first
              focus is its last key (never the destructive one)
     panel    a library, settings or list, the GLOBAL page (a modal again since review 1): Esc closes it (its own close
              function)
     boot     the start-up card (deskBoot.js): nothing closes it but the machine becoming ready
     menu     a context menu (deskMenu.js, K3): at the pointer, nothing dimmed, Esc and a click outside close it (a menu,
              not a dialog: nothing in it runs)
   A listbox (the dropdowns) is not a modal: it stays at its button. */
const Modal = (() => {
	const KINDS = { confirm: { outside: false, focusLast: true, esc: true }, panel: { outside: false, focusLast: false, esc: true },
		boot: { outside: false, focusLast: false, esc: false }, menu: { outside: true, focusLast: false, esc: true } };
	const DIALOGS = [["#dlg", "confirm", null], ["#libpop", "panel", "closeLib"], ["#globpop", "panel", "closeGlobal"],
		["#keyspop", "panel", "toggleKeys"], ["#audiopop", "panel", "closeAudio"], ["#machpop", "panel", "closePicker"], ["#bootcard", "boot", null],
		["#syxpop", "panel", null], ["#genpop", "panel", "closeGen", { drag: ".gdhead", place: "placeGen", clear: true, through: "[data-genopen]" }], ["#deskmenu", "menu", "closeDeskMenu"]];
	/* A row's 4th item is its options, all opt-in: drag (a selector: the handle that moves the dialog; the place is kept for the
	   session, a double-click on the handle puts it back; dragging is no click outside, the dialog stays locked), place (the name
	   of a function (el) -> {left, top} for where it opens when nobody moved it), clear (no dimmed backdrop), through (a selector:
	   a click outside, on an element that matches, goes to that element: the one way the page behind may answer a dialog). */
	const OPTS = Object.fromEntries(DIALOGS.map(([sel, , , o]) => [sel, o || {}]));
	const moved = {};	/* the session's remembered places, by the dialog's selector: {left, top} */
	const stack = [];	// {el, kind, close, back}
	const FOCUSABLE = 'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea,[tabindex]:not([tabindex="-1"])';
	let bg = null;
	/* an overlay dialog (the questions, the start-up card) is its own backdrop area; its box is inside */
	const overlay = el => el.id === "dlg" || el.id === "bootcard";
	const box = d => overlay(d.el) ? d.el.querySelector(".dlgbox,.bootbox") || d.el : d.el;
	const keys = d => [...box(d).querySelectorAll(FOCUSABLE)].filter(e => e.offsetParent !== null || e === document.activeElement);
	const opts = d => OPTS["#" + d.el.id] || {};
	/* where a dialog with options sits: the place the person moved it to, else its own place function's, kept inside the window */
	function place(id) {
		const d = stack.find(x => x.el.id === id), o = d && opts(d); if (!d || !(o.drag || o.place)) return;
		const el = d.el, f = o.place && window[o.place];
		let p = moved["#" + id] || (typeof f === "function" ? f(el) : null);
		if (!p) { for (const k of ["left", "top", "transform"]) el.style.removeProperty(k); return; }
		const left = Math.max(8, Math.min(innerWidth - el.offsetWidth - 8, p.left)), top = Math.max(8, Math.min(innerHeight - el.offsetHeight - 8, p.top));
		el.style.setProperty("left", left + "px", "important"); el.style.setProperty("top", top + "px", "important"); el.style.setProperty("transform", "none", "important");
	}
	function layer() {
		if (!bg) { bg = document.createElement("div"); bg.id = "modalbg"; bg.className = "modalbg"; bg.hidden = true; document.body.appendChild(bg); }
		bg.hidden = !stack.length;
		bg.classList.toggle("through", stack.length > 0 && !!opts(stack[stack.length - 1]).through);
		bg.classList.toggle("clear", stack.length > 0 && (stack[stack.length - 1].kind === "menu" || !!opts(stack[stack.length - 1]).clear));	/* a menu dims nothing */
		stack.forEach((d, i) => { d.el.classList.add("modal"); d.el.style.setProperty("--mz", 60 + i * 2); });
		if (stack.length) bg.style.setProperty("--mz", 59 + (stack.length - 1) * 2);
		document.documentElement.classList.toggle("modalopen", stack.length > 0);
	}
	function focusIn(d) {
		const k = keys(d), ask = d.el.querySelector(".btnrow button:last-child");
		const first = KINDS[d.kind].focusLast && ask ? ask : k.find(e => !e.matches(".libx,[data-keysx]")) || k[0];
		(first || box(d)).focus({ preventScroll: true });
	}
	function shown(el, kind, close) {
		if (stack.some(d => d.el === el)) return;
		const d = { el, kind, close, back: document.activeElement };
		stack.push(d); layer(); place(el.id);
		if (!box(d).hasAttribute("tabindex")) box(d).setAttribute("tabindex", "-1");
		/* after the dialog's own focus call (a timer, not a frame: a window behind others draws no frames) */
		setTimeout(() => { if (stack.includes(d) && (KINDS[d.kind].focusLast || !box(d).contains(document.activeElement))) focusIn(d); }, 0);
	}
	function gone(el) {
		const i = stack.findIndex(d => d.el === el); if (i < 0) return;
		const [d] = stack.splice(i, 1); el.classList.remove("modal"); layer();
		if (d.back && d.back.isConnected && !stack.length) d.back.focus({ preventScroll: true });
		else if (stack.length) focusIn(stack[stack.length - 1]);
	}
	const nudge = d => { const b = box(d); b.classList.remove("nudge"); void b.offsetWidth; b.classList.add("nudge"); };
	/* close the top one as its kind says: a confirm by its last key (the dialog's own handler runs); a dialog at work
	   (data-busy) stays */
	function dismiss(d) {
		if (!KINDS[d.kind].esc) return;
		if (d.el.dataset && d.el.dataset.busy) { nudge(d); return; }
		if (d.kind === "confirm") { const b = d.el.querySelector(".btnrow button:last-child"); if (b) b.click(); else d.el.hidden = true; return; }
		const f = d.close && window[d.close]; if (typeof f === "function") f(false); if (!d.el.hidden) d.el.hidden = true;
	}
	const top = () => stack[stack.length - 1];
	function watch() {
		for (const [sel, kind, close] of DIALOGS) {
			const el = document.querySelector(sel); if (!el) continue;
			new MutationObserver(() => el.hidden ? gone(el) : shown(el, kind, close)).observe(el, { attributes: true, attributeFilter: ["hidden"] });
			if (!el.hidden) shown(el, kind, close);
		}
	}
	/* the handle of a dialog with a drag option: press and move to move it; double-click: back to its own place */
	let drag = null;
	document.addEventListener("pointerdown", e => {
		if (e.button !== 0) return;
		/* the dialog the handle belongs to, not only the top one: a menu or notice stacked later must not take the drag away */
		const d = stack.find(x => { const o = opts(x); return o.drag && e.target.closest?.(o.drag) && x.el.contains(e.target); }); if (!d) return;
		const o = opts(d), h = e.target.closest(o.drag);
		const r = d.el.getBoundingClientRect();
		drag = { d, dx: e.clientX - r.left, dy: e.clientY - r.top, h }; h.classList.add("dragging"); e.preventDefault();
		try { h.setPointerCapture(e.pointerId); } catch (_) { /* a pointer the browser no longer tracks: the move still works */ }
	}, true);
	document.addEventListener("pointermove", e => {
		if (!drag) return;
		moved["#" + drag.d.el.id] = { left: e.clientX - drag.dx, top: e.clientY - drag.dy }; place(drag.d.el.id);
	});
	const dragEnd = () => { if (drag) { drag.h.classList.remove("dragging"); drag = null; } };
	document.addEventListener("pointerup", dragEnd); document.addEventListener("pointercancel", dragEnd);
	document.addEventListener("dblclick", e => {
		const d = top(); if (!d) return; const o = opts(d);
		if (o.drag && e.target.closest?.(o.drag)) { delete moved["#" + d.el.id]; place(d.el.id); }
	});
	window.addEventListener("resize", () => { const d = top(); if (d && (opts(d).drag || opts(d).place)) place(d.el.id); });
	/* first in line (this file loads before the dialogs' own handlers): Esc, Tab and the backdrop */
	document.addEventListener("keydown", e => {
		const d = top(); if (!d) return;
		if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); dismiss(d); return; }
		/* keys meant for the page behind (its shortcuts) do not reach it; ⌘ (Ctrl off a Mac: deskKeys.js Modifiers) passes,
		   for the menu bar's own shortcuts and the map's modal: "panel" entries (⌘Z over a panel) */
		const cmd = typeof Modifiers !== "undefined" ? Modifiers.cmd(e) : e.metaKey;
		if (e.key !== "Tab") { if (!box(d).contains(e.target) && !e.target.closest?.("#kpop,.vedit") && !cmd) { e.preventDefault(); e.stopImmediatePropagation(); } return; }
		const k = keys(d); if (!k.length) { e.preventDefault(); return; }
		const i = k.indexOf(document.activeElement), n = e.shiftKey ? (i <= 0 ? k.length - 1 : i - 1) : (i < 0 || i === k.length - 1 ? 0 : i + 1);
		e.preventDefault(); k[n].focus();
	}, true);
	for (const ev of ["pointerdown", "mousedown", "click"]) document.addEventListener(ev, e => {
		const d = top(); if (!d) return;
		/* a dialog with a through option has no backdrop in the way: the page behind is reached, and refused here unless the
		   target matches `through` (its own keys, the value field and the pop-up list are the dialog's) */
		const thr = opts(d).through, behind = thr && !d.el.contains(e.target) && !e.target.closest?.(thr + ",.vedit,#kpop,#toast");
		const outside = e.target === bg || (overlay(d.el) && e.target === d.el) || behind;
		if (!outside) return;
		e.preventDefault(); e.stopImmediatePropagation();
		if (ev === "click") { if (KINDS[d.kind].outside) dismiss(d); else nudge(d); }
	}, true);
	/* focus that leaves the top dialog (a click on the page behind is stopped above) comes back */
	document.addEventListener("focusin", e => { const d = top(); if (d && !d.el.contains(e.target) && e.target !== bg && !e.target.closest?.("#kpop,.vedit")) focusIn(d); });
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch); else watch();
	/* Tips: the LCD's titles show under the display, never over it (a native tooltip covers the fields) */
	const tip = document.createElement("div"); tip.className = "lcdtip"; tip.hidden = true; tip.setAttribute("role", "tooltip"); document.body.appendChild(tip);
	let tipT = 0;
	document.addEventListener("mouseover", e => {
		const el = e.target.closest?.(".lcdpanel [title],.lcdpanel [data-tip]"), lcd = el?.closest(".lcdpanel");
		clearTimeout(tipT); tip.hidden = true;
		if (!el || !lcd) return;
		if (el.title) { el.dataset.tip = el.title; el.removeAttribute("title"); }
		tipT = setTimeout(() => {
			/* never over an open menu (its list opens where the tip would show) */
			if (document.querySelector("#kpop:not([hidden])") || el.closest("[aria-expanded=true]")) return;
			const r = el.getBoundingClientRect(), l = lcd.getBoundingClientRect();
			tip.textContent = el.dataset.tip; tip.hidden = false;
			tip.style.top = (l.bottom + 8) + "px";
			tip.style.left = Math.max(8, Math.min(innerWidth - tip.offsetWidth - 8, r.left + r.width / 2 - tip.offsetWidth / 2)) + "px";
		}, 450);
	});
	/* a press ends the tip at once: the press may open a menu */
	document.addEventListener("pointerdown", () => { clearTimeout(tipT); tip.hidden = true; }, true);
	document.addEventListener("mouseout", e => { if (e.target.closest?.(".lcdpanel")) { clearTimeout(tipT); tip.hidden = true; } });
	/* a title set later (a state's new words) moves to the tip too */
	new MutationObserver(ms => { for (const m of ms) { const el = m.target; if (el.title && el.closest?.(".lcdpanel")) { el.dataset.tip = el.title; el.removeAttribute("title"); } } })
		.observe(document.body, { attributes: true, attributeFilter: ["title"], subtree: true });
	return { place, open: () => stack.map(d => d.el.id), top: () => top()?.el.id || null, kind: () => top()?.kind || null };
})();
/* The question dialog (#dlg) of both editors is one at a time, and what wants it next waits its turn: nothing
   replaces what it shows. A page shows a question as an item {draw, notice?, cancel?, key?}: draw() writes the
   dialog and unhides it; a notice (a question the plug-in waits on: its callback runs only when it is answered)
   goes before every other item, and one that shows when it comes waits behind it and is drawn again after; a
   notice is always answered: closed in any other way than its own keys, cancel() answers it (its last key).
   key: an item already showing or waiting with the same key is not added again. The dialog closes by its
   hidden attribute, whoever sets it; then the next item is drawn. drop(key) withdraws an item that is no longer
   wanted (the no-ROM screen once a firmware runs), shown or waiting. A notice drawn over a dialog in place takes
   no click for a moment (GUARD_MS): a click meant for the old dialog's key must not answer the plug-in. */
const Dlg = (() => {
	const waiting = [], GUARD_MS = 300;
	let now = null, el = null, guardUntil = 0;
	const dlg = () => document.querySelector("#dlg");
	/* the item shown is gone (the dialog was closed): a notice not answered by its keys is answered now */
	function gone() { const was = now; now = null; if (was && was.notice && was.cancel && !was.done) { was.cancel(); was.done = true; } }
	function draw(item) { if (now && el && el.hidden) gone(); now = item; item.draw(); }
	function closed() {
		if (!el || !el.hidden) return;
		gone();
		if (!now && waiting.length && el.hidden) draw(waiting.shift());
	}
	function watch() {
		const d = dlg(); if (!d || d === el) return;
		el = d;
		if (typeof MutationObserver !== "undefined") new MutationObserver(closed).observe(el, { attributes: true, attributeFilter: ["hidden"] });
	}
	function show(item) {
		watch();
		const open = !!el && !el.hidden;
		if (item.key && ((open && now && now.key === item.key) || waiting.some(w => w.key === item.key))) return;
		if (!open) { draw(item); return; }
		if (item.notice && !(now && now.notice)) { if (now) waiting.unshift(now); now = null; guardUntil = Date.now() + GUARD_MS; draw(item); return; }
		/* notices in their order, before every other item */
		const at = item.notice ? waiting.findIndex(w => !w.notice) : -1;
		at < 0 ? waiting.push(item) : waiting.splice(at, 0, item);
	}
	/* withdraw every item with that key: a waiting one leaves the queue, a shown one closes; true when there was one */
	function drop(key) {
		let any = false;
		for (let i = waiting.length - 1; i >= 0; i--) if (waiting[i].key === key) { waiting.splice(i, 1); any = true; }
		if (now && now.key === key && el && !el.hidden) { el.hidden = true; any = true; }
		return any;
	}
	/* first in line (capture): a press or a click on the dialog just replaced in place is not for its new keys */
	for (const ev of ["pointerdown", "mousedown", "click"]) document.addEventListener(ev, e => {
		if (Date.now() >= guardUntil || !el || !el.contains?.(e.target)) return;
		e.preventDefault(); e.stopImmediatePropagation();
	}, true);
	return { show, closed, drop, waiting: () => waiting.length, get now() { return now; } };
})();
/* The banner (I-005, doc/modern-ux/DESIGN-updates.md): a plug-in notice with "modal": false is not a question in
   the dialog but a strip at the window's bottom right: no backdrop, no focus taken, the page plays on under it, and
   Esc or a page key never reaches it. One at a time: a newer one replaces it (the plug-in has forgotten the older
   one's answer). One with no title and no text takes it away. A key answers it once and closes it. */
const Banner = (() => {
	let el = null, answer = null;
	function hide() { if (el) el.hidden = true; answer = null; }
	function show(m, onAnswer) {
		if (!m.title && !m.text) { hide(); return; }
		if (!el) {
			el = document.createElement("div"); el.className = "gmbanner"; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite");
			document.body.appendChild(el);
		}
		answer = onAnswer;
		const title = document.createElement("b"), text = document.createElement("p"), row = document.createElement("div");
		title.textContent = m.title || ""; text.textContent = m.text || ""; row.className = "btnrow";
		const names = m.buttons || [];
		names.forEach((name, i) => {
			const b = document.createElement("button"); b.type = "button"; b.textContent = name;
			if (i === 0 && names.length > 1) b.className = "cream";
			const mine = answer;
			b.addEventListener("click", () => { if (answer !== mine) return; hide(); if (mine) mine(i); });
			row.appendChild(b);
		});
		el.replaceChildren(title, text, row);
		el.hidden = false;
	}
	return { show, hide, get shown() { return !!el && !el.hidden; } };
})();
/* The answer to a plug-in notice m (deskHost.cpp noticeAnswer), the dialog's and the banner's, both editors: the
   button pressed, on the notice numbered m.id. That number goes as "notice", never as "id": "id" is the request's own,
   which Bridge.send gives every request, so a notice number sent as "id" would be overwritten. The plug-in refuses an
   answer to a notice that waits for none (answered already, replaced by a newer banner): nothing for the user to do,
   so a page sends it with noticeRefused as its onResult (the log only). */
const noticeAnswer = (m, button) => ({ op: "noticeAnswer", notice: m.id, button });
const noticeRefused = r => { if (!r.ok) Bridge.log("noticeAnswer refused: " + (r.errors || []).join("; ")); };
