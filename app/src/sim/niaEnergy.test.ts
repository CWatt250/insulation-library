/**
 * Annual heat loss, energy and fuel cost against an outside tool: the National
 * Insulation Association's MIDG "Energy Calculator for Horizontal Piping"
 * (© 2020 National Institute of Building Sciences, source V30).
 *
 * NIA's numbers below come from running its published calculation code
 * (echp/main.js, unmodified, in Node, driven the way its controller.js drives
 * the form). They are hard-coded so this file stands alone; the inputs, NIA's
 * full result tables, its internals and the comparison are recorded in
 * research/nia-energy-verified.json. Case NIA-1 is the calculator's default
 * form and reproduces every row of NIA's published default-input screenshot
 * (validation-cases.json CASE-13) after the page's rounding.
 *
 * NIA's method, in brief: per foot q = π·D·(T_op − T_amb)/(R_wall + R_ins + 1/h),
 * with a Sch 40 steel wall (k_steel(T) below), insulation k(T) = a + bT + cT²
 * ("ASTM Specification Values") averaged exactly between its faces, insulation
 * bore and OD from a built-in ASTM C585-style table, and h = the ASTM C680
 * radiation + Churchill–Chu / Churchill–Bernstein convection with C680 air
 * properties (ε 0.8 for the bare pipe). Cost of fuel ($/yr) =
 * 100·|heat loss|·hours·fuel cost/(Btu per fuel unit · efficiency %).
 *
 * Three checks, each isolating one part of the chain:
 *  1. Cost/energy step — the app's costSteps fed NIA's own per-foot heat loss
 *     must give NIA's fuel cost. Same formula, so ≤ 0.01 %: gas is exact (NIA's
 *     $/Mcf entered as $/MMBtu at NIA's own 1.027 MMBtu/Mcf), electricity is
 *     0.0041 % low because the app uses 3,412.14 Btu/kWh and NIA 3,412.
 *  2. Heat transfer — solveCase fed NIA's k-curve, insulation bore/OD and steel
 *     wall must reproduce NIA's heat loss and surface temperature. NIA's surface
 *     coefficients are the same C680 equations as sim/surface.ts, so this is
 *     tight: observed ≤ 0.002 % and ≤ 0.001°F; the bands (0.01 %, 0.01°F) only
 *     allow for NIA's 1e-5°F convergence test, its π = 3.14159 and the 5°F
 *     sampling of its k quadratic.
 *  3. As configured — the app run the way a user would set it up. The physics
 *     agree (check 2); what differs is input data, each difference explained:
 *     - bare: the app neglects the metal wall (as C680 does), NIA includes it,
 *       so the app is 0.11–0.78 % higher (2.2°F wall drop in NIA at 600°F, NPS 8)
 *       → band 0 to +1 %.
 *     - insulated: the app's k is the manufacturer's typical curve (OC SSL II
 *       for fiberglass, ROCKWOOL ProRox PS 960NA for mineral wool — what the UI
 *       picks), 3.4–10.0 % below NIA's ASTM C547 specification curves at the layer
 *       mean, and the app puts the insulation on the pipe OD where NIA uses a
 *       slightly larger bore (2.41" on NPS 2): app 4.1–10.5 % lower → band −12 %
 *       to −3 %. Swapping in NIA's k-curve alone must bring it to within −2.5 % to
 *       0 (observed −0.7 to −2.1 %, the bore), which pins the rest on k data.
 *     - savings: dominated by the bare loss, so the two effects nearly cancel:
 *       app 0.53–1.22 % higher → band ±1.5 %.
 */
import { describe, expect, it } from 'vitest'
import { annualBtu, curveFrom, solveCase } from './engine'
import { annualCost, costSteps } from './cost'
import { caseFor, evaluate, productFor, productForTemp } from './model'
import { initialState } from './presets'
import { pipeSizes } from '../data/pipes'
import type { InsulationId } from '../data/catalog'
import type { SimState } from './types'

interface NiaCase {
  id: string
  // NIA form, Lines 1–13 (cost multiplier 1.00 and life 20 yr do not affect heat loss or fuel cost)
  nps: string
  lengthFt: number
  operatingF: number
  ambientF: number
  windMph: number
  insulation: 'fiberglass' | 'wool'
  thicknessIn: number
  emittance: number
  hours: number
  efficiencyPct: number
  fuel: 'gas' | 'electricity'
  /** $/Mcf (gas) or $/kWh (electricity) */
  fuelCost: number
  // NIA internals for the compared thickness: insulation bore and OD (in), mean k (Btu·in/h·ft²·°F)
  insIdIn: number
  insOdIn: number
  kMean: number
  // NIA outputs, unrounded: Heat Loss (Btu/h for the run), Surface Temp (°F), Cost of Fuel ($/yr)
  bare: { heatLoss: number; surfaceF: number; fuelCost: number }
  ins: { heatLoss: number; surfaceF: number; fuelCost: number }
}

// Generated 2026-10-12 from echp/main.js (Last-Modified 11 Dec 2023); see research/nia-energy-verified.json.
const CASES: NiaCase[] = [
  { id: 'NIA-1', nps: '3', lengthFt: 1, operatingF: 350, ambientF: 75, windMph: 8, insulation: 'wool', thicknessIn: 2, emittance: 0.10, hours: 8320, efficiencyPct: 80, fuel: 'gas', fuelCost: 8.00,
    insIdIn: 3.53, insOdIn: 7.62, kMean: 0.31925949,
    bare: { heatLoss: 1442.57673, surfaceF: 349.070981, fuelCost: 116.866976 },
    ins: { heatLoss: 57.7337184, surfaceF: 84.2062874, fuelCost: 4.677162 } },
  { id: 'NIA-2', nps: '2', lengthFt: 100, operatingF: 180, ambientF: 75, windMph: 0, insulation: 'fiberglass', thicknessIn: 1, emittance: 0.90, hours: 8760, efficiencyPct: 80, fuel: 'gas', fuelCost: 8.00,
    insIdIn: 2.41, insOdIn: 4.5, kMean: 0.268348757,
    bare: { heatLoss: 14679.488, surfaceF: 179.908067, fuelCost: 1252.11601 },
    ins: { heatLoss: 2102.36234, surfaceF: 86.5522088, fuelCost: 179.325161 } },
  { id: 'NIA-3', nps: '4', lengthFt: 100, operatingF: 250, ambientF: 75, windMph: 0, insulation: 'wool', thicknessIn: 2, emittance: 0.10, hours: 8760, efficiencyPct: 80, fuel: 'gas', fuelCost: 8.00,
    insIdIn: 4.53, insOdIn: 8.62, kMean: 0.291131624,
    bare: { heatLoss: 51724.7072, surfaceF: 249.731818, fuelCost: 4411.96139 },
    ins: { heatLoss: 3628.97345, surfaceF: 96.8187252, fuelCost: 309.540481 } },
  { id: 'NIA-4', nps: '8', lengthFt: 100, operatingF: 600, ambientF: 75, windMph: 0, insulation: 'wool', thicknessIn: 3, emittance: 0.10, hours: 8760, efficiencyPct: 80, fuel: 'gas', fuelCost: 8.00,
    insIdIn: 8.7, insOdIn: 15, kMean: 0.433322925,
    bare: { heatLoss: 518971.277, surfaceF: 597.761612, fuelCost: 44266.6834 },
    ins: { heatLoss: 19553.348, surfaceF: 130.464683, fuelCost: 1667.84157 } },
  { id: 'NIA-5', nps: '4', lengthFt: 100, operatingF: 350, ambientF: 40, windMph: 15, insulation: 'wool', thicknessIn: 2, emittance: 0.10, hours: 8760, efficiencyPct: 80, fuel: 'gas', fuelCost: 8.00,
    insIdIn: 4.53, insOdIn: 8.62, kMean: 0.30940986,
    bare: { heatLoss: 249073.642, surfaceF: 348.644759, fuelCost: 21245.2299 },
    ins: { heatLoss: 7617.76382, surfaceF: 47.4405107, fuelCost: 649.77226 } },
  { id: 'NIA-6', nps: '2', lengthFt: 100, operatingF: 250, ambientF: 75, windMph: 0, insulation: 'fiberglass', thicknessIn: 1.5, emittance: 0.90, hours: 8760, efficiencyPct: 100, fuel: 'electricity', fuelCost: 0.10,
    insIdIn: 2.41, insOdIn: 5.56, kMean: 0.29291354,
    bare: { heatLoss: 28477.289, surfaceF: 249.815745, fuelCost: 7311.28522 },
    ins: { heatLoss: 2969.01594, surfaceF: 88.1481101, fuelCost: 762.267867 } },
  { id: 'NIA-7', nps: '8', lengthFt: 250, operatingF: 180, ambientF: 70, windMph: 1, insulation: 'fiberglass', thicknessIn: 2, emittance: 0.90, hours: 6000, efficiencyPct: 85, fuel: 'gas', fuelCost: 10.00,
    insIdIn: 8.7, insOdIn: 12.75, kMean: 0.265604233,
    bare: { heatLoss: 136884.529, surfaceF: 179.808422, fuelCost: 9408.41028 },
    ins: { heatLoss: 9397.65275, surfaceF: 76.6759369, fuelCost: 645.923782 } },
  { id: 'NIA-8', nps: '4', lengthFt: 100, operatingF: 350, ambientF: 75, windMph: 0, insulation: 'fiberglass', thicknessIn: 3, emittance: 0.10, hours: 8760, efficiencyPct: 80, fuel: 'gas', fuelCost: 8.00,
    insIdIn: 4.53, insOdIn: 10.75, kMean: 0.337826466,
    bare: { heatLoss: 97502.0597, surfaceF: 349.469479, fuelCost: 8316.63138 },
    ins: { heatLoss: 5127.15718, surfaceF: 99.4818477, fuelCost: 437.331031 } },
]

/** NIA's insulation_table thermal_curve: k(T) = a + bT + cT², Btu·in/h·ft²·°F, T in °F. */
const NIA_K: Record<NiaCase['insulation'], [number, number, number]> = {
  fiberglass: [0.208, 0.000294285714285714, 0.00000114285714285714],
  wool: [0.214285714285714, 0.000317857142857143, 6.78571428571429e-7],
}
/** NIA's fuel_table heat contents, Btu per unit. */
const NIA_FUEL_BTU = { gas: 1027000, electricity: 3412 }
/** NIA's steel wall conductivity at the operating temperature, Btu·in/h·ft²·°F. */
const niaSteelK = (T: number) => 458.46 - 0.1926 * T - 0.00001 * T ** 2 + 0.00000002 * T ** 3

const IN = 0.0254
const BTU_IN_TO_W_MK = 0.144227888

// tolerances (relative, or °F) — see the header for where each comes from
const COST_STEP = 1e-4
const MATCHED_Q = 1e-4
const MATCHED_TS_F = 0.01
const NO_WALL_INS_Q = 5e-4
const BARE_MAX = 0.01
const INS_BAND = { min: -0.12, max: -0.03 }
const INS_NIA_K_BAND = { min: -0.025, max: 0 }
const SAVED = 0.015

const rel = (app: number, nia: number) => app / nia - 1
const pct = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(2)}%`

/** The case as a user would set it up in the app. */
function appState(c: NiaCase): SimState {
  const insulation: InsulationId = c.insulation === 'wool' ? 'mineral-wool' : 'fiberglass'
  const alu = c.emittance === 0.1
  return {
    ...initialState('hot'),
    presetId: null,
    pipe: 'steel',
    npsIndex: pipeSizes('steel').findIndex((p) => p.nps === c.nps),
    processF: c.operatingF,
    ambientF: c.ambientF,
    windMph: c.windMph,
    insulation,
    // the product the UI picks when the material is chosen
    kProduct: productForTemp(insulation, c.operatingF),
    thicknessIn: c.thicknessIn,
    // NIA Line 8 "0.10 - Aluminum, oxidized, in service" / "0.90 - All Service Jacket": the app's own surfaces with those values
    jacket: alu ? 'alu-smooth' : 'none',
    facing: alu ? 'none' : 'asj',
    metalFinish: 'oxidized',
    emittanceOverride: null,
    lengthFt: c.lengthFt,
    hours: c.hours,
    // NIA prices one average ambient and wind over the hours entered: the Setup air, not outdoor-weather pricing
    pipeOutdoors: false,
    fuel: c.fuel === 'gas' ? 'gas' : 'electric',
    // the app prices gas per MMBtu: NIA's $/Mcf at NIA's own 1.027 MMBtu/Mcf
    fuelPrice: c.fuel === 'gas' ? c.fuelCost / (NIA_FUEL_BTU.gas / 1e6) : c.fuelCost,
    efficiencyPct: c.efficiencyPct,
  }
}

/** NIA's k quadratic as app k-points every 5°F (linear-interpolation error < 4e-6 Btu·in/h·ft²·°F). */
function niaCurve(c: NiaCase) {
  const [a, b, q] = NIA_K[c.insulation]
  const pts: { meanF: number; k: number }[] = []
  for (let T = Math.floor(c.ambientF / 10) * 10 - 20; T <= c.operatingF + 20; T += 5) pts.push({ meanF: T, k: a + b * T + q * T * T })
  return curveFrom(pts)
}

/** NIA's Sch 40 steel wall, as the engine's constant-k wall shell. */
function niaWall(s: SimState, c: NiaCase) {
  const p = pipeSizes('steel')[s.npsIndex]
  return { kWmK: niaSteelK(c.operatingF) * BTU_IN_TO_W_MK, rIn: (p.od / 2 - p.wall) * IN }
}

describe('NIA MIDG Energy Calculator for Horizontal Piping (V30)', () => {
  it('cases resolve to the intended app inputs', () => {
    for (const c of CASES) {
      const s = appState(c)
      expect(s.npsIndex, c.id).toBeGreaterThanOrEqual(0)
      const ev = evaluate(s, 'hot')
      expect(ev.ins.input.emittance, `${c.id} emittance`).toBe(c.emittance)
      expect(ev.bare.input.emittance, `${c.id} bare emittance (NIA uses 0.8)`).toBe(0.8)
      // NIA's insulation OD table rounds the C585 sizes to 0.01" (7.62 for 7.625)
      expect(Math.abs(ev.ins.geo!.insOdIn - c.insOdIn), `${c.id} insulation OD`).toBeLessThan(0.006)
    }
  })

  describe('1. cost and energy step, given NIA\'s own heat loss per foot', () => {
    for (const c of CASES) {
      it(c.id, () => {
        const s = appState(c)
        for (const side of [c.bare, c.ins]) {
          const q = side.heatLoss / c.lengthFt
          const st = costSteps(s, 'hot', q)
          expect(st.btuYr / (side.heatLoss * c.hours) - 1).toBeCloseTo(0, 12)
          expect(annualBtu(q, c.lengthFt, c.hours) / (side.heatLoss * c.hours) - 1).toBeCloseTo(0, 12)
          expect(Math.abs(rel(st.cost, side.fuelCost)), `${c.id} cost ${st.cost} vs NIA ${side.fuelCost}`).toBeLessThan(COST_STEP)
        }
      })
    }
  })

  describe('2. heat transfer, given NIA\'s k-curve, insulation bore/OD and steel wall', () => {
    for (const c of CASES) {
      it(c.id, () => {
        const s = appState(c)
        const wall = niaWall(s, c)
        const bareIn = caseFor(s, 'hot', null).input
        const insIn = caseFor(s, 'hot', c.thicknessIn).input
        const niaGeo = { ...insIn, layers: [{ k: niaCurve(c), rIn: (c.insIdIn * IN) / 2, rOut: (c.insOdIn * IN) / 2 }] }
        const bare = solveCase({ ...bareIn, wall })
        const ins = solveCase({ ...niaGeo, wall })
        const insNoWall = solveCase(niaGeo)
        const qb = c.bare.heatLoss / c.lengthFt
        const qi = c.ins.heatLoss / c.lengthFt
        console.log(`${c.id} matched inputs: bare ${pct(rel(bare.qBtuHrFt, qb))} (Ts ${(bare.surfaceF - c.bare.surfaceF).toFixed(4)}°F) · insulated ${pct(rel(ins.qBtuHrFt, qi))} (Ts ${(ins.surfaceF - c.ins.surfaceF).toFixed(4)}°F, mean k ${ins.layerKIp[0].toFixed(4)} vs ${c.kMean.toFixed(4)}) · no wall ${pct(rel(insNoWall.qBtuHrFt, qi))}`)
        expect(Math.abs(rel(bare.qBtuHrFt, qb))).toBeLessThan(MATCHED_Q)
        expect(Math.abs(bare.surfaceF - c.bare.surfaceF)).toBeLessThan(MATCHED_TS_F)
        expect(Math.abs(rel(ins.qBtuHrFt, qi))).toBeLessThan(MATCHED_Q)
        expect(Math.abs(ins.surfaceF - c.ins.surfaceF)).toBeLessThan(MATCHED_TS_F)
        expect(Math.abs(ins.layerKIp[0] / c.kMean - 1)).toBeLessThan(MATCHED_Q)
        // under insulation the wall's share of the resistance is tiny
        expect(Math.abs(rel(insNoWall.qBtuHrFt, qi))).toBeLessThan(NO_WALL_INS_Q)
      })
    }
  })

  describe('3. as configured in the app: heat loss, annual energy, cost and savings', () => {
    for (const c of CASES) {
      it(c.id, () => {
        const s = appState(c)
        const ev = evaluate(s, 'hot')
        const cost = annualCost(s, 'hot', ev)!
        const qb = c.bare.heatLoss / c.lengthFt
        const qi = c.ins.heatLoss / c.lengthFt
        const dBare = rel(ev.bare.result.qBtuHrFt, qb)
        const dIns = rel(ev.ins.result.qBtuHrFt, qi)
        const kApp = ev.ins.result.layerKIp[0]
        // the app's own case with only the k-curve replaced by NIA's
        const insIn = caseFor(s, 'hot', c.thicknessIn).input
        const dInsNiaK = rel(solveCase({ ...insIn, layers: [{ ...insIn.layers[0], k: niaCurve(c) }] }).qBtuHrFt, qi)
        const niaSaved = c.bare.fuelCost - c.ins.fuelCost
        const dSaved = rel(cost.saved, niaSaved)
        console.log(`${c.id} NPS ${c.nps} ${c.operatingF}°F ${c.insulation} ${c.thicknessIn}": bare ${qb.toFixed(1)} vs ${ev.bare.result.qBtuHrFt.toFixed(1)} (${pct(dBare)}) · insulated ${qi.toFixed(2)} vs ${ev.ins.result.qBtuHrFt.toFixed(2)} (${pct(dIns)}; NIA k → ${pct(dInsNiaK)}; k ${kApp.toFixed(4)} ${productFor(s).name} vs NIA ${c.kMean.toFixed(4)}) · saved $${niaSaved.toFixed(2)} vs $${cost.saved.toFixed(2)} (${pct(dSaved)})`)

        expect(dBare).toBeGreaterThan(0)
        expect(dBare).toBeLessThan(BARE_MAX)
        expect(kApp, `${c.id}: the app's typical k should sit below NIA's ASTM specification k`).toBeLessThan(c.kMean)
        expect(dIns).toBeGreaterThan(INS_BAND.min)
        expect(dIns).toBeLessThan(INS_BAND.max)
        expect(dInsNiaK).toBeGreaterThan(INS_NIA_K_BAND.min)
        expect(dInsNiaK).toBeLessThan(INS_NIA_K_BAND.max)

        // annual energy is |q| × length × hours on both sides
        expect(rel(ev.annual!.bare, c.bare.heatLoss * c.hours)).toBeCloseTo(dBare, 9)
        expect(rel(ev.annual!.ins, c.ins.heatLoss * c.hours)).toBeCloseTo(dIns, 9)
        // and the dollars follow the heat loss (electricity: −0.0041 % for Btu/kWh)
        expect(Math.abs(rel(cost.bare, c.bare.fuelCost) - dBare)).toBeLessThan(COST_STEP)
        expect(Math.abs(rel(cost.ins, c.ins.fuelCost) - dIns)).toBeLessThan(COST_STEP)
        expect(Math.abs(dSaved)).toBeLessThan(SAVED)
      })
    }
  })
})
