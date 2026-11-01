# Vision: Machinedrum Editor + Monomachine Editor

Why this exists. How it is built is in [DESIGN.md](DESIGN.md).

## The idea

The Elektron Machinedrum and Monomachine are great instruments with a small screen and a lot of key combinations. We put the whole machine on one page: the step grid, the parameter-lock lanes, kits, patterns, songs, chains, mutes and the sampler. Under the page runs the machine's own firmware, so it sounds and behaves like the box.

Two editors, one foundation: Machinedrum Editor and Monomachine Editor. Standalone, VST3 and AU.

## Who it is for

People who own a Machinedrum or a Monomachine, or kept backups from one. They bring their own firmware. We never ship it and never say where to get it.

## What we promise

- Everything the manuals describe is on the page, as far as it can be done from outside the machine. What a mouse makes pointless, or what needs the hardware, is said plainly in the guide.
- More than the hardware gives: undo everywhere, every track on one grid, drawn lock lanes, MIDI Learn, SysEx import with a preview, host tempo follow, recording.
- Honest limits. Real hardware over MIDI is beta until it has run on a real machine of each kind. Windows and Linux builds exist, but only macOS is tested by a person.
- Free software (GPL-3). Not affiliated with Elektron.

## What we do not do

- No other synths. Everything else in the Gearmulator tree is gone.
- No merges from upstream. We own the whole stack, the emulator cores included, and copy single upstream fixes that help us.
- No auto-install of updates. The editor checks and tells you; you install.
- No change to the sound by default. A speed-up is bit-exact, or it is opt-in.

## Where it is going

1.0 is gated on stability and hardware MIDI, not on CPU levers. 0.9 is the full-feature release. Status and plan: [doc/ROADMAP.md](doc/ROADMAP.md), [doc/release/HANDOFF-0.9.md](doc/release/HANDOFF-0.9.md).

The grid and lock lanes also live on as a separate paid MIDI-out sequencer, `audio/xox-plocks`. It is kept equal by copying ideas, never by forking.
