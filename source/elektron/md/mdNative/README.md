# Native Machinedrum sound-engine experiment

This is a **native voice-to-stereo signal-path proof**, requested on 2026-10-14. It stays on the separate
`codex/native-audio-engine` branch. [DIRECTION.md](DIRECTION.md) records the agreed product direction;
[ARCHITECTURE.md](ARCHITECTURE.md) audits the existing editors and the missing native-backend pieces.

The voice proof has two implementations:

* `mdNative.cpp`: portable C++17 reconstruction of the MD OS 1.63 voice routine, retaining its fixed-point
  behaviour. No DSP interpreter, JIT, JUCE, threads or allocation in rendering.
* `mdNativeFloat.cpp`: experimental floating-point oscillator/envelopes. It can use the user's original
  table for comparison or generate a mathematical sine without a ROM. Rendering uses double for phase
  and float for signal/envelopes. No SIMD has been implemented yet.

The standalone engine now connects GND-SIN, track processing, stereo level/pan/sends, delay, reverb, master
EQ and compression. It generates coefficients and ramps natively, using numeric tables extracted from the
user's ROM. No native implementation is registered as an editor engine. This is a complete reference signal
path for one voice family, not the complete Machinedrum machine catalogue or sampler.
This repository's existing licence still applies.

## What was proved

The firmware harness boots the user's canonical MD OS 1.63 ROM, checks the GND-SIN dispatch entries, and
copies the original routine and its initialized sine table into a separate DSP interpreter with inert
peripherals. It executes the original instruction words; expected results do not come from the C++ port.
The isolated routine needs no host-port, serial-link or scheduler emulation.

The native implementation matched **27,408 blocks / 877,056 samples**, with zero output differences and
identical phase, gain and pitch-envelope state after every block. The same generated corpus passed in
WebAssembly on Node 26.8.1, compiled using Emscripten 6.0.9. The ARM64 native and WASM replay WAVs are
byte-identical to the interpreter WAV. Corpus audio FNV-1a-64: `86f74cf2c61bb7cf`.

Coverage: all 4,096 combinations of eight parameter extremes, 4,096 deterministic randomized states,
8,192 successive blocks with parameter changes/retriggers, and 11,024 blocks of decaying tones/pitch sweeps.
The trigger's state reset is also compared with the original routine. Bounds include signed 24-bit extrema,
zero/max decay, large/wrapping phase values and the fractional halves of phase/gain.

This isolated voice test establishes equivalence **for these inputs**, against this project's DSP interpreter. It does not prove
every possible input, real-hardware equivalence, the CPU-side mapping from MIDI knobs to DSP parameters,
master effects, or browser real-time performance. DSP1 track processing has a separate proof below;
[PIPELINE.md](PIPELINE.md) records the later complete-chain and master-effects comparisons.
The WASM tests ran in Node.
The reference table remains user-ROM-derived; it is never included in source or published artifacts.

## Sound-oriented version

The floating-point version retains the oscillator/pitch-envelope/amplitude-envelope structure, without
replicating intermediate integer truncations. `generateSineWave` supplies an ordinary sine; `mdNativeRender`
uses musical frequency and envelope-time values and never opens a ROM or reference corpus.

Initial local measurements on an Apple M4 Pro, scalar one-voice rendering, CMake Release (`-O3`, no explicit
fast-math), median of seven runs of 300,000 blocks each:

| Variant | Native ns/sample | WASM/Node ns/sample | RMS error vs reference, dBFS |
| --- | ---: | ---: | ---: |
| Exact C++ with reference table | 3.48 | 3.66 | zero in proof corpus |
| Floating point with reference table | 3.22 | 3.81 | -78.43 |
| Floating point with generated sine | 3.26 | 3.79 | -78.50 |

Error measurements cover the 352,768-sample demo: four pitches followed by four pitch sweeps, before
filtering/effects. The generated-sine variant had approximately -61.42 dBFS peak error and 50.12 dB SNR
relative to that quiet/decaying reference. These numbers are not a perceptual equivalence claim.
Benchmarks exclude initialization, parameter conversion, tables, file I/O, UI, mixing and host overhead.
They do not compare against the full emulator, and tiny native/float differences need broader profiling.
Floating point was slightly slower in this WASM test: its use alone does not guarantee an improvement.

## Reproduce locally

From the repository root, with a locally supplied ROM (never commit it or the generated corpus):

```sh
export GEARMULATOR_MD_FIRMWARE_BIN=/absolute/path/to/elektron_sps1-1uw_os1.63.bin
mkdir -p temp/md-native-research/proof
scripts/mdmm-dev.sh build mdNativeFirmwareTest mdNativeReplay
temp/dev/source/elektron/md/mdNative/mdNativeFirmwareTest \
  "$GEARMULATOR_MD_FIRMWARE_BIN" temp/md-native-research/proof
temp/dev/source/elektron/md/mdNative/mdNativeReplay \
  temp/md-native-research/proof/gnd-sin-corpus.bin
```

Build only the portable library, replay, comparison and ROM-free renderer:

```sh
cmake -S source/elektron/md/mdNative -B temp/md-native-research/native \
  -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build temp/md-native-research/native
temp/md-native-research/native/mdNativeRender temp/md-native-research/proof/rom-free-native.wav
temp/md-native-research/native/mdNativeCompare \
  temp/md-native-research/proof/gnd-sin-corpus.bin \
  temp/md-native-research/proof/gnd-sin-generated-native.wav --generated-wave
```

On macOS, pass `-DCMAKE_OSX_SYSROOT="$(xcrun --sdk macosx --show-sdk-path)"` to the first CMake command
if the system Command Line Tools SDK does not match Xcode's linker.

```sh
emcmake cmake -S source/elektron/md/mdNative -B temp/md-native-research/wasm \
  -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build temp/md-native-research/wasm
node temp/md-native-research/wasm/mdNativeReplay.js \
  temp/md-native-research/proof/gnd-sin-corpus.bin temp/md-native-research/proof/gnd-sin-wasm.wav
node temp/md-native-research/wasm/mdNativeRender.js temp/md-native-research/proof/rom-free-wasm.wav
node temp/md-native-research/wasm/mdNativeCompare.js \
  temp/md-native-research/proof/gnd-sin-corpus.bin \
  temp/md-native-research/proof/gnd-sin-generated-wasm.wav --generated-wave
```

Emscripten needs a writable `EM_CACHE`. In a restricted workspace, copy the installed cache into `temp/`
and set `EM_CACHE` to that copy before configuring/building. The executable tests use Node filesystem
access; the rendering library itself has no filesystem dependency. A browser AudioWorklet wrapper is
still to be implemented and measured.

## Reverse-engineering evidence

REA 6.5.0 was downloaded into ignored `temp/rea` (source commit
`0f55f247cdd2ae9bd7903d5e45962b19dfc233dc`) and `temp/rea-cli` (installed CLI).
`rea doctor --target <ROM>` reported `unsupported binary format` / `file_format_rejected`, with no configured
Hopper/Ghidra/IDA provider. REA was not used to decompile this voice. Its documented firmware extraction
path is not a DSP56303 decompiler. The actual analysis used this repository's `dsp56k::Disassembler` and
the running emulator's memory, with listings kept privately under `temp/md-native-research/os163/`.

MD OS 1.63 DSP2 addresses (24-bit **word** addresses):

| Item | Address / role |
| --- | --- |
| Dispatch tables | Y:$145af5 initialize, Y:$145bb6 trigger, Y:$145c77 render; GND-SIN is index 2 |
| Trigger | P:$1000a4 through P:$1000ac |
| Render | P:$1000ad through P:$1000dc; outputs 32 samples |
| Sine table | X:$148000, 32,768 entries; generated by firmware at startup |
| Voice parameters | Y:(r6+1..4): pitch, amplitude decay, pitch ramp, ramp decay |
| Voice state | Y:(r6+6): ramp; +7/+8: phase high/low; +10/+9: gain high/low |
| Output | Y:(r7), circular 32-word buffer |

Each block computes a phase step from pitch plus the ramp, advances the pitch envelope once, then
evaluates 32 table lookups and amplitude-envelope updates. The gain uses 48-bit state and the original
mixed-signed multiply/accumulate truncation. The portable implementation explicitly defines negative
division rounding rather than depending on implementation-defined C++17 signed shifts.

Related sample-engine leads, **not implemented or proved here**: ROM/RAM playback shares P:$16c;
forward/reverse packed-code staging is at P:$3bc/P:$3cf; X:$146000 is the nonlinear 4,096-entry expansion
table; X:$147e00 is the sample-descriptor table. The interpolation loop at P:$2e4..$2fd accumulates seven
taps. A future sampler must map its rate, buffering, looping, envelope and decimation stages together.

## Shared DSP1 processing kernels

`mdNativeTrack.cpp` additionally reconstructs six original MD OS 1.63 processing kernels. Each has been
compared with the original instruction words in a separate DSP interpreter, including every output sample
and persisted state word. The portable kernels have no emulator dependencies.

| Kernel | Original DSP1 word addresses | Native entry point |
| --- | --- | --- |
| Amplitude modulation | P:$bd..$d1 | `renderAmplitudeModulation` |
| EQ recurrence | P:$121..$133 | `renderEq` |
| Upper-cutoff recursive sections | P:$17a..$19f | `renderUpperFilter` |
| Lower-cutoff recursive sections | P:$1ea..$21e | `renderLowerFilter` |
| Sample-rate reduction | P:$21f..$233 | `renderRateReduction` |
| Drive gain and DC removal | P:$243..$25d | `renderAmp` |

Result: **8,192 blocks per stage, 49,152 blocks / 1,572,864 samples total**, zero sample or final-state
differences. Half the cases start from independent randomized states and half carry state between blocks;
inputs include silence, both full-scale constants and randomized values. Filter feedback/feedforward
coefficients vary per sample, including signed 24-bit extrema in the random domain. AM/SRR controls are
within their raw nonnegative 14-bit range. The exact same corpus passes standalone native C++ and
WebAssembly/Node. Audio FNV-1a-64: `b95c9bd9df5866ab`.

These isolated tests stress the arithmetic independently of coefficient generation. The connected proof
below additionally generates coefficients and preserves delays between stages. `renderAmp` is the drive
gain/DC-removal stage, not the final track volume envelope. AM uses the original sine table extracted locally;
it is not included in the sources.

```sh
scripts/mdmm-dev.sh build mdNativeTrackFirmwareTest mdNativeTrackReplay
temp/dev/source/elektron/md/mdNative/mdNativeTrackFirmwareTest \
  "$GEARMULATOR_MD_FIRMWARE_BIN" temp/md-native-research/proof/track-corpus.bin
temp/md-native-research/native/mdNativeTrackReplay temp/md-native-research/proof/track-corpus.bin
node temp/md-native-research/wasm/mdNativeTrackReplay.js temp/md-native-research/proof/track-corpus.bin
```

Build the standalone native/WASM targets as above before replaying. Firmware, disassemblies, lookup tables
and generated corpora stay in ignored `temp/`; no ROM is distributed with this work.

## Connected track rendering and adjustable parameters

`mdNativeChain.cpp` connects all six kernels, including original EQ/filter coefficient generation,
coefficient interpolation, and the two-sample history between the upper and lower filters. Its output is
mono audio before track volume/pan, sends and master effects. Rendering executes ordinary C++ and does
not depend on an emulator, but **the reference version still needs the original numeric lookup tables**.
Only the separate generated-sine voice example is currently independent of ROM-derived data.

The harness executes the original DSP1 instructions at P:$a4..$25d as its reference. Three GND-SIN voices
at approximately 110, 440 and 1760 Hz feed both implementations. Eight successive sections exercise neutral
settings, AM depth, EQ frequency, upper cutoff, lower cutoff, resonance, rate reduction and drive. Each
section lasts approximately two seconds, with the tested control sweeping from 0 to 127. The test maps
these values to raw DSP controls by multiplying by 128; this is not a proof of CPU/front-panel conversion.
Previous cutoff values, normally supplied by surrounding firmware, are supplied at each block boundary.

Result: **22,048 blocks / 705,536 samples**, zero output differences and all **64 persisted state words**
matching after every block. Standalone native C++ and WebAssembly/Node replays also pass. All four processed
WAVs are byte-identical. Audio FNV-1a-64: `1749917dca7e1a93`; WAV SHA-256:
`5eba71132075faaf8dc5dd891ba24e26b4cd86973d911b6925d53944bcfa58b4`.
Both track corpora pass WASM undefined-behaviour sanitization. Truncated corpora and deliberately changed
expected samples are rejected by the native and WASM replay tools.

```sh
scripts/mdmm-dev.sh build mdNativeChainFirmwareTest
temp/dev/source/elektron/md/mdNative/mdNativeChainFirmwareTest \
  "$GEARMULATOR_MD_FIRMWARE_BIN" temp/md-native-research/proof
temp/md-native-research/native/mdNativeChainReplay \
  temp/md-native-research/proof/chain-corpus.bin temp/md-native-research/proof/chain-replay-native.wav
node temp/md-native-research/wasm/mdNativeChainReplay.js \
  temp/md-native-research/proof/chain-corpus.bin temp/md-native-research/proof/chain-wasm.wav
```

The firmware test writes `chain-input.wav` (dry), `chain-dsp.wav` (original instructions), `chain-native.wav`
(C++), the replay corpus, and `track-tables.bin`. All are private generated artifacts. Audio is raw 24-bit
44.1 kHz mono, with no normalization. Parameter changes and initialization can produce transients.

`mdNativeChainRender` renders four seconds with independently adjustable controls and fresh state. It reads
only the numeric tables, not firmware instructions or saved test states. Omit the nine controls for neutral
settings. Each supplied value must be an integer from 0 to 127, in this order:
**AMD AMF EQF EQG FLTF FLTW FLTQ SRR DRIVE**.

```sh
temp/md-native-research/native/mdNativeChainRender \
  temp/md-native-research/proof/track-tables.bin temp/md-native-research/proof/chain-filtered.wav \
  0 0 64 64 15 40 70 0 15
node temp/md-native-research/wasm/mdNativeChainRender.js \
  temp/md-native-research/proof/track-tables.bin temp/md-native-research/proof/chain-filtered-wasm.wav \
  0 0 64 64 15 40 70 0 15
```

## Remaining work

Recover TRX-BD and the original sample playback path with recorded comparisons. The remaining machine
families, CPU-side control conversion, modulation scheduling, recording, and expanded sampling remain
separate work. Replace or independently generate reference tables before calling the connected engine
ROM-independent. A modern floating-point chain also needs its own sound and performance comparison.

Later integration needs an audio backend, native state model, sample-timed sequencer, and typed capability
descriptors; the existing editor engine selector alone does not switch the audio renderer. See
[ARCHITECTURE.md](ARCHITECTURE.md). The native design can lift firmware limits while keeping the existing
ROM mode available. See [PIPELINE.md](PIPELINE.md) for the completed signal path, validation and performance
methodology. This is still an offline reference engine; browser AudioWorklet and plug-in integration are pending.
