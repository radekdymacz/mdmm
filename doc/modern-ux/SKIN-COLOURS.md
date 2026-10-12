# Skin colours, true to the product photos (0.6, branch `feat/0.6-skins`)

Radek, 2026-10-12: both editors look like the machines in the product photos; the MKI / MKII plate key chooses the
look. Only colour tokens change: no control moves, no new control. Values are pixel samples (median-cut over a box)
from the photos below, rounded and evened out by eye: photo white balance varies, JPEG blurs LCD pixels into the
ground (so ink colours are set darker than the raw sample), and small photos lose fine print.

Where they live: the Machinedrum's in `doc/modern-ux/mockup/index.html` ("Hardware-true pass"), the Monomachine's in
`doc/modern-ux/mm-mockup/src/20-mm.css` (the plate blocks); `sync-mdstudio-skin.py` and `sync-mmstudio-skin.py`
write them into `mdDesk.css` and `mmStudio.css`.

## Photos

| Ref | Machine | Source |
|---|---|---|
| A | Machinedrum SPS-1 (MKI) | Vintage Synth Explorer, vintagesynth.com/elektron/machinedrum-sps-1 (machinedrum.jpg) |
| B | Machinedrum SPS-1 (MKI) | Wikimedia Commons, File:Elektron MACHINEDRUM SPS-1.jpg |
| C | Machinedrum SPS-1UW (MKI, 2006) | Wikimedia Commons, File:Elektron MACHINEDRUM SPS-1UW on green.jpg |
| D | Machinedrum SPS-1 MKII | Greentoe product page Elektron_ES_SPS1MK2_std, images 1-4 (studio shots) |
| E | Monomachine SFX-60 (MKI) and SFX-6 | Vintage Synth Explorer, vintagesynth.com/elektron/monomachine-sfx-6 |
| F | Monomachine SFX-60+ MKII | Greentoe product page Elektron_ES_SFX60MK2_plus, image 1 |
| G | Monomachine SFX-60+ MKII | Vintage King product photo (sampled 2026-10-11, I-023) |

What the photos show: every Machinedrum is silver with a red backlit LCD (dark pixels) in a black window; the MKI
has brown print and tan label bars (C; A and B are colour-cast and read darker), the MKII dark grey print, maroon
label bars and red accents (D). The Monomachine MKI has a cooler silver, a light-blue LCD with black pixels, dark
green-grey keys and knobs and rust label bars (E); the MKII a warmer silver, a bluish-white LCD with black pixels,
black keys and knobs, white keys, dusty red-brown label bars and red print (F, G).

## Tokens

| Token | MD MKI | MD MKII | MM MKI | MM MKII |
|---|---|---|---|---|
| `--plate` (panel) | #d9dad6 (kept) | #d3d4cf (D #d3d4cf) | #cfd3d5 (E #abb2b3..#e8eaee) | #d2d1cc (F #cecdc8, G #e9e9e9) |
| `--plate2` / `--plate3` | #cdcec9 / #e5e6e2 | #c7c8c3 / #e0e1dc | #c3c8ca / #dde1e3 | #c6c5c0 / #e0dfda |
| `--print` / `--print2` / `--print3` | #94552b / #7a5a44 / #8d7a6c (kept) | #3e3a3b / #5f5a5a / #7d7878 | #2e3232 / #4f5554 / #6d7372 | #3b3a3c / #5a585a / #787577 |
| `--rule` | #b99a80 | #aca8a6 | #a2a8ab | #a8a6a1 |
| `--lcd` (LCD ground) | #f2432f (A #c90324 cast, D #f54033) | #f2432f (D #f54033) | #b6d2e8 (E #c5d5e9..#d6e5f5) | #dfeaf1 (F #c5d8e5, G #f2fcfb) |
| `--ink` (LCD pixels) | #3a0b07 | #3a0b07 | #0d1626 (E, I-023 #000000) | #121b28 (G #0e1a19) |
| `--bezel` (window) | - | - | #060707 (E #030303) | #1c1a1d (F #443f47 glossy, G #010101) |
| `--key` / `--key2` | #272a31 / #363a43 (A, B near black) | #20232b / #2f333c (D #131720..#2c2f3b) | #232b28 / #323c38 (E #020c0e, knobs #323e31) | #1a1c22 / #2a2d35 (F #151823, G #0a0a0a) |
| `--cream` (white keys) | #e9e4d6 (kept) | #e6e3d8 (D #e4e1d4) | #e4e6e6 (E #bdbec0 shaded) | #ecebe4 (G #fbf9f7) |
| `--labfill` (label bars) | #b07a4a (kept, C) | #5c1d19 (D #3d1614..#4a2724) | #9a3820 (E #98300b) | #84434d (F #9f616a with text) |
| `--rec` (COPY key, record) | #e0472e (kept) | #e5381f (D #e63722) | #e8301e (E #f0291a) | #e2452a (F, G #e33b21) |
| `--knob` | #2c2f35 | #3b3f47 (D) | #323d31 (E #323e31) | #141416 (G #010101) |
| `--ledoff` | #8a3a33 (kept) | #7a2f2a | #7b4035 (kept) | #7a6e66 (F #7a716a) |
| `--rust` / `--oxblood` (red print) | = print | #a8302a | #9a3820 | #b8433d |

`color-scheme` is `light` on all four plates.

## What changed against the old skins

- Machinedrum MKI: the LCD was yellow-green (#b3c03c); no Machinedrum photo shows one, so it is red as on the MKII.
  Keys and knobs darker (near black, as A, B, D).
- Machinedrum MKII: was a black panel (#161716) with white print; every MKII photo shows a silver panel. Now silver,
  dark print, maroon label bars, the same red LCD.
- Monomachine: MKI and MKII had one look (grey-green LCD #b9c4b0, the emulator's mmSfx60 skin). Now MKI light blue,
  MKII bluish-white, each with its own panel, keys and label colours.
- The Machinedrum's play-head column takes the light plates' style on both plates (it was MKI only).

The page theme: the Machinedrum's MKII was its dark look, and with no saved choice the MD page starts on MKII when
the system is in dark mode (mdDeskTop.js). With both plates silver the MD has no dark look on this branch.
