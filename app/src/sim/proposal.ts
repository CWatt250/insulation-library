import { JACKETS } from '../data/catalog'
import { pipeLabel, pipeSpec } from '../data/pipes'
import { annualCost, costSteps, money, paybackWords, perKwh, priceBasis, scheduleWords } from './cost'
import { DUCT_LOCATIONS, DUCT_TYPES } from './duct'
import { monthSpan } from './ductEnergy'
import { systemFor, type Evaluation } from './model'
import { savingsPlan, type SavingsPart } from './savings'
import { refsFor } from './sources'
import { materialLabel, noun } from './system'
import type { SimMode, SimState } from './types'
import { fmt, inchLabel, type UnitSystem } from './units'

/**
 * A one-page energy-savings proposal for a customer: what is insulated, what it saves a
 * year and a month, the payback, and how each number is figured — the Savings tab's own
 * numbers (sim/savings.ts), printed. Self-contained HTML that prints to PDF.
 */
export interface ProposalInput {
  mode: SimMode
  s: SimState
  ev: Evaluation
  units: UnitSystem
  preparedFor: string
  preparedBy?: string
  project: string
  appUrl: string
}

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const short = (t: string, n = 64) => (t.length > n ? `${t.slice(0, n).replace(/\s+\S*$/, '')}…` : t)
const months = (yr: number) => { const m = Math.max(1, Math.round(yr * 12)); return `${m} month${m === 1 ? '' : 's'}` }
const num = (v: number) => (v >= 100 ? Math.round(v).toLocaleString('en-US') : v.toLocaleString('en-US', { maximumFractionDigits: 1 }))
const WS_MARK = '<svg width="22" height="22" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" rx="22" fill="#fff"/><rect x="10" y="10" width="80" height="80" rx="14" fill="#0F2340"/><circle cx="50" cy="50" r="29" fill="#E6EBF0"/><circle cx="50" cy="50" r="25.5" fill="#F2B52A"/><circle cx="50" cy="50" r="12" fill="#E6EBF0"/><circle cx="50" cy="50" r="9" fill="#0F2340"/><path transform="translate(47.2 41) scale(0.7)" d="M 6.2 0 L -3.6 12.6 L 1.6 12.6 L -0.8 25 L 9 12.4 L 3.8 12.4 Z" fill="#F97316" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>'

/** One part's cost in a sentence: heat × LF × hours → energy bought → dollars. */
function partLine(s: SimState, p: SavingsPart, q: number, label: string): string {
  const st = costSteps(s, p.mode, q, p.hours)
  const heat = `${num(q)} Btu/hr per ft × ${num(s.lengthFt)} ft × ${num(p.hours)} h = ${num(st.btuYr / 1e6)} MMBtu`
  const buy = p.mode === 'cold'
    ? `÷ 12,000 Btu per ton-hour × ${s.kwPerTon.toFixed(2)} kW/ton = ${num(st.bought.amount)} kWh × $${s.coolPrice.toFixed(3)}`
    : perKwh(s.fuel)
      ? `÷ 3,412 Btu per kWh ÷ ${s.fuel === 'heatpump' ? `COP ${(s.efficiencyPct / 100).toFixed(1)}` : `${s.efficiencyPct}%`} = ${num(st.bought.amount)} kWh × $${s.fuelPrice.toFixed(3)}`
      : `÷ ${s.efficiencyPct}% = ${num(st.bought.amount)} MMBtu × $${s.fuelPrice.toFixed(2)}`
  return `<li><b>${esc(label)}:</b> ${esc(heat)} ${esc(buy)} = <b>${esc(money(st.cost))}</b> a year</li>`
}

export function buildProposal(r: ProposalInput): string {
  const { s, units } = r
  const mode = r.mode
  const duct = s.system === 'duct'
  const n = noun(s)
  const plan = savingsPlan(s, mode, r.ev)
  const c = annualCost(s, mode, r.ev)
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const sys = systemFor(s, mode)
  const what = duct
    ? `${s.ductShape === 'round' ? `${s.ductD}" round` : `${s.ductW}" × ${s.ductH}"`} ${DUCT_TYPES.find((t) => t.id === s.ductType)?.label.toLowerCase() ?? ''} duct`
    : s.pipe === 'copper' ? `${pipeLabel(s.pipe, pipeSpec(s.pipe, s.npsIndex))} tube` : `${pipeLabel(s.pipe, pipeSpec(s.pipe, s.npsIndex))} ${s.pipe === 'pvc' ? 'PVC' : 'steel'} pipe`
  const finish = duct ? '' : sys.jacketId !== 'none' ? ` with ${JACKETS[sys.jacketId].label.toLowerCase()} jacket` : sys.facing === 'asj' ? ' with ASJ facing' : ''
  const insulation = `${inchLabel(s.thicknessIn)} ${materialLabel(s).toLowerCase()}${finish}`
  const where = duct
    ? `${DUCT_LOCATIONS.find((l) => l.id === s.ductLocation)?.short ?? ''}, ${s.waCounty} County`
    : s.pipeOutdoors ? `Outdoors, ${s.waCounty} County` : `Indoors, ${fmt.temp(s.ambientF, units)} air`
  const installed = s.installedPerFt * s.lengthFt
  const parts = plan.kind === 'parts' ? plan.parts : []
  const hours = parts.reduce((a, p) => a + p.hours, 0)
  const runs = duct
    ? `${s.hoursPerDay === 24 && s.daysPerWeek === 7 ? '24/7' : `${s.hoursPerDay} h a day, ${s.daysPerWeek} days a week`} in ${parts.map((p) => monthSpan(p.season!.months)).join(' + ')} — ${num(hours)} h a year`
    : `${scheduleWords(s)}${s.pipeOutdoors && s.monthsPerYear < 12 ? ` (${monthSpan(parts[0].season!.months)})` : ''} — ${num(hours)} h a year`
  const prices = [...new Set(parts.map((p) => p.mode))].map((m) => priceBasis(s, m))
  const station = plan.kind === 'parts' ? plan.station : undefined
  const srcIds = [
    ...(parts.some((p) => p.mode === 'hot') ? (perKwh(s.fuel) ? ['P6', 'P5'] : s.fuel === 'gas' ? ['P1', 'P2', 'P5'] : []) : []),
    ...(parts.some((p) => p.mode === 'cold') ? ['P6', 'P7'] : []),
    ...(s.fuel === 'heatpump' && parts.some((p) => p.mode === 'hot') ? ['P8'] : []),
    ...(station ? ['N1', ...(duct ? ['N3', 'N4'] : [])] : []),
    'M1',
  ]
  const refs = refsFor([...new Set(srcIds)])

  const hero = c
    ? `<div class="big">
  <div><span>Saved per year</span><b>${esc(money(c.saved))}</b></div>
  <div><span>Saved per month</span><b>${esc(money(c.saved / 12))}</b></div>
  ${installed > 0
    ? `<div><span>Pays for itself in</span><b>${esc(c.paybackYr !== null ? paybackWords(c.paybackYr) : 'no payback')}</b><small>${esc(money(installed))} installed</small></div>`
    : `<div><span>Energy saved per year</span><b>${esc(fmt.energy(c.btuBare - c.btuIns, units))}</b></div>`}
</div>`
    : `<div class="none"><b>${esc(plan.kind === 'none' ? plan.title : 'No savings to show')}</b><p>${esc(plan.kind === 'none' ? plan.why : `Enter the length of ${n} and how long it runs.`)}</p></div>`

  const beforeAfter = c ? `<table class="ba"><thead><tr><th></th><th>Bare</th><th>Insulated</th></tr></thead><tbody>
${parts.filter((p) => p.qBare > 0).map((p) => `<tr><th>Heat ${p.word} per foot${p.title ? ` <small>${esc(p.title)}</small>` : ''}</th><td>${esc(fmt.flow(p.qBare, units))} ${esc(fmt.flowUnit(units))}</td><td>${esc(fmt.flow(p.qIns, units))} ${esc(fmt.flowUnit(units))}</td></tr>`).join('')}
<tr><th>Energy per year</th><td>${esc(fmt.energy(c.btuBare, units))}</td><td>${esc(fmt.energy(c.btuIns, units))}</td></tr>
<tr class="money"><th>Energy cost per year</th><td>${esc(money(c.bare))}</td><td>${esc(money(c.ins))}</td></tr>
</tbody></table>` : ''

  const math = c ? `<ul class="math">
${parts.filter((p) => p.qBare > 0).map((p) => {
    const pre = p.title ? `${p.title}, ` : ''
    const weather = p.season ? `<li class="w">${esc(p.title)}: ${esc(p.season.season === 'run' ? `outdoor normal ${fmt.temp(p.season.outdoorF, units)}${p.season.windMph ? `, wind ${p.season.windMph} mph` : ', still air'}` : `${p.season.rule} → ${fmt.temp(p.season.aroundF, units)} around the duct`)}</li>` : ''
    return weather + partLine(s, p, p.qBare, `${pre}bare`) + partLine(s, p, p.qIns, `${pre}insulated`)
  }).join('')}
<li><b>Savings:</b> ${esc(money(c.bare))} − ${esc(money(c.ins))} = <b>${esc(money(c.saved))}</b> a year; ÷ 12 = <b>${esc(money(c.saved / 12))}</b> a month</li>
${installed > 0 && c.paybackYr !== null ? `<li><b>Payback:</b> $${esc(s.installedPerFt.toFixed(2))} per LF × ${esc(num(s.lengthFt))} LF = ${esc(money(installed))}; ÷ ${esc(money(c.saved))} a year = <b>${esc(c.paybackYr.toFixed(2))} years (${esc(months(c.paybackYr))})</b></li>` : ''}
</ul>` : ''

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Energy savings proposal${r.project ? ` — ${esc(r.project)}` : ''}</title>
<style>
  :root { --ink:#14171c; --ink2:#454b55; --ink3:#7a808a; --line:#e2e5e9; --navy:#0F2340; --gold:#F2B52A; --orange:#F97316; --good:#0f7b4f; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 12px/1.4 Inter, system-ui, -apple-system, Segoe UI, sans-serif; color: var(--ink); background: #fff; }
  main { max-width: 800px; margin: 0 auto; padding: 28px 26px 32px; }
  header { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; padding-bottom: 12px; border-bottom: 3px solid var(--navy); }
  .ws { display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 700; color: var(--navy); }
  .ws span { color: var(--ink3); font-weight: 550; }
  h1 { margin: 6px 0 2px; font-size: 24px; letter-spacing: -0.015em; }
  .what { color: var(--ink2); font-size: 13px; }
  .meta { flex: none; text-align: right; color: var(--ink2); font-size: 11.5px; line-height: 1.6; white-space: nowrap; }
  .big { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 14px 0 4px; }
  .big div { padding: 9px 12px; border-radius: 12px; background: #f3f8f5; border: 1px solid #cfe6da; border-top: 4px solid var(--good); }
  .big span { display: block; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--ink3); font-weight: 650; }
  .big b { display: block; font-size: 24px; letter-spacing: -0.02em; color: var(--good); margin-top: 2px; }
  .big small { color: var(--ink3); font-size: 11px; }
  .none { margin: 16px 0; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--line); }
  .none p { margin: 4px 0 0; color: var(--ink2); }
  h2 { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.09em; color: var(--ink3); margin: 13px 0 5px; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0 22px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 3.5px 8px 3.5px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { color: var(--ink2); font-weight: 600; }
  .job th { width: 38%; }
  th small { display: block; color: var(--ink3); font-weight: 500; font-size: 10.5px; }
  .ba thead th { color: var(--ink3); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; }
  .ba td { font-variant-numeric: tabular-nums; }
  .ba .money td { font-weight: 700; }
  .ba .money td:last-child { color: var(--good); }
  ul { margin: 0; padding-left: 16px; color: var(--ink2); }
  li { margin: 3px 0; }
  .math li { font-size: 10.5px; margin: 2px 0; }
  .math li.w { list-style: none; margin-left: -16px; margin-top: 7px; color: var(--ink); font-weight: 600; font-size: 11px; }
  .notes li { font-size: 11px; }
  .src { columns: 2; column-gap: 22px; padding-left: 18px; margin: 0; }
  .src li { font-size: 9.5px; line-height: 1.35; margin: 0 0 3px; break-inside: avoid; color: var(--ink3); }
  .src a { color: var(--ink2); text-decoration: none; }
  footer { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--line); color: var(--ink3); font-size: 10.5px; display: flex; justify-content: space-between; gap: 12px; }
  @media (max-width: 640px) { header { flex-direction: column; align-items: flex-start; } .meta { text-align: left; } .big, .cols { grid-template-columns: 1fr; } }
  @media print { main { padding: 0; } @page { size: letter; margin: 12mm; } h2 { break-after: avoid; } }
</style></head>
<body><main>
<header>
  <div>
    <div class="ws">${WS_MARK} Watt Systems <span>· Insulation Library</span></div>
    <h1>Energy savings proposal</h1>
    <div class="what">Insulating ${esc(num(s.lengthFt))} LF of ${esc(what)} at ${esc(fmt.temp(s.processF, units))} with ${esc(insulation)}</div>
  </div>
  <div class="meta">${r.preparedFor ? `Prepared for <b>${esc(r.preparedFor)}</b><br>` : ''}${r.project ? `${esc(r.project)}<br>` : ''}${r.preparedBy ? `Prepared by <b>${esc(r.preparedBy)}</b><br>` : ''}${esc(date)}</div>
</header>
${hero}
<div class="cols">
  <section>
    <h2>The job</h2>
    <table class="job"><tbody>
      <tr><th>What</th><td>${esc(what)}, ${esc(fmt.temp(s.processF, units))} inside</td></tr>
      <tr><th>Length</th><td>${esc(num(s.lengthFt))} LF</td></tr>
      <tr><th>Where it runs</th><td>${esc(where)}</td></tr>
      <tr><th>How long it runs</th><td>${esc(runs)}</td></tr>
      <tr><th>Insulation</th><td>${esc(insulation)}</td></tr>
      ${installed > 0 ? `<tr><th>Installed cost</th><td>$${esc(s.installedPerFt.toFixed(2))} per LF × ${esc(num(s.lengthFt))} LF = ${esc(money(installed))}</td></tr>` : ''}
      <tr><th>Energy priced at</th><td>${prices.map(esc).join('<br>')}</td></tr>
      ${station ? `<tr><th>Weather</th><td>${esc(station.name)}, NOAA 1991–2020 normals</td></tr>` : ''}
    </tbody></table>
  </section>
  <section>
    <h2>Before and after</h2>
    ${beforeAfter}
    <h2>Keep in mind</h2>
    <ul class="notes">
      <li>Compared with a bare ${esc(n)}; if old insulation is already on it, the saving is smaller.</li>
      ${station ? '<li>Normal-year weather; a colder or hotter year changes it.</li>' : `<li>${esc(fmt.temp(s.processF, units))} inside for every hour it runs.</li>`}
      <li>Energy cost only — not maintenance, demand charges or carbon fees.${duct ? ' Duct leakage not counted.' : ' Straight pipe only — valves and fittings save more.'}</li>
    </ul>
  </section>
</div>
${math ? `<h2>How it’s figured</h2>${math}` : ''}
<h2>Sources</h2>
<ol class="src">${refs.map((x) => `<li><a href="${esc(x.url)}">${esc(short(x.title.replace(/ \(.*$/, '').replace(/ - .*$/, '')))}</a> — ${esc(x.publisher.replace(/ \(.*$/, '').replace(/,.*$/, ''))}</li>`).join('')}</ol>
<footer><span>Heat flow per foot by the ASTM C680 method. An estimate — actual savings depend on how the system runs and what energy costs.</span><span>Insulation Library by Watt Systems · Created by Colton Watt${r.appUrl ? ` · ${esc(r.appUrl.replace(/^https?:\/\//, ''))}` : ''}</span></footer>
</main></body></html>`
}
