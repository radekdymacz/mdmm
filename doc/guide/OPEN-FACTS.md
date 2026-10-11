# Open facts

Facts the chapter writers could not confirm from the code. Each is left out of the guide or written as the code
does it. Slice 5 (journeys on the running editor) answers them; then the chapter and, where needed, the row in
doc/features/*.json are fixed, and the line is deleted here.

## Machinedrum

- MD-053, Clear machine: the map's note says the machine becomes GND-EMPTY; `clearSound` keeps the machine and
  resets the values (level 100). The guide follows the code. Fix the row note once a journey confirms.
- The FN key in the top bar is listed in the key map's tips but not found in mdStudio.html. Left out.
- Which LFO may modulate which: left to the machine, not described.
- AUDIO / MIDI settings: written as standalone only. Confirm the plug-in has no such entry.
- The LFO parameter list (LFOS / LFOD / LFOM in the PARAM menu) rests on the row note only.
- MD-133: swing marks in a selection copy. The copy code shows none; the guide says so.
- MD-207: "384 CC" omitted.
- MD-200: sample rate and bit depth. The guide says 44.1 kHz at most, mono, 16-bit.
- MD-176 to MD-180: Import and Export SysEx sit in the kit library and pattern chooser headers, not the engine
  menu. The rows' `where` looks stale: fix them.
- MD-196: `<MEM>` is an estimate computed from sample length.
- MD-164: base channel OFF can be shown, not set.
- Alt-drag undo: BUGS.md lists B-023 fixed for 0.3.5, but the guide makes no undo claim yet. Confirm with a
  journey, then add it.

## Monomachine

- The tempo range.
- LFO INTL and SPD: what each value does; what the shape names mean.
- Whether the HW MIDI engine changes the kit library steps.
- The grid-record light with the real engine.
- Envelope times ("DEC 64 = 0.55 s"): from page tooltips and the 0.5.0 notes, not measured here.
- The machine count: MM-004 says 14, the picker lists 15 with GND-GND. No count written.
- Song mode: what [SPACE] does after a second stop; whether a song goes on after a HALT row.
- Song step menu Clear: does it drop only a step's locks (row kept partial).
- MM-214: how to make a pitchless trig.
- MM-169: lengthening with LEN copies lower pages (only x2 stated).
- Which engines can mute MIDI tracks.
- MM-187: track copy, which steps it writes.
- The joystick tab hints ("Tabletop"): not described.
- The LCD has no PTRN field; the PAT box is in Transpose. Check every chapter that names an LCD field.
