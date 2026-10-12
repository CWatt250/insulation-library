import { INSULATION, JACKETS } from '../data/catalog'
import { PIPE_LABEL } from '../data/pipe'
import { PIPE_SRC, pipeLabel, pipeSpec } from '../data/pipes'
import { DUCT_LOCATIONS, DUCT_TYPES, ductCover, ductProduct, installedIn, isWrap } from './duct'
import { physicsMode } from './model'
import { ductCode } from './design'
import { materialLabel } from './system'
import { PIPE_PROPS, PIPE_LIMITS } from '../data/pipeWalls'
import { SPECS } from '../data/specs'
import { codeMinimum } from './code'
import { annualCost, money, runBasis } from './cost'
import { dewZone, type Design } from './design'
import { fittingResult } from './fittings'
import { productFor, systemFor, type Evaluation, type Recommendation } from './model'
import { CALC_REFS, METHOD_REFS, VALIDATION_REFS } from './sources'
import type { SimMode, SimState } from './types'
import { fmt, inchLabel, type UnitSystem } from './units'
import { vaporCheck } from './vapor'
import { accuracyRows } from './accuracy'

/**
 * A self-contained HTML report of the current simulation: opens in any browser,
 * prints to PDF, and carries every number's assumptions and sources.
 */
export interface ReportInput {
  mode: SimMode
  s: SimState
  ev: Evaluation
  design: Design
  others: { label: string; rec: Recommendation }[]
  units: UnitSystem
  /** PNG data URLs of the 3D view(s). */
  images: string[]
  preparedFor: string
  project: string
  appUrl: string
  /** Who the report is from (company or estimator). */
  preparedBy?: string
  /** From the Recommend tab: the answer, what it was based on, notes and alternatives, shown first. */
  recommendation?: {
    answer: string
    basis: string
    inputs: string
    notes: { text: string; src: string[] }[]
    alternatives: { label: string; thickness: string }[]
  }
}

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const TITLE: Record<SimMode, string> = { hot: 'Hot pipe', cold: 'Cold pipe', condensate: 'Condensate line', duct: 'Ductwork' }
const FACE: Record<string, string> = { top: 'Top', side: 'Sides', bottom: 'Underside', round: 'Surface' }
const COMPONENT: Record<string, string> = { straight: 'Straight run', elbow: '90° elbow', tee: 'Tee', valve: 'Valve', flange: 'Flange pair' }

/** The Watt Systems product mark (public/favicon.svg), inline so the saved report carries it. */
const WS_MARK = '<svg width="20" height="20" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" rx="22" fill="#fff"/><rect x="10" y="10" width="80" height="80" rx="14" fill="#0F2340"/><circle cx="50" cy="50" r="29" fill="#E6EBF0"/><circle cx="50" cy="50" r="25.5" fill="#F2B52A"/><circle cx="50" cy="50" r="12" fill="#E6EBF0"/><circle cx="50" cy="50" r="9" fill="#0F2340"/><path transform="translate(47.2 41) scale(0.7)" d="M 6.2 0 L -3.6 12.6 L 1.6 12.6 L -0.8 25 L 9 12.4 L 3.8 12.4 Z" fill="#F97316" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>'

export function buildReport(r: ReportInput): string {
  const { s, ev, units } = r
  // ductwork reports run the physics by which way heat flows
  const mode = physicsMode(s, r.mode)
  const T = (f: number) => fmt.temp(f, units)
  const Q = (b: number) => `${fmt.flow(Math.abs(b), units)} ${fmt.flowUnit(units)}`
  const ins = ev.ins
  const m = ins.moisture
  const sys = systemFor(s, mode)
  const duct = s.system === 'duct'
  const product = duct ? ductProduct(s.ductIns, s.ductFacing, s.ductShape) : productFor(s)
  const p = pipeSpec(s.pipe, s.npsIndex)
  const ductSize = s.ductShape === 'round' ? `${s.ductD}" round` : `${s.ductW}" × ${s.ductH}"`
  const dc = ductCode(s)
  const finish = sys.jacketId !== 'none' ? JACKETS[sys.jacketId].label : sys.facing === 'asj' ? 'ASJ facing' : 'No jacket'
  const cost = annualCost(s, mode, ev)
  const fit = duct ? null : fittingResult(s, ev)
  const vap = vaporCheck(s, mode, ins)
  const code = codeMinimum(s, mode)
  const zone = mode !== 'hot' ? dewZone(ins) : null
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  const row = (k: string, v: string, sub = '') => `<tr><th>${esc(k)}</th><td>${v}${sub ? `<small>${sub}</small>` : ''}</td></tr>`
  const statusWord = mode === 'hot'
    ? (ins.result.surfaceF <= s.ppF ? 'Safe-touch limit met' : 'Above safe-touch limit')
    : ({ dry: 'Dry', borderline: mode === 'cold' ? 'At risk' : 'Borderline', sweating: 'Sweating', dripping: mode === 'cold' ? 'Sweating' : 'Dripping risk' })[ins.status]

  const headline = mode === 'hot'
    ? [[`${Math.round(ev.reductionPct)}%`, 'less heat loss'], [T(ins.result.surfaceF), 'outer surface'], [cost ? money(cost.saved) : Q(ev.bare.result.qBtuHrFt - ins.result.qBtuHrFt), cost ? 'saved per year' : 'less loss per foot']]
    : [[statusWord, 'condensation status'], [`${fmt.tempDelta(m.marginF, units, 1)}`, 'margin to dew point'], [`${Math.round(ev.reductionPct)}%`, 'less heat gain']]

  // sources actually used
  const used = new Set<string>([...METHOD_REFS, ...VALIDATION_REFS, ...accuracyRows().flatMap((a) => a.src), ...ins.surface.src, ...(ins.surface.limitSrc ?? []), ...ev.bare.surface.src])
  r.design.rows.forEach((x) => x.c.src.forEach((id) => used.add(id)))
  if (duct) [...product.sources, ...dc.src, 'U1', 'U9', 'U14', s.insideFilm ? 'U9' : 'U15', ...(isWrap(s.ductIns) ? ['C6'] : [])].forEach((id) => used.add(id))
  else PIPE_SRC[s.pipe].forEach((id) => used.add(id))
  if (fit && 'eq' in fit) fit.eq.src.forEach((id) => used.add(id))
  if (vap) [...vap.requiredSrc, ...(vap.retarder.materialSrc ? [] : vap.retarder.src)].forEach((id) => used.add(id))
  if ('minIn' in code) code.src.forEach((id) => used.add(id))
  const refs = [...used].map((id) => CALC_REFS[id]).filter(Boolean)
  const matSources = duct ? [] : SPECS[s.insulation].sources.filter((x) => product.sources.includes(x.id) || (vap?.retarder.materialSrc && vap.retarder.src.includes(x.id)))

  const images = r.images.length
    ? `<div class="shots n${r.images.length}">${r.images.map((src) => `<img src="${src}" alt="3D view">`).join('')}</div>`
    : ''

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(TITLE[mode])} insulation assessment${r.project ? ` — ${esc(r.project)}` : ''}</title>
<style>
  :root { --ink:#16181b; --ink2:#4a4f57; --ink3:#7b808a; --line:#e3e5e8; --acc:${mode === 'hot' ? '#e8661c' : mode === 'cold' ? '#2f86d6' : '#0f9488'}; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 13px/1.5 Inter, system-ui, -apple-system, Segoe UI, sans-serif; color: var(--ink); background: #fff; }
  main { max-width: 860px; margin: 0 auto; padding: 32px 28px 48px; }
  header { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; border-bottom: 3px solid var(--acc); padding-bottom: 14px; }
  h1 { margin: 0; font-size: 24px; letter-spacing: -0.01em; }
  .meta { color: var(--ink2); font-size: 12px; text-align: right; }
  .tag { display: inline-block; margin-top: 6px; padding: 2px 8px; border-radius: 99px; background: #fff4d6; color: #8a5a00; font-size: 11px; font-weight: 600; }
  .shots { display: grid; gap: 6px; margin: 18px 0 6px; }
  .shots.n2 { grid-template-columns: 1fr 1fr; } .shots.n3 { grid-template-columns: 1fr 1fr 1fr; }
  .shots img { width: 100%; border-radius: 10px; display: block; background: #2b2c30; }
  .big { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 18px 0; }
  .big div { border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; border-top: 3px solid var(--acc); }
  .big b { display: block; font-size: 26px; letter-spacing: -0.02em; }
  .big span { color: var(--ink3); font-size: 12px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink3); margin: 26px 0 8px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 6px 8px 6px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { width: 40%; color: var(--ink2); font-weight: 600; }
  td small { display: block; color: var(--ink3); font-size: 11px; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 0 24px; }
  ul { margin: 0; padding-left: 18px; color: var(--ink2); }
  li { margin: 3px 0; }
  .src li { font-size: 11.5px; }
  .src a { color: var(--ink2); word-break: break-word; }
  .note { color: var(--ink2); }
  .rec .rec-answer { display: flex; flex-direction: column; gap: 2px; padding: 14px 16px; border-radius: 12px; border: 2px solid var(--acc); margin-bottom: 8px; }
  .rec .rec-answer b { font-size: 28px; letter-spacing: -0.02em; }
  .rec .rec-answer span { color: var(--ink2); }
  .rec ul { margin-top: 8px; }
  .rec small { color: var(--ink3); }
  .alts { margin-top: 10px; }
  @media (max-width: 640px) { header { flex-direction: column; align-items: flex-start; } .meta { text-align: left; } .big, .two { grid-template-columns: 1fr; } }
  footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid var(--line); color: var(--ink3); font-size: 11px; }
  .ws { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 650; color: #333; margin-bottom: 6px; }
  .ws span { color: #777; font-weight: 550; }
  @media print { main { padding: 0; } .shots img { break-inside: avoid; } h2 { break-after: avoid; } @page { margin: 14mm; } }
</style></head>
<body><main>
<header>
  <div>
    <div class="ws">${WS_MARK} Insulation Library <span>by Watt Systems</span></div>
    <h1>${esc(duct ? 'Ductwork' : TITLE[mode])} insulation assessment</h1>
    <div class="note">${duct ? `${esc(ductSize)} galvanized duct · ${esc(materialLabel(s))} ${esc(inchLabel(s.thicknessIn))}` : `${esc(COMPONENT[s.component])} · ${esc(pipeLabel(s.pipe, p))}${s.pipe === 'copper' ? '' : ` ${esc(PIPE_LABEL[s.pipe].toLowerCase())}`} · ${esc(INSULATION[s.insulation].label)} ${esc(inchLabel(s.thicknessIn))}`}</div>
    <span class="tag">Preliminary estimate — educational tool</span>
  </div>
  <div class="meta">${r.preparedBy ? `Prepared by <b>${esc(r.preparedBy)}</b><br>` : ''}${r.preparedFor ? `Prepared for <b>${esc(r.preparedFor)}</b><br>` : ''}${r.project ? `${esc(r.project)}<br>` : ''}${esc(date)}</div>
</header>
${r.recommendation ? `<section class="rec">
  <h2>Recommendation</h2>
  <div class="rec-answer"><b>${esc(r.recommendation.answer)}</b><span>${esc(r.recommendation.basis)}</span></div>
  <p class="note">${esc(r.recommendation.inputs)}</p>
  ${r.recommendation.notes.length ? `<ul>${r.recommendation.notes.map((n) => `<li>${esc(n.text)}${n.src.length ? ` <small>[${esc(n.src.join(', '))}]</small>` : ''}</li>`).join('')}</ul>` : ''}
  ${r.recommendation.alternatives.length ? `<table class="alts"><tbody>${r.recommendation.alternatives.map((a) => `<tr><th>${esc(a.label)}</th><td>${esc(a.thickness)}</td></tr>`).join('')}</tbody></table><p class="note">Other insulations, each at its own design thickness for the same conditions.</p>` : ''}
</section>` : ''}
${images}
<div class="big">${headline.map(([v, l]) => `<div><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>

<div class="two">
<section>
<h2>System</h2>
<table>
${duct ? row('Duct', esc(`${DUCT_TYPES.find((t) => t.id === s.ductType)!.label}, ${ductSize} galvanized, horizontal`), esc(`${DUCT_LOCATIONS.find((l) => l.id === s.ductLocation)!.label} · climate zone ${s.climateZone}`)) : row('Pipe', esc(s.pipe === 'copper' ? `Copper tube, ${p.nps}" nominal, ${p.od}" OD` : `${PIPE_LABEL[s.pipe]}, ${pipeLabel(s.pipe, p)}, ${p.od}" OD`), PIPE_LIMITS[s.pipe] && s.processF > PIPE_LIMITS[s.pipe]!.maxF ? esc(`Above the ${PIPE_LIMITS[s.pipe]!.maxF}°F rating published for ${PIPE_LIMITS[s.pipe]!.label}`) : undefined)}
${row(duct ? 'Air in the duct' : mode === 'hot' ? 'Process temperature' : 'Pipe / fluid temperature', esc(T(s.processF)), duct && s.insideFilm ? esc(`inside air film at ${s.airFpm} fpm`) : '')}
${row('Ambient air', esc(`${T(s.ambientF)}${mode !== 'hot' ? `, ${s.rh}% RH` : ''}${s.windMph ? `, ${s.windMph} mph wind` : ', still air'}`))}
${duct
    ? row('Insulation', esc(`${materialLabel(s)}, ${inchLabel(s.thicknessIn)}${isWrap(s.ductIns) ? ` nominal (${inchLabel(installedIn(s.ductIns, s.thicknessIn))} installed)` : ''}`), esc(`installed R-${(ins.ratedR ?? 0).toFixed(1)} · ${product.name}`))
    : row('Insulation', esc(`${INSULATION[s.insulation].label}, ${inchLabel(s.thicknessIn)}`), esc(`k from ${product.name}${ins.geo ? ` · OD ${ins.geo.insOdIn.toFixed(2)}" (${ins.geo.c585 ? 'ASTM C585' : 'pipe OD + 2t'})` : ''}`))}
${row('Finish', esc(duct ? ins.surface.label : finish), esc(`emittance ${(s.emittanceOverride ?? ins.surface.value).toFixed(2)}`))}
${!duct && s.component !== 'straight' ? row('Component', esc(COMPONENT[s.component] + (s.component === 'valve' || s.component === 'flange' ? (s.fittingCover === 'none' ? ', left bare' : ', removable blanket') : ''))) : ''}
</table>
</section>
<section>
<h2>Results</h2>
<table>
${row(`Heat ${mode === 'hot' ? 'loss' : 'gain'}, bare`, esc(Q(ev.bare.result.qBtuHrFt)))}
${row(`Heat ${mode === 'hot' ? 'loss' : 'gain'}, insulated`, esc(Q(ins.result.qBtuHrFt)), esc(`${Math.round(ev.reductionPct)}% reduction`))}
${row('Outer surface', esc(T(ins.result.surfaceF)), mode === 'hot' ? esc(`safe-touch limit ${T(s.ppF)}`) : '')}
${ins.result.faces && ins.result.faces.length > 1 ? row('Each face', esc(ins.result.faces.map((f) => `${FACE[f.face]} ${T(f.surfaceF)}`).join(' · ')), esc(mode === 'hot' ? 'the underside runs hottest' : 'the top runs coldest')) : ''}
${mode !== 'hot' ? row('Dew point', esc(T(m.dewF)), esc(`margin ${fmt.tempDelta(m.marginF, units, 1)} · ${statusWord}`)) : ''}
${mode !== 'hot' && m.condensing ? row('Condensation', esc(`≈ ${(m.ozPerDayPerFt * 10).toFixed(1)} fl oz per day per 10 ft`)) : ''}
${zone && zone.fraction > 0 && zone.fraction < 1 ? row('Dew-point zone', esc(`inner ${zone.depthIn.toFixed(2)}" (${Math.round(zone.fraction * 100)}%) of the insulation is below the dew point`)) : ''}
${ev.annual ? row('Annual energy saved', esc(fmt.energy(ev.annual.saved, units)), esc(`vs. bare, ${runBasis(s)}`)) : ''}
${cost ? row('Energy cost saved', esc(`${money(cost.saved)} per year · ${money(cost.saved / 12)} per month`), esc(`vs. bare: ${money(cost.bare)} → ${money(cost.ins)} a year · ${cost.basis}${cost.paybackYr !== null ? ` · payback ${cost.paybackYr.toFixed(1)} yr` : ''}`)) : ''}
</table>
</section>
</div>

<h2>Thickness design</h2>
<table>
${r.design.rows.map((x) => row(x.c.label, esc(x.rec.thicknessIn === null ? `more than ${inchLabel(x.rec.maxIn)}` : inchLabel(x.rec.thicknessIn)), esc(x.c.src.join(', ')))).join('')}
${row('Design thickness', `<b>${esc(r.design.thicknessIn === null ? 'not achievable with this material' : inchLabel(r.design.thicknessIn))}</b>`, esc(r.design.governing ? `governed by ${r.design.governing.label.split(':')[0].toLowerCase()}${r.design.exactIn ? ` · calculated minimum ≈ ${r.design.exactIn.toFixed(2)}"` : ''}` : ''))}
${duct ? row(`${s.ductCodeBasis === 'iecc' ? 'IECC 2021 / 2024' : 'ASHRAE 90.1-2019'} minimum`, esc(dc.R === null ? 'none required' : `installed R-${dc.R}`), esc(`${dc.label}${dc.derived ? ' (derived from definitions)' : ''}${dc.R !== null ? ' · included in the design' : ''}`)) : ''}
${!duct && 'minIn' in code ? row(`${code.edition} minimum`, esc(`${code.minIn.toFixed(2)}"`), esc(`${code.table}, ${code.row}: ${code.tableIn}" in the table${code.corrected ? `, corrected for k ${code.K.toFixed(3)}` : ''}${s.applyCode ? ' · included' : ' · shown for reference'}`)) : ''}
${r.others.map((o) => row(o.label, esc(o.rec.thicknessIn === null ? `more than ${inchLabel(o.rec.maxIn)}` : inchLabel(o.rec.thicknessIn)))).join('')}
</table>

${fit && 'eq' in fit ? `<h2>${esc(COMPONENT[s.component])}</h2><table>
${row('Equivalent length', esc(`${fit.eq.ft.toFixed(2)} ft of ${pipeLabel(s.pipe, p)} pipe`), esc(fit.eq.basis))}
${row(`Bare ${COMPONENT[s.component].toLowerCase()}`, esc(`${Math.round(fit.bare).toLocaleString('en-US')} Btu/hr`))}
${row('Insulated / covered', esc(`${Math.round(fit.covered).toLocaleString('en-US')} Btu/hr`), 'same equivalent length on the insulated pipe (Illinois TRM / Hart method) — an estimate')}
${row('Saved by insulating it', esc(`${Math.round(fit.savedBtuHr).toLocaleString('en-US')} Btu/hr`))}
</table>` : ''}

${vap ? `<h2>Vapor retarder</h2><table>
${row('Guidance', esc(`≤ ${vap.required} perm`), esc(vap.requiredNote))}
${row('This system', esc(vap.retarder.perm === null ? 'not published' : `${vap.retarder.upper ? '≤ ' : ''}${vap.retarder.perm.toFixed(4)} perm`), esc(`${vap.retarder.label}${vap.retarder.note ? ` — ${vap.retarder.note}` : ''}`))}
${vap.ozPerYearPer100ft !== null ? row('Vapor through it (sealed)', esc(`≈ ${vap.ozPerYearPer100ft.toFixed(1)} fl oz per year per 100 ft`)) : ''}
</table>${vap.notes.length ? `<ul>${vap.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}` : ''}

<h2>Assumptions</h2>
<ul>
${duct ? `<li>Steady state; long horizontal duct; duct wall at the air temperature${s.insideFilm ? ' plus an inside air film (ASHRAE simplified equation)' : ' (no inside film, as 3E Plus)'}.</li>
<li>${s.ductShape === 'rect' ? 'Each face solved as a flat slab with its own C680 flat-surface correlation (sides vertical, top and underside horizontal, stable/unstable swapped between warm and cold ducts); corners not modelled. Published duct methods apply one average to the perimeter; the face split is this tool\'s construction.' : 'Round duct solved as a horizontal cylinder.'}</li>
<li>${isWrap(s.ductIns) ? 'JM Microlite FSK duct wrap at its installed thickness, 75% of nominal (25% compression); JM prints k at 75°F only, so k vs temperature follows Knauf\'s published curve for the same density, scaled to JM\'s installed k at 75°F (this tool\'s assumption).' : `${s.ductIns === 'polyiso' ? 'JM XSPECT polyiso board at its labeled thickness, k 0.16 at 75°F held constant (the only value JM prints); code check on JM\'s printed aged R' : 'Rigid board at its labeled thickness, k as published'}${ductCover(s).jacket === 'alu' ? '; outdoors under an aluminum jacket' : ''}.`}</li>` : `<li>Steady state; long horizontal run; ${s.pipe === 'pvc' ? `PVC wall conduction included (k = ${PIPE_PROPS.pvc?.kIp} Btu·in/hr·ft²·°F, minimum wall); no inside film.` : 'pipe surface at the fluid temperature (no inside film; metal wall resistance neglected).'}</li>`}
<li>Insulation k varies with temperature (published k-vs-mean points, integrated through the layer); insulation dry, joints tight.</li>
${duct && s.ductShape === 'rect' ? '<li>Outer surfaces per the C680 flat-surface correlations; C680 air properties; radiation to surroundings at air temperature.</li>' : `<li>Outer surface per ASTM C680: Churchill–Chu natural convection${s.windMph ? ', blended with Churchill–Bernstein forced convection' : ''}; C680 air properties; radiation to surroundings at air temperature.</li>`}
<li>Jackets, facings and membranes add no insulation value; they set the surface emittance.</li>
${mode !== 'hot' ? `<li>Condensation control: surface ≥ dew point + ${esc(s.dewMarginF)}°F (3E Plus / NIA use 0.75°F). Dew point by the Magnus formula.</li>` : ''}
${cost ? '<li>Energy prices and efficiencies are user inputs.</li>' : ''}
</ul>

<h2>How accurate is this?</h2>
<table>
${accuracyRows().map((a) => row(a.what, esc(a.result), esc(a.src.join(', ')))).join('')}
</table>

<h2>Sources</h2>
<ul class="src">
${matSources.map((x) => `<li>${esc(x.label)} — <a href="${esc(x.url)}">${esc(x.url)}</a></li>`).join('')}
${refs.map((x) => `<li>${esc(x.publisher)} — ${esc(x.title)} — <a href="${esc(x.url)}">${esc(x.url)}</a> (retrieved ${esc(x.retrieved)})</li>`).join('')}
</ul>

<footer>Generated by Insulation Library by Watt Systems (${esc(r.appUrl)}) on ${esc(date)}. Created by Colton Watt. Educational / preliminary design tool: results follow ASTM C680 and are checked against published tables, but are not a substitute for 3E Plus or an engineer's review — confirm before specifying.</footer>
</main></body></html>`
}

/** Grab the visible 3D view(s) as PNG data URLs. */
export function snapshotCanvases(): string[] {
  const out: string[] = []
  document.querySelectorAll<HTMLCanvasElement>('.sim-stage canvas').forEach((c) => {
    try {
      // downscale to keep the report light (JPEG, ≤1400 px wide)
      const w = Math.min(1400, c.width)
      const h = Math.round((c.height * w) / c.width)
      const o = document.createElement('canvas')
      o.width = w
      o.height = h
      o.getContext('2d')!.drawImage(c, 0, 0, w, h)
      out.push(o.toDataURL('image/jpeg', 0.86))
    } catch {
      // a tainted or lost context: skip the picture, keep the report
    }
  })
  return out
}
