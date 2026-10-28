# Discord bug-fix handoff, 2026-10-21

Radek asked to fix the reports in Discord #bugs and #general using subagents, then approved committing, pushing and CI. At the usage limit he explicitly requested **commit, push, merge and document**. Merge to `main` is authorized while the remaining CI is pending. No tag, public release, Discord post or site deployment is authorized by this handoff.

0.8.0 was released on 2026-10-20. This is the next bug-fix batch. The Ultralight experiment remains discarded: keep WKWebView on macOS, WebView2 on Windows and WebKitGTK on Linux. The Native Groovebox 16-track discussion belongs to another project.

## Code and branches

- Working branch: `codex/continue-0.8.0`.
- CI branch: `release/0.0.0-ci-test`.
- Latest implementation commit: `7843b80b8192e10710e2f9cf7dc22794d5ac5fc8`.
- Initial batch: `d508de607`; generated guide/keymap repair: `2149340fe`; check-selection expectations: `4e519b2a7`; page-test/help repairs: `db7ac6512`; LFO journey isolation: `21417be13`; Linux native-window visibility repair: `7843b80b8`.
- `origin/main` had one separate published-release site commit, `434598b1b`. Preserve it when merging; its files do not overlap the bug-fix batch. Use a normal merge and fast-forward push, never force-push.
- All edits, generation and source review were local. **No local tests or builds were run.** Validation is CI-only under CLAUDE.md.

## CI evidence and outstanding runs

Statuses below are a snapshot at handoff, not a claim that a still-running pipeline passed. Read the linked runs before resuming.

| Run | Commit / purpose | Evidence at handoff |
|---|---|---|
| [39555829972](https://github.com/radekdymacz/mdmm/actions/runs/39555829972) | `21417be13`, full pipeline | Setup green; all 34 page unit tests and 340 browser journeys passed, 3 existing skips; core, all three OS unit suites, transport diagnostics and ASan/UBSan green. Linux and macOS packages built; macOS 15 startup/plug-in checks green and unsigned installers produced. Linux startup tests failed as described below. Windows LTCG packaging still running; macOS 14 delayed at checkout. Firmware/package stages cannot validate the batch through this failed run. |
| [39558191948](https://github.com/radekdymacz/mdmm/actions/runs/39558191948) | `7843b80b8`, full pipeline with Linux repair | Pending behind the earlier release-branch run. This is the full validation to follow for the implementation. |
| [39557704668](https://github.com/radekdymacz/mdmm/actions/runs/39557704668) | `21417be13`, focused firmware | Build passed; firmware tests running. Selection: `^(mmEmptyResetFirmwareTest|stackedLfoMmSequencerFirmwareTest|mdAutomationFirmwareTest)$`. Does not replace the full pipeline. |

The merge push to `main` also starts CI. Find its run by the resulting merge SHA. The existing CI branch can remain at `7843b80b8` while its full run finishes; the handoff documentation and main's website release files do not alter the editor binaries.

Earlier failed runs were repaired, not ignored:

- `39553379483`: missing keymap/guide exports. Regenerated them; removed the banned guide word. Do not commit local PDF-dependent changes to `site/public/guide/index.html`.
- `39553671577`: check-map self-test expected the old journey list. Added the required `mm-lane-*` selection to its expected lists.
- `39553852220`: ghost-baseline HTML regex stopped at `>` inside a quoted tooltip; corrected exact-cell assertions. Added missing MD KIT handle help and the explicit MM-only lock-menu parity reason. All assertions remain.
- `39554513796`: 339 journeys passed, one LFO test failed because the new LF3 FILTER persistence step left a third source active in the later two-source test. The test now routes LF3 back to PTCH through the UI and checks that state; the original two-source badge assertion remains. The next run passed all 340 journeys.

### Linux failure and repair

Ubuntu 22.04, Ubuntu 24.04 and SteamOS startup checks found two distinct issues:

1. Machinedrum rendered correctly, but OCR omitted its condensed heading. Screenshots were inspected. The smoke test now reads the normal-font instruction on the same card, while AT-SPI still requires the exact machine heading. It still requires actual visible rendering.
2. Intentional WebKit/helper termination logged the native error and stopped the receiver thread, but the fallback was covered by a white or stale native browser window. JUCE Linux `checkWindowAssociation()` was empty; XEmbed does not follow JUCE component visibility. `7843b80b8` detaches the XEmbed child when the browser is hidden and reattaches when shown, retaining the browser for slow-start recovery. Fallback OCR, host survival and EOF assertions are unchanged. **Await the new CI result.**
3. Run 39558191948 (`7843b80b8`): the XEmbed fix works. The failure screenshots of all four checks on Ubuntu 22.04 and SteamOS show the native error in full and the host alive; the MM standalone screenshot shows its card. Only OCR failed: Tesseract read the light-on-dark heading "The editor page could not start." as "[=o Cla OD" and "Click here" as "ick here". The smoke script now also reads a 3x grey and a 3x inverted grey copy of the same screenshot (`ocr_screen`); the asserted texts are unchanged. **Await the next CI result.**

The original report is CachyOS latest / Bitwig Studio 6. Its exact environment and cause remain unverified. Ubuntu/SteamOS and the minimal VST3 test host are not a reproduction of that setup.

## Implemented fixes and limits

The individual reports and source links remain in [BUGS.md](BUGS.md); feature requests remain separate in [IDEAS.md](IDEAS.md). Do not close all reports because one suite is green.

| Reports | Work in this batch | Remaining evidence |
|---|---|---|
| B-027, B-178 | MM working-kit expectations remain protected while CC/NRPN edits are queued. `MmStudioLink` explicitly resends restored values even when its parameter cache already holds them. Production-port firmware coverage for AMP VOL, LEVEL and LF3 PAGE; LF3 FILTER persistence journey. | Delayed-delivery unit and page journey pass. Await production-port firmware result; the reporter's whole project is not reproduced. |
| B-173 | `mmConvert.js` respects the MIDI note mask instead of exposing residual pool notes as active edits. Distinct synth/MIDI pitch/chord regressions pass. | The reported all-pitches-collapse case still needs the original pattern and edit. |
| B-174 | Replacement-name regression coverage. | No confirmed defect; partial imports intentionally retain untouched slots. Need exact import/reproduction. |
| B-175 | New `mmEmptyResetFirmwareTest` uses the actual `SyxWork<mmDesk::Desk>` coordinator, dirties K01/K06, resets from each, compares stored/working K01 and switches away/back. | No speculative production reset change. Read the focused firmware result. |
| B-176 | Firmware case logs native GND-SIN assignment defaults. AMP VOL remains 100. | Native assignment is not NEW KIT proof; hardware VOL 64 is not established. Track LEVEL is separate. |
| B-177 | Fixed Perform keyboard width at C6 with constant 28-white-key geometry; top range remains notes 84..127. Split bands/dragging use the same geometry. | Unit/page coverage passes; no out-of-range notes introduced. |
| B-169 follow-up | LFO PAGE, DEST, TRIG and WAVE now expose Learn targets and feedback, for all three LFOs. | All 12 choices pass the Learn journey without editing the sound/opening a picker. Original unspecified report may include other controls. |
| B-181 | Existing-lock Shift gestures remain slides despite vertical jitter; dragging an existing slide cannot paint locks underneath. | Unit/page journey passes; original playback-specific report unconfirmed. |
| B-184 | Explicit KIT handles in both editors; step columns target locks even at the kit baseline. Relative drag and keyboard arrows. | MD/MM baseline lock-versus-kit journeys pass. |
| B-183 | Right/Ctrl/Cmd press no longer paints MM locks; direct Clear lock menu also handles ghost locks. | Page coverage passes; exact reported pattern may reveal another read-back defect. |
| B-180, B-182 | ARP ON/OFF state and keyboard control clarified; accurate trigless/pitchless/note-off descriptions. | Page journeys pass. No inverted stored bit or specific outline defect was established. |
| B-179 | Explain SID's chord requirement; KEY/ADD single-note preview coverage. | Exact mode/pattern playback report unconfirmed; no speculative firmware change. |
| B-161 | Added real internal-sequencer stacked-LFO firmware scenario alongside existing MIDI-note case. It installs kit/pattern via SYSEX RECV and checks accepted dumps, readback and audio onsets. | Await `stackedLfoMmSequencerFirmwareTest`; no DSP/timing behavior changed. |
| B-172 | Bounded helper startup/shutdown, loader/runtime diagnostics, SIGPIPE protection, receiver EOF fix, termination-to-fallback, safe fork/exec and descriptor lifetime; additional XEmbed visibility fix above. | Await all new Linux smoke checks. Exact CachyOS/Bitwig report remains open. |

## Resume from here

1. Read the three runs above and the new main merge run. Use one background `gh run watch <id> --exit-status`; read completed job logs with `gh api repos/radekdymacz/mdmm/actions/jobs/<id>/logs --allow-escape-sequences` when another job still runs.
2. Repair actual failures, keep the assertions, commit/push under the existing authorization, and obtain a full green run on the implementation before calling it validated. Do not rerun local tests/builds without a new explicit request.
3. Inspect the new Empty Reset/default, production CC delivery and stacked-LFO firmware results. A failing production regression needs investigation, not a weakened expectation.
4. Update BUGS.md with verified results and remaining reproduction requirements. Many entries still say CI pending because the full validation is unfinished.
5. Hand-test packages come from CI. Do not publish/tag or send Discord replies without the applicable authorization. No external messages were sent during this work.

Local evidence (temporary, not committed): `/private/tmp/mdmm-ci-39555829972-watch.log`, `/private/tmp/mdmm-ci-39557704668-watch.log`, `/private/tmp/mdmm-page-119075391012.log`, `/private/tmp/mdmm-linux22-119079484875.log`, `/private/tmp/mdmm-linux24-119079484774.log`, and screenshots under `/private/tmp/mdmm-linux-repair-22` and `/private/tmp/mdmm-linux-repair-24`. CI artifacts are the durable source. Original Discord roundup JSON is under `/private/tmp/mdmm-discord-roundup-20261021`; no affected SysEx pattern was attached there.
