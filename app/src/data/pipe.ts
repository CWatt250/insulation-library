export const IN = 0.0254 // metres per inch

/** ASME B36.10M carbon steel pipe: NPS → outside diameter and Sch 40 wall, inches. */
export const NPS: { nps: string; od: number; wall40: number }[] = [
  { nps: '1/2', od: 0.84, wall40: 0.109 },
  { nps: '3/4', od: 1.05, wall40: 0.113 },
  { nps: '1', od: 1.315, wall40: 0.133 },
  { nps: '1-1/4', od: 1.66, wall40: 0.14 },
  { nps: '1-1/2', od: 1.9, wall40: 0.145 },
  { nps: '2', od: 2.375, wall40: 0.154 },
  { nps: '2-1/2', od: 2.875, wall40: 0.203 },
  { nps: '3', od: 3.5, wall40: 0.216 },
  { nps: '4', od: 4.5, wall40: 0.237 },
  { nps: '5', od: 5.563, wall40: 0.258 },
  { nps: '6', od: 6.625, wall40: 0.28 },
  { nps: '8', od: 8.625, wall40: 0.322 },
  { nps: '10', od: 10.75, wall40: 0.365 },
  { nps: '12', od: 12.75, wall40: 0.406 },
  { nps: '14', od: 14, wall40: 0.438 },
  { nps: '16', od: 16, wall40: 0.5 },
  { nps: '18', od: 18, wall40: 0.562 },
  { nps: '20', od: 20, wall40: 0.594 },
  { nps: '24', od: 24, wall40: 0.688 },
]

/** Nominal insulation thicknesses offered in the UI, inches. */
export const THICKNESSES = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6]

/**
 * Metal jacket thickness per JM Metal Jacketing Install Guide (inches).
 * `rigid` = calsil, cellular glass, phenolic, mineral wool pipe sections.
 */
export function aluminumGauge(insulationOdIn: number, rigid: boolean): number {
  const o = insulationOdIn
  if (o <= 8) return 0.016
  if (o <= 11) return rigid ? 0.016 : 0.02
  if (o <= 24) return rigid ? 0.016 : 0.024
  if (o <= 36) return rigid ? 0.02 : 0.032
  return rigid ? 0.024 : 0.04
}

export function stainlessGauge(insulationOdIn: number): number {
  if (insulationOdIn <= 24) return 0.01
  if (insulationOdIn <= 36) return 0.016
  return 0.02
}

// ------------------------------------------------------------------ pipe materials

export type PipeMaterial = 'steel' | 'copper' | 'pvc'

export interface PipeSize {
  /** Nominal size label as printed (NPS for steel and PVC, nominal tube size for copper). */
  nps: string
  /** Outside diameter and wall, inches. */
  od: number
  wall: number
}

export const PIPE_LABEL: Record<PipeMaterial, string> = { steel: 'Steel', copper: 'Copper', pvc: 'PVC' }
