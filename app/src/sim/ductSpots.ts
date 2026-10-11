import { ductRequirement, type DuctCodeResult, type DuctPlace, type DuctType } from './duct'
import type { DuctService } from '../data/ductData'

/**
 * The 14 duct locations of DOE's commercial duct-insulation guide (Figure 1:
 * "Duct Insulation and Sealing Requirements in Commercial Buildings", BECP),
 * each classified by ASHRAE 90.1-2019 Table 6.8.2, its notes and the
 * 6.4.4.1.2 exceptions (C19). Labels are the figure's key; x/y place the
 * marker on this app's own redrawn section.
 */
export interface DuctSpot {
  n: number
  label: string
  /** The duct type and location the simulator uses for it; null where it isn't a duct run. */
  type: DuctType | null
  place: DuctPlace | null
  /** A rule specific to this spot (an exception or note), shown instead of / beside the table value. */
  rule?: string
  /** Not yet verified against the code text. */
  pending?: boolean
  x: number
  y: number
}

export const DUCT_SPOTS: DuctSpot[] = [
  { n: 1, label: 'Insulation of unit casing', type: null, place: null, x: 470, y: 85,
    rule: 'Exempt: "Factory-installed plenums, casings, or ductwork furnished as a part of HVAC equipment tested and rated in accordance with Section 6.4.1" (6.4.4.1.2 exception 1).' },
  { n: 2, label: 'Exhaust', type: 'exhaust', place: 'attic', x: 786, y: 140, pending: true },
  { n: 3, label: 'Supply & return in vented attic', type: 'supply', place: 'attic', x: 560, y: 145 },
  { n: 4, label: 'Supply & return outside of building', type: 'supply', place: 'exterior', x: 398, y: 86 },
  { n: 5, label: 'Supply & return in unconditioned shaft', type: 'supply', place: 'unconditioned', x: 370, y: 280 },
  { n: 6, label: 'Supply in unvented attic', type: 'supply', place: null, x: 250, y: 232, pending: true },
  { n: 7, label: 'Return in indirectly conditioned ceiling space', type: 'return', place: 'indirect', x: 560, y: 188 },
  { n: 8, label: 'Exterior wall of return plenum', type: null, place: null, x: 861, y: 338,
    rule: 'Building envelope, not duct insulation: "Where portions of the building envelope are used as a plenum enclosure, building envelope insulation shall be as required by the most restrictive condition of Section 6.4.4.1 or Section 5" (Table 6.8.2 note a).' },
  { n: 9, label: 'Supply outlet in plenum', type: 'supply', place: 'indirect', x: 712, y: 351,
    rule: 'Outlet backs: "Backs of air outlets and outlet plenums exposed to unconditioned space or indirectly conditioned space with face areas exceeding 5 ft2 need not exceed R-2; those 5 ft2 or smaller need not be insulated" (6.4.4.1.2 exception 4).' },
  { n: 10, label: 'Supply runout in return plenum', type: 'supply', place: 'indirect', x: 646, y: 342,
    rule: 'Short runouts: "For runouts less than 10 ft in length to air terminals or air outlets, the rated R-value of insulation need not exceed R-3.5" (6.4.4.1.2 exception 3).' },
  { n: 11, label: 'Supply in return plenum', type: 'supply', place: 'indirect', x: 500, y: 338 },
  { n: 12, label: 'Supply in conditioned space', type: 'supply', place: 'conditioned', x: 250, y: 400 },
  { n: 13, label: 'Supply in vented crawl space', type: 'supply', place: 'crawl', x: 600, y: 495 },
  { n: 14, label: 'Buried supply', type: 'supply', place: 'buried', x: 250, y: 540 },
]

/** What the code asks of a spot, at the user's climate zone and system service. */
export function spotRequirement(spot: DuctSpot, service: DuctService, zone: number): DuctCodeResult | null {
  if (spot.pending || !spot.type || !spot.place) return null
  return ductRequirement(spot.type, spot.place, service, zone)
}
