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
	const tele = { last: null, steps: [] }, results = [], sent = Journey.recent(50);
	/* what the page hands the plug-in (for what has no read-back: live notes) */
	const notesOn = [];	/* the pitches the keyboard sent (noteOn), newest last */
	const midiSent = [];	/* the raw MIDI the keyboard and the joystick sent (op midi), newest last */
	const polySent = Journey.recent(20);	/* the poly commands ({on, t}), newest last (0.6 wave 9) */
	const recSent = [];	/* the record commands ({mode, t}), newest last */
	const learnSent = [];	/* the learn commands (learnStart, learnAdd, learnCancel, learnRemove, learnInvert) with their arguments, newest last */
	const noteCmds = Object.assign([], { seq: 0 });	/* the keyboard's noteOn / noteOff commands ({on, t, pitch, vel}), newest last: the firmware run's stand-in for the wire (I-027) */
	{ const send0 = Bridge.send; Bridge.send = (m, o) => { sent.add(m.op); if (m.op === "noteOn") { notesOn.push(m.pitch); if (notesOn.length > 50) notesOn.shift(); }
		if (m.op === "noteOn" || m.op === "noteOff") { noteCmds.push({ seq: ++noteCmds.seq, on: m.op === "noteOn" && m.vel > 0, t: m.t, pitch: m.pitch, vel: m.vel || 0 }); if (noteCmds.length > 50) noteCmds.shift(); }
		if (m.op === "midi") { midiSent.push(m.b); if (midiSent.length > 50) midiSent.shift(); }
		if (m.op === "record") { recSent.push({ mode: m.mode, t: m.t }); if (recSent.length > 20) recSent.shift(); }
		if (m.op === "poly") { polySent.add({ on: m.on, t: m.t }); }
		if (/^learn/.test(m.op)) { learnSent.push(JSON.parse(JSON.stringify(m))); if (learnSent.length > 50) learnSent.shift(); } return send0(m, o); }; }
	let wireSeq = 0;
	const wireLog = [];	/* what the core handed the device edge, as the wire engine would encode it (the page tier's stub host: {type: "wire", kind, b, n}), newest last */
	Bridge.onMessage(m => {
		if (m.type === "wire") { m.seq = ++wireSeq; wireLog.push(m); if (wireLog.length > 600) wireLog.shift(); }
		if (m.type === "telemetry") { tele.last = m; if (m.playing) { tele.steps.push(m.step); if (tele.steps.length > 64) tele.steps.shift(); } }
		if (m.type === "result") { results.push(m); if (results.length > 50) results.shift(); }
	});
	const PAGES = ["SYN", "AMP", "FLT", "EFX", "LF1", "LF2", "LF3"];
	const go = ws => ({ say: `click the ${{ seq: "Pattern", sound: "Kit", mix: "Mix", perform: "Perform", song: "Song" }[ws]} tab`, act: u => u.click(tab(ws)), screen: () => onTab(ws) });
	const sel = t => ({ say: `pick track ${t + 1} on the rail`, act: (u, c) => { c.t = t; if (S().side === "midi" && t < 6) u.click('[data-side="int"]'); u.click(rail(t)); }, screen: () => ok(S().sel === t, "selected " + S().sel) });
	const undoKey = { say: "press Cmd+Z", act: u => u.key("z", { cmd: true }) };
	const blur = () => document.activeElement?.blur?.();
	/* the GEN dialog (the dice key on the track's row in the rail; the dialog is the track's until Done or Cancel) */
	const genDice = t => `#rail .th[data-sel="${t}"] [data-genopen]`;
	const genAt = async (u, t) => { await u.glide(genDice(t)); u.click(genDice(t)); await sleep(250); };
	const genDone = async u => { if ($1("#genpop") && !$1("#genpop").hidden) { u.click("#genpop [data-genclose]"); await sleep(300); } };
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
			{ say: "click the Pattern tab", act: u => u.click(tab("seq")), screen: () => onTab("seq") === true ? ok(!!$1("#seq canvas.roll[data-big]"), "no piano roll") : onTab("seq"), machine: () => ok(!!patDoc(), "pattern not read") },
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
	/* I-041: ‹ › on the KIT field load the previous / next kit as a click in the kit chooser does (the machine asks first over unsaved edits) */
	const kitStep = {
		name: "mm-kit-step", proves: ["MM-093"],
		steps: [
			{ say: "click › next to the kit on the LCD", act: async (u, c) => { c.k0 = machine().kit.current; u.click("#kitNext"); await confirmIfAsked(u); }, machine: c => ok(machine().kit.current === (c.k0 + 1) % 128, "machine kit " + machine().kit.current), screen: c => ok(S().kit === (c.k0 + 1) % 128, "page kit " + S().kit), within: 10000 },
			{ say: "click ‹: back", act: async u => { u.click("#kitPrev"); await confirmIfAsked(u); }, machine: c => ok(machine().kit.current === c.k0, "machine kit " + machine().kit.current), within: 10000 },
			{ say: "the arrows did not open the kit chooser", screen: () => ok($1("#libpop").hidden, "chooser open") }
		]
	};
	const wsKeys = {
		name: "mm-keys-workspaces", proves: [],
		steps: [["2", "sound"], ["3", "mix"], ["4", "perform"], ["5", "song"], ["1", "seq"]].map(([k, ws]) => ({ say: `press ${k}`, act: u => { blur(); u.key(k); }, screen: () => ok(S().ws === ws && !!$1("#main").firstElementChild, "workspace " + S().ws) }))
	};
	const helpKeys = {
		name: "mm-keys-help", proves: ["MM-X18"],
		steps: [
			{ say: "press ?: the keyboard view and the list of keys", act: u => { blur(); u.key("?", { shift: true }); }, screen: () => ok(!$1("#keyspop").hidden && $all("#keyspop .keyrow").length > 20 && !!$1("#keyspop .kv-cap"), $all("#keyspop .keyrow").length + " keys") },
			{ say: "press Escape: it closes", act: u => u.key("Escape"), screen: () => ok($1("#keyspop").hidden, "still open") }
		]
	};
	/* the plate is a key of the engine menu (PLATE: MKI / MKII), no longer a key of the top bar */
	const plateLabel = () => $1('#engsel option[value="plate"]')?.textContent.trim();
	const platePick = u => u.pick("engsel", "plate");
	const plate = {
		name: "mm-top-plate", proves: ["MM-322"],
		steps: [
			/* MM-322 (wave 10): each plate is its own look, true to the product photos: MKI a light-blue LCD, MKII a bluish-white one */
			{ say: "click the plate key: the other model, its own LCD colour and label", act: (u, c) => {
				const root = document.documentElement;
				c.p0 = root.dataset.plate; c.lcd0 = getComputedStyle(root).getPropertyValue("--lcd").trim(); c.key0 = plateLabel(); return platePick(u);
			}, screen: c => {
				const root = document.documentElement, lcd = getComputedStyle(root).getPropertyValue("--lcd").trim(), key = plateLabel();
				return ok(root.dataset.plate !== c.p0 && lcd !== c.lcd0 && key !== c.key0, `plate ${root.dataset.plate}, LCD ${c.lcd0} -> ${lcd}, key ${c.key0} -> ${key}`);
			} },
			{ say: "click it again: the first look is back", act: u => platePick(u), screen: c => {
				const root = document.documentElement, lcd = getComputedStyle(root).getPropertyValue("--lcd").trim();
				return ok(root.dataset.plate === c.p0 && lcd === c.lcd0, `plate ${root.dataset.plate}, LCD ${lcd}`);
			} }
		]
	};
	const undoRedo = {
		name: "mm-top-undo-redo", proves: ["MM-076", "MM-X07"],
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
	/* 2026-10-12 (the roll's foot, Radek: "needs to be simple to use"): slide and swing are set in the step menu, on the
	   selection; the roll shows them as small marks on the notes (a slide only where the step holds a lock, swing only on a trig) */
	const swingsOf = t => (patDoc()?.tracks[t]?.swing || []).slice().sort((a, b) => a - b);
	/* the step menu on step s of track t (a right-click there; s: null, the ⋯ key of the selection), then its entries by id
	   in turn (a submenu's entry opens it) */
	const stepPick = async (u, t, s, ...ids) => {
		if (s == null) { await until(() => !!$1("#stepmore") && !$1("#stepmore").hidden, 2000); u.click("#stepmore"); }
		else { const p = rollCell(t, s); u.rightClick(p.c, {}, p.fx, p.fy); }
		if (!await until(() => DeskMenu.shown, 1500)) throw new Error("no step menu");
		for (const id of ids) { if (!await until(() => !!$1(`#deskmenu [data-mid="${id}"]`), 1500)) throw new Error("no " + id + " in the step menu"); u.click(`#deskmenu [data-mid="${id}"]`); await sleep(150); } };
	const ticked = id => $1(`#deskmenu [data-mid="${id}"]`)?.getAttribute("aria-checked") === "true";
	const slidePaint = {
		name: "mm-seq-slide-swing", proves: ["MM-231", "MM-233", "MM-038"],
		steps: [
			go("seq"), sel(0),
			{ say: "no trig type keys, no A F L row, no hint under the roll", act: () => { }, screen: () => ok(!$1(".ttrow") && !$1("[data-tt]") && !$1("[data-env]") && !$1("#tlanes") && !$1(".rollmarks"), "a row under the roll") },
			{ say: "Cmd-drag four steps in the roll, then ⋯ > Slide: slide on all four, one undo step", act: async (u, c) => {
				c.s0 = [...Array(S().len - 3).keys()].find(s => [0, 1, 2, 3].every(k => !slidesOf(0).includes(s + k))); if (c.s0 == null) throw new Error("no four free slide steps");
				c.run = [0, 1, 2, 3].map(k => c.s0 + k); if (S().stepSel) clearSel();
				await dragRoll(u, 0, c.run, { cmd: true }); await until(() => S().stepSel?.from === c.s0 && S().stepSel?.to === c.s0 + 4, 2000);
				await stepPick(u, 0, null, "step-slide");
			}, machine: c => ok(c.run.every(s => slidesOf(0).includes(s)), "slides " + slidesOf(0).join(",")),
				screen: c => ok(c.run.every(s => S().tracks[0].slide.has(s)), "slides shown " + [...S().tracks[0].slide].join(",")), within: 15000 },
			{ say: "the step menu ticks Slide for the four", act: async u => { await stepPick(u, 0, null); }, screen: () => ok(ticked("step-slide"), "Slide not ticked") },
			{ say: "Escape; one undo step: Cmd+Z takes all four", act: async u => { closeDeskMenu(); await sleep(100); blur(); u.key("z", { cmd: true }); }, machine: c => ok(c.run.every(s => !slidesOf(0).includes(s)), "slides " + slidesOf(0).join(",")), within: 15000 },
			{ say: "right-click a step and choose Swing: its swing flips", act: async (u, c) => { if (S().stepSel) clearSel(); c.w = c.run[0]; c.w0 = swingsOf(0).includes(c.w); await stepPick(u, 0, c.w, "step-swing"); },
				machine: c => ok(swingsOf(0).includes(c.w) !== c.w0, "swing " + swingsOf(0).join(",")), screen: c => ok(S().tracks[0].swing.has(c.w) !== c.w0, "swing unchanged"), within: 15000 },
			{ say: "Cmd+Z: the swing as before", act: u => { if (S().stepSel) clearSel(); blur(); u.key("z", { cmd: true }); }, machine: c => ok(swingsOf(0).includes(c.w) === c.w0, "swing " + swingsOf(0).join(",")), within: 15000 }
		],
		async tidy(u) { if (DeskMenu.shown) closeDeskMenu(); if (S().stepSel) clearSel(); }
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
		name: "mm-seq-transpose-keyboard", proves: ["MM-226", "MM-X23"],
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
		name: "mm-gen-mutate-undo", proves: ["MM-X04", "MM-X05"],
		steps: [
			go("seq"), sel(0),
			{ say: "click track 1's GEN key: the dialog opens under the piano roll", act: async u => { await genAt(u, 0); }, screen: () => ok(!$1("#genpop").hidden && !!$1("#genpop [data-rand]"), "no GEN dialog") },
			{ say: "click GEN's Random key until the notes change", act: async (u, c) => { c.p0 = JSON.stringify(patDoc().tracks[0]); for (let i = 0; i < 5; i++) { u.click("#genpop [data-rand]"); if (await until(() => JSON.stringify(patDoc().tracks[0]) !== c.p0, 4000)) break; } },
				machine: c => ok(JSON.stringify(patDoc().tracks[0]) !== c.p0, "pattern unchanged"), within: 15000 },
			{ say: "click Done: the dialog closes and keeps the run", act: u => u.click("#genpop [data-genclose]"), screen: () => ok($1("#genpop").hidden, "the dialog is open") },
			{ say: "click the Kit tab and MUTATE's Random key", act: async (u, c) => { u.click(tab("sound")); await sleep(300); c.k0 = kitT(0); u.click("#mutband [data-rand]"); }, machine: c => ok(kitT(0) !== c.k0, "kit unchanged"), within: 15000 },
			{ say: "click Undo: the sound is back", act: u => u.click("#undo"), machine: c => ok(kitT(0) === c.k0, "kit not back"), within: 15000 },
			{ say: "click Undo again: the notes are back", act: u => u.click("#undo"), machine: c => ok(JSON.stringify(patDoc().tracks[0]) === c.p0, "pattern not back"), within: 15000 }
		]
	};

	/* the GEN dialog as a session (the Machinedrum Editor's md-gen-modal): Cancel takes it all back, Done keeps it as one undo step,
	   another track's key moves it without closing, the head drags it, a value is typed or reset, Keep is a switch */
	const trk0 = t => JSON.stringify(patDoc()?.tracks[t]);
	const genModal = {
		name: "mm-gen-modal", proves: ["MM-X04"],
		steps: [
			go("seq"), sel(0),
			{ say: "pick two synth tracks that have a generator and click the first one's GEN key", act: async (u, c) => { const ts = [0, 1, 2, 3, 4, 5].filter(t => genSpec(t).kind !== "keep"); c.t = ts[0]; c.t2 = ts[1]; c.p0 = trk0(c.t); c.q0 = trk0(c.t2); await genAt(u, c.t); },
				screen: c => ok(!$1("#genpop").hidden && S().sel === c.t && document.activeElement?.classList.contains("gv"), "dialog " + $1("#genpop").hidden + ", focus " + document.activeElement?.className) },
			{ say: "the dialog is small, centred in the window over the grid, and clear of the track list", screen: () => { const p = $1("#genpop").getBoundingClientRect(), r = $1("#rail").getBoundingClientRect(), cx = (r.right + innerWidth) / 2;
				return ok(p.width <= 480 && p.width >= 320 && p.left >= r.right && Math.abs(p.left + p.width / 2 - cx) < 2 && Math.abs(p.top + p.height / 2 - innerHeight / 2) < 2, `dialog ${Math.round(p.left)},${Math.round(p.top)} ${Math.round(p.width)}x${Math.round(p.height)}, rail ends ${Math.round(r.right)}, window ${innerWidth}x${innerHeight}`); } },
			{ say: "click Defaults: the notes are written at once", act: u => u.click('#genpop [data-gen="fill"]'), machine: c => ok(trk0(c.t) !== c.p0, "unchanged"), within: 15000 },
			{ say: "click the second track's GEN key: the dialog goes to it, still open", act: async (u, c) => { await genAt(u, c.t2); }, screen: c => ok(!$1("#genpop").hidden && S().sel === c.t2 && /T\d/.test($1("#genpop .gdhead")?.textContent), "sel " + S().sel) },
			{ say: "click Defaults there too", act: u => u.click('#genpop [data-gen="fill"]'), machine: c => ok(trk0(c.t2) !== c.q0, "unchanged"), within: 15000 },
			{ say: "click the first track's number in the track list: the dialog follows it, still open; the track's name does the same", act: async (u, c) => { c.n1 = $1(`#rail .th[data-sel="${c.t}"] .n`); u.click(c.n1); await sleep(300); c.a = S().sel === c.t && !$1("#genpop").hidden && $1("#genpop .gdhead").textContent.includes(tLabel(c.t)); u.click(rail(c.t2)); await sleep(300); c.b = S().sel === c.t2 && !$1("#genpop").hidden && $1("#genpop .gdhead").textContent.includes(tLabel(c.t2)); },
				screen: c => ok(c.a && c.b, `number ${c.a}, name ${c.b}`) },
			{ say: "drag the head: the dialog moves and stays inside the window and where it is when another track's key moves it; double-click the head: it goes back to its place", act: async (u, c) => { const p = $1("#genpop"); c.b0 = p.getBoundingClientRect(); await u.drag("#genpop .gdhead", [[-60, -20], [-120, -40]], {}, { click: false }); c.b1 = p.getBoundingClientRect(); c.still = !p.hidden; await genAt(u, c.t); c.b1b = p.getBoundingClientRect(); u.dblclick("#genpop .gdhead"); await sleep(100); c.b2 = p.getBoundingClientRect(); c.want = placeGen(p); await genAt(u, c.t2); },
				screen: c => ok(c.still && c.b1.left < c.b0.left - 50 && c.b1.top < c.b0.top - 10 && c.b1.left >= 0 && c.b1.bottom <= innerHeight && Math.abs(c.b1b.left - c.b1.left) < 2 && Math.abs(c.b1b.top - c.b1.top) < 2 && Math.abs(c.b2.left - c.want.left) < 2 && Math.abs(c.b2.top - c.want.top) < 2, `before ${Math.round(c.b0.left)},${Math.round(c.b0.top)} moved ${Math.round(c.b1.left)},${Math.round(c.b1.top)} back ${Math.round(c.b2.left)},${Math.round(c.b2.top)}`) },
			{ say: "click Cancel: both tracks are back as they were", act: u => u.click("#genpop [data-gencancel]"), screen: () => ok($1("#genpop").hidden, "still open"), machine: c => ok(trk0(c.t) === c.p0 && trk0(c.t2) === c.q0, "tracks not back"), within: 20000 },
			{ say: "open the first track again, click Defaults, press Esc: it is cancelled the same way", act: async (u, c) => { await genAt(u, c.t); u.click('#genpop [data-gen="fill"]'); await until(() => trk0(c.t) !== c.p0, 8000); u.key("Escape"); }, machine: c => ok(trk0(c.t) === c.p0, "track not back"), screen: () => ok($1("#genpop").hidden, "still open"), within: 20000 },
			{ say: "open it, click Defaults, click the ESC key in the head's corner: it is cancelled the same way, and the key does not start a drag", act: async (u, c) => { await genAt(u, c.t); u.click('#genpop [data-gen="fill"]'); await until(() => trk0(c.t) !== c.p0, 8000); c.esc = !!$1("#genpop .gdesc"); u.click("#genpop .gdesc"); await sleep(300); }, machine: c => ok(trk0(c.t) === c.p0, "track not back"), screen: c => ok(c.esc && $1("#genpop").hidden, "key " + c.esc + ", still open " + !$1("#genpop").hidden), within: 20000 },
			{ say: "⌘-click a track's dice key: it is kept (a lock on the key, the dialog stays shut); ⌥R all in the dialog of another track leaves it alone; ⌘-click again: not kept", act: async (u, c) => { c.p4 = trk0(c.t); c.o1 = trk0(c.t2); u.click(genDice(c.t), { cmd: true }); await sleep(300);
					c.locked = !!$1(`${genDice(c.t)}.kept`) && $1("#genpop").hidden; await genAt(u, c.t2); u.click("#genpop [data-rand]", { alt: true }); await until(() => trk0(c.t2) !== c.o1, 8000); await sleep(300); c.skipped = trk0(c.t) === c.p4; c.other = trk0(c.t2) !== c.o1; u.click("#genpop [data-gencancel]"); await sleep(400);
					u.click(genDice(c.t), { cmd: true }); await sleep(300); c.unlocked = !$1(`${genDice(c.t)}.kept`) && $1("#genpop").hidden; },
				screen: c => ok(c.locked && c.skipped && c.other && c.unlocked, `locked ${c.locked}, skipped ${c.skipped}, other ${c.other}, unlocked ${c.unlocked}`), within: 20000 },
			{ say: "open it, tick Keep: the track's dice key shows a lock, nothing in the dialog is out of use, Defaults still writes the track and ⌥R all leaves it alone", act: async (u, c) => { await genAt(u, c.t); u.click("#genpop [data-genkeep]"); await sleep(300);
					c.live = $all("#genpop [inert], #genpop button:disabled").length === 0; c.lock = !!$1(`#rail [data-genopen="${c.t}"].kept`) && !!$1("#genpop .gdlock"); c.p2 = trk0(c.t); c.o0 = trk0(c.t2);
					u.click('#genpop [data-gen="fill"]'); await until(() => trk0(c.t) !== c.p2, 8000); c.wrote = trk0(c.t) !== c.p2; c.p3 = trk0(c.t);
					u.click("#genpop [data-rand]", { alt: true }); await until(() => trk0(c.t2) !== c.o0, 8000); await sleep(300); c.other = trk0(c.t2) !== c.o0; c.skipped = trk0(c.t) === c.p3;
					u.click("#genpop [data-genkeep]"); await sleep(300); c.off = !$1(`#rail [data-genopen="${c.t}"].kept`) && !$1("#genpop .gdlock"); },
				screen: c => ok(c.live && c.lock && c.wrote && c.other && c.skipped && c.off, `live ${c.live}, lock ${c.lock}, wrote ${c.wrote}, other ${c.other}, skipped ${c.skipped}, unlocked ${c.off}`), within: 20000 },
			{ say: "⌘-click a value box, type 3, Enter: the box shows it", act: async (u, c) => { const g = $1('#genpop .gv[data-gv="k"], #genpop .gv[data-gv="dens"]'); c.k = g.dataset.gv; u.click(g, { cmd: true }); await sleep(100); const f = $1("input.vedit"); f.value = "3"; u.key("Enter"); await sleep(400); },
				screen: c => ok(+$1(`#genpop .gv[data-gv="${c.k}"] b`)?.textContent.replace("%", "") === 3 && !$1("input.vedit"), "box " + $1(`#genpop .gv[data-gv="${c.k}"] b`)?.textContent + ", field " + !!$1("input.vedit")) },
			{ say: "double-click the box: its default", act: async (u, c) => { u.dblclick(`#genpop .gv[data-gv="${c.k}"]`); await sleep(400); }, screen: c => ok(+$1(`#genpop .gv[data-gv="${c.k}"] b`)?.textContent.replace("%", "") !== 3, "still 3") },
			{ say: "press Enter: Done keeps it; one Undo takes the whole session of this track back", act: async (u, c) => { u.key("Enter"); await sleep(400); u.click("#undo"); },
				screen: () => ok($1("#genpop").hidden, "still open"), machine: c => ok(trk0(c.t) === c.p0, "track not back"), within: 20000 }
		],
		async tidy(u, c) { await genDone(u); await undoUntil(u, () => trk0(c.t) === c.p0 && trk0(c.t2) === c.q0, 4); }
	};
	/* the lane toolbox in the bar under the roll (over the lock lane): a shape writes the locks over the steps that hold a note, one undo step; Flat reaches 0 % */
	const laneLocks = (t, pid) => { const [pg, i] = pid.split("."), page = pg === "MID" ? 7 : PAGES.indexOf(pg); return (patDoc()?.locks || []).find(l => l.track === t && l.page === page && l.param === +i)?.steps || []; };
	const laneTools = {
		name: "mm-lane-tools", proves: [],
		steps: [
			go("seq"),
			{ say: "pick a synth track with notes, the Locks tab and its lane", act: async (u, c) => { const onShown = t => trigsOf(t).filter(s => s >= vis()[0] && s < Math.min(vis()[1], S().len)); c.t = [0, 1, 2, 3, 4, 5].find(t => onShown(t).length >= 3) ?? 0; u.click(rail(c.t)); await sleep(200); if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); await sleep(200); c.pid = S().lane; c.s = onShown(c.t); c.m0 = JSON.stringify(laneLocks(c.t, c.pid)); },
				screen: c => ok(S().sel === c.t && !!$1(".lanetop .xlane [data-xs=up]"), "no lane toolbox on the lock lane's header row") },
			{ say: "hover Ramp up: the lane shows it faint, nothing is written", act: async (u, c) => { await u.glide(".xlane [data-xs=up]"); $1(".xlane [data-xs=up]").dispatchEvent(new PointerEvent("pointerover", { bubbles: true })); await sleep(100); }, screen: c => ok($all("#lane .xghost").length >= 3, `${$all("#lane .xghost").length} ghosts`), machine: c => ok(JSON.stringify(laneLocks(c.t, c.pid)) === c.m0, "the machine has locks written") },
			{ say: "click Ramp up: the machine holds a lock on every note, rising", act: u => u.click(".xlane [data-xs=up]"), screen: () => ok($all("#lane .xghost").length === 0, "ghosts stay"),
				machine: c => { const m = new Map(laneLocks(c.t, c.pid)), v = c.s.map(s => m.get(s)); return ok(v.length >= 3 && v.every((x, i) => x != null && (!i || x >= v[i - 1])) && v[v.length - 1] > v[0], "locks in the machine: " + v); }, within: 20000 },
			{ say: "click Undo once: the machine's lane is as it was (the shape was one step)", act: async u => { await sleep(600); u.click("#undo"); }, machine: c => ok(JSON.stringify(laneLocks(c.t, c.pid)) === c.m0, "locks " + JSON.stringify(laneLocks(c.t, c.pid))), within: 20000 },
			{ say: "click Flat five times: the lane's top, 75, 100, 25 and 0 % (a lock of 0 is a lock)", act: async (u, c) => { c.vals = []; const mx = (() => { const [pg, i] = c.pid.split("."); return maxOf(meta(c.t, pg, +i)); })(); c.mx = mx; for (let k = 0; k < 5; k++) { u.click(".xlane [data-xs=flat]"); await until(() => idleNow(), 6000); await sleep(500); const m = new Map(laneLocks(c.t, c.pid)); c.vals.push(c.s.map(s => m.get(s)).join("/")); } },
				screen: () => ok(true), machine: c => ok(c.vals.join(" ") === [.5, .75, 1, .25, 0].map(f => c.s.map(() => Math.round(f * c.mx)).join("/")).join(" "), c.vals.join(" ") + " (top " + c.mx + ")"), within: 4000 },
			{ say: "the Flat icon at 0 % differs from the one at 25 %, and the lane still shows the locks", screen: c => ok($1(".xlane [data-xs=flat] path:not([opacity])") && $all("#lane .lb:not(.none) i").length >= c.s.length, "no bars: " + $all("#lane .lb:not(.none) i").length) },
			{ say: "click Inv: the machine holds the top; then Undo six times: the lane is as at the start", act: async (u, c) => { u.click(".xlane [data-xt=invert]"); await until(() => idleNow(), 6000); await sleep(500); const m = new Map(laneLocks(c.t, c.pid)); c.inv = c.s.map(s => m.get(s)).join("/"); for (let k = 0; k < 6; k++) { u.click("#undo"); await until(() => idleNow(), 6000); await sleep(500); } },
				machine: c => ok(c.inv === c.s.map(() => c.mx).join("/") && JSON.stringify(laneLocks(c.t, c.pid)) === c.m0, `inv ${c.inv}; locks ${JSON.stringify(laneLocks(c.t, c.pid))}`), within: 20000 }
		],
		async tidy(u, c) { if (c.m0 != null) await undoUntil(u, () => JSON.stringify(laneLocks(c.t, c.pid)) === c.m0, 8); }
	};
	/* I-035: the lock lane's kit-value line (2 px, grabbed within 4 px of it): dragged, it changes the kit value of the lane's parameter on
	   the track as the knob does, one undo step, and paints no lock; its number on the line says the value as the knob shows it */
	const laneKitDrag = {
		name: "mm-lane-kit-drag", proves: ["MM-081"],
		steps: [
			go("seq"),
			{ say: "pick a track with notes and the Locks tab", act: async (u, c) => { c.t = [0, 1, 2, 3, 4, 5].find(t => trigsOf(t).some(s => s < Math.min(16, S().len))) ?? 0; await until(() => !!$1(rail(c.t)), 3000); u.click(rail(c.t)); await sleep(250); if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); await sleep(250);
					c.lane = S().lane; c.pg = PAGES.indexOf(c.lane.split(".")[0]); c.pi = +c.lane.split(".")[1]; c.s = trigsOf(c.t).find(s => s < Math.min(16, S().len)); },
				screen: c => ok(S().sel === c.t && !!$1(`#lane .lb[data-s="${c.s}"] .base`), "no kit line on step " + c.s), machine: c => ok(c.s != null && c.pg >= 0, "no note or no page") },
			{ say: "the kit line is 2 px and its number is on the lane", screen: c => { const { m } = laneMeta(), b = $1(`#lane .lb[data-s="${c.s}"] .base`), k = $1("#lane .kvl");
					return ok(b.getBoundingClientRect().height >= 2 && !!k && k.textContent === fmt(m, getP(c.t, c.lane)), `line ${b.getBoundingClientRect().height} px, number ${k?.textContent}`); } },
			{ say: "click exactly on the line: it is a click on the lane, the step is locked at the kit value", act: async (u, c) => { c.l0 = laneLocks(c.t, c.lane).length; c.k0 = getP(c.t, c.lane);
					const { mx } = laneMeta(), key = `#lane .lb[data-s="${c.s}"]`, r = $1(key).getBoundingClientRect(), y = r.bottom - 6 - (r.height - 14) * c.k0 / mx; u.click(key, {}, 0.5, (y - r.top) / r.height); },
				machine: c => ok(laneLocks(c.t, c.lane).some(([x, v]) => x === c.s && v === c.k0) && getP(c.t, c.lane) === c.k0, `locks ${JSON.stringify(laneLocks(c.t, c.lane))}, kit value ${c.k0}`), within: 20000 },
			{ ...undoKey, say: "press Cmd+Z: the lock is gone", act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(laneLocks(c.t, c.lane).length === c.l0, "locks " + JSON.stringify(laneLocks(c.t, c.lane))), within: 20000 },
			{ say: "drag the line itself: the kit value follows the pointer, no lock is drawn", act: async (u, c) => { c.l0 = laneLocks(c.t, c.lane).length; c.u0 = machine().history?.undoCount || 0; c.k0 = getP(c.t, c.lane);
					const key = `#lane .lb[data-s="${c.s}"]`, r = $1(key).getBoundingClientRect(), b = $1(key + " .base").getBoundingClientRect(), y = b.top + b.height / 2, dy = y - r.top < r.height / 2 ? 30 : -30;
					await u.drag(key, [[0, dy / 2], [0, dy]], {}, { fy: (y - r.top) / r.height, click: false }); },
				screen: c => { const { m } = laneMeta(), v = getP(c.t, c.lane), k = $1("#lane .kvl"); return ok(v !== c.k0 && !!k && k.textContent === fmt(m, v), `kit ${c.k0} -> ${v}, number ${k?.textContent}`); },
				machine: c => { const v = wk().tracks[c.t].pages[c.pg][c.pi]; return ok(v === getP(c.t, c.lane) && v !== c.k0 && laneLocks(c.t, c.lane).length === c.l0, `machine ${v}, page ${getP(c.t, c.lane)}, was ${c.k0}; locks ${laneLocks(c.t, c.lane).length} (was ${c.l0})`); }, within: 20000 },
			{ say: "the whole drag was one undo step", machine: c => ok((machine().history?.undoCount || 0) === c.u0 + 1, `undo steps ${c.u0} -> ${machine().history?.undoCount}`), within: 8000 },
			{ ...undoKey, say: "press Cmd+Z: the kit value is back", act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(wk().tracks[c.t].pages[c.pg][c.pi] === c.k0, "kit " + wk().tracks[c.t].pages[c.pg][c.pi] + " (was " + c.k0 + ")"), within: 20000 }
		],
		async tidy(u, c) { if (c.u0 != null && (machine().history?.undoCount || 0) > c.u0) await undoUntil(u, () => (machine().history?.undoCount || 0) <= c.u0, 3); }
	};
	/* 0.8: a slide is drawn in the lock lane. The machine's slide is a flag on a step: its locked values glide to the next lock of the same
	   parameter (past trigs without one). The dot at the top of a lock bar dragged sideways sets it (the preview runs to that next lock only,
	   however far the pointer goes); a click on the ramp's line takes it off; each is one undo step */
	const laneDrawSlide = {
		name: "mm-lane-draw-slide", proves: [],
		steps: [
			go("seq"),
			{ say: "pick a track with three notes, the Locks tab, and lock all three with a Shift-drag ramp", act: async (u, c) => { c.t = [0, 1, 2, 3, 4, 5].find(t => trigsOf(t).filter(s => s < Math.min(16, S().len)).length >= 3) ?? 0; u.click(rail(c.t)); await sleep(200); if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); await sleep(250);
					c.lane = S().lane; c.on = trigsOf(c.t).filter(s => s < Math.min(16, S().len)).slice(0, 3); c.sl0 = JSON.stringify(slidesOf(c.t));
					await u.drag(`#lane .lb[data-s="${c.on[0]}"]`, c.on.slice(1).map(s => `#lane .lb[data-s="${s}"]`), { shift: true }, { fy: 0.8 }); await sleep(500); },
				screen: c => ok(c.on.every(s => S().locks.get(c.t + "|" + c.lane)?.has(s)), "locks " + [...(S().locks.get(c.t + "|" + c.lane)?.keys() || [])].join(",")), machine: c => ok(c.on.length === 3 && slidesOf(c.t).length === 0 || c.sl0 != null, "notes " + c.on.join(",")), within: 15000 },
			{ say: "press on the first lock's dot and drag sideways past the second: a ramp preview to the second only, nothing written yet", act: async (u, c) => {
					c.u0 = machine().history?.undoCount || 0; const key = `#lane .lb[data-s="${c.on[0]}"]`, r = $1(key).getBoundingClientRect(), { mx } = laneMeta(), v = S().locks.get(c.t + "|" + c.lane).get(c.on[0]);
					const fy = (r.bottom - 6 - v / mx * (r.height - 14) - r.top) / r.height, far = $1(`#lane .lb[data-s="${c.on[2]}"]`).getBoundingClientRect();
					c.hold = u.drag(key, [[12, 0], [(far.left - r.left) / 2, 0], [far.right - r.left, 0]], {}, { fy, click: false, settle: 0 }); await sleep(250); },
				screen: c => ok(true), within: 4000 },
			{ say: "the release sets the slide on the first step only: one flag, the ramp is solid from lock to lock", act: async (u, c) => { await c.hold; await sleep(500); },
				machine: c => ok(slidesOf(c.t).includes(c.on[0]) && !slidesOf(c.t).includes(c.on[1]) && !slidesOf(c.t).includes(c.on[2]), "slides " + slidesOf(c.t).join(",")),
				screen: c => ok(S().tracks[c.t].slide.has(c.on[0]) && /M[\d.]+ [\d.]+ L[\d.]+ /.test($1("#lanesvg")?.innerHTML || "") && !/stroke-dasharray/.test($1("#lanesvg")?.innerHTML || ""), "svg " + ($1("#lanesvg")?.innerHTML || "").slice(0, 80)), within: 15000 },
			{ say: "it was one undo step", machine: c => ok((machine().history?.undoCount || 0) === c.u0 + 1, `undo steps ${c.u0} -> ${machine().history?.undoCount}`), within: 8000 },
			{ say: "click on the ramp's line: the slide is off, one more undo step", act: async (u, c) => { c.u1 = machine().history?.undoCount || 0; const k1 = `#lane .lb[data-s="${c.on[0]}"]`, a = $1(k1).getBoundingClientRect(), b = $1(`#lane .lb[data-s="${c.on[1]}"]`).getBoundingClientRect(), { mx } = laneMeta(), L = S().locks.get(c.t + "|" + c.lane),
						ya = a.bottom - 6 - L.get(c.on[0]) / mx * (a.height - 14), yb = b.bottom - 6 - L.get(c.on[1]) / mx * (b.height - 14), xa = a.left + a.width / 2, xb = b.left + b.width / 2, mid = { x: (xa + xb) / 2, y: (ya + yb) / 2 };
					const f = 0.9, px = a.left + a.width * f, t = (px - xa) / (xb - xa), py = ya + (yb - ya) * t; u.click(k1, {}, f, (py - a.top) / a.height); await sleep(500); },
				machine: c => ok(!slidesOf(c.t).includes(c.on[0]) && (machine().history?.undoCount || 0) === c.u1 + 1, "slides " + slidesOf(c.t).join(",") + `, undo steps ${c.u1} -> ${machine().history?.undoCount}`), within: 15000 },
			{ say: "Shift-press the first lock bar and drag out of its column: a line follows the cursor, the second lock is marked, nothing written", act: async (u, c) => {
					c.u2 = machine().history?.undoCount || 0; const key = `#lane .lb[data-s="${c.on[0]}"]`, r = $1(key).getBoundingClientRect(), t2 = $1(`#lane .lb[data-s="${c.on[1]}"]`).getBoundingClientRect(), far = $1(`#lane .lb[data-s="${c.on[2]}"]`).getBoundingClientRect();
					c.band = u.drag(key, [[r.width + 6, 0], [(t2.left + t2.width / 2) - (r.left + r.width / 2), 0], [far.left - r.left, 0]], { shift: true }, { fy: 0.6, click: false, stepMs: 450, settle: 0 }); await sleep(700); },
				screen: c => { const h = $1("#lanesvg")?.innerHTML || ""; return ok(/r="9"/.test(h) && /stroke-width="2"/.test(h) && !S().tracks[c.t].slide.has(c.on[0]), "svg " + h.slice(0, 80)); }, within: 4000 },
			{ say: "Escape, then the release past the second lock: cancelled, nothing written", act: async (u, c) => { u.key("Escape"); await c.band; await sleep(400); },
				machine: c => ok(!slidesOf(c.t).includes(c.on[0]) && (machine().history?.undoCount || 0) === c.u2, "slides " + slidesOf(c.t).join(",") + `, undo steps ${c.u2} -> ${machine().history?.undoCount}`), within: 8000 },
			{ say: "Shift-drag from the first lock bar and drop beside the second lock's column: cancelled", act: async (u, c) => { const key = `#lane .lb[data-s="${c.on[0]}"]`, r = $1(key).getBoundingClientRect(), far = $1(`#lane .lb[data-s="${c.on[2]}"]`).getBoundingClientRect();
					await u.drag(key, [[r.width + 6, 0], [far.left - r.left, 0]], { shift: true }, { fy: 0.6, click: false }); await sleep(400); },
				machine: c => ok(!slidesOf(c.t).includes(c.on[0]) && (machine().history?.undoCount || 0) === c.u2, "slides " + slidesOf(c.t).join(",")), within: 8000 },
			{ say: "Shift-drag from the first lock bar and drop on the second lock's column: the slide is set, one undo step", act: async (u, c) => { const key = `#lane .lb[data-s="${c.on[0]}"]`, r = $1(key).getBoundingClientRect(), t2 = $1(`#lane .lb[data-s="${c.on[1]}"]`).getBoundingClientRect();
					await u.drag(key, [[r.width + 6, 0], [(t2.left + t2.width / 2) - (r.left + r.width / 2), 0]], { shift: true }, { fy: 0.6, click: false }); await sleep(500); },
				machine: c => ok(slidesOf(c.t).includes(c.on[0]) && (machine().history?.undoCount || 0) === c.u2 + 1, "slides " + slidesOf(c.t).join(",") + `, undo steps ${c.u2} -> ${machine().history?.undoCount}`), within: 15000 },
			{ say: "click on the ramp's line: the slide is off", act: async (u, c) => { const k1 = `#lane .lb[data-s="${c.on[0]}"]`, a = $1(k1).getBoundingClientRect(), b = $1(`#lane .lb[data-s="${c.on[1]}"]`).getBoundingClientRect(), { mx } = laneMeta(), L = S().locks.get(c.t + "|" + c.lane),
						ya = a.bottom - 6 - L.get(c.on[0]) / mx * (a.height - 14), yb = b.bottom - 6 - L.get(c.on[1]) / mx * (b.height - 14), xa = a.left + a.width / 2, xb = b.left + b.width / 2;
					const f = 0.9, px = a.left + a.width * f, t = (px - xa) / (xb - xa), py = ya + (yb - ya) * t; u.click(k1, {}, f, (py - a.top) / a.height); await sleep(500); },
				machine: c => ok(!slidesOf(c.t).includes(c.on[0]), "slides " + slidesOf(c.t).join(",")), within: 15000 },
		],
		async tidy(u, c) { if (c.sl0 != null) await undoUntil(u, () => JSON.stringify(slidesOf(c.t)) === c.sl0 && !S().locks.get(c.t + "|" + c.lane)?.has(c.on[0]), 6); }
	};
	/* the grid shows the pattern's length in the ALL view; LEN to the next length widens it at once, Undo narrows it */
	const gridFits = {
		name: "mm-seq-grid-fits-length", proves: [],
		steps: [
			go("seq"),
			{ say: "ALL: the ruler and the lock lane have as many columns as the pattern has steps", act: async (u, c) => { if (!pressed("#pgall")) u.click("#pgall"); await sleep(300); c.n0 = S().len; c.rul0 = $all("#seq .rul[data-s]").length; c.lane0 = $all("#lane .lb").length; c.doc0 = patDoc().length; Bridge.log(`GRID mm pattern ${cur()} length ${c.doc0} view ${c.n0} ruler ${c.rul0} lane ${c.lane0}`); },
				screen: c => ok(c.rul0 === c.n0 && c.lane0 === c.n0 && c.doc0 === c.n0, `${c.rul0} ruler columns, ${c.lane0} lane bars, pattern ${c.doc0}, view ${c.n0}`) },
			{ say: "click LEN: the next length, the ruler and the lane follow at once", act: async (u, c) => { u.click('[data-l2="len"]'); await until(() => patDoc().length !== c.doc0 && S().len === patDoc().length, 8000); await sleep(300); c.n1 = S().len; c.rul1 = $all("#seq .rul[data-s]").length; c.lane1 = $all("#lane .lb").length; },
				screen: c => ok(c.n1 !== c.n0 && c.rul1 === c.n1 && c.lane1 === c.n1, `${c.rul1} ruler columns, ${c.lane1} lane bars, view ${c.n1} (was ${c.n0})`), within: 10000 },
			{ say: "click Undo: back to the first length", act: async u => { await sleep(500); u.click("#undo"); }, machine: c => ok(patDoc().length === c.doc0, "length " + patDoc().length), within: 15000 }
		],
		async tidy(u, c) { if (c.doc0 != null) await undoUntil(u, () => patDoc().length === c.doc0, 3); if (pressed("#pgall") && c.n0 != null) u.click("#pgall"); }
	};

	/* ---------- Sound ---------- */
	const valueText = q => $1(q)?.querySelector("b")?.textContent;
	const shapeSound = {
		name: "mm-sound-shape-undo", proves: ["MM-015"],
		steps: [
			{ say: "click the Kit tab: grouped by function", act: u => u.click(tab("sound")), screen: () => onTab("sound") === true ? ok($all("#main .sg").length >= 4, $all("#main .sg").length + " groups") : onTab("sound"), machine: () => ok(!!wk(), "no working kit") },
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
			{ say: "click the machine key: the picker opens on the family of the track's machine (not the last one browsed): a family clicked and the picker closed and opened again still opens on it", act: async (u, c) => { c.k0 = kitT(0); c.m0 = S().tracks[0].m; u.click("#machbtn"); await sleep(200); const other = $all("#machpop .mf").find(b => b.getAttribute("aria-pressed") !== "true"); u.click(other); await sleep(200); c.browsed = $1("#machpop .mf[aria-pressed=true]")?.dataset.fam; u.key("Escape"); await sleep(200); u.click("#machbtn"); await sleep(200); },
				screen: c => ok(!$1("#machpop").hidden && $all("#machpop .mk").length > 1 && !!$1(`#machpop .mk[data-mach="${c.m0}"]`) && $1("#machpop .mf[aria-pressed=true]")?.dataset.fam !== c.browsed, `picker ${$1("#machpop").hidden ? "closed" : "open"}, shows family ${$1("#machpop .mf[aria-pressed=true]")?.dataset.fam} (browsed ${c.browsed}), has ${c.m0}: ${!!$1(`#machpop .mk[data-mach="${c.m0}"]`)}`) },
			{ say: "pick another machine", act: (u, c) => { const m = $all("#machpop .mk").find(b => b.dataset.mach !== c.m0 && !b.disabled); c.m1 = m.dataset.mach; u.click(m); }, screen: c => ok($1("#machpop").hidden && S().tracks[0].m === c.m1, "view " + S().tracks[0].m), machine: c => ok(kitT(0) !== c.k0, "kit unchanged"), within: 10000 },
			{ ...undoKey, act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(kitT(0) === c.k0, "kit not back"), screen: c => ok(S().tracks[0].m === c.m0, "view " + S().tracks[0].m), within: 10000 }
		]
	};
	/* MM-X25: Clear (was Revert track) on the Sound page: the track goes back as the kit's slot stores it, one undo step */
	const storedPages = t => JSON.stringify(I().doc("kit", machine().kit?.current)?.tracks[t]?.pages?.slice(0, 7));
	const revertTrackJ = {
		name: "mm-sound-revert-track", proves: ["MM-X25"],
		steps: [
			go("sound"), sel(0),
			{ say: "the Clear key is there and off: the track is as its slot stores it",
				screen: () => ok(!!$1("#revert") && $1("#revert").disabled && /saved sound/.test($1("#revert").title), "key " + $1("#revert")?.disabled + " " + $1("#revert")?.title) },
			{ say: "drag a value of the track: the key turns on", act: async (u, c) => {
				const el = $1('#main .pc[data-g="FLT"]') || $1('#main .pc[data-g="AMP"]'); if (!el) throw new Error("no FLT or AMP value");
				c.g = el.dataset.g; c.i = +el.dataset.n; c.pg = PAGES.indexOf(c.g); c.q = `#main .pc[data-g="${c.g}"][data-n="${c.i}"]`;
				c.v0 = wk().tracks[0].pages[c.pg][c.i]; c.stored = storedPages(0); c.all0 = allKit(); const d = c.v0 > 64 ? -1 : 1;
				await u.drag(c.q, [[d * 6, 0], [d * 12, 0], [d * 18, 0], [d * 24, 0], [d * 30, 0]]);
				await until(() => wk().tracks[0].pages[c.pg][c.i] !== c.v0, 6000); c.v1 = wk().tracks[0].pages[c.pg][c.i]; c.h0 = histN(); },
				screen: () => ok(!$1("#revert").disabled, "key still off"), machine: c => ok(c.v1 !== c.v0 && storedPages(0) === c.stored, `value ${c.v0} -> ${c.v1}`), within: 8000 },
			{ say: "click Clear: the value is the slot's, the slot is untouched, the key is off, one undo step more", act: u => u.click("#revert"),
				screen: () => ok($1("#revert").disabled, "key still on"),
				machine: c => ok(wk().tracks[0].pages[c.pg][c.i] === c.v0 && allKit() === c.all0 && storedPages(0) === c.stored && histN() === c.h0 + 1, `value ${wk().tracks[0].pages[c.pg][c.i]} for ${c.v0}, undo steps ${histN()} for ${c.h0 + 1}`), within: 8000 },
			{ say: "press Cmd+Z once: the edit is back and the key is on again", act: u => { blur(); u.key("z", { cmd: true }); },
				screen: () => ok(!$1("#revert").disabled, "key off"), machine: c => ok(wk().tracks[0].pages[c.pg][c.i] === c.v1, `value ${wk().tracks[0].pages[c.pg][c.i]} for ${c.v1}`), within: 8000 }
		],
		async tidy(u, c) { blur(); u.key("z", { cmd: true }); await until(() => wk().tracks[0].pages[c.pg][c.i] === c.v0, 6000); }
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
			{ say: "wait on Pattern: the machine stays", act: () => sleep(5000),
				screen: c => ok(S().tracks[0].m === c.m1, "view " + S().tracks[0].m),
				machine: c => ok(kitT(0) !== c.k0 && machine().kit?.working === "edited", "kit back to " + kitT(0)
				+ ", " + machine().kit?.working), within: 2000 },
			go("sound"),
			{ say: "and on Kit again", act: () => sleep(1000), screen: c => ok(S().tracks[0].m === c.m1, "view " + S().tracks[0].m), machine: c => ok(kitT(0) !== c.k0, "kit back to " + kitT(0)), within: 2000 }
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
	/* The Mix strip heads: the track number, then the machine's short name (the full name the tooltip, an ellipsis when it does
	   not fit), then a square that flashes when the track trigs while the sequencer plays (skins/shared/deskTrig.js); a muted
	   track does not flash */
	const mixHeads = {
		name: "mm-mix-heads-trigs", proves: [],
		steps: [
			go("mix"),
			{ say: "every strip head shows the number small, the machine's name and a trig square", screen: () => { const hs = $all(".strip6 .shead"); return ok(hs.length === 6 && hs.every((h, i) => h.querySelector(".tn")?.textContent === String(i + 1) && h.querySelector(".mc")?.textContent.length > 0 && h.querySelector(".mc").title && h.querySelector(".trigsq")), hs.length + " heads: " + hs.map(h => h.textContent.trim()).join(" | ")); } },
			{ say: "the name is cut with an ellipsis, never clipped hard", screen: () => { const cs = getComputedStyle($1(".strip6 .shead .mc")); return ok(cs.textOverflow === "ellipsis" && cs.overflow === "hidden", cs.textOverflow + " " + cs.overflow); } },
			{ say: "press PLAY for 2.5 s: the squares of tracks with trigs flash, the others never", act: async (u, c) => {
				c.c0 = { ...DeskTrig.count }; c.fl = new Set(); const ob = new MutationObserver(ms => { for (const m of ms) if (m.target.classList?.contains("fl")) c.fl.add(+m.target.dataset.trig); });
				ob.observe($1("#main"), { subtree: true, attributes: true, attributeFilter: ["class"] });
				if (!S().playing) u.click("#play"); await until(() => S().playing, 5000); await sleep(2500); ob.disconnect();
				c.with = [0, 1, 2, 3, 4, 5].filter(i => S().tracks[i].steps.slice(0, S().len).some(st => st && !st.off && st.a) && !S().tracks[i].mute); c.cnt = Object.keys(DeskTrig.count).filter(k => DeskTrig.count[k] !== (c.c0[k] || 0)).map(Number); },
				screen: c => ok(c.fl.size > 0 && [...c.fl].every(i => c.with.includes(i)) && c.cnt.every(i => c.with.includes(i)), `drawn ${[...c.fl]}; counted ${c.cnt}; tracks with trigs ${c.with}`) },
			{ say: "press STOP: every square is out", act: async u => { if (S().playing) u.click("#play"); await until(() => !S().playing, 5000); await sleep(500); }, screen: () => ok($all(".trigsq").every(e => e.getAnimations().length === 0), "a square still flashes") },
			{ say: "click the M key of a track that has trigs", act: (u, c) => { c.t = c.with[0]; u.click(strip(c.t, ".ms.m")); }, screen: c => ok(!S().tracks[c.t] || S().tracks[c.t].mute, "not muted") },
			{ say: "play 2 s again: the muted track's square never flashes", act: async (u, c) => { c.c1 = { ...DeskTrig.count }; if (!S().playing) u.click("#play"); await until(() => S().playing, 5000); await sleep(2000); if (S().playing) u.click("#play"); await until(() => !S().playing, 5000); },
				screen: c => ok((DeskTrig.count[c.t] || 0) === (c.c1[c.t] || 0), "track " + c.t + " counted " + ((DeskTrig.count[c.t] || 0) - (c.c1[c.t] || 0))), within: 8000 }
		],
		async tidy(u, c) { if (S().playing) { u.click("#play"); await sleep(500); } if (c?.t != null && S().tracks[c.t]?.mute) u.click(strip(c.t, ".ms.m")); }
	};
	const mixSolo = {
		name: "mm-mix-solo", proves: ["MM-020", "MM-X06"],
		steps: [
			go("mix"),
			{ say: "click S on track 3: the other synth tracks are muted", act: (u, c) => { c.m0 = synthMutes(); u.click(strip(2, ".ms.s")); }, machine: () => ok(same(synthMutes(), [0, 1, 3, 4, 5]), "machine mutes " + synthMutes()), screen: () => ok(pressed(strip(2, ".ms.s")), "S not lit") },
			{ say: "click S again: the mutes are as before", act: u => u.click(strip(2, ".ms.s")), machine: c => ok(same(synthMutes(), c.m0), "machine mutes " + synthMutes()) }
		]
	};
	/* B-123, MM-X06: the solo is kept with the project: a page made again (nothing soloed on it) gets the solo the plug-in
	   keeps, the other tracks are muted, and the mute the person had before it comes back when the solo ends */
	const soloSaved = {
		name: "mm-mix-solo-saved", proves: ["MM-X06"],
		steps: [
			go("mix"),
			{ say: "mute track 1 with its M key, solo track 3 with its S key", act: async (u, c) => { c.m0 = synthMutes(); if (c.m0.length) throw new Error("a track is muted already: " + c.m0); u.click(strip(0, ".ms.m")); await sleep(400); u.click(strip(2, ".ms.s")); },
				screen: () => ok(pressed(strip(2, ".ms.s")) && pressed(strip(0, ".ms.m")), "keys not lit"), machine: () => ok(same(synthMutes(), [0, 1, 3, 4, 5]), "machine mutes " + synthMutes()), within: 8000 },
			{ say: "the page is made again with nothing soloed on it: the plug-in says its solo and the solo is back", act: async (u, c) => {
				window.MMView.setSolo([], []); S().tracks[1].mute = true; c.dropped = !S().tracks[2].solo && S().tracks[1].mute; Bridge.ready(); await until(() => S().tracks[2].solo, 6000); await sleep(600); },
				screen: c => ok(c.dropped && S().tracks[2].solo && S().tracks[0].mute && !S().tracks[1].mute && pressed(strip(2, ".ms.s")) && pressed(strip(0, ".ms.m")), `dropped ${c.dropped}, solo ${S().tracks[2].solo}, mutes ${S().tracks.map(t => +t.mute)}`),
				machine: () => ok(same(synthMutes(), [0, 1, 3, 4, 5]), "machine mutes " + synthMutes()), within: 10000 },
			{ say: "click S again: the solo ends and track 1 is still muted", act: u => u.click(strip(2, ".ms.s")),
				screen: () => ok(!S().tracks[2].solo && pressed(strip(0, ".ms.m")), "solo " + S().tracks[2].solo), machine: () => ok(same(synthMutes(), [0]), "machine mutes " + synthMutes()), within: 8000 }
		],
		async tidy(u) { if (S().tracks[2].solo) u.click(strip(2, ".ms.s")); await sleep(300); if (S().tracks[0].mute) { u.click(strip(0, ".ms.m")); await sleep(300); } }
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
	/* I-032: the output meters on the Mix page's routing graph: three pairs (A/B, C/D, E/F), two bars each. The page asks the
	   plug-in for levels only while Mix is on screen (mixMeters on / off); a level the plug-in sends raises the bars at once and
	   they fall on their own (30 dB a second); the clip mark lights for a sample over 0 dBFS. The levels are injected as the
	   plug-in's own message (window.gm.recv), so the bars are checked against known values; that the plug-in feeds them is the
	   host's: mixLevels messages arrive while Mix is shown and stop when it is left. */
	const mixSeen = { n: 0 };
	Bridge.onMessage(m => { if (m.type === "mixLevels") mixSeen.n++; });
	const mixInject = (rms, peak, clip) => window.gm.recv([{ type: "mixLevels", pairs: [0, 1, 2].map(k => ({ on: k < 2, clip: !!clip && k === 0, peak: [peak - 20 * k, peak - 20 * k], rms: [rms - 20 * k, rms - 20 * k] })) }]);
	/* (pair k is 20 dB quieter than the one before: C/D and E/F show lower bars) */
	const mixBar = (cls, k = 0, i = 0) => +($1(`[data-${cls}="${k}.${i}"]`)?.getAttribute("width") ?? NaN);
	const mixMeters = {
		name: "mm-mix-meters", proves: [],
		steps: [
			go("mix"),
			{ say: "the graph has a meter on each of the three bus lines, two bars (left, right) each, and the page asked the plug-in for levels",
				screen: () => { const st = window.MMView.mixMeterState(); return ok(st.want && st.running && $all("[data-mt]").length === 3 && $all(".mrm").length === 6 && $all(".mpk").length === 6 && $all(".mhd").length === 6,
					`want ${st.want}, running ${st.running}, groups ${$all("[data-mt]").length}, rms bars ${$all(".mrm").length}`); } },
			{ say: "the plug-in sends mixLevels while Mix is shown", act: async () => { await until(() => mixSeen.n >= 2, 3000); },
				machine: () => ok(mixSeen.n >= 2, mixSeen.n + " mixLevels messages") },
			{ say: "a loud level (RMS -10, peak -3 dBFS) raises A/B's bars at once: solid to the RMS, paler to the peak, the hold tick at the peak; a quiet one next to it stays low",
				act: async (u, c) => {
					await sleep(120);
					c.lo = mixBar("mr");
					mixInject(-10, -3, false);
					c.rm = mixBar("mr"); c.pk = mixBar("mp"); c.hd = +$1('[data-mh="0.0"]').getAttribute("x"); c.mid = mixBar("mr", 1, 0);
					c.W = 90; Journey.snapshot("mm-mix-meters"); },
				screen: c => ok(c.rm > c.lo && Math.abs(c.rm - c.W * 50 / 60) < 3 && Math.abs(c.pk - c.W * 57 / 60) < 3 && c.pk > c.rm && c.hd > c.rm && c.hd > 1052 + c.W * 0.9 && c.hd < 1052 + c.W && c.mid < c.rm,
					`before ${c.lo}, RMS ${c.rm} (want ${(c.W * 50 / 60).toFixed(1)}), peak ${c.pk} (want ${(c.W * 57 / 60).toFixed(1)}), hold x ${c.hd}, C/D ${c.mid}`) },
			{ say: "a sample over 0 dBFS lights A/B's clip mark; the others stay dark",
				act: async (u, c) => { mixInject(-6, 2, true); c.clip = $all(".mclip.on").map(e => e.dataset.mc).join(","); },
				screen: c => ok(c.clip === "0", "lit: " + c.clip) },
			{ say: "with nothing louder the bars fall by themselves, the hold tick stays",
				act: async (u, c) => { c.hi = mixBar("mr"); c.hold0 = +$1('[data-mh="0.0"]').getAttribute("x"); await sleep(900); c.lo2 = mixBar("mr"); c.hold1 = +$1('[data-mh="0.0"]').getAttribute("x"); },
				screen: c => ok(c.lo2 < c.hi - 5 && Math.abs(c.hold1 - c.hold0) < 1, `RMS ${c.hi} then ${c.lo2}, hold x ${c.hold0} then ${c.hold1}`) },
			{ say: "a pair the host did not enable (E/F) is dimmed", screen: () => ok($1('[data-mt="2"]').classList.contains("off") && !$1('[data-mt="0"]').classList.contains("off"), "E/F off " + $1('[data-mt="2"]').classList.contains("off")) },
			{ say: "leave Mix for Pattern: the meters stop (no frames, the page tells the plug-in off) and the plug-in stops sending",
				act: async (u, c) => { u.click(tab("seq")); await sleep(250); c.n0 = mixSeen.n; await sleep(400); c.n1 = mixSeen.n; },
				screen: () => { const st = window.MMView.mixMeterState(); return ok(!st.want && !st.running && !$1("[data-mt]"), `want ${st.want}, running ${st.running}, groups ${$all("[data-mt]").length}`); },
				machine: c => ok(c.n1 === c.n0, `mixLevels ${c.n0} then ${c.n1}`) },
			{ say: "back on Mix they run again and the plug-in sends again", act: async (u, c) => { u.click(tab("mix")); c.n0 = mixSeen.n; await until(() => mixSeen.n >= c.n0 + 2, 3000); },
				screen: () => { const st = window.MMView.mixMeterState(); return ok(st.want && st.running && $all("[data-mt]").length === 3, `want ${st.want}, running ${st.running}`); },
				machine: c => ok(mixSeen.n >= c.n0 + 2, `mixLevels ${c.n0} then ${mixSeen.n}`) }
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

	/* Discord 2026-10-13 (B-120): mute and solo keep working, and agree, across the Sequence and Mix workspaces; a solo on
	   the side the rail does not show (Synth or MIDI) is marked on that side's key */
	const msViews = {
		name: "mm-ms-across-views", proves: ["MM-020"],
		steps: [
			go("seq"),
			{ say: "click S on track 3 on the rail: the other synth tracks are muted", act: (u, c) => { c.m0 = synthMutes(); u.click('#rail .th[data-sel="2"] .ms.s'); },
				machine: () => ok(same(synthMutes(), [0, 1, 3, 4, 5]), "machine mutes " + synthMutes()), screen: () => ok(pressed('#rail .th[data-sel="2"] .ms.s'), "rail S not lit") },
			go("mix"),
			{ say: "Mix shows track 3's S lit", act: () => {}, screen: () => ok(pressed(strip(2, ".ms.s")), "Mix S not lit") },
			{ say: "click S on track 3 in Mix: solo off", act: u => u.click(strip(2, ".ms.s")), machine: c => ok(same(synthMutes(), c.m0), "machine mutes " + synthMutes()), screen: () => ok(!pressed(strip(2, ".ms.s")), "Mix S still lit") },
			go("seq"),
			{ say: "the rail shows track 3's S off", act: () => {}, screen: () => ok(!pressed('#rail .th[data-sel="2"] .ms.s') && !S().tracks[2].solo, "rail S lit " + pressed('#rail .th[data-sel="2"] .ms.s') + ", state " + S().tracks[2].solo) },
			{ say: "click M on track 1 on the rail", act: (u, c) => { c.a = synthMuted(0); u.click('#rail .th[data-sel="0"] .ms.m'); }, machine: c => ok(synthMuted(0) === !c.a, "machine mute " + synthMuted(0)), screen: c => ok(pressed('#rail .th[data-sel="0"] .ms.m') === !c.a, "rail M " + pressed('#rail .th[data-sel="0"] .ms.m')) },
			go("mix"),
			{ say: "Mix shows track 1's M; click it", act: (u, c) => { c.lit = pressed(strip(0, ".ms.m")); u.click(strip(0, ".ms.m")); }, machine: c => ok(synthMuted(0) === c.a, "machine mute " + synthMuted(0)), screen: c => ok(c.lit === !c.a && pressed(strip(0, ".ms.m")) === c.a, `Mix M was ${c.lit}, now ${pressed(strip(0, ".ms.m"))}`) },
			{ say: "click S on track 2 in Mix", act: u => u.click(strip(1, ".ms.s")), machine: () => ok(same(synthMutes(), [0, 2, 3, 4, 5]), "machine mutes " + synthMutes()) },
			go("seq"),
			{ say: "click MIDI on the rail: the MIDI tracks, and the Synth key says a solo holds there", act: u => u.click('[data-side="midi"]'),
				screen: () => ok(S().side === "midi" && !!$1('[data-side="int"] .sosign') && !$1('[data-side="midi"] .sosign'), `side ${S().side}; Synth mark ${!!$1('[data-side="int"] .sosign')}, MIDI mark ${!!$1('[data-side="midi"] .sosign')}`) },
			{ say: "click Synth: back to the synth tracks", act: u => u.click('[data-side="int"]'), screen: () => ok(S().side !== "midi", "side " + S().side) },
			{ say: "the rail shows track 2's S; click it: solo off", act: (u, c) => { c.lit = pressed('#rail .th[data-sel="1"] .ms.s'); u.click('#rail .th[data-sel="1"] .ms.s'); }, machine: c => ok(same(synthMutes(), c.m0), "machine mutes " + synthMutes()), screen: c => ok(c.lit && !pressed('#rail .th[data-sel="1"] .ms.s') && !$1(".sidesw .sosign"), "rail S was " + c.lit + "; a solo mark left " + !!$1(".sidesw .sosign")) }
		],
		async tidy(u) { if ([...S().tracks, ...S().midi].some(x => x.solo || x.mute)) { const b = $1("#allon"); if (b && !b.disabled) u.click(b); await sleep(500); } }
	};

	/* I-028 (Discord 2026-10-12): the rail's trig lamps on Sequence and Sound: a track's number lights while its trig
	   plays, only tracks with a trig light, and a frame lights them together */
	const railLamps = {
		name: "mm-seq-rail-lamps", proves: [],
		steps: [
			go("seq"),
			{ say: "the synth tracks on the rail", act: u => { if (S().side === "midi") u.click('[data-side="int"]'); }, screen: () => ok(S().side !== "midi", "side " + S().side) },
			{ say: "press PLAY and watch the rail for 2.5 s: the tracks with trigs light, the others never", act: async (u, c) => {
				c.lit = new Set(); const ob = new MutationObserver(ms => { for (const m of ms) if (m.target.classList?.contains("trig")) c.lit.add(+m.target.dataset.sel); });
				ob.observe($1("#rail"), { subtree: true, attributes: true, attributeFilter: ["class"] });
				if (!S().playing) u.click("#play"); await until(() => S().playing, 5000); await sleep(2500); ob.disconnect();
				c.with = [0, 1, 2, 3, 4, 5].filter(i => S().tracks[i].steps.slice(0, S().len).some(st => st && !st.off && st.a) && !S().tracks[i].mute); c.note = `lit ${[...c.lit]}, with trigs ${c.with}`; },
				screen: c => ok(c.lit.size > 0 && [...c.lit].every(i => c.with.includes(i)), `lit ${[...c.lit]}; tracks with trigs ${c.with}`) },
			{ say: "press STOP: no lamp stays lit", act: async u => { if (S().playing) u.click("#play"); await until(() => !S().playing, 5000); await sleep(400); }, screen: () => ok(!$1("#rail .th.trig"), "a lamp stays lit") }
		],
		async tidy(u) { if (S().playing) { u.click("#play"); await sleep(500); } }
	};

	/* I-031 (Discord 2026-10-16): a track that plays because another track's trig forwards to it (the kit's Trig
	   position) lights its rail number in a second colour, as "trig2"; the forwarding track keeps its own lamp */
	const railLampsFwd = {
		name: "mm-seq-rail-lamps-forwarded", proves: [],
		steps: [
			go("seq"),
			{ say: "the synth tracks on the rail; pick a track with trigs and send its trig on to a track of its own", act: async (u, c) => {
				if (S().side === "midi") u.click('[data-side="int"]');
				const trig = (t, k) => { const st = S().tracks[t].steps[k]; return !!(st && !st.off && st.a); }, T = [0, 1, 2, 3, 4, 5];
				/* the pair with the earliest step where a trigs and b does not (the stub plays slowly) */
				const first = (a, b) => { for (let k = 0; k < S().len; k++) if (trig(a, k) && !trig(b, k)) return k; return 99; };
				const best = T.flatMap(a => T.filter(b => b !== a).map(b => [a, b, first(a, b)])).sort((x, y) => x[2] - y[2])[0]; c.a = best[0]; c.b = best[1]; /* a step where a trigs and b does not */
				u.click(rail(c.a)); await sleep(300); await dockOpen(u, "trig"); u.click(`[data-set="trigpos"] button[data-v="${c.b}"]`);
				c.set = await until(() => S().tracks[c.a].trigpos === c.b, 4000); }, screen: c => ok(c.set, `T${c.a + 1} trig position ${S().tracks[c.a].trigpos}`) },
			{ say: "press PLAY until the target's number lights in the second colour, the source's own lamp stays the first", act: async (u, c) => {
				c.own = new Set(); c.fwd = new Set(); const ob = new MutationObserver(ms => { for (const m of ms) { const cl = m.target.classList; if (!cl) continue; if (cl.contains("trig")) c.own.add(+m.target.dataset.sel); if (cl.contains("trig2")) c.fwd.add(+m.target.dataset.sel); } });
				ob.observe($1("#rail"), { subtree: true, attributes: true, attributeFilter: ["class"] });
				if (!S().playing) u.click("#play"); await until(() => S().playing, 5000); await until(() => c.fwd.size > 0, 15000); ob.disconnect(); Journey.snapshot("mm-seq-rail-lamps-forwarded"); },
				screen: c => ok(c.fwd.has(c.b) && !c.fwd.has(c.a) && c.own.has(c.a), `second colour on ${[...c.fwd]} (target T${c.b + 1}); first colour on ${[...c.own]} (source T${c.a + 1}); trigpos now ${S().tracks[c.a].trigpos}, ws ${S().ws}`) },
			{ say: "press STOP, send the trig nowhere: no second-colour lamp stays, and after the change none lights", act: async (u, c) => { if (S().playing) u.click("#play"); await until(() => !S().playing, 5000); u.click(rail(c.a)); await sleep(300); u.click('[data-set="trigpos"] button[data-v=""]'); await until(() => S().tracks[c.a].trigpos == null, 4000); await sleep(400); },
				screen: () => ok(!$1("#rail .th.trig2") && S().tracks.every(t => t.trigpos == null), "a second-colour lamp stays or a trig position is left") }
		],
		async tidy(u, c) { if (S().playing) { u.click("#play"); await sleep(500); } if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); await back(u, c); }
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
	/* I-003: FOLLOW PLAYED TRACK in the engine menu (off by default, kept in the editor's setup): a note from a MIDI controller
	   (midiIn) on a synth track's channel (base + t inside CHANNEL SPAN) selects that track; another channel, and the
	   editor's own computer keyboard, do not */
	const followKeyLabel = () => $1('#engsel option[value="followPlayed"]')?.textContent;
	const followPlayed = {
		name: "mm-follow-played-track", proves: ["MM-X26"],
		steps: [
			go("seq"), sel(0),
			{ say: "track 1 is selected; the engine menu says FOLLOW PLAYED TRACK: OFF", act: (u, c) => { const g = globalNow()?.channels; c.base = g?.base; c.span = g?.span; if (!(c.base <= 8 && c.span >= 5)) throw new Error("the global's channels: " + JSON.stringify(g)); },
				screen: () => ok(S().sel === 0 && followKeyLabel() === "FOLLOW PLAYED TRACK: OFF", "track " + S().sel + ", " + followKeyLabel()), within: 6000 },
			{ say: "off: a MIDI keyboard plays track 4's channel: the selection stays", act: async (u, c) => { window.gm.recv([{ type: "midiIn", ch: c.base + 3, note: 60, vel: 100 }]); await sleep(300); },
				screen: () => ok(S().sel === 0, "track " + S().sel) },
			{ say: "choose FOLLOW PLAYED TRACK in the engine menu: it reads ON", act: u => u.pick("engsel", "followPlayed"),
				screen: () => ok(followKeyLabel() === "FOLLOW PLAYED TRACK: ON", followKeyLabel()), within: 4000 },
			{ say: "on: a note on track 4's channel selects track 4", act: (u, c) => window.gm.recv([{ type: "midiIn", ch: c.base + 3, note: 60, vel: 100 }]),
				screen: () => ok(S().sel === 3, "track " + S().sel), within: 2000 },
			{ say: "a note on a channel no synth track plays (past the span): the selection stays", act: async (u, c) => { c.far = [...Array(16).keys()].find(x => x < c.base || x >= c.base + c.span); window.gm.recv([{ type: "midiIn", ch: c.far, note: 60, vel: 100 }]); await sleep(300); },
				screen: c => ok(c.far != null && S().sel === 3, "channel " + c.far + ", track " + S().sel) },
			{ say: "press A on the computer keyboard (the editor's own audition): the selection stays", act: async u => { blur(); u.key("a"); await sleep(300); },
				screen: () => ok(S().sel === 3, "track " + S().sel) },
			{ say: "a burst of 40 notes alternating track 5 and track 6, ending on 6: one selection, track 6", act: async (u, c) => { c.n = 0; const sl = window.select; window.select = t => { c.n++; sl(t); };
					try { window.gm.recv(Array.from({ length: 40 }, (_, i) => ({ type: "midiIn", ch: c.base + 4 + (i % 2 ? 1 : 0), note: 60, vel: 100 }))); await sleep(300); } finally { window.select = sl; } },
				screen: c => ok(S().sel === 5 && c.n === 1, "track " + S().sel + ", " + c.n + " selections") },
			{ say: "a question open: a note for track 1 leaves the selection", act: async (u, c) => { u.pick("engsel", "reset"); await until(() => !$1("#dlg").hidden, 3000); window.gm.recv([{ type: "midiIn", ch: c.base, note: 60, vel: 100 }]); await sleep(300); },
				screen: () => ok(S().sel === 5 && !$1("#dlg").hidden, "track " + S().sel) },
			{ say: "close the question: a note for track 1 selects it again", act: async (u, c) => { u.key("Escape"); await until(() => $1("#dlg").hidden, 3000); window.gm.recv([{ type: "midiIn", ch: c.base, note: 60, vel: 100 }]); },
				screen: () => ok(S().sel === 0, "track " + S().sel), within: 2000 },
			{ say: "LEARN waiting for a note: a note for track 3 leaves the selection", act: async (u, c) => { window.GP.learn = 2; window.gm.recv([{ type: "midiIn", ch: c.base + 2, note: 60, vel: 100 }]); await sleep(300); window.GP.learn = null; },
				screen: () => ok(S().sel === 0, "track " + S().sel) },
			{ say: "the HW MIDI engine (the port carries the machine's own MIDI out): a note for track 3 leaves the selection", act: async (u, c) => { const m0 = machine(), hw = { ...m0, capabilities: { ...m0.capabilities, engine: "hw" } };
					window.gm.recv([{ type: "machine", doc: hw }]); await sleep(100); window.gm.recv([{ type: "midiIn", ch: c.base + 2, note: 60, vel: 100 }]); await sleep(300); window.gm.recv([{ type: "machine", doc: m0 }]); },
				screen: () => ok(S().sel === 0, "track " + S().sel) },
			{ say: "a note on track 2's channel selects track 2", act: (u, c) => window.gm.recv([{ type: "midiIn", ch: c.base + 1, note: 60, vel: 100 }]),
				screen: () => ok(S().sel === 1, "track " + S().sel), within: 2000 },
			{ say: "choose it again: OFF; a note on track 5's channel leaves track 2 selected", act: async (u, c) => { await u.pick("engsel", "followPlayed"); await sleep(300); window.gm.recv([{ type: "midiIn", ch: c.base + 4, note: 60, vel: 100 }]); await sleep(300); },
				screen: () => ok(followKeyLabel() === "FOLLOW PLAYED TRACK: OFF" && S().sel === 1, followKeyLabel() + ", track " + S().sel), within: 4000 }
		],
		async tidy(u) { if (followKeyLabel() === "FOLLOW PLAYED TRACK: ON") await u.pick("engsel", "followPlayed"); }
	};
	const kbLit = {
		name: "mm-perform-keys-lit", proves: ["MM-050", "MM-X14"],
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
		name: "mm-sound-type-value", proves: ["MM-015", "MM-X08"],
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
		],
		async tidy(u, c) { await back(u, c); }
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
		name: "mm-song-slots", proves: ["MM-253", "MM-254", "MM-255", "MM-X22"],
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
			/* the slots cleared to make room: their undo steps back */
			await back(u, c);
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
	/* 0.8 B-162: Pattern, Chain and Song keys pressed fast and in odd orders: after each run the page's switch is the machine's mode, the chain
	   document is the pads shown, and no kit value, no pattern changed. */
	const modeCycle = {
		name: "mm-song-mode-cycle", proves: ["MM-165"],
		steps: (() => {
			const key = v => `[data-set="songpick"] button[data-v="${v}"]`;
			const snap = () => ({ idx: cur(), kit: allKit(), pat: JSON.stringify(patDoc()) });
			const mode = () => machine().song?.songMode;
			const pads = () => $all("#main [data-chainpad].in").map(b => +b.dataset.chainpad).sort((a, b) => a - b);
			const settle = async () => { await sleep(1200); await until(() => true, 4000); await sleep(500); };
			const verdict = (c, want) => {
				const m = mode(), ch = desk().chain, now = snap(), r = [];
				if (m !== want) r.push(`machine mode ${m}, wanted ${want}`);
				if (now.idx !== c.snap.idx && ch?.active && ch.patterns.includes(now.idx)) { c.snap = now; c.moved = (c.moved || 0) + 1; }
				if (now.idx !== c.snap.idx) r.push(`current pattern ${c.snap.idx} -> ${now.idx}`);
				if (now.kit !== c.snap.kit) { const a = JSON.parse(c.snap.kit), b = JSON.parse(now.kit), d = []; const w = (x, y, p) => { if (d.length < 4 && JSON.stringify(x) !== JSON.stringify(y)) { if (x && typeof x === "object") for (const k of Object.keys(x)) w(x[k], y?.[k], p + "." + k); else d.push(`${p}: ${x} -> ${y}`); } }; w(a, b, "kit"); r.push("a kit value changed " + d.join(", ")); }
				if (now.idx === c.snap.idx && now.pat !== c.snap.pat) r.push("the pattern changed");
				return { r, m, ch };
			};
			const machineOk = want => c => { const { r, ch } = verdict(c, want); return ok(!r.length, r.join("; ") + " chain " + JSON.stringify(ch)); };
			const screenOk = want => c => {
				const { r, m, ch } = verdict(c, want), song = pressed(key("song")), chain = pressed(key("chain")), pat = pressed(key("pattern"));
				if (song !== (m === true)) r.push(`SONG key ${song}, machine song ${m}`);
				if (chain && song) r.push("CHAIN and SONG both lit");
				if (m === true || !chain) { /* a chain the machine plays is shown in CHAIN only */ }
				if (chain) { const want2 = ch?.active ? ch.patterns.slice().sort((a, b) => a - b) : []; const shown = pads(); if (shown.length >= 2 ? JSON.stringify(shown) !== JSON.stringify(want2) : want2.length) r.push(`pads ${shown} vs chain ${want2}`); }
				if (!chain && !song && !pat) r.push("no key lit");
				if (/CHAIN/.test($1("#songPlays")?.textContent || "") && !(ch?.active && m !== true)) r.push("header says CHAIN: " + $1("#songPlays")?.textContent);
				return ok(!r.length, r.join("; "));
			};
			const answer = async u => { if (await until(dlgShown, 1500)) { const b = $all("#dlg [data-dlg]").find(x => /end the chain|Pick it/i.test(x.textContent)); if (b) { u.click(b); await sleep(300); } } };
			const toPattern = async u => { u.click(key("pattern")); await sleep(600); if (mode() !== false) { u.click(key("pattern")); await sleep(600); } };
			return [
				go("song"),
				{ say: "stop, an empty song (the machine loads a song row's pattern and kit in SONG mode: not this journey's question), PATTERN mode, no chain; remember the kit and the pattern", act: async (u, c) => { await stopAll(u); c.cur = machine().song?.current ?? 0; await until(() => I().slots("song").length >= 24, 20000); c.s = emptySongMm(c.cur); if (c.s == null) throw new Error("no empty song"); await loadSlot(u, c.s); await toPattern(u); if (desk().chain?.active) { u.click(key("chain")); await sleep(300); u.click('[data-chain="clear"]'); await sleep(800); u.click(key("pattern")); } await settle(); c.snap = snap(); c.m0 = mode(); }, machine: c => ok(mode() === false, "mode " + mode()), within: 6000 },
				{ say: "(a) SONG, PATTERN, SONG, PATTERN, 100 ms apart", act: async (u, c) => { for (const v of ["song", "pattern", "song", "pattern"]) { u.click(key(v)); await sleep(100); } await settle(); }, machine: machineOk(false), screen: screenOk(false), within: 6000 },
				{ say: "(a2) the same at 20 ms", act: async (u, c) => { for (const v of ["song", "pattern", "song", "pattern", "song", "pattern"]) { u.click(key(v)); await sleep(20); } await settle(); }, machine: machineOk(false), screen: screenOk(false), within: 6000 },
				{ say: "(b) PATTERN, CHAIN, two pads, SONG inside the 150 ms chain timer, then PATTERN", act: async (u, c) => { u.click(key("pattern")); await sleep(100); u.click(key("chain")); await sleep(100); u.click('[data-bank="0"]'); await sleep(100); u.click('[data-chainpad="1"]'); await sleep(50); u.click('[data-chainpad="2"]'); await sleep(40); u.click(key("song")); await sleep(100); u.click(key("pattern")); await settle(); }, machine: machineOk(false), screen: screenOk(false), within: 6000 },
				{ say: "(b2) CHAIN, two pads, PATTERN at once, then wait the timer out", act: async (u, c) => { u.click(key("chain")); await sleep(100); u.click('[data-chain="clear"]'); await sleep(300); u.click('[data-chainpad="3"]'); await sleep(30); u.click('[data-chainpad="4"]'); u.click(key("pattern")); await sleep(300); u.click(key("chain")); await settle(); }, machine: machineOk(false), screen: screenOk(false), within: 6000 },
				{ say: "(c) chain two pads, wait, PATTERN, pick a pattern pad: the chain ends and the screen does not say CHAIN", act: async (u, c) => { u.click(key("chain")); await sleep(200); u.click('[data-chain="clear"]'); await sleep(500); u.click('[data-chainpad="5"]'); await sleep(100); u.click('[data-chainpad="6"]'); await sleep(1500); c.chained = !!desk().chain?.active; u.click(key("pattern")); await sleep(300); u.click('[data-patgo="7"]', { shift: true }); await answer(u); await sleep(100); await settle(); },
					machine: c => { const m = machineOk(false)(c); return m.pass === false ? m : ok(c.chained && !desk().chain?.active, `chain was ${c.chained}, now ${JSON.stringify(desk().chain)}`); }, screen: c => { const s = screenOk(false)(c); return s.pass === false ? s : ok(!pressed(key("chain")) && !/CHAIN/.test($1("#songPlays")?.textContent || ""), "CHAIN still shown: " + $1("#songPlays")?.textContent); }, within: 6000 },
				{ say: "(c2) CHAIN, two pads, then the machine's chain ends from outside (the LCD's way): CHAIN is not kept lit over no chain", act: async (u, c) => { u.click(key("chain")); await sleep(200); u.click('[data-chainpad="8"]'); await sleep(100); u.click('[data-chainpad="9"]'); await sleep(1500); c.chained = !!desk().chain?.active; Bridge.send({ op: "chainClear" }); await settle(); },
					machine: c => ok(c.chained && !desk().chain?.active, `chain was ${c.chained}, now ${JSON.stringify(desk().chain)}`), screen: c => { const r = pressed(key("chain")) ? (pads().length >= 2 ? "CHAIN lit with pads " + pads() + " over no chain" : "") : ""; return ok(!r, r || "ok"); }, within: 6000 },
				{ say: "(e) the page's own Clear keeps CHAIN lit with empty pads, however late the machine answers", act: async (u, c) => { c.snap = snap(); u.click(key("chain")); await sleep(200); u.click('[data-chainpad="10"]'); await sleep(100); u.click('[data-chainpad="11"]'); await until(() => desk().chain?.active, 6000); await sleep(2500); c.snap = snap(); u.click('[data-chain="clear"]'); await sleep(6500); await settle(); },
					machine: c => { const m = machineOk(false)(c); return m === true ? ok(!desk().chain?.active, "chain " + JSON.stringify(desk().chain)) : m; }, screen: c => ok(pressed(key("chain")) && pads().length === 0, `CHAIN lit ${pressed(key("chain"))}, pads ${pads()}`), within: 6000 },
				{ say: "(f) SONG, then CHAIN and two pads at once: the chain is sent once the machine has left SONG mode", act: async (u, c) => { c.snap = snap(); u.click(key("song")); await sleep(60); u.click(key("chain")); await sleep(30); u.click('[data-bank="0"]'); u.click('[data-chainpad="12"]'); await sleep(30); u.click('[data-chainpad="13"]'); await sleep(3500); await settle(); },
					machine: c => { const m = machineOk(false)(c); return m === true ? ok(desk().chain?.active && same(desk().chain.patterns, [12, 13]), "chain " + JSON.stringify(desk().chain)) : m; }, screen: screenOk(false), within: 6000 },
				{ say: "(g) Back to one pad, then PATTERN inside the 150 ms: the chain still ends", act: async (u, c) => { c.snap = snap(); u.click('[data-chain="undo"]'); await sleep(40); u.click(key("pattern")); await sleep(300); await settle(); },
					machine: c => { const m = machineOk(false)(c); return m === true ? ok(!desk().chain?.active, "chain " + JSON.stringify(desk().chain)) : m; }, screen: screenOk(false), within: 8000 },
				{ say: "(h) a chain in another bank than the page shows: nothing is drawn again while nothing changes", act: async (u, c) => { c.snap = snap(); u.click(key("chain")); await sleep(200); u.click('[data-bank="0"]'); await sleep(100); u.click('[data-chainpad="1"]'); await sleep(100); u.click('[data-chainpad="2"]'); await until(() => desk().chain?.active, 6000); await sleep(2500); c.snap = snap(); u.click('[data-bank="1"]'); await sleep(600); c.draws = 0; const mo = new MutationObserver(l => { c.draws += l.length; }); mo.observe($1("#main"), { childList: true, subtree: true, attributes: true }); await sleep(1800); mo.disconnect(); u.click('[data-bank="0"]'); await sleep(300); u.click('[data-chain="clear"]'); await sleep(1500); await settle(); },
					machine: machineOk(false), screen: c => ok(c.draws === 0, c.draws + " changes of the page in 1.8 s with nothing changed"), within: 6000 },
				{ say: "(d) CHAIN, then PLAY, then stop (a chain made while stopped moved the current pattern to its first: that is the machine's, the baseline is taken here)", act: async (u, c) => { c.snap = snap(); u.click(key("chain")); await sleep(100); u.click("#play"); await sleep(1500); u.click("#play"); await settle(); }, machine: machineOk(false), screen: screenOk(false), within: 8000 },
				{ say: "SONG then PATTERN once more settles", act: async (u, c) => { u.click(key("song")); await sleep(100); u.click(key("pattern")); await settle(); }, machine: machineOk(false), screen: screenOk(false), within: 6000 }
			];
		})(),
		async tidy(u, c) { if (dlgShown()) { const b = $all("#dlg [data-dlg]").find(x => /end the chain|Pick it/i.test(x.textContent)) || $1("#dlg [data-dlg]"); u.click(b); await sleep(300); } await stopAll(u); Bridge.send({ op: "chainClear" }); await sleep(300); u.click(`[data-set="songpick"] button[data-v="pattern"]`); await sleep(1500); if (c.cur != null) await loadSlot(u, c.cur).catch(() => { }); }
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
		name: "mm-lib-kit-load", proves: ["MM-025", "MM-075", "MM-096", "MM-X22"],
		steps: [
			{ say: "click KIT on the LCD: the kit library", act: u => u.click("#kitf"), screen: () => ok(!$1("#libpop").hidden && $all("#libpop .ks").length >= 64, $all("#libpop .ks").length + " slots") },
			{ say: "click another kit: it loads", act: async (u, c) => { c.k0 = machine().kit.current; c.k = I().slots("kit").find(k => k !== c.k0 && I().doc("kit", k) && !MmConvert.kitEmpty(I().doc("kit", k))); u.click(ks(c.k)); if (await until(dlgShown, 1500)) { u.click(dlgButton("Load without saving") || $1("#dlg .danger")); c.note = "asked first"; } },
				machine: c => ok(machine().kit.current === c.k, "machine kit " + machine().kit.current), screen: c => ok($1(ks(c.k))?.classList.contains("cur"), "not current"), within: 10000 },
			{ say: "click the first kit again", act: async (u, c) => { u.click(ks(c.k0)); if (await until(dlgShown, 1500)) u.click(dlgButton("Load without saving") || $1("#dlg .danger")); }, machine: c => ok(machine().kit.current === c.k0, "machine kit " + machine().kit.current), within: 10000 },
			{ say: "press Escape", act: u => u.key("Escape"), screen: () => ok($1("#libpop").hidden, "open") }
		]
	};
	const kitCopy = {
		name: "mm-lib-kit-copy-paste-undo", proves: ["MM-103", "MM-X22"],
		steps: [
			{ say: "open the kit library, Alt-click a kit, click Copy", act: async (u, c) => { u.click("#kitf"); await sleep(300); const cur0 = machine().kit.current; c.src = I().slots("kit").find(k => k !== cur0 && kitName(k) && !MmConvert.kitEmpty(I().doc("kit", k))); u.click(ks(c.src), { alt: true }); await sleep(150); u.click('#libpop [data-la="copy"]'); }, screen: c => ok(true) },
			{ say: "Alt-click another kit and click Paste", act: async (u, c) => { const cur0 = machine().kit.current; c.dst = I().slots("kit").reverse().find(k => k !== cur0 && k !== c.src && kitName(k) !== kitName(c.src)); c.d0 = kitName(c.dst); u.click(ks(c.dst), { alt: true }); await sleep(150); u.click('#libpop [data-la="paste"]'); await sleep(300); if (dlgShown()) u.click($1("#dlg .danger") || $1('#dlg [data-dlg="0"]')); },
				machine: c => ok(kitName(c.dst) === kitName(c.src), "slot " + kitName(c.dst)), within: 15000 },
			{ ...undoKey, say: "press Cmd+Z (the library open): the slot is back", machine: c => ok(kitName(c.dst) === c.d0, "slot " + kitName(c.dst)), within: 15000 },
			{ say: "press Escape", act: u => u.key("Escape"), screen: () => ok($1("#libpop").hidden, "open") }
		]
	};
	const patGo = {
		name: "mm-lib-pattern-go", proves: ["MM-070", "MM-162", "MM-X21"],
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
		name: "mm-keys-play-notes", proves: ["MM-027", "MM-050", "MM-X19"],
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
		name: "mm-keys-tap-tempo", proves: ["MM-023", "MM-197", "MM-X20"],
		steps: [
			go("mix"),
			{ say: "tap B five times, about 0.5 s apart (T is a black key on the Monomachine Editor): the tempo follows", act: async (u, c) => { c.b0 = machine().tempo; blur(); if (typeof TAP !== "undefined" && TAP.length) await sleep(2100); /* a new run of taps (the page joins taps less than 2 s apart) */ const at = []; for (let i = 0; i < 5; i++) { at.push(performance.now()); u.key("b"); await sleep(500); } c.want = Math.round(60000 / ((at[4] - at[0]) / 4) * 10) / 10; c.note = c.want + " BPM"; },
				screen: c => ok(Math.abs(S().bpm - c.want) <= tapSlack(c.want), "BPM " + S().bpm + ", want " + c.want), machine: c => ok(Math.abs(machine().tempo - c.want) <= tapSlack(c.want), "tempo " + machine().tempo + ", want " + c.want), within: 8000 }
		],
		async tidy(u, c) { if (c.b0 != null) { const d = c.b0 > machine().tempo ? -1 : 1; await u.drag("#bpm", [[0, d * 2 * (c.b0 - machine().tempo)]]); } }
	};
	const queue = {
		name: "mm-seq-queue-while-playing", proves: ["MM-071", "MM-164", "MM-X21"],
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
		name: "mm-seq-paste-steps-keeps-page", proves: ["MM-183", "MM-X10"],
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
		name: "mm-seq-paste-many", proves: ["MM-044", "MM-X10"],
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
			{ say: "press Alt+Space: live recording, playing (pressed again when the plug-in says the panel is busy: an earlier journey's dumps on their way, as mm-seq-grid-record)", act: async (u, c) => { c.n0 = trigsOf(0).length; c.p0 = pat0(); await keep(c, "pattern", cur()); blur(); results.length = 0; u.key(" ", { alt: true }, "Space");
				for (let i = 0; i < 5 && await until(() => results.some(r => r.op === "record" && r.ok === false), 1500); i++) { c.note = "the plug-in said the panel was busy (SYSEX RECV); pressed again"; results.length = 0; await sleep(1500); blur(); u.key(" ", { alt: true }, "Space"); }
				/* RECORD held + PLAY: the machine plays by itself. No PLAY of the journey's own: pressed while the chord
				   still waited for a busy panel (an earlier journey's dumps) it reached the machine around the chord and
				   left it playing with RECORD off (the 0.5.0 gate) */ },
				machine: () => ok(tele.last?.record === "live" && tele.last?.playing, `record ${tele.last?.record}, playing ${tele.last?.playing}`), within: 8000 },
			{ say: "play A, S, D on the keyboard while it records: the machine records notes", act: async u => { for (const k of ["a", "s", "d"]) { u.key(k); await sleep(450); } },
				machine: c => ok(pat0() !== c.p0, "pattern unchanged (" + c.n0 + " notes)"), within: 15000 },
			{ say: "click RECORD off, then STOP", act: async u => { u.click("#rec"); await sleep(600); if (S().playing) u.click("#play"); }, machine: () => ok(tele.last?.record === "off" && !tele.last?.playing, `record ${tele.last?.record}`), within: 8000 }
		],
		async tidy(u, c) { if (tele.last?.record && tele.last.record !== "off") u.click("#rec"); if (S().playing) u.click("#play"); await sleep(800); if (c.p0) await undoUntil(u, () => pat0() === c.p0, 3); await back(u, c); }
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
			{ say: "pick the synth track with the most notes", act: async (u, c) => { c.t = [0, 1, 2, 3, 4, 5].sort((a, b) => trigsOf(b).length - trigsOf(a).length)[0]; c.p0 = trigsOf(c.t); c.others = [0, 1, 2, 3, 4, 5].filter(t => t !== c.t).map(trigsOf);
					/* the live erase is the machine's, not an undo step: the pattern is kept first and pasted back in the tidy */
					await keep(c, "pattern", cur()); u.click(rail(c.t)); },
				screen: c => ok(S().sel === c.t, "selected " + S().sel), machine: c => ok(c.p0.length > 0, "no notes on T" + (c.t + 1)) },
			/* once the panel is free: the SYSEX RECV session idle, nothing on its way. RECORD and the erase (EXIT) are refused
			   while the panel takes a dump or leaves SYSEX RECV (mmDeskTest "Bug 4": a key pressed then is lost; PLAY and STOP
			   wait instead). The journey before (mm-seq-fill-every's undo) left a dump going, and the session leaves 3 s after
			   its last dump, so the record or the erase that followed met "The panel is busy" */
			{ say: "press Alt+Space once the panel is free: live recording, playing", act: async (u, c) => { const recv = () => I().machine?.recv || {};
					if (!await until(() => recv().state === "idle" && !recv().sending, 15000)) c.note = `SYSEX RECV ${recv().state}, ${recv().sending} sending`;
					blur(); results.length = 0; u.key(" ", { alt: true }, "Space"); },
				machine: () => ok(tele.last?.record === "live" && tele.last?.playing, `record ${tele.last?.record}, playing ${tele.last?.playing}; ${resultsSay()}`), within: 8000 },
			{ say: "hold Delete: the selected track's notes go as they play", act: () => { results.length = 0; blur(); keyEv("keydown", "Delete"); },
				screen: () => ok(document.body.classList.contains("erasing"), "not marked as erasing"),
				machine: c => ok(trigsOf(c.t).length < c.p0.length, `${c.p0.length} -> ${trigsOf(c.t).length} notes; ${resultsSay()}`), within: 10000 },
			{ say: "let Delete go, click RECORD off, then STOP: the other tracks kept their notes", act: async u => { keyEv("keyup", "Delete"); await sleep(300); u.click("#rec"); await sleep(600); if (S().playing) u.click("#play"); },
				screen: () => ok(!document.body.classList.contains("erasing"), "still marked"),
				machine: c => ok(tele.last?.record === "off" && !tele.last?.playing && [0, 1, 2, 3, 4, 5].filter(t => t !== c.t).map(trigsOf).every((a, k) => same(a, c.others[k])), `record ${tele.last?.record}, playing ${tele.last?.playing}`), within: 8000 }
		],
		async tidy(u, c) { keyEv("keyup", "Delete"); if (tele.last?.record && tele.last.record !== "off") u.click("#rec"); await sleep(400); if (S().playing) u.click("#play"); await back(u, c); }
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
				screen: () => ok(S().recMode !== "step" && !$1(".stepcur") && !$1("#rec").classList.contains("step"), "cursor or STEP left"), within: 6000 },
			{ say: "pick a MIDI track and Shift-click RECORD: step recording starts without a track (no t: no TRACK key, POLY and the focus stay)", act: async (u, c) => { u.click('[data-side="midi"]'); await sleep(300); u.click(rail(6)); await sleep(300); await recvIdle(); recSent.length = 0; results.length = 0; c.f = machine().focus; u.click("#rec", { shift: true }); await sleep(800); },
				machine: c => ok(tele.last?.record === "step" && recSent.length >= 1 && recSent.every(r => r.t === undefined) && machine().focus === c.f, `record ${tele.last?.record}, sent ${JSON.stringify(recSent)}, focus ${c.f} -> ${machine().focus}; ${resultsSay()}`), within: 8000 },
			{ say: "Esc: done, and back to the synth tracks", act: async u => { u.key("Escape"); await sleep(300); u.click('[data-side="int"]'); }, machine: () => ok(tele.last?.record === "off", "record " + tele.last?.record), within: 6000 }
		],
		async tidy(u) { if (tele.last?.record === "step") u.key("Escape"); if (S().stepSel) clearSel(); }
	};
	const genKeys = {
		name: "mm-gen-keys-r", proves: ["MM-X04"],
		steps: [
			go("seq"), sel(0),
			{ say: "click track 1's GEN key", act: async u => { await genAt(u, 0); }, screen: () => ok(!$1("#genpop").hidden, "no dialog") },
			{ say: "press R until the notes change", act: async (u, c) => { c.p0 = pat0(); for (let i = 0; i < 5; i++) { u.key("r"); if (await until(() => pat0() !== c.p0, 4000)) break; } }, machine: c => ok(pat0() !== c.p0, "unchanged"), within: 15000 },
			/* one up, or one down (Shift-click) when R rolled it to its top: Hits stops at Steps, Density at 100 (the page
			   tier's one failure in the dev-cycle gate run) */
			{ say: "click GEN's Hits value (a Euclid spec) or Density (Shift-click when it is at its top)", act: (u, c) => { c.p1 = pat0();
				const num = q => parseInt($1(q)?.getAttribute("aria-valuenow") || "0", 10), euclid = !!$1('#genpop .gv[data-gv="k"]');
				const q = euclid ? '#genpop .gv[data-gv="k"]' : '#genpop .gv[data-gv="dens"]', top = euclid ? num('#genpop .gv[data-gv="n"]') : 100;
				u.click(q, { shift: num(q) >= top }); }, machine: c => ok(pat0() !== c.p1, "unchanged"), within: 15000 },
			{ say: "press Enter: Done keeps the run", act: u => u.key("Enter"), screen: () => ok($1("#genpop").hidden, "the dialog is open") },
			{ ...undoKey, say: "press Cmd+Z: the whole run in one step", act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(pat0() === c.p0, "pattern not back"), within: 15000 }
		],
		async tidy(u, c) { await genDone(u); if (c.p0) await undoUntil(u, () => pat0() === c.p0, 3); }
	};
	const mutScope = {
		name: "mm-gen-mutate-scope", proves: ["MM-X05"],
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
		name: "mm-sound-value-keys", proves: ["MM-015", "MM-X08"],
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
			{ say: "drag a handle of a Kit screen", act: async (u, c) => { const cv = $all("#main canvas.ed").find(x => ED[x.dataset.ed]?.handles); if (!cv) throw new Error("no screen"); c.k0 = kitT(0); const r = cv.getBoundingClientRect(), h = ED[cv.dataset.ed].handles(r.width, r.height, cv)[0]; c.note = cv.dataset.ed + " " + h.k; await u.drag(cv, [[10, 0], [20, -6], [30, -10]], {}, { fx: h.x / r.width, fy: Math.min(Math.max(h.y, 6), r.height - 6) / r.height }); },
				machine: c => ok(kitT(0) !== c.k0, "kit unchanged"), within: 15000 },
			{ ...undoKey, act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(kitT(0) === c.k0, "kit not back"), within: 15000 }
		]
	};
	/* I-043: the filter envelope's reach pane: a drag left or right on its BOFS and WOFS dots covers -64 to +63 */
	const filterEnv = {
		name: "mm-sound-filter-env", proves: [],
		steps: [
			go("sound"), sel(0),
			{ say: "drag the BOFS dot of the filter envelope screen to the left edge", act: async (u, c) => {
				const cv = $1('#main canvas.ed[data-ed="fenv"]'); if (!cv) throw new Error("no filter envelope screen"); c.cv = cv; c.b0 = wk().tracks[0].pages[2][6]; c.w0 = wk().tracks[0].pages[2][7];
				const r = cv.getBoundingClientRect(), h = ED.fenv.handles(r.width, r.height, cv).find(x => x.k === "BOFS");
				await u.drag(cv, [[-20, 0], [-80, 0], [-300, 0]], {}, { fx: h.x / r.width, fy: h.y / r.height }); },
				screen: () => ok(valueText('#main .pc[data-g="FLT"][data-n="6"]') === "-64", "BOFS shows " + valueText('#main .pc[data-g="FLT"][data-n="6"]')),
				machine: () => ok(wk().tracks[0].pages[2][6] === 0, "kit BOFS " + wk().tracks[0].pages[2][6]), within: 8000 },
			{ say: "drag the WOFS dot to the right edge", act: async u => {
				const cv = $1('#main canvas.ed[data-ed="fenv"]'), r = cv.getBoundingClientRect(), h = ED.fenv.handles(r.width, r.height, cv).find(x => x.k === "WOFS");
				await u.drag(cv, [[20, 0], [80, 0], [300, 0]], {}, { fx: h.x / r.width, fy: h.y / r.height }); },
				screen: () => ok(valueText('#main .pc[data-g="FLT"][data-n="7"]') === "+63", "WOFS shows " + valueText('#main .pc[data-g="FLT"][data-n="7"]')),
				machine: () => ok(wk().tracks[0].pages[2][7] === 127, "kit WOFS " + wk().tracks[0].pages[2][7]), within: 8000 },
			{ say: "drag the ATK dot of the small square screen: BOFS stays", act: async (u, c) => {
				const cv = $1('#main canvas.ed[data-ed="fenv"]'), r = cv.getBoundingClientRect(), h = ED.fenv.handles(r.width, r.height, cv).find(x => x.k === "ATK"); c.a0 = wk().tracks[0].pages[2][4];
				await u.drag(cv, [[10, 0], [20, 0], [30, 0]], {}, { fx: h.x / r.width, fy: h.y / r.height }); },
				machine: c => ok(wk().tracks[0].pages[2][4] !== c.a0 && wk().tracks[0].pages[2][6] === 0, `ATK ${wk().tracks[0].pages[2][4]} (was ${c.a0}), BOFS ${wk().tracks[0].pages[2][6]}`), within: 8000 }
		],
		async tidy(u, c) { blur(); for (let i = 0; i < 3 && c.b0 != null && (wk().tracks[0].pages[2][6] !== c.b0 || wk().tracks[0].pages[2][7] !== c.w0); i++) { u.key("z", { cmd: true }); await sleep(700); } }
	};
	/* I-042: the LFO screen shades the steps whose locks change the LFO */
	const lfoLocksJ = {
		name: "mm-sound-lfo-locks", proves: [],
		steps: [
			go("seq"),
			{ say: "pick a track with a trig and draw a lock on LFO 1's SPD at that step", act: async (u, c) => {
				c.t = [0, 1, 2, 3, 4, 5].find(t => trigsOf(t).some(s => s < S().len)); if (c.t == null) throw new Error("no track with a trig"); c.s = trigsOf(c.t).find(s => s < S().len); c.l0 = JSON.stringify(patDoc().locks);
				u.click(rail(c.t)); await sleep(200); if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); await sleep(200); await drawLock(u, "LF1", 5, c.s, 0.8); await sleep(400); },
				machine: c => ok(lockVals(c.t, PAGES.indexOf("LF1"), 5).some(([s]) => s === c.s), "locks " + JSON.stringify(lockVals(c.t, 4, 5))), within: 15000 },
			go("sound"),
			{ say: "the LFO 1 screen shades that step", act: async (u, c) => { await sleep(300); },
				screen: c => { const cv = $1('#main canvas.ed[data-ed="lfo"][data-l="LF1"]'); if (!cv) return ok(false, "no LFO 1 screen");
					const r = cv.getBoundingClientRect(), N = Math.max(32, Math.min(64, S().len)), k = cv.width / r.width, px = s => cv.getContext("2d").getImageData(Math.round((s + .5) / N * r.width * k), 2, 1, 1).data.join();
					const other = [...Array(N).keys()].find(s => s % S().len !== c.s && Math.abs(s - c.s) > 3);
					return ok(px(c.s) !== px(other), `column of step ${c.s}: ${px(c.s)}, of step ${other}: ${px(other)}`); } }
		],
		async tidy(u, c) { if (c.l0) await undoUntil(u, () => JSON.stringify(patDoc().locks) === c.l0, 5); }
	};
	const dragM = {
		name: "mm-mix-drag-m-keys", proves: ["MM-020"],
		steps: [
			go("mix"),
			{ say: "drag across the M keys of tracks 1 to 3", act: async (u, c) => { c.m0 = synthMutes(); if ([0, 1, 2].some(synthMuted)) throw new Error("tracks 1-3 not all audible"); await u.drag(strip(0, ".ms.m"), [strip(1, ".ms.m"), strip(2, ".ms.m")], {}, { captured: false }); },
				machine: () => ok([0, 1, 2].every(synthMuted), "machine mutes " + synthMutes()), screen: () => ok([0, 1, 2].every(i => pressed(strip(i, ".ms.m"))), "M keys not lit") },
			{ say: "click M/S off on the Pattern rail", act: async u => { u.click(tab("seq")); await sleep(300); u.click("#allon"); }, machine: c => ok(same(synthMutes(), c.m0), "machine mutes " + synthMutes()) }
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
			{ say: "on Pattern's Trig setup, click the other PORT mode", act: async (u, c) => { u.click(tab("seq")); await sleep(200); u.click(rail(0)); await sleep(200); u.click('[data-dock="trig"]'); await sleep(300); c.p0 = wk().trackMasks?.portamento ?? 0; const b = $all('[data-set="port"] button').find(x => x.getAttribute("aria-pressed") !== "true"); u.click(b); },
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
			{ say: "on Pattern the rail marks track 5 ×6 and dims the others", act: u => u.click(tab("seq")),
				screen: () => ok(!!$1('#rail .th[data-sel="4"] .x6') && $all("#rail .th.poly-off").length === 5, "rail " + $all("#rail .th.poly-off").length + " dimmed") },
			{ say: "click MIDI and pick M2 on the rail: POLY stays on track 5 (a MIDI track has no voices)", act: async (u, c) => { c.n = polySent.mark(); u.click('[data-side="midi"]'); await sleep(200); u.click(rail(7)); await sleep(600); },
				screen: () => ok(S().sel === 7, "selected " + S().sel), machine: c => ok(!polySent.since(c.n).length && machine().focus === 4, `poly sent ${JSON.stringify(polySent.since(c.n))}, focus ${machine().focus}`) },
			{ say: "click Synth: the rail goes back to the POLY track, and no POLY command is sent (a side switch is no track pick)", act: async (u, c) => { c.n = polySent.mark(); u.click('[data-side="int"]'); await sleep(600); },
				screen: () => ok(S().sel === 4 && S().polyT === 4, `selected ${S().sel}, POLY track ${S().polyT}`), machine: c => ok(!polySent.since(c.n).length && machine().focus === 4, `poly sent ${JSON.stringify(polySent.since(c.n))}, focus ${machine().focus}`) },
			{ say: "back on the synth tracks, the machine's TRACK 2 is pressed (here: its command, not the page's): the page follows, track 2 is POLY's and selected", act: async u => { u.click(rail(4)); await sleep(300); Bridge.send({ op: "poly", on: true, t: 1 }); },
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
			{ say: "on Kit the Filter's KEY shows LPF off", act: async u => { u.click(tab("sound")); await sleep(400); Journey.snapshot("mm-sound-key-tracking"); },
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
				screen: () => { const m = S().multi.mode; return ok($1(".menvcard header span")?.textContent === "all tracks · " + MTM_N[m] && (m === 1 || /choose Multi trig/.test($1(".menvsay")?.textContent || "")), "card " + $1(".menvcard header span")?.textContent + " / " + $1(".menvsay")?.textContent); } },
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
	/* Review 1 (2026-10-12, B-089): the multi envelope's screen is an ADSR for every value, its dots on the curve. ATK 73
	   DEC 0 SUS 127 REL 127 (Radek's case: REL 127 is ∞) and ATK 20 DEC 50 SUS 80 REL 40 */
	const typeMenv = async (u, n, v) => { const q = `#main .pc[data-g="menv"][data-n="${n}"]`; u.click(q, { cmd: true }); await until(() => !!$1("input.vedit"), 1500); const f = $1("input.vedit"); f.value = String(v); u.key("Enter"); await sleep(200); };
	const menvDots = () => { const cv = $1('#main canvas.ed[data-ed="menv"]'), r = cv.getBoundingClientRect(); return { W: r.width, H: r.height, h: Object.fromEntries(ED.menv.handles(r.width, r.height, cv).map(x => [x.k.split(" ")[0], x])) }; };
	const menvCurve = {
		name: "mm-perform-menv-curve", proves: ["MM-160"],
		steps: [go("perform"),
			{ say: "type ATK 73, DEC 0, SUS 127, REL 127: the sustain holds at the top to the edge (REL ∞), the REL dot on it, inside the screen", act: async (u, c) => { c.e0 = JSON.stringify(wk().tracks.map(t => t.multiEnv)); for (const [n, v] of [["ATK", 73], ["DEC", 0], ["SUS", 127], ["REL", 127]]) await typeMenv(u, n, v); await sleep(300); },
				screen: () => { const { W, H, h } = menvDots(), a = h.ATK, d = h.DEC, r = h.REL; return ok(a && d && r && Math.abs(d.y - a.y) < 1 && Math.abs(r.y - d.y) < 1 && r.x > d.x && r.x <= W - 4 && r.k === "REL ∞", `ATK ${a?.x | 0},${a?.y | 0} DEC ${d?.x | 0},${d?.y | 0} REL ${r?.k} ${r?.x | 0},${r?.y | 0} in ${W | 0}x${H | 0}`); },
				machine: () => ok(wk().tracks.every(t => JSON.stringify(t.multiEnv.slice(0, 4)) === "[73,0,127,127]"), "multi env " + JSON.stringify(wk().tracks[0].multiEnv)), within: 15000 },
			{ say: "type DEC 50, SUS 80, REL 40: the dots go up to the top, down to SUS, and the REL dot at the foot, right of the sustain", act: async u => { for (const [n, v] of [["ATK", 20], ["DEC", 50], ["SUS", 80], ["REL", 40]]) await typeMenv(u, n, v); await sleep(300); },
				screen: () => { const { W, H, h } = menvDots(), a = h.ATK, d = h.DEC, r = h.REL; return ok(a && d && r && a.y < d.y && d.x > a.x && r.y > d.y && r.x > d.x + 10 && r.x <= W - 4 && r.y >= H - 14 && r.k === "REL", `ATK ${a?.x | 0},${a?.y | 0} DEC ${d?.x | 0},${d?.y | 0} REL ${r?.k} ${r?.x | 0},${r?.y | 0} in ${W | 0}x${H | 0}`); },
				machine: () => ok(wk().tracks.every(t => JSON.stringify(t.multiEnv.slice(0, 4)) === "[20,50,80,40]"), "multi env " + JSON.stringify(wk().tracks[0].multiEnv)), within: 15000 }],
		async tidy(u, c) { if (!c.e0) return; const e = JSON.parse(c.e0)[0]; for (const [i, n] of ["ATK", "DEC", "SUS", "REL"].entries()) if (wk().tracks[0].multiEnv[i] !== e[i]) await typeMenv(u, n, e[i]); }
	};
	/* Review 1 (B-090): the UNISON and SUB screens draw fine stems (2 px, as the other screens' lines), not 6 px bars:
	   the widest run of ink across the screen just above its foot */
	const inkRuns = cv => { const g = cv.getContext("2d"), y = Math.round(cv.height - 30 * (devicePixelRatio || 1)), d = g.getImageData(0, y, cv.width, 1).data; let run = 0, best = 0, n = 0; for (let x = 0; x < cv.width; x++) { const a = d[x * 4 + 3]; if (a > 200) { run++; if (run === 1) n++; best = Math.max(best, run); } else run = 0; } return { best: best / (devicePixelRatio || 1), n }; };
	const uniSubFine = {
		name: "mm-sound-unison-sub-fine", proves: [],
		steps: [go("sound"), sel(0),
			{ say: "SWAVE-SAW on track 1, UNIW 127 UNIL 100 SUB1 90 SUBX 70 SUB2 80 (every handle above the line measured, whatever the kit held): each screen's stems are at most 3 px wide", act: async (u, c) => {
				c.m0 = wk().tracks[0].machineName; c.n = 0;
				if (c.m0 !== "SWAVE-SAW") { c.n++; u.click("#machbtn"); await until(() => !$1("#machpop").hidden, 1500); u.click('#machpop .mf[data-fam="SWAVE"]'); await sleep(50); u.click('#machpop .mk[data-mach="SWAVE-SAW"]'); await until(() => wk().tracks[0].machineName === "SWAVE-SAW", 4000); await sleep(400); }
				for (const [n, v] of [["UNIW", 127], ["UNIL", 100], ["SUB1", 90], ["SUBX", 70], ["SUB2", 80]]) { const q = `#main .pc[data-g="SYN"][aria-label="${n}"]`; if (!$1(q)) continue; const v0 = $1(q + " b")?.textContent; u.click(q, { cmd: true }); await until(() => !!$1("input.vedit"), 1500); $1("input.vedit").value = String(v); u.key("Enter"); await sleep(200); if ($1(q + " b")?.textContent !== v0) c.n++; }
				await sleep(400); },
				screen: () => { const a = $1('#main canvas.ed[data-ed="uni"]'), b = $1('#main canvas.ed[data-ed="sub"]'); if (!a || !b) return ok(false, "no UNISON or SUB screen"); const ra = inkRuns(a), rb = inkRuns(b); return ok(ra.n >= 3 && rb.n >= 2 && ra.best <= 3 && rb.best <= 3, `unison ${ra.n} stems, widest ${ra.best} px; sub ${rb.n} stems, widest ${rb.best} px`); } },
			],
		async tidy(u, c) { blur(); for (let k = 0; k < (c.n || 0); k++) { u.key("z", { cmd: true }); await sleep(300); } } };
	/* Review 1 (Radek, 2026-10-12, I-023): both plates on the Machinedrum MKI light plate's greys, each its own LCD */
	const cssTok = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim().toLowerCase();
	const plateGreys = {
		name: "mm-plate-greys", proves: [],
		steps: [go("seq"), { say: "MKI and MKII: the panel greys of the MD's MKI plate (#d9dad6, #cdcec9, #e5e6e2), the roll's ground its grey (--scr #cdcec9), the top bar's LCD light blue on MKI, bluish white on MKII", act: async (u, c) => {
				c.p0 = S().plate; c.seen = {};
				for (const pl of ["mk1", "mk2"]) { if (S().plate !== pl) await platePick(u); await until(() => S().plate === pl, 1500); await sleep(150); c.seen[pl] = ["--plate", "--plate2", "--plate3", "--lcd", "--scr"].map(cssTok); const roll = $1("#seq canvas.roll"), lcd = $1(".lcdpanel"); c.seen[pl].push(roll ? getComputedStyle(roll).backgroundColor : "no roll", lcd ? getComputedStyle(lcd).backgroundColor : "no lcd"); } },
				screen: c => ok(["mk1", "mk2"].every(pl => c.seen[pl] && c.seen[pl].slice(0, 3).join() === "#d9dad6,#cdcec9,#e5e6e2" && c.seen[pl][4] === "#cdcec9" && (c.seen[pl][5] === "rgb(205, 206, 201)" || c.seen[pl][5] === "no roll")) && c.seen.mk1[3] === "#b6d2e8" && c.seen.mk2[3] === "#dfeaf1" && c.seen.mk1[6] === "rgb(182, 210, 232)" && c.seen.mk2[6] === "rgb(223, 234, 241)", JSON.stringify(c.seen)) }],
		async tidy(u, c) { if (c.p0 && S().plate !== c.p0) await platePick(u); } };
	/* Radek's review 2026-10-15: left to right the multi envelope, the joystick, the setup and the mutes; the envelope's screen
	   and the stick's pad start on one line and are as tall as each other; the assign rows sit under the pad, the ADSR faders under the screen. */
	const performLayout = {
		name: "mm-perform-layout", proves: ["MM-160"],
		steps: [
			go("perform"),
			{ say: "Perform by scope: the multi envelope (all tracks), the Track card (selector, tabs, stick, assign rows), the mutes (global), left to right; one header line; the faders under the screen, the rows under the pad; the six machine names whole",
				act: async (u, c) => { c.bad = []; u.click('[data-set="astab"] button[data-v="JOY RL"]'); await sleep(300);
					const r = q => $1(q)?.getBoundingClientRect(), cv = r(".menvplot"), pad = r("#joy"), trk = r(".trkcard"), mu = r(".mutecard"), row = r(".trkcard .asrow"), fad = r('.menvcard .pc[data-n="ATK"]');
					if (![cv, pad, trk, mu, row, fad].every(Boolean)) { c.bad.push("a part is missing"); return; }
					if (!(cv.right <= trk.left && trk.right <= mu.left)) c.bad.push("order");
					if (row.top < pad.bottom - 1 || fad.top < cv.bottom - 1) c.bad.push("controls not under their picture");
					c.heads = $all(".perf3 > .card > header").map(h => Math.round(h.getBoundingClientRect().top)); if (new Set(c.heads).size > 1) c.bad.push("header tops " + c.heads.join(","));
					const sc = [".menvcard", ".trkcard", ".mutecard"].map(q => $1(q + " > header > span:not(.seg)")?.textContent.trim()); if (!/^all tracks/.test(sc[0]) || sc[2] !== "global" || !/\S/.test(sc[1])) c.bad.push("scopes " + sc.join(" | "));
					c.bad.push(...Journey.cutText($1(".perf3")).filter(x => !/menvsay|hint/.test(x)), ...Journey.spills(".trksel small"), ...Journey.overlaps(".trkcard .asrow select", ".trkcard .asrow .pc")); },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")) },
			{ say: "the selector: T3 sets the selected track (the assign rows and the track list follow), T1 sets it back",
				act: async (u, c) => { c.r0 = $all(".trkcard .asrow select").map(x => x.value).join(); u.click('[data-set="astrk"] button[data-v="2"]'); await sleep(400); c.r3 = $all(".trkcard .asrow select").map(x => x.value).join(); c.sel3 = S().sel; c.pressed3 = pressed('[data-set="astrk"] button[data-v="2"]'); c.head3 = $1(".trkcard header span")?.textContent; },
				screen: c => ok(c.sel3 === 2 && c.pressed3 && c.head3 === ($1('[data-set="astrk"] button[data-v="2"] small')?.textContent || "").trim(), `sel ${c.sel3}, pressed ${c.pressed3}, scope "${c.head3}"`) },
			{ say: "T1 again: back", act: async u => { u.click('[data-set="astrk"] button[data-v="0"]'); await sleep(300); },
				screen: () => ok(S().sel === 0 && pressed('[data-set="astrk"] button[data-v="0"]'), "sel " + S().sel) },
			{ say: "the VEL tab: the pad's place shows what the tab means, the two rows stay under it", act: async u => { u.click('[data-set="astab"] button[data-v="VEL"]'); await sleep(300); },
				screen: () => { const p = $1(".trkcard .padinfo"); return ok(!!p && !$1("#joy") && $all(".trkcard .asrow").length === 2, "pad box " + !!p); } }
		],
		async tidy(u) { u.click('[data-set="astab"] button[data-v="JOY RL"]'); }
	};
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
		async tidy(u, c) { if (S().songMore && $1("[data-rowmore]")) u.click("[data-rowmore]"); if (c.r0) await undoUntil(u, () => JSON.stringify(songDoc()?.rows) === c.r0, 8); await back(u, c); }
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
		async tidy(u, c) { if (c.r0) await undoUntil(u, () => JSON.stringify(songDoc()?.rows) === c.r0, 6); await back(u, c); }
	};
	const openKits2 = { say: "click KIT on the LCD", act: u => u.click("#kitf"), screen: () => ok(!$1("#libpop").hidden, "closed") };
	const altPick = f => ({ say: "Alt-click a slot: selected", act: (u, c) => { c.sel = f(c); if (c.sel == null) throw new Error("no slot"); u.click(ks2(c.sel), { alt: true }); }, screen: c => ok($1(ks2(c.sel))?.getAttribute("aria-selected") === "true", "not selected") });
	const answer = async (u, c) => { if (await until(dlgShown, 3000)) { c.note = "asked: " + ($1("#dlg p")?.textContent || "").slice(0, 80); u.click($1("#dlg .danger") || $1('#dlg [data-dlg="0"]')); } };
	const otherSlot = () => I().slots("kit").reverse().find(k => k !== machine().kit.current && I().doc("kit", k) && !MmConvert.kitEmpty(I().doc("kit", k)));
	const kitSaveAs = {
		name: "mm-lib-kit-saveas", proves: ["MM-099"],
		steps: [
			openKits2, altPick(c => { c.k0 = machine().kit.current; return otherSlot(); }),
			{ say: "click Save as and answer the question", act: async (u, c) => { c.d0 = JSON.stringify(I().doc("kit", c.sel)); await keep(c, "kit", c.sel); u.click('#libpop [data-la="saveas"]'); await answer(u, c); },
				machine: c => ok(same(I().doc("kit", c.sel)?.tracks.map(t => t.machine), wk().tracks.map(t => t.machine)) && MmConvert.kitName(I().doc("kit", c.sel)) === MmConvert.kitName(wk()), `slot ${MmConvert.kitName(I().doc("kit", c.sel) || {})}, working ${MmConvert.kitName(wk() || {})}, current ${machine().kit.current}`), within: 25000 },
			{ say: "press Escape", act: u => u.key("Escape"), screen: () => ok($1("#libpop").hidden, "open") }
		],
		async tidy(u, c) { if (!$1("#libpop").hidden) u.key("Escape"); await back(u, c); }
	};
	const kitRename = {
		name: "mm-lib-kit-rename-undo", proves: ["MM-100", "MM-X22"],
		steps: [
			openKits2, altPick(c => { const k = otherSlot(); c.n0 = MmConvert.kitName(I().doc("kit", k)); return k; }),
			{ say: "click Rename, type JOURNEY, press Enter and answer", act: async (u, c) => { u.click('#libpop [data-la="rename"]'); await sleep(250); u.type("#lsin", "JOURNEY"); await sleep(100); u.key("Enter"); await answer(u, c); }, machine: c => ok(MmConvert.kitName(I().doc("kit", c.sel)).trim() === "JOURNEY", "name " + MmConvert.kitName(I().doc("kit", c.sel))), within: 25000 },
			{ ...undoKey, machine: c => ok(MmConvert.kitName(I().doc("kit", c.sel)) === c.n0, "name " + MmConvert.kitName(I().doc("kit", c.sel))), within: 25000 },
			{ say: "press Escape", act: u => u.key("Escape"), screen: () => ok($1("#libpop").hidden, "open") }
		]
	};
	const kitClear = {
		name: "mm-lib-kit-clear-undo", proves: ["MM-104", "MM-X22"],
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
		name: "mm-keys-black-keys", proves: ["MM-027", "MM-X19"],
		steps: [
			go("seq"), sel(0),
			{ say: "press W, T and P: C♯, F♯ and the next D♯ above the A key's C", act: async (u, c) => { results.length = 0; notesOn.length = 0; blur(); c.o = 12 * KB.oct; for (const k of ["w", "t", "p"]) { u.key(k); await sleep(250); } },
				screen: c => ok(same(notesOn.slice(-3), [c.o + 1, c.o + 6, c.o + 15]), "pitches sent " + notesOn.join(",") + ", want " + [c.o + 1, c.o + 6, c.o + 15]),
				machine: () => ok(results.filter(r => r.op === "noteOn" && r.ok).length >= 3, "results " + results.map(r => r.op + ":" + r.ok).join(",")) },
			{ say: "press A and S: the white keys still play C and D", act: async (u, c) => { notesOn.length = 0; for (const k of ["a", "s"]) { u.key(k); await sleep(250); } },
				screen: c => ok(same(notesOn.slice(-2), [c.o, c.o + 2]), "pitches sent " + notesOn.join(",")) }
		]
	};
	/* I-040: Z / X reach every MIDI note: X to the top (the A key plays 120, P and L stop at 127), Z to the bottom (A plays 0); the pitches sent are semitones from C3 (48), so 72, 79, 79 and -48, -46 */
	const octaveRange = {
		name: "mm-keys-octave-range", proves: ["MM-034", "MM-053"],
		steps: [
			go("seq"), sel(0),
			{ say: "press X twelve times, then A, L and P", act: async (u, c) => { results.length = 0; notesOn.length = 0; blur(); for (let i = 0; i < 12; i++) u.key("x"); await sleep(200); for (const k of ["a", "l", "p"]) { u.key(k); await sleep(250); } },
				screen: () => ok(KB.oct === 6 && same(notesOn.slice(-3), [72, 79, 79]), "octave " + KB.oct + ", pitches sent " + notesOn.join(",")) },
			{ say: "press Z sixteen times, then A and S", act: async u => { notesOn.length = 0; for (let i = 0; i < 16; i++) u.key("z"); await sleep(200); for (const k of ["a", "s"]) { u.key(k); await sleep(250); } },
				screen: () => ok(KB.oct === -4 && same(notesOn.slice(-2), [-48, -46]), "octave " + KB.oct + ", pitches sent " + notesOn.join(",")) },
			{ say: "Perform: the Octave stepper goes down to the lowest and up to the highest keyboard", act: async u => { u.click(tab("perform")); await sleep(300); for (let i = 0; i < 8; i++) u.click('[data-kboct="-1"]'); await sleep(200); },
				screen: () => ok(!!$1('.kb [data-key="0"]') && $1('[data-kboct="-1"]').disabled, "lowest key " + !!$1('.kb [data-key="0"]')) },
			{ say: "up to the top", act: async u => { for (let i = 0; i < 8; i++) u.click('[data-kboct="1"]'); await sleep(200); },
				screen: () => ok(!!$1('.kb [data-key="127"]') && !$1('.kb [data-key="128"]') && $1('[data-kboct="1"]').disabled, "highest key 127 " + !!$1('.kb [data-key="127"]')) }
		],
		async tidy(u) { KB.oct = 0; S().kbOct = 3; u.click(tab("seq")); }
	};
	/* four empty steps in a row (no note, no NOTE OFF) on track t */
	const freeRun = (t, n = 4) => { const tr = trkOf(t), busy = t < 6 ? trigsOf(t) : midiTrigsOf(t); for (let s = 0; s + n <= S().len; s++) if ([...Array(n).keys()].every(k => !tr.steps[s + k] && !busy.includes(s + k))) return [...Array(n).keys()].map(k => s + k); return null; };
	/* a drag in the roll from step a through steps b..., at the roll's middle row */
	const dragRoll = async (u, t, run, m = {}) => { const p = rollCell(t, run[0]), w = p.c.getBoundingClientRect().width;
		await u.drag(p.c, run.slice(1).map(s => [(rollCell(t, s).fx - p.fx) * w, 0]), m, { fx: p.fx, fy: p.fy }); };
	const rollPaint = {
		name: "mm-seq-roll-paint", proves: ["MM-076", "MM-172", "MM-X23"],
		steps: [
			go("seq"), { say: "pick a synth track with four empty steps in a row", act: (u, c) => { c.t = [0, 1, 2, 3, 4, 5].find(t => freeRun(t)); if (c.t == null) throw new Error("no synth track has four free steps in a row"); if (S().side === "midi") u.click('[data-side="int"]'); u.click(rail(c.t)); }, screen: c => ok(S().sel === c.t, "selected " + S().sel) },
			{ say: "press an empty roll cell and drag sideways over three more steps: four notes at that pitch", act: async (u, c) => {
				c.run = freeRun(c.t); c.n = rollCell(c.t, c.run[0]).n; c.t0 = trigsOf(c.t); await dragRoll(u, c.t, c.run); },
				screen: c => ok(c.run.every(s => same(S().tracks[c.t].steps[s]?.n, [c.n])), "roll " + c.run.map(s => JSON.stringify(S().tracks[c.t].steps[s]?.n || null)).join(",")),
				machine: c => ok(c.run.every(s => trigsOf(c.t).includes(s)), "pattern trigs " + trigsOf(c.t).join(",")), within: 15000 },
			/* I-037: no NOTE OFF is written where they were: the note before runs on */
			{ say: "Alt-press the first and drag over the others: all four erased", act: (u, c) => dragRoll(u, c.t, c.run, { alt: true }),
				screen: c => ok(c.run.every(s => !S().tracks[c.t].steps[s]), "roll " + c.run.map(s => JSON.stringify(S().tracks[c.t].steps[s] || null)).join(",")),
				machine: c => ok(c.run.every(s => !trigsOf(c.t).includes(s)), "pattern trigs " + trigsOf(c.t).join(",")), within: 15000 },
			{ say: "Cmd+Z: the erase was one undo step, all four are back", act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(c.run.every(s => trigsOf(c.t).includes(s)), "pattern trigs " + trigsOf(c.t).join(",")), within: 15000 },
			{ say: "Cmd+Z: the paint was one undo step, the track is as before", act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(same(trigsOf(c.t), c.t0), "pattern trigs " + trigsOf(c.t).join(",") + ", was " + c.t0.join(",")), within: 15000 }
		],
		async tidy(u, c) { if (c.t0 && !same(trigsOf(c.t), c.t0)) await undoUntil(u, () => same(trigsOf(c.t), c.t0)); }
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
	/* the Len key at a length (it goes round 1/16 1/8 1/4 1/2 1 bar) */
	const drawLen = async (u, L) => { for (let i = 0; i < 6 && S().rollLen !== L; i++) { u.click("#rolllen"); await sleep(80); } };
	/* the middle row's pitch, or one next to it, with no note's bar over step s (a press there would take that note) */
	const freePitch = (t, s) => { const n = rollCell(t, s).n; return [n, n + 1, n - 1, n + 2, n - 2].find(x => !underBar(t, s, x)) ?? n; };
	const clickAt = (u, t, s, n) => { const p = rollAt(t, s, n); u.click(p.c, {}, p.fx, p.fy); };
	const rollDrawLength = {
		name: "mm-roll-draw-length", proves: ["MM-076", "MM-078", "MM-175", "MM-X23"],
		steps: [
			go("seq"),
			{ say: "pick a synth track with six empty steps in a row", act: (u, c) => { c.t = [0, 1, 2, 3, 4, 5].find(t => freeRun(t, 6)); if (c.t == null) throw new Error("no synth track has six free steps in a row"); if (S().side === "midi") u.click('[data-side="int"]'); u.click(rail(c.t)); }, screen: c => ok(S().sel === c.t, "selected " + S().sel) },
			{ say: "the Len key at 1/16", act: async (u, c) => { c.l0 = S().rollLen; await drawLen(u, 1); }, screen: () => ok($1("#rolllen").textContent === "1/16", "Len " + $1("#rolllen").textContent) },
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
		async tidy(u, c) { if (c.t0 && !(same(trigsOf(c.t), c.t0) && same(offsOf(c.t), c.o0))) await undoUntil(u, () => same(trigsOf(c.t), c.t0) && same(offsOf(c.t), c.o0)); if (c.l0) setRollLen(c.l0); }
	};
	/* 0.6 review 2 (Radek: "make it simple and make it work"): the roll always draws, there is no mode. A click adds, a note's end
	   lengthens it, its body moves it (across the steps, or its pitch), with a swing mark on the note; nothing stays selected */
	/* ---------- 0.8: a note deleted leaves a gap (I-037); a click keeps the note selected, the arrows move it, a double-click deletes it (I-036) ---------- */
	/* a double-click on the roll at (s, n): the click, then the dblclick event the browser sends after the second press */
	const dblAt = async (u, t, s, n) => { const p = rollAt(t, s, n); u.click(p.c, {}, p.fx, p.fy); await sleep(80); const r = p.c.getBoundingClientRect();
		p.c.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, composed: true, view: window, detail: 2, clientX: r.left + p.fx * r.width, clientY: r.top + p.fy * r.height })); };
	const noteOf = (t, s) => S().tracks[t].steps[s]?.n?.[0];
	/* the NOTE OFFs after the first note alone (c.o1), the second drawn over its NOTE OFF and then deleted: its own NOTE OFF (run[4]) stays, the first note's (run[2]) was overwritten */
	const after1 = c => [...c.o1.filter(x => x !== c.run[2]), c.run[4]].sort((a, b) => a - b);
	const deleteGap = {
		name: "mm-roll-delete-gap", proves: [],
		steps: [
			go("seq"),
			{ say: "pick a synth track with five empty steps in a row, the Len key at 1/8, click the first: a note of two steps (a NOTE OFF two steps on)", act: async (u, c) => {
				c.t = [0, 1, 2, 3, 4, 5].find(t => freeRun(t, 5)); if (c.t == null) throw new Error("no synth track has ten free steps in a row"); if (S().side === "midi") u.click('[data-side="int"]'); u.click(rail(c.t)); await sleep(300);
				c.l0 = S().rollLen; await drawLen(u, 2); c.run = freeRun(c.t, 5); c.n = freePitch(c.t, c.run[0]); c.t0 = trigsOf(c.t); c.o0 = offsOf(c.t); if (S().stepSel) clearSel(); clickAt(u, c.t, c.run[0], c.n); },
				machine: c => ok(trigsOf(c.t).includes(c.run[0]) && offsOf(c.t).includes(c.run[2]), `trigs ${trigsOf(c.t).join(",")}, NOTE OFFs ${offsOf(c.t).join(",")}`), within: 15000 },
			{ say: "click the step where it ends: a second note of two steps, the first now runs into it", act: (u, c) => { c.o1 = offsOf(c.t); clickAt(u, c.t, c.run[2], c.n); },
				machine: c => ok(trigsOf(c.t).includes(c.run[2]) && !offsOf(c.t).includes(c.run[2]) && offsOf(c.t).includes(c.run[4]), `trigs ${trigsOf(c.t).join(",")}, NOTE OFFs ${offsOf(c.t).join(",")}`), within: 15000 },
			{ say: "double-click the second note: it is deleted: no NOTE OFF is written where it began and its own NOTE OFF stays (the first note keeps sounding, now to that NOTE OFF, as on the machine)", act: async (u, c) => { if (S().stepSel) clearSel(); await sleep(500); await dblAt(u, c.t, c.run[2], c.n); },
				screen: c => ok(!S().tracks[c.t].steps[c.run[2]] && !!S().tracks[c.t].steps[c.run[4]]?.off && !S().stepSel, `steps ${JSON.stringify(S().tracks[c.t].steps.slice(c.run[0], c.run[4] + 1))}, selection ${JSON.stringify(S().stepSel)}`),
				machine: c => ok(!trigsOf(c.t).includes(c.run[2]) && trigsOf(c.t).includes(c.run[0]) && same(offsOf(c.t), after1(c)), `trigs ${trigsOf(c.t).join(",")}, NOTE OFFs ${offsOf(c.t).join(",")} (with the first note alone: ${c.o1.join(",")}), run ${c.run.join(",")}`), within: 15000 },
			{ say: "Cmd+Z: the second note and its NOTE OFF are back, one undo step", act: u => { blur(); u.key("z", { cmd: true }); },
				machine: c => ok(trigsOf(c.t).includes(c.run[2]) && offsOf(c.t).includes(c.run[4]) && !offsOf(c.t).includes(c.run[2]), `trigs ${trigsOf(c.t).join(",")}, NOTE OFFs ${offsOf(c.t).join(",")}`), within: 15000 },
			{ say: "Alt-click the second note: the same, no NOTE OFF written or taken away", act: (u, c) => { if (S().stepSel) clearSel(); const p = rollAt(c.t, c.run[2], c.n); u.click(p.c, { alt: true }, p.fx, p.fy); },
				machine: c => ok(!trigsOf(c.t).includes(c.run[2]) && same(offsOf(c.t), after1(c)), `trigs ${trigsOf(c.t).join(",")}, NOTE OFFs ${offsOf(c.t).join(",")}`), within: 15000 },
			{ say: "double-click an empty cell: exactly one note is drawn there (the second click does not delete it), and no message says a note was deleted", act: async (u, c) => { if (S().stepSel) clearSel(); c.s2 = c.run[3]; c.n2 = c.n + 2; await dblAt(u, c.t, c.s2, c.n2); await sleep(400); },
				screen: c => ok(same(S().tracks[c.t].steps[c.s2]?.n, [c.n2]) && !/Deleted/.test($1("#toast")?.textContent || ""), `step ${JSON.stringify(S().tracks[c.t].steps[c.s2])}, toast "${$1("#toast")?.textContent}"`),
				machine: c => ok(trigsOf(c.t).includes(c.s2), `trigs ${trigsOf(c.t).join(",")}`), within: 15000 },
			{ say: "double-click that note once the moment has passed: now it is deleted", act: async (u, c) => { await sleep(500); await dblAt(u, c.t, c.s2, c.n2); },
				screen: c => ok(!S().tracks[c.t].steps[c.s2]?.n, `step ${JSON.stringify(S().tracks[c.t].steps[c.s2])}`),
				machine: c => ok(!trigsOf(c.t).includes(c.s2), `trigs ${trigsOf(c.t).join(",")}`), within: 15000 },
			{ say: "Cmd+Z until the track is as before", act: async (u, c) => { await undoUntil(u, () => same(trigsOf(c.t), c.t0) && same(offsOf(c.t), c.o0), 9); },
				machine: c => ok(same(trigsOf(c.t), c.t0) && same(offsOf(c.t), c.o0), `trigs ${trigsOf(c.t).join(",")}, NOTE OFFs ${offsOf(c.t).join(",")}`), within: 15000 }
		],
		async tidy(u, c) { if (S().stepSel) clearSel(); if (c.t0 && !(same(trigsOf(c.t), c.t0) && same(offsOf(c.t), c.o0))) await undoUntil(u, () => same(trigsOf(c.t), c.t0) && same(offsOf(c.t), c.o0)); if (c.l0) setRollLen(c.l0); }
	};
	const noteClickArrows = {
		name: "mm-note-click-arrows", proves: [],
		steps: [
			go("seq"),
			{ say: "pick a synth track with six empty steps in a row, the Len key at 1/16, click the first: a note", act: async (u, c) => {
				c.t = [0, 1, 2, 3, 4].find(t => freeRun(t, 6)); if (c.t == null) throw new Error("no synth track (1-5) has six free steps in a row"); if (S().side === "midi") u.click('[data-side="int"]'); u.click(rail(c.t)); await sleep(300);
				c.l0 = S().rollLen; await drawLen(u, 1); c.run = freeRun(c.t, 6); c.n = freePitch(c.t, c.run[0]); c.t0 = trigsOf(c.t); c.o0 = offsOf(c.t); if (S().stepSel) clearSel(); clickAt(u, c.t, c.run[0], c.n); },
				machine: c => ok(trigsOf(c.t).includes(c.run[0]), `trigs ${trigsOf(c.t).join(",")}`), within: 15000 },
			{ say: "click the note: it is selected, and stays selected after the release (no Cmd needed)", act: async (u, c) => { clickAt(u, c.t, c.run[0], c.n); await sleep(300); },
				screen: c => ok(S().stepSel?.t === c.t && S().stepSel?.n === 1 && S().stepSel?.from === c.run[0] && trigsOf(c.t).includes(c.run[0]), "selection " + JSON.stringify(S().stepSel)) },
			{ say: "press the up arrow: the note is a semitone higher, still selected", act: async (u, c) => { blur(); u.key("ArrowUp"); await sleep(300); },
				screen: c => ok(noteOf(c.t, c.run[0]) === c.n + 1 && S().stepSel?.from === c.run[0] && S().sel === c.t, `note ${noteOf(c.t, c.run[0])}, selection ${JSON.stringify(S().stepSel)}, track ${S().sel}`),
				machine: c => ok(trigsOf(c.t).includes(c.run[0]) && JSON.stringify(patDoc().tracks[c.t].notes).includes(String(c.n + 1)), "notes " + JSON.stringify(patDoc().tracks[c.t].notes)), within: 15000 },
			{ say: "press the down arrow twice (the key released between): a semitone below where it began", act: async (u, c) => { blur(); u.key("ArrowDown"); await sleep(300); u.key("ArrowDown"); await sleep(300); },
				screen: c => ok(noteOf(c.t, c.run[0]) === c.n - 1, `note ${noteOf(c.t, c.run[0])}`), within: 8000 },
			{ say: "press Shift and the up arrow: an octave higher", act: async u => { blur(); u.key("ArrowUp", { shift: true }); await sleep(300); },
				screen: c => ok(noteOf(c.t, c.run[0]) === c.n + 11 && S().sel === c.t, `note ${noteOf(c.t, c.run[0])}`), within: 8000 },
			{ say: "Cmd+Z once: back one press only (an octave down), not all of them", act: async (u, c) => { await sleep(300); blur(); u.key("z", { cmd: true }); },
				screen: c => ok(noteOf(c.t, c.run[0]) === c.n - 1, `note ${noteOf(c.t, c.run[0])}, began at ${c.n}`), within: 8000 },
			{ say: "Cmd-click an empty step (a selection with no note), press the down arrow: the selection goes to the next track, as before", act: async (u, c) => { if (S().stepSel) clearSel(); const p = rollAt(c.t, c.run[3], c.n); u.click(p.c, { cmd: true }, p.fx, p.fy); await sleep(150); blur(); u.key("ArrowDown"); },
				screen: c => ok(S().sel === c.t + 1 && S().stepSel?.t === c.t + 1 && noteOf(c.t, c.run[0]) === c.n - 1, `track ${S().sel}, selection ${JSON.stringify(S().stepSel)}, note ${noteOf(c.t, c.run[0])}`), within: 8000 },
			{ say: "pick the track again, click the note and press Delete: it is gone", act: async (u, c) => { if (S().stepSel) clearSel(); u.click(rail(c.t)); await sleep(300); clickAt(u, c.t, c.run[0], noteOf(c.t, c.run[0])); await sleep(150); blur(); u.key("Delete"); },
				machine: c => ok(!trigsOf(c.t).includes(c.run[0]), `trigs ${trigsOf(c.t).join(",")}`), screen: c => ok(!S().tracks[c.t].steps[c.run[0]], "still on the roll"), within: 15000 },
			{ say: "Cmd+Z until the track is as before", act: async (u, c) => { await undoUntil(u, () => same(trigsOf(c.t), c.t0) && same(offsOf(c.t), c.o0), 8); },
				machine: c => ok(same(trigsOf(c.t), c.t0) && same(offsOf(c.t), c.o0), `trigs ${trigsOf(c.t).join(",")}, NOTE OFFs ${offsOf(c.t).join(",")}`), within: 15000 }
		],
		async tidy(u, c) { if (S().stepSel) clearSel(); if (c.t0 && !(same(trigsOf(c.t), c.t0) && same(offsOf(c.t), c.o0))) await undoUntil(u, () => same(trigsOf(c.t), c.t0) && same(offsOf(c.t), c.o0), 8); if (c.l0) setRollLen(c.l0); }
	};
	const rollSimple = {
		name: "mm-roll-simple", proves: ["MM-X23", "MM-076", "MM-078"],
		steps: [
			go("seq"),
			{ say: "no Draw key on the page; pick a synth track with eight empty steps in a row, the Len key at 1/16, click the first: a note", act: async (u, c) => {
				if ($1("#rolldraw")) throw new Error("a Draw key is still on the page");
				c.t = [0, 1, 2, 3, 4, 5].find(t => freeRun(t, 8)); if (c.t == null) throw new Error("no synth track has eight free steps in a row"); if (S().side === "midi") u.click('[data-side="int"]'); u.click(rail(c.t)); await sleep(300);
				c.l0 = S().rollLen; await drawLen(u, 1); c.run = freeRun(c.t, 8); c.n = freePitch(c.t, c.run[0]); c.t0 = trigsOf(c.t); c.o0 = offsOf(c.t); if (S().stepSel) clearSel(); clickAt(u, c.t, c.run[0], c.n); },
				machine: c => ok(trigsOf(c.t).includes(c.run[0]) && offsOf(c.t).includes(c.run[1]), `pattern trigs ${trigsOf(c.t).join(",")}, NOTE OFFs ${offsOf(c.t).join(",")}`), within: 15000 },
			{ say: "the note carries a swing mark (a mark must not take a press)", act: (u, c) => { S().tracks[c.t].swing.add(c.run[0]); redraw(); }, screen: c => ok(S().tracks[c.t].swing.has(c.run[0]), "no swing") },
			{ say: "drag the note's end two steps right: it lasts three steps", act: (u, c) => dragAt(u, c.t, [c.run[0], c.n], [c.run[2], c.n, 5], {}, true),
				screen: c => ok(!S().tracks[c.t].steps[c.run[1]] && !!S().tracks[c.t].steps[c.run[3]]?.off, "roll " + JSON.stringify(S().tracks[c.t].steps.slice(c.run[0], c.run[0] + 4))),
				machine: c => ok(offsOf(c.t).includes(c.run[3]), `NOTE OFFs ${offsOf(c.t).join(",")}`), within: 15000 },
			{ say: "drag the note's body four steps right: it moves with its length, and stays selected where it landed (I-036)", act: (u, c) => dragAt(u, c.t, [c.run[0], c.n], [c.run[4], c.n]),
				screen: c => ok(!!S().tracks[c.t].steps[c.run[4]]?.n && !S().tracks[c.t].steps[c.run[0]]?.n && S().stepSel?.t === c.t && S().stepSel?.from === c.run[4], "roll " + JSON.stringify(S().tracks[c.t].steps.slice(c.run[0], c.run[0] + 8)) + ", selection " + JSON.stringify(S().stepSel)),
				machine: c => ok(trigsOf(c.t).includes(c.run[4]) && !trigsOf(c.t).includes(c.run[0]) && offsOf(c.t).includes(c.run[7]), `pattern trigs ${trigsOf(c.t).join(",")}, NOTE OFFs ${offsOf(c.t).join(",")}`), within: 15000 },
			{ say: "drag the note up one row: its pitch is one higher", act: (u, c) => dragAt(u, c.t, [c.run[4], c.n], [c.run[4], c.n + 1]),
				screen: c => ok(same(S().tracks[c.t].steps[c.run[4]]?.n, [c.n + 1]) && S().stepSel?.from === c.run[4], "notes " + JSON.stringify(S().tracks[c.t].steps[c.run[4]]?.n)), within: 15000 },
			{ say: "Cmd+Z until the track is as before", act: async (u, c) => { S().tracks[c.t].swing.delete(c.run[0]); await undoUntil(u, () => same(trigsOf(c.t), c.t0) && same(offsOf(c.t), c.o0), 5); },
				machine: c => ok(same(trigsOf(c.t), c.t0) && same(offsOf(c.t), c.o0), `pattern trigs ${trigsOf(c.t).join(",")}, NOTE OFFs ${offsOf(c.t).join(",")}`), within: 15000 }
		],
		async tidy(u, c) { if (S().stepSel) clearSel(); if (c.t != null && c.run) S().tracks[c.t].swing.delete(c.run[0]); if (c.t0 && !(same(trigsOf(c.t), c.t0) && same(offsOf(c.t), c.o0))) await undoUntil(u, () => same(trigsOf(c.t), c.t0) && same(offsOf(c.t), c.o0)); if (c.l0) setRollLen(c.l0); }
	};
	const rollMidiLen = {
		name: "mm-roll-midi-len", proves: ["MM-243", "MM-X23"],
		steps: [
			go("seq"),
			{ say: "click MIDI and pick a MIDI track with six empty steps in a row", act: async (u, c) => { if (S().side !== "midi") u.click('[data-side="midi"]'); await sleep(300); c.t = [6, 7, 8, 9, 10, 11].find(t => freeRun(t, 6)); if (c.t == null) throw new Error("no MIDI track has six free steps in a row"); u.click(rail(c.t)); },
				screen: c => ok(S().sel === c.t, "selected " + S().sel) },
			{ say: "Draw on at 1/16, click the run's first cell: a MIDI note 6 ticks long (LEN 6)", act: async (u, c) => {
				c.l0 = S().rollLen; await drawLen(u, 1); c.run = freeRun(c.t, 6); c.n = freePitch(c.t, c.run[0]); c.t0 = midiTrigsOf(c.t); c.kit = S().midi[c.t - 6].v.MID[0]; if (S().stepSel) clearSel(); clickAt(u, c.t, c.run[0], c.n); },
				machine: c => ok(midiTrigsOf(c.t).includes(c.run[0]) && (lenLock(c.t, c.run[0]) ?? c.kit) === 6, `MIDI trigs ${midiTrigsOf(c.t).join(",")}, LEN ${lenLock(c.t, c.run[0]) ?? "kit " + c.kit}`), within: 15000 },
			{ say: "drag its end over two more steps: LEN 18 (three steps)", act: (u, c) => dragAt(u, c.t, [c.run[0], c.n], [c.run[2], c.n, 5], {}, true),
				screen: c => ok(S().locks.get(c.t + "|MID.0")?.get(c.run[0]) === 18, "LEN lock " + S().locks.get(c.t + "|MID.0")?.get(c.run[0])),
				machine: c => ok(lenLock(c.t, c.run[0]) === 18, "LEN " + lenLock(c.t, c.run[0])), within: 15000 },
			{ say: "Cmd+Z twice: the track as before", act: async (u, c) => { await undoUntil(u, () => same(midiTrigsOf(c.t), c.t0), 3); },
				machine: c => ok(same(midiTrigsOf(c.t), c.t0), "MIDI trigs " + midiTrigsOf(c.t).join(",")), within: 15000 }
		],
		async tidy(u, c) { if (c.t0 && !same(midiTrigsOf(c.t), c.t0)) await undoUntil(u, () => same(midiTrigsOf(c.t), c.t0)); if (c.l0) setRollLen(c.l0); if (S().side === "midi") $1('[data-side="int"]')?.click(); }
	};
	/* K7 (DESIGN-step-selection.md §7, the Machinedrum's md-seq-select-copy-paste): one note copied to another step of
	   its track (the LCD's PASTE on the selection), then a block of two tracks duplicated and cleared with the LCD's CLR */
	const inPat = s => s < S().len;
	const selCells = () => $all("#seq .ruler .rul.selx").map(e => +e.dataset.s);
	const selectCopyPaste = {
		name: "mm-seq-select-copy-paste", proves: ["MM-183", "MM-X10"],
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
		name: "mm-seq-step-menu", proves: ["MM-183", "MM-233", "MM-X09"],
		steps: [
			go("seq"), sel(0), { say: "click an empty roll cell: a note to work on", act: async (u, c) => {
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
		async tidy(u, c) { if (!$1("#deskmenu")?.hidden) closeDeskMenu(); if (S().stepSel) clearSel(); if (c.t0 && !same(trigsOf(c.t), c.t0)) await undoUntil(u, () => same(trigsOf(c.t), c.t0)); }
	};
	/* the Machinedrum's md-seq-copy-paste-buttons: one note copied and pasted with the top bar's Copy, Paste and Clr */
	const buttonsCopyPaste = {
		name: "mm-seq-copy-paste-buttons", proves: ["MM-044", "MM-183", "MM-X10"],
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
		name: "mm-drop-syx", proves: ["MM-X12"],
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
		name: "mm-lib-syx-import", alone: true, proves: ["MM-308", "MM-309", "MM-X13"],
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
		name: "mm-lib-syx-export-kinds", proves: ["MM-307", "MM-010", "MM-X13"],
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
		name: "mm-lib-syx-verify", proves: ["MM-308", "MM-X13"],
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
	/* I-038: Read back and compare, off. The tick sits beside Verify only and is kept; an import without it ends after Send and
	   says "not read back", never "imported". The tick is put back on at the end (it is kept in the page's storage). */
	const syxNoReadBack = {
		name: "mm-lib-syx-noreadback", alone: true, proves: ["MM-308", "MM-X13"],
		needs: syxWanted,
		steps: [
			openImport,
			{ say: "the footer has Read back and compare beside Verify only, ticked by default", act: () => {},
				screen: () => ok(!!$1('#syxpop .syxfoot [data-syxrb]')?.checked && !!$1('#syxpop .syxfoot [data-syxgo="verify"]') && /Read back and compare/.test($1("#syxpop .syxfoot .syxrb")?.textContent || ""), "tick " + $1('#syxpop [data-syxrb]')?.checked) },
			{ say: "untick it, click Cancel and open the import again: it stays unticked", act: async u => {
				u.click('#syxpop [data-syxrb]'); await sleep(100); u.click('#syxpop [data-syxgo="close"]'); await sleep(300); u.pick("engsel", "import"); },
				screen: () => ok(!$1("#syxpop").hidden && $all('#syxpop button[data-syxitem^="kit:"]').length > 0 && $1('#syxpop [data-syxrb]') && !$1('#syxpop [data-syxrb]').checked, "tick " + $1('#syxpop [data-syxrb]')?.checked), within: 8000 },
			{ say: "leave Kits ticked only, click Import: sent, and the report says not read back", act: async u => {
				for (const b of $all("#syxpop [data-syxkind]")) if (b.checked !== (b.dataset.syxkind === "kit")) u.click(b);
				await sleep(100); u.click('#syxpop [data-syxgo="start"]'); },
				screen: () => { const s = $1("#syxpop .syxsum")?.textContent || "", steps = $1("#syxpop .syxsteps")?.textContent || "";
					return ok(/\d+ sent, not read back/.test(s) && !/imported|taken/.test(s) && !/Read back/.test(steps), "summary: " + s + " / steps: " + steps); }, within: 180000 },
			{ say: "the grid marks the kits as sent, none as taken", act: () => {},
				screen: () => { const o = $all("#syxpop [data-syxout]").map(d => d.dataset.syxout); return ok(o.every(x => x === "sent"), o.join(" ")); } },
			{ say: "click Done, open the import again and tick Read back and compare again", act: async u => {
				u.click('#syxpop [data-syxgo="close"]'); await sleep(300); u.pick("engsel", "import"); await until(() => !!$1('#syxpop [data-syxrb]'), 8000); u.click('#syxpop [data-syxrb]'); },
				screen: () => ok(!!$1('#syxpop [data-syxrb]')?.checked, "tick " + $1('#syxpop [data-syxrb]')?.checked), within: 10000 },
			{ say: "click Cancel: the panel closes", act: u => u.click('#syxpop [data-syxgo="close"]'), screen: () => ok($1("#syxpop").hidden, "still open") }
		],
		async tidy(u) {
			const t = $1('#syxpop [data-syxrb]');
			if (!$1("#syxpop").hidden && t && !t.checked) t.click();
			if (!$1("#syxpop").hidden) $1("#syxpop").hidden = true;
			try { localStorage.removeItem("deskSyx.readBack"); } catch (_) { }
		}
	};
	const syxPlace = {
		name: "mm-lib-syx-place", proves: ["MM-308", "MM-X13"],
		needs: syxWanted,
		steps: [
			openImport,
			{ say: "click Specific place, then the first slot four times: the kits land in K05 and K06", act: async u => { u.click('#syxpop [data-sxp="specific"]'); await sleep(150); for (let i = 0; i < 4; i++) { u.click(syxValue("kit", "place")); await sleep(60); } },
				/* B-146: the grid of the last place's preview, the panel no longer placing (an earlier preview, K04 on the way, passed this check
				   once and the last one then reset the panel) */
				screen: () => { const go = $1('#syxpop [data-syxgo="start"]')?.textContent || "";
					return ok($1(syxValue("kit", "place"))?.textContent === "K05" && !!$1(syxCell("kit:4")) && !!$1(syxCell("kit:5")) && !$1(syxCell("kit:3")) && !$1(syxCell("kit:0")) && !/Placing/.test(go),
						"cells " + $all('#syxpop button[data-syxitem^="kit:"]').map(b => b.dataset.syxitem).join(" ") + ", " + go); }, within: 8000 },
			{ say: "leave Kits ticked only, click Import: it asks first (the file's kits land on K05 and on, which hold kits)", act: async (u, c) => { await syxKinds(["kit"])(u); c.names = $all('#syxpop button[data-syxitem^="kit:"]').map(b => [+b.dataset.syxitem.split(":")[1], (b.dataset.syxname || "").trim()]); c.k0 = kitName(0);
					/* an import has no undo: the kits it overwrites are kept first (keepMany) and back() in the tidy puts them back */
					await keepMany(c, "kit", c.names.map(([k]) => k)); u.click('#syxpop [data-syxgo="start"]'); },
				screen: c => ok(dlgShown() && /K05/.test($1("#dlg").textContent) && !!dlgButton(`Import ${c.names.length}`), `no question for ${c.names.length} kits: ` + ($1("#dlg").textContent || "").slice(0, 80)) },
			{ say: "click Import n: sent on SYSEX RECV to K05 and on, read back, reported", act: (u, c) => u.click(dlgButton(`Import ${c.names.length}`)),
				screen: c => ok(new RegExp(`${c.names.length} imported`).test($1("#syxpop .syxsum")?.textContent || ""), "progress: " + ($1("#syxpop .syxsum, #syxpop .syxbar span")?.textContent || "")),
				machine: c => ok(c.names.every(([k, n]) => (kitName(k) || "").trim() === n) && kitName(0) === c.k0, c.names.map(([k, n]) => `K${k + 1} "${kitName(k)}" want "${n}"`).join(", ") + `; K01 "${kitName(0)}"`), within: 90000 },
			{ say: "click Done: the panel closes", act: u => u.click('#syxpop [data-syxgo="close"]'), screen: () => ok($1("#syxpop").hidden, "still open") }
		],
		async tidy(u, c) { if (dlgShown()) dlgButton("Cancel")?.click(); $1("#syxpop").hidden = true; await back(u, c); }
	};
	/* Reset machine… > Empty reset: the Monomachine has no factory reset in the editor; two questions, then every kit,
	   pattern and song cleared on SYSEX RECV and read back. It empties the machine: the last journey of all */
	const resetEmpty = {
		name: "mm-engine-reset-empty", alone: true, proves: ["MM-317"],
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
		name: "mm-lib-syx-import-mute", alone: true, proves: ["MM-308", "MM-309", "MM-020"],
		needs: () => new URLSearchParams(location.search).get("syxfile") ? null : "no .syx for the run (GEARMULATOR_MDMM_SYX_FILE)",
		steps: [
			{ say: "choose IMPORT SYSEX… in the engine menu, tick Globals too", act: async u => { await u.pick("engsel", "import"); await until(() => !$1("#syxpop").hidden && $all("#syxpop [data-syxkind]").length, 8000); const g = $1('#syxpop [data-syxkind="global"]'); if (g && !g.checked) u.click(g); },
				screen: () => ok(!$1("#syxpop").hidden && !!$1('#syxpop [data-syxkind="global"]')?.checked, "no Globals in the preview"), within: 8000 },
			{ say: "click Import: sent on SYSEX RECV, read back, reported", act: u => u.click('#syxpop [data-syxgo="start"]'), screen: () => ok(/imported/.test($1("#syxpop .syxsum")?.textContent || ""), "progress: " + ($1("#syxpop .syxbar span")?.textContent || "")), within: 3000 },
			{ say: "click Done, Escape, then the Pattern tab", act: async u => { u.click('#syxpop [data-syxgo="close"]'); await sleep(300); u.key("Escape"); await sleep(300); u.click(tab("seq")); if (S().side === "midi") u.click('[data-side="int"]'); },
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
		name: "mm-seq-os-copy-paste", proves: ["MM-044", "MM-183", "MM-X10"], needs: Journey.osKeyPath,
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
		name: "mm-keys-tap-tempo-shift", proves: ["MM-023", "MM-197", "MM-X20"],
		steps: [
			go("seq"),
			{ say: "on Pattern tap Shift+B five times, about 0.5 s apart: the tempo follows", act: async (u, c) => { c.b0 = machine().tempo; blur(); if (typeof TAP !== "undefined" && TAP.length) await sleep(2100); /* a new run of taps (the page joins taps less than 2 s apart) */ const at = []; for (let i = 0; i < 5; i++) { at.push(performance.now()); u.key("B", { shift: true }); await sleep(500); } c.want = Math.round(60000 / ((at[4] - at[0]) / 4) * 10) / 10; c.note = c.want + " BPM"; },
				screen: c => ok(Math.abs(S().bpm - c.want) <= tapSlack(c.want), "BPM " + S().bpm + ", want " + c.want), machine: c => ok(Math.abs(machine().tempo - c.want) <= tapSlack(c.want), "tempo " + machine().tempo + ", want " + c.want), within: 8000 }
		],
		async tidy(u, c) { if (c.b0 != null) { const d = c.b0 > machine().tempo ? -1 : 1; await u.drag("#bpm", [[0, d * 2 * (c.b0 - machine().tempo)]]); } }
	};
	/* the SysEx import panel as screenshots for a design review (scripts/mdmm-shots.sh with MDMM_SHOTS_JOURNEY=mm-shots-import
	   and GEARMULATOR_MDMM_SYX_FILE): the preview's tabs, then the default kinds imported (importing, the report).
	   Each step logs "SHOT <name>" and holds while the script captures the window. */
	const shot = name => Bridge.log("SHOT " + name), hold = 2500;
	const shotsImport = { name: "mm-shots-import", alone: true, proves: [], needs: () => !/mm-shots/.test(location.search) ? "screenshots only when asked by name" : syxImportJ.needs(),
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
			{ say: "click GLOBAL: a modal over a dimmed backdrop (review 1, B-091), the head on one line, focus inside", act: u => u.click("#globkey"),
				screen: () => { const p = $1("#globpop").getBoundingClientRect(), hd = $1("#globpop .gphead").getBoundingClientRect(), bg = $1("#modalbg");
					const pop = $1("#globpop"), wide = pop.scrollWidth > pop.clientWidth + 1; return ok(!wide && !$1("#globpop").hidden && Modal.top() === "globpop" && !!bg && !bg.hidden && Math.abs(p.left + p.width / 2 - innerWidth / 2) < 3 && hd.height < 48 && $1("#globpop").contains(document.activeElement) && !!$1('#globpop [data-ga="copy"]') && !!$1('#globpop [data-ga="tune"]') && $all('#globpop [data-ga="out1"]').length === 9,
						`${wide ? "its cards wider than the dialog (" + pop.scrollWidth + " > " + pop.clientWidth + "), " : ""}open ${!$1("#globpop").hidden}, top ${Modal.top()}, backdrop ${bg && !bg.hidden}, centre ${Math.round(p.left + p.width / 2)}/${Math.round(innerWidth / 2)}, head ${Math.round(hd.height)} px, focus ${document.activeElement?.tagName}`); } },
			{ say: "click its back key: GLOBAL closes, the workspace under it shows", act: u => u.click('#globpop [data-ga="close"]'), screen: () => ok($1("#globpop").hidden && !pressed("#globkey"), "still open") }
		],
		async tidy(u) { if (!$1("#globpop").hidden) u.key("Escape"); u.click(tab("seq")); await sleep(200); }
	};
	/* Review 1 (B-091, B-094): GLOBAL is a modal; a press outside it keeps it open and reaches nothing below (the rail: no
	   track picked); Esc closes it */
	const globalClickOut = {
		name: "mm-global-click-out", proves: [],
		steps: [
			go("seq"), sel(0),
			{ say: "open GLOBAL, then press beside it (its press, release and click)", act: async (u, c) => {
				c.p0 = trigsOf(0).join(","); c.u0 = machine().history?.undoCount || 0;
				u.click("#globkey"); await sleep(300); c.under = Journey.pressOutside(); await sleep(300);
			}, screen: c => ok(!$1("#globpop").hidden && Modal.top() === "globpop" && S().sel === 0, "GLOBAL " + ($1("#globpop").hidden ? "closed" : "open") + ", track " + (S().sel + 1) + " selected, pressed on " + c.under),
				machine: c => ok(trigsOf(0).join(",") === c.p0 && (machine().history?.undoCount || 0) === c.u0, `pattern ${trigsOf(0).join(",")} (was ${c.p0}), undo steps ${c.u0} -> ${machine().history?.undoCount || 0}`) },
			{ say: "press Escape: GLOBAL closes", act: u => u.key("Escape"), screen: () => ok($1("#globpop").hidden && !pressed("#globkey"), "still open") }
		],
		async tidy(u) { if (!$1("#globpop").hidden) u.key("Escape"); }
	};
	/* Review 1 (B-097): the lock parameter keys of each page of track 1 fit (the count beside the name) */
	const lockKeysFit = Journey.lockKeysJourney("mm-lock-keys-fit", [go("seq"), sel(0),
		{ say: "each page of the lock panel: its keys", act: async (u, c) => { c.bad = []; for (const pg of $all("[data-lpage]").map(b => b.dataset.lpage)) { u.click(`[data-lpage="${pg}"]`); await sleep(150); const x = Journey.lockKeysCut(); if (x) c.bad.push(`${pg}: ${x}`); } },
			screen: c => ok(!c.bad.length, c.bad.join(" | ")) }]);
	/* Review 1 (Radek, 2026-10-12, B-094): every modal locks: a click outside keeps each kind open, Esc closes it */
	const modalLock = Journey.modalLockJourney("mm-modal-lock", [
		{ name: "GLOBAL", sel: "#globpop", open: u => u.click("#globkey") },
		{ name: "the kit library", sel: "#libpop", open: u => u.click("#kitf") },
		{ name: "the keys", sel: "#keyspop", open: u => { blur(); u.key("?", { shift: true }); } },
		{ name: "AUDIO / MIDI", sel: "#audiopop", open: u => { blur(); u.key(","); } },
		{ name: "Export SysEx", sel: "#syxpop", open: u => u.pick("engsel", "export") },
		{ name: "the machine picker", sel: "#machpop", open: async u => { u.click(tab("sound")); await sleep(300); u.click("#machbtn"); } },
		{ name: "a question (Reset machine…)", sel: "#dlg", open: u => u.pick("engsel", "reset") }
	]);
	/* Review 1 (B-094, B-095): an import at work stays in reach and keeps one size: a click outside and Esc keep its
	   panel; Hide hides it, the engine menu's IMPORT SYSEX… shows it again (not a new file), then Done. The panel's box is
	   the same at the preview, while it runs and at the report; Stop and Hide inside it. It writes the file's kits: last in
	   the list */
	const syxRunningReach = {
		name: "mm-syx-running-reach", proves: [], needs: () => syxWanted(),
		steps: [
			openImport,
			{ say: "click Import; while it runs press Escape and click outside: the panel stays, one size, Stop and Hide inside it", act: async (u, c) => {
				c.box = [Journey.boxOf("#syxpop")];
				/* an import has no undo: the kits, patterns and songs it overwrites are kept first and back() in the tidy puts them back */
				await keepImportTargets(c);
				/* B-102: wholly inside the window (at 1440 x 923 its foot ran past the bottom) */
				{ const r = $1("#syxpop").getBoundingClientRect(); c.inWindow = r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight + 0.5 && r.right <= innerWidth + 0.5; c.win = `${innerWidth}x${innerHeight}`; }
				u.click('#syxpop [data-syxgo="start"]'); c.ran = await until(() => $1("#syxpop").classList.contains("syx-running"), 3000);
				c.box.push(Journey.boxOf("#syxpop")); c.keys = Journey.keysInside("#syxpop", '#syxpop .syxfoot button');
				/* at once (the page tier's import can be over in a few hundred ms): Esc while it still runs */
				c.runningAtEsc = $1("#syxpop").classList.contains("syx-running") && !!$1("#syxpop").dataset.busy; u.key("Escape"); c.afterEsc = !$1("#syxpop").hidden;
				c.under = Journey.pressOutside(); await sleep(200); c.afterClick = !$1("#syxpop").hidden; c.box.push(Journey.boxOf("#syxpop"));
				Bridge.log(`JOURNEY ${"mm"}-syx-running-reach: Esc ${c.runningAtEsc ? "while it ran" : "after it ended"}`); },
				screen: c => ok(c.ran && (!c.runningAtEsc || c.afterEsc) && c.afterClick && Modal.top() === "syxpop" && new Set(c.box).size === 1 && c.keys === "" && c.inWindow, `in the window ${c.win}: ${c.inWindow}, ran ${c.ran}, Esc while running ${c.runningAtEsc} -> open ${c.afterEsc}, after the click open ${c.afterClick} (on ${c.under}), boxes ${c.box.join(" | ")}, keys out ${c.keys}`) },
			{ say: "click Hide (if it still runs), then IMPORT SYSEX… in the engine menu: the same panel again", act: async (u, c) => {
				c.hid = false; const h = $1('#syxpop .btnrow [data-syxgo="close"]'); if ($1("#syxpop").classList.contains("syx-running") && h) { u.click(h); await sleep(200); c.hid = $1("#syxpop").hidden; }
				if ($1("#syxpop").hidden) await u.pick("engsel", "import"); /* still running: it is modal, the engine menu is under it */ await sleep(400); },
				screen: c => ok(!$1("#syxpop").hidden && ($1("#syxpop").classList.contains("syx-running") || $1("#syxpop").classList.contains("syx-report")), `hidden by Hide ${c.hid}; panel ${$1("#syxpop").hidden ? "hidden" : $1("#syxpop").className}`) },
			{ say: "wait for the report: the same size; click Done", act: async (u, c) => { await until(() => $1("#syxpop").classList.contains("syx-report"), 120000); c.box.push(Journey.boxOf("#syxpop")); u.click('#syxpop [data-syxgo="close"]'); },
				screen: c => ok($1("#syxpop").hidden && new Set(c.box).size === 1, "open " + !$1("#syxpop").hidden + ", boxes " + c.box.join(" | ")), within: 130000 }
		],
		async tidy(u, c) { if (!$1("#syxpop").hidden && !$1("#syxpop").dataset.busy) u.key("Escape"); await back(u, c); }
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
	/* B-056, now the GEN dialog: the same size and the same place for R, Defaults and Done in Euclid, Random and Keep (the switch): a MEASURE line each */
	const textFloor = () => { const x = document.createElement("span"); x.style.fontSize = "9px"; document.body.appendChild(x); const v = parseFloat(getComputedStyle(x).fontSize); x.remove(); return v.toFixed(2); };
	const genBarFits = (label, snap = false) => ({ say: `the GEN dialog on ${label}: Euclid, Random and Keep are one size, R and Done stay where they are`, act: async (u, c) => {
		c.boxes = []; await genAt(u, S().sel); if ($1("#genpop [data-genkeep]").checked) { u.click("#genpop [data-genkeep]"); await sleep(250); }
		for (const kind of ["random", "euclid", "keep"]) {
			u.click(kind === "keep" ? "#genpop [data-genkeep]" : `#genpop [data-genkind="${kind}"]`); await sleep(350);
			const p = $1("#genpop").getBoundingClientRect(), r = $1("#genpop [data-rand]").getBoundingClientRect(), d = $1("#genpop [data-genclose]").getBoundingClientRect();
			c.boxes.push([kind, ...[p.left, p.top, p.width, p.height, r.left, r.top, d.left, d.top].map(Math.round)].join(" "));
			Bridge.log(`MEASURE gen-mm ${label} ${kind} dialog ${Math.round(p.width)} x ${Math.round(p.height)} text floor ${textFloor()} at ${innerWidth} x ${innerHeight}`);
			if (snap) { await sleep(400); Journey.snapshot(kind === "euclid" ? "gen-mm" : "gen-mm-" + kind); } }
		c.bad = [...Journey.cutText($1("#genpop")), ...Journey.spills("#genpop .gdsum")]; const q = $1("#genpop").getBoundingClientRect(), rr = $1("#rail").getBoundingClientRect(); if (q.width > 480 || q.left < rr.right || Math.abs(q.top + q.height / 2 - innerHeight / 2) > 2) c.bad.push(`dialog ${Math.round(q.left)},${Math.round(q.top)} ${Math.round(q.width)}x${Math.round(q.height)} is not small and centred over the grid`);
		if ($1("#genpop [data-genkeep]").checked) u.click("#genpop [data-genkeep]"); u.click("#genpop [data-gencancel]"); await sleep(300); },
		screen: c => ok(!c.bad.length && new Set(c.boxes.map(x => x.split(" ").slice(1).join(" "))).size === 1, c.bad.join(" | ") + " " + c.boxes.join(" / ")) });
	const genBarFit = { name: "mm-gen-bar-fit", proves: [],
		steps: [go("seq"), sel(0), genBarFits("track 1"),
			{ say: "click MIDI: a MIDI track", act: u => u.click('[data-side="midi"]'), screen: () => ok(S().side === "midi" && S().sel >= 6, `side ${S().side}, track ${S().sel}`) },
			genBarFits("a MIDI track"),
			{ say: "click SYNTH: back", act: u => u.click('[data-side="int"]'), screen: () => ok(S().side !== "midi" && S().sel < 6, `side ${S().side}`) }],
		async tidy(u, c) { await back(u, c); } };
	/* 0.5 slice 5: the Sound page and the GEN bar as screenshots, beside the Machinedrum Editor's (md-shots-sound) */
	const shotsSound = { name: "mm-shots-sound", proves: [], needs: () => !/mm-shots/.test(location.search) ? "screenshots only when asked by name" : null,
		steps: [go("sound"), sel(0),
			{ say: "the Kit page", act: async () => { await sleep(800); shot("sound-mm"); Journey.snapshot("sound-mm"); Bridge.log("MEASURE sound-mm screens " + [...document.querySelectorAll(".snd .sg>.plot")].map(e => Math.round(e.getBoundingClientRect().height)).join(" ") + " page " + Math.round(document.querySelector(".snd").scrollHeight) + "/" + Math.round(document.querySelector("#main").clientHeight)); }, hold },
			go("seq"), genBarFits("track 1", true),
			{ say: "the GEN bar", act: async () => { await sleep(400); shot("gen-mm"); }, hold },
			{ say: "done", act: () => shot("done") }],
		async tidy(u, c) { await back(u, c); } };
	/* Radek's 0.6 review 1 (2026-10-12) as snapshots, before and after (scripts/mdmm-snap.py): the roll's foot, the
	   Sound page's UNISON and SUB screens, the multi envelope at ATK 73 DEC 0 SUS 127 REL 127, both plates, GLOBAL */
	const typeVal = async (u, q, v) => { if (!$1(q)) return; u.click(q, { cmd: true }); await until(() => !!field(), 1500); typeIn(u, String(v)); await sleep(250); };
	const shotsReview = { name: "mm-shots-review", proves: [], needs: () => !/mm-shots/.test(location.search) ? "screenshots only when asked by name" : null,
		steps: [go("seq"), sel(0),
			{ say: "the roll", act: async () => { await sleep(800); Journey.snapshot("review-seq"); } },
			go("sound"),
			{ say: "SWAVE-SAW, the unison wide and the subs up", act: async u => {
				if (wk().tracks[0].machineName !== "SWAVE-SAW") { u.click("#machbtn"); await until(() => !$1("#machpop").hidden, 1500); u.click('#machpop .mf[data-fam="SWAVE"]'); await sleep(50); u.click('#machpop .mk[data-mach="SWAVE-SAW"]'); await until(() => wk().tracks[0].machineName === "SWAVE-SAW", 4000); await sleep(400); }
				for (const [n, v] of [["UNIW", 127], ["UNIL", 100], ["UNIX", 80], ["SUB1", 90], ["SUB2", 60], ["SUBX", 70]]) await typeVal(u, `#main .pc[data-g="SYN"][aria-label="${n}"]`, v);
				await sleep(600); Journey.snapshot("review-sound"); } },
			go("perform"),
			{ say: "the multi envelope at ATK 73 DEC 0 SUS 127 REL 127", act: async u => {
				for (const [n, v] of [["ATK", 73], ["DEC", 0], ["SUS", 127], ["REL", 127]]) await typeVal(u, `#main .pc[data-g="menv"][data-n="${n}"]`, v);
				await sleep(600); Journey.snapshot("review-perform"); } },
			{ say: "REL 40", act: async u => { await typeVal(u, '#main .pc[data-g="menv"][data-n="REL"]', 40); await typeVal(u, '#main .pc[data-g="menv"][data-n="SUS"]', 80); await typeVal(u, '#main .pc[data-g="menv"][data-n="DEC"]', 50); await sleep(600); Journey.snapshot("review-perform-rel40"); } },
			go("seq"),
			{ say: "both plates", act: async u => { for (const pl of ["mk1", "mk2"]) { if (S().plate !== pl) await platePick(u); await sleep(600); Journey.snapshot("review-plate-" + pl); } } },
			{ say: "GLOBAL", act: async u => { u.click("#globkey"); await sleep(800); Journey.snapshot("review-global"); u.key("Escape"); await sleep(300); } }],
		async tidy(u, c) { await back(u, c); } };
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
	const editorMenuJ = { ...Journey.editorMenuJourney("mm-top-editor-menu", "Monomachine Editor"), proves: ["MM-X17"] };
	const memoryJ = Journey.memoryJourney("mm-engine-memory", { proves: ["MM-X01"] });
	/* I-018: the CPU meter beside the version and its details, as the Machinedrum's */
	const cpuJs = [...Journey.cpuMeterJourneys("mm", { proves: ["MM-X15"] }), Journey.speedUpsMenuJourney("mm", { proves: ["MM-X15"] })];
	/* I-021: the output meter and volume at the LCD's right end, as the Machinedrum's */
	/* the same fit with MIDI mapping on (the Control tab and the LEARN key take room in the top bar; the plate key is in the engine menu), the
	   Control workspace among the pages: at 1280, 1440 and 1500 px (the plug-in says mapping is on by a learn document) */
	const learnFit = () => Journey.fitJourneys("mm", ["seq", "sound", "mix", "perform", "song", "control"], { views: [1280, 1440, 1500].map(w => ({ name: String(w), width: w, floor: 0 })),
		after: async (v, w) => { if (w === "control") { await sleep(300); Journey.snapshot("learn-mm-" + v.name); } } }).filter(j => j.name === "mm-fit-workspaces").map(j => {
		const tidy = j.tidy;
		return { ...j, name: "mm-fit-workspaces-learn", proves: [], steps: [{ say: "mapping on: the Control tab and the LEARN key are in the top bar", act: async () => { window.gm.recv([{ type: "learn", doc: lDoc([]) }]); await sleep(300); },
			screen: () => ok(!$1(tab("control")).hidden && !learnKey().hidden, "control tab hidden " + $1(tab("control")).hidden) }, ...j.steps],
			async tidy(u, c) { try { if (tidy) await tidy(u, c); } finally { await learnTidy(u); } } };
	});
	const volJs = [...Journey.volumeJourneys("mm", { proves: ["MM-X16"] }), ...Journey.fitJourneys("mm", ["seq", "sound", "mix", "perform", "song"]), ...learnFit()];

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
			{ say: "⇧-click ▶, then Stop from the right-click menu: the pause ends, the position goes", act: async u => { u.click("#play", { shift: true }); await until(paused, 2000); u.rightClick("#play"); await until(() => !!$1('#deskmenu [data-mid="play"]'), 2000); u.click('#deskmenu [data-mid="play"]'); },
				screen: () => ok(!paused() && !S().playing && $1("#pos").textContent === "--.--", "POSITION " + $1("#pos").textContent), machine: () => ok(!playing(), "playing"), within: 3000 }
		],
		async tidy(u) { await stopAll(u); }
	};
	const panicJ = {
		name: "mm-top-panic", proves: ["MM-041", "MM-361"],
		steps: [
			{ say: "press PLAY", act: u => u.click("#play"), machine: () => ok(playing(), "not playing"), within: 6000 },
			{ say: "right-click ▶: the transport menu, Panic in it", act: u => u.rightClick("#play"),
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
			{ say: "⌥-drag the tempo up: the LCD follows, the machine's tempo changes at the release", act: async (u, c) => { c.b0 = machine().tempo; c.n = sent.mark(); await u.drag("#bpm", [[0, -6], [0, -12], [0, -18], [0, -24]], { alt: true }); },
				machine: c => ok(machine().tempo > c.b0 && sent.since(c.n).filter(o => o === "tempo").length === 1, "tempo " + machine().tempo + ", sent " + sent.since(c.n).join(",")), within: 4000 }
		],
		async tidy(u, c) { if (c.b0 != null && Math.abs(machine().tempo - c.b0) >= 0.05) HOST.tempo(c.b0); await sleep(300); }
	};
	const playFromJ = {
		name: "mm-song-play-from", proves: ["MM-258", "MM-270", "MM-256"],
		steps: [
			go("song"),
			{ say: "the song the machine plays, Arrange; click row 3, then ▶ From here: the question to set TRANSPORT IN to ACCEPT", act: async (u, c) => { c.m0 = machine().song?.songMode === true; c.tr0 = I().doc("global", machine().global?.current ?? 0)?.controlIn?.transport; c.slot0 = S().songs?.slot; if (S().songs?.slot !== machine().song?.current) await choose(u, "songsel", machine().song?.current ?? 0); u.click('[data-set="songpick"] button[data-v="song"]'); await sleep(200); u.click('.scell[data-i="2"]'); await sleep(150); u.click('[data-rowact="from"]'); },
				screen: () => ok(dlgShown() && !!dlgButton("Set TRANSPORT to ACCEPT"), "no question"), within: 4000 },
			{ say: "confirm: ACCEPT goes to the machine, then the song plays from row 3 by itself, in SONG mode", act: u => u.click(dlgButton("Set TRANSPORT to ACCEPT")),
				machine: () => ok(playing() && tele.last.songRow === 2 && machine().song?.songMode === true, "row " + (tele.last?.songRow + 1) + ", playing " + playing() + ", song mode " + machine().song?.songMode + ", TRANSPORT IN " + I().doc("global", machine().global?.current ?? 0)?.controlIn?.transport
					+ `; song ${machine().song?.current} (page ${S().songs?.slot}) rows ${JSON.stringify(songDoc()?.rows?.slice(0, 4))}`), within: 20000 },
			{ say: "click row 2 and press Enter: from row 2", act: async u => { u.click('.scell[data-i="1"]'); await sleep(150); blur(); u.key("Enter"); },
				machine: () => ok(playing() && tele.last.songRow === 1, "row " + (tele.last?.songRow + 1)), within: 8000 }
		],
		/* back to PATTERN mode with the Song page's PATTERN key (the old [data-seqmode] key is gone since wave 1: the tidy
		   threw, the machine stayed in SONG mode and the next journey found the LCD's pattern keys under the song row) */
		async tidy(u, c) { await stopAll(u); if (!c.m0 && machine().song?.songMode === true) { if (S().ws !== "song") u.click(tab("song"));
			u.click('[data-set="songpick"] button[data-v="pattern"]'); await until(() => machine().song?.songMode === false, 4000); }
			/* the question's TRANSPORT IN ACCEPT is the GLOBAL's: back to what it was */
			await back(u, c);
			if (c.tr0 != null && I().doc("global", machine().global?.current ?? 0)?.controlIn?.transport !== c.tr0) { Bridge.send({ op: "globalMidi", transportIn: !!c.tr0, force: true }); await sleep(2500); } }
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
		name: "mm-seq-copy-what", proves: ["MM-187", "MM-191", "MM-221", "MM-232", "MM-234", "MM-X11"],
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
		name: "mm-seq-clear-what", proves: ["MM-188", "MM-192", "MM-X11"],
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
	const undoTo = async (u, n0) => { for (let i = 0; i < 500 && histN() > n0; i++) { const k = histN(); blur(); u.key("z", { cmd: true }); if (!await until(() => histN() < k, 4000)) break; await until(() => !desk().tx, 3000); await sleep(350); /* the machine's answer to one undo before the next (undone in a rush, a level stayed) */ } await sleep(300); };
	/* Every journey is independent (doc/modern-ux/JOURNEYS.md): the runner notes where the page stood when it began (begin: c.back0.undo, c.back0.mode,
	   c.back0.pat, c.back0.kit, c.back0.chain) and a tidy that changed any of it calls back(u, c), which puts the editor's modes and its undo history back:
	   the transport stopped, the edits undone, PATTERN or SONG mode as found, the pattern and kit the machine was on, no chain. */
	const begin = c => { c.back0 = { state: state(), mutes: JSON.stringify(machine().mutes || null), patKit: I().doc("pattern", cur())?.kit, tempo: machine().tempo, undo: histN(), mode: machine().song?.songMode, pat: cur(), kit: machine().kit?.current, kitw: machine().kit?.working, chain: !!desk().chain?.active }; };
	const back1 = async (u, c) => {
		if (!c.back0) return;
		/* a journey that restarted the machine: the start-up card is waited for, as a person waits */
		if (!$1("#bootcard").hidden) { await until(() => $1("#bootcard").hidden, 120000); await sleep(1500); await until(() => machine().loading && machine().loading.done >= machine().loading.total, 90000); }
		if (S().playing) { u.click("#play"); await until(() => !S().playing, 3000); }
		if (c.back0.undo != null) { await undoTo(u, c.back0.undo); await sleep(300); }
		if (desk().chain?.active && !c.back0.chain) { Bridge.send({ op: "chainClear" }); await sleep(300); }
		if (c.back0.mode != null && machine().song?.songMode !== c.back0.mode) { Bridge.send({ op: "seqMode", song: c.back0.mode }); await until(() => machine().song?.songMode === c.back0.mode, 4000); await sleep(300); }
		if (c.back0.pat != null && cur() !== c.back0.pat) { Bridge.send({ op: "select", p: c.back0.pat, now: true }); await until(() => cur() === c.back0.pat, 6000); await sleep(300); }
		if (c.back0.kit != null && machine().kit?.current !== c.back0.kit) { Bridge.send({ op: "loadKit", k: c.back0.kit, force: true }); await until(() => machine().kit?.current === c.back0.kit, 6000); await sleep(300); }
		/* a kit edited and undone holds the same sounds, but the machine still calls it edited: saved again, it is the kit it was */
		if (c.back0.kitw === "clean" && machine().kit?.working !== "clean") { Bridge.send({ op: "saveKit", k: machine().kit?.current, force: true }); await until(() => machine().kit?.working === "clean", 8000); await sleep(600); }
		/* a slot the journey overwrote (kept with keep(c, "kit", k) before it did): pasted back from the plug-in's clipboard */
		for (const [kind, slot] of c.keptSlots || []) { Bridge.send(kind === "kit" ? { op: "kitPaste", k: slot, force: true } : kind === "pattern" ? { op: "patPaste", p: slot, force: true } : { op: "songPaste", s: slot, force: true }); await sleep(600); }
		/* the tempo last: loading a pattern or a song may set it */
		if (c.back0.tempo != null && machine().tempo != null && Math.abs(machine().tempo - c.back0.tempo) > 0.05) { Bridge.send({ op: "tempo", bpm: c.back0.tempo }); await until(() => Math.abs(machine().tempo - c.back0.tempo) <= 0.05, 6000); await sleep(300); }
		/* the mutes as they were, and the pattern's kit link (loading another kit links the pattern to it) */
		{ const was = JSON.parse(c.back0.mutes || "null"), now = machine().mutes;
			if (was && now) for (const [key, op] of [["synth", "mute"], ["midi", "muteMidi"]]) for (let t = 0; t < 6; t++) { const w = (was[key] >> t & 1) === 1; if (((now[key] ?? 0) >> t & 1) === 1 !== w) { Bridge.send({ op, t, on: w }); await sleep(900); } } }
		{ const pd = I().doc("pattern", c.back0.pat); if (pd && c.back0.patKit != null && pd.kit !== c.back0.patKit) { Bridge.send({ op: "patternKit", p: c.back0.pat, v: c.back0.patKit, force: true }); await until(() => I().doc("pattern", c.back0.pat)?.kit === c.back0.patKit, 6000); await sleep(600); } }
	};
	/* what back puts right, then waits for the machine's late answers (a pattern or kit change makes it send the kit and the pattern again, seconds on the firmware, and the page redraws when they come):
	   the documents the page holds unchanged for 1.2 s */
	const settled = async () => { let last = "", t0 = performance.now(); const end = t0 + 12000;
		while (performance.now() < end) { const h = JSON.stringify([cur(), machine().kit?.current, I().workingKit, I().doc("pattern", cur()), machine().song?.songMode, machine().mutes]); if (h !== last || !(!desk().tx)) { last = h; t0 = performance.now(); } else if (performance.now() - t0 >= 1200) return; await sleep(100); } };
	const back = async (u, c) => {
		if (!c.back0) return;
		const was = state(); await back1(u, c);
		if (Journey.stateDiff(was, state())) await settled();
	};
	/* a slot the journey is about to overwrite: its content goes to the plug-in's clipboard and back() pastes it back (one slot per kind at a time) */
	const keep = async (c, kind, slot) => { Bridge.send(kind === "kit" ? { op: "kitCopy", k: slot } : kind === "pattern" ? { op: "patCopy", p: slot } : { op: "songCopy", s: slot }); await sleep(400); (c.keptSlots = c.keptSlots || []).push([kind, slot]); };
	/* slots to be overwritten that the product cannot undo (an import): the first goes to the clipboard, each of the others is overwritten by a copy of
	   the first (an undo step that holds that slot's content): back() undoes them, then pastes the first back. Any number of slots */
	const keepMany = async (c, kind, slots) => { await keep(c, kind, slots[0]);
		for (const s of slots.slice(1)) { Bridge.send({ op: kind === "kit" ? "kitCopyTo" : kind === "pattern" ? "patCopyTo" : "songCopyTo", from: slots[0], to: s, force: true }); await sleep(900); } };
	/* the kits, patterns and songs an import panel's preview lists (its cells "kit:N", "pattern:N", "song:N"), kept */
	const keepImportTargets = async c => { const it = $all('#syxpop button[data-syxitem]').map(b => b.dataset.syxitem.split(":"));
		for (const kind of ["kit", "pattern", "song"]) { const slots = it.filter(([k]) => k === kind).map(([, n]) => +n); if (slots.length) await keepMany(c, kind, slots); } };
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
		const v1 = cellOf(t, g, i); if (Journey.pageTier()) await until(() => nonSys(w0).some(w => w.kind === "cc"), 2000); await sleep(120);
		return { v0, v1, moved: cellDiff(before, kitCells()), cc: nonSys(w0).filter(w => w.kind === "cc"), text: valueText(`#main .pc[data-g="${g}"][data-n="${i}"]`), name: el.getAttribute("aria-label") };
	}
	/* the Monomachine manual's CC numbers of the DATA pages (Appendix B): SYN 48-55, AMP 56-63, FLT 72-79, EFX 80-87, LFO 1 88-95, LFO 2 104-111, LFO 3 112-119 */
	const CC_BASE = { SYN: 48, AMP: 56, FLT: 72, EFX: 80, LF1: 88, LF2: 104, LF3: 112 };
	/* did the box's edit reach its own cell, only that cell, and the wire as the one CC the manual names, on the track's channel? */
	const checkBox = (r, t, g, i) => {
		if (r.err) return r.err;
		const want = `T${t + 1}.${PAGES.indexOf(g)}.${i}`;
		if (r.moved.length !== 1 || r.moved[0] !== want) return `${g}.${i}: moved ${r.moved.join(",") || "nothing"}`;
		if (Journey.noWire()) return null;	/* the firmware run: the plug-in reports no sent CC (I-027) */
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
			{ say: "the Kit page has seven pages of eight values: SYN, AMP, FLT, EFX and the three LFOs, and the kit holds them all", screen: () => ok(["AMP", "FLT", "EFX"].every(g => $all(`#main .pc[data-g="${g}"]`).length === 8) && ["LF1", "LF2", "LF3"].every(g => $all(`#main .pc[data-g="${g}"]`).length === 4 && $1(`#lp${g[2]}`) && $1(`#ld${g[2]}`) && $all(`[data-set="ltrig"][data-l="${g}"] button`).length === 5 && $all(`[data-lwave="${g}"]`).length === 11), "boxes " + ["AMP", "FLT", "EFX", "LF1"].map(g => g + $all(`#main .pc[data-g="${g}"]`).length)),
				machine: () => ok(wk().tracks.every(tr => tr.pages.length >= 7 && tr.pages.slice(0, 7).every(pg => pg.length === 8)), "pages " + wk().tracks[0].pages.map(p => p.length)) },
			{ say: "the MKII plate on (two of the machines are MKII only)", act: (u, c) => { c.plate0 = document.documentElement.dataset.plate; if (c.plate0 !== "mk2") return platePick(u); }, screen: () => ok(document.documentElement.dataset.plate === "mk2", "plate " + document.documentElement.dataset.plate) },
			{ say: "pick each machine of the manual (its family, then its key): the machine is in the kit, the page shows the manual's knobs in the manual's order, each knob moves its own value and sends its own CC", act: async (u, c) => {
				c.n0 = histN(); c.bad = []; c.n = 0; c.knobs = 0; c.t = 0;
				for (const [m, want] of MANUAL_MACHINES) {
					const fam = m.replace(/-.*$/, "").replace(/^(FM\+).*/, "FM+");
					u.click("#machbtn"); await until(() => !$1("#machpop").hidden, 1500);
					const famBtn = $1(`#machpop .mf[data-fam="${famKey(m)}"]`); if (famKey(m) !== fam || !famBtn) { c.bad.push(`${m}: family ${famKey(m)}, the manual's ${fam}`); if (!$1("#machpop").hidden) u.key("Escape"); continue; }
					u.click(famBtn); await sleep(30); if (m === "SWAVE-SAW") Journey.snapshot("mm-machine-picker");
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
						const e = checkBox(r, 0, "SYN", i); if (e) c.bad.push(m + " " + name + ": " + e); else c.knobs++;
					}
					if (m === "DPRO-BBOX" || m === "VO-6") Journey.snapshot(m === "VO-6" ? "mm-machine-vo6" : "mm-machine-bbox");
					c.n++;
				}
				c.note = `${c.n} machines, ${c.knobs} knobs`; },
				screen: c => ok(!c.bad.length, c.bad.slice(0, 6).join(" | ") + (c.bad.length > 6 ? ` (+${c.bad.length - 6})` : "")), machine: c => ok(c.n === MANUAL_MACHINES.length, c.n + " of " + MANUAL_MACHINES.length + " machines"), within: 1000 }
		],
		async tidy(u, c) { await back(u, c); if (c.plate0 && document.documentElement.dataset.plate !== c.plate0) await platePick(u); }
	};
	/* ---- Sound: the track effects, every value of AMP, FLT and EFX in the manual's order (Track effects chapter) ---- */
	const EFFECT_PAGES = [["AMP", "ATK HOLD DEC REL DIST VOL PAN PORT"], ["FLT", "BASE WDTH HPQ LPQ ATK DEC BOFS WOFS"], ["EFX", "EQF EQG SRR DTIM DSND DFB DBAS DWID"]];
	/* the values the manual gives a sign (below 0: headroom for DIST, a cut for EQG, left for PAN, stereo kept for DSND) */
	const SIGNED_NAMES = new Set(["DIST", "PAN", "EQG", "DSND", "BOFS", "WOFS"]);	/* B-148: BOFS, WOFS -64 to +63 */
	const signedText = v => (v - 64 > 0 ? "+" : "") + (v - 64);
	const trackEffects = {
		name: "mm-sound-track-effects", proves: ["MM-114", "MM-115", "MM-116", "MM-117", "MM-118", "MM-119", "MM-121", "MM-122", "MM-123", "MM-124", "MM-125", "MM-126", "MM-127", "MM-129", "MM-130", "MM-131", "MM-132", "MM-133", "MM-134", "MM-092", "MM-084"],
		steps: [
			go("sound"), sel(0),
			{ say: "AMP, FLT and EFX: each value box has the manual's name at the manual's place; an arrow moves its own cell of the kit and sends its own CC on the track's channel; the sign shows where the manual gives one", act: async (u, c) => {
				c.n0 = histN(); c.bad = []; c.n = 0; await sleep(300); Journey.snapshot("mm-sound-workspace");
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
			{ say: "the delay screen: drag its handle a quarter of the screen (left, or right when it sits in the left half): DTIM moves by 64, in the 256ths of a bar the repeats sit apart", act: async (u, c) => { u.click(rail(0)); await sleep(300);
					const cv = $1('#main canvas.ed[data-ed="delay"]'), r = cv.getBoundingClientRect(), h = ED.delay.handles(r.width, r.height, cv)[0]; c.d0 = cellOf(0, "EFX", 3); c.dx = (h.x > r.width / 2 || c.d0 + 64 > 127 ? -1 : 1) * Math.round(r.width / 4);	/* left too when 64 more would pass the top of the range (DTIM 109 clamped at 127) */ c.hx = h.x; c.W = r.width;
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
		async tidy(u, c) { await back(u, c); }
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
		async tidy(u, c) { if (S().side === "midi") u.click('[data-side="int"]'); await back(u, c); }
	};
	/* ---- Mix: the buses, the inputs and the routing (the Routing chapter) ---- */
	const BUS_BIT = { AB: 1, CD: 2, EF: 4 }, IN_NAMES = ["NEIBOR", "INP A", "INP B", "INP AB", "BUS AB", "BUS CD", "BUS EF"];
	/* the SysEx 0x5C the core sent for a routing edit: F0 00 20 3C 03 00 5C track outputs input F7 (a synth machine takes no input: 0) */
	const route5c = n0 => wireLog.filter(w => w.seq > n0 && w.kind === "sysex" && w.b[6] === 0x5c).map(w => ({ t: w.b[7], out: w.b[8], inp: w.b[9] }));
	const flowOf = b => $all(".flowl span").map(e => e.textContent.trim()).find(x => x.startsWith(b + ":")) || "";
	const lcdRoute = () => $1('#lcd2 [data-l2="route"] b')?.textContent;
	const setMachineOf = async (u, t, m) => { u.click(tab("sound")); await sleep(200); u.click(rail(t)); await sleep(200); u.click("#machbtn"); await until(() => !$1("#machpop").hidden, 1500); u.click(`#machpop .mf[data-fam="${famKey(m)}"]`); await sleep(50); u.click(`#machpop .mk[data-mach="${m}"]`); await until(() => wk().tracks[t].machineName === m, 4000); await sleep(300); u.click(tab("mix")); await sleep(300); };
	const mixBuses = {
		name: "mm-mix-buses", proves: ["MM-005", "MM-109", "MM-276", "MM-277", "MM-278", "MM-279", "MM-280", "MM-281", "MM-282", "MM-283", "MM-284", "MM-377"],
		steps: [
			go("mix"),
			{ say: "the factory routing is 3xSTEREO: its key is lit, the LCD says it, the kit's global holds it", screen: () => ok(pressed('[data-set="routing"] button[data-v="3xSTEREO"]') && /^3xST(EREO)?$/.test(lcdRoute()), `lit ${$all('[data-set="routing"] button').filter(b => b.getAttribute("aria-pressed") === "true").map(b => b.dataset.v)}, LCD ${lcdRoute()}`), machine: () => ok(gDoc()?.routingMode === "3xSTEREO", "routing " + gDoc()?.routingMode) },
			{ say: "every track's OUT keys AB, CD, EF: a click flips that bus of that track only, the machine gets SysEx 0x5C with the track's new bits, and a synth track's name moves in and out of the bus's flow line", act: async (u, c) => {
				c.n0 = histN(); c.bad = []; c.n = 0;
				for (let t = 0; t < 6; t++) for (const b of ["AB", "CD", "EF"]) {
					const q = `[data-bus="${b}"][data-t="${t}"]`, was = wk().tracks[t].outputs, w0 = wireSeq, others = wk().tracks.map(x => x.outputs);
					u.click(q); if (!await until(() => wk().tracks[t].outputs === (was ^ BUS_BIT[b]), 3000)) { c.bad.push(`T${t + 1} ${b}: bits ${wk().tracks[t].outputs} for ${was ^ BUS_BIT[b]}`); continue; }
					if (Journey.pageTier()) await until(() => route5c(w0).length > 0, 2000); const r = route5c(w0).pop();
					if (!Journey.noWire() && (!r || r.t !== t || r.out !== (was ^ BUS_BIT[b]) || r.inp !== (isFx(S().tracks[t].m) ? wk().tracks[t].input : 0))) c.bad.push(`T${t + 1} ${b}: SysEx ${JSON.stringify(r)}`);
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
			{ say: "IN INP A, INP B, INP AB: the kit holds the input and the machine gets it in SysEx 0x5C", act: async (u, c) => { c.bad = []; for (const [i, nm] of [[1, "INP A"], [2, "INP B"], [3, "INP AB"]]) { const w0 = wireSeq; await choose(u, "inp3", nm); if (!await until(() => wk().tracks[3].input === i, 3000)) { c.bad.push(`${nm}: kit ${wk().tracks[3].input}`); continue; } if (Journey.pageTier()) await until(() => route5c(w0).length > 0, 2000); const r = route5c(w0).pop(); if (!Journey.noWire() && (!r || r.t !== 3 || r.inp !== i)) c.bad.push(`${nm}: SysEx ${JSON.stringify(r)}`); } },
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
		async tidy(u, c) { await back(u, c); }
	};
	/* ---- Appendix B: what the machine is sent as MIDI (CC, NRPN) on which channel; the base channel, and OFF ---- */
	const ccsOf = n0 => nonSys(n0).filter(w => w.kind === "cc").map(w => w.b);
	/* one edit through the page's own control, then the CC the machine would get: the controller numbers and the channel are the manual's */
	async function wireOf(act) { const w0 = wireSeq; await act(); await sleep(450); return ccsOf(w0); }
	/* a GLOBAL edit: written, read back and made active (SysEx 0x50, 0x51, 0x56); only then does the core and the wire use it */
	const globalSettled = async n0 => { if (!Journey.pageTier()) { await sleep(3000); return; } await until(() => wireLog.some(w => w.seq > n0 && w.kind === "sysex" && w.b[6] === 0x56), 10000); await sleep(2000); };
	const wireCc = {
		name: "mm-wire-cc", proves: ["MM-353", "MM-354", "MM-355", "MM-356", "MM-357", "MM-358", "MM-359", "MM-360", "MM-362", "MM-289"],
		steps: [
			go("sound"), sel(0),
			{ say: "a machine with all eight SYN values (DPRO-DDRW, MKII): each value of the page sends its own CC, 48 to 55, on the track's channel with the value the kit holds", act: async (u, c) => { c.n0 = histN(); c.bad = []; c.plate0 = document.documentElement.dataset.plate; if (c.plate0 !== "mk2") await platePick(u); await sleep(200);
					u.click("#machbtn"); await until(() => !$1("#machpop").hidden, 1500); u.click('#machpop .mf[data-fam="DPRO"]'); await sleep(50); u.click('#machpop .mk[data-mach="DPRO-DDRW"]'); await until(() => wk().tracks[0].machineName === "DPRO-DDRW", 4000); await sleep(300);
					for (let i = 0; i < 8; i++) { const e = checkBox(await nudgeBox(u, 0, "SYN", i), 0, "SYN", i); if (e) c.bad.push(e); } },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 },
			{ say: "AMP 56-63, FLT 72-79, EFX 80-87: every value of each page, on track 6's channel (base + 5)", act: async (u, c) => { c.bad = []; u.click(rail(5)); await sleep(300);
					for (const g of ["AMP", "FLT", "EFX"]) for (let i = 0; i < 8; i++) { const e = checkBox(await nudgeBox(u, 5, g, i), 5, g, i); if (e) c.bad.push(e); } },
				screen: c => ok(!c.bad.length, c.bad.slice(0, 5).join(" | ")), within: 1000 },
			{ say: "the three LFOs: all eight values of each (the PAGE and DEST lists, the TRIG and WAVE keys, MULT, SPD, INTL, DPTH) go as CC 88-95, 104-111 and 112-119", act: async (u, c) => { c.bad = []; u.click(rail(1)); await sleep(300);
					const t = 1, expect = (k, i, v, cc) => Journey.noWire() || cc.some(b => b[0] === (0xb0 | (baseCh() + t)) && b[1] === CC_BASE["LF" + k] + i && b[2] === v);
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
			{ say: "LEVEL: drag track 2's fader: CC 7 on its channel with the kit's level", pageOnly: "the CC on the cable", act: async (u, c) => { c.c = await wireOf(() => u.drag(strip(1, '.fader[data-g="lev"]'), [[0, -8], [0, -16], [0, -24]])); },
				screen: c => ok(c.c.length >= 1 && c.c.every(b => b[0] === (0xb0 | (baseCh() + 1)) && b[1] === 7) && c.c[c.c.length - 1][2] === wk().levels[1], `CC ${c.c.map(b => b.join(" ")).join(" | ")}, level ${wk().levels[1]}`), within: 6000 },
			{ say: "M on track 3: CC 3 value 1 on track 3's channel; again: value 0", pageOnly: "the CC on the cable", act: async (u, c) => { c.on = await wireOf(() => u.click(strip(2, ".ms.m"))); c.off = await wireOf(() => u.click(strip(2, ".ms.m"))); },
				screen: c => ok(c.on.length === 1 && c.off.length === 1 && c.on[0][0] === (0xb0 | (baseCh() + 2)) && c.on[0][1] === 3 && c.on[0][2] === 1 && c.off[0][1] === 3 && c.off[0][2] === 0, `on ${c.on.map(b => b.join(" "))}, off ${c.off.map(b => b.join(" "))}`), within: 6000 },
			{ say: "PAN of track 2: the AMP page's seventh value, CC 62 on its channel (the machine answers the standard CC 10 too; the page sends 62)", pageOnly: "the CC on the cable", act: async (u, c) => { const v0 = wk().tracks[1].pages[1][6]; c.c = await wireOf(() => u.drag(strip(1, ".pc.pan"), [[v0 > 64 ? -8 : 8, 0], [v0 > 64 ? -16 : 16, 0]])); },
				screen: c => ok(c.c.length >= 1 && c.c.every(b => b[0] === (0xb0 | (baseCh() + 1)) && b[1] === 62) && c.c[c.c.length - 1][2] === wk().tracks[1].pages[1][6], `CC ${c.c.map(b => b.join(" ")).join(" | ")}`), within: 6000 },
			go("sound"),
			{ say: "a MIDI track's MIDI page: LEN, VEL, PB, PCHG and CL1-4 go as NRPN on the base channel: the track as the MSB (99), the parameter 0x38 to 0x3F as the LSB (98), the value as data entry (6)", act: async (u, c) => { c.bad = []; u.click('[data-side="midi"]'); await sleep(300); u.click(rail(7)); await sleep(300);
					for (let i = 0; i < 8; i++) { const el = box("MID", i); if (!el) { c.bad.push("no MIDI box " + i); continue; } const v0 = wk().tracks[1].pages[7][i], mx = maxOf(ref(el)[2]), w0 = wireSeq; el.focus(); u.key(v0 >= mx ? "ArrowDown" : "ArrowUp"); await until(() => wk().tracks[1].pages[7][i] !== v0, 3000); await sleep(400);
						const n = nonSys(w0).filter(w => w.kind === "nrpn").map(w => w.b), v1 = wk().tracks[1].pages[7][i];
						if (v1 === v0) c.bad.push(`MIDI ${i}: the kit stayed ${v0}`); else if (!Journey.noWire() && (n.length !== 3 || !n.every(b => b[0] === (0xb0 | baseCh())) || n[0][1] !== 99 || n[0][2] !== 1 || n[1][1] !== 98 || n[1][2] !== 0x38 + i || n[2][1] !== 6 || n[2][2] !== v1)) c.bad.push(`MIDI ${i}: ${n.map(b => b.join(" ")).join(" | ")} for ${v1}`); } },
				screen: c => ok(!c.bad.length, c.bad.slice(0, 4).join(" | ")), within: 1000 },
			{ say: "the base channel: GLOBAL, + once: track 1's value goes out on channel 2; OFF (− twice): the edit reaches the kit but no CC goes", act: async (u, c) => { u.click('[data-side="int"]'); await sleep(300); u.click(rail(0)); await sleep(300); c.base0 = baseCh(); u.click("#globkey"); await sleep(300);
					const g0 = wireSeq; u.click('#globpop [data-ga="base"][data-d="1"]'); await until(() => baseCh() === c.base0 + 1, 15000); await globalSettled(g0); u.key("Escape"); await sleep(300); c.r1 = await nudgeBox(u, 0, "AMP", 0);
					u.click("#globkey"); await sleep(300); const g1 = wireSeq; for (let i = 0; i < 2; i++) { u.click('#globpop [data-ga="base"][data-d="-1"]'); await sleep(400); } await until(() => baseCh() > 15, 15000); await globalSettled(g1); u.key("Escape"); await sleep(300); c.offBase = baseCh(); const w0 = wireSeq; c.r2 = await nudgeBox(u, 0, "AMP", 1).catch(e => ({ err: String(e) })); c.ccs = ccsOf(w0); },
				screen: c => ok(Journey.noWire() ? (c.r1.moved || []).length === 1 : c.r1.cc?.length === 1 && c.r1.cc[0].b[0] === 0xb1 && c.r1.cc[0].b[1] === 56, `base +1: ${c.r1.err || ""} ${c.r1.cc?.map(w => hex2(w))} moved ${c.r1.moved}`), machine: c => ok(c.offBase > 15 && !c.ccs.length && (c.r2.moved || []).length > 0, `base ${c.offBase}, CCs ${c.ccs.map(b => b.join(" "))}, moved ${c.r2.moved}`), within: 6000 }
		],
		async tidy(u, c) {
			if (c.base0 != null && baseCh() !== c.base0) { if ($1("#globpop").hidden) { u.click("#globkey"); await sleep(300); } for (let i = 0; i < 4 && baseCh() !== c.base0; i++) { u.click(`#globpop [data-ga="base"][data-d="${baseCh() > 15 ? 1 : -1}"]`); await sleep(500); } await until(() => baseCh() === c.base0, 10000); }
			if (!$1("#globpop").hidden) u.key("Escape");
			if (S().side === "midi") u.click('[data-side="int"]');
			await back(u, c);
			if (c.plate0 && document.documentElement.dataset.plate !== c.plate0) await platePick(u);
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
	/* the envelopes a trig fires as the view holds them, and as the step menu ticks them (Envelopes > Amp, Filter, LFO) */
	const envOf = (t, s) => { const st = S().tracks[t].steps[s]; return [!!st?.a, !!st?.f, !!st?.l]; };
	const envTicks = async (u, t, s) => { if (S().stepSel) clearSel(); await stepPick(u, t, s, "step-env"); const r = ["a", "f", "l"].map(k => ticked("step-env-" + k)); closeDeskMenu(); await sleep(100); return r; };
	const envPick = async (u, t, s, k) => { if (S().stepSel) clearSel(); await stepPick(u, t, s, "step-env", "step-env-" + k); };
	const envJ = {
		name: "mm-seq-env-trigs", proves: ["MM-029", "MM-047", "MM-085", "MM-143", "MM-171", "MM-209", "MM-210", "MM-211", "MM-212", "MM-213", "MM-214"],
		steps: [
			go("seq"), sel(0), { say: "the LCD names the kit, the rail marks the track; the roll holds each trig's envelopes as the pattern does, and marks on the notes show them (no row under the roll)", act: async () => { await sleep(300); Journey.snapshot("mm-sequence-workspace"); Journey.snapshot("mm-page-overview"); Journey.snapshot("mm-overview");
					/* the pictures named for an element are taken only when that element is on the page, drawn and in view (a snapshot is the whole page) */
					const roll = $1("#seq canvas.roll[data-big]"); if (!roll) throw new Error("no roll to snapshot"); roll.scrollIntoView({ block: "nearest" }); await sleep(150); Journey.snapshot("mm-roll-marks");
					const lcd = $1(".lcdpanel"); if (!lcd || !lcd.getBoundingClientRect().width) throw new Error("no LCD to snapshot"); lcd.scrollIntoView({ block: "nearest" }); await sleep(150); Journey.snapshot("mm-lcd"); }, screen: () => {
					const bad = []; if (!$1("#kitname").textContent.includes(kitName(machine().kit.current).trim())) bad.push("LCD kit " + $1("#kitname").textContent); if (S().sel !== 0) bad.push("track " + S().sel); if ($1("[data-env]") || $1(".ttrow")) bad.push("a row under the roll");
					for (let s = 0; s < S().len; s++) { const st = S().tracks[0].steps[s]; if (!st || st.off) continue; for (const [b, k] of [["a", "amp"], ["f", "filter"], ["l", "lfo"]]) if (!!st[b] !== bitsOf(0, k).includes(s)) bad.push(`step ${s + 1} ${b}`); }
					return ok(!bad.length, bad.slice(0, 5).join(" | ")); } },
			{ say: "click an empty cell of the roll: the new note fires all three envelopes (the step menu ticks Amp, Filter, LFO) and has its pitch", act: async (u, c) => { c.n0 = histN(); c.pitch = rollCell(0, 0).n; c.s = freeSteps(0, 1, 6, c.pitch)[0]; const p = rollPitch(0, c.s, c.pitch); u.click(p.c, {}, p.fx, p.fy);
					await until(() => bitsOf(0, "trig").includes(c.s), 6000); c.ticks = await envTicks(u, 0, c.s); },
				machine: c => ok(bitsOf(0, "trig").includes(c.s) && ["amp", "filter", "lfo"].every(k => bitsOf(0, k).includes(c.s)) && noteAt(0, c.s).join() === String(c.pitch), `trig ${bitsOf(0, "trig").includes(c.s)}, amp ${bitsOf(0, "amp").includes(c.s)}, filter ${bitsOf(0, "filter").includes(c.s)}, lfo ${bitsOf(0, "lfo").includes(c.s)}, note ${noteAt(0, c.s)}`),
				screen: c => ok(same(c.ticks, [true, true, true]), "menu ticks " + c.ticks), within: 8000 },
			{ say: "step menu > Envelopes > Amp: only the amp trig goes; then > Filter: only the filter trig goes; the trig and the pitch stay", act: async (u, c) => { await envPick(u, 0, c.s, "a"); await until(() => !bitsOf(0, "amp").includes(c.s), 4000); c.a = [bitsOf(0, "amp").includes(c.s), bitsOf(0, "filter").includes(c.s), bitsOf(0, "lfo").includes(c.s)];
					await envPick(u, 0, c.s, "f"); await until(() => !bitsOf(0, "filter").includes(c.s), 4000); c.f = [bitsOf(0, "amp").includes(c.s), bitsOf(0, "filter").includes(c.s), bitsOf(0, "lfo").includes(c.s)]; },
				machine: c => ok(same(c.a, [false, true, true]) && same(c.f, [false, false, true]) && bitsOf(0, "trig").includes(c.s) && noteAt(0, c.s).join() === String(c.pitch), `after Amp ${c.a}, after Filter ${c.f}`),
				screen: c => ok(same(envOf(0, c.s), [false, false, true]) && noteSpans(0).find(sp => sp.s === c.s)?.kind === "part", "view " + envOf(0, c.s)), within: 10000 },
			{ say: "> LFO: the last one goes: a trig with no envelopes, the pitch kept (it sets a pitch or holds locks); the roll draws it as a small hollow square and the menu ticks Trigless trig", act: async (u, c) => { await envPick(u, 0, c.s, "l"); await until(() => !bitsOf(0, "lfo").includes(c.s), 4000); await sleep(200); c.span = noteSpans(0).find(sp => sp.s === c.s);
					if (S().stepSel) clearSel(); await stepPick(u, 0, c.s); c.tl = ticked("step-trigless"); closeDeskMenu(); },
				machine: c => ok(["amp", "filter", "lfo"].every(k => !bitsOf(0, k).includes(c.s)) && bitsOf(0, "trig").includes(c.s) && noteAt(0, c.s).join() === String(c.pitch), "bits"), screen: c => ok(c.span?.kind === "trigless" && c.tl, "span " + JSON.stringify(c.span?.kind) + ", ticked " + c.tl), within: 8000 },
			{ say: "a lock drawn on that trigless step holds", act: async (u, c) => { const k = $1('[data-dock="locks"]'); if (k) u.click(k); await sleep(200); c.lane = S().lane; await u.drag(`#lane .lb[data-s="${c.s}"]`, [[0, -3]], {}, { fy: 0.5 }); },
				machine: c => { const [pg, pi] = [PAGES.indexOf(c.lane.split(".")[0]), +c.lane.split(".")[1]]; const l = (patDoc().locks || []).find(x => x.track === 0 && x.page === pg && x.param === pi); return ok(l && l.steps.some(([x]) => x === c.s), "locks " + JSON.stringify(l)); }, within: 8000 },
			{ say: "> LFO alone: the LFO trig only, the others stay off (the LFO is trigged on its own)", act: async (u, c) => { await envPick(u, 0, c.s, "l"); await until(() => bitsOf(0, "lfo").includes(c.s), 4000); },
				machine: c => ok(bitsOf(0, "lfo").includes(c.s) && !bitsOf(0, "amp").includes(c.s) && !bitsOf(0, "filter").includes(c.s), `amp ${bitsOf(0, "amp").includes(c.s)}, filter ${bitsOf(0, "filter").includes(c.s)}, lfo ${bitsOf(0, "lfo").includes(c.s)}`), within: 6000 },
			{ say: "right-click an empty step and choose Trigless trig: a trig with no envelopes at the track's pitch; choose it again: the step is empty", act: async (u, c) => { c.e = freeSteps(0, 1, 0).find(x => x !== c.s); if (c.e == null) throw new Error("no empty step"); if (S().stepSel) clearSel();
					await stepPick(u, 0, c.e, "step-trigless"); c.on = await until(() => bitsOf(0, "trig").includes(c.e) && !["amp", "filter", "lfo"].some(k => bitsOf(0, k).includes(c.e)), 6000); c.kind = noteSpans(0).find(sp => sp.s === c.e)?.kind;
					if (S().stepSel) clearSel(); await stepPick(u, 0, c.e, "step-trigless"); },
				machine: c => ok(c.on && !bitsOf(0, "trig").includes(c.e), `added ${c.on}, then trig ${bitsOf(0, "trig").includes(c.e)}`), screen: c => ok(c.kind === "trigless" && !S().tracks[0].steps[c.e], "kind " + c.kind), within: 8000 },
			/* B-152: the page makes a pitchless trig (the machine's EXIT held on a trig): step menu > Pitchless trig */
			{ say: "right-click an empty step and choose Pitchless trig: a trig with its three envelope trigs and no note of its own (a dashed bar at the pitch before); the menu ticks it", act: async (u, c) => {
					c.p = freeSteps(0, 1, (c.s ?? 0) + 1).find(x => x !== c.e && x > (c.s ?? 0)); if (c.p == null) throw new Error("no free step for a pitchless trig"); if (S().stepSel) clearSel();
					await stepPick(u, 0, c.p, "step-pitchless"); await until(() => bitsOf(0, "trig").includes(c.p) && !noteAt(0, c.p).length, 6000); await sleep(200);
					if (S().stepSel) clearSel(); await stepPick(u, 0, c.p); c.tk = ticked("step-pitchless"); closeDeskMenu(); },
				machine: c => ok(bitsOf(0, "trig").includes(c.p) && ["amp", "filter", "lfo"].every(k => bitsOf(0, k).includes(c.p)) && !noteAt(0, c.p).length, `trig ${bitsOf(0, "trig").includes(c.p)}, envelopes ${["amp", "filter", "lfo"].map(k => bitsOf(0, k).includes(c.p))}, notes ${noteAt(0, c.p)}`),
				screen: c => ok(noteSpans(0).find(sp => sp.s === c.p)?.pitchless === true && c.tk, "pitchless " + noteSpans(0).find(sp => sp.s === c.p)?.pitchless + ", ticked " + c.tk), within: 8000 },
			{ say: "choose Pitchless trig again: the step has a note of its own again (the track's pitch before it), the trig and envelopes stay", act: async (u, c) => { if (S().stepSel) clearSel(); await stepPick(u, 0, c.p, "step-pitchless"); await until(() => noteAt(0, c.p).length === 1, 6000); },
				machine: c => ok(noteAt(0, c.p).length === 1 && bitsOf(0, "trig").includes(c.p) && bitsOf(0, "amp").includes(c.p), `notes ${noteAt(0, c.p)}`), screen: c => ok(noteSpans(0).find(sp => sp.s === c.p)?.pitchless === false, "still pitchless"), within: 8000 },
			{ say: "a trig with no pitch of its own (envelope trigs only: its note is the one before): step menu > Envelopes > Amp: the amp trig flips, the step stays without a pitch", act: async (u, c) => {
					/* a pitchless trig of the pattern (the machine's own patterns and backups hold them), or one made with the step
					   menu's Pitchless trig (B-152) on a free step after a note */
					let found = [0, 1, 2, 3, 4, 5].map(t => [t, noteSpans(t).find(sp => sp.pitchless && sp.st.a)]).find(([, sp]) => sp);
					if (!found) { const s0 = freeSteps(0, 3, (c.s ?? 0) + 1).find(x => x !== c.e && x !== c.p && x > (c.s ?? 0)); if (s0 == null) throw new Error("no free step for a pitchless trig");
						if (S().stepSel) clearSel(); await stepPick(u, 0, s0, "step-pitchless"); await until(() => noteSpans(0).some(sp => sp.s === s0 && sp.pitchless), 6000);
						found = [0, noteSpans(0).find(sp => sp.s === s0 && sp.pitchless && sp.st.a)]; if (!found[1]) throw new Error("the pitchless trig did not come"); } c.pt = found[0]; c.ps = found[1].s; u.click(rail(c.pt)); await sleep(300);
					c.a0 = bitsOf(c.pt, "amp").includes(c.ps); await envPick(u, c.pt, c.ps, "a"); await until(() => bitsOf(c.pt, "amp").includes(c.ps) !== c.a0, 4000); },
				machine: c => ok(bitsOf(c.pt, "amp").includes(c.ps) !== c.a0 && bitsOf(c.pt, "trig").includes(c.ps) && !noteAt(c.pt, c.ps).length, `amp ${bitsOf(c.pt, "amp").includes(c.ps)}, notes ${noteAt(c.pt, c.ps)}`), screen: c => ok(noteSpans(c.pt).find(sp => sp.s === c.ps)?.pitchless === true, "span"), within: 6000 }
		],
		async tidy(u, c) { if (DeskMenu.shown) closeDeskMenu(); if (S().stepSel) clearSel(); await back(u, c); }
	};
	/* the keys that play: the home row on the selected track's channel, velocity C and V, octave Z and X; the roll's pitch, an octave by drag, a chord, a note gone */
	const noteWires = n0 => nonSys(n0).filter(w => w.kind === "note").map(w => w.b);
	/* on the firmware (no wire, I-027) the notes are the keyboard's commands, as the core puts them on the track's channel */
	const playKey = async (u, k) => { if (Journey.noWire()) { const n0 = noteCmds.seq, after = () => noteCmds.filter(m => m.seq > n0); blur(); u.key(k); await until(() => after().length >= 2, 2000); await sleep(100); return after().map(m => m.on ? [0x90 | (baseCh() + m.t), m.pitch, m.vel] : [0x80 | (baseCh() + m.t), m.pitch, 0]); }
		const w0 = wireSeq; blur(); u.key(k); await until(() => noteWires(w0).length >= 2, 2000); await sleep(100); return noteWires(w0); };
	const pitchKeys = {
		name: "mm-seq-pitch-keys", proves: ["MM-028", "MM-034", "MM-074", "MM-077", "MM-173", "MM-174", "MM-176", "MM-348"],
		steps: [
			go("seq"), sel(0), { say: "click three rows of the roll: each note has the pitch of the row it was clicked in", act: async (u, c) => { c.n0 = histN(); const p0 = rollPitch(0, 0, rollCell(0, 0).n); c.pitches = [p0.lo + 2, Math.floor((p0.lo + p0.hi) / 2), p0.hi - 2]; c.steps = c.pitches.map((pt, k) => freeSteps(0, 1, 6 + k * 3, pt)[0]); if (c.steps.some(s => s == null)) throw new Error("no free steps");
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
					let w = await playKey(u, "a"); const base = w[0]?.[1]; if (base == null) c.bad.push("A: " + JSON.stringify(w)); c.vel0 = w[0]?.[2];
					blur(); u.key("v"); blur(); u.key("v"); w = await playKey(u, "a"); if (!(w[0]?.[0] === ch && w[0][2] === 127 && w[1]?.[0] === off && w[1][1] === w[0][1] && w[1][2] === 0)) c.bad.push("at 127: " + JSON.stringify(w));
					blur(); u.key("c"); blur(); u.key("c"); w = await playKey(u, "a"); if (!(w[0]?.[0] === ch && w[0][2] === 80)) c.bad.push("at 80: " + JSON.stringify(w)); c.base = base; },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 },
			{ say: "X raises the octave: A plays an octave higher; Z twice: an octave lower than the start", act: async (u, c) => { c.bad = []; blur(); u.key("x"); let w = await playKey(u, "a"); if (w[0]?.[1] !== c.base + 12) c.bad.push("octave +1: " + JSON.stringify(w) + " from " + c.base);
					blur(); u.key("z"); blur(); u.key("z"); w = await playKey(u, "a"); if (w[0]?.[1] !== c.base - 12) c.bad.push("octave -1: " + JSON.stringify(w)); blur(); u.key("x"); },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 },
			{ say: "each of the six tracks, picked on the rail, plays from A on its own channel, and its first SYN value moves on that channel (a track whose machine has none, GND-GND, only plays)", act: async (u, c) => { c.bad = []; c.synN = 0; for (let t = 0; t < 6; t++) { u.click(rail(t)); await sleep(200); const w = await playKey(u, "a"); if (w[0]?.[0] !== (0x90 | (baseCh() + t))) c.bad.push(`T${t + 1}: ${JSON.stringify(w)}`);
					u.click(tab("sound")); await sleep(300); const i = [0, 1, 2, 3, 4, 5, 6, 7].find(k => box("SYN", k)); if (i != null) { const e = checkBox(await nudgeBox(u, t, "SYN", i), t, "SYN", i); if (e) c.bad.push(`T${t + 1} SYN: ${e}`); else c.synN++; }
					u.click(tab("seq")); await sleep(300); } },
				screen: c => ok(!c.bad.length && c.synN >= 3, c.bad.join(" | ") + " SYN proven on " + c.synN + " tracks"), within: 1000 }
		],
		async tidy(u, c) { /* the keyboard velocity steps 20 40 60 80 100 127: to the top, then down to where the first A played it */ if (c.vel0) { const steps = [20, 40, 60, 80, 100, 127], i0 = steps.indexOf(c.vel0); for (let k = 0; k < 5; k++) { blur(); u.key("v"); } for (let k = 5; k > i0 && i0 >= 0; k--) { blur(); u.key("c"); } } await back(u, c); }
	};
	/* ---- Parameter locks: the seven data pages of the lane picker, a value on every step, the pool of 62, live recording ---- */
	const laneTabs = () => $all("[data-lpage]").map(b => b.textContent.trim());
	const lockList = () => (patDoc()?.locks || []);
	const lockVals = (t, pg, pi) => { const l = lockList().find(x => x.track === t && x.page === pg && x.param === pi); return l ? l.steps.slice().sort((a, b) => a[0] - b[0]) : []; };
	/* pick lane (page, index) of the selected track and draw one lock on step s at height fy */
	const drawLock = async (u, g, i, s, fy) => { u.click(`[data-lpage="${g}"]`); await sleep(30); u.click(`.pk[data-lane="${g}.${i}"]`); await sleep(30); const key = `#lane .lb[data-s="${s}"]`; await u.drag(key, [[0, -1]], {}, { fy: Journey.awayFromLine($1(key), fy), settle: 40, stepMs: 10 }); };
	const locksJ = {
		name: "mm-seq-locks", proves: ["MM-017", "MM-113", "MM-205", "MM-206", "MM-208"],
		steps: [
			go("seq"), sel(0),
			{ say: "the lock lane's picker has the seven data pages in order; each lists that page's own values; LEV is on none of them (it is not lockable)", act: async (u, c) => { c.bad = []; if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); await sleep(200);
					if (laneTabs().join(" ") !== "SYN AMP FLT EFX LF1 LF2 LF3") c.bad.push("tabs " + laneTabs().join(" "));
					for (const g of PAGES) { u.click(`[data-lpage="${g}"]`); await sleep(60); const names = $all(".pkcol .pk[data-lane]").map(b => (b.querySelector(".pkn") || b).textContent.trim());	/* the name, not its lock count (SUB1 keeps its 1) */ const want = pnames(0, g).filter(Boolean);
						if (names.join(" ") !== want.join(" ")) c.bad.push(`${g}: ${names.join(" ")} (page: ${want.join(" ")})`); if (names.some(n => /^LEV/.test(n))) c.bad.push(g + " lists LEV"); if (S().lanePage !== g || $1(`[data-lpage="${g}"]`).getAttribute("aria-pressed") !== "true") c.bad.push("tab " + g + " not lit"); } },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 },
			{ say: "lock AMP ATK on three trigs, each drawn at its own height: three different values, the higher the bar the higher the value", act: async (u, c) => { c.n0 = histN(); c.t = [0, 1, 2, 3, 4, 5].find(t => trigsOf(t).length >= 3); u.click(rail(c.t)); await sleep(300); if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); await sleep(200);
					c.on = trigsOf(c.t).filter(s => s < S().len).slice(0, 3); await drawLock(u, "AMP", 0, c.on[0], 0.2); await drawLock(u, "AMP", 0, c.on[1], 0.5); await drawLock(u, "AMP", 0, c.on[2], 0.8); await sleep(500); c.v = lockVals(c.t, 1, 0); },
				machine: c => ok(c.v.length === 3 && c.v[0][1] > c.v[1][1] && c.v[1][1] > c.v[2][1] && c.v.every(([s], k) => s === c.on[k]), "locks " + JSON.stringify(c.v)), within: 8000 },
			{ say: "draw the middle step again, higher: only its value changes (edited in the grid afterwards)", act: async (u, c) => { c.before = c.v.map(x => x.slice()); await u.drag(`#lane .lb[data-s="${c.on[1]}"]`, [[0, -1]], {}, { fy: 0.1, settle: 40, stepMs: 10 }); await sleep(500); c.v2 = lockVals(c.t, 1, 0); },
				machine: c => ok(c.v2.length === 3 && c.v2[1][1] > c.before[1][1] && c.v2[0][1] === c.before[0][1] && c.v2[2][1] === c.before[2][1], `before ${JSON.stringify(c.before)}, after ${JSON.stringify(c.v2)}`), within: 8000 },
			{ say: "lock parameter after parameter across the tracks until the pattern holds 62: the LCD counts them all (the pool is the pattern's, not a track's)", act: async (u, c) => { c.fill = []; c.tr = new Set();
					/* the pattern may hold locks already (the firmware's factory patterns do): what is left is spread over at least two tracks */
					c.start = lockList().length; const cap = Math.max(1, Math.ceil((62 - c.start) / 2));
					outer: for (let t = 0; t < 6; t++) { if (trigsOf(t).length < 1) continue; let added = 0; u.click(rail(t)); await sleep(150); if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); const s = trigsOf(t).find(x => x < S().len); if (s == null) continue;
						for (const g of PAGES) for (const [i, nm] of pnames(t, g).entries()) { if (!nm) continue; if (lockList().length >= 62) break outer; if (added >= cap) continue; if (lockVals(t, PAGES.indexOf(g), i).length) continue; const n = lockList().length; await drawLock(u, g, i, s, 0.4); if (!await until(() => lockList().length === n + 1, 3000)) { c.fill.push(`T${t + 1} ${g}.${i}: ${lockList().length}`); break outer; } c.tr.add(t); added++; } }
					await sleep(300); c.n = lockList().length; c.lcd = $1("#lockn").textContent; },
				machine: c => ok(c.n === 62 && !c.fill.length && c.tr.size >= Math.min(2, 62 - c.start), `${c.n} locked parameters (${c.start} before) on ${c.tr.size} tracks ${c.fill.join(" ")}`), screen: c => ok(c.lcd === "62/62" && $1("#meter").classList.contains("full"), `LCD ${c.lcd}, meter ${$1("#meter").className}`), within: 1000 },
			{ say: "a 63rd parameter is refused: the machine keeps 62, the page says all are in use", act: async (u, c) => { const t = [0, 1, 2, 3, 4, 5].find(x => trigsOf(x).length && [...PAGES].some(g => pnames(x, g).some((nm, i) => nm && !lockVals(x, PAGES.indexOf(g), i).length))); u.click(rail(t)); await sleep(200); const g = PAGES.find(g => pnames(t, g).some((nm, i) => nm && !lockVals(t, PAGES.indexOf(g), i).length)), i = pnames(t, g).findIndex((nm, i) => nm && !lockVals(t, PAGES.indexOf(g), i).length); c.n1 = lockList().length; c.g63 = g; c.i63 = i;
					await drawLock(u, g, i, trigsOf(t).find(x => x < S().len), 0.4); await sleep(800); },
				screen: () => ok(/All 62 locked parameters are in use/.test($1("#toast")?.textContent || ""), "toast " + $1("#toast")?.textContent), machine: c => ok(lockList().length === 62 && c.n1 === 62, "locks " + lockList().length), within: 6000 },
			{ say: "click Ramp up on the lane toolbox of that free lane: refused the same way, nothing written, the machine still holds 62", act: async (u, c) => { u.click(`[data-lpage="${c.g63}"]`); await sleep(200); u.click(`[data-lane="${c.g63}.${c.i63}"]`); await sleep(300); u.click(".xlane [data-xs=up]"); await sleep(800); },
				screen: () => ok(/All 62 locked parameters are in use/.test($1("#toast")?.textContent || ""), "toast " + $1("#toast")?.textContent), machine: c => ok(lockList().length === 62 && c.n1 === 62, "locks " + lockList().length), within: 6000 }
		],
		async tidy(u, c) { await back(u, c); }
	};
	/* LIVE RECORDING: a value turned while the pattern plays is locked on the step that plays (the firmware does it; the page names it) */
	const recLocks = {
		name: "mm-seq-record-locks", proves: ["MM-082", "MM-207"],
		steps: [
			go("sound"), sel(0),
			{ say: "press Alt+Space: live recording, playing", act: (u, c) => { c.p0 = pat0(); c.l0 = lockList().length; blur(); results.length = 0; u.key(" ", { alt: true }, "Space"); },
				machine: () => ok(tele.last?.record === "live" && tele.last?.playing, `record ${tele.last?.record}, playing ${tele.last?.playing}`), within: 8000 },
			{ say: "turn AMP's DEC on Kit: the CC goes to the machine on track 1's channel, the page says which step it locks", act: async (u, c) => { c.r = await nudgeBox(u, 0, "AMP", 2); await sleep(300); c.toast = $1("#toast")?.textContent || ""; c.cell = c.r.v1; },
				machine: c => ok(!checkBox(c.r, 0, "AMP", 2) && /Locks T1 AMP DEC on step \d+/.test(c.toast), `${checkBox(c.r, 0, "AMP", 2) || ""} toast "${c.toast}"`), within: 6000 },
			{ say: "click RECORD off, then STOP: the pattern holds a lock of AMP DEC, with the value turned, on a step of track 1", act: async (u, c) => { u.click("#rec"); await sleep(800); if (S().playing) u.click("#play"); await sleep(1500); },
				machine: c => { const l = lockVals(0, 1, 2); return ok(l.length >= 1 && l.some(([, v]) => v === c.cell), `locks ${JSON.stringify(l)}, value turned ${c.cell}`); }, within: 10000 },
			go("seq"),
			{ say: "on Pattern the lane picker counts the lock the recording made on AMP DEC; the lane's clear key takes it away", act: async (u, c) => { if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); await sleep(200); u.click('[data-lpage="AMP"]'); await sleep(60); u.click('.pk[data-lane="AMP.2"]'); await sleep(300); c.has = $1('.pk[data-lane="AMP.2"]')?.classList.contains("has") && +$1('.pk[data-lane="AMP.2"] i')?.textContent >= 1; u.click("#clearLane"); await sleep(600); },
				screen: c => ok(c.has, "AMP DEC in the picker has no locked step"), machine: () => ok(lockVals(0, 1, 2).length === 0, "locks " + JSON.stringify(lockVals(0, 1, 2))), within: 8000 }
		],
		async tidy(u, c) { if (tele.last?.record && tele.last.record !== "off") u.click("#rec"); await sleep(400); if (S().playing) u.click("#play"); await sleep(800); await back(u, c); if (c.p0) await undoUntil(u, () => pat0() === c.p0, 4); const n0 = c.l0; if (n0 != null && lockList().length !== n0) { for (const l of lockList().slice()) if (l.track === 0 && l.page === 1 && l.param === 2) Bridge.send({ op: "clearLane", p: cur(), t: 0, page: 1, i: 2 }); await sleep(800); } }
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
			{ say: "the arp's cells (only its length is drawn): a click mutes step 3 (255) and again brings it back; a drag up to the top and past it gives +24, down to the bottom -24; the LEN box sets how many are drawn, 16 too, and a double-click gives 8", act: async (u, c) => { c.bad = []; const cell = k => `.arptrack .ac[data-ac="${k}"]`; u.click(rail(0)); await sleep(200); const was = arpOf(0).steps[2], mute0 = was === 255;
					u.click(cell(2)); if (!await until(() => (arpOf(0).steps[2] === 255) !== mute0, 3000)) c.bad.push("mute: " + arpOf(0).steps[2]); u.click(cell(2)); if (!await until(() => (arpOf(0).steps[2] === 255) === mute0, 3000)) c.bad.push("unmute: " + arpOf(0).steps[2]);
					const k0 = Math.min(3, arpOf(0).length - 1); await u.drag(cell(k0), [[0, -60], [0, -120], [0, -240]]); if (!await until(() => arpOf(0).steps[k0] === 64 + 24, 3000)) c.bad.push("+24: " + arpOf(0).steps[k0]);
					await u.drag(cell(k0), [[0, 60], [0, 120], [0, 240], [0, 400]]); if (!await until(() => arpOf(0).steps[k0] === 64 - 24, 3000)) c.bad.push("-24: " + arpOf(0).steps[k0]);
					const lenBox = '.pc[data-g="arp"][data-n="len"]', setLen = async n => { u.click(lenBox, { cmd: true }); await until(() => !!field(), 1500); typeIn(u, String(n)); if (!await until(() => arpOf(0).length === n, 3000)) c.bad.push(`LEN ${n}: ${arpOf(0).length}`); await sleep(150); if ($all(".arptrack .ac").length !== n) c.bad.push(`${$all(".arptrack .ac").length} steps drawn, LEN ${n}`); };
					const L = arpOf(0).length; await setLen(L === 6 ? 5 : 6); await setLen(16); await setLen(L);
					u.dblclick(lenBox); await sleep(300); if (arpOf(0).length !== 8) c.bad.push("double-click: LEN " + arpOf(0).length); },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 }
		],
		async tidy(u, c) { if (S().side === "midi") u.click('[data-side="int"]'); if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); await back(u, c); }
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
		async tidy(u, c) { if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); await back(u, c); }
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
		async tidy(u, c) { if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); await back(u, c); }
	};
	/* ---- The MIDI sequencer: six tracks of its own, their notes, chords, VEL PB PCHG and CC values, their channels and CC numbers (the MIDI sequencer chapter) ---- */
	const midiNotesAt = (m, s) => (patDoc()?.midiNotes || []).filter(e => e[0] === m && e[1] === s).map(e => e[2]);
	const mDoc = m => patDoc().midiTracks[m];
	const midiSeqJ = {
		name: "mm-midi-seq", proves: ["MM-003", "MM-048", "MM-086", "MM-242", "MM-244", "MM-245", "MM-246", "MM-247", "MM-249", "MM-314", "MM-315"],
		steps: [
			go("seq"), sel(0), { say: "click MIDI: the rail has the six MIDI tracks M1 to M6, each its own roll", act: async (u, c) => { c.n0 = histN(); u.click('[data-side="midi"]'); await sleep(400); c.names = $all("#rail .th .nm").length; },
				screen: () => ok(S().side === "midi" && S().sel >= 6 && [6, 7, 8, 9, 10, 11].every(t => !!$1(rail(t))), `side ${S().side}, track ${S().sel}`), within: 6000 },
			{ say: "click a note into each of the six MIDI tracks: that track's notes change, no other track's, no synth track's", act: async (u, c) => { c.bad = []; c.where = [];
					for (let m = 0; m < 6; m++) { u.click(rail(6 + m)); await sleep(250); const before = JSON.stringify([patDoc().tracks, patDoc().midiTracks.filter((x, i) => i !== m)]);
						const s = [...Array(S().len).keys()].find(x => x >= 8 && !mDoc(m).trig.includes(x) && !S().midi[m].steps[x] && !underBar(6 + m, x, rollCell(6 + m, 0).n)); if (s == null) { c.bad.push(`M${m + 1}: no free step`); continue; } const p = rollCell(6 + m, s); u.click(p.c, {}, p.fx, p.fy);
						if (!await until(() => mDoc(m).trig.includes(s), 4000)) { c.bad.push(`M${m + 1}: no note at ${s + 1}`); continue; } await sleep(200); c.where.push(s);
						if (JSON.stringify([patDoc().tracks, patDoc().midiTracks.filter((x, i) => i !== m)]) !== before) c.bad.push(`M${m + 1}: another track changed`); } },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), machine: c => ok(c.where.length === 6, c.where.length + " of 6"), within: 1000 },
			{ say: "Shift-click another pitch on M1's note: a chord, one length for all its notes (LEN is a lock of the step, one value)", act: async (u, c) => { u.click(rail(6)); await sleep(250); c.s = c.where[0]; const p0 = rollCell(6, c.s); c.p1 = p0.n + 3; const p = rollPitch(6, c.s, c.p1); u.click(p.c, { shift: true }, p.fx, p.fy); await until(() => midiNotesAt(0, c.s).length >= 2, 4000); await sleep(300); Journey.snapshot("mm-midi-roll"); },
				machine: c => ok(midiNotesAt(0, c.s).length >= 2 && midiNotesAt(0, c.s).includes(c.p1), `notes ${midiNotesAt(0, c.s)}`), screen: c => ok(S().midi[0].steps[c.s]?.n?.length >= 2, "page " + JSON.stringify(S().midi[0].steps[c.s])), within: 8000 },
			{ say: "the MIDI page's locks: VEL, PB and PCHG drawn on the note's step: each is a lock of the MIDI page (page 8 of the lane picker) on that step; PCHG is only sent when locked", act: async (u, c) => { c.bad = []; if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); await sleep(200); const t = 6;
					for (const [i, nm] of [[1, "VEL"], [2, "PB"], [3, "PCHG"]]) { u.click(`.pk[data-lane="MID.${i}"]`); await sleep(100); await u.drag(`#lane .lb[data-s="${c.s}"]`, [[0, -1]], {}, { fy: 0.3, settle: 40, stepMs: 10 }); if (!await until(() => lockVals(0, 7, i).some(([s]) => s === c.s), 4000)) c.bad.push(`${nm}: no lock`); }
					c.help = $1(".lanehelp")?.title || $1(".lanehelp")?.textContent || ""; await dockOpen(u, "midi"); c.help2 = ($1(".dkhelp")?.title || "") + ($1(".dkhelp")?.textContent || ""); },
				screen: c => ok(!c.bad.length && /PCHG only sends when it is locked/.test(c.help2), c.bad.join(" | ") + " help: " + c.help2.slice(0, 100)), within: 1000 },
			{ say: "CL1 typed CC74 and CL2 typed AFT: the global holds the CC number and 128 for AFT, on M1 only", act: async (u, c) => { c.cc0 = JSON.stringify(gDoc().midiSeq.ccs); const q = i => `.pc[data-g="cc"][data-n="${i}"]`; u.click(q(0), { cmd: true }); typeIn(u, "cc74"); await until(() => gDoc().midiSeq.ccs[0][0] === 74, 6000); u.click(q(1), { cmd: true }); typeIn(u, "aft"); await until(() => gDoc().midiSeq.ccs[0][1] === 128, 6000); c.now = gDoc().midiSeq.ccs; },
				machine: c => ok(c.now[0][0] === 74 && c.now[0][1] === 128 && c.now.slice(1).every((x, k) => same(x, JSON.parse(c.cc0)[k + 1])), "ccs " + JSON.stringify(c.now)), screen: () => ok($1('.pc[data-g="cc"][data-n="1"] b')?.textContent === "AFT" && $1('.pc[data-g="cc"][data-n="0"] b')?.textContent === "CC74", "boxes " + $1('.pc[data-g="cc"][data-n="0"] b')?.textContent + " " + $1('.pc[data-g="cc"][data-n="1"] b')?.textContent), within: 14000 },
			{ say: "the Channel keys: channel 4 for M1: the global holds it for that track only", act: async (u, c) => { c.ch0 = gDoc().midiSeq.channels.slice(); u.click('[data-set="mch"] button[data-v="4"]'); await until(() => gDoc().midiSeq.channels[0] === 3, 8000); c.now = gDoc().midiSeq.channels; },
				machine: c => ok(c.now[0] === 3 && c.now.slice(1).every((x, k) => x === c.ch0[k + 1]), "channels " + c.now), screen: () => ok(pressed('[data-set="mch"] button[data-v="4"]'), "key not lit"), within: 12000 },
			{ say: "a MIDI page value is the kit's: VEL on M1 raised, the kit is edited, saved to its slot the slot holds it", act: async (u, c) => { const el = box("MID", 1); const v0 = wk().tracks[0].pages[7][1], mx = maxOf(ref(el)[2]); c.v0 = v0; el.focus(); u.key(v0 >= mx ? "ArrowDown" : "ArrowUp"); await until(() => wk().tracks[0].pages[7][1] !== v0, 4000); c.v1 = wk().tracks[0].pages[7][1]; c.ed = machine().kit?.working;
					u.click("#kitf"); await sleep(300); u.click('#libpop [data-la="save"]'); await answer(u, c); await until(() => I().doc("kit", machine().kit.current)?.tracks[0].pages[7][1] === c.v1, 8000); u.key("Escape"); },
				machine: c => ok(c.ed === "edited" && I().doc("kit", machine().kit.current)?.tracks[0].pages[7][1] === c.v1, `working ${c.ed}, stored ${I().doc("kit", machine().kit.current)?.tracks[0].pages[7][1]} for ${c.v1}`), within: 14000 }
		],
		async tidy(u, c) { if ($1("#libpop") && !$1("#libpop").hidden) u.key("Escape"); if (c.ch0 && gDoc()?.midiSeq.channels[0] !== c.ch0[0]) { u.click(`[data-set="mch"] button[data-v="${c.ch0[0] + 1}"]`); await sleep(1200); } if (c.cc0 && JSON.stringify(gDoc()?.midiSeq.ccs) !== c.cc0) { const q = i => `.pc[data-g="cc"][data-n="${i}"]`; const o = JSON.parse(c.cc0)[0]; for (const i of [0, 1]) { u.click(q(i), { cmd: true }); typeIn(u, o[i] === 128 ? "aft" : "cc" + o[i]); await sleep(1200); } } if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); if (S().side === "midi") u.click('[data-side="int"]'); await back(u, c); }
	};
	/* a MIDI track has no trig tracks (its ENV row is VEL), no envelope switches on its arpeggiator, but swing, slide and transpose */
	const midiDocks = {
		name: "mm-midi-seq-docks", proves: ["MM-248"],
		steps: [
			go("seq"), sel(0),
			{ say: "on M1: the row under the roll is VEL, with no envelope entries anywhere", act: async (u, c) => { c.n0 = histN(); u.click('[data-side="midi"]'); await sleep(400); u.click(rail(6)); await sleep(300); },
				screen: () => ok(/VEL/.test($1(".tlane.env .tlab")?.textContent || "") && !$1("[data-env]") && S().sel === 6, "row " + $1(".tlane.env .tlab")?.textContent), within: 6000 },
			{ say: "Cmd-drag four steps of M1's roll, ⋯ > Slide: those steps slide on M1; right-click a step > Swing: its swing flips", act: async (u, c) => { c.s0 = [...Array(S().len - 3).keys()].find(s => [0, 1, 2, 3].every(k => !(mDoc(0).slide || []).includes(s + k))); c.run = [0, 1, 2, 3].map(k => c.s0 + k);
					if (S().stepSel) clearSel(); await dragRoll(u, 6, c.run, { cmd: true }); await until(() => S().stepSel?.from === c.s0 && S().stepSel?.to === c.s0 + 4, 2000); await stepPick(u, 6, null, "step-slide"); await until(() => c.run.every(s => (mDoc(0).slide || []).includes(s)), 6000);
					c.env = !$1('#deskmenu [data-mid="step-env"]'); if (S().stepSel) clearSel(); c.w = c.run[0]; c.w0 = (mDoc(0).swing || []).includes(c.w); await stepPick(u, 6, c.w, "step-swing"); await until(() => (mDoc(0).swing || []).includes(c.w) !== c.w0, 6000); if (S().stepSel) clearSel(); },
				machine: c => ok(c.run.every(s => (mDoc(0).slide || []).includes(s)) && (mDoc(0).swing || []).includes(c.w) !== c.w0, `slide ${mDoc(0).slide}, swing ${mDoc(0).swing}`), within: 20000 },
			{ say: "Transpose: TRACK typed +3, the pattern holds 3 for M1; the Arp tab says there are no envelope switches on MIDI", act: async (u, c) => { await dockOpen(u, "trn"); const q = '#main .pc[data-g="trn"][data-n="TRACK"]'; u.click(q, { cmd: true }); typeIn(u, "+3"); await until(() => mDoc(0).transpose === 3, 6000); await dockOpen(u, "arp"); c.none = $all("[data-arptrig]").length === 0 && /none on MIDI/.test($1(".dkna")?.textContent || ""); },
				machine: c => ok(mDoc(0).transpose === 3 && c.none, `transpose ${mDoc(0).transpose}, no switches ${c.none}`), within: 10000 }
		],
		async tidy(u, c) { if (DeskMenu.shown) closeDeskMenu(); if (S().stepSel) clearSel(); if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); if (S().side === "midi") u.click('[data-side="int"]'); await back(u, c); }
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
					const ch3 = gch().base + 2; if (!(m.length === 2 && m[0][0] === (0x90 | ch3) && m[0][1] === 60 && m[0][2] > 0 && m[1][0] === (0x80 | ch3) && m[1][1] === 60)) c.bad.push("Auto track: " + JSON.stringify(m)); if (!/^T3 /.test(c.info)) c.bad.push("info " + c.info); },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 },
			{ say: "Multi trig, each of its four modes: one source plays all six tracks, so one note on the MULTI TRIG channel (7), whatever the mode", act: async (u, c) => { c.bad = []; u.click('[data-pmode="multi"]'); await sleep(400); c.m0 = wk().multiTrig.mode;
					for (let i = 0; i < 4; i++) { u.click(`[data-set="mtmode"] button[data-v="${i}"]`); if (!await until(() => wk().multiTrig.mode === i, 4000)) { c.bad.push("mode " + i); continue; } const m = await keyMsgs(u); if (!(m.length === 2 && m[0][0] === (0x90 | gch().multiTrig) && m[0][1] === 60)) c.bad.push(`mode ${i}: ${JSON.stringify(m)}`); }
					c.info = $1("#kbinfo")?.textContent; if (!/MULTI TRIG · C-4 · MIDI channel 7$/.test(c.info)) c.bad.push("info " + c.info); },
				screen: c => ok(!c.bad.length && gch().multiTrig === 6, c.bad.join(" | ")), within: 1000 },
			{ say: "GLOBAL: MULTI TRIG channel + once: the keyboard plays on channel 8 now, in every mode", act: async (u, c) => { c.mt0 = gch().multiTrig; await stepGlobal(u, "multiTrig", 1); await until(() => gch().multiTrig === c.mt0 + 1, 15000); c.m = await keyMsgs(u); },
				machine: c => ok(gch().multiTrig === c.mt0 + 1 && c.m[0]?.[0] === (0x90 | (c.mt0 + 1)), `channel ${gch().multiTrig} (global ${machine().global?.current}, docs ${[0, 1, 2, 3, 4, 5, 6, 7].map(g => I().doc("global", g)?.channels?.multiTrig ?? "-").join(",")}), sent ${JSON.stringify(c.m)}, results ${results.filter(r => r.op === "globalMidi").slice(-2).map(r => r.ok + (r.errors?.length ? " " + r.errors.join(";") : "")).join(" ")}`), within: 20000 },
			{ say: "Multi map: the keyboard plays on the MULTI MAP channel (8); GLOBAL + once: channel 9", act: async (u, c) => { c.bad = []; u.click('[data-pmode="map"]'); await sleep(400); let m = await keyMsgs(u); if (m[0]?.[0] !== (0x90 | gch().multiMap)) c.bad.push("map: " + JSON.stringify(m)); c.mm0 = gch().multiMap; await stepGlobal(u, "multiMap", 1); await until(() => gch().multiMap === c.mm0 + 1, 15000); m = await keyMsgs(u); if (m[0]?.[0] !== (0x90 | (c.mm0 + 1))) c.bad.push("map +1: " + JSON.stringify(m)); c.info = $1("#kbinfo")?.textContent; },
				screen: c => ok(!c.bad.length && /MULTI MAP · C-4 · MIDI channel 9$/.test(c.info), c.bad.join(" | ") + " info " + c.info), within: 25000 },
			{ say: "Auto track channel: the page lights a key only for a held note on the AUTO channel (the journey hands the page the held note itself: it proves the page's filter, not what the machine sends back): a note on the next channel lights no key; GLOBAL + once, and the same note lights the key", act: async (u, c) => { c.au0 = gch().auto; u.click('[data-pmode="normal"]'); await sleep(300); const lit = ch => $1('.kb [data-key="60"]')?.classList.contains("mi");
					window.gm.recv([{ type: "midiHeld", notes: [{ ch: c.au0 + 1, note: 60 }] }]); await sleep(150); c.before = lit(); window.gm.recv([{ type: "midiHeld", notes: [] }]); await stepGlobal(u, "auto", 1); await until(() => gch().auto === c.au0 + 1, 15000); await sleep(300);
					window.gm.recv([{ type: "midiHeld", notes: [{ ch: c.au0 + 1, note: 60 }] }]); await sleep(150); c.after = lit(); window.gm.recv([{ type: "midiHeld", notes: [] }]); },
				screen: c => ok(gch().auto === c.au0 + 1 && c.before === false && c.after === true, `auto ${gch().auto}, lit before ${c.before}, after ${c.after}`), within: 20000 }
		],
		async tidy(u, c) { for (const [k, v] of [["multiTrig", c.mt0], ["multiMap", c.mm0], ["auto", c.au0]]) if (v != null && gch()?.[k] !== v) await stepGlobal(u, k, -1); window.gm.recv([{ type: "midiHeld", notes: [] }]); if ($1('[data-pmode="normal"]')) u.click('[data-pmode="normal"]'); await back(u, c); }
	};
	const performMulti = {
		name: "mm-perform-multi-setup", proves: ["MM-154", "MM-155", "MM-156", "MM-157", "MM-158", "MM-159", "MM-302", "MM-303"],
		steps: [
			go("perform"),
			{ say: "Multi trig: ALL TRK, SPLIT KEY, SEQ START, SEQ TRNSP in order, each the kit's mode; ALL TRK says every track keeps its own arpeggiator", act: async (u, c) => { c.bad = []; c.n0 = histN(); u.click('[data-pmode="multi"]'); await sleep(400); const names = $all('[data-set="mtmode"] button').map(b => b.textContent); if (names.join(" ") !== "ALL TRK SPLIT KEY SEQ START SEQ TRNSP") c.bad.push("keys " + names);
					for (let i = 0; i < 4; i++) { u.click(`[data-set="mtmode"] button[data-v="${i}"]`); if (!await until(() => wk().multiTrig.mode === i, 4000)) c.bad.push("mode " + i); if (i === 0) c.arp = $1(".kbhint")?.textContent || ""; } },
				screen: c => ok(!c.bad.length && /each keeps its own arpeggiator/.test(c.arp), c.bad.join(" | ") + " " + c.arp), within: 1000 },
			{ say: "SPLIT KEY: Upper from + moves the first upper track on, the split marker dragged to another key moves the split key; the hint names both zones", act: async (u, c) => { c.bad = []; u.click('[data-set="mtmode"] button[data-v="1"]'); await until(() => wk().multiTrig.mode === 1, 4000); await sleep(300); c.st0 = wk().multiTrig.splitTrack; const wantTrack = c.st0 < 5 ? c.st0 + 1 : 4; u.click(c.st0 < 5 ? '[data-strk="1"]' : '[data-strk="-1"]'); if (!await until(() => wk().multiTrig.splitTrack === wantTrack, 4000)) c.bad.push(`upper from ${wk().multiTrig.splitTrack} for ${wantTrack}`);
					c.k0 = wk().multiTrig.splitKey; await u.drag("#splitm", [[-60, 0], [-120, 0]]); await sleep(500); c.k1 = wk().multiTrig.splitKey; if (c.k1 >= c.k0) c.bad.push(`split key ${c.k0} -> ${c.k1}`); c.hint = $1(".kbhint")?.textContent || ""; },
				screen: c => ok(!c.bad.length && /^.*Keys from .* play T\d-T6, keys below play T1-T\d/.test(c.hint), c.bad.join(" | ") + " hint " + c.hint), within: 1000 },
			{ say: "SEQ START and SEQ TRNSP have a Timing stepper: from DIRECT through 1/16, 2/16, 4/16, 8/16, 16/16 to 32/16, the kit's timing", act: async (u, c) => { c.bad = []; u.click('[data-set="mtmode"] button[data-v="2"]'); if (!await until(() => wk().multiTrig.mode === 2 && S().multi.mode === 2, 15000)) { c.bad.push(`SEQ START not taken: kit ${wk().multiTrig.mode}, page ${S().multi.mode}`); return; } await sleep(300); const names = ["DIRECT", "1/16", "2/16", "4/16", "8/16", "16/16", "32/16"];
					/* B-107 (the 0.6 e2e run, "timing 0: 1"): the kit may hold another timing than DIRECT (a kit's own, or one a journey
					   before left): − down to DIRECT first */
					for (let i = 0; i < 7 && wk().multiTrig.timing > 0; i++) { const was = wk().multiTrig.timing; u.click('[data-tim="-1"]'); await until(() => wk().multiTrig.timing < was, 4000); }
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
		async tidy(u, c) { await back(u, c);	/* the kit's multi trig (mode, split, timing) */
			if (c.m0 != null) { /* the global's multi map, each column through its own box */ const m0 = JSON.parse(c.m0), mm = () => gDoc().multiMap; u.click('[data-pmode="map"]'); await sleep(500);
				if (mm()[1][0] !== m0[1][0]) { await choose(u, "mpat0", m0[1][0] === 255 ? -1 : m0[1][0]); await sleep(800); }
				for (const [r, n] of [[2, "ofs"], [3, "len"], [4, "trn"]]) if (mm()[r][0] !== m0[r][0]) { u.click(`.pc[data-g="mmap"][data-n="${n}"][data-i="0"]`, { cmd: true }); typeIn(u, String(r === 4 && m0[r][0] > 127 ? m0[r][0] - 256 : m0[r][0])); await until(() => mm()[r][0] === m0[r][0], 6000); }
				for (let k = 0; k < 40 && mm()[5][0] !== m0[5][0]; k++) { const t = mm()[5][0]; $1('.pc[data-g="mmap"][data-n="tim"][data-i="0"]')?.focus(); u.key("ArrowDown"); await until(() => mm()[5][0] !== t, 3000); } }
			u.click('[data-pmode="normal"]'); await sleep(300); }
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
			{ say: "MIRR on the JOY RL tab: track 1's bit of the kit's mirror mask flips; KEY has HPF and LPF keys, the same kind of mask", act: async (u, c) => { u.click('[data-set="astab"] button[data-v="JOY RL"]'); await sleep(250); const m0 = wk().trackMasks.mirror & 1; u.click("[data-mirr]"); await until(() => (wk().trackMasks.mirror & 1) !== m0, 4000); c.mir = (wk().trackMasks.mirror & 1) !== m0; c.m0 = m0; },
				machine: c => ok((wk().trackMasks.mirror & 1) !== c.m0, "mirror mask " + wk().trackMasks.mirror), screen: () => ok($1("[data-mirr]")?.getAttribute("aria-pressed") === String(!!(wk().trackMasks.mirror & 1)), "MIRR key"), within: 6000 },
			{ say: "Copy on the LCD takes track 1's assign tabs; on track 2 Paste puts them there (its own rows untouched where it has no box), Cmd+Z puts track 2's own back, Clr sets track 2's assign tabs to the factory ones (JOY RL starts on FLT, ADD +24 ...)", act: async (u, c) => { c.bad = []; const btn = n => $all(".lcdpanel button").find(b => b.textContent.trim() === n); const own = () => JSON.stringify(assignOf(1));
					c.t1 = own(); u.click(btn("Copy")); await sleep(500); c.copyToast = $1("#toast")?.textContent || ""; u.click('[data-set="astrk"] button[data-v="1"]'); await sleep(300); u.click(btn("Paste")); await sleep(1500);
					const a1 = assignOf(1), a0 = assignOf(0); c.pasted = Object.values(ASSIGN_ROWS).flat().every(i => ["page", "dest", "add"].every(f => a1[f][i] === a0[f][i])); const before = JSON.parse(c.t1); c.leftKept = [2, 3].every(i => ["page", "dest", "add"].every(f => a1[f][i] === before[f][i]));
					blur(); u.key("z", { cmd: true }); await until(() => own() === c.t1, 6000); c.undone = own() === c.t1;
					u.click(btn("Clr")); await sleep(800); if (dlgShown()) u.click($1("#dlg .danger") || dlgButton("Clear")); await sleep(1500); const ac = assignOf(1), def = newAssign(); c.cleared = Object.entries(ASSIGN_ROWS).every(([tb, idx]) => idx.every((i, k) => ac.page[i] === def.tabs[tb][k].pg && ac.dest[i] === def.tabs[tb][k].d && ac.add[i] === def.tabs[tb][k].add - 64)); c.clrToast = $1("#toast")?.textContent || ""; blur(); u.key("z", { cmd: true }); await until(() => own() === c.t1, 6000); },
				screen: c => ok(/Copied the assign tabs of T1/.test(c.copyToast) && c.pasted && c.leftKept && c.undone && c.cleared, `copy "${c.copyToast}", pasted ${c.pasted}, left rows kept ${c.leftKept}, undone ${c.undone}, cleared ${c.cleared} "${c.clrToast}"`), within: 1000 }
		],
		async tidy(u, c) { await back(u, c); u.click('[data-set="astrk"] button[data-v="0"]'); }
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
						if (Journey.pageTier()) await until(() => nonSys(w0).filter(w => w.kind === "nrpn").length >= 18, 3000); const v = wk().tracks[0].multiEnv[i], m = nonSys(w0).filter(w => w.kind === "nrpn").map(w => w.b);
						const ok6 = m.length === 18 && [0, 1, 2, 3, 4, 5].every(t => { const g = m.slice(t * 3, t * 3 + 3); return g.every(b => b[0] === (0xb0 | baseCh())) && g[0][1] === 99 && g[0][2] === t && g[1][1] === 98 && g[1][2] === 0x40 + i && g[2][1] === 6 && g[2][2] === v; });
						if ((!ok6 && !Journey.noWire()) || !wk().tracks.every(t => t.multiEnv[i] === v)) c.bad.push(`${n}: ${m.map(b => b.join(" ")).join(" | ").slice(0, 160)}`); } },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 }
		],
		async tidy(u, c) { await back(u, c); }
	};
	/* ---- Song: the selected row's settings, the commands and the rows' marks (the song mode chapter) ---- */
	const rowI = () => S().songSel;
	const rowDoc = () => songDoc()?.rows[rowI()];
	/* the marks a row's cell shows under its pattern name (its <small>: x2, the tempo, M1, +2, T±, ~) and what it says in big (its <b>: the pattern, HALT) */
	const cellMarks = i => ($1(`#tl .scell[data-i="${i}"] small .rt`)?.textContent ?? $1(`#tl .scell[data-i="${i}"] small`)?.textContent ?? "").replace(/\s+/g, " ").trim();
	const cellName = i => ($1(`#tl .scell[data-i="${i}"] b`)?.textContent || "").trim();
	const hasMark = (marks, m) => new RegExp(`(^| )${m.replace("+", "\\+")}( |$)`).test(marks);
	/* a row edit is a song dump through SYSEX RECV and its read-back: the next edit waits for it */
	const songSettled = async () => { await until(() => (I().machine?.recv?.state === "idle" && !I().machine?.recv?.sending), 20000); await sleep(600); };
	const stepRow = async (u, k, d, field, get) => { const v0 = get(); u.click(`[data-step="${k}"][data-d="${d}"]`); await until(() => get() !== v0, 6000); await songSettled(); return [v0, get()]; };
	const songRowSettings = {
		name: "mm-song-row-settings", proves: ["MM-170", "MM-199", "MM-260", "MM-263", "MM-264", "MM-265", "MM-267", "MM-273", "MM-274", "MM-275"],
		steps: [
			go("song"),
			{ say: "SONG mode, add a row: the header counts the rows of the machine's song (END is the last of them), the grid has a cell for each", act: async (u, c) => { c.r0 = JSON.stringify(songDoc()?.rows); c.n0 = histN(); c.m0 = machine().song?.songMode === true; u.click('[data-set="songpick"] button[data-v="song"]'); await sleep(300); u.click('[data-addpat="2"]'); await until(() => JSON.stringify(songDoc()?.rows) !== c.r0, 8000); await sleep(400); c.i = rowI(); Journey.snapshot("mm-song-workspace"); Journey.snapshot("mm-song-what-plays"); },
				screen: () => ok(new RegExp(`^${S().song.length} of 200 rows`).test($1(".arrcard .note")?.textContent || "") && $all("#tl .scell:not(.empty)").length === S().song.length, `header "${$1(".arrcard .note")?.textContent}", cells ${$all("#tl .scell:not(.empty)").length}, rows ${S().song.length}`),
				machine: c => ok(songDoc().rows.length === S().song.length && songDoc().rows.length === JSON.parse(c.r0).length + 1 && songDoc().rows[songDoc().rows.length - 1].kind === "end", `doc ${songDoc().rows.length} rows, page ${S().song.length}, before ${JSON.parse(c.r0).length}`), within: 10000 },
			{ say: "Transpose + twice on the row: the song row holds 2 (pattern, all tracks) and its cell shows +2", act: async (u, c) => { u.click('[data-step="trn"][data-d="1"]'); await until(() => rowDoc().transpose === 1, 6000); await songSettled(); u.click('[data-step="trn"][data-d="1"]'); await until(() => rowDoc().transpose === 2, 6000); await songSettled(); c.mk1 = cellMarks(c.i); },
				machine: () => ok(rowDoc().transpose === 2, "transpose " + rowDoc().transpose), screen: c => ok(hasMark(c.mk1, "+2"), "cell " + c.mk1), within: 8000 },
			{ say: "More: each of the six synth tracks and the six MIDI tracks has a transpose of its own for the row (TR1 to TR6, six MIDI): + on track 3 and on MIDI track 2 move those only", act: async (u, c) => { if (!$1("[data-ttr]")) u.click("[data-rowmore]"); await sleep(300); c.bad = []; const t0 = rowDoc().trackTranspose.slice(), m0 = rowDoc().midiTranspose.slice(); const cnt = $all("[data-ttr]").length / 2;
					u.click('[data-ttr="2"][data-d="1"]'); await until(() => rowDoc().trackTranspose[2] === t0[2] + 1, 6000); await songSettled(); if (!same(rowDoc().trackTranspose.filter((v, k) => k !== 2), t0.filter((v, k) => k !== 2)) || !same(rowDoc().midiTranspose, m0)) c.bad.push("T3 moved others: " + rowDoc().trackTranspose);
					u.click('[data-ttr="7"][data-d="1"]'); await until(() => rowDoc().midiTranspose[1] === m0[1] + 1, 6000); await songSettled(); if (!same(rowDoc().midiTranspose.filter((v, k) => k !== 1), m0.filter((v, k) => k !== 1)) || rowDoc().trackTranspose[2] !== t0[2] + 1) c.bad.push("M2 moved others: " + rowDoc().midiTranspose); c.cnt = cnt; },
				screen: c => ok(!c.bad.length && c.cnt === 12, c.bad.join(" | ") + " keys " + c.cnt), within: 8000 },
			{ say: "Part: Offset + and Length −: the row plays a part of the pattern (its own length), the pattern keeps its length; Whole pattern puts both back", act: async (u, c) => { c.plen = patDoc()?.length; await stepRow(u, "ofs", 1, "offset", () => rowDoc().offset); const l = await stepRow(u, "len", -1, "length", () => rowDoc().length); c.part = [rowDoc().offset, rowDoc().length]; c.pat1 = JSON.stringify(I().doc("pattern", rowDoc().pattern)?.length); c.pat0 = I().doc("pattern", rowDoc().pattern)?.length;
					c.mk = cellMarks(c.i); u.click("[data-fullpat]"); await until(() => rowDoc().offset === 0 && rowDoc().length >= (I().doc("pattern", rowDoc().pattern)?.length || 16), 6000); c.whole = [rowDoc().offset, rowDoc().length]; },
				machine: c => ok(c.part[0] === 1 && c.part[1] < (c.pat0 || 99) && c.whole[0] === 0 && c.whole[1] === c.pat0, `part ${c.part}, whole ${c.whole}, pattern length ${c.pat0}`), within: 10000 },
			{ say: "Tempo: Keep off gives the row a tempo of its own (the current BPM), + raises it; the song stores it in the row and the cell shows the number", act: async (u, c) => { u.click("[data-bpmkeep]"); await until(() => rowDoc().tempo != null, 6000); await songSettled(); c.t0 = rowDoc().tempo; u.click('[data-step="bpm"][data-d="1"]'); await until(() => rowDoc().tempo !== c.t0, 6000); await songSettled(); c.mk2 = cellMarks(c.i); },
				machine: c => ok(rowDoc().tempo === c.t0 + 1 && c.t0 > 0, `tempo ${rowDoc().tempo} (was ${c.t0})`), screen: c => ok(hasMark(c.mk2, String(c.t0 + 1)), "cell " + c.mk2), within: 8000 },
			{ say: "Mutes: T1 muted for the row: the row's mute mask holds bit 0, the cell shows M1; its marks now the tempo, M1, +2 and T±", act: async (u, c) => { u.click('[data-rowmute="0"]'); await until(() => (rowDoc().mutes & 1) === 1, 6000); await songSettled(); c.mk3 = cellMarks(c.i); Journey.snapshot("mm-song-arrangement"); },
				machine: () => ok((rowDoc().mutes & 1) === 1, "mutes " + rowDoc().mutes), screen: c => ok(hasMark(c.mk3, "T±") && hasMark(c.mk3, "M1") && hasMark(c.mk3, String(c.t0 + 1)) && hasMark(c.mk3, "+2"), "cell " + c.mk3), within: 8000 },
			{ say: "Add loop, then JUMP: a forward jump, its target a later row (stepper +); then HALT: it pauses the playback, its target the row itself", act: async (u, c) => { c.bad = []; u.click('[data-rowact="loop"]'); await until(() => songDoc().rows.some(r => r.kind === "loop"), 6000); c.li = rowI(); await songSettled(); Journey.snapshot("mm-song-loop");
					u.click('[data-set="loopkind"] button[data-v="jump"]'); await songSettled(); if (!await until(() => songDoc().rows[c.li]?.kind === "jump", 6000)) c.bad.push("JUMP: " + songDoc().rows[c.li]?.kind); else { c.jt = songDoc().rows[c.li].target; if (!(c.jt > c.li)) c.bad.push(`JUMP target ${c.jt} not after row ${c.li}`); }
					u.click('[data-set="loopkind"] button[data-v="halt"]'); if (!await until(() => songDoc().rows[c.li]?.kind === "halt", 6000)) c.bad.push("HALT: " + songDoc().rows[c.li]?.kind); else if (songDoc().rows[c.li].target !== c.li) c.bad.push("HALT target " + songDoc().rows[c.li].target); await sleep(300); c.cell = cellName(c.li); },
				screen: c => ok(!c.bad.length && c.cell === "HALT", c.bad.join(" | ") + " cell " + c.cell), within: 10000 }
		],
		async tidy(u, c) { await back(u, c); if (c.r0) await undoUntil(u, () => JSON.stringify(songDoc()?.rows) === c.r0, 40); await sleep(300); { const more = $1("[data-rowmore]"); if (S().songMore && more) u.click(more); } if (c.m0 === false && machine().song?.songMode !== false) { u.click('[data-set="songpick"] button[data-v="pattern"]'); await sleep(1500); } }
	};
	/* 0.8 I-039: a row that holds a tempo, mutes or transpose says so in its cell (the small line: the tempo as a number, M and the count, +2, T± for a track of its own);
	   a plain row looks as ever, the cell keeps its height and the marks are not cut; clicking them opens Row > More. */
	const songRowMarks = {
		name: "mm-song-row-marks", proves: ["MM-199", "MM-263", "MM-264", "MM-266", "MM-267"],
		steps: [
			go("song"),
			{ say: "SONG mode, add a row (pad A03): its cell has no marks; remember its height", act: async (u, c) => { c.r0 = JSON.stringify(songDoc()?.rows); c.m0 = machine().song?.songMode === true; const n0 = S().song.length; u.click('[data-set="songpick"] button[data-v="song"]'); await sleep(300); u.click('[data-addpat="2"]'); await until(() => S().song.length === n0 + 1, 8000); await sleep(300); c.i = rowI(); if (S().songMore && $1("[data-rowmore]")) { u.click("[data-rowmore]"); await sleep(250); } c.cell = () => $1(`#tl .scell[data-i="${c.i}"]`); c.h0 = c.cell().getBoundingClientRect().height; },
				screen: c => ok(!c.cell().querySelector(".rmk") && !/\n/.test(c.cell().title), "marks " + c.cell().querySelector(".rmk .rt")?.textContent), within: 10000 },
			{ say: "Transpose + twice, Tempo Keep off, Mute T1, the row's track 3 + : the cell shows tempo, M1, +2 and T±, in that order", act: async (u, c) => { u.click('[data-step="trn"][data-d="1"]'); await sleep(250); u.click('[data-step="trn"][data-d="1"]'); await sleep(250); u.click("[data-bpmkeep]"); await until(() => S().song[c.i]?.bpm, 4000); c.t = S().song[c.i].bpm; if (!$1("[data-rowmute]")) { u.click("[data-rowmore]"); await sleep(300); } u.click('[data-rowmute="0"]'); await sleep(250); u.click('[data-ttr="2"][data-d="1"]'); await sleep(300); },
				screen: c => ok(c.cell().querySelector(".rmk .rt")?.textContent === `${c.t} M1 +2 T±`, "marks " + c.cell().querySelector(".rmk .rt")?.textContent), within: 8000 },
			{ say: "the marks are whole (not cut), the cell is as tall as before, the tooltip tells the detail", act: () => {},
				screen: c => { const wide = $1("#tl").classList.contains("rmkwide"), v = c.cell().querySelector(wide ? ".rmk .rt" : ".rmk .rg"), r = v.getBoundingClientRect(), cr = c.cell().getBoundingClientRect(), codes = c.cell().querySelector(".rmk .rg")?.textContent; Journey.snapshot("mm-song-row-marks");
					return ok(r.width > 0 && r.left >= cr.left - 1 && r.right <= cr.right + 1 && r.top >= cr.top - 1 && r.bottom <= cr.bottom + 1 && codes === "BM±T" && Math.abs(cr.height - c.h0) < 1 && /Tempo \d+ BPM/.test(c.cell().title) && /Muted: T1/.test(c.cell().title) && /Transpose \+2/.test(c.cell().title) && /Per track: T3 \+1/.test(c.cell().title), `${wide ? "words" : "codes"} ${Math.round(r.left - cr.left)}..${Math.round(r.right - cr.left)} of ${Math.round(cr.width)} wide, codes ${codes}, height ${cr.height} (was ${c.h0}), title ${c.cell().title.replace(/\n/g, " | ")}`); } },
			{ say: "click the marks with Row > More closed: it opens", act: async (u, c) => { if ($1("[data-rowmute]")) { u.click("[data-rowmore]"); await sleep(250); } c.closed = !$1("[data-rowmute]"); u.click(c.cell().querySelector($1("#tl").classList.contains("rmkwide") ? ".rmk .rt" : ".rmk .rg")); await sleep(300); },
				screen: c => ok(c.closed && !!$1("[data-rowmute]") && !!$1("[data-ttr]"), "closed " + c.closed + ", mutes " + !!$1("[data-rowmute]")) },
			{ say: "take them all off (transpose −2, track 3 −, unmute, Keep): the cell has no marks again", act: async (u, c) => { u.click('[data-step="trn"][data-d="-1"]'); await sleep(250); u.click('[data-step="trn"][data-d="-1"]'); await sleep(250); u.click('[data-ttr="2"][data-d="-1"]'); await sleep(250); u.click('[data-rowmute="0"]'); await sleep(250); u.click("[data-bpmkeep]"); await sleep(400); },
				screen: c => ok(!c.cell().querySelector(".rmk"), "marks " + c.cell().querySelector(".rmk .rt")?.textContent), within: 6000 }
		],
		async tidy(u, c) { const more = $1("[data-rowmore]"); if (S().songMore && more) u.click(more); if (c.r0) await undoUntil(u, () => JSON.stringify(songDoc()?.rows) === c.r0, 40); await sleep(300); if (c.m0 === false && machine().song?.songMode !== false) { u.click('[data-set="songpick"] button[data-v="pattern"]'); await sleep(1500); } }
	};
	const songRowsCopy = {
		name: "mm-song-rows-copy", proves: ["MM-269"],
		steps: [
			go("song"),
			{ say: "SONG mode: raise row 2's transpose by 1, click Copy on the LCD (it names the row)", act: async (u, c) => { c.n0 = histN(); c.r0 = JSON.stringify(songDoc()?.rows); c.m0 = machine().song?.songMode === true; u.click('[data-set="songpick"] button[data-v="song"]'); await sleep(300); u.click('#tl .scell[data-i="1"]'); await sleep(300); c.t0 = rowDoc().transpose; await stepRow(u, "trn", 1, "transpose", () => rowDoc().transpose); const btn = n => $all(".lcdpanel button").find(b => b.textContent.trim() === n); u.click(btn("Copy")); await sleep(500); c.src = JSON.stringify(rowDoc()); c.toast = $1("#toast")?.textContent; },
				screen: c => ok(/Copied row 2/.test(c.toast), "toast " + c.toast), machine: c => ok(rowDoc().transpose === c.t0 + 1, "transpose " + rowDoc().transpose + " (was " + c.t0 + ") of row " + (rowI() + 1) + "; rows were " + JSON.stringify(JSON.parse(c.r0).map(r => r.transpose ?? r.kind)) + ", now " + JSON.stringify(songDoc().rows.map(r => r.transpose ?? r.kind))), within: 10000 },
			{ say: "select row 4, Paste: a copy of row 2 follows it, the same pattern, repeats, transpose and mutes", act: async (u, c) => { c.n = songDoc().rows.length; u.click('#tl .scell[data-i="3"]'); await sleep(300); u.click($all(".lcdpanel button").find(b => b.textContent.trim() === "Paste")); await until(() => songDoc().rows.length === c.n + 1, 8000); await songSettled(); },
				machine: c => ok(songDoc().rows.length === c.n + 1 && same(songDoc().rows[4], JSON.parse(c.src)), `row 5 ${JSON.stringify(songDoc().rows[4])} for ${c.src}`), within: 12000 },
			{ say: "Clr takes the selected row out; Cmd+Z brings it back", act: async (u, c) => { c.n1 = songDoc().rows.length; u.click($all(".lcdpanel button").find(b => b.textContent.trim() === "Clr")); await sleep(500); if (dlgShown()) u.click($1("#dlg .danger") || dlgButton("Clear")); await until(() => songDoc().rows.length === c.n1 - 1, 8000); await songSettled(); c.after = songDoc().rows.length; blur(); u.key("z", { cmd: true }); await until(() => songDoc().rows.length === c.n1, 8000); await songSettled(); },
				machine: c => ok(c.after === c.n1 - 1 && songDoc().rows.length === c.n1 && same(songDoc().rows[4], JSON.parse(c.src)), `rows ${c.n1} -> ${c.after} -> ${songDoc().rows.length}`), within: 20000 }
		],
		async tidy(u, c) { await back(u, c); if (c.r0) await undoUntil(u, () => JSON.stringify(songDoc()?.rows) === c.r0, 6); if (c.m0 === false && machine().song?.songMode !== false) { u.click('[data-set="songpick"] button[data-v="pattern"]'); await sleep(1500); } }
	};
	/* GLOBAL: TEMPO SYNC INT / EXT and TRANSPORT IN ACCEPT / IGNORE (the machine takes them: the setting is read back from it) */
	const globalSync = {
		name: "mm-global-sync", proves: ["MM-297", "MM-298"],
		steps: [
			{ say: "open GLOBAL: Tempo in EXT, then INT; Control in ON (transport accepted), then OFF (ignored): each is written to the machine and read back, the key lit", act: async (u, c) => { c.bad = []; c.s0 = JSON.stringify(gDoc().controlIn); u.click("#globkey"); await sleep(300); Journey.snapshot("mm-global-panel");
					for (const [ga, v, f, want] of [["tempoIn", 1, "tempoSync", 1], ["tempoIn", 0, "tempoSync", 0], ["ctrlIn", 1, "transport", 1], ["ctrlIn", 0, "transport", 0]]) { const g0 = wireSeq; u.click(`#globpop [data-ga="${ga}"][data-v="${v}"]`); if (!await until(() => gDoc().controlIn[f] === want, 15000)) { c.bad.push(`${ga} ${v}: ${JSON.stringify(gDoc().controlIn)}`); continue; } await globalSettled(g0); if (!pressed(`#globpop [data-ga="${ga}"][data-v="${v}"]`) || gDoc().controlIn[f] !== want) c.bad.push(`${ga} ${v}: not lit / read back ${JSON.stringify(gDoc().controlIn)}`); } },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 }
		],
		async tidy(u, c) { if (c.s0) { const s = JSON.parse(c.s0); for (const [ga, f] of [["tempoIn", "tempoSync"], ["ctrlIn", "transport"]]) if (gDoc().controlIn[f] !== s[f]) { u.click(`#globpop [data-ga="${ga}"][data-v="${s[f]}"]`); await sleep(1500); } } if (!$1("#globpop").hidden) u.key("Escape"); }
	};
	/* ---- Appendix A, VO-6: spell a word with locks (the manual's "monomachine": mo no ma shi n) ---- */
	const spellWord = {
		name: "mm-seq-spell-word", proves: ["MM-335", "MM-336"],
		steps: [
			go("sound"), sel(2),
			{ say: "pick VO-6 on track 3", act: async (u, c) => { c.n0 = histN(); u.click("#machbtn"); await until(() => !$1("#machpop").hidden, 1500); u.click('#machpop .mf[data-fam="VO"]'); await sleep(50); u.click('#machpop .mk[data-mach="VO-6"]'); await until(() => wk().tracks[2].machineName === "VO-6", 4000); await sleep(300); },
				machine: () => ok(wk().tracks[2].machineName === "VO-6", "machine " + wk().tracks[2].machineName), within: 6000 },
			go("seq"), sel(2), { say: "click five notes into the roll", act: async (u, c) => { c.pitch = rollCell(2, 0).n; c.steps = []; for (let k = 0; k < 5; k++) { const s = freeSteps(2, 1, 2 + k * 3, c.pitch)[0]; if (s == null) throw new Error("no free step"); const p = rollCell(2, s); u.click(p.c, {}, p.fx, p.fy); c.steps.push(s); await sleep(300); } },
				machine: c => ok(c.steps.every(s => trigsOf(2).includes(s)), "trigs " + trigsOf(2)), within: 10000 },
			{ say: "in the lock lane's SYN page, lock CONS on each note (M, N, M, SJ, N) with the wheel, and VOC1 on each with a drawn bar: the roll names each note's consonant", act: async (u, c) => { c.bad = []; if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); await sleep(200); u.click('[data-lpage="SYN"]'); await sleep(100); u.click('.pk[data-lane="SYN.4"]'); await sleep(200);
					const want = [9, 10, 9, 15, 10]; c.want = want; const cur = () => enIdx(cellOf(2, "SYN", 4), 21);	/* a lock on a step starts from the kit's own value */
					for (const [k, s] of c.steps.entries()) { const d = want[k] - cur(); for (let n = 0; n < Math.abs(d); n++) { u.wheel(`#lane .lb[data-s="${s}"]`, d > 0 ? 1 : -1, { shift: true }); await sleep(140); } await sleep(150); }
					await sleep(800); const l = lockVals(2, 0, 4); if (l.length !== 5) c.bad.push("CONS locks " + JSON.stringify(l)); else l.forEach(([s, v], k) => { if (s !== c.steps[k] || enIdx(v, 21) !== want[k]) c.bad.push(`step ${s + 1}: CONS ${enIdx(v, 21)} for ${want[k]}`); });
					u.click('.pk[data-lane="SYN.0"]'); await sleep(200); for (const [k, s] of c.steps.entries()) await u.drag(`#lane .lb[data-s="${s}"]`, [[0, -1]], {}, { fy: 0.15 + 0.15 * k, settle: 40, stepMs: 10 }); await sleep(500); if (lockVals(2, 0, 0).length !== 5) c.bad.push("VOC1 locks " + JSON.stringify(lockVals(2, 0, 0)));
					c.texts = canvasTexts($1(`#seq canvas.roll[data-big][data-t="2"]`)); Journey.snapshot("mm-lock-lane"); },
				screen: c => { const got = c.texts.filter(t => /^(M|N|SJ)$/.test(t)).join(" "); return ok(!c.bad.length && got === "M N M SJ N", c.bad.join(" | ") + " roll says: " + got); }, within: 1000 }
		],
		async tidy(u, c) { if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); await back(u, c); }
	};
	/* ---- Appendix A, DPRO-BBOX: 24 drums, the key picks the drum; the roll names them ---- */
	const bboxDrums = {
		name: "mm-seq-bbox-drums", proves: ["MM-329"],
		steps: [
			go("sound"), sel(2),
			{ say: "pick DPRO-BBOX on track 3", act: async (u, c) => { c.n0 = histN(); u.click("#machbtn"); await until(() => !$1("#machpop").hidden, 1500); u.click('#machpop .mf[data-fam="DPRO"]'); await sleep(50); u.click('#machpop .mk[data-mach="DPRO-BBOX"]'); await until(() => wk().tracks[2].machineName === "DPRO-BBOX", 4000); await sleep(300); },
				machine: () => ok(wk().tracks[2].machineName === "DPRO-BBOX", "machine " + wk().tracks[2].machineName), within: 6000 },
			go("seq"), sel(2), { say: "click notes at three pitches of the roll: the roll names each by its drum (24 drums from C-3, 48 to 71)", act: async (u, c) => { c.pitches = []; const p0 = rollCell(2, 0).n; for (const d of [-4, 0, 3]) c.pitches.push(p0 + d); c.steps = []; for (const [k, pt] of c.pitches.entries()) { const s = freeSteps(2, 1, 2 + k * 4, pt)[0]; if (s == null) throw new Error("no free step"); const p = rollPitch(2, s, pt); u.click(p.c, {}, p.fx, p.fy); c.steps.push(s); await sleep(350); } await sleep(300); c.texts = canvasTexts($1(`#seq canvas.roll[data-big][data-t="2"]`)); Journey.snapshot("mm-roll-draw"); },
				machine: c => ok(c.steps.every((s, k) => noteAt(2, s).join() === String(c.pitches[k])), `notes ${c.steps.map(s => noteAt(2, s))} for ${c.pitches}`),
				screen: c => ok(c.pitches.every(pt => BBOX[pt] && c.texts.includes(BBOX[pt])) && Object.keys(BBOX).length === 24 && Object.keys(BBOX).every((k, i) => +k === 48 + i), `roll says ${c.texts.join(" ")}; wanted ${c.pitches.map(pt => BBOX[pt])}`), within: 10000 }
		],
		async tidy(u, c) { await back(u, c); }
	};
	/* ---- The pattern chooser: 128 patterns in eight banks A to H, what each tile says, each pattern's kit; whole-pattern copy (Pattern operation, Composing a pattern) ---- */
	const psq = p => `#libpop .ps[data-ps="${p}"]`;
	const patName128 = p => String.fromCharCode(65 + (p >> 4)) + String(p % 16 + 1).padStart(2, "0");
	const chooserJ = {
		name: "mm-lib-pattern-chooser", proves: ["MM-035", "MM-037", "MM-163", "MM-189", "MM-X21"],
		steps: [
			{ say: "click the pattern on the LCD: the chooser has the 128 patterns A01 to H16 in order, A to D the first 64 and E to H the next, and the eight bank keys A to H", act: async (u, c) => { c.p0 = cur(); u.click("#pat"); await until(() => $all("#libpop .ps").length === 128, 4000); await until(() => I().slots("pattern").length >= 128, 20000); await sleep(300); Journey.snapshot("mm-pattern-chooser"); },
				screen: () => { const t = $all("#libpop .ps"); const bad = t.filter((b, p) => +b.dataset.ps !== p || !b.textContent.startsWith(patName128(p))); return ok(t.length === 128 && !bad.length && $all("#libpop .lbank").map(b => b.textContent).join("") === "ABCDEFGH" && $1(psq(64)).textContent.startsWith("E01") && $1(psq(63)).textContent.startsWith("D16"), `${t.length} tiles, wrong ${bad.slice(0, 4).map(b => b.dataset.ps)}`); } },
			{ say: "each tile says its pattern's length and the kit it recalls (K and the kit number), the empty ones EMPTY", screen: () => { const bad = []; for (let p = 0; p < 128; p++) { const d = I().doc("pattern", p), t = $1(psq(p)).textContent.slice(3).replace(/\s+/g, " ").trim(), data = d && d.tracks.some(x => x.trig.length) || d && d.midiTracks.some(x => x.trig.length); const want = !d ? null : data ? `${d.length} · K${String(d.kit + 1).padStart(2, "0")}` : "EMPTY"; if (want && t !== want) bad.push(`${patName128(p)} "${t}" for "${want}"`); } return ok(!bad.length, bad.slice(0, 4).join(" | ")); } },
			{ say: "press D, then E, then click the key of bank G: the selection is in that bank each time", act: async (u, c) => { c.sel = []; for (const k of ["d", "e"]) { u.key(k); await sleep(150); c.sel.push(+$1('#libpop .ps[aria-selected="true"]')?.dataset.ps); } u.click('#libpop .lbank[data-lb="6"]'); await sleep(150); c.sel.push(+$1('#libpop .ps[aria-selected="true"]')?.dataset.ps); },
				screen: c => ok(c.sel[0] >> 4 === 3 && c.sel[1] >> 4 === 4 && c.sel[2] >> 4 === 6, "selected " + c.sel.map(patName128)) },
			{ say: "clear a pattern: its tile says EMPTY at once; paste a copy of another into it: the tile shows that one's length and kit, the notes, the kit link and the MIDI tracks are the copy's; Cmd+Z twice gives the first one back", act: async (u, c) => {
					c.n0 = histN(); c.src = [1, 2, 3].find(p => p !== c.p0); c.dst = [5, 6, 7].find(p => p !== c.p0 && p !== c.src); c.d0 = JSON.stringify(I().doc("pattern", c.dst)); c.s0 = JSON.stringify(I().doc("pattern", c.src));
					u.click(psq(c.src), { alt: true }); await sleep(200); u.click('#libpop [data-la="copy"]'); await sleep(300); u.click(psq(c.dst), { alt: true }); await sleep(200); u.click('#libpop [data-la="clear"]'); await answer(u, c);
					await until(() => /EMPTY/.test($1(psq(c.dst)).textContent), 15000); c.empty = /EMPTY/.test($1(psq(c.dst)).textContent);
					u.click('#libpop [data-la="paste"]'); await answer(u, c); await until(() => !/EMPTY/.test($1(psq(c.dst)).textContent), 15000); await sleep(1200); c.tile = $1(psq(c.dst)).textContent.slice(3).replace(/\s+/g, " ").trim(); c.tile0 = $1(psq(c.src)).textContent.slice(3).replace(/\s+/g, " ").trim(); },
				machine: c => { const a = I().doc("pattern", c.src), b = I().doc("pattern", c.dst); return ok(c.empty && b && same(b.tracks, a.tracks) && same(b.midiTracks, a.midiTracks) && b.kit === a.kit && b.length === a.length && c.tile === c.tile0, `empty ${c.empty}, tile "${c.tile}" for "${c.tile0}", kit ${b?.kit}/${a?.kit}`); }, within: 60000 },
			{ say: "Cmd+Z twice: the destination is as it was", act: async (u, c) => { blur(); u.key("z", { cmd: true }); await sleep(1500); await until(idleNow, 20000); u.key("z", { cmd: true }); }, machine: c => ok(JSON.stringify(I().doc("pattern", c.dst)) === c.d0, "slot differs"), within: 40000 },
			{ say: "click another pattern with another kit: the machine loads that pattern's kit (its tile's number)", act: async (u, c) => { c.q = [1, 2, 3, 5].find(p => p !== cur() && I().doc("pattern", p).kit !== machine().kit.current); c.k = I().doc("pattern", c.q).kit; u.click(psq(c.q)); await confirmIfAsked(u); },
				machine: c => ok(cur() === c.q && machine().kit.current === c.k, `pattern ${cur()}, kit ${machine().kit.current} for ${c.k}`), within: 12000 }
		],
		async tidy(u, c) { if (!$1("#libpop").hidden) u.key("Escape"); await back(u, c); if (c.p0 != null && cur() !== c.p0) { Bridge.send({ op: "select", p: c.p0, now: true }); await sleep(2000); } }
	};
	const idleNow = () => I().machine?.recv?.state === "idle" && !I().machine?.recv?.sending;
	/* the same kit is not read again: an edited kit keeps its edits when the next pattern recalls the same kit */
	const sameKit = {
		name: "mm-lib-pattern-same-kit", proves: ["MM-094"],
		steps: [
			/* independent (JOURNEYS.md): factory memory gives each pattern its own kit, so the journey links two patterns to one
			   kit itself, as a person does (the pattern chooser's Kit list, an undo step the tidy takes back) */
			{ say: "make two patterns recall the same kit (the pattern chooser: Alt-click the second, its Kit list: the first's kit), go to the first (its kit loads), edit a Kit value (the kit is edited)", act: async (u, c) => { c.p0 = cur(); c.u0 = histN(); await until(() => I().slots("pattern").length >= 128, 20000);
					[c.a, c.b] = [1, 2, 3, 4, 5, 6].map(d => (c.p0 % 64 + d) % 64).filter(p => p !== c.p0 && I().doc("pattern", p)); if (c.b == null) throw new Error("no two patterns in banks A to D");
					c.kk = I().doc("pattern", c.a).kit; u.click("#pat"); await sleep(300);
					if (I().doc("pattern", c.b).kit !== c.kk) { u.click(psq(c.b), { alt: true }); await until(() => !!$1("#patkit"), 2000); await choose(u, "patkit", String(c.kk)); c.linked = true;
						if (!await until(() => I().doc("pattern", c.b)?.kit === c.kk, 15000)) throw new Error(`pattern ${patName128(c.b)} did not take kit ${c.kk + 1}`); await sleep(300); if ($1("#libpop").hidden) { u.click("#pat"); await sleep(300); } }
					u.click(psq(c.a)); await confirmIfAsked(u); await until(() => cur() === c.a && machine().kit.current === c.kk, 15000); await sleep(800); if (!$1("#libpop").hidden) { u.key("Escape"); await sleep(300); } u.click(tab("sound")); await sleep(300); u.click(rail(0)); await sleep(200); const r = await nudgeBox(u, 0, "AMP", 0); c.v1 = r.v1; c.cell = () => cellOf(0, "AMP", 0); },
				machine: c => ok(machine().kit.working === "edited" && c.cell() === c.v1, `working ${machine().kit.working}`), within: 25000 },
			{ say: "go to the second pattern (same kit): the pattern changes, the kit stays as edited, no question", act: async (u, c) => { u.click(tab("seq")); await sleep(300); u.click("#pat"); await sleep(300); u.click(psq(c.b)); c.asked = await until(dlgShown, 1500); if (!$1("#libpop").hidden) u.key("Escape"); await until(() => cur() === c.b, 15000); await sleep(1500); },
				machine: c => ok(cur() === c.b && !c.asked && machine().kit.current === c.kk && machine().kit.working === "edited" && c.cell() === c.v1, `pattern ${cur()}, asked ${c.asked}, working ${machine().kit.working}, value ${c.cell()} (was ${c.v1})`), within: 25000 }
		],
		/* the Sound edit undone, the pattern as found, then the kit link undone (the second pattern no longer plays: no kit load) */
		async tidy(u, c) { if (dlgShown()) u.key("Escape"); if (!$1("#libpop").hidden) u.key("Escape"); if (c.v1 != null) { u.click(tab("sound")); await sleep(300); blur(); u.key("z", { cmd: true }); await sleep(1500); } if (c.p0 != null && cur() !== c.p0) { Bridge.send({ op: "select", p: c.p0, now: true }); await sleep(2000); } if (c.linked) await undoTo(u, c.u0); await back(u, c); }
	};
	/* ---- Kits: the star, a cleared kit loaded, Sound's CLR, the kit's parts and the keep-effects choice (Synthesis arrangement) ---- */
	const ksq = k => `#libpop .ks[data-ks="${k}"]`;
	const kitSlots = {
		name: "mm-lib-kit-slots", proves: ["MM-097", "MM-098", "MM-108"],
		steps: [
			{ say: "open the kit library: a kit that no pattern recalls ends with a star, one a pattern recalls has none", act: async (u, c) => { c.k0 = machine().kit.current; u.click("#kitf"); await until(() => $all("#libpop .ks").length >= 128, 4000); await until(() => I().slots("pattern").length >= 128 && I().slots("kit").length >= 128, 30000); await sleep(300);
					/* B-105: factory memory links every kit that holds data to a pattern: the journey makes its own unlinked kit, the
					   kit that plays pasted into an empty slot no pattern recalls (undone in tidy) */
					const used = new Set(); for (let p = 0; p < 128; p++) { const d = I().doc("pattern", p); if (d) used.add(d.kit); }
					const emptyAt = k => !!$1(ksq(k))?.classList.contains("empty");
					if (![...Array(128).keys()].some(k => !used.has(k) && !emptyAt(k))) {
						const dst = [...Array(128).keys()].reverse().find(k => k !== c.k0 && !used.has(k) && emptyAt(k));
						if (dst == null) throw new Error("no empty kit slot that no pattern recalls");
						c.n0 = histN(); u.click(ksq(c.k0), { alt: true }); await sleep(150); u.click('#libpop [data-la="copy"]'); await sleep(150);
						u.click(ksq(dst), { alt: true }); await sleep(150); u.click('#libpop [data-la="paste"]'); await sleep(300); if (dlgShown()) u.click($1("#dlg .danger") || $1('#dlg [data-dlg="0"]'));
						await until(() => !emptyAt(dst), 15000); await sleep(300);
					}
					Journey.snapshot("mm-kit-library"); },
				/* B-105 (the 0.6 e2e run): an empty slot shows EMPTY, no star (factory memory has empty kit slots; the page
				   tier's fixture has none) */
				screen: () => { const used = new Set(); for (let p = 0; p < 128; p++) { const d = I().doc("pattern", p); if (d) used.add(d.kit); } const bad = []; let stars = 0; for (let k = 0; k < 128; k++) { const tile = $1(ksq(k)), star = !!tile?.querySelector(".lsn")?.textContent.endsWith("*"), empty = !!tile?.classList.contains("empty"); stars += star; if (star !== (!used.has(k) && !empty)) bad.push(`K${k + 1}: star ${star}, used ${used.has(k)}, empty ${empty}`); } return ok(!bad.length && stars >= 1, `stars ${stars}; ` + bad.slice(0, 4).join(" | ")); } },
			{ say: "Clear a kit (it asks): its slot holds six GND-SIN tracks; load that slot: the machine plays six GND-SIN", act: async (u, c) => { c.n0 ??= histN(); c.slot = otherSlot(); c.d0 = JSON.stringify(I().doc("kit", c.slot)); u.click(ksq(c.slot), { alt: true }); await sleep(200); u.click('#libpop [data-la="clear"]'); await answer(u, c); await until(() => MmConvert.kitEmpty(I().doc("kit", c.slot)), 20000);
					c.docT = I().doc("kit", c.slot).tracks.map(t => t.machineName); u.click(ksq(c.slot)); if (await until(dlgShown, 1500)) u.click(dlgButton("Load without saving") || $1("#dlg .danger")); await until(() => machine().kit.current === c.slot, 15000); await sleep(800); },
				machine: c => ok(c.docT.every(m => m === "GND-SIN") && machine().kit.current === c.slot && wk().tracks.every(t => t.machineName === "GND-SIN"), `slot ${c.docT}, loaded ${wk().tracks.map(t => t.machineName)}`), within: 50000 },
			{ say: "Esc; on Kit, track 1 as FM or SID again, then CLR on the LCD: the track is GND-SIN with every page at its start, as the cleared kit's; Cmd+Z brings the machine back", act: async (u, c) => { if (!$1("#libpop").hidden) u.key("Escape"); await sleep(200); u.click(tab("sound")); await sleep(300); u.click(rail(0)); await sleep(200); u.click("#machbtn"); await until(() => !$1("#machpop").hidden, 1500); u.click('#machpop .mf[data-fam="SID"]'); await sleep(50); u.click('#machpop .mk[data-mach="SID-6581"]'); await until(() => wk().tracks[0].machineName === "SID-6581", 4000); await sleep(300);
					const r = await nudgeBox(u, 0, "AMP", 0); c.m1 = wk().tracks[0].machineName; u.click($all(".lcdpanel button").find(b => b.textContent.trim() === "Clr")); await until(() => wk().tracks[0].machineName === "GND-SIN", 6000); await sleep(600); c.after = JSON.stringify(wk().tracks[0].pages); c.cleared = JSON.stringify(I().doc("kit", c.slot).tracks[0].pages); blur(); u.key("z", { cmd: true }); await until(() => wk().tracks[0].machineName === "SID-6581", 6000); },
				machine: c => ok(c.m1 === "SID-6581" && c.after === c.cleared && wk().tracks[0].machineName === "SID-6581", `after CLR ${c.after} vs cleared kit ${c.cleared}; machine now ${wk().tracks[0].machineName}`), within: 20000 }
		],
		async tidy(u, c) { if (!$1("#libpop").hidden) u.key("Escape"); await back(u, c); if (c.k0 != null && machine().kit.current !== c.k0) { u.click("#kitf"); await sleep(400); u.click(ksq(c.k0)); if (await until(dlgShown, 1500)) u.click(dlgButton("Load without saving") || $1("#dlg .danger")); await until(() => machine().kit.current === c.k0, 15000); u.key("Escape"); } }
	};
	const kitParts = {
		name: "mm-kit-parts", proves: ["MM-093", "MM-105", "MM-106", "MM-372"],
		steps: [
			go("sound"), sel(0),
			{ say: "the kit's parts, each edited on its own page and found in the working kit: a SYN value (SYNTH), the machine (MACHINE), the track's level (MIX), an LFO value, a MIDI page value, an output bus, a legato envelope, the multi envelope", act: async (u, c) => { c.n0 = histN(); c.bad = []; const part = async (what, act, ok2) => { const b = kitCells(), bm = JSON.stringify([wk().trackMasks, wk().tracks.map(t => t.multiEnv), wk().name]); await act(); await sleep(700); const a = kitCells(), d = cellDiff(b, a), am = JSON.stringify([wk().trackMasks, wk().tracks.map(t => t.multiEnv), wk().name]); if (!ok2(d, bm !== am)) c.bad.push(`${what}: moved ${d.join(",") || "nothing"}${bm !== am ? " + masks/menv/name" : ""}`); };
					await part("SYNTH", async () => { await nudgeBox(u, 0, "SYN", 0); }, d => d.length === 1 && /^T1\.0\.0$/.test(d[0]));
					await part("MACHINE", async () => { u.click("#machbtn"); await until(() => !$1("#machpop").hidden, 1500); u.click('#machpop .mf[data-fam="FM+"]'); await sleep(50); const m = wk().tracks[0].machineName === "FM+STAT" ? "FM+DYN" : "FM+STAT"; u.click(`#machpop .mk[data-mach="${m}"]`); await until(() => wk().tracks[0].machineName === m, 4000); }, d => d.includes("mach1") && d.every(k => /^T1\.0\.|^mach1$|^in1$/.test(k)));
					await part("LFO", async () => { await nudgeBox(u, 0, "LF2", 6); }, d => d.length === 1 && d[0] === "T1.5.6");
					u.click('[data-side="midi"]'); await sleep(300); u.click(rail(6)); await sleep(300); await part("MIDI page", async () => { await nudgeBox(u, 0, "MID", 1).catch(() => { }); const el = box("MID", 1), v0 = wk().tracks[0].pages[7][1]; el.focus(); u.key(v0 >= 127 ? "ArrowDown" : "ArrowUp"); await until(() => wk().tracks[0].pages[7][1] !== v0, 4000); }, d => d.some(k => /^T1\.7\.1$/.test(k)));
					u.click('[data-side="int"]'); await sleep(300); u.click(tab("mix")); await sleep(300);
					await part("MIX level", async () => { await u.drag(strip(0, '.fader[data-g="lev"]'), [[0, -10], [0, -20]]); }, d => d.length >= 1 && d.every(k => k === "lev1"));
					await part("OUT bus", async () => { u.click('[data-bus="CD"][data-t="0"]'); await until(() => true, 10); }, d => d.includes("out1") && d.every(k => k === "out1" || k === "in1"));	/* the routing SysEx clears a synth track's input */
					u.click(tab("seq")); await sleep(300); u.click(rail(0)); await sleep(300); u.click('[data-dock="trig"]'); await sleep(300); await part("Legato", async () => { u.click('[data-leg="amp"]'); }, (d, other) => other && !d.length);
					u.click('[data-dock="locks"]'); await sleep(200); u.click(tab("perform")); await sleep(400); await part("MULTI ENV", async () => { const el = $1('#main .pc[data-g="menv"][data-n="ATK"]'); el.focus(); u.key("ArrowUp"); }, (d, other) => other); },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 },
			{ say: "Keep track effects + LFOs on: a picked machine leaves AMP, FLT, EFX and the LFOs as they are; off: they go to their start values (the manual's init pages)", act: async (u, c) => { u.click(tab("sound")); await sleep(300); u.click(rail(1)); await sleep(200); await nudgeBox(u, 1, "AMP", 0); await nudgeBox(u, 1, "FLT", 0); const set = () => JSON.stringify(wk().tracks[1].pages.slice(1, 7)); const pickM = async m => { u.click("#machbtn"); await until(() => !$1("#machpop").hidden, 1500); u.click(`#machpop .mf[data-fam="${famKey(m)}"]`); await sleep(50); return m; };
					c.kept0 = set(); let m = await pickM("SID-6581"); const keepOn = $1("#mpkeep")?.getAttribute("aria-pressed") === "true"; u.click(`#machpop .mk[data-mach="${m}"]`); await until(() => wk().tracks[1].machineName === m, 4000); await sleep(500); c.kept1 = set(); c.keepOn = keepOn;
					m = await pickM("FM+STAT"); u.click("#mpkeep"); await sleep(150); c.keepOff = $1("#mpkeep")?.getAttribute("aria-pressed") === "false"; u.click(`#machpop .mk[data-mach="${m}"]`); await until(() => wk().tracks[1].machineName === m, 4000); await sleep(500); c.init = set(); c.def = JSON.stringify(wk().tracks[4].pages.slice(1, 7)); u.click("#machbtn"); await sleep(300); u.click("#mpkeep"); u.key("Escape"); },
				screen: c => ok(c.keepOn && c.kept1 === c.kept0 && c.keepOff && c.init !== c.kept0, `keep on ${c.keepOn}, pages kept ${c.kept1 === c.kept0}, keep off ${c.keepOff}, pages init ${c.init !== c.kept0}`), machine: c => { const p = JSON.parse(c.init); return ok(same(p.slice(0, 3), [DEFV.AMP, DEFV.FLT, DEFV.EFX]) && same(p[3], p[4]) && same(p[4], p[5]) && p[3][7] === 0, "init pages " + c.init + " (the page's start values " + JSON.stringify([DEFV.AMP, DEFV.FLT, DEFV.EFX]) + ")"); }, within: 1000 },
			{ say: "rename the kit that plays (KIT, Rename, JOURNEY): the machine gets the live name SysEx 0x55 and the working kit has the name", act: async (u, c) => { u.click("#kitf"); await sleep(400); c.cur = machine().kit.current; u.click(ksq(c.cur), { alt: true }); await sleep(200); const w0 = wireSeq; u.click('#libpop [data-la="rename"]'); await sleep(250); u.type("#lsin", "JOURNEY"); await sleep(100); u.key("Enter"); await answer(u, c); await until(() => wk().name === "JOURNEY", 20000); await sleep(600); c.syx = wireLog.filter(w => w.seq > w0 && w.kind === "sysex" && w.b[6] === 0x55).map(w => w.b); u.key("Escape"); },
				machine: c => ok(wk().name === "JOURNEY" && (Journey.noWire() || c.syx.length >= 1 && c.syx[0].slice(0, 6).join() === "240,0,32,60,3,0"), `name ${wk().name}, 0x55 sysex ${JSON.stringify(c.syx)}`), within: 30000 }
		],
		async tidy(u, c) { if (!$1("#libpop").hidden) u.key("Escape"); if ($1('[data-dock="trig"]')) u.click('[data-dock="locks"]'); if (S().side === "midi") u.click('[data-side="int"]'); await back(u, c); }
	};
	/* ---- Copy: a page to another page (COPY PAGE, PASTE PAGE), a note with its lock to another step (Composing a pattern, Parameter locks) ---- */
	const stepFacts = (t, s) => JSON.stringify({ trig: bitsOf(t, "trig").includes(s), amp: bitsOf(t, "amp").includes(s), filter: bitsOf(t, "filter").includes(s), lfo: bitsOf(t, "lfo").includes(s), off: bitsOf(t, "noteOff").includes(s), chord: bitsOf(t, "chord").includes(s), note: noteAt(t, s), slide: slidesOf(t).includes(s), locks: lockList().filter(l => l.track === t).map(l => [l.page, l.param, (l.steps.find(([x]) => x === s) || [])[1] ?? null]) });
	const copyPageNote = {
		name: "mm-seq-copy-page", proves: ["MM-185", "MM-204"],
		steps: [
			go("seq"), sel(0), { say: "ALL off (one page of 16 steps), COPY on the LCD with nothing selected: it names the page; PAGE to the next page, PASTE: that page holds what the first held, step for step (trigs, envelope trigs, pitches, NOTE OFFs, chords, locks)", act: async (u, c) => { c.n0 = histN(); if (S().viewAll) u.click("#pgall"); await sleep(300); while (S().page !== 0) { blur(); u.key("["); await sleep(150); }
					if (S().stepSel) { blur(); u.key("Escape"); await sleep(150); } c.t = 0; const btn = n => $all(".lcdpanel button").find(b => b.textContent.trim() === n); u.click(btn("Copy")); await sleep(400); c.toast = $1("#toast")?.textContent || ""; u.click("#pgkey"); await sleep(300); c.p1 = S().page; u.click(btn("Paste")); await sleep(2500);
					c.bad = []; for (let k = 0; k < 16; k++) { const a = JSON.parse(stepFacts(0, k)), b = JSON.parse(stepFacts(0, k + 16)); if (JSON.stringify(a) !== JSON.stringify(b)) c.bad.push(`step ${k + 1}: ${JSON.stringify(a)} / ${JSON.stringify(b)}`); } },
				screen: c => ok(/Copied T1, steps 1.16/.test(c.toast) && c.p1 === 1 && !c.bad.length, `toast "${c.toast}", page ${c.p1}, ${c.bad.slice(0, 2).join(" | ")}`), within: 20000 },
			{ say: "a note with a lock: right-click it, Copy; right-click an empty step, Paste here: the new step has the pitch and the lock", act: async (u, c) => { while (S().page !== 0) { blur(); u.key("["); await sleep(150); } u.click("#pgall"); await sleep(300);
					c.pitch = rollCell(0, 0).n; const free = freeSteps(0, 2, 0, c.pitch); [c.s, c.d] = free.slice().sort((a, b) => b - a); await roll(0, c.s)(u); await until(() => trigsOf(0).includes(c.s), 6000); await sleep(300);
					if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); await sleep(200); u.click('[data-lpage="AMP"]'); await sleep(60); u.click('.pk[data-lane="AMP.0"]'); await sleep(150); await u.drag(`#lane .lb[data-s="${c.s}"]`, [[0, -1]], {}, { fy: 0.3, settle: 40, stepMs: 10 }); await until(() => lockVals(0, 1, 0).some(([x]) => x === c.s), 6000); c.lv = lockVals(0, 1, 0).find(([x]) => x === c.s)[1];
					let p = rollCell(0, c.s); u.rightClick(p.c, {}, p.fx, p.fy); await sleep(150); u.click('#deskmenu [data-mid="copy"]'); await sleep(200); p = rollCell(0, c.d); u.rightClick(p.c, {}, p.fx, p.fy); await sleep(150); u.click('#deskmenu [data-mid="paste"]'); await until(() => trigsOf(0).includes(c.d), 8000); await sleep(800); },
				machine: c => ok(same(noteAt(0, c.d), [c.pitch]) && (lockVals(0, 1, 0).find(([x]) => x === c.d) || [])[1] === c.lv, `notes ${noteAt(0, c.d)} for ${c.pitch}, lock ${JSON.stringify(lockVals(0, 1, 0).find(([x]) => x === c.d))} for ${c.lv}`), within: 15000 }
		],
		async tidy(u, c) { if (!$1("#deskmenu")?.hidden) closeDeskMenu(); if (S().stepSel) clearSel(); if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); await back(u, c); if (!S().viewAll) u.click("#pgall"); }
	};
	/* ---- Appendix C: what the machine is sent as SysEx for each edit, and its numbers (the stub host reports the first sixteen bytes and the length) ---- */
	const sysexAfter = (n0, id) => wireLog.filter(w => w.seq > n0 && w.kind === "sysex" && w.b[6] === id);
	const closeLib = async u => { for (let i = 0; i < 4 && (!$1("#libpop").hidden || !$1("#modalbg").hidden); i++) { if (dlgShown()) u.click(dlgButton("Cancel") || $1("#dlg .danger")); else u.key("Escape"); await sleep(300); } };
	const wireSysex = {
		name: "mm-wire-sysex", proves: ["MM-370", "MM-374", "MM-375", "MM-376", "MM-380", "MM-381", "MM-382", "MM-383", "MM-384"],
		steps: [
			go("seq"), sel(0), { say: "drag the tempo on the LCD: SysEx 0x61 with the BPM times 24 in two 7-bit bytes", pageOnly: "the SysEx on the cable", act: async (u, c) => { c.n0 = histN(); c.was = { tempo: machine().tempo, p: cur(), k: machine().kit.current, s: machine().song?.current ?? 0, mode: machine().song?.songMode === true }; const w0 = wireSeq; await u.drag("#bpm", [[0, -6], [0, -12]]); await until(() => sysexAfter(w0, 0x61).length >= 1, 5000); await sleep(800); c.m = sysexAfter(w0, 0x61).map(w => w.b); c.bpm = machine().tempo; },
				machine: c => ok(c.m.length >= 1 && c.m.every(b => b[5] === 0 && b.length >= 9) && ((c.m[c.m.length - 1][7] << 7) | c.m[c.m.length - 1][8]) === Math.round(c.bpm * 24), `0x61 ${JSON.stringify(c.m)} for ${c.bpm} BPM (${Math.round(c.bpm * 24)})`), within: 10000 },
			{ say: "pick another pattern: LOAD PATTERN 0x57 with its slot, then the kit it links is requested (0x53)", pageOnly: "the SysEx on the cable", act: async (u, c) => { c.p0 = cur(); c.q = [3, 4, 5].find(p => p !== c.p0); c.pk0 = I().doc("pattern", c.q).kit; const w0 = wireSeq; u.click("#pat"); await sleep(300); u.click(psq(c.q)); await confirmIfAsked(u); await until(() => cur() === c.q, 15000); await sleep(1500); c.load = sysexAfter(w0, 0x57).map(w => w.b); c.req = sysexAfter(w0, 0x53).map(w => w.b); await closeLib(u); },
				machine: c => ok(c.load.length >= 1 && c.load[0][7] === c.q && c.req.length >= 1 && c.req[0][7] === I().doc("pattern", c.q).kit, `0x57 ${JSON.stringify(c.load)}, 0x53 ${JSON.stringify(c.req)}`), within: 25000 },
			{ say: "click a roll cell: the pattern goes to the machine as a pattern dump (0x67) of that pattern's slot, the whole pattern (a few thousand bytes), and is read back with 0x68", pageOnly: "the SysEx on the cable", act: async (u, c) => { const w0 = wireSeq; const s = freeSteps(0, 1, 6, rollCell(0, 0).n)[0]; const p = rollCell(0, s); u.click(p.c, {}, p.fx, p.fy); await until(() => sysexAfter(w0, 0x67).length >= 1, 8000); await sleep(1500); c.dump = sysexAfter(w0, 0x67).map(w => [w.b[9], w.n]); c.rq = sysexAfter(w0, 0x68).map(w => w.b[7]); },
				machine: c => ok(c.dump.length >= 1 && c.dump[0][0] === cur() && c.dump[0][1] > 2000 && c.rq.includes(cur()), `0x67 slot/length ${JSON.stringify(c.dump)}, 0x68 ${c.rq}, pattern ${cur()}`), within: 15000 },
			{ say: "KIT, click another kit: LOAD KIT 0x58 with its slot; edit a Kit value and Save: SAVE KIT 0x59; copy a kit and paste it into another slot: a kit dump 0x52 for that slot", pageOnly: "the SysEx on the cable", act: async (u, c) => { c.bad = []; u.click("#kitf"); await sleep(400); c.k1 = machine().kit.current === 5 ? 6 : 5; let w0 = wireSeq; u.click(ksq(c.k1)); if (await until(dlgShown, 1500)) u.click(dlgButton("Load without saving") || $1("#dlg .danger")); await until(() => machine().kit.current === c.k1, 15000); await sleep(800); const l = sysexAfter(w0, 0x58).map(w => w.b); if (!l.length || l[0][7] !== c.k1) c.bad.push("0x58 " + JSON.stringify(l));
					await closeLib(u); u.click(tab("sound")); await sleep(300); u.click(rail(0)); await sleep(200); await nudgeBox(u, 0, "AMP", 0); u.click("#kitf"); await sleep(400); w0 = wireSeq; u.click('#libpop [data-la="save"]'); await answer(u, c); await until(() => sysexAfter(w0, 0x59).length >= 1, 15000); const sv = sysexAfter(w0, 0x59).map(w => w.b); if (!sv.length || sv[0][7] !== c.k1) c.bad.push("0x59 " + JSON.stringify(sv));
					/* the stored kit is put back as it was: undo the edit, Save again */
					await closeLib(u); blur(); u.key("z", { cmd: true }); await sleep(1500); u.click("#kitf"); await sleep(400); u.click(ksq(c.k1), { alt: true }); await sleep(200); u.click('#libpop [data-la="save"]'); await answer(u, c); await sleep(2500);
					c.src = c.k1; c.dst = I().slots("kit").reverse().find(k => k !== c.k1 && I().doc("kit", k) && !MmConvert.kitEmpty(I().doc("kit", k))); u.click(ksq(c.src), { alt: true }); await sleep(150); u.click('#libpop [data-la="copy"]'); await sleep(200); u.click(ksq(c.dst), { alt: true }); await sleep(150); w0 = wireSeq; u.click('#libpop [data-la="paste"]'); await answer(u, c); await until(() => sysexAfter(w0, 0x52).length >= 1, 25000); const d = sysexAfter(w0, 0x52).map(w => [w.b[9] ?? w.b[7], w.n]); c.dump = d; if (!d.length || d[0][1] < 800) c.bad.push("0x52 " + JSON.stringify(d)); await closeLib(u); },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 70000 },
			{ say: "pick a machine on track 1 with Keep effects + LFOs on and then off: ASSIGN MACHINE 0x5B with the track and the machine's number (init mode 0); with the effects not kept the AMP, FLT, EFX and LFO pages follow as CC at their start values, with them kept only the SYN page does", pageOnly: "the SysEx and CCs on the cable", act: async (u, c) => { c.bad = []; const pick = async (m, keep) => { u.click("#machbtn"); await until(() => !$1("#machpop").hidden, 1500); u.click(`#machpop .mf[data-fam="${famKey(m)}"]`); await sleep(50); if (($1("#mpkeep")?.getAttribute("aria-pressed") === "true") !== keep) u.click("#mpkeep"); const w0 = wireSeq; u.click(`#machpop .mk[data-mach="${m}"]`); await until(() => wk().tracks[0].machineName === m, 4000); await until(() => sysexAfter(w0, 0x5b).length >= 1, 4000); await sleep(800); return { syx: sysexAfter(w0, 0x5b).map(w => w.b)[0], ccs: ccsOf(w0) }; };
					const a = await pick("SID-6581", true), b = await pick("SWAVE-SAW", false); await pick("SWAVE-SAW", true); const id = { "SID-6581": 3, "SWAVE-SAW": 4 };
					if (!a.syx || a.syx[7] !== 0 || a.syx[8] !== id["SID-6581"] || a.syx[9] !== 0) c.bad.push("keep on: " + JSON.stringify(a.syx)); if (!b.syx || b.syx[7] !== 0 || b.syx[8] !== id["SWAVE-SAW"] || b.syx[9] !== 0) c.bad.push("keep off: " + JSON.stringify(b.syx));
					const pageOf = cc => [[48, 55, "SYN"], [56, 63, "AMP"], [72, 79, "FLT"], [80, 87, "EFX"], [88, 95, "LF1"], [104, 111, "LF2"], [112, 119, "LF3"]].find(([lo, hi]) => cc >= lo && cc <= hi)?.[2]; const pagesA = new Set(a.ccs.map(b => pageOf(b[1]))), pagesB = new Set(b.ccs.map(b => pageOf(b[1])));
					if ([...pagesA].some(p => p !== "SYN")) c.bad.push("keep on sent " + [...pagesA]); if (!["AMP", "FLT", "EFX", "LF1", "LF2", "LF3"].every(p => pagesB.has(p))) c.bad.push("keep off sent " + [...pagesB]); },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 20000 },
			{ say: "Song: SONG mode: SET STATUS 0x71 (mode 0x10); add a row: a song dump 0x69; select another song slot and Load: 0x6C with its slot; Save: 0x6D; Perform's POLY: 0x71 (0x20)", pageOnly: "the SysEx on the cable", act: async (u, c) => { c.bad = []; u.click(tab("song")); await sleep(400); c.m0 = machine().song?.songMode === true; c.r0 = JSON.stringify(songDoc()?.rows); let w0 = wireSeq; u.click(`[data-set="songpick"] button[data-v="${c.m0 ? "pattern" : "song"}"]`); await until(() => machine().song?.songMode === !c.m0, 8000); await sleep(800); const st = sysexAfter(w0, 0x71).map(w => w.b); if (!st.length || st[0][7] !== 0x10 || st[0][8] !== (c.m0 ? 0 : 1)) c.bad.push("mode " + JSON.stringify(st));
					if (machine().song?.songMode !== true) { u.click('[data-set="songpick"] button[data-v="song"]'); await until(() => machine().song?.songMode === true, 8000); await sleep(800); }
					w0 = wireSeq; u.click('[data-addpat="1"]'); await until(() => sysexAfter(w0, 0x69).length >= 1, 15000); await sleep(1500); const sd = sysexAfter(w0, 0x69).map(w => [w.b[9] ?? w.b[7], w.n]); if (!sd.length || sd[0][1] < 200) c.bad.push("0x69 " + JSON.stringify(sd)); await songSettled();
					await until(() => I().slots("song").length >= 24, 20000); c.sl = (machine().song?.current ?? 0) === 5 ? 6 : 5; w0 = wireSeq; u.click(`[data-ss="${c.sl}"]`); await sleep(250); u.click('[data-sa="load"]'); await until(() => machine().song?.current === c.sl, 12000); await sleep(800); const ld = sysexAfter(w0, 0x6c).map(w => w.b); if (!ld.length || ld[0][7] !== c.sl) c.bad.push("0x6C " + JSON.stringify(ld));
					w0 = wireSeq; u.click('[data-sa="save"]'); await sleep(800); if (dlgShown()) u.click($1("#dlg .danger") || dlgButton("Save")); await until(() => sysexAfter(w0, 0x6d).length >= 1, 10000); const sv = sysexAfter(w0, 0x6d).map(w => w.b); if (!sv.length || sv[0][7] !== c.sl) c.bad.push("0x6D " + JSON.stringify(sv));
					u.click(tab("perform")); await sleep(400); w0 = wireSeq; u.click('[data-pmode="poly"]'); await until(() => machine().poly === true, 8000); await sleep(800); const py = sysexAfter(w0, 0x71).map(w => w.b); if (!py.length || py[0][7] !== 0x20 || py[0][8] !== 1) c.bad.push("poly " + JSON.stringify(py)); u.click('[data-pmode="normal"]'); await sleep(1000); },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 90000 }
		],
		async tidy(u, c) {
			await closeLib(u); await back(u, c); const w = c.was; if (!w) return;
			/* loading and saving kits while pattern q played linked it to the kit it ended on: its own link back */
			if (c.pk0 != null && I().doc("pattern", c.q)?.kit !== c.pk0) { Bridge.send({ op: "patternKit", p: c.q, v: c.pk0, force: true }); await sleep(2500); }
			/* the machine is as the next journey expects it: its kit, pattern, song and mode, the tempo, POLY off */
			u.click(tab("perform")); await sleep(300); if (machine().poly) { u.click('[data-pmode="normal"]'); await sleep(1500); }
			if (machine().tempo !== w.tempo) { const d = w.tempo > machine().tempo ? -1 : 1; await u.drag("#bpm", [[0, d * 2 * Math.abs(w.tempo - machine().tempo)]]); await sleep(1200); }
			u.click(tab("song")); await sleep(300); if ((machine().song?.songMode === true) !== w.mode) { u.click(`[data-set="songpick"] button[data-v="${w.mode ? "song" : "pattern"}"]`); await sleep(2000); } if ((machine().song?.current ?? 0) !== w.s) await loadSlot(u, w.s);
			if (cur() !== w.p) { Bridge.send({ op: "select", p: w.p, now: true }); await sleep(2500); } if (machine().kit.current !== w.k) { u.click("#kitf"); await sleep(400); u.click(ksq(w.k)); if (await until(dlgShown, 1500)) u.click(dlgButton("Load without saving") || $1("#dlg .danger")); await until(() => machine().kit.current === w.k, 15000); await closeLib(u); }
			await closeLib(u); u.click(tab("seq")); await sleep(200);
		}
	};
	/* ---- The LCD, the mutes, the six tracks and the real-time control ---- */
	const pad2 = n => String(n).padStart(2, "0");
	const lcdBoxes = {
		name: "mm-lcd-boxes", proves: ["MM-064", "MM-066", "MM-068"],
		steps: [
			go("seq"), sel(0),
			{ say: "stopped, POSITION says --.--; PLAY: POSITION counts page.step as the machine plays, the page of 16 and the step in it, and the same page is lit on the rail's ALL / PAGE", act: async (u, c) => { c.stopped = $1("#pos").textContent; tele.steps = []; u.click("#play"); await until(() => S().playing && new Set(tele.steps).size >= 4, 8000); c.bad = []; c.n = 0; for (let i = 0; i < 10; i++) { await sleep(180); const s = S().step, text = $1("#pos").textContent; if (s >= 0) { c.n++; const want = pad2(Math.floor(s / 16) + 1) + "." + pad2(s % 16 + 1); if (text !== want) c.bad.push(`step ${s}: ${text} for ${want}`); } } c.pages = new Set([...tele.steps].map(s => Math.floor(s / 16))); u.click("#play"); await until(() => !S().playing, 4000); await sleep(300); c.after = $1("#pos").textContent; },
				screen: c => ok(c.stopped === "--.--" && c.after === "--.--" && c.n >= 6 && !c.bad.length && c.pages.size >= 1 && c.pages.size <= Math.ceil(S().len / 16), `stopped "${c.stopped}", after "${c.after}", ${c.n} samples, pages ${[...c.pages].map(p => p + 1)} of ${Math.ceil(S().len / 16)}, ${c.bad.slice(0, 3).join(" | ")}`), machine: () => ok(!tele.last?.playing, "playing"), within: 30000 },
			{ say: "the LCD names the kit that plays by its number and name; an edit says edited, a Save says saved; another kit loaded changes both", act: async (u, c) => { c.bad = []; const lcd = () => $1("#kitname").textContent.trim(), chip = () => ($all(".lcdpanel span").find(e => /^(saved|edited)$/.test(e.textContent.trim()))?.textContent || "").trim(), cur0 = machine().kit.current;
					const expect = k => `K${String(k + 1).padStart(2, "0")}`; if (!lcd().startsWith(expect(cur0)) || !lcd().includes(kitName(cur0).trim())) c.bad.push(`LCD "${lcd()}" for kit ${cur0 + 1} ${kitName(cur0)}`); c.chip0 = chip();
					u.click(tab("sound")); await sleep(300); await keep(c, "kit", cur0); await nudgeBox(u, 0, "AMP", 0); await until(() => chip() === "edited", 6000); c.chip1 = chip();
					u.click("#kitf"); await sleep(400); u.click(ksq(cur0), { alt: true }); await sleep(150); u.click('#libpop [data-la="save"]'); await answer(u, c); await until(() => chip() === "saved", 25000); c.chip2 = chip(); await closeLib(u);
					u.click("#kitf"); await sleep(400); const k1 = cur0 === 5 ? 6 : 5; u.click(ksq(k1)); if (await until(dlgShown, 1500)) u.click(dlgButton("Load without saving") || $1("#dlg .danger")); await until(() => machine().kit.current === k1, 15000); await sleep(600); await closeLib(u); if (!lcd().startsWith(expect(k1)) || !lcd().includes(kitName(k1).trim())) c.bad.push(`LCD "${lcd()}" for kit ${k1 + 1} ${kitName(k1)}`); c.k0 = cur0; },
				screen: c => ok(!c.bad.length && c.chip0 === "saved" && c.chip1 === "edited" && c.chip2 === "saved", `${c.bad.join(" | ")} chips ${c.chip0}, ${c.chip1}, ${c.chip2}`), within: 80000 },
			{ say: "pick each of the six tracks: the rail and the Kit header name the machine of the track in focus, the kit's machine", act: async (u, c) => { c.bad = []; u.click(tab("sound")); await sleep(300); for (let t = 0; t < 6; t++) { u.click(rail(t)); await sleep(250); const m = wk().tracks[t].machineName, hdr = $1("#machbtn .lcdtxt")?.textContent, railText = $1(`#rail .th[data-sel="${t}"]`)?.textContent || ""; if (hdr !== m) c.bad.push(`T${t + 1} header ${hdr} for ${m}`); if (!railText.includes(shortM(m).slice(0, 3)) && !railText.includes(m)) c.bad.push(`T${t + 1} rail "${railText.replace(/\\s+/g, " ").slice(0, 40)}" for ${m}`); if (S().tracks[t].m !== m) c.bad.push(`T${t + 1} page ${S().tracks[t].m}`); } },
				screen: c => ok(!c.bad.length, c.bad.slice(0, 4).join(" | ")), within: 1000 }
		],
		async tidy(u, c) { await closeLib(u); await back(u, c); if (c.k0 != null && machine().kit.current !== c.k0) { u.click("#kitf"); await sleep(400); u.click(ksq(c.k0)); if (await until(dlgShown, 1500)) u.click(dlgButton("Load without saving") || $1("#dlg .danger")); await sleep(2000); await closeLib(u); } }
	};
	const mutesGlobal = {
		name: "mm-perform-mutes", proves: ["MM-036", "MM-238"],
		steps: [
			go("perform"),
			{ say: "the Mutes card has the six synth tracks and the six MIDI tracks; muting T2 and M3 there: the machine's masks hold them and CC 3 goes out for the synth track", act: async (u, c) => { c.bad = []; const keys = $all(".mutes12 [data-gmute]").length; if (keys !== 12) c.bad.push("keys " + keys); c.m0 = JSON.stringify(machine().mutes); const w0 = wireSeq; u.click('[data-gmute="1"]'); await until(() => synthMuted(1), 6000); u.click('[data-gmute="8"]'); await until(() => ((machine().mutes?.midi ?? 0) >> 2 & 1) === 1, 6000); await sleep(500); const cc = ccsOf(w0).filter(b => b[1] === 3); if (!synthMuted(1) || ((machine().mutes?.midi ?? 0) >> 2 & 1) !== 1) c.bad.push("masks " + JSON.stringify(machine().mutes)); if (!Journey.noWire() && (!cc.length || cc[0][0] !== (0xb0 | (baseCh() + 1)) || cc[0][2] !== 1)) c.bad.push("CC 3 " + JSON.stringify(cc)); c.mutes = JSON.stringify(machine().mutes); },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 },
			{ say: "a mute is global, the machine's: another pattern and another kit loaded, the same tracks are still muted (and the page shows it)", act: async (u, c) => { c.p0 = cur(); const q = (c.p0 + 1) % 6; c.q = q; c.kq = I().doc("pattern", q)?.kit; u.click(tab("seq")); await sleep(300); u.click("#pat"); await sleep(300); u.click(psq(q)); await confirmIfAsked(u); await until(() => cur() === q, 15000); await sleep(1200); await closeLib(u); c.afterPat = JSON.stringify(machine().mutes); c.litPat = [synthMuted(1)];
					u.click("#kitf"); await sleep(400); const k1 = machine().kit.current === 7 ? 8 : 7; u.click(ksq(k1)); if (await until(dlgShown, 1500)) u.click(dlgButton("Load without saving") || $1("#dlg .danger")); await until(() => machine().kit.current === k1, 15000); await sleep(1200); await closeLib(u); c.afterKit = JSON.stringify(machine().mutes); u.click(tab("perform")); await sleep(400); c.pressed = [pressed('[data-gmute="1"]') === false, pressed('[data-gmute="8"]') === false]; },
				machine: c => ok(c.afterPat === c.mutes && c.afterKit === c.mutes, `after pattern ${c.afterPat}, after kit ${c.afterKit}, was ${c.mutes}`), screen: c => ok(c.pressed.every(Boolean), "keys show " + c.pressed), within: 60000 }
		],
		async tidy(u, c) { await closeLib(u); u.click(tab("perform")); await sleep(300); if (synthMuted(1)) u.click('[data-gmute="1"]'); if (((machine().mutes?.midi ?? 0) >> 2 & 1) === 1) u.click('[data-gmute="8"]'); await sleep(800); 
			/* the kit loaded on the other pattern linked that pattern to it (the machine's rule): its own kit loaded again on it, which
			   links it back (no undo step, so the runner's back cannot take it away), then the pattern as found */
			if (c.q != null && c.kq != null && cur() === c.q && I().doc("pattern", c.q)?.kit !== c.kq) { Bridge.send({ op: "loadKit", k: c.kq, force: true }); await until(() => machine().kit?.current === c.kq && I().doc("pattern", c.q)?.kit === c.kq, 8000); await sleep(600); }
			if (c.p0 != null && cur() !== c.p0) { Bridge.send({ op: "select", p: c.p0, now: true }); await sleep(2000); } }
	};
	const sixTracks = {
		name: "mm-seq-six-tracks", proves: ["MM-002", "MM-006", "MM-009"],
		steps: [
			go("seq"),
			/* B-107 (the 0.6 e2e run, "step NaN is not shown"): a factory pattern's tracks hold notes on (or under) every step
			   the journey can draw on. It draws in an empty pattern of banks E to H instead (a pick there loads no kit, B-053) */
			{ say: "when a track has no free step from step 9 on, pick an empty pattern in banks E to H in the pattern chooser (it loads no kit)", within: 20000,
				act: async (u, c) => { await until(() => I().slots("pattern").length >= 128, 30000);
					/* room on track t: a step from 9 on that is empty and under no note's bar (the step before that holds anything is a NOTE OFF or none) */
					const room = t => { const st = trkOf(t).steps; for (let x = 8; x < S().len; x++) { if (st[x]) continue; let k = x - 1; while (k >= 0 && !st[k]) k--; if (k < 0 || st[k].off) return true; } return false; };
					if ([0, 1, 2, 3, 4, 5].every(room)) return;
					const eh = [...Array(64).keys()].map(k => k + 64).filter(p => p !== cur() && I().doc("pattern", p));
					c.p0 = cur(); c.p = eh.find(p => !patTrigs(p)) ?? eh.sort((a, b) => patTrigs(a) - patTrigs(b))[0]; if (c.p == null) throw new Error("no pattern in banks E to H");
					u.click("#pat"); await until(() => $all("#libpop .ps").length === 128, 4000); u.click(`#libpop .ps[data-ps="${c.p}"]`); await confirmIfAsked(u); if (!$1("#libpop").hidden) u.key("Escape"); await until(() => cur() === c.p, 15000); },
				machine: c => ok(c.p == null || cur() === c.p, "pattern " + cur()) },
			sel(0), { say: "six tracks, each a sequencer and a synth of its own: a note in track t's roll and a value on its AMP page change only track t, in the pattern and in the kit", act: async (u, c) => { c.n0 = histN(); c.bad = [];
					for (let t = 0; t < 6; t++) { u.click(tab("seq")); await sleep(250); u.click(rail(t)); await sleep(250); const before = JSON.stringify([patDoc().tracks.filter((x, i) => i !== t), patDoc().midiTracks]); const s = freeSteps(t, 1, 8, rollCell(t, 0).n)[0]; const p = rollCell(t, s); u.click(p.c, {}, p.fx, p.fy); if (!await until(() => trigsOf(t).includes(s), 4000)) { c.bad.push(`T${t + 1}: no note`); continue; } await sleep(200);
						if (JSON.stringify([patDoc().tracks.filter((x, i) => i !== t), patDoc().midiTracks]) !== before) c.bad.push(`T${t + 1}: another track's pattern changed`);
						u.click(tab("sound")); await sleep(300); const r = await nudgeBox(u, t, "AMP", 1), e = checkBox(r, t, "AMP", 1); if (e) c.bad.push(`T${t + 1}: ${e}`); } },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 },
			{ say: "six delays, one a track: DTIM, DSND, DFB, DBAS and DWID of each track send CC 83 to 87 on that track's channel and move that track's own value", act: async (u, c) => { c.bad = []; c.n = 0; for (let t = 0; t < 6; t++) { u.click(rail(t)); await sleep(250); for (const i of [3, 4, 5, 6, 7]) { const e = checkBox(await nudgeBox(u, t, "EFX", i), t, "EFX", i); if (e) c.bad.push(`T${t + 1}: ${e}`); else c.n++; } } },
				screen: c => ok(!c.bad.length && c.n === 30, c.bad.slice(0, 3).join(" | ") + ` ${c.n} of 30`), within: 1000 },
			{ say: "full real-time control: the wheel over a value moves it a step (Shift: ten) and each move is a CC; a drag across the box sends a stream of CCs that climbs with the pointer", act: async (u, c) => { c.bad = []; u.click(rail(0)); await sleep(250); const q = '#main .pc[data-g="AMP"][data-n="2"]'; const v0 = cellOf(0, "AMP", 2); let w0 = wireSeq; u.wheel(q, v0 > 100 ? -1 : 1); await sleep(500); const a = cellOf(0, "AMP", 2); w0 = wireSeq; u.wheel(q, a > 100 ? -1 : 1, { shift: true }); await sleep(500); const b = cellOf(0, "AMP", 2); if (Math.abs(a - v0) !== 1 || Math.abs(b - a) !== 10) c.bad.push(`wheel ${v0} -> ${a} -> ${b}`);
					const d0 = cellOf(0, "AMP", 2), up = d0 < 80 ? 1 : -1; w0 = wireSeq; await u.drag(q, [[up * 6, 0], [up * 12, 0], [up * 18, 0], [up * 24, 0], [up * 30, 0]]); await sleep(600); const cc = ccsOf(w0).filter(x => x[1] === 58).map(x => x[2]), d1 = cellOf(0, "AMP", 2); if (Journey.noWire()) { if (up > 0 ? d1 <= d0 : d1 >= d0) c.bad.push(`drag: DEC ${d0} -> ${d1}`); } else if (cc.length < 3 || !cc.every((v, k) => k === 0 || (up > 0 ? v >= cc[k - 1] : v <= cc[k - 1])) || cc[cc.length - 1] === cc[0]) c.bad.push("drag CCs " + cc); },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 }
		],
		async tidy(u, c) { await back(u, c);
			if (c.p0 != null && cur() !== c.p0) { u.click("#pat"); await sleep(400); u.click(`#libpop .ps[data-ps="${c.p0}"]`); await confirmIfAsked(u); await sleep(800); if (!$1("#libpop").hidden) u.key("Escape"); } }
	};
	/* the four things the machine's BANK keys do with FUNCTION on the sequencer: ARP, TRANSPOSE, SWING, SLIDE */
	const bankFunctions = {
		name: "mm-seq-bank-functions", proves: ["MM-038"],
		steps: [
			go("seq"), sel(0),
			{ say: "ARP and TRANSPOSE are docks under the roll; SLIDE and SWING are in the step menu; SWG is on the LCD: one of each on track 1, each in the pattern", act: async (u, c) => { c.n0 = histN(); c.bad = []; await dockOpen(u, "arp"); const m0 = arpOf(0).mode; u.click(`[data-set="arpmode"] button[data-v="${m0 === 3 ? 2 : 3}"]`); if (!await until(() => arpOf(0).mode !== m0, 4000)) c.bad.push("ARP");
					await dockOpen(u, "trn"); const t0 = patDoc().tracks[0].transpose; u.click('#main .pc[data-g="trn"][data-n="TRACK"]', { cmd: true }); typeIn(u, t0 === 4 ? "+5" : "+4"); if (!await until(() => patDoc().tracks[0].transpose !== t0, 4000)) c.bad.push("TRANSPOSE");
					u.click('[data-dock="locks"]'); await sleep(200); const s0 = [...Array(S().len - 2).keys()].find(s => !slidesOf(0).includes(s) && !slidesOf(0).includes(s + 1)); if (S().stepSel) clearSel(); await dragRoll(u, 0, [s0, s0 + 1], { cmd: true }); await until(() => S().stepSel?.from === s0, 2000); await stepPick(u, 0, null, "step-slide"); if (!await until(() => slidesOf(0).includes(s0) && slidesOf(0).includes(s0 + 1), 4000)) c.bad.push("SLIDE");
					if (S().stepSel) clearSel(); const w0 = [...Array(S().len).keys()].find(s => !swingsOf(0).includes(s)); await stepPick(u, 0, w0, "step-swing"); if (!await until(() => swingsOf(0).includes(w0), 4000)) c.bad.push(`SWING step ${w0}: ${swingsOf(0)}`); if (S().stepSel) clearSel(); await sleep(200);
					const sw = patDoc().swingAmount; u.wheel('#lcd2 [data-l2="swing"]', sw < 30 ? 1 : -1); if (!await until(() => patDoc().swingAmount !== sw, 4000)) c.bad.push("SWG on the LCD"); },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 }
		],
		async tidy(u, c) { if (DeskMenu.shown) closeDeskMenu(); if (S().stepSel) clearSel(); if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); await back(u, c); }
	};
	/* SLICE5-MM-END */
	/* ---------- wave 12: the gaps (doc/release/PLAN-0.6.md, Gap triage) ---------- */
	/* MM-102: the machine's UNDO KIT from the kit library (KIT > LOAD KIT > UNDO KIT with the machine's keys) */
	const workName = () => MmConvert.kitName(wk() || {});
	const kitEdited = () => machine().kit?.working === "edited";
	const undoKitJ = {
		name: "mm-lib-undo-kit", proves: ["MM-102", "MM-X07"],
		steps: [
			openKits2,
			{ say: "rename the kit that plays to UNDOJRNY (an unsaved edit)", act: async (u, c) => {
				c.k0 = machine().kit.current; u.click(ks2(c.k0), { alt: true }); await sleep(150); u.click('#libpop [data-la="rename"]'); await sleep(250); u.type("#lsin", "UNDOJRNY"); await sleep(100); u.key("Enter"); await answer(u, c); },
				machine: () => ok(workName().trim() === "UNDOJRNY" && kitEdited(), `working ${workName()}, ${machine().kit?.working}`), within: 25000 },
			{ say: "click another kit and load it without saving: the machine keeps the edited kit as its UNDO KIT", act: async (u, c) => { c.k1 = otherSlot(); u.click(ks2(c.k1)); await answer(u, c); },
				machine: c => ok(machine().kit.current === c.k1 && workName().trim() !== "UNDOJRNY", `kit ${machine().kit.current}, working ${workName()}`), within: 25000 },
			{ say: "click UNDO KIT: the edited kit plays again, unsaved, in its own slot", act: async (u, c) => { u.click('#libpop [data-la="undokit"]'); await answer(u, c); },
				machine: c => ok(machine().kit.current === c.k0 && workName().trim() === "UNDOJRNY" && kitEdited(), `kit ${machine().kit.current}, working ${workName()}, ${machine().kit?.working}`), within: 25000 },
			{ say: "press Escape", act: u => u.key("Escape"), screen: () => ok($1("#libpop").hidden, "open") }
		],
		async tidy(u, c) { if (c.k0 == null) return; Bridge.send({ op: "loadKit", k: c.k0, force: true }); await until(() => machine().kit.current === c.k0, 6000); Bridge.send({ op: "loadKit", force: true }); await until(() => !kitEdited(), 8000); }
	};
	/* MM-083, MM-184, MM-203: a step's locks go, its note stays (the step menu's Clear locks, on the step or the selection) */
	const stepLocks = (t, s) => (patDoc().locks || []).filter(l => l.track === t && l.page !== 7 && l.steps.some(([x]) => x === s));
	const clearStepLocksJ = {
		name: "mm-seq-clear-step-locks", proves: ["MM-083", "MM-184", "MM-203"],
		steps: [
			go("seq"),
			{ say: "pick a track with notes, the Locks tab", act: async (u, c) => { c.u0 = machine().history?.undoCount || 0; c.t = [0, 1, 2, 3, 4, 5].find(t => trigsOf(t).length >= 2) ?? 0; u.click(rail(c.t)); await sleep(200); if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); },
				screen: c => ok(S().sel === c.t && !!$1("#lane"), "no lane"), machine: c => ok(trigsOf(c.t).length >= 2, "fewer than two notes") },
			{ say: "draw locks across the lane over two notes", act: async (u, c) => { c.on = trigsOf(c.t).filter(s => s < S().len).slice(0, 2); await u.drag(`#lane .lb[data-s="${c.on[0]}"]`, [`#lane .lb[data-s="${c.on[1]}"]`], {}, { fy: 0.3 }); },
				machine: c => ok(c.on.every(s => stepLocks(c.t, s).length > 0), "locks " + JSON.stringify(patDoc().locks)), within: 15000 },
			{ say: "⌘-click the first of them, click the ⋯ on it and choose Clear locks (keep the notes)", act: async (u, c) => { if (S().stepSel) clearSel(); const p = rollCell(c.t, c.on[0]); u.click(p.c, { cmd: true }, p.fx, p.fy);
				await until(() => !!$1("#stepmore") && !$1("#stepmore").hidden, 2000); u.click("#stepmore"); await until(() => !!$1('#deskmenu [data-mid="clear-step-locks"]'), 1500); u.click('#deskmenu [data-mid="clear-step-locks"]'); },
				machine: c => ok(stepLocks(c.t, c.on[0]).length === 0 && stepLocks(c.t, c.on[1]).length > 0 && trigsOf(c.t).includes(c.on[0]), `step ${c.on[0] + 1} locks ${stepLocks(c.t, c.on[0]).length}, step ${c.on[1] + 1} ${stepLocks(c.t, c.on[1]).length}, notes ${trigsOf(c.t)}`),
				screen: c => ok(!!S().tracks[c.t].steps[c.on[0]] && ![...S().locks].some(([k, m]) => +k.split("|")[0] === c.t && m.has(c.on[0])), "the page still shows a lock or lost the note"), within: 15000 },
			{ ...undoKey, machine: c => ok(stepLocks(c.t, c.on[0]).length > 0, "locks not back"), within: 15000 },
			{ say: "right-click the second step (the shortcut) and choose Clear locks: the same for it", act: async (u, c) => { const p = rollCell(c.t, c.on[1]); u.rightClick(p.c, {}, p.fx, p.fy); await sleep(150); u.click('#deskmenu [data-mid="clear-step-locks"]'); },
				machine: c => ok(stepLocks(c.t, c.on[1]).length === 0 && stepLocks(c.t, c.on[0]).length > 0 && trigsOf(c.t).includes(c.on[1]), `locks ${stepLocks(c.t, c.on[1]).length}, notes ${trigsOf(c.t)}`), within: 15000 }
		],
		async tidy(u, c) { if (S().stepSel) clearSel(); await undoUntil(u, () => (machine().history?.undoCount || 0) <= c.u0, 6); }
	};
	/* MM-201: the lane's parameter locked at its current value on the selected step (the lock key in the rail's header) */
	const lockCurrentJ = {
		name: "mm-seq-lock-current", proves: ["MM-201"],
		steps: [
			go("seq"),
			{ say: "pick a track with a note, the Locks tab", act: async (u, c) => { c.u0 = machine().history?.undoCount || 0; c.t = [0, 1, 2, 3, 4, 5].find(t => trigsOf(t).some(s => s < S().len && stepLocks(t, s).length === 0)) ?? 0;
				if (S().side === "midi") u.click('[data-side="int"]'); u.click(rail(c.t)); await sleep(200); if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); },
				screen: c => ok(S().sel === c.t && !!$1("#lockLane"), "no lock key") },
			{ say: "Cmd-click one of its notes: selected", act: (u, c) => { c.s = trigsOf(c.t).find(s => s < S().len && stepLocks(c.t, s).length === 0); if (S().stepSel) clearSel(); const p = rollCell(c.t, c.s); u.click(p.c, { cmd: true }, p.fx, p.fy); },
				screen: c => ok(same(S().stepSel, { t: c.t, n: 1, from: c.s, to: c.s + 1 }), "selection " + JSON.stringify(S().stepSel)) },
			{ say: "click the lock key: the lane's parameter is locked on the step at the value the kit has", act: (u, c) => { c.lane = S().lane; [c.pg, c.pi] = [PAGES.indexOf(c.lane.split(".")[0]), +c.lane.split(".")[1]]; c.kit = wk()?.tracks[c.t]?.pages?.[c.pg]?.[c.pi]; u.click("#lockLane"); },
				machine: c => { const l = (patDoc().locks || []).find(x => x.track === c.t && x.page === c.pg && x.param === c.pi), v = l?.steps.find(([x]) => x === c.s)?.[1]; return ok(v != null && c.kit != null && v === c.kit, `lock ${v}, kit ${c.kit}, ${c.lane}`); },
				screen: c => ok(S().locks.get(c.t + "|" + c.lane)?.has(c.s), "the lane shows no lock"), within: 15000 },
			{ ...undoKey, act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(!(patDoc().locks || []).some(x => x.track === c.t && x.page === c.pg && x.param === c.pi && x.steps.some(([s]) => s === c.s)), "lock still there"), within: 15000 },
			{ say: "⌘-click a note, ⌘⇧-click a later one, click the lock key: every selected note is locked, in one undo step", act: async (u, c) => {
				c.ns = trigsOf(c.t).filter(s => s < S().len && stepLocks(c.t, s).length === 0); if (c.ns.length < 2) throw new Error("fewer than two notes without locks");
				c.a = c.ns[0]; c.b = c.ns[Math.min(c.ns.length - 1, 3)]; c.in = c.ns.filter(s => s >= c.a && s <= c.b);
				if (S().stepSel) clearSel(); let p = rollCell(c.t, c.a); u.click(p.c, { cmd: true }, p.fx, p.fy); await sleep(150); p = rollCell(c.t, c.b); u.click(p.c, { cmd: true, shift: true }, p.fx, p.fy); await sleep(150);
				c.h = machine().history?.undoCount || 0; u.click("#lockLane"); },
				machine: c => { const l = (patDoc().locks || []).find(x => x.track === c.t && x.page === c.pg && x.param === c.pi), on = new Map(l?.steps || []);
					return ok(c.in.length >= 2 && c.in.every(s => on.get(s) === c.kit) && (machine().history?.undoCount || 0) === c.h + 1, `notes ${c.in}, locks ${JSON.stringify(l?.steps)}, undo +${(machine().history?.undoCount || 0) - c.h}`); }, within: 15000 },
			{ ...undoKey, act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(!(patDoc().locks || []).some(x => x.track === c.t && x.page === c.pg && x.param === c.pi && x.steps.some(([s]) => c.in.includes(s))), "a lock is still there after one undo"), within: 15000 }
		],
		async tidy(u, c) { if (S().stepSel) clearSel(); await undoUntil(u, () => (machine().history?.undoCount || 0) <= c.u0, 6); }
	};
	/* MM-095: the kit a pattern plays, set in the pattern chooser (its Kit list) */
	const patKitJ = {
		name: "mm-lib-pattern-kit", proves: ["MM-095"],
		steps: [
			{ say: "click the pattern on the LCD, Alt-click another pattern: selected, not loaded", act: async (u, c) => { c.p0 = cur(); c.p = (c.p0 + 3) % 128; u.click("#pat"); await sleep(300); u.click(`#libpop .ps[data-ps="${c.p}"]`, { alt: true }); },
				screen: c => ok(!$1("#libpop").hidden && !!$1("#patkit"), "no Kit list"), machine: c => ok(cur() === c.p0 && !!I().doc("pattern", c.p), "pattern " + cur()), within: 6000 },
			{ say: "choose another kit in the Kit list: the pattern plays that kit", act: async (u, c) => { c.k0 = I().doc("pattern", c.p).kit; c.k = (c.k0 + 5) % 128; await choose(u, "patkit", String(c.k)); },
				machine: c => ok(I().doc("pattern", c.p)?.kit === c.k && cur() === c.p0, `pattern ${c.p + 1} kit ${I().doc("pattern", c.p)?.kit}, playing ${cur()}`), screen: c => ok(!$1("#libpop").hidden && +$1("#patkit")?.value === c.k, `list ${$1("#patkit")?.value}, open ${!$1("#libpop").hidden}`), within: 15000 },
			{ ...undoKey, act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(I().doc("pattern", c.p)?.kit === c.k0, "kit " + I().doc("pattern", c.p)?.kit), within: 15000 },
			{ say: "press Escape", act: u => u.key("Escape"), screen: () => ok($1("#libpop").hidden, "open") },
			go("sound"), sel(0),
			{ say: "drag a value: the kit has unsaved edits", act: async (u, c) => { c.u1 = machine().history?.undoCount || 0; await u.drag('#main .pc[data-g="FLT"]', [[6, 0], [12, 0], [18, 0]]); }, machine: () => ok(kitEdited(), "kit " + machine().kit?.working), within: 8000 },
			{ say: "click the pattern on the LCD, Alt-click the pattern that plays, choose another kit in its Kit list: the machine would load it at once, so it asks first", act: async (u, c) => {
				c.kp = I().doc("pattern", c.p0)?.kit; c.kn = (c.kp + 5) % 128; u.click("#pat"); await sleep(300); u.click(`#libpop .ps[data-ps="${c.p0}"]`, { alt: true }); await until(() => !!$1("#patkit"), 2000); await choose(u, "patkit", String(c.kn)); },
				screen: () => ok(dlgShown() && /lost/.test($1("#dlg")?.textContent || ""), "question " + ($1("#dlg")?.textContent || "none").slice(0, 80)), machine: c => ok(I().doc("pattern", c.p0)?.kit === c.kp && kitEdited(), `kit ${I().doc("pattern", c.p0)?.kit}, ${machine().kit?.working}`), within: 6000 },
			{ say: "press Escape (Cancel): the pattern keeps its kit, the edits stay", act: u => u.key("Escape"), screen: () => ok(!dlgShown(), "still asking"),
				machine: c => ok(I().doc("pattern", c.p0)?.kit === c.kp && kitEdited() && machine().kit.current === c.kp, `pattern kit ${I().doc("pattern", c.p0)?.kit}, kit ${machine().kit.current}, ${machine().kit?.working}`), within: 3000 }
		],
		async tidy(u, c) { if (dlgShown()) u.key("Escape"); if (!$1("#libpop").hidden) u.key("Escape"); await sleep(200); if (c.u1 != null) await undoUntil(u, () => (machine().history?.undoCount || 0) <= c.u1, 6); }
	};
	/* MM-271: the arrangement header counts the bars and beats the song has played (the EDIT SONG header's counter) */
	const barBeat = n => String((n >> 4) + 1).padStart(3, "0") + ":" + String(((n & 15) >> 2) + 1).padStart(2, "0");
	const songCounterJ = {
		name: "mm-song-counter", proves: ["MM-271"],
		steps: [
			go("song"),
			{ say: "stop, click SONG over the palette: song mode", act: async (u, c) => { if (S().playing) { u.click("#play"); await until(() => !S().playing, 3000); } c.m0 = machine().song?.songMode === true; u.click('[data-set="songpick"] button[data-v="song"]'); },
				machine: () => ok(machine().song?.songMode === true, "songMode " + machine().song?.songMode), within: 8000 },
			{ say: "press PLAY: the header reads Playing and the bars and beats played", act: async (u, c) => { results.length = 0; u.click("#play");
				for (let i = 0; i < 5 && await until(() => results.some(r => r.op === "play" && r.ok === false), 1500); i++) { results.length = 0; await sleep(1500); u.click("#play"); } },
				screen: () => { const n = tele.last?.songSteps, h = $1("#arrstate")?.textContent || ""; return ok(n != null && h === "Playing · " + barBeat(n), `header "${h}", steps ${n}`); },
				machine: () => ok(tele.last?.playing && tele.last.songSteps >= 0, "songSteps " + tele.last?.songSteps), within: 8000 },
			{ say: "a bar later the counter reads bar 002", act: async () => { await until(() => (tele.last?.songSteps ?? 0) >= 17, 12000); },
				screen: () => ok(/^Playing · 002:0[1-4]$/.test($1("#arrstate")?.textContent || ""), "header " + $1("#arrstate")?.textContent), machine: () => ok(tele.last?.songSteps >= 16, "songSteps " + tele.last?.songSteps), within: 4000 },
			{ say: "press STOP: no counter", act: u => { if (S().playing) u.click("#play"); }, screen: () => ok(!/\d{3}:\d{2}/.test($1("#arrstate")?.textContent || ""), "header " + $1("#arrstate")?.textContent), machine: () => ok(!S().playing, "playing"), within: 8000 }
		],
		async tidy(u, c) { if (S().playing) { u.click("#play"); await until(() => !S().playing, 3000); } if (c.m0 === false && machine().song?.songMode !== false) { u.click('[data-set="songpick"] button[data-v="pattern"]'); await sleep(1000); } }
	};
	/* MM-301: a multi map range plays any of the 128 patterns (its PAT list, CUR and A01-H16) */
	const mapPatJ = {
		name: "mm-perform-map-pattern", proves: ["MM-301"],
		steps: [
			go("perform"),
			{ say: "click Multi map: the map table, the first range's PAT list holds CUR and all 128 patterns", act: (u, c) => { c.g = machine().global?.current ?? 0; c.p0 = I().doc("global", c.g)?.multiMap?.[1]?.[0]; u.click('[data-pmode="map"]'); },
				screen: () => ok(!!$1("#mpat0") && $1("#mpat0").options.length === 129 && $1("#mpat0").options[128].textContent === "H16", `${$1("#mpat0")?.options.length} entries, the last ${$1("#mpat0")?.options[128]?.textContent}`) },
			{ say: "choose H16 for the first range: the global's map plays it", act: async u => { await choose(u, "mpat0", "127"); },
				machine: c => ok(I().doc("global", c.g)?.multiMap?.[1]?.[0] === 127, "PAT " + I().doc("global", c.g)?.multiMap?.[1]?.[0]), screen: () => ok(+$1("#mpat0")?.value === 127 && $1("#mpat0").selectedOptions[0]?.textContent === "H16", "shows " + $1("#mpat0")?.value), within: 15000 },
			{ ...undoKey, act: u => { blur(); u.key("z", { cmd: true }); }, machine: c => ok(I().doc("global", c.g)?.multiMap?.[1]?.[0] === c.p0, "PAT " + I().doc("global", c.g)?.multiMap?.[1]?.[0]), within: 15000 }
		],
		async tidy(u) { if ($1('[data-pmode="normal"]')) u.click('[data-pmode="normal"]'); await recvIdle(); }
	};
	/* ---------- the end-to-end pass: factory content as a person uses it (scripts/mdmm-e2e.sh, doc/release/E2E.md) ---------- */
	/* What the machine plays, as the page can see it: transport, step and song row from the telemetry, the output's peaks
	   (the plug-in's outputLevel, every 250 ms, since the last one). Not silent where sound is the point. */
	const heard = { peak: 0 };
	Bridge.onMessage(m => { if (m.type === "outputLevel") heard.peak = Math.max(heard.peak, m.peakL || 0, m.peakR || 0); });
	const playFor = async (u, ms, wantRows) => {
		const r = { started: false, steps: new Set(), rows: new Set(), peak: 0 };
		heard.peak = 0; tele.steps = [];
		u.click("#play");
		r.started = await until(() => !!tele.last?.playing, 5000);
		if (!r.started) { r.again = true; u.click("#play"); r.started = await until(() => !!tele.last?.playing, 5000); }	/* a person presses again */
		const end = performance.now() + ms;
		while (performance.now() < end) {
			if (tele.last?.playing) { r.steps.add(tele.last.step); if (tele.last.songRow != null) r.rows.add(tele.last.songRow); }
			if (r.steps.size >= 8 && heard.peak > 0.0002 && (!wantRows || r.rows.size >= 2)) break;
			await sleep(60);
		}
		r.peak = heard.peak;
		u.click("#play"); await until(() => !S().playing && !tele.last?.playing, 5000);
		return r;
	};
	const realSongs = {
		name: "mm-real-factory-songs", proves: ["MM-X02", "MM-X02"],
		steps: [
			go("song"),
			{ say: "from factory memory: load each song that holds rows (click it, Load), SONG mode, PLAY: the machine starts, the step moves, the song moves on to a later row, the output is not silent, STOP stops it", within: 3000,
				act: async (u, c) => {
					await until(() => I().slots("song").length >= 24, 30000);
					c.songs = [...Array(24).keys()].filter(s => (I().doc("song", s)?.rows || []).some(r => r.kind === "pattern"));
					c.bad = []; c.good = []; c.s0 = machine().song?.current ?? 0; c.m0 = machine().song?.songMode === true;
					if (!c.songs.length) throw new Error("no factory song holds rows");
					for (const s of c.songs) {
						await loadSlot(u, s);
						u.click('[data-set="songpick"] button[data-v="song"]'); await until(() => machine().song?.songMode === true, 6000); await sleep(300);
						const rows = (I().doc("song", s)?.rows || []).filter(r => r.kind === "pattern").length;
						const r = await playFor(u, 10000, rows > 1);
						if (s === c.songs[0]) Journey.snapshot("mm-real-song-playing");
						const why = [!r.started && "did not start (pressed twice)", r.again && r.started && "needed a second press of PLAY", r.started && r.steps.size < 4 && `only ${r.steps.size} steps moved`, r.peak <= 0.0002 && "silent", rows > 1 && r.rows.size < 2 && `stayed on row ${[...r.rows].join(",") || "?"}`, S().playing && "did not stop"].filter(Boolean);
						Bridge.log(`E2E song ${s + 1}: ${rows} rows, ${r.steps.size} steps, rows ${[...r.rows].join(",")}, peak ${r.peak.toFixed(3)}${why.length ? " PROBLEM " + why.join(", ") : ""}`);
						(why.length ? c.bad : c.good).push(why.length ? `song ${s + 1} (${rows} rows): ${why.join(", ")}` : s + 1);
					}
					if (c.bad.length && c.bad.every(b => /silent/.test(b))) c.bad.push("every song reads silent: the background run zeroes the output (run with GEARMULATOR_MDMM_BACKGROUND_METER=1, scripts/mdmm-e2e.sh)");
					c.note = `${c.good.length} of ${c.songs.length} songs played: ${c.good.join(" ")}`;
				}, screen: c => ok(!c.bad.length, c.bad.join("; ")) }
		],
		async tidy(u, c) { if (S().playing) u.click("#play"); if (c.m0 === false) { u.click('[data-set="songpick"] button[data-v="pattern"]'); await sleep(800); } if (c.s0 != null) await loadSlot(u, c.s0).catch(() => { }); await back(u, c); }
	};
	const realPatterns = {
		name: "mm-real-factory-patterns", proves: ["MM-X03", "MM-X03"],
		steps: [
			{ say: "from factory memory: pick eight patterns that hold notes, spread over the 128, one after the other, and PLAY each: the step moves through the pattern and the output is not silent", within: 3000,
				act: async (u, c) => {
					await until(() => I().slots("pattern").length >= 128, 30000);
					const withNotes = [...Array(128).keys()].filter(p => patTrigs(p) > 0);
					c.picks = [...Array(8).keys()].map(k => withNotes[Math.floor(k * withNotes.length / 8)]).filter(p => p != null);
					c.bad = []; c.good = []; c.p0 = cur();
					if (!c.picks.length) throw new Error("no factory pattern holds notes");
					for (const p of c.picks) {
						u.click("#pat"); await until(() => $all("#libpop .ps").length === 128, 4000); u.click(`#libpop .ps[data-ps="${p}"]`); await confirmIfAsked(u);
						if (!await until(() => cur() === p, 8000)) { c.bad.push(`pattern ${p + 1}: the machine stayed on ${cur() + 1}`); continue; }
						if (!$1("#libpop").hidden) u.key("Escape");
						await sleep(300);
						const r = await playFor(u, 12000, false);
						if (p === c.picks[0]) Journey.snapshot("mm-real-pattern-playing");
						const why = [!r.started && "did not start (pressed twice)", r.again && r.started && "needed a second press of PLAY", r.started && r.steps.size < 8 && `only ${r.steps.size} steps moved`, r.peak <= 0.0002 && "silent"].filter(Boolean);
						Bridge.log(`E2E pattern ${p + 1}: ${r.steps.size} steps, peak ${r.peak.toFixed(3)}${why.length ? " PROBLEM " + why.join(", ") : ""}`);
						(why.length ? c.bad : c.good).push(why.length ? `pattern ${p + 1}: ${why.join(", ")}` : p + 1);
					}
					c.note = `${c.good.length} of ${c.picks.length} patterns played: ${c.good.join(" ")}`;
				}, screen: c => ok(!c.bad.length, c.bad.join("; ")) }
		],
		async tidy(u, c) { if (S().playing) u.click("#play"); if (c.p0 != null && cur() !== c.p0) { u.click("#pat"); await sleep(400); u.click(`#libpop .ps[data-ps="${c.p0}"]`); await sleep(800); if (!$1("#libpop").hidden) u.key("Escape"); } }
	};
	/* What you draw is what plays: in an empty pattern four notes are drawn, the machine plays them (the position moves, the
	   output is not silent); the pattern cleared, it plays silence; one undo and it plays them again. The page reads the transport
	   and the output's peaks, not each note the firmware fires: the peaks stand for "the notes play". */
	const playPeak = async (u, ms, skip) => {
		heard.peak = 0; tele.steps = [];
		u.click("#play");
		const started = await until(() => !!tele.last?.playing, 5000);
		await sleep(skip); heard.peak = 0; await sleep(ms - skip);
		const r = { started, peak: heard.peak, steps: new Set(tele.steps).size };
		u.click("#play"); await until(() => !S().playing && !tele.last?.playing, 5000);
		return r;
	};
	const hasNotes = p => patTrigs(p) > 0;
	const realSequence = {
		name: "mm-real-sequence-plays", proves: ["MM-X24"],
		steps: [
			go("seq"),
			{ say: "pick a pattern with no notes in the pattern chooser", within: 20000,
				act: async (u, c) => { await until(() => I().slots("pattern").length >= 128, 30000); c.p0 = cur(); c.p = [...Array(128).keys()].find(p => I().doc("pattern", p) && !hasNotes(p)); c.own = c.p == null;
					/* the factory memory may hold no empty pattern: then it clears one of its own (kept first, so the tidy puts it back) */
					if (c.own) c.p = [...Array(128).keys()].find(p => I().doc("pattern", p) && p !== c.p0) ?? c.p0; if (c.p == null) throw new Error("no pattern to use"); await keep(c, "pattern", c.p);
					u.click("#pat"); await until(() => $all("#libpop .ps").length === 128, 4000); u.click(`#libpop .ps[data-ps="${c.p}"]`); await confirmIfAsked(u); if (!$1("#libpop").hidden) u.key("Escape");
					if (c.own) { await until(() => cur() === c.p, 8000); blur(); u.key("Delete", { alt: true }); await until(() => !hasNotes(c.p), 15000); await sleep(2000); } },
				machine: c => ok(cur() === c.p && !hasNotes(c.p), "pattern " + cur()) },
			sel(0),
			{ say: "click four cells of the piano roll", act: async (u, c) => {
				c.n = rollCell(c.t, 0).n;
				c.steps = [0, 4, 8, 12].map(k => freeSteps(c.t, 1, k, c.n)[0]).filter(s => s != null);
				if (c.steps.length < 4) throw new Error("no four free steps");
				for (const s of [...c.steps].reverse()) { const p = rollCell(c.t, s); u.click(p.c, {}, p.fx, p.fy); await sleep(250); }
				await sleep(300); Journey.snapshot("mm-real-sequence-drawn"); },
				machine: c => ok(c.steps.every(s => trigsOf(c.t).includes(s)), `pattern has ${trigsOf(c.t).join(",")}`), within: 10000 },
			{ say: "press PLAY for six seconds: the position moves through the pattern and the output is not silent", within: 3000,
				act: async (u, c) => { c.on = await playPeak(u, 6000, 1500); }, machine: c => ok(c.on.started && c.on.steps >= 8 && c.on.peak > 0.0002, `started ${c.on.started}, ${c.on.steps} steps, peak ${c.on.peak.toFixed(4)}`) },
			{ say: "press Alt+Delete: the pattern is cleared; PLAY: it moves and plays silence", within: 3000,
				act: async (u, c) => { blur(); u.key("Delete", { alt: true }); await until(() => !hasNotes(c.p), 15000); await sleep(2000); c.off = await playPeak(u, 5000, 1500); Journey.snapshot("mm-real-sequence-cleared"); },
				machine: c => ok(c.off.started && c.off.steps >= 8 && c.off.peak < 0.0001, `started ${c.off.started}, ${c.off.steps} steps, peak ${c.off.peak.toFixed(4)}`) },
			{ say: "press Cmd+Z once: the four notes are back and play again", within: 3000,
				act: async (u, c) => { blur(); u.key("z", { cmd: true }); await until(() => c.steps.every(s => trigsOf(c.t).includes(s)), 15000); c.back = await playPeak(u, 6000, 1500); Bridge.log(`E2E undo then play at once: peak ${c.back.peak.toFixed(4)}, ${c.back.steps} steps`); if (c.back.peak <= 0.0002) { await sleep(3000); c.back2 = await playPeak(u, 6000, 1500); Bridge.log(`E2E undo, 3 s later, play: peak ${c.back2.peak.toFixed(4)}`); c.late = c.back2.peak > 0.0002; } },
				machine: c => ok(c.steps.every(s => trigsOf(c.t).includes(s)) && c.back.started && c.back.peak > 0.0002, `notes ${trigsOf(c.t).join(",")}, the page says they are back but the machine played silence at once after the undo (peak ${c.back.peak.toFixed(4)})${c.late ? ", and played them 3 s later" : ""}`) }
		],
		/* the pattern it drew in and cleared: undone, then pasted back from the clipboard (a clear leaves more than the notes behind) */
		async tidy(u, c) { if (S().playing) u.click("#play"); await back(u, c); }
	};
	const e2eReal = [realSongs, realPatterns, realSequence];

	const wave12 = [undoKitJ, clearStepLocksJ, lockCurrentJ, patKitJ, songCounterJ, mapPatJ];
	/* Screen review 2026-10-13 (B-110 and on): the screens the review found cut or overlapped, measured at the page's size
	   (the page tier runs at 1440 x 924, as the review's pictures). One step per defect found. */
	const edProblems = () => $all("canvas.ed").filter(c => c.clientWidth && ED[c.dataset.ed]).flatMap(c => Journey.canvasProblems(c, drawEd).map(x => `${c.dataset.ed}: ${x}`));
	const screensFit = {
		name: "mm-screens-fit", proves: [],
		steps: [
			{ say: "Pattern: the track list's rows (number, name, M, S, dice) sit on one centre line, whole, and the keys are one size (B-110)",
				act: async (u, c) => { await closeLib(u); u.click(tab("seq")); await sleep(400); c.bad = []; c.n = 0;
					for (const r of $all("#rail .th")) { c.n++; const mid = e => { const q = e.getBoundingClientRect(); return q.top + q.height / 2; }, ks = [".m", ".s", ".g"].map(q => r.querySelector(q)), n = r.querySelector(".n"), nm = r.querySelector(".nm b");
						if (ks.some(k => !k)) { c.bad.push("a key is missing on " + r.textContent.trim().slice(0, 12)); continue; }
						const ms = [...ks, n, nm].map(mid), size = ks.map(k => { const q = k.getBoundingClientRect(); return Math.round(q.width) + "x" + Math.round(q.height); });
						if (Math.max(...ms) - Math.min(...ms) > 1.5) c.bad.push(`track ${r.dataset.sel}: centres ${ms.map(Math.round).join(",")}`);
						if (new Set(size).size > 1) c.bad.push(`track ${r.dataset.sel}: key sizes ${size.join(" ")}`); }
					for (const r of $all("#rail .th")) { const b = r.querySelector(".nm b"), k = r.querySelector(".m"); if (!b || !k) continue; const probe = b.textContent; b.textContent = "GND-EMPTY-LONGEST"; const nb = b.getBoundingClientRect(), kb = k.getBoundingClientRect(), cs = getComputedStyle(b);
						if (nb.right > kb.left - 1) c.bad.push(`track ${r.dataset.sel}: a long name reaches the M key (${Math.round(nb.right)} > ${Math.round(kb.left)})`); if (cs.textOverflow !== "ellipsis" || cs.overflow !== "hidden") c.bad.push(`track ${r.dataset.sel}: names are not ellipsised`); if (!b.title) c.bad.push(`track ${r.dataset.sel}: no tooltip with the full name`); b.textContent = probe; }
					c.bad.push(...Journey.overlaps("#rail .th .ms", "#rail .th .n, #rail .th .nm")); },
				screen: c => ok(c.n === 6 && !c.bad.length, `${c.n} rows; ${c.bad.slice(0, 4).join(" | ")}`) },
			{ say: "the step help (the ? key) opens fully inside the window and right of the track list, never under it", act: async (u, c) => { await closeLib(u); u.click(tab("seq")); await sleep(400); const k = $1("#steplegend"); k.focus(); k.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); await sleep(250); const p = $1(".glegpop").getBoundingClientRect(), r = $1("#rail").getBoundingClientRect(); c.p = p; c.ok = p.width > 100 && p.left >= r.right && p.right <= innerWidth && p.top >= 0 && p.bottom <= innerHeight; },
				screen: c => ok(c.ok, `popup ${Math.round(c.p.left)}..${Math.round(c.p.right)} x ${Math.round(c.p.top)}..${Math.round(c.p.bottom)} in ${innerWidth} x ${innerHeight}`) }
			,			{ say: "Perform and Kit: what the drawn panels draw fits them: the multi envelope's caption and the amp envelope's caption clear of the curve and its handles, no handle cut by an edge, no caption past the edge (B-111)",
				act: async (u, c) => { c.bad = []; c.n = 0;
					for (const ws of ["perform", "sound"]) { u.click(tab(ws)); await sleep(500); c.n += $all("canvas.ed").filter(x => x.clientWidth).length; for (const x of edProblems()) c.bad.push(ws + " " + x); } },
				screen: c => ok(c.n > 3 && !c.bad.length, `${c.n} canvases; ${[...new Set(c.bad)].slice(0, 4).join(" | ")}`) },
			{ say: "the pattern chooser's toolbar: its labels (SLOT A01, KIT) show whole, clear of the keys beside them (B-112)",
				act: async (u, c) => { await closeLib(u); u.click(tab("seq")); await sleep(300); u.click("#pat"); await sleep(500);
					c.bad = [...Journey.spills("#libpop .libacts .ilab"), ...Journey.overlaps("#libpop .libacts .ilab", "#libpop .libacts button")]; c.n = $all("#libpop .libacts .ilab").length; await closeLib(u); },
				screen: c => ok(c.n >= 2 && !c.bad.length, `${c.n} labels; ${c.bad.join(" | ")}`) },
			{ say: "the kit library: a kit's name of the longest length (11 letters) fits its tile (B-112)",
				act: async (u, c) => { await closeLib(u); u.click("#kitf"); await sleep(500);
					const tile = $1("#libpop .ks .lsn"); c.n = $all("#libpop .ks").length; c.bad = [];
					if (tile) { const probe = tile.cloneNode(false); probe.textContent = "W".repeat(11); tile.after(probe); if (probe.scrollWidth > probe.clientWidth + 0.5) c.bad.push(`11 letters need ${probe.scrollWidth} px, the name's box is ${probe.clientWidth}`); probe.remove(); }
					await closeLib(u); },
				screen: c => ok(c.n >= 64 && !c.bad.length, `${c.n} tiles; ${c.bad.join(" | ")}`) }
			,{ say: "the GEN dialog's summary line shows whole at this size: what it writes (8 on), the cycle and the steps (B-114)",
				act: async (u, c) => { await closeLib(u); u.click(tab("seq")); await sleep(400); await genAt(u, 0); c.bad = [...Journey.cutText($1("#genpop")), ...Journey.spills("#genpop .gdsum")]; c.text = $1("#genpop .gdsum")?.textContent.trim(); u.click("#genpop [data-gencancel]"); await sleep(250); },
				screen: c => ok(c.text && !c.bad.length, `"${c.text}" ${c.bad.join(" | ")}`) }
			,{ say: "the line under the Locks, Arp, Transpose and Trig setup tabs shows whole, and so does each of the four Transpose lines (---, FIX, MAJ, MIN) (B-115)",
				act: async (u, c) => { await closeLib(u); u.click(tab("seq")); await sleep(300); c.bad = []; c.n = 0;
					for (const d of ["locks", "arp", "trn", "trig"]) { if (!$1(`[data-dock="${d}"]`)) continue; u.click(`[data-dock="${d}"]`); await sleep(350); c.n++; for (const x of Journey.cutText()) if (/dkhelp|lanehelp/.test(x)) c.bad.push(d + ": " + x); }
					const line = $1(".dkhelp"); if (line && typeof TRNSHORT !== "undefined") { const keep = line.innerHTML; for (const h of TRNSHORT) { line.innerHTML = h; if (line.scrollWidth > line.clientWidth + 1) c.bad.push(`"${line.textContent.slice(0, 20)}" ${line.scrollWidth - line.clientWidth} px cut`); } line.innerHTML = keep; }
					if ($1('[data-dock="locks"]')) u.click('[data-dock="locks"]'); },
				screen: c => ok(c.n >= 3 && !c.bad.length, `${c.n} tabs; ${c.bad.join(" | ")}`) }
			,{ say: "Song: the Arrangement card's header shows whole: its state and how many rows (B-116)",
				act: async (u, c) => { await closeLib(u); u.click(tab("song")); await sleep(500); const card = $1(".arrcard header"); c.bad = card ? [...Journey.cutText(card), ...Journey.spills(".arrcard header *")] : ["no Arrangement card"]; c.text = card?.textContent.trim().replace(/\s+/g, " "); u.click(tab("seq")); },
				screen: c => ok(c.text && !c.bad.length, `"${c.text}" ${c.bad.join(" | ")}`) }
			,{ say: "a handle at the very edge of a panel (value 0 or 127) is drawn whole: a probe canvas with handles on all four edges (B-117)",
				act: async (u, c) => { const cv = document.createElement("canvas"); cv.className = "ed"; cv.dataset.ed = "__probe"; cv.style.cssText = "position:fixed;left:10px;top:10px;width:200px;height:100px;opacity:0;pointer-events:none"; document.body.appendChild(cv);
					ED.__probe = { draw() {}, handles: (W, H) => [{ x: 0, y: 50, k: "L", c: "#000" }, { x: W, y: 50, k: "R", c: "#000" }, { x: W / 2, y: 0, k: "T", c: "#000" }, { x: W / 2, y: H, k: "B", c: "#000" }] };
					try { c.bad = Journey.canvasProblems(cv, drawEd, { crossing: false }); } finally { delete ED.__probe; cv.remove(); } },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")) }
		],
		async tidy(u) { await closeLib(u); u.click(tab("seq")); }
	};
	/* ---------- 0.8 MIDI Learn, the Control workspace (L5): the plug-in's mappings, from the learn document ----------
	   The page tier's stub host has no learn engine (it says "enabled: false"), so these journeys play the plug-in: they send
	   the learn document the plug-in would send after each command (the commands are checked as sent), and look at what the
	   page shows. The editor-tier run with the real engine is L6's (*-control-learn). */
	const lmp = (index, t, pg, i, cc, ch, o = {}) => Object.assign({ index, t, pg, i, name: "x", cc, ch, mode: "Absolute", invert: false, overrides: [] }, o);
	const lLimits = () => ({ tracks: 6, max: 128, params: [...Array(7).keys()].flatMap(pg => [...Array(8).keys()].map(i => ({ pg, i, name: "p" }))).concat([{ pg: 7, i: 0, name: "Level" }]) });
	const lDoc = (mappings, o = {}) => Object.assign({ enabled: true, mappings, learning: null, limits: lLimits() }, o);
	const lSend = doc => window.gm.recv([{ type: "learn", doc }]);
	const toastText = () => $1("#toast")?.textContent || "";
	const learnKey = () => $1("#learnkey");
	const note = k => $1(`#main [data-learnnote="${k}"]`)?.textContent || "";
	const lastLearn = op => [...learnSent].reverse().find(m => m.op === op);
	const cell = (src, t) => $1(`#main .mxc[data-mxsrc="${src}"][data-mxt="${t}"]`);
	const FLT0 = t => `#main .pc[data-g="FLT"][data-n="0"][data-t="${t}"], #main .pc[data-g="FLT"][data-n="0"]`;
	/* the journey's start: mapping on (the plug-in's learn document says enabled), the Kit page shown, track 3 selected */
	const learnOn = async (u, mappings = [], o = {}) => { S().ctl.sel = "cc21"; S().ctl.selT = null; lSend(lDoc(mappings, o)); await sleep(200); u.click(tab("sound")); await sleep(300); u.click(rail(2)); await sleep(200); learnSent.length = 0; };
	/* put back: the page says mapping is off again (the stub's own document), nothing waits, back on the Pattern page */
	const learnTidy = async u => { if (S().learn) u.key("Escape"); lSend({ enabled: false, mappings: [], learning: null }); await sleep(150); S().ctl.doc = null; S().ctl.left = ""; S().ctl.sel = "cc21"; S().ctl.selT = null; if (S().ws !== "seq") u.click(tab("seq")); };
	const learnJ = {
		start: {
			name: "mm-control-learn-start", proves: [],
			steps: [
				{ say: "the plug-in says mapping is on: the Control tab and the LEARN key appear", act: async u => { lSend(lDoc([])); await sleep(250); },
					screen: () => ok(!$1(tab("control")).hidden && !learnKey().hidden, "control tab hidden " + $1(tab("control")).hidden + ", LEARN hidden " + learnKey().hidden) },
				{ say: "open Kit, pick track 3, press LEARN: the page is in LEARN, the toast says what to do", act: async u => { u.click(tab("sound")); await sleep(300); u.click(rail(2)); await sleep(200); learnSent.length = 0; u.click("#learnkey"); },
					screen: () => ok(S().learn && /turn a knob on your controller/.test(toastText()), "learn " + S().learn + ", toast " + toastText()) },
				{ say: "click T3 FLT value 1: it waits for a knob, learnStart names track 3, FLT (page 2), value 0", act: u => u.click(FLT0(2).split(",")[0]),
					screen: () => { const c = lastLearn("learnStart"); return ok(S().learnT && S().learnT.t === 2 && S().learnT.pid === "FLT.0" && c && c.t === 2 && c.pg === 2 && c.i === 0, "waiting " + JSON.stringify(S().learnT) + ", sent " + JSON.stringify(c)); }, within: 2000 },
				{ say: "press LEARN again: learnCancel goes out, nothing waits", act: u => u.click("#learnkey"),
					screen: () => ok(!S().learn && lastLearn("learnCancel") && !$1("body").classList.contains("learn"), "learn " + S().learn) }
			],
			tidy: learnTidy
		},
		progress: {
			name: "mm-control-learn-progress", proves: [],
			steps: [
				go("seq"),
				{ say: "LEARN on, a value waits; the plug-in has seen one value of two", act: async u => { await learnOn(u); u.click("#learnkey"); await sleep(150); u.click(FLT0(2).split(",")[0]); await sleep(150);
						lSend(lDoc([], { learning: { t: 2, pg: 2, i: 0, name: "x", got: 1, need: 2 } })); await sleep(250); },
					screen: () => ok(S().learnT && /1 of 2/.test(toastText()), "waiting " + JSON.stringify(S().learnT) + ", toast " + toastText()) },
				{ say: "open Control: the inspector says Learning T3 FLT ... both ways (1 of 2)", act: u => u.click(tab("control")),
					screen: () => ok(/Learning T3 FLT .*both ways \(1 of 2\)/.test(note("learning")), "note " + note("learning")), within: 2000 },
				{ say: "the second value: 2 of 2 is shown until the plug-in completes it", act: async () => { lSend(lDoc([], { learning: { t: 2, pg: 2, i: 0, name: "x", got: 2, need: 2 } })); await sleep(200); },
					screen: () => ok(/2 of 2/.test(note("learning")), "note " + note("learning")) }
			],
			tidy: learnTidy
		},
		complete: {
			name: "mm-control-learn-complete", proves: [],
			steps: [
				go("seq"),
				{ say: "LEARN on, T3 FLT value 1 clicked, the plug-in learns CC 21 on channel 1", act: async u => { await learnOn(u); u.click("#learnkey"); await sleep(150); u.click(FLT0(2).split(",")[0]); await sleep(150);
						lSend(lDoc([], { learning: { t: 2, pg: 2, i: 0, name: "x", got: 1, need: 2 } })); await sleep(100);
						lSend(lDoc([lmp(0, 2, 2, 0, 21, 0)])); await sleep(250); },
					screen: () => ok(!S().learnT && /^Learned CC 21 on channel 1: T3 FLT /.test(toastText()), "waiting " + JSON.stringify(S().learnT) + ", toast " + toastText()) },
				{ say: "open Control: a row for CC 21 on channel 1 (a learned CC that is not a knob row's) has T3 in its column", act: u => u.click(tab("control")),
					screen: () => { const r = $all("#main .srch.k-cc").map(x => x.textContent); return ok(r.length === 9 && /CC 21 ch 1/.test(r[8]) && cell("x0:21", 2)?.classList.contains("on"), "rows " + r.length + ", last " + r[8]); }, within: 2000 },
				{ say: "select that row: its inspector header says CC 21, channel 1, saved with the project; one target T3 FLT", act: u => u.click('#main .srch[data-src="x0:21"]'),
					screen: () => ok(/CC 21 · channel 1 · saved with the project/.test($1("#main .ctlui .card:last-child header")?.textContent || "") && $all("#main .lnk").length === 1, $1("#main .ctlui .card:last-child header")?.textContent), within: 2000 }
			],
			tidy: learnTidy
		},
		digit: {
			name: "mm-control-learn-digit", proves: [],
			steps: [
				go("seq"),
				{ say: "LEARN on, a value waits: pressing 3 adds knob row 3's CC (23) on any channel; the page keeps no link of its own", act: async u => { await learnOn(u); u.click("#learnkey"); await sleep(150); u.click(FLT0(2).split(",")[0]); await sleep(150); learnSent.length = 0; u.key("3"); await sleep(250); },
					screen: () => { const c = lastLearn("learnAdd"); return ok(c && c.cc === 23 && c.t === 2 && c.pg === 2 && c.i === 0 && c.ch === undefined && S().ctl.links.length === 0 && !S().learnT, "sent " + JSON.stringify(c) + ", links " + S().ctl.links.length); } },
				{ say: "the plug-in's document comes back: knob row 3 has T3 in its column", act: async u => { lSend(lDoc([lmp(0, 2, 2, 0, 23, 255)])); u.click(tab("control")); await sleep(300); },
					screen: () => ok(cell("cc23", 2)?.classList.contains("on") && S().ctl.sel === "cc23", "cell on " + cell("cc23", 2)?.classList.contains("on") + ", row " + S().ctl.sel), within: 2000 }
			],
			tidy: learnTidy
		},
		override: {
			name: "mm-control-learn-override", proves: [],
			steps: [
				go("seq"),
				{ say: "a mapping of CC 73 on channel 1 hides the machine's own targets: the inspector says so in one line", act: async u => { await learnOn(u, [lmp(0, 0, 2, 3, 73, 0, { overrides: [{ ch: 0, t: 0, pg: 2, i: 1 }] }), lmp(1, 2, 2, 0, 21, 255)]); u.click(tab("control")); await sleep(300); u.click('#main .srch[data-src="x0:73"]'); },
					screen: () => ok(/^Overrides the machine's CC 73 on channel 1: T1 FLT /.test($1("#main [data-ovr]")?.textContent || ""), "line " + $1("#main [data-ovr]")?.textContent), within: 2000 },
				{ say: "a mapping that hides nothing (CC 21, knob row 1) has no such line", act: u => u.click('#main .srch[data-src="cc21"]'),
					screen: () => ok(!$1("#main [data-ovr]") && $all("#main .lnk").length === 1, "lines " + $all("#main [data-ovr]").length), within: 2000 }
			],
			tidy: learnTidy
		},
		remove: {
			name: "mm-control-learn-remove", proves: [],
			steps: [
				go("seq"),
				{ say: "Control, knob row 1 has two targets; click x on the first: learnRemove index 0", act: async u => { await learnOn(u, [lmp(0, 2, 2, 0, 21, 255), lmp(1, 0, 2, 1, 21, 255)]); u.click(tab("control")); await sleep(300); u.click('#main .srch[data-src="cc21"]'); await sleep(200); u.click('#main [data-mdel="0"]'); },
					screen: () => ok(lastLearn("learnRemove")?.index === 0, "sent " + JSON.stringify(lastLearn("learnRemove"))), within: 2000 },
				{ say: "the plug-in's document without it: one target left, the cell is empty", act: async () => { lSend(lDoc([lmp(0, 0, 2, 1, 21, 255)])); await sleep(250); },
					screen: () => ok($all("#main .lnk").length === 1 && !cell("cc21", 2)?.classList.contains("on") && cell("cc21", 0)?.classList.contains("on"), "targets " + $all("#main .lnk").length) },
				{ say: "Add target on knob row 1 (T4, a value): learnAdd with CC 21 and no channel (any)", act: async u => { u.pick("lt", "3"); await sleep(200); u.click("#laddl"); },
					screen: () => { const c = lastLearn("learnAdd"); return ok(c && c.cc === 21 && c.t === 3 && c.ch === undefined && c.pg >= 0 && c.i >= 0, "sent " + JSON.stringify(c)); }, within: 2000 },
				{ say: "on a row learned for channel 2: Add target sends the channel", act: async u => { lSend(lDoc([lmp(0, 0, 2, 1, 21, 255), lmp(1, 1, 3, 0, 74, 1)])); await sleep(250); u.click('#main .srch[data-src="x1:74"]'); await sleep(200); u.click("#laddl"); },
					screen: () => { const c = lastLearn("learnAdd"); return ok(c && c.cc === 74 && c.ch === 1, "sent " + JSON.stringify(c)); }, within: 2000 },
				{ say: "the mapping gone from the document: its row goes (a row exists only while it has a mapping, knob rows stay)", act: async () => { lSend(lDoc([lmp(0, 0, 2, 1, 21, 255)])); await sleep(250); },
					screen: () => ok($all("#main .srch.k-cc").length === 8 && S().ctl.sel === "cc21", "rows " + $all("#main .srch.k-cc").length + ", selected " + S().ctl.sel) }
			],
			tidy: learnTidy
		},
		invert: {
			name: "mm-control-learn-invert", proves: [],
			steps: [
				go("seq"),
				{ say: "Control, one target: Inv is off; click it: learnInvert index 0", act: async u => { await learnOn(u, [lmp(0, 2, 2, 0, 21, 255)]); u.click(tab("control")); await sleep(300); u.click('#main [data-minv="0"]'); },
					screen: () => ok(!pressed('#main [data-minv="0"]') && lastLearn("learnInvert")?.index === 0 && !$1('#main [data-minv="0"]').classList.contains("on"), "sent " + JSON.stringify(lastLearn("learnInvert"))), within: 2000 },
				{ say: "the plug-in's document with it inverted: Inv is lit", act: async () => { lSend(lDoc([lmp(0, 2, 2, 0, 21, 255, { invert: true })])); await sleep(250); },
					screen: () => ok($1('#main [data-minv="0"]').classList.contains("on"), "lit " + $1('#main [data-minv="0"]').className) }
			],
			tidy: learnTidy
		},
		esc: {
			name: "mm-control-learn-esc", proves: [],
			steps: [
				go("seq"),
				{ say: "LEARN on with a value waiting, on the Kit page: Esc leaves LEARN and cancels it", act: async u => { await learnOn(u); u.click("#learnkey"); await sleep(150); u.click(FLT0(2).split(",")[0]); await sleep(150); learnSent.length = 0; blur(); u.key("Escape"); },
					screen: () => ok(!S().learn && !$1("body").classList.contains("learn") && lastLearn("learnCancel"), "learn " + S().learn), within: 2000 },
				{ say: "again on the Control page", act: async u => { u.click(tab("control")); await sleep(250); u.click("#learnkey"); await sleep(150); learnSent.length = 0; blur(); u.key("Escape"); },
					screen: () => ok(!S().learn && lastLearn("learnCancel"), "learn " + S().learn), within: 2000 }
			],
			tidy: learnTidy
		},
		paused: {
			name: "mm-control-learn-paused", proves: [],
			steps: [
				go("seq"),
				{ say: "the HW MIDI engine: the document says paused; the inspector says why; LEARN does not start", act: async u => { await learnOn(u, [], { paused: "MIDI learn is off with the HW MIDI engine." }); u.click(tab("control")); await sleep(300); learnSent.length = 0; u.click("#learnkey"); await sleep(250); },
					screen: () => ok(/LEARN is paused: MIDI learn is off with the HW MIDI engine/.test(note("paused")) && !S().learn && /paused/.test(toastText()) && !lastLearn("learnStart"), "note " + note("paused") + ", toast " + toastText()), within: 2000 },
				{ say: "LEARN on first, then the engine changes to HW: LEARN is left and the toast says why", act: async u => { lSend(lDoc([])); await sleep(200); u.click("#learnkey"); await sleep(150);
						lSend(lDoc([], { paused: "MIDI learn is off with the HW MIDI engine." })); await sleep(250); },
					screen: () => ok(!S().learn && /LEARN is paused/.test(toastText()), "learn " + S().learn + ", toast " + toastText()) }
			],
			tidy: learnTidy
		},
		limit: {
			name: "mm-control-learn-limit", proves: [],
			steps: [
				go("seq"),
				{ say: "128 mappings: the inspector counts them and says it is the most; Add target is off", act: async u => { const ms = Array.from({ length: 128 }, (_, n) => lmp(n, n % 6, 2, n % 8, 21 + (n >> 3) % 8, 255));
						await learnOn(u, ms); u.click(tab("control")); await sleep(400); },
					screen: () => ok(/128 mappings at most/.test(note("full")) && /128 of 128 mappings/.test($1("#main .lhead")?.textContent || "") && $1("#laddl")?.disabled, "note " + note("full") + ", add disabled " + $1("#laddl")?.disabled), within: 3000 },
				{ say: "one fewer: Add target is on again", act: async () => { lSend(lDoc(Array.from({ length: 127 }, (_, n) => lmp(n, n % 6, 2, n % 8, 21 + (n >> 3) % 8, 255)))); await sleep(300); },
					screen: () => ok(!note("full") && !$1("#laddl")?.disabled, "note " + note("full")) }
			],
			tidy: learnTidy
		},
		left: {
			name: "mm-control-learn-left", proves: [],
			steps: [
				go("seq"),
				{ say: "a project that left two mappings out: one toast with the count, the inspector lists them", act: async u => { await learnOn(u, [], { left: ["$.mappings[3]: track 17 is outside 1..6", "$.mappings[5]: no such value"] }); u.click(tab("control")); await sleep(300); },
					screen: () => ok(/Left out when the project loaded \(2\)/.test(note("left")) && /track 17/.test(note("left")) && /2 saved mappings could not be loaded/.test(toastText()), "note " + note("left") + ", toast " + toastText()), within: 2000 }
			],
			tidy: learnTidy
		},
		nolinks: {
			name: "mm-control-learn-no-links", proves: [],
			steps: [
				go("seq"),
				{ say: "a CC row's inspector has no MIN, MAX or curve controls (the page's own links are gone); the mapping shows Absolute, Inv and x", act: async u => { await learnOn(u, [lmp(0, 2, 2, 0, 21, 255)]); u.click(tab("control")); await sleep(300); },
					screen: () => ok(!$1('#main .pc[data-g="link"]') && !$1('#main [data-set="lcurve"]') && !$1("#main [data-linv]") && $1('#main [data-minv="0"]') && $1('#main [data-mdel="0"]') && /Absolute/.test($1("#main .lnk")?.textContent || ""),
						"link controls " + $all('#main .pc[data-g="link"]').length), within: 2000 },
				{ say: "a value on the Kit page that a mapping drives is marked as mapped", act: async u => { u.click(tab("sound")); await sleep(300); },
					screen: () => ok($1('#main .pc[data-g="FLT"][data-n="0"]')?.classList.contains("mapped") && !$1('#main .pc[data-g="FLT"][data-n="1"]')?.classList.contains("mapped"), "mapped " + document.querySelectorAll("#main .pc.mapped").length) }
			],
			tidy: learnTidy
		}
	};
	const all = [screensFit, ...e2eReal, /* SLICE5-MM-LIST */ machineReference, trackEffects, lfoJ, mixBuses, wireCc, envJ, pitchKeys, locksJ, recLocks, arpSetup, lcdSetup, trigSetup, midiSeqJ, midiDocks, performKeys, performMulti, assignJ, joystickJ, menvNrpn, songRowSettings, songRowMarks, songRowsCopy, globalSync, spellWord, bboxDrums, chooserJ, sameKit, kitSlots, kitParts, copyPageNote, wireSysex, lcdBoxes, mutesGlobal, sixTracks, bankFunctions, ...wave12, bootCard, copyWhat, clearWhat, firstBeat, spaceKey, pauseJ, panicJ, tempoWindowJ, tempoReleaseJ, playFromJ, tempoDrag, patNext, wsKeys, helpKeys, plate, undoRedo, gridRecord, slidePaint, lenKey, lockLane, arpDock, arpRange, trnKeys, trnKeyBlur, trnPlaying, leaveStopped,
		genMut, shapeSound, machinePick, revertTrackJ, machineStays, songModeJ, songPlayhead, midiSide, controlAll, mixStrip, mixHeads, mixSolo, soloSaved, shiftMutes, routing, mixMeters, panTrim, msOff, msViews, railLamps, railLampsFwd,
		poly, polyTrack, keyTracking, menvModes, multiTrig, multiMap, kbPlay, kbLit, followPlayed, typeValue, songRows, songPicker, songSlotsJ, songKeysJ, songChain, modeCycle, kitLoad, kitCopy, patGo, dialogEsc,
		audioPanel, romCard, notePlay,
		tapTempo, queue, dialogKeys, trackKeys, muteKeys, lockRamp, laneKitDrag, laneDrawSlide, pages, copyPaste, clearAll, fill, rotate, pasteMany, pasteKeeps, liveRec, liveErase, stepRec, genKeys, genModal, laneTools, gridFits, mutScope,
		valueKeys, soundCopy, screenDrag, filterEnv, lfoLocksJ, dragM, midiMutes, joyAssign, menvPort, menvLayout, performLayout, menvCurve, uniSubFine, plateGreys, osHelp, songInspector, songDrag, kitSaveAs, kitRename, kitClear, patClear, hwNoMachine,
		blackKeys, octaveRange, kitStep, rollPaint, rollDrawLength, deleteGap, noteClickArrows, rollSimple, rollMidiLen, selectCopyPaste, stepMenuJ, buttonsCopyPaste, syxImportJ, syxImportMute, osCopyPaste, rotateUndo, faderUndo, tapTempoShift, shotsImport, editorMenuJ, memoryJ, dropSyxJ, globalChannels, globalReset, globalSlot, globalPage, globalClickOut, modalLock, lockKeysFit, globalCopyPaste, globalTune, globalControlOut, shotsGlobal, genBarFit, shotsSound, shotsReview, ...viewJs, ...cpuJs, ...volJs, syxExportKinds, syxVerify, syxNoReadBack, syxPlace, resetEmpty, syxRunningReach, ...Object.values(learnJ)];
	/* every journey's tidy is followed by a look: if the machine's documents or modes still differ from what the journey found, back(u, c) puts them back (the journey's own tidy first, for what is its own;
	   its guard, "left:", names what stays). What back cannot put back, the journey keeps first (keep, keepMany) or is alone: true (doc/modern-ux/JOURNEYS.md, "Independent journeys") */
	for (const j of all) { const own = j.tidy; j.tidy = async (u, c) => { try { if (own) await own(u, c); } finally { if (c.back0?.state && Journey.stateDiff(c.back0.state, state())) await back(u, c); } }; }

	/* The guard between journeys (as md: mdDeskJourneys.js between): it says what the one before left and puts it right only after a
	   journey that failed; a journey that passed leaves nothing (doc/modern-ux/JOURNEYS.md, "Independent journeys"). Waiting for the
	   machine to restart is not a fix: a person waits too. */
	async function between(u, fix = true) {
		const left = [];
		const act = async (what, f) => { left.push(what); if (fix) await f(); };
		for (let i = 0; i < 3 && dlgShown(); i++) { await act("a question open", async () => { u.key("Escape"); await sleep(200); }); if (!fix) break; }
		for (const q of ["#libpop", "#globpop", "#keyspop", "#audiopop", "#kpop", "#machpop"]) if ($1(q) && !$1(q).hidden) await act(q + " open", async () => { u.key("Escape"); await sleep(150); });
		/* the machine restarting (a journey that reset it: the start-up card is back): it is waited for, as a person waits, so
		   the next journey does not meet a covered page (md-engine-memory, then md-top-cpu-meter ... in the 0.6 evidence run) */
		if (!$1("#bootcard").hidden) { await until(() => $1("#bootcard").hidden, 120000); await sleep(1500); }
		if (!$1("#bootcard").hidden) $1('#bootcard [data-bootrom="close"]')?.click();
		if (S().playing) await act("playing", async () => { u.click("#play"); await until(() => !S().playing, 3000); });
		if (S().mode && S().mode !== "normal" && S().ws === "perform") await act("Perform in the mode " + S().mode, async () => { u.click('[data-pmode="normal"]'); });
		/* PATTERN mode: a journey that left the machine in SONG mode left the LCD's pattern keys under the song row for the next one (mm-song-play-from, then mm-top-pattern-next) */
		if (machine().song?.songMode === true) await act("the machine in SONG mode", async () => { Bridge.send({ op: "seqMode", song: false }); await until(() => machine().song?.songMode === false, 4000); });
		await sleep(600);
		return left.length ? `left ${left.join(", ")}${fix ? " (after a failure: put right)" : ""}` : "";
	}
	/* what the guard compares before and after each journey (shared/deskJourney.js, page.state): the machine's documents and modes
	   (as mdDeskJourneys.js state); a document is a short hash of its JSON, a slot loaded only in one of the two is not compared */
	const VOLATILE = new Set(["nameTail", "lfoState", "source", "pending"]);
	const hash = x => JSON.stringify(x, (k, v) => VOLATILE.has(k) ? undefined : v) || "";
	function state() {
		const i = I(), m = i.machine || {};
		const o = { "pattern slot": m.pattern?.current, "kit slot": m.kit?.current, "song slot": m.song?.current, "global slot": m.global?.current, "song mode": m.song?.songMode, playing: !!m.playing || !!S().playing,
			mutes: JSON.stringify(m.mutes || null), "working kit": hash(i.workingKit && { slot: i.workingKit.slot, doc: i.workingKit.doc }), "kit state": m.kit?.working, chain: JSON.stringify(m.desk?.chain || null) };
		/* the kit that plays is the working kit's (the page shows the working kit in its slot: the slot's own copy is not refreshed by an undo) */
		for (const [kind, name] of [["pattern", "pattern"], ["kit", "kit"], ["song", "song"], ["global", "global"]]) for (const k of i.slots(kind)) if (!(kind === "kit" && k === m.kit?.current)) o[`${name} ${k}`] = hash(i.doc(kind, k));
		return o;
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
	if (/[?&]selftest=journey/.test(location.search)) addEventListener("load", () => Journey.run(all, { log: t => Bridge.log(t), ready, prepare, between, context, state, begin }));
	return { all };
})();
