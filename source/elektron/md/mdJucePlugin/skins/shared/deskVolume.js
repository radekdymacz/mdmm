"use strict";
/* I-021: the output meter and master volume in the LCD, both editors (plug-in and standalone). A vertical strip at
   the LCD's right end (about 30 px), both rows tall: two thin bars, the main output's left and right after the volume,
   rising from the bottom, each with its peak hold line; a clip mark at the top of the strip (lit when any output went
   over 0 dBFS, a click clears it); and the volume as one line across both bars on the same scale (-60 dB at the foot,
   +6 dB at the head, a tick at 0 dB: the line at the tick is unity, a bar at the tick is 0 dBFS). Drag the strip up or
   down (Shift: finer) or scroll over it to set the volume, double-click for 0 dB; at the foot it is off. While the
   volume changes, a readout under the LCD says it in dB. Only the LCD's own ink and ground, never a warning colour: a
   clip is the top mark filled. The volume is the plug-in's output gain after the emulation (mdOutputLevel.h; the
   machine's own volume is untouched), saved with the project and the standalone's state. The plug-in sends
   "outputLevel" every 250 ms (mdDeskSession.cpp outputLevelOf: peakL, peakR since the last one, clip, gainDb); the
   page sends outputGain {db}.
     DeskVolume.pos(db)            where a dB value sits on the strip, 0 (foot, -60 dB) to 1 (head, +6 dB) (pure)
     DeskVolume.ballistics(s, m, t) the meter after a message at t ms (pure): each side {level, hold, holdAt}, instant
                                    attack, about 300 ms release, the peak held 1.5 s; the clip latched until cleared
     DeskVolume.dragDb(db, dy, fine) the volume after a drag of dy px (up: negative) from db (pure; null = off)
     DeskVolume.wheelDb(db, steps)  the volume after wheel steps (up: positive) from db (pure)
     DeskVolume.text(db)           the volume as words ("-3.5 dB", "+6.0 dB", "off") (pure)
     DeskVolume.update(m)          an outputLevel message: the strip (made in the LCD the first time) and readout
     DeskVolume.connect(send)      the page's way to the plug-in (Bridge.send, the MM adapter's send)
     DeskVolume.state              the meter's state now; DeskVolume.gain: the volume shown (dB or null);
     DeskVolume.last               the plug-in's last outputLevel message, or null
   Older WebKit (macOS 12): ES2020; its stylesheet (deskVolume.css) has no color-mix and no :has(). */
const DeskVolume = (() => {
	const MIN = -60, MAX = 6, RELEASE_MS = 300, HOLD_MS = 1500, PX_PER_DB = 2, FINE = 0.2;
	const clampDb = db => Math.max(MIN, Math.min(MAX, db));
	const round1 = x => Math.round(x * 10) / 10;
	const dbOfLevel = v => (v > 0 ? 20 * Math.log10(v) : -Infinity);
	function pos(db) {
		if (db == null || !(db > MIN)) return 0;
		return (Math.min(db, MAX) - MIN) / (MAX - MIN);
	}
	function text(db) {
		if (db == null || !(db > MIN)) return "off";
		return (db > 0 ? "+" : db < 0 ? "-" : "") + Math.abs(db).toFixed(1) + " dB";
	}
	/* one side of the meter after a peak dt ms later (pure). c: {level, hold, holdAt} */
	function side(c, peak, dt, t) {
		peak = typeof peak === "number" && peak > 0 ? peak : 0;
		const fallen = c.level * Math.exp(-dt / RELEASE_MS);
		const level = Math.max(peak, fallen < 1e-5 ? 0 : fallen);
		let hold = c.hold, holdAt = c.holdAt;
		if (peak >= hold || t - holdAt > HOLD_MS) { hold = peak >= hold ? peak : level; holdAt = t; }
		return { level, hold, holdAt };
	}
	/* the meter after a message at t (pure). s: {l, r, clip, at} */
	function ballistics(s, m, t) {
		const quiet = { level: 0, hold: 0, holdAt: -1e9 };
		s = s || { l: quiet, r: quiet, clip: false, at: t };
		const dt = Math.max(0, t - s.at);
		return { l: side(s.l, m && m.peakL, dt, t), r: side(s.r, m && m.peakR, dt, t), clip: s.clip || !!(m && m.clip), at: t };
	}
	function dragDb(db, dy, fine) {
		const from = db == null ? MIN : db;
		const to = clampDb(from - dy / PX_PER_DB * (fine ? FINE : 1));
		return to <= MIN ? null : round1(to);
	}
	function wheelDb(db, steps) {
		const from = db == null ? MIN : db;
		/* whole dB a step, onto whole dB: -3.4 up one is -3, down one -4 */
		const to = clampDb(steps > 0 ? Math.floor(from + 1e-9) + steps : Math.ceil(from - 1e-9) + steps);
		return to <= MIN ? null : round1(to);
	}

	let last = null, send = null, el = null, tip = null, state = null, gain = 0, localAt = -1e9, drag = null, wheelAcc = 0, tipT = 0;
	const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
	function panel() { return typeof document !== "undefined" ? document.querySelector(".lcdgroup .lcdpanel") : null; }
	function ensure() {
		if (el && el.isConnected) return el;
		const p = panel();
		if (!p) return null;
		el = document.createElement("div");
		el.id = "volf";
		el.className = "volf";
		el.setAttribute("role", "slider");
		el.setAttribute("tabindex", "0");
		el.setAttribute("aria-label", "Volume: the editor's output. Drag or scroll, double-click for 0 dB");
		el.setAttribute("aria-valuemin", String(MIN));
		el.setAttribute("aria-valuemax", String(MAX));
		const bar = side => `<span class="volbar vol${side}"><i class="volfill"></i><i class="volhold"></i></span>`;
		el.innerHTML = '<i class="volclip"></i><span class="volbars">' + bar("L") + bar("R") + '<i class="volzero"></i><i class="volcap"></i></span>';
		p.appendChild(el);
		p.classList.add("hasvol");
		tip = document.createElement("div");
		tip.className = "lcdtip voltip";
		tip.hidden = true;
		tip.setAttribute("role", "status");
		document.body.appendChild(tip);
		el.addEventListener("pointerdown", down);
		/* a click does not take the keyboard (the arrows stay the page's); Tab reaches it */
		el.addEventListener("mousedown", e => e.preventDefault());
		el.addEventListener("pointermove", move);
		el.addEventListener("pointerup", up);
		el.addEventListener("pointercancel", up);
		el.addEventListener("dblclick", e => { e.preventDefault(); set(0); });
		el.addEventListener("wheel", wheel, { passive: false });
		el.addEventListener("keydown", key);
		return el;
	}
	function set(db) {
		gain = db;
		localAt = now();
		/* the readout while the volume changes, and a moment after */
		clearTimeout(tipT);
		tipT = setTimeout(draw, 900);
		if (send) send({ op: "outputGain", db: db == null ? MIN : db }, { key: "outputGain" });
		draw();
	}
	function down(e) {
		if (e.button !== 0) return;
		e.preventDefault();
		try { el.setPointerCapture(e.pointerId); } catch (_) { }
		drag = { y: e.clientY, db: gain, moved: false };
		draw();
	}
	function move(e) {
		if (!drag) return;
		const dy = e.clientY - drag.y;
		if (!drag.moved && Math.abs(dy) < 2) return;
		drag.moved = true;
		const db = dragDb(drag.db, dy, e.shiftKey);
		if (db !== gain) set(db);
	}
	function up() {
		if (!drag) return;
		const clicked = !drag.moved;
		drag = null;
		if (clicked && state && state.clip) state = Object.assign({}, state, { clip: false });
		draw();
	}
	function wheel(e) {
		e.preventDefault();
		const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
		wheelAcc -= (e.deltaY || e.deltaX) * unit;
		/* a dB for each 100 px of scroll (a mouse wheel's notch; a trackpad's small steps add up) */
		const steps = Math.trunc(wheelAcc / 100);
		if (!steps) return;
		wheelAcc -= steps * 100;
		set(wheelDb(gain, steps));
	}
	function key(e) {
		const k = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
		if (k) { e.preventDefault(); e.stopPropagation(); set(e.shiftKey ? dragDb(gain, -k * PX_PER_DB, true) : wheelDb(gain, k)); }
		else if (e.key === "0") { e.preventDefault(); e.stopPropagation(); set(0); }
	}
	function draw() {
		const b = ensure();
		if (!b) return;
		const quiet = { level: 0, hold: 0 };
		const s = state || { l: quiet, r: quiet, clip: false };
		for (const [k, c] of [["L", s.l], ["R", s.r]]) {
			const bar = b.querySelector(".vol" + k);
			bar.querySelector(".volfill").style.height = (pos(dbOfLevel(c.level)) * 100).toFixed(1) + "%";
			const h = bar.querySelector(".volhold");
			h.style.bottom = (pos(dbOfLevel(c.hold)) * 100).toFixed(1) + "%";
			h.hidden = !(c.hold > 0.001);
			bar.dataset.level = String(Math.round(c.level * 10000) / 10000);
		}
		b.querySelector(".volcap").style.bottom = (pos(gain) * 100).toFixed(1) + "%";
		b.querySelector(".volzero").style.bottom = (pos(0) * 100).toFixed(1) + "%";
		b.classList.toggle("clip", !!s.clip);
		b.classList.toggle("off", gain == null);
		b.classList.toggle("drag", !!drag);
		b.setAttribute("aria-valuenow", String(gain == null ? MIN : gain));
		b.setAttribute("aria-valuetext", text(gain));
		b.dataset.gain = gain == null ? "off" : String(gain);
		b.dataset.clip = s.clip ? "1" : "";
		const shown = !!drag || now() - localAt < 900;
		tip.textContent = "Volume " + text(gain);
		tip.hidden = !shown;
		if (shown) {
			const r = b.getBoundingClientRect(), l = panel().getBoundingClientRect();
			tip.style.top = (l.bottom + 8) + "px";
			tip.style.left = Math.max(8, Math.min(innerWidth - tip.offsetWidth - 8, r.left + r.width / 2 - tip.offsetWidth / 2)) + "px";
		}
	}
	function update(m) {
		last = m;
		state = ballistics(state, m, now());
		/* the plug-in's volume, unless the person moved it just now (the message may be older than the move) */
		if (!drag && now() - localAt > 600 && m && "gainDb" in m) gain = typeof m.gainDb === "number" ? m.gainDb : null;
		draw();
	}
	function connect(f) { send = f; }
	return { pos, text, ballistics, dragDb, wheelDb, update, connect, MIN, MAX, get state() { return state; }, get gain() { return gain; }, get last() { return last; } };
})();
if (typeof module !== "undefined") module.exports = DeskVolume;
