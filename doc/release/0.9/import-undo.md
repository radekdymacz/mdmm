# 0.9 wave 4: undo for SysEx import and Empty Reset (B-130), and the import pattern pick question (B-045)

Branch `feat/0.9-import-undo`, from `codex/continue-0.8.0`. Both editors. Source: doc/release/PLAN-0.9.md wave 4.

## Problem

A SysEx import and the Empty (or Factory) Reset overwrite kits, patterns and songs on the machine and are no undo
step. The only way back is an export made beforehand. The journeys that run them are `alone: true` for that reason.

B-045: on the Machinedrum a pattern picked while an import runs asks "Your edits to K.. are not saved" although
nothing was edited. A dump over the kit that plays reloads the working kit before the editor's copy of that stored
slot is current, so the two differ and the desk reads that as unsaved edits.

## What exists

- One undo system: `deskCore::History<Change>` held by `deskCore::Core<Model>`. A step is the list of changes one
  command made. Undo delivers the inverted changes through `Machine::submit`, each from what the page shows now;
  redo delivers what undo replaced. Both editors use it (`Change` = `{before, after}` of a `Document`).
- The SysEx work: `SyxWork<DeskT>` (mdSyxWork.h) runs the import (`SyxJob`) and the resets for the plug-in's
  session and for the page tier's stub host. A reset is an import of the empty documents (`SyxWork::reset`).
- The import never goes through `Core::edit`: its dumps go to the machine as they are (`Machine::sendAsIs`) and the
  desk learns the new slots from the read-back or by reading them again.

## Design

Use the existing history. Do not add a second undo list.

1. **Copy before.** When `SyxWork` accepts a job that sends (`start` with checkOnly off, and every reset), it asks the
   desk's core for a snapshot (`Core::snapshot(refs)`): a copy of the documents the view holds for
   - the working kit (first: the kit that plays with its live edits), and
   - every kit, pattern and song the job will write (`SyxJob::written()`: the chosen items at their landing slot).
   Only those slots are copied. Slots the editor has not read yet are read first (see the last section).
2. **Record after.** When the job is over (`SyxWork::end`: done, stopped or given up, also a cancel inside
   `handle`), the copies of the slots that had a message sent (`written(sentOnly)`), and the working kit when any
   was, become one history step (`Core::recordBulk`): `Change{doc, doc}` per document. Nothing sent: no step. A
   check-only job copies nothing.
3. **Undo and redo are the core's own.** `undoRedo` refreshes each change's `before` from the view and delivers it
   (skipped where equal). Undo therefore writes the copies back through `submit` (the library's own slot write,
   plus LOAD KIT into the kit that plays), the working kit last (it is the first in the step, undo runs the list
   backwards). The inverted step becomes the redo step with what the machine held at undo time, so redo brings the
   import back.
4. **Bounded memory.** The step holds one document per touched slot, not the machine. `History::limitChanges`
   drops the oldest steps until the undo list holds at most 1000 changes in all (the newest step stays however
   large; an Empty Reset of the Monomachine is about 280 documents). Nothing is kept for slots an import does not
   write.
5. **Not undone:** globals (an import of a global changes MIDI channels, and the Machinedrum desk holds only the
   active global), "other" messages, samples, and Start from factory memory (it restarts the machine; its question
   still says so). The dialogs and the guide say what Undo puts back.

Why not "write back through `SyxWork`" as one more import: the history already delivers documents to the machine,
keeps redo and the undo counts the page shows, and is the one place Cmd+Z and the UNDO key reach. A second path
would need its own redo and its own entry in the history. The writes are the same documents the library's paste and
Clear write, through the same adapter code the import's own edits use after it.

## B-045

`deskCore::Machine::importing(bool)` (default nothing). `SyxWork` sets it when a job is accepted and clears it when
nothing is due any more (job over, steps recorded, rereads handed to the desk). `MdMachine::askSelect` asks the
discard question only when `!importSettling()`: no import at work and none of the slots it wrote (`reread`) still
waiting in the load queue. Real edits made when no import is near ask as before.

## Page and guide

- The import footer, the import help, the question of Reset machine…, the question before an import over data and
  the contract's command rows say what Undo puts back (kits, patterns, songs; not globals, not samples) and keep
  "Export SysEx… first keeps a copy in a file". The factory-memory question still says there is no undo.
- Guide: chapter 10 (MD import), 12 (MD resets), MM 19 and 20; the B-045 note in the pattern chapter goes.
- Shared page file skins/shared/deskSyx.js; the generated assets come from sync-mdstudio-skin.py,
  sync-mmstudio-skin.py and mm-mockup/build.sh (their `--check` passes).

## Tests

- `deskCoreTest` (bulk): snapshot holds what the view holds; recordBulk is one step; undo restores every
  document; redo brings the import back; an edit ends the redo; nothing copied records nothing; `limitChanges`.
- Journeys, page tier and firmware (same step lists): `md-lib-syx-import-undo`, `mm-lib-syx-import-undo` (import
  kits, Cmd+Z puts the names back, Cmd+Shift+Z the file's, Cmd+Z again), and a Cmd+Z step added to
  `md-engine-reset-empty` and `mm-engine-reset-empty` (the named kits are back). The two reset journeys' question
  text is checked.
- `deskSyxTest.js`: the footer line.
- The firmware tests that drive `SyxJob` directly are unchanged (no `SyxWork`, so no step: still 0).

## Open for Radek

- The import and reset journeys stay `alone: true`: a global import is not undone and the page-tier copies are cheap
  but a failed undo would leave the run's machine changed. Say when they may share an editor.
- Decided (Radek): slots the editor has not read are read first. `SyxWork::begin` asks the desk to read them (`reread`), the job waits (`undoReady`, up to 60 s) and the copy is taken after. Any slot that did not arrive ends the report with "N slots cannot be undone" (`SyxJob::setNote`).
