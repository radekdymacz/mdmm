"use strict";
/* The lock lane's shapes (both editors; the lane toolbox of mdStudio/mdDeskLaneTools.js, the MM page's own). Pure data and
   maths, no page state: the shapes as a function of x (cycles over the steps, 0..1 a cycle) to 0..1, the levels Flat
   steps through, the tools' maths on one value, and the icons. The shapes are the xox-plocks lane's (ours, copied). */
const LANE_SHAPES = [
	["up", "Ramp up", x => x % 1, '<path d="M2 12L14 4"/>'],
	["down", "Ramp down", x => 1 - x % 1, '<path d="M2 4L14 12"/>'],
	["tri", "Triangle", x => 1 - Math.abs(2 * (x % 1) - 1), '<path d="M2 12L8 4L14 12"/>'],
	["sine", "Sine", x => .5 - .5 * Math.cos(2 * Math.PI * x), '<path d="M2 12C5 12 5 4 8 4S11 12 14 12"/>'],
	["square", "Square", x => x % 1 < .5 ? 1 : 0, '<path d="M2 12V4H8V12H14V4"/>'],
	["decay", "Decay", x => Math.pow(1 - x % 1, 3), '<path d="M2 4C4 11 8 12 14 12"/>'],
	["random", "Random", () => Math.random(), '<path d="M2 9L4 5L6 11L8 3L10 10L12 6L14 8"/>'],
	["flat", "Flat", null, null]];
/* Flat steps through its levels, one each press: the middle, 75 %, 100 %, 25 %, 0 */
const LANE_FLAT = [.5, .75, 1, .25, 0];
/* a shape's value (0..1) at x; flat: the level's index */
const laneShapeAt = (id, x, flat) => id === "flat" ? LANE_FLAT[flat] : LANE_SHAPES.find(s => s[0] === id)[2](x);
/* the new lock from the old one e and the shape's value v (0..mx; mx the parameter's top, 127 for most): replace, add (around the middle), sub,
   scale; a 0 is a value */
const laneMix = (mode, e, v, mx = 127) => Math.round(Math.max(0, Math.min(mx, mode === "add" ? e + (v - mx / 2) : mode === "sub" ? e - (v - mx / 2) : mode === "scale" ? e * v / mx : v)));
/* the tools on one lock e: human (a little random), shrink / stretch (round the middle), invert */
const laneTool = (id, e, rnd = Math.random(), mx = 127) => { const mid = Math.round(mx / 2), k = mx / 127; return Math.round(Math.max(0, Math.min(mx, id === "human" ? e + (rnd * 2 - 1) * 8 * k : id === "shrink" ? mid + (e - mid) * .75 : id === "stretch" ? mid + (e - mid) * 1.33 : mx - e))); };
/* Flat's icon at a level: its line; at 0 % the line is on the bottom edge in full colour and the faint baseline is gone, so it differs from every other level */
const laneFlatSvg = level => { const y = (14 - LANE_FLAT[level] * 12).toFixed(1); return `<path d="M2 ${y}H14"${LANE_FLAT[level] === 0 ? ' stroke-width="2.4"' : ""}/>${LANE_FLAT[level] === 0 ? "" : '<path d="M2 14H14" opacity=".3"/>'}`; };
