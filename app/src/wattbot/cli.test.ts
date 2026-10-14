import { describe, expect, it } from 'vitest'
import { ductImages } from './images'
import { ductLocation, recommend } from './cli'

describe('WattBot CLI', () => {
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

  it('has an image for the overview and every location', () => {
    expect(Object.keys(ductImages())).toHaveLength(15)
  })
})
