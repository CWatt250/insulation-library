import { useDeferredValue, useMemo } from 'react'
import { CamSync, Viewer } from '../../scene/Viewer'
import type { SimVisual, ZoneState } from '../../scene/effects'
import type { Side } from '../../sim/model'
import type { SimMode, SimState } from '../../sim/types'
import { rayIntensity, systemFor } from '../../sim/model'
import { fmt, inchLabel, type UnitSystem } from '../../sim/units'
import { StatusChip } from './Status'
import { pipeSpec } from '../../data/pipes'
import { installedIn } from '../../sim/duct'
import { noun } from '../../sim/system'

export interface PanelSpec {
  key: string
  title: string
  side: Side
  /** Thickness used to build the model (bare panels keep the current one, hidden). */
  modelThickness: number
  bare: boolean
  note?: string
  /** A different system for this panel (another material); defaults to the current one. */
  state?: SimState
}

export interface StageOpts {
  autoRotate?: boolean
  view: 'installed' | 'cutaway'
  thermal: boolean
  stage: 'studio' | 'plant'
  mobile: boolean
  units: UnitSystem
  /** Bump to frame the model again (Reset view). */
  resetKey?: number
  /** The viewer moved the camera (shows Reset view). */
  onUserMove?: () => void
}

/** Pixels of the stage covered by panels (desktop) or by bars and controls (phone). */
export type StageInset = { left: number; right: number; top?: number; bottom?: number }

/** What the bare stub is doing, in words: the status pill speaks for the insulated run. */
function stubTag(s: SimState, bare: Side, mode: SimMode, units: UnitSystem): SimVisual['stubTag'] {
  const what = `Bare ${noun(s)}`
  if (mode === 'hot') return { text: `${what} · ${fmt.temp(bare.result.surfaceF, units)}`, tone: 'hot' }
  const m = bare.moisture
  if (!m.condensing) return { text: `${what} – dry`, tone: 'dry' }
  return m.frost ? { text: `${what} – frosting`, tone: 'frost' } : { text: `${what} – sweating`, tone: 'wet' }
}

/** What one side of the calculation looks like on screen. */
export function zoneOf(side: Side, mode: SimMode): ZoneState {
  const m = side.moisture
  return {
    intensity: rayIntensity(side, mode),
    status: side.status,
    condensing: m.condensing,
    rate: m.rateGm2h,
    frost: m.frost,
  }
}

/** Simulation overlays for one panel: its own surface, the bare stubs past the insulation, and any fitting. */
export function visualFor(side: Side, bare: Side, mode: SimMode, thermal: boolean, fittingBare: boolean): SimVisual {
  const r = side.result
  const rPipe = side.input.pipeOd / 2
  const rOut = side.input.layers.length ? side.input.layers[side.input.layers.length - 1].rOut : rPipe
  const span = Math.log(rOut / rPipe) || 1
  return {
    ...zoneOf(side, mode),
    mode,
    bare: side.thicknessIn === null,
    thermal,
    processF: side.input.processF,
    ambientF: side.input.ambientF,
    surfaceF: r.surfaceF,
    dewF: side.moisture.dewF,
    profile: r.profile.map((p) => ({ s: Math.log(p.r / rPipe) / span, tF: p.tF })),
    stub: side.thicknessIn === null ? null : zoneOf(bare, mode),
    // the covered fitting is shown at the run's flux; a bare fitting at the bare pipe's
    fitting: fittingBare || side.thicknessIn === null ? zoneOf(bare, mode) : zoneOf(side, mode),
    fittingBare,
  }
}

function SimViewer({ s, mode, panel, bare, opts, sync, inset, coverage, frameRadius }: {
  s: SimState
  mode: SimMode
  panel: PanelSpec
  bare: Side
  opts: StageOpts
  sync?: { group: CamSync; id: number }
  inset: StageInset
  coverage?: number
  frameRadius?: number
}) {
  s = panel.state ?? s
  const sys = systemFor(s, mode)
  // geometry rebuilds can lag a fast slider; the numbers never do
  const thickness = useDeferredValue(panel.modelThickness)
  const nps = useDeferredValue(s.npsIndex)
  const fittingBare = (s.component === 'valve' || s.component === 'flange') && s.fittingCover === 'none'
  const duct = s.system === 'duct'
  const thermal = opts.thermal && !duct && s.component !== 'elbow' && s.component !== 'tee'
  const ductProps = duct
    ? {
      shape: s.ductShape, w: s.ductW * 0.0254, h: s.ductH * 0.0254, d: s.ductD * 0.0254,
      t: installedIn(s.ductIns, thickness) * 0.0254, insulation: s.ductIns === 'elastomeric' ? 'elastomeric' as const : 'wrap' as const,
    }
    : undefined
  // side-by-side panes carry their own labels; a single view tags the stub
  const tag = frameRadius === undefined ? stubTag(s, bare, mode, opts.units) : undefined
  const sim = useMemo(() => ({ ...visualFor(panel.side, bare, mode, thermal, fittingBare), stubTag: tag }), [panel.side, bare, mode, thermal, fittingBare, tag?.text, tag?.tone]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Viewer
      duct={ductProps}
      insulation={duct ? (s.ductIns === 'elastomeric' ? 'elastomeric' : 'fiberglass') : s.insulation}
      npsIndex={nps}
      thicknessIn={thickness}
      jacket={duct ? (s.ductIns === 'elastomeric' ? 'none' : 'fsk') : sys.jacketId}
      facing={sys.facing}
      service={sys.service}
      view={opts.view}
      component={duct ? 'straight' : s.component}
      pipe={s.pipe}
      stage={opts.stage}
      mobile={opts.mobile}
      sim={{ ...sim, bare: panel.bare }}
      sync={sync}
      insetLeft={inset.left}
      insetRight={inset.right}
      insetTop={inset.top}
      insetBottom={inset.bottom}
      resetKey={opts.resetKey}
      onUserMove={opts.onUserMove}
      coverage={coverage}
      frameRadius={frameRadius}
      autoRotate={opts.autoRotate}
    />
  )
}

export function Stage({ s, mode, panels, bare, opts, inset, sync }: {
  s: SimState
  mode: SimMode
  panels: PanelSpec[]
  /** The bare-pipe case, for the pipe stubs past the insulation. */
  bare: Side
  opts: StageOpts
  inset: StageInset
  sync: CamSync
}) {
  if (panels.length === 1) {
    return (
      <div className="sim-stage single">
        <SimViewer s={s} mode={mode} panel={panels[0]} bare={bare} opts={opts} inset={inset} />
      </div>
    )
  }
  // frame every panel for the largest model in the row so the views line up
  const frameRadius = Math.max(...panels.map((p) => {
    const st = p.state ?? s
    if (st.system === 'duct') return ((st.ductShape === 'round' ? st.ductD : Math.max(st.ductW, st.ductH)) / 2 + installedIn(st.ductIns, p.modelThickness) + 0.1) * 0.0254
    return (pipeSpec(st.pipe, st.npsIndex).od / 2 + p.modelThickness + 0.1) * 0.0254
  }))
  return (
    <div className={`sim-stage compare n${panels.length}`} style={opts.mobile ? undefined : { left: inset.left, right: inset.right }}>
      {panels.map((p, i) => (
        <div key={p.key} className="compare-pane">
          <SimViewer s={s} mode={mode} panel={p} bare={bare} opts={opts} inset={{ left: 0, right: 0 }} sync={{ group: sync, id: i }} frameRadius={frameRadius} />
          <div className="pane-label">
            <strong>{p.title}</strong>
            <span>
              {mode === 'hot' ? 'Loss' : 'Gain'} {fmt.flow(Math.abs(p.side.result.qBtuHrFt), opts.units)} {fmt.flowUnit(opts.units)}
              {' · '}Surface {fmt.temp(p.side.result.surfaceF, opts.units)}
            </span>
            {mode !== 'hot' ? <StatusChip status={p.side.status} mode={mode} small /> : null}
            {p.note && <em>{p.note}</em>}
          </div>
        </div>
      ))}
    </div>
  )
}

export const thicknessTitle = (t: number | null) => (t === null ? 'Bare pipe' : `${inchLabel(t)} insulation`)
