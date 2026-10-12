# 2. User interface and connectors
<!-- summary: The Monomachine's panel, keyboard and sockets, and where each control is on the editor's page. -->

The Monomachine has a front panel of keys and knobs, an LCD, a keyboard on the SFX-6 and a row of sockets at the back. The editor has none of these as pictures. Its page holds the same functions as controls of its own, and this chapter names, for each part of the machine, the control that does its job.

The page has a top bar and a body. The top bar holds the five workspace tabs, the LCD with its two lines, and the setup keys **Undo**, **Redo**, **Global** and **MKII**. The body shows the track rail on the left and the workspace on the right.

![The Monomachine Editor](shot:mm-page-overview)

The workspaces are **Sequence**, **Sound**, **Mix**, **Perform** and **Song**. Press {key:workspace-1} to {key:workspace-5} to go to one. A sixth workspace, **Control**, appears only when the plug-in has MIDI mapping on, and it is pressed with {key:workspace-6}.

## MASTER VOLUME AND LCD
<!-- rows: MM-012 MM-013 @428894 -->

The machine has one master volume knob. The editor has none: the application or the host sets the output level.

The LCD of the machine is the **LCD** in the top bar. It holds the fields <TEMPO>, <POSITION>, <PATTERN>, <KIT> and <LOCKS>, the record and play keys, and a second line of fields that changes with the workspace. Chapter 3 describes it.

{gap:MM-013}The machine's own screen is not shown after start-up. What it would show is spread over the page.{/gap}

## LEVEL AND DATA ENTRY
<!-- rows: MM-014 MM-015 MM-016 @8c8e55 -->

On the machine the LEVEL knob sets the level of the selected track and the eight DATA ENTRY knobs set the parameters of the page shown. In the editor every parameter is a value box.

- LEVEL is the **LEVEL** fader of each track in the **Mix** workspace.
- A value box changes when you drag it up or down, or sideways. Each pixel of drag is one step.
- Turn the mouse wheel over a value box to step it, one step a notch.
- Click a value box and press the arrow keys to step it ({key:value-up-down}).
- Double-click a value box to set it to its default.
- Hold [⌘] and click a value box to type its value, or press [ENTER] on a value box that has the focus. Type the value and press [ENTER], or press [ESC] to leave it as it was. A box that shows names takes a name, for example SAW for an LFO's wave, in small or capital letters. **PAN** takes L12, C or R5. A value the box cannot show is refused, and the field says what it takes. Each typed value is one undo step.

The machine's accelerated edit, where you press a knob and turn it for larger steps, is a different gesture here. Hold [⇧] while you drag for fine steps, a quarter as fast. Hold [⇧] while you turn the wheel, or press Page Up or Page Down on a focused value, to step by ten.

## DATA PAGE
<!-- rows: MM-017 MM-018 @317d98 -->

The machine has seven DATA pages for each track: SYN, AMP, FLT, EFX, LF1, LF2 and LF3. It shows one at a time on its eight knobs. The **Sound** workspace shows every page of the selected track at once, in groups of a few values. The **Sequence** workspace has the page tabs SYN, AMP, FLT, EFX, LF1, LF2 and LF3 in the track rail. They choose the parameters the lock lane edits.

Pressing both DATA PAGE keys on the machine opens the multi envelope. In the editor the multi envelope is the first card of the **Perform** workspace. What it shapes depends on the multi trig mode of the kit, which the card names: see chapter 9.

## TRACK KEYS
<!-- rows: MM-019 MM-020 MM-021 @6c403a -->

The six TRACK keys select the track you edit.

- Click a track in the rail at the left of the page.
- Press {key:track-prev-next} to select the track before or after.
- In the **Mix** workspace, click the track's node in the routing graph.

To mute a track, click **M** in its rail row or press {key:mute-track}. Click **S** to solo it. Drag across several **M** keys to mute or unmute each track you cross as the first one became.

To prepare mutes, hold [⇧] and click **M** on the tracks. Each track shows + or X for the change it will make. The changes apply when you let go of [⇧]. This is the machine's mute window.

- {key:mute-all} mutes every track. When none is audible it unmutes every track.
- {key:unmute-all} unmutes and unsolos every track. The **M/S off** key at the head of the rail does the same.
- The **Mutes** card of the **Perform** workspace lists all twelve tracks, T1 to T6 and M1 to M6.

A muted track dims in the rail. The selected track is lit.

NOTE: Mutes act on notes. A sound that already plays rings out.

## TEMPO KEY
<!-- rows: MM-022 MM-023 @3b98f8 -->

The <TEMPO> field of the LCD is the tempo window of the machine. Drag it up or down: a pixel is half a beat per minute, and [⇧] makes it a tenth. With the field focused, the arrow keys step it.

To tap a tempo, press {key:tap-tempo-shift}. The editor uses the average of your last taps. On every workspace except **Sequence** a plain {key:tap-tempo} taps too. On **Sequence** that key switches the piano roll's Draw mode.

NOTE: In a DAW the host sets the tempo. The field is marked and refuses an edit, with a note that says to change it in the DAW. **Tempo in** INT in GLOBAL gives the machine its own clock (chapter 12).

## FUNCTION KEY
<!-- rows: MM-024 @8df7bf -->

The machine's [FUNCTION] key gives the other keys a second job. The editor has no such key. The second jobs are separate controls on the page, or they follow a modifier key of your computer. Hold [⌥] and the keys it changes say what they do then: <CLR> becomes the clear of the whole pattern, for example.

## KIT AND SONG KEYS
<!-- rows: MM-025 MM-026 @d2a720 -->

On the machine [KIT] opens the kit menu. In the editor click the <KIT> field of the LCD to open the kit library. Chapter 6 describes it. The **Song** workspace ({key:workspace-5}) is the song menu: see chapter 17.

[FUNCTION] + [KIT] opens the global menu. In the editor open it in one of three ways:

- click **Global** in the top bar;
- choose **GLOBAL…** in the engine menu, the drop-down at the left of the LCD;
- press the GLOBAL link in the **AUDIO / MIDI** panel.

The GLOBAL page opens over the workspace. It holds the eight global slots and the Control, Sync, Routing, Audio and Control out 1 settings, the master tune among them. {key:close-global} goes back to the workspace. Chapter 19 describes it.

## TRIG KEYS
<!-- rows: MM-027 MM-028 MM-029 MM-030 @beca1b -->

The sixteen TRIG keys play notes and set trigs. In the editor:

- The keys {key:piano-white} play the selected synth track, from any workspace. They are the white keys C to D. {key:piano-black} are the black keys above them.
- Press {key:octave-down} or {key:octave-up} to move the octave down or up, from −3 to +3. Press {key:velocity-down} or {key:velocity-up} to step the velocity through 20, 40, 60, 80, 100 and 127.
- The on-screen keyboard in the **Perform** workspace plays notes by click or drag.
- Clicking in the piano roll of the **Sequence** workspace plays the pitch.

To set a trig on a step, as the TRIG keys do in grid mode, click the piano roll with Draw on, or open the step menu (the ⋯ on a selected step, or a right-click).

On the machine, [BANK] + [TRIG] picks a pattern. In the editor click the <PATTERN> field of the LCD for the pattern chooser, or the **‹** and **›** keys beside it. Chapter 4 describes picking.

## PATTERN AND SONG KEY
<!-- rows: MM-031 MM-032 @b3739c -->

[PATTERN/SONG] switches between playing a pattern and playing a song. Click <PLAY> in the second line of the LCD. It reads PAT or SONG, what the machine reports, and each click switches. The **Song** workspace has the same switch.

[FUNCTION] + [PATTERN/SONG] switches POLY mode. In the editor the **Perform** workspace has a **Poly** key in the **Keyboard** card. Poly mode plays the track selected on the machine with [TRACK]; the editor presses that key for the track you select. Chapter 5 describes poly mode.

## ENTER, EXIT AND ARROW KEYS
<!-- rows: MM-033 MM-034 @35f8b7 -->

The machine's [ENTER/YES] and [EXIT/NO] confirm and cancel. The editor asks in dialogs on the page: answer with the dialog's buttons, and close one with {key:close-dialog}.

The arrow keys of the machine move the cursor and set the octave of the TRIG keys. In the editor {key:value-left-right} and {key:value-up-down} step a focused value, and {key:octave-down} and {key:octave-up} set the octave of the note keys.

## BANK KEYS
<!-- rows: MM-035 MM-036 MM-037 MM-038 @97b554 -->

The machine's BANK GROUP and BANK keys choose the pattern bank. The pattern chooser shows all eight banks A to H at once. Press {key:lib-bank} inside it to jump to a bank.

[FUNCTION] + [BANK GROUP] opens the mute window: it is the **Mutes** card in **Perform**, and the prepared mutes described above.

The keys that open the secondary windows, ARP, TRANSPOSE, SWING and SLIDE, are as follows.

- **Arp** and **Transpose** are tabs of the dock in the **Sequence** workspace. The **Sound** workspace has keys that go to them.
- Swing is **Swing** in the step menu of the **Sequence** workspace, and the <SWG> field of the LCD's second line.
- Slide is **Slide** in the step menu of the **Sequence** workspace.

## RECORD, PLAY AND STOP
<!-- rows: MM-039 MM-040 MM-041 MM-042 MM-043 MM-044 @f9d2fa -->

The record and play keys are at the top right of the LCD.

- Press {key:play-stop} or click the play key. The machine plays. Press it again to stop.
- Click the record key while the machine is stopped to switch grid recording on. Editing steps on the page does not need it.
- Press {key:record} to start live recording, the machine's [REC] + [PLAY]. Press it again to stop recording.

Grid recording is not needed to edit steps with the mouse. Hold [⇧] and click the record key while the machine is stopped to start step recording, the machine's [STOP] + [REC]. The key shows STEP. See "Step recording" in chapter 11.

On the machine a second press of [PLAY] pauses. In the editor:

1. Hold [⇧] and click the play key, or press {key:pause}. The machine holds its step. The play key blinks and <POSITION> keeps the step.
2. Click the play key, or press {key:pause} again. The machine goes on from the step it held.
3. To end the pause instead, choose **Stop** in the transport menu. <POSITION> reads --.--.

The transport menu has Play or Stop, Pause or Continue, Live record and Panic, each with its key. Right-click the play key to open it, or click the small ▾ in the key's corner.

On the machine a double press of [STOP] rewinds the pattern and silences the notes. In the editor this is **Panic**: press {key:panic}, or choose **Panic** in the transport menu. The editor sends All Notes Off on the channel of each track and stops the machine. The notes fade out with their release.

NOTE: Over a MIDI cable the pause is MIDI Stop and Continue, which the Monomachine takes only with <TRANSPORT> set to ACCEPT (GLOBAL, CONTROL IN). The editor asks to set it the first time.

COPY, CLEAR and PASTE are the three keys under the LCD, <COPY>, <CLR> and <PASTE>, with {key:copy}, {key:delete} and {key:paste}. What they act on depends on the workspace:

| Workspace | They act on |
|---|---|
| **Sequence** | the selected steps, or else the page of steps shown |
| **Sound** | the machine of the selected synth track, with all seven DATA pages |
| **Perform** | the assign tabs of the selected track |
| **Song** | the selected song row |

{key:clear-pattern} on **Sequence** clears the whole pattern. Clicking <CLR> with [⌥] held does the same.

## SCALE KEY
<!-- rows: MM-045 MM-046 @e1f087 -->

The machine's [SCALE] key shows one page of 16 steps. In the editor press **Page** in the **Sequence** workspace, or press the square bracket keys, to step through the pages. Four lights show the pages the pattern has and which one is shown.

[FUNCTION] + [SCALE] opens the scale set-up. In the editor its fields are in the LCD's second line on **Sequence**: <LEN> sets the pattern length and <SPD> the speed. Click a field to step it. Chapter 11 describes both.

## TRIG SELECT KEY
<!-- rows: MM-047 MM-048 @565969 -->

On the machine [TRIG SELECT] chooses which trig track the TRIG keys edit: AMP, FILTER, LFO or ALL. In the editor you choose the envelopes of a trig in the step menu of the **Sequence** workspace: **Envelopes**, then **Amp**, **Filter** or **LFO**. On a selection it sets every trig in it. A note that fires only some envelopes shows their letters on its bar. A trig that fires none is trigless.

[FUNCTION] + [TRIG SELECT] edits the MIDI tracks. In the editor use the **Synth** and **MIDI** keys in the track rail, or the <SEQ> field in the LCD, to change between the six synth tracks and the six MIDI tracks.

## THE KEYBOARD (SFX-6)
<!-- rows: MM-049 MM-050 MM-051 MM-052 MM-053 MM-054 @6dfed2 -->

The SFX-6 has a keyboard and a joystick. The editor has the same functions on the **Perform** workspace.

- The **Keyboard** card plays notes. It has four modes: **Auto track**, **Multi trig**, **Multi map** and **Poly**.
- The **Assign** card has a joystick pad. Drag the stick. It springs back when you let go. On the machine's tabletop models the pad sends pitch bend, CC 1 and CC 2.
- **Multi trig** and **Multi map** are keys of the card.
- The **Octave** stepper moves the on-screen keyboard.

The computer keys play notes too: {key:piano-white} and {key:piano-black}. A key of the on-screen keyboard is lit while you hold it: with the mouse, with the computer keys, or on a MIDI keyboard connected to the editor (the MIDI input of the standalone, or the MIDI track of the plug-in in your DAW). The piano roll shows the pitches the machine plays.

## REAR PANEL
<!-- rows: MM-055 MM-056 MM-057 MM-058 MM-059 @0cc8d3 -->

Power, the voltage selector and the fuse belong to the hardware. The editor has no counterpart.

### MIDI sockets

The standalone editor has the **AUDIO / MIDI** panel for its MIDI. Press {key:audio-settings} or choose **AUDIO/MIDI…** in the engine menu. The **MIDI** card lists the inputs, with a light for each that is on, and an output. A button pairs a Bluetooth MIDI device. No MIDI input is on until you switch it on there.

In a plug-in the host routes MIDI. The machine's own MIDI out, which carries notes, controllers, program changes, pitch bend, pressure and clock, reaches the plug-in's MIDI output. Its SysEx never does.

{gap:MM-056}The editor has no MIDI THRU.{/gap}

### Audio inputs and outputs

The audio the host gives the plug-in goes to the machine's inputs. In the **Mix** workspace each FX machine has an **In** selector: NEIBOR, INP A, INP B, INP AB or a bus. This is where you choose which input the machine reads.

Each track has **Out** keys AB, CD and EF. The routing keys under the strips set the global routing: 3xSTEREO, 3xSTEREO + AB = MIX or 6xMONO. A multi-output VST3 host receives the extra pairs. Other hosts receive the main pair.

The headphone output has no counterpart. It is a copy of the AB pair.

## CONNECTING
<!-- rows: MM-060 @4c91b0 -->

Mounting, cabling, cleaning and the battery are matters for the hardware. The editor needs only the firmware image, which it asks for on the first start.
