import type { ReactNode } from 'react'
import type { Evaluation } from '../../sim/model'
import { systemFor } from '../../sim/model'
import { annualCost, BOILER_DEFAULT, costSteps, GAS_DEFAULT, money, POWER_DEFAULT, priceBasis, runBasis, type CostSteps } from '../../sim/cost'
import { JACKETS } from '../../data/catalog'
import { pipeLabel, pipeSpec } from '../../data/pipes'
import { materialLabel, noun } from '../../sim/system'
import { refsFor } from '../../sim/sources'
import type { SimMode, SimState } from '../../sim/types'
import { fmt, FT_M, type UnitSystem } from '../../sim/units'
import { Disclosure, Icon, NumberField, Segmented } from '../controls'

/** Typical schedules, as hours a year. */
const SCHEDULES: { hours: number; label: string; sub: string }[] = [
  { hours: 8760, label: '24/7', sub: '8,760 h' },
  { hours: 5840, label: '16 h/day', sub: '5,840 h' },
  { hours: 4380, label: '12 h/day', sub: '4,380 h' },
  { hours: 2080, label: '8 h M–F', sub: '2,080 h' },
]

function Src({ ids }: { ids: string[] }) {
  return <>{refsFor(ids).map((r) => <a key={r.id} href={r.url} target="_blank" rel="noreferrer" title={`${r.title} — ${r.publisher}`}> [{r.id}]</a>)}</>
}

const num = (v: number) => (v >= 100 ? Math.round(v).toLocaleString('en-US') : v.toLocaleString('en-US', { maximumFractionDigits: 1 }))
const mmbtu = (btu: number) => `${num(btu / 1e6)} MMBtu`

/** The steps behind one side's yearly cost, in inch-pound units. */
function MathSteps({ title, st, s, mode, word }: { title: string; st: CostSteps; s: SimState; mode: SimMode; word: string }) {
  const n = noun(s)
  const rows: [string, ReactNode][] = [[
    `Heat ${word}`,
    <>{num(st.q)} Btu/hr per ft × {Math.round(s.lengthFt).toLocaleString('en-US')} ft × {s.hours.toLocaleString('en-US')} h = <b>{mmbtu(st.btuYr)}/yr</b></>,
  ]]
  if (mode === 'hot' && s.fuel !== 'electric') {
    rows.push([`${s.fuel === 'gas' ? 'Gas burned' : 'Steam bought'} to replace it`, <>{mmbtu(st.btuYr)} ÷ {s.efficiencyPct}% efficiency = <b>{num(st.bought.amount)} MMBtu</b></>])
    rows.push(['Cost', <>{num(st.bought.amount)} MMBtu × ${s.fuelPrice.toFixed(2)}/MMBtu = <b>{money(st.cost)}/yr</b></>])
  } else if (mode === 'hot') {
    rows.push(['Electricity to replace it', <>{mmbtu(st.btuYr)} ÷ 3,412 Btu per kWh ÷ {s.efficiencyPct}% = <b>{num(st.bought.amount)} kWh</b></>])
    rows.push(['Cost', <>{num(st.bought.amount)} kWh × ${s.fuelPrice.toFixed(3)}/kWh = <b>{money(st.cost)}/yr</b></>])
  } else {
    rows.push(['Cooling to remove it', <>{mmbtu(st.btuYr)} ÷ 12,000 Btu per ton-hour = <b>{num(st.tonHr ?? 0)} ton-hours</b></>])
    rows.push(['Electricity for the chiller plant', <>{num(st.tonHr ?? 0)} ton-hours × {s.kwPerTon.toFixed(2)} kW/ton = <b>{num(st.bought.amount)} kWh</b></>])
    rows.push(['Cost', <>{num(st.bought.amount)} kWh × ${s.coolPrice.toFixed(3)}/kWh = <b>{money(st.cost)}/yr</b></>])
  }
  return (
    <div className="sv-steps">
      <h4>{title} {n}</h4>
      <ol>{rows.map(([k, v]) => <li key={k}><span>{k}</span><span>{v}</span></li>)}</ol>
    </div>
  )
}

export function Savings({ mode, s, set, ev, units, accent, onEditPipe }: {
  /** Physics mode: hot or cold (ductwork resolved by which way heat flows). */
  mode: SimMode
  s: SimState
  set: (p: Partial<SimState>) => void
  ev: Evaluation
  units: UnitSystem
  accent: string
  /** Phones: jump to Setup to change the pipe or insulation. */
  onEditPipe?: () => void
}) {
  const hot = mode === 'hot'
  const duct = s.system === 'duct'
  const n = noun(s)
  const word = hot ? 'lost' : 'gained'
  const c = annualCost(s, mode, ev)
  const si = units === 'si'
  const run = si ? `${fmt.length(s.lengthFt, units)}, ${s.hours >= 8760 ? 'running 24/7' : `${s.hours.toLocaleString('en-US')} h/yr`}` : runBasis(s)

  // what's being priced, in words
  const sys = systemFor(s, mode)
  const what = duct
    ? `${s.ductShape === 'round' ? `${s.ductD}" round` : `${s.ductW}" × ${s.ductH}"`} duct`
    : s.pipe === 'copper' ? `${pipeLabel(s.pipe, pipeSpec(s.pipe, s.npsIndex))} tube` : `${pipeLabel(s.pipe, pipeSpec(s.pipe, s.npsIndex))} ${s.pipe === 'pvc' ? 'PVC' : 'steel'}`
  const finish = duct ? null : sys.jacketId !== 'none' ? JACKETS[sys.jacketId].label : sys.facing === 'asj' ? 'ASJ facing' : null

  const setFuel = (fuel: SimState['fuel']) => {
    if (fuel === s.fuel) return
    // electric heat turns all of its power into heat; gas and steam go back to the Washington gas price
    if (fuel === 'electric') set({ fuel, fuelPrice: POWER_DEFAULT, efficiencyPct: 100 })
    else if (s.fuel === 'electric') set({ fuel, fuelPrice: GAS_DEFAULT, efficiencyPct: BOILER_DEFAULT })
    else set({ fuel })
  }

  const bareSteps = costSteps(s, mode, ev.bare.result.qBtuHrFt)
  const insSteps = costSteps(s, mode, ev.ins.result.qBtuHrFt)
  const kwhSaved = bareSteps.bought.unit === 'kWh' ? bareSteps.bought.amount - insSteps.bought.amount : null

  return (
    <div className="savings" style={{ '--acc': accent } as React.CSSProperties}>
      <p className="sv-intro">
        What insulating this {n} saves on energy each year, compared with leaving it bare.
      </p>

      {/* 1 — the run */}
      <section className="sv-card">
        <h3><span className="sv-n">1</span> Your run</h3>
        <NumberField
          big
          label={si ? `Length of ${n} (metres)` : `Length of ${n} (linear feet)`}
          value={si ? Math.round(s.lengthFt * FT_M) : s.lengthFt}
          digits={0}
          max={si ? 30000 : 100000}
          unit={si ? 'm' : 'LF'}
          onChange={(v) => set({ lengthFt: si ? v / FT_M : v })}
        />
        <div className="field">
          <span className="field-label">How many hours it runs</span>
          <div className="chips sv-sched" role="radiogroup" aria-label="How many hours it runs">
            {SCHEDULES.map((o) => (
              <button key={o.hours} role="radio" aria-checked={s.hours === o.hours} className={s.hours === o.hours ? 'on' : ''} onClick={() => set({ hours: o.hours })}>
                {o.label}<small>{o.sub}</small>
              </button>
            ))}
          </div>
          <NumberField label="Or type the hours per year" value={s.hours} digits={0} max={8760} unit="h/yr" onChange={(v) => set({ hours: v })} />
        </div>
      </section>

      {/* 2 — the answer */}
      <section className="sv-result" aria-live="polite">
        {c ? (
          <>
            <div className="sv-totals">
              <div><span>Saved per year</span><b>{money(c.saved)}</b></div>
              <div><span>Saved per month</span><b>{money(c.saved / 12)}</b></div>
            </div>
            <p className="sv-per">
              {si ? `${money(c.saved / (s.lengthFt * FT_M))} per metre` : `${money(c.saved / s.lengthFt)} per LF`} per year · on {run}
            </p>
            <dl className="sv-break">
              <div><dt>Energy cost if left bare</dt><dd>{money(c.bare)} / yr</dd></div>
              <div><dt>Energy cost insulated</dt><dd>{money(c.ins)} / yr</dd></div>
              <div><dt>Energy saved</dt><dd>{fmt.energy(ev.annual!.saved, units)}{kwhSaved !== null && <small> · {Math.round(kwhSaved).toLocaleString('en-US')} kWh</small>}</dd></div>
              {c.paybackYr !== null && <div><dt>Payback</dt><dd>{c.paybackYr < 1 ? `${Math.max(1, Math.round(c.paybackYr * 12))} months` : `${c.paybackYr.toFixed(1)} years`}</dd></div>}
            </dl>
          </>
        ) : (
          <p className="sv-empty">
            {s.lengthFt <= 0 ? `Type the length of ${n} above to see the savings.` : s.hours <= 0 ? 'Pick how many hours it runs to see the savings.' : `No energy to save: the ${duct ? 'air' : n} is at room temperature.`}
          </p>
        )}
      </section>

      {/* 3 — what's priced */}
      <section className="sv-card">
        <h3><span className="sv-n">2</span> Energy price <small className="muted">defaults are Washington averages — use your bill</small></h3>
        {hot ? (
          <>
            <div className="field">
              <span className="field-label">The heat comes from</span>
              <Segmented<SimState['fuel']>
                size="sm"
                label="The heat comes from"
                value={s.fuel}
                onChange={setFuel}
                options={[{ id: 'gas', label: 'Natural gas' }, { id: 'steam', label: 'Purchased steam' }, { id: 'electric', label: 'Electric' }]}
              />
            </div>
            {s.fuel === 'electric' ? (
              <NumberField
                label="Electricity price"
                prefix="$" unit="/kWh" digits={3} fixed={3} max={2}
                value={s.fuelPrice}
                onChange={(v) => set({ fuelPrice: v })}
                hint={<>$0.12 is Washington’s commercial average, 11.8¢ (EIA, July 2026)<Src ids={['P6']} />. Puget Sound Energy business customers average $0.16–0.21<Src ids={['P5']} />.</>}
              />
            ) : (
              <NumberField
                label={s.fuel === 'gas' ? 'Natural gas price' : 'Steam price'}
                prefix="$" unit="/MMBtu" digits={2} fixed={2} max={100}
                value={s.fuelPrice}
                onChange={(v) => set({ fuelPrice: v })}
                hint={s.fuel === 'gas'
                  ? <>= ${(s.fuelPrice / 10).toFixed(3)} per therm. $14 is Washington’s commercial average: $13.80 in 2025, $14.56 so far in 2026 (EIA)<Src ids={['P1', 'P2', 'P4']} />; PSE Schedule 31 averages $1.47/therm<Src ids={['P5']} />.</>
                  : <>Enter the rate from your steam bill, in $ per MMBtu (1 MMBtu = 10 therms).</>}
              />
            )}
            <NumberField
              label={s.fuel === 'gas' ? 'Boiler efficiency' : s.fuel === 'steam' ? 'Steam system efficiency' : 'Electric heater efficiency'}
              unit="%" digits={0} min={1} max={100}
              value={s.efficiencyPct}
              onChange={(v) => set({ efficiencyPct: v })}
              hint={s.fuel === 'electric' ? 'Resistance heat turns all of its power into heat: 100%.' : `Share of the ${s.fuel === 'gas' ? 'gas' : 'steam'} energy that ends up as heat in the ${n}. 80% is an example; use your boiler’s rating.`}
            />
          </>
        ) : (
          <>
            <NumberField
              label="Electricity price"
              prefix="$" unit="/kWh" digits={3} fixed={3} max={2}
              value={s.coolPrice}
              onChange={(v) => set({ coolPrice: v })}
              hint={<>$0.12 is Washington’s commercial average, 11.8¢ (EIA, July 2026)<Src ids={['P6']} />. Puget Sound Energy business customers average $0.16–0.21<Src ids={['P5']} />.</>}
            />
            <NumberField
              label="Chiller plant efficiency"
              unit="kW/ton" digits={2} fixed={2} min={0.2} max={3}
              value={s.kwPerTon}
              onChange={(v) => set({ kwPerTon: v })}
              hint={<>Electricity per ton of cooling — lower is better. A whole chiller plant (chillers, pumps, cooling tower) typically runs 0.8–1.0; packaged and air-cooled units 1.1–1.4<Src ids={['P7']} />.</>}
            />
          </>
        )}
        <NumberField
          label={<>Installed cost of the insulation <small className="muted">optional, for payback</small></>}
          prefix="$" unit={si ? '/ft' : '/LF'} digits={2} max={1000}
          value={s.installedPerFt}
          onChange={(v) => set({ installedPerFt: v })}
          hint={s.installedPerFt > 0 ? `${money(s.installedPerFt * s.lengthFt)} for ${run.split(',')[0]}.` : 'Leave at 0 to skip payback.'}
        />
      </section>

      {/* 4 — what's being priced, and how */}
      <section className="sv-card sv-what">
        <h3><span className="sv-n">3</span> What’s being priced</h3>
        <dl className="sv-break">
          <div><dt>{duct ? 'Duct' : 'Pipe'}</dt><dd>{what}, {fmt.temp(s.processF, units)} inside</dd></div>
          <div><dt>Insulation</dt><dd>{fmt.thick(s.thicknessIn, units)} {materialLabel(s)}{finish ? ` · ${finish}` : ''}</dd></div>
          <div><dt>Around it</dt><dd>{fmt.temp(s.ambientF, units)} air{s.windMph > 0 ? `, ${s.windMph} mph wind` : ', still'}</dd></div>
          <div><dt>Heat {word}, bare</dt><dd>{fmt.flow(Math.abs(ev.bare.result.qBtuHrFt), units)} {fmt.flowUnit(units)}</dd></div>
          <div><dt>Heat {word}, insulated</dt><dd>{fmt.flow(Math.abs(ev.ins.result.qBtuHrFt), units)} {fmt.flowUnit(units)}</dd></div>
          <div><dt>Paid for with</dt><dd>{priceBasis(s, mode)}</dd></div>
        </dl>
        {onEditPipe && <button className="sv-link" onClick={onEditPipe}><Icon name="pipe" size={14} /> Change the {n} or insulation in Setup</button>}
        {!onEditPipe && <p className="field-note">Change the {n} or insulation in Setup, on the left.</p>}
      </section>

      {c && (
        <Disclosure title={<>Show the math <small className="muted">step by step, with your numbers</small></>}>
          <p className="field-note">Heat {word} per foot comes from the ASTM C680 heat-transfer calculation shown in Results. Steps are in inch-pound units.</p>
          <MathSteps title="Bare" st={bareSteps} s={s} mode={mode} word={word} />
          <MathSteps title="Insulated" st={insSteps} s={s} mode={mode} word={word} />
          <div className="sv-steps">
            <h4>Savings</h4>
            <ol>
              <li><span>Per year</span><span>{money(c.bare)} − {money(c.ins)} = <b>{money(c.saved)}</b></span></li>
              <li><span>Per month</span><span>{money(c.saved)} ÷ 12 = <b>{money(c.saved / 12)}</b></span></li>
            </ol>
          </div>
        </Disclosure>
      )}

      <div className="sv-notes">
        <h4>Keep in mind</h4>
        <ul>
          <li>Compared with a bare {n}. If old insulation is already on it, the real savings are smaller.</li>
          <li>Assumes {fmt.temp(s.processF, units)} inside for every hour it runs.</li>
          {!duct && <li>Straight {n} only — valves, flanges and fittings aren’t counted.</li>}
          <li>Energy cost only — not maintenance, demand charges or carbon fees.</li>
          {!hot && <li>Counts the cooling load from heat flowing in. A bare {n} that sweats also gives up the water’s heat to the chiller, so the real savings run higher.</li>}
        </ul>
      </div>
    </div>
  )
}
