import { useMemo, useState } from 'react'
import { CamSync } from '../../scene/Viewer'
import { INSULATION, INSULATIONS, thicknessesFor, type InsulationId } from '../../data/catalog'
import { THICKNESSES } from '../../data/pipe'
import { evaluate, evaluateSide, recommend, type Goal } from '../../sim/model'
import { design, stateForMaterial } from '../../sim/design'
import { applyPreset, initialState, PRESETS, type Preset } from '../../sim/presets'
import type { SimMode, SimState } from '../../sim/types'
import { fmt, inchLabel, type UnitSystem } from '../../sim/units'
import { refsFor } from '../../sim/sources'
import { Icon, Segmented } from '../controls'
import { ACCENT, PresetGrid, SetupPanel } from './SetupPanel'
import { Learn, ResultsPanel, type Recs } from './ResultsPanel'
import { Stage, thicknessTitle, type PanelSpec } from './Stage'
import { Scenarios } from './Scenarios'
import { ReportButton } from './ReportButton'
import { Presentation, type PresentStep } from './Presentation'
import { SafetyChip, StatusChip } from './Status'

type Slot = 'bare' | 'current' | 'recommended' | number | `mat:${InsulationId}`

const DEFAULT_SLOTS: Record<SimMode, Slot[]> = {
  hot: ['bare', 'current'],
  cold: ['bare', 'current'],
  condensate: ['bare', 'current', 'recommended'],
}

const TITLE: Record<SimMode, string> = { hot: 'Hot Pipe', cold: 'Cold Pipe', condensate: 'Condensate' }
const SUB: Record<SimMode, string> = {
  hot: 'Heat loss, surface temperature and personnel protection',
  cold: 'Heat gain, dew point and condensation control',
  condensate: 'Sweating and dripping prevention',
}

function PresetNote({ id }: { id: string }) {
  const p = PRESETS.find((x) => x.id === id)
  if (!p) return null
  const refs = refsFor(p.range?.src ?? [])
  return (
    <p className="field-note">
      {p.blurb}.{' '}
      {p.range ? <>Typical range — {p.range.text}{refs.map((r) => <a key={r.id} href={r.url} target="_blank" rel="noreferrer" title={r.title}> [{r.id}]</a>)}. </> : 'Example temperature, no published range on file. '}
      Room conditions are examples; adjust to your project.
    </p>
  )
}

export function Simulator({ mode, mobile, units, setUnits, share, onMode }: {
  mode: SimMode
  mobile: boolean
  units: UnitSystem
  setUnits: (u: UnitSystem) => void
  /** A scenario opened from a share link. */
  share?: { mode: SimMode; state: SimState } | null
  onMode: (m: SimMode) => void
}) {
  const [states, setStates] = useState<Record<SimMode, SimState>>(() => {
    const st = { hot: initialState('hot'), cold: initialState('cold'), condensate: initialState('condensate') }
    if (share) st[share.mode] = share.state
    return st
  })
  const loadScenario = (m: SimMode, state: SimState) => {
    setStates((prev) => ({ ...prev, [m]: state }))
    if (m !== mode) onMode(m)
  }
  const [stages, setStages] = useState<Record<SimMode, 'studio' | 'plant'>>({ hot: 'studio', cold: 'studio', condensate: 'studio' })
  const [view, setView] = useState<'installed' | 'cutaway'>('cutaway')
  const [thermal, setThermal] = useState(false)
  const [bare, setBare] = useState(false)
  const [compare, setCompare] = useState(false)
  const [slots, setSlots] = useState(DEFAULT_SLOTS)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [present, setPresent] = useState(false)
  const [step, setStep] = useState<PresentStep>(0)
  const [tab, setTab] = useState<'setup' | 'results' | 'learn'>('results')
  const sync = useMemo(() => new CamSync(), [])

  const s = states[mode]
  const set = (patch: Partial<SimState>) => setStates((prev) => ({ ...prev, [mode]: { ...prev[mode], ...patch } }))
  const pickPreset = (p: Preset) => {
    setStates((prev) => ({ ...prev, [mode]: applyPreset(prev[mode], p) }))
    setStages((prev) => ({ ...prev, [mode]: p.stage ?? 'studio' }))
  }

  const ev = useMemo(() => evaluate(s, mode), [s, mode])
  const recs: Recs = useMemo(() => {
    const primary = design(s, mode)
    const flow = (btuHrFt: number): Goal => ({ kind: 'qMax', btuHrFt })
    const others = mode === 'hot'
      ? [
        { label: `Surface ≤ ${fmt.temp(s.targetSurfaceF, units)}`, rec: recommend(s, mode, { kind: 'surfaceMax', F: s.targetSurfaceF }) },
        { label: `Heat loss ≤ ${fmt.flow(s.targetQ, units)} ${fmt.flowUnit(units)}`, rec: recommend(s, mode, flow(s.targetQ)) },
      ]
      : mode === 'cold'
        ? [
          { label: `Surface ≥ ${fmt.temp(s.targetSurfaceF, units)}`, rec: recommend(s, mode, { kind: 'surfaceMin', F: s.targetSurfaceF }) },
          { label: `Heat gain ≤ ${fmt.flow(s.targetQ, units)} ${fmt.flowUnit(units)}`, rec: recommend(s, mode, flow(s.targetQ)) },
        ]
        : []
    return { primary, others }
  }, [s, mode, units])

  // ---------------------------------------------------------------- panels
  const maxIn = INSULATION[s.insulation].maxThicknessIn
  const panels: PanelSpec[] = useMemo(() => {
    const list: Slot[] = present ? (step === 0 ? ['bare'] : step === 1 ? ['current'] : ['bare', 'current']) : compare ? slots[mode] : [bare ? 'bare' : 'current']
    return list.map((slot, i) => {
      if (slot === 'bare') return { key: `p${i}-bare`, title: 'Bare pipe', side: ev.bare, modelThickness: s.thicknessIn, bare: true }
      if (slot === 'current') return { key: `p${i}-cur`, title: `Current · ${inchLabel(s.thicknessIn)}`, side: ev.ins, modelThickness: s.thicknessIn, bare: false }
      if (slot === 'recommended') {
        const t = recs.primary.thicknessIn ?? maxIn
        const side = recs.primary.side ?? evaluateSide(s, mode, t)

        return {
          key: `p${i}-rec`,
          title: `Recommended · ${inchLabel(t)}`,
          side,
          modelThickness: t,
          bare: false,
          note: recs.primary.thicknessIn === null ? `Even ${inchLabel(maxIn)} falls short` : undefined,
        }
      }
      if (typeof slot === 'string' && slot.startsWith('mat:')) {
        const id = slot.slice(4) as InsulationId
        const r = stateForMaterial(s, mode, id)
        if ('reason' in r) return { key: `p${i}-${id}`, title: INSULATION[id].label, side: ev.bare, modelThickness: s.thicknessIn, bare: true, note: r.reason }
        const d = design(r.state, mode)
        const t = d.thicknessIn ?? INSULATION[id].maxThicknessIn
        const st = { ...r.state, thicknessIn: t }
        return { key: `p${i}-${id}-${t}`, title: `${INSULATION[id].label} · ${inchLabel(t)}`, side: evaluateSide(st, mode, t), modelThickness: t, bare: false, state: st, note: d.thicknessIn === null ? 'Cannot meet the requirements within its range' : 'Design thickness' }
      }
      const t = Math.min(slot as number, maxIn)
      return { key: `p${i}-${t}`, title: thicknessTitle(t), side: evaluateSide(s, mode, t), modelThickness: t, bare: false }
    })
  }, [compare, slots, mode, bare, ev, s, recs, maxIn, present, step])

  const insetLeft = mobile || present ? 0 : 332
  const insetRight = mobile || present ? 0 : 392
  const acc = ACCENT[mode]

  const slotOptions: { id: string; label: string }[] = [
    { id: 'bare', label: 'Bare pipe' },
    { id: 'current', label: 'Current' },
    { id: 'recommended', label: 'Recommended' },
    ...thicknessesFor(INSULATION[s.insulation], THICKNESSES).map((t) => ({ id: String(t), label: `${inchLabel(t)} insulation` })),
    ...INSULATIONS.filter((m) => m.id !== s.insulation).map((m) => ({ id: `mat:${m.id}`, label: `${m.label} (design)` })),
  ]

  const toolbar = (
    <div className="sim-toolbar" role="toolbar" aria-label="View">
      {!compare && (
        <Segmented<'ins' | 'bare'>
          size="sm"
          label="Insulated or bare"
          value={bare ? 'bare' : 'ins'}
          onChange={(v) => setBare(v === 'bare')}
          options={[{ id: 'ins', label: 'Insulated' }, { id: 'bare', label: 'Bare' }]}
        />
      )}
      <button className="tool present-btn" aria-label="Present" onClick={() => { setStep(0); setPresent(true) }}>
        <Icon name="spark" size={16} /> <span>Present</span>
      </button>
      <button className={`tool ${compare ? 'on' : ''}`} aria-pressed={compare} aria-label="Compare" onClick={() => setCompare(!compare)}>
        <Icon name="compare" size={16} /> <span>Compare</span>
      </button>
      <button
        className={`tool ${thermal ? 'on' : ''}`} aria-pressed={thermal} aria-label="Thermal" onClick={() => setThermal(!thermal)}
        disabled={s.component === 'elbow' || s.component === 'tee'}
        title={s.component === 'elbow' || s.component === 'tee' ? 'Thermal view covers straight runs, valves and flanges' : undefined}
      >
        <Icon name="thermo" size={16} /> <span>Thermal</span>
      </button>
      <Segmented<'installed' | 'cutaway'>
        size="sm"
        label="View"
        value={view}
        onChange={setView}
        options={[{ id: 'installed', label: 'Installed' }, { id: 'cutaway', label: 'Cutaway' }]}
      />
    </div>
  )

  const compareBar = compare && (
    <div className="compare-config">
      {slots[mode].map((slot, i) => (
        <label key={i}>
          <span>{['Left', slots[mode].length === 3 ? 'Middle' : 'Right', 'Right'][i]}</span>
          <select
            value={String(slot)}
            onChange={(e) => {
              const v = e.target.value
              const next: Slot = v === 'bare' || v === 'current' || v === 'recommended' || v.startsWith('mat:') ? (v as Slot) : Number(v)
              setSlots((prev) => ({ ...prev, [mode]: prev[mode].map((x, j) => (j === i ? next : x)) }))
            }}
          >
            {slotOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
      ))}
      <button
        className="tool"
        onClick={() => setSlots((prev) => ({ ...prev, [mode]: prev[mode].length === 3 ? prev[mode].slice(0, 2) : [...prev[mode], 'recommended'] }))}
      >
        {slots[mode].length === 3 ? 'Two panels' : 'Three panels'}
      </button>
    </div>
  )

  const r = ev.ins.result
  const m = ev.ins.moisture
  const statusPill = (
    <div className="status-pill" style={{ '--acc': acc } as React.CSSProperties}>
      {mode === 'hot' ? <SafetyChip safe={r.surfaceF <= s.ppF} small /> : <StatusChip status={ev.ins.status} mode={mode} small />}
      <span>
        Surface <b>{fmt.temp(r.surfaceF, units)}</b>
        {mode !== 'hot' && <> · Dew point <b>{fmt.temp(m.dewF, units)}</b></>}
        {mode === 'hot' && <> · Loss <b>{fmt.flow(r.qBtuHrFt, units)}</b> {fmt.flowUnit(units)}</>}
      </span>
    </div>
  )

  const legend = thermal && s.component !== 'elbow' && s.component !== 'tee' && (
    <div className={`thermal-legend ${mode === 'hot' ? 'hot' : 'cold'} ${compare ? 'over-compare' : ''}`} aria-label="Thermal colour scale">
      <div className="tl-bar" />
      <div className="tl-ticks">
        <span>{fmt.temp(mode === 'hot' ? s.ambientF : s.processF, units)}</span>
        {mode !== 'hot' && <span className="tl-dew">dew-point line {fmt.temp(m.dewF, units)}</span>}
        <span>{fmt.temp(mode === 'hot' ? s.processF : s.ambientF, units)}</span>
      </div>
    </div>
  )

  const unitToggle = (
    <Segmented<UnitSystem> size="sm" label="Units" value={units} onChange={setUnits} options={[{ id: 'ip', label: '°F' }, { id: 'si', label: '°C' }]} />
  )

  const stage = (
    <Stage
      s={s}
      mode={mode}
      panels={panels}
      opts={{ view, thermal: thermal && !present, stage: stages[mode], mobile, units, autoRotate: present }}
      bare={ev.bare}
      inset={{ left: insetLeft, right: insetRight }}
      sync={sync}
    />
  )

  const results = (
    <ResultsPanel
      mode={mode} s={s} ev={ev} recs={recs} units={units} compact={mobile}
      onApply={(t) => set({ thicknessIn: t })}
      onSet={set}
      onCompareMaterial={(id) => {
        setSlots((prev) => ({ ...prev, [mode]: ['current', `mat:${id}`] }))
        setCompare(true)
      }}
      onUseMaterial={(next) => set({ insulation: next.insulation, kProduct: next.kProduct, jacket: next.jacket, facing: next.facing, thicknessIn: next.thicknessIn })}
    />
  )

  if (present) {
    let preparedFor = ''
    try { preparedFor = localStorage.getItem('il.report.for') ?? '' } catch { /* private mode */ }
    return (
      <div className="sim presenting-root" style={{ '--acc': acc } as React.CSSProperties}>
        {stage}
        <Presentation mode={mode} s={s} ev={ev} units={units} step={step} setStep={setStep} onExit={() => setPresent(false)} preparedFor={preparedFor} />
      </div>
    )
  }

  if (mobile) {
    return (
      <div className="sim is-mobile" style={{ '--acc': acc } as React.CSSProperties}>
        <div className="sim-mobile-stage">
          {stage}
          {statusPill}
          {legend}
          <div className="sim-toolbar-wrap">{toolbar}</div>
        </div>
        <section className={`sheet sim-sheet ${sheetOpen ? 'open' : ''}`} aria-label="Simulator controls">
          <button className="sheet-handle" onClick={() => setSheetOpen(!sheetOpen)} aria-label={sheetOpen ? 'Collapse panel' : 'Expand panel'}><i /></button>
          <div className="sheet-head">
            <div className="tabs" role="tablist">
              {(['results', 'setup', 'learn'] as const).map((t) => (
                <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => { setTab(t); setSheetOpen(true) }}>
                  {t === 'results' ? 'Results' : t === 'setup' ? 'Setup' : 'Learn'}
                </button>
              ))}
            </div>
            <Scenarios mode={mode} s={s} onLoad={loadScenario} />
            {unitToggle}
          </div>
          <div className="sheet-presets"><PresetGrid mode={mode} active={s.presetId} onPick={pickPreset} /></div>
          <div className="sheet-body">
            {compareBar}
            {tab === 'results' ? results : tab === 'setup' ? <SetupPanel mode={mode} s={s} set={set} units={units} /> : <Learn mode={mode} />}
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="sim" style={{ '--acc': acc } as React.CSSProperties}>
      {stage}
      <div className="sim-overlay" style={{ left: insetLeft, right: insetRight }}>
        {statusPill}
        {compareBar}
        {legend}
        <div className="sim-toolbar-wrap">{toolbar}</div>
      </div>
      <aside className="panel sim-setup">
        <header className="sim-head">
          <span className="brand"><Icon name="layers" size={15} /> Insulation Library</span>
          <div className="title-row">
            <span className="mode-icon"><Icon name={mode === 'hot' ? 'flame' : mode === 'cold' ? 'snow' : 'drop'} size={26} /></span>
            <div>
              <h1>{TITLE[mode]}</h1>
              <p className="sub">{SUB[mode]}</p>
            </div>
          </div>
        </header>
        <section>
          <h2>Start from a preset</h2>
          <PresetGrid mode={mode} active={s.presetId} onPick={pickPreset} />
          {s.presetId && <PresetNote id={s.presetId} />}
        </section>
        <SetupPanel mode={mode} s={s} set={set} units={units} />
      </aside>
      <aside className="panel sim-results">
        <header>
          <h2 className="title">Results</h2>
          <div className="hdr-right">
            <ReportButton make={() => ({ mode, s, ev, design: recs.primary, others: recs.others, units })} />
            <Scenarios mode={mode} s={s} onLoad={loadScenario} />
            {unitToggle}
          </div>
        </header>
        <div className="scroll">{results}</div>
      </aside>
    </div>
  )
}
