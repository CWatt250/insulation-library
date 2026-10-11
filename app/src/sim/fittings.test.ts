/** Fitting equivalent lengths against their sources, and a cross-check against DOE's valve-cover table. */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { equivalentLength } from './fittings'
import { DOE_VALVE_SAVINGS } from './fittingsData'
import { curveFrom, solveCase } from './engine'
import { NPS } from '../data/pipe'
import { SPECS } from '../data/specs'
import { checkSummary } from './testSummary'

const F = JSON.parse(readFileSync(new URL('../../../research/fittings-verified.json', import.meta.url), 'utf8'))
const idx = (nps: string) => NPS.findIndex((p) => p.nps === nps)

describe('fitting equivalent lengths', () => {
  it('C1129 area ÷ pipe area reproduces Hart (F6): NPS 6 class 150 valve = 4.05 LF', () => {
    expect(equivalentLength('valve', idx('6'))!.ft).toBeCloseTo(4.05, 2)
  })
  it('reproduces the Illinois TRM valve and flange table at NPS 2–4, class 150', () => {
    const t = F.equivalent_lengths.find((e: { id: string }) => e.id === 'EL-ILTRM-valve-flange')
    for (const r of t.rows.filter((r: { ansi_class: number; nps: string }) => r.ansi_class === 150 && r.nps !== '1')) {
      expect(Math.abs(equivalentLength('valve', idx(r.nps))!.ft - r.valve_ft), `valve ${r.nps}`).toBeLessThan(0.02)
      expect(Math.abs(equivalentLength('flange', idx(r.nps))!.ft - r.flange_ft), `flange ${r.nps}`).toBeLessThan(0.02)
    }
  })
  it('elbow and tee come straight from the TRM table, interpolated between sizes', () => {
    expect(equivalentLength('elbow', idx('6'))!.ft).toBeCloseTo(2.13, 5)
    expect(equivalentLength('tee', idx('12'))!.ft).toBeCloseTo(2.5, 5)
    const e15 = equivalentLength('elbow', idx('1-1/2'))!
    expect(e15.interpolated).toBe(true)
    expect(e15.ft).toBeCloseTo((0.3 + 0.66) / 2, 5)
    expect(equivalentLength('elbow', idx('1/2'))).toBeNull()
  })
})

/**
 * DOE Steam Tip Sheet #17 (F1): savings from a 1" removable valve pad, class 150,
 * 65°F ambient, still air. The pad's k and surface emittance are not printed, so
 * this uses OC fiberglass k and emittance 0.9 — a cross-check, not a match.
 */
describe('DOE valve-cover cross-check (informational)', () => {
  it('savings land in the same range', () => {
    const k = curveFrom(SPECS.fiberglass.products[0].k)
    const errs: string[] = []
    const all: number[] = []
    let worst = 0
    for (const row of DOE_VALVE_SAVINGS) {
      for (const [n, pub] of Object.entries(row.byNps)) {
        const i = idx(String(n))
        const od = NPS[i].od * 0.0254
        const bare = solveCase({ pipeOd: od, processF: row.tempF, ambientF: 65, windMph: 0, layers: [], emittance: 0.8 })
        const ins = solveCase({ pipeOd: od, processF: row.tempF, ambientF: 65, windMph: 0, emittance: 0.9, layers: [{ k, rIn: od / 2, rOut: od / 2 + 0.0254 }] })
        const saved = equivalentLength('valve', i)!.ft * (bare.qBtuHrFt - ins.qBtuHrFt)
        const e = saved / pub - 1
        worst = Math.max(worst, Math.abs(e))
        all.push(e)
        errs.push(`${n}"@${row.tempF}F ${(e * 100).toFixed(0)}%`)
      }
    }
    console.log('DOE #17 cross-check:', errs.join(' '))
    const sorted = all.sort((a, b) => a - b)
    checkSummary('doeValve', { n: sorted.length, medianPct: Math.round(sorted[Math.floor(sorted.length / 2)] * 100), worstPct: Math.round(worst * 100) })
    expect(worst).toBeLessThan(0.4)
  })
})
