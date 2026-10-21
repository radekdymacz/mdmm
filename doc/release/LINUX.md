# Linux and Windows builds (not tested)

Every `mdmm-v*` tag attaches, besides the macOS installers, one archive per machine for Windows x64 and
Linux x64 to the draft release (`.github/workflows/mdmm-editors-release.yml`):

| Asset | Built by |
|---|---|
| `Machinedrum-Editor-Windows-x64-not-tested.zip`, `Monomachine-Editor-Windows-x64-not-tested.zip` | `.github/workflows/mdmm-editors-windows.yml` (upstream's `build_mdmm.ps1`, as is), split per machine by `scripts/windows/package_mdmm_editors.sh` |
| `Machinedrum-Editor-Linux-x64-not-tested.tar.gz`, `Monomachine-Editor-Linux-x64-not-tested.tar.gz` | `.github/workflows/mdmm-editors-linux.yml` (`scripts/linux/build_mdmm.sh`) |

They are unsigned and nobody has used them: they go to a draft only, never to a published release, and the
release body says "Windows and Linux: not tested". Each archive has a README (`scripts/linux/README-Linux.txt`,
`scripts/windows/README-Windows-mdmm.txt`): install paths, required packages, bring your own ROM.

## Linux: the web view

The editor is a web page in JUCE 7's `WebBrowserComponent`. On Linux JUCE runs webkit2gtk in a child process
(XEmbed into the plug-in window) and loads GTK 3 and WebKit with `dlopen` at run time.

- **Build.** `mdmmEditors.cmake` turns `JUCE_WEB_BROWSER` on when pkg-config finds webkit2gtk (4.0 or 4.1; only
  the headers are used) and GTK 3. `mdJucePlugin/mdmmLinuxWebView.cmake` gives `juce_plugin_modules` what JUCE
  gives a `NEEDS_WEB_BROWSER` target: the headers, and JUCE's embedded subprocess helper
  (`JUCE_USE_EXTERNAL_TEMPORARY_SUBPROCESS`), so a VST3 starts WebKit in a helper program, not in a fork of the
  host. The standalone starts itself again with `--juce-gtkwebkitfork-child`.
- **Run.** JUCE 7 opens `libwebkit2gtk-4.0.so` and `libgtk-3.so`, the development symlinks, and Ubuntu 24.04 and
  Debian 13 have no webkit2gtk-4.0 at all. Two shims of those names (`mdJucePlugin/linux/`) lie beside the
  standalone and inside the VST3 bundle, found through the binaries' `$ORIGIN` run path: the WebKit one forwards
  JUCE's sixteen functions to `libwebkit2gtk-4.0.so.37` or `libwebkit2gtk-4.1.so.0` (the same C API); the GTK one
  only depends on `libgtk-3.so.0`. A JUCE update must check the shim's list against
  `juce_WebBrowserComponent_linux.cpp`. The shim now exposes whether its runtime loaded, including both
  loader errors when neither did; JUCE forwards a missing runtime to the native failure view instead of calling
  its null-returning forwarders. The plug-in can still load without WebKit.
- **The bridge** (`mdPageBridge.h`, `skins/shared/deskBridge.js`). Page -> plug-in is as on macOS: the page's
  `gmbridge://` iframe navigations reach webkit2gtk's `decide-policy`, which JUCE hands to `pageAboutToLoad`.
  Plug-in -> page is not: webkit2gtk 2.50 (Ubuntu 22.04's 4.0) runs a `javascript:` URL given to
  `webkit_web_view_load_uri`, but its web process then crashes (a null read in `libwebkit2gtk-4.0.so.37`) when the
  page's bridge iframes navigate around it; the probe (`scripts/linux/probe_webkit_bridge.py pending|answered`)
  crashed in 10 of 10 runs, and the packaged editors did on CI two runs out of three. So on Linux the plug-in writes
  each `gm.recv([...], seq)` call as a script file beside the page file (`<page>.recv-<seq>.js`), the page (loaded
  with `?recv=file`) loads them in order with `<script>` tags, polling every 8 ms for the next one, and reports
  `gmbridge://a/<seq>` every 250 ms so the plug-in deletes what was read (`a/0` when it starts: a page that loaded
  again reads from 1, and the plug-in sends it everything once more, as on its ready). The same probe in that mode
  (`file`) passed 5 of 5 runs of 300 round trips under the same load. The plug-in writes the files strictly in order
  (`FileOutbox` in `mdPageBridge.h`): one that cannot be written (a full disk for a moment) holds back the later ones
  and is tried again on every tick; with 8 MiB waiting, or 2 s without a file written, they are dropped and the page
  is loaded again once a file can be written. The start-up log says each of these in every build. The page loads
  from a `file://` temp file as on macOS.
- **The zoom.** webkit2gtk has no page zoom of its own, so the zoom that fits the window (times the user's zoom) goes
  to the page as a `zoom` message by the same files, never as a `javascript:` URL, and the page sets its CSS zoom
  (`skins/shared/deskZoom.js`). macOS (`mdStudioWebZoom.mm`) and Windows (WebView2) zoom the web view itself.

## Checked by CI, and not

`mdmm-editors-linux.yml` builds on Ubuntu 22.04 (glibc 2.35), runs the unit tests
(`ctest -E "Plugin|_AU|VST|FirmwareTest|synthLibMidiClockTimingTest"`), packages, and starts each packaged
standalone and VST3 (in `scripts/vst3EditorHost`) under Xvfb on Ubuntu 22.04 and 24.04 with runtime packages only
(`scripts/linux/smoke_mdmm.sh`): the app keeps running, WebKit's `WebKitWebProcess` starts, the bridge goes both
ways and the page shows "<machine> firmware needed" (read through AT-SPI), real keys reach the page, the page's zoom
(125 % from the editor's config, then Ctrl+= to 150 %) leaves the same web process running, and screenshots are kept
as an artifact. The three platforms' start tests side by side: [FOUNDATION.md](../modern-ux/FOUNDATION.md), "CI start
tests". The Linux workflow also runs the same packaged-editor checks in a SteamOS 3.7.20 container with
GTK/WebKitGTK installed (`scripts/linux/steamos_start_test.sh`).

Release 0.8.0's [CI run 39307678496](https://github.com/radekdymacz/mdmm/actions/runs/39307678496) passed these
checks on both Ubuntu versions and SteamOS. The saved MD VST3 screenshot from Ubuntu 24.04 and MM VST3 screenshot
from SteamOS were visually inspected on 2026-10-20: both show the editor page and firmware-needed card.
These are startup checks without a ROM. Not checked: the VST3 in a Linux DAW, audio and MIDI devices, a ROM,
a real Wayland/XWayland desktop, or CachyOS. A passing test host does not establish Bitwig compatibility.

The B-172 follow-up adds screenshot OCR of the firmware card, so a live accessibility tree behind a black
window cannot pass on its own. It also adds failure checks to that same script (pending CI on this change): after the page/bridge
checks it kills the standalone's WebKit page process, and the VST3's GTK helper. Each host must stay alive,
record the cause and display the native failure text, read from a screenshot with Tesseract because JUCE 7's
native Linux widgets do not export an AT-SPI tree. Failure screenshots and startup logs join the artifacts.
These checks verify failure handling, not the cause of the CachyOS report.

Code inspection found that the old receiver retried a zero-byte read (EOF) forever, so losing the GTK helper
could spin a CPU thread and prevent teardown. EOF now ends that thread and reports the disconnected helper.
The command channels use local sockets with `MSG_NOSIGNAL` so a dead helper cannot send SIGPIPE to the DAW;
they preserve the same JSON protocol. Their descriptors close on exec except for the helper's two passed
endpoints, which are also marked close-on-exec before WebKit starts its own processes. Startup waits at most
10 seconds for the helper's X11 window, and cleanup handles signal termination as well as normal exit.
WebKit's `web-process-terminated` signal now reaches the native failure view after a page had already loaded.

On Linux `synthLib::SysexBuffer` is a `std::pmr::vector` (a macOS build with a deployment target below 14, which
the releases have, takes a plain `std::vector`). Four of the firmware test programs assigned one to the other and
did not compile on Linux, and the build script used to leave their tests out and carry on. That is fixed: they copy
the bytes (`sysexContentOracle.h`, `sdsFirmwareTest.cpp`, `mmSysexExportFirmwareTest.cpp`), and a test program that
does not build now fails the job (`-k 0` lists every compile error in one run). The script also fails when a ctest
test's program is missing, unless its name is in the script's `known_unbuilt` list (empty), runs `ctest` with
`--no-tests=error`, and prints how many tests ran, failed and were skipped, and which. A macOS build configured
with `-DCMAKE_OSX_DEPLOYMENT_TARGET=14.0` takes the same `std::pmr` path, so it shows this kind of error without a
Linux machine. `synthLibMidiClockTimingTest` is still left out of the run, from before `midiClock.cpp` and the test
were built with `-fno-fast-math` (2026-10-07); retry it on Linux CI.

## Windows

See [WINDOWS.md](WINDOWS.md): the Windows editor has used WebView2 since 0.3.2.

## CachyOS and Bitwig black-window report (B-172)

Reported on 2026-10-20: current CachyOS, Bitwig Studio 6, black editor. The exact editor/version and Bitwig
installation type are still needed. Keep the existing WebKitGTK renderer while investigating.

1. Record the editor version, exact Bitwig version, desktop/session and whether Bitwig is native/AUR or Flatpak.
   On CachyOS, these read-only commands identify the system and installed runtime packages:

   ```sh
   cat /etc/os-release
   printf 'session=%s display=%s wayland=%s\n' "$XDG_SESSION_TYPE" "$DISPLAY" "$WAYLAND_DISPLAY"
   pacman -Q webkit2gtk-4.1 gtk3 xorg-xwayland
   ```

   A missing package is evidence to investigate, not by itself proof of the cause.
   CachyOS provides [`webkit2gtk-4.1`](https://packages.cachyos.org/package/extra/x86_64/webkit2gtk-4.1).
2. For Flatpak, also collect `flatpak info com.bitwig.BitwigStudio`. Its app/runtime libraries are separate
   from the host's; a successful host `pacman -Q` does not prove WebKitGTK can load inside Bitwig.
   See [Bitwig's Flatpak instructions](https://www.bitwig.com/support/technical_support/installing-bitwig-studio-on-linux-via-flatpak-52/)
   and [Flatpak's runtime model](https://docs.flatpak.org/en/latest/basic-concepts.html).
3. Check the whole `.vst3` folder was copied, including `libgtk-3.so` and `libwebkit2gtk-4.0.so` beside the
   plug-in module in `Contents/x86_64-linux/`. The standalone also needs its two adjacent shims.
4. With the editor closed elsewhere, reproduce in Bitwig, wait at least 35 seconds, and save its terminal
   output and the editor's `editor-*.log` / `editor-*-previous.log` (Open Log Folder, if available).
   Capture these before starting the standalone, because another editor instance rotates the startup log.
   A `page up` line proves the bridge answered at that moment; it does not prove the page stayed visible.
   New builds also record the session/display variables, Flatpak ID and temporary directory in that log.
   Missing runtimes, helper launch failures and page-process termination produce distinct errors. The helper's
   terminal output includes loader errors and the selected WebKitGTK runtime. Do not disable the host's sandbox
   or change temporary-directory permissions as a workaround; keep that evidence for the report.
5. Start the standalone from the same release on the same desktop and record whether its page appears.
   Standalone failure points toward a shared runtime/page problem; standalone success narrows the check
   to the plug-in's environment, temporary helper and embedding in Bitwig.
6. To close the report, verify the VST3 in the reported Bitwig installation: visible page, ROM loading,
   parameter edits, playback, resize, editor close/reopen and project reload. Record the exact versions
   and logs. The current CI startup checks cover only part of this.
