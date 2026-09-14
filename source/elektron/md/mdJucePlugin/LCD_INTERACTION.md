# LCD rotary interaction

The LCD canvas exposes a second pointer target for the physical DATA ENTRY A-H
encoders. The existing panel knobs remain unchanged and available at all times.

## Initial scope

- Machinedrum and Monomachine synthesis parameter grids, including sparse grids.
- Machinedrum LFO edit.
- Machinedrum Master FX Echo, Reverb, EQ, and Dynamics pages.

Blank cells, menus, modal overlays, tab selectors, LEVEL fields, and all other
LCD widgets are deliberately inert. A plain click only acquires a drag target;
it never presses or turns an encoder. Dragging up or right increases the value,
dragging down or left decreases it, the mouse wheel turns it, and Command/Ctrl
reduces drag speed.

## Recognition boundary

Recognition uses only the published 128x64 front-panel framebuffer, visible
panel LEDs, and known host input state. It does not read firmware memory, use a
firmware screen enum, inspect the emulated program counter, or derive parameter
values from pixels. Screen signatures are fingerprints of observable output
from the exact MD 1.63 and MM 1.32b images already accepted by `RomLoader`.

The classifier fails closed: an unrecognized, incomplete, obscured, or empty
layout has no pointer targets. It runs only after relevant LCD or LED output
changes. A drag retains its resolved physical encoder and is cancelled if the
recognized surface or target identity changes.

## Tests

Repository tests use synthetic grids rather than firmware-rendered screenshots.
They cover sparse occupancy, fail-closed recognition, all three hit geometries,
viewport and padded-texture mapping, drag and wheel math, fine movement, hover
rendering, and MD/MM RmlUi event routing.

Set the CMake cache path `MD_LCD_TEST_CORPUS_DIR` to a private generated census
to add an exhaustive classifier replay test. The corpus and firmware are not
required by ordinary builds or CI and are not part of the repository.

The supported firmware is additionally exercised by a separate black-box
qualification harness during development. That harness drives ordinary
panel/SysEx inputs and checks published LCD/LED output; its firmware files,
framebuffer captures, and generated evidence are not product source or CI
fixtures.
