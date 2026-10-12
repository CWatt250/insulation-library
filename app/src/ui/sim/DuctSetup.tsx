import { DUCT_POLYISO, DUCT_WRAP } from '../../data/ductData'
import { DUCT_CODES, DUCT_LOCATIONS, DUCT_SERVICES, DUCT_TYPES, boardFor, ductOutdoors, ductThicknesses, installedIn, isWrap, ratedR, type DuctCodeBasis, type DuctFacing, type DuctInsulation, type DuctType } from '../../sim/duct'
import { physicsMode } from '../../sim/model'
import type { SimMode, SimState } from '../../sim/types'
import { fmt, inchLabel, type UnitSystem } from '../../sim/units'
import { Icon, Segmented, Slider } from '../controls'
import { CodeChips } from './CodeChips'
import { WA_COUNTIES } from '../../data/wsecData'

const RECT_W = Array.from({ length: 28 }, (_, i) => 6 + 2 * i) // 6–60"
const RECT_H = Array.from({ length: 22 }, (_, i) => 6 + 2 * i) // 6–48"
const ROUND_D = [4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 36]


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

/**
 * Duct insulation (Johns Manville): indoors FSK duct wrap by density, or rigid
 * board with an FSK or ASJ facing; outdoors rigid board under an aluminum jacket,
 * set by the location. Thickness, with its installed R-value.
 */
export function DuctInsulationSection({ s, set, mode, units, acc }: { s: SimState; set: (p: Partial<SimState>) => void; mode: SimMode; units: UnitSystem; acc: string }) {
  const list = ductThicknesses(s.ductIns, s.ductShape)
  const pick = (id: DuctInsulation) => {
    const l = ductThicknesses(id, s.ductShape)
    set({ ductIns: id, thicknessIn: l.reduce((b, x) => (Math.abs(x - s.thicknessIn) < Math.abs(b - s.thicknessIn) ? x : b), l[0]) })
  }
  const outdoors = ductOutdoors(s)
  const wrap = isWrap(s.ductIns)
  const inst = installedIn(s.ductIns, s.thicknessIn)
  const R = ratedR(s.ductIns, s.thicknessIn, s.ductShape)
  const board = boardFor(s.ductShape)
  const round = s.ductShape === 'round'
  const poly = s.ductIns === 'polyiso'
  const type = s.ductIns === 'wrap100' ? '100' : s.ductIns === 'wrap150' ? '150' : '75'
  return (
    <section>
      <h2>Insulation</h2>
      {outdoors && !wrap ? (
        round ? (
          <p className="field-note">Outdoors: Micro-Flex under a 0.016" aluminum jacket, set by the location. JM's XSPECT polyiso is flat board for rectangular duct; pick an indoor location for duct wrap.</p>
        ) : (
          <div className="field">
            <span className="field-label">Insulation <small className="muted">under a 0.016" aluminum jacket</small></span>
            <Segmented<DuctInsulation> size="sm" label="Outdoor insulation" value={s.ductIns} onChange={pick} options={[{ id: 'polyiso', label: 'Polyiso (XSPECT)' }, { id: 'board', label: 'Fiberglass board' }]} />
          </div>
        )
      ) : (
        <>
          <div className="field">
            <span className="field-label">Insulation <small className="muted">Johns Manville</small></span>
            <Segmented<'wrap' | 'board'> size="sm" label="Insulation" value={wrap ? 'wrap' : 'board'} onChange={(v) => pick(v === 'wrap' ? 'wrap75' : 'board')} options={[{ id: 'wrap', label: 'Duct wrap' }, { id: 'board', label: round ? 'Micro-Flex' : 'Rigid board' }]} />
          </div>
          {wrap ? (
            <div className="field">
              <span className="field-label">Density <small className="muted">Microlite FSK</small></span>
              <Segmented<DuctInsulation> size="sm" label="Duct wrap density" value={s.ductIns} onChange={pick} options={[{ id: 'wrap75', label: '0.75 pcf' }, { id: 'wrap100', label: '1 pcf' }, { id: 'wrap150', label: '1.5 pcf' }]} />
            </div>
          ) : (
            <div className="field">
              <span className="field-label">Facing</span>
              <Segmented<DuctFacing> size="sm" label="Board facing" value={s.ductFacing} onChange={(v) => set({ ductFacing: v })} options={[{ id: 'fsk', label: 'FSK (foil)' }, { id: 'asj', label: 'ASJ (white)' }]} />
            </div>
          )}
        </>
      )}
      <Slider
        label={wrap ? 'Wrap thickness (labeled)' : round ? 'Micro-Flex thickness' : poly ? 'Polyiso thickness' : 'Board thickness'}
        value={s.thicknessIn}
        values={list}
        onChange={(v) => set({ thicknessIn: v })}
        format={(v) => (units === 'ip' ? inchLabel(v) : fmt.inches(v, units))}
        hint={wrap
          ? <span><b>R-{R.toFixed(1)} installed</b> · {fmt.inches(+inst.toFixed(3), units)} thick at 25% compression ({DUCT_WRAP.product}, {DUCT_WRAP.types[type].label})</span>
          : poly
            ? <span><b>R-{R.toFixed(1)}</b> · {DUCT_POLYISO.product}{DUCT_POLYISO.thicknesses.find((x) => x.nominalIn === s.thicknessIn)?.mto ? ' (made to order)' : ''}{s.ductW > DUCT_POLYISO.taperedOverIn ? ` · tapered top board (JM: ducts over ${DUCT_POLYISO.taperedOverIn}" wide)` : ''}</span>
            : <span><b>R-{R.toFixed(1)}</b>{round ? ' (thickness ÷ k at 75°F)' : ''} · {board.product}, {board.densityPcf} pcf</span>}
        accent={acc}
      />
      {wrap && outdoors && <p className="field-note">FSK duct wrap outdoors needs a weatherproof jacket over it; pick the location again to switch to jacketed board.</p>}
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
          <Icon name="map" size={15} /> Where does my duct run? Location guide
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
