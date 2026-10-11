# 12. Tempo
<!-- summary: Set the tempo by hand or by tapping, and follow a DAW or an external clock. -->

## TEMPO
<!-- rows: MM-193 MM-199 @6bcf85 -->

The tempo is global. A pattern does not store it, so changing the pattern never changes the tempo. A song row can carry a tempo of its own (see chapter 17, "Set a tempo for a row").

The **Tempo** field of the LCD shows the tempo in BPM with one decimal. It is on every workspace.

## THE TEMPO SCREEN
<!-- rows: MM-194 MM-195 MM-196 @aa9417 -->

The editor has no tempo screen. You set the tempo in the **Tempo** field itself, from 30 to 300 BPM.

- Drag the field up or down. Each pixel is half a BPM. Hold [⇧] to change it a tenth of a BPM at a time.
- Click the field and press [↑] or [↓] to change it by 1 BPM. Hold [⇧] for a tenth.

The decimal part is kept, so 120.5 is a tempo.

{gap:MM-195}You cannot hold a tempo change back until a key is released in the editor.{/gap}

{gap:MM-196}There is no key that shifts the tempo by 10 % for a moment.{/gap}

NOTE: In a DAW the machine follows the tempo of the DAW and the field refuses edits. The page says "The DAW sets the tempo. Change it there."

## TAP TEMPO
<!-- rows: MM-197 @66da4a -->

1. Press {key:tap-tempo-shift} in time with the music. It works on every workspace.
2. After the second tap the tempo is set and the page shows it, for example Tap tempo: 128.0 BPM.

The tempo is the average of the last five taps. A pause of two seconds starts the count again.

On workspaces other than **Sequence**, [B] taps too. On **Sequence** [B] is the **Draw** key of the piano roll.

## EXTERNAL SYNCHRONISATION
<!-- rows: MM-198 @d40778 -->

The machine runs on its own clock or follows a MIDI clock. The setting is in the **GLOBAL** panel.

1. Click **Global** in the top bar.
2. In the **Sync** card, click **EXT** beside **Tempo in** to follow a MIDI clock, or **INT** for the machine's own tempo.
3. Click **ON** beside **Ctrl in** if the machine should also follow MIDI start and stop.

In a DAW you set nothing. The plug-in sets **Tempo in** to EXT and **Ctrl in** to ON itself, and the machine follows the host. See chapter 19, "Control out 2" and "Control in", for the other settings of the card.
