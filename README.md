# Insulation Library

Interactive, photoreal 3D library of mechanical insulation: pipe insulation materials, jacketing, fittings and removable blankets, with specs taken from manufacturer data sheets.

## What it does

- **Materials:** calcium silicate, fiberglass, mineral wool, cellular glass, elastomeric and phenolic, each built to field practice. That covers half-shells or hinged sections, section lengths, joint staggering, and double layers above 3" (2½" for phenolic).
- **Layer-by-layer build-up:** pipe → insulation → facing → vapor retarder → jacket, each one selectable (click it in the list or on the model), hideable, or "peeled to" so you see what is underneath.
  - Hot or cold service decides the vapor retarder: the ASJ facing on fibrous systems, the closed-cell foam itself on elastomerics, or a separate sealed membrane (cellular glass; phenolic under metal).
  - No screws through a vapor retarder on cold work.
- **Facing and jacketing:** factory ASJ facing, plus smooth or stucco aluminum, stainless and PVC outer jackets.
  - Real laps, bands with wing seals, and screws on hot work.
  - Jacket gauge set from the JM Metal Jacketing Install Guide.
- **Components:**
  - Straight run.
  - 90° elbow: pressed covers with throat pleats through 12" NPS, gored covers above, and PVC fitting covers.
  - Flanged gate valve with a removable blanket.
- **Views:** Installed, Cutaway, Layers (a telescoping step-down with spec-driven callouts), Exploded (each layer's top half lifts off) and Section (every layer cut square, labelled ring by ring).
- **Settings:** studio, outdoor plant, and mechanical room.
- **Photo mode:** progressive path tracing ([three-gpu-pathtracer](https://github.com/gkjohnson/three-gpu-pathtracer)) with denoising and depth of field.
- **Spec data card:** service temperature, k-factor at a stated mean temperature, density, ASTM standards, moisture and vapor behaviour, application tags, and jacket compatibility and temperature limits. It follows the current selection. Every value comes from `research/materials-verified.json` or `research/jackets-verified.json`, with a link to its source.

## Simulator (Phase 1)

Three simulation modes sit beside the library (**Explore**), switched from the bar at the top:

- **Hot Pipe:** heat loss bare vs insulated, % reduction, outer surface temperature, annual energy, and personnel protection. The safe-touch limit is 140°F, which NIA cites as "standard industry practice".
- **Cold Pipe:** heat gain, dew point, margin to condensation, and a Dry / At risk / Sweating status.
- **Condensate:** sweating and dripping control. Status is Dry / Borderline / Sweating / Dripping risk, with the estimated condensate in fl oz per day per 10 ft, and one tap auto-sizes the insulation.

**Each mode includes:**
- Presets.
- Live sliders.
- Compare: 2–3 synced panels showing bare / current / recommended or any thickness.
- Thickness solvers.
- A thermal false-colour view with the dew-point isotherm drawn inside the insulation.
- Plain-English explanations, a Learn section, and an assumptions and sources footer on every result.

**3D effects follow the calculation:**
- Soft orange heat waves rise off hot surfaces.
- Blue airflow arrows carry heat into cold ones.
- Condensate beads form, run down and drip only while the computed surface is below the dew point.
- All of these thin out as heat flux drops.

Straight pipe only in Phase 1. The roadmap:
- **Phase 2:** fittings, more materials, and deeper vapor-retarder logic.
- **Phase 3:** cost savings, reports, saved scenarios, and presentation mode.

**Engine** (`app/src/sim/`): steady-state ASTM C680 approach.
- Conduction uses temperature-dependent k, integrated through the layer, from the manufacturer's published k-vs-mean points.
- The outer surface coefficient is the C680 form:
  - Churchill–Chu natural convection.
  - Churchill–Bernstein forced convection.
  - The C680 horizontal-pipe blend (j = 4, D = 0.3).
  - C680 air properties at the film temperature.
  - Radiation to ambient.
- Insulation OD comes from ASTM C585 where it is on file.
- The dew point uses Magnus (Alduchov & Eskridge).
- The condensation rate uses the Chilton–Colburn/Lewis analogy (Le = 0.847).
- Condensation control uses the 3E Plus / NIA 0.75°F margin.

**Checked by `npm test`** (`app/src/sim/validation.test.ts`):
- Bare pipe matches ASHRAE Fundamentals Table 17 within 0.7% median (2.1% max over 100 cells).
- NIA's calculators match within 0.4%.
- The 3E Plus sample printout matches within 1.1%.
- Owens Corning's 3E Plus condensation table is reproduced within ½" in 39/39 cells (31 exact).
- JM Micro-Lok HP tables are reported but not matched: they come from an unstated 3E Plus version and imply a k-curve above Micro-Lok's published values.

**Sources:**
- Every emittance, limit, preset range and method reference traces to `research/calc-method-verified.json` (M-ids), `research/emittance-verified.json` (E-ids), `research/validation-cases.json` (V-ids) or `research/jackets-verified.json` (J-ids).
- `app/src/sim/data.test.ts` fails if one doesn't.
- It is an educational / preliminary design tool, labelled as such in the app.

## Layout

| Path | What |
|---|---|
| `app/` | Vite + React + React Three Fiber app |
| `app/src/geo/` | Parametric geometry: `sweep.ts` (swept profiles) and `assembly.ts` (runs, elbows, valve, blanket) |
| `app/src/materials/` | PBR material factory and material slots |
| `app/src/data/` | Pipe sizes, material catalog, verified specs |
| `app/src/scene/` | Viewer, photo mode, mech room, callouts, simulation effects (`effects.tsx`) and thermal view (`thermal.ts`) |
| `app/src/sim/` | Calculation engine, model/solvers, presets, emittance, sources, learn copy, tests |
| `app/src/ui/sim/` | Simulator panels: setup, results, stage/compare, assumptions |
| `tools/gen_textures.py` | Generates every procedural PBR texture into `app/public/tex/` |
| `tools/shot.mjs`, `tools/matrix.mjs` | Headless screenshots and a smoke test of every combination |
| `tools/sim_shots.mjs` | Screenshots of each simulator mode (insulated, bare, thermal, compare); pass `390x844` for phone |
| `tools/bing_images.mjs` | Finds reference photos |
| `research/` | Construction notes, verified spec data, realism gap analysis, photo source records |

## Develop

```bash
cd app && npm install && npm run dev -- --port 5179
# textures (Python 3 + numpy, scipy, pillow):
python3 -m venv tools/.venv && tools/.venv/bin/pip install numpy scipy pillow
tools/.venv/bin/python tools/gen_textures.py            # all
tools/.venv/bin/python tools/gen_textures.py aluminum   # one group
```

`npm run build` produces a static site in `app/dist/`; `npm test` runs the engine and validation tests. Deep links: `?mode=hot|cold|condensate`, `&units=si`.

## Credits

HDRIs and the concrete floor texture are CC0 from Poly Haven; see `CREDITS.md`. All other textures are generated by `tools/gen_textures.py`. The reference photos under `research/refs/` are not committed because most are copyrighted; their sources are listed in each folder's `SOURCES.md`.
