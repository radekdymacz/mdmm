# 1. Introduction, philosophy, highlights
<!-- summary: What the Monomachine is, what the Monomachine Editor adds to it, and how this guide writes about controls. -->

The Monomachine is a six-track synthesizer and sequencer made by Elektron. Each of its six synth tracks plays one machine, a sound generator of its own kind, and runs it through its own filter, effects and three LFOs. A sequencer with 64 steps per pattern plays the six tracks and six more tracks of MIDI notes.

The Monomachine Editor puts the whole instrument on one web page. It runs the real Monomachine operating system, OS 1.32B, from a firmware image you supply. The page edits the machine and shows what the machine reports. The sound comes from the firmware, not from a copy of it.

The editor runs as a standalone application and as a VST3 or AU plug-in. It has two engines. The emulator runs the firmware on your computer. The HW MIDI engine edits a real Monomachine over MIDI with the same page.

## HIGHLIGHTS
<!-- rows: MM-002 MM-003 MM-004 MM-005 MM-006 MM-007 MM-008 MM-009 @f324d3 -->

The machine's main features, and where each one is in the editor:

- **Six synth tracks with a sequencer.** The **Sequence** and **Sound** workspaces edit the six tracks of a kit and their patterns.
- **Six MIDI tracks.** The switch in the track rail changes between the synth side and the MIDI side. The MIDI tracks have their own page of settings.
- **Machines.** Five synthesis families (SuperWave, SID, DigiPRO, FM+ and VO), the basic GND machines and the FX machines. The machine picker on the **Sound** workspace lists them by family.
- **FX machines.** Through, gate reverb, chorus, dynamics, ring modulator, phaser and flanger process audio from the inputs or from other tracks instead of making sound. Set their input in the **Mix** workspace and their parameters in the **Sound** workspace.
- **One delay per track.** It is tempo synchronised. Its controls are in the **Effects** groups of the **Sound** workspace.
- **Three LFOs per track.** They sit at the foot of the **Sound** workspace.
- **Twelve arpeggiators.** One for each synth track and each MIDI track. They are in the Sequence dock under **Arp**.
- **Real-time control.** Every value box on the page is live. A value you drag reaches the machine as a controller message at once.

![The Sound workspace](shot:mm-sound-workspace)

![The six MIDI tracks, each with its own roll](shot:mm-midi-roll)

## DIGIPRO USER WAVEFORMS
<!-- rows: MM-010 @a62218 -->

The DigiPRO machines of an MKII play 64 waveforms, and the MKII lets you load your own. The editor picks a waveform from 1 to 64 in the wave fields of the DigiPRO machines. **Export SysEx…** saves the user waveforms in a .syx file: see "DIGIPRO MANAGER" in chapter 19. {gap:MM-010}You cannot send waveforms to the machine, rename or erase them in the editor.{/gap}

The **MKII** key in the top bar switches the editor between the MKI and MKII plate. The MKII adds the user waveforms and the DigiPRO double draw and ensemble machines. On the MKI plate the machine picker greys those two machines out and says "MKII only".

## CONVENTIONS
<!-- rows: MM-001 MM-011 @2bf900 -->

This guide writes controls in a fixed way.

- **Bold** names a control on the page: **Mix**, **Effects**.
- [SPACE] and [⌘] name a key of your computer. [⌘] is [CTRL] on Windows and Linux.
- <PLAY> names a field or light on the LCD at the top of the page.
- The manual's names for the machine's own keys, such as [FUNCTION] and [TRIG], appear where the editor does it differently, with the editor's way beside them.

NOTE: The Monomachine has a +Drive option for storing snapshots, digibanks and waveforms. The editor does not emulate it.

![The Monomachine Editor](shot:mm-overview)
