import { useRef, useState } from 'react'
import { downloadJson, loadScenarios, normalize, shareHash, storeScenarios, type Scenario } from '../../sim/scenarios'
import type { SimMode, SimState } from '../../sim/types'
import { Icon } from '../controls'

const TITLE: Record<SimMode, string> = { hot: 'Hot', cold: 'Cold', condensate: 'Condensate', duct: 'Ductwork' }

/** Save, reopen, share and export scenarios. */
export function Scenarios({ mode, s, onLoad }: { mode: SimMode; s: SimState; onLoad: (mode: SimMode, state: SimState) => void }) {
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<Scenario[]>(() => loadScenarios())
  const [name, setName] = useState('')
  const [msg, setMsg] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const flash = (t: string) => {
    setMsg(t)
    setTimeout(() => setMsg(''), 2200)
  }
  const persist = (next: Scenario[]) => {
    setList(next)
    if (!storeScenarios(next)) flash('This browser blocked saving — use Export instead.')
  }
  const save = () => {
    const n = name.trim() || `${TITLE[mode]} · ${new Date().toLocaleDateString()}`
    persist([{ id: crypto.randomUUID?.() ?? String(Date.now()), name: n, mode, state: s, savedAt: new Date().toISOString() }, ...list])
    setName('')
    flash('Saved')
  }
  const share = async (sc?: Scenario) => {
    const url = `${location.origin}${location.pathname}?mode=${sc?.mode ?? mode}${shareHash(sc?.mode ?? mode, sc?.state ?? s, sc?.name)}`
    try {
      await navigator.clipboard.writeText(url)
      flash('Link copied')
    } catch {
      history.replaceState(null, '', url)
      flash('Link is in the address bar')
    }
  }
  const importFile = async (f: File) => {
    try {
      const data = JSON.parse(await f.text())
      const items: Scenario[] = (Array.isArray(data) ? data : [data])
        .filter((x) => x && ['hot', 'cold', 'condensate', 'duct'].includes(x.mode))
        .map((x) => ({ id: crypto.randomUUID?.() ?? String(Math.random()), name: String(x.name ?? 'Imported'), mode: x.mode, state: normalize(x.mode, x.state ?? {}), savedAt: String(x.savedAt ?? new Date().toISOString()) }))
      if (!items.length) throw new Error('none')
      persist([...items, ...list])
      flash(`Imported ${items.length}`)
    } catch {
      flash('That file is not a scenario export')
    }
  }
  return (
    <div className="scenarios">
      <button className="tool" aria-label="Scenarios" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="layers" size={15} /> <span className="lbl-long">Scenarios</span><span className="lbl-short">Saved</span></button>
      {open && (
        <div className="scn-pop" role="dialog" aria-label="Scenarios">
          <div className="scn-save">
            <input value={name} placeholder="Name this scenario" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
            <button className="primary" onClick={save}>Save</button>
          </div>
          <div className="scn-actions">
            <button className="tool" onClick={() => share()}>Copy share link</button>
            <button className="tool" onClick={() => downloadJson('insulation-scenarios.json', list.length ? list : [{ name: 'Current', mode, state: s }])}>Export</button>
            <button className="tool" onClick={() => file.current?.click()}>Import</button>
            <input ref={file} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
          </div>
          {msg && <p className="scn-msg" role="status">{msg}</p>}
          <ul className="scn-list">
            {list.length === 0 && <li className="muted">No saved scenarios yet. They stay in this browser — use Export or a share link to move them.</li>}
            {list.map((sc) => (
              <li key={sc.id}>
                <button className="scn-load" onClick={() => { onLoad(sc.mode, sc.state); setOpen(false) }}>
                  <strong>{sc.name}</strong>
                  <small>{TITLE[sc.mode]} · {sc.state.processF}°F · {new Date(sc.savedAt).toLocaleDateString()}</small>
                </button>
                <button className="scn-ic" aria-label={`Share ${sc.name}`} onClick={() => share(sc)}><Icon name="link" size={14} /></button>
                <button className="scn-ic" aria-label={`Delete ${sc.name}`} onClick={() => persist(list.filter((x) => x.id !== sc.id))}><Icon name="x" size={14} /></button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
