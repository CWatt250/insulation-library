import type { SimMode, SimState } from './types'
import type { PipeMaterial } from '../data/pipe'
import { pipeSizes } from '../data/pipes'
import { DEW_MARGIN_DEFAULT_F, PP_DEFAULT_F } from './model'

/**
 * Starting points for each mode. These are example operating conditions to
 * explore from — not design values for a project. Service-temperature ranges
 * are from the sources listed on each preset (ids in sources.ts); a preset's
 * single temperature sits inside its cited range.
 */
export interface Preset {
  id: string
  mode: SimMode
  label: string
  blurb: string
  /** The published service range the temperature sits in, and its source (sources.ts ids). */
  range?: { text: string; src: string[] }
  set: Partial<SimState> & { npsIndex: number; processF: number; ambientF: number }
  stage?: 'studio' | 'plant'
}

/** Index of a nominal size in a pipe material's size list. */
const size = (pipe: PipeMaterial, nps: string) => Math.max(0, pipeSizes(pipe).findIndex((p) => p.nps === nps))
const NPS_3 = size('steel', '3'), NPS_4 = size('steel', '4'), NPS_6 = size('steel', '6'), NPS_8 = size('steel', '8')

/*
 * Wind is 0 mph (still air) throughout: NIA's calculators say to use 0 mph for
 * worst-case conditions when the wind is unknown (M7), and NIA's personnel-
 * protection guidance bases outdoor work on no wind (M6). Room conditions are
 * example values, not design data — the user sets their own.
 */
export const PRESETS: Preset[] = [
  // ------------------------------------------------------------------ hot
  {
    id: 'steam', mode: 'hot', label: 'Steam', blurb: 'Low-pressure steam main, mechanical room',
    range: { text: '15 psig saturated steam: 249.7°F', src: ['V23'] },
    set: { processF: 250, ambientF: 80, rh: 50, npsIndex: NPS_4, insulation: 'mineral-wool', thicknessIn: 2, jacket: 'alu-smooth', facing: 'none', windMph: 0 },
  },
  {
    id: 'hthw', mode: 'hot', label: 'High-temp heating water', blurb: 'Plant HTW distribution',
    range: { text: 'HTW: over 350°F, design supply usually about 400°F max', src: ['V14'] },
    set: { processF: 400, ambientF: 80, rh: 50, npsIndex: NPS_6, insulation: 'calsil', thicknessIn: 2.5, jacket: 'alu-smooth', facing: 'none', windMph: 0 },
  },
  {
    id: 'lthw', mode: 'hot', label: 'Low-temp heating water', blurb: 'Building heating hot water loop',
    range: { text: 'Hot-water heating, predominantly 140–180°F', src: ['V13'] },
    set: { processF: 180, ambientF: 75, rh: 50, npsIndex: NPS_3, insulation: 'fiberglass', thicknessIn: 1.5, jacket: 'none', facing: 'asj', windMph: 0 },
  },
  {
    id: 'dhw', mode: 'hot', label: 'Domestic hot water', blurb: 'Service hot water supply',
    range: { text: 'Domestic hot water: 100–140°F', src: ['V22'] },
    set: { processF: 140, ambientF: 75, rh: 50, pipe: 'copper', npsIndex: size('copper', '1-1/2'), insulation: 'fiberglass', thicknessIn: 1, jacket: 'none', facing: 'asj', windMph: 0 },
  },
  {
    id: 'process', mode: 'hot', label: 'Process hot pipe', blurb: 'Outdoor process line, jacketed',
    range: { text: 'ASHRAE 90.1 heating band: above 350°F', src: ['V10'] },
    set: { processF: 600, ambientF: 70, rh: 50, npsIndex: NPS_8, insulation: 'mineral-wool', thicknessIn: 3, jacket: 'alu-smooth', facing: 'none', windMph: 0 },
    stage: 'plant',
  },
  // ----------------------------------------------------------------- cold
  {
    id: 'chws', mode: 'cold', label: 'Chilled water supply', blurb: 'Supply main, humid mechanical room',
    range: { text: 'Common design supply: 38–45°F', src: ['V14'] },
    set: { processF: 42, ambientF: 85, rh: 70, npsIndex: NPS_6, insulation: 'fiberglass', thicknessIn: 1.5, jacket: 'none', facing: 'asj', windMph: 0 },
  },
  {
    id: 'chwr', mode: 'cold', label: 'Chilled water return', blurb: 'Return main, conditioned space',
    range: { text: 'Return: 55–66°F', src: ['V14'] },
    set: { processF: 56, ambientF: 78, rh: 60, npsIndex: NPS_6, insulation: 'fiberglass', thicknessIn: 1, jacket: 'none', facing: 'asj', windMph: 0 },
  },
  {
    id: 'suction', mode: 'cold', label: 'Refrigerant suction', blurb: 'DX suction line',
    range: { text: 'DX refrigerant suction grouped with chilled water, 40–60°F', src: ['V21'] },
    set: { processF: 40, ambientF: 85, rh: 70, pipe: 'copper', npsIndex: size('copper', '1'), insulation: 'elastomeric', thicknessIn: 1, jacket: 'none', facing: 'none', windMph: 0 },
  },
  {
    id: 'dcw', mode: 'cold', label: 'Domestic cold water', blurb: 'Cold water main in a warm ceiling space',
    set: { processF: 55, ambientF: 80, rh: 60, pipe: 'copper', npsIndex: size('copper', '2'), insulation: 'fiberglass', thicknessIn: 0.5, jacket: 'none', facing: 'asj', windMph: 0 },
  },
  {
    id: 'glycol', mode: 'cold', label: 'Glycol / brine', blurb: 'Low-temperature process glycol',
    range: { text: 'Antifreeze or brine for temperatures below 36°F', src: ['V14'] },
    set: { processF: 20, ambientF: 85, rh: 70, npsIndex: NPS_3, insulation: 'cellular-glass', thicknessIn: 2, jacket: 'alu-smooth', facing: 'none', windMph: 0 },
  },
  // ------------------------------------------------------------ ductwork
  // Ductwork presets are a duct type in a location. Air and room temperatures
  // are examples except 55°F supply air, the basis of the NAIMA, Owens Corning
  // and CertainTeed duct-wrap condensation charts (U53).
  {
    id: 'duct-cool', mode: 'duct', label: 'Supply duct, attic', blurb: 'Cooling supply air through a vented attic above an insulated ceiling',
    range: { text: '55°F duct air: basis of the NAIMA duct-wrap condensation chart', src: ['U53'] },
    set: { system: 'duct', ductType: 'supply', ductLocation: 'attic', ductService: 'both', ductShape: 'round', ductD: 16, ductIns: 'wrap75', thicknessIn: 3, processF: 55, ambientF: 95, rh: 60, npsIndex: NPS_4, windMph: 0 },
  },
  {
    id: 'duct-cond', mode: 'duct', label: 'Supply duct, conditioned', blurb: 'Cooling supply air through an occupied, air-conditioned space',
    range: { text: '55°F duct air: basis of the NAIMA duct-wrap condensation chart', src: ['U53'] },
    set: { system: 'duct', ductType: 'supply', ductLocation: 'conditioned', ductService: 'both', ductShape: 'round', ductD: 14, ductIns: 'wrap75', thicknessIn: 1.5, processF: 55, ambientF: 75, rh: 55, npsIndex: NPS_4, windMph: 0 },
  },
  {
    id: 'duct-plenum', mode: 'duct', label: 'Supply in a return plenum', blurb: 'Cooling supply duct above a dropped ceiling used as the return air plenum',
    range: { text: '55°F duct air: basis of the NAIMA duct-wrap condensation chart', src: ['U53'] },
    set: { system: 'duct', ductType: 'supply', ductLocation: 'indirect', ductService: 'both', ductShape: 'round', ductD: 12, ductIns: 'wrap75', thicknessIn: 1.5, processF: 55, ambientF: 78, rh: 50, npsIndex: NPS_4, windMph: 0 },
  },
  {
    id: 'duct-heat', mode: 'duct', label: 'Heating supply, crawl space', blurb: 'Warm-air supply through an unconditioned crawl space in winter',
    set: { system: 'duct', ductType: 'supply', ductLocation: 'crawl', ductService: 'both', ductShape: 'rect', ductW: 20, ductH: 10, ductIns: 'wrap75', thicknessIn: 3, processF: 120, ambientF: 40, rh: 50, npsIndex: NPS_4, windMph: 0 },
  },
  {
    id: 'duct-return', mode: 'duct', label: 'Return duct, attic', blurb: 'Room air returning through a hot attic',
    set: { system: 'duct', ductType: 'return', ductLocation: 'attic', ductService: 'both', ductShape: 'rect', ductW: 24, ductH: 14, ductIns: 'wrap75', thicknessIn: 2.2, processF: 75, ambientF: 110, rh: 30, npsIndex: NPS_4, windMph: 0 },
  },
  {
    id: 'duct-oa', mode: 'duct', label: 'Outside-air intake, winter', blurb: 'Cold outdoor air ducted through a heated building',
    set: { system: 'duct', ductType: 'outdoor', ductLocation: 'conditioned', ductService: 'both', ductShape: 'rect', ductW: 18, ductH: 12, ductIns: 'wrap75', thicknessIn: 1.5, processF: 20, ambientF: 70, rh: 35, npsIndex: NPS_4, windMph: 0 },
  },
  {
    id: 'duct-exhaust', mode: 'duct', label: 'Exhaust duct, cold attic', blurb: 'Warm exhaust air through an unconditioned attic in winter',
    set: { system: 'duct', ductType: 'exhaust', ductLocation: 'attic', ductService: 'both', ductShape: 'round', ductD: 10, ductIns: 'wrap75', thicknessIn: 1.5, processF: 72, ambientF: 25, rh: 50, npsIndex: NPS_4, windMph: 0 },
  },
  {
    id: 'duct-roof', mode: 'duct', label: 'Rooftop supply duct', blurb: 'Cooling supply duct run outdoors on a roof',
    range: { text: '55°F duct air: basis of the NAIMA duct-wrap condensation chart', src: ['U53'] },
    set: { system: 'duct', ductType: 'supply', ductLocation: 'exterior', ductService: 'both', ductShape: 'rect', ductW: 36, ductH: 18, ductIns: 'polyiso', ductFacing: 'fsk', thicknessIn: 1.5, processF: 55, ambientF: 95, rh: 55, npsIndex: NPS_4, windMph: 0 },
    stage: 'plant',
  },
  // ----------------------------------------------------------- condensate
  {
    id: 'cd-drain', mode: 'condensate', label: 'HVAC condensate drain', blurb: 'Coil drain line in a ceiling space',
    set: { processF: 55, ambientF: 80, rh: 60, pipe: 'pvc', npsIndex: size('pvc', '1'), insulation: 'elastomeric', thicknessIn: 0.5, jacket: 'none', facing: 'none', windMph: 0 },
  },
  {
    id: 'cd-lowtemp', mode: 'condensate', label: 'Low-temp condensate', blurb: 'Cold condensate off a low-temp coil',
    set: { processF: 45, ambientF: 80, rh: 65, pipe: 'pvc', npsIndex: size('pvc', '1-1/2'), insulation: 'elastomeric', thicknessIn: 0.5, jacket: 'none', facing: 'none', windMph: 0 },
  },
  {
    id: 'cd-mechroom', mode: 'condensate', label: 'Humid mechanical room', blurb: 'Drain line near open equipment',
    set: { processF: 55, ambientF: 88, rh: 80, pipe: 'pvc', npsIndex: size('pvc', '1-1/2'), insulation: 'elastomeric', thicknessIn: 0.5, jacket: 'none', facing: 'none', windMph: 0 },
  },
  {
    id: 'cd-indoor', mode: 'condensate', label: 'Conditioned space', blurb: 'Drain line in an occupied area',
    set: { processF: 55, ambientF: 75, rh: 50, pipe: 'pvc', npsIndex: size('pvc', '1'), insulation: 'elastomeric', thicknessIn: 0.5, jacket: 'none', facing: 'none', windMph: 0 },
  },
  {
    id: 'cd-outdoor', mode: 'condensate', label: 'Outdoor, warm & humid', blurb: 'Rooftop drain line, PVC-jacketed',
    set: { processF: 55, ambientF: 90, rh: 85, pipe: 'pvc', npsIndex: size('pvc', '1-1/2'), insulation: 'elastomeric', thicknessIn: 0.5, jacket: 'pvc', facing: 'none', windMph: 0 },
    stage: 'plant',
  },
]

export const presetsFor = (mode: SimMode) => PRESETS.filter((p) => p.mode === mode)

const BASE: Omit<SimState, 'processF' | 'ambientF' | 'npsIndex'> = {
  presetId: null,
  system: 'pipe',
  ductType: 'supply',
  ductShape: 'round',
  ductW: 24,
  ductH: 12,
  ductD: 14,
  ductIns: 'wrap75',
  ductFacing: 'fsk',
  ductFinish: 'new',
  ductLocation: 'unconditioned',
  ductService: 'both',
  ductCodeBasis: 'ashrae',
  pipeCodeBasis: 'ashrae',
  waCounty: 'King',
  ductDamper: 'downstream',
  bigUnit: true,
  erv: false,
  climateZone: 4,
  insideFilm: false,
  airFpm: 1000,
  pipe: 'steel',
  component: 'straight',
  fittingCover: 'blanket',
  rh: 50,
  insulation: 'fiberglass',
  thicknessIn: 1.5,
  jacket: 'none',
  facing: 'asj',
  windMph: 0,
  metalFinish: 'oxidized',
  emittanceOverride: null,
  vr: 'good',
  kProduct: 0,
  lengthFt: 100,
  hours: 8760,
  ppF: PP_DEFAULT_F,
  targetSurfaceF: 120,
  targetQ: 20,
  dewMarginF: DEW_MARGIN_DEFAULT_F,
  applyCode: false,
  fuel: 'gas',
  fuelPrice: 8,
  efficiencyPct: 80,
  coolPrice: 0.12,
  kwPerTon: 0.75,
  installedPerFt: 0,
}

export function applyPreset(base: SimState | null, p: Preset): SimState {
  const keep = base
    ? { lengthFt: base.lengthFt, hours: base.hours, climateZone: base.climateZone, ductCodeBasis: base.ductCodeBasis, pipeCodeBasis: base.pipeCodeBasis, waCounty: base.waCounty, insideFilm: base.insideFilm, airFpm: base.airFpm, ductFinish: base.ductFinish, ppF: base.ppF, targetSurfaceF: base.targetSurfaceF, targetQ: base.targetQ, dewMarginF: base.dewMarginF, vr: base.vr, metalFinish: base.metalFinish, applyCode: base.applyCode, fuel: base.fuel, fuelPrice: base.fuelPrice, efficiencyPct: base.efficiencyPct, coolPrice: base.coolPrice, kwPerTon: base.kwPerTon, installedPerFt: base.installedPerFt, component: base.component, fittingCover: base.fittingCover }
    : { targetSurfaceF: p.mode === 'hot' ? 120 : 75, targetQ: p.mode === 'hot' ? 30 : 5 }
  return { ...BASE, ...keep, ...p.set, presetId: p.id, kProduct: 0, emittanceOverride: null }
}

export const DEFAULT_PRESET: Record<SimMode, string> = { hot: 'steam', cold: 'chws', condensate: 'cd-mechroom', duct: 'duct-cool' }

export function initialState(mode: SimMode): SimState {
  return applyPreset(null, PRESETS.find((p) => p.id === DEFAULT_PRESET[mode])!)
}
