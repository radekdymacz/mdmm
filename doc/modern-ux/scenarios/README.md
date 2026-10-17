# Preview scenarios

States the page shows only when the host says so (loading, busy, a refused command, a question, an error, no machine),
as data. A scenario is a JSON file of **contract messages**: what the plug-in would publish to the page, checked against
`$defs/message` of `md-data-contract.schema.json` / `mm-data-contract.schema.json`. A state the contract cannot say is
not a scenario (the page depends on the contract only). One folder per editor: `md/`, `mm/`.

Use: `scripts/mdmm-preview.sh md|mm`, then `?scenario=<file name without .json>` on the page's URL, or open
`http://127.0.0.1:8791/scenarios` (md) / `:8792/scenarios` (mm), which lists them. The terminal lists them at start.
Save a scenario file: the pages playing it reload and play it again; a file that is not valid shows its problems in the red bar.

Check (no ROM, no browser): `node scripts/mdmm-scenario.mjs --check` (ctest `mdmmScenariosPageTest`; the map runs it for
this folder, the schemas and the scripts). `--list` prints name and what each shows.

## The file

```json
{
 "title": "short name for the list",
 "about": "what the page shows",
 "boot": "stub",
 "pace": { "everyMs": 40 },
 "machine": { "lifecycle": "loading" },
 "steps": [
  { "at": 4000, "machine": { "lifecycle": "ready" } },
  { "on": { "op": "play" }, "delay": 200, "send": [ { "type": "result", "op": "play", "ok": false, "errors": ["..."], "note": "" } ] }
 ]
}
```

| Member | Meaning |
|---|---|
| `title`, `about` | Required. The list's text |
| `boot` | `stub` (default): the page boots from the stub as in the normal preview, then the scenario plays. `none`: the stub's messages are withheld; the page hears only the scenario (no machine, no documents), and the scenario starts with the page's first command |
| `pace` | `{"everyMs": n}`, with `boot: stub`: the stub's messages reach the page one every n ms (documents arriving). The steps start when all of them have been delivered |
| `machine` | A patch of the machine document **in force from the start**, see below |
| `steps` | At least one step, in order |

A step has exactly one of `at` (ms after the start) or `on` (a command), and at least one of `send` and `machine`:

| Member | Meaning |
|---|---|
| `at` | Milliseconds after the start: after the stub's boot (documents, catalogue and machine messages have gone quiet for 0.7 s, or all delivered when paced; 15 s at the latest), or after the page's first command with `boot: none` |
| `on` | A command the page sends: every member named equals the command's (`{"op": "patClear"}`); a member set to `null` must be **absent** (`{"op": "patClear", "force": null}`: the first ask only, not the resend with `force`). Checked against the command schema |
| `delay` | With `on`: ms before the answer (default 0) |
| `swallow` | With `on`: `false` lets the command reach the stub too. Default true: only the scenario answers |
| `send` | A list of messages, each valid against `$defs/message`. A `result` with no `id` gets the id of the command that triggered the step |
| `machine` | A patch of the machine document (objects merge, arrays and scalars replace); `null` ends the patch (the stub's own state again). The patched document is sent as a `machine` message |

**The machine patch** is held in force: every `machine` message the stub publishes afterwards passes through it, so a state
(lifecycle `booting`, `desk.tx`, `loading.failed`) stays while the stub goes on publishing. With `boot: none` it patches
`_machine.json` of the folder (the stub's machine document at rest, the base of the check too). Each patch is cumulative.

Files starting with `_` are fixtures, not scenarios.

## What each one shows

| Scenario | md | mm |
|---|---|---|
| `no-machine` | lifecycle missing: the NO ROM card, every capability off with its reason | the same (FIRMWARE NEEDED) |
| `unsupported` | lifecycle unsupported: ROM ERROR, the ROM in the folder is another OS | the same |
| `booting` | booting, then animating (the start-up card), then ready | the same |
| `slow-load` | documents arrive one by one while lifecycle is loading | the same, with `loading.done` of `total` |
| `loading-failed` | not expressible (see below) | ready, `loading.failed` 7 of 288 |
| `busy` | `desk.tx`, 12 reads left, a round trip of 1.8 s | a SYSEX RECV session sending, errors, round trip 1.8 s |
| `refused-command` | PLAY and a step click answered `ok: false` | the same |
| `ask-clear-pattern` | a `clearSlot` question; Confirm resends with `force` | the same |
| `ask-discard-kit` | a `discardKit` question with an alternative (Save and load) | the same |
| `error` | an `error` message at 1 s and a longer one at 6 s (the error line) | the same (a toast) |
| `midi-loop` | the standalone's AUDIO / MIDI panel (comma key) with the IAC Bus 1 virtual bus on as an input and as the output: the loop warning, External Input on NONE with the microphone note, the Monitor row counting | the same |
| `midi-hardware` | the same panel with a hardware port (Elektron TM-1) as input and output: no loop warning, no input note | the same |
| `engine-unavailable` | HW MIDI lost: lifecycle hwLost, capabilities with reasons, the engine menu | the same, and the page's own "no answer" dialog |
| `control-learning` | (L4, the Machinedrum's own file) | MIDI Learn on, the Control workspace (key 6): a value waits, 1 of 2, 2 of 2, learned (CC 21 on channel 1: a row of its own), then paused by the HW MIDI engine |
| `control-mapped` | (L4) | the Control workspace with the plug-in's mappings: knob rows with targets, one inverted, a level, a CC that hides the machine's own CC (one line), and what a project load left out |

## What the contract cannot say (so it is not here)

- The stub's own messages cannot be edited, only passed, slowed (`pace`) or patched (machine): a document that arrives
  wrong, half-filled or `pending` would be a hand-written `doc` message, as large as the document (a pattern is 2 to 21 KB).
- The Machinedrum machine document has no `loading.failed` (only `desk.loading`, a count), so that state exists for the
  Monomachine only.
- `busy` is `desk.tx` / `loading` / `recv` and the round trip; a `doc` with `pending: true` needs the whole document.
- The Monomachine stub sends `wire` messages that `mm-data-contract.schema.json` `$defs/message` does not list; the
  preview passes them, a scenario cannot send them.
