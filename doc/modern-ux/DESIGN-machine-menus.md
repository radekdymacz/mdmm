# Design: the manual gaps on the page (approved layout)

- **Approved by Radek 2026-10-11** after five review rounds. Mockups: `doc/modern-ux/mockup-next/md.html` and
  `mm.html` (open over http from the repo root; the REVIEW strip at the bottom left opens each state), screenshots in
  `mockup-next/shots/`. They are drawn on main at 0.5.0 and add only what 0.5.0 does not have.
- What is missing and why: [FEATURE-MAP-MD.md](FEATURE-MAP-MD.md), [FEATURE-MAP-MM.md](FEATURE-MAP-MM.md). How it is
  built: [PLAN-manual-gaps.md](PLAN-manual-gaps.md) (the waves of slice 8 of `doc/release/PLAN-0.6.md`).

## 1. Principles (from the review rounds)

1. **The layout stays.** Header, LCD, workspaces (Sequence, Sound, Mix, Sampler / Perform, Song) and the ● ▶ keys do
   not change. New things go where the machine keeps them, inside what exists.
2. **No duplicates.** One place for each function. The Sampler and the SysEx panel already exist and get the
   additions; no second home for samples or files.
3. **Like the machine.** Group as the hardware does (KIT, SONG, GLOBAL, TEMPO, FUNCTION + B/F C/G D/H, SUPER COPY) and
   use its names, but do not copy its nesting: the desktop shows a whole page at once.
4. **No right-click for main things.** Every function has a visible control; the only right-click menu is ▶'s
   (pause, panic), and both also have keys.
5. **Same concept, same control on MD and MM.**

## 2. What changes, screen by screen

| Place | Change | Shots |
|---|---|---|
| ▶ key | ⇧-click or ⇧Space = pause (▶ blinks, the position stays); right-click ▶ = Play, Pause, Record, Panic (⌘.) | md-02, md-03, mm-02 |
| LCD COPY · CLR · PASTE | a small ▾ opens Copy / Clear / Paste **what**: ticks grouped PATTERN (trigs or notes, melody on MM, accent, swing, slide, locks, arp and transpose on MM) and KIT (machine + sound, LFO on MD); Paste adds the target tracks; the ticks are remembered (the machine's SUPER COPY / SUPER CLEAR) | md-04..06, mm-03, mm-04 |
| LCD tempo | a click (no drag) opens the TEMPO pop-up: BPM, − / +, TAP, NUDGE −10 % / +10 % (hold; also hold - / =), "change on release" (also ⌥-drag the tempo), MM sync INT / EXT | md-07, mm-05 |
| GLOBAL key | 0.5's shared GLOBAL panel becomes a full page over the workspace (header stays; Esc or GLOBAL returns). Head on one line: slot chip, 8 slots, **Copy · Paste · Clear** (new), Reset to defaults. MD adds **LEARN** dots on the map editor's track notes and **Reset map**; MM adds an **AUDIO** card with master tune | md-08, mm-06 |
| Engine menu | Import SysEx…, Export SysEx…, **Reset machine…** (a question: Empty reset in red, Factory reset on the MD after its probe, Cancel the default) | md-09, md-12, mm-07, mm-10 |
| SysEx panel, export | ALL ticked by default; unticked shows kinds with ranges (drag, wheel or click like any value); MM DigiPRO waveforms as a kind after its probe | md-10, md-10b, mm-08, mm-08b |
| SysEx panel, import | PLACE: ORIGINAL or SPECIFIC with a first slot per kind; the grid previews where each item lands (and must warn when it lands on a used slot); **VERIFY ONLY** key beside Import | md-11, mm-09 |
| Sequence, MD | the legend under the grid **is** the trig type selector: Trig · Accent · Swing · Slide (Has locks stays a legend item); the chosen key is lit; swing is a new teal slant mark on the step; with Accent, Swing or Slide chosen, **All tracks · This track** (the pattern's EDIT ALL flag) and dots on the track headers (which tracks take it). ⇧-click accent and ⌥⇧-click slide stay | md-01, md-13 (+mk2) |
| Sequence, MM | Note · Slide · Swing keys in the row under the roll (the old slide and swing rows go); marks along the foot of the roll; in Slide or Swing a whole step column is the target; hint "Click a step's column to paint slide / swing · Esc: Note". **Step recording**: ⇧-click REC (no key: I and G are taken); a banner, a step cursor, a played note writes and moves on, → rest, ← back, Delete clears, Esc done | mm-11, mm-12 |
| Sound, MD | LFO card ⋯ menu: Copy LFO, Paste LFO, Clear LFO. Machine picker: ▶ on the hovered or selected machine (or Space) auditions; Enter keeps, Esc puts the old one back | md-14, md-15 |
| Mix, MD | **LEV** box above the VOL fader on each strip (the machine's per-track level; drag, wheel, double-click 100; a thin bar of the stored value) | md-16 |
| Song | a **song slots** column on the left (Load · Save · Save to… · Copy · Paste · Clear · Rename; empty slots quiet; MD 32, MM 24); one pattern palette with **PATTERN · CHAIN · SONG** plate keys (what plays and what a pad click does: go to the pattern, chain it live, add a song row); the selected-row inspector only in SONG; **▶ From here** and Enter on a row (after its probe) | md-17 (+mk2), md-18, mm-13, mm-14 |

## 3. Keys added

| id | Key | Both |
|---|---|---|
| `pause` | ⇧Space, ⇧-click ▶ | ✓ |
| `panic` | ⌘. | ✓ |
| `tempo-nudge` | hold - / = | ✓ |
| `tempo-delayed` | ⌥-drag the tempo | ✓ |
| `copy-what` / `paste-what` / `clear-what` | ⌘⇧C / ⌘⇧V / ⌘⇧⌫ | ✓ |
| `trig-type` | Esc back to Trig / Note | ✓ |
| `song-play-from` | Enter on a song row | ✓ |
| `live-erase` | hold Delete while live recording | ✓ |
| `step-record` | ⇧-click REC (no key) | MM |
| `picker-audition` | Space in the machine picker | MD |

## 4. Not done (the firmware has no route from outside)

MD: send samples to a computer, erase samples, RAM → ROM, the UNDO KIT slot. MM: factory reset (no factory data in
the editor). Probe-gated (decided by `PROBES-manual-gaps.md`): song play-from-row and pause over HW MIDI (SPP +
Continue), MM CONTROL OUT 1, MD trig in A/B editing, MM DigiPRO, MD factory reset, MD panic over MIDI.
