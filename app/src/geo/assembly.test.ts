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

describe('copper and PVC pipe', () => {
  for (const pipe of ['copper', 'pvc'] as const) {
    for (const component of ['straight', 'elbow', 'tee'] as Component[]) {
      it(`builds ${pipe} ${component}`, () => {
        for (const npsIndex of [0, 5, 99]) {
          const a = buildAssembly({ component, npsIndex, thicknessIn: 1, insulation: 'elastomeric', jacket: 'none', view: 'cutaway', pipe })
          expect(a.parts.length).toBeGreaterThan(0)
          for (const p of a.parts) {
            expect(Number.isFinite(p.geometry.getAttribute('position').getX(0))).toBe(true)
            p.geometry.dispose()
          }
        }
      }, 30000)
    }
  }
})

describe('ductwork assembly', () => {
  for (const shape of ['rect', 'round'] as const) {
    for (const insulation of ['wrap', 'elastomeric'] as const) {
      it(`builds a ${shape} duct with ${insulation}, installed and cut away`, () => {
        for (const view of ['installed', 'cutaway'] as const) {
          const a = buildAssembly({ component: 'straight', npsIndex: 0, thicknessIn: 1, insulation: 'fiberglass', jacket: 'none', view, duct: { shape, w: 0.61, h: 0.3, d: 0.36, t: 0.038, insulation } })
          expect(a.parts.length).toBeGreaterThan(1)
          for (const p of a.parts) {
            const pos = p.geometry.getAttribute('position')
            expect(pos.count).toBeGreaterThan(0)
            for (let i = 0; i < pos.count; i += 97) expect(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))).toBe(true)
            p.geometry.dispose()
          }
          // the cutaway hides effects where the insulation is stripped
          expect(!!a.zones?.[0].wedge).toBe(view === 'cutaway')
        }
      })
    }
  }
})
