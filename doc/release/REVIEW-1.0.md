# Review before 1.0: what a stable, good 1.0 needs, and where we stand (2026-11-01)

Written from main at a217caa4b, as a product and engineering review. Sources: VISION.md, DESIGN.md, README.md,
doc/ROADMAP.md sections 6 and 7, PLAN-0.9.md, HANDOFF-0.9.md, BUGS.md, IDEAS.md, doc/features/*.json, doc/guide/,
the release notes 0.1.0 to 0.8.1, CI.md, DEV-CYCLE.md, FOUNDATION.md, DESIGN-audio-lock.md, SIGNING.md, LINUX.md,
WINDOWS.md and the code where a claim needed checking. No build, no test run. The earlier code review of
2026-10-15 (DESIGN-REVIEW-2026-10-15-1.0.md) is not repeated; its format freeze is done and counted here as done.

Verdicts: **good** (holds, proved), **gap** (missing, known), **risk** (unproved or depends on something outside CI).

## Executive summary

1. The product is feature complete against both manuals: MD 294 of 306 applicable rows done, MM 366 of 378, every done row proved by a firmware journey. That is better than most paid editors.
2. The engineering base is strong: a frozen project format, bit-exact speed-ups behind one switch, the audio thread off the device lock, actions pinned by SHA, ROMs reaching CI only by OIDC.
3. Stability is proved on one platform only: macOS on Apple silicon. The Intel slice is built and never started. Windows and Linux are started by CI, never heard or used by a person.
4. The ROADMAP gate (section 7) still has three open rows: hardware MIDI on a real machine, a signed macOS build, and the stability measurement on every platform. None of them is code work.
5. The firmware E2E is the best proof we have and it is flaky: five "seen once" journeys, one order dependence (B-160) and one parked bug (B-196). A gate that is sometimes red for no reason is a gate people learn to ignore.
6. Half of the open user bugs stall for lack of a log (B-033, B-035, B-036, B-119, B-158, B-172, B-201). One "Save diagnostics" zip would move more bugs than any single fix.
7. The correctness method of the last month (probe the firmware's LCD and bytes, then fix the table) found real encoding errors (B-148 to B-151, B-176, B-189, B-190). The bytes still marked "unknown" need the same pass before the formats are promised.
8. Free-software health is good on licence and ROM rules, thin on the contributor path: no CONTRIBUTING, issues off, one maintainer holding every account.
9. Nothing in the backlog needs to be built for 1.0 beyond what 0.9 holds. 1.0 is a proof and packaging release, not a feature release.
10. Four of the five decisions at the end are Radek's alone: the Apple account, the hardware test, the platform claim and the lock budget.

## 1. Stability

| Area | Evidence | Verdict |
|---|---|---|
| Audio thread and device lock | DESIGN-audio-lock.md status: steps 1, 2, 3, 6 built; `mdmm-rt-check.sh --lock` 0 waits over 1 ms on MD and MM, quiet and with 24 load loops (2026-10-16). Edits go through a command queue; no thread but the audio thread takes the lock while editing | good |
| Lock holds off the audio thread | Design limit 1 ms (`MDMM_LOCK_HOLD_BUDGET_MS` default); CI runs the firmware tests at 10 ms (mdmm-firmware.yml line 257). Nightlies measured 10.4 to 12.5 ms holds (B-199, the factory-flash copy in `mdPluginProcessor.cpp:717`). A 10x widened budget is a measurement that no longer measures the design | risk |
| Watchdog | `mdhardware.cpp` has the scheduler watchdog from fix/1.0-realtime; a stuck machine goes silent instead of freezing the host | good |
| Crashes | No crash handler, breadcrumb or crash file in the shipped editors (the only `SIGSEGV` references are in the firmware tests). A crash in a DAW leaves the host's report and nothing of ours. Start-up logs exist (`editor-*.log`, Open Log Folder, Help > Show log) | gap |
| CPU | B-005 open: M1 testers see 50 to 60 % of a core per editor, both editors together about 60 % in Live. The lever work is done as far as bit-exact goes (RESEARCH-emulation-cpu.md); more is opt-in or after 1.0. The guide does not say what to expect | risk |
| State save and restore in DAWs | pluginval strictness 5 on every VST3 and AU on three systems (state, buses, rates, block sizes); `mdProjectStateRestoreTest`; FOUNDATION "What 1.0 promises to read": chunk rule, lenient setup codec, memory file major/minor. The project-state load hold was shortened in 0.8.1 | good |
| Multi-instance | `mdMachineMemoryFirmwareTest` session 3m runs two instances saving at once; `mdStateTest` two UW instances keep separate flash; the 68k opcode table race fixed in 0.8.1. Two editors in one DAW session is still only a tester's word | good, DAW case risk |
| Platform: macOS Apple silicon | Every firmware test, every journey, the perf gate and auval run here (macos-15) | good |
| Platform: macOS Intel | The universal package is built (`arm64;x86_64`); nothing ever starts the x86_64 slice: no macos-13 runner, no `arch -x86_64` start test, no Intel tester named in BUGS.md. README promises macOS 12 on Intel | gap |
| Platform: Windows | CI builds LTCG, starts standalone and VST3 in a clean runner, reads the page, runs pluginval. Nobody hears it. B-156 (crackle on step entry, 0.5.1), B-036 and B-035 are "not reproduced, no Windows machine here". No Windows log since 0.5.1 | risk |
| Platform: Linux | CI starts the packages on Ubuntu 22.04 and 24.04 under Xvfb and in a SteamOS container. B-201 (Fedora KDE, NVIDIA): fix on main, not verified by the user; B-172 (Bitwig on CachyOS) open. Wayland, NVIDIA and Fedora are not in CI. The B-201 fix adds the native card after 15 s without a paint, so a blank window now says something | risk |
| Hosts | Nothing in CI is a real DAW. Radek's hand test (TEST-0.8.md, 90 minutes, Live and Logic) and tester reports (Live, Bitwig) are the only host evidence. Reaper, Cubase, FL Studio, Studio One: no report at all | risk |
| The firmware E2E as a gate | Last full CI 41305887640 green except one journey. Open "seen once" entries: B-193, B-194, B-198, B-200, B-202; B-160 (order dependence) open; B-196 parked; `mm-wire-cc` and the import journeys run `alone: true`. HANDOFF: "a full E2E is the proof that counts; focused runs miss cascades" | risk |
| Sanitizers | asan and ubsan core builds on `release/**` only (mdmm-ci.yml stage 2) | good |
| The gate as written | ROADMAP section 7 asks for no overrun at 64, 128 and 512 frames at 44.1 and 48 kHz on macOS arm and Intel, Windows and Linux. Today only the macOS arm numbers exist, and only from the local gate on Radek's Mac | gap |

What CI proves: the editors build, start, show the page and load in a plug-in host on three systems; every ROM-free unit test; every firmware test and journey on macOS arm; the project state survives pluginval; the lock budget as widened. What only a person can prove: sound without drop-outs on any system, a real DAW, Intel, Wayland, NVIDIA, Bluetooth and USB MIDI devices, and a signed download opening on a clean Mac.

## 2. Correctness against the hardware

| Area | Evidence | Verdict |
|---|---|---|
| Feature rows | md.json: 294 done, 9 partial, 3 missing, 16 hardware only of 322. mm.json: 366 done, 11 partial, 1 missing, 34 hardware only of 412. Every partial or missing row carries a reason; the "not-needed" ones are honest (FUNCTION key, LEDs, soft reset) | good |
| Rows proved by a journey | unproved-mm.md: 0 of 363. unproved-md.md: 2 of 294 (MD-193, MD-199), but HANDOFF names new journeys `md-sampler-export` and `md-sampler-ram-rom` for exactly those rows: the generated file is stale. Rule since 2026-10-30: done means a firmware journey, never a unit-test exemption | good, regenerate |
| E2E evidence | e2e-md.json and e2e-mm.json are from 0.5.1 (2026-10-13, bdf983d6b). Wave 9 of PLAN-0.9 refreshes them; not done | gap |
| Encoding found wrong lately | B-189 OJMP written to the wrong bits (found in review, proved by `mmOjmpLayoutFirmwareTest`); B-190 kit name bytes shifted; B-176 and B-166 new-kit defaults; B-148 to B-151 signed and enumerated values made up from the manual. Each was fixed by reading the firmware (LCD probe, `mmEditorProbeFirmwareTest enums`, `mmNewKitDefaultsFirmwareTest`). The method works; it was applied where a tester pointed | good method, coverage gap |
| Bytes still unknown | ROADMAP F3: MM global bytes 0x0d to 0x11, 0x30 to 0x35, the six CONTROL bytes; MD global CONTROL bytes; the song transposes' range (B-167 "if a tester finds the machine stops sooner"); the data contract carried a "meaning unknown" member until B-189 showed it was a real bit. 1.0 promises the formats, so an unknown bit that turns out to be a field is a 1.1 migration | risk |
| Firmware behaviour kept | B-133 (live recording after a sample load, an OS 1.63 bug) is kept as the hardware does and documented. Right call | good |
| Bit-exact speed-ups | Goldens 24 of 24, DSP state hashes, the umbrella switch; L3 (changes MD timing) off by default; the MD quantum change of B-161 re-recorded 18 goldens and is named in the notes | good |
| Sound against a real machine | No recording of a real MD or MM beside the emulator for the same pattern exists in the repo or the docs. B-188 ("played nonsense", not reproduced) is the only data point. VISION says "it sounds and behaves like the box" | risk |
| Hardware MIDI | Never run against a real machine (ROADMAP "To verify", start.md "(beta) ... only been tested against the emulator"). The peer in `mmDeskFirmwareTest hw` is a second emulated Monomachine. Trig in A/B and local control are marked "not verified" on the GLOBAL page. B-195 found the emulated MM hangs for good on a status poll during a 0x5D dump; whether a real MM does is not measured, and the editor avoids the case now. F1 lists the checklist | gap, the gate's own row |
| Windows MIDI | B-037 causes 2 and 3 fixed in 0.4.0, cause 1 "for the guide"; no Windows MIDI report since | risk |

## 3. Core user journeys

| Journey | Built | Proof | Verdict |
|---|---|---|---|
| First start, no ROM | A start-up card with a chooser; drop on macOS; the ROM folder named | CI start tests on three systems read "firmware needed" through the accessibility tree; `mdSessionNoRomManageFirmwareTest` | good |
| Load the ROM, first boot | LOAD ROM in the engine menu; the MD prepares its factory flash and reboots in process | Firmware tests and every journey start this way from a fresh data root | good |
| Edit kits, patterns, songs, chains, mutes | Both editors, with undo, step selection, lanes, GEN, MUTATE, piano roll, song slots, song loop (0.9) | MD 191 and about 230 MM firmware journeys, each with a screen check and a machine read-back | good |
| Save and come back (standalone) | The machine memory file keeps every slot across sessions (DESIGN-machine-memory.md); no named project or set (F12, 1.x) | `mdMachineMemoryFirmwareTest` (save, restore, factory start, damaged file, two instances). B-192 open: a global change during the first read may not be saved | good, B-192 open |
| DAW project save and reopen | Project chunks, setup, mappings, machine memory mark; old names mapped since 0.3.1 | pluginval on three systems, `mdProjectStateRestoreTest`, the memory test's project sessions; a person in Live and Logic (TEST-0.8) | good |
| Samples (MD) and waveforms (MM) | Sample manager: copy, paste, RAM to ROM, rename, undo, WAV and SDS export; erase not built (no SysEx; LCD probe planned). DigiPRO manager: send, receive, rename, erase | `md-sampler-*` journeys, `mmDigiproManagerFirmwareTest` 24 jobs, `mm-digipro-*` | good, erase open |
| MIDI Learn and host automation | Control page, CC into the project, a mapped CC overrides the machine's CC, global targets since 0.8.0 | `mdAutomationFirmwareTest`, learn journeys, the rt-check learn burst. B-169's second report open | good |
| SysEx import and export | Import with a per-slot preview and read-back; export; undo of import and Empty Reset since 0.9 | `mdSyxPickFirmwareTest`, `mmSyxPickFirmwareTest` on the owner's full backups, import journeys (run alone). B-174 partly explained, B-158 waits for the tester | good |
| Undo | Everywhere, one step per intent; import and reset included since 0.9 | Journeys assert the history count | good |
| HW MIDI to a real machine | Engine, pacing, SEND n dialog, capabilities per message | Emulated peer only | gap |
| Recording (screen and audio) | Standalone menu bar Record | Hand test only | risk, small |

The journeys are the right proof. What they cannot do: open a DAW, hear sound, or plug in a USB device. Those remain Radek's hand test and the testers' reports, and nothing in the repo lists which DAWs were ever seen working.

## 4. Install, update, uninstall, first run, support, docs

| Area | Evidence | Verdict |
|---|---|---|
| macOS install | Unsigned `.pkg` and `.dmg`; README and site carry the "Open Anyway" steps; macOS 12 or later. SIGNING.md and the release workflow sign, notarise and staple once five secrets exist; nothing ships unsigned by rule. LAUNCH-CHECKLIST section 1: every item unticked | gap, blocks 1.0 |
| Windows and Linux install | Zip and tarball named `-not-tested`, each with a README saying so and where to send logs. No installer (I-013), no SmartScreen signing | gap, by choice |
| Checksums | `SHA256SUMS` attached by the release workflow; README explains the check. The 0.9 tag is the first real run of the new draft lookup (HANDOFF: "not yet proved by a real tag run") | good, verify on 0.9 |
| Update | The editor checks `latest.json` daily and tells; no install (Radek, 2026-10-15). The feed still points at `github.com/radekdymacz/gearmulator-md-mm` (redirects to mdmm) | good |
| Uninstall | A table of six bundles to delete by hand; settings and ROM untouched. No uninstall script | fine for 1.0 |
| First run failures | No ROM: a card. Windows: WebView2 missing or old: the window says what and why. Linux: until B-201 there was an empty grey window; now a native card after 15 s without a paint with the X11 hint. macOS: no failure card for a web view that never paints (never seen, so untested) | good since B-201, verify |
| Logs a user can send | `editor-*.log` and `-previous.log` in the data folder, Open Log Folder, Help > Show log, Developer > Performance Capture. Every one of B-033, B-035, B-036, B-119, B-158, B-172, B-201 waits on a log the user did not send. Nothing packs logs, versions, audio settings and the capture into one file a person can attach | gap, high value |
| Support flow | Discord (#bugs, #ideas, bot posts after Radek's OK), the contact page, BUGS.md and IDEAS.md public, testers anonymous. GitHub issues off. Working and honest; a reporter cannot see a bug's status without reading BUGS.md | good, one decision |
| Guide | 17 MD and 24 MM chapters in manual order, generated with keys, gaps and pictures from data; STYLE.md; `--check` flags stale sections. HW MIDI is "(beta)". OPEN-FACTS.md lists about 25 facts the writers could not confirm; each is written "as the code does it" | good, OPEN-FACTS open |
| Release notes | Every release has notes with bug numbers and a "Known" section; the trajectory from 0.3 to 0.8.1 is visible and consistent | good |
| Error messages | Refusals are toasts with the reason (the capability model); the panel-busy cases were tuned over 0.6 to 0.8 | good |

## 5. Free-software health

| Area | Evidence | Verdict |
|---|---|---|
| Licence | GPL-3.0 at the root; LICENSE.md in dsp56300, mc68k, JUCE; RmlUi, libresample (LGPL or BSD), Monocypher, lua, freetype, lunasvg each under their own file. JUCE under its GPL option fits a GPL-3 product. Each owned core's README names its origin; credits in README | good |
| Shipped notices | README-Linux lists only LICENSE.md in the archive. No single third-party notice file is shown to ship in the packages or the About page (not verified in the bundles) | gap, small |
| ROMs and backups | Never committed, never in CI artifacts; OIDC worker with trust rules; the PGO profile is checked to hold no ROM bytes; Discord rule "bring your own ROM". The firmware tests use the owner's private backups through the same worker | good |
| Trademarks | Disclaimer in README and the site | good |
| Build from source | README: clone with submodules, `mdmm-dev.sh`, CMake 3.22, Xcode, VS 2022 with WebView2, GCC 13 with webkit2gtk. Timings documented. Tests that need a ROM read it from an environment variable | good |
| Contributor path | No CONTRIBUTING.md, no issue templates, issues off, no statement on pull requests or on the licence of contributions. CLAUDE.md and AGENTS.md are the only guide and they are written for agents. The xox-plocks rule (page and deskCore files Radek wrote alone may be copied to a closed product) is a contributor-relevant licence fact stated only in CLAUDE.md | gap |
| Reproducible CI | Actions pinned by SHA, wrangler pinned, pluginval pinned with checksums, one build per system reused by the release, the tag refuses an untested commit. Firmware tests run only on main and release branches by design, so an outside PR never gets them | good |
| Upstream | D4: watch monthly, copy single commits. The 0.8.0 batch (2026-10-17) is the last; the November watch is due | good, keep the rhythm |
| Bus factor | One maintainer (1300 of our commits), working with agents. Every account is his alone: GitHub, Cloudflare (site, ROM worker, R2), Discord bot, the Apple account to come. The docs are unusually complete, which is the mitigation. There is no "if the maintainer is away" page naming where each secret lives and how to rotate it (CI.md covers rotation of the ROM worker only) | risk |

## 6. Scope

**Keep out of 1.0 (already decided or should be):** F9 (the rest of sync and control), F12 (standalone projects), F15 (TurboMIDI), the song library, the MKI model (MD-208, MD-209), sleep when silent, L3 and the research levers, B-196 (parked), the 40 ideas in IDEAS.md, auto-update install, Windows signing and installer, Ableton Link (I-033).

**Decide on the proof, not the feature:** MD sample erase (MD-194, MD-198). If the LCD probe does not give a safe macro in one CI round, 1.0 ships "erase needs the machine's own panel" as a guide limit, as B-133 is handled. The DigiPRO manager is built and proved; keep it.

**What a 1.0 user expects that is missing or unproved:** a signed download; a word on CPU per editor; Windows and Linux either tested by someone or called beta on the download page (they are called "not tested" today, which is honest and should stay if nobody tests them); a way to send a bug report with its logs; the standalone defaulting to 44.1 kHz where the interface allows (ROADMAP section 5, small); the guide's open facts closed.

**What 1.0 should not add:** anything that changes the sound or the formats. The format freeze is the point of the number.

## The 1.0 list

Proof names the thing that shows it done. Who: CI/Claude, or Radek (machines, the Apple account, testers). Size S, M, L.

### Must for 1.0

| # | Item | Why | Proof | Who | Size |
|---|---|---|---|---|---|
| M1 | Signed and notarised macOS packages | The gate's signing row; every download today needs "Open Anyway"; the workflow is ready and waits on five secrets | The tag run's `verify_mdmm_signed.sh` passes; a clean Mac opens the `.pkg` with no Gatekeeper step; the site's "Open Anyway" text is gone | Radek (Apple account), then CI | S |
| M2 | Hardware MIDI on a real MD and a real MM, or hidden | The gate's F1 row; the engine is on the menu as "beta" and has never met a machine; B-195's hang case is untested on hardware | A written hand test (TEST-1.0.md, F1 checklist: connect, reconnect, edits both ways, mutes, transport, transfers, imported globals, a 0x70 during a 0x5D) with Radek's results and logs attached to BUGS.md. Fail: the engine goes behind Developer or stays "beta" with the failed rows named in the guide | Radek (machines) | M to L |
| M3 | A full firmware E2E that is green three nights in a row | A flaky gate proves nothing; five "seen once" bugs and B-160 are open; two journeys run alone | Three consecutive nightlies of `mdmm-firmware.yml` green with no `alone: true` added since 0.9 and B-193, B-194, B-198, B-200, B-202 each fixed or quarantined with a reason in BUGS.md | CI/Claude | M |
| M4 | The stability gate measured and written down | Section 7 asks for numbers at 64, 128, 512 frames at 44.1 and 48 kHz on four platforms; only macOS arm has any | A table in TEST-1.0.md: macOS arm from `mdmm-rt-check.sh` and the local gate; macOS Intel from one Intel Mac (tester or Rosetta start test on CI); Windows and Linux from one tester each with a performance capture; every row says overruns and worst lock wait | Radek and testers; CI for Rosetta | M |
| M5 | "Save diagnostics" in both editors | Seven open bugs wait on a log; the diagnostics exist in four places | A menu item writes one zip (the two logs, versions, host, audio and MIDI settings, the last performance capture, never a ROM byte); a unit test checks the zip holds no ROM run; one guide line; the Discord #bugs pin says "attach the zip" | CI/Claude | S to M |
| M6 | Close the lock-budget gap | 1 ms by design, 10 ms on CI, 10.4 to 12.5 ms seen; the measurement must mean something | B-199's copy moved out of the lock; CI budget set to the worst hold seen over a week plus margin (3 to 5 ms), with the number and the reason in CI.md; nightlies green at it | CI/Claude, Radek sets the number | S |
| M7 | Linux blank window closed or fenced | B-201 and B-172 are the Linux first-run; the fix is unverified | B-201 confirmed by the reporter, or a guide section "Linux: if the window stays empty" (X11 session, the two WebKit variables, the card) and the download page says Wayland and NVIDIA are unverified | Radek asks; CI/Claude writes | S |
| M8 | Fresh E2E evidence | The guide's pictures and the E2E column are from 0.5.1 | e2e-md.json and e2e-mm.json written from the 1.0 release head, unproved-md.md regenerated (0 rows), the guide re-stamped | CI/Claude | S |
| M9 | The unknown bytes probed | 1.0 promises the formats; an unknown bit that is a field is a 1.1 migration | A firmware probe in the style of `mmOjmpLayoutFirmwareTest` for MM global 0x0d to 0x11, 0x30 to 0x3b and the MD global CONTROL bytes; each byte named or recorded as "no MIDI effect found" in the data contract | CI/Claude | M |
| M10 | Windows: one tester round on 0.9 with logs, or "beta" on the page | B-156, B-036, B-035 are open with no log since 0.5.1; the download page must say what Windows is | One Windows tester's diagnostics zip (M5) on 0.9 read, the three bugs each confirmed, fixed or closed; or the download page and README say "Windows: beta, no tester since 0.5.1" | Radek (testers), CI/Claude | M |
| M11 | Third-party notices shipped | A GPL product that ships JUCE, RmlUi, libresample, Monocypher, lua, freetype and lunasvg should carry their notices | THIRD-PARTY.md in every package and on the About page; a package check in the release workflow | CI/Claude | S |
| M12 | OPEN-FACTS closed | The guide carries about 25 sentences written "as the code does it" without a check | Each fact confirmed by a journey or rewritten as a limit; the file is empty | CI/Claude | S |
| M13 | MD sample erase decided | The last missing row that a UW owner meets | The probe's CI run passes and the erase key ships, or the row stays missing with the guide limit "erase on the machine" | CI/Claude on a release branch; Radek decides on a failed probe | M |

### Should (1.0 if cheap, else 1.0.x)

| # | Item | Why | Proof | Who | Size |
|---|---|---|---|---|---|
| S1 | CONTRIBUTING.md and an issue policy | A GPL repo with issues off and no contributor text looks closed | The file: how to report (Discord, contact, the zip), whether PRs are taken, licence of contributions, the ROM rule, the xox-plocks file rule | CI/Claude, Radek decides on issues | S |
| S2 | A CPU line in the guide and on the download page | B-005 is open and will stay; users should know what a core per editor means on an M1 | One sentence with measured numbers per chip from the perf gate | CI/Claude | S |
| S3 | A last-action breadcrumb in the log | No crash handler; a breadcrumb costs nothing and names the gesture before a host crash | The log's last line is the last intent and panel command; read from a journey | CI/Claude | S |
| S4 | Standalone defaults to 44.1 kHz; Setup hints at other rates | ROADMAP section 5 "to do"; lowest CPU, no resampler | A start test reads the chosen rate; a journey sees the hint | CI/Claude | S |
| S5 | The "awaiting CI" bugs merged or dropped | B-184, B-183, B-181, B-180, B-178, B-177 are "local candidate, awaiting CI" since 2026-10-21 | Each on main with its journey, or closed | CI/Claude | M |
| S6 | B-192 and B-169 (new report) looked at | Both touch saving and mapping, the two things a 1.0 user trusts | A firmware test for the global-save race; the reporter's mapping case reproduced or closed | CI/Claude | M |
| S7 | The November upstream watch | D4 is monthly; the last batch was 2026-10-17 | The UPSTREAM.md table extended, each commit take/skip/watch | CI/Claude, Radek decides | S |
| S8 | A "when the maintainer is away" page | One person holds every account | One file naming each account, where its secret lives, how to rotate it, how a release is made without him (CI.md already has most of it) | Radek | S |
| S9 | A sound A/B against a real machine | VISION's "sounds like the box" has no recording behind it | One pattern from the test corpus recorded on a real MD and a real MM and on the emulator, listened to by Radek, the files kept outside the repo, a line in the notes | Radek (machines) or a tester with the hardware | S |
| S10 | DAW matrix in the guide | No list of hosts ever seen working | A table: host, OS, VST3 or AU, who saw it (CC or "a tester"), version | CI/Claude from BUGS.md and TEST-0.8.md, Radek adds his | S |

### Later (after 1.0)

F12 standalone projects and a song library (the most-asked standalone wish), F9, F15 TurboMIDI, the MKI model, sleep when silent and L3, a Windows installer and signing, Linux Wayland in CI, a crash reporter, auto-update install, I-013, I-033, and the IDEAS.md list.

## Decisions only Radek can make

1. **The Apple Developer account now.** It is the one item that no agent or tester can do, and M1 cannot start without it.
2. **Hardware MIDI: test it on your own machines before 1.0, or ship 1.0 with the engine hidden behind Developer.** "Beta on the menu" is the one state the gate does not allow.
3. **What 1.0 claims for Windows and Linux.** "Not tested" stays on the page until a tester with logs exists; or a tester is found for each before the tag. The claim decides M4 and M10.
4. **The CI lock budget.** Keep 10 ms (and say the check is for freezes, not for the 1 ms design), or lower it after B-199 and let the nightlies tell.
5. **GitHub issues.** Keep them off (Discord and contact, BUGS.md as the record) or open them at 1.0 as a GPL project usually does, with the ROM rule in the template.
