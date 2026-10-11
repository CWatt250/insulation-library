import { useState } from 'react'
import type { SimMode } from '../../sim/types'
import { Icon } from '../controls'

/** Three plain steps for each tab; shown on the first visit, and from the ? button any time. */
const STEPS: Record<SimMode, (m: boolean) => string[]> = {
  hot: (m) => [
    `Pick a preset, or set the pipe, its temperature and the room in ${m ? 'the Setup tab' : 'the left panel'}.`,
    `${m ? 'The Results tab' : 'The right panel'} shows heat loss, the surface temperature, and the thickness each requirement needs — tap Apply to use it.`,
    'Compare shows versions side by side; Present walks a customer through it.',
  ],
  cold: (m) => [
    `Pick a preset, or set the pipe, its temperature, the room and the humidity in ${m ? 'the Setup tab' : 'the left panel'}.`,
    `${m ? 'The Results tab' : 'The right panel'} shows whether it sweats and the thickness that keeps it dry and meets code — tap Apply to use it.`,
    'Compare shows versions side by side; Present walks a customer through it.',
  ],
  condensate: (m) => [
    `Pick a preset, or set the drain line, the room and the humidity in ${m ? 'the Setup tab' : 'the left panel'}.`,
    `${m ? 'The Results tab' : 'The right panel'} shows whether it sweats; Auto-size picks the thickness that keeps it dry.`,
    'Compare shows bare, current and recommended side by side.',
  ],
  duct: (m) => [
    `Pick what the duct carries and where it runs in ${m ? 'the Setup tab' : 'the left panel'} — not sure where? Open the Location guide.`,
    `${m ? 'The Results tab' : 'The right panel'} leads with the energy-code minimum for that duct, then checks it won't sweat.`,
    'Use the button in Results to apply the thickness that meets code; Compare and Present work here too.',
  ],
}

const KEY = (mode: SimMode) => `il.help.${mode}`

export function useQuickStart(mode: SimMode) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  let seen = true
  try { seen = localStorage.getItem(KEY(mode)) === '1' } catch { /* private mode: show it */ seen = false }
  const isOpen = open[mode] ?? !seen
  const close = () => {
    try { localStorage.setItem(KEY(mode), '1') } catch { /* nothing to remember */ }
    setOpen((o) => ({ ...o, [mode]: false }))
  }
  return { isOpen, show: () => setOpen((o) => ({ ...o, [mode]: true })), close }
}

export function QuickStart({ mode, mobile, onClose }: { mode: SimMode; mobile: boolean; onClose: () => void }) {
  return (
    <div className="quickstart" role="dialog" aria-label="How it works">
      <div className="qs-head">
        <b><Icon name="help" size={16} /> How it works</b>
        <button className="tool" onClick={onClose}>Got it</button>
      </div>
      <ol>
        {STEPS[mode](mobile).map((t, i) => <li key={i}><i>{i + 1}</i><span>{t}</span></li>)}
      </ol>
    </div>
  )
}
