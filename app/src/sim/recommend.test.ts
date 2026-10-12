/** Recommendations: every quick fill gives an answer, and the requirements behave as the codes say. */
import { describe, expect, it } from 'vitest'
import { recommendation, START, PIPE_USES, type Answers } from './recommend'
import { PRESETS } from './presets'

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
