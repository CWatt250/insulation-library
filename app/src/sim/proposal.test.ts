import { describe, expect, it } from 'vitest'
import { annualCost, money, paybackWords } from './cost'
import { evaluate, physicsMode } from './model'
import { buildProposal } from './proposal'
import { applyPreset, PRESETS } from './presets'
import type { SimState } from './types'

const make = (id: string, patch: Partial<SimState> = {}) => {
  const p = PRESETS.find((x) => x.id === id)!
  const s = { ...applyPreset(null, p), ...patch }
  const mode = physicsMode(s, p.mode)
  const ev = evaluate(s, mode)
  return { s, mode, ev, html: buildProposal({ mode, s, ev, units: 'ip', preparedFor: 'Acme Hospital', preparedBy: 'Watt Systems', project: 'Boiler room', appUrl: 'https://insulation-library.vercel.app' }) }
}

describe('savings proposal', () => {
  it('prints the Savings tab’s own numbers, with payback when an installed cost is given', () => {
    const { s, mode, ev, html } = make('process', { lengthFt: 250, installedPerFt: 40, waCounty: 'Spokane' })
    const c = annualCost(s, mode, ev)!
    expect(html).toContain(money(c.saved))
    expect(html).toContain(money(c.saved / 12))
    expect(html).toContain(paybackWords(c.paybackYr!))
    expect(html).toContain('Spokane Intl')
    expect(html).toContain('Acme Hospital')
    expect(html).not.toMatch(/NaN|undefined|Infinity/)
  })

  it('a duct shows each season', () => {
    const { html } = make('duct-return', { waCounty: 'King' })
    expect(html).toContain('Cooling season, Jun–Sep')
    expect(html).toContain('Heating season, Oct–May')
    expect(html).not.toMatch(/NaN|undefined|Infinity/)
  })

  it('a duct with nothing to save says why instead of a dollar figure', () => {
    const { html } = make('duct-cond')
    expect(html).toContain('No energy savings to price here')
    expect(html).not.toContain('Saved per year')
  })

  it('escapes what the user typed', () => {
    const p = PRESETS.find((x) => x.id === 'steam')!
    const s = applyPreset(null, p)
    const html = buildProposal({ mode: 'hot', s, ev: evaluate(s, 'hot'), units: 'ip', preparedFor: '<script>x</script>', project: '', appUrl: '' })
    expect(html).not.toContain('<script>x')
  })
})
