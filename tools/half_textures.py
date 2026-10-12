#!/usr/bin/env python3
"""Half-resolution copies of every texture set for phones: app/public/tex/<name>/
-> app/public/tex-half/<name>/ (same file names, same tile sizes).

At phone screen sizes a half-resolution map looks the same (the GPU samples a
smaller mip level anyway) and downloads about a quarter of the bytes. Albedo is
averaged in linear light, normals are re-normalised after averaging, roughness
is averaged as is.

    tools/.venv/bin/python tools/half_textures.py            # every set
    tools/.venv/bin/python tools/half_textures.py alu-smooth  # some sets

gen_textures.py runs this for the sets it writes.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "app" / "public" / "tex"
DST = ROOT / "app" / "public" / "tex-half"
MIN = 256
# WebP settings match gen_textures.save()
QUALITY = {"albedo.webp": 88, "normal.webp": 92, "rough.webp": 85}


def srgb_to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def halve(a):
    """2x2 box average (H and W even); keeps tiling seamless."""
    h, w = a.shape[:2]
    return a.reshape(h // 2, 2, w // 2, 2, *a.shape[2:]).mean(axis=(1, 3))


def shrink(img, kind):
    """Half the width and height."""
    a = np.asarray(img.convert("L" if kind == "rough.webp" else "RGB"), dtype=np.float64) / 255
    if kind == "albedo.webp":
        a = lin_to_srgb(halve(srgb_to_lin(a)))
    elif kind == "normal.webp":
        n = halve(a * 2 - 1)
        a = n / np.linalg.norm(n, axis=-1, keepdims=True).clip(1e-6) * 0.5 + 0.5
    else:
        a = halve(a)
    return Image.fromarray((a * 255 + 0.5).clip(0, 255).astype(np.uint8))


def run(names=None):
    sets = sorted(p for p in SRC.iterdir() if p.is_dir() and (not names or p.name in names))
    for d in sets:
        out = DST / d.name
        out.mkdir(parents=True, exist_ok=True)
        for kind, q in QUALITY.items():
            f = d / kind
            if not f.exists():
                continue
            img = Image.open(f)
            if img.width <= MIN:
                img.save(out / kind, "WEBP", quality=q, method=6)
                continue
            shrink(img, kind).save(out / kind, "WEBP", quality=q, method=6)
        print(f"  {d.name}: half")


if __name__ == "__main__":
    run(sys.argv[1:] or None)
