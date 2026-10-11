import type { KPoint } from '../data/specs'
import { kIpToSi } from './units'

/**
 * Thermal conductivity as a function of temperature, built from the k-vs-mean
 * points a manufacturer publishes (ASTM C335 for pipe insulation).
 *
 * Between published points k is linear in temperature, and beyond them the end
 * segments are extended linearly (flagged as extrapolated). A published k at a
 * mean temperature is, for a linear k(T), exactly the average of k over the
 * span — so treating the curve as k(T) and integrating it across the layer is
 * the same "temperature-integral" form ASTM C680 uses for cylinders:
 *
 *   q' = 2π · ∫_{T_out}^{T_in} k(T) dT / ln(r_out / r_in)
 *
 * Internally everything is SI: T in K, k in W/(m·K).
 */
export interface KCurve {
  /** Points sorted by temperature, SI. */
  pts: { T: number; k: number }[]
  /** Published range, K. */
  min: number
  max: number
}

const fToK = (f: number) => ((f - 32) * 5) / 9 + 273.15
/** Floor so an extrapolated curve can never go non-physical. */
const K_FLOOR = 0.005

export function kCurve(points: KPoint[]): KCurve {
  if (points.length < 2) throw new Error('k curve needs at least two published points')
  const pts = [...points].sort((a, b) => a.meanF - b.meanF).map((p) => ({ T: fToK(p.meanF), k: kIpToSi(p.k) }))
  return { pts, min: pts[0].T, max: pts[pts.length - 1].T }
}

/** k(T), W/(m·K). */
export function kAt(c: KCurve, T: number): number {
  const p = c.pts
  let i = 0
  if (T <= p[0].T) i = 0
  else if (T >= p[p.length - 1].T) i = p.length - 2
  else while (i < p.length - 2 && T > p[i + 1].T) i++
  const a = p[i]
  const b = p[i + 1]
  const k = a.k + ((b.k - a.k) * (T - a.T)) / (b.T - a.T)
  return Math.max(k, K_FLOOR)
}

/**
 * ∫_{T1}^{T2} k(T) dT (W/m), exact for the piecewise-linear curve. Integrates
 * on a fine grid so extrapolation and the floor are handled the same way.
 */
export function kIntegral(c: KCurve, T1: number, T2: number): number {
  if (T1 === T2) return 0
  const sign = T2 > T1 ? 1 : -1
  const lo = Math.min(T1, T2)
  const hi = Math.max(T1, T2)
  // breakpoints: published points inside the span, plus the ends
  const xs = [lo, ...c.pts.map((p) => p.T).filter((t) => t > lo && t < hi), hi]
  let sum = 0
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i]
    const b = xs[i + 1]
    sum += ((kAt(c, a) + kAt(c, b)) / 2) * (b - a)
  }
  return sign * sum
}

/** Mean k over a span — what a published "k at mean temperature" represents. */
export const kMean = (c: KCurve, T1: number, T2: number) =>
  Math.abs(T2 - T1) < 1e-9 ? kAt(c, T1) : kIntegral(c, T1, T2) / (T2 - T1)

/**
 * Inverse of the integral: the temperature T such that ∫_{T}^{T0} k dT = F.
 * F > 0 means T is below T0. Monotonic, so bisection is safe.
 */
export function solveIntegral(c: KCurve, T0: number, F: number): number {
  if (F === 0) return T0
  // bracket: k ≥ K_FLOOR, so |ΔT| ≤ |F| / K_FLOOR; but keep it tighter for speed
  let span = Math.abs(F) / Math.max(kAt(c, T0), K_FLOOR)
  const f = (T: number) => kIntegral(c, T, T0) - F
  let lo = F > 0 ? T0 - span : T0
  let hi = F > 0 ? T0 : T0 + span
  for (let i = 0; i < 40 && f(lo) * f(hi) > 0; i++) {
    span *= 2
    if (F > 0) lo = T0 - span
    else hi = T0 + span
  }
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    // f decreases as T increases (less of the span is integrated)
    if (f(mid) > 0) lo = mid
    else hi = mid
    if (hi - lo < 1e-7) break
  }
  return (lo + hi) / 2
}
