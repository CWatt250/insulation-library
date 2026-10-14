import { renderToStaticMarkup } from 'react-dom/server'
import { DUCT_SPOTS } from '../sim/ductSpots'
import { KIND, kindOf, type Kind } from '../sim/ductKinds'
import { DuctDiagram } from '../ui/sim/DuctDiagram'

/**
 * The duct-location images WattBot sends: the guide's drawing with a title,
 * the legend and the source line baked in, so the picture explains itself
 * in a chat bubble. duct-locations-0 = all of them; -N = location N highlighted.
 */

const W = 860
const FONT = 'system-ui, -apple-system, Segoe UI, sans-serif'

/** Break a label into lines of at most `max` characters, at spaces. */
function wrap(text: string, max: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    if (line && (line + ' ' + word).length > max) { out.push(line); line = word } else line = line ? `${line} ${word}` : word
  }
  if (line) out.push(line)
  return out
}

function image(n: number | null): string {
  const spot = n === null ? null : DUCT_SPOTS.find((p) => p.n === n)!
  const kinds = (Object.keys(KIND) as Kind[]).filter((k) => k !== 'pending' || DUCT_SPOTS.some((p) => p.pending))
  const title = spot ? `${spot.n}. ${spot.label}` : 'Where does the duct run? DOE’s duct locations'
  const sub = spot ? KIND[kindOf(spot)].label : 'Colour = how ASHRAE 90.1-2019 classes the space'
  const subLines = wrap(sub, 78)
  const top = 44 + subLines.length * 22
  const legendTop = top + 540 + 22
  const legend: { y: number; fill: string; lines: string[]; on: boolean }[] = []
  let y = legendTop
  for (const k of kinds) {
    const lines = wrap(KIND[k].label, 74)
    legend.push({ y, fill: KIND[k].fill, lines, on: !!spot && kindOf(spot) === k })
    y += lines.length * 22 + 8
  }
  const srcTop = y + 10
  const H = srcTop + 44
  return renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} fontFamily={FONT}>
      <rect width={W} height={H} fill="#17181b" />
      <text x="24" y="36" fill="#f2f1ee" fontSize="26" fontWeight="750">{title}</text>
      {subLines.map((l, i) => <text key={i} x="24" y={62 + i * 22} fill={spot ? KIND[kindOf(spot)].fill : 'rgba(255,255,255,0.65)'} fontSize="17" fontWeight="600">{l}</text>)}
      <DuctDiagram lit={spot?.n ?? null} sel={spot?.n ?? null} standalone at={{ x: 0, y: top }} />
      {legend.map((row, i) => (
        <g key={i} opacity={!spot || row.on ? 1 : 0.55}>
          <circle cx="34" cy={row.y - 6} r="8" fill={row.fill} stroke={row.on ? '#fff' : 'none'} strokeWidth="2" />
          {row.lines.map((l, j) => <text key={j} x="52" y={row.y + j * 22} fill="#e9e8e4" fontSize="17" fontWeight={row.on ? 700 : 400}>{l}</text>)}
        </g>
      ))}
      <text x="24" y={srcTop + 4} fill="rgba(255,255,255,0.5)" fontSize="13">After DOE/PNNL, Duct Insulation and Sealing Requirements in Commercial Buildings, Figure 1; redrawn.</text>
      <text x="24" y={srcTop + 24} fill="rgba(255,255,255,0.5)" fontSize="13">Classification: ASHRAE 90.1-2019 Table 6.8.2 and 6.4.4.1.2 · Insulation Library, Watt Systems</text>
    </svg>,
  )
}

/** The drawing alone, light theme — BidWatt's Toolbox lays its own title, legend and tap targets over it. */
const drawing = (n: number | null) => renderToStaticMarkup(<DuctDiagram lit={n} sel={n} standalone theme="light" />)

/** file name → SVG text, for every image. */
export function ductImages(): Record<string, string> {
  const out: Record<string, string> = { 'duct-locations-0.svg': image(null), 'duct-drawing-light-0.svg': drawing(null) }
  for (const p of DUCT_SPOTS) {
    out[`duct-locations-${p.n}.svg`] = image(p.n)
    out[`duct-drawing-light-${p.n}.svg`] = drawing(p.n)
  }
  return out
}
