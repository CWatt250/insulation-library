"""Procedural, tileable PBR texture generator for the insulation viewer.

Every texture is synthesised in the frequency domain (or with wrap-around
stamping) so it tiles seamlessly. Each material writes three maps into
app/public/tex/<name>/:  albedo.webp (sRGB), normal.webp (OpenGL +Y), rough.webp.

Physical scale: each texture covers TILE_MM millimetres, recorded in
app/src/data/textureScales.json so the app maps textures 1:1 to real size.

Colours were sampled from reference photos in research/refs/ (see SOURCES.md).
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "app" / "public" / "tex"
SCALES = ROOT / "app" / "src" / "data" / "textureScales.json"
N = 1024


# ---------------------------------------------------------------- primitives
def rng(seed):
    return np.random.default_rng(seed)


def spectral(n, seed, beta=2.0, fmin=1.0, fmax=None, stretch=(1.0, 1.0)):
    """Periodic 1/f^beta noise, normalised to [-1, 1].

    stretch=(sx, 1) with sx << 1 makes streaks that run along the image's
    vertical axis (texture V)."""
    r = rng(seed)
    fx = np.fft.fftfreq(n) * n
    fy = np.fft.fftfreq(n) * n
    FX, FY = np.meshgrid(fx, fy)
    f = np.sqrt((FX * stretch[0]) ** 2 + (FY * stretch[1]) ** 2)
    f[0, 0] = 1.0
    amp = f ** (-beta / 2.0)
    amp[f < fmin] = 0.0
    if fmax is not None:
        amp *= np.exp(-((f / fmax) ** 2))
    phase = r.uniform(0, 2 * np.pi, (n, n))
    spec = amp * np.exp(1j * phase)
    img = np.real(np.fft.ifft2(spec))
    img -= img.mean()
    m = np.abs(img).max()
    return img / (m if m else 1)


def worley(n, count, seed, jitter_pts=None):
    """Periodic F1/F2 cellular distances (in pixels)."""
    r = rng(seed)
    pts = r.uniform(0, n, (count, 2)) if jitter_pts is None else jitter_pts
    tiles = np.concatenate([pts + np.array([dx, dy]) * n
                            for dx in (-1, 0, 1) for dy in (-1, 0, 1)])
    tree = cKDTree(tiles)
    yy, xx = np.mgrid[0:n, 0:n]
    q = np.stack([xx.ravel() + 0.5, yy.ravel() + 0.5], 1)
    d, idx = tree.query(q, k=2, workers=8)
    f1 = d[:, 0].reshape(n, n)
    f2 = d[:, 1].reshape(n, n)
    cell = (idx[:, 0] % count).reshape(n, n)
    return f1, f2, cell


def stamp_pits(h, count, rmin, rmax, depth, seed, ao=None):
    """Carve round pits (pinholes / cells) with wrap-around."""
    n = h.shape[0]
    r = rng(seed)
    for _ in range(count):
        cx, cy = r.uniform(0, n, 2)
        rad = r.uniform(rmin, rmax) * (r.random() ** 2 * 0.8 + 0.2) ** 0.5
        R = int(np.ceil(rad)) + 1
        xs = (np.arange(int(cx) - R, int(cx) + R + 1)) % n
        ys = (np.arange(int(cy) - R, int(cy) + R + 1)) % n
        gx, gy = np.meshgrid(np.arange(int(cx) - R, int(cx) + R + 1) - cx,
                             np.arange(int(cy) - R, int(cy) + R + 1) - cy)
        dd = np.sqrt(gx ** 2 + gy ** 2) / rad
        bowl = np.where(dd < 1, np.sqrt(np.clip(1 - dd ** 2, 0, 1)), 0) * depth
        h[np.ix_(ys, xs)] -= bowl
        if ao is not None:
            ao[np.ix_(ys, xs)] = np.minimum(ao[np.ix_(ys, xs)], 1 - 0.55 * (dd < 1) * (1 - dd * 0.6))
    return h


def periodic_blur(h, sigma_px):
    """Gaussian blur with wrap-around (FFT), keeps textures tileable."""
    n = h.shape[0]
    f = np.fft.fftfreq(n)
    FX, FY = np.meshgrid(f, f)
    k = np.exp(-2 * (np.pi * sigma_px) ** 2 * (FX ** 2 + FY ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(h) * k))


def slope(h):
    """Rescale a periodic height field so its RMS gradient (per pixel) is 1.
    Weighted sums of slope()-normalised fields then read as typical slopes."""
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    return h / (np.sqrt((gx ** 2 + gy ** 2).mean()) + 1e-12)


def normal_from_height(h, strength):
    """Tangent-space normal map (OpenGL convention, +Y up) from a periodic height field."""
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    nx, ny, nz = -dx * strength, dy * strength, np.ones_like(h)
    l = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
    return np.stack([nx / l, ny / l, nz / l], -1)


def hex_rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float) / 255.0


def srgb_to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def save(name, albedo_lin, normal, rough, tile_mm, scales):
    """Write WebP maps (albedo sRGB, OpenGL normal, roughness) and record the tile size."""
    d = OUT / name
    d.mkdir(parents=True, exist_ok=True)
    Image.fromarray((lin_to_srgb(albedo_lin) * 255 + 0.5).astype(np.uint8)).save(d / "albedo.webp", "WEBP", quality=88, method=6)
    Image.fromarray(((normal * 0.5 + 0.5) * 255 + 0.5).astype(np.uint8)).save(d / "normal.webp", "WEBP", quality=92, method=6)
    Image.fromarray((np.clip(rough, 0, 1) * 255 + 0.5).astype(np.uint8)).save(d / "rough.webp", "WEBP", quality=85, method=6)
    scales[name] = tile_mm
    print(f"  {name}: {tile_mm} mm tile")


def tint(base_hex, variation):
    """Linear albedo from a base sRGB colour and a per-pixel luminance multiplier."""
    base = srgb_to_lin(hex_rgb(base_hex))
    return base[None, None, :] * variation[..., None]


# ------------------------------------------------------------------ materials
# Pixel scale: tile_mm / N mm per pixel.

def calsil(scales):
    tile = 160.0
    px = N / tile  # pixels per mm
    # Molded skin: chalky, faint low-freq mottling, pinholes 0.5-3 mm.
    mott = spectral(N, 11, beta=3.2, fmin=1)
    grain = spectral(N, 12, beta=0.6, fmin=40)
    h = 0.04 * slope(spectral(N, 13, beta=2.6, fmin=2)) + 0.07 * slope(grain)
    ao = np.ones((N, N))
    h = stamp_pits(h, 260, 0.25 * px, 1.4 * px, 0.45 * px, 14, ao)
    h = stamp_pits(h, 1600, 0.08 * px, 0.3 * px, 0.12 * px, 15, ao)
    var = 1.0 + 0.045 * mott + 0.025 * grain
    alb = tint("#CDC4B4", var * (0.62 + 0.38 * ao))
    rough = 0.94 + 0.03 * grain
    save("calsil-molded", alb, normal_from_height(h, 1.0), rough, tile, scales)

    # Saw-cut face: parallel striations ~1-2 mm (run along U), torn grains, pinholes.
    stri = spectral(N, 21, beta=1.6, fmin=4, stretch=(0.02, 1.0))
    stri2 = spectral(N, 22, beta=1.0, fmin=30, stretch=(0.05, 1.0))
    h = 0.40 * slope(stri) + 0.30 * slope(stri2) + 0.12 * slope(spectral(N, 23, beta=0.8, fmin=60))
    ao = np.ones((N, N))
    h = stamp_pits(h, 420, 0.2 * px, 1.6 * px, 0.5 * px, 24, ao)
    h = stamp_pits(h, 2400, 0.06 * px, 0.25 * px, 0.15 * px, 25, ao)
    var = 1.0 + 0.04 * mott + 0.07 * stri2 + 0.05 * stri
    alb = tint("#D2C9BA", var * (0.58 + 0.42 * ao))
    rough = 0.96 + 0.02 * stri2
    save("calsil-cut", alb, normal_from_height(h, 1.0), rough, tile, scales)


def aluminum(scales):
    # Mill-finish (smooth) 3003 jacketing: rolling streaks along U, faint smudges,
    # and low-frequency "oil-canning" ripples that wobble reflections like real sheet.
    # Built with streaks along V, then transposed so they run around the pipe.
    tile = 900.0
    n2 = 2048
    streak = spectral(n2, 31, beta=1.2, fmin=2, stretch=(0.004, 1.0))
    streak_f = spectral(n2, 32, beta=0.7, fmin=60, stretch=(0.01, 1.0))
    smudge = spectral(n2, 33, beta=3.4, fmin=1)
    blot = np.clip(spectral(n2, 34, beta=2.8, fmin=2) * 2.2 - 0.6, 0, 1)
    ripple = spectral(n2, 39, beta=3.0, fmin=3, fmax=14, stretch=(0.3, 1.0))
    var = 1.0 + 0.025 * streak + 0.02 * smudge - 0.05 * blot
    alb = tint("#EDEFF0", var)
    rough = 0.28 + 0.03 * streak + 0.012 * streak_f + 0.06 * np.clip(smudge, 0, 1) + 0.08 * blot
    h = 0.0015 * slope(streak_f) + 0.0015 * slope(streak) + 0.006 * slope(ripple)
    T = lambda a: np.swapaxes(a, 0, 1)
    save("alu-smooth", T(alb), T(normal_from_height(h, 1.0))[..., [1, 0, 2]] * [-1, -1, 1], T(rough), tile, scales)

    # Stucco-embossed: closely packed rounded pebbles (~3-4 mm) rolled into the
    # sheet: soft domes separated by narrow creases, low relief, fine sparkle.
    # Built on a jittered grid (Poisson-like spacing, no clumps), at 2048 px.
    tile = 120.0
    n2 = 2048
    px = n2 / tile
    spacing = 3.4  # mm
    g = int(round(tile / spacing))
    r = rng(35)
    gy, gx = np.mgrid[0:g, 0:g]
    pts = np.stack([(gx + 0.5 + r.uniform(-0.38, 0.38, gx.shape)) * n2 / g,
                    (gy + 0.5 + r.uniform(-0.38, 0.38, gy.shape)) * n2 / g], -1).reshape(-1, 2)
    f1, f2, _ = worley(n2, len(pts), 35, jitter_pts=pts)
    crease = np.clip((f2 - f1) / (0.55 * px), 0, 1)  # 0 on cell borders
    dome = np.sqrt(np.clip(1 - (f1 / (0.62 * spacing * px)) ** 2, 0, 1))
    h_cells = periodic_blur(0.6 * dome + 0.4 * np.sqrt(crease), 0.45 * px)
    warpn = spectral(n2, 36, beta=2.0, fmin=6)
    h = 0.11 * slope(h_cells) + 0.015 * slope(warpn) + 0.01 * slope(spectral(n2, 37, beta=0.8, fmin=80))
    smudge = spectral(n2, 38, beta=3.4, fmin=1)
    var = 1.0 + 0.02 * smudge - 0.05 * (1 - crease) ** 3
    alb = tint("#EAECED", var)
    rough = 0.30 + 0.08 * (1 - crease) ** 2 + 0.05 * np.clip(smudge, 0, 1)
    save("alu-stucco", alb, normal_from_height(h, 1.0), rough, tile, scales)


def stainless(scales):
    # 2B / dull-mill 304 SS jacket & bands: cooler, darker, finer streaks.
    tile = 300.0
    streak = spectral(N, 41, beta=1.0, fmin=4, stretch=(0.003, 1.0))
    smudge = spectral(N, 42, beta=3.4, fmin=1)
    var = 1.0 + 0.02 * streak + 0.02 * smudge
    alb = tint("#C3C6C9", var)
    rough = 0.30 + 0.05 * streak + 0.05 * np.clip(smudge, 0, 1)
    T = lambda a: np.swapaxes(a, 0, 1)
    save("ss-2b", T(alb), T(normal_from_height(0.01 * slope(streak), 1.0))[..., [1, 0, 2]] * [-1, -1, 1], T(rough), tile, scales)


def carbon_steel(scales):
    # Mill-scale pipe: blue-black scale, lighter scuffs, rust bloom.
    tile = 300.0
    base = spectral(N, 51, beta=2.4, fmin=1)
    scuff = np.clip(spectral(N, 52, beta=1.4, fmin=3, stretch=(0.05, 1.0)) * 2.5 - 0.9, 0, 1)
    rust = np.clip(spectral(N, 53, beta=2.2, fmin=2) * 2.4 - 1.0, 0, 1)
    rust_f = spectral(N, 54, beta=0.8, fmin=40)
    scale_col = srgb_to_lin(hex_rgb("#505357"))
    bare_col = srgb_to_lin(hex_rgb("#6E6F70"))
    rust_col = srgb_to_lin(hex_rgb("#6B3A1E"))
    alb = (scale_col[None, None] * (1 + 0.15 * base)[..., None])
    alb = alb * (1 - scuff[..., None]) + bare_col[None, None] * scuff[..., None]
    rk = np.clip(rust * (0.8 + 0.4 * rust_f), 0, 1)[..., None]
    alb = alb * (1 - rk) + rust_col[None, None] * rk
    rough = 0.55 + 0.12 * base - 0.2 * scuff + 0.35 * rk[..., 0]
    h = 0.02 * slope(base) + 0.25 * slope(rk[..., 0] * rust_f) + 0.05 * slope(scuff)
    save("steel-millscale", alb, normal_from_height(h, 1.0), rough, tile, scales)


# ============================================================ soft materials
# Orientation vocabulary used below (texture space):
#   "along U" = features elongated horizontally in the image (rows),
#   "along V" = elongated vertically. spectral(stretch=(1, r)) with r << 1
#   gives streaks along U; stretch=(r, 1) gives streaks along V.

from scipy.ndimage import map_coordinates  # noqa: E402


def warp_field(n, seed, amp_px, beta=2.6, fmin=2, fmax=None, stretch=(1.0, 1.0)):
    """Periodic displacement field (dx, dy) in pixels, for domain warping."""
    return (spectral(n, seed, beta=beta, fmin=fmin, fmax=fmax, stretch=stretch) * amp_px,
            spectral(n, seed + 1, beta=beta, fmin=fmin, fmax=fmax, stretch=stretch) * amp_px)


def warp(img, dx, dy):
    """Sample a periodic image at (x + dx, y + dy) with wrap-around."""
    n = img.shape[0]
    yy, xx = np.mgrid[0:n, 0:n].astype(float)
    return map_coordinates(img, [yy + dy, xx + dx], order=1, mode="grid-wrap")


def mix_hex(a, b, t):
    """Linear-space blend between two sRGB hex colours by a [0,1] field."""
    ca = srgb_to_lin(hex_rgb(a))
    cb = srgb_to_lin(hex_rgb(b))
    t = np.clip(t, 0, 1)[..., None]
    return ca[None, None] * (1 - t) + cb[None, None] * t


def disc_mask(n, count, rmin, rmax, seed, soft=0.4):
    """Soft discs with wrap-around (specks, voids, glints). Returns a [0,1] mask."""
    m = np.zeros((n, n))
    r = rng(seed)
    for _ in range(count):
        cx, cy = r.uniform(0, n, 2)
        rad = max(r.uniform(rmin, rmax), 0.6)
        R = int(np.ceil(rad)) + 2
        ix = np.arange(int(cx) - R, int(cx) + R + 1)
        iy = np.arange(int(cy) - R, int(cy) + R + 1)
        gx, gy = np.meshgrid(ix - cx, iy - cy)
        v = np.clip((1 - np.sqrt(gx ** 2 + gy ** 2) / rad) / soft, 0, 1)
        sub = np.ix_(iy % n, ix % n)
        m[sub] = np.maximum(m[sub], v)
    return m


def foam_cells(n, cell_px, seed, aspect=1.0, jitter=0.45, drop=0.0, wdx=None, wdy=None, with_rin=False,
               relax=0):
    """Periodic Voronoi from a jittered grid (foam-like, no slivers).

    aspect > 1 stretches cells along U. drop removes a fraction of seeds so some
    cells merge into larger ones (natural size spread). Optional warp fields
    curve the cell walls. Returns (f1, edge, cell_id, count): distance to the
    cell seed and exact distance to the nearest cell wall, in scaled pixels."""
    r = rng(seed)
    w = n / aspect
    gx = max(2, int(round(w / cell_px)))
    gy = max(2, int(round(n / cell_px)))
    cw, ch = w / gx, n / gy
    I, J = np.meshgrid(np.arange(gx), np.arange(gy))
    px_ = (I.ravel() + 0.5 + r.uniform(-jitter, jitter, I.size)) * cw
    py_ = (J.ravel() + 0.5 + r.uniform(-jitter, jitter, I.size)) * ch
    pts = np.stack([px_, py_], 1)
    if drop > 0:
        pts = pts[r.random(len(pts)) >= drop]
    count = len(pts)
    # Lloyd relaxation (periodic) -> more even cells, like real foam bubbles
    if relax:
        m = 384
        gy_, gx_ = np.mgrid[0:m, 0:m].astype(float)
        grid = np.stack([(gx_.ravel() + 0.5) * w / m, (gy_.ravel() + 0.5) * n / m], 1)
        for _ in range(relax):
            tl = np.concatenate([pts + np.array([dx * w, dy * n]) for dx in (-1, 0, 1) for dy in (-1, 0, 1)])
            _, ii = cKDTree(tl).query(grid, workers=8)
            delta = grid - tl[ii]
            c = ii % count
            cnt = np.maximum(np.bincount(c, minlength=count), 1)
            pts = pts + np.stack([np.bincount(c, delta[:, 0], count), np.bincount(c, delta[:, 1], count)], 1) / cnt[:, None]
            pts = np.mod(pts, [w, n])
    tiles = np.concatenate([pts + np.array([dx * w, dy * n]) for dx in (-1, 0, 1) for dy in (-1, 0, 1)])
    tree = cKDTree(tiles)
    yy, xx = np.mgrid[0:n, 0:n].astype(float)
    if wdx is not None:
        xx = xx + wdx
        yy = yy + wdy
    q = np.stack([((xx.ravel() + 0.5) % n) / aspect, (yy.ravel() + 0.5) % n], 1)
    d, idx = tree.query(q, k=5, workers=8)
    p1 = tiles[idx[:, 0]]
    edge = np.full(len(q), np.inf)
    for j in range(1, 5):
        pj = tiles[idx[:, j]]
        sep = np.linalg.norm(pj - p1, axis=1)
        edge = np.minimum(edge, (d[:, j] ** 2 - d[:, 0] ** 2) / (2 * np.maximum(sep, 1e-6)))
    out = (d[:, 0].reshape(n, n), edge.reshape(n, n), (idx[:, 0] % count).reshape(n, n), count)
    if with_rin:  # inscribed radius of each cell = half the distance to its nearest neighbour seed
        rin = tree.query(pts, k=2)[0][:, 1] * 0.5
        out = out + (rin,)
    return out


def laminations(n, k, seed, warp_px, jitter_px):
    """Concentric-lamination field for wound fibrous pipe sections.

    Layers run along U (horizontal rows), k per tile stacked along V, with
    wavy boundaries and uneven spacing. Returns (layer_index, frac, seam)."""
    yy = np.mgrid[0:n, 0:n][0].astype(float)
    _, dy = warp_field(n, seed, warp_px, beta=3.0, fmin=1, stretch=(1.0, 0.6))
    jit = spectral(n, seed + 7, beta=2.2, fmin=1, stretch=(1.0, 0.3)) * jitter_px
    phase = (yy + dy + jit) * k / n
    li = np.mod(np.floor(phase).astype(int), k)
    fr = phase - np.floor(phase)
    seam = np.exp(-(fr / 0.045) ** 2) + np.exp(-((1 - fr) / 0.045) ** 2)
    return li, fr, seam


def fiberglass(scales):
    # ---- cut face (OC golden): laminations along U, ~2-6 mm apart, felted fibres.
    tile = 100.0
    n = N
    px = n / tile
    li, fr, seam = laminations(n, 24, 101, 1.4 * px, 1.6 * px)
    soft_seam = np.exp(-(fr / 0.14) ** 2) + np.exp(-((1 - fr) / 0.14) ** 2)
    lay = rng(102).uniform(-1, 1, 24)[li]
    wdx, wdy = warp_field(n, 103, 0.8 * px, beta=2.4, fmin=3, stretch=(1.0, 0.5))
    fib1 = warp(spectral(n, 104, beta=0.8, fmin=40, stretch=(1.0, 0.07)), wdx, wdy)
    fib2 = warp(spectral(n, 105, beta=1.5, fmin=8, stretch=(1.0, 0.18)), wdx, wdy)
    wisp_a = warp(spectral(n, 110, beta=2.0, fmin=5, stretch=(1.0, 0.15)), wdx, wdy)
    wisp_b = warp(spectral(n, 111, beta=2.0, fmin=5, stretch=(1.0, 0.15)), wdx, wdy)
    fuzz = spectral(n, 106, beta=0.2, fmin=200)
    mott = spectral(n, 107, beta=3.0, fmin=1)
    clump = np.clip(spectral(n, 108, beta=2.0, fmin=6) * 2.0, -1, 1)
    light = 0.7 * np.clip(wisp_a * 1.8 - 0.25, 0, 1) ** 1.2   # pale fibre bundles
    deep = 0.7 * np.clip(wisp_b * 1.8 - 0.35, 0, 1) ** 1.2    # binder-rich darker streaks
    h = (0.34 * slope(fib1) + 0.22 * slope(fib2) + 0.10 * slope(fuzz) + 0.10 * slope(clump)
         + 0.10 * slope(wisp_a) - seam * px * 0.05)
    t = 0.5 + 0.14 * fib2 + 0.14 * mott + 0.1 * lay + 0.16 * fib1 + 0.06 * clump
    alb = mix_hex("#E3B03E", "#F5D677", t)
    alb = alb * (1 - light[..., None]) + srgb_to_lin(hex_rgb("#FBEAAE"))[None, None] * light[..., None]
    alb = alb * (1 - 0.8 * deep[..., None]) + srgb_to_lin(hex_rgb("#CF9426"))[None, None] * 0.8 * deep[..., None]
    alb *= (1 + 0.07 * fuzz - 0.07 * soft_seam - 0.06 * seam)[..., None]
    glint = disc_mask(n, 2600, 0.6, 1.3, 109)
    rough = 0.88 + 0.04 * fuzz + 0.03 * fib1
    rough = rough * (1 - 0.6 * glint)
    save("fiberglass-cut", alb, normal_from_height(h, 1.0), rough, tile, scales)

    # ---- bare outer surface: smoother, faint lengthwise streaks (along V = pipe axis).
    tile = 150.0
    px = n / tile
    st1 = spectral(n, 111, beta=1.2, fmin=4, stretch=(0.03, 1.0))
    st2 = spectral(n, 112, beta=0.7, fmin=40, stretch=(0.06, 1.0))
    fuzz = spectral(n, 113, beta=0.2, fmin=200)
    mott = spectral(n, 114, beta=3.0, fmin=1)
    h = 0.08 * slope(st1) + 0.14 * slope(st2) + 0.09 * slope(fuzz) + 0.03 * slope(mott)
    t = 0.55 + 0.22 * mott + 0.2 * st1 + 0.12 * st2
    alb = mix_hex("#DDA838", "#F7DC80", t) * (1 + 0.06 * fuzz)[..., None]
    glint = disc_mask(n, 1500, 0.6, 1.1, 115)
    rough = (0.84 + 0.04 * fuzz) * (1 - 0.55 * glint)
    save("fiberglass-skin", alb, normal_from_height(h, 1.0), rough, tile, scales)

    # ---- bore: quilted waffle imprint from the forming mandrel, ~3.5 mm cells.
    tile = 98.0
    px = n / tile
    k = 28
    yy, xx = np.mgrid[0:n, 0:n].astype(float)
    wx, wy = warp_field(n, 116, 0.8 * px, beta=2.4, fmin=3)
    xw, yw = xx + wx, yy + wy
    pu = np.abs(np.sin(np.pi * xw * k / n))
    pv = np.abs(np.sin(np.pi * yw * k / n))
    ci = (np.mod(np.floor(xw * k / n), k) + k * np.mod(np.floor(yw * k / n), k)).astype(int)
    camp = 0.75 + 0.5 * rng(117).random(k * k)[ci]
    pillow = (pu * pv) ** 0.7 * camp
    pillow = pillow * (0.75 + 0.25 * spectral(n, 122, beta=1.8, fmin=6))  # uneven mesh pressure
    fuzz = spectral(n, 118, beta=0.2, fmin=200)
    fib = spectral(n, 119, beta=0.9, fmin=30, stretch=(1.0, 0.15))
    mott = spectral(n, 120, beta=3.0, fmin=1)
    h = pillow * 0.12 * px + 0.14 * slope(fuzz) + 0.18 * slope(fib)
    t = 0.45 + 0.22 * mott + 0.16 * fib + 0.12 * (pillow - 0.5)
    alb = mix_hex("#D29A2E", "#F0CF68", t) * (0.9 + 0.1 * np.clip(pillow, 0, 1) + 0.06 * fuzz)[..., None]
    glint = disc_mask(n, 1500, 0.6, 1.1, 121)
    rough = (0.9 + 0.03 * fuzz) * (1 - 0.55 * glint)
    save("fiberglass-bore", alb, normal_from_height(h, 1.0), rough, tile, scales)


def mineralwool(scales):
    # ---- cut face: olive tan, coarse wavy laminations along U, torn tufts, shot specks.
    tile = 120.0
    n = N
    px = n / tile
    li, fr, seam = laminations(n, 15, 201, 3.0 * px, 2.5 * px)
    soft_seam = np.exp(-(fr / 0.12) ** 2) + np.exp(-((1 - fr) / 0.12) ** 2)
    lay = rng(202).uniform(-1, 1, 15)[li]
    wdx, wdy = warp_field(n, 203, 1.6 * px, beta=2.2, fmin=3, stretch=(1.0, 0.6))
    fib1 = warp(spectral(n, 204, beta=0.9, fmin=25, stretch=(1.0, 0.16)), wdx, wdy)
    fib2 = warp(spectral(n, 205, beta=1.6, fmin=5, stretch=(1.0, 0.3)), wdx, wdy)
    strand = warp(spectral(n, 218, beta=1.4, fmin=10, stretch=(1.0, 0.12)), wdx, wdy)
    tuft = np.clip(spectral(n, 206, beta=1.6, fmin=8) * 2.4, -1, 1)
    fuzz = spectral(n, 207, beta=0.2, fmin=200)
    mott = spectral(n, 208, beta=3.0, fmin=1)
    shot = disc_mask(n, 260, 0.6, 0.28 * px, 209, soft=0.7)
    shot_f = disc_mask(n, 1800, 0.6, 1.0, 210, soft=0.8)
    pale = 0.85 * np.clip(strand * 2.2 - 0.15, 0, 1) ** 1.1
    voids = np.clip(-tuft * 1.4 - 0.5, 0, 1) * np.clip(fib1 * 2 + 0.5, 0, 1)
    h = (0.34 * slope(fib1) + 0.26 * slope(fib2) + 0.24 * slope(tuft) + 0.12 * slope(fuzz)
         + 0.14 * slope(strand) - seam * px * 0.06 + shot * px * 0.03)
    t = 0.5 + 0.22 * fib2 + 0.14 * mott + 0.1 * lay + 0.14 * tuft + 0.3 * fib1
    alb = mix_hex("#958349", "#C9BE92", t) * (1 - 0.35 * voids)[..., None]
    alb = alb * (1 - pale[..., None]) + srgb_to_lin(hex_rgb("#D9D0A8"))[None, None] * pale[..., None]
    alb *= (1 + 0.09 * fuzz - 0.08 * soft_seam - 0.06 * seam)[..., None]
    dark = srgb_to_lin(hex_rgb("#3A3528"))[None, None]
    sm = np.clip(np.maximum(0.85 * shot, 0.55 * shot_f), 0, 1)[..., None]
    alb = alb * (1 - sm) + dark * sm
    rough = 0.93 + 0.03 * fuzz - 0.3 * np.maximum(shot, 0.6 * shot_f)  # shot beads are glassy
    save("mineralwool-cut", alb, normal_from_height(h, 1.0), rough, tile, scales)

    # ---- pressed skin: rows of slanted dashes, alternating direction row to row.
    # Rows run along U (around the pipe), 24 rows x 4.5 mm stacked along V.
    tile = 108.0
    px = n / tile
    rows, ridges = 24, 36
    yy, xx = np.mgrid[0:n, 0:n].astype(float)
    wx, wy = warp_field(n, 211, 0.8 * px, beta=2.4, fmin=3)
    xw, yw = xx + wx, yy + wy
    rowf = yw * rows / n
    ri = np.mod(np.floor(rowf).astype(int), rows)
    rl = rowf - np.floor(rowf)
    sgn = np.where(ri % 2 == 0, 1.0, -1.0)
    roff = rng(212).random(rows)[ri]
    ph = xw * ridges / n + sgn * rl * 0.85 + roff
    ridge = (0.5 + 0.5 * np.cos(2 * np.pi * ph)) ** 1.4
    rgroove = np.exp(-(rl / 0.09) ** 2) + np.exp(-((1 - rl) / 0.09) ** 2)
    fuzz = spectral(n, 213, beta=0.2, fmin=200)
    fib = spectral(n, 214, beta=0.9, fmin=25)
    mott = spectral(n, 215, beta=3.0, fmin=1)
    patch = np.clip(spectral(n, 216, beta=2.4, fmin=3) * 2.0, 0, 1)  # less-pressed areas
    relief = ridge * (1 - 0.75 * rgroove) * (1 - 0.6 * patch)
    tuft = np.clip(spectral(n, 219, beta=1.6, fmin=10) * 2.2, -1, 1)
    h = relief * 0.12 * px + 0.22 * slope(fib) + 0.14 * slope(fuzz) + 0.12 * slope(tuft)
    t = 0.5 + 0.18 * mott + 0.2 * fib + 0.3 * (relief - 0.4) + 0.1 * patch + 0.08 * tuft
    alb = mix_hex("#AFA26F", "#D8CEA6", t) * (1 + 0.06 * fuzz)[..., None]
    shot = disc_mask(n, 500, 0.6, 0.25 * px, 217, soft=0.6)[..., None]
    alb = alb * (1 - 0.6 * shot) + srgb_to_lin(hex_rgb("#4A4433"))[None, None] * 0.6 * shot
    rough = 0.93 + 0.03 * fuzz
    save("mineralwool-skin", alb, normal_from_height(h, 1.0), rough, tile, scales)


def _cell_pits(n, cell_px, seed, aspect, drop, depth_px, wall_px, curve=0.18, fill=(0.94, 1.1)):
    """Closed-cell structure as round cavities packed in a Voronoi foam: each cell
    holds a spherical cavity filling `fill` of its inscribed radius, so walls are
    thin between neighbours and thicken at the junctions (Plateau borders).
    Returns (h, pit 0..1 (1 = cavity centre, 0 = wall), rim mask, cell random)."""
    fc = n / cell_px  # cells per tile
    wdx, wdy = warp_field(n, seed + 50, curve * cell_px, beta=2.0, fmin=fc / 4, fmax=fc * 0.6)
    f1, edge, cid, count, rin = foam_cells(n, cell_px, seed, aspect=aspect, drop=drop,
                                           wdx=wdx, wdy=wdy, with_rin=True, relax=3)
    crand = rng(seed + 1).random(count)[cid]
    R = rin[cid] * (fill[0] + (fill[1] - fill[0]) * rng(seed + 2).random(count)[cid])
    rr = f1 / np.maximum(R, 1e-3)
    inside = rr < 1
    pit = np.where(inside, 1 - rr, 0.0)
    depth = depth_px * (0.55 + 0.6 * crand)
    h = -depth * np.sqrt(np.clip(1 - rr ** 2, 0, 1))
    # wall top: very slight rounding toward the cavity lip and a crest on the Voronoi wall
    h = h + np.where(inside, 0, 0.15 * depth_px * np.exp(-(edge / (2 * wall_px)) ** 2))
    rim = np.exp(-(np.clip(rr - 1, 0, None) * R / wall_px) ** 2) * (rr > 0.9)
    return h, pit, rim, crand


def cellglass(scales):
    # ---- cut face: charcoal glassy closed cells 0.5-1 mm, slightly elongated along U.
    # Each cut cell is a dark spherical cavity; thin glass walls catch the light.
    tile = 40.0
    n = N
    px = n / tile
    h, pit, rim, crand = _cell_pits(n, 0.72 * px, 301, aspect=1.2, drop=0.12, depth_px=0.30 * px, wall_px=1.1)
    fine = spectral(n, 302, beta=0.4, fmin=150)
    mott = spectral(n, 303, beta=3.0, fmin=1)
    h = h + 0.06 * slope(fine)
    lip = np.clip(1 - pit / 0.3, 0, 1)  # wall (1) through the cavity lip into the dark interior
    seg = np.clip(spectral(n, 304, beta=0.8, fmin=60) * 2.5 + 0.2, 0, 1)  # glints break up along lips
    alb = mix_hex("#0B0B0A", "#4A4840", 0.04 + 0.85 * lip ** 2.2 + 0.06 * mott + 0.05 * fine)
    alb *= (1 + 1.2 * rim * seg)[..., None]
    rough = 0.6 + 0.08 * fine + 0.1 * (crand - 0.5)
    rough = rough * (1 - rim * seg) + 0.15 * rim * seg
    save("cellglass-cut", alb, normal_from_height(h, 1.0), np.clip(rough, 0.12, 1), tile, scales)

    # ---- factory / handled surface: same cells, shallower, glass dust in the pits.
    h, pit, rim, crand = _cell_pits(n, 0.72 * px, 311, aspect=1.2, drop=0.12, depth_px=0.16 * px, wall_px=1.4)
    dust = np.clip(spectral(n, 312, beta=2.2, fmin=2) * 1.6 + 0.4, 0, 1)
    fine = spectral(n, 313, beta=0.4, fmin=150)
    h = h + 0.05 * slope(fine)
    lip = np.clip(1 - pit / 0.4, 0, 1)
    base = mix_hex("#151513", "#55524A", 0.12 + 0.8 * lip ** 1.6 + 0.08 * fine)
    dusty = srgb_to_lin(hex_rgb("#6E6A61"))[None, None]
    dm = (dust * np.clip(pit, 0, 1) * 0.65)[..., None]
    alb = base * (1 - dm) + dusty * dm
    seg = np.clip(spectral(n, 314, beta=0.8, fmin=60) * 2.5, 0, 1)
    alb *= (1 + 0.6 * rim * seg * (1 - dust))[..., None]
    rough = 0.82 + 0.05 * fine
    rough = rough * (1 - rim * seg) + (0.3 + 0.3 * dust) * rim * seg
    save("cellglass-skin", alb, normal_from_height(h, 1.0), np.clip(rough, 0.2, 1), tile, scales)


def elastomeric(scales):
    # ---- skin: black satin, pebbled leather-like grain 0.3-1 mm, isotropic.
    tile = 60.0
    n = N
    px = n / tile
    wx, wy = warp_field(n, 401, 0.18 * px, beta=2.0, fmin=6)
    f1, edge, cid, count = foam_cells(n, 0.6 * px, 402, jitter=0.48, drop=0.2, wdx=wx, wdy=wy)
    crand = rng(403).random(count)[cid]
    groove = np.exp(-(edge / (0.07 * px)) ** 2)
    rad = np.maximum(f1 + edge, 1e-3)
    dome = np.sqrt(np.clip(edge / rad, 0, 1)) * (0.6 + 0.5 * crand)
    peel = spectral(n, 404, beta=3.0, fmin=4, fmax=30)  # 2-4 mm orange peel
    grit = spectral(n, 405, beta=0.3, fmin=150)
    h = dome * 0.035 * px - groove * 0.03 * px + 0.04 * slope(peel) + 0.04 * slope(grit)
    mott = spectral(n, 406, beta=3.0, fmin=1)
    alb = tint("#242425", 1 + 0.05 * mott + 0.04 * grit - 0.12 * groove)  # neutral black
    rough = 0.52 + 0.1 * groove + 0.04 * grit - 0.03 * dome + 0.03 * mott
    save("elastomeric-skin", alb, normal_from_height(h, 1.0), rough, tile, scales)

    # ---- cut face: matte, fine cells 0.1-0.5 mm. Cut cell walls scatter light, so
    # the face reads light salt-and-pepper grey next to the black skin
    # (research/refs/user-google/09-elastomeric-tube-sheet-cut-faces.jpg).
    tile = 30.0
    px = n / tile
    h, pit, rim, crand = _cell_pits(n, 0.26 * px, 411, aspect=1.0, drop=0.3, depth_px=0.09 * px, wall_px=0.9)
    grit = spectral(n, 412, beta=0.3, fmin=150)
    mott = spectral(n, 413, beta=3.0, fmin=1)
    h = h + 0.05 * slope(grit)
    occl = 1 - pit ** 1.5
    glint = disc_mask(n, 7000, 0.6, 1.4, 414, soft=0.7) * np.clip(1.2 - pit, 0, 1)
    alb = mix_hex("#1A1A1A", "#7B7A77", 0.15 + 0.7 * occl + 0.08 * mott)
    alb = alb * (1 - 0.6 * glint[..., None]) + srgb_to_lin(hex_rgb("#B4B3AF"))[None, None] * 0.6 * glint[..., None]
    rough = 0.88 - 0.5 * glint + 0.04 * grit
    save("elastomeric-cut", alb, normal_from_height(h, 1.0), np.clip(rough, 0.25, 1), tile, scales)


def phenolic(scales):
    # ---- cut face: salmon, near-smooth chalky fine cells, occasional 0.5-1 mm voids.
    tile = 60.0
    n = N
    px = n / tile
    grain = spectral(n, 501, beta=0.0, fmin=250)  # 50-150 µm cells read as fine grain
    grain2 = spectral(n, 502, beta=0.6, fmin=80)
    rise = spectral(n, 503, beta=2.0, fmin=2, stretch=(1.0, 0.15))  # faint rise streaks along U
    mott = spectral(n, 504, beta=3.0, fmin=1)
    h = 0.10 * slope(grain) + 0.06 * slope(grain2) + 0.02 * slope(rise)
    ao = np.ones((n, n))
    h = stamp_pits(h, 30, 0.25 * px, 0.5 * px, 0.3 * px, 505, ao)
    h = stamp_pits(h, 300, 0.06 * px, 0.15 * px, 0.08 * px, 506, ao)
    var = (1 + 0.035 * mott + 0.03 * rise + 0.04 * grain2) * (0.82 + 0.18 * ao)
    alb = tint("#E89A84", var)
    rough = 0.9 + 0.04 * grain
    save("phenolic-cut", alb, normal_from_height(h, 1.0), rough, tile, scales)

    # ---- foil / glass-scrim facing: crumpled facets, creases (mostly around the
    # pipe, i.e. along U), and an embossed ~10 mm scrim grid.
    tile = 100.0
    px = n / tile
    wx, wy = warp_field(n, 511, 0.3 * px, beta=2.4, fmin=2)
    # crinkle: ridged multi-octave noise -> sharp creases, mostly running around the pipe (U)
    r1 = 1 - np.abs(spectral(n, 513, beta=2.2, fmin=4, stretch=(1.0, 0.35)))
    r2 = 1 - np.abs(spectral(n, 514, beta=2.0, fmin=12, stretch=(1.0, 0.6)))
    r3 = 1 - np.abs(spectral(n, 519, beta=1.8, fmin=30))
    crease = np.clip((r1 ** 6) * 1.2 + (r2 ** 8) * 0.6, 0, 1)
    k = 10
    yy, xx = np.mgrid[0:n, 0:n].astype(float)
    gu = np.abs(np.sin(np.pi * (xx + wx) * k / n))
    gv = np.abs(np.sin(np.pi * (yy + wy) * k / n))
    thread = np.exp(-(gu / 0.07) ** 2) * (0.8 + 0.4 * rng(515).random(k)[np.mod(np.round((xx + wx) * k / n).astype(int), k)])
    thread += np.exp(-(gv / 0.07) ** 2) * (0.8 + 0.4 * rng(516).random(k)[np.mod(np.round((yy + wy) * k / n).astype(int), k)])
    h = 0.28 * slope(r1 ** 3) + 0.12 * slope(r2 ** 3) + 0.04 * slope(r3 ** 2) + thread * 0.05 * px
    nrm = normal_from_height(h, 1.0)
    pan = spectral(n, 518, beta=2.6, fmin=2)
    alb = tint("#D4D5D6", 1 + 0.03 * pan - 0.06 * crease)
    rough = 0.27 + 0.04 * pan + 0.12 * crease + 0.05 * np.clip(thread, 0, 1)
    save("foil-scrim", alb, nrm, rough, tile, scales)


def jackets_soft(scales):
    # ---- ASJ: white kraft/foil/scrim laminate. Paper fibre along V (lengthwise),
    # faint diamond scrim (~7.9 mm spacing) plus lengthwise threads every 12.5 mm.
    tile = 100.0
    n = N
    px = n / tile
    yy, xx = np.mgrid[0:n, 0:n].astype(float)
    wx, wy = warp_field(n, 601, 0.35 * px, beta=2.6, fmin=2)
    xw, yw = xx + wx, yy + wy
    k = 9
    d1 = np.abs(np.sin(np.pi * (xw + yw) * k / n))
    d2 = np.abs(np.sin(np.pi * (xw - yw) * k / n))
    lv = np.abs(np.sin(np.pi * xw * 8 / n))
    scrim = np.exp(-(d1 / 0.05) ** 2) + np.exp(-(d2 / 0.05) ** 2) + 0.7 * np.exp(-(lv / 0.04) ** 2)
    fibre = spectral(n, 602, beta=0.8, fmin=60, stretch=(0.25, 1.0))
    rib = spectral(n, 603, beta=1.0, fmin=40, stretch=(0.03, 1.0))
    mott = spectral(n, 604, beta=3.0, fmin=1)
    cockle = spectral(n, 605, beta=3.0, fmin=2, fmax=25)  # gentle paper cockle
    h = 0.05 * slope(fibre) + 0.03 * slope(rib) + scrim * 0.025 * px + 0.012 * slope(cockle)
    alb = tint("#EEEEEA", 1 + 0.012 * mott + 0.015 * fibre - 0.02 * np.clip(scrim, 0, 1))
    rough = 0.8 + 0.04 * fibre - 0.025 * np.clip(scrim, 0, 1)
    save("asj", alb, normal_from_height(h, 1.0), rough, tile, scales)

    # ---- PVC fitting covers / jacket: white semi-gloss, very subtle orange peel.
    tile = 120.0
    px = n / tile
    peel = spectral(n, 611, beta=3.2, fmin=12, fmax=60)  # ~2-4 mm
    micro = spectral(n, 612, beta=1.0, fmin=80)
    smudge = spectral(n, 613, beta=3.4, fmin=1)
    h = 0.012 * slope(peel) + 0.004 * slope(micro)
    alb = tint("#F0F0EB", 1 + 0.01 * smudge)
    rough = 0.3 + 0.04 * np.clip(smudge, 0, 1) + 0.015 * micro
    save("pvc-white", alb, normal_from_height(h, 1.0), rough, tile, scales)


def valve_and_blanket(scales):
    # Removable-blanket cold-face fabric: silicone-coated fiberglass cloth.
    # 2/2 twill at ~0.9 mm yarn pitch reads as the fine diagonal weave in
    # research/refs/user-google/10-removable-blanket-lacing-hooks-wire.jpg.
    tile = 36.0
    n = N
    px = n / tile
    pitch = 0.9 * px
    yy, xx = np.mgrid[0:n, 0:n].astype(float)
    k = 2 * np.pi / pitch
    warp = np.sin(xx * k) ** 2  # yarns running along V
    weft = np.sin(yy * k) ** 2  # yarns running along U
    twill = np.sin((xx + yy) * k / 2) > 0  # which yarn floats on top, offset each row
    h = np.where(twill, 0.6 * warp + 0.25 * weft, 0.25 * warp + 0.6 * weft)
    h = periodic_blur(h, 0.06 * px) + 0.15 * spectral(n, 601, beta=1.5, fmin=8)
    mott = spectral(n, 602, beta=3.0, fmin=1)
    alb = tint("#A3A7A9", 1 + 0.05 * mott + 0.05 * (h - h.mean()))
    rough = 0.48 + 0.08 * (1 - h) + 0.04 * mott
    save("blanket-fabric", alb, normal_from_height(0.35 * slope(h), 1.0), rough, tile, scales)

    # Painted cast-steel valve body: fine casting texture under semi-gloss paint.
    tile = 150.0
    cast = spectral(n, 611, beta=1.8, fmin=6)
    pits = spectral(n, 612, beta=0.5, fmin=120)
    h = 0.03 * slope(cast) + 0.02 * slope(pits)
    alb = tint("#5C6268", 1 + 0.04 * spectral(n, 613, beta=3.0, fmin=1))
    rough = 0.42 + 0.06 * np.clip(cast, 0, 1)
    save("valve-paint", alb, normal_from_height(h, 1.0), rough, tile, scales)


def mech_room(scales):
    # Painted CMU wall: 16" x 8" nominal block (15-5/8" x 7-5/8" + 3/8" joints),
    # running bond, concave tooled joints, eggshell paint over porous block face.
    tile_w, tile_h = 812.8, 406.4  # 2 blocks wide x 2 courses
    n = 1024
    px = n / tile_w  # square texture: we scale V separately in the material
    yy, xx = np.mgrid[0:n, 0:n].astype(float)
    xmm = xx / n * tile_w
    ymm = yy / n * tile_h
    course = np.floor(ymm / 203.2)
    xoff = (xmm + course * 203.2) % 406.4
    yoff = ymm % 203.2
    dj = np.minimum(np.minimum(xoff, 406.4 - xoff), np.minimum(yoff, 203.2 - yoff))
    joint = np.clip(1 - dj / 5.5, 0, 1)
    pores = spectral(n, 701, beta=0.6, fmin=60)
    blotch = spectral(n, 702, beta=3.0, fmin=1)
    h = -0.6 * joint ** 1.5 * px * 2 + 0.06 * slope(pores) + 0.01 * slope(blotch)
    alb = tint("#D8D5CC", 1 + 0.03 * blotch - 0.10 * joint + 0.03 * pores)
    rough = 0.82 + 0.06 * joint + 0.03 * pores
    save("cmu-painted", alb, normal_from_height(h, 1.0), rough, tile_w, scales)


ALL = {"room": mech_room, "valve": valve_and_blanket, "calsil": calsil, "aluminum": aluminum, "stainless": stainless, "steel": carbon_steel,
       "fiberglass": fiberglass, "mineralwool": mineralwool, "cellglass": cellglass,
       "elastomeric": elastomeric, "phenolic": phenolic, "jackets_soft": jackets_soft}

if __name__ == "__main__":
    which = sys.argv[1:] or list(ALL)
    scales = json.loads(SCALES.read_text()) if SCALES.exists() else {}
    for w in which:
        print(w)
        ALL[w](scales)
    SCALES.parent.mkdir(parents=True, exist_ok=True)
    SCALES.write_text(json.dumps(scales, indent=2, sort_keys=True) + "\n")
