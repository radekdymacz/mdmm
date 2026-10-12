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
	S.paused = { step: S.step };
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

/* ===== erase while live recording (wave 7, manual p.40) =====
   Delete (or ⌫) held while live recording is EXIT/NO with the selected track's TRIG key held on the machine: the
   firmware takes that track's trigs off as they play. Let go (or the window loses the keys): both keys up. The core
   lets them go by itself when recording ends. Key repeat is ignored; the rail's header of the track is marked. */
const ERASE = { t: null };
function eraseDown(e) {
	if (e.repeat || ERASE.t === S.sel) return;
	ERASE.t = S.sel;
	document.body.classList.add("erasing");
	cmd("liveErase", { t: S.sel, on: true }, undefined, undefined, r => { if (!r.ok) eraseUp(); });
}
function eraseUp() {
	if (ERASE.t == null) return;
	const t = ERASE.t; ERASE.t = null;
	document.body.classList.remove("erasing");
	Bridge.send({ op: "liveErase", t, on: false });
}
const erasing = () => !!V.rec && kbOn();
document.addEventListener("keyup", e => { if (e.key === "Delete" || e.key === "Backspace") eraseUp(); });
addEventListener("blur", () => eraseUp());

/* ===== the ▾ in the ▶ key's corner (the menu without a right-click) and the tempo's click ===== */
(() => {
	document.addEventListener("click", e => {
		const m = e.target.closest?.("#playmore"); if (!m) return;
		e.preventDefault(); e.stopImmediatePropagation();
		const r = m.getBoundingClientRect(); transportMenu(r.left, r.bottom + 2);
	}, true);
	const b = document.getElementById("bpm");
	if (b) { b.setAttribute("aria-haspopup", "dialog"); DeskTransport.bindClick(b, openTempo); }
})();

/* ===== keys ===== */
Keys.bind({ id: "pause", short: "Pause", scope: "any", keys: ["Space"], code: "Space", mod: "shift", group: "Transport", does: "Pause: the machine holds its step; again (or ▶) goes on from it, STOP ends it (also ⇧-click ▶)", run: () => pauseToggle() });
Keys.bind({ id: "panic", short: "Panic", scope: "any", keys: ["."], mod: "cmd", group: "Transport", does: "Panic: every voice off (the machine's STOP twice)", run: () => panicNow() });
Keys.bind({ id: "tempo-nudge", short: "Nudge", scope: "any", keys: ["-", "="], group: "Transport", does: "Hold: the tempo 10 % slower (-) or faster (=) while held, as the TEMPO menu's nudge", when: () => kbOn(), run: e => DeskTransport.nudgeKey(e.key, TEMPO_HOST) });
Keys.bind({ id: "live-erase", short: "Erase", scope: "any", keys: ["Delete", "Backspace"], group: "Transport", does: "While live recording, hold: erase the selected track's trigs as they play (EXIT/NO + its TRIG key on the machine)", when: () => erasing(), run: e => eraseDown(e) });
Keys.bind({ id: "song-play-from", short: "From here", scope: "song", keys: ["Enter"], group: "Song", does: "Play the song from the selected row (▶ From here)", when: () => kbOn() && S.ws === "song" && !document.activeElement?.closest?.(".songlib,[data-rowact]"), run: () => playFromRow() });
[
	["transport-menu", "any", "Top bar", ["right-click ▶"], "", "Transport", "The transport menu: Play / Stop, Pause / Continue, Record, Panic (also the ▾ in the key's corner)"],
	["pause-click", "any", "Top bar", ["▶"], "shift", "Transport", "Click: pause; ▶ again goes on from the step"],
	["tempo-click", "any", "Top bar", ["tempo"], "", "Transport", "Click (no drag): the TEMPO window: − / +, TAP, nudge, change on release"],
	["tempo-delayed", "any", "Top bar", ["tempo"], "alt", "Transport", "Drag: the tempo changes when you let go (FUNCTION held on the machine)"]
].forEach(([id, scope, area, keys, mod, group, does]) => Keys.bind({ id, scope, area, keys, mod, group, does }));
