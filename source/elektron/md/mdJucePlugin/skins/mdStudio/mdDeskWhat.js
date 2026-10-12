"use strict";
/* COPY / PASTE / CLEAR what on the Machinedrum (0.6 wave 4; the dialog, the ▾ menu and the remembered ticks are
   skins/shared/deskWhat.js): the selected track's parts as the machine keeps them, PATTERN (trigs, accent, swing,
   slide, locks: every step of the pattern) and KIT (machine + sound, LFO: the kit that plays). One command each,
   trackCopy / trackPaste / trackClear (mdDesk::trackParts), one undo step; the clipboard is the core's
   (machine.clipboard.track says what it holds). The Sound page's LFO card has a ⋯ with Copy LFO, Paste LFO,
   Clear LFO: the same commands with the LFO alone. */
const MD_WHAT = [["trigs", "Trigs", "pat"], ["accent", "Accent", "pat"], ["swing", "Swing", "pat"], ["slide", "Slide", "pat"], ["locks", "Locks", "pat"],
	["sound", "Machine + sound", "kit"], ["lfo", "LFO", "kit"]];
/* what each pattern part of track t holds now: steps with a trig, an accent, a swing, a slide; locked steps */
function whatCounts(t) {
	const P = Docs.patterns[V.pat], pt = P && P.tracks[t];
	if (!pt) return {};
	const mark = k => (P[k] && P[k].editAll === 1 ? P[k].steps : pt[k] || []).length;
	return { trigs: pt.trigs.length, accent: mark("accent"), swing: mark("swing"), slide: mark("slide"),
		locks: (P.locks || []).filter(l => l.track === t).reduce((n, l) => n + l.steps.length, 0) };
}
const whatTrack = t => `${t + 1} ${V.tracks[t] ? V.tracks[t].m : ""}`;
function whatSend(verb, what, to) {
	const base = { p: V.pat, k: V.kit, what };
	if (verb === "paste") cmd("trackPaste", Object.assign(base, { to }));
	else cmd(verb === "copy" ? "trackCopy" : "trackClear", Object.assign(base, { t: S.sel }));
}
function whatOpen(verb) {
	if (!V.loaded) { toast("The pattern is not loaded yet."); return; }
	if (V.rec && verb !== "copy") { toast("Wait until live recording stops."); return; }
	const t = S.sel, clip = V.clipboard.track;
	if (verb === "paste" && !clip) { toast("Copy a track's parts first: ▾ Copy… on the LCD."); return; }
	const counts = verb === "paste" ? clip.counts || {} : whatCounts(t);
	const kitInfo = canDo(V, "workingKitMemory") ? "" : V.caps.reasons.workingKitMemory || "";
	const item = ([id, label]) => ({ id, label, n: counts[id] != null ? String(counts[id]) : "",
		why: verb === "paste" && !clip.what.includes(id) ? "Not copied: Copy… did not tick it" : "" });
	const groups = [{ name: "Pattern", note: patName(V.pat), items: MD_WHAT.filter(p => p[2] === "pat").map(item) },
		{ name: "Kit", note: "K" + String(V.kit + 1).padStart(2, "0") + " " + (V.kitNames[V.kit] || ""), info: kitInfo, items: MD_WHAT.filter(p => p[2] === "kit").map(item) }];
	const marked = S.multi && S.multi.size ? [...S.multi] : [t];
	What.open({ verb, editor: "md", groups,
		src: whatTrack(verb === "paste" ? clip.t : t),
		srcNote: verb === "paste" ? `copied from track ${clip.t + 1}` : `track ${t + 1} · pattern ${patName(V.pat)} · all steps`,
		to: verb === "paste" ? V.tracks.map((x, i) => ({ t: i, label: String(i + 1), name: `Track ${i + 1} ${x.m}`, on: marked.includes(i) })) : null,
		defaults: verb === "copy" ? ["trigs", "accent", "swing", "slide", "locks"] : verb === "paste" ? clip.what : ["locks"],
		done: (what, to) => whatSend(verb, what, to) });
}
/* the ▾ beside COPY CLR PASTE (the LCD), and the Sound page's LFO ⋯ */
addEventListener("click", e => {
	const m = e.target.closest?.("[data-secwhat]");
	if (m) { e.preventDefault(); e.stopImmediatePropagation(); What.menu(m, whatOpen); return; }
	const l = e.target.closest?.("[data-lfom]");
	if (l) { e.preventDefault(); e.stopImmediatePropagation(); lfoMenu(l); }
}, true);
function lfoMenu(el) {
	const t = S.sel, clip = V.clipboard.track, has = !!clip && clip.what.includes("lfo"), r = el.getBoundingClientRect();
	const send = (op, extra) => cmd(op, Object.assign({ k: V.kit, what: ["lfo"] }, extra));
	DeskMenu.open([{ id: "copy", label: "Copy LFO", run: () => send("trackCopy", { t }) },
		{ id: "paste", label: has ? `Paste LFO ${clip.t + 1}` : "Paste LFO", enabled: has, run: () => send("trackPaste", { to: [t] }) },
		{ id: "clear", label: "Clear LFO", run: () => send("trackClear", { t }) }, "-",
		{ note: "Its shapes, target, UPDTE, SPD, DEPTH and SHMIX. The LCD's ▾ copies more parts of a track." }], Math.max(4, r.right - 220), r.bottom + 4, { title: `LFO ${t + 1}` });
}
Keys.bind({ id: "copy-what", short: "Copy what", scope: "any", keys: ["C"], mod: "cmd+shift", group: "Anywhere",
	does: "Copy what: choose which parts of the selected track to copy (the machine's SUPER COPY)", run: () => whatOpen("copy") });
Keys.bind({ id: "paste-what", short: "Paste what", scope: "any", keys: ["V"], mod: "cmd+shift", group: "Anywhere",
	does: "Paste what: choose which copied parts go into which tracks", run: () => whatOpen("paste") });
Keys.bind({ id: "clear-what", short: "Clear what", scope: "any", keys: ["Backspace"], mod: "cmd+shift", group: "Anywhere",
	does: "Clear what: choose which parts of the selected track to clear (the machine's SUPER CLEAR)", run: () => whatOpen("clear") });
