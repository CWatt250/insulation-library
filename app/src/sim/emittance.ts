import { INSULATION, type FacingId, type InsulationId, type OuterJacketId } from '../data/catalog'
import type { MetalFinish } from './types'

/**
 * Outer-surface emittance and surface temperature limits.
 * Emittance: research/emittance-verified.json (E-ids). The app uses the 3E Plus
 * v4.1 built-in list (E1) wherever it has an entry, so results line up with
 * 3E Plus; other sources that agree are listed alongside.
 * Limits: research/jackets-verified.json (J-ids).
 * A test fails if any entry has no source.
 */
export interface SurfaceRef {
  key: string
  label: string
  value: number
  /** Source ids for the emittance. */
  src: string[]
  note?: string
  /** Published maximum surface temperature for this finish, °F. */
  maxSurfaceF?: number
  /** Source ids for the limit. */
  limitSrc?: string[]
}

export const SURFACES: Record<string, SurfaceRef> = {
  steel: { key: 'steel', label: 'Bare steel pipe', value: 0.8, src: ['E1', 'E2'], note: '3E Plus "Steel"; ASHRAE "iron or steel"' },
  copper: { key: 'copper', label: 'Bare copper tube', value: 0.6, src: ['E1'], note: '3E Plus "Copper" (condition not stated); ASHRAE: 0.03 highly polished, 0.8 oxidized (E2)' },
  'pvc-pipe': { key: 'pvc-pipe', label: 'Bare PVC pipe', value: 0.9, src: ['E2'], note: 'ASHRAE "plastic pipe or jacket (PVC, PVDC, or PET)"' },
  asj: { key: 'asj', label: 'ASJ facing', value: 0.9, src: ['E1', 'E2', 'E5'], maxSurfaceF: 150, limitSrc: ['J24'] },
  pvc: { key: 'pvc', label: 'PVC jacket', value: 0.9, src: ['E1', 'E2'], maxSurfaceF: 150, limitSrc: ['J1', 'J2', 'J6'] },
  'alu-oxidized': { key: 'alu-oxidized', label: 'Aluminum jacket (oxidized, in service)', value: 0.1, src: ['E1', 'E8'], maxSurfaceF: 180, limitSrc: ['J17'], note: 'Limit is the polyfilm liner, 180°F long-term' },
  'alu-bright': { key: 'alu-bright', label: 'Aluminum jacket (new, bright)', value: 0.04, src: ['E1', 'E10'], maxSurfaceF: 180, limitSrc: ['J17'], note: 'Limit is the polyfilm liner, 180°F long-term' },
  'alu-painted': { key: 'alu-painted', label: 'Aluminum jacket (painted)', value: 0.8, src: ['E1', 'E9'], maxSurfaceF: 180, limitSrc: ['J17'], note: 'Limit is the polyfilm liner, 180°F long-term' },
  'ss-oxidized': { key: 'ss-oxidized', label: 'Stainless jacket (dull, in service)', value: 0.3, src: ['E1'] },
  'ss-bright': { key: 'ss-bright', label: 'Stainless jacket (new, cleaned)', value: 0.13, src: ['E1'], note: 'ASHRAE lists 0.2 for new, cleaned stainless (E2)' },
  'ss-painted': { key: 'ss-painted', label: 'Stainless jacket (painted)', value: 0.8, src: ['E1'], note: '3E Plus "Painted Metal"' },
  elastomeric: { key: 'elastomeric', label: 'Elastomeric foam skin', value: 0.9, src: ['E2'], note: 'ASHRAE "elastomeric or polyisobutylene"; Armacell lists 0.93 (E15)' },
  nonmetallic: { key: 'nonmetallic', label: 'Bare insulation surface', value: 0.9, src: ['E3', 'E14'], note: 'NIA calculator "No jacket"; BS 5422 non-metallic basis' },
  'membrane-white': { key: 'membrane-white', label: 'White vapor-retarder membrane', value: 0.8, src: ['E16', 'E19'], note: 'Generic: K-FLEX CLAD WT 0.80, Alumaguard Cool Wrap 0.82 — no value published for the membrane drawn' },
  'membrane-foil': { key: 'membrane-foil', label: 'Foil-faced vapor-retarder membrane', value: 0.05, src: ['E13', 'E14', 'E15'], note: 'Generic aluminum-foil value — no value published for PITTWRAP IW50 AL' },
}

export const BARE_PIPE = SURFACES.steel

export const barePipe = (pipe: 'steel' | 'copper' | 'pvc' = 'steel') => (pipe === 'copper' ? SURFACES.copper : pipe === 'pvc' ? SURFACES['pvc-pipe'] : SURFACES.steel)

export function outerSurface(p: { insulation: InsulationId; jacket: OuterJacketId; facing: FacingId; membrane: boolean; metalFinish: MetalFinish }): SurfaceRef {
  if (p.jacket === 'alu-smooth' || p.jacket === 'alu-stucco') return SURFACES[`alu-${p.metalFinish}`]
  if (p.jacket === 'ss') return SURFACES[`ss-${p.metalFinish}`]
  if (p.jacket === 'pvc') return SURFACES.pvc
  if (p.membrane) return INSULATION[p.insulation].vapor.membrane?.look === 'foil' ? SURFACES['membrane-foil'] : SURFACES['membrane-white']
  if (p.facing === 'asj') return SURFACES.asj
  if (p.insulation === 'elastomeric') return SURFACES.elastomeric
  return SURFACES.nonmetallic
}
