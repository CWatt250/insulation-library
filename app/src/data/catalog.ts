import type * as THREE from 'three'

/**
 * How each insulation looks and goes together in the field. Specs (temperatures,
 * k-values, ASTM) live in specs.ts and come only from verified data sheets.
 */

export type InsulationId = 'calsil' | 'fiberglass' | 'mineral-wool' | 'cellular-glass' | 'elastomeric' | 'phenolic'
export type JacketId = 'none' | 'asj' | 'fsk' | 'pvc' | 'alu-smooth' | 'alu-stucco' | 'ss'

type MatParams = THREE.MeshPhysicalMaterialParameters & { normalStrength?: number }

export interface InsulationVisual {
  id: InsulationId
  label: string
  swatch: string
  skin: { tex: string; params?: MatParams }
  cut: { tex: string; params?: MatParams }
  bore?: { tex: string; params?: MatParams }
  /** Wound fibrous pipe sections show concentric layers on their cut ends. */
  layered: boolean
  /** halves = two half-shells (joints 3 & 9 o'clock); hinged = one split + hinge; tube = slit tube. */
  pieces: 'halves' | 'hinged' | 'tube'
  sectionIn: number
  rigid: boolean
  hot: boolean
  jackets: JacketId[]
  maxThicknessIn: number
  /** Cut-edge softness in metres: rigid board is crisp, foams round over. */
  edge: number
}

const fiberSheen = (color: string): MatParams => ({ sheen: 0.3, sheenColor: color, sheenRoughness: 0.8 })

export const INSULATIONS: InsulationVisual[] = [
  {
    id: 'calsil',
    label: 'Calcium Silicate',
    swatch: '#d3cbbd',
    skin: { tex: 'calsil-molded' },
    cut: { tex: 'calsil-cut' },
    layered: false,
    pieces: 'halves',
    sectionIn: 36,
    rigid: true,
    hot: true,
    jackets: ['alu-smooth', 'alu-stucco', 'ss', 'none'],
    maxThicknessIn: 4,
    edge: 0.0006,
  },
  {
    id: 'fiberglass',
    label: 'Fiberglass',
    swatch: '#e9c552',
    skin: { tex: 'fiberglass-skin', params: fiberSheen('#f7e3a0') },
    cut: { tex: 'fiberglass-cut', params: { ...fiberSheen('#f7e3a0'), normalStrength: 0.9 } },
    bore: { tex: 'fiberglass-bore', params: fiberSheen('#f7e3a0') },
    layered: true,
    pieces: 'hinged',
    sectionIn: 36,
    rigid: false,
    hot: true,
    jackets: ['asj', 'pvc', 'alu-smooth', 'alu-stucco', 'ss', 'none'],
    maxThicknessIn: 4,
    edge: 0.0012,
  },
  {
    id: 'mineral-wool',
    label: 'Mineral Wool',
    swatch: '#bcae7c',
    skin: { tex: 'mineralwool-skin', params: { sheen: 0.25, sheenColor: '#d8cfa8', sheenRoughness: 0.85 } },
    cut: { tex: 'mineralwool-cut', params: { sheen: 0.25, sheenColor: '#d8cfa8', sheenRoughness: 0.85 } },
    layered: true,
    pieces: 'hinged',
    sectionIn: 36,
    rigid: true,
    hot: true,
    jackets: ['alu-smooth', 'alu-stucco', 'ss', 'asj', 'none'],
    maxThicknessIn: 4,
    edge: 0.0012,
  },
  {
    id: 'cellular-glass',
    label: 'Cellular Glass',
    swatch: '#47453f',
    skin: { tex: 'cellglass-skin', params: { normalStrength: 0.8 } },
    cut: { tex: 'cellglass-cut', params: { ior: 1.5 } },
    layered: false,
    pieces: 'halves',
    sectionIn: 24,
    rigid: true,
    hot: false,
    jackets: ['alu-smooth', 'alu-stucco', 'ss', 'pvc', 'none'],
    maxThicknessIn: 4,
    edge: 0.0005,
  },
  {
    id: 'elastomeric',
    label: 'Elastomeric Foam',
    swatch: '#262524',
    skin: { tex: 'elastomeric-skin', params: { normalStrength: 0.8, clearcoat: 0.15, clearcoatRoughness: 0.5 } },
    cut: { tex: 'elastomeric-cut' },
    layered: false,
    pieces: 'tube',
    sectionIn: 72,
    rigid: false,
    hot: false,
    jackets: ['none', 'pvc', 'alu-smooth'],
    maxThicknessIn: 2,
    edge: 0.002,
  },
  {
    id: 'phenolic',
    label: 'Phenolic Foam',
    swatch: '#e89a84',
    skin: { tex: 'phenolic-cut', params: { normalStrength: 0.7 } },
    cut: { tex: 'phenolic-cut', params: { normalStrength: 0.7 } },
    layered: false,
    pieces: 'hinged',
    sectionIn: 36,
    rigid: true,
    hot: false,
    jackets: ['fsk', 'pvc', 'alu-smooth', 'alu-stucco', 'ss', 'none'],
    maxThicknessIn: 4,
    edge: 0.0008,
  },
]

export const INSULATION = Object.fromEntries(INSULATIONS.map((i) => [i.id, i])) as Record<InsulationId, InsulationVisual>

export interface JacketVisual {
  id: JacketId
  label: string
  metal: boolean
  /** Sheet thickness (m) for non-metal jackets; metal uses the gauge tables. */
  t?: number
  sheetIn: number
  circLapIn: number
  longLapIn: number
  /** Width of the butt strip over each joint (factory jackets). */
  buttStripIn?: number
  bands: boolean
  /** How the elbow is covered. */
  elbow: 'gores' | 'fitting-cover' | 'taped-gores' | 'none'
}

export const JACKETS: Record<JacketId, JacketVisual> = {
  'alu-smooth': { id: 'alu-smooth', label: 'Aluminum – smooth', metal: true, sheetIn: 36, circLapIn: 2, longLapIn: 2, bands: true, elbow: 'gores' },
  'alu-stucco': { id: 'alu-stucco', label: 'Aluminum – stucco', metal: true, sheetIn: 36, circLapIn: 2, longLapIn: 2, bands: true, elbow: 'gores' },
  ss: { id: 'ss', label: 'Stainless steel', metal: true, sheetIn: 36, circLapIn: 2, longLapIn: 2, bands: true, elbow: 'gores' },
  asj: { id: 'asj', label: 'ASJ (all-service jacket)', metal: false, t: 0.0003, sheetIn: 36, circLapIn: 0, longLapIn: 1.5, buttStripIn: 3, bands: false, elbow: 'fitting-cover' },
  fsk: { id: 'fsk', label: 'Foil-scrim facing', metal: false, t: 0.00015, sheetIn: 36, circLapIn: 0, longLapIn: 1.5, buttStripIn: 3, bands: false, elbow: 'taped-gores' },
  pvc: { id: 'pvc', label: 'PVC jacket', metal: false, t: 0.0005, sheetIn: 36, circLapIn: 1, longLapIn: 1.5, bands: false, elbow: 'fitting-cover' },
  none: { id: 'none', label: 'None (bare)', metal: false, sheetIn: 36, circLapIn: 0, longLapIn: 0, bands: false, elbow: 'none' },
}
