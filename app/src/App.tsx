import { useEffect, useState } from 'react'
import { Viewer } from './scene/Viewer'
import { NPS, THICKNESSES } from './data/pipe'
import { INSULATIONS, INSULATION, JACKETS, type InsulationId, type JacketId } from './data/catalog'
import type { Component, ViewMode } from './geo/assembly'
import { SpecPanel } from './ui/SpecPanel'
import type { PhotoProgress } from './scene/PhotoMode'
import './App.css'

const vec = (s: string | null) => (s ? (s.split(',').map(Number) as [number, number, number]) : undefined)

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
    stage: (q.get('stage') ?? 'studio') as 'studio' | 'plant' | 'room',
    ui: q.get('ui') !== '0',
    photo: q.get('photo') === '1',
    cam: vec(q.get('cam')),
    target: vec(q.get('tgt')),
  }
}

export default function App() {
  const [init] = useState(readParams)
  const [insulation, setInsulation] = useState<InsulationId>(init.ins as InsulationId)
  const [npsIndex, setNps] = useState(init.nps)
  const [thicknessIn, setThk] = useState(init.thk)
  const [jacket, setJacket] = useState<JacketId>(init.jacket ?? INSULATION[init.ins as InsulationId].jackets[0])
  const [view, setView] = useState<ViewMode>(init.view)
  const [component, setComponent] = useState<Component>(init.component)
  const [stage, setStage] = useState(init.stage)
  const [photo, setPhoto] = useState(init.photo)
  const [progress, setProgress] = useState<PhotoProgress | null>(null)

  const ins = INSULATION[insulation]
  const thicknesses = THICKNESSES.filter((t) => t <= ins.maxThicknessIn)

  // Keep jacket and thickness valid for the selected material.
  useEffect(() => {
    if (!ins.jackets.includes(jacket)) setJacket(ins.jackets[0])
    if (thicknessIn > ins.maxThicknessIn) setThk(ins.maxThicknessIn)
  }, [ins, jacket, thicknessIn])

  const valid = ins.jackets.includes(jacket) && thicknessIn <= ins.maxThicknessIn

  return (
    <div className="app">
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
        />
      )}
      {init.ui && (
        <>
          <aside className="panel controls">
            <header>
              <h1>Insulation Library</h1>
              <p className="sub">Mechanical pipe insulation, built to field practice</p>
            </header>

            <section>
              <h2>Material</h2>
              <div className="materials">
                {INSULATIONS.map((m) => (
                  <button
                    key={m.id}
                    className={`mat ${m.id === insulation ? 'on' : ''}`}
                    onClick={() => setInsulation(m.id)}
                  >
                    <span className="swatch" style={{ background: m.swatch }} />
                    {m.label}
                  </button>
                ))}
              </div>
            </section>

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
                    {v === 'straight' ? 'Straight' : v === 'elbow' ? '90° elbow' : 'Valve'}
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
                  <button key={v} className={v === stage ? 'on' : ''} onClick={() => setStage(v)}>{v === 'room' ? 'Mech room' : v}</button>
                ))}
              </div>
            </section>
            <section className="photo-section">
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
            <p className="hint">Drag to rotate · scroll or pinch to zoom · right-drag to pan</p>
          </aside>
          <SpecPanel id={insulation} />
        </>
      )}
    </div>
  )
}
