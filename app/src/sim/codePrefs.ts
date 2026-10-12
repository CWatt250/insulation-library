import { WA_COUNTIES } from '../data/wsecData'
import type { SimState } from './types'

/**
 * The energy code (pipes and ducts) and Washington county last picked,
 * remembered on this device. Until one is picked: the Washington State Energy
 * Code, King County. Engine defaults (presets.ts, recommend.ts) stay ASHRAE so
 * tests and shared files are unaffected; this only seeds what the UI opens with.
 */
export type CodePrefs = Pick<SimState, 'pipeCodeBasis' | 'ductCodeBasis' | 'waCounty'>

const KEY = 'il.codes'
const PIPE: SimState['pipeCodeBasis'][] = ['ashrae', 'iecc', 'iecc-res', 'wsec', 'wsec-res']
const DUCT: SimState['ductCodeBasis'][] = ['ashrae', 'iecc', 'wsec']
export const DEFAULT_CODES: CodePrefs = { pipeCodeBasis: 'wsec', ductCodeBasis: 'wsec', waCounty: 'King' }

export function loadCodes(): CodePrefs {
  const out = { ...DEFAULT_CODES }
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<CodePrefs> | null
    if (v && PIPE.includes(v.pipeCodeBasis!)) out.pipeCodeBasis = v.pipeCodeBasis!
    if (v && DUCT.includes(v.ductCodeBasis!)) out.ductCodeBasis = v.ductCodeBasis!
    if (v && WA_COUNTIES.some((c) => c.county === v.waCounty)) out.waCounty = v.waCounty!
  } catch { /* private mode or bad JSON: defaults */ }
  return out
}

/** The code fields in a state change, or null when it has none. */
export function codesIn(patch: Partial<SimState>): Partial<CodePrefs> | null {
  const out: Partial<CodePrefs> = {}
  if (patch.pipeCodeBasis !== undefined) out.pipeCodeBasis = patch.pipeCodeBasis
  if (patch.ductCodeBasis !== undefined) out.ductCodeBasis = patch.ductCodeBasis
  if (patch.waCounty !== undefined) out.waCounty = patch.waCounty
  return Object.keys(out).length ? out : null
}

export function saveCodes(patch: Partial<CodePrefs>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadCodes(), ...patch }))
  } catch { /* private mode: not remembered */ }
}
