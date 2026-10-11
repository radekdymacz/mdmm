# 12. Early start-up menu
<!-- summary: What the machine's start-up menu does, and what to do in the editor instead. -->

On the machine you hold a key while you switch it on to open the early start-up menu. It holds the test mode, three resets and the firmware upgrade. The editor starts the machine for you, with the firmware you gave it, and has no such menu.

## TEST MODE
<!-- rows: MD-202 @e5ccd3 -->

The test mode checks the hardware of the machine: its keys, knobs, memory and outputs. The editor runs on the emulated machine and has nothing to test.

## EMPTY RESET
<!-- rows: MD-203 @c3794b -->

{gap:MD-203}You cannot empty the whole memory of the machine at once in the editor. You can clear a pattern, a kit, a song row or a sample slot one at a time.{/gap}

## FACTORY RESET
<!-- rows: MD-204 @74a82a -->

{gap:MD-204}You cannot reset the machine to its factory data in the editor. Import a factory .syx file instead. See "GENERAL SYSEX RECEIVE" in chapter 10.{/gap}

## SOFT RESET
<!-- rows: MD-205 @2aa124 -->

{gap:MD-205}You cannot soft reset the machine in the editor. Restart the editor.{/gap}

## MIDI UPGRADE
<!-- rows: MD-206 @4483c9 -->

The firmware upgrade runs on the real machine. The editor does not upgrade the firmware. It runs the Machinedrum OS 1.63 that you give it as a ROM.
