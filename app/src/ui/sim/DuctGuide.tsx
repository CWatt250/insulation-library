import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { DUCT_SPOTS, spotRequirement, type DuctSpot } from '../../sim/ductSpots'
import { DUCT_LOCATIONS, DUCT_TYPES } from '../../sim/duct'
import { refsFor } from '../../sim/sources'
import type { SimState } from '../../sim/types'
import { Icon } from '../controls'

/**
 * "Where does the duct run?" — a building section with DOE's 14 duct locations
 * (BECP commercial duct-insulation guide, Figure 1), redrawn for this app.
 * Pick a location to see how ASHRAE 90.1-2019 classifies it and what it needs,
 * then send it to the simulator.
 */

type Kind = 'conditioned' | 'indirect' | 'unconditioned' | 'exteriorcol' | 'buried' | 'other' | 'pending'

const KIND: Record<Kind, { fill: string; label: string }> = {
  conditioned: { fill: '#5b8def', label: 'Conditioned — no duct insulation required (exception 2)' },
  indirect: { fill: '#2dd4bf', label: 'Indirectly conditioned — return plenums (note c)' },
  unconditioned: { fill: '#f5b942', label: 'Unconditioned space and buried ducts column' },
  exteriorcol: { fill: '#f97362', label: 'Exterior column — outdoors, plus attics above insulated ceilings, crawl spaces, parking garages (note b)' },
  buried: { fill: '#a07a52', label: 'Buried (Unconditioned space and buried ducts column)' },
  other: { fill: '#e9e4d6', label: 'Not a duct run: equipment casing or building envelope' },
  pending: { fill: '#8a8f96', label: 'Not yet verified' },
}

/** The spaces of the section and how 90.1-2019 classes them. */
const SPACES: { x: number; y: number; w: number; h: number; kind: Kind; name: string; vertical?: boolean; lx?: number }[] = [
  { x: 400, y: 120, w: 460, h: 50, kind: 'exteriorcol', name: 'Vented attic' },
  { x: 400, y: 170, w: 460, h: 35, kind: 'indirect', name: 'Return air plenum', lx: 760 },
  { x: 400, y: 205, w: 460, h: 115, kind: 'conditioned', name: 'Conditioned floor' },
  { x: 400, y: 320, w: 460, h: 35, kind: 'indirect', name: 'Return air plenum', lx: 760 },
  { x: 400, y: 355, w: 460, h: 115, kind: 'conditioned', name: 'Conditioned floor' },
  { x: 400, y: 470, w: 460, h: 50, kind: 'exteriorcol', name: 'Vented crawl space' },
  { x: 340, y: 110, w: 60, h: 410, kind: 'unconditioned', name: 'Unconditioned shaft', vertical: true },
  { x: 120, y: 210, w: 220, h: 40, kind: 'pending', name: 'Unvented attic' },
  { x: 120, y: 250, w: 220, h: 130, kind: 'conditioned', name: 'Conditioned floor' },
  { x: 120, y: 380, w: 220, h: 130, kind: 'conditioned', name: 'Conditioned floor' },
]

/** Duct paths, drawn under the markers; `spot` ties a path to its location. */
const DUCTS: { spot: number; d: string; flex?: boolean }[] = [
  { spot: 4, d: 'M420 86 H370 V120' },
  { spot: 5, d: 'M370 120 V496' },
  { spot: 3, d: 'M370 145 H700 V170' },
  { spot: 2, d: 'M785 172 V112' },
  { spot: 6, d: 'M345 232 H170 V250' },
  { spot: 7, d: 'M400 188 H640' },
  { spot: 11, d: 'M370 338 H600' },
  { spot: 10, d: 'M600 338 L612 330 L624 346 L636 330 L648 346 L660 330 L672 346 L690 340', flex: true },
  { spot: 12, d: 'M345 400 H160 V412' },
  { spot: 13, d: 'M370 495 H760 V470' },
  { spot: 14, d: 'M370 496 V540 H160 V510' },
]

function kindOf(spot: DuctSpot): Kind {
  if (spot.pending) return 'pending'
  if (!spot.place) return 'other'
  const col = DUCT_LOCATIONS.find((l) => l.id === spot.place)?.column
  if (spot.place === 'buried') return 'buried'
  if (spot.place === 'conditioned' || col === null) return 'conditioned'
  if (col === 'indirect') return 'indirect'
  if (col === 'exterior') return 'exteriorcol'
  return 'unconditioned'
}

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
  const req = spotRequirement(spot, s.ductService, s.climateZone)
  const refs = refsFor(req?.src ?? ['C19'])
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
            <p>DOE's commercial duct-insulation guide shows 14 typical duct locations. Pick one to see how ASHRAE 90.1-2019 classifies it at your climate zone (zone {s.climateZone}).</p>
          </div>
          <button className="tool" aria-label="Close" onClick={onClose}><Icon name="x" size={16} /></button>
        </header>
        <div className="guide-body">
          <figure className="guide-fig">
            <svg viewBox="80 40 860 540" role="img" aria-label="Building section with 14 numbered duct locations">
              <defs>
                <pattern id="g-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="6" stroke="#e8d27a" strokeWidth="2" />
                </pattern>
                <pattern id="g-earth" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
                  <line x1="0" y1="0" x2="0" y2="10" stroke="#5a4a3a" strokeWidth="1.5" />
                </pattern>
              </defs>
              {/* ground */}
              <rect x="80" y="520" width="820" height="60" fill="url(#g-earth)" opacity="0.55" />
              <rect x="120" y="510" width="220" height="56" fill={KIND.buried.fill} opacity="0.16" />
              {/* spaces */}
              {SPACES.map((r, i) => (
                <g key={i}>
                  <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={KIND[r.kind].fill} opacity={0.17} />
                  {r.vertical
                    ? <text x={r.x + 49} y={r.y + 190} className="g-space" transform={`rotate(-90 ${r.x + 49} ${r.y + 190})`} textAnchor="middle">{r.name}</text>
                    : <text x={r.lx ?? r.x + 6} y={r.y + 13} className="g-space">{r.name}</text>}
                </g>
              ))}
              {/* insulation: attic floor, unvented-attic roof deck, crawl-space ceiling */}
              <rect x="400" y="166" width="460" height="7" fill="url(#g-hatch)" />
              <rect x="120" y="206" width="220" height="7" fill="url(#g-hatch)" />
              <rect x="400" y="466" width="460" height="7" fill="url(#g-hatch)" />
              {/* structure */}
              <path d="M120 510 V210 H340 M400 120 H860 V520 M120 510 H340 M340 110 V520 M400 120 V520" stroke="#cfd3d8" strokeWidth="3" fill="none" />
              <path d="M400 320 H860 M400 470 H860 M120 380 H340" stroke="#cfd3d8" strokeWidth="1.5" fill="none" opacity="0.6" />
              <path d="M400 205 H860 M400 355 H860" stroke="#cfd3d8" strokeWidth="1" strokeDasharray="5 4" fill="none" opacity="0.6" />
              {/* vents */}
              {[130, 150, 482, 500].map((y) => <path key={y} d={`M862 ${y} l10 -4 M862 ${y + 6} l10 -4`} stroke="#cfd3d8" strokeWidth="1.5" />)}
              <text x="876" y="146" className="g-note">vented</text>
              <text x="876" y="498" className="g-note">vented</text>
              {/* rooftop unit and exhaust fan */}
              <rect x="420" y="60" width="100" height="52" rx="4" fill="#3a3d42" stroke={lit === 1 ? 'var(--acc)' : '#cfd3d8'} strokeWidth={lit === 1 ? 3 : 1.5} />
              <text x="470" y="56" className="g-note" textAnchor="middle">Heating / cooling unit</text>
              <path d="M772 112 v-18 a14 14 0 0 1 28 0 v18" fill="#3a3d42" stroke="#cfd3d8" strokeWidth="1.5" />
              <text x="786" y="84" className="g-note" textAnchor="middle">Exhaust fan</text>
              {/* ducts */}
              {DUCTS.map((dct) => (
                <path
                  key={dct.spot + dct.d}
                  d={dct.d}
                  fill="none"
                  stroke={lit === dct.spot ? 'var(--acc)' : '#9aa3ab'}
                  strokeWidth={dct.flex ? 6 : 11}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={lit === dct.spot ? 1 : 0.85}
                />
              ))}
              <rect x="690" y="344" width="44" height="12" rx="2" fill={lit === 9 ? 'var(--acc)' : '#9aa3ab'} />
              <path d="M860 320 V355" stroke={lit === 8 ? 'var(--acc)' : '#cfd3d8'} strokeWidth={lit === 8 ? 7 : 3} />
              {/* markers */}
              {DUCT_SPOTS.map((p) => (
                <g
                  key={p.n}
                  className={`g-spot ${sel === p.n ? 'on' : ''}`}
                  transform={`translate(${p.x} ${p.y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${p.n}. ${p.label}`}
                  aria-pressed={sel === p.n}
                  onClick={() => setSel(p.n)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(p.n) } }}
                  onMouseEnter={() => setHover(p.n)}
                  onMouseLeave={() => setHover(null)}
                >
                  <circle r="12" fill={KIND[kindOf(p)].fill} />
                  <text textAnchor="middle" dy="4.5">{p.n}</text>
                </g>
              ))}
            </svg>
            <figcaption>
              {(Object.keys(KIND) as Kind[]).map((k) => (
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
                {req && (
                  <div className={`g-req ${req.R === null ? 'none' : ''}`}>
                    <b>{req.R === null ? 'No minimum' : `Installed R-${req.R} minimum`}</b>
                    <span>{req.label}</span>
                  </div>
                )}
                {spot.rule && <p className="g-rule">{spot.rule}</p>}
                {place && <p className="field-note">{place.why}</p>}
                <p className="field-note">
                  Source{refs.map((x) => <a key={x.id} href={x.url} target="_blank" rel="noreferrer" title={x.title}> [{x.id}]</a>)}
                  {' '}· Table rows use your system service ({s.ductService === 'both' ? 'heating & cooling' : `${s.ductService} only`}) and climate zone.
                </p>
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
