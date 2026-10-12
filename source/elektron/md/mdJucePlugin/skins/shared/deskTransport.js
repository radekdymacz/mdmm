"use strict";
/* The transport beyond PLAY and STOP, both editors (wave 2, doc/modern-ux/DESIGN-machine-menus.md §2): the ▶ key's menu,
   the TEMPO pop-up under the LCD's tempo, and the words and numbers they share. Nothing here knows a machine: each page
   gives a host with its own commands.
     The ▶ menu (right-click ▶, or the ▾ in its corner, so nothing is only behind a right-click): Play / Stop, Pause /
     Continue, Record, Panic, each with its key. menuItems(state, host) is the list (pure); openMenu(x, y, state, host)
     shows it (deskMenu.js). state: {playing, paused, rec, can: {pause, record, panic}, reasons: {name: words}}.
     host: play(), stop(), pauseToggle(), record(), panic(), recordLabel. Paused, the first entry is Stop (it ends the
     pause) and the second Continue.
     The TEMPO pop-up (the machine's TEMPO menu): BPM − / + (⇧: a tenth), TAP, NUDGE −10 % / +10 % while held (the keys -
     and = too), "Change on release" (the tempo drag sends at the release; ⌥-drag the tempo does it once), the sync line.
     openTempo(anchor, host): host.bpm() the tempo shown, set(bpm), nudge(pct) (0 = let go), tap(), refused() the reason
     the tempo cannot be set here or "" (a DAW sets it), sync: {text: () => words, html?: () => markup, click?(action),
     global?: () => void}.
     delayed() / setDelayed(on): "Change on release", remembered in this browser only (a convenience, nothing breaks
     without it). nudged(bpm, pct) and clampBpm(v) are the numbers. Plain DOM, ES2020. */
const DeskTransport = (() => {
	const NUDGE = 10;
	const KEY = "desk.tempoDelayed";
	const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
	const clampBpm = v => Math.max(30, Math.min(300, Math.round(v * 10) / 10));
	/* the tempo while a nudge is held: pct % off, to a tenth of a BPM */
	const nudged = (bpm, pct) => clampBpm(bpm * (100 + pct) / 100);

	/* ---- the ▶ menu (pure list) ---- */
	function menuItems(st, h) {
		const can = st.can || {}, why = st.reasons || {};
		const items = [
			{ id: "play", label: st.playing || st.paused ? "Stop" : "Play", key: "Space", enabled: can.transport !== false, run: () => st.playing || st.paused ? h.stop() : h.play() },
			{ id: "pause", label: st.paused ? "Continue" : "Pause", key: "⇧Space", enabled: can.transport !== false && (st.playing || st.paused), run: () => h.pauseToggle() },
			{ id: "record", label: h.recordLabel || "Record", key: "⌥Space", enabled: can.record !== false, run: () => h.record() },
			"-",
			{ id: "panic", label: "Panic: all voices off", key: "⌘.", enabled: can.panic !== false, run: () => h.panic() }
		];
		if (can.panic === false && why.panic) items.push({ note: why.panic });
		return items;
	}
	function openMenu(x, y, st, h) {
		if (typeof DeskMenu !== "undefined") DeskMenu.open(menuItems(st, h), x, y, { title: "Transport" });
	}

	/* ---- "Change on release" (this browser only) ---- */
	function delayed() { try { return localStorage.getItem(KEY) === "1"; } catch (_) { return false; } }
	function setDelayed(on) { try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (_) { } }

	/* ---- the TEMPO pop-up ---- */
	let pop = null, host = null, anchorEl = null, held = 0;
	const q = s => pop && pop.querySelector(s);
	function draw() {
		if (!pop || !host) return;
		const v = q("#tpv"); if (v) v.textContent = (+host.bpm() || 0).toFixed(1);
		const why = host.refused ? host.refused() : "";
		pop.querySelectorAll("[data-tp]").forEach(b => { if (b.dataset.tp !== "close" && b.dataset.tp !== "glob") { b.disabled = !!why; b.title = why || b.dataset.title || ""; } });
		const s = q(".tsync"); if (s && host.sync) s.innerHTML = syncRow();
	}
	function syncRow() {
		const s = host.sync || {};
		return `<span class="ilab">Sync</span>${s.html ? s.html() : `<span class="note">${esc(s.text ? s.text() : "")}</span>`}`
			+ (s.global ? `<button data-tp="glob" class="tglob" title="GLOBAL › Sync: where the tempo comes from">Sync in GLOBAL →</button>` : "");
	}
	function place() {
		if (!pop || !anchorEl) return;
		const r = anchorEl.getBoundingClientRect(), w = pop.offsetWidth || 390, vw = document.documentElement.clientWidth || innerWidth;
		const left = Math.max(12, Math.min(vw - w - 12, r.left + r.width / 2 - 40));
		pop.style.left = left + "px"; pop.style.top = (r.bottom + 12) + "px";
		pop.style.setProperty("--ax", Math.max(10, r.left + r.width / 2 - left - 7) + "px");
	}
	function openTempo(anchor, h) {
		closeTempo();
		host = h; anchorEl = anchor;
		pop = document.createElement("div");
		pop.className = "tempopop"; pop.id = "tempopop"; pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", "Tempo");
		pop.innerHTML = `<div class="th1"><span class="cap">Tempo</span><span class="note">the machine's TEMPO menu</span><button class="libx" data-tp="close" title="Close (Esc)">Esc</button></div>
			<div class="bpmrow"><span class="bpmbig" id="tpv">0.0</span><small>BPM</small>
				<button class="sq" data-tp="-1" data-title="−1 BPM (⇧: −0.1)" aria-label="Slower">−</button><button class="sq" data-tp="1" data-title="+1 BPM (⇧: +0.1)" aria-label="Faster">+</button>
				<button class="tap" data-tp="tap" data-title="Tap the tempo (also ⇧B): four taps or more set it">TAP</button></div>
			<div class="tr"><span class="ilab">Nudge</span><button data-tp="n-" data-title="Hold: 10 % slower while held (key -)">◂ −10 %<kbd>-</kbd></button><button data-tp="n+" data-title="Hold: 10 % faster while held (key =)">+10 % ▸<kbd>=</kbd></button><span class="hold">hold; let go = back</span></div>
			<label class="tr"><input type="checkbox" id="tpdelay"${delayed() ? " checked" : ""}> Change on release <span class="hold">⌥-drag the tempo: once</span></label>
			<div class="tr tsync"></div>
			<div class="tnote">The tempo is global on the machine: a pattern does not store it, a song row can.</div>`;
		document.body.appendChild(pop);
		anchor.closest(".f")?.classList.add("tempof");
		anchor.setAttribute("aria-expanded", "true");
		draw(); place();
		pop.addEventListener("click", e => {
			const b = e.target.closest("[data-tp]"); if (!b || b.disabled) return;
			const a = b.dataset.tp;
			if (a === "close") { closeTempo(); return; }
			if (a === "glob") { closeTempo(); host.sync?.global?.(); return; }
			if (a === "tap") { host.tap(); setTimeout(draw, 0); return; }
			if (a === "-1" || a === "1") { host.set(clampBpm(+host.bpm() + (+a) * (e.shiftKey ? .1 : 1))); setTimeout(draw, 0); return; }
			if (a.startsWith("sync:")) host.sync?.click?.(a.slice(5));
		});
		pop.addEventListener("change", e => { if (e.target.id === "tpdelay") setDelayed(e.target.checked); });
		pop.addEventListener("pointerdown", e => { const b = e.target.closest('[data-tp="n-"],[data-tp="n+"]'); if (b && !b.disabled) nudge(b.dataset.tp === "n+" ? NUDGE : -NUDGE, b); });
		for (const ev of ["pointerup", "pointerleave", "pointercancel"]) pop.addEventListener(ev, () => { if (held && !keyHeld) nudge(0); });
		setTimeout(() => pop && q('[data-tp="tap"]')?.focus({ preventScroll: true }), 0);
		return pop;
	}
	function closeTempo() {
		if (held) nudge(0);
		if (!pop) return;
		pop.remove(); pop = null;
		anchorEl?.closest(".f")?.classList.remove("tempof");
		anchorEl?.setAttribute("aria-expanded", "false");
	}
	const tempoShown = () => !!pop;
	/* a nudge held (pct, the button) or let go (0); the host sends it, the pop-up shows it */
	let keyHeld = "";
	function nudge(pct, btn) {
		if (pct === held) return;
		held = pct;
		pop?.querySelectorAll(".nudging").forEach(x => x.classList.remove("nudging"));
		if (btn) btn.classList.add("nudging");
		host?.nudge(pct);
		setTimeout(draw, 0);
	}
	/* the keys - and = held: a nudge while down (the page's key map says when they are free), let go at the key's release */
	function nudgeKey(key, h) {
		if (keyHeld) return;
		if (!pop) host = h;
		keyHeld = key;
		nudge(key === "=" ? NUDGE : -NUDGE, q(key === "=" ? '[data-tp="n+"]' : '[data-tp="n-"]'));
	}
	if (typeof document !== "undefined") {
		document.addEventListener("keyup", e => { if (keyHeld && e.key === keyHeld) { keyHeld = ""; nudge(0); } }, true);
		addEventListener("blur", () => { if (keyHeld) { keyHeld = ""; nudge(0); } });
		document.addEventListener("keydown", e => { if (pop && e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); closeTempo(); } }, true);
		document.addEventListener("pointerdown", e => { if (pop && !pop.contains(e.target) && !(anchorEl && anchorEl.contains(e.target))) closeTempo(); }, true);
		addEventListener("resize", () => place());
	}

	/* A press on the tempo that does not move is a click (it opens the pop-up); one that moves is the drag. */
	function bindClick(el, open) {
		let d = null;
		el.addEventListener("pointerdown", e => { d = { x: e.clientX, y: e.clientY }; }, true);
		el.addEventListener("pointermove", e => { if (d && (Math.abs(e.clientY - d.y) > 2 || Math.abs(e.clientX - d.x) > 2)) d.moved = true; }, true);
		el.addEventListener("pointerup", e => { const was = d; d = null; if (was && !was.moved && Math.abs(e.clientY - was.y) < 3 && Math.abs(e.clientX - was.x) < 3) setTimeout(open, 0); }, true);
	}

	return { menuItems, openMenu, openTempo, closeTempo, tempoShown, refreshTempo: draw, nudgeKey, nudgeHeld: () => held, bindClick, delayed, setDelayed, nudged, clampBpm, NUDGE };
})();
if (typeof module !== "undefined") module.exports = { DeskTransport };
