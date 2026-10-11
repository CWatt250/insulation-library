# Insulated equipment references (vessels and tanks with jacketed heads)

Downloaded 2026-10-10. Every file was checked with `file` (all JPEG) and is ≥ 681 px. License labels use exactly one of: `CC0`, `CC-BY (attribution: ...)`, `reference-only (copyrighted)`, `unknown`.

## Files

| File | Source | What it shows | License |
|---|---|---|---|
| `equip_vertical-vessels_alum-jacket_gored-dished-heads_gored-elbows_todd-huffman.jpg` | https://www.flickr.com/photos/99287245@N00/941004365 ("TANK!", an ETH Zurich engineering lab) | The key head reference. A row of tall vertical vessels in smooth aluminum jacket. They have **dished tops jacketed in radial "orange-peel" gores** (I estimate about 24–32 gores per head from the photo; they overlap and converge on a small top collar), horizontal circumferential laps (shingled) up the shell, and many-gore segmented elbows on the large connecting pipes. | `CC-BY (attribution: Todd Huffman, Flickr, CC BY 2.0)` |
| `equip_horizontal-deaerator_alum-jacket_jacketed-dished-head_chnpp.jpg` | https://commons.wikimedia.org/wiki/File:Flammrohrrauchrohrkessel_2.jpg | A **horizontal deaerator vessel** in aluminum jacketing with a **jacketed dished end** (left), jacketed nozzles, gored elbows, and a stucco-jacketed vertical vessel above. It is a low-res phone photo (960×1280). | `CC-BY (attribution: ChNPP, Wikimedia Commons, CC BY-SA 3.0. Share-alike applies.)` |
| `equip_vertical-tanks_ribbed-panel-jacketing_peo-acwa.jpg` | https://commons.wikimedia.org/wiki/File:Pueblo_Chemical_Agent-Destuction_Pilot_Plant_Brine_Reduction_Concentrator_Feed_Tank_(8498718860).jpg | Large vertical tanks with **vertical ribbed (standing-rib / box-rib style) metal jacket panels** while crews install the roof panels. It shows panel module width, rib shadows, and edge flashing at the roof. | `CC-BY (attribution: PEO ACWA, Flickr, CC BY 2.0)` |
| `equip_stainless-clad-kettle_conical-head_manway_bernt-rostad.jpg` | https://www.flickr.com/photos/67975030@N00/8698594514 ("Boon Brewery") | A stainless-clad insulated kettle with a **formed conical head**, a stack, and a manway. The cladding seams and the shell-to-head joint are visible. | `CC-BY (attribution: Bernt Rostad, Flickr, CC BY 2.0)` |
| `equip_jm-deep-corrugated-aluminum-sheets_tank-jacketing_ref.jpg` | https://jm.com/content/dam/jm/global/en/insulation-systems/products/assets/image/ind-metaljacketing-corragatedsheets-primary-image.png (page: https://www.jm.com/en/industrial-insulation/metal-jacketing/aluminum-deep-corrugated-sheets) | JM deep-corrugated aluminum sheets (painted), as used on large vertical tanks. | `reference-only (copyrighted)` |
| `equip_jm-box-rib-stucco-sheet_ref.jpg` | https://jm.com/content/dam/jm/global/en/insulation-systems/products/assets/image/ind-boxrib-primary-image.png | A JM box-rib aluminum sheet with a stucco finish (4 in × 1 in rib), used for flat walls and large equipment. | `reference-only (copyrighted)` |

## Construction details with numbers

**Jacket selection** (ASTM C1729/C1767 as presented by ITW's Jim Young, https://insulation.org/wp-content/uploads/sites/2/2017/03/Technical-Presentation-ASTM-Standards-for-Metal-Jacketing.pdf, and JM data sheets)
- **Vertical vessels < 8 ft dia** may use any finish: smooth, stucco, or 3/16 in corrugated.
- **Vertical vessels ≥ 8 ft dia** use **deep-corrugated** sheet: **1¼ in pitch × ¼ in deep**, or **2½ in × 5/8 in**. Sheets are 33 in nominal (31¾ in coverage) in 8–14 ft lengths, with the corrugations running **vertically**.
- **Horizontal vessels must not use 3/16 in corrugated or deep corrugated.** Use smooth or stucco instead.
- **Flat walls** (boilers, precipitators) use **4 in × 1 in box rib**.
- Jacket thickness rises with OD. For aluminum it is 0.024 in (rigid) to 0.040 in (non-rigid) above 36 in OD; for stainless, 0.020 in above 36 in. See the tables in `../jacket-aluminum/` and `../jacket-stainless/`.

**Shell**
- Sheets are applied in horizontal courses. **Each upper course overlaps the course below it** (shingle; 2–3 in laps).
- Vertical laps are staggered course to course and turned away from the prevailing wind.
- Bands are **¾ in × 0.020 in stainless** (¾ in is required at ≥ 16 in OD per JM). Large vessels use **closed seals** (1¼ in, 0.024 in) instead of wing seals and **expansion springs** (JM "Mity-Springs") in each band, because vessels ≥ 8 ft see thermal growth.
- Band spacing on vessels is set by the project spec. About 12 in o.c. (one band per course lap plus intermediates) is common practice, but I could not confirm a single published value.
- S- or Z-clips (band material bent into three 3 in legs) can hang the upper sheets on the lower ones on tall vertical runs (JM 4.5.2.10).

**Heads** (MICA Plate 4-620, 7th edition, "vessel and tank heads", hosted at https://www.wbdg.org/files/pdfs/MICA_4-620.pdf; that URL serves a bot-check to scripts, so I only read the plate text through a search index and did not download it)
- Insulation follows the head contour, using curved segments or blanket. It is secured with the bottom-head methods of Plate 4-610 or with a **floating ring of cable** at the center.
- The head **weatherproofing is "jacketing cut in gores, to overlap and conform to the surface of the head insulation"**, or reinforced mastic. Plate Detail C shows the fabrication of a metal head cover.
- Rigid block or board is recommended on flat heads that get foot traffic.
- **Typical gored head geometry** (from the Huffman photo):
  - Narrow radial gores (wedges) meet at a small central disc or collar.
  - Each gore overlaps the next by about 1–2 in.
  - Overlaps are oriented so the uphill or windward gore sits on top.
  - The gores are fastened with screws or rivets on hot work, or with radial bands to a center ring on cold work.
  - Overlaps follow the water-shedding rule. A **top-head cover laps over the top edge of the shell jacket**, and the **shell jacket laps over a bottom-head cover**.
- **Pressed or spun one-piece head covers** appear on small vessels and brewery kettles (Boon photo: conical head).

## Visual / PBR guidance

- Use the aluminum and stainless values from `../jacket-aluminum/SOURCES.md` and `../jacket-stainless/SOURCES.md`.
- Large panels show strong **oil-canning**: low-frequency normal waviness of 1–3 mm amplitude over 0.3–1 m.
- Gore seams read as dark hairline steps with bright edges.
- Deep corrugation needs real geometry or parallax at about 32 mm pitch and 6 mm depth. A normal map alone looks flat at grazing angles.

## CC0 textures usable directly (links only; not downloaded)

- Poly Haven **corrugated_iron_03** (galvanized, about 76 mm pitch), close to the 2½ in deep-corrugated profile: https://polyhaven.com/a/corrugated_iron_03. Diffuse 2k: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/corrugated_iron_03/corrugated_iron_03_diff_2k.jpg. glTF 2k: https://dl.polyhaven.org/file/ph-assets/Textures/gltf/2k/corrugated_iron_03/corrugated_iron_03_2k.gltf
- Poly Haven **box_profile_metal_sheet** (red-painted box profile), a box-rib geometry and shading reference: https://polyhaven.com/a/box_profile_metal_sheet. Diffuse 2k: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/box_profile_metal_sheet/box_profile_metal_sheet_diff_2k.jpg
- ambientCG **CorrugatedSteel005** (bare corrugated steel): https://ambientcg.com/view?id=CorrugatedSteel005. Download: https://ambientcg.com/get?file=CorrugatedSteel005_2K-JPG.zip
- For the jacket metal itself, see Metal050A/B/C (aluminum) and Metal011 / BrushedIron02 (stainless) in the sibling folders.
