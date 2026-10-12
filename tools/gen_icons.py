#!/usr/bin/env python3
"""App icons for the home screen, drawn from favicon.svg (logo option A, in the
Watt Systems family style of JobWatt / PlanWatt / TimeWatt): a white frame, a
navy tile, and a pipe in section — aluminum jacket, gold insulation, pipe wall —
with the orange Watt bolt in the bore.
Writes app/public/icons/{icon-192,icon-512,maskable-512,apple-touch-icon}.png.

    tools/.venv/bin/python tools/gen_icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "app" / "public" / "icons"
NAVY = "#0F2340"
# favicon.svg, viewBox 100 centred on 50: radius -> fill, outermost first
RINGS = [(29, "#E6EBF0"), (25.5, "#F2B52A"), (12, "#E6EBF0"), (9, NAVY)]
# the bolt: translate(47.2 41) scale(0.7) of the Watt bolt path
BOLT = [(47.2 + 0.7 * x, 41 + 0.7 * y) for x, y in [(6.2, 0), (-3.6, 12.6), (1.6, 12.6), (-0.8, 25), (9, 12.4), (3.8, 12.4)]]
SS = 4  # supersampling for smooth edges


def icon(size, art, framed):
    """`art` = the 100-unit drawing's share of the icon; `framed` = white frame on transparent, else full-bleed navy."""
    s = size * SS
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0) if framed else NAVY)
    d = ImageDraw.Draw(im)
    k = art * s / 100
    o = (s - 100 * k) / 2
    P = lambda x, y: (o + x * k, o + y * k)
    if framed:
        d.rounded_rectangle([P(0, 0), P(100, 100)], radius=22 * k, fill="white")
        d.rounded_rectangle([P(10, 10), P(90, 90)], radius=14 * k, fill=NAVY)
    for r, col in RINGS:
        d.ellipse([P(50 - r, 50 - r), P(50 + r, 50 + r)], fill=col)
    pts = [P(x, y) for x, y in BOLT]
    d.polygon(pts, fill="#F97316")
    d.line(pts + [pts[0]], fill="white", width=max(1, round(1.2 * k)), joint="curve")
    return im.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    icon(192, 1.0, True).save(OUT / "icon-192.png", optimize=True)
    icon(512, 1.0, True).save(OUT / "icon-512.png", optimize=True)
    # maskable: launchers crop to as little as the central 80 % circle; the tile's navy fills the rest
    icon(512, 1.25, False).convert("RGB").save(OUT / "maskable-512.png", optimize=True)
    # iOS rounds the corners itself and wants no transparency: the navy tile edge to edge
    icon(180, 1.2, False).convert("RGB").save(OUT / "apple-touch-icon.png", optimize=True)
    print("icons written to", OUT)
