"use strict";
/* The GLOBAL page both editors share (B-051, F3; the Machinedrum Editor's v61 panel, P5, made shared; a page over the
   workspace since 0.6, DESIGN-machine-menus.md §2): the machine's own settings, kept in its active global slot, opened by
   the GLOBAL key in the top bar or GLOBAL… in the engine menu (and the AUDIO panel's link). The header stays; Esc, the
   GLOBAL key or a click on the header goes back. This file is the frame and the controls: the head on one line (the
   slot chip, the 8 slots: the active one lit, a click makes that one active; Copy · Paste · Clear, the machine's global
   slot menu), the cards' controls (GlobalUi), placing, the GLOBAL key's light. What a machine's global holds is its
   host's (DeskGlobal.host, set by mdDeskGlobal.js and the Monomachine mockup's 117-global.js):
     view()        the active global as the page shows it ({slot, ...}), or null while it is read
     cards(G)      the cards' HTML; their controls carry data-ga (a click) or data-gsel (a select)
     click(a, G)   a card's control was clicked (a: the element with data-ga)
     change(s, G)  a card's select changed (optional)
     slot(n)       make slot n the active one
     reset()       Clear: the active slot becomes the machine's factory global (asked first, here)
     copy(G), paste(G), canPaste()   Copy and Paste of the active slot (the core asks before a paste)
     ask(html, label, yes)  the editor's question dialog (yes runs on the confirm key, named label)
     back()        the name of the workspace under the page, for the head's back key
     menu          where the settings are on the machine, for the head's tip ("FUNCTION + PATTERN/SONG") */
var GP = { open: false, note: 64, learn: null, shift: false };
const DeskGlobal = { host: null };
const GlobalUi = {
	tog: (f, on, tip, a = "ON", b = "OFF") => `<span class="seg" title="${tip}"><button data-ga="${f}" data-v="1" aria-pressed="${on}">${a}</button><button data-ga="${f}" data-v="0" aria-pressed="${!on}">${b}</button></span>`,
	step: (f, label, tip) => `<span class="stepper" title="${tip}"><button data-ga="${f}" data-d="-1" aria-label="Less">−</button><b class="mono">${label}</b><button data-ga="${f}" data-d="1" aria-label="More">+</button></span>`,
	row: (label, control, extra = "") => `<div class="grow2"><span class="ilab">${label}</span>${control}${extra}</div>`
};
const GRESET_TIP = "Clear: the active global slot back to how the machine shipped: MIDI channels, sync and the rest (asked first)";
function drawGlobal() {
	const pop = document.getElementById("globpop"), H = DeskGlobal.host;
	if (!pop) return;
	if (!GP.open || !H) { pop.hidden = true; pop.classList.remove("gpage"); return; }
	pop.classList.add("gpage");
	const G = H.view(), back = H.back ? H.back() : "", esc = `<button class="gpback" data-ga="close" title="Back${back ? " to " + back : ""} (Esc or GLOBAL)">Esc${back ? " · back to " + back : ""}</button>`;
	if (!G) { pop.innerHTML = `<div class="gphead"><span class="gpname">Global</span><span class="note">Reading the global settings from the machine…</span><span class="gpsp"></span>${esc}</div>`; pop.hidden = false; placeGlobal(); return; }
	const can = !H.canPaste || H.canPaste();
	pop.innerHTML = `<div class="gphead" title="${H.menu} on the machine. Every change is stored in the active slot and made active at once."><span class="gpname">Global</span><span class="lcdchip">GLOBAL ${G.slot + 1}</span><span class="gslots" title="8 global setups; the lit one is active (SysEx 0x56). A click makes it active">${Array.from({ length: 8 }, (_, k) => `<button data-ga="slot" data-v="${k}" aria-pressed="${k === G.slot}">${k + 1}</button>`).join("")}</span>${H.copy ? `<span class="gpkeys"><button data-ga="copy" title="Copy GLOBAL ${G.slot + 1}: all its settings">Copy</button><button data-ga="paste"${can ? "" : " disabled"} title="${can ? `Paste the copied global into GLOBAL ${G.slot + 1} (asked first; Undo brings it back)` : "Copy a global first"}">Paste</button>` : `<span class="gpkeys">`}<button class="greset danger" data-ga="reset" title="${GRESET_TIP}">Clear</button></span><span class="gpsp"></span>${esc}</div>
 <div class="globgrid">${H.cards(G)}</div>`;
	if (typeof enhanceSelects === "function") enhanceSelects(pop);
	pop.hidden = false; placeGlobal();
}
/* under the header, as wide as it, down to the window's foot (the page scrolls inside) */
function placeGlobal() {
	const pop = document.getElementById("globpop"), hd = document.querySelector("header.top") || document.querySelector(".lcdpanel"), r = hd.getBoundingClientRect(), top = Math.max(16, r.bottom + 10);
	pop.style.top = (top + scrollY) + "px"; pop.style.height = Math.max(240, innerHeight - top) + "px"; pop.style.maxHeight = "";
	pop.style.left = (r.left + scrollX) + "px"; pop.style.width = r.width + "px";
}
function globKeyLit() { const k = document.getElementById("globkey"); if (k) { k.setAttribute("aria-pressed", String(GP.open)); k.classList.toggle("on", GP.open); const l = k.querySelector(".led"); if (l) l.classList.toggle("on", GP.open); } }
function openGlobal() { if (typeof closeLib === "function") closeLib(false); GP.open = true; drawGlobal(); globKeyLit(); }
function closeGlobal() { GP.open = false; GP.learn = null; drawGlobal(); globKeyLit(); }
function globalClick(a) {
	const H = DeskGlobal.host, f = a.dataset.ga;
	if (f === "close") { closeGlobal(); return; }
	const G = H && H.view(); if (!G) return;
	if (f === "slot") { if (+a.dataset.v !== G.slot) H.slot(+a.dataset.v); return; }
	if (f === "reset") {
		H.ask(`Clear <b>GLOBAL ${G.slot + 1}</b>? MIDI channels, sync and the rest go back to the factory settings (Undo brings them back).`, "Clear", () => H.reset());
		return;
	}
	if (f === "copy") { H.copy(G); return; }
	if (f === "paste") { if (!H.canPaste || H.canPaste()) H.paste(G); return; }
	H.click(a, G);
}
/* No backdrop: a press outside the page closes it and goes no further (a step of the grid below must not take it); the header
   (a workspace tab, the LCD, a key) is let through, the click there does what it does. The press, its release and its click
   are one gesture: after the first is eaten, the rest of them are too (EAT), for a moment. */
const GLOBAL_THROUGH = "#dlg,.kpop,#kpop,.lcdeng,.modalbg,#deskmenu", GLOBAL_HEADER = "header.top,.lcdpanel";
let globEat = false;
const globStop = e => { e.preventDefault(); e.stopPropagation(); };
const globOutside = e => !document.getElementById("globpop").contains(e.target) && !(e.target.closest && e.target.closest(GLOBAL_THROUGH + "," + GLOBAL_HEADER));
for (const ev of ["pointerdown", "mousedown", "pointerup", "mouseup"]) document.addEventListener(ev, e => {
	if (globEat) { globStop(e); return; }
	if (!GP.open || !globOutside(e)) return;
	globStop(e); globEat = true; setTimeout(() => { globEat = false; }, 600);
	if (ev === "pointerdown" || ev === "mousedown") closeGlobal();
}, true);
document.addEventListener("click", e => {
	if (e.target.closest && e.target.closest("#globkey")) { GP.open ? closeGlobal() : openGlobal(); e.stopPropagation(); return; }
	if (globEat) { globEat = false; globStop(e); return; }
	if (!GP.open) return;
	const pop = document.getElementById("globpop");
	if (pop.contains(e.target)) { const a = e.target.closest("[data-ga]"); GP.shift = !!e.shiftKey; if (a) globalClick(a); return; }
	if (e.target.closest && e.target.closest(GLOBAL_THROUGH)) return;
	closeGlobal();
	if (!(e.target.closest && e.target.closest(GLOBAL_HEADER))) globStop(e);
}, true);
document.addEventListener("change", e => {
	const s = e.target.closest && e.target.closest("#globpop [data-gsel]"), H = DeskGlobal.host;
	if (s && H && H.change && H.view()) H.change(s, H.view());
});
addEventListener("resize", () => { if (GP.open) placeGlobal(); });
Keys.bind({ id: "global-key", scope: "any", area: "Top bar", keys: ["GLOBAL key"], group: "Anywhere", does: "The GLOBAL page: the machine's own settings, kept in its memory: MIDI channels, sync and the rest (also the engine menu: GLOBAL…)" });
Keys.bind({ id: "close-global", short: "Close", scope: "any", keys: ["Escape"], group: "Anywhere", does: "Back from the GLOBAL page to the workspace", when: () => GP.open, run: () => closeGlobal() });
