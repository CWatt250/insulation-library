import { INSULATION } from '../../data/catalog'
import type { Design } from '../../sim/design'
import { ratedR } from '../../sim/duct'
import { evaluateSide } from '../../sim/model'
import type { SimMode, SimState } from '../../sim/types'
import { fmt, type UnitSystem } from '../../sim/units'

/** "Governed by energy code, WSEC": the requirement's name in a sentence, acronyms kept. */
export function governedBy(label: string) {
  const name = label.split(':')[0].trim()
  return /^[A-Z][a-z]/.test(name) ? name[0].toLowerCase() + name.slice(1) : name
}

/**
 * Why no thickness works: what the blocking requirement needs, or what the
 * thickest size made still gives, so "beyond its range" isn't the whole answer.
 */
export function shortfall(s: SimState, mode: SimMode, d: Design, units: UnitSystem): string {
  const blocked = d.rows.find((r) => r.rec.thicknessIn === null)
  if (!blocked) return ''
  const T = (f: number) => fmt.temp(f, units)
  const max = fmt.thick(d.maxIn, units)
  const what = s.system === 'duct' ? 'this insulation' : INSULATION[s.insulation].label.toLowerCase()
  const g = blocked.c.goal
  if (g.kind === 'minThickness') return `The energy code needs ${fmt.thick(Math.round(g.in * 10) / 10, units)} of ${what}; it is made up to ${max}.`
  if (g.kind === 'minR') return `The energy code needs R-${g.R}; the thickest ${what} (${max}) is R-${ratedR(s.ductIns, d.maxIn, s.ductShape).toFixed(1)}.`
  const at = evaluateSide(s, mode, d.maxIn)
  const r = at.result
  if (g.kind === 'surfaceMax') return `Even at ${max}, the most it is made in, the surface is ${T(r.surfaceF)} — over the ${T(g.F)} limit.`
  if (g.kind === 'surfaceMin') return `Even at ${max}, the most it is made in, the surface is ${T(r.surfaceF)} — under ${T(g.F)}.`
  if (g.kind === 'noCondensation') return `Even at ${max}, the most it is made in, the surface (${T(r.surfaceF)}) stays too close to the ${T(at.moisture.dewF)} dew point.`
  if (g.kind === 'qMax') return `Even at ${max}, the most it is made in, the heat flow is ${fmt.flow(Math.abs(r.qBtuHrFt), units)} ${fmt.flowUnit(units)} — over the ${fmt.flow(g.btuHrFt, units)} target.`
  return `It can't get there within ${max}.`
}
