#!/usr/bin/env python3
"""App icons for the home screen, drawn from the favicon's design (a pipe in
section: jacket rim, insulation, pipe wall, bore) on the app's dark background.
Writes app/public/icons/{icon-192,icon-512,maskable-512,apple-touch-icon}.png.

    tools/.venv/bin/python tools/gen_icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "app" / "public" / "icons"
BG = "#1a1b1d"  # index.css body background
# favicon.svg, viewBox 32: radius -> fill, outermost first
RINGS = [(15, "#c9ccd0"), (13.5, "#d3cbbd"), (7, "#2b2d31"), (5.5, "#15161a")]
SS = 4  # supersampling for smooth edges


def icon(size, fill):
    """`fill` = the section's diameter as a fraction of the icon."""
    s = size * SS
    im = Image.new("RGB", (s, s), BG)
    d = ImageDraw.Draw(im)
    scale = fill * s / 30  # the outer ring is 30 units across
    c = s / 2
    for r, col in RINGS:
        rr = r * scale
        d.ellipse([c - rr, c - rr, c + rr, c + rr], fill=col)
    return im.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    icon(192, 0.74).save(OUT / "icon-192.png", optimize=True)
    icon(512, 0.74).save(OUT / "icon-512.png", optimize=True)
    # maskable: launchers crop to as little as the central 80 % circle
    icon(512, 0.6).save(OUT / "maskable-512.png", optimize=True)
    # iOS rounds the corners itself and wants no transparency
    icon(180, 0.7).save(OUT / "apple-touch-icon.png", optimize=True)
    print("icons written to", OUT)
