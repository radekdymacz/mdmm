"use strict";
/* I-021: the LCD's stereo output meter and volume (deskVolume.js), both editors: the scale (the volume and the levels
   on one axis, -60 dB at the foot, +6 dB at the head), the meter's ballistics per side (instant attack, about 300 ms
   release, the peak held 1.5 s; the clip latched), the volume's drag, wheel and words, the strip made once at the LCD's
   end from the plug-in's outputLevel message (two bars, one volume line), the gestures (drag, wheel, double-click for
   0 dB, a click clears the clip), what they send and the readout while the volume changes, and the wiring: both pages load it and hand it the message, both contracts declare the message and the
   command, its stylesheet suits an older WebKit and has no warning colour.
     node deskVolumeTest.js */
const fs = require("fs"), path = require("path");
let failures = 0;
const check = (ok, what) => { console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) failures++; };
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const HERE = __dirname;

/* a stand-in DOM: just what the strip touches */
function node(tag) {
	const cls = new Set();
	const n = { tag, style: {}, dataset: {}, attrs: {}, children: [], q: {}, listeners: {}, isConnected: true, hidden: false, textContent: "", offsetWidth: 120,
		classList: { add: c => cls.add(c), remove: c => cls.delete(c), toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)), contains: c => cls.has(c) },
		setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; },
		appendChild(c) { this.children.push(c); return c; },
		addEventListener(t, f) { this.listeners[t] = f; },
		setPointerCapture() { },
		getBoundingClientRect: () => ({ left: 700, right: 719, top: 10, bottom: 84, width: 19 }),
		querySelector(sel) { return this.q[sel] || (this.q[sel] = node(sel)); } };
	return n;
}
const lcd = node("div"), body = node("body");
global.document = { querySelector: sel => (sel === ".lcdgroup .lcdpanel" ? lcd : null), createElement: tag => node(tag), body };
global.innerWidth = 1280;
let clock = 1000;
global.performance = { now: () => clock };
const V = require("./deskVolume.js");

/* the scale */
check(V.pos(-60) === 0 && V.pos(null) === 0 && V.pos(-80) === 0 && V.pos(6) === 1 && V.pos(12) === 1, "-60 dB (and off) at the foot, +6 dB at the head");
check(near(V.pos(0), 60 / 66), "0 dB (unity, 0 dBFS) at 91 % of the strip");
check(V.text(0) === "0.0 dB" && V.text(-3.5) === "-3.5 dB" && V.text(6) === "+6.0 dB" && V.text(null) === "off" && V.text(-60) === "off", "the volume as words");

/* the ballistics, each side on its own */
let s = V.ballistics(null, { peakL: 0.5, peakR: 0.25, clip: false }, 0);
check(s.l.level === 0.5 && s.l.hold === 0.5 && s.r.level === 0.25 && s.r.hold === 0.25 && !s.clip, "instant attack: each side's first peak is its level and hold");
s = V.ballistics(s, { peakL: 0, peakR: 0, clip: false }, 300);
check(near(s.l.level, 0.5 * Math.exp(-1), 1e-9) && near(s.r.level, 0.25 * Math.exp(-1), 1e-9) && s.l.hold === 0.5 && s.r.hold === 0.25,
	"silence: each level falls with a 300 ms time constant, the peaks are held");
s = V.ballistics(s, { peakL: 0.1, peakR: 0.4, clip: false }, 1400);
check(s.l.hold === 0.5 && s.r.hold === 0.4, "still held at 1.4 s; a higher peak on the right is its new hold");
s = V.ballistics(s, { peakL: 0.1, peakR: 0.1, clip: false }, 1700);
check(near(s.l.hold, s.l.level) && s.l.hold < 0.5 && s.r.hold === 0.4, "after 1.5 s the left hold drops to its level; the right's is younger");
s = V.ballistics(s, { peakL: 1.2, peakR: 0.3, clip: true }, 1800);
s = V.ballistics(s, { peakL: 0.2, peakR: 0.2, clip: false }, 5000);
check(s.clip === true, "a clip stays marked until cleared");
s = V.ballistics(V.ballistics(null, { peakL: 0.5, peakR: 0.5 }, 0), { peakL: 0, peakR: 0 }, 10000);
check(s.l.level === 0 && s.r.level === 0, "a long silence falls to nothing");

/* the volume's drag and wheel */
check(V.dragDb(0, -10, false) === 5 && V.dragDb(0, -40, false) === 6, "drag up 10 px: +5 dB (2 px a dB), never above +6");
check(V.dragDb(0, 10, true) === -1 && V.dragDb(-3, 2, true) === -3.2, "Shift: five times finer, 0.1 dB steps");
check(V.dragDb(-50, 40, false) === null && V.dragDb(null, -20, false) === -50, "down to the foot is off; up from off starts at -60 dB");
check(V.wheelDb(0, 1) === 1 && V.wheelDb(-3.4, 1) === -3 && V.wheelDb(-3.4, -1) === -4 && V.wheelDb(6, 3) === 6 && V.wheelDb(-59, -2) === null,
	"the wheel: whole dB a step, on whole dB, +6 at most, off at the foot");

/* the strip in the LCD */
const sent = [];
V.connect((c, o) => sent.push({ c, o }));
V.update({ type: "outputLevel", peakL: 0.5, peakR: 0.1, clip: false, gainDb: -6 });
V.update({ type: "outputLevel", peakL: 0.25, peakR: 0.05, clip: false, gainDb: -6 });
const strips = lcd.children.filter(c => c.id === "volf");
check(strips.length === 1 && lcd.children[lcd.children.length - 1] === strips[0] && lcd.classList.contains("hasvol"), "one strip, the LCD's last column (the panel marked hasvol)");
const el = strips[0];
check(el.attrs.role === "slider" && el.attrs["aria-valuenow"] === "-6" && el.attrs["aria-valuetext"] === "-6.0 dB" && el.dataset.gain === "-6", "a slider at the plug-in's volume");
check(el.querySelector(".volcap").style.bottom === (V.pos(-6) * 100).toFixed(1) + "%", "the volume line at -6 dB");
const L = el.querySelector(".volL"), R = el.querySelector(".volR");
check(L.querySelector(".volfill").style.height === (V.pos(20 * Math.log10(0.5)) * 100).toFixed(1) + "%"
	&& R.querySelector(".volfill").style.height === (V.pos(20 * Math.log10(0.1)) * 100).toFixed(1) + "%", "each bar its side's level in dBFS on the same scale");
check(L.querySelector(".volhold").style.bottom === (V.pos(20 * Math.log10(0.5)) * 100).toFixed(1) + "%" && !L.querySelector(".volhold").hidden, "each bar its own peak hold");
check(!el.classList.contains("clip"), "no clip yet");
const tip = body.children.find(c => /voltip/.test(c.className));
check(tip && tip.hidden && /lcdtip/.test(tip.className) && !el.listeners.pointerenter, "the readout is the LCD's tip style, hidden while the volume does not change (not on hover)");

/* the gestures */
const ev = o => Object.assign({ button: 0, pointerId: 1, clientY: 100, shiftKey: false, preventDefault() { }, stopPropagation() { } }, o);
el.listeners.pointerdown(ev({}));
el.listeners.pointermove(ev({ clientY: 90 }));
el.listeners.pointermove(ev({ clientY: 80 }));
el.listeners.pointerup(ev({ clientY: 80 }));
const last = sent[sent.length - 1];
check(last.c.op === "outputGain" && last.c.db === 4 && last.o.key === "outputGain" && V.gain === 4, "drag up 20 px from -6 dB: outputGain 4 dB, keyed (one a frame)");
check(!tip.hidden && tip.textContent === "Volume +4.0 dB" && tip.style.top === "92px", "while it changes: the readout under the LCD: " + tip.textContent);
clock += 100;
V.update({ type: "outputLevel", peakL: 0.1, peakR: 0.1, clip: false, gainDb: -6 });
check(V.gain === 4, "a message older than the move does not pull the line back");
clock += 1000;
V.update({ type: "outputLevel", peakL: 0.1, peakR: 0.1, clip: false, gainDb: 4 });
check(V.gain === 4 && tip.hidden, "the plug-in's volume after the move; the readout gone a moment after the change");
sent.length = 0;
el.listeners.wheel(ev({ deltaY: -60, deltaMode: 0 }));
check(sent.length === 0, "60 px of scroll: not yet a step");
el.listeners.wheel(ev({ deltaY: -60, deltaMode: 0 }));
check(sent.length === 1 && sent[0].c.db === 5, "120 px up (a notch and a bit): +1 dB, to 5 dB");
el.listeners.wheel(ev({ deltaY: -300, deltaMode: 0 }));
check(sent[sent.length - 1].c.db === 6, "more: +6 dB at most");
check(V.last && V.last.gainDb === 4, "DeskVolume.last: the plug-in's last message");
el.listeners.dblclick(ev({}));
check(sent[sent.length - 1].c.db === 0 && V.gain === 0, "a double-click: 0 dB");
el.listeners.pointerdown(ev({}));
el.listeners.pointermove(ev({ clientY: 300 }));
el.listeners.pointerup(ev({}));
check(sent[sent.length - 1].c.db === -60 && V.gain === null && el.classList.contains("off") && el.attrs["aria-valuetext"] === "off", "dragged to the foot: off (sent as -60 dB)");
clock += 1000;
V.update({ type: "outputLevel", peakL: 1.4, peakR: 0.7, clip: true, gainDb: 0 });
check(el.classList.contains("clip") && el.dataset.clip === "1", "a clip: the top mark filled");
el.listeners.pointerdown(ev({}));
el.listeners.pointerup(ev({}));
check(!el.classList.contains("clip") && V.state.clip === false, "a click (no drag) clears it");
let moved = sent.length;
el.listeners.pointerdown(ev({}));
el.listeners.pointermove(ev({ clientY: 101 }));
el.listeners.pointerup(ev({}));
check(sent.length === moved, "a 1 px wobble is a click, not a change");

/* the wiring */
const read = p => fs.readFileSync(path.join(HERE, p), "utf8");
for (const page of ["../mdStudio/mdStudio.html", "../mmStudio/mmStudio.html"])
	check(read(page).includes('<script src="deskVolume.js"></script>'), `${path.basename(page)} loads deskVolume.js`);
check(/case "outputLevel": DeskVolume\.update\(m\)/.test(read("../mdStudio/mdDeskRender.js")) && /DeskVolume\.connect\(/.test(read("../mdStudio/mdDeskLive.js")),
	"the Machinedrum page hands it the outputLevel message and its way to the plug-in");
check(/m\.type === "outputLevel"\) DeskVolume\.update\(m\)/.test(read("../mmStudio/mmAdapter.js")) && /DeskVolume\.connect\(/.test(read("../mmStudio/mmAdapter.js")),
	"the Monomachine page too");
for (const css of ["../mdStudio/mdDesk.css", "../mmStudio/mmStudio.css"])
	check(read(css).includes(".lcdpanel .volf{"), `${path.basename(css)} has the strip's stylesheet`);
const own = read("deskVolume.css");
check(!/color-mix|:has\(/.test(own), "its stylesheet has no color-mix or :has (an older WebKit)");
check(!/--led|--rec|--trig|--print|\bred\b|#[0-9a-f]{3,6}\b/i.test(own), "only the LCD's ink (and its ground under the cap): no warning colour");
check(/hasvol\{grid-template-columns:repeat\(6,auto\) auto!important\}/.test(own) && /hasvol>\.row2\{grid-column:2\/-2!important\}/.test(own) && /grid-row:1\/-1/.test(own),
	"a seventh LCD column, both rows tall; the second row ends before it");
check(!/\?\?=|\|\|=|&&=|\.at\(|#[a-z]\w*\s*[;=(]/.test(read("deskVolume.js")), "its script is ES2020 (no logical assignment, .at(), private fields)");
for (const schema of ["md-data-contract.schema.json", "mm-data-contract.schema.json"]) {
	const text = fs.readFileSync(path.join(HERE, "../../../../../../doc/modern-ux", schema), "utf8"), s = JSON.stringify(JSON.parse(text));
	check(s.includes('"const":"outputLevel"') && s.includes('"const":"outputGain"') && ["clip", "gainDb", "db"].every(f => text.includes(`"${f}"`)),
		`${schema} declares outputLevel and outputGain`);
	check(["peakL", "peakR"].every(f => text.includes(`"${f}"`)), `${schema}: the left and right peaks`);
}

console.log(failures ? `deskVolumeTest: FAIL (${failures})` : "deskVolumeTest: PASS");
process.exit(failures ? 1 : 0);
