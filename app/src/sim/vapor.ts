import { INSULATION } from '../data/catalog'
import { DUCT_WRAP } from '../data/ductData'
import { boardFor, isWrap } from './duct'
import { fToC } from './units'
import { pSat } from './psychro'
import { physicsMode, productFor, systemFor, type Side } from './model'
import type { SimMode, SimState } from './types'

/**
 * Vapor-retarder check for below-ambient work (research/vapor-code-verified.json):
 * the permeance the build-up's retarder publishes, against the ASHRAE guidance
 * of ≤0.02 perm (≤0.01 strongly considered below 0°F, R1/R2), and the water vapor
 * that would diffuse through it with every joint sealed:
 *   W = M · A · Δp   (perm = grain/(h·ft²·inHg); ASHRAE Fundamentals ch.25, R5; 7000 gr/lb, R14)
 * Δp runs from the room's vapor pressure to saturation at the pipe temperature,
 * where the vapor ends up condensing. A flat-layer formula on the outer area —
 * no cylindrical vapor-diffusion formula was found in the sources.
 */

export interface RetarderInfo {
  label: string
  /** Permeance, perm; null when not published. `upper` marks a "less than" value. */
  perm: number | null
  upper?: boolean
  /** Where the permeance comes from: CALC_REFS ids, or the material's own spec sources. */
  src: string[]
  materialSrc?: boolean
  note?: string
}

export interface VaporCheck {
  required: number
  requiredNote: string
  requiredSrc: string[]
  retarder: RetarderInfo
  meets: boolean | null
  /** Water vapor through the retarder, fl oz per year per 100 ft (sealed joints). */
  ozPerYearPer100ft: number | null
  /** Lines worth showing next to the check. */
  notes: string[]
}

const PA_PER_INHG = 3386.389
const OZ_PER_LB = 453.59237 / 29.5735 // water, ~1 g/mL

function retarderFor(s: SimState, mode: SimMode): RetarderInfo {
  if (s.system === 'duct') {
    if (!isWrap(s.ductIns)) {
      const f = boardFor(s.ductShape).facings[s.ductFacing]
      return { label: `${s.ductFacing.toUpperCase()} facing on the ${s.ductShape === 'round' ? 'Micro-Flex' : 'board'}`, perm: f.perm, upper: s.ductShape !== 'round', src: f.src, note: f.note }
    }
    return { label: 'FSK facing on the duct wrap', perm: DUCT_WRAP.facingPerm, src: DUCT_WRAP.src, note: '0.02 perms (ASTM E96 Procedure A, facing before lamination; JM: "After lamination, permeance values may be higher")' }
  }
  const sys = systemFor(s, mode)
  const id = s.insulation
  const product = productFor(s).name
  if (sys.vaporBy === 'facing') {
    const oc = /Owens Corning/.test(product)
    return { label: oc ? 'OC ASJ Max facing' : 'JM ASJ facing', perm: oc ? 0.01 : 0.02, upper: !oc, src: [oc ? 'R22' : 'R23'] }
  }
  if (sys.vaporBy === 'integral') {
    const t = s.thicknessIn
    if (id === 'elastomeric') {
      if (/K-FLEX/.test(product)) return { label: `K-FLEX Insul-Tube, ${t}" wall`, perm: 0.01 / t, upper: true, src: ['R18'], note: '<0.01 perm·in ÷ wall thickness' }
      const permIn = t <= 1 ? 0.05 : 0.08
      return { label: `AP ArmaFlex, ${t}" wall`, perm: permIn / t, src: ['R16'], note: `${permIn} perm·in ÷ wall thickness` }
    }
    if (id === 'polyolefin') {
      if (/Tubolit/.test(product)) return { label: `Tubolit, ${t}" wall`, perm: 0.02 / t, src: ['P3'], materialSrc: true, note: '0.02 perm·in (E96 Proc. A) ÷ wall thickness' }
      return { label: 'K-FLEX PE', perm: null, src: ['P7'], materialSrc: true, note: '"<0.05" published without a unit' }
    }
  }
  if (sys.vaporBy === 'membrane') {
    if (id === 'cellular-glass') return { label: 'PITTWRAP IW50 AL jacket', perm: 0.0009, src: ['J35'], note: 'over FOAMGLAS, itself 0.00 perm·in (R21)' }
    if (id === 'pir') return { label: 'Saranex 540 CX film, 4 mil', perm: 0.02, src: ['J27'] }
    if (id === 'aerogel') {
      if (/Cryogel/.test(product)) return { label: 'Cryogel Z laminated retarder', perm: 0, upper: true, src: ['P5'], materialSrc: true, note: '≤0.00 perm (E96 dry cup); Aspen still calls for a separate primary barrier' }
      return { label: 'Foil-faced butyl barrier', perm: 0.02, upper: true, src: ['R9'], note: 'Butyl/asphalt membranes ≤0.02 perm (generic, NIA)' }
    }
  }
  return { label: INSULATION[id].label, perm: null, src: [] }
}

export function vaporCheck(s: SimState, mode: SimMode, side: Side): VaporCheck | null {
  mode = physicsMode(s, mode)
  if (mode === 'hot' || side.thicknessIn === null || s.processF >= s.ambientF) return null
  const cold = s.processF < 0
  const required = cold ? 0.01 : 0.02
  const retarder = retarderFor(s, mode)
  const notes: string[] = []
  if (s.system === 'duct') {
    notes.push('IMC 604.11: externally insulated cooling ducts need a vapor retarder of 0.05 perm or less (or 2-mil foil); insulation of 0.05 perm or less needs no cover. Seal every joint and seam.')
    notes.push(isWrap(s.ductIns) ? 'Seal staples, pins, tears and punctures in the facing with foil tape (OC, JM, Knauf, CertainTeed install instructions).' : 'Tape every board joint and pin washer with facing tape.')
  }
  const sys = systemFor(s, mode)
  if (s.system !== 'duct' && sys.jacketId === 'pvc') notes.push('The PVC jacket protects the system but should not be relied on alone as the vapor retarder (ASHRAE).')
  if (s.system !== 'duct' && (sys.jacketId.startsWith('alu') || sys.jacketId === 'ss')) notes.push('A metal jacket and its liner are not a vapor retarder (ASHRAE, JM).')
  if (s.system !== 'duct' && s.insulation === 'elastomeric') notes.push('ASHRAE Refrigeration: elastomerics need an outer retarder in refrigeration piping unless the foam is ≤0.02 perm·in. ASHRAE Fundamentals: sealed closed-cell flexible foam can be used without one, typically in chilled-water service.')
  let oz: number | null = null
  if (retarder.perm !== null) {
    const pv = (s.rh / 100) * pSat(fToC(s.ambientF))
    const dpInHg = Math.max(0, pv - pSat(fToC(s.processF))) / PA_PER_INHG
    const areaFt2 = Math.PI * (side.result.outerD / 0.3048) * 100
    const grainsYr = retarder.perm * areaFt2 * dpInHg * 8760
    oz = (grainsYr / 7000) * OZ_PER_LB
  }
  return {
    required,
    requiredNote: cold ? '≤0.01 perm strongly considered below 0°F' : '≤0.02 perm for below-ambient insulation',
    requiredSrc: s.system === 'duct' ? ['R1', 'R2', 'C6'] : ['R1', 'R2'],
    retarder,
    meets: retarder.perm === null ? null : retarder.perm <= required + 1e-9,
    ozPerYearPer100ft: oz,
    notes,
  }
}
