import { INSULATION, thicknessesFor, type InsulationId } from '../data/catalog'
import { THICKNESSES, type PipeMaterial } from '../data/pipe'
import { pipeSpec } from '../data/pipes'
import { ductBehavior, ductProduct, ductSurface, ductThicknesses, ratedR, solveDuct } from './duct'
import { PIPE_PROPS } from '../data/pipeWalls'
import { SPECS, type ProductSpec } from '../data/specs'
import { resolveSystem } from '../geo/assembly'
import { C585_OD, C585_OD_COPPER } from './c585'
import { annualBtu, curveFrom, moisture, solveCase, type CaseInput, type CaseResult, type Moisture } from './engine'
import { barePipe, outerSurface, type SurfaceRef } from './emittance'
import type { CondensationStatus, SimMode, SimState } from './types'
import { IN_M } from './units'

/**
 * Turns the UI state into engine cases (bare and insulated), runs them and
 * derives everything the result cards, status badges and 3D effects need.
 */

/** Products of a material that publish a usable k-curve (two or more points). */
export const kProducts = (id: InsulationId): { index: number; product: ProductSpec }[] =>
  SPECS[id].products.map((product, index) => ({ index, product })).filter((p) => p.product.k.length >= 2)

/** Index of the first product with a k-curve whose published range covers a temperature (else the first with a k-curve). */
export function productForTemp(id: InsulationId, processF: number): number {
  const list = kProducts(id)
  const fit = list.find(({ product: p }) => (p.tempF.max === null || processF <= p.tempF.max) && (p.tempF.min === null || processF >= p.tempF.min))
  return (fit ?? list[0])?.index ?? 0
}

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

export function geometry(npsIndex: number, thicknessIn: number, nominal = false, pipe: PipeMaterial = 'steel'): Geometry {
  const p = pipeSpec(pipe, npsIndex)
  const table = pipe === 'copper' ? C585_OD_COPPER : C585_OD
  const c = nominal ? undefined : table[p.nps]?.[String(thicknessIn)]
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

/** `nominal` uses pipe OD + 2t even where a C585 OD exists (for continuous thickness solving). */
export function caseFor(s: SimState, mode: SimMode, thicknessIn: number | null, nominal = false): { input: CaseInput; geo: Geometry | null; surface: SurfaceRef } {
  const p = pipeSpec(s.pipe, s.npsIndex)
  const pipeOd = p.od * IN_M
  // plastic pipe walls conduct poorly enough to matter; metal walls are neglected (as in C680)
  const wallK = PIPE_PROPS[s.pipe]?.wallKWmK
  const wall = wallK ? { kWmK: wallK, rIn: (p.od / 2 - p.wall) * IN_M } : undefined
  if (thicknessIn === null || thicknessIn <= 0) {
    const surface = barePipe(s.pipe)
    return {
      input: { pipeOd, processF: s.processF, ambientF: s.ambientF, windMph: s.windMph, layers: [], emittance: surface.value, wall },
      geo: null,
      surface,
    }
  }
  const geo = geometry(s.npsIndex, thicknessIn, nominal, s.pipe)
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
      wall,
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

/** The Ductwork tab has no hot/cold of its own: heat flows by which side is warmer. */
export const physicsMode = (s: { processF: number; ambientF: number }, mode: SimMode): SimMode => (mode === 'duct' ? ductBehavior(s) : mode)

export interface Side {
  /** Nominal thickness (ducts: out-of-package), null = bare. */
  thicknessIn: number | null
  input: CaseInput
  result: CaseResult
  moisture: Moisture
  status: CondensationStatus
  geo: Geometry | null
  surface: SurfaceRef
  /** Ducts: the insulation's rated installed R (what the energy codes check). */
  ratedR?: number
}

export function evaluateSide(s: SimState, mode: SimMode, thicknessIn: number | null, nominal = false): Side {
  mode = physicsMode(s, mode)
  if (s.system === 'duct') {
    const t = thicknessIn !== null && thicknessIn > 0 ? thicknessIn : null
    const d = solveDuct(s, mode, t)
    const surf = ductSurface(s, t !== null)
    return {
      thicknessIn, input: d.input, result: d.result, moisture: d.moisture, status: condensationStatus(d.moisture, s.dewMarginF), geo: null,
      surface: s.emittanceOverride === null || t === null ? surf : { ...surf, value: s.emittanceOverride, label: 'Custom emittance', src: [] },
      ratedR: t === null ? 0 : ratedR(s.ductIns, t, s.ductShape),
    }
  }
  const { input, geo, surface } = caseFor(s, mode, thicknessIn, nominal)
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
  mode = physicsMode(s, mode)
  const bare = evaluateSide(s, mode, null)
  const ins = evaluateSide(s, mode, s.thicknessIn)
  const product = s.system === 'duct' ? ductProduct(s.ductIns, s.ductFacing, s.ductShape) : productFor(s)
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
  if (s.system === 'duct') return ductWarnings(s, mode, ins, product)
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
  /** A thickness floor, e.g. an energy-code minimum. */
  | { kind: 'minThickness'; in: number }
  /** Ducts: a minimum rated installed R (energy codes). */
  | { kind: 'minR'; R: number }

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
    case 'minThickness': return side.thicknessIn !== null && side.thicknessIn + 1e-9 >= goal.in
    case 'minR': return (side.ratedR ?? 0) + 1e-9 >= goal.R
  }
}

/** Smallest standard thickness (0.5" steps, up to the material's max) meeting the goal. */
/** Thicknesses on offer for the current system (ducts: the product's nominal sizes). */
export function thicknessOptions(s: SimState): number[] {
  return s.system === 'duct' ? ductThicknesses(s.ductIns, s.ductShape) : thicknessesFor(INSULATION[s.insulation], THICKNESSES)
}

export function recommend(s: SimState, mode: SimMode, goal: Goal): Recommendation {
  mode = physicsMode(s, mode)
  const opts = thicknessOptions(s)
  const maxIn = s.system === 'duct' ? opts[opts.length - 1] : INSULATION[s.insulation].maxThicknessIn
  const bare = evaluateSide(s, mode, null)
  for (const t of opts) {
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
  // Heat waves scale with the heat actually leaving the surface, so a well
  // insulated jacket (often under 1/10 of the bare pipe's flux) shows a faint
  // shimmer at most while the bare stub beside it pours heat; a bare steam pipe
  // (~1,350 W/m²) is near full strength.
  if (mode === 'hot') return Math.min(1, flux / 1500)
  return Math.min(1, Math.sqrt(flux / 250))
}

// ------------------------------------------------------------------ ducts

function ductWarnings(s: SimState, mode: SimMode, ins: Side, product: ProductSpec): Warning[] {
  const out: Warning[] = []
  const max = product.tempF.max
  if (max !== null && s.processF > max) out.push({ level: 'warn', text: `${s.processF}°F is above ${product.name}'s ${product.tempF.note ?? `published maximum of ${max}°F`}.` })
  if (mode === 'hot' && s.processF <= s.ambientF) out.push({ level: 'info', text: 'The air in the duct is at or below the room — this is a cooling duct. Try Cold mode.' })
  if (mode !== 'hot' && s.processF >= s.ambientF) out.push({ level: 'info', text: 'The air in the duct is at or above the room, so the duct cannot sweat. Try Hot mode.' })
  const lim = ins.surface.maxSurfaceF
  if (lim !== undefined && ins.result.surfaceF > lim) out.push({ level: 'warn', text: `Surface ${Math.round(ins.result.surfaceF)}°F exceeds the ${ins.surface.label.toLowerCase()} limit of ${lim}°F.` })
  if (s.ductShape === 'rect' && s.ductW >= 24) out.push({ level: 'info', text: 'Ducts 24" and wider need mechanical fasteners (pins) on the underside at no more than 18" on center to keep the wrap from sagging (OC, JM, Knauf, CertainTeed).' })
  if (mode !== 'hot') out.push({ level: 'info', text: 'Cooling ducts: seal every seam, tear, staple and pin penetration with foil tape so the vapor retarder is continuous (IMC 604.11).' })
  return out
}
