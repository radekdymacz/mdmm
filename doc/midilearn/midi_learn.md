# MIDI Learn in the Machinedrum and Monomachine Editors

Developer and tester note. The user guide chapters are written from this and from [DESIGN-learn-0.8.md](DESIGN-learn-0.8.md) (why it is built this way). The threads are in [THREADING.md](THREADING.md).

Since 0.8 the two editors have their own MIDI Learn. It is not the upstream plug-ins' Learn: that translator is off in these editors (`usesMidiLearn()` is false), and its overlay, presets, feedback and input-source pages do not exist here. The old text of this file described them.

## What it is

A knob or fader on a MIDI controller moves a sound value of your choice, on any track. You pick the value, turn the knob, and the mapping exists. The machine's own control change map stays for everything you did not map.

- Only control changes (CC) are learned. Notes are not: they stay the machine's (the Machinedrum key map in GLOBAL > Map, the Monomachine track channels).
- A mapping is one (channel, CC) to one value of one track. One CC can move several values.
- It moves the value the way host automation does, so the knob on the page, the machine's sound and a DAW in write mode all follow.

## The LEARN gesture

1. Open the CONTROL page (the CONTROL key in the Setup group, right of LEARN, or key 6; the key is lit while the page is open, click it again to leave).
2. Press LEARN (the key in the top bar, or L). The page shows the learn mark on the values that can be learned.
3. Click a value. The inspector line says "Turn a knob on your controller both ways (0 of 2)".
4. Turn the knob up and down. The first CC fixes the channel and the CC number. The second, different value completes the mapping (1 of 2, then done).
5. A toast names the CC, its channel and the target, and says what it overrides.
6. Esc leaves LEARN. A second click on another value while waiting moves the target.

A button that sends 127 and 0 is learned the same way, as an absolute value: pressed is the maximum, released is the minimum. Inv swaps them. There is no toggle mode.

Closing the editor window, leaving LEARN or changing the engine stops the waiting.

## The CONTROL page

- The matrix lists the eight knob rows, every learned CC and the app modulators against the tracks. Both editors show the plug-in's mappings, not page-local links (the Monomachine's old min, max and curve links of the knob rows are gone). The app LFO and Random rows keep their min, max and curve.
- The inspector of a CC row lists its targets with the mode, Inv and a remove key. Add (a track and a value, then Add target) is the same as learning, without a controller.
- Dragging a knob row on the Monomachine page moves its targets.
- LEARN's digits 1 to 8 give the clicked value the CC of that knob row, as set in the setup (`knobCcs`). Changing a knob row's CC moves the mappings of the row with it, in one edit and one undo step.

## A mapped CC beats the machine's own CC

The mapping wins. A mapped (channel, CC) never reaches the firmware, so the parameter does not move twice. A channel mapping hides that CC on that channel only. An any-channel mapping (a knob row) hides it on every channel.

The inspector says what is hidden, for example "Overrides the machine's CC 21 on channel 1: T1 DEC". On the Machinedrum the firmware answers about CC 16 to 119 on the four channels from the base channel, so a mapping on channel 1 usually overrides something. On the Monomachine it is CC 48 to 119 on each track channel. Remove the mapping and the machine's CC is back at once. A controller on another channel (for example 10) hides nothing on the Machinedrum.

## Modes

Detected from the values seen while learning:

| Mode | Seen while learning | Effect |
|---|---|---|
| Absolute | a plain range, or only 0 and 127 | the value follows the CC over the parameter's range |
| Relative Signed | values near 0 and near 127 (1 up, 127 down) | steps one up or down from the current value |
| Relative Offset | values around 64 | above 64 steps up, below 64 steps down |

Inv turns a mapping round. Values only 0 and 127 are always Absolute (a button).

## Limits

- 128 mappings at most. LEARN refuses the 129th and says so.
- CC only, 16 channels or any channel.
- Targets: the sound values the learn model lists for each track (the Monomachine's DATA page values and level). Values that cannot take the realtime path are not offered. MIDI page values stay unlearnable.
- No MIDI feedback to the controller (no motor faders or LED rings) and no mapping presets.
- In a DAW's Read mode, host automation and the controller fight over the value, as with any plug-in.

## Where mappings are kept

- Only in the project (the plug-in state), in the editor's setup chunk `MDSK` as a `mappings` member. The standalone keeps them in its own saved state. A new instance starts with none. No file is written anywhere.
- A mapping names its target as track and value (`t`, `pg`, `i`), not by the plug-in's parameter name, so a renamed parameter does not lose it.
- The reader is lenient: an item with a bad channel, CC, track or value, one outside the limits, a duplicate or the 129th is left out alone, with its path in the log. One toast on the page says how many.
- Projects from before 0.3.0 may hold the old `MDLN` chunk (written when mapping was on). It is read once, only when the setup has no `mappings` member; each mapping whose parameter is in the learn model and on a track is kept, the rest is logged and left out. `MDLN` is never written again. Saving the project removes it.

## Learn is off in the HW MIDI engine

With the HW MIDI engine the host's MIDI in is the machine's own out, so nothing is translated or captured. The LEARN key says why, and the CCs from the host pass to the machine untouched. Back on the emulator, Learn works again with the mappings kept.

## Tester checks

The list is in [TEST-0.8.md](../release/TEST-0.8.md), section MIDI Learn.
