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

export function annualCost(s: SimState, mode: SimMode, ev: Evaluation): CostResult | null {
  if (!ev.annual || mode === 'condensate') return null
  const k = dollarsPerBtu(s, mode)
  const bare = ev.annual.bare * k
  const ins = ev.annual.ins * k
  const saved = bare - ins
  const cost = s.installedPerFt * s.lengthFt
  const basis = mode === 'hot'
    ? s.fuel === 'electric'
      ? `$${s.fuelPrice.toFixed(3)}/kWh at ${s.efficiencyPct}% efficiency`
      : `$${s.fuelPrice.toFixed(2)}/MMBtu (${s.fuel === 'gas' ? 'natural gas' : 'purchased steam'}) at ${s.efficiencyPct}% efficiency`
    : `$${s.coolPrice.toFixed(3)}/kWh at ${s.kwPerTon} kW/ton`
  return { bare, ins, saved, paybackYr: cost > 0 && saved > 0 ? cost / saved : null, basis }
}

export const money = (v: number) =>
  Math.abs(v) >= 100 ? `$${Math.round(v).toLocaleString('en-US')}` : `$${v.toFixed(2)}`
