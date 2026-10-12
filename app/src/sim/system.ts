import { INSULATION, INSULATIONS } from '../data/catalog'
import { DUCT_INSULATIONS, ductInsLabel, type DuctInsulation } from './duct'
import { stateForDuctMaterial, stateForMaterial } from './design'
import { thicknessOptions } from './model'
import type { InsulationId } from '../data/catalog'
import type { SimMode, SimState } from './types'

/** What the UI calls the thing being insulated. */
export const noun = (s: SimState) => (s.system === 'duct' ? 'duct' : 'pipe')
export const Noun = (s: SimState) => (s.system === 'duct' ? 'Duct' : 'Pipe')

export type MaterialId = InsulationId | DuctInsulation

/** Insulations on offer for this system. */
export function materials(s: SimState): { id: MaterialId; label: string }[] {
  return s.system === 'duct' ? DUCT_INSULATIONS.map((m) => ({ id: m.id, label: ductInsLabel(m.id, s.ductShape) })) : INSULATIONS.map((m) => ({ id: m.id, label: m.label }))
}

export const currentMaterial = (s: SimState): MaterialId => (s.system === 'duct' ? s.ductIns : s.insulation)

export function materialLabel(s: SimState, id: MaterialId = currentMaterial(s)) {
  return s.system === 'duct' ? ductInsLabel(id as DuctInsulation, s.ductShape) : INSULATION[id as InsulationId]?.label ?? id
}

export function maxThickness(s: SimState) {
  const o = thicknessOptions(s)
  return s.system === 'duct' ? o[o.length - 1] : INSULATION[s.insulation].maxThicknessIn
}

/** The current system redone in another insulation of the same system. */
export function stateForAny(s: SimState, mode: SimMode, id: MaterialId) {
  return s.system === 'duct' ? stateForDuctMaterial(s, id as DuctInsulation) : stateForMaterial(s, mode, id as InsulationId)
}
