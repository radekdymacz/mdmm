# 24. Beyond the hardware
<!-- summary: What the editor does that the Monomachine itself does not have, or does in its own way. -->

The editor runs the real Monomachine operating system and adds a few things around it. This chapter describes them.

## MACHINE MEMORY
<!-- rows: MM-X01 @77a95b -->

A Monomachine keeps what you save when you switch it off: its kits, patterns, songs and globals stay in its memory. The editor does the same. When you save on the machine, the editor writes what you saved to a file on your computer, slot by slot. A new session starts from factory memory with the saved slots put back in.

Only a save writes the file: a kit, pattern, song or global stored into its slot. That is SAVE KIT, a change to a pattern (the machine stores pattern edits as you make them), SAVE SONG, a change to a global, a SysEx dump the machine takes in, a storage image you load. It makes no difference whether you save in the editor or on the machine's own keys. The editor writes the file a second or two after the save. Turning a knob, automation from a DAW and changes to the kit that plays that you have not saved write nothing, and neither does playing.

A new session is a new plug-in in a DAW project, a new DAW project, or a start of the standalone editor. It has every slot you saved, wherever you saved it. The standalone editor also keeps the kit that played when you quit it, with its unsaved changes.

NOTE: A DAW project keeps its own memory. When you open a saved project, the machine starts with the memory of that project, not with the file. A save you then make in that project goes to the file too, and only the slot you saved.

### Start from factory memory

1. Choose **RESET MACHINE…** in the engine menu, the drop-down at the left of the LCD.
2. Click **Start from factory memory…**. The editor asks a second time.
3. Click **Start from factory memory**. The machine restarts with its factory memory, as on a new install, and the saved memory file is deleted. This takes a few seconds.

New sessions now start from factory memory until you save again. The reset has no undo: click **Export SysEx…** in the question first to keep a way back.

### Turn it off

Choose **KEEP MEMORY: ON** in the engine menu. It reads **KEEP MEMORY: OFF**, and new sessions start from factory memory. The editor no longer writes the file. The file stays, so when you turn it on again, new sessions start with the memory you saved before.

### Two editors at once

Two Monomachine editors open at the same time, in one DAW project or in two, share the same file. Each writes the slots it saves and leaves the others. When two editors save the same slot, the last save wins.

### When the file cannot be used

The file is written in one step, so a crash leaves the old memory or the new one. If the file is damaged, the machine starts from factory memory and the editor says so. It keeps the file beside the new one as machine-memory.unusable with the date and time in its name, and your next save writes a new memory file. If the file was written by a newer editor, the editor leaves it as it is and saves nothing over it. It says so; move the file away to save again.

If the editor cannot write the file, because the disk is full or the folder is read only, it says so and keeps the old file. It tries again at your next save and when it closes. Your saves stay in the session. The standalone editor starts with them next time, not with the old file, and writes them then.

The file is machine-memory.bin in the memory folder of the editor's data folder: Documents/Gearmulator Preview/Monomachine/memory. It holds the slots you saved, nothing else. It holds no firmware.
