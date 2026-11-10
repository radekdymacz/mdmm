# 0.9.1: UI consistency (I-063, I-064)

Shared whites and blacks, 16 slots per row in the PATTERN and KIT choosers, the MD Mix page fitting its window, the MM Multi map
dialog, one size set for the track lists. Details are in the commit and in `skins/shared/deskTokens.css`.

- **MD Mix fader floor (Radek, 2026-11-10):** fader floor 64 px on low windows (rule `clamp(64px, 100vh - 770px, 210px)`);
  compact the effect cards later if it looks wrong. Why: at 1309 x 834 the four effects need about 346 px and the page gave
  them 324, so the page scrolled; the fader is the part that gives. Journey `md-fit-mix` proves it and names the lowest
  element when it fails.
