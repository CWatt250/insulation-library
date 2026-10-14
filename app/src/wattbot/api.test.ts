import { describe, expect, it } from 'vitest'
import { ductImages } from './images'
import { ductLocation, options, recommend } from './api'

describe('Engine API (WattBot CLI + BidWatt engine.mjs)', () => {
  it('reads a duct location off the DOE figure with its code minimums', () => {
    const r = ductLocation({ spot: 3, zone: 4 }) as Record<string, any>
    expect(r.label).toBe('Supply & return in vented attic')
    expect(r.ashrae.minimum).toBe('installed R-8 minimum')
    expect(r.image).toMatch(/\/wattbot\/duct-locations-3\.svg$/)
  })

  it('lists all 14 locations when no spot is given', () => {
    const r = ductLocation({ zone: 5 }) as Record<string, any>
    expect(r.locations).toHaveLength(14)
    expect(r.image).toMatch(/duct-locations-0\.svg$/)
  })

  it('takes the Washington zone from the county', () => {
    const r = ductLocation({ spot: 3, county: 'franklin county' }) as Record<string, any>
    expect(r.zone).toBe(5)
    expect(r.washington).toBe('Franklin County, zone 5B')
  })

  it('designs a pipe from a use preset and a size label', () => {
    const r = recommend({ system: 'pipe', pipe: 'copper', size: '1-1/4', use: 'chws' }) as Record<string, any>
    expect(r.asked).toBe('Copper 1-1/4" pipe, indoors')
    expect(r.thickness).toMatch(/"$/)
    expect(r.requirements.some((x: { governs: boolean }) => x.governs)).toBe(true)
  })

  it('refuses a pipe with no temperature rather than guessing', () => {
    expect(() => recommend({ system: 'pipe', pipe: 'steel', size: '2' })).toThrow(/processF/)
  })

  it('has a dark image and a light drawing for the overview and every location', () => {
    const files = Object.keys(ductImages())
    expect(files).toHaveLength(30)
    expect(files).toContain('duct-drawing-light-14.svg')
    expect((ductLocation({ spot: 14 }) as Record<string, any>).drawing).toMatch(/duct-drawing-light-14\.svg$/)
  })

  it('offers form choices from the same data the site uses', () => {
    const o = options()
    expect(o.pipes.find((p) => p.id === 'copper')!.sizes).toContain('1-1/4')
    expect(o.uses.find((u) => u.id === 'chws')!.processF).toBeLessThan(60)
    expect(o.spots).toHaveLength(14)
    expect(o.waCounties.find((c) => c.county === 'Franklin')!.zone).toBe('5B')
  })

  it('every listed pipe size round-trips through recommend', () => {
    for (const p of options().pipes) {
      for (const size of p.sizes) {
        const r = recommend({ system: 'pipe', pipe: p.id, size, processF: 180 }) as Record<string, any>
        expect(r.notes.join(' ')).not.toMatch(/isn't a listed/)
      }
    }
  })
})
