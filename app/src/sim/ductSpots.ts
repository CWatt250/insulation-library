import { ductRequirement, type DuctCodeBasis, type DuctCodeResult, type DuctPlace, type DuctType, type WsecDuctOptions } from './duct'
import type { DuctService } from '../data/ductData'
import { WSEC_DUCT_R } from '../data/wsecData'

/**
 * The 14 duct locations of DOE's commercial duct-insulation guide (Figure 1:
 * "Duct Insulation and Sealing Requirements in Commercial Buildings", BECP),
 * each classified by ASHRAE 90.1-2019 Table 6.8.2, its notes and the
 * 6.4.4.1.2 exceptions (C19). Labels are the figure's key; x/y place the
 * marker on this app's own redrawn section.
 *
 * DOE draws both ceiling spaces as return air plenums. Many buildings duct the
 * return instead, so the middle floor's ceiling space is drawn as either
 * (`ceiling`): ASHRAE then has two answers, and location 15 adds the return
 * duct a ducted-return ceiling carries.
 */
export interface DuctSpot {
  n: number
  label: string
  /** The duct type and location the simulator uses for it; null where it isn't a duct run. */
  type: DuctType | null
  place: DuctPlace | null
  /** A rule specific to this spot (an exception or note), shown instead of / beside the table value. */
  rule?: string
  /** In a ceiling space that is a return air plenum or, with a ducted return, plain conditioned space. */
  ceiling?: boolean
  /** Exposed within the zone it serves (WSEC C403.10.1.2 exception), not concealed above a ceiling. */
  exposed?: boolean
  /** Not yet verified against the code text. */
  pending?: boolean
  x: number
  y: number
}

export const DUCT_SPOTS: DuctSpot[] = [
  { n: 1, label: 'Insulation of unit casing', type: null, place: null, x: 470, y: 85,
    rule: 'Exempt: "Factory-installed plenums, casings, or ductwork furnished as a part of HVAC equipment tested and rated in accordance with Section 6.4.1" (6.4.4.1.2 exception 1).' },
  { n: 2, label: 'Exhaust', type: 'exhaust', place: 'attic', x: 786, y: 140 },
  { n: 3, label: 'Supply & return in vented attic', type: 'supply', place: 'attic', x: 560, y: 145 },
  { n: 4, label: 'Supply & return outside of building', type: 'supply', place: 'exterior', x: 398, y: 86 },
  { n: 5, label: 'Supply & return in unconditioned shaft', type: 'supply', place: 'unconditioned', x: 370, y: 280 },
  { n: 6, label: 'Supply in unvented attic', type: 'supply', place: 'attic', x: 250, y: 232,
    rule: 'Read as an attic above an insulated ceiling (Table 6.8.2 note b). If the attic is insulated at the roof deck instead, Table 6.8.2 does not name it — classify it by 90.1\'s space definitions (indirectly conditioned, semiheated or unconditioned).' },
  { n: 7, label: 'Return in indirectly conditioned ceiling space', type: 'return', place: 'indirect', x: 560, y: 188 },
  { n: 8, label: 'Exterior wall of return plenum', type: null, place: null, x: 861, y: 188,
    rule: 'Building envelope, not duct insulation: "Where portions of the building envelope are used as a plenum enclosure, building envelope insulation shall be as required by the most restrictive condition of Section 6.4.4.1 or Section 5" (Table 6.8.2 note a).' },
  { n: 9, label: 'Supply outlet in ceiling space', type: 'supply', place: 'indirect', ceiling: true, x: 712, y: 370,
    rule: 'Outlet backs: "Backs of air outlets and outlet plenums exposed to unconditioned space or indirectly conditioned space with face areas exceeding 5 ft2 need not exceed R-2; those 5 ft2 or smaller need not be insulated" (6.4.4.1.2 exception 4).' },
  { n: 10, label: 'Supply runout in ceiling space', type: 'supply', place: 'indirect', ceiling: true, x: 646, y: 359,
    rule: 'Short runouts: "For runouts less than 10 ft in length to air terminals or air outlets, the rated R-value of insulation need not exceed R-3.5" (6.4.4.1.2 exception 3).' },
  { n: 11, label: 'Supply in ceiling space', type: 'supply', place: 'indirect', ceiling: true, x: 500, y: 359 },
  { n: 12, label: 'Supply exposed in conditioned space', type: 'supply', place: 'conditioned', exposed: true, x: 250, y: 400 },
  { n: 13, label: 'Supply in vented crawl space', type: 'supply', place: 'crawl', x: 600, y: 495 },
  { n: 14, label: 'Buried supply', type: 'supply', place: 'buried', x: 250, y: 540 },
  { n: 15, label: 'Return in ceiling space', type: 'return', place: 'indirect', ceiling: true, x: 760, y: 341 },
]

/** What the code asks of a spot, at the user's climate zone and system service. */
export function spotRequirement(spot: DuctSpot, service: DuctService, zone: number, basis: DuctCodeBasis = 'ashrae', wa?: WsecDuctOptions): DuctCodeResult | null {
  if (spot.pending || !spot.type || !spot.place) return null
  if (basis === 'wsec' && spot.type === 'supply' && (spot.place === 'conditioned' || spot.place === 'indirect')) return wsecSupplyInside(spot, wa?.zone ?? '4C')
  const r = ductRequirement(spot.type, spot.place, service, zone, basis, Infinity, wa, 55)
  if (!spot.ceiling || basis === 'wsec') return r
  // a ceiling space that is either a return plenum or, with a ducted return, conditioned space
  const ducted = ductRequirement(spot.type, 'conditioned', service, zone, basis, Infinity, wa, 55)
  return {
    ...r,
    label: `Return air plenum: ${r.label}. Ducted return (plain ceiling space): ${ducted.label}`,
    src: [...new Set([...r.src, ...ducted.src])],
    ...(r.R !== ducted.R ? { ifDucted: ducted } : {}),
  }
}

/**
 * WSEC C403.10.1.2 for supply ducts inside the building (return plenums read as
 * conditioned space): R-3.3 for air below 55°F or above 105°F — which normal
 * cooling and heating supply air is — unless the duct is exposed within the
 * zone it serves. A spot has no supply temperature, so it gives the usual case.
 */
function wsecSupplyInside(spot: DuctSpot, z: WsecDuctOptions['zone']): DuctCodeResult {
  const R = WSEC_DUCT_R.supplyConditioned[z]
  const derived = spot.place === 'indirect'
  if (spot.exposed) return { R: null, derived, label: `None — supply duct exposed within the zone it serves (C403.10.1.2 exception). Concealed above a ceiling it needs installed R-${R}, unless the supply air stays 55–105°F`, src: ['W5'] }
  return { R, derived, label: `Installed R-${R} — concealed supply duct carrying air below 55°F or above 105°F (normal cooling and heating supply). None only if the supply air stays 55–105°F`, src: ['W5'] }
}

/** The headline for a requirement: one minimum, or the plenum and ducted-return answers. */
export function minimumText(r: DuctCodeResult): string {
  const one = (x: DuctCodeResult) => x.R === null ? (x.notStated ? 'no R-value set' : 'no minimum') : `installed R-${x.R} minimum`
  return r.ifDucted ? `${one(r)} if a return plenum; ${one(r.ifDucted)} with a ducted return` : one(r)
}
