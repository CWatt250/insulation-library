import { useMemo, type ReactNode } from 'react'
import type { Evaluation, Recommendation } from '../../sim/model'
import { dewZone, materialOptions, type Design } from '../../sim/design'
import { codeMinimum, PIPE_CODES, type PipeCodeBasis } from '../../sim/code'
import { vaporCheck } from '../../sim/vapor'
import { fittingResult } from '../../sim/fittings'
import { annualCost, money } from '../../sim/cost'
import { SPECS } from '../../data/specs'
import { pipeLabel, pipeSpec } from '../../data/pipes'
import { refsFor } from '../../sim/sources'
import { DRIP_RATE } from '../../sim/model'
import type { SimMode, SimState } from '../../sim/types'
import { currentMaterial, noun, type MaterialId } from '../../sim/system'
import { ductCode } from '../../sim/design'
import { DUCT_CODES, DUCT_LOCATIONS, DUCT_TYPES } from '../../sim/duct'
import type { DuctFaceResult } from '../../sim/duct'
import { fmt, inchLabel, type UnitSystem } from '../../sim/units'
import { DUCT_LEARN, INTRO, LEARN, TOPICS } from '../../sim/learn'
import { Disclosure, Icon } from '../controls'
import { CodeChips } from './CodeChips'
import { SafetyChip, StatusChip, STATUS_TONE } from './Status'
import { ACCENT } from './SetupPanel'
import { Assumptions } from './Assumptions'

export interface Recs {
  /** Design thickness: every requirement solved, the largest governs. */
  primary: Design
  others: { label: string; rec: Recommendation }[]
}

function Card({ label, value, unit, sub, tone, wide }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode; tone?: 'good' | 'warn' | 'bad'; wide?: boolean }) {
  return (
    <div className={`rcard ${tone ?? ''} ${wide ? 'wide' : ''}`}>
      <span className="rcard-label">{label}</span>
      <span className="rcard-value">{value}{unit && <small>{unit}</small>}</span>
      {sub && <span className="rcard-sub">{sub}</span>}
    </div>
  )
}

/** Two bars, bare vs insulated, on one scale. */
function FlowBars({ ev, units }: { ev: Evaluation; units: UnitSystem }) {
  const b = Math.abs(ev.bare.result.qBtuHrFt)
  const i = Math.abs(ev.ins.result.qBtuHrFt)
  const max = Math.max(b, i, 1e-6)
  const word = ev.mode === 'hot' ? 'Heat loss' : 'Heat gain'
  return (
    <div className="flowbars" role="img" aria-label={`${word}: bare ${fmt.flow(b, units)}, insulated ${fmt.flow(i, units)} ${fmt.flowUnit(units)}`}>
      <div className="fb-row">
        <span>Bare</span>
        <div className="fb-track"><i className="bare" style={{ width: `${(b / max) * 100}%` }} /></div>
        <b>{fmt.flow(b, units)}</b>
      </div>
      <div className="fb-row">
        <span>Insulated</span>
        <div className="fb-track"><i className="ins" style={{ width: `${Math.max((i / max) * 100, 0.8)}%` }} /></div>
        <b>{fmt.flow(i, units)}</b>
      </div>
      <p className="fb-unit">{word}, {fmt.flowUnit(units)}</p>
    </div>
  )
}

function RecRow({ label, rec, current, onApply, units }: { label: string; rec: Recommendation; current: number; onApply: (t: number) => void; units: UnitSystem }) {
  const t = rec.thicknessIn
  return (
    <div className="rec-row">
      <div className="rec-text">
        <span>{label}</span>
        {t === null ? (
          <strong className="bad">More than {inchLabel(rec.maxIn)} — beyond this material's range</strong>
        ) : (
          <strong>
            {inchLabel(t)}
            {rec.side && <small> → surface {fmt.temp(rec.side.result.surfaceF, units)}, {fmt.flow(Math.abs(rec.side.result.qBtuHrFt), units)} {fmt.flowUnit(units)}</small>}
          </strong>
        )}
      </div>
      {t !== null && (
        <button className="apply" disabled={t === current} onClick={() => onApply(t)}>
          {t === current ? 'Current' : 'Apply'}
        </button>
      )}
    </div>
  )
}

function explain(ev: Evaluation, s: SimState, units: UnitSystem): string {
  const ins = ev.ins
  const m = ins.moisture
  const T = (f: number) => fmt.temp(f, units)
  if (ev.mode === 'hot') {
    const safe = ins.result.surfaceF <= s.ppF
    return `The bare ${noun(s)} would give off ${fmt.flow(ev.bare.result.qBtuHrFt, units)} ${fmt.flowUnit(units)}. With ${inchLabel(s.thicknessIn)} of insulation that drops to ${fmt.flow(ins.result.qBtuHrFt, units)} — ${Math.round(ev.reductionPct)}% less — and the outside surface sits at ${T(ins.result.surfaceF)}, ${safe ? 'within' : 'above'} the ${T(s.ppF)} safe-touch limit.`
  }
  const bareM = ev.bare.moisture
  const lead = bareM.condensing
    ? `A bare ${noun(s)} ${s.system === 'duct' ? 'carrying' : 'at'} ${T(s.processF)}${s.system === 'duct' ? ' air' : ''} would sit ${fmt.tempDelta(-bareM.marginF, units).replace('+', '')} below the room's ${T(m.dewF)} dew point, so it sweats.`
    : `Even bare, this ${noun(s)} stays above the room's ${T(m.dewF)} dew point.`
  if (m.condensing) {
    return `${lead} With ${inchLabel(s.thicknessIn)} of insulation the outside surface is still ${T(ins.result.surfaceF)} — below the dew point — so moisture condenses on it. More insulation, or a higher-emittance finish, warms the surface.`
  }
  if (ins.status === 'borderline') {
    return `${lead} With ${inchLabel(s.thicknessIn)} of insulation the surface is ${T(ins.result.surfaceF)}, just ${fmt.tempDelta(m.marginF, units, 1).replace('+', '')} above the dew point — less than your ${fmt.margin(s.dewMarginF, units)} margin. A small change in humidity could start it sweating.`
  }
  return `${lead} With ${inchLabel(s.thicknessIn)} of insulation the surface stays at ${T(ins.result.surfaceF)}, ${fmt.tempDelta(m.marginF, units, 1).replace('+', '')} above the dew point, so it stays dry — as long as the vapor retarder is sealed.`
}

function CodeRow({ s, mode, onSet }: { s: SimState; mode: SimMode; onSet: (p: Partial<SimState>) => void }) {
  if (s.system === 'duct') return null
  const c = codeMinimum(s, mode)
  const picker = (
    <div className="code-pick">
      <span>Energy code</span>
      <CodeChips<PipeCodeBasis> label="Energy code" value={s.pipeCodeBasis} onChange={(v) => onSet({ pipeCodeBasis: v })} options={PIPE_CODES} />
    </div>
  )
  if ('none' in c) return <>{picker}<p className="field-note">Energy code: {c.none}</p></>
  const refs = refsFor(c.src)
  return (
    <>
      {picker}
      <div className="code-row">
        <span>
          <b>{c.edition} minimum: {c.minR ? `R-${c.minR} → ${c.minIn.toFixed(2)}"` : `${c.minIn.toFixed(2)}"`}</b>
          <small>
            {c.minR
              ? `R403.4: piping ${c.row} needs R-${c.minR}; this insulation reaches it at ${c.minIn.toFixed(2)}" (R = ro·ln(ro/ri)/k with k ${c.K.toFixed(3)} at 75°F, the IECC's pipe R-value)${s.pipeCodeBasis === 'wsec-res' ? '. Service hot water pipe needs R-3 instead (R403.5.3); up to 200 ft of hydronic pipe inside conditioned space may use 1/2" at k 0.28' : ''}`
              : <>{c.table}, {c.row}: {c.tableIn}" in the table{c.corrected ? `, corrected for k ${c.K.toFixed(3)} at ${c.meanF}°F (table range ${c.kRange[0]}–${c.kRange[1]})` : ` (k ${c.K.toFixed(3)} at ${c.meanF}°F is within ${c.kRange[0]}–${c.kRange[1]})`}</>}
            {refs.map((r) => <a key={r.id} href={r.url} target="_blank" rel="noreferrer" title={r.title}> [{r.id}]</a>)}.{' '}
            {s.applyCode ? 'Included in the recommended thickness.' : 'Not included — tick it on the answer above to include it.'}
          </small>
        </span>
      </div>
    </>
  )
}

const FITTING_NAME: Record<string, string> = { elbow: '90° elbow', tee: 'Tee', valve: 'Valve', flange: 'Flange pair' }

function FittingCard({ s, mode, ev, units }: { s: SimState; mode: SimMode; ev: Evaluation; units: UnitSystem }) {
  if (s.system === 'duct') return null
  const f = fittingResult(s, ev)
  if (!f) return null
  const name = FITTING_NAME[s.component]
  if ('none' in f) return <section className="fitting-card"><h3><Icon name="cube" size={14} /> {name}</h3><p className="vc-note">{f.none}</p></section>
  const word = mode === 'hot' ? 'loss' : 'gain'
  const q = (btuHr: number) => (units === 'si' ? `${Math.round(btuHr * 0.29307).toLocaleString('en-US')} W` : `${Math.round(btuHr).toLocaleString('en-US')} Btu/hr`)
  const refs = refsFor(f.eq.src)
  const coverWord = s.component === 'valve' || s.component === 'flange' ? 'covered (removable blanket)' : 'insulated'
  return (
    <section className="fitting-card">
      <h3><Icon name="cube" size={14} /> {name} heat {word}</h3>
      <p className="vc-note">
        Counts as <b>{f.eq.ft.toFixed(2)} ft</b> of {NPSLabel(s)} pipe{f.eq.interpolated ? ' (interpolated between table sizes)' : ''} — {f.eq.basis}
        {refs.map((r) => <a key={r.id} href={r.url} target="_blank" rel="noreferrer" title={r.title}> [{r.id}]</a>)}.
      </p>
      <div className="fc-grid">
        <div className={!f.coveredNow ? 'on' : ''}><span>Bare {name.toLowerCase()}</span><b>{q(f.bare)}</b></div>
        <div className={f.coveredNow ? 'on' : ''}><span>{coverWord[0].toUpperCase() + coverWord.slice(1)}</span><b>{q(f.covered)}</b></div>
      </div>
      <p className="vc-verdict">
        {f.coveredNow ? 'Insulating it' : 'Covering it'} {mode === 'hot' ? 'saves' : 'cuts heat gain by'} <b>{q(f.savedBtuHr)}</b>
        {f.annualSaved !== null && <> — about <b>{fmt.energy(f.annualSaved, units)}</b> over {s.hours.toLocaleString('en-US')} h</>}.
        {!f.coveredNow && mode !== 'hot' && ev.bare.moisture.condensing && ' The bare fitting is below the dew point, so it sweats.'}
      </p>
      <p className="vc-note">The covered value applies the same equivalent length to the insulated pipe, as the Illinois TRM and Hart do — an estimate, not a fitting-specific calculation.</p>
    </section>
  )
}

const NPSLabel = (s: SimState) => pipeLabel(s.pipe, pipeSpec(s.pipe, s.npsIndex))

function VaporCard({ s, mode, ev, units }: { s: SimState; mode: SimMode; ev: Evaluation; units: UnitSystem }) {
  const v = vaporCheck(s, mode, ev.ins)
  if (!v) return null
  const r = v.retarder
  const links = r.materialSrc && s.system !== 'duct'
    ? SPECS[s.insulation].sources.filter((x) => r.src.includes(x.id)).map((x) => ({ id: x.id, url: x.url, title: x.label }))
    : refsFor(r.src)
  const req = refsFor(v.requiredSrc)
  const tone = v.meets === null ? 'warn' : v.meets ? 'good' : 'bad'
  const permTxt = r.perm === null ? 'not published' : `${r.upper ? '≤ ' : ''}${r.perm < 0.001 ? r.perm.toFixed(4) : r.perm.toFixed(3)} perm`
  return (
    <section className={`vapor-card ${tone}`}>
      <h3><Icon name="drop" size={14} /> Vapor retarder</h3>
      <div className="vc-row">
        <span>Needed</span>
        <b>≤ {v.required} perm</b>
        <small>{v.requiredNote}{req.map((x) => <a key={x.id} href={x.url} target="_blank" rel="noreferrer" title={x.title}> [{x.id}]</a>)}</small>
      </div>
      <div className="vc-row">
        <span>This system</span>
        <b>{permTxt}</b>
        <small>{r.label}{r.note ? ` — ${r.note}` : ''}{links.map((x) => <a key={x.id} href={x.url} target="_blank" rel="noreferrer" title={x.title}> [{x.id}]</a>)}</small>
      </div>
      <p className="vc-verdict">
        {v.meets === null ? 'No published permeance to check against.' : v.meets ? 'Meets the guidance at its published permeance.' : 'Above the guidance — add or upgrade the vapor retarder.'}
        {v.ozPerYearPer100ft !== null && (
          <> With every joint sealed, about <b>{units === 'si' ? `${(v.ozPerYearPer100ft * 29.5735 * 0.984).toFixed(v.ozPerYearPer100ft < 1 ? 1 : 0)} mL` : `${v.ozPerYearPer100ft < 1 ? v.ozPerYearPer100ft.toFixed(2) : v.ozPerYearPer100ft.toFixed(1)} fl oz`}</b> of water vapor a year gets through per {units === 'si' ? '30 m' : '100 ft'} of {noun(s)}.</>
        )}
      </p>
      {s.vr !== 'ideal' && s.vr !== 'good' && <p className="vc-note">{s.vr === 'poor' ? 'Poor sealing:' : 'Fair sealing:'} open laps and joints let far more vapor in than the published permeance — the figure above assumes they are sealed.</p>}
      {v.notes.map((n) => <p key={n} className="vc-note">{n}</p>)}
    </section>
  )
}

function Warnings({ list }: { list: Evaluation['warnings'] }) {
  return (
    <ul className="warnings">
      {list.map((w) => (
        <li key={w.text} className={w.level}><Icon name={w.level === 'warn' ? 'alert' : 'info'} size={14} />{w.text}</li>
      ))}
    </ul>
  )
}

/** Each requirement and the thickness it needs; the largest sets the answer. */
function Requirements({ d, s, mode, units, onSet }: { d: Design; s: SimState; mode: SimMode; units: UnitSystem; onSet: (p: Partial<SimState>) => void }) {
  const T = (f: number) => fmt.temp(f, units)
  const t = d.thicknessIn
  return (
    <div className="design">
      <ul className="design-rows">
        {d.rows.map(({ c, rec }) => (
          <li key={c.id} className={d.governing?.id === c.id ? 'gov' : ''}>
            <span>{c.label}{refsFor(c.src).map((r) => <a key={r.id} href={r.url} target="_blank" rel="noreferrer" title={r.title}> [{r.id}]</a>)}</span>
            <b>{rec.thicknessIn === null ? `> ${inchLabel(rec.maxIn)}` : rec.alreadyMet ? 'Met bare' : inchLabel(rec.thicknessIn)}</b>
          </li>
        ))}
      </ul>
      {d.side && <p className="field-note">At {inchLabel(t!)}: surface {T(d.side.result.surfaceF)}, {fmt.flow(Math.abs(d.side.result.qBtuHrFt), units)} {fmt.flowUnit(units)}.{d.exactIn !== null && d.exactIn > 0 ? (s.system === 'duct' ? ` Calculated minimum ≈ ${d.exactIn.toFixed(2)}" nominal; rounded up to the next size the product comes in.` : ` Calculated minimum ≈ ${d.exactIn.toFixed(2)}" (nominal OD); rounded up to a standard ½" size.`) : ''}</p>}
      {t === null && <p className="field-note bad">This material can't meet it within {inchLabel(d.maxIn)} — try a higher-emittance finish or compare materials below.</p>}
      <CodeRow s={s} mode={mode} onSet={onSet} />
    </div>
  )
}

/** Why the answer is what it is, in plain words. */
function setBy(c: Design['governing'] & object, s: SimState, units: UnitSystem): string {
  switch (c.id) {
    case 'pp': return `Set by safe-touch: the outside stays at or below ${fmt.temp(s.ppF, units)}.`
    case 'dew': return 'Set by keeping it dry: the outside stays above the dew point.'
    case 'code': return 'Set by the energy code minimum.'
    case 'imc': return `Set by IMC 604.2: duct surface at or below ${fmt.temp(120, units)}.`
    default: return `Set by ${c.label.split(':')[0]}${c.label.includes(':') ? ` (${c.label.split(':').slice(1).join(':').trim()})` : ''}.`
  }
}

/** The energy-code line on the answer card: ducts always carry the code; pipes can include it. */
function CodeLine({ s, mode, ev, units, onSet }: { s: SimState; mode: SimMode; ev: Evaluation; units: UnitSystem; onSet: (p: Partial<SimState>) => void }) {
  if (s.system === 'duct') {
    const c = ductCode(s)
    const ref = refsFor(c.src)[0]
    const code = DUCT_CODES.find((x) => x.id === s.ductCodeBasis)!.label
    const R = ev.ins.ratedR ?? 0
    const link = ref && <a href={ref.url} target="_blank" rel="noreferrer" title={ref.title}> [{ref.id}]</a>
    if (c.R === null) return <p className="answer-code">Energy code ({code}): {c.notStated ? 'no R-value set' : 'no minimum'} for this duct{link}.</p>
    return (
      <p className={`answer-code ${R + 1e-9 >= c.R ? 'ok' : 'short'}`}>
        <Icon name={R + 1e-9 >= c.R ? 'check' : 'alert'} size={13} /> Energy code ({code}) needs R-{c.R} installed — yours is R-{R.toFixed(1)}{link}
      </p>
    )
  }
  if (mode === 'condensate') return null
  const c = codeMinimum(s, mode)
  if ('none' in c) return <p className="answer-code muted">Energy code: {c.none}</p>
  const met = s.thicknessIn + 1e-9 >= c.minIn
  return (
    <label className="check-row answer-code">
      <input type="checkbox" checked={s.applyCode} onChange={(e) => onSet({ applyCode: e.target.checked })} />
      <span>
        Include the {c.edition} minimum ({c.minR ? `R-${c.minR} → ` : ''}{fmt.inches(+c.minIn.toFixed(2), units)})
        <small className="muted">{met ? `Your ${inchLabel(s.thicknessIn)} meets it` : `Your ${inchLabel(s.thicknessIn)} is below it`}</small>
      </span>
    </label>
  )
}

/** The answer, first: the thickness to use, why, and how the current one does. */
function Answer({ mode, s, ev, d, units, onApply, onSet, onGuide }: { mode: SimMode; s: SimState; ev: Evaluation; d: Design; units: UnitSystem; onApply: (t: number) => void; onSet: (p: Partial<SimState>) => void; onGuide?: () => void }) {
  const T = (f: number) => fmt.temp(f, units)
  const ins = ev.ins
  const r = ins.result
  const m = ins.moisture
  const t = d.thicknessIn
  const safe = r.surfaceF <= s.ppF
  const tone = mode === 'hot' ? (safe ? 'good' : 'bad') : STATUS_TONE[ins.status]
  const vapor = mode !== 'hot' ? vaporCheck(s, mode, ins) : null
  const yours = `Your ${inchLabel(s.thicknessIn)}`
  return (
    <div className={`hero answer ${tone}`}>
      <div className="hero-top">
        <span className="answer-label">Recommended thickness</span>
        <span className="hero-tag">Preliminary estimate</span>
      </div>
      <div className="answer-main">
        <div className="hero-big">{t === null ? `> ${inchLabel(d.maxIn)}` : inchLabel(t)}{t !== null && d.layers > 1 && <small>{d.layers} layers</small>}</div>
        {t !== null && (t === s.thicknessIn
          ? <span className="answer-inuse"><Icon name="check" size={14} /> In use</span>
          : <button className="primary answer-use" onClick={() => onApply(t)}>Use {inchLabel(t)}</button>)}
      </div>
      <p className="hero-sub">
        {t === null
          ? `${s.system === 'duct' ? 'This insulation' : 'This material'} can't get there within ${inchLabel(d.maxIn)} — compare materials under More details.`
          : d.governing ? setBy(d.governing, s, units) : 'Every requirement is met even bare.'}
      </p>
      <CodeLine s={s} mode={mode} ev={ev} units={units} onSet={onSet} />
      <div className="answer-now">
        {mode === 'hot' ? <SafetyChip safe={safe} small /> : <StatusChip status={ins.status} mode={mode} small />}
        <span>
          {mode === 'hot'
            ? <>{yours}: <b>{Math.round(ev.reductionPct)}% less heat loss</b> · surface {T(r.surfaceF)} (safe-touch ≤ {T(s.ppF)})</>
            : <>{yours}: surface {T(r.surfaceF)} · dew point {T(m.dewF)} (<b>{fmt.tempDelta(m.marginF, units, 1)}</b>){m.frost ? ' · frost' : ''}</>}
        </span>
      </div>
      {mode !== 'hot' && m.condensing && (
        <p className="hero-sub strong">
          ≈ {(m.ozPerDayPerFt * 10).toFixed(m.ozPerDayPerFt * 10 >= 10 ? 0 : 1)} fl oz of water per day for every 10 ft
          {mode === 'condensate' && m.rateGm2h >= DRIP_RATE ? ' — enough to drip' : ''}
        </p>
      )}
      {vapor?.meets === false && <p className="answer-code short"><Icon name="alert" size={13} /> The vapor retarder is above the guidance — see More details.</p>}
      {onGuide && <button className="linkish" onClick={onGuide}><Icon name="map" size={13} /> Where is "{DUCT_LOCATIONS.find((l) => l.id === s.ductLocation)!.short.toLowerCase()}"? Show it on the building</button>}
    </div>
  )
}

function MaterialCompare({ s, mode, units, onUse, on3d }: { s: SimState; mode: SimMode; units: UnitSystem; onUse: (next: SimState) => void; on3d: (id: MaterialId) => void }) {
  const opts = useMemo(() => materialOptions(s, mode), [s, mode])
  return (
    <table className="mat-compare">
      <thead><tr><th>Material</th><th>Thickness</th><th>Surface</th><th>{mode === 'hot' ? 'Loss' : 'Gain'}</th><th /></tr></thead>
      <tbody>
        {opts.map((o) => {
          const d = o.design
          const cur = o.id === currentMaterial(s)
          return (
            <tr key={o.id} className={cur ? 'on' : ''}>
              <td>{o.label}</td>
              {d && d.thicknessIn !== null && d.side ? (
                <>
                  <td><b>{inchLabel(d.thicknessIn)}</b></td>
                  <td>{fmt.temp(d.side.result.surfaceF, units)}</td>
                  <td>{fmt.flow(Math.abs(d.side.result.qBtuHrFt), units)}</td>
                  <td className="mc-act">
                    {cur && d.thicknessIn === s.thicknessIn ? <span className="muted">Current</span> : <button className="apply sm" onClick={() => onUse({ ...o.state, thicknessIn: d.thicknessIn! })}>Use</button>}
                    {!cur && <button className="apply sm ghost" title="Side by side in 3D" onClick={() => on3d(o.id)}>3D</button>}
                  </td>
                </>
              ) : (
                <td colSpan={4} className="muted">{o.reason ?? (d ? `Needs more than ${inchLabel(d.maxIn)}` : '—')}</td>
              )}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export function ResultsPanel({ mode, s, ev, recs, units, onApply, onUseMaterial, onSet, onCompareMaterial, compact, accent, onGuide }: {
  /** Ductwork: open the location guide. */
  onGuide?: () => void
  mode: SimMode
  /** Panel accent; defaults to the mode's. */
  accent?: string
  s: SimState
  ev: Evaluation
  recs: Recs
  units: UnitSystem
  onApply: (t: number) => void
  onUseMaterial: (next: SimState) => void
  onSet: (p: Partial<SimState>) => void
  onCompareMaterial: (id: MaterialId) => void
  compact?: boolean
}) {
  const ins = ev.ins
  const r = ins.result
  const m = ins.moisture
  const word = mode === 'hot' ? 'Heat loss' : 'Heat gain'
  const T = (f: number) => fmt.temp(f, units)
  const tone = mode === 'hot' ? (r.surfaceF <= s.ppF ? 'good' : 'bad') : STATUS_TONE[ins.status]
  // real warnings stay in view; installation tips go with the details
  const warns = ev.warnings.filter((w) => w.level === 'warn')
  const tips = ev.warnings.filter((w) => w.level !== 'warn')
  return (
    <div className="results" style={{ '--acc': accent ?? ACCENT[mode] } as React.CSSProperties}>
      <Answer mode={mode} s={s} ev={ev} d={recs.primary} units={units} onApply={onApply} onSet={onSet} onGuide={s.system === 'duct' ? onGuide : undefined} />

      {warns.length > 0 && <Warnings list={warns} />}

      <p className="explain-line">{explain(ev, s, units)}</p>

      {/* everything else, one tap away */}
      <Disclosure title={<>More details <small className="muted">heat flow, cost, every requirement, sources</small></>}>
        {tips.length > 0 && <Warnings list={tips} />}
        <FlowBars ev={ev} units={units} />
        <div className="rcards">
          {mode === 'condensate' ? (
            <>
              <Card label={s.system === 'duct' ? 'Air in the duct' : 'Pipe temperature'} value={T(s.processF)} />
              <Card label="Room air" value={T(s.ambientF)} sub={`${s.rh}% RH`} />
              <Card label="Dew point" value={T(m.dewF)} />
              <Card label="Outer surface" value={T(r.surfaceF)} tone={tone} sub={`${fmt.tempDelta(m.marginF, units, 1)} vs dew point`} />
            </>
          ) : (
            <>
              <Card label={`${word} · bare`} value={fmt.flow(Math.abs(ev.bare.result.qBtuHrFt), units)} unit={fmt.flowUnit(units)} />
              <Card label={`${word} · insulated`} value={fmt.flow(Math.abs(r.qBtuHrFt), units)} unit={fmt.flowUnit(units)} sub={`${Math.round(ev.reductionPct)}% reduction`} tone="good" />
              <Card label="Outer surface" value={T(r.surfaceF)} tone={tone} sub={mode === 'hot' ? `Safe-touch ≤ ${T(s.ppF)}` : `${fmt.tempDelta(m.marginF, units, 1)} vs dew point`} />
              {mode === 'cold' ? (
                <Card label="Dew point" value={T(m.dewF)} sub={`${T(s.ambientF)} at ${s.rh}% RH`} />
              ) : s.system === 'duct' ? (
                <Card label="Installed R" value={`R-${(ev.ins.ratedR ?? 0).toFixed(1)}`} sub={s.ductIns === 'board' ? 'as printed, 75°F mean' : 'at 25% compression, 75°F mean'} />
              ) : (
                <Card label="Mean k used" value={ev.ins.result.layerKIp[0]?.toFixed(3) ?? '—'} sub={`at ${T(ev.ins.result.layerMeanF[0] ?? 0)} mean · Btu·in/hr·ft²·°F`} />
              )}
            </>
          )}
          {(() => {
            const c = annualCost(s, mode, ev)
            if (!c) return null
            return (
              <Card
                wide
                label={`Annual ${mode === 'hot' ? 'fuel' : 'cooling'} cost · ${c.basis}`}
                value={money(c.saved)}
                unit=" saved / yr"
                sub={<>Bare {money(c.bare)} → insulated {money(c.ins)}{c.paybackYr !== null ? ` · payback ${c.paybackYr < 1 ? `${Math.max(1, Math.round(c.paybackYr * 12))} months` : `${c.paybackYr.toFixed(1)} years`}` : ''}</>}
                tone="good"
              />
            )
          })()}
          {ev.annual && mode !== 'condensate' && (
            <Card
              wide
              label={`Annual energy · ${fmt.length(s.lengthFt, units)}, ${s.hours.toLocaleString('en-US')} h/yr`}
              value={fmt.energy(ev.annual.saved, units)}
              unit=" saved"
              sub={`Bare ${fmt.energy(ev.annual.bare, units)} → insulated ${fmt.energy(ev.annual.ins, units)}`}
              tone="good"
            />
          )}
        </div>

        {mode !== 'hot' && (() => {
          const z = dewZone(ins)
          if (!z || z.fraction <= 0) return null
          return (
            <div className={`dewzone ${z.fraction >= 1 ? 'bad' : ''}`}>
              <div className="dz-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, z.fraction * 100)}%` }} /></div>
              <p>
                {z.fraction >= 1
                  ? 'The whole insulation thickness is colder than the dew point — the outside surface condenses.'
                  : `The inner ${fmt.inches(+z.depthIn.toFixed(2), units)} (${Math.round(z.fraction * 100)}%) of the insulation is colder than the ${T(m.dewF)} dew point. Water vapor that gets past the vapor retarder condenses there — that's why every seam must be sealed.`}
              </p>
            </div>
          )
        })()}

        <section className="recs">
          <h3><Icon name="target" size={14} /> How the thickness was set</h3>
          {s.system === 'duct' && <DuctCodeNotes s={s} mode={mode} />}
          <Requirements d={recs.primary} s={s} mode={mode} units={units} onSet={onSet} />
          {recs.others.length > 0 && <h4 className="sub-h">Your targets</h4>}
          {recs.others.map((o) => <RecRow key={o.label} label={o.label} rec={o.rec} current={s.thicknessIn} onApply={onApply} units={units} />)}
          <Disclosure title={<>Compare materials <small className="muted">same conditions and finish</small></>}>
            <MaterialCompare s={s} mode={mode} units={units} onUse={onUseMaterial} on3d={onCompareMaterial} />
            <p className="field-note">Each row is the design thickness for that material (first product whose published range covers {T(s.processF)}), keeping your finish where the material offers it.</p>
          </Disclosure>
        </section>

        {r.faces && r.faces.length > 1 && <DuctFaces faces={r.faces} mode={mode} units={units} />}
        <FittingCard s={s} mode={mode} ev={ev} units={units} />
        <VaporCard s={s} mode={mode} ev={ev} units={units} />
        <p className="muted explain-intro">{INTRO[mode]}</p>
      </Disclosure>

      {!compact && <Learn mode={mode} system={s.system} />}
      <Assumptions ev={ev} s={s} units={units} />
    </div>
  )
}

/** Ductwork: what the energy-code minimum is based on, and what it leaves to other checks. */
function DuctCodeNotes({ s, mode }: { s: SimState; mode: SimMode }) {
  const c = ductCode(s)
  const type = DUCT_TYPES.find((t) => t.id === s.ductType)!.label
  return (
    <div className="duct-code-notes">
      <p className="field-note">
        <b>{DUCT_CODES.find((x) => x.id === s.ductCodeBasis)!.label}</b> · {type} · {c.label}{refsFor(c.src).map((r) => <a key={r.id} href={r.url} target="_blank" rel="noreferrer" title={r.title}> [{r.id}]</a>)}.
        {c.R !== null && ' Installed R at 75°F mean, duct wrap at 25% compression. Always part of the duct design.'}
      </p>
      {c.derived && <p className="field-note">Derived from the code's definitions rather than stated outright — confirm with your authority having jurisdiction.</p>}
      {(s.ductType === 'outdoor' || s.ductType === 'exhaust') && <p className="field-note">The IMC still requires preventing condensation on the exterior of any duct (603.12) — included below.</p>}
      {mode !== 'hot' && <p className="field-note">The code minimum is for energy; condensation is a separate requirement below.</p>}
    </div>
  )
}

const FACE_NAME: Record<DuctFaceResult['face'], string> = { top: 'Top', side: 'Sides', bottom: 'Underside', round: 'Surface' }

/** Rectangular ducts: every face runs at its own temperature. */
function DuctFaces({ faces, mode, units }: { faces: DuctFaceResult[]; mode: SimMode; units: UnitSystem }) {
  const cold = mode !== 'hot'
  const gov = faces.reduce((g, f) => ((cold ? f.surfaceF < g.surfaceF : f.surfaceF > g.surfaceF) ? f : g))
  return (
    <section className="duct-faces">
      <h3><Icon name="cube" size={14} /> Each face of the duct</h3>
      <table>
        <thead><tr><th>Face</th><th>Surface</th>{cold && <th>vs dew point</th>}<th>{mode === 'hot' ? 'Loss' : 'Gain'}</th></tr></thead>
        <tbody>
          {faces.map((f) => (
            <tr key={f.face} className={f === gov ? 'gov' : ''}>
              <td>{FACE_NAME[f.face]}{f === gov ? <small> {cold ? 'coldest' : 'hottest'}</small> : null}</td>
              <td>{fmt.temp(f.surfaceF, units, 1)}</td>
              {cold && <td className={f.moisture.condensing ? 'bad' : ''}>{fmt.tempDelta(f.moisture.marginF, units, 1)}</td>}
              <td>{(() => { const v = Math.abs(units === 'si' ? f.qWm2 : wPerM2ToBtuHrFt2(f.qWm2)); return v >= 100 ? Math.round(v) : v.toFixed(1) })()} <small>{units === 'si' ? 'W/m²' : 'Btu/hr·ft²'}</small></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="vc-note">
        {cold
          ? 'Cool air sinks off the underside, so it is the best-cooled face; the top of a cold duct traps a still layer of cool air, so its surface runs coldest and sweats first.'
          : 'Warm air rises off the top and carries heat away; under the duct the warm layer is trapped, so the underside runs hottest.'}
        {' '}Each face uses its own C680 flat-surface correlation; published duct methods apply one average to the whole perimeter.
      </p>
    </section>
  )
}

const wPerM2ToBtuHrFt2 = (w: number) => w / 3.15459

export function Learn({ mode, system = 'pipe' }: { mode: SimMode; system?: SimState['system'] }) {
  return (
    <section className="learn">
      <h3><Icon name="book" size={14} /> Learn</h3>
      {(system === 'duct' ? DUCT_LEARN : LEARN)[mode].map((id) => (
        <Disclosure key={id} title={TOPICS[id].title}>
          {TOPICS[id].body.map((p, i) => <p key={i}>{p}</p>)}
        </Disclosure>
      ))}
    </section>
  )
}
