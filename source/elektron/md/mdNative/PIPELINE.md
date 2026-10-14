# Complete standalone signal-path proof

The `mdNative` library now renders this path without a DSP interpreter, JIT or emulated CPU:

```
16 GND-SIN voices / pitch and amplitude envelopes
  -> per-track AM -> EQ -> upper/lower filters -> rate reduction -> drive/DC removal
  -> track level and equal-power pan
  -> main stereo bus + stereo delay send + stereo reverb send
  -> delay (feedback, crossfeed, high/low filtering, return gain)
  -> reverb (including optional delay-to-reverb send)
  -> sum dry, delay and reverb
  -> master EQ -> master gain -> compressor with lookahead and dry blend
  -> stereo PCM
```

This is the **complete signal path for the proved voice family**. It is not the complete Machinedrum:
additional voices, sampling/recording, LFOs, the firmware sequencer/control layer, hardware individual outputs,
and ADC/DAC/analogue circuitry are outside it. The interface currently uses original raw DSP parameters and
32-frame blocks at 44.1 kHz. Parameter changes and note triggers enter at block boundaries.

## Recovery and comparison

| Stage | Original instruction ranges | Native implementation |
| --- | --- | --- |
| GND-SIN voice | DSP2 P:$1000a4..$1000dc | `mdNative.cpp` |
| Track processing | DSP1 P:$a4..$25d | `mdNativeChain.cpp`, `mdNativeTrack.cpp` |
| Level, pan and two sends | DSP1 P:$2de..$2fa; generated summation at P:$9de | `mdNativeMixer.cpp` |
| Stereo delay | DSP1 P:$342..$43b | `mdNativeDelay.cpp` |
| Reverb | DSP1 P:$43c..$66b | `mdNativeReverb.cpp` |
| Master EQ and gain | DSP1 P:$67c..$87e | `mdNativeMasterEq.cpp` |
| Compressor / output | DSP1 P:$87f..$970 | `mdNativeCompressor.cpp` |

The C++ follows the recovered recurrences, gain laws, buffer delays and state persistence. It does not
dispatch DSP instructions or model registers. Fixed-point arithmetic retains the original sound for these
tests; later float variants can be compared against this reference. Numeric tables are private user-ROM
data. Removing emulation does not yet make this implementation independent of those tables.

The delay preserves the original variable read/write steps and stereo feedback path. The reverb has five
diffusion allpasses, six feedback delay lines (two with modulated interpolation), damping, a gate and
return filtering. Master EQ retains two first-order stages and a parametric stage with 48-bit state.
The compressor retains the detector filtering, envelope tracking, nonlinear level estimate, transfer curve,
gain tracking and lookahead buffer.

`mdNativeOutputFirmwareTest` independently compares the stages with original DSP instructions:

* Mixer: 1,024 blocks, 196,608 bus samples, 16 tracks with randomized levels/pans/sends.
* Delay: 4,096 blocks, 262,144 channel samples; all 22 persisted control/state words match.
* Reverb: 4,096 blocks, 262,144 channel samples, noise excitation followed by a tail.
* Master EQ: 4,096 blocks, 262,144 48-bit channel samples, including gain changes.
* Compressor: 4,096 blocks, 262,144 channel samples, including dry-blend changes.

`mdNativeEngineFirmwareTest` then runs **the complete connected path**, executing original DSP2 voice
instructions and original DSP1 track/mixer/effect instructions as the independent reference. Sixteen voices
retrigger with pitch envelopes, moving track filters, stereo panning and both sends. Notes stop after eight
seconds; the final four seconds include the remaining voice/effect tails.

Result: **16,536 blocks, 529,152 stereo frames, 1,058,304 channel samples**, with zero sample differences.
Output FNV-1a-64: `64e8959def6844e0`. Standalone native C++, WebAssembly/Node and WASM with undefined-behaviour
sanitization produce the same raw WAV. SHA-256:
`8577bf809c55353520c2927659dbab9bde727c38241d2f975a9ac7d167b6e47e`.

A fresh boot of the canonical OS 1.63 ROM reproduced this result independently of the saved memory captures.
Native and WASM renderers also reject truncated profiles, truncated references and a changed expected sample
without writing an output WAV. The repository save check passed (124 tests passed, one skipped).

This establishes equivalence for these inputs against the repository's DSP interpreter. It is not a
real-hardware null test or proof for every possible parameter/state. The per-stage tests and the connected
test intentionally cover different boundaries. Other control settings need additional coverage as they
are exposed in a product interface.

## Reproduce

Build the standalone/native and Emscripten targets as described in [README.md](README.md). Then:

```sh
scripts/mdmm-dev.sh build mdNativeEngineFirmwareTest mdNativeOutputFirmwareTest
temp/dev/source/elektron/md/mdNative/mdNativeEngineFirmwareTest \
  "$GEARMULATOR_MD_FIRMWARE_BIN" temp/md-native-research/proof
temp/md-native-research/native/mdNativeEngineRender \
  temp/md-native-research/proof/engine-profile.bin temp/md-native-research/proof/engine-standalone.wav \
  temp/md-native-research/proof/engine-reference.bin
node temp/md-native-research/wasm/mdNativeEngineRender.js \
  temp/md-native-research/proof/engine-profile.bin temp/md-native-research/proof/engine-wasm.wav \
  temp/md-native-research/proof/engine-reference.bin
```

The firmware harness exports the private numeric profile and original-instruction expected samples. The
standalone renderer only needs the profile; the expected samples are optional verification input. It owns
and advances its own complete state. `Engine::render()` allocates no memory. Constructors allocate delay
storage before rendering. The Node render executable reserves its output buffer and uses a fixed 32 MiB
WASM memory; that file-writing harness is separate from the allocation-free rendering library.

`--snapshot <directory>` is a research-only alternate input for the firmware tests, using private 24-bit
big-endian DSP memory captures from a booted OS 1.63. It never becomes a runtime engine dependency.

## Performance method

`mdNativeEngineRender <profile> --benchmark` measures complete rendering at 1, 8 and 16 active tracks.
Each 64-frame callback renders two native blocks, including scheduled triggers/filter changes and master
processing. Each case warms up first, then reports the median of three approximately ten-second audio runs.
CPU percentage is process CPU seconds divided by rendered audio seconds; wall percentage measures elapsed
time on the same basis. Callback p95 comes from the last trial, not an average of percentiles.

“Returns off” skips delay/reverb rendering in the native engine. The track chain, master EQ and compressor
still run. The firmware comparison sets delay/reverb sends to zero but retains the ROM's processing work.
This is an intentional native bypass capability, not a claim that firmware bypasses those routines.

`mdNativeEmulatorBench <ROM>` boots the whole firmware, creates kits with 1/8/16 GND-SIN tracks, plays a
pattern, and verifies playhead movement and nonzero audio. It measures the whole process, including DSP
worker CPU, in the same 64-frame/44.1 kHz configuration, excluding startup and file output. Native and
emulator cases share voice family/count and active return categories; the firmware's front-panel parameter
mapping and sequencer differ from the native raw-DSP demo. This is a workload estimate, not the same audio
null-test fixture and not a measurement of either editor's GUI/DAW overhead. Node results do not establish
browser AudioWorklet performance. Do not treat Node wall-time usage as native CPU measurement.

Local Apple M4 Pro results (Release builds, 2026-10-14):

| Active GND-SIN tracks | Native C++ CPU, returns on | Firmware emulator CPU, sends on | WASM/Node elapsed budget, returns on |
| ---: | ---: | ---: | ---: |
| 1 | 0.64% | 33.46% | 0.79% |
| 8 | 1.62% | 31.33% | 1.97% |
| 16 | 2.73% | 29.43% | 3.34% |

At 16 tracks, the measured CPU ratio is approximately **10.8:1**. Native returns-off CPU was 2.38%.
The last-trial 95th-percentile 64-frame callback was 41.7 microseconds native and 598.2 microseconds in the
emulator, against a 1,451.2-microsecond callback period. The emulator carries the whole firmware's baseline
work; its small non-monotonic differences across these sequential runs should not be interpreted as a
per-voice scaling law. Clock/power behavior and background system activity were not controlled.

The native standalone build uses `-O3`; the existing emulator development build uses its repository Release
flags, including `-Ofast`. These are local estimates, not a comparison against every shipping/PGO build.
The user's approximate 40% GUI observation is separate from the measured 29.43% headless result. More
complex machines, sampling, routing, host integration and browser execution will need their own benchmarks.
