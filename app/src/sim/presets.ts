import type { SimMode, SimState } from './types'
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

// NPS indices into data/pipe.ts NPS[]
const NPS_1 = 2, NPS_1_5 = 4, NPS_2 = 5, NPS_3 = 7, NPS_4 = 8, NPS_6 = 10, NPS_8 = 11

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
    set: { processF: 140, ambientF: 75, rh: 50, npsIndex: NPS_1_5, insulation: 'fiberglass', thicknessIn: 1, jacket: 'none', facing: 'asj', windMph: 0 },
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
    set: { processF: 40, ambientF: 85, rh: 70, npsIndex: NPS_1, insulation: 'elastomeric', thicknessIn: 1, jacket: 'none', facing: 'none', windMph: 0 },
  },
  {
    id: 'dcw', mode: 'cold', label: 'Domestic cold water', blurb: 'Cold water main in a warm ceiling space',
    set: { processF: 55, ambientF: 80, rh: 60, npsIndex: NPS_2, insulation: 'fiberglass', thicknessIn: 0.5, jacket: 'none', facing: 'asj', windMph: 0 },
  },
  {
    id: 'glycol', mode: 'cold', label: 'Glycol / brine', blurb: 'Low-temperature process glycol',
    range: { text: 'Antifreeze or brine for temperatures below 36°F', src: ['V14'] },
    set: { processF: 20, ambientF: 85, rh: 70, npsIndex: NPS_3, insulation: 'cellular-glass', thicknessIn: 2, jacket: 'alu-smooth', facing: 'none', windMph: 0 },
  },
  // ----------------------------------------------------------- condensate
  {
    id: 'cd-drain', mode: 'condensate', label: 'HVAC condensate drain', blurb: 'Coil drain line in a ceiling space',
    set: { processF: 55, ambientF: 80, rh: 60, npsIndex: NPS_1, insulation: 'elastomeric', thicknessIn: 0.5, jacket: 'none', facing: 'none', windMph: 0 },
  },
  {
    id: 'cd-lowtemp', mode: 'condensate', label: 'Low-temp condensate', blurb: 'Cold condensate off a low-temp coil',
    set: { processF: 45, ambientF: 80, rh: 65, npsIndex: NPS_1_5, insulation: 'elastomeric', thicknessIn: 0.5, jacket: 'none', facing: 'none', windMph: 0 },
  },
  {
    id: 'cd-mechroom', mode: 'condensate', label: 'Humid mechanical room', blurb: 'Drain line near open equipment',
    set: { processF: 55, ambientF: 88, rh: 80, npsIndex: NPS_1_5, insulation: 'elastomeric', thicknessIn: 0.5, jacket: 'none', facing: 'none', windMph: 0 },
  },
  {
    id: 'cd-indoor', mode: 'condensate', label: 'Conditioned space', blurb: 'Drain line in an occupied area',
    set: { processF: 55, ambientF: 75, rh: 50, npsIndex: NPS_1, insulation: 'elastomeric', thicknessIn: 0.5, jacket: 'none', facing: 'none', windMph: 0 },
  },
  {
    id: 'cd-outdoor', mode: 'condensate', label: 'Outdoor, warm & humid', blurb: 'Rooftop drain line, PVC-jacketed',
    set: { processF: 55, ambientF: 90, rh: 85, npsIndex: NPS_1_5, insulation: 'elastomeric', thicknessIn: 0.5, jacket: 'pvc', facing: 'none', windMph: 0 },
    stage: 'plant',
  },
]

export const presetsFor = (mode: SimMode) => PRESETS.filter((p) => p.mode === mode)

const BASE: Omit<SimState, 'processF' | 'ambientF' | 'npsIndex'> = {
  presetId: null,
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
}

export function applyPreset(base: SimState | null, p: Preset): SimState {
  const keep = base
    ? { lengthFt: base.lengthFt, hours: base.hours, ppF: base.ppF, targetSurfaceF: base.targetSurfaceF, targetQ: base.targetQ, dewMarginF: base.dewMarginF, vr: base.vr, metalFinish: base.metalFinish }
    : { targetSurfaceF: p.mode === 'hot' ? 120 : 75, targetQ: p.mode === 'hot' ? 30 : 5 }
  return { ...BASE, ...keep, ...p.set, presetId: p.id, kProduct: 0, emittanceOverride: null }
}

export const DEFAULT_PRESET: Record<SimMode, string> = { hot: 'steam', cold: 'chws', condensate: 'cd-mechroom' }

export function initialState(mode: SimMode): SimState {
  return applyPreset(null, PRESETS.find((p) => p.id === DEFAULT_PRESET[mode])!)
}
