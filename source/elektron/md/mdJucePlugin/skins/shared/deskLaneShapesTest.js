"use strict";
/* The lane shapes' maths (deskLaneShapes.js): the shapes' ends, Flat's five levels down to 0, a 0 kept as a value by every
   mix, the tools' ranges, and Flat's 0 % icon told apart from the others.
     node deskLaneShapesTest.js */
const fs = require("fs"), path = require("path"), vm = require("vm");
let failures = 0;
const check = (ok, what) => { console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) failures++; };
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "deskLaneShapes.js"), "utf8") + "\nthis.T = { LANE_SHAPES, LANE_FLAT, laneShapeAt, laneMix, laneTool, laneFlatSvg };", ctx);
const { LANE_SHAPES, LANE_FLAT, laneShapeAt, laneMix, laneTool, laneFlatSvg } = ctx.T;
check(LANE_SHAPES.length === 8, "eight shapes");
check(laneShapeAt("up", 0) === 0 && laneShapeAt("down", 0) === 1 && laneShapeAt("tri", .5) === 1 && laneShapeAt("square", .25) === 1 && laneShapeAt("square", .75) === 0, "ramps, triangle and square");
check(LANE_FLAT.map((_, i) => Math.round(laneMix("replace", 64, laneShapeAt("flat", 0, i) * 127))).join() === "64,95,127,32,0", "Flat: 50, 75, 100, 25, then 0 % (lock values 64, 95, 127, 32, 0)");
check(laneMix("replace", 64, 0) === 0 && laneMix("scale", 100, 0) === 0 && laneMix("sub", 10, 127) === 0, "a 0 is a value in every mix (and 127 is the top)");
check(laneMix("add", 120, 127) === 127 && laneTool("invert", 0) === 127 && laneTool("invert", 127) === 0, "ranges 0..127; invert swaps the ends");
check(laneTool("shrink", 127) < 127 && laneTool("stretch", 100) > 100 && laneTool("human", 64, 1) === 72, "scale down, scale up, human");
check(new Set(LANE_FLAT.map((_, i) => laneFlatSvg(i))).size === 5 && !laneFlatSvg(4).includes("opacity"), "five different Flat icons; at 0 % the baseline is gone");
process.exit(failures ? 1 : 0);
