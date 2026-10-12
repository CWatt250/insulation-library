import { useEffect, useMemo, useRef, useState } from 'react'
import { Viewer } from './scene/Viewer'
import { NPS, THICKNESSES } from './data/pipe'
import {
  INSULATIONS, INSULATION, JACKETS, LAYER_ORDER, layerCount, snapThickness, thicknessesFor,
  type FacingId, type InsulationId, type LayerId, type OuterJacketId, type ServiceId,
} from './data/catalog'
import type { Component, ViewMode } from './geo/assembly'
import { describeLayers } from './data/layers'
import { SpecContent, SpecPanel } from './ui/SpecPanel'
import type { PhotoProgress } from './scene/PhotoMode'
import { Simulator } from './ui/sim/Simulator'
import { Recommend } from './ui/sim/Recommend'
import { Icon } from './ui/controls'
import type { AppMode } from './sim/types'
import type { UnitSystem } from './sim/units'
import { readShareHash } from './sim/scenarios'
import { useCovered } from './ui/useCovered'
import { BrandFooter, ProductMark } from './ui/brand'
import './App.css'
import './sim.css'

const vec = (s: string | null) => (s ? (s.split(',').map(Number) as [number, number, number]) : undefined)

type Stage = 'studio' | 'plant' | 'room'

function readParams() {
  const q = new URLSearchParams(location.search)
  const ins = (q.get('ins') ?? 'calsil') as InsulationId
  let jacket = q.get('jacket')
  let facing = q.get('fac') as FacingId | null
  // older links: jacket=asj / fsk meant an ASJ-faced section with no outer jacket
  if (jacket === 'asj' || jacket === 'fsk') {
    facing = 'asj'
    jacket = 'none'
  }
  return {
    ins: INSULATION[ins] ? ins : 'calsil',
    nps: Number(q.get('nps') ?? 8),
    thk: Number(q.get('thk') ?? 2),
    jacket: jacket as OuterJacketId | null,
    facing,
    service: q.get('svc') as ServiceId | null,
    view: (q.get('view') ?? 'cutaway') as ViewMode,
    component: (q.get('comp') ?? 'straight') as Component,
    stage: (q.get('stage') ?? 'plant') as Stage,
    hidden: (q.get('hide')?.split(',').filter(Boolean) ?? []) as LayerId[],
    selected: q.get('sel') as LayerId | null,
    ui: q.get('ui') !== '0',
    photo: q.get('photo') === '1',
    cam: vec(q.get('cam')),
    target: vec(q.get('tgt')),
    mode: (readShareHash(location.hash)?.mode ?? (['explore', 'hot', 'cold', 'condensate', 'duct', 'recommend'].includes(q.get('mode') ?? '') ? q.get('mode') : 'explore')) as AppMode,
    share: readShareHash(location.hash),
    units: (q.get('units') === 'si' ? 'si' : 'ip') as UnitSystem,
  }
}

/** The top bar: four plainly named places; Pipes opens a second row for the service. */
const GROUPS: { id: 'recommend' | 'pipe' | 'duct' | 'explore'; label: string; short: string; hint: string; icon: 'target' | 'pipe' | 'wind' | 'cube' }[] = [
  { id: 'recommend', label: 'Recommend', short: 'Recommend', hint: 'Answer a few questions, get the thickness', icon: 'target' },
  { id: 'pipe', label: 'Pipes', short: 'Pipes', hint: 'Simulate hot pipes, cold pipes and condensate drains', icon: 'pipe' },
  { id: 'duct', label: 'Ductwork', short: 'Ductwork', hint: 'Duct insulation by energy code, plus condensation', icon: 'wind' },
  { id: 'explore', label: 'Material library', short: 'Library', hint: 'Browse insulation build-ups in 3D', icon: 'cube' },
]
const PIPE_MODES: { id: 'hot' | 'cold' | 'condensate'; label: string; hint: string; icon: 'flame' | 'snow' | 'drop' }[] = [
  { id: 'hot', label: 'Hot pipe', hint: 'Heat loss, surface temperature, safe-touch', icon: 'flame' },
  { id: 'cold', label: 'Cold pipe', hint: 'Heat gain, dew point, condensation', icon: 'snow' },
  { id: 'condensate', label: 'Condensate drain', hint: 'Sweating and dripping', icon: 'drop' },
]
const groupOf = (m: AppMode) => (m === 'hot' || m === 'cold' || m === 'condensate' ? 'pipe' : m)

function ModeBar({ mode, onChange, mobile, lastPipe }: { mode: AppMode; onChange: (m: AppMode) => void; mobile: boolean; lastPipe: AppMode }) {
  const g = groupOf(mode)
  return (
    <nav className={`modebar ${mobile ? 'mobile' : ''} ${g === 'pipe' ? 'with-sub' : ''}`} aria-label="Sections">
      <div className="mb-main">
        {GROUPS.map((x) => (
          <button
            key={x.id}
            className={`mb-${x.id} ${x.id === g ? 'on' : ''}`}
            aria-current={x.id === g ? 'page' : undefined}
            title={x.hint}
            onClick={() => onChange(x.id === 'pipe' ? (g === 'pipe' ? mode : lastPipe) : x.id)}
          >
            <Icon name={x.icon} size={mobile ? 18 : 16} />
            <span>{mobile ? x.short : x.label}</span>
          </button>
        ))}
      </div>
      {g === 'pipe' && (
        <div className="mb-sub" role="group" aria-label="Pipe service">
          {PIPE_MODES.map((x) => (
            <button key={x.id} className={`mode-${x.id} ${x.id === mode ? 'on' : ''}`} aria-current={x.id === mode ? 'page' : undefined} title={x.hint} onClick={() => onChange(x.id)}>
              <Icon name={x.icon} size={14} />
              <span>{x.label}</span>
            </button>
          ))}
        </div>
      )}
    </nav>
  )
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

const COMPONENT_LABEL: Record<Component, string> = { straight: 'Straight', elbow: '90° elbow', tee: 'Tee', valve: 'Valve', flange: 'Flanges' }
const STAGE_LABEL: Record<Stage, string> = { plant: 'Plant', studio: 'Studio', room: 'Mech room' }
const VIEW_LABEL: Record<ViewMode, string> = { installed: 'Installed', cutaway: 'Cutaway', layers: 'Layers', exploded: 'Exploded', section: 'Section' }
const SERVICE_LABEL: Record<ServiceId, string> = { hot: 'Hot', cold: 'Cold (below ambient)' }
const SERVICE_SHORT: Record<ServiceId, string> = { hot: 'Hot', cold: 'Cold' }
const FACING_LABEL: Record<FacingId, string> = { asj: 'ASJ', none: 'None (plain)' }

function Eye({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  )
}

export default function App() {
  const [init] = useState(readParams)
  const [mode, setModeState] = useState<AppMode>(init.mode)
  const [units, setUnits] = useState<UnitSystem>(init.units)
  // a scenario from a share link, or a recommendation opened in the simulator
  const [handoff, setHandoff] = useState(init.share)
  const [lastPipe, setLastPipe] = useState<AppMode>(() => (init.mode === 'cold' || init.mode === 'condensate' ? init.mode : 'hot'))
  const setMode = (m: AppMode) => {
    setModeState(m)
    if (m === 'hot' || m === 'cold' || m === 'condensate') setLastPipe(m)
    const q = new URLSearchParams(location.search)
    if (m === 'explore') q.delete('mode')
    else q.set('mode', m)
    history.replaceState(null, '', `${location.pathname}${q.size ? `?${q}` : ''}`)
  }
  const [insulation, setInsulation] = useState<InsulationId>(init.ins as InsulationId)
  const [npsIndex, setNps] = useState(init.nps)
  const [thkWant, setThk] = useState(init.thk)
  // "wanted" choices persist across materials; each material resolves what it supports
  const [jacketWant, setJacket] = useState<OuterJacketId | null>(init.jacket)
  const [facingWant, setFacing] = useState<FacingId | null>(init.facing)
  const [serviceWant, setService] = useState<ServiceId | null>(init.service)
  const [view, setView] = useState<ViewMode>(init.view)
  const [component, setComponent] = useState<Component>(init.component)
  const [stage, setStage] = useState<Stage>(init.stage)
  const [photo, setPhoto] = useState(init.photo)
  const [progress, setProgress] = useState<PhotoProgress | null>(null)
  const [hidden, setHidden] = useState<LayerId[]>(init.hidden)
  const [selected, setSelected] = useState<LayerId | null>(init.selected)
  const mobile = useIsMobile()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [tab, setTab] = useState<'configure' | 'specs'>('configure')
  // Reset view: shown once the camera has been moved, until the model is framed
  // again (by the button, or by a new view, component or stage)
  const [resetKey, setResetKey] = useState(0)
  const framing = `${view}-${component}-${stage}-${resetKey}`
  const [movedIn, setMovedIn] = useState<string | null>(null)
  const moved = movedIn === framing
  // phones: frame the 3D between the section bar and the bottom sheet
  const stageRef = useRef<HTMLDivElement>(null)
  const covered = useCovered(stageRef, '.modebar', '.sheet', mode, mobile && init.ui && mode === 'explore')

  const ins = INSULATION[insulation]
  const thicknesses = thicknessesFor(ins, THICKNESSES)
  const thicknessIn = snapThickness(ins, thkWant, THICKNESSES)
  const service: ServiceId = serviceWant && ins.services.includes(serviceWant) ? serviceWant : ins.services[0]
  const jacket: OuterJacketId = jacketWant && ins.jackets.includes(jacketWant) ? jacketWant : ins.jackets[0]
  // on cold lines the ASJ is the vapor retarder, so a fibrous section keeps it
  const facingLocked = service === 'cold' && ins.vapor.kind === 'facing' && ins.facings.includes('asj')
  const facings: FacingId[] = facingLocked ? ['asj'] : ins.facings
  const facing: FacingId = facingLocked ? 'asj' : facingWant && ins.facings.includes(facingWant) ? facingWant : ins.facings[0]
  // exploded and section views show a straight run
  const straightOnly = view === 'exploded' || view === 'section'
  const comp: Component = straightOnly ? 'straight' : component

  // Path tracing is a desktop-GPU feature.
  useEffect(() => {
    if (mobile && photo) setPhoto(false)
  }, [mobile, photo])

  const params = { component: comp, npsIndex, thicknessIn, insulation, jacket, facing, service, view }
  const layers = useMemo(() => describeLayers(params), [comp, npsIndex, thicknessIn, insulation, jacket, facing, service, view]) // eslint-disable-line react-hooks/exhaustive-deps
  const selectedInfo = layers.find((l) => l.id === selected) ?? null

  const toggleHidden = (id: LayerId) => setHidden((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]))
  /** Hide everything outside this layer, so it is the outermost thing you see. */
  const peelTo = (id: LayerId) => {
    const i = LAYER_ORDER.indexOf(id)
    setHidden(layers.filter((l) => l.present && LAYER_ORDER.indexOf(l.id) > i).map((l) => l.id))
  }
  const pick = (id: LayerId | null) => setSelected((s) => (id === null ? null : s === id ? null : id))

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

  const buildup = (
    <section className="buildup">
      <h2>Build-up <small>inside → out</small></h2>
      <ol className="layers">
        {layers.map((l) => {
          const off = hidden.includes(l.id)
          return (
            <li key={l.id} className={`layer ${l.present ? '' : 'absent'} ${selected === l.id ? 'sel' : ''} ${off && l.present ? 'off' : ''}`}>
              <button className="layer-main" onClick={() => pick(l.id)} aria-pressed={selected === l.id}>
                <span className="layer-name">{l.name}</span>
                <span className="layer-value">{l.value}</span>
              </button>
              {l.present ? (
                <button className="eye" onClick={() => toggleHidden(l.id)} aria-label={`${off ? 'Show' : 'Hide'} ${l.name.toLowerCase()}`} aria-pressed={!off}>
                  <Eye off={off} />
                </button>
              ) : (
                <span className="eye placeholder" aria-hidden="true" />
              )}
            </li>
          )
        })}
      </ol>
      {selectedInfo && (
        <div className="layer-detail" aria-live="polite">
          <strong>{selectedInfo.name}: {selectedInfo.value}</strong>
          <p>{selectedInfo.detail}</p>
          {selectedInfo.present && (
            <div className="layer-actions">
              <button onClick={() => peelTo(selectedInfo.id)}>Peel to this layer</button>
              {hidden.length > 0 && <button onClick={() => setHidden([])}>Show all</button>}
            </div>
          )}
        </div>
      )}
      {!selectedInfo && hidden.length > 0 && (
        <div className="layer-actions"><button onClick={() => setHidden([])}>Show all layers</button></div>
      )}
      <p className="hint">Tap a layer here or on the model to highlight it.</p>
    </section>
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
        <h2>Service</h2>
        <div className="seg">
          {(['hot', 'cold'] as const).map((v) => (
            <button
              key={v}
              className={v === service ? 'on' : ''}
              disabled={!ins.services.includes(v)}
              title={ins.services.includes(v) ? undefined : `${ins.label} is listed for hot service only`}
              onClick={() => setService(v)}
              aria-label={SERVICE_LABEL[v]}
            >
              {SERVICE_SHORT[v]}
            </button>
          ))}
        </div>
      </section>

      {ins.facings.length > 1 && (
        <section>
          <h2>Facing</h2>
          <div className="chips">
            {ins.facings.map((f) => (
              <button
                key={f}
                className={f === facing ? 'on' : ''}
                disabled={!facings.includes(f)}
                title={facings.includes(f) ? undefined : 'Cold service: the ASJ is the vapor retarder'}
                onClick={() => setFacing(f)}
              >
                {FACING_LABEL[f]}
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2>Jacket</h2>
        <div className="chips">
          {ins.jackets.map((j) => (
            <button key={j} className={j === jacket ? 'on' : ''} onClick={() => setJacket(j)}>
              {j === 'none' ? (facing === 'asj' ? 'None (ASJ finish)' : 'None (bare)') : JACKETS[j].label}
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
              <option key={t} value={t}>{t}"{layerCount(ins, t) > 1 ? ` (${layerCount(ins, t)} layers)` : ''}</option>
            ))}
          </select>
        </label>
      </section>

      <section>
        <h2>View</h2>
        <div className="seg views">
          {(['installed', 'cutaway', 'layers', 'exploded', 'section'] as const).map((v) => (
            <button key={v} className={v === view ? 'on' : ''} onClick={() => setView(v)}>{VIEW_LABEL[v]}</button>
          ))}
        </div>
        <div className="seg views">
          {(['straight', 'elbow', 'tee', 'valve', 'flange'] as const).map((v) => (
            <button
              key={v}
              className={v === comp ? 'on' : ''}
              onClick={() => {
                setComponent(v)
                if (straightOnly && v !== 'straight') setView('cutaway')
              }}
            >
              {COMPONENT_LABEL[v]}
            </button>
          ))}
        </div>
        <div className="seg">
          {(['plant', 'studio', 'room'] as const).map((v) => (
            <button key={v} className={v === stage ? 'on' : ''} onClick={() => setStage(v)}>{STAGE_LABEL[v]}</button>
          ))}
        </div>
      </section>

      {buildup}

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

  const summary = `${ins.label} · ${service === 'hot' ? 'Hot' : 'Cold'} · ${jacket === 'none' ? (facing === 'asj' ? 'ASJ' : 'Bare') : JACKETS[jacket].label} · NPS ${NPS[npsIndex].nps}" · ${thicknessIn}"`
  const spec = { id: insulation, jacket, facing, service, thicknessIn, npsIndex }

  if (mode === 'recommend') {
    return (
      <div className={`app sim-app ${mobile ? 'is-mobile' : ''} ${groupOf(mode) === 'pipe' ? 'subnav' : ''}`}>
        <ModeBar mode={mode} onChange={setMode} mobile={mobile} lastPipe={lastPipe} />
        <Recommend mobile={mobile} units={units} onOpen={(m, st) => { setHandoff({ mode: m, state: st }); setMode(m) }} />
      </div>
    )
  }

  if (mode !== 'explore') {
    return (
      <div className={`app sim-app ${mobile ? 'is-mobile' : ''} ${groupOf(mode) === 'pipe' ? 'subnav' : ''}`}>
        <ModeBar mode={mode} onChange={setMode} mobile={mobile} lastPipe={lastPipe} />
        <Simulator mode={mode} mobile={mobile} units={units} setUnits={setUnits} share={handoff} onMode={setMode} />
      </div>
    )
  }

  return (
    <div className={`app ${mobile ? 'is-mobile' : ''} ${init.ui ? '' : 'no-ui'}`}>
      {init.ui && <ModeBar mode={mode} onChange={setMode} mobile={mobile} lastPipe={lastPipe} />}
      <div className="stage" ref={stageRef}>
        <Viewer
          insulation={insulation}
          npsIndex={npsIndex}
          thicknessIn={thicknessIn}
          jacket={jacket}
          facing={facing}
          service={service}
          view={view}
          component={comp}
          stage={stage}
          cam={init.cam}
          target={init.target}
          photo={photo}
          onPhotoProgress={setProgress}
          mobile={mobile}
          hidden={hidden}
          selected={selected}
          onSelect={pick}
          insetRight={init.ui && !mobile ? 372 : 0}
          insetLeft={init.ui && !mobile ? 312 : 0}
          insetTop={mobile && init.ui ? covered.top + 6 : 0}
          insetBottom={mobile && init.ui ? covered.bottom + 6 : 0}
          resetKey={resetKey}
          onUserMove={() => setMovedIn(framing)}
        />
        {init.ui && moved && !photo && (
          <button className="reset-view library" onClick={() => setResetKey((k) => k + 1)}>
            <Icon name="reset" size={15} /> <span>Reset view</span>
          </button>
        )}
      </div>
      {init.ui && !mobile && (
        <>
          <aside className="panel controls">
            <header>
              <span className="ws-brand ws-eyebrow"><ProductMark size={18} /> <span className="ws-by">by Watt Systems</span></span>
              <h1>Insulation Library</h1>
              <p className="sub">Mechanical pipe insulation, built to field practice</p>
            </header>
            {controls}
            <BrandFooter />
          </aside>
          <SpecPanel {...spec} />
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
            {tab === 'configure' ? <div className="controls-body">{controls}</div> : <SpecContent {...spec} showTitle />}
            <BrandFooter />
          </div>
        </section>
      )}
    </div>
  )
}
