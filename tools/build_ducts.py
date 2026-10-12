"""Generate app/src/data/ductData.ts from research/duct-verified.json,
research/duct-board-verified.json and research/code-requirements-verified.json.
Nothing is retyped by hand.

Duct wrap: Johns Manville Microlite® FSK (U23) — thicknesses, installed (25 %
compressed) and out-of-package R, installed and labeled k at 75°F. JM prints k at
75°F only, so the change of k with temperature takes the shape of Knauf's
published out-of-package curve for the same density (U28), scaled to JM's
installed k at 75°F (this app's assumption, stated in the app).
Rigid board (indoors FSK or ASJ; outdoors under an aluminum jacket): JM, from
research/duct-board-verified.json.
Duct insulation minimums: ASHRAE 90.1-2019 Table 6.8.2 (C19), IECC 2021 C403.12.1 (C1).
    python3 tools/build_ducts.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
D = json.loads((ROOT / "research/duct-verified.json").read_text())
C = json.loads((ROOT / "research/code-requirements-verified.json").read_text())
B = json.loads((ROOT / "research/duct-board-verified.json").read_text())

# ---- JM Microlite FSK (U23)
jm = next(p for p in D["duct_wrap_products"]["products"] if p["src"] == ["U23"])
assert jm["manufacturer"] == "Johns Manville"
GROUP = {"Type 75 - 0.75 pcf": "75", "Type 100 - 1.00 pcf": "100", "Type 150 - 1.5 pcf": "150"}
MM_IN = {25: 1.0, 38: 1.5, 51: 2.0, 56: 2.2, 76: 3.0, 112: 4.4, 146: 5.75, 178: 7.0}
wrap = {t: {"thick": []} for t in GROUP.values()}
for row in jm["r_value_table"]["rows"]:
    t = GROUP[row["group"]]
    nominal = MM_IN[int(row["printed"]["mm"])]
    if nominal == 1.0:
        continue  # "1\" for Canadian use only"
    wrap[t]["thick"].append((nominal, float(row["printed"]["oop_R"]), float(row["printed"]["inst_R"])))
kc = jm["k_75F"]
assert "Tested with material thickness compressed 25%." in " ".join(kc["quote"])
for t in wrap:
    wrap[t]["kInst"] = kc["compressed_thickness"][f"Type {t}"]
    wrap[t]["kLabeled"] = kc["labeled_thickness"][f"Type {t}"]
maxF = jm["max_temp"]["value_F"]
perm = jm["facings"][0]["permeance_perm"]
assert jm["facings"][0]["facing"] == "FSK" and perm == 0.02

# ---- the shape of k vs mean temperature: Knauf Performance+ out-of-package curve (U28), same densities
knauf = next(p for p in D["duct_wrap_products"]["products"] if p["manufacturer"].startswith("Knauf"))
assert "U28" in knauf["src"]
kcols = {"75": "k075", "100": "k10", "150": "k15"}
kshape = {t: [] for t in kcols}
for row in knauf["apparent_k_vs_mean_temp"]["rows"]:
    T = float(re.match(r"(\d+)", row["printed"]["T"]).group(1))
    for t, col in kcols.items():
        kshape[t].append((T, float(row["printed"][col])))

# ASHRAE 90.1-2019 Table 6.8.2
t682 = C["duct_insulation_tables"]["ashrae_90_1_2019_table_6_8_2"]
assert t682["id"] == "DUCT-1"
def rv(s):
    return None if s == "None" else float(s.replace("R-", ""))
SERVICE = {"Supply and Return Ducts for Heating and Cooling": "both", "Supply and Return Ducts for Heating Only": "heating", "Supply and Return Ducts for Cooling Only": "cooling"}
rows682 = []
for r in t682["rows"]:
    lo, hi = (int(x) for x in r["climate_zones"].split(" to "))
    rows682.append((SERVICE[r["duct_type"]], lo, hi, rv(r["exterior"]), rv(r["unconditioned_space_and_buried"]), rv(r["indirectly_conditioned_space"])))
fn = {f["mark"]: f["quote"] for f in t682["footnotes"]}

def num(x):
    return "null" if x is None else f"{x:g}"

def board_lines(b):
    """Rigid board for rectangular duct (800 Series Spin-Glas 814) and its round-duct
    counterpart (Micro-Flex), as research/duct-board-verified.json records them."""
    out = [
        "export interface BoardFacing { perm: number | null; src: string[]; note?: string }",
        "export interface BoardProduct {",
        "  product: string",
        "  src: string[]",
        "  densityPcf: number",
        "  maxF: number",
        "  /** The facing's own limit (ASTM C1136). */",
        "  facingMaxF: number",
        "  /** Labeled thickness and R at 75°F mean; `calc` = thickness ÷ k at 75°F (no R printed). */",
        "  thicknesses: { nominalIn: number; R: number; calc?: boolean }[]",
        "  k: { meanF: number; k: number }[]",
        "  kNote: string",
        "  facings: Record<'fsk' | 'asj', BoardFacing>",
        "}",
        "",
        "/** Rigid insulation for duct, FSK or ASJ (JM \"AP\") faced: board on rectangular duct, Micro-Flex on round [U64, U65]. */",
        "export const DUCT_BOARD: Record<'rect' | 'round', BoardProduct> = {",
    ]
    for key, shape in (("board", "rect"), ("round", "round")):
        bd = b[key]
        k75 = next(r["k"] for r in bd["k_vs_mean"] if r["meanF"] == 75)
        th = [(r["in"], r["R"], False) if "R" in r else (r["in"], round(r["in"] / k75 + 1e-9, 1), True) for r in bd["thicknesses"]]
        out += [
            f"  {shape}: {{",
            f"    product: {json.dumps(bd['product_short'])},",
            f"    src: {json.dumps(bd['src'])},",
            f"    densityPcf: {bd['density_pcf']:g},",
            f"    maxF: {bd['max_F']:g},",
            f"    facingMaxF: {bd['facing_max_F']:g},",
            "    thicknesses: [" + ", ".join(f"{{ nominalIn: {t:g}, R: {R:g}{', calc: true' if c else ''} }}" for t, R, c in th) + "],",
            "    k: [" + ", ".join(f"{{ meanF: {r['meanF']:g}, k: {r['k']:g} }}" for r in bd["k_vs_mean"]) + "],",
            f"    kNote: {json.dumps(bd['k_note'])},",
            "    facings: {",
            *[f"      {fid}: {{ perm: {f['perm']:g}, src: {json.dumps(f['src'])}, note: {json.dumps(f['note'])} }}," for fid, f in bd["facings"].items()],
            "    },",
            "  },",
        ]
    out.append("}")
    px = b["polyiso"]
    out += [
        "",
        f"/** {px['product']} [{', '.join(px['src'])}]: JM's rooftop duct board — rectangular duct outdoors, under an aluminum jacket. */",
        "export const DUCT_POLYISO = {",
        f"  product: {json.dumps(px['product_short'])},",
        f"  src: {json.dumps(px['src'])},",
        f"  minF: {px['min_F']:g},",
        f"  maxF: {px['max_F']:g},",
        "  /** Labeled thickness and aged R at 75°F (ASTM C1289), as printed; `mto` = made to order. */",
        "  thicknesses: [" + ", ".join(f"{{ nominalIn: {r['in']:g}, R: {r['R']:g}{', mto: true' if r.get('made_to_order') else ''} }}" for r in px["thicknesses"]) + "] as { nominalIn: number; R: number; mto?: boolean }[],",
        f"  k75: {px['k_75F']:g},",
        f"  kNote: {json.dumps(px['k_note'])},",
        f"  facerPerm: {px['facer_perm']:g},",
        "  /** Tapered top boards on ducts wider than this, inches. */",
        f"  taperedOverIn: {px['tapered_over_in']:g},",
        "}",
    ]
    return out

o = [
    "// GENERATED by tools/build_ducts.py from research/duct-verified.json, research/duct-board-verified.json and research/code-requirements-verified.json — do not edit.",
    "",
    "export interface WrapType {",
    "  /** JM's name for the density: Type 75 / 100 / 150. */",
    "  label: string",
    "  densityPcf: number",
    "  /** Labeled (nominal) thickness, printed out-of-package R and installed R (25 % compression), at 75°F mean. */",
    "  thicknesses: { nominalIn: number; oopR: number; installedR: number }[]",
    "  /** k at 75°F mean (ASTM C518), compressed 25 % (installed) and at labeled thickness. */",
    "  kInstalled75: number",
    "  kLabeled75: number",
    "  /** Shape of k vs mean temperature: Knauf's out-of-package curve for the same density (U28); JM prints 75°F only. */",
    "  kShape: { meanF: number; k: number }[]",
    "}",
    "",
    "/** Johns Manville Microlite® FSK Formaldehyde-free™ duct wrap [U23]. */",
    "export const DUCT_WRAP = {",
    "  product: 'JM Microlite® FSK duct wrap',",
    "  src: ['U23'],",
    "  /** The temperature shape of k [U28]. */",
    "  shapeSrc: ['U28'],",
    "  /** Installed thickness = 75 % of nominal (25 % compression) [U23; IMC 604.7, C6]. */",
    "  installedFraction: 0.75,",
    f"  maxF: {maxF},",
    f"  facingPerm: {perm},",
    "  types: {",
]
dens = {"75": 0.75, "100": 1.0, "150": 1.5}
for t, w in wrap.items():
    o.append(f"    '{t}': {{")
    o.append(f"      label: 'Type {t} ({dens[t]:g} pcf)',")
    o.append(f"      densityPcf: {dens[t]},")
    o.append("      thicknesses: [" + ", ".join(f"{{ nominalIn: {n:g}, oopR: {a:g}, installedR: {b:g} }}" for n, a, b in w["thick"]) + "],")
    o.append(f"      kInstalled75: {w['kInst']:g},")
    o.append(f"      kLabeled75: {w['kLabeled']:g},")
    o.append("      kShape: [" + ", ".join(f"{{ meanF: {T:g}, k: {k:g} }}" for T, k in kshape[t]) + "],")
    o.append("    },")
o += [
    "  } as Record<'75' | '100' | '150', WrapType>,",
    "}",
    "",
    *board_lines(B),
    "",
    "export type DuctService = 'both' | 'heating' | 'cooling'",
    "export type DuctLocation = 'exterior' | 'unconditioned' | 'indirect'",
    "",
    "/** ASHRAE 90.1-2019 Table 6.8.2 Minimum Duct Insulation R-Value (installed) [C19]. null = none required. */",
    "export const TABLE_6_8_2: { service: DuctService; zones: [number, number]; exterior: number | null; unconditioned: number | null; indirect: number | null }[] = [",
    *[f"  {{ service: '{s}', zones: [{lo}, {hi}], exterior: {num(e)}, unconditioned: {num(u)}, indirect: {num(i)} }}," for s, lo, hi, e, u, i in rows682],
    "]",
    "",
    "export const TABLE_6_8_2_NOTES = {",
    *[f"  {k}: {json.dumps(v)}," for k, v in fn.items()],
    "}",
    "",
]
# DOE/PNNL code note (2012 editions): what it says for each of its 14 Figure 1 locations
DC = json.loads((ROOT / "research/duct-code-verified.json").read_text())
dl = DC["doe_duct_locations"]
assert dl["source"] == "D_C27"
o += [
    "/** DOE/PNNL code note, Figure 1 locations: what the note says for each (2009/2012 IECC, 90.1-2007/2010) [D_C27]. */",
    "export const DOE_SPOT_NOTES: Record<number, { quote: string; page: number }> = {",
    *[f"  {it['n']}: {{ quote: {json.dumps(it['quote'])}, page: {it['page']} }}," for it in dl["items"]],
    "}",
    "",
]
(ROOT / "app/src/data/ductData.ts").write_text("\n".join(o))
print("wrap types:", {t: [x[0] for x in w["thick"]] for t, w in wrap.items()}, "| 6.8.2 rows:", len(rows682))
