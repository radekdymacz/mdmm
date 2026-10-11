# Design: the machine's menus on the page (layout for the manual gaps)

- 2026-10-10. Replaces §3 "The Library" of [PLAN-manual-gaps.md](PLAN-manual-gaps.md); the rest of that plan
  (transport, sequencer, keys, probes, slices) stays and is placed here on the page.
- The ask (Radek): see the layout first; think what goes where; resemble the machine's grouping ("does the hardware
  have a library?"); keep the layout we like, improve it.
- Mockups: `doc/modern-ux/mockup-next/md.html` and `mm.html` (review copies; the approved mockups stay untouched
  until this is accepted).

## 1. Where the machine keeps things (the manuals)

The hardware has **no library**. It has keys, and each key opens one menu:

| Machine key | Machinedrum (OS 1.63) | Monomachine (OS 1.32) |
|---|---|---|
| **KIT** | KIT window: LOAD, SAVE, EDIT KIT (machines, preview), copy / paste / clear kits in LOAD and SAVE (p.16-17) | KIT window: LOAD, SAVE, ASSIGN, TRIG, MULTI (1-18, 1-62, 1-66) |
| **SONG** | FUNCTION + KIT: SONG window: LOAD, SAVE (name, slot), EDIT; copy / paste / clear / undo in LOAD and SAVE (p.52-56) | KIT/SONG in song mode: the same SONG window (1-73..1-77) |
| **GLOBAL** | FUNCTION + PATTERN/SONG: GLOBAL EDIT, rows **CONTROL** (base channel, map editor, program change, local, mech), **SYNC** (tempo in/out, ctrl in/out), **ROUTING** (outputs, trig in A/B), **FILE** (SYSEX SEND, SYSEX REC, SAMPLE MGR), TURBO, the 8 slots (p.57-75) | FUNCTION + KIT/SONG: GLOBAL, rows **AUDIO** (master tune, routing), **CONTROL** (MIDI channels, control out 1 / out 2 / in, multimap edit, mech), **MIDI SEQ**, **FILE** (SYSEX SEND, SYSEX RECV, DIGIPRO MGR, +DRIVE, snapshots, Digibanks), the 8 slots (1-86..1-105) |
| **TEMPO** | TEMPO menu: BPM, tap, FUNCTION held = delayed change, LEFT / RIGHT = ±10 % nudge (p.36) | the same (1-56) |
| **PLAY · STOP · REC** | PLAY (again = pause), STOP (twice = all voices off), REC (grid; held + PLAY = live) | the same; STOP + REC = step recording |
| **FUNCTION +** | A/E mute · B/F accent · C/G swing · D/H slide; REC copy · PLAY clear · STOP paste (what they act on depends on the screen) | REC copy · PLAY clear · STOP paste; super copy / super clear |
| **Start-up menu** | hold FUNCTION at power on: empty reset, factory reset, soft reset, OS update (p.79) | the same (1-110) |

So the machine groups memory by **what it is** (kits under KIT, songs under SONG) and puts **files and the machine's
settings under GLOBAL** (FILE is a row of GLOBAL). Our page already does this for kits (the LCD KIT field opens the
kit library) and half of it for GLOBAL (MD only).

## 2. The decision: follow the machine's keys, share one window frame

Candidates:

- **A. One Library with tabs** (the plan's first draft). Consistent, but the machine has no such thing, and it
  splits GLOBAL (settings in one place, its FILE row in another).
- **B. The machine's keys: KIT, SONG, GLOBAL, TEMPO** each open their own window, as on the hardware. Every window
  uses **one shared frame** (head, slot grid, action bar, keys), so they look and work alike.
- **C. Leave as is and add pop-ups.** Seven layouts; the engine menu keeps growing.

**Pick: B.** An Elektron owner finds things where the machine has them; a new user still meets one window style
everywhere. It keeps what we like (the LCD, the workspaces, the kit library) and fills the holes in the same shape.

## 3. The page, before → after

### 3.1 Header (both editors)

**Revised 2026-10-10 (Radek): the layout stays as it is.** Workspaces Sequence, Sound, Mix, Sampler / Perform,
Song unchanged; the LCD and the transport (● ▶) unchanged; no MACHINE key group, no ■ key. The only header change:
the SETUP group gets a **SONG** key next to GLOBAL (`UNDO · REDO · SONG · GLOBAL · MKI`; the MM gets GLOBAL too).
KIT stays the LCD KIT field. TEMPO opens from the LCD tempo value. **One pager (Radek, same day): use the
desktop, not the hardware's nesting.** GLOBAL is one page with every card visible (no rail, no tabs, no sub-pages;
the machine's group names are only card titles); SONG is one page (slots + the selected song side by side); TEMPO
is a small popover. At most one level: the window itself. **Final shape (Radek: "tabs are fine, the main things
get a full nice page"):** GLOBAL opens a full page over the workspace area (header stays; Esc or GLOBAL returns),
with tabs SETTINGS · FILE · SAMPLES (MM: SETTINGS · FILE · DIGIPRO); the 8 slots in its head. Songs: no SONG key and
no pop-up; the Song workspace gets the song slots as a full-height left column beside the arrangement. KIT and
PATTERN keep their quick pop-ups; TEMPO a popover. The header does not change at all (the MM gains GLOBAL). **No duplicates (Radek):** the Sampler workspace and
the SysEx panel already exist, so GLOBAL is the settings only (one full page, no tabs); export ranges, SPECIFIC
PLACE and VERIFY go into the existing SysEx panel (MM DigiPRO waveforms, after the probe, become one more kind
there); reset is an engine-menu item "Reset machine…" with a confirm dialog. Pause = ⇧-click ▶ / ⇧Space; pause and panic are
also in ▶'s right-click menu. Everything else lives in the GLOBAL window. The sketch below is the first draft,
kept for the record.

```
BEFORE
[MACHINEDRUM EDITOR] [WORKSPACE: SEQ SOUND MIX SAMPLER SONG]  [LCD: engine | ● ▶ | TEMPO | POSITION | PATTERN | KIT | LOCKS]  [SETUP: UNDO REDO GLOBAL MKI]
                                                              [row 2: LEN SPD SWG ACC MODE ... | SYNC | Copy Clr Paste]
AFTER
[MACHINEDRUM EDITOR] [WORKSPACE: SEQ SOUND MIX SAMPLER SONG]  [LCD: engine | ● ▶ ■ | TEMPO | POSITION | PATTERN | KIT | SONG | LOCKS]  [MACHINE: KIT SONG GLOBAL TEMPO] [UNDO REDO MKI]
                                                              [row 2: LEN SPD SWG ACC MODE ... | SYNC | COPY CLR PASTE ▾]
```

- **Transport becomes the machine's three keys: ● REC · ▶ PLAY · ■ STOP.** On the keys the machine's own meaning:
  PLAY while playing = **pause** (PLAY again continues), STOP = stop, **STOP twice quickly = panic** (all voices
  off), ⇧-click REC = MM step recording. The keyboard stays DAW-like: Space = play / stop, ⇧Space = pause,
  ⌥Space = live record, ⌘. = panic.
- **A new key group "MACHINE": KIT · SONG · GLOBAL · TEMPO**, the four keys of the hardware that open its menus.
  The LCD fields still open them too (KIT field → KIT, a new SONG field → SONG, the tempo value → TEMPO), as today.
  GLOBAL moves here from SETUP. The MM gets the same group (today it has no GLOBAL key).
- **SETUP keeps UNDO, REDO, MKI/MKII.**
- **The LCD's COPY · CLR · PASTE** are the machine's FUNCTION + REC / PLAY / STOP: a plain click acts as today; the
  small ▾ opens "Copy… / Clear… / Paste… what" (the manual's SUPER COPY / SUPER CLEAR, both editors).
- **The engine menu** keeps engine, ROM, AUDIO/MIDI; its "GLOBAL…", "Export SysEx…" and "Import SysEx…" open the
  GLOBAL window at the right row (shortcuts, not a second home).

### 3.2 The window frame (shared by KIT, SONG, GLOBAL, PATTERN)

```
┌ KIT ─ K01 WAREHOUSE · edited ─────────────── LOAD  SAVE  SAVE AS  COPY  PASTE  CLEAR  RENAME ─── Esc ┐
│ [rail]            │ [slot grid: 8 × 8 tiles, current lit, edited LED, linked patterns]  │ [detail]       │
│  LOAD / SAVE      │                                                                    │ name, machines │
│  (MM: ASSIGN,     │                                                                    │ linked pats    │
│   TRIG, MULTI →   │                                                                    │                │
│   links to the    │                                                                    │                │
│   Perform page)   │                                                                    │                │
└ arrows move · Enter load · F2 rename · ⌘C ⌘V · Delete clear · drag a tile onto another = copy ────────┘
```

- One frame (`skins/shared/deskWindow.js`): head (the machine's name for the window, the current item, the action
  keys), an optional **rail** on the left (the machine's menu rows), the body (a slot grid or cards), a footer with
  the keys. Same keys in every window. HW MIDI on the MM: a write waiting for SYSEX RECV shows "SEND n" in the head.
- **KIT**: today's kit library in the frame. No change of function.
- **PATTERN** (pattern chooser): today's, in the frame (banks A–H on the rail).

### 3.3 SONG window (new; I-011)

```
┌ SONG ─ 01 FIRST SONG · 14 rows · 3:12 ────── LOAD  SAVE  SAVE AS  COPY  PASTE  CLEAR  RENAME ─── Esc ┐
│ 32 tiles (MM 24): number, name, rows, length; current lit; edited LED when its rows changed since save│
│ detail: the song's rows as a strip (pattern pads), first row, loops                                   │
└ Enter load · EDIT → the Song workspace · F2 rename · ⌘C ⌘V · Delete · drag = copy ────────────────────┘
```

- LOAD = load the song (stopped, as today's MM button); SAVE / SAVE AS = the machine's SAVE SONG with a name
  (MD 0x6D needs a builder; MM `saveSong` exists); EDIT jumps to the Song workspace, which stays the editor.
- The LCD gets a **SONG** field (number + name) beside KIT. Its wheel still steps songs; a click opens SONG.

### 3.4 GLOBAL window (MD moved, MM new)

```
┌ GLOBAL ─ slot 1 of 8 ─ [1][2][3][4][5][6][7][8]  COPY  PASTE  CLEAR ───────────────────────────── Esc ┐
│ rail (the machine's rows)  │ cards of the row                                                         │
│  MD: CONTROL               │  CONTROL: base channel · program change in/out/channel · local · MAP     │
│      SYNC                  │           EDITOR (16 track notes + LEARN dots, map a note, RESET MAP)    │
│      ROUTING               │  SYNC:    tempo in/out · ctrl in/out                                     │
│      FILE                  │  ROUTING: track outputs A–F/MAIN · trig in A/B                           │
│  MM: AUDIO                 │  FILE:    SYSEX SEND · SYSEX RECEIVE · SAMPLE MGR (MD) / DIGIPRO MGR (MM)│
│      CONTROL               │           · RESET (the start-up menu)                                    │
│      MIDI SEQ              │  MM AUDIO: master tune · routing mode                                    │
│      FILE                  │  MM CONTROL: MIDI channels (base, span, multi trig, multi map, auto) ·   │
│                            │           control out 1/2 · control in · multimap (link to Perform)      │
└ ↑ ↓ rows · Esc closes · every change is stored on the machine and made active ────────────────────────┘
```

- The 8 slot keys sit in the head on every row (the active slot lit; click = make active; COPY / PASTE / CLEAR act
  on the selected slot).
- **FILE row** (one card each):
  - **SYSEX SEND**: ALL, or kinds with ranges (kits 1–64, patterns A01–H16, songs, globals one or all) → one .syx.
  - **SYSEX RECEIVE**: Open .syx… → today's import panel, now with **ORIGINAL PLACE / SPECIFIC PLACE (first slot) /
    VERIFY only**, the machine's three words.
  - **SAMPLE MGR** (MD): slots and memory as a summary, OPEN SAMPLER (the workspace stays the editor). Says plainly
    what only the machine's panel does (send to computer, erase, RAM→ROM).
  - **DIGIPRO MGR** (MM MKII, after the probe): 64 user waveforms: receive from .syx, send to .syx, names.
  - **RESET** ("the machine's start-up menu"): EMPTY (asks twice), FACTORY (MD only, after the probe).
- B-026 on the MM: the refusal ("track outside CHANNEL SPAN") gets a **Set channels…** button → GLOBAL › CONTROL.

### 3.5 TEMPO window (new, small, under the tempo value)

```
┌ TEMPO ─────────────────────────────┐
│  124.0  BPM   [−] [+]   TAP (B)     │
│  NUDGE  [◂ −10 %]  [+10 % ▸]  hold  │
│  [ ] change on release (FUNCTION)   │
│  MM: sync INT / EXT (link GLOBAL)   │
└─────────────────────────────────────┘
```

- Hold ◂ / ▸ (or the keys - / =) = the machine's nudge; release = back. "Change on release" makes a drag of the
  tempo wait until let go (also ⌥-drag on the tempo, FUNCTION = ⌥).

### 3.6 Workspaces (the layout we like stays; additions only)

| Workspace | MD | MM |
|---|---|---|
| **Sequence** | Under the grid, a **FUNCTION strip** named like the machine's keys: `B/F ACCENT · C/G SWING · D/H SLIDE`, one thin row each with `ALL | TRK` (EDIT ALL) and its amount (accent amount, swing %); in ALL a 16-dot track picker says which tracks take it. Track header right-click: Copy… / Paste… / Clear… / Mute / Solo. Step menu gains Swing. Live recording: hold Delete erases. | Selection on the roll (⌘), the step menu (Note off, Trigless, Chord, Slide, Fill, Copy, Cut, Paste here, Duplicate, Clear, Lock current value). **STEP** recording: ⇧-click REC or `I`: a step cursor, a played note writes and moves on. Track header menu as MD. |
| **Sound** | LFO card header menu: Copy / Paste / Clear LFO. Machine picker: ▶ / Space auditions, Enter keeps, Esc puts back. | — |
| **Mix** | **LEV** above VOL on each strip, with a bar of the stored value. | — |
| **Song** | Enter on a row = play from here (after the probe). | same |
| **Sampler / Perform** | unchanged (Sampler links from GLOBAL › FILE › SAMPLE MGR) | multi map: all 128 patterns |

## 4. What a user relearns

1. GLOBAL moved from SETUP to the MACHINE group (same key, next to KIT and SONG).
2. PLAY while playing pauses (it used to stop); STOP is its own key. Space is unchanged.
3. Export / Import SysEx live in GLOBAL › FILE (the engine menu still opens them).

## 5. Open for Radek

| # | Question | Option 1 | Option 2 | Recommend |
|---|---|---|---|---|
| M1 | Window shape | **the machine's keys, one shared frame** | one Library with tabs | 1 |
| M2 | PLAY key while playing | **pause, as the machine** (Space still stops) | stop, as today | 1 |
