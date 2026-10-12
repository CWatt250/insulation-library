import { DUCT_POLYISO } from '../../data/ductData'
import { boardFor, ductCover, isWrap } from '../../sim/duct'
import type { Evaluation } from '../../sim/model'
import { DRIP_RATE } from '../../sim/model'
import type { SimState } from '../../sim/types'
import { CALC_REFS, METHOD_REFS, refsFor } from '../../sim/sources'
import { PIPE_SRC, pipeSpec } from '../../data/pipes'
import { PIPE_PROPS } from '../../data/pipeWalls'
import { accuracyRows } from '../../sim/accuracy'
import { SPECS } from '../../data/specs'
import { fmt, type UnitSystem } from '../../sim/units'
import { Disclosure } from '../controls'

/** The footer every result carries: what was assumed, and where each number came from. */
export function Assumptions({ ev, s, units }: { ev: Evaluation; s: SimState; units: UnitSystem }) {
  const spec = SPECS[s.insulation]
  const product = ev.product
  const productSources = spec.sources.filter((x) => product.sources.includes(x.id))
  const geo = ev.ins.geo
  const surf = ev.ins.surface
  const surfRefs = refsFor(surf.src)
  const k = product.k
  return (
    <section className="assumptions">
      <Disclosure title="Assumptions & data sources" badge={<span className="pill">Educational tool</span>}>
        <p className="disclaimer-strong">
          Educational / preliminary design tool. Results follow ASTM C680 and are checked against published tables, but are not a substitute for 3E Plus or an engineer's review — confirm before specifying.
        </p>
        <h4>Model</h4>
        {s.system === 'duct' ? <DuctModel ev={ev} s={s} units={units} /> : <ul>
          <li>
            Steady state, long horizontal run of {s.pipe === 'copper' ? 'Type L copper tube' : s.pipe === 'pvc' ? 'Schedule 40 PVC pipe' : 'Schedule 40 steel pipe'} ({fmt.inches(pipeSpec(s.pipe, s.npsIndex).od, units)} OD).{' '}
            {s.pipe === 'pvc'
              ? <>The PVC wall conducts at k = {PIPE_PROPS.pvc?.kIp} Btu·in/hr·ft²·°F (ASTM C177, Charlotte and IPEX; Spears prints 1.02) through its published minimum wall, so a bare PVC line runs warmer than its fluid; no inside film.</>
              : <>Pipe surface at the fluid temperature: no inside film, and the metal wall's resistance is neglected.</>}
            {refsFor(PIPE_SRC[s.pipe]).map((x) => <a key={x.id} href={x.url} target="_blank" rel="noreferrer" title={x.title}> [{x.id}]</a>)}
          </li>
          <li>Conduction through the insulation with k varying with temperature: {product.name}, {k.length} published points from {k[0].meanF}°F to {k[k.length - 1].meanF}°F mean{ev.ins.result.extrapolated ? ' (extended linearly beyond them here)' : ''}.</li>
          <li>
            Insulation OD {geo ? `${geo.insOdIn.toFixed(3)}" ` : ''}
            {geo?.c585 ? 'from ASTM C585 (single layer, nominal size)' : 'taken as pipe OD + 2 × nominal thickness (no C585 value on file for this size)'}.
          </li>
          <li>Outer surface per ASTM C680: natural convection (Churchill–Chu){s.windMph > 0 ? `, blended with forced convection at ${s.windMph} mph (Churchill–Bernstein, C680 horizontal-pipe blend)` : ', still air'}; air properties at the film temperature; radiation to surroundings at the air temperature.</li>
          <li>Emittance {(s.emittanceOverride ?? surf.value).toFixed(2)} for {s.emittanceOverride !== null ? 'a custom surface' : surf.label.toLowerCase()}; bare pipe {ev.bare.surface.value.toFixed(2)} ({ev.bare.surface.label.toLowerCase()}).</li>
          <li>Jackets, facings and membranes add no insulation value; insulation is dry with tight joints.</li>
          <li>Dew point from the Magnus formula (Alduchov & Eskridge coefficients).</li>
          {ev.mode !== 'hot' && <li>Condensation control means a surface at least {fmt.margin(s.dewMarginF, units)} above the dew point{s.dewMarginF === 0.75 ? ' — the 3E Plus / NIA margin' : ' (your setting; 3E Plus and NIA use 0.75°F)'}.</li>}
          {ev.mode !== 'hot' && <li>Condensation rate from the heat/mass-transfer analogy; latent heat of condensation is not added to heat gain.</li>}
          {ev.mode !== 'hot' && <li>Status bands are this tool's convention: Borderline = dry but within your {fmt.margin(s.dewMarginF, units)} margin; Dripping risk = condensing faster than {DRIP_RATE} g/m²·h.</li>}
          {ev.mode === 'hot' && <li>Safe-touch (personnel protection) limit {fmt.temp(s.ppF, units)}, adjustable in Advanced.</li>}
        </ul>}
        <h4>Material data</h4>
        <ul className="sources">
          {s.system === 'duct' && refsFor(product.sources).map((x) => <li key={x.id}><a href={x.url} target="_blank" rel="noreferrer">{x.title}</a> <small>({x.publisher})</small></li>)}
          {s.system !== 'duct' && productSources.map((x) => (
            <li key={x.id}><a href={x.url} target="_blank" rel="noreferrer">{x.label}</a></li>
          ))}
        </ul>
        {surfRefs.length > 0 && (
          <>
            <h4>Surface emittance{surf.maxSurfaceF ? ' and limit' : ''}</h4>
            <ul className="sources">
              {surf.note && <li className="plain">{surf.note}</li>}
              {[...surfRefs, ...refsFor(surf.limitSrc ?? [])].map((x) => <li key={x.id}><a href={x.url} target="_blank" rel="noreferrer">{x.title}</a> <small>({x.publisher})</small></li>)}
            </ul>
          </>
        )}
        <h4>How accurate is this?</h4>
        <table className="accuracy">
          <tbody>
            {accuracyRows().map((r) => (
              <tr key={r.what}>
                <th>{r.what}{refsFor(r.src).map((x) => <a key={x.id} href={x.url} target="_blank" rel="noreferrer" title={x.title}> [{x.id}]</a>)}</th>
                <td>{r.result}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="field-note">Re-checked by the test suite on every change (src/sim/validation.test.ts).</p>
        <h4>Method references</h4>
        <ul className="sources">
          {METHOD_REFS.map((id) => CALC_REFS[id]).map((x) => (
            <li key={x.id}><a href={x.url} target="_blank" rel="noreferrer">{x.title}</a>{x.note && <small> — {x.note}</small>}</li>
          ))}
        </ul>
      </Disclosure>
    </section>
  )
}

const Ref = ({ ids }: { ids: string[] }) => <>{refsFor(ids).map((x) => <a key={x.id} href={x.url} target="_blank" rel="noreferrer" title={x.title}> [{x.id}]</a>)}</>

function DuctModel({ ev, s, units }: { ev: Evaluation; s: SimState; units: UnitSystem }) {
  const wrap = isWrap(s.ductIns)
  const alu = ductCover(s).jacket === 'alu'
  const surf = ev.ins.surface
  return (
    <ul>
      <li>Steady state, long horizontal {s.ductShape === 'round' ? `${s.ductD}" round` : `${s.ductW}" × ${s.ductH}"`} galvanized duct; the duct wall is at the air temperature{s.insideFilm ? `, plus an inside air film at ${s.airFpm} fpm (ASHRAE simplified equation for air)` : ' (no inside film, as 3E Plus)'}.<Ref ids={s.insideFilm ? ['U9'] : ['U15']} /></li>
      {s.ductShape === 'rect'
        ? <li>Each face solved on its own as a flat slab: sides as vertical surfaces (L = face height), top and underside as horizontal surfaces (L = area ÷ perimeter), with the stable and unstable correlations swapped between warm and cold ducts; corners not modelled. No published source splits a duct by face — this is the simulator's construction from the C680 flat-surface geometries.<Ref ids={['U1', 'U9', 'U14']} /></li>
        : <li>Round duct solved as a horizontal cylinder (the pipe engine's C680 correlations).</li>}
      <li>{wrap
        ? <>JM Microlite FSK duct wrap at its installed thickness, 75% of nominal (25% compression), as the IMC and JM rate it. JM prints k at 75°F only, so k vs temperature follows Knauf's published curve for the same density, scaled to JM's installed k at 75°F (this app's assumption — it reproduces JM's printed installed R).</>
        : s.ductIns === 'polyiso'
          ? <>{DUCT_POLYISO.product} at its labeled thickness; k {DUCT_POLYISO.kNote}. The code check uses JM's printed aged R. Outdoors under a 0.016" aluminum jacket (UFGS 23 07 00), which sets the surface emittance and adds no R-value.</>
          : <>{boardFor(s.ductShape).product} at its labeled thickness (not compressed); k vs temperature {boardFor(s.ductShape).kNote}{s.ductShape === 'round' ? '; JM prints no R-values for Micro-Flex, so its R is thickness ÷ k at 75°F' : ''}.{alu ? ' Outdoors it goes under a 0.016" aluminum jacket (UFGS 23 07 00), which sets the surface emittance and adds no R-value.' : ''}</>}<Ref ids={wrap ? ['U23', 'U28', 'C6'] : [...(s.ductIns === 'polyiso' ? DUCT_POLYISO.src : boardFor(s.ductShape).src), ...(alu ? ['U66'] : [])]} /></li>
      <li>Emittance {(s.emittanceOverride ?? surf.value).toFixed(2)} for {s.emittanceOverride !== null ? 'a custom surface' : surf.label.toLowerCase()}{surf.note ? ` (${surf.note})` : ''}; bare duct {ev.bare.surface.value.toFixed(2)} ({ev.bare.surface.label.toLowerCase()}).<Ref ids={[...surf.src, ...ev.bare.surface.src]} /></li>
      <li>Flat-surface correlations checked: they reproduce all 12 bare flat-surface rows of DNV's C680 tables and 3E Plus Example 5 (see the accuracy table).</li>
      <li>Energy code check uses the rated installed R at 75°F mean (ASHRAE 90.1-2019 Table 6.8.2, footnote a), not the calculated in-service value.<Ref ids={['C19']} /></li>
      {ev.mode !== 'hot' && <li>Condensation control means every face at least {fmt.margin(s.dewMarginF, units)} above the dew point; condensation rate from the heat/mass-transfer analogy, per face.</li>}
      {ev.mode === 'hot' && <li>Safe-touch limit {fmt.temp(s.ppF, units)}; IMC 604.2 also limits ducts above 120°F to a 120°F surface.<Ref ids={['C6']} /></li>}
    </ul>
  )
}
