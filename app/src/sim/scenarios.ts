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
const MODES: SimMode[] = ['hot', 'cold', 'condensate']

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
