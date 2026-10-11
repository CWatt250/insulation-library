import type { ReactNode } from 'react'
import type { Evaluation, Recommendation } from '../../sim/model'
import { DRIP_RATE } from '../../sim/model'
import type { SimMode, SimState } from '../../sim/types'
import { fmt, inchLabel, type UnitSystem } from '../../sim/units'
import { INTRO, LEARN, TOPICS } from '../../sim/learn'
import { Disclosure, Icon } from '../controls'
import { SafetyChip, StatusChip, STATUS_TONE } from './Status'
import { ACCENT } from './SetupPanel'
import { Assumptions } from './Assumptions'

export interface Recs {
  primary: Recommendation
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
    return `The bare pipe would give off ${fmt.flow(ev.bare.result.qBtuHrFt, units)} ${fmt.flowUnit(units)}. With ${inchLabel(s.thicknessIn)} of insulation that drops to ${fmt.flow(ins.result.qBtuHrFt, units)} — ${Math.round(ev.reductionPct)}% less — and the outside surface sits at ${T(ins.result.surfaceF)}, ${safe ? 'within' : 'above'} the ${T(s.ppF)} safe-touch limit.`
  }
  const bareM = ev.bare.moisture
  const lead = bareM.condensing
    ? `A bare pipe at ${T(s.processF)} would sit ${fmt.tempDelta(-bareM.marginF, units).replace('+', '')} below the room's ${T(m.dewF)} dew point, so it sweats.`
    : `Even bare, this pipe stays above the room's ${T(m.dewF)} dew point.`
  if (m.condensing) {
    return `${lead} With ${inchLabel(s.thicknessIn)} of insulation the outside surface is still ${T(ins.result.surfaceF)} — below the dew point — so moisture condenses on it. More insulation, or a higher-emittance finish, warms the surface.`
  }
  if (ins.status === 'borderline') {
    return `${lead} With ${inchLabel(s.thicknessIn)} of insulation the surface is ${T(ins.result.surfaceF)}, just ${fmt.tempDelta(m.marginF, units, 1).replace('+', '')} above the dew point — less than your ${fmt.margin(s.dewMarginF, units)} margin. A small change in humidity could start it sweating.`
  }
  return `${lead} With ${inchLabel(s.thicknessIn)} of insulation the surface stays at ${T(ins.result.surfaceF)}, ${fmt.tempDelta(m.marginF, units, 1).replace('+', '')} above the dew point, so it stays dry — as long as the vapor retarder is sealed.`
}

export function ResultsPanel({ mode, s, ev, recs, units, onApply, compact }: {
  mode: SimMode
  s: SimState
  ev: Evaluation
  recs: Recs
  units: UnitSystem
  onApply: (t: number) => void
  compact?: boolean
}) {
  const ins = ev.ins
  const r = ins.result
  const m = ins.moisture
  const word = mode === 'hot' ? 'Heat loss' : 'Heat gain'
  const T = (f: number) => fmt.temp(f, units)
  const safe = r.surfaceF <= s.ppF
  const tone = mode === 'hot' ? (safe ? 'good' : 'bad') : STATUS_TONE[ins.status]
  return (
    <div className="results" style={{ '--acc': ACCENT[mode] } as React.CSSProperties}>
      {/* ---------------------------------------------------------------- hero */}
      <div className={`hero ${tone}`}>
        <div className="hero-top">
          {mode === 'hot' ? <SafetyChip safe={safe} /> : <StatusChip status={ins.status} mode={mode} />}
          <span className="hero-tag">Preliminary estimate</span>
        </div>
        {mode === 'hot' ? (
          <>
            <div className="hero-big">{Math.round(ev.reductionPct)}<small>% less heat loss</small></div>
            <p className="hero-sub">Surface {T(r.surfaceF)} with {inchLabel(s.thicknessIn)} of insulation · safe-touch limit {T(s.ppF)}</p>
          </>
        ) : (
          <>
            <div className="hero-big">{fmt.tempDelta(m.marginF, units, 1)}<small>margin to dew point</small></div>
            <p className="hero-sub">Surface {T(r.surfaceF)} · dew point {T(m.dewF)}{m.frost ? ' · below freezing: frost' : ''}</p>
            {m.condensing && (
              <p className="hero-sub strong">
                ≈ {(m.ozPerDayPerFt * 10).toFixed(m.ozPerDayPerFt * 10 >= 10 ? 0 : 1)} fl oz of water per day for every 10 ft
                {mode === 'condensate' && m.rateGm2h >= DRIP_RATE ? ' — enough to drip' : ''}
              </p>
            )}
          </>
        )}
      </div>

      {mode === 'condensate' && (
        <div className="autosize">
          <div>
            <span>Minimum to prevent sweating</span>
            <strong>{recs.primary.thicknessIn === null ? `> ${inchLabel(recs.primary.maxIn)}` : recs.primary.thicknessIn === s.thicknessIn ? `${inchLabel(recs.primary.thicknessIn)} (current)` : inchLabel(recs.primary.thicknessIn)}</strong>
          </div>
          <button
            className="primary"
            disabled={recs.primary.thicknessIn === null || recs.primary.thicknessIn === s.thicknessIn}
            onClick={() => recs.primary.thicknessIn !== null && onApply(recs.primary.thicknessIn)}
          >
            <Icon name="spark" size={16} /> Auto-size insulation
          </button>
        </div>
      )}

      {/* --------------------------------------------------------------- cards */}
      <FlowBars ev={ev} units={units} />
      <div className="rcards">
        {mode === 'condensate' ? (
          <>
            <Card label="Pipe temperature" value={T(s.processF)} />
            <Card label="Room air" value={T(s.ambientF)} sub={`${s.rh}% RH`} />
            <Card label="Dew point" value={T(m.dewF)} />
            <Card label="Outer surface" value={T(r.surfaceF)} tone={tone} sub={`${fmt.tempDelta(m.marginF, units, 1)} vs dew point`} />
          </>
        ) : (
          <>
            <Card label={`${word} · bare`} value={fmt.flow(Math.abs(ev.bare.result.qBtuHrFt), units)} unit={fmt.flowUnit(units)} />
            <Card label={`${word} · insulated`} value={fmt.flow(Math.abs(r.qBtuHrFt), units)} unit={fmt.flowUnit(units)} sub={`${Math.round(ev.reductionPct)}% reduction`} tone="good" />
            <Card label="Outer surface" value={T(r.surfaceF)} tone={mode === 'hot' ? tone : STATUS_TONE[ins.status]} sub={mode === 'hot' ? `Safe-touch ≤ ${T(s.ppF)}` : `${fmt.tempDelta(m.marginF, units, 1)} vs dew point`} />
            {mode === 'cold' ? (
              <Card label="Dew point" value={T(m.dewF)} sub={`${T(s.ambientF)} at ${s.rh}% RH`} />
            ) : (
              <Card label="Mean k used" value={ev.ins.result.layerKIp[0]?.toFixed(3) ?? '—'} sub={`at ${T(ev.ins.result.layerMeanF[0] ?? 0)} mean · Btu·in/hr·ft²·°F`} />
            )}
          </>
        )}
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

      {ev.warnings.length > 0 && (
        <ul className="warnings">
          {ev.warnings.map((w) => (
            <li key={w.text} className={w.level}><Icon name={w.level === 'warn' ? 'alert' : 'info'} size={14} />{w.text}</li>
          ))}
        </ul>
      )}

      {/* ------------------------------------------------------------- solvers */}
      <section className="recs">
        <h3><Icon name="target" size={14} /> Find the thickness</h3>
        <RecRow label={recs.primary.goal.kind === 'surfaceMax' ? `Personnel protection (surface ≤ ${T(s.ppF)})` : `No condensation (surface ≥ dew point + ${fmt.margin(s.dewMarginF, units)})`} rec={recs.primary} current={s.thicknessIn} onApply={onApply} units={units} />
        {recs.others.map((o) => <RecRow key={o.label} label={o.label} rec={o.rec} current={s.thicknessIn} onApply={onApply} units={units} />)}
        <p className="field-note">Checks standard thicknesses in ½" steps with this material, finish and k-curve.</p>
      </section>

      {/* ------------------------------------------------------------- explain */}
      <section className="explain">
        <h3><Icon name="info" size={14} /> {mode === 'condensate' ? 'Why it sweats (or doesn\'t)' : 'What this means'}</h3>
        <p>{explain(ev, s, units)}</p>
        <p className="muted">{INTRO[mode]}</p>
      </section>

      {!compact && <Learn mode={mode} />}
      <Assumptions ev={ev} s={s} units={units} />
    </div>
  )
}

export function Learn({ mode }: { mode: SimMode }) {
  return (
    <section className="learn">
      <h3><Icon name="book" size={14} /> Learn</h3>
      {LEARN[mode].map((id) => (
        <Disclosure key={id} title={TOPICS[id].title}>
          {TOPICS[id].body.map((p, i) => <p key={i}>{p}</p>)}
        </Disclosure>
      ))}
    </section>
  )
}
