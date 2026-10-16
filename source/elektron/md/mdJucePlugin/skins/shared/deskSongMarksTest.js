"use strict";
/* The marks on an arrangement cell (SongMarks in deskSongSlots.js, both editors, I-039): what a row's tempo, mutes and
   transpose say in the cell's small line, and what the tooltip says. A row with none says nothing.
     node deskSongMarksTest.js */
const fs = require("fs"), path = require("path"), vm = require("vm");

const ctx = vm.createContext({ console, document: undefined });
vm.runInContext(fs.readFileSync(path.join(__dirname, "deskSongSlots.js"), "utf8") + "\nthis.T = { SongMarks };", ctx);
const { SongMarks } = ctx.T;
let failures = 0;
const check = (ok, what) => { console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) failures++; };
const text = (r, k = "md") => SongMarks.marks(r, k).text;

/* ---- none ---- */
check(text({ rep: 1 }) === "" && !SongMarks.marks({ rep: 1 }, "md").any, "MD, a plain row: no marks");
check(text({ rep: 2, ofs: 4, len: 8 }) === "", "repeats and a part are not marks (they keep their own signs)");
check(text({ rep: 1, mutes: [], bpm: undefined }) === "", "no mutes, no tempo: nothing");
check(text({ rep: 1, trn: 64, ttr: Array(12).fill(64) }, "mm") === "" && SongMarks.marks({ rep: 1, trn: 64 }, "mm").title === "", "MM, centred transpose: nothing, and no tooltip");
check(text({ type: "loop", to: 0, count: 2, bpm: 99 }) === "", "a command row has no marks");
check(text(null) === "", "no row: nothing");

/* ---- one thing ---- */
check(text({ rep: 1, bpm: 120 }) === "120", "BPM only: the number");
check(text({ rep: 1, mutes: [2, 5, 7] }) === "M3", "mutes only: M and the count");
check(text({ rep: 1, mutes: [0] }, "mm") === "M1", "one mute: M1");
check(text({ rep: 1, trn: 66 }, "mm") === "+2", "transpose up: +2");
check(text({ rep: 1, trn: 61 }, "mm") === "-3", "transpose down: -3");
const t = Array(12).fill(64); t[3] = 67;
check(text({ rep: 1, ttr: t }, "mm") === "T±", "per-track transpose only: T±");

/* ---- together, in the order tempo, mutes, transpose, per track ---- */
check(text({ rep: 1, bpm: 120, mutes: [1, 2, 3], trn: 66 }, "mm") === "120 M3 +2", "BPM, mutes and transpose: 120 M3 +2");
check(text({ rep: 1, bpm: 87, mutes: [4], trn: 63, ttr: t }, "mm") === "87 M1 -1 T±", "all four: 87 M1 -1 T±");
check(text({ rep: 1, bpm: 300, mutes: Array.from({ length: 16 }, (_, k) => k) }) === "300 M16", "the widest MD mark: 300 M16");

/* ---- the pips and the markup ---- */
const pips = (r, k = "md") => SongMarks.marks(r, k).pips;
check(pips({ rep: 1 }) === "" && SongMarks.html({ rep: 1 }, "md") === "", "a plain row: no pips and no markup at all");
check(pips({ rep: 1, bpm: 120, mutes: [1, 2, 3], trn: 66, ttr: t }, "mm") === "bmtk", "all four: pips in the order tempo, mutes, transpose, per track");
check(pips({ rep: 1, mutes: [3] }) === "m" && pips({ rep: 1, bpm: 90 }) === "b", "one pip for one thing");
const h = SongMarks.html({ rep: 1, bpm: 120, mutes: [1] }, "md");
check(/data-rowmarks="1"/.test(h) && /<span class="rt">120 M1<\/span>/.test(h) && /class="pb"/.test(h) && /class="pm"/.test(h) && !/class="pt"/.test(h), "the markup holds the words, the pips present and the click hook: " + h);

/* ---- the tooltip ---- */
const tip = SongMarks.marks({ rep: 1, bpm: 120, mutes: [7, 1], trn: 66, ttr: t }, "mm").title;
check(/Tempo 120 BPM/.test(tip) && /Muted: T2, M2/.test(tip) && /Transpose \+2/.test(tip) && /Per track: T4 \+3/.test(tip), "MM tooltip names tempo, the muted tracks (sorted), transpose, per-track values: " + tip);
check(/Muted: Track 3, Track 16/.test(SongMarks.marks({ rep: 1, mutes: [15, 2] }, "md").title), "MD tooltip names the tracks");
check(SongMarks.marks({ rep: 1, bpm: 90 }, "md").any === true, "any is true when there is a mark");

console.log(failures ? `deskSongMarksTest: ${failures} failure(s)` : "deskSongMarksTest: PASS");
process.exit(failures ? 1 : 0);
