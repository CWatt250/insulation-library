import { pipeSpec } from '../data/pipes'
import { kAt } from './conductivity'
import { curveFrom } from './engine'
import { productFor } from './model'
import type { SimMode, SimState } from './types'

/**
 * ASHRAE 90.1-2019 minimum pipe insulation thickness (Tables 6.8.3-1 and -2,
 * research/vapor-code-verified.json → R30), with footnote a's correction for
 * insulation outside the table's conductivity range:
 *   T = r[(1 + t/r)^(K/k) − 1]
 * r = actual pipe outside radius, t = table thickness, K = the material's k at
 * the table's mean rating temperature, k = upper value of the table's range.
 * Footnote reductions (partitions in conditioned space, direct burial) are not applied.
 */

interface Row { label: string; lo: number; hi: number; k: [number, number]; meanF: number; t: [number, number, number, number, number] }

// Thickness columns: NPS <1, 1 to <1-1/2, 1-1/2 to <4, 4 to <8, ≥8
const HEATING: Row[] = [
  { label: 'above 350°F', lo: 350.0001, hi: Infinity, k: [0.32, 0.34], meanF: 250, t: [4.5, 5, 5, 5, 5] },
  { label: '251–350°F', lo: 251, hi: 350, k: [0.29, 0.32], meanF: 200, t: [3, 4, 4.5, 4.5, 4.5] },
  { label: '201–250°F', lo: 201, hi: 250, k: [0.27, 0.3], meanF: 150, t: [2.5, 2.5, 2.5, 3, 3] },
  { label: '141–200°F', lo: 141, hi: 200, k: [0.25, 0.29], meanF: 125, t: [1.5, 1.5, 2, 2, 2] },
  { label: '105–140°F', lo: 105, hi: 140, k: [0.22, 0.28], meanF: 100, t: [1, 1, 1.5, 1.5, 1.5] },
]
const COOLING: Row[] = [
  { label: '40–60°F', lo: 40, hi: 60, k: [0.21, 0.27], meanF: 75, t: [0.5, 0.5, 1, 1, 1] },
  { label: 'below 40°F', lo: -Infinity, hi: 39.9999, k: [0.2, 0.26], meanF: 50, t: [0.5, 1, 1, 1, 1.5] },
]

/** IECC 2021 Table C403.12.3 (C1): 90.1's thicknesses; the 105–140°F row's conductivity range is 0.21–0.28. */
const IECC_HEATING: Row[] = HEATING.map((r) => (r.lo === 105 ? { ...r, k: [0.21, 0.28] as [number, number] } : r))

/**
 * Residential pipe R-value, IECC 2024 Table C403.13.3(1) definition (C3):
 * R = ro·ln(ro/ri)/k, with k the insulation's at 75°F mean (how product R-values are rated).
 */
export function pipeR(pipeOdIn: number, thicknessIn: number, kIp: number) {
  const ri = pipeOdIn / 2
  const ro = ri + thicknessIn
  return (ro * Math.log(ro / ri)) / kIp
}

const npsValue = (nps: string) => nps.split('-').reduce((sum, part) => {
  const [a, b] = part.split('/').map(Number)
  return sum + (b ? a / b : a)
}, 0)

const column = (nps: number) => (nps < 1 ? 0 : nps < 1.5 ? 1 : nps < 4 ? 2 : nps < 8 ? 3 : 4)

export type PipeCodeBasis = 'ashrae' | 'iecc' | 'iecc-res'

export const PIPE_CODES: { id: PipeCodeBasis; label: string; hint: string }[] = [
  { id: 'ashrae', label: 'ASHRAE 90.1', hint: 'ASHRAE 90.1-2019 Tables 6.8.3-1/-2 (commercial)' },
  { id: 'iecc', label: 'IECC commercial', hint: 'IECC 2021 Table C403.12.3' },
  { id: 'iecc-res', label: 'IECC residential', hint: 'IECC 2021 R403.4: R-3 above 105°F or below 55°F' },
]

export interface CodeMinimum {
  edition: string
  /** Residential: the rule is an R-value, not a table thickness. */
  minR?: number
  table: string
  row: string
  /** Table thickness for this size and temperature, in. */
  tableIn: number
  /** This material's k at the row's mean rating temperature, and the row's range. */
  K: number
  kRange: [number, number]
  meanF: number
  /** Minimum thickness for this material (corrected when K is outside the range), in. */
  minIn: number
  corrected: boolean
  src: string[]
}

export function codeMinimum(s: SimState, mode: SimMode): CodeMinimum | { none: string } {
  const basis = s.pipeCodeBasis ?? 'ashrae'
  const name = basis === 'ashrae' ? 'ASHRAE 90.1' : 'IECC'
  if (mode === 'condensate') return { none: `${name} pipe insulation rules cover heating, hot-water, chilled-water, brine and refrigerant piping — not condensate drains.` }
  const T = s.processF
  const p0 = pipeSpec(s.pipe, s.npsIndex)
  if (basis === 'iecc-res') {
    // R403.4: "greater than 105°F (41°C) or less than 55°F (13°C) shall be insulated to an R-value of not less than R-3"
    if (T <= 105 && T >= 55) return { none: 'IECC residential R403.4 covers piping above 105°F or below 55°F.' }
    const K = kAt(curveFrom(productFor(s).k), ((75 - 32) * 5) / 9 + 273.15) / 0.144227888
    let lo = 0
    let hi = 6
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2
      if (pipeR(p0.od, mid, K) >= 3) hi = mid
      else lo = mid
    }
    return {
      edition: 'IECC 2021 residential', minR: 3, table: 'R403.4', row: T > 105 ? 'above 105°F' : 'below 55°F',
      tableIn: hi, K, kRange: [K, K], meanF: 75, minIn: hi, corrected: false, src: ['C2', 'C3'],
    }
  }
  const rows = mode === 'hot' ? (basis === 'iecc' ? IECC_HEATING : HEATING) : COOLING
  if (mode === 'hot' && T < 105) return { none: `Below the 105°F bottom of the ${name} heating table.` }
  if (mode === 'cold' && T > 60) return { none: `Above the 60°F top of the ${name} cooling table.` }
  const row = rows.find((r) => T >= r.lo && T <= r.hi)
  if (!row) return { none: 'Outside the 90.1 table ranges.' }
  const p = pipeSpec(s.pipe, s.npsIndex)
  const tableIn = row.t[column(npsValue(p.nps))]
  const curve = curveFrom(productFor(s).k)
  const K = kAt(curve, ((row.meanF - 32) * 5) / 9 + 273.15) / 0.144227888
  const r = p.od / 2
  const outside = K > row.k[1] || K < row.k[0]
  const minIn = outside ? r * ((1 + tableIn / r) ** (K / row.k[1]) - 1) : tableIn
  if (basis === 'iecc') {
    return { edition: 'IECC 2021 commercial', table: 'Table C403.12.3', row: row.label, tableIn, K, kRange: row.k, meanF: row.meanF, minIn, corrected: outside, src: ['C1'] }
  }
  return {
    edition: 'ASHRAE 90.1-2019',
    table: mode === 'hot' ? 'Table 6.8.3-1' : 'Table 6.8.3-2',
    row: row.label,
    tableIn,
    K,
    kRange: row.k,
    meanF: row.meanF,
    minIn,
    corrected: outside,
    src: ['R30'],
  }
}
