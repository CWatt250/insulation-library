"""Generate app/src/data/specs2.ts from research/materials2-verified.json.

Product numbers (temperatures, k points, density, strength, fire, vapor) are
copied from the research file; applications / pros / cons are its own grounded
text. Only the short names, summary and sizes line are written here by hand,
from the same file. Re-run after editing the research JSON:
    python3 tools/build_specs2.py
"""
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
D = json.loads((ROOT / "research/materials2-verified.json").read_text())

HAND = {
    "polyisocyanurate": dict(
        app_id="pir", name="Polyisocyanurate (PIR)", astm="ASTM C591",
        summary="Rigid closed-cell PIR foam, fabricated from bunstock into pipe half-sections, for refrigeration, chilled water and cryogenic lines. Very low k, but it is combustible (not 25/50) and is not its own vapor retarder: cold service needs a separate sealed low-perm retarder.",
        sizes="Fabricated from bunstock into half-sections (Kingspan Tarecpir 360: 180° halves); JM 36 in. section length; stock pipe sizes and wall range not published.",
        products=[1, 0], short=["Kingspan Tarecpir 2.0", "JM Trymer 2000XP"],
        knote={0: "JM prints these under 'Temperature (°F)', not mean temperature; nothing published above 75°F."},
    ),
    "aerogel": dict(
        app_id="aerogel", name="Aerogel Blanket", astm="ASTM C1728",
        summary="Flexible silica-aerogel blanket in 5 mm and 10 mm thicknesses, wrapped in layers. Lowest published k here: Pyrogel XTE for hot service to 1200°F, Cryogel Z (laminated vapor retarder) for sub-ambient and cryogenic work. Low compressive strength; k tested flat at 2 psi load.",
        sizes="Blanket 0.2 in. (5 mm) and 0.4 in. (10 mm), wrapped in layers; Aspen cut charts cover NPS 1/2–48 in.; over 80 mm total (Pyrogel) needs Aspen review.",
        products=[0, 1], short=["Aspen Pyrogel XTE", "Aspen Cryogel Z"],
        knote={0: "ASTM C177 flat blanket at 2 psi load (no C335 pipe test published).", 1: "ASTM C177 flat blanket at 2 psi load (no C335 pipe test published)."},
    ),
    "expanded_perlite": dict(
        app_id="perlite", name="Expanded Perlite", astm="ASTM C610",
        summary="Molded expanded perlite (sodium-silicate bonded) pipe and block for hot piping to 1200°F. Non-combustible and rigid, with water-repellent, corrosion-inhibiting treatment; higher k than calcium silicate and brittle.",
        sizes="JM Sproule: NPS 1/2–24 in. halves, quads 24–40 in., 36 in. sections; Howred: 1/2–20 in. sections, 1–4 in. single layer.",
        products=[0, 1], short=["JM Sproule WR-1200", "Howred GOODTEMP"],
        knote={1: "The word 'mean' is not printed on the Howred table (ASTM C335)."},
    ),
    "polyolefin": dict(
        app_id="polyolefin", name="Polyolefin Foam", astm="ASTM C1427",
        summary="Flexible closed-cell polyethylene foam tube (3/8–1 in. walls, 6 ft lengths) for plumbing, chilled and cold water, and freeze protection, −297/−200 to 200°F. Very low vapor permeability; needs UV protection outdoors.",
        sizes="6 ft tubes, 3/8, 1/2, 3/4 and 1 in. walls; K-FLEX PE IPS 1/8–4 in., copper OD 3/8–4-1/8 in.",
        products=[0, 1], short=["Armacell Tubolit", "K-FLEX PE"],
        knote={0: "ASTM C518 / C177 flat-specimen methods (not the C335 pipe method).", 1: "ASTM C177 or C518 flat-specimen methods (not the C335 pipe method)."},
    ),
}

def num(v):
    return v if isinstance(v, (int, float)) else None

def js(s):
    return json.dumps(s, ensure_ascii=False)

def strip(s):
    return re.sub(r"\s+", " ", str(s)).strip()

def product(p, short, knote):
    srcs = []
    for k in ("service_temp_f", "thermal_conductivity", "density_pcf", "compressive_strength", "surface_burning", "water_vapor", "combustibility"):
        for s in (p.get(k) or {}).get("src", []):
            if s not in srcs:
                srcs.append(s)
    for s in p.get("datasheet", {}).get("src", []):
        if s not in srcs:
            srcs.append(s)
    t = p["service_temp_f"]
    tnote = "; ".join(strip(c) for c in t.get("caveats", [])[:1])
    pts = [{"meanF": q["mean_temp_f"], "k": q["k"]} for q in p["thermal_conductivity"].get("points", [])]
    dens = p["density_pcf"]
    dv = dens.get("value")
    density = None if dv in (None, "unverified") else f"{dv} pcf"
    cs = p["compressive_strength"]
    comp = None if cs.get("value_psi") in (None, "unverified") else f"{cs['value_psi']} psi ({strip(cs.get('condition', ''))})"
    sb = p["surface_burning"]
    e84 = None if sb.get("flame_spread") in (None, "unverified") else f"{sb['flame_spread']}/{sb['smoke_developed']}" + (f", {strip(sb['thickness_limits'])}" if sb.get("thickness_limits") and "unverified" not in str(sb["thickness_limits"]) else "")
    wv = p["water_vapor"].get("material_permeability")
    vapor = None if not wv or str(wv).startswith("unverified") else strip(wv)
    comb = strip(p["combustibility"].get("rating", "")) or None
    out = {
        "name": short,
        "tempF": {"min": num(t.get("min")), "max": num(t.get("max")), **({"note": tnote[:240]} if tnote else {})},
        "k": pts,
    }
    if knote:
        out["kNote"] = knote
    for key, val in (("density", density), ("compressive", comp), ("e84", e84), ("vapor", vapor), ("combustibility", comb)):
        if val:
            out[key] = val
    out["sources"] = srcs
    return out

entries = []
for m in D["materials"]:
    h = HAND[m["id"]]
    prods = [product(m["products"][i], h["short"][j], h["knote"].get(i)) for j, i in enumerate(h["products"])]
    used = {s for p in prods for s in p["sources"]}
    for coll in (m["typical_applications"], m["pros"], m["cons"]):
        for x in coll:
            used.update(x.get("src", []))
    sources = [{"id": s["id"], "label": f"{s['publisher']} – {strip(s['title'])} ({strip(s.get('pub_no_or_date', ''))})", "url": s["url"].split(" ; ")[0]} for s in m["sources"] if s["id"] in used]
    entry = {
        "id": h["app_id"], "name": h["name"], "astm": h["astm"], "summary": h["summary"],
        "applications": [strip(x["text"]) for x in m["typical_applications"][:5]],
        "pros": [strip(x["text"]) for x in m["pros"][:4]],
        "cons": [strip(x["text"]) for x in m["cons"][:4]],
        "sizes": h["sizes"],
        "products": prods,
        "gaps": [strip(x) for x in (m["discrepancies_between_products"][:3] + m["unverified"][:4])],
        "sources": sources,
    }
    entries.append(entry)

lines = [
    "// Generated by tools/build_specs2.py from research/materials2-verified.json — do not edit by hand.",
    "// Same conventions as specs.ts: every number traces to the research file; 'unverified' values are omitted.",
    "import type { MaterialSpec } from './specs'",
    "",
    "export const SPECS2: Record<'pir' | 'aerogel' | 'perlite' | 'polyolefin', MaterialSpec> = {",
]
for e in entries:
    lines.append(f"  {js(e['id'])}: {json.dumps(e, ensure_ascii=False, indent=2)},".replace("\n", "\n  "))
lines.append("}")
(ROOT / "app/src/data/specs2.ts").write_text("\n".join(lines) + "\n")
print("wrote specs2.ts:", [e["id"] for e in entries], [len(e["sources"]) for e in entries])
