# 12. Tempo
<!-- summary: Set the tempo by hand or by tapping, and follow a DAW or an external clock. -->

## TEMPO
<!-- rows: MM-193 MM-199 @6bcf85 -->

The tempo is global. A pattern does not store it, so changing the pattern never changes the tempo. A song row can carry a tempo of its own (see chapter 17, "Set a tempo for a row").

The **Tempo** field of the LCD shows the tempo in BPM with one decimal. It is on every workspace.

## THE TEMPO SCREEN
<!-- rows: MM-194 MM-195 MM-196 @fecb8e -->

You set the tempo in the **Tempo** field itself, from 30 to 300 BPM, or in the **TEMPO** window that a click on the field opens.

- Drag the field up or down. Each pixel is half a BPM. Hold [⇧] to change it a tenth of a BPM at a time.
- Click the field and press [↑] or [↓] to change it by 1 BPM. Hold [⇧] for a tenth.

The decimal part is kept, so 120.5 is a tempo.

Click the field without dragging to open the **TEMPO** window, the machine's tempo screen:

- **−** and **+** change the tempo by 1 BPM, or a tenth with [⇧].
- **TAP** taps the tempo.
- **NUDGE** shifts the tempo for a moment, as [LEFT] and [RIGHT] on the machine. Press and hold **−10 %** or **+10 %**. The tempo is 10 % slower or faster while you hold it, and goes back when you let go. The keys {key:tempo-nudge} do the same while held.
- **Change on release** holds a dragged tempo back until you let go of the field, as [FUNCTION] held does on the machine. The field shows the new tempo while you drag and the machine takes it at the release.
- **Sync** **INT** and **EXT** choose the machine's own tempo or MIDI clock, as <TEMPO IN> in GLOBAL. **Sync in GLOBAL** opens the GLOBAL panel.

Press [Esc] or click outside the window to close it.

TIP: Hold [⌥] while you drag the field to change the tempo at the release once, without the tick.

NOTE: In a DAW the machine follows the tempo of the DAW and the field refuses edits. The page says "The DAW sets the tempo. Change it there."

## TAP TEMPO
<!-- rows: MM-197 @66da4a -->

1. Press {key:tap-tempo-shift} in time with the music. It works on every workspace.
2. After the second tap the tempo is set and the page shows it, for example Tap tempo: 128.0 BPM.

The tempo is the average of the last five taps. A pause of two seconds starts the count again.

On workspaces other than **Sequence**, [B] taps too. On **Sequence** [B] is the **Draw** key of the piano roll.

## EXTERNAL SYNCHRONISATION
<!-- rows: MM-198 @aa1926 -->

The machine runs on its own clock or follows a MIDI clock. The setting is in the **GLOBAL** panel.

1. Click **Global** in the top bar.
2. In the **Sync** card, click **EXT** beside **Tempo in** to follow a MIDI clock, or **INT** for the machine's own tempo.
3. Click **ON** beside **Ctrl in** if the machine should also follow MIDI start and stop.

The **Sync** keys **INT** and **EXT** of the **TEMPO** window set **Tempo in** too.

In a DAW you set nothing. The plug-in sets **Tempo in** to EXT and **Ctrl in** to ON itself, and the machine follows the host. See chapter 19, "Control out 2" and "Control in", for the other settings of the card.
