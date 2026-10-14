import { INSULATION } from '../data/catalog'
import { pipeSizes } from '../data/pipes'
import { PIPE_LIMITS } from '../data/pipeWalls'
import { WA_COUNTIES } from '../data/wsecData'
import { codeMinimum } from './code'
import { DUCT_LOCATIONS, DUCT_TYPES, ductInsLabel, type DuctInsulation } from './duct'
import { physicsMode } from './model'
import type { Answers, recommendation } from './recommend'
import type { SimState } from './types'
import { fmt, type UnitSystem } from './units'

/**
 * The words around a recommendation: what was asked about, the material's
 * name, and the notes worth acting on. Shared by the Recommend tab and the
 * WattBot export (src/wattbot/cli.ts) so both say the same thing.
 */

export const matLabel = (s: SimState, pick: string) => (s.system === 'duct' ? ductInsLabel(pick as DuctInsulation, s.ductShape) : INSULATION[pick as keyof typeof INSULATION].label)

/** "Copper 1" pipe, indoors" / "Supply duct, 16" round, attic, zone 4". */
export function describeAnswers(ap: Answers): string {
  if (ap.system === 'duct') {
    const d = ap.duct
    const zone = d.ductCodeBasis === 'wsec' ? `${WA_COUNTIES.find((c) => c.county === d.waCounty)?.zone ?? '4C'} (${d.waCounty} County)` : d.climateZone
    return `${DUCT_TYPES.find((t) => t.id === d.ductType)!.label} duct, ${d.ductShape === 'round' ? `${d.ductD}" round` : `${d.ductW}" × ${d.ductH}"`}, ${DUCT_LOCATIONS.find((l) => l.id === d.ductLocation)!.short.toLowerCase()}, zone ${zone}`
  }
  const sizes = pipeSizes(ap.pipe)
  return `${ap.pipe === 'steel' ? 'Steel' : ap.pipe === 'copper' ? 'Copper' : 'PVC'} ${sizes[Math.min(ap.npsIndex, sizes.length - 1)].nps}" pipe${ap.drain ? ' (condensate drain)' : ''}, ${ap.outdoors ? 'outdoors' : 'indoors'}`
}

/** Notes worth acting on, each with its source ids (sources.ts). */
export function recommendationNotes(ap: Answers, r: ReturnType<typeof recommendation>, units: UnitSystem): { text: string; src: string[] }[] {
  const { s, mode } = r
  const T = (f: number) => fmt.temp(f, units)
  const beh = physicsMode(s, mode)
  const notes: { text: string; src: string[] }[] = []
  if (ap.system === 'pipe' && mode !== 'condensate') {
    const c = codeMinimum(s, mode)
    if ('none' in c) notes.push({ text: `Energy code: ${c.none}`, src: [] })
  }
  if (mode === 'condensate') notes.push({ text: 'No model code requires insulating HVAC condensate drain lines, and ASHRAE 90.1-2019 exempts them from its pipe tables. Insulate where sweating would cause damage, or where the equipment maker\'s instructions call for it.', src: ['C7', 'C19'] })
  if (ap.system === 'pipe' && ap.outdoors) notes.push({ text: 'IECC C403.12.3.1: "Piping insulation exposed to the weather shall be protected from damage, including that caused by sunlight, moisture, equipment maintenance and wind" (no adhesive tape). The recommendation uses an aluminum jacket where the material offers one.', src: ['C1'] })
  if (ap.system === 'pipe' && PIPE_LIMITS[ap.pipe] && ap.processF > PIPE_LIMITS[ap.pipe]!.maxF) notes.push({ text: `${PIPE_LIMITS[ap.pipe]!.label} is rated to ${T(PIPE_LIMITS[ap.pipe]!.maxF)} — this temperature is above its rating.`, src: PIPE_LIMITS[ap.pipe]!.src })
  if (ap.system === 'duct' && beh !== 'hot') notes.push({ text: 'Cooling ducts: a vapor retarder of 0.05 perm or less, every seam, staple and pin sealed (IMC 604.11).', src: ['C6'] })
  if (ap.system === 'duct' && (ap.duct.ductType === 'outdoor' || ap.duct.ductType === 'exhaust')) notes.push({ text: 'Neither energy code sets an R-value for outside-air or exhaust ducts; the thickness here keeps the outside from sweating (IMC 603.12).', src: ['C1', 'C19'] })
  return notes
}
