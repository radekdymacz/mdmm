"use strict";
/* I-018: the CPU meter in the top bar, both editors (plug-in and standalone): beside the version in the Setup group's
   label, how much of each audio block's real-time budget the editor's processBlock spends (the emulation, the
   resampler, MIDI), smoothed over about half a second, with the worst single block of the last 3 s marked on the
   bar (what clicks: a block over 100 % is late). When the host does not run the audio it says so (STOPPED, BYPASS,
   RENDER, NO AUDIO) instead of 0 %. A click opens the details (deskMenu.js, a menu of notes): average and worst,
   the machine's speed against real time, the host's rate and block size, the speed-ups as the machine runs them,
   and whether the editor runs translated (Rosetta). The plug-in sends the "cpuLoad" message (mdDeskSession.cpp,
   mdCpuLoad.h) every 250 ms; the details follow it while they are open.
     CpuMeter.view(m)      what the meter shows for a message (pure): {state, text, fill, worst, level, title}
     CpuMeter.details(m)   the details' lines (pure)
     CpuMeter.update(m)    a cpuLoad message: the meter (made beside the version the first time) and open details
     CpuMeter.open()       the details at the meter
     CpuMeter.last         the last message, or null
   Older WebKit (macOS 12): ES2020, no :has(); its stylesheet (deskCpu.css) has no color-mix. */
const CpuMeter = (() => {
	const pct = x => Math.round(x * 100) + " %";
	const WORDS = { none: "NO AUDIO", stopped: "STOPPED", bypassed: "BYPASS", offline: "RENDER" };
	const SAYS = {
		none: "the host has not started the audio yet",
		stopped: "the host stopped the audio engine: nothing is measured",
		bypassed: "the host bypasses the editor: nothing is measured",
		offline: "the host renders offline, faster or slower than real time: nothing is measured"
	};
	const clamp01 = x => Math.max(0, Math.min(1, x));
	/* the meter for a message (pure). level: ok below 70 %, high to 100 %, over when a block was late */
	function view(m) {
		const state = m && m.state || "none";
		if (state !== "running" || typeof m.load !== "number") {
			return { state, text: WORDS[state] || WORDS.none, fill: 0, worst: 0, level: "idle",
				title: "CPU: " + (SAYS[state] || SAYS.none) + ". Click for details." };
		}
		const worst = typeof m.worst === "number" ? Math.max(m.worst, m.load) : m.load;
		const level = worst >= 1 || m.load >= 1 ? "over" : worst >= 0.7 || m.load >= 0.7 ? "high" : "ok";
		return { state, text: pct(m.load), fill: clamp01(m.load), worst: clamp01(worst), level,
			title: `CPU: the editor uses ${pct(m.load)} of each audio block's time on average, ${pct(worst)} at worst in the last 3 s`
				+ (worst >= 1 ? " (over 100 %: a block came late, which clicks)" : "") + ". Click for details." };
	}
	function speedUps(m) {
		const l3 = m.exactEssi ? ", L3 exact MD timing on" : "";
		if (m.speedUps === "off") return "Speed-ups: off (legacy emulation)";
		if (m.speedUps === "some") return `Speed-ups: on, ${(m.leversOff || []).join(", ")} off${l3}`;
		if (m.speedUps === "on") return "Speed-ups: all on" + l3;
		return "Speed-ups: no machine runs";
	}
	/* the details' lines (pure) */
	function details(m) {
		m = m || {};
		const running = m.state === "running" && typeof m.load === "number";
		const lines = running
			? [`Average: ${pct(m.load)} of each block's time (the last half second)`,
				`Worst block: ${pct(Math.max(m.worst || 0, m.load))} (the last 3 s; over 100 % is late and clicks)`]
			: [`Not measured: ${SAYS[m.state] || SAYS.none}`];
		lines.push(typeof m.realtime === "number" ? `Machine speed: ${m.realtime.toFixed(2)}x real time` : "Machine speed: not known yet");
		const rate = m.sampleRate > 0 ? `${Math.round(m.sampleRate)} Hz` : "rate not known";
		const block = m.blockSize > 0 ? `, ${m.blockSize} samples a block` + (m.sampleRate > 0 ? ` (${(m.blockSize / m.sampleRate * 1000).toFixed(1)} ms)` : "") : "";
		lines.push(`${m.plugin ? "Host" : "Audio device"}: ${rate}${block}`);
		lines.push(speedUps(m));
		lines.push(m.translated ? "Rosetta: an Intel build on Apple silicon, about twice the CPU. "
			+ (m.plugin ? "Open the host as an Apple silicon app" : "Use the Apple silicon build")
			: "Runs natively" + (m.arch ? ` (${String(m.arch).replace(/^process /, "").replace(/, native$/, "")})` : ""));
		return lines;
	}

	let last = null, el = null;
	const TITLE = "CPU: the audio deadline";
	function ensure() {
		if (el && el.isConnected) return el;
		if (typeof document === "undefined") return null;
		const g = document.querySelector(".setgroup .grplabel");
		if (!g) return null;
		el = document.createElement("button");
		el.type = "button";
		el.id = "cpumeter";
		el.className = "cpumeter";
		el.setAttribute("aria-haspopup", "menu");
		el.innerHTML = '<span class="cpulab">CPU</span><span class="cpubar" aria-hidden="true"><i class="cpufill"></i><i class="cpuworst"></i></span><b class="cpuval"></b>';
		/* after the version (deskAbout.js): the label reads SETUP v0.5.1 CPU ▮▮▯ 23 % */
		g.appendChild(el);
		el.addEventListener("click", e => { e.stopPropagation(); open(); });
		return el;
	}
	function draw() {
		const b = ensure();
		if (!b) return;
		const v = view(last);
		b.dataset.state = v.state;
		b.dataset.level = v.level;
		b.dataset.load = last && typeof last.load === "number" ? String(last.load) : "";
		b.dataset.worst = last && typeof last.worst === "number" ? String(last.worst) : "";
		b.title = v.title;
		b.setAttribute("aria-label", v.title);
		b.querySelector(".cpuval").textContent = v.text;
		b.querySelector(".cpufill").style.width = (v.fill * 100).toFixed(1) + "%";
		const w = b.querySelector(".cpuworst");
		w.style.left = (v.worst * 100).toFixed(1) + "%";
		w.hidden = v.state !== "running";
	}
	/* the open details, when they are ours (the menu's panel marked at open) */
	const openPanel = () => typeof document !== "undefined" ? document.querySelector('#deskmenu:not([hidden]) .mpanel[data-cpu="1"]') : null;
	function refresh() {
		const p = openPanel();
		if (!p) return;
		const notes = p.querySelectorAll(".mnote"), lines = details(last);
		if (notes.length !== lines.length) { open(); return; }
		lines.forEach((t, i) => { if (notes[i].textContent !== t) notes[i].textContent = t; });
	}
	function open() {
		if (typeof DeskMenu === "undefined") return;
		const b = ensure();
		const r = b ? b.getBoundingClientRect() : { left: 0, bottom: 0 };
		DeskMenu.open(details(last).map(note => ({ note })), Math.round(r.left), Math.round(r.bottom + 4), { title: TITLE });
		const p = document.querySelector("#deskmenu .mpanel");
		if (p) { p.dataset.cpu = "1"; p.classList.add("cpupanel"); }
	}
	function update(m) {
		last = m;
		draw();
		refresh();
	}
	return { view, details, update, open, get last() { return last; } };
})();
if (typeof module !== "undefined") module.exports = CpuMeter;
