# Realism gaps: our renders vs. real field installs

Written 2026-10-10. I compared the five renders in `research/renders/` against 65 new field photos in `refs/field/` and the earlier product and close-up set in `refs/*/`.

**How photos are cited:** `NN/file` means `research/refs/field/NN-<query-slug>/file`. The earlier sets are cited as `refs/<folder>/file`.

**How numbers were measured:**
- Luminance and colour come from crops of jacket surfaces in the renders and photos. Values are sRGB 0–255. "B−R" is mean blue minus mean red, a white-balance proxy.
- The stucco scale comes from autocorrelation.
- Anything marked "est." is read off the photo by eye, scaled against known parts: ½"/¾" bands, 36" sheets, handwheels, unistrut.

## What the renders currently look like

| Render | Summary |
|---|---|
| `photo-calsil.jpg` | Charcoal studio void. One straight pipe, about 4 D long, sits on two T-post stands with its jacket resting directly on a saddle. Smooth Al jacket in four perfect, evenly spaced sheets, uniform in brightness. One straight screw row. Bands barely readable. |
| `photo-cg-plant.jpg` | Same rig on a foggy blue concrete plane. Stucco Al reads as pixel-level salt-and-pepper sparkle. Strong blue cast (B−R **+47**). The cellular-glass cut face is flat black. |
| `photo-fg-asj2.jpg` | ASJ is a smooth, warm cream (B−R −10) and nearly clipped (p50 236, p95 244). No SSL lap line, no butt strip, no scrim; instead an open slot shows the fiberglass. |
| `photo-fg-elbow-pvc.png` | The PVC fitting cover and the straight jacket are the same matte off-white. The cover is a perfect torus with no slit, lap, tape or tacks. The vertical leg floats with no support. |
| `ui-mineralwool-elbow.png` | The gored elbow reads as a stack of stepped rings ("stack of coins"). About 30 **screws render as glowing white dots**. The straight jacket is dull mid-grey (p50 125) with no environment detail. |

Common to all five: no surroundings, a 3/4 product-shot camera looking down at a knee-height pipe, perfectly cylindrical geometry, identical sheets, no wear, and no terminations.

## Measurements

| Crop | p5 | p50 | p95 | p95/p5 | B−R |
|---|---|---|---|---|---|
| RENDER calsil, smooth Al | 39 | 148 | 243 | 6.2 | −6 |
| RENDER cg-plant, stucco Al | 46 | 103 | 209 | 4.5 | **+47** |
| RENDER mineral-wool elbow, smooth Al | 47 | 125 | 181 | 3.8 | +6 |
| RENDER ASJ straight | 47 | **236** | 244 | 5.2 | −10 |
| RENDER PVC cover / PVC straight | 52 / 48 | **233 / 240** | 244 / 244 | 4.7 / 5.0 | −9 / −10 |
| PHOTO `06/alu-jacket-large-pipe-aligned-band-seals…` (indoor) | 83 | 118 | 141 | 1.7 | −2 |
| PHOTO `08/ss-alu-rooftop-headers-gored-elbows-leaves…` | 26 | 143 | **253** | 9.9 | −8 |
| PHOTO `09/chalky-alu-jacket-outdoor-pipe-rack…` | 68 | 132 | 215 | 3.2 | +4 |
| PHOTO `09/alu-jacket-refinery-gored-elbows-screw-lines…` | 81 | 205 | **245** | 3.0 | +4 |
| PHOTO `11/alu-jacket-vessel-dished-heads…` (shop) | 101 | 157 | 217 | 2.2 | −5 |
| PHOTO `04/stucco-alu-ammonia-lines…` | 88 | 127 | **249** | 2.8 | +13 |
| PHOTO `05/pvc-glossy-fitting-covers…`: PVC cover / ASJ straight | 111 / 37 | 147 / 172 | 178 / 183 | — | **0 / −5** |
| PHOTO `05/white-pvc-large-chw-risers…` (PVC) | 198 | 226 | 238 | 1.2 | +3 |

What the measurements show:
- Real metal jacket ranges from flat and dull (p95/p5 1.7, indoor and diffuse) to mirror-like (9.9). The appearance is set by the surroundings, not by the material.
- In 3 of 8 photo crops, highlights reach 245–253, so they clip. The renders roll off at 243–244.
- Field photos sit at B−R −8 to +13. The plant render is far outside that range at +47.
- Stucco autocorrelation at a 1 px lag:
  - render (mid-distance): **0.71**, meaning pixel-level noise;
  - field photo at a similar distance: **0.92**, a smooth sheen;
  - macro photo `02/stucco-alu-macro-band-texture-scale-01.jpg`: cell pitch = **0.27 × band width**. That gives ≈3.4 mm with a ½" band, which matches the 3.4 mm in `gen_textures.py`, so the scale is right and the filtering is wrong.

---

## Gaps, ranked by realism impact

### 1. Nothing for the metal to reflect: lighting and environment
**Real:**
- Aluminum and stainless jacketing reads almost entirely as a distorted reflection of its surroundings.
- Indoors, rows of fluorescent or LED battens make **long, sharp, bright streaks running along the pipe axis**. Those streaks often clip to 255. Dark ceilings and neighbouring pipes show up as near-black bands, giving p5 in the 26–40 range on smooth jacket.
  - Examples: `08/alu-jacket-multi-gore-elbow-swaged-laps-plant-01.png`, `05/frp-molded-valve-cover-on-alu-riser-01.jpg`
- Outdoors, each jacket shows a **horizon split**: sky colour on the upper half (blue under clear sky, white-grey under overcast) and a darker ground reflection (gravel, concrete, grass) on the lower half, with a crisp sun highlight.
  - Examples: `02/smooth-alu-outdoor-gored-bends-blue-sky-01.jpg`, `09/alu-jacket-refinery-gored-elbows-screw-lines-column-01.jpg`
- Indoor colour is neutral to slightly warm; incandescent and sodium rooms go warm (`01/stucco-alu-mech-room-headers-tees-green-valves-01.jpg`).

**Ours:** A studio void gives one broad soft highlight and a featureless dark lower half. The plant mode is a monochrome blue fog (B−R +47).

**Model it:**
- Add two scene presets: a **mech-room** HDRI with ceiling batten rows, plus a few **emissive strip-light quads** (1200 × 50 mm at 2.7–3.5 m, 4000–5000 K) so the path tracer produces true axial streaks; and an **outdoor** HDRI with a real sky/ground split.
- Keep white balance within B−R ±15.
- Let highlights clip slightly; see gap 16.

### 2. Lone pipe in a void: no installation context
**Real:**
- Insulated pipe is never alone. Typical scenes have 3–10 parallel runs at about 1.2–2 jacket ODs centre-to-centre.
- They sit on trapezes (unistrut 41 × 41 mm on 10 mm threaded rod), pipe racks or rooftop pipe stands.
- Around them: valves with handwheels, flanges, gauges, pumps, cable ladder, sprinkler mains, concrete slab or deck soffit, CMU walls.
- Neighbour pipes show up in every jacket's reflection.
- Examples: `04/stucco-alu-ammonia-lines-unistrut-clamps-valve-station-01.jpg`, `09/chalky-alu-jacket-outdoor-pipe-rack-rusty-steel-01.jpg`, `07/elastomeric-chiller-plant-large-headers-01.jpg`

**Ours:** One pipe, about 4 D long, on two T-post stands, with nothing else in frame.

**Model it:**
- Build a parametric **context kit**: N extra runs from the same sweep generator (mixed NPS and jackets) at real spacing, a trapeze or rack bay every 3–4.5 m, threaded rods up to a slab plane, a CMU or painted wall, and 1–2 valves and flanges.
- These elements only need simple PBR; their main job is to appear in the reflections.

### 3. Perfect cylinders: no oil-canning, out-of-roundness or dents
**Real:**
- Thin jacket (0.016–0.024") over insulation is never a true cylinder.
- Reflections wobble with low-frequency waves (est. amplitude 0.5–2 mm, wavelength 100–400 mm). The jacket pillows between bands and pinches slightly under each band.
- It flattens near the longitudinal lap, and sheets go slightly oval over soft insulation.
- Rooftop and outdoor work shows creases and dents.
- Examples: `01/alu-jacket-rooftop-pressed-elbows-oilcanning-dents-01.jpg` (dents and soft creases), `06/alu-jacket-large-pipe-aligned-band-seals-bare-calsil-end-01.jpg` (wavy reflections on every sheet), `02/smooth-alu-hand-formed-bend-creases-wall-penetration-01.jpg` (wrinkled hand-formed bend)

**Ours:** Mathematically round. The 0.006-amplitude "ripple" in the alu normal map is invisible at viewing distance.

**Model it:**
- Displace the swept jacket vertices in geometry, not just in the normal map:

  `r(θ, z) = r_J + A·fbm(θ·r_J, z; λ≈150–400 mm) + pillow(z) − pinch(band z ±10 mm) + flat(θ_lap)`

- Use A ≈ 0.5 mm over calsil or cellular glass and 1–2 mm over fiberglass or mineral wool, with a per-sheet seed.
- Add 0–3 random dents per sheet outdoors (Gaussian, radius 20–60 mm, depth 1–4 mm).
- This needs about 128–192 radial segments and roughly one ring per 10 mm.

### 4. Identical, pristine sheets: no sheet variation or handling marks
**Real:**
- Neighbouring sheets differ visibly in brightness and tint, because of different coils and rolling direction (est. ±3–6% luminance).
- The fine rolling streaks change direction from sheet to sheet.
- Fingerprints and smudges cluster near laps, bands and seams where hands go. Light scratches run along the axis, and dust collects on the upper half.
- Examples: `06/alu-jacket-large-pipe-aligned-band-seals-bare-calsil-end-01.jpg` (tone steps sheet to sheet, dirt specks), `08/alu-gored-elbow-screw-rows-scratched-jacket-at-pipe-shoe-01.jpg` (handling scratches), `01/alu-jacket-fire-pump-headers-pressed-elbows-valve-boxes-01.jpg` (darker sheets)

**Ours:** Every sheet has the same albedo and roughness, and the texture is continuous across laps.

**Model it:**
- Use the per-piece vertex tint that already exists: give each sheet a random ±4% luminance and a ±0.01 warm/cool shift.
- Add a random UV offset and rotation per sheet so streaks don't line up.
- Make 3–4 alu material variants with a roughness offset of ±0.04 and assign them per sheet.
- In `gen_textures.py`, bake a "handled" roughness layer: smudge blobs of 20–60 mm at +0.08–0.15 roughness, weighted toward the sheet ends.
- Darken and roughen up-facing vertices with a dust term `max(0, n·up)`.

### 5. Elbows and fittings do not look like real fitting covers
**Real:**
- **Gored elbows:** 4–5 gores on small pipe, 7–12 on large pipe, dozens on very large bends.
  - Each gore lap is a **swaged or rolled bead** (est. 3–5 mm wide, about 1 mm proud) that reads as a bright line with a shadow line. It is not a stepped ring.
  - Screws or rivets follow the gore seam line.
  - Examples: `08/alu-jacket-multi-gore-elbow-swaged-laps-plant-01.png` (≈9 gores), `09/alu-jacket-refinery-gored-elbows-screw-lines-column-01.jpg`, `09/alu-jacket-large-bend-many-gores-refinery-dusk-01.jpg`
- **Pressed two-piece elbows:**
  - a centre seam ridge in the bend plane;
  - smooth heel;
  - 3–5 large curved pleat "fins" at the throat (`02/stucco-alu-risers-cone-caps-pressed-elbows-roof-boots-01.jpg`, `refs/user-google/06-pressed-elbow-pleats-removable-blanket-closeup.jpg`).
- **PVC covers:**
  - visibly **glossier than the straight jacket**;
  - lap 25–50 mm over the straight, with a visible edge;
  - finished with serrated or pinked ends or tape bands;
  - throat slit with an overlap.
  - Examples: `05/pvc-glossy-fitting-covers-matte-asj-straights-labels-hangers-01.jpg`, `05/white-pvc-large-chw-risers-steel-frame-saddles-serrated-cover-ends-01.jpg`
- **Tees:** field-fabricated with a crimped or fishmouthed saddle (`02/stucco-alu-crimped-tee-saddle-band-seal-01.webp`).

**Ours:**
- The gored elbow is a stack of outward steps.
- The pressed elbow has no pleats or seam.
- The PVC cover is a perfect torus with the same material as the straight.

**Model it:**
- Replace the stepped gore lap with a **bead profile** in the sweep (a half-round of 1 mm × 4 mm) plus the 0.4 mm overlap edge.
- Choose the gore count from NPS (small 4–5, 10–18" NPS 7–9, larger 9–12).
- Pressed elbow: add a mid-plane seam rib and 3–5 throat pleats as swept crescents.
- PVC cover: clearcoat 0.8, roughness 0.12–0.2 versus 0.3 on the straight. Add a 0.5–0.8 mm thick lip over the straight jacket, plus a 50 mm tape band or a serrated end.

### 6. Screws: wrong tone, size and pattern
**Real:**
- #8 hex-washer-head screws read **darker than the jacket** (grey zinc or SS head, about 10 mm washer) with one tiny highlight.
- On straights they run in a single row along the longitudinal lap.
- On gored elbows there is one screw per gore lap along the seam line, or neat rows along the gore seams on vessel heads.
- Outdoors they rust-stain the jacket below them.
- Examples: `08/alu-gored-elbow-screw-rows-scratched-jacket-at-pipe-shoe-01.jpg`, `03/weathered-alu-gored-elbow-rusty-screws-crimped-cap-01.jpg`

**Ours:** In `ui-mineralwool-elbow.png`, about 30 screws render as saturated white dots scattered in rings. The Screw slot is `ss-2b` with metalness 1 and roughness ×1.3, so the heads blow out to a flat white.

**Model it:**
- Screw material: colour #8C9095, roughness 0.35–0.5.
- Keep the hex geometry; it already exists.
- Placement: only along `seamTheta` (on straights and on each gore), never in full rings.
- Outdoor variant: a rust-streak decal running about 30–80 mm down-slope from each screw.

### 7. Bands and seals are not readable
**Real:**
- Stainless bands (½" or ¾") are the clearest detail on a jacketed pipe: a smooth, brighter, slightly bluer strip with darker rounded edges.
- They sit on every circumferential lap, plus intermediates.
- **Wing seals line up in a single row** at one clock position along the run (≈4 o'clock in `06/alu-jacket-large-pipe-aligned-band-seals-bare-calsil-end-01.jpg`), each making a ≈25 mm bump.
- The band slightly dents stucco and smooth jacket alike (`02/stucco-alu-macro-band-texture-scale-01.jpg`, `02/stucco-alu-valve-box-pressed-elbows-rubber-supports-01.jpg`).

**Ours:** The bands blend into the jacket. Seals are tiny blips, and there is no pinch.

**Model it:**
- Band material: roughness 0.15–0.25 with anisotropy along the band, and colour #C9CDD2 (SS 2B), not ×1.15 white.
- Round the band profile edges (0.3 mm radius) so they catch light.
- Pin all `sealTheta` to one value per run, with ±3° jitter.
- Displace the jacket inward by 0.2–0.4 mm under each band (ties into gap 3).

### 8. Supports and hangers are wrong
**Real:**
- **Clevis hangers** with a galvanized **insulation shield** (an arc of about 180°, est. 300–600 mm long by pipe size) under the jacket: `04/mech-room-wip-stucco-tee-pvc-shield-at-clevis-01.jpg`, `01/white-pvc-jacket-mech-room-valve-oversize-clevis-01.jpg`.
- Band or strap hangers bearing directly on the jacket: `05/pvc-glossy-fitting-covers-matte-asj-straights-labels-hangers-01.jpg`.
- U-straps over the jacket onto unistrut: `04/stucco-alu-ammonia-lines…`, `07/elastomeric-outdoor-manifold-unistrut-clamps-valves-01.jpg`.
- On hot lines, **pipe shoes** with the jacket stopping 20–50 mm short and a visible gap: `08/alu-gored-elbow-screw-rows-scratched-jacket-at-pipe-shoe-01.jpg`.
- Rubber roof blocks: `02/stucco-alu-valve-box-pressed-elbows-rubber-supports-01.jpg`. Steel frames with saddle blocks: `05/white-pvc-large-chw-risers-steel-frame-saddles…`.

**Ours:** Floor T-posts with the jacket resting on a small saddle, and no shield, shoe or clamp. The fg-elbow render has one post and a floating riser.

**Model it:**
- Add a support library chosen by service:
  - cold work: clevis or trapeze with a shield and high-density insert;
  - hot work: a welded T-shoe on a beam, with the jacket notched;
  - rooftop: a pipe stand with a roller or rubber block.
- Place supports at real spans (est. 2.1–4.3 m by NPS, per MSS SP-58), plus one on every riser.

### 9. No terminations at flanges and valves
**Real:**
- The jacket stops short of flanges for bolt clearance (`06/stucco-alu-pipes-expansion-bellows-flanges-outdoor-01.jpg`).
- Ends are closed with a range of details:
  - cone caps sealed to the pipe (`02/stucco-alu-risers-cone-caps…`);
  - flat end caps with pressed star folds (`08/stucco-alu-end-cap-pressed-star-folds-01.png`);
  - pleated sunburst collars (`03/weathered-alu-gored-elbow-rusty-screws-crimped-cap-01.jpg`);
  - conical reducers (`03/ss-gored-elbow-screws-cone-termination-elastomeric-01.jpg`);
  - or simply left open with the insulation showing (`01/stucco-alu-mech-room-headers-tees-green-valves-01.jpg`).
- Valves get boxed covers with the stem outside (`01/alu-jacket-fire-pump-headers-pressed-elbows-valve-boxes-01.jpg`), oversized step-up jackets (`07/elastomeric-thick-tees-valve-boxes-unistrut-01.jpg`), or **grey removable blankets** (`12/alu-jacket-mech-room-removable-blankets-valves-01.jpg`, `01/alu-corrugated-vessel-snow-removable-blankets-01.jpg`).

**Ours:** The jacket and insulation simply stop, or there is a cutaway. There are no flanges, valves, caps or blankets.

**Model it:**
- Add swept or revolved termination parts:
  - cone cap: a revolved trapezoid;
  - flat cap: a disc with 4–8 radial crease normals baked in;
  - pleated collar: a revolved profile with a sinusoidal θ displacement.
- Add a parametric flange and valve with a boxed cover (an extruded rounded box).
- Removable blanket: matte grey silicone-glass cloth (#7F8386, roughness 0.85) with quilting seams and straps.

### 10. White jackets: PVC and ASJ look identical and are pushed to the tone-map shoulder
**Real:**
- PVC is glossy, with mirror-like streaks of the lights, and **neutral white** (B−R ≈ 0).
- ASJ is matte paper-like and **slightly warm** (B−R ≈ −5). It shows a 1½" self-seal lap line, 3" butt strips every 36", and faint scrim.
- Both keep a visible shading gradient across the cylinder (p50 147–226 depending on exposure).
- Old ASJ yellows and stains.
- Examples: `05/pvc-glossy-fitting-covers-matte-asj-straights-labels-hangers-01.jpg` (PVC next to ASJ), `05/white-pvc-jacket-large-bore-mitred-elbows-pump-hall-01.jpg`, `refs/jacket-asj/asj_fiberglass-pipe-covering_butt-joints_vertical-risers_commons-pd.jpg`

**Ours:** ASJ and PVC are both warm cream (B−R −9 to −10) at p50 233–240 and p95 244, so they look flat and paper-like with no shading. ASJ has no lap or butt strip; the joint is an open slot.

**Model it:**
- PVC: albedo #F0F0EB with the B−R kept at about 0, roughness 0.15–0.25, clearcoat 0.6.
- ASJ: albedo #ECE9E0, roughness 0.8, scrim normal at 0.3.
- Set exposure so a white jacket's lit-side median sits around 200–225.
- Add ASJ geometry: the SSL lap as a 0.3 mm step at about 4 o'clock, and butt-strip sweeps 75 mm wide at each 914 mm joint.

### 11. Camera: product-shot angle instead of a field-photo angle
**Real:**
- Field photos are taken at standing eye height (about 1.6 m) **looking up 15–40°** at overhead runs, or down a rack in strong one-point perspective.
- They use phone-wide lenses (24–28 mm equivalent, about 65–75° horizontal FOV), with close foreground pipes cropped by the frame.
- Examples: `05/pvc-glossy-fitting-covers…`, `07/elastomeric-overhead-pipes-blue-steel-frames-01.png`, `04/stucco-alu-ammonia-lines…`

**Ours:** An elevated 3/4 view looking down at a pipe at knee height, at about 40–50 mm equivalent, with the whole object centred in empty space.

**Model it:**
- Add camera presets: "mech-room look-up" (eye 1.6 m, target 3 m up, FOV 70°), "rack walk" (eye 1.6 m, looking along the run), and "close detail" (0.5–0.8 m, 35 mm).
- Mount the assembly overhead on hangers rather than on floor stands.

### 12. No identification: labels, flow arrows, colour bands, tags
**Real:**
- Pipe markers with service text and arrows appear every few metres and at turns: `04/white-pvc-pump-room-green-id-bands-arrows-01.jpg`, `08/ss-jacket-courtyard-risers-gored-elbows-labels-01.jpg`.
- Stencilled text: `05/pvc-glossy-fitting-covers…` (GLYS/GLYR), `04/dull-grey-jacket-pump-room-wrinkled-bends-stencils-01.webp`.
- Colour ID bands: `09/alu-jacket-pipe-rack-gored-bends-colour-bands-valve-boxes-01.jpg`, `04/white-pvc-chiller-plant-black-elastomeric-collars-color-bands-01.jpg`.
- Handwritten marker numbers: `03/alu-elbow-rolled-gore-laps-dummy-leg-marker-94-01.jpg`.
- Valve tags.

**Ours:** None.

**Model it:**
- Add a label sweep: a thin band profile at r_J + 0.1 mm, covering 120–360° and 50–200 mm long, with an albedo texture rendered in Python using ASME A13.1 colour pairs (e.g. green/white for water) and an arrow.
- Place one per 6–10 m of run, plus one next to each valve.

### 13. Outdoor weathering
**Real:**
- Exposed aluminum goes **chalky and matte**. The highlights soften, the colour drops to a flat light grey, and blotchy white oxidation appears.
- Other signs: water spots, drip streaks from laps, rust bleed from screws and steel, grime on the lower half, dust, leaves and snow on top, and torn wraps.
- Examples: `09/chalky-alu-jacket-outdoor-pipe-rack-rusty-steel-01.jpg`, `11/alu-jacket-tank-flat-head-radial-gores-weathered-01.jpg`, `03/weathered-alu-gored-elbow-rusty-screws-crimped-cap-01.jpg`, `09/weathered-jacket-torn-wrap-discoloured-outdoor-rack-01.jpg`

**Ours:** Every surface is factory-new.

**Model it:**
- Add a `weather` parameter, 0–1.
- In `gen_textures.py`, bake a `alu-smooth-weathered` set: roughness 0.45–0.7, oxide blotches with albedo +5% at roughness 0.8, and vertical drip streaks.
- Apply geometry-aware grime through vertex colour (darken where n·up < −0.3), plus rust decals below screws.

### 14. Stucco reads as pixel noise
**Real:** At normal viewing distance, stucco embossing averages into a soft satin sheen with sparse glints (1 px autocorrelation 0.92 in `04/stucco-alu-ammonia-lines…`). The individual pebbles (pitch ≈ 0.27 × band width ≈ 3.4 mm) are only visible up close (`02/stucco-alu-macro-band-texture-scale-01.jpg`).

**Ours:** Salt-and-pepper sparkle (1 px autocorrelation 0.71) in `photo-cg-plant.jpg`, a high-contrast speckle that looks like noise.

**Model it:**
- Keep the 3.4 mm pitch.
- In Python, write mip-aware roughness: for each mip level, add the normal variance lost by downsampling to roughness (Toksvig).
- Lower normalStrength to about 0.6 and roughness contrast to about 0.05.
- Make sure the path tracer samples enough before denoising.

### 15. Lighting colour and mood per site type
**Real:**
- Mech rooms under fluorescent or LED light are near-neutral, sometimes slightly green.
- Basements are dim, with flash fall-off: `05/pvc-glossy-fitting-covers…`.
- Pump rooms can be dark and moody: `04/dull-grey-jacket-pump-room…`.
- Outdoors runs from overcast neutral (`12/alu-jacket-rooftop-pipe-stands-overcast-01.webp`) to warm low sun (`03/smooth-alu-rooftop-gored-bends-sunset-reflections-01.jpg`).

**Ours:** Studio grey or blue fog.

**Model it:** Pair each HDRI preset from gap 1 with a measured white balance, and add a low-key "basement" preset (exposure −1 EV with a single key light).

### 16. Photographic response
**Real:**
- Specular streaks on jacketing clip to white (p95 245–253).
- Phone photos show shadow noise, mild vignetting, slight lens distortion and some sharpening.

**Ours:** NeutralToneMapping caps highlights near 244 and the image is noise-free; it looks rendered.

**Model it:**
- Offer an optional "field photo" post-process: an AgX or filmic curve with a white point that lets speculars clip, 0.5–1% luma grain in the shadows, a light vignette (−0.3 EV in the corners), and a mild unsharp mask.

### 17. Scale cues
**Real:** Every field photo includes something of known size: handwheels (150–400 mm), ladders, 41 mm unistrut, 200 × 400 mm CMU, 1.2 m light fixtures, grating, people (`06/alu-jacket-install-in-progress-refinery-walkway-01.jpg`).

**Ours:** Only the stand.

**Model it:** The context kit from gap 2 supplies most of these. Add one valve handwheel and one unistrut trapeze to every preset.

### 18. Later scope: ductwork and vessels
- **FSK duct wrap** is never flat:
  - lumpy pillows;
  - star-shaped puckers at each pin, about 300–450 mm on centre;
  - a sagging belly between trapezes;
  - taped seams;
  - printed facing.
  - Examples: `10/fsk-duct-wrap-pins-speed-washers-pucker-01.jpg`, `10/foil-duct-wrap-plant-room-risers-lumpy-01.jpg`, `10/fire-barrier-duct-wrap-printed-foil-pin-puckers-trapeze-01.jpg`
- **Vessel heads** use 14–48 radial gores, each with a screw or rivet row, meeting a riveted centre cap. Shell panels have circumferential and longitudinal laps.
  - Examples: `11/alu-jacket-vessel-dished-heads-radial-gores-riveted-cap-01.jpg`, `11/stucco-alu-vessel-head-gores-screws-outdoor-01.jpg`

---

## Quick reference: what screams "real"
1. Reflections of an actual room or sky, including neighbouring pipes.
2. Wobbly reflections from imperfect sheet.
3. Sheet-to-sheet tone steps.
4. Crisp stainless bands with aligned seals.
5. Gore laps that read as beads with screws along one seam line.
6. Real hangers, shields and shoes.
7. Jacket ends, caps and valve treatments.
8. Labels with arrows.
9. Eye-level, upward-looking wide shots.
10. A little dirt.
