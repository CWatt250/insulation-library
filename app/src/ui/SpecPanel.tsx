import { useState } from 'react'
import { SPECS, type KPoint, type MaterialSpec } from '../data/specs'
import type { InsulationId } from '../data/catalog'

// Validated categorical slots (dark surface): blue, orange.
const SERIES = ['#3987e5', '#d95926']

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
      <figcaption>Thermal conductivity vs. mean temperature</figcaption>
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

const fmtTemp = (v: number | null) => `${v}°F`
const fmtRange = (min: number | null, max: number | null) =>
  min === null && max === null ? 'Not published' : min === null ? `Up to ${fmtTemp(max)}` : max === null ? `From ${fmtTemp(min)}` : `${fmtTemp(min)} to ${fmtTemp(max)}`

export function SpecPanel({ id }: { id: InsulationId }) {
  const spec = SPECS[id]
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
      {open && (
        <div className="scroll">
          <p className="astm">{spec.astm}</p>
          <p className="summary">{spec.summary}</p>

          <div className="products">
            {spec.products.map((p) => (
              <div key={p.name} className="product">
                <h3>{p.name}</h3>
                <dl>
                  <dt>Service temp</dt>
                  <dd>{fmtRange(p.tempF.min, p.tempF.max)}{p.tempF.note ? <small>{p.tempF.note}</small> : null}</dd>
                  {p.density && (<><dt>Density</dt><dd>{p.density}</dd></>)}
                  {p.compressive && (<><dt>Compressive</dt><dd>{p.compressive}</dd></>)}
                  {p.e84 && (<><dt>ASTM E84</dt><dd>{p.e84}</dd></>)}
                  {p.vapor && (<><dt>Vapor</dt><dd>{p.vapor}</dd></>)}
                  {p.combustibility && (<><dt>Combustibility</dt><dd>{p.combustibility}</dd></>)}
                  {p.k.length === 1 && (<><dt>k-value</dt><dd>{p.k[0].k} @ {p.k[0].meanF}°F mean</dd></>)}
                  {p.kNote && (<><dt>k note</dt><dd>{p.kNote}</dd></>)}
                </dl>
              </div>
            ))}
          </div>

          <KChart spec={spec} />

          <h3>Typical applications</h3>
          <ul>{spec.applications.map((a) => <li key={a}>{a}</li>)}</ul>
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
          <h3>Sizes</h3>
          <p className="small">{spec.sizes}</p>

          {spec.gaps.length > 0 && (
            <details>
              <summary>Data notes ({spec.gaps.length})</summary>
              <ul className="small">{spec.gaps.map((g) => <li key={g}>{g}</li>)}</ul>
            </details>
          )}
          <details>
            <summary>Sources ({spec.sources.length})</summary>
            <ol className="small sources">
              {spec.sources.map((s) => (
                <li key={s.id}><a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></li>
              ))}
            </ol>
          </details>
          <p className="disclaimer">Typical published values. Always confirm against the current manufacturer data sheet and project specification.</p>
        </div>
      )}
    </aside>
  )
}
