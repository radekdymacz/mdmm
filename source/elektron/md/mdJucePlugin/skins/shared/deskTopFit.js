"use strict";
/* The top bar's measured fit (B-061, B-065, B-066), both editors. One measurement instead of widths by media query: a page
   zoomed below 100 % (a window under 1440 x 720 points, or the user's zoom) has its 9 to 15 px text raised by WebKit to 9
   points on screen (its minimum logical font size), so the same CSS width holds less there (B-056).
     What it keeps true: every key of the top bar wholly inside the header, every slot of the LCD's second row visible, and
     the LCD one size on every workspace.
     How: the LCD is as wide as the widest second row of any workspace asks (TopFit.connect gives it a way to draw each
     workspace's line 2 in turn, without painting between), as min-width on the panel; if the bar is then wider than the
     window it tightens in steps, tf1 to tf4 on the header (deskTopFit.css, each keeps the ones before it), and measures
     again. The first step that fits stays. The LCD never moves with the workspace: only a value that grows past what the
     line 2 held (a longer value in a slot) widens it, and a fit again (window, zoom, the meter or the volume strip made,
     fonts loaded) starts from nothing.
     TopFit.connect({workspaces, current, show, done}): workspaces() the names of the workspaces, current() the one shown,
     show(ws) draws the LCD's line 2 for it (renderSub with S.ws set), done() (optional) once the shown one is back. TopFit.fit() measures now; TopFit.report() what it
     chose ({step, need, workspaces}); TopFit.onShow, if set, runs after each workspace's line 2 is drawn (the journeys' text floor). Plain DOM, ES2020 (an older WebKit, deskCompat.js). */
const TopFit = (() => {
	const STEPS = ["tf1", "tf2", "tf3", "tf4"];
	let host = null, busy = false, queued = 0, last = { step: 0, need: 0, workspaces: [] }, watchTop = null, watchRow = null, watchPanel = null, lastW = 0;
	const q = s => document.querySelector(s);
	/* how far line 2 runs past the room it has: its last slot's right edge against the row's inner right edge */
	function deficit() {
		const l2 = q("#lcd2");
		/* a word the page put on line 2 for a moment (the Machinedrum's mute message) is not a row of slots */
		if (!l2 || !l2.lastElementChild || l2.querySelector(".lcdmsg")) return 0;
		const cs = getComputedStyle(l2), room = l2.getBoundingClientRect().right - (parseFloat(cs.paddingRight) || 0);
		let end = 0;
		for (const s of l2.children) { const r = s.getBoundingClientRect(); if (r.width > 0) end = Math.max(end, r.right); }
		return Math.max(0, end - room);
	}
	/* the bar's keys past the header's right edge, or its content wider than it (the header is a grid whose columns grow) */
	function overflows() {
		const top = q("header.top") || q(".top");
		if (!top) return false;
		const lim = top.getBoundingClientRect().right + 0.5;
		for (const b of top.querySelectorAll("button")) { const r = b.getBoundingClientRect(); if (r.width > 0 && (r.right > lim || r.left < -0.5)) return true; }
		/* the groups (brand and workspaces, the LCD, the Setup keys) do not run into each other */
		const g = [".left", ".midgrp", ".rightgrp"].map(c => top.querySelector(c)).filter(Boolean).map(e => e.getBoundingClientRect());
		for (let i = 1; i < g.length; i++) if (g[i].left < g[i - 1].right - 0.5) return true;
		return top.scrollWidth > top.clientWidth + 1;
	}
	/* the panel wide enough for the widest line 2 of every workspace */
	function calibrate(panel, names) {
		panel.style.minWidth = "";
		const border = getComputedStyle(panel).boxSizing === "border-box";
		const pad = border ? 0 : (parseFloat(getComputedStyle(panel).paddingLeft) || 0) + (parseFloat(getComputedStyle(panel).paddingRight) || 0);
		for (let pass = 0; pass < 8; pass++) {
			let most = 0;
			for (const w of names) { show(w); most = Math.max(most, deficit()); }
			if (most <= 0.5) break;
			/* the panel's other columns take their share of what it grows by: a little more than the deficit each pass */
			panel.style.minWidth = (panel.getBoundingClientRect().width - pad + most * 1.4 + 1) + "px";
		}
	}
	/* host.show, then the journeys' hook (onShow): the page zoomed out is emulated there, on the new elements, before they are measured */
	function show(w) { host.show(w); if (typeof api.onShow === "function") api.onShow(); }
	function fit() {
		const top = q("header.top") || q(".top"), panel = q(".lcdpanel");
		if (busy || !host || !top || !panel) return;
		busy = true;
		unwatch();
		try {
			const names = host.workspaces(), now = host.current();
			let step = 0;
			for (; step <= STEPS.length; step++) {
				top.classList.remove(...STEPS);
				for (let i = 0; i < step; i++) top.classList.add(STEPS[i]);
				calibrate(panel, names);
				if (!overflows()) break;
			}
			if (step > STEPS.length) step = STEPS.length;
			show(now);
			if (typeof host.done === "function") host.done();
			last = { step, need: Math.round(panel.getBoundingClientRect().width), workspaces: names };
			lastW = top.getBoundingClientRect().width;
		} finally { busy = false; watch(); }
	}
	/* line 2 drawn again by the page (a value changed): wider than the LCD holds, fit again; nothing else moves */
	function check() {
		queued = 0;
		if (busy || !host) return;
		if (deficit() > 0.5) fit();
	}
	function later(f) { if (!queued) queued = requestAnimationFrame(f === fit ? () => { queued = 0; fit(); } : check); }
	function unwatch() { for (const w of [watchTop, watchRow, watchPanel]) if (w) w.disconnect(); watchTop = watchRow = watchPanel = null; }
	function watch() {
		const l2 = q("#lcd2"), panel = q(".lcdpanel"), top = q("header.top") || q(".top");
		if (l2 && typeof MutationObserver !== "undefined") { watchRow = new MutationObserver(() => later(check)); watchRow.observe(l2, { childList: true, subtree: true, characterData: true }); }
		/* the meter or the volume strip made, the engine card, the kit name: the panel's own members */
		if (panel && typeof MutationObserver !== "undefined") { watchPanel = new MutationObserver(() => later(fit)); watchPanel.observe(panel, { childList: true, attributes: true, attributeFilter: ["class"] }); }
		if (top && typeof ResizeObserver !== "undefined") { watchTop = new ResizeObserver(() => { if (Math.abs(top.getBoundingClientRect().width - lastW) > 0.5) later(fit); }); watchTop.observe(top); }
	}
	function connect(h) {
		host = h;
		const start = () => { fit(); if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => later(fit)); };
		if (document.readyState === "complete") start(); else window.addEventListener("load", start, { once: true });
		window.addEventListener("resize", () => later(fit));
		const cpu = q(".setgroup .grplabel"); if (cpu && typeof MutationObserver !== "undefined") new MutationObserver(() => later(fit)).observe(cpu, { childList: true });
	}
	const api = { connect, fit, report: () => last, overflows, onShow: null };
	return api;
})();
