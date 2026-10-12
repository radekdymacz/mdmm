# 14. Appendix A: machine reference
<!-- summary: Every machine the Machinedrum can load into a track, by family, and where the editor shows it. -->

A machine is the sound engine of one track. The Machinedrum holds 16 tracks and each one carries one machine at a time. This chapter lists the machines by family, as the machine's own appendix does.

In the editor you choose a machine on the **Sound** workspace. Pick a track on the rail, click the machine key, choose a family, then choose a machine in it. The track takes the machine and the Sound page shows its knobs. {key:undo} takes the choice back. A machine has up to eight knobs, as on the LCD, and the Sound page shows each one in a group with its value box.

NOTE: The kit holds the machine of every track, so a machine is saved and loaded with the kit.

## TRX MACHINES
<!-- rows: MD-211 MD-212 MD-213 MD-214 MD-215 MD-216 MD-217 MD-218 MD-219 MD-220 MD-221 MD-222 MD-223 @4feb08 -->

The TRX family models classic analogue drum voices. Each machine is one drum sound. The Sound workspace shows its knobs in groups, each knob with its own value box. Pitch, decay and ramp sit in the first groups, and tone and clip in the last.

![TRX-BD on the Sound workspace, its knobs in groups with a box under each.](shot:md-sound-groups)

| Machine | Sound |
|---|---|
| TRX-BD | Bass drum |
| TRX-B2 | Bass drum 2 |
| TRX-SD | Snare |
| TRX-XT | Tom |
| TRX-CP | Clap |
| TRX-RS | Rim shot |
| TRX-CB | Cow bell |
| TRX-CH | Closed hi-hat |
| TRX-OH | Open hi-hat |
| TRX-CY | Cymbal |
| TRX-MA | Maracas |
| TRX-CL | Claves |
| TRX-XC | Congas |

## EFM MACHINES
<!-- rows: MD-224 MD-225 MD-226 MD-227 MD-228 MD-229 MD-230 MD-231 @4bf385 -->

The EFM family makes drum sounds by frequency modulation. The knobs sit in groups on the Sound workspace.

| Machine | Sound |
|---|---|
| EFM-BD | Bass drum |
| EFM-SD | Snare |
| EFM-XT | Tom |
| EFM-CP | Clap |
| EFM-RS | Rim shot |
| EFM-CB | Cow bell |
| EFM-HH | Hi-hat |
| EFM-CY | Cymbal |

## E12 MACHINES
<!-- rows: MD-232 MD-233 MD-234 MD-235 MD-236 MD-237 MD-238 MD-239 MD-240 MD-241 MD-242 MD-243 MD-244 MD-245 MD-246 MD-247 @42f945 -->

The E12 family is a set of drums and percussion that follow the sound of a 12 bit sampler. The knobs sit in groups on the Sound workspace.

![E12-SD on the Sound workspace with its pitch, envelope, tone and retrig groups.](shot:md-machine-e12)

| Machine | Sound |
|---|---|
| E12-BD | Bass drum |
| E12-SD | Snare |
| E12-HT | High tom |
| E12-LT | Low tom |
| E12-CP | Clap |
| E12-RS | Rim shot |
| E12-CB | Cow bell |
| E12-CH | Closed hi-hat |
| E12-OH | Open hi-hat |
| E12-RC | Ride |
| E12-CC | Crash |
| E12-BR | Brushed snare |
| E12-TA | Tambourine |
| E12-TR | Triangle |
| E12-SH | Shaker |
| E12-BC | Bongo conga |

## P-I MACHINES
<!-- rows: MD-248 MD-249 MD-250 MD-251 MD-252 MD-253 MD-254 MD-255 MD-256 @f44dbe -->

The P-I family is a set of percussion and instrument voices of its own. The knobs sit in groups on the Sound workspace.

| Machine | Sound |
|---|---|
| P-I-BD | Bass drum |
| P-I-SD | Snare |
| P-I-MT | Tom (PI-XT) |
| P-I-ML | Metallica |
| P-I-MA | Maracas |
| P-I-RS | Rim shot |
| P-I-HH | Hi-hat |
| P-I-RC | Ride |
| P-I-CC | Crash |

## GND MACHINES
<!-- rows: MD-257 MD-258 MD-259 MD-260 @a84ac2 -->

The GND family holds plain sources: a sine, noise, an impulse, and an empty machine that makes no sound. The empty machine is in the machine picker.

| Machine | Sound |
|---|---|
| GND-SIN | Sinus |
| GND-NS | Noise |
| GND-IM | Impulse |
| GND-EMPTY | Empty machine |

## INP MACHINES
<!-- rows: MD-261 MD-262 MD-263 @c362f3 -->

The INP family does not make a sound of its own. It reacts to the audio that enters the machine at input A or B. A gate opens when the input is loud enough, a filter follower and an envelope follower turn the input level into a moving sound.

| Machine | Sound |
|---|---|
| INP-GA/GB | Input gate A/B |
| INP-FA/FB | Input filter follower A/B |
| INP-EA/EB | Input envelope A/B |

## MID MACHINES
<!-- rows: MD-264 @146410 -->

The MID family turns a track into a MIDI controller, one machine for each of the 16 MIDI channels. The Sound workspace shows its knobs as plain knob boxes, with no picture. The routing and effects pages show as groups.

## CTR MACHINES
<!-- rows: MD-265 MD-266 MD-267 MD-268 MD-269 MD-270 @c4a503 -->

The CTR family does not play a sound. It moves the parameters of other tracks or of a master effect. **Control all** and **Control 8 parameters** move parameters of the other tracks, and their knobs show as plain knob boxes. The other four, Rhythm Echo, Gate Box, Master EQ and Dynamix, move the knobs of that master effect, and their groups show on the Sound workspace.

![CTR-RE on the Sound workspace, with the delay, modulation, filter and output groups of the Rhythm Echo.](shot:md-machine-ctr)

| Machine | Sound |
|---|---|
| CTR-AL | Control all |
| CTR-8P | Control 8 parameters |
| CTR-RE | Control Rhythm Echo |
| CTR-GB | Control Gate Box |
| CTR-EQ | Control Master EQ |
| CTR-DX | Control Dynamix |

## ROM MACHINES
<!-- rows: MD-271 MD-272 @8cb50c -->

The ROM machines play the samples held in the machine's own memory. The first 24 play a sample as a one shot, and the second 24 play a sample as a loop, with a linear start and end. The Sound workspace shows a sample screen with <STRT> and <END>, and the **Sampler** workspace shows the slots as tiles.

![ROM-01 on the Sound workspace, with the sample screen and the <STRT> and <END> knobs.](shot:md-machine-rom)

| Machine | Sound |
|---|---|
| ROM-1 to ROM-24 | ROM sample player |
| ROM-25 to ROM-48 | ROM loop player (linear STRT, END) |

## RAM MACHINES
<!-- rows: MD-273 MD-274 @60f1fd -->

The RAM machines play and record samples in the four RAM slots of the machine.

- **RAM-R1 to R4** record. A recorder writes audio from an input or from the main mix to a RAM slot. You set one up on the **Sampler** workspace, or on the Sound workspace.
- **RAM-P1 to P4** play the sample that is in the slot. The Sound workspace shows a sample screen with <STRT> and <END>, and the **Sampler** workspace shows the slot as a tile.



## RAM MACHINES TUTORIAL
<!-- rows: MD-275 @06d975 -->

To record the main output and play it back in a track:

1. Click the **Sampler** tab.
2. Click an unused RAM slot.
3. Click **Set up sampling**. The editor makes a recorder of the main mix in one track, takes that track out of the mix (its <VOL> is 0), and adds a player.
4. Click **Input A** to record from input A instead. The recorder's <VOL> comes back. Click **Main mix** and it is 0 again.
5. Click an empty step of the RAM view to put a recorder trig there. Click **Freeze** to mute the recorder on the machine. Click **Live** and it records again.

Press {key:undo} three times to put everything as it was before the set up.
