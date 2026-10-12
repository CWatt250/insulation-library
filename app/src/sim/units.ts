/**
 * Unit conversions. The engine works in SI (K, W, m); the UI speaks
 * inch-pound by default with an SI toggle. Factors are the exact
 * definitions (NIST SP 811 App. B): 1 Btu_IT = 1055.05585262 J, 1 ft = 0.3048 m.
 */

export const BTU_J = 1055.05585262
export const FT_M = 0.3048
export const IN_M = 0.0254
export const HR_S = 3600

export const fToK = (f: number) => ((f - 32) * 5) / 9 + 273.15
export const kToF = (k: number) => ((k - 273.15) * 9) / 5 + 32
export const fToC = (f: number) => ((f - 32) * 5) / 9
export const cToF = (c: number) => (c * 9) / 5 + 32
/** A temperature difference, °F → K. */
export const dFtoK = (d: number) => (d * 5) / 9

/** W/m → Btu/(hr·ft) */
export const wPerMToBtuHrFt = (w: number) => (w * HR_S * FT_M) / BTU_J
export const btuHrFtToWPerM = (b: number) => (b * BTU_J) / (HR_S * FT_M)

/** Btu·in/(hr·ft²·°F) → W/(m·K) */
export const kIpToSi = (k: number) => (k * BTU_J * IN_M) / (HR_S * FT_M * FT_M * (5 / 9))

export const mphToMs = (mph: number) => (mph * 1609.344) / 3600

/** Btu → MMBtu, and GJ for SI display. */
export const btuToMMBtu = (b: number) => b / 1e6
export const btuToGJ = (b: number) => (b * BTU_J) / 1e9

export type UnitSystem = 'ip' | 'si'

const round = (v: number, digits: number) => {
  const p = 10 ** digits
  return Math.round(v * p) / p
}

/** Display helpers. Inputs are always inch-pound (the app's canonical state). */
export const fmt = {
  temp: (f: number, u: UnitSystem, digits = 0) =>
    u === 'ip' ? `${round(f, digits).toLocaleString('en-US')}°F` : `${round(fToC(f), digits).toLocaleString('en-US')}°C`,
  tempDelta: (dF: number, u: UnitSystem, digits = 0) => {
    const v = u === 'ip' ? dF : (dF * 5) / 9
    const s = round(v, digits)
    return `${s > 0 ? '+' : ''}${s.toLocaleString('en-US', { maximumFractionDigits: digits })}°${u === 'ip' ? 'F' : 'C'}`
  },
  /** A margin setting such as 0.75°F, shown without rounding it away. */
  margin: (dF: number, u: UnitSystem) => {
    const v = u === 'ip' ? dF : (dF * 5) / 9
    return `${round(v, 2).toLocaleString('en-US', { maximumFractionDigits: 2 })}°${u === 'ip' ? 'F' : 'C'}`
  },
  /** Heat flow per unit length; input in Btu/(hr·ft). */
  flow: (btuHrFt: number, u: UnitSystem) => {
    const v = u === 'ip' ? btuHrFt : btuHrFtToWPerM(btuHrFt)
    const a = Math.abs(v)
    return a >= 100 ? Math.round(v).toLocaleString('en-US') : a >= 10 ? v.toFixed(1) : v.toFixed(2)
  },
  flowUnit: (u: UnitSystem) => (u === 'ip' ? 'Btu/hr·ft' : 'W/m'),
  length: (ft: number, u: UnitSystem) => (u === 'ip' ? `${Math.round(ft).toLocaleString('en-US')} ft` : `${Math.round(ft * FT_M).toLocaleString('en-US')} m`),
  /** An insulation thickness: 1-1/2" in inches, 38 mm in metric. */
  thick: (inch: number, u: UnitSystem) => (u === 'ip' ? inchLabel(inch) : `${Math.round(inch * 25.4)} mm`),
  inches: (inch: number, u: UnitSystem) => (u === 'ip' ? `${inch.toLocaleString('en-US', { maximumFractionDigits: 2 })}"` : `${Math.round(inch * 25.4)} mm`),
  /** Annual energy; input in Btu/yr. */
  energy: (btu: number, u: UnitSystem) => {
    if (u === 'si') {
      const gj = btuToGJ(btu)
      return `${gj >= 100 ? Math.round(gj).toLocaleString('en-US') : gj.toFixed(1)} GJ/yr`
    }
    const mm = btuToMMBtu(btu)
    return `${mm >= 100 ? Math.round(mm).toLocaleString('en-US') : mm.toFixed(1)} MMBtu/yr`
  },
}

/** Fractional-inch label, e.g. 1.5 → 1-1/2". */
export function inchLabel(v: number) {
  const whole = Math.floor(v + 1e-9)
  const frac = v - whole
  // nearest sixteenth when it is one, reduced; or fifths, as JM labels duct wrap (2-1/5", 4-2/5")
  const n16 = Math.round(frac * 16)
  const n5 = Math.round(frac * 5)
  let f = ''
  if (frac >= 0.01) {
    if (Math.abs(frac - n16 / 16) < 0.004) {
      let num = n16
      let den = 16
      while (num % 2 === 0 && den > 1) { num /= 2; den /= 2 }
      f = `${num}/${den}`
    } else if (Math.abs(frac - n5 / 5) < 0.004) f = `${n5}/5`
    else return `${(whole + frac).toFixed(2)}"` // neither (e.g. aerogel's 10 mm wraps): plain decimal
  }
  if (!whole) return `${f || '0'}"`
  return f ? `${whole}-${f}"` : `${whole}"`
}
