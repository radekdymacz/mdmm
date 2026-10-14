# Design: one page contract, three back ends

- Branch `docs/shared-contract`, 2026-10-14. Hammock first: no code follows until Radek decides section 11.
- Input: the MD and MM contracts (`md-data-contract.schema.json`, `mm-data-contract.schema.json`, `data-contract.md`,
  `mm-data-contract.md`, `intent-cases.json`, `page_contract_check.py`), [FOUNDATION.md](FOUNDATION.md),
  [DESIGN-P6-simple-core.md](DESIGN-P6-simple-core.md), xox-plocks (`VISION.md`, `DESIGN.md`, `VENDOR.md`,
  `PARITY.md`, `ui/xoxHost.js`), the native engine notes on `codex/native-audio-engine`
  (`source/elektron/md/mdNative/DIRECTION.md`, `ARCHITECTURE.md`) and the page preview on `feat/page-preview`.

## 1. The problem

The page and its back end talk through one contract: documents in, commands out. P6 made that contract plain data
and checked it both ways. It works. But it is the Machinedrum's and the Monomachine's contract, and it lives inside a
GPL-3 repository. Three back ends now want the same page:

| Back end | Licence | How it uses the contract today |
|---|---|---|
| MD + MM Editors (this repo) | GPL-3 | The authority. `$defs/command` is generated from the C++ tables (`MdModel::commands()`, `MmModel::commands()`, deskHost's table). Every published message is validated with `closedForWriter`. |
| xox-plocks | closed | Copies the MD page (VENDOR.md) and fakes an MD behind it. `xoxHost.js` writes `md-desk/pattern`, `md-desk/kit` and a catalogue with `family: "X"` and stub `masterFx` and LFO enums. It adds members (`prob`, `trackPlay`, `rtrg`, `nlen`, `trackFeel`), ops (`lockTrig`, `cond`, `rtrg`, `nlen`, `feel`, `mapEdit`, `device`, `portSync`, ...) and message types (`xoxClock`, `xoxOutput`). None of it is checked against a schema. |
| Native groovebox (`codex/native-audio-engine`) | not decided | No contract yet. ARCHITECTURE.md asks for a versioned descriptor: stable parameter ids, units, ranges, limits beyond 16 tracks, 24 parameters and 64 steps. |

What is braided today:

1. **Envelope and vocabulary.** "A result follows the documents it changed" and "a kit has 16 tracks of 24 bytes" sit
   in the same schema file. A new back end cannot take the first without the second. xox shows the cost: it imitates a
   Machinedrum to get a step grid.
2. **Contract and licence.** The source of truth is C++ in a GPL repo, so a closed product cannot take the schema
   without a question about where it came from.
3. **Contract and firmware layout.** A lock lane is `i: 0..23`, a pattern is at most 64 steps, a value is 0..127. These
   are OS 1.63 facts. The groovebox must not inherit them by accident (ARCHITECTURE.md, "What remains tied").
4. **Contract and transport.** `gmbridge://`, `gm.recv([...], seq)` and `window.gmDev` are documented beside the
   message types. They are a separate concern: how a batch travels, not what it says.
5. **Two shared vocabularies that drift.** MD and MM share 116 op names, but only 48 have the same schema. Some
   differences are real (6 tracks, not 16). Some are accidents. Nothing says which.

What success looks like:

- A page written against the shared layers runs on any back end that declares those layers.
- Each back end proves, by test, that what it sends and accepts conforms. xox and the groovebox get the same checks
  the editors have.
- The shared layers can be used by a closed product without copying GPL code.
- The shipped editors never break along the way. Every step is additive or a refactor with the same output.

## 2. What is already right (keep it)

P6 got the hard parts right. This design keeps them and only moves where they live.

- **Documents in, commands out.** Neither page builds a document; an edit is an intent.
- **Open for readers, closed for commands.** Writers' objects say `additionalProperties: true`; commands are closed
  and an undeclared argument is refused. A writer is still held to what it declares (`closedForWriter`).
- **Additive keeps the version; rename, remove or re-mean bumps it.** One integer, no minor versions.
- **Capabilities, not engine ids.** The page enables a control from `machine.capabilities.can`, shows `reasons`
  otherwise, and treats an unknown name as not allowed.
- **Asks and force.** The core never resends; the page resends with `force`.
- **Intent cases as data.** One file runs on the core and on the page.
- **Static page check.** `page_contract_check.py` proves every op a page sends is declared, both ways for
  capabilities, lifecycle and message types.

A fact that shapes the whole design: in the editors the page and the back end ship in one binary. Version skew
between them cannot happen there. Versioning matters for two other things: pages copied into another product (xox),
and documents saved in projects. So the rules below protect those two, and cost the editors nothing.

## 3. Prior art (briefly)

| Prior art | What it does | What we take |
|---|---|---|
| LSP (Language Server Protocol) | One JSON-RPC envelope, a spec that lives apart from every server and client, `initialize` with capabilities both ways, `experimental` for extensions. | The spec as its own thing; capabilities as data; an extension space that never collides with the core. We do not take JSON-RPC: our batches and results already do its job. |
| OpenAPI and AsyncAPI | Versioned JSON Schema for request/response (OpenAPI) and for message streams (AsyncAPI). | AsyncAPI is the closer fit: we are a message stream, not request/response. We take the idea of one schema per channel direction, and `$ref` composition. We do not adopt the tooling. |
| MIDI-CI Property Exchange | JSON resources over SysEx. A `ResourceList` says which resources a device has. Standard resources plus manufacturer ones (`X-` prefix). | Discovery as a document (our catalogue and `profiles`), and a vendor prefix for what is not shared. |
| OSC and OSCQuery | OSC is an address space with no schema. OSCQuery adds a JSON tree that describes each address: type, range, access. | The descriptor: a parameter described once with its range and meaning, so a generic control can draw it. |
| CLAP and VST3 | Processor and editor split. Parameters have stable ids that never change meaning; the label can change. CLAP: flags (automatable, modulatable, stepped). | Stable parameter identity apart from the label and the position. A parameter's index is not its identity (ARCHITECTURE.md agrees). |
| Ableton (Push, Live Object Model) | Devices expose parameters in banks of eight; a control surface knows banks, not devices. | The picker's groups are banks from data. xox already does this with device maps. |
| Elektron | One sequencer UI across machines: the same trig, p-lock and condition model on Digitakt, Digitone, Syntakt. The sound engine differs; the grid does not. | The middle layer: a grid vocabulary shared by every instrument, under each instrument's own sounds. |

The common lesson: **separate the envelope (how we talk) from the vocabulary (what we talk about), describe
parameters as data with stable ids, and let each side say which vocabularies it speaks.**

## 4. Candidate shapes

### A. A contract package of its own: envelope plus layered vocabularies

A new small repository holds the generic layers as hand-written JSON Schema, the rules, the transport spec, the check
tool and the shared conformance data. Each back end keeps its own vocabulary schema in its own repo, composed on top.

- *For:* the seam is the repo boundary. The generic layers carry their own licence. xox stops faking a Machinedrum.
  The groovebox starts on the shared layers and adds only its own. Each layer has an owner and a version.
- *Against:* a second place to change when a shared op changes. Needs a pinning discipline so a back end never reads a
  moving target. Extracting the generic layers from today's generated schemas is careful work.

### B. Keep it in this repo and publish a versioned artifact

The MD and MM schemas stay the authority. A release attaches a bundle (`contract-<n>.tgz`: schemas, intent cases, the
check tool). xox and the groovebox take the bundle.

- *For:* no new repo, no extraction. One place of truth that the editors already test.
- *Against:* it leaves all five braids in place. xox's vocabulary would have to be added to the GPL repo or stay
  unchecked. The groovebox inherits MD shapes or forks them. The licence of a bundle built from a GPL repo, partly
  generated by GPL-linked test programs, is exactly the question we want not to have. Releases of the editors would
  gate releases of the contract.

### C. A self-describing contract only (descriptor-driven, OSCQuery style)

One generic contract. Every instrument describes all of its documents and parameters at run time in the catalogue.
No per-instrument schemas.

- *For:* the most general. A new instrument needs no schema work.
- *Against:* "closed for commands" becomes a run-time check only; `page_contract_check.py` could no longer prove what
  a page sends. Pages need behaviour (the MD's working kit, the MM's arpeggiator, xox's retrigs), not only ranges. It
  is a rewrite of 140 commands for a generality nobody has asked for.

### D. Status quo: copy both ways under PARITY.md

- *For:* zero work now.
- *Against:* xox already has 20-odd unchecked ops on a page that thinks it talks to a Machinedrum. Drift is the
  default, and the groovebox would make it three ways.

### Choice: A, with C's descriptor confined to parameters

A gives the seam. From C we take one thing: parameters described as data in the catalogue (id, label, group, range,
display), so a generic lane or knob can draw any instrument's parameter. Everything else stays statically declared
and checked.

## 5. The recommended shape

```
               desk-contract (own repo, MIT)                         each back end's repo
   ┌───────────────────────────────────────────────────┐   ┌────────────────────────────────────┐
   │ envelope   messages, commands, rules, lifecycle    │   │ md      kit, machines, masterFx,  │
   │ host       plug-in shell: audio, MIDI learn, menu, │   │         LFO, samples, global       │
   │            notes, drop, zoom, meters               │   │ mm      kit, arp, multi map, ...   │
   │ grid       pattern core, steps, locks, song rows,  │   │ elektron ROM, SysEx, LCD, memory  │
   │            chains, mutes, transport, lanes         │   │ xox     device maps, conditions,  │
   │ transport  how a batch travels (spec only)         │   │         retrigs, ports, clock      │
   │ tools      compose, check, validate                │   │ groovebox processors, buses, ...  │
   │ conformance shared intent cases, scenarios         │   └────────────────────────────────────┘
   └───────────────────────────────────────────────────┘
        composed per back end: envelope + host + grid + its own = one flat schema file it is tested against
```

Four layers, each with its own integer version:

| Layer | Name in `profiles` | Who speaks it |
|---|---|---|
| Envelope | `desk` | every back end |
| Plug-in shell | `host` | the editors, xox's plug-in and standalone, the groovebox; not a bare browser page |
| Step grid | `grid` | MD, MM, xox, groovebox |
| Instrument | `md`, `mm`, `elektron`, `xox`, `groovebox` | the one back end (or two: `elektron` is shared by MD and MM, and lives in this repo, not in desk-contract) |

### 5.1 The envelope (`desk`, generic)

Taken from what the MD and MM schemas already agree on, member for member. Nothing is renamed.

Messages, back end to page (a batch is a JSON array):

| `type` | Shape (required members) | Meaning |
|---|---|---|
| `doc` | `kind`, `doc`; optional `slot`, `pending`, `source` | A document. `kind` is a vocabulary word; the instrument layer says which kinds exist and their shapes. |
| `catalogue` | `doc` | The descriptor (5.4). Once after ready, again when it changes. |
| `machine` | `doc` | The back end's state document (below). |
| `result` | `op`, `ok`, `errors`, `note`; optional `id` | One per command, after the documents it changed. |
| `ask` | `ask`, `message`, `confirm`, `command`; optional `also`, `alternatives` | A question before something is lost. The `ask` names are vocabulary. |
| `error` | `message` | |
| `notice` | as today | Something for the user; answered by `noticeAnswer`. |
| `reset` | | Start the documents over (engine change, reboot). |
| `telemetry` | `step`, `pattern`, `playing`, `recording`, `valid` | The transport. Instruments add members (`songRow`, ...). |

The machine document's generic members: `schema`, `version`, `contract`, `profiles` (new), `lifecycle`,
`lifecycleText`, `input`, `capabilities {engine, label, about, can, reasons, values}`, `engines[]`, `history {undo,
redo, undoCount, redoCount}`, `clipboard`. Instruments add members (`kit`, `pattern`, `songMode`, ...).

Commands, page to back end: `{op, id?, g?, force?, ...args}`. The envelope owns these ops: `ready`, `undo`, `redo`,
`set {kind, doc}`, `trialBegin`, `trialEnd {keep}`, `engine`, `noticeAnswer`.

`lifecycle`: the envelope owns `loading`, `ready`, `unsupported`. The `elektron` layer adds `missing`, `booting`,
`animating`, `hwConnecting`, `hwLost`. A page maps every value of its composed schema (the existing LIFE check).

### 5.2 The rules (the envelope's, binding on every layer)

1. **Open for readers, closed for commands.** As today. Every writer object says `additionalProperties: true`; every
   command variant says `false`. A back end tests its own output against its composed schema closed again.
2. **One integer a layer.** Adding an optional member, a message type, an op or an enum value keeps it. Renaming,
   removing or re-meaning anything raises it.
3. **`profiles` says what is spoken.** The machine document carries `profiles: {"desk": 1, "host": 1, "grid": 1,
   "elektron": 1, "md": 2}`. `contract` stays as it is (the composed version) so shipped pages keep working. A machine
   document without `profiles` means the legacy set: `{desk: 1, host: 1, grid: 1, elektron: 1, <model>: contract}`.
4. **A page checks before it draws.** A page declares the layers and versions it needs. If the back end lacks one, the
   page shows "this page needs grid 2" as an `unsupported` lifecycle, and sends nothing.
5. **Unknown is not an error for readers.** A page ignores a message type it does not know. A back end refuses an op
   it does not declare, with `result {ok: false}`, never silently.
6. **Names do not collide.** A shared layer's word means the same thing on every back end. A word that means something
   else on one instrument is that instrument's, with its own name. No aliases. Instrument-only message types and ops
   keep their names when they are already shipped (`syxPreview`, `multiMap`); new ones take the instrument's prefix
   (`xoxClock` already does).
7. **The page never sees bytes, the back end never sees the page's state.** As today.
8. **Instruments may tighten, never loosen.** An instrument's `lock` may say `t: 0..5` where grid says `t >= 0`. It may
   not add a required argument to a grid op or change its meaning. The check tool proves this (5.6).

### 5.3 The transport (spec only)

`transport.md` says how a batch travels, apart from what it says: a page sends an array of commands; the back end
sends `gm.recv(messages, seq)`; a repeated `seq` is dropped; a dev host takes batches through `window.gmDev`. Each shell
implements it its own way (JUCE 7 navigations, WebView2 `postMessage`, Linux files, xox's Worker, a test harness).
The spec is short and has no code. `deskBridge.js` stays in the editors; xox already has its copy under VENDOR.md.

### 5.4 The grid layer (`grid`, shared by every step instrument)

The grid is the product the testers praise: tracks of steps, lock lanes beside a picker, songs and chains. It is what
xox copied and what the groovebox wants. It gets its own layer.

The pattern core (members every grid pattern has; instruments add theirs):

```json
{ "length": 16,
  "tracks": [ { "trigs": [0, 4, 8], "accent": [4], "slide": [] } ],
  "locks": [ { "track": 0, "param": 12, "steps": [[4, 100]] } ] }
```

This is the MD's layout (data-contract.md 4.1) cut down to what every grid instrument has. The MM's per-track lock
lists differ; whether they fit this core or stay the MM's own is part of migration step 4.

Grid ops: the ones MD, MM and xox already share in meaning: `steps`, `trig`, `lock`, `accent`, `slide`, `swing`,
`length`, `speed`, `rotate`, `clearSteps`, `clearLane`, `clearLocks`, `copySteps`, `copyStepsTo`, `pasteSteps`,
`doublePattern`, `mute`, `soloSet`, `select`, `play`, `stop`, `pause`, `resume`, `playFrom`, `tempo`, `chain`,
`chainClear`, `seqMode`, the song rows (`rowSet`, `rowInsert`, `rowDelete`, `rowMove`, `copyRow`, `pasteRow`) and
the pattern library (`patCopy`, `patPaste`, `patCopyTo`, `patClear`). The exact list comes out of migration step 4:
an op enters grid only when its MD and MM schemas agree after tightening is taken out. The rest stay instrument ops.

**Lanes, not parameter indices.** The member names stay the MD's (`param` in a document, `i` in the `lock` op), but
their value becomes a lane id that the catalogue declares, not a firmware position. The catalogue lists the lanes:

```json
{ "lanes": [ { "id": 12, "label": "AMD", "group": "EFFECTS", "min": 0, "max": 127, "lockable": true } ] }
```

For the MD the lane ids are its indices 0..23, so its documents do not change. xox's lanes are its device map's.
The groovebox's lanes come from its processors. Grid 1 says a lane id is an integer. Grid 2 may allow a string id
(`"filter.cutoff"`) with `unit`, `curve` and `display`; that waits for the groovebox (decision 3).

Limits are data too: the catalogue says `tracks`, `maxLength`, `maxLocks` (or `null` for none). The page reads them;
the composed schema tightens the ranges for the static check.

### 5.5 The instrument layers (per back end, in its own repo)

| Layer | Where | Holds |
|---|---|---|
| `elektron` | this repo | `romInstall`, `romInfo`, `lcd`, `machineMemory`, the SysEx panel (`syxPreview`, `syxProgress`, `syxExport`, `syxExportInfo`, `syxReset`, and their ops), `memoryFactory`, `memoryKeep`, `recheckFirmware`, the firmware lifecycle values |
| `md` | this repo | `md-desk/kit`, `global`, `song`, `workingKit`, `samples`; machines, `masterFx`, LFO, groups, the sampler ops; the MD's asks; tight ranges on grid ops |
| `mm` | this repo | `mm-desk/*`, arp, multi map, MIDI tracks, poly, the MM's asks |
| `xox` | xox repo | device maps (`mapEdit`, `mapRename`, `mapDelete`, `device`), conditions (`cond`), lock trigs, retrigs (`rtrg`), note length (`nlen`), track play (`trackPlay`, `trackFeel`, `free`), `prob`, `feel`, `fill`, ports (`portSync`, `xoxOutput`), `xoxClock` |
| `groovebox` | its repo, later | processors, chains, buses, sample memory, its kit |

Generated stays generated. The MD and MM layers are still written by `mdDeskTest --write-schema` and
`mmDeskTest --write-schema` from the C++ tables. What changes is that the generated file `$ref`s the shared layers and
the composed file is what tests read.

The `host` layer is deskHost's table today (engine, MIDI learn, audio, menu, zoom, drop, notes; not the ROM rows) plus
its messages (`audio`, `audioLevel`, `openAudio`, `learn`, `editorMenu`, `zoom`, `drop`, `dragFiles`, `cpuLoad`,
`outputLevel`, `audioRun`, `host`, `midiIn`, `midiHeld`). Its ROM rows move to `elektron`. The note intent
(`noteOn {t, vel, pitch}`, `noteOff {t, pitch?}`) is host: what a pitch means is the back end's.

### 5.6 How a back end proves conformance

All three kinds of proof are data in desk-contract, plus the instrument's own data in its repo. The tools are small
and dependency-free (`page_contract_check.py` already validates without a schema library).

1. **Schema.** `tools/compose` writes the back end's flat schema from its layers. `tools/check refines` proves rule 8:
   every grid and host op is present with the same argument names, ranges inside the shared ones, no new required
   argument. Each back end validates everything it publishes against the composed schema closed again (the editors
   already do; xox adds it to its node tests; the groovebox from day one).
2. **Intent cases** (page to back end). `intent-cases.json` splits in two. Grid cases live in desk-contract: base
   documents, a command, the grid paths that change. They name only grid-core paths, so the same case runs on the MD
   core (`mdDeskTest`), the MM core (`mmDeskTest`), xox's host (node) and the groovebox. Each back end supplies a
   small fixture that turns the shared base into its own documents. Instrument cases stay in their repo, in today's
   form.
3. **Scenarios** (back end to page). A scenario is a JSON file of message batches with a note of what the page should
   show:

   ```json
   { "about": "an edit refused while the machine loads",
     "profiles": { "desk": 1, "grid": 1 },
     "batches": [ [ { "type": "machine", "doc": { "lifecycle": "loading", "...": "..." } } ],
                  [ { "type": "result", "op": "lock", "ok": false, "errors": ["loading"], "note": "" } ] ],
     "expect": [ "the LCD says LOADING", "the lock is not drawn" ] }
   ```

   Every batch validates against the composed schema. The page preview (`feat/page-preview`) replays them, which
   reaches the states the stub host cannot (loading, busy, refused, error; DEV-CYCLE.md's "Limits"). Page tests replay
   them headless. A back end can record its own transcript as a scenario (deskStubHost already speaks batches on
   stdout), so a shared scenario is evidence that two back ends say the same thing. Generic scenarios (lifecycle,
   asks, refusals, reset) live in desk-contract; instrument ones in their repo.
4. **Pages.** `tools/check page` is today's `page_contract_check.py`: every op sent is declared, every capability,
   lifecycle value and message type matched both ways, now against the composed schema. xox runs it on its own pages.

A back end conforms to a layer when all four pass for that layer. That is the whole definition.

### 5.7 Where shared page widgets live

Not in this first step. The contract moves first; widgets follow only when the contract has held for a release.

- Now: the shared page files stay in `skins/shared/` (both editors) and go to xox by copy under VENDOR.md, as today.
- Later: desk-contract gets a `page/` folder for files that are instrument-free by check: they read only envelope,
  host and grid members and send only those ops (`tools/check page --layers desk,host,grid` proves it). Candidates:
  `deskModal`, `deskMenu`, `deskKeys`, `deskCaps`, `deskOverlay`, `deskDocs`, `deskSelect`, `deskBridge`. The
  grid workspace itself (`mdDeskSeq.js` and the files around it) moves last, after lanes come from the catalogue
  (5.4); today it reads the MD's machine tables.
- Never: a runtime package both products import. Code is copied and pinned, data is shared. PARITY.md's rule stands.

### 5.8 How each repo takes desk-contract

Vendored, pinned, checked. Not a git submodule: this repo keeps submodules for unmodified third-party code only.

- The folder `doc/contract/` (here) or `contract/` (xox) holds a copy at a tagged version, with `VERSION` naming the
  tag and its commit.
- A sync script copies it in; `--check` fails when the copy differs from the tag (like the skin sync scripts).
- A change to a shared layer is made in desk-contract first, tagged, then pulled into each repo in its own commit.

## 6. The licensing seam

**This section is a set of questions for Radek, not legal advice.** If the answers matter commercially, a lawyer
should read them.

The plan: desk-contract is MIT. MIT code can be included in the GPL-3 editors and in the closed xox. What goes into it
must be Radek's alone, or new.

What goes in, and why it should be his:

| What | Where from | Author check (`git log --format='%an <%ae>'`, 2026-10-14) |
|---|---|---|
| envelope, host and grid schemas | written new, by hand, from what the MD and MM schemas already say | the source schemas: radekdymacz only |
| rules, transport spec | `data-contract.md` sections 2 and the bridge notes | radekdymacz only |
| `tools/check` | `page_contract_check.py` | radekdymacz only |
| grid intent cases | `intent-cases.json` | radekdymacz only |
| generic scenarios | new | |

Questions the audit must answer before the first MIT tag:

1. **Git authorship is not origin.** A file with one author can still hold lines copied from elsewhere. Were any
   lines in these files taken from Joe Landers' or dsp56300's code (for example `mdLib`, `mdautomation.h`, `baseLib`),
   or from upstream docs? `deskWire` includes `mdLib/mdautomation.h` (Joe Landers and Radek) and `elektronData`'s corpus
   tests include `baseLib`; neither goes into desk-contract, but the audit should confirm nothing of theirs is in the
   files that do.
2. **Generated schema.** Today's `$defs/command` is written by `mdDeskTest`, a program in a GPL repo, from tables
   Radek wrote. Is a schema generated from his own tables his to relicense? The plan avoids the question for the shared
   layers by writing them by hand in desk-contract. The MD and MM layers stay GPL with the editors, which is fine
   because nobody else needs them.
3. **Elektron's facts and names.** Machine and parameter names (`TRX-BD`, `AMD`), firmware ranges and memory addresses
   come from Elektron's manuals and firmware. They belong in the `md`, `mm` and `elektron` layers only, never in
   desk-contract. The groovebox's ROM-derived numeric tables (DIRECTION.md, "private ROM-derived tables") must never
   reach any contract or descriptor.
4. **Commits from the work address.** A few commits on these files are by `radek.dymacz@databarracks.com` (for example
   one each on both schemas, `page_contract_check.py` and `deskHost`). Does anything in the Databarracks contract give
   Databarracks a claim on work done with that address? If unsure, those commits can be rewritten in desk-contract by
   writing the shared layers new.
5. **AI-assisted work.** Much of the code was written in Claude Code and Codex sessions; one commit carries a Copilot
   co-author trailer. Radek decides how he treats ownership of assisted output; the audit should at least list it.
6. **The GPL copies stay GPL.** Relicensing his own files as MIT for desk-contract does not change the editors: what
   was published under GPL-3 stays available under GPL-3. Both can be true.

## 7. Migration, in small steps that never break the editors

Each step is its own branch, merged after the editors' usual checks. Steps 1 to 3 change no shipped byte.

1. **Create desk-contract** (private, `FutureNativeAudio/desk-contract`, MIT). Write `envelope` and `host` schemas by
   hand from the MD schema's shared parts, `RULES.md` (5.2), `transport.md` (5.3). No consumer yet.
2. **Prove the editors already conform.** Vendor it into `doc/contract/` with its sync script. Add a test here: the
   MD and MM schemas refine `envelope` and `host` (rule 8). It reads only; it fails if a shared member drifts.
3. **Move the check tool.** `page_contract_check.py`'s logic becomes `tools/check` in desk-contract; this repo's sync
   scripts call the vendored copy. Same checks, same output.
4. **Grid layer.** Diff the 116 shared MD/MM ops; the ones that agree after tightening go into `grid`. Lanes enter the
   catalogue with the MD's indices as ids (no document changes). The machine document gains `profiles` (additive;
   `contract` stays 2). The generated MD and MM schemas `$ref` the layers; the composed files replace today's in the
   tests. Pages and C++ behaviour unchanged.
5. **Split the intent cases.** Grid cases move to desk-contract; `mdDeskTest` and `mmDeskTest` run both sets.
6. **Scenarios.** `feat/page-preview` gains `?scenario=<file>`; first scenarios for the states the stub cannot reach.
   Generic ones go to desk-contract.
7. **xox conforms.** Vendor desk-contract; write `xox.schema.json` for its own words; validate `xoxHost.js` output and
   run `tools/check page` in its node tests; run the grid intent cases. Then retire the fake MD parts it no longer
   needs (`md-desk/machines`, stub `masterFx`), one at a time, as its page stops reading them.
8. **Groovebox, when it reaches DIRECTION.md step 4.** It speaks `desk`, `host` and `grid` from the start, with its
   own layer. If it needs string lane ids, that is grid 2 (decision 3), added beside grid 1.

## 8. What we explicitly do not do

- No shared runtime library across the GPL and closed products: no npm package, no C++ library. Data and checks are
  shared; code is copied under VENDOR.md.
- No renames of shipped ops, members or message types to make them look generic. MD names stay; new shared words are
  added.
- No descriptor-only contract (candidate C). Commands stay statically declared and checked.
- No JSON-RPC, no handshake protocol, no change to `gm.recv` or the bridge. `profiles` in the machine document is the
  whole negotiation.
- No Elektron names, ranges or ROM-derived data in desk-contract.
- No git submodule for desk-contract.
- No public release of desk-contract yet. It can be made public later without changing anything.
- No widget extraction before the contract has held for a release.
- No work on the groovebox's contract before it has a playable engine.

## 9. Risks

- **Extraction drift.** Hand-written shared schemas could disagree with the generated ones. Step 2's refinement test
  catches it on every build.
- **Two places to change.** A shared op change now means desk-contract first. That is the point, but it is slower. It
  should be rare: the shared layers are the stable part.
- **xox's page is the MD page.** Its fake MD documents cannot go until its page reads lanes and limits from the
  catalogue. Step 7 is gradual for that reason.

## 10. Summary

One small MIT repository holds the envelope, the plug-in shell layer, the step grid layer, the rules, the transport
spec, the check tool and shared conformance data. Each instrument keeps its own vocabulary in its own repo and composes
it on top. The editors keep generating their layers from C++. The machine document says which layers it speaks.
Schema, intent cases, scenarios and the page check prove conformance for each back end the same way. Nothing shipped is
renamed.

## 11. Decisions for Radek

1. **Where the contract lives.**
   - (a) A new private repo `FutureNativeAudio/desk-contract`, MIT, vendored and pinned into each product.
   - (b) Stays in this repo; releases attach a versioned bundle.
   - **Recommendation: (a).** It is the only option that un-braids the contract from the GPL repo and from the editors'
     release cadence, and lets xox stop pretending to be a Machinedrum.

2. **The licence and the audit.**
   - (a) MIT for desk-contract, with the shared layers written new by hand, after a short audit of section 6's questions
     (history of the source files, the work-address commits, assisted code). A lawyer reads the answers if the
     products' revenue makes it worth it.
   - (b) Dual-license existing files (schemas, `page_contract_check.py`, `deskBridge.js`) as GPL-3 and MIT and copy them
     as they are.
   - **Recommendation: (a).** Writing the shared layers new removes the generated-from-GPL question and the
     work-address commits at once. It is a few hundred lines of schema.

3. **How a lock names its parameter.**
   - (a) Grid 1 keeps integer lane ids, declared in the catalogue (the MD's 0..23 unchanged). String ids with units and
     curves come as grid 2 when the groovebox needs them.
   - (b) String ids from the start, with the MD mapping its indices to names.
   - **Recommendation: (a).** No shipped document changes, xox already fits, and the groovebox's real needs are not known
     yet. Grid 2 is additive beside grid 1.

## 12. Decided (Radek, 2026-10-14)

1. **Home: this repo.** The contract stays in `radekdymacz/mdmm`, in one folder of its own. Each editors release attaches a versioned contract bundle. xox-plocks and the groovebox take a pinned bundle. Section 5.8 and steps 1-3 of section 7 change to match: no new repo.
2. **Licence: dual licence, copy.** The contract files Radek wrote alone get GPL-3 plus MIT and are copied as they are. Before a file is marked dual, its history is checked: one author (`git log --format='%an %ae'`), no lines from upstream or third-party files, no generated output of GPL code tables. A file that fails the check stays GPL only and its part is written new. The questions in section 6 stay open for a lawyer if revenue justifies it.
3. **Parameter ids: numbers now.** Grid 1 keeps integer lane ids declared in the catalogue (the MD's 0..23). String ids with units come as grid 2, when the groovebox needs them.
