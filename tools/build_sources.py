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
    "jackets-verified.json": ["J1", "J2", "J6", "J17", "J24", "J27", "J31", "J35"],
    "validation-cases.json": ["V1", "V3", "V4", "V9", "V10", "V11", "V13", "V14", "V15", "V16", "V18", "V19", "V21", "V22", "V23"],
    "pipe-dimensions.json": ["D3", "D6"],
    "vapor-code-verified.json": ["R1", "R2", "R5", "R9", "R14", "R16", "R18", "R21", "R22", "R23", "R30", "R32"],
    "fittings-verified.json": ["F1", "F6", "F12", "F13"],
    "pipe-materials-verified.json": ["G1", "G3", "G5", "G6", "G8"],
}
KIND = {"M1": "standard", "M13": "standard", "M24": "tool", "M4": "tool", "R30": "standard", "R32": "standard"}
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
}
DATASHEET = re.compile(r"^(J|D|G[1-6]$|F1$|E5|E8|E9|E10|E13|E15|E16|E19|V1|V3|R16|R18|R21|R22|R23)")

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
