"use strict";
/* Wave 2 (doc/modern-ux/DESIGN-machine-menus.md §2): the transport beyond PLAY and STOP on the Machinedrum page. The ▶ menu
   and the TEMPO pop-up are drawn by shared/deskTransport.js; here are this page's commands for them:
     the pause: ⇧-click ▶ or ⇧Space; ▶ again (or ⇧Space) goes on from the step, STOP ends it. S.paused holds the step the
       pause keeps until PLAY, STOP, or the machine plays again (onTelemetry);
     the ▶ menu: right-click ▶, or the ▾ in its corner (Play / Stop, Pause / Continue, Record, Panic);
     panic: ⌘. (the machine's STOP twice; over MIDI the Machinedrum has no message for it, capabilities.panic says why);
     the TEMPO pop-up: a click on the LCD's tempo (a drag still sets it); the nudge: - and = held;
     play from a song row: ▶ From here on the Song page's selected row, or Enter there. */

/* ===== the pause ===== */
function pauseNow() {
	if (!V.playing) return;
	S.paused = { step: S.step, at: Date.now() };
	cmd("pause", {}, undefined, undefined, r => { if (!r.ok) { S.paused = null; renderTop(); setPos(); } });
	renderTop(); setPos();
}
function resumeNow() {
	if (!S.paused) return;
	S.paused = null;
	cmd("resume");
	renderTop();
}
function pauseToggle() { if (S.paused) resumeNow(); else pauseNow(); }
/* the ▶ key: PLAY, STOP, or (paused) CONTINUE */
function playButton() { if (S.paused) { resumeNow(); return; } cmd(V.playing ? "stop" : "play"); }
function stopNow() { S.paused = null; cmd("stop"); renderTop(); setPos(); }
function panicNow() {
	if (!canDo(V, "panic")) { toast(V.caps.reasons.panic || "Not available with this engine."); return; }
	S.paused = null;
	cmd("panic");
	renderTop(); setPos();
}

/* ===== the ▶ menu ===== */
function transportState() {
	return { playing: V.playing, paused: !!S.paused, rec: !!V.rec,
		can: { transport: canDo(V, "transport"), record: canDo(V, "liveRecord"), panic: canDo(V, "panic") }, reasons: V.caps.reasons };
}
const TRANSPORT_HOST = { recordLabel: "Record", play: () => playButton(), stop: () => stopNow(), pauseToggle: () => pauseToggle(), record: () => cmd("record"), panic: () => panicNow() };
function transportMenu(x, y) { DeskTransport.openMenu(x, y, transportState(), TRANSPORT_HOST); }
document.addEventListener("contextmenu", e => {
	if (!e.target.closest?.("#play")) return;
	e.preventDefault(); e.stopImmediatePropagation();
	transportMenu(e.clientX, e.clientY);
}, true);

/* ===== the TEMPO pop-up and the nudge ===== */
/* the tempo the LCD shows: a drag's value until its release (change on release), a nudge while it is held */
function shownBpm() {
	if (S.tempoDraft != null) return S.tempoDraft;
	return S.nudge ? DeskTransport.nudged(V.bpm, S.nudge) : V.bpm;
}
function nudgeTempo(pct) {
	if (pct && hostTempoRefused()) return;
	S.nudge = pct;
	cmd("nudge", { pct });
	renderTop();
}
const TEMPO_HOST = {
	bpm: () => shownBpm(),
	set: bpm => { if (hostTempoRefused()) return; cmd("tempo", { bpm }, "tempo", [[["bpm"], bpm]]); renderTop(); },
	nudge: pct => nudgeTempo(pct),
	tap: () => tapTempo(),
	refused: () => V.hostTempo ? "The DAW sets the tempo. Change it there." : "",
	sync: { text: () => "tempo in: " + (Docs.global?.control?.tempoIn === "external" ? "EXTERNAL" : "INTERNAL"),
		global: () => document.getElementById("globkey")?.click() }
};
function openTempo() { const b = $("#bpm"); if (b) DeskTransport.openTempo(b, TEMPO_HOST); }

/* ===== play from a song row ===== */
function playFromRow(i = S.songSel) {
	if (!canDo(V, "playFrom")) { toast(V.caps.reasons.playFrom || "Not available with this engine."); return; }
	const r = V.song[i];
	if (!r || r.type) { toast("Pick a pattern row to play from."); return; }
	S.paused = null;
	cmd("playFrom", { i });
}

/* ===== erase while live recording (wave 7, manual p.40; MD-140, p.48) =====
   Delete (or ⌫) held while live recording, with no value pressed, is EXIT/NO with the selected track's TRIG key held on
   the machine: the firmware takes that track's trigs off as they play. With a track value pressed (the mouse held on it,
   as a DATA ENTRY knob pressed on the machine), Delete is EXIT/NO with that knob instead: the track's locks of that
   parameter go as they play, its trigs and other locks stay (the core selects the track and shows the knob's page
   first). A pressed value that has no locks (the master effects, the LFO fields other than SPD, DEPTH and SHMIX, the
   Control page's values) does nothing but say so. The trig erase waits ERASE_GRACE_MS after Delete goes down, so a value
   pressed just after Delete still wins. Letting the value go while Delete is still down erases nothing more (EXIT/NO
   alone) until Delete is let go; the value stays put until the mouse is let go (its drag would jump). Let go (or the
   window loses the keys): both keys up. The core lets them go by itself when recording ends, when the page comes back,
   and when the page has not said for a second that the key is still held (the page says it every 250 ms: a page that
   went away while Delete was down lets go). Key repeat is ignored; the rail's header of the track is marked, and the
   pressed value too. */
const ERASE_GRACE_MS = 150;
const ERASE = { t: null, i: null, on: false, spent: false, beat: 0, el: null, grace: 0, said: "" };
let eraseValue = null;	/* the value pressed while live recording: { el, t, i } (eraseValueAt); i null: it has no locks */
let eraseHeldEl = null;	/* the value held for a lock removal: no value changes on it until the mouse is let go */
function eraseArgs() { return ERASE.i != null ? { t: ERASE.t, on: true, i: ERASE.i } : { t: ERASE.t, on: true }; }
function eraseMark(el) { ERASE.el?.classList.remove("erasing"); ERASE.el = el; el?.classList.add("erasing"); }
function eraseStopSending() { clearTimeout(ERASE.grace); ERASE.grace = 0; clearInterval(ERASE.beat); }
function eraseSend() {
	eraseStopSending();
	ERASE.t = eraseValue ? eraseValue.t : S.sel; ERASE.i = eraseValue ? eraseValue.i : null;
	if (eraseValue) eraseHeldEl = eraseValue.el;
	document.body.classList.add("erasing"); eraseMark(eraseValue?.el || null);
	cmd("liveErase", eraseArgs(), undefined, undefined, r => { if (!r.ok) eraseUp(); });
	ERASE.beat = setInterval(() => { if (ERASE.on && !ERASE.spent) Bridge.send({ op: "liveErase", ...eraseArgs() }); }, 250);
}
/* EXIT/NO alone from here until Delete goes up: nothing more is erased */
function eraseSpend() {
	const was = ERASE.t != null && !ERASE.spent && !ERASE.grace;
	eraseStopSending(); ERASE.spent = true; eraseMark(null); document.body.classList.remove("erasing");
	if (was) Bridge.send({ op: "liveErase", t: ERASE.t, on: false });
}
function eraseNoLocks() { eraseSpend(); toast("This value has no locks."); }
/* Delete down: the pressed value's locks, or after the grace the selected track's trigs */
function eraseStart() {
	if (eraseValue) { if (eraseValue.i == null) eraseNoLocks(); else eraseSend(); return; }
	eraseStopSending();
	ERASE.grace = setTimeout(() => { ERASE.grace = 0; if (ERASE.on && !ERASE.spent && !eraseValue) eraseSend(); }, ERASE_GRACE_MS);
}
function eraseDown(e) {
	if (e.repeat || ERASE.on) return;
	ERASE.on = true; ERASE.spent = false; ERASE.t = ERASE.i = null; ERASE.said = "";
	eraseStart();
}
function eraseUp() {
	if (!ERASE.on) return;
	const t = ERASE.t, sent = t != null && !ERASE.spent;
	eraseStopSending();
	ERASE.on = false; ERASE.spent = false; ERASE.t = ERASE.i = null;
	document.body.classList.remove("erasing"); eraseMark(null);
	if (sent) Bridge.send({ op: "liveErase", t, on: false });
}
/* recording ended (mdDeskTop.js renderTop): nothing is held any more, on the page either */
function eraseReset() {
	eraseStopSending();
	ERASE.on = ERASE.spent = false; ERASE.t = ERASE.i = null;
	document.body.classList.remove("erasing"); eraseMark(null);
	eraseValue = null; eraseHeldEl = null;
}
/* the mouse let go: the value is free again; while Delete is down after a lock removal, EXIT/NO alone */
function eraseValueUp() {
	eraseHeldEl = null;
	if (!eraseValue) return;
	eraseValue = null;
	if (ERASE.on && ERASE.i != null && !ERASE.spent) eraseSpend();
}
/* a value under the pointer: its track and kit parameter (0-23), as Control All finds its knob (mdDeskLive.js); a value
   with no kit parameter (master effects, the other LFO fields, the Control page's values) has i null */
function eraseValueAt(target) {
	const el = target?.closest?.(".pc[data-g],.fader[data-g]"); if (!el || el.classList.contains("empty")) return null;
	const t = el.dataset.t != null ? +el.dataset.t : S.sel, k = tweakKnob(el.dataset.g, el.dataset.n, t);
	return { el, t, i: k && TWEAK_BASE[k.g] != null ? TWEAK_BASE[k.g] + k.knob : null };
}
document.addEventListener("pointerdown", e => {
	eraseValue = null;
	if (!V.rec || e.button !== 0) return;
	eraseValue = eraseValueAt(e.target);
	if (!eraseValue || !ERASE.on || ERASE.spent) return;
	if (eraseValue.i == null) eraseNoLocks();
	else eraseSend();
}, true);
document.addEventListener("pointerup", eraseValueUp, true);
document.addEventListener("pointercancel", eraseValueUp, true);
const erasing = () => !!V.rec && kbOn();
document.addEventListener("keyup", e => { if (e.key === "Delete" || e.key === "Backspace") eraseUp(); });
addEventListener("blur", () => { eraseUp(); eraseValue = null; eraseHeldEl = null; });
/* the core could not show the knob's page (desk.liveErase gaveUp): say so once, nothing more is sent */
Bridge.onMessage(m => {
	if (m.type !== "machine" || !m.doc.desk) return;
	const e = m.doc.desk.liveErase;
	if (!e || e.state !== "gaveUp" || !ERASE.on || ERASE.said === "gaveUp") return;
	ERASE.said = "gaveUp"; eraseSpend();
	toast("The machine did not show the value's knob page: no locks were removed.");
});

/* ===== the tempo's click ===== */
(() => {
	const b = document.getElementById("bpm");
	if (b) { b.setAttribute("aria-haspopup", "dialog"); DeskTransport.bindClick(b, openTempo); }
})();

/* ===== keys ===== */
Keys.bind({ id: "pause", short: "Pause", scope: "any", keys: ["Space"], code: "Space", mod: "shift", group: "Transport", does: "Pause: the machine holds its step; again (or ▶) goes on from it, STOP ends it (also ⇧-click ▶)", run: () => pauseToggle() });
Keys.bind({ id: "panic", short: "Panic", scope: "any", keys: ["."], mod: "cmd", group: "Transport", does: "Panic: every voice off (the machine's STOP twice)", run: () => panicNow() });
Keys.bind({ id: "tempo-nudge", short: "Nudge", scope: "any", keys: ["-", "="], group: "Transport", does: "Hold: the tempo 10 % slower (-) or faster (=) while held, as the TEMPO menu's nudge", when: () => kbOn(), run: e => DeskTransport.nudgeKey(e.key, TEMPO_HOST) });
Keys.bind({ id: "live-erase", short: "Erase", scope: "any", keys: ["Delete", "Backspace"], group: "Transport", does: "While live recording, hold: erase the selected track's trigs as they play (EXIT/NO + its TRIG key on the machine). With a track value pressed: that parameter's locks instead (EXIT/NO + its DATA ENTRY knob)", when: () => erasing(), run: e => eraseDown(e) });
Keys.bind({ id: "song-play-from", short: "From here", scope: "song", keys: ["Enter"], group: "Song", does: "Play the song from the selected row (▶ From here)", when: () => kbOn() && S.ws === "song" && !document.activeElement?.closest?.(".songlib,[data-rowact]"), run: () => playFromRow() });
[
	["transport-menu", "any", "Top bar", ["right-click ▶"], "", "Transport", "The transport menu: Play / Stop, Pause / Continue, Record, Panic (right-click ▶; Shift+F10 or the menu key with ▶ focused)"],
	["pause-click", "any", "Top bar", ["▶"], "shift", "Transport", "Click: pause; ▶ again goes on from the step"],
	["tempo-click", "any", "Top bar", ["tempo"], "", "Transport", "Click (no drag): the TEMPO window: − / +, TAP, nudge, change on release"],
	["tempo-delayed", "any", "Top bar", ["tempo"], "alt", "Transport", "Drag: the tempo changes when you let go (FUNCTION held on the machine)"]
].forEach(([id, scope, area, keys, mod, group, does]) => Keys.bind({ id, scope, area, keys, mod, group, does }));
