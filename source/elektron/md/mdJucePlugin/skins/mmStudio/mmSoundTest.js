"use strict";
/* The Monomachine Editor's Sound page by function (MM-PORT-PLAN e) on the generated page (mmMockup.js): the
   groups table (85-sound-groups.js) puts every knob of every machine's SYNTHESIS page, and of the AMP, FILTER and
   EFFECTS pages, in exactly one group; every name in the table is a knob of its machine; every group's screen is
   an editor the page has (90-sound.js, ED.<name>) with its help; a group's knobs follow the manual's slots; and
   MUTATE's group scope (a group's title) moves those knobs and only those, by the page's rules (VOL TUNE INP stay).
   The layout (titles, screens and boxes level in a row, equal screens, no scroll at 1440 × 900 and 1280 × 760)
   needs a browser: the page measures it (MM-PORT-PLAN.md, phase 3). Then the values as the machine shows them (B-148 to
   B-151): signed BOFS and WOFS, the lists of FM frequencies, chord notes and DigiPRO waves, and the screens that draw them.
     node mmSoundTest.js */
const fs = require("fs"), path = require("path"), vm = require("vm");
let failures = 0;
const check = (ok, what) => { console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) failures++; };

const page = fs.readFileSync(path.join(__dirname, "mmMockup.js"), "utf8");
const HEAD = /\n\/\* ---- (?:\d+-[\w-]+\.js|shared\/[\w-]+\.js) ---- \*\/\n/g;
const part = name => { const a = page.indexOf(`/* ---- ${name} ---- */\n`); if (a < 0) return ""; HEAD.lastIndex = a + 10; const m = HEAD.exec(page); return page.slice(a, m ? m.index : undefined); };
const data = part("40-data.js"), groups = part("85-sound-groups.js"), sound = part("90-sound.js"), genBlock = part("shared/deskGen.js"), mmGen = part("52-gen.js");
check(data && groups && sound && genBlock && mmGen, "the page has 40-data.js, 85-sound-groups.js, 90-sound.js and the generators");

const ctx = vm.createContext({ console });
vm.runInContext(data.replace(/^"use strict";/m, "") + "\n" + groups + "\n" + genBlock + "\n" + mmGen
	+ "\nthis.T = { MACH, FIXED, MM_SYN_TAB, MM_FIXED_TAB, mmSoundGroups, mmGroupCheck, mmMutate, synDefaults: typeof synDefaults === 'function' ? synDefaults : null };", ctx);
const T = ctx.T;
const machines = Object.keys(T.MACH);

/* ---- every knob once ---- */
const errs = machines.flatMap(m => T.mmGroupCheck(m));
check(!errs.length, `every knob of every page in exactly one group, for all ${machines.length} machines` + (errs.length ? ": " + errs.slice(0, 6).join("; ") : ""));
check(machines.every(m => m in T.MM_SYN_TAB) && Object.keys(T.MM_SYN_TAB).every(m => m in T.MACH), "the table has every machine of the page, and no other");
const noTable = machines.filter(m => T.mmSoundGroups(m).SYN.some(g => g.key === "syn"));
check(!noTable.length, "no machine's knob falls to the catch-all group" + (noTable.length ? ": " + noTable.join(" ") : ""));
/* a group is a few knobs (the boxes of one line), in the manual's slot order */
const big = [], order = [];
for (const m of machines) for (const pg of ["SYN", "AMP", "FLT", "EFX"]) for (const g of T.mmSoundGroups(m)[pg]) {
	if (g.idx.length > 4) big.push(`${m} ${pg} ${g.title}`);
	if (g.idx.some((i, k) => k && i < g.idx[k - 1])) order.push(`${m} ${g.title}`);
}
check(!big.length, "no group holds more than four knobs" + (big.length ? ": " + big.join(", ") : ""));
check(!order.length, "a group's knobs follow the page's slots" + (order.length ? ": " + order.join(", ") : ""));
/* the fixed pages: the same groups on every machine */
const fixedOf = m => ["AMP", "FLT", "EFX"].map(pg => T.mmSoundGroups(m)[pg].map(g => g.title + ":" + g.idx.join(",")).join("|")).join("/");
check(machines.every(m => fixedOf(m) === fixedOf(machines[0])), "AMP, FILTER and EFFECTS have the same groups on every machine: " + fixedOf(machines[0]).replace(/:[\d,]+/g, ""));

/* ---- every screen is an editor of the page, with its help ---- */
const eds = new Set([...sound.matchAll(/^ED\.(\w+)=/gm)].map(m => m[1]));
const tips = new Set([...(sound.match(/const SND_TIP=\{[\s\S]*?\};/) || [""])[0].matchAll(/(?:^|[{,\s])(\w+):"/g)].map(m => m[1]));
const used = new Set();
for (const m of machines) for (const pg of ["SYN", "AMP", "FLT", "EFX"]) for (const g of T.mmSoundGroups(m)[pg]) if (g.ed) used.add(g.ed);
const missing = [...used].filter(e => !eds.has(e)), untipped = [...used, "lfo"].filter(e => !tips.has(e));
check(!missing.length, `every group's screen is an editor of the page (${used.size} kinds)` + (missing.length ? ": missing " + missing.join(" ") : ""));
check(!untipped.length, "every screen has its help (SND_TIP)" + (untipped.length ? ": " + untipped.join(" ") : ""));
const plotted = machines.filter(m => T.mmSoundGroups(m).SYN.some(g => g.ed));
check(plotted.length >= machines.length - 2, `the synthesis page draws a picture on ${plotted.length} of ${machines.length} machines (GND-GND and GND-SIN have nothing to draw)`);

/* ---- MUTATE by group: the group's knobs, only those, by the page's rules ---- */
{
	const m = "SWAVE-SAW", g = T.mmSoundGroups(m), uni = g.SYN.find(x => x.key === "unison"), env = g.AMP.find(x => x.key === "envelope");
	const v = { SYN: [10, 20, 30, 0, 40, 50, 60, 64], AMP: [10, 20, 30, 40, 64, 100, 64, 0], FLT: Array(8).fill(30), EFX: Array(8).fill(30), LF1: Array(8).fill(1), LF2: Array(8).fill(1), LF3: Array(8).fill(1) };
	const base = [{ m, v }];
	const info = (t, pg, i) => { const n = pg === "SYN" ? T.MACH[m].p[i] : T.FIXED[pg][i]; return n ? { name: n, max: 127 } : null; };
	const spec = { tracks: [0], pages: [], extra: { 0: [...uni.idx.map(i => ["SYN", i]), ...env.idx.map(i => ["AMP", i]), ["SYN", 7], ["AMP", 5]] }, amount: 80, seed: 99, protect: ["VOL", "TUNE"] };
	const out = T.mmMutate(spec, base, info), keys = out.map(([, pg, i]) => pg + "." + i).sort();
	const want = [...uni.idx.map(i => "SYN." + i), ...env.idx.map(i => "AMP." + i)].sort();
	check(JSON.stringify(keys) === JSON.stringify(want), "a group scope moves its knobs only: " + keys.join(" ") + " (TUNE and VOL stay)");
	const both = T.mmMutate({ ...spec, pages: ["SYN"] }, base, info);
	check(both.length === new Set(both.map(([, pg, i]) => pg + i)).size, "a page and one of its groups in scope: each knob once");
	check(JSON.stringify(T.mmMutate(spec, base, info)) === JSON.stringify(out), "the same seed, the same values");
}

/* ---- the values as the machine shows them (B-148 to B-151): the page's state (50-state.js: meta, fmt) and a screen of
   90-sound.js on its own, with a drawing that only records its lines ---- */
const stateCtx = vm.createContext({ console });
vm.runInContext([data, genBlock, mmGen, part("50-state.js")].join("\n").replace(/^"use strict";/m, "")
	+ "\nthis.P = { S, meta, fmt, maxOf, tabStep, synDefaults };", stateCtx);
const P = stateCtx.P, stepTab = P.tabStep;
/* one screen editor (ED.<name>=... up to the next comment line) with the canvas helpers stubbed: line() records the y furthest from the middle line (mid) of its x */
const screen = (name, mid) => {
	const a = sound.indexOf(`ED.${name}=`), b = sound.indexOf("\n/*", a);
	stateCtx.mid = mid;
	vm.runInContext(`var ED=ED||{},drawn=[],labelled="";var grid=()=>{},railDraw=()=>{},cssv=()=>"#000",inkA=()=>"#000",label=(g,t)=>{labelled=t},
		line=(g,W,f)=>{let far=f(0);for(let x=0;x<W;x++){const y=f(x);if(Math.abs(y-mid)>Math.abs(far-mid))far=y}drawn.push(far)};`
		+ (stateCtx.V ? "" : sound.slice(sound.indexOf("const V=(pg)"), sound.indexOf("function railDraw")).replace(/^const /gm, "var ")
			+ "\n" + sound.split("\n").filter(l => /^(const dpWave=|function wfDP\(|function hashN\()/.test(l)).join("\n").replace(/^const /gm, "var ") + "\n") + sound.slice(a, b) + `;this.E={ED,get drawn(){return drawn},get labelled(){return labelled},reset(){drawn=[];labelled=""}};`, stateCtx);
	return stateCtx.E;
};
/* a canvas context that draws nothing */
const G2D = new Proxy({}, { get: () => () => {}, set: () => true });
const MACH_P = m => T.MACH[m].p;
const box = (m, pg, name, v) => { P.S.sel = 0; P.S.tracks[0].m = m; const i = pg === "SYN" ? T.MACH[m].p.indexOf(name) : T.FIXED[pg].indexOf(name); const mt = P.meta(0, pg, i); return { mt, text: P.fmt(mt, v) }; };
{
	/* B-148: BOFS and WOFS are -64 to +63 (64 no sweep), the envelope drawn up for +, down for - */
	const ends = ["BOFS", "WOFS"].map(n => [0, 64, 127].map(v => box("SWAVE-SAW", "FLT", n, v).text).join(" "));
	check(ends.every(e => e === "-64 0 +63"), "BOFS and WOFS show -64 0 +63 at 0 64 127: " + ends.join(" | "));
	const H = 100, mid = (22 + H - 10) / 2, E = screen("fenv", mid), f = P.S.tracks[0].v.FLT;
	const peak = (bofs, wofs) => { f[4] = 20; f[5] = 60; f[6] = bofs; f[7] = wofs; E.reset(); E.ED.fenv.draw(G2D, 200, H); return E.drawn; };
	const up = peak(127, 64), down = peak(0, 64), flat = peak(64, 64), wd = peak(64, 0);
	check(up.length === 1 && up[0] < mid - 20 && down[0] > mid + 20 && Math.abs(flat[0] - mid) < 1e-9,
		`BOFS +63 sweeps up, -64 down, 0 is flat (peaks ${up[0]?.toFixed(1)} ${down[0]?.toFixed(1)} ${flat[0]?.toFixed(1)}, the middle ${mid})`);
	check(wd.length === 2 && wd[1] > mid + 20 && /dashed = width/.test(E.labelled), "WOFS -64: a dashed width line, downwards");
	peak(64, 64); check(/does nothing/.test(E.labelled), "both at 0 (64): the envelope does nothing");
	const F = screen("flt", 0), fl = n => { E.reset(); F.ED.flt.draw(G2D, 200, H); return F.drawn.length; };
	f[6] = 64; f[7] = 64; const none = fl(); f[6] = 30; const some = fl();
	check(none === 1 && some === 2, `the filter curve's dashed envelope peak only with an offset (BOFS 0: ${none} line, BOFS -34: ${some})`);
	const neutral = vm.runInContext("DEFV.FLT", stateCtx);
	check(neutral[6] === 64 && neutral[7] === 64, "a cleared track's FILTER page holds BOFS and WOFS 64, no sweep (the firmware's machine change writes 64): " + neutral.join(" "));
	const h = E.ED.fenv.handles(200, H)[0]; h.drag(h.x, mid - 20); check(f[6] > 64, "dragging the base handle up gives a positive BOFS (" + f[6] + ")");
}
{
	/* B-149: the FM+ frequencies as the machine's LCD writes them (mmEditorProbeFirmwareTest enums, OS 1.32B) */
	const at = (m, n, vs) => vs.map(v => box(m, "SYN", n, v).text).join(" ");
	const stat = at("FM+STAT", "1FRQ", [0, 5, 6, 43, 48, 59, 80, 86, 102, 127]);
	check(stat === "1/64 1/64 1/32 3/8 5/32 1/2 1 1.25 2 4", "FM+STAT 1FRQ: " + stat);
	check(["FM+STAT.2FRQ", "FM+PAR.1FRQ", "FM+PAR.2FRQ", "FM+PAR.3FRQ"].every(k => at(...k.split("."), [0, 5, 6, 48, 127]) === "1/64 1/64 1/32 5/32 4"), "FM+STAT 2FRQ and FM+PAR 1FRQ 2FRQ 3FRQ: the same 24 entries");
	const d1 = at("FM+DYN", "1FRQ", [0, 1, 10, 11, 21, 40, 41, 92, 127]), d2 = at("FM+DYN", "2FRQ", [0, 8, 11, 40, 44, 102, 127]);
	check(d1 === "0.0 1/64 5/32 1.56 .171 2.0 .203 1.0 1.54", "FM+DYN 1FRQ: " + d1);
	check(d2 === "0.0 1/64 2.44 4.0 1/16 1.33 2.39", "FM+DYN 2FRQ: " + d2);
	const { mt } = box("FM+STAT", "SYN", "1FRQ", 0), tab = mt.tab;
	check(mt.max === 127 && tab.length === 24 && tab[0].lo === 0 && tab.every((e, k) => !k || e.lo > tab[k - 1].lo), "FM+STAT 1FRQ: 24 entries over 0-127, the full value to the machine");
	const steps = []; for (let v = 0, k = 0; k < 30; k++) { steps.push(v); v = stepTab(tab, v, 1); }
	check(new Set(steps).size === 24 && steps[1] === 6 && steps.at(-1) === 123 && stepTab(tab, 6, -1) === 0 && stepTab(tab, 0, -1) === 0, "a step moves one entry (0 6 11 ... 123, and stays at the ends)");
	check(stepTab(tab, 127, 1) === 127 && stepTab(tab, 125, 1) === 125 && stepTab(tab, 3, -1) === 3 && stepTab(tab, 0, -1) === 0, "a step past the first or last entry leaves the value as it is (127 up stays 127, 3 down stays 3)");
	const r1 = box("FM+DYN", "SYN", "1FRQ", 0).mt.tab.map(e => e.r), r2 = box("FM+DYN", "SYN", "2FRQ", 0).mt.tab.map(e => e.r);
	check(r1.length === 128 && r2.length === 128 && [r1, r2].every(r => r.every((x, k) => !k || x >= r[k - 1] - .0021)), "FM+DYN 1FRQ and 2FRQ: 128 texts, the ratios the drawing takes in line (the decimal point the LCD moves on 11-40 put back)");
	check(Math.abs(r1[11] - .156) < 1e-9 && Math.abs(r2[11] - .0244) < 1e-9 && r1[40] === .2 && r2[40] === .04, "the LCD's 1.56 (1FRQ 11) is 0.156, its 4.0 (2FRQ 40) is 0.04");
	const E = screen("fm", 0), c = { dataset: { k: "1FRQ 1FIN 1ENV 1FB" } };
	box("FM+STAT", "SYN", "1FRQ", 0); P.S.tracks[0].v.SYN[0] = 64; E.reset(); E.ED.fm.draw(G2D, 200, 100, c);
	check(E.labelled === "1FRQ 5/8" && E.ED.fm.frq("1FRQ").r === 5 / 8, "the FM screen's label and ratio are the machine's: " + E.labelled);
}
{
	/* B-150: the DigiPRO waves as the machine names them (OS 1.32B: 71 = D36, 127 = D64; 10 = S03, 34 = S09, 102 = S26, 126 = S32) */
	const at = (m, n, vs) => vs.map(v => box(m, "SYN", n, v).text).join(" ");
	const dd = ["DPRO-DDRW.WAV1", "DPRO-DDRW.WAV2", "DPRO-DENS.WAVE"].map(k => at(...k.split("."), [0, 1, 2, 71, 111, 127]));
	check(dd.every(x => x === "D01 D01 D02 D36 D56 D64"), "DPRO-DDRW WAV1 WAV2 and DPRO-DENS WAVE: D01-D64, two values a wave: " + dd[0]);
	const { mt } = box("DPRO-DDRW", "SYN", "WAV1", 0);
	check(mt.max === 127 && mt.tab.length === 64 && stepTab(mt.tab, 70, 1) === 72 && stepTab(mt.tab, 71, -1) === 68, "a step is one wave (two values), the full value to the machine");
	/* DPRO-WAVE WAVE: an enumeration of the catalogue (32 waves); the host turns the machine's value into its index */
	const cat = JSON.parse(fs.readFileSync(path.join(__dirname, "../../../../../../doc/modern-ux/mm-catalogue.json"), "utf8"));
	const wv = box("DPRO-WAVE", "SYN", "WAVE", 0).mt, catWaves = cat.machines.find(m => m.name === "DPRO-WAVE").enums["0"];
	check(wv.en && wv.en.length === 32 && P.maxOf(wv) === 31 && wv.en[0] === "S01" && wv.en[31] === "S32", "DPRO-WAVE WAVE: S01-S32, every one reachable");
	check(JSON.stringify(catWaves) === JSON.stringify(wv.en), "the catalogue names the same 32 waves (mmSynthEnum)");
	const idx = v => Math.min(31, Math.floor(v * 32 / 128)); /* mmConvert.js valueToPage */
	check([10, 34, 102, 126].map(v => P.fmt(wv, idx(v))).join(" ") === "S03 S09 S26 S32", "the machine's 10 34 102 126 are S03 S09 S26 S32 on the page");
	const E = screen("morph", 0), lab = (m, vals) => { box(m, "SYN", MACH_P(m)[0], 0); Object.entries(vals).forEach(([n, v]) => P.S.tracks[0].v.SYN[MACH_P(m).indexOf(n)] = v); E.reset(); E.ED.morph.draw(G2D, 200, 100); return E.labelled; };
	check(lab("DPRO-DDRW", { WAV1: 71, WAV2: 127, MIX: 30 }) === "D36 ↔ D64 · mix 30", "the DDRW screen names its waves as the machine: " + E.labelled);
	check(lab("DPRO-WAVE", { WAVE: 31, WPM: 0 }) === "S32 → S01", "the DPRO-WAVE screen morphs S32 into S01: " + E.labelled);
	const W = screen("enswave", 0); box("DPRO-DENS", "SYN", "WAVE", 0); P.S.tracks[0].v.SYN[3] = 71; W.reset(); W.ED.enswave.draw(G2D, 200, 100);
	check(W.labelled === "wave D36", "the DENS wave screen: " + W.labelled);
}
{
	/* B-151: PCH2-4 of SWAVE-ENS and DPRO-DENS as the machine lists them (OS 1.32B, 33 entries, OFF at 63-65) */
	const at = (m, n, vs) => vs.map(v => box(m, "SYN", n, v).text).join(" ");
	const all = ["SWAVE-ENS", "DPRO-DENS"].flatMap(m => ["PCH2", "PCH3", "PCH4"].map(n => at(m, n, [0, 3, 4, 20, 63, 64, 65, 66, 78, 105, 125, 127])));
	check(all.every(x => x === "-12 -12 -11 2/3 OFF OFF OFF +01 6/5 3/2 +12 +12"), "PCH2-4 on both machines: " + all[0]);
	const { mt } = box("SWAVE-ENS", "SYN", "PCH2", 0), up = [];
	for (let v = 63, k = 0; k < 16; k++) { v = stepTab(mt.tab, v, 1); up.push(P.fmt(mt, v)); }
	check(up.join(" ") === "+01 +02 +03 6/5 5/4 +04 4/3 +05 +06 +07 3/2 +08 +09 +10 +11 +12" && !mt.signed && mt.tab.length === 33, "a step up from OFF: " + up.join(" "));
	const down = []; for (let v = 63, k = 0; k < 16; k++) { v = stepTab(mt.tab, v, -1); down.push(P.fmt(mt, v)); }
	check(down.join(" ") === "-01 -02 -03 5/6 4/5 -04 3/4 -05 -06 -07 2/3 -08 -09 -10 -11 -12", "a step down from OFF: " + down.join(" "));
	const syn = P.synDefaults("SWAVE-ENS");
	check(syn && syn.slice(0, 3).every(v => box("SWAVE-ENS", "SYN", "PCH2", v).text === "OFF"), "a new SWAVE-ENS starts with PCH2-4 OFF, as the machine's own machine change (63)");
	const E = screen("chord", 0); box("SWAVE-ENS", "SYN", "PCH2", 0); Object.assign(P.S.tracks[0].v.SYN, { 0: 63, 1: 101, 2: 82 });
	E.reset(); E.ED.chord.draw(G2D, 200, 100); const n = E.ED.chord.notes();
	check(E.labelled === "C + +07 5/4" && JSON.stringify(n.map(o => [o.k, o.ratio])) === "[[19,false],[16,true]]", "the chord screen: OFF no note, +07 a fifth up, 5/4 on its nearest key (E) marked: " + E.labelled + " " + JSON.stringify(n));
	Object.assign(P.S.tracks[0].v.SYN, { 0: 0, 1: 63, 2: 63 }); check(JSON.stringify(E.ED.chord.notes().map(o => o.k)) === "[0]", "-12 is the octave below, the first key");
}

console.log(failures ? `FAIL (${failures})` : "PASS");
process.exit(failures ? 1 : 0);
