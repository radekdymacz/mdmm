# 2. LCD user interface and quick start
<!-- summary: What each field of the LCD shows, how windows open and close, and a first session: load a kit, place trigs, play and tweak. -->

The LCD sits in the middle of the top bar. It shows the state of the machine: the engine, the transport, the tempo, the position, the pattern, the kit and the lock count. A second line holds values that depend on the workspace. Most fields are also controls.

## THE LCD USER INTERFACE
<!-- rows: MD-027 MD-028 MD-029 MD-030 MD-031 MD-032 MD-033 @e82d05 -->

![The LCD](shot:md-lcd)

From left to right the LCD holds:

- The engine label with its LED, and the **REC** and Play keys.
- **Tempo**, with an LED that blinks on every fourth step while the machine plays.
- **Position**.
- **Pattern**, with ‹ and › keys.
- **Kit**, with a chip that reads saved or edited.
- **Locks**.
- The second line, the **Sync** field, and the **Copy**, **Clr** and **Paste** keys.

### The engine label

The label says what the machine is doing. READY, with the engine's name (EMU OS 1.63), means it takes input. Until then the fields dim, **REC** and Play are off, and edits wait.

| Label | Meaning |
|---|---|
| NO ROM | no firmware is installed yet |
| LOADING ROM | the machine is being prepared or restored |
| BOOTING OS | the firmware is starting |
| EMU OS 1.63 | the emulated machine is ready |
| ROM ERROR | the firmware you installed is not OS 1.63 |
| HW CONNECT, HW NO MIDI | the editor is waiting for a real machine on MIDI |

### Tempo

**Tempo** shows the tempo in BPM with one decimal, for example 124.0. Drag it up or down to change it, or tap it with {key:tap-tempo}.

### Position

**Position** shows the bar and step of the playhead, for example 02.05, in bars of 16 steps. It reads --.-- while the machine is stopped.

On the Sequence workspace the four page LEDs beside the **Page** key show the same thing as the machine's four pattern-page boxes: the page that plays is lit.

### Transport

**REC** and the Play key have LEDs. The Play key shows ▶ while the machine is stopped and ■ while it plays. **REC** is lit during live recording.

{gap:MD-029}The LCD has no pause state, because the editor has no pause.{/gap}

### Kit

**Kit** shows the kit number and name, for example K01 WAREHOUSE. The chip beside the label reads **saved** when the kit on the machine is the one stored in its slot, and **edited** when you have changed it since. Click the field to open the kit library.

### Pattern

**Pattern** shows the pattern that plays, for example A01. While another pattern waits for the end of the current one, the field shows the waiting pattern and blinks.

### Locks

**Locks** counts the parameters locked in the pattern, out of the 64 the machine holds, for example 41/64. It changes its look at 52 and again at 64.

### The second line

The second line shows values that belong to the workspace you are in.

| Workspace | Fields |
|---|---|
| Sequence | **LEN**, **SPD**, **SWG**, **ACC**, **MODE**, **LEN** ×2, **PLAY** |
| Sound | **TRACK**, **MACHINE**, the machine's name, **PLAY** |
| Mix | **PATH**, the signal path, **PLAY** |
| Song | **SONG**, **ROWS**, **BARS**, **TIME**, **PLAY** |

On the Sound workspace the machine key under the header also shows the machine and its family, for example EFM and FM drums.

### Sync

The **Sync** field reads Sync when the editor is in step with the machine and Send while it sends your edits. When the machine follows the host's clock it reads Host. While the editor reads the machine's patterns, kits and songs in the background after start-up, it shows how many of them are read, as a count out of the total. You can edit while it reads.

### Level

{gap:MD-032}The editor has no level bar for the overall volume of a track.{/gap}

### Value boxes

Parameters appear as value boxes on the Sound and Mix workspaces. A box shows the parameter name and its value, 0 to 127. A few parameters run from one side to the other, or from cut to boost, and show -64 to +63 with 0 in the middle. They are PAN, EQG, the levels and balances of the RAM recorder, and the gains of the master EQ's CTR machine.

{gap:MD-033}The editor does not draw the clip that the machine shows between two values that depend on each other.{/gap}

## LAYER EDIT AND WINDOWS
<!-- rows: MD-034 @718129 -->

On the machine a window opens over the main screen and EXIT closes it. In the editor the machine picker, the kit library, the pattern chooser, the GLOBAL panel, the AUDIO / MIDI settings and the keyboard view open over the workspace. Press {key:close-dialog} to close the one that is open.

Press {key:keys-help} to open the keyboard view. It lists every key and gesture of the editor.

## QUICK START
<!-- rows: MD-035 MD-036 MD-037 @e1b930 -->

This is a first session. It loads a kit, places trigs, plays them and changes a sound.

### Playing and tweaking drum sounds

1. Click the **Kit** field of the LCD. The kit library opens.
2. Click a kit. The machine loads it at once. If you have unsaved changes, the editor asks first.
3. Press {key:close-dialog}, then press {key:workspace-1} for the Sequence workspace.
4. Click steps in the grid. Each click turns a trig on or off. Each row of the grid is a track.
5. Press {key:play-stop}. The pattern plays.
6. Click a track in the rail to select it. Press the keys A to L to play it by hand.
7. Press {key:workspace-2} for the Sound workspace. Drag a value box to change the sound of the selected track.

![The Sound workspace](shot:md-sound-workspace)

Turn a value in small steps when you need them. Hold [⇧] and drag for fine steps. Scroll the wheel over a box for one step a notch, and hold [⇧] for ten. Double-click a box to set it back to 64.

### Hear a machine before loading it

{gap:MD-037}The editor has no preview for a machine. Choosing a machine in the picker loads it at once. Press {key:undo} to take it back.{/gap}

### Using the track effects

Each track has an amplitude modulator, an EQ, a filter and a sample rate reducer. They are groups on the Sound workspace. Chapter 4 describes them.

### Selecting and playing a pattern

Click the pattern name in the LCD to open the pattern chooser. Chapter 1 describes how to choose a pattern, and chapter 8 how the sequencer works.
