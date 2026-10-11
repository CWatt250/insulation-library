import { useEffect, useState } from 'react'
import { Viewer } from './scene/Viewer'
import { NPS, THICKNESSES } from './data/pipe'
import { INSULATIONS, INSULATION, JACKETS, type InsulationId, type JacketId } from './data/catalog'
import type { Component, ViewMode } from './geo/assembly'
import { SpecContent, SpecPanel } from './ui/SpecPanel'
import type { PhotoProgress } from './scene/PhotoMode'
import './App.css'

const vec = (s: string | null) => (s ? (s.split(',').map(Number) as [number, number, number]) : undefined)

type Stage = 'studio' | 'plant' | 'room'

function readParams() {
  const q = new URLSearchParams(location.search)
  const ins = (q.get('ins') ?? 'calsil') as InsulationId
  return {
    ins: INSULATION[ins] ? ins : 'calsil',
    nps: Number(q.get('nps') ?? 8),
    thk: Number(q.get('thk') ?? 2),
    jacket: q.get('jacket') as JacketId | null,
    view: (q.get('view') ?? 'cutaway') as ViewMode,
    component: (q.get('comp') ?? 'straight') as Component,
    stage: (q.get('stage') ?? 'studio') as Stage,
    ui: q.get('ui') !== '0',
    photo: q.get('photo') === '1',
    cam: vec(q.get('cam')),
    target: vec(q.get('tgt')),
  }
}

const MOBILE_QUERY = '(max-width: 860px)'

function useIsMobile() {
  const [m, setM] = useState(() => window.matchMedia(MOBILE_QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return m
}

const COMPONENT_LABEL: Record<Component, string> = { straight: 'Straight', elbow: '90° elbow', valve: 'Valve' }
const STAGE_LABEL: Record<Stage, string> = { studio: 'Studio', plant: 'Plant', room: 'Mech room' }

export default function App() {
  const [init] = useState(readParams)
  const [insulation, setInsulation] = useState<InsulationId>(init.ins as InsulationId)
  const [npsIndex, setNps] = useState(init.nps)
  const [thicknessIn, setThk] = useState(init.thk)
  const [jacket, setJacket] = useState<JacketId>(init.jacket ?? INSULATION[init.ins as InsulationId].jackets[0])
  const [view, setView] = useState<ViewMode>(init.view)
  const [component, setComponent] = useState<Component>(init.component)
  const [stage, setStage] = useState<Stage>(init.stage)
  const [photo, setPhoto] = useState(init.photo)
  const [progress, setProgress] = useState<PhotoProgress | null>(null)
  const mobile = useIsMobile()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [tab, setTab] = useState<'configure' | 'specs'>('configure')

  const ins = INSULATION[insulation]
  const thicknesses = THICKNESSES.filter((t) => t <= ins.maxThicknessIn)

  // Keep jacket and thickness valid for the selected material.
  useEffect(() => {
    if (!ins.jackets.includes(jacket)) setJacket(ins.jackets[0])
    if (thicknessIn > ins.maxThicknessIn) setThk(ins.maxThicknessIn)
  }, [ins, jacket, thicknessIn])

  // Path tracing is a desktop-GPU feature.
  useEffect(() => {
    if (mobile && photo) setPhoto(false)
  }, [mobile, photo])

  const valid = ins.jackets.includes(jacket) && thicknessIn <= ins.maxThicknessIn

  const materials = (
    <div className="materials">
      {INSULATIONS.map((m) => (
        <button key={m.id} className={`mat ${m.id === insulation ? 'on' : ''}`} onClick={() => setInsulation(m.id)}>
          <span className="swatch" style={{ background: m.swatch }} />
          {m.label}
        </button>
      ))}
    </div>
  )

  const controls = (
    <>
      {!mobile && (
        <section>
          <h2>Material</h2>
          {materials}
        </section>
      )}

      <section>
        <h2>Jacket</h2>
        <div className="chips">
          {ins.jackets.map((j) => (
            <button key={j} className={j === jacket ? 'on' : ''} onClick={() => setJacket(j)}>
              {JACKETS[j].label}
            </button>
          ))}
        </div>
      </section>

      <section className="row">
        <label>
          <h2>Pipe size</h2>
          <select value={npsIndex} onChange={(e) => setNps(Number(e.target.value))}>
            {NPS.map((p, i) => (
              <option key={p.nps} value={i}>NPS {p.nps}" · {p.od}" OD</option>
            ))}
          </select>
        </label>
        <label>
          <h2>Thickness</h2>
          <select value={thicknessIn} onChange={(e) => setThk(Number(e.target.value))}>
            {thicknesses.map((t) => (
              <option key={t} value={t}>{t}"{t > 3 ? ' (2 layers)' : ''}</option>
            ))}
          </select>
        </label>
      </section>

      <section>
        <h2>Component</h2>
        <div className="seg">
          {(['straight', 'elbow', 'valve'] as const).map((v) => (
            <button key={v} className={v === component ? 'on' : ''} onClick={() => setComponent(v)}>
              {COMPONENT_LABEL[v]}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>View</h2>
        <div className="seg">
          {(['installed', 'cutaway', 'layers'] as const).map((v) => (
            <button key={v} className={v === view ? 'on' : ''} onClick={() => setView(v)}>{v}</button>
          ))}
        </div>
        <div className="seg">
          {(['studio', 'plant', 'room'] as const).map((v) => (
            <button key={v} className={v === stage ? 'on' : ''} onClick={() => setStage(v)}>{STAGE_LABEL[v]}</button>
          ))}
        </div>
      </section>
      {!mobile && (
        <section>
          <button className={`photo ${photo ? 'on' : ''}`} onClick={() => setPhoto(!photo)}>
            {photo ? 'Photoreal render: on' : 'Photoreal render'}
          </button>
          {photo && progress && (
            <div className="progress" aria-live="polite">
              <div className="bar"><i style={{ width: `${(100 * progress.samples) / progress.max}%` }} /></div>
              <span>{progress.building ? 'Preparing scene…' : progress.samples >= progress.max ? 'Done' : `Refining · ${progress.samples} / ${progress.max} samples`}</span>
            </div>
          )}
        </section>
      )}
      <p className="hint">{mobile ? 'Drag to rotate · pinch to zoom · two-finger drag to pan' : 'Drag to rotate · scroll or pinch to zoom · right-drag to pan'}</p>
    </>
  )

  const summary = `${ins.label} · ${JACKETS[jacket]?.label ?? ''} · NPS ${NPS[npsIndex].nps}" · ${thicknessIn}"`

  return (
    <div className={`app ${mobile ? 'is-mobile' : ''}`}>
      <div className="stage">
        {valid && (
          <Viewer
            insulation={insulation}
            npsIndex={npsIndex}
            thicknessIn={thicknessIn}
            jacket={jacket}
            view={view}
            component={component}
            stage={stage}
            cam={init.cam}
            target={init.target}
            photo={photo}
            onPhotoProgress={setProgress}
            mobile={mobile}
          />
        )}
      </div>
      {init.ui && !mobile && (
        <>
          <aside className="panel controls">
            <header>
              <h1>Insulation Library</h1>
              <p className="sub">Mechanical pipe insulation, built to field practice</p>
            </header>
            {controls}
          </aside>
          <SpecPanel id={insulation} />
        </>
      )}
      {init.ui && mobile && (
        <section className={`sheet ${sheetOpen ? 'open' : ''}`} aria-label="Controls">
          <button className="sheet-handle" onClick={() => setSheetOpen(!sheetOpen)} aria-label={sheetOpen ? 'Collapse panel' : 'Expand panel'}>
            <i />
          </button>
          <div className="sheet-head">
            <div className="tabs" role="tablist">
              {(['configure', 'specs'] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  className={tab === t ? 'on' : ''}
                  onClick={() => {
                    setTab(t)
                    setSheetOpen(true)
                  }}
                >
                  {t === 'configure' ? 'Configure' : 'Specs'}
                </button>
              ))}
            </div>
            <button className="sheet-toggle" onClick={() => setSheetOpen(!sheetOpen)} aria-hidden="true" tabIndex={-1}>
              {sheetOpen ? '▾' : '▴'}
            </button>
          </div>
          {!sheetOpen && <p className="sheet-summary">{summary}</p>}
          <div className="sheet-materials">{materials}</div>
          <div className="sheet-body">
            {tab === 'configure' ? <div className="controls-body">{controls}</div> : <SpecContent id={insulation} showTitle />}
          </div>
        </section>
      )}
    </div>
  )
}
