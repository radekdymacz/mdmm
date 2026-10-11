"use strict";
/* Review mockup helpers (DESIGN-machine-menus.md), shared by md.html and mm.html. Not product code: the product
   will draw the same things from skins/shared/. Here: the REVIEW strip, the "show changes" marks, the TEMPO popover,
   the "what" dialog, a toast with a key, the play key's menu, and opening a state from the URL (#s=<id>, for shots). */
const NX = (() => {
	const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
	const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
	let STATES = [], cur = null;

	/* close everything a state may have opened */
	function reset() {
		try { if (typeof DeskMenu !== "undefined") DeskMenu.close(); } catch (_) {}
		try { if (typeof LIB !== "undefined" && LIB.open) closeLib(false); } catch (_) {}
		try { if (typeof closeGlobal === "function") closeGlobal(); } catch (_) {}
		try { if (typeof closePicker === "function") closePicker(); } catch (_) {}
		const d = $("#dlg"); if (d && !d.hidden && d.querySelector(".what")) d.hidden = true;
		tempoClose(); toastKeyClose(); const sp = $("#syxpop"); if (sp) sp.hidden = true; SX.place = "original"; SX.first = { kit: 4, pattern: 32, song: 2, global: 1 };
		NX.onReset && NX.onReset();
	}
	function open(id) {
		const s = STATES.find(x => x.id === id); if (!s) return;
		reset(); cur = id; drawStrip();
		setTimeout(() => { s.open(); drawStrip(); }, 30);
		setTimeout(hideBoot, 40); setTimeout(hideBoot, 600);
	}

	/* the start-up "EMULATOR READY" notice is not part of any review state */
	function hideBoot() { const t = $("#toast"); if (t && /ready|running|starting/i.test(t.textContent)) { t.classList.remove("on"); t.textContent = ""; } }

	/* ---------- the REVIEW strip ---------- */
	let min = false, chg = false;
	function drawStrip() {
		let el = $("#nxrev");
		if (!el) { el = document.createElement("div"); el.id = "nxrev"; el.className = "nxrev"; document.body.appendChild(el);
			el.addEventListener("click", e => {
				const b = e.target.closest("[data-nxs]"); if (b) { open(b.dataset.nxs); return; }
				if (e.target.closest("[data-nxmin]")) { min = !min; drawStrip(); return; }
				if (e.target.closest("[data-nxchg]")) { chg = !chg; document.documentElement.classList.toggle("nxchg", chg); drawStrip(); }
			});
			/* the strip is outside every dialog: its keys work while one is open */
			for (const ev of ["pointerdown", "mousedown"]) el.addEventListener(ev, e => e.stopPropagation(), true);
		}
		const s = STATES.find(x => x.id === cur);
		let grp = "", list = "";
		STATES.forEach((x, i) => { if (x.grp !== grp) { grp = x.grp; list += `<div class="grp">${esc(grp)}</div>`; }
			list += `<button data-nxs="${x.id}" aria-current="${x.id === cur}"><small>${String(i + 1).padStart(2, "0")}</small><span>${esc(x.label)}</span></button>`; });
		el.className = "nxrev" + (min ? " min" : "");
		el.innerHTML = `<div class="nxh"><b>REVIEW</b><button data-nxchg aria-pressed="${chg}" title="Outline what is new">Show changes</button><button data-nxmin title="${min ? "Open" : "Fold"} the strip">${min ? "▴" : "▾"}</button></div>
			<div class="nxlist">${list}</div><div class="nxnote">${s ? `<b>${esc(s.label)}</b> · ${s.note}` : NX.intro}</div>`;
	}
	function init(states, intro) {
		STATES = states; NX.intro = intro;
		const q = new URLSearchParams(location.hash.slice(1));
		chg = q.get("chg") === "1"; document.documentElement.classList.toggle("nxchg", chg);
		if (q.get("min") === "1") min = true;
		drawStrip();
		const want = q.get("s");
		/* wait for the start-up card to go */
		const t0 = Date.now(), wait = () => {
			let booting = typeof Modal !== "undefined" && Modal.kind() === "boot";
			try { if (typeof engReady === "function") booting = booting || !engReady(); else if (S.eng) booting = booting || (S.eng !== "ready" && S.eng !== "hwready"); } catch (_) {}
			if (Date.now() - t0 < 800) booting = true;
			if (booting && Date.now() - t0 < 15000) { setTimeout(wait, 150); return; }
			NX.ready = true; NX.afterBoot && NX.afterBoot();
			if (want) setTimeout(() => open(want), 300);
		};
		wait();
	}

	/* ---------- the TEMPO popover (under the LCD tempo) ---------- */
	let tp = null, nudgeT = 0;
	function tempoOpen(opts) {
		tempoClose();
		const bpm = $("#bpm"), r = bpm.getBoundingClientRect(), v = parseFloat(bpm.textContent) || 120;
		tp = document.createElement("div"); tp.className = "tempopop"; tp.id = "tempopop"; tp.setAttribute("role", "dialog"); tp.setAttribute("aria-label", "Tempo");
		tp.innerHTML = `<div class="th1"><span class="cap">Tempo</span><span class="note">the machine's TEMPO menu</span><button class="libx" data-tp="close" title="Close (Esc)">Esc</button></div>
			<div class="bpmrow"><span class="bpmbig" id="tpv">${v.toFixed(1)}</span><small>BPM</small>
				<button class="sq" data-tp="-1" title="−1 BPM (⇧: −0.1)">−</button><button class="sq" data-tp="1" title="+1 BPM (⇧: +0.1)">+</button>
				<button class="tap" data-tp="tap" title="${(opts && opts.tapTitle) || "Tap the tempo: four taps or more set it"}">TAP</button></div>
			<div class="tr"><span class="ilab">Nudge</span><button data-tp="n-" title="Hold: 10 % slower while held (key -)">◂ −10 %<kbd>-</kbd></button><button data-tp="n+" title="Hold: 10 % faster while held (key =)">+10 % ▸<kbd>=</kbd></button><span class="hold">hold; release = back</span></div>
			<label class="tr"><input type="checkbox" id="tpdelay"${opts && opts.delayed ? " checked" : ""}> Change on release <span class="hold">FUNCTION = ⌥-drag the tempo</span></label>
			${opts && opts.extra ? opts.extra : ""}
			<div class="tnote">Tempo is global on the machine; a pattern does not store it, a song row can.</div>`;
		document.body.appendChild(tp);
		const w = 390, left = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - 40));
		tp.style.left = left + "px"; tp.style.top = (r.bottom + 14) + "px"; tp.style.setProperty("--ax", (r.left + r.width / 2 - left - 7) + "px");
		bpm.closest(".f")?.classList.add("tempof"); bpm.closest(".f")?.setAttribute("aria-expanded", "true");
		tp.addEventListener("click", e => {
			const b = e.target.closest("[data-tp]"); if (!b) return; const a = b.dataset.tp, el = $("#tpv");
			if (a === "close") { tempoClose(); return; }
			if (a === "tap") { b.classList.add("nudging"); setTimeout(() => b.classList.remove("nudging"), 120); return; }
			if (a === "-1" || a === "1") { const nv = (parseFloat(el.textContent) + (+a) * (e.shiftKey ? .1 : 1)).toFixed(1); el.textContent = nv; $("#bpm").textContent = nv; }
			if (opts && opts.onClick) opts.onClick(a, b);
		});
		for (const [ev, on] of [["pointerdown", true], ["pointerup", false], ["pointerleave", false]]) tp.addEventListener(ev, e => {
			const b = e.target.closest('[data-tp="n-"],[data-tp="n+"]'); if (!b && on) return;
			const el = $("#tpv"); clearTimeout(nudgeT);
			if (on) { b.classList.add("nudging"); const base = parseFloat($("#bpm").textContent); el.dataset.base = base; el.textContent = (base * (b.dataset.tp === "n+" ? 1.1 : .9)).toFixed(1); }
			else { tp.querySelectorAll(".nudging").forEach(x => x.classList.remove("nudging")); if (el.dataset.base) { el.textContent = (+el.dataset.base).toFixed(1); delete el.dataset.base; } }
		});
		setTimeout(() => tp && tp.querySelector('[data-tp="tap"]').focus({ preventScroll: true }), 0);
		return tp;
	}
	function tempoClose() { if (!tp) return; tp.remove(); tp = null; const f = $("#bpm")?.closest(".f"); f?.classList.remove("tempof"); f?.setAttribute("aria-expanded", "false"); }
	document.addEventListener("keydown", e => { if (tp && e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); tempoClose(); } }, true);
	document.addEventListener("pointerdown", e => { if (tp && !tp.contains(e.target) && !e.target.closest("#bpm,#nxrev")) tempoClose(); }, true);

	/* ---------- the "what" dialog (COPY / CLEAR / PASTE what: the manual's SUPER COPY / SUPER CLEAR) ---------- */
	function whatOpen(o) {
		const d = $("#dlg"), verb = o.verb, V = verb.toUpperCase();
		const to = o.to ? `<div class="src"><span class="ilab">To tracks</span><span class="to">${o.to.map((t, i) => `<button data-wto="${i}" aria-pressed="${t.on}" title="${esc(t.name)}">${t.label}</button>`).join("")}</span></div>` : "";
		d.innerHTML = `<div class="dlgbox what" role="dialog" aria-modal="true" aria-label="${V} what"><h3>${V} what</h3>
			<div class="src"><span class="ilab">${verb === "paste" ? "From" : "Source"}</span><span class="lcdchip">${esc(o.src)}</span><span>${esc(o.srcNote || "")}</span></div>
			${o.groups.map(g => `<div class="whatgrp"><h4>${esc(g.name)}<small>${esc(g.note || "")}</small></h4><div class="whatgrid">${g.items.map(it => `<label><input type="checkbox"${it.on ? " checked" : ""}${it.dis ? " disabled" : ""}> ${esc(it.label)}${it.n ? `<small>${esc(it.n)}</small>` : ""}</label>`).join("")}</div></div>`).join("")}
			${to}<p class="fine">${o.fine}</p>
			<div class="btnrow"><button class="${verb === "clear" ? "danger" : "cream"}" data-wgo="1">${esc(o.go)}</button><button data-wgo="0">Cancel</button></div></div>`;
		d.hidden = false;
		d.onclick = e => {
			const t = e.target.closest("[data-wto]"); if (t) { t.setAttribute("aria-pressed", t.getAttribute("aria-pressed") !== "true"); return; }
			const g = e.target.closest("[data-wgo]"); if (!g) return; e.stopPropagation();
			d.hidden = true; d.onclick = null; if (g.dataset.wgo === "1" && o.done) o.done();
		};
	}

	/* ---------- a toast with a key ---------- */
	let tk = null;
	function toastKey(text, key, run) {
		toastKeyClose();
		tk = document.createElement("div"); tk.className = "nxtoast"; tk.setAttribute("role", "alert");
		tk.innerHTML = `<span>${esc(text)}</span><button data-tk="go">${esc(key)}</button><button class="x" data-tk="x" aria-label="Dismiss">×</button>`;
		tk.addEventListener("click", e => { const b = e.target.closest("[data-tk]"); if (!b) return; toastKeyClose(); if (b.dataset.tk === "go") run(); });
		document.body.appendChild(tk);
	}
	function toastKeyClose() { if (tk) { tk.remove(); tk = null; } }


	/* ---------- the engine menu: more entries (Import / Export SysEx…, Reset machine…) ---------- */
	function engineItems(items) {
		const sel = $("#engsel"); if (!sel) return;
		const put = () => { for (const [v, t] of items) if (!sel.querySelector(`option[value="${v}"]`)) sel.insertAdjacentHTML("beforeend", `<option value="${v}">${t}</option>`); };
		put(); new MutationObserver(() => put()).observe(sel, { childList: true });
		addEventListener("change", e => {
			if (e.target.id !== "engsel") return; const it = items.find(x => x[0] === e.target.value); if (!it) return;
			e.stopImmediatePropagation(); const btn = document.querySelector(".lcdeng");
			e.target.value = (typeof S !== "undefined" && S.engine) || e.target.options[0].value; if (btn) btn.querySelector("span").textContent = e.target.selectedOptions[0].text;
			it[2]();
		}, true);
	}

	/* ---------- the SysEx panel (deskSyx.js, #syxpop): Export with kinds and ranges; Import gets its PLACE ---------- */
	/* ---------- the SysEx panel (deskSyx.js, #syxpop): Export with kinds and ranges; Import gets its PLACE ---------- */
	function syxExport(o) {
		const pop = $("#syxpop"); if (!pop) return;
		const all = o.all !== false;
		const v = (t, tip) => `<span class="sxv" role="spinbutton" tabindex="0" title="${tip}: drag up or down, the wheel, or click (⇧-click back), as other values">${esc(t)}</span>`;
		const row = k => `<label class="sxrow"><input type="checkbox" data-sxk="${k.id}"${k.on ? " checked" : ""}${k.dis ? " disabled" : ""}><b>${esc(k.label)}</b>
			<span class="sxrng">${k.from ? `${v(k.from, "First")}<i>–</i>${v(k.to, "Last")}` : ""}</span>
			<small>${esc(k.sub || "")}</small>${k.tag ? `<span class="tag">${esc(k.tag)}</span>` : ""}</label>`;
		pop.className = pop.className.replace(/\bsyx-\w+/g, "").trim() + " syx-export";
		pop.classList.toggle("sxallon", all);
		pop.innerHTML = `<div class="libhead syxhead"><span class="cap">Export SysEx</span><span class="lcdchip">${esc(o.model)}</span><span class="syxfile">machine → one .syx file</span><button type="button" class="libx" data-syxgo="close" title="Close (Esc)">Esc</button></div>
			<div class="sxall"><label class="sxrow"><input type="checkbox" data-sxk="all"${all ? " checked" : ""}><b>All</b><span class="sxrng"></span><small>a full backup: every kit, pattern, song and global. Untick to choose kinds and ranges</small></label></div>
			<div class="sxlist">${o.kinds.map(row).join("")}</div>
			<div class="syxfoot"><div class="syxmsg"><p class="syxsum">${esc(all ? o.sumAll : o.sum)}</p></div><div class="btnrow"><button type="button" data-syxgo="close">Cancel</button><button type="button" class="go" data-sx="save">Save .syx…</button></div></div>`;
		pop.hidden = false;
		pop.onchange = e => { if (e.target.dataset.sxk === "all") syxExport(Object.assign({}, o, { all: e.target.checked })); };
	}
	const SX = { place: "original", first: { kit: 4, pattern: 32, song: 2, global: 1 }, orig: null };
	const KN = { kit: "Kits", pattern: "Patterns", song: "Songs", global: "Globals", other: "Other" };
	function syxPlace(slotName) {
		const pop = $("#syxpop"); if (!pop) return;
		/* SPECIFIC PLACE previews the result: each kind's items drawn at their new slots, from the kind's first slot */
		const origPreview = Syx.preview;
		const remap = m => { const c = JSON.parse(JSON.stringify(m)); for (const k of Object.keys(c.items || {})) { if (SX.first[k] == null) continue; c.items[k].sort((x, y) => x.slot - y.slot).forEach((it, i) => { it.slot = SX.first[k] + i; it.overwrites = false; }); } return c; };
		Syx.preview = m => { SX.orig = m; origPreview(SX.place === "specific" ? remap(m) : m); };
		const tabK = () => pop.querySelector(".syxtab.sel")?.dataset.syxtabk || "kit";
		const draw = () => {
			if (pop.querySelector(".syxtabs")) pop.classList.remove("syx-export");
			if (pop.hidden || pop.querySelector(".sxplace") || !pop.querySelector(".syxtools") || pop.classList.contains("syx-export")) return;
			const k = tabK(), f = SX.first[k];
			pop.querySelector(".syxtools").insertAdjacentHTML("beforebegin", `<div class="sxplace nx"><span class="ilab">Place</span>
				<span class="seg">${[["original", "Original place"], ["specific", "Specific place"]].map(([v, t]) => `<button type="button" data-sxp="${v}" aria-pressed="${SX.place === v}">${t}</button>`).join("")}</span>
				${SX.place === "specific" && f != null ? `<span class="sxfirst">${KN[k]} from <button type="button" class="sxv" data-sxf="1" title="Click: the next slot (⇧: back)">${esc(slotName(k, f))}</button></span>` : ""}
				<span class="note">${SX.place === "specific" ? "The grid shows where each item lands. Each kind starts at its own first slot." : "Each item goes back to the slot it came from."}</span></div>`);
			const go = pop.querySelector('[data-syxgo="start"]');
			if (go && !pop.querySelector("[data-sxverify]")) go.insertAdjacentHTML("beforebegin", `<button type="button" class="nx" data-sxverify="1" title="Compare the file with the machine; write nothing">Verify only</button>`);
		};
		const redo = () => { const k = tabK(); if (SX.orig) { origPreview(SX.place === "specific" ? remap(SX.orig) : SX.orig); const t = pop.querySelector(`[data-syxtab="${k}"]`); if (t) t.click(); } pop.querySelector(".sxplace")?.remove(); draw(); };
		new MutationObserver(draw).observe(pop, { childList: true, attributes: true, attributeFilter: ["hidden"] });
		pop.addEventListener("click", e => {
			const b = e.target.closest("[data-sxp]"); if (b) { SX.place = b.dataset.sxp; redo(); return; }
			if (e.target.closest("[data-sxf]")) { const k = tabK(); SX.first[k] = Math.max(0, SX.first[k] + (e.shiftKey ? -1 : 1)); redo(); return; }
			if (e.target.closest("[data-syxtab]")) setTimeout(() => { pop.querySelector(".sxplace")?.remove(); draw(); }, 0);
			if (e.target.closest("[data-sxverify]")) { pop.hidden = true; toast && toast("Verify only: the file matches the machine in 3 of 4 items (example)."); }
			if (e.target.closest('[data-sx="save"]')) { pop.hidden = true; toast && toast("Saved (example)."); }
		});
	}


	/* ---------- the GLOBAL page: main's shared panel (deskGlobal.js + the machine's host) drawn as a full page.
	   Only the review's additions: Copy / Paste / Clear beside the slots, and whatever the editor adds (o.post, o.extra) ---------- */
	function gpHtml(o) {
		const H = typeof DeskGlobal !== "undefined" && DeskGlobal.host, V = H && H.view();
		if (!V) return `<div class="gpage"><div class="gphead"><span class="gpname">Global</span><span class="note">Reading the global settings from the machine…</span></div></div>`;
		let cards = H.cards(V); if (o.post) cards = o.post(cards, V);
		return `<div class="gpage"><div class="gphead" title="${esc(H.menu || "")} on the machine. Every change is stored in the active slot and made active.">
			<span class="gpname">Global</span><span class="lcdchip">GLOBAL ${V.slot + 1}</span>
			<span class="gslots" title="8 global setups; the lit one is active (SysEx 0x56). Click makes it active">${Array.from({ length: 8 }, (_, k) => `<button data-ga="slot" data-v="${k}" aria-pressed="${k === V.slot}">${k + 1}</button>`).join("")}</span>
			<span class="gpkeys nx"><button data-gx="copy" title="Copy global ${V.slot + 1}">Copy</button><button data-gx="paste" title="Paste into the active slot">Paste</button><button class="danger" data-gx="clear" title="Clear the active slot (asks)">Clear</button></span>
			<button data-ga="reset" title="${typeof GRESET_TIP !== "undefined" ? esc(GRESET_TIP) : ""}">Reset to defaults</button>
			<span class="gpsp"></span><button class="gpback" data-gx="close" title="Back to ${esc(o.ws)} (Esc or GLOBAL)">Esc · back to ${esc(o.ws)}</button></div>
			<div class="gpbody"><div class="gpgrid settings">${cards}${o.extra ? o.extra(V) : ""}</div></div></div>`;
	}
	/* a click or change on the page: the panel's own controls go to main's globalClick / host.change; ours to o.on */
	function gpEvents(isOpen, redraw, on) {
		document.addEventListener("click", e => {
			if (!isOpen() || !$("#main").contains(e.target)) return;
			const a = e.target.closest("[data-ga]"); if (a) { globalClick(a); setTimeout(redraw, 0); return; }
			const x = e.target.closest("[data-gx]"); if (x) on(x.dataset.gx, x);
		});
		document.addEventListener("change", e => {
			if (!isOpen()) return; const s = e.target.closest?.("#main [data-gsel]"), H = DeskGlobal.host;
			if (s && H && H.change && H.view()) { H.change(s, H.view()); setTimeout(redraw, 0); }
		});
	}

	/* a context menu at an element (DeskMenu, the modal layer's kind "menu") */
	function menuAt(el, items, title, dx = 0, dy = 0) {
		const r = el.getBoundingClientRect();
		DeskMenu.open(items, r.left + dx, r.bottom + 2 + dy, { title });
	}
	/* mark new elements for "show changes" */
	const mark = (el, inset) => el && el.classList.add(inset ? "nxi" : "nx");

	return { init, open, reset, gpHtml, gpEvents, engineItems, syxExport, syxPlace, tempoOpen, tempoClose, whatOpen, toastKey, toastKeyClose, menuAt, mark, esc, $, $$ };
})();
