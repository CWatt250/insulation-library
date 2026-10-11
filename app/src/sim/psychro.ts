/**
 * Moist-air helpers for condensation checks.
 *
 * Saturation vapor pressure over water uses the Magnus form with the
 * Alduchov & Eskridge (1996) coefficients — the same equation inverted for
 * the dew point. Sources: see CALC_SOURCES.magnus in sources.ts.
 */

export const MAGNUS = { a: 17.625, b: 243.04, c: 610.94 } // c in Pa, b in °C

const R_V = 461.5 // J/(kg·K), water vapor gas constant

/** Saturation vapor pressure over liquid water, Pa. T in °C. */
export const pSat = (tC: number) => MAGNUS.c * Math.exp((MAGNUS.a * tC) / (MAGNUS.b + tC))

/** Dew point, °C, from dry-bulb °C and relative humidity in percent. */
export function dewPointC(tC: number, rhPct: number): number {
  const rh = Math.min(Math.max(rhPct, 0.1), 100) / 100
  const g = Math.log(rh) + (MAGNUS.a * tC) / (MAGNUS.b + tC)
  return (MAGNUS.b * g) / (MAGNUS.a - g)
}

export const dewPointF = (tF: number, rhPct: number) => (dewPointC(((tF - 32) * 5) / 9, rhPct) * 9) / 5 + 32

/** Water-vapor density, kg/m³, at partial pressure p (Pa) and temperature T (K). */
export const vaporDensity = (p: number, T: number) => p / (R_V * T)
