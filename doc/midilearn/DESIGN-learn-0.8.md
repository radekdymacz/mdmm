# MIDI Learn back on (0.8, WP-L)

*Design by Claude Code (Opus) for Radek, 2026-10-16. Nothing here is built yet. Input: PLAN-0.8.md (WP-L, D1 A),
THREADING.md (the six steps and four tests), midi_learn.md, FOUNDATION.md, DESIGN-audio-lock.md on
`fix/1.0-lock-free-audio` (merged before this starts), and the code on origin/main `cd32a3ccb`: the translator
(`jucePluginLib/midiLearnTranslator.*`), `mdMidiLearnCommands.cpp`, `pluginEditor.cpp`, `deskHost.h`,
`mdPluginProcessor.cpp` (`usesMidiLearn`), `Processor::addMidiEvent`, `Parameter::setValue`, the MD and MM CONTROL
pages (`mdDeskControl.js`, `mmStudio/src/115-control.js`, `mmAdapter.js`).*

Paths are relative to `source/elektron/md/` unless they start with `doc/`, `scripts/` or `source/`.

## Decision in five lines

1. The mappings are part of the editor's setup (`MDSK`, the lenient 1.0 setup codec), owned by the message thread; the pluginLib translator stays off (`usesMidiLearn()` false) and is not made thread-safe.
2. The audio thread reads a fixed-size table (no pointers it owns, no strings) that the message thread writes into a `synthLib::Seqlock`; the audio thread copies it at block start when it changed. No lock, no allocation, no free, no file on the audio thread.
3. Learning is pulled, not called back: the audio thread only pushes captured CCs into a bounded ring; the session step drains it and decides. No callback exists, so the use after free cannot exist.
4. A mapped (channel, CC) belongs to the mapping: it moves the parameter through the realtime host-automation path and never reaches the firmware; the CONTROL page says which firmware CC it overrides.
5. Only CCs are learned. Notes stay the machine's (MD key map with its own LEARN, MM track channels); a button that sends 0/127 is learned as an absolute value (min/max), not a toggle.

## Problem

MIDI Learn is off (`MDMM_MIDI_MAPPING` 0). Radek decided on 2026-10-16 (D1 A) that it comes back in 0.8. What blocks it:

- **Threads.** The translator reads and replaces its preset and index map on the audio, MIDI-input and message threads with no synchronisation; learn flags are plain fields; learning, preset replacement, the default preset file and the page publish run inside the realtime callback (THREADING.md, "The problem").
- **Use after free.** `MidiLearnCommands::handle(LearnStart)` installs `onMappingLearned`, which sets itself to `nullptr` inside its own body and then calls `publish()` through the destroyed capture. `jucePluginEditorLib::Editor::setMidiLearnMode` has the same shape.
- **Parameter changes from the audio thread go through the non-realtime path.** `applyMappingToParam` calls `setUnnormalizedValueNotifyingHost(…, Origin::Midi)`; for MD/MM that ends in `Controller::sendParameterChange`, which for any origin other than `HostAutomation` runs `drainRealtimeParameterChanges(…, false)`: the non-realtime drain, on the audio thread.
- **Learning swallows everything.** While learning, `processMidiInput` returns "consumed" for every event from an enabled source: clock, Start/Stop and notes from the host stop reaching the machine until the learn ends. The hand test's "learn while the transport plays: no drop-outs" would fail.
- **Buttons are misread.** `detectMode` calls a button (values 0 and 127) "Relative Signed" (low ≤ 2 and high ≥ 0x7D).
- **A learned CC on the firmware's CC map.** On the Machinedrum the firmware maps CC 16 to 39, 40 to 63, 72 to 95 and 96 to 119 on the four channels from the base channel: almost every CC a controller sends on channel 1. On the Monomachine CC 48 to 119 on each track channel. A collision is the normal case, not an edge. PLAN-0.8 says it "drives the parameter twice". Today's code actually consumes a mapped event before the device, except when its source is not in the learn sources; the rule was never stated or tested.
- **Two mapping systems on the MM page.** The MM CONTROL matrix shows the page's own links of the on-screen knob rows (min, max, curve), not the plug-in's learned mappings; a learned mapping only shows as a toast. A user turning a real CC 21 gets what the plug-in learned, while the row labelled "CC 21" shows something else.
- **Two places to save.** The knob rows' CCs are in `MDSK` (the setup); the mappings would be in `MDLN` (pluginLib JSON) plus a global `__default` file written on every learn.

## Prior art

- **Ableton Live (MIDI Map mode, Cmd+M).** Mappable controls are highlighted; click one, move a controller, done. One mapping per control; relative and absolute modes with takeover options (None, Pick-up, Value Scaling). Mappings live in the Live Set. A mapped message drives the control; the user removes the mapping to get the old behaviour back.
- **Bitwig Studio.** "Learn controller assignment" on a parameter; mappings belong to the project (or to a controller script). A mappings panel lists them; one control can drive several targets.
- **Plug-ins (Serum, Vital, u-he, Arturia).** Learn from a parameter's menu or an overlay mode; mappings are mostly global (a MIDI map file shared by every instance), some also per preset. The plug-in moves its own parameter and notifies the host, so a DAW in write mode records the move as automation.
- **Elektron (the real machines, Overbridge).** No learn: a fixed CC/NRPN map per track channel, and the MD's key map for notes with its own LEARN on the map page (MD-169, in these editors since 0.6).
- **Lessons taken:** one learn gesture (target, then controller); a mapping owns its message; one project-level store is the default in DAWs, a global store is what plug-ins add (open question, below); learned values reach the host as ordinary parameter changes. Lesson not taken in 0.8: takeover modes (a value jumps, as Live's "None").

## Constraints (from the lock-free audio design and the repo rules)

- The audio thread never waits and never allocates (DESIGN-audio-lock.md, choice A). Nothing in this design takes `m_lock` or any other mutex on the audio thread; `scripts/mdmm-rt-check.sh --lock --load 24` must still pass.
- Producers to the audio thread serialise among themselves; the audio thread is the only consumer. A value the audio thread reads that another thread writes is a seqlock (`synthLib/seqlock.h`) or atomics.
- RmlUi/JUCE DOM and the page bridge are message-thread only; `callAsync` from another thread uses the static instance-set guard (CLAUDE.md).
- The UI rules (Radek, 2026-10-11): the layout stays, no duplicate controls, no right-click for main things, nothing new above the grid.
- The 1.0 read promise (FOUNDATION.md): `MDSK` additions are new members, never a version bump; a reader leaves out a bad item alone and says so.

## Candidates

### A. THREADING.md as written: make the pluginLib translator thread-safe

Message thread owns `MidiLearnPreset`; a `MappingTable` published as `std::shared_ptr<const MappingTable>` with `std::atomic_store`; atomics for the flags; an MPSC FIFO for learning; posted values; callbacks cleared after they return.

- `std::atomic_load` on a `shared_ptr` is not lock-free in libc++ or libstdc++ (a global pool of spin locks keyed by address). It breaks "never waits" by construction.
- The last reference to an old table may drop on the audio thread; it needs a retire scheme anyway (THREADING says so), so the `shared_ptr` buys nothing.
- It keeps and must make safe what these editors do not ship: presets and the preset manager, the global default file, MIDI feedback (and its `m_hostFeedbackMutex` taken in every `processBlock`), input-source filtering, `AutoPart` (an allocating `getPartsForMidiChannel` per event), pitch bend and pressure, NRPN stubs.
- Two owners of one feature's state: `MDLN` for mappings, `MDSK` for the knob rows' CCs; two codecs, one strict.

### B. A command to the audio thread that owns the table, old tables back on a retire ring

The pattern of DESIGN-audio-lock.md (commands in, retire ring out): the message thread builds a table, sends a Swap command; the audio thread swaps at block start and pushes the old pointer to a retire ring the message thread drains and frees.

- Realtime: correct, bounded, consistent with the lock-free audio design.
- Ownership moves between threads (built here, owned there, freed here); ring capacities, a full retire ring (swap postponed), destruction order (tables still in flight when the processor goes) are all to get right and test.
- The mapping state itself (where it is saved, who edits it) is not answered by B; it is a transport.

### C. Mappings in the setup; a fixed-size table in a seqlock; learning pulled (chosen)

- **Owner.** The mappings are a member of `DeskSetup` (`deskCore/deskSetup.h`), beside `knobCcs` and the modulators: one value, one codec (lenient), saved with the project in `MDSK`, edited by pure functions on the message thread (the session's `SetupStore`).
- **Realtime view.** The message thread derives a `LearnTable` from the setup: a plain, trivially copyable struct of fixed size (below), with `Parameter*` resolved from the session's learn model. It writes it to a `synthLib::Seqlock<LearnTable>`. The audio thread, at block start, compares `writes()` with the count it last took; when it moved, `tryRead` into its own copy (on an overlap it keeps the copy it has and tries next block). Translating an event reads only that copy.
- **Learning.** One `std::atomic<bool>` (learning on) and one bounded single-producer, single-consumer ring of 4-byte records (status, data1, data2, spare). The audio thread pushes a CC while learning and consumes it; nothing else. The session step (message thread, every `g_stepMs` = 8 ms) drains the ring, runs the pure learn step, and when it completes clears the flag, adds the mapping to the setup, rebuilds the table, publishes. There is no callback, so nothing can free a running closure.
- **Values.** The audio thread applies a mapped CC with `Parameter::setValue(normalized)`: the realtime host-automation entry MD and MM already use (`shouldSendRepeatedHostValues`: atomics, `sendParameterChangeNow(…, HostAutomation)`, the bounded `publishAutomationIntent`, drained in the same `processBlock` by `processRealtimeParameterChanges`). It sets a bit for that table slot in an atomic bitmask; the session step takes the bits and notifies the host on the message thread (gesture, value), so a DAW in write mode records the move.

Critique of C:
- Fixed limits: 128 mappings, 17 x 128 heads (16 channels and "any channel"). The page cannot show more than that usefully; the codec leaves out the rest and says so.
- A `Parameter*` in a table copied across threads: parameters are made with the controller and live until it goes (after audio stops), and the table is rebuilt whenever the controller is (the session owns both lifetimes). Stated as an invariant and asserted in diagnostics builds.
- Seqlock copy cost: about 4 KiB of relaxed atomic loads, once per block and only when a write happened (a user edit). Nothing per event.
- A learned CC loses its sample offset inside the block (it acts from the block's start, as host automation does). Accepted: knob moves, not notes.
- Leaves the pluginLib translator in the tree, unused by these editors. Its one hazard (the closure) gets the minimal fix; removing the translator is a later clean-up, not 0.8.

### Decision: C

It is the only candidate that answers both questions at once: who owns the mappings (the setup, already saved and leniently read) and how the audio thread sees them (a value, copied, never freed). A rejects itself on the lock inside `atomic_load`; B is a correct transport but leaves the ownership braided. C needs no new realtime primitive: the seqlock comes with the lock-free audio branch, the ring is a fixed array with two atomic indices, the parameter path is the one automation already proves under `mdAutomationRobustnessTest` and `mdAutomationSoakTest`.

## Threads and ownership

| State | Owner (writes) | Readers | How it crosses |
|---|---|---|---|
| `DeskSetup::mappings` (the truth) | message thread (session step, page commands, project load via `DeskHost`) | message thread | not shared |
| learn target and collected values | message thread (`MidiLearnCommands`) | message thread | not shared |
| `LearnTable` | message thread (built from the setup and the learn model) | audio thread | `Seqlock<LearnTable>`; the audio thread's own copy refreshed at block start |
| learning on/off | message thread | audio thread | `std::atomic<bool>` (release/acquire) |
| captured CCs while learning | audio thread | message thread | SPSC ring, 256 records, overflow dropped and counted |
| touched slots (host notify) | audio thread (`fetch_or`) | message thread (`exchange(0)`) | `std::atomic<uint64_t>[2]` |
| counters (applied, captured, dropped) | audio thread | anyone (WP3 monitor, log) | relaxed atomics |

Threads that call `Processor::addMidiEvent`, and what the learn path does on each:
- **Audio thread** (host MIDI in `processBlock`; in the standalone the enabled input devices arrive here too, through JUCE's `AudioProcessorPlayer`): translated.
- **Message thread** (the page's own MIDI, source `Editor`): never translated (it would loop through a parameter whose CC is mapped).
- **Device output** (source `Device`): never translated.
- **pluginLib `MidiPorts` input thread** (source `Physical`): these editors open no such port; an upstream project's port chunk could. Not translated, passes to the machine raw, counted. Diagnostics builds assert that a `Host` event arrives on the audio thread.
- **Editor HW MIDI** (`ExternalMidi::takeIn`, SysEx to a real machine): returns before the learn path, unchanged.

Project load (`setStateInformation`, `DeskHost::applyMachineFreeChunks`): decoding the setup is a pure function on the calling thread; applying it is the session's job on the message thread, as the setup already is. The table is rebuilt there. If a host saves before that ran, the save writes the setup the session holds pending (the existing held-setup path), never a half-applied one.

## Data contracts

### The table (audio thread view), `mdJucePlugin/mdLearnTable.h`

```cpp
namespace mdJucePlugin
{
	struct LearnTarget                  // one mapping, resolved
	{
		pluginLib::Parameter* param = nullptr;
		uint8_t mode = 0;                // deskCore::LearnMode: Absolute, RelativeSigned, RelativeOffset
		uint8_t invert = 0;
		uint8_t next = 0xff;             // the next target of the same (channel, CC); 0xff ends the chain
		uint8_t mapping = 0xff;          // its index in DeskSetup::mappings (for the touched bits)
	};

	struct LearnTable                   // trivially copyable, about 4.2 KiB
	{
		static constexpr size_t MaxTargets = 128;
		static constexpr size_t AnyChannel = 16;
		uint32_t generation = 0;         // the session's count of tables built
		uint8_t count = 0;
		std::array<std::array<uint8_t, 128>, 17> head;   // [channel 0-15 or AnyChannel][cc] -> first target, 0xff none
		std::array<LearnTarget, MaxTargets> targets;
	};
}
```

An event on channel `ch`, CC `cc` runs the chain at `head[ch][cc]`, then the chain at `head[AnyChannel][cc]`. If either was non-empty, the event is consumed (it does not reach the firmware). Invariant: every `param` in a published table belongs to the controller that lives while the table can be read; the session rebuilds and republishes the table whenever the controller is made, before audio can run with it.

### The router (realtime side), `mdJucePlugin/mdLearnRouter.h`

```cpp
class LearnRouter
{
public:
	// message thread
	void publish(const LearnTable& _table);       // Seqlock write
	void setLearning(bool _on);                   // also empties the ring when switched on
	template<typename F> void drainCaptured(F&&); // F(uint8_t status, uint8_t cc, uint8_t value)
	std::array<uint64_t, 2> takeTouched();        // exchange(0)
	struct Counts { uint64_t applied, captured, capturedDropped, notOnAudioThread; };
	Counts counts() const;

	// audio thread only
	void beginBlock();                            // refresh the local copy when the seqlock's writes() moved
	bool translate(const synthLib::SMidiEvent& _ev); // true: consumed (learned, or captured while learning)
};
```

`translate` consumes only status `0xB0` (CC). Everything else, also while learning, goes on to the firmware.

### The setup member (saved), `deskCore/deskLearn.h` and `deskSetup.*`

`DeskSetup` gets `std::vector<LearnMapping> mappings`. In JSON, a new member `mappings` of `md-desk/setup` and of the MM's bare `mm-desk/modulators` document (beside `solo`):

```json
"mappings": [
  { "ch": 0,   "cc": 21, "t": 2, "i": 5, "mode": "absolute", "invert": false },
  { "ch": 255, "cc": 22, "t": 0, "pg": 1, "i": 3, "mode": "relative-signed", "invert": true }
]
```

- `ch` 0 to 15 or 255 (any channel); `cc` 0 to 127; `t` a track; `pg` only for the Monomachine (a DATA page, as the learn limits); `i` the parameter index of the learn model; `mode` one of `absolute`, `relative-signed`, `relative-offset`; `invert`.
- Targets are the contract's `{t, [pg,] i}`, not plug-in parameter names, so a renamed parameter does not orphan a mapping.
- Lenient read (the rules of `setupFromJson`): an unknown member is ignored; an unknown `mode` is `absolute`; an item with a bad or missing `cc`, `ch`, `t`, `i`, or a target outside the model's learn limits, is left out alone, with its JSON path in the errors; items past 128 are left out; an exact duplicate is left out. A missing `mappings` member means none. No version bump (an addition, FOUNDATION "The chunk version rule").
- `MDLN` (written by the alphas before 0.3.0, when mapping was on): read once, only when the setup has no `mappings` member: each mapping whose `paramName` is in the learn model and whose `part` is a track becomes a setup mapping; the rest is left out and logged. `MDLN` is never written again. FOUNDATION's list says so.
- The MM writes the 0.x shape so 0.7 reads 1.0 projects; 0.7's reader ignores members it does not know (verify in L0 with a fixture written by the new codec and read by the 0.7 codec's code from the tag `mdmm-v0.7.0`).

### Pure learn functions, `deskCore/deskLearn.h` (no JUCE)

```cpp
enum class LearnMode : uint8_t { Absolute, RelativeSigned, RelativeOffset };
struct LearnRef { int t = -1, pg = -1, i = -1; };
struct LearnMapping { uint8_t ch = 255, cc = 0; LearnRef at; LearnMode mode = LearnMode::Absolute; bool invert = false; };

// edits (the session applies them to its setup; each returns the new list or a refusal text)
Result<std::vector<LearnMapping>> addMapping(const std::vector<LearnMapping>&, const LearnMapping&);   // refuses an exact duplicate and the 129th
std::vector<LearnMapping> removeMapping(const std::vector<LearnMapping>&, size_t);
std::vector<LearnMapping> invertMapping(const std::vector<LearnMapping>&, size_t);
std::vector<LearnMapping> moveKnobCc(const std::vector<LearnMapping>&, uint8_t _from, uint8_t _to);    // any-channel mappings of a knob row follow it

// learning: one step a captured record; data in, data out
struct LearnCapture { LearnRef target; std::vector<uint8_t> values; uint8_t ch = 0, cc = 0; bool started = false; };
struct LearnStep { LearnCapture next; std::optional<LearnMapping> learned; };
LearnStep learnStep(const LearnCapture&, uint8_t _status, uint8_t _cc, uint8_t _value);
LearnMode detectMode(const std::vector<uint8_t>& _values);   // {0, 127} only: Absolute (a button)
```

The learn step keeps today's rule: the first CC fixes channel and controller, two different values complete it (so a knob is turned both ways, a button pressed and released). The learned mapping carries the channel it came on.

### Page to host (commands)

The rows in `deskHost` stay, with one change:

| Op | Arguments | Change |
|---|---|---|
| `learnStart` | `t, [pg,] i` | none; a second `learnStart` while learning moves the target |
| `learnAdd` | `cc, t, [pg,] i, [ch]` | refuses an exact duplicate ("already mapped") and the 129th ("128 mappings at most") |
| `learnCancel` | | none |
| `learnRemove` | `index` | none |
| `learnInvert` | `index` | none |
| `learnSetCc` | `from, to` | **removed**: the `knobs {ccs}` setup command moves the knob row's any-channel mappings in the same edit (one intent, one command, one undo step) |

### Host to page (the learn document)

Open for readers, as every document (data-contract.md 2). New members marked new:

```json
{ "type": "learn", "doc": {
  "enabled": true,
  "mappings": [ { "index": 0, "t": 2, "i": 5, "name": "DEC", "cc": 21, "ch": 0,
                  "mode": "Absolute", "invert": false,
                  "overrides": [ { "ch": 0, "t": 0, "i": 5 } ] } ],
  "learning": { "t": 2, "i": 5, "name": "DEC", "got": 1, "need": 2 },
  "limits": { "tracks": 16, "params": [ { "i": 0, "name": "PTCH" } ], "max": 128 },
  "left": [ "$.mappings[3]: track 17 is outside 1..16" ]
} }
```

- `overrides` (new): the firmware CC targets this mapping hides, from the pure CC maps (`mdAutomation`, the model's) and the active Global's base channel and channel span. Empty when the CC is not on the machine's map.
- `learning.got`, `learning.need` (new): progress (one of two values).
- `limits.max` (new): 128.
- `left` (new, optional): what the last project load left out, so the page can say it once.
- `mode` stays the words the pages show today.

## A learned CC that is also on the firmware's CC map

**The mapping wins and the firmware never sees that (channel, CC).** A channel-specific mapping hides that CC on that channel only; an any-channel mapping (a knob row added with Add target) hides it on every channel.

Why not refuse:
- On the Machinedrum with the factory base channel, the firmware maps most CCs on channels 1 to 4. Refusing would refuse most knobs of an ordinary controller on channel 1, the default of nearly every controller. On the Monomachine the same for CC 48 to 119 on each track channel.
- Every DAW treats an explicit mapping as the owner of its message (Prior art). The user made it; removing it brings the machine's CC back.
- One meaning per (channel, CC) at any time: no double drive, no order-dependent result. A refusal would push the user to set the controller to another channel, which is setup outside the editor.

What makes it visible: the inspector and the learn toast say what the mapping overrides ("Overrides the machine's CC 21 on channel 1: T1 DEC"), from `overrides`. LEARN learns the channel the CC came on, so learning on channel 10 hides nothing on the MD's channels 1 to 4.

## Pads and buttons

**Notes are not learned. A CC button is learned as an absolute value.**

- Notes are the machine's: the MD key map (GLOBAL > Map, with its own LEARN on the map page since 0.6) and, after WP1 (D2 A), the firmware note path; the MM plays each track on its channel. A second note map in the CONTROL workspace would be a duplicate of an existing place (Radek's rule). The learn capture ignores notes, so a pad hit while learning plays the machine as usual.
- A button sends CC 127 then 0: learned as Absolute (pressed: the parameter's maximum; released: its minimum, or the reverse with Inv). `detectMode` returns Absolute when it saw only 0 and 127 (today it says Relative Signed).
- No toggle mode in 0.8. A toggle needs a per-mapping mode switch (a new control) and only makes sense for targets the learn model does not offer (mutes, pattern change). If testers ask, it goes to IDEAS.md with a target list.

## Values, the host and automation

- A mapped CC on the audio thread: absolute `normalized = value / 127` (inverted with Inv); relative modes read `getUnnormalizedValue()` (an atomic) and step by one within the range. Then `Parameter::setValue(normalized)`. Every learnable parameter must take the realtime branch (`shouldSendRepeatedHostValues()`); the session's learn model leaves out any that does not, and a unit test checks the whole list.
- The session step takes the touched bits and, for each parameter, tells the host on the message thread: `beginChangeGesture` at the first touch, `sendValueChangedMessageToListeners(getValue())` per step with a change, `endChangeGesture` after 250 ms without one. One new method in `jucePluginLib/parameter.*`, `notifyHostOfValue()`, which wraps that in the existing `g_hostNotificationParameter` guard (the VST3 bounce). It never calls `setValue`, so it sends nothing to the machine again.
- In a DAW's Read mode, host automation and the controller fight over the parameter, as with any plug-in. Documented, not designed around.
- MIDI feedback (sending values back to a controller) stays out: no mapping has feedback targets; the CONTROL page has no feedback control.

## The CONTROL workspace

Both pages already have it, hidden: a matrix (rows: the eight knob rows, the learned CCs, the app modulators; columns: tracks) and an inspector for the selected row, with a LEARN key in the top bar (MD) or header (MM). Learning is: LEARN on, click a value anywhere on the page, turn a controller knob. Nothing uses right-click. The layout stays as it is; these are the changes, all inside it.

**Both editors**
- The tab and LEARN key appear (the learn document says `enabled: true`).
- While a value waits: its knob keeps the learn mark (as today) and the inspector line says "Turn a knob on your controller both ways (1 of 2)" from `learning.got/need`.
- After a learn: the toast names the CC, its channel, the target and what it overrides.
- The inspector of a CC row: its targets (as today: chip, mode, Inv, x) and, when `overrides` is not empty, one note line "Overrides the machine's CC 21 on channel 1: T1 DEC". "Saved with the plug-in's MIDI Learn preset" becomes "saved with the project".
- Esc leaves LEARN (MM has it; the MD gets the same key binding in its key map).
- After a project load that left items out: one toast with the count; the list is in the log.

**Machinedrum only**
- Changing a knob row's CC sends `knobs` only (the mappings follow in the same edit); `learnSetCc` goes.

**Monomachine only**
- The CC rows of the matrix show the learn document's mappings (the MD's rule), not the page's own links. The page-local links of the knob rows (min, max, curve) go: they never applied to a real controller and duplicated the plug-in's mappings. The app LFO and Random rows keep min, max and curve (they are the plug-in's modulators).
- Dragging a knob row on screen keeps moving its targets (the mockup's "drag a knob row to turn it"), now the plug-in's mappings of that CC.
- LEARN's 1 to 8 digits add the knob row's CC as set in the setup (`knobCcs`), not 20 + k.
- MIDI page values stay unlearnable (NRPN on the machine); the toast already says so.

**Self-critique (before Radek sees screens).** The MD inspector's "Add" row and the matrix cells are two ways to add a mapping, plus LEARN: they are three gestures for one thing, but they exist today and each serves a different start (from a value, from a row, from a cell); removing one would change the layout, so they stay. The overrides line is text, not a control: it adds no duplicate. The MM change removes controls (the knob rows' min/max/curve); Radek should see before/after screenshots, since it is the one visible removal.

## Tests

THREADING.md's four, adapted to C, then the ones PLAN-0.8 asks for.

1. **Learning completes on the message thread.** `mdLearnRouterTest` (no ROM): a thread standing in for the audio thread captures CCs; the mapping appears only after the session step drains on the message thread; the router has no callback members (by type), and a counter shows no learn step ran on the producing thread.
2. **No file I/O and no allocation on the audio thread.** `mdLearnRouterTest`: a global `operator new` counter (the pattern of `mdAutomationRobustnessTest`) around `beginBlock` and `translate` for mapped, unmapped, learning and ring-overflow cases: zero. No file is involved anywhere (project-only storage; if Radek picks B below, the default file is written by the session step and the test also counts its writes on the producing thread: zero).
3. **Stress, and under ThreadSanitizer.** `mdLearnRouterStressTest`: one thread runs `beginBlock` plus `translate` in a loop with mapped and unmapped CCs; the main thread publishes tables, toggles learning, drains. Each table carries a checksum over its contents that the reader verifies (no torn copy is ever used). Built once with `-fsanitize=thread` (`scripts/mdmm-dev.sh` tree `temp/tsan`, that target only): no report.
4. **The switch on.** `mdProcessorHooksTest`: with `MDMM_MIDI_MAPPING` 1 the router exists and the pluginLib translator does not; a learned CC moves its parameter; `mdSessionFirmwareTest` (MD and MM ROM): learn by captured CCs, the kit value read back from the firmware follows the controller, and the firmware's own target of that (channel, CC) does not move.
5. **Page journey.** Editor tier, `md-control-learn` and `mm-control-learn`: LEARN, click a knob, the controller sends two values (a diagnostics-only Session row `testMidiIn {a, b, c}` queues a host-source event for the next block), the learn document shows the mapping, a third value moves the knob on screen and in the machine's kit document; remove it. Page tier: scenarios `control-learning` and `control-mapped` for both pages (learn documents played as data), `mdmmScenariosPageTest`.
6. **Save and load.** `mdDeskSetupStateTest`: mappings round trip through `MDSK`; the lenient cases (unknown member, bad item left out alone with its path, past 128, target outside the limits, unknown mode); `MDLN` import when `mappings` is missing, ignored when present; a project saved before the session applied a load writes the pending setup. `mdSessionNoRomTest`: a learned CC still moves the parameter after `getStateInformation` into a new processor's `setStateInformation`.
7. **Realtime under load.** `mdEditFlowPluginTest` gets a learn stream (`EDITFLOW_LEARN=1`: eight mappings, one mapped CC every block, a table republished every 100 ms); `scripts/mdmm-rt-check.sh --lock --load 24` passes for MD and MM with it on.
8. **Pure parts.** `deskCoreTest` (or a new `deskLearnTest`): the edits, `learnStep`, `detectMode` (a button is Absolute; 1/127 is Relative Signed; 63/65 Relative Offset), `moveKnobCc`.
9. **Screens.** Haiku reviews the CONTROL screenshots of both editors (cut text, overlap, contrast), with the MM before/after pair for Radek.

## Slices (for Sonnet agents)

At most three at once (PLAN-0.8 shared rules). Each in its own worktree under `audio/gearmulator-md-mm-wt/`, cut from origin/main after `fix/1.0-lock-free-audio` is merged; merge after its own test and an independent Sonnet review.

| # | Slice | Goal | Files | Done when | Size | Runs |
|---|---|---|---|---|---|---|
| L0 | Learn core and the setup member | The pure learn functions and `DeskSetup::mappings` with its lenient codec | new `deskCore/deskLearn.h/.cpp`; `deskCore/deskSetup.h/.cpp`; `deskCore/CMakeLists.txt`; tests in `deskCoreTest` (or new `deskLearnTest`) | test 8 and the codec half of test 6 (no plug-in) pass; a fixture written by the new codec is read by `mdmm-v0.7.0`'s setup codec without errors | M | first, parallel with L1 and L3 |
| L1 | Realtime router | `LearnTable`, `LearnRouter` (seqlock, local copy, capture ring, touched bits, counts) and the hook in `Processor::addMidiEvent` | new `mdJucePlugin/mdLearnTable.h`, `mdLearnRouter.h/.cpp`, `mdLearnRouterTest.cpp`, `mdLearnRouterStressTest.cpp`; `jucePluginLib/processor.h/.cpp` (a virtual `consumeMidiIn(ev)` where the translator is called today, default: the translator; `beginBlock` from `processBlockStarted`); `mdPluginProcessor.h/.cpp` (owns the router, overrides the hook for `Host` events); `mdmmPlugins.cmake` | tests 1 (router half), 2 and 3 pass, the TSan run is clean; `mdProcessorHooksTest` still passes with the switch off | M | first, parallel with L0 and L3; rebases on WP3 (`mdPluginProcessor.cpp`) |
| L2 | Session wiring | `MidiLearnCommands` on the setup and the router: learn pulled in the step, no callbacks; the table built from the learn model; host notification with gestures; `overrides`, progress, `max`, `left` in the document; `knobs` moves mappings, `learnSetCc` removed; `MDLN` import; the switch to 1 | `mdMidiLearnCommands.h/.cpp`; `mdDeskSession.h`, `mdSessionMd.cpp`, `mdSessionMm.cpp` (learn model: only realtime-capable parameters); `mdDeskHost.cpp` (`MDLN` read only); `deskHost/deskHost.h/.cpp` (rows, switch default 1); `jucePluginLib/parameter.h/.cpp` (`notifyHostOfValue`); schemas regenerated (`mdDeskTest --write-schema`, `mmDeskTest --write-schema`) | tests 1, 4 (no-ROM half), 6 pass; the schemas validate the new document (`mdSessionFirmwareTest` schema check); `page_contract_check.py` passes | L | after L0 and L1 |
| L3 | pluginLib hygiene | The translator's closure hazard and the button misread fixed where they are, though these editors no longer use them | `jucePluginLib/midiLearnTranslator.cpp` (invoke a copy of `onMappingLearned`, never the member), `jucePluginEditorLib/pluginEditor.cpp` (the closure does not clear its own slot), `jucePluginLib/midiLearnTranslator.cpp` `detectMode` ({0,127} Absolute) | a `midiLearnTests` case: a callback that clears the slot inside itself runs to the end under AddressSanitizer; the button case | S | any time, parallel |
| L4 | Machinedrum CONTROL page | The page changes listed above for the MD | `skins/mdStudio/mdDeskControl.js`, `mdDeskApp.js`, `mdDeskKeys.js` (Esc leaves LEARN); `doc/modern-ux/mockup/index.html` only if markup changes; `sync-mdstudio-skin.py`; scenarios `doc/modern-ux/scenarios/md/control-learning.json`, `control-mapped.json` | `sync-mdstudio-skin.py --check`, `mdDeskPageTest.js`, `mdmmScenariosPageTest` with the two scenarios pass; Haiku passes the screenshots | S to M | after L2's document is fixed (can start from this contract with scenarios in parallel with L2) |
| L5 | Monomachine CONTROL page | The page changes listed above for the MM: CC rows from the learn document, page-local knob links gone, LEARN digits from `knobCcs` | `skins/mmStudio/src/115-control.js`, `130-main.js`, `53-seam.js`, `55-host.js`; `skins/mmStudio/mmAdapter.js`; `sync-mmstudio-skin.py` (regenerates `mmMockup.js`); scenarios `doc/modern-ux/scenarios/mm/control-learning.json`, `control-mapped.json`; `doc/modern-ux/mm-mockup/demo/` if the demo host needs the learn document | `sync-mmstudio-skin.py --check`, `mmViewTest.js`, `mmSelfTest` seam check, `mdmmScenariosPageTest` pass; Haiku passes the screenshots; a before/after pair is ready for Radek | M | parallel with L4 |
| L6 | Firmware boundary and realtime gate | The end-to-end proofs | `mdSessionFirmwareTest.cpp` (on position, MD and MM); `deskHost` diagnostics-only row `testMidiIn`; `skins/mdStudio/mdDeskJourneys.js`, `skins/mmStudio/mmJourneys.js` (`*-control-learn`, editor tier, `deskJourney.js` TIERS); `mdEditFlowPluginTest.cpp` (`EDITFLOW_LEARN`); `scripts/mdmm-rt-check.sh` (pass the switch through) | test 4 firmware half with both ROMs, test 5 editor tier, test 7 (`--lock --load 24`, MD and MM) pass; the app modulators' existing tests pass with the tab back on | M | after L2, L4, L5 |
| L7 | Developer docs | The docs say what is built | `doc/midilearn/THREADING.md` (status: superseded by this design for MD/MM, the pluginLib notes kept as history); `doc/modern-ux/FOUNDATION.md` ("MIDI mapping is hidden for now" becomes "MIDI mapping"; `MDLN` in "What 1.0 promises to read"); `doc/features/*.json` rows | `node scripts/mdmm-guide.mjs --check` green. The user guide (`midi_learn.md`, guide chapters) is WP8's, written from this doc | S | last |

Order: L0, L1, L3 together; then L2; then L4 and L5 together; then L6; L7 last. The hand test gets the items of PLAN-0.8 "MIDI Learn" plus: a button learned as min/max; the MM matrix shows a learned CC; the app LFO and Random rows work again (they return with the tab).

## Risks

- **The app modulators come back with the tab.** They have been hidden since 0.3.0; their tests ran, their screens were not looked at. L6 runs their tests; the hand test looks at them.
- **`Parameter::setValue` from a learned CC uses the host-automation origin.** If the host also automates that parameter, the last writer wins per block. Same as any controller; documented in the guide (WP8).
- **Hosts and gestures.** The 250 ms gesture end is a guess; Live and Logic behave well with it in other plug-ins. If a host records a staircase or misses the touch, the hand test says so and the constant moves.
- **`MDLN` import** covers only alpha-era projects; a mapping with `AutoPart` or an unknown name is left out and logged.

## Question for Radek

**Where do mappings live?**
- **A. Only in the project** (the standalone keeps them in its own saved state). A new plug-in instance starts with none. No file is ever written. Like Live and Bitwig.
- **B. In the project, and the last learned set also as a default for new instances** (a file in the editor's config folder, written by the session step, never on the audio thread). Like most plug-ins (Serum, Vital, Arturia). A project's own mappings always win over the default.

Claude's pick: **A**. It is the smaller, testable design (no file, no "which one won" question on load), and a controller set is one LEARN round per project. B can be added later without changing the setup format.

## Decision on the open question

Radek, 2026-10-16: **A**. Mappings live only in the project (the standalone in its own saved state); no config file. B (a default for new instances) can come later without a setup format change.
