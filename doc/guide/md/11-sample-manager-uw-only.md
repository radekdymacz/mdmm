# 11. Sample manager, UW only
<!-- summary: Load, name, hear and place samples in the ROM slots, and record into the RAM slots, on the UW machine. -->

The sample manager is a feature of the UW models, which have sample memory. In the editor it is the **Sampler** workspace. Press {key:workspace-4}, or click the **Sampler** tab.

The rail on the left lists the slots: four RAM slots and 48 ROM slots. The page shows the selected slot. On the second line of the LCD, <MEM> gives the share of the sample memory in use, <KIT> the number of tracks in the kit that play a ROM slot, and <SLOT> the selected slot.

![The Sampler workspace](shot:md-sampler-workspace)

NOTE: The Sampler needs the UW's ROM and RAM machines. With other firmware, or while the machine has not started, the page says so.

## SAMPLE MANAGER
<!-- rows: MD-189 MD-195 MD-196 MD-197 MD-198 MD-200 @2318f4 -->

### The slots

The ROM slots are in the rail as a grid of 48 keys. A key that is lit holds a sample the kit uses. A faint key is an empty slot. Point at a key to see its number, its name, its size and the tracks that play it.

With a ROM slot selected, the page shows under it every ROM slot as a tile: its waveform, its number and name, and a key to hear it. An empty slot offers **Load…**. Click a tile to select the slot.

Point at the <MEM> field to see the figures behind it.

{gap:MD-196}The <MEM> percentage is worked out from the samples the editor reads. It is not the machine's own figure of memory left.{/gap}

### Hear a sample

Click the play key on a tile, or the play key by the waveform of the selected slot. ![A tile with its play key](shot:e2e-md-sampler-audition)

The sample plays once, from the start, on the output of the plug-in. Click the key again to stop it. A line moves over the waveform as it plays.

### Name a sample

1. Select the ROM slot.
2. Click **Rename**.
3. Type a name of up to four letters and click **Send name**.

The machine takes the new name. It never reports the names it holds, so the editor shows the names it has sent in this session, and the names of samples it reads from the emulated machine.

### Put a sample on a track

1. Select a track.
2. Select the ROM slot on the **Sampler** workspace.
3. Click **Put on track**. The track now plays the sample.

Under it, the playback controls of the track that plays the slot set the pitch, the decay, the start and the end.

### Limits

The editor makes every sample it loads mono and 16-bit, at 44.1 kHz at most, and cuts it to the memory left.

{gap:MD-189}The editor takes WAV and AIFF files. It does not receive a sample sent over MIDI by another program.{/gap}

{gap:MD-198}You cannot copy, clear, paste or undo a sample slot in the editor yet.{/gap}

## THE DIFFERENCE BETWEEN ROM AND RAM MACHINES
<!-- rows: MD-201 @0c7158 -->

The ROM slots keep their samples when the power is off. A ROM machine plays a sample from a ROM slot. The rail marks the ROM slots "kept".

The RAM slots lose their samples at power-off. A RAM-R machine records into a RAM slot. A RAM-P machine plays what the slot holds. The rail marks the RAM slots "lost at power-off" and says for each whether it is live, frozen, capturing or not in the kit.

To start sampling into a RAM slot:

1. Select a RAM slot in the rail.
2. In the **Set up sampling** card, choose the recorder track and the player track with the **‹** and **›** keys.
3. Click **Set up sampling**. The recorder takes the machine RAM-R and records the main mix. The player takes RAM-P and plays the slot. This is one undo step.
4. Press {key:play-stop}.
5. Click **Capture next loop**. The recorder records one whole loop from the next start of the pattern, then the editor mutes it to keep the take.

Click **Live** to record again on every loop. Click **Freeze** to mute the recorder and keep the take. **Main mix**, **Input A**, **Input B** and **A + B** choose what the recorder takes.

![A RAM slot with a take](shot:md-sampler-ram)

NOTE: A RAM slot holds only what its recorder records. You cannot load a file into it.

## RAM TO ROM COPY
<!-- rows: MD-199 @c9cb80 -->

{gap:MD-199}You cannot copy a RAM slot to a ROM slot in the editor yet. Do it on the machine.{/gap}

## GENERAL SAMPLE RECEIVE
<!-- rows: MD-190 @4fd1af -->

The machine takes a sample sent over MIDI at any time. The editor does not wait for a sender. You choose the file and the slot. See "SPECIFIC PLACE SAMPLE RECEIVE".

## SPECIFIC PLACE SAMPLE RECEIVE
<!-- rows: MD-191 @c51e09 -->

1. Select the ROM slot in the rail or on its tile.
2. Click **Load sample…** or, on an empty tile, **Load…**.
3. Choose a WAV or AIFF file.
4. A bar shows the sending. Click **Stop** to cancel. When it ends, a message says the sample is loaded.

![A sample sent to ROM slot 33](shot:e2e-md-drop-sample)

You can also drop the file on the waveform of an empty ROM slot. The slot takes it.

The sample replaces what the slot holds. The plug-in gives it a name of four letters from the file name.

## ORIGINAL PLACE SAMPLE RECEIVE
<!-- rows: MD-192 @654825 -->

Drop several WAV or AIFF files on the window with the **Sampler** open. They go into ROM slots one after another, one file at a time.

1. Select the first ROM slot, or drop on the tile you want it to start from.
2. Drop the files. The editor asks "Load 3 samples into ROM-05 to ROM-07?" and tells you each replaces what its slot holds.
3. Click **Load**.

ROM-48 is the last slot. Files past it are not loaded, and a message says how many. Drag and drop works on macOS only. On Windows and Linux, load the files one at a time with **Load sample…**.

## SEND SAMPLES
<!-- rows: MD-193 @781105 -->

{gap:MD-193}You cannot send a sample from the machine to a computer. The **Send** key is greyed out, with the reason: the Machinedrum ignores requests for its samples.{/gap}

## ERASE SAMPLES
<!-- rows: MD-194 @da3bf8 -->

{gap:MD-194}You cannot erase one sample or all samples in the editor yet. Load a new sample into the slot to replace it.{/gap}
