"use strict";
/* I-022: type a parameter value (both editors). ⌘-click a value box (Ctrl-click off a Mac), or Enter on a value box that
   has the focus (Tab to it): a field opens over the box with the value as it is shown, selected. Type a value and press
   Enter (or Tab) sets it as one edit (one undo step); Esc, or a click elsewhere, leaves it as it was. Tab with a value
   the box cannot take keeps the field open, marked, as Enter does.
   What may be typed is what the box shows: a number (the nearest value is taken, so 1200 on a box that shows 1196 or
   1210 takes the nearer), a name from a list (a machine, a scale, OFF), as the box writes it, in any case. A number past
   the ends, or a text the box never shows, is refused with the range or the names, and the field stays open. No new
   control: the box itself takes the gesture; double-click is still the default value, a drag still drags.
   The editor gives a host: { range(el) [lo, hi] (the stored values), shown(el, v) the text the box shows for v (or a list:
   the first the box's own, the rest other spellings), get(el), set(el, v), find(el) the box again after a render (or null),
   say(text) }. parse() is pure (deskValueEditTest.js). */
const ValueEdit = (() => {
	const norm = s => String(s).trim().replace(/\s+/g, " ").toLowerCase();
	const tight = s => norm(s).replace(/ /g, "");
	/* a shown text as a number, a unit after it allowed ("12", "+3", "-64", "1.5 s", "50%", "2 bars"); null when the text is
	   not one ("C-4", "1/16", "L12", "OFF") */
	const numOf = s => { const m = /^\s*([+-]?\d+(?:[.,]\d+)?)\s*([a-zµ%°]*)\s*$/i.exec(String(s)); return m ? +m[1].replace(",", ".") : null; };
	const forms = (shown, v) => { const f = shown(v); return Array.isArray(f) ? f.map(String) : [String(f)]; };
	/* text typed -> {v} (a stored value lo..hi) or {error}; empty text: {empty: true} */
	function parse(text, lo, hi, shown) {
		if (!norm(text)) return { empty: true };
		const all = [];
		for (let v = lo; v <= hi; v++) all.push([v, forms(shown, v)]);
		/* 1. as the box writes it (or another spelling the editor gives), any case, spaces aside */
		for (const [v, fs] of all) if (fs.some(f => tight(f) === tight(text))) return { v };
		const nums = [];
		for (const [v, fs] of all) for (const f of fs) { const x = numOf(f); if (x != null) { nums.push([v, x, f]); break; } }
		const x = numOf(text);
		if (nums.length) {
			let min = nums[0], max = nums[0];
			for (const n of nums) { if (n[1] < min[1]) min = n; if (n[1] > max[1]) max = n; }
			if (x == null) return { error: `Not a value of this box: type a number from ${min[2]} to ${max[2]}.` };
			if (x < min[1] - 1e-9 || x > max[1] + 1e-9) return { error: `Out of range: ${min[2]} to ${max[2]}.` };
			/* 2. a number: the value whose number is nearest (ties: the lower stored value) */
			let best = nums[0];
			for (const n of nums) if (Math.abs(n[1] - x) < Math.abs(best[1] - x)) best = n;
			return { v: best[0] };
		}
		const names = all.map(([, fs]) => fs[0]);
		const some = names.length > 6 ? [...names.slice(0, 4), "…", names[names.length - 1]] : names;
		return { error: `Not a value of this box: type one of ${some.join(", ")}.` };
	}

	let cur = null;	/* {el, input, host} while the field is open */
	function open(el, host) {
		close();
		const v = host.get(el);
		if (v == null) { host.say("This value is not known yet."); return false; }
		const r = el.getBoundingClientRect(), w = Math.max(64, r.width);
		const input = document.createElement("input");
		input.type = "text"; input.className = "vedit"; input.spellcheck = false; input.autocomplete = "off";
		input.setAttribute("aria-label", "Type a value for " + (el.getAttribute("aria-label") || "this value") + ", then Enter (Esc: leave it)");
		input.value = forms(v => host.shown(el, v), v)[0];
		Object.assign(input.style, { left: r.left + (r.width - w) / 2 + "px", top: r.top + "px", width: w + "px", height: Math.max(22, r.height) + "px" });
		document.body.appendChild(input);
		cur = { el, input, host };
		input.addEventListener("keydown", e => {
			e.stopPropagation();
			if (e.key === "Enter") { e.preventDefault(); commit(); }
			else if (e.key === "Escape") { e.preventDefault(); close(true); }
			else if (e.key === "Tab") { if (!commit(true)) e.preventDefault(); }	/* refused: the field stays, marked */
			else input.classList.remove("bad");
		});
		input.addEventListener("blur", () => { if (cur && cur.input === input) close(); });
		input.focus(); input.select();
		return true;
	}
	/* Enter (or Tab, leave: the focus moves on): set it (one edit), or say why not and stay open. False: refused */
	function commit(leave) {
		if (!cur) return true;
		const { el, input, host } = cur, box = el.isConnected ? el : host.find(el);
		if (!box) { close(); return true; }
		const [lo, hi] = host.range(box), p = parse(input.value, lo, hi, v => host.shown(box, v));
		if (p.empty) { close(!leave); return true; }
		if (p.error) { input.classList.add("bad"); input.title = p.error; host.say(p.error); input.select(); return false; }
		close(!leave);
		if (host.get(box) !== p.v) host.set(box, p.v);
		return true;
	}
	/* the field goes; refocus: the box takes the focus back (Enter opens the field again) */
	function close(refocus) {
		if (!cur) return;
		const { el, input, host } = cur; cur = null;
		input.remove();
		if (refocus) { const box = el.isConnected ? el : host.find(el); box?.focus?.({ preventScroll: true }); }
	}
	/* the gesture, from the editor's pointerdown on a value box: ⌘-click (Ctrl-click off a Mac), no other modifier */
	const isOpenClick = e => e.button === 0 && typeof Modifiers !== "undefined" && Modifiers.cmd(e) && !e.altKey && !e.shiftKey;
	return { parse, open, commit, close, isOpenClick, get editing() { return cur ? cur.el : null; } };
})();
if (typeof module !== "undefined") module.exports = { ValueEdit };
