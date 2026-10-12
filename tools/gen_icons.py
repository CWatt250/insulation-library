#!/usr/bin/env python3
"""App icons for the home screen, drawn from favicon.svg: the Watt Systems mark
(navy tile, orange bolt outlined in white) over a pipe in section (aluminum
jacket rim, fiberglass, pipe wall, bore).
Writes app/public/icons/{icon-192,icon-512,maskable-512,apple-touch-icon}.png.

    tools/.venv/bin/python tools/gen_icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "app" / "public" / "icons"
NAVY = "#0F2340"  # Watt Systems tile (watt-systems-site/public/logo.svg)
ORANGE = ("#F97316", "#EA580C")  # the bolt's gradient, top to bottom
# favicon.svg, viewBox 32 centred on 16: radius -> fill, outermost first
RINGS = [(12.2, "#c9ccd0"), (11, "#e9c552"), (5.6, "#3a3d42"), (4.4, NAVY)]
BOLT = [(19.4, 3.4), (8.9, 16.9), (14.4, 16.9), (12, 28.6), (22.4, 15.1), (16.9, 15.1)]
SS = 4  # supersampling for smooth edges


def hexrgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def icon(size, art, tile_round):
    """`art` = the 32-unit drawing's share of the icon; `tile_round` = draw the rounded tile (else full bleed navy)."""
    s = size * SS
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0) if tile_round else hexrgb(NAVY) + (255,))
    d = ImageDraw.Draw(im)
    k = art * s / 32
    o = (s - 32 * k) / 2
    P = lambda x, y: (o + x * k, o + y * k)
    if tile_round:
        d.rounded_rectangle([P(0.5, 0.5), P(31.5, 31.5)], radius=6.5 * k, fill=NAVY)
    for r, col in RINGS:
        d.ellipse([P(16 - r, 16 - r), P(16 + r, 16 + r)], fill=col)
    pts = [P(x, y) for x, y in BOLT]
    # white outline, then the bolt (a vertical gradient through a mask)
    d.line(pts + [pts[0]], fill="white", width=max(1, round(0.9 * k)), joint="curve")
    grad = Image.new("RGBA", (s, s))
    a, b = hexrgb(ORANGE[0]), hexrgb(ORANGE[1])
    top, bot = P(0, 3.4)[1], P(0, 28.6)[1]
    gd = ImageDraw.Draw(grad)
    for y in range(s):
        t = min(1, max(0, (y - top) / (bot - top)))
        gd.line([(0, y), (s, y)], fill=tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3)) + (255,))
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).polygon(pts, fill=255)
    im.paste(grad, (0, 0), mask)
    return im.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    icon(192, 1.0, True).save(OUT / "icon-192.png", optimize=True)
    icon(512, 1.0, True).save(OUT / "icon-512.png", optimize=True)
    # maskable: launchers crop to as little as the central 80 % circle; full-bleed navy
    icon(512, 0.78, False).convert("RGB").save(OUT / "maskable-512.png", optimize=True)
    # iOS rounds the corners itself and wants no transparency
    icon(180, 1.08, False).convert("RGB").save(OUT / "apple-touch-icon.png", optimize=True)
    print("icons written to", OUT)
