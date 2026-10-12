/**
 * Ductwork: flat-surface correlations against published C680 / 3E Plus results
 * (research/duct-verified.json), the duct wrap's rated R, the code table, and
 * the duct solver's physics.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { flatCoeffs } from './surface'
import { ductCodeR, ductCover, ductKPoints, ductRequirement, ductStage, installedIn, placeDuct, ratedR, solveDuct } from './duct'
import { DUCT_BOARD, DUCT_POLYISO, DUCT_WRAP } from '../data/ductData'
import { normalize } from './scenarios'
import { kCurve, kMean } from './conductivity'
import { initialState } from './presets'
import { fToK } from './units'
import { checkSummary } from './testSummary'

const D = JSON.parse(readFileSync(new URL('../../../research/duct-verified.json', import.meta.url), 'utf8'))
const AC = Object.values(D.methods_notes).find((v) => Array.isArray(v) && (v as { id?: string }[])[0]?.id === 'AC1') as { id: string; rows?: { table: string; Ts: number; wind_mph: number; Q_Btu_h: number }[] }[]
const H_SI = 5.678263
const FT = 0.3048

describe('flat-surface correlations', () => {
  it("reproduce DNV's 12 bare flat-surface C680 rows (10 ft × 10 ft, 90°F air, ε 0.8) [U1]", () => {
    const rows = AC.find((x) => x.id === 'AC1')!.rows!
    const errs = rows.map((r) => {
      const face = r.table.includes('vertical') ? 'vertical' : r.table.includes('top') ? 'top' : 'bottom'
      // vertical: L = 10 ft height; horizontal: L = A/P = 100 ft² / 40 ft
      const h = flatCoeffs(fToK(r.Ts), fToK(90), face, face === 'vertical' ? 10 * FT : 2.5 * FT, 0.8, r.wind_mph)
      const q = (h.h / H_SI) * (r.Ts - 90) * 100
      return Math.abs(q / r.Q_Btu_h - 1)
    })
    expect(rows.length).toBe(12)
    expect(Math.max(...errs)).toBeLessThan(0.0005)
    checkSummary('dnvFlat', { n: rows.length, maxPct: +(Math.max(...errs) * 100).toFixed(2) })
  })

  it('reproduce 3E Plus v4.1 Example 5: cold vertical surface, 10 mph [U15]', () => {
    // bare steel −10°F in 80°F air: 234.80 Btu/h·ft² (screenshot); insulated rows: outer balance at the printed surface temperature
    const bare = (flatCoeffs(fToK(-9.9), fToK(80), 'vertical', 10 * FT, 0.8, 10).h / H_SI) * (80 + 9.9)
    expect(bare).toBeCloseTo(234.8, 0)
    const rows: [number, number][] = [[65.0, 26.99], [71.7, 14.81], [74.2, 10.22], [75.6, 7.8], [76.4, 6.31], [77.0, 5.29], [77.4, 4.56]]
    const worst = Math.max(...rows.map(([ts, q]) => Math.abs((flatCoeffs(fToK(ts), fToK(80), 'vertical', 10 * FT, 0.1, 10).h / H_SI) * (80 - ts) - q)))
    expect(worst).toBeLessThan(0.1) // the printed surface temperatures are rounded to 0.1°F
    checkSummary('e3plusEx5', { bare: +bare.toFixed(2), published: 234.8, insulatedWorstBtuHrFt2: +worst.toFixed(2) })
  })

  it('are continuous across the vertical laminar/turbulent switch', () => {
    const at = (L: number) => flatCoeffs(fToK(140), fToK(70), 'vertical', L, 0.9, 0).hConv
    // Ra crosses 1e9 near L ≈ 3 ft at a 70°F difference: no jump bigger than the length effect itself
    const hs = [2.6, 2.8, 3.0, 3.2, 3.4].map((ft) => at(ft * FT))
    for (let i = 1; i < hs.length; i++) expect(Math.abs(hs[i] / hs[i - 1] - 1)).toBeLessThan(0.08)
  })
})

describe('duct wrap and board data', () => {
  it("reproduce JM's printed installed R: installed thickness ÷ installed k at 75°F (Microlite FSK) [U23]", () => {
    for (const id of ['wrap75', 'wrap100', 'wrap150'] as const) {
      const k = kCurve(ductKPoints(id))
      const k75 = kMean(k, fToK(75), fToK(75.0001)) / 0.144227888
      const type = DUCT_WRAP.types[id.slice(4) as '75' | '100' | '150']
      expect(k75).toBeCloseTo(type.kInstalled75, 3)
      for (const t of type.thicknesses) {
        // the printed k is rounded to 0.01 (±0.005 on 0.23–0.27 is about ±2 %); the makers' R uses their unrounded k
        expect(Math.abs(installedIn(id, t.nominalIn) / k75 / t.installedR - 1), `${id} ${t.nominalIn}`).toBeLessThan(0.025)
        expect(ratedR(id, t.nominalIn)).toBe(t.installedR)
      }
    }
  })
  it("rates JM 814 board at its printed R, uncompressed; Micro-Flex at thickness ÷ printed k [U64, U65]", () => {
    for (const shape of ['rect', 'round'] as const) {
      const k75 = DUCT_BOARD[shape].k.find((p) => p.meanF === 75)!.k
      for (const t of DUCT_BOARD[shape].thicknesses) {
        expect(ratedR('board', t.nominalIn, shape)).toBe(t.R)
        expect(installedIn('board', t.nominalIn)).toBe(t.nominalIn)
        // printed R and printed k agree to rounding (814: R-8.7 at 2" vs 2 ÷ 0.23 = 8.70)
        expect(Math.abs(t.nominalIn / k75 / t.R - 1), `${shape} ${t.nominalIn}`).toBeLessThan(0.025)
      }
    }
    expect(DUCT_BOARD.rect.thicknesses.find((t) => t.nominalIn === 2)!.R).toBe(8.7)
    expect(DUCT_BOARD.round.thicknesses.every((t) => t.calc)).toBe(true)
  })
})

describe('indoors and outdoors', () => {
  const s = initialState('duct')
  it('opens indoors in FSK duct wrap, 0.75 pcf, in the mech room', () => {
    expect(s.ductLocation).not.toBe('exterior')
    expect(s.ductIns).toBe('wrap75')
    expect(ductCover(s)).toEqual({ facing: 'fsk', jacket: 'none' })
    expect(ductStage(s)).toBe('room')
  })
  it('goes outdoors in XSPECT polyiso (rectangular) or Micro-Flex (round) under aluminum, and back into wrap indoors', () => {
    expect(s.ductShape).toBe('round')
    const out = { ...s, ...placeDuct(s, { ductLocation: 'exterior' }) }
    expect(out.ductIns).toBe('board') // round: Micro-Flex
    expect(ductCover(out)).toEqual({ facing: 'fsk', jacket: 'alu' })
    expect(ductStage(out)).toBe('plant')
    expect(DUCT_BOARD.round.thicknesses.map((t) => t.nominalIn)).toContain(out.thicknessIn)
    // rectangular outdoors: JM's rooftop duct board
    const rect = { ...out, ...placeDuct(out, { ductShape: 'rect' }) }
    expect(rect.ductIns).toBe('polyiso')
    expect(ductCover(rect).jacket).toBe('alu')
    expect(DUCT_POLYISO.thicknesses.map((t) => t.nominalIn)).toContain(rect.thicknessIn)
    const rectOut = { ...s, ductShape: 'rect' as const, ...placeDuct({ ...s, ductShape: 'rect' }, { ductLocation: 'exterior' }) }
    expect(rectOut.ductIns).toBe('polyiso')
    const back = { ...rect, ...placeDuct(rect, { ductLocation: 'attic' }) }
    expect(back.ductIns).toBe('wrap75')
    expect(ductCover(back).jacket).toBe('none')
    expect(ductStage(back)).toBe('room')
    // indoor to indoor changes nothing else
    expect(placeDuct(s, { ductLocation: 'crawl' })).toEqual({ ductLocation: 'crawl' })
  })
  it('rates XSPECT polyiso at JM\'s printed aged R, k 0.16 held constant [U67]', () => {
    for (const t of DUCT_POLYISO.thicknesses) expect(ratedR('polyiso', t.nominalIn)).toBe(t.R)
    expect(ratedR('polyiso', 1.5)).toBe(9.3)
    const k = kCurve(ductKPoints('polyiso'))
    expect(kMean(k, fToK(40), fToK(120)) / 0.144227888).toBeCloseTo(0.16, 4)
  })
  it('opens an older outdoor file with wrap in board', () => {
    const n = normalize('duct', { ...s, ductLocation: 'exterior', ductIns: 'elastomeric' as never, thicknessIn: 2 })
    expect(n.ductIns).toBe('board')
  })
})

describe('ASHRAE 90.1-2019 Table 6.8.2 [C19]', () => {
  it('reads the table', () => {
    expect(ductCodeR('both', 4, 'unconditioned')).toBe(6)
    expect(ductCodeR('both', 5, 'exterior')).toBe(12)
    expect(ductCodeR('both', 3, 'exterior')).toBe(8)
    expect(ductCodeR('both', 6, 'indirect')).toBe(1.9)
    expect(ductCodeR('heating', 1, 'unconditioned')).toBeNull()
    expect(ductCodeR('cooling', 7, 'exterior')).toBe(1.9)
  })
})

describe('duct location → code column (90.1-2019 notes b, c, d; exception 2)', () => {
  it('maps every location', () => {
    // note b: attics above insulated ceilings, parking garages and crawl spaces are Exterior
    expect(ductRequirement('supply', 'attic', 'both', 4).R).toBe(8)
    expect(ductRequirement('supply', 'crawl', 'both', 6).R).toBe(12)
    expect(ductRequirement('supply', 'garage', 'both', 2).R).toBe(8)
    expect(ductRequirement('supply', 'exterior', 'both', 5).R).toBe(12)
    expect(ductRequirement('supply', 'unconditioned', 'both', 4).R).toBe(6)
    expect(ductRequirement('supply', 'buried', 'both', 7).R).toBe(6)
    expect(ductRequirement('supply', 'indirect', 'both', 4).R).toBe(1.9)
    // note d: return ducts in indirectly conditioned space need none
    expect(ductRequirement('return', 'indirect', 'both', 4).R).toBeNull()
    expect(ductRequirement('return', 'indirect', 'both', 4).pending).toBeFalsy()
    // exception 2: heated, semiheated or cooled spaces
    expect(ductRequirement('supply', 'conditioned', 'both', 4).R).toBeNull()
    expect(ductRequirement('supply', 'conditioned', 'both', 4).pending).toBeFalsy()
  })
})

describe('IECC 2021/2024 commercial (C403.12.1 / C403.13.1) and duct types outside both codes', () => {
  it('maps locations and the 15°F exception', () => {
    expect(ductRequirement('supply', 'exterior', 'both', 4, 'iecc', 30).R).toBe(8)
    expect(ductRequirement('supply', 'exterior', 'both', 5, 'iecc', 30).R).toBe(12)
    expect(ductRequirement('supply', 'unconditioned', 'both', 7, 'iecc', 30).R).toBe(6)
    // attics, crawl spaces and garages: "unconditioned space" is DOE's reading, flagged as derived
    const attic = ductRequirement('supply', 'attic', 'both', 4, 'iecc', 30)
    expect(attic.R).toBe(6)
    expect(attic.derived).toBe(true)
    expect(ductRequirement('supply', 'buried', 'both', 4, 'iecc', 30).notStated).toBe(true)
    expect(ductRequirement('supply', 'indirect', 'both', 4, 'iecc', 30).R).toBeNull()
    expect(ductRequirement('supply', 'conditioned', 'both', 4, 'iecc', 30).R).toBeNull()
    // exception 2: design temperature difference not over 15°F
    expect(ductRequirement('supply', 'exterior', 'both', 4, 'iecc', 15).R).toBeNull()
  })
  it('sets no R-value for outside-air or exhaust ducts in either code (supply and return only)', () => {
    for (const basis of ['ashrae', 'iecc'] as const) {
      for (const type of ['outdoor', 'exhaust'] as const) {
        const r = ductRequirement(type, 'attic', 'both', 4, basis, 30)
        expect(r.R).toBeNull()
        expect(r.notStated).toBe(true)
      }
    }
  })
})

describe('duct solver', () => {
  const cold = { ...initialState('cold'), system: 'duct' as const, processF: 55, ambientF: 85, rh: 70, ductShape: 'rect' as const, ductW: 24, ductH: 12 }
  it('bare: the sheet sits at the air temperature (no inside film)', () => {
    const r = solveDuct(cold, 'cold', null)
    for (const f of r.faces) expect(f.surfaceF).toBeCloseTo(55, 6)
  })
  it('the inside film warms a bare cold duct, but not past the room', () => {
    const r = solveDuct({ ...cold, insideFilm: true, airFpm: 1000 }, 'cold', null)
    for (const f of r.faces) {
      expect(f.surfaceF).toBeGreaterThan(55.5)
      expect(f.surfaceF).toBeLessThan(85)
    }
  })
  it('a cold duct runs coldest on top, a warm duct hottest underneath (stable faces)', () => {
    const c = solveDuct(cold, 'cold', 1.5).faces
    const top = c.find((f) => f.face === 'top')!
    expect(c.every((f) => f.surfaceF >= top.surfaceF - 1e-9)).toBe(true)
    const h = solveDuct({ ...cold, processF: 120, ambientF: 60 }, 'hot', 1.5).faces
    const bottom = h.find((f) => f.face === 'bottom')!
    expect(h.every((f) => f.surfaceF <= bottom.surfaceF + 1e-9)).toBe(true)
  })
  it('heat per foot is the faces summed, and thicker wrap cuts it', () => {
    const a = solveDuct(cold, 'cold', 1.5)
    const b = solveDuct(cold, 'cold', 3)
    expect(Math.abs(b.result.qWm)).toBeLessThan(Math.abs(a.result.qWm))
    expect(a.result.qWm).toBeCloseTo(a.faces.reduce((s, f) => s + f.qWm2 * f.widthM, 0), 6)
  })
  it('a round duct matches the pipe engine at the same diameter', () => {
    const r = solveDuct({ ...cold, ductShape: 'round', ductD: 14 }, 'cold', 2)
    expect(r.faces).toHaveLength(1)
    expect(r.result.outerD).toBeCloseTo((14 + 2 * installedIn('wrap75', 2)) * 0.0254, 6)
  })
})

describe('duct sources', () => {
  it('every duct citation resolves to a registered reference', async () => {
    const { CALC_REFS } = await import('./sources')
    const { DUCT_SURFACES } = await import('./duct')
    const { PRESETS } = await import('./presets')
    const ids = [
      ...Object.values(DUCT_SURFACES).flatMap((x) => [...x.src, ...(x.limitSrc ?? [])]),
      ...DUCT_WRAP.src, ...DUCT_WRAP.shapeSrc, ...Object.values(DUCT_BOARD).flatMap((b) => [...b.src, ...Object.values(b.facings).flatMap((f) => f.src)]), ...DUCT_POLYISO.src, 'U66', 'C19', 'C1', 'C3', 'C6', 'D_C1', 'D_C27', 'U1', 'U9', 'U14', 'U15',
      ...PRESETS.filter((p) => p.set.system === 'duct').flatMap((p) => p.range?.src ?? []),
    ]
    for (const id of ids) expect(CALC_REFS[id], id).toBeTruthy()
  })
})
