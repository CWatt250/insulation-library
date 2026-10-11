# PVC jacketing & PVC fitting covers references

Downloaded 2026-10-10. Every file was checked with `file` (all are real JPEG or PNG) and is ≥ 720 px. License labels use exactly one of: `CC0`, `CC-BY (attribution: ...)`, `reference-only (copyrighted)`, `unknown`.

## Files

| File | Source | What it shows | License |
|---|---|---|---|
| `pvc_white-fitting-covers-on-valves-and-elbows_stucco-alum-risers_commons-cc0.jpg` | https://commons.wikimedia.org/wiki/File:MLC_chiller_pump_replacement-2.jpg (1920 px thumb) | Butterfly valves and offset elbows on chilled-water risers, covered in white one-piece covers that look like PVC fitting covers, with white tape at the joints. The pipes above have stucco-embossed aluminum jacketing with bands. The uploader only says "valves are covered by insulation", so the covers being PVC is my reading of the photo. The same image is copied into `jacket-aluminum/`. | `CC0` (IanVG, CC0 1.0) |
| `pvc_grey-pvc-jacket_elbow-and-tee-covers_chw-headers_seeweb.jpg` | https://www.flickr.com/photos/65475777@N06/7512592250 | Chilled-water headers under a raised floor in a European data center. They have light-grey PVC jacketing with molded PVC elbow covers, tee covers, and circumferential joints. Black elastomeric is used on the valve branches. | `CC-BY (attribution: "Insulated pipes and valves" by Seeweb, Flickr, CC BY-SA 2.0. Share-alike applies to derivatives.)` |
| `pvc_proto-90-elbow-fitting-cover_knauf_ref.png` | https://res.cloudinary.com/knauf-insulation/image/upload/v1575912448/Knauf%20Insulation/Proto%20PVC%20Fitting%20Covers/Images/Transparent.png (page: https://www.knaufnorthamerica.com/en-us/products/pipe-and-tank-insulation/proto-pvc-fitting-covers) | A Proto one-piece 90° PVC elbow cover in studio light. It is semi-gloss ivory-white with a smooth-radius heel, and the throat seam is on the inside radius. The background is transparent. | `reference-only (copyrighted)` |
| `pvc_zeston-2000-fitting-covers-elbows-tees-caps_jm_ref.png` | https://jm.com/adobe/dynamicmedia/deliver/dm-aid--075f21a5-ba35-4701-8506-9250d5a92b44/mech-zeston-2000-primary-image.png (page: https://jm.com/en/mechanical/pvc-products/zeston-2000-series) | The Zeston 2000 line: 90° and 45° elbows, a tee, end caps, a valve cover, and a pleated "accordion" multi-angle elbow, in white and colors. | `reference-only (copyrighted)` |
| `pvc_zeston-accessories_serrated-tacks-ztape-permaweld_jm_ref.jpg` | https://jm.com/content/dam/jm/global/en/insulation-systems/products/assets/image/mech-zeston-accessories-primary-image.png (served as JPEG) | Zeston accessories: serrated stainless tacks (loose in the box at right), Z-Tape PVC tape rolls, and Perma-Weld solvent adhesive with an applicator. | `reference-only (copyrighted)` |
| `pvc_zeston-pvc-roll-jacketing_jm_ref.jpg` | https://jm.com/content/dam/jm/global/en/insulation-systems/products/assets/image/mech-zeston-pvc-jacketing-primary-image.png (served as JPEG) | Rolls of Zeston PVC jacketing in color and white. It shows the sheet thinness and gloss. | `reference-only (copyrighted)` |

Brands: Proto is now sold by Knauf North America; Zeston 2000/300 is Johns Manville.

## Construction notes for modeling (JM Zeston install guide 06/21/24: https://www.jm.com/content/dam/jm/global/en/mechanical-insulation/pvc/JM_PVC%20install%20guide.pdf, and the Zeston 2000 data sheet)

- **Thickness.** Zeston 2000 fitting covers are 20 mil (0.020 in, 0.5 mm) nominal. Zeston 300 is the heavy-gauge line. Roll jacketing for sealed (USDA) systems is 20 or 30 mil (0.5 or 0.8 mm), and Proto LoSmoke roll is sold in 15 mil and up. Service temperature at the PVC surface is −20 or 0 °F to 150 °F.
- **Fitting cover construction.** Each cover is a single molded piece with a slit along the throat, which is the inside radius. The cover is snapped over a precut fiberglass insert, and the insert points sit on the inside radius. The throat overlap is closed in one of these ways:
  - On hot work, with **2 serrated stainless tacks** placed about **¼ in (6 mm) from the lap edge** and pushed through the overlap. No other fastening is needed.
  - On cold work, with mastic in the throat lap plus Z-Tape.
  - On USDA work, with Perma-Weld solvent weld.
- **Covers at joints.** The cover ends butt to the pipe insulation. On cold systems, Z-Tape wraps the circumferential edges and **overlaps itself ≥ 2 in (51 mm) on the downward side**, so the tape tail points down and sheds water.
- **Straight-pipe PVC jacket.**
  - The longitudinal overlap is **1½–2 in (38–51 mm)**. Place the seam toward the wall or bottom, with the free edge facing down so it sheds water.
  - Circumferential overlaps are about **1 in (25 mm)**. The jacket also overlaps the fitting cover by about 1 in.
  - Slip joints use an **8–10 in (203–254 mm)** overlap with white caulk.
- **Tacks.** Annular-serrated stainless "thumb" tacks are sold 500 per box. They have a small, nearly flush round head. I estimated the head at about 3/8 in (10 mm) across from product photos; the manufacturer does not publish this size.
- **Elbow geometry.** Covers are sized by a fitting number (for example #1, #2, … for 1-piece covers), matched to NPS and insulation thickness per ASTM C585. Heel and throat are smooth and continuous, not gored. JM also sells a pleated, multi-angle elbow.

## Visual / PBR guidance (sRGB)

- **White PVC (Zeston, Proto).** Base color `#F0F0EB` (very slightly warm). Proto reads a touch more ivory, about `#EDECE2`. Metallic 0, roughness 0.25–0.35 (semi-gloss), with a soft wide highlight. Add an optional clearcoat at 0.3 and roughness 0.2.
- **European grey PVC** (as in the Seeweb photo). Close to RAL 7035, about `#CBCDC6`, roughness about 0.35.
- **Flat panels and long pipe runs** show faint "oil-canning" waviness. Use a low-frequency normal map with 0.1–0.3 mm amplitude over 100–300 mm.
- **Tape.** Z-Tape matches the color with a slightly higher gloss. Model it as a 25–38 mm band, 0.13 mm thick.

## CC0 textures usable directly (links only)

- ambientCG **Plastic013A** (white plastic, faint texture): https://ambientcg.com/view?id=Plastic013A. Download: https://ambientcg.com/get?file=Plastic013A_2K-JPG.zip
- ambientCG **Plastic010** (smooth white plastic): https://ambientcg.com/view?id=Plastic010. Download: https://ambientcg.com/get?file=Plastic010_2K-JPG.zip
- ambientCG **Plastic013B** (scratched white plastic, for weathered or abused covers): https://ambientcg.com/view?id=Plastic013B
- Poly Haven **leather_white** (very subtle, even grain, a possible micro-normal for a satin PVC finish): https://polyhaven.com/a/leather_white. Diffuse 2k: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/leather_white/leather_white_diff_2k.jpg
