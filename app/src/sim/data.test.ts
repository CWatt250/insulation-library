/** Every number the simulator shows must trace to a recorded source. */
import { describe, expect, it } from 'vitest'
import { SURFACES } from './emittance'
import { CALC_REFS, METHOD_REFS, VALIDATION_REFS } from './sources'
import { PRESETS } from './presets'
import { kProducts } from './model'
import { INSULATIONS } from '../data/catalog'
import { SPECS } from '../data/specs'
import { accuracyRows } from './accuracy'

describe('sources', () => {
  it('every surface emittance and limit cites a known source', () => {
    for (const s of Object.values(SURFACES)) {
      expect(s.src.length, s.key).toBeGreaterThan(0)
      for (const id of [...s.src, ...(s.limitSrc ?? [])]) expect(CALC_REFS[id], `${s.key} → ${id}`).toBeDefined()
    }
  })
  it('method, validation and preset references resolve', () => {
    for (const id of [...METHOD_REFS, ...VALIDATION_REFS]) expect(CALC_REFS[id], id).toBeDefined()
    for (const p of PRESETS) for (const id of p.range?.src ?? []) expect(CALC_REFS[id], `${p.id} → ${id}`).toBeDefined()
    for (const a of accuracyRows()) for (const id of a.src) expect(CALC_REFS[id], `accuracy → ${id}`).toBeDefined()
  })
  it('k-curves come only from products with published points and sources', () => {
    for (const m of INSULATIONS) {
      for (const { product } of kProducts(m.id)) {
        expect(product.sources.length).toBeGreaterThan(0)
        for (const id of product.sources) expect(SPECS[m.id].sources.some((x) => x.id === id), `${m.id} ${id}`).toBe(true)
      }
    }
  })
})
