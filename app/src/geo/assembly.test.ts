/** Every component builds, for a spread of sizes, materials, finishes and views, and carries simulation zones. */
import { describe, expect, it } from 'vitest'
import { buildAssembly, type Component, type ViewMode } from './assembly'
import { INSULATIONS } from '../data/catalog'

const COMPONENTS: Component[] = ['straight', 'elbow', 'tee', 'valve', 'flange']
const VIEWS: ViewMode[] = ['installed', 'cutaway']

for (const component of COMPONENTS) {
  describe(`${component} assembly`, () => {
    // one test per material keeps each synchronous build short
    for (const ins of INSULATIONS) {
      it(`builds with ${ins.id}`, () => {
        const thicknessIn = ins.thicknesses ? ins.thicknesses[Math.min(2, ins.thicknesses.length - 1)] : Math.min(2, ins.maxThicknessIn)
        for (const npsIndex of [0, 11]) {
          for (const view of VIEWS) {
            const a = buildAssembly({ component, npsIndex, thicknessIn, insulation: ins.id, jacket: ins.jackets[0], view })
            expect(a.parts.length).toBeGreaterThan(0)
            for (const p of a.parts) {
              const pos = p.geometry.getAttribute('position')
              expect(pos.count, `${ins.id} ${view} ${p.key}`).toBeGreaterThan(0)
              expect(Number.isFinite(pos.getX(0))).toBe(true)
              p.geometry.dispose()
            }
            expect(a.zones?.length).toBeGreaterThan(0)
            for (const z of a.zones ?? []) expect(z.z1, z.key).toBeGreaterThan(z.z0)
          }
        }
      }, 30000)
    }
  })
}
