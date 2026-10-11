import { useMemo, useState } from 'react'
import { CamSync } from '../../scene/Viewer'
import { currentMaterial, materialLabel, materials, maxThickness, noun, stateForAny, type MaterialId } from '../../sim/system'
import { evaluate, evaluateSide, physicsMode, recommend, thicknessOptions, type Goal } from '../../sim/model'
import { design } from '../../sim/design'
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
import { CodeChip, SafetyChip, StatusChip } from './Status'
import { DuctGuide } from './DuctGuide'
import { QuickStart, useQuickStart } from './QuickStart'

type Slot = 'bare' | 'current' | 'recommended' | number | `mat:${MaterialId}`

const DEFAULT_SLOTS: Record<SimMode, Slot[]> = {
  hot: ['bare', 'current'],
  cold: ['bare', 'current'],
  condensate: ['bare', 'current', 'recommended'],
  duct: ['bare', 'current'],
}

const TITLE: Record<SimMode, string> = { hot: 'Hot Pipe', cold: 'Cold Pipe', condensate: 'Condensate', duct: 'Ductwork' }
const SUB: Record<SimMode, string> = {
  hot: 'Heat loss, surface temperature and personnel protection',
  cold: 'Heat gain, dew point and condensation control',
  condensate: 'Sweating and dripping prevention',
  duct: 'Energy-code insulation by duct type and location, plus condensation',
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
    const st = { hot: initialState('hot'), cold: initialState('cold'), condensate: initialState('condensate'), duct: initialState('duct') }
    if (share) st[share.mode] = share.state
    return st
  })
  const loadScenario = (m: SimMode, state: SimState) => {
    setStates((prev) => ({ ...prev, [m]: state }))
    if (m !== mode) onMode(m)
  }
  const [stages, setStages] = useState<Record<SimMode, 'studio' | 'plant'>>({ hot: 'studio', cold: 'studio', condensate: 'studio', duct: 'studio' })
  const [view, setView] = useState<'installed' | 'cutaway'>('cutaway')
  const [thermal, setThermal] = useState(false)
  const [bare, setBare] = useState(false)
  const [compare, setCompare] = useState(false)
  const [slots, setSlots] = useState(DEFAULT_SLOTS)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [present, setPresent] = useState(false)
  const [step, setStep] = useState<PresentStep>(0)
  const [tab, setTab] = useState<'setup' | 'results' | 'learn'>('results')
  const help = useQuickStart(mode)
  const [guide, setGuide] = useState(() => mode === 'duct' && new URLSearchParams(location.search).get('guide') === '1')
  const sync = useMemo(() => new CamSync(), [])

  const s = states[mode]
  const set = (patch: Partial<SimState>) => setStates((prev) => ({ ...prev, [mode]: { ...prev[mode], ...patch } }))
  const guideEl = guide && mode === 'duct' ? <DuctGuide s={s} set={set} onClose={() => setGuide(false)} /> : null
  const pickPreset = (p: Preset) => {
    setStates((prev) => ({ ...prev, [mode]: applyPreset(prev[mode], p) }))
    setStages((prev) => ({ ...prev, [mode]: p.stage ?? 'studio' }))
  }

  // Ductwork has no hot/cold of its own: the physics runs by which way heat flows
  const beh = physicsMode(s, mode)
  const ev = useMemo(() => evaluate(s, beh), [s, beh])
  const recs: Recs = useMemo(() => {
    const primary = design(s, beh)
    const flow = (btuHrFt: number): Goal => ({ kind: 'qMax', btuHrFt })
    const others = mode === 'duct' ? [] : beh === 'hot'
      ? [
        { label: `Surface ≤ ${fmt.temp(s.targetSurfaceF, units)}`, rec: recommend(s, beh, { kind: 'surfaceMax', F: s.targetSurfaceF }) },
        { label: `Heat loss ≤ ${fmt.flow(s.targetQ, units)} ${fmt.flowUnit(units)}`, rec: recommend(s, beh, flow(s.targetQ)) },
      ]
      : beh === 'cold'
        ? [
          { label: `Surface ≥ ${fmt.temp(s.targetSurfaceF, units)}`, rec: recommend(s, beh, { kind: 'surfaceMin', F: s.targetSurfaceF }) },
          { label: `Heat gain ≤ ${fmt.flow(s.targetQ, units)} ${fmt.flowUnit(units)}`, rec: recommend(s, beh, flow(s.targetQ)) },
        ]
        : []
    return { primary, others }
  }, [s, mode, beh, units])

  // ---------------------------------------------------------------- panels
  const maxIn = maxThickness(s)
  const panels: PanelSpec[] = useMemo(() => {
    const list: Slot[] = present ? (step === 0 ? ['bare'] : step === 1 ? ['current'] : ['bare', 'current']) : compare ? slots[mode] : [bare ? 'bare' : 'current']
    return list.map((slot, i) => {
      if (slot === 'bare') return { key: `p${i}-bare`, title: `Bare ${noun(s)}`, side: ev.bare, modelThickness: s.thicknessIn, bare: true }
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
        const id = slot.slice(4) as MaterialId
        const r = stateForAny(s, mode, id)
        if ('reason' in r) return { key: `p${i}-${id}`, title: materialLabel(s, id), side: ev.bare, modelThickness: s.thicknessIn, bare: true, note: r.reason }
        const d = design(r.state, mode)
        const t = d.thicknessIn ?? maxThickness(r.state)
        const st = { ...r.state, thicknessIn: t }
        return { key: `p${i}-${id}-${t}`, title: `${materialLabel(s, id)} · ${inchLabel(t)}`, side: evaluateSide(st, mode, t), modelThickness: t, bare: false, state: st, note: d.thicknessIn === null ? 'Cannot meet the requirements within its range' : 'Design thickness' }
      }
      const t = Math.min(slot as number, maxIn)
      return { key: `p${i}-${t}`, title: thicknessTitle(t), side: evaluateSide(s, mode, t), modelThickness: t, bare: false }
    })
  }, [compare, slots, mode, bare, ev, s, recs, maxIn, present, step])

  const insetLeft = mobile || present ? 0 : 332
  const insetRight = mobile || present ? 0 : 392
  const acc = ACCENT[mode]

  const slotOptions: { id: string; label: string }[] = [
    { id: 'bare', label: `Bare ${noun(s)}` },
    { id: 'current', label: 'Current' },
    { id: 'recommended', label: 'Recommended' },
    ...thicknessOptions(s).map((t) => ({ id: String(t), label: `${inchLabel(t)} insulation` })),
    ...materials(s).filter((m) => m.id !== currentMaterial(s)).map((m) => ({ id: `mat:${m.id}`, label: `${m.label} (design)` })),
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
      {mode === 'duct' && (
        <button className="tool guide-tool" onClick={() => setGuide(true)} title="See where duct locations sit in a building and what each requires">
          <Icon name="map" size={16} /> <span>Location guide</span>
        </button>
      )}
      <button className="tool present-btn" onClick={() => { setStep(0); setPresent(true) }} title="Full-screen walkthrough for a customer: bare, insulated, side by side">
        <Icon name="spark" size={16} /> <span>Present</span>
      </button>
      <button className={`tool ${compare ? 'on' : ''}`} aria-pressed={compare} onClick={() => setCompare(!compare)} title="Show two or three versions side by side">
        <Icon name="compare" size={16} /> <span>Compare</span>
      </button>
      {mode !== 'duct' && <button
        className={`tool ${thermal ? 'on' : ''}`} aria-pressed={thermal} onClick={() => setThermal(!thermal)}
        disabled={s.system === 'duct' || s.component === 'elbow' || s.component === 'tee'}
        title={s.system === 'duct' ? 'Thermal view covers pipe; the duct faces are listed in Results' : s.component === 'elbow' || s.component === 'tee' ? 'Thermal view covers straight runs, valves and flanges' : undefined}
      >
        <Icon name="thermo" size={16} /> <span>Thermal</span>
      </button>}
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
      {mode === 'duct' ? <CodeChip s={s} ev={ev} /> : null}
      {beh === 'hot' ? (mode === 'duct' ? null : <SafetyChip safe={r.surfaceF <= s.ppF} small />) : <StatusChip status={ev.ins.status} mode={mode} small />}
      <span>
        Surface <b>{fmt.temp(r.surfaceF, units)}</b>
        {beh !== 'hot' && <> · Dew point <b>{fmt.temp(m.dewF, units)}</b></>}
        {beh === 'hot' && <> · Loss <b>{fmt.flow(r.qBtuHrFt, units)}</b> {fmt.flowUnit(units)}</>}
      </span>
    </div>
  )

  const legend = thermal && s.system !== 'duct' && s.component !== 'elbow' && s.component !== 'tee' && (
    <div className={`thermal-legend ${beh === 'hot' ? 'hot' : 'cold'} ${compare ? 'over-compare' : ''}`} aria-label="Thermal colour scale">
      <div className="tl-bar" />
      <div className="tl-ticks">
        <span>{fmt.temp(beh === 'hot' ? s.ambientF : s.processF, units)}</span>
        {beh !== 'hot' && <span className="tl-dew">dew-point line {fmt.temp(m.dewF, units)}</span>}
        <span>{fmt.temp(beh === 'hot' ? s.processF : s.ambientF, units)}</span>
      </div>
    </div>
  )

  const unitToggle = (
    <Segmented<UnitSystem> size="sm" label="Units" value={units} onChange={setUnits} options={[{ id: 'ip', label: '°F' }, { id: 'si', label: '°C' }]} />
  )

  const stage = (
    <Stage
      s={s}
      mode={beh}
      panels={panels}
      opts={{ view, thermal: thermal && !present, stage: stages[mode], mobile, units, autoRotate: present }}
      bare={ev.bare}
      inset={{ left: insetLeft, right: insetRight }}
      sync={sync}
    />
  )

  const results = (
    <ResultsPanel
      mode={beh} accent={acc} s={s} onGuide={mode === 'duct' ? () => setGuide(true) : undefined} ev={ev} recs={recs} units={units} compact={mobile}
      onApply={(t) => set({ thicknessIn: t })}
      onSet={set}
      onCompareMaterial={(id) => {
        setSlots((prev) => ({ ...prev, [mode]: ['current', `mat:${id}`] }))
        setCompare(true)
      }}
      onUseMaterial={(next) => set(next.system === 'duct' ? { ductIns: next.ductIns, thicknessIn: next.thicknessIn } : { insulation: next.insulation, kProduct: next.kProduct, jacket: next.jacket, facing: next.facing, thicknessIn: next.thicknessIn })}
    />
  )

  if (present) {
    let preparedFor = ''
    try { preparedFor = localStorage.getItem('il.report.for') ?? '' } catch { /* private mode */ }
    return (
      <div className="sim presenting-root" style={{ '--acc': acc } as React.CSSProperties}>
        {stage}
        <Presentation mode={beh} s={s} ev={ev} units={units} step={step} setStep={setStep} onExit={() => setPresent(false)} preparedFor={preparedFor} />
      </div>
    )
  }

  if (mobile) {
    return (
      <div className="sim is-mobile" style={{ '--acc': acc } as React.CSSProperties}>
        <div className="sim-mobile-stage">
          {stage}
          {statusPill}
          {help.isOpen && <QuickStart mode={mode} mobile onClose={help.close} />}
          {!help.isOpen && <button className="help-fab" aria-label="How it works" onClick={help.show}><Icon name="help" size={18} /></button>}
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
            {tab === 'results' ? results : tab === 'setup' ? <SetupPanel mode={mode} s={s} set={set} units={units} onGuide={() => setGuide(true)} /> : <Learn mode={mode} system={s.system} />}
          </div>
        </section>
        {guideEl}
      </div>
    )
  }

  return (
    <div className="sim" style={{ '--acc': acc } as React.CSSProperties}>
      {stage}
      <div className="sim-overlay" style={{ left: insetLeft, right: insetRight }}>
        {statusPill}
        {help.isOpen && !present && <QuickStart mode={mode} mobile={false} onClose={help.close} />}
        {compareBar}
        {legend}
        <div className="sim-toolbar-wrap">{toolbar}</div>
      </div>
      <aside className="panel sim-setup">
        <header className="sim-head">
          <span className="brand"><Icon name="layers" size={15} /> Insulation Library</span>
          <div className="title-row">
            <span className="mode-icon"><Icon name={mode === 'hot' ? 'flame' : mode === 'cold' ? 'snow' : mode === 'duct' ? 'wind' : 'drop'} size={26} /></span>
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
        <SetupPanel mode={mode} s={s} set={set} units={units} onGuide={() => setGuide(true)} />
      </aside>
      <aside className="panel sim-results">
        <header>
          <h2 className="title">Results</h2>
          <div className="hdr-right">
            <button className="tool" aria-label="How it works" title="How it works" onClick={help.show}><Icon name="help" size={15} /></button>
            <ReportButton make={() => ({ mode, s, ev, design: recs.primary, others: recs.others, units })} />
            <Scenarios mode={mode} s={s} onLoad={loadScenario} />
            {unitToggle}
          </div>
        </header>
        <div className="scroll">{results}</div>
      </aside>
      {guideEl}
    </div>
  )
}
