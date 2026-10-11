import type * as THREE from 'three'

/**
 * How each insulation looks and goes together in the field. Specs (temperatures,
 * k-values, ASTM) live in specs.ts and come only from verified data sheets.
 */

export type InsulationId = 'calsil' | 'fiberglass' | 'mineral-wool' | 'cellular-glass' | 'elastomeric' | 'phenolic'
/** Sheet systems. 'asj' and 'fsk' are factory facings; the rest are field-applied outer jackets. */
export type JacketId = 'none' | 'asj' | 'fsk' | 'pvc' | 'alu-smooth' | 'alu-stucco' | 'ss'
/** Outer jackets offered in the UI ('none' = the facing, or the bare insulation, is the finish). */
export type OuterJacketId = Exclude<JacketId, 'asj' | 'fsk'>
export type FacingId = 'none' | 'asj'
export type ServiceId = 'hot' | 'cold'
/** The build-up, inside to out. 'blanket' is the removable valve cover. */
export type LayerId = 'pipe' | 'insulation' | 'facing' | 'vapor' | 'jacket' | 'blanket'
export const LAYER_ORDER: LayerId[] = ['pipe', 'insulation', 'facing', 'vapor', 'jacket', 'blanket']

/**
 * How a cold (below-ambient) system gets its vapor retarder, per the sources in
 * research/materials-verified.json:
 *  facing   → the factory ASJ, sealed at every lap and butt joint, is the retarder
 *  integral → closed-cell material is its own retarder (seams glued)
 *  membrane → a separate retarder (wrap, film or coating) over the insulation
 */
export type VaporKind = 'facing' | 'integral' | 'membrane'

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
  /** Hot / cold service the sources support; the first is the default. */
  services: ServiceId[]
  /** Factory facings offered; the first is the default. */
  facings: FacingId[]
  /** Outer jackets offered; the first is the default. */
  jackets: OuterJacketId[]
  /**
   * Cold service vapor retarder; `membraneUnder` = jackets that need a separate membrane even with a
   * facing; `membrane` = the product drawn (research/jackets-verified.json).
   */
  vapor: { kind: VaporKind; membraneUnder?: OuterJacketId[]; membrane?: { name: string; mil: number; look: 'white' | 'foil' | 'black' } }
  maxThicknessIn: number
  /** Thicker than this goes on in two layers (JM: over 3"; Resolco phenolic: over 2-1/2"). */
  maxSingleLayerIn: number
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
    services: ['hot'],
    facings: ['none'],
    jackets: ['alu-smooth', 'alu-stucco', 'ss', 'none'],
    vapor: { kind: 'membrane' },
    maxThicknessIn: 4,
    maxSingleLayerIn: 3,
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
    services: ['hot', 'cold'],
    facings: ['asj', 'none'],
    jackets: ['none', 'pvc', 'alu-smooth', 'alu-stucco', 'ss'],
    vapor: { kind: 'facing' },
    maxThicknessIn: 4,
    maxSingleLayerIn: 3,
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
    services: ['hot'],
    facings: ['none'],
    jackets: ['alu-smooth', 'alu-stucco', 'ss', 'pvc', 'none'],
    vapor: { kind: 'membrane' },
    maxThicknessIn: 4,
    maxSingleLayerIn: 3,
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
    services: ['cold', 'hot'],
    facings: ['none'],
    jackets: ['alu-smooth', 'alu-stucco', 'ss', 'pvc', 'none'],
    // OC system jacket: PITTWRAP IW50 AL (50 mil, silver), under metal or a UV-resistant jacket
    vapor: { kind: 'membrane', membrane: { name: 'PITTWRAP IW50 AL', mil: 50, look: 'foil' } },
    maxThicknessIn: 4,
    maxSingleLayerIn: 3,
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
    services: ['cold', 'hot'],
    facings: ['none'],
    jackets: ['none', 'pvc', 'alu-smooth'],
    vapor: { kind: 'integral' },
    maxThicknessIn: 2,
    maxSingleLayerIn: 3,
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
    services: ['cold', 'hot'],
    facings: ['asj'],
    jackets: ['none', 'pvc', 'alu-smooth', 'alu-stucco', 'ss'],
    // Resolco outdoor spec: Insulrap 30 under the aluminum (30-NG: 30 mil, white)
    vapor: { kind: 'facing', membraneUnder: ['alu-smooth', 'alu-stucco', 'ss'], membrane: { name: 'Polyguard Insulrap 30-NG', mil: 30, look: 'white' } },
    maxThicknessIn: 4,
    maxSingleLayerIn: 2.5,
    edge: 0.0008,
  },
]

/** Number of insulation layers for a thickness. */
export const layerCount = (ins: InsulationVisual, thicknessIn: number) => (thicknessIn > ins.maxSingleLayerIn ? 2 : 1)

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
