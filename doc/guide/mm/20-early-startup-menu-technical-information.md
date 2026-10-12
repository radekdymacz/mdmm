# 20. Early startup menu, technical information
<!-- summary: What the machine's startup menu does, and what to do in the editor instead. -->

On the machine you hold a key while you switch it on to open the early startup menu. It holds the test mode, the resets and the OS upgrade. The editor starts the machine for you, with the OS you gave it, and has no such menu. The resets are in the engine menu instead.

## TEST MODE
<!-- rows: MM-316 @363aaf -->

The test mode checks the hardware of the machine: its keys, knobs, joystick and outputs. The editor runs on the emulated machine and has nothing to test.

## EMPTY RESET
<!-- rows: MM-317 @3d8975 -->

The empty reset clears the memory of the machine.

1. Choose **RESET MACHINE…** in the engine menu (the engine name at the left of the LCD). A question says what the reset clears. **Cancel** is the default: [ESC] or a click outside answers it.
2. Click **Empty reset…**. The editor asks a second time.
3. Click **Clear everything**. The **Empty reset** panel opens. The editor writes an empty kit, pattern and song into every slot through the SYSEX RECV screen, then reads each one back.
4. Read the report and click **Done**.

The globals stay. A global is reset in its own slot in GLOBAL (chapter 19).

NOTE: The reset has no undo. Click **Export SysEx…** in the question first to keep a way back.

NOTE: With a real Monomachine over MIDI, the machine must be on its SYSEX RECV screen. The sync field reads SEND and the number of waiting dumps until it is.

## FACTORY RESET
<!-- rows: MM-318 @9366c0 -->

The editor holds no factory data of the Monomachine, so it offers no factory reset. The **RESET MACHINE…** question says so. To get the factory kits and patterns back, import a factory .syx file. See "FILE" in chapter 19.

## SOFT RESET
<!-- rows: MM-319 @836f00 -->

The soft reset restarts the machine and keeps its data. In the editor, close the editor and open it again.

## MIDI UPGRADE, SEND UPGRADE
<!-- rows: MM-320 @989256 -->

The OS upgrade runs on the real machine. The editor does not upgrade the OS. It runs the Monomachine OS 1.32B that you give it as a ROM.

## MKI / MKII DIFFERENCES
<!-- rows: MM-322 @0634ce -->

The MKI and the MKII run the same OS. The MKII adds the user waveforms of the DigiPRO machines. The editor draws the panel of either model.

1. Click **MKI** or **MKII** at the right of the top bar. The panel changes to the other model: the MKI has a light-blue LCD, the MKII a bluish-white one.
2. Click it again to go back.

With MKI chosen, the machines that need the MKII are grey in the machine list.
