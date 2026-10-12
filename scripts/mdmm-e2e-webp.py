#!/usr/bin/env python3
"""scripts/mdmm-snap.py's pictures as WebP (lossy, quality 85, at most 1440 px wide), the raw PNGs and the page files
deleted: a full run's pictures are a few megabytes, not a few hundred. Prints the total size.
  scripts/mdmm-e2e-webp.py <raw folder> <out folder>
(Pillow; the raw folder is emptied of .png and .html.)"""
import os, sys
from PIL import Image
if len(sys.argv) != 3: sys.exit(__doc__)
raw, out = sys.argv[1:]
os.makedirs(out, exist_ok=True)
n = total = 0
for f in sorted(os.listdir(raw)):
    if not f.endswith('.png'): continue
    im = Image.open(os.path.join(raw, f)).convert('RGB')
    if im.width > 1440: im = im.resize((1440, round(im.height * 1440 / im.width)), Image.LANCZOS)
    dest = os.path.join(out, f[:-4] + '.webp')
    im.save(dest, 'WEBP', quality=85, method=6)
    total += os.path.getsize(dest); n += 1
    os.remove(os.path.join(raw, f))
    h = os.path.join(raw, f[:-4] + '.html')
    if os.path.exists(h): os.remove(h)
print('%d pictures, %.1f MB' % (n, total / 1e6))
