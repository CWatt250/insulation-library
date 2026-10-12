"""Regenerate the CALC_REFS block in app/src/sim/sources.ts from research/*.json.

Every reference the calculation layer cites is pulled from the research files'
own source records (title, publisher, URL, access date), so nothing is retyped.
    python3 tools/build_sources.py
"""
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WANT = {
    "calc-method-verified.json": ["M1", "M3", "M4", "M6", "M7", "M8", "M11", "M13", "M16", "M19", "M20", "M24"],
    "emittance-verified.json": ["E1", "E2", "E3", "E5", "E8", "E9", "E10", "E13", "E14", "E15", "E16", "E19"],
    "jackets-verified.json": ["J1", "J2", "J6", "J17", "J24", "J25", "J27", "J31", "J35"],
    "validation-cases.json": ["V1", "V3", "V4", "V9", "V10", "V11", "V13", "V14", "V15", "V16", "V18", "V19", "V21", "V22", "V23"],
    "pipe-dimensions.json": ["D3", "D6"],
    "vapor-code-verified.json": ["R1", "R2", "R5", "R9", "R14", "R16", "R18", "R21", "R22", "R23", "R30", "R32"],
    "fittings-verified.json": ["F1", "F6", "F12", "F13"],
    "pipe-materials-verified.json": ["G1", "G3", "G5", "G6", "G8"],
    "duct-verified.json": ["U1", "U9", "U10", "U14", "U15", "U28", "U44", "U46", "U53"],
    "code-requirements-verified.json": ["C1", "C2", "C3", "C6", "C7", "C19"],
    "duct-code-verified.json": ["D_C1", "D_C27"],
    "wsec-verified.json": ["W3", "W5", "W12"],
    "energy-prices-verified.json": ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"],
    "wa-climate-verified.json": ["N1", "N2", "N3", "N4"],
}
KIND = {"M1": "standard", "M13": "standard", "M24": "tool", "M4": "tool", "R30": "standard", "R32": "standard", "C1": "standard", "C2": "standard", "W3": "standard", "W5": "standard", "W12": "standard", "C3": "standard", "C7": "standard", "C6": "standard", "C19": "standard", "D_C1": "standard", "U15": "tool"}
NOTES = {
    "M1": "Method this engine follows (store page; full text paywalled)",
    "M3": "Public copy of the C680 surface equations used here",
    "M8": "NIA calculator code: same equations, 0.75°F dew-point margin",
    "M6": "140°F personnel-protection practice",
    "M16": "Dew point (Magnus, Alduchov & Eskridge)",
    "M19": "Churchill–Chu, Churchill–Bernstein, Lewis analogy",
    "M20": "Air conductivity law behind the C680 air properties",
    "M24": "3E Plus (NAIMA)",
    "E1": "Emittance list used for jackets and bare pipe",
    "R30": "ASHRAE 90.1-2019 Tables 6.8.3-1/-2 and the conductivity correction",
    "R5": "Water-vapor flux through a layer: Δp × permeance",
    "R1": "Below-ambient vapor retarder ≤0.02 perm (≤0.01 below 0°F)",
    "F12": "Fitting equivalent lengths (elbows, tees) and C1129 valve/flange areas",
    "F1": "DOE: savings from removable insulated valve covers",
    "G1": "Copper tube sizes and walls (ASTM B88)",
    "G3": "PVC Sch 40 dimensions (ASTM D1785), conductivity 1.2, 140°F limit",
    "G5": "PVC dimensions; prints conductivity 1.02",
    "G6": "PVC dimensions; conductivity 1.2 (ASTM C177)",
    "G8": "NIA calculator code: pipe-wall shell resistance (D/2)·ln(OD/ID)/k",
    "U1": "C680 flat-surface correlations (DNV review of a C680 tool, App. B tables)",
    "U9": "Horizontal-plate and vertical-plate correlations; inside duct air film (T8.17a)",
    "U10": "Duct insulation for condensation control; ε = 0.1 chart for foil-faced products",
    "U14": "Stable/unstable horizontal-plate convection (Lloyd–Moran, A/P length)",
    "U15": "3E Plus v4.1 Example 5: cold vertical flat surface",
    "U28": "Duct wrap k vs temperature, installed R at 25% compression, FSK 0.02 perm",
    "U44": "Elastomeric sheet k, R-values, 0.05 perm·in",
    "U53": "Duct-wrap condensation chart basis: 55°F duct air, still air",
    "C1": "IECC 2021 C403.12.1 duct insulation",
    "C6": "IMC 2021: 604.2 (120°F surface), 604.7 (installed thickness), 604.11 (vapor retarder)",
    "C19": "ASHRAE 90.1-2019 Table 6.8.2 minimum duct insulation R-value",
    "C3": "IECC 2024 C403.13.1 duct insulation (same values as 2021)",
    "C7": "IMC 2021 307: condensate disposal (no drain insulation requirement)",
    "C2": "IECC 2021 residential R403.4: R-3 for piping above 105°F or below 55°F",
    "D_C1": "IECC 2021 definitions (conditioned space)",
    "D_C27": "DOE/PNNL code note: duct locations (Figure 1), 2009/2012 editions",
    "W3": "2021 WSEC-C Table C301.1: Washington counties → climate zone 4C or 5B",
    "W5": "2021 WSEC-C C403.10: duct (C403.10.1) and pipe (Table C403.10.3) insulation",
    "W12": "2021 WSEC-R R403.4: R-6 mechanical piping above 105°F or below 55°F",
    "P1": "Washington commercial gas price by year ($/Mcf; ÷ 1.036 = $/MMBtu)",
    "P2": "Washington commercial gas price by month",
    "P3": "Washington industrial gas price by month",
    "P4": "Heat content of delivered gas: 1,036 Btu per cubic foot",
    "P5": "PSE average rates: gas Schedule 31 $1.47/therm; commercial power $0.16–0.21/kWh",
    "P6": "Washington commercial electricity 11.78¢/kWh (July 2026)",
    "P7": "Whole chiller plant 0.8–1.0 kW/ton typical; packaged units 1.1–1.4",
    "P8": "Heat pump water heaters: two to three times as efficient as electric resistance",
    "N1": "NOAA hourly temperature normals: outdoor temperature by month and hour",
    "N2": "NOAA monthly heating degree days (base 65°F) and mean temperatures",
    "N3": "ASHRAE 152P defaults: cooling Jun–Sep, heating months >150 HDD, attic/crawl/ground temperatures",
    "N4": "Standard 152: well-vented attic +13°F over outdoor for seasonal cooling",
}
DATASHEET = re.compile(r"^(J|D|G[1-6]$|U28$|U44$|U46$|F1$|E5|E8|E9|E10|E13|E15|E16|E19|V1|V3|R16|R18|R21|R22|R23)")

def clean(s):
    return str(s or "").replace("'", "’").replace("\n", " ")

rows = []
for f, ids in WANT.items():
    d = json.loads((ROOT / "research" / f).read_text())
    found = {s["id"]: s for s in d["sources"]}
    for i in ids:
        s = found.get(i)
        if not s:
            raise SystemExit(f"{f}: no source {i}")
        kind = KIND.get(i, "datasheet" if DATASHEET.match(i) else "reference")
        note = NOTES.get(i)
        rows.append(
            f"  {i}: {{ id: '{i}', title: '{clean(s['title'])}', publisher: '{clean(s.get('publisher'))}', url: '{clean(s['url'].split(' ; ')[0])}', "
            f"retrieved: '{s.get('accessed', '')}', kind: '{kind}'" + (f", note: '{clean(note)}'" if note else "") + " },"
        )

p = ROOT / "app/src/sim/sources.ts"
src = p.read_text()
start = src.index("export const CALC_REFS: Record<string, Ref> = {")
end = src.index("\n}\n", start) + 3
block = "export const CALC_REFS: Record<string, Ref> = {\n" + "\n".join(rows) + "\n}\n"
p.write_text(src[:start] + block + src[end:])
print(f"CALC_REFS: {len(rows)} refs")
