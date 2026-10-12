# Ideas from users

*Feature ideas from beta testers and users (Discord, email). Not bugs: see
[BUGS.md](BUGS.md). Newest first. Each entry: who and when, the idea, status.*

## I-024 · Saved kits and patterns stay on the machine for every new session

- **From:** a user, 2026-10-12: "save kits and patterns created/edited and saved in the editor so they persist on the device each time I open the plugin in a new session".
- **Today:** the machine's memory (kits, patterns, songs, globals) is saved in the DAW project and, for the standalone, when the app quits. A new DAW project, or a new instance of the plug-in, starts from the factory memory. So a kit saved in one project is not there in the next one. A real machine keeps what you save.
- **Way A (machine memory file, as a real machine):** one memory file per machine in the editor's user folder. A new session with no project state starts from it. Each SAVE KIT, SAVE PATTERN, song or global save also writes it. An existing DAW project still opens with its own memory. A menu item starts from factory memory again. Risk: two instances of the same machine both write the file; the last save wins.
- **Way B (start-up memory, by hand):** a menu item "Use this memory for new sessions" copies the current memory into the file; new sessions start from it. Nothing is written by itself. Simpler and safe with many instances, but the user must remember to do it.
- **Status:** Radek, 2026-10-12: way A, with a setting to turn it off. Planned for 0.6 (wave 11, PLAN-0.6.md). Built on `feat/0.6-memory` (doc/modern-ux/DESIGN-machine-memory.md): one file per machine in `<data folder>/memory/`, a session with no project state starts from it, a watch thread writes each save, the engine menu's KEEP MEMORY, RESET MACHINE…'s Start from factory memory…; the standalone starts from the file too.

## I-023 · Monomachine: a real MKII look (silver panel, bluish-white LCD with black text)

- **From:** Discord tester M, 2026-10-11: on the Monomachine "the MKI/MKII button does nothing"; on the Machinedrum it changes the skin. Wants the Monomachine MKII look: silver, black and white, the MKII LCD's bluish-white background with black text.
- **Why nothing changes today:** the MM plate key flips `data-plate` and enables the MKII-only machines, but `mmStudio.css` (~line 1017) gives MKI and MKII the same colours; only a small "MKII" print differs.
- **The look (from a product photo of the SFX-60+ MKII):** brushed silver aluminium panel; a black glass window round the LCD and knobs with the red dot-matrix MONOMACHINE logo; a positive LCD, bluish-white background with black pixels; black keys, white ENTER / EXIT and track keys, a red COPY key; dark brown label bars under the keys with white text; red LEDs, yellow track LEDs; black knobs. Colours to be sampled from photos before building.
- **Sampled 2026-10-11** (pixel averages from product photos; photo white balance varies, so treat as a starting point): SFX-60+ MKII (Vintage King): panel #e9e9e9, key area #ffffff, display window #010101, LCD ground #f2fcfb, LCD pixels #0e1a19, black keys #0a0a0a, white keys #fbf9f7, COPY #e33b21, knobs #010101. SFX-60 and SFX-6 MKI (Vintage Synth Explorer): panel #b2bcbe to #c4c3c3, window #010101 to #323232, LCD ground #b6dde1 to #cfdff0 (light blue), pixels #000000, COPY #f22518, knobs #323d2f (dark green-grey). Ours today (both plates): panel #d4d5d0, LCD #b9c4b0 (grey-green), ink #172014, bezel #0d0f0c, labels #a04d39.
- **Built on `feat/0.6-skins` (2026-10-12, not merged):** the Monomachine true to the product photos, the plate key chooses the look: MKI light-blue LCD, MKII bluish-white LCD, each with its own panel, keys and label colours. The Machinedrum Editor is unchanged by choice (Radek, after the side-by-side comparison: keep the light MKI with the green LCD and the dark MKII), although its photos show silver with a red LCD on both. Final tokens and the photos they came from: [doc/modern-ux/SKIN-COLOURS.md](../modern-ux/SKIN-COLOURS.md).
- **Status:** Monomachine skins accepted by Radek; on its own branch, not merged yet.
- **In the manual review (Radek, 2026-10-12):** the MM MKII panel in 0.6 (`#d2d1cc`) reads as warm grey, not silver. Make it a light cool silver near the photo sample (`#e9e9e9`), fixed while Radek tests the installed 0.6 by hand, without running the automatic tests again for it.

## I-022 · Type a parameter value

- **From:** Discord tester M, 2026-10-11: "being able to type in specific parameter values", as Monomodule and other software instruments.
- **Today:** no value box takes typing; double-click resets to the default (MM `mmMockup.js` ~4694, MD `mdDeskGestures.js` ~171).
- **Idea:** a way to type a value into any parameter (both editors), without losing double-click = default. The gesture to be decided (for example Enter on a focused value, or a modifier + click).
- **Chosen (0.6, polish B):** ⌘-click a value box or fader (Ctrl-click off a Mac), or Enter on one that has the focus (Tab to it). A field opens over the box with the value as the box shows it, selected; Enter sets it, Esc or a click elsewhere leaves it. Why: double-click stays the default, a plain click and drag stay the drag, Alt stays Control All and Shift fine, and right-click is out (Radek's rule, and Ctrl-click is a right-click on a Mac). ⌘ on a value had no meaning yet. Enter is the keyboard path to the same field. No new control: the box itself takes the gesture; the field lives only while typing.
- **What may be typed:** what the box shows. A number takes the nearest value (1200 on a box that shows 1196 or 1210); a signed box takes -64 to +63 with or without the +; a list takes its names in any case (an LFO's wave, a page, OFF), the MM PAN L12 / C / R5 or the number, an MD unit's text ("1/16", "250 ms") or the box's own number. A number past the ends, or a text the box never shows, is refused in the field (red, the range or the names in its tip and a toast) and the field stays open. One edit, its own undo step.
- **Status:** done in 0.6 (polish B): `skins/shared/deskValueEdit.js` (both editors), deskValueEditTest.js, journeys md-sound-type-value and mm-sound-type-value. The machine-name picker and other menus keep their own lists.

## I-021 · An output meter and master volume in the LCD (both editors)

- **From:** Radek, 2026-10-11.
- **Idea:** a small level meter in the LCD (beside LOCKS / COPY CLR PASTE) showing the editor's whole output, which is also its master volume: drag it (or scroll) to set the plug-in's output gain, double-click for 0 dB. One gain for the whole plug-in output (main and the extra outputs alike), applied after the emulation in the plug-in layer, so the emulated machine and its own volume settings are untouched (the goldens measure the emulator's output and stay bit-exact). Peak hold and a clip mark; saved with the project and the standalone's settings; automatable as a plug-in parameter if cheap.
- **Decided (2026-10-11):** one plug-in-layer gain after the emulation on every output bus, beside the machine's own volume settings (they stay as they are); -60 dB (off) to +6 dB, 0 dB by default; peak meter, instant attack, about 300 ms release, peak hold 1.5 s, clip mark. Radek: vertical, at the LCD's right end, stereo.
- **Built for 0.5.1** (branch `feat/lcd-volume`): a strip at the LCD's right end, both rows tall, both editors, plug-in and standalone: two thin bars (the main output's left and right after the volume) each with its peak hold line, a clip mark at the top (lit when any output, main or extra, went over 0 dBFS; a click clears it), and the volume as one line across both bars on the same scale (-60 dB at the foot, +6 dB at the head, a tick at 0 dB). Drag up or down (2 px a dB, Shift five times finer), scroll (a dB for each 100 px), double-click for 0 dB; at the foot it is off. While the volume changes, the dB shows under the LCD (the LCD's tip). Only the LCD's ink and ground, no red. 30 px wide; up to 1500 px window width 20 px, so the Machinedrum's top bar still fits at 1280 and 1440 px (its LCD has no spare width there). The volume is `pluginLib::Processor`'s existing output gain (applied after the emulation, now ramped across a block when it moves, so no zipper; the standalone's fade on quit is smoother too), so the emulated machine is untouched and the bit-exact goldens cannot change. Saved with the project (the GAIN chunk that was already there) and so in the standalone's saved state (written when the app quits). Cost: one pass over the enabled outputs and three lock-free maxima a block, no lock, no allocation; the page gets `outputLevel` every 250 ms (`peakL`, `peakR`, `clip`, `gainDb`) and sends `outputGain {db}` (mdOutputLevel.h, mdDeskSession.cpp, skins/shared/deskVolume.js; data-contract.md). Tests: `mdOutputLevelTest`, `deskVolumeTest`, `mdAudioIoLayoutTest` (the ramp); journeys `md-lcd-volume`, `mm-lcd-volume`.
- **Not done:** a host-automatable parameter. The editors' parameter list is the machines' (built from the controller's descriptions); a volume parameter would be a new entry in every host's list, must stay in step with the saved GAIN chunk and the page, and is not cheap enough for 0.5.1. The volume is saved with the project, not automated.
- **Status:** built for 0.5.1, branch `feat/lcd-volume`, waiting for Radek's play test and the journeys.

## I-020 · LCD-only mini view: a minimise icon in the LCD's top-right corner shrinks the editor to just the LCD

- **From:** a tester on Discord, 2026-10-11 (feature request); Radek: "great idea".
- **Idea:** a small minimise icon in the top-right corner of the LCD itself shrinks the editor window to the LCD alone (its own strip: the machine's screen with pattern, kit and tempo). The same icon on the mini view, or Esc, restores the full editor at its previous size. Not a double-click on the LCD (Radek, 2026-10-11): the LCD keeps its own clicks and drags. Handy in a DAW with many plug-ins open: the editor stays visible but takes almost no room.
- **Shape:** both editors, plug-in and standalone; the page switches to a compact layout and asks the window for the LCD's size (the plug-in editor resizes itself; hosts that refuse a resize keep the full size and the page just centres the LCD); the mini size and state are remembered per instance; the LCD keeps its clicks (tempo drag, pattern ‹ ›) in mini view. Check how Logic, Ableton and the standalone handle a plug-in shrinking itself.
- **Status:** new.

## I-019 · Trigless locks on the Machinedrum (as the Monomachine Editor has)

- **From:** Radek, 2026-10-11, after a Discord conversation: the Monomachine Editor already offers a trigless step (a step that carries only parameter locks, no note; step menu "trigless"); the Machinedrum Editor does not.
- **Idea:** offer the same on the Machinedrum, for the next release, **only if OS 1.63 supports it**. Today a Machinedrum lock lives in the lock lane and needs a trig on its step.
- **First:** a firmware probe (mdDeskFirmwareTest section): write a lock on a step without a trig the way the MD's own pattern format allows (if it has a bit or slot for it), read the pattern back from the machine's memory, and check by ear and by the output whether the machine applies the lock without playing a note. If OS 1.63 cannot, say so in the guide and close the idea (custom firmware such as X.13 may differ: I-016).
- **Probe (2026-10-11, `mdP4ProbeFirmwareTest <ROM> trigless`, OS 1.63):** track 1 a GND-SIN with the longest decay (it sounds through all 16 steps), the other tracks GND-EMPTY; each pattern sent as a SysEx dump (as the editor sends it), read back, played two loops, loop 2 measured step by step.
  - **The format holds it:** there is no trigless bit; a lock is a value in its (track, parameter) row, 0xff = none, and nothing ties it to the trig bits. A lock on a step without a trig (VOL 0 or PTCH 127 on step 5, trigs on 1 and 9) is kept: the read-back has the lock, the lock mask bit and the trigs unchanged.
  - **The machine does not play it:** with the lock on trigless step 5 the sustaining sine is unchanged on steps 5-8 (rms 0.099 with and without the VOL 0 lock; pitch 245 Hz with and without the PTCH 127 lock), and it does not carry to the next note (step 9 rms and pitch as without the lock). No note starts at a trigless locked step (trig on step 1 only, VOL 0 locked on step 9: no onset, steps 9-16 as without the lock, ratio 0.999). The control with a trig on step 5 applies the same locks at once (VOL 0: rms 0.000 on steps 6-8; PTCH 127: 10 kHz).
  - **The front panel cannot make one:** grid recording, TRIG 5 held on an empty step and knob A turned sets a trig on step 5 with the lock.
- **Status:** not supported by OS 1.63 (closed). The user guide says a Machinedrum lock needs a trig. Custom firmware such as X.13 may differ (I-016).

## I-018 · A CPU meter in the editor's top bar (both editors)

- **From:** Radek, 2026-10-11, testing 0.5.0 in Ableton Live ("add a CPU meter somewhere around here", next to SETUP and the version).
- **Idea:** a small meter in the top bar's SETUP corner showing how much of the audio deadline the emulation uses (the share of each audio block's real-time budget spent rendering, smoothed, with the worst recent block marked), so a user sees headroom and drop-out risk without the DAW's meter, and testers can compare Developer > Speed-ups on and off at a glance. A click opens the performance details (realtime ratio, buffer, sample rate, Rosetta). The data exists: the session record's render timing and the boot lines' realtime ratio.
- **Built for 0.5.1** (branch `feat/cpu-meter`): `CPU ▮▮▯` after the version in the Setup label, both editors, plug-in and standalone. The share is processBlock's whole call (the emulation, the resampler, MIDI) against each block's budget (frames / sample rate), smoothed over 0.5 s; a tick marks the worst single block of the last 3 s. Only the page's ink and plate, no red: a block over 100 % shows as a thicker, hatched bar. The number (or STOPPED, BYPASS, RENDER, NO AUDIO instead of 0 %) shows on hover and while the details are open. A click opens the details ("CPU: audio deadline, this editor (one core)"): average, worst block, what the share is of (one core's time for this editor's audio; the page runs elsewhere), machine speed, the host's rate and block size, the speed-ups (all on, off, or which are off; L3), native or Rosetta, and under them the editor menu's own switches: Speed-ups (ticked when on), Speed-ups (each)… and, on the Machinedrum, L3, so the meter is where speed-ups are compared. Cost: two clock reads and a few relaxed atomic adds a block (about 35 ns on an M-series Mac), no lock, no allocation; the page gets a `cpuLoad` message every 250 ms (mdCpuLoad.h, mdDeskSession.cpp, skins/shared/deskCpu.js; data-contract.md).
- **With it (Radek, 2026-10-11):** the brand block is short ("MD / EDITOR", "MM / EDITOR"; the full name in its tooltip, the window title, About and the menu), and every top-bar key fits at 1280 and 1440 CSS px (skins/shared/deskTopFit.css; the journeys `*-top-cpu-meter` check it). The Speed-ups switches: Radek's Machinedrum stayed on "Speed-ups off"; with his settings (legacyEmulation 1) in a sandbox the page menu and the details turn it both ways on both hosts (journeys `*-dev-speedups`: the machine's state, the saved setting and the tick, every lever). Fixed on the way: the menu's switches read the machine's state when chosen, not when the menu was built, and the macOS menu bar's Editor menu is built again each time it opens (JUCE dropped its delegate after the first rebuild, so it kept old ticks and actions). The native editor menu (the one shown when the page is not up, built by `jucePluginEditorLib::toPopupMenu`) gave every entry item ID 0, which JUCE's popup never triggers: a click closed it and ran nothing; each entry now has an ID of its own (`mdProcessorHooksTest`). Every speed-up switch change is a line in the start-up log (`speed-ups: on|off, levers off …, L3 on (menu | start, settings | start, env … | changed, not by the menu), saved legacyEmulation=… speedUpLeversOff=… exactEssiTiming=…`), and every editor-menu pick too (`editor menu: pick n (id) of menu m`, or why it was not run). The old key `legacySimStepping` is read nowhere since 0.5 (ruled out).
- **Menu wording (Radek, 2026-10-11):** "Speed-ups off (legacy emulation, slower)" read backwards (ticked meant off). Now Developer > "Speed-ups (faster, same sound)", ticked when the speed-ups run (the default); the levers under "Speed-ups (each)" are greyed and unticked while it is off. Same saved setting (`legacyEmulation`, inverted only in the menu).
- **Status:** built for 0.5.1, waiting for Radek's play test.

## I-017 · Drag and drop files onto the editor

- **From:** Radek, 2026-10-09.
- **Idea:** drop files from the Finder onto the editor window: a ROM installs it, a `.syx` opens the SysEx import window, samples load into the Sampler.
- **What can be dropped where (macOS only for now):** anywhere on the window. A **ROM** (`.bin`, or a `.zip` with it): asked first ("Install … as the firmware? The machine starts again with it."), at once on the start-up card when no firmware runs yet. A **SysEx file** (`.syx`): the SysEx import window opens with its preview, as **Import SysEx…** does; one file a drop. **Samples** (`.wav`, `.aif`, `.aiff`; Machinedrum UW): open the Sampler and select a ROM slot (or drop onto a ROM slot's tile): the sample goes into that slot; several go into that slot and the ones after it, one after another, after one question. Anything else is named in a note. While files are over the window a frame says what it takes. Windows and Linux: not yet (the web view there takes the file first; it is not opened).
- **Status:** shipped in 0.4.0 (macOS), design in [FOUNDATION.md](../modern-ux/FOUNDATION.md), "Files dropped on the window"; tried by the page tests and the journeys, the Finder drop by hand still to be confirmed by testers. Windows and Linux open: the web view takes the file first (WebView2: `put_AllowExternalDrop(FALSE)` should hand it to the window, as the macOS hook does; webkit2gtk: the drop lands on the page), see the two TODO notes in `mdWebPageHost.cpp`.

## I-016 · Run a custom firmware (ems-monomachine-firmware, ems-machinedrum-firmware) in the editor

- **From:** Radek, 2026-10-09, after the Octahackers Discord thread on custom firmwares. Decided: a spike after 0.4, not in 0.4.
- **What exists:** github.com/emuyia/ems-monomachine-firmware (per-track lengths and speeds, trig conditions, clone
  pattern, trig preview, page copy/randomise, BBOX sample banks; SONG slots 13-24 removed) and a Machinedrum one.
  They ship as patches for a browser patcher (junes.website/goodies/fw-patcher): input Elektron's official OS .syx
  (the MM one is `Elektron_SFX6-60_OS1.32B.syx`, SHA-256 checked), output a patched OS .syx for the machine's
  OS-update mode. Signed manifest, WASM engine, nothing uploaded.
- **What the editor needs:** (1) the patched OS inside an 8 MiB flash image: way A, let the emulated machine
  update itself (boot with FUNC held, send the .syx, the emulated Am29F flash programs itself, save the image as a
  ROM); way B, an offline writer that needs the OS .syx format; (2) the ROM loader accepts an unknown fingerprint
  behind an "at your own risk" switch (today only OS 1.63 and 1.32B pass, mdromcheck.h); (3) a list of what the
  desk gets wrong: it reads RAM at fixed addresses and knows the stock pattern/kit layouts.
- **Spike (two days):** try way A headless with mdFirmwareSession; relax the loader behind the switch; boot the
  custom OS; list what works and what breaks on the page. Decide the product shape after that.
- **Status:** queued after 0.4.

## I-015 · Pattern length per track, and microtiming

- **From:** Discord tester L, 2026-10-09, in #ideas: "pattern length per track and microtiming of course". Radek: "Nice one".
- **Note:** not in the firmware's pattern: the Machinedrum has no per-track length (`DESIGN-generators.md`) and the Monomachine's tracks share one scale length (`manual-mapping.md`). It would be an editor feature on top of the machine (or a new sequencer), not a mapping of what the firmware does. Microtiming is not in the mapped pattern format either (to check).
- **Status:** new.

## I-014 · Make the EXT / CLASSIC mode and LOAD ROM easier to find

- **From:** Discord tester D, 2026-10-08: "everything I tried to do didn't seem to work. The binary loaded automatically and I don't see where to add a different firmware." Tester A, 2026-10-09: "Seems MD editor is in Advanced Mode Always? kits and patterns are always connected? Havent seen an option to select mode."
- **What happened:** both were answered in the channel. LOAD ROM is in the engine menu in the header (Radek posted a screenshot); the mode is the small MODE EXT field in the LCD's second row (click for CLASSIC: patterns do not load their kits, locks stay in the pattern but do not play, the lock lane says "CLASSIC: locks muted").
- **Idea:** say it where people look: the mode in the guide (no word on EXT / CLASSIC today; the guide still describes version 0.3.2) and a tooltip on the field; LOAD ROM also in the editor menu next to Open Log Folder.
- **Status:** new.

## I-013 · Windows: an installer instead of copying folders

- **From:** Discord tester A, 2026-10-08, 0.3.4, on a Windows 10 PC: "there no installer on 0.3.4 / only manual install to folders". The Windows build is a zip (the app and the VST3 folder) with a README for the install paths.
- **Idea:** a setup program (app, VST3, shortcuts, uninstall), signed when the signing account exists ([SIGNING.md](SIGNING.md)).
- **Status:** new.

## I-012 · Switch from song mode to pattern mode

- **From:** Discord tester J, 2026-10-08 (0.3.4), in #bugs: "how do we switch from song mode to just pattern?" Radek: "may not be implemented fully yet".
- **Done:** 0.3.5 has the PATTERN | SONG switch on the Song page ("What plays") and PAT / SONG on the LCD's second line, on every page; the switch lights what the machine reports.
- **Status:** shipped in 0.3.5; tester J has not said whether it is what was meant.

## I-011 · A song library pop-up instead of stepping the SONG field

- **From:** Radek, 2026-10-09: the LCD's SONG nn field steps through songs (click, drag, scroll). It should open a pop-up like the kit library instead: all songs with names, and load, copy, paste, clear and save from one place.
- **Scope:** both editors (MD 32 songs, MM 24). Same layout and keys as the kit library.
- **Status:** planned, after 0.3.5.

## I-010 · Monomachine: note length like Ableton/Digitakt

- **From:** Discord tester C, 2026-10-08: dropping notes in the MM piano roll, a note runs until the next one; wants explicit trig/note length (place 1/16, then 1/8 notes as in Ableton).
- **More:** the notes run on until the next one and are then cut off (tester C's words); Radek on 2026-10-09 in #bugs: the Monomachine piano roll "needs to be better as well". C is used to the Digitakt's trig length and Ableton.
- **Measured (2026-10-10, `mmDeskFirmwareTest notelength` and `lenprobe`):** a synth track has no length per note: a note sounds from its trig to the track's next NOTE OFF or trig, past the pattern's end onto its start. A MIDI track's note lasts LEN ticks, 24 a quarter note (6 a step at 1X; linear 1-126 at 120 and 90 BPM; the roll assumed 8 a step), cut earlier by the track's next trig or a NOTE OFF trig; LEN 127 lasts until a NOTE OFF.
- **Status:** built for 0.5 (MM slice 3, branch `feat/mm-piano-roll`). A new note lasts the draw length (the Len key beside Draw: 1/16 1/8 1/4 1/2 1 bar; dragging a note's end sets it too, as in Ableton): a synth note writes its trig and a NOTE OFF where it ends, a MIDI note its LEN lock (or LEN 127 and a NOTE OFF past 21 steps). A note is drawn up to the track's next trig, and past the pattern's end onto its start (drawn there lighter). Deleting a note leaves the note before it its length. The firmware test stores and plays 1, 2, 4, 8 steps and 6 across the end (136, 262, 512, 1015 and 763 ms for 125-1000 ms: the measuring window adds some 13 ms) and MIDI LENs 1-126 (to the tick).

## I-009 · Option to turn off the "kit has unsaved edits" warning on pattern change

- **From:** Discord tester C, 2026-10-08 (mostly the Machinedrum, maybe the Monomachine too).
- **Status:** new.

## I-008 · The editor menu in the editor's own style (next, after 0.3.4)

- **From:** Radek, 2026-10-08.
- **Idea:** the right-click / editor menu (GUI Scale, Page Zoom, RAM recording, Updates) is JUCE's default dark-blue menu. Draw it in the page with the themed menu from the key map (deskMenu.js): plate colours and fonts, light/dark and MK1/MK2, the same in every DAW and OS. First line "Machinedrum Editor <version>"; Performance diagnostics into a Developer submenu.
- **Status:** shipped in 0.3.5: option A, the menu drawn in the page. The window sends the entries as data (`mdEditorMenu.h`, one tree: the page, the menu bar, and a native menu only when no page is up), the page draws them (`deskMenu.js`: submenus, ticks, keyboard, placement) and the window runs the one chosen. Content: the editor and version as the title; Zoom (the page's zoom steps, with Window Size inside: upstream's GUI Scale, the window at a size of the design); Updates; Open Log Folder; Audio/MIDI Settings (standalone); Developer (performance capture, RAM recording). Screenshots for review first.

## I-007 · Ableton-style editing on the Monomachine piano roll

- **From:** Discord tester C, 2026-10-08.
- **Idea:** B toggles draw mode on the piano roll (as in Ableton); box-select notes.
- **Status:** built for 0.5 (MM slice 3, branch `feat/mm-piano-roll`). B on Sequence (and the Draw key beside PAGE) toggles draw; off, a drag in an empty place boxes notes into the selection both editors share (from the first note's trig to the last one's end, its NOTE OFF in), a press on a note selects it, a drag of the selection moves it (one undo step; ⌘-drag a copy, as before), a double-click adds a note, and the slice-2 keys and step menu act on it. B stays tap tempo on the other workspaces (tap on Sequence is gone: the roll's Draw takes the key there).

## I-005 · Update from inside the app (after 0.3.2)

- **From:** Radek, 2026-10-07.
- **Idea:** the standalone app checks `https://mdmm.dev/latest.json` (once a day, can be turned off; no third-party server), shows "Update available", downloads the new version, verifies it with our own signature (ed25519, independent of Apple/Microsoft), replaces the app and the VST3/AU/CLAP plug-ins and restarts. Plug-ins in a DAW only show a note ("open the app to update"). macOS, Windows (swap after exit; a DAW must be closed for plug-ins) and Linux. A system-wide install asks for the password once.
- **Status:** built on `feat/updates` (2026-10-08), design in [DESIGN-updates.md](../modern-ux/DESIGN-updates.md). As built: the standalone installs (macOS: opens the .pkg in the Installer; Windows, Linux: swaps the app after exit); the plug-ins are never replaced by the app (a DAW may have them loaded). Installs wait for the update key ([SIGNING.md](SIGNING.md)).

## I-004 · The site and latest.json update themselves on release (after 0.3.2)

- **From:** Radek, 2026-10-07.
- **Idea:** when a release is published, a GitHub workflow writes the version into `site/public/config.js` and `site/public/latest.json` and deploys the site. Download links already follow `releases/latest/download/<fixed name>`.
- **Needs:** one Cloudflare API token (Workers edit on the NativeKloud account only) saved as a GitHub secret — Radek.
- **Status:** built on `feat/updates` (2026-10-08): `.github/workflows/mdmm-site-release.yml`. Needs the secrets in [SIGNING.md](SIGNING.md) (update key, Cloudflare token).

## I-003 · Follow the last played track (external MIDI controller)

- **From:** Discord tester B, 2026-10-07.
- **Idea:** an option to switch the selected track (instrument focus) to the one last played from an external MIDI controller.
- **Status:** new.

## I-002 · Show incoming notes on the Sound page

- **From:** Discord tester B, 2026-10-07.
- **Idea:** a visual sign on the Sound page when a note arrives from a MIDI controller (which track was triggered).
- **Also:** Discord tester M, 2026-10-11: light the on-screen keyboard's keys for notes played, as Ableton's (the Monomachine's Perform keyboard; B-062 is the stuck light).
- **Status:** done in 0.6 (polish B). The plug-in also sends the notes held from outside as a state (`midiHeld`, every 32 ms at most, when they changed; a note off is never lost, all notes off clears), so a burst is one message and a key cannot stay lit. Monomachine: the Perform keyboard lights the keys a MIDI keyboard holds (journey mm-perform-keys-lit; mdMidiInTest, mdSessionNoRomTest). Machinedrum (no keyboard): a note on the base channel that the map gives a track makes that track's number on the rail glow a moment, and its LED on Mix (journey md-sound-note-light); no new control. The MM's Sound page shows no note light yet (its rail has none to glow; a later idea).

## I-001 · Select steps, copy, paste and duplicate

- **From:** Discord tester A, 2026-10-07: "copy only one step and paste it, same track".
- **Idea:** select one or more steps with a modifier-drag; copy, cut, paste, duplicate, delete.
- **Status:** shipped in 0.3.4 (select, copy, cut, paste, duplicate, delete; B-015).
