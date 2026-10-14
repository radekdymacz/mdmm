# Native audio engine: agreed direction

Research branch: `codex/native-audio-engine`. This is separate engine work. Do not register an engine in
either editor or change the production audio path as part of this proof.

## Purpose

Build an expandable groovebox audio engine that can later use the MD/MM editors' sequencing and performance
controls. Study the original firmware to recover how its machines, filters, envelopes, gain and effects work.
Use those findings as a reference for native C++ implementations that also compile to WebAssembly.

The product target is **inspired and enhanced**, not exact hardware emulation. Exact reference kernels and
test corpora establish what the original does; modern implementations may deliberately change arithmetic,
quality, memory limits, modulation and routing. Measure and describe each change. Do not substitute an
unrelated generic synthesizer and call it a reverse-engineered machine.

## Independent choices

Sound generation and processing chains should be independently selectable:

```
sound machine -> ordered insert processors -> amplitude / pan -> output buses
                        |                              |
                        +---------- FX sends ----------+-> return chains -> master
```

The first reference is MD. Later original implementations may take ideas from MM, Digitakt, Digitone,
Nord Drum and other instruments. Their firmware compatibility is not implied. A sample voice should be able
to use a different filter or FX chain from a synthesized voice. Adding a machine should not require another
sequencer or editor. Arbitrary feedback needs explicit delay and gain handling; it is not implicit in the graph.

## Sampling

Preserve the useful MD record/play workflow and parameter control, while allowing longer recordings and
larger sample memory than the original machine. Native memory budgets should be explicit and configurable,
with allocation and loading outside the audio callback. Stereo, slicing, pitch modes, stretching and granular
playback are separate capabilities to implement and measure. Do not promise that they are already present.

## Proof before integration

1. Recover and validate a complete voice and its shared track processing, including control curves and state.
2. Recover sample playback/recording behavior and implement a native sample engine with an expandable memory model.
3. Add a modern floating-point version and compare sound, timing and CPU cost against the reference.
4. Establish a portable render/event interface, configurable chains, real-time tests and a browser AudioWorklet.
5. Only then integrate an explicitly selected native engine into the editors, including persistence and automation.

The native engine ultimately owns its audio output. Mixing finished ROM-engine and native-engine outputs
would be a distinct later feature requiring latency alignment and both engines' CPU cost. Injecting native
voices into firmware internals is not part of this work.

## Current evidence

See [README.md](README.md) for completed tests and limits. GND-SIN has exact and floating-point versions.
The connected AM, EQ, upper/lower filters, rate reduction and drive/DC-removal chain matches the original
DSP instructions across 705,536 samples and all persisted state, including changing controls. The larger
16-voice path now includes final track level/pan, stereo sends, delay, reverb, master EQ and compression,
with 1,058,304 channel samples matching the original instructions. It renders in standalone C++ and
WebAssembly, using private ROM-derived numeric tables. The sampler, other voice families, remaining control
logic and configurable FX graph are still pending. No complete instrument or editor integration is claimed yet.
