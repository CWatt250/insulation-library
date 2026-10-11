/**
 * Heat transfer from the outer surface of a horizontal cylinder to air, plus
 * radiation to surroundings at the air temperature — the ASTM C680 / 3E Plus
 * formulation (research/calc-method-verified.json, surface_heat_transfer):
 *
 *   natural convection — Churchill & Chu, horizontal cylinder
 *   forced convection  — Churchill & Bernstein, cylinder in cross flow
 *   mixed              — Nu = [(Nu_N − 0.3)^4 + (Nu_F − 0.3)^4]^(1/4) + 0.3  (horizontal pipe)
 *   radiation          — h_r = ε σ (Ts⁴ − Ta⁴) / (Ts − Ta)
 *   air properties     — the C680-form equations at the film temperature
 *
 * Computed in the inch-pound units those equations are printed in, returned in
 * SI (W/m²·K) for the engine. Sources: M3 (DNV review of a C680 tool), M8 (NIA
 * calculator code), M19 (Lienhard), M20 (U.S. Standard Atmosphere 1976).
 */

/** Btu/(h·ft²·°F) → W/(m²·K) */
const H_IP_TO_SI = 5.678263
/** Stefan–Boltzmann, Btu/(h·ft²·°R⁴), as printed for C680 (M3). */
const SIGMA_IP = 0.1714e-8
const G_FT_H2 = 32.174 * 3600 * 3600

/** Air at a film temperature (K), C680 form. Units as printed: Btu, lb, ft, h, °F. */
export function airIp(Tk: number) {
  const tF = Tk * 1.8 - 459.67
  const k = (6.325e-6 * Math.sqrt(Tk) * 241.77) / (1 + (245.4 * 10 ** (-12 / Tk)) / Tk) // Btu/(h·ft·°F)
  const mu = (145.8 * Tk * Math.sqrt(Tk) * 2.419e-5) / (Tk + 110.4) // lb/(ft·h)
  const rho = 22.0493 / Tk // lb/ft³
  const cp = 0.24008 - tF * (1.2477e-6 - tF * (4.0489e-8 - 1.6088e-11 * tF)) // Btu/(lb·°F)
  const pr = 0.7189 - tF * (1.6349e-4 - tF * (1.8106e-7 - 5.6617e-11 * tF))
  return { k, mu, rho, nu: mu / rho, cp, pr, beta: 1 / (1.8 * Tk) }
}

/** Natural convection Nusselt number, horizontal cylinder (Churchill–Chu). */
export function nuNatural(ra: number, pr: number) {
  const f = (1 + (0.559 / pr) ** (9 / 16)) ** (8 / 27)
  return (0.6 + (0.387 * Math.max(ra, 0) ** (1 / 6)) / f) ** 2
}

/** Forced convection Nusselt number, cylinder in cross flow (Churchill–Bernstein). */
export function nuForced(re: number, pr: number) {
  const a = (0.62 * Math.max(re, 0) ** 0.5 * pr ** (1 / 3)) / (1 + (0.4 / pr) ** (2 / 3)) ** 0.25
  return 0.3 + a * (1 + (Math.max(re, 0) / 282000) ** (5 / 8)) ** (4 / 5)
}

/** C680 blending for horizontal pipe: j = 4, D = 0.3. */
export const MIXED = { j: 4, D: 0.3 }

export interface SurfaceCoeffs {
  /** W/(m²·K) */
  hConv: number
  hRad: number
  h: number
  /** Film properties in SI, for the condensation-rate estimate. */
  film: { rho: number; cp: number }
}

/**
 * Combined surface coefficient.
 * @param Ts surface temperature, K
 * @param Ta ambient air (and surroundings) temperature, K
 * @param D outer diameter, m
 * @param eps surface emittance
 * @param windMph air speed across the pipe, mph
 */
export function surfaceCoeffs(Ts: number, Ta: number, D: number, eps: number, windMph: number): SurfaceCoeffs {
  const a = airIp((Ts + Ta) / 2)
  const dF = Math.abs(Ts - Ta) * 1.8
  const dFt = D / 0.3048
  const ra = (G_FT_H2 * a.beta * a.rho * a.cp * dF * dFt ** 3) / (a.nu * a.k)
  const nN = nuNatural(ra, a.pr)
  let nu = nN
  if (windMph > 0) {
    const re = (windMph * 5280 * dFt) / a.nu
    const nF = nuForced(re, a.pr)
    const { j, D: d } = MIXED
    nu = ((nN - d) ** j + (nF - d) ** j) ** (1 / j) + d
  }
  const hConvIp = (nu * a.k) / dFt
  const TsR = Ts * 1.8
  const TaR = Ta * 1.8
  const hRadIp = Math.abs(TsR - TaR) < 1e-9
    ? 4 * eps * SIGMA_IP * TaR ** 3
    : (eps * SIGMA_IP * (TsR ** 4 - TaR ** 4)) / (TsR - TaR)
  const hConv = hConvIp * H_IP_TO_SI
  const hRad = hRadIp * H_IP_TO_SI
  return { hConv, hRad, h: hConv + hRad, film: { rho: a.rho * 16.018463, cp: a.cp * 4186.8 } }
}
