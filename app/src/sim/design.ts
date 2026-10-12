import { INSULATION, INSULATIONS, layerCount, snapThickness, type InsulationId } from '../data/catalog'
import { THICKNESSES } from '../data/pipe'
import { codeMinimum } from './code'
import { availability, physicsMode, caseFor, evaluateSide, kProducts, meets, recommend, thicknessOptions, type Goal, type Recommendation, type Side } from './model'
import { DUCT_CODES, DUCT_INSULATIONS, ductProduct, ductRequirement, ductSurface, ductThicknesses, type DuctCodeResult, type DuctInsulation } from './duct'
import type { SimMode, SimState } from './types'
import { IN_M } from './units'

/**
 * Thickness design: every requirement that applies to the system is solved on
 * its own, and the design thickness is the largest of them (the governing one).
 */
export interface Constraint {
  id: 'pp' | 'finish' | 'dew' | 'target' | 'flow' | 'code' | 'imc'
  label: string
  goal: Goal
  /** Where the requirement comes from (sources.ts ids); empty for user targets. */
  src: string[]
}

export function constraintsFor(s: SimState, mode: SimMode): Constraint[] {
  mode = physicsMode(s, mode)
  if (s.system === 'duct') return ductConstraints(s, mode)
  const out: Constraint[] = []
  if (mode === 'hot') {
    out.push({ id: 'pp', label: `Personnel protection: surface ≤ ${s.ppF}°F`, goal: { kind: 'surfaceMax', F: s.ppF }, src: ['M6'] })
    const surf = caseFor(s, mode, 1).surface
    if (surf.maxSurfaceF !== undefined) {
      out.push({ id: 'finish', label: `${surf.label}: surface ≤ ${surf.maxSurfaceF}°F`, goal: { kind: 'surfaceMax', F: surf.maxSurfaceF }, src: surf.limitSrc ?? [] })
    }
  } else {
    out.push({ id: 'dew', label: `No condensation: surface ≥ dew point + ${s.dewMarginF}°F`, goal: { kind: 'noCondensation', marginF: s.dewMarginF }, src: ['M4', 'M8'] })
  }
  if (s.applyCode) {
    const c = codeMinimum(s, mode)
    if ('minIn' in c) out.push({ id: 'code', label: c.minR ? `Energy code: ${c.edition} R-${c.minR} (≥ ${c.minIn.toFixed(2)}")` : `Energy code: ${c.edition} ≥ ${c.minIn.toFixed(2)}"`, goal: { kind: 'minThickness', in: c.minIn }, src: c.src })
  }
  return out
}

export interface Design {
  rows: { c: Constraint; rec: Recommendation }[]
  /** Smallest standard thickness meeting every requirement; null if none fits the material's range. */
  thicknessIn: number | null
  governing: Constraint | null
  side: Side | null
  /** Continuous minimum for the governing requirement, on nominal OD (pipe OD + 2t). */
  exactIn: number | null
  /** Insulation layers at the design thickness (catalog single-layer limit). */
  layers: number
  maxIn: number
}

/** Smallest thickness (continuous, nominal OD) that meets a goal; bisection, since every goal is monotonic in thickness. */
export function exactThickness(s: SimState, mode: SimMode, goal: Goal, maxIn: number): number | null {
  if (meets(goal, evaluateSide(s, mode, 0.01, true))) return 0
  if (!meets(goal, evaluateSide(s, mode, maxIn, true))) return null
  let lo = 0.01
  let hi = maxIn
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2
    if (meets(goal, evaluateSide(s, mode, mid, true))) hi = mid
    else lo = mid
  }
  return hi
}

export function design(s: SimState, mode: SimMode): Design {
  mode = physicsMode(s, mode)
  const ins = INSULATION[s.insulation]
  const opts = thicknessOptions(s)
  const maxIn = s.system === 'duct' ? opts[opts.length - 1] : ins.maxThicknessIn
  const rows = constraintsFor(s, mode).map((c) => ({ c, rec: recommend(s, mode, c.goal) }))
  const blocked = rows.find((r) => r.rec.thicknessIn === null)
  let governing: Design['rows'][number] | null = null
  for (const r of rows) if (!governing || (r.rec.thicknessIn ?? Infinity) > (governing.rec.thicknessIn ?? Infinity)) governing = r
  const t = blocked ? null : governing?.rec.thicknessIn ?? null
  return {
    rows,
    thicknessIn: t,
    governing: governing?.c ?? null,
    side: t === null ? null : evaluateSide(s, mode, t),
    exactIn: governing ? exactThickness(s, mode, governing.c.goal, maxIn) : null,
    layers: t !== null && s.system !== 'duct' ? layerCount(ins, t) : 1,
    maxIn,
  }
}

export interface MaterialOption {
  id: InsulationId | DuctInsulation
  label: string
  state: SimState
  design: Design | null
  /** Why this material is out. */
  reason?: string
}

/**
 * The same design run for every material that suits the service: what each
 * would need, keeping the current finish where the material offers it.
 */
/** The current system re-done in another material (finish kept where offered), or why it can't be. */
export function stateForMaterial(s: SimState, mode: SimMode, id: InsulationId): { state: SimState } | { reason: string } {
  const m = INSULATION[id]
  const a = availability(id, mode)
  if (!a.ok) return { reason: a.reason ?? 'Not available' }
  // pick the first product whose published range covers the process temperature
  const prod = kProducts(id).find(({ product: p }) => (p.tempF.max === null || s.processF <= p.tempF.max) && (p.tempF.min === null || s.processF >= p.tempF.min))
  if (!prod) return { reason: `${s.processF}°F is outside the published range` }
  return {
    state: {
      ...s,
      insulation: id,
      kProduct: prod.index,
      jacket: m.jackets.includes(s.jacket) ? s.jacket : m.jackets[0],
      facing: m.facings.includes(s.facing) ? s.facing : m.facings[0],
      thicknessIn: snapThickness(m, s.thicknessIn, THICKNESSES),
    },
  }
}

export function materialOptions(s: SimState, mode: SimMode): MaterialOption[] {
  mode = physicsMode(s, mode)
  if (s.system === 'duct') {
    return DUCT_INSULATIONS.map((m) => {
      const r = stateForDuctMaterial(s, m.id)
      if ('reason' in r) return { id: m.id, label: m.label, state: s, design: null, reason: r.reason }
      return { id: m.id, label: m.label, state: r.state, design: design(r.state, mode) }
    }).sort((a, b) => (a.design?.thicknessIn ?? 99) - (b.design?.thicknessIn ?? 99))
  }
  const out: MaterialOption[] = INSULATIONS.map((m) => {
    const base = { id: m.id, label: m.label, state: s, design: null }
    const r = stateForMaterial(s, mode, m.id)
    if ('reason' in r) return { ...base, reason: r.reason }
    return { ...base, state: r.state, design: design(r.state, mode) }
  })
  const rank = (o: MaterialOption) => (o.design?.thicknessIn ?? (o.design ? 90 : 99))
  return out.sort((a, b) => rank(a) - rank(b))
}

// ------------------------------------------------------------------ ducts

/** The duct's code minimum for its type, location and climate zone (ASHRAE 90.1-2019 Table 6.8.2, C19). */
export function ductCode(s: SimState): DuctCodeResult {
  return ductRequirement(s.ductType, s.ductLocation, s.ductService, s.climateZone, s.ductCodeBasis, Math.abs(s.processF - s.ambientF))
}

function ductConstraints(s: SimState, mode: SimMode): Constraint[] {
  const out: Constraint[] = []
  if (mode === 'hot') {
    out.push({ id: 'pp', label: `Personnel protection: surface ≤ ${s.ppF}°F`, goal: { kind: 'surfaceMax', F: s.ppF }, src: ['M6'] })
    // IMC 604.2: ducts above 120°F insulated to keep the exposed surface at or below 120°F
    if (s.processF > 120) out.push({ id: 'imc', label: 'IMC 604.2: duct surface ≤ 120°F', goal: { kind: 'surfaceMax', F: 120 }, src: ['C6'] })
    const surf = ductSurface(s, true)
    if (surf.maxSurfaceF !== undefined) out.push({ id: 'finish', label: `${surf.label}: surface ≤ ${surf.maxSurfaceF}°F`, goal: { kind: 'surfaceMax', F: surf.maxSurfaceF }, src: surf.limitSrc ?? [] })
  } else {
    out.push({ id: 'dew', label: `No condensation: surface ≥ dew point + ${s.dewMarginF}°F`, goal: { kind: 'noCondensation', marginF: s.dewMarginF }, src: ['M4', 'M8'] })
  }
  // ductwork is designed to the energy code first: its minimum is always a requirement
  const c = ductCode(s)
  if (c.R !== null) out.push({ id: 'code', label: `Energy code (${DUCT_CODES.find((x) => x.id === s.ductCodeBasis)!.label}): installed ≥ R-${c.R}`, goal: { kind: 'minR', R: c.R }, src: c.src })
  return out
}

/** The current duct re-done in another duct insulation, or why it can't be. */
export function stateForDuctMaterial(s: SimState, id: DuctInsulation): { state: SimState } | { reason: string } {
  const p = ductProduct(id)
  if (p.tempF.max !== null && s.processF > p.tempF.max) return { reason: `${s.processF}°F is above its ${p.tempF.max}°F limit` }
  const list = ductThicknesses(id)
  const t = list.reduce((b, x) => (Math.abs(x - s.thicknessIn) < Math.abs(b - s.thicknessIn) ? x : b), list[0])
  return { state: { ...s, ductIns: id, thicknessIn: t } }
}

// ------------------------------------------------------------- dew zone

export interface DewZone {
  /** Fraction of the insulation thickness (from the pipe out) colder than the dew point, 0–1. */
  fraction: number
  /** That depth, inches. */
  depthIn: number
}

/** Where the dew point falls inside the insulation on cold work. */
export function dewZone(side: Side): DewZone | null {
  const L = side.input.layers[0]
  if (!L) return null
  const dew = side.moisture.dewF
  const prof = side.result.profile
  if (prof[0].tF >= dew) return { fraction: 0, depthIn: 0 }
  const span = L.rOut - L.rIn
  for (let i = 1; i < prof.length; i++) {
    const a = prof[i - 1]
    const b = prof[i]
    if (b.tF >= dew) {
      const r = a.r + ((dew - a.tF) / (b.tF - a.tF || 1)) * (b.r - a.r)
      return { fraction: (r - L.rIn) / span, depthIn: (r - L.rIn) / IN_M }
    }
  }
  return { fraction: 1, depthIn: span / IN_M }
}
