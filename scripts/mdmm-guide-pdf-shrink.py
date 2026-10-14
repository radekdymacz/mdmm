#!/usr/bin/env python3
"""Shrink a guide PDF in place: Chrome embeds each screenshot as a lossless full-size image (the MD guide came to 43 MB);
this re-encodes every picture as JPEG, at most 1400 px wide, quality 82. Needs pypdf and Pillow."""
import io
import sys

from PIL import Image
from pypdf import PdfReader, PdfWriter

MAX_W, QUALITY = 1400, 82

def shrink(path):
	writer = PdfWriter(clone_from=PdfReader(path))
	for page in writer.pages:
		for img in page.images:
			pic = img.image.convert('RGB')
			if pic.width > MAX_W:
				pic = pic.resize((MAX_W, round(pic.height * MAX_W / pic.width)), Image.LANCZOS)
			img.replace(pic, quality=QUALITY)
	buf = io.BytesIO()
	writer.write(buf)
	with open(path, 'wb') as f:
		f.write(buf.getvalue())

for p in sys.argv[1:]:
	shrink(p)
	print(p)
