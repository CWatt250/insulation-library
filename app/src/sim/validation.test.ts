/**
 * Checks the engine against published results (research/validation-cases.json).
 * Prints a comparison and fails if agreement drops below the stated bands.
 * The published tables are rounded and their exact k-curves and dimensions are
 * not always stated, so tolerances are bands, not exact matches.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { curveFrom, moisture, solveCase } from './engine'
import { C585_OD } from './c585'
import { dewPointF } from './psychro'
import { NPS } from '../data/pipe'

const V = JSON.parse(readFileSync(new URL('../../../research/validation-cases.json', import.meta.url), 'utf8'))
const kase = (id: string) => V.cases.find((c: { id: string }) => c.id === id)
const IN = 0.0254
const OD: Record<string, number> = Object.fromEntries(NPS.map((p) => [p.nps, p.od]))
OD['3-1/2'] = 4.0
const norm = (n: string | number) => String(n).replace(/\s+/g, '-').replace('"', '')
const insOd = (nps: string, t: number) => C585_OD[nps]?.[String(t)] ?? OD[nps] + 2 * t

function stats(errs: number[]) {
  const a = errs.map(Math.abs).sort((x, y) => x - y)
  return { n: a.length, median: a[Math.floor(a.length / 2)], p90: a[Math.floor(a.length * 0.9)], max: a[a.length - 1] }
}
const pct = (x: number) => `${(x * 100).toFixed(1)}%`

describe('ASHRAE Fundamentals Table 17, bare steel pipe to still 80°F air (CASE-08)', () => {
  it('heat loss, Btu/h·ft (table emittance not printed; ε 0.8 = ASHRAE "iron or steel")', () => {
    const c = kase('CASE-08')
    const errs: number[] = []
    for (const row of c.outputs.table_17_bare_steel) {
      const nps = norm(row.nps_in)
      if (!OD[nps]) continue
      c.inputs.process_temperature_F['Table 17'].forEach((T: number, j: number) => {
        const r = solveCase({ pipeOd: OD[nps] * IN, processF: T, ambientF: 80, windMph: 0, layers: [], emittance: 0.8 })
        errs.push(r.qBtuHrFt / row.btu_hr_ft[j] - 1)
      })
    }
    const s = stats(errs)
    console.log(`CASE-08 ASHRAE bare steel: n=${s.n} median ${pct(s.median)} p90 ${pct(s.p90)} max ${pct(s.max)}`)
    expect(s.median).toBeLessThan(0.015)
    expect(s.max).toBeLessThan(0.035)
  })
})

describe('NIA Mechanical Insulation Design Guide calculators, bare pipe (CASE-13, CASE-14)', () => {
  it('3" NPS at 350°F, 75°F air, 8 mph wind (forced + natural convection)', () => {
    const pub = kase('CASE-13').outputs.rows.find((r: { thickness_in: number }) => r.thickness_in === 0).heat_loss_btu_hr
    const r = solveCase({ pipeOd: OD['3'] * IN, processF: 350, ambientF: 75, windMph: 8, layers: [], emittance: 0.8 })
    console.log(`CASE-13 bare: engine ${r.qBtuHrFt.toFixed(0)} vs ${pub} Btu/h·ft`)
    expect(Math.abs(r.qBtuHrFt / pub - 1)).toBeLessThan(0.02)
  })
  it('4" NPS at 40°F, 80°F still air (heat gain)', () => {
    const pub = kase('CASE-14').outputs.rows.find((r: { thickness_in: number }) => r.thickness_in === 0).heat_flow_btu_hr_ft
    const r = solveCase({ pipeOd: OD['4'] * IN, processF: 40, ambientF: 80, windMph: 0, layers: [], emittance: 0.8 })
    console.log(`CASE-14 bare: engine ${Math.abs(r.qBtuHrFt).toFixed(1)} vs ${pub} Btu/h·ft`)
    expect(Math.abs(Math.abs(r.qBtuHrFt) / pub - 1)).toBeLessThan(0.02)
  })
})

/**
 * JM's guidebook tables come from an unstated 3E Plus version, and its insulated
 * rows imply a k-curve well above Micro-Lok's published typical values (which
 * one JM entered is not stated). Reported for the record; the bands only catch
 * regressions, they do not claim agreement.
 */
describe('JM Micro-Lok HP 3E Plus tables (CASE-03, informational)', () => {
  const c = kase('CASE-03')
  const k = curveFrom(c.inputs.insulation.k_curve_published_in_same_guidebook.map((p: { mean_F: number; k: number }) => ({ meanF: p.mean_F, k: p.k })))
  const bareErr: number[] = []
  const hlErr: number[] = []
  const stErr: number[] = []
  for (const tab of c.outputs.tables) {
    const nps = norm(tab.nps_in)
    if (!OD[nps]) continue
    tab.columns_pipe_temp_F.forEach((T: number, j: number) => {
      for (const row of tab.rows) {
        const hl = row.HL_btu_hr_ft[j]
        const st = row.ST_F[j]
        if (row.thickness_in === 'bare') {
          if (tab.outer_emittance !== 0.9) continue // bare rows repeat in both tables
          const r = solveCase({ pipeOd: OD[nps] * IN, processF: T, ambientF: 80, windMph: 0, layers: [], emittance: 0.8 })
          bareErr.push(r.qBtuHrFt / hl - 1)
          continue
        }
        const t = Number(row.thickness_in)
        if (t > 5) continue // beyond the C585 data on file
        const r = solveCase({
          pipeOd: OD[nps] * IN, processF: T, ambientF: 80, windMph: 0, emittance: tab.outer_emittance,
          layers: [{ k, rIn: (OD[nps] * IN) / 2, rOut: (insOd(nps, t) * IN) / 2 }],
        })
        // printed heat losses are whole numbers: only judge values large enough for the rounding not to dominate
        if (hl >= 20) hlErr.push(r.qBtuHrFt / hl - 1)
        stErr.push(r.surfaceF - st)
      }
    })
  }
  it('bare steel pipe heat loss (ε 0.8, 80°F, still air)', () => {
    const s = stats(bareErr)
    console.log(`CASE-03 bare: n=${s.n} median ${pct(s.median)} p90 ${pct(s.p90)} max ${pct(s.max)}`)
    expect(s.median).toBeLessThan(0.07)
  })
  it('insulated heat loss and surface temperature', () => {
    const h = stats(hlErr)
    const t = stats(stErr)
    console.log(`CASE-03 insulated HL: n=${h.n} median ${pct(h.median)} p90 ${pct(h.p90)} max ${pct(h.max)}`)
    console.log(`CASE-03 insulated ST: n=${t.n} median ${t.median.toFixed(2)}°F p90 ${t.p90.toFixed(2)}°F max ${t.max.toFixed(2)}°F`)
    expect(h.median).toBeLessThan(0.15)
    expect(t.median).toBeLessThan(8)
  })
})

describe('3E Plus sample printout (CASE-12)', () => {
  it('bare 4" steel pipe at 850°F, 75°F still air, ε 0.8', () => {
    const c = kase('CASE-12')
    const bare = c.outputs.rows.find((r: { thickness_in: unknown }) => r.thickness_in === 'Bare')
    const r = solveCase({ pipeOd: OD['4'] * IN, processF: 850, ambientF: 75, windMph: 0, layers: [], emittance: 0.8 })
    console.log(`CASE-12 bare: engine ${r.qBtuHrFt.toFixed(0)} vs 3E Plus ${bare.heat_loss_btu_hr_ft} Btu/hr·ft (3E Plus surface ${bare.surface_temp_F}°F)`)
    expect(Math.abs(r.qBtuHrFt / bare.heat_loss_btu_hr_ft - 1)).toBeLessThan(0.03)
  })
})

describe('Dew point (CASE-14)', () => {
  it('80°F at 80% RH', () => {
    const c = kase('CASE-14')
    const d = dewPointF(80, 80)
    console.log(`CASE-14 dew point: ${d.toFixed(2)}°F vs ${c.outputs.dew_point_F}°F`)
    expect(Math.abs(d - c.outputs.dew_point_F)).toBeLessThan(0.15)
  })
})

describe('OC SSL II condensation-control table (CASE-01)', () => {
  it('required thickness, 16" NPS, ε 0.9, still air, 0.75°F margin', () => {
    const c = kase('CASE-01')
    const k = curveFrom(c.inputs.insulation.k_curve_published_on_same_sheet.map((p: { mean_F: number; k: number }) => ({ meanF: p.mean_F, k: p.k })))
    const frac = (s: string) => s.split('-').reduce((a, p) => a + (p.includes('/') ? Number(p.split('/')[0]) / Number(p.split('/')[1]) : Number(p)), 0)
    let exact = 0, within = 0, n = 0
    const misses: string[] = []
    for (const row of c.outputs.rows) {
      c.outputs.columns_process_temperature_F.forEach((T: number, j: number) => {
        const want = frac(row.thickness_in[j])
        let got: number | null = null
        for (let t = 0.5; t <= 6; t += 0.5) {
          const input = { pipeOd: 16 * IN, processF: T, ambientF: row.ambient_F, windMph: 0, emittance: 0.9, layers: [{ k, rIn: 8 * IN, rOut: ((16 + 2 * t) * IN) / 2 }] }
          const r = solveCase(input)
          if (moisture(input, r, row.rh_pct).marginF >= 0.75) { got = t; break }
        }
        n++
        if (got === want) exact++
        if (got !== null && Math.abs(got - want) <= 0.5) within++
        else misses.push(`${row.ambient_F}°F/${row.rh_pct}% ${T}°F: ${got} vs ${want}`)
      })
    }
    console.log(`CASE-01: ${exact}/${n} exact, ${within}/${n} within ½"${misses.length ? ` · off: ${misses.join('; ')}` : ''}`)
    expect(within / n).toBeGreaterThan(0.9)
  })
})
