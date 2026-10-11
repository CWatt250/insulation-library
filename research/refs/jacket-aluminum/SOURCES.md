# Aluminum jacketing references

Downloaded 2026-10-10. Every file was checked with `file` (all JPEG) and is ≥ 768 px. License labels use exactly one of: `CC0`, `CC-BY (attribution: ...)`, `reference-only (copyrighted)`, `unknown`.

## Files

| File | Source | What it shows | License |
|---|---|---|---|
| `alu_stucco-straight-vs-smooth-gored-elbow_screws_vertical-riser_peo-acwa.jpg` | https://commons.wikimedia.org/wiki/File:Blue_Grass_Chemical_Agent-Destruction_Pilot_Plant_Utility_Building_(18159265312).jpg (Flickr original: https://www.flickr.com/photos/acwa/18159265312/) | The best single reference here. A vertical riser has **stucco-embossed** straight jacket under a **smooth gored 90° elbow** with a sheet-metal screw at the gore seam. A smooth horizontal pipe shows a circumferential lap, and a worker is fitting jacket. The stucco cell scale is clearly readable. | `CC-BY (attribution: PEO ACWA, Flickr, CC BY 2.0)` |
| `alu_stucco-embossed-jacket_bands-and-circ-laps_vertical-risers_commons-cc0.jpg` | https://commons.wikimedia.org/wiki/File:MLC_chiller_pump_replacement-2.jpg | Indoor chilled-water risers with stucco-embossed aluminum and bright ½ in stainless (or aluminum) bands. Some bands sit over circumferential laps and others are intermediate. The bands are what I used to scale the stucco cells (see below). The same image is copied into `jacket-pvc/`. | `CC0` (IanVG, CC0 1.0) |
| `alu_0p016in-smooth-mill-finish-cut-and-roll-sheet_commons.jpg` | https://commons.wikimedia.org/wiki/File:O_one_six_cut_and_rolled_jacketing.jpg | A roll of "oh-one-six" (0.016 in, 0.41 mm) smooth mill-finish aluminum cut-and-roll jacket standing on end. It shows the mirror-ish but hazy mill finish and the curl. The walls cast a yellow color, and the photo has a date stamp. | `CC-BY (attribution: Achim Hering, Wikimedia Commons, CC BY 3.0)` |
| `alu_large-pipe-multi-gore-segmented-elbows_outdoor-steam-lines_flickr-orion.jpg` | https://www.flickr.com/photos/24988130@N07/2691655091 ("steam pipes 1") | Outdoor large-bore steam lines (geothermal, probably New Zealand, not verified) with smooth aluminum jacket. They show **many-gore segmented 90° elbows** (about 7–9 gores), circumferential laps about every 0.9 m, and expansion loops. | `CC-BY (attribution: "steam pipes 1" by orion / decypher the code, Flickr, CC BY-SA 2.0. Share-alike applies.)` |
| `alu_small-pipe-mitered-elbows_smooth-jacket_wall-risers_marco-ditri.jpg` | https://www.flickr.com/photos/37271760@N00/8973269623 (also https://commons.wikimedia.org/w/index.php?curid=126371144) | Small-bore hot and cold water risers (Milan) in smooth aluminum. The **elbows are 2-segment mitered** (45° cut), as is typical for small European pipe. It also shows circumferential laps and valve terminations. | `CC-BY (attribution: Marco d'Itri, Flickr, CC BY-SA 2.0. Share-alike applies.)` |
| `alu_jm-ell-jacs-two-piece-pressed-elbow-cover_ref.jpg` | https://jm.com/content/dam/jm/global/en/insulation-systems/products/assets/image/ind-metaljacketing-elljacs-primary-image.png (page: https://jm.com/en/industrial-insulation/metal-jacketing/ell-jacs-plus-polyfilm-lined-aluminum-elbow-covers) | The JM Ell-Jacs Plus **two-piece pressed aluminum elbow**: two matching halves, the raised "fingers" (pleats) at the throat, and the blue polyfilm liner inside. | `reference-only (copyrighted)` |
| `alu_jm-roll-jacketing_smooth-stucco-3-16-corrugated_polyfilm-liner_ref.jpg` | https://jm.com/content/dam/jm/global/en/insulation-systems/products/assets/image/ind-metaljacketing-primary-image.png | JM roll jacketing side by side in stucco-embossed, smooth, and 3/16 in corrugated (fine axial crimps) finishes. The light-blue polyfilm moisture barrier shows inside. | `reference-only (copyrighted)` |

## Construction details with numbers

Main source: the JM *Metal Jacketing Installation Guide*, https://www.jm.com/content/dam/jm/global/en/industrial-insulation/metal-jacketing/IND_MetalJacketing_Install_Guide.pdf. Other sources are noted inline.

**Material**
- Alloy 3003 or 3105-H14 per ASTM C1729 / B209, with a factory heat-laminated **3-mil polyfilm moisture barrier** on the inside (light blue in JM product). The older moisture barrier is 1–3 mil polykraft.
- Standard roll is Type I, Grade 1, Class A, **0.016–0.024 in**. Heavy-duty roll is ≥ 0.032 in (H12). An optional safety hem is **3/8–1/2 in** wide.

**Minimum thickness vs insulation OD** (JM Table 1, per ASTM C1729; "rigid" means ≥ 15 psi compressive)

| Insulation OD | Rigid insulation | Non-rigid insulation |
|---|---|---|
| ≤ 8 in | 0.016 in | 0.016 in |
| > 8–11 in | 0.016 in | 0.020 in |
| > 11–24 in | 0.016 in | 0.024 in |
| > 24–36 in | 0.020 in | 0.032 in |
| > 36 in | 0.024 in | 0.040 in |

**Finishes**
- **Smooth (mill)**, **stucco-embossed**, and **3/16 in corrugated**. The 3/16 in corrugated finish has parallel crimps about **3/16 in (4.8 mm) apart running along the pipe axis**. It is limited to 0.024 in maximum thickness and is used on large pipe and on vessels up to 8 ft. Its crimp depth is not published; it looks about 0.5–1 mm in photos.
- **Deep corrugated** sheet is used for vessels ≥ 8 ft: **1¼ in pitch × ¼ in deep**, or **2½ in pitch × 5/8 in deep** (½ in in the Eastern Canada mill). Sheets are 33 in nominal wide (31¾ in coverage), in 8–14 ft lengths.
- **Box rib** is **4 in × 1 in** and is used for flat walls. Source: JM Deep Corrugated Sheets data sheet.
- The C1729 thickness requirement excludes the embossing and corrugation height.

**Stucco emboss scale**
- The emboss is an irregular, non-directional "pebble" or orange-peel pattern.
- **Cell size about 3–5 mm (⅛–3/16 in).** I measured this on the CC0 photo above against the ½ in bands: a band is about 10 px and a cell about 2–4 px. The Blue Grass photo is consistent with this.
- **Relief about 0.1–0.3 mm.** Supplier data gives 0.1–0.25 mm emboss depth for stucco coil (Henan Xuntai listing on alcircle), and Steelscape's stucco pattern is 0.007–0.012 in.
- I found no published industry standard for the pattern geometry.

**Overlaps**
- **Longitudinal lap** is **≥ 2 in for insulation OD < 16 in** and **≥ 3 in for OD ≥ 16 in** (JM 4.2.6). Cut-and-roll is sold pre-formed with a 2 in or 3 in lap. K-Flex asks for ≥ 4 in on large pipe.
- **Circumferential (end) lap** is **≥ 2 in** (JM 4.2.4). The section length is 36 in (the coil width), so the exposed pitch is about 34 in.
- **Butt straps** (an alternative over end joints) are **2 in wide**, 0.020 in aluminum (JM Strapping & Seals).

**Seam orientation (water shedding)**
- On **horizontal pipe**, the longitudinal seam sits at **3–4 o'clock or 8–9 o'clock** and the **lap opening faces down** (JM 4.2.5).
- On **vertical pipe**, **each upper piece overlaps the piece below it** like shingles.
- At circumferential joints, the upstream or uphill piece goes over the downhill piece, and openings face away from prevailing wind.
- On horizontal elbows, the **top half overlaps the bottom half** at both heel and throat.
- An elbow at the top of a vertical run sits **over** the straight jacket below it. At the bottom of a vertical run, the straight jacket sits **over** the elbow.
- Sealant, where used on cold work, goes **inside the lap**, never as an external bead.

**Banding**
- One band and seal is **centered over every circumferential joint**, plus intermediate bands at **max 9 in (229 mm) on center** (JM 4.1.6 / 4.5.2.5).
- JM's own example for a 36 in section is two evenly spaced intermediate bands, which works out to about 11–12 in on center. Many project specs say "bands not more than 12 in apart", and Muffl-Jac uses 9–12 in.
- **Default for the model: 9 in o.c. plus a band over every lap; option for 12 in.**
- **Stainless banding (preferred)** is T304, **0.020 in thick × ½ in wide for OD < 16 in, ¾ in for OD ≥ 16 in**. 0.015 in is acceptable on small, non-rigid insulation.
- **Aluminum banding** is 0.020 × ½ or ¾ in. It is used only for OD ≤ 8 in, non-corrosive service, and where the jacket is no thicker than the band.
- **Wing seals** are **0.032 in thick**, the same width as the band. They form a short crimped sleeve, about 1 in long (my estimate), with two folded "wings", and the band tail folds back over the seal (JM Fig. 1).
- **Closed seals** are 1¼ in long, 0.024 in. They replace wing seals on vessels ≥ 8 ft dia and when springs are used.

**Screws and rivets (hot work only)**
- **#8 × ½ in stainless sheet-metal screws, max 6 in o.c.** along the straight-pipe longitudinal seam.
- On elbow covers they go **max 3 in o.c.**, starting at the center of the heel and working outward.
- Screws are never used where a vapor retarder is present (cold work).

**Elbow construction**
- 1. **Two-piece pressed** ("Ell-Jacs Plus") is the default for ½–12 in NPS, 45° and 90°, long or short radius.
  - It is 1100-O aluminum, **0.024 in**, with a clear acrylic or polyester baked exterior and a polyfilm interior.
  - **Heel and throat lap ≥ 5/8 in** (ASTM C1729); the minimum allowable is 5/16 in.
  - It has raised **pleat "fingers" along the throat**. On cold work the bands go between the fingers.
- 2. **Four-piece pressed "Quad"** elbows cover some 10–18 in NPS.
- 3. **Field-fabricated gored elbows** cover larger sizes (MICA plate on metal-jacketed gored elbows, cited as "Plate 11" in an insulation.org article; numbering varies by edition).
  - The usual sheet-metal convention is *n* full gores plus 2 half-gores at the ends. The photos show about 4–9 gores per 90°, with more gores on larger radii.
  - Each gore laps the next by about ½–1 in with a swaged or beaded edge, held by screws on hot work and bands on cold work.
- 4. **2-segment mitered** elbows are common on small European lines (Milan photo).

## Visual / PBR guidance (sRGB; glTF metal-roughness)

- **Smooth mill finish.**
  - Physical aluminum F0 is about `#F5F6F6`. For a realistic installed jacket use base color **`#D4D7DA`**, metallic 1, **roughness 0.28–0.38**.
  - Add mild anisotropy (0.2–0.4) **running circumferentially**. On cut-and-roll, the coil's rolling direction wraps around the pipe because the 36 in coil width becomes the axial length.
  - Weathered or outdoor: `#B9BDC0`, roughness 0.5–0.6, with low-frequency mottling and water streaks below laps.
- **Stucco-embossed.** Same base color, roughness 0.35–0.45, and a normal or height map of Voronoi/Worley "pebbles" with **3–5 mm cells and about 0.2 mm height**. It reads brighter, more diffuse, and "glittery", and it hides dents.
- **3/16 in corrugated.** Same base color plus an axial sinusoid normal at 4.8 mm pitch.
- **Pressed elbows (clear-coated).** Base `#D8D9D4`, often with a faint champagne tint (`#D6CFB9` on JM Multi-Fit), roughness 0.2–0.3, and a clearcoat layer.
- **Oil-canning and dents.** Use low-amplitude (0.3–1 mm) large-scale normal waviness on smooth jacket. It is much less visible on stucco.
- **Cut edges and open ends** show the light-blue polyfilm (`#A9CFE6`) or white polykraft.

## CC0 textures usable directly (links only; not downloaded)

- ambientCG **Metal050B** (aluminum, light scratches), a good mill-finish base: https://ambientcg.com/view?id=Metal050B. Download: https://ambientcg.com/get?file=Metal050B_2K-JPG.zip
- ambientCG **Metal050A** (clean aluminum): https://ambientcg.com/view?id=Metal050A. Download: https://ambientcg.com/get?file=Metal050A_2K-JPG.zip
- ambientCG **Metal050C** (rough, scratched aluminum, weathered outdoor jacket): https://ambientcg.com/view?id=Metal050C. Download: https://ambientcg.com/get?file=Metal050C_2K-JPG.zip
- **No CC0 stucco-embossed aluminum texture was found** on ambientCG, Poly Haven, or cgbookcase. Generate it procedurally (Voronoi pebble, 3–5 mm). Poly Haven `leather_white` (https://polyhaven.com/a/leather_white) is only a weak, too-fine approximation.
- Poly Haven **corrugated_iron_03** (galvanized corrugated, about 76 mm pitch) is a reference for profile shading only, since the pitch differs from jacketing: https://polyhaven.com/a/corrugated_iron_03. Diffuse 2k: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/corrugated_iron_03/corrugated_iron_03_diff_2k.jpg
