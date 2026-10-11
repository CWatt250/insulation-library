/** Pipe materials: sizes, size mapping between materials, copper insulation ODs, and old scenarios. */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PIPE_PROPS, PIPE_WALLS } from '../data/pipeWalls'
import { evaluateSide } from './model'
import { initialState } from './presets'
import { equivalentIndex, npsValue, pipeSizes, pipeSpec } from '../data/pipes'
import { geometry } from './model'
import { normalize } from './scenarios'

describe('pipe sizes', () => {
  it('lists each material in ascending size with a wall thinner than the radius', () => {
    for (const m of ['steel', 'copper', 'pvc'] as const) {
      const list = pipeSizes(m)
      expect(list.length).toBeGreaterThan(5)
      list.forEach((p, i) => {
        expect(p.wall).toBeGreaterThan(0)
        expect(p.wall).toBeLessThan(p.od / 2)
        if (i) expect(p.od).toBeGreaterThan(list[i - 1].od)
      })
    }
  })
  it('copper tube OD is nominal + 1/8" (CDA)', () => {
    for (const p of pipeSizes('copper')) expect(p.od).toBeCloseTo(npsValue(p.nps) + 0.125, 3)
  })
  it('keeps the nominal size when switching material', () => {
    const steel4 = pipeSizes('steel').findIndex((p) => p.nps === '4')
    expect(pipeSpec('copper', equivalentIndex('steel', steel4, 'copper')).nps).toBe('4')
    expect(pipeSpec('pvc', equivalentIndex('steel', steel4, 'pvc')).nps).toBe('4')
  })
  it('uses the copper-tube C585 insulation OD', () => {
    const i = pipeSizes('copper').findIndex((p) => p.nps === '1')
    // 1" nominal copper tube (1-1/8" OD), 1" insulation: 2.875" OD (Sproule D6)
    expect(geometry(i, 1, false, 'copper').insOdIn).toBe(2.875)
    expect(geometry(i, 1, false, 'copper').c585).toBe(true)
  })
})

describe('scenarios from before pipe materials', () => {
  it('default to steel and reject unknown materials', () => {
    expect(normalize('hot', { processF: 300 }).pipe).toBe('steel')
    expect(normalize('hot', { pipe: 'lead' as never }).pipe).toBe('steel')
    expect(normalize('cold', { pipe: 'copper' }).pipe).toBe('copper')
  })
})

describe('PVC pipe wall', () => {
  const R = JSON.parse(readFileSync(new URL('../../../research/pipe-materials-verified.json', import.meta.url), 'utf8'))
  it("reproduces Charlotte's published Sch 40 wall R-values (wall ÷ k) [G3 p. 82]", () => {
    let n = 0
    for (const row of R.pvc.pipe_wall_r_values.rows) {
      if (typeof row.pvc_sch40_r_value !== 'number' || !PIPE_WALLS.pvc40[row.nominal_in]) continue
      expect(PIPE_WALLS.pvc40[row.nominal_in].wall / PIPE_PROPS.pvc!.kIp!, row.nominal_in).toBeCloseTo(row.pvc_sch40_r_value, 2)
      n++
    }
    expect(n).toBeGreaterThan(10)
  })
  it('warms the surface of a bare cold PVC line above the fluid, but not to the air', () => {
    const s = { ...initialState('condensate'), pipe: 'pvc' as const, processF: 55, ambientF: 80, rh: 60 }
    s.npsIndex = pipeSizes('pvc').findIndex((p) => p.nps === '1')
    const pvc = evaluateSide(s, 'condensate', null)
    const steel = evaluateSide({ ...s, pipe: 'steel', npsIndex: pipeSizes('steel').findIndex((p) => p.nps === '1') }, 'condensate', null)
    expect(pvc.result.surfaceF).toBeGreaterThan(55.5)
    expect(pvc.result.surfaceF).toBeLessThan(80)
    // the wall cuts the heat gain against a same-OD steel pipe (whose emittance is also lower: 0.8 vs 0.9)
    expect(Math.abs(pvc.result.qBtuHrFt)).toBeLessThan(Math.abs(steel.result.qBtuHrFt))
  })
  it('leaves metal pipe at the fluid temperature', () => {
    const s = { ...initialState('hot'), pipe: 'copper' as const }
    expect(evaluateSide(s, 'hot', null).result.surfaceF).toBeCloseTo(s.processF, 6)
  })
})

describe('inch labels', () => {
  it('print fractions to the sixteenth and decimals otherwise', async () => {
    const { inchLabel } = await import('./units')
    expect(inchLabel(2.1875)).toBe('2-3/16"')
    expect(inchLabel(1.5)).toBe('1-1/2"')
    expect(inchLabel(0.375)).toBe('3/8"')
    expect(inchLabel(3.15)).toBe('3.15"')
    expect(inchLabel(0.79)).toBe('0.79"')
  })
})
