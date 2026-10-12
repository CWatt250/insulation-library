import { physicsMode } from './model'
import { ductEnergy, monthSpan, pipeOutdoor } from './ductEnergy'
import type { Evaluation } from './model'
import type { Fuel, SimMode, SimState } from './types'

/**
 * Annual energy cost. Prices and efficiencies are the user's inputs:
 *  heating — Btu/yr ÷ conversion efficiency, at $/MMBtu (gas, purchased steam)
 *            or $/kWh (electric, 3,412.14 Btu/kWh)
 *  cooling — heat gain removed by an electric plant: Btu/yr ÷ 12,000 Btu/ton·h × kW/ton × $/kWh
 * Payback = installed cost (per foot × run length) ÷ annual savings.
 */
export const BTU_PER_KWH = 3412.14
export const BTU_PER_TON_H = 12000

/**
 * Defaults (research/energy-prices-verified.json), all editable:
 *  gas $14/MMBtu — Washington commercial average, EIA 2025 $13.80 and 2026 Jan–Jul $14.56 [P1, P2];
 *                  PSE Schedule 31 averages $1.47/therm = $14.72 [P5]
 *  power $0.12/kWh — Washington commercial average 11.78¢, July 2026 [P6]
 *  chiller plant 0.9 kW/ton — whole plant (chillers, pumps, tower) typically 0.8–1.0 [P7]
 *  heat pump COP 2.5 — DOE: heat pump water heaters are two to three times as efficient as
 *                  electric resistance [P8]
 */
export const GAS_DEFAULT = 14
export const POWER_DEFAULT = 0.12
export const KW_PER_TON_DEFAULT = 0.9
/** Rooftop or split (DX) units: LBNL puts packaged units at 1.1–1.4 kW/ton [P7]; ducts open on the middle. */
export const KW_PER_TON_DX = 1.25
export const BOILER_DEFAULT = 80
export const HEAT_PUMP_COP_DEFAULT = 2.5

/**
 * Heat delivered per unit bought, %, as each source opens: a gas boiler loses some up the flue;
 * purchased steam is bought already made, so each Btu the pipe loses is about one Btu of steam;
 * resistance heat is all heat; a heat pump moves 2–3 units of heat per unit of electricity.
 */
export const FUEL_EFF: Record<Fuel, number> = { gas: BOILER_DEFAULT, steam: 100, electric: 100, heatpump: HEAT_PUMP_COP_DEFAULT * 100 }

/** Priced per kWh (electric, heat pump) rather than per MMBtu (gas, steam). */
export const perKwh = (f: Fuel) => f === 'electric' || f === 'heatpump'

/** Switching what pays for the heat: its efficiency, and a price in the right unit. */
export function fuelSwitch(s: Pick<SimState, 'fuel' | 'fuelPrice'>, fuel: Fuel): Pick<SimState, 'fuel' | 'fuelPrice' | 'efficiencyPct'> {
  const price = perKwh(fuel) === perKwh(s.fuel) ? s.fuelPrice : perKwh(fuel) ? POWER_DEFAULT : GAS_DEFAULT
  return { fuel, fuelPrice: price, efficiencyPct: FUEL_EFF[fuel] }
}

/** Hours a year from a schedule: 24 h × 7 days × 12 months = 8,760. */
export const scheduleHours = (hoursPerDay: number, daysPerWeek: number, months: number) =>
  Math.round(hoursPerDay * 365 * (daysPerWeek / 7) * (months / 12))

/** "24/7, all year" or "10 h a day, 5 days a week, 8 months a year". */
export function scheduleWords(s: Pick<SimState, 'hoursPerDay' | 'daysPerWeek' | 'monthsPerYear'>): string {
  if (s.hoursPerDay === 24 && s.daysPerWeek === 7 && s.monthsPerYear === 12) return '24/7, all year'
  const months = s.monthsPerYear === 12 ? 'all year' : `${s.monthsPerYear} month${s.monthsPerYear === 1 ? '' : 's'} a year`
  return `${s.hoursPerDay} h a day, ${s.daysPerWeek} day${s.daysPerWeek === 1 ? '' : 's'} a week, ${months}`
}

/** "7 months" under a year, "1.4 years (17 months)" under ten, then whole years. */
export function paybackWords(yr: number): string {
  const m = Math.max(1, Math.round(yr * 12))
  if (yr < 1) return `${m} month${m === 1 ? '' : 's'}`
  return yr < 10 ? `${yr.toFixed(1)} years (${m} months)` : `${Math.round(yr)} years`
}

export interface CostResult {
  bare: number
  ins: number
  saved: number
  /** Heat that costs energy over the year, Btu, bare and insulated. */
  btuBare: number
  btuIns: number
  /** Simple payback, years; null without an installed cost. */
  paybackYr: number | null
  basis: string
}

export function dollarsPerBtu(s: SimState, mode: SimMode): number {
  if (mode === 'hot') {
    const eff = Math.max(s.efficiencyPct, 1) / 100
    return perKwh(s.fuel) ? s.fuelPrice / BTU_PER_KWH / eff : s.fuelPrice / 1e6 / eff
  }
  return (s.kwPerTon / BTU_PER_TON_H) * s.coolPrice
}

/** What is being paid for, in words: "natural gas at $14.00/MMBtu, 80% boiler efficiency". */
export function priceBasis(s: SimState, mode: SimMode): string {
  if (mode !== 'hot') return `electricity at $${s.coolPrice.toFixed(3)}/kWh, cooling equipment ${s.kwPerTon.toFixed(2)} kW/ton`
  if (s.fuel === 'electric') return `electric heat at $${s.fuelPrice.toFixed(3)}/kWh, ${s.efficiencyPct}% efficient`
  if (s.fuel === 'heatpump') return `heat pump at $${s.fuelPrice.toFixed(3)}/kWh, COP ${(s.efficiencyPct / 100).toFixed(1)}`
  return s.fuel === 'gas'
    ? `natural gas at $${s.fuelPrice.toFixed(2)}/MMBtu, ${s.efficiencyPct}% boiler efficiency`
    : `purchased steam at $${s.fuelPrice.toFixed(2)}/MMBtu, ${s.efficiencyPct}% system efficiency`
}

/** "100 LF, 24/7" — the run the yearly numbers cover. */
export function runBasis(s: SimState): string {
  const len = `${Math.round(s.lengthFt).toLocaleString('en-US')} LF`
  return s.hours >= 8760 ? `${len}, running 24/7` : `${len}, ${s.hours.toLocaleString('en-US')} h/yr`
}

export function annualCost(s: SimState, mode: SimMode, ev: Evaluation): CostResult | null {
  if (s.system === 'duct') return ductCost(s)
  mode = physicsMode(s, mode)
  if (!ev.annual || mode === 'condensate') return null
  if (s.pipeOutdoors && (mode === 'hot' || mode === 'cold')) return pipeOutdoorCost(s, mode)
  const k = dollarsPerBtu(s, mode)
  const bare = ev.annual.bare * k
  const ins = ev.annual.ins * k
  const saved = bare - ins
  const cost = s.installedPerFt * s.lengthFt
  return { bare, ins, saved, btuBare: ev.annual.bare, btuIns: ev.annual.ins, paybackYr: cost > 0 && saved > 0 ? cost / saved : null, basis: `${runBasis(s)} · ${priceBasis(s, mode)}` }
}

/** A pipe outdoors: the months it runs at the county's normal weather (sim/ductEnergy.ts). */
export function pipeOutdoorCost(s: SimState, mode: 'hot' | 'cold'): CostResult | null {
  if (s.lengthFt <= 0 || s.hoursPerDay <= 0 || s.daysPerWeek <= 0) return null
  const { station, part } = pipeOutdoor(s, mode)
  const k = dollarsPerBtu(s, mode)
  const btuBare = part.qBare * s.lengthFt * part.hours
  const btuIns = part.qIns * s.lengthFt * part.hours
  const bare = btuBare * k
  const ins = btuIns * k
  const saved = bare - ins
  const cost = s.installedPerFt * s.lengthFt
  return { bare, ins, saved, btuBare, btuIns, paybackYr: cost > 0 && saved > 0 ? cost / saved : null, basis: `${Math.round(s.lengthFt).toLocaleString('en-US')} LF outdoors, ${Math.round(part.hours).toLocaleString('en-US')} h/yr (${monthSpan(part.months)}), ${station.name} weather · ${priceBasis(s, mode)}` }
}

/** Ducts: each season at Washington's normal weather (sim/ductEnergy.ts); null where nothing is lost. */
export function ductCost(s: SimState): CostResult | null {
  const de = ductEnergy(s)
  if (de.kind === 'none' || s.lengthFt <= 0 || s.hoursPerDay <= 0 || s.daysPerWeek <= 0) return null
  let bare = 0, ins = 0, btuBare = 0, btuIns = 0
  for (const p of de.parts) {
    const k = dollarsPerBtu(s, p.mode)
    const b = p.qBare * s.lengthFt * p.hours
    const i = p.qIns * s.lengthFt * p.hours
    btuBare += b
    btuIns += i
    bare += b * k
    ins += i * k
  }
  const saved = bare - ins
  const cost = s.installedPerFt * s.lengthFt
  const seasons = de.parts.map((p) => `${p.season} season ${monthSpan(p.months)}`).join(' + ')
  const prices = [...new Set(de.parts.map((p) => p.mode))].map((m) => priceBasis(s, m)).join('; ')
  return { bare, ins, saved, btuBare, btuIns, paybackYr: cost > 0 && saved > 0 ? cost / saved : null, basis: `${Math.round(s.lengthFt).toLocaleString('en-US')} LF, ${seasons}, ${de.station.name} weather · ${prices}` }
}

/** One side's yearly cost, step by step, for "Show the math". */
export interface CostSteps {
  /** Heat flow per foot, Btu/hr·ft (absolute). */
  q: number
  /** Heat lost or gained over the run and the year, Btu. */
  btuYr: number
  /** What the plant buys to make up that heat. */
  bought: { amount: number; unit: 'MMBtu' | 'kWh' }
  /** Cooling only: ton-hours of refrigeration. */
  tonHr?: number
  cost: number
}

export function costSteps(s: SimState, mode: SimMode, qBtuHrFt: number, hours = s.hours): CostSteps {
  if (s.system !== 'duct') mode = physicsMode(s, mode)
  const q = Math.abs(qBtuHrFt)
  const btuYr = q * s.lengthFt * hours
  if (mode === 'hot') {
    const eff = Math.max(s.efficiencyPct, 1) / 100
    const amount = perKwh(s.fuel) ? btuYr / BTU_PER_KWH / eff : btuYr / 1e6 / eff
    return { q, btuYr, bought: { amount, unit: perKwh(s.fuel) ? 'kWh' : 'MMBtu' }, cost: amount * s.fuelPrice }
  }
  const tonHr = btuYr / BTU_PER_TON_H
  const kwh = tonHr * s.kwPerTon
  return { q, btuYr, tonHr, bought: { amount: kwh, unit: 'kWh' }, cost: kwh * s.coolPrice }
}

export const money = (v: number) =>
  Math.abs(v) >= 100 ? `$${Math.round(v).toLocaleString('en-US')}` : `$${v.toFixed(2)}`
