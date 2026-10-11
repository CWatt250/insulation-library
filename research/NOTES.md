# Research notes: visual and construction reference

Sources: research agents, 2026-10-10. Per-image URLs and licenses are in `refs/*/SOURCES.md`.
Manufacturer photos are reference-only (copyrighted). Use them to match looks; never ship them as textures.

## Jacketing construction (JM Metal Jacketing Install Guide, ASTM C1729/C1767)

### Aluminum
- Alloy 3003/3105-H14, with a 3-mil polyfilm moisture barrier on the inside. At cut edges the film shows light blue, about #A9CFE6.
- Thickness by insulation OD, rigid / non-rigid insulation:

  | Insulation OD | Rigid | Non-rigid |
  |---|---|---|
  | ≤8" | .016 | .016 |
  | 8–11" | .016 | .020 |
  | 11–24" | .016 | .024 |
  | 24–36" | .020 | .032 |
  | >36" | .024 | .040 |

- Longitudinal lap: ≥2" below 16" OD, ≥3" at 16" OD and up.
- Circumferential lap: ≥2". Sheets are 36" long.
- Seam position on horizontal pipe: 3–4 or 8–9 o'clock, with the lap opening facing down.
- Vertical pipe: the upper sheet overlaps the lower one.
- Bands: one centered on every circumferential joint, plus intermediates at 12" on center maximum (JM guide 04/23/24; the 11/27/23 edition said 9").
  - Material: stainless, 0.020" thick.
  - Width: ½" below 16" OD, ¾" at 16" OD and up.
  - Wing seal: 0.032" thick, same width as the band, about 1" long.
- Screws, hot work only: #8 × ½", 8" on center max on straight runs (11/27/23 edition: 6"), 3" on center on elbows. Never through a vapor retarder.
- Aluminum liner: 3-mil polyethylene/Surlyn polyfilm (PFMB), 180°F long-term, 200°F intermittent. JM: metal jacketing is not a vapor retarder. Details and sources: `jackets-verified.json`.
- Stucco emboss: irregular pebbles about 3–5 mm across, relief about 0.1–0.3 mm.
- 3/16" corrugated: crimps at 4.8 mm pitch running along the axis.
- Elbows:
  - ½–12" NPS: two-piece pressed covers, 0.024" 1100-O alloy, clear-coated, with ≥⅝" lap and pleats at the throat.
  - 10–18" NPS: four-piece "quad" covers.
  - Larger: field-gored, with 4–9 gores per 90° and ½–1" lap between gores.

### Stainless
- Thickness: 0.010" up to 24" OD, 0.016" for 24–36" OD, 0.020" above 36" OD.
- Laps and bands follow the same rules as aluminum. Pressed elbows are T316, 0.016".

### PVC (Zeston / Proto)
- Fitting covers: one-piece, slit at the throat (wall thickness not published in the sources reviewed).
- Fastening: on hot work, 2 serrated tacks. On cold work, PVC tape with a 2" overlap facing down.
- Straight-run jacket: 20 or 30 mil, longitudinal lap 1½–2" facing down, circumferential lap about 1".

### ASJ
- White kraft/foil/scrim laminate on 36" hinged sections.
- Self-sealing lap about 1½", butt strips 3" wide.

### Duct wrap
- FSK facing, 2" stapling flange, staples 6" on center.
- 3" foil tape.
- Pins and speed washers 18" on center on duct bottoms 24" wide and up.

### Vessel heads
- Covered with radial orange-peel gores meeting at a center collar.
- The top head cover laps over the shell; the shell laps over the bottom head cover.

## Material looks (sRGB albedo)

| Material | Albedo | Rough | Notes |
|---|---|---|---|
| Calsil | #C9C2B6–#D5CCB5 | .92–.98 | Granular. Pinholes 0.5–3 mm. Saw striations 1–2 mm on cut faces. Chipped edges. Joints at 3 and 9 o'clock. |
| Fiberglass (OC) | #EFC94F | .85–.9 | JM is paler (#DEC263). Knauf ECOSE is brown (#6B5546). Concentric layers 2–6 mm. Hinge cut on one side. Waffle-patterned bore. |
| Mineral wool | cut #B4A368–#C1B58F, skin #D0C6A8 | .9–.95 | Dark shot specks 0.1–1 mm (#3A3528). Pressed chevron pattern on the skin, about 6–12 mm. |
| Cellular glass | #3E3D3A, installed #4F4738–#55524A | .8 | Cells 0.5–1 mm, pits #0E0E0C, glints #CDCECB. Glassy cell walls sparkle. No skin. |
| Elastomeric | skin #262524, cut #1E1D1B | skin .5–.6, cut .85 | Pebbled leather-like skin 0.3–1 mm. Cells 0.1–0.5 mm. Cut face sparkles. |
| Phenolic (Kooltherm) | #E89A84 | .9 | Cells 50–150 µm. Foil/scrim facing #D0D0D0 at rough .3, scrim grid 8–12 mm, crinkle. Hinge cut. |
| Alu mill finish | F0 ≈ #F5F6F6 | .28–.38 | Light anisotropy running around the circumference. |
| Alu stucco | same | .35–.45 | Pebble normal map. |
| SS 2B | #C4C6C8 | .25–.35 | Milky look. Bands at rough .15–.25. |
| PVC white | #F0F0EB (Proto #EDECE2) | .25–.35 | |
| ASJ | #EEEEEA–#F2F2EE | .75–.85 | Scrim grid 6–12 mm. ASJ+ film is shinier (.45–.6). |
| FSK | #D9DBDD, metallic | .25–.4 | Crinkle finish, scrim grid 12–25 mm. |

## Fittings by material
- **Calsil and mineral wool:** mitered segments cut from sections, or prefabricated elbows. Gored metal cover over the top.
- **Fiberglass:** PVC fitting cover over a wrapped insert (commercial work), or 2–5 mitered gores with ASJ tape.
- **Cellular glass:** segments bonded with sealant, or prefabricated split halves.
- **Elastomeric:** small sizes get 2-piece miters; large sizes get 3–5 segments with 22.5° cuts. All glued.
- **Phenolic:** mitered and overwrapped with foil tape.
