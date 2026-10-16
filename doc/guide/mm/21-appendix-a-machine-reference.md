# 21. Appendix A: machine reference
<!-- summary: Every machine you can put on a track, with the knobs of its synthesis page. -->

This appendix lists the machines of the Monomachine and the knobs each one gives the SYN page. You choose a machine in the machine picker of the **Kit** workspace (chapter 6, "ASSIGNING A MACHINE"); the picker shows the same names, in families, and the pointer over a machine names its eight knobs. Every machine also has the AMP, FLT, EFX and the three LFO pages, which are the same for all of them. Two of the machines exist only on the MKII.

![The machine picker](shot:mm-machine-picker)

## SWAVE-SAW
<!-- rows: MM-324 @57ebeb -->

Eight saw oscillators. <UNIL>, <UNIW> and <UNIX> set the unison, <SUBX>, <SUB1> and <SUB2> the sub oscillators and <TUNE> the pitch.

## SWAVE-PULSE
<!-- rows: MM-325 @dee8f1 -->

Pulse oscillators with unison and sub oscillators. <PW> sets the pulse width, <PWAD> and <PWRS> move it over time.

## SWAVE-ENS
<!-- rows: MM-326 @c14476 -->

An ensemble of oscillators. <PCH2> to <PCH4> pitch the extra voices: OFF, -12 to +12 semitones, or an interval (2/3, 3/4, 4/5, 5/6 below, 6/5, 5/4, 4/3, 3/2 above), <WAVE> picks the wave and <CHRL> and <CHRW> set the chorus.

## SID 6581
<!-- rows: MM-327 @d112c8 -->

A model of the SID chip. <WAVE> picks the wave, <MOD> the modulation, <MSRC> and <MFRQ> its source and rate.

## DPRO-WAVE
<!-- rows: MM-328 @b1c10a -->

A wave player on the DigiPRO. <WAVE> picks one of the 32 waves, S01 to S32, <WP> shapes it, <SYNC> and <SFRQ> set oscillator sync.

## DPRO-BBOX
<!-- rows: MM-329 @f771a5 -->

The beat box, a set of 24 drum sounds played by key. <PTCH> sets the pitch, <STRT> the start point, <RTRG> and <RTIM> the retrigger.

## DPRO-DDRW
<!-- rows: MM-330 @d89211 -->

A machine built on two waves. <WAV1> and <WAV2> pick them from the 64 waves, D01 to D64, <MIX> blends them and <TIME>, <BR1>, <WID> and <BR2> shape the draw between them.

## DPRO-DENS
<!-- rows: MM-331 @974c1f -->

A stack of voices from one wave. <WAVE> picks it, D01 to D64. <PCH2> to <PCH4> pitch the extra voices as on SWAVE-ENS and <CHRL> and <CHRW> set the chorus.

## FM+STAT
<!-- rows: MM-332 @2bf663 -->

A static FM machine. <1FRQ>, <1FIN>, <1ENV> and <1FB> set the first operator, <2FRQ> and <2VOL> the second, <TONE> the tone. <1FRQ> and <2FRQ> step through 24 frequencies, from 1/64 to 4 times the note.

## FM+PAR
<!-- rows: MM-333 @3f3937 -->

A parallel FM machine. Three operators have a frequency and an envelope each, <TONE> sets the tone. <1FRQ>, <2FRQ> and <3FRQ> step through the same 24 frequencies as FM+STAT, 1/64 to 4.

## FM+DYN
<!-- rows: MM-334 @3d871f -->

A dynamic FM machine. The first operator has frequency, frequency envelope, volume and volume envelope, the second frequency, envelope and feedback. <1FRQ> and <2FRQ> change in fine steps and show the frequency as the machine writes it, a fraction or a number.

## VO-6
<!-- rows: MM-335 @a1c1e4 -->

A speech machine. <VOC1> and <VOC2> pick the vowels, <CONS> the consonant, <CLEN> its length and <CVOL> its volume.

## VO-6 TUTORIAL
<!-- rows: MM-336 @dd472c -->

VO-6 says a word when you lock its vowel and consonant on each note.

1. Click the **Kit** tab and select track 3 on the rail.
2. Click the machine name and choose VO-6.
3. Click the **Pattern** tab and select track 3 on the rail again.
4. Switch the piano roll's **Draw** on.
5. Click five notes into the roll.

![The lock lane](shot:mm-lock-lane)

6. In the lock lane open the SYN page. Lock <CONS> on each note with the wheel, using M, N, M, SJ, N in that order.
7. Lock <VOC1> on each note with a drawn bar.

The roll names the consonant of each note. Play the pattern to hear the word.

## GND-GND
<!-- rows: MM-337 @3cc6ab -->

Silence. The machine makes no sound.

## GND-SIN
<!-- rows: MM-338 @c1b24f -->

A sine wave with <TUNE>. It is the machine of an empty track (chapter 6, "CLEAR MACHINE").

## GND-NOIS
<!-- rows: MM-339 @ad3554 -->

Noise. <ST>, <RED> and <STON> shape it and <TUNE> sets the pitch.

## FX-THRU
<!-- rows: MM-340 @6dd935 -->

A machine that passes its input through. <INP> picks the input.

## FX-REVERB
<!-- rows: MM-341 @8e6949 -->

A reverb. <DEC>, <DAMP> and <GATE> shape the tail, <MIX> blends it, <HP> and <LP> filter it, <INP> picks the input.

## FX-CHORUS
<!-- rows: MM-342 @6b4d29 -->

A chorus. <DEL>, <DEP> and <SPD> set delay, depth and speed, <FB> the feedback, <WID> the width, <LP> a filter, <MIX> the blend, <INP> the input.

## FX-DYNAMIX
<!-- rows: MM-343 @fefe7d -->

A compressor. <ATK> and <REL> set the times, <THRS> the threshold, <RAT> the ratio, <GAIN> the make-up gain, <RMS> the detector, <MIX> the blend, <INP> the input.

## FX-RINGMOD
<!-- rows: MM-344 @f0ab3d -->

A ring modulator. <WAVE> picks the wave, <EXT> the external input as the modulator, <MIX> the blend, <INP> the input.

## FX-PHASER
<!-- rows: MM-345 @e6bcc5 -->

A phaser. <CNTR> sets its centre, <DEP> and <SPD> the depth and speed, <FB> the feedback, <WID> the width, <MIX> the blend.

## FX-FLANGER
<!-- rows: MM-346 @46b2da -->

A flanger. <DEL>, <DEP> and <SPD> set delay, depth and speed, <FB> the feedback, <WID> the width, <MIX> the blend, <INP> the input.

NOTE: An FX machine needs audio at its input. Chapter 6 says what the editor sets when you assign one.
