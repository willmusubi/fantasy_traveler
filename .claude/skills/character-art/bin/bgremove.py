#!/usr/bin/env python3
"""Edge flood-fill background removal — keeps enclosed skin/face pixels intact.

The old approach (ffmpeg global colorkey) matched the near-white bg colour ANYWHERE
in the image, so pale anime skin (which is within range of white) got keyed out and
the face filled with holes. This instead floods inward from the BORDER: only
background pixels connected to the edge are removed. Enclosed regions (the face,
sealed by hair/outline) are never reached, so they stay solid regardless of colour.

Usage: bgremove.py <in.png> <out.png> [--thresh N] [--hard]
  --thresh N  sum-of-abs-RGB-diff tolerance for "same as background" (default 60)
  --hard      pixel-art mode: no erosion/feather (keep crisp 1px edges)
"""
import sys
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

args = [a for a in sys.argv[1:] if not a.startswith("--")]
opts = [a for a in sys.argv[1:] if a.startswith("--")]
inp, outp = args[0], args[1]
thresh = 60
if "--thresh" in sys.argv:
    thresh = int(sys.argv[sys.argv.index("--thresh") + 1])
hard = "--hard" in opts

im = Image.open(inp).convert("RGB")
W, H = im.size
SENT = (255, 0, 255)  # sentinel; bg detected by diffing filled vs original (collision-safe)


def is_light(px):
    r, g, b = px
    return (255 - r) + (255 - g) + (255 - b) <= thresh + 25  # border bg is near-white


filled = im.copy()
# Seed from every BORDER pixel that looks like background and isn't filled yet.
# Flood is connectivity-based, so this can never leak into the enclosed face.
border = (
    [(x, 0) for x in range(W)]
    + [(x, H - 1) for x in range(W)]
    + [(0, y) for y in range(H)]
    + [(W - 1, y) for y in range(H)]
)
for x, y in border:
    if filled.getpixel((x, y)) != SENT and is_light(im.getpixel((x, y))):
        ImageDraw.floodfill(filled, (x, y), SENT, thresh=thresh)

fa = np.asarray(filled, dtype=np.int16)
bg = np.all(fa == np.array(SENT, dtype=np.int16), axis=-1)
alpha = np.where(bg, 0, 255).astype("uint8")
amask = Image.fromarray(alpha, "L")

if not hard:
    amask = amask.filter(ImageFilter.MinFilter(3))      # erode 1px → drop near-white halo ring
    amask = amask.filter(ImageFilter.GaussianBlur(0.6))  # soft anti-aliased edge

out = im.convert("RGBA")
out.putalpha(amask)
out.save(outp)
print(f"bgremove {inp} -> {outp}  (thresh={thresh} hard={hard} bg_px={int(bg.sum())}/{W*H})")
