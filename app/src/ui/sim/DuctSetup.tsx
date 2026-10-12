import { DUCT_WRAP, ELASTOMERIC_SHEET } from '../../data/ductData'
import { DUCT_CODES, DUCT_INSULATIONS, DUCT_LOCATIONS, DUCT_SERVICES, DUCT_TYPES, ductSurface, ductThicknesses, installedIn, ratedR, type DuctCodeBasis, type DuctInsulation, type DuctType } from '../../sim/duct'
import { physicsMode } from '../../sim/model'
import type { SimMode, SimState } from '../../sim/types'
import { fmt, inchLabel, type UnitSystem } from '../../sim/units'
import { Icon, Segmented, Slider } from '../controls'
import { CodeChips } from './CodeChips'
import { WA_COUNTIES } from '../../data/wsecData'

const RECT_W = Array.from({ length: 28 }, (_, i) => 6 + 2 * i) // 6–60"
const RECT_H = Array.from({ length: 22 }, (_, i) => 6 + 2 * i) // 6–48"
const ROUND_D = [4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 36]

const SWATCH: Record<DuctInsulation, string> = { wrap75: '#e8c860', wrap100: '#e2bd55', wrap150: '#d9b048', elastomeric: '#2b2d2f' }

/** Duct shape and sheet-metal size. */
export function DuctSize({ s, set, units, acc }: { s: SimState; set: (p: Partial<SimState>) => void; units: UnitSystem; acc: string }) {
  const len = (v: number) => (units === 'ip' ? `${v}"` : `${Math.round(v * 25.4)} mm`)
  return (
    <>
      <div className="field">
        <span className="field-label">Duct shape</span>
        <Segmented<SimState['ductShape']>
          size="sm"
          label="Duct shape"
          value={s.ductShape}
          onChange={(v) => set({ ductShape: v })}
          options={[{ id: 'rect', label: 'Rectangular' }, { id: 'round', label: 'Round' }]}
        />
      </div>
      {s.ductShape === 'rect' ? (
        <>
          <Slider label="Duct width" value={s.ductW} values={RECT_W} onChange={(v) => set({ ductW: v })} format={len} accent={acc} />
          <Slider label="Duct height" value={s.ductH} values={RECT_H} onChange={(v) => set({ ductH: v })} format={len} hint="Galvanized sheet metal, horizontal run" accent={acc} />
        </>
      ) : (
        <Slider label="Duct diameter" value={s.ductD} values={ROUND_D} onChange={(v) => set({ ductD: v })} format={len} hint="Galvanized spiral duct, horizontal run" accent={acc} />
      )}
    </>
  )
}

/** Duct insulation, thickness, and the energy-code inputs. */
export function DuctInsulationSection({ s, set, mode, units, acc }: { s: SimState; set: (p: Partial<SimState>) => void; mode: SimMode; units: UnitSystem; acc: string }) {
  const list = ductThicknesses(s.ductIns)
  const pick = (id: DuctInsulation) => {
    const l = ductThicknesses(id)
    set({ ductIns: id, thicknessIn: l.reduce((b, x) => (Math.abs(x - s.thicknessIn) < Math.abs(b - s.thicknessIn) ? x : b), l[0]) })
  }
  const surf = ductSurface(s, true)
  const wrap = s.ductIns !== 'elastomeric'
  const inst = installedIn(s.ductIns, s.thicknessIn)
  return (
    <section>
      <h2>Insulation</h2>
      <div className="materials sim-materials">
        {DUCT_INSULATIONS.map((m) => (
          <button key={m.id} className={`mat ${m.id === s.ductIns ? 'on' : ''}`} onClick={() => pick(m.id)}>
            <span className="swatch" style={{ background: SWATCH[m.id] }} />
            {m.label}
          </button>
        ))}
      </div>
      <Slider
        label={wrap ? 'Wrap thickness (nominal)' : 'Sheet thickness'}
        value={s.thicknessIn}
        values={list}
        onChange={(v) => set({ thicknessIn: v })}
        format={(v) => (units === 'ip' ? inchLabel(v) : fmt.inches(v, units))}
        hint={wrap
          ? <span>Installed {fmt.inches(+inst.toFixed(3), units)} at 25% compression · R-{ratedR(s.ductIns, s.thicknessIn)} installed ({DUCT_WRAP.product})</span>
          : <span>R-{ratedR(s.ductIns, s.thicknessIn).toFixed(1)} · {ELASTOMERIC_SHEET.product}{s.thicknessIn > ELASTOMERIC_SHEET.plenumMaxIn ? ' · over 1": not 25/50 rated for plenums' : ''}</span>}
        accent={acc}
      />
      <p className="field-note">Outer surface: {surf.label}, emittance {(s.emittanceOverride ?? surf.value).toFixed(2)}{surf.note ? ` — ${surf.note}` : ''}</p>
      {physicsMode(s, mode) === 'hot' && s.processF > 120 && <p className="field-note">IMC 604.2: ducts above 120°F need enough insulation to hold the exposed surface at or below 120°F.</p>}
    </section>
  )
}

/** What the duct carries, where it runs and the climate zone: the inputs the energy codes use. */
export function DuctCodeInputs({ s, set, acc, onGuide }: { s: SimState; set: (p: Partial<SimState>) => void; acc: string; onGuide?: () => void }) {
  return (
    <>
      {onGuide && (
        <button className="tool guide-open" onClick={onGuide}>
          <Icon name="layers" size={15} /> Where does my duct run? Location guide
        </button>
      )}
      <div className="field">
        <span className="field-label">Energy code</span>
        <CodeChips<DuctCodeBasis> label="Energy code" value={s.ductCodeBasis} onChange={(v) => set({ ductCodeBasis: v })} options={DUCT_CODES} />
      </div>
      <div className="field">
        <span className="field-label">Duct type</span>
        <Segmented<DuctType> size="sm" label="Duct type" value={s.ductType} onChange={(v) => set({ ductType: v })} options={DUCT_TYPES.map((t) => ({ id: t.id, label: t.short }))} />
      </div>
      <div className="field">
        <span className="field-label field-label-row">Where it runs {onGuide && <button className="linkish" onClick={onGuide}><Icon name="map" size={13} /> Show me on a building</button>}</span>
        <div className="chips loc-chips">
          {DUCT_LOCATIONS.map((l) => (
            <button key={l.id} className={l.id === s.ductLocation ? 'on' : ''} onClick={() => set({ ductLocation: l.id })} title={l.label}>{l.label}</button>
          ))}
        </div>
      </div>
      {s.ductCodeBasis === 'ashrae' && (s.ductType === 'supply' || s.ductType === 'return') && (
        <div className="field">
          <span className="field-label">System serves <small className="muted">Table 6.8.2 rows</small></span>
          <Segmented<SimState['ductService']> size="sm" label="Duct service" value={s.ductService} onChange={(v) => set({ ductService: v })} options={DUCT_SERVICES.map((l) => ({ id: l.id, label: l.label }))} />
        </div>
      )}
      {s.ductCodeBasis === 'wsec' ? (
        <WsecInputs s={s} set={set} />
      ) : (
        <Slider label="Climate zone" value={s.climateZone} min={0} max={8} onChange={(v) => set({ climateZone: v })} format={(v) => `Zone ${v}`} hint="ASHRAE 169 / IECC climate zone of the building site" accent={acc} />
      )}
    </>
  )
}

/** Washington: county (→ zone 4C or 5B), and what WSEC needs to know about outdoor-air, exhaust and return ducts. */
export function WsecInputs({ s, set }: { s: SimState; set: (p: Partial<SimState>) => void }) {
  const zone = WA_COUNTIES.find((c) => c.county === s.waCounty)?.zone ?? '4C'
  const damperQ = s.ductType === 'outdoor' || s.ductType === 'exhaust'
  return (
    <>
      <label className="field">
        <span className="field-label">Washington county <small className="muted">sets the climate zone</small></span>
        <select className="big-select" value={s.waCounty} onChange={(e) => set({ waCounty: e.target.value })}>
          {WA_COUNTIES.map((c) => <option key={c.county} value={c.county}>{c.county} — zone {c.zone}</option>)}
        </select>
        <span className="field-note">Climate zone <b>{zone}</b> ({zone === '4C' ? 'marine' : 'dry'}) — WSEC Table C301.1</span>
      </label>
      {s.ductType === 'outdoor' && (
        <div className="field">
          <span className="field-label">How much air does the unit move?</span>
          <Segmented<'big' | 'small'> size="sm" label="Unit airflow" value={s.bigUnit ? 'big' : 'small'} onChange={(v) => set({ bigUnit: v === 'big' })} options={[{ id: 'big', label: '2,800 cfm or more' }, { id: 'small', label: 'Under 2,800 cfm' }]} />
        </div>
      )}
      {damperQ && (s.ductType !== 'outdoor' || s.bigUnit) && (
        <div className="field">
          <span className="field-label">Which part of the duct? <small className="muted">relative to the motorized shutoff damper</small></span>
          <Segmented<'upstream' | 'downstream'> size="sm" label="Damper position" value={s.ductDamper} onChange={(v) => set({ ductDamper: v })} options={[{ id: 'upstream', label: s.ductType === 'outdoor' ? 'Outside → damper' : 'Before the damper' }, { id: 'downstream', label: 'After the damper' }]} />
        </div>
      )}
      {(s.ductType === 'exhaust' || s.ductType === 'return') && (
        <label className="check-row"><input type="checkbox" checked={s.erv} onChange={(e) => set({ erv: e.target.checked })} /><span>Downstream of energy recovery <small className="muted">heat-recovery wheel, plate or coil</small></span></label>
      )}
    </>
  )
}
