"use strict";
/* The Machinedrum Editor's user journeys (diagnostics builds only; skins/shared/deskJourney.js says what a
   journey is). Each one is what a person does through the page's own controls, each step checked twice: on the
   screen, and in the plug-in's documents (what the firmware read back). ?selftest=journey runs them all,
   journey-<names> some (journey-md-seq-*). Names: md-<area>-<what>, the areas: boot, top, keys, seq, gen, sound,
   mix, song, sampler, lib, global, audio, engine, dialog (doc/modern-ux/JOURNEYS.md lists them against the features). */
const MdJourneys = (() => {
	const { ok, sleep, until } = Journey;
	/* a tapped tempo against the journey's own clock: 5 % (a busy Mac moves the key events by tens of ms against it; the
	   page tier runs beside the gate's other stages) */
	const tapSlack = want => Math.max(1.5, want * 0.05);
	const $1 = q => document.querySelector(q), $all = q => [...document.querySelectorAll(q)];
	const desk = () => machineState().desk || {};
	const pat = () => Docs.patterns[currentPatternSlot()];
	const trigsOf = t => (pat()?.tracks[t].trigs || []).slice().sort((a, b) => a - b);
	const flagsOf = (t, f) => (pat()?.tracks[t][f] || []).slice().sort((a, b) => a - b);
	const locksOf = (t, i) => (pat()?.locks || []).find(l => l.track === t && l.param === i)?.steps || [];
	const kit = () => kitDocOf(Docs);
	const kitVals = t => { const k = kit()?.tracks[t]; return k ? [...k.synth, ...k.effects, ...k.routing] : []; };
	const allKitVals = () => [...Array(16).keys()].map(kitVals);
	const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
	/* what differs between two allKitVals(): "T<track> #<index> <was>-><now>" (the first few) */
	const kitDiff = (a, b) => a.flatMap((v, t) => v.map((x, i) => x === b[t]?.[i] ? null : `T${t + 1} #${i} ${x}->${b[t]?.[i]}`).filter(Boolean)).slice(0, 8).join(", ");
	const sorted = a => a.slice().sort((x, y) => x - y);
	const idle = () => !desk().tx;
	const dlgShown = () => !$1("#dlg").hidden && $1("#dlg").dataset.first !== "1";
	const dlgButton = text => [...$1("#dlg").querySelectorAll("[data-dlg]")].find(b => b.textContent.trim() === text);
	const pressed = q => $1(q)?.getAttribute("aria-pressed") === "true";
	const cell = (t, s) => `#seq .st[data-t="${t}"][data-s="${s}"]`;
	const rail = t => `#rail .th[data-sel="${t}"] .nm`;
	const tab = ws => `#tabs [data-ws="${ws}"]`;
	const onTab = ws => ok(S.ws === ws, `workspace ${S.ws}`);
	const lit = t => V.tracks[t].trigs.map((on, s) => on ? s : -1).filter(s => s >= 0 && s < V.len);
	const gridShows = t => lit(t).every(s => pressed(cell(t, s))) && $all(`#seq .st[data-t="${t}"][aria-pressed="true"]`).length === lit(t).length;
	const mutes = () => sorted(desk().mutes || []);
	/* the machine's mutes read back and still: the desk idle and the same mutes for 400 ms (at most 6 s) */
	const settledMutes = async () => { const end = performance.now() + 6000; let last = "", since = performance.now();
		while (performance.now() < end) { const m = JSON.stringify(mutes()); if (m !== last || !idle()) { last = m; since = performance.now(); } else if (performance.now() - since >= 400) return true; await sleep(50); }
		return false; };
	/* a track the person would pick: a sound on it (not empty, not MIDI, CTR or input, not a recorder) */
	const soundTracks = () => [...Array(16).keys()].filter(i => !/^(GND-EMPTY|MID-|CTR-|INP-)/.test(V.tracks[i].m) && !machineFacts(V.tracks[i].m, Cat).recorder);
	const soundTrack = () => soundTracks()[0] ?? 0;
	/* free steps of a track from a step on, spaced like a person picks them */
	const freeSteps = (t, n, from = 0) => { const busy = trigsOf(t), out = []; for (let s = from; s < V.len && out.length < n; s++) if (!busy.includes(s) && !out.some(x => Math.abs(x - s) < 2)) out.push(s); return out; };
	/* the machine's telemetry and the plug-in's command results, as they come */
	const tele = { last: null, steps: [], rows: [] }, results = [];
	/* the documents of one slot as they arrive (a failing step says what came) */
	const trace = { kind: null, slot: null, seen: [] };
	const traceDocs = (kind, slot) => Object.assign(trace, { kind, slot, seen: [] });
	const traced = () => trace.seen.join(" | ") || "no document arrived";
	Bridge.onMessage(m => {
		if (m.type === "doc" && m.kind === trace.kind && m.slot === trace.slot && trace.seen.length < 12) trace.seen.push(`${Math.round(performance.now())} ms${m.pending ? " pending" : ""}: ${trace.kind === "kit" ? JSON.stringify(m.doc?.name) : (m.doc?.tracks || []).reduce((n, t) => n + t.trigs.length, 0) + " trigs"}`);
		if (m.type === "telemetry") { const was = tele.last; tele.last = m; if (m.playing) { tele.steps.push(m.step); if (tele.steps.length > 64) tele.steps.shift(); }
			/* the song row as it came, with the transport and the step, when it changed (the song playhead's failures say it) */
			if (!was || was.songRow !== m.songRow || was.playing !== m.playing) { tele.rows.push(`${m.playing ? "P" : "S"}${m.step}:${m.songRow}`); if (tele.rows.length > 24) tele.rows.shift(); } }
		if (m.type === "result") { results.push(m); if (results.length > 50) results.shift(); }
		if (m.type === "audition") results.push({ heard: "audition", state: m.state });
	});
	/* common steps */
	const sel = t => ({ say: "pick a track on the rail", act: (u, c) => { c.t = t(c); u.click(rail(c.t)); }, screen: c => ok(S.sel === c.t && $1("#rail .th.sel")?.dataset.sel === String(c.t), "selected " + S.sel) });
	const go = ws => ({ say: `click the ${{ seq: "Sequence", sound: "Sound", mix: "Mix", song: "Song", sampler: "Sampler" }[ws]} tab`, act: u => u.click(tab(ws)), screen: () => onTab(ws), machine: () => ok(V.loaded, "not loaded") });
	const undoKey = { say: "press Cmd+Z", act: u => u.key("z", { cmd: true }) };
	const esc = { say: "press Escape: it closes", act: u => u.key("Escape"), screen: () => ok($1("#libpop").hidden && $1("#globpop").hidden, "still open") };
	const nudge = async (u, q, v, by = 30) => { const d = v > 64 ? -1 : 1, n = Math.max(1, Math.round(by / 6)); await u.drag(q, Array.from({ length: n }, (_, k) => [d * 6 * (k + 1), 0])); };
	const confirmIfAsked = async u => { if (await until(dlgShown, 1200)) u.click($1("#dlg .danger") || dlgButton("Cancel")); };

	/* ---------- start-up ---------- */
	const bootCard = {
		name: "md-boot-card", proves: [], boot: true,
		steps: [
			{ say: "open the editor: the start-up card covers the window while the firmware starts (preparing the factory flash on a fresh data root, then booting)", within: 30000, screen: () => ok(["loading", "booting"].includes(Boot.state()) && !$1("#bootcard").hidden, "card " + Boot.state()) },
			{ say: "click PLAY under the card: it is not pressed", act: (u, c) => { const r = $1("#play").getBoundingClientRect(), top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); c.cover = top?.closest("#bootcard") ? "card" : top?.id === "modalbg" ? "backdrop" : (top?.id || top?.className); if (c.cover !== "card" && c.cover !== "backdrop") throw new Error("PLAY is reachable: " + c.cover); top.dispatchEvent(new MouseEvent("click", { bubbles: true })); c.note = "covered by the " + c.cover; },
				screen: () => ok(!V.playing, "playing"), machine: () => ok(!tele.last?.playing, "the machine plays"), within: 800 },
			{ say: "the card shows the firmware's own LCD", screen: () => { const g = $1("#bootlcd")?.getContext("2d")?.getImageData(0, 0, 128, 64).data; if (!g) return "no LCD"; let n = 0; for (let i = 0; i < g.length; i += 4) if (g[i] !== g[0] || g[i + 1] !== g[1] || g[i + 2] !== g[2]) n++; return ok(n > 50, n + " pixels, card " + Boot.state()); }, within: 90000 },
			{ say: "the card goes once the machine takes input", screen: () => ok($1("#bootcard").hidden, "still shown"), machine: () => ok(!!machineState().input, "no input yet"), within: 90000 }
		]
	};

	/* ---------- the top bar and the keys ---------- */
	const firstBeat = {
		name: "md-seq-first-beat", proves: ["MD-019", "MD-107", "MD-014"],
		steps: [
			go("seq"), sel(() => soundTrack()),
			{ say: "click four empty steps on that track", act: async (u, c) => { c.steps = [2, 6, 10, 14].map(k => freeSteps(c.t, 1, k)[0]).filter(s => s != null); if (c.steps.length < 4) throw new Error("no four free steps"); for (const s of c.steps) { u.click(cell(c.t, s)); await sleep(120); } c.note = `track ${c.t + 1} steps ${c.steps.map(s => s + 1).join(" ")}`; Journey.snapshot("md-step-grid"); },
				screen: c => ok(c.steps.every(s => pressed(cell(c.t, s))), "not lit"), machine: c => ok(c.steps.every(s => trigsOf(c.t).includes(s)) && idle(), `pattern has ${trigsOf(c.t).join(",")}`) },
			{ say: "press PLAY", act: u => { tele.steps = []; u.click("#play"); }, screen: () => ok(V.playing && /^\d\d\.\d\d$/.test($1("#pos").textContent), `POSITION ${$1("#pos").textContent}`), machine: () => ok(new Set(tele.steps).size >= 4, `telemetry steps ${tele.steps.join(",")}`), within: 8000 },
			{ say: "it plays the pattern with those trigs", screen: c => ok(c.steps.every(s => V.tracks[c.t].trigs[s]), "grid lost a trig"), machine: c => ok(tele.last?.playing && c.steps.every(s => trigsOf(c.t).includes(s)), "not playing the trigs") },
			{ say: "press STOP (the same key)", act: u => u.click("#play"), screen: () => ok(!V.playing && $1("#pos").textContent === "--.--", `POSITION ${$1("#pos").textContent}`), machine: () => ok(tele.last && !tele.last.playing, "still playing") }
		],
		async tidy(u, c) { if (V.playing) u.click("#play"); for (let i = 0; i < 6 && c.steps && c.steps.some(s => trigsOf(c.t).includes(s)); i++) { u.key("z", { cmd: true }); await until(idle, 2000); await sleep(400); } }
	};
	const spaceTransport = {
		name: "md-keys-space-play", proves: ["MD-014"],
		steps: [
			{ say: "press Space: it plays", act: u => { document.activeElement?.blur?.(); tele.steps = []; u.key(" "); }, screen: () => ok(V.playing, "not playing"), machine: () => ok(new Set(tele.steps).size >= 2, "telemetry " + tele.steps.join(",")), within: 6000 },
			{ say: "press Space again: it stops", act: u => u.key(" "), screen: () => ok(!V.playing, "playing"), machine: () => ok(tele.last && !tele.last.playing, "still playing") }
		]
	};
	/* B-024: the machine keeps the tempo in 1/24 BPM steps (a saved project's 93.79 is 2251/24) and the LCD shows it to
	   one decimal: the LCD is compared with the tempo as the LCD rounds it, never with the tempo itself (only a tempo on
	   the 0.1 grid, a fresh 120.0, passed that) */
	const lcdBpm = v => +(+v).toFixed(1);
	const tempoDrag = {
		name: "md-top-tempo-drag", proves: ["MD-009", "MD-027", "MD-288"],
		steps: [
			{ say: "drag the BPM on the LCD up", act: async (u, c) => { c.b0 = Docs.global.tempo; await u.drag("#bpm", [[0, -6], [0, -12], [0, -18], [0, -24]]); c.note = `${c.b0} -> ${V.bpm}`; },
				screen: c => ok(parseFloat($1("#bpm").textContent) === lcdBpm(V.bpm) && V.bpm > c.b0, `LCD ${$1("#bpm").textContent} for ${V.bpm} (from ${c.b0}); tempo in ${Docs.global?.control?.tempoIn}`),
				machine: c => ok(Docs.global.tempo > c.b0 && Docs.global.tempo === V.bpm, "tempo " + Docs.global.tempo) },
			{ say: "drag it back down as far", act: u => u.drag("#bpm", [[0, 6], [0, 12], [0, 18], [0, 24]]), screen: c => ok(parseFloat($1("#bpm").textContent) === lcdBpm(c.b0), "LCD " + $1("#bpm").textContent),
				machine: c => ok(Math.abs(Docs.global.tempo - c.b0) < 0.05, "tempo " + Docs.global.tempo) }
		]
	};
	/* T taps; so does B, the Monomachine Editor's tap key (T is a black key there) */
	const tapWith = (name, key, m = {}) => ({
		name, proves: m.proves,
		steps: [
			{ say: `tap ${m.shift ? "Shift+" : ""}${key.toUpperCase()} five times, about 0.5 s apart`, act: async (u, c) => { c.b0 = Docs.global.tempo; document.activeElement?.blur?.();
				/* a new run of taps: the page counts a tap less than 2 s after the last one into the same average (a tap
				   journey right after another one, as in a shard of the page tier, measured the gap between them) */
				if (typeof TAP !== "undefined" && TAP.length) await sleep(2100);
				const at = []; for (let i = 0; i < 5; i++) { at.push(performance.now()); u.key(m.shift ? key.toUpperCase() : key, m); await sleep(500); } c.want = Math.round(60000 / ((at[4] - at[0]) / 4) * 10) / 10; c.note = `taps ${Math.round((at[4] - at[0]) / 4)} ms apart: ${c.want} BPM`; },
				screen: c => ok(Math.abs(V.bpm - c.want) <= tapSlack(c.want) && Math.abs(parseFloat($1("#bpm").textContent) - V.bpm) < 0.06, "BPM " + V.bpm + ", want " + c.want), machine: c => ok(Math.abs(Docs.global.tempo - c.want) <= tapSlack(c.want), "tempo " + Docs.global.tempo + ", want " + c.want) }
		],
		async tidy(u, c) { if (c.b0 != null) cmd("tempo", { bpm: c.b0 }); await sleep(500); }
	});
	const tapTempo = tapWith("md-keys-tap-tempo", "t", { proves: ["MD-009", "MD-092", "MD-X20"] }), tapTempoB = tapWith("md-keys-tap-tempo-b", "b", { proves: ["MD-009", "MD-092", "MD-X20"] });
	/* Radek 2026-10-10: ⇧B taps in both editors (the Monomachine Editor's B is the piano roll's Draw on Sequence) */
	const tapTempoShift = tapWith("md-keys-tap-tempo-shift", "b", { shift: true, proves: ["MD-009", "MD-092", "MD-X20"] });
	const patStep = {
		name: "md-top-pattern-next", proves: ["MD-094"],
		steps: [
			{ say: "click › next to the pattern on the LCD", act: async (u, c) => { c.p0 = currentPatternSlot(); u.click("#patNext"); await confirmIfAsked(u); }, screen: c => ok($1("#pat").textContent.includes(patName(c.p0 + 1)), "LCD " + $1("#pat").textContent), machine: c => ok(currentPatternSlot() === c.p0 + 1, "machine pattern " + currentPatternSlot()), within: 5000 },
			{ say: "click ‹: back", act: async u => { u.click("#patPrev"); await confirmIfAsked(u); }, screen: c => ok($1("#pat").textContent.includes(patName(c.p0)), "LCD " + $1("#pat").textContent), machine: c => ok(currentPatternSlot() === c.p0, "machine pattern " + currentPatternSlot()), within: 5000 }
		]
	};
	const queuePattern = {
		name: "md-seq-queue-while-playing", proves: ["MD-094", "MD-096", "MD-X21"],
		steps: [
			{ say: "press PLAY", act: (u, c) => { c.p0 = currentPatternSlot(); u.click("#play"); }, machine: () => ok(tele.last?.playing, "not playing"), within: 5000 },
			{ say: "click › on the LCD: the next pattern is queued", act: async u => { u.click("#patNext"); await confirmIfAsked(u); }, machine: c => ok(desk().queued === c.p0 + 1 || currentPatternSlot() === c.p0 + 1, "queued " + desk().queued), screen: c => ok($1("#pat").textContent.includes(patName(c.p0 + 1)), "LCD " + $1("#pat").textContent), within: 3000 },
			{ say: "it starts at the pattern end", machine: c => ok(currentPatternSlot() === c.p0 + 1 && desk().queued == null, "machine pattern " + currentPatternSlot()), within: 20000 },
			{ say: "press STOP and click ‹", act: async u => { u.click("#play"); await until(() => !V.playing, 3000); u.click("#patPrev"); await confirmIfAsked(u); }, machine: c => ok(currentPatternSlot() === c.p0 && !tele.last?.playing, "machine pattern " + currentPatternSlot()), within: 5000 }
		],
		async tidy(u) { if (V.playing) u.click("#play"); }
	};
	const plate = {
		name: "md-top-plate", proves: ["MD-210"],
		steps: [
			{ say: "click the plate key (MK1 / MK2)", act: (u, c) => { c.p0 = document.documentElement.dataset.plate; c.bg = getComputedStyle(document.body).backgroundColor; u.click("#platekey"); }, screen: c => ok(document.documentElement.dataset.plate !== c.p0, "plate " + document.documentElement.dataset.plate) },
			{ say: "click it again", act: u => u.click("#platekey"), screen: c => ok(document.documentElement.dataset.plate === c.p0, "plate " + document.documentElement.dataset.plate) }
		]
	};
	const wsKeys = {
		name: "md-keys-workspaces", proves: [],
		steps: [["2", "sound"], ["3", "mix"], ["4", "sampler"], ["5", "song"], ["1", "seq"]].map(([k, ws]) => ({ say: `press ${k}`, act: async u => { document.activeElement?.blur?.(); u.key(k); if (k === "1") { await sleep(300); Journey.snapshot("md-workspaces"); } }, screen: () => ok(S.ws === ws && !!$1("#main").firstElementChild, "workspace " + S.ws) }))
	};
	/* B-018: ? as the operating system delivers it after the window became the key window (JUCE then takes the keyboard
	   for its own view; the page's host hands it back), no click in the page first: the key reaches the page, no beep */
	const osHelp = {
		name: "md-keys-os-help", proves: [], needs: Journey.osKeyPath,
		steps: [
			{ say: "the window becomes the key window, then press ? on the keyboard, no click in the page: the keyboard view",
				act: async u => { document.activeElement?.blur?.(); await u.osKey("activate"); await u.sleep(300); await u.osKey("?"); },
				screen: () => ok(!$1("#keyspop").hidden && !!$1("#keyspop .kv-cap"), "keys view " + ($1("#keyspop").hidden ? "hidden" : "empty")) },
			{ say: "press Escape on the keyboard: it closes", act: u => u.osKey("escape"), screen: () => ok($1("#keyspop").hidden, "still open") }
		]
	};
	const helpKeys = {
		name: "md-keys-help", proves: ["MD-X18"],
		steps: [
			/* K-view (DESIGN-keymap.md): ? is a drawn keyboard from the key map, with the mouse's tricks, tips and the list */
			{ say: "press ? on Sequence: the keyboard view", act: u => { if (S.ws !== "seq") u.click(tab("seq")); document.activeElement?.blur?.(); u.key("?", { shift: true }); },
				screen: () => ok(!$1("#keyspop").hidden && $all("#keyspop .kv-cap").length > 60 && $1('#keyspop .kv-cap[data-code="KeyR"]')?.dataset.ids === "randomise-track"
					&& $1('#keyspop .kv-cap.piano.white[data-code="KeyA"] .kv-note')?.textContent === "C" && $all("#keyspop .kv-mouse .kv-row").length > 5 && $all("#keyspop .keyrow").length > 20,
					`${$all("#keyspop .kv-cap").length} keys, R ${$1('#keyspop .kv-cap[data-code="KeyR"]')?.dataset.ids}, ${$all("#keyspop .keyrow").length} rows`) },
			{ say: "click the ⌥ / FN layer: R randomises every track there", act: u => u.click('#keyspop .kv-chip[data-kvmod="alt"]'),
				screen: () => ok($1('#keyspop .kv-cap[data-code="KeyR"]')?.dataset.ids === "randomise-all" && $1('#keyspop .kv-cap[data-code="AltLeft"]')?.classList.contains("on"), "R " + $1('#keyspop .kv-cap[data-code="KeyR"]')?.dataset.ids) },
			{ say: "click R on the drawn keyboard: what it does, in words", act: u => u.click('#keyspop .kv-cap[data-code="KeyR"]'), screen: () => ok(/every track/i.test($1("#keyspop .kv-detail")?.textContent || ""), $1("#keyspop .kv-detail")?.textContent) },
			{ say: "type \"undo\" in its search: ⌘Z is marked, the list keeps undo", act: u => { u.click('#keyspop .kv-chip[data-kvmod="cmd"]'); u.click('#keyspop .kv-chip[data-kvmod="alt"]'); u.type("#keyspop [data-kvsearch]", "undo"); },
				screen: () => ok($1('#keyspop .kv-cap.hit[data-code="KeyZ"]') && $all("#keyspop .keyrow").length >= 1 && $all("#keyspop .keyrow").every(r => /undo/i.test(r.textContent + r.dataset.id)), $all("#keyspop .keyrow").length + " rows") },
			{ say: "press Escape: it closes", act: u => { document.activeElement?.blur?.(); u.key("Escape"); }, screen: () => ok($1("#keyspop").hidden, "still open") }
		]
	};
	const undoRedo = {
		name: "md-top-undo-redo", proves: ["MD-107", "MD-X07"],
		steps: [
			go("seq"), sel(() => soundTrack()),
			{ say: "click an empty step", act: (u, c) => { c.s = freeSteps(c.t, 1, 5)[0]; u.click(cell(c.t, c.s)); }, screen: c => ok(pressed(cell(c.t, c.s)), "not lit"), machine: c => ok(trigsOf(c.t).includes(c.s), "no trig") },
			{ say: "press Cmd+Z", act: u => u.key("z", { cmd: true }), screen: c => ok(!pressed(cell(c.t, c.s)), "still lit"), machine: c => ok(!trigsOf(c.t).includes(c.s), "trig still there") },
			{ say: "press Cmd+Shift+Z", act: u => u.key("z", { cmd: true, shift: true }), screen: c => ok(pressed(cell(c.t, c.s)), "not lit"), machine: c => ok(trigsOf(c.t).includes(c.s), "no trig") },
			{ say: "click the Undo key", act: u => u.click("#undo"), screen: c => ok(!pressed(cell(c.t, c.s)) && !$1("#redo").disabled, "still lit"), machine: c => ok(!trigsOf(c.t).includes(c.s), "trig still there") },
			{ say: "click the Redo key", act: u => u.click("#redo"), screen: c => ok(pressed(cell(c.t, c.s)), "not lit"), machine: c => ok(trigsOf(c.t).includes(c.s), "no trig") },
			{ say: "click Undo", act: u => u.click("#undo"), machine: c => ok(!trigsOf(c.t).includes(c.s), "trig still there") }
		]
	};

	/* ---------- Sequence ---------- */
	const paintUndo = {
		name: "md-seq-paint-undo", proves: ["MD-107"],
		steps: [
			go("seq"), sel(() => soundTracks().find(t => { const b = trigsOf(t); return [...Array(V.len - 4).keys()].some(s => [0, 1, 2, 3].every(k => !b.includes(s + k))); }) ?? soundTrack()),
			{ say: "drag across four empty steps", act: async (u, c) => {
				const busy = trigsOf(c.t); c.s0 = [...Array(V.len - 4).keys()].find(s => [0, 1, 2, 3].every(k => !busy.includes(s + k))); if (c.s0 == null) throw new Error("no four free steps");
				c.run = [0, 1, 2, 3].map(k => c.s0 + k); c.u0 = V.undoCount;
				await u.drag(cell(c.t, c.s0), c.run.slice(1).map(s => cell(c.t, s)));
			}, screen: c => ok(c.run.every(s => pressed(cell(c.t, s))), "not lit"), machine: c => ok(c.run.every(s => trigsOf(c.t).includes(s)) && V.undoCount === c.u0 + 1, `pattern ${trigsOf(c.t).join(",")}, undo steps ${c.u0} -> ${V.undoCount}`) },
			{ ...undoKey, say: "press Cmd+Z once: all four go", screen: c => ok(c.run.every(s => !pressed(cell(c.t, s))), "still lit"), machine: c => ok(c.run.every(s => !trigsOf(c.t).includes(s)), "pattern " + trigsOf(c.t).join(",")) }
		]
	};
	const accentSlide = {
		name: "md-seq-accent-slide", proves: ["MD-127", "MD-141"],
		steps: [
			go("seq"), sel(() => soundTrack()),
			{ say: "click an empty step", act: (u, c) => { c.s = freeSteps(c.t, 1, 9)[0]; u.click(cell(c.t, c.s)); }, machine: c => ok(trigsOf(c.t).includes(c.s), "no trig") },
			{ say: "shift-click it: accent", act: async (u, c) => { u.click(cell(c.t, c.s), { shift: true }); await sleep(250); Journey.snapshot("md-accent"); }, screen: c => ok($1(cell(c.t, c.s)).classList.contains("acc"), "no accent shown"), machine: c => ok(flagsOf(c.t, "accent").includes(c.s) || (V.accAll && (pat().accent?.steps || []).includes(c.s)), `accent ${flagsOf(c.t, "accent").join(",")}, pattern-wide ${V.accAll ? (pat().accent?.steps || []).join(",") : "off"}`) },
			{ say: "alt-shift-click it: slide", act: (u, c) => u.click(cell(c.t, c.s), { alt: true, shift: true }), screen: c => ok($1(cell(c.t, c.s)).classList.contains("sl"), "no slide shown"), machine: c => ok(flagsOf(c.t, "slide").includes(c.s) || (V.slideAll && (pat().slide?.steps || []).includes(c.s)), `slide ${flagsOf(c.t, "slide").join(",")}, pattern-wide ${V.slideAll ? (pat().slide?.steps || []).join(",") : "off"}`) },
			{ say: "Cmd+Z three times: back to an empty step", act: async u => { for (let i = 0; i < 3; i++) { u.key("z", { cmd: true }); await sleep(500); } }, machine: c => ok(!trigsOf(c.t).includes(c.s), "trig still there"), screen: c => ok(!pressed(cell(c.t, c.s)), "still lit") }
		]
	};
	/* B-100: the factory patterns hold EDIT ALL on for accent, slide and swing (one pattern-wide row every track takes; the
	   page shows it on each track's trigs and says "Pattern-wide ... (EDIT ALL is on)"). A journey about a track's own marks
	   sets This track first on the trig types, as a person does; each switch is one undo step, the journey's tidy takes it back. */
	const MARKS = { acc: ["accent", "Accent"], sld: ["slide", "Slide"], swg: ["swing", "Swing"] };
	const ownMarks = (...tts) => ({ say: `on the trig types, ${tts.map(k => MARKS[k][1]).join(", ")}: This track each (the track's own marks, EDIT ALL off), then Trig`,
		act: async (u, c) => { if (c.n0 == null) c.n0 = V.undoCount; for (const k of tts) { u.click(`#ttlegend [data-tt="${k}"]`); await sleep(150);
			if ($1('#ttlegend [data-ttall="0"]')?.getAttribute("aria-pressed") !== "true") { u.click('#ttlegend [data-ttall="0"]'); await until(() => pat()[MARKS[k][0]].editAll === 0, 4000); } }
			u.click('#ttlegend [data-tt="trig"]'); },
		screen: () => ok(S.tt === "trig", "type " + S.tt), machine: () => ok(tts.every(k => pat()[MARKS[k][0]].editAll === 0), tts.map(k => `${MARKS[k][0]} editAll ${pat()[MARKS[k][0]].editAll}`).join(", ")), within: 6000 });
	/* wave 3: the trig types under the grid (DESIGN-machine-menus.md §2): Swing paints swing steps, EDIT ALL from the page, Slide by
	   a plain click, Esc back to Trig */
	const trigTypesJ = {
		name: "md-seq-trig-types", proves: ["MD-128", "MD-131", "MD-132", "MD-141"],
		steps: [
			go("seq"), sel(() => soundTrack()),
			{ say: "drag across two empty steps: two trigs", act: async (u, c) => { c.u0 = V.undoCount; c.e0 = [pat().accent.editAll, pat().slide.editAll, pat().swing.editAll]; const f = freeSteps(c.t, 2, 9); c.s = f[0]; c.s2 = f[1]; await u.drag(cell(c.t, c.s), [cell(c.t, c.s2)]); },
				machine: c => ok(trigsOf(c.t).includes(c.s) && trigsOf(c.t).includes(c.s2), "pattern " + trigsOf(c.t).join(",")) },
			{ say: "click Swing in the trig types", act: u => u.click('#ttlegend [data-tt="swg"]'), screen: () => ok(S.tt === "swg" && $1('#ttlegend [data-tt="swg"]').getAttribute("aria-checked") === "true" && !!$1('#ttlegend [data-ttall]'), "type " + S.tt) },
			{ say: "click This track: the track's own swing row", act: u => u.click('#ttlegend [data-ttall="0"]'), machine: () => ok(pat().swing.editAll === 0, "swing editAll " + pat().swing.editAll) },
			{ say: "drag across the two trigs: both swing", act: async (u, c) => { c.w0 = flagsOf(c.t, "swing"); await u.drag(cell(c.t, c.s), [cell(c.t, c.s2)]); },
				/* a drag sets or clears as its first step was (the track's own row may hold swing on these steps: B-088) */
				screen: c => ok([c.s, c.s2].every(s => $1(cell(c.t, s)).classList.contains("sw") !== c.w0.includes(c.s)), `swing marks ${[c.s, c.s2].map(s => $1(cell(c.t, s)).classList.contains("sw"))}, before ${c.w0.includes(c.s)}`),
				machine: c => ok([c.s, c.s2].every(s => flagsOf(c.t, "swing").includes(s) !== c.w0.includes(c.s)), "swing " + flagsOf(c.t, "swing").join(",")) },
			{ say: "click All tracks: EDIT ALL on", act: u => u.click('#ttlegend [data-ttall="1"]'), screen: () => ok($1('#ttlegend [data-ttall="1"]').getAttribute("aria-pressed") === "true", "not pressed"), machine: () => ok(pat().swing.editAll === 1, "swing editAll " + pat().swing.editAll) },
			{ say: "click Slide, then click the first trig: a slide", act: async (u, c) => { u.click('#ttlegend [data-tt="sld"]'); await sleep(300); c.l0 = V.slideAll ? (pat().slide.steps || []).includes(c.s) : flagsOf(c.t, "slide").includes(c.s); u.click(cell(c.t, c.s)); },
				screen: c => ok($1(cell(c.t, c.s)).classList.contains("sl") !== c.l0, "slide mark unchanged"),
				machine: c => ok((V.slideAll ? (pat().slide.steps || []).includes(c.s) : flagsOf(c.t, "slide").includes(c.s)) !== c.l0, "slide " + flagsOf(c.t, "slide").join(",")) },
			{ say: "press Escape: back to Trig", act: u => u.key("Escape"), screen: () => ok(S.tt === "trig" && $1('#ttlegend [data-tt="trig"]').getAttribute("aria-checked") === "true" && !$1('#ttlegend [data-ttall]'), "type " + S.tt) }
		],
		async tidy(u, c) { if (S.tt !== "trig") setTrigType("trig"); for (let i = 0; i < 12 && c.u0 != null && V.undoCount > c.u0; i++) { u.key("z", { cmd: true }); await sleep(500); } }
	};
	const lockLane = {
		name: "md-seq-lock-lane", proves: ["MD-003", "MD-134", "MD-135", "MD-136"],
		steps: [
			go("seq"),
			{ say: "pick a track that has trigs", act: (u, c) => { c.t = soundTracks().find(t => trigsOf(t).length >= 2) ?? soundTrack(); u.click(rail(c.t)); }, screen: c => ok(S.sel === c.t, "selected " + S.sel), machine: c => ok(trigsOf(c.t).length >= 2, "fewer than two trigs") },
			{ say: "click a lock parameter key", act: (u, c) => { const k = $1('#chips .pk[data-lane="FLTF"]') || $1("#chips .pk[data-lane]"); c.p = k.dataset.lane; c.i = pidx(c.t, c.p); c.l0 = locksOf(c.t, c.i); u.click(k); }, screen: c => ok(S.lane === c.p && pressed(`#chips .pk[data-lane="${c.p}"]`), "lane " + S.lane) },
			{ say: "draw across the lane over the track's trigs", act: async (u, c) => { c.on = trigsOf(c.t).filter(s => s < V.len).slice(0, 4); await u.drag(`#lane .lb[data-s="${c.on[0]}"]`, c.on.slice(1).map(s => `#lane .lb[data-s="${s}"]`), {}, { fy: 0.3 }); c.note = `${c.p} on steps ${c.on.map(s => s + 1).join(" ")}`; },
				screen: c => ok(c.on.every(s => $1(`#lane .lb[data-s="${s}"] i`)), "no bars"), machine: c => ok(c.on.every(s => locksOf(c.t, c.i).some(([x]) => x === s)), "locks " + JSON.stringify(locksOf(c.t, c.i))), within: 8000 },
			{ say: "click the lane's clear key", act: u => u.click("#clearLane"), screen: c => ok(c.on.every(s => !$1(`#lane .lb[data-s="${s}"] i`)), "bars left"), machine: c => ok(!locksOf(c.t, c.i).length, "locks " + JSON.stringify(locksOf(c.t, c.i))), within: 8000 }
		],
		async tidy(u, c) { if (c.l0?.length) u.key("z", { cmd: true }); }
	};
	const pagesJ = {
		name: "md-seq-pages", proves: ["MD-020", "MD-108"],
		steps: [
			go("seq"),
			{ say: "click ALL off: one page of 16 steps", act: u => { if (S.viewAll) u.click("#pgall"); }, screen: () => ok(!S.viewAll && $all('#seq .st[data-t="0"]').length === 16 && $1('#seq .st[data-t="0"]').dataset.s === String(S.page * 16), $all('#seq .st[data-t="0"]').length + " steps") },
			{ say: "click PAGE: the next page", act: (u, c) => { c.p0 = S.page; u.click("#pgkey"); }, screen: c => ok(V.len < 32 || (S.page === (c.p0 + 1) % (V.len / 16) && $1('#seq .st[data-t="0"]').dataset.s === String(S.page * 16)), "page " + S.page) },
			{ say: "press [: back", act: u => { document.activeElement?.blur?.(); u.key("["); }, screen: c => ok(S.page === c.p0, "page " + S.page) },
			{ say: "click ALL: every step again", act: u => u.click("#pgall"), screen: () => ok(S.viewAll && $all('#seq .st[data-t="0"]').length === V.len, $all('#seq .st[data-t="0"]').length + " steps") }
		],
		async tidy() { if (!S.viewAll) { S.viewAll = true; render(); } }
	};
	const inLen = s => s < Math.min(V.length, V.len);
	const copyPaste = {
		name: "md-seq-copy-paste-clear", proves: ["MD-116", "MD-117", "MD-118"],
		steps: [
			go("seq"),
			{ say: "pick a track with trigs and press Cmd+C", act: async (u, c) => { c.a = soundTracks().find(t => trigsOf(t).length) ?? 0; c.b = soundTracks().find(t => t !== c.a && !same(trigsOf(t), trigsOf(c.a))) ?? (c.a + 1) % 16; c.ta = trigsOf(c.a); c.tb = trigsOf(c.b); u.click(rail(c.a)); await sleep(200); document.activeElement?.blur?.(); u.key("c", { cmd: true }); }, machine: () => ok(V.clipboard.steps, "nothing copied") },
			{ say: "pick another track and press Cmd+V", act: async (u, c) => { u.click(rail(c.b)); await sleep(200); document.activeElement?.blur?.(); u.key("v", { cmd: true }); }, screen: c => ok(gridShows(c.b) && same(lit(c.b).filter(inLen), c.ta.filter(inLen)), "grid " + lit(c.b).join(",")),
				/* a paste stops at the pattern's length (DESIGN-step-selection.md §4): the steps past it keep what they had */
				machine: c => ok(same(trigsOf(c.b).filter(inLen), c.ta.filter(inLen)) && same(trigsOf(c.b).filter(s => !inLen(s)), c.tb.filter(s => !inLen(s))), "pattern " + trigsOf(c.b).join(",")) },
			/* D3 (DESIGN-keymap.md): Delete takes only selected steps; the LCD's Clr clears the page shown */
			{ say: "press Delete with no step selected: nothing is cleared", act: (u, c) => { if (S.stepSel) clearSel(); c.lb = lit(c.b); document.activeElement?.blur?.(); u.key("Delete"); },
				screen: c => ok(same(lit(c.b), c.lb), "lit " + lit(c.b).join(",")), machine: c => ok(same(trigsOf(c.b).filter(inLen), c.ta.filter(inLen)), "pattern " + trigsOf(c.b).join(",")) },
			{ say: "click Clr on the LCD: the track's steps are cleared", act: u => u.click('[data-sec="clear"]'), screen: c => ok(!lit(c.b).length, "lit " + lit(c.b).join(",")), machine: c => ok(!trigsOf(c.b).length, "pattern " + trigsOf(c.b).join(",")) },
			{ say: "Cmd+Z twice: the track is as before", act: async u => { u.key("z", { cmd: true }); await sleep(800); u.key("z", { cmd: true }); }, machine: c => ok(same(trigsOf(c.b), c.tb), "pattern " + trigsOf(c.b).join(",")), within: 8000 }
		]
	};
	/* DESIGN-step-selection.md, on ⌘ since K2 (DESIGN-keymap.md): one step copied to another step of its track (the LCD's
	   PASTE acting on the selection), then a block duplicated and cleared with the LCD's CLR */
	const selectCopyPaste = {
		name: "md-seq-select-copy-paste", proves: ["MD-114", "MD-X10"],
		steps: [
			go("seq"), sel(() => soundTracks().find(t => t < 15 && trigsOf(t).some(s => s < Math.min(V.length, V.len))) ?? soundTrack()),
			{ say: "Cmd-click a step with a trig: it is selected", act: (u, c) => {
				c.L = Math.min(V.length, V.len); if (c.L < 8) throw new Error("the pattern is shorter than 8 steps");
				c.t0 = trigsOf(c.t); c.t1 = trigsOf(c.t + 1); c.u0 = V.undoCount;
				c.s = c.t0.find(s => s < c.L) ?? 0; c.d = [...Array(c.L).keys()].find(s => !c.t0.includes(s) && Math.abs(s - c.s) > 1 && (s < 4 || s >= 8));
				if (c.d == null) throw new Error("no free step to paste to");
				u.click(cell(c.t, c.s), { cmd: true });
			}, screen: c => ok($1(cell(c.t, c.s)).classList.contains("selx") && $all("#seq .st.selx").length === 1, $all("#seq .st.selx").length + " selected"),
				machine: c => ok(c.t0.includes(c.s) === trigsOf(c.t).includes(c.s) && !trigsOf(c.t).some(s => !c.t0.includes(s)), "a Cmd-click changed the pattern: " + trigsOf(c.t).join(",")) },
			{ say: "press Cmd+C", act: u => { document.activeElement?.blur?.(); u.key("c", { cmd: true }); }, machine: () => ok(V.clipboard.stepsSize?.length === 1 && V.clipboard.stepsSize?.tracks === 1, "clipboard " + JSON.stringify(V.clipboard.stepsSize)) },
			{ say: "Cmd-click an empty step of the same track", act: (u, c) => u.click(cell(c.t, c.d), { cmd: true }), screen: c => ok($1(cell(c.t, c.d)).classList.contains("selx") && !$1(cell(c.t, c.s)).classList.contains("selx") && $1('[data-sec="paste"]').classList.contains("onsel"), "not selected, or PASTE not marked for it") },
			{ say: "click PASTE on the LCD: the trig lands on the selected step", act: u => u.click('[data-sec="paste"]'), screen: c => ok(pressed(cell(c.t, c.d)), "not lit"), machine: c => ok(trigsOf(c.t).includes(c.d), "pattern " + trigsOf(c.t).join(",")) },
			{ say: "Cmd-drag from step 1 of the track to step 4 of the next: a block", act: async (u, c) => { c.b0 = [c.t, c.t + 1].map(t => trigsOf(t).filter(s => s < 4));
					/* nothing selected first (Escape): the paste left its step selected, and the step menu's "⋯" key sits on that step, over the cells the drag goes through when the cells are small */
					document.activeElement?.blur?.(); u.key("Escape"); await sleep(300); await u.drag(cell(c.t, 0), [cell(c.t, 2), cell(c.t + 1, 3)], { cmd: true }); },
				screen: () => ok($all("#seq .st.selx").length === 8 && S.stepSel?.n === 2 && S.stepSel?.to - S.stepSel?.from === 4, $all("#seq .st.selx").length + " selected, " + JSON.stringify(S.stepSel)) },
			{ say: "press Cmd+D: the block again on steps 5-8", act: u => { document.activeElement?.blur?.(); u.key("d", { cmd: true }); },
				machine: c => ok([c.t, c.t + 1].every((t, k) => same(trigsOf(t).filter(s => s >= 4 && s < 8).map(s => s - 4), c.b0[k])), "steps 5-8 " + [c.t, c.t + 1].map(t => trigsOf(t).filter(s => s >= 4 && s < 8).join(",")).join(" / ")),
				screen: () => ok(S.stepSel?.from === 4 && $all("#seq .st.selx").length === 8, "selection " + JSON.stringify(S.stepSel)) },
			{ say: "click CLR on the LCD: the selected block (steps 5-8 of both tracks) is cleared, nothing else", act: (u, c) => { c.out = [c.t, c.t + 1].map(t => trigsOf(t).filter(s => s < 4 || s >= 8)); u.click('[data-sec="clear"]'); },
				machine: c => ok([c.t, c.t + 1].every((t, k) => !trigsOf(t).some(s => s >= 4 && s < 8) && same(trigsOf(t).filter(s => s < 4 || s >= 8), c.out[k])), "pattern " + [c.t, c.t + 1].map(t => trigsOf(t).join(",")).join(" / ")) },
			{ say: "press Esc: no selection", act: u => u.key("Escape"), screen: () => ok(!S.stepSel && !$all("#seq .st.selx").length, "still selected") },
			{ say: "Cmd+Z three times (paste, duplicate, clear): both tracks as before", act: async u => { for (let i = 0; i < 3; i++) { u.key("z", { cmd: true }); await sleep(800); } },
				machine: c => ok(same(trigsOf(c.t), c.t0) && same(trigsOf(c.t + 1), c.t1) && V.undoCount === c.u0, `pattern ${trigsOf(c.t).join(",")} / ${trigsOf(c.t + 1).join(",")}, undo steps ${c.u0} -> ${V.undoCount}`), within: 8000 }
		],
		async tidy() { if (S.stepSel) clearSel(); }
	};
	/* K3 (DESIGN-keymap.md): the step menu: an accent, a copy and a paste with the pointer only */
	const stepMenuJ = {
		name: "md-seq-step-menu", proves: ["MD-114", "MD-127", "MD-X09"],
		steps: [
			go("seq"), sel(() => soundTrack()),
			{ say: "click an empty step: a trig to work on", act: (u, c) => {
				c.L = Math.min(V.length, V.len); c.t0 = trigsOf(c.t); c.a0 = flagsOf(c.t, "accent"); c.u0 = V.undoCount;
				/* not accented as shown (with EDIT ALL on, the accents are the pattern's), and a free step two away to paste to */
				const free = s => !c.t0.includes(s) && !V.tracks[c.t].acc.has(s);
				c.s = [...Array(c.L).keys()].find(s => free(s)); c.d = [...Array(c.L).keys()].find(s => free(s) && Math.abs(s - c.s) > 1);
				if (c.s == null || c.d == null) throw new Error("no two free steps");
				if (S.stepSel) clearSel(); u.click(cell(c.t, c.s));
			}, screen: c => ok(pressed(cell(c.t, c.s)), "not lit"), machine: c => ok(trigsOf(c.t).includes(c.s), "no trig") },
			{ say: "right-click it: its menu", act: (u, c) => u.rightClick(cell(c.t, c.s)),
				screen: c => ok(!$1("#deskmenu").hidden && $1('#deskmenu [data-mid="step-fill-2"]') && $1(cell(c.t, c.s)).classList.contains("selx"), "no step menu") },
			{ say: "Escape, then click the ⋯ on the selected step (the menu's visible key): the same menu", act: async u => { u.key("Escape"); await until(() => $1("#deskmenu").hidden, 1000);
				await until(() => !!$1("#stepmore") && !$1("#stepmore").hidden, 2000);
				/* the ⋯ stays in the step's corner: a click or a drag at the step's centre reaches the step (0.6 e2e) */
				const r = $1(".st.selx").getBoundingClientRect(); if (document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.id === "stepmore") throw new Error("the ⋯ covers the step's centre");
				u.click("#stepmore"); },
				screen: c => ok(!$1("#deskmenu").hidden && $1('#deskmenu [data-mid="step-fill-2"]') && $1(cell(c.t, c.s)).classList.contains("selx"), "no step menu from ⋯ (" + ($1("#stepmore") ? "hidden " + $1("#stepmore").hidden : "no key") + ")"), within: 2000 },
			{ say: "choose Accent", act: u => u.click('#deskmenu [data-mid="step-accent"]'), screen: c => ok($1("#deskmenu").hidden && $1(cell(c.t, c.s)).classList.contains("acc"), "no accent shown"),
				machine: c => ok(flagsOf(c.t, "accent").includes(c.s) || (V.accAll && (pat().accent?.steps || []).includes(c.s)), "accent " + flagsOf(c.t, "accent").join(",")) },
			{ say: "right-click it again and choose Copy", act: async u => { u.rightClick(cell(S.stepSel.t, S.stepSel.from)); await sleep(150); u.click('#deskmenu [data-mid="copy"]'); },
				machine: () => ok(V.clipboard.stepsSize?.length === 1, "clipboard " + JSON.stringify(V.clipboard.stepsSize)) },
			{ say: "right-click an empty step and choose Paste here", act: async (u, c) => { u.rightClick(cell(c.t, c.d)); await sleep(150); u.click('#deskmenu [data-mid="paste"]'); },
				screen: c => ok(pressed(cell(c.t, c.d)), "not lit"), machine: c => ok(trigsOf(c.t).includes(c.d), "pattern " + trigsOf(c.t).join(",")) },
			{ say: "press Escape: no selection; Cmd+Z three times (paste, accent, trig): the track as before", act: async u => { u.key("Escape"); await sleep(150); for (let i = 0; i < 3; i++) { u.key("z", { cmd: true }); await sleep(800); } },
				machine: c => ok(same(trigsOf(c.t), c.t0) && same(flagsOf(c.t, "accent"), c.a0) && V.undoCount === c.u0, `pattern ${trigsOf(c.t).join(",")}, undo steps ${c.u0} -> ${V.undoCount}`), within: 8000 }
		],
		async tidy() { if (!$1("#deskmenu")?.hidden) closeDeskMenu(); if (S.stepSel) clearSel(); }
	};
	/* one step copied and pasted on its track, the two ways a person has: ⌘C / ⌘V as the operating system delivers them
	   (u.osKey: on macOS JUCE's web view turns them into the copy: and paste: commands, never a keydown; 0.3.3 lost them
	   there, in the standalone and in every DAW), and the top bar's Copy and Paste with the mouse (a host that keeps
	   ⌘C and ⌘V for itself leaves those). Each ends with the pattern as it was (⌘Z through the same way in). */
	const pickCopyStep = { say: "Cmd-click a step with a trig: it is selected", act: (u, c) => {
		c.L = Math.min(V.length, V.len); c.t0 = trigsOf(c.t); c.u0 = V.undoCount;
		c.s = c.t0.find(s => s < c.L) ?? 0; c.d = [...Array(c.L).keys()].find(s => !c.t0.includes(s) && Math.abs(s - c.s) > 1);
		if (c.d == null) throw new Error("no free step to paste to");
		if (S.stepSel) clearSel(); u.click(cell(c.t, c.s), { cmd: true });
	}, screen: c => ok($1(cell(c.t, c.s)).classList.contains("selx") && $all("#seq .st.selx").length === 1, $all("#seq .st.selx").length + " selected") };
	const pickPasteStep = { say: "Cmd-click an empty step of the same track", act: (u, c) => u.click(cell(c.t, c.d), { cmd: true }),
		screen: c => ok($1(cell(c.t, c.d)).classList.contains("selx") && !$1(cell(c.t, c.s)).classList.contains("selx"), "not selected") };
	const copyTrack = () => soundTracks().find(t => trigsOf(t).some(s => s < Math.min(V.length, V.len))) ?? soundTrack();
	const oneStepCopied = () => ok(V.clipboard.stepsSize?.length === 1 && V.clipboard.stepsSize?.tracks === 1, "clipboard " + JSON.stringify(V.clipboard.stepsSize));
	const osCopyPaste = {
		name: "md-seq-os-copy-paste", proves: ["MD-114", "MD-X10"], needs: Journey.osKeyPath,
		steps: [
			go("seq"), sel(copyTrack), pickCopyStep,
			{ say: "press Cmd+C on the keyboard (the operating system's way in)", act: async u => { document.activeElement?.blur?.(); await u.osKey("focus cmd+c"); },
				/* with the start tests' key probe on (GEARMULATOR_MDMM_KEYPROBE=1) its line says so too */
				screen: () => ok(Keys.seen().includes("cmd+C") && (!$1("#keyprobe") || $1("#keyprobe").textContent.includes(" cmd+C")),
					"keys that reached the page: " + Keys.seen().join(" ") + ($1("#keyprobe") ? "; probe: " + $1("#keyprobe").textContent : "")), machine: oneStepCopied },
			pickPasteStep,
			{ say: "press Cmd+V on the keyboard: the trig lands there", act: u => u.osKey("cmd+v"), screen: c => ok(pressed(cell(c.t, c.d)), "not lit"), machine: c => ok(trigsOf(c.t).includes(c.d), "pattern " + trigsOf(c.t).join(",")) },
			{ say: "press Cmd+Z on the keyboard: the track as before", act: u => u.osKey("cmd+z"),
				machine: c => ok(same(trigsOf(c.t), c.t0) && V.undoCount === c.u0, `pattern ${trigsOf(c.t).join(",")}, undo steps ${c.u0} -> ${V.undoCount}`), within: 8000 }
		],
		async tidy() { if (S.stepSel) clearSel(); }
	};
	const buttonsCopyPaste = {
		name: "md-seq-copy-paste-buttons", proves: ["MD-114", "MD-X10"],
		steps: [
			go("seq"), sel(copyTrack), pickCopyStep,
			{ say: "click Copy in the top bar: the selected step is copied", act: u => u.click('[data-sec="copy"]'), machine: oneStepCopied,
				screen: c => ok($1(cell(c.t, c.s)).classList.contains("selx"), "the selection went") },
			pickPasteStep,
			{ say: "click Paste in the top bar: the trig lands at the selected step", act: u => u.click('[data-sec="paste"]'), screen: c => ok(pressed(cell(c.t, c.d)), "not lit"),
				machine: c => ok(trigsOf(c.t).includes(c.d) && same(trigsOf(c.t).filter(s => s !== c.d), c.t0), "pattern " + trigsOf(c.t).join(",")) },
			{ say: "click Clr in the top bar: the pasted step is cleared again, nothing else", act: u => u.click('[data-sec="clear"]'), screen: c => ok(!pressed(cell(c.t, c.d)), "still lit"),
				machine: c => ok(same(trigsOf(c.t), c.t0), "pattern " + trigsOf(c.t).join(",")) },
			{ say: "Cmd+Z twice (clear, paste): the track as before", act: async u => { u.key("z", { cmd: true }); await sleep(800); u.key("z", { cmd: true }); },
				machine: c => ok(same(trigsOf(c.t), c.t0) && V.undoCount === c.u0, `pattern ${trigsOf(c.t).join(",")}, undo steps ${c.u0} -> ${V.undoCount}`), within: 8000 }
		],
		async tidy() { if (S.stepSel) clearSel(); }
	};
	const clearPatternJ = {
		name: "md-seq-clear-pattern-undo", proves: ["MD-121"],
		steps: [
			go("seq"),
			{ say: "press Alt+Delete: the whole pattern is cleared", act: (u, c) => { c.all = [...Array(16).keys()].map(trigsOf); document.activeElement?.blur?.(); u.key("Delete", { alt: true }); }, screen: () => ok(!$all("#seq .st.on").length, $all("#seq .st.on").length + " lit"), machine: () => ok([...Array(16).keys()].every(t => !trigsOf(t).length), "trigs left") },
			{ ...undoKey, say: "press Cmd+Z: every trig is back", screen: c => ok($all("#seq .st.on").length === c.all.flat().filter(s => s < V.len).length, $all("#seq .st.on").length + " lit"), machine: c => ok(same([...Array(16).keys()].map(trigsOf), c.all), "pattern differs") }
		]
	};
	const fillEveryJ = {
		name: "md-seq-fill-every", proves: ["MD-X09"],
		steps: [
			go("seq"), sel(() => soundTrack()),
			{ say: "right-click an empty step, choose Fill every 2nd from here: every 2nd step from there comes on", act: async (u, c) => { c.t0 = trigsOf(c.t); c.s = [...Array(V.len).keys()].find(s => s >= V.len - 8 && !c.t0.includes(s)) ?? V.len - 8; if (S.stepSel) clearSel(); u.rightClick(cell(c.t, c.s)); await sleep(150); u.click('#deskmenu [data-mid="step-fill-2"]'); },
				machine: c => { const want = []; for (let s = c.s; s < V.len; s += 2) want.push(s); return ok(want.every(s => trigsOf(c.t).includes(s)), "pattern " + trigsOf(c.t).join(",")); }, screen: c => ok(pressed(cell(c.t, c.s)) && pressed(cell(c.t, c.s + 2)), "not lit") },
			{ ...undoKey, machine: c => ok(same(trigsOf(c.t), c.t0), "pattern " + trigsOf(c.t).join(",")) }
		],
		async tidy() { if (S.stepSel) clearSel(); }
	};
	const rotateJ = {
		name: "md-seq-rotate", proves: ["MD-110"],
		steps: [
			go("seq"),
			{ say: "pick a track with trigs", act: (u, c) => { c.t = soundTracks().find(t => trigsOf(t).length) ?? 0; c.t0 = trigsOf(c.t); u.click(rail(c.t)); }, screen: c => ok(S.sel === c.t, "selected " + S.sel) },
			{ say: "press Alt+→: one step later", act: u => { document.activeElement?.blur?.(); u.key("ArrowRight", { alt: true }); }, machine: c => { const L = Math.min(V.length, V.len); return ok(same(trigsOf(c.t), sorted(c.t0.map(s => s >= L ? s : (s + 1) % L))), "pattern " + trigsOf(c.t).join(",")); }, screen: c => ok(gridShows(c.t), "grid differs") },
			{ say: "press Alt+←: back", act: u => u.key("ArrowLeft", { alt: true }), machine: c => ok(same(trigsOf(c.t), c.t0), "pattern " + trigsOf(c.t).join(",")) }
		]
	};
	/* a rotate run ends when the page sees Alt up in any event, not only in Alt's own keyup (which may never come:
	   these synthetic chords send none, as a window switch can lose it); the next rotate is then its own undo step */
	const rotateUndo = {
		name: "md-seq-rotate-undo", proves: ["MD-110"],
		steps: [
			go("seq"),
			{ say: "pick a track with trigs that a rotate changes", act: (u, c) => { const L = Math.min(V.length, V.len), r = t => sorted(trigsOf(t).map(s => s >= L ? s : (s + 1) % L));
				c.t = soundTracks().find(t => trigsOf(t).length && !same(r(t), trigsOf(t)) && !same(sorted(r(t).map(s => s >= L ? s : (s + 1) % L)), r(t))); if (c.t == null) throw new Error("no track a rotate changes");
				c.t0 = trigsOf(c.t); c.t1 = r(c.t); u.click(rail(c.t)); }, screen: c => ok(S.sel === c.t, "selected " + S.sel) },
			{ say: "press Alt+→: one step later", act: u => { document.activeElement?.blur?.(); u.key("ArrowRight", { alt: true }); }, machine: c => ok(same(trigsOf(c.t), c.t1), "pattern " + trigsOf(c.t).join(",")) },
			{ say: "press Shift (Alt is up now), then Alt+→ again: another rotate", act: async u => { u.key("Shift"); await sleep(300); u.key("ArrowRight", { alt: true }); }, machine: c => ok(!same(trigsOf(c.t), c.t1), "pattern " + trigsOf(c.t).join(",")) },
			{ say: "Cmd+Z: only the second rotate is undone", act: u => u.key("z", { cmd: true }), machine: c => ok(same(trigsOf(c.t), c.t1), "pattern " + trigsOf(c.t).join(",") + ", want " + c.t1.join(",")) },
			{ say: "Cmd+Z: and then the first", act: u => u.key("z", { cmd: true }), machine: c => ok(same(trigsOf(c.t), c.t0), "pattern " + trigsOf(c.t).join(",") + ", want " + c.t0.join(",")) }
		],
		async tidy(u, c) { for (let i = 0; i < 4 && c.t0 && !same(trigsOf(c.t), c.t0); i++) { u.key("z", { cmd: true }); await until(() => same(trigsOf(c.t), c.t0), 3000); } }
	};
	const trackKeys = {
		name: "md-keys-track-select", proves: ["MD-002"],
		steps: [
			go("seq"), sel(() => 0),
			{ say: "press ↓", act: u => { document.activeElement?.blur?.(); u.key("ArrowDown"); }, screen: () => ok(S.sel === 1 && $1("#rail .th.sel")?.dataset.sel === "1", "selected " + S.sel) },
			{ say: "press ↑", act: u => u.key("ArrowUp"), screen: () => ok(S.sel === 0, "selected " + S.sel) }
		]
	};
	const muteKeys = {
		name: "md-keys-mute", proves: ["MD-122"],
		steps: [
			go("seq"), sel(() => soundTrack()),
			{ say: "press M: the track is muted", act: (u, c) => { c.m0 = mutes(); document.activeElement?.blur?.(); u.key("m"); }, screen: c => ok(pressed(`#rail .th[data-sel="${c.t}"] .ms.m`), "M not lit"), machine: c => ok(mutes().includes(c.t), "machine mutes " + mutes()) },
			{ say: "press M again", act: u => u.key("m"), machine: c => ok(same(mutes(), c.m0), "machine mutes " + mutes()) },
			{ say: "press Alt+M: every track muted", act: u => u.key("m", { alt: true }), machine: () => ok(mutes().length === 16, "machine mutes " + mutes()), screen: () => ok($all("#rail .ms.m").every(b => b.getAttribute("aria-pressed") === "true"), "not every M lit") },
			/* a RAM recorder's mute is its freeze: 0 leaves it alone (soloKeep), so a person's kit with a recorder keeps that one muted */
			{ say: "press 0: every track unmuted (a RAM recorder left alone)", act: u => u.key("0"), machine: () => ok(!mutes().filter(i => !soloKeep().has(i)).length, "machine mutes " + mutes().join(",") + " (recorders " + [...soloKeep()].join(",") + ")"),
				screen: () => ok($all("#rail .ms.m").every(b => b.getAttribute("aria-pressed") === "false" || soloKeep().has(+b.closest("[data-sel]")?.dataset.sel)), "an M lit") }
		]
	};
	const liveRec = {
		name: "md-seq-live-record", proves: ["MD-013", "MD-112"],
		steps: [
			go("seq"),
			{ say: "click REC: live recording, playing", act: async (u, c) => { c.t = soundTracks().slice().sort((a, b) => trigsOf(a).length - trigsOf(b).length)[0] ?? soundTrack(); c.n0 = trigsOf(c.t).length; await keep(c, "pattern", currentPatternSlot()); u.click("#rec"); }, screen: () => ok(V.rec && $1("#rec").getAttribute("aria-pressed") === "true", "REC " + V.rec), machine: () => ok(tele.last?.playing, "not playing"), within: 5000 },
			{ say: "click a step of a track while it records: the machine records a trig", act: async (u, c) => { results.length = 0; c.at = S.step; u.click(cell(c.t, 0)); c.note = `track ${c.t + 1} (${c.n0} trigs), clicked at step ${c.at + 1}`; },
				machine: c => ok(trigsOf(c.t).length > c.n0, `${c.n0} -> ${trigsOf(c.t).length} trigs; results ${results.map(r => r.op + ":" + r.ok + (r.errors ? " " + r.errors.join(";") : "") + (r.note ? " " + r.note : "")).join(", ")}; telemetry rec ${tele.last?.rec ?? "?"} playing ${tele.last?.playing}`), within: 8000 },
			{ say: "click REC again, then STOP", act: async u => { u.click("#rec"); await sleep(500); if (V.playing) u.click("#play"); }, screen: () => ok(!V.rec && !V.playing, `REC ${V.rec}, playing ${V.playing}`), machine: () => ok(!tele.last?.playing, "playing") }
		],
		async tidy(u, c) { if (V.rec) u.click("#rec"); if (V.playing) u.click("#play"); await back(u, c); }
	};

	/* wave 7 (manual p.40): Delete held while live recording is EXIT/NO + the track's TRIG key on the machine; the track's
	   trigs go as they play. The key is held: a keydown now, its keyup later (u.key presses and lets go at once). */
	const keyEv = (type, key) => (document.activeElement && document.activeElement !== document.documentElement ? document.activeElement : document.body)
		.dispatchEvent(new KeyboardEvent(type, { key, code: key, bubbles: true, cancelable: true, composed: true }));
	const liveErase = {
		name: "md-seq-live-erase", proves: ["MD-113"],
		steps: [
			go("seq"),
			{ say: "pick the track with the most trigs", act: (u, c) => { c.t = soundTracks().slice().sort((a, b) => trigsOf(b).length - trigsOf(a).length)[0] ?? soundTrack(); c.p0 = trigsOf(c.t); c.others = [...Array(16).keys()].filter(t => t !== c.t).map(trigsOf); u.click(rail(c.t)); },
				screen: c => ok(S.sel === c.t, "selected " + S.sel), machine: c => ok(c.p0.length > 0, "no trigs on track " + (c.t + 1)) },
			{ say: "click REC: live recording, playing", act: u => u.click("#rec"), screen: () => ok(V.rec, "REC " + V.rec), machine: () => ok(tele.last?.playing, "not playing"), within: 5000 },
			{ say: "hold Delete: the selected track's trigs go as they play", act: (u, c) => { results.length = 0; document.activeElement?.blur?.(); u.cap("Delete held"); keyEv("keydown", "Delete"); },
				screen: () => ok(document.body.classList.contains("erasing"), "not marked as erasing"),
				machine: c => ok(trigsOf(c.t).length < c.p0.length, `${c.p0.length} -> ${trigsOf(c.t).length} trigs; results ${results.map(r => r.op + ":" + r.ok + (r.errors ? " " + r.errors.join(";") : "")).join(", ")}`), within: 10000 },
			{ say: "let Delete go, click REC off, then STOP: the other tracks kept their trigs", act: async u => { keyEv("keyup", "Delete"); await sleep(300); u.click("#rec"); await sleep(500); if (V.playing) u.click("#play"); },
				screen: () => ok(!document.body.classList.contains("erasing") && !V.rec && !V.playing, `REC ${V.rec}, playing ${V.playing}`),
				machine: c => { const ts = [...Array(16).keys()].filter(t => t !== c.t), bad = ts.filter((t, k) => !same(trigsOf(t), c.others[k]));
					return ok(!bad.length, "another track changed: " + bad.map(t => `track ${t + 1} ${c.others[ts.indexOf(t)].join(",")} -> ${trigsOf(t).join(",")}`).join("; ") + `; track ${c.t + 1} ${c.p0.join(",")} -> ${trigsOf(c.t).join(",")}`); }, within: 8000 }
		],
		async tidy(u, c) { keyEv("keyup", "Delete"); if (V.rec) u.click("#rec"); if (V.playing) u.click("#play"); await sleep(600);
			/* the erased trigs back, one click each (the machine's erase is not an undo step) */
			for (const s of c.p0 || []) if (!trigsOf(c.t).includes(s) && $1(cell(c.t, s))) { u.click(cell(c.t, s)); await sleep(120); } }
	};

	/* MD-140 (manual p.48): EXIT/NO with a DATA ENTRY knob pressed while live recording takes that parameter's locks of the
	   selected track off as they play. In the editor the value pressed is the knob: the mouse held on it, then Delete held.
	   The trigs and the other parameters stay. */
	const pressEv = (type, el) => { const r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true,
		clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0, buttons: type === "pointerdown" ? 1 : 0, pointerId: 1, pointerType: "mouse", isPrimary: true })); };
	const liveUnlock = {
		name: "md-seq-live-unlock", proves: ["MD-140"],
		steps: [
			go("seq"),
			{ say: "pick the track with the most trigs and no FLTF locks", act: (u, c) => { c.t = soundTracks().filter(t => !locksOf(t, pidx(t, "FLTF")).length).sort((a, b) => trigsOf(b).length - trigsOf(a).length)[0] ?? soundTrack(); c.i = pidx(c.t, "FLTF"); u.click(rail(c.t)); },
				screen: c => ok(S.sel === c.t, "selected " + S.sel), machine: c => ok(trigsOf(c.t).length >= 2 && c.i >= 0 && !locksOf(c.t, c.i).length, `track ${c.t + 1}: ${trigsOf(c.t).length} trigs, FLTF #${c.i} locks ${JSON.stringify(locksOf(c.t, c.i))}`) },
			{ say: "click the FLTF lock key and draw a lock on each of the track's trigs", act: async (u, c) => { u.click('#chips .pk[data-lane="FLTF"]'); await sleep(200); c.on = trigsOf(c.t).filter(s => s < V.len);
				await u.drag(`#lane .lb[data-s="${c.on[0]}"]`, c.on.slice(1).map(s => `#lane .lb[data-s="${s}"]`), {}, { fy: 0.3 }); },
				machine: c => { c.p0 = trigsOf(c.t); c.others = kitLocks(c); return ok(c.on.every(s => locksOf(c.t, c.i).some(([x]) => x === s)), "locks " + JSON.stringify(locksOf(c.t, c.i))); }, within: 8000 },
			{ say: "click REC, then the Sound tab: live recording, playing", act: async u => { u.click("#rec"); await sleep(300); u.click(tab("sound")); }, screen: () => ok(V.rec && S.ws === "sound", `REC ${V.rec}, workspace ${S.ws}`), machine: () => ok(tele.last?.playing, "not playing"), within: 5000 },
			{ say: "press the FLTF value and hold Delete: its locks go as they play", act: (u, c) => { results.length = 0; c.el = $1('#main .pc[data-n="FLTF"]'); if (!c.el) throw new Error("no FLTF value on the Sound page"); c.v0 = getV(c.el); pressEv("pointerdown", c.el); document.activeElement?.blur?.(); u.cap("value pressed, Delete held"); keyEv("keydown", "Delete"); },
				screen: c => ok(document.body.classList.contains("erasing") && c.el.classList.contains("erasing"), "not marked as erasing"),
				machine: c => ok(locksOf(c.t, c.i).length < c.on.length, `${c.on.length} -> ${locksOf(c.t, c.i).length} locks; results ${results.map(r => r.op + ":" + r.ok + (r.errors ? " " + r.errors.join(";") : "")).join(", ")}`), within: 10000 },
			{ say: "drag the pressed value, let Delete go first, drag on: the value does not move until the mouse is let go", act: async (u, c) => {
				/* the drag's moves go to the value (the page's #main listens), sideways towards the far end of its range */
				const d = c.v0 > 64 ? -1 : 1, move = dx => { const r = c.el.getBoundingClientRect(); c.el.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: r.left + r.width / 2 + d * dx, clientY: r.top + r.height / 2, buttons: 1, pointerId: 1, pointerType: "mouse", isPrimary: true })); };
				move(20); await sleep(100); keyEv("keyup", "Delete"); await sleep(100); move(40); await sleep(100); move(60); await sleep(100); c.v1 = getV(c.el); pressEv("pointerup", c.el); },
				screen: c => ok(c.v1 === c.v0 && !document.body.classList.contains("erasing"), `value ${c.v0} -> ${c.v1}`) },
			{ say: "on Mix, press a master effect value (it has no locks) and hold Delete: nothing is erased, the editor says so", act: async (u, c) => {
				u.click(tab("mix")); await sleep(300);
				c.nl = $1('#main .pc[data-g="mfx"]'); if (!c.nl) throw new Error("no master effect value on the Mix page");
				c.n = eraseSent.length; c.p1 = trigsOf(c.t); pressEv("pointerdown", c.nl); keyEv("keydown", "Delete"); await sleep(500); },
				screen: () => ok(/no locks/.test($1("#toast")?.textContent || ""), "toast " + ($1("#toast")?.textContent || "")),
				machine: c => ok(eraseSent.length === c.n && same(trigsOf(c.t), c.p1), `sent ${JSON.stringify(eraseSent.slice(c.n))}, trigs ${trigsOf(c.t).join(",")}`) },
			{ say: "let both go; hold Delete and press the FLTF value within the grace: only its locks are asked for, never the trigs", act: async (u, c) => {
				keyEv("keyup", "Delete"); pressEv("pointerup", c.nl); u.click(tab("sound")); await sleep(300); c.n = eraseSent.length;
				/* Delete, then the value in the same moment (well inside the grace, also on a busy machine); the value looked up
				   now, as the page shows it */
				keyEv("keydown", "Delete"); c.el = $1('#main .pc[data-n="FLTF"]'); pressEv("pointerdown", c.el); await sleep(500); },
				screen: c => ok(c.el.classList.contains("erasing"), "the value is not marked"),
				machine: c => ok(eraseSent.slice(c.n).some(m => m.on) && eraseSent.slice(c.n).every(m => !m.on || m.i === c.i), "sent " + JSON.stringify(eraseSent.slice(c.n))) },
			{ say: "let the value and Delete go, click REC off, then STOP: the trigs and the other locks stayed", act: async (u, c) => { pressEv("pointerup", c.el); keyEv("keyup", "Delete"); await sleep(300); u.click("#rec"); await sleep(500); if (V.playing) u.click("#play"); },
				screen: c => ok(!document.body.classList.contains("erasing") && !c.el.classList.contains("erasing") && !V.rec && !V.playing, `REC ${V.rec}, playing ${V.playing}`),
				machine: c => ok(same(trigsOf(c.t), c.p0) && same(kitLocks(c), c.others), `trigs ${trigsOf(c.t).join(",")} (were ${c.p0.join(",")}); other locks changed: ${!same(kitLocks(c), c.others)}`), within: 8000 }
		],
		async tidy(u, c) { if (c.el) pressEv("pointerup", c.el); if (c.nl) pressEv("pointerup", c.nl); keyEv("keyup", "Delete"); if (V.rec) u.click("#rec"); if (V.playing) u.click("#play"); await sleep(600);
			/* the FLTF locks it drew and the machine left: its undo steps back (the lane's clear key for what the undo does not hold) */
			await undoTo(u, c.back0.undo);
			if (c.i >= 0 && locksOf(c.t, c.i).length) { u.click(tab("seq")); await sleep(200); u.click('#chips .pk[data-lane="FLTF"]'); await sleep(200); u.click("#clearLane"); await sleep(300); } }
	};
	/* the liveErase commands the page sent (MD-140's journey checks what Delete asked for) */
	const eraseSent = [];
	{ const send0 = Bridge.send; Bridge.send = (m, o) => { if (m?.op === "liveErase") { eraseSent.push({ t: m.t, on: m.on, i: m.i }); if (eraseSent.length > 80) eraseSent.shift(); } return send0(m, o); }; }
	/* every lock of the pattern but the journey's own parameter on its track */
	const kitLocks = c => JSON.stringify((pat()?.locks || []).filter(l => !(l.track === c.t && l.param === c.i)));

	/* ---------- generators ---------- */
	/* the GEN dialog (its dice key on the track's row in the list; the dialog is the track's until Done or Cancel) */
	const genDiceKey = t => `#rail .th[data-sel="${t}"] [data-genopen]`;
	const genAt = async (u, t) => { await u.glide(genDiceKey(t)); u.click(genDiceKey(t)); await sleep(200); };
	const genDone = async u => { if ($1("#genpop") && !$1("#genpop").hidden) { u.click("#genpop [data-genclose]"); await sleep(250); } };
	const genJourney = (name, defaults, o = {}) => ({
		name, proves: o.proves,
		steps: [
			{ say: "on Sequence, pick a drum track (a kick if there is one)", act: (u, c) => {
				u.click(tab("seq")); const role = t => genRole(V.tracks[t].m);
				c.t = [...Array(16).keys()].find(t => role(t) === "kick") ?? [...Array(16).keys()].find(t => role(t) !== "keep") ?? 0;
				u.click(rail(c.t)); c.p0 = trigsOf(c.t);
			}, screen: c => ok(S.ws === "seq" && S.sel === c.t && !!$1(genDiceKey(c.t)), "no GEN key on the track"), machine: c => ok(!!pat() && genRole(V.tracks[c.t].m) !== "keep", "no drum track") },
			{ say: "click the track's GEN key: the dialog opens under the track's row, the first value box has the focus", act: u => u.click(genDiceKey(S.sel)), screen: c => { const p = $1("#genpop"), r = $1(`#seq .r[data-row="${c.t}"]`)?.getBoundingClientRect(), b = p?.getBoundingClientRect(); return ok(p && !p.hidden && !!$1("#genpop [data-rand]") && document.activeElement?.classList.contains("gv") && b.top >= r.bottom - 1 || b.bottom <= r.top + 1, `dialog ${b && Math.round(b.top)}-${b && Math.round(b.bottom)}, row ${r && Math.round(r.top)}-${r && Math.round(r.bottom)}, focus ${document.activeElement?.className}`); } },
			...(defaults ? [{ say: "click GEN's Defaults key", act: u => u.click('#genpop [data-gen="fill"]'), machine: c => ok(genSpec(c.t).kind !== "keep", "spec " + JSON.stringify(genSpec(c.t))) }] : []),
			{ say: "the GEN dialog offers the track's generator, not Keep", screen: c => ok($1('#genpop [data-genkind][aria-pressed="true"]')?.dataset.genkind !== "keep", `GEN mode shows ${$1('#genpop [data-genkind][aria-pressed="true"]')?.dataset.genkind} for ${V.tracks[c.t].m} (role ${genRole(V.tracks[c.t].m)}); every track's spec: ${genSpecs().map(x => x.kind[0]).join("")}`) },
			{ say: "click GEN's Random key until the rhythm changes", act: async (u, c) => { c.base = defaults ? c.p0 : trigsOf(c.t); for (let i = 0; i < 5; i++) { u.click("#genpop [data-rand]"); if (await until(() => !same(trigsOf(c.t), c.base) && idle(), 2500)) break; } c.note = `track ${c.t + 1}: ${c.p0.length} -> ${trigsOf(c.t).length} trigs`; },
				screen: c => ok(gridShows(c.t), "the grid does not show the pattern"), machine: c => ok(!same(trigsOf(c.t), c.p0) && same(trigsOf(c.t), lit(c.t)), `pattern ${trigsOf(c.t).join(",")}; before ${c.p0.join(",")}; view ${lit(c.t).join(",")}`) },
			{ say: "click Done: the dialog closes and keeps the run", act: u => u.click("#genpop [data-genclose]"), screen: () => ok($1("#genpop").hidden, "the dialog is open"), machine: c => ok(!same(trigsOf(c.t), c.p0), "rhythm gone") },
			{ say: "click the Sound tab and MUTATE's Random key", act: async (u, c) => { u.click(tab("sound")); await sleep(300); c.k0 = kitVals(c.t); u.click("#mutband [data-rand]"); },
				screen: c => ok(S.ws === "sound" && !!S.mut.note && $all('#main .pc[data-g="syn"]').every(el => V.tracks[c.t].syn[el.dataset.n] == null || +el.querySelector("b")?.textContent === V.tracks[c.t].syn[el.dataset.n]), "note " + S.mut.note), machine: c => ok(!same(kitVals(c.t), c.k0), "kit unchanged") },
			{ say: "click Undo: the sound is back", act: u => u.click("#undo"), screen: c => ok($all('#main .pc[data-g="syn"]').every(el => +el.querySelector("b")?.textContent === c.k0[pidx(c.t, el.dataset.n, "syn")]), "boxes " + $all('#main .pc[data-g="syn"] b').map(b => b.textContent).join(",")), machine: c => ok(same(kitVals(c.t), c.k0), "kit " + kitVals(c.t).join(",")), within: 8000 },
			{ say: "click Undo again: the rhythm is back (the GEN run was one undo step)", act: u => u.click("#undo"), machine: c => ok(same(trigsOf(c.t), c.p0), "pattern " + trigsOf(c.t).join(",")), within: 8000 },
			{ say: "click the Sequence tab: the grid shows it", act: u => u.click(tab("seq")), screen: c => ok(c.p0.every(s => pressed(cell(c.t, s))) && $all(`#seq .st[data-t="${c.t}"][aria-pressed="true"]`).length === c.p0.filter(s => s < V.len).length, "grid differs") }
		],
		async tidy(u, c) { for (let i = 0; i < 3 && c.p0 && !same(trigsOf(c.t), c.p0); i++) { u.click("#undo"); await until(idle, 3000); await sleep(500); } }
	});
	const genKeys = {
		name: "md-gen-keys-r", proves: ["MD-X04"],
		steps: [
			go("seq"),
			{ say: "pick a drum track and click Defaults", act: async (u, c) => { c.t = [...Array(16).keys()].find(t => genRole(V.tracks[t].m) === "kick") ?? soundTrack(); c.p0 = trigsOf(c.t); u.click(rail(c.t)); await sleep(200); await genAt(u, c.t); u.click('#genpop [data-gen="fill"]'); }, machine: c => ok(genSpec(c.t).kind !== "keep" && idle(), "keep") },
			{ say: "press R until the rhythm changes", act: async (u, c) => { c.p1 = trigsOf(c.t); for (let i = 0; i < 5; i++) { u.key("r"); if (await until(() => !same(trigsOf(c.t), c.p1) && idle(), 2500)) break; } }, machine: c => ok(!same(trigsOf(c.t), c.p1), "unchanged"), screen: c => ok(gridShows(c.t), "grid differs") },
			/* one more hit, or one fewer when R rolled every step a hit (Hits stops at Steps: a click changes nothing; the
			   page tier's one failure in three runs) */
			{ say: "click GEN's Hits value: one more hit (Shift-click: one fewer, when every step is a hit)", act: (u, c) => { c.p2 = trigsOf(c.t); const g = $1('#genpop .gv[data-gv="k"]'); if (!g) throw new Error("not a Euclid spec: " + JSON.stringify(genSpec(c.t)));
				const sp = genSpec(c.t); u.click(g, { shift: sp.k >= sp.n }); }, machine: c => ok(!same(trigsOf(c.t), c.p2), "unchanged") },
			{ say: "press Enter: Done keeps the run", act: u => u.key("Enter"), screen: () => ok($1("#genpop").hidden, "the dialog is open") },
			{ ...undoKey, say: "press Cmd+Z: the whole run goes in one step", machine: c => ok(same(trigsOf(c.t), c.p0), "pattern " + trigsOf(c.t).join(",")), within: 8000 }
		],
		async tidy(u, c) { for (let i = 0; i < 3 && c.p0 && !same(trigsOf(c.t), c.p0); i++) { u.click("#undo"); await sleep(800); } }
	};

	/* the GEN dialog as a session (Radek, 2026-10-14): Cancel takes it all back, Done keeps it as one undo step, another track's
	   key moves it without closing, the title drags it, a value is typed or reset by double-click */
	const genModal = {
		name: "md-gen-modal", proves: ["MD-X04"],
		steps: [
			go("seq"),
			{ say: "pick two drum tracks and click the first one's GEN key", act: async (u, c) => { const ts = [...Array(16).keys()].filter(t => genRole(V.tracks[t].m) !== "keep"); c.t = ts[0]; c.t2 = ts[1]; c.p0 = trigsOf(c.t); c.q0 = trigsOf(c.t2); await genAt(u, c.t); },
				screen: c => ok(!$1("#genpop").hidden && S.sel === c.t && document.activeElement?.classList.contains("gv"), "dialog " + $1("#genpop").hidden + ", focus " + document.activeElement?.className) },
			{ say: "click Defaults: the rhythm is written at once", act: u => u.click('#genpop [data-gen="fill"]'), machine: c => ok(!same(trigsOf(c.t), c.p0) && idle(), "unchanged"), within: 6000 },
			{ say: "click the second track's GEN key: the dialog goes to it, still open", act: async (u, c) => { await genAt(u, c.t2); }, screen: c => ok(!$1("#genpop").hidden && S.sel === c.t2 && /track/.test($1("#genpop .gdhead")?.textContent), "sel " + S.sel) },
			{ say: "click Defaults there too", act: u => u.click('#genpop [data-gen="fill"]'), machine: c => ok(!same(trigsOf(c.t2), c.q0) && idle(), "unchanged"), within: 6000 },
			{ say: "drag the title: the dialog moves and stays inside the window; double-click the title: it goes back", act: async (u, c) => { const p = $1("#genpop"); c.b0 = p.getBoundingClientRect(); await u.drag("#genpop .gdhead", [[-60, 20], [-120, 40]], {}, { click: false }); c.b1 = p.getBoundingClientRect(); c.still = !$1("#genpop").hidden; u.dblclick("#genpop .gdhead"); await sleep(100); c.b2 = p.getBoundingClientRect(); },
				screen: c => ok(c.still && c.b1.left < c.b0.left - 50 && c.b1.top > c.b0.top + 10 && c.b1.left >= 0 && c.b1.bottom <= innerHeight && Math.abs(c.b2.left - c.b0.left) < 2 && Math.abs(c.b2.top - c.b0.top) < 2, `before ${Math.round(c.b0.left)},${Math.round(c.b0.top)} moved ${Math.round(c.b1.left)},${Math.round(c.b1.top)} back ${Math.round(c.b2.left)},${Math.round(c.b2.top)}`) },
			{ say: "click Cancel: both tracks are back as they were", act: u => u.click("#genpop [data-gencancel]"), screen: () => ok($1("#genpop").hidden, "still open"), machine: c => ok(same(trigsOf(c.t), c.p0) && same(trigsOf(c.t2), c.q0), `t ${trigsOf(c.t)} / ${c.p0}; t2 ${trigsOf(c.t2)} / ${c.q0}`), within: 9000 },
			{ say: "open the first track again, click Defaults, press Esc: it is cancelled the same way", act: async (u, c) => { await genAt(u, c.t); u.click('#genpop [data-gen="fill"]'); await until(() => !same(trigsOf(c.t), c.p0) && idle(), 4000); u.key("Escape"); }, machine: c => ok(same(trigsOf(c.t), c.p0), "pattern " + trigsOf(c.t)), screen: () => ok($1("#genpop").hidden, "still open"), within: 9000 },
			{ say: "open it, type 3 into Hits (or Density): ⌘-click, type, Enter", act: async (u, c) => { await genAt(u, c.t); const g = $1('#genpop .gv[data-gv="k"], #genpop .gv[data-gv="dens"]'); c.k = g.dataset.gv; u.click(g, { cmd: true }); await sleep(100); const f = $1("input.vedit"); f.value = "3"; u.key("Enter"); await sleep(300); },
				screen: c => ok(+$1(`#genpop .gv[data-gv="${c.k}"] b`)?.textContent.replace("%", "") === 3 && !$1("input.vedit"), "box " + $1(`#genpop .gv[data-gv="${c.k}"] b`)?.textContent) },
			{ say: "double-click the box: its default", act: async (u, c) => { u.dblclick(`#genpop .gv[data-gv="${c.k}"]`); await sleep(300); }, screen: c => ok(+$1(`#genpop .gv[data-gv="${c.k}"] b`)?.textContent.replace("%", "") !== 3, "still 3") },
			{ say: "press Enter: Done keeps it; one Undo takes the whole session of this track back", act: async (u, c) => { c.p1 = trigsOf(c.t); u.key("Enter"); await sleep(300); u.click("#undo"); await until(idle, 3000); },
				screen: () => ok($1("#genpop").hidden, "still open"), machine: c => ok(same(trigsOf(c.t), c.p0), "pattern " + trigsOf(c.t) + " vs " + c.p0), within: 9000 }
		],
		async tidy(u, c) { await genDone(u); for (let i = 0; i < 3 && c.p0 && !same(trigsOf(c.t), c.p0); i++) { u.click("#undo"); await sleep(800); } }
	};
	/* the lane toolbox on the lock lane's title row: a shape writes the locks over the steps with a trig, one undo step; Flat reaches 0 % */
	const laneTools = {
		name: "md-lane-tools", proves: [],
		steps: [
			go("seq"),
			{ say: "pick a track with trigs and the FLTF lane (or the first lane)", act: async (u, c) => { c.t = [...Array(16).keys()].find(t => trigsOf(t).length >= 3); u.click(rail(c.t)); await sleep(200); c.ln = S.lane; c.s = trigsOf(c.t).filter(s => s < 16); c.l0 = JSON.stringify([...(V.locks.get(lk(c.t, c.ln)) || [])]); },
				screen: c => ok(S.sel === c.t && !!$1(".lanetop .xlane [data-xs=up]"), "no lane toolbox on the title row") },
			{ say: "hover Ramp up: the lane shows it faint, nothing is written", act: async (u, c) => { await u.glide(".xlane [data-xs=up]"); $1(".xlane [data-xs=up]").dispatchEvent(new PointerEvent("pointerover", { bubbles: true })); await sleep(100); }, screen: c => ok($all("#lane .xghost").length >= 3 && JSON.stringify([...(V.locks.get(lk(c.t, c.ln)) || [])]) === c.l0, `${$all("#lane .xghost").length} ghosts`) },
			{ say: "click Ramp up: a lock on every step with a trig, rising", act: u => u.click(".xlane [data-xs=up]"), screen: c => ok($all("#lane .xghost").length === 0, "ghosts stay"), machine: c => { const m = V.locks.get(lk(c.t, c.ln)), v = trigsOf(c.t).filter(s => s < 16).map(s => m?.get(s)); return ok(v.length >= 3 && v.every((x, i) => x != null && (!i || x > v[i - 1])), "locks " + v); }, within: 4000 },
			{ say: "click Undo once: the lane is as it was (the shape was one step)", act: async u => { await until(idle, 3000); await sleep(300); u.click("#undo"); }, machine: c => ok(JSON.stringify([...(V.locks.get(lk(c.t, c.ln)) || [])]) === c.l0, "locks " + JSON.stringify([...(V.locks.get(lk(c.t, c.ln)) || [])])), within: 6000 },
			{ say: "click Flat five times: 50, 75, 100, 25 and 0 % (the lock value 0 is a lock)", act: async (u, c) => { c.vals = []; for (let i = 0; i < 5; i++) { u.click(".xlane [data-xs=flat]"); await sleep(250); c.vals.push(c.s.map(s => V.locks.get(lk(c.t, c.ln))?.get(s)).join("/")); } },
				screen: () => ok(true), machine: c => ok(c.vals.join(" ") === [64, 95, 127, 32, 0].map(v => c.s.map(() => v).join("/")).join(" "), c.vals.join(" ")) },
			{ say: "the Flat icon at 0 % differs from the one at 25 %, and the lane still shows the lock", screen: c => ok($1(".xlane [data-xs=flat] path:not([opacity])") && $all("#lane .lb:not(.none) i").length >= c.s.length, "no bars: " + $all("#lane .lb:not(.none) i").length) },
			{ say: "click Inv, then Undo twice: back to the start", act: async (u, c) => { u.click(".xlane [data-xt=invert]"); await sleep(250); c.inv = c.s.map(s => V.locks.get(lk(c.t, c.ln))?.get(s)).join("/"); for (let i = 0; i < 6; i++) { u.click("#undo"); await sleep(300); } },
				machine: c => ok(c.inv === c.s.map(() => 127).join("/") && JSON.stringify([...(V.locks.get(lk(c.t, c.ln)) || [])]) === c.l0, `inv ${c.inv}; locks ${JSON.stringify([...(V.locks.get(lk(c.t, c.ln)) || [])])}`), within: 9000 }
		],
		async tidy(u, c) { for (let i = 0; i < 8 && c.l0 != null && JSON.stringify([...(V.locks.get(lk(c.t, c.ln)) || [])]) !== c.l0; i++) { u.click("#undo"); await sleep(500); } }
	};

	/* ---------- Sound ---------- */
	const shapeSound = {
		name: "md-sound-shape-undo", proves: ["MD-010", "MD-054"],
		steps: [
			{ say: "click the Sound tab: grouped by function", act: u => u.click(tab("sound")), screen: () => onTab("sound") === true ? ok($all("#main .sg").length >= 3, $all("#main .sg").length + " groups") : onTab("sound"), machine: () => ok(!!kit(), "no kit") },
			sel(() => soundTrack()),
			{ say: "drag a synthesis value sideways", act: async (u, c) => { const el = $1('#main .pc[data-g="syn"]'); c.n = el.dataset.n; c.i = pidx(c.t, c.n, "syn"); c.v0 = kitVals(c.t)[c.i]; await nudge(u, el, c.v0); c.note = `T${c.t + 1} ${c.n} ${c.v0} -> ${V.tracks[c.t].syn[c.n]}`; },
				screen: c => { const b = $1(`#main .pc[data-g="syn"][data-n="${c.n}"] b`)?.textContent; return ok(b != null && +b === V.tracks[c.t].syn[c.n] && +b !== c.v0, "shows " + b); },
				machine: c => ok(kitVals(c.t)[c.i] !== c.v0 && kitVals(c.t)[c.i] === V.tracks[c.t].syn[c.n] && machineState().kit.working === "edited", `kit ${c.n} = ${kitVals(c.t)[c.i]}, ${machineState().kit.working}`) },
			{ say: "click Undo", act: u => u.click("#undo"), screen: c => ok(+$1(`#main .pc[data-g="syn"][data-n="${c.n}"] b`)?.textContent === c.v0, "shows " + $1(`#main .pc[data-g="syn"][data-n="${c.n}"] b`)?.textContent), machine: c => ok(kitVals(c.t)[c.i] === c.v0, `kit ${c.n} = ${kitVals(c.t)[c.i]}`) }
		]
	};
	/* I-022: a value typed: ⌘-click a value box, type, Enter (one edit, one undo step); past the end is refused and the
	   field stays; Esc leaves it; Enter on the focused box opens it again; double-click is still the default */
	const field = () => $1("input.vedit");
	const typeIn = (u, text) => { const f = field(); if (!f) throw new Error("no value field"); f.value = text; u.key("Enter"); };
	const boxText = q => $1(`${q} b`)?.textContent;
	const typeValue = {
		name: "md-sound-type-value", proves: ["MD-010", "MD-054", "MD-X08"],
		steps: [
			go("sound"), sel(() => soundTrack()),
			{ say: "⌘-click a synthesis value: a field over it with the value it shows", act: (u, c) => {
				const el = $all('#main .pc[data-g="syn"]').find(e => !SIGNED.has(e.dataset.n)); if (!el) throw new Error("no synthesis value");
				c.n = el.dataset.n; c.i = pidx(c.t, c.n, "syn"); c.q = `#main .pc[data-g="syn"][data-n="${c.n}"]`; c.v0 = kitVals(c.t)[c.i];
				u.click(c.q, { cmd: true }); },
				screen: c => ok(!!field() && field().value === String(c.v0) && document.activeElement === field(), "field " + field()?.value + ", kit " + c.v0) },
			{ say: "type a value and press Enter: the box shows it, the machine has it", act: (u, c) => { c.v1 = c.v0 === 100 ? 20 : 100; typeIn(u, String(c.v1)); },
				screen: c => ok(!field() && boxText(c.q) === String(c.v1), "shows " + boxText(c.q)), machine: c => ok(kitVals(c.t)[c.i] === c.v1, `kit ${c.n} = ${kitVals(c.t)[c.i]}`), within: 6000 },
			{ say: "⌘-click it again and type 128: refused, the field stays, nothing sent", act: (u, c) => { u.click(c.q, { cmd: true }); typeIn(u, "128"); },
				screen: c => ok(!!field() && field().classList.contains("bad") && /0 to 127/.test(field().title), "field " + field()?.className + " " + field()?.title), machine: c => ok(kitVals(c.t)[c.i] === c.v1, `kit ${c.n} = ${kitVals(c.t)[c.i]}`) },
			{ say: "press Esc: the field goes, the value as it was", act: u => u.key("Escape"), screen: c => ok(!field() && boxText(c.q) === String(c.v1) && document.activeElement === $1(c.q), "shows " + boxText(c.q)) },
			{ say: "press Enter on the box (it has the focus): the field again; type 30", act: async (u, c) => { u.key("Enter"); await sleep(50); typeIn(u, "30"); },
				screen: c => ok(!field() && boxText(c.q) === "30", "shows " + boxText(c.q)), machine: c => ok(kitVals(c.t)[c.i] === 30, `kit ${c.n} = ${kitVals(c.t)[c.i]}`), within: 6000 },
			{ say: "double-click the box: 64, as before", act: (u, c) => u.dblclick(c.q), screen: c => ok(boxText(c.q) === "64", "shows " + boxText(c.q)), machine: c => ok(kitVals(c.t)[c.i] === 64, `kit ${c.n} = ${kitVals(c.t)[c.i]}`), within: 6000 },
			{ ...undoKey, say: "Cmd+Z: 30 again", machine: c => ok(kitVals(c.t)[c.i] === 30, `kit ${c.n} = ${kitVals(c.t)[c.i]}`), within: 6000 },
			{ ...undoKey, say: "Cmd+Z: each typed value is one undo step", machine: c => ok(kitVals(c.t)[c.i] === c.v1, `kit ${c.n} = ${kitVals(c.t)[c.i]}`), within: 6000 },
			{ ...undoKey, say: "Cmd+Z: as it was", machine: c => ok(kitVals(c.t)[c.i] === c.v0, `kit ${c.n} = ${kitVals(c.t)[c.i]}`), screen: c => ok(boxText(c.q) === String(c.v0), "shows " + boxText(c.q)), within: 6000 }
		],
		async tidy() { if (field()) ValueEdit.close(); }
	};
	const arrows = {
		name: "md-sound-value-keys", proves: ["MD-010", "MD-054", "MD-X08"],
		steps: [
			go("sound"), sel(() => soundTrack()),
			{ say: "focus an effects value and press ↑ three times", act: async (u, c) => { const el = $1('#main .pc[data-g="fx"]'); c.n = el.dataset.n; c.i = pidx(c.t, c.n, "fx"); c.v0 = kitVals(c.t)[c.i]; el.focus(); const d = c.v0 > 120 ? "ArrowDown" : "ArrowUp"; c.want = c.v0 + (d === "ArrowUp" ? 3 : -3); for (let k = 0; k < 3; k++) { u.key(d); await sleep(80); } },
				screen: c => ok(S.sel === c.t && +$1(`#main .pc[data-g="fx"][data-n="${c.n}"] b`)?.textContent === c.want, `shows ${$1(`#main .pc[data-g="fx"][data-n="${c.n}"] b`)?.textContent}, want ${c.want} (from ${c.v0}); selected track ${S.sel + 1} (was ${c.t + 1}); focus now ${document.activeElement?.className || document.activeElement?.tagName}`), machine: c => ok(kitVals(c.t)[c.i] === c.want, "kit " + kitVals(c.t)[c.i]) },
			{ say: "click Undo until it is back", act: async (u, c) => { for (let k = 0; k < 3 && kitVals(c.t)[c.i] !== c.v0; k++) { u.click("#undo"); await sleep(700); } }, machine: c => ok(kitVals(c.t)[c.i] === c.v0, "kit " + kitVals(c.t)[c.i]) }
		]
	};
	const machinePick = {
		name: "md-sound-machine-pick-undo", proves: ["MD-047", "MD-285"],
		steps: [
			go("sound"), sel(() => soundTrack()),
			{ say: "click the machine key: the picker opens", act: (u, c) => { c.m0 = kit().tracks[c.t].machine; u.click("#machbtn"); }, screen: () => ok(!$1("#machpop").hidden && $all("#machpop .mk").length > 3, "picker closed") },
			{ say: "pick another family and a machine in it", act: async (u, c) => { u.click('#machpop .mf[data-fam="GND"]'); await sleep(200); const m = $all("#machpop .mk").find(b => b.dataset.mach !== c.m0 && b.dataset.mach !== "GND-EMPTY"); c.m1 = m.dataset.mach; u.click(m); },
				screen: c => ok($1("#machpop").hidden && V.tracks[c.t].m === c.m1, "view " + V.tracks[c.t].m), machine: c => ok(kit().tracks[c.t].machine === c.m1, "kit machine " + kit().tracks[c.t].machine), within: 6000 },
			{ ...undoKey, machine: c => ok(kit().tracks[c.t].machine === c.m0, "kit machine " + kit().tracks[c.t].machine), screen: c => ok(V.tracks[c.t].m === c.m0, "view " + V.tracks[c.t].m), within: 6000 }
		]
	};
	/* wave 8: the machine picker's audition (the machine's EDIT KIT preview): ▶ or Space puts the machine on the track and
	   plays its note; Esc puts the old one back; Enter keeps it, and the audition and the pick are one undo step */
	const gndOthers = c => $all("#machpop .mk").map(b => b.dataset.mach).filter(m => m !== c.m0 && m !== "GND-EMPTY");
	const machAudition = {
		name: "md-sound-audition", proves: ["MD-037"],
		steps: [
			go("sound"), sel(() => soundTrack()),
			{ say: "open the machine picker on the GND family", act: async (u, c) => { c.m0 = kit().tracks[c.t].machine; c.k0 = JSON.stringify(kit().tracks[c.t]); u.click("#machbtn"); await sleep(200); u.click('#machpop .mf[data-fam="GND"]'); await sleep(200); },
				screen: () => ok(!$1("#machpop").hidden && $all("#machpop .mk").length > 2, "picker closed") },
			{ say: "click ▶ on a machine: it plays on the track, the picker stays open", act: async (u, c) => { c.m1 = gndOthers(c)[0]; results.length = 0; $1(`#machpop .mk[data-mach="${c.m1}"]`).focus(); await sleep(100); u.click(`#machpop .mk[data-mach="${c.m1}"] [data-play]`); },
				screen: c => ok(!$1("#machpop").hidden && V.tracks[c.t].m === c.m1 && /was/i.test($1("#mpaud")?.textContent || ""), `picker ${$1("#machpop").hidden ? "closed" : "open"}, view ${V.tracks[c.t].m}, line "${$1("#mpaud")?.textContent || "none"}"`),
				machine: c => ok(kit().tracks[c.t].machine === c.m1 && results.some(r => r.op === "noteOn" && r.ok), `kit machine ${kit().tracks[c.t].machine}, results ${results.map(r => r.op + ":" + r.ok).join(",")}`), within: 6000 },
			{ say: "press Esc: the old machine is back, every value of the track as it was", act: u => u.key("Escape"),
				screen: c => ok($1("#machpop").hidden && V.tracks[c.t].m === c.m0, `picker ${$1("#machpop").hidden ? "closed" : "open"}, view ${V.tracks[c.t].m}`),
				machine: c => ok(JSON.stringify(kit().tracks[c.t]) === c.k0, "kit track " + JSON.stringify(kit().tracks[c.t]) + ", was " + c.k0), within: 6000 },
			{ say: "open it again, focus another machine and press Space: it plays", act: async (u, c) => { u.click("#machbtn"); await sleep(200); u.click('#machpop .mf[data-fam="GND"]'); await sleep(200); c.m2 = gndOthers(c).slice(-1)[0]; results.length = 0; $1(`#machpop .mk[data-mach="${c.m2}"]`).focus(); await sleep(100); u.key(" "); },
				screen: c => ok(!$1("#machpop").hidden && V.tracks[c.t].m === c.m2, `picker ${$1("#machpop").hidden ? "closed" : "open"}, view ${V.tracks[c.t].m}`),
				machine: c => ok(kit().tracks[c.t].machine === c.m2 && results.some(r => r.op === "noteOn"), `kit machine ${kit().tracks[c.t].machine}, results ${results.map(r => r.op + ":" + r.ok).join(",")}`), within: 6000 },
			{ say: "press Enter: it stays", act: u => u.key("Enter"),
				screen: c => ok($1("#machpop").hidden && V.tracks[c.t].m === c.m2, `picker ${$1("#machpop").hidden ? "closed" : "open"}, view ${V.tracks[c.t].m}`),
				machine: c => ok(kit().tracks[c.t].machine === c.m2, "kit machine " + kit().tracks[c.t].machine), within: 6000 },
			{ ...undoKey, say: "press Cmd+Z once: the track as before the audition", machine: c => ok(JSON.stringify(kit().tracks[c.t]) === c.k0, "kit track " + JSON.stringify(kit().tracks[c.t]) + ", was " + c.k0), screen: c => ok(V.tracks[c.t].m === c.m0, "view " + V.tracks[c.t].m), within: 6000 }
		],
		async tidy() { if (!$1("#machpop").hidden) closePicker(); }
	};
	const soundCopy = {
		name: "md-sound-copy-paste", proves: ["MD-051", "MD-052"],
		steps: [
			go("sound"),
			{ say: "pick a track and press Cmd+C", act: async (u, c) => { const st = soundTracks(); c.a = st[0]; c.b = st.find(t => t !== c.a && kit().tracks[t].machine !== kit().tracks[c.a].machine) ?? st[1]; c.kb = JSON.stringify(kit().tracks[c.b]); u.click(rail(c.a)); await sleep(200); document.activeElement?.blur?.(); u.key("c", { cmd: true }); }, machine: () => ok(V.clipboard.sound, "nothing copied") },
			{ say: "pick another track and press Cmd+V", act: async (u, c) => { u.click(rail(c.b)); await sleep(200); document.activeElement?.blur?.(); u.key("v", { cmd: true }); },
				machine: c => ok(kit().tracks[c.b].machine === kit().tracks[c.a].machine && same(kitVals(c.b), kitVals(c.a)), `track ${c.b + 1} ${kit().tracks[c.b].machine}`), screen: c => ok(V.tracks[c.b].m === kit().tracks[c.a].machine, "view " + V.tracks[c.b].m), within: 8000 },
			{ ...undoKey, machine: c => ok(JSON.stringify(kit().tracks[c.b]) === c.kb, "track not restored"), within: 8000 }
		]
	};
	const editorDrag = {
		name: "md-sound-screen-drag", proves: ["MD-054"],
		steps: [
			go("sound"), sel(() => soundTrack()),
			{ say: "drag a handle of the filter screen", act: async (u, c) => { const cv = $1('#main canvas.ed[data-ed="flt"]') || $1("#main canvas.ed"); if (!cv) throw new Error("no screen"); c.ed = cv.dataset.ed; c.k0 = kitVals(c.t); const r = cv.getBoundingClientRect(), h = ED[c.ed].handles(r.width, r.height, cv)[0]; c.note = `${c.ed} ${h.k}`; await u.drag(cv, [[10, 0], [20, -6], [30, -10]], {}, { fx: h.x / r.width, fy: h.y / r.height }); },
				machine: c => ok(!same(kitVals(c.t), c.k0), "kit unchanged") },
			{ ...undoKey, machine: c => ok(same(kitVals(c.t), c.k0), "kit not restored"), within: 8000 }
		]
	};
	const controlAll = {
		name: "md-sound-control-all", proves: ["MD-100"],
		steps: [
			go("sound"), sel(() => soundTrack()),
			/* B-023: a real press focuses the value (a synthetic one does not): it is focused here, so ⌘Z below is pressed
			   with the value focused, as a person's is */
			{ say: "Alt-drag an effects value: every track's knob moves", act: async (u, c) => { c.k0 = allKitVals(); const el = $1('#main .pc[data-g="fx"]'), d = getV(el) > 64 ? -1 : 1; el.focus(); await u.drag(el, [[d * 4, 0], [d * 8, 0], [d * 16, 0], [d * 24, 0]], { alt: true }); },
				machine: c => { const moved = allKitVals().filter((v, t) => !same(v, c.k0[t])).length; return ok(moved >= 2, moved + " tracks moved"); }, within: 10000 },
			{ ...undoKey, say: "press Cmd+Z: one step back for all", machine: c => ok(same(allKitVals(), c.k0), "not all back: " + kitDiff(c.k0, allKitVals())), within: 10000 }
		]
	};
	/* 0.3.5: the top bar's GLOBAL key (where FN was) opens the machine's global settings; lit while open, Esc closes */
	const globalKey = {
		name: "md-global-key", proves: [],
		steps: [
			{ say: "click GLOBAL in the top bar: the panel opens, the key is lit", act: u => u.click("#globkey"), screen: () => ok(!$1("#globpop").hidden && pressed("#globkey"), "panel " + ($1("#globpop").hidden ? "closed" : "open") + ", key " + $1("#globkey")?.getAttribute("aria-pressed")) },
			{ say: "press Escape: it closes, the key goes dark", act: u => u.key("Escape"), screen: () => ok($1("#globpop").hidden && !pressed("#globkey"), "still open") }
		]
	};

	/* Review 1 (B-091, B-094): GLOBAL is a modal; a press outside it keeps it open and reaches nothing below (a step of the
	   grid: no trig); Esc closes it */
	const globalClickOut = {
		name: "md-global-click-out", proves: [],
		steps: [
			go("seq"), sel(() => soundTrack()),
			{ say: "open GLOBAL, then press beside it (its press, release and click)", act: async (u, c) => {
				c.p0 = trigsOf(c.t).join(","); c.u0 = V.undoCount;
				u.click("#globkey"); await sleep(300); c.under = Journey.pressOutside(); await sleep(300);
			}, screen: c => ok(!$1("#globpop").hidden && Modal.top() === "globpop", "GLOBAL " + ($1("#globpop").hidden ? "closed" : "open") + ", pressed on " + c.under),
				machine: c => ok(trigsOf(c.t).join(",") === c.p0 && V.undoCount === c.u0, `pattern ${trigsOf(c.t).join(",")} (was ${c.p0}), undo steps ${c.u0} -> ${V.undoCount}`) },
			{ say: "press Escape: GLOBAL closes", act: u => u.key("Escape"), screen: () => ok($1("#globpop").hidden && !pressed("#globkey"), "still open") }
		],
		async tidy(u) { if (!$1("#globpop").hidden) u.key("Escape"); }
	};

	/* ---------- Mix ---------- */
	const mixSolo = {
		name: "md-mix-mute-solo", proves: ["MD-122", "MD-X06"],
		steps: [
			{ say: "click the Mix tab", act: u => u.click(tab("mix")), screen: () => onTab("mix") === true ? ok($all(".strip").length === 16, $all(".strip").length + " strips") : onTab("mix"), machine: () => ok(Array.isArray(desk().mutes), "no mutes read from the machine") },
			{ say: "drag across four tracks' M keys", act: async (u, c) => {
				c.m0 = mutes(); const keep = soloKeep();
				c.a = [...Array(13).keys()].find(a => [0, 1, 2, 3].every(k => !c.m0.includes(a + k) && !keep.has(a + k)));
				c.b = [...Array(16).keys()].find(b => (b < c.a || b > c.a + 3) && !c.m0.includes(b) && !keep.has(b));
				if (c.a == null || c.b == null) throw new Error("no four unmuted tracks in a row");
				c.run = [0, 1, 2, 3].map(k => c.a + k);
				await u.drag(`.strip[data-sel="${c.a}"] .ms.m`, c.run.slice(1).map(i => `.strip[data-sel="${i}"] .ms.m`), {}, { captured: false });
				c.note = `tracks ${c.a + 1}-${c.a + 4}`;
			}, screen: c => ok(c.run.every(i => pressed(`.strip[data-sel="${i}"] .ms.m`)), "M keys not lit"), machine: c => ok(c.run.every(i => mutes().includes(i)), "machine mutes " + mutes()) },
			{ say: "click S on another track (solo)", act: (u, c) => u.click(`.strip[data-sel="${c.b}"] .ms.s`), screen: c => ok(pressed(`.strip[data-sel="${c.b}"] .ms.s`), "S not lit"),
				machine: c => { const keep = soloKeep(), want = [...Array(16).keys()].filter(i => i !== c.b && !keep.has(i)); return ok(want.every(i => mutes().includes(i)) && !mutes().includes(c.b), "machine mutes " + mutes()); } },
			{ say: "click S again (un-solo): the four mutes are kept", act: (u, c) => u.click(`.strip[data-sel="${c.b}"] .ms.s`),
				screen: c => { const l = $all(".strip .ms.m").filter(b => b.getAttribute("aria-pressed") === "true").map(b => +b.dataset.mute); return ok(same(l, sorted([...new Set([...c.m0, ...c.run])])), "M keys lit " + l.join(",")); },
				machine: c => ok(same(mutes(), sorted([...new Set([...c.m0, ...c.run])])), "machine mutes " + mutes()), within: 8000 }
		],
		async tidy(u, c) { if (c.b != null && S.soloSet.has(c.b)) u.click(`.strip[data-sel="${c.b}"] .ms.s`); for (const i of c.run || []) if (mutes().includes(i) && !c.m0.includes(i)) { u.click(`.strip[data-sel="${i}"] .ms.m`); await sleep(150); } }
	};
	/* B-123, MD-X06: the solo is kept with the project: after the machine restarts (the page drops its solo) and the plug-in
	   says it again (the page made again: ready), the solo is back, the other tracks are muted, and the mute the person
	   had before it comes back when the solo ends */
	const soloSaved = {
		name: "md-mix-solo-saved", proves: ["MD-X06"],
		steps: [
			go("mix"),
			{ say: "mute a track with its M key, solo another with its S key", act: async (u, c) => {
				c.m0 = mutes(); const keep = soloKeep(); const free = [...Array(16).keys()].filter(i => !c.m0.includes(i) && !keep.has(i));
				if (free.length < 2) throw new Error("no two unmuted tracks"); c.m = free[0]; c.b = free[1];
				u.click(`.strip[data-sel="${c.m}"] .ms.m`); await settledMutes(); u.click(`.strip[data-sel="${c.b}"] .ms.s`); await settledMutes(); },
				screen: c => ok(pressed(`.strip[data-sel="${c.b}"] .ms.s`) && pressed(`.strip[data-sel="${c.m}"] .ms.m`), "keys not lit"),
				machine: c => { const keep = soloKeep(), want = [...Array(16).keys()].filter(i => i !== c.b && !keep.has(i)); return ok(want.every(i => mutes().includes(i)) && !mutes().includes(c.b), "machine mutes " + mutes()); }, within: 8000 },
			{ say: "the machine starts over (the page drops its solo) and the page is made again: the solo comes back", act: async (u, c) => {
				window.gm.recv([{ type: "reset" }]); await until(() => !S.soloSet.size, 2000); c.dropped = !S.soloSet.size; Bridge.ready(); await until(() => S.soloSet.has(c.b), 6000); await settledMutes(); },
				screen: c => ok(c.dropped && S.soloSet.has(c.b) && S.soloSet.size === 1 && pressed(`.strip[data-sel="${c.b}"] .ms.s`) && pressed(`.strip[data-sel="${c.m}"] .ms.m`), `solo ${[...S.soloSet]}, dropped ${c.dropped}`),
				machine: c => { const keep = soloKeep(), want = [...Array(16).keys()].filter(i => i !== c.b && !keep.has(i)); return ok(want.every(i => mutes().includes(i)) && !mutes().includes(c.b), "machine mutes " + mutes()); }, within: 10000 },
			{ say: "click S again: the solo ends and the mute you had stays", act: async (u, c) => { u.click(`.strip[data-sel="${c.b}"] .ms.s`); await settledMutes(); },
				screen: c => ok(!S.soloSet.size && pressed(`.strip[data-sel="${c.m}"] .ms.m`) && !pressed(`.strip[data-sel="${c.b}"] .ms.m`), `solo ${[...S.soloSet]}`),
				machine: c => ok(same(mutes(), sorted([...new Set([...c.m0, c.m])])), "machine mutes " + mutes()), within: 8000 }
		],
		async tidy(u, c) { if (c.b != null && S.soloSet.has(c.b)) u.click(`.strip[data-sel="${c.b}"] .ms.s`); await sleep(200); if (c.m != null && mutes().includes(c.m) && !c.m0.includes(c.m)) { u.click(`.strip[data-sel="${c.m}"] .ms.m`); await sleep(200); } }
	};
	const shiftMutes = {
		name: "md-mix-shift-mutes", proves: ["MD-123"],
		steps: [
			go("mix"),
			{ say: "hold Shift and click two M keys: prepared, nothing sent", act: (u, c) => { c.m0 = mutes(); c.ts = [...Array(16).keys()].filter(i => !c.m0.includes(i)).slice(0, 2); for (const i of c.ts) u.click(`.strip[data-sel="${i}"] .ms.m`, { shift: true }); },
				screen: c => ok(c.ts.every(i => $1(`.strip[data-sel="${i}"] .ms.m`).classList.contains("prep")), "not prepared"), machine: c => ok(same(mutes(), c.m0), "sent while held: " + mutes()), within: 1000 },
			{ say: "let Shift go: both mute together", act: () => document.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", code: "ShiftLeft", bubbles: true })), machine: c => ok(c.ts.every(i => mutes().includes(i)), "machine mutes " + mutes()), screen: c => ok(c.ts.every(i => pressed(`.strip[data-sel="${i}"] .ms.m`)), "M not lit") },
			{ say: "click both M keys again", act: async (u, c) => { for (const i of c.ts) { u.click(`.strip[data-sel="${i}"] .ms.m`); await sleep(150); } }, machine: c => ok(same(mutes(), c.m0), "machine mutes " + mutes()) }
		]
	};
	const allOff = {
		name: "md-mix-ms-off", proves: ["MD-122"],
		steps: [
			go("seq"),
			{ say: "mute two tracks on the rail", act: async (u, c) => { c.ts = [0, 1]; for (const i of c.ts) { if (!mutes().includes(i)) u.click(`#rail .th[data-sel="${i}"] .ms.m`); await until(() => mutes().includes(i), 3000); } }, machine: c => ok(c.ts.every(i => mutes().includes(i)), "machine mutes " + mutes()) },
			/* M/S off unmutes the mutes the page knows when it is clicked: a mute still on its way back from the machine (an
			   earlier journey's) would stay, so it is clicked once the read-back has settled (the desk idle, the mutes the same
			   for 400 ms), not after a fixed wait */
			{ say: "click M/S off", act: async u => { await settledMutes(); u.click("#allon"); }, machine: () => ok(!mutes().length, "machine mutes " + mutes()), screen: () => ok($1("#allon").disabled, "M/S off still on"), within: 8000 }
		]
	};
	const fader = {
		name: "md-mix-fader-undo", proves: ["MD-065"],
		steps: [
			go("mix"),
			{ say: "drag a track's volume fader", act: async (u, c) => { c.t = soundTrack(); c.i = pidx(c.t, "VOL", "rt"); c.v0 = kitVals(c.t)[c.i]; const d = c.v0 > 64 ? 1 : -1; await u.drag(`.strip[data-sel="${c.t}"] .fader[data-g]`, [[0, d * 8], [0, d * 16], [0, d * 24]]); await sleep(200); Journey.snapshot("md-mix-strip"); },
				screen: c => ok($1(`.strip[data-sel="${c.t}"] .v`)?.textContent === String(V.tracks[c.t].rt.VOL) && V.tracks[c.t].rt.VOL !== c.v0, "shows " + $1(`.strip[data-sel="${c.t}"] .v`)?.textContent), machine: c => ok(kitVals(c.t)[c.i] !== c.v0, "kit VOL " + kitVals(c.t)[c.i]) },
			{ ...undoKey, machine: c => ok(kitVals(c.t)[c.i] === c.v0, "kit VOL " + kitVals(c.t)[c.i]), screen: c => ok($1(`.strip[data-sel="${c.t}"] .v`)?.textContent === String(c.v0), "shows " + $1(`.strip[data-sel="${c.t}"] .v`)?.textContent) }
		]
	};
	const outKey = {
		name: "md-mix-out-route", proves: ["MD-174", "MD-286"],
		steps: [
			go("mix"),
			{ say: "click a track's OUT key: an individual output", act: (u, c) => { c.t = soundTrack(); c.o0 = Docs.global.routing[c.t]; u.click(`.strip[data-sel="${c.t}"] [data-out]`); },
				screen: c => ok($1(`.strip[data-sel="${c.t}"] [data-out]`).textContent !== "OUT " + c.o0, "key " + $1(`.strip[data-sel="${c.t}"] [data-out]`).textContent), machine: c => ok(Docs.global.routing[c.t] !== c.o0, "global routing " + Docs.global.routing[c.t]) },
			{ say: "click it until it is back", act: async (u, c) => { for (let k = 0; k < 8 && Docs.global.routing[c.t] !== c.o0; k++) { u.click(`.strip[data-sel="${c.t}"] [data-out]`); await sleep(800); } }, machine: c => ok(Docs.global.routing[c.t] === c.o0, "global routing " + Docs.global.routing[c.t]) }
		]
	};
	/* wave 8: LEV, the kit's level of a track (the machine's LEVEL knob), above each strip's VOL */
	const levOf = t => kit()?.tracks[t]?.level;
	const levBoxQ = t => `.strip[data-sel="${t}"] .pc[data-g="lev"]`;
	const lev = {
		name: "md-mix-lev", proves: ["MD-008", "MD-032", "MD-278"],
		steps: [
			go("mix"),
			{ say: "drag a track's LEV box", act: async (u, c) => { c.t = soundTrack(); c.l0 = levOf(c.t); await nudge(u, levBoxQ(c.t), c.l0); },
				screen: c => ok(+$1(`${levBoxQ(c.t)} b`)?.textContent === V.tracks[c.t].level && V.tracks[c.t].level !== c.l0 && $1(levBoxQ(c.t)).style.getPropertyValue("--f") === V.tracks[c.t].level / 127 * 100 + "%", `shows ${$1(`${levBoxQ(c.t)} b`)?.textContent}, bar ${$1(levBoxQ(c.t))?.style.getPropertyValue("--f")}, view ${V.tracks[c.t].level}, was ${c.l0}`),
				machine: c => ok(levOf(c.t) !== c.l0 && levOf(c.t) === V.tracks[c.t].level, "kit level " + levOf(c.t)), within: 6000 },
			{ say: "double-click it: 100", act: u => u.dblclick(levBoxQ(soundTrack())),
				screen: c => ok($1(`${levBoxQ(c.t)} b`)?.textContent === "100", "shows " + $1(`${levBoxQ(c.t)} b`)?.textContent), machine: c => ok(levOf(c.t) === 100, "kit level " + levOf(c.t)), within: 6000 },
			{ say: "click Undo until it is back", act: async (u, c) => { for (let k = 0; k < 3 && levOf(c.t) !== c.l0; k++) { u.click("#undo"); await sleep(700); } },
				machine: c => ok(levOf(c.t) === c.l0, "kit level " + levOf(c.t)), screen: c => ok($1(`${levBoxQ(c.t)} b`)?.textContent === String(c.l0), "shows " + $1(`${levBoxQ(c.t)} b`)?.textContent), within: 6000 }
		]
	};
	const masterFx = {
		name: "md-mix-master-fx", proves: ["MD-070"],
		steps: [
			go("mix"),
			{ say: "drag a master effect's value", act: async (u, c) => { c.f0 = JSON.stringify(kit().masterFx); const el = $1('#main .pc[data-g="mfx"]'); await nudge(u, el, getV(el)); }, machine: c => ok(JSON.stringify(kit().masterFx) !== c.f0, "kit master effects unchanged") },
			{ ...undoKey, machine: c => ok(JSON.stringify(kit().masterFx) === c.f0, "not restored") }
		]
	};

	/* ---------- Song ---------- */
	const songRows = () => Docs.songs[currentSongSlot()]?.rows || [];
	const songArrange = {
		name: "md-song-arrange-rows", proves: ["MD-150", "MD-151"],
		steps: [
			go("song"),
			{ say: "click Arrange and a pattern pad: a row is added", act: async (u, c) => { c.r0 = JSON.stringify(songRows()); c.n0 = songRows().length; u.click('[data-set="songpick"] button[data-v="song"]'); await sleep(200); u.click('[data-addpat="0"]'); },
				machine: c => ok(songRows().length === c.n0 + 1, songRows().length + " rows"), screen: c => ok($all("#tl .scell:not(.empty)").length === c.n0 + 1, $all("#tl .scell:not(.empty)").length + " cells") },
			{ say: "click Delete on the selected row", act: u => u.click('[data-rowact="del"]'), machine: c => ok(songRows().length === c.n0, songRows().length + " rows") },
			{ say: "Cmd+Z twice, Cmd+Shift+Z, Cmd+Z: the song is as it was", act: async u => { for (const m of [{ cmd: true }, { cmd: true }, { cmd: true, shift: true }, { cmd: true }]) { u.key("z", m); await sleep(800); } }, machine: c => ok(JSON.stringify(songRows()) === c.r0, songRows().length + " rows"), within: 8000 }
		],
		async tidy(u, c) { await back(u, c); }
	};
	const songChain = {
		name: "md-song-chain", proves: ["MD-098"],
		steps: [
			go("song"),
			{ say: "click Chain and pads A02, A03: the machine plays the chain", act: async (u, c) => { c.m0 = V.songMode; u.click('[data-set="songpick"] button[data-v="chain"]'); await sleep(200); u.click('[data-bank="0"]'); await sleep(200); u.click('[data-chainpad="1"]'); await sleep(100); u.click('[data-chainpad="2"]'); },
				machine: () => ok(desk().chain?.active && same(desk().chain.patterns, [1, 2]), "chain " + JSON.stringify(desk().chain)), screen: () => ok(/CHAIN/.test($1("#songPlays")?.textContent || ""), "header " + $1("#songPlays")?.textContent), within: 6000 },
			{ say: "click Clear: the chain ends", act: u => u.click('[data-chain="clear"]'), machine: () => ok(!desk().chain?.active, "chain " + JSON.stringify(desk().chain)), within: 6000 }
		],
		async tidy(u, c) { await back(u, c); }
	};

	/* ---------- Sampler ---------- */
	const inked = cv => { if (!cv || !cv.width) return 0; const g = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 4; i < g.length; i += 4) if (g[i] !== g[0] || g[i + 1] !== g[1] || g[i + 2] !== g[2]) n++; return n; };
	const samplerSlots = {
		name: "md-sampler-slots", proves: ["MD-196", "MD-201"], needs: Journey.onScreen,
		steps: [
			{ say: "click the Sampler tab: RAM and ROM slots", act: u => u.click(tab("sampler")), screen: () => ok(S.ws === "sampler" && $all(".slotk.ram").length === 4 && $all(".slotk.rom").length >= 32, $all(".slotk").length + " slot keys"), machine: () => ok(!!Docs.samples, "no samples document") },
			{ say: "click a ROM slot that holds a sample: its waveform is drawn", act: async (u, c) => { const k = $all(".slotk.rom.has")[0] || $all(".slotk.rom")[0]; c.slot = k.dataset.slot; u.click(k);
				let f = 0; const t0 = performance.now(); await new Promise(r => { const tick = () => { f++; if (performance.now() - t0 < 1000) requestAnimationFrame(tick); else r(); }; requestAnimationFrame(tick); setTimeout(r, 1500); }); c.frames = f; c.vis = document.visibilityState; Journey.snapshot("md-sampler-workspace"); },
				screen: c => { const cvs = $all("#main canvas"), n = Math.max(0, ...cvs.map(inked)); return ok(S.smpSlot === c.slot && n > 100, `${n} pixels drawn on ${cvs.length} canvases (${cvs.map(x => x.className + " " + x.width + "x" + x.height).slice(0, 4).join(", ")}), slot ${S.smpSlot}; ${c.frames} animation frames in 1 s, page ${c.vis}`); }, machine: () => ok(!!Docs.samples, "no samples"), within: 8000 }
		]
	};
	const samplerSetup = {
		name: "md-sampler-setup-undo", proves: ["MD-273", "MD-275"],
		steps: [
			go("sampler"),
			{ say: "click an unused RAM slot", act: (u, c) => { c.n = [1, 2, 3, 4].find(k => !V.tracks.some(t => t.m === "RAM-R" + k || t.m === "RAM-P" + k)); if (!c.n) throw new Error("every RAM slot is used"); u.click(`.slotk[data-slot="RAM${c.n}"]`); }, screen: () => ok(!!$1("[data-setupgo]"), "no Set up sampling") },
			{ say: "click Set up sampling: a recorder of the main mix, out of it (VOL 0), and a player", act: (u, c) => { [c.r, c.p] = setupTracks(); c.m0 = [kit().tracks[c.r].machine, kit().tracks[c.p].machine]; c.vol0 = kitVals(c.r)[pidx(c.r, "VOL", "rt")]; u.click("[data-setupgo]"); },
				machine: c => ok(kit().tracks[c.r].machine === "RAM-R" + c.n && kit().tracks[c.p].machine === "RAM-P" + c.n && kitVals(c.r)[pidx(c.r, "MLEV", "syn")] === 64 && kitVals(c.r)[pidx(c.r, "VOL", "rt")] === 0,
					`tracks ${kit().tracks[c.r].machine} ${kit().tracks[c.p].machine}, recorder MLEV ${kitVals(c.r)[pidx(c.r, "MLEV", "syn")]} VOL ${kitVals(c.r)[pidx(c.r, "VOL", "rt")]}`),
				screen: () => ok(/VOL 0/.test($1(".recmix")?.textContent || ""), "no VOL 0 note on the Source card"), within: 8000 },
			{ say: "click Input A: the recorder's VOL comes back", act: u => u.click('[data-recsrc="a"]'), machine: c => ok(kitVals(c.r)[pidx(c.r, "VOL", "rt")] === c.vol0 && kitVals(c.r)[pidx(c.r, "MLEV", "syn")] === 0, "VOL " + kitVals(c.r)[pidx(c.r, "VOL", "rt")]), within: 8000 },
			{ say: "click Main mix: VOL 0 again", act: u => u.click('[data-recsrc="main"]'), machine: c => ok(kitVals(c.r)[pidx(c.r, "VOL", "rt")] === 0, "VOL " + kitVals(c.r)[pidx(c.r, "VOL", "rt")]), within: 8000 },
			{ ...undoKey, say: "press Cmd+Z three times: as before the set-up", act: async u => { for (let k = 0; k < 3; k++) { const u0 = V.undoCount; await until(idle, 4000); u.key("z", { cmd: true }); await until(() => V.undoCount < u0, 4000); } },
				machine: c => ok(same([kit().tracks[c.r].machine, kit().tracks[c.p].machine], c.m0) && kitVals(c.r)[pidx(c.r, "VOL", "rt")] === c.vol0, `tracks ${kit().tracks[c.r].machine} ${kit().tracks[c.p].machine}, VOL ${kitVals(c.r)[pidx(c.r, "VOL", "rt")]}`), within: 10000 }
		]
	};
	const audition = {
		/* a machine with no UW sample in its ROM slots (a fresh sandbox, B-012) has nothing to audition: skipped, not failed
		   (the 0.5.1 gate failed it in 3 of 4 runs for that) */
		name: "md-sampler-audition", proves: ["MD-195"], needs: async () => {
			const has = () => !!Docs.samples && (Docs.samples.rom || []).some(s => s && !s.empty);
			/* the bank comes a moment after the machine is ready (the device reads it when its memory changed) */
			await until(has, 8000);
			return has() ? null : Docs.samples ? "no UW sample in the ROM slots (a fresh sandbox, B-012)" : "the sample bank was not read in 8 s";
		},
		steps: [
			go("sampler"),
			{ say: "click a ROM slot's play key: it plays", act: async (u, c) => { /* a ROM slot that holds a sample (the bank's), played by a track of the kit or not (.has: played by one) */
				const s = (Docs.samples?.rom || []).find(x => x && !x.empty); const k = s && ($1(`.slotk.rom[data-slot="ROM${s.slot + 1}"]`) || $all(".slotk.rom.has")[0]);
				if (!k) throw new Error(`no ROM sample (bank: ${(Docs.samples?.rom || []).filter(x => x && !x.empty).map(x => x.slot).join(",") || "none"}; ROM keys ${$all(".slotk.rom").length})`); u.click(k); await sleep(400); results.length = 0; const b = $all("[data-aud]").find(x => !x.disabled); if (!b) throw new Error("no play key"); c.key = b.dataset.aud;
				/* the key shown playing at any moment of the audition (a short sample may end before one read after it) */
				const shown = () => $all("[data-aud]").some(x => x.dataset.aud === c.key && x.getAttribute("aria-pressed") === "true");
				c.shown = false; const watch = new MutationObserver(() => { if (shown()) c.shown = true; });
				watch.observe(document.body, { attributes: true, attributeFilter: ["aria-pressed"], childList: true, subtree: true });
				try { u.click(b); await until(() => results.some(r => r.heard === "audition" && r.state === "playing"), 4000); await sleep(30); if (shown()) c.shown = true; }
				finally { watch.disconnect(); } },
				machine: () => ok(results.some(r => r.heard === "audition" && r.state === "playing"), "no audition"), screen: c => ok(c.shown, "the play key was not shown playing") }
		],
		async tidy() { if (typeof Aud !== "undefined" && Aud) cmd("auditionStop", {}); }
	};

	/* ---------- the library ---------- */
	const ks = k => `#libpop .ks[data-ks="${k}"]`;
	const kitName = k => kitNameText(Docs.kits[k]?.name);
	const libDialog = {
		name: "md-lib-load-save-dialog", proves: ["MD-039", "MD-041", "MD-283"],
		steps: [
			{ say: "click KIT on the LCD: the kit library opens", act: u => u.click("#kitf"), screen: () => ok(!$1("#libpop").hidden && $all("#libpop .ks").length === 64, "library closed"), machine: () => ok(Object.keys(Docs.kits).length === 64, Object.keys(Docs.kits).length + " kits read") },
			{ say: "click another kit: it loads at once", act: async (u, c) => {
				const cur = V.kit; c.k = [...Array(64).keys()].find(k => k !== cur && !kitEmpty(k) && kitName(k) && kitName(k) !== kitName(cur));
				if (c.k == null) throw new Error("no other kit with a name");
				c.edited = V.kitState === "edited"; u.click(ks(c.k));
				if (c.edited && await until(dlgShown, 2000)) { u.click(dlgButton("Load without saving")); c.note = "the kit had edits: asked first, loaded without saving"; } else c.note = `K${c.k + 1} ${kitName(c.k)}`;
			}, screen: c => ok($1(ks(c.k))?.classList.contains("cur") && $1("#dlg").hidden && $1("#kitname").textContent.includes(kitName(c.k).trim()), `LCD kit "${$1("#kitname").textContent}"`), machine: c => ok(currentKitSlot() === c.k, "machine kit " + currentKitSlot()), within: 4000 },
			{ say: "Alt-click a third kit: selected, not loaded", act: async (u, c) => { c.j = [...Array(64).keys()].reverse().find(k => k !== c.k && !kitEmpty(k) && kitLoaded(k)); c.j0 = JSON.stringify(Docs.kits[c.j]); await keep(c, "kit", c.j); u.click(ks(c.j), { alt: true }); }, screen: c => ok($1(ks(c.j))?.getAttribute("aria-selected") === "true", "not selected"), machine: c => ok(currentKitSlot() === c.k, "machine kit " + currentKitSlot()) },
			{ say: "click Save as: the plug-in asks before overwriting", act: (u, c) => { c.u0 = V.undoCount; u.click('#libpop [data-la="saveas"]'); }, screen: () => ok(dlgShown() && !!dlgButton("Overwrite"), "no question"), machine: c => ok(JSON.stringify(Docs.kits[c.j]) === c.j0, "slot changed before the answer") },
			{ say: "with the question open, press Delete, Backspace, 3 and 1", act: async (u, c) => { c.ws = S.ws; for (const k of ["Delete", "Backspace", "3", "1"]) { u.key(k); await sleep(150); } },
				screen: c => ok(dlgShown() && S.ws === c.ws && LIB.open === "kit", `dialog ${dlgShown()}, workspace ${S.ws}, library ${LIB.open}`), machine: c => ok(JSON.stringify(Docs.kits[c.j]) === c.j0 && V.undoCount === c.u0, "the page behind acted"), within: 1500 },
			{ say: "click Overwrite: saved into that slot", act: u => u.click(dlgButton("Overwrite")), screen: c => ok(!dlgShown() && $1(ks(c.j))?.classList.contains("cur"), "slot not current"),
				machine: c => ok(currentKitSlot() === c.j && same(Docs.kits[c.j]?.tracks.map(t => t.machine), Docs.kits[c.k]?.tracks.map(t => t.machine)), `machine kit ${currentKitSlot()}`), within: 8000 },
			esc
		],
		async tidy(u, c) { await back(u, c); }
	};
	const libSelect = k => ({ say: "Alt-click a slot: selected, not loaded", act: (u, c) => { c.sel = k(c); if (c.sel == null) throw new Error("no slot to pick"); u.click(ks(c.sel), { alt: true }); }, screen: c => ok($1(ks(c.sel))?.getAttribute("aria-selected") === "true", "not selected") });
	const openKits = { say: "click KIT on the LCD", act: u => u.click("#kitf"), screen: () => ok(!$1("#libpop").hidden && LIB.open === "kit", "closed") };
	const otherKit = (c, not = []) => [...Array(64).keys()].reverse().find(k => k !== V.kit && !not.includes(k) && !kitEmpty(k) && kitLoaded(k) && kitName(k));
	const kitCopy = {
		name: "md-lib-kit-copy-paste-undo", proves: ["MD-044", "MD-046", "MD-279", "MD-X22"],
		steps: [
			openKits,
			libSelect(c => (c.src = [...Array(64).keys()].find(k => k !== V.kit && !kitEmpty(k) && kitName(k)))),
			{ say: "click Copy", act: u => u.click('#libpop [data-la="copy"]'), machine: c => ok(V.clipboard.kit === c.src, "clipboard " + V.clipboard.kit) },
			libSelect(c => { c.dst = [...Array(64).keys()].reverse().find(k => k !== V.kit && k !== c.src && kitLoaded(k) && kitName(k) !== kitName(c.src)); c.d0 = JSON.stringify(Docs.kits[c.dst]); return c.dst; }),
			/* the paste and its undo each wait for the desk to be idle first (the library reads its slots in the background) */
			/* a slot that holds a kit is asked about first (the plug-in's overwriteSlot): Overwrite. Unanswered, the question
			   left the slot as it was (the 0.5.1 gate's "flake" when the slot chosen held a kit) */
			{ say: "click Paste (Overwrite when asked)", act: async u => { await until(idle, 8000); u.click('#libpop [data-la="paste"]');
				if (await until(() => dlgShown() && !!dlgButton("Overwrite"), 1500)) u.click(dlgButton("Overwrite")); }, machine: c => ok(kitName(c.dst) === kitName(c.src) && same(Docs.kits[c.dst].tracks.map(t => t.machine), Docs.kits[c.src].tracks.map(t => t.machine)), "slot " + kitName(c.dst)), screen: c => ok($1(ks(c.dst))?.textContent.includes(kitName(c.src).trim()), "tile " + $1(ks(c.dst))?.textContent), within: 12000 },
			{ say: "press Cmd+Z (the library open): the slot is back", act: async u => { await until(idle, 8000); u.key("z", { cmd: true }); }, machine: c => ok(JSON.stringify(Docs.kits[c.dst]) === c.d0, "slot " + kitName(c.dst)), within: 12000 },
			esc
		]
	};
	const kitRename = {
		name: "md-lib-kit-rename-undo", proves: ["MD-042", "MD-X22"],
		steps: [
			openKits,
			libSelect(c => { const k = otherKit(c); c.n0 = kitName(k); return k; }),
			{ say: "click Rename, type JOURNEY, press Enter and answer the question", act: async (u, c) => { u.click('#libpop [data-la="rename"]'); await sleep(200); u.type("#lsin", "JOURNEY"); await sleep(100); c.typed = `field "${$1("#lsin")?.value}", focus ${document.activeElement?.id || document.activeElement?.tagName}, renaming ${LIB.renaming}`; results.length = 0; traceDocs("kit", c.sel); u.key("Enter"); await sleep(50); c.typed += `; after Enter renaming ${LIB.renaming}`; if (await until(dlgShown, 2000)) { c.asked = $1("#dlg p")?.textContent; u.click($1("#dlg .danger")); c.note = "asked: " + c.asked; } },
				machine: c => ok(kitName(c.sel).trim() === "JOURNEY", "name " + kitName(c.sel) + "; before Enter: " + c.typed + "; results " + results.map(r => r.op + ":" + r.ok + " " + (r.errors || []).join(";") + (r.note || "")).join(", ") + "; tx " + desk().tx + "; documents: " + traced()), screen: c => ok($1(ks(c.sel))?.textContent.includes("JOURNEY"), "tile " + $1(ks(c.sel))?.textContent), within: 8000 },
			{ ...undoKey, machine: c => ok(kitName(c.sel) === c.n0, "name " + kitName(c.sel)), within: 8000 },
			esc
		]
	};
	const kitClear = {
		name: "md-lib-kit-clear-undo", proves: ["MD-045", "MD-046", "MD-X22"],
		steps: [
			openKits,
			libSelect(c => { const k = otherKit(c); c.d0 = JSON.stringify(Docs.kits[k]); return k; }),
			/* MD-045: what the machine's own CLEAR KIT leaves (measured: every track GND-EMPTY, level 100, VOL 127, the LFO's SHP2 4) */
			{ say: "press Delete: the slot is cleared as the machine clears it", act: async u => { u.key("Delete"); if (await until(dlgShown, 1200)) u.click($1("#dlg .danger")); },
				machine: c => { const d = Docs.kits[c.sel], tr = d?.tracks || [], fx = d?.masterFx || {};
					/* the master effects at the machine's start values and the name's first byte 0x7f (gapProbesFirmwareTest w12clearkit) */
					const fxOk = same(fx.gateBox, [0, 0, 64, 0, 0, 127, 127, 96]) && same(fx.rhythmEcho, [32, 0, 32, 0, 0, 127, 0, 96]) && same(fx.eq, [64, 64, 64, 64, 64, 64, 64, 127]) && same(fx.dynamix, [127, 127, 127, 127, 127, 127, 0, 0]);
					return ok(kitEmpty(c.sel) && tr.length === 16 && tr.every(t => t.level === 100 && same(t.synth, [64, 64, 0, 0, 0, 0, 0, 0]) && same(t.effects, [0, 0, 64, 64, 0, 127, 0, 0]) && same(t.routing, [0, 127, 64, 0, 0, 64, 0, 0]) && t.lfo?.shape2 === 4)
						&& fxOk && d.name?.charCodeAt(0) === 0x7f,
					"slot " + kitName(c.sel) + " name byte " + d?.name?.charCodeAt(0) + " fx " + JSON.stringify(fx) + " T1 " + JSON.stringify(tr[0])); },
				screen: c => ok($1(ks(c.sel))?.textContent.includes("EMPTY"), "tile " + $1(ks(c.sel))?.textContent), within: 8000 },
			{ ...undoKey, machine: c => ok(JSON.stringify(Docs.kits[c.sel]) === c.d0, "slot not restored"), within: 8000 },
			esc
		]
	};
	const psq = p => `#libpop .ps[data-ps="${p}"]`;
	const patGo = {
		name: "md-lib-pattern-go", proves: ["MD-094", "MD-283", "MD-X21"],
		steps: [
			{ say: "click the pattern on the LCD: 128 patterns", act: (u, c) => { c.p0 = currentPatternSlot(); u.click("#pat"); }, screen: () => ok(!$1("#libpop").hidden && $all("#libpop .ps").length === 128, $all("#libpop .ps").length + " slots"), machine: () => ok(Object.keys(Docs.patterns).length === 128, Object.keys(Docs.patterns).length + " read") },
			{ say: "click another pattern (stopped: it switches)", act: async (u, c) => { c.p = (c.p0 + 2) % 128; u.click(psq(c.p)); await confirmIfAsked(u); }, machine: c => ok(currentPatternSlot() === c.p, "machine pattern " + currentPatternSlot()), screen: c => ok($1(psq(c.p))?.classList.contains("cur"), "not current"), within: 5000 },
			{ say: "click the first one again", act: async (u, c) => { u.click(psq(c.p0)); await confirmIfAsked(u); }, machine: c => ok(currentPatternSlot() === c.p0, "machine pattern " + currentPatternSlot()), within: 5000 },
			esc
		]
	};
	const patClear = {
		name: "md-lib-pattern-clear-undo", proves: ["MD-121"],
		steps: [
			{ say: "open the pattern chooser and move to a pattern with trigs (arrows)", act: async (u, c) => { u.click("#pat"); await sleep(300); c.p = [...Array(128).keys()].find(p => p !== currentPatternSlot() && hasPat(p)); if (c.p == null) throw new Error("no other pattern with trigs"); c.d0 = JSON.stringify(Docs.patterns[c.p]); for (let n = 0; n < 128 && LIB.sel !== c.p; n++) { u.key("ArrowRight"); await sleep(20); } },
				screen: c => ok($1(psq(c.p))?.getAttribute("aria-selected") === "true", "not selected") },
			{ say: "click Clear and answer the question", act: async (u, c) => { results.length = 0; c.selNow = LIB.sel; traceDocs("pattern", c.p); u.click('#libpop [data-la="clear"]'); if (await until(dlgShown, 2000)) { c.note = "asked: " + $1("#dlg p")?.textContent; u.click($1("#dlg .danger")); } }, machine: c => ok(!hasPat(c.p), `still has trigs; selected ${c.selNow} (want ${c.p}); results ${results.map(r => r.op + ":" + r.ok + " " + (r.errors || []).join(";") + (r.note || "")).join(", ")}; tx ${desk().tx}; documents: ${traced()}`), screen: c => ok($1(psq(c.p))?.classList.contains("empty"), "tile not empty"), within: 8000 },
			{ ...undoKey, machine: c => ok(JSON.stringify(Docs.patterns[c.p]) === c.d0, "not restored"), within: 8000 },
			esc
		]
	};

	/* ---------- dialogs ---------- */
	const dialogEsc = {
		name: "md-dialog-esc-space-cancel", proves: ["MD-055"],
		steps: [
			go("sound"), sel(() => soundTrack()),
			{ say: "drag a value: the kit has unsaved edits", act: async u => { const el = $1('#main .pc[data-g="syn"]'); await nudge(u, el, getV(el)); }, machine: () => ok(machineState().kit.working === "edited", machineState().kit.working) },
			{ say: "open the kit library and click another kit: the plug-in asks", act: async (u, c) => { c.k0 = currentKitSlot(); u.click("#kitf"); await sleep(300); c.k = [...Array(64).keys()].find(k => k !== c.k0 && !kitEmpty(k)); u.click(ks(c.k)); },
				screen: () => ok(dlgShown() && document.activeElement?.textContent.trim() === "Cancel", `dialog ${dlgShown()}, focus ${document.activeElement?.textContent}`), machine: c => ok(currentKitSlot() === c.k0, "loaded without asking") },
			{ say: "press Escape: Cancel, nothing loads", act: u => u.key("Escape"), screen: () => ok(!dlgShown(), "still open"), machine: c => ok(currentKitSlot() === c.k0 && machineState().kit.working === "edited", "machine kit " + currentKitSlot()), within: 2000 },
			{ say: "click the kit again and press Space: the focused Cancel", act: async (u, c) => { u.click(ks(c.k)); await until(dlgShown, 2000); u.key(" "); }, screen: () => ok(!dlgShown(), "still open"), machine: c => ok(currentKitSlot() === c.k0, "machine kit " + currentKitSlot()), within: 2000 }
		],
		async tidy(u) { if (LIB.open) u.key("Escape"); await sleep(200); u.key("z", { cmd: true }); await sleep(500); }
	};

	/* ---------- GLOBAL, AUDIO / MIDI, the engine menu ---------- */
	const tog = (f, v) => `#globpop [data-ga="${f}"][data-v="${v ? 1 : 0}"]`;
	const globalJ = {
		name: "md-global-tempo-out", proves: ["MD-187"],
		steps: [
			{ say: "choose GLOBAL… in the engine menu", act: u => u.pick("engsel", "global"), screen: () => ok(!$1("#globpop").hidden, "panel closed"), machine: () => ok(!!Docs.global?.control, "no global") },
			{ say: "click TEMPO OUT", act: (u, c) => { c.v0 = Docs.global.control.tempoOut; u.click(tog("tempoOut", !c.v0)); }, machine: c => ok(Docs.global.control.tempoOut === !c.v0, "tempoOut " + Docs.global.control.tempoOut), screen: c => ok(pressed(tog("tempoOut", !c.v0)), "key not lit"), within: 6000 },
			{ say: "click it back", act: (u, c) => u.click(tog("tempoOut", c.v0)), machine: c => ok(Docs.global.control.tempoOut === c.v0, "tempoOut " + Docs.global.control.tempoOut), within: 6000 },
			esc
		]
	};
	/* B-051, F3: GLOBAL › Clear (the shared page): asked first, then the factory global read back */
	const globalReset = {
		name: "md-global-reset", proves: ["MD-164", "MD-187"],
		steps: [
			{ say: "open GLOBAL, click TEMPO OUT ON and base channel +", act: async u => { await u.pick("engsel", "global"); await sleep(300); u.click(tog("tempoOut", true)); await sleep(300); u.click('#globpop [data-ga="base"][data-d="1"]'); },
				machine: () => ok(Docs.global?.control?.tempoOut === true && Docs.global.baseChannel !== 0, "tempoOut " + Docs.global?.control?.tempoOut + ", base " + Docs.global?.baseChannel), within: 10000 },
			{ say: "click Clear: it asks", act: u => u.click('#globpop [data-ga="reset"]'), screen: () => ok(dlgShown() && /Clear GLOBAL \d\? .* factory settings/.test($1("#dlg").textContent), "no question") },
			{ say: "click Clear in the question: the factory global, read back, on the page", act: u => u.click(dlgButton("Clear")),
				machine: () => ok(Docs.global?.control?.tempoOut === false && Docs.global.baseChannel === 0, "tempoOut " + Docs.global?.control?.tempoOut + ", base " + Docs.global?.baseChannel),
				screen: () => ok(pressed(tog("tempoOut", false)), "TEMPO OUT not OFF"), within: 10000 },
			esc
		],
		async tidy(u) { if (dlgShown()) u.click(dlgButton("Cancel")); if (!$1("#globpop").hidden) u.key("Escape"); }
	};
	const globalRouting = {
		name: "md-global-routing", proves: ["MD-174"],
		steps: [
			{ say: "open GLOBAL: ROUTING fits the dialog", act: u => u.pick("engsel", "global"), screen: () => { const p = $1("#globpop").getBoundingClientRect(), keys = $all('#globpop [data-ga="route"]'); return ok(keys.length === 16 && keys.every(k => { const r = k.getBoundingClientRect(); return r.left >= p.left - 1 && r.right <= p.right + 1 && r.bottom <= p.bottom + 1; }), keys.length + " route keys"); } },
			{ say: "click track 1's output", act: (u, c) => { c.o0 = Docs.global.routing[0]; u.click('#globpop [data-ga="route"][data-t="0"]'); }, machine: c => ok(Docs.global.routing[0] !== c.o0, "routing " + Docs.global.routing[0]), within: 6000 },
			{ say: "click it until it is back", act: async (u, c) => { for (let k = 0; k < 8 && Docs.global.routing[0] !== c.o0; k++) { u.click('#globpop [data-ga="route"][data-t="0"]'); await sleep(800); } }, machine: c => ok(Docs.global.routing[0] === c.o0, "routing " + Docs.global.routing[0]) },
			esc
		]
	};
	/* 0.3.5: the MAP EDITOR's whole range (16-143 patterns A01-H16, 144 START, 145 STOP: measured on the firmware), the
	   values a backup brings (B-019) shown and kept, not snapped back to 0-31. */
	const kmSel = '.kselbtn[data-for="gmapsel"]';
	const globalMapNote = {
		name: "md-global-map-note", proves: ["MD-166", "MD-167"],
		steps: [
			{ say: "open GLOBAL", act: u => u.pick("engsel", "global"), screen: () => ok(!!$1(kmSel), "no Map a note key"), machine: () => ok(!!Docs.global?.keymap, "no global") },
			{ say: "click › beside Map a note", act: (u, c) => { c.n = GP.note + 1; c.v0 = Docs.global.keymap[c.n]; u.click('#globpop [data-ga="mapnote"][data-d="1"]'); }, screen: c => ok(GP.note === c.n && $1(kmSel)?.textContent === KTGT(c.v0), "note " + GP.note + ", " + $1(kmSel)?.textContent) },
			{ say: "choose a pattern of bank C or later for it", act: async (u, c) => { c.p = [...Array(112).keys()].map(k => 143 - k).find(v => !Docs.global.keymap.includes(v)); await u.pick("gmapsel", String(c.p)); },
				machine: c => ok(Docs.global.keymap[c.n] === c.p, "keymap " + Docs.global.keymap[c.n]), screen: c => ok($1(kmSel)?.textContent === KTGT(c.p) && c.p > 47, $1(kmSel)?.textContent), within: 6000 },
			{ say: "choose STOP", act: async (u, c) => { c.stopAt = Docs.global.keymap.indexOf(145); await u.pick("gmapsel", "145"); },
				machine: c => ok(Docs.global.keymap[c.n] === 145, "keymap " + Docs.global.keymap[c.n]), screen: c => ok($1(kmSel)?.textContent === "STOP" && $all("#globpop .note").some(n => n.textContent.includes("STOP")), $1(kmSel)?.textContent), within: 6000 }
		],
		async tidy(u, c) {
			if ($1("#globpop").hidden) { await u.pick("engsel", "global"); await sleep(300); }
			GP.note = c.n; drawGlobal(); await sleep(100);
			if (c.n != null && Docs.global.keymap[c.n] !== c.v0) { await u.pick("gmapsel", c.v0 == null ? "" : String(c.v0)); await sleep(1500); }
			if (c.stopAt >= 0 && Docs.global.keymap[c.stopAt] !== 145) { GP.note = c.stopAt; drawGlobal(); await sleep(100); await u.pick("gmapsel", "145"); await sleep(1500); }
			GP.note = 64; u.key("Escape"); await sleep(200);
		}
	};
	/* 0.6 (DESIGN-machine-menus.md §2, md-08): GLOBAL is a page under the header, as wide as it; the header stays and a
	   click on a workspace tab goes back to that workspace */
	const globalPage = {
		name: "md-global-page", proves: ["MD-162"],
		steps: [
			{ say: "click GLOBAL: a modal over a dimmed backdrop (review 1, B-091), the head on one line, focus inside", act: u => u.click("#globkey"),
				screen: () => { const p = $1("#globpop").getBoundingClientRect(), hd = $1("#globpop .gphead").getBoundingClientRect(), bg = $1("#modalbg");
					const pop = $1("#globpop"), wide = pop.scrollWidth > pop.clientWidth + 1; return ok(!wide && !$1("#globpop").hidden && Modal.top() === "globpop" && !!bg && !bg.hidden && Math.abs(p.left + p.width / 2 - innerWidth / 2) < 3 && hd.height < 48 && $1("#globpop").contains(document.activeElement) && $all("#globpop .gslots button").length === 8 && !!$1('#globpop [data-ga="copy"]') && !!$1('#globpop [data-ga="paste"]') && !!$1('#globpop [data-ga="reset"]'),
						`${wide ? "its cards wider than the dialog (" + pop.scrollWidth + " > " + pop.clientWidth + "), " : ""}open ${!$1("#globpop").hidden}, top ${Modal.top()}, backdrop ${bg && !bg.hidden}, centre ${Math.round(p.left + p.width / 2)}/${Math.round(innerWidth / 2)}, head ${Math.round(hd.height)} px, focus ${document.activeElement?.tagName}`); } },
			{ say: "press Escape: GLOBAL closes", act: u => u.key("Escape"), screen: () => ok($1("#globpop").hidden && !pressed("#globkey"), "still open") },
			{ say: "click GLOBAL, then its back key: closed", act: async u => { u.click("#globkey"); await sleep(300); u.click('#globpop [data-ga="close"]'); }, screen: () => ok($1("#globpop").hidden && !pressed("#globkey"), "still open") }
		],
		async tidy(u) { if (!$1("#globpop").hidden) u.key("Escape"); u.click(tab("seq")); await sleep(200); }
	};
	/* 0.6: Copy and Paste of the active global (the core's library: globalCopy, globalPaste), asked before the paste,
	   one undo step */
	const globalCopyPaste = {
		name: "md-global-copy-paste", proves: ["MD-162"],
		steps: [
			{ say: "open GLOBAL, click Copy: Paste is on", act: u => { u.click("#globkey"); setTimeout(() => u.click('#globpop [data-ga="copy"]'), 300); },
				screen: () => ok(!$1('#globpop [data-ga="paste"]')?.disabled, "Paste off"), machine: c => { c.t0 = Docs.global?.control?.tempoOut; return ok(V.clipboard?.global != null, "clipboard " + JSON.stringify(V.clipboard?.global)); }, within: 6000 },
			{ say: "click TEMPO OUT the other way", act: (u, c) => u.click(tog("tempoOut", !c.t0)), machine: c => ok(Docs.global.control.tempoOut === !c.t0, "tempoOut " + Docs.global.control.tempoOut), within: 6000 },
			{ say: "click Paste: it asks", act: u => u.click('#globpop [data-ga="paste"]'), screen: () => ok(dlgShown() && /Paste over GLOBAL \d/.test($1("#dlg").textContent), "no question"), within: 6000 },
			{ say: "click Paste in the question: the copied global is back", act: u => u.click(dlgButton("Paste")), machine: c => ok(Docs.global.control.tempoOut === c.t0, "tempoOut " + Docs.global.control.tempoOut),
				screen: c => ok(pressed(tog("tempoOut", c.t0)), "TEMPO OUT not back"), within: 10000 },
			{ ...undoKey, say: "press Cmd+Z: the paste is undone", machine: c => ok(Docs.global.control.tempoOut === !c.t0, "tempoOut " + Docs.global.control.tempoOut), within: 10000 }
		],
		async tidy(u, c) { if (dlgShown()) u.click(dlgButton("Cancel")); if (c.t0 != null && Docs.global?.control?.tempoOut !== c.t0) { if ($1("#globpop").hidden) { u.click("#globkey"); await sleep(300); } u.click(tog("tempoOut", c.t0)); await until(() => Docs.global?.control?.tempoOut === c.t0, 6000); } if (!$1("#globpop").hidden) u.key("Escape"); }
	};
	/* 0.6 (P3): TRIG IN A / B editable: each value a stepper, DEST runs -, 1 ... 16 as the machine's knob */
	const tin = (p, i, d) => `#globpop [data-ga="trigin"][data-p="${p}"][data-i="${i}"][data-d="${d}"]`;
	const globalTrigIn = {
		name: "md-global-trig-in", proves: ["MD-175"],
		steps: [
			{ say: "open GLOBAL, click + under Gate for A", act: (u, c) => { c.in0 = Docs.global.settings.inputSettings.slice(); u.click("#globkey"); setTimeout(() => u.click(tin("gate", 0, 1)), 300); },
				machine: c => ok(Docs.global.settings.inputSettings[2] === Math.min(127, c.in0[2] + 1), "GATE A " + Docs.global.settings.inputSettings[2]), within: 6000 },
			{ say: "click + under Dest for B: from - to track 1", act: u => u.click(tin("dest", 1, 1)),
				machine: c => ok(Docs.global.settings.inputSettings[1] === (c.in0[1] === 16 ? 0 : Math.min(15, c.in0[1] + 1)), "DEST B " + Docs.global.settings.inputSettings[1]),
				screen: () => ok(/T\d+/.test($1(tin("dest", 1, 1))?.previousElementSibling?.textContent || ""), "Dest B shows " + $1(tin("dest", 1, 1))?.previousElementSibling?.textContent), within: 6000 },
			{ ...undoKey, say: "press Cmd+Z twice: both back", act: async u => { u.key("z", { cmd: true }); await sleep(400); u.key("z", { cmd: true }); }, machine: c => ok(JSON.stringify(Docs.global.settings.inputSettings) === JSON.stringify(c.in0), "inputs " + Docs.global.settings.inputSettings), within: 10000 },
			esc
		],
		async tidy(u) { if (!$1("#globpop").hidden) u.key("Escape"); }
	};
	/* 0.6 (MD-169): LEARN on the map editor: a dot on a track's key, then a note from a MIDI keyboard (the plug-in's midiIn;
	   here given to the page as the plug-in would) maps to that track; Reset map brings Elektron's map back (asked) */
	const globalLearn = {
		name: "md-global-learn", proves: ["MD-169", "MD-289"],
		steps: [
			{ say: "open GLOBAL, click track 3's LEARN dot: lit, the head says to play a note", act: (u, c) => { c.k0 = Docs.global.keymap.slice(); u.click("#globkey"); setTimeout(() => u.click('#globpop [data-ga="learn"][data-t="2"]'), 300); },
				screen: () => ok(pressed('#globpop [data-ga="learn"][data-t="2"]') && /LEARN: play a note for TRACK 3/.test($1("#globpop").textContent), "dot " + $1('#globpop [data-ga="learn"][data-t="2"]')?.getAttribute("aria-pressed")), within: 4000 },
			{ say: "play E7 (100) on a MIDI keyboard: it plays track 3, the dot goes out", act: () => window.gm.recv([{ type: "midiIn", ch: 0, note: 100, vel: 100 }]),
				machine: () => ok(Docs.global.keymap[100] === 2 && Docs.global.keymap.indexOf(2) === 100, "note 100 -> " + Docs.global.keymap[100]),
				screen: () => ok(!pressed('#globpop [data-ga="learn"][data-t="2"]') && /E7/.test($all('#globpop .gmk')[2]?.textContent || ""), "track 3 key " + $all('#globpop .gmk')[2]?.textContent), within: 6000 },
			{ say: "click Reset map: it asks", act: u => u.click('#globpop [data-ga="resetmap"]'), screen: () => ok(dlgShown() && /Elektron's note map/.test($1("#dlg").textContent), "no question") },
			{ say: "click Reset map in the question: the factory map is back", act: u => u.click(dlgButton("Reset map")),
				machine: c => ok(Docs.global.keymap[100] == null && Docs.global.keymap[40] === 2, "note 100 -> " + Docs.global.keymap[100] + ", 40 -> " + Docs.global.keymap[40]), within: 10000 },
			esc
		],
		async tidy(u) { if (dlgShown()) u.click(dlgButton("Cancel")); if (!$1("#globpop").hidden) u.key("Escape"); }
	};
	/* I-002: a note from a MIDI keyboard (the plug-in's midiIn, given to the page as the plug-in would) on the base channel
	   lights the track the map gives it: its number on the rail (Sound), its LED on Mix; another channel lights nothing */
	const watchLit = (c, q, cls) => { c.lit = new Set(); c.obs?.disconnect(); c.obs = new MutationObserver(rs => rs.forEach(r => { const e = r.target; if (e.matches?.(q) && e.classList.contains(cls)) c.lit.add(+(e.dataset.sel ?? e.dataset.act)); }));
		c.obs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["class"] }); };
	const noteLights = {
		name: "md-sound-note-light", proves: ["MD-164", "MD-165", "MD-X14"],
		steps: [
			go("sound"),
			{ say: "a MIDI keyboard plays track 3's note on another channel than the base: no track lights", act: async (u, c) => { c.g = Docs.global; c.n = c.g.keymap.indexOf(2); watchLit(c, "#rail .th", "hit"); window.gm.recv([{ type: "midiIn", ch: (c.g.baseChannel + 1) % 16, note: c.n, vel: 100 }]); await sleep(300); },
				screen: c => ok(c.n >= 0 && c.lit.size === 0, "note " + c.n + ", lit " + [...c.lit]) },
			{ say: "on the base channel: track 3's number on the rail lights for a moment", act: (u, c) => { watchLit(c, "#rail .th", "hit"); window.gm.recv([{ type: "midiIn", ch: c.g.baseChannel, note: c.n, vel: 100 }]); },
				screen: c => ok(c.lit.has(2) && c.lit.size === 1, "lit " + [...c.lit]), within: 2000 },
			{ say: "and goes out", screen: () => ok(!$1('#rail .th[data-sel="2"]').classList.contains("hit"), "still lit"), within: 2000 },
			go("mix"),
			{ say: "on Mix a burst of 50 notes for track 3: its LED lights, no other", act: (u, c) => { watchLit(c, ".strip .act", "hit"); window.gm.recv(Array.from({ length: 50 }, () => ({ type: "midiIn", ch: c.g.baseChannel, note: c.n, vel: 100 }))); },
				screen: c => ok(c.lit.has(2) && c.lit.size === 1, "lit " + [...c.lit]), within: 2000 },
			{ say: "a trig's flash of that LED (on) stays while the note's light (hit) goes", act: async (u, c) => { const l = $1('.act[data-act="2"]'); l.classList.remove("hit"); l.classList.add("on"); window.gm.recv([{ type: "midiIn", ch: c.g.baseChannel, note: c.n, vel: 100 }]); await sleep(400); c.on = l.classList.contains("on"); l.classList.remove("on"); },
				screen: c => ok(c.on && !$1('.act[data-act="2"]').classList.contains("hit"), "trig flash cut: " + !c.on) }
		],
		async tidy(u, c) { c?.obs?.disconnect(); }
	};
	const audioPanel = {
		name: "md-audio-panel", proves: [],
		steps: [
			{ say: "press , : AUDIO / MIDI opens", act: async u => { document.activeElement?.blur?.(); u.key(","); await sleep(400); Journey.snapshot("md-audio-midi"); }, screen: () => ok(!$1("#audiopop").hidden && $1("#audiopop").textContent.length > 40, "closed") },
			{ say: "press Escape", act: u => u.key("Escape"), screen: () => ok($1("#audiopop").hidden, "open") }
		]
	};
	const hwNoMachine = {
		name: "md-engine-hw-no-machine", proves: [],
		steps: [
			{ say: "choose HW MIDI in the engine menu (no Machinedrum attached)", act: u => u.pick("engsel", "hw"), screen: () => ok(!$1("#bootmidi").hidden && document.body.classList.contains("deskmidi"), "no card"), machine: () => ok(machineState().capabilities?.engine === "hw", "engine " + machineState().capabilities?.engine), within: 10000 },
			{ say: "the card says no machine answers", screen: () => ok($1("#bootmidi").classList.contains("lost") && !$1('[data-bootmidi="emu"]').hidden, $1("#bmt")?.textContent), within: 20000 },
			{ say: "click Use the emulator", act: u => u.click('[data-bootmidi="emu"]'), screen: () => ok($1("#bootmidi").hidden, "card shown"), machine: () => ok(machineState().capabilities?.engine === "emu" && !!machineState().input && V.loaded, "engine " + machineState().capabilities?.engine), within: 40000 }
		],
		async tidy() { if (machineState().capabilities?.engine !== "emu") { const s = $1("#engsel"); s.value = "emu"; s.dispatchEvent(new Event("change", { bubbles: true })); await until(() => !!machineState().input, 40000); } await until(() => !desk().loading, 60000); }
	};
	const romCard = {
		name: "md-engine-rom-card", proves: [],
		steps: [
			{ say: "choose LOAD ROM: the card shows the firmware in use", act: u => u.pick("engsel", "rom"), screen: () => ok(!$1("#bootcard").hidden && /1\.63/.test($1("#bootcur")?.textContent || ""), "card " + $1("#bootcur")?.textContent), within: 5000 },
			{ say: "click Close", act: u => u.click('#bootcard [data-bootrom="close"]'), screen: () => ok($1("#bootcard").hidden, "still shown"), machine: () => ok(!!machineState().input, "the machine stopped") }
		]
	};
	const notePlay = {
		name: "md-keys-play-notes", proves: ["MD-019", "MD-X19"],
		steps: [
			go("seq"), sel(() => soundTrack()),
			{ say: "press A on the keyboard: the track plays", act: u => { results.length = 0; document.activeElement?.blur?.(); u.key("a"); }, machine: () => ok(results.some(r => r.op === "noteOn" && r.ok), "results " + results.map(r => r.op + ":" + r.ok).join(",")) }
		]
	};

	/* ---------- more: the lock lane's comforts, paste to many, MUTATE's scope, the Song inspector and drag, RAM, PAN ---------- */
	const undoUntil = async (u, done, n = 6) => { for (let i = 0; i < n && !done(); i++) { u.key("z", { cmd: true }); await until(() => idle() && done(), 1500); } };
	const laneSteps = (t, i) => locksOf(t, i).map(([s]) => s);
	const lockRamp = {
		name: "md-seq-lock-ramp-erase-wheel", proves: ["MD-134", "MD-136"],
		steps: [
			go("seq"),
			{ say: "pick a track with three trigs on the first page and the FLTF lock key", act: async (u, c) => { c.t = soundTracks().find(t => trigsOf(t).filter(s => s < 16).length >= 3) ?? soundTrack(); u.click(rail(c.t)); await sleep(200); const k = $1('#chips .pk[data-lane="FLTF"]') || $1("#chips .pk[data-lane]"); c.p = k.dataset.lane; u.click(k); await sleep(200); c.i = pidx(c.t, c.p); c.l0 = locksOf(c.t, c.i); c.on = trigsOf(c.t).filter(s => s < 16).slice(0, 3); },
				screen: c => ok(S.sel === c.t && S.lane === c.p, "lane " + S.lane), machine: c => ok(c.on.length === 3, "trigs " + trigsOf(c.t).join(",")) },
			{ say: "Shift-drag across the lane: a ramp over the trigs", act: async (u, c) => { await u.drag(`#lane .lb[data-s="${c.on[0]}"]`, [`#lane .lb[data-s="${c.on[1]}"]`, `#lane .lb[data-s="${c.on[2]}"]`], { shift: true }, { fy: 0.8 }); },
				machine: c => { const l = locksOf(c.t, c.i), v = s => l.find(([x]) => x === s)?.[1]; return ok(c.on.every(s => v(s) != null) && v(c.on[0]) !== v(c.on[2]), "locks " + JSON.stringify(l)); }, screen: c => ok(c.on.every(s => $1(`#lane .lb[data-s="${s}"] i`)), "no bars"), within: 8000 },
			{ say: "Alt-drag across the same steps: the locks are erased", act: async (u, c) => { await u.drag(`#lane .lb[data-s="${c.on[0]}"]`, [`#lane .lb[data-s="${c.on[1]}"]`, `#lane .lb[data-s="${c.on[2]}"]`], { alt: true }); },
				machine: c => ok(c.on.every(s => !laneSteps(c.t, c.i).includes(s)), "locks " + JSON.stringify(locksOf(c.t, c.i))), screen: c => ok(c.on.every(s => !$1(`#lane .lb[data-s="${s}"] i`)), "bars left"), within: 8000 },
			{ say: "scroll the wheel up over a trig's step: its lock moves up from the kit value", act: (u, c) => { c.base = grp(c.t, c.p)[c.p] ?? 0; u.wheel(cell(c.t, c.on[0]), 2); },
				machine: c => { const v = locksOf(c.t, c.i).find(([x]) => x === c.on[0])?.[1]; return ok(v === Math.min(127, c.base + 8), `lock ${v}, kit value ${c.base}`); }, within: 8000 }
		],
		async tidy(u, c) { await undoUntil(u, () => same(locksOf(c.t, c.i), c.l0)); }
	};
	const pasteMany = {
		name: "md-seq-paste-many", proves: ["MD-118", "MD-X10"],
		steps: [
			go("seq"),
			{ say: "pick a track with trigs and press Cmd+C", act: async (u, c) => { const st = soundTracks(); c.a = st.find(t => trigsOf(t).length) ?? 0; c.bs = st.filter(t => t !== c.a && !same(trigsOf(t), trigsOf(c.a))).slice(0, 2); if (c.bs.length < 2) throw new Error("no two other tracks"); c.b0 = c.bs.map(trigsOf); c.ta = trigsOf(c.a); u.click(rail(c.a)); await sleep(200); document.activeElement?.blur?.(); u.key("c", { cmd: true }); }, machine: () => ok(V.clipboard.steps, "nothing copied") },
			{ say: "Shift-click two other tracks' headers: marked", act: async (u, c) => { for (const t of c.bs) { u.click(rail(t), { shift: true }); await sleep(150); } }, screen: c => ok(c.bs.every(t => $1(`#rail .th[data-sel="${t}"]`)?.classList.contains("multi")), "not marked") },
			{ say: "press Cmd+V: both get the steps", act: u => u.key("v", { cmd: true }), machine: c => ok(c.bs.every((t, k) => same(trigsOf(t).filter(inLen), c.ta.filter(inLen)) && same(trigsOf(t).filter(s => !inLen(s)), c.b0[k].filter(s => !inLen(s)))), c.bs.map(t => `T${t + 1} ${trigsOf(t).join(",")}`).join("; ")), within: 8000 },
			{ ...undoKey, say: "press Cmd+Z once: both are back (one undo step)", machine: c => ok(c.bs.every((t, k) => same(trigsOf(t), c.b0[k])), c.bs.map(t => `T${t + 1} ${trigsOf(t).join(",")}`).join("; ")), within: 8000 }
		],
		async tidy(u, c) { if (S.multi?.size) { u.key("Escape"); await sleep(100); } if (c.bs) await undoUntil(u, () => c.bs.every((t, k) => same(trigsOf(t), c.b0[k])), 3); }
	};
	const mutScope = {
		name: "md-gen-mutate-scope", proves: ["MD-X05"],
		steps: [
			go("sound"), sel(() => soundTrack()),
			{ say: "click MUTATE's Fx chip on and Syn off", act: async (u, c) => { c.scope0 = [...S.mut.scope]; c.amt0 = S.mut.amount; if (!S.mut.scope.has("fx")) u.click('#mutband [data-mutg="fx"]'); await sleep(100); if (S.mut.scope.has("syn")) u.click('#mutband [data-mutg="syn"]'); await sleep(100); },
				screen: () => ok(pressed('#mutband [data-mutg="fx"]') && !pressed('#mutband [data-mutg="syn"]'), "chips " + [...S.mut.scope].join(",")) },
			{ say: "click the Amount value: one more", act: u => u.click('#mutband .gv[data-gv="amt"]'), screen: c => ok($1('#mutband .gv[data-gv="amt"] b')?.textContent === (c.amt0 + 1) + "%", "shows " + $1('#mutband .gv[data-gv="amt"] b')?.textContent) },
			{ say: "click MUTATE's Random key: only the effects move", act: (u, c) => { c.k0 = kitVals(c.t); u.click("#mutband [data-rand]"); },
				machine: c => { const k = kitVals(c.t); return ok(!same(k.slice(8, 16), c.k0.slice(8, 16)) && same(k.slice(0, 8), c.k0.slice(0, 8)) && same(k.slice(16), c.k0.slice(16)), `synth ${same(k.slice(0, 8), c.k0.slice(0, 8)) ? "same" : "moved"}, effects ${same(k.slice(8, 16), c.k0.slice(8, 16)) ? "same" : "moved"}, routing ${same(k.slice(16), c.k0.slice(16)) ? "same" : "moved"}`); }, within: 8000 },
			{ ...undoKey, machine: c => ok(same(kitVals(c.t), c.k0), "kit not back"), within: 8000 }
		],
		async tidy(u, c) { if (!c.scope0) return; for (const g of ["syn", "fx", "rt"]) if (S.mut.scope.has(g) !== c.scope0.includes(g)) { u.click(`#mutband [data-mutg="${g}"]`); await sleep(80); } if (S.mut.amount !== c.amt0) u.click('#mutband .gv[data-gv="amt"]', { shift: true }); }
	};
	const songInspector = {
		name: "md-song-row-inspector", proves: ["MD-149", "MD-154", "MD-157"],
		steps: [
			go("song"),
			{ say: "add a row (Arrange, pad A01): it is selected", act: async (u, c) => { u.click('[data-set="songpick"] button[data-v="song"]'); await sleep(200); c.r0 = JSON.stringify(songRows()); c.n0 = songRows().length; u.click('[data-addpat="0"]'); await until(() => songRows().length === c.n0 + 1, 4000); c.i = S.songSel; },
				machine: c => ok(songRows().length === c.n0 + 1 && songRows()[c.i]?.kind === "pattern", "rows " + songRows().length) },
			{ say: "click Repeat +", act: (u, c) => { c.rep = songRows()[c.i].repeats; u.click('[data-step="rep"][data-d="1"]'); }, machine: c => ok(songRows()[c.i].repeats === c.rep + 1, "repeats " + songRows()[c.i].repeats), screen: c => ok($1('[data-step="rep"][data-d="1"]')?.previousElementSibling?.textContent === String(c.rep + 2), "shows " + $1('[data-step="rep"][data-d="1"]')?.previousElementSibling?.textContent) },
			{ say: "open More (it stays open from an earlier row: then no click) and mute track 1 for the row", act: async u => { if (!S.songMore) { u.click("[data-rowmore]"); await sleep(250); } u.click('[data-rowmute="0"]'); }, machine: c => ok((songRows()[c.i].mutes || []).includes(0), "mutes " + JSON.stringify(songRows()[c.i].mutes)), screen: () => ok($1('[data-rowmute="0"]')?.classList.contains("off"), "key not off") },
			{ say: "click Add loop: a loop row after it", act: async u => { u.click('[data-rowact="loop"]'); await sleep(400); Journey.snapshot("md-song-loop"); }, machine: c => ok(songRows()[c.i + 1]?.kind === "loop", "row " + JSON.stringify(songRows()[c.i + 1])), screen: () => ok($all("#tl .scell.loop").length >= 1, "no loop cell") }
		],
		async tidy(u, c) { if (S.songMore && $1("[data-rowmore]")) u.click("[data-rowmore]"); if (c.r0) await undoUntil(u, () => JSON.stringify(songRows()) === c.r0, 8); await back(u, c); }
	};
	const songDrag = {
		name: "md-song-drag-drop", proves: ["MD-150"],
		steps: [
			go("song"),
			{ say: "drag pad A02 onto the empty end of the grid: a row is appended", act: async (u, c) => { u.click('[data-set="songpick"] button[data-v="song"]'); await sleep(200); c.r0 = JSON.stringify(songRows()); c.n0 = songRows().length; await u.dragDrop('[data-addpat="1"]', `#tl .scell[data-i="${c.n0 + 1}"]`); },
				machine: c => ok(songRows().length === c.n0 + 1 && songRows()[c.n0 - 1]?.pattern === 1, "rows " + songRows().map(r => r.kind === "pattern" ? r.pattern : r.kind).join(",")), within: 6000 },
			{ say: "drag that row onto the first cell: it moves there", act: async (u, c) => { await u.dragDrop(`#tl .scell[data-i="${c.n0 - 1}"]`, '#tl .scell[data-i="0"]'); },
				machine: () => ok(songRows()[0]?.pattern === 1, "rows " + songRows().map(r => r.kind === "pattern" ? r.pattern : r.kind).join(",")), within: 6000 }
		],
		async tidy(u, c) { if (c.r0) await undoUntil(u, () => JSON.stringify(songRows()) === c.r0, 6); await back(u, c); }
	};
	const ramView = {
		name: "md-sampler-ram-view", proves: ["MD-275"],
		steps: [
			go("sampler"),
			{ say: "set up sampling in an unused RAM slot", act: async (u, c) => { c.n = [1, 2, 3, 4].find(k => !V.tracks.some(t => t.m === "RAM-R" + k || t.m === "RAM-P" + k)); if (!c.n) throw new Error("every RAM slot is used"); u.click(`.slotk[data-slot="RAM${c.n}"]`); await sleep(300); [c.r, c.p] = setupTracks(); c.m0 = [kit().tracks[c.r].machine, kit().tracks[c.p].machine]; c.t0 = trigsOf(c.r); u.click("[data-setupgo]"); },
				machine: c => ok(kit().tracks[c.r].machine === "RAM-R" + c.n, "track " + kit().tracks[c.r].machine), screen: () => ok(!!$1("[data-rc]") && !!$1('[data-slotmode="frozen"]'), "no RAM view"), within: 8000 },
			{ say: "click an empty step of the RAM view: a recorder trig", act: async (u, c) => { c.s = [...Array(16).keys()].find(s => !trigsOf(c.r).includes(s)); u.click(`[data-rc="${c.s}"]`); await sleep(250); Journey.snapshot("md-sampler-ram"); }, machine: c => ok(trigsOf(c.r).includes(c.s), "recorder trigs " + trigsOf(c.r).join(",")), screen: c => ok(pressed(`[data-rc="${c.s}"]`), "not lit") },
			{ say: "click Freeze: the recorder is muted on the machine", act: u => u.click('[data-slotmode="frozen"]'), machine: c => ok(mutes().includes(c.r), "machine mutes " + mutes()) },
			{ say: "click Live: it records again", act: u => u.click('[data-slotmode="live"]'), machine: c => ok(!mutes().includes(c.r), "machine mutes " + mutes()) }
		],
		async tidy(u, c) { if (c.m0) await undoUntil(u, () => same([kit().tracks[c.r].machine, kit().tracks[c.p].machine], c.m0) && same(trigsOf(c.r), c.t0), 4); }
	};
	/* B-025: chops right after Set up sampling, the machine stopped: each is a pattern dump over the current pattern,
	   which reloads the kit from its slot; the unsaved RAM-R / RAM-P must come back after every one. */
	const setupChop = {
		name: "md-sampler-setup-chop", proves: ["MD-275"],
		steps: [
			go("sampler"),
			{ say: "set up sampling in an unused RAM slot", act: async (u, c) => { c.n = [1, 2, 3, 4].find(k => !V.tracks.some(t => t.m === "RAM-R" + k || t.m === "RAM-P" + k)); if (!c.n) throw new Error("every RAM slot is used"); u.click(`.slotk[data-slot="RAM${c.n}"]`); await sleep(300); [c.r, c.p] = setupTracks(); c.m0 = [kit().tracks[c.r].machine, kit().tracks[c.p].machine]; c.t0 = trigsOf(c.p); u.click("[data-setupgo]"); },
				machine: c => ok(kit().tracks[c.r].machine === "RAM-R" + c.n && kit().tracks[c.p].machine === "RAM-P" + c.n, `tracks ${kit().tracks[c.r].machine} ${kit().tracks[c.p].machine}`), within: 8000 },
			{ say: "click up to eight chop cells quickly", act: async (u, c) => { c.s = $all("#chop [data-cp]").map(e => +e.dataset.cp).filter(s => !trigsOf(c.p).includes(s)).slice(0, 8); c.done = []; for (const s of c.s) { const q = `#chop [data-cp="${s}"]`; await until(() => !!$1(q), 1000); if (!$1(q)) continue; u.click(q); c.done.push(s); await sleep(90); } },
				machine: c => ok(c.done.length >= 2 && c.done.every(s => trigsOf(c.p).includes(s)), "clicked " + c.done + ", player trigs " + trigsOf(c.p)), within: 8000 },
			{ say: "wait: the kit keeps RAM-R and RAM-P", act: () => sleep(4000),
				machine: c => ok(kit().tracks[c.r].machine === "RAM-R" + c.n && kit().tracks[c.p].machine === "RAM-P" + c.n, `tracks ${kit().tracks[c.r].machine} ${kit().tracks[c.p].machine}`), within: 2000 }
		],
		async tidy(u, c) { if (c.m0) await undoUntil(u, () => same([kit().tracks[c.r].machine, kit().tracks[c.p].machine], c.m0) && same(trigsOf(c.p), c.t0), 8); await back(u, c); }
	};
	const panBox = {
		name: "md-mix-pan-undo", proves: ["MD-066"],
		steps: [
			go("mix"),
			{ say: "drag a track's PAN box sideways", act: async (u, c) => { c.t = soundTrack(); c.i = pidx(c.t, "PAN", "rt"); c.v0 = kitVals(c.t)[c.i]; await nudge(u, `.strip[data-sel="${c.t}"] .pc[data-n="PAN"]`, c.v0); },
				machine: c => ok(kitVals(c.t)[c.i] !== c.v0, "kit PAN " + kitVals(c.t)[c.i]), screen: c => ok($1(`.strip[data-sel="${c.t}"] .pc[data-n="PAN"] b`)?.textContent !== String(c.v0 - 64), "shows " + $1(`.strip[data-sel="${c.t}"] .pc[data-n="PAN"] b`)?.textContent) },
			{ ...undoKey, machine: c => ok(kitVals(c.t)[c.i] === c.v0, "kit PAN " + kitVals(c.t)[c.i]) }
		]
	};


	/* Screenshots of the key map's views (scripts/mdmm-shots.sh): each step sets a view up and logs "SHOT <name>", then
	   holds while the script captures the window by its id. Only when asked by name (journey-md-shots): skipped in a
	   run of every journey. */
	const shot = name => { Bridge.log("SHOT " + name); };
	const hold = 2500;
	const kvChip = mod => `#keyspop .kv-chip[data-kvmod="${mod}"]`;
	const shots = {
		name: "md-shots", proves: [], needs: () => /md-shots/.test(location.search) ? null : "screenshots only when asked by name",
		steps: [
			go("seq"), sel(() => soundTracks().find(t => t < 14 && trigsOf(t).length >= 3) ?? soundTrack()),
			{ say: "Cmd-drag a block over three tracks: a selection", act: async (u, c) => { if (S.stepSel) clearSel(); await u.drag(cell(c.t, 4), [cell(c.t, 6), cell(c.t + 2, 11)], { cmd: true }); await sleep(400); shot("app-7-selection"); },
				screen: () => ok(!!S.stepSel, "no selection"), hold },
			{ say: "press ?: the keyboard view, R clicked", act: async u => { clearSel(); document.activeElement?.blur?.(); u.key("?", { shift: true }); await sleep(300); u.click('#keyspop .kv-cap[data-code="KeyR"]'); await sleep(300); shot("app-1-base"); },
				screen: () => ok(!$1("#keyspop").hidden, "no view"), hold },
			{ say: "the ⇧ layer, → clicked", act: async u => { u.click(kvChip("shift")); await sleep(200); u.click('#keyspop .kv-cap[data-code="ArrowRight"]'); await sleep(300); shot("app-2-shift"); }, hold },
			{ say: "the ⌥ / FN layer, R clicked", act: async u => { u.click(kvChip("shift")); u.click(kvChip("alt")); await sleep(200); u.click('#keyspop .kv-cap[data-code="KeyR"]'); await sleep(300); shot("app-3-alt-fn"); }, hold },
			{ say: "the ⌘ layer, A clicked", act: async u => { u.click(kvChip("alt")); u.click(kvChip("cmd")); await sleep(200); u.click('#keyspop .kv-cap[data-code="KeyA"]'); await sleep(300); shot("app-4-cmd"); }, hold },
			{ say: "the mouse's tricks", act: async () => { const p = $1("#keyspop"), c = p.querySelector(".kv-cols"); p.scrollTop = c.offsetTop - 8; await sleep(300); shot("app-5-mouse-tricks"); }, hold },
			{ say: "Esc, then right-click a step with a trig: its menu", act: async (u, c) => {
				u.key("Escape"); await sleep(300);
				const s = trigsOf(c.t).find(x => x < Math.min(V.length, V.len)) ?? 0; u.rightClick(cell(c.t, s)); await sleep(400); shot("app-6-stepmenu");
			}, screen: () => ok(!$1("#deskmenu").hidden, "no menu"), hold },
			{ say: "Esc: the menu closes", act: async u => { u.key("Escape"); await sleep(200); if (S.stepSel) clearSel(); shot("done"); } }
		],
		async tidy() { if (!$1("#deskmenu")?.hidden) closeDeskMenu(); if (!$1("#keyspop").hidden) toggleKeys(false); if (S.stepSel) clearSel(); }
	};
	/* B-019: a .syx imported as from a cable. The file is the run's (GEARMULATOR_MDMM_SYX_FILE, diagnostics builds: the
	   plug-in opens it where the chooser would be). Kits only; afterwards every kit the report does not list (taken as
	   in the file) has the file's name on the machine. It writes the machine's kits and an import has no Undo: last. */
	const syxKitIds = () => $all('#syxpop button[data-syxitem^="kit:"]');
	/* the report: the slots of a kind the machine did not take as in the file (every reported item carries its outcome) */
	const syxNotTaken = kind => new Set($all(`#syxpop [data-syxitem^="${kind}:"][data-syxout]`).filter(d => d.dataset.syxout !== "taken").map(d => +d.dataset.syxitem.split(":")[1]));
	const syxImportJ = {
		name: "md-lib-syx-import", alone: true, proves: ["MD-181", "MD-X13"],
		needs: () => new URLSearchParams(location.search).get("syxfile") ? null : "no .syx for the run (GEARMULATOR_MDMM_SYX_FILE)",
		steps: [
			{ say: "choose IMPORT SYSEX… in the engine menu: the file's preview", act: u => u.pick("engsel", "import"), screen: () => ok(!$1("#syxpop").hidden && syxKitIds().length > 0, "no preview with kits"), within: 8000 },
			{ say: "leave Kits ticked only, click Import: sent, read back, reported", act: (u, c) => {
				for (const b of $all("#syxpop [data-syxkind]")) if (b.checked !== (b.dataset.syxkind === "kit")) u.click(b);
				c.names = syxKitIds().map(b => [+b.dataset.syxitem.split(":")[1], (b.dataset.syxname || "").trim()]);
				u.click('#syxpop [data-syxgo="start"]');
			}, screen: () => ok(/imported/.test($1("#syxpop .syxsum")?.textContent || ""), "progress: " + ($1("#syxpop .syxbar span")?.textContent || "")),
			machine: c => {
				const notTaken = syxNotTaken("kit");
				const off = c.names.filter(([k, n]) => !notTaken.has(k) && n && (kitName(k) || "").trim() !== n);
				return ok(!off.length, off.length + " kits not as in the file: " + off.slice(0, 4).map(([k, n]) => `K${k + 1} "${kitName(k)}" not "${n}"`).join(", "));
			}, within: 180000 },
			{ say: "click Done: the panel closes", act: u => u.click('#syxpop [data-syxgo="close"]'), screen: () => ok($1("#syxpop").hidden, "still open") },
			esc
		]
	};
	/* ---------- wave 6: SysEx kinds and ranges, SPECIFIC place, VERIFY ONLY, Reset machine… ---------- */
	/* the SysEx news as they come (the export's words, a factory reset being prepared): the toast may be replaced */
	const syxNews = [];
	Bridge.onMessage(m => { if (m.type === "syxExport" || m.type === "syxReset") { syxNews.push(m); if (syxNews.length > 20) syxNews.shift(); } });
	const lastExport = () => syxNews.filter(m => m.type === "syxExport" && !m.running).pop();
	/* the page tier opens its own file and writes into the temp folder; the plug-in needs the run's file (diagnostics) */
	const syxWanted = () => window.gmDev || new URLSearchParams(location.search).get("syxfile") ? null : "no .syx for the run (GEARMULATOR_MDMM_SYX_FILE)";
	const syxValue = (k, end) => `#syxpop [data-sxv="${end}"][data-k="${k}"]`;
	const syxKinds = on => async u => { for (const b of $all("#syxpop [data-syxkind]")) if (b.checked !== on.includes(b.dataset.syxkind)) u.click(b); await sleep(100); };
	const syxCell = id => `#syxpop button[data-syxitem="${id}"]`;
	const openImport = { say: "choose IMPORT SYSEX… in the engine menu: the file's preview", act: u => u.pick("engsel", "import"),
		screen: () => ok(!$1("#syxpop").hidden && !$1("#syxpop").classList.contains("syx-export") && $all('#syxpop button[data-syxitem^="kit:"]').length > 0, "no preview with kits"), within: 8000 };
	const syxExportKinds = {
		name: "md-lib-syx-export-kinds", proves: ["MD-176", "MD-177", "MD-178", "MD-179", "MD-180", "MD-X13"],
		needs: () => window.gmDev ? null : "the save dialog: the page tier only",
		steps: [
			{ say: "choose EXPORT SYSEX… in the engine menu: ALL is ticked, the kinds wait under it", act: u => u.pick("engsel", "export"),
				screen: () => ok(!$1("#syxpop").hidden && $1("#syxpop").classList.contains("syx-export") && !!$1('#syxpop [data-sxk="all"]')?.checked && !!$1(syxValue("kit", "to")), "no export panel with ALL and the kit range"), within: 6000 },
			{ say: "click Save .syx… with All: every document the editor holds", act: (u, c) => { c.n = syxNews.length; u.click('#syxpop [data-syxgo="save"]'); },
				screen: c => { const m = syxNews.length > c.n && lastExport(); return ok(!!m && m.ok && /every document the editor holds \(\d+ kits?, \d+ patterns?, \d+ songs?, \d+ globals?\)/.test(m.text) && $1("#syxpop").hidden, m ? m.text : "no export yet"); }, within: 8000 },
			{ say: "EXPORT SYSEX… again and untick All: each kind with its range", act: async u => { await u.pick("engsel", "export"); await until(() => !!$1(syxValue("kit", "to")), 6000); u.click('#syxpop [data-sxk="all"]'); },
				screen: () => ok(!$1('#syxpop [data-sxk="kit"]')?.disabled && /^K64$/.test($1(syxValue("kit", "to"))?.textContent || "") && /^H16$/.test($1(syxValue("pattern", "to"))?.textContent || ""), "kits to " + $1(syxValue("kit", "to"))?.textContent), within: 6000 },
			{ say: "⇧-click the kits' last slot twice (K62); wheel the songs to S01 to S02; tick Songs and Globals", act: async u => {
				u.click(syxValue("kit", "to"), { shift: true }); u.click(syxValue("kit", "to"), { shift: true }); await sleep(100);
				u.wheel(syxValue("song", "from"), -40); u.wheel(syxValue("song", "to"), -40); await sleep(100); u.wheel(syxValue("song", "to"), 1); await sleep(100);
				if (!$1('#syxpop [data-sxk="song"]').checked) u.click('#syxpop [data-sxk="song"]'); u.click('#syxpop [data-sxk="global"]'); await sleep(100); },
				screen: () => ok($1(syxValue("kit", "to"))?.textContent === "K62" && $1('#syxpop [data-sxk="song"]').checked && $1('#syxpop [data-sxk="global"]').checked
					&& /Kits K01–K62 · Patterns A01–H16 · Songs S01–S02 · Globals/.test($1("#syxpop .syxsum")?.textContent || ""), "summary " + $1("#syxpop .syxsum")?.textContent) },
			{ say: "click Save .syx…: just those are written, two songs among them", act: (u, c) => { c.n = syxNews.length; u.click('#syxpop [data-syxgo="save"]'); },
				screen: c => { const m = syxNews.length > c.n && lastExport(); return ok(!!m && m.ok && /62 kits, 128 patterns, 2 songs, 1 global\./.test(m.text) && $1("#syxpop").hidden, m ? m.text : "no export yet"); }, within: 8000 }
		],
		async tidy() { $1("#syxpop").hidden = true; }
	};
	const syxVerify = {
		name: "md-lib-syx-verify", proves: ["MD-184", "MD-X13"],
		needs: syxWanted,
		steps: [
			openImport,
			{ say: "click Verify only: the slots are read and compared, nothing is written", act: (u, c) => { c.k0 = kitName(0); u.click('#syxpop [data-syxgo="verify"]'); },
				screen: () => ok(/^Verify only: \d+ of \d+ the same/.test($1("#syxpop .syxsum")?.textContent || "") && /Nothing was written/.test($1("#syxpop .syxsum")?.textContent || ""), "progress: " + ($1("#syxpop .syxsum, #syxpop .syxbar span")?.textContent || "")),
				machine: c => ok(kitName(0) === c.k0, `K01 "${kitName(0)}" (before "${c.k0}")`), within: 60000 },
			{ say: "the file's kits differ from the machine's: the grid marks them ≠ and the summary does not say all the same", act: () => {},
				screen: () => { const outs = $all("#syxpop [data-syxout]").map(d => d.dataset.syxout), s = $1("#syxpop .syxsum")?.textContent || "", m = s.match(/(\d+) of (\d+) the same/);
					return ok(outs.includes("differs") && !!m && +m[1] < +m[2], outs.join(" ") + " / " + s); } },
			{ say: "the grid marks what differs (≠) and what is the same (=)", act: () => {},
				screen: () => ok($all("#syxpop [data-syxout]").length > 0 && $all("#syxpop [data-syxout]").every(d => ["same", "differs", "unknown", "no reply"].includes(d.dataset.syxout)), $all("#syxpop [data-syxout]").map(d => d.dataset.syxout).join(" ")) },
			{ say: "click Done: the panel closes", act: u => u.click('#syxpop [data-syxgo="close"]'), screen: () => ok($1("#syxpop").hidden, "still open") }
		],
		async tidy() { $1("#syxpop").hidden = true; }
	};
	const syxPlace = {
		name: "md-lib-syx-place", proves: ["MD-183", "MD-184", "MD-X13"],
		needs: syxWanted,
		steps: [
			openImport,
			{ say: "click Specific place: the kits start at the file's first (K01)", act: u => u.click('#syxpop [data-sxp="specific"]'),
				screen: () => ok(!!$1(syxValue("kit", "place")) && $1(syxValue("kit", "place")).textContent === "K01", "first " + $1(syxValue("kit", "place"))?.textContent) },
			{ say: "click the first slot four times: K05; the grid shows the kits landing in K05 and K06", act: async u => { for (let i = 0; i < 4; i++) { u.click(syxValue("kit", "place")); await sleep(60); } },
				screen: () => ok($1(syxValue("kit", "place"))?.textContent === "K05" && !!$1(syxCell("kit:4")) && !!$1(syxCell("kit:5")) && !$1(syxCell("kit:0")) && /from K0[12]/.test($1(syxCell("kit:4"))?.dataset.syxtip || ""),
					"cells " + $all('#syxpop button[data-syxitem^="kit:"]').map(b => b.dataset.syxitem).join(" ")), within: 4000 },
			{ say: "leave Kits ticked only, click Import: it asks first (the file's kits land on K05 and on, which hold kits)", act: async (u, c) => { await syxKinds(["kit"])(u); c.names = $all('#syxpop button[data-syxitem^="kit:"]').map(b => [+b.dataset.syxitem.split(":")[1], (b.dataset.syxname || "").trim()]); c.k0 = kitName(0);
					/* an import has no undo: the kits it overwrites are kept first (keepMany) and back() in the tidy puts them back */
					await keepMany(c, "kit", c.names.map(([k]) => k)); u.click('#syxpop [data-syxgo="start"]'); },
				screen: c => ok(dlgShown() && /K05/.test($1("#dlg").textContent) && !!dlgButton(`Import ${c.names.length}`), `no question for ${c.names.length} kits: ` + ($1("#dlg").textContent || "").slice(0, 80)) },
			{ say: "click Import n: sent to K05 and on, read back, reported", act: (u, c) => u.click(dlgButton(`Import ${c.names.length}`)),
				screen: c => ok(new RegExp(`${c.names.length} imported`).test($1("#syxpop .syxsum")?.textContent || ""), "progress: " + ($1("#syxpop .syxsum, #syxpop .syxbar span")?.textContent || "")),
				machine: c => ok(c.names.every(([k, n]) => kitName(k) === n) && kitName(0) === c.k0, c.names.map(([k, n]) => `K${k + 1} "${kitName(k)}" want "${n}"`).join(", ") + `; K01 "${kitName(0)}"`), within: 60000 },
			{ say: "click Done, Import SysEx… again, Specific place from K05, Verify only: the same", act: async u => {
				u.click('#syxpop [data-syxgo="close"]'); await sleep(200); await u.pick("engsel", "import"); await until(() => !!$1('#syxpop [data-sxp="specific"]'), 6000);
				await syxKinds(["kit"])(u); u.click('#syxpop [data-syxtab="kit"]'); await sleep(100); u.click('#syxpop [data-sxp="specific"]'); await sleep(200);
				for (let i = 0; i < 4; i++) { u.click(syxValue("kit", "place")); await sleep(60); }
				await until(() => !!$1(syxCell("kit:4")), 3000); u.click('#syxpop [data-syxgo="verify"]'); },
				screen: c => ok(new RegExp(`^Verify only: ${c.names.length} of ${c.names.length} the same`).test($1("#syxpop .syxsum")?.textContent || ""), "report " + ($1("#syxpop .syxsum, #syxpop .syxbar span")?.textContent || "")), within: 60000 },
			{ say: "click Done: the panel closes", act: u => u.click('#syxpop [data-syxgo="close"]'), screen: () => ok($1("#syxpop").hidden, "still open") }
		],
		async tidy(u, c) { if (dlgShown()) dlgButton("Cancel")?.click(); $1("#syxpop").hidden = true; await back(u, c); }
	};
	/* Reset machine… > Empty reset: two questions, then every kit, pattern and song cleared and read back. It empties the
	   machine: the last journey of all */
	const resetEmpty = {
		name: "md-engine-reset-empty", alone: true, proves: ["MD-203"],
		steps: [
			{ say: "choose RESET MACHINE… in the engine menu: what each reset destroys; Cancel is the default", act: u => u.pick("engsel", "reset"),
				screen: () => ok(dlgShown() && !!dlgButton("Empty reset…") && !!dlgButton("Factory reset…") && !!dlgButton("Export SysEx…") && $1("#dlg .btnrow button:last-child")?.textContent === "Cancel", "the question: " + ($1("#dlg").textContent || "").slice(0, 80)) },
			{ say: "click Empty reset…: it asks a second time", act: u => u.click(dlgButton("Empty reset…")),
				screen: () => ok(dlgShown() && !!dlgButton("Clear everything") && /no undo/.test($1("#dlg").textContent), "second question: " + ($1("#dlg").textContent || "").slice(0, 80)) },
			{ say: "click Clear everything: the reset runs in the SysEx panel and reports", act: (u, c) => { c.g0 = JSON.stringify(Docs.global); u.click(dlgButton("Clear everything")); },
				screen: () => ok(/Empty reset/.test($1("#syxpop .cap")?.textContent || "") && /cleared/.test($1("#syxpop .syxsum")?.textContent || ""), "panel: " + ($1("#syxpop .cap")?.textContent || "") + " " + ($1("#syxpop .syxsum, #syxpop .syxbar span")?.textContent || "")),
				machine: c => { const named = [...Array(64).keys()].filter(k => kitName(k)), trigs = [...Array(128).keys()].filter(p => (Docs.patterns[p]?.tracks || []).some(t => t.trigs.length)), songs = [...Array(32).keys()].filter(s => (Docs.songs[s]?.rows || []).length > 1);
					/* the machine's own empty pattern (16 steps, 1x, kit 1, no swing), and the global as it was */
					const odd = [...Array(128).keys()].filter(p => { const d = Docs.patterns[p]; return !d || d.length !== 16 || ![0, "1X"].includes(d.tempoMultiplier) || d.kit !== 0 || d.swingAmount !== 0; });
					return ok(!named.length && !trigs.length && !songs.length && !odd.length && JSON.stringify(Docs.global) === c.g0,
						`${named.length} kits named, ${trigs.length} patterns with trigs, ${songs.length} songs with rows, ${odd.length} patterns not as the machine's empty one (${odd.slice(0, 3).map(p => JSON.stringify([Docs.patterns[p]?.length, Docs.patterns[p]?.tempoMultiplier, Docs.patterns[p]?.kit, Docs.patterns[p]?.swingAmount])).join(" ")}), global ${JSON.stringify(Docs.global) === c.g0 ? "kept" : "changed"}`); }, within: 240000 },
			{ say: "click Done: the panel closes", act: u => u.click('#syxpop [data-syxgo="close"]'), screen: () => ok($1("#syxpop").hidden, "still open") }
		],
		async tidy() { if (dlgShown()) dlgButton("Cancel")?.click(); $1("#syxpop").hidden = true; }
	};
	/* Reset machine… > Factory reset (P6): a second machine from the run's ROM, read (seconds), then every kit, pattern and
	   song sent and read back (minutes): the factory kits 1-4 are TRX UW, EFM UW, E12 UW, P-I UW (mdFactorySourceFirmwareTest).
	   A kit cleared first shows the restore (the run's machine may hold the factory kits already). The plug-in only */
	const FACTORY_KITS = ["TRX UW", "EFM UW", "E12 UW", "P-I UW"];
	const resetFactory = {
		name: "md-engine-reset-factory", proves: ["MD-204"],
		needs: () => window.gmDev ? "a second machine from the ROM: the plug-in only" : null,
		steps: [
			{ say: "clear a stored kit of the first four (not the one that plays): it is empty", act: (u, c) => { c.k = V.kit === 1 ? 2 : 1; cmd("kitClear", { k: c.k, force: true }); },
				machine: c => ok(!(kitName(c.k) || "").trim(), `K0${c.k + 1} "${kitName(c.k)}"`), within: 10000 },
			{ say: "choose RESET MACHINE…, click Factory reset…", act: async u => { await u.pick("engsel", "reset"); await until(dlgShown, 3000); u.click(dlgButton("Factory reset…")); },
				screen: () => ok(dlgShown() && !!dlgButton("Factory reset"), "second question: " + ($1("#dlg").textContent || "").slice(0, 80)) },
			{ say: "click Factory reset: the factory data is prepared, then sent, read back and reported", act: u => u.click(dlgButton("Factory reset")),
				screen: () => ok(/Factory reset/.test($1("#syxpop .cap")?.textContent || "") && /restored/.test($1("#syxpop .syxsum")?.textContent || ""), "news " + (syxNews.at(-1)?.text || "") + "; panel " + ($1("#syxpop .syxsum, #syxpop .syxbar span")?.textContent || "")),
				machine: () => ok(FACTORY_KITS.every((n, k) => (kitName(k) || "").trim() === n), [0, 1, 2, 3].map(k => kitName(k)).join(", ")), within: 600000 },
			{ say: "click Done: the panel closes", act: u => u.click('#syxpop [data-syxgo="close"]'), screen: () => ok($1("#syxpop").hidden, "still open") }
		],
		async tidy() { if (dlgShown()) dlgButton("Cancel")?.click(); $1("#syxpop").hidden = true; }
	};
	/* B-026: import a file with its globals, then mute on the rail and play: the machine must hold the mute (its memory,
	   not the page's wish). With the file's base channel OFF the M is refused, with the reason, and never lit. The file
	   is the run's (GEARMULATOR_MDMM_SYX_FILE; mdDeskFirmwareTest syxexport with SYX_BASE_CHANNEL makes one). */
	const syxImportMute = {
		name: "md-lib-syx-import-mute", alone: true, proves: ["MD-094", "MD-122", "MD-181"],
		needs: () => new URLSearchParams(location.search).get("syxfile") ? null : "no .syx for the run (GEARMULATOR_MDMM_SYX_FILE)",
		steps: [
			{ say: "choose IMPORT SYSEX… in the engine menu, tick Globals too", act: async u => { await u.pick("engsel", "import"); await until(() => !$1("#syxpop").hidden && $all("#syxpop [data-syxkind]").length, 8000); const g = $1('#syxpop [data-syxkind="global"]'); if (g && !g.checked) u.click(g); },
				screen: () => ok(!$1("#syxpop").hidden && !!$1('#syxpop [data-syxkind="global"]')?.checked, "no Globals in the preview"), within: 8000 },
			{ say: "click Import: sent, read back, reported", act: u => u.click('#syxpop [data-syxgo="start"]'), screen: () => ok(/imported/.test($1("#syxpop .syxsum")?.textContent || ""), "progress: " + ($1("#syxpop .syxbar span")?.textContent || "")), within: 180000 },
			{ say: "click Done, then the Sequence tab", act: async u => { u.click('#syxpop [data-syxgo="close"]'); await sleep(300); u.key("Escape"); await sleep(300); u.click(tab("seq")); },
				screen: () => onTab("seq"), machine: () => ok(!!Docs.global && desk().mutesSource === "memory", "global " + !!Docs.global + ", mutes from " + desk().mutesSource), within: 8000 },
			{ say: "click M on a track of the rail: its mute flips on the machine", act: (u, c) => { c.off = Docs.global.baseChannel > 12; c.m0 = mutes(); c.t = soundTracks().find(t => !c.m0.includes(t)) ?? soundTrack(); c.want = !c.m0.includes(c.t); u.click(railM(c.t)); },
				machine: c => ok(c.off ? same(mutes(), c.m0) : mutes().includes(c.t) === c.want, `base ${Docs.global.baseChannel}, track ${c.t}, machine mutes ${mutes()} (before ${c.m0})`),
				screen: c => ok(pressed(railM(c.t)) === (c.off ? c.m0.includes(c.t) : c.want), "M " + (pressed(railM(c.t)) ? "lit" : "not lit")), within: 6000 },
			{ say: "press PLAY: the mute holds", act: u => { tele.steps = []; u.click("#play"); },
				machine: c => ok(new Set(tele.steps).size >= 4 && (c.off ? same(mutes(), c.m0) : mutes().includes(c.t) === c.want), `machine mutes ${mutes()}, steps ${tele.steps.length}`),
				screen: c => ok(pressed(railM(c.t)) === (c.off ? c.m0.includes(c.t) : c.want), "M " + (pressed(railM(c.t)) ? "lit" : "not lit")), within: 8000 },
			{ say: "press STOP", act: u => u.click("#play"), machine: () => ok(tele.last && !tele.last.playing, "still playing") },
			/* B-031: after an import the pattern still changes, stopped and playing */
			{ say: "click › next to the pattern: the machine selects it (stopped)", act: async (u, c) => { c.p0 = currentPatternSlot(); u.click("#patNext"); await confirmIfAsked(u); },
				machine: c => ok(currentPatternSlot() === c.p0 + 1, "machine pattern " + currentPatternSlot()), within: 6000 },
			{ say: "press PLAY, click ‹: the machine moves to it at the pattern's end (playing)", act: async u => { u.click("#play"); await sleep(500); u.click("#patPrev"); await confirmIfAsked(u); },
				machine: c => ok(currentPatternSlot() === c.p0 && V.playing, "machine pattern " + currentPatternSlot() + (V.playing ? ", playing" : ", stopped")), within: 15000 },
			{ say: "press STOP", act: u => u.click("#play"), machine: () => ok(tele.last && !tele.last.playing, "still playing") }
		],
		async tidy(u, c) { if (V.playing) u.click("#play"); await sleep(300); if (c.t != null && !c.off && mutes().includes(c.t) !== c.m0.includes(c.t)) u.click(railM(c.t)); await sleep(500); }
	};
	/* 0.3.5, 0.6: the Song page's PATTERN · CHAIN · SONG keys: PATTERN and SONG set the machine's mode, what is lit follows the status the machine reports */
	const songModeJ = {
		name: "md-song-mode", proves: ["MD-017"],
		steps: [
			go("song"),
			{ say: "click SONG next to Plays: the machine reports song mode", act: (u, c) => { c.m0 = machineState().songMode === true; u.click('[data-set="songpick"] button[data-v="song"]'); },
				machine: () => ok(machineState().songMode === true, "songMode " + machineState().songMode), screen: () => ok(pressed('[data-set="songpick"] button[data-v="song"]') && !pressed('[data-set="songpick"] button[data-v="pattern"]'), "SONG not lit"), within: 6000 },
			{ say: "click PATTERN: the machine reports pattern mode", act: u => u.click('[data-set="songpick"] button[data-v="pattern"]'),
				machine: () => ok(machineState().songMode === false, "songMode " + machineState().songMode), screen: () => ok(pressed('[data-set="songpick"] button[data-v="pattern"]') && !pressed('[data-set="songpick"] button[data-v="song"]'), "PATTERN not lit"), within: 6000 }
		],
		async tidy(u, c) { if (c.m0 && machineState().songMode !== true) { u.click('[data-set="songpick"] button[data-v="song"]'); await sleep(1500); } }
	};
	/* 0.3.5: the Song page's playhead. An empty song slot (the song slots' Load) gets two rows, A01 and A02; SONG mode,
	   PLAY: the arrangement marks the row the machine plays (telemetry songRow, RAM), the What plays line and the LCD
	   say it, and the mark moves on to the next row; STOP takes it away. The steps are shared with the screenshots. */
	const emptySong = () => { const cur = V.songSlot; for (let d = 1; d < 32; d++) for (const s of [(cur + d) % 32, (cur - d + 32) % 32]) { const g = Docs.songs[s]; if (g && g.rows.length === 1 && g.rows[0].kind === "end") return s; } return null; };
	const songTo = async (u, s) => { if (V.songSlot === s) return; u.click(`[data-ss="${s}"]`); await sleep(200); u.click('[data-sa="load"]'); await until(() => V.songSlot === s, 4000); };
	/* the LCD's box and the places of its fields (0.3.5: the same in PATTERN and SONG mode) */
	const lcdGeo = () => [$1(".lcdpanel"), $1('#lcd2 [data-l2="seqmode"]'), $1("#kitname"), $1("#bpm")].map(e => { const r = e?.getBoundingClientRect(); return r ? `${Math.round(r.left)}/${Math.round(r.width)}` : "-"; }).join(" ");
	const marked = c => { const i = $1("#tl .scell.ph")?.dataset.i; if (i != null) c.seen.add(+i); return [...c.seen].join(","); };
	const songPlayheadSteps = shot => [
		go("song"),
		{ say: "stop, then pick an empty song in the song slots (click it, Load)", act: async (u, c) => { if (V.playing) { u.click("#play"); await until(() => !V.playing, 3000); } c.s0 = V.songSlot; c.m0 = V.songMode; await until(() => Object.keys(Docs.songs).length >= 32, 20000); c.s = emptySong(); if (c.s == null) throw new Error("no empty song slot"); await songTo(u, c.s); },
			screen: c => ok(V.songSlot === c.s, "song " + (V.songSlot + 1)), machine: c => ok(songSlotOf(Docs) === c.s, "machine song " + (songSlotOf(Docs) + 1)), within: 20000 },
		{ say: "Arrange: click pads A01 and A02, two rows", act: async u => { u.click('[data-set="songpick"] button[data-v="song"]'); await sleep(200); u.click('[data-addpat="0"]'); await until(() => songRows().length === 2, 4000); u.click('[data-addpat="1"]'); },
			machine: () => ok(songRows().length === 3 && songRows()[0].pattern === 0 && songRows()[1].pattern === 1, "rows " + songRows().map(r => r.kind === "pattern" ? r.pattern : r.kind).join(",")), within: 8000 },
		{ say: "click PATTERN: the header says pattern mode, the grid looks as ever, no reload asked", act: async u => { u.click('[data-set="songpick"] button[data-v="pattern"]'); await until(() => V.songMode === false, 4000); await sleep(400); shot("song-1-pattern-mode"); },
			screen: c => ok(!!$1(".songui.patmode") && pressed('[data-set="songpick"] button[data-v="pattern"]') && /^PATTERN /.test($1("#songPlays")?.textContent || "") && /pattern mode/i.test($1("#arrstate")?.textContent || "")
				&& !$1("[data-reloadsong]") && (c.geo = lcdGeo()), `plays ${$1("#songPlays")?.textContent}; header ${$1("#arrstate")?.textContent}; reload ${!!$1("[data-reloadsong]")}`), machine: () => ok(V.songMode === false, "songMode " + V.songMode), within: 8000 },
		{ say: "click SONG: the LCD keeps its size and every field its place; the desk loads the edited song by itself", act: async u => { u.click('[data-set="songpick"] button[data-v="song"]'); await until(() => V.songMode === true, 4000); await sleep(400); shot("song-2-song-mode-stopped"); },
			screen: c => ok(!!$1(".songui.songmode") && pressed('[data-set="songpick"] button[data-v="song"]') && $1("#lcd2 [data-l2=seqmode] b")?.textContent === "SONG" && lcdGeo() === c.geo && /song mode/i.test($1("#arrstate")?.textContent || "") && !$1("[data-reloadsong]"),
				`LCD ${lcdGeo()} (was ${c.geo}); ${$1("#lcd2 [data-l2=seqmode]")?.textContent}; header ${$1("#arrstate")?.textContent}`),
			machine: () => ok(V.songMode === true && !V.songReload, "songMode " + V.songMode + ", reload needed " + V.songReload), within: 8000 },
		{ say: "press PLAY (no Reload song): row 001 is marked, the edited song plays", act: (u, c) => { c.seen = new Set(); u.click("#play"); },
			screen: c => ok(marked(c).length > 0 && c.seen.has(0) && /row 001 of 2/.test($1("#songPlays")?.textContent || ""), `marked ${[...c.seen]}; plays ${$1("#songPlays")?.textContent}`), machine: () => ok(tele.last?.playing && tele.last.songRow === 0, `songRow ${tele.last?.songRow}, rows seen ${tele.rows.join(" ")}`), within: 8000 },
		{ say: "the mark moves on to row 002 (the LCD reads 01·002)", act: async (u, c) => { await until(() => (marked(c), c.seen.has(1)), 30000); await sleep(150); shot("song-3-song-playing"); },
			screen: c => ok((marked(c), c.seen.has(1)) && /·002$/.test($1("#pat")?.textContent || ""), `marked ${[...c.seen]}; LCD ${$1("#pat")?.textContent}`), machine: () => ok(tele.last?.songRow === 1, "songRow " + tele.last?.songRow), within: 30000 },
		{ say: "press STOP (or the song ends): no row is marked", act: u => { if (V.playing) u.click("#play"); }, screen: () => ok(!$1("#tl .scell.ph"), "still marked"), machine: () => ok(!V.playing, "playing") }
	];
	/* Review 1 (B-096, Radek: "loaded a song and can't play it"): song 1 from the slot list (Load), SONG, then ▶ and Space:
	   the machine plays the song (its telemetry) */
	const songFactoryPlay = {
		name: "md-song-load-play", proves: ["MD-017", "MD-144"],
		steps: [
			go("song"),
			{ say: "stop, select song 1 in the song slots, Load", act: async (u, c) => { if (V.playing) { u.click("#play"); await until(() => !V.playing, 3000); } c.s0 = V.songSlot; c.m0 = V.songMode; await until(() => Object.keys(Docs.songs).length >= 32, 20000); if (V.songSlot !== 0) { u.click('[data-ss="0"]'); await sleep(200); u.click('[data-sa="load"]'); } },
				machine: () => ok(songSlotOf(Docs) === 0, "machine song " + (songSlotOf(Docs) + 1)), within: 20000 },
			{ say: "click SONG", act: u => u.click('[data-set="songpick"] button[data-v="song"]'), machine: () => ok(V.songMode === true, "songMode " + V.songMode), within: 6000 },
			{ say: "click ▶: the song plays", act: u => u.click("#play"), machine: () => ok(!!tele.last?.playing && tele.last.songRow >= 0, `playing ${tele.last?.playing}, songRow ${tele.last?.songRow}`), within: 6000 },
			{ say: "click ▶ again: stopped", act: u => u.click("#play"), machine: () => ok(!tele.last?.playing, "still playing"), within: 6000 },
			{ say: "press Space: the song plays again", act: u => { document.activeElement?.blur?.(); u.key(" "); }, machine: () => ok(!!tele.last?.playing, `playing ${tele.last?.playing}`), within: 6000 },
			{ say: "press Space: stopped", act: u => u.key(" "), machine: () => ok(!tele.last?.playing, "still playing"), within: 6000 }
		],
		async tidy(u, c) { if (V.playing) { u.click("#play"); await until(() => !V.playing, 3000); } if (c.m0 === false && V.songMode) { u.click('[data-set="songpick"] button[data-v="pattern"]'); await sleep(800); } }
	};
	const songPlayheadTidy = async (u, c) => {
		if (V.playing) { u.click("#play"); await until(() => !V.playing, 3000); }
		if (c.s != null && V.songSlot === c.s) await undoUntil(u, () => songRows().length === 1, 4);
		if (c.s0 != null) await songTo(u, c.s0);
		if (c.m0 != null && V.songMode !== c.m0) { u.click(`[data-set="songpick"] button[data-v="${c.m0 ? "song" : "pattern"}"]`); await sleep(1000); }
		/* the song's rows and the slots cleared to make room: their undo steps back, so each slot holds again what it held */
		await undoTo(u, c.back0.undo);
	};
	/* 0.6 wave 1: the song slots. Three empty slots A, B, C and D are the person's scratch: A gets rows (the SONG key, pads A01 and
	   A02) and a name (F2), is copied to B (Copy, Paste), dragged onto C, saved to D with a name (Save to...); Clear asks before it
	   removes what a slot holds; Save of an edited song the machine has not loaded asks and offers Load, then save. Tidy clears
	   them again and puts the machine's song and mode back. */
	const sameSong = (a, b) => !!a && !!b && JSON.stringify(a.rows) === JSON.stringify(b.rows);
	const empties = n => { const out = []; for (let s = 0; s < 32 && out.length < n; s++) { const g = Docs.songs[s]; if (g && g.rows.length === 1 && g.rows[0].kind === "end" && !kitNameText(g.name) && s !== V.songSlot) out.push(s); } return out; };
	/* four slots to work in: empty ones, else the last ones that are not the machine's song, cleared first (the page
	   tier's fixture has a song in every slot) */
	const scratch = async () => {
		let out = empties(4);
		if (out.length >= 4) return out;
		out = []; for (let s = 31; s >= 0 && out.length < 4; s--) if (s !== V.songSlot) out.push(s);
		out.reverse();
		for (const s of out) cmd("songClear", { s, force: true });
		await until(() => out.every(s => Docs.songs[s]?.rows.length === 1 && !kitNameText(Docs.songs[s].name)), 8000);
		return out;
	};
	const slotEl = s => `[data-ss="${s}"]`;
	const songSlots = {
		name: "md-song-slots", proves: ["MD-144", "MD-158", "MD-159", "MD-292", "MD-294", "MD-X22"],
		steps: [
			go("song"),
			{ say: "stop; click an empty song slot: it is only selected, the machine's song stays", act: async (u, c) => {
				if (V.playing) { u.click("#play"); await until(() => !V.playing, 3000); }
				await until(() => Object.keys(Docs.songs).length >= 32, 20000);
				c.s0 = V.songSlot; c.m0 = V.songMode; c.slots = await scratch(); if (c.slots.length < 4) throw new Error("fewer than four song slots to work in");
				u.click(slotEl(c.slots[0])); await sleep(300); },
				screen: c => ok($1(slotEl(c.slots[0]))?.getAttribute("aria-selected") === "true" && $1(slotEl(c.slots[0])).classList.contains("empty") && $1('[data-sa="paste"]')?.disabled, "slot " + $1(slotEl(c.slots[0]))?.className),
				machine: c => ok(songSlotOf(Docs) === c.s0, "machine song " + (songSlotOf(Docs) + 1)), within: 20000 },
			{ say: "Load: the machine's song is A", act: (u, c) => u.click('[data-sa="load"]'),
				machine: c => ok(songSlotOf(Docs) === c.slots[0], "machine song " + (songSlotOf(Docs) + 1)), screen: c => ok($1(slotEl(c.slots[0]))?.classList.contains("cur"), "not lit"), within: 8000 },
			{ say: "click the SONG key and pads A01, A02: A gets two rows", act: async (u, c) => { u.click('[data-set="songpick"] button[data-v="song"]'); await sleep(300); u.click('[data-addpat="0"]'); await until(() => songRows().length === 2, 4000); u.click('[data-addpat="1"]'); },
				machine: () => ok(songRows().length === 3, "rows " + songRows().length), screen: c => ok(/2 rows/.test($1(slotEl(c.slots[0]))?.textContent || ""), $1(slotEl(c.slots[0]))?.textContent), within: 8000 },
			{ say: "press F2, type JOURNEY A, press Enter: A is named", act: async (u, c) => { u.click(slotEl(c.slots[0])); await sleep(250); u.key("F2"); await sleep(250); c.field = $1("#slin")?.value ?? "no field"; u.type("#slin", "journey a"); await sleep(100); u.key("Enter"); },
				machine: c => ok(Docs.songs[c.slots[0]]?.name === "JOURNEY A", `name "${Docs.songs[c.slots[0]]?.name}" (field was "${c.field}")`), screen: c => ok(/JOURNEY A/.test($1(slotEl(c.slots[0]))?.textContent || "") && !$1("#slin"), $1(slotEl(c.slots[0]))?.textContent), within: 8000 },
			{ say: "Copy A, select B, Paste: B holds the song, no question", act: async (u, c) => { u.click(slotEl(c.slots[0])); await sleep(200); u.click('[data-sa="copy"]'); await sleep(300); u.click(slotEl(c.slots[1])); await sleep(200); u.click('[data-sa="paste"]'); },
				machine: c => ok(sameSong(Docs.songs[c.slots[1]], Docs.songs[c.slots[0]]) && Docs.songs[c.slots[1]].name === "JOURNEY A" && machineState().clipboard?.song === c.slots[0], `B rows ${Docs.songs[c.slots[1]]?.rows.length}, clipboard ${machineState().clipboard?.song}`),
				screen: c => ok(!$1(slotEl(c.slots[1]))?.classList.contains("empty") && !dlgShown(), "B " + $1(slotEl(c.slots[1]))?.className + (dlgShown() ? ", a question" : "")), within: 8000 },
			{ say: "drag A onto the empty slot C: a copy", act: async (u, c) => { for (const k of [0, 2]) $1(slotEl(c.slots[k]))?.scrollIntoView({ block: "nearest" }); await sleep(100); await u.dragDrop(slotEl(c.slots[0]), slotEl(c.slots[2])); },
				machine: c => ok(sameSong(Docs.songs[c.slots[2]], Docs.songs[c.slots[0]]), `C rows ${Docs.songs[c.slots[2]]?.rows.length}`), within: 8000 },
			{ say: "select D, Save to... , type SAVED D, Enter: the machine's song, named, in D", act: async (u, c) => { u.click(slotEl(c.slots[3])); await sleep(250); u.click('[data-sa="saveas"]'); await sleep(250); u.type("#slin", "saved d"); await sleep(100); u.key("Enter"); },
				machine: c => ok(sameSong(Docs.songs[c.slots[3]], Docs.songs[c.slots[0]]) && Docs.songs[c.slots[3]].name === "SAVED D", `D "${Docs.songs[c.slots[3]]?.name}" rows ${Docs.songs[c.slots[3]]?.rows.length}`), within: 8000 },
			{ say: "select B, Clear: it asks first, and B still holds the song", act: async (u, c) => { u.click(slotEl(c.slots[1])); await sleep(250); u.click('[data-sa="clear"]'); await until(dlgShown, 3000); },
				screen: () => ok(dlgShown() && /Clear/.test($1("#dlg").textContent), "no question"), machine: c => ok(Docs.songs[c.slots[1]].rows.length > 1, "B emptied before the answer") },
			{ say: "answer Clear song: B is empty and quiet", act: u => u.click(dlgButton("Clear song") || $1("#dlg .danger")),
				machine: c => ok(Docs.songs[c.slots[1]].rows.length === 1 && !kitNameText(Docs.songs[c.slots[1]].name), `B rows ${Docs.songs[c.slots[1]]?.rows.length}`), screen: c => ok($1(slotEl(c.slots[1]))?.classList.contains("empty"), "B not quiet"), within: 8000 },
			{ say: "Cmd+Z: B holds the song again; Cmd+Shift+Z: empty again", act: async (u, c) => { u.key("z", { cmd: true }); await until(() => Docs.songs[c.slots[1]].rows.length > 1, 4000); c.back = Docs.songs[c.slots[1]].rows.length; u.key("z", { cmd: true, shift: true }); },
				machine: c => ok(c.back > 1 && Docs.songs[c.slots[1]].rows.length === 1, `B rows after undo ${c.back}, after redo ${Docs.songs[c.slots[1]]?.rows.length}`), within: 8000 },
			{ say: "click PATTERN, add a row (A03) to the machine's song by the grid's own command: the machine has not loaded it, Save asks and offers Load, then save",
				act: async (u, c) => { u.click('[data-set="songpick"] button[data-v="pattern"]'); await until(() => V.songMode === false, 4000); await sleep(300); c.n0 = songRows().length; songCmd("rowInsert", { i: 0, row: rowToContract({ pat: 2, rep: 1 }, patLen) }); await until(() => songRows().length === c.n0 + 1 && V.songReload, 6000); u.click('[data-sa="save"]'); await until(dlgShown, 3000); },
				screen: () => ok(dlgShown() && !!dlgButton("Load the edits, then save"), "no question or alternative: " + ($1("#dlg")?.textContent || "")), machine: c => ok(V.songReload === true, "reload needed " + V.songReload), within: 12000 },
			{ say: "answer Load the edits, then save: the machine has the song and no edit is waiting", act: u => u.click(dlgButton("Load the edits, then save")),
				machine: c => ok(V.songReload === false && songRows().length === c.n0 + 1, `reload ${V.songReload}, rows ${songRows().length}`), screen: () => ok(!dlgShown(), "dialog still open"), within: 10000 }
		],
		async tidy(u, c) {
			if (!c.slots) return;
			if (V.playing) { u.click("#play"); await until(() => !V.playing, 3000); }
			for (const s of c.slots) if (s !== V.songSlot) cmd("songClear", { s, force: true });
			await sleep(1500);
			if (c.s0 != null && V.songSlot !== c.s0) await songTo(u, c.s0);
			for (const s of c.slots) if (Docs.songs[s] && !(Docs.songs[s].rows.length === 1 && !kitNameText(Docs.songs[s].name))) cmd("songClear", { s, force: true });
			await sleep(1000);
			if (c.m0 != null && V.songMode !== c.m0) { u.click(`[data-set="songpick"] button[data-v="${c.m0 ? "song" : "pattern"}"]`); await sleep(1000); }
			/* the slots cleared to make room: their undo steps back */
			await undoTo(u, c.back0.undo);
		}
	};
	/* the palette's three keys: a pad click goes to the pattern, into the chain or into the song */
	const songKeys = {
		name: "md-song-keys", proves: ["MD-017"],
		steps: [
			go("song"),
			{ say: "click PATTERN: the machine plays patterns, no inspector, a pad click queues that pattern", act: async (u, c) => { c.m0 = V.songMode; c.p0 = V.pat; u.click('[data-set="songpick"] button[data-v="pattern"]'); await until(() => V.songMode === false, 4000); await sleep(300); u.click('[data-bank="0"]'); await sleep(200); c.p = c.p0 === 5 ? 6 : 5; u.click(`[data-patgo="${c.p}"]`); },
				screen: c => ok(pressed('[data-set="songpick"] button[data-v="pattern"]') && !$1(".insp") && !$1("[data-addpat]") && !$1("[data-chainpad]"), "keys/inspector: " + $all('[data-set="songpick"] button').map(b => b.dataset.v + b.getAttribute("aria-pressed")).join(" ") + (!!$1(".insp") ? " inspector" : "")),
				machine: c => ok(V.pat === c.p || V.queued === c.p, `pattern ${V.pat}, queued ${V.queued}`), within: 8000 },
			{ say: "click CHAIN: the pads number the chain, the machine stays in pattern mode", act: u => u.click('[data-set="songpick"] button[data-v="chain"]'),
				screen: () => ok(pressed('[data-set="songpick"] button[data-v="chain"]') && !!$1("[data-chainpad]") && !$1(".insp"), "no chain pads"), machine: () => ok(V.songMode === false, "songMode " + V.songMode) },
			{ say: "click SONG: the machine is in song mode, the pads add rows, the selected row shows", act: u => u.click('[data-set="songpick"] button[data-v="song"]'),
				screen: () => ok(pressed('[data-set="songpick"] button[data-v="song"]') && !!$1("[data-addpat]") && !!$1(".insp") && !!$1(".songui.songmode"), "SONG state"), machine: () => ok(V.songMode === true, "songMode " + V.songMode), within: 8000 }
		],
		async tidy(u, c) {
			if (c.p0 != null && V.pat !== c.p0) { cmd("select", { p: c.p0, now: true }); await sleep(800); }
			if (c.m0 != null && V.songMode !== c.m0) { u.click(`[data-set="songpick"] button[data-v="${c.m0 ? "song" : "pattern"}"]`); await sleep(1000); }
		}
	};
	/* the Song page with its slots as screenshots for a design review (scripts/mdmm-shots.sh with MDMM_SHOTS_JOURNEY=md-shots-song-slots) */
	const shotsSongSlots = { name: "md-shots-song-slots", proves: [], needs: () => /md-shots/.test(location.search) ? null : "screenshots only when asked by name",
		steps: [go("song"),
			{ say: "SONG key, a slot selected", act: async u => { await until(() => Object.keys(Docs.songs).length >= 32, 20000); u.click('[data-set="songpick"] button[data-v="song"]'); await sleep(600); u.click('[data-ss="3"]'); await sleep(600); Bridge.log("SHOT songslots-song"); }, hold: 2500 },
			{ say: "CHAIN key", act: async u => { u.click('[data-set="songpick"] button[data-v="chain"]'); await sleep(800); Bridge.log("SHOT songslots-chain"); }, hold: 2500 },
			{ say: "PATTERN key", act: async u => { u.click('[data-set="songpick"] button[data-v="pattern"]'); await sleep(800); Bridge.log("SHOT songslots-pattern"); }, hold: 2500 },
			{ say: "done", act: () => Bridge.log("SHOT done") }] };
	const songPlayhead = { name: "md-song-playhead", proves: ["MD-017", "MD-145", "MD-147"], steps: songPlayheadSteps(() => { }), tidy: songPlayheadTidy };
	/* the same, as screenshots for a design review (scripts/mdmm-shots.sh with MDMM_SHOTS_JOURNEY=md-shots-song) */
	const shotsSong = { name: "md-shots-song", proves: [], needs: () => /md-shots/.test(location.search) ? null : "screenshots only when asked by name",
		steps: [...songPlayheadSteps(name => Bridge.log("SHOT " + name)).map(s => s.act && /SHOT|shot/.test(String(s.act)) ? Object.assign({}, s, { hold: 2500 }) : s), { say: "done", act: () => Bridge.log("SHOT done") }], tidy: songPlayheadTidy };
	/* the SysEx import panel as screenshots for a design review (scripts/mdmm-shots.sh with MDMM_SHOTS_JOURNEY=md-shots-import
	   and GEARMULATOR_MDMM_SYX_FILE): the preview's tabs, then kits, patterns and songs imported (importing, the report) */
	/* B-051: the GLOBAL panel as a screenshot (scripts/mdmm-shots.sh with MDMM_SHOTS_JOURNEY=md-shots-global) */
	const shotsGlobal = { name: "md-shots-global", proves: [], needs: () => !/md-shots/.test(location.search) ? "screenshots only when asked by name" : null,
		steps: [{ say: "open GLOBAL", act: async u => { await u.pick("engsel", "global"); await sleep(800); shot("global-md"); }, screen: () => ok(!$1("#globpop").hidden, "closed"), hold },
			{ say: "Esc", act: u => { u.key("Escape"); shot("done"); } }] };
	/* Review 1 (B-097): the lock parameter keys of every track's machine fit (names without SYN· / RTG·, counts beside) */
	const lockKeysFit = Journey.lockKeysJourney("md-lock-keys-fit", [go("seq"),
		{ say: "each track in turn: its lock parameter keys", act: async (u, c) => { c.bad = []; for (let t = 0; t < 16; t++) { u.click(rail(t)); await sleep(150); const x = Journey.lockKeysCut(); if (x) c.bad.push(`T${t + 1} ${V.tracks[t].m}: ${x}`); } u.click(rail(0)); await sleep(150); },
			screen: c => ok(!c.bad.length, c.bad.join(" | ")) }]);
	/* Review 1 (Radek, 2026-10-12, B-094): every modal locks: a click outside keeps each kind open, Esc closes it */
	const modalLock = Journey.modalLockJourney("md-modal-lock", [
		{ name: "GLOBAL", sel: "#globpop", open: u => u.click("#globkey") },
		{ name: "the kit library", sel: "#libpop", open: u => u.click("#kitf") },
		{ name: "the keys", sel: "#keyspop", open: u => { blur(); u.key("?", { shift: true }); } },
		{ name: "AUDIO / MIDI", sel: "#audiopop", open: u => { blur(); u.key(","); } },
		{ name: "Export SysEx", sel: "#syxpop", open: u => u.pick("engsel", "export") },
		{ name: "the machine picker", sel: "#machpop", open: async u => { u.click(tab("sound")); await sleep(300); u.click("#machbtn"); } },
		{ name: "a question (Reset machine…)", sel: "#dlg", open: u => u.pick("engsel", "reset") }
	]);
	/* Review 1 (B-094, B-095): an import at work stays in reach and keeps one size (as mm-syx-running-reach). It writes
	   the file's kits: last in the list */
	const syxRunningReach = {
		name: "md-syx-running-reach", proves: [], needs: () => syxWanted(),
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
				Bridge.log(`JOURNEY ${"md"}-syx-running-reach: Esc ${c.runningAtEsc ? "while it ran" : "after it ended"}`); },
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
	/* Radek's 0.6 review 1 (2026-10-12) as snapshots (scripts/mdmm-snap.py): the MKI light plate's Sequence and Sound,
	   GLOBAL as a modal */
	const shotsReview = { name: "md-shots-review", proves: [], needs: () => !/md-shots/.test(location.search) ? "screenshots only when asked by name" : null,
		steps: [{ say: "MKI", act: async u => { if (document.documentElement.dataset.plate === "mk2") u.click("#platekey"); await sleep(400); } },
			go("seq"), { say: "Sequence", act: async () => { await sleep(600); Journey.snapshot("review-md-seq"); } },
			go("sound"), { say: "Sound", act: async () => { await sleep(600); Journey.snapshot("review-md-sound"); } },
			{ say: "GLOBAL", act: async u => { u.click("#globkey"); await sleep(800); Journey.snapshot("review-md-global"); u.key("Escape"); await sleep(300); } }] };
	/* 0.5 slice 5: the Sound page and the GEN bar as screenshots, beside the Monomachine Editor's (mm-shots-sound) */
	const shotsSound = { name: "md-shots-sound", proves: [], needs: () => !/md-shots/.test(location.search) ? "screenshots only when asked by name" : null,
		steps: [go("sound"), sel(() => soundTrack()),
			{ say: "the Sound page", act: async () => { await sleep(800); shot("sound-md"); Journey.snapshot("sound-md"); Bridge.log("MEASURE sound-md screens " + [...document.querySelectorAll(".snd .sg>.plot")].map(e => Math.round(e.getBoundingClientRect().height)).join(" ") + " page " + Math.round(document.querySelector(".snd").scrollHeight) + "/" + Math.round(document.querySelector("#main").clientHeight)); }, hold },
			go("seq"),
			{ say: "the GEN bar", act: async () => { await sleep(800); shot("gen-md"); Journey.snapshot("gen-md"); }, hold },
			{ say: "done", act: () => shot("done") }] };
	const shotsImport = { name: "md-shots-import", alone: true, proves: [], needs: () => !/md-shots/.test(location.search) ? "screenshots only when asked by name" : syxImportJ.needs(),
		steps: [
			{ say: "choose IMPORT SYSEX… in the engine menu: the preview, the Kits tab", act: async u => { await u.pick("engsel", "import"); await until(() => syxKitIds().length > 0, 8000); await sleep(400); shot("import-1-md-kits"); },
				screen: () => ok(!$1("#syxpop").hidden && syxKitIds().length > 0, "no preview with kits"), within: 10000, hold },
			{ say: "the Patterns tab", act: async u => { u.click('#syxpop [data-syxtab="pattern"]'); await sleep(400); shot("import-2-md-patterns"); }, hold },
			{ say: "the Globals tab", act: async u => { u.click('#syxpop [data-syxtab="global"]'); await sleep(400); shot("import-3-md-globals"); }, hold },
			{ say: "click Import: importing", act: async u => { u.click('#syxpop [data-syxtab="pattern"]'); u.click('#syxpop [data-syxgo="start"]');
				await until(() => parseFloat($1("#syxpop .syxbar i")?.style.width || "0") > 30, 120000); shot("import-4-md-importing"); },
				screen: () => ok(!!$1("#syxpop .syxbar") || !!$1("#syxpop .syxsum"), "not importing"), within: 125000, hold: 1500 },
			{ say: "the report", act: async () => { await until(() => !!$1("#syxpop .syxsum"), 400000); await sleep(500); shot("import-5-md-report"); },
				screen: () => ok(/imported/.test($1("#syxpop .syxsum")?.textContent || ""), "no report"), within: 405000, hold },
			{ say: "the report, the Patterns tab", act: async u => { u.click('#syxpop [data-syxtab="pattern"]'); await sleep(400); shot("import-6-md-report-patterns"); }, hold },
			{ say: "click Done", act: u => { u.click('#syxpop .syxfoot [data-syxgo="close"]'); shot("done"); }, screen: () => ok($1("#syxpop").hidden, "still open") },
			esc
		] };
	/* I-008: the editor's menu (shared/deskJourney.js editorMenuJourney: a submenu by the keyboard, a zoom step and
	   Updates › Check Daily by the pointer, each read back from the plug-in) */
	const editorMenuJ = Journey.editorMenuJourney("md-top-editor-menu", "Machinedrum Editor", { proves: ["MD-X17"] });
	const memoryJ = Journey.memoryJourney("md-engine-memory", { proves: ["MD-X01"] });
	/* I-018: the CPU meter beside the version and its details (shared/deskJourney.js cpuMeterJourneys) */
	const cpuJs = [...Journey.cpuMeterJourneys("md", { proves: ["MD-X15"] }), Journey.speedUpsMenuJourney("md", { proves: ["MD-X15"] })];
	/* I-021: the stereo output meter and volume at the LCD's right end (shared/deskJourney.js volumeJourneys) */
	const volJs = [...Journey.volumeJourneys("md", { proves: ["MD-X16"] }), ...Journey.fitJourneys("md", ["seq", "sound", "mix", "sampler", "song"])];
	const menu = Journey.menu;
	/* the same menu as screenshots for a design review (scripts/mdmm-shots.sh with MDMM_SHOTS_JOURNEY=md-shots-menu) */
	const shotsMenu = {
		name: "md-shots-menu", proves: [], needs: () => /md-shots/.test(location.search) ? null : "screenshots only when asked by name",
		steps: [
			{ say: "the editor's menu", act: async u => { await menu.via(u); await sleep(300); shot("menu-1-open"); }, screen: () => menu.titled("Machinedrum Editor"), hold },
			{ say: "its Zoom submenu", act: async u => { u.click(menu.id("zoom")); await sleep(300); shot("menu-2-zoom"); }, screen: () => ok(DeskMenu.depth() === 2, "no submenu"), hold },
			{ say: "Zoom › Window Size", act: async u => { u.click(menu.id("window-size")); await sleep(300); shot("menu-3-window-size"); }, screen: () => ok(DeskMenu.depth() === 3, "no submenu"), hold },
			{ say: "Developer", act: async u => { u.click(menu.id("developer")); await sleep(300); shot("menu-4-developer"); }, screen: () => ok(DeskMenu.depth() === 2, "no submenu"), hold },
			{ say: "done", act: async () => { closeDeskMenu(); shot("done"); } }
		],
		async tidy() { if (menu.on()) closeDeskMenu(); }
	};
	/* B-054: every view, as macOS 12's WebKit 15 lays it out (Journey.viewJourneys: md-old-webkit in every run,
	   md-shots-views for scripts/mdmm-snap.py --safari15) */
	const ws = (name, extra) => ({ name, open: async u => { u.click(tab(name)); await until(() => S.ws === name, 3000); if (extra) await extra(u); } });
	const esc1 = async u => { u.key("Escape"); await sleep(200); };
	const viewJs = Journey.viewJourneys("md", [
		ws("seq"), ws("sound", async u => { u.click(rail(soundTrack())); }), ws("mix"), ws("sampler"), ws("song"),
		{ name: "kits", open: u => u.click("#kitf"), close: esc1 },
		{ name: "patterns", open: u => u.click("#pat"), close: esc1 },
		{ name: "global", open: u => u.pick("engsel", "global"), close: esc1 },
		{ name: "audio", needs: () => { const o = $1('#engsel option[value="audio"]'); return o && !o.hidden && !o.disabled ? null : "no AUDIO / MIDI here (the plug-in in a host)"; }, open: u => u.pick("engsel", "audio"), close: esc1 },
		{ name: "syx-import", needs: syxImportJ.needs, open: async u => { await u.pick("engsel", "import"); await until(() => syxKitIds().length > 0, 8000); },
			close: async u => { $1('#syxpop [data-syxgo="close"]')?.click(); await sleep(200); await esc1(u); } },
		{ name: "keys", open: u => { document.activeElement?.blur?.(); u.key("?", { shift: true }); }, close: esc1 },
		{ name: "menu", open: u => menu.via(u), close: async () => closeDeskMenu() },
		{ name: "cpu", open: u => u.click("#cpumeter"), close: async () => closeDeskMenu() },
		{ name: "step-menu", open: async u => { u.click(tab("seq")); await sleep(300); const t = soundTracks().find(x => trigsOf(x).length) ?? soundTrack(); u.rightClick(cell(t, trigsOf(t)[0] ?? 0)); }, close: async () => closeDeskMenu() },
		{ name: "rom-card", open: u => u.pick("engsel", "rom"), close: async u => { u.click('#bootcard [data-bootrom="close"]'); await sleep(300); } }
	]);
	/* ---------- files dropped on the window (FOUNDATION.md, "Files dropped on the window") ---------- */
	/* A drop from the Finder cannot be played from the page. The run's own files are dropped at a point of the page
	   through the window's drop path from the native side on ("dropfiles <x> <y> syx|wav" in the page's log,
	   diagnostics builds: mdWebPageHost.cpp): the drop message, the page's choice, the window's command and the session
	   are the real ones; only AppKit's drag (mdWebFileDrop.mm) is not played. The files: GEARMULATOR_MDMM_SYX_FILE,
	   GEARMULATOR_MDMM_WAV_FILE. */
	const dropAt = (q, what) => { const r = $1(q).getBoundingClientRect();
		Bridge.log(`dropfiles ${Math.round(r.left + r.width / 2)} ${Math.round(r.top + r.height / 2)} ${what}`); };
	const dropSyxJ = {
		name: "md-drop-syx", proves: ["MD-181", "MD-X12"],
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
	/* alone: B-133 (a sample in by SDS leaves the machine's live recording deaf until it starts again), as md-sampler-rename */
	const dropSampleJ = {
		name: "md-drop-sample", alone: true, proves: ["MD-191", "MD-X12"],
		needs: () => new URLSearchParams(location.search).get("wavfile") ? null
			: "no sample for the run (GEARMULATOR_MDMM_WAV_FILE)",
		steps: [
			go("sampler"),
			{ say: "click an empty ROM slot (the last one if none is)", act: (u, c) => {
				const keys = $all(".slotk.rom"), k = keys.find(b => smpSlotOf("rom",
					+b.dataset.slot.slice(3) - 1)?.empty) || keys[keys.length - 1];
				c.slot = +k.dataset.slot.slice(3) - 1; u.click(k); },
				screen: c => ok(S.smpSlot === "ROM" + (c.slot + 1), "selected " + S.smpSlot) },
			{ say: "drop the run's WAV on the slot's waveform: it is sent to the slot and the slot holds it",
				act: () => dropAt(".romsel canvas", "wav"),
				machine: c => ok(smpLoad?.slot === c.slot && smpLoad.state === "done", "sampleLoad "
					+ JSON.stringify(smpLoad && { slot: smpLoad.slot, state: smpLoad.state, text: smpLoad.text })),
				screen: c => ok(smpSlotOf("rom", c.slot) && !smpSlotOf("rom", c.slot).empty, "the slot "
					+ JSON.stringify(smpSlotOf("rom", c.slot) && { empty: smpSlotOf("rom", c.slot).empty })),
					within: 90000 }
		]
	};

	/* ---------- wave 2: the transport beyond PLAY and STOP (doc/modern-ux/DESIGN-machine-menus.md §2) ---------- */
	const opsSent = Journey.recent(80);	/* the ops the page sent, newest last (a tempo sent once, at the release) */
	{ const send0 = Bridge.send; Bridge.send = (m, o) => { opsSent.add(m.op); return send0(m, o); }; }
	const paused = () => $1("#play")?.classList.contains("paused");
	const playing = () => !!tele.last?.playing;
	const stopAll = async u => { if (S.paused || V.playing) { u.click("#play"); await sleep(200); } if (V.playing) { u.click("#play"); await until(() => !playing(), 3000); } };
	const pauseJ = {
		name: "md-top-pause", proves: ["MD-014", "MD-029", "MD-148"],
		steps: [
			{ say: "press PLAY", act: u => { tele.steps = []; u.click("#play"); }, machine: () => ok(playing() && new Set(tele.steps).size >= 3, "telemetry " + tele.steps.join(",")), within: 6000 },
			{ say: "⇧-click ▶: it pauses, ▶ blinks, the position stays", act: (u, c) => u.click("#play", { shift: true }),
				screen: c => ok(paused() && /^\d\d\.\d\d$/.test(c.pos = $1("#pos").textContent), "paused " + paused() + ", POSITION " + $1("#pos").textContent),
				machine: () => ok(!playing(), "still playing"), within: 3000 },
			{ say: "wait: the step holds", act: async (u, c) => { c.held = S.paused?.step; await sleep(600); }, screen: c => ok(paused() && $1("#pos").textContent === c.pos, "POSITION " + $1("#pos").textContent + ", was " + c.pos),
				machine: () => ok(!playing(), "it moved on") },
			{ say: "click ▶: it goes on from the step it held", act: u => { tele.steps = []; u.click("#play"); },
				screen: () => ok(!paused() && V.playing, "paused " + paused()),
				machine: c => ok(playing() && tele.steps.length >= 2 && (tele.steps[0] === c.held || tele.steps[0] === c.held + 1), `steps after ${c.held + 1}: ${tele.steps.map(s => s + 1).join(",")}`), within: 4000 },
			{ say: "⇧Space: paused again", act: u => { document.activeElement?.blur?.(); u.key(" ", { shift: true }); }, screen: () => ok(paused(), "not paused"), machine: () => ok(!playing(), "playing"), within: 3000 },
			{ say: "⇧Space again: it plays on", act: u => u.key(" ", { shift: true }), screen: () => ok(!paused() && V.playing, "paused " + paused()), machine: () => ok(playing(), "not playing"), within: 3000 },
			{ say: "⇧-click ▶, then STOP from the ▾ menu: the pause ends, the position goes", act: async u => { u.click("#play", { shift: true }); await until(paused, 2000); u.click("#playmore"); await until(() => !!$1('#deskmenu [data-mid="play"]'), 2000); u.click('#deskmenu [data-mid="play"]'); },
				screen: () => ok(!paused() && !V.playing && $1("#pos").textContent === "--.--", "POSITION " + $1("#pos").textContent), machine: () => ok(!playing(), "playing"), within: 3000 }
		],
		async tidy(u) { await stopAll(u); }
	};
	const panicJ = {
		name: "md-top-panic", proves: ["MD-015"],
		steps: [
			{ say: "press PLAY", act: u => u.click("#play"), machine: () => ok(playing(), "not playing"), within: 6000 },
			{ say: "click the ▾ in the ▶ key's corner: the transport menu, Panic in it", act: u => u.click("#playmore"),
				screen: () => ok(!!$1('#deskmenu [data-mid="panic"]') && !$1('#deskmenu [data-mid="panic"]').disabled && !!$1('#deskmenu [data-mid="pause"]') && !!$1('#deskmenu [data-mid="record"]'), "menu " + ($1("#deskmenu")?.textContent || "none")), within: 2000 },
			{ say: "click Panic: every voice off, the machine stops (its STOP twice)", act: u => u.click('#deskmenu [data-mid="panic"]'),
				screen: () => ok(!$1('#deskmenu [data-mid="panic"]') && !V.playing, "playing " + V.playing), machine: () => ok(!playing() && results.some(r => r.op === "panic" && r.ok), "playing " + playing()), within: 3000 },
			{ say: "PLAY, then right-click ▶: the same menu", act: async u => { u.click("#play"); await until(playing, 4000); u.rightClick("#play"); },
				screen: () => ok(!!$1('#deskmenu [data-mid="panic"]'), "no menu"), within: 2000 },
			{ say: "press Escape: it closes; ⌘.: panic, it stops", act: async u => { u.key("Escape"); await until(() => !$1('#deskmenu [data-mid="panic"]'), 1000); document.activeElement?.blur?.(); u.key(".", { cmd: true }); },
				machine: () => ok(!playing(), "playing"), screen: () => ok(!V.playing && !$1("#deskmenu [data-mid]"), "menu or play"), within: 3000 }
		],
		async tidy(u) { if (typeof closeDeskMenu === "function") closeDeskMenu(); await stopAll(u); }
	};
	const tempoWindowJ = {
		name: "md-top-tempo-window", proves: ["MD-009", "MD-091"],
		steps: [
			{ say: "click the tempo on the LCD (no drag): the TEMPO window", act: (u, c) => { c.b0 = Docs.global.tempo; u.click("#bpm"); },
				screen: () => ok(!!$1("#tempopop") && $1("#tpv")?.textContent === (+V.bpm).toFixed(1), "pop-up " + ($1("#tpv")?.textContent || "none")), within: 2000 },
			{ say: "click +: one BPM faster", act: u => u.click('#tempopop [data-tp="1"]'),
				screen: c => ok(parseFloat($1("#tpv").textContent) === lcdBpm(c.b0 + 1) && parseFloat($1("#bpm").textContent) === lcdBpm(c.b0 + 1), "window " + $1("#tpv").textContent + ", LCD " + $1("#bpm").textContent),
				machine: c => ok(Math.abs(Docs.global.tempo - (c.b0 + 1)) < 0.05, "tempo " + Docs.global.tempo), within: 4000 },
			{ say: "click −: back", act: u => u.click('#tempopop [data-tp="-1"]'), machine: c => ok(Math.abs(Docs.global.tempo - c.b0) < 0.05, "tempo " + Docs.global.tempo), within: 4000 },
			{ say: "hold +10 %: 10 % faster while held (the LCD says it), nothing stored", act: (u, c) => { c.n = opsSent.mark(); const b = $1('#tempopop [data-tp="n+"]'); b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, pointerType: "mouse", isPrimary: true })); },
				screen: c => ok(parseFloat($1("#bpm").textContent) === DeskTransport.nudged(c.b0, 10) && parseFloat($1("#tpv").textContent) === DeskTransport.nudged(c.b0, 10), "LCD " + $1("#bpm").textContent),
				machine: c => ok(results.some(r => r.op === "nudge" && r.ok) && Math.abs(Docs.global.tempo - c.b0) < 0.05, "nudge " + JSON.stringify(results.filter(r => r.op === "nudge").slice(-1))), within: 3000 },
			{ say: "let go: back to the tempo it was", act: () => $1('#tempopop [data-tp="n+"]').dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, pointerType: "mouse", isPrimary: true })),
				screen: c => ok(parseFloat($1("#bpm").textContent) === lcdBpm(c.b0), "LCD " + $1("#bpm").textContent), machine: c => ok(Math.abs(Docs.global.tempo - c.b0) < 0.05 && opsSent.since(c.n).filter(o => o === "nudge").length === 2, "tempo " + Docs.global.tempo + ", sent " + opsSent.since(c.n).join(",")), within: 3000 },
			{ say: "press Escape: it closes; the key = held and let go nudges too", act: async (u, c) => { u.key("Escape"); await sleep(100); c.n = opsSent.mark(); document.activeElement?.blur?.(); u.key("="); },
				screen: () => ok(!$1("#tempopop"), "still open"), machine: c => ok(opsSent.since(c.n).filter(o => o === "nudge").length === 2, "sent " + opsSent.since(c.n).join(",")), within: 2000 }
		],
		async tidy() { DeskTransport.closeTempo(); }
	};
	const tempoReleaseJ = {
		name: "md-top-tempo-release", proves: ["MD-090"],
		steps: [
			{ say: "⌥-drag the tempo up: the LCD follows, the tempo goes once, at the release", act: async (u, c) => { c.b0 = Docs.global.tempo; c.n = opsSent.mark(); await u.drag("#bpm", [[0, -6], [0, -12], [0, -18], [0, -24]], { alt: true }); },
				screen: c => ok(parseFloat($1("#bpm").textContent) === lcdBpm(V.bpm) && V.bpm > c.b0, "LCD " + $1("#bpm").textContent),
				machine: c => ok(Docs.global.tempo > c.b0 && opsSent.since(c.n).filter(o => o === "tempo").length === 1, "tempo " + Docs.global.tempo + ", sent " + opsSent.since(c.n).join(",")), within: 4000 },
			{ say: "in the TEMPO window tick Change on release, close it, drag down as far: one tempo again", act: async (u, c) => { u.click("#bpm"); await until(() => !!$1("#tpdelay"), 2000); if (!$1("#tpdelay").checked) u.click("#tpdelay"); u.key("Escape"); await sleep(100); c.b1 = Docs.global.tempo; c.n = opsSent.mark(); await u.drag("#bpm", [[0, 6], [0, 12], [0, 18], [0, 24]]); },
				machine: c => ok(Math.abs(Docs.global.tempo - c.b0) < 0.05 && opsSent.since(c.n).filter(o => o === "tempo").length === 1, "tempo " + Docs.global.tempo + " (was " + c.b0 + "), sent " + opsSent.since(c.n).join(",")), within: 4000 }
		],
		async tidy(u, c) { DeskTransport.setDelayed(false); DeskTransport.closeTempo(); if (c.b0 != null && Math.abs(Docs.global.tempo - c.b0) >= 0.05) cmd("tempo", { bpm: c.b0 }); await sleep(300); }
	};
	const playFromJ = {
		name: "md-song-play-from", proves: ["MD-146", "MD-145"],
		steps: [
			go("song"),
			{ say: "click row 3 of the arrangement, then ▶ From here: the machine plays the song from row 3, in SONG mode", act: async (u, c) => { c.m0 = machineState().songMode === true; u.click('[data-set="songpick"] button[data-v="song"]'); await until(() => !!$1('[data-rowact="from"]'), 4000); u.click('.scell[data-i="2"]'); await sleep(150); u.click('[data-rowact="from"]'); await sleep(500); Journey.snapshot("md-song-what-plays"); },
				screen: () => ok(V.songMode === true && V.playing, "song mode " + V.songMode + ", playing " + V.playing),
				machine: () => ok(playing() && tele.last.songRow === 2, "row " + (tele.last?.songRow + 1) + ", playing " + playing()), within: 8000 },
			{ say: "click row 2 and press Enter: from row 2", act: async u => { u.click('.scell[data-i="1"]'); await sleep(150); document.activeElement?.blur?.(); u.key("Enter"); },
				machine: () => ok(playing() && tele.last.songRow === 1, "row " + (tele.last?.songRow + 1)), within: 8000 }
		],
		async tidy(u, c) { await stopAll(u); if (!c.m0 && machineState().songMode === true) { cmd("seqMode", { song: false }); await sleep(800); } }
	};

	/* ---------- 0.6 wave 4: COPY / PASTE / CLEAR what (skins/shared/deskWhat.js, mdDeskWhat.js) ---------- */
	const blur = () => document.activeElement?.blur?.();
	const whatShown = () => !$1("#dlg").hidden && !!$1("#dlg .what");
	const whatTicked = () => $all("#dlg .what input[data-wid]:checked").map(x => x.dataset.wid);
	/* the dialog's ticks made to want (each box clicked as a person would) */
	const whatTick = (u, want) => { for (const x of $all("#dlg .what input[data-wid]")) if (!x.disabled && x.checked !== want.includes(x.dataset.wid)) u.click(x); };
	/* shot(menu): the snapshots of the menu and of the dialog it opens (Journey.snapshot: the guide's pictures) */
	const whatPick = (verb, shot) => ({ say: `click ▾ beside COPY CLR PASTE, then ${verb[0].toUpperCase() + verb.slice(1)}…`,
		act: async u => { u.click("[data-secwhat]"); await until(() => DeskMenu.shown, 1500); if (shot) shot(true); u.click(`#deskmenu [data-mid="${verb}"]`);
			if (shot && await until(whatShown, 1500)) shot(false); },
		screen: () => ok(whatShown() && $1("#dlg .what h3")?.textContent.toLowerCase() === verb + " what", "dialog " + ($1("#dlg h3")?.textContent || "none")) });
	const lfoOf = t => { const k = kit()?.tracks[t]; return k ? { ...k.lfo, spd: k.routing.slice(5) } : null; };
	const copyWhat = {
		name: "md-seq-copy-what", proves: ["MD-116", "MD-129", "MD-142", "MD-X11"],
		steps: [
			go("seq"), ownMarks("acc", "sld"),
			{ say: "pick a track with two trigs or more, and another with a different machine", act: (u, c) => {
				c.a = soundTracks().find(t => trigsOf(t).filter(s => s < V.len).length >= 2) ?? soundTrack();
				c.b = soundTracks().find(t => t !== c.a && V.tracks[t].model !== V.tracks[c.a].model && !same(trigsOf(t), trigsOf(c.a))) ?? (c.a + 1) % 16;
				c.tb = trigsOf(c.b); c.mb = kit()?.tracks[c.b].model; u.click(rail(c.a)); },
				screen: c => ok(S.sel === c.a, "selected " + S.sel), machine: c => ok(trigsOf(c.a).length >= 2, "fewer than two trigs") },
			{ say: "shift-click its first trig (an accent), alt-shift-click its second (a slide)", act: async (u, c) => {
				const on = trigsOf(c.a).filter(s => s < V.len); c.s0 = on.find(s => !flagsOf(c.a, "accent").includes(s)) ?? on[0]; c.s1 = on.find(s => s !== c.s0 && !flagsOf(c.a, "slide").includes(s)) ?? on.find(s => s !== c.s0);
				u.click(cell(c.a, c.s0), { shift: true }); await sleep(300); u.click(cell(c.a, c.s1), { alt: true, shift: true }); },
				machine: c => ok(flagsOf(c.a, "accent").includes(c.s0) && flagsOf(c.a, "slide").includes(c.s1), `accent ${flagsOf(c.a, "accent")} slide ${flagsOf(c.a, "slide")}`), within: 4000 },
			whatPick("copy", m => m ? Journey.snapshot("md-copy-what-menu") : Journey.snapshot("md-copy-what")),
			{ say: "tick Trigs, Accent, Slide and Machine + sound (nothing else), click Copy", act: u => { whatTick(u, ["trigs", "accent", "slide", "sound"]); u.click("#dlg [data-wgo]"); },
				screen: () => ok(!whatShown(), "still open"),
				machine: c => ok(V.clipboard.track && V.clipboard.track.t === c.a && same(V.clipboard.track.what, ["trigs", "accent", "slide", "sound"]), "clipboard " + JSON.stringify(V.clipboard.track)), within: 4000 },
			{ say: "pick the other track on the rail", act: (u, c) => u.click(rail(c.b)), screen: c => ok(S.sel === c.b, "selected " + S.sel) },
			{ ...whatPick("paste", m => m ? Journey.snapshot("md-paste-what-menu") : Journey.snapshot("md-paste-what")), screen: c => ok(whatShown() && same($all("#dlg [data-wto][aria-pressed=true]").map(b => +b.dataset.wto), [c.b])
				&& $1("#dlg [data-wgo]")?.textContent === "Paste into 1 track" && same(whatTicked(), ["trigs", "accent", "slide", "sound"])
				&& $1('#dlg input[data-wid="locks"]')?.disabled, "keys " + $all("#dlg [data-wto][aria-pressed=true]").map(b => b.dataset.wto) + ", ticked " + whatTicked()) },
			{ say: "click Paste into 1 track: the trigs, their marks and the sound land on it", act: u => u.click("#dlg [data-wgo]"),
				machine: c => ok(same(trigsOf(c.b), trigsOf(c.a)) && same(flagsOf(c.b, "accent"), flagsOf(c.a, "accent")) && same(flagsOf(c.b, "slide"), flagsOf(c.a, "slide"))
					&& kit()?.tracks[c.b].model === kit()?.tracks[c.a].model, `trigs ${trigsOf(c.b)}, accent ${flagsOf(c.b, "accent")}, slide ${flagsOf(c.b, "slide")}, model ${kit()?.tracks[c.b].model}`),
				screen: c => ok(gridShows(c.b), "grid " + lit(c.b).join(",")), within: 8000 },
			{ say: "press Cmd+Z once: the paste is one undo step, the track is as before", act: u => { blur(); u.key("z", { cmd: true }); },
				machine: c => ok(same(trigsOf(c.b), c.tb) && kit()?.tracks[c.b].model === c.mb, `trigs ${trigsOf(c.b)}, model ${kit()?.tracks[c.b].model}`), within: 8000 },
			{ say: "Cmd+Z twice more: the accent and the slide go", act: async u => { u.key("z", { cmd: true }); await sleep(600); u.key("z", { cmd: true }); },
				machine: c => ok(!flagsOf(c.a, "accent").includes(c.s0) && !flagsOf(c.a, "slide").includes(c.s1), `accent ${flagsOf(c.a, "accent")} slide ${flagsOf(c.a, "slide")}`), within: 8000 }
		],
		async tidy(u, c) { await back(u, c); }
	};
	const clearWhat = {
		name: "md-seq-clear-what", proves: ["MD-129", "MD-117", "MD-X11"],
		steps: [
			go("seq"), ownMarks("acc"),
			{ say: "pick a track with trigs and shift-click its first trig: an accent", act: async (u, c) => {
				c.a = soundTracks().find(t => trigsOf(t).filter(s => s < V.len).length >= 1) ?? soundTrack(); u.click(rail(c.a)); await sleep(200);
				c.s0 = trigsOf(c.a).filter(s => s < V.len).find(s => !flagsOf(c.a, "accent").includes(s)) ?? trigsOf(c.a)[0]; c.t0 = trigsOf(c.a); u.click(cell(c.a, c.s0), { shift: true }); },
				machine: c => ok(flagsOf(c.a, "accent").includes(c.s0), "accent " + flagsOf(c.a, "accent")), within: 4000 },
			{ say: "press Cmd+Shift+Backspace: Clear what opens", act: u => { blur(); u.key("Backspace", { cmd: true, shift: true }); },
				screen: () => ok(whatShown() && $1("#dlg .what h3")?.textContent === "Clear what" && $1("#dlg [data-wgo]")?.classList.contains("danger"), "dialog " + ($1("#dlg h3")?.textContent || "none")) },
			{ say: "tick Accent alone and click Clear: the accent goes, the trigs stay", act: u => { whatTick(u, ["accent"]); u.click("#dlg [data-wgo]"); },
				machine: c => ok(!flagsOf(c.a, "accent").length && same(trigsOf(c.a), c.t0), `accent ${flagsOf(c.a, "accent")}, trigs ${trigsOf(c.a)}`), within: 6000 },
			{ say: "open Clear what again: Accent is still the one ticked (the ticks are remembered); tick Trigs alone, Clear", act: async (u, c) => {
				u.key("Backspace", { cmd: true, shift: true }); await until(whatShown, 1500); c.ticks = whatTicked(); whatTick(u, ["trigs"]); u.click("#dlg [data-wgo]"); },
				machine: c => ok(!trigsOf(c.a).length, "trigs " + trigsOf(c.a)), screen: c => ok(!lit(c.a).length && same(c.ticks, ["accent"]), "lit " + lit(c.a) + ", ticked before " + c.ticks), within: 6000 },
			{ say: "Cmd+Z twice: the trigs and the accent are back", act: async u => { u.key("z", { cmd: true }); await sleep(600); u.key("z", { cmd: true }); },
				machine: c => ok(same(trigsOf(c.a), c.t0) && flagsOf(c.a, "accent").includes(c.s0), `trigs ${trigsOf(c.a)}, accent ${flagsOf(c.a, "accent")}`), within: 8000 },
			{ say: "Cmd+Z: the accent of the start goes too", act: u => u.key("z", { cmd: true }), machine: c => ok(!flagsOf(c.a, "accent").includes(c.s0), "accent " + flagsOf(c.a, "accent")), within: 6000 }
		],
		async tidy(u, c) { forgetWhat(); await back(u, c); }
	};
	const lfoMenuJ = {
		name: "md-sound-lfo-menu", proves: ["MD-086"],
		steps: [
			go("sound"),
			{ say: "pick a track; two tracks whose LFOs differ", act: (u, c) => { const ts = soundTracks();
				c.a = ts[0] ?? 0; c.b = ts.find(t => t !== c.a && !same(lfoOf(t), lfoOf(c.a))) ?? (c.a + 1) % 16; c.lb = lfoOf(c.b); u.click(rail(c.a)); },
				screen: c => ok(S.sel === c.a && !!$1("[data-lfom]"), "selected " + S.sel + ", LFO ⋯ " + !!$1("[data-lfom]")) },
			{ say: "click ⋯ on the LFO card, then Copy LFO", act: async u => { u.click("[data-lfom]"); await until(() => DeskMenu.shown, 1500); Journey.snapshot("md-lfo-menu"); u.click('#deskmenu [data-mid="copy"]'); },
				machine: c => ok(V.clipboard.track && V.clipboard.track.t === c.a && same(V.clipboard.track.what, ["lfo"]), "clipboard " + JSON.stringify(V.clipboard.track)), within: 4000 },
			{ say: "pick the other track, click ⋯, then Paste LFO", act: async (u, c) => { u.click(rail(c.b)); await sleep(300); u.click("[data-lfom]"); await until(() => DeskMenu.shown, 1500); u.click('#deskmenu [data-mid="paste"]'); },
				machine: c => { const a = lfoOf(c.a), b = lfoOf(c.b); return ok(b && a.param === b.param && a.shape1 === b.shape1 && a.shape2 === b.shape2 && a.update === b.update && same(a.spd, b.spd)
					&& b.track === (a.track === c.a ? c.b : a.track), "LFO " + JSON.stringify(b) + " from " + JSON.stringify(a)); }, within: 6000 },
			{ say: "click ⋯, then Clear LFO: its settings at the start", act: async u => { u.click("[data-lfom]"); await until(() => DeskMenu.shown, 1500); u.click('#deskmenu [data-mid="clear"]'); },
				machine: c => { const b = lfoOf(c.b); return ok(b && b.track === c.b && b.param === 0 && b.shape1 === 0 && b.shape2 === 0 && b.update === 0, "LFO " + JSON.stringify(b)); }, within: 6000 },
			{ say: "Cmd+Z twice: the LFO is as before", act: async u => { blur(); u.key("z", { cmd: true }); await sleep(700); u.key("z", { cmd: true }); },
				machine: c => ok(same(lfoOf(c.b), c.lb), "LFO " + JSON.stringify(lfoOf(c.b))), within: 8000 }
		]
	};
	/* ---------- 0.6 slice 5: journeys for the rows that had none (doc/features/unproved-md.md) ---------- */
	/* ---- chapters 1, 2 and 8 (the LCD, modes, the pattern chooser, the kit library) ---- */
	const l2 = k => `#lcd2 [data-l2="${k}"]`;
	const l2text = k => $1(l2(k) + " b")?.textContent;
	const patDoc = () => Docs.patterns[currentPatternSlot()];
	/* MD-004, MD-087, MD-088, MD-138: CLASSIC and EXTENDED */
	const modeJ = {
		name: "md-top-mode", proves: ["MD-004", "MD-087", "MD-088", "MD-138"],
		steps: [
			go("seq"),
			{ say: "pick a track with two trigs, pick a lock key and draw locks over two of them", act: async (u, c) => {
				c.t = soundTracks().find(t => trigsOf(t).length >= 2) ?? soundTrack(); u.click(rail(c.t)); await sleep(200);
				const k = $1('#chips .pk[data-lane="FLTF"]') || $1("#chips .pk[data-lane]"); c.p = k.dataset.lane; c.i = pidx(c.t, c.p); u.click(k); await sleep(150);
				c.on = trigsOf(c.t).filter(s => s < V.len).slice(0, 2); await u.drag(`#lane .lb[data-s="${c.on[0]}"]`, c.on.slice(1).map(s => `#lane .lb[data-s="${s}"]`), {}, { fy: 0.3 }); },
				screen: c => ok(c.on.every(s => $1(`#lane .lb[data-s="${s}"] i`)), "no bars"), machine: c => ok(c.on.every(s => locksOf(c.t, c.i).some(([x]) => x === s)), "locks " + JSON.stringify(locksOf(c.t, c.i))), within: 8000 },
			{ say: "the LCD says EXT and the lane is live", screen: () => ok(l2text("mode") === "EXT" && !$1("#seqp").classList.contains("classic") && !$1(".warnline"), "mode " + l2text("mode")), machine: () => ok(Docs.global.extendedMode === true, "extended " + Docs.global.extendedMode) },
			{ say: "click MODE on the LCD: CLASSIC. The lane says its locks are muted, and they are all still there", act: (u, c) => { c.n0 = $1("#lockn").textContent; u.click(l2("mode")); },
				screen: c => ok(l2text("mode") === "CLASSIC" && $1("#seqp").classList.contains("classic") && /locks muted/.test($1(".warnline")?.textContent || "") && $1("#lockn").textContent === c.n0, `mode ${l2text("mode")}, warning "${$1(".warnline")?.textContent}", locks ${$1("#lockn").textContent} was ${c.n0}`),
				machine: c => ok(Docs.global.extendedMode === false && c.on.every(s => locksOf(c.t, c.i).some(([x]) => x === s)), `extended ${Docs.global.extendedMode}, locks ${JSON.stringify(locksOf(c.t, c.i))}`), within: 6000 },
			{ say: "open the pattern chooser: in CLASSIC no pattern shows a kit", act: async u => { u.click("#pat"); await until(() => $all("#libpop .ps").length === 128, 3000); Journey.snapshot("md-top-mode-classic"); },
				screen: () => ok($all("#libpop .ps span").length === 128 && !$all("#libpop .ps span").some(s => /K\d\d/.test(s.textContent)), "a tile shows a kit") },
			esc,
			{ say: "click MODE again: EXT, the lane is live, the pattern chooser shows each pattern's kit", act: async u => { u.click(l2("mode")); await until(() => Docs.global.extendedMode === true, 4000); await sleep(300); u.click("#pat"); await until(() => $all("#libpop .ps").length === 128, 3000); },
				screen: () => ok(l2text("mode") === "EXT" && !$1(".warnline") && $all("#libpop .ps span").some(s => /· K\d\d/.test(s.textContent)), `mode ${l2text("mode")}, tiles ${$all("#libpop .ps span").slice(0, 3).map(s => s.textContent)}`),
				machine: () => ok(Docs.global.extendedMode === true && Docs.patterns[currentPatternSlot()].kit != null, "extended " + Docs.global.extendedMode), within: 6000 },
			esc,
			{ say: "click the lane's clear key: the locks go", act: u => u.click("#clearLane"), machine: c => ok(!locksOf(c.t, c.i).length, "locks " + JSON.stringify(locksOf(c.t, c.i))), within: 8000 }
		],
		async tidy(u) { if (Docs.global?.extendedMode === false) { cmd("extended", { on: true }); await sleep(600); } }
	};
	/* MD-103, MD-104, MD-105: SCALE SETUP on the LCD: the steps, the total length, the speed */
	const scaleJ = {
		name: "md-seq-scale", proves: ["MD-103", "MD-104", "MD-105"],
		steps: [
			go("seq"),
			{ say: "click LEN on the LCD: the total length steps to the next of 16, 32, 48, 64", act: (u, c) => { c.s0 = { len: V.len, length: V.length, mult: V.mult }; c.want = [16, 32, 48, 64][([16, 32, 48, 64].indexOf(V.len) + 1) % 4]; u.click(l2("len")); },
				screen: c => ok(V.len === c.want && $1(l2("len")).textContent.includes(String(c.want)), `LEN ${V.len}, LCD "${$1(l2("len")).textContent}"`), machine: c => ok(patDoc().totalLength === c.want, "total length " + patDoc().totalLength), within: 6000 },
			{ say: "Alt-click LEN: the length inside it grows by one step", act: (u, c) => { c.l1 = V.length; u.click(l2("len"), { alt: true }); },
				screen: c => ok(V.length === (c.l1 % V.len) + 1, `length ${V.length}, was ${c.l1}`), machine: c => ok(patDoc().length === (c.l1 % V.len) + 1, "length " + patDoc().length), within: 6000 },
			{ say: "click SPD on the LCD: the next speed of 1X, 2X, 3/4X, 3/2X", act: (u, c) => { c.m1 = V.mult; c.want2 = Enums().tempoMultipliers[(Enums().tempoMultipliers.indexOf(V.mult) + 1) % 4]; u.click(l2("mult")); Journey.snapshot("md-seq-scale"); },
				screen: c => ok(V.mult === c.want2 && l2text("mult") === c.want2, `SPD ${V.mult}, LCD ${l2text("mult")}`), machine: c => ok(patDoc().tempoMultiplier === c.want2, "multiplier " + patDoc().tempoMultiplier), within: 6000 },
			{ say: "scroll the wheel over SPD three times: it walks the four speeds", act: async (u, c) => { c.seen = [V.mult]; for (let i = 0; i < 3; i++) { u.wheel(l2("mult"), 1); await until(() => V.mult !== c.seen[c.seen.length - 1], 2500); c.seen.push(V.mult); } },
				screen: c => ok(new Set(c.seen).size >= 3 && c.seen.every(x => Enums().tempoMultipliers.includes(x)), "speeds " + c.seen), machine: () => ok(Enums().tempoMultipliers.includes(patDoc().tempoMultiplier), "multiplier " + patDoc().tempoMultiplier), within: 4000 }
		],
		async tidy(u, c) {
			/* back to the start: the speed and the lengths by their own keys, no undo count to guess */
			const s = c.s0; if (!s) return; cmd("totalLength", { p: V.pat, v: s.len }); await sleep(400); cmd("length", { p: V.pat, v: s.length }); await sleep(400); cmd("speed", { p: V.pat, v: s.mult }); await sleep(400);
			/* a longer pattern holds a copy in its new half: the lengths back are not the pattern back, its undo steps are */
			await undoTo(u, c.back0.undo);
		}
	};
	/* MD-126, MD-130: ACCENT amount 0-15, SWING amount 50-80 % */
	const amountsJ = {
		name: "md-seq-swing-accent", proves: ["MD-126", "MD-130"],
		steps: [
			go("seq"),
			{ say: "scroll up over ACC many times: it stops at 15", act: async (u, c) => { c.a0 = V.accAmt; c.s0 = V.swing; for (let i = 0; i < 17; i++) { u.wheel(l2("accAmt"), 1); await sleep(40); } await until(() => V.accAmt === 15, 4000); },
				screen: () => ok(V.accAmt === 15 && l2text("accAmt") === "15", "ACC " + V.accAmt), machine: () => ok(accentDisplay(patDoc().accentAmount) === 15, "accent " + patDoc().accentAmount), within: 8000 },
			{ say: "scroll down over ACC many times: it stops at 0", act: async u => { for (let i = 0; i < 17; i++) { u.wheel(l2("accAmt"), -1); await sleep(40); } await until(() => V.accAmt === 0, 4000); },
				screen: () => ok(V.accAmt === 0 && l2text("accAmt") === "0", "ACC " + V.accAmt), machine: () => ok(accentDisplay(patDoc().accentAmount) === 0, "accent " + patDoc().accentAmount), within: 8000 },
			{ say: "scroll up over SWG many times: it stops at 80 %", act: async u => { for (let i = 0; i < 30; i++) { u.wheel(l2("swing"), 1); await sleep(40); } await until(() => V.swing === 80, 5000); },
				screen: () => ok(V.swing === 80 && l2text("swing") === "80%", "SWG " + V.swing), machine: () => ok(swingPercent(patDoc().swingAmount) === 80, "swing " + patDoc().swingAmount), within: 8000 },
			{ say: "scroll down over SWG many times: it stops at 50 %", act: async u => { for (let i = 0; i < 32; i++) { u.wheel(l2("swing"), -1); await sleep(40); } await until(() => V.swing === 50, 5000); Journey.snapshot("md-seq-swing-accent"); },
				screen: () => ok(V.swing === 50 && l2text("swing") === "50%", "SWG " + V.swing), machine: () => ok(swingPercent(patDoc().swingAmount) === 50, "swing " + patDoc().swingAmount), within: 8000 }
		],
		async tidy(u, c) { if (c.a0 == null) return; while (V.accAmt !== c.a0) { u.wheel(l2("accAmt"), V.accAmt < c.a0 ? 1 : -1); await sleep(80); } while (V.swing !== c.s0) { u.wheel(l2("swing"), V.swing < c.s0 ? 1 : -1); await sleep(80); } await sleep(400); }
	};
	/* MD-089: the tempo in whole steps and in tenths */
	const tempoSteps = {
		name: "md-top-tempo-steps", proves: ["MD-089"],
		steps: [
			{ say: "drag the BPM up by 8 pixels: a step of half a BPM a pixel, a whole-number change", act: async (u, c) => { c.b0 = Docs.global.tempo; await u.drag("#bpm", [[0, -4], [0, -8]]); },
				screen: c => ok(Math.abs(V.bpm - (c.b0 + 4)) < 0.06 && parseFloat($1("#bpm").textContent) === lcdBpm(V.bpm), `BPM ${V.bpm}, from ${c.b0}`), machine: c => ok(Math.abs(Docs.global.tempo - (c.b0 + 4)) < 0.06, "tempo " + Docs.global.tempo), within: 4000 },
			{ say: "drag it up by 7 pixels with Shift held: tenths of a BPM, 0.7 more", act: async (u, c) => { c.b1 = Docs.global.tempo; await u.drag("#bpm", [[0, -3], [0, -7]], { shift: true }); Journey.snapshot("md-top-tempo-steps"); },
				screen: c => ok(Math.abs(V.bpm - (c.b1 + 0.7)) < 0.06 && parseFloat($1("#bpm").textContent) === lcdBpm(V.bpm), `BPM ${V.bpm}, from ${c.b1}`), machine: c => ok(Math.abs(Docs.global.tempo - (c.b1 + 0.7)) < 0.06 && Math.abs(Docs.global.tempo * 10 - Math.round(Docs.global.tempo * 10)) < 0.2, "tempo " + Docs.global.tempo), within: 4000 }
		],
		async tidy(u, c) { if (c.b0 != null) cmd("tempo", { bpm: c.b0 }); await sleep(500); }
	};
	/* MD-006, MD-095, MD-120, MD-088: the pattern chooser: banks A-H, the empty slots, copy and paste */
	const chooserJ = {
		name: "md-lib-pattern-chooser", proves: ["MD-006", "MD-095", "MD-120", "MD-291", "MD-X21"],
		steps: [
			{ say: "click the pattern on the LCD: the chooser shows the 8 banks of 16", act: (u, c) => { c.p0 = currentPatternSlot(); u.click("#pat"); }, screen: () => ok(!$1("#libpop").hidden && $all("#libpop .ps").length === 128 && $all("#libpop .lbank").length === 8, $all("#libpop .ps").length + " slots, " + $all("#libpop .lbank").length + " banks") },
			{ say: "every slot without trigs says EMPTY, every other one its length and kit", screen: () => { const bad = $all("#libpop .ps").filter(b => { const p = +b.dataset.ps, t = b.querySelector("span").textContent; return hasPat(p) ? /EMPTY/.test(t) || !/^\d+/.test(t) || b.classList.contains("empty") : t !== "EMPTY" || !b.classList.contains("empty"); }).map(b => b.dataset.ps);
				return ok(!bad.length && $all("#libpop .ps:not(.empty)").length >= 1, `wrong tiles ${bad.slice(0, 6)}`); } },
			{ say: "press D: the selection moves to bank D; press A: bank A", act: async (u, c) => { u.key("d"); await sleep(120); c.d = LIB.sel; c.dOk = $1(psq(LIB.sel))?.getAttribute("aria-selected") === "true"; u.key("a"); },
				screen: c => ok(c.d >> 4 === 3 && c.dOk && LIB.sel >> 4 === 0 && $1(psq(LIB.sel))?.getAttribute("aria-selected") === "true", `D gave ${c.d}, A gave ${LIB.sel}`) },
			{ say: "click the key of bank C: the selection is in bank C", act: u => u.click('#libpop .lbank[data-lb="2"]'), screen: () => ok(LIB.sel >> 4 === 2 && $1(psq(LIB.sel))?.getAttribute("aria-selected") === "true", "selected " + LIB.sel) },
			{ say: "move to a pattern with trigs (arrows) and click Copy", act: async (u, c) => { c.src = [...Array(128).keys()].find(p => p !== currentPatternSlot() && hasPat(p) && Docs.patterns[p].kit != null);
					if (c.src == null) throw new Error("no other pattern with trigs and a kit link"); c.s0 = JSON.stringify(Docs.patterns[c.src]);
					for (let n = 0; n < 128 && LIB.sel !== c.src; n++) { u.key("ArrowRight"); await sleep(10); } u.click('#libpop [data-la="copy"]'); },
				screen: c => ok($1(psq(c.src))?.getAttribute("aria-selected") === "true", "selected " + LIB.sel), machine: c => ok(V.clipboard.pattern === c.src, "clipboard " + V.clipboard.pattern) },
			{ say: "move to another pattern with trigs and click Clear: its tile says EMPTY", act: async (u, c) => { await until(idle, 8000);
					c.dst = [...Array(128).keys()].reverse().find(p => p !== c.src && p !== currentPatternSlot() && hasPat(p)); if (c.dst == null) throw new Error("no second pattern with trigs");
					c.d0 = JSON.stringify(Docs.patterns[c.dst]); for (let n = 0; n < 128 && LIB.sel !== c.dst; n++) { u.key("ArrowRight"); await sleep(10); }
					u.click('#libpop [data-la="clear"]'); if (await until(dlgShown, 1500)) u.click($1("#dlg .danger")); },
				machine: c => ok(!hasPat(c.dst), "still has trigs"), screen: c => ok($1(psq(c.dst))?.classList.contains("empty") && $1(psq(c.dst))?.querySelector("span").textContent === "EMPTY", "tile " + $1(psq(c.dst))?.textContent), within: 12000 },
			{ say: "click Paste: the empty slot has the copy's steps and kit link", act: async (u, c) => { await until(idle, 8000); u.click('#libpop [data-la="paste"]'); if (await until(dlgShown, 1500)) u.click($1("#dlg .danger") || dlgButton("Overwrite")); },
				machine: c => { const a = Docs.patterns[c.src], b = Docs.patterns[c.dst]; return ok(b.kit === a.kit && same(b.tracks.map(t => t.trigs), a.tracks.map(t => t.trigs)) && same(b.locks, a.locks), `kit ${b.kit} for ${a.kit}`); },
				screen: c => ok(!$1(psq(c.dst))?.classList.contains("empty") && $1(psq(c.dst))?.querySelector("span").textContent === $1(psq(c.src))?.querySelector("span").textContent, "tile " + $1(psq(c.dst))?.textContent), within: 12000 },
			{ say: "press Cmd+Z twice: the slot is as it was", act: async u => { await until(idle, 8000); Journey.snapshot("md-pattern-chooser"); u.key("z", { cmd: true }); await sleep(700); await until(idle, 8000); u.key("z", { cmd: true }); }, machine: c => ok(JSON.stringify(Docs.patterns[c.dst]) === c.d0, "slot not restored"), within: 12000 },
			esc
		]
	};
	/* MD-018, MD-030, MD-038, MD-040: the kit menu (the library), the LCD's kit, what a kit holds, the star */
	const kitMenuJ = {
		name: "md-lib-kit-menu", proves: ["MD-018", "MD-030", "MD-038", "MD-040"],
		steps: [
			{ say: "the LCD shows the kit's slot and name and that it is saved", screen: () => ok($1("#kitname").textContent.trim() === `K${nn(V.kit)} ${kitName(V.kit).trim()}`.trim() && /saved|edited/.test($1("#save").textContent), `LCD "${$1("#kitname").textContent}", chip "${$1("#save").textContent}", kit ${V.kit}`), machine: () => ok(currentKitSlot() === V.kit && Docs.kits[V.kit] != null, "kit slot " + currentKitSlot()) },
			{ say: "click KIT: the library of 64 kits opens, the current one marked", act: u => u.click("#kitf"), screen: () => ok(!$1("#libpop").hidden && $all("#libpop .ks").length === 64 && $1(ks(V.kit))?.classList.contains("cur"), $all("#libpop .ks").length + " tiles"), machine: () => ok(Object.keys(Docs.kits).length === 64, Object.keys(Docs.kits).length + " kits read") },
			{ say: "a kit holds 16 tracks, each with 8 synthesis, 8 effects and 8 routing values and its LFO, the master effects and a name", machine: () => { const k = kitDocOf(Docs); return ok(k && k.tracks.length === 16 && k.tracks.every(t => t.synth.length === 8 && t.effects.length === 8 && t.routing.length === 8 && t.lfo && t.machine) && k.masterFx && typeof kitNameText(k.name) === "string", "kit " + JSON.stringify(Object.keys(k || {}))); } },
			/* B-105 (the 0.6 e2e run): factory memory links every kit that holds data to a pattern, so no star showed. The
			   journey makes its own: the kit that plays pasted into an empty slot no pattern links (undone in tidy) */
			{ say: "when every kit with data is linked (factory memory), Copy the kit that plays and Paste it into an empty slot no pattern links", act: async (u, c) => {
				if ([...Array(64).keys()].some(k => !kitEmpty(k) && !linked(k).length)) return;
				const dst = [...Array(64).keys()].reverse().find(k => k !== V.kit && kitEmpty(k) && !linked(k).length);
				if (dst == null) throw new Error("no empty kit slot that no pattern links");
				u.click(ks(V.kit), { alt: true }); await sleep(150); u.click('#libpop [data-la="copy"]'); await sleep(150);
				u.click(ks(dst), { alt: true }); await sleep(150); await until(idle, 8000); u.click('#libpop [data-la="paste"]');
				if (await until(() => dlgShown() && !!dlgButton("Overwrite"), 1500)) u.click(dlgButton("Overwrite"));
				c.pasted = dst; await until(() => !kitEmpty(dst), 12000); },
				machine: c => ok(c.pasted == null || !kitEmpty(c.pasted), "slot " + c.pasted), within: 15000 },
			{ say: "in EXTENDED a kit no pattern links to ends with a star, the others show the patterns that use them", act: () => Journey.snapshot("md-kit-library"),
				screen: () => { const bad = [...Array(64).keys()].filter(k => { if (kitEmpty(k) && k !== V.kit) return false; const t = $1(ks(k))?.querySelector(".lsn")?.textContent || ""; return t.endsWith("*") !== !linked(k).length; });
					const stars = $all("#libpop .lsn").filter(e => e.textContent.endsWith("*")).length; return ok(!bad.length && V.mode === "EXTENDED" && stars >= 1, `kits wrong ${bad.slice(0, 8)}, stars ${stars}`); } },
			esc
		],
		async tidy(u, c) { if (c.pasted == null) return; if (!$1("#libpop").hidden) u.key("Escape"); await until(idle, 8000); blur(); u.key("z", { cmd: true }); await until(() => kitEmpty(c.pasted), 12000); }
	};
	/* MD-109, MD-102: the kit is worked on in memory, copied before editing, and reloaded from its slot */
	const kitMemoryJ = {
		name: "md-lib-kit-memory", proves: ["MD-109", "MD-102"],
		steps: [
			go("sound"), sel(() => soundTrack()),
			{ say: "drag a value: the LCD says edited, the slot in the library keeps the stored kit", act: async (u, c) => { c.k = V.kit; c.stored = JSON.stringify(Docs.kits[c.k]); const el = $1('#main .pc[data-g="syn"]'); c.n = el.dataset.n; c.i = pidx(c.t, c.n, "syn"); c.v0 = kitVals(c.t)[c.i]; await nudge(u, el, c.v0); },
				screen: () => ok(/edited/.test($1("#save").textContent), "chip " + $1("#save").textContent), machine: c => ok(machineState().kit.working === "edited" && kitVals(c.t)[c.i] !== c.v0 && JSON.stringify(Docs.kits[c.k]) === c.stored, `${machineState().kit.working}, value ${kitVals(c.t)[c.i]}, slot ${JSON.stringify(Docs.kits[c.k]) === c.stored ? "as stored" : "changed"}`), within: 6000 },
			{ say: "click KIT, then Copy: the clipboard holds the kit being edited", act: async u => { u.click("#kitf"); await sleep(200); u.click('#libpop [data-la="copy"]'); }, machine: c => ok(V.clipboard.kit === c.k, "clipboard " + V.clipboard.kit) },
			{ say: "click Reload (the key is live now): the edits are lost, the kit is as stored", act: async (u, c) => { u.click('#libpop [data-la="reload"]'); if (await until(dlgShown, 1500)) u.click($1("#dlg .danger") || dlgButton("Load without saving")); Journey.snapshot("md-kit-reload"); },
				screen: () => ok(/saved/.test($1("#save").textContent), "chip " + $1("#save").textContent), machine: c => ok(machineState().kit.working !== "edited" && kitVals(c.t)[c.i] === c.v0, `${machineState().kit.working}, value ${kitVals(c.t)[c.i]} for ${c.v0}`), within: 10000 },
			esc
		]
	};
	/* MD-X25: Revert track on the Sound page: the track goes back as the kit's slot stores it, one undo step */
	const revertTrackJ = {
		name: "md-sound-revert-track", proves: ["MD-X25"],
		steps: [
			go("sound"), sel(() => soundTrack()),
			{ say: "the Revert track key is there and off: the track is as its slot stores it",
				screen: () => ok(!!$1("#revert") && $1("#revert").disabled && /stores it/.test($1("#revert").title), "key " + $1("#revert")?.disabled + " " + $1("#revert")?.title) },
			{ say: "drag a value of the track: the key turns on", act: async (u, c) => { c.k = V.kit; c.stored = JSON.stringify(Docs.kits[c.k].tracks[c.t]); const el = $1('#main .pc[data-g="syn"]'); c.n = el.dataset.n; c.i = pidx(c.t, c.n, "syn"); c.v0 = kitVals(c.t)[c.i]; c.o = allKitVals(); await nudge(u, el, c.v0); await until(idle, 5000); c.v1 = kitVals(c.t)[c.i]; c.u0 = V.undoCount; },
				screen: () => ok(!$1("#revert").disabled, "key still off"), machine: c => ok(c.v1 !== c.v0 && JSON.stringify(Docs.kits[c.k].tracks[c.t]) === c.stored, `value ${c.v0} -> ${kitVals(c.t)[c.i]}`), within: 6000 },
			{ say: "click Revert track: the value is the slot's, the slot is untouched, the key is off, one undo step more", act: u => u.click("#revert"),
				screen: () => ok($1("#revert").disabled, "key still on"),
				machine: c => ok(kitVals(c.t)[c.i] === c.v0 && same(allKitVals(), c.o) && JSON.stringify(Docs.kits[c.k].tracks[c.t]) === c.stored && V.undoCount === c.u0 + 1, `value ${kitVals(c.t)[c.i]} for ${c.v0}, undo steps ${V.undoCount} for ${c.u0 + 1}`), within: 6000 },
			{ say: "press Cmd+Z once: the edit is back and the key is on again", act: u => u.key("z", { cmd: true }),
				screen: () => ok(!$1("#revert").disabled, "key off"), machine: c => ok(kitVals(c.t)[c.i] === c.v1, `value ${kitVals(c.t)[c.i]} for ${c.v1}`), within: 6000 }
		],
		async tidy(u, c) { blur(); u.key("z", { cmd: true }); await until(() => kitVals(c.t)[c.i] === c.v0, 6000); }
	};
	/* MD-035: the quick start: load a kit, trig a track, play */
	const quickJ = {
		name: "md-quick-start", proves: ["MD-035"],
		steps: [
			{ say: "click KIT and click another kit: it loads", act: async (u, c) => { c.k0 = V.kit; u.click("#kitf"); await sleep(250); c.k = [...Array(64).keys()].find(k => k !== c.k0 && !kitEmpty(k) && kitName(k)); u.click(ks(c.k)); if (await until(dlgShown, 1500)) u.click(dlgButton("Load without saving") || $1("#dlg .danger")); },
				screen: c => ok($1("#kitname").textContent.includes(kitName(c.k).trim()), "LCD " + $1("#kitname").textContent), machine: c => ok(currentKitSlot() === c.k, "kit " + currentKitSlot()), within: 8000 },
			esc, go("seq"), sel(() => soundTrack()),
			{ say: "click an empty step on the track: a trig", act: (u, c) => { c.s = freeSteps(c.t, 1, 4)[0]; u.click(cell(c.t, c.s)); }, screen: c => ok(pressed(cell(c.t, c.s)), "not lit"), machine: c => ok(trigsOf(c.t).includes(c.s), "no trig"), within: 5000 },
			{ say: "press PLAY: the pattern plays with the trig", act: u => { tele.steps = []; u.click("#play"); }, screen: () => ok(V.playing, "not playing"), machine: () => ok(new Set(tele.steps).size >= 3, "steps " + tele.steps.join(",")), within: 8000 },
			{ say: "press STOP", act: u => { Journey.snapshot("md-quick-start"); u.click("#play"); }, screen: () => ok(!V.playing, "playing") }
		],
		async tidy(u, c) { if (V.playing) u.click("#play"); await undoTo(u, c.back0.undo);
			/* the kit that was loaded: loaded again (the kit it left is as saved) */
			if (c.k0 != null && currentKitSlot() !== c.k0) { u.click("#kitf"); await sleep(250); u.click(ks(c.k0)); if (await until(dlgShown, 1500)) u.click(dlgButton("Load without saving") || $1("#dlg .danger")); await until(() => currentKitSlot() === c.k0, 8000); u.key("Escape"); await sleep(200); } }
	};
	/* MD-036: a value on the Sound page: the wheel steps by 1, Shift + wheel by 10, Shift + drag finely */
	const knobSteps = {
		name: "md-sound-knob-steps", proves: ["MD-036"],
		steps: [
			go("sound"), sel(() => soundTrack()),
			{ say: "scroll one notch over a synthesis value: one step", act: async (u, c) => { const el = $1('#main .pc[data-g="syn"]'); c.q = `#main .pc[data-g="syn"][data-n="${el.dataset.n}"]`; c.n = el.dataset.n; c.i = pidx(c.t, c.n, "syn"); c.v0 = kitVals(c.t)[c.i]; c.d = c.v0 > 90 ? -1 : 1; u.wheel(c.q, c.d); },
				screen: c => ok(+$1(c.q + " b")?.textContent === c.v0 + c.d, "shows " + $1(c.q + " b")?.textContent), machine: c => ok(kitVals(c.t)[c.i] === c.v0 + c.d, "kit " + kitVals(c.t)[c.i]), within: 5000 },
			{ say: "scroll one notch with Shift held: ten steps", act: (u, c) => { c.v1 = kitVals(c.t)[c.i]; u.wheel(c.q, c.d, { shift: true }); },
				screen: c => ok(+$1(c.q + " b")?.textContent === c.v1 + 10 * c.d, "shows " + $1(c.q + " b")?.textContent), machine: c => ok(kitVals(c.t)[c.i] === c.v1 + 10 * c.d, "kit " + kitVals(c.t)[c.i]), within: 5000 },
			{ say: "drag the value 8 pixels sideways, then again with Shift held: the second is a quarter as far", act: async (u, c) => { c.v2 = kitVals(c.t)[c.i]; await u.drag(c.q, [[c.d * 4, 0], [c.d * 8, 0]]); c.v3 = kitVals(c.t)[c.i]; await u.drag(c.q, [[c.d * 4, 0], [c.d * 8, 0]], { shift: true }); Journey.snapshot("md-sound-knob-steps"); },
				screen: c => ok(Math.abs(c.v3 - c.v2) === 8 && Math.abs(+$1(c.q + " b")?.textContent - c.v3) === 2, `plain ${c.v2} -> ${c.v3}, fine ${$1(c.q + " b")?.textContent}`), machine: c => ok(Math.abs(kitVals(c.t)[c.i] - c.v3) === 2, "kit " + kitVals(c.t)[c.i]), within: 5000 }
		],
		async tidy(u, c) { for (let k = 0; k < 6 && c.v0 != null && kitVals(c.t)[c.i] !== c.v0; k++) { u.click("#undo"); await sleep(600); } }
	};
	/* ---- chapters 3 to 7: the Sound page, the effects, the routing page, the master effects, the LFOs, Appendix A ---- */
	/* back to an undo count: Cmd+Z until the history is as long as it was (each step waits for the desk) */
	const undoTo = async (u, n0) => { blur(); for (let i = 0; i < 300 && V.undoCount > n0; i++) { const was = V.undoCount; u.key("z", { cmd: true }); if (!await until(() => V.undoCount < was, 4000)) break; await until(idle, 4000); } };
	/* Every journey is independent (doc/modern-ux/JOURNEYS.md): the runner notes where the page stood when it began (begin: c.back0.undo, c.back0.mode,
	   c.back0.pat, c.back0.chain) and a tidy that changed any of it calls back(u, c), which puts the editor's modes and its undo history back:
	   the transport stopped, the edits undone, PATTERN or SONG mode as found, the pattern the machine was on, no chain. */
	const begin = c => { c.back0 = { gslot: Docs.global?.slot, state: state(), mutes: mutes(), patKit: Docs.patterns[currentPatternSlot()]?.kit, tempo: Docs.global?.tempo, undo: V.undoCount, mode: V.songMode, pat: currentPatternSlot(), kit: currentKitSlot(), kitw: machineState().kit?.working, chain: !!desk().chain?.active }; };
	const back1 = async (u, c) => {
		if (!c.back0) return;
		/* a journey that restarted the machine: the start-up card is waited for, as a person waits */
		if (!$1("#bootcard").hidden) { await until(() => $1("#bootcard").hidden, 120000); await sleep(1500); await until(() => !desk().loading, 90000); }
		if (V.rec) { u.click("#rec"); await sleep(300); }
		if (V.playing) { u.click("#play"); await until(() => !V.playing, 3000); }
		if (c.back0.undo != null) await undoTo(u, c.back0.undo);
		if (desk().chain?.active && !c.back0.chain) { cmd("chainClear"); await sleep(300); }
		if (c.back0.mode != null && V.songMode !== c.back0.mode) { cmd("seqMode", { song: c.back0.mode }); await until(() => V.songMode === c.back0.mode && machineState().songMode === c.back0.mode, 4000); await sleep(300); }
		if (c.back0.pat != null && currentPatternSlot() !== c.back0.pat) { cmd("select", { p: c.back0.pat, now: true }); await until(() => currentPatternSlot() === c.back0.pat, 6000); await until(idle, 4000); }
		if (c.back0.kit != null && currentKitSlot() !== c.back0.kit) { cmd("kitLoad", { k: c.back0.kit, force: true }); await until(() => currentKitSlot() === c.back0.kit, 6000); await until(idle, 4000); }
		/* a kit edited and undone holds the same sounds, but the machine still calls it edited: saved again, it is the kit it was */
		if (c.back0.kitw === "clean" && machineState().kit?.working !== "clean") { cmd("saveKit", { force: true }); await until(() => machineState().kit?.working === "clean", 8000); await until(idle, 4000); }
		/* a slot the journey overwrote (kept with keep(c, "kit", k) before it did): pasted back from the plug-in's clipboard */
		for (const [kind, slot] of c.keptSlots || []) { cmd(kind === "kit" ? "kitPaste" : kind === "pattern" ? "patPaste" : "songPaste", kind === "song" ? { s: slot, force: true } : kind === "kit" ? { k: slot, force: true } : { p: slot, force: true }); await until(idle, 6000); await sleep(300); }
		if (c.back0.gslot != null && Docs.global && Docs.global.slot !== c.back0.gslot) { cmd("globalSlot", { slot: c.back0.gslot }); await until(() => Docs.global?.slot === c.back0.gslot, 6000); await until(idle, 4000); }
		/* the tempo last: loading a pattern or a song may set it */
		if (c.back0.tempo != null && Docs.global && Math.abs(Docs.global.tempo - c.back0.tempo) > 0.05) { cmd("tempo", { bpm: c.back0.tempo }); await until(() => Math.abs(Docs.global.tempo - c.back0.tempo) <= 0.05, 6000); await sleep(300); }
		/* the mutes as they were, and the pattern's kit link (loading another kit links the pattern to it) */
		for (const t of Array(16).keys()) { const was = c.back0.mutes.includes(t); if (mutes().includes(t) !== was) { cmd("mute", { t, on: was }); await settledMutes(); } }
		{ const pd = Docs.patterns[c.back0.pat]; if (pd && c.back0.patKit != null && pd.kit !== c.back0.patKit) { cmd("patternKit", { p: c.back0.pat, v: c.back0.patKit, force: true }); await until(() => Docs.patterns[c.back0.pat]?.kit === c.back0.patKit, 6000); await until(idle, 4000); } }
	};
	/* what back puts right, then waits for the machine's late answers (a pattern or kit change makes it send the kit and the pattern again, seconds on the firmware, and the page redraws when they come):
	   the documents the page holds unchanged for 1.2 s */
	const settled = async () => { let last = "", t0 = performance.now(); const end = t0 + 12000;
		while (performance.now() < end) { const h = JSON.stringify([currentPatternSlot(), currentKitSlot(), Docs.workingKit, Docs.patterns[currentPatternSlot()], machineState().songMode, mutes()]); if (h !== last || !(idle())) { last = h; t0 = performance.now(); } else if (performance.now() - t0 >= 1200) return; await sleep(100); } };
	const back = async (u, c) => {
		if (!c.back0) return;
		const was = state(); await back1(u, c);
		if (Journey.stateDiff(was, state())) await settled();
	};
	/* a slot the journey is about to overwrite: its content goes to the plug-in's clipboard (kitCopy, patCopy, songCopy) and back() pastes it back.
	   One slot per kind at a time (the plug-in holds one clipboard of each) */
	const keep = async (c, kind, slot) => { cmd(kind === "kit" ? "kitCopy" : kind === "pattern" ? "patCopy" : "songCopy", kind === "song" ? { s: slot } : kind === "kit" ? { k: slot } : { p: slot }); await until(idle, 6000); await sleep(200); (c.keptSlots = c.keptSlots || []).push([kind, slot]); };
	/* slots to be overwritten that the product cannot undo (an import): the first goes to the clipboard, each of the others is overwritten by a copy of
	   the first (an undo step that holds that slot's content): back() undoes them, then pastes the first back. Any number of slots */
	const keepMany = async (c, kind, slots) => { await keep(c, kind, slots[0]);
		for (const s of slots.slice(1)) { cmd(kind === "kit" ? "kitCopyTo" : kind === "pattern" ? "patCopyTo" : "songCopyTo", { from: slots[0], to: s, force: true }); await until(idle, 8000); await sleep(300); } };
	/* the kits, patterns and songs an import panel's preview lists (its cells "kit:N", "pattern:N", "song:N"), kept */
	const keepImportTargets = async c => { const it = $all('#syxpop button[data-syxitem]').map(b => b.dataset.syxitem.split(":"));
		for (const kind of ["kit", "pattern", "song"]) { const slots = it.filter(([k]) => k === kind).map(([, n]) => +n); if (slots.length) await keepMany(c, kind, slots); } };
	/* the machines of Appendix A and the knobs the manual lists for each (from the feature data's rows) */
	const MACHINE_KNOBS = new Map([
		[["TRX-BD"], "PTCH DEC RAMP RDEC STRT NOIS HARM CLIP"],
		[["TRX-B2"], "PTCH DEC RAMP HOLD TICK NOIS DIRT DIST"],
		[["TRX-SD"], "PTCH DEC BUMP BENV SNAP TONE TUNE CLIP"],
		[["TRX-XT", "TRX-XC"], "PTCH DEC RAMP RDEC DAMP DIST DTYP"],
		[["TRX-CP"], "CLPY TONE HARD RICH RATE ROOM RSIZ RTUN"],
		[["TRX-RS"], "PTCH DEC DIST"],
		[["TRX-CB"], "PTCH DEC ENH DAMP TONE BUMP"],
		[["TRX-CH", "TRX-OH"], "GAP DEC HPF LPF MTAL"],
		[["TRX-CY"], "RICH DEC TOP TTUN SIZE PEAK"],
		[["TRX-MA"], "ATT SUS REV DAMP RATL RTYP TONE HARD"],
		[["TRX-CL"], "PTCH DEC DUAL ENH TUNE CLIC"],
		[["EFM-BD"], "PTCH DEC RAMP RDEC MOD MFRQ MDEC MFB"],
		[["EFM-SD"], "PTCH DEC NOISE NDEC MOD MFRQ MDEC HPF"],
		[["EFM-XT"], "PTCH DEC RAMP RDEC MOD MFRQ MDEC CLIC"],
		[["EFM-CP"], "PTCH DEC CLPS CDEC MOD MFRQ MDEC HPF"],
		[["EFM-RS"], "PTCH DEC MOD HPF SNAR SPTC SDEC SMOD"],
		[["EFM-CB"], "PTCH DEC SNAP FB MOD MFRQ MDEC"],
		[["EFM-HH"], "PTCH DEC TREM TFRQ MOD MFRQ MDEC FB"],
		[["EFM-CY"], "PTCH DEC FB HPF MOD MFRQ MDEC"],
		[["E12-BD"], "PTCH DEC SNAP SPLEN START RTRG RTIM BEND"],
		[["E12-SD"], "PTCH DEC HP RING STRT RTRG RTIM BEND"],
		[["E12-HT", "E12-LT", "E12-CP", "E12-CB", "E12-CH", "E12-CC", "E12-TA", "E12-TR"], "PTCH DEC HP HPQ STRT RTRG RTIM BEND"],
		[["E12-RS"], "PTCH DEC HP RRTL STRT RTRG RTIM BEND"],
		[["E12-OH"], "PTCH DEC HP STOP STRT RTRG RTIM BEND"],
		[["E12-RC"], "PTCH DEC HP BELL STRT RTRG RTIM BEND"],
		[["E12-BR"], "PTCH DEC HP REAL STRT RTRG RTIM BEND"],
		[["E12-SH"], "PTCH DEC HP SLEW STRT RTRG RTIM BEND"],
		[["E12-BC"], "PTCH DEC HP BC STRT RTRG RTIM BEND"],
		[["P-I-BD"], "PTCH DEC HARD HAMR TENS DAMP"],
		[["P-I-SD"], "PTCH DEC HARD TENS RVOL RDEC RING"],
		[["P-I-MT"], "PTCH DEC HARD HAMR TUNE DAMP SIZE POS"],
		[["P-I-ML"], "PTCH DEC HARD TENS"],
		[["P-I-MA"], "DEC GRNS GLEN SIZE HARD"],
		[["P-I-RS"], "PTCH DEC HARD RING RVOL RDEC"],
		[["P-I-HH"], "PTCH DEC CLSN RING AG AU BR CLOS"],
		[["P-I-RC", "P-I-CC"], "PTCH DEC HARD RING AG AU BR GRAB"],
		[["GND-SIN"], "PTCH DEC RAMP RDEC"],
		[["GND-NS"], "DEC"],
		[["GND-IM"], "UP UVAL DOWN DVAL"],
		[["GND-EMPTY"], ""],
		[["INP-GA", "INP-GB"], "VOL GATE ATCK HLD DEC"],
		[["INP-FA", "INP-FB"], "ALEV GATE FATK FHLD FDEC FDPH FFRQ FQ"],
		[["INP-EA", "INP-EB"], "AVOL AHLD ADEC FQ FDPH FHLD FDEC FFRQ"],
		[["MID-01", "MID-02", "MID-03", "MID-04", "MID-05", "MID-06", "MID-07", "MID-08", "MID-09", "MID-10", "MID-11", "MID-12", "MID-13", "MID-14", "MID-15", "MID-16"], "NOTE N2 N3 LEN VEL PB MW AT"],
		[["CTR-AL", "CTR-8P"], "P1 P2 P3 P4 P5 P6 P7 P8"],
		[["CTR-RE"], "TIME MOD MFRQ FB FILTF FILTW MONO LEV"],
		[["CTR-GB"], "DVOL PRED DEC DAMP HP LP GATE LEV"],
		[["CTR-EQ"], "LF LG HF HG PF PG PQ GAIN"],
		[["CTR-DX"], "ATCK REL TRHD RTIO KNEE HP OUTG MIX"],
		[["ROM-01", "ROM-02", "ROM-03", "ROM-04", "ROM-05", "ROM-06", "ROM-07", "ROM-08", "ROM-09", "ROM-10", "ROM-11", "ROM-12", "ROM-13", "ROM-14", "ROM-15", "ROM-16", "ROM-17", "ROM-18", "ROM-19", "ROM-20", "ROM-21", "ROM-22", "ROM-23", "ROM-24", "ROM-25", "ROM-26", "ROM-27", "ROM-28", "ROM-29", "ROM-30", "ROM-31", "ROM-32", "ROM-33", "ROM-34", "ROM-35", "ROM-36", "ROM-37", "ROM-38", "ROM-39", "ROM-40", "ROM-41", "ROM-42", "ROM-43", "ROM-44", "ROM-45", "ROM-46", "ROM-47", "ROM-48", "RAM-P1", "RAM-P2", "RAM-P3", "RAM-P4"], "PTCH DEC HOLD BRR STRT END RTRG RTIM"]
	].flatMap(([ks, v]) => ks.map(k => [k, v])));
	const synNames = () => $all('#main .pc[data-g="syn"]').map(e => e.dataset.n.replace(/^SYN·/, "")).sort();
	const sortedKnobs = t => t.split(" ").sort().join(" ");
	/* MD-211 to MD-272, MD-274: every machine of Appendix A, picked on a track, shows the knobs the manual lists */
	const machineReference = {
		name: "md-sound-machine-reference", proves: ["MD-211", "MD-212", "MD-213", "MD-214", "MD-215", "MD-216", "MD-217", "MD-218", "MD-219", "MD-220", "MD-221", "MD-222", "MD-223",
			"MD-224", "MD-225", "MD-226", "MD-227", "MD-228", "MD-229", "MD-230", "MD-231", "MD-232", "MD-233", "MD-234", "MD-235", "MD-236", "MD-237", "MD-238", "MD-239", "MD-240",
			"MD-241", "MD-242", "MD-243", "MD-244", "MD-245", "MD-246", "MD-247", "MD-248", "MD-249", "MD-250", "MD-251", "MD-252", "MD-253", "MD-254", "MD-255", "MD-256",
			"MD-257", "MD-258", "MD-259", "MD-260", "MD-261", "MD-262", "MD-263", "MD-264", "MD-265", "MD-266", "MD-267", "MD-268", "MD-269", "MD-270", "MD-271", "MD-272", "MD-274"],
		steps: [
			/* on the firmware, alone from factory memory, the second machine picked on track 1 is refused ("tracks[0] lfo.track = 16 is outside 0..15", the kit as the machine reads it back):
			   it passes in the whole run in order and in the page tier (B-131, a finding: the journey cannot build the data the page accepts) */
			go("sound"), sel(() => soundTrack()),
			{ say: "pick each machine of the catalogue on the track (its family, then its key): the Sound page shows the knobs the manual lists", act: async (u, c) => {
				c.n0 = V.undoCount; c.m0 = V.tracks[c.t].m; c.bad = []; c.n = 0; await keep(c, "kit", V.kit);
				const shot = m => { if (m === "TRX-BD") Journey.snapshot("md-sound-groups"); else if (m === "E12-SD") Journey.snapshot("md-machine-e12"); else if (m === "ROM-01") Journey.snapshot("md-machine-rom"); else if (m === "CTR-RE") Journey.snapshot("md-machine-ctr"); };
				for (const [m, want] of MACHINE_KNOBS) {
					if (!Cat.byName[m]) { c.bad.push(m + ": not in the catalogue"); continue; }
					if (V.tracks[c.t].m !== m) {
						u.click("#machbtn"); await until(() => !$1("#machpop").hidden, 1500); u.click(`#machpop .mf[data-fam="${famKey(m, Cat)}"]`); await sleep(30);
						const key = $1(`#machpop .mk[data-mach="${m}"]`); if (!key) { c.bad.push(m + ": no key in its family"); if (!$1("#machpop").hidden) u.key("Escape"); continue; }
						u.click(key); await until(() => V.tracks[c.t].m === m, 4000); await until(idle, 4000); await sleep(40);
					}
					const got = synNames().join(" "), want2 = sortedKnobs(want);
					if (V.tracks[c.t].m !== m) c.bad.push(m + ": not picked"); else if (got !== want2) c.bad.push(`${m}: ${got} (manual: ${want})`); else c.n++;
					shot(m);
				}
				c.note = `${c.n} machines as the manual lists them`; },
				screen: c => ok(!c.bad.length, c.bad.slice(0, 6).join(" | ") + (c.bad.length > 6 ? ` (+${c.bad.length - 6})` : "")), machine: c => ok(c.n >= 100, c.n + " machines checked"), within: 1000 }
		],
		/* about seventy machine picks overrun the undo history: the kit is kept first (the clipboard) and back() pastes it back */
		async tidy(u, c) { await back(u, c); }
	};
	/* MD-011, MD-056 to MD-064, MD-067 to MD-069: the three knob pages on one page, each track-effect and routing knob moves its kit value */
	const trackEffects = {
		name: "md-sound-track-effects", proves: ["MD-011", "MD-056", "MD-057", "MD-058", "MD-059", "MD-060", "MD-061", "MD-062", "MD-063", "MD-064", "MD-067", "MD-068", "MD-069"],
		steps: [
			go("sound"), sel(() => soundTrack()),
			{ say: "the page shows synthesis, effects and routing knobs together", act: () => Journey.snapshot("md-sound-workspace"),
				screen: () => ok($all('#main .pc[data-g="syn"]').length >= 1 && $all('#main .pc[data-g="fx"]').length === 8 && $all('#main .pc[data-g="rt"]').length >= 5, `syn ${$all('#main .pc[data-g="syn"]').length}, fx ${$all('#main .pc[data-g="fx"]').length}, rt ${$all('#main .pc[data-g="rt"]').length}`) },
			{ say: "focus each effects knob and press an arrow: AMD AMF EQF EQG FLTF FLTW FLTQ SRR each move their own value in the kit", act: async (u, c) => {
				c.n0 = V.undoCount; c.bad = []; c.k0 = kitVals(c.t).slice();
				for (const n of ["AMD", "AMF", "EQF", "EQG", "FLTF", "FLTW", "FLTQ", "SRR"]) {
					const el = $1(`#main .pc[data-g="fx"][data-n="${n}"]`), i = pidx(c.t, n, "fx"); if (!el || i < 0) { c.bad.push(n + ": no knob"); continue; }
					const v0 = kitVals(c.t)[i], d = v0 > 120 ? "ArrowDown" : "ArrowUp", want = v0 + (d === "ArrowUp" ? 1 : -1); el.focus(); u.key(d);
					if (!await until(() => kitVals(c.t)[i] === want, 3000)) c.bad.push(`${n}: ${kitVals(c.t)[i]} for ${want}`);
					await until(idle, 3000);
				} Journey.snapshot("md-track-effects"); },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 },
			{ say: "the same for DIST, DEL and REV on the routing page, and for LFO speed, depth and mix (LFOS, LFOD, LFOM)", act: async (u, c) => {
				c.bad = [];
				const items = [["rt", "DIST", pidx(c.t, "DIST", "rt")], ["rt", "DEL", pidx(c.t, "DEL", "rt")], ["rt", "REV", pidx(c.t, "REV", "rt")], ["lfo", "SPD", 16 + 5], ["lfo", "DEPTH", 16 + 6], ["lfo", "SHMIX", 16 + 7]];
				for (const [g, n, i] of items) {
					const el = $1(`#main .pc[data-g="${g}"][data-n="${n}"]`); if (!el || i < 0) { c.bad.push(n + ": no knob"); continue; }
					const v0 = kitVals(c.t)[i], d = v0 > 120 ? "ArrowDown" : "ArrowUp", want = v0 + (d === "ArrowUp" ? 1 : -1); el.focus(); u.key(d);
					if (!await until(() => kitVals(c.t)[i] === want, 3000)) c.bad.push(`${n}: ${kitVals(c.t)[i]} for ${want}`);
					await until(idle, 3000);
				} },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 }
		],
		async tidy(u, c) { await back(u, c); }
	};
	/* MD-101: a filter sweep on every track at once (Alt-drag FLTF) */
	const filterSweep = {
		name: "md-sound-filter-sweep", proves: ["MD-101"],
		steps: [
			go("sound"), sel(() => soundTrack()),
			{ say: "Alt-drag the filter frequency: FLTF moves on every track that has it", act: async (u, c) => { c.n0 = V.undoCount; c.k0 = allKitVals(); const el = $1('#main .pc[data-g="fx"][data-n="FLTF"]'), d = getV(el) > 64 ? -1 : 1; el.focus(); await u.drag(el, [[d * 4, 0], [d * 8, 0], [d * 16, 0], [d * 24, 0]], { alt: true }); },
				machine: c => { const i = pidx(c.t, "FLTF", "fx"); const moved = [...Array(16).keys()].filter(t => pidx(t, "FLTF", "fx") >= 0 && kitVals(t)[pidx(t, "FLTF", "fx")] !== c.k0[t][pidx(t, "FLTF", "fx")]).length; return ok(moved >= 4, moved + " tracks' FLTF moved"); }, within: 10000 },
			{ say: "Cmd+Z: one step back for all", act: () => Journey.snapshot("md-filter-sweep"), ...undoKey, machine: c => ok(same(allKitVals(), c.k0), "not all back: " + kitDiff(c.k0, allKitVals())), within: 10000 }
		],
		async tidy(u, c) { await back(u, c); }
	};
	/* MD-049, MD-050: the relations: a track's trig mutes, or trigs, another */
	const relationsJ = {
		name: "md-sound-relations", proves: ["MD-049", "MD-050", "MD-290"],
		steps: [
			go("sound"), sel(() => soundTrack()),
			{ say: "choose a track in Mute: this track's trig mutes it", act: (u, c) => { c.n0 = V.undoCount; c.o = (c.t + 1) % 16; u.choose("#mg", c.o); },
				screen: c => ok(V.tracks[c.t].muteGroup === c.o, "view " + V.tracks[c.t].muteGroup), machine: c => ok(kit().tracks[c.t].muteGroup === c.o, "kit " + kit().tracks[c.t].muteGroup), within: 6000 },
			{ say: "choose another track in Trig: this track's trig also trigs it", act: (u, c) => { c.o2 = (c.t + 2) % 16; u.choose("#tg", c.o2); Journey.snapshot("md-relations"); },
				screen: c => ok(V.tracks[c.t].trigGroup === c.o2 && V.tracks[c.t].muteGroup === c.o, `trig ${V.tracks[c.t].trigGroup}, mute ${V.tracks[c.t].muteGroup}`), machine: c => ok(kit().tracks[c.t].trigGroup === c.o2 && kit().tracks[c.t].muteGroup === c.o, `kit trig ${kit().tracks[c.t].trigGroup}, mute ${kit().tracks[c.t].muteGroup}`), within: 6000 },
			{ say: "choose none in both: the relations go", act: u => { u.choose("#mg", ""); u.choose("#tg", ""); },
				machine: c => ok(kit().tracks[c.t].muteGroup == null && kit().tracks[c.t].trigGroup == null, `kit trig ${kit().tracks[c.t].trigGroup}, mute ${kit().tracks[c.t].muteGroup}`), within: 6000 }
		],
		async tidy(u, c) { await back(u, c); }
	};
	/* MD-048, MD-053: a machine kept with its effects and routing or not; clear a machine and undo */
	const keepFxJ = {
		name: "md-sound-keep-clear", proves: ["MD-048", "MD-053"],
		steps: [
			go("sound"), sel(() => soundTrack()),
			{ say: "open the picker: Keep effects + routing is on", act: async (u, c) => { c.n0 = V.undoCount; c.m0 = V.tracks[c.t].m; c.k0 = JSON.stringify(kit().tracks[c.t]); u.click("#machbtn"); await sleep(200); },
				screen: () => ok(!$1("#machpop").hidden && $1("#mpkeep")?.getAttribute("aria-pressed") === "true", "keep " + $1("#mpkeep")?.getAttribute("aria-pressed")) },
			{ say: "pick another machine: its effects and routing are the track's old ones", act: async (u, c) => { u.click('#machpop .mf[data-fam="GND"]'); await sleep(150); c.m1 = $all("#machpop .mk").map(b => b.dataset.mach).find(m => m !== c.m0 && m !== "GND-EMPTY"); u.click(`#machpop .mk[data-mach="${c.m1}"]`); },
				machine: c => { const a = JSON.parse(c.k0), b = kit().tracks[c.t]; return ok(b.machine === c.m1 && same(b.effects, a.effects) && same(b.routing, a.routing), `machine ${b.machine}, effects ${b.effects}, were ${a.effects}`); }, within: 6000 },
			{ say: "open the picker and pick GND-EMPTY (no machine on the track): the track shows GND-EMPTY", act: async u => { u.click("#machbtn"); await sleep(200); u.click('#machpop .mf[data-fam="GND"]'); await sleep(150); u.click('#machpop .mk[data-mach="GND-EMPTY"]'); },
				screen: c => ok(V.tracks[c.t].m === "GND-EMPTY", "view " + V.tracks[c.t].m), machine: c => ok(kit().tracks[c.t].machine === "GND-EMPTY", "kit " + kit().tracks[c.t].machine), within: 6000 },
			{ say: "press Cmd+Z: the machine is back", act: () => { blur(); }, ...undoKey, screen: c => ok(V.tracks[c.t].m === c.m1, "view " + V.tracks[c.t].m), machine: c => ok(kit().tracks[c.t].machine === c.m1, "kit " + kit().tracks[c.t].machine), within: 6000 }
		],
		async tidy(u, c) { if (!$1("#machpop").hidden) closePicker(); await back(u, c); }
	};
	/* MD-071 to MD-074: the four master effects, every knob */
	const masterCards = {
		name: "md-mix-master-cards", proves: ["MD-071", "MD-072", "MD-073", "MD-074", "MD-287"],
		steps: [
			go("mix"),
			{ say: "the Mix page has the Rhythm Echo, Gate Box, Master EQ and Dynamix cards", act: () => Journey.snapshot("md-master-effects"), screen: () => ok(["Rhythm Echo", "Gate Box", "Master EQ", "Dynamix"].every(n => $all("#main .card").some(c => c.textContent.includes(n))) || $all('#main .pc[data-g="mfx"]').length === 32, `${$all('#main .pc[data-g="mfx"]').length} knobs`) },
			{ say: "drag each of the 32 knobs sideways: each moves its own value of its own master effect and no other", act: async (u, c) => {
				c.n0 = V.undoCount; c.bad = []; const keys = { echo: "rhythmEcho", gate: "gateBox", eq: "eq", dyn: "dynamix" };
				for (const el0 of $all('#main .pc[data-g="mfx"]')) {
					/* the machine's answer to the last knob in before this one is measured (under load it arrived mid-drag: "another value moved"); the knob is looked up after it:
					   the page draws the card again when the answer comes (the element looked up before was gone: "not shown") */
					await until(idle, 4000); await sleep(150);
					const q = `#main .pc[data-g="mfx"][data-f="${el0.dataset.f}"][data-n="${el0.dataset.n}"]`, el = $1(q);
					const f = keys[el.dataset.f], names = $all(`#main .pc[data-g="mfx"][data-f="${el.dataset.f}"]`).map(e => e.dataset.n), i = names.indexOf(el.dataset.n);
					const before = JSON.stringify(kit().masterFx), v0 = kit().masterFx[f][i]; try { await nudge(u, el, v0, 24); } catch (e) { const r = el.getBoundingClientRect(); throw new Error(`${f} ${el.dataset.n}: ${e.message} (box ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}, shown ${el.isConnected}, workspace ${S.ws}, window ${innerWidth}x${innerHeight})`); }
					if (!await until(() => kit().masterFx[f][i] !== v0, 3000)) { c.bad.push(`${f} ${el.dataset.n}: stayed ${v0}`); continue; }
					await until(idle, 4000); await sleep(100);
					const now = JSON.parse(JSON.stringify(kit().masterFx)), was = JSON.parse(before); now[f][i] = was[f][i];
					if (JSON.stringify(now) !== before) c.bad.push(`${f} ${el.dataset.n}: another value moved`);
					await until(idle, 3000);
				} },
				screen: c => ok(!c.bad.length, c.bad.slice(0, 5).join(" | ")), within: 1000 }
		],
		async tidy(u, c) { await back(u, c); }
	};
	/* MD-076 to MD-085: the LFO of a track: target, shapes, update, speed, depth, mix, two on one target */
	const lfoJ = {
		name: "md-sound-lfo", proves: ["MD-288", "MD-076", "MD-077", "MD-078", "MD-079", "MD-080", "MD-081", "MD-082", "MD-083", "MD-084", "MD-085"],
		steps: [
			go("sound"),
			{ say: "pick a track, then another: each has its own LFO card, named by its track", act: async (u, c) => { c.n0 = V.undoCount; const ts = soundTracks(); c.a = ts[0]; c.b = ts[1]; u.click(rail(c.a)); await sleep(300); c.ta = $1('[data-sg="lshape"]')?.textContent || ""; u.click(rail(c.b)); await sleep(300); c.tb = $1('[data-sg="lshape"]')?.textContent || ""; },
				screen: c => ok(c.ta.includes(`LFO ${c.a + 1} shape`) && c.tb.includes(`LFO ${c.b + 1} shape`), `"${c.ta.slice(0, 20)}" then "${c.tb.slice(0, 20)}"`) },
			{ say: "choose another track in LFO target (the first list), then a parameter of it (the second)", act: async (u, c) => { c.tt = c.a; u.choose("#lfoT", c.tt); await sleep(200); c.pn = params(c.tt)[3]; u.choose("#lfoP", c.pn); Journey.snapshot("md-lfo"); },
				screen: c => ok(V.tracks[c.b].lfo.TRCK === c.tt && V.tracks[c.b].lfo.PARAM === c.pn, `view ${V.tracks[c.b].lfo.TRCK} ${V.tracks[c.b].lfo.PARAM}`),
				machine: c => ok(kit().tracks[c.b].lfo.track === c.tt && kit().tracks[c.b].lfo.param === params(c.tt).indexOf(c.pn), `kit ${JSON.stringify(kit().tracks[c.b].lfo)}`), within: 6000 },
			{ say: "choose one of the LFO's own parameters (LFOS) of the same track as the target: an LFO on an LFO", act: async (u, c) => { const lp = params(c.tt).find(p => /^(LFOS|SPD)$/.test(p)) || params(c.tt).find(p => /LFO/.test(p)); c.lp = lp; if (lp) u.choose("#lfoP", lp); },
				machine: c => ok(!c.lp || kit().tracks[c.b].lfo.param === params(c.tt).indexOf(c.lp), `kit param ${kit().tracks[c.b].lfo.param} for ${c.lp}`), within: 6000 },
			{ say: "click each of the six SHP1 shapes, then each of the six SHP2 shapes (inverted): the kit follows each", act: async (u, c) => { c.bad = [];
					for (const sl of ["SHP1", "SHP2"]) for (let i = 0; i < 6; i++) { u.click(`[data-slot="${sl}"][data-shape="${i}"]`); const f = sl === "SHP1" ? "shape1" : "shape2";
						if (!await until(() => kit().tracks[c.b].lfo[f] === i && V.tracks[c.b].lfo[sl] === i && $1(`[data-slot="${sl}"][data-shape="${i}"]`)?.getAttribute("aria-pressed") === "true", 3000)) c.bad.push(`${sl} ${i}: kit ${kit().tracks[c.b].lfo[f]}`); await until(idle, 3000); } },
				screen: c => ok(!c.bad.length && $all('[data-slot="SHP1"]').length === 6 && $all('[data-slot="SHP2"]').length === 6, c.bad.join(" | ")), within: 1000 },
			{ say: "click FREE, TRIG and HOLD in the motion card: UPDTE follows", act: async (u, c) => { c.bad = []; for (const [i, n] of ["FREE", "TRIG", "HOLD"].entries()) { u.click(`[data-set="upd"] [data-v="${n}"]`); if (!await until(() => kit().tracks[c.b].lfo.update === i && V.tracks[c.b].lfo.UPDTE === n, 3000)) c.bad.push(`${n}: kit ${kit().tracks[c.b].lfo.update}`); await until(idle, 3000); } },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 },
			{ say: "focus SPD, DEPTH and SHMIX in turn and press an arrow: each moves its routing value (LFOS, LFOD, LFOM)", act: async (u, c) => { c.bad = [];
					for (const [n, i] of [["SPD", 5], ["DEPTH", 6], ["SHMIX", 7]]) { const el = $1(`#main .pc[data-g="lfo"][data-n="${n}"]`), v0 = kit().tracks[c.b].routing[i], d = v0 > 120 ? "ArrowDown" : "ArrowUp", want = v0 + (d === "ArrowUp" ? 1 : -1); el.focus(); u.key(d);
						if (!await until(() => kit().tracks[c.b].routing[i] === want && +$1(`#main .pc[data-g="lfo"][data-n="${n}"] b`)?.textContent === want, 3000)) c.bad.push(`${n}: ${kit().tracks[c.b].routing[i]} for ${want}`); await until(idle, 3000); } },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 },
			{ say: "give the first track's LFO the same target and parameter: two LFOs on one target, both kept", act: async (u, c) => { u.click(rail(c.a)); await sleep(300); u.choose("#lfoT", c.tt); await sleep(200); u.choose("#lfoP", c.lp || c.pn); },
				machine: c => { const A = kit().tracks[c.a].lfo, B = kit().tracks[c.b].lfo; return ok(A.track === B.track && A.param === B.param && A.track === c.tt, `A ${A.track}/${A.param}, B ${B.track}/${B.param}`); }, within: 6000 }
		],
		async tidy(u, c) { await back(u, c); }
	};
	/* MD-075, MD-267 to MD-270 are in the reference journey; MD-075: a CTR machine's knobs are locked from the lane */
	const ctrLocks = {
		name: "md-sound-ctr-locks", proves: ["MD-075"],
		steps: [
			go("sound"), sel(() => soundTrack()),
			{ say: "pick CTR-RE (Control Rhythm Echo) on the track", act: async (u, c) => { c.n0 = V.undoCount; u.click("#machbtn"); await sleep(200); u.click('#machpop .mf[data-fam="CTR"]'); await sleep(150); u.click('#machpop .mk[data-mach="CTR-RE"]'); },
				screen: c => ok(V.tracks[c.t].m === "CTR-RE" && synNames().join(" ") === sortedKnobs("TIME MOD MFRQ FB FILTF FILTW MONO LEV"), synNames().join(" ")), machine: c => ok(kit().tracks[c.t].machine === "CTR-RE", "kit " + kit().tracks[c.t].machine), within: 6000 },
			go("seq"),
			{ say: "click a trig on it, pick the TIME lock key and draw a lock over the trig", act: async (u, c) => { c.s = trigsOf(c.t).filter(s => s < V.len)[0] ?? freeSteps(c.t, 1)[0]; if (!trigsOf(c.t).includes(c.s)) { u.click(cell(c.t, c.s)); await sleep(300); } c.made = !trigsOf(c.t).includes(c.s);
					u.click(rail(c.t)); await sleep(150); const k = $1('#chips .pk[data-lane="TIME"]'); c.i = pidx(c.t, "TIME"); u.click(k); await sleep(150); await u.drag(`#lane .lb[data-s="${c.s}"]`, [[0, 4]], {}, { fy: 0.3 }); },
				machine: c => ok(locksOf(c.t, c.i).some(([x]) => x === c.s), "locks " + JSON.stringify(locksOf(c.t, c.i))), screen: c => ok(S.lane === "TIME", "lane " + S.lane), within: 8000 }
		],
		async tidy(u, c) { await back(u, c); }
	};
	/* ---- chapters 9, 10 and the appendices: the song commands, GLOBAL, SysEx ---- */
	const gOpen = { say: "choose GLOBAL… in the engine menu", act: async u => { await u.pick("engsel", "global"); await sleep(400); }, screen: () => ok(!$1("#globpop").hidden, "panel closed"), machine: () => ok(!!Docs.global?.control, "no global") };
	const GFIELD = { pcIn: ["programChangeIn", false], pcOut: ["programChangeOut", false], local: ["localControl", false], ctrlIn: ["ctrlIn", false], ctrlOut: ["ctrlOut", false] };
	/* MD-170, MD-171, MD-185, MD-186, MD-188, MD-093: the on / off settings of the GLOBAL page, each read back */
	const globalToggles = {
		name: "md-global-settings", proves: ["MD-093", "MD-170", "MD-171", "MD-185", "MD-186", "MD-188", "MD-281"],
		steps: [
			gOpen,
			{ say: "the panel shows the global the machine reported: its slot, its base channel and its sync settings", act: () => Journey.snapshot("md-global-panel"),
				screen: () => ok($all('#globpop [data-ga="slot"]').length === 8 && $all('#globpop [data-ga="slot"]').some(b => b.getAttribute("aria-pressed") === "true"), $all('#globpop [data-ga="slot"]').length + " slot keys"), machine: () => ok(Docs.global.slot != null && Docs.global.baseChannel != null && !!Docs.global.control, "global " + JSON.stringify(Object.keys(Docs.global))) },
			{ say: "click each of PRG CHANGE IN, PRG CHANGE OUT, LOCAL CTRL, CTRL IN and CTRL OUT: each flips in the machine's global, and clicking again puts it back", act: async (u, c) => { c.bad = [];
					for (const [f, [field]] of Object.entries(GFIELD)) { const v0 = Docs.global.control[field]; u.click(tog(f, !v0));
						if (!await until(() => Docs.global.control[field] === !v0 && pressed(tog(f, !v0)), 4000)) c.bad.push(`${f}: ${Docs.global.control[field]}`);
						u.click(tog(f, v0)); if (!await until(() => Docs.global.control[field] === v0, 4000)) c.bad.push(`${f} back: ${Docs.global.control[field]}`); await until(idle, 3000); } },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 },
			{ say: "click TEMPO IN EXT: the machine follows an external clock, the LCD's SYNC says HOST", act: (u, c) => { c.t0 = Docs.global.control.tempoIn; u.click(tog("tempoIn", true)); },
				screen: () => ok(/^host$/i.test($1("#synct")?.textContent), "sync key " + $1("#synct")?.textContent), machine: () => ok(Docs.global.control.tempoIn === "external", "tempo in " + Docs.global.control.tempoIn), within: 6000 },
			{ say: "click TEMPO IN INT: its own clock, SYNC again", act: u => u.click(tog("tempoIn", false)), screen: () => ok(/^sync$/i.test($1("#synct")?.textContent), "sync key " + $1("#synct")?.textContent), machine: () => ok(Docs.global.control.tempoIn === "internal", "tempo in " + Docs.global.control.tempoIn), within: 6000 },
			esc
		],
		async tidy(u, c) { if (Docs.global?.control?.tempoIn === "external") cmd("globalSet", { field: "tempoIn", on: false }); await sleep(400); }
	};
	/* MD-172, MD-168, MD-282: the program change channel, the pattern trig mode, the active global */
	const globalMore = {
		name: "md-global-channel-trig-slot", proves: ["MD-172", "MD-168", "MD-282"],
		steps: [
			gOpen,
			{ say: "click the program change channel up: BASE becomes channel 1, and down again", act: async (u, c) => { c.c0 = Docs.global.control.programChangeChannel; u.click('#globpop [data-ga="pcCh"][data-d="1"]'); await until(() => Docs.global.control.programChangeChannel === Math.min(16, c.c0 + 1), 4000); c.c1 = Docs.global.control.programChangeChannel; u.click('#globpop [data-ga="pcCh"][data-d="-1"]'); },
				screen: c => ok(c.c1 === Math.min(16, c.c0 + 1), "channel " + c.c1), machine: c => ok(Docs.global.control.programChangeChannel === c.c0, "channel " + Docs.global.control.programChangeChannel), within: 6000 },
			{ say: "click GATE, START and QUE under Pattern trig: the machine's mode follows each", act: async (u, c) => { c.t0 = Docs.global.control.trigMode; c.bad = [];
					for (const [i, n] of ["gate", "start", "que"].entries()) { u.click(`#globpop [data-ga="trig"][data-v="${i}"]`); if (!await until(() => Docs.global.control.trigMode === n && $1(`#globpop [data-ga="trig"][data-v="${i}"]`)?.getAttribute("aria-pressed") === "true", 4000)) c.bad.push(`${n}: ${Docs.global.control.trigMode}`); await until(idle, 3000); }
					const i0 = ["gate", "start", "que"].indexOf(c.t0); if (i0 >= 0) u.click(`#globpop [data-ga="trig"][data-v="${i0}"]`); },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")), within: 1000 },
			{ say: "click another global slot key: the machine's active global is that one, and back", act: async (u, c) => { c.s0 = Docs.global.slot; c.s1 = (c.s0 + 1) % 8; u.click(`#globpop [data-ga="slot"][data-v="${c.s1}"]`); await until(() => Docs.global?.slot === c.s1 && machineState().globalSlot === c.s1, 8000); c.mid = machineState().globalSlot; u.click(`#globpop [data-ga="slot"][data-v="${c.s0}"]`); },
				screen: c => ok(c.mid === c.s1, "machine's global " + c.mid), machine: c => ok(Docs.global.slot === c.s0 && machineState().globalSlot === c.s0, "slot " + Docs.global.slot), within: 8000 },
			esc
		]
	};
	/* MD-165, MD-284, MD-276: the map editor: a track's note, Reset map to Elektron's map */
	const globalMapJ = {
		name: "md-global-map-track", proves: ["MD-165", "MD-284", "MD-276"],
		steps: [
			gOpen,
			{ say: "click the note of TRACK 3 up: it plays from the next note", act: async (u, c) => { c.n0 = Docs.global.keymap.indexOf(2); c.back0.undo = V.undoCount; u.click('#globpop [data-ga="map"][data-t="2"][data-d="1"]'); },
				machine: c => ok(Docs.global.keymap.indexOf(2) === c.n0 + 1, `track 3 at note ${Docs.global.keymap.indexOf(2)}, was ${c.n0}`), screen: () => ok(!$1("#globpop").hidden, "panel closed"), within: 6000 },
			{ say: "click Reset map and answer: tracks from C2, patterns from E4", act: async u => { u.click('#globpop [data-ga="resetmap"]'); if (await until(dlgShown, 2000)) u.click(dlgButton("Reset map") || $1("#dlg .danger")); Journey.snapshot("md-map-editor"); },
				machine: () => { const k = Docs.global.keymap; const tn = [36, 38, 40, 41, 43, 45, 47, 48, 50, 52, 53, 55, 57, 59, 60, 62]; return ok(tn.every((n, t) => k[n] === t) && k[64] === 16 && k[65] === 17 && k[67] === 18, `tracks at ${tn.map(n => k[n])}, E4 gives ${k[64]}`); }, within: 8000 },
			esc
		],
		async tidy(u, c) { if (c.back0.undo != null) await undoTo(u, c.back0.undo); }
	};
	/* MD-277: a value moved on a track of each of the four channel groups reaches the machine on its own channel */
	const ccChannels = {
		name: "md-sound-cc-channels", proves: ["MD-277"],
		steps: [
			go("sound"),
			{ say: "move a synthesis value on a track of each group of four (tracks 1, 5, 9 and 13): each reaches the machine", act: async (u, c) => { c.n0 = V.undoCount; c.bad = []; c.n = 0;
					for (const g of [0, 4, 8, 12]) { const t = [g, g + 1, g + 2, g + 3].find(x => soundTracks().includes(x)); if (t == null) { c.bad.push(`group ${g / 4 + 1}: no sound track`); continue; }
						u.click(rail(t)); await sleep(250); const el = $1('#main .pc[data-g="syn"]'); if (!el) { c.bad.push(`T${t + 1}: no knob`); continue; } const n = el.dataset.n, i = pidx(t, n, "syn"), v0 = kitVals(t)[i], d = v0 > 120 ? "ArrowDown" : "ArrowUp", want = v0 + (d === "ArrowUp" ? 1 : -1);
						el.focus(); u.key(d); if (!await until(() => kitVals(t)[i] === want, 4000)) c.bad.push(`T${t + 1} ${n}: ${kitVals(t)[i]} for ${want}`); else c.n++; await until(idle, 3000); } },
				screen: c => ok(!c.bad.length && c.n === 4, c.bad.join(" | ") || c.n + " groups"), within: 1000 }
		],
		async tidy(u, c) { await back(u, c); }
	};
	/* MD-182: the SysEx import's default place is the file's own */
	const syxOriginal = {
		name: "md-lib-syx-original", proves: ["MD-182", "MD-X13"],
		needs: () => window.gmDev ? null : "the page tier opens its own file",
		steps: [
			openImport,
			{ say: "Original place is the one chosen: each kit sits at the slot the file holds it in", act: () => Journey.snapshot("md-sysex-import"),
				screen: () => ok($1('#syxpop [data-sxp="original"]')?.getAttribute("aria-pressed") === "true" && !!$1(syxCell("kit:0")) && !!$1(syxCell("kit:1")) && !$1(syxCell("kit:4")), `original ${$1('#syxpop [data-sxp="original"]')?.getAttribute("aria-pressed")}, cells ${syxKitIds().map(b => b.dataset.syxitem).join(" ")}`) },
			{ say: "click Verify only: each kit is compared with the machine's slot of the same number", act: u => u.click('#syxpop [data-syxgo="verify"]'),
				screen: () => ok(/Nothing was written/.test($1("#syxpop .syxsum")?.textContent || "") && $all("#syxpop [data-syxout]").length >= 2, "progress: " + ($1("#syxpop .syxsum")?.textContent || "")), within: 60000 },
			{ say: "click Done", act: u => u.click('#syxpop [data-syxgo="close"]'), screen: () => ok($1("#syxpop").hidden, "still open") }
		],
		async tidy() { $1("#syxpop").hidden = true; }
	};
	/* MD-197, B-128: Rename sends the name and the slot's own sample again (SysEx 0x73, then SDS); the machine's own name shows. A slot that holds a sample, else there is nothing to send again.
	   The proof is the machine's samples read back with the new name (Docs.samples), so the journey ends once the machine holds it.
	   alone: B-133, after a sample went in by SDS the machine's live recording records no TRIG key and no lock until it starts again
	   (mdDeskFirmwareTest recaftersample): nothing after this journey may meet that (the 0.6 e2e run: md-seq-live-record and
	   md-seq-live-lock failed after it). */
	const sampleRename = {
		name: "md-sampler-rename", alone: true, proves: ["MD-197"],
		steps: [
			go("sampler"),
			{ say: "click a ROM slot, click Rename, type a name and click Rename", act: async (u, c) => { const k = $all(".slotk.rom").find(b => !b.style.opacity) || $all(".slotk.rom")[0]; c.slot = +k.dataset.slot.slice(3); u.click(k); await sleep(300); results.length = 0; u.click(`[data-rename="${c.slot}"]`); await until(() => !!$1("#rname"), 2000); u.type("#rname", "jrny"); await sleep(100); u.click(dlgButton("Rename")); },
				screen: c => ok(($1(".romsel header")?.textContent || "").includes("JRNY"), "card " + ($1(".romsel header")?.textContent || "")),
				machine: c => ok(results.some(r => r.op === "sampleName" && r.ok) && (Docs.samples?.rom?.[c.slot - 1]?.name || "").trim() === "JRNY",
					`results ${results.map(r => r.op + ":" + r.ok).join(",")}; the machine's ROM-${c.slot}: "${Docs.samples?.rom?.[c.slot - 1]?.name ?? "?"}"`), within: 60000 }
		]
	};
	/* MD-280, MD-283: rename the current kit (SysEx 0x55), save it (0x59), and put it back */
	const kitNameSave = {
		name: "md-lib-kit-name-save", proves: ["MD-280", "MD-283"],
		steps: [
			{ say: "click KIT, double-click the current kit, type a name, Enter: the working kit is renamed and not yet saved", act: async (u, c) => { c.k = V.kit; c.n0 = kitName(c.k); c.st = JSON.stringify(Docs.kits[c.k]); u.click("#kitf"); await sleep(250); u.click(ks(c.k), { alt: true }); u.key("F2"); await sleep(250); u.type("#lsin", "journey"); await sleep(100); u.key("Enter"); if (await until(dlgShown, 1500)) u.click($1("#dlg .danger")); },
				screen: c => ok($1("#kitname").textContent.includes("JOURNEY"), "LCD " + $1("#kitname").textContent), machine: c => ok(kitNameText(kitDocOf(Docs).name).trim() === "JOURNEY", "working kit " + kitNameText(kitDocOf(Docs).name)), within: 8000 },
			{ say: "click Save: the slot holds the new name", act: async u => { u.click('#libpop [data-la="save"]'); if (await until(dlgShown, 1500)) u.click(dlgButton("Overwrite") || $1("#dlg .danger")); },
				machine: c => ok(kitName(c.k).trim() === "JOURNEY", "slot " + kitName(c.k)), screen: () => ok(/saved/.test($1("#save").textContent), "chip " + $1("#save").textContent), within: 8000 },
			{ say: "rename it back and save again", act: async (u, c) => { u.click(ks(c.k), { alt: true }); u.key("F2"); await sleep(250); u.type("#lsin", c.n0.trim().toLowerCase()); await sleep(100); u.key("Enter"); if (await until(dlgShown, 1500)) u.click($1("#dlg .danger")); await sleep(400); u.click('#libpop [data-la="save"]'); if (await until(dlgShown, 1500)) u.click(dlgButton("Overwrite") || $1("#dlg .danger")); },
				machine: c => ok(kitName(c.k).trim() === c.n0.trim(), "slot " + kitName(c.k)), within: 10000 },
			esc
		]
	};
	/* MD-143, MD-152, MD-153, MD-155, MD-156, MD-161, MD-295: the song page's limits, END, a part of a pattern, jump, halt, the bar counter and the PATTERN / SONG switch */
	const songCommands = {
		name: "md-song-commands", proves: ["MD-143", "MD-152", "MD-153", "MD-155", "MD-156", "MD-161", "MD-295"],
		steps: [
			go("song"),
			{ say: "the page holds 32 songs of up to 256 rows, and the song ends with END", act: (u, c) => { c.r0 = JSON.stringify(songRows()); c.u0 = V.undoCount; c.m0 = V.songMode; u.click('[data-set="songpick"] button[data-v="song"]'); Journey.snapshot("md-song-workspace"); },
				screen: () => ok($all("[data-ss]").length === 32 && /of 256 rows/.test($1(".arrcard .note")?.textContent || "") && [...$all("#tl .scell")].some(c => c.textContent.trim() === "END"), `${$all("[data-ss]").length} songs, "${$1(".arrcard .note")?.textContent.slice(0, 40)}"`),
				machine: () => ok(Object.keys(Docs.songs).length === 32 && songRows().length >= 1 && Docs.songs[currentSongSlot()].rows.slice(-1)[0].kind === "end", "songs " + Object.keys(Docs.songs).length) },
			{ say: "add a row (pad A01): the bar counter on the LCD goes up", act: async (u, c) => { c.b0 = +($1("#lcd2").innerText.match(/BARS\s*(\d+)/)?.[1]); c.n0 = songRows().length; u.click('[data-addpat="0"]'); await until(() => songRows().length === c.n0 + 1, 4000); c.i = S.songSel; await sleep(300); },
				screen: c => { const b = +($1("#lcd2").innerText.match(/BARS\s*(\d+)/)?.[1]); return ok(b === Math.round(songSteps() / 16) && b > c.b0, `BARS ${b} (was ${c.b0}), rows give ${Math.round(songSteps() / 16)}`); }, machine: c => ok(songRows().length === c.n0 + 1, "rows " + songRows().length) },
			{ say: "open More, then Start + and Length −: the row plays part of its pattern", act: async (u, c) => { if (!S.songMore) { u.click("[data-rowmore]"); await sleep(250); } c.s0 = songRows()[c.i].start; c.e0 = songRows()[c.i].end; u.click('[data-step="ofs"][data-d="1"]'); await until(() => songRows()[c.i].start === c.s0 + 1, 4000); u.click('[data-step="len"][data-d="-1"]'); },
				machine: c => ok(songRows()[c.i].start === c.s0 + 1 && songRows()[c.i].end < c.e0 + 1 && songRows()[c.i].end - songRows()[c.i].start < c.e0 - c.s0, `rows[${c.i}] ${songRows()[c.i].start}-${songRows()[c.i].end}, was ${c.s0}-${c.e0}`), screen: () => ok(!!$1(".partbar .on"), "no part bar"), within: 8000 },
			{ say: "click Add loop, then JUMP: the row is a jump", act: async (u, c) => { u.click('[data-rowact="loop"]'); await until(() => songRows()[c.i + 1]?.kind === "loop", 4000); u.click('[data-set="loopkind"] button[data-v="jump"]'); },
				machine: c => ok(songRows()[c.i + 1]?.kind === "jump", "row " + JSON.stringify(songRows()[c.i + 1])), screen: () => ok($1('[data-set="loopkind"] button[data-v="jump"]')?.getAttribute("aria-pressed") === "true", "JUMP not pressed"), within: 6000 },
			{ say: "click HALT: the row is a halt", act: u => u.click('[data-set="loopkind"] button[data-v="halt"]'), machine: c => ok(songRows()[c.i + 1]?.kind === "halt", "row " + JSON.stringify(songRows()[c.i + 1])), within: 6000 }
		],
		/* the rows and the mode as they were: the next journey that plays (md-seq-page-leds) played this song's part row and
		   its HALT. More's key is on a pattern row only (after HALT the loop row is selected): no click when it is gone */
		async tidy(u, c) { blur(); if (S.songMore && $1("[data-rowmore]")) u.click("[data-rowmore]"); if (c.u0 != null) await undoTo(u, c.u0); if (c.r0) await undoUntil(u, () => JSON.stringify(songRows()) === c.r0, 10);
			if (c.m0 === false && V.songMode !== false) { u.click('[data-set="songpick"] button[data-v="pattern"]'); await until(() => V.songMode === false && idle(), 4000); } }
	};
	/* MD-295: the PATTERN / SONG switch is the machine's status */
	const playModeJ = {
		name: "md-top-play-mode", proves: ["MD-295"],
		steps: [
			{ say: "click PLAY on the LCD's second line: the machine's mode is SONG", act: (u, c) => { c.m0 = V.songMode; u.click(l2("seqmode")); }, screen: c => ok(V.songMode === !c.m0 && l2text("seqmode") === (c.m0 ? "PAT" : "SONG"), `mode ${V.songMode}, LCD ${l2text("seqmode")}`), machine: c => ok(machineState().songMode === !c.m0, "machine " + machineState().songMode), within: 6000 },
			{ say: "click it again: back", act: u => u.click(l2("seqmode")), screen: c => ok(V.songMode === c.m0, "mode " + V.songMode), machine: c => ok(machineState().songMode === c.m0, "machine " + machineState().songMode), within: 6000 }
		]
	};
	/* ---- the rest of chapters 1, 2 and 8: page LEDs, focus info, clearing, swing, mutes, locks ---- */
	/* MD-021, MD-028: the four page LEDs show the page, and follow the play position */
	const pageLeds = {
		name: "md-seq-page-leds", proves: ["MD-021", "MD-028"],
		steps: [
			go("seq"),
			{ say: "click ×2 on the LCD if the pattern has one page: the LEDs show the pages of the pattern's total length", act: async (u, c) => { c.n0 = V.undoCount; c.f0 = S.follow; c.a0 = S.viewAll; if (V.length <= 16) { u.click(l2("dbl")); await until(() => V.length > 16 && patDoc()?.length > 16, 8000); await until(idle, 8000); await sleep(300); } if (!S.viewAll === false) u.click("#pgall"); },
				screen: () => ok($all(".pleds .pl").length === 4 && $all(".pleds .pl:not(.na)").length === V.len / 16, `LEDs ${$all(".pleds .pl").length}, lit ${$all(".pleds .pl:not(.na)").length}, pages ${V.len / 16}`) },
			{ say: "click the second LED: that page is shown, and the LED marks it", act: (u, c) => u.click('.pleds .pl[data-plp="1"]'), screen: () => ok(S.page === 1 && $1('.pleds .pl[data-plp="1"]').classList.contains("cur") && !$1('.pleds .pl[data-plp="0"]').classList.contains("cur") && $1('#seq .st[data-t="0"]').dataset.s === "16", "page " + S.page) },
			{ say: "click the first LED, turn Fol on, press PLAY: the lit LED moves to the second page when the position passes step 16", act: async (u, c) => { u.click('.pleds .pl[data-plp="0"]'); if (!S.follow) u.click("#pgfollow"); tele.steps = []; u.click("#play"); await until(() => S.step >= 16 && S.page === 1, 15000); c.pos = $1("#pos").textContent; Journey.snapshot("md-sequence-workspace"); },
				screen: c => ok(S.page === 1 && $1('.pleds .pl[data-plp="1"]').classList.contains("cur") && /^\d\d\.\d\d$/.test(c.pos), `page ${S.page}, position ${c.pos}`), machine: () => ok(tele.last?.playing && Math.max(...tele.steps) >= 16, "steps " + tele.steps.slice(-4)), within: 16000 },
			{ say: "press STOP", act: u => u.click("#play"), screen: () => ok(!V.playing, "playing") }
		],
		async tidy(u, c) { if (V.playing) u.click("#play"); if (c.f0 != null && S.follow !== c.f0) u.click("#pgfollow"); if (c.a0 != null && S.viewAll !== c.a0) u.click("#pgall"); await back(u, c); }
	};
	/* I-028 (Discord 2026-10-12): the rail's trig lamps on Sequence: a track's number lights while its trig plays, only
	   tracks with a trig light, and none stays lit after STOP */
	const railLamps = {
		name: "md-seq-rail-lamps", proves: [],
		steps: [
			go("seq"),
			{ say: "press PLAY and watch the rail for 2.5 s: the tracks with trigs light, the others never", act: async (u, c) => {
				c.lit = new Set(); const ob = new MutationObserver(ms => { for (const m of ms) if (m.target.classList?.contains("trig")) c.lit.add(+m.target.dataset.sel); });
				ob.observe($1("#rail"), { subtree: true, attributes: true, attributeFilter: ["class"] });
				if (!V.playing) u.click("#play"); await until(() => V.playing, 5000); await sleep(2500); ob.disconnect();
				c.with = V.tracks.map((t, i) => t.trigs.slice(0, V.len).some(Boolean) && audible(i) ? i : -1).filter(i => i >= 0); c.note = `lit ${[...c.lit]}, with trigs ${c.with}`; },
				screen: c => ok(c.lit.size > 0 && [...c.lit].every(i => c.with.includes(i)), `lit ${[...c.lit]}; tracks with trigs ${c.with}`) },
			{ say: "press STOP: no lamp stays lit", act: async u => { if (V.playing) u.click("#play"); await until(() => !V.playing, 5000); await sleep(400); }, screen: () => ok(!$1("#rail .th.trig"), "a lamp stays lit") }
		],
		async tidy(u) { if (V.playing) { u.click("#play"); await sleep(500); } }
	};
	/* MD-031: the Sound page's LCD line says the track, the machine and its name */
	const soundInfo = {
		name: "md-sound-focus-info", proves: ["MD-031"],
		steps: [
			go("sound"), sel(() => soundTrack()),
			{ say: "the LCD's second line names the track and its machine, and the machine key shows the machine", act: () => Journey.snapshot("md-lcd"),
				screen: c => { const t = V.tracks[c.t], l = $1("#lcd2").innerText.replace(/\s+/g, " "); return ok(l.includes("TRACK " + String(c.t + 1).padStart(2, "0")) && l.includes("MACHINE " + t.m) && $1("#machbtn").textContent.includes(t.m), `LCD "${l}", key "${$1("#machbtn").textContent}"`); } },
			{ say: "pick another track: the line follows", act: (u, c) => { c.t2 = soundTracks().find(t => t !== c.t && V.tracks[t].m !== V.tracks[c.t].m) ?? soundTracks()[1]; u.click(rail(c.t2)); },
				screen: c => { const t = V.tracks[c.t2], l = $1("#lcd2").innerText.replace(/\s+/g, " "); return ok(l.includes("TRACK " + String(c.t2 + 1).padStart(2, "0")) && l.includes("MACHINE " + t.m) && $1("#machbtn").textContent.includes(t.m), `LCD "${l}"`); } }
		]
	};
	/* MD-119: Clr on the LCD clears the shown page of the selected track only; undo */
	const clearPageJ = {
		name: "md-seq-clear-page", proves: ["MD-119"],
		steps: [
			go("seq"),
			{ say: "pick a track with trigs and click Clr on the LCD: its page is empty, the other tracks keep theirs", act: async (u, c) => { c.a = soundTracks().find(t => trigsOf(t).length >= 2) ?? soundTrack(); c.o = soundTracks().find(t => t !== c.a && trigsOf(t).length) ?? 0; c.ta = trigsOf(c.a); c.to = trigsOf(c.o); u.click(rail(c.a)); await sleep(200); if (S.stepSel) clearSel(); u.click('.lcdsec [data-sec="clear"]'); },
				machine: c => ok(!trigsOf(c.a).filter(s => s < 16).length && same(trigsOf(c.o), c.to), `track ${c.a + 1} ${trigsOf(c.a)}, other ${trigsOf(c.o)}`), screen: c => ok(!lit(c.a).filter(s => s < 16).length && lit(c.o).length === c.to.filter(s => s < V.len).length, "lit " + lit(c.a)), within: 8000 },
			{ say: "press Cmd+Z: the trigs are back", act: () => blur(), ...undoKey, machine: c => ok(same(trigsOf(c.a), c.ta), "trigs " + trigsOf(c.a)), within: 8000 }
		]
	};
	/* MD-115: Clear what, Locks only: the locks go, the trigs stay; undo */
	/* the dialog's remembered ticks (localStorage, per verb) put back to the defaults, so the next journey starts as on a fresh page */
	const forgetWhat = () => { try { Object.keys(localStorage).filter(k => /^deskWhat\./.test(k)).forEach(k => localStorage.removeItem(k)); } catch (_) { } };
	const clearLocksJ = {
		name: "md-seq-clear-locks", proves: ["MD-115"],
		steps: [
			go("seq"),
			{ say: "pick a track, a lock key, and draw locks over two trigs", act: async (u, c) => { c.t = soundTracks().find(t => trigsOf(t).length >= 2) ?? soundTrack(); u.click(rail(c.t)); await sleep(200); const k = $1('#chips .pk[data-lane="FLTF"]') || $1("#chips .pk[data-lane]"); c.p = k.dataset.lane; c.i = pidx(c.t, c.p); u.click(k); await sleep(150);
					c.on = trigsOf(c.t).filter(s => s < V.len).slice(0, 2); c.tr = trigsOf(c.t); await u.drag(`#lane .lb[data-s="${c.on[0]}"]`, c.on.slice(1).map(s => `#lane .lb[data-s="${s}"]`), {}, { fy: 0.3 }); Journey.snapshot("md-lock-lane"); },
				machine: c => ok(c.on.every(s => locksOf(c.t, c.i).some(([x]) => x === s)), "locks " + JSON.stringify(locksOf(c.t, c.i))), within: 8000 },
			{ say: "press Cmd+Shift+Backspace and tick Locks only, click Clear: the locks go, the trigs stay", act: async (u, c) => { c.u0 = V.undoCount; blur(); u.key("Backspace", { cmd: true, shift: true }); await until(whatShown, 1500); whatTick(u, ["locks"]); u.click("#dlg [data-wgo]"); },
				machine: c => ok(!locksOf(c.t, c.i).length && same(trigsOf(c.t), c.tr), `locks ${JSON.stringify(locksOf(c.t, c.i))}, trigs ${trigsOf(c.t)}`), within: 8000 },
			{ say: "press Cmd+Z: the locks are back", act: () => blur(), ...undoKey, machine: c => ok(c.on.every(s => locksOf(c.t, c.i).some(([x]) => x === s)), "locks " + JSON.stringify(locksOf(c.t, c.i))), within: 8000 }
		],
		async tidy(u, c) { forgetWhat(); if (c.i != null && locksOf(c.t, c.i).length) { u.click("#clearLane"); await sleep(400); } }
	};
	/* MD-133: swing marks copied, pasted and cleared with Copy what */
	const swingCopy = {
		name: "md-seq-swing-copy", proves: ["MD-133"],
		steps: [
			go("seq"), ownMarks("swg"),
			{ say: "pick two tracks that both have a trig on one step, choose the Swing trig type and click that step on the first: a swing mark", act: async (u, c) => { const ts = soundTracks();
					/* neither track's own swing row marks that step yet (a factory row may: B-088) */
					const two = s => ts.filter(t => trigsOf(t).includes(s) && !flagsOf(t, "swing").includes(s));
					c.s = [...Array(Math.min(V.length, V.len)).keys()].find(s => two(s).length >= 2); if (c.s == null) throw new Error("no step with two trigs and no swing");
					[c.a, c.b] = two(c.s); u.click(rail(c.a)); await sleep(200); u.click('#ttlegend [data-tt="swg"]'); await sleep(150); u.click(cell(c.a, c.s)); },
				machine: c => ok(flagsOf(c.a, "swing").includes(c.s) && !flagsOf(c.b, "swing").includes(c.s), `swing ${flagsOf(c.a, "swing")}`), within: 6000 },
			{ ...whatPick("copy", () => { }), say: "click ▾ beside COPY CLR PASTE, then Copy…" },
			{ say: "tick Swing alone and click Copy", act: u => { whatTick(u, ["swing"]); u.click("#dlg [data-wgo]"); }, machine: c => ok(V.clipboard.track && same(V.clipboard.track.what, ["swing"]), "clipboard " + JSON.stringify(V.clipboard.track)), within: 4000 },
			{ say: "pick the second track, ▾ Paste…, click Paste: it has the swing mark", act: async (u, c) => { u.click(rail(c.b)); await sleep(250); u.click("[data-secwhat]"); await until(() => DeskMenu.shown, 1500); u.click('#deskmenu [data-mid="paste"]'); await until(whatShown, 1500); u.click("#dlg [data-wgo]"); },
				machine: c => ok(flagsOf(c.b, "swing").includes(c.s), `swing ${flagsOf(c.b, "swing")}`), within: 8000 },
			{ say: "▾ Clear…, tick Swing alone, click Clear: the swing marks of this track go, its trigs stay", act: async (u, c) => { c.tb = trigsOf(c.b); u.click("[data-secwhat]"); await until(() => DeskMenu.shown, 1500); u.click('#deskmenu [data-mid="clear"]'); await until(whatShown, 1500); whatTick(u, ["swing"]); u.click("#dlg [data-wgo]"); },
				machine: c => ok(!flagsOf(c.b, "swing").length && same(trigsOf(c.b), c.tb), `swing ${flagsOf(c.b, "swing")}, trigs ${trigsOf(c.b)}`), within: 8000 }
		],
		async tidy(u, c) { forgetWhat(); u.click('#ttlegend [data-tt="trig"]'); await back(u, c); }
	};
	/* MD-125: the mutes stay across patterns and across PATTERN / SONG */
	const mutesPersist = {
		name: "md-keys-mutes-persist", proves: ["MD-125"],
		steps: [
			go("seq"),
			{ say: "mute a track with its M key", act: async (u, c) => { c.t = soundTrack(); await settledMutes(); u.click(`#rail [data-mute="${c.t}"]`); await settledMutes(); }, machine: c => ok(mutes().includes(c.t), "mutes " + mutes()) },
			{ say: "click › on the LCD: the next pattern: the mute stays", act: async (u, c) => { c.p0 = currentPatternSlot(); u.click("#patNext"); await confirmIfAsked(u); await until(() => currentPatternSlot() === c.p0 + 1, 5000); await settledMutes(); },
				machine: c => ok(currentPatternSlot() === c.p0 + 1 && mutes().includes(c.t), `pattern ${currentPatternSlot()}, mutes ${mutes()}`), screen: c => ok($1(`#rail [data-mute="${c.t}"]`)?.getAttribute("aria-pressed") === "true", "M key not pressed"), within: 8000 },
			{ say: "switch PLAY to SONG and back: the mute stays", act: async (u, c) => { c.m0 = V.songMode; u.click(l2("seqmode")); await until(() => V.songMode === !c.m0, 5000); await settledMutes(); c.mid = mutes().includes(c.t); u.click(l2("seqmode")); await until(() => V.songMode === c.m0, 5000); await settledMutes(); },
				machine: c => ok(c.mid && mutes().includes(c.t), `in the other mode ${c.mid}, now ${mutes()}`), within: 12000 },
			{ say: "go back to the first pattern and unmute", act: async (u, c) => { u.click("#patPrev"); await confirmIfAsked(u); await until(() => currentPatternSlot() === c.p0, 5000); u.click(`#rail [data-mute="${c.t}"]`); await settledMutes(); }, machine: c => ok(!mutes().includes(c.t), "mutes " + mutes()), within: 8000 }
		],
		async tidy(u, c) { if (c.t != null && mutes().includes(c.t)) { u.click(`#rail [data-mute="${c.t}"]`); await settledMutes(); } if (c.p0 != null && currentPatternSlot() !== c.p0) { u.click("#patPrev"); await confirmIfAsked(u); await sleep(500); } }
	};
	/* MD-137: a pattern holds 64 locked parameters, no more */
	const lockBudget = {
		name: "md-seq-lock-budget", proves: ["MD-137"],
		steps: [
			go("seq"),
			{ say: "open a pattern whose 64 locked parameters are all used: the LCD counter reads 64/64", act: async (u, c) => { c.p0 = currentPatternSlot(); c.p = [...Array(128).keys()].find(p => Docs.patterns[p]?.locks.length >= 64);
					/* B-107 (the 0.6 e2e run): factory memory has no pattern with 64 locks (the page tier's fixture has). The journey
					   makes its own in a pattern with none: a trig on step 1 of each of the 16 tracks, four locked parameters each
					   (undone in tidy) */
					if (c.p == null) { c.u0 = V.undoCount; c.p = [...Array(128).keys()].reverse().find(p => p !== c.p0 && Docs.patterns[p] && !Docs.patterns[p].locks.length); if (c.p == null) throw new Error("no pattern without locks");
						cmd("steps", { p: c.p, from: 0, to: 16, rows: [...Array(16).keys()].map(t => ({ t, on: [0] })) }); await until(idle, 8000); await sleep(300);
						for (let t = 0; t < 16; t++) { for (let i = 0; i < 4; i++) cmd("lock", { p: c.p, t, i, s: 0, v: 40 + i }); await until(idle, 8000); }
						if (!await until(() => Docs.patterns[c.p]?.locks.length >= 64, 20000)) throw new Error("the 64 locks did not come: " + Docs.patterns[c.p]?.locks.length); }
					u.click("#pat"); await until(() => $all("#libpop .ps").length === 128, 3000); u.click(psq(c.p)); await confirmIfAsked(u); await until(() => currentPatternSlot() === c.p, 6000); await sleep(500); },
				screen: () => ok($1("#lockn").textContent === "64/64", "counter " + $1("#lockn").textContent), machine: c => ok(currentPatternSlot() === c.p && patDoc().locks.length === 64, "locks " + patDoc().locks.length), within: 8000 },
			{ say: "pick a track with a trig and a lock key it has not locked, draw a lock: the editor refuses and says so", act: async (u, c) => { u.key("Escape"); await sleep(200);
					for (const t of soundTracks()) { const s = trigsOf(t).filter(x => x < V.len)[0]; if (s == null) continue; const p = [...$all("#chips .pk[data-lane]")].map(e => e.dataset.lane).find(n => pidx(t, n) >= 0 && !V.locks.has(lk(t, n))); if (p) { c.t = t; c.s = s; c.pn = p; break; } }
					if (c.t == null) throw new Error("no free lock row on a track with a trig"); u.click(rail(c.t)); await sleep(250); u.click(`#chips .pk[data-lane="${c.pn}"]`); await sleep(150); c.i = pidx(c.t, c.pn); await u.drag(`#lane .lb[data-s="${c.s}"]`, [[0, 4]], {}, { fy: 0.3 }); },
				screen: () => ok(/64 locked parameters/.test($1("#toast")?.textContent || ""), "toast " + $1("#toast")?.textContent), machine: c => ok(!locksOf(c.t, c.i).length && patDoc().locks.length === 64, `locks ${locksOf(c.t, c.i).length}, rows ${patDoc().locks.length}`), within: 5000 }
		],
		async tidy(u, c) { if (c.p0 != null && currentPatternSlot() !== c.p0) { u.click("#pat"); await sleep(400); u.click(psq(c.p0)); await confirmIfAsked(u); await until(() => currentPatternSlot() === c.p0, 6000); u.key("Escape"); }
			if (c.u0 != null) await undoTo(u, c.u0); }
	};
	/* MD-139: a value moved while recording locks the next trig that has not played */
	const liveLock = {
		name: "md-seq-live-lock", proves: ["MD-139"],
		steps: [
			go("seq"),
			{ say: "pick the track with the most trigs and no FLTF locks", act: (u, c) => { c.t = soundTracks().filter(t => !locksOf(t, pidx(t, "FLTF")).length).sort((a, b) => trigsOf(b).length - trigsOf(a).length)[0] ?? soundTrack(); c.i = pidx(c.t, "FLTF"); u.click(rail(c.t)); },
				machine: c => ok(trigsOf(c.t).length >= 2 && c.i >= 0 && !locksOf(c.t, c.i).length, `track ${c.t + 1}: ${trigsOf(c.t).length} trigs, locks ${locksOf(c.t, c.i).length}`) },
			{ say: "click REC, then the Sound tab: recording, playing", act: async u => { u.click("#rec"); await sleep(300); u.click(tab("sound")); }, screen: () => ok(V.rec && S.ws === "sound", `REC ${V.rec}, workspace ${S.ws}`), machine: () => ok(tele.last?.playing, "not playing"), within: 5000 },
			/* the firmware writes the lock when the track's next trig plays: REC off before that records nothing (the 0.6 e2e run
			   turned it off 600 ms after the drag, before the trig six steps on), so the step waits for the machine's read-back
			   (the desk reads the pattern back while recording) */
			{ say: "drag the FLTF value while it plays: the track's next trig is locked when it plays", act: async (u, c) => { const el = $1('#main .pc[data-n="FLTF"]'); c.v0 = getV(el); results.length = 0; await nudge(u, el, c.v0, 36); await sleep(600); Journey.snapshot("md-live-recording"); },
				machine: c => ok(results.some(r => r.op === "param" && r.ok) && locksOf(c.t, c.i).length >= 1, `results ${results.map(r => r.op + ":" + r.ok).join(",")}; locks ${JSON.stringify(locksOf(c.t, c.i))}`), within: 12000 },
			{ say: "click REC off, then STOP: the pattern is read back with a lock on one of the track's trigs", act: async u => { u.click("#rec"); await sleep(400); if (V.playing) u.click("#play"); },
				screen: () => ok(!V.rec && !V.playing, `REC ${V.rec}, playing ${V.playing}`), machine: c => ok(locksOf(c.t, c.i).length >= 1 && locksOf(c.t, c.i).every(([s]) => trigsOf(c.t).includes(s)), `locks ${JSON.stringify(locksOf(c.t, c.i))}`), within: 12000 }
		],
		async tidy(u, c) { if (V.rec) u.click("#rec"); await sleep(300); if (V.playing) u.click("#play"); await sleep(500);
			/* the lock and the value it moved: its undo steps back (the lane's clear key for what the undo does not hold) */
			await undoTo(u, c.back0.undo);
			if (c.i >= 0 && locksOf(c.t, c.i).length) { u.click(tab("seq")); await sleep(200); u.click('#chips .pk[data-lane="FLTF"]'); await sleep(200); u.click("#clearLane"); await sleep(300); } }
	};
	/* MD-207: the machine's limits, all in the page */
	const limitsJ = {
		name: "md-limits", proves: ["MD-207"],
		steps: [
			go("seq"),
			{ say: "16 tracks on the rail, a kit's 24 values and level on each (384 in all), a pattern's 64 steps and 64 locked parameters", screen: () => ok($all("#rail .th").length === 16 && $1("#lockn").textContent.endsWith("/64") && V.len <= 64, `${$all("#rail .th").length} tracks, counter ${$1("#lockn").textContent}`),
				machine: () => ok(kit().tracks.length === 16 && kit().tracks.every(t => t.synth.length + t.effects.length + t.routing.length === 24) && kit().tracks.reduce((n, t) => n + t.synth.length + t.effects.length + t.routing.length, 0) === 384, "values per track " + kit().tracks.map(t => t.synth.length + t.effects.length + t.routing.length)) },
			{ say: "128 patterns in the chooser", act: u => u.click("#pat"), screen: () => ok($all("#libpop .ps").length === 128, $all("#libpop .ps").length + " tiles"), machine: () => ok(Object.keys(Docs.patterns).length === 128, Object.keys(Docs.patterns).length + " patterns") },
			esc,
			{ say: "64 kits in the library", act: u => u.click("#kitf"), screen: () => ok($all("#libpop .ks").length === 64, $all("#libpop .ks").length + " tiles"), machine: () => ok(Object.keys(Docs.kits).length === 64, Object.keys(Docs.kits).length + " kits") },
			esc,
			{ say: "32 songs on the Song page", act: u => u.click(tab("song")), screen: () => ok($all("[data-ss]").length === 32, $all("[data-ss]").length + " slots"), machine: () => ok(Object.keys(Docs.songs).length === 32, Object.keys(Docs.songs).length + " songs") }
		]
	};
	/* ---------- wave 12: the gaps (doc/release/PLAN-0.6.md, Gap triage) ---------- */
	/* MD-033: the machine's clips over the Sound page's boxes (the catalogue's, measured on the firmware) */
	const machineOnTrack = async (u, c, m) => {
		if (V.tracks[c.t].m === m) return true;
		u.click("#machbtn"); await until(() => !$1("#machpop").hidden, 1500); u.click(`#machpop .mf[data-fam="${famKey(m, Cat)}"]`); await sleep(30);
		const key = $1(`#machpop .mk[data-mach="${m}"]`); if (!key) { if (!$1("#machpop").hidden) u.key("Escape"); return false; }
		u.click(key); await until(() => V.tracks[c.t].m === m, 4000); await until(idle, 4000); return V.tracks[c.t].m === m;
	};
	/* the arches drawn: each must sit over the gap between its two boxes (a box's right edge, the next one's left) */
	const drawnClips = () => $all(".snd .clipmk, .snd .clipgap").map(x => {
		const [a, b] = x.dataset.pair.split(" "), sec = x.closest(".sg"), A = sec?.querySelector(`.pc[data-n="${a}"]`), B = sec?.querySelector(`.pc[data-n="${b}"]`);
		const r = (x.classList.contains("clipgap") ? x : x).getBoundingClientRect(), ra = A?.getBoundingClientRect(), rb = B?.getBoundingClientRect();
		const mid = x.classList.contains("clipgap") ? r.left : r.left + r.width / 2, over = ra && rb && mid >= ra.right - 3 && mid <= rb.left + 3 && Math.abs(ra.top - rb.top) < 2;
		return over ? x.dataset.pair : x.dataset.pair + " (misplaced)";
	}).sort();
	const clipsJ = {
		name: "md-sound-clips", proves: ["MD-033"],
		steps: [
			go("sound"), sel(() => soundTrack()),
			{ say: "put TRX-BD on the track: an arch joins RAMP and RDEC, AMD and AMF, EQF and EQG, FLTF FLTW FLTQ, SPD and DEPTH, as the machine's LCD", act: async (u, c) => {
				c.n0 = V.undoCount; if (!await machineOnTrack(u, c, "TRX-BD")) throw new Error("TRX-BD not picked"); await sleep(120); Journey.snapshot("md-sound-clips"); },
				screen: () => { const d = drawnClips(); return ok(["AMD AMF", "EQF EQG", "FLTF FLTW", "FLTW FLTQ", "RAMP RDEC", "SPD DEPTH"].every(p => d.includes(p)), d.join(", ")); },
				machine: c => ok(V.tracks[c.t].m === "TRX-BD" && JSON.stringify(Cat.byName["TRX-BD"].clips) === "[2,8,10,12,13,21,22]", "catalogue " + JSON.stringify(Cat.byName["TRX-BD"]?.clips)) },
			{ say: "point at RDEC: its tooltip names RAMP", screen: () => ok(($1('.snd .pc[data-g="syn"][data-n="RDEC"]')?.title || "").includes("RAMP"), $1('.snd .pc[data-g="syn"][data-n="RDEC"]')?.title) },
			{ say: "put ROM-01 on the track: no synthesis clip (STRT and END are not joined), the effects' arches stay", act: async (u, c) => { if (!await machineOnTrack(u, c, "ROM-01")) throw new Error("ROM-01 not picked"); await sleep(120); },
				screen: () => { const d = drawnClips(); return ok(!d.includes("RAMP RDEC") && !d.some(p => /STRT|END|PTCH/.test(p)) && d.includes("AMD AMF"), d.join(", ")); },
				machine: c => ok(V.tracks[c.t].m === "ROM-01", "machine " + V.tracks[c.t].m) }
		],
		async tidy(u, c) { await back(u, c); }
	};
	/* MD-043: the machine's UNDO KIT from the kit library (KIT > LOAD KIT > UNDO KIT with the machine's keys) */
	const workingName = () => kitNameText(kitDocOf(Docs)?.name);
	const undoKitJ = {
		name: "md-lib-undo-kit", proves: ["MD-043", "MD-X07"],
		steps: [
			openKits,
			{ say: "rename the kit that plays to UNDOJRNY (an unsaved edit)", act: async (u, c) => {
				c.k0 = V.kit; c.name0 = workingName(); u.click(ks(c.k0), { alt: true }); await sleep(100); u.click('#libpop [data-la="rename"]'); await sleep(200); u.type("#lsin", "UNDOJRNY"); await sleep(100); u.key("Enter"); await confirmIfAsked(u); },
				machine: () => ok(workingName() === "UNDOJRNY" && V.kitState === "edited", `working ${workingName()}, ${V.kitState}`), within: 8000 },
			{ say: "click another kit: it loads without saving (the machine keeps the edited kit as its UNDO KIT)", act: async (u, c) => {
				c.k1 = otherKit(c, [c.k0]); u.click(ks(c.k1)); if (await until(dlgShown, 2000)) u.click(dlgButton("Load without saving") || $1("#dlg .danger")); },
				machine: c => ok(V.kit === c.k1 && workingName() !== "UNDOJRNY", `kit ${V.kit}, working ${workingName()}`), within: 8000 },
			{ say: "click UNDO KIT: the edited kit plays again, unsaved, in its own slot", act: async u => { u.click('#libpop [data-la="undokit"]'); await confirmIfAsked(u); },
				machine: c => ok(V.kit === c.k0 && workingName() === "UNDOJRNY" && V.kitState === "edited", `kit ${V.kit}, working ${workingName()}, ${V.kitState}`),
				screen: c => ok($1("#libpop .lcdchip")?.textContent.includes("K" + nn(c.k0)) && $1("#libpop .lcdchip")?.textContent.includes("edited"), $1("#libpop .lcdchip")?.textContent), within: 10000 },
			esc
		],
		async tidy(u, c) { if (c.k0 == null) return; if (V.kit !== c.k0) { cmd("kitLoad", { k: c.k0, force: true }); await until(() => V.kit === c.k0, 4000); } cmd("reloadKit", { force: true }); await until(() => V.kitState !== "edited", 6000); }
	};
	/* MD-099: a pattern queued while playing starts at STOP, not only at the pattern's end (the panel's STOP; measured) */
	const stopQueuedJ = {
		name: "md-top-stop-queued", proves: ["MD-099"],
		steps: [
			{ say: "press PLAY", act: (u, c) => { c.p0 = currentPatternSlot(); u.click("#play"); }, machine: () => ok(tele.last?.playing, "not playing"), within: 5000 },
			{ say: "just after the pattern starts again, click › on the LCD: the next pattern is queued", act: async (u, c) => {
				await until(() => tele.last?.playing && tele.last.step >= 1 && tele.last.step <= 3, 6000); u.click("#patNext"); await confirmIfAsked(u); c.at = tele.last?.step; },
				machine: c => ok(desk().queued === c.p0 + 1 && currentPatternSlot() === c.p0, `queued ${desk().queued}, pattern ${currentPatternSlot()}`), screen: c => ok($1("#pat").textContent.includes(patName(c.p0 + 1)), "LCD " + $1("#pat").textContent), within: 600 },
			{ say: "press STOP at once: the machine stops and the queued pattern is the current one, long before the pattern's end", act: (u, c) => { c.stopAt = tele.last?.step; u.click("#play"); },
				machine: c => ok(currentPatternSlot() === c.p0 + 1 && !tele.last?.playing && desk().queued == null, `pattern ${currentPatternSlot()}, playing ${tele.last?.playing}, stopped at step ${c.stopAt}`),
				screen: c => ok(!V.playing && V.pat === c.p0 + 1 && $1("#pat").textContent.includes(patName(c.p0 + 1)), `LCD ${$1("#pat").textContent}, view ${V.pat}`), within: 900 }
		],
		async tidy(u, c) { if (V.playing) u.click("#play"); await until(() => !V.playing, 3000); if (c.p0 != null && currentPatternSlot() !== c.p0) { u.click("#patPrev"); await confirmIfAsked(u); } }
	};
	/* MD-106: a pattern made longer repeats its steps into the new ones, as the machine's SCALE SETUP (measured) */
	const trigBits = (d, t) => (d?.tracks[t]?.trigs || []);
	const lenRepeatJ = {
		name: "md-seq-len-repeats", proves: ["MD-106"],
		steps: [
			go("seq"),
			/* B-103: the machine copies only when no track has a trig from the old end on, anywhere up to step 64, and LEN clicked
			   round (32, 48, 64) copies into the later pages on the way up: so the pattern starts empty, LEN goes round to 16 on it,
			   and the trigs are drawn on page 1 after */
			{ say: "an empty pattern from the pattern chooser (none: Alt+Delete clears this one), its LEN clicked round to 16, three trigs drawn on page 1 of one track", within: 20000, act: async (u, c) => {
				await until(() => Object.keys(Docs.patterns).length >= 128, 30000);
				c.p0 = currentPatternSlot(); c.p = emptyPatternSlot();
				if (c.p != null) { u.click("#pat"); await until(() => $all("#libpop .ps").length === 128, 4000); u.click(psq(c.p)); await confirmIfAsked(u); if (!$1("#libpop").hidden) u.key("Escape");
					await until(() => currentPatternSlot() === c.p && !!patDoc(), 6000); await until(idle, 3000); }
				c.n0 = V.undoCount;
				if (c.p == null) { blur(); u.key("Delete", { alt: true }); await until(() => !hasTrigs(currentPatternSlot()), 4000); await until(idle, 3000); }
				for (let i = 0; i < 4 && V.len !== 16; i++) { const was = V.len; u.click(l2("len")); await until(() => V.len !== was, 3000); await until(idle, 3000); }
				c.t = soundTrack(); c.on = [0, 6, 11];
				for (const st of c.on) { u.click(cell(c.t, st)); await sleep(150); }
				await until(() => same(trigsOf(c.t), c.on), 4000); await until(idle, 3000);
				c.before = patDoc().tracks.map(t => t.trigs.slice().sort((a, b) => a - b)); },
				machine: c => ok(V.len === 16 && same(trigsOf(c.t), c.on) && patDoc().tracks.every((t, i) => i === c.t || !t.trigs.length), `LEN ${V.len}, track ${c.t + 1} ${trigsOf(c.t)}`) },
			{ say: "click LEN on the LCD: 32 steps, and steps 1 to 16 repeat into 17 to 32", act: u => u.click(l2("len")),
				machine: c => { const d = patDoc(); const want = c.before.map(a => [...a, ...a.map(s => s + 16)]); const got = d?.tracks.map(t => t.trigs.slice().sort((a, b) => a - b));
					return ok(d?.totalLength === 32 && same(got, want), `total ${d?.totalLength}, T${c.t + 1} ${JSON.stringify(got?.[c.t])} (want ${JSON.stringify(want[c.t])})`); },
				screen: c => ok(V.len === 32 && c.on.every(s => pressed(cell(c.t, s + 16))), `LEN ${V.len}, track ${c.t + 1} steps ${c.on.map(s => s + 17).join(" ")} ${c.on.map(s => pressed(cell(c.t, s + 16)) ? "lit" : "dark").join(" ")}`), within: 6000 },
			{ ...undoKey, machine: c => ok(patDoc()?.totalLength === 16 && same(patDoc().tracks.map(t => t.trigs.slice().sort((a, b) => a - b)), c.before), "total " + patDoc()?.totalLength), within: 6000 }
		],
		async tidy(u, c) { await back(u, c);
			if (c.p0 != null && currentPatternSlot() !== c.p0) { u.click("#pat"); await sleep(400); u.click(psq(c.p0)); await confirmIfAsked(u); await sleep(800); if (!$1("#libpop").hidden) u.key("Escape"); } }
	};
	/* MD-147: the playing song row's passes still to come (the machine's counter, telemetry songRepeats) */
	const leftOf = () => $1("#tl .scell.ph")?.dataset.left;
	const songRepeatsJ = {
		name: "md-song-repeats-left", proves: ["MD-147"],
		steps: [
			go("song"),
			{ say: "stop, then pick an empty song in the song slots (click it, Load; one is cleared first when every slot holds a song)", act: async (u, c) => {
				if (V.playing) { u.click("#play"); await until(() => !V.playing, 3000); } c.s0 = V.songSlot; c.m0 = V.songMode; await until(() => Object.keys(Docs.songs).length >= 32, 20000);
				c.s = emptySong() ?? (await scratch())[0]; await songTo(u, c.s); },
				screen: c => ok(V.songSlot === c.s, "song " + (V.songSlot + 1)), machine: c => ok(songSlotOf(Docs) === c.s, "machine song " + (songSlotOf(Docs) + 1)), within: 20000 },
			{ say: "Arrange: pad A01, then Repeat + twice (the row plays three times), then pad A02", act: async (u, c) => {
				u.click('[data-set="songpick"] button[data-v="song"]'); await sleep(200); u.click('[data-addpat="0"]'); await until(() => songRows().length === 2, 4000);
				for (let i = 0; i < 2; i++) { const r = songRows()[0].repeats; u.click('[data-step="rep"][data-d="1"]'); await until(() => songRows()[0].repeats === r + 1, 4000); }
				u.click('[data-addpat="1"]'); },
				machine: () => ok(songRows().length === 3 && songRows()[0].repeats === 2 && songRows()[1].pattern === 1, "rows " + JSON.stringify(songRows().map(r => [r.pattern, r.repeats]))), within: 8000 },
			{ say: "PATTERN, then SONG: the machine takes the edited song", act: async u => { u.click('[data-set="songpick"] button[data-v="pattern"]'); await until(() => V.songMode === false, 4000); await sleep(300);
				u.click('[data-set="songpick"] button[data-v="song"]'); await until(() => V.songMode === true, 4000); }, machine: () => ok(V.songMode === true && !V.songReload, "songMode " + V.songMode + ", reload " + V.songReload), within: 8000 },
			{ say: "press PLAY: row 001 is marked +2, the line says 2 more", act: (u, c) => { c.lefts = []; u.click("#play"); },
				screen: () => ok(leftOf() === "2" && /row 001 of 2 · A01 · 2 more/.test($1("#songPlays")?.textContent || ""), `mark ${leftOf()}, plays ${$1("#songPlays")?.textContent}`),
				machine: () => ok(tele.last?.playing && tele.last.songRow === 0 && tele.last.songRepeats === 2, `row ${tele.last?.songRow}, repeats ${tele.last?.songRepeats}`), within: 8000 },
			{ say: "the second pass: +1, the third: last; then row 002 has none", act: async (u, c) => {
				const end = performance.now() + 12000; while (performance.now() < end && tele.last?.songRow !== 1) { const l = leftOf(); if (l != null && c.lefts[c.lefts.length - 1] !== l) c.lefts.push(l); await sleep(40); } },
				screen: c => ok(c.lefts.join(" ") === "2 1 0" && !leftOf(), `marks ${c.lefts.join(" ")}, now ${leftOf()}`), machine: () => ok(tele.last?.songRow === 1 && tele.last.songRepeats === 0, `row ${tele.last?.songRow}, repeats ${tele.last?.songRepeats}`), within: 4000 },
			{ say: "press STOP", act: u => { if (V.playing) u.click("#play"); }, screen: () => ok(!$1("#tl .scell.ph"), "still marked"), machine: () => ok(!V.playing, "playing") }
		],
		tidy: songPlayheadTidy
	};
	const wave12 = [clipsJ, undoKitJ, stopQueuedJ, lenRepeatJ, songRepeatsJ];
	const slice5 = [modeJ, scaleJ, amountsJ, tempoSteps, chooserJ, kitMenuJ, kitMemoryJ, revertTrackJ, quickJ, knobSteps, machineReference, trackEffects, filterSweep, relationsJ, keepFxJ, masterCards, lfoJ, ctrLocks, globalToggles, globalMore, globalMapJ, ccChannels, syxOriginal, sampleRename, kitNameSave, songCommands, playModeJ, pageLeds, railLamps, soundInfo, clearPageJ, clearLocksJ, swingCopy, mutesPersist, lockBudget, liveLock, limitsJ];
	/* ---------- the end-to-end pass: factory content as a person uses it (scripts/mdmm-e2e.sh, doc/release/E2E.md) ---------- */
	/* What the machine plays, as the page can see it: the transport and the step from the telemetry, the song row, the output's
	   peaks (the plug-in's outputLevel, every 250 ms, since the last one). Not silent where sound is the point. */
	const heard = { peak: 0 };
	Bridge.onMessage(m => { if (m.type === "outputLevel") heard.peak = Math.max(heard.peak, m.peakL || 0, m.peakR || 0); });
	/* play what is loaded for up to ms, until it has moved on `moves` steps (and, when asked, onto another song row): what was heard */
	const playFor = async (u, ms, wantRows) => {
		const r = { started: false, steps: new Set(), rows: new Set(), peak: 0 };
		heard.peak = 0; tele.steps = [];
		await until(idle, 8000);
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
		u.click("#play"); await until(() => !V.playing && !tele.last?.playing, 5000);
		return r;
	};
	const hasTrigs = p => (Docs.patterns[p]?.tracks || []).some(t => t.trigs.length);
	const songNames = () => Object.keys(Docs.songs).map(Number).filter(s => (Docs.songs[s]?.rows || []).some(r => r.kind === "pattern")).sort((a, b) => a - b);
	const realSongs = {
		name: "md-real-factory-songs", proves: ["MD-X02", "MD-X02"],
		steps: [
			go("song"),
			{ say: "from factory memory: load each song that holds rows (click it, Load), SONG mode, PLAY: the machine starts, the step moves, the song moves on to a later row, the output is not silent, STOP stops it", within: 3000,
				act: async (u, c) => {
					await until(() => Object.keys(Docs.songs).length >= 32, 30000);
					c.songs = songNames(); c.bad = []; c.good = []; c.s0 = V.songSlot; c.m0 = V.songMode;
					if (!c.songs.length) throw new Error("no factory song holds rows");
					for (const s of c.songs) {
						Bridge.log(`E2E song ${s + 1}: loading (machine song ${songSlotOf(Docs) + 1}, playing ${!!V.playing})`);
						await songTo(u, s);
						Bridge.log(`E2E song ${s + 1}: loaded, song mode ${V.songMode}`);
						u.click('[data-set="songpick"] button[data-v="song"]'); await until(() => V.songMode === true, 6000); await sleep(300);
						Bridge.log(`E2E song ${s + 1}: SONG mode ${V.songMode}, dialog ${dlgShown()}, desk tx ${!!desk().tx}`);
						const rows = (Docs.songs[s]?.rows || []).filter(r => r.kind === "pattern").length;
						let r = await playFor(u, 10000, rows > 1);
						if (!r.started) {	/* a person tries the row's From here next: said, so the finding is exact */
							u.click('.scell[data-i="0"]'); await sleep(200); u.click('[data-rowact="from"]');
							const via = await until(() => !!tele.last?.playing, 5000);
							Bridge.log(`E2E song ${s + 1}: PLAY did not start it; From here ${via ? "did" : "did not either"}`);
							if (via) { r = await playFor(u, 10000, rows > 1).then(x => x, () => r); u.click("#play"); }
							r.viaFrom = via; if (V.playing) { u.click("#play"); await until(() => !V.playing, 4000); }
						}
						if (s === c.songs[0]) { Journey.snapshot("md-real-song-playing"); }
						const why = [!r.started && `PLAY did not start it (pressed twice)${r.viaFrom === true ? ", From here did" : r.viaFrom === false ? ", From here did not either" : ""}`, r.again && r.started && "needed a second press of PLAY", r.started && r.steps.size < 4 && `only ${r.steps.size} steps moved`, r.peak <= 0.0002 && "silent", rows > 1 && r.rows.size < 2 && `stayed on row ${[...r.rows].join(",") || "?"}`, V.playing && "did not stop"].filter(Boolean);
						Bridge.log(`E2E song ${s + 1}: ${rows} rows, ${r.steps.size} steps, rows ${[...r.rows].join(",")}, peak ${r.peak.toFixed(3)}${why.length ? " PROBLEM " + why.join(", ") : ""}`);
						(why.length ? c.bad : c.good).push(why.length ? `song ${s + 1} (${rows} rows): ${why.join(", ")}` : s + 1);
					}
					if (c.bad.length && c.bad.every(b => /silent/.test(b))) c.bad.push("every song reads silent: the background run zeroes the output (run with GEARMULATOR_MDMM_BACKGROUND_METER=1, scripts/mdmm-e2e.sh)");
					c.note = `${c.good.length} of ${c.songs.length} songs played: ${c.good.join(" ")}`;
				}, screen: c => ok(!c.bad.length, c.bad.join("; ")) }
		],
		async tidy(u, c) { if (V.playing) u.click("#play"); if (c.m0 === false) { cmd("seqMode", { song: false }); await sleep(800); } if (c.s0 != null) await songTo(u, c.s0).catch(() => { }); await back(u, c); }
	};
	const realPatterns = {
		name: "md-real-factory-patterns", proves: ["MD-X03", "MD-X03"],
		steps: [
			{ say: "from factory memory: pick eight patterns that hold trigs, spread over the 128, one after the other, and PLAY each: the step moves through the pattern and the output is not silent", within: 3000,
				act: async (u, c) => {
					await until(() => Object.keys(Docs.patterns).length >= 128, 30000);
					const withTrigs = [...Array(128).keys()].filter(hasTrigs);
					c.picks = [...Array(8).keys()].map(k => withTrigs[Math.floor(k * withTrigs.length / 8)]).filter(p => p != null);
					c.bad = []; c.good = []; c.p0 = currentPatternSlot();
					if (!c.picks.length) throw new Error("no factory pattern holds trigs");
					for (const p of c.picks) {
						u.click("#pat"); await until(() => $all("#libpop .ps").length === 128, 4000); u.click(psq(p)); await confirmIfAsked(u);
						if (!await until(() => currentPatternSlot() === p, 6000)) { c.bad.push(`pattern ${p + 1}: the machine stayed on ${currentPatternSlot() + 1}`); continue; }
						if (!$1("#libpop").hidden) u.key("Escape");
						await sleep(300);
						const r = await playFor(u, 12000, false);
						if (p === c.picks[0]) Journey.snapshot("md-real-pattern-playing");
						const why = [!r.started && "did not start (pressed twice)", r.again && r.started && "needed a second press of PLAY", r.started && r.steps.size < 8 && `only ${r.steps.size} steps moved`, r.peak <= 0.0002 && "silent"].filter(Boolean);
						Bridge.log(`E2E pattern ${p + 1}: ${r.steps.size} steps, peak ${r.peak.toFixed(3)}${why.length ? " PROBLEM " + why.join(", ") : ""}`);
						(why.length ? c.bad : c.good).push(why.length ? `pattern ${p + 1}: ${why.join(", ")}` : p + 1);
					}
					c.note = `${c.good.length} of ${c.picks.length} patterns played: ${c.good.join(" ")}`;
				}, screen: c => ok(!c.bad.length, c.bad.join("; ")) }
		],
		async tidy(u, c) { if (V.playing) u.click("#play"); if (c.p0 != null && currentPatternSlot() !== c.p0) { u.click("#pat"); await sleep(400); u.click(psq(c.p0)); await sleep(800); if (!$1("#libpop").hidden) u.key("Escape"); } }
	};
	/* What you draw is what plays: in an empty pattern four trigs are drawn, the machine plays them (steps move, the output is not
	   silent); the pattern cleared, it plays silence; one undo and it plays them again. The page can read the transport and the
	   output's peaks, not each trig the firmware fires: the peaks stand for "the trigs play". */
	const playPeak = async (u, ms, skip) => {
		heard.peak = 0; tele.steps = [];
		await until(idle, 8000);
		u.click("#play");
		const started = await until(() => !!tele.last?.playing, 5000);
		await sleep(skip); heard.peak = 0; await sleep(ms - skip);
		const r = { started, peak: heard.peak, steps: new Set(tele.steps).size };
		u.click("#play"); await until(() => !V.playing && !tele.last?.playing, 5000);
		return r;
	};
	const emptyPatternSlot = () => [...Array(128).keys()].find(p => Docs.patterns[p] && !hasTrigs(p));
	const realSequence = {
		name: "md-real-sequence-plays", proves: ["MD-X24"],
		steps: [
			go("seq"),
			{ say: "pick a pattern with no trigs in the pattern chooser", within: 20000,
				act: async (u, c) => { await until(() => Object.keys(Docs.patterns).length >= 128, 30000); c.p0 = currentPatternSlot(); c.p = emptyPatternSlot(); if (c.p == null) throw new Error("no empty pattern"); await keep(c, "pattern", c.p);
					u.click("#pat"); await until(() => $all("#libpop .ps").length === 128, 4000); u.click(psq(c.p)); await confirmIfAsked(u); if (!$1("#libpop").hidden) u.key("Escape"); },
				machine: c => ok(currentPatternSlot() === c.p && !hasTrigs(c.p), "pattern " + currentPatternSlot()) },
			sel(() => soundTrack()),
			{ say: "click four steps on that track", act: async (u, c) => { c.steps = [0, 4, 8, 12]; for (const s of c.steps) { u.click(cell(c.t, s)); await sleep(150); } await sleep(300); Journey.snapshot("md-real-sequence-drawn"); },
				machine: c => ok(c.steps.every(s => trigsOf(c.t).includes(s)) && idle(), `pattern has ${trigsOf(c.t).join(",")}`) },
			{ say: "press PLAY for six seconds: the position moves through the pattern and the output is not silent", within: 3000,
				act: async (u, c) => { c.on = await playPeak(u, 6000, 1500); }, machine: c => ok(c.on.started && c.on.steps >= 8 && c.on.peak > 0.0002, `started ${c.on.started}, ${c.on.steps} steps, peak ${c.on.peak.toFixed(4)}`) },
			{ say: "press Alt+Delete: the pattern is cleared; PLAY: it moves and plays silence", within: 3000,
				act: async (u, c) => { document.activeElement?.blur?.(); u.key("Delete", { alt: true }); await until(() => !hasTrigs(c.p) && idle(), 8000); await sleep(1500); c.off = await playPeak(u, 5000, 1500); Journey.snapshot("md-real-sequence-cleared"); },
				machine: c => ok(c.off.started && c.off.steps >= 8 && c.off.peak < 0.0001, `started ${c.off.started}, ${c.off.steps} steps, peak ${c.off.peak.toFixed(4)}`) },
			{ say: "press Cmd+Z once: the four trigs are back and play again", within: 3000,
				act: async (u, c) => { u.key("z", { cmd: true }); await until(() => c.steps.every(s => trigsOf(c.t).includes(s)) && idle(), 8000); c.back = await playPeak(u, 6000, 1500); },
				machine: c => ok(c.steps.every(s => trigsOf(c.t).includes(s)) && c.back.started && c.back.peak > 0.0002, `trigs ${trigsOf(c.t).join(",")}, peak ${c.back.peak.toFixed(4)}`) }
		],
		/* the pattern it drew in and cleared: undone, then pasted back from the clipboard (a clear leaves more than the trigs behind) */
		async tidy(u, c) { if (V.playing) u.click("#play"); await back(u, c); }
	};
	const e2eReal = [realSongs, realPatterns, realSequence];

	/* Screen review 2026-10-13 (B-110 and on): the screens the review found cut or overlapped, measured at the page's size
	   (the page tier runs at 1440 x 924, as the review's pictures) */
	const closePops = async u => { for (let i = 0; i < 4 && (!$1("#libpop").hidden || !$1("#modalbg").hidden); i++) { if (dlgShown()) u.click(dlgButton("Cancel") || $1("#dlg .danger")); else u.key("Escape"); await sleep(300); } };
	const screensFit = {
		name: "md-screens-fit", proves: [],
		steps: [
			{ say: "Sequence: the track list's rows (number, name, M, S, dice) sit on one centre line, whole, and the keys are one size (B-110)",
				act: async (u, c) => { await closePops(u); u.click(tab("seq")); await sleep(400); c.bad = []; c.n = 0;
					for (const r of $all("#rail .th")) { c.n++; const mid = e => { const q = e.getBoundingClientRect(); return q.top + q.height / 2; }, ks = [".m", ".s", ".g"].map(q => r.querySelector(q)), n = r.querySelector(".n"), nm = r.querySelector(".nm b");
						if (ks.some(k => !k)) { c.bad.push("a key is missing on " + r.textContent.trim().slice(0, 12)); continue; }
						const ms = [...ks, n, nm].map(mid), size = ks.map(k => { const q = k.getBoundingClientRect(); return Math.round(q.width) + "x" + Math.round(q.height); });
						if (Math.max(...ms) - Math.min(...ms) > 1.5) c.bad.push(`track ${r.dataset.sel}: centres ${ms.map(Math.round).join(",")}`);
						if (new Set(size).size > 1) c.bad.push(`track ${r.dataset.sel}: key sizes ${size.join(" ")}`); }
					c.bad.push(...Journey.cutText($1("#rail")), ...Journey.overlaps("#rail .th .ms", "#rail .th .n, #rail .th .nm")); },
				screen: c => ok(c.n === 16 && !c.bad.length, `${c.n} rows; ${c.bad.slice(0, 4).join(" | ")}`) }
			,{ say: "the GEN dialog is the same size and its right-hand keys stay where they are in Euclid, Random and Keep; the summary shows whole",
				act: async (u, c) => { await closePops(u); u.click(tab("seq")); await sleep(400); await genAt(u, 0); c.boxes = [];
					for (const k of ["euclid", "random", "keep"]) { u.click(`#genpop [data-genkind="${k}"]`); await sleep(250); const p = $1("#genpop").getBoundingClientRect(), r = $1("#genpop [data-rand]").getBoundingClientRect(), d = $1("#genpop [data-genclose]").getBoundingClientRect(); c.boxes.push([k, ...[p.left, p.top, p.width, p.height, r.left, r.top, d.left, d.top].map(Math.round)].join(" ")); }
					c.bad = [...Journey.cutText($1("#genpop")), ...Journey.spills("#genpop .gdsum")]; c.text = $1("#genpop .gdsum")?.textContent.trim(); u.click("#genpop [data-gencancel]"); await sleep(250); },
				screen: c => ok(c.text && !c.bad.length && new Set(c.boxes.map(x => x.split(" ").slice(1).join(" "))).size === 1, `"${c.text}" ${c.bad.join(" | ")} ${c.boxes.join(" / ")}`) }
			,{ say: "Sound, Mix and Sampler: what the drawn panels draw fits them: no handle cut by an edge, no caption past the edge (B-117)",
				act: async (u, c) => { c.bad = []; c.n = 0; for (const ws of ["sound", "mix", "sampler"]) { u.click(tab(ws)); await sleep(500); const cv = $all("canvas.ed").filter(x => x.clientWidth && ED[x.dataset.ed]); c.n += cv.length; for (const x of cv) for (const p of Journey.canvasProblems(x, drawEd, { crossing: false })) c.bad.push(`${ws} ${x.dataset.ed}: ${p}`); } u.click(tab("seq")); },
				screen: c => ok(c.n > 5 && !c.bad.length, `${c.n} canvases; ${[...new Set(c.bad)].slice(0, 5).join(" | ")}`) }
			,{ say: "a handle at the very edge of a panel (value 0 or 127) is drawn whole: a probe canvas with handles on all four edges (B-117)",
				act: async (u, c) => { const cv = document.createElement("canvas"); cv.className = "ed"; cv.dataset.ed = "__probe"; cv.style.cssText = "position:fixed;left:10px;top:10px;width:200px;height:100px;opacity:0;pointer-events:none"; document.body.appendChild(cv);
					ED.__probe = { draw() {}, handles: (W, H) => [{ x: 0, y: 50, k: "L", c: "#000" }, { x: W, y: 50, k: "R", c: "#000" }, { x: W / 2, y: 0, k: "T", c: "#000" }, { x: W / 2, y: H, k: "B", c: "#000" }] };
					try { c.bad = Journey.canvasProblems(cv, drawEd, { crossing: false }); } finally { delete ED.__probe; cv.remove(); } },
				screen: c => ok(!c.bad.length, c.bad.join(" | ")) }
		],
		async tidy(u) { await closePops(u); u.click(tab("seq")); }
	};
	const all = [screensFit, ...slice5, ...wave12, ...e2eReal, bootCard, firstBeat, spaceTransport, pauseJ, panicJ, tempoWindowJ, tempoReleaseJ, playFromJ, tempoDrag, tapTempo, tapTempoB, tapTempoShift, patStep, queuePattern, plate, wsKeys, helpKeys, osHelp, undoRedo,
		paintUndo, accentSlide, trigTypesJ, lockLane, pagesJ, copyPaste, copyWhat, clearWhat, lfoMenuJ, selectCopyPaste, stepMenuJ, osCopyPaste, buttonsCopyPaste, clearPatternJ, fillEveryJ, rotateJ, rotateUndo, trackKeys, muteKeys, liveRec, liveErase, liveUnlock,
		genJourney("md-gen-mutate-undo", false, { proves: ["MD-X04", "MD-X05"] }), genJourney("md-gen-defaults-mutate-undo", true, { proves: ["MD-X04"] }), genKeys, genModal, laneTools,
		shapeSound, typeValue, arrows, machinePick, machAudition, soundCopy, editorDrag, controlAll, globalKey, globalClickOut, songModeJ,
		mixSolo, soloSaved, shiftMutes, allOff, fader, lev, outKey, masterFx,
		songArrange, songChain, songPlayhead, songSlots, songKeys, shotsSongSlots, samplerSlots, samplerSetup, audition,
		libDialog, kitCopy, kitRename, kitClear, patGo, patClear, dialogEsc,
		globalJ, globalRouting, globalMapNote, globalPage, globalCopyPaste, globalTrigIn, globalLearn, noteLights, audioPanel, romCard, notePlay,
		lockRamp, pasteMany, mutScope, songInspector, songDrag, ramView, setupChop, panBox, hwNoMachine, syxImportJ,
		syxImportMute, globalReset, shotsGlobal, shotsSound, shotsReview, shots, shotsSong, shotsImport, editorMenuJ, memoryJ, shotsMenu, ...cpuJs, ...volJs,
		dropSyxJ, dropSampleJ, ...viewJs, syxExportKinds, syxVerify, syxPlace, modalLock, songFactoryPlay, lockKeysFit, resetFactory, resetEmpty, syxRunningReach];
	/* every journey's tidy is followed by a look: if the machine's documents or modes still differ from what the journey found, back(u, c) puts them back (the journey's own tidy first, for what is its own;
	   its guard, "left:", names what stays). What back cannot put back, the journey keeps first (keep, keepMany) or is alone: true (doc/modern-ux/JOURNEYS.md, "Independent journeys") */
	for (const j of all) { const own = j.tidy; j.tidy = async (u, c) => { try { if (own) await own(u, c); } finally { if (c.back0?.state && Journey.stateDiff(c.back0.state, state())) await back(u, c); } }; }

	/* ---------- demos: journeys played for a camera (doc/modern-ux/DEMO-VIDEOS.md) ---------- */
	/* Not in `all`: ?selftest=journey never runs them; ?selftest=demo-md-<name> does (Journey.demo), at a person's pace
	   with the drawn pointer. Each step is still checked on the screen and on the machine, so a demo that stops
	   working fails like a journey does. hold: how long the step is left to sound; caption: the video's line. */
	const look = async (u, q, m, fx, fy) => { await u.glide(q, fx, fy); u.click(q, m, fx, fy); };
	const trackCount = p => (Docs.patterns[p]?.tracks || []).filter(t => t.trigs.length).length;
	const trigCount = p => (Docs.patterns[p]?.tracks || []).reduce((n, t) => n + t.trigs.length, 0);
	/* the pattern that makes the fullest groove: the most tracks playing, then the most trigs */
	const fullest = () => Object.keys(Docs.patterns).map(Number).filter(hasPat).sort((a, b) => trackCount(b) - trackCount(a) || trigCount(b) - trigCount(a))[0];
	const busy = () => [...Array(16).keys()].filter(t => trigsOf(t).length && soundTracks().includes(t));
	const strip = (i, k) => `.strip[data-sel="${i}"] .ms.${k}`;
	/* demo-md-groove (about 28 s): opens on the fullest pattern already playing, GEN rolls a hi-hat, a drag mutes three
	   tracks and back, a solo, an Alt-drag filter sweep of the whole kit (undone), and the groove plays on under the
	   end card. Captions: about six words a line, two lines at most (the video script renders them). */
	const groove = {
		name: "demo-md-groove",
		card: "Machinedrum Editor|Free · pay what you want|Coming soon",
		/* before the camera: the fullest pattern and its kit, playing */
		setup: [
			{ say: "the Sequence workspace", act: async u => { u.click(tab("seq")); }, screen: () => onTab("seq") },
			{ say: "click the pattern on the LCD: the chooser opens", act: async u => { u.click("#pat"); },
				screen: () => ok(!$1("#libpop").hidden && $all("#libpop .ps").length === 128, "chooser closed"), machine: () => ok(Object.keys(Docs.patterns).length === 128, Object.keys(Docs.patterns).length + " patterns read"), within: 8000 },
			{ say: "click the fullest pattern: it and its kit load", act: async (u, c) => {
				c.p = fullest(); if (c.p == null) throw new Error("no pattern with trigs on this machine");
				u.click(psq(c.p)); await confirmIfAsked(u); c.note = `pattern ${patName(c.p)}: ${trackCount(c.p)} tracks, ${trigCount(c.p)} trigs`;
			}, machine: c => ok(currentPatternSlot() === c.p && idle(), "machine pattern " + currentPatternSlot()), within: 6000 },
			{ say: "press Escape: the chooser closes", act: async u => { u.key("Escape"); }, screen: () => ok($1("#libpop").hidden, "still open") },
			{ say: "press PLAY", act: async u => { tele.steps = []; u.click("#play"); }, screen: () => ok(V.playing, "not playing"), machine: () => ok(tele.last?.playing && new Set(tele.steps).size >= 2, "telemetry " + tele.steps.join(",")), within: 6000 }
		],
		steps: [
			{ say: "the groove plays", caption: "Your Machinedrum, on screen.", act: async u => { await u.glide("#seq .st[data-t=\"0\"][data-s=\"8\"]", 0.5, 0.5, 700); },
				machine: () => ok(tele.last?.playing, "not playing"), hold: 1700 },
			{ say: "pick a hi-hat (or snare) track on the rail", caption: "Roll a fresh hi-hat groove", act: async (u, c) => {
				const role = t => genRole(V.tracks[t].m), b = busy();
				c.t = b.find(t => role(t) === "hat") ?? b.find(t => role(t) === "snare") ?? b.find(t => role(t) !== "kick") ?? soundTrack();
				await look(u, rail(c.t)); c.p0 = trigsOf(c.t);
			}, screen: c => ok(S.sel === c.t && !!$1(genDiceKey(c.t)), "selected " + S.sel), hold: 300 },
			{ say: "click GEN's Random key until the rhythm changes", act: async (u, c) => { await genAt(u, c.t); await u.glide("#genpop [data-rand]"); for (let i = 0; i < 5; i++) { u.click("#genpop [data-rand]"); if (await until(() => !same(trigsOf(c.t), c.p0) && idle(), 2500)) break; } },
				screen: c => ok(gridShows(c.t), "grid differs"), machine: c => ok(!same(trigsOf(c.t), c.p0), "unchanged"), hold: 1500 },
			{ say: "roll it once more", act: async (u, c) => { c.p1 = trigsOf(c.t); for (let i = 0; i < 5; i++) { u.click("#genpop [data-rand]"); if (await until(() => !same(trigsOf(c.t), c.p1) && idle(), 2500)) break; } await genDone(u); },
				machine: c => ok(!same(trigsOf(c.t), c.p1), "unchanged"), hold: 1500 },
			{ say: "click the Mix tab", caption: "Mute tracks with one drag", act: async u => { await look(u, tab("mix")); }, screen: () => onTab("mix"), hold: 300 },
			{ say: "drag across three tracks' M keys: they mute", act: async (u, c) => {
				const keep = soloKeep(), b = busy().filter(t => genRole(V.tracks[t].m) !== "kick" && t !== c.t && !keep.has(t) && !mutes().includes(t));
				c.run = b.slice(0, 3); if (!c.run.length) throw new Error("no tracks to mute");
				await u.glide(strip(c.run[0], "m"));
				await u.drag(strip(c.run[0], "m"), c.run.slice(1).map(i => strip(i, "m")), {}, { captured: false, stepMs: 260 });
			}, machine: c => ok(c.run.every(i => mutes().includes(i)), "machine mutes " + mutes()), screen: c => ok(c.run.every(i => pressed(strip(i, "m"))), "M keys not lit"), hold: 1400 },
			{ say: "drag back across them: they play again", act: async (u, c) => {
				const back = c.run.slice().reverse();
				await u.glide(strip(back[0], "m"));
				await u.drag(strip(back[0], "m"), back.slice(1).map(i => strip(i, "m")), {}, { captured: false, stepMs: 260 });
			}, machine: c => ok(c.run.every(i => !mutes().includes(i)), "machine mutes " + mutes()), hold: 600 },
			{ say: "click S on the rolled track: solo", caption: "Solo in one click", act: async (u, c) => { await look(u, strip(c.t, "s")); },
				machine: c => ok(!mutes().includes(c.t) && mutes().length >= 2, "machine mutes " + mutes()), hold: 1400 },
			{ say: "click S again: everything plays", act: async (u, c) => { await look(u, strip(c.t, "s")); },
				machine: c => ok(!c.run.some(i => mutes().includes(i)) && !mutes().includes(c.t), "machine mutes " + mutes()), within: 8000, hold: 500 },
			{ say: "click the Sound tab", caption: "Sweep the whole kit at once", act: async u => { await look(u, tab("sound")); }, screen: () => onTab("sound"), hold: 300 },
			{ say: "Alt-drag the filter's FLTF up, hold, and back: the whole kit sweeps (one undo step)", act: async (u, c) => {
				const q = '#main .pc[data-g="fx"][data-n="FLTF"]'; if (!$1(q)) throw new Error("no FLTF value");
				c.k0 = allKitVals(); c.v0 = getV($1(q)); c.moved = 0;
				const up = Math.min(100, 120 - c.v0), path = [];
				for (let k = 1; k <= 14; k++) path.push([Math.round(up * k / 14), 0]);
				for (let k = 0; k < 8; k++) path.push([up, 0]);
				for (let k = 13; k >= 0; k--) path.push([Math.round(up * k / 14), 0]);
				/* how many tracks the sweep moved at its widest, read from the machine's documents while it runs */
				const watch = setInterval(() => { c.moved = Math.max(c.moved, allKitVals().filter((v, t) => !same(v, c.k0[t])).length); }, 50);
				await u.glide(q);
				try { await u.drag(q, path, { alt: true }, { stepMs: 100 }); } finally { clearInterval(watch); }
			}, machine: c => ok(c.moved >= 2, `the sweep moved ${c.moved} tracks`), within: 8000, hold: 200 },
			{ say: "press Cmd+Z: the kit is as it was", act: async (u, c) => { document.activeElement?.blur?.(); if (!same(allKitVals(), c.k0)) u.key("z", { cmd: true }); }, machine: c => ok(same(allKitVals(), c.k0), "not all back"), within: 10000, hold: 300 },
			/* the end card goes over this (the video script): the groove plays on and fades out */
			{ say: "the groove plays on", act: async u => { await u.glide("#seq, #main", 0.5, 0.35, 600); }, machine: () => ok(tele.last?.playing, "stopped"), hold: 3800 }
		],
		async tidy(u) { if (V.playing) u.click("#play"); if (S.soloSet.size) setSolo(new Set()); }
	};
	/* demo-md-full: one song through every page, as doc/modern-ux/DEMO-STORYBOARD.md times it (120 BPM, 16-step patterns,
	   a bar is 2 s). The bar clock counts the machine's steps from its telemetry (from PLAY, across pattern changes and a
	   STOP); an action meant for bar n starts in step 15 of bar n-1 so it lands on the "1". Each bar line is logged
	   ("DEMO BAR n clock ms") with every pattern change ("DEMO PATTERN p clock ms") for the video's timeline. */
	const clock = { total: -1, prev: -1, bar: 0, on: false, pat: -1 };
	Bridge.onMessage(m => {
		if (m.type !== "telemetry" || !clock.on) return;
		if (!m.playing) { clock.prev = -1; return; }
		const L = V.len || 16;
		if (clock.prev < 0) clock.total = clock.total < 0 ? m.step : Math.ceil(clock.total / 16) * 16 + m.step;
		else if (m.step !== clock.prev) clock.total += m.step > clock.prev ? m.step - clock.prev : L - clock.prev + m.step;
		clock.prev = m.step;
		const bar = Math.floor(clock.total / 16) + 1;
		if (bar !== clock.bar) { clock.bar = bar; Bridge.log(`DEMO BAR ${bar} clock ${Math.round(performance.now())}`); }
		const p = currentPatternSlot(); if (p !== clock.pat) { clock.pat = p; Bridge.log(`DEMO PATTERN ${patName(p)} clock ${Math.round(performance.now())}`); }
	});
	/* wait for bar n's line (lead ms before its "1": from step 15 of bar n-1), or for bar n itself (lead < 0) */
	const STEP = 125;
	/* the storyboard's bar n (moved by song.shift), or with abs bar n itself; returns the bar it waited for. Past it
	   already: the next bar line instead, so an action never lands inside a bar, and every later bar moves as much
	   (the song keeps its spacing) */
	const song = { shift: 0 };
	const atBar = async (n, lead = 70, abs = false) => {
		const early = lead < 0 ? 0 : Math.max(1, Math.ceil(lead / STEP));
		let bar = abs ? n : n + song.shift, want = (bar - 1) * 16 - early;
		if (clock.total > want) { const m = Math.floor((clock.total + early) / 16) + 2; Bridge.log(`DEMO moved: bar ${bar} -> ${m}`); if (!abs) song.shift += m - bar; bar = m; want = (m - 1) * 16 - early; }
		await until(() => V.playing && clock.total >= want, 30000);
		if (lead >= 0) await sleep(Math.max(0, early * STEP - lead));
		return bar;
	};
	const railM = i => `#rail .th[data-sel="${i}"] .ms.m`;
	const chopCell = s => `#chop [data-cp="${s}"]`;
	const role = (re) => [...Array(16).keys()].find(t => re.test(V.tracks[t].m));
	const tracksOf = () => ({ kick: role(/-(BD|B2)$/), snare: role(/-SD$/), clap: role(/-CP$/), rim: role(/-RS$/), bell: role(/-CB$/),
		hat: role(/-(CH|HH)$/), open: role(/-OH$/), tom: role(/-(XT|LT|MT|HT)$/) });
	const genRoll = async (u, t, n = 1) => { for (let k = 0; k < n; k++) { const t0 = trigsOf(t); u.click("#genpop [data-rand]"); await until(() => !same(trigsOf(t), t0) && idle(), 2500); } };
	const pickEmpty = () => { const k = Docs.patterns[fullest()]?.kit; const pairs = [...Array(127).keys()].filter(p => (p & 15) < 15 && Docs.patterns[p] && Docs.patterns[p + 1] && !hasPat(p) && !hasPat(p + 1)); return pairs.find(p => Docs.patterns[p].kit === k) ?? pairs[0] ?? null; };
	const full = {
		name: "demo-md-full",
		card: "Machinedrum Editor|Free · pay what you want|Coming soon",
		setup: [
			{ say: "the Sequence workspace", act: async u => { u.click(tab("seq")); }, screen: () => onTab("seq") },
			{ say: "open the pattern chooser", act: async u => { u.click("#pat"); }, machine: () => ok(Object.keys(Docs.patterns).length === 128, "patterns read " + Object.keys(Docs.patterns).length), within: 8000 },
			{ say: "click an empty pattern whose next slot is empty too, on the fullest pattern's kit", act: async (u, c) => {
				c.A = pickEmpty(); if (c.A == null) throw new Error("no two empty patterns side by side on that kit"); c.B = c.A + 1; c.kit = Docs.patterns[c.A].kit;
				u.click(psq(c.A)); await confirmIfAsked(u); c.note = `A ${patName(c.A)}, B ${patName(c.B)}, kit ${c.kit + 1}`;
			}, machine: c => ok(currentPatternSlot() === c.A && idle(), "pattern " + currentPatternSlot()), within: 6000 },
			{ say: "press Escape", act: async u => { u.key("Escape"); }, screen: () => ok($1("#libpop").hidden, "open") },
			{ say: "tempo 120, swing 50 %", act: async () => { cmd("tempo", { bpm: 120 }); if (V.swing !== 50) l2set("swing", 50); }, machine: () => ok(Docs.global.tempo === 120, "tempo " + Docs.global.tempo), within: 6000 },
			{ say: "the tracks", act: async (u, c) => { Object.assign(c, { T: tracksOf() }); c.note = JSON.stringify(c.T); clock.on = true; song.shift = 0; }, machine: c => ok(Object.values(c.T).every(t => t != null) && V.len === 16, "tracks " + JSON.stringify(c.T) + ", length " + V.len) }
		],
		steps: [
			/* ---- bar 0: the kit, then PLAY ---- */
			{ section: "intro", say: "click KIT: the library; click the pattern's kit: it loads at once", caption: "Start from nothing.", act: async (u, c) => { await look(u, "#kitf"); await sleep(500); await look(u, ks(c.kit)); if (await until(dlgShown, 700)) u.click(dlgButton("Load without saving") || $1("#dlg .danger")); await sleep(400); u.key("Escape"); },
				machine: c => ok(currentKitSlot() === c.kit && idle(), "kit " + currentKitSlot()), screen: () => ok($1("#libpop").hidden, "library open"), within: 6000, hold: 300 },
			{ section: "intro", say: "press PLAY: bar 1", act: async u => { await look(u, "#play"); }, machine: () => ok(tele.last?.playing, "not playing"), within: 4000 },
			{ section: "intro", say: "kick: GEN Defaults and Random, Euclid 4/16 from bar 2", caption: "GEN writes the kick.", act: async (u, c) => { await genAt(u, c.T.kick); await sleep(150); await look(u, '#genpop [data-gen="fill"]'); await u.glide("#genpop [data-rand]"); await atBar(2, 200); await genUntil(u, c.T.kick, hits(3, 6)); await genDone(u); },
				machine: c => ok(trigsOf(c.T.kick).length >= 3, "kick " + trigsOf(c.T.kick)), screen: c => ok(gridShows(c.T.kick), "grid") },
			{ section: "intro", say: "snare: GEN from bar 3", act: async (u, c) => { await genAt(u, c.T.snare); await u.glide("#genpop [data-rand]"); await atBar(3, 200); await genRoll(u, c.T.snare); await genDone(u); },
				machine: c => ok(trigsOf(c.T.snare).length >= 1, "snare " + trigsOf(c.T.snare)) },
			{ section: "intro", say: "hats: GEN from bar 4, R again for bar 5", caption: "Roll the hats until they groove.", act: async (u, c) => {
				await genAt(u, c.T.hat); await sleep(100); await look(u, '#genpop [data-gen="fill"]');
				await u.glide("#genpop [data-rand]"); await atBar(4, 200); await genRoll(u, c.T.hat);
				await atBar(5, 200); const h0 = trigsOf(c.T.hat); u.key("r"); await until(() => !same(trigsOf(c.T.hat), h0), 2000); await genDone(u);
			}, machine: c => ok(trigsOf(c.T.hat).length >= 2, "hat " + trigsOf(c.T.hat)) },
			/* ---- build ---- */
			{ section: "build", say: "bar 6: rim clicks by hand, the open hat every 4th, an accent and a slide", caption: "Then play it by hand.", act: async (u, c) => {
				await atBar(6, 900);
				for (const s of [3, 11, 14]) { await u.glide(cell(c.T.rim, s), 0.5, 0.5, 220); u.click(cell(c.T.rim, s)); await sleep(60); }
				await u.glide(cell(c.T.open, 2)); u.rightClick(cell(c.T.open, 2)); u.cap("right-click: the step menu"); await sleep(500); await u.glide('#deskmenu [data-mid="step-fill-4"]'); u.click('#deskmenu [data-mid="step-fill-4"]'); u.cap("Fill every 4th"); clearSel(); await sleep(400);
				await u.glide(cell(c.T.snare, trigsOf(c.T.snare)[0] ?? 4)); u.click(cell(c.T.snare, trigsOf(c.T.snare)[0] ?? 4), { shift: true }); u.cap("⇧ accent"); await sleep(400);
				await u.glide(cell(c.T.rim, 14)); u.click(cell(c.T.rim, 14), { alt: true, shift: true }); u.cap("⌥⇧ slide");
			}, machine: c => ok([3, 11, 14].every(s => trigsOf(c.T.rim).includes(s)) && [2, 6, 10, 14].every(s => trigsOf(c.T.open).includes(s)), `rim ${trigsOf(c.T.rim)} open ${trigsOf(c.T.open)}`), within: 6000 },
			{ section: "build", say: "bar 8: REC, a tom fill on the QWERTY keys, REC off at bar 9", caption: "Record a fill from the keyboard.", act: async (u, c) => {
				await look(u, rail(c.T.tom)); c.tom0 = trigsOf(c.T.tom).length; document.activeElement?.blur?.();
				const b = await atBar(8, 200); u.key(" ", { alt: true });
				await until(() => clock.total >= (b - 1) * 16 + 11, 4000); for (const k of ["a", "s", "d", "f"]) { u.key(k); await sleep(125); }
				await atBar(b + 1, 60, true); u.key(" ", { alt: true });
				await sleep(300); if (!V.playing) { Bridge.log("DEMO note: REC off stopped the machine; PLAY again"); u.click("#play"); }
			}, machine: c => ok(trigsOf(c.T.tom).length > c.tom0 && tele.last?.playing && !V.rec, `tom ${c.tom0} -> ${trigsOf(c.T.tom).length}, playing ${tele.last?.playing}, rec ${V.rec}`), within: 6000 },
			{ section: "build", say: "bar 10: LOCK PARAMETER DEC on the hat, a ramp across the lane", caption: "Lock any parameter per step.", act: async (u, c) => {
				await look(u, rail(c.T.hat));
				const shown = e => e && e.getBoundingClientRect().width > 0, chip = () => [$1('#chips .pk[data-lane="DEC"]'), ...$all("#chips .pk[data-lane]")].find(shown);
				await until(() => chip(), 3000); const k = chip(); if (!k) throw new Error("no lock parameter key shown"); c.lane = k.dataset.lane; await sleep(300); await look(u, `#chips .pk[data-lane="${c.lane}"]`);
				c.on = trigsOf(c.T.hat).filter(s => s < 16); const a = c.on[0], b = c.on[c.on.length - 1];
				await u.glide(`#lane .lb[data-s="${a}"]`, 0.5, 0.9); await atBar(10, 900);
				await u.drag(`#lane .lb[data-s="${a}"]`, c.on.slice(1).map(s => `#lane .lb[data-s="${s}"]`), { shift: true }, { fy: 0.9, stepMs: 90 });
				c.li = pidx(c.T.hat, c.lane);
			}, machine: c => ok(locksOf(c.T.hat, c.li).length >= 2, "locks " + JSON.stringify(locksOf(c.T.hat, c.li))), within: 8000 },
			{ section: "build", say: "bar 11: rotate the hats twice", caption: "Rotate a track on the beat.", act: async (u, c) => { c.h0 = trigsOf(c.T.hat); document.activeElement?.blur?.(); await atBar(11, 200); u.key("ArrowRight", { alt: true }); await sleep(250); u.key("ArrowRight", { alt: true }); },
				machine: c => ok(!same(trigsOf(c.T.hat), c.h0), "hats unchanged") },
			{ section: "build", say: "bar 12: swing to 58 %, tap T on the beat", caption: "Swing it. Tap the tempo.", act: async (u, c) => {
				const q = '.l2.ed[data-l2="swing"]'; await u.glide(q); await atBar(12, 300); await u.drag(q, [[0, -6], [0, -12], [0, -18], [0, -24]], {}, { stepMs: 60 });
				await atBar(13, 120); document.activeElement?.blur?.(); for (let k = 0; k < 4; k++) { u.key("t"); await sleep(500); }
			}, machine: () => ok(V.swing >= 56 && Math.abs(Docs.global.tempo - 120) <= 2, `swing ${V.swing}, tempo ${Docs.global.tempo}`), within: 6000 },
			{ section: "build", say: "bar 14: Sound, the snare's filter screen dragged; the machine picker opened on the rim", caption: "Every sound, grouped by what it does.", act: async (u, c) => {
				await look(u, tab("sound")); await look(u, rail(c.T.snare)); c.k0 = kitVals(c.T.snare);
				const cv = $1('#main canvas.ed[data-ed="flt"]') || $1("#main canvas.ed"); const r = cv.getBoundingClientRect(), h = ED[cv.dataset.ed].handles(r.width, r.height, cv)[0];
				await u.glide(cv, h.x / r.width, h.y / r.height); await atBar(14, 600);
				await u.drag(cv, [[12, -4], [24, -8], [36, -12], [48, -14]], {}, { fx: h.x / r.width, fy: h.y / r.height, stepMs: 120 });
				await sleep(500); await look(u, rail(c.T.rim)); await look(u, "#machbtn"); await sleep(900); u.key("Escape");
			}, machine: c => ok(!same(kitVals(c.T.snare), c.k0), "snare unchanged"), screen: () => ok($1("#machpop").hidden, "picker open"), within: 6000 },
			{ section: "build", say: "bar 15: MUTATE the rim; bar 17: Cmd+Z; bar 18: MUTATE again and keep it", caption: "MUTATE a sound. Undo if you don't like it.", act: async (u, c) => {
				c.r0 = kitVals(c.T.rim); await u.glide("#mutband [data-rand]"); await atBar(15, 150); u.click("#mutband [data-rand]");
				await until(() => !same(kitVals(c.T.rim), c.r0), 3000); c.r1 = kitVals(c.T.rim);
				await atBar(17, 150); document.activeElement?.blur?.(); u.key("z", { cmd: true }); await until(() => same(kitVals(c.T.rim), c.r0), 3000); c.undone = same(kitVals(c.T.rim), c.r0);
				await atBar(18, 150); u.click("#mutband [data-rand]");
			}, machine: c => ok(c.undone && !same(kitVals(c.T.rim), c.r0), `undo back ${c.undone}, kept ${!same(kitVals(c.T.rim), c.r0)}`), within: 6000 },
			{ section: "build", say: "bar 19: Mix, PAN the clap; bar 20: the snare's DEL send up and the echo's feedback; bar 21: send down", caption: "Mix: pan, sends, an echo throw.", act: async (u, c) => {
				await look(u, tab("mix")); const pan = `.strip[data-sel="${c.T.clap}"] .pc[data-n="PAN"]`; await u.glide(pan); await atBar(19, 400); await u.drag(pan, [[-10, 0], [-20, 0], [-30, 0]], {}, { stepMs: 80 });
				const del = `.strip[data-sel="${c.T.snare}"] .pc[data-n="DEL"]`, fb = '#main .pc[data-g="mfx"][data-n="FB"]';
				c.d0 = getV($1(del)); await u.glide(del); await atBar(20, 500); await u.drag(del, [[30, 0], [60, 0], [90, 0]], {}, { stepMs: 60 });
				if ($1(fb)) { await u.glide(fb); await u.drag(fb, [[20, 0], [40, 0]], {}, { stepMs: 80 }); }
				await u.glide(del); await atBar(21, 400); await u.drag(del, [[-30, 0], [-60, 0], [-90, 0]], {}, { stepMs: 60 });
			}, machine: c => ok(kitVals(c.T.snare)[pidx(c.T.snare, "DEL", "rt")] <= c.d0 + 4, "DEL " + kitVals(c.T.snare)[pidx(c.T.snare, "DEL", "rt")]), within: 6000 },
			{ section: "build", say: "bars 22-24: the pattern chooser, A copied onto B; › queues B for bar 25", caption: "Copy the pattern. Queue the next one.", act: async (u, c) => {
				/* the chooser opens on the current pattern (A) selected; → selects the next slot (B); nothing switches */
				await look(u, "#pat"); await sleep(400); await u.glide(psq(c.A));
				await look(u, '#libpop [data-la="copy"]'); await sleep(300); await u.glide(psq(c.B)); u.key("ArrowRight"); await until(() => LIB.sel === c.B, 1000); await sleep(300);
				await look(u, '#libpop [data-la="paste"]'); if (await until(dlgShown, 1500)) { c.asked = $1("#dlg p")?.textContent; u.click($1("#dlg .danger") || dlgButton("Paste")); }
				await until(() => hasPat(c.B) && !dlgShown(), 4000); await sleep(300);
				for (let k = 0; k < 3 && !$1("#libpop").hidden; k++) { u.key("Escape"); await until(() => $1("#libpop").hidden, 600); }
				if (!$1("#libpop").hidden) closeLib(false);
				await u.glide("#patNext"); await atBar(24, 900); u.click("#patNext"); if (await until(dlgShown, 1200)) { c.asked2 = $1("#dlg p")?.textContent; u.click(dlgButton("Keep the edits") || dlgButton("Cancel")); }
				c.note = `paste asked: ${c.asked || "-"}; switch asked: ${c.asked2 || "-"}`;
			}, machine: c => ok(hasPat(c.B) && (desk().queued === c.B || currentPatternSlot() === c.B), `B ${hasPat(c.B)}, queued ${desk().queued}, pattern ${currentPatternSlot()}`), within: 4000 },
			{ section: "build", say: "B plays from bar 25 on the same kit", machine: c => ok(currentPatternSlot() === c.B && currentKitSlot() === c.kit, `pattern ${currentPatternSlot()} kit ${currentKitSlot()}`), within: 6000 },
			/* ---- break ---- */
			{ section: "break", say: "bar 26: one drag across tracks 1-5's M keys: the beat drops out", caption: "One drag: the beat drops out.", act: async (u, c) => {
				await look(u, tab("mix")); c.five = [0, 1, 2, 3, 4]; await u.glide(strip(0, "m"));
				await until(() => clock.total >= 25 * 16 - 3, 8000);
				await u.drag(strip(0, "m"), c.five.slice(1).map(i => strip(i, "m")), {}, { captured: false, stepMs: 45, settle: 50 });
			}, machine: c => ok(c.five.every(i => mutes().includes(i)), "mutes " + mutes()), hold: 300 },
			{ section: "break", say: "Sampler › RAM 1: Set up sampling (recorder 13, player 14, once on step 1)", caption: "Sample the groove into RAM.", act: async (u, c) => {
				await look(u, tab("sampler")); await sleep(200); await look(u, '.slotk[data-slot="RAM1"]'); await sleep(400); [c.r, c.pl] = setupTracks();
				const once = $1('[data-smponce="1"]'); if (once && getComputedStyle(once.parentElement).visibility !== "hidden") { await look(u, once); await sleep(250); }
				await look(u, "[data-setupgo]");
			}, machine: c => ok(kit().tracks[c.r].machine === "RAM-R1" && kit().tracks[c.pl].machine === "RAM-P1", `tracks ${kit().tracks[c.r].machine} ${kit().tracks[c.pl].machine}`), within: 8000, hold: 200 },
			{ section: "break", say: "source Main mix, LEN one bar, RATE full", act: async (u, c) => {
				await look(u, '[data-recsrc="main"]'); await sleep(250);
				const q = '#main .pc[data-g="syn"][data-n="LEN"]'; const d = 64 - getV($1(q)); if (d) { await u.glide(q); await u.drag(q, [[Math.round(d / 3), 0], [Math.round(2 * d / 3), 0], [d, 0]], {}, { stepMs: 60 }); }
				const rt = '#main .pc[data-g="syn"][data-n="RATE"]'; if ($1(rt) && getV($1(rt)) < 127) { await u.glide(rt); await u.drag(rt, [[60, 0], [140, 0]], {}, { stepMs: 60 }); }
			}, machine: c => ok(sourceOf(c.r) === "main" && kitVals(c.r)[pidx(c.r, "LEN", "syn")] === 64, `source ${sourceOf(c.r)}, LEN ${kitVals(c.r)[pidx(c.r, "LEN", "syn")]}`), within: 6000 },
			{ section: "break", say: "Capture next loop, armed in bar 28: records bar 29, frozen at bar 30", act: async (u, c) => {
				await u.glide("[data-capture]"); await atBar(28); await until(() => clock.total % 16 >= 11, 3000); u.click("[data-capture]");
			}, screen: () => ok(slotState(1) === "cap", "slot " + slotState(1)), within: 3000 },
			{ section: "break", say: "it records the bar", act: async u => { await u.glide(".ramwave .wavecv", 0.5, 0.5, 900); }, screen: () => ok(slotState(1) === "frozen", "slot " + slotState(1)), within: 9000 },
			{ section: "break", say: "the take's waveform", machine: () => { const t = smpSlotOf("ram", 0); return ok(t && !t.empty, "take " + JSON.stringify(t && { empty: t.empty })); }, screen: () => { const n = inked($1("canvas.smpwave")); return ok(n > 2000, n + " pixels"); }, within: 10000 },
			{ section: "break", say: "chop trigs from bar 31", caption: "Chop it: slices, reverse, retrig.", act: async (u, c) => {
				c.chops = [0, 3, 6, 8, 10, 12, 14, 15]; await u.glide(chopCell(0)); await atBar(31, 900);
				for (const s of c.chops) { await u.glide(chopCell(s), 0.5, 0.5, 140); u.click(chopCell(s)); await sleep(50); }
			}, machine: c => ok(c.chops.every(s => trigsOf(c.pl).includes(s)), "player " + trigsOf(c.pl)) },
			{ section: "break", say: "drag four slices up", act: async (u, c) => {
				c.moved = [3, 6, 10, 12];
				for (const [k, s] of c.moved.entries()) { await u.glide(chopCell(s), 0.5, 0.5, 200); await u.drag(chopCell(s), [[0, -10], [0, -20], [0, -30 - 10 * k], [0, -40 - 14 * k]], {}, { stepMs: 45, settle: 80 }); }
			}, machine: c => { const st = locksOf(c.pl, pidx(c.pl, "STRT")); return ok(c.moved.every(s => st.some(x => x[0] === s && x[1] > 0)), "STRT " + JSON.stringify(st)); }, within: 6000 },
			{ section: "break", say: "alt-click two moved slices: reversed; shift-click the bar end: retrig", act: async (u, c) => {
				for (const s of [6, 12]) { await u.glide(chopCell(s), 0.5, 0.5, 200); u.click(chopCell(s), { alt: true }); u.cap("⌥ reverse"); await sleep(200); }
				for (const s of [14, 15]) { await u.glide(chopCell(s), 0.5, 0.5, 200); u.click(chopCell(s), { shift: true }); u.cap("⇧ retrig"); await sleep(200); }
			}, screen: () => ok([6, 12].every(s => /REV/.test($1(chopCell(s))?.textContent || "")) && [14, 15].every(s => /RTRG/.test($1(chopCell(s))?.textContent || "")), "REV / RTRG not shown"), within: 6000 },
			{ section: "break", say: "bar 35: the ROM slots' waveform tiles", caption: "48 ROM slots, real waveforms.", act: async u => { await atBar(35, -1); await look(u, ".slotk.rom.has, .slotk.rom"); await sleep(300); await u.glide(".romtiles", 0.5, 0.3, 900); },
				screen: () => ok($all(".romtile canvas.tw").length > 0, "no tiles") },
			/* ---- riser and drop ---- */
			{ section: "riser", say: "bars 37-39: Sound, Alt-drag the hat's FLTF up: every track sweeps", caption: "Sweep the whole kit. Arm the drop.", act: async (u, c) => {
				await look(u, tab("sound")); await look(u, rail(c.T.hat)); const q = '#main .pc[data-g="fx"][data-n="FLTF"]'; c.k0 = allKitVals(); c.v0 = getV($1(q));
				const up = Math.min(90, 120 - c.v0), path = []; for (let k = 1; k <= 48; k++) path.push([Math.round(up * k / 48), 0]);
				await u.glide(q); await atBar(37, 120); await u.drag(q, path, { alt: true }, { stepMs: 110 });
			}, machine: c => ok(allKitVals().filter((v, t) => !same(v, c.k0[t])).length >= 2, "the sweep moved too few tracks") },
			{ section: "riser", say: "bar 40: Sequence, Shift-click tracks 1-5's M keys: prepared", act: async (u, c) => {
				await look(u, tab("seq")); await atBar(40, -1); u.cap("⇧ hold"); for (const i of c.five) { await u.glide(railM(i), 0.5, 0.5, 180); u.click(railM(i), { shift: true }); await sleep(60); }
			}, machine: c => ok(c.five.every(i => mutes().includes(i)), "sent while held: " + mutes()), screen: c => ok(c.five.every(i => $1(railM(i)).classList.contains("prep")), "not prepared"), within: 2000 },
			{ section: "drop", say: "bar 41: let Shift go on the bar line, Cmd+Z the sweep", caption: "Drop it on the bar.", act: async (u, c) => {
				await atBar(41, 70); document.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", code: "ShiftLeft", bubbles: true })); u.cap("⇧ release");
				document.activeElement?.blur?.(); u.key("z", { cmd: true });
			}, machine: c => ok(c.five.every(i => !mutes().includes(i)) && same(allKitVals(), c.k0), `mutes ${mutes()}, kit back ${same(allKitVals(), c.k0)}`), within: 6000, hold: 4500 },
			{ section: "drop", say: "bar 45: Mix, solo the snare and the chops; bar 47: un-solo", caption: "Solo in one click.", act: async (u, c) => {
				await look(u, tab("mix")); await u.glide(strip(c.T.snare, "s")); await atBar(45, 150); u.click(strip(c.T.snare, "s")); await sleep(120); await look(u, strip(c.pl, "s"));
				await u.glide(strip(c.T.snare, "s")); await atBar(47, 150); u.click(strip(c.T.snare, "s")); await sleep(120); await look(u, strip(c.pl, "s"));
			}, machine: c => ok(!S.soloSet.size && same(mutes(), [c.r]), "solo " + [...S.soloSet] + " mutes " + mutes() + " (the frozen recorder stays muted)"), within: 6000 },
			{ section: "drop", say: "bar 49: Sequence, GEN rolls the open hat; bar 51: rotate it", caption: "Roll a new open hat.", act: async (u, c) => {
				await look(u, tab("seq")); await genAt(u, c.T.open); await u.glide("#genpop [data-rand]"); await atBar(49, 200); await genRoll(u, c.T.open); await genDone(u);
				c.o1 = trigsOf(c.T.open); document.activeElement?.blur?.(); await atBar(51, 150); u.key("ArrowRight", { alt: true });
			}, machine: c => ok(!same(trigsOf(c.T.open), c.o1), "open hat not rotated") },
			/* ---- outro: the chain, loaded and started ---- */
			{ section: "outro", say: "bar 52: Song, Arrange, then Chain", caption: "Load a chain and start it.", act: async u => { await look(u, tab("song")); await look(u, '[data-set="songpick"] button[data-v="song"]'); await sleep(600); await look(u, '[data-set="songpick"] button[data-v="chain"]'); },
				screen: () => ok(!!$1("[data-chainpad]"), "no pads") },
			{ section: "outro", say: "STOP on bar 53's line, chain pads A and B (loaded), PLAY: the chain starts at A", act: async (u, c) => {
				const b = c.A >> 4; if (S.bank !== b) { await look(u, `[data-bank="${b}"]`); await sleep(200); }
				await u.glide("#play"); await atBar(53, 30); u.click("#play"); await until(() => !V.playing, 2000);
				await look(u, `[data-chainpad="${c.A}"]`); await sleep(150); await look(u, `[data-chainpad="${c.B}"]`);
				await until(() => desk().chain?.active, 3000); c.loaded = JSON.stringify(desk().chain); await look(u, "#play");
			}, machine: c => ok(desk().chain?.active && same(desk().chain.patterns, [c.A, c.B]) && tele.last?.playing && currentPatternSlot() === c.A, `chain ${JSON.stringify(desk().chain)}, playing ${tele.last?.playing}, pattern ${currentPatternSlot()}`), within: 5000 },
			{ section: "outro", say: "the chain moves on: A, then B", act: async u => { await u.glide(".chainrow", 0.5, 0.5, 600); }, machine: c => ok(currentPatternSlot() === c.B, "pattern " + currentPatternSlot()), within: 6000 },
			{ section: "outro", say: "and back to A", machine: c => ok(currentPatternSlot() === c.A, "pattern " + currentPatternSlot()), within: 6000 },
			{ section: "outro", say: "and B again", caption: "The chain plays on. Strip it back.", machine: c => ok(currentPatternSlot() === c.B, "pattern " + currentPatternSlot()), within: 6000 },
			{ section: "outro", say: "Sequence: mute the rim and cowbell, the chops, the hats, the kick, a bar at a time", act: async (u, c) => {
				await look(u, tab("seq")); const b0 = clock.bar + 1;
				for (const [k, ts] of [[c.T.rim, c.T.bell], [c.pl], [c.T.hat, c.T.open], [c.T.kick]].entries()) { await u.glide(railM(ts[0])); await atBar(b0 + 2 * k, 150, true); for (const t of ts) { u.click(railM(t)); await sleep(90); } }
			}, machine: c => ok([c.T.kick, c.T.hat, c.pl].every(t => mutes().includes(t)), "mutes " + mutes()), within: 4000, hold: 1500 },
			{ section: "outro", say: "Shift-click the muted tracks, let Shift go on the bar line: everything back for the last two bars (the frozen recorder stays muted)", act: async (u, c) => {
				c.back = mutes().filter(t => t !== c.r); u.cap("⇧ hold"); for (const t of c.back) { await u.glide(railM(t), 0.5, 0.5, 160); u.click(railM(t), { shift: true }); await sleep(50); }
				await atBar(clock.bar + 1, 70, true); document.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", code: "ShiftLeft", bubbles: true })); u.cap("⇧ release");
			}, machine: c => ok(same(mutes(), [c.r]), "mutes " + mutes()), hold: 3600 },
			{ section: "outro", say: "STOP on the bar line", act: async u => { await u.glide("#play"); await atBar(clock.bar + 2, 30, true); u.click("#play"); }, machine: () => ok(tele.last && !tele.last.playing, "playing"), hold: 400 }
		],
		async tidy(u) { clock.on = false; if (desk().chain?.active) cmd("chainClear"); if (V.playing) u.click("#play"); if (S.soloSet.size) setSolo(new Set()); }
	};
	/* demo-md-sampler (about 60 s, one take): the sampler on its own, the chops in front. The fullest pattern (two bars
	   here) at 120 BPM, a bar is 2 s; every action starts on a bar line of the bar clock (atBar), and each change plays
	   for bars before the next one.
	     1-2   the groove plays; Sampler › RAM 1 shows the Set up sampling card            "Sample your own groove."
	     3     Set up sampling (recorder 13, player 14, once on step 1); source Main mix; LEN one bar; the player's PTCH
	           to 64 (no transpose), HOLD and DEC to the top, so each chop plays out at pitch until the next one: the
	           RAM-P machine keeps the values the track's machine had (here PTCH 52, DEC 64, STRT 25); STRT to 0 too, so a chop's slice n starts at 8n
	                                                                                      "Recorder and player in one click."
	     4-7   Capture next loop: the full groove (nothing muted) into RAM 1; the take    "Capture one bar of the groove."
	     8     sixteen chops, every 2nd step, all slice 1: a stutter                       "Chop it."
	     9-12  Mix: solo the player, its fader up: the chops alone                        "Solo the chops."
	     13-16 Sampler: six chops dragged to other slices                                 "Slice it up."
	     17-18 two reversed (⌥-click)                                                     "Reverse."
	     19-20 the bar ends retriggered (⇧-click)                                         "Retrig."
	     21-24 Mix: un-solo on the bar line: the groove back under the chops              "Bring the groove back."
	     25-27 Sound: ⌥-drag RTRG on the player: Control All, every track's 7th knob      "Alt-drag: retrig the whole kit."
	     28-29 ⌘Z: back                                                                    "Undo. Back in the pocket."
	     30-31 the groove and the chops under the end card */
	const sampler = {
		name: "demo-md-sampler",
		card: "Machinedrum Editor|Free · pay what you want|Coming soon",
		setup: [
			...groove.setup,
			{ say: "tempo 120, the Sampler on RAM 1 (its Set up sampling card)", act: async (u, c) => {
				cmd("tempo", { bpm: 120 }); u.click(tab("sampler")); await sleep(300); u.click('.slotk[data-slot="RAM1"]'); clock.total = -1; clock.prev = -1; clock.bar = 0; clock.on = true; song.shift = 0;
				c.p = currentPatternSlot(); c.note = `pattern ${patName(c.p)}, ${V.len} steps`;
			}, machine: () => ok(Docs.global.tempo === 120, "tempo " + Docs.global.tempo), screen: () => ok(!!$1("[data-setupgo]"), "no Set up sampling card (RAM 1 in use?)"), within: 6000 }
		],
		steps: [
			{ section: "hook", say: "the groove plays on the Sampler page", caption: "Sample your own groove.", act: async u => { await u.glide("[data-setupgo]", 0.5, 0.5, 900); await atBar(3, 1200); },
				machine: () => ok(tele.last?.playing, "not playing") },
			{ section: "setup", say: "bar 3: Once, on step 1 (when the recorder has trigs); Set up sampling", caption: "Recorder and player in one click.", act: async (u, c) => {
				[c.r, c.pl] = setupTracks(); const once = $1('[data-smponce="1"]');
				if (once && getComputedStyle(once.parentElement).visibility !== "hidden") { await look(u, once); await sleep(200); }
				await look(u, "[data-setupgo]");
			}, machine: c => ok(kit().tracks[c.r].machine === "RAM-R1" && kit().tracks[c.pl].machine === "RAM-P1", `tracks ${kit().tracks[c.r].machine} ${kit().tracks[c.pl].machine}`), within: 8000 },
			{ section: "setup", say: "source Main mix, LEN one bar, RATE full; the player's HOLD and DEC to the top", act: async (u, c) => {
				await look(u, '[data-recsrc="main"]'); await sleep(200);
				const v = q => getV($1(q)), up = async (q, to) => { const d = to - v(q); if (d) { await u.glide(q); await u.drag(q, [[Math.round(d / 3), 0], [Math.round(2 * d / 3), 0], [d + (to === 127 || to === 0 ? 10 * Math.sign(d) : 0), 0]], {}, { stepMs: 60 }); } };
				const P = n => `#main .smp2 .pc[data-g="syn"][data-n="${n}"][data-t="${c.pl}"]`, R = n => `#main .smp2 .pc[data-g="syn"][data-n="${n}"][data-t="${c.r}"]`;
				const pv = n => $1(P(n)) ? P(n) : `#main .pc[data-g="syn"][data-n="${n}"]`;
				await up(R("LEN"), 64); if ($1(R("RATE"))) await up(R("RATE"), 127);
				c.before = Object.fromEntries(["PTCH", "DEC", "HOLD", "STRT", "END", "RTRG", "RTIM"].map(n => [n, kitVals(c.pl)[pidx(c.pl, n, "syn")]]));
				Bridge.log("DEMO player before: " + JSON.stringify(c.before) + " VOL " + kitVals(c.pl)[pidx(c.pl, "VOL", "rt")]);
				for (const [n, to] of [["DEC", 127], ["HOLD", 127], ["PTCH", 64], ["STRT", 0]]) { await up(pv(n), to); await until(idle, 2000); await sleep(150); }
				c.envWatch = setInterval(() => { const e = ["PTCH", "DEC", "HOLD"].map(n => kitVals(c.pl)[pidx(c.pl, n, "syn")]).join(","); if (e !== c.envLast) { Bridge.log("DEMO player PTCH,DEC,HOLD " + e + " at bar " + clock.bar); c.envLast = e; } }, 100);
				c.note = "player before: " + JSON.stringify(c.before) + ", after PTCH " + kitVals(c.pl)[pidx(c.pl, "PTCH", "syn")] + " HOLD " + kitVals(c.pl)[pidx(c.pl, "HOLD", "syn")] + " DEC " + kitVals(c.pl)[pidx(c.pl, "DEC", "syn")];
			}, machine: c => ok(sourceOf(c.r) === "main" && kitVals(c.r)[pidx(c.r, "VOL", "rt")] === 0 && kitVals(c.r)[pidx(c.r, "LEN", "syn")] === 64 && kitVals(c.pl)[pidx(c.pl, "HOLD", "syn")] === 127 && kitVals(c.pl)[pidx(c.pl, "DEC", "syn")] === 127 && kitVals(c.pl)[pidx(c.pl, "PTCH", "syn")] === 64,
				`PTCH ${kitVals(c.pl)[pidx(c.pl, "PTCH", "syn")]}, source ${sourceOf(c.r)}, LEN ${kitVals(c.r)[pidx(c.r, "LEN", "syn")]}, HOLD ${kitVals(c.pl)[pidx(c.pl, "HOLD", "syn")]}, DEC ${kitVals(c.pl)[pidx(c.pl, "DEC", "syn")]}`), within: 6000 },
			{ section: "capture", say: "Capture next loop, armed in the loop's last bar: it records the next loop's first bar", caption: "Capture one bar of the groove.", act: async (u, c) => {
				c.L = V.len; await u.glide("[data-capture]");
				await until(() => clock.total % c.L === c.L - 6, 8000); u.click("[data-capture]");
			}, screen: () => ok(slotState(1) === "cap", "slot " + slotState(1)), within: 3000 },
			{ section: "capture", say: "it records, then freezes", act: async u => { await u.glide(".ramwave .wavecv", 0.5, 0.5, 900); }, screen: () => ok(slotState(1) === "frozen", "slot " + slotState(1)), within: 12000 },
			{ section: "capture", say: "the take's waveform", machine: () => { const t = smpSlotOf("ram", 0); return ok(t && !t.empty, "take " + JSON.stringify(t && { empty: t.empty })); },
				screen: () => { const n = inked($1("canvas.smpwave")); return ok(n > 2000, n + " pixels"); }, within: 10000,
				act: async (u, c) => { const t = smpSlotOf("ram", 0); c.note = t ? smpInfo(t) : ""; } },
			{ section: "chop", say: "on a bar line: a chop on every 2nd step, all slice 1", caption: "Chop it.", act: async (u, c) => {
				c.chops = [...Array(c.L / 2).keys()].map(k => 2 * k); await u.glide(chopCell(0)); await atBar(clock.bar + 1, 300, true);
				for (const s of c.chops) { await u.glide(chopCell(s), 0.5, 0.5, 90); u.click(chopCell(s)); await sleep(30); }
			}, machine: c => ok(c.chops.every(s => trigsOf(c.pl).includes(s)), "player " + trigsOf(c.pl)), hold: 1500 },
			{ section: "solo", say: "Mix: solo the player and push its fader up, on a bar line", caption: "Solo the chops.", act: async (u, c) => {
				await look(u, tab("mix")); c.soloBar = await atBar(clock.bar + 1, 120, true); u.click(strip(c.pl, "s"));
				const f = `.strip[data-sel="${c.pl}"] .fader[data-g]`; c.v0 = kitVals(c.pl)[pidx(c.pl, "VOL", "rt")]; if (c.v0 < 127) { await u.glide(f); await u.drag(f, [[0, -20], [0, -50], [0, -90], [0, -140]], {}, { stepMs: 50 }); }
			}, machine: c => ok(mutes().length >= 12 && !mutes().includes(c.pl) && kitVals(c.pl)[pidx(c.pl, "VOL", "rt")] >= 120, `mutes ${mutes()}, VOL ${kitVals(c.pl)[pidx(c.pl, "VOL", "rt")]}`), within: 6000, hold: 4500 },
			{ section: "slice", say: "Sampler: six chops dragged to other slices, from a bar line", caption: "Slice it up.", act: async (u, c) => {
				await look(u, tab("sampler")); await sleep(200);
				c.slices = [[4, 9], [8, 3], [12, 13], [20, 5], [24, 11], [28, 15]].filter(([s]) => s < c.L);
				await u.glide(chopCell(c.slices[0][0])); await atBar(clock.bar + 1, 300, true);
				for (const [s, n] of c.slices) { await u.glide(chopCell(s), 0.5, 0.5, 160); const path = []; for (let k = 1; k <= n; k++) path.push([0, -6 * k - 2]); await u.drag(chopCell(s), path, {}, { stepMs: 18, settle: 60 }); }
			}, machine: c => { const st = locksOf(c.pl, pidx(c.pl, "STRT")); return ok(c.slices.every(([s, n]) => st.some(x => x[0] === s && Math.abs(x[1] - 8 * n) <= 8)), "STRT " + JSON.stringify(st)); }, within: 6000, hold: 6500 },
			{ section: "reverse", say: "on a bar line: two moved chops reversed", caption: "Reverse.", act: async (u, c) => {
				c.rev = [8, 24].filter(s => s < c.L); await u.glide(chopCell(c.rev[0])); await atBar(clock.bar + 1, 120, true);
				for (const s of c.rev) { await u.glide(chopCell(s), 0.5, 0.5, 200); u.click(chopCell(s), { alt: true }); u.cap("⌥ reverse"); await sleep(150); }
			}, screen: c => ok(c.rev.every(s => /REV/.test($1(chopCell(s))?.textContent || "")), "no REV shown"), within: 6000, hold: 3200 },
			{ section: "retrig", say: "on a bar line: the bar ends retriggered", caption: "Retrig.", act: async (u, c) => {
				c.rt = [14, 30].filter(s => s < c.L); await u.glide(chopCell(c.rt[0])); await atBar(clock.bar + 1, 120, true);
				for (const s of c.rt) { await u.glide(chopCell(s), 0.5, 0.5, 200); u.click(chopCell(s), { shift: true }); u.cap("⇧ retrig"); await sleep(150); }
			}, screen: c => ok(c.rt.every(s => /RTRG/.test($1(chopCell(s))?.textContent || "")), "no RTRG shown"), within: 6000, hold: 3200 },
			{ section: "groove", say: "Mix: un-solo on the bar line: the groove back under the chops", caption: "Bring the groove back.", act: async (u, c) => {
				await look(u, tab("mix")); await u.glide(strip(c.pl, "s")); c.unsoloBar = await atBar(clock.bar + 1, 70, true); u.click(strip(c.pl, "s"));
			}, machine: c => ok(same(mutes(), [c.r]), "mutes " + mutes() + " (the frozen recorder stays muted)"), within: 6000, hold: 7000 },
			{ section: "retrig-all", say: "Sound: Alt-drag the player's RTRG up over a bar: Control All, every track's same knob", caption: "Alt-drag: retrig the whole kit.", act: async (u, c) => {
				await look(u, tab("sound")); await look(u, rail(c.pl)); const q = '#main .pc[data-g="syn"][data-n="RTRG"]'; if (!$1(q)) throw new Error("no RTRG");
				c.k0 = allKitVals(); c.moved = 0; const path = []; for (let k = 1; k <= 8; k++) path.push([k, 0]);
				const watch = setInterval(() => { c.moved = Math.max(c.moved, allKitVals().filter((v, t) => !same(v, c.k0[t])).length); }, 50);
				await u.glide(q); c.allBar = await atBar(clock.bar + 1, 120, true);
				try { await u.drag(q, path, { alt: true }, { stepMs: 110 }); await sleep(800); } finally { clearInterval(watch); }
				c.note = `${c.moved} tracks moved; RTRG of the player ${kitVals(c.pl)[pidx(c.pl, "RTRG", "syn")]}`;
			}, machine: c => ok(c.moved >= 4, `the drag moved ${c.moved} tracks`), within: 6000, hold: 4500 },
			{ section: "retrig-all", say: "Cmd+Z on a bar line: back", caption: "Undo. Back in the pocket.", act: async (u, c) => { document.activeElement?.blur?.(); c.undoBar = await atBar(clock.bar + 1, 70, true); u.key("z", { cmd: true }); },
				machine: c => ok(same(allKitVals(), c.k0), "not all back"), within: 8000, hold: 3000 },
			{ section: "end", say: "the groove and the chops play on under the end card", act: async u => { await u.glide("#main", 0.5, 0.35, 700); }, machine: () => ok(tele.last?.playing, "stopped"), hold: 4000 }
		],
		async tidy(u, c) { clearInterval(c.envWatch); clock.on = false; if (V.playing) u.click("#play"); if (S.soloSet.size) setSolo(new Set()); }
	};
	/* demo-md-techniques: "Tight Sequencer", the Machinedrum techniques song (doc/modern-ux/DEMO-STORYBOARD.md, section 5).
	   Same bar clock and rules as demo-md-full; the steps say their storyboard bar. */
	const pickMachine = async (u, t, m) => {
		await look(u, rail(t)); await sleep(200); await look(u, "#machbtn"); await sleep(350);
		await look(u, `#machpop .mf[data-fam="${m.split("-")[0]}"]`); await sleep(300); await look(u, `#machpop .mk[data-mach="${m}"]`);
		await until(() => kit().tracks[t].machine === m && idle(), 6000);
	};
	/* drag values on the selected track, one after the other */
	const setSyn = async (u, t, vals) => { for (const [n, to] of vals) { await dragTo(u, snd(n), to); await until(idle, 2000); await sleep(150); } };
	const snd = n => `#main .pc[data-g="syn"][data-n="${n}"]`;
	const dragTo = async (u, q, to, ms = 60) => { const d = to - getV($1(q)); if (!d) return; await u.glide(q); await u.drag(q, [[Math.round(d / 3), 0], [Math.round(2 * d / 3), 0], [d + (to === 127 || to === 0 ? 10 * Math.sign(d) : 0), 0]], {}, { stepMs: ms }); };
	const synV = (t, n) => kitVals(t)[pidx(t, n, "syn")];
	/* GEN rolls until the rhythm suits the song (a generator is random): at most 4 rolls */
	const genUntil = async (u, t, good) => { for (let k = 0; k < 4; k++) { await genRoll(u, t); if (good(trigsOf(t).filter(s => s < 16))) return; await sleep(150); } };
	const hits = (lo, hi) => tr => tr.length >= lo && tr.length <= hi;
	const techniques = {
		name: "demo-md-techniques",
		card: "Machinedrum Editor|Free · pay what you want|Coming soon",
		setup: full.setup,
		steps: [
			/* ---- 0-4 intro ---- */
			{ section: "intro", say: "bar 0: the kit library, the pattern's kit loads", caption: "Start from an empty pattern.", act: async (u, c) => { await look(u, "#kitf"); await sleep(500); await look(u, ks(c.kit)); if (await until(dlgShown, 700)) u.click(dlgButton("Load without saving") || $1("#dlg .danger")); await sleep(400); u.key("Escape"); },
				machine: c => ok(currentKitSlot() === c.kit && idle(), "kit " + currentKitSlot()), within: 6000, hold: 300 },
			{ section: "intro", say: "PLAY: bar 1", act: async u => { await look(u, "#play"); }, machine: () => ok(tele.last?.playing, "not playing"), within: 4000 },
			{ section: "intro", say: "bar 2: GEN Euclid on the kick", caption: "Euclid kick, rotated snare.", act: async (u, c) => { await genAt(u, c.T.kick); await sleep(150); await look(u, '#genpop [data-gen="fill"]'); await u.glide("#genpop [data-rand]"); await atBar(2, 200); await genRoll(u, c.T.kick); await genDone(u); },
				machine: c => ok(trigsOf(c.T.kick).length >= 3, "kick " + trigsOf(c.T.kick)) },
			{ section: "intro", say: "bar 3: GEN on the snare, rotated one step late", act: async (u, c) => { await genAt(u, c.T.snare); await sleep(150); await look(u, '#genpop [data-gen="fill"]'); await u.glide("#genpop [data-rand]"); await atBar(3, 200); await genUntil(u, c.T.snare, hits(1, 4)); await genDone(u); c.s0 = trigsOf(c.T.snare); document.activeElement?.blur?.(); await sleep(250); u.key("ArrowRight", { alt: true }); },
				machine: c => ok(trigsOf(c.T.snare).length >= 1 && !same(trigsOf(c.T.snare), c.s0), "snare " + trigsOf(c.T.snare)) },
			{ section: "intro", say: "bar 4: Sound, the machine picker: GND-SIN on track 12, tuned down, a long decay; a note on the 1 and the 11", caption: "Pick the machine for the job.", act: async (u, c) => {
				c.bass = 11; await look(u, tab("sound")); await pickMachine(u, c.bass, "GND-SIN");
				await setSyn(u, c.bass, [["PTCH", 28], ["DEC", 90]]);
				Bridge.log(`DEMO bass after the drags: PTCH ${synV(c.bass, "PTCH")} DEC ${synV(c.bass, "DEC")}`);
				await look(u, tab("seq")); await atBar(5, 600); for (const s of [0, 10]) { await u.glide(cell(c.bass, s), 0.5, 0.5, 200); u.click(cell(c.bass, s)); await sleep(60); }
				await until(idle, 3000); await sleep(1500); Bridge.log(`DEMO bass after the trigs: PTCH ${synV(c.bass, "PTCH")} DEC ${synV(c.bass, "DEC")}`);
			}, machine: c => ok(kit().tracks[c.bass].machine === "GND-SIN" && [0, 10].every(s => trigsOf(c.bass).includes(s)) && synV(c.bass, "PTCH") === 28, `track 12 ${kit().tracks[c.bass].machine}, PTCH ${synV(c.bass, "PTCH")}, trigs ${trigsOf(c.bass)}`), within: 6000 },
			{ section: "intro", say: "bar 6: hats, GEN; R again for bar 7", act: async (u, c) => {
				await genAt(u, c.T.hat); await sleep(100); await look(u, '#genpop [data-gen="fill"]');
				await u.glide("#genpop [data-rand]"); await atBar(6, 200); await genUntil(u, c.T.hat, hits(4, 11));
				await atBar(7, 200); const h0 = trigsOf(c.T.hat); u.key("r"); await until(() => !same(trigsOf(c.T.hat), h0), 2000); await genDone(u);
			}, machine: c => ok(trigsOf(c.T.hat).length >= 2, "hat " + trigsOf(c.T.hat)) },
			/* ---- 5-18 build ---- */
			{ section: "build", say: "bar 8: rim and cowbell by hand, an accent, a slide", caption: "Accent and slide by hand.", act: async (u, c) => {
				await atBar(8, 900);
				for (const [t, s] of [[c.T.rim, 3], [c.T.rim, 11], [c.T.bell, 6], [c.T.bell, 14]]) { await u.glide(cell(t, s), 0.5, 0.5, 200); u.click(cell(t, s)); await sleep(50); }
				await u.glide(cell(c.T.bell, 6)); u.click(cell(c.T.bell, 6), { shift: true }); u.cap("⇧ accent"); await sleep(350);
				await u.glide(cell(c.T.rim, 11)); u.click(cell(c.T.rim, 11), { alt: true, shift: true }); u.cap("⌥⇧ slide");
			}, machine: c => ok([3, 11].every(s => trigsOf(c.T.rim).includes(s)) && [6, 14].every(s => trigsOf(c.T.bell).includes(s)), `rim ${trigsOf(c.T.rim)} bell ${trigsOf(c.T.bell)}`), within: 6000 },
			{ section: "build", say: "bar 10: REC, a tom fill on the QWERTY keys, REC off at bar 11", caption: "Record the fill live.", act: async (u, c) => {
				await look(u, rail(c.T.tom)); c.tom0 = trigsOf(c.T.tom).length; document.activeElement?.blur?.();
				const b = await atBar(10, 200); u.key(" ", { alt: true });
				await until(() => clock.total >= (b - 1) * 16 + 11, 4000); for (const k of ["a", "s", "d", "f"]) { u.key(k); await sleep(125); }
				await atBar(b + 1, 60, true); u.key(" ", { alt: true });
				await sleep(300); if (!V.playing) u.click("#play");
			}, machine: c => ok(trigsOf(c.T.tom).length > c.tom0 && tele.last?.playing && !V.rec, `tom ${c.tom0} -> ${trigsOf(c.T.tom).length}`), within: 6000 },
			{ section: "build", say: "bar 12: LOCK PARAMETER DEC on the hat, a ramp across the lane", caption: "Lock decay to every step.", act: async (u, c) => {
				await look(u, rail(c.T.hat));
				const shown = e => e && e.getBoundingClientRect().width > 0, chip = () => [$1('#chips .pk[data-lane="DEC"]'), ...$all("#chips .pk[data-lane]")].find(shown);
				await until(() => chip(), 3000); const k = chip(); if (!k) throw new Error("no lock parameter key"); c.lane = k.dataset.lane; await sleep(300); await look(u, `#chips .pk[data-lane="${c.lane}"]`);
				c.on = trigsOf(c.T.hat).filter(s => s < 16); await u.glide(`#lane .lb[data-s="${c.on[0]}"]`, 0.5, 0.9); await atBar(12, 900);
				await u.drag(`#lane .lb[data-s="${c.on[0]}"]`, c.on.slice(1).map(s => `#lane .lb[data-s="${s}"]`), { shift: true }, { fy: 0.9, stepMs: 90 }); c.li = pidx(c.T.hat, c.lane);
			}, machine: c => ok(locksOf(c.T.hat, c.li).length >= 2, "locks " + JSON.stringify(locksOf(c.T.hat, c.li))), within: 8000 },
			{ section: "build", say: "bar 13: rotate the hats a step (off the beat); swing 58 %", caption: "Rotate. Add swing.", act: async (u, c) => {
				c.h0 = trigsOf(c.T.hat); document.activeElement?.blur?.(); await atBar(13, 200); u.key("ArrowRight", { alt: true });
				const q = '.l2.ed[data-l2="swing"]'; await u.glide(q); await u.drag(q, [[0, -6], [0, -12], [0, -18], [0, -24]], {}, { stepMs: 60 });
			}, machine: c => ok(!same(trigsOf(c.T.hat), c.h0) && V.swing >= 56, `hats ${trigsOf(c.T.hat)}, swing ${V.swing}`), within: 6000 },
			{ section: "build", say: "bar 15: Sound, the picker: E12-SD on track 15, its Retrig RTRG and RTIM; a trig on beat 4", caption: "Retrig makes the roll.", act: async (u, c) => {
				c.roll = 14; await look(u, tab("sound")); await pickMachine(u, c.roll, "E12-SD");
				await setSyn(u, c.roll, [["RTRG", 12], ["RTIM", 40], ["DEC", 60]]);
				c.rt = [synV(c.roll, "RTRG"), synV(c.roll, "RTIM")];
				await look(u, tab("seq")); await u.glide(cell(c.roll, 12)); await atBar(15, 300); u.click(cell(c.roll, 12));
			}, machine: c => ok(kit().tracks[c.roll].machine === "E12-SD" && trigsOf(c.roll).includes(12) && synV(c.roll, "RTRG") === c.rt[0] && c.rt[0] >= 8, `track 15 ${kit().tracks[c.roll].machine}, RTRG ${synV(c.roll, "RTRG")} RTIM ${synV(c.roll, "RTIM")}, trigs ${trigsOf(c.roll)}`), within: 6000, hold: 2500 },
			{ section: "build", say: "bar 17: Sound, the rim's LFO: target its own DEC, a ramp shape, SPD and DEPTH", caption: "An LFO moves the decay.", act: async (u, c) => {
				await look(u, tab("sound")); await look(u, rail(c.T.rim));
				/* the selects are the page's key-style dropdowns (a .kselbtn opens #kpop) */
				await u.glide('.kselbtn[data-for="lfoT"]'); await u.pick("lfoT", c.T.rim); await sleep(400);
				await u.glide('.kselbtn[data-for="lfoP"]'); await u.pick("lfoP", "DEC"); await sleep(400);
				await look(u, '[data-slot="SHP1"][data-shape="3"]'); await sleep(200);
				await dragTo(u, '#main .pc[data-g="lfo"][data-n="SPD"]', 60); await atBar(17, 300); await dragTo(u, '#main .pc[data-g="lfo"][data-n="DEPTH"]', 48, 90);
				c.lfo = JSON.stringify(V.tracks[c.T.rim].lfo);
			}, machine: c => { const l = V.tracks[c.T.rim].lfo || {}; return ok(l.TRCK === c.T.rim && l.PARAM === "DEC" && l.SHP1 === 3, "lfo " + JSON.stringify(l)); }, within: 6000, hold: 3000 },
			{ section: "build", say: "bar 19: MUTATE the cowbell; bar 21 ⌘Z; bar 22 again", caption: "Mutate it. Undo it.", act: async (u, c) => {
				await look(u, rail(c.T.bell)); c.b0 = kitVals(c.T.bell); await u.glide("#mutband [data-rand]"); await atBar(19, 150); u.click("#mutband [data-rand]");
				await until(() => !same(kitVals(c.T.bell), c.b0), 3000);
				await atBar(21, 150); document.activeElement?.blur?.(); u.key("z", { cmd: true }); await until(() => same(kitVals(c.T.bell), c.b0), 3000); c.undone = same(kitVals(c.T.bell), c.b0);
				await atBar(22, 150); u.click("#mutband [data-rand]");
			}, machine: c => ok(c.undone && !same(kitVals(c.T.bell), c.b0), `undo back ${c.undone}, kept ${!same(kitVals(c.T.bell), c.b0)}`), within: 6000 },
			/* ---- dub ---- */
			{ section: "dub", say: "bar 23: Mix, PAN the clap; bar 24 the snare's DEL send up and the echo's feedback; bar 25 down", caption: "One hit into the echo.", act: async (u, c) => {
				await look(u, tab("mix")); const pan = `.strip[data-sel="${c.T.clap}"] .pc[data-n="PAN"]`; await u.glide(pan); await atBar(23, 400); await u.drag(pan, [[-10, 0], [-20, 0], [-30, 0]], {}, { stepMs: 80 });
				const del = `.strip[data-sel="${c.T.snare}"] .pc[data-n="DEL"]`, fb = '#main .pc[data-g="mfx"][data-n="FB"]';
				c.d0 = getV($1(del)); await u.glide(del); await atBar(24, 500); await u.drag(del, [[30, 0], [60, 0], [90, 0]], {}, { stepMs: 60 });
				c.fb0 = $1(fb) ? getV($1(fb)) : null; if ($1(fb)) { await u.glide(fb); await u.drag(fb, [[6, 0], [12, 0]], {}, { stepMs: 80 }); }
				await u.glide(del); await atBar(25, 400); await u.drag(del, [[-30, 0], [-60, 0], [-90, 0]], {}, { stepMs: 60 }); if (c.fb0 != null) { await u.glide(fb); await u.drag(fb, [[-6, 0], [-12, 0]], {}, { stepMs: 80 }); }
			}, machine: c => ok(kitVals(c.T.snare)[pidx(c.T.snare, "DEL", "rt")] <= c.d0 + 4, "DEL " + kitVals(c.T.snare)[pidx(c.T.snare, "DEL", "rt")]), within: 6000 },
			{ section: "variation", say: "bars 26-28: A copied onto B; › queues B", caption: "Copy it. Queue the next pattern.", act: async (u, c) => {
				await look(u, "#pat"); await sleep(400); await u.glide(psq(c.A));
				await look(u, '#libpop [data-la="copy"]'); await sleep(300); await u.glide(psq(c.B)); u.key("ArrowRight"); await until(() => LIB.sel === c.B, 1000); await sleep(300);
				await look(u, '#libpop [data-la="paste"]'); if (await until(dlgShown, 1500)) u.click($1("#dlg .danger") || dlgButton("Paste"));
				await until(() => hasPat(c.B) && !dlgShown(), 4000); await sleep(300);
				for (let k = 0; k < 3 && !$1("#libpop").hidden; k++) { u.key("Escape"); await until(() => $1("#libpop").hidden, 600); }
				if (!$1("#libpop").hidden) closeLib(false);
				await u.glide("#patNext"); await atBar(28, 900); u.click("#patNext"); if (await until(dlgShown, 1200)) u.click(dlgButton("Keep the edits") || dlgButton("Cancel"));
			}, machine: c => ok(hasPat(c.B) && (desk().queued === c.B || currentPatternSlot() === c.B), `B ${hasPat(c.B)}, queued ${desk().queued}, pattern ${currentPatternSlot()}`), within: 4000 },
			{ section: "variation", say: "B plays on the same kit", machine: c => ok(currentPatternSlot() === c.B && currentKitSlot() === c.kit, `pattern ${currentPatternSlot()} kit ${currentKitSlot()}`), within: 6000 },
			/* ---- resample: the full groove first ---- */
			{ section: "resample", say: "Sampler › RAM 1: Set up sampling (recorder 13, player 14); Main mix, LEN one bar; the player's PTCH 64, HOLD and DEC 127", caption: "Sample your own beat.", act: async (u, c) => {
				await look(u, tab("sampler")); await sleep(200); await look(u, '.slotk[data-slot="RAM1"]'); await sleep(400); [c.r, c.pl] = setupTracks();
				const once = $1('[data-smponce="1"]'); if (once && getComputedStyle(once.parentElement).visibility !== "hidden") { await look(u, once); await sleep(200); }
				await look(u, "[data-setupgo]"); await until(() => kit().tracks[c.pl].machine === "RAM-P1" && idle(), 6000); await sleep(300);
				await look(u, '[data-recsrc="main"]'); await sleep(200);
				const R = n => `#main .smp2 .pc[data-g="syn"][data-n="${n}"][data-t="${c.r}"]`, P = n => `#main .smp2 .pc[data-g="syn"][data-n="${n}"][data-t="${c.pl}"]`;
				await dragTo(u, R("LEN"), 64); if ($1(R("RATE"))) await dragTo(u, R("RATE"), 127);
				for (const [n, to] of [["DEC", 127], ["HOLD", 127], ["PTCH", 64], ["STRT", 0]]) { await dragTo(u, P(n), to); await until(idle, 2000); await sleep(120); }
			}, machine: c => ok(kit().tracks[c.pl].machine === "RAM-P1" && sourceOf(c.r) === "main" && kitVals(c.r)[pidx(c.r, "VOL", "rt")] === 0 && synV(c.r, "LEN") === 64 && synV(c.pl, "PTCH") === 64 && synV(c.pl, "DEC") === 127, `player ${kit().tracks[c.pl].machine}, LEN ${synV(c.r, "LEN")}, PTCH ${synV(c.pl, "PTCH")} DEC ${synV(c.pl, "DEC")}`), within: 8000 },
			{ section: "resample", say: "Capture next loop on a bar's last steps: it records the next bar, then freezes", act: async u => { await u.glide("[data-capture]"); await until(() => clock.total % 16 === 10, 4000); u.click("[data-capture]"); },
				screen: () => ok(slotState(1) === "cap", "slot " + slotState(1)), within: 3000 },
			{ section: "resample", say: "it records the bar, freezes; the take", act: async u => { await u.glide(".ramwave .wavecv", 0.5, 0.5, 900); }, screen: () => ok(slotState(1) === "frozen" && inked($1("canvas.smpwave")) > 2000, "slot " + slotState(1)), machine: () => { const t = smpSlotOf("ram", 0); return ok(t && !t.empty, "no take"); }, within: 12000 },
			/* ---- break ---- */
			{ section: "break", say: "Mix: one drag across tracks 1-5's M keys on the bar line: the beat drops", caption: "One drag drops the beat.", act: async (u, c) => {
				await look(u, tab("mix")); c.five = [0, 1, 2, 3, 4]; await u.glide(strip(0, "m")); await until(() => clock.total % 16 === 13, 4000);
				await u.drag(strip(0, "m"), c.five.slice(1).map(i => strip(i, "m")), {}, { captured: false, stepMs: 45, settle: 50 });
			}, machine: c => ok(c.five.every(i => mutes().includes(i)), "mutes " + mutes()), hold: 1500 },
			{ section: "chops", say: "Sampler: a chop on every 2nd step, from a bar line", caption: "Chop it. Reverse. Retrig.", act: async (u, c) => {
				await look(u, tab("sampler")); c.chops = [0, 2, 4, 6, 8, 10, 12, 14]; await u.glide(chopCell(0)); await atBar(clock.bar + 1, 300, true);
				for (const s of c.chops) { await u.glide(chopCell(s), 0.5, 0.5, 110); u.click(chopCell(s)); await sleep(40); }
			}, machine: c => ok(c.chops.every(s => trigsOf(c.pl).includes(s)), "player " + trigsOf(c.pl)), hold: 1500 },
			{ section: "chops", say: "Mix: solo the player on a bar line: the chops alone", act: async (u, c) => { await look(u, tab("mix")); await u.glide(strip(c.pl, "s")); await atBar(clock.bar + 1, 120, true); u.click(strip(c.pl, "s")); },
				machine: c => ok(mutes().length >= 12 && !mutes().includes(c.pl), "mutes " + mutes()), hold: 3500 },
			{ section: "chops", say: "Sampler: four chops to other slices", act: async (u, c) => {
				await look(u, tab("sampler")); c.slices = [[2, 9], [6, 3], [10, 13], [12, 5]]; await u.glide(chopCell(2)); await atBar(clock.bar + 1, 300, true);
				for (const [s, n] of c.slices) { await u.glide(chopCell(s), 0.5, 0.5, 160); const path = []; for (let k = 1; k <= n; k++) path.push([0, -6 * k - 2]); await u.drag(chopCell(s), path, {}, { stepMs: 18, settle: 60 }); }
			}, machine: c => { const st = locksOf(c.pl, pidx(c.pl, "STRT")); return ok(c.slices.every(([s, n]) => st.some(x => x[0] === s && Math.abs(x[1] - 8 * n) <= 8)), "STRT " + JSON.stringify(st)); }, within: 6000, hold: 3500 },
			{ section: "chops", say: "on a bar line: two reversed, the last two retriggered", act: async (u, c) => {
				await u.glide(chopCell(6)); await atBar(clock.bar + 1, 120, true);
				for (const s of [6, 10]) { await u.glide(chopCell(s), 0.5, 0.5, 200); u.click(chopCell(s), { alt: true }); u.cap("⌥ reverse"); await sleep(120); }
				for (const s of [12, 14]) { await u.glide(chopCell(s), 0.5, 0.5, 200); u.click(chopCell(s), { shift: true }); u.cap("⇧ retrig"); await sleep(120); }
			}, screen: () => ok([6, 10].every(s => /REV/.test($1(chopCell(s))?.textContent || "")) && [12, 14].every(s => /RTRG/.test($1(chopCell(s))?.textContent || "")), "REV / RTRG not shown"), within: 6000, hold: 4000 },
			{ section: "chops", say: "the ROM slots' waveform tiles", caption: "48 ROM sounds, one click.", act: async u => { await look(u, ".slotk.rom.has, .slotk.rom"); await sleep(300); await u.glide(".romtiles", 0.5, 0.3, 900); },
				screen: () => ok($all(".romtile canvas.tw").length > 0, "no tiles"), hold: 1500 },
			/* ---- riser and drop ---- */
			{ section: "riser", say: "Mix: un-solo on a bar line (the break comes back with the chops); Sound: ⌥-drag the hat's FLTF up over 3 bars", caption: "Sweep the whole kit.", act: async (u, c) => {
				await look(u, tab("mix")); await u.glide(strip(c.pl, "s")); await atBar(clock.bar + 1, 70, true); u.click(strip(c.pl, "s"));
				await look(u, tab("sound")); await look(u, rail(c.T.hat)); const q = '#main .pc[data-g="fx"][data-n="FLTF"]'; c.k0 = allKitVals(); c.v0 = getV($1(q));
				const up = Math.min(50, 110 - c.v0), path = []; for (let k = 1; k <= 48; k++) path.push([Math.round(up * k / 48), 0]);
				await u.glide(q); await atBar(clock.bar + 1, 120, true); await u.drag(q, path, { alt: true }, { stepMs: 110 });
			}, machine: c => ok(allKitVals().filter((v, t) => !same(v, c.k0[t])).length >= 2 && !S.soloSet.size, "the sweep moved too few tracks") },
			{ section: "riser", say: "Sequence: ⇧-click tracks 1-5's M keys: armed", act: async (u, c) => { await look(u, tab("seq")); u.cap("⇧ hold"); for (const i of c.five) { await u.glide(railM(i), 0.5, 0.5, 160); u.click(railM(i), { shift: true }); await sleep(50); } },
				screen: c => ok(c.five.every(i => $1(railM(i)).classList.contains("prep")), "not armed"), within: 2000 },
			{ section: "drop", say: "⇧ up on the bar line, ⌘Z the sweep", caption: "Release on the bar.", act: async u => { await atBar(clock.bar + 1, 70, true); document.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", code: "ShiftLeft", bubbles: true })); u.cap("⇧ release"); document.activeElement?.blur?.(); u.key("z", { cmd: true }); },
				machine: c => ok(c.five.every(i => !mutes().includes(i)) && same(allKitVals(), c.k0), `mutes ${mutes()}, kit back ${same(allKitVals(), c.k0)}`), within: 6000, hold: 6000 },
			{ section: "drop", say: "Mix: solo the snare and the chops on a bar line; un-solo two bars later", caption: "Solo with a drag.", act: async (u, c) => {
				await look(u, tab("mix")); await u.glide(strip(c.T.snare, "s")); await atBar(clock.bar + 1, 150, true); u.click(strip(c.T.snare, "s")); await sleep(100); await look(u, strip(c.pl, "s"));
				await u.glide(strip(c.T.snare, "s")); await atBar(clock.bar + 2, 150, true); u.click(strip(c.T.snare, "s")); await sleep(100); await look(u, strip(c.pl, "s"));
			}, machine: c => ok(!S.soloSet.size && same(mutes(), [c.r]), "solo " + [...S.soloSet] + " mutes " + mutes()), within: 6000, hold: 2000 },
			{ section: "variation", say: "Sequence: GEN rolls the open hat; rotate it a bar later", caption: "Roll it again.", act: async (u, c) => {
				await look(u, tab("seq")); await genAt(u, c.T.open); await u.glide("#genpop [data-rand]"); await atBar(clock.bar + 1, 200, true); await genRoll(u, c.T.open); await genDone(u);
				c.o1 = trigsOf(c.T.open); document.activeElement?.blur?.(); await atBar(clock.bar + 1, 150, true); u.key("ArrowRight", { alt: true });
			}, machine: c => ok(!same(trigsOf(c.T.open), c.o1), "open hat not rotated"), hold: 2500 },
			/* ---- outro ---- */
			{ section: "outro", say: "Song: Chain", caption: "Chain the patterns.", act: async u => { await look(u, tab("song")); await look(u, '[data-set="songpick"] button[data-v="chain"]'); }, screen: () => ok(!!$1("[data-chainpad]"), "no pads") },
			{ section: "outro", say: "STOP on a bar line, chain pads A and B (loaded), PLAY: the chain starts at A", act: async (u, c) => {
				const b = c.A >> 4; if (S.bank !== b) { await look(u, `[data-bank="${b}"]`); await sleep(200); }
				await u.glide("#play"); await atBar(clock.bar + 1, 30, true); u.click("#play"); await until(() => !V.playing, 2000);
				await look(u, `[data-chainpad="${c.A}"]`); await sleep(150); await look(u, `[data-chainpad="${c.B}"]`);
				await until(() => desk().chain?.active, 3000); await look(u, "#play");
			}, machine: c => ok(desk().chain?.active && same(desk().chain.patterns, [c.A, c.B]) && tele.last?.playing && currentPatternSlot() === c.A, `chain ${JSON.stringify(desk().chain)}, pattern ${currentPatternSlot()}`), within: 5000 },
			{ section: "outro", say: "the chain moves on: B", act: async u => { await u.glide(".chainrow", 0.5, 0.5, 600); }, machine: c => ok(currentPatternSlot() === c.B, "pattern " + currentPatternSlot()), within: 6000 },
			{ section: "outro", say: "back to A", machine: c => ok(currentPatternSlot() === c.A, "pattern " + currentPatternSlot()), within: 6000 },
			{ section: "outro", say: "Sequence: mute perc, the chops, the hats and the bass, the kick, two bars apart", caption: "Strip it back.", act: async (u, c) => {
				await look(u, tab("seq")); const b0 = clock.bar + 1;
				for (const [k, ts] of [[c.T.rim, c.T.bell, c.roll], [c.pl], [c.T.hat, c.T.open, c.bass], [c.T.kick]].entries()) { await u.glide(railM(ts[0])); await atBar(b0 + 2 * k, 150, true); for (const t of ts) { u.click(railM(t)); await sleep(80); } }
			}, machine: c => ok([c.T.kick, c.T.hat, c.pl].every(t => mutes().includes(t)), "mutes " + mutes()), within: 4000, hold: 1500 },
			{ section: "outro", say: "⇧-click the muted tracks, ⇧ up on the bar line: everything back", caption: "End on the bar.", act: async (u, c) => {
				c.back = mutes().filter(t => t !== c.r); u.cap("⇧ hold"); for (const t of c.back) { await u.glide(railM(t), 0.5, 0.5, 140); u.click(railM(t), { shift: true }); await sleep(40); }
				await atBar(clock.bar + 1, 70, true); document.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", code: "ShiftLeft", bubbles: true })); u.cap("⇧ release");
			}, machine: c => ok(same(mutes(), [c.r]), "mutes " + mutes()), hold: 3600 },
			{ section: "outro", say: "STOP on the bar line", act: async u => { await u.glide("#play"); await atBar(clock.bar + 2, 30, true); u.click("#play"); }, machine: () => ok(tele.last && !tele.last.playing, "playing"), hold: 400 }
		],
		async tidy(u) { clock.on = false; if (desk().chain?.active) cmd("chainClear"); if (V.playing) u.click("#play"); if (S.soloSet.size) setSolo(new Set()); }
	};
	const demos = [groove, full, sampler, techniques];

	/* ---------- the page's neutral state between journeys ---------- */
	/* Every journey is independent (doc/modern-ux/JOURNEYS.md, "Independent journeys"): it builds what it needs and its tidy
	   puts back what it changed. This is the guard: it looks at what the one before left and SAYS it (the runner logs
	   "JOURNEY <name> before: left ..." and scripts/mdmm-page.mjs prints them as a WARN), it fixes nothing after a journey that passed;
	   after a FAILED one (its tidy may not have run to the end: the state is unknown) it puts the page right so one failure
	   does not become a row of them (the fix is said too, "after a failure: ..."). What it waits for is not a fix: the machine
	   restarting after a reset (the start-up card), a person waits for it too. */
	async function between(u, fix = true) {
		const left = [];
		const act = async (what, f) => { left.push(what); if (fix) await f(); };
		for (let i = 0; i < 3 && dlgShown(); i++) { await act("a question open", async () => { u.key("Escape"); await sleep(200); }); if (!fix) break; }
		if (LIB.open) await act("the library open", async () => { closeLib(false); await sleep(100); });
		for (const q of ["#globpop", "#keyspop", "#audiopop", "#machpop", "#kpop"]) if ($1(q) && !$1(q).hidden) await act(q + " open", async () => { u.key("Escape"); await sleep(150); });
		/* the machine restarting (a journey that reset it: the start-up card is back): it is waited for, as a person waits, so
		   the next journey does not meet a covered page (md-engine-memory, then md-top-cpu-meter ... in the 0.6 evidence run) */
		if (!$1("#bootcard").hidden) { await until(() => $1("#bootcard").hidden, 120000); await sleep(1500); }
		if (!$1("#bootcard").hidden) $1('#bootcard [data-bootrom="close"]')?.click();
		if (V.rec) await act("recording", async () => { u.click("#rec"); await sleep(300); });
		if (V.playing) await act("playing", async () => { u.click("#play"); await until(() => !V.playing, 3000); });
		if (S.soloSet.size) await act("a track soloed", async () => { setSolo(new Set()); await sleep(200); });
		/* PATTERN mode: a journey that left the machine in SONG mode made the next one that plays play a song row (and its
		   HALT) instead of the pattern (md-song-commands, then md-seq-page-leds) */
		if (machineState().songMode === true) await act("the machine in SONG mode", async () => { cmd("seqMode", { song: false }); await until(() => machineState().songMode === false && V.songMode === false, 4000); });
		await until(idle, 4000); await sleep(500);
		return left.length ? `left ${left.join(", ")}${fix ? " (after a failure: put right)" : ""}` : "";
	}
	/* what the guard compares before and after each journey (shared/deskJourney.js, page.state): the machine's documents and modes.
	   A document is its JSON (a slot loaded only in one of the two is not compared; the log says where one differs) */
	const VOLATILE = new Set(["nameTail", "lfoState", "source", "pending"]);
	const hash = x => JSON.stringify(x, (k, v) => VOLATILE.has(k) ? undefined : v) || "";
	function state() {
		const o = { "pattern slot": currentPatternSlot(), "kit slot": currentKitSlot(), "song slot": currentSongSlot(), "song mode": machineState().songMode, playing: !!V.playing, recording: !!V.rec,
			mutes: mutes().join(), solo: [...S.soloSet].join(), chain: JSON.stringify(desk().chain || null), global: hash(Docs.global), "working kit": hash(Docs.workingKit && { slot: Docs.workingKit.slot, doc: Docs.workingKit.doc }), "kit state": machineState().kit?.working };
		for (const [k, v] of Object.entries(Docs.patterns)) o["pattern " + k] = hash(v);
		for (const [k, v] of Object.entries(Docs.kits)) o["kit " + k] = hash(v);
		for (const [k, v] of Object.entries(Docs.songs)) o["song " + k] = hash(v);
		return o;
	}
	async function ready() {
		const up = await until(() => !!machineState().input && V.loaded && $1("#bootcard")?.hidden !== false, 120000);
		await until(() => !desk().loading, 90000);
		await sleep(1500);
		return up;
	}
	/* Before the first journey: the active GLOBAL reset to the factory settings, through the GLOBAL panel's own Reset to
	   defaults (DeskGlobal.host.reset: globalReset), and read back. The journeys run on a copy of the person's settings
	   (scripts/mdmm-journeys.sh), whose machine may hold a personal or imported global (another base channel: the
	   keyboard's notes miss the tracks); the journeys assume the factory one. */
	async function prepare() {
		const say = g => g ? `base ${g.baseChannel}, tempo out ${g.control?.tempoOut}` : "not read";
		await until(() => !!Docs.global, 20000);
		const n = Docs.global?.slot, was = say(Docs.global);
		results.length = 0;
		DeskGlobal.host.reset();
		await until(() => results.some(r => r.op === "globalReset"), 20000);
		const r = results.find(r => r.op === "globalReset");
		const slot = n != null ? `GLOBAL ${n + 1}` : "the active GLOBAL";
		if (!r || !r.ok) return `${slot} not reset (${r ? (r.errors || []).join("; ") : "no answer"}); the journeys run on it as it is (${was})`;
		const back = await until(() => Docs.global?.baseChannel === 0 && Docs.global?.control?.tempoOut === false, 20000);
		await until(idle, 10000);
		await sleep(1000);
		return `${slot} reset to the factory settings (GLOBAL › Clear): was ${was}, now ${say(Docs.global)}${back ? "" : " (not read back yet)"}`;
	}
	/* what the page last told the person: its toast and its error line */
	const context = () => [...[["toast", $1("#toast")], ["error", $1("#errline")]].filter(([, e]) => e && !e.hidden && e.textContent.trim()).map(([k, e]) => `${k} "${e.textContent.trim().slice(0, 160)}"`),
		...results.filter(r => r.ok === false).slice(-3).map(r => `refused ${r.op}: ${(r.errors || []).join("; ")}`)].join(", ");
	if (/[?&]selftest=journey/.test(location.search)) setTimeout(() => Journey.run(all, { log: t => Bridge.log(t), ready, prepare, between, context, state, begin }), 0);
	if (/[?&]selftest=demo/.test(location.search)) setTimeout(() => Journey.demo(demos, { log: t => Bridge.log(t), ready, between, context }), 0);
	return { all, demos };
})();
