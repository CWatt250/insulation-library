import { describe, expect, it } from 'vitest'
import { curveFrom, moisture, solveCase } from './engine'
import { kIntegral, kMean } from './conductivity'
import { evaluate, recommend } from './model'
import { initialState } from './presets'
import { SPECS } from '../data/specs'

const IN = 0.0254
const fg = curveFrom(SPECS.fiberglass.products[0].k)
const run = (processF: number, ambientF: number, tIn: number, eps = 0.9) =>
  solveCase({ pipeOd: 4.5 * IN, processF, ambientF, windMph: 0, emittance: eps, layers: tIn ? [{ k: fg, rIn: 2.25 * IN, rOut: (2.25 + tIn) * IN }] : [] })

describe('engine', () => {
  it('k at a published mean temperature equals the published k for a linear curve span', () => {
    // 50 and 100°F points bracket 75°F: the mean over 50–100°F must equal the 75°F point (0.23)
    const lo = ((50 - 32) * 5) / 9 + 273.15
    const hi = ((100 - 32) * 5) / 9 + 273.15
    expect(kMean(fg, lo, hi) / 0.144227888).toBeCloseTo(0.23, 2)
    expect(kIntegral(fg, hi, lo)).toBeCloseTo(-kIntegral(fg, lo, hi), 10)
  })
  it('heat flow drops and surface approaches ambient as thickness grows', () => {
    let lastQ = Infinity
    let lastT = Infinity
    for (const t of [0, 0.5, 1, 2, 3, 4]) {
      const r = run(350, 75, t)
      expect(r.qBtuHrFt).toBeLessThan(lastQ)
      expect(r.surfaceF).toBeLessThanOrEqual(lastT + 1e-9)
      expect(r.surfaceF).toBeGreaterThan(75)
      lastQ = r.qBtuHrFt
      lastT = r.surfaceF
    }
  })
  it('energy balance: conduction equals surface loss', () => {
    const r = run(350, 75, 2)
    const Ts = ((r.surfaceF - 32) * 5) / 9 + 273.15
    const Ta = ((75 - 32) * 5) / 9 + 273.15
    const surf = (r.hConv + r.hRad) * (Ts - Ta) * Math.PI * r.outerD
    expect(surf / r.qWm).toBeCloseTo(1, 4)
  })
  it('cold service gains heat and the surface sits between pipe and air', () => {
    const r = run(40, 85, 1)
    expect(r.qBtuHrFt).toBeLessThan(0)
    expect(r.surfaceF).toBeGreaterThan(40)
    expect(r.surfaceF).toBeLessThan(85)
  })
  it('a shiny jacket runs colder on cold work than a high-emittance one', () => {
    expect(run(40, 85, 1, 0.1).surfaceF).toBeLessThan(run(40, 85, 1, 0.9).surfaceF)
  })
  it('condensation only below the dew point, rate grows with the deficit', () => {
    const bare = run(45, 85, 0, 0.8)
    const input = { pipeOd: 4.5 * IN, processF: 45, ambientF: 85, windMph: 0, emittance: 0.8, layers: [] }
    const wet = moisture(input, bare, 80)
    const dryish = moisture(input, bare, 20)
    expect(wet.condensing).toBe(true)
    expect(wet.rateGm2h).toBeGreaterThan(0)
    expect(dryish.condensing).toBe(false)
    expect(dryish.rateGm2h).toBe(0)
  })
})

describe('model', () => {
  it('every preset evaluates to finite numbers', () => {
    for (const mode of ['hot', 'cold', 'condensate'] as const) {
      const ev = evaluate(initialState(mode), mode)
      for (const v of [ev.bare.result.qBtuHrFt, ev.ins.result.qBtuHrFt, ev.ins.result.surfaceF, ev.ins.moisture.dewF]) expect(Number.isFinite(v)).toBe(true)
    }
  })
  it('the condensation recommendation actually keeps the surface dry', () => {
    const s = initialState('condensate')
    const r = recommend(s, 'condensate', { kind: 'noCondensation', marginF: s.dewMarginF })
    expect(r.thicknessIn).not.toBeNull()
    expect(r.side!.moisture.marginF).toBeGreaterThanOrEqual(s.dewMarginF)
  })
})
