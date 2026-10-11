import S from './validationSummary.json'

/** Validation rows for the app and the report; numbers come from validationSummary.json, which the tests keep current. */
export interface AccuracyRow { what: string; result: string; src: string[] }

const pct = (a: number, b: number) => `${(((a / b) - 1) * 100).toFixed(1)}%`

export function accuracyRows(): AccuracyRow[] {
  const jm = Object.values(S.jmPersonnel)
  const jmN = jm.reduce((a, x) => a + x.n, 0)
  const jmExact = jm.reduce((a, x) => a + x.exact, 0)
  const jmWithin = jm.reduce((a, x) => a + x.within, 0)
  return [
    { what: 'Bare steel pipe heat loss vs ASHRAE Fundamentals Table 17', result: `${S.ashraeBare.n} cells: median ${S.ashraeBare.medianPct}%, max ${S.ashraeBare.maxPct}%`, src: ['V10'] },
    { what: 'NIA energy calculator (3" bare, 350°F, 8 mph)', result: `${S.niaEnergy.engine} vs ${S.niaEnergy.published} Btu/h·ft (${pct(S.niaEnergy.engine, S.niaEnergy.published)})`, src: ['V19'] },
    { what: 'NIA condensation calculator (4" bare, 40°F)', result: `${S.niaCondensation.engine} vs ${S.niaCondensation.published} Btu/h·ft; dew point ${S.dewPoint.engine} vs ${S.dewPoint.published}°F`, src: ['V19'] },
    { what: '3E Plus sample printout (4" bare, 850°F)', result: `${S.e3plusSample.engine.toLocaleString('en-US')} vs ${S.e3plusSample.published.toLocaleString('en-US')} Btu/h·ft (${pct(S.e3plusSample.engine, S.e3plusSample.published)})`, src: ['V16'] },
    { what: 'Owens Corning 3E Plus condensation-control table', result: `${S.ocCondensation.exact}/${S.ocCondensation.n} thicknesses exact, ${S.ocCondensation.within}/${S.ocCondensation.n} within ½"`, src: ['V1'] },
    { what: 'JM 3E Plus personnel-protection tables (3 products, wind, ε 0.30)', result: `${jmExact}/${jmN} exact, ${jmWithin}/${jmN} within ½"`, src: ['V4'] },
    { what: 'ASHRAE Refrigeration thickness tables (condensation or 8 Btu/h·ft²)', result: `${S.ashraeRefrigeration.exact}/${S.ashraeRefrigeration.n} exact, ${S.ashraeRefrigeration.within}/${S.ashraeRefrigeration.n} within ½"`, src: ['V11'] },
    { what: 'DOE valve-cover savings (pad k and emittance not published)', result: `${S.doeValve.n} cells: median +${S.doeValve.medianPct}%, worst ${S.doeValve.worstPct}%`, src: ['F1'] },
    { what: 'Duct faces: DNV C680 flat-surface tables (vertical, top, bottom; 0–2 mph)', result: `${S.dnvFlat.n}/${S.dnvFlat.n} rows within ${S.dnvFlat.maxPct}% (bare surface ε 0.8, back-solved; DNV does not print it)`, src: ['U1'] },
    { what: '3E Plus Example 5 (cold vertical surface, 10 mph)', result: `bare ${S.e3plusEx5.bare} vs ${S.e3plusEx5.published} Btu/h·ft²; insulated rows within ${S.e3plusEx5.insulatedWorstBtuHrFt2}`, src: ['U15'] },
    { what: 'JM Micro-Lok HP tables (older 3E Plus, k-curve not stated) — informational', result: `insulated loss median ${S.jmHeatTables.insulatedMedianPct}% off, surface ${S.jmHeatTables.surfaceMedianF}°F`, src: ['V3'] },
  ]
}
