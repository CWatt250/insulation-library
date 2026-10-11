import { INSULATION, INSULATIONS } from '../data/catalog'
import type { PipeMaterial } from '../data/pipe'
import { availability, evaluate, productForTemp } from './model'
import { design, materialOptions } from './design'
import { DUCT_INSULATIONS, ductThicknesses, type DuctInsulation } from './duct'
import { initialState } from './presets'
import type { SimMode, SimState } from './types'

/**
 * Recommendations: a few answers → the simulator state, the design thickness
 * for the chosen (or thinnest) insulation, and the alternatives. Uses the same
 * design rules as the simulator (every requirement solved, largest governs).
 */
export type System = 'pipe' | 'duct'

/** Quick fills from the presets (their temperatures carry the presets' sources). */
export const PIPE_USES: { id: string; label: string }[] = [
  { id: 'chws', label: 'Chilled water' },
  { id: 'suction', label: 'Refrigerant suction' },
  { id: 'cd-drain', label: 'Condensate drain' },
  { id: 'dcw', label: 'Domestic cold water' },
  { id: 'dhw', label: 'Domestic hot water' },
  { id: 'lthw', label: 'Heating hot water' },
  { id: 'steam', label: 'Steam' },
]

export interface Answers {
  system: System
  pipe: PipeMaterial
  npsIndex: number
  /** Pipe carries condensate (a drain): sized for sweating only. */
  drain: boolean
  outdoors: boolean
  processF: number
  ambientF: number
  rh: number
  /** Chosen insulation, or 'auto' = the thinnest that meets everything. */
  material: string
  duct: Pick<SimState, 'ductType' | 'ductLocation' | 'ductService' | 'climateZone' | 'ductCodeBasis' | 'ductShape' | 'ductW' | 'ductH' | 'ductD'>
}

export const START: Answers = {
  system: 'pipe', pipe: 'copper', npsIndex: 3, drain: false, outdoors: false,
  processF: 45, ambientF: 85, rh: 70, material: 'auto',
  duct: { ductType: 'supply', ductLocation: 'attic', ductService: 'both', climateZone: 4, ductCodeBasis: 'ashrae', ductShape: 'rect', ductW: 24, ductH: 12, ductD: 14 },
}

/** The simulator mode these answers belong to. */
export function modeFor(a: Answers): SimMode {
  if (a.system === 'duct') return 'duct'
  if (a.drain) return 'condensate'
  return a.processF >= a.ambientF ? 'hot' : 'cold'
}

/** A full simulator state from the answers, for one insulation. */
export function stateFor(a: Answers, mode: SimMode, material: string): SimState {
  const base = initialState(mode)
  if (a.system === 'duct') {
    const id = material as DuctInsulation
    const list = ductThicknesses(id)
    return { ...base, ...a.duct, system: 'duct', ductIns: id, thicknessIn: list[0], processF: a.processF, ambientF: a.ambientF, rh: a.rh, windMph: 0, presetId: null }
  }
  const ins = INSULATION[material as keyof typeof INSULATION]
  // outdoors: a metal jacket where the material offers one (weather protection)
  const outdoorJacket = ins.jackets.find((j) => j === 'alu-smooth') ?? ins.jackets.find((j) => j === 'pvc') ?? ins.jackets[0]
  return {
    ...base, system: 'pipe', pipe: a.pipe, npsIndex: a.npsIndex, component: 'straight', presetId: null,
    processF: a.processF, ambientF: a.ambientF, rh: a.rh, windMph: 0,
    insulation: ins.id, kProduct: productForTemp(ins.id, a.processF),
    jacket: a.outdoors ? outdoorJacket : ins.jackets[0], facing: ins.facings[0], thicknessIn: 1,
    applyCode: true,
  }
}

export function materialsFor(a: Answers, mode: SimMode): { id: string; label: string; ok: boolean; reason?: string }[] {
  if (a.system === 'duct') return DUCT_INSULATIONS.map((m) => ({ id: m.id, label: m.label, ok: true }))
  return INSULATIONS.map((m) => {
    const av = availability(m.id, mode === 'condensate' ? 'cold' : mode)
    return { id: m.id, label: m.label, ok: av.ok, reason: av.reason }
  })
}


/** The recommendation for a set of answers. */
export function recommendation(a: Answers) {
  const mode = modeFor(a)
  const options = materialOptions(stateFor(a, mode, a.system === 'duct' ? 'wrap75' : 'fiberglass'), mode)
  const usable = options.filter((o) => o.design && o.design.thicknessIn !== null)
  const pick = a.material === 'auto' ? usable[0]?.id ?? options[0].id : a.material
  const s0 = stateFor(a, mode, pick)
  const d = design(s0, mode)
  const s = d.thicknessIn !== null ? { ...s0, thicknessIn: d.thicknessIn } : s0
  const ev = evaluate(s, mode)
  return { mode, options, pick, s, d, ev }
}
