import { INSULATION, INSULATIONS, layerCount, snapThickness, type InsulationId } from '../data/catalog'
import { THICKNESSES } from '../data/pipe'
import { codeMinimum } from './code'
import { availability, caseFor, evaluateSide, kProducts, meets, recommend, type Goal, type Recommendation, type Side } from './model'
import type { SimMode, SimState } from './types'
import { IN_M } from './units'

/**
 * Thickness design: every requirement that applies to the system is solved on
 * its own, and the design thickness is the largest of them (the governing one).
 */
export interface Constraint {
  id: 'pp' | 'finish' | 'dew' | 'target' | 'flow' | 'code'
  label: string
  goal: Goal
  /** Where the requirement comes from (sources.ts ids); empty for user targets. */
  src: string[]
}

export function constraintsFor(s: SimState, mode: SimMode): Constraint[] {
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
    if ('minIn' in c) out.push({ id: 'code', label: `Energy code: ${c.edition} ≥ ${c.minIn.toFixed(2)}"`, goal: { kind: 'minThickness', in: c.minIn }, src: c.src })
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
  const ins = INSULATION[s.insulation]
  const maxIn = ins.maxThicknessIn
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
    layers: t !== null ? layerCount(ins, t) : 1,
    maxIn,
  }
}

export interface MaterialOption {
  id: InsulationId
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
export function materialOptions(s: SimState, mode: SimMode): MaterialOption[] {
  const out: MaterialOption[] = INSULATIONS.map((m) => {
    const a = availability(m.id, mode)
    const ks = kProducts(m.id)
    const base = { id: m.id, label: m.label, state: s, design: null }
    if (!a.ok) return { ...base, reason: a.reason }
    // pick the first product whose published range covers the process temperature
    const prod = ks.find(({ product: p }) => (p.tempF.max === null || s.processF <= p.tempF.max) && (p.tempF.min === null || s.processF >= p.tempF.min))
    if (!prod) return { ...base, reason: `${s.processF}°F is outside the published range` }
    const state: SimState = {
      ...s,
      insulation: m.id,
      kProduct: prod.index,
      jacket: m.jackets.includes(s.jacket) ? s.jacket : m.jackets[0],
      facing: m.facings.includes(s.facing) ? s.facing : m.facings[0],
      thicknessIn: snapThickness(m, s.thicknessIn, THICKNESSES),
    }
    return { ...base, state, design: design(state, mode) }
  })
  const rank = (o: MaterialOption) => (o.design?.thicknessIn ?? (o.design ? 90 : 99))
  return out.sort((a, b) => rank(a) - rank(b))
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
