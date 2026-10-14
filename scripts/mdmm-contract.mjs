// The data contract as a checker (doc/modern-ux/<md|mm>-data-contract.schema.json): a small JSON Schema walker, no npm
// package. contract("md"|"mm") gives
//   command(c)   the problem with a command the page sends ($defs/command, closed), or null
//   message(m)   the problem with a message the plug-in sends the page ($defs/message), or null
//   partial(on)  the same for the members a trigger names (required ones may be missing)
//   ops          the command names
// Used by the page tier and the preview (scripts/mdmm-page.mjs) and the scenario check (scripts/mdmm-scenario.mjs).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function validator(schemaFile) {
	const schema = JSON.parse(fs.readFileSync(schemaFile, "utf8"));
	const resolve = s => { while (s && s.$ref) { if (!s.$ref.startsWith("#/")) return null; s = s.$ref.replace(/^#\//, "").split("/").reduce((o, k) => o[k], schema); } return s; };
	const typeOk = (t, v) => t === "integer" ? Number.isInteger(v) : t === "number" ? typeof v === "number" : t === "array" ? Array.isArray(v)
		: t === "object" ? v !== null && typeof v === "object" && !Array.isArray(v) : t === "null" ? v === null : typeof v === t;
	function check(s, v, at) {
		s = resolve(s); if (!s || s === true) return null;
		if (s.oneOf || s.anyOf) { const list = s.oneOf || s.anyOf; for (const x of list) if (!check(x, v, at)) return null; return `${at}: matches none of ${list.length}`; }
		if (s.allOf) for (const x of s.allOf) {
			if (x.if) { if (!check(x.if, v, at) && x.then) { const e = check(x.then, v, at); if (e) return e; } continue; }
			const e = check(x, v, at); if (e) return e;
		}
		if (s.type && ![].concat(s.type).some(t => typeOk(t, v))) return `${at}: not ${[].concat(s.type).join("|")} (${JSON.stringify(v)})`;
		if ("const" in s && v !== s.const) return `${at}: not ${JSON.stringify(s.const)}`;
		if (s.enum && !s.enum.includes(v)) return `${at}: ${JSON.stringify(v)} not one of ${s.enum.join(", ")}`;
		if (typeof v === "number") { if (s.minimum != null && v < s.minimum) return `${at}: ${v} < ${s.minimum}`; if (s.maximum != null && v > s.maximum) return `${at}: ${v} > ${s.maximum}`; }
		if (typeof v === "string" && s.minLength != null && v.length < s.minLength) return `${at}: shorter than ${s.minLength}`;
		if (Array.isArray(v)) { if (s.minItems != null && v.length < s.minItems) return `${at}: fewer than ${s.minItems}`; if (s.maxItems != null && v.length > s.maxItems) return `${at}: more than ${s.maxItems}`;
			if (s.items) for (let i = 0; i < v.length; i++) { const e = check(s.items, v[i], `${at}[${i}]`); if (e) return e; } }
		if (v && typeof v === "object" && !Array.isArray(v)) {
			for (const r of s.required || []) if (!(r in v)) return `${at}: no ${r}`;
			for (const [k, x] of Object.entries(v)) {
				if (s.properties && k in s.properties) { const e = check(s.properties[k], x, `${at}.${k}`); if (e) return e; }
				else if (s.additionalProperties === false) return `${at}: ${k} is not in the contract`;
			}
		}
		return null;
	}
	const commands = resolve(schema.$defs.command).oneOf.map(resolve);
	const ops = commands.map(c => c.properties?.op?.const);
	return {
		ops,
		command: cmd => {
			const c = commands.find(s => s.properties?.op?.const === cmd.op);
			if (!c) return `unknown command ${cmd.op}`;
			return check(c, cmd, cmd.op);
		},
		/* a command trigger (a scenario's "on"): the members it names are the command's and hold what the schema allows; required members may be missing */
		partial: on => {
			const c = commands.find(s => s.properties?.op?.const === on.op);
			if (!c) return `unknown command ${on.op}`;
			for (const [k, v] of Object.entries(on)) {
				if (k === "op") continue;
				if (c.properties && k in c.properties) { const e = check(c.properties[k], v, `${on.op}.${k}`); if (e) return e; }
				else return `${on.op}: ${k} is not in the contract`;
			}
			return null;
		},
		message: m => {
			if (!m || typeof m !== "object" || typeof m.type !== "string") return "not a message: no type";
			const branch = schema.$defs.message.oneOf.find(b => b.properties?.type?.const === m.type);
			if (!branch) return `unknown message type ${m.type}`;
			return check(branch, m, m.type);
		},
	};
}

export const contract = ed => validator(path.join(ROOT, `doc/modern-ux/${ed}-data-contract.schema.json`));
