# 7. Track effects
<!-- summary: The amp, filter, equaliser, sample rate reducer and delay that every track has after its machine. -->

The sound of a machine passes through the same chain on every track: amp, filter, equaliser, sample rate reduction and delay. The chain is the same for every machine, so these parameters mean the same on every track. All of them are on the **Sound** workspace, in the groups under the machine's own. Select the track, press {key:workspace-2} and drag the values.

![The amp, filter and effects groups](shot:mm-sound-effects)

A value box changes when you drag it, turn the wheel over it or press an arrow key on it. Double-click it for its default. Where a group has a picture, drag the dots in the picture to change the values they stand for.

## LEVEL
<!-- rows: MM-113 @9eb3b1 -->

LEVEL is the track's mix level, at the end of its path. It is the **LEVEL** fader of the track's strip in the **Mix** workspace. It can neither be locked on a step nor moved by an LFO. To balance tracks against each other use LEVEL. For movement inside the sound use VOL.

## AMP ENVELOPE
<!-- rows: MM-114 MM-115 MM-116 MM-117 @48b3e6 -->

The **Envelope** group of the amp page holds four values.

| Value | What it sets |
|---|---|
| ATK | the attack: how long the level takes to rise after a trig |
| HOLD | how long the level stays up, before the decay starts |
| DEC | the decay: how long the level takes to fall |
| REL | the release: how long it falls after a NOTE OFF |

ATK, DEC and REL are times. Each 8 more about doubles the time. ATK 64 reaches 90 percent of the level in about 0.14 seconds, and DEC 64 falls 20 dB in about 0.55 seconds. DEC 127 holds the level until the NOTE OFF, and REL 127 never fades. HOLD counts in steps of the pattern: HOLD 8 is one step, so it follows the tempo.

The picture shows the shape as the machine plays it, with the release dashed. Drag its dots to set the values.

TIP: The **Trig setup** plate in the **Sequence** workspace draws the same envelope together with the portamento, and shows how long a gate really sounds in steps at the current tempo.

## DISTORTION
<!-- rows: MM-118 @6f9b6d -->

DIST is in the **Drive** group of the amp page. Drag the dot in its picture up or down, or use the value box. Above 0 it overloads the sound. Below 0 it adds headroom: the sound is quieter and cleaner.

## TRACK VOLUME
<!-- rows: MM-119 @0c05c0 -->

VOL is the volume of the voice. It is in the **Level · pan** group of the amp page, and it is the trim at the top of each strip in the **Mix** workspace, as AMP VOL. VOL comes before LEVEL in the path. Unlike LEVEL you can lock it on a step and an LFO can move it.

## PAN
<!-- rows: MM-120 @9ce5d3 -->

PAN places the track in the stereo field, from L64 to R63. It is in the **Level · pan** group and in each strip of the **Mix** workspace.

1. Click the **Mix** tab, or press {key:workspace-3}.
2. Drag the **PAN** bar of a strip sideways. The box at its right reads, for example, L28 or R28, and a red bar shows how far the track lies from the centre.
3. Double-click the bar for the centre.
4. Press {key:undo} to put the pan back where it was.

![The PAN bars of the strips in the Mix workspace](shot:e2e-mm-mix-pan-undo)

## PORTAMENTO
<!-- rows: MM-121 @3f9482 -->

PORT sets how long the pitch glides from the note before to the next note. It is in the **Glide** group of the amp page and in the **Trig setup** plate of the **Sequence** workspace. In the plate, **Port** chooses when it glides: **ALWAYS** glides to every note, and **LEGATO** glides only between notes that overlap.

## FILTER
<!-- rows: MM-122 MM-123 MM-124 MM-125 @d80294 -->

The filter of each track is a 24 dB filter built from a high-pass and a low-pass. The **Filter** group of the filter page holds four values:

| Value | What it sets |
|---|---|
| BASE | the cutoff of the high-pass |
| WDTH | the gap from the high-pass up to the low-pass |
| HPQ | the resonance of the high-pass |
| LPQ | the resonance of the low-pass |

In the picture, drag the dots sideways for BASE and WDTH and up for HPQ and LPQ. A dashed line shows where the filter envelope takes the filter.

## FILTER ENVELOPE
<!-- rows: MM-126 MM-127 @185dc1 -->

The **Filter env** group holds ATK and DEC, the attack and decay times of the filter envelope, and BOFS and WOFS, how far the envelope moves BASE and WDTH.

## FILTER TRACKING
<!-- rows: MM-128 @caaf38 -->

Both filters follow the pitch of the notes. With tracking off a filter stays where BASE and WDTH put it, whatever note plays: under a low LPF the high notes go quiet, and a high HPF lets them through.

The title of the **Filter** group shows the state: **KEY** with a lamp for HPF and one for LPF, lit while that filter follows the notes. The label of the filter's screen says which filter is fixed. The switches are on the **Perform** workspace, in the **Assign** card.

1. Click **KEY** in the title of the **Filter** group. The **Perform** workspace opens on the **KEY** tab of the **Assign** card, for the same track.
2. Click **HPF tracks keys** or **LPF tracks keys**. A lit key means the filter follows the keys. Click it and the key goes dark: that filter stops following the notes, and the **KEY** title of the **Filter** group on **Sound** shows it off.
3. Press {key:undo} to switch it on again.

![Key tracking in the Filter group](shot:mm-sound-key-tracking)

## EQ
<!-- rows: MM-129 @28f508 -->

The **EQ** group holds EQF, the frequency of the equaliser band, and EQG, its gain. A negative EQG cuts the band and a positive one boosts it.

## SAMPLE RATE REDUCTION
<!-- rows: MM-130 @463561 -->

SRR, in its own group, reduces the sample rate of the track for a lo-fi sound. Drag its dot, or the value box.

## DELAY
<!-- rows: MM-131 MM-132 MM-133 MM-134 @a99e04 -->

Each track has its own delay, synchronised to the tempo. The **Delay** group holds three values and the **Delay filter** group two.

| Value | What it sets |
|---|---|
| DSND | the send into the delay. A negative value keeps the stereo image, a positive value is ping-pong, 0 is no delay |
| DTIM | the delay time, in 256th notes |
| DFB | the feedback. The editor warns above 64 |
| DBAS | the base of the filter in the feedback path |
| DWID | the width of that filter |

DSND is also in the trim row at the top of each strip in the **Mix** workspace, with VOL and DIST.
