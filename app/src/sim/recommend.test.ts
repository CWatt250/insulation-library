/** Recommendations: every quick fill gives an answer, and the requirements behave as the codes say. */
import { describe, expect, it } from 'vitest'
import { recommendation, START, PIPE_USES, type Answers } from './recommend'
import { PRESETS } from './presets'
import { pipeSizes } from '../data/pipes'
import { vaporCheck } from './vapor'

const use = (id: string): Partial<Answers> => {
  const p = PRESETS.find((x) => x.id === id)!
  return { processF: p.set.processF, ambientF: p.set.ambientF, rh: p.set.rh ?? 50, drain: p.mode === 'condensate' }
}

describe('recommendations', () => {
  it('give a thickness for every "what does it carry" quick fill, on every pipe material', () => {
    for (const u of PIPE_USES) {
      for (const pipe of ['steel', 'copper', 'pvc'] as const) {
        const a: Answers = { ...START, pipe, ...use(u.id) }
        // PVC is rated to 140°F: skip the hot services there
        if (pipe === 'pvc' && a.processF > 140) continue
        const r = recommendation(a)
        expect(r.d.thicknessIn, `${u.id} on ${pipe}`).not.toBeNull()
        // cold work: the recommended surface stays at least the margin above the dew point
        if (r.mode !== 'hot') expect(r.ev.ins.moisture.marginF, `${u.id} on ${pipe}`).toBeGreaterThanOrEqual(r.s.dewMarginF - 1e-6)
      }
    }
  })
  it('send drains to the condensate rules, warm lines to hot, cold lines to cold', () => {
    expect(recommendation({ ...START, ...use('cd-drain') }).mode).toBe('condensate')
    expect(recommendation({ ...START, ...use('steam'), pipe: 'steel' }).mode).toBe('hot')
    expect(recommendation({ ...START, ...use('chws') }).mode).toBe('cold')
  })
  it('include the energy code: ASHRAE 90.1 pipe minimum, and the duct table', () => {
    const pipe = recommendation({ ...START, ...use('chws'), pipe: 'steel' })
    expect(pipe.d.rows.some((r) => r.c.id === 'code')).toBe(true)
    const duct = recommendation({ ...START, system: 'duct', processF: 55, ambientF: 95, rh: 60 })
    const code = duct.d.rows.find((r) => r.c.id === 'code')!
    expect(code.c.goal).toEqual({ kind: 'minR', R: 8 }) // attic → Exterior column, zone 4
    expect((duct.ev.ins.ratedR ?? 0)).toBeGreaterThanOrEqual(8)
  })
  it('honour a chosen insulation', () => {
    const r = recommendation({ ...START, material: 'elastomeric' })
    expect(r.pick).toBe('elastomeric')
    expect(r.s.insulation).toBe('elastomeric')
  })
})

describe('pipe energy codes', () => {
  it('IECC commercial matches 90.1 thickness on the same row; residential asks R-3', () => {
    const base = { ...START, ...use('chws'), pipe: 'steel' as const }
    const ashrae = recommendation({ ...base, pipeCode: 'ashrae' }).d.rows.find((r) => r.c.id === 'code')!
    const iecc = recommendation({ ...base, pipeCode: 'iecc' }).d.rows.find((r) => r.c.id === 'code')!
    expect(iecc.c.label).toContain('IECC 2021 commercial')
    expect((iecc.c.goal as { in: number }).in).toBeCloseTo((ashrae.c.goal as { in: number }).in, 6)
    const res = recommendation({ ...base, pipeCode: 'iecc-res' }).d.rows.find((r) => r.c.id === 'code')!
    expect(res.c.label).toContain('R-3')
  })
  it('residential R-3 by the IECC pipe R-value, R = ro·ln(ro/ri)/k', async () => {
    const { pipeR } = await import('./code')
    // 1" copper (1.125" OD), 1/2" at k 0.25: ro = 1.0625, ri = 0.5625 → R ≈ 2.70
    expect(pipeR(1.125, 0.5, 0.25)).toBeCloseTo((1.0625 * Math.log(1.0625 / 0.5625)) / 0.25, 9)
  })
})

describe('the answer is what an insulator would use', () => {
  const idx = (p: 'steel' | 'copper' | 'pvc', n: string) => pipeSizes(p).findIndex((x) => x.nps === n)
  it('400°F steel, 4", Washington: fiberglass 5" in two layers, not aerogel', () => {
    const r = recommendation({ ...START, system: 'pipe', pipe: 'steel', npsIndex: idx('steel', '4'), processF: 400, ambientF: 80, rh: 50, pipeCode: 'wsec' })
    expect(r.pick).toBe('fiberglass')
    expect(r.d.thicknessIn).toBe(5)
    expect(r.d.layers).toBe(2)
    expect(r.options[0].id).toBe('fiberglass')
  })
  it('chilled water and domestic hot water: fiberglass; drains and refrigerant: elastomeric', () => {
    expect(recommendation({ ...START, system: 'pipe', pipe: 'steel', npsIndex: idx('steel', '4'), processF: 42, ambientF: 80, rh: 70, pipeCode: 'wsec' }).pick).toBe('fiberglass')
    expect(recommendation({ ...START, system: 'pipe', pipe: 'copper', npsIndex: idx('copper', '1'), processF: 140, ambientF: 75, rh: 50, pipeCode: 'wsec' }).pick).toBe('fiberglass')
    expect(recommendation({ ...START, system: 'pipe', pipe: 'pvc', npsIndex: idx('pvc', '3/4'), drain: true, processF: 55, ambientF: 78, rh: 60 }).pick).toBe('elastomeric')
    expect(recommendation({ ...START, system: 'pipe', pipe: 'copper', npsIndex: idx('copper', '3/4'), processF: 40, ambientF: 85, rh: 60 }).pick).toBe('elastomeric')
  })
  it('a return duct in conditioned space needs nothing', () => {
    const r = recommendation({ ...START, system: 'duct', processF: 75, ambientF: 75, rh: 50, duct: { ...START.duct, ductType: 'return', ductCodeBasis: 'wsec', ductLocation: 'conditioned' } })
    expect(r.d.noneNeeded).toBe(true)
  })
  it('vapor: ducts are held to IMC 604.11 (0.05 perm), pipes to ASHRAE guidance', () => {
    const roof = recommendation({ ...START, system: 'duct', processF: 55, ambientF: 95, rh: 55, duct: { ...START.duct, ductCodeBasis: 'wsec', ductLocation: 'exterior', ductShape: 'rect', ductW: 36, ductH: 18 } })
    expect(roof.pick).toBe('polyiso')
    const v = vaporCheck(roof.s, roof.mode, roof.ev.ins)!
    expect(v.required).toBe(0.05)
    expect(v.tone).toBe('good')
    const drain = recommendation({ ...START, system: 'pipe', pipe: 'pvc', npsIndex: idx('pvc', '3/4'), drain: true, processF: 55, ambientF: 78, rh: 60 })
    const d = vaporCheck(drain.s, drain.mode, drain.ev.ins)!
    expect(d.code).toBe(false)
    expect(d.tone).toBe('warn')
  })
})
