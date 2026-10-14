/**
 * The simulator for other Watt apps — one engine, so they always match
 * insulation-library.vercel.app. Plain JSON in, plain JSON out:
 *
 *   recommend(args)      thickness design for a pipe or duct
 *   ductLocation(args)   DOE's 14 duct locations + ASHRAE/IECC/WSEC minimums
 *   options()            the choices a form needs (sizes, materials, codes, counties, spots)
 *
 * Shipped two ways by scripts/build-wattbot.mjs:
 *   dist-wattbot/cli.mjs       Node stdin→stdout (watt-wattbot-worker deep mode)
 *   public/wattbot/engine.mjs  browser ES module (BidWatt Toolbox)
 */
import { INSULATIONS } from '../data/catalog'
import type { DuctService } from '../data/ductData'
import { PIPE_LABEL, type PipeMaterial } from '../data/pipe'
import { npsValue, pipeSizes } from '../data/pipes'
import { WA_COUNTIES } from '../data/wsecData'
import { codeMinimum, PIPE_CODES } from '../sim/code'
import { ductCode, waOptions } from '../sim/design'
import { DUCT_CODES, DUCT_LOCATIONS, DUCT_TYPE_AIR, DUCT_TYPES, type DuctCodeBasis, type DuctCodeResult, type DuctPlace, type DuctType } from '../sim/duct'
import { DUCT_SPOTS, spotRequirement } from '../sim/ductSpots'
import { DOE_SPOT_NOTES } from '../data/ductData'
import { physicsMode } from '../sim/model'
import { initialState, PRESETS } from '../sim/presets'
import { dewPointF } from '../sim/psychro'
import { DUCT_AIR, PIPE_USES, recommendation, START, type Answers } from '../sim/recommend'
import { describeAnswers, matLabel, recommendationNotes } from '../sim/recommendText'
import { refsFor } from '../sim/sources'
import type { SimState } from '../sim/types'
import { fmt } from '../sim/units'
import { vaporCheck } from '../sim/vapor'
import { KIND, kindOf } from '../sim/ductKinds'

export const SITE = 'https://insulation-library.vercel.app'
export const spotImage = (n: number | null) => `${SITE}/wattbot/duct-locations-${n ?? 0}.svg`
/** The drawing alone on a light background (BidWatt draws its own title, legend and tap targets). */
export const spotDrawing = (n: number | null) => `${SITE}/wattbot/duct-drawing-light-${n ?? 0}.svg`

export type Args = Record<string, unknown>
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined)
const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined)
const sources = (ids: string[]) => refsFor(ids).map((r) => ({ id: r.id, title: r.title, url: r.url }))

/** County name, case-insensitive, with or without "County". */
function county(v: unknown): { county: string; zone: '4C' | '5B' } | undefined {
  const s = str(v)?.toLowerCase().replace(/\s+county$/, '')
  return s ? WA_COUNTIES.find((c) => c.county.toLowerCase() === s) : undefined
}

/** A pipe size from "2", "1-1/2", "1.5", 1.5 → the index in that material's list. */
function sizeIndex(pipe: PipeMaterial, v: unknown): { index: number; note?: string } {
  const sizes = pipeSizes(pipe)
  const raw = str(v) ?? (num(v) !== undefined ? String(num(v)) : undefined)
  if (!raw) return { index: START.npsIndex, note: `no size given — used ${sizes[START.npsIndex].nps}"` }
  const want = /^[\d.]+$/.test(raw) ? Number(raw) : npsValue(raw.replace(/["\s]|in(ch)?$/g, '').replace(/\s+/, '-'))
  let best = 0
  sizes.forEach((p, i) => { if (Math.abs(npsValue(p.nps) - want) < Math.abs(npsValue(sizes[best].nps) - want)) best = i })
  const exact = Math.abs(npsValue(sizes[best].nps) - want) < 1e-6
  return { index: best, note: exact ? undefined : `${raw}" isn't a listed ${pipe} size — used ${sizes[best].nps}"` }
}

function answersFrom(a: Args): { answers: Answers; notes: string[] } {
  const notes: string[] = []
  const system = a.system === 'duct' ? 'duct' : 'pipe'
  if (system === 'duct') {
    const d = (a.duct ?? a) as Args
    const ductType = (DUCT_TYPES.some((t) => t.id === d.type) ? d.type : 'supply') as DuctType
    const ductLocation = (DUCT_LOCATIONS.some((l) => l.id === d.location) ? d.location : 'attic') as DuctPlace
    const c = county(d.county)
    const basis = (['ashrae', 'iecc', 'wsec'].includes(String(d.code)) ? d.code : c ? 'wsec' : 'ashrae') as DuctCodeBasis
    const zone = num(d.zone) ?? (c ? parseInt(c.zone, 10) : START.duct.climateZone)
    const shape = d.shape === 'rect' ? 'rect' : 'round'
    const air = { ...DUCT_AIR[ductLocation], ...DUCT_TYPE_AIR[ductType] }
    const answers: Answers = {
      ...START, system: 'duct', material: str(a.material) ?? 'auto',
      processF: num(a.processF) ?? air.processF ?? 55, ambientF: num(a.ambientF) ?? air.ambientF, rh: num(a.rh) ?? air.rh,
      duct: {
        ...START.duct, ductType, ductLocation,
        ductService: (['both', 'heating', 'cooling'].includes(String(d.service)) ? d.service : 'both') as DuctService,
        climateZone: zone, ductCodeBasis: basis, ductShape: shape,
        ductD: num(d.diameter) ?? START.duct.ductD, ductW: num(d.width) ?? START.duct.ductW, ductH: num(d.height) ?? START.duct.ductH,
        waCounty: c?.county ?? START.duct.waCounty,
      },
    }
    if (basis === 'wsec' && !c) notes.push(`no Washington county given — used ${START.duct.waCounty}`)
    return { answers, notes }
  }
  const pipe = (['steel', 'copper', 'pvc'].includes(String(a.pipe)) ? a.pipe : 'steel') as PipeMaterial
  const size = sizeIndex(pipe, a.size)
  if (size.note) notes.push(size.note)
  const use = PRESETS.find((p) => p.id === a.use && PIPE_USES.some((u) => u.id === p.id))
  const processF = num(a.processF) ?? use?.set.processF
  if (processF === undefined) throw new Error('give processF (fluid temperature, °F) or use (one of ' + PIPE_USES.map((u) => u.id).join(', ') + ')')
  const ambientF = num(a.ambientF) ?? use?.set.ambientF ?? START.ambientF
  const pipeCode = (PIPE_CODES.some((c) => c.id === a.code) ? a.code : 'ashrae') as SimState['pipeCodeBasis']
  const answers: Answers = {
    ...START, system: 'pipe', pipe, npsIndex: size.index,
    drain: a.drain === true || use?.mode === 'condensate', outdoors: a.outdoors === true,
    processF, ambientF, rh: num(a.rh) ?? use?.set.rh ?? START.rh,
    material: str(a.material) ?? 'auto', pipeCode,
  }
  return { answers, notes }
}

export function recommend(a: Args) {
  const { answers: ap, notes: inputNotes } = answersFrom(a)
  const r = recommendation(ap)
  const { s, d, ev, options, pick, mode } = r
  const T = (f: number) => fmt.temp(f, 'ip')
  const Q = (b: number) => `${fmt.flow(Math.abs(b), 'ip')} ${fmt.flowUnit('ip')}`
  const beh = physicsMode(s, mode)
  const vap = vaporCheck(s, mode, ev.ins)
  const thickness = d.noneNeeded ? 'not required' : d.thicknessIn === null ? `over ${fmt.thick(d.maxIn, 'ip')} (beyond the material's range)` : fmt.thick(d.thicknessIn, 'ip')
  const allSrc = new Set<string>()
  const rows = d.rows.map(({ c, rec }) => {
    c.src.forEach((x) => allSrc.add(x))
    return { requirement: c.label, needs: rec.thicknessIn === null ? `> ${fmt.thick(rec.maxIn, 'ip')}` : rec.alreadyMet ? 'met bare' : fmt.thick(rec.thicknessIn, 'ip'), governs: d.governing?.id === c.id }
  })
  const notes = recommendationNotes(ap, r, 'ip')
  notes.forEach((n) => n.src.forEach((x) => allSrc.add(x)))
  const out: Record<string, unknown> = {
    asked: describeAnswers(ap),
    service: mode === 'condensate' ? 'condensate drain' : beh,
    conditions: { fluid: T(s.processF), ambient: T(s.ambientF), rh: `${s.rh}%`, dewPoint: T(dewPointF(s.ambientF, s.rh)) },
    material: matLabel(s, pick),
    thickness,
    layers: d.layers,
    governedBy: d.governing?.label ?? null,
    requirements: rows,
    result: {
      surface: { insulated: T(ev.ins.result.surfaceF), bare: T(ev.bare.result.surfaceF) },
      heatFlow: { insulated: Q(ev.ins.result.qBtuHrFt), bare: Q(ev.bare.result.qBtuHrFt), reductionPct: Math.round(ev.reductionPct), kind: beh === 'hot' ? 'loss' : 'gain' },
      ...(beh === 'hot' ? { safeTouch: { limit: T(s.ppF), met: ev.ins.result.surfaceF <= s.ppF } } : { dewMargin: { margin: fmt.tempDelta(ev.ins.moisture.marginF, 'ip', 1), dewPoint: T(ev.ins.moisture.dewF), ok: ev.ins.moisture.marginF >= s.dewMarginF } }),
      ...(s.system === 'duct' && ev.ins.ratedR ? { ratedR: `R-${ev.ins.ratedR.toFixed(1)}` } : {}),
    },
    alternatives: options.filter((o) => o.id !== pick).slice(0, 6).map((o) => ({ material: o.label, thickness: o.design && o.design.thicknessIn !== null ? fmt.thick(o.design.thicknessIn, 'ip') : o.reason ?? `over ${fmt.thick(o.design?.maxIn ?? 4, 'ip')}` })),
    notes: [...inputNotes, ...notes.map((n) => n.text)],
    link: `${SITE}/?mode=recommend`,
    caveat: 'Preliminary estimate from the Insulation Library simulator; confirm against the project spec.',
  }
  if (vap) out.vaporRetarder = `${vap.code ? 'IMC 604.11' : 'ASHRAE guidance'}: ≤ ${vap.required} perm — ${vap.retarder.label}, ${vap.retarder.perm === null ? 'not published' : `${vap.retarder.upper ? '≤ ' : ''}${vap.retarder.perm.toFixed(3)} perm`}. ${vap.verdict}`
  if (s.system === 'duct') {
    const c = ductCode(s)
    c.src.forEach((x) => allSrc.add(x))
    out.energyCode = `${c.label}${c.derived ? ' (derived)' : ''}`
  } else if (mode !== 'condensate') {
    const c = codeMinimum(s, mode)
    if ('minIn' in c) { c.src.forEach((x) => allSrc.add(x)); out.energyCode = c.minR ? `${c.edition}: R-${c.minR} (≥ ${c.minIn.toFixed(2)}")` : `${c.edition}: ≥ ${c.minIn.toFixed(2)}"` }
  }
  out.sources = sources([...allSrc])
  return out
}

const reqOut = (r: DuctCodeResult | null) => r && ({
  minimum: r.R === null ? (r.notStated ? 'no R-value set' : 'no minimum') : `installed R-${r.R} minimum`,
  detail: r.label, derived: !!r.derived, sources: sources(r.src),
})

export function ductLocation(a: Args) {
  const c = county(a.county)
  const zone = num(a.zone) ?? (c ? parseInt(c.zone, 10) : 4)
  const service = (['both', 'heating', 'cooling'].includes(String(a.service)) ? a.service : 'both') as DuctService
  const s: SimState = { ...initialState('duct'), climateZone: zone, ductService: service, waCounty: c?.county ?? 'King' }
  const wa = waOptions(s)
  const n = num(a.spot)
  const base = {
    figure: 'DOE/PNNL, Duct Insulation and Sealing Requirements in Commercial Buildings, Figure 1 (redrawn). Classification: ASHRAE 90.1-2019 Table 6.8.2 and 6.4.4.1.2.',
    zone, service: service === 'both' ? 'heating & cooling' : `${service} only`,
    washington: c ? `${c.county} County, zone ${c.zone}` : `no county given — WSEC shown for King County (${wa.zone})`,
    legend: Object.values(KIND).filter((k) => k.label !== KIND.pending.label).map((k) => k.label),
    guide: `${SITE}/?mode=duct&guide=1`,
  }
  if (n === undefined) {
    return { ...base, image: spotImage(null), drawing: spotDrawing(null), locations: DUCT_SPOTS.map((p) => ({ spot: p.n, label: p.label, class: KIND[kindOf(p)].label, ashrae: reqOut(spotRequirement(p, service, zone, 'ashrae'))?.minimum ?? 'n/a — not a duct run' })) }
  }
  const spot = DUCT_SPOTS.find((p) => p.n === n)
  if (!spot) throw new Error('spot must be 1–14')
  const place = DUCT_LOCATIONS.find((l) => l.id === spot.place)
  const doe = DOE_SPOT_NOTES[spot.n]
  return {
    ...base, image: spotImage(spot.n), drawing: spotDrawing(spot.n), spot: spot.n, label: spot.label, class: KIND[kindOf(spot)].label,
    ashrae: reqOut(spotRequirement(spot, service, zone, 'ashrae')),
    iecc: reqOut(spotRequirement(spot, service, zone, 'iecc')),
    wsec: reqOut(spotRequirement(spot, service, zone, 'wsec', wa)),
    rule: spot.rule ?? null, why: place?.why ?? null,
    doeNote: doe ? { quote: doe.quote, page: doe.page, source: sources(['D_C27'])[0] ?? null } : null,
  }
}

/** Everything a form needs to offer valid choices — read from the same data the site uses. */
export function options() {
  return {
    site: SITE,
    pipes: (['steel', 'copper', 'pvc'] as PipeMaterial[]).map((id) => ({
      id, label: id === 'steel' ? 'Steel' : PIPE_LABEL[id], sizes: pipeSizes(id).map((p) => p.nps), defaultSize: pipeSizes(id)[START.npsIndex]?.nps ?? pipeSizes(id)[0].nps,
    })),
    uses: PIPE_USES.map((u) => {
      const p = PRESETS.find((x) => x.id === u.id)!
      return { id: u.id, label: u.label, processF: p.set.processF, ambientF: p.set.ambientF, rh: p.set.rh ?? START.rh, drain: p.mode === 'condensate' }
    }),
    materials: INSULATIONS.map((m) => ({ id: m.id, label: m.label })),
    pipeCodes: PIPE_CODES.map((c) => ({ id: c.id, label: c.label, hint: c.hint })),
    ductCodes: DUCT_CODES.map((c) => ({ id: c.id, label: c.label, hint: c.hint ?? '' })),
    ductTypes: DUCT_TYPES.map((t) => ({ id: t.id, label: t.label })),
    ductLocations: DUCT_LOCATIONS.map((l) => ({ id: l.id, label: l.label, short: l.short })),
    waCounties: WA_COUNTIES.map((c) => ({ county: c.county, zone: c.zone })),
    spots: DUCT_SPOTS.map((p) => ({ n: p.n, label: p.label, x: p.x, y: p.y, fill: KIND[kindOf(p)].fill, kind: kindOf(p) })),
    kinds: (Object.keys(KIND) as (keyof typeof KIND)[]).filter((k) => k !== 'pending').map((k) => ({ id: k, fill: KIND[k].fill, label: KIND[k].label })),
    /** The drawings' viewBox, to place tap targets over them: x, y, width, height. */
    drawingBox: [80, 40, 860, 540],
  }
}

export const OPS: Record<string, (a: Args) => unknown> = { recommend, duct_location: ductLocation, options }
