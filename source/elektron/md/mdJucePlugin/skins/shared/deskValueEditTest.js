"use strict";
/* I-022: typing a parameter value (deskValueEdit.js), both editors: what a typed text becomes (the box's own text in any
   case, the nearest number, a name from a list, another spelling the editor gives), what is refused and why (past the
   ends, a text the box never shows, with the range or the names), the field (opened with the shown value, Enter sets
   once and only on a change, Esc and a click elsewhere leave it, a refusal keeps it open, the box keeps the focus, a box
   drawn again is found again), the gesture (⌘-click, no other modifier), and the wiring: both pages load it and its
   stylesheet, open it on ⌘-click and on Enter, double-click is still the default.
     node deskValueEditTest.js */
const fs = require("fs"), path = require("path");
let failures = 0;
const check = (ok, what) => { console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) failures++; };
const HERE = __dirname, SKINS = path.join(HERE, "..");

/* a stand-in DOM: what the field touches */
function node(tag) {
	const cls = new Set(), n = { tag, style: {}, attrs: {}, listeners: {}, isConnected: true, value: "", title: "", focused: 0, selected: 0,
		classList: { add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c) },
		setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; },
		addEventListener(t, f) { this.listeners[t] = f; },
		getBoundingClientRect: () => ({ left: 100, top: 50, width: 40, height: 30 }),
		focus() { this.focused++; }, select() { this.selected++; },
		remove() { this.isConnected = false; body.kids = body.kids.filter(k => k !== this); if (this.listeners.blur) this.listeners.blur(); } };
	return n;
}
const body = { kids: [], appendChild(c) { this.kids.push(c); return c; } };
global.document = { createElement: tag => node(tag), body };
global.Modifiers = { cmd: e => !!e.metaKey };
const { ValueEdit } = require("./deskValueEdit.js");
const P = (t, lo, hi, shown) => ValueEdit.parse(t, lo, hi, shown);

/* ---- what a typed text becomes ---- */
const plain = v => String(v), signed = v => (v - 64 > 0 ? "+" : "") + (v - 64);
check(P("100", 0, 127, plain).v === 100 && P(" 7 ", 0, 127, plain).v === 7, "a number on a 0-127 box: that value (spaces aside)");
check(P("12.4", 0, 127, plain).v === 12 && P("12,6", 0, 127, plain).v === 13, "a fraction: the nearest (a comma is a decimal point too)");
check(/Out of range: 0 to 127/.test(P("128", 0, 127, plain).error) && /Out of range/.test(P("-1", 0, 127, plain).error), "past either end: refused, with the range");
check(/type a number from 0 to 127/.test(P("abc", 0, 127, plain).error), "a word on a number box: refused, with the range");
check(P("", 0, 127, plain).empty && P("   ", 0, 127, plain).empty, "nothing typed: empty (the field closes, nothing set)");
check(P("+10", 0, 127, signed).v === 74 && P("10", 0, 127, signed).v === 74 && P("-64", 0, 127, signed).v === 0 && P("0", 0, 127, signed).v === 64,
	"a signed box (PAN, EQG): what it shows, -64 to +63, with or without the +");
check(/Out of range: -64 to \+63/.test(P("64", 0, 127, signed).error), "a signed box: 64 is past its end, said in its own numbers");
const depth = v => String(v);
check(P("100", 0, 100, depth).v === 100 && /Out of range: 0 to 100/.test(P("101", 0, 100, depth).error), "a box with another range (DEPTH 0-100)");
/* a list: machine names, a scale, OFF and numbers */
const MACH = ["GND-EMPTY", "TRX-BD", "TRX-SD", "EFM-CY", "ROM-01"], mach = v => MACH[v];
check(P("trx-sd", 0, 4, mach).v === 2 && P("ROM-01", 0, 4, mach).v === 4, "a list: a name as the box writes it, any case");
const e = P("kick", 0, 4, mach).error;
check(/type one of GND-EMPTY, TRX-BD, TRX-SD, EFM-CY, ROM-01/.test(e), "a name not in the list: refused, with the names: " + e);
const long = v => "M" + v;
check(/type one of M0, M1, M2, M3, …, M40/.test(P("x", 0, 40, long).error), "a long list: the first names and the last");
const off = v => v === 0 ? "OFF" : String(v);
check(P("off", 0, 16, off).v === 0 && P("5", 0, 16, off).v === 5 && /Out of range: 1 to 16/.test(P("17", 0, 16, off).error), "OFF and numbers: the word or a number");
/* units and non-linear values: the nearest of what is shown */
const ms = v => [0, 5, 12, 40, 100, 250][v] + " ms";
check(P("40 ms", 0, 5, ms).v === 3 && P("38", 0, 5, ms).v === 3 && P("200", 0, 5, ms).v === 5 && P("1", 0, 5, ms).v === 0, "units: typed with or without, the nearest shown value");
check(/Out of range: 0 ms to 250 ms/.test(P("300", 0, 5, ms).error), "units: the range in the box's words");
/* another spelling (the Monomachine's PAN: L12 / C / R5, and -12 / 0 / 5) */
const pan = v => [v === 64 ? "C" : (v < 64 ? "L" : "R") + Math.abs(v - 64), String(v - 64)];
check(P("L12", 0, 127, pan).v === 52 && P("c", 0, 127, pan).v === 64 && P("-12", 0, 127, pan).v === 52 && P("r63", 0, 127, pan).v === 127, "PAN: L12, C, R63, or the signed number");
const note = v => ["C-4", "C#4", "D-4"][v];
check(P("c#4", 0, 2, note).v === 1 && /type one of C-4, C#4, D-4/.test(P("4", 0, 2, note).error), "note names: as written; a bare number is not a note");

/* ---- the field ---- */
const box = node("div"); box.attrs["aria-label"] = "FLTF";
let stored = 40, sets = [], said = [];
const host = { range: () => [0, 127], shown: (el, v) => String(v), get: () => stored, set: (el, v) => { sets.push(v); stored = v; }, find: () => box, say: t => said.push(t) };
const key = (k) => { const ev = { key: k, stopPropagation() { this.stopped = true; }, preventDefault() { } }; field().listeners.keydown(ev); return ev; };
const field = () => body.kids[0];
check(ValueEdit.open(box, host) && field() && field().value === "40" && field().focused && field().selected && ValueEdit.editing === box, "open: a field over the box, the shown value in it, selected, focused");
check(field().style.left === "88px" && field().style.width === "64px", "the field sits over the box (at least 64 px wide, centred)");
field().value = "99"; const ev = key("Enter");
check(sets.join() === "99" && !field() && ValueEdit.editing === null && box.focused === 1 && ev.stopped, "Enter: set once (one edit), the field goes, the box has the focus again; the key goes no further");
ValueEdit.open(box, host); field().value = "99"; key("Enter");
check(sets.join() === "99", "Enter on the value it already has: nothing sent");
ValueEdit.open(box, host); field().value = "300"; key("Enter");
check(field() && field().classList.contains("bad") && /Out of range/.test(said.pop()) && /Out of range/.test(field().title) && sets.length === 1, "a refusal: said, marked, nothing set, the field stays");
key("5"); check(!field().classList.contains("bad"), "the next key clears the mark");
key("Escape");
check(!field() && sets.length === 1 && box.focused === 3, "Esc: the field goes, nothing set, the box has the focus");
ValueEdit.open(box, host); field().value = "12"; field().remove();
check(!field() && sets.length === 1, "a click elsewhere (blur): the field goes, nothing set");
ValueEdit.open(box, host); key("1"); field().value = "300"; { let prevented = false; const ev = { key: "Tab", stopPropagation() { }, preventDefault() { prevented = true; } }; field().listeners.keydown(ev);
	check(prevented && field() && field().classList.contains("bad") && sets.length === 1 && /Out of range/.test(said.pop()), "Tab with a refused value: the field stays (the focus does not move), marked and said, nothing set"); }
field().value = "77"; { let prevented = false; field().listeners.keydown({ key: "Tab", stopPropagation() { }, preventDefault() { prevented = true; } });
	check(!prevented && !field() && sets[sets.length - 1] === 77, "Tab with a good value: set, the field goes, the focus moves on"); }
const again = node("div");
const h2 = Object.assign({}, host, { find: () => again, set: (el, v) => sets.push(el === again ? "again " + v : v) });
ValueEdit.open(box, h2); box.isConnected = false; field().value = "7"; key("Enter"); box.isConnected = true;
check(sets[sets.length - 1] === "again 7", "the box drawn again while typing: the value goes to the new box");
check(!ValueEdit.open(box, Object.assign({}, host, { get: () => null })) && /not known yet/.test(said.pop()), "a value not known yet (LEV before the kit): no field, said");
check(ValueEdit.isOpenClick({ button: 0, metaKey: true }) && !ValueEdit.isOpenClick({ button: 0 }) && !ValueEdit.isOpenClick({ button: 0, metaKey: true, altKey: true })
	&& !ValueEdit.isOpenClick({ button: 0, metaKey: true, shiftKey: true }) && !ValueEdit.isOpenClick({ button: 2, metaKey: true }), "the gesture: ⌘-click (Ctrl off a Mac), no Alt or Shift, the first button");

/* ---- the wiring ---- */
const md = fs.readFileSync(path.join(SKINS, "mdStudio/mdDeskGestures.js"), "utf8"), mmSrc = fs.readFileSync(path.join(SKINS, "mmStudio/mmMockup.js"), "utf8");
check(/<script src="deskValueEdit\.js"><\/script>/.test(fs.readFileSync(path.join(SKINS, "mdStudio/mdStudio.html"), "utf8")), "the Machinedrum page loads it");
check(mmSrc.includes("/* ---- shared/deskValueEdit.js ---- */"), "the Monomachine page has it (mmMockup.js)");
check(/\.vedit\{/.test(fs.readFileSync(path.join(SKINS, "mdStudio/mdDesk.css"), "utf8")) && /\.vedit\{/.test(fs.readFileSync(path.join(SKINS, "mmStudio/mmStudio.css"), "utf8")), "both stylesheets have the field");
check(/ValueEdit\.isOpenClick\(e\)/.test(md) && /ValueEdit\.isOpenClick\(e\)/.test(mmSrc), "both open it on ⌘-click of a value box");
check(/e\.key === "Enter"[^\n]*ValueEdit\.open/.test(md) && /e\.key==="Enter"[^\n]*ValueEdit\.open/.test(mmSrc), "both open it on Enter on a focused value box");
check(/addEventListener\("dblclick"[^\n]*setV\(el/.test(md) && /addEventListener\("dblclick"[^\n]*setV\(el/.test(mmSrc), "double-click is still the default value on both");
const css = fs.readFileSync(path.join(HERE, "deskValueEdit.css"), "utf8");
check(!/inset:|gap:|aspect-ratio|:has\(/.test(css), "its stylesheet suits an older WebKit (no inset, gap, aspect-ratio, :has)");

console.log(failures ? `${failures} failure(s)` : "deskValueEditTest: all passed");
process.exit(failures ? 1 : 0);
