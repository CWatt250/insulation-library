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

const npsValue = (nps: string) => nps.split('-').reduce((sum, part) => {
  const [a, b] = part.split('/').map(Number)
  return sum + (b ? a / b : a)
}, 0)

const column = (nps: number) => (nps < 1 ? 0 : nps < 1.5 ? 1 : nps < 4 ? 2 : nps < 8 ? 3 : 4)

export interface CodeMinimum {
  edition: string
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
  if (mode === 'condensate') return { none: 'ASHRAE 90.1 tables cover heating, hot-water, chilled-water, brine and refrigerant piping — not condensate drains.' }
  const T = s.processF
  const rows = mode === 'hot' ? HEATING : COOLING
  if (mode === 'hot' && T < 105) return { none: 'Below the 105°F bottom of the 90.1 heating table.' }
  if (mode === 'cold' && T > 60) return { none: 'Above the 60°F top of the 90.1 cooling table.' }
  const row = rows.find((r) => T >= r.lo && T <= r.hi)
  if (!row) return { none: 'Outside the 90.1 table ranges.' }
  const p = pipeSpec(s.pipe, s.npsIndex)
  const tableIn = row.t[column(npsValue(p.nps))]
  const curve = curveFrom(productFor(s).k)
  const K = kAt(curve, ((row.meanF - 32) * 5) / 9 + 273.15) / 0.144227888
  const r = p.od / 2
  const outside = K > row.k[1] || K < row.k[0]
  const minIn = outside ? r * ((1 + tableIn / r) ** (K / row.k[1]) - 1) : tableIn
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
