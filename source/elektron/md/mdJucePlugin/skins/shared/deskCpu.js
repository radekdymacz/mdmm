"use strict";
/* I-018: the CPU meter in the top bar, both editors (plug-in and standalone): beside the version in the Setup group's
   label, how much of each audio block's real-time budget the editor's processBlock spends (the emulation, the
   resampler, MIDI), smoothed over about half a second, with the worst single block of the last 3 s marked on the
   bar (what clicks: a block over 100 % is late). When the host does not run the audio it says so (STOPPED, BYPASS,
   RENDER, NO AUDIO) instead of 0 %. The bar alone shows; its number (or word) shows on hover and while the details
   are open. A click opens the details (deskMenu.js): average and worst, what the share means (one core's time for
   this editor's audio), the machine's speed against real time, the host's rate and block size, the speed-ups as the
   machine runs them, and whether the editor runs translated (Rosetta); under them the editor menu's own Speed-ups
   entries (Developer: the switch, Speed-ups (each), L3), so the meter is where speed-ups are compared. Those come from
   the plug-in's editorMenu message, asked for with openMenu and answered with menuPick as the editor menu is
   (mdPluginEditorState.cpp: the same actions, the same saved settings). The plug-in sends the "cpuLoad" message
   (mdDeskSession.cpp, mdCpuLoad.h) every 250 ms; the details follow it while they are open.
     CpuMeter.view(m)      what the meter shows for a message (pure): {state, text, fill, worst, level, title}
     CpuMeter.details(m)   the details' lines (pure)
     CpuMeter.update(m)    a cpuLoad message: the meter (made beside the version the first time) and open details
     CpuMeter.open()       the details at the meter (asks the plug-in for its menu first, when connected)
     CpuMeter.connect(send)  the page's way to the plug-in (Bridge.send, the MM adapter's send)
     CpuMeter.takeMenu(m)  an editorMenu message: true when the details asked for it (they show its speed-up entries)
     CpuMeter.speedItems(m, pick)  the editor menu's speed-up entries as DeskMenu items (pure)
     CpuMeter.last         the last message, or null
   Older WebKit (macOS 12): ES2020, no :has(); its stylesheet (deskCpu.css) has no color-mix. */
const CpuMeter = (() => {
	const pct = x => Math.round(x * 100) + " %";
	const TITLE = "CPU: audio deadline, this editor (one core)";
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
		lines.push("40 % means 40 % of one core's time for this editor's audio, not of the whole computer. The editor's page runs elsewhere and does not cause clicks");
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

	/* the editor menu's speed-up entries (Developer: speed-ups, speedup-levers, exact-essi-timing) as items
	   (pure): the switch ("Speed-ups", ticked when on), the levers as a submenu "Speed-ups (each)…" */
	function speedItems(m, pick) {
		const dev = ((m && m.items) || []).find(x => x.id === "developer");
		const kids = (dev && dev.items) || [];
		const want = ["speed-ups", "speedup-levers", "exact-essi-timing"];
		const found = want.map(id => kids.find(x => x.id === id)).filter(Boolean);
		if (!found.length || typeof DeskMenu === "undefined") return [];
		return DeskMenu.fromEditor(found, pick).map(it => {
			if (it.id === "speed-ups") return Object.assign({}, it, { label: "Speed-ups" });
			if (it.id === "speedup-levers") return Object.assign({}, it, { label: "Speed-ups (each)…" });
			return it;
		});
	}

	let last = null, el = null, send = null, asked = 0, askT = 0, pending = null;
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
		/* after the version (deskAbout.js): the label reads SETUP v0.5.1 CPU ▮▮▯ */
		g.appendChild(el);
		el.addEventListener("click", e => { e.stopPropagation(); open(); });
		return el;
	}
	/* the open details, when they are ours (the menu's panel marked at open) */
	const openPanel = () => typeof document !== "undefined" && document.querySelector ? document.querySelector('#deskmenu:not([hidden]) .mpanel[data-cpu="1"]') : null;
	function draw() {
		const b = ensure();
		if (!b) return;
		/* always after the version, also when the version was painted after the meter was made */
		const g = b.parentNode;
		if (g && g.lastElementChild && g.lastElementChild !== b) g.appendChild(b);
		const v = view(last);
		b.dataset.state = v.state;
		b.dataset.level = v.level;
		b.dataset.load = last && typeof last.load === "number" ? String(last.load) : "";
		b.dataset.worst = last && typeof last.worst === "number" ? String(last.worst) : "";
		b.title = v.title;
		b.setAttribute("aria-label", v.title);
		const shown = !!openPanel();
		if (b.classList) b.classList.toggle("open", shown);
		b.setAttribute("aria-expanded", String(shown));
		b.querySelector(".cpuval").textContent = v.text;
		b.querySelector(".cpufill").style.width = (v.fill * 100).toFixed(1) + "%";
		const w = b.querySelector(".cpuworst");
		w.style.left = (v.worst * 100).toFixed(1) + "%";
		w.hidden = v.state !== "running";
	}
	function refresh() {
		const p = openPanel();
		if (!p) return;
		const notes = p.querySelectorAll(".mnote"), lines = details(last);
		if (notes.length !== lines.length) { show(pending); return; }
		lines.forEach((t, i) => { if (notes[i].textContent !== t) notes[i].textContent = t; });
	}
	/* the details, with the speed-up entries of the plug-in's menu m (or none) */
	function show(m) {
		if (typeof DeskMenu === "undefined") return;
		const b = ensure();
		const r = b ? b.getBoundingClientRect() : { left: 0, bottom: 0 };
		const pick = n => { send({ op: "menuPick", menu: m.menu, n }); setTimeout(open, 150); };	/* open again: the new state */
		const extra = m && send ? speedItems(m, pick) : [];
		DeskMenu.open(details(last).map(note => ({ note })).concat(extra.length ? ["-"].concat(extra) : []),
			Math.round(r.left), Math.round(r.bottom + 4), { title: TITLE });
		const p = typeof document !== "undefined" && document.querySelector ? document.querySelector("#deskmenu .mpanel") : null;
		if (p) { p.dataset.cpu = "1"; p.classList.add("cpupanel"); }
		draw();
	}
	function open() {
		if (!send) { show(null); return; }
		/* ask for the plug-in's menu; its answer (takeMenu) shows the details, or after a moment without it, the notes */
		asked = Date.now(); pending = null;
		clearTimeout(askT);
		askT = setTimeout(() => { if (asked) { asked = 0; show(null); } }, 800);
		send({ op: "openMenu" });
	}
	function takeMenu(m) {
		if (!asked || Date.now() - asked > 3000) return false;
		asked = 0; clearTimeout(askT);
		pending = m;
		show(m);
		return true;
	}
	function connect(f) { send = f; }
	function update(m) {
		last = m;
		draw();
		refresh();
	}
	return { view, details, speedItems, update, open, connect, takeMenu, get last() { return last; } };
})();
if (typeof module !== "undefined") module.exports = CpuMeter;
