"use strict";
/* User journeys (diagnostics builds only, like the self-tests): a journey is what a person does with the
   editor, as data. Each step is a value {say, act, screen, machine, within}:
     say      what the person does, in words (the log line)
     act      async (u, c): the doing, only through the page's own controls (u: clicks, keys, drags and the wheel
              at an element's centre, refused when something else covers it); c is the journey's own scratch value
     screen   (c) => true, or what was seen instead: what the page shows afterwards
     machine  (c) => true, or what was seen instead: what the plug-in's documents (the firmware's read-back) say
     within   how long the two may take to agree (ms, default 6000)
   A journey is {name, proves, steps, tidy, boot, needs, alone}: proves (read by scripts/mdmm-features-check.mjs, never by the runner) lists the feature rows it proves, ["MD-107"]; [] for a journey of the page itself (boot, focus, layout, screenshots); needs (optional) () => why it cannot run here, or null (it is then
   logged "JOURNEY <name> SKIP <why>", neither passed nor failed); tidy (async, optional) puts back what the steps changed and runs pass or
   fail; boot: true runs it from the page's start, before the machine takes input (the start-up card); alone: true says its change cannot be
   put back (the product has no undo for it: an empty reset): the runners (scripts/mdmm-page.mjs, mdmm-journeys.sh) start it in an editor of its own, and in one page it plays last.
   One runner (Journey.run) plays them in order, logs a line per step, then "JOURNEY <name> PASS|FAIL <reason>"
   and at the end "JOURNEYS DONE <passed>/<run>". The editors' pages pass their journeys and a ready test
   (mdDeskJourneys.js, mmJourneys.js). Chosen by ?selftest=journey (all) or journey-<names>: comma-separated,
   * matches any run of characters (journey-seq-*, journey-md-seq-first-beat,md-mix-*); "@k/n" after either takes every
   n-th of those, from the k-th (journey@2/4: scripts/mdmm-journeys.sh --jobs 4 gives each of its editors a share);
   "~<tiers>" before it keeps the journeys of those tiers (journey~host, journey-seq-*~page; TIERS below).
   Demos (doc/modern-ux/DEMO-VIDEOS.md) are journeys too, played for a camera: ?selftest=demo-<names> (demo-md-*) runs
   them through Journey.demo at a person's pace, with a drawn pointer that glides to each control and rings on a click,
   and a key cap for each key. A step may also have caption (a line for the video, logged with its time) and hold (ms
   to wait after the step passed, so the machine is heard). A step may have section (its part of the song, for the video's timeline). A demo may have setup (steps played before the camera
   starts, so the video opens on the machine already playing) and card ("name|line|url", the video's end card). The video script (scripts/mdmm-demo-video.sh) starts
   recording on "DEMO READY" and cuts the video by the log's "DEMO <name> START" and "DEMO <name> at <ms> …" lines. */
const Journey = (() => {
	const sleep = ms => new Promise(r => setTimeout(r, ms));
	const until = async (f, ms) => { const end = performance.now() + ms; while (performance.now() < end) { if (f()) return true; await sleep(40); } return !!f(); };
	/* a check's answer: true passes; anything else is what was seen */
	const ok = (pass, seen) => pass ? true : (seen == null ? "no" : String(seen));
	/* a log of what the page sent or heard, newest last, the oldest dropped past cap. A journey that asks "what went out
	   since now" marks it (mark(): how many were ever added) and reads since(mark): marking by length found nothing once
	   the log was full (it stays at cap), so md-top-tempo-release and the like failed after enough earlier journeys */
	const recent = cap => { const a = []; a.total = 0;
		a.add = x => { a.push(x); a.total++; if (a.length > cap) a.shift(); };
		a.mark = () => a.total;
		a.since = n => { const k = a.total - n; return k <= 0 ? [] : a.slice(Math.max(0, a.length - k)); };
		return a; };
	const describe = el => !el ? "nothing" : (el.id ? "#" + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : ""));

	/* ---------- the drawn pointer (demos only) ---------- */
	/* A demo is filmed: synthetic events have no visible pointer, so one is drawn. It never takes a hit test
	   (pointer-events: none), so the hands' covered-element check is the same with it on screen. Off unless a demo runs. */
	const Pointer = (() => {
		let dot = null, at = null, keycap = null, keyTimer = 0;
		const style = (e, css) => { e.style.cssText = css; return e; };
		function ensure() {
			if (dot) return dot;
			dot = style(document.createElement("div"), "position:fixed;left:0;top:0;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;"
				+ "background:rgba(255,255,255,.28);border:2px solid rgba(255,255,255,.95);box-shadow:0 0 0 2px rgba(0,0,0,.45),0 3px 12px rgba(0,0,0,.45);"
				+ "pointer-events:none;z-index:2147483647;transition:transform 450ms cubic-bezier(.3,.7,.2,1),background 120ms;will-change:transform");
			dot.id = "journey-pointer";
			document.body.appendChild(dot);
			return dot;
		}
		function place(x, y, ms) { const d = ensure(); d.style.transitionDuration = `${ms}ms, 120ms`; d.style.transform = `translate(${x}px, ${y}px)` + (d.dataset.down ? " scale(.78)" : ""); at = { x, y }; }
		return {
			on: false,
			/* glide to a point (ms: at most this long), resolved when there */
			async glide(x, y, ms = 520) {
				if (!at) { at = { x: innerWidth / 2, y: innerHeight / 2 }; place(at.x, at.y, 0); await sleep(30); }
				const dist = Math.hypot(x - at.x, y - at.y), t = Math.round(Math.min(ms, 180 + dist * 0.9));
				place(x, y, t); await sleep(t + 40);
			},
			move(x, y) { if (this.on) place(x, y, 40); },
			down(x, y, isDown) {
				if (!this.on) return;
				const d = ensure(); if (isDown) d.dataset.down = "1"; else delete d.dataset.down;
				d.style.background = isDown ? "rgba(255,190,60,.55)" : "rgba(255,255,255,.28)"; place(x, y, 60);
			},
			/* a ring where a click lands */
			ring(x, y) {
				if (!this.on) return;
				this.move(x, y);
				const r = style(document.createElement("div"), `position:fixed;left:${x}px;top:${y}px;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;`
					+ "border:3px solid rgba(255,190,60,.95);pointer-events:none;z-index:2147483646;transform:scale(.4);opacity:1;transition:transform 520ms ease-out,opacity 520ms ease-out");
				document.body.appendChild(r);
				requestAnimationFrame(() => requestAnimationFrame(() => { r.style.transform = "scale(1.6)"; r.style.opacity = "0"; }));
				setTimeout(() => r.remove(), 800);
			},
			/* the key pressed, as a key cap at the window's bottom right (the video's captions go bottom centre) */
			key(label) {
				if (!this.on) return;
				if (!keycap) {
					keycap = style(document.createElement("div"), "position:fixed;right:28px;bottom:28px;padding:10px 22px;border-radius:12px;"
						+ "background:rgba(10,10,12,.85);color:#fff;font:700 26px/1.1 -apple-system,system-ui,sans-serif;letter-spacing:.04em;border:1px solid rgba(255,255,255,.25);"
						+ "box-shadow:0 6px 24px rgba(0,0,0,.45);pointer-events:none;z-index:2147483647;transition:opacity 200ms;opacity:0");
					document.body.appendChild(keycap);
				}
				keycap.textContent = label; keycap.style.opacity = "1";
				clearTimeout(keyTimer); keyTimer = setTimeout(() => { keycap.style.opacity = "0"; }, 1100);
			}
		};
	})();
	const keyLabel = (key, m = {}) => (m.cmd ? "⌘ " : "") + (m.alt ? "⌥ " : "") + (m.shift && key.length > 1 ? "⇧ " : "")
		+ ({ " ": "Space", Escape: "Esc", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Delete: "Del", Backspace: "⌫", Enter: "↵" }[key] || (key.length === 1 ? key.toUpperCase() : key));

	/* ---------- the person's hands ---------- */
	/* the element itself (a selector or a node), on screen and on top at the point used */
	function el(q) {
		const e = typeof q === "string" ? document.querySelector(q) : q;
		if (!e) throw new Error("not on the page: " + q);
		return e;
	}
	function pointIn(e, fx = 0.5, fy = 0.5) {
		e.scrollIntoView?.({ block: "nearest", inline: "nearest" });
		const r = e.getBoundingClientRect();
		if (r.width < 1 || r.height < 1) throw new Error("not shown: " + describe(e));
		const x = r.left + r.width * fx, y = r.top + r.height * fy, top = document.elementFromPoint(x, y);
		if (!top || (top !== e && !e.contains(top))) throw new Error(`${describe(e)} is covered by ${describe(top)}`);
		return { x, y };
	}
	/* the macOS plug-in: WKWebView over the page file (not a browser, not WebView2), with mdOsKeys.h behind the log */
	const osKeys = () => typeof BridgeTransport !== "undefined" && BridgeTransport.up() && location.protocol === "file:"
		&& !(window.chrome && window.chrome.webview) && /Mac/.test(navigator.platform);
	const mods = (m = {}) => ({ shiftKey: !!m.shift, altKey: !!m.alt, metaKey: !!m.cmd, ctrlKey: !!m.ctrl });
	const pe = (type, target, x, y, m, buttons) => target.dispatchEvent(new PointerEvent(type, Object.assign({ bubbles: true, cancelable: true, composed: true,
		pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, buttons, clientX: x, clientY: y }, mods(m))));
	const me = (type, target, x, y, m, buttons, detail = 1) => target.dispatchEvent(new MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, composed: true,
		button: 0, buttons, clientX: x, clientY: y, detail, view: window }, mods(m))));
	/* Alt held by an Alt chord of the journey (u.key with alt): the pages' rotate run (MM) stays open until Alt is seen up, and takes every edit after it into one undo
	   step; a person lets go of it, so the runner does when the steps are done, before the tidy (see JOURNEYS.md, "Independent journeys") */
	let altHeld = false;
	const releaseAlt = () => { if (!altHeld) return; altHeld = false;
		document.dispatchEvent(new KeyboardEvent("keyup", { key: "Alt", code: "AltLeft", bubbles: true, cancelable: true, composed: true })); };
	const u = {
		el, sleep, until,
		/* demos: the drawn pointer glides to the element's point first (nothing is pressed); nothing otherwise */
		async glide(q, fx, fy, ms) { if (!Pointer.on) return; const { x, y } = pointIn(el(q), fx, fy); await Pointer.glide(x, y, ms); },
		/* demos: a key cap shown without a key sent (a held modifier); nothing otherwise */
		cap(label) { Pointer.key(label); },
		/* a mouse click at the element's centre (or at fx, fy of its box): down, up, click, as the browser sends them */
		click(q, m = {}, fx, fy) {
			const e = el(q), { x, y } = pointIn(e, fx, fy), t = document.elementFromPoint(x, y);
			Pointer.ring(x, y);
			pe("pointerdown", t, x, y, m, 1); me("mousedown", t, x, y, m, 1);
			pe("pointerup", t, x, y, m, 0); me("mouseup", t, x, y, m, 0);
			/* a browser sends no click to a disabled control (a synthetic one would reach the page's click routers: the
			   Paste what dialog's go key, off while nothing is ticked, sent an empty paste the core refused) */
			const off = t.closest?.("button:disabled,input:disabled,select:disabled,textarea:disabled");
			if (!off) me("click", t, x, y, m, 0);
			else if (runLog) runLog(`hands: no click on ${describe(off)}${off.textContent ? ' "' + off.textContent.trim().slice(0, 40) + '"' : ""}: it is disabled (a browser sends none)`);
		},
		/* a right-click at the element's centre: the second button down and up, then the contextmenu event the browser
		   sends (a step's menu, DESIGN-keymap.md K3) */
		rightClick(q, m = {}, fx, fy) {
			const e = el(q), { x, y } = pointIn(e, fx, fy), t = document.elementFromPoint(x, y);
			Pointer.ring(x, y);
			const o = (type, buttons) => Object.assign({ bubbles: true, cancelable: true, composed: true, button: 2, buttons, clientX: x, clientY: y, view: window }, mods(m));
			t.dispatchEvent(new PointerEvent("pointerdown", Object.assign(o("pointerdown", 2), { pointerId: 1, pointerType: "mouse", isPrimary: true })));
			t.dispatchEvent(new MouseEvent("mousedown", o("mousedown", 2)));
			t.dispatchEvent(new MouseEvent("contextmenu", o("contextmenu", 2)));
			t.dispatchEvent(new PointerEvent("pointerup", Object.assign(o("pointerup", 0), { pointerId: 1, pointerType: "mouse", isPrimary: true })));
			t.dispatchEvent(new MouseEvent("mouseup", o("mouseup", 0)));
		},
		dblclick(q, m = {}) { u.click(q, m); const e = el(q), { x, y } = pointIn(e); me("dblclick", document.elementFromPoint(x, y), x, y, m, 0, 2); },
		/* a press and drag: from the element's point through each [dx, dy] offset (or element), released at the last */
		async drag(q, path, m = {}, o = {}) {
			const e = el(q), a = pointIn(e, o.fx, o.fy), down = document.elementFromPoint(a.x, a.y);
			/* pointer capture as the browser keeps it: the element the page captured gets the moves and the release,
			   even when a redraw replaced the element pressed (a synthetic pointer has no real capture) */
			let captured = null; const cap0 = Element.prototype.setPointerCapture;
			Element.prototype.setPointerCapture = function () { captured = this; };
			let at = a, up = null;
			const target = () => o.captured === false ? (document.elementFromPoint(at.x, at.y) || document.body)
				: captured && captured.isConnected ? captured : down.isConnected ? down : document.body;
			try {
				Pointer.down(a.x, a.y, true);
				pe("pointerdown", down, a.x, a.y, m, 1); me("mousedown", down, a.x, a.y, m, 1);
				for (const p of path) {
					at = Array.isArray(p) ? { x: a.x + p[0], y: a.y + p[1] } : pointIn(el(p));
					const over = document.elementFromPoint(at.x, at.y) || document.body;
					Pointer.move(at.x, at.y);
					pe("pointermove", target(), at.x, at.y, m, 1); me("mousemove", over, at.x, at.y, m, 1);
					await sleep(o.stepMs ?? 30);
				}
				up = target();
				pe("pointerup", up, at.x, at.y, m, 0); me("mouseup", up, at.x, at.y, m, 0);
			} finally { Element.prototype.setPointerCapture = cap0; Pointer.down(at.x, at.y, false); }
			/* the click a browser sends after a press and release: to the nearest element holding both the one pressed and the
			   one released (a drag that ends elsewhere clicks their common parent, never the element under the end point) */
			if (o.click !== false) { let c = down.isConnected ? down : up; while (c && up && !c.contains(up)) c = c.parentElement; me("click", c || document.body, at.x, at.y, m, 0); }
			await sleep(o.settle ?? 150);
		},
		/* an HTML drag and drop (draggable=true): dragstart on the source, dragover and drop on the target, dragend,
		   with one DataTransfer as the browser hands it */
		async dragDrop(from, to) {
			const a = el(from), b = el(to), pa = pointIn(a), pb = pointIn(b);
			let dt = null; try { dt = new DataTransfer(); } catch (_) { const d = {}; dt = { effectAllowed: "all", dropEffect: "none", setData: (k, v) => { d[k] = v; }, getData: k => d[k] ?? "", types: [], files: [] }; }
			const de = (type, target, p) => { const e = new DragEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: p.x, clientY: p.y, dataTransfer: dt });
				if (!e.dataTransfer) Object.defineProperty(e, "dataTransfer", { value: dt }); return target.dispatchEvent(e); };
			const src = document.elementFromPoint(pa.x, pa.y), dst = document.elementFromPoint(pb.x, pb.y);
			de("dragstart", src, pa); await sleep(30);
			de("dragenter", dst, pb); de("dragover", dst, pb); await sleep(30);
			de("drop", dst, pb); de("dragend", src, pb); await sleep(150);
		},
		/* scroll wheel notches over the element (up: positive n) */
		wheel(q, n, m = {}) {
			const e = el(q), { x, y } = pointIn(e), t = document.elementFromPoint(x, y);
			for (let i = 0; i < Math.abs(n); i++) t.dispatchEvent(new WheelEvent("wheel", Object.assign({ bubbles: true, cancelable: true, deltaY: n > 0 ? -100 : 100, clientX: x, clientY: y }, mods(m))));
		},
		/* a key pressed and let go where the focus is (key: "a", "Delete", " "; code when it matters), with the
		   browser's default action on a focused button */
		key(key, m = {}, code) {
			if (m.alt) altHeld = true;	/* a chord's Alt is never let go by the hands: the runner lets it go when the journey ends (releaseAlt) */
			const t = document.activeElement && document.activeElement !== document.documentElement ? document.activeElement : document.body;
			const c = code || (key.length === 1 ? (/[a-z]/i.test(key) ? "Key" + key.toUpperCase() : /[0-9]/.test(key) ? "Digit" + key : key === " " ? "Space" : "") : key);
			const o = Object.assign({ key, code: c, bubbles: true, cancelable: true, composed: true }, mods(m));
			Pointer.key(keyLabel(key, m));
			const go = t.dispatchEvent(new KeyboardEvent("keydown", o));
			/* the browser's own default action on a focused button: Enter clicks it on keydown, Space on keyup, unless
			   the page prevented the keydown (a synthetic event has no default action, so it is done here) */
			const button = t.closest?.("button,[role=button]") && !t.disabled;
			if (go && button && key === "Enter") t.click();
			t.dispatchEvent(new KeyboardEvent("keyup", o));
			if (go && button && key === " ") t.click();
		},
		/* keys as the operating system delivers them (spec: "focus cmd+c", tokens as mdOsKeys.h reads them): in the
		   macOS plug-in real key events routed as AppKit routes them (the window's views and JUCE, the menu bar, the
		   first responder), so a key the host side keeps from the page is kept here too; "focus" is what a click on the
		   page does to the web view, "activate" what JUCE does when the window becomes the key window (B-018). Elsewhere (a
		   browser, Windows) the page's own keys (u.key), "focus" and "activate" nothing. */
		async osKey(spec) {
			const toks = spec.split(/\s+/).filter(Boolean);
			Pointer.key(toks.filter(t => t !== "focus" && t !== "activate").join(" "));
			if (osKeys()) { Bridge.log("oskeys " + spec); await sleep(350); return; }
			for (const t of toks) {
				if (t === "focus" || t === "activate") continue;
				const p = t.split("+"), k = p.pop(), m = Object.fromEntries(p.map(x => [x, true]));
				u.key({ escape: "Escape", delete: "Delete", space: " ", return: "Enter", tab: "Tab" }[k] || k, m);
			}
		},
		/* a value typed into a field and committed (input events per character, then change) */
		type(q, text) {
			const e = el(q); e.focus(); e.value = "";
			for (const ch of text) { e.value += ch; e.dispatchEvent(new InputEvent("input", { bubbles: true, data: ch, inputType: "insertText" })); }
			e.dispatchEvent(new Event("change", { bubbles: true }));
		},
		/* a key-style dropdown (the page's own popup list for a hidden <select>): its key, then the option */
		async pick(id, value) { u.click(`.kselbtn[data-for="${id}"]`); await sleep(150); u.click(`#kpop .kopt[data-v="${value}"]`); await sleep(150); },
		/* a <select> set as the person picks from it */
		choose(q, value) { const e = el(q); e.focus(); e.value = String(value); e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); }
	};

	/* ---------- where each journey runs (doc/release/DEV-CYCLE.md) ---------- */
	/* Every journey has a tier, as data, by its name without "md-" / "mm-" (both editors share the names):
	     page     the default: the page and the documents only. Its "machine" checks read the documents, which the core
	              answers (decision 2026-10-11: the firmware's side is proven by the command -> firmware tests and the
	              machine journeys), so it runs in the page tier (scripts/mdmm-page.mjs: headless Chrome, a stub host)
	     machine  needs the firmware or the native editor: boot, playing, recording, the sampler, SysEx and file drops,
	              the engine and ROM cards, real OS keys, the audio panel, WebKit's own layout; and tap tempo (it times
	              key presses, so it runs where nothing else does)
	     host     a machine journey that also depends on the plug-in host (standalone or VST3): the only ones the VST3
	              host runs (decision 2026-10-11) */
	const TIERS = {
		host: ["boot-card", "keys-space-play", "seq-os-copy-paste", "keys-os-help", "dev-speedups", "top-cpu-meter", "lcd-volume",
			"top-editor-menu", "engine-rom-card", "song-playhead"],
		machine: ["seq-first-beat", "seq-queue-while-playing", "seq-live-record", "seq-grid-record", "sampler-setup-undo", "sampler-audition",
			"sampler-ram-view", "sampler-setup-chop", "lib-syx-import", "lib-syx-import-mute", "song-mode", "keys-play-notes", "keys-black-keys",
			"perform-keyboard", "engine-hw-no-machine", "global-tempo-out", "audio-panel", "drop-syx", "drop-sample", "old-webkit",
			"sound-machine-stays", "engine-reset-factory", "real-factory-songs", "real-factory-patterns", "real-sequence-plays",
			/* they time key presses against the journey's clock: in the page tier, beside the gate's busy lane 1, the page
			   and the journey's clock drifted apart by several per cent (2026-10-11) */
			"keys-tap-tempo", "keys-tap-tempo-b", "keys-tap-tempo-shift", "shots", "shots-cpu", "shots-global", "shots-import", "shots-menu", "shots-song", "shots-sound", "shots-views"]
	};
	const tierOf = j => j.tier || Object.keys(TIERS).find(k => TIERS[k].includes(j.name.replace(/^(md|mm)-/, ""))) || "page";
	/* a selector's "~tiers" (journey~page, journey-seq-*~machine): page; machine (machine and host); host; any of
	   several joined by "+" */
	const inTier = (j, want) => want.split("+").some(w => w === "machine" ? tierOf(j) !== "page" : tierOf(j) === w);

	/* ---------- the runner ---------- */
	/* the journeys (what: "journey") or demos ("demo") this page was asked for: null when none */
	/* Fisher-Yates over mulberry32: the same seed, the same order, in every browser */
	function shuffled(list, seed) {
		let a = seed >>> 0; const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
		const out = list.slice();
		for (let i = out.length - 1; i > 0; i--) { const k = Math.floor(rnd() * (i + 1)); [out[i], out[k]] = [out[k], out[i]]; }
		return out;
	}
	let e2eMode = false, listMode = false, shuffleSeed = null, current = "", shots = 0;
	function wanted(all, what = "journey") {
		const m = location.search.match(new RegExp(`[?&]selftest=(${what}[^&]*)`)); if (!m) return null;
		let kind = decodeURIComponent(m[1]);
		/* ":e2e" at the very end (scripts/mdmm-e2e.sh): the evidence run: each journey leaves a snapshot of the page at its
		   proof moment (its own, or one of its last step, "e2e-<journey>"; "e2e-<journey>-fail" where it failed), and
		   logs "JOURNEY <name> SHOT <name>" for each, so scripts/mdmm-e2e.mjs can put a picture to each feature row */
		e2eMode = /:e2e$/.test(kind); if (e2eMode) kind = kind.replace(/:e2e$/, "");
		/* ":list" at the end: only the names are logged ("JOURNEYS list: ..."), nothing runs (scripts/mdmm-page.mjs --isolate asks for them).
		   ":shuffle-<seed>" (an integer): the chosen journeys run in a seeded random order, the seed logged, so an order that
		   fails can be played again (doc/modern-ux/JOURNEYS.md, "Independent journeys"). Either may come before ":e2e". */
		listMode = false; shuffleSeed = null;
		for (let m; (m = kind.match(/:(list|shuffle-\d+)$/));) { if (m[1] === "list") listMode = true; else shuffleSeed = +m[1].slice(8); kind = kind.slice(0, m.index); }
		e2eMode = e2eMode || /:e2e$/.test(kind); if (/:e2e$/.test(kind)) kind = kind.replace(/:e2e$/, "");
		/* "@k/n" at the end (scripts/mdmm-journeys.sh --jobs n runs n editors at once): every n-th of the chosen ones,
		   from the k-th, so the n editors share them without a list of names */
		const shard = kind.match(/@(\d+)\/(\d+)$/);
		if (shard) kind = kind.slice(0, shard.index);
		/* "~tiers" before it: only the journeys of those tiers */
		const tier = kind.match(/~([a-z+]+)$/);
		if (tier) kind = kind.slice(0, tier.index);
		/* the order first, then the shard: n editors sharing one seed play the same order, each its share */
		const take = list => { if (tier) list = list.filter(j => inTier(j, tier[1])); if (shuffleSeed != null) list = shuffled(list, shuffleSeed);
			/* a journey that cannot put back what it changes (alone: true) plays last: nothing after it meets the damage */
			list = [...list.filter(j => !j.alone), ...list.filter(j => j.alone)]; return shard ? list.filter((_, i) => i % +shard[2] === +shard[1] - 1) : list; };
		if (kind === what) return take(all);
		/* "!name" in the list leaves those out (journey-*,!md-lib-syx-place: all but that one) */
		const words = kind.slice(what.length).replace(/^-/, "").split(",").filter(Boolean);
		const rx = p => new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
		const pats = words.filter(p => !p.startsWith("!")).map(rx), nots = words.filter(p => p.startsWith("!")).map(p => rx(p.slice(1)));
		/* a name matches whole, or without its "demo-" and its "md-"/"mm-" (demo-md-groove: md-groove, groove) */
		const forms = n => { const bare = n.replace(new RegExp(`^${what}-`), ""); return [n, bare, bare.replace(/^(md|mm)-/, "")]; };
		let chosen = all.filter(j => pats.some(r => forms(j.name).some(f => r.test(f))) && !nots.some(r => forms(j.name).some(f => r.test(f))));
		/* a list of names, none with a "*", plays in the order given (to replay the order a run found a journey failing in) */
		if (shuffleSeed == null && words.length && words.every(p => !p.includes("*") && !p.startsWith("!"))) { const at = j => pats.findIndex(r => forms(j.name).some(f => r.test(f))); chosen = chosen.slice().sort((a, b) => at(a) - at(b)); }
		return take(chosen);
	}
	/* film: {t0} when a demo is filmed (its steps' times are logged against t0) */
	/* The evidence run's watch (":e2e"): what a person must never read on the page, looked for after each step in the toast, the
	   error line and the question: the program's own words (an undefined, a NaN, an object, a stack, a validation or contract
	   message), and a question whose buttons something covers (a click outside lost it: the person cannot answer). */
	const LEAK = /\bundefined\b|\bNaN\b|\[object|TypeError|ReferenceError|RangeError|is not a function|not a function|cannot read|schema|validation|invalid command|unknown op\b|\$\{|\.js:\d+|\bnull\b/i;
	function e2eLeaks() {
		const out = [], q = x => document.querySelector(x);
		for (const id of ["#toast", "#errline"]) { const e = q(id); const t = e && !e.hidden ? e.textContent.trim() : ""; if (t && LEAK.test(t)) out.push(`${id} "${t.slice(0, 120)}"`); }
		const d = q("#dlg");
		if (d && !d.hidden && d.dataset.first !== "1") {
			if (LEAK.test(d.textContent)) out.push(`#dlg "${d.textContent.trim().slice(0, 120)}"`);
			for (const b of d.querySelectorAll("[data-dlg]")) {
				const r = b.getBoundingClientRect(); if (r.width < 1) continue;
				const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
				if (!top || !d.contains(top)) { out.push(`the question's button "${b.textContent.trim()}" is covered by ${describe(top)}`); break; }
			}
		}
		return out;
	}
	let hooks = null;	/* the page's hooks of the running journeys (begin) */
	/* What the editor sends the machine (the CC, NRPN, note or SysEx on the cable) is seen only in the page tier: its stub
	   host hands the device edge's messages back ({type: "wire"}); the plug-in reports none (I-027, deferred). On the
	   firmware a step marked pageOnly ("why") is skipped and said so, and noWire() (true there) lets a step drop its wire
	   check and keep the others; its ok line then says the wire was not checked. */
	const pageTier = () => typeof window !== "undefined" && !!window.gmDev;
	let wireSkipped = false;
	function noWire() { if (pageTier()) return false; wireSkipped = true; return true; }
	async function runOne(j, log, context, film, c0) {
		const c = c0 || {}, n = j.steps.length;
		/* where the page's undo and its modes stood when the journey began (page.begin(c) sets c.back0: the undo depth and what else the page restores): the journey's
		   tidy puts them back with the page's own helper (back(u, c)) */
		try { if (hooks?.begin) hooks.begin(c); } catch (_) { }
		let reason = "";
		/* what the journey needs that this run may not have (the window on screen): it is skipped, not failed */
		current = j.name; shots = 0; altHeld = false;
		const missing = j.needs ? await j.needs() : null;	/* may be async: what it needs may still be on its way */
		if (missing) { log(`JOURNEY ${j.name} SKIP ${missing}`); return "skip"; }
		for (let i = 0; i < n && !reason; i++) {
			const st = j.steps[i], t0 = performance.now(), head = `JOURNEY ${j.name} ${i + 1}/${n}`;
			if (st.pageOnly && !pageTier()) { log(`${head} skip ${st.say}: ${st.pageOnly} (page tier only)`); continue; }
			wireSkipped = false;
			if (film) log(`DEMO ${j.name} at ${Math.round(t0 - film.t0)} step ${i + 1}/${n}${st.section ? " section " + st.section : ""}${st.caption ? " caption " + st.caption : ""}`);
			try { if (st.act) await st.act(u, c); }
			catch (e) { reason = `step ${i + 1} "${st.say}": could not do it: ${e.message}`; log(`${head} FAIL ${st.say}: could not do it: ${e.message}${context ? " (page: " + context() + ")" : ""}`); break; }
			let scr = true, mac = true;
			const both = () => {
				try { scr = st.screen ? st.screen(c) : true; } catch (e) { scr = "check threw: " + e.message; }
				try { mac = st.machine ? st.machine(c) : true; } catch (e) { mac = "check threw: " + e.message; }
				return scr === true && mac === true;
			};
			const pass = await until(both, st.within ?? 6000);
			const ms = Math.round(performance.now() - t0);
			if (e2eMode && !film) for (const l of e2eLeaks()) { c.leaks = c.leaks || []; if (!c.leaks.includes(l)) { c.leaks.push(l); log(`JOURNEY ${j.name} LEAK step ${i + 1}: ${l}`); } }
			if (pass) { log(`${head} ok ${st.say} (${ms} ms)${c.note ? " · " + c.note : ""}${wireSkipped ? " · what is sent to the machine not checked here (page tier only, I-027)" : ""}`); c.note = ""; if (st.hold) await sleep(st.hold); continue; }
			let around = ""; try { around = context ? context() : ""; } catch (_) { }
			const seen = [scr !== true ? "screen: " + scr : "", mac !== true ? "machine: " + mac : "", around ? "page: " + around : ""].filter(Boolean).join("; ");
			reason = `step ${i + 1} "${st.say}": ${seen}`;
			log(`${head} FAIL ${st.say} after ${ms} ms: ${seen}`);
		}
		if (e2eMode && !film && !reason && c.leaks?.length) reason = `internal text or an unreachable question: ${c.leaks.join(" | ")}`;
		if (e2eMode && !film) {
			/* the proof moment: where the journey ended (its failing step's page where it failed), before the tidy puts things back */
			if (reason) { try { snapshot(`e2e-${j.name}-fail`); } catch (e) { log(`JOURNEY ${j.name} e2e snapshot: ${e.message}`); } }
			else if (!shots) { try { await sleep(250); snapshot(`e2e-${j.name}`); } catch (e) { log(`JOURNEY ${j.name} e2e snapshot: ${e.message}`); } }
		}
		releaseAlt();
		if (j.tidy) { try { await j.tidy(u, c); } catch (e) { log(`JOURNEY ${j.name} tidy: ${e.message}`); } }
		log(`JOURNEY ${j.name} ${reason ? "FAIL " + reason : "PASS"}`);
		return !reason;
	}
	/* Whatever an earlier journey left open (a dialog, a panel, the editor menu or the CPU details: the modal layer's
	   stack, deskModal.js) is closed before the next one, by Esc as a person would, and said: what was closed, or what
	   stays open. Without it one journey's open details covered the next journeys' controls (0.5.1 gate: md-dev-speedups
	   then md-lcd-volume). The start-up card is not closed here (only the machine closes it). */
	async function closeLeftOpen(fix = true) {
		const open = () => typeof Modal === "undefined" ? [] : Modal.open().filter(id => id !== "bootcard");
		const was = open(); if (!was.length) return "";
		if (!fix) return `left open: ${was.join(", ")}`;
		for (let i = 0; i < 6 && open().length; i++) {
			const n = open().length;
			if (Modal.top() === "deskmenu" && typeof closeDeskMenu === "function") closeDeskMenu(); else u.key("Escape");
			await until(() => open().length < n, 600);
		}
		await sleep(100);
		const still = open();
		return `left open, closed after a failure: ${was.join(", ")}${still.length ? `; still open: ${still.join(", ")}` : ""}`;
	}
	/* page: {log, ready: async () => true when the machine takes input, prepare: async (u) => what it did (optional,
	   once, after ready and before the first journey: logged "JOURNEYS before: ..."), between: async (u) => the page's
	   neutral state before each journey, context: () => what the page last said (its toast, its error line), added to a
	   FAIL} */
	/* page.state(): {name: text} of what a journey may change and must put back (the machine's documents, its modes); the UI's own
	   (workspace, selection) is not: each journey picks what it needs. A name in only one of the two is not a change (a document that
	   was not loaded yet). */
	const safeState = page => { try { return page.state(); } catch (e) { return { "state threw": e.message }; } };
	const stateDiff = (a, b) => Object.keys(a).filter(k => k in b && a[k] !== b[k]).slice(0, 8).map(k => {
		const x = String(a[k]), y = String(b[k]);
		if (x.length < 50 && y.length < 50) return `${k} (${x} -> ${y})`;
		let i = 0; while (i < x.length && x[i] === y[i]) i++;	/* a document: where it first differs */
		return `${k} (at ${i}: ${x.slice(Math.max(0, i - 20), i + 30)} -> ${y.slice(Math.max(0, i - 20), i + 30)})`;
	}).join(", ");
	let runLog = null;	/* the running journeys' log (the hands say what they could not do) */
	async function run(all, page) {
		const list = wanted(all); if (!list) return;
		const log = page.log; runLog = log; hooks = page;
		log(`JOURNEYS start: ${list.length} of ${all.length}: ${list.map(j => j.name).join(" ")}`);
		if (shuffleSeed != null) log(`JOURNEYS shuffle seed ${shuffleSeed}`);
		if (listMode) { log(`JOURNEYS list: ${list.map(j => j.name).join(" ")}`); log(`JOURNEYS alone: ${list.filter(j => j.alone).map(j => j.name).join(" ")}`); log("JOURNEYS DONE 0/0 (list)"); return; }
		if (!list.length) { log("JOURNEYS DONE 0/0"); return; }
		let passed = 0, skipped = 0;
		const count = r => { if (r === "skip") skipped++; else if (r) passed++; };
		/* a journey about the start itself ({boot: true}) runs from the page's start, before the machine is ready */
		for (const j of list.filter(j => j.boot)) count(await runOne(j, log, page.context));
		if (!await page.ready()) { log(`JOURNEYS DONE ${passed}/${list.length} (the machine was not ready)`); return; }
		/* the machine's own state the journeys rely on, put right once before the first (prepare: what it did, in words) */
		if (page.prepare && list.some(j => !j.boot)) {
			try { log(`JOURNEYS before: ${await page.prepare(u)}`); } catch (e) { log(`JOURNEYS before: could not prepare: ${e.message}`); }
		}
		/* the guard: what the journey before left is said, and put right only when that one failed (or at the start) */
		let fix = true;
		for (const j of list.filter(j => !j.boot)) {
			try { const did = page.between ? await page.between(u, fix) : ""; if (did) log(`JOURNEY ${j.name} before: ${did}`); } catch (e) { log(`JOURNEY ${j.name} before: ${e.message}`); }
			const left = await closeLeftOpen(fix);
			if (left) log(`JOURNEY ${j.name} before: ${left}`);
			const was = page.state ? safeState(page) : null;
			const r = await runOne(j, log, page.context);
			/* the guard's other half: what this journey left changed (its tidy was to put it back), said by the journey's name */
			if (was && r !== "skip") { const now = safeState(page), diff = stateDiff(was, now); if (diff) log(`JOURNEY ${j.name} ${j.alone ? "alone, left" : "left"}: ${diff}`); }
			count(r); fix = !r;	/* false: failed; "skip" and true: it changed nothing or passed */
			if (r === "skip") fix = false;
		}
		log(`JOURNEYS DONE ${passed}/${list.length - skipped}${skipped ? `, ${skipped} skipped` : ""}`);
	}
	/* Demos: page as for run, plus preroll (ms between "DEMO READY" and the first demo: the recorder starts then). They
	   run once the machine is ready and the page is neutral, with the drawn pointer, each between "DEMO <name> START"
	   and "DEMO <name> END <ms>", then "DEMOS DONE <passed>/<run>". */
	async function demo(all, page) {
		const list = wanted(all, "demo"); if (!list) return;
		const log = page.log;
		log(`DEMOS start: ${list.length} of ${all.length}: ${list.map(j => j.name).join(" ")}`);
		if (!list.length) { log("DEMOS DONE 0/0"); return; }
		if (!await page.ready()) { log(`DEMOS DONE 0/${list.length} (the machine was not ready)`); return; }
		try { if (page.between) await page.between(u); } catch (e) { log(`DEMO before: ${e.message}`); }
		/* a demo's setup (steps, optional) gets the machine going before the camera does, so the video opens on it
		   already playing: the first demo's runs before "DEMO READY", a later one's just before that demo */
		const scratch = list.map(() => ({}));
		const setup = async i => !list[i].setup || await runOne({ name: list[i].name + "-setup", steps: list[i].setup }, log, page.context, null, scratch[i]);
		const ready0 = await setup(0);
		Pointer.on = true;
		await Pointer.glide(innerWidth * 0.5, innerHeight * 0.55, 0);
		log("DEMO READY");
		await sleep(page.preroll ?? 4000);
		let passed = 0;
		for (let i = 0; i < list.length; i++) {
			const j = list[i];
			if (!(i === 0 ? ready0 : await setup(i))) { log(`JOURNEY ${j.name} FAIL its setup failed`); continue; }
			const t0 = performance.now();
			/* START with the page clock (ms), so the page's own timed lines (a demo's bar lines) can be placed on the video */
			log(`DEMO ${j.name} START clock ${Math.round(t0)}`);
			/* the end card's text, for the video script: name|line|url */
			if (j.card) log(`DEMO ${j.name} card ${j.card}`);
			if (await runOne(j, log, page.context, { t0 }, scratch[i])) passed++;
			log(`DEMO ${j.name} END ${Math.round(performance.now() - t0)}`);
		}
		Pointer.on = false;
		log(`DEMOS DONE ${passed}/${list.length}`);
	}
	/* I-024 (doc/modern-ux/DESIGN-machine-memory.md): the machine memory, both editors. The engine menu's KEEP MEMORY
	   turns off and on again (the plug-in's machineMemory says so, the entry's words follow); RESET MACHINE… offers Start
	   from factory memory…, which asks again (Cancel changes nothing), then sends it and the saved file is gone. That the
	   machine then starts from factory memory, and that a save is there in the next session, is
	   mdMachineMemoryFirmwareTest's. */
	const memoryJourney = (name, o = {}) => {
		const keep = () => $q('#engsel option[value="memoryKeep"]');
		const keepSays = () => keep()?.textContent || "";
		const saved = () => keep()?.dataset.saved;
		const dlgOn = () => !!$q("#dlg") && !$q("#dlg").hidden;
		const dlgKey = text => [...document.querySelectorAll("#dlg [data-dlg]")].find(b => b.textContent.trim() === text);
		return {
			name, proves: o.proves,
			steps: [
				{ say: "the engine menu has KEEP MEMORY: ON, and no entry of its own for factory memory", act: () => {},
					screen: () => ok(!!keep() && !keep().hidden && keepSays() === "KEEP MEMORY: ON" && !$q('#engsel option[value="memoryFactory"]'), keepSays() || "no entry") },
				{ say: "choose KEEP MEMORY: it reads OFF", act: hands => hands.pick("engsel", "memoryKeep"), screen: () => ok(keepSays() === "KEEP MEMORY: OFF", keepSays()) },
				{ say: "choose it again: ON", act: hands => hands.pick("engsel", "memoryKeep"), screen: () => ok(keepSays() === "KEEP MEMORY: ON", keepSays()) },
				{ say: "choose RESET MACHINE…: Start from factory memory… is one of its choices", act: hands => hands.pick("engsel", "reset"),
					screen: () => ok(dlgOn() && !!dlgKey("Start from factory memory…"), "no choice") },
				{ say: "click it: the editor asks again", act: hands => hands.click(dlgKey("Start from factory memory…")),
					screen: () => ok(dlgOn() && !!dlgKey("Start from factory memory") && !!dlgKey("Cancel"), "no question") },
				{ say: "Cancel: nothing happens, the saved memory stays", act: hands => hands.click(dlgKey("Cancel")),
					screen: () => ok(!dlgOn() && saved() === "1", "saved " + saved()) },
				{ say: "again, and Start from factory memory: the saved memory is gone", act: async hands => {
					await hands.pick("engsel", "reset"); await until(() => !!dlgKey("Start from factory memory…"), 2000); hands.click(dlgKey("Start from factory memory…"));
					await until(() => !!dlgKey("Start from factory memory"), 2000); hands.click(dlgKey("Start from factory memory")); },
					screen: () => ok(!dlgOn() && saved() === "0", "saved " + saved()) }
			],
			tidy: async hands => { if (dlgOn() && dlgKey("Cancel")) hands.click(dlgKey("Cancel")); if (keepSays() === "KEEP MEMORY: OFF") await hands.pick("engsel", "memoryKeep"); }
		};
	};
	/* for needs: the page draws its canvases on animation frames, which WebKit runs only while the window is on screen */
	/* I-008: the editor's menu, both editors: drawn by the page from the plug-in's entries (editorMenu, deskMenu.js),
	   opened by a right-click anywhere the page has no menu of its own (the header, the rail). menu.via(u, path) opens it afresh (the plug-in's entries as
	   they are now) and clicks the entries of a path in turn. editorMenuJourney(name, product): a submenu by the
	   keyboard, a zoom step and Updates › Check Daily by the pointer; each choice is the plug-in's to run (menuPick),
	   its effect read back from the plug-in in the menu itself (the zoom it says, the tick it sends); Esc closes the
	   submenu, then the menu. The tidy puts the zoom and Check Daily back through the same menu. */
	const $q = q => document.querySelector(q);
	const menu = {
		at: ".top .brand .ed",
		on: () => !!$q("#deskmenu") && !$q("#deskmenu").hidden,
		id: id => `#deskmenu [data-mid="${id}"]`,
		zoomSays: () => $q(menu.id("zoom"))?.querySelector("kbd")?.textContent || "",
		dailyOn: () => $q(menu.id("update-daily"))?.getAttribute("aria-checked") === "true",
		async via(hands, path = []) {
			if (menu.on()) closeDeskMenu();
			hands.rightClick(menu.at);
			if (!await until(() => menu.on() && !!$q(menu.id("zoom")), 4000)) throw new Error("the editor's menu did not open");
			for (const id of path) { await until(() => !!$q(menu.id(id)), 1000); hands.click(menu.id(id)); await sleep(120); }
		},
		titled: product => ok(menu.on() && new RegExp(product + " \\d").test($q("#deskmenu .mtitle")?.textContent || "") && !!$q(menu.id("developer")),
			"no editor menu: " + ($q("#deskmenu .mtitle")?.textContent || "(none)"))
	};
	const editorMenuJourney = (name, product, o = {}) => ({
		name, proves: o.proves,
		steps: [
			{ say: "right-click the header's empty part: the editor's menu, its title the editor and version", act: hands => { if (menu.on()) closeDeskMenu(); hands.rightClick(menu.at); },
				screen: () => menu.titled(product) },
			/* the rail is on Sequence and Sound, not on Mix, Song or Control (where an earlier journey may have left the page) */
			{ say: "Esc, then right-click the track rail (outside the header, no menu of its own; on Sequence when the workspace shown has no rail): the editor's menu there too",
				act: async hands => { hands.key("Escape"); await until(() => !menu.on(), 1000);
					const shown = () => { const r = $q("#rail"); return !!r && !r.hidden && r.getBoundingClientRect().height > 0; };
					if (!shown()) { hands.click('#tabs [data-ws="seq"]'); if (!await until(shown, 3000)) throw new Error("no track rail on Sequence"); }
					hands.rightClick("#rail", {}, 0.5, 0.97); },
				screen: () => menu.titled(product) },
			{ say: "focus Zoom, press →: its submenu, its first entry focused", act: (hands, c) => { c.z0 = menu.zoomSays(); $q(menu.id("zoom")).focus(); hands.key("ArrowRight"); },
				screen: () => ok(DeskMenu.depth() === 2 && document.activeElement?.closest?.(".mpanel")?.dataset.lv === "1" && $q(menu.id("zoom")).getAttribute("aria-expanded") === "true",
					"depth " + DeskMenu.depth()) },
			{ say: "click a zoom step: the menu closes, the plug-in zooms the page", act: (hands, c) => { c.to = c.z0 === "110 %" ? "125" : "110"; hands.click(menu.id("zoom-" + c.to)); },
				screen: () => ok(!menu.on(), "menu still open") },
			{ say: "right-click again: Zoom says the new step", act: hands => menu.via(hands), screen: c => ok(menu.zoomSays() === c.to + " %", "Zoom says " + menu.zoomSays()) },
			{ say: "click Updates, then Check Daily: the menu closes", act: async (hands, c) => {
				hands.click(menu.id("updates")); await until(() => !!$q(menu.id("update-daily")), 1000); c.d0 = menu.dailyOn(); hands.click(menu.id("update-daily")); },
				screen: () => ok(!menu.on(), "menu still open") },
			{ say: "open Updates again: Check Daily's tick turned", act: hands => menu.via(hands, ["updates"]),
				screen: c => ok(!!$q(menu.id("update-daily")) && menu.dailyOn() !== c.d0, "ticked " + menu.dailyOn()) },
			{ say: "press Esc: the submenu closes, the menu stays", act: hands => hands.key("Escape"),
				screen: () => ok(menu.on() && DeskMenu.depth() === 1, "depth " + DeskMenu.depth() + (menu.on() ? "" : ", menu closed")) },
			{ say: "press Esc again: the menu closes", act: hands => hands.key("Escape"), screen: () => ok(!menu.on(), "menu still open") }
		],
		async tidy(hands, c) {
			if (c.to && /^\d+ %$/.test(c.z0 || "")) await menu.via(hands).then(() => menu.zoomSays() !== c.z0 && menu.via(hands, ["zoom", "zoom-" + parseInt(c.z0, 10)])).catch(() => { });
			if (c.d0 !== undefined) {
				await menu.via(hands, ["updates"]).catch(() => { });
				if (menu.dailyOn() !== c.d0) hands.click(menu.id("update-daily"));
			}
			if (menu.on()) closeDeskMenu();
		}
	});
	/* I-018: the CPU meter (deskCpu.js), both editors: beside the version in the Setup label, it reads a share while the
	   audio runs, moves while the machine plays, and a click opens its details (a menu of notes) under it; Esc closes them.
	   cpuMeterJourneys(prefix): [<prefix>-top-cpu-meter, <prefix>-shots-cpu (asked by name: the meter and its details as
	   snapshots, scripts/mdmm-snap.py)]. The transport is the page's own PLAY key (#play, both editors). */
	const cpu = {
		el: () => $q(".setgroup .grplabel #cpumeter"),
		playing: () => $q("#play")?.getAttribute("aria-pressed") === "true",
		panel: () => $q('#deskmenu:not([hidden]) .mpanel[data-cpu="1"]'),
		notes: () => [...($q('#deskmenu .mpanel[data-cpu="1"]')?.querySelectorAll(".mnote") || [])].map(n => n.textContent),
		says: () => { const m = cpu.el(); return m ? `${m.dataset.state} "${m.querySelector(".cpuval")?.textContent}"` : "no meter"; },
		async play(hands, c) { if (!cpu.playing()) { hands.click("#play"); c.started = true; await until(cpu.playing, 4000); } },
		async stop(hands, c) { if (c.started && cpu.playing()) { hands.click("#play"); await until(() => !cpu.playing(), 4000); } c.started = false; }
	};
	/* Developer › Speed-ups and Speed-ups (each), both editors: each choice turns what the machine runs (read back
	   from the plug-in: the cpuLoad message's speedUps and leversOff, which the processor reads from the device under its
	   lock once a second) and the menu's tick, both ways. speedUpsMenuJourney(prefix): the umbrella from on to off to on
	   (from off: off, on, off), then every lever off and on again with the umbrella on. The tidy puts all back. */
	const speed = {
		ticked: id => $q(menu.id(id))?.getAttribute("aria-checked") === "true",
		enabled: id => !!$q(menu.id(id)) && !$q(menu.id(id)).disabled,
		legacy: () => !speed.ticked("speed-ups"),
		machine: () => { const m = CpuMeter.last; return m ? m.speedUps : "no reading"; },
		leverOff: key => !!(CpuMeter.last && (CpuMeter.last.leversOff || []).includes(key)),
		/* the settings file's (what the next session starts with) */
		savedLegacy: () => !!(CpuMeter.last && CpuMeter.last.saved && CpuMeter.last.saved.legacyEmulation),
		savedLeverOff: key => !!(CpuMeter.last && CpuMeter.last.saved && (CpuMeter.last.saved.leversOff || []).includes(key)),
		/* the CPU details' own entries (deskCpu.js: the editor menu's, under the notes) */
		cpuItem: label => [...document.querySelectorAll('#deskmenu .mpanel[data-cpu="1"] [data-mi]')].find(b => (b.querySelector("span")?.textContent || "").trim() === label),
		/* the menu closed and staying closed: a choice in the CPU details opens them again by themselves a moment later
		   (deskCpu.js: openMenu, then the plug-in's answer), so one close can lose that race and leave them over the
		   meter (0.5.1 gate: "#cpumeter is covered by #modalbg") */
		shut: async () => { for (let i = 0; i < 8; i++) { if (menu.on()) closeDeskMenu();
			if (!await until(() => menu.on(), 500) && (!$q("#modalbg") || $q("#modalbg").hidden)) return; }
			throw new Error("the menu keeps opening again"); },
		/* the CPU details with their speed-up entries: the ones open already (they reopen after a choice), else opened */
		cpuOpen: async hands => { if (cpu.panel() && speed.cpuItem("Speed-ups")) return;
			await speed.shut(); hands.click("#cpumeter");
			if (!await until(() => !!speed.cpuItem("Speed-ups"), 3000)) throw new Error("no Speed-ups entry in the CPU details"); },
		keys: () => [...document.querySelectorAll('#deskmenu [data-mid^="speedup-"]')].map(b => b.dataset.mid).filter(x => x !== "speedup-levers"),
		/* the Developer submenu (and the levers' one) as the plug-in sends it now */
		open: async (hands, levers) => { await speed.shut(); await menu.via(hands, levers ? ["developer", "speedup-levers"] : ["developer"]);
			if (!await until(() => !!$q(menu.id(levers ? "speedup-L1" : "speed-ups")), 2000)) throw new Error("no speed-ups entry in Developer"); },
		pick: async (hands, id, levers) => { await speed.open(hands, levers); hands.click(menu.id(id)); await until(() => !menu.on(), 2000); }
	};
	const speedUpsMenuJourney = prefix => {
		const toggle = (n, want) => ({ say: `choose Speed-ups (${n}): the machine's speed-ups and the menu's tick turn`,
			act: async (hands, c) => { c.want = want(c); await speed.pick(hands, "speed-ups");
				await until(() => (speed.machine() === "off") === c.want, 4000);
				await speed.open(hands); c.tick = speed.legacy(); closeDeskMenu(); },
			screen: c => ok(c.tick === c.want, `ticked ${c.tick}, wanted ${c.want}`),
			machine: c => ok((c.want ? speed.machine() === "off" : speed.machine() !== "off" && speed.machine() !== "unknown") && speed.savedLegacy() === c.want,
				`the machine runs speed-ups ${speed.machine()}, saved legacyEmulation ${speed.savedLegacy()}`), within: 4000 });
		/* the same from the CPU meter's details: its "Speed-ups" entry (ticked when on) */
		const cpuToggle = (n, want) => ({ say: `in the CPU meter's details, choose Speed-ups (${n}): the machine, the settings and the details' tick follow`,
			act: async (hands, c) => { c.want = want(c); await speed.cpuOpen(hands);
				const b = speed.cpuItem("Speed-ups"); b.setAttribute("data-journey", "sw"); hands.click('[data-journey="sw"]');
				await until(() => (speed.machine() === "off") === c.want, 4000);
				/* the details open again by themselves with the new state */
				await until(() => { const x = speed.cpuItem("Speed-ups"); return !!x && (x.getAttribute("aria-checked") === "true") === !c.want; }, 3000);
				const x = speed.cpuItem("Speed-ups"); c.tick = x ? x.getAttribute("aria-checked") === "true" : null; },
			screen: c => ok(c.tick === !c.want, `the details' Speed-ups ticked ${c.tick}, wanted ${!c.want}`),
			machine: c => ok((c.want ? speed.machine() === "off" : speed.machine() !== "off") && speed.savedLegacy() === c.want,
				`the machine runs speed-ups ${speed.machine()}, saved legacyEmulation ${speed.savedLegacy()}`), within: 4000 });
		return {
			name: `${prefix}-dev-speedups`,
			needs: () => typeof CpuMeter === "undefined" ? "no CPU meter (its cpuLoad message carries the machine's speed-ups)" : null,
			steps: [
				{ say: "open Developer: Speed-ups, ticked when the machine runs them", act: async (hands, c) => { await speed.open(hands); c.legacy0 = speed.legacy(); closeDeskMenu(); },
					machine: c => ok((speed.machine() === "off") === c.legacy0, `ticked ${c.legacy0}, the machine ${speed.machine()}`), within: 4000 },
				/* each switch once each way (four menu toggles made 2026-10-11's 40-60 s journey; once each way finds the same) */
				toggle("first", c => !c.legacy0), toggle("back", c => c.legacy0),
				cpuToggle("first", c => !c.legacy0), cpuToggle("back", c => c.legacy0),
				{ say: "in the CPU meter's details, Speed-ups (each)… lists every lever; L1 off there and on again (the machine and the settings follow)",
					act: async (hands, c) => {
						if (speed.machine() === "off") { await speed.pick(hands, "speed-ups"); await until(() => speed.machine() !== "off", 4000); }
						c.res = [];
						for (const on of [false, true]) {
							await speed.cpuOpen(hands);
							const each = speed.cpuItem("Speed-ups (each)…"); each.setAttribute("data-journey", "each"); hands.click('[data-journey="each"]');
							if (!await until(() => !!$q('#deskmenu [data-mid="speedup-L1"]'), 2000)) throw new Error("no levers under Speed-ups (each)…");
							c.levers = document.querySelectorAll('#deskmenu .mpanel[data-lv="1"] [data-mid^="speedup-"]').length;
							hands.click('#deskmenu [data-mid="speedup-L1"]');
							const okm = await until(() => speed.leverOff("L1") === !on && speed.savedLeverOff("L1") === !on, 4000);
							c.res.push(`L1 ${on ? "on" : "off"}: ${okm ? "ok" : "machine " + speed.leverOff("L1") + " saved " + speed.savedLeverOff("L1")}`);
						}
						if (menu.on()) closeDeskMenu();
					},
					screen: c => ok(c.levers >= 8 && c.res.every(x => /ok$/.test(x)), `${c.levers} levers; ${c.res.join("; ")}`), within: 1000 },
				{ say: "with the speed-ups on: each lever in Speed-ups (each) off, then on again (the tick and the machine's levers)",
					act: async (hands, c) => {
						if (speed.machine() === "off") { await speed.pick(hands, "speed-ups"); await until(() => speed.machine() !== "off", 4000); }
						await speed.open(hands, true); const ids = speed.keys(); closeDeskMenu();
						c.bad = []; c.n = ids.length;
						for (const id of ids) {
							const key = id.slice("speedup-".length);
							for (const on of [false, true]) {
								await speed.pick(hands, id, true);
								const machineOk = await until(() => speed.leverOff(key) === !on && speed.savedLeverOff(key) === !on, 4000);
								await speed.open(hands, true); const t = speed.ticked(id), en = speed.enabled(id); closeDeskMenu();
								if (!machineOk || t !== on || !en) c.bad.push(`${key} ${on ? "on" : "off"}: tick ${t}, enabled ${en}, machine ${machineOk ? "ok" : "levers off " + (CpuMeter.last.leversOff || []).join("+") + ", saved " + ((CpuMeter.last.saved || {}).leversOff || []).join("+")}`);
							}
						}
					},
					screen: c => ok(c.n >= 8 && !c.bad.length, c.n + " levers; " + c.bad.join("; ")), within: 1000 }
			],
			async tidy(hands, c) {
				if (menu.on()) closeDeskMenu();
				if (c.legacy0 === undefined) return;
				try {
					await speed.open(hands); const now = speed.legacy(); closeDeskMenu();
					if (now !== c.legacy0) await speed.pick(hands, "speed-ups");
				} catch (_) { if (menu.on()) closeDeskMenu(); }
			}
		};
	};
	/* The top bar's keys outside the window ([] when all are in). Checked only where the page's text is as designed: on
	   a page zoomed below 100 % (a window under 1440 x 720 points, the background runs' small window) WebKit raises 9 to
	   15 px text to its minimum logical font size, so the same CSS width holds less (B-056, B-061) and the Machinedrum's
	   top bar is cut there. textFloor: what a 9 px text is laid out at. */
	const textFloor = () => { const x = document.createElement("span"); x.style.fontSize = "9px"; document.body.appendChild(x); const v = parseFloat(getComputedStyle(x).fontSize); x.remove(); return v; };
	const topRaised = () => textFloor() > 9.05;
	const topOut = () => topRaised() ? [] : [...document.querySelectorAll(".top button")].filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 0.5 || r.left < -0.5); });
	const cpuMeterJourneys = prefix => [{
		name: `${prefix}-top-cpu-meter`,
		steps: [
			{ say: "the CPU meter sits after the version in the Setup label and reads a share of the audio blocks' time",
				screen: () => { const m = cpu.el(), r = m && m.getBoundingClientRect();
					return ok(!!m && r.width > 0 && r.height > 0 && m.dataset.state === "running" && /^\d+ %$/.test(m.querySelector(".cpuval").textContent)
						&& (!$q(".setgroup .grplabel .aboutver") || $q(".setgroup .grplabel .aboutver").compareDocumentPosition(m) & 4), cpu.says()); } },
			{ say: "every key of the top bar is inside the window (the Setup keys last, at the right)",
				act: (hands, c) => { if (topRaised()) c.note = `9 px text laid out at ${textFloor().toFixed(2)} px (page zoomed out): the fit is checked at 100 % only (B-061)`; },
				screen: () => { const out = topOut();
					return ok(!out.length, out.map(b => (b.id || b.textContent.trim()) + " at " + Math.round(b.getBoundingClientRect().right) + " of " + innerWidth).join(", ")); } },
			{ say: "press PLAY: while the machine plays, the meter moves (its share read every 250 ms for 3 s)",
				act: async (hands, c) => { await cpu.play(hands, c); c.loads = []; for (let i = 0; i < 12; i++) { await sleep(250); c.loads.push(cpu.el()?.dataset.load || ""); } },
				screen: c => ok(cpu.playing() && c.loads.every(x => x !== "") && new Set(c.loads).size >= 2, `playing ${cpu.playing()}, shares ${(c.loads || []).join(",")}`) },
			{ say: "click the meter: its details open under it (average, worst block, machine speed, rate and block, speed-ups, native or Rosetta)",
				act: hands => { if (menu.on()) closeDeskMenu(); hands.click("#cpumeter"); },
				screen: () => { const p = cpu.panel(), n = cpu.notes(), m = cpu.el();
					const under = p && m && p.getBoundingClientRect().top >= m.getBoundingClientRect().bottom - 1;
					return ok(!!p && under && /^Average: \d+ %/.test(n[0] || "") && /^Worst block: \d+ %/.test(n[1] || "") && n.some(x => / Hz/.test(x))
						&& n.some(x => /^Speed-ups: /.test(x)) && n.some(x => /^(Runs natively|Rosetta)/.test(x)), p ? (under ? "" : "not under the meter: ") + n.join(" | ") : "no details"); } },
			{ say: "they follow the meter while open: still open a second later, the same lines", act: () => sleep(1000),
				screen: () => ok(!!cpu.panel() && /^Average: \d+ %/.test(cpu.notes()[0] || ""), cpu.notes().join(" | ") || "closed") },
			{ say: "press Esc: the details close", act: hands => hands.key("Escape"), screen: () => ok(!menu.on(), "still open") },
			{ say: "press STOP", act: (hands, c) => cpu.stop(hands, c), screen: () => ok(!cpu.playing(), "still playing") }
		],
		async tidy(hands, c) { if (menu.on()) closeDeskMenu(); await cpu.stop(hands, c); }
	}, {
		name: `${prefix}-shots-cpu`, needs: () => location.search.includes(`${prefix}-shots-cpu`) ? null : "screenshots only when asked by name",
		steps: [
			{ say: "the meter while the machine plays", act: async (hands, c) => { await cpu.play(hands, c); await sleep(2500); snapshot(`${prefix}-cpu-meter`); },
				screen: () => ok(cpu.el()?.dataset.state === "running", cpu.says()) },
			{ say: "its details", act: async hands => { hands.click("#cpumeter"); await until(() => !!cpu.panel(), 2000); await sleep(600); snapshot(`${prefix}-cpu-details`); },
				screen: () => ok(!!cpu.panel(), "no details") },
			{ say: "Esc, stop", act: async (hands, c) => { hands.key("Escape"); await until(() => !menu.on(), 2000); await sleep(200); await cpu.stop(hands, c); } }
		],
		async tidy(hands, c) { if (menu.on()) closeDeskMenu(); await cpu.stop(hands, c); }
	}];
	/* I-021: the stereo output meter and volume at the LCD's right end (deskVolume.js), both editors. volumeJourneys(prefix):
	   [<prefix>-lcd-volume]. The volume is checked against the plug-in (its outputLevel message's gainDb, the processor's
	   output gain read back); the tidy puts back the volume the person had (by a drag, the page's own control). */
	const vol = {
		el: () => $q(".lcdgroup .lcdpanel #volf"),
		plugin: () => DeskVolume.last && "gainDb" in DeskVolume.last ? DeskVolume.last.gainDb : "no reading",
		tip: () => [...document.querySelectorAll(".voltip")].find(t => !t.hidden)?.textContent || "",
		/* the volume from its plug-in reading (a step's machine check is synchronous; the runner polls it) */
		follows: want => !!DeskVolume.last && DeskVolume.last.gainDb === want && DeskVolume.gain === want,
		says: () => `page ${DeskVolume.gain}, plug-in ${vol.plugin()}`
	};
	const volumeJourneys = prefix => [{
		name: `${prefix}-lcd-volume`,
		steps: [
			{ say: "the meter sits at the LCD's right end, both rows tall, two bars and the volume line; every key of the top bar is in the window",
				screen: () => { const v = vol.el(), p = $q(".lcdgroup .lcdpanel");
					if (!v || !p) return ok(false, "no strip");
					const r = v.getBoundingClientRect(), l = p.getBoundingClientRect();
					const out = topOut();
					return ok(l.right - r.right < 10 && r.width >= 18 && r.width <= 32 && r.height >= 0.6 * l.height && v.querySelectorAll(".volbar").length === 2 && !!v.querySelector(".volcap") && !out.length,
						`strip ${Math.round(r.left)}..${Math.round(r.right)} x ${Math.round(r.height)} in LCD ..${Math.round(l.right)} x ${Math.round(l.height)}; outside: ${out.map(b => b.id || b.textContent.trim()).join(", ")}`); } },
			{ say: "double-click it: 0 dB, in the plug-in too",
				act: (hands, c) => { c.orig = DeskVolume.gain; hands.dblclick("#volf"); },
				screen: () => ok(DeskVolume.gain === 0 && vol.el().getAttribute("aria-valuetext") === "0.0 dB", vol.says()),
				machine: () => ok(vol.follows(0), vol.says()) },
			{ say: "drag it down 12 px: -6 dB, the readout under the LCD says so while it changes",
				act: async (hands, c) => {
					/* every text the readout shows during and just after the drag (a slow page can hide it again, 900 ms after
					   the last change, before a read after the drag) */
					c.tips = []; const see = () => { const t = vol.tip(); if (t) c.tips.push(t); };
					const watch = new MutationObserver(see); document.querySelectorAll(".voltip").forEach(t => watch.observe(t, { attributes: true, childList: true, characterData: true, subtree: true }));
					try { await hands.drag("#volf", [[0, 4], [0, 8], [0, 12]], {}, { click: false, settle: 50 }); see(); await until(() => c.tips.includes("Volume -6.0 dB"), 600); }
					finally { watch.disconnect(); }
					c.tip = c.tips.includes("Volume -6.0 dB") ? "Volume -6.0 dB" : (c.tips[c.tips.length - 1] || ""); },
				screen: c => ok(DeskVolume.gain === -6 && c.tip === "Volume -6.0 dB", `${vol.says()}, readout "${c.tip}"`),
				machine: () => ok(vol.follows(-6), vol.says()) },
			{ say: "the readout goes a moment after", act: () => sleep(1200), screen: () => ok(!vol.tip(), `still "${vol.tip()}"`) },
			{ say: "scroll up one notch: -5 dB", act: hands => hands.wheel("#volf", 1),
				screen: () => ok(DeskVolume.gain === -5, vol.says()), machine: () => ok(vol.follows(-5), vol.says()) },
			{ say: "drag it to the foot: off", act: hands => hands.drag("#volf", [[0, 60], [0, 160]], {}, { click: false }),
				screen: () => ok(DeskVolume.gain === null && vol.el().classList.contains("off"), vol.says()),
				machine: () => ok(vol.follows(null), vol.says()) },
			{ say: "double-click: 0 dB again", act: hands => hands.dblclick("#volf"),
				screen: () => ok(DeskVolume.gain === 0, vol.says()), machine: () => ok(vol.follows(0), vol.says()) },
			{ say: "press PLAY: the plug-in sends the left and right peaks every 250 ms and the bars follow them (a background standalone is silent: its output is zeroed before the volume)",
				act: async (hands, c) => { await cpu.play(hands, c); c.seen = []; for (let i = 0; i < 12; i++) { await sleep(250); const m = DeskVolume.last;
					c.seen.push(m ? [m.peakL, m.peakR, $q("#volf .volL")?.dataset.level, $q("#volf .volR")?.dataset.level].join("/") : "none"); } },
				screen: c => { const m = DeskVolume.last, moved = c.seen.some(x => /^[\d.]+\/[\d.]+\/[\d.]+\/[\d.]+$/.test(x) && x.split("/").some(v => +v > 0));
					const quietStandalone = CpuMeter.last && CpuMeter.last.plugin === false;
					/* a machine with nothing sounding (the VST3 host starts a factory machine, whose first pattern may be empty)
					   gives 0 on every reading: the readings still come, the bars still read them */
					const silent = c.seen.length && c.seen.every(x => x === "0/0/0/0");
					return ok(cpu.playing() && !!m && typeof m.peakL === "number" && typeof m.peakR === "number" && (moved || quietStandalone || silent),
						`${moved ? "levels" : quietStandalone ? "silent (standalone, background run?)" : silent ? "silent (nothing sounding)" : "no level"}: ${c.seen.join(" ")}`); } },
			{ say: "press STOP", act: (hands, c) => cpu.stop(hands, c), screen: () => ok(!cpu.playing(), "still playing") }
		],
		async tidy(hands, c) {
			await cpu.stop(hands, c);
			/* the person's volume back, by the strip itself: 2 px a dB from 0 dB (or to the foot when it was off) */
			if (c.orig === undefined || c.orig === DeskVolume.gain) return;
			hands.dblclick("#volf");
			await sleep(100);
			if (c.orig === null) await hands.drag("#volf", [[0, 80], [0, 200]], {}, { click: false });
			else if (c.orig !== 0) await hands.drag("#volf", [[0, c.orig > 0 ? -3 : 3], [0, -2 * c.orig]], {}, { click: false });
		}
	}];
	/* B-061, B-065, B-066: the top bar and the LCD on every workspace, at every window size the page is laid out in.
	   fitJourneys(prefix, workspaces): [<prefix>-fit-workspaces]. For each view (a window size, and the text floor of a page
	   zoomed out: WebKit raises text under 9 points on screen, so at 60 % a 9 px text is laid out at 15 px; the page tier
	   resizes its window, gmView, and the floor is emulated here the same way, see raiseFloor) it visits every workspace
	   and fails when a key of the top bar (CPU meter, GLOBAL, MKI/MKII ...) is not wholly in the window, when a slot of the
	   LCD's second row is cut, or when the LCD's box is another size on another workspace. The CPU meter and the output
	   strip are fed as the plug-in does (a standalone has them already); the tidy puts the window back. */
	const fitViews = [
		{ name: "1440", width: 1440, floor: 0 }, { name: "1280", width: 1280, floor: 0 }, { name: "1920", width: 1920, floor: 0 }, { name: "2560", width: 2560, floor: 0 },
		{ name: "1440-zoom-90", width: 1440, floor: 10.1 }, { name: "1440-zoom-75", width: 1440, floor: 12 }, { name: "1440-zoom-60", width: 1440, floor: 15 }
	];
	/* the text floor of a page zoomed out, as WebKit applies it (its "smart minimum": a text that was specified at 9 px or more
	   and would show under 9 points is laid out at 9 points, a smaller one, the 8 px labels, is left alone): every text laid
	   out at 9 px or more but under floor px becomes floor px (inline, !important, remembered in data-fit-fs); floor 0
	   puts every text back. Called again when the page redrew. */
	let floorNow = 0;
	const raiseFloor = floor => {
		const root = document.querySelector("header.top") || document.body;
		if (floor !== floorNow) {
			for (const e of root.querySelectorAll("[data-fit-fs]")) { e.style.removeProperty("font-size"); if (e.dataset.fitFs) e.style.setProperty("font-size", e.dataset.fitFs); delete e.dataset.fitFs; }
			floorNow = floor;
		}
		if (!floor) return;
		const todo = [];
		for (const e of root.querySelectorAll("*")) { if (e.dataset.fitFs !== undefined || (!e.textContent.trim() && !e.children.length)) continue; const fs = parseFloat(getComputedStyle(e).fontSize); if (fs >= 8.99 && fs < floor) todo.push([e, e.style.getPropertyValue("font-size")]); }
		for (const [e, old] of todo) { e.dataset.fitFs = old; e.style.setProperty("font-size", floor + "px", "important"); }
	};
	const topKeysOut = () => [...document.querySelectorAll(".top button")].filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 0.5 || r.left < -0.5); });
	/* the slots of the LCD's second row that are cut: a slot's right edge past the row's, or its text wider than its box */
	/* the bar's three groups (brand and workspaces, the LCD, the Setup keys) must not overlap each other */
	const groupsOverlap = () => { const g = ["header.top .left", "header.top .midgrp", "header.top .rightgrp"].map(q => document.querySelector(q)).filter(Boolean).map(e => ({ n: e.className.split(" ")[0], r: e.getBoundingClientRect() }));
		const out = []; for (let i = 1; i < g.length; i++) if (g[i].r.left < g[i - 1].r.right - 0.5) out.push(`${g[i - 1].n} ..${Math.round(g[i - 1].r.right)} over ${g[i].n} ${Math.round(g[i].r.left)}..`); return out; };
	const lcdRow2Cut = () => {
		const row = $q(".lcdpanel .row2"), l2 = $q("#lcd2"), cut = [];
		if (!row || !l2) return ["no second row"];
		const lim = l2.getBoundingClientRect().right;
		for (const s of l2.children) { const r = s.getBoundingClientRect(); if (r.width > 0 && (r.right > lim + 0.5 || s.scrollWidth > s.clientWidth + 1)) cut.push((s.dataset.l2 || s.textContent.trim().slice(0, 12)) + " ..." + Math.round(r.right) + " of " + Math.round(lim)); }
		if (l2.scrollWidth > l2.clientWidth + 1 && !cut.length) cut.push("row 2 scrolls " + (l2.scrollWidth - l2.clientWidth) + " px");
		const panel = $q(".lcdpanel").getBoundingClientRect();
		for (const e of row.children) { const r = e.getBoundingClientRect(); if (r.width > 0 && r.right > panel.right + 0.5) cut.push(e.id || e.className); }
		return cut;
	};
	const fitJourneys = (prefix, workspaces) => [{
		name: `${prefix}-fit-workspaces`, proves: [],
		steps: [{ say: "every workspace at every window size and text floor: the top bar's keys wholly in the window, every slot of the LCD's second row visible, the LCD one size",
			act: async (hands, c) => {
				const resize = typeof window.gmView === "function";
				const views = resize ? fitViews : [{ name: "this window", width: innerWidth, floor: 0 }];
				c.report = []; c.boxes = {}; c.start = $q("#tabs [aria-selected=true]")?.dataset.ws || workspaces[0];
				if (typeof CpuMeter !== "undefined" && !$q("#cpumeter")) CpuMeter.update({ type: "cpuLoad", state: "running", load: 0.35, worst: 0.55, realtime: 3.1, sampleRate: 48000, blockSize: 256 });
				if (typeof DeskVolume !== "undefined" && !$q("#volf")) DeskVolume.update({ type: "outputLevel", peakL: 0.2, peakR: 0.2, clip: false, gainDb: 0 });
				const keepHook = typeof TopFit !== "undefined" ? TopFit.onShow : null;
				try {
				for (const v of views) {
					if (typeof TopFit !== "undefined") TopFit.onShow = () => raiseFloor(v.floor);
					if (resize) { window.gmView(v.width, 924); await until(() => innerWidth === v.width, 3000); }
					for (const w of workspaces) {
						hands.click(`#tabs [data-ws="${w}"]`); await until(() => $q(`#tabs [data-ws="${w}"]`).getAttribute("aria-selected") === "true", 3000);
						await sleep(250); raiseFloor(v.floor); window.dispatchEvent(new Event("resize")); await sleep(250); raiseFloor(v.floor); await sleep(100);
						const keys = topKeysOut(), over = groupsOverlap(), cut = lcdRow2Cut(), r = $q(".lcdpanel").getBoundingClientRect();
						Bridge.log(`MEASURE fit ${prefix} ${v.name} ${w} width ${innerWidth} floor ${v.floor} fit ${typeof TopFit !== "undefined" ? JSON.stringify(TopFit.report()).replace(/"workspaces":\[[^\]]*\],?/, "") : "-"} classes ${$q("header.top")?.className} overflows ${typeof TopFit !== "undefined" && TopFit.overflows()} lcd ${r.width.toFixed(1)} x ${r.height.toFixed(1)} keys out [${keys.map(b => b.id || b.textContent.trim()).join(",")}] row2 cut [${cut.join("; ")}] overlap [${over.join("; ")}]`);
						if (keys.length) c.report.push(`${v.name} ${w}: top bar keys out: ${keys.map(b => (b.id || b.textContent.trim()) + " ..." + Math.round(b.getBoundingClientRect().right) + " of " + innerWidth).join(", ")}`);
						if (over.length) c.report.push(`${v.name} ${w}: the top bar overlaps itself: ${over.join(", ")}`);
						if (cut.length) c.report.push(`${v.name} ${w}: LCD row 2 cut: ${cut.join("; ")}`);
						(c.boxes[v.name] = c.boxes[v.name] || {})[w] = [r.width, r.height];
					}
					raiseFloor(0);
				}
				} finally { if (typeof TopFit !== "undefined") TopFit.onShow = keepHook; raiseFloor(0); }
				for (const [name, b] of Object.entries(c.boxes)) { const first = Object.values(b)[0];
					for (const [w, s] of Object.entries(b)) if (Math.abs(s[0] - first[0]) > 0.6 || Math.abs(s[1] - first[1]) > 0.6) c.report.push(`${name} ${w}: the LCD is ${s[0].toFixed(1)} x ${s[1].toFixed(1)}, ${Object.keys(b)[0]} ${first[0].toFixed(1)} x ${first[1].toFixed(1)}`); }
			},
			screen: c => ok(!c.report.length, c.report.slice(0, 6).join(" | ") + (c.report.length > 6 ? ` (+${c.report.length - 6})` : "")), within: 1000 }],
		async tidy(hands, c) { raiseFloor(0); if (typeof window.gmView === "function") window.gmView(1440, 924); hands.click(`#tabs [data-ws="${c.start || workspaces[0]}"]`); }
	}];
	/* Screen review 2026-10-13: what a screen cuts or overlaps, measured.
	   cutText(root): the visible elements whose words the box cuts (overflow hidden or an ellipsis, and more text than box):
	   ["<tag.class> "text" 12 px cut", ...]. A drawn caption is no element, so canvasProblems (below) records what a canvas draws. */
	function cutText(root = document) {
		const out = [];
		for (const el of root.querySelectorAll("*")) {
			if (!el.getClientRects().length || el.closest("[hidden]") || !el.textContent.trim()) continue;
			const cs = getComputedStyle(el);
			if (cs.overflowX === "visible" && cs.textOverflow !== "ellipsis") continue;
			if (cs.overflowX === "auto" || cs.overflowX === "scroll") continue;
			if ([...el.children].some(k => k.getClientRects().length && getComputedStyle(k).overflowX !== "visible")) continue;
			const over = el.scrollWidth - el.clientWidth;
			if (over > 1) out.push(`${describe(el)} "${el.textContent.trim().replace(/\s+/g, " ").slice(0, 40)}" ${over} px cut`);
		}
		return out;
	}
	/* spills(sel): the visible elements of sel whose words run past their own box, whatever their overflow (a label that a
	   flex row squeezed narrower than its text writes under its neighbour) */
	function spills(sel, root = document) {
		return [...root.querySelectorAll(sel)].filter(el => el.getClientRects().length && el.clientWidth && el.scrollWidth - el.clientWidth > 1)
			.map(el => `${describe(el)} "${el.textContent.trim().slice(0, 24)}" ${el.scrollWidth - el.clientWidth} px past its box`);
	}
	/* Two boxes that share a row and overlap (the part of the first that lies under the second), the keys of a bar and
	   their labels: [[a, b], ...] for the elements a and b of selectors "A" and "B" that meet by more than 1 px */
	function overlaps(selA, selB, root = document) {
		const as = [...root.querySelectorAll(selA)].filter(e => e.getClientRects().length), bs = [...root.querySelectorAll(selB)].filter(e => e.getClientRects().length), out = [];
		for (const a of as) for (const b of bs) { if (a === b || a.contains(b) || b.contains(a)) continue;
			const r = a.getBoundingClientRect(), q = b.getBoundingClientRect();
			if (Math.min(r.right, q.right) - Math.max(r.left, q.left) > 1 && Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top) > 1) out.push(`${describe(a)} "${a.textContent.trim().slice(0, 20)}" under ${describe(b)} "${b.textContent.trim().slice(0, 20)}"`); }
		return out;
	}
	/* A canvas draws its caption and its curve itself, so the problems are read from what it draws: draw(c) is run with a
	   2d context that records fillText (a caption's box), the dark strokes (a curve, from two px wide up) and the arcs (a
	   handle), and passes everything on. Problems: a caption past the canvas's edge, a curve through a caption, a handle on
	   a caption or cut by an edge ({crossing: false}: only the edges). W and H are the canvas's CSS size. */
	function canvasProblems(c, draw, { crossing = true } = {}) {
		const real = c.getContext("2d"), W = c.clientWidth, H = c.clientHeight, texts = [], segs = [], dots = [];
		let path = [], last = null, wide = 1;
		const rec = new Proxy(real, {
			get(t, k) {
				if (k === "fillText") return (s, x, y, ...r) => { texts.push({ s: String(s), x, y, w: t.measureText(String(s)).width }); return t.fillText(s, x, y, ...r); };
				if (k === "beginPath") return () => { path = []; last = null; return t.beginPath(); };
				if (k === "moveTo") return (x, y) => { last = [x, y]; return t.moveTo(x, y); };
				if (k === "lineTo") return (x, y) => { if (last) path.push([last[0], last[1], x, y]); last = [x, y]; return t.lineTo(x, y); };
				if (k === "arc") return (x, y, r, ...a) => { dots.push({ x, y, r }); return t.arc(x, y, r, ...a); };
				if (k === "stroke") return (...a) => { if (t.lineWidth >= 2 && t.lineWidth !== 2.5) segs.push(...path); return t.stroke(...a); };
				const v = t[k]; return typeof v === "function" ? v.bind(t) : v;
			},
			set(t, k, v) { t[k] = v; return true; }
		});
		const get0 = c.getContext;
		c.getContext = () => rec;
		try { draw(c); } finally { c.getContext = get0; }
		const out = [];
		for (const t of texts) {
			if (t.x < 0 || t.x + t.w > W + 0.5) out.push(`"${t.s}" ${Math.round(t.x + t.w - W)} px past the edge`);
			if (!crossing) continue;
			const box = { l: t.x - 1, r: t.x + t.w + 1, t: t.y - 10, b: t.y + 2 };
			for (const [x0, y0, x1, y1] of segs) { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
				for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
					if (x >= box.l && x <= box.r && y >= box.t && y <= box.b) { out.push(`"${t.s}" crossed by the curve at ${Math.round(x)},${Math.round(y)}`); i = n + 1; break; } } if (out.at(-1)?.startsWith(`"${t.s}" crossed`)) break; }
			for (const d of dots) if (d.x + d.r > box.l && d.x - d.r < box.r && d.y + d.r > box.t && d.y - d.r < box.b) { out.push(`"${t.s}" under a handle at ${Math.round(d.x)},${Math.round(d.y)}`); break; }
		}
		for (const d of dots) if (d.x - d.r < -0.5 || d.x + d.r > W + 0.5) out.push(`a handle at ${Math.round(d.x)},${Math.round(d.y)} cut by the edge (canvas ${Math.round(W)} wide)`);
		return out;
	}
	const onScreen = () => document.visibilityState === "visible" ? null : "the editor window is not on screen (display asleep or covered): its canvases are not drawn";
	/* for needs: real key events through the operating system (u.osKey) exist in the macOS plug-in only */
	const osKeyPath = () => osKeys() ? null : "no way in for real key events here (the macOS plug-in has one, mdOsKeys.h)";
	/* The page as it looks now, for a screenshot taken outside the editor (scripts/mdmm-snap.py renders it in headless
	   Chrome, where macOS gives the shell no Screen Recording): the DOM with each canvas's drawing as its background,
	   the form values as attributes, the window's size; logged in pieces as "SNAP <name> <i>/<n> <text>". */
	function snapshot(name) {
		shots++; if (runLog && current) runLog(`JOURNEY ${current} SHOT ${name}`);
		const doc = document.documentElement.cloneNode(true), live = [...document.querySelectorAll("canvas")], copies = [...doc.querySelectorAll("canvas")];
		live.forEach((c, i) => { try { const d = c.width && c.height ? c.toDataURL() : ""; if (d && copies[i]) copies[i].style.backgroundImage = `url(${d})`, copies[i].style.backgroundSize = "100% 100%"; } catch (_) { } });
		const liveSel = [...document.querySelectorAll("select")], copySel = [...doc.querySelectorAll("select")];
		liveSel.forEach((x, i) => { const c = copySel[i]; if (c) [...c.options].forEach((o, k) => k === x.selectedIndex ? o.setAttribute("selected", "") : o.removeAttribute("selected")); });
		doc.querySelectorAll("script").forEach(x => x.remove());
		doc.setAttribute("data-snap-size", innerWidth + "x" + innerHeight);
		doc.querySelector("body")?.setAttribute("style", (document.body.getAttribute("style") || "") + `;--snapzoom:${document.body.style.zoom || ""}`);
		const text = JSON.stringify("<!doctype html>\n" + doc.outerHTML), size = 120000, n = Math.ceil(text.length / size);
		for (let i = 0; i < n; i++) Bridge.log(`SNAP ${name} ${i + 1}/${n} ${text.slice(i * size, (i + 1) * size)}`);
	}
	/* B-054: the page as macOS 12's WebKit 15 lays it out, measured in this engine. Every <style> is read as WebKit 15
	   reads it (DeskCompat.safari15: no subgrid, no :has(), the colour rewrite), the boxes measured, the stylesheets
	   put back. What moved or changed size is listed, outermost first (an element inside one already listed and
	   moved with it is left out): [] when the old engine lays the page out as this one. */
	async function safari15Diff(slack = 2, tries = 3) {
		/* the live readouts (the output meter's bars and holds, the CPU meter's bar) move with the audio between the two
		   measures: their insides are left out, their boxes stay */
		const all = [...document.body.querySelectorAll("*")].filter(e => !e.closest("#journey-pointer") && !e.parentElement?.closest(".volf, #cpumeter"));
		const boxes = () => all.map(e => { const r = e.getClientRects().length ? e.getBoundingClientRect() : null; return r && [r.left, r.top, r.width, r.height]; });
		/* two frames and the fonts (a stylesheet read again declares its fonts again) */
		const frame = async () => { await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); if (document.fonts) await document.fonts.ready; await sleep(60); };
		const before = boxes(), sheets = [...document.querySelectorAll("style")], kept = sheets.map(x => x.textContent);
		let after;
		try { sheets.forEach(x => { x.textContent = DeskCompat.safari15(x.textContent); }); await frame(); after = boxes(); }
		finally { sheets.forEach((x, i) => { x.textContent = kept[i]; }); await frame(); }
		/* the page drew itself again meanwhile (its elements replaced): measure again */
		if (all.some(e => !e.isConnected) && tries > 1) { await sleep(400); return safari15Diff(slack, tries - 1); }
		const moved = [], seen = new Map();
		all.forEach((e, i) => {
			const a = before[i], b = after[i];
			if (!a && !b) return;
			if (!a || !b) { moved.push([e, b ? "shown" : "gone"]); seen.set(e, null); return; }
			const d = b.map((v, k) => Math.round(v - a[k]));
			if (d.every(v => Math.abs(v) <= slack)) return;
			seen.set(e, d);
			/* one already listed holds it and it only moved along (same size, same shift) */
			for (let p = e.parentElement; p; p = p.parentElement) if (seen.has(p)) { const q = seen.get(p); if (!q || (Math.abs(d[2]) <= slack && Math.abs(d[3]) <= slack) || (q[0] === d[0] && q[1] === d[1])) return; }
			moved.push([e, `${Math.round(a[2])}x${Math.round(a[3])} at ${Math.round(a[0])},${Math.round(a[1])} -> ${Math.round(b[2])}x${Math.round(b[3])} at ${Math.round(b[0])},${Math.round(b[1])}`]);
		});
		return moved.map(([e, what]) => describe(e) + " " + what);
	}
	/* Every view of an editor, two journeys from one list of {name, open(u, c), close(u, c), wait}:
	     <prefix>-old-webkit   in every run: each view laid out as WebKit 15 does is the same as here (safari15Diff)
	     <prefix>-shots-views  asked by name only: each view as a snapshot (scripts/mdmm-snap.py [--safari15] [--size])
	   A view that cannot open here (needs) is skipped. */
	function viewJourneys(prefix, views) {
		/* each view: open, look, close (in one step, so the next view starts from a closed page); every view's
		   differences are logged ("OLDWEBKIT <view> ...") and the last step fails on any of them */
		const step = (v, shots) => ({ say: v.name, act: async (u, c) => {
			c.diffs = c.diffs || {};
			const why = v.needs ? v.needs() : null;
			if (why) { Bridge.log(`OLDWEBKIT ${prefix}-${v.name} skipped: ${why}`); return; }
			try {
				await v.open(u, c); await sleep(v.wait ?? 700);
				if (shots) snapshot(`${prefix}-${v.name}`);
				else {
					const d = await safari15Diff();
					if (d.length) c.diffs[v.name] = d;
					Bridge.log(`OLDWEBKIT ${prefix}-${v.name} ${d.length ? d.length + ": " + d.join("; ") : "same"}`);
				}
			} finally { if (v.close) { await v.close(u, c); await sleep(300); } }
		} });
		const verdict = { say: "every view as here", screen: c => { const k = Object.keys(c.diffs || {});
			return ok(!k.length, k.map(n => `${n}: ${c.diffs[n].length} boxes laid out otherwise by WebKit 15 (${c.diffs[n].slice(0, 3).join("; ")})`).join(" | ")); } };
		return [
			{ name: `${prefix}-old-webkit`, proves: [], needs: () => typeof DeskCompat === "undefined" || !DeskCompat.safari15 ? "no DeskCompat.safari15" : null, steps: [...views.map(v => step(v, false)), verdict] },
			{ name: `${prefix}-shots-views`, proves: [], needs: () => location.search.includes(`${prefix}-shots`) ? null : "screenshots only when asked by name", steps: views.map(v => step(v, true)) }
		];
	}
	/* Review 1 (Radek, 2026-10-12, B-094): every modal locks. pressOutside() presses, releases and clicks where a person
	   would click beside the dialog (the window's bottom-left corner: the backdrop, or the question's own overlay), as a
	   browser sends it to whatever is there; it returns what was under the pointer.
	   modalLockJourney(name, dialogs): each dialog {name, sel, open(u, c), needs?()} opened, pressed outside (it stays,
	   on top), then Esc closes it. */
	function pressOutside() {
		const x = 6, y = innerHeight - 6, e = document.elementFromPoint(x, y);
		if (!e) return "nothing";
		for (const [k, T] of [["pointerdown", PointerEvent], ["mousedown", MouseEvent], ["pointerup", PointerEvent], ["mouseup", MouseEvent], ["click", MouseEvent]])
			e.dispatchEvent(new T(k, { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, buttons: k.endsWith("down") ? 1 : 0 }));
		return e.id || e.className || e.tagName;
	}
	const isOpen = sel => { const el = document.querySelector(sel); return !!el && !el.hidden; };
	/* a box as "x,y wxh" (rounded), and the keys that are not wholly inside it and in view (their words; "" when all are) */
	const boxOf = sel => { const el = document.querySelector(sel); if (!el || el.hidden) return "hidden"; const r = el.getBoundingClientRect(); return `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`; };
	const keysInside = (sel, keys) => { const el = document.querySelector(sel); if (!el) return "no panel"; const b = el.getBoundingClientRect();
		return [...document.querySelectorAll(keys)].filter(k => { const r = k.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
			return !(r.left >= b.left - 1 && r.right <= b.right + 1 && r.top >= b.top - 1 && r.bottom <= b.bottom + 1 && r.bottom <= innerHeight && (top === k || k.contains(top))); }).map(k => k.textContent.trim()).join(","); };
	const modalLockJourney = (name, dialogs) => ({
		name, proves: [],
		steps: dialogs.flatMap(d => [
			{ say: `open ${d.name}`, act: async (u, c) => { c.skip = d.needs ? d.needs() : null; if (c.skip) { Bridge.log(`JOURNEY ${name}: ${d.name} skipped: ${c.skip}`); return; } await d.open(u, c); await until(() => isOpen(d.sel), 4000); await sleep(250); },
				screen: c => c.skip ? true : ok(isOpen(d.sel), d.name + " not open") },
			{ say: `click outside ${d.name}: it stays open, on top`, act: async (u, c) => { if (c.skip) return; c.under = pressOutside(); await sleep(350); },
				screen: c => c.skip ? true : ok(isOpen(d.sel) && typeof Modal !== "undefined" && "#" + Modal.top() === d.sel, `${d.name} ${isOpen(d.sel) ? "open" : "closed"}, on top ${typeof Modal !== "undefined" ? Modal.top() : "-"}, pressed on ${c.under}`) },
			{ say: `press Escape: ${d.name} closes`, act: async (u, c) => { if (c.skip) return; u.key("Escape"); await sleep(250); },
				screen: c => c.skip ? true : ok(!isOpen(d.sel), d.name + " still open") }
		]),
		async tidy(u) { for (let i = 0; i < 4 && typeof Modal !== "undefined" && Modal.top(); i++) { u.key("Escape"); await sleep(200); } }
	});
	/* Review 1 (B-097): every key of the lock parameter panel shows its whole name, and its lock count beside it, never
	   over it: "" when all fit, else the keys that do not. At the window's size, and at 1280 wide where the plug-in can
	   size its window (gmView) */
	function lockKeysCut(sel = ".pk[data-lane]") {
		return [...document.querySelectorAll(sel)].filter(k => k.getClientRects().length).map(k => {
			const n = k.querySelector(".pkn"), i = k.querySelector("i"), b = k.getBoundingClientRect();
			if (!n) return k.textContent.trim() + ": no name";
			const r = n.getBoundingClientRect(), cut = n.scrollWidth > n.clientWidth + 1, over = i && i.getBoundingClientRect().left < r.right - 0.5, out = r.right > b.right + 0.5 || (i && i.getBoundingClientRect().right > b.right + 0.5);
			return cut || over || out ? `${n.textContent}${i ? "+" + i.textContent : ""} (${cut ? "cut " + n.scrollWidth + ">" + n.clientWidth : ""}${over ? " under the count" : ""}${out ? " out of its key" : ""})` : "";
		}).filter(Boolean).join(", ");
	}
	const lockKeysJourney = (name, setup) => ({
		name, proves: [],
		steps: [...setup,
			{ say: "every lock parameter key: its whole name, the count beside it", act: async (u, c) => {
				c.cut = {}; c.cut[innerWidth] = lockKeysCut();
				if (typeof window.gmView === "function") { const w0 = innerWidth, h0 = innerHeight; window.gmView(1280, 924); await until(() => innerWidth === 1280, 3000); await sleep(400); c.cut[innerWidth] = lockKeysCut(); window.gmView(w0, h0); await until(() => innerWidth === w0, 3000); }
				c.n = document.querySelectorAll(".pk[data-lane]").length; },
				screen: c => ok(c.n > 0 && Object.values(c.cut).every(x => !x), `${c.n} keys; ` + Object.entries(c.cut).map(([w, x]) => `${w}: ${x || "all fit"}`).join("; ")) }]
	});
	return { stateDiff, pageTier, noWire, cutText, spills, overlaps, canvasProblems, lockKeysCut, lockKeysJourney, pressOutside, modalLockJourney, boxOf, keysInside, run, demo, ok, sleep, until, recent, u, TIERS, tierOf, onScreen, osKeyPath, menu, editorMenuJourney, memoryJourney, cpuMeterJourneys, speedUpsMenuJourney, volumeJourneys, fitJourneys, snapshot, safari15Diff, viewJourneys };
})();
