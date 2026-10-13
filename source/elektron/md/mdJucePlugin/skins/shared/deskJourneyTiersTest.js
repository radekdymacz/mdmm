"use strict";
/* The journeys' tiers (deskJourney.js TIERS, doc/release/DEV-CYCLE.md): every name in the table is a journey of one of
   the editors (a renamed journey cannot fall back to "page" unnoticed), and a selector's "~tiers" picks by them, before
   its "@k/n" shard.
     node deskJourneyTiersTest.js */
const fs = require("fs"), path = require("path"), vm = require("vm");
let failures = 0;
const check = (ok, what) => { console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) failures++; };
const ctx = { location: { search: "" }, performance, setTimeout, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "deskJourney.js"), "utf8") + "\n;this.Journey = Journey;", ctx);
const J = ctx.Journey;

/* the journeys' names, as the files write them (a shared factory's as `${prefix}-<name>`) */
const names = new Set();
for (const f of ["../mdStudio/mdDeskJourneys.js", "../mmStudio/mmJourneys.js", "deskJourney.js"]) {
	const t = fs.readFileSync(path.join(__dirname, f), "utf8");
	for (const m of t.matchAll(/name: *[`"](?:md-|mm-|\$\{prefix\}-)([\w-]+)[`"]/g)) names.add(m[1]);
	for (const m of t.matchAll(/(?:editorMenuJourney|viewJourneys)\("(?:md|mm)-?([\w-]*)"/g)) if (m[1]) names.add(m[1]);
	for (const m of t.matchAll(/tapWith\("(?:md|mm)-([\w-]+)"/g)) names.add(m[1]);	/* tapWith(name, key): the tap tempo journeys */
}
names.add("old-webkit"); names.add("shots-views");	/* viewJourneys(prefix): <prefix>-old-webkit, <prefix>-shots-views */
const listed = [...J.TIERS.host, ...J.TIERS.machine];
const unknown = listed.filter(n => !names.has(n));
check(!unknown.length, `every name in TIERS is a journey (${listed.length} listed)${unknown.length ? ": not found " + unknown.join(", ") : ""}`);
check(new Set(listed).size === listed.length, "no name in two tiers");
check(J.tierOf({ name: "md-seq-paint-undo" }) === "page" && J.tierOf({ name: "mm-boot-card" }) === "host" && J.tierOf({ name: "md-drop-syx" }) === "machine"
	&& J.tierOf({ name: "md-x", tier: "machine" }) === "machine", "a journey's tier: its own tier, the table's, else page");

/* the selector: Journey.run logs what it picked */
const all = ["md-boot-card", "md-seq-paint-undo", "md-seq-rotate", "md-drop-syx", "md-dev-speedups", "md-mix-ms-off"].map(name => ({ name, steps: [] }));
const picked = async sel => { ctx.location.search = "?selftest=" + encodeURIComponent(sel); let line = "";
	await J.run(all, { log: t => { if (/^JOURNEYS start/.test(t)) line = t; }, ready: async () => false });
	return line.replace(/^JOURNEYS start: \d+ of \d+: ?/, ""); };
(async () => {
	check(await picked("journey~page") === "md-seq-paint-undo md-seq-rotate md-mix-ms-off", "~page: the page journeys");
	check(await picked("journey~host") === "md-boot-card md-dev-speedups", "~host: the host journeys only");
	check(await picked("journey~machine") === "md-boot-card md-drop-syx md-dev-speedups", "~machine: machine and host");
	check(await picked("journey-seq-*~page") === "md-seq-paint-undo md-seq-rotate", "names, then the tier");
	check(await picked("journey~page@2/2") === "md-seq-rotate", "the shard after the tier: every 2nd page journey from the 2nd");
	check(await picked("journey") === all.map(j => j.name).join(" "), "no tier: all");
	/* ":shuffle-<seed>": a permutation, the same for the same seed, another for another, before the shard; ":list": names, nothing run */
	const a = (await picked("journey:shuffle-7")).split(" "), b = (await picked("journey:shuffle-7")).split(" "), c = (await picked("journey:shuffle-8")).split(" ");
	check(a.join() === b.join() && [...a].sort().join() === all.map(j => j.name).sort().join(), ":shuffle-7: all of them, the same order each time");
	check(a.join() !== all.map(j => j.name).join() || c.join() !== all.map(j => j.name).join(), "a shuffle changes the order (for some seed)");
	check([...(await picked("journey~page@1/2:shuffle-7")).split(" "), ...(await picked("journey~page@2/2:shuffle-7")).split(" ")].sort().join(" ") === "md-mix-ms-off md-seq-paint-undo md-seq-rotate", "the shuffled shards together are the page journeys");
	let lines = []; ctx.location.search = "?selftest=" + encodeURIComponent("journey-seq-*:list"); await J.run(all, { log: t => lines.push(t), ready: async () => { lines.push("READY"); return false; } });
	check(lines.some(l => l === "JOURNEYS list: md-seq-paint-undo md-seq-rotate") && !lines.includes("READY"), ":list names the journeys and runs nothing");
	console.log(failures ? `deskJourneyTiersTest: ${failures} FAILED` : "deskJourneyTiersTest: PASS");
	process.exit(failures ? 1 : 0);
})();
