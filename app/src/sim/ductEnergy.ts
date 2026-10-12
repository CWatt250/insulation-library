import { COUNTY_STATION, WA_STATIONS, type ClimateStation } from '../data/waClimate'
import { evaluate, physicsMode } from './model'
import type { SimState } from './types'

/**
 * Yearly duct energy, season by season, at Washington's normal weather — not at the
 * design temperatures in Setup (those are peaks, right for thickness and condensation).
 *
 *  seasons    — cooling is June–September; a heating month has more than 150 heating
 *               degree days, base 65°F (ASHRAE 152P defaults, LBNL 40588 [N3])
 *  outdoor    — NOAA 1991–2020 hourly normals for the county's station, averaged over the
 *               hours the system runs [N1, N2]
 *  around it  — ASHRAE 152 buffer-space rules: a well-vented attic runs 13°F above outdoor in
 *               the cooling season [N4] and close to outdoor in the heating season (0–4°F
 *               measured [N3]); a vented crawl space with an insulated floor is
 *               (indoor + 8 × outdoor) ÷ 9 [N3]; buried ducts sit in ground at the yearly
 *               mean outdoor temperature [N3]
 *  no savings — ducts inside the space they serve (their heat stays in the building),
 *               outside-air intakes (the air is not conditioned yet) and exhaust ducts
 *               (the air is leaving)
 */

export const COOLING_MONTHS = [6, 7, 8, 9]
export const HEATING_MONTH_HDD = 150
/** Part-day schedules start at 6 am. */
export const DAY_START = 6
/** ASHRAE 152P indoor temperatures, used in the crawl-space mix. */
const INDOOR = { cooling: 78, heating: 70 }
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** A duct's cooling or heating season, or the months an outdoor pipe runs. */
export type Season = 'cooling' | 'heating' | 'run'

export interface SeasonPart {
  season: Season
  /** Priced as heating fuel (hot) or cooling electricity (cold). */
  mode: 'hot' | 'cold'
  months: number[]
  /** Operating hours in the season. */
  hours: number
  /** Normal outdoor temperature over those hours. */
  outdoorF: number
  /** Temperature around the duct, after the location rule. */
  aroundF: number
  /** How aroundF follows from outdoorF, in words. */
  rule: string
  airF: number
  /** Outdoor pipes: the wind the jacket sees, mph (0 when sheltered). */
  windMph?: number
  /** Outdoor pipes: what the wind is. */
  windRule?: string
  /** Heat flow that costs energy, Btu/hr·ft (0 when the season works for free). */
  qBare: number
  qIns: number
}

export type DuctEnergy =
  | { kind: 'none'; title: string; why: string }
  | { kind: 'parts'; station: ClimateStation; county: string; parts: SeasonPart[] }

export const stationFor = (county: string): ClimateStation => WA_STATIONS[COUNTY_STATION[county] ?? 'USW00024233']

/** "Jun–Sep", or "Oct–May" across the new year, or a list when broken. */
export function monthSpan(months: number[]): string {
  if (months.length === 12) return 'all year'
  const set = new Set(months)
  // find a start that follows a month not in the set
  const start = months.find((m) => !set.has(m === 1 ? 12 : m - 1))
  if (start === undefined) return months.map((m) => MONTH[m - 1]).join(', ')
  let end = start
  while (set.has(end === 12 ? 1 : end + 1) && (end === 12 ? 1 : end + 1) !== start) end = end === 12 ? 1 : end + 1
  const run = ((end - start + 12) % 12) + 1
  return run === months.length ? `${MONTH[start - 1]}–${MONTH[end - 1]}` : months.map((m) => MONTH[m - 1]).join(', ')
}

/** A normal (temperature or wind) over the season's operating hours, days-weighted across months. */
function seasonOutdoor(st: ClimateStation, months: number[], hoursPerDay: number, table: number[][] = st.monthHourF): number {
  const hrs = hoursPerDay >= 24 ? [...Array(24).keys()] : [...Array(Math.max(1, hoursPerDay)).keys()].map((i) => (DAY_START + i) % 24)
  let sum = 0
  let w = 0
  for (const m of months) {
    const row = table[m - 1]
    const mean = hrs.reduce((a, h) => a + row[h], 0) / hrs.length
    sum += mean * DAYS[m - 1]
    w += DAYS[m - 1]
  }
  return sum / w
}

function around(s: SimState, season: 'cooling' | 'heating', outdoorF: number, st: ClimateStation): { aroundF: number; rule: string } {
  const o = Math.round(outdoorF * 10) / 10
  switch (s.ductLocation) {
    case 'attic':
      return season === 'cooling'
        ? { aroundF: o + 13, rule: 'attic: outdoor + 13°F (ASHRAE 152, well-vented attic, cooling season)' }
        : { aroundF: o, rule: 'attic: about the outdoor temperature in the heating season (ASHRAE 152P)' }
    case 'crawl':
      return { aroundF: (INDOOR[season] + 8 * o) / 9, rule: `vented crawl space, insulated floor: (${INDOOR[season]}°F indoor + 8 × outdoor) ÷ 9 (ASHRAE 152P)` }
    case 'garage':
      return { aroundF: o, rule: 'parking garage: ventilated to outdoors, taken at the outdoor temperature' }
    case 'exterior':
      return { aroundF: o, rule: 'outdoors: the outdoor temperature (sun on the jacket not counted)' }
    case 'buried':
      return { aroundF: st.annualF, rule: `buried: ground at the yearly mean outdoor temperature, ${st.annualF}°F (ASHRAE 152P)` }
    default:
      return { aroundF: s.ambientF, rule: 'unconditioned space: the temperature you set in Setup' }
  }
}

export function ductEnergy(s: SimState): DuctEnergy {
  if (s.ductLocation === 'conditioned' || s.ductLocation === 'indirect') {
    return {
      kind: 'none',
      title: 'No energy savings to price here',
      why: `This duct runs inside the space it serves${s.ductLocation === 'indirect' ? ' (a return-air plenum is part of the air system)' : ''}. Heat that passes through its wall stays in the building, so it isn’t lost. Insulation here stops condensation and gets air to the far end at the right temperature.`,
    }
  }
  if (s.ductType === 'outdoor') {
    return { kind: 'none', title: 'No energy savings to price on outside air', why: 'Outside air hasn’t been heated or cooled yet, so there’s little to lose on its way to the unit. Insulation on outside-air ducts is for condensation.' }
  }
  if (s.ductType === 'exhaust') {
    return { kind: 'none', title: 'No energy savings to price on exhaust', why: 'Exhaust air is on its way out of the building, so heat it gains or loses costs nothing — unless it passes through a heat-recovery unit first. Insulation here stops condensation inside the duct.' }
  }
  const st = stationFor(s.waCounty)
  const heatMonths = st.hdd.map((h, i) => (h > HEATING_MONTH_HDD ? i + 1 : 0)).filter(Boolean)
  // which seasons this air counts in: cold air in the cooling season, warm air in the heating
  // season, room-temperature (return) air in both without counting a month twice
  const seasons: { season: 'cooling' | 'heating'; months: number[] }[] =
    s.processF <= 65 ? [{ season: 'cooling', months: COOLING_MONTHS }]
      : s.processF >= 80 ? [{ season: 'heating', months: heatMonths }]
        : [{ season: 'cooling', months: COOLING_MONTHS }, { season: 'heating', months: heatMonths.filter((m) => !COOLING_MONTHS.includes(m)) }]
  const parts: SeasonPart[] = []
  for (const { season, months } of seasons) {
    if (!months.length) continue
    const days = months.reduce((a, m) => a + DAYS[m - 1], 0)
    const hours = days * (s.daysPerWeek / 7) * s.hoursPerDay
    const outdoorF = seasonOutdoor(st, months, s.hoursPerDay)
    const { aroundF, rule } = around(s, season, outdoorF, st)
    const at = { ...s, ambientF: aroundF }
    const ev = evaluate(at, physicsMode(at, 'duct'))
    // only heat flowing the costly way counts: into cold air in summer, out of warm air in winter
    const costs = season === 'cooling' ? aroundF > s.processF : aroundF < s.processF
    parts.push({
      season,
      mode: season === 'heating' ? 'hot' : 'cold',
      months,
      hours,
      outdoorF,
      aroundF,
      rule,
      airF: s.processF,
      qBare: costs ? Math.abs(ev.bare.result.qBtuHrFt) : 0,
      qIns: costs ? Math.abs(ev.ins.result.qBtuHrFt) : 0,
    })
  }
  return { kind: 'parts', station: st, county: s.waCounty, parts }
}

/**
 * A pipe outdoors, priced at the county's normal weather: the months it runs (the coldest
 * for hot work, the warmest for cold), the outdoor temperature over its operating hours and
 * NOAA's average wind there — measured at the airport, in the open about 33 ft up, so a
 * sheltered pipe is priced in still air instead.
 */
export function pipeOutdoor(s: SimState, mode: 'hot' | 'cold'): { station: ClimateStation; part: SeasonPart } {
  const st = stationFor(s.waCounty)
  const n = Math.min(12, Math.max(1, Math.round(s.monthsPerYear)))
  const meanOf = (m: number) => st.monthHourF[m - 1].reduce((a, x) => a + x, 0) / 24
  const order = [...Array(12).keys()].map((i) => i + 1).sort((a, b) => (mode === 'hot' ? meanOf(a) - meanOf(b) : meanOf(b) - meanOf(a)))
  const months = order.slice(0, n).sort((a, b) => a - b)
  const days = months.reduce((a, m) => a + DAYS[m - 1], 0)
  const hours = days * (s.daysPerWeek / 7) * s.hoursPerDay
  const outdoorF = seasonOutdoor(st, months, s.hoursPerDay)
  const open = s.windExposure !== 'sheltered'
  const windMph = open ? Math.round(seasonOutdoor(st, months, s.hoursPerDay, st.monthHourWindMph) * 10) / 10 : 0
  const at = { ...s, ambientF: outdoorF, windMph }
  const ev = evaluate(at, mode)
  const costs = mode === 'hot' ? outdoorF < s.processF : outdoorF > s.processF
  return {
    station: st,
    part: {
      season: 'run',
      mode,
      months,
      hours,
      outdoorF,
      aroundF: outdoorF,
      rule: 'outdoors: the outdoor temperature (sun on the jacket not counted)',
      airF: s.processF,
      windMph,
      windRule: open ? `NOAA average at ${st.name}, open ground about 33 ft up` : 'sheltered: still air',
      qBare: costs ? Math.abs(ev.bare.result.qBtuHrFt) : 0,
      qIns: costs ? Math.abs(ev.ins.result.qBtuHrFt) : 0,
    },
  }
}
