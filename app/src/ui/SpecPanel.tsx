import { useState } from 'react'
import { SPECS, type KPoint, type MaterialSpec, type ProductSpec } from '../data/specs'
import { CARD } from '../data/card'
import { JACKET_SPECS, jacketSpecKey } from '../data/jackets'
import { INSULATION, JACKETS, type FacingId, type InsulationId, type OuterJacketId, type ServiceId } from '../data/catalog'
import { NPS } from '../data/pipe'
import { systemInfo } from '../geo/assembly'

// Validated categorical slots (dark surface): blue, orange.
const SERIES = ['#3987e5', '#d95926']

export interface SpecProps {
  id: InsulationId
  jacket: OuterJacketId
  facing: FacingId
  service: ServiceId
  thicknessIn: number
  npsIndex: number
}

function KChart({ spec }: { spec: MaterialSpec }) {
  const series = spec.products.filter((p) => p.k.length > 1)
  const [hover, setHover] = useState<{ s: number; p: KPoint } | null>(null)
  if (!series.length) return null
  const all = series.flatMap((p) => p.k)
  const xMin = Math.min(...all.map((p) => p.meanF))
  const xMax = Math.max(...all.map((p) => p.meanF))
  const yMax = Math.ceil(Math.max(...all.map((p) => p.k)) * 10) / 10
  const W = 300, H = 150, L = 34, R = 10, T = 10, B = 26
  const x = (v: number) => L + ((v - xMin) / (xMax - xMin || 1)) * (W - L - R)
  const y = (v: number) => T + (1 - v / yMax) * (H - T - B)
  const yTicks = Array.from({ length: Math.round(yMax / 0.1) + 1 }, (_, i) => i * 0.1).filter((_, i, a) => a.length <= 6 || i % 2 === 0)
  const xTicks = [xMin, Math.round((xMin + xMax) / 2 / 50) * 50, xMax]
  return (
    <figure className="kchart">
      <figcaption>k vs. mean temperature</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="k-value versus mean temperature">
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="grid" />
            <text x={L - 6} y={y(t) + 3} className="tick" textAnchor="end">{t.toFixed(1)}</text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} x={x(t)} y={H - 8} className="tick" textAnchor="middle">{t}°F</text>
        ))}
        {series.map((p, si) => (
          <g key={p.name}>
            <polyline
              points={p.k.map((pt) => `${x(pt.meanF)},${y(pt.k)}`).join(' ')}
              fill="none" stroke={SERIES[si]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
            />
            {p.k.map((pt) => (
              <g key={pt.meanF}>
                <circle cx={x(pt.meanF)} cy={y(pt.k)} r={4} fill={SERIES[si]} stroke="#18191b" strokeWidth={2} />
                <circle
                  cx={x(pt.meanF)} cy={y(pt.k)} r={10} fill="transparent"
                  onMouseEnter={() => setHover({ s: si, p: pt })} onMouseLeave={() => setHover(null)}
                />
              </g>
            ))}
          </g>
        ))}
        {hover && (
          <g pointerEvents="none" transform={`translate(${Math.min(x(hover.p.meanF) + 8, W - 112)},${Math.max(y(hover.p.k) - 34, 2)})`}>
            <rect width={104} height={30} rx={4} className="tip" />
            <text x={8} y={12} className="tip-t">{hover.p.meanF}°F mean</text>
            <text x={8} y={24} className="tip-v">k = {hover.p.k}</text>
          </g>
        )}
      </svg>
      {series.length > 1 && (
        <div className="legend">
          {series.map((p, si) => (
            <span key={p.name}><i style={{ background: SERIES[si] }} />{p.name}</span>
          ))}
        </div>
      )}
      <p className="unit">k in Btu·in/(hr·ft²·°F), per manufacturer data sheets</p>
    </figure>
  )
}

const fmtTemp = (v: number | null) => `${v === null ? '' : v.toLocaleString('en-US')}°F`
const fmtRange = (min: number | null, max: number | null) =>
  min === null && max === null ? 'Not published' : min === null ? `Up to ${fmtTemp(max)}` : max === null ? `From ${fmtTemp(min)}` : `${fmtTemp(min)} to ${fmtTemp(max)}`

/** Brand-level short name for a product row, e.g. "JM", "OC", "Armacell". */
const maker = (p: ProductSpec) => p.name.replace(/^(Owens Corning|Johns Manville|ROCKWOOL|Armacell|K-FLEX|Resolco|IIG).*$/, '$1')
  .replace('Owens Corning', 'OC').replace('Johns Manville', 'JM')

/** The headline k: the 75°F mean point where published, else the lowest published mean. */
function headlineK(spec: MaterialSpec) {
  for (const p of spec.products) {
    const at75 = p.k.find((k) => k.meanF === 75)
    if (at75) return { k: at75, product: p, note: '' }
  }
  const withK = spec.products.filter((p) => p.k.length)
  if (withK.length) {
    const p = withK[0]
    const k = [...p.k].sort((a, b) => Math.abs(a.meanF - 75) - Math.abs(b.meanF - 75))[0]
    return { k, product: p, note: 'No 75°F value published' }
  }
  return null
}

/** The material's own jacket note, plus the general jacket note on the selected row. */
const joinNotes = (on: boolean, material?: string, general?: string) =>
  on ? [material, general].filter(Boolean).join(' ') || undefined : material ?? general

export function SpecPanel(props: SpecProps) {
  const spec = SPECS[props.id]
  const [open, setOpen] = useState(true)
  if (!spec) return null
  return (
    <aside className={`panel specs ${open ? '' : 'collapsed'}`}>
      <header>
        <h2 className="title">{spec.name}</h2>
        <button className="collapse" onClick={() => setOpen(!open)} aria-label={open ? 'Hide specs' : 'Show specs'}>
          {open ? '–' : '+'}
        </button>
      </header>
      {open && <SpecContent {...props} />}
    </aside>
  )
}

/** The data card; used in the desktop side panel and the phone bottom sheet. */
export function SpecContent({ showTitle = false, ...p }: SpecProps & { showTitle?: boolean }) {
  const spec = SPECS[p.id]
  const card = CARD[p.id]
  const ins = INSULATION[p.id]
  if (!spec || !card) return null
  const sys = systemInfo({ component: 'straight', view: 'installed', insulation: p.id, jacket: p.jacket, facing: p.facing, service: p.service, npsIndex: p.npsIndex, thicknessIn: p.thicknessIn })
  const k = headlineK(spec)
  const sameTemp = spec.products.every((q) => q.tempF.min === spec.products[0].tempF.min && q.tempF.max === spec.products[0].tempF.max)
  const densities = spec.products.filter((q) => q.density)
  const compressive = spec.products.find((q) => q.compressive)
  const fire = spec.products[0]
  // jacket rows: the facing (when offered), then each outer jacket the material takes
  const rows: { key: string; name: string; on: boolean; limit: string; note?: string }[] = []
  if (ins.facings.includes('asj')) {
    const js = JACKET_SPECS.asj
    rows.push({ key: 'asj', name: 'ASJ facing', on: p.facing === 'asj', limit: js.limit, note: joinNotes(p.facing === 'asj', card.jacketNotes.asj, js.note) })
  }
  for (const j of ins.jackets) {
    const key = jacketSpecKey(j)
    const js = key ? JACKET_SPECS[key] : null
    const on = p.jacket === j
    rows.push({
      key: j,
      name: j === 'none' ? (ins.facings.includes('asj') ? 'No outer jacket' : 'None (bare)') : JACKETS[j].label,
      on,
      limit: js?.limit ?? '—',
      note: joinNotes(on, card.jacketNotes[j] ?? (j === 'alu-stucco' ? card.jacketNotes['alu-smooth'] : undefined), js?.note),
    })
  }
  return (
    <div className="scroll card">
      {showTitle && <h2 className="title spec-title">{spec.name}</h2>}
      <p className="astm">{spec.astm}</p>
      <p className="summary">{spec.summary}</p>

      <div className="selection">
        <span>Your selection</span>
        <strong>NPS {NPS[p.npsIndex].nps}" × {p.thicknessIn}" · {p.service === 'hot' ? 'hot service' : 'cold service'}</strong>
        <small>
          Insulation OD ≈ {+sys.insulationOdIn.toFixed(2)}" (pipe OD + 2 × wall)
          {(() => { const n = sys.rings.filter((r) => r.layer === 'insulation').length; return n > 1 ? ` · applied in ${n} layers` : '' })()}
        </small>
      </div>

      <dl className="facts">
        <dt>Service temp</dt>
        <dd>
          {sameTemp
            ? <>{fmtRange(spec.products[0].tempF.min, spec.products[0].tempF.max)} <small>{spec.products.map(maker).join(', ')}</small></>
            : spec.products.map((q) => <span key={q.name} className="line">{fmtRange(q.tempF.min, q.tempF.max)} <small>{maker(q)}</small></span>)}
        </dd>
        <dt>k-factor</dt>
        <dd>
          {k ? (
            <>
              <b>{k.k.k}</b> at {k.k.meanF}°F mean <small>Btu·in/hr·ft²·°F · {maker(k.product)}{k.note ? ` · ${k.note}` : ''}</small>
            </>
          ) : (
            <>{spec.products[0]?.kNote ?? 'Not published'}</>
          )}
        </dd>
        <dt>Density</dt>
        <dd>
          {densities.length
            ? densities.map((q) => <span key={q.name} className="line">{q.density} {densities.length > 1 || spec.products.length > 1 ? <small>{maker(q)}</small> : null}</span>)
            : 'Not published by sources reviewed'}
        </dd>
        {compressive && (<><dt>Compressive</dt><dd>{compressive.compressive}</dd></>)}
        <dt>Fire</dt>
        <dd>E84 {fire.e84}{fire.combustibility ? <small>{fire.combustibility}</small> : null}</dd>
      </dl>

      <h3>ASTM &amp; standards</h3>
      <ul className="standards">
        {card.standards.map((s) => (
          <li key={s.code}><b>{s.code}</b><span>{s.note}</span></li>
        ))}
      </ul>

      <h3>Moisture &amp; vapor</h3>
      <ul>{card.moisture.map((m) => <li key={m}>{m}</li>)}</ul>
      <p className={`callout-box ${p.service}`}>
        <b>{p.service === 'cold' ? 'Cold service: ' : 'Hot service: '}</b>
        {p.service === 'hot'
          ? 'no vapor retarder required.'
          : sys.vaporBy === 'integral' ? 'the closed-cell foam is the vapor retarder; glue every seam.'
          : sys.vaporBy === 'facing' && !sys.membrane ? 'the ASJ facing is the vapor retarder; seal every lap and butt strip, and no screws through it.'
          : 'a separate vapor retarder goes over the insulation (shown in the build-up); no screws through it.'}
      </p>

      <h3>Common applications</h3>
      <ul className="tags">{card.tags.map((t) => <li key={t}>{t}</li>)}</ul>

      <h3>Jacket compatibility &amp; limits</h3>
      <table className="jackets">
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={r.on ? 'on' : ''}>
              <th scope="row">{r.name}{r.on ? <i aria-label="selected"> ●</i> : null}</th>
              <td>
                <span>{r.limit}</span>
                {r.note && <small>{r.note}</small>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <KChart spec={spec} />

      <details>
        <summary>Product data ({spec.products.length})</summary>
        <div className="products">
          {spec.products.map((q) => (
            <div key={q.name} className="product">
              <h3>{q.name}</h3>
              <dl>
                <dt>Service temp</dt>
                <dd>{fmtRange(q.tempF.min, q.tempF.max)}{q.tempF.note ? <small>{q.tempF.note}</small> : null}</dd>
                {q.density && (<><dt>Density</dt><dd>{q.density}</dd></>)}
                {q.compressive && (<><dt>Compressive</dt><dd>{q.compressive}</dd></>)}
                {q.e84 && (<><dt>ASTM E84</dt><dd>{q.e84}</dd></>)}
                {q.vapor && (<><dt>Vapor</dt><dd>{q.vapor}</dd></>)}
                {q.combustibility && (<><dt>Combustibility</dt><dd>{q.combustibility}</dd></>)}
                {q.k.length === 1 && (<><dt>k-value</dt><dd>{q.k[0].k} @ {q.k[0].meanF}°F mean</dd></>)}
                {q.kNote && (<><dt>k note</dt><dd>{q.kNote}</dd></>)}
              </dl>
            </div>
          ))}
        </div>
      </details>
      <details>
        <summary>Strengths &amp; watch-outs</summary>
        <div className="proscons">
          <div>
            <h3>Strengths</h3>
            <ul>{spec.pros.map((a) => <li key={a}>{a}</li>)}</ul>
          </div>
          <div>
            <h3>Watch-outs</h3>
            <ul>{spec.cons.map((a) => <li key={a}>{a}</li>)}</ul>
          </div>
        </div>
        <h3>All applications</h3>
        <ul>{spec.applications.map((a) => <li key={a}>{a}</li>)}</ul>
        <h3>Sizes</h3>
        <p className="small">{spec.sizes}</p>
      </details>
      {spec.gaps.length > 0 && (
        <details>
          <summary>Data notes ({spec.gaps.length})</summary>
          <ul className="small">{spec.gaps.map((g) => <li key={g}>{g}</li>)}</ul>
        </details>
      )}
      <details>
        <summary>Sources ({spec.sources.length + JACKET_SPECS.sources.length})</summary>
        <ol className="small sources">
          {spec.sources.map((s) => (
            <li key={s.id}><a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></li>
          ))}
          {JACKET_SPECS.sources.map((s) => (
            <li key={`j-${s.id}`}><a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></li>
          ))}
        </ol>
      </details>
      <p className="disclaimer">Typical published values. Always confirm against the current manufacturer data sheet and project specification.</p>
    </div>
  )
}
