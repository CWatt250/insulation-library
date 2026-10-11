import type { PipeMaterial } from '../data/pipe'
import { pipeSpec } from '../data/pipes'
import type { Component } from '../geo/assembly'
import { ELBOW_TEE_FT, FLANGE_FT2_150, VALVE_FT2_150 } from './fittingsData'
import type { Evaluation } from './model'
import type { SimState } from './types'

/**
 * Fitting heat flow as an equivalent length of straight pipe
 * (research/fittings-verified.json):
 *  - 90° elbows and straight tees: Illinois TRM table (F12/F13), NPS 1–12,
 *    interpolated between full sizes as the TRM directs.
 *  - Valves and flanges: ASTM C1129-12 bare surface area (class 150, via the
 *    TRM), divided by the pipe's outside area per foot — the C1129 area method,
 *    which the TRM's own equivalent lengths reproduce.
 * Bare: equivalent length × bare-pipe heat flow per foot. Insulated or covered:
 * the same length × insulated heat flow per foot, as the TRM and Hart (F6) do.
 */

export interface FittingEq {
  ft: number
  /** How the length was obtained, for the footnote. */
  basis: string
  src: string[]
  interpolated: boolean
}

const npsValue = (nps: string) => nps.split('-').reduce((sum, part) => {
  const [a, b] = part.split('/').map(Number)
  return sum + (b ? a / b : a)
}, 0)

function lerp(table: { nps: number }[], nps: number, key: (r: never) => number): { v: number; interpolated: boolean } | null {
  const rows = table as { nps: number }[]
  if (nps < rows[0].nps - 1e-9 || nps > rows[rows.length - 1].nps + 1e-9) return null
  const exact = rows.find((r) => Math.abs(r.nps - nps) < 1e-9)
  if (exact) return { v: key(exact as never), interpolated: false }
  const i = rows.findIndex((r) => r.nps > nps)
  const a = rows[i - 1]
  const b = rows[i]
  const f = (nps - a.nps) / (b.nps - a.nps)
  return { v: key(a as never) + f * (key(b as never) - key(a as never)), interpolated: true }
}

/** Illinois TRM small-pipe (copper) elbow/tee lengths, 1/2 and 3/4 in. only; the TRM does not explain them (F12). */
const COPPER_SMALL: Record<string, { elbow: number; tee: number }> = { '1/2': { elbow: 0.04, tee: 0.03 }, '3/4': { elbow: 0.06, tee: 0.05 } }

export function equivalentLength(component: Component, npsIndex: number, pipe: PipeMaterial = 'steel'): FittingEq | null {
  const p = pipeSpec(pipe, npsIndex)
  const nps = npsValue(p.nps)
  // PVC fittings are socket-type with a different shape; no published lengths.
  if (pipe === 'pvc') return null
  if (pipe === 'copper') {
    const r = COPPER_SMALL[p.nps]
    if (!r || (component !== 'elbow' && component !== 'tee')) return null
    return { ft: r[component], basis: `Illinois TRM small-pipe (copper) ${component} equivalent length — the TRM does not explain these values; treat with caution`, src: ['F12'], interpolated: false }
  }
  if (component === 'elbow' || component === 'tee') {
    const r = lerp(ELBOW_TEE_FT, nps, (row: { elbow: number; tee: number }) => (component === 'elbow' ? row.elbow : row.tee))
    if (!r) return null
    return { ft: r.v, basis: `Illinois TRM ${component === 'elbow' ? '90° elbow' : 'straight tee'} equivalent length (surface area)`, src: ['F12'], interpolated: r.interpolated }
  }
  if (component === 'valve' || component === 'flange') {
    const table = component === 'valve' ? VALVE_FT2_150 : FLANGE_FT2_150
    const r = lerp(table, nps, (row: { ft2: number }) => row.ft2)
    if (!r) return null
    const ftPerFt = Math.PI * (p.od / 12)
    return {
      ft: r.v / ftPerFt,
      basis: `ASTM C1129 bare ${component} area, class 150 (${r.v.toFixed(2)} ft²), ÷ pipe area per foot`,
      src: ['F12'],
      interpolated: r.interpolated,
    }
  }
  return null
}

export interface FittingResult {
  eq: FittingEq
  /** Heat flow, Btu/hr (magnitude): bare fitting, and insulated / covered fitting. */
  bare: number
  covered: number
  /** What this build-up has: valves and flanges can be left bare. */
  coveredNow: boolean
  savedBtuHr: number
  /** Annual energy saved by insulating the fitting, Btu/yr (when hours are set). */
  annualSaved: number | null
}

export function fittingResult(s: SimState, ev: Evaluation): FittingResult | { none: string } | null {
  if (s.component === 'straight') return null
  const eq = equivalentLength(s.component, s.npsIndex, s.pipe)
  if (!eq) {
    if (s.pipe === 'pvc') return { none: 'No published equivalent lengths for PVC fittings.' }
    if (s.pipe === 'copper') return { none: 'Published copper equivalent lengths cover only 1/2" and 3/4" elbows and tees.' }
    return { none: `No published equivalent length for NPS ${pipeSpec(s.pipe, s.npsIndex).nps}" — the tables cover NPS 1–12.` }
  }
  const bare = eq.ft * Math.abs(ev.bare.result.qBtuHrFt)
  const covered = eq.ft * Math.abs(ev.ins.result.qBtuHrFt)
  const coveredNow = !((s.component === 'valve' || s.component === 'flange') && s.fittingCover === 'none')
  return {
    eq,
    bare,
    covered,
    coveredNow,
    savedBtuHr: bare - covered,
    annualSaved: s.hours > 0 ? (bare - covered) * s.hours : null,
  }
}
