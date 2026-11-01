# Open facts

Facts the chapter writers could not confirm from the code. Each is left out of the guide or written as the code does it. A fact is closed when the repository proves it; the chapter is then fixed and the line moves to "Closed" with its proof. What is left needs the firmware or the real machines. The file is empty when a journey or a firmware check has answered every line below "Open".

## Open

### Firmware: a small addition to an existing firmware test would answer it

- MD, LFO order: which LFO may modulate which. The guide says the machine decides. `stackedLfoFirmwareTest` (stacked LFOs on one target) could add one LFO that targets another track's LFOS and read back the speed.
- MM, LFO INTL and SPD: what each value does, and what the eleven shapes look like on the firmware. `stackedLfoFirmwareTest --mm` already measures a hit's pitch under a SAW LFO; INTL and the other shapes would be more scenarios in its table, with the measured curve compared with the page's LFO picture.
- MM, song mode: what [SPACE] does after a second stop, and whether a song goes on after a HALT row. `mmDeskFirmwareTest songRowPlayhead` writes song 24 with a loop row; a HALT row (a loop that points at itself) and a second stop and start would answer both.

### Hardware or Radek: no emulator check can answer it

- MM, HW MIDI engine and the kit library steps: whether the library steps behave as on the emulator with a real Monomachine (ROADMAP F1).
- MM, grid recording with a real machine: whether its light follows the editor's record key. Over MIDI the modes cannot be switched at all (see the closed line), so only a real machine shows the light.
- MM, the tabletop joystick: that the real SFX-6 pad sends what the page's hints say (the page and `mm-perform-joystick-assign` prove only what the editor sends).

## Closed

### Machinedrum

- MD-053, Clear machine: the machine picker's GND-EMPTY takes the machine away; **Clr** keeps it and resets the values (level 100). Journey `md-sound-keep-clear` (picks GND-EMPTY, undoes). The row note and the guide say so.
- The FN key: the latch was removed in 0.3.5 (`mdDeskPageTest.js`: "no FN latch any more"; the top bar's GLOBAL key took its place). The note on **FN** is out of the pattern chapter. The keyboard view still names the layer "⌥ / FN". The key tips `tip-fn` and `tip-hold-alt` in `mdDeskKeys.js` and `keymap.json` still say "click FN in the top bar": stale text in the page, to be fixed in code.
- Which LFO may modulate which: written as a limit. The guide says the machine applies its own rule.
- AUDIO / MIDI settings: standalone only. `PageEditor::openAudioMidiSettings` returns false unless standalone; in a plug-in the panel (`deskAudio.js`) says the host owns audio and MIDI. The MIDI chapter says so.
- The LFO parameter list (LFOS, LFOD, LFOM): read off the machine's own LCD in B-082 (the routing page shows them) and checked by `elektronDataTest`. The page's LFO row uses the same kit parameters (`mdDeskSoundGroups.js`).
- MD-133, swing marks in a selection copy: the copy takes them. `takeSteps` in `mdDeskEdit.cpp` stores trigs, accents, slides, swings and locks; `mdDeskTest.cpp` ("accents, slides and swings are pasted with their steps"). The guide says so.
- MD-207, 384 CC: 16 tracks of 24 parameters (`MdKit::g_paramsPerTrack`). A row in the specifications table.
- MD-200, sample rate and bit depth: the editor sends mono 16-bit at 44.1 kHz at most (`g_mdSampleMaxRate`, `mdSamples.h`); the machine keeps RAM samples as 12-bit codes (same file). The guide's sentence stands.
- MD-196, `<MEM>`: worked out by the editor from the samples it reads (row note); the sample chapter says the machine reports no figure.
- MD-164, base channel OFF: shown, not set. `mdDeskTest.cpp` refuses base channel 13; `mdDeskGlobal.js` steps from OFF back to channel 1. The global chapter says so.
- Alt-drag undo: B-023 (fixed 0.3.5), journey `md-sound-control-all` (Alt-drag with the value focused, then Cmd+Z puts every track back). The sound chapter says one undo step.

### Monomachine

- The tempo range: 30 to 300 BPM, the command table (`mmDeskModel.cpp`, `tempo`). The tempo chapter already says so.
- Envelope times: measured on the firmware in B-049, `mmDeskFirmwareTest ampenv` (ctest `mmAmpEnvelopeFirmwareTest`): ATK 64 reaches 90 % in 0.14 s, DEC 64 is down 20 dB in 0.55 s. The track effects chapter's figures stand.
- The machine count: `mmMachines()` lists 22 machines, 15 for a synth track (GND-GND, GND-SIN, GND-NOIS, SID, 3 SWAVE, 4 DPRO, 3 FM+, VO-6) and 7 FX. MM-004 said 14 (without GND-GND). The row note and Appendix A now say 22 and 15.
- Song step menu Clear: **Clear** in the step menu is `clearSteps`: it takes the note, the slide and the locks (`setStep` clears the locks of any step that is not a note on). **Clear locks (keep the notes)** is the other one. Both in the pattern composing chapter.
- MM-169, lengthening: the editor's LEN writes the length only (`length` in `mmDeskEdit.cpp`); only **×2** copies. The scale setup says so.
- Which engines can mute MIDI tracks: the emulator only. `cmdMuteMidi` presses the MUTE window and `mmDeskFirmwareTest p4` proves it; over HW MIDI the capability `midiMutes` refuses it (no MIDI message). The mute chapter says so.
- The grid-record light over HW MIDI: the capability `gridRecord` refuses the mode switch over MIDI (RECORD has no MIDI message). The pattern composing chapter says so. The light itself on a real machine stays open above.
- MM-187, track copy: all 64 steps of the track (`mmDeskEdit.cpp`, track parts), with the parts ticked. The track copy section says so.
- The joystick tab hints: the pad sends pitch bend, CC 1 and CC 2 (journey `mm-perform-joystick-assign`, hints in `110-perform.js`). The joystick section now names the three tabs.
- The LCD has no PTRN field: the pattern's transpose is the **PAT** box in the Transpose tab. Every field the Monomachine and Machinedrum chapters write in angle brackets was checked against the page (`60-ui.js`, `mdDeskTop.js`): all exist, the pattern field is <PATTERN>.
