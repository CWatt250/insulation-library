import type { ClimateStation } from '../data/waClimate'
import { ductEnergy, monthSpan, pipeOutdoor, type SeasonPart } from './ductEnergy'
import type { Evaluation } from './model'
import type { SimMode, SimState } from './types'

/**
 * The parts of a year the Savings tab and the savings proposal price: a pipe's whole run
 * (indoors at the Setup air, or outdoors at Washington weather), or each duct season.
 */
export interface SavingsPart {
  key: string
  /** "Cooling season, Jun–Sep", "Outdoors, all year"; empty for an indoor pipe. */
  title: string
  mode: 'hot' | 'cold'
  hours: number
  /** Heat flow that costs energy, Btu/hr·ft, bare and insulated. */
  qBare: number
  qIns: number
  word: 'lost' | 'gained'
  season?: SeasonPart
}

export type SavingsPlan =
  | { kind: 'none'; title: string; why: string }
  | { kind: 'parts'; parts: SavingsPart[]; station?: ClimateStation }

const cap = (w: string) => w[0].toUpperCase() + w.slice(1)
export const seasonTitle = (p: SeasonPart) => (p.season === 'run' ? `Outdoors, ${monthSpan(p.months)}` : `${cap(p.season)} season, ${monthSpan(p.months)}`)

export function savingsPlan(s: SimState, mode: SimMode, ev: Evaluation): SavingsPlan {
  const fromSeason = (p: SeasonPart): SavingsPart => ({ key: p.season, title: seasonTitle(p), mode: p.mode, hours: p.hours, qBare: p.qBare, qIns: p.qIns, word: p.mode === 'hot' ? 'lost' : 'gained', season: p })
  if (s.system === 'duct') {
    const de = ductEnergy(s)
    return de.kind === 'none' ? de : { kind: 'parts', parts: de.parts.map(fromSeason), station: de.station }
  }
  const m = mode === 'hot' ? 'hot' : 'cold'
  if (s.pipeOutdoors && (mode === 'hot' || mode === 'cold')) {
    const po = pipeOutdoor(s, m)
    return { kind: 'parts', parts: [fromSeason(po.part)], station: po.station }
  }
  return { kind: 'parts', parts: [{ key: 'pipe', title: '', mode: m, hours: s.hours, qBare: Math.abs(ev.bare.result.qBtuHrFt), qIns: Math.abs(ev.ins.result.qBtuHrFt), word: m === 'hot' ? 'lost' : 'gained' }] }
}
