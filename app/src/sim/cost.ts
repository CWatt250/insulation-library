import { physicsMode } from './model'
import type { Evaluation } from './model'
import type { SimMode, SimState } from './types'

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
 */
export const GAS_DEFAULT = 14
export const POWER_DEFAULT = 0.12
export const KW_PER_TON_DEFAULT = 0.9
export const BOILER_DEFAULT = 80

export interface CostResult {
  bare: number
  ins: number
  saved: number
  /** Simple payback, years; null without an installed cost. */
  paybackYr: number | null
  basis: string
}

export function dollarsPerBtu(s: SimState, mode: SimMode): number {
  if (mode === 'hot') {
    const eff = Math.max(s.efficiencyPct, 1) / 100
    return s.fuel === 'electric' ? s.fuelPrice / BTU_PER_KWH / eff : s.fuelPrice / 1e6 / eff
  }
  return (s.kwPerTon / BTU_PER_TON_H) * s.coolPrice
}

/** What is being paid for, in words: "natural gas at $14.00/MMBtu, 80% boiler efficiency". */
export function priceBasis(s: SimState, mode: SimMode): string {
  if (mode !== 'hot') return `electricity at $${s.coolPrice.toFixed(3)}/kWh, chiller plant ${s.kwPerTon.toFixed(2)} kW/ton`
  if (s.fuel === 'electric') return `electric heat at $${s.fuelPrice.toFixed(3)}/kWh, ${s.efficiencyPct}% efficient`
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
  mode = physicsMode(s, mode)
  if (!ev.annual || mode === 'condensate') return null
  const k = dollarsPerBtu(s, mode)
  const bare = ev.annual.bare * k
  const ins = ev.annual.ins * k
  const saved = bare - ins
  const cost = s.installedPerFt * s.lengthFt
  return { bare, ins, saved, paybackYr: cost > 0 && saved > 0 ? cost / saved : null, basis: `${runBasis(s)} · ${priceBasis(s, mode)}` }
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

export function costSteps(s: SimState, mode: SimMode, qBtuHrFt: number): CostSteps {
  mode = physicsMode(s, mode)
  const q = Math.abs(qBtuHrFt)
  const btuYr = q * s.lengthFt * s.hours
  if (mode === 'hot') {
    const eff = Math.max(s.efficiencyPct, 1) / 100
    const amount = s.fuel === 'electric' ? btuYr / BTU_PER_KWH / eff : btuYr / 1e6 / eff
    return { q, btuYr, bought: { amount, unit: s.fuel === 'electric' ? 'kWh' : 'MMBtu' }, cost: amount * s.fuelPrice }
  }
  const tonHr = btuYr / BTU_PER_TON_H
  const kwh = tonHr * s.kwPerTon
  return { q, btuYr, tonHr, bought: { amount: kwh, unit: 'kWh' }, cost: kwh * s.coolPrice }
}

export const money = (v: number) =>
  Math.abs(v) >= 100 ? `$${Math.round(v).toLocaleString('en-US')}` : `$${v.toFixed(2)}`
