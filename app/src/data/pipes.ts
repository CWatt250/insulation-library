import { NPS, type PipeMaterial, type PipeSize } from './pipe'
import { COPPER_OD } from '../sim/c585'
import { PIPE_WALLS } from './pipeWalls'

/**
 * Pipe sizes by material. Steel: ASME B36.10M OD, Sch 40 wall. PVC: Sch 40 per
 * ASTM D1785 (research/pipe-materials-verified.json). Copper: ASTM B88 tube OD
 * from the CDA Copper Tube Handbook, Type L wall.
 */
export function pipeSizes(m: PipeMaterial = 'steel'): PipeSize[] {
  if (m === 'copper') return COPPER_OD.map((c) => ({ nps: c.nps, od: c.od, wall: PIPE_WALLS.copperL[c.nps] ?? c.od * 0.06 }))
  if (m === 'pvc') return NPS.filter((n) => PIPE_WALLS.pvc40[n.nps]).map((n) => ({ nps: n.nps, od: PIPE_WALLS.pvc40[n.nps].od, wall: PIPE_WALLS.pvc40[n.nps].wall }))
  return NPS.map((n) => ({ nps: n.nps, od: n.od, wall: n.wall40 }))
}

export function pipeSpec(m: PipeMaterial | undefined, index: number): PipeSize {
  const list = pipeSizes(m ?? 'steel')
  return list[Math.max(0, Math.min(index, list.length - 1))]
}

/** Index in another material's list with the closest nominal size (keeps the size when switching material). */
export function equivalentIndex(from: PipeMaterial, index: number, to: PipeMaterial): number {
  const target = npsValue(pipeSpec(from, index).nps)
  const list = pipeSizes(to)
  let best = 0
  list.forEach((p, i) => {
    if (Math.abs(npsValue(p.nps) - target) < Math.abs(npsValue(list[best].nps) - target)) best = i
  })
  return best
}

/** Where each pipe material's dimensions (and, for PVC, wall conductivity) come from: CALC_REFS ids. */
export const PIPE_SRC: Record<PipeMaterial, string[]> = {
  steel: ['D6'],
  copper: ['G1', 'D6'],
  pvc: ['G3', 'G5', 'G6', 'G8'],
}

export const npsValue = (nps: string) => nps.split('-').reduce((sum, part) => {
  const [a, b] = part.split('/').map(Number)
  return sum + (b ? a / b : a)
}, 0)

/** "NPS 4"" for steel and PVC, "1-1/8" OD (1" nominal)" style for copper. */
export function pipeLabel(m: PipeMaterial | undefined, p: PipeSize) {
  return m === 'copper' ? `${p.nps}" copper` : `NPS ${p.nps}"`
}
