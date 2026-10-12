import { describe, expect, it } from 'vitest'
import { annualCost } from './cost'
import { COOLING_MONTHS, ductEnergy, monthSpan, pipeOutdoor, stationFor } from './ductEnergy'
import { evaluate, physicsMode } from './model'
import { applyPreset, initialState, PRESETS } from './presets'
import { WA_COUNTIES } from '../data/wsecData'
import { COUNTY_STATION, WA_STATIONS } from '../data/waClimate'
import type { SimState } from './types'

const preset = (id: string, patch: Partial<SimState> = {}) => ({ ...applyPreset(null, PRESETS.find((p) => p.id === id)!), ...patch })
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

describe('duct energy at Washington weather', () => {
  it('every Washington county has a NOAA station with hourly normals', () => {
    for (const { county } of WA_COUNTIES) expect(WA_STATIONS[COUNTY_STATION[county]], county).toBeDefined()
    for (const st of Object.values(WA_STATIONS)) {
      expect(st.monthHourF).toHaveLength(12)
      for (const row of st.monthHourF) expect(row).toHaveLength(24)
    }
  })

  it('no dollar figure where the energy is not lost', () => {
    for (const ductLocation of ['conditioned', 'indirect'] as const) expect(ductEnergy(preset('duct-cool', { ductLocation })).kind).toBe('none')
    expect(ductEnergy(preset('duct-oa')).kind).toBe('none')
    expect(ductEnergy(preset('duct-exhaust')).kind).toBe('none')
    const s = preset('duct-cond')
    expect(annualCost(s, 'cold', evaluate(s, 'cold'))).toBeNull()
  })

  it('cooling air counts June–September, at the season’s normal outdoor temperature', () => {
    const de = ductEnergy(preset('duct-roof', { waCounty: 'King' }))
    if (de.kind !== 'parts') throw new Error('expected parts')
    expect(de.station.name).toBe('Seattle-Tacoma Intl')
    expect(de.parts).toHaveLength(1)
    const p = de.parts[0]
    expect(p.season).toBe('cooling')
    expect(p.months).toEqual(COOLING_MONTHS)
    expect(p.hours).toBe(2928) // 122 days × 24 h, ASHRAE 152P's cooling season
    const st = stationFor('King')
    const mean = COOLING_MONTHS.reduce((a, m) => a + (st.monthHourF[m - 1].reduce((x, y) => x + y, 0) / 24) * DAYS[m - 1], 0) / 122
    expect(p.outdoorF).toBeCloseTo(mean, 6)
    expect(p.aroundF).toBeCloseTo(p.outdoorF, 0) // outdoors: the outdoor temperature
  })

  it('a well-vented attic runs 13°F over outdoor in the cooling season (ASHRAE 152)', () => {
    const de = ductEnergy(preset('duct-cool', { waCounty: 'Spokane' }))
    if (de.kind !== 'parts') throw new Error('expected parts')
    expect(de.parts[0].aroundF - Math.round(de.parts[0].outdoorF * 10) / 10).toBeCloseTo(13, 6)
  })

  it('heating air counts the months over 150 heating degree days; crawl space mixes indoor and outdoor', () => {
    const de = ductEnergy(preset('duct-heat', { waCounty: 'King' }))
    if (de.kind !== 'parts') throw new Error('expected parts')
    const p = de.parts[0]
    expect(p.season).toBe('heating')
    expect(p.months).toEqual([1, 2, 3, 4, 5, 10, 11, 12])
    expect(monthSpan(p.months)).toBe('Oct–May')
    expect(p.aroundF).toBeCloseTo((70 + 8 * Math.round(p.outdoorF * 10) / 10) / 9, 6)
  })

  it('return air counts both seasons without counting a month twice', () => {
    const de = ductEnergy(preset('duct-return', { waCounty: 'Thurston' }))
    if (de.kind !== 'parts') throw new Error('expected parts')
    expect(de.parts.map((p) => p.season)).toEqual(['cooling', 'heating'])
    const all = de.parts.flatMap((p) => p.months)
    expect(new Set(all).size).toBe(all.length)
  })

  it('buried ducts sit at the yearly mean outdoor temperature', () => {
    const de = ductEnergy(preset('duct-cool', { ductLocation: 'buried', waCounty: 'Yakima' }))
    if (de.kind !== 'parts') throw new Error('expected parts')
    expect(de.parts[0].aroundF).toBe(stationFor('Yakima').annualF)
  })

  it('part-day schedules count fewer hours, at the warmer daytime temperatures', () => {
    const all = ductEnergy(preset('duct-roof'))
    const day = ductEnergy(preset('duct-roof', { hoursPerDay: 10, daysPerWeek: 5 }))
    if (all.kind !== 'parts' || day.kind !== 'parts') throw new Error('expected parts')
    expect(day.parts[0].hours).toBeCloseTo(122 * 10 * 5 / 7, 6)
    expect(day.parts[0].outdoorF).toBeGreaterThan(all.parts[0].outdoorF)
  })

  it('season averages price far below a year at the design temperature', () => {
    const s = preset('duct-cool', { waCounty: 'King' })
    const m = physicsMode(s, 'duct')
    const c = annualCost(s, m, evaluate(s, m))!
    const designYear = (Math.abs(evaluate(s, m).bare.result.qBtuHrFt) - Math.abs(evaluate(s, m).ins.result.qBtuHrFt)) * s.lengthFt * 8760
    expect(c.btuBare - c.btuIns).toBeLessThan(designYear / 3)
    expect(c.saved).toBeGreaterThan(0)
  })

  it('ducts open on rooftop-unit cooling; pipes on a chiller plant', () => {
    expect(initialState('duct').kwPerTon).toBe(1.25)
    expect(initialState('cold').kwPerTon).toBe(0.9)
  })
})

describe('pipes outdoors at Washington weather', () => {
  const proc = (patch: Partial<SimState> = {}) => preset('process', { waCounty: 'King', ...patch })

  it('the outdoor process preset is priced outdoors; indoor pipes keep the Setup air', () => {
    expect(proc().pipeOutdoors).toBe(true)
    expect(initialState('hot').pipeOutdoors).toBe(false)
    const s = proc({ pipeOutdoors: false })
    const ev = evaluate(s, 'hot')
    const c = annualCost(s, 'hot', ev)!
    expect(c.btuBare).toBeCloseTo(ev.annual!.bare, 0)
  })

  it('all year: the yearly normal temperature and NOAA’s average wind over every hour', () => {
    const { station, part } = pipeOutdoor(proc(), 'hot')
    expect(part.hours).toBe(8760)
    const mean = (t: number[][]) => t.reduce((a, row, m) => a + (row.reduce((x, y) => x + y, 0) / 24) * DAYS[m], 0) / 365
    expect(part.outdoorF).toBeCloseTo(mean(station.monthHourF), 6)
    expect(part.windMph).toBeCloseTo(Math.round(mean(station.monthHourWindMph) * 10) / 10, 6)
    expect(pipeOutdoor(proc({ windExposure: 'sheltered' }), 'hot').part.windMph).toBe(0)
  })

  it('part of the year means the coldest months for hot work, the warmest for cold', () => {
    const st = stationFor('King')
    const meanOf = (m: number) => st.monthHourF[m - 1].reduce((a, x) => a + x, 0) / 24
    const byCold = [...Array(12).keys()].map((i) => i + 1).sort((a, b) => meanOf(a) - meanOf(b))
    expect(pipeOutdoor(proc({ monthsPerYear: 6 }), 'hot').part.months).toEqual(byCold.slice(0, 6).sort((a, b) => a - b))
    expect(pipeOutdoor(proc({ monthsPerYear: 4 }), 'cold').part.months).toEqual(byCold.slice(8).sort((a, b) => a - b))
  })

  it('wind raises the bare loss far more than the insulated loss, so open sites save more', () => {
    const open = proc()
    const shel = proc({ windExposure: 'sheltered' })
    const a = annualCost(open, 'hot', evaluate(open, 'hot'))!
    const b = annualCost(shel, 'hot', evaluate(shel, 'hot'))!
    expect(a.saved).toBeGreaterThan(b.saved)
    expect(a.btuIns / b.btuIns).toBeLessThan(1.1)
  })
})
