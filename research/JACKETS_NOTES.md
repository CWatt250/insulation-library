# Jackets, facings and vapor retarders: verified numbers

Full data, verbatim quotes and source URLs are in `jackets-verified.json`. Source ids (J1–J39) refer to that file's `sources` array. Accessed 2026-10-10.

Temperature limits are for the jacket or coated surface, not the pipe, unless noted.

## 1. PVC jacketing and fitting covers
- **JM Zeston 2000 / 300 / Zeston jacketing**
  - Max PVC temperature is 150°F. Use enough insulation to keep the covers below 150°F, and keep them away from direct or radiant heat (J1, J2, J3, J4).
  - Use two or more Hi-Lo Temp insert layers when the fitting runs above 250°F or below 45°F, or when the insulation is thicker than 1½ in (J1). JM's general rule is one insert per inch of insulation (J1).
  - Rolls come in 10/15/20/30 mil. Cut & Curled comes in 20/30 mil, and 30 mil is recommended outdoors (J2).
  - Outdoor use is white only; colors are indoor only (J1, J2, J3).
  - ASTM E84 rating is 25/50. JM lists "ASTM D1784" with no cell class (J1–J3).
  - Fastening:
    - Hot work: 2 stainless serrated tacks. JM says tacks are only for systems where no vapor retarder is required (J4, J5).
    - Cold work: vapor-retarder mastic, then Z-Tape with a 2 in overlap on the downward side (J4).
    - USDA systems: Perma-Weld solvent weld, on 20 or 30 mil jacketing only (J1, J5).
- **Proto LoSmoke**
  - Exposed PVC surface range is −20°F to 150°F. Inserts are rated −20°F to 1000°F (J6).
  - Heat deflection temperature is 157°F at 264 psi (J6).
  - Use two or more insert layers above 250°F or when the insulation is thicker than 1 in (J6).
  - Jacketing comes in 10–40 mil.
  - Outdoors (white only), use at least 0.030 in, or 0.040 in over 15 in O.D. Lap 2 in on the downside, caulk all joints, and put an 8 in slip joint at least every 25 ft (J6).
  - E96 permeance: ≤0.058 perm at 0.015 in, ≤0.047 at 0.020 in, ≤0.027 at 0.030 in (J6).
  - Below 45°F, use an intermediate vapor retarder of ≤0.02 perm: ASJ, FSK or 2 mil foil (J8).
- **ASTM C1917-23** covers PVC jacketing only in "non-direct sunlight exposure". It excludes fitting covers (J10).

## 2. Aluminum jacketing
- ASTM C1729-26 covers aluminum jacketing above or below ambient, indoors and outdoors. It classifies by surface and emittance, alloy and temper per B209, and moisture retarder. The public page gives no temperature limit (J12, J13).
- **JM**
  - Alloys are 3105 or 3003, which JM treats as interchangeable (J15). Standard temper is H14; heavy duty is H12 at ≥0.032 in; Ell-Jacs elbows are 1100 alloy at 0.024 in (J20).
  - Common gauges: 0.016, 0.020, 0.024, 0.032 and 0.040 in (J19).
  - Minimum thickness depends on insulation O.D. and on whether the insulation is rigid (≥15 psi). It runs from 0.016 in (≤8 in O.D.) to 0.024 in rigid / 0.040 in non-rigid (>36 in O.D.) (J15, J20).
- **Moisture barrier (PFMB)**
  - Standard liner: 3 mil, three-layer polyethylene/Surlyn film, light blue. JM calls it both PFMB and "polysurlyn". It replaced 1–3 mil polykraft (J15, J17).
  - Liner limits: 180°F long-term and 200°F intermittent. It starts to decompose at 410°F (J17).
  - JM says insulation systems are generally designed to keep jacket temperature from exceeding 140°F (J19).
- **Metal jacketing is not a vapor retarder** (J20).
- **Attachment** (current guide, 04/23/24):
  - Bands at 12 in o.c. max.
  - Screws on hot work only: 8 in o.c. on straight seams, 3 in o.c. on elbows.
  - Cold work: bands only (J20).
- **Corrosion**
  - PFMB helps prevent galvanic corrosion. JM calls it essential where the jacket touches wire mesh or tie wire (J17, J19).
  - Wet ASJ can corrode aluminum jacketing within 1–5 years (J21).

## 3. Stainless steel jacketing
- ASTM C1767-26 covers stainless jacketing for thermal, acoustical and fire-protective insulation. Class E material has no moisture barrier (J14).
- **JM**
  - Alloys are T-304 and T-316, soft-annealed, to ASTM A240. Use T-316 in the most corrosive areas (J22).
  - Standard gauges are 0.010 and 0.016 in; 0.020 and 0.024 in are also available. Minimum is 0.010 in up to 24 in O.D., 0.016 in for 24–36 in, and 0.020 in over 36 in (J20, J22).
  - Comes with a 3 mil polyfilm liner, or without it on request (J22, J23).
  - JM specifies stainless when "superior flame or corrosion resistance is required". It gives a melt point of about 2500°F (J20, J22).

## 4. ASJ: ASTM C1136-23
- C1136 covers flexible vapor retarders with ≤0.15 perm and an E84 rating of ≤25/50, for surface temperatures of −20°F to 150°F. It excludes mastics and weather barriers (J24).
- The public abstract lists Types I–VI only (J24).
- Example: Lamtec WMP-ASJ, a paperless ASJ, is ≤0.01 perm (E96 Procedure A) and claims C1136 Types I–VI and X (J26).
- OC and JM factory ASJ values are already in `materials-verified.json`.

## 5. FSK
- Lamtec R-3035 meets C1136 Types II, IV and VI, at ≤0.02 perm (E96 Procedure A) (J25).
- It passed 4 h at −20°F and 4 h at 240°F with no delamination. These are test conditions, not a service rating (J25).
- E84 rating: foil side 5/0, kraft side 25/10 (J25).

## 6. Films, tapes and membranes
- **JM Saranex CX (PVDC)**, all white, all rated −40°F to 250°F (J27–J30):

  | Product | Thickness | Permeance (E96) | E84 |
  |---|---|---|---|
  | 540 CX film | 4 mil | 0.02 perm | 10/20 |
  | 560 CX film | 6 mil | 0.01 perm | 25/50 |
  | 520 CX tape | 2 mil | 0.03 perm | 0/5 |
  | 560 CX tape | 6 mil | 0.01 perm | 0/5 |

  - Required permeance is ≤0.02 perm at or below 32°F and ≤0.03 perm above 32°F (J31).
  - Not to be used as an outdoor outer jacket. It can be left exposed for 2 weeks at most (J31).
- **Polyguard Insulrap 30-NG**
  - 30 mil, white, 0.00 perm (E96-00 Procedure A) (J33).
  - Max service temperature 160°F (lab). The same sheet says insulation surface should stay ≤150°F in operation (J33).
  - Goes under PVC or metal jacketing, with no more than 30 days of UV exposure (J33, J34).
- **OC PITTWRAP IW50 AL**: 50 mil, silver, 0.0009 perm, −4°F to 167°F. Goes under a metal or UV-resistant jacket, above ground only, not for indoor use (J35).
- **OC PITTWRAP B100**: 47.3 mil, silver, 0.0005 perm, −58°F to 284°F. Needs a protective jacket for UV and must not be used below ground (J36).
- **OC PITTCOTE 300E**
  - Black coating, rated −40°F to 200°F (J37).
  - Its sheet gives permeability as 0.13 perm-in; there is no perms value (J37).
  - Standard application is 65 mil cured (J37).
  - Must have a metal jacket or other UV protection above ground (J37).

## 7. Vapor-retarder mastic: Foster 30-65 (H.B. Fuller)
- White, rated −20°F to 180°F at the coated surface. Designed for systems operating from 32°F to ambient (J38).
- Permeance is 0.08 perm at 45 mil dry film (F1249) and 0.08 perm at 44 mil (E96 Procedure A), tested with mesh (J38).
- Minimum dry film is 31 mil, applied as tack coat, then MAST-A-FAB, then finish coat. E84 rating is 5/30 (J38).

## Unverified and conflicts
- **Unverified**
  - Proto EXOD CPVC, Ceel-Co 300 and RPR Products: no primary document found (the RPR sites didn't resolve).
  - Wall thickness of PVC fitting covers in mil: no maker publishes it. `NOTES.md`'s "20 mil" fitting covers are not supported by these sources.
  - ASTM D1784 cell class.
  - JM Zeston minimum temperature.
  - Zeston jacket permeance.
  - Max service temperature of the aluminum or stainless jacket itself (only liner limits and a melt point exist).
  - Polykraft temperature limit.
  - C1136 per-type perms and the meaning of "Type X".
  - Service ratings for FSK and WMP-ASJ (test conditions only).
  - Polyguard minimum temperature.
  - PITTCOTE 300E permeance in perms.
  - Childers CP-34/CP-30.
  - Any Foster 30-65 revision newer than R1119 (the hbfullerproducts.com site blocks automated access).
- **Conflicts**
  - JM's install guide changed between editions: 11/27/23 says 9 in band and 6 in screw spacing, while 04/23/24 says 12 in and 8 in. `research/NOTES.md` still uses 9 in and 6 in.
  - The insert-layer trigger is insulation thicker than 1½ in for JM (JM's catalog says 1½ in or greater) and thicker than 1 in for Proto.
  - E84 for aluminum with PFMB is 0/5 on the aluminum data sheets but 0/54 on the PFMB data sheet. PFMB WVTR is 0.0544 on the data sheet but 0.048 in the brochure.
  - Polyguard gives 160°F as its lab max and 150°F as its operating limit.
  - Foster 30-65 E96 permeance is 0.08 perm at 44 mil in R1119 but 0.03 perm at 45 mil in the older R0512.
  - JM's stainless sheet date is printed as "09/26/15", which is probably a typo for 2025.
  - Distributor web listings show "−35 to 500°F" for Zeston and Proto. Those pages weren't fetched, aren't primary sources, conflict with the makers' 150°F, and are not used.
