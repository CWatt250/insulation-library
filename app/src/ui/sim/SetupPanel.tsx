import { INSULATIONS, INSULATION, JACKETS, snapThickness, thicknessesFor, type OuterJacketId } from '../../data/catalog'
import { NPS, THICKNESSES } from '../../data/pipe'
import { presetsFor, type Preset } from '../../sim/presets'
import { availability, kProducts, productForTemp, systemFor } from '../../sim/model'
import { outerSurface } from '../../sim/emittance'
import type { MetalFinish, SimMode, SimState, VrQuality } from '../../sim/types'
import { fmt, inchLabel, type UnitSystem } from '../../sim/units'
import { Disclosure, Icon, Segmented, Slider } from '../controls'

export const ACCENT: Record<SimMode, string> = { hot: '#ff8a3d', cold: '#8fd0ff', condensate: '#14b8a6' }

const RANGES: Record<SimMode, { process: [number, number]; ambient: [number, number] }> = {
  hot: { process: [90, 1000], ambient: [30, 120] },
  cold: { process: [-40, 75], ambient: [40, 110] },
  condensate: { process: [33, 75], ambient: [50, 110] },
}

const PRESET_ICON: Record<SimMode, 'flame' | 'snow' | 'drop'> = { hot: 'flame', cold: 'snow', condensate: 'drop' }

export function PresetGrid({ mode, active, onPick }: { mode: SimMode; active: string | null; onPick: (p: Preset) => void }) {
  return (
    <div className="presets" role="list">
      {presetsFor(mode).map((p) => (
        <button key={p.id} role="listitem" className={`preset ${p.id === active ? 'on' : ''}`} onClick={() => onPick(p)} aria-pressed={p.id === active} title={p.blurb}>
          <span className="preset-icon"><Icon name={PRESET_ICON[mode]} size={16} /></span>
          <span className="preset-text">
            <strong>{p.label}</strong>
            <small>{p.set.processF}°F pipe{mode !== 'hot' ? ` · ${p.set.rh ?? 50}% RH` : ''}</small>
          </span>
        </button>
      ))}
    </div>
  )
}

function finishLabel(j: OuterJacketId, facing: 'asj' | 'none', ins: string) {
  if (j !== 'none') return JACKETS[j].label
  if (facing === 'asj') return 'ASJ facing'
  return ins === 'elastomeric' ? 'Foam skin (no jacket)' : 'No jacket'
}

export function SetupPanel({ mode, s, set, units }: { mode: SimMode; s: SimState; set: (p: Partial<SimState>) => void; units: UnitSystem }) {
  const acc = ACCENT[mode]
  const ins = INSULATION[s.insulation]
  const sys = systemFor(s, mode)
  const maxT = ins.maxThicknessIn
  const thicknesses = thicknessesFor(ins, THICKNESSES)
  const r = RANGES[mode]
  const surface = outerSurface({ insulation: s.insulation, jacket: sys.jacketId, facing: sys.facing, membrane: sys.membrane, metalFinish: s.metalFinish })
  const products = kProducts(s.insulation)
  const metal = sys.jacketId === 'alu-smooth' || sys.jacketId === 'alu-stucco' || sys.jacketId === 'ss'
  const facingLocked = mode !== 'hot' && ins.vapor.kind === 'facing'

  const pickMaterial = (id: typeof s.insulation) => {
    const next = INSULATION[id]
    set({
      insulation: id,
      kProduct: productForTemp(id, s.processF),
      thicknessIn: snapThickness(next, s.thicknessIn, THICKNESSES),
      jacket: next.jackets.includes(s.jacket) ? s.jacket : next.jackets[0],
      facing: next.facings.includes(s.facing) ? s.facing : next.facings[0],
    })
  }

  return (
    <div className="setup">
      <section>
        <h2>Conditions</h2>
        <Slider
          label={mode === 'hot' ? 'Process temperature' : 'Pipe / fluid temperature'}
          value={s.processF}
          min={r.process[0]}
          max={r.process[1]}
          step={mode === 'hot' ? 5 : 1}
          onChange={(v) => set({ processF: v })}
          format={(v) => fmt.temp(v, units)}
          accent={acc}
        />
        <Slider
          label="Ambient air temperature"
          value={s.ambientF}
          min={r.ambient[0]}
          max={r.ambient[1]}
          onChange={(v) => set({ ambientF: v })}
          format={(v) => fmt.temp(v, units)}
          accent={acc}
        />
        {mode !== 'hot' && (
          <Slider label="Relative humidity" value={s.rh} min={10} max={98} onChange={(v) => set({ rh: v })} format={(v) => `${v}%`} accent={acc} />
        )}
        <Slider
          label="Pipe size"
          value={s.npsIndex}
          values={NPS.map((_, i) => i)}
          onChange={(v) => set({ npsIndex: v })}
          format={(v) => `NPS ${NPS[v].nps}"`}
          hint={<span>Steel pipe · {fmt.inches(NPS[s.npsIndex].od, units)} OD</span>}
          accent={acc}
        />
      </section>

      <section>
        <h2>Component</h2>
        <Segmented<SimState['component']>
          size="sm"
          label="Component"
          value={s.component}
          onChange={(v) => set({ component: v })}
          options={[
            { id: 'straight', label: 'Straight' },
            { id: 'elbow', label: 'Elbow' },
            { id: 'tee', label: 'Tee' },
            { id: 'valve', label: 'Valve' },
            { id: 'flange', label: 'Flanges' },
          ]}
        />
        {(s.component === 'valve' || s.component === 'flange') && (
          <div className="field">
            <span className="field-label">{s.component === 'valve' ? 'Valve' : 'Flange'} cover</span>
            <Segmented<SimState['fittingCover']>
              size="sm"
              value={s.fittingCover}
              onChange={(v) => set({ fittingCover: v })}
              options={[{ id: 'blanket', label: 'Removable blanket' }, { id: 'none', label: 'Left bare' }]}
            />
          </div>
        )}
      </section>

      <section>
        <h2>Insulation</h2>
        <div className="materials sim-materials">
          {INSULATIONS.map((m) => {
            const a = availability(m.id, mode)
            return (
              <button
                key={m.id}
                className={`mat ${m.id === s.insulation ? 'on' : ''}`}
                disabled={!a.ok}
                title={a.reason}
                onClick={() => pickMaterial(m.id)}
              >
                <span className="swatch" style={{ background: m.swatch }} />
                {m.label}
              </button>
            )
          })}
        </div>
        <Slider
          label="Insulation thickness"
          value={s.thicknessIn}
          values={thicknesses}
          onChange={(v) => set({ thicknessIn: v })}
          format={(v) => (units === 'ip' ? inchLabel(v) : fmt.inches(v, units))}
          hint={ins.thicknesses ? <span>{ins.label}: {s.insulation === 'aerogel' ? `${Math.round(s.thicknessIn / 0.3937)} × 10 mm wraps` : 'tube wall sizes'}</span> : maxT < 4 ? <span>{ins.label} is modelled up to {inchLabel(maxT)}</span> : undefined}
          accent={acc}
        />
        <div className="field">
          <span className="field-label">Outer finish</span>
          <div className="chips">
            {ins.jackets.map((j) => (
              <button key={j} className={j === sys.jacketId ? 'on' : ''} onClick={() => set({ jacket: j })}>
                {finishLabel(j, sys.facing, s.insulation)}
              </button>
            ))}
          </div>
          {ins.facings.length > 1 && (
            <div className="chips sub">
              {ins.facings.map((f) => (
                <button
                  key={f}
                  className={f === sys.facing ? 'on' : ''}
                  disabled={facingLocked && f !== 'asj'}
                  title={facingLocked && f !== 'asj' ? 'Below ambient the ASJ is the vapor retarder, so it stays' : undefined}
                  onClick={() => set({ facing: f })}
                >
                  {f === 'asj' ? 'ASJ-faced' : 'Plain (unfaced)'}
                </button>
              ))}
            </div>
          )}
          <p className="field-note">
            Surface emittance {(s.emittanceOverride ?? surface.value).toFixed(2)} · {s.emittanceOverride !== null ? 'custom' : surface.label}
          </p>
        </div>
      </section>

      {mode !== 'hot' && (
        <section>
          <h2>Vapor retarder quality</h2>
          <Segmented<VrQuality>
            label="Vapor retarder quality"
            value={s.vr}
            onChange={(v) => set({ vr: v })}
            options={[
              { id: 'ideal', label: 'Ideal' },
              { id: 'good', label: 'Good' },
              { id: 'fair', label: 'Fair' },
              { id: 'poor', label: 'Poor' },
            ]}
          />
          <p className="field-note">
            {sys.vaporBy === 'integral' ? 'Closed-cell foam is its own retarder — glue every seam.'
              : sys.vaporBy === 'facing' ? 'The ASJ facing is the retarder — seal every lap and butt strip.'
              : sys.vaporBy === 'membrane' ? 'A separate sealed membrane is the retarder.'
              : 'No vapor retarder in this build-up.'}
          </p>
        </section>
      )}

      <Disclosure title="Advanced settings">
        <Slider
          label="Wind / air speed" value={s.windMph} min={0} max={30} step={0.5} onChange={(v) => set({ windMph: v })}
          format={(v) => (v === 0 ? 'Still air' : units === 'ip' ? `${v} mph` : `${(v * 0.44704).toFixed(1)} m/s`)}
          hint="NIA: if unknown, 0 mph is the worst case; for energy, about 1 mph indoors and 8 mph outdoors."
          accent={acc}
        />
        {metal && (
          <div className="field">
            <span className="field-label">Metal jacket surface</span>
            <Segmented<MetalFinish>
              size="sm"
              value={s.metalFinish}
              onChange={(v) => set({ metalFinish: v })}
              options={[{ id: 'oxidized', label: 'In service' }, { id: 'bright', label: 'New, bright' }, { id: 'painted', label: 'Painted' }]}
            />
          </div>
        )}
        <div className="field">
          <span className="field-label">Emittance</span>
          <Segmented<'auto' | 'custom'>
            size="sm"
            value={s.emittanceOverride === null ? 'auto' : 'custom'}
            onChange={(v) => set({ emittanceOverride: v === 'auto' ? null : surface.value })}
            options={[{ id: 'auto', label: 'From finish' }, { id: 'custom', label: 'Custom' }]}
          />
          {s.emittanceOverride !== null && (
            <Slider label="Surface emittance" value={s.emittanceOverride} min={0.03} max={0.95} step={0.01} onChange={(v) => set({ emittanceOverride: v })} format={(v) => v.toFixed(2)} accent={acc} />
          )}
        </div>
        {products.length > 1 && (
          <div className="field">
            <span className="field-label">k-value curve from</span>
            <div className="chips">
              {products.map((p) => (
                <button key={p.index} className={(products.find((x) => x.index === s.kProduct) ?? products[0]).index === p.index ? 'on' : ''} onClick={() => set({ kProduct: p.index })}>
                  {p.product.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {mode === 'hot' ? (
          <Slider label="Safe-touch limit (personnel protection)" value={s.ppF} min={100} max={180} onChange={(v) => set({ ppF: v })} format={(v) => fmt.temp(v, units)} accent={acc} />
        ) : (
          <Slider label="Required margin above dew point" value={s.dewMarginF} min={0} max={10} step={0.25} hint="3E Plus and NIA use 0.75°F." onChange={(v) => set({ dewMarginF: v })} format={(v) => fmt.margin(v, units)} accent={acc} />
        )}
        {mode !== 'condensate' && (
          <Slider
            label={mode === 'hot' ? 'Target max surface temperature' : 'Target min surface temperature'}
            value={s.targetSurfaceF}
            min={mode === 'hot' ? 80 : 40}
            max={mode === 'hot' ? 200 : 100}
            onChange={(v) => set({ targetSurfaceF: v })}
            format={(v) => fmt.temp(v, units)}
            accent={acc}
          />
        )}
        {mode !== 'condensate' && (
          <Slider label={mode === 'hot' ? 'Heat-loss target' : 'Heat-gain target'} value={s.targetQ} min={1} max={mode === 'hot' ? 300 : 60} onChange={(v) => set({ targetQ: v })} format={(v) => `${fmt.flow(v, units)} ${fmt.flowUnit(units)}`} accent={acc} />
        )}
        {mode !== 'condensate' && (
          <div className="field econ">
            <span className="field-label">Energy cost <small className="muted">your rates — defaults are examples</small></span>
            {mode === 'hot' ? (
              <>
                <Segmented<SimState['fuel']>
                  size="sm"
                  value={s.fuel}
                  onChange={(v) => set({ fuel: v, fuelPrice: v === 'electric' ? 0.12 : s.fuel === 'electric' ? 8 : s.fuelPrice })}
                  options={[{ id: 'gas', label: 'Natural gas' }, { id: 'steam', label: 'Purchased steam' }, { id: 'electric', label: 'Electric' }]}
                />
                {s.fuel === 'electric' ? (
                  <Slider label="Electricity price" value={s.fuelPrice} min={0.03} max={0.4} step={0.005} onChange={(v) => set({ fuelPrice: v })} format={(v) => `$${v.toFixed(3)}/kWh`} accent={acc} />
                ) : (
                  <Slider label={s.fuel === 'gas' ? 'Gas price' : 'Steam price'} value={s.fuelPrice} min={1} max={40} step={0.25} onChange={(v) => set({ fuelPrice: v })} format={(v) => `$${v.toFixed(2)}/MMBtu`} accent={acc} />
                )}
                <Slider label="Plant conversion efficiency" value={s.efficiencyPct} min={40} max={100} onChange={(v) => set({ efficiencyPct: v })} format={(v) => `${v}%`} accent={acc} />
              </>
            ) : (
              <>
                <Slider label="Electricity price" value={s.coolPrice} min={0.03} max={0.4} step={0.005} onChange={(v) => set({ coolPrice: v })} format={(v) => `$${v.toFixed(3)}/kWh`} accent={acc} />
                <Slider label="Cooling plant efficiency" value={s.kwPerTon} min={0.3} max={2} step={0.05} onChange={(v) => set({ kwPerTon: v })} format={(v) => `${v.toFixed(2)} kW/ton`} accent={acc} />
              </>
            )}
            <Slider label="Installed cost (for payback)" value={s.installedPerFt} min={0} max={150} step={1} onChange={(v) => set({ installedPerFt: v })} format={(v) => (v === 0 ? 'Off' : `$${v}/ft`)} accent={acc} />
          </div>
        )}
        <Slider label="Pipe run length" value={s.lengthFt} min={0} max={2000} step={10} onChange={(v) => set({ lengthFt: v })} format={(v) => (v === 0 ? 'Off' : fmt.length(v, units))} accent={acc} />
        <Slider label="Operating hours per year" value={s.hours} min={0} max={8760} step={20} onChange={(v) => set({ hours: v })} format={(v) => (v === 0 ? 'Off' : `${v.toLocaleString('en-US')} h`)} hint={s.hours === 8760 ? 'Year-round' : undefined} accent={acc} />
      </Disclosure>
    </div>
  )
}
