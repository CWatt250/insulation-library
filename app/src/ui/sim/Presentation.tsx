import { useEffect } from 'react'
import { INSULATION } from '../../data/catalog'
import { annualCost, money } from '../../sim/cost'
import type { Evaluation } from '../../sim/model'
import type { SimMode, SimState } from '../../sim/types'
import { fmt, inchLabel, type UnitSystem } from '../../sim/units'
import { Icon } from '../controls'

export type PresentStep = 0 | 1 | 2
export const STEP_LABEL = ['Bare pipe', 'Insulated', 'Side by side'] as const

interface Stat { value: string; label: string; tone?: 'good' | 'bad' }

function stats(mode: SimMode, s: SimState, ev: Evaluation, units: UnitSystem, step: PresentStep): Stat[] {
  const T = (f: number) => fmt.temp(f, units)
  const Q = (b: number) => `${fmt.flow(Math.abs(b), units)} ${fmt.flowUnit(units)}`
  const bare = ev.bare
  const ins = ev.ins
  const cost = annualCost(s, mode, ev)
  const what = `${inchLabel(s.thicknessIn)} ${INSULATION[s.insulation].label.toLowerCase()}`
  if (mode === 'hot') {
    if (step === 0) {
      return [
        { value: Q(bare.result.qBtuHrFt), label: 'heat lost from every foot of bare pipe', tone: 'bad' },
        { value: T(bare.result.surfaceF), label: bare.result.surfaceF > s.ppF ? `surface — far above the ${T(s.ppF)} safe-touch limit` : 'surface temperature', tone: bare.result.surfaceF > s.ppF ? 'bad' : undefined },
        ...(ev.annual ? [{ value: fmt.energy(ev.annual.bare, units), label: `wasted over ${s.lengthFt} ft`, tone: 'bad' as const }] : []),
      ]
    }
    return [
      { value: `${Math.round(ev.reductionPct)}%`, label: `less heat loss with ${what}`, tone: 'good' },
      { value: T(ins.result.surfaceF), label: ins.result.surfaceF <= s.ppF ? 'surface — safe to touch' : `surface — above the ${T(s.ppF)} limit`, tone: ins.result.surfaceF <= s.ppF ? 'good' : 'bad' },
      cost ? { value: money(cost.saved), label: `saved every year${cost.paybackYr !== null ? ` · pays back in ${cost.paybackYr < 1 ? `${Math.max(1, Math.round(cost.paybackYr * 12))} months` : `${cost.paybackYr.toFixed(1)} years`}` : ''}`, tone: 'good' }
        : ev.annual ? { value: fmt.energy(ev.annual.saved, units), label: 'energy saved every year', tone: 'good' } : { value: Q(bare.result.qBtuHrFt - ins.result.qBtuHrFt), label: 'less heat lost per foot', tone: 'good' },
    ]
  }
  const wet = (x: typeof bare) => x.moisture.condensing
  if (step === 0) {
    return [
      { value: wet(bare) ? 'Sweating' : 'Dry', label: wet(bare) ? `bare pipe at ${T(s.processF)} is below the ${T(bare.moisture.dewF)} dew point` : 'bare pipe stays above the dew point', tone: wet(bare) ? 'bad' : 'good' },
      wet(bare) ? { value: `${(bare.moisture.ozPerDayPerFt * 10).toFixed(1)} fl oz`, label: 'of water a day for every 10 ft', tone: 'bad' } : { value: T(bare.moisture.dewF), label: 'room dew point' },
      { value: Q(bare.result.qBtuHrFt), label: 'heat gained per foot of bare pipe', tone: 'bad' },
    ]
  }
  const dry = !wet(ins)
  return [
    { value: dry ? (ins.status === 'borderline' ? 'Borderline' : 'Dry') : 'Sweating', label: dry ? `surface ${T(ins.result.surfaceF)} stays above the ${T(ins.moisture.dewF)} dew point` : `surface ${T(ins.result.surfaceF)} is still below the dew point`, tone: dry && ins.status !== 'borderline' ? 'good' : 'bad' },
    { value: `${Math.round(ev.reductionPct)}%`, label: `less heat gain with ${what}`, tone: 'good' },
    cost ? { value: money(cost.saved), label: 'cooling cost saved every year', tone: 'good' } : { value: fmt.tempDelta(ins.moisture.marginF, units, 1), label: 'margin to the dew point', tone: dry ? 'good' : 'bad' },
  ]
}

/** Customer-facing overlay: headline numbers for each step, step buttons, exit. */
export function Presentation({ mode, s, ev, units, step, setStep, onExit, preparedFor }: {
  mode: SimMode
  s: SimState
  ev: Evaluation
  units: UnitSystem
  step: PresentStep
  setStep: (n: PresentStep) => void
  onExit: () => void
  preparedFor: string
}) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit()
      if (e.key === 'ArrowRight' || e.key === ' ') setStep(Math.min(2, step + 1) as PresentStep)
      if (e.key === 'ArrowLeft') setStep(Math.max(0, step - 1) as PresentStep)
    }
    window.addEventListener('keydown', key)
    document.body.classList.add('presenting')
    return () => {
      window.removeEventListener('keydown', key)
      document.body.classList.remove('presenting')
    }
  }, [step, setStep, onExit])
  const list = stats(mode, s, ev, units, step)
  const title = { hot: 'Hot pipe insulation', cold: 'Cold pipe insulation', condensate: 'Condensate line insulation' }[mode]
  return (
    <div className="present">
      <div className="pr-top">
        <div>
          {preparedFor && <span className="pr-for">Prepared for {preparedFor}</span>}
          <h1>{title}</h1>
          <p>{STEP_LABEL[step]} · {fmt.temp(s.processF, units)} line in {fmt.temp(s.ambientF, units)}{mode !== 'hot' ? `, ${s.rh}% RH` : ''} air</p>
        </div>
        <button className="pr-exit" onClick={onExit} aria-label="Exit presentation"><Icon name="x" size={18} /> Exit</button>
      </div>
      <div className="pr-bottom">
        <div className={`pr-stats n${list.length}`}>
          {list.map((x) => (
            <div key={x.label} className={`pr-stat ${x.tone ?? ''}`}>
              <b>{x.value}</b>
              <span>{x.label}</span>
            </div>
          ))}
        </div>
        <div className="pr-steps" role="tablist" aria-label="Presentation steps">
          {STEP_LABEL.map((l, i) => (
            <button key={l} role="tab" aria-selected={step === i} className={step === i ? 'on' : ''} onClick={() => setStep(i as PresentStep)}>
              <i>{i + 1}</i> {l}
            </button>
          ))}
        </div>
        <p className="pr-note">Preliminary estimate · ASTM C680 method · ← → to step, Esc to exit</p>
      </div>
    </div>
  )
}
