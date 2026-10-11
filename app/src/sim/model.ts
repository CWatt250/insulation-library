import { INSULATION, type InsulationId } from '../data/catalog'
import { NPS, THICKNESSES } from '../data/pipe'
import { SPECS, type ProductSpec } from '../data/specs'
import { resolveSystem } from '../geo/assembly'
import { C585_OD } from './c585'
import { annualBtu, curveFrom, moisture, solveCase, type CaseInput, type CaseResult, type Moisture } from './engine'
import { BARE_PIPE, outerSurface, type SurfaceRef } from './emittance'
import type { CondensationStatus, SimMode, SimState } from './types'
import { IN_M } from './units'

/**
 * Turns the UI state into engine cases (bare and insulated), runs them and
 * derives everything the result cards, status badges and 3D effects need.
 */

/** Products of a material that publish a usable k-curve (two or more points). */
export const kProducts = (id: InsulationId): { index: number; product: ProductSpec }[] =>
  SPECS[id].products.map((product, index) => ({ index, product })).filter((p) => p.product.k.length >= 2)

/** Materials that can be simulated in a mode, and why the others can't. */
export function availability(id: InsulationId, mode: SimMode): { ok: boolean; reason?: string } {
  const ins = INSULATION[id]
  if (!kProducts(id).length) return { ok: false, reason: 'No published k-value with a mean temperature in the verified data' }
  if (mode !== 'hot' && !ins.services.includes('cold')) return { ok: false, reason: `${ins.label} is listed for hot service only` }
  return { ok: true }
}

export interface Geometry {
  pipeOdIn: number
  insOdIn: number
  /** True when the OD comes from the ASTM C585 table, false when it is pipe OD + 2t. */
  c585: boolean
  actualThicknessIn: number
}

export function geometry(npsIndex: number, thicknessIn: number): Geometry {
  const p = NPS[npsIndex]
  const c = C585_OD[p.nps]?.[String(thicknessIn)]
  const insOdIn = c ?? p.od + 2 * thicknessIn
  return { pipeOdIn: p.od, insOdIn, c585: c !== undefined, actualThicknessIn: (insOdIn - p.od) / 2 }
}

export function productFor(s: SimState): ProductSpec {
  const list = kProducts(s.insulation)
  return (list.find((p) => p.index === s.kProduct) ?? list[0]).product
}

/** The resolved system for a mode: cold and condensate work are below-ambient service. */
export function systemFor(s: SimState, mode: SimMode) {
  return resolveSystem({ insulation: s.insulation, jacket: s.jacket, facing: s.facing, service: mode === 'hot' ? 'hot' : 'cold' })
}

export function caseFor(s: SimState, mode: SimMode, thicknessIn: number | null): { input: CaseInput; geo: Geometry | null; surface: SurfaceRef } {
  const pipeOd = NPS[s.npsIndex].od * IN_M
  if (thicknessIn === null || thicknessIn <= 0) {
    const surface = BARE_PIPE
    return {
      input: { pipeOd, processF: s.processF, ambientF: s.ambientF, windMph: s.windMph, layers: [], emittance: surface.value },
      geo: null,
      surface,
    }
  }
  const geo = geometry(s.npsIndex, thicknessIn)
  const sys = systemFor(s, mode)
  const surface = outerSurface({ insulation: s.insulation, jacket: sys.jacketId, facing: sys.facing, membrane: sys.membrane, metalFinish: s.metalFinish })
  const emittance = s.emittanceOverride ?? surface.value
  const k = curveFrom(productFor(s).k)
  return {
    input: {
      pipeOd,
      processF: s.processF,
      ambientF: s.ambientF,
      windMph: s.windMph,
      layers: [{ k, rIn: pipeOd / 2, rOut: (geo.insOdIn * IN_M) / 2 }],
      emittance,
    },
    geo,
    surface: s.emittanceOverride === null ? surface : { ...surface, value: s.emittanceOverride, label: 'Custom emittance', src: [] },
  }
}

/**
 * Default safe-touch surface limit, °F: "Standard industry practice is to
 * specify a maximum temperature of 140°F for surfaces that may be contacted by
 * personnel" (NIA Mechanical Insulation Design Guide, M6).
 */
export const PP_DEFAULT_F = 140

/** 3E Plus / NIA condensation-control margin above the dew point, °F (M4, M7, M8). */
export const DEW_MARGIN_DEFAULT_F = 0.75

// ------------------------------------------------------------------ status

/**
 * Condensation status bands. These are this app's presentation convention,
 * not a standard: Borderline = dry but within the chosen margin of the dew
 * point; Dripping risk = condensing faster than DRIP_RATE.
 */
export const DRIP_RATE = 50 // g/(m²·h)

export function condensationStatus(m: Moisture, marginF: number): CondensationStatus {
  if (m.condensing) return m.rateGm2h >= DRIP_RATE ? 'dripping' : 'sweating'
  return m.marginF < marginF ? 'borderline' : 'dry'
}

export interface Side {
  thicknessIn: number | null
  input: CaseInput
  result: CaseResult
  moisture: Moisture
  status: CondensationStatus
  geo: Geometry | null
  surface: SurfaceRef
}

export function evaluateSide(s: SimState, mode: SimMode, thicknessIn: number | null): Side {
  const { input, geo, surface } = caseFor(s, mode, thicknessIn)
  const result = solveCase(input)
  const m = moisture(input, result, s.rh)
  return { thicknessIn, input, result, moisture: m, status: condensationStatus(m, s.dewMarginF), geo, surface }
}

export interface Warning { level: 'info' | 'warn'; text: string }

export interface Evaluation {
  mode: SimMode
  bare: Side
  ins: Side
  /** Percent reduction in heat flow vs bare. */
  reductionPct: number
  annual: { bare: number; ins: number; saved: number } | null
  warnings: Warning[]
  product: ProductSpec
}

export function evaluate(s: SimState, mode: SimMode): Evaluation {
  const bare = evaluateSide(s, mode, null)
  const ins = evaluateSide(s, mode, s.thicknessIn)
  const product = productFor(s)
  const reductionPct = bare.result.qWm !== 0 ? (1 - ins.result.qWm / bare.result.qWm) * 100 : 0
  const annual = s.lengthFt > 0 && s.hours > 0
    ? (() => {
      const b = annualBtu(bare.result.qBtuHrFt, s.lengthFt, s.hours)
      const i = annualBtu(ins.result.qBtuHrFt, s.lengthFt, s.hours)
      return { bare: b, ins: i, saved: b - i }
    })()
    : null
  return { mode, bare, ins, reductionPct, annual, warnings: warnings(s, mode, ins, product), product }
}

function warnings(s: SimState, mode: SimMode, ins: Side, product: ProductSpec): Warning[] {
  const out: Warning[] = []
  const { min, max } = product.tempF
  if (max !== null && s.processF > max) out.push({ level: 'warn', text: `${s.processF}°F is above ${product.name}'s published maximum of ${max}°F.` })
  if (min !== null && s.processF < min) out.push({ level: 'warn', text: `${s.processF}°F is below ${product.name}'s published minimum of ${min}°F.` })
  if (mode === 'hot' && s.processF <= s.ambientF) out.push({ level: 'info', text: 'The pipe is at or below ambient — this is cold service. Try Cold Pipe mode.' })
  if (mode !== 'hot' && s.processF >= s.ambientF) out.push({ level: 'info', text: 'The pipe is at or above ambient, so it cannot sweat. Try Hot Pipe mode.' })
  if (ins.result.extrapolated) out.push({ level: 'info', text: `The insulation's mean temperature is outside ${product.name}'s published k data; k is extended linearly from the nearest points.` })
  const lim = ins.surface.maxSurfaceF
  if (lim !== undefined && ins.result.surfaceF > lim) out.push({ level: 'warn', text: `Surface ${Math.round(ins.result.surfaceF)}°F exceeds the ${ins.surface.label.toLowerCase()} limit of ${lim}°F.` })
  if (mode !== 'hot' && s.vr === 'poor') out.push({ level: 'warn', text: 'Poor vapor-retarder quality: moisture can migrate into the insulation, raise its k and cause hidden wetting or corrosion even when the calculated surface stays dry.' })
  if (mode !== 'hot' && s.vr === 'fair') out.push({ level: 'info', text: 'Fair vapor-retarder quality: seal every lap, butt joint and penetration — field performance depends on it.' })
  return out
}

// ----------------------------------------------------------------- solvers

export type Goal =
  | { kind: 'surfaceMax'; F: number }
  | { kind: 'noCondensation'; marginF: number }
  | { kind: 'surfaceMin'; F: number }
  | { kind: 'qMax'; btuHrFt: number }

export interface Recommendation {
  goal: Goal
  /** Smallest standard thickness that meets the goal, or null if none up to the material's max. */
  thicknessIn: number | null
  side: Side | null
  maxIn: number
  alreadyMet: boolean
}

export function meets(goal: Goal, side: Side): boolean {
  const r = side.result
  switch (goal.kind) {
    case 'surfaceMax': return r.surfaceF <= goal.F
    case 'surfaceMin': return r.surfaceF >= goal.F
    case 'noCondensation': return side.moisture.marginF >= goal.marginF
    case 'qMax': return Math.abs(r.qBtuHrFt) <= goal.btuHrFt
  }
}

/** Smallest standard thickness (0.5" steps, up to the material's max) meeting the goal. */
export function recommend(s: SimState, mode: SimMode, goal: Goal): Recommendation {
  const maxIn = INSULATION[s.insulation].maxThicknessIn
  const bare = evaluateSide(s, mode, null)
  for (const t of THICKNESSES.filter((t) => t <= maxIn)) {
    const side = evaluateSide(s, mode, t)
    if (meets(goal, side)) return { goal, thicknessIn: t, side, maxIn, alreadyMet: meets(goal, bare) }
  }
  return { goal, thicknessIn: null, side: null, maxIn, alreadyMet: meets(goal, bare) }
}

// ---------------------------------------------------------------- visuals

/**
 * 0–1 strength of the heat-flow rays, from heat flux at the exposed surface.
 * Square-root scaling keeps an insulated line visible next to a bare one.
 */
export function rayIntensity(side: Side, mode: SimMode): number {
  const area = Math.PI * side.result.outerD // m² per m
  const flux = Math.abs(side.result.qWm) / area // W/m²
  const ref = mode === 'hot' ? 2500 : 250
  return Math.min(1, Math.sqrt(flux / ref))
}
