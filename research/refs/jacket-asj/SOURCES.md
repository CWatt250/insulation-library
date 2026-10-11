# ASJ (All-Service Jacket) references

Downloaded 2026-10-10. Every file was checked with `file` and is ≥ 720 px on its long side. License labels use exactly one of: `CC0`, `CC-BY (attribution: ...)`, `reference-only (copyrighted)`, `unknown`.

## Files

| File | Source | What it shows | License |
|---|---|---|---|
| `asj_fiberglass-pipe-covering_white-jacket_butt-joint_closeup_commons-pd.jpg` | https://commons.wikimedia.org/wiki/File:Fs195_cp25_fibreglass_pc.jpg (1920 px thumb: https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Fs195_cp25_fibreglass_pc.jpg/1920px-Fs195_cp25_fibreglass_pc.jpg) | A close-up of 2" fiberglass pipe covering with a white ASJ on a vertical steel pipe. It shows the circumferential butt joint between sections, the fine wrinkle and cockle texture of the kraft face, and the matte white color. The firestop wrap at the slab is not ASJ. The photo has burned-in text labels and a date stamp. | `CC0`. This is actually a public-domain release by the author (Achim Hering), not a CC0 deed. It is free to use with no attribution. |
| `asj_fiberglass-pipe-covering_butt-joints_vertical-risers_commons-pd.jpg` | https://commons.wikimedia.org/wiki/File:Caj8073_piping.jpg (1280 px thumb) | A two-panel composite. The top panel shows ASJ-jacketed fiberglass risers with butt joints. The bottom panel shows foil-faced and metal-jacketed pipes under the slab. It is annotated. | `CC0`. This is actually a public-domain release by Achim Hering, not a CC0 deed. |
| `asj_white-jacket-being-applied_fiberglass-pipe_alum-jacketed-pipe-above_mta.jpg` | https://commons.wikimedia.org/wiki/File:Installing_insulation_around_overhead_ductwork_in_the_future_LIRR_passenger_concourse._(CM014B,_12-20-2018)_(31468440217).jpg | A worker applies a long white jacket or butt strip to round insulation with yellow fiberglass ends. Aluminum-jacketed lines with circumferential laps and a band are visible above. The MTA caption says "ductwork". The objects look like round pipe or duct, and I could not confirm whether the white material is ASJ or a white roll jacket. | `CC-BY (attribution: MTA Capital Construction Mega Projects, Flickr, CC BY 2.0)` |
| `asj_jm-microlok-hp_asj-ssl-sections_scrim-texture_ref.jpg` | https://jm.com/content/dam/jm/global/en/insulation-systems/products/assets/image/mech-microlokhp-primary-image.png (served as JPEG; found on https://jm.com/en/mechanical) | A JM Micro-Lok HP studio shot. Yellow fiberglass sections carry a white ASJ with a fine diagonal scrim texture. The hinged longitudinal lap line is visible on the large section. | `reference-only (copyrighted)` |
| `asj_knauf-earthwool-pipe_white-asj-vs-foil-scrim-facing_ref.png` | https://res.cloudinary.com/knauf-insulation/image/upload/v1576099469/Knauf%20Insulation/Pipe%20and%20Tank/Images/Actually_Transparent.png (page: https://www.knaufnorthamerica.com/en-us/products/pipe-and-tank-insulation/performance-plus-earthwool) | Knauf pipe insulation with a white ASJ facing next to a foil facing. The foil shows the glass-scrim grid through it, which is a useful reference for the scrim pattern. The PNG has a transparent background and was resized to 1000 px. | `reference-only (copyrighted)` |

## Construction notes for modeling

- **Laminate.** ASJ is bleached white kraft paper laminated to aluminum foil and reinforced with a glass-fiber scrim. "ASJ+" (Knauf) and "ASJ Max" (Owens Corning) add an outer film so that no paper is exposed. Source: the Knauf Earthwool 1000° data sheet, https://www.buildsite.com/pdf/knauf/Performance-Earthwool-1000-Pipe-Insulation-with-ECOSE-Technology-Product-Data-2968930.pdf
- **Sections.** Sections are one-piece, hinged, and **36 in (914 mm) long**. They are slit along one side, and the jacket overhangs the slit as a self-sealing lap (SSL) with adhesive and a release strip. Source: Owens Corning Pub. 10021355 (installation instructions).
- **Lap.** The longitudinal lap is about **1½ in (38 mm)** wide. This is the common industry figure; I could not find it stated on a data sheet. It is applied by pulling the release strip and rubbing from the middle of the section toward the ends. The lap is usually placed out of sight, either on the side or at the bottom, toward the wall.
- **Butt strips.** One matching butt strip ships with each section (Knauf, OC). The strip is centered over the circumferential joint and runs the full circumference plus a small self-overlap. Matching ASJ butt-strip tape is **3 in (76 mm)** wide (for example, Ideal 729 ASJ+ tape, 3" × 150'). Model the strip as a 76 mm band, about 0.15 mm proud of the surface.
- **Pipe insulation size.** The OD follows ASTM C585, and the jacket adds about 0.3–0.5 mm.
- **Service limits.** The ASJ surface temperature must stay ≤ 150 °F (66 °C). ASJ is not for long-term outdoor use, and outdoors it is covered with metal or PVC jacketing.

## Visual / PBR guidance (sRGB)

- **Paper-faced ASJ.** Base color `#EEEEEA`–`#F2F2EE`, metallic 0, roughness 0.75–0.85, almost no sheen. In daylight photos it samples about `#D1D2D1`.
- **Film-faced ASJ+ / ASJ Max.** Same base color, roughness 0.45–0.60, with a faint satin highlight.
- **Normal detail.** Use a faint scrim pattern, either a diagonal crosshatch or a tri-directional grid, at about 6–12 mm pitch and 0.05–0.1 mm relief. Add low-frequency cockle and wrinkles, which are strongest near butt strips and laps.
- **Lap and butt strip.** These read as slightly brighter bands with a crisp edge line, and the strip edge casts a hairline shadow.

## CC0 textures usable directly (not downloaded; links only)

- ambientCG **Paper001** (white paper): https://ambientcg.com/view?id=Paper001. Download: https://ambientcg.com/get?file=Paper001_2K-JPG.zip
- ambientCG **Paper002** (off-white speckled paper, good for ASJ): https://ambientcg.com/view?id=Paper002. Download: https://ambientcg.com/get?file=Paper002_2K-JPG.zip
- ambientCG **Paper004 / Paper006** (brown kraft, for the kraft side of FSK or the jacket edges): https://ambientcg.com/view?id=Paper004 and https://ambientcg.com/view?id=Paper006, using the same `get?file=<ID>_2K-JPG.zip` pattern.
- ambientCG **Fabric081C** (white plastisol, smooth matte white, an alternative for film-faced ASJ): https://ambientcg.com/view?id=Fabric081C
- cgbookcase **Fabric 08** (off-white open-weave mesh, a scrim pattern reference or alpha): https://www.cgbookcase.com/textures/fabric-08 (file `Fabric08_MR_4K.zip`)
