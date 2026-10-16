# The audio thread and the device lock (1.0, architecture review finding 1)

Status: steps 1, 2, 3 (the panel sends) and 6 done, 2026-10-16; the gate passes (below). Steps 4 and 5 not needed for
it and not done. Branch fix/1.0-lock-free-audio (merged); follow-ups on fix/0.8-lock-followups (below, not merged).

## Status (2026-10-16, M-series Mac, 12 cores, dev build temp/dev)

`scripts/mdmm-rt-check.sh --build temp/dev --lock [--load 24]` (mdEditFlowPluginTest, `EDITFLOW_LOCK_WAIT_MS` 1 ms,
test audio thread at normal priority), load average from start to end of each machine's run:

| Build | Load | MD worst / total wait | MM worst / total wait |
|---|---|---|---|
| step 1 only (before step 2) | 24 loops | 27 ms / 384 ms | 21 ms |
| steps 1 + 2 (the WIP commit) | 24 loops | 19.6 ms / 24 ms FAIL | 1.8 ms FAIL |
| steps 1 + 2, blamed (lock blame, below) | 24 loops, load 47 to 104 (another build ran) | 38.8 ms / 109.9 ms FAIL: 9 waits on `mdStudioLink.cpp:173` (turnKnob), 1 unnamed | 0 |
| **steps 1, 2, 3, 6** | quiet, load 2.0 to 2.2, no build | **0 / 0 PASS** (18584 blocks) | **0 / 0 PASS** (18663 blocks) |
| **steps 1, 2, 3, 6** | 24 loops, load 71 to 80, no build | **0 / 0 PASS** (14464 blocks) | **0 / 0 PASS** (12826 blocks) |

No panel event and no device command was dropped in any run, and the B-014 actions part of rt-check passed. While
editing, no thread but the audio thread takes the device lock any more: the edit flow records no hold at all.

What was left after step 2 was the Send class: the desk's panel keys and knob steps took the lock per edit, and under
load a blocking wait of a normal-priority thread is woken late. Step 3 moved those (MD `sendPanel`, `pressKey`,
`turnKnob`; MM `pressKeys`, `pressBankTrigs`) to a command queue (`synthLib::Plugin::sendCommands`,
`synthLib/deviceCommand.h`, `md::DeskDevice::applyCommand`). The rest of the Send class (audition, the tester
switches, `setLatencyBlocks`, `addMidiEvent` when its ring is full) still takes the lock: user actions, not edits, and
none ran in the gate.

How the queue behaves, as built (it differs from the data contract below in these points):
- A command is stamped with the plug-in's device generation (`Plugin::setDevice` counts it), not with the machine's
  hardware epoch. A command queued for a device that `setDevice` replaced is dropped and counted. A Hardware replaced
  inside the same device (a state restore, the factory-flash reboot) keeps the generation: its panel commands go to
  the new Hardware, as they did under the lock.
- Edits during a device swap are lost: `setDevice` captures the old device's state before the swap, so a panel key
  applied to the old device after the capture, or queued for it and dropped at the swap, is not in the new one. Each
  dropped command is counted (`Plugin::getDroppedCommandCount`, the gate fails on any while editing). Under the lock
  it was the same for the first case; a swap is a ROM change or a reboot, not an edit.
- A refusal is known at send time only for what the sender can see: no desk device or not a valid one, an empty
  sequence, or one longer than the free part of the device's 512-packet queue as the facts last said
  (`AudioPluginAudioProcessor::sendDeskCommands`; the page then says "No panel here" as before). What only the audio
  thread knows (the queue filled meanwhile, for example by a second key of a chain sent before a block ran) is not a
  refusal: the sequence is dropped whole and counted.
- Lock order: `m_lockCommands` before `m_lock` (the full-queue path); nothing that holds `m_lock` may send commands.
- The work of a hold is the holder's CPU time (`CLOCK_THREAD_CPUTIME_ID`); on Windows, without a fine thread clock,
  the wall time stands for it.

Lock blame (diagnostics, always compiled, recorded when the realtime instrumentation is on): every hold of the lock
records its site (`withDeviceLocked` and plugin.cpp take `__builtin_FILE`/`__builtin_LINE`), a wait of the audio
thread is blamed on the holder's site, and every hold off the audio thread is recorded with its wall time and the
holder's own CPU time. rt-check --lock prints them.

**Bulk copies in parts, of one moment (md::OneMomentCopy).** The review's boundary run (mdMachineMemoryFirmwareTest md at
load 8 to 13) found one hold of real work over 1 ms: the "atomic" look copied the whole 1 MiB patch RAM (and on the
Monomachine the 2 MiB user flash) in one hold, and the Monomachine's state save copied both in one hold too (1.6 ms of
work under load). Now every copy of machine memory off the audio thread (the look, the sample flash copy, the start's
memory, the state save of both machines) goes through `md::OneMomentCopy`: parts of 64 KiB a hold, and write marks per
piece in `md::Microcontroller` (16 KiB of patch RAM, 64 KiB of flash; counted in the slow write path only, the fast
lane never maps patch RAM, so the emulation is unchanged). Each hold first marks stale every piece written since it was
copied; when what is stale is no more than one part it is copied in that hold, and the copy is of that moment. After
four full passes' worth of holds what is still stale is copied in one hold only when it is at most 4 parts (256 KiB,
`OneMomentCopy::g_restLimit`); a larger rest goes on a part per hold for as many holds again and then the copy gives up
(`Step::Busy`, nothing copied): the look and the sample flash copy return false and are tried again by the next look, the
state save begins again (at most `DeviceStateCapture::g_restarts` times) and then fails rather than take the memory whole.
So no hold copies more than 256 KiB, whatever the firmware writes (follow-ups 2026-10-16, branch fix/0.8-lock-followups;
mdStateCaptureTest writes 17 pieces of patch RAM between every part: gave up after 5800 holds, none over 64 KiB). The
Monomachine's flash writes (programmed word, erased sector) mark their own 64 KiB piece, as the Machinedrum's do
(`hwLib::Am29f::changedAt/changedSize`), so a firmware flash save during a copy re-copies one piece, not the whole flash;
the machine of a look is compared as the exact pair (device id, hardware epoch), not a hash. `memoryMarksTest` (no ROM)
fails when the patch RAM or flash write path stops marking. The look's check no longer
makes the factory baseline in its hold (`hasFactoryFlashBaseline`, the making copied the factory cache: a 3.2 ms hold).
mdStateCaptureTest: patch RAM written between the parts of a save is saved as it is after the writes.

**One firmware test at the boundary**, mdMachineMemoryFirmwareTest md and mm (save, restore, factory start, damaged
file, two instances, a save landing between the pieces of a look, ...), every product hold reported, the test failing
on more than 1 ms of work under the lock in any hold:

| Run | Load (start to end, other builds) | Worst work in a hold | Worst wall time |
|---|---|---|---|
| before (one-hold atomic look), md | 8 to 13 | **1.9 ms FAIL** (look) | 11.4 ms |
| after, md | 138 to 7.5 (another agent's builds, then quiet) | 0.65 ms PASS | 2.2 ms |
| after, mm | 7.5 to 6.3 | 0.09 ms PASS | 11.7 ms |

After merging main (MD quantum 30 us, re-recorded goldens) one more hold showed: the start's memory made the factory
baseline on first use, which copied the factory cache under the lock (1.02 ms of work at load 88). `md::Hardware` now
makes the baseline of a given cache when it is built, off the lock. Then md: worst work 0.65 ms (load 3 to 23, two
builds by the end), mm: 0.07 ms (load 23 to 17), PASS; goldens 30 of 30 against main's.

The wall times above the work are the low-priority memory thread preempted while holding (the second way a short hold
becomes a long wait, below). On macOS a real-time audio thread that waits lends its priority to that holder (measured
14 us at load 90, below); on Linux and Windows it does not. Only steps 4 and 5 (copy jobs run by the audio thread, the
try-lock owner token) remove that case; they wait for evidence from a host on those systems.

**rt-check after the copies in parts** (`--lock --load 24`, no build at the start; other agents' builds started during
it, load 153 to 184): MD 0 ms (12169 blocks), MM 0 ms (9292 blocks), PASS, nothing dropped.

**Goldens:** local gate stage 5 (`MDMM_GATE_ONLY=5 MDMM_GATE_SKIP_BUILD=1 --build temp/dev`): 30 of 30 runs equal their
golden, before and after the write marks. **Tests:** synthLibDeviceCommandTest (new: order, one block per call, a full queue applied by the sender, a
stale or refused command dropped and counted, the blame names the holder), synthLibStateTransactionTest,
synthLibMidiQueueTest, synthLibSeqlockTest, synthLibStateCaptureTest, mdStateCaptureTest, mdSessionNoRomTest md/mm,
mdProjectStateRestoreTest: pass; `scripts/mdmm-check.sh` (quick tier against main: 126 unit tests, page contracts,
page journeys, one golden a machine) green; after the write marks the same, but for two Monomachine page-journey
shards whose stub host ended at the shard's end under load (every journey passed); the Monomachine page journeys again
alone: 159 passed, 0 failed. mdSysexLifecycleTest needs the Monomachine factory patch RAM, absent on this Mac (the
gate says the same). Not done: the ticket echo of the design's command (callers read the device's own pending facts,
`panelPending`), `missedBlocks` (step 5).

### The seqlock test failures of 2026-10-16

synthLibSeqlockTest failed on the Windows CI (72 and then 3017 "torn" reads), on the Linux CI (310) and once on macOS
under load. `synthLib::Seqlock` (source/synthLib/seqlock.h) was not at fault: the writer stores the odd sequence, a
release fence, the words as relaxed atomics, the even sequence with release; the reader loads the sequence with
acquire, the words relaxed, an acquire fence, the sequence again. That is Boehm's seqlock: a reader that saw a word of
a newer write sees, through the fence pair, that write's odd sequence, so it retries; no plain memory is shared. The
two hand-made seqlocks of the working kit (mddeskdevice.cpp `publishWorkingKit`, mmtelemetry.h) follow the same order.

The test was wrong. Every "torn" value printed whole was all zeros: the constructor's `T{}`, which the readers read
when they ran before the writer thread's first write. The test called a value whole only when it equalled `make(n)`,
and `make(0)` is not `T{}`, so how many it counted depended on how late the writer thread started (more on a busy
runner). Now `T{}` counts as whole and the test also checks that a read is never older than the last write that had
completed when it began, runs a second case of two writers serialised by a mutex (as Plugin's lock holders are) with
more readers than cores, a 13-byte value, and a ThreadSanitizer build of the same file (synthLibSeqlockTsanTest, where
the compiler has it). A mutant that skips the reader's re-check fails it at once (604 torn in 200 ms). Locally: 500
runs under load 185 to 255 and 50 TSan runs, none failed.

Writers: the only writer of the machine facts is the FactsCallback (mdPluginProcessor.cpp), called from
`Plugin::publishFacts` by a `PublishOnExit` that every site declares after its `LockScope` (or, in `process`, after
the lock is taken), so it runs while `m_lock` is held: one writer at a time, as the seqlock asks.

## Problem

`synthLib::Plugin::process` (plugin.cpp, the audio thread) takes `m_lock`, a blocking `std::recursive_mutex`. The
same lock is taken off the audio thread by 44 `withDeviceLocked` sites in our code (mdPluginProcessor 21,
mdStudioLink 9, mmStudioLink 6, mdMachineMemoryDevice 5, mdDeskHost 2, mdController 1) and by 17 `lock_guard`s
inside plugin.cpp itself. `scripts/mdmm-rt-check.sh --lock` (mdEditFlowPluginTest, `EDITFLOW_LOCK_WAIT_MS` 1 ms)
measured 5.6 ms worst on a busy Mac.

## Measured (2026-10-16, M-series Mac, 12 cores, dev build temp/dev)

Tool: a throwaway per-site probe (reverted; kept outside the repo). Every `withDeviceLocked` and plugin.cpp lock
recorded its call site, hold time (count, mean, max, over 250 us, over 1 ms) and, when `process` had to wait, which
site held the lock at that moment (blame).

**Edit-flow lock check (mdEditFlowPluginTest, the --lock gate):**

| Run | Load average (start to end) | MD max wait | MM max wait |
|---|---|---|---|
| plain, test audio thread at normal priority | 14 to 10 (MD), 10 to 9 (MM) | 0.467 ms PASS | 0.074 ms PASS |
| same, with the probe | 13 to 9, 9 to 8 | 0.022 ms PASS | 0.398 ms PASS |
| 24 busy loops added, normal priority | 7.5 to 75, 75 to 117 | **38.96 ms FAIL** (250 ms in all) | **20.13 ms FAIL** (177 ms) |
| 24 busy loops, audio thread time-constraint (as a DAW's) | 65 to 90, 90 to 90 | 0.014 ms PASS | 0.013 ms PASS |

The sites blamed for the long waits all hold the lock for microseconds (largest mean 0.7 us, largest max 0.2 ms):

| Site (thread, cadence) | Holds | Mean / max hold | Waits blamed | Worst wait |
|---|---|---|---|---|
| MD `serviceDeferredStateRestore` poll (message, timer) | 94 | 0.4 us / 0.011 ms | 3 | 38.96 ms |
| MD `recordBoot` (message, 1 Hz) | 94 | 1.4 us / 0.019 ms | 2 | 16.10 ms |
| MD `readTelemetry` handle lookup (desk step) | 93 | 0.1 us | 1 | 9.76 ms |
| MD `readSampleBank` handle lookup (250 ms) | 225 | 0.6 us | 1 | 5.95 ms |
| MD `probe` (96 ms) | 582 | 1.2 us / 0.028 ms | 11 | 7.99 ms |
| MM `probe` (96 ms) | 422 | 1.3 us / 0.199 ms | 9 | 16.99 ms |
| MM `readTelemetry` handle lookup | 82 | 0.4 us | 1 | 14.71 ms |
| MM `serviceStateRestoreFailure` poll | 305 | 0.6 us | 6 | 3.16 ms |

So the gate's long waits are not long holds. They are the cost of blocking at all: the test's audio thread sleeps
in the kernel on a contended lock and is woken late on a loaded machine. With a time-constraint audio thread the
same load gives 14 us, because Darwin's pthread mutex lends the waiter's priority to the holder (turnstiles).
Linux `std::recursive_mutex` has no priority inheritance and Windows has none either, so there the inversion is real.

**Long holds (mdMachineMemoryFirmwareTest md / mm, load 46 to 9 and 8 to 6).** Not in the edit flow, but each is a
dropout of its length when audio runs (session open with a memory file, ROM change, project load):

| Site | Class | MD mean / max | MM mean / max |
|---|---|---|---|
| `Plugin::setDevice` (getState of the old device + setState of the new, under the lock) | lifecycle | **168 / 181 ms** (3) | **65 / 68 ms** (3) |
| `MachineMemoryDevice::startMemory` (8 MiB flash + 8 MiB ROM copy + factory cache decode) | bulk | **36 / 119 ms** (27) | 0.14 / 0.35 ms |
| `MachineMemoryDevice::copyFlash` (atomic: the whole sample flash in one hold) | bulk | 0.039 / 10.5 ms | n/a |
| `MachineMemoryDevice::look` (64 KiB chunks) | bulk | 2.6 us / 11.0 ms (8 over 1 ms) | 1.7 us / 11.1 ms |
| `Plugin::getState` (`beginStateCapture` under the lock) | state save | 0.69 / 1.57 ms | 0.11 / 0.21 ms |
| `Plugin::setState` (transaction begin / finish) | state restore | 0.098 / 0.38 ms ; 2.7 us | similar |
| storage image commit (mdPluginProcessor) | lifecycle | n/a | 0.14 ms |

The 11 ms maxima of `look` (mean 2 us) are holders preempted while holding: the second way a short hold becomes a
long wait. `setHostSamplerate` (1.8 ms), `setBlockSize` and `reserveMidiEventCapacity` (8.6 ms) also hold long, but
only in `prepareToPlay`, which hosts do not run concurrently with `processBlock`.

## Site map (our code; tests excluded)

| Class | Sites | What it needs | Hold |
|---|---|---|---|
| **Read facts** | `probe` (MD, MM), `ready`, `restoreGeneration`, `firmwareReadyForAutomation`, `isNoRomDevice` (deskHost x2), `auditionStatus`, `serviceStateRestoreFailure`, `getProjectStateRestoreError`, `recordBoot`, startup diagnostics, `isExactEssiTiming`, `getSpeedUpLeversOff`, `isLegacyEmulation`, `isRamRecordingModeAvailable`, `logSpeedUps`, `getLatency*`, `setPreferredDeviceSamplerate` | a few scalars and a string the page or the processor shows | us; frequent (96 ms, 250 ms, 1 Hz, per automation) |
| **Read handles** | `readTelemetry` (telemetry + panel publisher, MD and MM), `readSampleBank` (sample exchange), MM `readLcd` fallback | a pointer to an object the device already publishes lock-free; changes only when the device or its Hardware is replaced | us; 1 Hz, 250 ms |
| **Send** | `sendPanel`, `pressKey` (MD, MM), `turnKnob`, `pressBankTrigs`, `audition`, `setRamRecordingMode`, `setLegacyEmulation`, `setExactEssiTiming`, `setSpeedUpLeversOff`, `setLatencyBlocks`, `addMidiEvent` when its ring is full | a value handed to the device; the device already applies it on the audio thread (panel sequence: a fixed buffer sent at block end) | us; per edit |
| **Bulk memory** | `look`, `copyFlash` (chunked and atomic), `startMemory`, storage-image recovery copy (patch RAM) | consistent bytes of patch RAM / flash; ROM and factory baseline are immutable per Hardware | 2 us to 119 ms |
| **State save / restore** | `Plugin::getState` (capture), `Plugin::setState` (transaction begin, finish; non-transaction path), `MachineMemoryDevice::restore` | capture under the lock, encode outside (exists); prepare outside, finish inside (exists) | 0.1 to 1.6 ms |
| **Lifecycle** | `Plugin::setDevice`, factory-flash reboot (context capture, getState, `commitPreparedState` with a full `getState` compare), deferred restore (take, reject, commit), storage image install (context, commit) | replace the device or its Hardware; the replacement is mostly prepared outside already | 0.1 to 181 ms |
| **Prepare** | `setHostSamplerate`, `setResamplerMode`, `setBlockSize`, `reserveMidiEventCapacity` | host prepare; not concurrent with process | 1 to 9 ms, harmless |

## Candidates

**A. The device belongs to the audio thread; values cross the boundary.** While audio runs nobody else touches the
device. Off-thread code sends commands (a ring drained at block start, as MIDI already is), reads facts (a snapshot
the audio thread publishes at block end, as telemetry and the LCD already are), gets bulk bytes by a copy job the
audio thread runs in bounded slices, and replaces the device or its Hardware by a swap command whose old object
comes back on a retire ring to be freed off-thread.
- Real time: the audio thread never waits, on every OS, whatever the load or the holders' priority. Its added work
  is bounded (a ring pop, a snapshot write, one slice).
- Bit-exact: the device's `process` is unchanged; a command is applied at the same block boundary the lock gave it
  (panel packets already leave at block end). Offline goldens send no commands, so they cannot change.
- Simplicity: values and queues, one owner per piece of state. Sync calls that returned a bool become "queued";
  their outcome is a fact in the snapshot (the device already reports `panelPending`).
- Effort: large if done at once; it is done by class below, each class small. Needs one fallback: a host that stops
  calling `processBlock` must not stall the queues (see the contract).

**B. Keep the lock; make every hold short; the audio thread try-locks.** Move the long work out (setDevice,
startMemory, the atomic copy, the capture), then let `process` use `try_lock`, spin briefly, and on failure render
silence and count it.
- Real time: bounded, but a preempted holder still costs blocks, now as silence instead of a wait. Worse, a
  spinning `try_lock` gives the kernel nothing to boost, so on macOS it loses the priority inheritance that made the
  measured DAW case 14 us. Linux and Windows unchanged.
- Bit-exact: a missed block slips machine time against the host (MIDI clock offset) when it happens.
- Simplicity: keeps one shared mutable place and 44 lock sites to audit forever.
- Effort: small for the long holds, small for the try-lock.

**C. Only shorten the long holds and keep the blocking lock (rely on priority inheritance).** Smallest change and
it fixes every measured real dropout on macOS (setDevice, startMemory). It leaves the gate failing under load (the
test thread is not time-constraint), leaves Linux and Windows exposed, and leaves the 8 ms desk step polling a
shared lock. Not enough for "never waits", but it is step 1 of A.

**Choice: A, delivered as C first.** B is rejected: try-lock on Darwin is a regression against measured data. A's
first step is C's work, so the real dropouts go first and every later step removes a whole class of sites.

## Data contracts (A)

All in synthLib, generic over `Device`; the md/mm specifics are fields and command kinds, not new threads.

```cpp
// 1. Commands: any non-RT thread -> audio thread. Producers serialise on a non-RT mutex (as addMidiEvent does);
//    the audio thread pops lock-free at the start of process(), before MIDI. Capacity 256, fixed, no allocation.
struct DeviceCommand
{
	enum class Kind : uint8_t { PanelEvent, PanelSequence, Audition, SetOption, SetLatencyBlocks,
		TakeDeferredState, RejectDeferredState, Commit, Swap, CopyJob };
	Kind kind;
	uint32_t ticket;                 // producer's sequence; the snapshot echoes the last one applied
	uint64_t epoch;                  // the hardware epoch the producer saw; a stale command is dropped and counted
	                                 // (as built: synthLib::DeviceCommand::deviceGeneration, see Status)
	uint32_t a = 0, b = 0;           // small operands (row/mask, option id/value, hold frames, latency blocks)
	std::array<PanelPacket, 64> panel; uint8_t panelCount = 0;   // longer sequences are split by the producer
	void* payload = nullptr;         // Audition clip, PreparedState, new Device, CopyJob: owned by the producer
};                                   // until the result says applied; freed by the producer, never on the audio thread

// 2. Facts: audio thread -> anyone. Written once per block into a seqlock (two copies + sequence); readers retry.
struct DeviceFacts                   // trivially copyable, ~200 bytes
{
	uint64_t sequence, hardwareEpoch, deviceId, cycles;
	uint32_t lastTicketApplied, droppedCommands, missedBlocks;
	uint8_t probe;                   // deskCore::LifeFacts::Probe: Missing, Loading, Unsupported, Booting, Running
	bool valid, firmwareMidiReady, restorePending, factoryFlashExpected, factoryFlashReady, factoryBaselineKnown;
	uint8_t restoreStatus; uint64_t restoreGeneration; uint64_t restoreErrorGeneration;
	uint8_t dspBooted; bool speedUps, exactEssi, ramRecordingAvailable; uint32_t speedUpLeversOff;
	elektronData::AuditionStatus audition;
	uint64_t flashWriteMark;         // uc.flashDirty / flashIdleCycles as one counter: copies use it to know they are consistent
	uint32_t latencyMidiToOutput, latencyInputToOutput;
};
// Strings (the restore error) are not facts. The error is made off the audio thread (the restore's validation;
// the RejectDeferredState producer already holds the text), so that thread writes it into a small mailbox behind its
// own mutex, which the audio thread never takes; facts carry restoreErrorGeneration so readers know a new one is there.

// 3. Handles: set by whoever performs a Swap or Commit (a non-RT thread), read by the desk. Message-thread owned.
struct DeviceHandles { std::shared_ptr<const SequencerTelemetry> telemetry; std::shared_ptr<FrontPanelPublisher> panel;
	std::shared_ptr<SampleExchange> samples; uint64_t hardwareEpoch; };

// 4. Copy jobs: the requester owns `to`; the audio thread copies at most 256 KiB a block at block end, then sets done.
struct CopyJob { enum class Area : uint8_t { PatchRam, Flash, UserFlash, StateCapture } area; size_t at, size;
	uint8_t* to; uint64_t epoch; bool consistent; std::atomic<uint8_t> state; /* Pending, Done, Changed, Gone */
	uint64_t markAtStart; };         // consistent: Changed when flashWriteMark moved during the job; the requester retries

// 5. Retire ring: audio thread -> message thread: old Device / Hardware / PreparedState pointers to delete.
```

Threads: producers are the message thread (desk step, controller, processor timers) and the machine-memory thread.
The audio thread is the only consumer of commands and the only writer of facts. **Idle fallback:** `m_lock` stays,
but only as the owner token: `process` takes it with `try_lock` (it never waits); a non-RT thread may take it, and
then drain the command ring and run copy jobs itself, only when no block has run for 20 ms (host stopped, before the
first `prepareToPlay`, offline tests). If audio resumes in that window `process` renders silence once and counts
`missedBlocks` (a fact; the gate fails on any).

## What happens to each class

- **Read facts**: one `plugin.facts()` read; every listed site becomes a field. `probe` is computed by the device on
  the audio thread (it already knows fingerprint, validity, restore and firmware state).
- **Read handles**: `DeviceHandles` refreshed by the Swap/Commit performer; `readTelemetry`'s 1 Hz re-lookup goes.
- **Send**: a `DeviceCommand`; the call returns "queued". The panel sequence's fixed buffer stays the device's.
  `addMidiEvent` with a full ring drops and counts instead of taking `m_lock`.
- **Bulk memory**: `look` and chunked `copyFlash` become copy jobs of 64 KiB to 256 KiB slices; the atomic copy
  becomes a consistent job (retried on Changed); `startMemory` takes ROM and the factory baseline as
  `shared_ptr<const>` (immutable per Hardware; decoded off-thread) and the live flash by a job.
- **State save**: `beginStateCapture` becomes a StateCapture copy job; encode stays outside.
- **State restore / lifecycle**: preparation stays outside (it is already). `finishStateTransaction`,
  `commitPreparedState`, `commitDeferredStateRestore`, the storage-image commit and `setDevice` become Commit / Swap
  commands. Their "nothing changed meanwhile" test compares `hardwareEpoch` + `flashWriteMark` + the battery
  memory's write counter, never a full `getState` under the lock. `setDevice` captures the old device's state with a
  job, sets it on the new device off-thread, configures its audio off-thread, then swaps.
- **Prepare**: unchanged (host contract).

## Steps (biggest waits first)

1. **Long holds out (C).** `setDevice` prepare-outside-then-swap (still under the lock, swap only); `startMemory`
   with immutable parts outside; factory-flash and storage commits compare by counters, not `getState`;
   the atomic flash copy chunked with a write-mark check; `beginStateCapture` copies in chunks. Proof: every
   off-thread hold under 0.25 ms mean and 1 ms max in mdMachineMemoryFirmwareTest md/mm and
   mdProjectStateRestoreTest (probe re-applied from the scratch patch, or the per-site table made a diagnostics
   build feature).
2. **Facts snapshot.** Every Read-facts and Read-handles site. This removes all holds of the desk step and the
   processor timers: the sites the gate blamed. Proof: --lock MD and MM pass at 1 ms with the 24-loop load.
3. **Command ring.** Every Send site, `addMidiEvent` overflow, the deferred-restore take/reject. Done for the panel
   sends (the gate's sites); a full queue is applied by the sender under the lock (no blocks run), not dropped.
4. **Copy jobs.** `look`, `copyFlash`, `startMemory` flash, state capture.
5. **Commit / Swap commands, try-lock owner token, idle fallback, retire ring.** After this `process` cannot wait.
   `withDeviceLocked` is renamed `withDeviceIdle` and asserts (diagnostics builds) that no block ran in 20 ms.
6. **Gate.** --lock also fails on `missedBlocks > 0` and `droppedCommands > 0`; mdmm-rt-check.sh gets a `--load`
   switch (N busy loops) so "busy Mac" is reproducible instead of luck. Done (`missedBlocks` comes with step 5), with
   the lock blame printed.

## Done when

- `scripts/mdmm-rt-check.sh --lock` passes for MD and MM at `EDITFLOW_LOCK_WAIT_MS=1` on a quiet Mac and with
  `--load` (test audio thread at normal priority, the strict case), load average written beside each result.
- Playing goldens bit-exact: `mdmmPerfGateTest` compare (local gate stage 5) unchanged for MD and MM.
- Focused tests: synthLib stateTransactionTest and synthLibMidiQueueTest, new unit tests for the ring (full, stale
  epoch, ticket echo), the seqlock (torn read retried) and the copy job (Changed on a write mark), mdSessionNoRomTest,
  mdProjectStateRestoreTest, mdSysexLifecycleTest.
- One firmware test at the boundary: mdMachineMemoryFirmwareTest md (save, restore, factory start, damaged file)
  with every off-thread hold reported and none over 1 ms.
