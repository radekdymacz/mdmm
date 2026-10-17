"use strict";
/* The transport beyond PLAY and STOP (deskTransport.js, both editors; wave 2). Pure parts: the ▶ menu's entries for each
   state (what each runs, what is off and why), the nudge's numbers. Then the wiring: both pages load the file and its
   stylesheet, both maps have the same keys for the same things (pause, panic, nudge, play from a row), the ▶ key has its
   ▾ on both pages, and the commands they send are in both contracts.
     node deskTransportTest.js */
const fs = require("fs"), path = require("path");
let failures = 0;
const check = (ok, what) => { console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) failures++; };
const HERE = __dirname, read = f => fs.readFileSync(path.join(HERE, f), "utf8");
const ROOT = path.join(HERE, "..", "..", "..", "..", "..", "..");
const { DeskTransport } = require("./deskTransport.js");

/* the menu: stopped, playing, paused; what each entry runs */
const ran = [];
const host = { play: () => ran.push("play"), stop: () => ran.push("stop"), pauseToggle: () => ran.push("pause"), record: () => ran.push("record"), panic: () => ran.push("panic") };
const entries = st => DeskTransport.menuItems(Object.assign({ can: { transport: true, record: true, panic: true }, reasons: {} }, st), host);
const byId = (list, id) => list.find(x => x && x.id === id);
let m = entries({ playing: false, paused: false });
check(byId(m, "play").label === "Play" && byId(m, "pause").enabled === false, "stopped: Play, and Pause is off");
byId(m, "play").run();
check(ran.pop() === "play", "stopped: the first entry plays");
m = entries({ playing: true, paused: false });
check(byId(m, "play").label === "Stop" && byId(m, "pause").label === "Pause" && byId(m, "pause").enabled, "playing: Stop and Pause");
byId(m, "pause").run();
check(ran.pop() === "pause", "Pause runs the pause");
m = entries({ playing: false, paused: true });
check(byId(m, "play").label === "Stop" && byId(m, "pause").label === "Continue" && byId(m, "pause").enabled, "paused: Stop ends the pause, Continue goes on");
byId(m, "play").run();
check(ran.pop() === "stop", "paused: the first entry stops");
check(byId(m, "pause").key === "⇧Space" && byId(m, "panic").key === "⌘." && byId(m, "record").key === "⌥Space", "each entry says its key");
m = DeskTransport.menuItems({ playing: true, can: { transport: true, record: true, panic: false }, reasons: { panic: "Press STOP twice on the machine." } }, host);
check(byId(m, "panic").enabled === false && m.some(x => x && x.note === "Press STOP twice on the machine."), "panic off: the entry is off and the reason is a line under it");
m = DeskTransport.menuItems({ playing: true, can: { transport: false } }, host);
check(byId(m, "play").enabled === false && byId(m, "pause").enabled === false, "no transport: Play and Pause are off");

/* the nudge's numbers */
check(DeskTransport.nudged(120, 10) === 132 && DeskTransport.nudged(120, -10) === 108, "nudge: 10 % of 120 BPM is 132 and 108");
check(DeskTransport.nudged(125.5, 10) === 138.1, "to a tenth of a BPM");
check(DeskTransport.nudged(290, 10) === 300 && DeskTransport.nudged(31, -10) === 30, "kept to 30-300 BPM");
check(DeskTransport.clampBpm(120.04) === 120 && DeskTransport.NUDGE === 10, "the tempo to a tenth; the nudge 10 %");

/* the wiring: both pages */
const MD = path.join(HERE, "..", "mdStudio"), MM = path.join(HERE, "..", "mmStudio");
const mdHtml = fs.readFileSync(path.join(MD, "mdStudio.html"), "utf8"), mmJs = fs.readFileSync(path.join(MM, "mmMockup.js"), "utf8");
check(/<script src="deskTransport.js"><\/script>/.test(mdHtml) && mdHtml.indexOf("deskTransport.js") < mdHtml.indexOf("mdDeskTransport.js"), "the Machinedrum page loads deskTransport.js before its own transport file");
check(mmJs.includes("const DeskTransport") && mmJs.includes("function pauseToggle"), "the Monomachine page holds deskTransport.js and its own transport file (mmMockup.js)");
const mdCss = fs.readFileSync(path.join(MD, "mdDesk.css"), "utf8"), mmCss = fs.readFileSync(path.join(MM, "mmStudio.css"), "utf8");
check(mdCss.includes(".tempopop{") && mmCss.includes(".tempopop{") && mdCss.includes(".lcdt .lt.paused") && mmCss.includes(".lcdt .lt.paused"), "both stylesheets have the TEMPO pop-up and the paused key");
check(!/playmore/.test(mdHtml) && !fs.readFileSync(path.join(MM, "mmStudio.html"), "utf8").includes("playmore"), "neither page has a ▾ key beside ▶: the transport menu opens by right-click on ▶ (Shift+F10 on the focused key)");
check(/id="play"[^>]*right-click: Pause, Record, Panic/.test(mdHtml) && fs.readFileSync(path.join(MM, "mmStudio.html"), "utf8").includes("right-click: Pause, Record, Panic"), "▶'s tooltip tells where the transport menu is");
/* the keys: the same ids, keys and modifiers on both editors */
const keymap = JSON.parse(fs.readFileSync(path.join(ROOT, "doc", "modern-ux", "keymap.json"), "utf8"));
for (const id of ["pause", "panic", "tempo-nudge", "song-play-from", "transport-menu", "tempo-click", "tempo-delayed", "pause-click"]) {
	const a = keymap.md.find(e => e.id === id), b = keymap.mm.find(e => e.id === id);
	check(a && b && JSON.stringify(a.keys) === JSON.stringify(b.keys) && a.mod === b.mod, `key ${id}: on both editors, the same (${a ? a.keys.join(" ") + " " + a.mod : "none"})`);
}
/* the commands both pages send are in both contracts */
for (const m of ["md", "mm"]) {
	const schema = fs.readFileSync(path.join(ROOT, "doc", "modern-ux", m + "-data-contract.schema.json"), "utf8");
	check(["pause", "resume", "playFrom", "panic", "nudge"].every(op => schema.includes(`"const": "${op}"`)), m + ": pause, resume, playFrom, panic and nudge are commands of the contract");
	check(schema.includes('"panic": {') && schema.includes('"playFrom": {'), m + ": panic and playFrom are capabilities of the contract");
}

console.log(failures ? `deskTransportTest: ${failures} FAILED` : "deskTransportTest: all passed");
process.exit(failures ? 1 : 0);
