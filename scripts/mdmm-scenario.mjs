#!/usr/bin/env node
// Preview scenarios (doc/modern-ux/scenarios/README.md): a scenario is a JSON file of contract messages, what the host would
// publish to the page, with timed steps and reactions to commands. Everything it sends is checked against the contract
// ($defs/message of doc/modern-ux/<md|mm>-data-contract.schema.json); a state the contract cannot say cannot be a scenario.
//
//   node scripts/mdmm-scenario.mjs --check [md|mm]   validate every scenario (no ROM, no browser, no stub); exit 1 on a problem
//   node scripts/mdmm-scenario.mjs --list  [md|mm]   name and what each shows
//
// The preview (scripts/mdmm-page.mjs --serve) uses Player: it applies the scenario's machine overlay and fires the steps.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { contract } from "./mdmm-contract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const dirOf = ed => path.join(ROOT, "doc/modern-ux/scenarios", ed);
const TOP = ["title", "about", "boot", "pace", "machine", "steps"], STEP = ["at", "on", "delay", "swallow", "send", "machine", "note"];
const isObj = v => v !== null && typeof v === "object" && !Array.isArray(v);

/* deep merge for a machine patch: objects merge, everything else (arrays too) is replaced */
export function merge(base, patch) {
	if (!isObj(base) || !isObj(patch)) return structuredClone(patch);
	const out = structuredClone(base);
	for (const [k, v] of Object.entries(patch)) out[k] = isObj(v) && isObj(out[k]) ? merge(out[k], v) : structuredClone(v);
	return out;
}

/* the scenario files of one editor: [{name, file, text}] (files starting with _ are fixtures, not scenarios) */
export function files(ed) {
	let names = [];
	try { names = fs.readdirSync(dirOf(ed)).filter(n => n.endsWith(".json") && !n.startsWith("_")).sort(); } catch { }
	return names.map(n => ({ name: n.replace(/\.json$/, ""), file: path.join(dirOf(ed), n) }));
}
export const fixture = ed => JSON.parse(fs.readFileSync(path.join(dirOf(ed), "_machine.json"), "utf8"));

/* a command trigger: every member it names equals the command's; a member set to null must be absent from the command */
export const present = on => Object.fromEntries(Object.entries(on).filter(([, v]) => v !== null));
export const matches = (on, cmd) => Object.entries(on).every(([k, v]) => v === null ? cmd[k] === undefined : JSON.stringify(cmd[k]) === JSON.stringify(v));

/* the shape of a scenario file: a list of problems (empty: fine) */
export function shape(sc, ed) {
	const bad = [], c = contract(ed);
	if (!isObj(sc)) return ["not an object"];
	for (const k of Object.keys(sc)) if (!TOP.includes(k)) bad.push(`unknown member ${k}`);
	if (typeof sc.title !== "string" || !sc.title) bad.push("title: a short name for the list");
	if (typeof sc.about !== "string" || !sc.about) bad.push("about: what the page shows");
	if (sc.boot !== undefined && !["stub", "none"].includes(sc.boot)) bad.push(`boot: stub or none, not ${JSON.stringify(sc.boot)}`);
	if (sc.pace !== undefined && !(isObj(sc.pace) && Object.keys(sc.pace).join() === "everyMs" && sc.pace.everyMs >= 1)) bad.push("pace: {\"everyMs\": n}");
	if (sc.pace && sc.boot === "none") bad.push("pace needs boot stub (it slows the stub's messages)");
	if (sc.machine !== undefined && !isObj(sc.machine)) bad.push("machine: an object (the patch in force from the start)");
	if (!Array.isArray(sc.steps) || !sc.steps.length) return [...bad, "steps: a list of at least one step"];
	sc.steps.forEach((s, i) => {
		const at = `steps[${i}]`;
		if (!isObj(s)) return bad.push(`${at}: not an object`);
		for (const k of Object.keys(s)) if (!STEP.includes(k)) bad.push(`${at}: unknown member ${k}`);
		if ((s.at === undefined) === (s.on === undefined)) bad.push(`${at}: exactly one of at (ms after the start) and on (a command)`);
		if (s.at !== undefined && !(s.at >= 0)) bad.push(`${at}.at: milliseconds, 0 or more`);
		if (s.delay !== undefined && (s.on === undefined || !(s.delay >= 0))) bad.push(`${at}.delay: milliseconds, with on`);
		if (s.swallow !== undefined && (s.on === undefined || typeof s.swallow !== "boolean")) bad.push(`${at}.swallow: true or false, with on`);
		if (s.on !== undefined) {
			if (!isObj(s.on) || !c.ops.includes(s.on.op)) bad.push(`${at}.on: a command of the contract (op ${JSON.stringify(s.on?.op)})`);
			else { const e = c.partial(present(s.on)); if (e) bad.push(`${at}.on: ${e}`); }
		}
		if (s.send !== undefined && !Array.isArray(s.send)) bad.push(`${at}.send: a list of messages`);
		if (s.machine !== undefined && s.machine !== null && !isObj(s.machine)) bad.push(`${at}.machine: an object (patch) or null (end the patch)`);
		if (s.send === undefined && s.machine === undefined) bad.push(`${at}: nothing to send (send, machine)`);
		if (s.note !== undefined && typeof s.note !== "string") bad.push(`${at}.note: text`);
	});
	return bad;
}

/* The scenario at run time. overlay: the machine patch in force; every machine message the host sends (the stub's too) is
   passed through it, so a state holds while the stub goes on publishing. base: the machine message to patch when the stub
   has sent none (boot none: the fixture). */
export class Player {
	constructor(sc, ed, base) { this.sc = sc; this.ed = ed; this.overlay = structuredClone(sc.machine || {}); this.base = base; this.last = null; }
	/* a message from the stub, through the overlay */
	pass(m) {
		if (m.type !== "machine") return m;
		this.last = m;
		return Object.keys(this.overlay).length ? { ...m, doc: merge(m.doc, this.overlay) } : m;
	}
	/* a step's messages; a result with no id answers command cmd */
	fire(step, cmd) {
		const out = [];
		if (step.machine === null) this.overlay = {};
		else if (step.machine) this.overlay = merge(this.overlay, step.machine);
		for (const m of step.send || []) {
			const x = structuredClone(m);
			if (x.type === "result" && x.id === undefined && cmd && cmd.id !== undefined) x.id = cmd.id;
			out.push(x);
		}
		if (step.machine !== undefined) {
			const b = this.last || this.base;
			out.push({ ...b, doc: merge(b.doc, this.overlay) });
		}
		return out;
	}
}

/* every message every step would send, validated; boot stub scenarios are validated over the fixture too */
export function problems(name, ed, text) {
	let sc;
	try { sc = JSON.parse(text); } catch (e) { return [`not JSON: ${e.message}`]; }
	const bad = shape(sc, ed);
	if (bad.length) return bad;
	const c = contract(ed), player = new Player(sc, ed, fixture(ed)), out = [];
	{ const e = c.message({ ...player.base, doc: merge(player.base.doc, player.overlay) }); if (e) out.push(`machine (from the start): ${e}`); }
	sc.steps.forEach((s, i) => player.fire(s, { id: 1 }).forEach((m, j) => { const e = c.message(m); if (e) out.push(`steps[${i}] message ${j}: ${e}`); }));
	return out;
}

/* the check must see what it is for: each of these is wrong in one way and must be refused (a self-test of the check) */
function selfTest(say) {
	const ok = { title: "t", about: "a", boot: "stub", steps: [{ at: 0, send: [{ type: "error", message: "x" }] }] };
	const cases = [
		["a message type outside the contract", { ...ok, steps: [{ at: 0, send: [{ type: "bogus" }] }] }],
		["a message missing a member", { ...ok, steps: [{ at: 0, send: [{ type: "error" }] }] }],
		["a machine patch the schema refuses", { ...ok, steps: [{ at: 0, machine: { lifecycle: "asleep" } }] }],
		["a trigger that is no command", { ...ok, steps: [{ on: { op: "bogus" }, send: [{ type: "error", message: "x" }] }] }],
		["a trigger member outside the command", { ...ok, steps: [{ on: { op: "play", bogus: 1 }, send: [{ type: "error", message: "x" }] }] }],
		["a step with both at and on", { ...ok, steps: [{ at: 0, on: { op: "play" }, send: [{ type: "error", message: "x" }] }] }],
		["a step that sends nothing", { ...ok, steps: [{ at: 0 }] }],
		["an unknown member", { ...ok, color: "red" }],
		["pace without the stub", { ...ok, boot: "none", pace: { everyMs: 5 } }],
	];
	let bad = 0;
	if (problems("ok", "md", JSON.stringify(ok)).length) { say("FAIL self-test: a good scenario is refused: " + problems("ok", "md", JSON.stringify(ok))[0]); bad++; }
	for (const [what, sc] of cases) for (const ed of ["md", "mm"]) if (!problems("x", ed, JSON.stringify(sc)).length) { say(`FAIL self-test (${ed}): ${what} is accepted`); bad++; }
	return bad;
}

export function checkAll(eds = ["md", "mm"], say = console.log) {
	let n = 0, failed = selfTest(say);
	for (const ed of eds) {
		const base = contract(ed).message(fixture(ed));
		if (base) { say(`FAIL ${ed}/_machine.json: ${base}`); failed++; }
		for (const f of files(ed)) {
			n++;
			const bad = problems(f.name, ed, fs.readFileSync(f.file, "utf8"));
			for (const b of bad) say(`FAIL ${ed}/${f.name}: ${b}`);
			if (bad.length) failed++;
		}
	}
	say(`scenarios: ${n} checked, ` + (failed ? `${failed} FAILED` : "PASS"));
	return failed ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const args = process.argv.slice(2), eds = args.find(a => a === "md" || a === "mm") ? [args.find(a => a === "md" || a === "mm")] : ["md", "mm"];
	if (args.includes("--check")) process.exit(checkAll(eds));
	if (args.includes("--list")) {
		for (const ed of eds) for (const f of files(ed)) { let t = {}; try { t = JSON.parse(fs.readFileSync(f.file, "utf8")); } catch { } console.log(`${ed}  ${f.name.padEnd(24)} ${t.about || ""}`); }
		process.exit(0);
	}
	console.error("usage: node scripts/mdmm-scenario.mjs --check|--list [md|mm]"); process.exit(2);
}
