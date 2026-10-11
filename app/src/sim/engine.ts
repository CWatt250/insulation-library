import { kCurve, kIntegral, kMean, solveIntegral, type KCurve } from './conductivity'
import { surfaceCoeffs } from './surface'
import { dewPointF, pSat, vaporDensity } from './psychro'
import { fToC, fToK, kToF, wPerMToBtuHrFt } from './units'
import type { KPoint } from '../data/specs'

/**
 * Steady-state heat flow through an insulated (or bare) horizontal pipe, in
 * the manner of ASTM C680: cylindrical conduction through each layer with
 * temperature-dependent k, and a combined convection + radiation coefficient
 * at the outer surface. The surface temperature is found by bisection so the
 * heat conducted through the insulation equals the heat leaving the surface.
 *
 * Simplifications (listed in the UI's assumptions footer):
 *  - pipe outer surface = fluid temperature (no inside film or wall resistance)
 *  - jackets, facings and membranes add no conduction resistance; they only set
 *    the surface emittance
 *  - surroundings for radiation are at the ambient air temperature
 *  - insulation is dry, joints are tight, and the run is long (no end effects)
 */

export interface InsLayer {
  k: KCurve
  /** Inner and outer radius, m. */
  rIn: number
  rOut: number
}

export interface CaseInput {
  /** Bare pipe outer diameter, m. */
  pipeOd: number
  processF: number
  ambientF: number
  /** Air speed across the pipe, mph. 0 = still air (natural convection). */
  windMph: number
  /** Insulation layers inside → out; empty for a bare pipe. */
  layers: InsLayer[]
  /** Emittance of the outermost surface (the pipe itself when bare). */
  emittance: number
}

export interface CaseResult {
  /** Heat flow per unit length, W/m. Positive = heat leaves the pipe (loss); negative = heat gain. */
  qWm: number
  qBtuHrFt: number
  surfaceF: number
  /** Outer diameter of the exposed surface, m. */
  outerD: number
  hConv: number
  hRad: number
  /** Boundary temperatures inside → out (pipe surface first, exposed surface last), °F. */
  boundariesF: number[]
  /** Mean temperature and mean k of each layer (°F; Btu·in/hr·ft²·°F). */
  layerMeanF: number[]
  layerKIp: number[]
  /** A layer's mean temperature fell outside the published k data. */
  extrapolated: boolean
  /** Radial temperature profile for visualisation: r (m) → °F. */
  profile: { r: number; tF: number }[]
}

export const curveFrom = (points: KPoint[]) => kCurve(points)

/** Temperature at the inner face of a layer that carries q' (W/m) with outer face T_out. */
function innerTemp(L: InsLayer, Tout: number, q: number) {
  const F = (q * Math.log(L.rOut / L.rIn)) / (2 * Math.PI) // = ∫_{Tout}^{Tin} k dT
  return solveIntegral(L.k, Tout, -F)
}

export function solveCase(c: CaseInput): CaseResult {
  const Ti = fToK(c.processF)
  const Ta = fToK(c.ambientF)
  const rOuter = c.layers.length ? c.layers[c.layers.length - 1].rOut : c.pipeOd / 2
  const D = 2 * rOuter

  const surfaceQ = (Ts: number) => {
    const h = surfaceCoeffs(Ts, Ta, D, c.emittance, c.windMph)
    return { q: h.h * (Ts - Ta) * Math.PI * D, h }
  }

  let Ts = Ti
  if (c.layers.length) {
    // residual: pipe temperature implied by a guessed surface temperature, minus the real one
    const residual = (ts: number) => {
      const { q } = surfaceQ(ts)
      let T = ts
      for (let i = c.layers.length - 1; i >= 0; i--) T = innerTemp(c.layers[i], T, q)
      return T - Ti
    }
    let lo = Math.min(Ti, Ta)
    let hi = Math.max(Ti, Ta)
    let rLo = residual(lo)
    for (let i = 0; i < 70 && hi - lo > 1e-6; i++) {
      const mid = (lo + hi) / 2
      const r = residual(mid)
      if (Math.sign(r) === Math.sign(rLo)) {
        lo = mid
        rLo = r
      } else hi = mid
    }
    Ts = (lo + hi) / 2
  }

  const { q, h } = surfaceQ(Ts)
  // boundary temperatures and per-layer stats, marching inward from the surface
  const bounds: number[] = [Ts]
  let T = Ts
  for (let i = c.layers.length - 1; i >= 0; i--) {
    T = innerTemp(c.layers[i], T, q)
    bounds.unshift(T)
  }
  // pin the pipe surface to the process temperature (bisection residual ~1e-6 K)
  if (c.layers.length) bounds[0] = Ti

  const layerMeanF: number[] = []
  const layerKIp: number[] = []
  let extrapolated = false
  c.layers.forEach((L, i) => {
    const t1 = bounds[i]
    const t2 = bounds[i + 1]
    const mean = (t1 + t2) / 2
    layerMeanF.push(kToF(mean))
    // report k in the data sheet's units
    layerKIp.push(kMean(L.k, t1, t2) / 0.144227888)
    if (mean < L.k.min - 1e-6 || mean > L.k.max + 1e-6) extrapolated = true
  })

  const profile: { r: number; tF: number }[] = [{ r: c.pipeOd / 2, tF: c.processF }]
  c.layers.forEach((L, i) => {
    const Tin = bounds[i]
    const n = 10
    for (let s = 1; s <= n; s++) {
      const r = L.rIn * (L.rOut / L.rIn) ** (s / n)
      const F = (q * Math.log(r / L.rIn)) / (2 * Math.PI)
      profile.push({ r, tF: kToF(solveIntegral(L.k, Tin, F)) })
    }
  })

  return {
    qWm: q,
    qBtuHrFt: wPerMToBtuHrFt(q),
    surfaceF: kToF(Ts),
    outerD: D,
    hConv: h.hConv,
    hRad: h.hRad,
    boundariesF: bounds.map(kToF),
    layerMeanF,
    layerKIp,
    extrapolated,
    profile,
  }
}

// ---------------------------------------------------------------- moisture

export interface Moisture {
  dewF: number
  /** Surface minus dew point, °F. Negative = condensing. */
  marginF: number
  condensing: boolean
  /** Surface is below 32°F and below the dew point: frost, not liquid. */
  frost: boolean
  /**
   * Estimated condensation rate, g/(m²·h) of exposed surface, from the
   * heat/mass-transfer analogy. 0 when dry.
   */
  rateGm2h: number
  /** Same, per linear foot of pipe: fluid ounces per day. */
  ozPerDayPerFt: number
}

/** Lewis number for air–water vapor (Lienhard, M19), used in h_m = h / (ρ c_p Le^(2/3)). */
export const LEWIS = 0.847

export function moisture(c: CaseInput, r: CaseResult, rhPct: number): Moisture {
  const dewF = dewPointF(c.ambientF, rhPct)
  const marginF = r.surfaceF - dewF
  const condensing = marginF < 0
  let rate = 0
  if (condensing) {
    const Ta = fToK(c.ambientF)
    const Ts = fToK(r.surfaceF)
    const h = surfaceCoeffs(Ts, Ta, r.outerD, c.emittance, c.windMph)
    const hm = h.hConv / (h.film.rho * h.film.cp * LEWIS ** (2 / 3)) // m/s
    const rhoInf = vaporDensity((rhPct / 100) * pSat(fToC(c.ambientF)), Ta)
    const rhoS = vaporDensity(pSat(fToC(r.surfaceF)), Ts)
    rate = Math.max(0, hm * (rhoInf - rhoS)) * 1000 * 3600 // g/(m²·h)
  }
  const areaPerFt = Math.PI * r.outerD * 0.3048 // m² per ft
  const gPerDay = rate * areaPerFt * 24
  return {
    dewF,
    marginF,
    condensing,
    frost: condensing && r.surfaceF < 32,
    rateGm2h: rate,
    ozPerDayPerFt: gPerDay / 29.5735,
  }
}

/** Annual energy through the run, Btu/yr (sign dropped). */
export const annualBtu = (qBtuHrFt: number, lengthFt: number, hours: number) => Math.abs(qBtuHrFt) * lengthFt * hours

export { kIntegral }
