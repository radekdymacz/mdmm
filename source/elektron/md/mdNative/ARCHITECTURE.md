# From the MD/MM editors to a groovebox with selectable engines

Repository audit, 2026-10-14. This records the extension points and the missing pieces; it does not integrate
the experimental engine into either editor. Product direction: [DIRECTION.md](DIRECTION.md).

## What already exists

The visible HTML/JavaScript page is a reusable control surface, but it talks to a substantial C++ document
and command layer, not directly to DSP instructions:

```
HTML/JS page -> JSON bridge -> session -> desk/core documents and commands
                                       -> model adapter -> device

DAW / audio device -> JUCE processor -> synthLib::Plugin -> synthLib::Device -> PCM outputs
```

| Existing piece | Evidence | What it provides |
| --- | --- | --- |
| Shared page transport and documents | `mdJucePlugin/mdPageBridge.h`, `skins/shared/deskBridge.js`, `deskDocs.js` | Commands in, documents/results/telemetry out; UI need not know the DSP implementation. |
| Engine selection | `mdJucePlugin/mdDeskSession.h`: `Engine`, `EngineRecord`, `SessionOf`; `mdSessionMd.cpp`, `mdSessionMm.cpp` | Engine factories, availability and an adapter override. Current choices are firmware emulation and hardware MIDI. |
| Capabilities | `deskCore/deskCapabilities.h`; `MdMachine::capabilities()`, `MmMachine::capabilities()` | Feature flags, reasons and text values; the page enables controls from them. |
| Machine catalogue | `MdModel::catalogue()`, `MmModel::catalogue()`; page `mdDeskModel.js`, `mmAdapter.js` | Machine names, parameter labels, enumerations and some counts already arrive as data. |
| Audio device boundary | `source/synthLib/plugin.cpp`: `Plugin::process`, `setDevice`; `source/synthLib/device.h` | An abstract renderer, sample rates, channel counts, MIDI and state. A native renderer can fit this boundary later. |
| Editor behavior | `deskCore/`, model edits, shared page controls | Undo, document publishing, commands, gestures, library controls and performance UI can be reused or generalized. |
| Native experiments | `mdNative.*`, `mdNativeTrack.*`, `mdNativeChain.*` | Standalone voice, processing kernels and connected track path with original-instruction reference tests; no emulator dependency in the rendering library. |

Paths in this table are relative to `source/elektron/md/` except those starting with `source/`.

The current catalogue is model-owned: `deskCore/deskDesk.h` publishes `Model::catalogue()`. Changing an
`EngineRecord` does **not** currently provide a different machine catalogue or different document types.
The engine-selection interface is the control/device edge; it has no audio-render method of its own.
The processor separately creates `md::DeskDevice` in `AudioPluginAudioProcessor::createDevice()`.

## What remains tied to the original machines

| Constraint | Concrete location | Consequence |
| --- | --- | --- |
| MD: 16 tracks, 24 parameters/track, 64 kit slots, byte-valued parameters | `elektronData/mdKit.h` | A larger native kit cannot be represented by increasing a UI count. |
| MD: 64 steps, 64 lock rows, 64-bit trig masks | `elektronData/mdPattern.h` | Long patterns and unrestricted lock lanes need a different representation. |
| MM: six tracks, seven pages of eight sound parameters, 64 steps, 62 lock rows | `elektronData/mmKit.h`, `mmPattern.h` | MM's existing documents also describe its firmware layout. |
| MD page constructs 16 tracks and groups parameter indices into 0–7 / 8–15 / 16–23 | `skins/mdStudio/mdDeskModel.js`: `deriveView`, `pages`, `paramOf` | Descriptive labels are data driven; layout and parameter addressing are only partly so. |
| 0–127 lanes, four page indicators and firmware-specific control behavior | `skins/mdStudio/mdDeskSeq.js`, `mdDeskModel.js`: `tweakWrites` | Frequency/time/float parameters and larger patterns need schema-aware controls and validation. |
| Firmware sequencing and recording | `mdDesk/mdDeskMachine.cpp`, `mdSessionMd.cpp`, `mmSessionMm.cpp` | Panel/MIDI commands start the firmware; telemetry and memory report the results. The page is not the audio clock. |
| Sample upload and storage formats | `elektronData/mdSamples.h`, `mdDesk/mdDeskSds.h` | Current uploads are prepared for MD playback and SDS. Native stereo/long samples must bypass these encodings. |
| Device switching assumes compatible saved state | `source/synthLib/plugin.cpp`: `Plugin::setDevice()` | It saves the old device, replaces it and restores those bytes. ROM/native switching needs explicit state ownership or conversion. |

`deskCore::Sequencer` in `deskSequence.h` is a **panel-action workflow runner** (send a key, wait for a fact).
It is not an existing musical sequencer that can clock native audio. The editor's generators and pattern
editing are reusable; sample-timed note/lock/retrigger scheduling still needs implementation for native mode.

## The descriptor the UI needs

Keep the established command/document/telemetry approach, with a versioned descriptor supplied by the active
backend. For ROM mode, the adapter supplies the known profile for the supported ROM/model/version. A ROM
does not automatically contain a self-describing UI schema. Native mode supplies its own descriptor.

The descriptor should carry:

* **Identity and support:** engine/model/version, compatibility profile, available features and reasons.
* **Machines and processors:** stable IDs, names, parameter groups, input/output channel types, trigger and
  note-release behavior, supported modulation, and any restrictions on chain order.
* **Parameter definitions:** stable ID distinct from display label, type, units, range, default, step or
  continuous resolution, linear/log/bipolar display mapping, enum items, whether it can be locked/modulated,
  and smoothing policy. A position such as `param 12` is not a universal identity.
* **Numeric limits:** track/voice limits, pattern lengths, sample slots, memory budget/current usage, record
  capacity, sample formats/channels/rates, lock capacity, bus/chain/node limits and latency information.
* **Sampling and routing:** recorder sources, slicing/stretch modes actually implemented, insert slots, sends,
  returns and valid connections. Unimplemented capabilities must remain unavailable.

The UI uses these definitions for machine pickers, controls, lock lanes, value labels, layout and disabled
features. Backend validation must enforce the same limits. Existing closed-writer schema tests and the page
command contracts must be extended together when integration begins; injecting arbitrary extra JSON is not
sufficient. The native render loop should receive numeric events, not parse this UI metadata.

## What the native backend must own

1. **Project/state model:** native tracks, machines, ordered processors, buses, sample references and patterns,
   with versioned persistence and stable parameter IDs. Keep original `MdKit`/`MmKit` and SysEx codecs intact
   as compatibility adapters. Conversion should explain unsupported data and preserve the source project.
2. **Musical scheduling:** host tempo/position and free-running transport, notes, locks, slides, retriggers,
   swing, recording and modulation. Events must be applied at sample offsets; UI timers cannot drive audio.
3. **Audio engine:** voice lifecycle, sample recording/playback, filters/envelopes/amplifiers, mixing and FX;
   allocations and graph construction outside the audio callback. Larger RAM is a resource budget, not an
   unbounded promise. Stretching and other buffered processors need reported latency and quality choices.
4. **Control adapter:** apply editor commands directly to native state/events and publish documents and
   telemetry. It should not manufacture SysEx or emulate panel presses to control native DSP.
5. **Host integration, later:** renderer/device ownership, sample rate and bus negotiation, MIDI/automation,
   engine switching, state restore and a browser AudioWorklet. DAW automation needs stable exported parameter
   identities or explicit assignments; changing machines must not silently reassign old automation lanes.

## Practical order

Continue the separate native-engine proof first. Recover the original machine and track algorithms, then
provide deliberate modern variants with measured sound differences. Complete a voice-to-output example and
sample voice before building a large machine catalogue. An offline renderer and event API can validate the
native state without changing the current editors.

Define the descriptor and native documents alongside the first usable engines. Then adapt the existing page
to descriptor-backed controls and connect the native backend. Initially one backend owns playback. Retain
ROM mode as a supported profile with its original limits, and native mode as the expandable groovebox.

The screenshot's grid, lock-lane interaction and workspace structure are reusable product assets. The
underlying firmware data layouts are the parts that must stop defining the native engine's limits.

## Related sequencer product

The public [xox-plocks page](https://seq.nativekloud.com/) describes a sequencer that sends MIDI and makes no
sound itself, with browser, standalone and plug-in editions. Its parameter maps describe the target device's
notes and MIDI controls. Keep that product useful on its own, as requested.

The natural boundary between the related products is musical control: notes, per-step parameter changes,
transport and device/parameter descriptors. The groovebox owns synthesis, sampling and FX; xox-plocks can
drive it through MIDI initially. A richer direct event interface could later preserve higher parameter
resolution and sample timing without forcing xox-plocks to become an audio instrument.

There are two different metadata concerns: xox-plocks maps controls to an external device's MIDI protocol;
the groovebox describes processors and their native parameters. Keep stable parameter identities where the
meaning is shared, with explicit translation for MIDI encodings. Do not assume identical names imply the
same control curve or behavior.

This is a product/interface fit assessment from the public page and this repository. The xox-plocks source
was not audited here. This repository's `CLAUDE.md` also requires its parity workflow and ownership rules
when copying shared grid features; related products do not automatically imply a shared code licence.
