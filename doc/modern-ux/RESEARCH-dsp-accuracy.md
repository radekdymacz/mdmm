# DSP core accuracy: what G1-Emu found, and what we test now

Started 2026-10-11. G1-Emu (https://github.com/animatek/G1-Emu, GPL-3, Javier Melgar) runs the Nord Modular G1 on
this DSP56300 core. To make it sound right it patches the core at build time (its `cmake/Dsp56300.cmake` and
`cmake/Mc68k.cmake`). We checked each patch against our tree, took the ones that apply, and added the tests and the
tool that find this kind of bug. Our goldens cannot: they compare the emulator with its own earlier output, so a bug
that was always there passes them.

## The switch

`GEARMULATOR_MDMM_DSP_FIXES=1` turns the fixes that can change what a firmware does on, at construction
(`md::Hardware`, `dsp56k::DSP::setAccuracyFixes`, `EsxiClock::setFineCatchUpLimit`). Off is the default and is the
legacy emulation exactly, so the existing goldens hold. The perf gate keys a run with the switch on as
`speedups-<position>+dsp-fixes`, so it never fails against the legacy goldens; record its own with `--record`.

| Fix | Behind the switch | Why |
|---|---|---|
| GT and LE in the JIT: Z + (N ^ V). x86-64 tested the parity of Z, N, V; AArch64 tested LE for exactly 1. Both wrong when Z = 1 and N != V (ASL of $80:000000:000000, or a MOVE to CCR) | yes | can change a branch |
| MOVE X:aa / Y:aa (short absolute) take 1 cycle, not 2 | yes | changes timing |
| Host commands collected whenever an interrupt is picked, not only on the idle path | yes | changes interrupt order |
| An idle fine-schedule ESSI (the MD's DSP link) owes at most 64 periods when it wakes | yes | can change link timing |
| SUBR in the JIT: our left-aligned accumulators lost bits 48 to 55 of the result (found by dsp56kJitDiff, not by G1-Emu; ADDR had been fixed, SUBR not) | yes | changes a result |
| The interpreter's LE had the same mistake | no, fixed | MD/MM never run the interpreter (JIT builds only) |
| A block the JIT cannot generate no longer recurses into create() until the stack overflows; `Jit::hasFailed` records it and the perf gate fails on it | no, fixed | a crash becomes an error |

Not taken: DO FOREVER, MOVEM, the extra DMA modes and the AArch64 one-iteration block bug (MD/MM never reach them),
the 68331 timer prescaler and compare match (mdLib does not touch the GPT; whether the firmware programs its output compares is not checked yet), and G1-Emu's removal of the volatile
P-memory marks: it is safe for the G1 because it does not link blocks. mdLib does not link them either
(`config.linkJitBlocks = false` in mddsp.cpp), so it may be safe for us too, but first the counter below has to show
that MD or MM rewrites compiled code at all. CMPM was already fixed here (`DSP::setJitCmpmFix`, the speed-ups switch).

## Tests and tools (no ROM)

- `dsp56300_accuracyFixesTests` (source/dsp56300/source/dsp56kTestRunner/accuracyFixesTests.cpp): each fix both
  ways, off is the legacy behaviour (it shows each bug is real), on is the manual.
- `dsp56kJitDiff`, adapted from G1-Emu's jitdiff: runs instructions on the JIT and on the interpreter from the same
  random state and reports any register or memory word that differs; with a window K, a block of K instructions
  against the same JIT one instruction per block. `--selftest` (in ctest as `dsp56300_jitDiffSelftest`) runs a
  built-in list with the fixes on and must find nothing; `--legacy` shows the GT/LE cases again. Parallel moves that
  write the ALU's own destination are skipped: the manual leaves them undefined.
- The perf gate prints `pmem_writes_after_compile` per phase and the totals per DSP since boot.

## To run on the Mac with the ROMs

1. Does MD or MM rewrite compiled DSP code? Run the perf gate as usual and read the
   "program-memory writes over compiled code" line. Zero: nothing to gain. Not zero: try dropping the volatile marks.
2. Do the fixes change the sound? Run the perf gate with `--golden` and `GEARMULATOR_MDMM_DSP_FIXES=1` once with
   `--record`, then compare its hashes with the legacy entry. Identical: the firmware never hits these cases, turn the
   switch on by default. Different: `--wav` both and listen, ideally against the hardware.
3. Cost: ABBA the perf gate with the switch off and on.

## Leads not fixed yet

A window sweep (`dsp56kJitDiff 30 3` over 1,500 random words, seed 7, from
`python3 -c "import random; random.seed(7); [print('%06x'%random.getrandbits(24)) for _ in range(4000)]" | head -1500`)
finds 19 sequences where one JIT block differs from the same instructions one per block. Two shapes so far:
a move from an accumulator that should saturate (`a,x1` gives $7fffff one per block, the raw word in a block), and
an address register keeping only its low 16 bits (`r6 jit=000259 ref=48f259`). Either could be the JIT carrying state
wrongly inside a block, as CMPM was, or the random SR putting the DSP in a mode firmware never uses (16-bit
addressing, scaling). Next: reduce each to two instructions and a fixed SR, then decide.

The 4,000-word single-instruction sweep (`dsp56kJitDiff 40`) finds no other disagreement with the fixes on.
