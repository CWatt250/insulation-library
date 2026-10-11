import type { CondensationStatus, SimMode, SimState } from '../../sim/types'
import type { Evaluation } from '../../sim/model'
import { ductCode } from '../../sim/design'
import { Icon } from '../controls'

/** Status words never rely on colour alone: each carries an icon and a label. */
export const STATUS_TEXT: Record<SimMode, Record<CondensationStatus, string>> = {
  hot: { dry: 'Dry', borderline: 'Dry', sweating: 'Dry', dripping: 'Dry' },
  cold: { dry: 'Dry', borderline: 'At risk', sweating: 'Sweating', dripping: 'Sweating' },
  condensate: { dry: 'Dry', borderline: 'Borderline', sweating: 'Sweating', dripping: 'Dripping risk' },
  duct: { dry: 'Dry', borderline: 'At risk', sweating: 'Sweating', dripping: 'Dripping' },
}

export const STATUS_TONE: Record<CondensationStatus, 'good' | 'warn' | 'bad'> = { dry: 'good', borderline: 'warn', sweating: 'bad', dripping: 'bad' }

export function StatusChip({ status, mode, small }: { status: CondensationStatus; mode: SimMode; small?: boolean }) {
  const tone = STATUS_TONE[status]
  return (
    <span className={`status-chip ${tone} ${small ? 'sm' : ''}`}>
      <Icon name={tone === 'good' ? 'check' : tone === 'warn' ? 'alert' : 'drop'} size={small ? 12 : 14} />
      {STATUS_TEXT[mode][status]}
    </span>
  )
}

export function SafetyChip({ safe, small }: { safe: boolean; small?: boolean }) {
  return (
    <span className={`status-chip ${safe ? 'good' : 'bad'} ${small ? 'sm' : ''}`}>
      <Icon name={safe ? 'check' : 'flame'} size={small ? 12 : 14} />
      {safe ? 'Safe-touch target met' : 'Above safe-touch target'}
    </span>
  )
}

/** Ductwork: does the installed R meet the energy-code minimum for this duct type, location and climate zone? */
export function CodeChip({ s, ev, small = true }: { s: SimState; ev: Evaluation; small?: boolean }) {
  const c = ductCode(s)
  if (c.R === null) {
    return <span className={`status-chip ${small ? 'sm' : ''}`}><Icon name="info" size={small ? 12 : 14} />{c.notStated ? 'No code R-value' : 'No code minimum'}</span>
  }
  const ok = (ev.ins.ratedR ?? 0) + 1e-9 >= c.R
  return (
    <span className={`status-chip ${ok ? 'good' : 'bad'} ${small ? 'sm' : ''}`}>
      <Icon name={ok ? 'check' : 'alert'} size={small ? 12 : 14} />
      {ok ? `Meets code R-${c.R}` : `Below code R-${c.R}`}
    </span>
  )
}
