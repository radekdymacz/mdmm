"use strict";
/* Sound: the selected track's sound in small groups (the tables: mdDeskSoundGroups.js), each with its screen
   (a canvas editor, mdDeskEditors.js) and its value boxes; the LFO and the track's relations; the MUTATE bar
   on top (mdDeskGenUi.js). pc() and the LFO shapes are the value box and the shape icons every page uses. */

/* ===== Sound ===== */
function pc(g, n, { t, f, color, unit } = {}) {
	if (!n) return `<div class="pc empty" aria-hidden="true"></div>`;
	const partner = t == null && S.ws === "sound" ? CLIP[g + ":" + n] : null, tip = partner ? ` data-clip="${partner}" title="Works with ${partner}: the Machinedrum joins the two with a clip"` : "";
	return `<div class="pc"${tip} role="slider" tabindex="0" aria-label="${n}" aria-valuemin="0" aria-valuemax="127" data-g="${g}" data-n="${n}"${t != null ? ` data-t="${t}"` : ""}${f ? ` data-f="${f}"` : ""}${color ? ` style="--pc:${color}"` : ""}><span>${n}</span>${unit ? `<i class="pu" data-unit="${unit}"></i>` : ""}<b></b></div>`;
}
function shapeIcon(i, inv) { const pts = Array.from({ length: 25 }, (_, k) => { const x = k / 24; return [(x * 26 + 1).toFixed(1), (11 - 7 * shape(i, x, inv)).toFixed(1)]; }); return `<svg width="28" height="22" viewBox="0 0 28 22" aria-hidden="true"><polyline fill="none" stroke="currentColor" stroke-width="1.6" points="${pts.map(p => p.join(",")).join(" ")}"/></svg>`; }
const RND = [.35, -.7, .9, -.25, .55, -.9, .1, .7];
function shape(i, x, inv) { const v = [1 - 4 * Math.abs(x - .5), 2 * x - 1, x < .5 ? 1 : -1, 1 - 2 * x, 2 * Math.exp(-4 * x) - 1, RND[Math.floor(x * 8) % 8]][i] ?? 0; return inv ? -v : v; }
function machButton(tr) {
	const fk = famKey(tr.m, Cat), fam = FAMS.find(x => x[0] === fk) || ["", ""];
	return `<button class="machbtn" id="machbtn" aria-haspopup="dialog" aria-expanded="false" aria-label="Change machine"><span class="lcdtxt">${tr.m}</span><span class="mfam">${fam[0].replace("PI", "P-I")} · ${fam[1]}</span><svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button>`;
}
const attr = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const sndPlot = (inner, tip, note) => `<div class="plot" title="${attr(tip)}">${inner}${note ? `<span class="plotnote">${note}</span>` : ""}</div>`;
/* a group's screen, or "": its canvas knows the group's knobs (data-k), so one editor serves every
   machine that has them */
function sndScreen(ed, tr, at, knobs = []) {
	if (!ed) return "";
	if (ed === "sample") return sndPlot(waveBox(`<canvas class="ed" data-ed="sample" aria-label="Sample with start and end markers. Drag the markers."></canvas>`, at), SND_TIP.sample, smpWhy(at));
	if (ed === "rec") return sndPlot(waveBox(`<canvas class="ed" data-ed="rec" aria-label="Recording window. Drag LEN."></canvas>`, at), SND_TIP.rec, smpWhy(at));
	const tip = SND_TIP[ed] || "Drag the dots.";
	return sndPlot(`<canvas class="ed" data-ed="${ed}" data-k="${knobs.join(" ")}" aria-label="${attr(tip)}"></canvas>`, tip);
}
/* The track's groups: { key, title, g, knobs, ed } per row. Synthesis: the machine's table (its knobs
   by their page names: SYN·DIST where the routing page has a DIST too), then any knob it leaves out. */
function sndGroups(tr) {
	const pg = pages(tr.m, Cat), have = names(pg.s), syn = [], fxrt = [], used = new Set();
	const qual = n => have.includes(n) ? n : have.includes("SYN·" + n) ? "SYN·" + n : null;
	for (const d of synTable(tr.m, Cat)) {
		const knobs = d.knobs.map(qual).filter(n => n && !used.has(n)); if (!knobs.length) continue;
		knobs.forEach(n => used.add(n));
		syn.push({ key: d.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"), title: d.title, g: "syn", knobs, ed: d.ed, note: d.note });
	}
	const rest = have.filter(n => !used.has(n));
	if (rest.length) syn.push({ key: "syn", title: "Synthesis", g: "syn", knobs: rest, ed: null });
	const add = (list, key, title, g, n, ed) => { let x = list.find(a => a.key === key && a.g === g); if (!x) list.push(x = { key, title, g, knobs: [], ed }); x.knobs.push(n); };
	for (const [g, p] of [["fx", "e"], ["rt", "r"]]) for (const n of names(pg[p])) { if (g === "rt" && LFO_RT.includes(n)) continue; const [k, title, ed] = fxrtKey(n, g); add(fxrt, k, title, g, n, ed); }
	return [syn, fxrt];
}
const SND_COL = { fx: "var(--e12)", rt: "var(--gnd)", lfo: "var(--teal)" };
/* a group: its title on the rule, its screen (or what its knobs do), its boxes; its page's word only on
   the first group of that page in its row (tag false). Each part is a cell of the row's grid. */
function sgHtml(x, cols, color, tag, note) {
	const page = SND_TAG[x.g][1];
	const body = x.body || `<div class="ctl" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${x.knobs.map(n => pc(x.g, n, { color: SND_COL[x.g] || color })).join("")}${clipMarks(x.g, x.knobs, cols)}</div>`;
	return `<section class="sg" data-sg="${x.key}"><header${x.menu ? ' class="hasmenu"' : ""}><h3>${mutTitle(x)}</h3>${tag ? `<span title="${attr(x.tagTip || "Its knobs are on the Machinedrum's " + page + " page")}">${SND_TAG[x.g][0]}</span>` : ""}${x.menu || ""}</header>${x.plot || (note ? `<p class="sgnote">${note}</p>` : "")}${body}</section>`;
}
/* One row (shared/deskSoundLayout.js soundRow): a group with a screen is a column of its own (a waveform wider),
   the ones without pair up; a lone one says what its knobs do (the machine's about when it has no note) */
const SND_ROW = { page: x => x.g, count: x => x.knobs.length, narrow: [10, 1.8, 2.6], min: "min-content", edWidth: { sample: 6, rec: 5 },
	lone: x => x.note || about(V.tracks[S.sel].m, Cat) };
function sgRow(list, cls, color) { return soundRow(list, cls, Object.assign({ group: (x, cols, first, note) => sgHtml(x, cols, color, first, note) }, SND_ROW)); }
function renderSound() {
	const t = S.sel, tr = V.tracks[t], l = tr.lfo, at = smpOfMachine(tr.m), color = FAMC[tr.fam];
	const relSel = (id, kind, word) => `<select id="${id}"><option value="">none</option>${V.tracks.map((x, i) => i !== t ? `<option value="${i}" ${tr[kind] === i ? "selected" : ""}>${word} ${i + 1} ${x.name}</option>` : "").join("")}</select>`;
	setClips(tr);
	const [syn, fxrt] = sndGroups(tr);
	[...syn, ...fxrt].forEach(x => { x.plot = sndScreen(x.ed, tr, at, x.knobs.map(n => n.replace(/^SYN·/, ""))); });
	if (!syn.length) syn.push({ key: "syn", title: "Synthesis", g: "syn", knobs: [], n: 0, w: 8, body: `<p class="sgabout">${about(tr.m, Cat) || "This machine has no synthesis knobs."}</p>` });
	else if (!syn.some(x => x.plot)) syn.about = about(tr.m, Cat);
	const lfoTip = "SPD DEPTH SHMIX are LFOS LFOD LFOM on the Machinedrum's ROUTING page; the shapes, the target and UPDTE are its LFO page";
	const shapeRow = sl => `<div class="kv" data-lgf="${sl}"><span class="mono">${sl}</span><div class="shapes">${SHAPES.map((n, i) => `<button data-slot="${sl}" data-shape="${i}" aria-pressed="${l[sl] === i}" title="${n}${sl === "SHP2" ? ", inverted" : ""}" aria-label="${sl} ${n}">${shapeIcon(i, sl === "SHP2")}</button>`).join("")}</div></div>`;
	const lfo = [
		{ key: "lshape", title: `LFO ${t + 1} shape`, g: "lfo", knobs: ["SHMIX"], w: 5, tagTip: lfoTip,
			/* 0.6 wave 4: Copy LFO, Paste LFO, Clear LFO (mdDeskWhat.js) */
			menu: `<button class="lfomenu" data-lfom="1" aria-haspopup="menu" title="Copy, paste or clear LFO ${t + 1}" aria-label="LFO ${t + 1}: copy, paste or clear">⋯</button>`,
			plot: sndPlot(`<canvas class="ed" data-ed="lshape" aria-label="One cycle of the LFO's shape. Drag the dot for SHMIX."></canvas>`, SND_TIP.lshape),
			body: `<div class="sgline lfoshape">${shapeRow("SHP1")}${shapeRow("SHP2")}${pc("lfo", "SHMIX", { color: SND_COL.lfo })}</div>` },
		{ key: "lmotion", title: "LFO motion", g: "lfo", knobs: ["SPD", "DEPTH"], w: 3.4, tagTip: lfoTip,
			plot: sndPlot(`<canvas class="ed" data-ed="lmotion" aria-label="The LFO across one bar. Drag the dot for SPD and DEPTH."></canvas>`, SND_TIP.lmotion),
			body: `<div class="sgline">${pc("lfo", "SPD", { color: SND_COL.lfo })}${clipGap("lfo", "SPD", "DEPTH")}${pc("lfo", "DEPTH", { color: SND_COL.lfo })}<span class="seg" data-set="upd" data-lgf="UPDTE" title="UPDTE: FREE runs on, TRIG restarts it on every trig, HOLD keeps the value a trig takes">${["FREE", "TRIG", "HOLD"].map(u => `<button data-v="${u}" aria-pressed="${l.UPDTE === u}">${u}</button>`).join("")}</span></div>` },
		{ key: "ltarget", title: "LFO target", g: "lfo", knobs: [], w: 2, tagTip: lfoTip,
			body: `<div class="sgsel" title="The parameter this LFO moves: a track, then one of its parameters"><span class="lgw" data-lgf="TRCK"><select id="lfoT">${V.tracks.map((x, i) => `<option value="${i}" ${i === l.TRCK ? "selected" : ""}>T${i + 1} ${x.name}</option>`).join("")}</select></span><span class="lgw" data-lgf="PARAM"><select id="lfoP">${params(l.TRCK).map(p => `<option ${p === l.PARAM ? "selected" : ""}>${p}</option>`).join("")}</select></span></div>` },
		{ key: "rel", title: "Relations", g: "kit", knobs: [], w: 2, tagTip: "Kit relations: EDIT KIT → RELATE",
			body: `<div class="sgsel pair"><label title="Mute group: this track's trig mutes the chosen track, as open and closed hihats.">Mute${relSel("mg", "muteGroup", "mutes")}</label>
			<label title="Trig group: this track's trig also trigs the chosen track. Trig relations do not chain.">Trig${relSel("tg", "trigGroup", "trigs")}</label></div>` }];
	$("#main").innerHTML = `<div class="snd mutating">
  <div class="sndhead">${machButton(tr)}
   <div class="genband mutband" id="mutband" title="The groups follow the sound's path: synthesis, effects, routing, then the LFO and the track's relations. Drag a dot or a box; hold Alt to move the same knob on every track (Control All).">${mutStripHtml()}</div></div>
  ${sgRow(syn, "synrow", color)}
  ${sgRow(fxrt, "fxrow", color)}
  ${sgRow(lfo, "lforow", color)}
 </div>`;
	syncControls(); redraw();
}

/* MD-033: the machine's clips (clipPairs, mdDeskModel.js) on the Sound page. CLIP: {"g:name": its partner} for the
   selected track's machine, set by renderSound. A box of a pair names the other in its tooltip (the page groups the
   knobs by what they do, so a pair can sit in two groups); two boxes side by side get a small arch over the gap
   between them, as the LCD draws it: placed by CSS from the box's column and row in its group (no measuring), in a
   flex line a zero-width mark between the two. */
let CLIP = {};
function setClips(tr) { CLIP = {}; for (const [[g, a], [h, b]] of clipPairs(tr.m, Cat, Enums())) { CLIP[g + ":" + a] = b; CLIP[h + ":" + b] = a; } }
const clipped = (g, a, b) => CLIP[g + ":" + a] === b;
function clipMarks(g, knobs, cols) {
	const rows = Math.ceil(knobs.length / cols); let out = "";
	for (let i = 0; i + 1 < knobs.length; i++) if (i % cols !== cols - 1 && clipped(g, knobs[i], knobs[i + 1]))
		out += `<i class="clipmk" aria-hidden="true" data-pair="${knobs[i]} ${knobs[i + 1]}" style="--c:${i % cols + 1};--n:${cols};--r:${Math.floor(i / cols)};--rows:${rows}"></i>`;
	return out;
}
const clipGap = (g, a, b) => clipped(g, a, b) ? `<i class="clipgap" aria-hidden="true" data-pair="${a} ${b}"></i>` : "";

/* the LFO's shape keys (the router's, mdDeskRender.js CLICKS): true when the click was theirs */
function clickShape(e) {
	const sh = e.target.closest("[data-shape]"); if (!sh) return false;
	sendLfo(S.sel, sh.dataset.slot, +sh.dataset.shape); $$(`[data-slot="${sh.dataset.slot}"]`).forEach(b => b.setAttribute("aria-pressed", b === sh)); redraw(); return true;
}
/* the LFO's target and the track's relations */
document.addEventListener("change", e => {
	const id = e.target.id, v = e.target.value; if (id !== "lfoT" && id !== "lfoP" && id !== "mg" && id !== "tg") return;
	const l = V.tracks[S.sel].lfo;
	if (id === "lfoT") { const p = params(+v).includes(l.PARAM) ? l.PARAM : params(+v)[0]; sendLfo(S.sel, "TRCK", +v); sendLfo(S.sel, "PARAM", p); renderSound(); enhanceSelects($("#main")); }
	if (id === "lfoP") sendLfo(S.sel, "PARAM", v);
	if (id === "mg") sendGroup(S.sel, "mute", v === "" ? null : +v);
	if (id === "tg") sendGroup(S.sel, "trig", v === "" ? null : +v);
});

/* 0.6: Clear (was Revert track; the command stays revertTrack). The selected track's sound (machine, its 24 values, level, LFO and the two relations) goes back
   to how the kit's slot stores it: one command, one undo step. The kit library's Reload does the whole kit; this one
   track. On while the track differs from the slot (the kit's JSON, as the contract makes it: tracks[t] without the LFO's
   running state, which the contract keeps apart). */
const REVERT_KEYS = ["model", "level", "synth", "effects", "routing", "lfo", "trigGroup", "muteGroup"];
function revertFacts(t) {
	const k = V.kit, stored = Docs.kits[k], w = workingKitOf(Docs);
	if (!stored || !w) return { can: false, why: w ? `Kit ${nn(k)} is not read from its slot yet.` : `Nothing to revert: no kit is playing yet.` };
	const a = stored.tracks[t], b = w.doc.tracks[t];
	if (!a || !b) return { can: false, why: "This track is not in the kit." };
	return REVERT_KEYS.every(f => JSON.stringify(a[f]) === JSON.stringify(b[f]))
		? { can: false, why: `Track ${t + 1} is as kit ${nn(k)} stores it.` }
		: { can: true, why: `Put track ${t + 1} back as kit ${nn(k)} stores it: its machine, values, level, LFO and relations. One undo step. The kit library's Reload does the whole kit.` };
}
function revertTip(f, t) { return "Clear: back to the kit's saved sound (one undo)" + (f.can ? "" : `. Track ${t + 1} is as saved.`); }
function revertKey() {
	const f = revertFacts(S.sel);
	return clearKey(f.can, attr(revertTip(f, S.sel)), `Clear track ${S.sel + 1} to the kit's saved sound`);
}
function syncRevert() {
	const b = $("#revert"); if (!b) return;
	const f = revertFacts(S.sel); b.disabled = !f.can; b.title = revertTip(f, S.sel);
}
document.addEventListener("click", e => {
	const b = e.target.closest("#revert"); if (!b || b.disabled) return;
	cmd("revertTrack", { k: V.kit, t: S.sel });
});
