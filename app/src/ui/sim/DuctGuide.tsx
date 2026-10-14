import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { DUCT_SPOTS, minimumText, spotRequirement } from '../../sim/ductSpots'
import { DUCT_LOCATIONS, DUCT_TYPES } from '../../sim/duct'
import { DuctDiagram } from './DuctDiagram'
import { KIND, kindOf, type Kind } from '../../sim/ductKinds'
import { DOE_SPOT_NOTES } from '../../data/ductData'
import { waOptions } from '../../sim/design'
import { refsFor } from '../../sim/sources'
import type { SimState } from '../../sim/types'
import { Icon } from '../controls'

/**
 * "Where does the duct run?" — a building section with DOE's 14 duct locations
 * (plus 15, the return duct of a ducted-return ceiling space)
 * (BECP commercial duct-insulation guide, Figure 1), redrawn for this app.
 * Pick a location to see how ASHRAE 90.1-2019 classifies it and what it needs,
 * then send it to the simulator.
 */

export function DuctGuide({ s, set, onClose }: { s: SimState; set: (p: Partial<SimState>) => void; onClose: () => void }) {
  const [sel, setSel] = useState<number>(() => {
    const hit = DUCT_SPOTS.find((x) => x.type === s.ductType && x.place === s.ductLocation)
    return hit?.n ?? 3
  })
  const [hover, setHover] = useState<number | null>(null)
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  const spot = DUCT_SPOTS.find((x) => x.n === sel)!
  const req = spotRequirement(spot, s.ductService, s.climateZone, 'ashrae')
  const iecc = spotRequirement(spot, s.ductService, s.climateZone, 'iecc')
  const wa = waOptions(s)
  const wsec = spotRequirement(spot, s.ductService, s.climateZone, 'wsec', wa)
  const doe = DOE_SPOT_NOTES[spot.n]
  const doeRef = refsFor(['D_C27'])[0]
  const lit = hover ?? sel
  const usable = !!spot.type && !!spot.place && !spot.pending
  const place = DUCT_LOCATIONS.find((l) => l.id === spot.place)
  // portalled to <body> so it sits above the mode bar and the simulator's own layers
  return createPortal(
    <div className="guide-backdrop" role="dialog" aria-modal="true" aria-labelledby="guide-title" onClick={onClose}>
      <div className="guide" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <h2 id="guide-title">Where does the duct run?</h2>
            <p>DOE's commercial duct-insulation guide shows 14 typical duct locations; 15 adds the return duct of a ceiling space with a ducted return. Pick one to see what ASHRAE 90.1-2019, the IECC and Washington's WSEC require there at your climate zone (zone {s.climateZone}).</p>
          </div>
          <button className="tool" aria-label="Close" onClick={onClose}><Icon name="x" size={16} /></button>
        </header>
        <div className="guide-body">
          <figure className="guide-fig">
            <DuctDiagram lit={lit} sel={sel} onPick={setSel} onHover={setHover} />
            <figcaption>
              {(Object.keys(KIND) as Kind[]).filter((k) => k !== 'pending' || DUCT_SPOTS.some((p) => p.pending)).map((k) => (
                <span key={k} className="g-key"><i style={{ background: KIND[k].fill }} />{KIND[k].label}</span>
              ))}
              <span className="g-src">Locations after DOE/PNNL, <i>Duct Insulation and Sealing Requirements in Commercial Buildings</i>, Figure 1; redrawn. Classification: ASHRAE 90.1-2019 Table 6.8.2 and 6.4.4.1.2.</span>
            </figcaption>
          </figure>
          <aside className="guide-detail">
            <span className="g-num" style={{ background: KIND[kindOf(spot)].fill }}>{spot.n}</span>
            <h3>{spot.label}</h3>
            <p className="g-kind">{KIND[kindOf(spot)].label}</p>
            {spot.pending ? (
              <p className="field-note">The code rule for this location hasn't been verified against the code text yet — it is being researched.</p>
            ) : (
              <>
                {[{ code: 'ASHRAE 90.1-2019', r: req }, { code: 'IECC 2021 / 2024', r: iecc }, { code: `Washington WSEC · ${s.waCounty} County (${wa.zone})`, r: wsec }].map(({ code, r }) => r && (
                  <div key={code} className={`g-req ${r.R === null ? 'none' : ''}`}>
                    <small>{code}{r.derived ? ' · derived' : ''}</small>
                    <b>{minimumText(r).replace(/^./, (c) => c.toUpperCase())}</b>
                    <span>{r.label}{refsFor(r.src).map((x) => <a key={x.id} href={x.url} target="_blank" rel="noreferrer" title={x.title}> [{x.id}]</a>)}</span>
                  </div>
                ))}
                {spot.rule && <p className="g-rule">{spot.rule}</p>}
                {place && <p className="field-note">{place.why}</p>}
                <p className="field-note">ASHRAE rows use your system service ({s.ductService === 'both' ? 'heating & cooling' : `${s.ductService} only`}) and climate zone. "Derived" readings follow the codes' definitions and DOE's note rather than stated text.</p>
                {doe && (
                  <blockquote className="g-doe">
                    "{doe.quote}"
                    <cite>DOE code note (2009/2012 IECC, 90.1-2007/2010), p. {doe.page}{doeRef && <a href={doeRef.url} target="_blank" rel="noreferrer" title={doeRef.title}> [{doeRef.id}]</a>}</cite>
                  </blockquote>
                )}
              </>
            )}
            <button className="primary" disabled={!usable} onClick={() => { set({ ductType: spot.type!, ductLocation: spot.place!, presetId: null }); onClose() }}>
              <Icon name="check" size={15} /> {usable ? `Use: ${DUCT_TYPES.find((t) => t.id === spot.type)!.label.toLowerCase()} in ${place!.short.toLowerCase()}` : 'Not a duct run to simulate'}
            </button>
            <ol className="g-list">
              {DUCT_SPOTS.map((p) => (
                <li key={p.n}>
                  <button className={sel === p.n ? 'on' : ''} onClick={() => setSel(p.n)}>
                    <i style={{ background: KIND[kindOf(p)].fill }}>{p.n}</i>{p.label}
                  </button>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </div>
    </div>,
    document.body,
  )
}
