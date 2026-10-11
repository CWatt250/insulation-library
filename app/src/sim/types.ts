import type { FacingId, InsulationId, OuterJacketId } from '../data/catalog'
import type { Component } from '../geo/assembly'

export type SimMode = 'hot' | 'cold' | 'condensate'
export type AppMode = 'explore' | SimMode

/** Field quality of the vapor-retarder system (cold and condensate work). */
export type VrQuality = 'ideal' | 'good' | 'fair' | 'poor'

/** Metal jacket surface condition (aluminum or stainless); sets its emittance. */
export type MetalFinish = 'oxidized' | 'bright' | 'painted'

/** Everything a simulation needs. Temperatures °F, lengths as labelled. */
export interface SimState {
  presetId: string | null
  /** What is modelled in 3D: a straight run or a fitting in a run. */
  component: Component
  /** Valves and flange pairs: a removable insulated blanket, or left bare. */
  fittingCover: 'blanket' | 'none'
  processF: number
  ambientF: number
  rh: number
  npsIndex: number
  insulation: InsulationId
  thicknessIn: number
  jacket: OuterJacketId
  facing: FacingId
  windMph: number
  metalFinish: MetalFinish
  /** Overrides the looked-up outer-surface emittance. */
  emittanceOverride: number | null
  vr: VrQuality
  /** Index into SPECS[insulation].products for the k-curve. */
  kProduct: number
  /** Optional energy inputs. */
  lengthFt: number
  hours: number
  /** Personnel-protection (safe-touch) surface limit, °F. */
  ppF: number
  /** User's surface temperature target: a maximum on hot work, a minimum on cold work. */
  targetSurfaceF: number
  /** Heat loss / gain target, Btu/hr·ft. */
  targetQ: number
  /** Required surface margin above the dew point, °F. */
  dewMarginF: number
  /** Include the ASHRAE 90.1 minimum thickness as a design requirement. */
  applyCode: boolean
  /** Economics (user inputs; defaults are examples, not sourced prices). */
  fuel: 'gas' | 'electric' | 'steam'
  /** $/MMBtu for gas and purchased steam; $/kWh for electricity. */
  fuelPrice: number
  /** Heating plant conversion efficiency, %. */
  efficiencyPct: number
  /** Cooling: electricity price $/kWh and plant efficiency kW/ton. */
  coolPrice: number
  kwPerTon: number
  /** Installed insulation cost, $ per linear foot (0 = no payback shown). */
  installedPerFt: number
}

export type CondensationStatus = 'dry' | 'borderline' | 'sweating' | 'dripping'
