import type { KeyboardEvent } from 'react'
import { DUCT_SPOTS } from '../../sim/ductSpots'
import { KIND, kindOf, type Kind } from '../../sim/ductKinds'

/**
 * The building section of DOE's 14 duct locations (BECP commercial
 * duct-insulation guide, Figure 1), redrawn. Shared by the "Where does the
 * duct run?" guide and the static images WattBot sends
 * (scripts/build-wattbot.mjs → public/wattbot/).
 */

/** The spaces of the section and how 90.1-2019 classes them. */
const SPACES: { x: number; y: number; w: number; h: number; kind: Kind; name: string; vertical?: boolean; lx?: number }[] = [
  { x: 400, y: 120, w: 460, h: 50, kind: 'exteriorcol', name: 'Vented attic' },
  { x: 400, y: 170, w: 460, h: 35, kind: 'indirect', name: 'Return air plenum', lx: 655 },
  { x: 400, y: 205, w: 460, h: 115, kind: 'conditioned', name: 'Conditioned floor' },
  { x: 400, y: 320, w: 460, h: 52, kind: 'ceiling', name: 'Ceiling space (return plenum or ducted return)' },
  { x: 400, y: 372, w: 460, h: 98, kind: 'conditioned', name: 'Conditioned floor' },
  { x: 400, y: 470, w: 460, h: 50, kind: 'exteriorcol', name: 'Vented crawl space' },
  { x: 340, y: 110, w: 60, h: 410, kind: 'unconditioned', name: 'Unconditioned shaft', vertical: true },
  { x: 120, y: 210, w: 220, h: 40, kind: 'exteriorcol', name: 'Unvented attic' },
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
  { spot: 15, d: 'M370 341 H800 V368' },
  { spot: 11, d: 'M370 359 H600' },
  { spot: 10, d: 'M600 359 L612 351 L624 367 L636 351 L648 367 L660 351 L672 367 L690 361', flex: true },
  { spot: 12, d: 'M345 400 H160 V412' },
  { spot: 13, d: 'M370 495 H760 V470' },
  { spot: 14, d: 'M370 496 V540 H160 V510' },
]

/** Drawing colours. Dark is the site's guide; light is for apps with white cards (BidWatt). */
const PALETTES = {
  dark: { bg: '#17181b', line: '#cfd3d8', duct: '#9aa3ab', unit: '#3a3d42', acc: '#b9a2ff', hatch: '#e8d27a', earth: '#5a4a3a', space: 'rgba(255,255,255,0.55)', note: 'rgba(255,255,255,0.6)', ring: '#fff', mark: '#17181b', fillOpacity: 0.17 },
  light: { bg: '#ffffff', line: '#5b6472', duct: '#a7afba', unit: '#e7eaef', acc: '#16305e', hatch: '#c9a227', earth: '#c4b49b', space: 'rgba(28,35,51,0.7)', note: 'rgba(28,35,51,0.75)', ring: '#1c2333', mark: 'rgba(28,35,51,0.45)', fillOpacity: 0.16 },
}
export type DiagramTheme = keyof typeof PALETTES

/** The guide's own rules (sim.css), carried inside a standalone image. */
const standaloneCss = (p: (typeof PALETTES)[DiagramTheme]) => `
.g-space { font: 600 10px system-ui, -apple-system, sans-serif; fill: ${p.space}; letter-spacing: 0.02em; }
.g-note { font: 11px system-ui, -apple-system, sans-serif; fill: ${p.note}; }
.g-spot circle { stroke: ${p.mark}; stroke-width: ${p.mark === p.bg ? 2.5 : 1.5}; }
.g-spot text { font: 750 12px system-ui, -apple-system, sans-serif; fill: #111; }
.g-spot.on circle { r: 15; stroke: ${p.ring}; stroke-width: 3; }
`

export function DuctDiagram({ lit, sel, onPick, onHover, standalone, at, theme = 'dark' }: {
  /** The location drawn in the accent colour (hovered or selected). */
  lit: number | null
  /** The selected marker (ringed). */
  sel: number | null
  onPick?: (n: number) => void
  onHover?: (n: number | null) => void
  /** A self-contained image: its own background, styles and accent colour. */
  standalone?: boolean
  /** Standalone only: where this drawing sits inside a larger image. */
  at?: { x: number; y: number }
  /** Standalone only: colours (the site's guide is always dark). */
  theme?: DiagramTheme
}) {
  const p = PALETTES[standalone ? theme : 'dark']
  const acc = standalone ? p.acc : 'var(--acc)'
  return (
    <svg viewBox="80 40 860 540" role="img" aria-label={`Building section with ${DUCT_SPOTS.length} numbered duct locations`}
      {...(standalone ? { xmlns: 'http://www.w3.org/2000/svg', width: 860, height: 540, ...at } : {})}>
      {standalone && <style>{standaloneCss(p)}</style>}
      {standalone && <rect x="80" y="40" width="860" height="540" fill={p.bg} />}
      <defs>
        <pattern id="g-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={p.hatch} strokeWidth="2" />
        </pattern>
        <pattern id="g-earth" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
          <line x1="0" y1="0" x2="0" y2="10" stroke={p.earth} strokeWidth="1.5" />
        </pattern>
      </defs>
      {/* ground */}
      <rect x="80" y="520" width="820" height="60" fill="url(#g-earth)" opacity="0.55" />
      <rect x="120" y="510" width="220" height="56" fill={KIND.buried.fill} opacity="0.16" />
      {/* spaces */}
      {SPACES.map((r, i) => (
        <g key={i}>
          <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={KIND[r.kind].fill} opacity={p.fillOpacity} />
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
      <path d="M120 510 V210 H340 M400 120 H860 V520 M120 510 H340 M340 110 V520 M400 120 V520" stroke={p.line} strokeWidth="3" fill="none" />
      <path d="M400 320 H860 M400 470 H860 M120 380 H340" stroke={p.line} strokeWidth="1.5" fill="none" opacity="0.6" />
      <path d="M400 205 H860 M400 372 H860" stroke={p.line} strokeWidth="1" strokeDasharray="5 4" fill="none" opacity="0.6" />
      {/* vents */}
      {[130, 150, 482, 500].map((y) => <path key={y} d={`M862 ${y} l10 -4 M862 ${y + 6} l10 -4`} stroke={p.line} strokeWidth="1.5" />)}
      <text x="876" y="146" className="g-note">vented</text>
      <text x="876" y="498" className="g-note">vented</text>
      {/* rooftop unit and exhaust fan */}
      <rect x="420" y="60" width="100" height="52" rx="4" fill={p.unit} stroke={lit === 1 ? acc : p.line} strokeWidth={lit === 1 ? 3 : 1.5} />
      <text x="470" y="56" className="g-note" textAnchor="middle">Heating / cooling unit</text>
      <path d="M772 112 v-18 a14 14 0 0 1 28 0 v18" fill={p.unit} stroke={p.line} strokeWidth="1.5" />
      <text x="786" y="84" className="g-note" textAnchor="middle">Exhaust fan</text>
      {/* ducts */}
      {DUCTS.map((dct) => (
        <path
          key={dct.spot + dct.d}
          d={dct.d}
          fill="none"
          stroke={lit === dct.spot ? acc : p.duct}
          strokeWidth={dct.flex ? 6 : 11}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={lit === dct.spot ? 1 : 0.85}
        />
      ))}
      <rect x="690" y="362" width="44" height="12" rx="2" fill={lit === 9 ? acc : p.duct} />
      <rect x="784" y="366" width="32" height="7" rx="1.5" fill={lit === 15 ? acc : p.duct} />
      <path d="M860 170 V205" stroke={lit === 8 ? acc : p.line} strokeWidth={lit === 8 ? 7 : 3} />
      {/* markers */}
      {DUCT_SPOTS.map((p) => (
        <g
          key={p.n}
          className={`g-spot ${sel === p.n ? 'on' : ''}`}
          transform={`translate(${p.x} ${p.y})`}
          {...(onPick ? {
            role: 'button',
            tabIndex: 0,
            'aria-label': `${p.n}. ${p.label}`,
            'aria-pressed': sel === p.n,
            onClick: () => onPick(p.n),
            onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(p.n) } },
            onMouseEnter: () => onHover?.(p.n),
            onMouseLeave: () => onHover?.(null),
          } : {})}
        >
          <circle r={standalone && sel === p.n ? 15 : 12} fill={KIND[kindOf(p)].fill} />
          <text textAnchor="middle" dy="4.5">{p.n}</text>
        </g>
      ))}
    </svg>
  )
}
