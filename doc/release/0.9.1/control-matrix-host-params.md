# 0.9.1: Knob 1-8 as host parameters (B-205)

Branch `feat/0.9.1-control-matrix-host-params`, from `origin/main` (8d9e14a69). Both editors. Merged to main only after
the 0.9 release. Decision: Radek, 2026-11-02 (Knob 1-8 as host parameters; saved project compatibility does not bind
the design).

## Problem

An Ableton Live and Push 2 user cannot map a knob row of the Control page to a Rack macro. A DAW maps host parameters
only. The eight knob rows are MIDI Learn CC routes (CC 21-28 by default, any channel, the setup's `knobCcs`), not host
parameters: `mdAutomationHostGestureTest_md` / `_mm` showed the list (MD 416, MM 348, all per-track kit values) and that
page edits reach the host as begin, value, end. A knob row has nothing for a macro to map.

## Shape

Eight new host parameters, `Knob 1` .. `Knob 8`, one per knob row, in both editors.

- **Place and ids.** Radek (2026-11-02): saved DAW projects need not stay compatible here (a knob row could never be
  mapped), so the place is free. There are no other Control page or lane parameters to sit beside, so the knobs get
  their own group "Control" after the tracks' groups (`ControlKnobs::addTo`, called once in the processor's
  constructor after the controller registered its parameters): the simplest place, and it moves nothing else. String
  ids `control_knob_1` .. `control_knob_8`, version hint 1. JUCE derives the VST3 and AU parameter ids from the string
  id (no legacy ids).
- **Not pluginLib parameters.** They are plain JUCE parameters (`ControlKnob`, mdControlKnobs.h): 0-127, discrete,
  automatable, not meta. The controller's automation slots, its snapshot (the saved `AUTO` state) and the firmware
  path never see them; the snapshot's size and contents stay as they are.
- **Host to lane.** `ControlKnob::setValue` (any thread the host uses) stores the value (0-127) and, when it changed,
  sets the knob's bit in an atomic mask. At the start of the next block the audio thread takes the mask
  (`AudioPluginAudioProcessor::processBlockStarted`) and `LearnRouter::driveKnob` runs the knob row's chain: the
  any-channel mappings of the row's CC in the learn table, exactly the chain a CC of that number runs on the host's
  MIDI in (the same applier, the same touched bits, so the targets reach the host as gestures as they do for a CC; a
  global target goes to the message thread as for a CC). The row's CC is in the table (`LearnTable::knobCc`, from the
  setup's `knobCcs`; the Monomachine has no setting: 21-28). A knob row without mappings does nothing, and no CC is
  sent to the firmware: the parameter drives the lane, not the firmware's own CC map. Not while learning (a host
  parameter is not a controller) and not with the HW MIDI engine (the router is off there).
- **Lane to host.** Two ways a lane moves:
  1. A CC of a knob row's number on the host's MIDI in that the row's chain took (`LearnRouter::translate`): the router
     keeps the value and sets the knob's touched bit; the session step (message thread, every 8 ms) takes them
     (`LearnRouter::takeKnobs`) and `MidiLearnCommands` tells the host: a change gesture at the first move, the value,
     the end 250 ms after the last move (the rule the targets already follow).
  2. A knob row dragged on the Monomachine's Control page (the Machinedrum's rows cannot be dragged): the page sends
     the new command `knobTurn {k, v}` with the row's value; the same notification follows. The page keeps moving the
     targets itself as before.
- **No feedback loop.** The lane's value reaches the host through `ControlKnob::showLaneValue`: it stores the value
  and calls `sendValueChangedMessageToListeners`, never `setValue`, so it never sets the drive bit. A host that sends
  the value back (a VST3 host delivers the plug-in's own edit to the processor) sends what is stored already, and
  `setValue` drives only a change. A drive from the host sets no knob bit in the router, so the host is not told
  back what it sent.
- **Names.** "Knob 1" .. "Knob 8": the page's own labels of the rows (mdDeskControl.js, 115-control.js).

## Saved DAW projects

Compatibility was not required for this feature (Radek, 2026-11-02). What changes for an old project:

- Nothing in what it saved: no existing id, index or group changes (a by-product of the place chosen), and the plug-in
  identity (scripts/mdmm-product.env) is untouched, so its automation and macro mappings of track parameters load as
  before. It gains eight parameters it does not use.
- The knobs' values are not saved in the plug-in state. A knob is a controller's position; its targets' values are
  saved where they always were (the kit, the `AUTO` snapshot). Restoring a knob would drive its lane on load and
  overwrite the targets just restored. After a load each knob reads 0 until it moves or the host plays its automation.
- A host that restores every parameter's value after loading a project (some VST3 hosts do) drives each knob row once
  with that value. This is the one change a saved project can see, and only for a project that was saved with this
  version and has mappings on a knob row.
- A project saved with 0.9.1 and opened in 0.9 or earlier: the host finds no `Knob` parameters; automation on them is
  dropped by the host, the rest loads.

## Open (later)

- The page does not show a host move of a knob (the MM row's value stays where the page left it).
- A DAW in write mode records both the knob and its targets (as for a CC today).

## Tests

`mdAutomationHostGestureTest_md` / `_mm` (no ROM): the tracks' parameters first with their ids `page_track_index` in
their old order, then the 8 knobs with their ids and names, automatable, not meta; a host change of
Knob 1 moves the target of a knob row mapping as CC 21 does; a CC 21 on the host's MIDI in and a `knobTurn` reach the
host as begin, value, end of Knob 1 on the message thread; a host change of a knob sets no notification of that knob.
The automation tests that sized the snapshot by the host parameter count now count the controller's parameters.
