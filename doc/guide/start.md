# Install and first start
<!-- summary: Install the editors, add your ROM, choose the emulator or a real machine, use them in a DAW. -->

Everything a first-time user needs for the Machinedrum Editor and the Monomachine Editor. Tested on macOS (Intel and Apple silicon builds, macOS 12 or later). Windows x64 and Linux x64 builds are available but not tested yet.

## Getting started

1. [Download](/get/) the installer for your machine. Each installer holds the standalone app, the VST3 and the AU.
2. Double-click the `.pkg`. It is not notarised by Apple, so macOS 15 and later blocks it. Open **System Settings → Privacy & Security**, scroll down to the message about the installer, click **Open Anyway** and confirm with your password or Touch ID. Right-click → Open no longer works for installers.
3. At **Destination Select** choose **Install for all users** (needs an administrator) or **Install for me only**. The app goes to `/Applications` or `~/Applications`. The plug-ins go to `/Library/Audio/Plug-Ins` or `~/Library/Audio/Plug-Ins`.
4. Open **Machinedrum Editor** or **Monomachine Editor** from Applications. Next, add your ROM.

## Add your ROM

The editors run the machine's real firmware. You bring your own: **Machinedrum OS 1.63** or **Monomachine SFX-60 OS 1.32B**, an 8 MiB image. No firmware is included and we cannot supply it.

1. Open the editor. With no ROM there is no error pop-up. A start-up card says **Machinedrum firmware needed** (or Monomachine).
2. Click the large area on the card: **Choose your Machinedrum OS 1.63 ROM (.bin or .zip, 8 MB)** (for the Monomachine, **Choose your Monomachine SFX-60 OS 1.32B ROM**). Under it, **Click here to choose the file**. The file chooser opens. Pick the `.bin`, or a `.zip` that holds it. On macOS you can also drop the `.bin` or `.zip` onto the window; a dropped `.syx` opens the SysEx import window and dropped samples go into the Sampler. On Windows and Linux use the file chooser.
3. The editor checks the file and copies it into its ROM folder: on macOS `~/Documents/Gearmulator Preview/Machinedrum/roms/`, on Windows `Documents\Gearmulator Preview\Machinedrum\roms\` (or the `Monomachine` folder). The firmware stays on your computer and is sent nowhere. The machine then starts, which takes 10 to 15 seconds.

You can also copy the image into that folder yourself. On the card, the links **Show the ROM folder** and **Check again** open the folder and look again. A file that is the wrong OS or a damaged dump is refused, with the reason on the card.

To replace or remove the firmware later, use **LOAD ROM** in the engine menu. Your project stays. A session that starts without a ROM keeps your saved project, and in a DAW it keeps the automation and the editor setup until the ROM arrives.

## Emulator or real machine

The **engine menu** in the editor's header chooses what the editor drives.

- **EMU OS 1.63** (Monomachine: **EMU OS 1.32B**), the default. The real firmware runs inside the editor. It needs the ROM above. Nothing else is needed.
- **HW MIDI** (beta). The editor drives your own machine over MIDI. Choose its MIDI in and out in **AUDIO/MIDI…** in the same menu (also the [,] key). Until the machine answers, the editor dims and a card offers AUDIO / MIDI or a return to the emulator. It has so far only been tested against the emulator, not a real machine.

The same menu also has **LOAD ROM** and, in the Machinedrum Editor, **GLOBAL…**.

Over HW MIDI, some controls are disabled because the machine has no MIDI message for them. The editor says why. Use the standalone app for HW MIDI. In most DAWs the plug-in has no MIDI output to the machine, so HW MIDI is disabled there.

## In a DAW

After the installer, rescan plug-ins in your DAW. The plug-ins are called **Machinedrum Editor** and **Monomachine Editor** (by Future Native Audio), as VST3 and AU instruments. Up to 0.3.1 they were called Gearmulator MD and Gearmulator MM: the installer removes those, and projects saved with them open with the new names. If your DAW still lists the editor twice, delete the old-named `.vst3` and `.component` from `/Library/Audio/Plug-Ins` and `~/Library/Audio/Plug-Ins` by hand. (The installer does this for you; dragging in the `.dmg`'s files does not.) They follow the DAW's tempo and transport. The plug-in window shows the same editor, and the same start-up card if the ROM is missing.

If a DAW will not load the AU, macOS may have quarantined it. In Terminal run:

`xattr -dr com.apple.quarantine "/Library/Audio/Plug-Ins/Components/Machinedrum Editor.component"`

Use `Monomachine Editor.component` for the Monomachine, and `~/Library/Audio/Plug-Ins/Components` if you installed for yourself only. Then rescan plug-ins.

**Both editors open at once in Ableton Live:** Live shows only the selected track's plug-in windows while **Auto-Hide Plug-In Windows** is on, so picking the Machinedrum track hides the Monomachine Editor and the other way round. In Live, open Settings > Plug-Ins, turn **Multiple Plug-In Windows** on and **Auto-Hide Plug-In Windows** off.

## Workspaces

Each editor has five workspaces. Switch with the tabs, or with the keys [1] to [5].

### Machinedrum Editor

| Workspace | What it shows |
|---|---|
| [1] Sequence | The step grid for all 16 tracks, with trigs, accents, slides and drawn parameter locks. A lock needs a trig on its step: the Machinedrum (OS 1.63) keeps a lock on a step without a trig but never plays it, so there are no trigless locks as on the Monomachine. |
| [2] Sound | One track: its machine, effects, routing and LFO, grouped by function. |
| [3] Mix | A strip per track (level, pan, drive, sends, output, mute and solo) and the master effects. |
| [4] Sampler | Sample slots as waveform tiles, loading and auditioning WAV or AIFF files, and a RAM view of steps. |
| [5] Song | The arrangement: add patterns to the song, chain them and edit rows. |

### Monomachine Editor

| Workspace | What it shows |
|---|---|
| [1] Sequence | A piano roll with a lock lane. Click to add a note of the length you pick (1/16, 1/8 …), drag a note's end to lengthen it and its body to move it; marks on a note (slide, swing, envelopes) show only where it differs, and are set in the step menu. |
| [2] Sound | One track's sound, grouped by function. |
| [3] Mix | Channel strips with pan, amp volume, distortion and delay send, one level fader, and the routing into the buses. |
| [4] Perform | Keyboard modes, multi trig, multi map, multi envelope, assign and mutes. |
| [5] Song | The arrangement: pick a song, add and edit rows. |

### More to know

- **GEN** (Sequence): a rhythm generator per track. [R] rolls a new variation, [⌥] [R] does every track. One undo step.
- **MUTATE** (Sound): vary a sound at random, then undo it.
- **IMPORT SYSEX…** and **EXPORT SYSEX…**, in the engine menu (the engine name at the left of the LCD): open a `.syx` and choose what to import, or save a backup.
- In a library, drag a kit (or pattern) slot onto another to copy it.
- **Set up sampling** (Machinedrum, Sampler): one card that sets up the recorder and the player.
- **Transpose** (Monomachine, Perform): a clickable one-octave keyboard.

### Known limits

- A Machinedrum kit that has a CTR-AL machine cannot be edited yet.
- Over HW MIDI you can send a WAV or AIFF to a sample slot when the MIDI port can send SysEx. Samples cannot be read back, so there are no waveforms and no audition. Live recording and chains need the emulator.

## Uninstall

Delete the three bundles of each editor. Your ROM and your settings are not touched. Up to 0.3.1 the plug-ins were called Gearmulator MD and Gearmulator MM: delete any of those left in the same folders too.

| Format | Files |
|---|---|
| App | `Machinedrum Editor.app` and `Monomachine Editor.app` in `/Applications` (or `~/Applications`) |
| VST3 | `Machinedrum Editor.vst3` and `Monomachine Editor.vst3` in `/Library/Audio/Plug-Ins/VST3` (or `~/Library/Audio/Plug-Ins/VST3`) |
| AU | `Machinedrum Editor.component` and `Monomachine Editor.component` in `/Library/Audio/Plug-Ins/Components` (or `~/Library/Audio/Plug-Ins/Components`) |

Questions or bugs: [contact](/contact/). Release notes: [every version](/releases/).
