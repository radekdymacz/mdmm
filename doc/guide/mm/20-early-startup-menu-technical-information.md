# 20. Early startup menu, technical information
<!-- summary: What the machine's startup menu does, and what to do in the editor instead. -->

On the machine you hold a key while you switch it on to open the early startup menu. It holds the test mode, the resets and the OS upgrade. The editor starts the machine for you, with the OS you gave it, and has no such menu. The resets are in the engine menu instead.

## TEST MODE
<!-- rows: MM-316 @363aaf -->

The test mode checks the hardware of the machine: its keys, knobs, joystick and outputs. The editor runs on the emulated machine and has nothing to test.

## EMPTY RESET
<!-- rows: MM-317 @3d8975 -->

The empty reset clears the memory of the machine.

1. Choose **RESET MACHINE…** in the engine menu (the engine name at the left of the LCD). A question says what the reset clears. **Cancel** is the default: [ESC] answers it. A click beside the question does nothing.
2. Click **Empty reset…**. The editor asks a second time.
3. Click **Clear everything**. The **Empty reset** panel opens. The editor writes an empty kit, pattern and song into every slot through the SYSEX RECV screen, then reads each one back.
4. Read the report and click **Done**.

The globals stay. A global is reset in its own slot in GLOBAL (chapter 19).

NOTE: **Undo** takes the Empty reset back in one step. Every kit, pattern and song is written back, and the kit that plays has its edits again. The globals were not touched. **Redo** clears them again. **Export SysEx…** in the question keeps a copy in a file.

NOTE: With a real Monomachine over MIDI, the machine must be on its SYSEX RECV screen. The sync field reads SEND and the number of waiting dumps until it is.

## FACTORY RESET
<!-- rows: MM-318 @dc2556 -->

The editor holds no factory data of the Monomachine, so it offers no factory reset. The **RESET MACHINE…** question says so. To get the factory kits and patterns back, import a factory .syx file. See "FILE" in chapter 19.

**Start from factory memory…** in the same question restarts the machine as on a new install and deletes the saved machine memory. Its kits and patterns are those the emulated machine starts with, which are the factory ones only when the editor has the Monomachine's factory memory image. See "MACHINE MEMORY" in chapter 24.

## SOFT RESET
<!-- rows: MM-319 @836f00 -->

The soft reset restarts the machine and keeps its data. In the editor, close the editor and open it again.

## MIDI UPGRADE, SEND UPGRADE
<!-- rows: MM-320 @989256 -->

The OS upgrade runs on the real machine. The editor does not upgrade the OS. It runs the Monomachine OS 1.32B that you give it as a ROM.

## MKI / MKII DIFFERENCES
<!-- rows: MM-322 @19ab03 -->

The MKI and the MKII run the same OS. The MKII adds the user waveforms of the DigiPRO machines. The editor draws the panel of either model.

1. Open the engine menu at the left of the LCD and choose **PLATE: MKI** or **PLATE: MKII**. The panel changes to the other model: the MKI has a light-blue LCD, the MKII a bluish-white one.
2. Choose it again to go back.

![The MKII panel](shot:e2e-mm-top-plate)

With MKI chosen, the machines that need the MKII are grey in the machine list.

## SPECIFICATIONS
<!-- rows: MM-321 @4846ac -->

The specifications of the hardware, its connectors, memory and sizes, belong to the machine. The editor lists none of them.

## CREDITS, CONTACT
<!-- rows: MM-323 @e051f1 -->

The credits and the contact of the manufacturer belong to the machine's manual. The editor shows its own version in the top bar and in the title of the editor's menu.
