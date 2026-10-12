import { describe, expect, it } from 'vitest'
import { annualCost, costSteps, fuelSwitch, GAS_DEFAULT, KW_PER_TON_DEFAULT, paybackWords, POWER_DEFAULT, priceBasis, runBasis, scheduleHours, scheduleWords } from './cost'
import { normalize } from './scenarios'
import { evaluate } from './model'
import { applyPreset, initialState, PRESETS } from './presets'

describe('energy cost', () => {
  it('opens on the Washington averages and a whole chiller plant', () => {
    const s = initialState('hot')
    expect(s.fuelPrice).toBe(GAS_DEFAULT)
    expect(GAS_DEFAULT).toBe(14) // EIA WA commercial 2025 $13.80/MMBtu, 2026 Jan–Jul $14.56
    expect(s.coolPrice).toBe(POWER_DEFAULT)
    expect(POWER_DEFAULT).toBe(0.12) // EIA WA commercial 11.78¢, July 2026
    expect(s.kwPerTon).toBe(KW_PER_TON_DEFAULT)
    expect(KW_PER_TON_DEFAULT).toBe(0.9) // LBNL: whole plant 0.8–1.0
  })

  it('gas: heat lost ÷ boiler efficiency × $/MMBtu (the 100 ft, 24/7 screenshot)', () => {
    const s = { ...initialState('hot'), lengthFt: 100, hours: 8760, fuel: 'gas' as const, fuelPrice: 8, efficiencyPct: 80 }
    const st = costSteps(s, 'hot', 14160)
    expect(st.btuYr / 1e6).toBeCloseTo(12404.16, 2)
    expect(st.bought.unit).toBe('MMBtu')
    expect(st.bought.amount).toBeCloseTo(15505.2, 1)
    expect(st.cost).toBeCloseTo(124041.6, 1)
  })

  it('electric heat: Btu ÷ 3,412 per kWh', () => {
    const s = { ...initialState('hot'), lengthFt: 10, hours: 1000, fuel: 'electric' as const, fuelPrice: 0.12, efficiencyPct: 100 }
    const st = costSteps(s, 'hot', 341.214)
    expect(st.bought.unit).toBe('kWh')
    expect(st.bought.amount).toBeCloseTo(1000, 3)
    expect(st.cost).toBeCloseTo(120, 3)
  })

  it('cooling: Btu ÷ 12,000 per ton-hour × kW/ton × $/kWh', () => {
    const s = { ...initialState('cold'), lengthFt: 100, hours: 8760, coolPrice: 0.12, kwPerTon: 0.9 }
    const st = costSteps(s, 'cold', -119)
    expect(st.tonHr).toBeCloseTo(8687, 0)
    expect(st.bought.amount).toBeCloseTo(7818.3, 1)
    expect(st.cost).toBeCloseTo(938.2, 1)
  })

  it('the shown steps add up to the yearly saving', () => {
    for (const p of PRESETS.filter((x) => x.mode === 'hot' || x.mode === 'cold')) {
      const s = applyPreset(null, p)
      const ev = evaluate(s, p.mode)
      const c = annualCost(s, p.mode, ev)!
      const b = costSteps(s, p.mode, ev.bare.result.qBtuHrFt)
      const i = costSteps(s, p.mode, ev.ins.result.qBtuHrFt)
      expect(b.cost - i.cost).toBeCloseTo(c.saved, 6)
    }
  })

  it('says what is priced and over what run', () => {
    const s = { ...initialState('hot'), lengthFt: 250, hours: 8760 }
    expect(runBasis(s)).toBe('250 LF, running 24/7')
    expect(runBasis({ ...s, hours: 4380 })).toBe('250 LF, 4,380 h/yr')
    expect(priceBasis(s, 'hot')).toBe('natural gas at $14.00/MMBtu, 80% boiler efficiency')
    expect(priceBasis(s, 'cold')).toBe('electricity at $0.120/kWh, cooling equipment 0.90 kW/ton')
  })

  it('each heat source opens on its own efficiency and a price in its unit', () => {
    const gas = { fuel: 'gas' as const, fuelPrice: 14 }
    expect(fuelSwitch(gas, 'steam')).toEqual({ fuel: 'steam', fuelPrice: 14, efficiencyPct: 100 })
    expect(fuelSwitch(gas, 'electric')).toEqual({ fuel: 'electric', fuelPrice: 0.12, efficiencyPct: 100 })
    expect(fuelSwitch({ fuel: 'electric', fuelPrice: 0.19 }, 'heatpump')).toEqual({ fuel: 'heatpump', fuelPrice: 0.19, efficiencyPct: 250 })
    expect(fuelSwitch({ fuel: 'heatpump', fuelPrice: 0.19 }, 'gas')).toEqual({ fuel: 'gas', fuelPrice: 14, efficiencyPct: 80 })
  })

  it('heat pump: Btu ÷ 3,412 per kWh ÷ COP', () => {
    const s = { ...initialState('hot'), lengthFt: 10, hours: 1000, fuel: 'heatpump' as const, fuelPrice: 0.12, efficiencyPct: 250 }
    const st = costSteps(s, 'hot', 341.214)
    expect(st.bought.unit).toBe('kWh')
    expect(st.bought.amount).toBeCloseTo(400, 3)
    expect(st.cost).toBeCloseTo(48, 3)
    expect(priceBasis(s, 'hot')).toBe('heat pump at $0.120/kWh, COP 2.5')
  })

  it('hours a year from hours a day, days a week and months a year', () => {
    const s = initialState('hot')
    expect([s.hoursPerDay, s.daysPerWeek, s.monthsPerYear, s.hours]).toEqual([24, 7, 12, 8760])
    expect(scheduleHours(24, 7, 12)).toBe(8760)
    expect(scheduleHours(24, 7, 6)).toBe(4380)
    expect(scheduleHours(8, 5, 12)).toBe(2086)
    expect(scheduleWords(s)).toBe('24/7, all year')
    expect(scheduleWords({ hoursPerDay: 10, daysPerWeek: 5, monthsPerYear: 8 })).toBe('10 h a day, 5 days a week, 8 months a year')
  })

  it('payback from a cost per LF, in months under a year', () => {
    const s = { ...initialState('hot'), lengthFt: 250, hours: 8760, installedPerFt: 25 }
    const p = PRESETS.find((x) => x.id === 'steam')!
    const st = { ...applyPreset(null, p), lengthFt: 250, installedPerFt: 25 }
    const c = annualCost(st, 'hot', evaluate(st, 'hot'))!
    expect(c.paybackYr).toBeCloseTo((25 * 250) / c.saved, 9)
    expect(runBasis(s)).toBe('250 LF, running 24/7')
    expect(paybackWords(0.35)).toBe('4 months')
    expect(paybackWords(1.4)).toBe('1.4 years (17 months)')
    expect(paybackWords(12.2)).toBe('12 years')
  })

  it('an unknown heat source in a saved file falls back to gas', () => {
    expect(normalize('hot', { fuel: 'coal' as never }).fuel).toBe('gas')
    expect(normalize('hot', { fuel: 'heatpump' }).fuel).toBe('heatpump')
  })
})
