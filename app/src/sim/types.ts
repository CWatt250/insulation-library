import type { FacingId, InsulationId, OuterJacketId } from '../data/catalog'
import type { Component } from '../geo/assembly'
import type { PipeMaterial } from '../data/pipe'
import type { PipeCodeBasis } from './code'
import type { DuctCodeBasis, DuctFinish, DuctInsulation, DuctPlace, DuctShape, DuctType } from './duct'
import type { DuctService } from '../data/ductData'

/** Pipe modes, plus Ductwork, which is driven by duct type and location rather than hot/cold. */
export type SimMode = 'hot' | 'cold' | 'condensate' | 'duct'
export type AppMode = 'explore' | 'recommend' | SimMode

/** Field quality of the vapor-retarder system (cold and condensate work). */
export type VrQuality = 'ideal' | 'good' | 'fair' | 'poor'

/** Metal jacket surface condition (aluminum or stainless); sets its emittance. */
export type MetalFinish = 'oxidized' | 'bright' | 'painted'

/** Everything a simulation needs. Temperatures °F, lengths as labelled. */
export interface SimState {
  presetId: string | null
  /** Pipe or ductwork. For ducts, processF is the air in the duct and thicknessIn the insulation's nominal thickness. */
  system: 'pipe' | 'duct'
  /** What the duct carries (energy codes treat these differently). */
  ductType: DuctType
  ductShape: DuctShape
  /** Rectangular duct width × height, round duct diameter, inches (sheet-metal size). */
  ductW: number
  ductH: number
  ductD: number
  ductIns: DuctInsulation
  /** Bare galvanized surface condition. */
  ductFinish: DuctFinish
  /** For the ASHRAE 90.1 duct table. */
  ductLocation: DuctPlace
  ductService: DuctService
  /** Which energy code sets the pipe minimum. */
  pipeCodeBasis: PipeCodeBasis
  /** Which energy code sets the duct minimum. */
  ductCodeBasis: DuctCodeBasis
  /** Washington: the county (sets zone 4C or 5B), and the outdoor-air / exhaust duct details WSEC asks for. */
  waCounty: string
  ductDamper: 'upstream' | 'downstream'
  bigUnit: boolean
  erv: boolean
  climateZone: number
  /** Include the inside air film (otherwise the duct wall is at the air temperature, as in 3E Plus). */
  insideFilm: boolean
  airFpm: number
  /** Pipe material; npsIndex indexes that material's size list (data/pipes.ts). */
  pipe: PipeMaterial
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
