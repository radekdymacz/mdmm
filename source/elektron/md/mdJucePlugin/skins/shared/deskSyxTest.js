"use strict";
/* The SysEx import panel's pure part (Syx.model, deskSyx.js, both editors): the machine's slot grid per kind, the
   counts the tabs and the footer show, Shift-click ranges and the report per slot. The panel's markup is drawn from
   these; the journeys (md-lib-syx-import, mm-lib-syx-import) check it against the machine.
     node deskSyxTest.js */
const fs = require("fs"), path = require("path"), vm = require("vm");
let failures = 0;
const check = (ok, what) => { console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) failures++; };
const el = () => ({ setAttribute() { }, appendChild() { }, addEventListener() { }, classList: { toggle() { } }, querySelector: () => null, querySelectorAll: () => [] });
const ctx = vm.createContext({ document: { createElement: el, body: el(), addEventListener() { } }, console });
vm.runInContext(fs.readFileSync(path.join(__dirname, "deskSyx.js"), "utf8") + "\nthis.Syx = Syx;", ctx);
const M = ctx.Syx.model;
const items = (n, f) => Array.from({ length: n }, (_, slot) => Object.assign({ slot, name: "N" + slot, overwrites: false, plays: false }, f ? f(slot) : {}));

/* the slot names, as on the machine */
check(M.slotLabel("kit", 0) === "K01" && M.slotLabel("kit", 63) === "K64", "kits K01..K64");
check(M.slotLabel("pattern", 0) === "A01" && M.slotLabel("pattern", 17) === "B02" && M.slotLabel("pattern", 127) === "H16", "patterns A01..H16");
check(M.slotLabel("song", 4) === "S05" && M.slotLabel("global", 7) === "G8", "songs S01.., globals G1..G8");

/* the grids: the machine's slots, whether the file has them or not */
{
	const g = M.layout("Machinedrum", "kit", items(3));
	check(g.cols === 8 && g.rows.length === 8 && g.rows[1].label === "09", "MD kits: 8 x 8, rows 01, 09, ..");
	check(g.rows[0].cells[2].item?.name === "N2" && g.rows[0].cells[3].item === null, "a slot not in the file is drawn empty");
	const m = M.layout("Monomachine", "kit", items(128));
	check(m.cols === 8 && m.rows.length === 16 && m.rows[15].cells[7].label === "K128" && m.rows[15].label === "121", "MM kits: 16 x 8 (whole names, the panel scrolls)");
	const p = M.layout("Machinedrum", "pattern", items(128));
	check(p.cols === 16 && p.rows.map(r => r.label).join("") === "ABCDEFGH", "patterns: banks A-H x 16, as the pattern palette");
	check(M.layout("Machinedrum", "song", items(24)).rows.length === 4, "MD songs: 32 slots, 4 x 8, though the file has 24");
	const ms = M.layout("Monomachine", "song", items(24));
	check(ms.rows.length === 3 && ms.rows.every(r => r.cells.every(c => c.item)), "MM songs: its 24, 3 x 8, no empty slot drawn");
	const gl = M.layout("Machinedrum", "global", items(8));
	check(gl.cols === 8 && gl.rows.length === 1, "globals: 1 x 8");
	check(M.layout("Machinedrum", "kit", [{ slot: 70, name: "X" }]).rows.some(r => r.cells.some(c => c.item?.name === "X")), "a file with more slots than the machine has: more rows, nothing lost");
	const o = M.layout("Machinedrum", "other", items(3));
	check(o.cols === 0 && o.rows[0].cells.length === 3, "other messages: no slots, a list");
}

/* the counts: what a tab and the footer say */
{
	const list = items(10, s => ({ overwrites: s < 4, plays: s === 1 }));
	const skip = new Set(["kit:0", "kit:9"]);
	const s = M.kindSums("kit", list, skip, true);
	check(s.total === 10 && s.n === 8 && s.over === 3 && s.fresh === 5 && s.plays === 1 && s.out === 2, "a kind: 8 of 10 chosen, 3 overwrite, 5 new, 1 plays, 2 left out");
	const off = M.kindSums("kit", list, skip, false);
	check(off.n === 0 && off.out === 10, "a kind not ticked sends nothing");
	check(M.footLine({ n: 0 }) === "Nothing chosen.", "nothing chosen");
	check(/^3 slots on the machine overwritten, 1 playing now\. .*One Undo puts the kits, patterns and songs back; globals stay\.$/.test(M.footLine({ n: 8, over: 3, plays: 1 })), "overwrites: how many, what plays, what Undo puts back");
	check(/into empty slots/.test(M.footLine({ n: 5, over: 0 })), "into empty slots only");
	check(/Globals change MIDI channels/.test(M.footLine({ n: 1, over: 1, globals: true })), "B-026: globals chosen, the footer says MIDI channels change");
	check(M.OFF.global && M.OFF.other && !M.OFF.kit, "globals and other messages are off unless ticked (B-026)");
}

/* a click and a Shift-click */
{
	const list = items(16).filter(i => i.slot !== 5);
	let skip = M.toggleRange("kit", list, new Set(), 3, 3);
	check(skip.has("kit:3") && skip.size === 1, "a click leaves one out");
	skip = M.toggleRange("kit", list, skip, 3, 3);
	check(skip.size === 0, "a second click takes it again");
	skip = M.toggleRange("kit", list, new Set(), 2, 7);
	check([2, 3, 4, 6, 7].every(s => skip.has("kit:" + s)) && skip.size === 5, "Shift-click: the range out, the slot not in the file not counted");
	skip = M.toggleRange("kit", list, skip, 9, 4);
	check(!skip.has("kit:4") && !skip.has("kit:7") && skip.has("kit:2") && skip.has("kit:3"), "Shift-click backwards on a left-out slot: the range taken again");
}

/* the report: every slot's outcome */
{
	const picked = [{ kind: "kit", slot: 0 }, { kind: "kit", slot: 1 }, { kind: "pattern", slot: 4 }, { kind: "other", slot: 0 }];
	const r = M.outcomes(picked, { taken: 2, items: [{ kind: "kit", slot: 1, outcome: "ignored", text: "kit 2: ignored" }] });
	check(r.get("kit:0").outcome === "taken" && r.get("kit:1").outcome === "ignored" && r.get("kit:1").text === "kit 2: ignored", "listed: its outcome and text; not listed: taken");
	check(r.get("pattern:4").outcome === "taken" && r.get("other:0").outcome === "sent", "other messages: sent");
	const stopped = M.outcomes(picked, { taken: 1, unsent: 1, items: [{ kind: "kit", slot: 1, outcome: "ignored", text: "" }] });
	check(stopped.get("kit:0").outcome === "unclear", "stopped (the counts do not add up): not listed is not known, never claimed taken");
}

/* importing, per kind (syxProgress.kinds) */
{
	check(M.kindLine("send", { done: 12, total: 64 }, true).text === "sent 12 of 64" && M.kindLine("send", { done: 12, total: 64 }, true).pct === 19, "sending: done of total, its bar");
	check(M.kindLine("read", { done: 64, total: 64 }, true).text === "✓ read back 64 of 64", "a kind read back whole: ticked");
	check(M.kindLine("before", undefined, true).text === "waits", "a kind the phase does not reach yet waits");
	check(M.kindLine("send", undefined, false).text === "not sent", "a kind not chosen: not sent");
}

/* VERIFY ONLY (0.6): a report of a check counts "same", and an item it does not list is the same as the file */
{
	const picked = [{ kind: "kit", slot: 0 }, { kind: "kit", slot: 1 }];
	const r = M.outcomes(picked, { check: true, same: 1, items: [{ kind: "kit", slot: 1, outcome: "differs", text: "kit 2: different" }] });
	check(r.get("kit:0").outcome === "same" && r.get("kit:1").outcome === "differs", "verify only: not listed is the same, listed its outcome");
	check(M.OUTCOME.same[1] === "=", "the same as the file: =");
}

/* I-038: Read back and compare: a report of an import that was not read back says "sent", never "taken" */
{
	const picked = [{ kind: "kit", slot: 0 }, { kind: "kit", slot: 1 }, { kind: "other", slot: 0 }];
	const r = M.outcomes(picked, { readBack: false, sent: 2, commands: 1, unsent: 0, items: [{ kind: "kit", slot: 0, outcome: "sent" }, { kind: "kit", slot: 1, outcome: "sent" }] });
	check([...r.values()].every(x => x.outcome === "sent"), "not read back: every item is sent (never taken, never unclear)");
	check(M.OUTCOME.sent[0] === "sent" && ![...r.values()].some(x => x.outcome === "taken"), "not read back: nothing is called taken");
	check(M.outcomes([{ kind: "kit", slot: 0 }], { taken: 1, items: [] }).get("kit:0").outcome === "taken", "read back (the default): unchanged");
	/* per item: what really went */
	const stopped = M.outcomes([{ kind: "kit", slot: 0 }, { kind: "kit", slot: 1 }, { kind: "kit", slot: 2 }, { kind: "pattern", slot: 4 }, { kind: "other", slot: 0 }], { readBack: false, sent: 1, partly: 1, notSent: 1, items: [
		{ kind: "kit", slot: 0, outcome: "sent", text: "" }, { kind: "kit", slot: 1, outcome: "partly sent", text: "K02: only part" }, { kind: "kit", slot: 2, outcome: "not sent", text: "K03: not sent" }] });
	check(stopped.get("kit:0").outcome === "sent" && stopped.get("kit:1").outcome === "partly sent" && stopped.get("kit:2").outcome === "not sent", "stopped, not read back: each item as the report says");
	check(stopped.get("pattern:4").outcome === "unclear" && stopped.get("other:0").outcome === "sent", "an item the report does not name is unclear; a command is sent");
	check(M.OUTCOME["partly sent"] && M.OUTCOME["not sent"], "partly sent and not sent have a mark");
}
/* the tick: on unless the person turned it off; remembered in the page's storage; a blocked storage means on */
{
	const mem = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };
	const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
	const st = mem();
	check(M.readBackLoad(st) === true, "the tick is on by default");
	M.readBackSave(false, st);
	check(M.readBackLoad(st) === false, "turned off: remembered");
	M.readBackSave(true, st);
	check(M.readBackLoad(st) === true, "turned on again: remembered");
	check(M.readBackLoad(blocked) === true && (M.readBackSave(false, blocked), true), "a blocked storage: on, and saving does not throw");
	const on = M.readBackTick(true), off = M.readBackTick(false);
	check(/data-syxrb checked>/.test(on) && !/checked/.test(off), "the tick's markup: checked when on, not when off");
	check(/Read back and compare/.test(on) && (on.match(/<input/g) || []).length === 1, "one tick, labelled Read back and compare");
}

/* SPECIFIC place (0.6): a kind's first slot is the file's first, from where an item came */
check(M.placeFirst([{ slot: 9, from: 3 }, { slot: 10, from: 4 }]) === 3 && M.placeFirst([{ slot: 7 }, { slot: 2 }]) === 2, "place: the first slot is the file's first");

/* the export (0.6): ALL is everything; unticked, each kind with data over its first to last used slot */
{
	const info = { model: "Machinedrum", kinds: { kit: { slots: 64, held: 64, used: 12, first: 0, last: 11 }, pattern: { slots: 128, held: 128, used: 0, first: -1, last: -1 },
		global: { slots: 8, held: 1, used: 1, first: 0, last: 0 } } };
	const d = M.exportDefaults(info);
	check(d.kit.on && d.kit.from === 0 && d.kit.to === 11, "kits with data: ticked, K01 to the last used");
	check(!d.pattern.on && d.pattern.from === 0 && d.pattern.to === 127, "no patterns with data: not ticked, the whole range");
	check(!d.global.on && !d.song, "globals not ticked until chosen; a kind the host does not name is not offered");
	check(JSON.stringify(M.exportRequest(true, d)) === "{}", "ALL: no kinds, everything");
	d.kit.from = 5; d.kit.to = 2; d.global.on = true;
	const q = M.exportRequest(false, d);
	check(q.kinds.join() === "kit,global" && q.ranges.kit.join() === "2,5" && q.ranges.global.join() === "0,0", "a range set backwards goes from low to high");
	check(M.exportLine(false, d, info) === "Kits K03–K06 · Globals G1.", "the export's line: " + M.exportLine(false, d, info));
	check(M.exportLine(false, {}, info) === "Nothing chosen.", "nothing ticked");
	check(M.rangeLabel("wave", 0) === "W01" && M.rangeLabel("wave", 63) === "W64", "waveforms W01..W64");
}

console.log(failures ? `${failures} FAILED` : "all ok");
process.exit(failures ? 1 : 0);
