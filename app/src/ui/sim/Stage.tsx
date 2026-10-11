import { useDeferredValue, useMemo } from 'react'
import { CamSync, Viewer } from '../../scene/Viewer'
import type { SimVisual, ZoneState } from '../../scene/effects'
import type { Side } from '../../sim/model'
import type { SimMode, SimState } from '../../sim/types'
import { rayIntensity, systemFor } from '../../sim/model'
import { fmt, inchLabel, type UnitSystem } from '../../sim/units'
import { StatusChip } from './Status'

export interface PanelSpec {
  key: string
  title: string
  side: Side
  /** Thickness used to build the model (bare panels keep the current one, hidden). */
  modelThickness: number
  bare: boolean
  note?: string
}

export interface StageOpts {
  view: 'installed' | 'cutaway'
  thermal: boolean
  stage: 'studio' | 'plant'
  mobile: boolean
  units: UnitSystem
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

function SimViewer({ s, mode, panel, bare, opts, sync, inset, coverage }: {
  s: SimState
  mode: SimMode
  panel: PanelSpec
  bare: Side
  opts: StageOpts
  sync?: { group: CamSync; id: number }
  inset: { left: number; right: number }
  coverage?: number
}) {
  const sys = systemFor(s, mode)
  // geometry rebuilds can lag a fast slider; the numbers never do
  const thickness = useDeferredValue(panel.modelThickness)
  const nps = useDeferredValue(s.npsIndex)
  const fittingBare = (s.component === 'valve' || s.component === 'flange') && s.fittingCover === 'none'
  const thermal = opts.thermal && s.component !== 'elbow' && s.component !== 'tee'
  const sim = useMemo(() => visualFor(panel.side, bare, mode, thermal, fittingBare), [panel.side, bare, mode, thermal, fittingBare])
  return (
    <Viewer
      insulation={s.insulation}
      npsIndex={nps}
      thicknessIn={thickness}
      jacket={sys.jacketId}
      facing={sys.facing}
      service={sys.service}
      view={opts.view}
      component={s.component}
      stage={opts.stage}
      mobile={opts.mobile}
      sim={{ ...sim, bare: panel.bare }}
      sync={sync}
      insetLeft={inset.left}
      insetRight={inset.right}
      coverage={coverage}
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
  inset: { left: number; right: number }
  sync: CamSync
}) {
  if (panels.length === 1) {
    return (
      <div className="sim-stage single">
        <SimViewer s={s} mode={mode} panel={panels[0]} bare={bare} opts={opts} inset={inset} />
      </div>
    )
  }
  return (
    <div className={`sim-stage compare n${panels.length}`} style={opts.mobile ? undefined : { left: inset.left, right: inset.right }}>
      {panels.map((p, i) => (
        <div key={p.key} className="compare-pane">
          <SimViewer s={s} mode={mode} panel={p} bare={bare} opts={opts} inset={{ left: 0, right: 0 }} sync={{ group: sync, id: i }} coverage={opts.mobile ? 0.62 : panels.length === 3 ? 0.5 : 0.62} />
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
