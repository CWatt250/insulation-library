import { DUCT_WRAP, ELASTOMERIC_SHEET, TABLE_6_8_2, type DuctLocation, type DuctService } from '../data/ductData'
import { kCurve, kMean, solveIntegral, type KCurve } from './conductivity'
import { solveCase, LEWIS, type CaseInput, type CaseResult, type Moisture } from './engine'
import { flatCoeffs, surfaceCoeffs, type FlatFace } from './surface'
import { dewPointF, pSat, vaporDensity } from './psychro'
import { fToC, fToK, IN_M, kToF, wPerMToBtuHrFt } from './units'
import type { SurfaceRef } from './emittance'
import type { KPoint, ProductSpec } from '../data/specs'
import type { SimMode, SimState } from './types'

/**
 * Ductwork: a horizontal sheet-metal duct, bare or wrapped.
 *
 * Rectangular ducts are solved face by face. Each face is a flat slab of
 * insulation (temperature-dependent k) with its own outside coefficient: the
 * sides as vertical surfaces (L = face height), the top and underside as
 * horizontal surfaces (L = area ÷ perimeter → half the face width on a long
 * run), with the stable/unstable correlations swapped between hot and cold
 * ducts (research/duct-verified.json). Heat per foot is each face's flux times
 * its outside width; corners are not modelled. No published source splits a
 * duct by face — published methods apply one average flux to the perimeter —
 * so the face split is this simulator's construction from the C680 geometries.
 *
 * Round ducts use the pipe engine (horizontal cylinder) with the duct as the pipe.
 *
 * Like 3E Plus, the duct wall is taken at the air temperature unless the inside
 * air film is switched on (ASHRAE Fundamentals Ch. 4 Table 8 simplified
 * equation for air, T8.17a: h = (0.3323 − 2.384e-4·t)·V^0.8 / D^0.2, U9).
 */

export type DuctShape = 'rect' | 'round'
export type DuctType = 'supply' | 'return' | 'outdoor' | 'exhaust'

export const DUCT_TYPES: { id: DuctType; label: string; short: string }[] = [
  { id: 'supply', label: 'Supply air', short: 'Supply' },
  { id: 'return', label: 'Return air', short: 'Return' },
  { id: 'outdoor', label: 'Outside air', short: 'Outside air' },
  { id: 'exhaust', label: 'Exhaust', short: 'Exhaust' },
]

/**
 * Ductwork isn't "hot" or "cold" — it is a duct type in a location. The physics
 * still needs to know which way heat flows: air warmer than its surroundings
 * loses heat; air colder gains heat and can make the outside sweat.
 */
export const ductBehavior = (s: { processF: number; ambientF: number }): 'hot' | 'cold' => (s.processF >= s.ambientF ? 'hot' : 'cold')
export type DuctInsulation = 'wrap75' | 'wrap100' | 'wrap150' | 'elastomeric'
export type DuctFinish = 'new' | 'dull'

export const DUCT_INSULATIONS: { id: DuctInsulation; label: string; short: string }[] = [
  { id: 'wrap75', label: 'Duct wrap, 0.75 pcf', short: 'Duct wrap' },
  { id: 'wrap100', label: 'Duct wrap, 1 pcf', short: 'Duct wrap 1 pcf' },
  { id: 'wrap150', label: 'Duct wrap, 1.5 pcf', short: 'Duct wrap 1.5 pcf' },
  { id: 'elastomeric', label: 'Elastomeric sheet', short: 'Elastomeric sheet' },
]

const wrapType = (id: DuctInsulation) => DUCT_WRAP.types[id === 'wrap100' ? '100' : id === 'wrap150' ? '150' : '75']

/** Nominal thicknesses offered for a duct insulation, inches. */
export function ductThicknesses(id: DuctInsulation): number[] {
  return id === 'elastomeric' ? ELASTOMERIC_SHEET.thicknessesIn : wrapType(id).thicknesses.map((t) => t.nominalIn)
}

/** Installed thickness: duct wrap is rated at 25 % compression (75 % of nominal) [U28; IMC 604.7]. */
export function installedIn(id: DuctInsulation, nominalIn: number) {
  return id === 'elastomeric' ? nominalIn : nominalIn * DUCT_WRAP.installedFraction
}

/**
 * Installed k vs mean temperature. Duct wrap: Knauf's out-of-package curve
 * (ASTM C177, 50–200°F) scaled by the installed ÷ out-of-package ratio printed
 * at 75°F — this app's assumption, which reproduces the printed installed R at
 * 75°F. Elastomeric sheet: as published (75 and 100°F).
 */
export function ductKPoints(id: DuctInsulation): KPoint[] {
  if (id === 'elastomeric') return ELASTOMERIC_SHEET.k
  const w = wrapType(id)
  const k75 = w.kOop.find((p) => p.meanF === 75)!.k
  return w.kOop.map((p) => ({ meanF: p.meanF, k: Math.round((p.k * w.kInstalled75) / k75 * 10000) / 10000 }))
}

/** The rating codes check: installed R as printed at 75°F mean. */
export function ratedR(id: DuctInsulation, nominalIn: number): number {
  if (id === 'elastomeric') return ELASTOMERIC_SHEET.R[nominalIn] ?? nominalIn / ELASTOMERIC_SHEET.k[0].k
  const row = wrapType(id).thicknesses.find((t) => Math.abs(t.nominalIn - nominalIn) < 1e-6)
  return row ? row.installedR : (nominalIn * DUCT_WRAP.installedFraction) / wrapType(id).kInstalled75
}

export function ductProduct(id: DuctInsulation): ProductSpec {
  if (id === 'elastomeric') {
    return { name: ELASTOMERIC_SHEET.product, tempF: { min: null, max: ELASTOMERIC_SHEET.ductMaxF, note: `${ELASTOMERIC_SHEET.maxF}°F material; ${ELASTOMERIC_SHEET.ductMaxF}°F on ducts with full adhesive` }, k: ELASTOMERIC_SHEET.k, sources: ELASTOMERIC_SHEET.src }
  }
  const w = wrapType(id)
  return { name: `${DUCT_WRAP.product}, ${w.label}`, tempF: { min: null, max: DUCT_WRAP.maxF }, k: ductKPoints(id), kNote: 'installed (25 % compressed)', density: `${w.densityPcf} pcf`, sources: DUCT_WRAP.src }
}

/** Outer-surface emittance on ducts. */
export const DUCT_SURFACES: Record<string, SurfaceRef> = {
  // ASHRAE: "The first chart (for emittance = 0.1) should be used for foil-faced insulation products"
  fsk: { key: 'fsk', label: 'FSK facing (foil)', value: 0.1, src: ['U10'], note: 'ASHRAE uses ε = 0.1 for foil-faced duct insulation; new FSK lists 0.05 (Lamtec, J25)', maxSurfaceF: 150, limitSrc: ['J24'] },
  elastomeric: { key: 'elastomeric', label: 'Elastomeric sheet skin', value: 0.9, src: ['E2'], note: 'ASHRAE "elastomeric or polyisobutylene"' },
  'galv-new': { key: 'galv-new', label: 'Bare galvanized duct (new, bright)', value: 0.1, src: ['E1'], note: '3E Plus "Galvanized steel, new, bright"' },
  'galv-dull': { key: 'galv-dull', label: 'Bare galvanized duct (dipped or dull)', value: 0.28, src: ['E1'], note: '3E Plus "Galvanized steel, dipped or dull"' },
}

export function ductSurface(s: SimState, insulated: boolean): SurfaceRef {
  if (!insulated) return DUCT_SURFACES[s.ductFinish === 'dull' ? 'galv-dull' : 'galv-new']
  return s.ductIns === 'elastomeric' ? DUCT_SURFACES.elastomeric : DUCT_SURFACES.fsk
}

/** Inside air film, W/(m²·K): ASHRAE T8.17a for air in ducts (Re > 10,000), D = hydraulic diameter. */
export function insideFilm(airF: number, fpm: number, dhIn: number) {
  const vFtS = fpm / 60
  const hIp = ((0.3323 - 2.384e-4 * airF) * vFtS ** 0.8) / (dhIn / 12) ** 0.2
  return hIp * 5.678263
}

export const hydraulicDiameterIn = (s: SimState) => (s.ductShape === 'round' ? s.ductD : (2 * s.ductW * s.ductH) / (s.ductW + s.ductH))

// ------------------------------------------------------------- the solve

export interface DuctFaceResult {
  face: 'top' | 'side' | 'bottom' | 'round'
  /** Outside width of this face (both sides for 'side'), m. */
  widthM: number
  surfaceF: number
  /** Heat flux, W/m² (positive = heat leaves the duct). */
  qWm2: number
  hConv: number
  hRad: number
  /** Inside face of the insulation (duct wall), °F. */
  wallF: number
  moisture: Moisture
}

interface FaceCase { face: FlatFace; L: number; t: number; k: KCurve | null; Ti: number; Ta: number; eps: number; wind: number; hi: number }

/** One flat face: surface temperature by bisection so the flux through the layer equals the flux leaving the surface. */
function solveFace(c: FaceCase) {
  const flux = (ts: number) => flatCoeffs(ts, c.Ta, c.face, c.L, c.eps, c.wind).h * (ts - c.Ta)
  // the fluid temperature implied by a guessed surface temperature
  const implied = (ts: number) => {
    const q = flux(ts)
    const wall = c.k ? solveIntegral(c.k, ts, -q * c.t) : ts
    return wall + (c.hi > 0 ? q / c.hi : 0)
  }
  let Ts = c.Ti
  if (c.k || c.hi > 0) {
    let lo = Math.min(c.Ti, c.Ta)
    let hi = Math.max(c.Ti, c.Ta)
    const rLo0 = implied(lo) - c.Ti
    let rLo = rLo0
    for (let i = 0; i < 70 && hi - lo > 1e-6; i++) {
      const mid = (lo + hi) / 2
      const r = implied(mid) - c.Ti
      if (Math.sign(r) === Math.sign(rLo)) {
        lo = mid
        rLo = r
      } else hi = mid
    }
    Ts = (lo + hi) / 2
  }
  const h = flatCoeffs(Ts, c.Ta, c.face, c.L, c.eps, c.wind)
  const q = h.h * (Ts - c.Ta)
  const wall = c.k ? solveIntegral(c.k, Ts, -q * c.t) : Ts
  return { Ts, q, h, wall }
}

/** Condensation on one face, from the heat/mass-transfer analogy (as the pipe engine). */
function faceMoisture(Ts: number, Ta: number, hConv: number, film: { rho: number; cp: number }, ambientF: number, rh: number, widthM: number): Moisture {
  const dewF = dewPointF(ambientF, rh)
  const sF = kToF(Ts)
  const marginF = sF - dewF
  const condensing = marginF < 0
  let rate = 0
  if (condensing) {
    const hm = hConv / (film.rho * film.cp * LEWIS ** (2 / 3))
    const rhoInf = vaporDensity((rh / 100) * pSat(fToC(ambientF)), Ta)
    const rhoS = vaporDensity(pSat(fToC(sF)), Ts)
    rate = Math.max(0, hm * (rhoInf - rhoS)) * 1000 * 3600
  }
  const gPerDay = rate * widthM * 0.3048 * 24
  return { dewF, marginF, condensing, frost: condensing && sF < 32, rateGm2h: rate, ozPerDayPerFt: gPerDay / 29.5735 }
}

export interface DuctSolve {
  input: CaseInput
  result: CaseResult
  moisture: Moisture
  faces: DuctFaceResult[]
}

/**
 * Solve the duct at a nominal insulation thickness (null = bare). The returned
 * CaseInput/CaseResult mirror the pipe engine's so the rest of the app can
 * treat a duct like a pipe: q per foot, the governing face's surface, and a
 * profile through that face.
 */
export function solveDuct(s: SimState, mode: SimMode, nominalIn: number | null): DuctSolve {
  const Ti = fToK(s.processF)
  const Ta = fToK(s.ambientF)
  const insulated = nominalIn !== null && nominalIn > 0
  const tIn = insulated ? installedIn(s.ductIns, nominalIn!) : 0
  const t = tIn * IN_M
  const k = insulated ? kCurve(ductKPoints(s.ductIns)) : null
  const surf = ductSurface(s, insulated)
  const eps = s.emittanceOverride ?? surf.value
  const hi = s.insideFilm ? insideFilm(s.processF, s.airFpm, hydraulicDiameterIn(s)) : 0
  const cold = (mode === 'duct' ? ductBehavior(s) : mode) !== 'hot'

  if (s.ductShape === 'round') {
    const input: CaseInput = {
      pipeOd: s.ductD * IN_M, processF: s.processF, ambientF: s.ambientF, windMph: s.windMph,
      layers: k ? [{ k, rIn: (s.ductD * IN_M) / 2, rOut: (s.ductD * IN_M) / 2 + t }] : [],
      emittance: eps, insideH: hi || undefined,
    }
    const result = solveCase(input)
    const D = result.outerD
    const h = surfaceCoeffs(fToK(result.surfaceF), Ta, D, eps, s.windMph)
    const m = faceMoisture(fToK(result.surfaceF), Ta, h.hConv, h.film, s.ambientF, s.rh, Math.PI * D)
    const face: DuctFaceResult = { face: 'round', widthM: Math.PI * D, surfaceF: result.surfaceF, qWm2: result.qWm / (Math.PI * D), hConv: result.hConv, hRad: result.hRad, wallF: result.boundariesF[0], moisture: m }
    return { input, result: { ...result, faces: [face] }, moisture: m, faces: [face] }
  }

  const W = (s.ductW * IN_M) + 2 * t
  const H = (s.ductH * IN_M) + 2 * t
  const base = { t, k, Ti, Ta, eps, wind: s.windMph, hi }
  const top = solveFace({ ...base, face: 'top', L: W / 2 })
  const bottom = solveFace({ ...base, face: 'bottom', L: W / 2 })
  const side = solveFace({ ...base, face: 'vertical', L: H })
  const mk = (face: DuctFaceResult['face'], r: ReturnType<typeof solveFace>, widthM: number): DuctFaceResult => ({
    face, widthM, surfaceF: kToF(r.Ts), qWm2: r.q, hConv: r.h.hConv, hRad: r.h.hRad, wallF: kToF(r.wall),
    moisture: faceMoisture(r.Ts, Ta, r.h.hConv, r.h.film, s.ambientF, s.rh, widthM),
  })
  const faces = [mk('top', top, W), mk('side', side, 2 * H), mk('bottom', bottom, W)]
  const qWm = faces.reduce((a, f) => a + f.qWm2 * f.widthM, 0)
  // governing face: the coldest surface on cold work (closest to the dew point), the hottest on hot work
  const gov = faces.reduce((g, f) => ((cold ? f.surfaceF < g.surfaceF : f.surfaceF > g.surfaceF) ? f : g))
  const govR = gov.face === 'top' ? top : gov.face === 'bottom' ? bottom : side
  const perimeter = 2 * (W + H)
  // a radial stand-in for the governing face so the cylinder-shaped helpers still read it
  const rIn = (perimeter / Math.PI) / 2 - t
  const profile: { r: number; tF: number }[] = [{ r: rIn, tF: kToF(govR.wall) }]
  if (k) {
    for (let i = 1; i <= 10; i++) profile.push({ r: rIn + (t * i) / 10, tF: kToF(solveIntegral(k, govR.wall, (govR.q * t * i) / 10)) })
  }
  const condensingFaces = faces.filter((f) => f.moisture.condensing)
  const moisture: Moisture = {
    ...gov.moisture,
    // water from every face that sweats, per foot of duct
    ozPerDayPerFt: condensingFaces.reduce((a, f) => a + f.moisture.ozPerDayPerFt, 0),
    rateGm2h: gov.moisture.rateGm2h,
  }
  const input: CaseInput = {
    pipeOd: 2 * rIn, processF: s.processF, ambientF: s.ambientF, windMph: s.windMph,
    layers: k ? [{ k, rIn, rOut: rIn + t }] : [], emittance: eps,
  }
  const result: CaseResult = {
    qWm,
    qBtuHrFt: wPerMToBtuHrFt(qWm),
    surfaceF: gov.surfaceF,
    outerD: perimeter / Math.PI,
    hConv: gov.hConv,
    hRad: gov.hRad,
    boundariesF: k ? [gov.wallF, gov.surfaceF] : [gov.surfaceF],
    layerMeanF: k ? [(gov.wallF + gov.surfaceF) / 2] : [],
    layerKIp: k ? [kMean(k, govR.wall, govR.Ts) / 0.144227888] : [],
    extrapolated: !!k && ((govR.wall + govR.Ts) / 2 < k.min - 1e-6 || (govR.wall + govR.Ts) / 2 > k.max + 1e-6),
    profile,
    faces,
  }
  return { input, result, moisture, faces }
}

// ------------------------------------------------------------ code minimum

/**
 * Where the duct runs. ASHRAE 90.1-2019 Table 6.8.2 has three columns —
 * Exterior, Unconditioned Space and Buried Ducts, Indirectly Conditioned
 * Space — and its notes place the rest: note b puts attics above insulated
 * ceilings, parking garages and crawl spaces under Exterior; note c puts
 * return air plenums under Indirectly Conditioned; exception 2 exempts ducts in
 * heated, semiheated or cooled spaces (C19).
 */
export type DuctPlace = 'conditioned' | 'indirect' | 'unconditioned' | 'attic' | 'crawl' | 'garage' | 'exterior' | 'buried'

export const DUCT_LOCATIONS: { id: DuctPlace; label: string; short: string; column: DuctLocation | null; why: string }[] = [
  { id: 'conditioned', label: 'Conditioned space (heated, semiheated or cooled)', short: 'Conditioned', column: null, why: '90.1-2019 6.4.4.1.2 exception 2: "Ducts or plenums located in heated spaces, semiheated spaces, or cooled spaces."' },
  { id: 'indirect', label: 'Indirectly conditioned — return air plenum', short: 'Return plenum', column: 'indirect', why: 'Table 6.8.2 note c: Indirectly Conditioned Space "Includes return air plenums with or without exposed roofs above."' },
  { id: 'unconditioned', label: 'Unconditioned space (e.g. an unconditioned shaft)', short: 'Unconditioned', column: 'unconditioned', why: 'Table 6.8.2 column "Unconditioned Space and Buried Ducts".' },
  { id: 'attic', label: 'Attic above an insulated ceiling', short: 'Attic', column: 'exterior', why: 'Table 6.8.2 note b: the Exterior column "Includes attics above insulated ceilings, parking garages and crawl spaces."' },
  { id: 'crawl', label: 'Crawl space', short: 'Crawl space', column: 'exterior', why: 'Table 6.8.2 note b: crawl spaces count as Exterior.' },
  { id: 'garage', label: 'Parking garage', short: 'Garage', column: 'exterior', why: 'Table 6.8.2 note b: parking garages count as Exterior.' },
  { id: 'exterior', label: 'Outdoors, outside the building', short: 'Outdoors', column: 'exterior', why: 'Table 6.8.2 column "Exterior".' },
  { id: 'buried', label: 'Buried / underground', short: 'Buried', column: 'unconditioned', why: 'Table 6.8.2 column "Unconditioned Space and Buried Ducts".' },
]

export const DUCT_SERVICES: { id: DuctService; label: string }[] = [
  { id: 'both', label: 'Heating & cooling' },
  { id: 'heating', label: 'Heating only' },
  { id: 'cooling', label: 'Cooling only' },
]

/** ASHRAE 90.1-2019 Table 6.8.2: minimum installed R, or null where none is required. */
export function ductCodeR(service: DuctService, zone: number, location: DuctLocation): number | null {
  const row = TABLE_6_8_2.find((r) => r.service === service && zone >= r.zones[0] && zone <= r.zones[1])
  return row ? row[location] : null
}

export type DuctCodeBasis = 'ashrae' | 'iecc'

export const DUCT_CODES: { id: DuctCodeBasis; label: string; short: string }[] = [
  { id: 'ashrae', label: 'ASHRAE 90.1-2019', short: 'ASHRAE 90.1' },
  { id: 'iecc', label: 'IECC 2021 / 2024 commercial', short: 'IECC' },
]

export interface DuctCodeResult {
  /** Minimum installed R; null = none required (or not stated: `notStated`). */
  R: number | null
  label: string
  src: string[]
  /** The code sets no R for this case, or leaves it open (shown as "not stated", not "none"). */
  notStated?: boolean
  /** An interpretation from the code's definitions rather than stated text — users may read it differently. */
  derived?: boolean
  /** Still being verified (unused once every case is sourced). */
  pending?: boolean
}

/**
 * Energy-code minimum for a duct type in a location and climate zone.
 * ASHRAE 90.1-2019 6.4.4.1.2 and Table 6.8.2 (C19); IECC 2021 C403.12.1 /
 * 2024 C403.13.1 (C1, C3), research/duct-code-verified.json. Neither code sets
 * an R-value for outside-air, exhaust or relief ducts: both clauses cover
 * supply and return ducts only (DM-12, DM-24).
 * @param dT design temperature difference across the duct wall, °F (IECC exception 2)
 */
export function ductRequirement(type: DuctType, location: DuctPlace, service: DuctService, zone: number, basis: DuctCodeBasis = 'ashrae', dT = Infinity): DuctCodeResult {
  const place = DUCT_LOCATIONS.find((l) => l.id === location)!
  const where = `${place.short.toLowerCase()}, climate zone ${zone}`
  if (type === 'outdoor' || type === 'exhaust') {
    const what = type === 'outdoor' ? 'outside-air' : 'exhaust'
    return basis === 'ashrae'
      ? { R: null, notStated: true, label: `No R-value for ${what} ducts — 90.1-2019 6.4.4.1.2 covers supply and return ducts only`, src: ['C19'] }
      : { R: null, notStated: true, label: `No R-value for ${what} ducts — IECC C403.12.1 covers supply and return ducts only`, src: ['C1', 'C3'] }
  }
  if (basis === 'iecc') {
    if (dT <= 15) return { R: null, label: `None — design temperature difference ${Math.round(dT)}°F is not over 15°F (IECC C403.12.1 exception 2)`, src: ['C1', 'C3'] }
    switch (location) {
      case 'exterior': {
        const R = zone <= 4 ? 8 : 12
        return { R, label: `Installed R-${R} — outside the building, climate zone ${zone}`, src: ['C1', 'C3'] }
      }
      case 'unconditioned':
        return { R: 6, label: `Installed R-6 — unconditioned space (${where})`, src: ['C1', 'C3'] }
      case 'attic': case 'crawl': case 'garage':
        return { R: 6, derived: true, label: `Installed R-6 — read as "unconditioned space" (DOE's reading; IECC doesn't name ${place.short.toLowerCase()}s)`, src: ['C1', 'C3', 'D_C27'] }
      case 'buried':
        return { R: null, notStated: true, label: 'Underground: "insulated as required in this section" or a listed equivalent thermal distribution efficiency — the R-value is not singled out', src: ['C1', 'C3'] }
      case 'indirect':
        return { R: null, derived: true, label: 'None — inside the thermal envelope counts as conditioned space (DOE\'s reading)', src: ['D_C1', 'D_C27'] }
      case 'conditioned':
        return { R: null, label: 'None — C403.12.1 sets no requirement in conditioned space', src: ['C1', 'C3'] }
    }
  }
  if (place.column === null) return { R: null, label: 'None — ducts in heated, semiheated or cooled spaces (90.1-2019 6.4.4.1.2 exception 2)', src: ['C19'] }
  if (type === 'return' && place.column === 'indirect') {
    // note d: "Return ducts in this duct location do not require insulation."
    return { R: null, label: 'None — return ducts in indirectly conditioned space (Table 6.8.2 note d)', src: ['C19'] }
  }
  const R = ductCodeR(service, zone, place.column)
  const svc = DUCT_SERVICES.find((x) => x.id === service)!.label.toLowerCase()
  const col = place.column === 'exterior' ? 'Exterior' : place.column === 'indirect' ? 'Indirectly Conditioned' : 'Unconditioned Space and Buried Ducts'
  return {
    R,
    // an unconditioned shaft isn't named in the table: an enclosed, unconditioned space falls in that column
    derived: location === 'unconditioned',
    label: R === null ? `None required (${svc}, ${where})` : `Installed R-${R} — ${col} column (${svc}, ${where})`,
    src: ['C19'],
  }
}
