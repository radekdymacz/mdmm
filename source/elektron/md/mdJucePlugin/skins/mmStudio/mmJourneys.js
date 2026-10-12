"use strict";
/* The Monomachine Editor's user journeys (diagnostics builds only; skins/shared/deskJourney.js says what a
   journey is). Loaded last: the page's view state (window.MMDiagnostics.S, what the screen draws, the piano roll
   included) and the documents the page holds (MMPage.inspect(): what the firmware read back). Every step is
   done through the page's own controls. ?selftest=journey runs them all, journey-<names> some (journey-mm-*).
   Names: mm-<area>-<what>, the areas as the Machinedrum's (doc/modern-ux/JOURNEYS.md), and perform. */
const MmJourneys = (() => {
	const { ok, sleep, until } = Journey;
	/* a tapped tempo against the journey's own clock: 5 % (a busy Mac moves the key events by tens of ms against it; the
	   page tier runs beside the gate's other stages) */
	const tapSlack = want => Math.max(1.5, want * 0.05);
	const $1 = q => document.querySelector(q), $all = q => [...document.querySelectorAll(q)];
	const S = () => window.MMDiagnostics.S, I = () => window.MMPage.inspect();
	const machine = () => I().machine || {};
	const desk = () => machine().desk || {};
	const cur = () => machine().pattern?.current ?? 0;
	const patDoc = () => I().doc("pattern", cur());
	const trigsOf = t => (patDoc()?.tracks[t]?.trig || []).slice().sort((a, b) => a - b);
	const slidesOf = t => (patDoc()?.tracks[t]?.slide || []).slice().sort((a, b) => a - b);
	const wk = () => I().workingKit?.doc;
	const kitT = t => JSON.stringify(wk()?.tracks[t]);
	const allKit = () => JSON.stringify(wk()?.tracks);
	const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
	const tab = ws => `#tabs button[data-ws="${ws}"]`;
	const onTab = ws => ok(S().ws === ws, "workspace " + S().ws);
	const synthMuted = i => ((machine().mutes?.synth ?? 0) >> i & 1) === 1;
	const synthMutes = () => [0, 1, 2, 3, 4, 5].filter(synthMuted);
	const pressed = q => $1(q)?.getAttribute("aria-pressed") === "true";
	const dlgShown = () => !$1("#dlg").hidden;
	const dlgButton = text => [...$1("#dlg").querySelectorAll("[data-dlg]")].find(b => b.textContent.trim() === text);
	const rail = t => `#rail .th[data-sel="${t}"] .nm`;
	const tele = { last: null, steps: [] }, results = [], sent = [];
	/* what the page hands the plug-in (for what has no read-back: live notes) */
	const notesOn = [];	/* the pitches the keyboard sent (noteOn), newest last */
	const midiSent = [];	/* the raw MIDI the keyboard and the joystick sent (op midi), newest last */
	const polySent = [];	/* the poly commands ({on, t}), newest last (0.6 wave 9) */
	{ const send0 = Bridge.send; Bridge.send = (m, o) => { sent.push(m.op); if (sent.length > 50) sent.shift(); if (m.op === "noteOn") { notesOn.push(m.pitch); if (notesOn.length > 50) notesOn.shift(); }
		if (m.op === "midi") { midiSent.push(m.b); if (midiSent.length > 50) midiSent.shift(); }
		if (m.op === "poly") { polySent.push({ on: m.on, t: m.t }); if (polySent.length > 20) polySent.shift(); } return send0(m, o); }; }
	let wireSeq = 0;
	const wireLog = [];	/* what the core handed the device edge, as the wire engine would encode it (the page tier's stub host: {type: "wire", kind, b, n}), newest last */
	Bridge.onMessage(m => {
		if (m.type === "wire") { m.seq = ++wireSeq; wireLog.push(m); if (wireLog.length > 600) wireLog.shift(); }
		if (m.type === "telemetry") { tele.last = m; if (m.playing) { tele.steps.push(m.step); if (tele.steps.length > 64) tele.steps.shift(); } }
		if (m.type === "result") { results.push(m); if (results.length > 50) results.shift(); }
	});
	const PAGES = ["SYN", "AMP", "FLT", "EFX", "LF1", "LF2", "LF3"];
	const go = ws => ({ say: `click the ${{ seq: "Sequence", sound: "Sound", mix: "Mix", perform: "Perform", song: "Song" }[ws]} tab`, act: u => u.click(tab(ws)), screen: () => onTab(ws) });
	const sel = t => ({ say: `pick track ${t + 1} on the rail`, act: (u, c) => { c.t = t; if (S().side === "midi" && t < 6) u.click('[data-side="int"]'); u.click(rail(t)); }, screen: () => ok(S().sel === t, "selected " + S().sel) });
	/* the piano roll's Draw on (B on Sequence; Off: a press drags a selection box), as the journeys that click notes in
	   need it whatever an earlier journey left; drawBack in their tidy puts it as it was */
	const drawOn = { say: "the piano roll's Draw on", act: (u, c) => { c.d0 = S().rollDraw; if (!S().rollDraw) u.click("#rolldraw"); }, screen: () => ok(S().rollDraw && pressed("#rolldraw"), "Draw off") };
	const drawBack = c => { if (c.d0 != null && S().rollDraw !== c.d0) setRollDraw(c.d0); };
	const undoKey = { say: "press Cmd+Z", act: u => u.key("z", { cmd: true }) };
	const blur = () => document.activeElement?.blur?.();
	const confirmIfAsked = async u => { if (await until(dlgShown, 1200)) u.click($1("#dlg .danger") || dlgButton("Cancel")); };
	/* a select the page shows as a key-style dropdown (or plain) */
	const choose = async (u, id, v) => { if ($1(`.kselbtn[data-for="${id}"]`)) await u.pick(id, v); else u.choose("#" + id, v); };

	/* a cell of the big piano roll: the fractions of the canvas box at step s, the middle row's note */
	function rollCell(t, s) {
		const c = $1(`#seq canvas.roll[data-big][data-t="${t}"]`); if (!c) throw new Error("no piano roll for track " + (t + 1));
		const G = laneGeom(c), r = c.getBoundingClientRect(), q = G.col[s]; if (!q) throw new Error("step " + (s + 1) + " is not shown");
		const row = Math.floor(G.rows / 2), n = G.lo + G.rows - 1 - row;
		return { c, n, fx: (q.x0 + q.x1) / 2 / r.width, fy: (G.top + (row + 0.5) * G.rh) / r.height };
	}
	/* the bar of note pitch on step s: the step before it that holds anything is a note whose first pitch it is */
	const trkOf = t => t < 6 ? S().tracks[t] : S().midi[t - 6];
	const underBar = (t, s, pitch) => { const st = trkOf(t).steps; for (let k = s - 1; k >= 0; k--) if (st[k]) return !st[k].off && st[k].n?.[0] === pitch; return false; };
	const freeSteps = (t, n, from = 0, pitch = null) => { const busy = trigsOf(t), out = []; for (let s = from; s < S().len && out.length < n; s++) if (!busy.includes(s) && !S().tracks[t].steps[s] && (pitch == null || !underBar(t, s, pitch)) && !out.some(x => Math.abs(x - s) < 2)) out.push(s); return out; };

	/* ---------- start-up ---------- */
	const bootCard = {
		name: "mm-boot-card", proves: [], boot: true,
		steps: [
			{ say: "open the editor: the start-up card covers the window while the firmware starts", within: 30000, screen: () => ok(typeof Boot !== "undefined" && ["loading", "booting"].includes(Boot.state()) && !$1("#bootcard").hidden, "card " + (typeof Boot !== "undefined" ? Boot.state() : "?")) },
			{ say: "click PLAY under the card: it is not pressed", act: (u, c) => { const r = $1("#play").getBoundingClientRect(), top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); c.cover = top?.closest("#bootcard") ? "card" : top?.id === "modalbg" ? "backdrop" : (top?.id || top?.className); if (c.cover !== "card" && c.cover !== "backdrop") throw new Error("PLAY is reachable: " + c.cover); top.dispatchEvent(new MouseEvent("click", { bubbles: true })); },
				machine: () => ok(!tele.last?.playing, "the machine plays"), within: 800 },
			{ say: "the card shows the firmware's own LCD", screen: () => { const g = $1("#bootlcd")?.getContext("2d")?.getImageData(0, 0, 128, 64).data; if (!g) return "no LCD"; let n = 0; for (let i = 0; i < g.length; i += 4) if (g[i] !== g[0] || g[i + 1] !== g[1] || g[i + 2] !== g[2]) n++; return ok(n > 50, n + " pixels, card " + Boot.state()); }, within: 90000 },
			{ say: "the card goes once the machine takes input", screen: () => ok($1("#bootcard").hidden, "still shown"), machine: () => ok(!!machine().input, "no input yet"), within: 90000 }
		]
	};

	/* ---------- Sequence ---------- */
	const firstBeat = {
		name: "mm-seq-first-beat", proves: ["MM-076", "MM-172", "MM-040", "MM-041"],
		steps: [
			{ say: "click the Sequence tab", act: u => u.click(tab("seq")), screen: () => onTab("seq") === true ? ok(!!$1("#seq canvas.roll[data-big]"), "no piano roll") : onTab("seq"), machine: () => ok(!!patDoc(), "pattern not read") },
			sel(0),
			{ say: "click four empty cells of the piano roll", act: async (u, c) => {
				/* A synth note's bar runs on to the next step that holds anything, and a click on a bar takes that note
				   (B-013): the cells are ones no bar of the middle row's note covers, clicked right to left, so a new
				   note's bar never reaches the next cell. */
				c.n = rollCell(c.t, 0).n;
				c.steps = [0, 4, 8, 12].map(k => freeSteps(c.t, 1, k, c.n)[0]).filter(s => s != null);
				if (c.steps.length < 4) throw new Error("no four free steps");
				for (const s of [...c.steps].reverse()) { const p = rollCell(c.t, s); u.click(p.c, {}, p.fx, p.fy); await sleep(250); }
				c.note = `track ${c.t + 1} steps ${c.steps.map(s => s + 1).join(" ")}, note ${c.n}`;
			}, screen: c => ok(c.steps.every(s => S().tracks[c.t].steps[s]?.n?.includes(c.n)), "roll shows " + c.steps.map(s => JSON.stringify(S().tracks[c.t].steps[s]?.n || null)).join(",")),
				machine: c => ok(c.steps.every(s => trigsOf(c.t).includes(s)), "pattern trigs " + trigsOf(c.t).join(",")), within: 15000 },
			/* PLAY once the clicks' dumps are in: the SYSEX RECV session idle and nothing on its way (machine.recv), so the
			   panel takes the key; a fixed wait lost the race on a busy Mac (0.5.1 gate, dev-cycle 7d at 4 editors) */
			{ say: "press PLAY when the clicks' dumps are in (pressed again if the plug-in still says the panel is busy, B-014)", act: async (u, c) => {
				const recv = () => I().machine?.recv || {};
				if (!await until(() => recv().state === "idle" && !recv().sending, 30000)) c.note = `SYSEX RECV ${recv().state}, ${recv().sending} sending`;
				tele.steps = []; results.length = 0; u.click("#play");
				for (let i = 0; i < 5 && await until(() => results.some(r => r.op === "play" && r.ok === false), 1500); i++) { c.note = "the plug-in said the panel was busy (SYSEX RECV); pressed again"; results.length = 0; await sleep(1500); u.click("#play"); } }, screen: () => ok(/^\d\d\.\d\d$/.test($1("#pos").textContent), "POSITION " + $1("#pos").textContent), machine: () => ok(new Set(tele.steps).size >= 4, "telemetry steps " + tele.steps.join(",")), within: 20000 },
			{ say: "press STOP", act: u => u.click("#play"), screen: () => ok($1("#pos").textContent === "--.--", "POSITION " + $1("#pos").textContent), machine: () => ok(tele.last && !tele.last.playing, "still playing") }
		],
		async tidy(u, c) { if (S().playing) u.click("#play"); for (let i = 0; i < 8 && c.steps && c.steps.some(s => trigsOf(c.t).includes(s)); i++) { u.click("#undo"); await sleep(1500); } }
	};
	const spaceKey = {
		name: "mm-keys-space-play", proves: ["MM-040", "MM-041"],
		steps: [
			{ say: "press Space: it plays (pressed again when the plug-in says the panel is busy)", act: async (u, c) => { blur(); tele.steps = []; results.length = 0; u.key(" ");
				for (let i = 0; i < 5 && await until(() => results.some(r => r.op === "play" && r.ok === false), 1500); i++) { c.note = "the plug-in said the panel was busy (SYSEX RECV); pressed again"; results.length = 0; await sleep(1500); u.key(" "); } }, screen: () => ok(S().playing, "not playing"), machine: () => ok(new Set(tele.steps).size >= 2, "telemetry " + tele.steps.join(",")), within: 6000 },
			{ say: "press Space again: it stops", act: u => u.key(" "), screen: () => ok(!S().playing, "playing"), machine: () => ok(tele.last && !tele.last.playing, "still playing") }
		]
	};
	/* B-024: the tempo is the machine's (1/24 BPM steps: a saved project's may be off the 0.1 grid), the LCD shows it to one
	   decimal: compared as the LCD rounds it */
	const lcdBpm = v => +(+v).toFixed(1);
	const tempoDrag = {
		name: "mm-top-tempo-drag", proves: ["MM-022", "MM-193"],
		steps: [
			{ say: "drag the BPM on the LCD up", act: async (u, c) => { c.b0 = machine().tempo; await u.drag("#bpm", [[0, -6], [0, -12], [0, -18], [0, -24]]); c.note = `${c.b0} -> ${S().bpm}`; }, screen: c => ok(parseFloat($1("#bpm").textContent) === lcdBpm(S().bpm) && S().bpm > c.b0, `LCD ${$1("#bpm").textContent} for ${S().bpm} (from ${c.b0})`), machine: c => ok(machine().tempo > c.b0, "tempo " + machine().tempo) },
			{ say: "drag it back down as far", act: u => u.drag("#bpm", [[0, 6], [0, 12], [0, 18], [0, 24]]), screen: c => ok(parseFloat($1("#bpm").textContent) === lcdBpm(c.b0), "LCD " + $1("#bpm").textContent), machine: c => ok(Math.abs(machine().tempo - c.b0) < 0.05, "tempo " + machine().tempo) }
		]
	};
	const patNext = {
		name: "mm-top-pattern-next", proves: ["MM-030", "MM-067", "MM-070"],
		steps: [
			{ say: "click › next to the pattern on the LCD", act: async (u, c) => { c.p0 = cur(); u.click("#patNext"); await confirmIfAsked(u); }, machine: c => ok(cur() === c.p0 + 1, "machine pattern " + cur()), screen: c => ok(S().pat === c.p0 + 1, "page pattern " + S().pat), within: 8000 },
			{ say: "click ‹: back", act: async u => { u.click("#patPrev"); await confirmIfAsked(u); }, machine: c => ok(cur() === c.p0, "machine pattern " + cur()), within: 8000 }
		]
	};
	const wsKeys = {
		name: "mm-keys-workspaces", proves: [],
		steps: [["2", "sound"], ["3", "mix"], ["4", "perform"], ["5", "song"], ["1", "seq"]].map(([k, ws]) => ({ say: `press ${k}`, act: u => { blur(); u.key(k); }, screen: () => ok(S().ws === ws && !!$1("#main").firstElementChild, "workspace " + S().ws) }))
	};
	const helpKeys = {
		name: "mm-keys-help", proves: [],
		steps: [
			{ say: "press ?: the keyboard view and the list of keys", act: u => { blur(); u.key("?", { shift: true }); }, screen: () => ok(!$1("#keyspop").hidden && $all("#keyspop .keyrow").length > 20 && !!$1("#keyspop .kv-cap"), $all("#keyspop .keyrow").length + " keys") },
			{ say: "press Escape: it closes", act: u => u.key("Escape"), screen: () => ok($1("#keyspop").hidden, "still open") }
		]
	};
	const plate = {
		name: "mm-top-plate", proves: [],
		steps: [
			{ say: "click the plate key", act: (u, c) => { c.p0 = document.documentElement.dataset.plate; u.click("#platekey"); }, screen: c => ok(document.documentElement.dataset.plate !== c.p0, "plate " + document.documentElement.dataset.plate) },
			{ say: "click it again", act: u => u.click("#platekey"), screen: c => ok(document.documentElement.dataset.plate === c.p0, "plate " + document.documentElement.dataset.plate) }
		]
	};
	const undoRedo = {
		name: "mm-top-undo-redo", proves: ["MM-076"],
		steps: [
			go("seq"), sel(0),
			{ say: "click an empty cell of the roll", act: (u, c) => { c.s = freeSteps(0, 1, 6)[0]; const p = rollCell(0, c.s); u.click(p.c, {}, p.fx, p.fy); }, machine: c => ok(trigsOf(0).includes(c.s), "no trig"), within: 10000 },
			{ say: "press Cmd+Z", act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(!trigsOf(0).includes(c.s), "trig still there"), screen: c => ok(!S().tracks[0].steps[c.s], "roll still shows it"), within: 10000 },
			{ say: "press Cmd+Shift+Z", act: u => u.key("z", { cmd: true, shift: true }), machine: c => ok(trigsOf(0).includes(c.s), "no trig"), within: 10000 },
			{ say: "click Undo", act: u => u.click("#undo"), machine: c => ok(!trigsOf(0).includes(c.s), "trig still there"), within: 10000 }
		]
	};
	const gridRecord = {
		name: "mm-seq-grid-record", proves: ["MM-039"],
		steps: [
			{ say: "click RECORD (stopped): GRID RECORDING (pressed again when the plug-in says the panel is busy)", act: async (u, c) => { results.length = 0; c.seen = []; c.recv0 = machine().recv?.state; c.t0 = performance.now(); u.click("#rec");
				for (let i = 0; i < 5 && await until(() => results.some(r => r.op === "record" && r.ok === false), 1000); i++) { c.note = `the plug-in said the panel was busy (SYSEX RECV, recv ${machine().recv?.state}); pressed again after ${Math.round(performance.now() - c.t0)} ms`; results.length = 0; await sleep(500); u.click("#rec"); } },
				machine: c => { const r = tele.last?.record; if (c.seen[c.seen.length - 1] !== r) c.seen.push(r); return ok(r === "grid", `record ${r} (seen ${c.seen.join(">")}); results ${results.map(x => x.op + ":" + x.ok + (x.errors ? " " + x.errors.join(";") : "") + (x.note ? " " + x.note : "")).join(", ")}; recv ${c.recv0} -> ${machine().recv?.state}`); }, within: 6000 },
			{ say: "click RECORD again: off (pressed again when the plug-in says the panel is busy)", act: async (u, c) => { results.length = 0; u.click("#rec");
				for (let i = 0; i < 5 && await until(() => results.some(r => r.op === "record" && r.ok === false), 1500); i++) { c.note = "the plug-in said the panel was busy; pressed again"; results.length = 0; await sleep(1500); u.click("#rec"); } },
				machine: () => ok(tele.last?.record === "off", "record " + tele.last?.record), within: 6000 }
		],
		async tidy(u) { if (tele.last?.record && tele.last.record !== "off") u.click("#rec"); }
	};
	/* wave 3 (DESIGN-machine-menus.md §2): Note · Slide · Swing under the roll; in Slide or Swing a drag across the roll's step
	   columns paints that mark (one undo step), the marks sit along the roll's foot; Esc back to Note */
	const swingsOf = t => (patDoc()?.tracks[t]?.swing || []).slice().sort((a, b) => a - b);
	/* the roll canvas and where step s's column is on it (its foot), as fractions for the hands */
	const rollFoot = s => { const c = $1("#seq canvas.roll[data-big]"), r = c.getBoundingClientRect(), m = $1(`#seq .rollmarks [data-rm="${s}"]`).getBoundingClientRect(); return { c, fx: (m.left + m.width / 2 - r.left) / r.width, fy: 0.97, x: m.left + m.width / 2 }; };
	const slidePaint = {
		name: "mm-seq-trig-types", proves: ["MM-231", "MM-233"],
		steps: [
			go("seq"), sel(0),
			{ say: "click Slide under the roll", act: u => u.click('.ttrow [data-tt="sld"]'), screen: () => ok(S().tt === "sld" && $1('.ttrow [data-tt="sld"]').getAttribute("aria-checked") === "true", "type " + S().tt) },
			{ say: "drag across four step columns of the roll: slide on, one undo step", act: async (u, c) => {
				c.s0 = [...Array(S().len - 3).keys()].find(s => [0, 1, 2, 3].every(k => !slidesOf(0).includes(s + k))); if (c.s0 == null) throw new Error("no four free slide steps");
				c.run = [0, 1, 2, 3].map(k => c.s0 + k); c.u0 = machine().history?.undoCount || 0;
				const f = rollFoot(c.s0); await u.drag(f.c, c.run.slice(1).map(s => [rollFoot(s).x - f.x, 0]), {}, { fx: f.fx, fy: f.fy });
			}, machine: c => ok(c.run.every(s => slidesOf(0).includes(s)), "slides " + slidesOf(0).join(",")),
				screen: c => ok(c.run.every(s => $1(`#seq .rollmarks [data-rm="${s}"]`)?.classList.contains("sld")), "no slide marks"), within: 15000 },
			{ say: "one undo step: Cmd+Z takes all four", act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(c.run.every(s => !slidesOf(0).includes(s)), "slides " + slidesOf(0).join(",")), within: 15000 },
			{ say: "click Swing, then click a step's column: its swing flips", act: async (u, c) => { u.click('.ttrow [data-tt="swg"]'); await sleep(300); c.w = c.run[0]; c.w0 = swingsOf(0).includes(c.w); const f = rollFoot(c.w); u.click(f.c, {}, f.fx, f.fy); },
				machine: c => ok(swingsOf(0).includes(c.w) !== c.w0, "swing " + swingsOf(0).join(",")), screen: c => ok($1(`#seq .rollmarks [data-rm="${c.w}"]`)?.classList.contains("swg") !== c.w0, "swing mark unchanged"), within: 15000 },
			{ say: "press Escape: back to Note", act: u => u.key("Escape"), screen: () => ok(S().tt === "note" && $1('.ttrow [data-tt="note"]').getAttribute("aria-checked") === "true", "type " + S().tt) },
			{ say: "Cmd+Z: the swing as before", act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(swingsOf(0).includes(c.w) === c.w0, "swing " + swingsOf(0).join(",")), within: 15000 }
		],
		async tidy(u) { if (S().tt && S().tt !== "note") $1('.ttrow [data-tt="note"]')?.click(); }
	};
	const lenKey = {
		name: "mm-seq-len", proves: ["MM-166"],
		steps: [
			go("seq"),
			{ say: "click LEN on the LCD: the next length", act: (u, c) => { c.l0 = patDoc().length; u.click('[data-l2="len"]'); }, machine: c => ok(patDoc().length !== c.l0 && patDoc().length === S().len, "length " + patDoc().length), screen: c => ok($1('[data-l2="len"] b')?.textContent === String(S().len), "LCD " + $1('[data-l2="len"] b')?.textContent), within: 20000 },
			{ say: "shift-click LEN: back", act: u => u.click('[data-l2="len"]', { shift: true }), machine: c => ok(patDoc().length === c.l0, "length " + patDoc().length), within: 20000 }
		]
	};
	const lockLane = {
		name: "mm-seq-lock-lane", proves: ["MM-081", "MM-202"],
		steps: [
			go("seq"),
			{ say: "pick a track with notes, the Locks tab", act: async (u, c) => { c.t = [0, 1, 2, 3, 4, 5].find(t => trigsOf(t).length >= 2) ?? 0; await until(() => !!$1(rail(c.t)), 3000); u.click(rail(c.t)); await sleep(200); if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); }, screen: c => ok(S().sel === c.t && !!$1("#lane"), "no lane"), machine: c => ok(trigsOf(c.t).length >= 2, "fewer than two notes") },
			{ say: "draw across the lane over the notes", act: async (u, c) => { c.lane = S().lane; [c.pg, c.pi] = [PAGES.indexOf(c.lane.split(".")[0]), +c.lane.split(".")[1]]; c.on = trigsOf(c.t).filter(s => s < S().len).slice(0, 4); await u.drag(`#lane .lb[data-s="${c.on[0]}"]`, c.on.slice(1).map(s => `#lane .lb[data-s="${s}"]`), {}, { fy: 0.3 }); c.note = `${c.lane} on ${c.on.map(s => s + 1).join(" ")}`; },
				machine: c => { const l = (patDoc().locks || []).find(x => x.track === c.t && x.page === c.pg && x.param === c.pi); return ok(l && c.on.every(s => l.steps.some(([x]) => x === s)), "locks " + JSON.stringify(l)); }, within: 15000 },
			{ say: "click the lane's clear key", act: u => u.click("#clearLane"), machine: c => ok(!(patDoc().locks || []).some(x => x.track === c.t && x.page === c.pg && x.param === c.pi), "locks left"), within: 15000 }
		]
	};
	const arpDock = {
		name: "mm-seq-arp", proves: ["MM-215", "MM-217"],
		steps: [
			go("seq"), sel(0),
			{ say: "click the Arp tab and an arpeggiator mode", act: async (u, c) => { u.click('[data-dock="arp"]'); await sleep(300); c.m0 = patDoc().tracks[0].arp?.mode; const b = $all('[data-set="arpmode"] button').find(x => +x.dataset.v !== S().tracks[0].arp.MODE && +x.dataset.v > 0); c.v = +b.dataset.v; u.click(b); },
				machine: c => ok(patDoc().tracks[0].arp?.mode === c.v, "arp mode " + patDoc().tracks[0].arp?.mode), screen: c => ok(pressed(`[data-set="arpmode"] button[data-v="${c.v}"]`), "not lit"), within: 15000 },
			{ ...undoKey, act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(patDoc().tracks[0].arp?.mode === c.m0, "arp mode " + patDoc().tracks[0].arp?.mode), within: 15000 }
		],
		async tidy(u) { if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); }
	};
	/* 0.3.5: RNGE up to the machine's own end, 9 OCT (range 8, the knob's limit measured on the firmware; a 2008 backup
	   holds it): shown and kept, not snapped back */
	const rnge = '.pc[data-g="arp"][data-n="RNGE"]';
	const arpRange = {
		name: "mm-seq-arp-range", proves: ["MM-219"],
		steps: [
			go("seq"), sel(0),
			{ say: "click the Arp tab, scroll RNGE up to its end", act: async (u, c) => { u.click('[data-dock="arp"]'); await sleep(300); c.r0 = patDoc().tracks[0].arp?.range; for (let k = 0; k < 10; k++) { u.wheel(rnge, 1); await sleep(120); } },
				machine: () => ok(patDoc().tracks[0].arp?.range === 8, "arp range " + patDoc().tracks[0].arp?.range), screen: () => ok($1(rnge + " b")?.textContent === "9 OCT", $1(rnge + " b")?.textContent), within: 15000 },
			{ say: "scroll it once more: it stays at 9 OCT", act: u => u.wheel(rnge, 1),
				machine: () => ok(patDoc().tracks[0].arp?.range === 8, "arp range " + patDoc().tracks[0].arp?.range), screen: () => ok($1(rnge + " b")?.textContent === "9 OCT", $1(rnge + " b")?.textContent), within: 3000 }
		],
		async tidy(u, c) {
			if (c.r0 != null && $1(rnge)) { for (let k = 0; k < 8 - c.r0; k++) { u.wheel(rnge, -1); await sleep(120); } await sleep(3000); }
			if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]');
		}
	};
	const trnKeys = {
		name: "mm-seq-transpose-keyboard", proves: ["MM-226"],
		steps: [
			go("seq"), sel(0),
			{ say: "click the Transpose tab and the G key of its keyboard", act: async (u, c) => { u.click('[data-dock="trn"]'); await sleep(300); c.t0 = patDoc().tracks[0].transpose; c.v0 = S().tracks[0].tr.TRACK; const cv = $1('#dkvis canvas[data-ed="dktrn"]'), r = cv.getBoundingClientRect(), k = ED.dktrn.keys(r.width, r.height).find(x => x.n === 7);
				u.click(cv, {}, (k.x + k.w / 2) / r.width, (k.y + k.h * 0.85) / r.height); c.note = `TRACK ${c.v0} -> ${S().tracks[0].tr.TRACK}`; },
				machine: c => ok(patDoc().tracks[0].transpose !== c.t0, `transpose ${JSON.stringify(patDoc().tracks[0].transpose)} (was ${JSON.stringify(c.t0)}), page TRACK ${S().tracks[0].tr.TRACK}`), screen: c => ok(S().tracks[0].tr.TRACK !== c.v0, "TRACK " + S().tracks[0].tr.TRACK), within: 15000 },
			{ ...undoKey, act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(patDoc().tracks[0].transpose === c.t0, "transpose " + patDoc().tracks[0].transpose), within: 15000 }
		],
		async tidy(u) { if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); }
	};

	/* B-059: what the page plays ends when its window stops being the key window (a deactivated window gets no pointerup
	   and no keyup; WebKit tells the page with a blur), and leaving the window starts nothing. pressOnly: a mouse button
	   pressed on the element and kept down. */
	const pressOnly = (el, fx = 0.5, fy = 0.5) => {
		const r = el.getBoundingClientRect(), x = r.left + r.width * fx, y = r.top + r.height * fy, t = document.elementFromPoint(x, y);
		const o = { bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, buttons: 1, clientX: x, clientY: y, view: window };
		t.dispatchEvent(new PointerEvent("pointerdown", o)); t.dispatchEvent(new MouseEvent("mousedown", o));
	};
	const leaveWindow = () => { window.dispatchEvent(new Event("blur")); document.dispatchEvent(new Event("visibilitychange")); };
	const noteOffSent = () => midiSent.some(b => (b[0] & 0xf0) === 0x80 || ((b[0] & 0xf0) === 0x90 && b[2] === 0));
	const trnKeyBlur = {
		name: "mm-seq-transpose-key-blur", proves: [],
		steps: [
			go("seq"), sel(0),
			{ say: "open Transpose and keep the mouse down on the G key of its keyboard: its note plays", act: async (u, c) => { u.click('[data-dock="trn"]'); await sleep(300); c.t0 = patDoc().tracks[0].transpose; sent.length = 0;
				const cv = $1('#dkvis canvas[data-ed="dktrn"]'), r = cv.getBoundingClientRect(), k = ED.dktrn.keys(r.width, r.height).find(x => x.n === 7);
				pressOnly(cv, (k.x + k.w / 2) / r.width, (k.y + k.h * 0.85) / r.height); },
				machine: () => ok(sent.includes("noteOn"), "sent " + sent.join(",")) },
			{ say: "the window stops being the key window (no mouse up comes): the note ends", act: () => { sent.length = 0; leaveWindow(); },
				machine: () => ok(sent.includes("noteOff"), "no note off: sent " + (sent.join(",") || "nothing")) },
			{ ...undoKey, act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(patDoc().tracks[0].transpose === c.t0, "transpose " + patDoc().tracks[0].transpose), within: 15000 }
		],
		async tidy(u) { if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); }
	};
	/* B-060: a transpose edited while the pattern plays: the plug-in applies it with the machine's TRANSPOSE knob, one
	   step and back (mmDeskFirmwareTest transpose hears it); read again afterwards, the pattern holds what was edited */
	const trnPlaying = {
		name: "mm-seq-transpose-playing", proves: ["MM-226"],
		steps: [
			go("seq"), sel(0),
			{ say: "open Transpose and press PLAY", act: async (u, c) => { u.click('[data-dock="trn"]'); await sleep(300); c.t0 = patDoc().tracks[0].transpose; if (!S().playing) u.click("#play"); },
				machine: () => ok(!!tele.last?.playing, "not playing"), within: 8000 },
			{ say: "click the E key of the transpose keyboard while it plays", act: async (u, c) => { const cv = $1('#dkvis canvas[data-ed="dktrn"]'), r = cv.getBoundingClientRect(), k = ED.dktrn.keys(r.width, r.height).find(x => x.n === 4);
				u.click(cv, {}, (k.x + k.w / 2) / r.width, (k.y + k.h * 0.85) / r.height); c.v = S().tracks[0].tr.TRACK - 64; },
				machine: c => ok(patDoc().tracks[0].transpose === c.v, `transpose ${patDoc().tracks[0].transpose}, want ${c.v}`), within: 15000 },
			{ say: "a few seconds on, the pattern read again: it holds the transpose edited and still plays", act: async (u, c) => { await sleep(4000); c.n = results.length; Bridge.send({ op: "load", kind: "pattern", slot: cur() }); await sleep(1500); },
				machine: c => ok(patDoc().tracks[0].transpose === c.v && !!tele.last?.playing, `transpose ${patDoc().tracks[0].transpose}, want ${c.v}, playing ${tele.last?.playing}`), within: 10000 },
			{ say: "STOP, then Cmd+Z", act: async u => { u.click("#play"); await until(() => !S().playing, 3000); blur(); u.key("z", { cmd: true }); },
				machine: c => ok(patDoc().tracks[0].transpose === c.t0, "transpose " + patDoc().tracks[0].transpose), within: 15000 }
		],
		async tidy(u) { if (S().playing) u.click("#play"); if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); }
	};
	const leaveStopped = {
		name: "mm-top-leave-window-stopped", proves: [],
		steps: [
			go("seq"),
			{ say: "stopped, a home-row key down (A: T1 plays), the Perform keyboard's key and the joystick held: the window stops being the key window",
				act: async (u, c) => { if (S().playing) { u.click("#play"); await until(() => !S().playing, 3000); } sel(0).act(u, c); blur();
					sent.length = 0; midiSent.length = 0;
					document.dispatchEvent(new KeyboardEvent("keydown", { key: "a", code: "KeyA", bubbles: true, cancelable: true }));
					u.click(tab("perform")); await until(() => !!$1(".kb [data-key]"), 3000);
					pressOnly($1('.kb .w[data-key="60"]') || $1(".kb .w[data-key]"));
					await sleep(300);
					c.on = sent.includes("noteOn") && midiSent.some(b => (b[0] & 0xf0) === 0x90 && b[2] > 0);
					sent.length = 0; midiSent.length = 0;
					leaveWindow(); },
				machine: c => ok(c.on && sent.includes("noteOff") && noteOffSent(), `notes on ${c.on}; after: sent ${sent.join(",") || "nothing"}, midi ${JSON.stringify(midiSent)}`) },
			{ say: "for 3 s the machine stays stopped and the page sends no PLAY", act: async c => { await sleep(3000); },
				machine: () => ok(!tele.last?.playing && !S().playing && !sent.includes("play"), `playing ${tele.last?.playing}, sent ${sent.join(",") || "nothing"}`) },
			{ say: "the keys come up where the window is again: nothing more plays", act: () => { document.dispatchEvent(new KeyboardEvent("keyup", { key: "a", code: "KeyA", bubbles: true })); },
				machine: () => ok(!tele.last?.playing, "playing") }
		],
		async tidy(u) { u.click(tab("seq")); }
	};

	/* ---------- generators ---------- */
	const genMut = {
		name: "mm-gen-mutate-undo", proves: [],
		steps: [
			go("seq"), sel(0),
			{ say: "the GEN bar offers track 1's generator", screen: () => ok(!!$1("#genband [data-rand]"), "no GEN bar") },
			{ say: "click GEN's Random key until the notes change", act: async (u, c) => { c.p0 = JSON.stringify(patDoc().tracks[0]); for (let i = 0; i < 5; i++) { u.click("#genband [data-rand]"); if (await until(() => JSON.stringify(patDoc().tracks[0]) !== c.p0, 4000)) break; } },
				machine: c => ok(JSON.stringify(patDoc().tracks[0]) !== c.p0, "pattern unchanged"), within: 15000 },
			{ say: "click the Sound tab and MUTATE's Random key", act: async (u, c) => { u.click(tab("sound")); await sleep(300); c.k0 = kitT(0); u.click("#mutband [data-rand]"); }, machine: c => ok(kitT(0) !== c.k0, "kit unchanged"), within: 15000 },
			{ say: "click Undo: the sound is back", act: u => u.click("#undo"), machine: c => ok(kitT(0) === c.k0, "kit not back"), within: 15000 },
			{ say: "click Undo again: the notes are back", act: u => u.click("#undo"), machine: c => ok(JSON.stringify(patDoc().tracks[0]) === c.p0, "pattern not back"), within: 15000 }
		]
	};

	/* ---------- Sound ---------- */
	const valueText = q => $1(q)?.querySelector("b")?.textContent;
	const shapeSound = {
		name: "mm-sound-shape-undo", proves: ["MM-015"],
		steps: [
			{ say: "click the Sound tab: grouped by function", act: u => u.click(tab("sound")), screen: () => onTab("sound") === true ? ok($all("#main .sg").length >= 4, $all("#main .sg").length + " groups") : onTab("sound"), machine: () => ok(!!wk(), "no working kit") },
			sel(0),
			{ say: "drag a filter value sideways", act: async (u, c) => {
				const el = $1('#main .pc[data-g="FLT"]') || $1('#main .pc[data-g="AMP"]'); if (!el) throw new Error("no FLT or AMP value");
				c.g = el.dataset.g; c.i = +el.dataset.n; c.pg = PAGES.indexOf(c.g); c.q = `#main .pc[data-g="${c.g}"][data-n="${c.i}"]`;
				c.v0 = wk().tracks[0].pages[c.pg][c.i]; c.txt0 = valueText(c.q); const d = c.v0 > 64 ? -1 : 1;
				await u.drag(c.q, [[d * 6, 0], [d * 12, 0], [d * 18, 0], [d * 24, 0], [d * 30, 0]]);
				c.note = `${c.g} ${c.i}: ${c.v0} -> ${S().tracks[0].v[c.g][c.i]}`;
			}, screen: c => ok(valueText(c.q) !== c.txt0, "shows " + valueText(c.q)), machine: c => ok(wk().tracks[0].pages[c.pg][c.i] !== c.v0, "kit value " + wk().tracks[0].pages[c.pg][c.i]), within: 8000 },
			{ say: "click Undo", act: u => u.click("#undo"), screen: c => ok(valueText(c.q) === c.txt0, "shows " + valueText(c.q)), machine: c => ok(wk().tracks[0].pages[c.pg][c.i] === c.v0, "kit value " + wk().tracks[0].pages[c.pg][c.i]), within: 8000 }
		]
	};
	const machinePick = {
		name: "mm-sound-machine-pick-undo", proves: ["MM-004"],
		steps: [
			go("sound"), sel(0),
			{ say: "click the machine key: the picker opens", act: (u, c) => { c.k0 = kitT(0); c.m0 = S().tracks[0].m; u.click("#machbtn"); }, screen: () => ok(!$1("#machpop").hidden && $all("#machpop .mk").length > 1, "picker closed") },
			{ say: "pick another machine", act: (u, c) => { const m = $all("#machpop .mk").find(b => b.dataset.mach !== c.m0 && !b.disabled); c.m1 = m.dataset.mach; u.click(m); }, screen: c => ok($1("#machpop").hidden && S().tracks[0].m === c.m1, "view " + S().tracks[0].m), machine: c => ok(kitT(0) !== c.k0, "kit unchanged"), within: 10000 },
			{ ...undoKey, act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(kitT(0) === c.k0, "kit not back"), screen: c => ok(S().tracks[0].m === c.m0, "view " + S().tracks[0].m), within: 10000 }
		]
	};
	/* B-027: a machine picked on Sound stays when the person goes back to Sequence and clicks a step there: the step's
	   dump makes the Monomachine load the pattern's kit from its slot, and the editor sends the kit's edits again */
	const machineStays = {
		name: "mm-sound-machine-stays", proves: ["MM-004", "MM-112"],
		steps: [
			go("sound"), sel(0),
			{ say: "pick another machine", act: async (u, c) => { c.k0 = kitT(0); c.m0 = S().tracks[0].m; u.click("#machbtn"); await sleep(300); const m = $all("#machpop .mk").find(b => b.dataset.mach !== c.m0 && !b.disabled); c.m1 = m.dataset.mach; u.click(m); },
				screen: c => ok(S().tracks[0].m === c.m1, "view " + S().tracks[0].m), machine: c => ok(kitT(0) !== c.k0, "kit unchanged"), within: 10000 },
			go("seq"),
			{ say: "click an empty cell of the piano roll (a dump of the pattern that plays)",
				act: (u, c) => { c.n = rollCell(0, 0).n; c.s = freeSteps(0, 1, 0, c.n)[0]; if (c.s == null)
				throw new Error("no free step"); const p = rollCell(0, c.s); u.click(p.c, {}, p.fx, p.fy); },
				machine: c => ok(trigsOf(0).includes(c.s), "pattern trigs " + trigsOf(0).join(",")), within: 15000 },
			{ say: "wait on Sequence: the machine stays", act: () => sleep(5000),
				screen: c => ok(S().tracks[0].m === c.m1, "view " + S().tracks[0].m),
				machine: c => ok(kitT(0) !== c.k0 && machine().kit?.working === "edited", "kit back to " + kitT(0)
				+ ", " + machine().kit?.working), within: 2000 },
			go("sound"),
			{ say: "and on Sound again", act: () => sleep(1000), screen: c => ok(S().tracks[0].m === c.m1, "view " + S().tracks[0].m), machine: c => ok(kitT(0) !== c.k0, "kit back to " + kitT(0)), within: 2000 }
		],
		async tidy(u, c) {
			blur();
			if (c.s != null && trigsOf(0).includes(c.s)) { u.key("z", { cmd: true }); await sleep(3000); }
			if (c.k0 != null && kitT(0) !== c.k0) { u.key("z", { cmd: true }); await sleep(3000); }
		}
	};
	/* 0.3.5, 0.6: the Song page's PATTERN · CHAIN · SONG keys: PATTERN and SONG set the machine's mode, what is lit follows the status it reports */
	const songModeJ = {
		name: "mm-song-mode", proves: ["MM-031", "MM-257"],
		steps: [
			go("song"),
			{ say: "click the SONG key: the machine reports song mode", act: (u, c) => { c.m0 = machine().song?.songMode === true; u.click('[data-set="songpick"] button[data-v="song"]'); },
				machine: () => ok(machine().song?.songMode === true, "songMode " + machine().song?.songMode), screen: () => ok(pressed('[data-set="songpick"] button[data-v="song"]') && !pressed('[data-set="songpick"] button[data-v="pattern"]'), "SONG not lit"), within: 8000 },
			{ say: "click the PATTERN key: the machine reports pattern mode", act: u => u.click('[data-set="songpick"] button[data-v="pattern"]'),
				machine: () => ok(machine().song?.songMode === false, "songMode " + machine().song?.songMode), screen: () => ok(pressed('[data-set="songpick"] button[data-v="pattern"]') && !pressed('[data-set="songpick"] button[data-v="song"]'), "PATTERN not lit"), within: 8000 }
		],
		async tidy(u, c) { if (c.m0 && machine().song?.songMode !== true) { u.click('[data-set="songpick"] button[data-v="song"]'); await sleep(2000); } }
	};
	/* 0.3.5: the Song page's playhead. An empty song (the song picker, then Load on the machine) gets two rows, A01 and
	   A02; SONG mode, PLAY: the arrangement marks the row the machine plays (telemetry songRow, RAM), the What plays
	   line says it, and the mark moves on to the next row; STOP takes it away. */
	/* a song slot clicked (selected) and loaded (LOAD SONG) */
	const loadSlot = async (u, s) => { if (machine().song?.current === s) return; u.click(`[data-ss="${s}"]`); await sleep(250); u.click('[data-sa="load"]'); await until(() => machine().song?.current === s, 8000); };
	const emptySongMm = cur => { for (let d = 1; d < 24; d++) for (const s of [(cur + d) % 24, (cur - d + 24) % 24]) { const g = I().doc("song", s); if (g && g.rows.length && g.rows[0].kind === "end") return s; } return null; };
	/* the LCD's box and the places of its fields (0.3.5: the same in PATTERN and SONG mode) */
	const lcdGeo = () => [$1(".lcdpanel"), $1('#lcd2 [data-l2="seqmode"]'), $1("#kitname"), $1("#bpm")].map(e => { const r = e?.getBoundingClientRect(); return r ? `${Math.round(r.left)}/${Math.round(r.width)}` : "-"; }).join(" ");
	const markedMm = c => { const i = $1("#tl .scell.ph")?.dataset.i; if (i != null) c.seen.add(+i); return [...c.seen].join(","); };
	const songPlayhead = {
		name: "mm-song-playhead", proves: ["MM-251", "MM-253", "MM-257", "MM-261"],
		steps: [
			go("song"),
			{ say: "stop, click an empty song in the song slots, Load", act: async (u, c) => { if (S().playing) { u.click("#play"); await until(() => !S().playing, 3000); } c.cur = machine().song?.current ?? 0; c.m0 = machine().song?.songMode === true; await until(() => I().slots("song").length >= 24, 20000); c.s = emptySongMm(c.cur); if (c.s == null) throw new Error("no empty song"); await loadSlot(u, c.s); },
				machine: c => ok(machine().song?.current === c.s, "machine song " + machine().song?.current), within: 15000 },
			{ say: "Arrange: click pads A01 and A02, two rows of the machine's song", act: async (u, c) => { u.click('[data-set="songpick"] button[data-v="song"]'); await sleep(200); u.click('[data-addpat="0"]'); await until(() => songDoc()?.rows.length === 2, 8000); u.click('[data-addpat="1"]'); },
				machine: () => ok(songDoc()?.rows.length === 3 && songDoc().rows[0].pattern === 0 && songDoc().rows[1].pattern === 1, "rows " + JSON.stringify(songDoc()?.rows.map(r => r.pattern ?? r.kind))), within: 15000 },
			{ say: "click PATTERN: the header says pattern mode, the grid looks as ever", act: (u, c) => u.click('[data-set="songpick"] button[data-v="pattern"]'),
				screen: c => ok(!!$1(".songui.patmode") && /pattern mode/i.test($1("#arrstate")?.textContent || "") && /^PATTERN /.test($1("#songPlays")?.textContent || "") && (c.geo = lcdGeo()), "plays " + $1("#songPlays")?.textContent), machine: () => ok(machine().song?.songMode === false, "songMode " + machine().song?.songMode), within: 8000 },
			{ say: "click SONG: the LCD keeps its size and every field its place; the desk loads the edited song by itself (no LOAD SONG by hand)", act: u => u.click('[data-set="songpick"] button[data-v="song"]'),
				screen: c => ok(!!$1(".songui.songmode") && $1('#lcd2 [data-l2="seqmode"] b')?.textContent === "SONG" && lcdGeo() === c.geo && /song mode/i.test($1("#arrstate")?.textContent || ""), `LCD ${lcdGeo()} (was ${c.geo}); ${$1('#lcd2 [data-l2="seqmode"]')?.textContent}; header ${$1("#arrstate")?.textContent}`),
				machine: () => ok(machine().song?.songMode === true && machine().song?.reloadNeeded === false, "songMode " + machine().song?.songMode + ", reload needed " + machine().song?.reloadNeeded), within: 15000 },
			{ say: "press PLAY (pressed again when the plug-in says the panel is busy): row 001 is marked", act: async (u, c) => { c.seen = new Set(); results.length = 0; u.click("#play");
				for (let i = 0; i < 5 && await until(() => results.some(r => r.op === "play" && r.ok === false), 1500); i++) { c.note = "the panel was busy (SYSEX RECV); pressed again"; results.length = 0; await sleep(1500); u.click("#play"); } },
				screen: c => ok(markedMm(c).length > 0 && c.seen.has(0) && /row 001 of 2/.test($1("#songPlays")?.textContent || ""), `marked ${[...c.seen]}; plays ${$1("#songPlays")?.textContent}`), machine: () => ok(tele.last?.playing && tele.last.songRow === 0, `songRow ${tele.last?.songRow} playing ${tele.last?.playing}; results ${results.slice(-4).map(r => r.op + ":" + r.ok + (r.errors ? " " + r.errors.join(";") : "")).join(", ")}; rows ${JSON.stringify(songDoc()?.rows)}`), within: 20000 },
			{ say: "the mark moves on to row 002", act: async (u, c) => { await until(() => (markedMm(c), c.seen.has(1)), 30000); },
				screen: c => ok((markedMm(c), c.seen.has(1)), `marked ${[...c.seen]}`), machine: () => ok(tele.last?.songRow === 1, "songRow " + tele.last?.songRow), within: 30000 },
			{ say: "press STOP: no row is marked", act: u => { if (S().playing) u.click("#play"); }, screen: () => ok(!$1("#tl .scell.ph"), "still marked"), machine: () => ok(!S().playing, "playing"), within: 8000 }
		],
		async tidy(u, c) {
			if (S().playing) { u.click("#play"); await until(() => !S().playing, 3000); }
			if (c.s != null && S().songs?.slot === c.s) await undoUntil(u, () => songDoc()?.rows.length === 1, 4);
			if (c.m0 === false && machine().song?.songMode !== false) { u.click('[data-set="songpick"] button[data-v="pattern"]'); await sleep(1500); }
			if (c.cur != null) { await loadSlot(u, c.cur); await sleep(1500); }
			if (c.m0 != null && (machine().song?.songMode === true) !== c.m0) { u.click(`[data-set="songpick"] button[data-v="${c.m0 ? "song" : "pattern"}"]`); await sleep(2000); }
		}
	};
	const midiSide = {
		name: "mm-sound-midi-side", proves: ["MM-240"],
		steps: [
			go("sound"),
			{ say: "click MIDI: the MIDI tracks", act: u => u.click('[data-side="midi"]'), screen: () => ok(S().side === "midi" && S().sel >= 6 && $all("#main .sg").length >= 1, `side ${S().side}, track ${S().sel}`) },
			{ say: "click SYNTH: back", act: u => u.click('[data-side="int"]'), screen: () => ok(S().side !== "midi" && S().sel < 6, `side ${S().side}`) }
		]
	};
	const controlAll = {
		name: "mm-sound-control-all", proves: [],
		steps: [
			go("sound"), sel(0),
			{ say: "Alt-drag a filter value: all six synth tracks move", act: async (u, c) => { c.k0 = wk().tracks.map(t => JSON.stringify(t.pages)); const el = $1('#main .pc[data-g="FLT"]'); const d = (S().tracks[0].v.FLT[+el.dataset.n] ?? 0) > 64 ? -1 : 1; await u.drag(el, [[d * 6, 0], [d * 12, 0], [d * 18, 0], [d * 24, 0]], { alt: true }); },
				machine: c => { const n = wk().tracks.filter((t, i) => JSON.stringify(t.pages) !== c.k0[i]).length; return ok(n >= 2, n + " tracks moved"); }, within: 15000 },
			{ ...undoKey, act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(wk().tracks.every((t, i) => JSON.stringify(t.pages) === c.k0[i]), "not all back"), within: 15000 }
		]
	};

	/* ---------- Mix ---------- */
	const strip = (t, q) => `.strip6[data-sel="${t}"] ${q}`;
	const mixStrip = {
		name: "mm-mix-level-mute", proves: ["MM-014", "MM-062", "MM-020"],
		steps: [
			{ say: "click the Mix tab", act: u => u.click(tab("mix")), screen: () => onTab("mix") === true ? ok($all(".strip6").length === 6, $all(".strip6").length + " strips") : onTab("mix"), machine: () => ok(machine().mutes?.synth != null, "mutes not read") },
			{ say: "drag track 1's LEVEL fader", act: async (u, c) => { c.l0 = wk().levels[0]; c.txt0 = $1(strip(0, ".lread")).textContent; const d = c.l0 > 64 ? 1 : -1; await u.drag(strip(0, '.fader[data-g="lev"]'), [[0, d * 8], [0, d * 16], [0, d * 24], [0, d * 32], [0, d * 40]]); c.note = `LEVEL ${c.l0} -> ${S().tracks[0].lev}`; },
				screen: c => ok($1(strip(0, ".lread")).textContent !== c.txt0 && $1(strip(0, ".lread")).textContent === String(S().tracks[0].lev), "shows " + $1(strip(0, ".lread")).textContent), machine: c => ok(wk().levels[0] !== c.l0 && wk().levels[0] === S().tracks[0].lev, "kit level " + wk().levels[0]), within: 8000 },
			{ say: "click Undo: the level is back", act: u => u.click("#undo"), screen: c => ok($1(strip(0, ".lread")).textContent === c.txt0, "shows " + $1(strip(0, ".lread")).textContent), machine: c => ok(wk().levels[0] === c.l0, "kit level " + wk().levels[0]), within: 8000 },
			{ say: "click track 1's M key", act: (u, c) => { c.m0 = synthMuted(0); u.click(strip(0, ".ms.m")); }, screen: c => ok($1(strip(0, ".ms.m")).getAttribute("aria-pressed") === String(!c.m0), "M " + $1(strip(0, ".ms.m")).getAttribute("aria-pressed")), machine: c => ok(synthMuted(0) === !c.m0, "machine mute " + synthMuted(0)) },
			{ say: "click M again", act: u => u.click(strip(0, ".ms.m")), screen: c => ok($1(strip(0, ".ms.m")).getAttribute("aria-pressed") === String(c.m0), "M " + $1(strip(0, ".ms.m")).getAttribute("aria-pressed")), machine: c => ok(synthMuted(0) === c.m0, "machine mute " + synthMuted(0)) }
		]
	};
	const mixSolo = {
		name: "mm-mix-solo", proves: ["MM-020"],
		steps: [
			go("mix"),
			{ say: "click S on track 3: the other synth tracks are muted", act: (u, c) => { c.m0 = synthMutes(); u.click(strip(2, ".ms.s")); }, machine: () => ok(same(synthMutes(), [0, 1, 3, 4, 5]), "machine mutes " + synthMutes()), screen: () => ok(pressed(strip(2, ".ms.s")), "S not lit") },
			{ say: "click S again: the mutes are as before", act: u => u.click(strip(2, ".ms.s")), machine: c => ok(same(synthMutes(), c.m0), "machine mutes " + synthMutes()) }
		]
	};
	const shiftMutes = {
		name: "mm-mix-shift-mutes", proves: ["MM-236"],
		steps: [
			go("mix"),
			{ say: "hold Shift and click two M keys: prepared, nothing sent", act: (u, c) => { c.m0 = synthMutes(); c.ts = [0, 1, 2, 3, 4, 5].filter(i => !c.m0.includes(i)).slice(0, 2); for (const i of c.ts) u.click(strip(i, ".ms.m"), { shift: true }); },
				screen: c => ok(c.ts.every(i => $1(strip(i, ".ms.m")).classList.contains("prep")), "not prepared"), machine: c => ok(same(synthMutes(), c.m0), "sent while held"), within: 1000 },
			{ say: "let Shift go: both mute together", act: () => document.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", code: "ShiftLeft", bubbles: true })), machine: c => ok(c.ts.every(synthMuted), "machine mutes " + synthMutes()) },
			{ say: "click both M keys again", act: async (u, c) => { for (const i of c.ts) { u.click(strip(i, ".ms.m")); await sleep(150); } }, machine: c => ok(same(synthMutes(), c.m0), "machine mutes " + synthMutes()) }
		]
	};
	const routing = {
		name: "mm-mix-routing", proves: ["MM-288"],
		steps: [
			go("mix"),
			{ say: "click another routing mode", act: (u, c) => { c.g = machine().global?.current ?? 0; c.r0 = I().doc("global", c.g)?.routingMode; c.v0 = S().routing; c.v = ["3xSTEREO", "6xMONO"].find(v => v !== c.v0); u.click(`[data-set="routing"] button[data-v="${c.v}"]`); },
				machine: c => ok(I().doc("global", c.g)?.routingMode !== c.r0, "routing " + I().doc("global", c.g)?.routingMode), screen: c => ok(pressed(`[data-set="routing"] button[data-v="${c.v}"]`), "not lit"), within: 15000 },
			{ say: "click the first one again", act: (u, c) => u.click(`[data-set="routing"] button[data-v="${c.v0}"]`), machine: c => ok(I().doc("global", c.g)?.routingMode === c.r0, "routing " + I().doc("global", c.g)?.routingMode), within: 15000 }
		]
	};
	const panTrim = {
		name: "mm-mix-pan-undo", proves: ["MM-120"],
		steps: [
			go("mix"),
			{ say: "drag track 2's PAN bar sideways", act: async (u, c) => { c.v0 = wk().tracks[1].pages[1][6]; const d = c.v0 > 64 ? -1 : 1; await u.drag(strip(1, ".pc.pan"), [[d * 8, 0], [d * 16, 0], [d * 24, 0]]); }, machine: c => ok(wk().tracks[1].pages[1][6] !== c.v0, "PAN " + wk().tracks[1].pages[1][6]), within: 8000 },
			{ ...undoKey, act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(wk().tracks[1].pages[1][6] === c.v0, "PAN " + wk().tracks[1].pages[1][6]), within: 8000 }
		]
	};
	const msOff = {
		name: "mm-mix-ms-off", proves: ["MM-020"],
		steps: [
			go("seq"),
			{ say: "mute two tracks on the rail", act: async () => { }, machine: () => true },
			{ say: "click M on tracks 1 and 2, then M/S off", act: async u => { for (const i of [0, 1]) if (!synthMuted(i)) { u.click(`#rail .th[data-sel="${i}"] .ms.m`); await sleep(400); } await until(() => synthMuted(0) && synthMuted(1), 4000); u.click("#allon"); }, machine: () => ok(!synthMutes().length, "machine mutes " + synthMutes()), screen: () => ok($1("#allon").disabled, "M/S off still on") }
		]
	};

	/* ---------- Perform ---------- */
	const poly = {
		name: "mm-perform-poly", proves: ["MM-032", "MM-087", "MM-239"],
		steps: [
			go("perform"),
			{ say: "click POLY", act: u => u.click('[data-pmode="poly"]'), machine: () => ok(machine().poly === true, "poly " + machine().poly), screen: () => ok(pressed('[data-pmode="poly"]'), "not lit"), within: 8000 },
			{ say: "click Auto track: POLY off", act: u => u.click('[data-pmode="normal"]'), machine: () => ok(machine().poly === false, "poly " + machine().poly), within: 8000 }
		]
	};
	const multiTrig = {
		name: "mm-perform-multi-trig", proves: ["MM-051"],
		steps: [
			go("perform"),
			{ say: "click Multi trig and SPLIT KEY", act: async (u, c) => { c.m0 = wk().multiTrig?.mode; u.click('[data-pmode="multi"]'); await sleep(300); c.v = c.m0 === 1 ? 0 : 1; u.click(`[data-set="mtmode"] button[data-v="${c.v}"]`); }, machine: c => ok(wk().multiTrig?.mode === c.v, "multi trig " + JSON.stringify(wk().multiTrig)), within: 15000 },
			{ say: "click the first mode back, then Auto track", act: async (u, c) => { u.click(`[data-set="mtmode"] button[data-v="${c.m0}"]`); await sleep(300); u.click('[data-pmode="normal"]'); }, machine: c => ok(wk().multiTrig?.mode === c.m0, "multi trig " + JSON.stringify(wk().multiTrig)), within: 15000 }
		]
	};
	const multiMap = {
		name: "mm-perform-multi-map", proves: ["MM-052", "MM-300"],
		steps: [
			go("perform"),
			{ say: "click Multi map: the map table", act: (u, c) => { c.g = machine().global?.current ?? 0; c.m0 = JSON.stringify(I().doc("global", c.g)?.multiMap); u.click('[data-pmode="map"]'); }, screen: () => ok(!!$1("table.mmap"), "no table") },
			{ say: "click Split selected range", act: (u, c) => { c.n0 = $all("table.mmap tbody tr").length; u.click("[data-madd]"); }, screen: c => ok($all("table.mmap tbody tr").length === c.n0 + 1, $all("table.mmap tbody tr").length + " rows"), machine: c => ok(JSON.stringify(I().doc("global", c.g)?.multiMap) !== c.m0, "global unchanged"), within: 15000 },
			{ say: "click × on the new range", act: (u, c) => u.click(`[data-mdel="${S().mmapSel}"]`), screen: c => ok($all("table.mmap tbody tr").length === c.n0, $all("table.mmap tbody tr").length + " rows"), machine: c => ok(JSON.stringify(I().doc("global", c.g)?.multiMap) === c.m0, "global differs"), within: 15000 }
		],
		async tidy(u) { if ($1('[data-pmode="normal"]')) u.click('[data-pmode="normal"]'); }
	};
	const kbPlay = {
		name: "mm-perform-keyboard", proves: ["MM-050"],
		steps: [
			go("perform"),
			{ say: "click a key of the keyboard: the note goes to the machine (live notes have no read-back)", act: (u, c) => { sent.length = 0; c.k = $1('.kb .w[data-key="60"]') ? 60 : +$1(".kb .w[data-key]").dataset.key; u.click(`.kb [data-key="${c.k}"]`); },
				machine: () => ok(sent.includes("midi"), "sent " + sent.join(",")), screen: () => ok(/MIDI channel/.test($1("#kbinfo")?.textContent || ""), "info " + $1("#kbinfo")?.textContent) }
		]
	};

	/* B-062, I-002: a key is lit while it is held, by the mouse, the computer keyboard or a MIDI keyboard (the plug-in's
	   midiHeld), and dark when it is let go */
	const litKeys = () => $all(".kb [data-key].dn, .kb [data-key].mi").map(k => +k.dataset.key).sort((a, b) => a - b).join(",");
	const pdown = (q, type) => { const k = $1(q), r = k.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height * 0.8;
		document.elementFromPoint(x, y).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, buttons: type === "pointerdown" ? 1 : 0, clientX: x, clientY: y })); };
	const kbKey = (type, key) => document.body.dispatchEvent(new KeyboardEvent(type, { key, code: "Key" + key.toUpperCase(), bubbles: true, cancelable: true }));
	const kbLit = {
		name: "mm-perform-keys-lit", proves: ["MM-050"],
		steps: [
			go("perform"),
			{ say: "press a key with the mouse and hold it: it is lit", act: (u, c) => { blur(); c.k = $1('.kb .w[data-key="60"]') ? 60 : +$1(".kb .w[data-key]").dataset.key; pdown(`.kb [data-key="${c.k}"]`, "pointerdown"); },
				screen: c => ok(litKeys() === String(c.k), "lit " + litKeys()) },
			{ say: "let go: no key is lit (B-062)", act: (u, c) => pdown(`.kb [data-key="${c.k}"]`, "pointerup"), screen: () => ok(litKeys() === "", "lit " + litKeys()) },
			{ say: "click a key: no key stays lit", act: (u, c) => u.click(`.kb [data-key="${c.k}"]`), screen: () => ok(litKeys() === "", "lit " + litKeys()) },
			{ say: "hold A on the computer keyboard: its key (C3, octave 0) is lit while held", act: (u, c) => { blur(); c.a = KEYS_BASE + 12 * KB.oct; kbKey("keydown", "a"); },
				screen: c => ok(!$1(`.kb [data-key="${c.a}"]`) || litKeys() === String(c.a), "lit " + litKeys()) },
			{ say: "let go of A: dark", act: () => kbKey("keyup", "a"), screen: () => ok(litKeys() === "", "lit " + litKeys()) },
			{ say: "a MIDI keyboard holds C4 and E4 on a channel the machine does not play (the plug-in's midiHeld): none lit", act: (u, c) => {
				const g = globalNow()?.channels || {}, played = new Set([g.auto, g.multiTrig, g.multiMap, ...[0, 1, 2, 3, 4, 5].map(t => t < g.span && g.base + t <= 14 ? g.base + t : null)].filter(x => x != null && x < 16));
				c.on = [...played][0]; c.off = [...Array(16).keys()].find(x => !played.has(x)); c.held = ns => window.gm.recv([{ type: "midiHeld", notes: ns.map(note => ({ ch: c.on, note })) }]);
				if (c.on == null) throw new Error("the global plays no channel");
				window.gm.recv([{ type: "midiHeld", notes: c.off == null ? [] : [{ ch: c.off, note: 60 }, { ch: c.off, note: 64 }] }]); },
				screen: () => ok(litKeys() === "", "lit " + litKeys()) },
			{ say: "on a channel the machine plays: both lit", act: (u, c) => c.held([60, 64]),
				screen: () => ok(["60", "64"].every(n => !$1(`.kb [data-key="${n}"]`) || $1(`.kb [data-key="${n}"]`).classList.contains("mi")), "lit " + litKeys()) },
			{ say: "the octave changes (the keyboard is drawn again): still lit", act: u => { u.click('[data-kboct="1"]'); u.click('[data-kboct="-1"]'); },
				screen: () => ok(["60", "64"].every(n => !$1(`.kb [data-key="${n}"]`) || $1(`.kb [data-key="${n}"]`).classList.contains("mi")), "lit " + litKeys()) },
			{ say: "it lets go of C4: only E4 lit", act: (u, c) => c.held([64]),
				screen: () => ok(!$1('.kb [data-key="60"]')?.classList.contains("mi") && (!$1('.kb [data-key="64"]') || $1('.kb [data-key="64"]').classList.contains("mi")), "lit " + litKeys()) },
			{ say: "and of E4: none lit", act: (u, c) => c.held([]), screen: () => ok(litKeys() === "", "lit " + litKeys()) }
		],
		async tidy() { window.gm.recv([{ type: "midiHeld", notes: [] }]); kbKey("keyup", "a"); }
	};

	/* I-022: a value typed: ⌘-click a value box, type, Enter (one edit, one undo step); a list box takes its names; past
	   the end is refused and the field stays; Esc leaves it; Enter on the focused box opens it again; double-click is
	   still the default */
	const field = () => $1("input.vedit");
	const typeIn = (u, text) => { const f = field(); if (!f) throw new Error("no value field"); f.value = text; u.key("Enter"); };
	const typeValue = {
		name: "mm-sound-type-value", proves: ["MM-015"],
		steps: [
			go("sound"), sel(0),
			{ say: "⌘-click a filter value: a field over it with the value it shows", act: (u, c) => {
				const el = $1('#main .pc[data-g="FLT"]') || $1('#main .pc[data-g="AMP"]'); if (!el) throw new Error("no FLT or AMP value");
				c.g = el.dataset.g; c.i = +el.dataset.n; c.pg = PAGES.indexOf(c.g); c.q = `#main .pc[data-g="${c.g}"][data-n="${c.i}"]`;
				c.v0 = wk().tracks[0].pages[c.pg][c.i]; c.txt0 = valueText(c.q); c.max = maxOf(ref(el)[2]); c.signed = !!ref(el)[2].signed;
				u.click(c.q, { cmd: true }); },
				screen: c => ok(!!field() && field().value === c.txt0 && document.activeElement === field(), "field " + field()?.value + ", shows " + c.txt0) },
			{ say: "type a value and press Enter: the box shows it, the machine has it", act: (u, c) => { c.t1 = c.signed ? (c.txt0 === "+20" ? "-20" : "+20") : (c.txt0 === "100" ? "20" : "100"); typeIn(u, c.t1); },
				screen: c => ok(!field() && valueText(c.q) === c.t1, "shows " + valueText(c.q)), machine: c => ok(wk().tracks[0].pages[c.pg][c.i] !== c.v0, "kit value " + wk().tracks[0].pages[c.pg][c.i]), within: 8000 },
			{ say: "⌘-click it again and type 999: refused, the field stays, nothing sent", act: (u, c) => { c.v1 = wk().tracks[0].pages[c.pg][c.i]; u.click(c.q, { cmd: true }); typeIn(u, "999"); },
				screen: c => ok(!!field() && field().classList.contains("bad") && valueText(c.q) === c.t1, "field " + field()?.className), machine: c => ok(wk().tracks[0].pages[c.pg][c.i] === c.v1, "kit value " + wk().tracks[0].pages[c.pg][c.i]) },
			{ say: "press Esc: the field goes, the value as it was", act: u => u.key("Escape"), screen: c => ok(!field() && valueText(c.q) === c.t1 && document.activeElement === $1(c.q), "shows " + valueText(c.q)) },
			{ say: "press Enter on the box (it has the focus): the field again", act: u => u.key("Enter"), screen: () => ok(!!field(), "no field") },
			{ say: "press Esc, then double-click the box: its default, as before", act: (u, c) => { u.key("Escape"); u.dblclick(c.q); }, screen: c => ok(!field() && valueText(c.q) === (c.signed ? "0" : "64"), "shows " + valueText(c.q)), within: 8000 },
			{ say: "Cmd+Z: the double-click undone", act: u => u.key("z", { cmd: true }), screen: c => ok(valueText(c.q) === c.t1, "shows " + valueText(c.q)), within: 8000 },
			{ ...undoKey, say: "Cmd+Z once more: the typed value undone in one step", screen: c => ok(valueText(c.q) === c.txt0, "shows " + valueText(c.q)), machine: c => ok(wk().tracks[0].pages[c.pg][c.i] === c.v0, "kit value " + wk().tracks[0].pages[c.pg][c.i]), within: 8000 },
			{ say: "⌘-click a value that shows names (a list) and type another of its names in small letters: that one", act: (u, c) => {
				const el = $all('#main .pc[data-g]').find(e => PAGES.includes(e.dataset.g) && (ref(e)?.[2]?.en?.length || 0) > 2); if (!el) throw new Error("no value with names on Sound");
				c.lg = el.dataset.g; c.li = +el.dataset.n; c.lq = `#main .pc[data-g="${c.lg}"][data-n="${c.li}"]`; c.lpg = PAGES.indexOf(c.lg); c.en = ref(el)[2].en;
				c.l0 = wk().tracks[0].pages[c.lpg][c.li]; c.ltxt0 = valueText(c.lq); c.lt = c.en.find((x, k) => x !== c.ltxt0 && c.en.indexOf(x) === k && /[a-z]/i.test(x));
				u.click(c.lq, { cmd: true }); typeIn(u, c.lt.toLowerCase()); },
				screen: c => ok(!field() && valueText(c.lq) === c.lt, `${c.lg} ${c.li} shows ${valueText(c.lq)}, typed ${c.lt}`), machine: c => ok(wk().tracks[0].pages[c.lpg][c.li] !== c.l0, "kit value " + wk().tracks[0].pages[c.lpg][c.li]), within: 8000 },
			{ say: "a name it does not have: refused, with its names", act: (u, c) => { u.click(c.lq, { cmd: true }); typeIn(u, "wobble"); },
				screen: c => ok(!!field() && field().classList.contains("bad") && field().title.includes(c.en[0]), "title " + field()?.title) },
			{ say: "Esc, then Cmd+Z: as it was", act: u => { u.key("Escape"); u.key("z", { cmd: true }); }, screen: c => ok(valueText(c.lq) === c.ltxt0, "shows " + valueText(c.lq)), machine: c => ok(wk().tracks[0].pages[c.lpg][c.li] === c.l0, "kit value " + wk().tracks[0].pages[c.lpg][c.li]), within: 8000 }
		],
		async tidy() { if (field()) ValueEdit.close(); }
	};

	/* ---------- Song ---------- */
	const songDoc = () => I().doc("song", S().songs?.slot ?? machine().song?.current ?? 0);
	const songRows = {
		name: "mm-song-rows", proves: ["MM-261", "MM-268"],
		steps: [
			go("song"),
			{ say: "click a pattern pad: a row is added", act: async (u, c) => { u.click('[data-set="songpick"] button[data-v="song"]'); await sleep(200); c.r0 = JSON.stringify(songDoc()?.rows); c.n0 = songDoc()?.rows.length; u.click('[data-addpat="0"]'); }, machine: c => ok(songDoc()?.rows.length === c.n0 + 1, songDoc()?.rows.length + " rows"), within: 15000 },
			{ say: "click Delete on the row", act: u => u.click('[data-rowact="del"]'), machine: c => ok(JSON.stringify(songDoc()?.rows) === c.r0, songDoc()?.rows.length + " rows"), within: 15000 }
		]
	};
	const songPicker = {
		name: "mm-song-picker-load", proves: ["MM-252", "MM-253"],
		steps: [
			go("song"),
			{ say: "click song 24 in the song slots: it is selected, the machine's song stays", act: async (u, c) => { c.cur = machine().song?.current ?? 0; await until(() => !!I().doc("song", 23), 15000); u.click('[data-ss="23"]'); }, screen: () => ok($1('[data-ss="23"]')?.getAttribute("aria-selected") === "true", "not selected"), machine: c => ok(machine().song?.current === c.cur, "machine song " + machine().song?.current), within: 15000 },
			{ say: "click Load", act: u => u.click('[data-sa="load"]'), machine: () => ok(machine().song?.current === 23, "machine song " + machine().song?.current), screen: () => ok($1('[data-ss="23"]')?.classList.contains("cur"), "not lit"), within: 15000 },
			{ say: "load the first song back", act: async (u, c) => { await loadSlot(u, c.cur); }, machine: c => ok(machine().song?.current === c.cur, "machine song " + machine().song?.current), within: 15000 }
		]
	};
	/* 0.6 wave 1: the song slots (deskSongSlots.js, as the Machinedrum Editor's md-song-slots). Four slots, A B C D, the
	   person's scratch (empty ones, else the last ones that are not the machine's song, cleared first): A loaded and
	   named (F2), copied to B (Copy, Paste), dragged onto C, the machine's song saved to D with a name (Save to...); Clear
	   asks first, Cmd+Z brings the song back. Each write is a dump through SYSEX RECV. */
	const songOf = s => I().doc("song", s);
	const songEmpty = s => { const g = songOf(s); return !!g && g.rows.length === 1 && g.rows[0].kind === "end" && !(g.name || "").trim(); };
	const sameRows = (a, b) => !!a && !!b && JSON.stringify(a.rows) === JSON.stringify(b.rows);
	const ssEl = s => `[data-ss="${s}"]`;
	const songScratch = async () => {
		const cur0 = machine().song?.current ?? 0;
		let out = []; for (let s = 0; s < 24 && out.length < 4; s++) if (s !== cur0 && songEmpty(s)) out.push(s);
		if (out.length >= 4) return out;
		out = []; for (let s = 23; s >= 0 && out.length < 4; s--) if (s !== cur0) out.push(s);
		out.reverse();
		for (const s of out) if (!songEmpty(s)) Bridge.send({ op: "songClear", s, force: true });
		await until(() => out.every(songEmpty), 20000);
		return out;
	};
	const songSlotsJ = {
		name: "mm-song-slots", proves: ["MM-253", "MM-254", "MM-255"],
		steps: [
			go("song"),
			{ say: "stop; click a scratch slot: it is only selected, the machine's song stays", act: async (u, c) => {
				if (S().playing) { u.click("#play"); await until(() => !S().playing, 3000); }
				await until(() => I().slots("song").length >= 24, 20000);
				c.cur = machine().song?.current ?? 0; c.m0 = machine().song?.songMode === true; c.slots = await songScratch();
				if (c.slots.length < 4) throw new Error("fewer than four song slots to work in");
				u.click(ssEl(c.slots[0])); await sleep(300); },
				screen: c => ok($1(ssEl(c.slots[0]))?.getAttribute("aria-selected") === "true" && $1('[data-sa="paste"]')?.disabled, "slot " + $1(ssEl(c.slots[0]))?.className),
				machine: c => ok(machine().song?.current === c.cur, "machine song " + machine().song?.current), within: 30000 },
			{ say: "Load: the machine's song is A", act: u => u.click('[data-sa="load"]'),
				machine: c => ok(machine().song?.current === c.slots[0], "machine song " + machine().song?.current), screen: c => ok($1(ssEl(c.slots[0]))?.classList.contains("cur"), "not lit"), within: 15000 },
			{ say: "click the SONG key and pads A01, A02: A gets two rows", act: async (u, c) => { u.click('[data-set="songpick"] button[data-v="song"]'); await sleep(300); u.click('[data-bank="0"]'); await sleep(150); u.click('[data-addpat="0"]'); await until(() => songOf(c.slots[0])?.rows.length === 2, 8000); u.click('[data-addpat="1"]'); },
				machine: c => ok(songOf(c.slots[0])?.rows.length === 3, "rows " + songOf(c.slots[0])?.rows.length), screen: c => ok(/2 rows/.test($1(ssEl(c.slots[0]))?.textContent || ""), $1(ssEl(c.slots[0]))?.textContent), within: 15000 },
			{ say: "press F2, type JOURNEY A, press Enter: A is named", act: async (u, c) => { u.click(ssEl(c.slots[0])); await sleep(250); u.key("F2"); await sleep(250); u.type("#slin", "journey a"); await sleep(100); u.key("Enter"); },
				machine: c => ok(songOf(c.slots[0])?.name === "JOURNEY A", `name "${songOf(c.slots[0])?.name}"`), screen: c => ok(/JOURNEY A/.test($1(ssEl(c.slots[0]))?.textContent || "") && !$1("#slin"), $1(ssEl(c.slots[0]))?.textContent), within: 15000 },
			{ say: "Copy A, select B, Paste: B holds the song, no question", act: async (u, c) => { u.click(ssEl(c.slots[0])); await sleep(200); u.click('[data-sa="copy"]'); await sleep(300); u.click(ssEl(c.slots[1])); await sleep(200); u.click('[data-sa="paste"]'); },
				machine: c => ok(sameRows(songOf(c.slots[1]), songOf(c.slots[0])) && songOf(c.slots[1]).name === "JOURNEY A", `B rows ${songOf(c.slots[1])?.rows.length}`), screen: () => ok(!dlgShown(), "a question"), within: 15000 },
			{ say: "drag A onto the empty slot C: a copy", act: async (u, c) => { for (const k of [0, 2]) $1(ssEl(c.slots[k]))?.scrollIntoView({ block: "nearest" }); await sleep(100); await u.dragDrop(ssEl(c.slots[0]), ssEl(c.slots[2])); },
				machine: c => ok(sameRows(songOf(c.slots[2]), songOf(c.slots[0])), `C rows ${songOf(c.slots[2])?.rows.length}`), within: 15000 },
			{ say: "select D, Save to..., type SAVED D, Enter: the machine's song, named, in D", act: async (u, c) => { u.click(ssEl(c.slots[3])); await sleep(250); u.click('[data-sa="saveas"]'); await sleep(250); u.type("#slin", "saved d"); await sleep(100); u.key("Enter"); },
				machine: c => ok(sameRows(songOf(c.slots[3]), songOf(c.slots[0])) && songOf(c.slots[3]).name === "SAVED D", `D "${songOf(c.slots[3])?.name}" rows ${songOf(c.slots[3])?.rows.length}`), within: 15000 },
			{ say: "select B, Clear: it asks first, and B still holds the song", act: async (u, c) => { u.click(ssEl(c.slots[1])); await sleep(250); u.click('[data-sa="clear"]'); await until(dlgShown, 3000); },
				screen: () => ok(dlgShown() && /Clear/.test($1("#dlg").textContent), "no question"), machine: c => ok(songOf(c.slots[1]).rows.length > 1, "B emptied before the answer") },
			{ say: "answer Clear song: B is empty and quiet", act: u => u.click(dlgButton("Clear song") || $1("#dlg .danger")),
				machine: c => ok(songEmpty(c.slots[1]), `B rows ${songOf(c.slots[1])?.rows.length}`), screen: c => ok($1(ssEl(c.slots[1]))?.classList.contains("empty"), "B not quiet"), within: 15000 },
			{ say: "Cmd+Z: B holds the song again", act: u => { blur(); u.key("z", { cmd: true }); },
				machine: c => ok(sameRows(songOf(c.slots[1]), songOf(c.slots[0])), `B rows ${songOf(c.slots[1])?.rows.length}`), within: 15000 }
		],
		async tidy(u, c) {
			if (!c.slots) return;
			if (S().playing) { u.click("#play"); await until(() => !S().playing, 3000); }
			if (c.cur != null) await loadSlot(u, c.cur);
			for (const s of c.slots) if (s !== machine().song?.current && !songEmpty(s)) Bridge.send({ op: "songClear", s, force: true });
			await until(() => c.slots.every(s => s === machine().song?.current || songEmpty(s)), 20000);
			if (c.m0 != null && (machine().song?.songMode === true) !== c.m0) { u.click(`[data-set="songpick"] button[data-v="${c.m0 ? "song" : "pattern"}"]`); await sleep(2000); }
		}
	};
	/* the palette's three keys: a pad click goes to the pattern, into the chain or into the song */
	const songKeysJ = {
		name: "mm-song-keys", proves: ["MM-251", "MM-257"],
		steps: [
			go("song"),
			{ say: "click PATTERN: the machine plays patterns, no row inspector, a pad click queues that pattern", act: async (u, c) => { c.m0 = machine().song?.songMode === true; c.p0 = cur(); u.click('[data-set="songpick"] button[data-v="pattern"]'); await until(() => machine().song?.songMode === false, 8000); await sleep(300); u.click('[data-bank="0"]'); await sleep(200); c.p = c.p0 === 5 ? 6 : 5; u.click(`[data-patgo="${c.p}"]`); },
				screen: () => ok(pressed('[data-set="songpick"] button[data-v="pattern"]') && !$1(".insp") && !$1("[data-addpat]") && !$1("[data-chainpad]"), "keys " + $all('[data-set="songpick"] button').map(b => b.dataset.v + b.getAttribute("aria-pressed")).join(" ")),
				machine: c => ok(cur() === c.p || machine().pattern?.queued === c.p, `pattern ${cur()}, queued ${machine().pattern?.queued}`), within: 15000 },
			{ say: "click CHAIN: the pads number the chain, the machine stays in pattern mode", act: u => u.click('[data-set="songpick"] button[data-v="chain"]'),
				screen: () => ok(pressed('[data-set="songpick"] button[data-v="chain"]') && !!$1("[data-chainpad]") && !$1(".insp"), "no chain pads"), machine: () => ok(machine().song?.songMode === false, "songMode " + machine().song?.songMode) },
			{ say: "click SONG: the machine is in song mode, the pads add rows, the selected row shows", act: u => u.click('[data-set="songpick"] button[data-v="song"]'),
				screen: () => ok(pressed('[data-set="songpick"] button[data-v="song"]') && !!$1("[data-addpat]") && !!$1(".insp"), "SONG state"), machine: () => ok(machine().song?.songMode === true, "songMode " + machine().song?.songMode), within: 15000 }
		],
		async tidy(u, c) {
			if (c.p0 != null && cur() !== c.p0) { Bridge.send({ op: "select", p: c.p0, now: true }); await sleep(1500); }
			if (c.m0 != null && (machine().song?.songMode === true) !== c.m0) { u.click(`[data-set="songpick"] button[data-v="${c.m0 ? "song" : "pattern"}"]`); await sleep(2000); }
		}
	};
	const songChain = {
		name: "mm-song-chain", proves: ["MM-165"],
		steps: [
			go("song"),
			{ say: "click Chain and pads A02, A03", act: async (u, c) => { c.m0 = machine().song?.songMode === true; u.click('[data-set="songpick"] button[data-v="chain"]'); await sleep(200); u.click('[data-bank="0"]'); await sleep(200); u.click('[data-chainpad="1"]'); await sleep(100); u.click('[data-chainpad="2"]'); },
				machine: () => ok(desk().chain?.active && same(desk().chain.patterns, [1, 2]), "chain " + JSON.stringify(desk().chain)), within: 8000 },
			{ say: "click Clear: the chain ends", act: u => u.click('[data-chain="clear"]'), machine: () => ok(!desk().chain?.active, "chain " + JSON.stringify(desk().chain)), within: 8000 }
		],
		async tidy(u, c) { if (desk().chain?.active) Bridge.send({ op: "chainClear" }); if (c.m0 === true && machine().song?.songMode !== true) { Bridge.send({ op: "seqMode", song: true }); await sleep(1500); } }
	};

	/* ---------- the library ---------- */
	const ks = k => `#libpop .ks[data-ks="${k}"]`;
	const kitName = k => MmConvert.kitName(I().doc("kit", k) || {});
	const kitLoad = {
		name: "mm-lib-kit-load", proves: ["MM-025", "MM-075", "MM-096"],
		steps: [
			{ say: "click KIT on the LCD: the kit library", act: u => u.click("#kitf"), screen: () => ok(!$1("#libpop").hidden && $all("#libpop .ks").length >= 64, $all("#libpop .ks").length + " slots") },
			{ say: "click another kit: it loads", act: async (u, c) => { c.k0 = machine().kit.current; c.k = I().slots("kit").find(k => k !== c.k0 && I().doc("kit", k) && !MmConvert.kitEmpty(I().doc("kit", k))); u.click(ks(c.k)); if (await until(dlgShown, 1500)) { u.click(dlgButton("Load without saving") || $1("#dlg .danger")); c.note = "asked first"; } },
				machine: c => ok(machine().kit.current === c.k, "machine kit " + machine().kit.current), screen: c => ok($1(ks(c.k))?.classList.contains("cur"), "not current"), within: 10000 },
			{ say: "click the first kit again", act: async (u, c) => { u.click(ks(c.k0)); if (await until(dlgShown, 1500)) u.click(dlgButton("Load without saving") || $1("#dlg .danger")); }, machine: c => ok(machine().kit.current === c.k0, "machine kit " + machine().kit.current), within: 10000 },
			{ say: "press Escape", act: u => u.key("Escape"), screen: () => ok($1("#libpop").hidden, "open") }
		]
	};
	const kitCopy = {
		name: "mm-lib-kit-copy-paste-undo", proves: ["MM-103"],
		steps: [
			{ say: "open the kit library, Alt-click a kit, click Copy", act: async (u, c) => { u.click("#kitf"); await sleep(300); const cur0 = machine().kit.current; c.src = I().slots("kit").find(k => k !== cur0 && kitName(k) && !MmConvert.kitEmpty(I().doc("kit", k))); u.click(ks(c.src), { alt: true }); await sleep(150); u.click('#libpop [data-la="copy"]'); }, screen: c => ok(true) },
			{ say: "Alt-click another kit and click Paste", act: async (u, c) => { const cur0 = machine().kit.current; c.dst = I().slots("kit").reverse().find(k => k !== cur0 && k !== c.src && kitName(k) !== kitName(c.src)); c.d0 = kitName(c.dst); u.click(ks(c.dst), { alt: true }); await sleep(150); u.click('#libpop [data-la="paste"]'); await sleep(300); if (dlgShown()) u.click($1("#dlg .danger") || $1('#dlg [data-dlg="0"]')); },
				machine: c => ok(kitName(c.dst) === kitName(c.src), "slot " + kitName(c.dst)), within: 15000 },
			{ ...undoKey, say: "press Cmd+Z (the library open): the slot is back", machine: c => ok(kitName(c.dst) === c.d0, "slot " + kitName(c.dst)), within: 15000 },
			{ say: "press Escape", act: u => u.key("Escape"), screen: () => ok($1("#libpop").hidden, "open") }
		]
	};
	const patGo = {
		name: "mm-lib-pattern-go", proves: ["MM-070", "MM-162"],
		steps: [
			{ say: "click the pattern on the LCD and another pattern", act: async (u, c) => { c.p0 = cur(); u.click("#pat"); await sleep(300); u.click(`#libpop .ps[data-ps="${(c.p0 + 2) % 128}"]`); await confirmIfAsked(u); }, machine: c => ok(cur() === (c.p0 + 2) % 128, "machine pattern " + cur()), within: 10000 },
			{ say: "click the first one again", act: async (u, c) => { if ($1("#libpop").hidden) u.click("#pat"); await sleep(300); u.click(`#libpop .ps[data-ps="${c.p0}"]`); await confirmIfAsked(u); }, machine: c => ok(cur() === c.p0, "machine pattern " + cur()), within: 10000 },
			{ say: "press Escape", act: u => u.key("Escape"), screen: () => ok($1("#libpop").hidden, "open") }
		]
	};
	const dialogEsc = {
		name: "mm-dialog-esc-cancel", proves: [],
		steps: [
			go("sound"), sel(0),
			{ say: "drag a value: the kit has unsaved edits", act: async u => { const el = $1('#main .pc[data-g="FLT"]'); await u.drag(el, [[6, 0], [12, 0], [18, 0]]); }, machine: () => ok(machine().kit?.working === "edited", "kit " + machine().kit?.working), within: 8000 },
			{ say: "open the kit library and click another kit: the machine asks", act: async (u, c) => { c.k0 = machine().kit.current; u.click("#kitf"); await sleep(300); c.k = I().slots("kit").find(k => k !== c.k0 && I().doc("kit", k) && !MmConvert.kitEmpty(I().doc("kit", k))); u.click(ks(c.k)); }, screen: () => ok(dlgShown() && document.activeElement?.textContent.trim() === "Cancel", `dialog ${dlgShown()}, focus ${document.activeElement?.textContent}`), within: 4000 },
			{ say: "press Escape: Cancel, nothing loads", act: u => u.key("Escape"), screen: () => ok(!dlgShown(), "still open"), machine: c => ok(machine().kit.current === c.k0, "machine kit " + machine().kit.current), within: 3000 }
		],
		async tidy(u) { if (!$1("#libpop").hidden) u.key("Escape"); await sleep(200); u.click("#undo"); await sleep(800); }
	};

	/* ---------- AUDIO / MIDI, the engine menu ---------- */
	const audioPanel = {
		name: "mm-audio-panel", proves: [],
		steps: [
			{ say: "press , : AUDIO / MIDI opens", act: u => { blur(); u.key(","); }, screen: () => ok(!$1("#audiopop").hidden && $1("#audiopop").textContent.length > 40, "closed") },
			{ say: "press Escape", act: u => u.key("Escape"), screen: () => ok($1("#audiopop").hidden, "open") }
		]
	};
	const romCard = {
		name: "mm-engine-rom-card", proves: [],
		steps: [
			{ say: "choose LOAD ROM: the card shows the firmware in use", act: u => u.pick("engsel", "rom"), screen: () => ok(!$1("#bootcard").hidden && /1\.32/.test($1("#bootcur")?.textContent || ""), "card " + $1("#bootcur")?.textContent), within: 5000 },
			{ say: "click Close", act: u => u.click('#bootcard [data-bootrom="close"]'), screen: () => ok($1("#bootcard").hidden, "still shown"), machine: () => ok(!!machine().input, "the machine stopped") }
		]
	};
	const hwNoMachine = {
		name: "mm-engine-hw-no-machine", proves: [],
		steps: [
			{ say: "choose HW MIDI in the engine menu (no Monomachine attached)", act: u => u.pick("engsel", "hw"), screen: () => ok(!$1("#bootmidi").hidden, "no card"), machine: () => ok(machine().capabilities?.engine === "hw", "engine " + machine().capabilities?.engine), within: 10000 },
			{ say: "the card says no machine answers", screen: () => ok($1("#bootmidi").classList.contains("lost"), $1("#bmt")?.textContent), within: 20000 },
			{ say: "click Use the emulator", act: u => u.click('[data-bootmidi="emu"]'), screen: () => ok($1("#bootmidi").hidden, "card shown"), machine: () => ok(machine().capabilities?.engine === "emu" && machine().lifecycle === "ready", "engine " + machine().capabilities?.engine + " " + machine().lifecycle), within: 40000 }
		],
		async tidy() { await until(() => machine().loading && machine().loading.done >= machine().loading.total, 60000); }
	};
	const notePlay = {
		name: "mm-keys-play-notes", proves: ["MM-027", "MM-050"],
		steps: [
			go("seq"), sel(0),
			{ say: "press A on the keyboard: track 1 plays", act: u => { results.length = 0; blur(); u.key("a"); }, machine: () => ok(results.some(r => /note/i.test(r.op) && r.ok), "results " + results.map(r => r.op + ":" + r.ok).join(",")) }
		]
	};

	/* ---------- more: the keys, the Sequence comforts, GEN and MUTATE, Sound, Mix, Perform, Song, the library ---------- */
	const undoUntil = async (u, done, n = 6) => { for (let i = 0; i < n && !done(); i++) { blur(); u.key("z", { cmd: true }); await until(done, 4000); } };
	const pat0 = () => JSON.stringify(patDoc()?.tracks);
	const roll = (t, s, m = {}) => async u => { const p = rollCell(t, s); u.click(p.c, m, p.fx, p.fy); };
	/* B taps the tempo on every workspace but Sequence, where it is the piano roll's Draw (Radek 2026-10-10;
	   mm-keys-tap-tempo-shift: Shift+B there): tapped on Mix, Draw left as it was */
	const tapTempo = {
		name: "mm-keys-tap-tempo", proves: ["MM-023", "MM-197"],
		steps: [
			go("mix"),
			{ say: "tap B five times, about 0.5 s apart (T is a black key on the Monomachine Editor): the tempo follows, Draw stays as it was", act: async (u, c) => { c.b0 = machine().tempo; c.d0 = S().rollDraw; blur(); if (typeof TAP !== "undefined" && TAP.length) await sleep(2100); /* a new run of taps (the page joins taps less than 2 s apart) */ const at = []; for (let i = 0; i < 5; i++) { at.push(performance.now()); u.key("b"); await sleep(500); } c.want = Math.round(60000 / ((at[4] - at[0]) / 4) * 10) / 10; c.note = c.want + " BPM"; },
				screen: c => ok(Math.abs(S().bpm - c.want) <= tapSlack(c.want) && S().rollDraw === c.d0, "BPM " + S().bpm + ", want " + c.want + ", Draw " + S().rollDraw), machine: c => ok(Math.abs(machine().tempo - c.want) <= tapSlack(c.want), "tempo " + machine().tempo + ", want " + c.want), within: 8000 }
		],
		async tidy(u, c) { if (c.b0 != null) { const d = c.b0 > machine().tempo ? -1 : 1; await u.drag("#bpm", [[0, d * 2 * (c.b0 - machine().tempo)]]); } if (c.d0 != null && S().rollDraw !== c.d0) setRollDraw(c.d0); }
	};
	const queue = {
		name: "mm-seq-queue-while-playing", proves: ["MM-071", "MM-164"],
		steps: [
			{ say: "press PLAY", act: (u, c) => { c.p0 = cur(); u.click("#play"); }, machine: () => ok(tele.last?.playing, "not playing"), within: 6000 },
			{ say: "click › on the LCD: the next pattern is queued", act: async u => { u.click("#patNext"); await confirmIfAsked(u); }, machine: c => ok(machine().pattern?.queued === c.p0 + 1 || cur() === c.p0 + 1, "queued " + machine().pattern?.queued), within: 4000 },
			{ say: "it starts at the pattern end", machine: c => ok(cur() === c.p0 + 1, "machine pattern " + cur()), screen: c => ok(S().pat === c.p0 + 1, "page pattern " + S().pat), within: 25000 },
			{ say: "press STOP and click ‹", act: async u => { u.click("#play"); await until(() => !S().playing, 3000); u.click("#patPrev"); await confirmIfAsked(u); }, machine: c => ok(cur() === c.p0, "machine pattern " + cur()), within: 8000 }
		],
		async tidy(u) { if (S().playing) u.click("#play"); }
	};
	const ks2 = k => `#libpop .ks[data-ks="${k}"]`;
	const anotherKit = () => I().slots("kit").find(k => k !== machine().kit.current && I().doc("kit", k) && !MmConvert.kitEmpty(I().doc("kit", k)));
	const dialogKeys = {
		name: "mm-dialog-keys-behind", proves: [],
		steps: [
			go("sound"), sel(0),
			{ say: "drag a value: the kit has unsaved edits", act: async u => { await u.drag('#main .pc[data-g="FLT"]', [[6, 0], [12, 0], [18, 0]]); }, machine: () => ok(machine().kit?.working === "edited", "kit " + machine().kit?.working), within: 8000 },
			{ say: "open the kit library and click another kit: the machine asks", act: async (u, c) => { c.k0 = machine().kit.current; u.click("#kitf"); await sleep(300); c.k = anotherKit(); u.click(ks2(c.k)); }, screen: () => ok(dlgShown(), "no question"), within: 4000 },
			{ say: "press Delete, Backspace, 3 and 1: nothing behind the dialog acts", act: async (u, c) => { c.ws = S().ws; c.u0 = machine().history?.undoCount; for (const k of ["Delete", "Backspace", "3", "1"]) { u.key(k); await sleep(150); } },
				screen: c => ok(dlgShown() && S().ws === c.ws && !$1("#libpop").hidden, `dialog ${dlgShown()}, workspace ${S().ws}`), machine: c => ok(machine().kit.current === c.k0 && machine().history?.undoCount === c.u0, "the page behind acted"), within: 1500 },
			{ say: "press Space: the focused Cancel, nothing loads", act: u => u.key(" "), screen: () => ok(!dlgShown(), "still open"), machine: c => ok(machine().kit.current === c.k0, "machine kit " + machine().kit.current), within: 3000 }
		],
		async tidy(u) { if (dlgShown()) u.key("Escape"); if (!$1("#libpop").hidden) u.key("Escape"); await sleep(200); u.click("#undo"); await sleep(1500); }
	};
	const trackKeys = {
		name: "mm-keys-track-select", proves: ["MM-019"],
		steps: [
			go("seq"), sel(0),
			{ say: "press ↓", act: u => { blur(); u.key("ArrowDown"); }, screen: () => ok(S().sel === 1 && $1("#rail .th.sel")?.dataset.sel === "1", "selected " + S().sel) },
			{ say: "press ↑", act: u => u.key("ArrowUp"), screen: () => ok(S().sel === 0, "selected " + S().sel) }
		]
	};
	const muteKeys = {
		name: "mm-keys-mute", proves: ["MM-020", "MM-235"],
		steps: [
			go("seq"), sel(0),
			{ say: "press M: track 1 is muted", act: (u, c) => { c.m0 = synthMutes(); blur(); u.key("m"); }, machine: () => ok(synthMuted(0), "machine mutes " + synthMutes()), screen: () => ok(pressed('#rail .th[data-sel="0"] .ms.m'), "M not lit") },
			{ say: "press M again", act: u => u.key("m"), machine: c => ok(same(synthMutes(), c.m0), "machine mutes " + synthMutes()) },
			{ say: "press Alt+M: every synth track muted", act: u => u.key("m", { alt: true }), machine: () => ok(synthMutes().length === 6, "machine mutes " + synthMutes()) },
			{ say: "press 0: every track unmuted", act: u => u.key("0"), machine: () => ok(!synthMutes().length && !(machine().mutes?.midi), `machine mutes ${synthMutes()}, MIDI ${machine().mutes?.midi}`) }
		]
	};
	const lockRamp = {
		name: "mm-seq-lock-ramp-erase-wheel", proves: ["MM-081", "MM-083", "MM-200"],
		steps: [
			go("seq"),
			{ say: "pick a track with three notes, the Locks tab", act: async (u, c) => { c.t = [0, 1, 2, 3, 4, 5].find(t => trigsOf(t).filter(s => s < S().len).length >= 3) ?? 0; u.click(rail(c.t)); await sleep(200); if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); await sleep(200); c.lane = S().lane; [c.pg, c.pi] = [PAGES.indexOf(c.lane.split(".")[0]), +c.lane.split(".")[1]]; c.on = trigsOf(c.t).filter(s => s < S().len).slice(0, 3); c.l0 = JSON.stringify(patDoc().locks); },
				machine: c => ok(c.on.length === 3, "notes " + trigsOf(c.t).join(",")), screen: () => ok(!!$1("#lane"), "no lane") },
			{ say: "Shift-drag across the lane: a ramp over the notes", act: async (u, c) => { await u.drag(`#lane .lb[data-s="${c.on[0]}"]`, c.on.slice(1).map(s => `#lane .lb[data-s="${s}"]`), { shift: true }, { fy: 0.8 }); },
				machine: c => { const l = (patDoc().locks || []).find(x => x.track === c.t && x.page === c.pg && x.param === c.pi), v = s => l?.steps.find(([x]) => x === s)?.[1]; return ok(l && c.on.every(s => v(s) != null) && v(c.on[0]) !== v(c.on[2]), "locks " + JSON.stringify(l)); }, within: 15000 },
			{ say: "Alt-drag across them: erased", act: async (u, c) => { await u.drag(`#lane .lb[data-s="${c.on[0]}"]`, c.on.slice(1).map(s => `#lane .lb[data-s="${s}"]`), { alt: true }); },
				machine: c => { const l = (patDoc().locks || []).find(x => x.track === c.t && x.page === c.pg && x.param === c.pi); return ok(!l || c.on.every(s => !l.steps.some(([x]) => x === s)), "locks " + JSON.stringify(l)); }, within: 15000 },
			{ say: "scroll the wheel over a lane step with a note: a lock", act: (u, c) => u.wheel(`#lane .lb[data-s="${c.on[0]}"]`, 2),
				machine: c => { const l = (patDoc().locks || []).find(x => x.track === c.t && x.page === c.pg && x.param === c.pi); return ok(l && l.steps.some(([x]) => x === c.on[0]), "locks " + JSON.stringify(l)); }, within: 15000 }
		],
		async tidy(u, c) { if (c.l0) await undoUntil(u, () => JSON.stringify(patDoc().locks) === c.l0, 5); }
	};
	const pages = {
		name: "mm-seq-pages", proves: ["MM-045", "MM-167"],
		steps: [
			go("seq"),
			{ say: "click ALL off: one page of 16 steps", act: u => { if (S().viewAll) u.click("#pgall"); }, screen: () => ok(!S().viewAll && vis()[1] - vis()[0] === 16, "view " + vis().join("-")) },
			{ say: "click PAGE: the next page (when the pattern is longer than 16)", act: (u, c) => { c.p0 = S().page; if (S().len > 16) u.click("#pgkey"); }, screen: c => ok(S().len <= 16 || S().page === (c.p0 + 1) % (S().len / 16), "page " + S().page) },
			{ say: "press [: back", act: u => { blur(); if (S().len > 16) u.key("["); }, screen: c => ok(S().page === c.p0, "page " + S().page) },
			{ say: "click ALL: every step", act: u => u.click("#pgall"), screen: () => ok(S().viewAll && vis()[1] === S().len, "view " + vis().join("-")) }
		],
		async tidy(u) { if (!S().viewAll) u.click("#pgall"); }
	};
	const copyPaste = {
		name: "mm-seq-copy-paste-clear", proves: ["MM-044", "MM-178", "MM-186"],
		steps: [
			go("seq"),
			{ say: "pick a track with notes and press Cmd+C", act: async (u, c) => { c.a = [0, 1, 2, 3, 4, 5].find(t => trigsOf(t).length) ?? 0; c.b = [0, 1, 2, 3, 4, 5].find(t => t !== c.a && !same(trigsOf(t), trigsOf(c.a))); c.ta = trigsOf(c.a); c.tb = trigsOf(c.b); c.p0 = pat0(); u.click(rail(c.a)); await sleep(200); blur(); u.key("c", { cmd: true }); }, screen: () => ok(/COPY PAGE/.test($1("#toast")?.textContent || ""), "toast " + $1("#toast")?.textContent) },
			{ say: "pick another track and press Cmd+V", act: async (u, c) => { u.click(rail(c.b)); await sleep(200); blur(); u.key("v", { cmd: true }); }, machine: c => ok(same(trigsOf(c.b), c.ta), "track " + (c.b + 1) + " " + trigsOf(c.b).join(",")), within: 15000 },
			/* D3 (DESIGN-keymap.md, K7): Delete takes only selected steps; the LCD's Clr clears the page shown */
			{ say: "press Delete with no step selected: nothing is cleared", act: (u, c) => { if (S().stepSel) clearSel(); blur(); u.key("Delete"); }, machine: c => ok(same(trigsOf(c.b), c.ta), "track " + trigsOf(c.b).join(",")), within: 3000 },
			{ say: "click Clr on the LCD: the page is cleared", act: u => u.click('[data-sec="clear"]'), machine: c => ok(!trigsOf(c.b).length, "track " + trigsOf(c.b).join(",")), within: 15000 },
			{ say: "Cmd+Z twice: as before", act: async (u, c) => { await undoUntil(u, () => same(trigsOf(c.b), c.tb), 3); }, machine: c => ok(same(trigsOf(c.b), c.tb), "track " + trigsOf(c.b).join(",")), within: 15000 }
		]
	};
	const clearAll = {
		name: "mm-seq-clear-pattern-undo", proves: ["MM-190"],
		steps: [
			go("seq"),
			{ say: "press Alt+Delete: the whole pattern is cleared", act: (u, c) => { c.all = [0, 1, 2, 3, 4, 5].map(trigsOf); blur(); u.key("Delete", { alt: true }); }, machine: () => ok([0, 1, 2, 3, 4, 5].every(t => !trigsOf(t).length), "notes left"), within: 15000 },
			{ ...undoKey, act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(same([0, 1, 2, 3, 4, 5].map(trigsOf), c.all), "pattern differs"), within: 15000 }
		]
	};
	const fill = {
		name: "mm-seq-fill-every", proves: [],
		steps: [
			go("seq"), sel(0),
			{ say: "right-click an empty roll cell near the end, choose Fill every 2nd from here: every 2nd step gets a note", act: async (u, c) => { c.t0 = trigsOf(0); c.s = [...Array(S().len).keys()].find(s => s >= S().len - 8 && !c.t0.includes(s) && !S().tracks[0].steps[s]);
				if (S().stepSel) clearSel(); const p = rollCell(0, c.s); u.rightClick(p.c, {}, p.fx, p.fy); await sleep(150); u.click('#deskmenu [data-mid="step-fill-2"]'); },
				machine: c => { const want = []; for (let s = c.s; s < S().len; s += 2) if (!S().tracks[0].steps[s]?.off) want.push(s); return ok(want.every(s => trigsOf(0).includes(s)), "notes " + trigsOf(0).join(",")); }, within: 15000 },
			{ ...undoKey, act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(same(trigsOf(0), c.t0), "notes " + trigsOf(0).join(",")), within: 15000 }
		],
		/* the right-click selected the step (the Machinedrum's md-seq-fill-every clears it too) */
		async tidy() { if (S().stepSel) clearSel(); }
	};
	const rotate = {
		name: "mm-seq-rotate", proves: ["MM-177"],
		steps: [
			go("seq"),
			{ say: "pick a track with notes", act: (u, c) => { c.t = [0, 1, 2, 3, 4, 5].find(t => trigsOf(t).length) ?? 0; c.t0 = trigsOf(c.t); u.click(rail(c.t)); }, screen: c => ok(S().sel === c.t, "selected " + S().sel) },
			{ say: "press Alt+→: one step later", act: u => { blur(); u.key("ArrowRight", { alt: true }); }, machine: c => { const L = S().len; return ok(same(trigsOf(c.t), c.t0.map(s => s >= L ? s : (s + 1) % L).sort((a, b) => a - b)), "notes " + trigsOf(c.t).join(",")); }, within: 15000 },
			{ say: "press Alt+←: back", act: u => u.key("ArrowLeft", { alt: true }), machine: c => ok(same(trigsOf(c.t), c.t0), "notes " + trigsOf(c.t).join(",")), within: 15000 }
		]
	};
	/* 0.5.1, decision A (as the Machinedrum): copied steps (a selection) pasted with no step selected, or into marked
	   tracks, put down only the copied steps; the rest of the page stays. The block: the page's first four steps. */
	const blk = () => { const a = vis()[0]; return { a, b: Math.min(a + 4, S().len), end: Math.min(vis()[1], S().len) }; };
	const inBlk = (s, k) => s >= k.a && s < k.b;
	const blockOf = (t, k) => trigsOf(t).filter(s => inBlk(s, k)).map(s => s - k.a);
	const restOf = (t, k) => trigsOf(t).filter(s => !inBlk(s, k));
	/* a synth track with a note in the block, and the others with a note on the page past it (the ones a page paste
	   would clear) first */
	function pickBlock(c, n) {
		const k = c.k = blk(), syn = [0, 1, 2, 3, 4, 5];
		c.a = syn.find(t => blockOf(t, k).length) ?? 0;
		c.src = blockOf(c.a, k);
		/* first the tracks with notes past the block whose block differs from the copied one */
		const score = t => (trigsOf(t).some(s => s >= k.b && s < k.end) ? 2 : 0) + (same(blockOf(t, k), c.src) ? 0 : 1);
		c.bs = syn.filter(t => t !== c.a).sort((x, y) => score(y) - score(x) || x - y).slice(0, n); c.b0 = c.bs.map(trigsOf); c.rest0 = c.bs.map(t => restOf(t, k));
		c.note = `T${c.a + 1} steps ${k.a + 1}-${k.b} (${c.src.map(s => s + 1).join(",") || "no notes"}) onto ${c.bs.map(t => "T" + (t + 1) + " (" + (c.rest0[c.bs.indexOf(t)].filter(s => s >= k.b && s < k.end).length) + " later notes on the page)").join(" ")}`;
	}
	const copyBlock = { say: "pick a synth track with notes, Cmd-drag over the page's first four steps in the roll, press Cmd+C, then Escape: copied, nothing selected",
		act: async (u, c) => { if (S().side === "midi") u.click('[data-side="int"]'); u.click(rail(c.a)); await sleep(300); if (S().stepSel) clearSel();
			await dragRoll(u, c.a, [c.k.a, c.k.a + 2, c.k.b - 1], { cmd: true }); await sleep(200); c.sel = JSON.stringify(S().stepSel); blur(); u.key("c", { cmd: true }); await sleep(300); u.key("Escape"); },
		screen: c => ok(c.sel === JSON.stringify({ t: c.a, n: 1, from: c.k.a, to: c.k.b }) && !S().stepSel, "selection was " + c.sel + ", now " + JSON.stringify(S().stepSel)) };
	/* the pastes taken (their results: the core's documents hold them), then each target: the copied block, the rest kept */
	const pasted = c => results.filter(r => r.op === "pasteSteps" && r.ok).length >= c.bs.length;
	const keptAll = c => pasted(c) && c.bs.every((t, i) => same(blockOf(t, c.k), c.src) && same(restOf(t, c.k), c.rest0[i]));
	const sayAll = c => c.bs.map(t => `T${t + 1} ${trigsOf(t).join(",")}`).join("; ");
	const pasteKeeps = {
		name: "mm-seq-paste-steps-keeps-page", proves: ["MM-183"],
		steps: [
			go("seq"),
			{ say: "choose the tracks", act: (u, c) => { if (S().len < 8) throw new Error("the pattern is shorter than 8 steps"); pickBlock(c, 1); }, screen: c => ok(c.bs.length === 1, "no other track") },
			copyBlock,
			{ say: "pick the other track and press Cmd+V: the four copied steps on its page's first four, the rest of its page as before", act: async (u, c) => { u.click(rail(c.bs[0])); await sleep(300); results.length = 0; blur(); u.key("v", { cmd: true }); },
				machine: c => ok(keptAll(c), sayAll(c) + (pasted(c) ? "" : "; no pasteSteps result yet") + " (before " + c.b0.map(x => x.join(",")).join("; ") + ")"), within: 15000 },
			{ ...undoKey, say: "press Cmd+Z: as before", act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(same(trigsOf(c.bs[0]), c.b0[0]), sayAll(c)), within: 15000 }
		],
		async tidy(u, c) { if (S().stepSel) clearSel(); if (c.bs) await undoUntil(u, () => c.bs.every((t, k) => same(trigsOf(t), c.b0[k])), 3); }
	};
	const pasteMany = {
		name: "mm-seq-paste-many", proves: ["MM-044"],
		steps: [
			go("seq"),
			{ say: "choose the tracks", act: (u, c) => { if (S().len < 8) throw new Error("the pattern is shorter than 8 steps"); pickBlock(c, 2); }, screen: c => ok(c.bs.length === 2, "no two other tracks") },
			copyBlock,
			{ say: "Shift-click two other headers: marked", act: async (u, c) => { for (const t of c.bs) { u.click(rail(t), { shift: true }); await sleep(150); } }, screen: c => ok(c.bs.every(t => $1(`#rail .th[data-sel="${t}"]`)?.classList.contains("marked")), "not marked") },
			{ say: "press Cmd+V: both get the four copied steps, the rest of their pages as before", act: u => { results.length = 0; blur(); u.key("v", { cmd: true }); }, machine: c => ok(keptAll(c), sayAll(c) + (pasted(c) ? "" : "; no pasteSteps result yet")), within: 20000 },
			{ ...undoKey, say: "press Cmd+Z once: both are back", act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(c.bs.every((t, k) => same(trigsOf(t), c.b0[k])), sayAll(c)), within: 20000 }
		],
		async tidy(u, c) { if (S().marks?.size) u.key("Escape"); if (S().stepSel) clearSel(); if (c.bs) await undoUntil(u, () => c.bs.every((t, k) => same(trigsOf(t), c.b0[k])), 3); }
	};
	const liveRec = {
		name: "mm-seq-live-record", proves: ["MM-042", "MM-079", "MM-179"],
		steps: [
			go("seq"), sel(0),
			{ say: "press Alt+Space: live recording, playing (pressed again when the plug-in says the panel is busy: an earlier journey's dumps on their way, as mm-seq-grid-record)", act: async (u, c) => { c.n0 = trigsOf(0).length; c.p0 = pat0(); blur(); results.length = 0; u.key(" ", { alt: true }, "Space");
				for (let i = 0; i < 5 && await until(() => results.some(r => r.op === "record" && r.ok === false), 1500); i++) { c.note = "the plug-in said the panel was busy (SYSEX RECV); pressed again"; results.length = 0; await sleep(1500); blur(); u.key(" ", { alt: true }, "Space"); }
				/* RECORD held + PLAY: the machine plays by itself. No PLAY of the journey's own: pressed while the chord
				   still waited for a busy panel (an earlier journey's dumps) it reached the machine around the chord and
				   left it playing with RECORD off (the 0.5.0 gate) */ },
				machine: () => ok(tele.last?.record === "live" && tele.last?.playing, `record ${tele.last?.record}, playing ${tele.last?.playing}`), within: 8000 },
			{ say: "play A, S, D on the keyboard while it records: the machine records notes", act: async u => { for (const k of ["a", "s", "d"]) { u.key(k); await sleep(450); } },
				machine: c => ok(pat0() !== c.p0, "pattern unchanged (" + c.n0 + " notes)"), within: 15000 },
			{ say: "click RECORD off, then STOP", act: async u => { u.click("#rec"); await sleep(600); if (S().playing) u.click("#play"); }, machine: () => ok(tele.last?.record === "off" && !tele.last?.playing, `record ${tele.last?.record}`), within: 8000 }
		],
		async tidy(u, c) { if (tele.last?.record && tele.last.record !== "off") u.click("#rec"); if (S().playing) u.click("#play"); await sleep(800); if (c.p0) await undoUntil(u, () => pat0() === c.p0, 3); }
	};
	/* wave 7 (manual 1-49, 1-50, doc/modern-ux/DESIGN-machine-menus.md §2). A held key is a keydown now and its keyup later
	   (u.key presses and lets go at once). */
	const keyEv = (type, key) => (document.activeElement && document.activeElement !== document.documentElement ? document.activeElement : document.body)
		.dispatchEvent(new KeyboardEvent(type, { key, code: key, bubbles: true, cancelable: true, composed: true }));
	const resultsSay = () => results.map(r => r.op + ":" + r.ok + (r.errors ? " " + r.errors.join(";") : "")).join(", ");
	const liveErase = {
		name: "mm-seq-live-erase", proves: ["MM-080", "MM-181"],
		steps: [
			go("seq"),
			{ say: "pick the synth track with the most notes", act: (u, c) => { c.t = [0, 1, 2, 3, 4, 5].sort((a, b) => trigsOf(b).length - trigsOf(a).length)[0]; c.p0 = trigsOf(c.t); c.others = [0, 1, 2, 3, 4, 5].filter(t => t !== c.t).map(trigsOf); u.click(rail(c.t)); },
				screen: c => ok(S().sel === c.t, "selected " + S().sel), machine: c => ok(c.p0.length > 0, "no notes on T" + (c.t + 1)) },
			{ say: "press Alt+Space: live recording, playing", act: u => { blur(); results.length = 0; u.key(" ", { alt: true }, "Space"); },
				machine: () => ok(tele.last?.record === "live" && tele.last?.playing, `record ${tele.last?.record}, playing ${tele.last?.playing}; ${resultsSay()}`), within: 8000 },
			{ say: "hold Delete: the selected track's notes go as they play", act: () => { results.length = 0; blur(); keyEv("keydown", "Delete"); },
				screen: () => ok(document.body.classList.contains("erasing"), "not marked as erasing"),
				machine: c => ok(trigsOf(c.t).length < c.p0.length, `${c.p0.length} -> ${trigsOf(c.t).length} notes; ${resultsSay()}`), within: 10000 },
			{ say: "let Delete go, click RECORD off, then STOP: the other tracks kept their notes", act: async u => { keyEv("keyup", "Delete"); await sleep(300); u.click("#rec"); await sleep(600); if (S().playing) u.click("#play"); },
				screen: () => ok(!document.body.classList.contains("erasing"), "still marked"),
				machine: c => ok(tele.last?.record === "off" && !tele.last?.playing && [0, 1, 2, 3, 4, 5].filter(t => t !== c.t).map(trigsOf).every((a, k) => same(a, c.others[k])), `record ${tele.last?.record}, playing ${tele.last?.playing}`), within: 8000 }
		],
		async tidy(u) { keyEv("keyup", "Delete"); if (tele.last?.record && tele.last.record !== "off") u.click("#rec"); await sleep(400); if (S().playing) u.click("#play"); }
	};
	const stepAt = () => tele.last?.stepAt;
	const stepRec = {
		name: "mm-seq-step-record", proves: ["MM-043", "MM-182"],
		steps: [
			go("seq"),
			{ say: "pick a synth track whose first step is empty", act: (u, c) => { c.t = [0, 1, 2, 3, 4, 5].find(t => !trigsOf(t).includes(0)) ?? 0; c.p0 = trigsOf(c.t); u.click(rail(c.t)); }, screen: c => ok(S().sel === c.t, "selected " + S().sel),
				machine: c => ok(!c.p0.includes(0), "every track has a note on step 1") },
			{ say: "Cmd-drag over steps 5 to 7 of the roll: a step selection", act: async (u, c) => { if (S().stepSel) clearSel(); await dragRoll(u, c.t, [4, 6], { cmd: true }); }, screen: () => ok(!!S().stepSel, "nothing selected") },
			{ say: "Shift-click RECORD (stopped): step recording, the cursor on step 1, the selection dropped, no new row above the roll", act: async (u, c) => { c.top = $1("#seqscroll")?.getBoundingClientRect().top; if (S().playing) u.click("#play");
				/* the selection's drag may still be on its way through SYSEX RECV on a busy Mac: once it is in */
				await recvIdle(); results.length = 0; u.click("#rec", { shift: true });
				/* refused while the panel still takes an earlier dump on SYSEX RECV (the keys would be lost: "The panel is busy");
				   clicked again then, as clickMidiMute and mm-seq-first-beat's PLAY (B-014) */
				for (let i = 0; i < 5 && await until(() => results.some(r => r.op === "record" && r.ok === false && /busy/.test(r.errors?.[0] || "")), 1500); i++) {
					c.note = "the plug-in said the panel was busy (SYSEX RECV); clicked again"; results.length = 0; await sleep(1500); u.click("#rec", { shift: true }); } },
				machine: () => ok(tele.last?.record === "step" && stepAt() === 0, `record ${tele.last?.record}, cursor ${stepAt()}; ${resultsSay()}`),
				screen: c => ok(S().recMode === "step" && !S().stepSel && !!$1(".stepcur") && $1("#rec").classList.contains("step") && $1("#seqscroll")?.getBoundingClientRect().top === c.top,
					`step ${S().recMode}, selection ${JSON.stringify(S().stepSel)}, cursor ${!!$1(".stepcur")}, roll top ${c.top} -> ${$1("#seqscroll")?.getBoundingClientRect().top}`), within: 8000 },
			{ say: "press A: the note is written to step 1, the cursor moves on", act: u => { blur(); results.length = 0; u.key("a"); },
				machine: c => ok(trigsOf(c.t).includes(0) && stepAt() === 1, `notes ${trigsOf(c.t).join(",")}, cursor ${stepAt()}; ${resultsSay()}`), within: 8000 },
			{ say: "press →: a rest, the cursor on step 3", act: u => u.key("ArrowRight"), machine: c => ok(stepAt() === 2 && !trigsOf(c.t).includes(1), `cursor ${stepAt()}`), within: 5000 },
			{ say: "press ← twice: back on step 1", act: async u => { u.key("ArrowLeft"); await until(() => stepAt() === 1, 3000); u.key("ArrowLeft"); },
				machine: () => ok(stepAt() === 0, `cursor ${stepAt()}`), screen: () => ok(/STEP 01$/.test($1(".stepcur")?.dataset.l || ""), "cursor shows " + $1(".stepcur")?.dataset.l), within: 6000 },
			{ say: "press Delete: step 1 is cleared, the cursor moves on", act: u => u.key("Delete"), machine: c => ok(same(trigsOf(c.t), c.p0) && stepAt() === 1, `notes ${trigsOf(c.t).join(",")}, cursor ${stepAt()}`), within: 8000 },
			{ say: "Cmd-drag over steps 5 to 7 while it records, then press ←: the cursor goes back, the selection stays", act: async (u, c) => { await dragRoll(u, c.t, [4, 6], { cmd: true }); c.sel = JSON.stringify(S().stepSel); blur(); u.key("ArrowLeft"); },
				machine: () => ok(stepAt() === 0, `cursor ${stepAt()}`), screen: c => ok(!!S().stepSel && JSON.stringify(S().stepSel) === c.sel, `selection ${c.sel} -> ${JSON.stringify(S().stepSel)}`), within: 6000 },
			{ say: "press Esc: done (not the selection's Esc)", act: u => u.key("Escape"), machine: () => ok(tele.last?.record === "off", "record " + tele.last?.record),
				screen: () => ok(S().recMode !== "step" && !$1(".stepcur") && !$1("#rec").classList.contains("step"), "cursor or STEP left"), within: 6000 }
		],
		async tidy(u) { if (tele.last?.record === "step") u.key("Escape"); if (S().stepSel) clearSel(); }
	};
	const genKeys = {
		name: "mm-gen-keys-r", proves: [],
		steps: [
			go("seq"), sel(0),
			{ say: "press R until the notes change", act: async (u, c) => { c.p0 = pat0(); blur(); for (let i = 0; i < 5; i++) { u.key("r"); if (await until(() => pat0() !== c.p0, 4000)) break; } }, machine: c => ok(pat0() !== c.p0, "unchanged"), within: 15000 },
			/* one up, or one down (Shift-click) when R rolled it to its top: Hits stops at Steps, Density at 100 (the page
			   tier's one failure in the dev-cycle gate run) */
			{ say: "click GEN's Hits value (a Euclid spec) or Density (Shift-click when it is at its top)", act: (u, c) => { c.p1 = pat0();
				const num = q => parseInt($1(q)?.getAttribute("aria-valuenow") || "0", 10), euclid = !!$1('#genband .gv[data-gv="k"]');
				const q = euclid ? '#genband .gv[data-gv="k"]' : '#genband .gv[data-gv="dens"]', top = euclid ? num('#genband .gv[data-gv="n"]') : 100;
				u.click(q, { shift: num(q) >= top }); }, machine: c => ok(pat0() !== c.p1, "unchanged"), within: 15000 },
			{ ...undoKey, say: "press Cmd+Z: the whole run in one step", act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(pat0() === c.p0, "pattern not back"), within: 15000 }
		],
		async tidy(u, c) { if (c.p0) await undoUntil(u, () => pat0() === c.p0, 3); }
	};
	const mutScope = {
		name: "mm-gen-mutate-scope", proves: [],
		steps: [
			go("sound"), sel(0),
			{ say: "click MUTATE's Flt chip on and Syn off", act: async (u, c) => { c.scope0 = [...S().mut.scope]; c.amt0 = S().mut.amount; if (!S().mut.scope.has("FLT")) u.click('#mutband [data-mutg="FLT"]'); await sleep(100); if (S().mut.scope.has("SYN")) u.click('#mutband [data-mutg="SYN"]'); await sleep(100); },
				screen: () => ok(pressed('#mutband [data-mutg="FLT"]') && !pressed('#mutband [data-mutg="SYN"]'), "chips " + [...S().mut.scope].join(",")) },
			{ say: "click the Amount value: one more", act: u => u.click('#mutband .gv[data-gv="amt"]'), screen: c => ok($1('#mutband .gv[data-gv="amt"] b')?.textContent === (c.amt0 + 1) + "%", "shows " + $1('#mutband .gv[data-gv="amt"] b')?.textContent) },
			{ say: "click MUTATE's Random key: only the filter page moves", act: (u, c) => { c.k0 = JSON.stringify(wk().tracks[0].pages); u.click("#mutband [data-rand]"); },
				machine: c => { const a = JSON.parse(c.k0), b = wk().tracks[0].pages, moved = b.map((pg, i) => JSON.stringify(pg) !== JSON.stringify(a[i]) ? PAGES[i] || "MID" : null).filter(Boolean); return ok(same(moved, ["FLT"]), "pages moved: " + (moved.join(",") || "none")); }, within: 15000 },
			{ ...undoKey, act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(JSON.stringify(wk().tracks[0].pages) === c.k0, "kit not back"), within: 15000 }
		],
		async tidy(u, c) { if (!c.scope0) return; for (const g of ["SYN", "AMP", "FLT", "EFX", "LFO"]) if (S().mut.scope.has(g) !== c.scope0.includes(g)) { u.click(`#mutband [data-mutg="${g}"]`); await sleep(80); } if (S().mut.amount !== c.amt0) u.click('#mutband .gv[data-gv="amt"]', { shift: true }); }
	};
	const valueKeys = {
		name: "mm-sound-value-keys", proves: ["MM-015"],
		steps: [
			go("sound"), sel(0),
			{ say: "focus a filter value and press ↑ three times", act: async (u, c) => { const el = $1('#main .pc[data-g="FLT"]'); c.i = +el.dataset.n; c.v0 = wk().tracks[0].pages[2][c.i]; el.focus(); const d = c.v0 > 120 ? "ArrowDown" : "ArrowUp"; c.want = c.v0 + (d === "ArrowUp" ? 3 : -3); for (let k = 0; k < 3; k++) { u.key(d); await sleep(150); } },
				machine: c => ok(wk().tracks[0].pages[2][c.i] === c.want, `kit ${wk().tracks[0].pages[2][c.i]}, want ${c.want} (from ${c.v0}); selected ${S().sel + 1}; focus ${document.activeElement?.className || document.activeElement?.tagName}`), within: 10000 },
			{ say: "click Undo until it is back", act: async (u, c) => { for (let k = 0; k < 3 && wk().tracks[0].pages[2][c.i] !== c.v0; k++) { u.click("#undo"); await sleep(1500); } }, machine: c => ok(wk().tracks[0].pages[2][c.i] === c.v0, "kit " + wk().tracks[0].pages[2][c.i]), within: 10000 }
		]
	};
	const soundCopy = {
		name: "mm-sound-copy-paste", proves: ["MM-107"],
		steps: [
			go("sound"),
			{ say: "pick track 1 and press Cmd+C", act: async (u, c) => { c.b = [1, 2, 3, 4, 5].find(t => wk().tracks[t].machine !== wk().tracks[0].machine) ?? 1; c.kb = kitT(c.b); u.click(rail(0)); await sleep(200); blur(); u.key("c", { cmd: true }); }, screen: () => ok(/COPY MACHINE/.test($1("#toast")?.textContent || ""), "toast " + $1("#toast")?.textContent) },
			{ say: "pick another track and press Cmd+V", act: async (u, c) => { u.click(rail(c.b)); await sleep(200); blur(); u.key("v", { cmd: true }); }, machine: c => ok(wk().tracks[c.b].machine === wk().tracks[0].machine && same(wk().tracks[c.b].pages.slice(0, 7), wk().tracks[0].pages.slice(0, 7)), `track ${c.b + 1} machine ${wk().tracks[c.b].machine}`), within: 15000 },
			{ ...undoKey, act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(kitT(c.b) === c.kb, "track not back"), within: 15000 }
		]
	};
	const screenDrag = {
		name: "mm-sound-screen-drag", proves: [],
		steps: [
			go("sound"), sel(0),
			{ say: "drag a handle of a Sound screen", act: async (u, c) => { const cv = $all("#main canvas.ed").find(x => ED[x.dataset.ed]?.handles); if (!cv) throw new Error("no screen"); c.k0 = kitT(0); const r = cv.getBoundingClientRect(), h = ED[cv.dataset.ed].handles(r.width, r.height, cv)[0]; c.note = cv.dataset.ed + " " + h.k; await u.drag(cv, [[10, 0], [20, -6], [30, -10]], {}, { fx: h.x / r.width, fy: Math.min(Math.max(h.y, 6), r.height - 6) / r.height }); },
				machine: c => ok(kitT(0) !== c.k0, "kit unchanged"), within: 15000 },
			{ ...undoKey, act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(kitT(0) === c.k0, "kit not back"), within: 15000 }
		]
	};
	const dragM = {
		name: "mm-mix-drag-m-keys", proves: ["MM-020"],
		steps: [
			go("mix"),
			{ say: "drag across the M keys of tracks 1 to 3", act: async (u, c) => { c.m0 = synthMutes(); if ([0, 1, 2].some(synthMuted)) throw new Error("tracks 1-3 not all audible"); await u.drag(strip(0, ".ms.m"), [strip(1, ".ms.m"), strip(2, ".ms.m")], {}, { captured: false }); },
				machine: () => ok([0, 1, 2].every(synthMuted), "machine mutes " + synthMutes()), screen: () => ok([0, 1, 2].every(i => pressed(strip(i, ".ms.m"))), "M keys not lit") },
			{ say: "click M/S off on the Sequence rail", act: async u => { u.click(tab("seq")); await sleep(300); u.click("#allon"); }, machine: c => ok(same(synthMutes(), c.m0), "machine mutes " + synthMutes()) }
		]
	};
	/* a MIDI track's mute is the MUTE window's keys: refused while the panel takes an earlier journey's dumps on SYSEX
	   RECV ("The panel is busy"); clicked again then, as mm-seq-first-beat's PLAY (B-014) */
	const clickMidiMute = async (u, c) => { results.length = 0; u.click('[data-gmute="6"]');
		for (let i = 0; i < 5 && await until(() => results.some(r => r.op === "muteMidi" && r.ok === false && /busy/.test(r.errors?.[0] || "")), 1500); i++) {
			c.note = "the plug-in said the panel was busy (SYSEX RECV); clicked again"; results.length = 0; await sleep(1500); u.click('[data-gmute="6"]'); } };
	const midiMutes = {
		name: "mm-perform-midi-mutes", proves: ["MM-235", "MM-241"],
		steps: [
			go("perform"),
			{ say: "click M1 in the Mutes card: MIDI track 1 is muted (the MUTE window; clicked again when the plug-in says the panel is busy)", act: async (u, c) => { c.m0 = machine().mutes?.midi ?? 0; await clickMidiMute(u, c); }, machine: c => ok(((machine().mutes?.midi ?? 0) & 1) !== (c.m0 & 1), "MIDI mutes " + machine().mutes?.midi), screen: c => ok(pressed('[data-gmute="6"]') === !!(c.m0 & 1), "key " + $1('[data-gmute="6"]')?.getAttribute("aria-pressed")), within: 10000 },
			{ say: "click it again", act: clickMidiMute, machine: c => ok(((machine().mutes?.midi ?? 0) & 1) === (c.m0 & 1), "MIDI mutes " + machine().mutes?.midi), within: 10000 }
		]
	};
	const joyAssign = {
		name: "mm-perform-joystick-assign", proves: ["MM-049", "MM-145"],
		steps: [
			go("perform"),
			{ say: "drag the joystick and let go: the moves go to the machine, the stick springs back", act: async (u, c) => { sent.length = 0; if (!$1("#joy")) { const b = $all('[data-set="astab"] button').find(x => x.dataset.v.startsWith("JOY")); if (b) u.click(b); await sleep(200); } await u.drag("#joy", [[10, -10], [25, -20], [40, -30]]); },
				machine: () => ok(sent.filter(x => x === "midi").length >= 2, "sent " + sent.join(",")), screen: () => ok($1("#knobj")?.style.left === "50%", "stick at " + $1("#knobj")?.style.left) },
			{ say: "drag the first assign row's ADD", act: async (u, c) => { c.a0 = JSON.stringify(wk().tracks.map(t => t.assign)); const el = $1('#main .pc[data-g="asg"]'); c.txt0 = el.querySelector("b")?.textContent; c.tab = S().asTab; sent.length = 0; results.length = 0; const d = parseInt(c.txt0) > 0 ? -1 : 1; await u.drag(el, [[d * 6, 0], [d * 12, 0], [d * 18, 0], [d * 24, 0]]); c.txt1 = $1('#main .pc[data-g="asg"] b')?.textContent; },
				screen: c => ok(c.txt1 !== c.txt0, `ADD shows ${c.txt0} -> ${c.txt1}`),
				machine: c => ok(JSON.stringify(wk().tracks.map(t => t.assign)) !== c.a0, `assign unchanged (tab ${c.tab}, track ${S().sel + 1}); sent ${sent.join(",")}; results ${results.map(r => r.op + ":" + r.ok + (r.errors ? " " + r.errors.join(";") : "")).join(", ")}; track 1 assign ${JSON.stringify(wk().tracks[0].assign)}`), within: 15000 },
			{ ...undoKey, act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(JSON.stringify(wk().tracks.map(t => t.assign)) === c.a0, "assign not back"), within: 15000 }
		]
	};
	const menvPort = {
		name: "mm-perform-menv-portamento", proves: ["MM-160", "MM-152"],
		steps: [
			go("perform"),
			{ say: "drag the multi envelope's ATK", act: async (u, c) => { c.e0 = JSON.stringify(wk().tracks.map(t => t.multiEnv)); const q = '#main .pc[data-g="menv"][data-n="ATK"]', d = parseInt($1(q + " b")?.textContent) > 64 ? -1 : 1; await u.drag(q, [[d * 6, 0], [d * 12, 0], [d * 18, 0], [d * 24, 0]]); }, machine: c => ok(JSON.stringify(wk().tracks.map(t => t.multiEnv)) !== c.e0, "multi env unchanged"), within: 15000 },
			{ ...undoKey, act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(JSON.stringify(wk().tracks.map(t => t.multiEnv)) === c.e0, "multi env not back"), within: 15000 },
			{ say: "on Sequence's Trig setup, click the other PORT mode", act: async (u, c) => { u.click(tab("seq")); await sleep(200); u.click(rail(0)); await sleep(200); u.click('[data-dock="trig"]'); await sleep(300); c.p0 = wk().trackMasks?.portamento ?? 0; const b = $all('[data-set="port"] button').find(x => x.getAttribute("aria-pressed") !== "true"); u.click(b); },
				machine: c => ok(((wk().trackMasks?.portamento ?? 0) & 1) !== (c.p0 & 1), "portamento mask " + wk().trackMasks?.portamento), within: 15000 },
			{ ...undoKey, act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(((wk().trackMasks?.portamento ?? 0) & 1) === (c.p0 & 1), "portamento mask " + wk().trackMasks?.portamento), within: 15000 }
		],
		async tidy(u) { if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); }
	};
	/* ---------- 0.6 wave 9 (B-064): Perform, see and set up POLY, the filter's key tracking and the MULTI ENV ----------
	   The sound itself is proven on the firmware through the same commands: mmDeskFirmwareTest perform (ctest
	   mmPerformSoundFirmwareTest: six notes sound as a chord on the POLY track and the others are silent, KEY off fixes
	   the filter, the MULTI ENV shapes MULTI TRIG notes and silences the machine after one; PROBES-manual-gaps.md P10). */
	const lastPoly = () => polySent[polySent.length - 1] || {};
	/* a kit field with no live message goes as a dump through SYSEX RECV: the journey after this one finds the panel free */
	const recvIdle = async () => { const recv = () => I().machine?.recv || {}; await until(() => recv().state === "idle" && !recv().sending, 20000); };
	const astrk = t => `[data-set="astrk"] button[data-v="${t}"]`;
	const polyTrack = {
		name: "mm-perform-poly-track", proves: ["MM-032", "MM-087", "MM-239"],
		steps: [
			go("perform"),
			{ say: "click Assign's track key 3, then POLY: the machine's POLY is on, on track 3 (its TRACK key)", act: async (u, c) => { polySent.length = 0; u.click(astrk(2)); await sleep(300); await recvIdle(); results.length = 0; u.click('[data-pmode="poly"]');
				/* refused while the panel takes an earlier journey's dump (TRACK would be lost): the page stays off POLY and says so; clicked again */
				for (let i = 0; i < 5 && await until(() => results.some(r => r.op === "poly" && r.ok === false && /busy/.test(r.errors?.[0] || "")), 1500); i++) {
					c.note = "the plug-in said the panel was busy (SYSEX RECV); clicked again"; results.length = 0; await recvIdle(); if (S().mode === "poly") u.click('[data-pmode="normal"]'); await sleep(300); u.click('[data-pmode="poly"]'); } },
				screen: () => ok(/^POLY: T3 plays six voices/.test($1(".kbhint")?.textContent || "") && !!$1(astrk(2) + " .x6") && $all('[data-set="astrk"] button.polyoff').length === 5, "hint " + $1(".kbhint")?.textContent),
				machine: () => ok(machine().poly === true && lastPoly().on === true && lastPoly().t === 2, `poly ${machine().poly}, sent ${JSON.stringify(lastPoly())}`), within: 8000 },
			{ say: "look at the Perform page in POLY", act: async () => { await sleep(300); Journey.snapshot("mm-perform-poly"); } },
			{ say: "click track key 5: POLY moves to track 5", act: async u => { await recvIdle(); u.click(astrk(4)); },
				screen: () => ok(/^POLY: T5 plays six voices/.test($1(".kbhint")?.textContent || "") && !!$1(astrk(4) + " .x6"), "hint " + $1(".kbhint")?.textContent),
				machine: () => ok(machine().poly === true && lastPoly().t === 4, `poly ${machine().poly}, sent ${JSON.stringify(lastPoly())}`), within: 8000 },
			{ say: "on Sequence the rail marks track 5 ×6 and dims the others", act: u => u.click(tab("seq")),
				screen: () => ok(!!$1('#rail .th[data-sel="4"] .x6') && $all("#rail .th.poly-off").length === 5, "rail " + $all("#rail .th.poly-off").length + " dimmed") },
			{ say: "click MIDI and pick M2 on the rail: POLY stays on track 5 (a MIDI track has no voices)", act: async (u, c) => { c.n = polySent.length; u.click('[data-side="midi"]'); await sleep(200); u.click(rail(7)); await sleep(600); },
				screen: () => ok(S().sel === 7, "selected " + S().sel), machine: c => ok(polySent.length === c.n && machine().focus === 4, `poly sent ${JSON.stringify(polySent.slice(c.n))}, focus ${machine().focus}`) },
			{ say: "back on the synth tracks, the machine's TRACK 2 is pressed (here: its command, not the page's): the page follows, track 2 is POLY's and selected", act: async u => { u.click('[data-side="int"]'); await sleep(200); u.click(rail(4)); await sleep(300); Bridge.send({ op: "poly", on: true, t: 1 }); },
				screen: () => ok(S().sel === 1 && S().polyT === 1 && !!$1('#rail .th[data-sel="1"] .x6'), `selected ${S().sel}, POLY track ${S().polyT}`), machine: () => ok(machine().focus === 1, "focus " + machine().focus), within: 8000 },
			{ say: "back on Perform, click Auto track: POLY off", act: async u => { u.click(tab("perform")); await sleep(300); u.click('[data-pmode="normal"]'); },
				screen: () => ok(!$1("#main .x6") && !$all("#main .polyoff").length, "marks left: " + $all("#main .x6, #main .polyoff").length), machine: () => ok(machine().poly === false, "poly " + machine().poly), within: 8000 }
		],
		async tidy(u) { if (S().mode === "poly" && $1('[data-pmode="normal"]')) u.click('[data-pmode="normal"]'); }
	};
	const lpfOf = t => ((wk()?.trackMasks?.lpf ?? 0x3f) >> t & 1) === 1;
	const keyLamps = () => [...$all('[data-sg="FLT:filter"] .keytrk .led')].map(l => l.classList.contains("on"));
	const keyTracking = {
		name: "mm-sound-key-tracking", proves: ["MM-128", "MM-149"],
		steps: [
			go("sound"), sel(0),
			{ say: "the Filter group's KEY shows the track's key tracking, HPF and LPF", screen: () => { const l = keyLamps(), m = wk()?.trackMasks; return ok(l.length === 2 && l[0] === ((m?.hpf ?? 0x3f) & 1) > 0 && l[1] === lpfOf(0), "lamps " + l + ", masks " + JSON.stringify(m)); } },
			{ say: "click KEY: Perform › Assign › KEY opens for track 1", act: u => u.click('[data-sg="FLT:filter"] .keytrk'),
				screen: () => ok(S().ws === "perform" && S().asTab === "KEY" && pressed(astrk(0)) && !!$1('[data-ktrk="lpf"]'), `workspace ${S().ws}, tab ${S().asTab}`) },
			{ say: "click LPF tracks keys: track 1's low-pass stops following the note", act: (u, c) => { c.l0 = lpfOf(0); u.click('[data-ktrk="lpf"]'); },
				machine: c => ok(lpfOf(0) !== c.l0, "LPF mask " + wk()?.trackMasks?.lpf), within: 15000 },
			{ say: "on Sound the Filter's KEY shows LPF off", act: async u => { u.click(tab("sound")); await sleep(400); Journey.snapshot("mm-sound-key-tracking"); },
				screen: c => ok(keyLamps()[1] === !c.l0, "lamps " + keyLamps()) },
			{ ...undoKey, act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(lpfOf(0) === c.l0, "LPF mask " + wk()?.trackMasks?.lpf), within: 15000 }
		],
		async tidy() { await recvIdle(); }
	};
	const MTM_N = ["ALL TRK", "SPLIT KEY", "SEQ START", "SEQ TRNSP"];
	const menvModes = {
		name: "mm-perform-menv-modes", proves: ["MM-160", "MM-018"],
		steps: [
			go("perform"),
			{ say: "with the keys on Auto track, the Multi envelope card names the kit's MULTI TRIG mode and says to choose Multi trig", act: u => { if (!pressed('[data-pmode="normal"]')) u.click('[data-pmode="normal"]'); },
				screen: () => { const m = S().multi.mode; return ok($1(".menvcard header span")?.textContent === "MULTI TRIG " + MTM_N[m] && (m === 1 || /choose Multi trig/.test($1(".menvsay")?.textContent || "")), "card " + $1(".menvcard header span")?.textContent + " / " + $1(".menvsay")?.textContent); } },
			{ say: "click Multi trig, then SPLIT KEY: the card says the envelope has no effect there", act: async (u, c) => { c.m0 = wk()?.multiTrig?.mode; u.click('[data-pmode="multi"]'); await sleep(300); u.click('[data-set="mtmode"] button[data-v="1"]'); },
				screen: () => ok(/^SPLIT KEY: no effect/.test($1(".menvsay")?.textContent || ""), "hint " + $1(".menvsay")?.textContent), machine: () => ok(wk()?.multiTrig?.mode === 1, "mode " + wk()?.multiTrig?.mode), within: 15000 },
			{ say: "click ALL TRK: the card says it shapes MULTI TRIG notes and when it silences every track", act: async u => { u.click('[data-set="mtmode"] button[data-v="0"]'); await sleep(400); Journey.snapshot("mm-perform-menv"); },
				screen: () => ok(/^ALL TRK: shapes the notes of the MULTI TRIG channel/.test($1(".menvsay")?.textContent || "") && /silent until the next one or STOP/.test($1(".menvsay")?.textContent || ""), "hint " + $1(".menvsay")?.textContent),
				machine: () => ok(wk()?.multiTrig?.mode === 0, "mode " + wk()?.multiTrig?.mode), within: 15000 },
			{ say: "click SEQ START: the card says it shapes the pattern a MULTI TRIG note starts", act: u => u.click('[data-set="mtmode"] button[data-v="2"]'),
				screen: () => ok(/^SEQ START: shapes the pattern a MULTI TRIG note starts/.test($1(".menvsay")?.textContent || ""), "hint " + $1(".menvsay")?.textContent), machine: () => ok(wk()?.multiTrig?.mode === 2, "mode " + wk()?.multiTrig?.mode), within: 15000 },
			{ say: "click the first mode back, then Auto track", act: async (u, c) => { if (c.m0 != null) u.click(`[data-set="mtmode"] button[data-v="${c.m0}"]`); await sleep(300); u.click('[data-pmode="normal"]'); },
				machine: c => ok(c.m0 == null || wk()?.multiTrig?.mode === c.m0, "mode " + wk()?.multiTrig?.mode), within: 15000 }
		],
		async tidy(u) { if ($1('[data-pmode="normal"]') && !pressed('[data-pmode="normal"]')) u.click('[data-pmode="normal"]'); await recvIdle(); }
	};
	/* B-017: dragging the multi envelope (its DEC value, or the DEC dot on its screen) never changes the page's layout:
	   the screen's canvas took its drawn size (its pixels, the display's scale times its box) as its own height, so each
	   redraw while dragging made the card, and the page, taller, until the render on release put it back. */
	const menvLayout = {
		name: "mm-perform-menv-layout", proves: ["MM-160"],
		steps: [
			go("perform"),
			{ say: "drag the multi envelope's DEC, then the DEC dot on its screen: the card and the page keep their height",
				act: async (u, c) => {
					const card = () => $1("#main .menvcard"), cv = () => $1('#main canvas.ed[data-ed="menv"]');
					c.e0 = JSON.stringify(wk().tracks.map(t => t.multiEnv));
					const size = () => [Math.round(card().getBoundingClientRect().height), $1("#main").scrollHeight, Math.round(cv().getBoundingClientRect().height)];
					c.before = size(); c.max = c.before.slice();
					const sample = setInterval(() => { if (card() && cv()) size().forEach((v, i) => { c.max[i] = Math.max(c.max[i], v); }); }, 10);
					try {
						const q = '#main .pc[data-g="menv"][data-n="DEC"]', d = parseInt($1(q + " b")?.textContent) > 64 ? -1 : 1;
						await u.drag(q, Array.from({ length: 10 }, (_, k) => [d * 4 * (k + 1), 0]), {}, { stepMs: 40 });
						const r = cv().getBoundingClientRect(), h = ED.menv.handles(r.width, r.height, cv()).find(x => x.k.startsWith("DEC"));
						const fx = h.x / r.width, fy = Math.min(Math.max(h.y, 6), r.height - 6) / r.height, dx = h.x > r.width / 2 ? -1 : 1;
						await u.drag(cv(), Array.from({ length: 10 }, (_, k) => [dx * 3 * (k + 1), -2 * (k + 1)]), {}, { fx, fy, stepMs: 40 });
					} finally { clearInterval(sample); }
					c.after = size();
				},
				screen: c => ok(c.max.every((v, i) => v <= c.before[i] + 1) && c.after.every((v, i) => Math.abs(v - c.before[i]) <= 1),
					`card, page, screen heights ${c.before.join("/")} -> at most ${c.max.join("/")} while dragging, ${c.after.join("/")} after`),
				machine: c => ok(JSON.stringify(wk().tracks.map(t => t.multiEnv)) !== c.e0, "multi env unchanged"), within: 15000 },
			{ ...undoKey, act: u => { blur(); u.key("z", { cmd: true }); } },
			{ ...undoKey, act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(JSON.stringify(wk().tracks.map(t => t.multiEnv)) === c.e0, "multi env not back"), within: 15000 }
		]
	};
	/* B-018: ? as the operating system delivers it, before any click in the window: the web view has the keyboard
	   (when the page is up, and whenever the window becomes the key window JUCE takes it for its own view and the page's
	   component hands it back), so the key reaches the page, opens the keyboard view and does not beep. "activate": what
	   JUCE does then; no "focus": nothing clicks first. */
	const osHelp = {
		name: "mm-keys-os-help", proves: [], needs: Journey.osKeyPath,
		steps: [
			{ say: "the window becomes the key window (JUCE takes the keyboard), then press ? on the keyboard, no click in the page: the keyboard view", act: async u => { blur(); await u.osKey("activate"); await sleep(300); await u.osKey("?"); },
				screen: () => ok(!$1("#keyspop").hidden && !!$1("#keyspop .kv-cap"), "keys view " + ($1("#keyspop").hidden ? "hidden" : "without the drawn keyboard")) },
			{ say: "press Escape on the keyboard: it closes", act: u => u.osKey("escape"), screen: () => ok($1("#keyspop").hidden, "still open") }
		]
	};
	const songInspector = {
		name: "mm-song-row-inspector", proves: ["MM-262", "MM-266", "MM-272"],
		steps: [
			go("song"),
			{ say: "add a row (Arrange, pad A01)", act: async (u, c) => { u.click('[data-set="songpick"] button[data-v="song"]'); await sleep(200); c.r0 = JSON.stringify(songDoc()?.rows); c.n0 = songDoc()?.rows.length; u.click('[data-addpat="0"]'); await until(() => songDoc()?.rows.length === c.n0 + 1, 15000); c.i = S().songSel; }, machine: c => ok(songDoc()?.rows.length === c.n0 + 1, "rows " + songDoc()?.rows.length), within: 15000 },
			{ say: "click Repeat +", act: (u, c) => { c.rep = songDoc().rows[c.i].repeats; u.click('[data-step="rep"][data-d="1"]'); }, machine: c => ok(songDoc().rows[c.i].repeats === c.rep + 1, "repeats " + songDoc().rows[c.i].repeats), within: 15000 },
			{ say: "click More and mute track 1 for the row", act: async u => { if (!$1('[data-rowmute="0"]')) u.click("[data-rowmore]"); await sleep(250); u.click('[data-rowmute="0"]'); }, machine: c => ok((songDoc().rows[c.i].mutes & 1) === 1, "mutes " + songDoc().rows[c.i].mutes), within: 15000 },
			{ say: "click Add loop: a loop row after it", act: u => u.click('[data-rowact="loop"]'), machine: c => ok(songDoc().rows[c.i + 1]?.kind === "loop", "row " + JSON.stringify(songDoc().rows[c.i + 1]?.kind)), within: 15000 }
		],
		async tidy(u, c) { if (S().songMore) u.click("[data-rowmore]"); if (c.r0) await undoUntil(u, () => JSON.stringify(songDoc()?.rows) === c.r0, 8); }
	};
	const songDrag = {
		name: "mm-song-drag-drop", proves: ["MM-261"],
		steps: [
			go("song"),
			{ say: "drag pad A02 onto the empty end of the grid: a row is appended", act: async (u, c) => { u.click('[data-set="songpick"] button[data-v="song"]'); await sleep(200); c.r0 = JSON.stringify(songDoc()?.rows); c.n0 = S().song.length; await u.dragDrop('[data-addpat="1"]', `#tl .scell[data-i="${c.n0 + 1}"]`); },
				machine: c => ok(songDoc()?.rows.length === JSON.parse(c.r0).length + 1 && songDoc().rows.some(r => r.kind === "pattern" && r.pattern === 1), "rows " + songDoc()?.rows.map(r => r.kind === "pattern" ? r.pattern : r.kind).join(",")), within: 15000 },
			{ say: "drag that row onto the first cell", act: async (u, c) => { const i = S().song.findIndex((r, k) => !r.type && r.pat === 1 && k > 0); await u.dragDrop(`#tl .scell[data-i="${i}"]`, '#tl .scell[data-i="0"]'); },
				machine: () => ok(songDoc()?.rows[0]?.pattern === 1, "rows " + songDoc()?.rows.map(r => r.kind === "pattern" ? r.pattern : r.kind).join(",")), within: 15000 }
		],
		async tidy(u, c) { if (c.r0) await undoUntil(u, () => JSON.stringify(songDoc()?.rows) === c.r0, 6); }
	};
	const openKits2 = { say: "click KIT on the LCD", act: u => u.click("#kitf"), screen: () => ok(!$1("#libpop").hidden, "closed") };
	const altPick = f => ({ say: "Alt-click a slot: selected", act: (u, c) => { c.sel = f(c); if (c.sel == null) throw new Error("no slot"); u.click(ks2(c.sel), { alt: true }); }, screen: c => ok($1(ks2(c.sel))?.getAttribute("aria-selected") === "true", "not selected") });
	const answer = async (u, c) => { if (await until(dlgShown, 3000)) { c.note = "asked: " + ($1("#dlg p")?.textContent || "").slice(0, 80); u.click($1("#dlg .danger") || $1('#dlg [data-dlg="0"]')); } };
	const otherSlot = () => I().slots("kit").reverse().find(k => k !== machine().kit.current && I().doc("kit", k) && !MmConvert.kitEmpty(I().doc("kit", k)));
	const kitSaveAs = {
		name: "mm-lib-kit-saveas", proves: ["MM-099"],
		steps: [
			openKits2, altPick(c => { c.k0 = machine().kit.current; return otherSlot(); }),
			{ say: "click Save as and answer the question", act: async (u, c) => { c.d0 = JSON.stringify(I().doc("kit", c.sel)); u.click('#libpop [data-la="saveas"]'); await answer(u, c); },
				machine: c => ok(same(I().doc("kit", c.sel)?.tracks.map(t => t.machine), wk().tracks.map(t => t.machine)) && MmConvert.kitName(I().doc("kit", c.sel)) === MmConvert.kitName(wk()), `slot ${MmConvert.kitName(I().doc("kit", c.sel) || {})}, working ${MmConvert.kitName(wk() || {})}, current ${machine().kit.current}`), within: 25000 },
			{ say: "press Escape", act: u => u.key("Escape"), screen: () => ok($1("#libpop").hidden, "open") }
		]
	};
	const kitRename = {
		name: "mm-lib-kit-rename-undo", proves: ["MM-100"],
		steps: [
			openKits2, altPick(c => { const k = otherSlot(); c.n0 = MmConvert.kitName(I().doc("kit", k)); return k; }),
			{ say: "click Rename, type JOURNEY, press Enter and answer", act: async (u, c) => { u.click('#libpop [data-la="rename"]'); await sleep(250); u.type("#lsin", "JOURNEY"); await sleep(100); u.key("Enter"); await answer(u, c); }, machine: c => ok(MmConvert.kitName(I().doc("kit", c.sel)).trim() === "JOURNEY", "name " + MmConvert.kitName(I().doc("kit", c.sel))), within: 25000 },
			{ ...undoKey, machine: c => ok(MmConvert.kitName(I().doc("kit", c.sel)) === c.n0, "name " + MmConvert.kitName(I().doc("kit", c.sel))), within: 25000 },
			{ say: "press Escape", act: u => u.key("Escape"), screen: () => ok($1("#libpop").hidden, "open") }
		]
	};
	const kitClear = {
		name: "mm-lib-kit-clear-undo", proves: ["MM-104"],
		steps: [
			openKits2, altPick(c => { const k = otherSlot(); c.d0 = JSON.stringify(I().doc("kit", k)); return k; }),
			{ say: "press Delete and answer: the slot is cleared", act: async (u, c) => { u.key("Delete"); await answer(u, c); }, machine: c => ok(MmConvert.kitEmpty(I().doc("kit", c.sel)), "slot " + MmConvert.kitName(I().doc("kit", c.sel))), within: 25000 },
			{ ...undoKey, machine: c => ok(JSON.stringify(I().doc("kit", c.sel)) === c.d0, "slot not back"), within: 25000 },
			{ say: "press Escape", act: u => u.key("Escape"), screen: () => ok($1("#libpop").hidden, "open") }
		]
	};
	const patTrigs = p => (I().doc("pattern", p)?.tracks || []).reduce((n, t) => n + t.trig.length, 0);
	const patClear = {
		name: "mm-lib-pattern-clear-undo", proves: ["MM-190"],
		steps: [
			{ say: "open the pattern chooser and move to a pattern with notes (arrows)", act: async (u, c) => { u.click("#pat"); await sleep(300); c.p = I().slots("pattern").find(p => p !== cur() && patTrigs(p) > 0); if (c.p == null) throw new Error("no other pattern with notes"); c.d0 = JSON.stringify(I().doc("pattern", c.p)); for (let n = 0; n < 128 && LIB.sel !== c.p; n++) { u.key("ArrowRight"); await sleep(20); } },
				screen: c => ok($1(`#libpop .ps[data-ps="${c.p}"]`)?.getAttribute("aria-selected") === "true", "not selected") },
			{ say: "click Clear and answer", act: async (u, c) => { u.click('#libpop [data-la="clear"]'); await answer(u, c); }, machine: c => ok(patTrigs(c.p) === 0, patTrigs(c.p) + " notes"), within: 25000 },
			{ ...undoKey, machine: c => ok(JSON.stringify(I().doc("pattern", c.p)) === c.d0, "not back"), within: 25000 },
			{ say: "press Escape", act: u => u.key("Escape"), screen: () => ok($1("#libpop").hidden, "open") }
		]
	};


	/* ---------- the MD port of 2026-10-05 (MM-PORT-PLAN.md): the black keys, the roll's paint ---------- */
	const blackKeys = {
		name: "mm-keys-black-keys", proves: ["MM-027"],
		steps: [
			go("seq"), sel(0),
			{ say: "press W, T and P: C♯, F♯ and the next D♯ above the A key's C", act: async (u, c) => { results.length = 0; notesOn.length = 0; blur(); c.o = 12 * KB.oct; for (const k of ["w", "t", "p"]) { u.key(k); await sleep(250); } },
				screen: c => ok(same(notesOn.slice(-3), [c.o + 1, c.o + 6, c.o + 15]), "pitches sent " + notesOn.join(",") + ", want " + [c.o + 1, c.o + 6, c.o + 15]),
				machine: () => ok(results.filter(r => r.op === "noteOn" && r.ok).length >= 3, "results " + results.map(r => r.op + ":" + r.ok).join(",")) },
			{ say: "press A and S: the white keys still play C and D", act: async (u, c) => { notesOn.length = 0; for (const k of ["a", "s"]) { u.key(k); await sleep(250); } },
				screen: c => ok(same(notesOn.slice(-2), [c.o, c.o + 2]), "pitches sent " + notesOn.join(",")) }
		]
	};
	/* four empty steps in a row (no note, no NOTE OFF) on track t */
	const freeRun = (t, n = 4) => { const tr = trkOf(t), busy = t < 6 ? trigsOf(t) : midiTrigsOf(t); for (let s = 0; s + n <= S().len; s++) if ([...Array(n).keys()].every(k => !tr.steps[s + k] && !busy.includes(s + k))) return [...Array(n).keys()].map(k => s + k); return null; };
	/* a drag in the roll from step a through steps b..., at the roll's middle row */
	const dragRoll = async (u, t, run, m = {}) => { const p = rollCell(t, run[0]), w = p.c.getBoundingClientRect().width;
		await u.drag(p.c, run.slice(1).map(s => [(rollCell(t, s).fx - p.fx) * w, 0]), m, { fx: p.fx, fy: p.fy }); };
	const rollPaint = {
		name: "mm-seq-roll-paint", proves: ["MM-076", "MM-172"],
		steps: [
			go("seq"), drawOn,
			{ say: "pick a synth track with four empty steps in a row", act: (u, c) => { c.t = [0, 1, 2, 3, 4, 5].find(t => freeRun(t)); if (c.t == null) throw new Error("no synth track has four free steps in a row"); if (S().side === "midi") u.click('[data-side="int"]'); u.click(rail(c.t)); }, screen: c => ok(S().sel === c.t, "selected " + S().sel) },
			{ say: "press an empty roll cell and drag sideways over three more steps: four notes at that pitch", act: async (u, c) => {
				c.run = freeRun(c.t); c.n = rollCell(c.t, c.run[0]).n; c.t0 = trigsOf(c.t); await dragRoll(u, c.t, c.run); },
				screen: c => ok(c.run.every(s => same(S().tracks[c.t].steps[s]?.n, [c.n])), "roll " + c.run.map(s => JSON.stringify(S().tracks[c.t].steps[s]?.n || null)).join(",")),
				machine: c => ok(c.run.every(s => trigsOf(c.t).includes(s)), "pattern trigs " + trigsOf(c.t).join(",")), within: 15000 },
			/* I-010: the note before them keeps its length: a NOTE OFF on the first step when it ran into it */
			{ say: "Alt-press the first and drag over the others: all four erased", act: (u, c) => dragRoll(u, c.t, c.run, { alt: true }),
				screen: c => ok(c.run.every((s, k) => !S().tracks[c.t].steps[s] || k === 0 && S().tracks[c.t].steps[s].off), "roll " + c.run.map(s => JSON.stringify(S().tracks[c.t].steps[s] || null)).join(",")),
				machine: c => ok(c.run.every(s => !trigsOf(c.t).includes(s)), "pattern trigs " + trigsOf(c.t).join(",")), within: 15000 },
			{ say: "Cmd+Z: the erase was one undo step, all four are back", act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(c.run.every(s => trigsOf(c.t).includes(s)), "pattern trigs " + trigsOf(c.t).join(",")), within: 15000 },
			{ say: "Cmd+Z: the paint was one undo step, the track is as before", act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(same(trigsOf(c.t), c.t0), "pattern trigs " + trigsOf(c.t).join(",") + ", was " + c.t0.join(",")), within: 15000 }
		],
		async tidy(u, c) { if (c.t0 && !same(trigsOf(c.t), c.t0)) await undoUntil(u, () => same(trigsOf(c.t), c.t0)); drawBack(c); }
	};
	/* ---------- 0.5 slice 3: the piano roll's note lengths, draw and select (I-007, I-010) ---------- */
	const offsOf = t => (t < 6 ? patDoc()?.tracks[t]?.noteOff : patDoc()?.midiTracks?.[t - 6]?.noteOff || []).slice().sort((a, b) => a - b);
	const midiTrigsOf = t => (patDoc()?.midiTracks?.[t - 6]?.trig || []).slice().sort((a, b) => a - b);
	const lenLock = (t, s) => (patDoc()?.locks || []).find(l => l.track === t - 6 && l.page === 7 && l.param === 0)?.steps.find(([x]) => x === s)?.[1];
	/* a point of the roll: step s (fx: its middle, or its right edge less 2 px), pitch n (the row's middle) */
	const rollAt = (t, s, n, edge) => { const c = $1(`#seq canvas.roll[data-big][data-t="${t}"]`), G = laneGeom(c), r = c.getBoundingClientRect(), q = G.col[s];
		if (!q || n < G.lo || n > G.hi) throw new Error(`step ${s + 1} / ${noteName(n)} is not shown`);
		return { c, fx: (edge ? q.x1 - 2 : (q.x0 + q.x1) / 2) / r.width, fy: (G.y(n) + G.rh / 2) / r.height, w: r.width, h: r.height }; };
	/* a press at (s, n) dragged to (s2, n2) (and px more to the right: past a column's middle, where a length counts it) */
	const dragAt = async (u, t, from, to, m = {}, edge = false) => { const a = rollAt(t, from[0], from[1], edge), b = rollAt(t, to[0], to[1]), dx = (b.fx - a.fx) * a.w + (to[2] || 0), dy = (b.fy - a.fy) * a.h;
		await u.drag(a.c, [[dx / 2, dy / 2], [dx, dy]], m, { fx: a.fx, fy: a.fy }); };
	/* Draw on and the Len key at a length (it goes round 1/16 1/8 1/4 1/2 1 bar) */
	const drawLen = async (u, L) => { if (!S().rollDraw) u.click("#rolldraw"); for (let i = 0; i < 6 && S().rollLen !== L; i++) { u.click("#rolllen"); await sleep(80); } };
	/* the middle row's pitch, or one next to it, with no note's bar over step s (a press there would take that note) */
	const freePitch = (t, s) => { const n = rollCell(t, s).n; return [n, n + 1, n - 1, n + 2, n - 2].find(x => !underBar(t, s, x)) ?? n; };
	const clickAt = (u, t, s, n) => { const p = rollAt(t, s, n); u.click(p.c, {}, p.fx, p.fy); };
	const rollDrawLength = {
		name: "mm-roll-draw-length", proves: ["MM-076", "MM-078", "MM-175"],
		steps: [
			go("seq"),
			{ say: "pick a synth track with six empty steps in a row", act: (u, c) => { c.t = [0, 1, 2, 3, 4, 5].find(t => freeRun(t, 6)); if (c.t == null) throw new Error("no synth track has six free steps in a row"); if (S().side === "midi") u.click('[data-side="int"]'); u.click(rail(c.t)); }, screen: c => ok(S().sel === c.t, "selected " + S().sel) },
			{ say: "Draw on, the Len key at 1/16", act: async (u, c) => { c.d0 = S().rollDraw; c.l0 = S().rollLen; await drawLen(u, 1); }, screen: () => ok(pressed("#rolldraw") && $1("#rolllen").textContent === "1/16", "Draw " + pressed("#rolldraw") + ", Len " + $1("#rolllen").textContent) },
			{ say: "click the run's first cell: a 1/16 note, a NOTE OFF on the next step (it does not run into the next note)", act: (u, c) => {
				c.run = freeRun(c.t, 6); c.n = freePitch(c.t, c.run[0]); c.t0 = trigsOf(c.t); c.o0 = offsOf(c.t); if (S().stepSel) clearSel(); clickAt(u, c.t, c.run[0], c.n); },
				screen: c => ok(!!S().tracks[c.t].steps[c.run[0]]?.n && !!S().tracks[c.t].steps[c.run[1]]?.off, "roll " + JSON.stringify(S().tracks[c.t].steps.slice(c.run[0], c.run[0] + 2))),
				machine: c => ok(trigsOf(c.t).includes(c.run[0]) && offsOf(c.t).includes(c.run[1]), `pattern trigs ${trigsOf(c.t).join(",")}, NOTE OFFs ${offsOf(c.t).join(",")}`), within: 15000 },
			{ say: "click the Len key (1/8), then the run's fourth cell: a note two steps long", act: async (u, c) => { u.click("#rolllen"); await sleep(150); clickAt(u, c.t, c.run[3], c.n); },
				screen: c => ok($1("#rolllen").textContent === "1/8" && !!S().tracks[c.t].steps[c.run[5]]?.off, "Len " + $1("#rolllen").textContent + ", roll " + JSON.stringify(S().tracks[c.t].steps.slice(c.run[3], c.run[3] + 3))),
				machine: c => ok(trigsOf(c.t).includes(c.run[3]) && offsOf(c.t).includes(c.run[5]), `pattern trigs ${trigsOf(c.t).join(",")}, NOTE OFFs ${offsOf(c.t).join(",")}`), within: 15000 },
			{ say: "drag the first note's end over two more steps: it lasts three steps, up to the next note (its NOTE OFF goes); new notes get 3/16", act: (u, c) => dragAt(u, c.t, [c.run[0], c.n], [c.run[2], c.n, 5], {}, true),
				screen: c => ok(!S().tracks[c.t].steps[c.run[1]] && $1("#rolllen").textContent === "3/16", "roll " + JSON.stringify(S().tracks[c.t].steps.slice(c.run[0], c.run[0] + 3)) + ", Len " + $1("#rolllen").textContent),
				machine: c => ok(!offsOf(c.t).includes(c.run[1]) && trigsOf(c.t).includes(c.run[0]), `NOTE OFFs ${offsOf(c.t).join(",")}`), within: 15000 },
			{ say: "Cmd+Z three times: the track as before", act: async (u, c) => { await undoUntil(u, () => same(trigsOf(c.t), c.t0) && same(offsOf(c.t), c.o0), 4); },
				machine: c => ok(same(trigsOf(c.t), c.t0) && same(offsOf(c.t), c.o0), `pattern trigs ${trigsOf(c.t).join(",")}, NOTE OFFs ${offsOf(c.t).join(",")}`), within: 15000 }
		],
		async tidy(u, c) { if (c.t0 && !(same(trigsOf(c.t), c.t0) && same(offsOf(c.t), c.o0))) await undoUntil(u, () => same(trigsOf(c.t), c.t0) && same(offsOf(c.t), c.o0)); if (c.l0) setRollLen(c.l0); if (c.d0 != null && S().rollDraw !== c.d0) setRollDraw(c.d0); }
	};
	const rollBoxMove = {
		name: "mm-roll-box-move", proves: [],
		steps: [
			go("seq"),
			{ say: "pick a synth track with eight empty steps in a row, Draw on at 1/16, click the first: a note", act: async (u, c) => {
				c.t = [0, 1, 2, 3, 4, 5].find(t => freeRun(t, 8)); if (c.t == null) throw new Error("no synth track has eight free steps in a row"); if (S().side === "midi") u.click('[data-side="int"]'); u.click(rail(c.t)); await sleep(300);
				c.d0 = S().rollDraw; c.l0 = S().rollLen; await drawLen(u, 1); c.run = freeRun(c.t, 8); c.n = freePitch(c.t, c.run[0]); c.t0 = trigsOf(c.t); c.o0 = offsOf(c.t); if (S().stepSel) clearSel(); clickAt(u, c.t, c.run[0], c.n); },
				machine: c => ok(trigsOf(c.t).includes(c.run[0]) && offsOf(c.t).includes(c.run[1]), `pattern trigs ${trigsOf(c.t).join(",")}, NOTE OFFs ${offsOf(c.t).join(",")}`), within: 15000 },
			{ say: "press B: Draw off (select)", act: u => { blur(); u.key("b"); }, screen: () => ok(!S().rollDraw && !pressed("#rolldraw"), "Draw " + S().rollDraw) },
			{ say: "drag a box from an empty place round the note: the note is selected, its NOTE OFF too", act: (u, c) => dragAt(u, c.t, [c.run[2], c.n + 1], [c.run[0], c.n - 1]),
				screen: c => ok(same(S().stepSel, { t: c.t, n: 1, from: c.run[0], to: c.run[0] + 2 }), "selection " + JSON.stringify(S().stepSel)), machine: c => ok(trigsOf(c.t).includes(c.run[0]), "a box changed the pattern") },
			{ say: "drag the note four steps right: it moves, its NOTE OFF with it (one undo step)", act: (u, c) => dragAt(u, c.t, [c.run[0], c.n], [c.run[4], c.n]),
				screen: c => ok(!!S().tracks[c.t].steps[c.run[4]]?.n && !S().tracks[c.t].steps[c.run[0]]?.n && same(S().stepSel, { t: c.t, n: 1, from: c.run[4], to: c.run[4] + 2 }), "roll " + JSON.stringify(S().tracks[c.t].steps.slice(c.run[0], c.run[0] + 6)) + ", selection " + JSON.stringify(S().stepSel)),
				machine: c => ok(trigsOf(c.t).includes(c.run[4]) && !trigsOf(c.t).includes(c.run[0]) && offsOf(c.t).includes(c.run[5]), `pattern trigs ${trigsOf(c.t).join(",")}, NOTE OFFs ${offsOf(c.t).join(",")}`), within: 15000 },
			{ say: "press Delete: the selected note goes", act: u => { blur(); u.key("Delete"); }, machine: c => ok(!trigsOf(c.t).includes(c.run[4]), `pattern trigs ${trigsOf(c.t).join(",")}`), within: 15000 },
			{ say: "press B: Draw on; Cmd+Z three times (delete, move, note): the track as before", act: async (u, c) => { blur(); u.key("b"); await sleep(150); await undoUntil(u, () => same(trigsOf(c.t), c.t0) && same(offsOf(c.t), c.o0), 4); },
				screen: () => ok(S().rollDraw, "Draw off"), machine: c => ok(same(trigsOf(c.t), c.t0) && same(offsOf(c.t), c.o0), `pattern trigs ${trigsOf(c.t).join(",")}, NOTE OFFs ${offsOf(c.t).join(",")}`), within: 15000 }
		],
		async tidy(u, c) { if (S().stepSel) clearSel(); if (c.t0 && !(same(trigsOf(c.t), c.t0) && same(offsOf(c.t), c.o0))) await undoUntil(u, () => same(trigsOf(c.t), c.t0) && same(offsOf(c.t), c.o0)); if (c.l0) setRollLen(c.l0); if (c.d0 != null && S().rollDraw !== c.d0) setRollDraw(c.d0); }
	};
	const rollMidiLen = {
		name: "mm-roll-midi-len", proves: ["MM-243"],
		steps: [
			go("seq"),
			{ say: "click MIDI and pick a MIDI track with six empty steps in a row", act: async (u, c) => { if (S().side !== "midi") u.click('[data-side="midi"]'); await sleep(300); c.t = [6, 7, 8, 9, 10, 11].find(t => freeRun(t, 6)); if (c.t == null) throw new Error("no MIDI track has six free steps in a row"); u.click(rail(c.t)); },
				screen: c => ok(S().sel === c.t, "selected " + S().sel) },
			{ say: "Draw on at 1/16, click the run's first cell: a MIDI note 6 ticks long (LEN 6)", act: async (u, c) => {
				c.d0 = S().rollDraw; c.l0 = S().rollLen; await drawLen(u, 1); c.run = freeRun(c.t, 6); c.n = freePitch(c.t, c.run[0]); c.t0 = midiTrigsOf(c.t); c.kit = S().midi[c.t - 6].v.MID[0]; if (S().stepSel) clearSel(); clickAt(u, c.t, c.run[0], c.n); },
				machine: c => ok(midiTrigsOf(c.t).includes(c.run[0]) && (lenLock(c.t, c.run[0]) ?? c.kit) === 6, `MIDI trigs ${midiTrigsOf(c.t).join(",")}, LEN ${lenLock(c.t, c.run[0]) ?? "kit " + c.kit}`), within: 15000 },
			{ say: "drag its end over two more steps: LEN 18 (three steps)", act: (u, c) => dragAt(u, c.t, [c.run[0], c.n], [c.run[2], c.n, 5], {}, true),
				screen: c => ok(S().locks.get(c.t + "|MID.0")?.get(c.run[0]) === 18, "LEN lock " + S().locks.get(c.t + "|MID.0")?.get(c.run[0])),
				machine: c => ok(lenLock(c.t, c.run[0]) === 18, "LEN " + lenLock(c.t, c.run[0])), within: 15000 },
			{ say: "Cmd+Z twice: the track as before", act: async (u, c) => { await undoUntil(u, () => same(midiTrigsOf(c.t), c.t0), 3); },
				machine: c => ok(same(midiTrigsOf(c.t), c.t0), "MIDI trigs " + midiTrigsOf(c.t).join(",")), within: 15000 }
		],
		async tidy(u, c) { if (c.t0 && !same(midiTrigsOf(c.t), c.t0)) await undoUntil(u, () => same(midiTrigsOf(c.t), c.t0)); if (c.l0) setRollLen(c.l0); if (c.d0 != null && S().rollDraw !== c.d0) setRollDraw(c.d0); if (S().side === "midi") $1('[data-side="int"]')?.click(); }
	};
	/* K7 (DESIGN-step-selection.md §7, the Machinedrum's md-seq-select-copy-paste): one note copied to another step of
	   its track (the LCD's PASTE on the selection), then a block of two tracks duplicated and cleared with the LCD's CLR */
	const inPat = s => s < S().len;
	const selCells = () => $all("#seq .tlane.env .tc.selx").map(e => +e.dataset.s);
	const selectCopyPaste = {
		name: "mm-seq-select-copy-paste", proves: ["MM-183"],
		steps: [
			go("seq"),
			{ say: "pick a synth track with a note (and one below it)", act: (u, c) => { c.t = [0, 1, 2, 3, 4].find(t => trigsOf(t).some(inPat)) ?? 0; if (S().len < 8) throw new Error("the pattern is shorter than 8 steps"); if (S().side === "midi") u.click('[data-side="int"]'); u.click(rail(c.t)); }, screen: c => ok(S().sel === c.t, "selected " + S().sel) },
			{ say: "Cmd-click a note in the roll: it is selected", act: (u, c) => {
				c.t0 = trigsOf(c.t); c.t1 = trigsOf(c.t + 1); c.p0 = pat0();
				c.s = c.t0.find(inPat); c.d = [...Array(S().len).keys()].find(s => !S().tracks[c.t].steps[s] && Math.abs(s - c.s) > 1 && (s < 4 || s >= 8));
				if (c.d == null) throw new Error("no free step to paste to");
				if (S().stepSel) clearSel(); const p = rollCell(c.t, c.s); u.click(p.c, { cmd: true }, p.fx, p.fy);
			}, screen: c => ok(same(S().stepSel, { t: c.t, n: 1, from: c.s, to: c.s + 1 }) && same(selCells(), [c.s]), "selection " + JSON.stringify(S().stepSel)),
				machine: c => ok(pat0() === c.p0, "a Cmd-click changed the pattern") },
			{ say: "press Cmd+C", act: u => { blur(); u.key("c", { cmd: true }); }, screen: () => ok(/Copied/.test($1("#toast")?.textContent || ""), "toast " + $1("#toast")?.textContent) },
			{ say: "Cmd-click an empty step of the same track", act: (u, c) => { const p = rollCell(c.t, c.d); u.click(p.c, { cmd: true }, p.fx, p.fy); },
				screen: c => ok(same(selCells(), [c.d]) && $1('[data-sec="paste"]').classList.contains("onsel"), "selected " + selCells().join(",") + ", PASTE marked " + $1('[data-sec="paste"]').classList.contains("onsel")) },
			{ say: "click PASTE on the LCD: the note lands on the selected step", act: u => u.click('[data-sec="paste"]'), screen: c => ok(!!S().tracks[c.t].steps[c.d]?.n, "roll shows nothing there"),
				machine: c => ok(trigsOf(c.t).includes(c.d), "pattern " + trigsOf(c.t).join(",")), within: 15000 },
			{ say: "Cmd-drag in the roll from step 1 to step 4: a block", act: async (u, c) => { c.b0 = [c.t, c.t + 1].map(t => trigsOf(t).filter(s => s < 4)); await dragRoll(u, c.t, [0, 2, 3], { cmd: true }); },
				screen: c => ok(same(S().stepSel, { t: c.t, n: 1, from: 0, to: 4 }), "selection " + JSON.stringify(S().stepSel)) },
			{ say: "pick the track below on the rail and Cmd-Shift-click its step 4: the block takes both tracks", act: async (u, c) => { u.click(rail(c.t + 1)); await sleep(300); const p = rollCell(c.t + 1, 3); u.click(p.c, { cmd: true, shift: true }, p.fx, p.fy); },
				screen: c => ok(same(S().stepSel, { t: c.t, n: 2, from: 0, to: 4 }) && $all("#rail .th.selt").length === 2, "selection " + JSON.stringify(S().stepSel)) },
			{ say: "press Cmd+D: the block again on steps 5-8", act: u => { blur(); u.key("d", { cmd: true }); },
				machine: c => ok([c.t, c.t + 1].every((t, k) => same(trigsOf(t).filter(s => s >= 4 && s < 8).map(s => s - 4), c.b0[k])), "steps 5-8 " + [c.t, c.t + 1].map(t => trigsOf(t).filter(s => s >= 4 && s < 8).join(",")).join(" / ")),
				screen: () => ok(S().stepSel?.from === 4 && S().stepSel?.n === 2, "selection " + JSON.stringify(S().stepSel)), within: 15000 },
			{ say: "click CLR on the LCD: the selected block (steps 5-8 of both tracks) is cleared, nothing else", act: (u, c) => { c.out = [c.t, c.t + 1].map(t => trigsOf(t).filter(s => s < 4 || s >= 8)); u.click('[data-sec="clear"]'); },
				machine: c => ok([c.t, c.t + 1].every((t, k) => !trigsOf(t).some(s => s >= 4 && s < 8) && same(trigsOf(t).filter(s => s < 4 || s >= 8), c.out[k])), "pattern " + [c.t, c.t + 1].map(t => trigsOf(t).join(",")).join(" / ")), within: 15000 },
			{ say: "press Esc: no selection", act: u => { blur(); u.key("Escape"); }, screen: () => ok(!S().stepSel && !selCells().length, "still selected") },
			{ say: "Cmd+Z three times (paste, duplicate, clear): both tracks as before", act: async (u, c) => { await undoUntil(u, () => same(trigsOf(c.t), c.t0) && same(trigsOf(c.t + 1), c.t1), 3); },
				machine: c => ok(same(trigsOf(c.t), c.t0) && same(trigsOf(c.t + 1), c.t1), `pattern ${trigsOf(c.t).join(",")} / ${trigsOf(c.t + 1).join(",")}`), within: 15000 }
		],
		async tidy(u, c) { if (S().stepSel) clearSel(); if (c.t0 && !(same(trigsOf(c.t), c.t0) && same(trigsOf(c.t + 1), c.t1))) await undoUntil(u, () => same(trigsOf(c.t), c.t0) && same(trigsOf(c.t + 1), c.t1)); }
	};
	/* K7 (the Machinedrum's md-seq-step-menu): the step menu: a slide, a copy and a paste with the pointer only */
	const stepMenuJ = {
		name: "mm-seq-step-menu", proves: ["MM-183", "MM-233"],
		steps: [
			go("seq"), sel(0), drawOn,
			{ say: "click an empty roll cell: a note to work on", act: async (u, c) => {
				c.t0 = trigsOf(c.t); c.l0 = slidesOf(c.t); c.n = rollCell(c.t, 0).n;
				const free = freeSteps(c.t, 2, 0, c.n); if (free.length < 2) throw new Error("no two free steps"); [c.s, c.d] = free.slice().sort((a, b) => b - a);
				if (S().stepSel) clearSel(); await roll(c.t, c.s)(u); },
				screen: c => ok(!!S().tracks[c.t].steps[c.s]?.n, "no note"), machine: c => ok(trigsOf(c.t).includes(c.s), "pattern " + trigsOf(c.t).join(",")), within: 15000 },
			{ say: "right-click it: its menu", act: (u, c) => { const p = rollCell(c.t, c.s); u.rightClick(p.c, {}, p.fx, p.fy); },
				screen: c => ok(!$1("#deskmenu").hidden && !!$1('#deskmenu [data-mid="step-fill-2"]') && same(S().stepSel, { t: c.t, n: 1, from: c.s, to: c.s + 1 }), "no step menu") },
			{ say: "choose Slide", act: u => u.click('#deskmenu [data-mid="step-slide"]'), screen: c => ok($1("#deskmenu").hidden && S().tracks[c.t].slide.has(c.s), "no slide shown"),
				machine: c => ok(slidesOf(c.t).includes(c.s), "slides " + slidesOf(c.t).join(",")), within: 15000 },
			{ say: "right-click it again and choose Copy", act: async (u, c) => { const p = rollCell(c.t, c.s); u.rightClick(p.c, {}, p.fx, p.fy); await sleep(150); u.click('#deskmenu [data-mid="copy"]'); },
				screen: () => ok(/Copied/.test($1("#toast")?.textContent || ""), "toast " + $1("#toast")?.textContent) },
			{ say: "right-click an empty step and choose Paste here", act: async (u, c) => { const p = rollCell(c.t, c.d); u.rightClick(p.c, {}, p.fx, p.fy); await sleep(150); u.click('#deskmenu [data-mid="paste"]'); },
				screen: c => ok(!!S().tracks[c.t].steps[c.d]?.n, "nothing there"), machine: c => ok(trigsOf(c.t).includes(c.d) && slidesOf(c.t).includes(c.d), "pattern " + trigsOf(c.t).join(",") + ", slides " + slidesOf(c.t).join(",")), within: 15000 },
			{ say: "press Escape: no selection; Cmd+Z three times (paste, slide, note): the track as before", act: async (u, c) => { blur(); u.key("Escape"); await sleep(150); await undoUntil(u, () => same(trigsOf(c.t), c.t0) && same(slidesOf(c.t), c.l0), 4); },
				machine: c => ok(same(trigsOf(c.t), c.t0) && same(slidesOf(c.t), c.l0), `pattern ${trigsOf(c.t).join(",")}, slides ${slidesOf(c.t).join(",")}`), within: 15000 }
		],
		async tidy(u, c) { if (!$1("#deskmenu")?.hidden) closeDeskMenu(); if (S().stepSel) clearSel(); if (c.t0 && !same(trigsOf(c.t), c.t0)) await undoUntil(u, () => same(trigsOf(c.t), c.t0)); drawBack(c); }
	};
	/* the Machinedrum's md-seq-copy-paste-buttons: one note copied and pasted with the top bar's Copy, Paste and Clr */
	const buttonsCopyPaste = {
		name: "mm-seq-copy-paste-buttons", proves: ["MM-044", "MM-183"],
		steps: [
			go("seq"),
			{ say: "pick a synth track with a note and Cmd-click the note: it is selected", act: async (u, c) => {
				c.t = [0, 1, 2, 3, 4, 5].find(t => trigsOf(t).some(inPat)) ?? 0; if (S().side === "midi") u.click('[data-side="int"]'); u.click(rail(c.t)); await sleep(300);
				c.t0 = trigsOf(c.t); c.s = c.t0.find(inPat); c.d = [...Array(S().len).keys()].find(s => !S().tracks[c.t].steps[s] && Math.abs(s - c.s) > 1);
				if (c.d == null) throw new Error("no free step to paste to");
				if (S().stepSel) clearSel(); const p = rollCell(c.t, c.s); u.click(p.c, { cmd: true }, p.fx, p.fy); },
				screen: c => ok(same(S().stepSel, { t: c.t, n: 1, from: c.s, to: c.s + 1 }), "selection " + JSON.stringify(S().stepSel)) },
			{ say: "click Copy in the top bar: the selected note is copied", act: u => u.click('[data-sec="copy"]'), screen: c => ok(/Copied/.test($1("#toast")?.textContent || "") && S().stepSel?.from === c.s, "toast " + $1("#toast")?.textContent) },
			{ say: "Cmd-click an empty step of the same track", act: (u, c) => { const p = rollCell(c.t, c.d); u.click(p.c, { cmd: true }, p.fx, p.fy); }, screen: c => ok(same(S().stepSel, { t: c.t, n: 1, from: c.d, to: c.d + 1 }), "selection " + JSON.stringify(S().stepSel)) },
			{ say: "click Paste in the top bar: the note lands at the selected step", act: u => u.click('[data-sec="paste"]'),
				machine: c => ok(trigsOf(c.t).includes(c.d) && same(trigsOf(c.t).filter(s => s !== c.d), c.t0), "pattern " + trigsOf(c.t).join(",")), within: 15000 },
			{ say: "click Clr in the top bar: the pasted note is cleared again, nothing else", act: u => u.click('[data-sec="clear"]'), machine: c => ok(same(trigsOf(c.t), c.t0), "pattern " + trigsOf(c.t).join(",")), within: 15000 },
			{ say: "Cmd+Z twice (clear, paste): the track as before", act: async (u, c) => { u.key("Escape"); await undoUntil(u, () => trigsOf(c.t).includes(c.d), 2); await sleep(300); await undoUntil(u, () => same(trigsOf(c.t), c.t0), 2); },
				machine: c => ok(same(trigsOf(c.t), c.t0), "pattern " + trigsOf(c.t).join(",")), within: 15000 }
		],
		async tidy(u, c) { if (S().stepSel) clearSel(); if (c.t0 && !same(trigsOf(c.t), c.t0)) await undoUntil(u, () => same(trigsOf(c.t), c.t0)); }
	};
	/* B-019: a .syx imported as from a cable (the dumps on SYSEX RECV). The file is the run's (GEARMULATOR_MDMM_SYX_FILE,
	   diagnostics builds: the plug-in opens it where the chooser would be). Kits only; afterwards every kit the report
	   does not list (taken as in the file) has the file's name on the machine. An import has no Undo: last. */
	const syxKitIds = () => $all('#syxpop button[data-syxitem^="kit:"]');
	/* the report: the slots of a kind the machine did not take as in the file (every reported item carries its outcome) */
	const syxNotTaken = kind => new Set($all(`#syxpop [data-syxitem^="${kind}:"][data-syxout]`).filter(d => d.dataset.syxout !== "taken").map(d => +d.dataset.syxitem.split(":")[1]));
	/* a .syx dropped on the window (FOUNDATION.md, "Files dropped on the window"): the run's file, dropped through the
	   window's drop path from the native side on ("dropfiles <x> <y> syx" in the page's log, diagnostics builds; as
	   md-drop-syx): its import window opens */
	const dropSyxJ = {
		name: "mm-drop-syx", proves: [],
		needs: () => new URLSearchParams(location.search).get("syxfile") ? null
			: "no .syx for the run (GEARMULATOR_MDMM_SYX_FILE)",
		steps: [
			{ say: "drop the run's .syx on the page: its import window opens with the file's preview",
				act: () => Bridge.log(`dropfiles ${Math.round(innerWidth / 2)} ${Math.round(innerHeight / 2)} syx`),
				screen: () => ok(!$1("#syxpop").hidden && $all("#syxpop [data-syxkind]").length > 0, "no preview"),
					within: 8000 },
			{ say: "click Cancel: it closes, nothing is sent",
				act: u => u.click('#syxpop .syxfoot [data-syxgo="close"]'),
				screen: () => ok($1("#syxpop").hidden, "still open") }
		],
		async tidy(u) { if (!$1("#syxpop").hidden) u.key("Escape"); }
	};
	const syxImportJ = {
		name: "mm-lib-syx-import", proves: ["MM-308", "MM-309"],
		needs: () => new URLSearchParams(location.search).get("syxfile") ? null : "no .syx for the run (GEARMULATOR_MDMM_SYX_FILE)",
		steps: [
			{ say: "choose IMPORT SYSEX… in the engine menu: the file's preview", act: u => u.pick("engsel", "import"), screen: () => ok(!$1("#syxpop").hidden && syxKitIds().length > 0, "no preview with kits"), within: 8000 },
			{ say: "leave Kits ticked only, click Import: sent on SYSEX RECV, read back, reported", act: (u, c) => {
				for (const b of $all("#syxpop [data-syxkind]")) if (b.checked !== (b.dataset.syxkind === "kit")) u.click(b);
				c.names = syxKitIds().map(b => [+b.dataset.syxitem.split(":")[1], (b.dataset.syxname || "").trim()]);
				u.click('#syxpop [data-syxgo="start"]');
			}, screen: () => ok(/imported/.test($1("#syxpop .syxsum")?.textContent || ""), "progress: " + ($1("#syxpop .syxbar span")?.textContent || "")),
			machine: c => {
				const notTaken = syxNotTaken("kit");
				const off = c.names.filter(([k, n]) => !notTaken.has(k) && n && (kitName(k) || "").trim() !== n);
				return ok(!off.length, off.length + " kits not as in the file: " + off.slice(0, 4).map(([k, n]) => `K${k + 1} "${kitName(k)}" not "${n}"`).join(", "));
			}, within: 240000 },
			{ say: "click Done: the panel closes", act: u => u.click('#syxpop [data-syxgo="close"]'), screen: () => ok($1("#syxpop").hidden, "still open") },
			{ say: "press Escape", act: u => u.key("Escape"), screen: () => ok($1("#libpop").hidden, "open") }
		]
	};
	/* ---------- wave 6: SysEx kinds and ranges (DigiPRO waveforms too), SPECIFIC place, VERIFY ONLY, Reset machine… ---------- */
	const syxNews = [];
	Bridge.onMessage(m => { if (m.type === "syxExport") { syxNews.push(m); if (syxNews.length > 20) syxNews.shift(); } });
	const lastExport = () => syxNews.filter(m => !m.running).pop();
	const syxWanted = () => window.gmDev || new URLSearchParams(location.search).get("syxfile") ? null : "no .syx for the run (GEARMULATOR_MDMM_SYX_FILE)";
	const syxValue = (k, end) => `#syxpop [data-sxv="${end}"][data-k="${k}"]`;
	const syxKinds = on => async u => { for (const b of $all("#syxpop [data-syxkind]")) if (b.checked !== on.includes(b.dataset.syxkind)) u.click(b); await sleep(100); };
	const syxCell = id => `#syxpop button[data-syxitem="${id}"]`;
	const openImport = { say: "choose IMPORT SYSEX… in the engine menu: the file's preview", act: u => u.pick("engsel", "import"),
		screen: () => ok(!$1("#syxpop").hidden && !$1("#syxpop").classList.contains("syx-export") && $all('#syxpop button[data-syxitem^="kit:"]').length > 0, "no preview with kits"), within: 8000 };
	const syxExportKinds = {
		name: "mm-lib-syx-export-kinds", proves: ["MM-307", "MM-010"],
		needs: () => window.gmDev ? null : "the save dialog: the page tier only",
		steps: [
			{ say: "choose EXPORT SYSEX… in the engine menu: ALL is ticked, the kinds and the waveforms wait under it", act: u => u.pick("engsel", "export"),
				screen: () => ok(!$1("#syxpop").hidden && $1("#syxpop").classList.contains("syx-export") && !!$1('#syxpop [data-sxk="all"]')?.checked && !!$1(syxValue("wave", "to")), "no export panel with ALL and the waveforms"), within: 6000 },
			{ say: "click Save .syx… with All: every document the editor holds", act: (u, c) => { c.n = syxNews.length; u.click('#syxpop [data-syxgo="save"]'); },
				screen: c => { const m = syxNews.length > c.n && lastExport(); return ok(!!m && m.ok && /every document the editor holds \(/.test(m.text) && $1("#syxpop").hidden, m ? m.text : "no export yet"); }, within: 8000 },
			{ say: "EXPORT SYSEX… again; untick All, untick Patterns and Songs, tick Globals, wheel the kits' last slot down to K04", act: async u => { await u.pick("engsel", "export"); await until(() => !!$1(syxValue("kit", "to")), 6000);
				u.click('#syxpop [data-sxk="all"]'); await sleep(100); u.click('#syxpop [data-sxk="pattern"]'); u.click('#syxpop [data-sxk="song"]'); u.click('#syxpop [data-sxk="global"]'); await sleep(100); u.wheel(syxValue("kit", "to"), -124); },
				screen: () => ok($1(syxValue("kit", "to"))?.textContent === "K04" && !$1('#syxpop [data-sxk="pattern"]').checked && !$1('#syxpop [data-sxk="song"]').checked && $1('#syxpop [data-sxk="global"]').checked, "kits to " + $1(syxValue("kit", "to"))?.textContent), within: 6000 },
			{ say: "tick Waveforms, wheel their last one down to W08", act: async u => { u.click('#syxpop [data-sxk="wave"]'); await sleep(100); u.wheel(syxValue("wave", "to"), -56); },
				screen: () => ok($1(syxValue("wave", "to"))?.textContent === "W08" && /Kits K01–K04 · Globals G1–G8 · Waveforms W01–W08/.test($1("#syxpop .syxsum")?.textContent || ""), "summary " + $1("#syxpop .syxsum")?.textContent) },
			{ say: "click Save .syx…: the waveforms are read from the machine, then the file is written", act: (u, c) => { c.n = syxNews.length; u.click('#syxpop [data-syxgo="save"]'); },
				screen: c => { const m = syxNews.length > c.n && lastExport(); return ok(!!m && m.ok && /^Wrote .*: 4 kits, 8 globals, 2 waveforms\.$/.test(m.text), m ? m.text : "no export yet"); }, within: 20000 }
		],
		async tidy() { $1("#syxpop").hidden = true; }
	};
	const syxVerify = {
		name: "mm-lib-syx-verify", proves: ["MM-308"],
		needs: syxWanted,
		steps: [
			openImport,
			{ say: "click Verify only: the slots are read and compared, nothing is written", act: (u, c) => { c.k0 = kitName(0); u.click('#syxpop [data-syxgo="verify"]'); },
				screen: () => ok(/^Verify only: \d+ of \d+ the same/.test($1("#syxpop .syxsum")?.textContent || "") && /Nothing was written/.test($1("#syxpop .syxsum")?.textContent || ""), "progress: " + ($1("#syxpop .syxsum, #syxpop .syxbar span")?.textContent || "")),
				machine: c => ok(kitName(0) === c.k0, `K01 "${kitName(0)}" (before "${c.k0}")`), within: 60000 },
			{ say: "the file's kits differ from the machine's: the grid marks them ≠ and the summary does not say all the same", act: () => {},
				screen: () => { const outs = $all("#syxpop [data-syxout]").map(d => d.dataset.syxout), s = $1("#syxpop .syxsum")?.textContent || "", m = s.match(/(\d+) of (\d+) the same/);
					return ok(outs.includes("differs") && !!m && +m[1] < +m[2], outs.join(" ") + " / " + s); } },
			{ say: "click Done: the panel closes", act: u => u.click('#syxpop [data-syxgo="close"]'), screen: () => ok($1("#syxpop").hidden, "still open") }
		],
		async tidy() { $1("#syxpop").hidden = true; }
	};
	const syxPlace = {
		name: "mm-lib-syx-place", proves: ["MM-308"],
		needs: syxWanted,
		steps: [
			openImport,
			{ say: "click Specific place, then the first slot four times: the kits land in K05 and K06", act: async u => { u.click('#syxpop [data-sxp="specific"]'); await sleep(150); for (let i = 0; i < 4; i++) { u.click(syxValue("kit", "place")); await sleep(60); } },
				screen: () => ok($1(syxValue("kit", "place"))?.textContent === "K05" && !!$1(syxCell("kit:4")) && !!$1(syxCell("kit:5")) && !$1(syxCell("kit:0")), "cells " + $all('#syxpop button[data-syxitem^="kit:"]').map(b => b.dataset.syxitem).join(" ")), within: 4000 },
			{ say: "leave Kits ticked only, click Import: it asks first (K05 and K06 hold kits)", act: async (u, c) => { await syxKinds(["kit"])(u); c.names = $all('#syxpop button[data-syxitem^="kit:"]').map(b => [+b.dataset.syxitem.split(":")[1], (b.dataset.syxname || "").trim()]); c.k0 = kitName(0); u.click('#syxpop [data-syxgo="start"]'); },
				screen: () => ok(dlgShown() && /K05/.test($1("#dlg").textContent) && !!dlgButton("Import 2"), "no question: " + ($1("#dlg").textContent || "").slice(0, 80)) },
			{ say: "click Import 2: sent on SYSEX RECV to K05 and K06, read back, reported", act: u => u.click(dlgButton("Import 2")),
				screen: () => ok(/2 imported/.test($1("#syxpop .syxsum")?.textContent || ""), "progress: " + ($1("#syxpop .syxsum, #syxpop .syxbar span")?.textContent || "")),
				machine: c => ok(c.names.every(([k, n]) => (kitName(k) || "").trim() === n) && kitName(0) === c.k0, c.names.map(([k, n]) => `K${k + 1} "${kitName(k)}" want "${n}"`).join(", ") + `; K01 "${kitName(0)}"`), within: 90000 },
			{ say: "click Done: the panel closes", act: u => u.click('#syxpop [data-syxgo="close"]'), screen: () => ok($1("#syxpop").hidden, "still open") }
		],
		async tidy() { if (dlgShown()) dlgButton("Cancel")?.click(); $1("#syxpop").hidden = true; }
	};
	/* Reset machine… > Empty reset: the Monomachine has no factory reset in the editor; two questions, then every kit,
	   pattern and song cleared on SYSEX RECV and read back. It empties the machine: the last journey of all */
	const resetEmpty = {
		name: "mm-engine-reset-empty", proves: ["MM-317"],
		steps: [
			{ say: "choose RESET MACHINE… in the engine menu: Empty reset and why no factory reset; Cancel is the default", act: u => u.pick("engsel", "reset"),
				screen: () => ok(dlgShown() && !!dlgButton("Empty reset…") && !dlgButton("Factory reset…") && /factory data is not in the editor/.test($1("#dlg").textContent) && $1("#dlg .btnrow button:last-child")?.textContent === "Cancel", "the question: " + ($1("#dlg").textContent || "").slice(0, 80)) },
			{ say: "click Empty reset…: it asks a second time", act: u => u.click(dlgButton("Empty reset…")),
				screen: () => ok(dlgShown() && !!dlgButton("Clear everything"), "second question: " + ($1("#dlg").textContent || "").slice(0, 80)) },
			{ say: "click Clear everything: the reset runs in the SysEx panel and reports", act: (u, c) => { c.g0 = JSON.stringify(I().doc("global", machine().global?.current ?? 0)); u.click(dlgButton("Clear everything")); },
				screen: () => ok(/Empty reset/.test($1("#syxpop .cap")?.textContent || "") && /cleared/.test($1("#syxpop .syxsum")?.textContent || ""), "panel: " + ($1("#syxpop .syxsum, #syxpop .syxbar span")?.textContent || "")),
				machine: c => { const named = [...Array(128).keys()].filter(k => (kitName(k) || "").trim()), trigs = [...Array(128).keys()].filter(p => (I().doc("pattern", p)?.tracks || []).some(t => (t.trig || []).length)),
					songs = [...Array(24).keys()].filter(s => (songOf(s)?.rows || []).length > 1);
					/* the machine's own empty pattern (16 steps, 1x, kit 1, no swing), and the global as it was */
					const odd = [...Array(128).keys()].filter(p => { const d = I().doc("pattern", p); return !d || d.length !== 16 || ![0, "1X", "1x"].includes(d.multiplier) || d.kit !== 0 || d.swingAmount !== 0; });
					const g = JSON.stringify(I().doc("global", machine().global?.current ?? 0));
					return ok(!named.length && !trigs.length && !songs.length && !odd.length && g === c.g0,
						`${named.length} kits named, ${trigs.length} patterns with trigs, ${songs.length} songs with rows, ${odd.length} patterns not as the machine's empty one (${odd.slice(0, 2).map(p => { const d = I().doc("pattern", p); return JSON.stringify([d?.length, d?.multiplier, d?.kit, d?.swingAmount]); }).join(" ")}), global ${g === c.g0 ? "kept" : "changed"}`); }, within: 400000 },
			{ say: "click Done: the panel closes", act: u => u.click('#syxpop [data-syxgo="close"]'), screen: () => ok($1("#syxpop").hidden, "still open") }
		],
		async tidy() { if (dlgShown()) dlgButton("Cancel")?.click(); $1("#syxpop").hidden = true; }
	};
	/* B-026 / B-031 (the Machinedrum's md-lib-syx-import-mute): import a file with its globals, then mute on the rail and
	   play: the machine holds the mute (its memory, not the page's wish); a track the active global gives no MIDI channel
	   (B-051: base OFF, or beyond CHANNEL SPAN) is refused, and the notice's fix (each track its own channel) makes the next M work. Then the pattern still changes, stopped and
	   playing. The file is the run's (GEARMULATOR_MDMM_SYX_FILE). */
	const globalNow = () => I().doc("global", machine().global?.current ?? 0);
	const reaches = t => { const c = globalNow()?.channels; return !!c && c.base <= 14 && t < c.span && c.base + t <= 14; };
	const railM = t => `#rail .th[data-sel="${t}"] .ms.m`;
	const syxImportMute = {
		name: "mm-lib-syx-import-mute", proves: ["MM-308", "MM-309", "MM-020"],
		needs: () => new URLSearchParams(location.search).get("syxfile") ? null : "no .syx for the run (GEARMULATOR_MDMM_SYX_FILE)",
		steps: [
			{ say: "choose IMPORT SYSEX… in the engine menu, tick Globals too", act: async u => { await u.pick("engsel", "import"); await until(() => !$1("#syxpop").hidden && $all("#syxpop [data-syxkind]").length, 8000); const g = $1('#syxpop [data-syxkind="global"]'); if (g && !g.checked) u.click(g); },
				screen: () => ok(!$1("#syxpop").hidden && !!$1('#syxpop [data-syxkind="global"]')?.checked, "no Globals in the preview"), within: 8000 },
			{ say: "click Import: sent on SYSEX RECV, read back, reported", act: u => u.click('#syxpop [data-syxgo="start"]'), screen: () => ok(/imported/.test($1("#syxpop .syxsum")?.textContent || ""), "progress: " + ($1("#syxpop .syxbar span")?.textContent || "")), within: 900000 },
			{ say: "click Done, Escape, then the Sequence tab", act: async u => { u.click('#syxpop [data-syxgo="close"]'); await sleep(300); u.key("Escape"); await sleep(300); u.click(tab("seq")); if (S().side === "midi") u.click('[data-side="int"]'); },
				screen: () => onTab("seq"), machine: () => ok(!!globalNow() && machine().mutes?.synth != null, "global " + !!globalNow() + ", mutes " + machine().mutes?.synth), within: 8000 },
			{ say: "click M on a track of the rail: its mute flips on the machine; a track with no MIDI channel (B-051) is refused, the notice offers the fix: take it, then M again",
				act: async (u, c) => { c.m0 = synthMutes(); c.t = [0, 1, 2, 3, 4, 5].find(t => !c.m0.includes(t)) ?? 0; c.want = !c.m0.includes(c.t); c.fixed = !reaches(c.t); await sleep(1500); u.click(railM(c.t));
					if (c.fixed) { if (!await until(dlgShown, 4000)) throw new Error("no notice for the refused mute"); u.click(dlgButton("Give each track its own channel")); await until(() => reaches(c.t), 15000); await sleep(3000); u.click(railM(c.t)); } },
				machine: c => ok(synthMuted(c.t) === c.want, `base ${globalNow()?.channels?.base}, span ${globalNow()?.channels?.span}, track ${c.t + 1}${c.fixed ? " (channels given)" : ""}, machine mutes ${synthMutes()} (before ${c.m0})`),
				screen: c => ok(pressed(railM(c.t)) === c.want && !dlgShown(), "M " + (pressed(railM(c.t)) ? "lit" : "not lit")), within: 30000 },
			{ say: "press PLAY: the mute holds", act: u => { tele.steps = []; u.click("#play"); },
				machine: c => ok(new Set(tele.steps).size >= 4 && synthMuted(c.t) === c.want, `machine mutes ${synthMutes()}, steps ${tele.steps.length}`),
				screen: c => ok(pressed(railM(c.t)) === c.want, "M " + (pressed(railM(c.t)) ? "lit" : "not lit")), within: 10000 },
			{ say: "press STOP", act: u => u.click("#play"), machine: () => ok(tele.last && !tele.last.playing, "still playing"), within: 6000 },
			/* B-031: after an import the pattern still changes, stopped and playing */
			{ say: "click › next to the pattern: the machine selects it (stopped)", act: async (u, c) => { c.p0 = cur(); u.click("#patNext"); await confirmIfAsked(u); },
				machine: c => ok(cur() === c.p0 + 1, "machine pattern " + cur()), within: 8000 },
			{ say: "press PLAY, click ‹: the machine moves to it at the pattern's end (playing)", act: async u => { u.click("#play"); await sleep(500); u.click("#patPrev"); await confirmIfAsked(u); },
				machine: c => ok(cur() === c.p0 && S().playing, "machine pattern " + cur() + (S().playing ? ", playing" : ", stopped")), within: 30000 },
			{ say: "press STOP", act: u => u.click("#play"), machine: () => ok(tele.last && !tele.last.playing, "still playing"), within: 6000 }
		],
		async tidy(u, c) { if (dlgShown()) u.key("Escape"); if (S().playing) u.click("#play"); await sleep(300); if (c.t != null && synthMuted(c.t) !== c.m0.includes(c.t)) u.click(railM(c.t)); await sleep(500); }
	};
	/* the Machinedrum's md-seq-os-copy-paste: one note copied and pasted on its track with ⌘C / ⌘V as the operating system
	   delivers them (on macOS JUCE's web view turns them into the copy: and paste: commands, never a keydown), and ⌘Z the
	   same way in */
	const osCopyPaste = {
		name: "mm-seq-os-copy-paste", proves: ["MM-044", "MM-183"], needs: Journey.osKeyPath,
		steps: [
			go("seq"),
			{ say: "pick a synth track with a note and Cmd-click the note: it is selected", act: async (u, c) => {
				c.t = [0, 1, 2, 3, 4, 5].find(t => trigsOf(t).some(inPat)) ?? 0; if (S().side === "midi") u.click('[data-side="int"]'); u.click(rail(c.t)); await sleep(300);
				c.t0 = trigsOf(c.t); c.s = c.t0.find(inPat); c.d = [...Array(S().len).keys()].find(s => !S().tracks[c.t].steps[s] && Math.abs(s - c.s) > 1);
				if (c.d == null) throw new Error("no free step to paste to");
				if (S().stepSel) clearSel(); const p = rollCell(c.t, c.s); u.click(p.c, { cmd: true }, p.fx, p.fy); },
				screen: c => ok(same(S().stepSel, { t: c.t, n: 1, from: c.s, to: c.s + 1 }), "selection " + JSON.stringify(S().stepSel)) },
			{ say: "press Cmd+C on the keyboard (the operating system's way in)", act: async u => { blur(); await u.osKey("focus cmd+c"); },
				screen: () => ok(Keys.seen().includes("cmd+C") && /Copied/.test($1("#toast")?.textContent || ""), "keys that reached the page: " + Keys.seen().join(" ") + "; toast " + $1("#toast")?.textContent), within: 4000 },
			{ say: "Cmd-click an empty step of the same track", act: (u, c) => { const p = rollCell(c.t, c.d); u.click(p.c, { cmd: true }, p.fx, p.fy); }, screen: c => ok(same(S().stepSel, { t: c.t, n: 1, from: c.d, to: c.d + 1 }), "selection " + JSON.stringify(S().stepSel)) },
			{ say: "press Cmd+V on the keyboard: the note lands there", act: u => u.osKey("cmd+v"), screen: c => ok(!!S().tracks[c.t].steps[c.d]?.n, "roll shows nothing there"),
				machine: c => ok(trigsOf(c.t).includes(c.d), "pattern " + trigsOf(c.t).join(",")), within: 15000 },
			{ say: "press Escape, then Cmd+Z on the keyboard: the track as before", act: async u => { blur(); u.key("Escape"); await sleep(200); await u.osKey("cmd+z"); },
				machine: c => ok(same(trigsOf(c.t), c.t0), "pattern " + trigsOf(c.t).join(",")), within: 15000 }
		],
		async tidy(u, c) { if (S().stepSel) clearSel(); if (c.t0 && !same(trigsOf(c.t), c.t0)) await undoUntil(u, () => same(trigsOf(c.t), c.t0)); }
	};
	/* the Machinedrum's md-seq-rotate-undo: a rotate run ends when the page sees Alt up in any event, not only in Alt's own
	   keyup (which may never come: these synthetic chords send none, as a window switch can lose it); the next rotate is
	   then its own undo step */
	const rotateUndo = {
		name: "mm-seq-rotate-undo", proves: ["MM-177"],
		steps: [
			go("seq"),
			{ say: "pick a synth track with notes that a rotate changes", act: (u, c) => { const L = S().len, r = a => a.map(s => s >= L ? s : (s + 1) % L).sort((x, y) => x - y);
				c.t = [0, 1, 2, 3, 4, 5].find(t => trigsOf(t).length && !same(r(trigsOf(t)), trigsOf(t)) && !same(r(r(trigsOf(t))), r(trigsOf(t)))); if (c.t == null) throw new Error("no track a rotate changes");
				c.t0 = trigsOf(c.t); c.t1 = r(c.t0); if (S().side === "midi") u.click('[data-side="int"]'); u.click(rail(c.t)); }, screen: c => ok(S().sel === c.t, "selected " + S().sel) },
			{ say: "press Alt+→: one step later", act: u => { blur(); u.key("ArrowRight", { alt: true }); }, machine: c => ok(same(trigsOf(c.t), c.t1), "notes " + trigsOf(c.t).join(",")), within: 15000 },
			{ say: "press Shift (Alt is up now), then Alt+→ again: another rotate", act: async u => { u.key("Shift"); await sleep(300); u.key("ArrowRight", { alt: true }); }, machine: c => ok(!same(trigsOf(c.t), c.t1), "notes " + trigsOf(c.t).join(",")), within: 15000 },
			{ say: "Cmd+Z: only the second rotate is undone", act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(same(trigsOf(c.t), c.t1), "notes " + trigsOf(c.t).join(",") + ", want " + c.t1.join(",")), within: 15000 },
			{ say: "Cmd+Z: and then the first", act: u => u.key("z", { cmd: true }), machine: c => ok(same(trigsOf(c.t), c.t0), "notes " + trigsOf(c.t).join(",") + ", want " + c.t0.join(",")), within: 15000 }
		],
		async tidy(u, c) { if (c.t0 && !same(trigsOf(c.t), c.t0)) await undoUntil(u, () => same(trigsOf(c.t), c.t0), 4); }
	};
	/* the Machinedrum's md-mix-fader-undo: a LEVEL fader dragged, then Cmd+Z: the kit's level as before */
	const faderUndo = {
		name: "mm-mix-fader-undo", proves: ["MM-014"],
		steps: [
			go("mix"),
			{ say: "drag track 2's LEVEL fader", act: async (u, c) => { c.l0 = wk().levels[1]; const d = c.l0 > 64 ? 1 : -1; await u.drag(strip(1, '.fader[data-g="lev"]'), [[0, d * 8], [0, d * 16], [0, d * 24]]); },
				screen: c => ok($1(strip(1, ".lread")).textContent === String(S().tracks[1].lev) && S().tracks[1].lev !== c.l0, "shows " + $1(strip(1, ".lread")).textContent), machine: c => ok(wk().levels[1] !== c.l0, "kit level " + wk().levels[1]), within: 8000 },
			{ ...undoKey, act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(wk().levels[1] === c.l0, "kit level " + wk().levels[1]), screen: c => ok($1(strip(1, ".lread")).textContent === String(c.l0), "shows " + $1(strip(1, ".lread")).textContent), within: 8000 }
		]
	};
	/* Radek 2026-10-10: ⇧B taps the tempo on every workspace of both editors, Sequence included (B is Draw there) */
	const tapTempoShift = {
		name: "mm-keys-tap-tempo-shift", proves: ["MM-023", "MM-197"],
		steps: [
			go("seq"),
			{ say: "on Sequence tap Shift+B five times, about 0.5 s apart: the tempo follows, Draw stays as it was", act: async (u, c) => { c.b0 = machine().tempo; c.d0 = S().rollDraw; blur(); if (typeof TAP !== "undefined" && TAP.length) await sleep(2100); /* a new run of taps (the page joins taps less than 2 s apart) */ const at = []; for (let i = 0; i < 5; i++) { at.push(performance.now()); u.key("B", { shift: true }); await sleep(500); } c.want = Math.round(60000 / ((at[4] - at[0]) / 4) * 10) / 10; c.note = c.want + " BPM"; },
				screen: c => ok(Math.abs(S().bpm - c.want) <= tapSlack(c.want) && S().rollDraw === c.d0, "BPM " + S().bpm + ", want " + c.want + ", Draw " + S().rollDraw), machine: c => ok(Math.abs(machine().tempo - c.want) <= tapSlack(c.want), "tempo " + machine().tempo + ", want " + c.want), within: 8000 }
		],
		async tidy(u, c) { if (c.b0 != null) { const d = c.b0 > machine().tempo ? -1 : 1; await u.drag("#bpm", [[0, d * 2 * (c.b0 - machine().tempo)]]); } }
	};
	/* the SysEx import panel as screenshots for a design review (scripts/mdmm-shots.sh with MDMM_SHOTS_JOURNEY=mm-shots-import
	   and GEARMULATOR_MDMM_SYX_FILE): the preview's tabs, then the default kinds imported (importing, the report).
	   Each step logs "SHOT <name>" and holds while the script captures the window. */
	const shot = name => Bridge.log("SHOT " + name), hold = 2500;
	const shotsImport = { name: "mm-shots-import", proves: [], needs: () => !/mm-shots/.test(location.search) ? "screenshots only when asked by name" : syxImportJ.needs(),
		steps: [
			{ say: "choose IMPORT SYSEX… in the engine menu: the preview, the Kits tab", act: async u => { await u.pick("engsel", "import"); await until(() => syxKitIds().length > 0, 8000); await sleep(400); shot("import-1-mm-kits"); },
				screen: () => ok(!$1("#syxpop").hidden && syxKitIds().length > 0, "no preview with kits"), within: 10000, hold },
			{ say: "the Songs tab", act: async u => { u.click('#syxpop [data-syxtab="song"]'); await sleep(400); shot("import-2-mm-songs"); }, hold },
			{ say: "the Globals tab", act: async u => { u.click('#syxpop [data-syxtab="global"]'); await sleep(400); shot("import-3-mm-globals"); }, hold },
			{ say: "click Import: importing", act: async u => { u.click('#syxpop [data-syxtab="kit"]'); u.click('#syxpop [data-syxgo="start"]');
				await until(() => parseFloat($1("#syxpop .syxbar i")?.style.width || "0") > 30, 300000); shot("import-4-mm-importing"); },
				screen: () => ok(!!$1("#syxpop .syxbar") || !!$1("#syxpop .syxsum"), "not importing"), within: 305000, hold: 1500 },
			{ say: "the report", act: async () => { await until(() => !!$1("#syxpop .syxsum"), 900000); await sleep(500); shot("import-5-mm-report"); },
				screen: () => ok(/imported/.test($1("#syxpop .syxsum")?.textContent || ""), "no report"), within: 905000, hold },
			{ say: "click Done", act: u => { u.click('#syxpop .syxfoot [data-syxgo="close"]'); shot("done"); }, screen: () => ok($1("#syxpop").hidden, "still open") },
			{ say: "press Escape", act: u => u.key("Escape"), screen: () => ok($1("#libpop").hidden, "open") }
		] };
	/* B-051, F3: GLOBAL › MIDI. CHANNEL SPAN 0 (as an imported 2008 backup has it): T3 has no channel, its mute is refused
	   and its sound value still reaches the machine (a kit dump); span back: the mute lands again. */
	const gSpan = () => I().doc("global", machine().global?.current ?? 0)?.channels?.span;
	const spanTo = async (u, n) => { for (let i = 0; i < 17 && S().glob && S().glob.span !== n; i++) { u.click(`#globpop [data-ga="span"][data-d="${S().glob.span > n ? -1 : 1}"]`); await sleep(120); } };
	const globalChannels = {
		name: "mm-global-channels", proves: ["MM-290", "MM-347"],
		steps: [
			{ say: "click GLOBAL in the top bar: the panel opens with the MIDI channels, the key is lit", act: u => u.click("#globkey"),
				screen: () => ok(!$1("#globpop").hidden && pressed("#globkey") && !!$1('#globpop [data-ga="span"]') && $all("#globpop .gslots button").length === 8, "panel " + ($1("#globpop").hidden ? "closed" : "open")),
				machine: c => { c.s0 = gSpan(); return ok(c.s0 != null, "no global"); } },
			{ say: "click − beside Channel span down to 0: no track has a channel, the panel says so", act: u => spanTo(u, 0),
				machine: () => ok(gSpan() === 0, "span " + gSpan()), screen: () => ok(($1("#globpop .gwarn")?.textContent || "").startsWith("No track has a MIDI channel of its own"), "warning: " + ($1("#globpop .gwarn")?.textContent || "none")), within: 20000 },
			{ say: "press Escape, click track 3's M on the rail: refused, nothing muted, the notice offers the fix", act: async (u, c) => { u.key("Escape"); await sleep(200); u.click(tab("seq")); await sleep(300); c.m0 = synthMutes(); c.t3 = synthMuted(2); c.lit0 = pressed('#rail .th[data-sel="2"] .ms.m'); u.click('#rail .th[data-sel="2"] .ms.m'); },
				/* the M key as it was (a person's pattern may have track 3 muted already) */
				machine: c => ok(same(synthMutes(), c.m0), "machine mutes " + synthMutes()), screen: c => ok(dlgShown() && !!dlgButton("Give each track its own channel") && pressed('#rail .th[data-sel="2"] .ms.m') === c.lit0, `notice ${dlgShown()}, its key ${!!dlgButton("Give each track its own channel")}, M ${pressed('#rail .th[data-sel="2"] .ms.m')} (was ${c.lit0})`), within: 8000 },
			{ say: "click Close", act: u => u.click(dlgButton("Close")), screen: () => ok(!dlgShown(), "notice open") },
			go("mix"),
			{ say: "drag track 3's PAN bar: the machine takes it (a kit dump, no channel)", act: async (u, c) => { c.p0 = wk().tracks[2].pages[1][6]; const d = c.p0 > 64 ? -1 : 1; await u.drag(strip(2, ".pc.pan"), [[d * 8, 0], [d * 16, 0], [d * 24, 0]]); },
				machine: c => ok(wk().tracks[2].pages[1][6] !== c.p0, "PAN " + wk().tracks[2].pages[1][6]), within: 15000 },
			{ ...undoKey, act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(wk().tracks[2].pages[1][6] === c.p0, "PAN " + wk().tracks[2].pages[1][6]), within: 15000 },
			{ say: "click track 3's M again, then Give each track its own channel: CHANNEL SPAN 6", act: async u => { u.click(tab("seq")); await sleep(300); u.click('#rail .th[data-sel="2"] .ms.m'); if (await until(dlgShown, 4000)) u.click(dlgButton("Give each track its own channel")); },
				machine: () => ok(gSpan() === 6, "span " + gSpan()), screen: () => ok(!dlgShown(), "notice open"), within: 20000 },
			{ say: "wait for the channels, click track 3's M: it mutes (unmutes when it was muted)", act: async u => { await sleep(7000); u.click('#rail .th[data-sel="2"] .ms.m'); },
				machine: c => ok(synthMuted(2) === !c.t3, "machine mutes " + synthMutes()), within: 8000 },
			{ say: "click M again", act: u => u.click('#rail .th[data-sel="2"] .ms.m'), machine: c => ok(synthMuted(2) === c.t3, "machine mutes " + synthMutes()) }
		],
		async tidy(u, c) {
			if (dlgShown()) { u.key("Escape"); await sleep(200); }
			if (c.s0 != null && gSpan() !== c.s0) { if ($1("#globpop").hidden) { u.click("#globkey"); await sleep(300); } await spanTo(u, c.s0); await until(() => gSpan() === c.s0, 15000); }
			if (!$1("#globpop").hidden) u.key("Escape");
			if (c.t3 != null && synthMuted(2) !== c.t3) u.click('#rail .th[data-sel="2"] .ms.m');
		}
	};
	/* B-051, F3: GLOBAL › Clear (asked first), and the slot keys */
	const gDoc = () => I().doc("global", machine().global?.current ?? 0);
	const globalReset = {
		name: "mm-global-reset", proves: ["MM-285", "MM-290", "MM-296"],
		steps: [
			{ say: "open GLOBAL, click Tempo out OFF and Channel span −", act: async (u, c) => { c.slot = machine().global?.current ?? 0; u.click("#globkey"); await sleep(300); u.click('#globpop [data-ga="tempoOut"][data-v="0"]'); await sleep(300); u.click('#globpop [data-ga="span"][data-d="-1"]'); },
				machine: () => ok(gDoc()?.controlOut?.clock === 0 && gDoc()?.channels?.span === 5, "clock out " + gDoc()?.controlOut?.clock + ", span " + gDoc()?.channels?.span), within: 20000 },
			{ say: "click Clear: it asks", act: u => u.click('#globpop [data-ga="reset"]'), screen: () => ok(dlgShown() && /Clear GLOBAL \d\? .* factory settings/.test($1("#dlg").textContent), "no question") },
			{ say: "click Clear in the question: the factory global, read back, on the page", act: u => u.click(dlgButton("Clear")),
				machine: () => ok(gDoc()?.controlOut?.clock === 1 && gDoc()?.channels?.span === 6 && gDoc()?.channels?.base === 0, "clock out " + gDoc()?.controlOut?.clock + ", span " + gDoc()?.channels?.span),
				screen: () => ok(pressed('#globpop [data-ga="tempoOut"][data-v="1"]'), "Tempo out not ON"), within: 20000 }
		],
		async tidy(u) { if (dlgShown()) u.click(dlgButton("Cancel")); if (!$1("#globpop").hidden) u.key("Escape"); }
	};
	const globalSlot = {
		name: "mm-global-slot", proves: ["MM-285", "MM-373"],
		steps: [
			{ say: "open GLOBAL, click slot 2: it is active (lit), the machine says so", act: async (u, c) => { c.s0 = machine().global?.current ?? 0; c.to = c.s0 === 1 ? 2 : 1; u.click("#globkey"); await sleep(300); u.click(`#globpop .gslots [data-v="${c.to}"]`); },
				machine: c => ok(machine().global?.current === c.to && !!gDoc(), "active " + machine().global?.current), screen: c => ok(pressed(`#globpop .gslots [data-v="${c.to}"]`), "slot not lit"), within: 15000 },
			{ say: "click the first slot again", act: (u, c) => u.click(`#globpop .gslots [data-v="${c.s0}"]`), machine: c => ok(machine().global?.current === c.s0, "active " + machine().global?.current), within: 15000 }
		],
		async tidy(u, c) { if (c.s0 != null && machine().global?.current !== c.s0) { if ($1("#globpop").hidden) { u.click("#globkey"); await sleep(300); } u.click(`#globpop .gslots [data-v="${c.s0}"]`); await until(() => machine().global?.current === c.s0, 8000); } if (!$1("#globpop").hidden) u.key("Escape"); }
	};
	/* 0.6 (DESIGN-machine-menus.md §2, mm-06): GLOBAL is a page under the header, as wide as it; a workspace tab goes back */
	const globalPage = {
		name: "mm-global-page", proves: ["MM-026"],
		steps: [
			{ say: "click GLOBAL: the page under the header, as wide, the head on one line", act: u => u.click("#globkey"),
				screen: () => { const p = $1("#globpop").getBoundingClientRect(), h = $1("header.top").getBoundingClientRect(), hd = $1("#globpop .gphead").getBoundingClientRect();
					return ok(!$1("#globpop").hidden && p.top >= h.bottom - 1 && Math.abs(p.width - h.width) < 2 && hd.height < 48 && !!$1('#globpop [data-ga="copy"]') && !!$1('#globpop [data-ga="tune"]') && $all('#globpop [data-ga="out1"]').length === 9,
						`page ${Math.round(p.top)}/${Math.round(h.bottom)} ${Math.round(p.width)}/${Math.round(h.width)}, head ${Math.round(hd.height)} px`); } },
			{ say: "click the Mix tab: the page goes, Mix shows", act: u => u.click(tab("mix")), screen: () => $1("#globpop").hidden && !pressed("#globkey") ? onTab("mix") : ok(false, "page still open") }
		],
		async tidy(u) { if (!$1("#globpop").hidden) u.key("Escape"); u.click(tab("seq")); await sleep(200); }
	};
	/* 0.6: GLOBAL has no backdrop; a press outside it closes it and reaches nothing below (the rail: no track picked) */
	const globalClickOut = {
		name: "mm-global-click-out", proves: [],
		steps: [
			go("seq"), sel(0),
			{ say: "open GLOBAL, then press another track on the rail below it (its press, release and click)", act: async (u, c) => {
				c.p0 = trigsOf(0).join(","); c.u0 = machine().history?.undoCount || 0;
				u.click("#globkey"); await sleep(300);
				const e = $1(rail(2)), r = e.getBoundingClientRect();
				const pressOn = (e, x, y) => { for (const [k, T] of [["pointerdown", PointerEvent], ["mousedown", MouseEvent], ["pointerup", PointerEvent], ["mouseup", MouseEvent], ["click", MouseEvent]])
			e.dispatchEvent(new T(k, { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, buttons: k.endsWith("down") ? 1 : 0 })); };
				pressOn(e, r.left + r.width / 2, r.top + r.height / 2); await sleep(300);
			}, screen: () => ok($1("#globpop").hidden && !pressed("#globkey") && S().sel === 0, "page " + ($1("#globpop").hidden ? "closed" : "open") + ", track " + (S().sel + 1) + " selected"),
				machine: c => ok(trigsOf(0).join(",") === c.p0 && (machine().history?.undoCount || 0) === c.u0, `pattern ${trigsOf(0).join(",")} (was ${c.p0}), undo steps ${c.u0} -> ${machine().history?.undoCount || 0}`) }
		],
		async tidy(u) { if (!$1("#globpop").hidden) u.key("Escape"); }
	};
	/* 0.6: Copy and Paste of the active global (globalCopy, globalPaste), asked before the paste, one undo step */
	const globalCopyPaste = {
		name: "mm-global-copy-paste", proves: ["MM-285"],
		steps: [
			{ say: "open GLOBAL, click Copy: Paste is on", act: async (u, c) => { c.slot = machine().global?.current ?? 0; c.c0 = gDoc()?.controlOut?.clock; u.click("#globkey"); await sleep(300); u.click('#globpop [data-ga="copy"]'); },
				screen: () => ok(!$1('#globpop [data-ga="paste"]')?.disabled, "Paste off"), machine: c => ok(c.c0 != null, "no global") },
			{ say: "click Tempo out the other way", act: (u, c) => u.click(`#globpop [data-ga="tempoOut"][data-v="${c.c0 ? 0 : 1}"]`), machine: c => ok(gDoc()?.controlOut?.clock === (c.c0 ? 0 : 1), "clock out " + gDoc()?.controlOut?.clock), within: 20000 },
			{ say: "click Paste: it asks", act: u => u.click('#globpop [data-ga="paste"]'), screen: () => ok(dlgShown() && /Paste over GLOBAL \d/.test($1("#dlg").textContent), "no question"), within: 6000 },
			{ say: "click Paste in the question: the copied global is back", act: u => u.click(dlgButton("Paste")), machine: c => ok(gDoc()?.controlOut?.clock === c.c0, "clock out " + gDoc()?.controlOut?.clock), within: 20000 },
			{ ...undoKey, say: "press Cmd+Z: the paste is undone", machine: c => ok(gDoc()?.controlOut?.clock === (c.c0 ? 0 : 1), "clock out " + gDoc()?.controlOut?.clock), within: 20000 }
		],
		async tidy(u, c) { if (dlgShown()) u.click(dlgButton("Cancel")); if (c.c0 != null && gDoc()?.controlOut?.clock !== c.c0) { if ($1("#globpop").hidden) { u.click("#globkey"); await sleep(300); } u.click(`#globpop [data-ga="tempoOut"][data-v="${c.c0}"]`); await until(() => gDoc()?.controlOut?.clock === c.c0, 15000); } if (!$1("#globpop").hidden) u.key("Escape"); }
	};
	/* 0.6: AUDIO › MASTER TUNE (masterTune: tenths of Hz) and CONTROL OUT1 (PROBES-manual-gaps.md P2) on the GLOBAL page */
	const globalTune = {
		name: "mm-global-tune", proves: ["MM-287", "MM-369"],
		steps: [
			{ say: "open GLOBAL, click + beside Master tune: 0.1 Hz up", act: async (u, c) => { c.t0 = gDoc()?.masterTune; u.click("#globkey"); await sleep(300); u.click('#globpop [data-ga="tune"][data-d="1"]'); },
				machine: c => ok(gDoc()?.masterTune === c.t0 + 1, "tune " + gDoc()?.masterTune), screen: c => ok(($1('#globpop [data-ga="tune"][data-d="1"]')?.previousElementSibling?.textContent || "") === ((c.t0 + 1) / 10).toFixed(1) + " Hz", "shows " + $1('#globpop [data-ga="tune"][data-d="1"]')?.previousElementSibling?.textContent), within: 20000 },
			{ say: "Shift-click −: 1 Hz down", act: u => u.click('#globpop [data-ga="tune"][data-d="-1"]', { shift: true }), machine: c => ok(gDoc()?.masterTune === c.t0 - 9, "tune " + gDoc()?.masterTune), within: 20000 },
			{ ...undoKey, say: "press Cmd+Z twice: the tune as before", act: async u => { u.key("z", { cmd: true }); await sleep(500); u.key("z", { cmd: true }); }, machine: c => ok(gDoc()?.masterTune === c.t0, "tune " + gDoc()?.masterTune), within: 20000 }
		],
		async tidy(u) { if (!$1("#globpop").hidden) u.key("Escape"); }
	};
	const globalControlOut = {
		name: "mm-global-control-out", proves: ["MM-295", "MM-250"],
		steps: [
			{ say: "open GLOBAL, click OUT for Sequencer: the global says so, the page warns the tracks play no sound", act: async (u, c) => { c.o0 = gDoc()?.controlOut?.sequencer; u.click("#globkey"); await sleep(300); u.click('#globpop [data-ga="out1"][data-k="sequencerOut"][data-v="1"]'); },
				machine: () => ok(gDoc()?.controlOut?.sequencer === 1, "sequencer " + gDoc()?.controlOut?.sequencer),
				screen: () => ok(pressed('#globpop [data-ga="out1"][data-k="sequencerOut"][data-v="1"]') && /Sequencer plays no sound here/.test($1("#globpop").textContent), "warning: " + ($all("#globpop .gwarn").map(w => w.textContent).join(" | ") || "none")), within: 20000 },
			{ say: "click INT+OUT for Keyboard, then INT for Sequencer: no warning", act: async u => { u.click('#globpop [data-ga="out1"][data-k="keyboardOut"][data-v="2"]'); await sleep(400); u.click('#globpop [data-ga="out1"][data-k="sequencerOut"][data-v="0"]'); },
				machine: () => ok(gDoc()?.controlOut?.sequencer === 0 && gDoc()?.controlOut?.keyboard === 2, "sequencer " + gDoc()?.controlOut?.sequencer + ", keyboard " + gDoc()?.controlOut?.keyboard),
				screen: () => ok(!/plays no sound here/.test($1("#globpop").textContent), "a warning"), within: 20000 }
		],
		async tidy(u, c) { if (c.o0 != null && gDoc()?.controlOut?.sequencer !== c.o0) { if ($1("#globpop").hidden) { u.click("#globkey"); await sleep(300); } u.click(`#globpop [data-ga="out1"][data-k="sequencerOut"][data-v="${c.o0}"]`); await until(() => gDoc()?.controlOut?.sequencer === c.o0, 15000); } if (!$1("#globpop").hidden) u.key("Escape"); }
	};
	/* B-051: the GLOBAL panel as a screenshot (scripts/mdmm-shots.sh with MDMM_SHOTS_JOURNEY=mm-shots-global) */
	const shotsGlobal = { name: "mm-shots-global", proves: [], needs: () => !/mm-shots/.test(location.search) ? "screenshots only when asked by name" : null,
		steps: [{ say: "open GLOBAL", act: async u => { u.click("#globkey"); await sleep(800); shot("global-mm"); }, screen: () => ok(!$1("#globpop").hidden, "closed"), hold },
			{ say: "Esc", act: u => { u.key("Escape"); shot("done"); } }] };
	/* B-056: the GEN bar's room, R and Defaults inside the bar in Random and in Euclid (the roll's Draw and length keys
	   beside it): a MEASURE line each, with the bar's fit step (76-gen.js genBarFit) and the page's text floor (what 9 px
	   text becomes: more on a page zoomed below 100 %, where WebKit raises 9 to 15 px text, as in --background's small
	   window). mm-gen-bar-fit in every run, mm-shots-sound with its snapshots. */
	const genRoom = () => { const b = $1("#genband").getBoundingClientRect(), k = $1("#genband .gkeys").getBoundingClientRect(); return Math.round(b.right - k.right); };
	const textFloor = () => { const x = document.createElement("span"); x.style.fontSize = "9px"; document.body.appendChild(x); const v = parseFloat(getComputedStyle(x).fontSize); x.remove(); return v.toFixed(2); };
	const genBarFits = (label, snap = false) => ({ say: `the GEN bar on ${label}: Random and Euclid, R and Defaults inside the bar`, act: async (u, c) => {
		c.room = []; c.cut = [];
		const w = e => Math.round(e.getBoundingClientRect().width), parts = q => $1(q) ? [...$1(q).children].map(e => (e.className || e.tagName).split(" ")[0] + "=" + w(e)).join(" ") : "-";
		for (const kind of ["random", "euclid"]) {
			u.click(`[data-genkind="${kind}"]`); await sleep(400);
			const room = genRoom(), fit = [...$1(".genbar").classList].filter(k => /^fit\d$/.test(k)).pop() || "fit0";
			c.room.push(`${kind} ${room} (${fit})`); if (room < -1) c.cut.push(kind);
			Bridge.log(`MEASURE gen-mm ${label} ${kind} room ${room} ${fit} groups cut ${(fl => fl ? fl.scrollWidth - fl.clientWidth : "-")($1("#genband .gflow"))} text floor ${textFloor()} at ${innerWidth} x ${innerHeight} bar [${parts(".genbar")}] groups [${parts("#genband .gflow")}]`);
			if (snap) { await sleep(400); Journey.snapshot(kind === "euclid" ? "gen-mm" : "gen-mm-" + kind); }
		} },
		screen: c => ok(!c.cut.length, "R and Defaults cut off: " + c.room.join(", ")) });
	const genBarFit = { name: "mm-gen-bar-fit", proves: [],
		steps: [go("seq"), sel(0), genBarFits("track 1"),
			{ say: "click MIDI: a MIDI track", act: u => u.click('[data-side="midi"]'), screen: () => ok(S().side === "midi" && S().sel >= 6, `side ${S().side}, track ${S().sel}`) },
			genBarFits("a MIDI track"),
			{ say: "click SYNTH: back", act: u => u.click('[data-side="int"]'), screen: () => ok(S().side !== "midi" && S().sel < 6, `side ${S().side}`) }] };
	/* 0.5 slice 5: the Sound page and the GEN bar as screenshots, beside the Machinedrum Editor's (md-shots-sound) */
	const shotsSound = { name: "mm-shots-sound", proves: [], needs: () => !/mm-shots/.test(location.search) ? "screenshots only when asked by name" : null,
		steps: [go("sound"), sel(0),
			{ say: "the Sound page", act: async () => { await sleep(800); shot("sound-mm"); Journey.snapshot("sound-mm"); Bridge.log("MEASURE sound-mm screens " + [...document.querySelectorAll(".snd .sg>.plot")].map(e => Math.round(e.getBoundingClientRect().height)).join(" ") + " page " + Math.round(document.querySelector(".snd").scrollHeight) + "/" + Math.round(document.querySelector("#main").clientHeight)); }, hold },
			go("seq"), genBarFits("track 1", true),
			{ say: "the GEN bar", act: async () => { await sleep(400); shot("gen-mm"); }, hold },
			{ say: "done", act: () => shot("done") }] };
	/* B-054: every view, as macOS 12's WebKit 15 lays it out (Journey.viewJourneys: mm-old-webkit in every run,
	   mm-shots-views for scripts/mdmm-snap.py --safari15) */
	const ws = (name, extra, w = name) => ({ name, open: async u => { u.click(tab(w)); await until(() => S().ws === w, 3000); if (extra) await extra(u); } });
	const esc1 = async u => { u.key("Escape"); await sleep(200); };
	const viewJs = Journey.viewJourneys("mm", [
		ws("seq"), ws("seq-arp", async u => { u.click('[data-dock="arp"]'); }, "seq"), ws("sound", async u => { u.click(tab("seq")); await sleep(200); u.click('[data-dock="locks"]'); u.click(tab("sound")); await sleep(200); u.click(rail(0)); }),
		ws("mix"), ws("perform"), ws("song"),
		{ name: "kits", open: u => u.click("#kitf"), close: esc1 },
		{ name: "patterns", open: u => u.click("#pat"), close: esc1 },
		{ name: "global", open: u => u.click("#globkey"), close: esc1 },
		{ name: "audio", needs: () => { const o = $1('#engsel option[value="audio"]'); return o && !o.hidden && !o.disabled ? null : "no AUDIO / MIDI here (the plug-in in a host)"; }, open: u => { blur(); u.key(","); }, close: esc1 },
		{ name: "syx-import", needs: syxImportJ.needs, open: async u => { await u.pick("engsel", "import"); await until(() => syxKitIds().length > 0, 8000); },
			close: async u => { $1('#syxpop [data-syxgo="close"]')?.click(); await sleep(200); await esc1(u); } },
		{ name: "keys", open: u => { blur(); u.key("?", { shift: true }); }, close: esc1 },
		{ name: "menu", open: u => Journey.menu.via(u), close: async () => closeDeskMenu() },
		{ name: "cpu", open: u => u.click("#cpumeter"), close: async () => closeDeskMenu() },
		{ name: "step-menu", open: async u => { u.click(tab("seq")); await sleep(300); const t = [0, 1, 2, 3, 4, 5].find(x => trigsOf(x).length) ?? 0; const p = rollCell(t, trigsOf(t)[0] ?? 0); u.rightClick(p.c, {}, p.fx, p.fy); },
			close: async () => { closeDeskMenu(); if (S().stepSel) clearSel(); } },
		{ name: "rom-card", open: u => u.pick("engsel", "rom"), close: async u => { u.click('#bootcard [data-bootrom="close"]'); await sleep(300); } }
	]);
	/* I-008: the editor's menu (shared/deskJourney.js editorMenuJourney), as the Machinedrum's */
	const editorMenuJ = { ...Journey.editorMenuJourney("mm-top-editor-menu", "Monomachine Editor"), proves: [] };
	/* I-018: the CPU meter beside the version and its details, as the Machinedrum's */
	const cpuJs = [...Journey.cpuMeterJourneys("mm"), Journey.speedUpsMenuJourney("mm")];
	/* I-021: the output meter and volume at the LCD's right end, as the Machinedrum's */
	const volJs = [...Journey.volumeJourneys("mm"), ...Journey.fitJourneys("mm", ["seq", "sound", "mix", "perform", "song"])];

	/* ---------- wave 2: the transport beyond PLAY and STOP (doc/modern-ux/DESIGN-machine-menus.md §2) ---------- */
	const paused = () => $1("#play")?.classList.contains("paused");
	const playing = () => !!tele.last?.playing;
	const stopAll = async u => { if (S().paused || S().playing) { u.click("#play"); await sleep(200); } if (S().playing) { u.click("#play"); await until(() => !playing(), 3000); } };
	const pauseJ = {
		name: "mm-top-pause", proves: ["MM-040", "MM-065", "MM-072", "MM-256"],
		steps: [
			{ say: "press PLAY", act: u => { tele.steps = []; u.click("#play"); }, machine: () => ok(playing() && new Set(tele.steps).size >= 3, "telemetry " + tele.steps.join(",")), within: 6000 },
			{ say: "⇧-click ▶: it pauses, ▶ blinks, the position stays", act: u => u.click("#play", { shift: true }),
				screen: c => ok(paused() && /^\d\d\.\d\d$/.test(c.pos = $1("#pos").textContent), "paused " + paused() + ", POSITION " + $1("#pos").textContent),
				machine: () => ok(!playing(), "still playing"), within: 3000 },
			{ say: "wait: the step holds", act: async (u, c) => { c.held = S().paused?.step; await sleep(700); }, screen: c => ok(paused() && $1("#pos").textContent === c.pos, "POSITION " + $1("#pos").textContent + ", was " + c.pos),
				machine: () => ok(!playing(), "it moved on") },
			{ say: "click ▶: it goes on from the step it held", act: u => { tele.steps = []; u.click("#play"); },
				screen: () => ok(!paused() && S().playing, "paused " + paused()),
				machine: c => ok(playing() && tele.steps.length >= 2 && (tele.steps[0] === c.held || tele.steps[0] === c.held + 1), `steps after ${c.held + 1}: ${tele.steps.map(s => s + 1).join(",")}`), within: 4000 },
			{ say: "⇧Space: paused again; ⇧Space: it plays on", act: async u => { blur(); u.key(" ", { shift: true }); await until(paused, 2000); u.key(" ", { shift: true }); },
				screen: () => ok(!paused() && S().playing, "paused " + paused()), machine: () => ok(playing(), "not playing"), within: 4000 },
			{ say: "⇧-click ▶, then Stop from the ▾ menu: the pause ends, the position goes", act: async u => { u.click("#play", { shift: true }); await until(paused, 2000); u.click("#playmore"); await until(() => !!$1('#deskmenu [data-mid="play"]'), 2000); u.click('#deskmenu [data-mid="play"]'); },
				screen: () => ok(!paused() && !S().playing && $1("#pos").textContent === "--.--", "POSITION " + $1("#pos").textContent), machine: () => ok(!playing(), "playing"), within: 3000 }
		],
		async tidy(u) { await stopAll(u); }
	};
	const panicJ = {
		name: "mm-top-panic", proves: ["MM-041", "MM-361"],
		steps: [
			{ say: "press PLAY", act: u => u.click("#play"), machine: () => ok(playing(), "not playing"), within: 6000 },
			{ say: "click the ▾ in the ▶ key's corner: the transport menu, Panic in it", act: u => u.click("#playmore"),
				screen: () => ok(!!$1('#deskmenu [data-mid="panic"]') && !$1('#deskmenu [data-mid="panic"]').disabled && !!$1('#deskmenu [data-mid="record"]'), "menu " + ($1("#deskmenu")?.textContent || "none")), within: 2000 },
			{ say: "click Panic: every note off and STOP", act: u => u.click('#deskmenu [data-mid="panic"]'),
				screen: () => ok(!$1('#deskmenu [data-mid="panic"]') && !S().playing, "playing " + S().playing), machine: () => ok(!playing() && results.some(r => r.op === "panic" && r.ok), "playing " + playing()), within: 3000 },
			{ say: "PLAY, then right-click ▶: the same menu; Escape closes it; ⌘.: panic", act: async u => { u.click("#play"); await until(playing, 4000); u.rightClick("#play"); await until(() => !!$1('#deskmenu [data-mid="panic"]'), 2000); u.key("Escape"); await until(() => !$1('#deskmenu [data-mid="panic"]'), 1000); blur(); u.key(".", { cmd: true }); },
				machine: () => ok(!playing(), "playing"), screen: () => ok(!S().playing && !$1("#deskmenu [data-mid]"), "menu or play"), within: 3000 }
		],
		async tidy(u) { if (typeof closeDeskMenu === "function") closeDeskMenu(); await stopAll(u); }
	};
	const tempoWindowJ = {
		name: "mm-top-tempo-window", proves: ["MM-194", "MM-196", "MM-198"],
		steps: [
			{ say: "click the tempo on the LCD (no drag): the TEMPO window", act: (u, c) => { c.b0 = machine().tempo; u.click("#bpm"); },
				screen: () => ok(!!$1("#tempopop") && $1("#tpv")?.textContent === S().bpm.toFixed(1) && !!$1('#tempopop [data-tp="sync:int"]'), "pop-up " + ($1("#tpv")?.textContent || "none")), within: 2000 },
			{ say: "click +: one BPM faster", act: u => u.click('#tempopop [data-tp="1"]'),
				screen: c => ok(parseFloat($1("#bpm").textContent) === lcdBpm(c.b0 + 1), "LCD " + $1("#bpm").textContent), machine: c => ok(Math.abs(machine().tempo - (c.b0 + 1)) < 0.05, "tempo " + machine().tempo), within: 4000 },
			{ say: "click −: back", act: u => u.click('#tempopop [data-tp="-1"]'), machine: c => ok(Math.abs(machine().tempo - c.b0) < 0.05, "tempo " + machine().tempo), within: 4000 },
			{ say: "hold −10 %: the machine 10 % slower while held", act: () => $1('#tempopop [data-tp="n-"]').dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, pointerType: "mouse", isPrimary: true })),
				machine: c => ok(Math.abs(machine().tempo - DeskTransport.nudged(c.b0, -10)) < 0.05, "tempo " + machine().tempo), screen: c => ok(parseFloat($1("#bpm").textContent) === DeskTransport.nudged(c.b0, -10), "LCD " + $1("#bpm").textContent), within: 4000 },
			{ say: "let go: back to the tempo it was", act: () => $1('#tempopop [data-tp="n-"]').dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, pointerType: "mouse", isPrimary: true })),
				machine: c => ok(Math.abs(machine().tempo - c.b0) < 0.05, "tempo " + machine().tempo), within: 4000 },
			{ say: "click EXT: the machine follows MIDI clock (GLOBAL › Sync › Tempo in); INT: its own tempo again", act: async u => { u.click('#tempopop [data-tp="sync:ext"]'); await until(() => I().doc("global", machine().global?.current ?? 0)?.controlIn?.tempoSync === 1, 6000); u.click('#tempopop [data-tp="sync:int"]'); },
				machine: () => ok(I().doc("global", machine().global?.current ?? 0)?.controlIn?.tempoSync === 0, "tempo sync " + I().doc("global", machine().global?.current ?? 0)?.controlIn?.tempoSync), within: 8000 },
			{ say: "press Escape: it closes", act: u => u.key("Escape"), screen: () => ok(!$1("#tempopop"), "still open") }
		],
		async tidy() { DeskTransport.closeTempo(); }
	};
	const tempoReleaseJ = {
		name: "mm-top-tempo-release", proves: ["MM-195"],
		steps: [
			{ say: "⌥-drag the tempo up: the LCD follows, the machine's tempo changes at the release", act: async (u, c) => { c.b0 = machine().tempo; c.n = sent.length; await u.drag("#bpm", [[0, -6], [0, -12], [0, -18], [0, -24]], { alt: true }); },
				machine: c => ok(machine().tempo > c.b0 && sent.slice(c.n).filter(o => o === "tempo").length === 1, "tempo " + machine().tempo + ", sent " + sent.slice(c.n).join(",")), within: 4000 }
		],
		async tidy(u, c) { if (c.b0 != null && Math.abs(machine().tempo - c.b0) >= 0.05) HOST.tempo(c.b0); await sleep(300); }
	};
	const playFromJ = {
		name: "mm-song-play-from", proves: ["MM-258", "MM-270", "MM-256"],
		steps: [
			go("song"),
			{ say: "the song the machine plays, Arrange; click row 3, then ▶ From here: the question to set TRANSPORT IN to ACCEPT", act: async (u, c) => { c.m0 = machine().song?.songMode === true; c.slot0 = S().songs?.slot; if (S().songs?.slot !== machine().song?.current) await choose(u, "songsel", machine().song?.current ?? 0); u.click('[data-set="songpick"] button[data-v="song"]'); await sleep(200); u.click('.scell[data-i="2"]'); await sleep(150); u.click('[data-rowact="from"]'); },
				screen: () => ok(dlgShown() && !!dlgButton("Set TRANSPORT to ACCEPT"), "no question"), within: 4000 },
			{ say: "confirm: ACCEPT goes to the machine, then the song plays from row 3 by itself, in SONG mode", act: u => u.click(dlgButton("Set TRANSPORT to ACCEPT")),
				machine: () => ok(playing() && tele.last.songRow === 2 && machine().song?.songMode === true, "row " + (tele.last?.songRow + 1) + ", playing " + playing() + ", song mode " + machine().song?.songMode + ", TRANSPORT IN " + I().doc("global", machine().global?.current ?? 0)?.controlIn?.transport), within: 20000 },
			{ say: "click row 2 and press Enter: from row 2", act: async u => { u.click('.scell[data-i="1"]'); await sleep(150); blur(); u.key("Enter"); },
				machine: () => ok(playing() && tele.last.songRow === 1, "row " + (tele.last?.songRow + 1)), within: 8000 }
		],
		async tidy(u, c) { await stopAll(u); if (!c.m0 && machine().song?.songMode === true) { u.click('[data-seqmode="pattern"]'); await sleep(1500); } }
	};

	/* ---------- 0.6 wave 4: COPY / PASTE / CLEAR what (skins/shared/deskWhat.js, the mockup's 78-what.js) ---------- */
	const whatShown = () => !$1("#dlg").hidden && !!$1("#dlg .what");
	const whatTicked = () => $all("#dlg .what input[data-wid]:checked").map(x => x.dataset.wid);
	const whatTick = (u, want) => { for (const x of $all("#dlg .what input[data-wid]")) if (!x.disabled && x.checked !== want.includes(x.dataset.wid)) u.click(x); };
	const whatPick = (verb, shot) => ({ say: `click ▾ beside COPY CLR PASTE, then ${verb[0].toUpperCase() + verb.slice(1)}…`,
		act: async u => { u.click("[data-secwhat]"); await until(() => DeskMenu.shown, 1500); u.click(`#deskmenu [data-mid="${verb}"]`); if (shot && await until(whatShown, 1500)) shot(false); },
		screen: () => ok(whatShown() && $1("#dlg .what h3")?.textContent.toLowerCase() === verb + " what", "dialog " + ($1("#dlg h3")?.textContent || "none")) });
	const trackOf = t => patDoc()?.tracks[t];
	const partsOf = t => { const x = trackOf(t); return x && JSON.stringify([x.trig, x.amp, x.notes, x.slide, x.swing, x.arp, x.transpose]); };
	const copyWhat = {
		name: "mm-seq-copy-what", proves: ["MM-187", "MM-191", "MM-221", "MM-232", "MM-234"],
		steps: [
			go("seq"),
			{ say: "pick a synth track with notes, and another synth track", act: (u, c) => {
				c.a = [0, 1, 2, 3, 4, 5].find(t => trigsOf(t).length) ?? 0; c.b = [0, 1, 2, 3, 4, 5].find(t => t !== c.a && partsOf(t) !== partsOf(c.a)) ?? (c.a + 1) % 6;
				c.pb = partsOf(c.b); c.kb = kitT(c.b); if (S().side === "midi") u.click('[data-side="int"]'); u.click(rail(c.a)); },
				screen: c => ok(S().sel === c.a, "selected " + S().sel), machine: c => ok(trigsOf(c.a).length > 0, "no notes") },
			whatPick("copy", m => m || Journey.snapshot("mm-copy-what")),
			{ say: "tick Notes, Slide, Swing, Arp, Transpose and Machine + sound, click Copy", act: u => { whatTick(u, ["notes", "slide", "swing", "arp", "transpose", "sound"]); u.click("#dlg [data-wgo]"); },
				screen: () => ok(!whatShown(), "still open") },
			{ say: "pick the other track", act: (u, c) => u.click(rail(c.b)), screen: c => ok(S().sel === c.b, "selected " + S().sel) },
			{ ...whatPick("paste", m => m || Journey.snapshot("mm-paste-what")), screen: c => ok(whatShown() && same($all("#dlg [data-wto][aria-pressed=true]").map(b => +b.dataset.wto), [c.b])
				&& $all("#dlg [data-wto]").filter(b => +b.dataset.wto >= 6).every(b => b.disabled), "keys " + $all("#dlg [data-wto][aria-pressed=true]").map(b => b.dataset.wto)) },
			{ say: "click Paste into 1 track: its notes, slide, swing, arp, transpose and machine are the first track's", act: u => u.click("#dlg [data-wgo]"),
				machine: c => { const a = trackOf(c.a), b = trackOf(c.b); return ok(a && b && same(b.trig, a.trig) && same(b.notes, a.notes) && same(b.slide, a.slide) && same(b.swing, a.swing)
					&& same(b.arp, a.arp) && b.transpose === a.transpose && wk()?.tracks[c.b].machine === wk()?.tracks[c.a].machine, "track " + JSON.stringify(b)); }, within: 10000 },
			{ say: "press Cmd+Z: one undo step, the track is as before", act: u => { blur(); u.key("z", { cmd: true }); },
				machine: c => ok(partsOf(c.b) === c.pb && kitT(c.b) === c.kb, "track " + partsOf(c.b)), within: 10000 }
		]
	};
	const clearWhat = {
		name: "mm-seq-clear-what", proves: ["MM-188", "MM-192"],
		steps: [
			go("seq"),
			{ say: "pick a synth track with notes", act: (u, c) => { c.a = [0, 1, 2, 3, 4, 5].find(t => trigsOf(t).length) ?? 0; c.p0 = partsOf(c.a); c.s0 = slidesOf(c.a);
				if (S().side === "midi") u.click('[data-side="int"]'); u.click(rail(c.a)); }, screen: c => ok(S().sel === c.a, "selected " + S().sel) },
			{ say: "press Cmd+Shift+Backspace: Clear what opens", act: u => { blur(); u.key("Backspace", { cmd: true, shift: true }); },
				screen: () => ok(whatShown() && $1("#dlg .what h3")?.textContent === "Clear what", "dialog " + ($1("#dlg h3")?.textContent || "none")) },
			{ say: "tick Notes alone and click Clear: the notes go, the slides stay", act: u => { whatTick(u, ["notes"]); u.click("#dlg [data-wgo]"); },
				machine: c => ok(!trigsOf(c.a).length && same(slidesOf(c.a), c.s0), `trigs ${trigsOf(c.a)}, slides ${slidesOf(c.a)}`), within: 10000 },
			{ ...undoKey, machine: c => ok(partsOf(c.a) === c.p0, "track " + partsOf(c.a)), within: 10000 }
		]
	};

	/* ======================= 0.6 slice 5 (Monomachine): journeys for the rows that had none (doc/features/unproved-mm.md) =======================
	   Page tier (no ROM): the editor's real core behind deskStubHost. A "machine" check reads the core's documents; the
	   stub also hands the device edge's messages back as {type: "wire"} (what the wire engine would put on the cable: the CC
	   number and the channel, the NRPN, the notes, the SysEx), so a journey can check what the machine would receive. */
	const nonSys = n0 => wireLog.filter(w => w.seq > n0 && w.kind !== "sysex");
	const hex2 = w => w.b.map(x => x.toString(16).padStart(2, "0")).join(" ");
	const baseCh = () => gDoc()?.channels?.base ?? 0;
	/* every value of the working kit that a Sound edit can reach, as flat cells (a changed cell names where) */
	const kitCells = () => { const o = {}, k = wk(); k.tracks.forEach((tr, t) => { tr.pages.forEach((pg, p) => pg.forEach((v, i) => { o[`T${t + 1}.${p}.${i}`] = v; })); o["lev" + (t + 1)] = k.levels[t]; o["in" + (t + 1)] = tr.input; o["out" + (t + 1)] = tr.outputs; o["mach" + (t + 1)] = tr.machineName; }); return o; };
	const cellDiff = (a, b) => Object.keys(b).filter(k => a[k] !== b[k]);
	const histN = () => machine().history?.undoCount || 0;
	const undoTo = async (u, n0) => { for (let i = 0; i < 500 && histN() > n0; i++) { const k = histN(); blur(); u.key("z", { cmd: true }); if (!await until(() => histN() < k, 4000)) break; } await sleep(300); };
	/* the strings a canvas draws (its labels): the page's drawing run once on it with fillText watched */
	const canvasTexts = c => { const f0 = CanvasRenderingContext2D.prototype.fillText, out = []; CanvasRenderingContext2D.prototype.fillText = function (t, ...r) { out.push(String(t)); return f0.call(this, t, ...r); }; try { drawEd(c); } finally { CanvasRenderingContext2D.prototype.fillText = f0; } return out; };
	/* a value box (page g, index i): its element, meta and the kit's cell of track t */
	const box = (g, i) => $1(`#main .pc[data-g="${g}"][data-n="${i}"]`);
	const cellOf = (t, g, i) => wk().tracks[t].pages[PAGES.indexOf(g)][i];
	/* press an arrow on a value box and read back: what moved in the kit, the wire's CC, the box's text */
	async function nudgeBox(u, t, g, i) {
		const el = box(g, i); if (!el) return { err: `no box ${g}.${i}` };
		const v0 = cellOf(t, g, i), m = ref(el)[2], mx = maxOf(m), before = kitCells(), w0 = wireSeq;
		el.focus(); u.key(v0 >= mx ? "ArrowDown" : "ArrowUp");
		if (!await until(() => cellOf(t, g, i) !== v0, 3000)) return { err: `${g}.${i} stayed ${v0}` };
		const v1 = cellOf(t, g, i); await until(() => nonSys(w0).some(w => w.kind === "cc"), 2000); await sleep(120);
		return { v0, v1, moved: cellDiff(before, kitCells()), cc: nonSys(w0).filter(w => w.kind === "cc"), text: valueText(`#main .pc[data-g="${g}"][data-n="${i}"]`), name: el.getAttribute("aria-label") };
	}
	/* the Monomachine manual's CC numbers of the DATA pages (Appendix B): SYN 48-55, AMP 56-63, FLT 72-79, EFX 80-87, LFO 1 88-95, LFO 2 104-111, LFO 3 112-119 */
	const CC_BASE = { SYN: 48, AMP: 56, FLT: 72, EFX: 80, LF1: 88, LF2: 104, LF3: 112 };
	/* did the box's edit reach its own cell, only that cell, and the wire as the one CC the manual names, on the track's channel? */
	const checkBox = (r, t, g, i) => {
		if (r.err) return r.err;
		const want = `T${t + 1}.${PAGES.indexOf(g)}.${i}`;
		if (r.moved.length !== 1 || r.moved[0] !== want) return `${g}.${i}: moved ${r.moved.join(",") || "nothing"}`;
		const cc = r.cc.map(w => w.b);
		if (cc.length !== 1 || cc[0][0] !== (0xb0 | (baseCh() + t)) || cc[0][1] !== CC_BASE[g] + i || cc[0][2] !== r.v1) return `${g}.${i}: wire ${r.cc.map(hex2).join(" | ") || "nothing"}, wanted b${(baseCh() + t).toString(16)} ${(CC_BASE[g] + i).toString(16)} ${r.v1.toString(16)}`;
		return null;
	};
	/* ---- Appendix A: every machine of the manual, picked on a track, with the knobs the manual lists, in its order; each knob moves its own cell and sends its own CC ---- */
	const MANUAL_MACHINES = [
		["SWAVE-SAW", "UNIL UNIW UNIX SUBX SUB1 SUB2 TUNE"], ["SWAVE-PULS", "UNIL UNIW SUB1 SUB2 PW PWAD PWRS TUNE"], ["SWAVE-ENS", "PCH2 PCH3 PCH4 WAVE PW CHRL CHRW TUNE"],
		["SID-6581", "PW PWAD PWRS WAVE MOD MSRC MFRQ TUNE"], ["DPRO-WAVE", "WAVE WP WPM WPRS SYNC SFRQ TUNE"], ["DPRO-BBOX", "PTCH STRT RTRG RTIM"],
		["DPRO-DDRW", "WAV1 MIX WAV2 TIME BR1 WID BR2 TUNE"], ["DPRO-DENS", "PCH2 PCH3 PCH4 WAVE CHRL CHRW TUNE"],
		["FM+STAT", "1FRQ 1FIN 1ENV 1FB 2FRQ 2VOL TONE TUNE"], ["FM+PAR", "1FRQ 1ENV 2FRQ 2ENV 3FRQ 3ENV TONE TUNE"], ["FM+DYN", "1FRQ 1FEN 1VOL 1VEN 2FRQ 2ENV 2FB TUNE"],
		["VO-6", "VOC1 VOC2 V-SW VOIC CONS CLEN CVOL TUNE"], ["GND-GND", ""], ["GND-SIN", "TUNE"], ["GND-NOIS", "ST RED STON TUNE"],
		["FX-THRU", "INP"], ["FX-REVERB", "DEC DAMP GATE MIX HP LP INP"], ["FX-CHORUS", "DEL DEP SPD MIX FB WID LP INP"], ["FX-DYNAMIX", "ATK REL THRS MIX RAT GAIN RMS INP"],
		["FX-RINGMOD", "WAVE EXT MIX INP"], ["FX-PHASER", "CNTR DEP SPD MIX FB WID INP"],	/* the manual's page for the phaser lists no INP; the machine has it (every FX machine takes an input) */
		 ["FX-FLANGER", "DEL DEP SPD MIX FB WID INP"]];
	const machineReference = {
		name: "mm-sound-machine-reference", proves: ["MM-324", "MM-325", "MM-326", "MM-327", "MM-328", "MM-329", "MM-330", "MM-331", "MM-332", "MM-333", "MM-334", "MM-335", "MM-337", "MM-338", "MM-339", "MM-340",
			"MM-341", "MM-342", "MM-343", "MM-344", "MM-345", "MM-346", "MM-091", "MM-110", "MM-111", "MM-063"],
		steps: [
			go("sound"), sel(0),
			{ say: "the Sound page has seven pages of eight values: SYN, AMP, FLT, EFX and the three LFOs, and the kit holds them all", screen: () => ok(["AMP", "FLT", "EFX"].every(g => $all(`#main .pc[data-g="${g}"]`).length === 8) && ["LF1", "LF2", "LF3"].every(g => $all(`#main .pc[data-g="${g}"]`).length === 4 && $1(`#lp${g[2]}`) && $1(`#ld${g[2]}`) && $all(`[data-set="ltrig"][data-l="${g}"] button`).length === 5 && $all(`[data-lwave="${g}"]`).length === 11), "boxes " + ["AMP", "FLT", "EFX", "LF1"].map(g => g + $all(`#main .pc[data-g="${g}"]`).length)),
				machine: () => ok(wk().tracks.every(tr => tr.pages.length >= 7 && tr.pages.slice(0, 7).every(pg => pg.length === 8)), "pages " + wk().tracks[0].pages.map(p => p.length)) },
			{ say: "the MKII plate on (two of the machines are MKII only)", act: (u, c) => { c.plate0 = document.documentElement.dataset.plate; if (c.plate0 !== "mk2") u.click("#platekey"); }, screen: () => ok(document.documentElement.dataset.plate === "mk2", "plate " + document.documentElement.dataset.plate) },
			{ say: "pick each machine of the manual (its family, then its key): the machine is in the kit, the page shows the manual's knobs in the manual's order, each knob moves its own value and sends its own CC", act: async (u, c) => {
				c.n0 = histN(); c.bad = []; c.n = 0; c.knobs = 0; c.t = 0;
				for (const [m, want] of MANUAL_MACHINES) {
					const fam = m.replace(/-.*$/, "").replace(/^(FM\+).*/, "FM+");
					u.click("#machbtn"); await until(() => !$1("#machpop").hidden, 1500);
					const famBtn = $1(`#machpop .mf[data-fam="${famKey(m)}"]`); if (famKey(m) !== fam || !famBtn) { c.bad.push(`${m}: family ${famKey(m)}, the manual's ${fam}`); if (!$1("#machpop").hidden) u.key("Escape"); continue; }
					u.click(famBtn); await sleep(30);
					const key = $1(`#machpop .mk[data-mach="${m}"]`); if (!key || key.disabled) { c.bad.push(m + ": no key"); if (!$1("#machpop").hidden) u.key("Escape"); continue; }
					u.click(key); if (!await until(() => wk().tracks[0].machineName === m && S().tracks[0].m === m, 4000)) { c.bad.push(`${m}: not picked, kit has ${wk().tracks[0].machineName}`); continue; }
					await sleep(250);
					const boxes = $all('#main .pc[data-g="SYN"]').map(e => [+e.dataset.n, e.getAttribute("aria-label")]).sort((a, b) => a[0] - b[0]);
					if (boxes.map(b => b[1]).join(" ") !== want) { c.bad.push(`${m}: ${boxes.map(b => b[1]).join(" ")} (manual: ${want})`); continue; }
					/* TUNE is on every synth machine except the beat box and silence */
					const tune = boxes.some(b => b[1] === "TUNE"), synth = !/^(FX-|GND-GND|DPRO-BBOX)/.test(m);
					if (tune !== synth) c.bad.push(`${m}: TUNE ${tune}`);
					for (const [i, name] of boxes) {
						const r = await nudgeBox(u, 0, "SYN", i);
						if (name === "INP") { if (r.err || !r.moved.length) c.bad.push(`${m} INP: ${r.err || "nothing moved"}`); else c.knobs++; continue; }
						const e = checkBox(r, 0, "SYN", i); if (e) c.bad.push(m + " " + name + ": " + e); else c.knobs++;
					}
					if (m === "DPRO-BBOX" || m === "VO-6") Journey.snapshot(m === "VO-6" ? "mm-machine-vo6" : "mm-machine-bbox");
					c.n++;
				}
				c.note = `${c.n} machines, ${c.knobs} knobs`; },
				screen: c => ok(!c.bad.length, c.bad.slice(0, 6).join(" | ") + (c.bad.length > 6 ? ` (+${c.bad.length - 6})` : "")), machine: c => ok(c.n === MANUAL_MACHINES.length, c.n + " of " + MANUAL_MACHINES.length + " machines"), within: 1000 }
		],
		async tidy(u, c) { if (c.n0 != null) await undoTo(u, c.n0); if (c.plate0 && document.documentElement.dataset.plate !== c.plate0) u.click("#platekey"); }
	};
	/* ---- Sound: the track effects, every value of AMP, FLT and EFX in the manual's order (Track effects chapter) ---- */
	const EFFECT_PAGES = [["AMP", "ATK HOLD DEC REL DIST VOL PAN PORT"], ["FLT", "BASE WDTH HPQ LPQ ATK DEC BOFS WOFS"], ["EFX", "EQF EQG SRR DTIM DSND DFB DBAS DWID"]];
	/* the values the manual gives a sign (below 0: headroom for DIST, a cut for EQG, left for PAN, stereo kept for DSND) */
	const SIGNED_NAMES = new Set(["DIST", "PAN", "EQG", "DSND"]);
	const signedText = v => (v - 64 > 0 ? "+" : "") + (v - 64);
	const trackEffects = {
		name: "mm-sound-track-effects", proves: ["MM-114", "MM-115", "MM-116", "MM-117", "MM-118", "MM-119", "MM-121", "MM-122", "MM-123", "MM-124", "MM-125", "MM-126", "MM-127", "MM-129", "MM-130", "MM-131", "MM-132", "MM-133", "MM-134", "MM-092", "MM-084"],
		steps: [
			go("sound"), sel(0),
			{ say: "AMP, FLT and EFX: each value box has the manual's name at the manual's place; an arrow moves its own cell of the kit and sends its own CC on the track's channel; the sign shows where the manual gives one", act: async (u, c) => {
				c.n0 = histN(); c.bad = []; c.n = 0;
				for (const [g, names] of EFFECT_PAGES) {
					const boxes = $all(`#main .pc[data-g="${g}"]`).map(e => [+e.dataset.n, e.getAttribute("aria-label")]).sort((a, b) => a[0] - b[0]);
					if (boxes.map(b => b[1]).join(" ") !== names) { c.bad.push(`${g}: ${boxes.map(b => b[1]).join(" ")} (manual: ${names})`); continue; }
					for (const [i, name] of boxes) {
						const r = await nudgeBox(u, 0, g, i), e = checkBox(r, 0, g, i);
						if (e) { c.bad.push(e); continue; }
						const wantText = SIGNED_NAMES.has(name) ? signedText(r.v1) : String(r.v1);
						if (r.text !== wantText) c.bad.push(`${g} ${name}: shows ${r.text}, wanted ${wantText}`); else c.n++;
					}
				}
				Journey.snapshot("mm-sound-effects"); c.note = c.n + " values"; },
				screen: c => ok(!c.bad.length, c.bad.slice(0, 6).join(" | ")), machine: c => ok(c.n === 24, c.n + " of 24 values"), within: 1000 },
			{ say: "pick track 4: the same box moves track 4's cell only, on track 4's channel", act: async (u, c) => { u.click(rail(3)); await sleep(300); c.r = await nudgeBox(u, 3, "AMP", 0); },
				screen: c => ok(S().sel === 3, "track " + S().sel), machine: c => ok(!checkBox(c.r, 3, "AMP", 0), checkBox(c.r, 3, "AMP", 0)), within: 8000 },
			{ say: "pick another machine on track 4: only track 4's machine changes", act: async (u, c) => { c.b = kitCells(); u.click("#machbtn"); await until(() => !$1("#machpop").hidden, 1500); const m0 = wk().tracks[3].machineName; c.m1 = ["SID-6581", "FM+STAT"].find(m => m !== m0); u.click(`#machpop .mf[data-fam="${famKey(c.m1)}"]`); await sleep(50); u.click(`#machpop .mk[data-mach="${c.m1}"]`); await until(() => wk().tracks[3].machineName === c.m1, 4000); await sleep(300); },
				machine: c => { const d = cellDiff(c.b, kitCells()); return ok(d.includes("mach4") && d.every(k => /^T4\.0\.|^mach4$|^in4$|^out4$/.test(k)), "changed " + d.join(",")); }, within: 8000 },
			{ say: "the delay screen: drag its handle left by a quarter of the screen: DTIM falls by 64, in the 256ths of a bar the repeats sit apart", act: async (u, c) => { u.click(rail(0)); await sleep(300);
					const cv = $1('#main canvas.ed[data-ed="delay"]'), r = cv.getBoundingClientRect(), h = ED.delay.handles(r.width, r.height, cv)[0]; c.d0 = cellOf(0, "EFX", 3); c.dx = -Math.round(r.width / 4); c.hx = h.x; c.W = r.width;
					await u.drag(cv, [[Math.round(c.dx / 2), 0], [c.dx, 0]], {}, { fx: h.x / r.width, fy: Math.min(Math.max(h.y, 6), r.height - 6) / r.height }); },
				machine: c => { const want = Math.round((c.hx + c.dx) / c.W * 256); return ok(Math.abs(cellOf(0, "EFX", 3) - want) <= 2 && cellOf(0, "EFX", 3) !== c.d0, `DTIM ${cellOf(0, "EFX", 3)}, wanted about ${want} (was ${c.d0})`); }, within: 8000 },
			{ say: "type DSND below 0: the delay screen says stereo kept; above 0: ping-pong", act: async (u, c) => { const q = '#main .pc[data-g="EFX"][data-n="4"]', cv = () => $1('#main canvas.ed[data-ed="delay"]');
					u.click(q, { cmd: true }); typeIn(u, "-20"); await until(() => cellOf(0, "EFX", 4) === 44, 3000); await sleep(200); c.lo = canvasTexts(cv()).join("|"); c.loV = cellOf(0, "EFX", 4);
					u.click(q, { cmd: true }); typeIn(u, "+20"); await until(() => cellOf(0, "EFX", 4) === 84, 3000); await sleep(200); c.hi = canvasTexts(cv()).join("|"); c.hiV = cellOf(0, "EFX", 4); },
				machine: c => ok(c.loV === 44 && c.hiV === 84 && /STEREO KEPT/.test(c.lo) && !/PING/.test(c.lo) && /PING-PONG/.test(c.hi), `DSND ${c.loV}: "${c.lo}", ${c.hiV}: "${c.hi}"`), within: 8000 },
			{ say: "type DFB above 64: the delay screen warns that the repeats grow; at 40 it does not", act: async (u, c) => { const q = '#main .pc[data-g="EFX"][data-n="5"]', cv = () => $1('#main canvas.ed[data-ed="delay"]');
					u.click(q, { cmd: true }); typeIn(u, "100"); await until(() => cellOf(0, "EFX", 5) === 100, 3000); await sleep(200); c.up = canvasTexts(cv()).join("|");
					u.click(q, { cmd: true }); typeIn(u, "40"); await until(() => cellOf(0, "EFX", 5) === 40, 3000); await sleep(200); c.dn = canvasTexts(cv()).join("|"); },
				machine: c => ok(/GROWS/.test(c.up) && !/GROWS/.test(c.dn), `at 100: "${c.up}", at 40: "${c.dn}"`), within: 8000 }
		],
		async tidy(u, c) { if (c.n0 != null) await undoTo(u, c.n0); }
	};
	/* ---- Sound: the three LFOs of each synth track (the LFO chapter): PAGE and DEST, TRIG, WAVE, MULT, SPD, INTL, DPTH ---- */
	const LFO_PAGES = ["PTCH", "SYN", "AMP", "FLT", "EFX", "LF1", "LF2", "LF3", "MIDI"];
	const LFO_DEST = { PTCH: "1/12 2/12 7/12 1OCT 2OCT 4OCT 8OCT 16OCT", AMP: "ATK HOLD DEC REL DIST VOL PAN PORT", FLT: "BASE WDTH HPQ LPQ ATK DEC BOFS WOFS", EFX: "EQF EQG SRR DTIM DSND DFB DBAS DWID",
		LF1: "PAGE DEST TRIG WAVE MULT SPD INTL DPTH", LF2: "PAGE DEST TRIG WAVE MULT SPD INTL DPTH", LF3: "PAGE DEST TRIG WAVE MULT SPD INTL DPTH", MIDI: "LEN VEL PB PCHG CC1 CC2 CC3 CC4" };
	const LFO_TRIGS = "FREE TRIG HOLD ONE HALF", LFO_WAVES = "TRI ITRI SAW ISAW SQR ISQR EXP IEXP RMP IRMP RND", LFO_MULTS = "1X 2X 4X 8X 16X 32X 64X";
	const selOptions = id => [...$1("#" + id).options].map(o => o.text);
	const lfoCell = (t, k, i) => wk().tracks[t].pages[3 + k][i];
	/* a list value is held as the firmware holds it: the step i of n is ceil(i * 128 / n) (doc/modern-ux/mm-catalogue.json enumRule); read back, floor(value * n / 128) */
	const enIdx = (v, n) => Math.floor(v * n / 128);
	const lfoPage = (t, k) => enIdx(lfoCell(t, k, 0), 9), lfoDest = (t, k) => enIdx(lfoCell(t, k, 1), 8);
	const lfoJ = {
		name: "mm-sound-lfo", proves: ["MM-135", "MM-136", "MM-137", "MM-138", "MM-139", "MM-140", "MM-141", "MM-142", "MM-144", "MM-007"],
		steps: [
			go("sound"), sel(0),
			{ say: "LFO 1's PAGE lists the nine places an LFO can go (PTCH, the four pages, the three LFOs, the MIDI page); each choice is the kit's first LFO value, and DEST then lists that page's own eight names (PTCH: eight ranges)", act: async (u, c) => {
				c.n0 = histN(); c.bad = [];
				const pages = selOptions("lp1"); if (pages.join(" ") !== LFO_PAGES.join(" ")) c.bad.push("PAGE lists " + pages.join(" "));
				const synNames = (MANUAL_MACHINES.find(m => m[0] === wk().tracks[0].machineName) || [0, ""])[1].split(" ");
				for (let i = 0; i < LFO_PAGES.length; i++) {
					await choose(u, "lp1", i); if (!await until(() => lfoPage(0, 1) === i, 3000)) { c.bad.push(`PAGE ${LFO_PAGES[i]}: kit ${lfoCell(0, 1, 0)}`); continue; }
					await sleep(150);
					const want = LFO_PAGES[i] === "SYN" ? null : LFO_DEST[LFO_PAGES[i]], got = selOptions("ld1").join(" ");
					if (want && got !== want) c.bad.push(`DEST of ${LFO_PAGES[i]}: ${got} (manual: ${want})`);
					if (!want && got.replace(/—/g, "").split(/\s+/).filter(Boolean).join(" ") !== synNames.join(" ")) c.bad.push(`DEST of SYN: ${got} (machine: ${synNames.join(" ")})`);
				}
				/* every destination of one page, each its own value (the second LFO value) */
				await choose(u, "lp1", 2);
				for (let j = 0; j < 8; j++) { await choose(u, "ld1", j); if (!await until(() => lfoDest(0, 1) === j, 3000)) c.bad.push(`DEST ${j}: kit ${lfoCell(0, 1, 1)}`); }
				/* one LFO on another: LFO 1 on LFO 2's SPD */
				await choose(u, "lp1", 6); await choose(u, "ld1", 5); await sleep(300);
				if (lfoPage(0, 1) !== 6 || lfoDest(0, 1) !== 5) c.bad.push(`LFO on LFO: ${lfoCell(0, 1, 0)}/${lfoCell(0, 1, 1)}`);
				await choose(u, "lp1", 8); await sleep(200); if (lfoPage(0, 1) !== 8 || selOptions("ld1").join(" ") !== LFO_DEST.MIDI) c.bad.push("MIDI page: " + selOptions("ld1").join(" ")); },
				screen: c => ok(!c.bad.length, c.bad.slice(0, 5).join(" | ")), within: 1000 },
			{ say: "TRIG: the five keys FREE TRIG HOLD ONE HALF in that order; each is the third LFO value", act: async (u, c) => { c.bad = [];
					const names = $all('[data-set="ltrig"][data-l="LF1"] button').map(b => b.textContent.trim()); if (names.join(" ") !== LFO_TRIGS) c.bad.push("keys " + names.join(" "));
					for (let i = 0; i < 5; i++) { u.click(`[data-set="ltrig"][data-l="LF1"] button[data-v="${i}"]`); if (!await until(() => enIdx(lfoCell(0, 1, 2), 5) === i && pressed(`[data-set="ltrig"][data-l="LF1"] button[data-v="${i}"]`), 3000)) c.bad.push(`TRIG ${i}: kit ${lfoCell(0, 1, 2)}`); } },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 },
			{ say: "WAVE: eleven shape keys, named in the manual's order; each is the fourth LFO value", act: async (u, c) => { c.bad = [];
					const names = $all('[data-lwave="LF1"]').map(b => b.getAttribute("title")); if (names.join(" ") !== LFO_WAVES) c.bad.push("shapes " + names.join(" "));
					for (let i = 0; i < 11; i++) { u.click(`[data-lwave="LF1"][data-w="${i}"]`); if (!await until(() => enIdx(lfoCell(0, 1, 3), 11) === i && pressed(`[data-lwave="LF1"][data-w="${i}"]`), 3000)) c.bad.push(`WAVE ${i}: kit ${lfoCell(0, 1, 3)}`); } Journey.snapshot("mm-sound-lfos"); },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 },
			{ say: "MULT: type each of its seven names (1X to 64X): the box shows it, the kit holds the matching step of the list", act: async (u, c) => { c.bad = [];
					const q = '#main .pc[data-g="LF1"][data-n="4"]'; if ((ref(box("LF1", 4))[2].en || []).join(" ") !== LFO_MULTS) c.bad.push("MULT list " + (ref(box("LF1", 4))[2].en || []).join(" "));
					for (const [i, nm] of LFO_MULTS.split(" ").entries()) { u.click(q, { cmd: true }); typeIn(u, nm.toLowerCase()); if (!await until(() => enIdx(lfoCell(0, 1, 4), 7) === i && valueText(q) === nm, 3000)) c.bad.push(`MULT ${nm}: kit ${lfoCell(0, 1, 4)}, shows ${valueText(q)}`); } },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 },
			{ say: "SPD, INTL and DPTH of LFO 1: each moves its own cell and sends its own CC (93, 94, 95) on the track's channel", act: async (u, c) => { c.bad = []; for (const i of [5, 6, 7]) { const e = checkBox(await nudgeBox(u, 0, "LF1", i), 0, "LF1", i); if (e) c.bad.push(e); } },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 },
			{ say: "all eighteen LFOs (three on each of the six tracks): SPD of each moves only its own cell, on its track's channel, with the CC of its own LFO (93, 109, 117)", act: async (u, c) => { c.bad = []; c.n = 0;
					for (let t = 0; t < 6; t++) { u.click(rail(t)); await sleep(250); for (const g of ["LF1", "LF2", "LF3"]) { const e = checkBox(await nudgeBox(u, t, g, 5), t, g, 5); if (e) c.bad.push(`T${t + 1} ${g}: ${e}`); else c.n++; } } },
				screen: c => ok(!c.bad.length, c.bad.slice(0, 4).join(" | ")), machine: c => ok(c.n === 18, c.n + " of 18"), within: 1000 },
			{ say: "two LFOs on one target add: LFO 1 and LFO 2 of track 1 both on FLT BASE with depth: the value shows ~12", act: async (u, c) => { u.click(rail(0)); await sleep(300);
					for (const [k, n] of [[1, 5], [2, 6]]) { await choose(u, "lp" + k, 3); await choose(u, "ld" + k, 0); await until(() => lfoPage(0, k) === 3 && lfoDest(0, k) === 0, 3000);
						const q = `#main .pc[data-g="LF${k}"][data-n="7"]`; u.click(q, { cmd: true }); typeIn(u, "80"); await until(() => lfoCell(0, k, 7) === 80, 3000); }
					await sleep(300); c.t = $1('#main .pc[data-g="FLT"][data-n="0"] .mod')?.textContent; c.ti = $1('#main .pc[data-g="FLT"][data-n="0"]')?.title; },
				screen: c => ok(c.t === "~12" && /LFO 1 \+ 2/.test(c.ti), `badge ${c.t}, title ${c.ti}`), machine: () => ok(lfoPage(0, 1) === 3 && lfoPage(0, 2) === 3 && lfoDest(0, 1) === 0 && lfoDest(0, 2) === 0, "LFO targets differ"), within: 6000 },
			{ say: "the MIDI track of the same number shares the three LFOs: its page says so and one key goes to the synth track's LFOs", act: async (u, c) => { u.click('[data-side="midi"]'); await sleep(300); u.click(rail(6)); await sleep(300); c.txt = $1("#main .sgabout")?.textContent || ""; u.click('[data-goto="0"]'); await sleep(300); },
				screen: c => ok(/shares its three LFOs with synth track 1/.test(c.txt) && S().sel === 0 && S().side !== "midi" && !!$1("#lp1"), `text "${c.txt.slice(0, 60)}", track ${S().sel}, side ${S().side}`), within: 6000 }
		],
		async tidy(u, c) { if (S().side === "midi") u.click('[data-side="int"]'); if (c.n0 != null) await undoTo(u, c.n0); }
	};
	/* ---- Mix: the buses, the inputs and the routing (the Routing chapter) ---- */
	const BUS_BIT = { AB: 1, CD: 2, EF: 4 }, IN_NAMES = ["NEIBOR", "INP A", "INP B", "INP AB", "BUS AB", "BUS CD", "BUS EF"];
	/* the SysEx 0x5C the core sent for a routing edit: F0 00 20 3C 03 00 5C track outputs input F7 (a synth machine takes no input: 0) */
	const route5c = n0 => wireLog.filter(w => w.seq > n0 && w.kind === "sysex" && w.b[6] === 0x5c).map(w => ({ t: w.b[7], out: w.b[8], inp: w.b[9] }));
	const flowOf = b => $all(".flowl span").map(e => e.textContent.trim()).find(x => x.startsWith(b + ":")) || "";
	const lcdRoute = () => $1('#lcd2 [data-l2="route"] b')?.textContent;
	const setMachineOf = async (u, t, m) => { u.click(tab("sound")); await sleep(200); u.click(rail(t)); await sleep(200); u.click("#machbtn"); await until(() => !$1("#machpop").hidden, 1500); u.click(`#machpop .mf[data-fam="${famKey(m)}"]`); await sleep(50); u.click(`#machpop .mk[data-mach="${m}"]`); await until(() => wk().tracks[t].machineName === m, 4000); await sleep(300); u.click(tab("mix")); await sleep(300); };
	const mixBuses = {
		name: "mm-mix-buses", proves: ["MM-109", "MM-276", "MM-277", "MM-278", "MM-279", "MM-280", "MM-281", "MM-282", "MM-283", "MM-284"],
		steps: [
			go("mix"),
			{ say: "the factory routing is 3xSTEREO: its key is lit, the LCD says it, the kit's global holds it", screen: () => ok(pressed('[data-set="routing"] button[data-v="3xSTEREO"]') && /^3xST(EREO)?$/.test(lcdRoute()), `lit ${$all('[data-set="routing"] button').filter(b => b.getAttribute("aria-pressed") === "true").map(b => b.dataset.v)}, LCD ${lcdRoute()}`), machine: () => ok(gDoc()?.routingMode === "3xSTEREO", "routing " + gDoc()?.routingMode) },
			{ say: "every track's OUT keys AB, CD, EF: a click flips that bus of that track only, the machine gets SysEx 0x5C with the track's new bits, and a synth track's name moves in and out of the bus's flow line", act: async (u, c) => {
				c.n0 = histN(); c.bad = []; c.n = 0;
				for (let t = 0; t < 6; t++) for (const b of ["AB", "CD", "EF"]) {
					const q = `[data-bus="${b}"][data-t="${t}"]`, was = wk().tracks[t].outputs, w0 = wireSeq, others = wk().tracks.map(x => x.outputs);
					u.click(q); if (!await until(() => wk().tracks[t].outputs === (was ^ BUS_BIT[b]), 3000)) { c.bad.push(`T${t + 1} ${b}: bits ${wk().tracks[t].outputs} for ${was ^ BUS_BIT[b]}`); continue; }
					await until(() => route5c(w0).length > 0, 2000); const r = route5c(w0).pop();
					if (!r || r.t !== t || r.out !== (was ^ BUS_BIT[b]) || r.inp !== (isFx(S().tracks[t].m) ? wk().tracks[t].input : 0)) c.bad.push(`T${t + 1} ${b}: SysEx ${JSON.stringify(r)}`);
					else if (wk().tracks.some((x, i) => i !== t && x.outputs !== others[i])) c.bad.push(`T${t + 1} ${b}: another track changed`);
					else if (pressed(q) !== !!((was ^ BUS_BIT[b]) & BUS_BIT[b])) c.bad.push(`T${t + 1} ${b}: key ${pressed(q)}`);
					else c.n++;
					if (!isFx(S().tracks[t].m) && !S().tracks[t].mute) { await sleep(100); const on = !!(wk().tracks[t].outputs & BUS_BIT[b]), has = new RegExp(`(^|[ +(›])T${t + 1} `).test(flowOf(b)); if (on !== has) c.bad.push(`T${t + 1} ${b}: flow "${flowOf(b)}"`); }
					u.click(q); await until(() => wk().tracks[t].outputs === was, 3000);
				}
				c.note = c.n + " keys"; },
				screen: c => ok(!c.bad.length, c.bad.slice(0, 5).join(" | ")), machine: c => ok(c.n === 18, c.n + " of 18 keys"), within: 1000 },
			{ say: "an FX machine picked on track 4 takes an input (NEIBOR, the track before) and has DEC and REL at 127 so the sound passes", act: async (u, c) => { c.m0 = wk().tracks[3].machineName; await setMachineOf(u, 3, "FX-CHORUS"); },
				machine: () => ok(wk().tracks[3].input === 0 && wk().tracks[3].pages[1][2] === 127 && wk().tracks[3].pages[1][3] === 127, `input ${wk().tracks[3].input}, AMP DEC ${wk().tracks[3].pages[1][2]} REL ${wk().tracks[3].pages[1][3]}`), screen: () => ok($1("#inp3")?.value === "NEIBOR", "IN " + $1("#inp3")?.value), within: 8000 },
			{ say: "IN INP A, INP B, INP AB: the kit holds the input and the machine gets it in SysEx 0x5C", act: async (u, c) => { c.bad = []; for (const [i, nm] of [[1, "INP A"], [2, "INP B"], [3, "INP AB"]]) { const w0 = wireSeq; await choose(u, "inp3", nm); if (!await until(() => wk().tracks[3].input === i, 3000)) { c.bad.push(`${nm}: kit ${wk().tracks[3].input}`); continue; } await until(() => route5c(w0).length > 0, 2000); const r = route5c(w0).pop(); if (!r || r.t !== 3 || r.inp !== i) c.bad.push(`${nm}: SysEx ${JSON.stringify(r)}`); } },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 },
			{ say: "a THRU machine on track 1 starts a chain: INP AB, DEC and REL 127; the next FX machine on track 2 on NEIBOR, the one after on NEIBOR too: the flow line names the neighbours (T1›T2, T2›T3)", act: async (u, c) => { await setMachineOf(u, 0, "FX-THRU"); await setMachineOf(u, 1, "FX-CHORUS"); await setMachineOf(u, 2, "FX-REVERB");
					for (const t of [0, 1, 2]) if (!(wk().tracks[t].outputs & 1)) { u.click(`[data-bus="AB"][data-t="${t}"]`); await sleep(300); } for (const t of [3, 4, 5]) if (wk().tracks[t].outputs & 1) { u.click(`[data-bus="AB"][data-t="${t}"]`); await sleep(300); }
					await sleep(300); c.flow = flowOf("AB"); },
				machine: () => ok(wk().tracks[0].machineName === "FX-THRU" && wk().tracks[0].input === 3 && wk().tracks[0].pages[1][2] === 127 && wk().tracks[1].input === 0 && wk().tracks[2].input === 0, `inputs ${wk().tracks.slice(0, 3).map(x => x.input)}`),
				screen: c => ok(/T1 FX-THRU/.test(c.flow) && /T1›T2 FX-CHORUS/.test(c.flow) && /T2›T3 FX-REVERB/.test(c.flow), "flow " + c.flow), within: 10000 },
			{ say: "track 3 on IN BUS AB with OUT AB on: an insert, the flow line says so; OUT AB off: it takes a copy", act: async (u, c) => { await choose(u, "inp2", "BUS AB"); await until(() => wk().tracks[2].input === 4, 3000); await sleep(300); c.ins = flowOf("AB");
					u.click('[data-bus="AB"][data-t="2"]'); await until(() => !(wk().tracks[2].outputs & 1), 3000); await sleep(300); c.snd = flowOf("AB"); Journey.snapshot("mm-mix-routing"); },
				screen: c => ok(/INSERT/.test(c.ins) && !/INSERT/.test(c.snd) && /T3 FX-REVERB takes a copy/.test(c.snd), `insert: ${c.ins} | send: ${c.snd}`), machine: () => ok(wk().tracks[2].input === 4, "input " + wk().tracks[2].input), within: 8000 },
			{ say: "IN BUS CD and BUS EF are in the list; each is its number in the kit", act: async (u, c) => { c.bad = []; for (const [i, nm] of [[5, "BUS CD"], [6, "BUS EF"]]) { await choose(u, "inp2", nm); if (!await until(() => wk().tracks[2].input === i, 3000)) c.bad.push(`${nm}: kit ${wk().tracks[2].input}`); } c.opts = selOptions("inp2").join(","); },
				screen: c => ok(!c.bad.length && c.opts === IN_NAMES.join(","), c.bad.join(" | ") + " options " + c.opts), within: 1000 },
			{ say: "the routing keys: 3xSTEREO + AB=MIX adds C/D and E/F to A/B (the flow lines and the LCD say it)", act: async (u, c) => { u.click('[data-set="routing"] button[data-v="3xSTEREO+AB=MIX"]'); await until(() => gDoc()?.routingMode === "3xSTEREO+AB=MIX", 5000); await sleep(400); c.cd = flowOf("CD"); c.ef = flowOf("EF"); c.lcd = lcdRoute(); },
				screen: c => ok(/OUT C\/D \+ A\/B/.test(c.cd) && /OUT E\/F \+ A\/B/.test(c.ef) && /^3xST\+AB=MIX$/.test(c.lcd), `CD "${c.cd}", EF "${c.ef}", LCD ${c.lcd}`), machine: () => ok(gDoc()?.routingMode === "3xSTEREO+AB=MIX", "routing " + gDoc()?.routingMode), within: 8000 },
			{ say: "6xMONO: each track to its own output, A to F (the graph says OUT A to OUT F), no bus is sent out", act: async (u, c) => { u.click('[data-set="routing"] button[data-v="6xMONO"]'); await until(() => gDoc()?.routingMode === "6xMONO", 5000); await sleep(400); c.txt = [...document.querySelectorAll(".routewrap svg text")].map(e => e.textContent); c.f = ["AB", "CD", "EF"].map(flowOf); c.lcd = lcdRoute(); },
				screen: c => ok(["A", "B", "C", "D", "E", "F"].every(l => c.txt.includes("OUT " + l)) && c.f.every(x => /not sent out/.test(x)) && /^6xMONO$/.test(c.lcd), `graph ${c.txt.filter(x => /^OUT/.test(x))}, flows ${c.f}, LCD ${c.lcd}`), machine: () => ok(gDoc()?.routingMode === "6xMONO", "routing " + gDoc()?.routingMode), within: 8000 },
			{ say: "click ROUTE on the LCD: the next routing mode", act: async (u, c) => { c.r0 = gDoc()?.routingMode; u.click('#lcd2 [data-l2="route"]'); await sleep(1200); },
				machine: c => ok(gDoc()?.routingMode !== c.r0, "routing " + gDoc()?.routingMode), within: 6000 },
			{ say: "click 3xSTEREO: the default routing, as GLOBAL Clear leaves it", act: u => u.click('[data-set="routing"] button[data-v="3xSTEREO"]'), machine: () => ok(gDoc()?.routingMode === "3xSTEREO", "routing " + gDoc()?.routingMode), screen: () => ok(pressed('[data-set="routing"] button[data-v="3xSTEREO"]'), "not lit"), within: 8000 }
		],
		async tidy(u, c) { if (c.n0 != null) await undoTo(u, c.n0); }
	};
	/* ---- Appendix B: what the machine is sent as MIDI (CC, NRPN) on which channel; the base channel, and OFF ---- */
	const ccsOf = n0 => nonSys(n0).filter(w => w.kind === "cc").map(w => w.b);
	/* one edit through the page's own control, then the CC the machine would get: the controller numbers and the channel are the manual's */
	async function wireOf(act) { const w0 = wireSeq; await act(); await sleep(450); return ccsOf(w0); }
	/* a GLOBAL edit: written, read back and made active (SysEx 0x50, 0x51, 0x56); only then does the core and the wire use it */
	const globalSettled = async n0 => { await until(() => wireLog.some(w => w.seq > n0 && w.kind === "sysex" && w.b[6] === 0x56), 10000); await sleep(2000); };
	const wireCc = {
		name: "mm-wire-cc", proves: ["MM-353", "MM-354", "MM-355", "MM-356", "MM-357", "MM-358", "MM-359", "MM-360", "MM-362", "MM-289"],
		steps: [
			go("sound"), sel(0),
			{ say: "a machine with all eight SYN values (DPRO-DDRW, MKII): each value of the page sends its own CC, 48 to 55, on the track's channel with the value the kit holds", act: async (u, c) => { c.n0 = histN(); c.bad = []; c.plate0 = document.documentElement.dataset.plate; if (c.plate0 !== "mk2") u.click("#platekey"); await sleep(200);
					u.click("#machbtn"); await until(() => !$1("#machpop").hidden, 1500); u.click('#machpop .mf[data-fam="DPRO"]'); await sleep(50); u.click('#machpop .mk[data-mach="DPRO-DDRW"]'); await until(() => wk().tracks[0].machineName === "DPRO-DDRW", 4000); await sleep(300);
					for (let i = 0; i < 8; i++) { const e = checkBox(await nudgeBox(u, 0, "SYN", i), 0, "SYN", i); if (e) c.bad.push(e); } },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 },
			{ say: "AMP 56-63, FLT 72-79, EFX 80-87: every value of each page, on track 6's channel (base + 5)", act: async (u, c) => { c.bad = []; u.click(rail(5)); await sleep(300);
					for (const g of ["AMP", "FLT", "EFX"]) for (let i = 0; i < 8; i++) { const e = checkBox(await nudgeBox(u, 5, g, i), 5, g, i); if (e) c.bad.push(e); } },
				screen: c => ok(!c.bad.length, c.bad.slice(0, 5).join(" | ")), within: 1000 },
			{ say: "the three LFOs: all eight values of each (the PAGE and DEST lists, the TRIG and WAVE keys, MULT, SPD, INTL, DPTH) go as CC 88-95, 104-111 and 112-119", act: async (u, c) => { c.bad = []; u.click(rail(1)); await sleep(300);
					const t = 1, expect = (k, i, v, cc) => cc.some(b => b[0] === (0xb0 | (baseCh() + t)) && b[1] === CC_BASE["LF" + k] + i && b[2] === v);
					for (const k of [1, 2, 3]) {
						const g = "LF" + k, pg = 3 + k, base = lfoCell(t, k, 0) === 0 ? 1 : 0;
						let cc = await wireOf(() => choose(u, "lp" + k, base === 0 ? 2 : 3)); if (!expect(k, 0, lfoCell(t, k, 0), cc)) c.bad.push(`${g} PAGE: ${cc.map(b => b.join(" ")).join(" | ")}`);
						cc = await wireOf(() => choose(u, "ld" + k, 3)); if (!expect(k, 1, lfoCell(t, k, 1), cc)) c.bad.push(`${g} DEST: ${cc.map(b => b.join(" ")).join(" | ")}`);
						const tv = enIdx(lfoCell(t, k, 2), 5) === 2 ? 3 : 2, wv = enIdx(lfoCell(t, k, 3), 11) === 4 ? 5 : 4;
						cc = await wireOf(() => u.click(`[data-set="ltrig"][data-l="${g}"] button[data-v="${tv}"]`)); if (!expect(k, 2, lfoCell(t, k, 2), cc)) c.bad.push(`${g} TRIG: ${cc.map(b => b.join(" ")).join(" | ")}`);
						cc = await wireOf(() => u.click(`[data-lwave="${g}"][data-w="${wv}"]`)); if (!expect(k, 3, lfoCell(t, k, 3), cc)) c.bad.push(`${g} WAVE: ${cc.map(b => b.join(" ")).join(" | ")}`);
						for (const i of [4, 5, 6, 7]) { const e = checkBox(await nudgeBox(u, t, g, i), t, g, i); if (e) c.bad.push(e); }
					} },
				screen: c => ok(!c.bad.length, c.bad.slice(0, 5).join(" | ")), within: 1000 },
			go("mix"),
			{ say: "LEVEL: drag track 2's fader: CC 7 on its channel with the kit's level", act: async (u, c) => { c.c = await wireOf(() => u.drag(strip(1, '.fader[data-g="lev"]'), [[0, -8], [0, -16], [0, -24]])); },
				screen: c => ok(c.c.length >= 1 && c.c.every(b => b[0] === (0xb0 | (baseCh() + 1)) && b[1] === 7) && c.c[c.c.length - 1][2] === wk().levels[1], `CC ${c.c.map(b => b.join(" ")).join(" | ")}, level ${wk().levels[1]}`), within: 6000 },
			{ say: "M on track 3: CC 3 value 1 on track 3's channel; again: value 0", act: async (u, c) => { c.on = await wireOf(() => u.click(strip(2, ".ms.m"))); c.off = await wireOf(() => u.click(strip(2, ".ms.m"))); },
				screen: c => ok(c.on.length === 1 && c.off.length === 1 && c.on[0][0] === (0xb0 | (baseCh() + 2)) && c.on[0][1] === 3 && c.on[0][2] === 1 && c.off[0][1] === 3 && c.off[0][2] === 0, `on ${c.on.map(b => b.join(" "))}, off ${c.off.map(b => b.join(" "))}`), within: 6000 },
			{ say: "PAN of track 2: the AMP page's seventh value, CC 62 on its channel (the machine answers the standard CC 10 too; the page sends 62)", act: async (u, c) => { const v0 = wk().tracks[1].pages[1][6]; c.c = await wireOf(() => u.drag(strip(1, ".pc.pan"), [[v0 > 64 ? -8 : 8, 0], [v0 > 64 ? -16 : 16, 0]])); },
				screen: c => ok(c.c.length >= 1 && c.c.every(b => b[0] === (0xb0 | (baseCh() + 1)) && b[1] === 62) && c.c[c.c.length - 1][2] === wk().tracks[1].pages[1][6], `CC ${c.c.map(b => b.join(" ")).join(" | ")}`), within: 6000 },
			go("sound"),
			{ say: "a MIDI track's MIDI page: LEN, VEL, PB, PCHG and CL1-4 go as NRPN on the base channel: the track as the MSB (99), the parameter 0x38 to 0x3F as the LSB (98), the value as data entry (6)", act: async (u, c) => { c.bad = []; u.click('[data-side="midi"]'); await sleep(300); u.click(rail(7)); await sleep(300);
					for (let i = 0; i < 8; i++) { const el = box("MID", i); if (!el) { c.bad.push("no MIDI box " + i); continue; } const v0 = wk().tracks[1].pages[7][i], mx = maxOf(ref(el)[2]), w0 = wireSeq; el.focus(); u.key(v0 >= mx ? "ArrowDown" : "ArrowUp"); await until(() => wk().tracks[1].pages[7][i] !== v0, 3000); await sleep(400);
						const n = nonSys(w0).filter(w => w.kind === "nrpn").map(w => w.b), v1 = wk().tracks[1].pages[7][i];
						if (n.length !== 3 || !n.every(b => b[0] === (0xb0 | baseCh())) || n[0][1] !== 99 || n[0][2] !== 1 || n[1][1] !== 98 || n[1][2] !== 0x38 + i || n[2][1] !== 6 || n[2][2] !== v1) c.bad.push(`MIDI ${i}: ${n.map(b => b.join(" ")).join(" | ")} for ${v1}`); } },
				screen: c => ok(!c.bad.length, c.bad.slice(0, 4).join(" | ")), within: 1000 },
			{ say: "the base channel: GLOBAL, + once: track 1's value goes out on channel 2; OFF (− twice): the edit reaches the kit but no CC goes", act: async (u, c) => { u.click('[data-side="int"]'); await sleep(300); u.click(rail(0)); await sleep(300); c.base0 = baseCh(); u.click("#globkey"); await sleep(300);
					const g0 = wireSeq; u.click('#globpop [data-ga="base"][data-d="1"]'); await until(() => baseCh() === c.base0 + 1, 15000); await globalSettled(g0); u.key("Escape"); await sleep(300); c.r1 = await nudgeBox(u, 0, "AMP", 0);
					u.click("#globkey"); await sleep(300); const g1 = wireSeq; for (let i = 0; i < 2; i++) { u.click('#globpop [data-ga="base"][data-d="-1"]'); await sleep(400); } await until(() => baseCh() > 15, 15000); await globalSettled(g1); u.key("Escape"); await sleep(300); c.offBase = baseCh(); const w0 = wireSeq; c.r2 = await nudgeBox(u, 0, "AMP", 1).catch(e => ({ err: String(e) })); c.ccs = ccsOf(w0); },
				screen: c => ok(c.r1.cc?.length === 1 && c.r1.cc[0].b[0] === 0xb1 && c.r1.cc[0].b[1] === 56, `base +1: ${c.r1.err || ""} ${c.r1.cc?.map(w => hex2(w))}`), machine: c => ok(c.offBase > 15 && !c.ccs.length && (c.r2.moved || []).length > 0, `base ${c.offBase}, CCs ${c.ccs.map(b => b.join(" "))}, moved ${c.r2.moved}`), within: 6000 }
		],
		async tidy(u, c) {
			if (c.base0 != null && baseCh() !== c.base0) { if ($1("#globpop").hidden) { u.click("#globkey"); await sleep(300); } for (let i = 0; i < 4 && baseCh() !== c.base0; i++) { u.click(`#globpop [data-ga="base"][data-d="${baseCh() > 15 ? 1 : -1}"]`); await sleep(500); } await until(() => baseCh() === c.base0, 10000); }
			if (!$1("#globpop").hidden) u.key("Escape");
			if (S().side === "midi") u.click('[data-side="int"]');
			if (c.n0 != null) await undoTo(u, c.n0);
			if (c.plate0 && document.documentElement.dataset.plate !== c.plate0) u.click("#platekey");
		}
	};
	/* ---- Sequence: the envelope trigs, pitch and the keys (the sequencer chapters) ---- */
	const rollPitch = (t, s, pitch) => {
		const c = $1(`#seq canvas.roll[data-big][data-t="${t}"]`); if (!c) throw new Error("no piano roll for track " + (t + 1));
		const G = laneGeom(c), r = c.getBoundingClientRect(), q = G.col[s]; if (!q) throw new Error("step " + (s + 1) + " is not shown");
		const row = G.lo + G.rows - 1 - pitch; if (row < 0 || row >= G.rows) throw new Error(`pitch ${pitch} is off the roll (${G.lo}-${G.lo + G.rows - 1})`);
		return { c, G, fx: (q.x0 + q.x1) / 2 / r.width, fy: (G.top + (row + 0.5) * G.rh) / r.height, rh: G.rh, lo: G.lo, hi: G.lo + G.rows - 1 };
	};
	const bitsOf = (t, k) => (patDoc()?.tracks[t]?.[k] || []).slice().sort((a, b) => a - b);
	const noteAt = (t, s) => (patDoc()?.tracks[t]?.notes || []).filter(([x]) => x === s).map(([, n]) => n);
	const dot = (b, s) => `[data-env="${b}"][data-s="${s}"]`;
	const envJ = {
		name: "mm-seq-env-trigs", proves: ["MM-029", "MM-047", "MM-085", "MM-143", "MM-171", "MM-209", "MM-210", "MM-211", "MM-213", "MM-214"],
		steps: [
			go("seq"), sel(0), drawOn,
			{ say: "the LCD names the kit, the rail marks the track, the ENV row's A F L dots show each step's amp, filter and LFO trigs as the pattern holds them", screen: () => {
					const bad = []; if (!$1("#kitname").textContent.includes(kitName(machine().kit.current).trim())) bad.push("LCD kit " + $1("#kitname").textContent); if (S().sel !== 0) bad.push("track " + S().sel);
					for (let s = 0; s < S().len; s++) { const st = S().tracks[0].steps[s]; if (!st || st.off) continue; for (const [b, k] of [["a", "amp"], ["f", "filter"], ["l", "lfo"]]) { const d = $1(dot(b, s)); if (!d || (d.getAttribute("aria-pressed") === "true") !== bitsOf(0, k).includes(s)) bad.push(`step ${s + 1} ${b}`); } }
					return ok(!bad.length, bad.slice(0, 5).join(" | ")); } },
			{ say: "click an empty cell of the roll: the new note fires all three envelopes (A F L lit) and has its pitch", act: (u, c) => { c.n0 = histN(); c.pitch = rollCell(0, 0).n; c.s = freeSteps(0, 1, 6, c.pitch)[0]; const p = rollPitch(0, c.s, c.pitch); u.click(p.c, {}, p.fx, p.fy); },
				machine: c => ok(bitsOf(0, "trig").includes(c.s) && ["amp", "filter", "lfo"].every(k => bitsOf(0, k).includes(c.s)) && noteAt(0, c.s).join() === String(c.pitch), `trig ${bitsOf(0, "trig").includes(c.s)}, amp ${bitsOf(0, "amp").includes(c.s)}, filter ${bitsOf(0, "filter").includes(c.s)}, lfo ${bitsOf(0, "lfo").includes(c.s)}, note ${noteAt(0, c.s)}`),
				screen: c => ok(["a", "f", "l"].every(b => $1(dot(b, c.s))?.getAttribute("aria-pressed") === "true"), "dots"), within: 8000 },
			{ say: "click A: only the amp trig goes; click F: only the filter trig goes; the trig and the pitch stay", act: async (u, c) => { u.click(dot("a", c.s)); await until(() => !bitsOf(0, "amp").includes(c.s), 4000); c.a = [bitsOf(0, "amp").includes(c.s), bitsOf(0, "filter").includes(c.s), bitsOf(0, "lfo").includes(c.s)];
					u.click(dot("f", c.s)); await until(() => !bitsOf(0, "filter").includes(c.s), 4000); c.f = [bitsOf(0, "amp").includes(c.s), bitsOf(0, "filter").includes(c.s), bitsOf(0, "lfo").includes(c.s)]; },
				machine: c => ok(same(c.a, [false, true, true]) && same(c.f, [false, false, true]) && bitsOf(0, "trig").includes(c.s) && noteAt(0, c.s).join() === String(c.pitch), `after A ${c.a}, after F ${c.f}`), within: 10000 },
			{ say: "click L: the last one goes: a trig with no envelopes, the pitch kept (it sets a pitch or holds locks); the roll draws it outlined", act: async (u, c) => { u.click(dot("l", c.s)); await until(() => !bitsOf(0, "lfo").includes(c.s), 4000); await sleep(200); c.span = noteSpans(0).find(sp => sp.s === c.s); },
				machine: c => ok(["amp", "filter", "lfo"].every(k => !bitsOf(0, k).includes(c.s)) && bitsOf(0, "trig").includes(c.s) && noteAt(0, c.s).join() === String(c.pitch), "bits"), screen: c => ok(c.span?.kind === "trigless", "span " + JSON.stringify(c.span?.kind)), within: 8000 },
			{ say: "a lock drawn on that trigless step holds", act: async (u, c) => { const k = $1('[data-dock="locks"]'); if (k) u.click(k); await sleep(200); c.lane = S().lane; await u.drag(`#lane .lb[data-s="${c.s}"]`, [[0, -3]], {}, { fy: 0.5 }); },
				machine: c => { const [pg, pi] = [PAGES.indexOf(c.lane.split(".")[0]), +c.lane.split(".")[1]]; const l = (patDoc().locks || []).find(x => x.track === 0 && x.page === pg && x.param === pi); return ok(l && l.steps.some(([x]) => x === c.s), "locks " + JSON.stringify(l)); }, within: 8000 },
			{ say: "click L alone: the LFO trig only, the others stay off (the LFO is trigged on its own)", act: async (u, c) => { u.click(dot("l", c.s)); await until(() => bitsOf(0, "lfo").includes(c.s), 4000); },
				machine: c => ok(bitsOf(0, "lfo").includes(c.s) && !bitsOf(0, "amp").includes(c.s) && !bitsOf(0, "filter").includes(c.s), `amp ${bitsOf(0, "amp").includes(c.s)}, filter ${bitsOf(0, "filter").includes(c.s)}, lfo ${bitsOf(0, "lfo").includes(c.s)}`), within: 6000 },
			{ say: "a trig with no pitch of its own (envelope trigs only: its note is the one before): click its A dot: the amp trig flips, the step stays without a pitch", act: async (u, c) => {
					const found = [0, 1, 2, 3, 4, 5].map(t => [t, noteSpans(t).find(sp => sp.pitchless && sp.st.a)]).find(([, sp]) => sp); if (!found) throw new Error("no pitchless trig in the pattern"); c.pt = found[0]; c.ps = found[1].s; u.click(rail(c.pt)); await sleep(300);
					c.a0 = bitsOf(c.pt, "amp").includes(c.ps); u.click(dot("a", c.ps)); await until(() => bitsOf(c.pt, "amp").includes(c.ps) !== c.a0, 4000); },
				machine: c => ok(bitsOf(c.pt, "amp").includes(c.ps) !== c.a0 && bitsOf(c.pt, "trig").includes(c.ps) && !noteAt(c.pt, c.ps).length, `amp ${bitsOf(c.pt, "amp").includes(c.ps)}, notes ${noteAt(c.pt, c.ps)}`), screen: c => ok(noteSpans(c.pt).find(sp => sp.s === c.ps)?.pitchless === true, "span"), within: 6000 }
		],
		async tidy(u, c) { drawBack(c); if (c.n0 != null) await undoTo(u, c.n0); }
	};
	/* the keys that play: the home row on the selected track's channel, velocity C and V, octave Z and X; the roll's pitch, an octave by drag, a chord, a note gone */
	const noteWires = n0 => nonSys(n0).filter(w => w.kind === "note").map(w => w.b);
	const playKey = async (u, k) => { const w0 = wireSeq; blur(); u.key(k); await until(() => noteWires(w0).length >= 2, 2000); await sleep(100); return noteWires(w0); };
	const pitchKeys = {
		name: "mm-seq-pitch-keys", proves: ["MM-028", "MM-034", "MM-074", "MM-077", "MM-173", "MM-174", "MM-176", "MM-348"],
		steps: [
			go("seq"), sel(0), drawOn,
			{ say: "click three rows of the roll: each note has the pitch of the row it was clicked in", act: async (u, c) => { c.n0 = histN(); const p0 = rollPitch(0, 0, rollCell(0, 0).n); c.pitches = [p0.lo + 2, Math.floor((p0.lo + p0.hi) / 2), p0.hi - 2]; c.steps = c.pitches.map((pt, k) => freeSteps(0, 1, 6 + k * 3, pt)[0]); if (c.steps.some(s => s == null)) throw new Error("no free steps");
					for (const [k, s] of c.steps.entries()) { const p = rollPitch(0, s, c.pitches[k]); u.click(p.c, {}, p.fx, p.fy); await sleep(300); } },
				machine: c => ok(c.steps.every((s, k) => noteAt(0, s).join() === String(c.pitches[k])), `notes ${c.steps.map(s => noteAt(0, s))} for ${c.pitches}`), within: 12000 },
			{ say: "drag the lowest note up twelve rows (an octave): its pitch is twelve more", act: async (u, c) => { c.from = c.pitches[0]; const p = rollPitch(0, c.steps[0], c.from); await u.drag(p.c, [[0, -p.rh * 4], [0, -p.rh * 8], [0, -p.rh * 12]], {}, { fx: p.fx, fy: p.fy }); },
				machine: c => ok(noteAt(0, c.steps[0]).join() === String(c.from + 12), `note ${noteAt(0, c.steps[0])}, from ${c.from}`), within: 8000 },
			{ say: "scroll the roll with Shift: it moves by an octave", act: async (u, c) => { const cv = rollPitch(0, 0, rollCell(0, 0).n).c; c.lo0 = S().rollLoT[0] ?? S().rollLo; u.wheel(cv, 1, { shift: true }); await sleep(200); c.lo1 = S().rollLoT[0] ?? S().rollLo; u.wheel(cv, -1, { shift: true }); await sleep(200); c.lo2 = S().rollLoT[0] ?? S().rollLo; },
				screen: c => ok(Math.abs(c.lo1 - c.lo0) === 12 && c.lo2 === c.lo0, `from ${c.lo0} to ${c.lo1}, back to ${c.lo2}`) },
			{ say: "Shift-click another pitch on a note's step: a chord of two notes", act: async (u, c) => { const s = c.steps[1], p0 = rollPitch(0, s, c.pitches[1]), want = c.pitches[1] + 4; if (want > p0.hi) c.cp = c.pitches[1] - 4; else c.cp = want; const p = rollPitch(0, s, c.cp); u.click(p.c, { shift: true }, p.fx, p.fy); await until(() => bitsOf(0, "chord").includes(s), 4000); },
				machine: c => ok(bitsOf(0, "chord").includes(c.steps[1]) && S().tracks[0].steps[c.steps[1]]?.n?.length === 2 && S().tracks[0].steps[c.steps[1]].n.includes(c.cp), `chord ${bitsOf(0, "chord").includes(c.steps[1])}, notes ${JSON.stringify(S().tracks[0].steps[c.steps[1]]?.n)}`), within: 8000 },
			{ say: "Alt-click the third note: the note is gone", act: async (u, c) => { const p = rollPitch(0, c.steps[2], c.pitches[2]); u.click(p.c, { alt: true }, p.fx, p.fy); await until(() => !bitsOf(0, "trig").includes(c.steps[2]), 4000); },
				machine: c => ok(!bitsOf(0, "trig").includes(c.steps[2]) && !noteAt(0, c.steps[2]).length, `trig ${bitsOf(0, "trig").includes(c.steps[2])}, notes ${noteAt(0, c.steps[2])}`), within: 8000 },
			{ say: "V raises the keyboard velocity to 127, C twice brings it to 80: A plays a note on track 1's channel at that velocity, and lets go with its note off", act: async (u, c) => { c.bad = []; const ch = 0x90 | baseCh(), off = 0x80 | baseCh();
					let w = await playKey(u, "a"); const base = w[0]?.[1]; if (!base) c.bad.push("A: " + JSON.stringify(w));
					blur(); u.key("v"); blur(); u.key("v"); w = await playKey(u, "a"); if (!(w[0]?.[0] === ch && w[0][2] === 127 && w[1]?.[0] === off && w[1][1] === w[0][1] && w[1][2] === 0)) c.bad.push("at 127: " + JSON.stringify(w));
					blur(); u.key("c"); blur(); u.key("c"); w = await playKey(u, "a"); if (!(w[0]?.[0] === ch && w[0][2] === 80)) c.bad.push("at 80: " + JSON.stringify(w)); c.base = base; },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 },
			{ say: "X raises the octave: A plays an octave higher; Z twice: an octave lower than the start", act: async (u, c) => { c.bad = []; blur(); u.key("x"); let w = await playKey(u, "a"); if (w[0]?.[1] !== c.base + 12) c.bad.push("octave +1: " + JSON.stringify(w) + " from " + c.base);
					blur(); u.key("z"); blur(); u.key("z"); w = await playKey(u, "a"); if (w[0]?.[1] !== c.base - 12) c.bad.push("octave -1: " + JSON.stringify(w)); blur(); u.key("x"); },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 },
			{ say: "each of the six tracks, picked on the rail, plays from A on its own channel, and its SYN value moves on that channel", act: async (u, c) => { c.bad = []; for (let t = 0; t < 6; t++) { u.click(rail(t)); await sleep(200); const w = await playKey(u, "a"); if (w[0]?.[0] !== (0x90 | (baseCh() + t))) c.bad.push(`T${t + 1}: ${JSON.stringify(w)}`); } },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 }
		],
		async tidy(u, c) { drawBack(c); blur(); u.key("v"); if (c.n0 != null) await undoTo(u, c.n0); }
	};
	/* ---- Parameter locks: the seven data pages of the lane picker, a value on every step, the pool of 62, live recording ---- */
	const laneTabs = () => $all("[data-lpage]").map(b => b.textContent.trim());
	const lockList = () => (patDoc()?.locks || []);
	const lockVals = (t, pg, pi) => { const l = lockList().find(x => x.track === t && x.page === pg && x.param === pi); return l ? l.steps.slice().sort((a, b) => a[0] - b[0]) : []; };
	/* pick lane (page, index) of the selected track and draw one lock on step s at height fy */
	const drawLock = async (u, g, i, s, fy) => { u.click(`[data-lpage="${g}"]`); await sleep(30); u.click(`.pk[data-lane="${g}.${i}"]`); await sleep(30); await u.drag(`#lane .lb[data-s="${s}"]`, [[0, -1]], {}, { fy, settle: 40, stepMs: 10 }); };
	const locksJ = {
		name: "mm-seq-locks", proves: ["MM-017", "MM-113", "MM-205", "MM-206", "MM-208"],
		steps: [
			go("seq"), sel(0),
			{ say: "the lock lane's picker has the seven data pages in order; each lists that page's own values; LEV is on none of them (it is not lockable)", act: async (u, c) => { c.bad = []; if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); await sleep(200);
					if (laneTabs().join(" ") !== "SYN AMP FLT EFX LF1 LF2 LF3") c.bad.push("tabs " + laneTabs().join(" "));
					for (const g of PAGES) { u.click(`[data-lpage="${g}"]`); await sleep(60); const names = $all(".pkcol .pk[data-lane]").map(b => b.textContent.replace(/\d+$/, "")); const want = pnames(0, g).filter(Boolean);
						if (names.join(" ") !== want.join(" ")) c.bad.push(`${g}: ${names.join(" ")} (page: ${want.join(" ")})`); if (names.some(n => /^LEV/.test(n))) c.bad.push(g + " lists LEV"); if (S().lanePage !== g || $1(`[data-lpage="${g}"]`).getAttribute("aria-pressed") !== "true") c.bad.push("tab " + g + " not lit"); } },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 },
			{ say: "lock AMP ATK on three trigs, each drawn at its own height: three different values, the higher the bar the higher the value", act: async (u, c) => { c.n0 = histN(); c.t = [0, 1, 2, 3, 4, 5].find(t => trigsOf(t).length >= 3); u.click(rail(c.t)); await sleep(300); if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); await sleep(200);
					c.on = trigsOf(c.t).filter(s => s < S().len).slice(0, 3); await drawLock(u, "AMP", 0, c.on[0], 0.2); await drawLock(u, "AMP", 0, c.on[1], 0.5); await drawLock(u, "AMP", 0, c.on[2], 0.8); await sleep(500); c.v = lockVals(c.t, 1, 0); },
				machine: c => ok(c.v.length === 3 && c.v[0][1] > c.v[1][1] && c.v[1][1] > c.v[2][1] && c.v.every(([s], k) => s === c.on[k]), "locks " + JSON.stringify(c.v)), within: 8000 },
			{ say: "draw the middle step again, higher: only its value changes (edited in the grid afterwards)", act: async (u, c) => { c.before = c.v.map(x => x.slice()); await u.drag(`#lane .lb[data-s="${c.on[1]}"]`, [[0, -1]], {}, { fy: 0.1, settle: 40, stepMs: 10 }); await sleep(500); c.v2 = lockVals(c.t, 1, 0); },
				machine: c => ok(c.v2.length === 3 && c.v2[1][1] > c.before[1][1] && c.v2[0][1] === c.before[0][1] && c.v2[2][1] === c.before[2][1], `before ${JSON.stringify(c.before)}, after ${JSON.stringify(c.v2)}`), within: 8000 },
			{ say: "lock parameter after parameter across the tracks until the pattern holds 62: the LCD counts them all (the pool is the pattern's, not a track's)", act: async (u, c) => { c.fill = []; c.tr = new Set();
					outer: for (let t = 0; t < 6; t++) { if (trigsOf(t).length < 1) continue; let added = 0; u.click(rail(t)); await sleep(150); if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); const s = trigsOf(t).find(x => x < S().len); if (s == null) continue;
						for (const g of PAGES) for (const [i, nm] of pnames(t, g).entries()) { if (!nm) continue; if (lockList().length >= 62) break outer; if (added >= 20) continue; if (lockVals(t, PAGES.indexOf(g), i).length) continue; const n = lockList().length; await drawLock(u, g, i, s, 0.4); if (!await until(() => lockList().length === n + 1, 3000)) { c.fill.push(`T${t + 1} ${g}.${i}: ${lockList().length}`); break outer; } c.tr.add(t); added++; } }
					await sleep(300); c.n = lockList().length; c.lcd = $1("#lockn").textContent; },
				machine: c => ok(c.n === 62 && !c.fill.length && c.tr.size >= 2, `${c.n} locked parameters on ${c.tr.size} tracks ${c.fill.join(" ")}`), screen: c => ok(c.lcd === "62/62" && $1("#meter").classList.contains("full"), `LCD ${c.lcd}, meter ${$1("#meter").className}`), within: 1000 },
			{ say: "a 63rd parameter is refused: the machine keeps 62, the page says all are in use", act: async (u, c) => { const t = [0, 1, 2, 3, 4, 5].find(x => trigsOf(x).length && [...PAGES].some(g => pnames(x, g).some((nm, i) => nm && !lockVals(x, PAGES.indexOf(g), i).length))); u.click(rail(t)); await sleep(200); const g = PAGES.find(g => pnames(t, g).some((nm, i) => nm && !lockVals(t, PAGES.indexOf(g), i).length)), i = pnames(t, g).findIndex((nm, i) => nm && !lockVals(t, PAGES.indexOf(g), i).length); c.n1 = lockList().length;
					await drawLock(u, g, i, trigsOf(t).find(x => x < S().len), 0.4); await sleep(800); },
				screen: () => ok(/All 62 locked parameters are in use/.test($1("#toast")?.textContent || ""), "toast " + $1("#toast")?.textContent), machine: c => ok(lockList().length === 62 && c.n1 === 62, "locks " + lockList().length), within: 6000 }
		],
		async tidy(u, c) { if (c.n0 != null) await undoTo(u, c.n0); }
	};
	/* LIVE RECORDING: a value turned while the pattern plays is locked on the step that plays (the firmware does it; the page names it) */
	const recLocks = {
		name: "mm-seq-record-locks", proves: ["MM-082", "MM-207"],
		steps: [
			go("sound"), sel(0),
			{ say: "press Alt+Space: live recording, playing", act: (u, c) => { c.p0 = pat0(); c.l0 = lockList().length; blur(); results.length = 0; u.key(" ", { alt: true }, "Space"); },
				machine: () => ok(tele.last?.record === "live" && tele.last?.playing, `record ${tele.last?.record}, playing ${tele.last?.playing}`), within: 8000 },
			{ say: "turn AMP's DEC on Sound: the CC goes to the machine on track 1's channel, the page says which step it locks", act: async (u, c) => { c.r = await nudgeBox(u, 0, "AMP", 2); await sleep(300); c.toast = $1("#toast")?.textContent || ""; c.cell = c.r.v1; },
				machine: c => ok(!checkBox(c.r, 0, "AMP", 2) && /Locks T1 AMP DEC on step \d+/.test(c.toast), `${checkBox(c.r, 0, "AMP", 2) || ""} toast "${c.toast}"`), within: 6000 },
			{ say: "click RECORD off, then STOP: the pattern holds a lock of AMP DEC, with the value turned, on a step of track 1", act: async (u, c) => { u.click("#rec"); await sleep(800); if (S().playing) u.click("#play"); await sleep(1500); },
				machine: c => { const l = lockVals(0, 1, 2); return ok(l.length >= 1 && l.some(([, v]) => v === c.cell), `locks ${JSON.stringify(l)}, value turned ${c.cell}`); }, within: 10000 },
			go("seq"),
			{ say: "on Sequence the lane picker counts the lock the recording made on AMP DEC; the lane's clear key takes it away", act: async (u, c) => { if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); await sleep(200); u.click('[data-lpage="AMP"]'); await sleep(60); u.click('.pk[data-lane="AMP.2"]'); await sleep(300); c.has = $1('.pk[data-lane="AMP.2"]')?.classList.contains("has") && +$1('.pk[data-lane="AMP.2"] i')?.textContent >= 1; u.click("#clearLane"); await sleep(600); },
				screen: c => ok(c.has, "AMP DEC in the picker has no locked step"), machine: () => ok(lockVals(0, 1, 2).length === 0, "locks " + JSON.stringify(lockVals(0, 1, 2))), within: 8000 }
		],
		async tidy(u, c) { if (tele.last?.record && tele.last.record !== "off") u.click("#rec"); await sleep(400); if (S().playing) u.click("#play"); await sleep(800); if (c.p0) await undoUntil(u, () => pat0() === c.p0, 4); const n0 = c.l0; if (n0 != null && lockList().length !== n0) { for (const l of lockList().slice()) if (l.track === 0 && l.page === 1 && l.param === 2) Bridge.send({ op: "clearLane", t: 0, page: 1, param: 2 }); await sleep(800); } }
	};
	/* ---- Sequence docks and the LCD: the arpeggiators, the scale setup, transpose, trig setup (Additional sequencer features) ---- */
	const trackDoc = t => t < 6 ? patDoc().tracks[t] : patDoc().midiTracks[t - 6];
	const arpOf = t => trackDoc(t).arp;
	const dockOpen = async (u, d) => { u.click(`[data-dock="${d}"]`); await sleep(300); };
	const arpSetup = {
		name: "mm-seq-arp-setup", proves: ["MM-008", "MM-216", "MM-218", "MM-220", "MM-222", "MM-223", "MM-224", "MM-225"],
		steps: [
			go("seq"), sel(0),
			{ say: "all twelve arpeggiators (six synth tracks, six MIDI tracks): each track's mode key sets its own arpeggiator and no other", act: async (u, c) => { c.n0 = histN(); c.bad = []; await dockOpen(u, "arp");
					for (const t of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) { if (t >= 6 && S().side !== "midi") { u.click('[data-side="midi"]'); await sleep(300); } if (t < 6 && S().side === "midi") { u.click('[data-side="int"]'); await sleep(300); } u.click(rail(t)); await sleep(250); if (!$1('[data-set="arpmode"]')) await dockOpen(u, "arp");
						const before = [...Array(12).keys()].map(x => JSON.stringify(arpOf(x))); const m0 = arpOf(t).mode, v = m0 === 1 ? 2 : 1; u.click(`[data-set="arpmode"] button[data-v="${v}"]`); if (!await until(() => arpOf(t).mode === v, 4000)) { c.bad.push(`T${t + 1}: mode ${arpOf(t).mode} for ${v}`); continue; }
						const after = [...Array(12).keys()].map(x => JSON.stringify(arpOf(x))); if (after.some((a, x) => x !== t && a !== before[x])) c.bad.push(`T${t + 1}: another arpeggiator changed`); } },
				screen: c => ok(!c.bad.length, c.bad.slice(0, 4).join(" | ")), within: 1000 },
			{ say: "on track 1: the four modes OFF KEY SID ADD, and the five PLAY keys TRUE UP DOWN CYCLE RND, each its own value in the pattern", act: async (u, c) => { c.bad = []; if (S().side === "midi") { u.click('[data-side="int"]'); await sleep(300); } u.click(rail(0)); await sleep(250); if (!$1('[data-set="arpmode"]')) await dockOpen(u, "arp");
					if ($all('[data-set="arpmode"] button').map(b => b.textContent).join(" ") !== "OFF KEY SID ADD") c.bad.push("modes " + $all('[data-set="arpmode"] button').map(b => b.textContent)); if ($all('[data-set="arpplay"] button').map(b => b.textContent).join(" ") !== "TRUE UP DOWN CYCLE RND") c.bad.push("play " + $all('[data-set="arpplay"] button').map(b => b.textContent));
					for (let i = 0; i < 4; i++) { u.click(`[data-set="arpmode"] button[data-v="${i}"]`); if (!await until(() => arpOf(0).mode === i, 3000)) c.bad.push(`mode ${i}: ${arpOf(0).mode}`); }
					u.click('[data-set="arpmode"] button[data-v="1"]'); await until(() => arpOf(0).mode === 1, 3000);
					for (let i = 0; i < 5; i++) { u.click(`[data-set="arpplay"] button[data-v="${i}"]`); if (!await until(() => arpOf(0).play === i, 3000)) c.bad.push(`PLAY ${i}: ${arpOf(0).play}`); } },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 },
			{ say: "SPD 6 is a sixteenth: the light notes follow one to a step; OJMP typed: the pattern holds it", act: async (u, c) => { const q = '.pc[data-g="arp"][data-n="SPD"]'; u.click(q, { cmd: true }); typeIn(u, "6"); await until(() => arpOf(0).speed === 5, 4000); c.sp = arpOf(0).speed;
					c.ticks = arpTicks(0, { s: 0, e: 4, n: [60] }).map(k => k.w); const o = '.pc[data-g="arp"][data-n="OJMP"]'; u.click(o, { cmd: true }); typeIn(u, "5"); await until(() => arpOf(0).ojmp === 5, 4000); c.oj = arpOf(0).ojmp; },
				machine: c => ok(c.sp === 5 && c.ticks.length >= 1 && c.ticks.every(w => w === 1) && c.oj === 5, `speed ${c.sp}, tick lengths ${c.ticks}, ojmp ${c.oj}`), within: 8000 },
			{ say: "TRIG keys AMP FLT LFO: each switches that envelope the arpeggiator's notes fire (the pattern's trigs bits 1, 2, 4); a MIDI track has none", act: async (u, c) => { c.bad = []; for (const k of ["amp", "flt", "lfo"]) { const bit = { amp: 1, flt: 2, lfo: 4 }[k], was = arpOf(0).trigs & bit; u.click(`[data-arptrig="${k}"]`); if (!await until(() => (arpOf(0).trigs & bit) !== was, 3000)) c.bad.push(`${k}: ${arpOf(0).trigs}`); }
					u.click('[data-side="midi"]'); await sleep(300); u.click(rail(6)); await sleep(250); if (!$1('[data-set="arpmode"]')) await dockOpen(u, "arp"); c.none = $all("[data-arptrig]").length === 0 && /none on MIDI/.test($1(".dkna")?.textContent || ""); u.click('[data-side="int"]'); await sleep(300); u.click(rail(0)); await sleep(250); },
				screen: c => ok(!c.bad.length && c.none, c.bad.join(" | ") + " MIDI none " + c.none), within: 1000 },
			{ say: "the sixteen cells: a click mutes step 3 (255) and again brings it back; a drag up to the top and past it gives +24, down to the bottom -24; a click past the length extends it; the LEN row sets it", act: async (u, c) => { c.bad = []; const cell = k => `.arptrack .ac[data-ac="${k}"]`; u.click(rail(0)); await sleep(200); const was = arpOf(0).steps[2], mute0 = was === 255;
					u.click(cell(2)); if (!await until(() => (arpOf(0).steps[2] === 255) !== mute0, 3000)) c.bad.push("mute: " + arpOf(0).steps[2]); u.click(cell(2)); if (!await until(() => (arpOf(0).steps[2] === 255) === mute0, 3000)) c.bad.push("unmute: " + arpOf(0).steps[2]);
					const k0 = Math.min(3, arpOf(0).length - 1); await u.drag(cell(k0), [[0, -60], [0, -120], [0, -240]]); if (!await until(() => arpOf(0).steps[k0] === 64 + 24, 3000)) c.bad.push("+24: " + arpOf(0).steps[k0]);
					await u.drag(cell(k0), [[0, 60], [0, 120], [0, 240], [0, 400]]); if (!await until(() => arpOf(0).steps[k0] === 64 - 24, 3000)) c.bad.push("-24: " + arpOf(0).steps[k0]);
					const L = arpOf(0).length, want = L === 8 ? 6 : 8; u.click(`[data-arplen="${want}"]`); if (!await until(() => arpOf(0).length === want, 3000)) c.bad.push(`LEN ${want}: ${arpOf(0).length}`);
					const pastEnd = $1(".arptrack .ac.na"); if (pastEnd) { const k = +pastEnd.dataset.ac; u.click(pastEnd); if (!await until(() => arpOf(0).length === k + 1, 3000)) c.bad.push(`extend to ${k + 1}: ${arpOf(0).length}`); } else c.bad.push("no cell past the end"); },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 }
		],
		async tidy(u, c) { if (S().side === "midi") u.click('[data-side="int"]'); if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); if (c.n0 != null) await undoTo(u, c.n0); }
	};
	/* the LCD's second line: LEN, ×2, SPD, SWG; the Transpose dock: SCALE, KEY, TRACK and PAT; the Trig setup dock */
	const lcdSetup = {
		name: "mm-seq-scale-setup", proves: ["MM-046", "MM-168", "MM-169", "MM-227", "MM-228", "MM-229", "MM-230"],
		steps: [
			go("seq"), sel(0),
			{ say: "click SPD on the LCD four times: 1X, 2X, 3/4X, 3/2X, in that order, each the pattern's multiplier", act: async (u, c) => { c.n0 = histN(); c.bad = []; c.seen = [patDoc().multiplier]; for (let i = 0; i < 4; i++) { const m = patDoc().multiplier; u.click('#lcd2 [data-l2="mult"]'); if (!await until(() => patDoc().multiplier !== m, 3000)) { c.bad.push("SPD stayed " + m); break; } c.seen.push(patDoc().multiplier); } },
				screen: c => ok(!c.bad.length && ["1X", "2X", "3/4X", "3/2X"].every(m => c.seen.includes(m)) && c.seen[4] === c.seen[0] && same(c.seen.slice(0, 4).map(x => ["1X", "2X", "3/4X", "3/2X"].indexOf(x)).map((x, k, a) => (x - a[0] + 4) % 4), [0, 1, 2, 3]), "seen " + c.seen + " " + c.bad), within: 1000 },
			{ say: "scroll SWG up and down past its ends: it stops at 50 % and at 80 %, the pattern holds the percent over 50", act: async (u, c) => { for (let i = 0; i < 40; i++) { u.wheel('#lcd2 [data-l2="swing"]', 1); await sleep(15); } await sleep(300); c.hi = patDoc().swingAmount; c.hit = $1('#lcd2 [data-l2="swing"] b').textContent; for (let i = 0; i < 40; i++) { u.wheel('#lcd2 [data-l2="swing"]', -1); await sleep(15); } await sleep(300); c.lo = patDoc().swingAmount; c.lot = $1('#lcd2 [data-l2="swing"] b').textContent; },
				machine: c => ok(c.hi === 30 && c.lo === 0 && c.hit === "80%" && c.lot === "50%", `top ${c.hi} ${c.hit}, bottom ${c.lo} ${c.lot}`), within: 8000 },
			{ say: "click ×2 on the LCD: the pattern doubles, the new pages copies of the first (the notes of the first half again in the second)", act: async (u, c) => { c.len0 = patDoc().length; if (c.len0 > 32) { u.click('#lcd2 [data-l2="len"]'); await sleep(500); } c.len = patDoc().length; c.t0 = bitsOf(0, "trig").filter(s => s < c.len); c.notes0 = (patDoc().tracks[0].notes || []).filter(([s]) => s < c.len); u.click('#lcd2 [data-l2="dbl"]'); await until(() => patDoc().length === c.len * 2, 4000); },
				machine: c => ok(patDoc().length === c.len * 2 && same(bitsOf(0, "trig").filter(s => s >= c.len && s < 2 * c.len).map(s => s - c.len), c.t0) && same((patDoc().tracks[0].notes || []).filter(([s]) => s >= c.len && s < 2 * c.len).map(([s, n]) => [s - c.len, n]), c.notes0), `length ${patDoc().length} for ${c.len * 2}; trigs ${bitsOf(0, "trig")} (first half ${c.t0}); notes ${JSON.stringify(patDoc().tracks[0].notes)}`), within: 8000 },
			{ say: "Transpose: the four SCALE keys --- FIX MAJ MIN, each the track's scale", act: async (u, c) => { c.bad = []; await dockOpen(u, "trn"); const names = $all('[data-set="scale"] button').map(b => b.textContent); if (names.join(" ") !== "--- FIX MAJ MIN") c.bad.push("keys " + names);
					for (let i = 0; i < 4; i++) { u.click(`[data-set="scale"] button[data-v="${i}"]`); if (!await until(() => patDoc().tracks[0].scale === i, 3000)) c.bad.push(`scale ${i}: ${patDoc().tracks[0].scale}`); } },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 },
			{ say: "with MAJ: a click on the keyboard picture sets KEY (the root); on E the pattern holds 4", act: async (u, c) => { u.click('[data-set="scale"] button[data-v="2"]'); await until(() => patDoc().tracks[0].scale === 2, 3000); const cv = $1('#dkvis canvas[data-ed="dktrn"]'), r = cv.getBoundingClientRect(), k = ED.dktrn.keys(r.width, r.height).find(x => x.n === 4); c.k0 = patDoc().tracks[0].key; u.click(cv, {}, (k.x + k.w / 2) / r.width, (k.y + k.h * 0.85) / r.height); await until(() => patDoc().tracks[0].key === 4, 3000); },
				machine: () => ok(patDoc().tracks[0].key === 4, "KEY " + patDoc().tracks[0].key), within: 6000 },
			{ say: "PAT is the pattern's transpose, shared by all tracks: typed +5, the pattern holds 5 and no track's own transpose moves", act: async (u, c) => { c.tr = [0, 1, 2, 3, 4, 5].map(t => patDoc().tracks[t].transpose); const q = '#main .pc[data-g="ptrn"][data-n="PAT"]'; u.click(q, { cmd: true }); typeIn(u, "+5"); await until(() => patDoc().patternTranspose === 5, 4000); },
				machine: c => ok(patDoc().patternTranspose === 5 && [0, 1, 2, 3, 4, 5].every(t => patDoc().tracks[t].transpose === c.tr[t]), `PAT ${patDoc().patternTranspose}, tracks ${[0, 1, 2, 3, 4, 5].map(t => patDoc().tracks[t].transpose)}`), within: 6000 }
		],
		async tidy(u, c) { if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); if (c.n0 != null) await undoTo(u, c.n0); }
	};
	const trigSetup = {
		name: "mm-seq-trig-setup", proves: ["MM-121", "MM-151", "MM-153", "MM-161"],
		steps: [
			go("seq"), sel(0),
			{ say: "Trig setup: PORT's box (ATK, HOLD, DEC, PORT are the four boxes) sends CC 63 on the track's channel", act: async (u, c) => { c.n0 = histN(); await dockOpen(u, "trig"); c.r = await nudgeBox(u, 0, "AMP", 7); Journey.snapshot("mm-trig-setup"); },
				machine: c => ok(!checkBox(c.r, 0, "AMP", 7), checkBox(c.r, 0, "AMP", 7) || ""), within: 8000 },
			{ say: "PORT ALWAYS or ONLY LEGATO: the kit's portamento mask has track 1's bit as set (ALWAYS) or clear", act: async (u, c) => { c.bad = []; const bit = x => (wk().trackMasks.portamento >> 0) & 1; for (const v of [0, 1]) { u.click(`[data-set="port"] button[data-v="${v}"]`); if (!await until(() => bit() === (v === 0 ? 1 : 0), 4000)) c.bad.push(`PORT ${v}: mask ${wk().trackMasks.portamento}`); } },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 },
			{ say: "LEGATO A F L: each key flips that envelope's bit of track 1 in the kit's masks", act: async (u, c) => { c.bad = []; for (const [k, f] of [["amp", "legatoAmp"], ["flt", "legatoFilter"], ["lfo", "legatoLfo"]]) { const was = wk().trackMasks[f] & 1; u.click(`[data-leg="${k}"]`); if (!await until(() => (wk().trackMasks[f] & 1) !== was, 4000)) c.bad.push(`${k}: ${wk().trackMasks[f]}`); } },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 },
			{ say: "TRIG POSITION: T2 on track 1, then T3 on track 2: the notes are forwarded (chainable: T1 to T2 to T3), each in its own track's kit; none takes it back", act: async (u, c) => { c.bad = [];
					u.click('[data-set="trigpos"] button[data-v="1"]'); if (!await until(() => wk().tracks[0].trigPos === 1, 4000)) c.bad.push("T1 to T2: " + wk().tracks[0].trigPos);
					u.click(rail(1)); await sleep(300); u.click('[data-set="trigpos"] button[data-v="2"]'); if (!await until(() => wk().tracks[1].trigPos === 2, 4000)) c.bad.push("T2 to T3: " + wk().tracks[1].trigPos); c.chain = [wk().tracks[0].trigPos, wk().tracks[1].trigPos];
					if ($1('[data-set="trigpos"] button[data-v="1"]')) c.noSelf = !$1('[data-set="trigpos"] button[data-v="1"]'); u.click('[data-set="trigpos"] button[data-v=""]'); if (!await until(() => wk().tracks[1].trigPos == null, 4000)) c.bad.push("none: " + wk().tracks[1].trigPos);
					u.click(rail(0)); await sleep(300); u.click('[data-set="trigpos"] button[data-v=""]'); if (!await until(() => wk().tracks[0].trigPos == null, 4000)) c.bad.push("none T1: " + wk().tracks[0].trigPos); },
				screen: c => ok(!c.bad.length && same(c.chain, [1, 2]), c.bad.join(" | ") + " chain " + c.chain), within: 1000 }
		],
		async tidy(u, c) { if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); if (c.n0 != null) await undoTo(u, c.n0); }
	};
	/* ---- The MIDI sequencer: six tracks of its own, their notes, chords, VEL PB PCHG and CC values, their channels and CC numbers (the MIDI sequencer chapter) ---- */
	const midiNotesAt = (m, s) => (patDoc()?.midiNotes || []).filter(e => e[0] === m && e[1] === s).map(e => e[2]);
	const mDoc = m => patDoc().midiTracks[m];
	const midiSeqJ = {
		name: "mm-midi-seq", proves: ["MM-003", "MM-048", "MM-086", "MM-242", "MM-244", "MM-245", "MM-246", "MM-247", "MM-314", "MM-315"],
		steps: [
			go("seq"), sel(0), drawOn,
			{ say: "click MIDI: the rail has the six MIDI tracks M1 to M6, each its own roll", act: async (u, c) => { c.n0 = histN(); u.click('[data-side="midi"]'); await sleep(400); c.names = $all("#rail .th .nm").length; },
				screen: () => ok(S().side === "midi" && S().sel >= 6 && [6, 7, 8, 9, 10, 11].every(t => !!$1(rail(t))), `side ${S().side}, track ${S().sel}`), within: 6000 },
			{ say: "click a note into each of the six MIDI tracks: that track's notes change, no other track's, no synth track's", act: async (u, c) => { c.bad = []; c.where = [];
					for (let m = 0; m < 6; m++) { u.click(rail(6 + m)); await sleep(250); const before = JSON.stringify([patDoc().tracks, patDoc().midiTracks.filter((x, i) => i !== m)]);
						const s = [...Array(S().len).keys()].find(x => x >= 8 && !mDoc(m).trig.includes(x) && !S().midi[m].steps[x] && !underBar(6 + m, x, rollCell(6 + m, 0).n)); if (s == null) { c.bad.push(`M${m + 1}: no free step`); continue; } const p = rollCell(6 + m, s); u.click(p.c, {}, p.fx, p.fy);
						if (!await until(() => mDoc(m).trig.includes(s), 4000)) { c.bad.push(`M${m + 1}: no note at ${s + 1}`); continue; } await sleep(200); c.where.push(s);
						if (JSON.stringify([patDoc().tracks, patDoc().midiTracks.filter((x, i) => i !== m)]) !== before) c.bad.push(`M${m + 1}: another track changed`); } },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), machine: c => ok(c.where.length === 6, c.where.length + " of 6"), within: 1000 },
			{ say: "Shift-click another pitch on M1's note: a chord, one length for all its notes (LEN is a lock of the step, one value)", act: async (u, c) => { u.click(rail(6)); await sleep(250); c.s = c.where[0]; const p0 = rollCell(6, c.s); c.p1 = p0.n + 3; const p = rollPitch(6, c.s, c.p1); u.click(p.c, { shift: true }, p.fx, p.fy); await until(() => midiNotesAt(0, c.s).length >= 2, 4000); },
				machine: c => ok(midiNotesAt(0, c.s).length >= 2 && midiNotesAt(0, c.s).includes(c.p1), `notes ${midiNotesAt(0, c.s)}`), screen: c => ok(S().midi[0].steps[c.s]?.n?.length >= 2, "page " + JSON.stringify(S().midi[0].steps[c.s])), within: 8000 },
			{ say: "the MIDI page's locks: VEL, PB and PCHG drawn on the note's step: each is a lock of the MIDI page (page 8 of the lane picker) on that step; PCHG is only sent when locked", act: async (u, c) => { c.bad = []; if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); await sleep(200); const t = 6;
					for (const [i, nm] of [[1, "VEL"], [2, "PB"], [3, "PCHG"]]) { u.click(`.pk[data-lane="MID.${i}"]`); await sleep(100); await u.drag(`#lane .lb[data-s="${c.s}"]`, [[0, -1]], {}, { fy: 0.3, settle: 40, stepMs: 10 }); if (!await until(() => lockVals(0, 7, i).some(([s]) => s === c.s), 4000)) c.bad.push(`${nm}: no lock`); }
					c.help = $1(".lanehelp")?.title || $1(".lanehelp")?.textContent || ""; await dockOpen(u, "midi"); c.help2 = ($1(".dkhelp")?.title || "") + ($1(".dkhelp")?.textContent || ""); },
				screen: c => ok(!c.bad.length && /PCHG only sends when it is locked/.test(c.help2), c.bad.join(" | ") + " help: " + c.help2.slice(0, 100)), within: 1000 },
			{ say: "CL1 typed CC74 and CL2 typed AFT: the global holds the CC number and 128 for AFT, on M1 only", act: async (u, c) => { c.cc0 = JSON.stringify(gDoc().midiSeq.ccs); const q = i => `.pc[data-g="cc"][data-n="${i}"]`; u.click(q(0), { cmd: true }); typeIn(u, "cc74"); await until(() => gDoc().midiSeq.ccs[0][0] === 74, 6000); u.click(q(1), { cmd: true }); typeIn(u, "aft"); await until(() => gDoc().midiSeq.ccs[0][1] === 128, 6000); c.now = gDoc().midiSeq.ccs; },
				machine: c => ok(c.now[0][0] === 74 && c.now[0][1] === 128 && c.now.slice(1).every((x, k) => same(x, JSON.parse(c.cc0)[k + 1])), "ccs " + JSON.stringify(c.now)), screen: () => ok($1('.pc[data-g="cc"][data-n="1"] b')?.textContent === "AFT" || /AFT/.test($1('#main')?.textContent || ""), "box"), within: 14000 },
			{ say: "the Channel keys: channel 4 for M1: the global holds it for that track only", act: async (u, c) => { c.ch0 = gDoc().midiSeq.channels.slice(); u.click('[data-set="mch"] button[data-v="4"]'); await until(() => gDoc().midiSeq.channels[0] === 3, 8000); c.now = gDoc().midiSeq.channels; },
				machine: c => ok(c.now[0] === 3 && c.now.slice(1).every((x, k) => x === c.ch0[k + 1]), "channels " + c.now), screen: () => ok(pressed('[data-set="mch"] button[data-v="4"]') && /CH 04/.test($1(".dkread, #dkread")?.textContent || $1(".snd, #main")?.textContent || ""), "key"), within: 12000 },
			{ say: "a MIDI page value is the kit's: VEL on M1 raised, the kit is edited, saved to its slot the slot holds it", act: async (u, c) => { const el = box("MID", 1); const v0 = wk().tracks[0].pages[7][1], mx = maxOf(ref(el)[2]); c.v0 = v0; el.focus(); u.key(v0 >= mx ? "ArrowDown" : "ArrowUp"); await until(() => wk().tracks[0].pages[7][1] !== v0, 4000); c.v1 = wk().tracks[0].pages[7][1]; c.ed = machine().kit?.working;
					u.click("#kitf"); await sleep(300); u.click('#libpop [data-la="save"]'); await answer(u, c); await until(() => I().doc("kit", machine().kit.current)?.tracks[0].pages[7][1] === c.v1, 8000); u.key("Escape"); },
				machine: c => ok(c.ed === "edited" && I().doc("kit", machine().kit.current)?.tracks[0].pages[7][1] === c.v1, `working ${c.ed}, stored ${I().doc("kit", machine().kit.current)?.tracks[0].pages[7][1]} for ${c.v1}`), within: 14000 }
		],
		async tidy(u, c) { if ($1("#libpop") && !$1("#libpop").hidden) u.key("Escape"); drawBack(c); if (c.ch0 && gDoc()?.midiSeq.channels[0] !== c.ch0[0]) { u.click(`[data-set="mch"] button[data-v="${c.ch0[0] + 1}"]`); await sleep(1200); } if (c.cc0 && JSON.stringify(gDoc()?.midiSeq.ccs) !== c.cc0) { const q = i => `.pc[data-g="cc"][data-n="${i}"]`; const o = JSON.parse(c.cc0)[0]; for (const i of [0, 1]) { u.click(q(i), { cmd: true }); typeIn(u, o[i] === 128 ? "aft" : "cc" + o[i]); await sleep(1200); } } if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); if (S().side === "midi") u.click('[data-side="int"]'); if (c.n0 != null) await undoTo(u, c.n0); }
	};
	/* a MIDI track has no trig tracks (its ENV row is VEL), no envelope switches on its arpeggiator, but swing, slide and transpose */
	const midiDocks = {
		name: "mm-midi-seq-docks", proves: ["MM-248"],
		steps: [
			go("seq"), sel(0),
			{ say: "on M1: the row under the roll is VEL, with no A F L dots", act: async (u, c) => { c.n0 = histN(); u.click('[data-side="midi"]'); await sleep(400); u.click(rail(6)); await sleep(300); },
				screen: () => ok(/VEL/.test($1(".tlane.env .tlab")?.textContent || "") && !$1("[data-env]") && S().sel === 6, "row " + $1(".tlane.env .tlab")?.textContent), within: 6000 },
			{ say: "Slide under the roll, drag across four step columns: those steps slide on M1; Swing on a column flips that step's swing", act: async (u, c) => { u.click('.ttrow [data-tt="sld"]'); await sleep(200); c.s0 = [...Array(S().len - 3).keys()].find(s => [0, 1, 2, 3].every(k => !(mDoc(0).slide || []).includes(s + k))); c.run = [0, 1, 2, 3].map(k => c.s0 + k);
					const f = rollFoot(c.s0); await u.drag(f.c, c.run.slice(1).map(s => [rollFoot(s).x - f.x, 0]), {}, { fx: f.fx, fy: f.fy }); await until(() => c.run.every(s => (mDoc(0).slide || []).includes(s)), 6000);
					u.click('.ttrow [data-tt="swg"]'); await sleep(200); c.w = c.run[0]; c.w0 = (mDoc(0).swing || []).includes(c.w); const g = rollFoot(c.w); u.click(g.c, {}, g.fx, g.fy); await until(() => (mDoc(0).swing || []).includes(c.w) !== c.w0, 6000); u.click('.ttrow [data-tt="note"]'); await sleep(300); },
				machine: c => ok(c.run.every(s => (mDoc(0).slide || []).includes(s)) && (mDoc(0).swing || []).includes(c.w) !== c.w0, `slide ${mDoc(0).slide}, swing ${mDoc(0).swing}`), within: 20000 },
			{ say: "Transpose: TRACK typed +3, the pattern holds 3 for M1; the Arp tab says there are no envelope switches on MIDI", act: async (u, c) => { await dockOpen(u, "trn"); const q = '#main .pc[data-g="trn"][data-n="TRACK"]'; u.click(q, { cmd: true }); typeIn(u, "+3"); await until(() => mDoc(0).transpose === 3, 6000); await dockOpen(u, "arp"); c.none = $all("[data-arptrig]").length === 0 && /none on MIDI/.test($1(".dkna")?.textContent || ""); },
				machine: c => ok(mDoc(0).transpose === 3 && c.none, `transpose ${mDoc(0).transpose}, no switches ${c.none}`), within: 10000 }
		],
		async tidy(u, c) { if (S().tt && S().tt !== "note") $1('.ttrow [data-tt="note"]')?.click(); if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); if (S().side === "midi") u.click('[data-side="int"]'); if (c.n0 != null) await undoTo(u, c.n0); }
	};
	/* ---- Perform: the keyboard's four modes and the channels they play on, MULTI TRIG and MULTI MAP set-up (Appendix B notes, GLOBAL channels, Additional kit settings) ---- */
	const gch = () => gDoc()?.channels;
	const keyMsgs = async (u, q = '.kb [data-key="60"]') => { midiSent.length = 0; u.click(q); await sleep(250); return midiSent.slice(); };
	const stepGlobal = async (u, ga, d) => { u.click("#globkey"); await sleep(300); const g0 = wireSeq; u.click(`#globpop [data-ga="${ga}"][data-d="${d}"]`); await globalSettled(g0); u.key("Escape"); await sleep(200); };
	const performKeys = {
		name: "mm-perform-keys-channels", proves: ["MM-073", "MM-088", "MM-089", "MM-291", "MM-292", "MM-293", "MM-349", "MM-350", "MM-351"],
		steps: [
			go("perform"),
			{ say: "Auto track: pick track 3 in the assign card, click a key: it plays that track, on its own channel (base + 2), as a note on and a note off", act: async (u, c) => { c.bad = []; u.click('[data-pmode="normal"]'); await sleep(300); u.click('[data-set="astrk"] button[data-v="2"]'); await sleep(300); const m = await keyMsgs(u); c.info = $1("#kbinfo")?.textContent;
					if (!(m.length === 2 && m[0][0] === (0x90 | (gch().base + 2)) && m[0][1] === 60 && m[0][2] > 0 && m[1][0] === (0x80 | (gch().base + 2)) || (m[1] && m[1][0] === (0x90 | (gch().base + 2)) && m[1][2] === 0))) c.bad.push("Auto track: " + JSON.stringify(m)); if (!/^T3 /.test(c.info)) c.bad.push("info " + c.info); },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 },
			{ say: "Multi trig, each of its four modes: one source plays all six tracks, so one note on the MULTI TRIG channel (7), whatever the mode", act: async (u, c) => { c.bad = []; u.click('[data-pmode="multi"]'); await sleep(400); c.m0 = wk().multiTrig.mode;
					for (let i = 0; i < 4; i++) { u.click(`[data-set="mtmode"] button[data-v="${i}"]`); if (!await until(() => wk().multiTrig.mode === i, 4000)) { c.bad.push("mode " + i); continue; } const m = await keyMsgs(u); if (!(m.length === 2 && m[0][0] === (0x90 | gch().multiTrig) && m[0][1] === 60)) c.bad.push(`mode ${i}: ${JSON.stringify(m)}`); }
					c.info = $1("#kbinfo")?.textContent; if (!/MULTI TRIG · C-4 · MIDI channel 7$/.test(c.info)) c.bad.push("info " + c.info); },
				screen: c => ok(!c.bad.length && gch().multiTrig === 6, c.bad.join(" | ")), within: 1000 },
			{ say: "GLOBAL: MULTI TRIG channel + once: the keyboard plays on channel 8 now, in every mode", act: async (u, c) => { c.mt0 = gch().multiTrig; await stepGlobal(u, "multiTrig", 1); await until(() => gch().multiTrig === c.mt0 + 1, 15000); c.m = await keyMsgs(u); },
				machine: c => ok(gch().multiTrig === c.mt0 + 1 && c.m[0]?.[0] === (0x90 | (c.mt0 + 1)), `channel ${gch().multiTrig}, sent ${JSON.stringify(c.m)}`), within: 20000 },
			{ say: "Multi map: the keyboard plays on the MULTI MAP channel (8); GLOBAL + once: channel 9", act: async (u, c) => { c.bad = []; u.click('[data-pmode="map"]'); await sleep(400); let m = await keyMsgs(u); if (m[0]?.[0] !== (0x90 | gch().multiMap)) c.bad.push("map: " + JSON.stringify(m)); c.mm0 = gch().multiMap; await stepGlobal(u, "multiMap", 1); await until(() => gch().multiMap === c.mm0 + 1, 15000); m = await keyMsgs(u); if (m[0]?.[0] !== (0x90 | (c.mm0 + 1))) c.bad.push("map +1: " + JSON.stringify(m)); c.info = $1("#kbinfo")?.textContent; },
				screen: c => ok(!c.bad.length && /MULTI MAP · C-4 · MIDI channel 9$/.test(c.info), c.bad.join(" | ") + " info " + c.info), within: 25000 },
			{ say: "Auto track channel: a note on the next channel lights no key (nothing plays it); GLOBAL + once, and the machine plays that channel: the same note lights the key", act: async (u, c) => { c.au0 = gch().auto; u.click('[data-pmode="normal"]'); await sleep(300); const lit = ch => $1('.kb [data-key="60"]')?.classList.contains("mi");
					window.gm.recv([{ type: "midiHeld", notes: [{ ch: c.au0 + 1, note: 60 }] }]); await sleep(150); c.before = lit(); window.gm.recv([{ type: "midiHeld", notes: [] }]); await stepGlobal(u, "auto", 1); await until(() => gch().auto === c.au0 + 1, 15000); await sleep(300);
					window.gm.recv([{ type: "midiHeld", notes: [{ ch: c.au0 + 1, note: 60 }] }]); await sleep(150); c.after = lit(); window.gm.recv([{ type: "midiHeld", notes: [] }]); },
				screen: c => ok(gch().auto === c.au0 + 1 && c.before === false && c.after === true, `auto ${gch().auto}, lit before ${c.before}, after ${c.after}`), within: 20000 }
		],
		async tidy(u, c) { for (const [k, v] of [["multiTrig", c.mt0], ["multiMap", c.mm0], ["auto", c.au0]]) if (v != null && gch()?.[k] !== v) await stepGlobal(u, k, -1); window.gm.recv([{ type: "midiHeld", notes: [] }]); if ($1('[data-pmode="normal"]')) u.click('[data-pmode="normal"]'); }
	};
	const performMulti = {
		name: "mm-perform-multi-setup", proves: ["MM-154", "MM-155", "MM-156", "MM-157", "MM-158", "MM-159", "MM-302", "MM-303"],
		steps: [
			go("perform"),
			{ say: "Multi trig: ALL TRK, SPLIT KEY, SEQ START, SEQ TRNSP in order, each the kit's mode; ALL TRK says every track keeps its own arpeggiator", act: async (u, c) => { c.bad = []; c.m0 = JSON.stringify(wk().multiTrig); u.click('[data-pmode="multi"]'); await sleep(400); const names = $all('[data-set="mtmode"] button').map(b => b.textContent); if (names.join(" ") !== "ALL TRK SPLIT KEY SEQ START SEQ TRNSP") c.bad.push("keys " + names);
					for (let i = 0; i < 4; i++) { u.click(`[data-set="mtmode"] button[data-v="${i}"]`); if (!await until(() => wk().multiTrig.mode === i, 4000)) c.bad.push("mode " + i); if (i === 0) c.arp = $1(".kbhint")?.textContent || ""; } },
				screen: c => ok(!c.bad.length && /each keeps its own arpeggiator/.test(c.arp), c.bad.join(" | ") + " " + c.arp), within: 1000 },
			{ say: "SPLIT KEY: Upper from + moves the first upper track on, the split marker dragged to another key moves the split key; the hint names both zones", act: async (u, c) => { c.bad = []; u.click('[data-set="mtmode"] button[data-v="1"]'); await until(() => wk().multiTrig.mode === 1, 4000); await sleep(300); c.st0 = wk().multiTrig.splitTrack; const wantTrack = c.st0 < 5 ? c.st0 + 1 : 4; u.click(c.st0 < 5 ? '[data-strk="1"]' : '[data-strk="-1"]'); if (!await until(() => wk().multiTrig.splitTrack === wantTrack, 4000)) c.bad.push(`upper from ${wk().multiTrig.splitTrack} for ${wantTrack}`);
					c.k0 = wk().multiTrig.splitKey; await u.drag("#splitm", [[-60, 0], [-120, 0]]); await sleep(500); c.k1 = wk().multiTrig.splitKey; if (c.k1 >= c.k0) c.bad.push(`split key ${c.k0} -> ${c.k1}`); c.hint = $1(".kbhint")?.textContent || ""; },
				screen: c => ok(!c.bad.length && /^.*Keys from .* play T\d-T6, keys below play T1-T\d/.test(c.hint), c.bad.join(" | ") + " hint " + c.hint), within: 1000 },
			{ say: "SEQ START and SEQ TRNSP have a Timing stepper: from DIRECT through 1/16, 2/16, 4/16, 8/16, 16/16 to 32/16, the kit's timing", act: async (u, c) => { c.bad = []; u.click('[data-set="mtmode"] button[data-v="2"]'); await until(() => wk().multiTrig.mode === 2, 4000); await sleep(300); const names = ["DIRECT", "1/16", "2/16", "4/16", "8/16", "16/16", "32/16"];
					for (let k = 0; k < 7; k++) { if (k > 0) u.click('[data-tim="1"]'); if (!await until(() => wk().multiTrig.timing === k, 4000)) c.bad.push(`timing ${k}: ${wk().multiTrig.timing}`); const shown = $all(".stepper").find(s => /Timing/.test(s.textContent))?.querySelector("b")?.textContent; if (shown !== names[k]) c.bad.push(`shows ${shown} for ${names[k]}`); }
					u.click('[data-set="mtmode"] button[data-v="3"]'); await until(() => wk().multiTrig.mode === 3, 4000); await sleep(300); c.has3 = !!$1("[data-tim]"); Journey.snapshot("mm-perform-multi-trig"); },
				screen: c => ok(!c.bad.length && c.has3, c.bad.join(" | ") + " timing in SEQ TRNSP " + c.has3), within: 1000 },
			{ say: "Multi map: each range's Pattern, OFS, LEN, TRN and TIM are its own columns of the global's map: a pattern chosen, OFS 4, LEN 8, TRN -5, TIM stepped", act: async (u, c) => { c.bad = []; u.click('[data-pmode="map"]'); await sleep(500); c.m0 = JSON.stringify(gDoc().multiMap); const mm = () => gDoc().multiMap;
					await choose(u, "mpat0", 5); if (!await until(() => mm()[1][0] === 5, 6000)) c.bad.push("pattern: " + mm()[1][0]);
					const ofs = '.pc[data-g="mmap"][data-n="ofs"][data-i="0"]', len = '.pc[data-g="mmap"][data-n="len"][data-i="0"]', trn = '.pc[data-g="mmap"][data-n="trn"][data-i="0"]', tim = '.pc[data-g="mmap"][data-n="tim"][data-i="0"]';
					u.click(ofs, { cmd: true }); typeIn(u, "4"); if (!await until(() => mm()[2][0] === 4, 6000)) c.bad.push("OFS: " + mm()[2][0]);
					u.click(len, { cmd: true }); typeIn(u, "8"); if (!await until(() => mm()[3][0] === 8, 6000)) c.bad.push("LEN: " + mm()[3][0]);
					u.click(trn, { cmd: true }); typeIn(u, "-5"); if (!await until(() => mm()[4][0] === 251, 6000)) c.bad.push("TRN: " + mm()[4][0]);
					const t0 = mm()[5][0]; const el = $1(tim); el.focus(); u.key("ArrowUp"); if (!await until(() => mm()[5][0] !== t0, 6000)) c.bad.push("TIM: " + mm()[5][0]);
					c.now = mm(); c.other = JSON.parse(c.m0).every((row, r) => row.slice(1).every((v, k) => v === mm()[r][k + 1] || r === 0)); },
				screen: c => ok(!c.bad.length && c.other, c.bad.join(" | ") + " other ranges untouched " + c.other), within: 1000 }
		],
		async tidy(u, c) { if (c.m0 != null) { /* put the map back through its own keys */ const m0 = JSON.parse(c.m0); const mm = () => gDoc().multiMap; await choose(u, "mpat0", m0[1][0] === 255 ? -1 : m0[1][0]); await sleep(800); } u.click('[data-pmode="normal"]'); await sleep(300); }
	};
	/* ---- Perform: the assign tabs (joystick, velocity), the joystick's own MIDI, MIRR, copy / paste / clear, the octave keys ---- */
	const assignOf = t => wk().tracks[t].assign;
	/* the assign tab -> the two rows of the kit's twelve it edits (R, L, U, D, VEL, KEY; the left rows follow MIRR and have no box of their own) */
	const ASSIGN_ROWS = { "JOY RL": [0, 1], "JOY U": [4, 5], "JOY D": [6, 7], VEL: [8, 9], KEY: [10, 11] };
	const assignJ = {
		name: "mm-perform-assign", proves: ["MM-146", "MM-147", "MM-148", "MM-150"],
		steps: [
			go("perform"),
			{ say: "the assign tabs JOY RL, JOY U, JOY D, VEL, KEY: each tab's two rows edit their own two of the kit's twelve (page, destination, ADD) and nothing else", act: async (u, c) => { c.n0 = histN(); c.bad = []; u.click('[data-set="astrk"] button[data-v="0"]'); await sleep(300);
					const tabs = $all('[data-set="astab"] button').map(b => b.dataset.v); if (tabs.join(",") !== "JOY RL,JOY U,JOY D,VEL,KEY") c.bad.push("tabs " + tabs);
					for (const [tb, idx] of Object.entries(ASSIGN_ROWS)) { u.click(`[data-set="astab"] button[data-v="${tb}"]`); await sleep(250);
						for (const [k, i] of idx.entries()) { const a0 = JSON.stringify(assignOf(0)); const pg = k === 0 ? 3 : 4, dest = 2 + k; await choose(u, "asp" + k, pg); if (!await until(() => assignOf(0).page[i] === pg, 4000)) c.bad.push(`${tb} row ${k + 1}: page ${assignOf(0).page[i]}`); await choose(u, "asd" + k, dest); if (!await until(() => assignOf(0).dest[i] === dest, 4000)) c.bad.push(`${tb} row ${k + 1}: dest ${assignOf(0).dest[i]}`);
							const q = `.pc[data-g="asg"][data-n="${k}"]`; u.click(q, { cmd: true }); typeIn(u, "+30"); if (!await until(() => assignOf(0).add[i] === 30, 4000)) c.bad.push(`${tb} row ${k + 1}: ADD ${assignOf(0).add[i]}`);
							const a1 = assignOf(0), b = JSON.parse(a0), moved = ["page", "dest", "add"].flatMap(f => a1[f].map((v, x) => v !== b[f][x] ? x : null)).filter(x => x != null); if (moved.some(x => x !== i)) c.bad.push(`${tb} row ${k + 1}: another row moved ${moved}`); } } },
				screen: c => ok(!c.bad.length, c.bad.slice(0, 5).join(" | ")), within: 1000 },
			{ say: "MIRR on the JOY RL tab: track 1's bit of the kit's mirror mask flips; KEY has HPF and LPF keys, the same kind of mask", act: async (u, c) => { u.click('[data-set="astab"] button[data-v="JOY RL"]'); await sleep(250); const m0 = wk().trackMasks.mirror & 1; u.click("[data-mirr]"); await until(() => (wk().trackMasks.mirror & 1) !== m0, 4000); c.mir = wk().trackMasks.mirror & 1 !== m0 || (wk().trackMasks.mirror & 1) !== m0; c.m0 = m0; },
				machine: c => ok((wk().trackMasks.mirror & 1) !== c.m0, "mirror mask " + wk().trackMasks.mirror), screen: () => ok($1("[data-mirr]")?.getAttribute("aria-pressed") === String(!!(wk().trackMasks.mirror & 1)), "MIRR key"), within: 6000 },
			{ say: "Copy on the LCD takes track 1's assign tabs; on track 2 Paste puts them there (its own rows untouched where it has no box), Cmd+Z puts track 2's own back, Clr sets track 2's assign tabs to the factory ones (JOY RL starts on FLT, ADD +24 ...)", act: async (u, c) => { c.bad = []; const btn = n => $all(".lcdpanel button").find(b => b.textContent.trim() === n); const own = () => JSON.stringify(assignOf(1));
					c.t1 = own(); u.click(btn("Copy")); await sleep(500); c.copyToast = $1("#toast")?.textContent || ""; u.click('[data-set="astrk"] button[data-v="1"]'); await sleep(300); u.click(btn("Paste")); await sleep(1500);
					const a1 = assignOf(1), a0 = assignOf(0); c.pasted = Object.values(ASSIGN_ROWS).flat().every(i => ["page", "dest", "add"].every(f => a1[f][i] === a0[f][i])); const before = JSON.parse(c.t1); c.leftKept = [2, 3].every(i => ["page", "dest", "add"].every(f => a1[f][i] === before[f][i]));
					blur(); u.key("z", { cmd: true }); await until(() => own() === c.t1, 6000); c.undone = own() === c.t1;
					u.click(btn("Clr")); await sleep(800); if (dlgShown()) u.click($1("#dlg .danger") || dlgButton("Clear")); await sleep(1500); const ac = assignOf(1), def = newAssign(); c.cleared = Object.entries(ASSIGN_ROWS).every(([tb, idx]) => idx.every((i, k) => ac.page[i] === def.tabs[tb][k].pg && ac.dest[i] === def.tabs[tb][k].d && ac.add[i] === def.tabs[tb][k].add - 64)); c.clrToast = $1("#toast")?.textContent || ""; blur(); u.key("z", { cmd: true }); await until(() => own() === c.t1, 6000); },
				screen: c => ok(/Copied the assign tabs of T1/.test(c.copyToast) && c.pasted && c.leftKept && c.undone && c.cleared, `copy "${c.copyToast}", pasted ${c.pasted}, left rows kept ${c.leftKept}, undone ${c.undone}, cleared ${c.cleared} "${c.clrToast}"`), within: 1000 }
		],
		async tidy(u, c) { if (c.n0 != null) await undoTo(u, c.n0); u.click('[data-set="astrk"] button[data-v="0"]'); }
	};
	const joystickJ = {
		name: "mm-perform-joystick-midi", proves: ["MM-352", "MM-366", "MM-053"],
		steps: [
			go("perform"),
			{ say: "track 3 in the assign card, JOY tab: drag the stick right: a pitch bend on track 3's channel above the middle; up: CC 1; down: CC 2, each on that channel; it springs back to the middle", act: async (u, c) => { c.bad = []; u.click('[data-set="astrk"] button[data-v="2"]'); await sleep(300); u.click('[data-set="astab"] button[data-v="JOY RL"]'); await sleep(250); const ch = baseCh() + 2;
					midiSent.length = 0; await u.drag("#joy", [[20, 0], [40, 0]]); await sleep(200); const pb = midiSent.filter(b => (b[0] & 0xf0) === 0xe0); if (!pb.length || !pb.every(b => (b[0] & 15) === ch) || !pb.some(b => b[2] > 64)) c.bad.push("right: " + JSON.stringify(midiSent.slice(0, 8))); if (!(pb[pb.length - 1][2] === 64)) c.bad.push("spring back: " + JSON.stringify(pb.slice(-2)));
					midiSent.length = 0; await u.drag("#joy", [[0, -20], [0, -40]]); await sleep(200); let cc = midiSent.filter(b => (b[0] & 0xf0) === 0xb0 && b[1] === 1); if (!cc.length || !cc.every(b => (b[0] & 15) === ch) || !cc.some(b => b[2] > 0)) c.bad.push("up CC1: " + JSON.stringify(midiSent.slice(0, 8)));
					midiSent.length = 0; await u.drag("#joy", [[0, 20], [0, 40]]); await sleep(200); cc = midiSent.filter(b => (b[0] & 0xf0) === 0xb0 && b[1] === 2); if (!cc.length || !cc.every(b => (b[0] & 15) === ch) || !cc.some(b => b[2] > 0)) c.bad.push("down CC2: " + JSON.stringify(midiSent.slice(0, 8))); },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 },
			{ say: "OCTAVE + and −: the keyboard's lowest key moves by twelve and the same key plays twelve higher or lower", act: async (u, c) => { c.bad = []; u.click('[data-set="astrk"] button[data-v="0"]'); await sleep(200); u.click('[data-pmode="normal"]'); await sleep(300); const low = () => Math.min(...$all(".kb [data-key]").map(k => +k.dataset.key)); c.l0 = low(); const m0 = await keyMsgs(u, `.kb [data-key="${c.l0 + 12}"]`);
					u.click('[data-kboct="1"]'); await sleep(300); c.l1 = low(); const m1 = await keyMsgs(u, `.kb [data-key="${c.l1 + 12}"]`); u.click('[data-kboct="-1"]'); u.click('[data-kboct="-1"]'); await sleep(300); c.l2 = low(); const m2 = await keyMsgs(u, `.kb [data-key="${c.l2 + 12}"]`); u.click('[data-kboct="1"]');
					if (c.l1 - c.l0 !== 12 || c.l2 - c.l0 !== -12) c.bad.push(`lowest ${c.l0}, ${c.l1}, ${c.l2}`); if (m0[0]?.[1] !== c.l0 + 12 || m1[0]?.[1] !== c.l1 + 12 || m2[0]?.[1] !== c.l2 + 12) c.bad.push(`notes ${m0[0]?.[1]}, ${m1[0]?.[1]}, ${m2[0]?.[1]}`); },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 }
		]
	};
	/* ---- Perform: the multi envelope goes out as NRPN 0x40 to 0x44 on every track (Appendix B) ---- */
	const menvNrpn = {
		name: "mm-perform-menv-nrpn", proves: ["MM-365"],
		steps: [
			go("perform"),
			{ say: "ATK, DEC, SUS, REL and PORT: each value goes to all six tracks as an NRPN (track as the MSB, 0x40 to 0x44 as the LSB, the value as data entry) on the base channel, and the kit holds it on every track", act: async (u, c) => { c.n0 = histN(); c.bad = [];
					for (const [i, n] of ["ATK", "DEC", "SUS", "REL", "PORT"].entries()) { const el = $1(`#main .pc[data-g="menv"][data-n="${n}"]`), v0 = wk().tracks[0].multiEnv[i], mx = maxOf(ref(el)[2]), w0 = wireSeq; el.focus(); u.key(v0 >= mx ? "ArrowDown" : "ArrowUp"); if (!await until(() => wk().tracks.every(t => t.multiEnv[i] !== v0), 4000)) { c.bad.push(`${n}: ${wk().tracks.map(t => t.multiEnv[i])}`); continue; }
						await until(() => nonSys(w0).filter(w => w.kind === "nrpn").length >= 18, 3000); const v = wk().tracks[0].multiEnv[i], m = nonSys(w0).filter(w => w.kind === "nrpn").map(w => w.b);
						const ok6 = m.length === 18 && [0, 1, 2, 3, 4, 5].every(t => { const g = m.slice(t * 3, t * 3 + 3); return g.every(b => b[0] === (0xb0 | baseCh())) && g[0][1] === 99 && g[0][2] === t && g[1][1] === 98 && g[1][2] === 0x40 + i && g[2][1] === 6 && g[2][2] === v; });
						if (!ok6 || !wk().tracks.every(t => t.multiEnv[i] === v)) c.bad.push(`${n}: ${m.map(b => b.join(" ")).join(" | ").slice(0, 160)}`); } },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 }
		],
		async tidy(u, c) { if (c.n0 != null) await undoTo(u, c.n0); }
	};
	/* SLICE5-MM-END */
	const all = [/* SLICE5-MM-LIST */ machineReference, trackEffects, lfoJ, mixBuses, wireCc, envJ, pitchKeys, locksJ, recLocks, arpSetup, lcdSetup, trigSetup, midiSeqJ, midiDocks, performKeys, performMulti, assignJ, joystickJ, menvNrpn, bootCard, copyWhat, clearWhat, firstBeat, spaceKey, pauseJ, panicJ, tempoWindowJ, tempoReleaseJ, playFromJ, tempoDrag, patNext, wsKeys, helpKeys, plate, undoRedo, gridRecord, slidePaint, lenKey, lockLane, arpDock, arpRange, trnKeys, trnKeyBlur, trnPlaying, leaveStopped,
		genMut, shapeSound, machinePick, machineStays, songModeJ, songPlayhead, midiSide, controlAll, mixStrip, mixSolo, shiftMutes, routing, panTrim, msOff,
		poly, polyTrack, keyTracking, menvModes, multiTrig, multiMap, kbPlay, kbLit, typeValue, songRows, songPicker, songSlotsJ, songKeysJ, songChain, kitLoad, kitCopy, patGo, dialogEsc,
		audioPanel, romCard, notePlay,
		tapTempo, queue, dialogKeys, trackKeys, muteKeys, lockRamp, pages, copyPaste, clearAll, fill, rotate, pasteMany, pasteKeeps, liveRec, liveErase, stepRec, genKeys, mutScope,
		valueKeys, soundCopy, screenDrag, dragM, midiMutes, joyAssign, menvPort, menvLayout, osHelp, songInspector, songDrag, kitSaveAs, kitRename, kitClear, patClear, hwNoMachine,
		blackKeys, rollPaint, rollDrawLength, rollBoxMove, rollMidiLen, selectCopyPaste, stepMenuJ, buttonsCopyPaste, syxImportJ, syxImportMute, osCopyPaste, rotateUndo, faderUndo, tapTempoShift, shotsImport, editorMenuJ, dropSyxJ, globalChannels, globalReset, globalSlot, globalPage, globalClickOut, globalCopyPaste, globalTune, globalControlOut, shotsGlobal, genBarFit, shotsSound, ...viewJs, ...cpuJs, ...volJs, syxExportKinds, syxVerify, syxPlace, resetEmpty];

	async function between(u) {
		for (let i = 0; i < 3 && dlgShown(); i++) { u.key("Escape"); await sleep(200); }
		for (const q of ["#libpop", "#globpop", "#keyspop", "#audiopop", "#kpop", "#machpop"]) if ($1(q) && !$1(q).hidden) { u.key("Escape"); await sleep(150); }
		if (!$1("#bootcard").hidden) $1('#bootcard [data-bootrom="close"]')?.click();
		if (S().playing) { u.click("#play"); await until(() => !S().playing, 3000); }
		if (S().mode && S().mode !== "normal" && S().ws === "perform") u.click('[data-pmode="normal"]');
		await sleep(600);
	}
	function ready() {
		return new Promise(done => window.MMPage.whenReady(async () => {
			await until(() => machine().loading && machine().loading.done >= machine().loading.total, 120000);
			await sleep(2000);
			done(true);
		}));
	}
	/* Before the first journey: the active GLOBAL reset to the factory settings, through the GLOBAL panel's own Reset to
	   defaults (DeskGlobal.host.reset: globalReset), and read back. The journeys run on a copy of the person's settings
	   (scripts/mdmm-journeys.sh), whose machine may hold a personal or imported global (CHANNEL SPAN 0 after a backup
	   import: no track mutes, no note reaches a track); the journeys assume the factory MIDI channels. */
	async function prepare() {
		const n = machine().global?.current ?? 0, say = g => g ? `span ${g.channels?.span}, base ${g.channels?.base}, clock out ${g.controlOut?.clock}` : "not read";
		await until(() => !!gDoc(), 20000);
		const was = say(gDoc());
		results.length = 0;
		DeskGlobal.host.reset();
		/* its own undo step: the gesture ends here, so a journey's first edit (and its undo) never takes the reset with it */
		commit();
		await until(() => results.some(r => r.op === "globalReset"), 20000);
		const r = results.find(r => r.op === "globalReset");
		if (!r || !r.ok) return `GLOBAL ${n + 1} not reset (${r ? (r.errors || []).join("; ") : "no answer"}); the journeys run on it as it is (${was})`;
		const back = await until(() => gDoc()?.channels?.span === 6 && gDoc()?.channels?.base === 0, 20000);
		await sleep(1500);
		return `GLOBAL ${n + 1} reset to the factory settings (GLOBAL › Clear): was ${was}, now ${say(gDoc())}${back ? "" : " (not read back yet)"}`;
	}
	/* what the page last told the person: its toast and its error line */
	const context = () => [...[["toast", $1("#toast")], ["error", $1("#errline")]].filter(([, e]) => e && !e.hidden && e.textContent.trim()).map(([k, e]) => `${k} "${e.textContent.trim().slice(0, 160)}"`),
		...results.filter(r => r.ok === false).slice(-3).map(r => `refused ${r.op}: ${(r.errors || []).join("; ")}`)].join(", ");
	if (/[?&]selftest=journey/.test(location.search)) addEventListener("load", () => Journey.run(all, { log: t => Bridge.log(t), ready, prepare, between, context }));
	return { all };
})();
