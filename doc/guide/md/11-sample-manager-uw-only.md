# 11. Sample manager, UW only
<!-- summary: Load, name, hear and place samples in the ROM slots, and record into the RAM slots, on the UW machine. -->

The sample manager is a feature of the UW models, which have sample memory. In the editor it is the **Sampler** workspace. Press {key:workspace-4}, or click the **Sampler** tab.

The rail on the left lists the slots: four RAM slots and 48 ROM slots. The page shows the selected slot. On the second line of the LCD, <MEM> gives the share of the sample memory in use, <KIT> the number of tracks in the kit that play a ROM slot, and <SLOT> the selected slot.

![The Sampler workspace](shot:md-sampler-workspace)

NOTE: The Sampler needs the UW's ROM and RAM machines. With other firmware, or while the machine has not started, the page says so.

## SAMPLE MANAGER
<!-- rows: MD-189 MD-195 MD-196 MD-197 MD-198 MD-200 @ee7467 -->

### The slots

The ROM slots are in the rail as a grid of 48 keys. A key that is lit holds a sample the kit uses. A faint key is an empty slot. Point at a key to see its number, its name, its size and the tracks that play it.

With a ROM slot selected, the page shows under it every ROM slot as a tile: its waveform, its number and name, and a key to hear it. An empty slot offers **Load…**. Click a tile to select the slot.

Point at a key or a tile to see the size of the sample: its length in seconds, in kilobytes and in samples, and its rate. A kilobyte count is the sample as the machine stores it, 16-bit and mono.

### Memory left

The header of the **ROM slots** card gives the sample memory in seconds: how much the samples hold, how much is free, and the free share in per cent. The ROM slots and the four RAM buffers share the memory, so the figure counts both. Point at the <MEM> field for the same figures in samples.

NOTE: The editor works the figure out from the samples it reads. The Machinedrum does not report its own figure over MIDI, so the share can differ by a few per cent from the one on the machine's SAMPLE MGR screen.

### Hear a sample

Click the play key on a tile, or the play key by the waveform of the selected slot. ![A tile with its play key](shot:e2e-md-sampler-audition)

The sample plays once, from the start, on the output of the plug-in. Click the key again to stop it. A line moves over the waveform as it plays.

### Name a sample

1. Select the ROM slot. It must hold a sample.
2. Click **Rename**.
3. Type a name of up to four letters and click **Rename**.

The Machinedrum renames a sample only when it receives the sample. So the editor sends the new name, then the slot's own sample again into the same slot. A bar shows the sending, as when you load a file, and the sample is the same as before: only the name changes. The slot's loop points are not sent again.

Rename needs the editor to read the slot's audio, so it works with the emulated machine. A real Machinedrum does not send its samples back, so the **Rename** key is greyed out, with the reason. Rename the sample in SAMPLE MGR on the machine, or load the file again.

### Put a sample on a track

1. Select a track.
2. Select the ROM slot on the **Sampler** workspace.
3. Click **Put on track**. The track now plays the sample.

Under it, the playback controls of the track that plays the slot set the pitch, the decay, the start and the end.

### Limits

The editor makes every sample it loads mono and 16-bit, at 44.1 kHz at most, and cuts it to the memory left.

{gap:MD-189}The editor takes WAV and AIFF files. It does not receive a sample sent over MIDI by another program.{/gap}

### Copy, paste and undo

1. Select a slot that holds a sample, ROM or RAM.
2. Click **Copy**. A line beside the keys names what is copied.
3. Select the ROM slot that is to take it.
4. Click **Paste**. A bar shows the sending, as when you load a file.

The copy is a snapshot taken when you click **Copy**. A RAM take that is recorded over afterwards is still pasted as it was. The paste replaces what the slot holds. The slot takes the name of the copy.

**Undo sample** sends back the sample that the last paste, RAM to ROM copy, rename or file load replaced. It goes back 16 steps, one at a time. The editor has no redo for samples. A step that filled an empty slot cannot be undone, because the editor cannot erase a slot.

NOTE: The loop points of a sample are not sent with a paste or an undo. A sample that does not fit in the memory left is not sent, and a message says by how much.

{gap:MD-198}You cannot clear a sample slot in the editor yet.{/gap}

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
<!-- rows: MD-199 @004a8e -->

To keep a RAM take when the power is off, copy it to a ROM slot:

1. Select the RAM slot that holds the take.
2. Click **Keep as ROM…**.
3. Type the ROM slot, 1 to 48. The first empty slot is offered.
4. Click **Keep**. A bar shows the sending.

The take is sent as it is now. The ROM slot takes the name RAM1 to RAM4 and replaces what it held; **Undo sample** brings that back. The other RAM slots stay as they are. On the machine the copy empties them after a prompt, and the editor does not.

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
<!-- rows: MD-192 @12f036 -->

Drop several WAV or AIFF files on the window with the **Sampler** open. They go into ROM slots one after another, one file at a time.

1. Select the first ROM slot, or drop on the tile you want it to start from.
2. Drop the files. The editor asks "Load 3 samples into ROM-05 to ROM-07?" and tells you each replaces what its slot holds.
3. Click **Load**.

ROM-48 is the last slot. Files past it are not loaded, and a message says how many. Drag and drop works on macOS only. On Windows and Linux, load the files one at a time with **Load sample…**.

## SEND SAMPLES
<!-- rows: MD-193 @0e551e -->

The Machinedrum ignores requests for its samples over MIDI, so the editor does not ask it to send. It reads the samples from the emulated machine and writes them as files instead.

1. Select the slot, ROM or RAM.
2. Click **Export WAV**.
3. Choose where to save the file.

To save every ROM slot that holds a sample, click **Export all…** in the header of the **ROM slots** card and choose a folder. A file is written for each slot, named by its slot and its name, such as "ROM-04 SNR". On a RAM slot, **Export all RAM…** does the same for the four RAM slots.

The files are 16-bit mono WAV at the slot's own rate. They hold exactly the samples the machine holds, with no loop points.

NOTE: Export works with the emulated machine only. A real Machinedrum does not send its samples back, so the keys are greyed out, with the reason. The editor writes WAV files, not the SysEx files of the machine's own SEND.

## ERASE SAMPLES
<!-- rows: MD-194 @364503 -->

{gap:MD-194}You cannot erase one sample or all samples in the editor yet. Erase them in SAMPLE MGR on the machine, or load a new sample into the slot to replace it.{/gap}
