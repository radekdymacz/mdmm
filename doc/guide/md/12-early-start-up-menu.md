# 12. Early start-up menu
<!-- summary: What the machine's start-up menu does, and what to do in the editor instead. -->

On the machine you hold a key while you switch it on to open the early start-up menu. It holds the test mode, three resets and the firmware upgrade. The editor starts the machine for you, with the firmware you gave it, and has no such menu.

## TEST MODE
<!-- rows: MD-202 @e5ccd3 -->

The test mode checks the hardware of the machine: its keys, knobs, memory and outputs. The editor runs on the emulated machine and has nothing to test.

## EMPTY RESET
<!-- rows: MD-203 @0ce65e -->

The empty reset clears the memory of the machine. In the editor it is in the engine menu.

1. Choose **RESET MACHINE…** in the engine menu (the engine name at the left of the LCD). A question says what each reset clears. **Cancel** is the default: [ESC] or a click outside answers it.
2. Click **Empty reset…**. The editor asks a second time.
3. Click **Clear everything**. The **Empty reset** panel opens. The editor writes an empty kit, pattern and song into every slot, then reads each one back.
4. Read the report and click **Done**.

The globals and the samples stay. A global is reset in its own slot in GLOBAL (chapter 10).

NOTE: The reset has no undo. Click **Export SysEx…** in the question first to keep a way back.

## FACTORY RESET
<!-- rows: MD-204 @8da2d4 -->

The factory reset brings back the kits, patterns and songs the machine had when it left the factory. The editor takes them from your own ROM: it starts a second machine with it, in the background, and reads that machine's memory.

1. Choose **RESET MACHINE…** in the engine menu.
2. Click **Factory reset…**. The editor asks a second time.
3. Click **Factory reset**. Preparing the factory data takes about a minute. Then the **Factory reset** panel sends every kit, pattern and song and reads each one back.
4. Read the report and click **Done**. The first kits are named E12 UW, EFM UW, P-I UW and TRX UW.

The globals and the samples stay. The reset has no undo: export first.

## SOFT RESET
<!-- rows: MD-205 @2aa124 -->

{gap:MD-205}You cannot soft reset the machine in the editor. Restart the editor.{/gap}

## MIDI UPGRADE
<!-- rows: MD-206 @4483c9 -->

The firmware upgrade runs on the real machine. The editor does not upgrade the firmware. It runs the Machinedrum OS 1.63 that you give it as a ROM.
