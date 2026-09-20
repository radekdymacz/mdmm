# Linux MD/MM preview

The x86-64 download contains both standalone applications and VST3 plug-ins.
This first Linux preview targets desktop systems with glibc 2.38 or newer.
The release binaries have been checked with Ubuntu 24.04 system libraries.
Older systems such as Ubuntu 22.04 and Debian 12 need a source build against
their own libraries; installing extra audio packages does not remove the
glibc minimum. Do not replace your system glibc manually.

## Install

Extract the ZIP. Copy the two `.vst3` directories from `VST3` into
`~/.vst3/`, then rescan plug-ins in your DAW. Keep each whole bundle intact.
Run either program in `Standalone` directly. No root installation is required.

On Ubuntu 24.04, these runtime packages cover audio and the X11-based UI:

```sh
sudo apt install libasound2t64 libasound2-plugins libgl1 \
  libx11-6 libxext6 libxcursor1 libxinerama1 libxrandr2 libxrender1 \
  libxcomposite1 libfreetype6 libfontconfig1
```

These are runtime packages, not development packages. Many desktop installs
already include them. On other distributions, use their packages providing
the same libraries. Under Wayland the UI requires XWayland. Native Wayland
and every distribution/DAW combination have not been qualified.

For standalone audio, choose an available ALSA device in Audio/MIDI Settings.
An ALSA PulseAudio bridge can use the desktop audio server; PipeWire systems
may provide that bridge through their PulseAudio-compatible service. Select
the device and buffer size appropriate to your audio setup.

On the first Machinedrum launch, let factory initialization finish before
sending notes or starting a song. Open the editor and wait until the normal
kit screen appears. The initial preparation can take tens of seconds; later
launches can reuse the local factory cache. Firmware is not included.

## Troubleshooting and test scope

- `GLIBC_2.38 not found`: this build needs a newer runtime or a source build
  made for your distribution.
- `libasound.so.2` or `libGL.so.1` missing: install the audio/OpenGL runtime
  packages above or your distribution's equivalents.
- No window: check that X11 or XWayland is available and that the application
  can connect to the desktop display.

Compatibility checks used an Ubuntu 24.04 container with a virtual X11
desktop and timed virtual audio output. They cover loading the packaged
modules, firmware-backed audio rendering, editor/state lifecycle and
standalone startup/shutdown. They do not certify physical audio drivers,
every host application, or real-time performance on other computers.
