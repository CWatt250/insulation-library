import { ductOutdoors, ductThicknesses, outdoorIns } from './duct'
import { initialState } from './presets'
import type { SimMode, SimState } from './types'

/**
 * Saved scenarios live in this browser (localStorage), and any scenario can be
 * shared as a link (#s=<base64url JSON>) or exported/imported as a JSON file.
 * Loading merges onto current defaults, so links from older versions still open.
 */
export interface Scenario {
  id: string
  name: string
  mode: SimMode
  state: SimState
  savedAt: string
}

const KEY = 'insulation-library.scenarios.v1'
const MODES: SimMode[] = ['hot', 'cold', 'condensate', 'duct']

export function loadScenarios(): Scenario[] {
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? (JSON.parse(raw) as Scenario[]) : []
    return Array.isArray(list) ? list.filter((x) => x && MODES.includes(x.mode)).map((x) => ({ ...x, state: normalize(x.mode, x.state) })) : []
  } catch {
    return []
  }
}

export function storeScenarios(list: Scenario[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
    return true
  } catch {
    return false
  }
}

/** Fill any fields a saved state lacks (older versions) from the mode's defaults. */
export function normalize(mode: SimMode, state: Partial<SimState>): SimState {
  const base = initialState(mode)
  const out = { ...base }
  for (const k of Object.keys(base) as (keyof SimState)[]) {
    const v = state[k]
    if (v !== undefined && typeof v === typeof base[k]) (out as Record<string, unknown>)[k] = v
    else if (k === 'presetId' && (v === null || typeof v === 'string')) out.presetId = v as string | null
    else if (k === 'emittanceOverride' && (v === null || typeof v === 'number')) out.emittanceOverride = v as number | null
  }
  if (!['steel', 'copper', 'pvc'].includes(out.pipe)) out.pipe = 'steel'
  // enums from a saved or shared file: anything unknown falls back to the default
  const oneOf = <K extends keyof SimState>(k: K, ok: readonly SimState[K][]) => { if (!ok.includes(out[k])) (out as SimState)[k] = base[k] }
  oneOf('system', ['pipe', 'duct'])
  oneOf('ductShape', ['rect', 'round'])
  oneOf('ductIns', ['wrap75', 'wrap100', 'wrap150', 'board', 'polyiso'])
  oneOf('ductFacing', ['fsk', 'asj'])
  oneOf('ductFinish', ['new', 'dull'])
  oneOf('ductLocation', ['conditioned', 'indirect', 'unconditioned', 'attic', 'crawl', 'garage', 'exterior', 'buried'])
  oneOf('ductService', ['both', 'heating', 'cooling'])
  oneOf('ductType', ['supply', 'return', 'outdoor', 'exhaust'])
  oneOf('ductCodeBasis', ['ashrae', 'iecc', 'wsec'])
  oneOf('pipeCodeBasis', ['ashrae', 'iecc', 'iecc-res', 'wsec', 'wsec-res'])
  oneOf('ductDamper', ['upstream', 'downstream'])
  oneOf('fuel', ['gas', 'steam', 'electric', 'heatpump'])
  // the Ductwork tab is always ductwork; the pipe tabs always pipe
  out.system = mode === 'duct' ? 'duct' : 'pipe'
  // outdoors a duct is in rigid board under a metal jacket (older files may say otherwise)
  const outdoorOk = out.ductIns === 'board' || (out.ductIns === 'polyiso' && out.ductShape === 'rect')
  if (out.system === 'duct' && (ductOutdoors(out) ? !outdoorOk : out.ductIns === 'polyiso')) {
    const id = ductOutdoors(out) ? outdoorIns(out.ductShape) : 'wrap75'
    const list = ductThicknesses(id, out.ductShape)
    out.ductIns = id
    out.thicknessIn = list.reduce((b, x) => (Math.abs(x - out.thicknessIn) < Math.abs(b - out.thicknessIn) ? x : b), list[0])
  }
  return out
}

const b64url = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64url = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))))

export function shareHash(mode: SimMode, state: SimState, name?: string) {
  return `#s=${b64url(JSON.stringify({ v: 1, mode, name, state }))}`
}

export function readShareHash(hash: string): { mode: SimMode; state: SimState; name?: string } | null {
  const m = /[#&]s=([A-Za-z0-9_-]+)/.exec(hash)
  if (!m) return null
  try {
    const o = JSON.parse(unb64url(m[1]))
    if (!MODES.includes(o.mode)) return null
    return { mode: o.mode, state: normalize(o.mode, o.state ?? {}), name: typeof o.name === 'string' ? o.name : undefined }
  } catch {
    return null
  }
}

export function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
