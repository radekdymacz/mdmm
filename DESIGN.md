# Design: Machinedrum Editor + Monomachine Editor

The shape of the system. Why it exists is in [VISION.md](VISION.md). The layers in full, and how to add an engine, a document kind, a command, a workspace or a dialog, are in [doc/modern-ux/FOUNDATION.md](doc/modern-ux/FOUNDATION.md). Why it is shaped this way: [doc/modern-ux/DESIGN-P6-simple-core.md](doc/modern-ux/DESIGN-P6-simple-core.md).

## The shape

```
page (view) --intents--> Core<Model> --commands--> machine adapter --bytes--> firmware or real machine
     ^                    documents: observed + pending                               |
     +------ documents, machine, capabilities <------------ observed, settled --------+
```

- **Page.** One web page per editor, in WKWebView (macOS), WebView2 (Windows) or WebKitGTK (Linux). It renders views of the documents and sends intents. It decides what is possible from capabilities only.
- **Core.** One generic core per model, engine-neutral: the command table, pure edits, undo, clipboard, and documents as values (pattern, kit, song, global). Observed and pending values are kept apart, so a refused change never shows as taken.
- **Machine adapter.** One per way to reach a machine: the emulated firmware, or a real machine over MIDI. Data in, data out.
- **Session.** Owned by the plug-in processor, so documents and undo outlive the window.
- **Emulator.** The machine's firmware runs on our DSP56300 JIT and 68k cores (`source/dsp56300`, `source/mc68k`) inside `mdLib`.

## Rules we keep

- Simple over easy: values, not shared state; time is waited for, not guessed.
- Dependencies run downward only.
- Spec before code (hammock). Each feature has a short spec in `doc/release/` before its branch.
- Every speed-up is bit-exact, on by default and behind one umbrella switch. Anything that changes the sound is opt-in.
- Real-time safety: DOM changes on the message thread, no allocation on the audio thread, `baseLib::isFinite` instead of `std::isfinite` (the Release build is `-Ofast`).
- Plug-in identity is set once in `scripts/mdmm-product.env`. Changing it orphans saved DAW projects.
- Local is for editing. GitHub Actions does all validation and packages.

## Where things are

| Folder | What |
|---|---|
| `source/elektron/md/` | The machines, data layer, desks, plug-ins, page, updater and tests |
| `source/dsp56300/`, `source/mc68k/` | The emulator cores |
| `source/synthLib/`, `jucePlugin*`, `baseLib/` | The shared plug-in framework |
| `site/` | mdmm.dev |
| `doc/` | Design, research, release notes, bug and idea logs |
