import { DUCT_LOCATIONS } from './duct'
import type { DuctSpot } from './ductSpots'

/** How ASHRAE 90.1-2019 classes each of DOE's duct locations: the colour key of the duct-location figure. */

export type Kind = 'conditioned' | 'indirect' | 'unconditioned' | 'exteriorcol' | 'buried' | 'other' | 'pending'

export const KIND: Record<Kind, { fill: string; label: string }> = {
  conditioned: { fill: '#5b8def', label: 'Conditioned — no duct insulation required (exception 2)' },
  indirect: { fill: '#2dd4bf', label: 'Indirectly conditioned — return plenums (note c)' },
  unconditioned: { fill: '#f5b942', label: 'Unconditioned space and buried ducts column' },
  exteriorcol: { fill: '#f97362', label: 'Exterior column — outdoors, plus attics above insulated ceilings, crawl spaces, parking garages (note b)' },
  buried: { fill: '#a07a52', label: 'Buried (Unconditioned space and buried ducts column)' },
  other: { fill: '#e9e4d6', label: 'Not a duct run: equipment casing or building envelope' },
  pending: { fill: '#8a8f96', label: 'Not yet verified' },
}

export function kindOf(spot: DuctSpot): Kind {
  if (spot.pending) return 'pending'
  if (!spot.place) return 'other'
  const col = DUCT_LOCATIONS.find((l) => l.id === spot.place)?.column
  if (spot.place === 'buried') return 'buried'
  if (spot.place === 'conditioned' || col === null) return 'conditioned'
  if (col === 'indirect') return 'indirect'
  if (col === 'exterior') return 'exteriorcol'
  return 'unconditioned'
}
