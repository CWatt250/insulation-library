import { useMemo, useState } from 'react'
import { materialsFor, modeFor, PIPE_USES, recommendation, START, type Answers, type System } from '../../sim/recommend'
import { CamSync } from '../../scene/Viewer'
import { INSULATION } from '../../data/catalog'
import { PIPE_LABEL, type PipeMaterial } from '../../data/pipe'
import { equivalentIndex, pipeSizes } from '../../data/pipes'
import { PIPE_LIMITS } from '../../data/pipeWalls'
import { physicsMode } from '../../sim/model'
import { ductCode } from '../../sim/design'
import { vaporCheck } from '../../sim/vapor'
import { codeMinimum } from '../../sim/code'
import { DUCT_CODES, DUCT_INSULATIONS, DUCT_LOCATIONS, DUCT_TYPES, type DuctType } from '../../sim/duct'
import { dewPointF } from '../../sim/psychro'
import { initialState, PRESETS } from '../../sim/presets'
import { refsFor } from '../../sim/sources'
import type { SimMode, SimState } from '../../sim/types'
import { fmt, inchLabel, type UnitSystem } from '../../sim/units'
import { Icon, Segmented, Slider } from '../controls'
import { Stage, type PanelSpec } from './Stage'
import { DuctGuide } from './DuctGuide'
import { DuctSize } from './DuctSetup'

/**
 * Recommendations: answer a few questions — pipe or duct, what kind, the
 * temperatures, the insulation — and get the thickness that keeps it from
 * sweating and meets the energy code and safety limits, each requirement shown
 * with its source. Everything is computed by the same engine and design rules
 * as the simulator; "Open in simulator" hands the result over.
 */

export function Recommend({ mobile, units, onOpen }: { mobile: boolean; units: UnitSystem; onOpen: (mode: SimMode, state: SimState) => void }) {
  const [a, setA] = useState<Answers>(START)
  const [guide, setGuide] = useState(false)
  const set = (p: Partial<Answers>) => setA((prev) => ({ ...prev, ...p }))
  const setDuct = (p: Partial<SimState>) => setA((prev) => ({ ...prev, duct: { ...prev.duct, ...(p as Partial<Answers['duct']>) } }))
  const sync = useMemo(() => new CamSync(), [])
  const mode = modeFor(a)
  const T = (f: number) => fmt.temp(f, units)

  // ---------------------------------------------------------------- answer
  const result = useMemo(() => recommendation(a), [a])
  const { s, d, ev, options, pick } = result
  const beh = physicsMode(s, mode)
  const vap = vaporCheck(s, mode, ev.ins)
  const dew = dewPointF(a.ambientF, a.rh)
  const label = a.system === 'duct' ? DUCT_INSULATIONS.find((m) => m.id === pick)!.label : INSULATION[pick as keyof typeof INSULATION].label

  // notes worth acting on, each with its source
  const notes: { text: string; src: string[] }[] = []
  if (a.system === 'pipe' && mode !== 'condensate') {
    const c = codeMinimum(s, mode)
    if ('none' in c) notes.push({ text: `Energy code: ${c.none}`, src: [] })
  }
  if (mode === 'condensate') notes.push({ text: 'No model code requires insulating HVAC condensate drain lines, and ASHRAE 90.1-2019 exempts them from its pipe tables. Insulate where sweating would cause damage, or where the equipment maker\'s instructions call for it.', src: ['C7', 'C19'] })
  if (a.system === 'pipe' && a.outdoors) notes.push({ text: 'IECC C403.12.3.1: "Piping insulation exposed to the weather shall be protected from damage, including that caused by sunlight, moisture, equipment maintenance and wind" (no adhesive tape). The recommendation uses an aluminum jacket where the material offers one.', src: ['C1'] })
  if (a.system === 'pipe' && PIPE_LIMITS[a.pipe] && a.processF > PIPE_LIMITS[a.pipe]!.maxF) notes.push({ text: `${PIPE_LIMITS[a.pipe]!.label} is rated to ${T(PIPE_LIMITS[a.pipe]!.maxF)} — this temperature is above its rating.`, src: PIPE_LIMITS[a.pipe]!.src })
  if (a.system === 'duct' && beh !== 'hot') notes.push({ text: 'Cooling ducts: a vapor retarder of 0.05 perm or less, every seam, staple and pin sealed (IMC 604.11).', src: ['C6'] })
  if (a.system === 'duct' && (a.duct.ductType === 'outdoor' || a.duct.ductType === 'exhaust')) notes.push({ text: 'Neither energy code sets an R-value for outside-air or exhaust ducts; the thickness here keeps the outside from sweating (IMC 603.12).', src: ['C1', 'C19'] })

  // ------------------------------------------------------------------ 3D
  const panels: PanelSpec[] = [{ key: `rec-${pick}-${s.thicknessIn}`, title: 'Recommended', side: ev.ins, modelThickness: s.thicknessIn, bare: false }]
  const pipeSizesList = pipeSizes(a.pipe)
  const mats = materialsFor(a, mode)
  const acc = mode === 'hot' ? '#ff8a3d' : mode === 'condensate' ? '#14b8a6' : mode === 'duct' ? '#b9a2ff' : '#8fd0ff'
  const step = (n: number, title: string, body: React.ReactNode) => (
    <section className="rq">
      <h2><i>{n}</i>{title}</h2>
      {body}
    </section>
  )

  return (
    <div className={`sim recommend ${mobile ? 'is-mobile' : ''}`} style={{ '--acc': acc } as React.CSSProperties}>
      {!mobile && (
        <Stage s={s} mode={beh} panels={panels} bare={ev.bare} opts={{ view: 'cutaway', thermal: false, stage: 'studio', mobile, units }} inset={{ left: 380, right: 392 }} sync={sync} />
      )}
      <aside className="panel sim-setup rec-questions">
        <header className="sim-head">
          <span className="brand"><Icon name="layers" size={15} /> Insulation Library</span>
          <div className="title-row">
            <span className="mode-icon"><Icon name="target" size={26} /></span>
            <div>
              <h1>Recommend</h1>
              <p className="sub">Answer a few questions; get the thickness that won't sweat and meets code</p>
            </div>
          </div>
        </header>
        {step(1, 'What are you insulating?', (
          <Segmented<System> label="Pipe or duct" value={a.system} onChange={(v) => set({ system: v, material: 'auto', ...(v === 'duct' ? { processF: 55, ambientF: 95, rh: 60 } : {}) })} options={[{ id: 'pipe', label: 'Pipe' }, { id: 'duct', label: 'Ductwork' }]} />
        ))}
        {a.system === 'pipe' ? step(2, 'What kind of pipe?', (
          <>
            <Segmented<PipeMaterial> label="Pipe material" value={a.pipe} onChange={(v) => set({ pipe: v, npsIndex: equivalentIndex(a.pipe, a.npsIndex, v) })} options={(['steel', 'copper', 'pvc'] as PipeMaterial[]).map((id) => ({ id, label: id === 'steel' ? 'Steel (metal)' : PIPE_LABEL[id] }))} />
            <Slider label="Pipe size" value={Math.min(a.npsIndex, pipeSizesList.length - 1)} values={pipeSizesList.map((_, i) => i)} onChange={(v) => set({ npsIndex: v })} format={(v) => (a.pipe === 'copper' ? `${pipeSizesList[v].nps}" tube` : `NPS ${pipeSizesList[v].nps}"`)} accent={acc} />
            <div className="field">
              <span className="field-label">What does it carry? <small className="muted">fills typical temperatures</small></span>
              <div className="chips">
                {PIPE_USES.map((u) => {
                  const p = PRESETS.find((x) => x.id === u.id)!
                  return (
                    <button key={u.id} onClick={() => set({ processF: p.set.processF, ambientF: p.set.ambientF, rh: p.set.rh ?? a.rh, drain: p.mode === 'condensate', material: 'auto' })}>{u.label}</button>
                  )
                })}
              </div>
            </div>
            <Segmented<'in' | 'out'> size="sm" label="Indoors or outdoors" value={a.outdoors ? 'out' : 'in'} onChange={(v) => set({ outdoors: v === 'out' })} options={[{ id: 'in', label: 'Indoors' }, { id: 'out', label: 'Outdoors' }]} />
            <label className="check-row"><input type="checkbox" checked={a.drain} onChange={(e) => set({ drain: e.target.checked })} /><span>It's a condensate drain line <small className="muted">sized for sweating only</small></span></label>
          </>
        )) : step(2, 'What kind of duct, and where?', (
          <>
            <Segmented<DuctType> size="sm" label="Duct type" value={a.duct.ductType} onChange={(v) => setDuct({ ductType: v })} options={DUCT_TYPES.map((t) => ({ id: t.id, label: t.short }))} />
            <div className="chips loc-chips">
              {DUCT_LOCATIONS.map((l) => <button key={l.id} className={l.id === a.duct.ductLocation ? 'on' : ''} onClick={() => setDuct({ ductLocation: l.id })}>{l.label}</button>)}
            </div>
            <button className="tool guide-open" onClick={() => setGuide(true)}><Icon name="layers" size={15} /> Not sure? Location guide</button>
            <Segmented<SimState['ductCodeBasis']> size="sm" label="Energy code" value={a.duct.ductCodeBasis} onChange={(v) => setDuct({ ductCodeBasis: v })} options={DUCT_CODES.map((c) => ({ id: c.id, label: c.label }))} />
            <Slider label="Climate zone" value={a.duct.climateZone} min={0} max={8} onChange={(v) => setDuct({ climateZone: v })} format={(v) => `Zone ${v}`} accent={acc} />
            <DuctSize s={{ ...initialState('duct'), ...a.duct }} set={(p) => setDuct(p)} units={units} acc={acc} />
          </>
        ))}
        {step(3, 'Temperatures', (
          <>
            <Slider label={a.system === 'duct' ? 'Air in the duct' : 'Pipe / fluid temperature'} value={a.processF} min={-20} max={a.system === 'duct' ? 200 : 600} onChange={(v) => set({ processF: v })} format={(v) => T(v)} accent={acc} />
            <Slider label={a.system === 'duct' ? 'Air around the duct' : 'Air around the pipe'} value={a.ambientF} min={-20} max={130} onChange={(v) => set({ ambientF: v })} format={(v) => T(v)} accent={acc} />
            <Slider label="Relative humidity" value={a.rh} min={10} max={98} onChange={(v) => set({ rh: v })} format={(v) => `${v}%`} hint={<span>Dew point {T(dew)}{a.processF < dew ? ' — the bare surface would sweat' : ''}</span>} accent={acc} />
          </>
        ))}
        {step(4, 'Insulation', (
          <div className="materials sim-materials">
            <button className={`mat ${a.material === 'auto' ? 'on' : ''}`} onClick={() => set({ material: 'auto' })}><Icon name="spark" size={14} /> Best fit (thinnest)</button>
            {mats.map((m) => (
              <button key={m.id} className={`mat ${a.material === m.id ? 'on' : ''}`} disabled={!m.ok} title={m.reason} onClick={() => set({ material: m.id })}>
                {m.label}
              </button>
            ))}
          </div>
        ))}
      </aside>
      <aside className="panel sim-results rec-answer">
        <header><h2 className="title">Recommendation</h2></header>
        <div className="scroll">
          <div className={`hero ${d.thicknessIn === null ? 'bad' : 'good'}`}>
            <div className="hero-top"><span className="hero-tag">Preliminary estimate</span></div>
            {d.thicknessIn === null ? (
              <>
                <div className="hero-big">Over {inchLabel(d.maxIn)}<small>{label}</small></div>
                <p className="hero-sub">This material can't meet every requirement within its range — pick another below.</p>
              </>
            ) : (
              <>
                <div className="hero-big">{inchLabel(d.thicknessIn)}<small>{label}</small></div>
                <p className="hero-sub">
                  {d.governing ? <>Governed by <b>{d.governing.label.split(':')[0].toLowerCase()}</b>. </> : null}
                  Surface {T(ev.ins.result.surfaceF)}{beh !== 'hot' ? `, ${fmt.tempDelta(ev.ins.moisture.marginF, units, 1)} above the ${T(ev.ins.moisture.dewF)} dew point` : ''}.
                </p>
              </>
            )}
          </div>
          <section className="recs">
            <h3><Icon name="target" size={14} /> Every requirement</h3>
            <ul className="design-rows">
              {d.rows.map(({ c, rec }) => (
                <li key={c.id} className={d.governing?.id === c.id ? 'gov' : ''}>
                  <span>{c.label}{refsFor(c.src).map((r) => <a key={r.id} href={r.url} target="_blank" rel="noreferrer" title={r.title}> [{r.id}]</a>)}</span>
                  <b>{rec.thicknessIn === null ? `> ${inchLabel(rec.maxIn)}` : rec.alreadyMet ? 'Met bare' : inchLabel(rec.thicknessIn)}</b>
                </li>
              ))}
            </ul>
            {a.system === 'duct' && (() => {
              const c = ductCode(s)
              return <p className="field-note">Energy code ({DUCT_CODES.find((x) => x.id === s.ductCodeBasis)!.label}): {c.label}{c.derived ? ' (derived)' : ''}.</p>
            })()}
            {vap && (
              <p className="field-note">
                Vapor retarder: needs ≤ {vap.required} perm; {vap.retarder.label} is {vap.retarder.perm === null ? 'not published' : `${vap.retarder.upper ? '≤ ' : ''}${vap.retarder.perm.toFixed(3)} perm`} — {vap.meets === null ? 'check with the maker' : vap.meets ? 'meets it' : 'add or upgrade the retarder'}.
              </p>
            )}
          </section>
          {notes.length > 0 && (
            <ul className="warnings">
              {notes.map((n) => (
                <li key={n.text} className="info"><Icon name="info" size={14} />{n.text}{refsFor(n.src).map((r) => <a key={r.id} href={r.url} target="_blank" rel="noreferrer" title={r.title}> [{r.id}]</a>)}</li>
              ))}
            </ul>
          )}
          <section className="recs">
            <h3><Icon name="layers" size={14} /> Other insulations</h3>
            <table className="mat-compare">
              <tbody>
                {options.slice(0, 6).map((o) => (
                  <tr key={o.id} className={o.id === pick ? 'on' : ''}>
                    <td>{o.label}</td>
                    <td>{o.design && o.design.thicknessIn !== null ? <b>{inchLabel(o.design.thicknessIn)}</b> : <span className="muted">{o.reason ?? 'beyond its range'}</span>}</td>
                    <td className="mc-act">{o.id !== pick && o.design?.thicknessIn != null && <button className="apply sm" onClick={() => set({ material: o.id })}>Pick</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <button className="primary rec-open" onClick={() => onOpen(mode, s)}>
            <Icon name="cube" size={16} /> Open in the simulator
          </button>
          <p className="field-note">Calculated with the simulator's engine (ASTM C680 method) and design rules; an educational / preliminary tool — confirm before specifying.</p>
        </div>
      </aside>
      {mobile && (
        <button className="rec-sticky" onClick={() => document.querySelector('.rec-answer')?.scrollIntoView({ behavior: 'smooth' })}>
          <b>{d.thicknessIn === null ? `Over ${inchLabel(d.maxIn)}` : inchLabel(d.thicknessIn)}</b> {label}
          <span>See why <Icon name="target" size={14} /></span>
        </button>
      )}
      {guide && (
        <DuctGuide
          s={{ ...initialState('duct'), ...a.duct }}
          set={(p) => setDuct(p)}
          onClose={() => setGuide(false)}
        />
      )}
    </div>
  )
}
