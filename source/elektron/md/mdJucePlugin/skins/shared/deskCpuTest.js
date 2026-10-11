"use strict";
/* I-018: the CPU meter (deskCpu.js), both editors: what it shows for each state of the plug-in's cpuLoad message
   (a share while the audio runs, the words when it does not, never 0 % then), its level and worst-block mark, the
   details' lines, the meter made once beside the version in the Setup label, and the wiring: both pages load it and
   hand it the message, both contracts declare it, its stylesheet suits an older WebKit.
     node deskCpuTest.js */
const fs = require("fs"), path = require("path");
let failures = 0;
const check = (ok, what) => { console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) failures++; };
const HERE = __dirname;

/* a stand-in DOM: just what the meter touches */
function node(tag) {
	const n = { tag, style: {}, dataset: {}, attrs: {}, children: [], q: {}, listeners: {}, isConnected: true, hidden: false, textContent: "",
		setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; },
		appendChild(c) { this.children.push(c); return c; },
		addEventListener(t, f) { this.listeners[t] = f; },
		getBoundingClientRect: () => ({ left: 900, bottom: 40 }),
		querySelector(sel) { if (sel === ".aboutver") return this.children.find(c => c.className === "aboutver") || null; return this.q[sel] || (this.q[sel] = node(sel)); } };
	return n;
}
const label = node("span");
label.children.push({ className: "aboutver", textContent: "v0.5.1" });
let menuOpened = null;
global.document = {
	querySelector: sel => (sel === ".setgroup .grplabel" ? label : null),
	createElement: tag => node(tag)
};
const realMenu = require("./deskMenu.js").DeskMenu;
global.DeskMenu = { open: (items, x, y, opts) => { menuOpened = { items, x, y, opts }; }, fromEditor: realMenu.fromEditor };
const CpuMeter = require("./deskCpu.js");

const base = { type: "cpuLoad", realtime: 1, sampleRate: 48000, blockSize: 256, plugin: true, speedUps: "on", leversOff: [], exactEssi: false,
	translated: false, arch: "process arm64 on arm64, native" };
const msg = o => Object.assign({}, base, o);

/* what the meter shows */
let v = CpuMeter.view(msg({ state: "running", load: 0.234, worst: 0.41 }));
check(v.text === "23 %" && v.fill === 0.234 && v.worst === 0.41 && v.level === "ok", `running at 23 %, worst 41 %: "23 %", the bar and the mark (${JSON.stringify(v)})`);
check(/23 %/.test(v.title) && /41 %/.test(v.title), "its tooltip says the average and the worst");
v = CpuMeter.view(msg({ state: "running", load: 0.5, worst: 0.8 }));
check(v.level === "high", "a block at 80 %: high");
v = CpuMeter.view(msg({ state: "running", load: 0.6, worst: 1.4 }));
check(v.level === "over" && v.worst === 1 && /late/.test(v.title), "a block at 140 %: over, the mark at the bar's end, the tooltip says it was late");
v = CpuMeter.view(msg({ state: "running", load: 1.3, worst: 1.3 }));
check(v.fill === 1 && v.text === "130 %", "an overload fills the bar and says its share");
for (const [state, word] of [["stopped", "STOPPED"], ["bypassed", "BYPASS"], ["offline", "RENDER"], ["none", "NO AUDIO"]]) {
	v = CpuMeter.view(msg({ state, load: null, worst: null }));
	check(v.text === word && v.fill === 0 && v.level === "idle" && !/%/.test(v.text), `${state}: "${word}", not 0 %`);
}
check(CpuMeter.view(null).text === "NO AUDIO", "no message yet: NO AUDIO");

/* the details */
let d = CpuMeter.details(msg({ state: "running", load: 0.234, worst: 0.41 }));
check(d[0].includes("23 %") && d[1].includes("41 %"), "details: the average and the worst block");
check(d.some(x => x === "Machine speed: 1.00x real time"), "the machine's speed against real time");
check(d.some(x => /^Host: 48000 Hz, 256 samples a block \(5\.3 ms\)$/.test(x)), "the host's rate and block size: " + d.join(" | "));
check(d.some(x => x === "Speed-ups: all on"), "the speed-ups, all on");
check(d.some(x => x === "Runs natively (arm64 on arm64)"), "native");
d = CpuMeter.details(msg({ state: "stopped", load: null, worst: null, plugin: false, speedUps: "some", leversOff: ["L1", "L4_NOP"], exactEssi: true,
	translated: true, arch: "process x86_64 on arm64, translated" }));
check(/^Not measured: the host stopped/.test(d[0]), "stopped: not measured, and why");
check(d.some(x => /^Audio device: 48000 Hz/.test(x)), "the standalone: the audio device");
check(d.some(x => x === "Speed-ups: on, L1, L4_NOP off, L3 exact MD timing on"), "the speed-ups switched off one by one, and L3");
check(d.some(x => /^Rosetta: an Intel build on Apple silicon/.test(x) && /Apple silicon build/.test(x)), "Rosetta, and what to do");
check(CpuMeter.details(msg({ state: "running", load: 0.1, worst: 0.1, speedUps: "off" })).includes("Speed-ups: off (legacy emulation)"), "speed-ups off");
check(CpuMeter.details(msg({ state: "none", load: null, worst: null, realtime: null, sampleRate: 0, blockSize: 0 })).some(x => x === "Machine speed: not known yet"),
	"before the first block: no speed yet");

/* the meter in the page: made once beside the version, drawn from each message */
CpuMeter.update(msg({ state: "running", load: 0.5, worst: 0.9 }));
CpuMeter.update(msg({ state: "running", load: 0.25, worst: 0.3 }));
const meters = label.children.filter(c => c.id === "cpumeter");
check(meters.length === 1 && label.children.indexOf(meters[0]) === 1, "one meter, after the version in the Setup label");
const m = meters[0];
check(m.querySelector(".cpuval").textContent === "25 %" && m.querySelector(".cpufill").style.width === "25.0%"
	&& m.querySelector(".cpuworst").style.left === "30.0%" && m.dataset.level === "ok" && m.dataset.state === "running", "drawn from the last message");
CpuMeter.update(msg({ state: "stopped", load: null, worst: null }));
check(m.querySelector(".cpuval").textContent === "STOPPED" && m.querySelector(".cpuworst").hidden === true && m.dataset.load === "", "stopped: the word, no mark");
m.listeners.click({ stopPropagation() { } });
check(menuOpened && /one core/.test(menuOpened.opts.title) && menuOpened.items.every(i => typeof i.note === "string") && menuOpened.x === 900 && menuOpened.y === 44,
	"a click opens the details under the meter, as notes, titled for one core");
check(menuOpened.items.some(i => /40 % means 40 % of one core's time for this editor's audio, not of the whole computer/.test(i.note) && /does not cause clicks/.test(i.note)),
	"the details say what the share is of: one core's time for this editor's audio");

/* the speed-up entries of the plug-in's menu (an editorMenu message), in the details */
const editorMenu = { type: "editorMenu", menu: 7, title: "Machinedrum Editor 0.5.1", items: [
	{ kind: "action", id: "zoom-in", label: "Zoom", n: 0 },
	{ kind: "submenu", id: "developer", label: "Developer", items: [
		{ kind: "action", id: "perf", label: "Start Performance Capture", n: 1 },
		{ kind: "action", id: "legacy-emulation", label: "Speed-ups off (legacy emulation, slower)", checked: true, n: 2 },
		{ kind: "submenu", id: "speedup-levers", label: "Speed-ups (each)", enabled: false, items: [
			{ kind: "action", id: "speedup-L1", label: "L1", checked: true, enabled: false, n: 3 }] },
		{ kind: "action", id: "exact-essi-timing", label: "Exact MD audio timing", checked: false, enabled: false, n: 4 }] }] };
const picks = [];
const items = CpuMeter.speedItems(editorMenu, n => picks.push(n));
check(items.length === 3 && items[0].label === "Speed-ups" && items[0].checked === false && items[1].label === "Speed-ups (each)…" && items[1].items.length === 1
	&& items[2].id === "exact-essi-timing", "the switch (ticked when the speed-ups are on), Speed-ups (each)… and L3: " + items.map(i => `${i.label}=${i.checked}`).join(", "));
items[0].run();
check(picks.join() === "2", "choosing Speed-ups picks the editor menu's own entry (the same action, the same saved setting)");
check(CpuMeter.speedItems({ items: [] }, () => { }).length === 0, "no Developer entries: none");
const sent = [];
CpuMeter.connect(c => sent.push(c));
menuOpened = null;
CpuMeter.open();
check(sent.length === 1 && sent[0].op === "openMenu" && !menuOpened, "connected, a click asks the plug-in for its menu first");
check(CpuMeter.takeMenu(editorMenu) === true && menuOpened && menuOpened.items.some(i => i.label === "Speed-ups"), "its answer shows the details with the speed-up entries");
check(CpuMeter.takeMenu(editorMenu) === false, "an editor menu nobody asked the meter for is the editor's (a right-click)");
menuOpened.items.find(i => i.label === "Speed-ups").run();
check(sent.some(c => c.op === "menuPick" && c.menu === 7 && c.n === 2), "the pick goes to the plug-in as the editor menu's (menuPick)");
check(CpuMeter.last.state === "stopped", "CpuMeter.last is the last message");

/* the wiring */
const read = p => fs.readFileSync(path.join(HERE, p), "utf8");
for (const page of ["../mdStudio/mdStudio.html", "../mmStudio/mmStudio.html"])
	check(read(page).includes('<script src="deskCpu.js"></script>'), `${path.basename(page)} loads deskCpu.js`);
check(/case "cpuLoad": CpuMeter\.update\(m\)/.test(read("../mdStudio/mdDeskRender.js")), "the Machinedrum page hands it the cpuLoad message");
check(/m\.type === "cpuLoad"\) CpuMeter\.update\(m\)/.test(read("../mmStudio/mmAdapter.js")), "the Monomachine page hands it the cpuLoad message");
for (const css of ["../mdStudio/mdDesk.css", "../mmStudio/mmStudio.css"])
	check(read(css).includes(".grplabel .cpumeter{"), `${path.basename(css)} has the meter's stylesheet`);
const own = read("deskCpu.css");
check(!/color-mix|:has\(/.test(own), "its stylesheet has no color-mix or :has (an older WebKit)");
check(!/--led|--rec|--trig|--lcd|\bred\b|#[0-9a-f]{3,6}\b/i.test(own), "no red or warning colour: only the page's ink and plate");
check(/\.cpuval\{display:none/.test(own) && /:hover \.cpuval/.test(own) && /\.open \.cpuval/.test(own), "the number shows on hover and while the details are open only");
check(!/\?\?=|\|\|=|&&=|\.at\(|#[a-z]\w*\s*[;=(]/.test(read("deskCpu.js")), "its script is ES2020 (no logical assignment, .at(), private fields)");
for (const schema of ["md-data-contract.schema.json", "mm-data-contract.schema.json"]) {
	const s = JSON.parse(fs.readFileSync(path.join(HERE, "../../../../../../doc/modern-ux", schema), "utf8"));
	const found = JSON.stringify(s).includes('"const":"cpuLoad"');
	const text = fs.readFileSync(path.join(HERE, "../../../../../../doc/modern-ux", schema), "utf8");
	const fields = ["state", "load", "worst", "realtime", "sampleRate", "blockSize", "plugin", "speedUps", "leversOff", "exactEssi", "translated", "arch"];
	check(found && fields.every(f => text.includes(`"${f}"`)), `${schema} declares cpuLoad with the fields the meter reads`);
}

console.log(failures ? `deskCpuTest: FAIL (${failures})` : "deskCpuTest: PASS");
process.exit(failures ? 1 : 0);
