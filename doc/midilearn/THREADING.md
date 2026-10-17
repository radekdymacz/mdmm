# MIDI Learn: thread ownership

Developer note. The user guide side is [midi_learn.md](midi_learn.md). The design and its reasons are [DESIGN-learn-0.8.md](DESIGN-learn-0.8.md).

## Status (0.8)

**Superseded for the Machinedrum and Monomachine Editors.** The translator described below is off in these editors: `AudioPluginAudioProcessor::usesMidiLearn()` returns false, `Processor::getController` makes no `MidiLearnTranslator`, and no `MDLN` chunk is written. Its hazards are not fixed by making it thread-safe (candidate A in the design was rejected: `std::atomic_load` on a `shared_ptr` is not lock-free). The six steps further down are kept as history. The other synths of the upstream project keep the old behaviour (`usesMidiLearn()` defaults to true).

MIDI Learn is on since 0.8 (`MDMM_MIDI_MAPPING` is 1) and works like this:

| Piece | Where | Rule |
|---|---|---|
| Mappings (the truth) | `DeskSetup::mappings` (`deskCore/deskSetup.*`, pure functions in `deskCore/deskLearn.*`) | owned by the message thread; saved in `MDSK` with the project; no file |
| Realtime view | `LearnTable` (`mdJucePlugin/mdLearnTable.h`): a trivially copyable struct, 128 targets, a head index of 17 x 128 | built on the message thread from the setup and the session's learn model; written into a `synthLib::Seqlock` |
| The audio thread | `LearnRouter` (`mdJucePlugin/mdLearnRouter.*`), `beginBlock()` and `translate()` | at block start copies the table when the seqlock's write count moved (an overlap keeps the old copy); no lock, no allocation, no file |
| Routing | `Processor::addMidiEvent` calls the virtual `consumeMidiIn` | only `Host` events on the audio thread are translated; page, device and port events never are; a mapped (channel, CC) is consumed and never reaches the firmware |
| Gestures | `translate` applies `Parameter::setValue` (the host-automation path MD and MM already use) and sets a bit in an atomic mask | the session step takes the bits and calls `Parameter::notifyHostOfValue()` on the message thread: a change gesture at the first touch, one value per step, an end after 250 ms without one |
| Settle | `publishAndSettle` / `publishEmptyAndSettle` | after a publish the session waits (a short timeout) for a block of the new table to begin before it takes touched bits; bits from the old table are dropped, so a rebuilt table never notifies for a stale slot |
| Learning | `std::atomic<bool>` plus a 256-record SPSC ring (status, data, data) | the audio thread only pushes CCs while learning and consumes them; the session step (every 8 ms) drains the ring and runs the pure `learnStep`; nothing is called back, so no closure can free itself |
| Engine | HW MIDI engine | no table, no capture: the host's MIDI is the machine's own out |

Counters (applied, captured, dropped, not on the audio thread) are relaxed atomics read by the monitor and the log.

### The four tests of the old note, as built

1. Learning completes on the message thread: `mdLearnRouterTest` (no callback members by type; no learn step on the producing thread).
2. No file I/O or allocation on the audio thread: `mdLearnRouterTest` (a global `operator new` counter around `beginBlock` and `translate`).
3. Stress, under ThreadSanitizer: `mdLearnRouterStressTest` (checksummed tables, no torn copy).
4. The switch on: `mdProcessorHooksTest`, `mdLearnFirmwareTest` (the learned CC moves the kit value and the firmware's own target of that CC does not; project save and load).

Under load: `EDITFLOW_LEARN=1` in `mdEditFlowPluginTest`, run by `scripts/mdmm-rt-check.sh --lock --load 24`. The pure side is `deskLearnTest`. The old translator's own hazards (the self-clearing closure, a button read as relative) are fixed where they are (`midiLearnTests`), though these editors do not use it.

## History: the redesign proposed for the pluginLib translator

What follows is the plan of 2026-10 as it stood before the design above replaced it. Do not build it.

The MIDI Learn translator (`source/jucePluginLib/midiLearnTranslator.*`) is not thread-safe. This note says where
the threads meet, what the Machinedrum and Monomachine Editors did about it in 0.7, and the redesign that was proposed.

### The problem

`pluginLib::Processor::addMidiEvent` hands every event that does not come from the device to
`MidiLearnTranslator::processMidiInput`. That call runs on whichever thread delivered the event: the audio thread
(host MIDI in `processBlock`), the JUCE MIDI-input thread (physical ports), and the message thread (editor). On those
threads the translator:

- reads `m_preset` and its index map `m_midiToMappingIndex` (`findMapping`) while the message thread, or the host's
  state thread through `loadChunkData` and `loadDefaultMidiLearnPreset`, can be replacing both in `setPreset`.
  A replace during a read is a use after free.
- reads `m_isLearning` and `m_learnInputSources`, plain fields written on the message thread.
- writes `m_learningValues` in `handleLearning`; two MIDI threads can run it at once.
- calls `onLearningProgress` and `onMappingLearned` in place. The callbacks set a new preset, write the default
  preset file (`saveDefaultMidiLearnPreset`) and publish to the editor, all on a realtime thread. The Machinedrum
  callback (`mdMidiLearnCommands.cpp`, LearnStart) also assigns `onMappingLearned = nullptr` from inside itself,
  which destroys the running closure, and then calls `publish()` through the freed capture. The upstream editor
  (`jucePluginEditorLib/pluginEditor.cpp`, `setMidiLearnMode`) has the same shape.
- applies a mapping with `Parameter::setUnnormalizedValueNotifyingHost` (`applyMappingToParam`), so a host change
  gesture starts on the audio thread.

### Then (0.7)

In 0.7 MIDI mapping was off: `MDMM_MIDI_MAPPING` was 0 (`source/elektron/md/deskHost/deskHost.h`). The learn commands are
refused and the pages hide the CONTROL workspace. Since the fix of 2026-10, the editors also make no translator at
all: `AudioPluginAudioProcessor::usesMidiLearn()` returns the switch, and `Processor::getController` creates the
translator only when it is true. So no learn code runs on any thread, no default preset is loaded, and no `MDLN`
chunk is written to or read from the project (an old project's chunk is skipped). Every user of
`getMidiLearnTranslator()` already handles null. `mdProcessorHooksTest` (no firmware) and `mdSessionFirmwareTest`
assert that the translator follows the switch.

The other synths keep the upstream behaviour (`usesMidiLearn()` defaults to true).

### The six steps

One owner per piece of state; the realtime threads read immutable values and post messages, never call back.

1. **The message thread owns the preset and the learn state.** `setPreset`, `startLearning`, `cancelLearning`,
   `setLearnInputSources`, chunk load and the default preset file all run there. A call from another thread (the
   host's `setStateInformation` thread) posts to the message thread with `callAsync`, guarded by the static
   instance-set pattern (CLAUDE.md, "callAsync safety").

2. **The realtime side reads one immutable table.** Build a `MappingTable` (the mappings plus the
   `(channel << 8) | controller` index, resolved to parameter indices, no strings) on the message thread whenever the
   preset changes, and publish it as `std::shared_ptr<const MappingTable>` with `std::atomic_store`
   (C++17; `std::atomic<std::shared_ptr>` once C++20 is allowed). `processMidiInput` takes one `std::atomic_load`
   per event and never sees a half-built table. The last reference to an old table must not drop on the audio
   thread: the message thread keeps the previous table alive for a generation (or retires tables through a
   lock-free queue that it drains), so no free happens in the callback.

3. **Learn flags are atomics.** `m_isLearning` and `m_learnInputSources` become `std::atomic<bool>` and
   `std::atomic<uint8_t>`; the realtime side only reads them.

4. **While learning, the realtime side only enqueues.** An event that would be learned goes into a bounded
   single-producer FIFO per MIDI thread (audio, MIDI input), or one MPSC FIFO, as a plain `(source, a, b, c)`
   record, and is consumed. The message thread drains it on a timer, runs `handleLearning` (the value collection,
   mode detection), fires `onLearningProgress` and `onMappingLearned` there, sets the preset, saves the default
   preset file and publishes. Nothing of that runs on a realtime thread.

5. **Mapped values reach parameters from the message thread too,** or through a parameter API that is explicitly
   realtime-safe. The realtime side resolves the mapping in the table and posts `(parameter index, value)`; the
   message thread applies it with the change gesture. (If a host needs sample accuracy for learned controllers,
   that is a separate design: the value would have to go to the device directly, not through `Parameter`.)

6. **Callbacks are cleared after they return.** `mdMidiLearnCommands.cpp` LearnStart: copy the work out, clear
   `onMappingLearned` after the call completes (for example the translator clears the slot itself before invoking a
   moved-out copy), then publish. Same fix in `jucePluginEditorLib/pluginEditor.cpp`.

#### Tests to add with it

- Learning completion runs on the message thread: record the thread id in `onMappingLearned` and compare it with
  `MessageManager::getInstance()->isThisTheMessageThread()`.
- No file I/O on the audio thread: a learn completed from `processBlock` does not call `saveDefaultMidiLearnPreset`
  there (a counting hook on the processor).
- A ThreadSanitizer stress test: one thread calls `processMidiInput` in a loop with mapped and unmapped CCs while the
  main thread swaps presets and starts and cancels learning; no reports, no crash.
- Extend the switch check in `mdSessionFirmwareTest` (and `mdProcessorHooksTest`) for the "on" position: a
  translator exists and a learned CC moves the parameter.

#### Turning MIDI mapping on again

Land the redesign in `jucePluginLib` (upstream code: keep the change narrow and offer it upstream), add the tests
above, then set `MDMM_MIDI_MAPPING` to 1. `usesMidiLearn()` follows the switch, so nothing else changes.
