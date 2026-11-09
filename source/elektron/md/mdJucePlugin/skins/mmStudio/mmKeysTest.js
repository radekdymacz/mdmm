"use strict";
/* The Monomachine Editor page's key map (the mockup's 56-keys.js, the Machinedrum Editor's map; MM-PORT-PLAN.md b),
   checked as mdDeskKeysTest.js checks the MD's: every Keys.bind entry of the page's script, as the page makes them
   (the generated mmMockup.js runs here on a stand-in DOM that answers everything and does nothing; no host, so the
   mockup's own example engine), against the map's rules: plain keys play, a plain letter off the piano row acts on
   the selected track, Alt is all (two Alts are not: rotate and record), no ⇧ or ⌘ letter commands but the standard
   ⌘Z ⌘⇧Z ⌘Y ⌘C ⌘V; and no two dispatched entries share a key and modifiers unless both have a when() the test knows
   are exclusive.
     node mmKeysTest.js */
const fs = require("fs"), path = require("path");
/* the page's UI script (sync-mmstudio-skin.py: the page's sources in src/page.txt order); the host and the translation are not keys */
const FILES = ["mmMockup.js"];
let failures = 0;
const check = (ok, what) => { console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) failures++; };

/* ---- the scripts on a stand-in: every unknown name is "any" (callable, constructible, every property any) ---- */
const any = new Proxy(function () { }, {
	get: (t, k) => k === Symbol.toPrimitive ? () => 0 : k === Symbol.iterator ? function* () { } : k === "length" ? 0 : any,
	apply: () => any, construct: () => any, has: () => false, set: () => true });
const real = { Math, JSON, Object, Array, String, Number, Boolean, Set, Map, WeakMap, WeakSet, Symbol, Promise, Date, RegExp, Error, TypeError, parseInt, parseFloat, isNaN, isFinite,
	Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array, Float32Array, Float64Array, DataView, ArrayBuffer, console, encodeURIComponent, decodeURIComponent,
	Infinity, NaN, undefined,
	URLSearchParams, location: { hash: "", search: "" } };	/* no deep link: the mockup starts as it does on its own */
const scope = new Proxy({}, {
	has: () => true,
	get: (t, k) => k === Symbol.unscopables ? undefined : k in t ? t[k] : k in real ? real[k] : any,
	set: (t, k, v) => { t[k] = v; return true; } });
const src = FILES.map(f => fs.readFileSync(path.join(__dirname, f), "utf8").replace(/^"use strict";/, ""))
	.join("\n;\n");
const { Keys, piano, oct, base, kbOct, S, renderKb, P } = new Function("scope", "with (scope) {\n" + src + "\n;return { Keys, piano: KEYS_PIANO, oct: KEYS_OCT, base: KEYS_BASE, kbOct: KBOCT, S, renderKb, P: { kbFollowOct, kbFollow, setMidiHeld, kbAnyHeld, KBLIT, KB, jxStep, jxPick, jxNormReg, jxUnits, jxClick, jxStopRandom, jxRelease, jxTick } }; }")(scope);
const list = Keys.list(), does = b => { try { return typeof b.does === "function" ? String(b.does()) : String(b.does); } catch (_) { return ""; } };
check(list.length > 40, `the scripts ran to their ends: ${list.length} entries`);

/* ---- I-040: Z / X and the Perform keyboard reach every MIDI note 0-127 ---- */
const topKey = Math.max(...Object.values(piano));
check(base + 12 * oct[0] === 0 && base + 12 * oct[1] + topKey >= 127 && base + 12 * (oct[1] - 1) + topKey < 127, `the A key plays from MIDI ${base + 12 * oct[0]} to ${base + 12 * oct[1]}, the top key to ${base + 12 * oct[1] + topKey} (clamped 127): ${oct[1] - oct[0] + 1} octaves`);
/* B-185: the Perform keyboard covers the hardware's range C-0 to B-8 (MIDI 12-119), four octaves a stop, every stop the same key width (B-177). */
check(12 * (kbOct[0] + 1) === 12 && 12 * (kbOct[1] + 1) + 47 === 119, `the Perform keyboard (four octaves) stops from MIDI ${12 * (kbOct[0] + 1)} to ${12 * (kbOct[1] + 1)}, the last ends on MIDI 119 (B-8)`);
const oldOctave = S.kbOct;
const widths = h => [...h.matchAll(/class="w[^"\n]*" data-key="\d+" style="left:[^;]+;width:([^%]+)%/g)].map(m => +m[1]);
S.kbOct = kbOct[0];
const lowKeys = renderKb();
S.kbOct = 3;
const normalKeys = renderKb();
S.kbOct = kbOct[1];
const topKeys = renderKb();
S.kbOct = oldOctave;
const allWidths = [lowKeys, normalKeys, topKeys].map(widths);
check(allWidths.every(w => w.length === 28 && w.every(x => Math.abs(x - 100 / 28) < 1e-9)), "Perform: the same white-key width at C-0, C-3 and the last stop");
const notesOf = h => [...h.matchAll(/data-key="(\d+)"/g)].map(m => +m[1]);
const lowNotes = notesOf(lowKeys), topNotes = notesOf(topKeys);
check(lowNotes.length === 48 && Math.min(...lowNotes) === 12 && topNotes.length === 48 && Math.max(...topNotes) === 119, "Perform: the keys run MIDI 12 (C-0) to 119 (B-8) and nothing else");
check(/data-key="60"[^>]*title="C-4"/.test(normalKeys) && /data-key="61"[^>]*title="C#4"/.test(normalKeys), "Perform: a hovered key names its note (title)");

/* ---- the physical key of an entry's key, as the dispatcher matches it (e.key upper-cased, or e.code) ---- */
const keyId = k => /^[A-Z]$/.test(k) ? "Key" + k : /^[0-9]$/.test(k) ? "Digit" + k : k;
const ids = b => b.code ? [b.code] : b.keys.map(keyId);
/* the modifiers an entry answers: its own; a plain non-letter character also with ⇧ (the dispatcher's "?" rule) */
const mods = b => (b.mod || "") === "" && !b.code && b.keys.some(k => k.length === 1 && !/[A-Z]/.test(k)) ? ["", "shift"] : [b.mod || ""];
const run = list.filter(b => b.run), name = b => `${Keys.label(b)} (${b.group})`;

/* ---- rule: no ⇧ chords, ⌘ only for the standard edit keys ---- */
/* the standard edit keys, and the selection's (K7, as the Machinedrum Editor: ⌘X ⌘D ⌘A, ⇧← ⇧→ extend) */
const STD_CMD = new Set(["cmd KeyZ", "cmd+shift KeyZ", "cmd KeyY", "cmd KeyC", "cmd KeyV", "cmd KeyX", "cmd KeyD", "cmd KeyA", "shift ArrowLeft", "shift ArrowRight", "shift KeyB",
	/* I-036 (0.8): one note selected, ⇧↑ ⇧↓ an octave */
	"shift ArrowUp", "shift ArrowDown",
	/* wave 2 (DESIGN-machine-menus.md §3, approved 2026-10-11): ⇧Space pauses, ⌘. is panic */
	"shift Space", "cmd .",
	/* wave 4: the copy / paste / clear what windows (DESIGN-machine-menus.md §3) */
	"cmd+shift KeyC", "cmd+shift KeyV", "cmd+shift Backspace"]);
const badMod = run.filter(b => ids(b).some(id => { const m = b.mod || ""; return m.includes("shift") && !STD_CMD.has(m + " " + id) || m.includes("cmd") && !STD_CMD.has(m + " " + id); }));
check(!badMod.length, "no ⇧ or ⌘ commands but ⇧B (tap tempo), ⌘Z ⌘⇧Z ⌘Y ⌘C ⌘V ⌘⇧C ⌘⇧V ⌘⇧⌫, the selection's ⌘X ⌘D ⌘A ⇧← ⇧→" + (badMod.length ? ": " + badMod.map(name).join(", ") : ""));

/* ---- rule: no two dispatched entries on one key and modifiers, unless both are conditional and known exclusive ---- */
/* Escape: each closes what is open (the help, a dialog, LEARN, the paste marks, the selection, GLOBAL), one at a time;
   ← →: the Song's rows or the selected steps (by workspace); B: tap tempo */
/* Delete, ⌫: erase while live recording, clear a step while step recording (MM), the selection on Sequence or the row on
   Song otherwise (wave 7; each when() names its state) */
/* ↑ ↓: one note selected (its pitch, ⇧ an octave) or the track move, by when() (I-036) */
const EXCLUSIVE = new Set([" Escape", " ArrowUp", " ArrowDown", " ArrowLeft", " ArrowRight", " Enter", " KeyB", " Delete", " Backspace"]);
const by = new Map();
for (const b of run) for (const id of ids(b)) for (const m of mods(b)) { const k = m + " " + id; by.set(k, [...(by.get(k) || []), b]); }
const clash = [...by].filter(([k, bs]) => bs.length > 1 && (bs.some(b => !b.when) || !EXCLUSIVE.has(k)));
check(!clash.length, "no two dispatched entries share a key and modifiers" + (clash.length ? ": " + clash.map(([k, bs]) => `${k} → ${bs.map(name).join(" / ")}`).join("; ") : ""));

/* ---- the approved map is there (RULE 1-3) ---- */
const has = (m, id) => run.some(b => (b.mod || "") === m && ids(b).includes(id));
/* R / Alt+R: randomise the selected track / every track (GEN, on Sound MUTATE; MM-PORT-PLAN.md d) */
const WANT = [["shift", "KeyB", "tap tempo on every workspace"], ["", "KeyR", "randomise the selected track"], ["alt", "KeyR", "randomise every track"], ["", "KeyA", "a note"], ["", "KeyL", "a note"], ["", "KeyZ", "octave down"], ["", "KeyX", "octave up"], ["", "KeyC", "velocity down"], ["", "KeyV", "velocity up"],
	["", "Space", "play / stop"], ["alt", "Space", "record + play"], ["", "KeyM", "mute the selected track"], ["", "KeyB", "tap tempo"], ["", "KeyW", "a black key (C♯)"], ["", "KeyT", "a black key (F♯)"], ["", "KeyP", "a black key (D♯)"],
	["", "ArrowUp", "previous track"], ["", "ArrowDown", "next track"], ["alt", "KeyM", "mute / unmute all"], ["alt", "Delete", "clear the pattern"],
	["alt", "ArrowLeft", "rotate"], ["alt", "ArrowRight", "rotate"], ["", "Digit0", "unmute / unsolo all"], ["cmd", "KeyZ", "undo"], ["cmd", "KeyC", "copy"], ["cmd", "KeyV", "paste"],
	["", "?", "the list of keys"]];
const missing = WANT.filter(([m, id]) => !has(m, id));
check(!missing.length, "the approved keys are bound" + (missing.length ? ": missing " + missing.map(([m, id, w]) => `${m}+${id} (${w})`).join(", ") : ""));
const GONE = [["cmd", "KeyR", "⌘R"], ["shift", "KeyR", "⇧R"], ["shift", "KeyD", "⇧D"], ["shift", "KeyF", "⇧F"], ["shift", "KeyG", "⇧G"], ["shift", "KeyL", "⇧L"]];
const still = GONE.filter(([m, id]) => has(m, id));
/* R randomises: on Sound MUTATE, elsewhere GEN; Alt+R every track (matched on the physical key, e.code) */
const rKeys = run.filter(b => b.code === "KeyR");
check(rKeys.length === 2 && rKeys.every(b => /randomise/i.test(does(b))) && rKeys.some(b => b.mod === "alt" && /every/i.test(does(b))), "R and Alt+R randomise (GEN, on Kit MUTATE), on the physical key");
/* W is a black key now (C♯), not Walk; T is F♯, so tap tempo is B (MM-PORT-PLAN.md 2026-10-05) */
const walk = run.filter(b => ids(b).includes("KeyW") && /walk/i.test(does(b))), tTap = run.filter(b => ids(b).includes("KeyT") && /tap/i.test(does(b)));
check(!walk.length && !tTap.length, "W is not Walk and T does not tap (both play notes)" + (walk.length || tTap.length ? ": " + [...walk, ...tTap].map(name).join(", ") : ""));
/* the two rows play every semitone: A..P are 0..15 above the A key's note, the white keys C major's steps */
const PIANO = "A W S E D F T G Y H U J K O L P".split(" ");
check(piano && PIANO.every((k, i) => piano[k] === i) && Object.keys(piano).length === 16, "the piano keys play semitones 0-15 in the DAW layout: " + JSON.stringify(piano));
check(["A", "S", "D", "F", "G", "H", "J", "K", "L"].map(k => piano[k]).join(" ") === "0 2 4 5 7 9 11 12 14", "the home row stays the white keys C D E F G A B C D");
const playing = run.filter(b => b.run && b.group === "Playing" && b.hidden).flatMap(ids);
check(PIANO.every(k => playing.includes("Key" + k)), "every piano key is dispatched to the keyboard: " + PIANO.filter(k => !playing.includes("Key" + k)).join(" "));
/* ⇧← ⇧→ extend the selection now (K7); rotate stays on Alt + the arrows */
const shiftRotate = run.filter(b => b.mod === "shift" && ids(b).includes("ArrowLeft") && /rotate/i.test(does(b)));
check(!shiftRotate.length, "⇧← does not rotate (it extends the selection)");
check(!still.length, "the removed keys are gone" + (still.length ? ": " + still.map(x => x[2]).join(", ") : ""));
/* the MM's old map: R was RECORD and L was LEARN; the home row's L is a note now and recording is Alt+Space */
const oldR = run.filter(b => ids(b).includes("KeyR") && /record/i.test(does(b))), oldL = run.filter(b => ids(b).includes("KeyL") && /learn/i.test(does(b)));
check(!oldR.length && !oldL.length, "R is not RECORD and L is not LEARN any more" + (oldR.length || oldL.length ? ": " + [...oldR, ...oldL].map(name).join(", ") : ""));
/* the old hard-wired key handler (e.key === "r" for record, "l" for LEARN) must not come back beside the map */
const page0 = fs.readFileSync(path.join(__dirname, "mmMockup.js"), "utf8");
check(!/e\.key==="r"\|\|e\.key==="R"|e\.key==="l"\|\|e\.key==="L"/.test(page0), "no key handler outside the map for R or L");
const page = FILES.map(f => fs.readFileSync(path.join(__dirname, f), "utf8")).join("\n") + fs.readFileSync(path.join(__dirname, "mmStudio.html"), "utf8");

/* ---- what the page says names the keys as they are ---- */
const OLD = ["⌘R", "⇧R", "⇧D", "⇧F", "⇧G", "⇧L", "Shift+G", "Shift+R", "Shift+Enter", "Walk", "Grid record (R)", "Hold R", "Option+1", "Alt+Q"];
const said = OLD.filter(t => page.includes(t)), saidHelp = OLD.filter(t => list.some(b => does(b).includes(t)));
check(!said.length && !saidHelp.length, "no hint, tooltip or help row names a removed key" + (said.length || saidHelp.length ? ": " + [...new Set([...said, ...saidHelp])].join(", ") : ""));

/* ---- the help overlay: its groups, and no row twice ---- */
const shown = list.filter(b => !b.hidden), groups = [...new Set(shown.map(b => b.group))];
check(["Playing", "Selected track", "All", "Transport", "Anywhere"].every(g => groups.includes(g)), "the help has Playing, Selected track, All, Transport, Anywhere: " + groups.join(", "));
const rows = shown.map(b => b.group + "|" + Keys.label(b) + "|" + does(b)), twice = rows.filter((r, i) => rows.indexOf(r) !== i);
check(!twice.length, "no help row twice" + (twice.length ? ": " + twice.join("; ") : ""));
const undescribed = run.filter(b => !b.hidden && !does(b));
check(!undescribed.length, "every visible dispatched key says what it does" + (undescribed.length ? ": " + undescribed.map(name).join(", ") : ""));

/* ---- I-062: the Perform keyboard follows the octave of a played note ---- */
{
	const lo = k => 12 * (k + 1), hi = k => Math.min(lo(k) + 47, 119);
	let ok = true;
	for (let k = kbOct[0]; k <= kbOct[1]; k++) for (let n = lo(k); n <= hi(k); n++) if (P.kbFollowOct(n, k) !== k) ok = false;
	check(ok, "follow: a note inside the four octaves shown never moves the keyboard");
	ok = true;
	for (let cur = kbOct[0]; cur <= kbOct[1]; cur++) for (let n = 12; n <= 119; n++) { const k = P.kbFollowOct(n, cur); if (!(k >= kbOct[0] && k <= kbOct[1] && n >= lo(k) && n <= hi(k))) ok = false; }
	check(ok, "follow: every note C-0 to B-8 is shown after the move, and the stop stays inside the stops");
	check(P.kbFollowOct(0, 3) === 0 && P.kbFollowOct(127, 0) === 5 && P.kbFollowOct(36, 3) === 1 && P.kbFollowOct(96, 3) === 5, "follow: the note's octave is the second shown (36 -> lowest C-1), notes beyond the range use the first or last stop");
	/* the rules around it: a MIDI note moves it once, nothing else held; a held key, the mouse, and the off switch stop it */
	S.ws = "control";	/* not the Perform page: only the state moves, nothing is drawn */
	S.kbFollow = true; S.kbOct = 3; P.KBLIT.mouse = null; P.KBLIT.midi = new Set(); P.KB.held.clear();
	P.setMidiHeld([20]);
	check(S.kbOct === 0, "follow: the first MIDI note (20) outside the shown range moves the keyboard (stop " + S.kbOct + ")");
	P.setMidiHeld([20, 100]);
	check(S.kbOct === 0, "follow: no jump while a key is held (a second note, 100, leaves the keyboard)");
	P.setMidiHeld([]); P.setMidiHeld([100]);
	check(S.kbOct === 5 - 0 && S.kbOct === P.kbFollowOct(100, 0), "follow: after all keys are up the next note moves it again (stop " + S.kbOct + ")");
	P.setMidiHeld([]); S.kbOct = 3; P.KBLIT.mouse = 60;
	P.setMidiHeld([20]);
	check(S.kbOct === 3, "follow: a key held with the mouse also keeps it still");
	P.setMidiHeld([]); P.KBLIT.mouse = null; S.kbOct = 3;
	P.KB.held.set("KeyA", { t: 0, n: 60 });
	check(P.kbAnyHeld(), "follow: a held computer key counts as held");
	P.setMidiHeld([20]);
	check(S.kbOct === 3, "follow: a computer key held keeps it still against a MIDI note");
	P.KB.held.clear(); P.setMidiHeld([]);
	S.kbFollow = false; S.kbOct = 3; P.setMidiHeld([20]); P.setMidiHeld([]);
	check(S.kbOct === 3, "follow: switched off, nothing moves it");
	S.kbFollow = true; S.kbOct = 3;
	check(!P.kbAnyHeld() && P.kbFollow(60) === false && S.kbOct === 3, "follow: playing inside the range returns false");
	check(P.kbFollow(30) === true && S.kbOct === 0, "follow: the computer keys' note 30 moves it to the first stop");
	S.kbOct = 3;
}

/* ---- I-061: the joystick's RANDOM stays in its region, at the speed set; HOLD and the region are well formed ---- */
{
	const reg = P.jxNormReg({ x0: 0.6, y0: -0.2, x1: -0.4, y1: 0.8 });
	check(reg.x0 === -0.4 && reg.x1 === 0.6 && reg.y0 === -0.2 && reg.y1 === 0.8, "joystick: a region's corners are put in order");
	const tiny = P.jxNormReg({ x0: 1, y0: 1, x1: 1, y1: 1 }), huge = P.jxNormReg({ x0: -5, y0: -5, x1: 5, y1: 5 });
	check(tiny.x1 - tiny.x0 >= 0.1 - 1e-9 && tiny.y1 - tiny.y0 >= 0.1 - 1e-9 && tiny.x1 <= 1 + 1e-9 && tiny.y1 <= 1 + 1e-9, "joystick: a region is at least 0.1 wide and high, inside the field");
	check(huge.x0 === -1 && huge.x1 === 1 && huge.y0 === -1 && huge.y1 === 1, "joystick: a region beyond the field is cut to it");
	let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
	let allIn = true, hits = 0, maxStep = 0, minStep = 1e9;
	for (const speed of [1, 5, 10]) {
		const r = P.jxNormReg({ x0: -0.5, y0: 0.1, x1: 0.2, y1: 0.7 });
		let p = P.jxPick(r, rnd), tgt = P.jxPick(r, rnd);
		for (let i = 0; i < 3000; i++) {
			const n = P.jxStep(p, tgt, speed, 0.033);
			maxStep = Math.max(maxStep, Math.hypot(n.x - p.x, n.y - p.y)); if (!n.hit) minStep = Math.min(minStep, Math.hypot(n.x - p.x, n.y - p.y));
			p = { x: n.x, y: n.y };
			if (n.hit) { hits++; tgt = P.jxPick(r, rnd); }
			if (p.x < r.x0 - 1e-9 || p.x > r.x1 + 1e-9 || p.y < r.y0 - 1e-9 || p.y > r.y1 + 1e-9) allIn = false;
		}
	}
	check(allIn && hits > 50, `joystick: RANDOM never leaves its region over 9000 steps at speeds 1, 5 and 10 (${hits} targets reached)`);
	check(P.jxUnits(10) > P.jxUnits(5) && P.jxUnits(5) > P.jxUnits(1) && Math.abs(P.jxUnits(1) * 0.033 - minStep) < 1e-6 && Math.abs(P.jxUnits(10) * 0.033 - maxStep) < 1e-6, "joystick: the speed sets the step (1 slowest, 10 fastest); a step is speed x time");
	const one = P.jxStep({ x: 0, y: 0 }, { x: 0.01, y: 0 }, 10, 0.033);
	check(one.hit && one.x === 0.01, "joystick: a step that reaches the target lands on it, never beyond");
}

console.log("mmKeysTest: " + (failures ? "FAIL" : "PASS") + " (" + failures + " failures)");
process.exit(failures ? 1 : 0);
