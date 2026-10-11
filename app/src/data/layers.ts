import { systemInfo, type AssemblyParams } from '../geo/assembly'
import { INSULATION, JACKETS, layerCount, type InsulationId, type LayerId } from './catalog'
import { pipeSpec } from './pipes'

/**
 * Plain-language description of each layer in the build-up, for the layer list.
 * Statements about products come from research/materials-verified.json (the
 * source is named inline); construction numbers come from research/NOTES.md
 * (JM Metal Jacketing Install Guide).
 */

export interface LayerInfo {
  id: LayerId
  /** Built in 3D for this system. */
  present: boolean
  name: string
  value: string
  detail: string
}

const FACING_NONE: Record<InsulationId, string> = {
  calsil: 'Ships unfaced; field jacketed (JM Thermo-1200).',
  fiberglass: 'Plain section, no factory jacket (OC No-Wrap, JM Micro-Lok HP Plain); field jacketed.',
  'mineral-wool': 'Ships unfaced and is designed to be field jacketed (ROCKWOOL, JM).',
  'cellular-glass': 'Ships bare; pipe covering is fabricated from block (ASTM C1639).',
  elastomeric: 'None: the closed-cell skin is the finished surface indoors (Armacell).',
  phenolic: 'Plain section.',
  pir: 'Ships unfaced; half-sections fabricated from bunstock (JM, Kingspan).',
  aerogel: 'Unfaced blanket wrapped in layers (Pyrogel XTE); Cryogel Z carries a laminated vapor retarder (Aspen).',
  perlite: 'Ships unfaced; field jacketed (JM).',
  polyolefin: 'None: the polyethylene skin is the finish indoors (Armacell, K-FLEX).',
}

const FACING_ASJ: Partial<Record<InsulationId, string>> = {
  fiberglass: 'Factory ASJ with self-sealing lap and butt strips. JM ASJ 0.02 perm max; OC ASJ Max 0.01 perm. ASJ surface limit 150°F; not for long-term outdoor use.',
  phenolic: 'Factory-applied ASJ vapor barrier (Resolco standard); zero-perm Venture jackets for high-humidity areas.',
}

const VAPOR_COLD: Record<InsulationId, { facing?: string; membrane?: string; integral?: string }> = {
  fiberglass: {
    facing: 'The ASJ is the retarder: every self-seal lap and butt strip sealed, vapor-retarding mastic and tape at fittings (OC); staples not recommended (JM).',
  },
  phenolic: {
    facing: 'Factory ASJ vapor barrier, all joints sealed, vapor stops at terminations (Resolco install guide).',
    membrane: 'Outdoors: Polyguard Insulrap 30 under the aluminum (Resolco). Shown: Insulrap 30-NG, 30 mil, white, 0.00 perm; keep its surface ≤150°F in operation (Polyguard).',
  },
  'cellular-glass': {
    membrane: 'Joints sealed (PITTSEAL 444NS), then a vapor-retarder jacket or coating. Shown: PITTWRAP IW50 AL, 50 mil, 0.0009 perm, −4 to 167°F, under a metal or UV-resistant jacket. Colder lines: PITTCOTE 300E coating, −40 to 200°F (OC).',
  },
  elastomeric: {
    integral: 'Built in: closed-cell foam, 0.05 perm·in (AP ArmaFlex) / <0.01 perm·in (K-FLEX Insul-Tube). Every seam and butt joint glued.',
  },
  calsil: {},
  'mineral-wool': {},
  pir: {
    membrane: 'Separate retarder: 0.02 perm or less at or below 32°F, 0.03 above (JM), every joint sealed. Shown: Saranex 540 CX film, 4 mil, white.',
  },
  aerogel: {
    membrane: 'A primary vapor barrier over the outermost layer, a secondary one below −40°F, and vapor stops (Aspen cold-service manual). Shown: 50-mil foil-faced butyl.',
  },
  perlite: {},
  polyolefin: {
    integral: 'Closed-cell polyethylene, 0.02 perm·in (Tubolit, E96 Proc. A). Seal every seam; K-FLEX: cold lines in high humidity may need an added vapor barrier.',
  },
}

export function describeLayers(p: AssemblyParams): LayerInfo[] {
  const s = systemInfo(p)
  const ins = INSULATION[p.insulation]
  const pipe = pipeSpec(p.pipe, p.npsIndex)
  const J = JACKETS[s.jacketId]
  const out: LayerInfo[] = []

  out.push({
    id: 'pipe',
    present: true,
    name: 'Pipe',
    value: p.pipe === 'copper' ? `Copper ${pipe.nps}" Type L` : p.pipe === 'pvc' ? `PVC NPS ${pipe.nps}" Sch 40` : `Steel NPS ${pipe.nps}" Sch 40`,
    detail: p.pipe === 'copper'
      ? `${pipe.od}" OD, ${pipe.wall}" wall (ASTM B88, CDA Copper Tube Handbook).`
      : p.pipe === 'pvc'
        ? `${pipe.od}" OD, ${pipe.wall}" wall (ASTM D1785).`
        : `${pipe.od}" OD, ${pipe.wall}" wall (ASME B36.10M).${p.component === 'valve' ? ' Flanged gate valve, Class 150.' : ''}`,
  })

  const layers = layerCount(ins, p.thicknessIn)
  out.push({
    id: 'insulation',
    present: true,
    name: 'Insulation',
    value: `${ins.label} · ${p.thicknessIn}"`,
    detail: layers > 1
      ? `Two layers of ${p.thicknessIn / 2}", joints staggered. ${ins.sectionIn}" sections.`
      : `One layer, ${ins.sectionIn}" sections, ${ins.pieces === 'halves' ? 'half-shells with joints at 3 and 9 o’clock' : ins.pieces === 'tube' ? 'slit tube, seam glued' : 'hinged one-piece sections'}.`,
  })

  out.push(s.facing === 'asj'
    ? { id: 'facing', present: true, name: 'Facing', value: 'ASJ (all-service jacket)', detail: FACING_ASJ[ins.id] ?? 'Factory ASJ.' }
    : { id: 'facing', present: false, name: 'Facing', value: 'None', detail: FACING_NONE[ins.id] })

  const v = VAPOR_COLD[ins.id]
  if (s.service === 'hot') {
    out.push({ id: 'vapor', present: false, name: 'Vapor retarder', value: 'Not required', detail: 'Hot service: a vapor retarder is for below-ambient lines.' })
  } else if (s.vaporBy === 'integral') {
    out.push({ id: 'vapor', present: false, name: 'Vapor retarder', value: 'Built into the foam', detail: v.integral ?? '' })
  } else if (s.membrane) {
    out.push({ id: 'vapor', present: true, name: 'Vapor retarder', value: 'Sealed membrane', detail: v.membrane ?? 'Separate vapor retarder over the insulation.' })
  } else {
    out.push({ id: 'vapor', present: false, name: 'Vapor retarder', value: 'The ASJ facing', detail: v.facing ?? '' })
  }

  if (s.jacketId !== 'none') {
    const gauge = `${s.jacketThicknessIn.toFixed(3).replace(/^0/, '')}"`
    const band = `${s.bandWIn === 0.5 ? '½' : '¾'}" × 0.020" SS bands, ≤12" o.c. and on every lap`
    const fix = s.screws ? '#8 screws ≤8" o.c. on seams (hot work).' : 'No screws or other fasteners through the vapor retarder (JM).'
    const detail = J.metal
      ? `${gauge} ${s.jacketId === 'ss' ? 'T-304 stainless' : '3105/3003-H14 aluminum with 3-mil polyfilm moisture barrier'}, ${+s.longLapIn.toFixed(2)}" laps, ${band}. ${fix}${s.service === 'cold' ? ' Metal jacketing is not a vapor retarder (JM).' : ''}`
      : `20-mil PVC, longitudinal lap facing down. PVC fitting covers on elbows, ${s.service === 'hot' ? 'tacked (hot work)' : 'taped (cold work)'}.`
    out.push({ id: 'jacket', present: true, name: 'Jacket', value: J.label, detail })
  } else {
    const finish = s.facing === 'asj'
      ? 'The ASJ is the finish (indoors).'
      : ins.id === 'elastomeric'
        ? 'Indoors bare. Outdoors it must be painted or jacketed for UV (Armacell, K-FLEX).'
        : 'Bare insulation (for display; field practice jackets it).'
    out.push({ id: 'jacket', present: s.elbow === 'fitting-cover' && p.component === 'elbow', name: 'Jacket', value: 'None', detail: s.elbow === 'fitting-cover' ? `${finish} PVC fitting cover on the elbow.` : finish })
  }

  if (p.component === 'valve' && p.view !== 'exploded' && p.view !== 'section') {
    out.push({ id: 'blanket', present: true, name: 'Removable cover', value: 'Blanket on the valve', detail: 'Silicone-coated fiberglass cloth over 2 × 1" fiberglass mat, laced with stainless wire over lacing anchors.' })
  }
  return out
}
