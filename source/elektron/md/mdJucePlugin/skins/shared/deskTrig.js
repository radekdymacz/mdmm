"use strict";
/* The trig square on a Mix strip's head, both editors (the Machinedrum's .strip, the Monomachine's .strip6): it flashes
   once, in the accent colour, when its track trigs while the sequencer plays (the page's own step and the pattern's
   trigs: no new firmware traffic) and when the track is played from the keyboard. Callers pass only the tracks that are
   audible: a muted track, or one a solo leaves out, never flashes (a dimmed flash read worse than none).
   Cheap by construction: every call of a frame is collected and drawn in one requestAnimationFrame (one reflow to
   restart the CSS animation, deskTrig.css); nothing is rebuilt, no timer runs, the square goes out by itself.
   DeskTrig.count[t] is how many times track t flashed (for the journeys). ES2020, as the other shared files. */
const DeskTrig = (() => {
	const due = new Set(), count = {};
	let queued = false;
	function draw() {
		queued = false;
		const els = [];
		for (const t of due) for (const e of document.querySelectorAll(`.trigsq[data-trig="${t}"]`)) { e.classList.remove("fl"); els.push(e); }
		due.clear();
		if (!els.length) return;
		void document.body.offsetWidth;	/* one reflow for all: the animation starts again */
		for (const e of els) e.classList.add("fl");
	}
	function light(tracks) {
		for (const t of tracks) { due.add(t); count[t] = (count[t] || 0) + 1; }
		if (!queued && due.size) { queued = true; requestAnimationFrame(draw); }
	}
	return { light, count };
})();
if (typeof module !== "undefined") module.exports = DeskTrig;
