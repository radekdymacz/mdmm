"use strict";
/* COPY / PASTE / CLEAR what (deskWhat.js, 0.6 wave 4), both editors: the dialog's markup (ticks grouped, a part that
   cannot be ticked shown with its reason and never ticked, the target tracks, the go key's words and its danger look for
   Clear), the remembered ticks (per editor and per verb; the defaults the first time; only the ids offered; a browser
   that refuses storage still works), and the wiring: both pages load it, both stylesheets take its look, the commands
   are in both contracts, both key maps have its three keys.
     node deskWhatTest.js */
const fs = require("fs"), path = require("path");
let failures = 0;
const check = (ok, what) => { console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) failures++; };
const HERE = __dirname, SKINS = path.join(HERE, ".."), ROOT = path.join(HERE, "../../../../../..");
const store = {};
global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
global.document = undefined;
eval(fs.readFileSync(path.join(HERE, "deskWhat.js"), "utf8") + "\nglobal.What = What;");

const groups = [{ name: "Pattern", note: "A01", items: [{ id: "trigs", label: "Trigs", n: "4" }, { id: "locks", label: "Locks", n: "2" }] },
	{ name: "Kit", note: "K01", info: "The working kit is <the editor's>.", items: [{ id: "sound", label: "Machine + sound", why: "Not copied" }] }];
const html = What.html({ verb: "copy", src: "2 TRX-SD", srcNote: "track 2", groups }, ["trigs", "sound"]);
check(/<h3>Copy what<\/h3>/.test(html) && /data-wid="trigs" checked/.test(html) && !/data-wid="locks" checked/.test(html), "copy: the title, the ticked parts ticked, the others not");
check(/data-wid="sound" disabled/.test(html) && !/data-wid="sound" checked/.test(html) && /class="dis" title="Not copied"/.test(html), "a part with a reason is shown off, with the reason, and never ticked");
check(/&lt;the editor&#?[a-z0-9]*;?s&gt;|&lt;the editor's&gt;/.test(html) && /class="whatinfo"/.test(html), "a group's note from the engine, escaped");
check(/class="cream" data-dlg="0" data-wgo="1">Copy</.test(html) && /data-dlg="1">Cancel/.test(html) && !/To tracks/.test(html), "copy: Copy and Cancel, no tracks");
const clear = What.html({ verb: "clear", src: "1 X", groups }, []);
check(/class="danger"[^>]*>Clear</.test(clear) && /SUPER CLEAR/.test(clear), "clear: the red Clear key, the machine's name for it");
const paste = What.html({ verb: "paste", src: "1 X", groups, to: [{ t: 0, label: "1", name: "a", on: true }, { t: 1, label: "2", name: "b", on: true }, { t: 6, label: "M1", name: "m", on: true, why: "MIDI onto MIDI" }] }, ["trigs"]);
check(/To tracks/.test(paste) && /data-wto="0" aria-pressed="true"/.test(paste) && /data-wto="6" aria-pressed="false" disabled title="MIDI onto MIDI"/.test(paste),
	"paste: the target keys, lit as asked; one that cannot take it off, with its reason");
check(/>Paste into 2 tracks</.test(paste) && What.label("paste", [], [3]) === "Paste into 1 track" && What.label("paste", [], []) === "Paste", "paste: the go key says how many tracks");

check(JSON.stringify(What.ticked("md", "copy", ["trigs", "locks", "sound"], ["trigs", "locks"])) === '["trigs","locks"]', "the first time: the defaults");
What.remember("md", "copy", ["locks"]);
check(JSON.stringify(What.ticked("md", "copy", ["trigs", "locks"], ["trigs"])) === '["locks"]' && JSON.stringify(What.ticked("mm", "copy", ["notes"], ["notes"])) === '["notes"]'
	&& JSON.stringify(What.ticked("md", "clear", ["locks"], [])) === "[]", "remembered per editor and per verb");
check(JSON.stringify(What.ticked("md", "copy", ["trigs", "swing"], ["trigs"])) === '["trigs"]' && JSON.stringify(What.ticked("md", "copy", ["swing"], ["trigs"])) === "[]",
	"only the ids offered; none of the remembered ones offered: the defaults among them (B-085)");
What.remember("md", "paste", ["trigs"]);
check(JSON.stringify(What.ticked("md", "paste", ["swing"], ["swing"])) === '["swing"]', "B-085: a paste of Trigs remembered, Swing alone copied: Paste… ticks Swing");
What.remember("md", "paste", ["trigs", "swing"]);
check(JSON.stringify(What.ticked("md", "paste", ["swing"], ["swing"])) === '["swing"]' && JSON.stringify(What.ticked("md", "paste", ["trigs", "swing", "slide"], ["slide"])) === '["trigs","swing"]', "remembered ones that are offered win over the defaults");
global.localStorage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
let threw = false; try { What.remember("md", "copy", ["x"]); check(JSON.stringify(What.ticked("md", "copy", ["a", "b"], ["b"])) === '["b"]', "storage refused: the defaults, nothing thrown"); } catch (_) { threw = true; }
check(!threw, "storage refused: nothing thrown");

/* the wiring */
const mdHtml = fs.readFileSync(path.join(SKINS, "mdStudio/mdStudio.html"), "utf8"), mmJs = fs.readFileSync(path.join(SKINS, "mmStudio/mmMockup.js"), "utf8");
check(/<script src="deskWhat\.js"><\/script>[\s\S]*<script src="mdDeskWhat\.js"><\/script>/.test(mdHtml) && /data-secwhat/.test(mdHtml), "the Machinedrum page loads it and its own part, and has the ▾");
check(/shared\/deskWhat\.js/.test(mmJs) && /78-what\.js/.test(mmJs) && /data-secwhat/.test(fs.readFileSync(path.join(SKINS, "mmStudio/mmStudio.html"), "utf8")), "the Monomachine page has it, its own part and the ▾");
for (const css of ["mdStudio/mdDesk.css", "mmStudio/mmStudio.css"]) check(/\.dlgbox\.what\{/.test(fs.readFileSync(path.join(SKINS, css), "utf8")), css + " takes its look");
check(!/color-mix|:has\(/.test(fs.readFileSync(path.join(HERE, "deskWhat.css"), "utf8")), "its stylesheet suits an older WebKit (no color-mix, no :has)");
for (const m of ["md", "mm"]) {
	const schema = fs.readFileSync(path.join(ROOT, `doc/modern-ux/${m}-data-contract.schema.json`), "utf8");
	check(["trackCopy", "trackPaste", "trackClear"].every(op => schema.includes(`"const": "${op}"`)), m + ": the three commands are in the contract");
	const keys = JSON.parse(fs.readFileSync(path.join(ROOT, "doc/modern-ux/keymap.json"), "utf8"))[m];
	check(["copy-what", "paste-what", "clear-what"].every(id => keys.some(e => e.id === id && e.mod === "cmd+shift")), m + ": the key map has ⌘⇧C, ⌘⇧V, ⌘⇧⌫");
}
console.log(failures ? `deskWhatTest: ${failures} failure(s)` : "deskWhatTest: PASS");
process.exit(failures ? 1 : 0);
