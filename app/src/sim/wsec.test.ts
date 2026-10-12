/** Washington State Energy Code (2021 WSEC, research/wsec-verified.json): pipes and ducts. */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ductRequirement, type WsecDuctOptions } from './duct'
import { codeMinimum } from './code'
import { initialState } from './presets'
import { WA_COUNTIES, WSEC_PIPE } from '../data/wsecData'

const W = JSON.parse(readFileSync(new URL('../../../research/wsec-verified.json', import.meta.url), 'utf8'))
const opt = (p: Partial<WsecDuctOptions> = {}): WsecDuctOptions => ({ zone: '4C', damper: 'downstream', bigUnit: true, erv: false, ...p })

describe('WSEC climate zones', () => {
  it('assigns all 39 counties to 4C or 5B, as Table C301.1 does', () => {
    expect(WA_COUNTIES).toHaveLength(39)
    expect(WA_COUNTIES.find((c) => c.county === 'King')!.zone).toBe('4C')
    expect(WA_COUNTIES.find((c) => c.county === 'Spokane')!.zone).toBe('5B')
    expect(WA_COUNTIES.filter((c) => c.zone === '4C')).toHaveLength(18)
  })
})

describe('WSEC pipe table C403.10.3', () => {
  it('matches the research table cell for cell', () => {
    expect(WSEC_PIPE).toHaveLength(W.pipe_commercial.table.rows.length)
    // the one difference from IECC 2021: the below-40°F row is rated at 75°F mean
    expect(WSEC_PIPE.find((r) => r.lo === null)!.meanF).toBe(75)
  })
  it('gives the table thickness for a 4" chilled-water line, and R-6 residential', () => {
    const s = { ...initialState('cold'), pipe: 'steel' as const, processF: 42, pipeCodeBasis: 'wsec' as const }
    const c = codeMinimum(s, 'cold')
    expect('minIn' in c && c.tableIn).toBe(1)
    const r = codeMinimum({ ...s, pipeCodeBasis: 'wsec-res' }, 'cold')
    expect('minR' in r && r.minR).toBe(6)
  })
})

describe('WSEC duct insulation C403.10.1', () => {
  it('supply and return by location and zone', () => {
    expect(ductRequirement('supply', 'exterior', 'both', 4, 'wsec', 30, opt()).R).toBe(8)
    expect(ductRequirement('supply', 'attic', 'both', 4, 'wsec', 30, opt({ zone: '5B' })).R).toBe(12)
    expect(ductRequirement('supply', 'unconditioned', 'both', 4, 'wsec', 30, opt()).R).toBe(6)
    expect(ductRequirement('supply', 'unconditioned', 'both', 4, 'wsec', 10, opt()).R).toBe(3.3)
    expect(ductRequirement('supply', 'conditioned', 'both', 4, 'wsec', 30, opt(), 55).R).toBeNull()
    expect(ductRequirement('supply', 'conditioned', 'both', 4, 'wsec', 30, opt(), 50).R).toBe(3.3)
  })
  it('outdoor-air and exhaust ducts — the rules only Washington has', () => {
    expect(ductRequirement('outdoor', 'conditioned', 'both', 4, 'wsec', 30, opt({ damper: 'upstream' })).R).toBe(16)
    expect(ductRequirement('outdoor', 'conditioned', 'both', 4, 'wsec', 30, opt({ damper: 'downstream', zone: '5B' })).R).toBe(12)
    expect(ductRequirement('outdoor', 'conditioned', 'both', 4, 'wsec', 30, opt({ bigUnit: false })).R).toBe(7)
    expect(ductRequirement('exhaust', 'conditioned', 'both', 4, 'wsec', 30, opt({ damper: 'downstream' })).R).toBe(16)
    expect(ductRequirement('exhaust', 'conditioned', 'both', 4, 'wsec', 30, opt({ erv: true, zone: '5B' })).R).toBe(12)
    expect(ductRequirement('exhaust', 'attic', 'both', 4, 'wsec', 30, opt()).notStated).toBe(true)
  })
})
