import * as THREE from 'three'
import { ductAssembly, type DuctParams } from './duct'
import { sweep, annulusProfile, bandProfile, type Profile, type ProfileEdge } from './sweep'
import { IN, aluminumGauge, stainlessGauge, type PipeMaterial } from '../data/pipe'
import { pipeSpec } from '../data/pipes'
import { Slot } from '../materials/library'
import {
  INSULATION, JACKETS, layerCount,
  type FacingId, type InsulationId, type JacketId, type InsulationVisual, type JacketVisual, type LayerId, type OuterJacketId, type ServiceId,
} from '../data/catalog'

/**
 * Insulated piping assemblies, built to field practice (JM Metal Jacketing
 * Install Guide, ASTM C1729/C1767, MICA plates):
 *  - Sch 40 steel pipe at true ASME OD; 90° long-radius elbows (R = 1.5 × NPS)
 *  - insulation in 36" half-shell sections, joints at 3 & 9 o'clock,
 *    double-layered with staggered joints above 3"; mitered segments on elbows
 *  - metal jacket in 36" sheets, 2" circumferential laps, longitudinal lap at
 *    ~4 o'clock opening down; gored elbow covers, each gore lapping the one
 *    below; upper pieces always lap over lower pieces to shed water
 *  - ½" × 0.020" SS bands on every circumferential lap and ≤12" o.c., wing seals
 *  - hot work only: #8 screws ≤8" o.c. on straight seams, 3" o.c. on elbow gores
 *    (JM guide 04/23/24; never through a vapor retarder)
 *
 * Every piece is built in a local frame with the pipe axis on +z, then placed.
 * θ = 0 → local +x, θ = 90° → local +y.
 */

export type ViewMode = 'installed' | 'cutaway' | 'layers' | 'exploded' | 'section'
export type Component = 'straight' | 'elbow' | 'tee' | 'valve' | 'flange'

export interface AssemblyParams {
  component: Component
  npsIndex: number
  thicknessIn: number
  insulation: InsulationId
  /** Outer jacket. Legacy 'asj' / 'fsk' mean an ASJ-faced section with no outer jacket. */
  jacket: JacketId
  /** Factory facing; defaults to the material's first option. */
  facing?: FacingId
  /** Hot or cold (below-ambient) service; defaults to the material's first option. */
  service?: ServiceId
  view: ViewMode
  /** Straight-run length (m) for long installed runs, e.g. wall to wall in the mech room. */
  span?: number
  /** Pipe material; sizes index into that material's list (data/pipes.ts). Default steel. */
  pipe?: PipeMaterial
  /** Ductwork instead of pipe (geo/duct.ts); the view comes from `view`. */
  duct?: Omit<DuctParams, 'view'>
  /** Metal elbow cover style; 'auto' = pressed through 12" NPS, gored above (JM guide). */
  elbowCover?: 'auto' | 'pressed' | 'gored'
}

export interface Part {
  key: string
  geometry: THREE.BufferGeometry
  layer: LayerId
  /** Exploded view: how far (m, local +y) this top half lifts off. */
  lift?: number
}

/** A labelled point on the model (local frame) for the Layers view. */
export interface Callout {
  title: string
  detail: string
  pos: [number, number, number]
  /** Label above or below the pipe (alternated), or to the right for vertical runs. */
  side?: 'up' | 'down' | 'right'
  /** Leader length tier (0, 1, 2). */
  tier?: number
  /** Layer it describes, so labels hide with their layer. */
  layer?: LayerId
}

/**
 * An exposed surface the simulation effects play on, in its own frame (axis +z):
 * a run of insulated pipe, a bare stub sticking out past the insulation, or the
 * fitting itself (valve or flange cover). `matrix` places the frame in the
 * assembly; `vertical` frames have +z pointing up.
 */
export interface SimZone {
  key: string
  kind: 'run' | 'stub' | 'fitting'
  matrix?: THREE.Matrix4
  vertical?: boolean
  z0: number
  z1: number
  /** Exposed radius when insulated; and when the whole system is shown bare. */
  radius: number
  rBare: number
  /** Span when the whole system is shown bare (covers the stubs, which are then skipped); null = skip. */
  bareZ?: [number, number] | null
  wedge?: [number, number]
  zWedge?: number
  /** Rectangular duct: exposed half-width and half-height (insulated, and shown bare), m. */
  box?: [number, number]
  boxBare?: [number, number]
}

export interface Assembly {
  parts: Part[]
  /** Exposed surfaces for the simulation overlays. */
  zones?: SimZone[]
  /** Outermost radius on straight runs, for sizing cradles. */
  outerRadius: number
  /** Cradle stations along the horizontal run's z axis. */
  cradles: number[]
  /** Horizontal run extent along z, used to centre the model. */
  zMin: number
  zMax: number
  yMax: number
  callouts: Callout[]
  /** Model points the right-hand label column must clear (local frame). */
  extent?: [number, number, number][]
  /** Ducts: flat-topped stands instead of pipe cradles, and a floor lowered under tall ducts. */
  stands?: { halfW: number; bottomY: number; stations: number[] }
  floorY?: number
}

const TAU = Math.PI * 2
const DEG = Math.PI / 180

/** Deterministic hash → small shade shift, so no two insulation pieces match exactly. */
function pieceTint(key: string, amount = 0.05): [number, number, number] {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  const r = ((h >>> 0) % 1000) / 1000 - 0.5
  const w = (((h >>> 10) % 1000) / 1000 - 0.5) * 0.4
  return [1 + amount * r + amount * w, 1 + amount * r, 1 + amount * r - amount * w]
}

/** Split [a, b] into the sub-intervals that avoid the wedge (repeated every 2π). */
function visibleIntervals(a: number, b: number, wedge: [number, number] | null): [number, number][] {
  if (!wedge) return [[a, b]]
  let parts: [number, number][] = [[a, b]]
  const k0 = Math.floor((a - wedge[1]) / TAU)
  const k1 = Math.ceil((b - wedge[0]) / TAU)
  for (let k = k0; k <= k1; k++) {
    const w0 = wedge[0] + k * TAU
    const w1 = wedge[1] + k * TAU
    const next: [number, number][] = []
    for (const [s, e] of parts) {
      if (e <= w0 || s >= w1) next.push([s, e])
      else {
        if (s < w0) next.push([s, w0])
        if (e > w1) next.push([w1, e])
      }
    }
    parts = next
  }
  return parts.filter(([s, e]) => e - s > 1e-4)
}

function npsValue(nps: string): number {
  // "1-1/2" → 1.5, "3/4" → 0.75, "4" → 4
  return nps.split('-').reduce((sum, part) => {
    const [a, b] = part.split('/').map(Number)
    return sum + (b ? a / b : a)
  }, 0)
}

// ------------------------------------------------------------------ dimensions

interface Dims {
  pipe: PipeMaterial
  rPipe: number
  rBore: number
  T: number
  layers: number
  rIns0: number
  rInsOut: number
  ins: InsulationVisual
  /** Outer jacket (JACKETS.none when the facing or bare insulation is the finish). */
  J: JacketVisual
  jacketId: OuterJacketId
  metal: boolean
  /** An outer jacket at all. */
  jacketed: boolean
  service: ServiceId
  cold: boolean
  /** Factory facing (ASJ) on the insulation sections, or null. */
  F: JacketVisual | null
  rF: number
  tF: number
  /** Cold service: how the vapor retarder is provided. */
  vaporBy: 'none' | 'facing' | 'integral' | 'membrane'
  /** A separate vapor-retarder membrane is built. */
  membrane: boolean
  rV: number
  tV: number
  /** Hot service with metal jacket: screws on seams (never through a vapor retarder). */
  screws: boolean
  /** Resolved elbow covering. */
  elbow: 'pressed' | 'gores' | 'fitting-cover' | 'taped-gores' | 'none'
  npsNominal: number
  t: number
  rJ: number
  /** Outermost finished surface on straight runs. */
  rFinish: number
  odIn: number
  bandW: number
  bandT: number
  longLap: number
  bendR: number
}

const RAMP = 0.004

/** Vapor-retarder membrane laid over the insulation: 36" widths, 2" laps both ways. */
const MEMBRANE: JacketVisual = { id: 'none', label: 'Vapor retarder', metal: false, sheetIn: 36, circLapIn: 2, longLapIn: 2, bands: false, elbow: 'none' }

/** Resolve facing, service and jacket into the system actually built (also used by the UI). */
export function resolveSystem(p: Pick<AssemblyParams, 'insulation' | 'jacket' | 'facing' | 'service'>) {
  const ins = INSULATION[p.insulation]
  let jacketId = p.jacket as OuterJacketId
  let facing: FacingId = p.facing ?? ins.facings[0]
  if (p.jacket === 'asj' || p.jacket === 'fsk') {
    facing = 'asj'
    jacketId = 'none'
  }
  if (!ins.facings.includes(facing)) facing = ins.facings[0]
  const service: ServiceId = p.service && ins.services.includes(p.service) ? p.service : ins.services[0]
  // a cold fibrous system needs its ASJ: the facing is the vapor retarder
  if (service === 'cold' && ins.vapor.kind === 'facing' && ins.facings.includes('asj')) facing = 'asj'
  let vaporBy: Dims['vaporBy'] = 'none'
  let membrane = false
  if (service === 'cold') {
    if (ins.vapor.kind === 'integral') vaporBy = 'integral'
    else if (ins.vapor.kind === 'facing' && facing === 'asj') {
      vaporBy = 'facing'
      membrane = !!ins.vapor.membraneUnder?.includes(jacketId)
    } else {
      vaporBy = 'membrane'
      membrane = true
    }
  }
  return { ins, jacketId, facing, service, vaporBy, membrane }
}

function dims(p: AssemblyParams): Dims {
  const pipe = pipeSpec(p.pipe, p.npsIndex)
  const rPipe = (pipe.od / 2) * IN
  const T = p.thicknessIn * IN
  const rIns0 = rPipe + 0.0004
  const rInsOut = rIns0 + T
  const odIn = (rInsOut * 2) / IN
  const sys = resolveSystem(p)
  const { ins, jacketId } = sys
  const J = JACKETS[jacketId]
  const metal = J.metal
  const cold = sys.service === 'cold'
  const F = sys.facing === 'asj' ? JACKETS.asj : null
  const t = metal ? (jacketId === 'ss' ? stainlessGauge(odIn) : aluminumGauge(odIn, ins.rigid)) * IN : J.t ?? 0
  // Each sheet layer clears the waviness of the one beneath it so ripples never touch.
  const CLR = 0.0002
  const WAVE = 0.0012
  const wJ = metal ? 1 : jacketId === 'pvc' ? 0.45 : 0.25
  const tF = F ? F.t ?? 0.0003 : 0
  const rF = rInsOut + CLR + WAVE * 0.25
  let outer = F ? rF + 2 * tF : rInsOut
  let wPrev = F ? 0.25 : 0
  const tV = sys.membrane ? (ins.vapor.membrane?.mil ?? 30) * 0.001 * IN : 0
  const rV = outer + CLR + WAVE * (wPrev + 0.3)
  if (sys.membrane) {
    outer = rV + 2 * tV
    wPrev = 0.3
  }
  const rJ = outer + CLR + WAVE * (wPrev + wJ)
  const jacketed = jacketId !== 'none'
  return {
    ins,
    J,
    jacketId,
    jacketed,
    service: sys.service,
    cold,
    F,
    rF,
    tF,
    vaporBy: sys.vaporBy,
    membrane: sys.membrane,
    rV,
    tV,
    screws: metal && !cold,
    elbow: metal
      ? (p.elbowCover === 'gored' || (p.elbowCover !== 'pressed' && npsValue(pipe.nps) > 12) ? 'gores' : 'pressed')
      : jacketId === 'pvc' ? 'fitting-cover'
      : F ? (ins.id === 'fiberglass' ? 'fitting-cover' : 'taped-gores')
      : 'none',
    npsNominal: npsValue(pipe.nps),
    rPipe,
    rBore: rPipe - pipe.wall * IN,
    pipe: p.pipe ?? 'steel',
    T,
    layers: layerCount(ins, p.thicknessIn),
    rIns0,
    rInsOut,
    metal,
    t,
    rJ,
    rFinish: jacketed ? rJ + 2 * t : outer,
    odIn,
    bandW: (odIn >= 16 ? 0.75 : 0.5) * IN,
    bandT: 0.02 * IN,
    longLap: (metal && odIn >= 16 ? 3 : J.longLapIn) * IN,
    bendR: Math.max(1.5 * npsValue(pipe.nps), 1.5) * IN,
  }
}

// ------------------------------------------------------------------ hardware

/** #8 hex-washer-head sheet-metal screw, built pointing +z from the origin. */
function screwGeometry(): THREE.BufferGeometry {
  const washer = new THREE.CylinderGeometry(0.0052, 0.0054, 0.0008, 24)
  washer.rotateX(Math.PI / 2)
  washer.translate(0, 0, 0.0004)
  const hex = new THREE.CylinderGeometry(0.0040, 0.0040, 0.0032, 6)
  hex.rotateX(Math.PI / 2)
  hex.translate(0, 0, 0.0008 + 0.0016)
  return mergeGeos([washer, hex].map((g) => withGroup(g.toNonIndexed(), Slot.Screw)))
}

/** Place a +z-pointing part at (r, θ, z) in a pipe-local frame, facing outward. */
function placeRadial(g: THREE.BufferGeometry, r: number, theta: number, z: number): THREE.BufferGeometry {
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(Math.cos(theta), Math.sin(theta), 0),
  )
  m.compose(new THREE.Vector3(r * Math.cos(theta), r * Math.sin(theta), z), q, new THREE.Vector3(1, 1, 1))
  return g.clone().applyMatrix4(m)
}

// ------------------------------------------------------------------ straight

interface SegOpts {
  key: string
  z0: number
  z1: number
  /** Pipe protrusion past the insulation at each end (0 = continues into a fitting). */
  pipeExt: [number, number]
  /** Stepped cutaway presentation at z1, removing this θ wedge. */
  cutaway: [number, number] | null
  /** Where the wedge starts (default 18" from z1); -Infinity cuts the whole run. */
  wedgeFrom?: number
  /** Jacket's first sheet rides up over the previous piece (it is the upper piece). */
  raisedStart: boolean
  /** The next piece laps over this one's end: add its lip here. */
  lipAtEnd: boolean
  /** Longitudinal lap free edge angle. */
  seamTheta: number
  /** Wing seal angle. */
  sealTheta: number
  /** Layers view: telescoping step-down at z1 (no wedge) with callouts. */
  steps?: boolean
  callouts?: Callout[]
  /** Exploded view: build only this half; top halves get a lift per layer. */
  half?: 'top' | 'bottom'
  /** Skip the pipe (the exploded view builds it once, whole). */
  noPipe?: boolean
  /** Exploded view: lift (m) per layer index, counted outward from the first insulation layer. */
  liftStep?: number
}

type AddFn = (key: string, g: THREE.BufferGeometry, layer: LayerId, lift?: number) => void

/** One sheet layer over the insulation: factory facing, vapor-retarder membrane or outer jacket. */
interface SheetSys {
  layer: LayerId
  J: JacketVisual
  r: number
  t: number
  wavy: number
  zEnd: number
  longLap: number
  seam: number
  mats: { outer: number; inner: number; edge: number; tape: number }
  /** Factory sections (ASJ): one sheet per insulation section, butt strips at the joints. */
  factory: boolean
  bands: boolean
  screws: boolean
  /** Carries the lap lip for the fitting cover that follows. */
  outermost: boolean
  lift: number
}

/** The sheet layers over the insulation, inside to out. */
function sheetStack(d: Dims, o: { seamTheta: number }): Omit<SheetSys, 'zEnd' | 'lift'>[] {
  const out: Omit<SheetSys, 'zEnd' | 'lift'>[] = []
  if (d.F) {
    out.push({
      layer: 'facing', J: d.F, r: d.rF, t: d.tF, wavy: 0.25, longLap: d.F.longLapIn * IN, seam: o.seamTheta,
      mats: { outer: Slot.Facing, inner: Slot.FacingInner, edge: Slot.FacingEdge, tape: Slot.FacingTape },
      factory: true, bands: false, screws: false, outermost: false,
    })
  }
  if (d.membrane) {
    out.push({
      layer: 'vapor', J: MEMBRANE, r: d.rV, t: d.tV, wavy: 0.3, longLap: MEMBRANE.longLapIn * IN, seam: o.seamTheta - 70 * DEG,
      mats: { outer: Slot.Vapor, inner: Slot.Vapor, edge: Slot.VaporEdge, tape: Slot.Vapor },
      factory: false, bands: false, screws: false, outermost: false,
    })
  }
  if (d.jacketed) {
    out.push({
      layer: 'jacket', J: d.J, r: d.rJ, t: d.t, wavy: d.J.metal ? 1 : d.J.id === 'pvc' ? 0.45 : 0.25, longLap: d.longLap, seam: o.seamTheta,
      mats: { outer: Slot.JacketOuter, inner: Slot.JacketInner, edge: Slot.JacketEdge, tape: Slot.Tape },
      factory: false, bands: d.J.bands, screws: d.screws, outermost: false,
    })
  }
  if (out.length) out[out.length - 1].outermost = true
  return out
}

function straightSegment(d: Dims, o: SegOpts): Part[] {
  const parts: Part[] = []
  const add: AddFn = (key, geometry, layer, lift = 0) => parts.push({ key: `${o.key}-${key}`, geometry, layer, lift: lift || undefined })
  const { z0, z1 } = o
  const cut = o.cutaway
  const zWedge = cut ? o.wedgeFrom ?? z1 - 18 * IN : Infinity
  const top = o.half === 'top'
  const liftOf = (i: number) => (top ? (o.liftStep ?? 0) * (i + 1) : 0)
  // Layers view: each layer steps back from the one beneath it, like a
  // catalogue section: pipe → inner layer → outer layer → facing → retarder → jacket.
  const STEP_INS = 2.5 * IN
  const insEnd = (L: number) => (o.steps ? z1 - L * STEP_INS : z1)
  const BARRIER_SHOW = d.metal && d.J.id !== 'ss' ? 1 * IN : 0
  const stack = sheetStack(d, o)
  const sheets: SheetSys[] = []
  {
    let zPrev = insEnd(d.layers - 1)
    stack.forEach((s, i) => {
      const isJacket = s.layer === 'jacket'
      let zEnd = z1
      if (o.steps) zEnd = zPrev - 3 * IN - (isJacket ? BARRIER_SHOW : 0)
      else if (cut && !o.half) zEnd = isJacket ? z1 - 4 * IN : z1 - (1.5 + i) * IN
      zPrev = zEnd
      sheets.push({ ...s, zEnd, lift: liftOf(d.layers + i) })
    })
  }

  // Pipe
  if (!o.noPipe) {
    const pipeMats = { outer: Slot.PipeOuter, inner: Slot.PipeBore, end: Slot.PipeEnd }
    add('pipe', sweep(
      annulusProfile(d.rBore, d.rPipe, z0 - o.pipeExt[0], z1 + o.pipeExt[1], pipeMats, 0.0006, [o.pipeExt[0] > 0, o.pipeExt[1] > 0]),
      { segments: 128 },
    ), 'pipe')
  }

  // Insulation
  const insMats = { outer: Slot.InsSkin, inner: Slot.InsBore, end: Slot.InsCut }
  const BUTT_GAP = 0.0006
  const SEAM_GAP = 0.0008
  const SECTION = d.ins.sectionIn * IN
  const endUv = d.ins.layered ? 'polar' as const : 'planar' as const
  const capUv = d.ins.layered ? 'zr' as const : 'rz' as const
  for (let L = 0; L < d.layers; L++) {
    const rIn = d.rIns0 + (d.T * L) / d.layers
    const rOut = d.rIns0 + (d.T * (L + 1)) / d.layers
    // successive layers alternate seams by 90° and stagger butt joints by half a section
    const seamRot = L % 2 ? 90 * DEG : 0
    const zOff = L % 2 ? -SECTION / 2 : 0
    const halfGap = SEAM_GAP / rOut
    const zE = insEnd(L)
    for (let zs = z0 + zOff; zs < zE; zs += SECTION) {
      const s0 = Math.max(z0, zs) + (zs > z0 ? BUTT_GAP / 2 : 0)
      const s1 = Math.min(zE, zs + SECTION) - (zs + SECTION < zE ? BUTT_GAP / 2 : 0)
      const spans: [number, number, boolean][] =
        zWedge > s0 && zWedge < s1 ? [[s0, zWedge, false], [zWedge, s1, true]] : [[s0, s1, s0 >= zWedge]]
      spans.forEach(([a0, a1, wedged], si) => {
        const freeStart = Math.abs(a0 - z0) < 1e-6 && o.pipeExt[0] > 0
        const freeEnd = Math.abs(a1 - zE) < 1e-6 && o.pipeExt[1] > 0
        const bevel = L === d.layers - 1 ? d.ins.edge : 0
        pieceArcs(d.ins, seamRot, halfGap).forEach(([a, b], h) => {
          for (const [ta, tb] of visibleIntervals(a, b, wedged ? cut : null)) {
            add(`ins-${L}-${zs.toFixed(3)}-${si}-${h}-${ta.toFixed(3)}`, sweep(
              annulusProfile(rIn, rOut, a0, a1, insMats, bevel, [freeStart, freeEnd], endUv),
              { theta0: ta, theta1: tb, segments: 128, capMat: Slot.InsCut, capUv, tint: pieceTint(`${o.key}${L}-${zs.toFixed(3)}-${h}`) },
            ), 'insulation', liftOf(L))
          }
        })
      })
    }
  }
  // Callouts for the Layers view (θ = 90° is the top of the pipe).
  const C = o.callouts
  if (o.steps && C) {
    const pipe = NPS_LABEL(d)
    C.push({ title: pipe.title, detail: pipe.detail, pos: [0, d.rPipe, z1 + o.pipeExt[1] * 0.55], layer: 'pipe' })
    for (let L = d.layers - 1; L >= 0; L--) {
      const rOut = d.rIns0 + (d.T * (L + 1)) / d.layers
      const next = L === d.layers - 1 ? (sheets[0] ? sheets[0].zEnd + (sheets[0].layer === 'jacket' ? BARRIER_SHOW : 0) : z1 - 4 * IN) : insEnd(L + 1)
      const each = d.T / d.layers / IN
      C.push({
        title: d.ins.label,
        detail: d.layers > 1 ? `${L === 0 ? 'Inner' : 'Outer'} layer, ${each}" · joints staggered` : `${d.T / IN}" thick`,
        pos: [0, rOut, (next + insEnd(L)) / 2],
        layer: 'insulation',
      })
    }
  }

  sheets.forEach((s, i) => {
    const next = sheets[i + 1]
    sheetLayer(d, o, s, add, cut, zWedge, BARRIER_SHOW)
    if (o.steps && C && s.layer !== 'jacket') {
      const zNext = next ? next.zEnd + (next.layer === 'jacket' ? BARRIER_SHOW : 0) : s.zEnd - 4 * IN
      C.push({ ...sheetCallout(d, s.layer), pos: [0, s.r + s.t, (s.zEnd + zNext) / 2], layer: s.layer })
    }
  })
  return parts
}

function sheetCallout(d: Dims, layer: LayerId): { title: string; detail: string } {
  if (layer === 'facing') return { title: 'ASJ facing', detail: `Factory kraft/foil/scrim · ${d.F?.longLapIn}" self-seal lap` }
  if (layer === 'vapor') return { title: 'Vapor retarder', detail: 'Sealed membrane, all laps and joints' }
  return { title: d.J.label, detail: jacketDetail(d) }
}

function sheetLayer(d: Dims, o: SegOpts, s: SheetSys, add: AddFn, cut: [number, number] | null, zWedge: number, BARRIER_SHOW: number) {
  const { z0, z1 } = o
  const { t, J } = s
  const rJ = s.r
  const L = s.layer
  const lift = s.lift
  const zJacketEnd = s.zEnd
  const SHEET = J.sheetIn * IN
  const CIRC_LAP = J.circLapIn * IN
  const longLapAng = s.longLap / rJ
  const thEnd = s.seam
  const thStart = thEnd - longLapAng - TAU
  const rampAng = RAMP / rJ
  const rOffset = (th: number) => {
    const st = thEnd - longLapAng - rampAng
    if (th <= st) return 0
    if (th >= thEnd - longLapAng) return t
    return (t * (th - st)) / rampAng
  }
  const pitch = SHEET - CIRC_LAP
  const sheetStarts: number[] = []
  // factory facings come on the insulation sections themselves
  if (s.factory) {
    for (let z = z0; z < zJacketEnd - 1e-6; z += d.ins.sectionIn * IN) sheetStarts.push(z)
  } else
  for (let z = z0; z < zJacketEnd - 1e-6; z += pitch) sheetStarts.push(z)

  // Band stations: one on every circumferential lap, intermediates ≤ 12" o.c.
  const bandZ: number[] = []
  if (s.bands) {
    sheetStarts.forEach((zs, k) => k > 0 && bandZ.push(zs + CIRC_LAP / 2))
    const startBand = z0 + (o.raisedStart ? 1.25 : 0.75) * IN
    const endBand = zJacketEnd - (o.lipAtEnd ? 1 : 0.75) * IN
    const anchors = [startBand, ...bandZ, endBand]
    for (let i = 0; i < anchors.length - 1; i++) {
      const span = anchors[i + 1] - anchors[i]
      const nInt = Math.ceil(span / (12 * IN)) - 1
      for (let j = 1; j <= nInt; j++) bandZ.push(anchors[i] + (span * j) / (nInt + 1))
    }
    bandZ.push(startBand, endBand)
  }

  // Real sheet metal is never a perfect cylinder: each sheet gets its own
  // long-wave waviness (0.4–0.8 mm over 60–400 mm), the run is faintly oval,
  // and the jacket is pulled in under every band and bulges between them.
  // Waves fade near sheet ends and bands so laps and straps still sit flush.
  const wavy = s.wavy
  const salt = L.length * 13.1
  const hash = (k: number, sl: number) => {
    const x = Math.sin((k + 1) * 127.1 + sl * 311.7 + o.key.length * 74.7 + salt) * 43758.5453
    return x - Math.floor(x)
  }
  const ovalPhase = hash(99, 1) * TAU
  const sheetDisp = (k: number, zs: number, ze: number) => {
    const l1 = 0.15 + 0.25 * hash(k, 2), p1 = hash(k, 3) * TAU, a1 = 0.00055 * (0.6 + 0.6 * hash(k, 4))
    const l2 = 0.06 + 0.06 * hash(k, 5), p2 = hash(k, 6) * TAU, a2 = 0.00025
    const cphi = hash(k, 7) * TAU
    return (th: number, z: number) => {
      const edge = Math.min(1, Math.max(0, Math.min(z - zs, ze - z) / 0.06))
      const nearBand = bandZ.reduce((m, b) => Math.min(m, Math.abs(z - b)), 1)
      const free = edge * (1 - Math.exp(-((nearBand / 0.025) ** 2)))
      const waves =
        a1 * Math.sin((TAU * z) / l1 + p1) * (0.65 + 0.35 * Math.cos(th + cphi)) +
        a2 * Math.sin((TAU * z) / l2 + p2 + Math.sin(th * 2 + p1))
      const oval = 0.00025 * Math.cos(2 * (th - ovalPhase))
      const pinch = s.bands ? -0.00028 * Math.exp(-((nearBand / 0.012) ** 2)) : 0
      return wavy * (free * waves + oval) + pinch
    }
  }

  const edgeMat: ProfileEdge = { mat: s.mats.edge, uv: 'planar' }
  sheetStarts.forEach((zs, k) => {
    const ze = Math.min(s.factory ? (sheetStarts[k + 1] ?? zJacketEnd) - 0.0002 : zs + SHEET, zJacketEnd)
    const lapLen = k > 0 && CIRC_LAP > 0 ? CIRC_LAP : o.raisedStart && !s.factory && s.outermost ? 0 : -1
    const rAt = (z: number) => {
      if (lapLen < 0) return rJ
      if (z <= zs + lapLen) return rJ + t
      if (z >= zs + lapLen + RAMP) return rJ
      return rJ + t * (1 - (z - zs - lapLen) / RAMP)
    }
    const breaks = [zs, ze]
    if (lapLen >= 0) breaks.push(zs + lapLen, zs + lapLen + RAMP)
    // resolves the waviness; facings and membranes barely ripple, so they get a coarser mesh
    const fine = s.wavy >= 0.45
    const step = fine ? 0.015 : 0.05
    for (let z = zs + step; z < ze - 0.005; z += step) breaks.push(z)
    const disp = sheetDisp(k, zs, ze)
    const shade = 1 + (hash(k, 8) - 0.5) * 0.08
    const tint: [number, number, number] = [shade, shade, shade * (1 + (hash(k, 9) - 0.5) * 0.01)]
    const uvOffset: [number, number] = [hash(k, 10) * 0.9, hash(k, 11) * 0.9]
    const zsplit = zWedge > zs && zWedge < ze ? [zs, zWedge, ze] : [zs, ze]
    for (let i = 0; i < zsplit.length - 1; i++) {
      const [a0, a1] = [zsplit[i], zsplit[i + 1]]
      const zz = [...new Set(breaks.filter((z) => z >= a0 - 1e-9 && z <= a1 + 1e-9).concat([a0, a1]))]
        .filter((z, idx, arr) => arr.findIndex((y) => Math.abs(y - z) < 1e-7) === idx)
        .sort((a, b) => a - b)
      const pts: [number, number][] = []
      const edges: ProfileEdge[] = []
      zz.forEach((z, j) => {
        pts.push([rAt(z), z])
        edges.push(j < zz.length - 1 ? { mat: s.mats.inner } : edgeMat)
      })
      for (let j = zz.length - 1; j >= 0; j--) {
        pts.push([rAt(zz[j]) + t, zz[j]])
        edges.push(j > 0 ? { mat: s.mats.outer } : edgeMat)
      }
      const wedged = a0 >= zWedge - 1e-9
      for (const [ta, tb] of visibleIntervals(thStart, thEnd, wedged ? cut : null)) {
        add(`${L}-${k}-${a0.toFixed(3)}-${ta.toFixed(3)}`, sweep({ pts, edges }, {
          theta0: ta, theta1: tb, segments: fine ? 192 : 120, capMat: s.mats.edge, rOffset, disp, tint, uvOffset,
        }), L, lift)
      }
    }
  })

  const ringAt = (z: number) => visibleIntervals(0, TAU, z >= zWedge ? cut : null)

  // Lip of the next piece lapping over this segment's end.
  if (s.outermost && o.lipAtEnd && (d.elbow === 'gores' || d.elbow === 'taped-gores')) {
    const lip = Math.max(CIRC_LAP, 0.75 * IN)
    for (const [a, b] of visibleIntervals(thStart, thEnd, z1 - lip >= zWedge ? cut : null)) {
      add(`${L}-lip-${a.toFixed(3)}`, sweep(lipProfile(rJ + t, t, z1 - lip, z1, J.metal ? s.mats.outer : s.mats.tape, s.mats), {
        theta0: a, theta1: b, segments: 160, capMat: s.mats.edge, rOffset,
      }), L, lift)
    }
  }

  // Butt strips over each section joint (factory facings)
  if (s.factory && J.buttStripIn) {
    const w = J.buttStripIn * IN
    sheetStarts.forEach((zs, k) => {
      if (k === 0) return
      const z = zs - 0.0001
      for (const [a, b] of ringAt(z)) {
        add(`${L}-strip-${k}-${a.toFixed(3)}`, sweep(lipProfile(rJ + t + 0.00002, t, z - w / 2, z + w / 2, s.mats.tape, s.mats), {
          theta0: a, theta1: b, segments: 160, rOffset, capMat: s.mats.edge,
        }), L, lift)
      }
    })
  }

  const C = o.callouts
  if (L === 'jacket' && o.steps && BARRIER_SHOW > 0) {
    // the bonded 3-mil polyfilm moisture barrier, exposed where the jacket is trimmed back
    add('barrier', sweep(lipProfile(rJ, 0.0002, zJacketEnd, zJacketEnd + BARRIER_SHOW, Slot.Barrier), { segments: 160, capMat: Slot.Barrier }), L)
  }
  if (L === 'jacket' && o.steps && C) {
    if (BARRIER_SHOW > 0) C.push({ title: 'Moisture barrier', detail: '3-mil polyfilm, bonded to jacket', pos: [0, rJ, zJacketEnd + BARRIER_SHOW / 2], layer: 'jacket' })
    C.push({ title: J.label, detail: jacketDetail(d), pos: [0, rJ + t, zJacketEnd - 5 * IN], layer: 'jacket' })
  }
  if (!s.bands) return
  // Bands
  for (const zc of bandZ) {
    const onLap =
      sheetStarts.some((zs, k) => k > 0 && zc > zs - 1e-6 && zc < zs + CIRC_LAP + RAMP) ||
      (o.lipAtEnd && zc > z1 - CIRC_LAP - RAMP) ||
      (o.raisedStart && zc < z0 + RAMP + 0.0001)
    const rB = rJ + t * (onLap ? 2 : 1) + t + 0.00005
    const wedged = zc >= zWedge
    for (const [a, b] of visibleIntervals(0, TAU, wedged ? cut : null)) {
      add(`band-${zc.toFixed(4)}-${a.toFixed(3)}`, sweep(bandProfile(rB, d.bandT, zc, d.bandW, Slot.Band), {
        theta0: a, theta1: b, segments: 160, capMat: Slot.Band,
      }), L, lift)
    }
    if (!wedged) add(`seal-${zc.toFixed(4)}`, wingSeal(rB + d.bandT, zc, d.bandW, o.sealTheta), L, lift)
  }

  if (o.steps && C && bandZ.length) {
    const zb = Math.max(...bandZ.filter((z) => z <= zJacketEnd))
    C.push({ title: 'Stainless band', detail: `${d.bandW / IN === 0.5 ? '½' : '¾'}" × 0.020" with wing seal`, pos: [0, rJ + 2 * t + d.bandT, zb], layer: 'jacket' })
  }

  // Screws along the longitudinal lap (hot work)
  if (s.screws) {
    const screw = screwGeometry()
    const th = thEnd - longLapAng * 0.45
    const list: THREE.BufferGeometry[] = []
    for (let z = z0 + 3 * IN; z < zJacketEnd - 2 * IN; z += 8 * IN) {
      if (bandZ.some((b) => Math.abs(b - z) < 1 * IN)) continue
      if (z >= zWedge) continue
      list.push(placeRadial(screw, rJ + 2 * t, th, z))
    }
    if (list.length) add('screws', mergeGeos(list), L, lift)
  }
}

/**
 * Alternate labels above/below the pipe (mirroring the anchor to the bottom
 * surface for 'down') and stagger leader lengths, so adjacent steps a few
 * inches apart never overlap.
 */
function arrangeCallouts(list: Callout[], vertical = false): Callout[] {
  if (vertical) return list.map((c) => ({ ...c, side: 'right' as const }))
  return list.map((c, i) => {
    const side = i % 2 === 0 ? ('up' as const) : ('down' as const)
    const tier = Math.floor(i / 2) % 3
    if (side === 'down') return { ...c, side, tier, pos: [c.pos[0], -c.pos[1], c.pos[2]] }
    return { ...c, side, tier }
  })
}

function NPS_LABEL(d: Dims) {
  const od = ((d.rPipe * 2) / IN).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
  if (d.pipe === 'copper') return { title: 'Copper tube', detail: `${npsLabel(d.npsNominal)}" Type L · ${od}" OD` }
  if (d.pipe === 'pvc') return { title: 'PVC pipe', detail: `NPS ${npsLabel(d.npsNominal)}" Sch 40 · ${od}" OD` }
  return { title: 'Steel pipe', detail: `NPS ${npsLabel(d.npsNominal)}" Sch 40 · ${od}" OD` }
}

function npsLabel(v: number) {
  const whole = Math.floor(v)
  const frac = v - whole
  const f = frac === 0.5 ? '1/2' : frac === 0.25 ? '1/4' : frac === 0.75 ? '3/4' : ''
  return whole && f ? `${whole}-${f}` : whole ? `${whole}` : f
}

/** What the outside of the straight run is, for labels. */
function finishCallout(d: Dims): { title: string; detail: string; layer: LayerId } {
  if (d.jacketed) return { title: d.J.label, detail: jacketDetail(d), layer: 'jacket' }
  if (d.membrane) return { ...sheetCallout(d, 'vapor'), layer: 'vapor' }
  if (d.F) return { ...sheetCallout(d, 'facing'), layer: 'facing' }
  return { title: d.ins.label, detail: 'Bare insulation', layer: 'insulation' }
}

function jacketDetail(d: Dims) {
  const { J } = d
  if (J.metal) return `${(d.t / IN).toFixed(3).replace(/^0/, '')}" thick · ${+(d.longLap / IN).toFixed(2)}" laps`
  if (J.id === 'pvc') return `20-mil PVC · ${J.longLapIn}" lap`
  return ''
}

/** Thin raised lip: the overlapping end of the piece above, riding on this piece. */
function lipProfile(
  r: number, t: number, z0: number, z1: number, outer: number = Slot.JacketOuter,
  m: { inner: number; edge: number } = { inner: Slot.JacketInner, edge: Slot.JacketEdge },
): Profile {
  return {
    pts: [[r, z0], [r, z1], [r + t, z1], [r + t, z0]],
    edges: [{ mat: m.inner }, { mat: m.edge, uv: 'planar' }, { mat: outer }, { mat: m.edge, uv: 'planar' }],
  }
}

/**
 * θ ranges of the insulation pieces around the pipe:
 *  halves → two half-shells, joints at 3 & 9 o'clock
 *  hinged → one full split (at 9 o'clock); the hinge cut doesn't open
 *  tube   → slit elastomeric tube, glued seam at the top
 */
function pieceArcs(ins: InsulationVisual, rot: number, halfGap: number): [number, number][] {
  if (ins.pieces === 'halves') {
    return [
      [rot + halfGap, rot + Math.PI - halfGap],
      [rot + Math.PI + halfGap, rot + TAU - halfGap],
    ]
  }
  const s = rot + (ins.pieces === 'tube' ? 75 * DEG : Math.PI)
  return [[s + halfGap * 0.5, s + TAU - halfGap * 0.5]]
}

/**
 * Wing seal: a 1" clip of 0.032" stainless wrapped around both band plies, its
 * wings crimped down over the band edges, so it stands about 2.5 mm proud and a
 * little wider than the band; the band's tail end is folded back and lies on
 * the band beyond it. `r` is the top of the band.
 */
function wingSeal(r: number, zc: number, w: number, theta: number): THREE.BufferGeometry {
  const t = 0.032 * IN
  const len = 1 * IN
  const ang = len / r
  const rIn = r - 0.02 * IN - 0.00005
  const h = 2 * 0.02 * IN + 2 * t // two band plies inside, seal stock above and below
  const half = w / 2 + t + 0.0004
  const crimp = 0.0012 // the wings roll down over the edges
  const pts: [number, number][] = [
    [rIn, zc - half], [rIn + h - crimp, zc - half], [rIn + h, zc - half + crimp],
    [rIn + h, zc + half - crimp], [rIn + h - crimp, zc + half], [rIn, zc + half],
  ]
  const clip = sweep({ pts, edges: pts.map((_, i) => ({ mat: Slot.Band, ...(i === pts.length - 1 ? {} : { smooth: 1 }) })) }, {
    theta0: theta - ang / 2, theta1: theta + ang / 2, segments: 24, capMat: Slot.Band,
  })
  // folded tail: a second ply on the band, running on past the clip
  const tail = sweep(bandProfile(r - 0.00002, 0.02 * IN, zc, w * 0.97, Slot.Band), {
    theta0: theta + ang * 0.45, theta1: theta + ang * 1.35, segments: 32, capMat: Slot.Band,
  })
  return mergeGeos([clip, tail])
}

// ------------------------------------------------------------------ elbow

/** Smooth bent tube (steel elbow, PVC fitting cover) along an arc of radius R in the y-z plane. */
function bentShell(R: number, rIn: number, rOut: number, a1: number, outerMat: number, innerMat: number): THREE.BufferGeometry {
  const ringSeg = 96
  const arcSeg = 48
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const groups: [number, number, number][] = []
  let v = 0
  for (const [r, mat, sign] of [[rOut, outerMat, 1], [rIn, innerMat, -1]] as const) {
    const start = v
    const P = (a: number, th: number) => {
      // centreline point and frame at arc angle a
      const c = new THREE.Vector3(0, R - R * Math.cos(a), R * Math.sin(a))
      const nY = new THREE.Vector3(0, Math.cos(a), -Math.sin(a)) // toward bend centre
      const nX = new THREE.Vector3(1, 0, 0)
      const n = nX.multiplyScalar(Math.cos(th)).add(nY.multiplyScalar(Math.sin(th)))
      return { p: c.clone().addScaledVector(n, r), n }
    }
    for (let i = 0; i < arcSeg; i++) {
      for (let j = 0; j < ringSeg; j++) {
        const a0 = (a1 * i) / arcSeg, b0 = (a1 * (i + 1)) / arcSeg
        const t0 = (TAU * j) / ringSeg, t1 = (TAU * (j + 1)) / ringSeg
        const q = [P(a0, t0), P(b0, t0), P(b0, t1), P(a0, t1)]
        const quv = [[t0 * r, a0 * R], [t0 * r, b0 * R], [t1 * r, b0 * R], [t1 * r, a0 * R]]
        const idx = sign > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]
        for (const k of idx) {
          pos.push(q[k].p.x, q[k].p.y, q[k].p.z)
          nor.push(q[k].n.x * sign, q[k].n.y * sign, q[k].n.z * sign)
          uv.push(quv[k][0], quv[k][1])
          v++
        }
      }
    }
    groups.push([start, v - start, mat])
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(v * 3).fill(1), 3))
  for (const [s, c, m] of groups) g.addGroup(s, c, m)
  // Real elbows are not perfectly smooth; winding of triangles above already
  // matches the normals, so no further fix-up is needed.
  return g
}

/**
 * One straight piece of a segmented (mitered) 90° elbow. Pieces are tangent to
 * the bend arc (radius R) at angle c and run from arc angle c0 to c1. The two
 * end pieces are half-length and square at the straight-pipe joint, so the
 * elbow meets the straight runs cleanly; interior joints are miters of φ/2.
 * Returns placement and z-shears for building the piece's profiles.
 */
function miterPiece(R: number, c: number, c0: number, c1: number) {
  const z0 = -R * Math.tan(c - c0)
  const z1 = R * Math.tan(c1 - c)
  const t0 = Math.tan(c - c0)
  const t1 = Math.tan(c1 - c)
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(0, R - R * Math.cos(c), R * Math.sin(c)),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -c),
    new THREE.Vector3(1, 1, 1),
  )
  // Local +y is the throat (inside of the bend), so pieces are shorter there.
  const zLerp = (r: number, z: number, th: number) => {
    const k = -t0 + ((z - z0) / (z1 - z0 || 1)) * (t1 + t0)
    return z - k * r * Math.sin(th)
  }
  const zEnd = (r: number, z: number, th: number) => z - t1 * r * Math.sin(th)
  const zStart = (r: number, z: number, th: number) => z + t0 * r * Math.sin(th)
  return { z0, z1, m, zLerp, zEnd, zStart }
}

/** Pieces per 90° (incl. two half-gores): 5 to 12" OD, 7 to 24", 9 above. */
const elbowPieces = (d: Dims) => (d.odIn <= 12 ? 5 : d.odIn <= 24 ? 7 : 9)

/** Pieces for an n-piece 90° mitered elbow (two half-length end pieces). */
function miterPieces(R: number, n: number) {
  const phi = Math.PI / 2 / (n - 1)
  return Array.from({ length: n }, (_, k) => {
    const c = k * phi
    const c0 = k === 0 ? 0 : c - phi / 2
    const c1 = k === n - 1 ? c : c + phi / 2
    return miterPiece(R, c, c0, c1)
  })
}

function elbowAssembly(d: Dims, cutawayRiser: [number, number] | null, callouts: Callout[] | null): Part[] {
  const parts: Part[] = []
  const R = d.bendR
  const add = (key: string, g: THREE.BufferGeometry, layer: LayerId, m?: THREE.Matrix4) => {
    if (m) g.applyMatrix4(m)
    parts.push({ key, geometry: g, layer })
  }
  add('elbow-pipe', bentShell(R, d.rBore, d.rPipe, Math.PI / 2, Slot.PipeOuter, Slot.PipeBore), 'pipe')

  // Mitered insulation segments; same piece count as the cover so joints line up.
  const insMats = { outer: Slot.InsSkin, inner: Slot.InsBore, end: Slot.InsCut }
  const n = elbowPieces(d)
  const pieces = miterPieces(R, n)
  const endUv = d.ins.layered ? 'polar' as const : 'planar' as const
  const capUv = d.ins.layered ? 'zr' as const : 'rz' as const
  // Under a PVC fitting cover the insulation is a wrapped, compressed insert, and
  // under a pressed cover a prefabricated elbow; both follow the bend. Otherwise
  // it is mitered pipe-insulation segments.
  const insert = d.elbow === 'fitting-cover' || d.elbow === 'pressed'
  if (insert) {
    add('elb-insert', bentShell(R, d.rIns0, d.rInsOut - 0.0008, Math.PI / 2, Slot.InsSkin, Slot.InsBore), 'insulation')
  } else pieces.forEach((c, k) => {
    const gap = 0.0004
    for (let L = 0; L < d.layers; L++) {
      const rIn = d.rIns0 + (d.T * L) / d.layers
      const rOut = d.rIns0 + (d.T * (L + 1)) / d.layers
      const g0 = k === 0 ? 0 : gap
      const g1 = k === n - 1 ? 0 : gap
      pieceArcs(d.ins, L % 2 ? 90 * DEG : 0, 0.0008 / rOut).forEach(([a, b], hh) => {
        add(`elb-ins-${k}-${L}-${hh}`, sweep(annulusProfile(rIn, rOut, c.z0 + g0, c.z1 - g1, insMats, 0, [false, false], endUv), {
          theta0: a, theta1: b, segments: 128, capMat: Slot.InsCut, capUv, zMap: c.zLerp,
          tint: pieceTint(`elb${k}${L}${hh}`),
        }), 'insulation', c.m)
      })
    }
  })

  // Facing and vapor-retarder membrane over the fitting insulation, under the cover.
  const finishedByFacing = !d.jacketed && d.elbow === 'taped-gores'
  const skin = (layer: LayerId, r: number, t: number, outer: number, inner: number, edge: number) => {
    if (insert) add(`elb-${layer}`, bentShell(R, r, r + t, Math.PI / 2, outer, inner), layer)
    else pieces.forEach((c, k) => add(`elb-${layer}-${k}`, sweep(lipProfile(r, t, c.z0, c.z1, outer, { inner, edge }), { segments: 160, zMap: c.zLerp }), layer, c.m))
  }
  if (d.F && !finishedByFacing) skin('facing', d.rF, d.tF, Slot.Facing, Slot.FacingInner, Slot.FacingEdge)
  if (d.membrane) skin('vapor', d.rV, d.tV, Slot.Vapor, Slot.Vapor, Slot.VaporEdge)

  const { t, rJ } = d
  const J_ = Slot.JacketInner, O = Slot.JacketOuter, E = Slot.JacketEdge
  if (d.elbow === 'gores') {
    // Gored cover: each gore rides up over the one below and carries a ¾" lip
    // for the next one; hot work gets #8 screws 3" o.c. along each lap.
    const lap = 0.75 * IN
    const screw = d.screws ? screwGeometry() : null
    pieces.forEach((c, k) => {
      const { z0, z1 } = c
      const pts: [number, number][] = [
        [rJ + t, z0], [rJ, z0 + RAMP], [rJ, z1],
        [rJ + t, z1], [rJ + t, z0 + RAMP], [rJ + 2 * t, z0],
      ]
      const edges: ProfileEdge[] = [
        { mat: J_ }, { mat: J_ }, { mat: E, uv: 'planar' },
        { mat: O }, { mat: O }, { mat: E, uv: 'planar' },
      ]
      add(`gore-${k}`, sweep({ pts, edges }, { segments: 160, zMap: c.zLerp }), 'jacket', c.m)
      add(`gore-lip-${k}`, sweep(lipProfile(rJ + t, t, z1 - lap, z1), { segments: 160, zMap: c.zEnd }), 'jacket', c.m)
      if (screw) {
        const list: THREE.BufferGeometry[] = []
        const rr = rJ + 2 * t
        const zc = z1 - lap / 2
        const ns = Math.max(4, Math.round((TAU * rr) / (3 * IN)))
        for (let i = 0; i < ns; i++) {
          const th = (TAU * (i + 0.5)) / ns
          const g = placeRadial(screw, rr, th, 0)
          const pos = g.getAttribute('position')
          for (let v = 0; v < pos.count; v++) pos.setZ(v, pos.getZ(v) + c.zEnd(rr, zc, th))
          list.push(g)
        }
        add(`gore-screws-${k}`, mergeGeos(list), 'jacket', c.m)
      }
    })
  } else if (d.elbow === 'taped-gores') {
    // Faced mitered segments, every miter joint wrapped with matching tape.
    const tw = 1 * IN
    const [r0, t0, layer] = d.jacketed ? [rJ, t, 'jacket' as const] : [d.rF, d.tF, 'facing' as const]
    const m = layer === 'facing'
      ? { outer: Slot.Facing, inner: Slot.FacingInner, edge: Slot.FacingEdge, tape: Slot.FacingTape }
      : { outer: O, inner: J_, edge: E, tape: Slot.Tape }
    pieces.forEach((c, k) => {
      add(`face-${k}`, sweep(lipProfile(r0, t0, c.z0, c.z1, m.outer, m), { segments: 160, zMap: c.zLerp }), layer, c.m)
      if (k < n - 1) add(`tape-a-${k}`, sweep(lipProfile(r0 + t0, t0, c.z1 - tw, c.z1, m.tape, m), { segments: 160, zMap: c.zEnd }), layer, c.m)
      if (k > 0) add(`tape-b-${k}`, sweep(lipProfile(r0 + t0, t0, c.z0, c.z0 + tw, m.tape, m), { segments: 160, zMap: c.zStart }), layer, c.m)
    })
  } else if (d.elbow === 'pressed') {
    add('pressed', pressedElbowCover(R, rJ + 0.0004, t * 1.5, d.npsNominal), 'jacket')
  } else if (d.elbow === 'fitting-cover') {
    // One-piece PVC fitting cover (Zeston/Proto style) with short cuffs that
    // slip over the straight jacket (or the ASJ) on both sides.
    const tc = 0.02 * IN
    const rc = (d.jacketed ? rJ + t : d.rFinish) + 0.0003
    add('cover', bentShell(R, rc, rc + tc, Math.PI / 2, Slot.Cover, Slot.Cover), 'jacket')
    const cuff = 1.5 * IN
    const coverMats = { outer: Slot.Cover, inner: Slot.Cover, end: Slot.Cover }
    add('cover-cuff-a', sweep(annulusProfile(rc, rc + tc, -cuff, 0, coverMats, 0.0002, [true, false]), { segments: 160 }), 'jacket')
    add('cover-cuff-b', sweep(annulusProfile(rc, rc + tc, 0, cuff, coverMats, 0.0002, [false, true]), { segments: 160 }), 'jacket', riserMatrix(R))
  }

  // Vertical riser after the elbow (upper piece: its jacket laps over the last gore).
  const riserLen = 0.62
  const local: Callout[] = []
  for (const part of straightSegment(d, {
    key: 'riser', z0: 0, z1: riserLen, pipeExt: [0, (cutawayRiser || callouts ? 7 : 4) * IN],
    cutaway: cutawayRiser, raisedStart: d.elbow === 'gores', lipAtEnd: false,
    seamTheta: 203 * DEG, sealTheta: 222 * DEG,
    steps: !!callouts, callouts: local,
  })) add(part.key, part.geometry, part.layer, riserMatrix(R))
  if (callouts) {
    // riser callouts: anchor on the right-hand silhouette as seen from the camera
    // (riser θ = 225°, between the front and the right side)
    const m = riserMatrix(R)
    for (const c of local) {
      const r = c.pos[1]
      const th = 225 * DEG
      const v = new THREE.Vector3(r * Math.cos(th), r * Math.sin(th), c.pos[2]).applyMatrix4(m)
      callouts.push({ ...c, pos: [v.x, v.y, v.z] })
    }
  }
  return parts
}

/**
 * Two-piece pressed elbow cover (JM Ell-Jacs style, ½–12" NPS): halves split
 * at heel and throat, the outer half lapping the inner by ⅝", with the radial
 * pleats pressing leaves along the throat, fading out toward the sides.
 * Short straight cuffs run 1" onto the straight jacket at both ends.
 */
function pressedElbowCover(R: number, r: number, t: number, nps: number): THREE.BufferGeometry {
  const lap = 0.625 * IN
  const cuff = 1 * IN
  const aExt = cuff / R
  const nPleats = Math.round(THREE.MathUtils.clamp(5 + nps * 0.6, 6, 12))
  const pleatH = Math.min(0.0028, 0.0012 + r * 0.008)
  const half = (th0: number, th1: number, rr: number, inner: boolean, seed: number) => {
    const NA = 420
    const NT = 140
    const a0 = -aExt
    const a1 = Math.PI / 2 + aExt
    const frame = (a: number) => {
      if (a < 0) return { c: new THREE.Vector3(0, 0, a * R), y: new THREE.Vector3(0, 1, 0) }
      if (a > Math.PI / 2) return { c: new THREE.Vector3(0, R + (a - Math.PI / 2) * R, R), y: new THREE.Vector3(0, 0, -1) }
      return { c: new THREE.Vector3(0, R - R * Math.cos(a), R * Math.sin(a)), y: new THREE.Vector3(0, Math.cos(a), -Math.sin(a)) }
    }
    // jitter pleat positions a little so they read hand-formed, not CNC
    const rand = (k: number) => {
      const x = Math.sin((k + 1) * 12.9898 + seed * 78.233) * 43758.5453
      return x - Math.floor(x) - 0.5
    }
    const pleatA = Array.from({ length: nPleats }, (_, k) => ((k + 0.5 + rand(k) * 0.25) / nPleats) * (Math.PI / 2))
    const disp = (a: number, th: number) => {
      if (a <= 0 || a >= Math.PI / 2) return 0
      const fromThroat = Math.abs(Math.atan2(Math.sin(th - Math.PI / 2), Math.cos(th - Math.PI / 2)))
      const span = 80 * DEG
      if (fromThroat > span) return 0
      const env = Math.pow(Math.cos((fromThroat / span) * (Math.PI / 2)), 1.3)
      const local = R - r * Math.sin(th) // centreline-to-surface arc radius here
      let h = 0
      pleatA.forEach((pa, k) => {
        const s = (a - pa) * Math.max(local, 0.01)
        const w = 0.0026 + 0.0012 * Math.abs(rand(k + 7))
        h += Math.exp(-(s * s) / (w * w))
      })
      // the pleats also fade out within a few degrees of each cover end
      const endFade = Math.min(1, a / (6 * DEG), (Math.PI / 2 - a) / (6 * DEG))
      return pleatH * env * Math.min(h, 1.2) * endFade
    }
    const pos: number[] = []
    const uv: number[] = []
    for (let i = 0; i <= NA; i++) {
      const a = a0 + ((a1 - a0) * i) / NA
      const { c, y } = frame(a)
      for (let j = 0; j <= NT; j++) {
        const th = th0 + ((th1 - th0) * j) / NT
        const rad = rr + disp(a, th)
        const n = new THREE.Vector3(Math.cos(th), 0, 0).addScaledVector(y, Math.sin(th))
        const p = c.clone().addScaledVector(n, rad)
        pos.push(p.x, p.y, p.z)
        uv.push(th * rr, a * R)
      }
    }
    const idx: number[] = []
    for (let i = 0; i < NA; i++) {
      for (let j = 0; j < NT; j++) {
        const q = i * (NT + 1) + j
        const quad = [q, q + NT + 1, q + NT + 2, q, q + NT + 2, q + 1]
        idx.push(...(inner ? [quad[0], quad[2], quad[1], quad[3], quad[5], quad[4]] : quad))
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.setIndex(idx)
    g.computeVertexNormals()
    // outward-facing check: flip the index order if normals point inward
    const nrm = g.getAttribute('normal')
    const mid = Math.floor(NA / 2) * (NT + 1) + Math.floor(NT / 2)
    const { c } = frame(Math.PI / 4)
    const p0 = new THREE.Vector3().fromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute, mid)
    const outward = p0.sub(c).dot(new THREE.Vector3().fromBufferAttribute(nrm as THREE.BufferAttribute, mid)) > 0
    if (outward === inner) {
      const ix = g.getIndex()!.array as Uint32Array | Uint16Array
      for (let k = 0; k < ix.length; k += 3) [ix[k + 1], ix[k + 2]] = [ix[k + 2], ix[k + 1]]
      g.computeVertexNormals()
    }
    const ng = g.toNonIndexed()
    g.dispose()
    return withGroup(ng, Slot.Pressed)
  }
  const lapAng = lap / r
  return mergeGeos([
    // inner half (+x side), then the outer half lapping it at heel and throat
    half(270 * DEG, 450 * DEG, r, false, 1),
    half(270 * DEG, 450 * DEG, r - t, true, 1),
    half(90 * DEG - lapAng, 270 * DEG + lapAng, r + t, false, 2),
    half(90 * DEG - lapAng, 270 * DEG + lapAng, r, true, 2),
  ])
}

/** Frame of the vertical riser leaving a 90° elbow of radius R (pipe axis → +y). */
function riserMatrix(R: number) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(0, R, R),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2),
    new THREE.Vector3(1, 1, 1),
  )
}

// ------------------------------------------------------------------ assembly

export function buildAssembly(p: AssemblyParams): Assembly {
  if (p.duct) return ductAssembly({ ...p.duct, view: p.view === 'installed' ? 'installed' : 'cutaway' })
  const d = dims(p)
  const callouts: Callout[] = []
  const steps = p.view === 'layers'
  const outerRadius = d.metal ? d.rJ + 3 * d.t + d.bandT : d.rFinish
  const cutaway = p.view === 'cutaway'
  // exploded and section views are straight-run presentations
  if (p.view === 'exploded') return explodedAssembly(d, outerRadius)
  if (p.view === 'section') return sectionAssembly(d, outerRadius)
  if (p.component === 'valve') return valveAssembly(d, p.view, outerRadius)
  if (p.component === 'flange') return flangeAssembly(d, p.view, outerRadius)
  if (p.component === 'tee') return teeAssembly(d, p.view, outerRadius)
  if (p.component === 'elbow') {
    const zMin = -0.85
    const parts = [
      ...straightSegment(d, {
        key: 'run', z0: zMin, z1: 0, pipeExt: [4 * IN, 0], cutaway: null,
        raisedStart: false, lipAtEnd: true, seamTheta: 203 * DEG, sealTheta: 222 * DEG,
      }),
      // riser is seen from the front-right: cut the quadrant facing the camera
      ...elbowAssembly(d, cutaway ? [180 * DEG, 270 * DEG] : null, steps ? callouts : null),
    ]
    const R = d.bendR
    const riser = riserMatrix(R)
    const ext = (cutaway || steps ? 7 : 4) * IN
    const zones: SimZone[] = [
      { key: 'run', kind: 'run', z0: zMin + 0.012, z1: -0.01, radius: outerRadius, rBare: d.rPipe, bareZ: [zMin - 4 * IN, 0] },
      { key: 'riser', kind: 'run', matrix: riser, vertical: true, z0: 0.01, z1: 0.62 - (cutaway ? 4 * IN : 0) - 0.01, radius: outerRadius, rBare: d.rPipe, bareZ: [0, 0.62 + ext], ...(cutaway ? { wedge: [Math.PI, 1.5 * Math.PI] as [number, number], zWedge: 0.62 - 18 * IN } : {}) },
      ...stubs(d, [[zMin - 4 * IN, zMin]]),
      ...stubs(d, [[0.62, 0.62 + ext]], riser, true),
    ]
    return { parts, outerRadius, cradles: [zMin + 0.22], zMin, zMax: d.bendR + d.rJ, yMax: d.bendR + 0.62, callouts: arrangeCallouts(callouts, true), zones }
  }
  const len = p.span && !cutaway && !steps ? p.span : 1.32
  const long = len > 3
  const parts = straightSegment(d, {
    key: 'run', z0: 0, z1: len, pipeExt: long ? [0, 0] : [5 * IN, (cutaway || steps ? 7 : 5) * IN],
    cutaway: cutaway ? [90 * DEG, 180 * DEG] : null,
    raisedStart: false, lipAtEnd: false, seamTheta: 203 * DEG, sealTheta: 222 * DEG,
    steps, callouts,
  })
  // hangers on long runs: ~3 m apart, closer on small pipe
  const span = d.npsNominal <= 1 ? 2.1 : d.npsNominal <= 1.5 ? 2.7 : 3
  const nH = Math.max(2, Math.round(len / span))
  const cradles = long ? Array.from({ length: nH }, (_, i) => (len / nH) * (i + 0.5)) : [0.2, len - 0.55]
  const ext = long ? 0 : (cutaway || steps ? 7 : 5) * IN
  const zones: SimZone[] = [
    { key: 'run', kind: 'run', z0: 0.012, z1: len - (cutaway ? 4 * IN : 0) - 0.012, radius: outerRadius, rBare: d.rPipe, bareZ: [-5 * IN, len + ext], ...(cutaway ? { wedge: [Math.PI / 2 - 0.05, Math.PI + 0.05] as [number, number], zWedge: len - 18 * IN - 0.01 } : {}) },
    ...stubs(d, [[-5 * IN, 0], [len, len + ext]]),
  ]
  return { parts, outerRadius, cradles, zMin: 0, zMax: len, yMax: outerRadius, callouts: arrangeCallouts(callouts), zones }
}

/** Radial extent of every layer, inside to out (cross-section labels and the UI). */
function rings(d: Dims): { layer: LayerId; title: string; detail: string; rIn: number; rOut: number }[] {
  const pipe = NPS_LABEL(d)
  const out: ReturnType<typeof rings> = [{ layer: 'pipe', title: pipe.title, detail: pipe.detail, rIn: d.rBore, rOut: d.rPipe }]
  const each = d.T / d.layers / IN
  for (let L = 0; L < d.layers; L++) {
    out.push({
      layer: 'insulation',
      title: d.layers > 1 ? `${d.ins.label} · ${L === 0 ? 'inner' : 'outer'}` : d.ins.label,
      detail: d.layers > 1 ? `${each}" layer · joints staggered` : `${d.T / IN}" wall`,
      rIn: d.rIns0 + (d.T * L) / d.layers,
      rOut: d.rIns0 + (d.T * (L + 1)) / d.layers,
    })
  }
  for (const s of sheetStack(d, { seamTheta: 0 })) {
    out.push({ layer: s.layer, ...sheetCallout(d, s.layer), rIn: s.r, rOut: s.r + s.t })
  }
  return out
}

const fmtIn = (m: number) => `${(m / IN).toFixed(2).replace(/0$/, '')}"`

/**
 * Exploded view: the bottom half stays assembled on the pipe; the top half of
 * every layer lifts off, each a step higher than the one beneath it, so each
 * layer shows its own surfaces and its thickness at the split.
 */
function explodedAssembly(d: Dims, outerRadius: number): Assembly {
  const len = 1.0
  const liftStep = THREE.MathUtils.clamp(outerRadius * 0.55, 0.045, 0.15)
  const base = {
    key: 'run', z0: 0, z1: len, pipeExt: [4 * IN, 4 * IN] as [number, number], raisedStart: false, lipAtEnd: false,
    seamTheta: 203 * DEG, sealTheta: 222 * DEG, wedgeFrom: -Infinity, liftStep,
  }
  const parts = [
    ...straightSegment(d, { ...base, cutaway: [0, Math.PI], half: 'bottom' }),
    ...straightSegment(d, { ...base, cutaway: [Math.PI, TAU], half: 'top', noPipe: true }),
  ]
  const callouts: Callout[] = []
  const th = 98 * DEG
  const pipe = NPS_LABEL(d)
  callouts.push({ title: pipe.title, detail: pipe.detail, pos: [0, d.rPipe, len + 2.5 * IN], side: 'right', layer: 'pipe' })
  rings(d).slice(1).forEach((r, i) => {
    const lift = liftStep * (i + 1)
    callouts.push({ title: r.title, detail: r.detail, pos: [r.rOut * Math.cos(th), r.rOut * Math.sin(th) + lift, len * 0.93], side: 'right', layer: r.layer })
  })
  const top = outerRadius + liftStep * (rings(d).length - 1)
  const extent: [number, number, number][] = [[0, top, len], [0, -outerRadius, len], [-outerRadius, top, len], [outerRadius, top, len]]
  return { parts, outerRadius, cradles: [0.2, len - 0.2], zMin: 0, zMax: len, yMax: top, callouts, extent }
}

/** Cross-section: every layer cut square at the end of the run, labelled ring by ring. */
function sectionAssembly(d: Dims, outerRadius: number): Assembly {
  const len = 1.0
  const parts = straightSegment(d, {
    key: 'run', z0: 0, z1: len, pipeExt: [4 * IN, 0], cutaway: null,
    raisedStart: false, lipAtEnd: false, seamTheta: 203 * DEG, sealTheta: 222 * DEG,
  })
  const list = rings(d)
  // anchors run down one radial line on the lower right of the face, so the
  // labels read inside → out from top to bottom; thin sheet layers fan out a little
  let thin = 0
  const callouts: Callout[] = list.map((r) => {
    const thick = r.rOut - r.rIn > 0.004
    const th = (-18 - (thick ? 0 : 7 * ++thin)) * DEG
    const rr = thick ? (r.rIn + r.rOut) / 2 : r.rOut
    const detail = r.layer === 'insulation' && r.rOut >= d.rInsOut - 1e-6
      ? `${r.detail} · OD ≈ ${fmtIn(2 * d.rPipe + 2 * d.T)} nominal`
      : r.detail
    return { title: r.title, detail, pos: [rr * Math.cos(th), rr * Math.sin(th), len], side: 'right' as const, layer: r.layer }
  })
  const extent = Array.from({ length: 12 }, (_, i) => [outerRadius * Math.cos((i * TAU) / 12), outerRadius * Math.sin((i * TAU) / 12), len] as [number, number, number])
  return { parts, outerRadius, cradles: [0.2, len - 0.3], zMin: 0, zMax: len, yMax: outerRadius, callouts, extent }
}

/** Dimensions of the resolved system for the UI (radii in metres). */
export function systemInfo(p: AssemblyParams) {
  const d = dims(p)
  return {
    service: d.service,
    vaporBy: d.vaporBy,
    membrane: d.membrane,
    facing: d.F ? ('asj' as const) : ('none' as const),
    jacketId: d.jacketId,
    jacketThicknessIn: d.t / IN,
    longLapIn: d.longLap / IN,
    bandWIn: d.bandW / IN,
    screws: d.screws,
    elbow: d.elbow,
    rings: rings(d),
    /** Pipe OD + 2 × thickness; ASTM C585 actual sizes vary slightly. */
    insulationOdIn: (2 * d.rPipe + 2 * d.T) / IN,
  }
}

/**
 * Display cradle: curved saddle with a neoprene pad, yoke, square-tube post
 * and base plate standing on the floor at `floorY`. Slots: 0 = powder coat, 1 = pad.
 */
export function buildCradle(radius: number, zc: number, floorY: number): THREE.BufferGeometry[] {
  const pad = 0.003
  const sT = 0.008
  const w = 0.08
  const span = 96 * DEG
  const mid = 270 * DEG
  const out: THREE.BufferGeometry[] = []
  const r0 = radius + 0.0003
  out.push(sweep(annulusProfile(r0, r0 + pad, zc - w / 2 + 0.004, zc + w / 2 - 0.004, { outer: 1, inner: 1, end: 1 }, 0.0008), {
    theta0: mid - span / 2, theta1: mid + span / 2, segments: 160, capMat: 1,
  }))
  const rs = r0 + pad
  out.push(sweep(annulusProfile(rs, rs + sT, zc - w / 2, zc + w / 2, { outer: 0, inner: 0, end: 0 }, 0.0015), {
    theta0: mid - span / 2 - 4 * DEG, theta1: mid + span / 2 + 4 * DEG, segments: 160, capMat: 0,
  }))
  const top = -(rs + sT) + 0.003
  const yoke = new THREE.BoxGeometry(0.11, 0.01, w)
  yoke.translate(0, top - 0.005, zc)
  const postTop = top - 0.01
  const postH = postTop - (floorY + 0.012)
  const post = new THREE.BoxGeometry(0.05, postH, 0.05)
  post.translate(0, floorY + 0.012 + postH / 2, zc)
  const base = new THREE.BoxGeometry(0.2, 0.012, 0.16)
  base.translate(0, floorY + 0.006, zc)
  out.push(yoke, post, base)
  for (const g of out) {
    g.clearGroups()
    if (!g.getAttribute('color')) {
      const n = g.getAttribute('position').count
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3))
    }
  }
  return out
}

// ------------------------------------------------------------------ utilities

function withGroup(g: THREE.BufferGeometry, mat: number): THREE.BufferGeometry {
  g.clearGroups()
  g.addGroup(0, g.getAttribute('position').count, mat)
  if (!g.getAttribute('color')) {
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 3).fill(1), 3))
  }
  return g
}

function mergeGeos(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const col: number[] = []
  const g = new THREE.BufferGeometry()
  let offset = 0
  for (const s of geos) {
    const n = s.getAttribute('position').count
    // element-wise appends: spreading large arrays overflows the call stack
    const append = (dst: number[], src: ArrayLike<number>) => {
      for (let i = 0; i < src.length; i++) dst.push(src[i])
    }
    append(pos, s.getAttribute('position').array)
    append(nor, s.getAttribute('normal').array)
    append(uv, s.getAttribute('uv').array)
    const c = s.getAttribute('color')
    append(col, c ? c.array : new Float32Array(n * 3).fill(1))
    for (const gr of s.groups) g.addGroup(gr.start + offset, gr.count, gr.materialIndex ?? 0)
    offset += n
    s.dispose()
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.computeBoundingSphere()
  return g
}

/**
 * Merge many parts into one geometry with a single group per material slot.
 * One mesh means ~12 draw calls instead of hundreds, and lets the path tracer
 * see each material exactly once.
 */
export function mergeByMaterial(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const buckets = new Map<number, { pos: number[]; nor: number[]; uv: number[]; col: number[] }>()
  for (const g of geos) {
    const P = g.getAttribute('position').array as ArrayLike<number>
    const N = g.getAttribute('normal').array as ArrayLike<number>
    const U = g.getAttribute('uv').array as ArrayLike<number>
    const C = g.getAttribute('color')?.array as ArrayLike<number> | undefined
    const groups = g.groups.length ? g.groups : [{ start: 0, count: g.getAttribute('position').count, materialIndex: 0 }]
    for (const gr of groups) {
      const m = gr.materialIndex ?? 0
      let b = buckets.get(m)
      if (!b) buckets.set(m, (b = { pos: [], nor: [], uv: [], col: [] }))
      for (let v = gr.start; v < gr.start + gr.count; v++) {
        b.pos.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2])
        b.nor.push(N[v * 3], N[v * 3 + 1], N[v * 3 + 2])
        b.uv.push(U[v * 2], U[v * 2 + 1])
        if (C) b.col.push(C[v * 3], C[v * 3 + 1], C[v * 3 + 2])
        else b.col.push(1, 1, 1)
      }
    }
  }
  const out = new THREE.BufferGeometry()
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = []
  for (const m of [...buckets.keys()].sort((a, b) => a - b)) {
    const b = buckets.get(m)!
    const start = pos.length / 3
    for (let i = 0; i < b.pos.length; i++) pos.push(b.pos[i])
    for (let i = 0; i < b.nor.length; i++) nor.push(b.nor[i])
    for (let i = 0; i < b.uv.length; i++) uv.push(b.uv[i])
    for (let i = 0; i < b.col.length; i++) col.push(b.col[i])
    out.addGroup(start, b.pos.length / 3, m)
  }
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  out.computeBoundingSphere()
  return out
}

/**
 * Like mergeByMaterial, but returns one single-material geometry per slot.
 * The path tracer handles single-material meshes reliably; multi-material
 * meshes get their group → material mapping scrambled.
 */
export function splitByMaterial(geos: THREE.BufferGeometry[]): { mat: number; geometry: THREE.BufferGeometry }[] {
  const merged = mergeByMaterial(geos)
  const out = merged.groups.map((gr) => {
    const g = new THREE.BufferGeometry()
    for (const name of ['position', 'normal', 'uv', 'color'] as const) {
      const a = merged.getAttribute(name) as THREE.BufferAttribute
      const n = a.itemSize
      g.setAttribute(name, new THREE.Float32BufferAttribute((a.array as Float32Array).slice(gr.start * n, (gr.start + gr.count) * n), n))
    }
    g.computeBoundingSphere()
    return { mat: gr.materialIndex ?? 0, geometry: g }
  })
  merged.dispose()
  return out
}

// ------------------------------------------------------------------ valve + removable blanket

/**
 * ASME B16.5 Class 150 flange geometry (inches): OD, thickness, bolt circle,
 * bolt count, bolt diameter, weld-neck length through hub. Visual only.
 */
const FLANGE_150: Record<string, [number, number, number, number, number, number]> = {
  '1/2': [3.5, 0.44, 2.38, 4, 0.5, 1.88], '3/4': [3.88, 0.5, 2.75, 4, 0.5, 2.06], '1': [4.25, 0.56, 3.12, 4, 0.5, 2.19],
  '1-1/4': [4.62, 0.62, 3.5, 4, 0.5, 2.25], '1-1/2': [5, 0.69, 3.88, 4, 0.5, 2.44], '2': [6, 0.75, 4.75, 4, 0.625, 2.5],
  '2-1/2': [7, 0.88, 5.5, 4, 0.625, 2.75], '3': [7.5, 0.94, 6, 4, 0.625, 2.75], '4': [9, 0.94, 7.5, 8, 0.625, 3],
  '5': [10, 0.94, 8.5, 8, 0.75, 3.5], '6': [11, 1, 9.5, 8, 0.75, 3.5], '8': [13.5, 1.12, 11.75, 8, 0.75, 4],
  '10': [16, 1.19, 14.25, 12, 0.875, 4], '12': [19, 1.25, 17, 12, 0.875, 4.5], '14': [21, 1.38, 18.75, 12, 1, 5],
  '16': [23.5, 1.44, 21.25, 16, 1, 5], '18': [25, 1.56, 22.75, 16, 1.125, 5.5], '20': [27.5, 1.69, 25, 20, 1.125, 5.69],
  '24': [32, 1.88, 29.5, 20, 1.25, 6],
}
/** Class 150 flanged gate valve face-to-face (ASME B16.10), inches. Visual only. */
const GATE_F2F: Record<string, number> = {
  '1/2': 4.25, '3/4': 4.62, '1': 5, '1-1/4': 5.5, '1-1/2': 6.5, '2': 7, '2-1/2': 7.5, '3': 8, '4': 9, '5': 10,
  '6': 10.5, '8': 11.5, '10': 13, '12': 14, '14': 15, '16': 16, '18': 17, '20': 18, '24': 20,
}

/** Rotates a pipe-axis (+z) part so its axis points up (+y), then moves it. */
const upAt = (x: number, y: number, z: number) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2),
    new THREE.Vector3(1, 1, 1),
  )

function solidProfile(pts: [number, number][], mat: number, smooth = true): Profile {
  return { pts, edges: pts.map(() => ({ mat, smooth: smooth ? 1 : undefined })) }
}

function boxPart(w: number, h: number, dpt: number, mat: number, m: THREE.Matrix4): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, dpt).toNonIndexed()
  g.applyMatrix4(m)
  return withGroup(g, mat)
}

function cylPart(r: number, len: number, mat: number, m: THREE.Matrix4, seg = 24, rTop = r): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, r, len, seg).toNonIndexed()
  g.applyMatrix4(m)
  return withGroup(g, mat)
}

function valveAssembly(d: Dims, view: ViewMode, outerRadius: number): Assembly {
  const parts: Part[] = []
  // valve, flanges and fasteners belong to the piping layer
  const add = (key: string, g: THREE.BufferGeometry, m?: THREE.Matrix4, layer: LayerId = 'pipe') => {
    if (m) g.applyMatrix4(m)
    parts.push({ key, geometry: g, layer })
  }
  const nps = NPS_KEY(d)
  const [fOD, fT, fBC, nB, bD, fY] = FLANGE_150[nps].map((v, i) => (i === 3 ? v : v * IN)) as number[]
  const L = (GATE_F2F[nps] ?? 9) * IN
  const D = fOD
  const gasket = 0.003
  const S = Slot

  // --- pipe flanges (weld neck), valve end flanges, studs & nuts ------------------
  for (const side of [-1, 1]) {
    const face = (side * L) / 2
    // valve's own end flange
    const vf = side > 0 ? [face - fT, face] : [face, face + fT]
    add(`vflange-${side}`, sweep(annulusProfile(d.rBore * 0.92, D / 2, vf[0], vf[1], { outer: S.ValveBody, inner: S.ValveBody, end: S.ValveBody }, 0.0015), { segments: 96 }))
    // mating weld-neck flange + hub tapering down to the pipe
    const f0 = face + side * gasket
    const f1 = f0 + side * fT
    const hubEnd = f0 + side * fY
    const hubR = d.rPipe + 0.4 * IN
    const za = Math.min(f0, f1), zb = Math.max(f0, f1)
    add(`wnflange-${side}`, sweep(annulusProfile(d.rBore, D / 2, za, zb, { outer: S.PipeOuter, inner: S.PipeBore, end: S.PipeEnd }, 0.0015), { segments: 96 }))
    const hub: [number, number][] = side > 0
      ? [[d.rBore, f1], [hubR, f1], [d.rPipe, hubEnd], [d.rBore, hubEnd]]
      : [[d.rBore, hubEnd], [d.rPipe, hubEnd], [hubR, f1], [d.rBore, f1]]
    add(`wnhub-${side}`, sweep({ pts: hub, edges: [{ mat: S.PipeEnd }, { mat: S.PipeOuter }, { mat: S.PipeEnd }, { mat: S.PipeBore }] }, { segments: 96 }))
    // gasket ring (spiral-wound look: thin dark band)
    add(`gasket-${side}`, sweep(annulusProfile(d.rPipe + 0.2 * IN, fBC / 2 - bD * 0.6, Math.min(face, f0), Math.max(face, f0), { outer: S.Bolt, inner: S.Bolt, end: S.Bolt }), { segments: 96 }))
    // studs + heavy hex nuts
    const studLen = 2 * fT + gasket + 2.2 * bD
    const zMid = face + side * (gasket / 2)
    for (let i = 0; i < nB; i++) {
      const th = (TAU * (i + 0.5)) / nB
      const x = (fBC / 2) * Math.cos(th), y = (fBC / 2) * Math.sin(th)
      const along = new THREE.Matrix4().compose(new THREE.Vector3(x, y, zMid), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), new THREE.Vector3(1, 1, 1))
      add(`stud-${side}-${i}`, cylPart(bD / 2, studLen, S.Bolt, along, 12))
      for (const e of [-1, 1]) {
        const zNut = zMid + e * (fT + gasket / 2 + 0.5 * bD)
        const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, zNut), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), new THREE.Vector3(1, 1, 1))
        add(`nut-${side}-${i}-${e}`, cylPart(0.95 * bD, bD, S.Bolt, m, 6))
      }
    }
  }

  // --- gate valve body, bonnet, yoke, rising stem, handwheel ----------------------
  const bodyR = 0.43 * D
  const neckR = 0.33 * D
  const zf = L / 2 - fT
  const body: [number, number][] = [[0.001, -zf], [neckR, -zf]]
  for (let i = 1; i < 12; i++) {
    const u = i / 12
    const z = -zf + 2 * zf * u
    body.push([neckR + (bodyR - neckR) * Math.sin(Math.PI * u) ** 0.7, z])
  }
  body.push([neckR, zf], [0.001, zf])
  add('valve-body', sweep(solidProfile(body, S.ValveBody), { segments: 96 }))
  const bonnetBase = bodyR * 0.75
  const bonnetFlY = 0.82 * D
  const bonnetR = 0.25 * D
  const bfR = 0.37 * D
  const bfT = 0.09 * D
  add('bonnet-neck', sweep(solidProfile([[0.001, bonnetBase], [bonnetR * 1.1, bonnetBase], [bonnetR, bonnetFlY], [0.001, bonnetFlY]], S.ValveBody, false), { segments: 64 }), upAt(0, 0, 0))
  add('bonnet-flange', sweep(annulusProfile(0.001, bfR, bonnetFlY, bonnetFlY + bfT, { outer: S.ValveBody, inner: S.ValveBody, end: S.ValveBody }, 0.002), { segments: 64 }), upAt(0, 0, 0))
  const bonnetTop = bonnetFlY + bfT + 0.32 * D
  add('bonnet-dome', sweep(solidProfile([[0.001, bonnetFlY + bfT], [bonnetR * 0.95, bonnetFlY + bfT], [bonnetR * 0.75, bonnetTop - 0.05 * D], [0.12 * D, bonnetTop], [0.001, bonnetTop]], S.ValveBody), { segments: 64 }), upAt(0, 0, 0))
  const nbb = 8
  for (let i = 0; i < nbb; i++) {
    const th = (TAU * (i + 0.5)) / nbb
    const r = bfR - 0.05 * D
    add(`bonnet-bolt-${i}`, cylPart(0.022 * D, 0.06 * D, S.Bolt, new THREE.Matrix4().makeTranslation(r * Math.cos(th), bonnetFlY + bfT + 0.03 * D, r * Math.sin(th)), 6))
  }
  const yokeTop = bonnetTop + 0.75 * D
  for (const sx of [-1, 1]) {
    add(`yoke-${sx}`, boxPart(0.07 * D, yokeTop - bonnetTop + 0.02 * D, 0.11 * D, S.ValveBody, new THREE.Matrix4().makeTranslation(sx * 0.17 * D, (bonnetTop + yokeTop) / 2, 0)))
  }
  add('yoke-head', cylPart(0.13 * D, 0.12 * D, S.ValveBody, new THREE.Matrix4().makeTranslation(0, yokeTop + 0.04 * D, 0), 32))
  add('yoke-bridge', boxPart(0.42 * D, 0.06 * D, 0.11 * D, S.ValveBody, new THREE.Matrix4().makeTranslation(0, yokeTop, 0)))
  const stemTop = yokeTop + 0.75 * D
  add('stem', cylPart(0.032 * D, stemTop - bonnetTop + 0.1 * D, S.Stem, new THREE.Matrix4().makeTranslation(0, (stemTop + bonnetTop) / 2, 0), 20))
  const wheelY = yokeTop + 0.16 * D
  const wheelR = Math.max(0.5 * D, 3 * IN)
  const rim = new THREE.TorusGeometry(wheelR, 0.035 * D, 12, 72).toNonIndexed()
  rim.rotateX(Math.PI / 2)
  rim.translate(0, wheelY, 0)
  add('handwheel-rim', withGroup(rim, S.Handwheel))
  add('handwheel-hub', cylPart(0.09 * D, 0.1 * D, S.Handwheel, new THREE.Matrix4().makeTranslation(0, wheelY + 0.02 * D, 0), 24))
  for (let i = 0; i < 4; i++) {
    const th = (i * TAU) / 4 + Math.PI / 4
    const spoke = new THREE.CylinderGeometry(0.022 * D, 0.028 * D, wheelR, 10).toNonIndexed()
    spoke.rotateZ(Math.PI / 2)
    spoke.translate(wheelR / 2, 0.015 * D, 0)
    spoke.rotateY(th)
    spoke.translate(0, wheelY, 0)
    add(`handwheel-spoke-${i}`, withGroup(spoke, S.Handwheel))
  }

  // --- insulated runs either side; insulation stops a bolt-length + 1" short of
  // the flange so studs can be pulled without disturbing it ---------------------
  const zi = L / 2 + fY + 1.5 * bD + 1 * IN
  const zEnd = 0.95
  for (const part of straightSegment(d, {
    key: 'runL', z0: -zEnd, z1: -zi, pipeExt: [4 * IN, zi - (L / 2 + fY) + 0.002],
    cutaway: null, raisedStart: false, lipAtEnd: false, seamTheta: 203 * DEG, sealTheta: 222 * DEG,
  })) parts.push(part)
  for (const part of straightSegment(d, {
    key: 'runR', z0: zi, z1: zEnd, pipeExt: [zi - (L / 2 + fY) + 0.002, 4 * IN],
    cutaway: null, raisedStart: false, lipAtEnd: false, seamTheta: 203 * DEG, sealTheta: 222 * DEG,
  })) parts.push(part)

  // --- removable blanket -----------------------------------------------------------
  const callouts: Callout[] = []
  const blanket = removableBlanket({
    zSpan: zi + 2 * IN, // laps 2" onto the jacket each side
    rCore: D / 2 + 0.25 * IN,
    rEnd: outerRadius + 0.002,
    T: 2 * IN,
    bonnet: { r: bfR + 0.2 * IN, yTop: bonnetTop + 0.02 * D },
    halfOnly: view === 'cutaway' || view === 'layers',
  })
  for (const [k, g] of blanket.geos) add(`blanket-${k}`, g, undefined, 'blanket')
  if (view === 'layers') {
    const rb = blanket.rOuter
    callouts.push(
      { title: 'Cold-face fabric', detail: 'Silicone-coated fiberglass cloth', pos: [0, -rb, -0.35 * zi], side: 'down', tier: 0, layer: 'blanket' },
      { title: 'Insulation', detail: '2 layers × 1" fiberglass mat', pos: [-(rb - IN) * Math.cos(20 * DEG), -(rb - IN) * Math.sin(20 * DEG), 0.1 * zi], side: 'down', tier: 1, layer: 'blanket' },
      { title: 'Hot-face fabric', detail: 'Fiberglass cloth, wire-mesh encased', pos: [-(rb - 2 * IN) * Math.cos(10 * DEG), -(rb - 2 * IN) * Math.sin(10 * DEG), 0.55 * zi], side: 'down', tier: 2, layer: 'blanket' },
      { title: 'Gate valve, flanged', detail: `NPS ${npsLabel(d.npsNominal)}" Class 150 · OS&Y`, pos: [0, bonnetTop, 0], side: 'up', tier: 0, layer: 'pipe' },
      { title: 'Lacing anchors + wire', detail: 'Stainless, laced across the closure', pos: blanket.hookAnchor, side: 'down', tier: 0, layer: 'blanket' },
      { ...finishCallout(d), pos: [0, outerRadius, zi + 8 * IN], side: 'up', tier: 1 },
    )
  }
  return {
    parts,
    outerRadius,
    cradles: [-zEnd + 0.2, zEnd - 0.2],
    zMin: -zEnd,
    zMax: zEnd,
    yMax: wheelY,
    callouts: callouts.map((c) => c),
    zones: fittingZones(d, outerRadius, zi, zEnd, blanket.rOuter, D / 2),
  }
}

// ------------------------------------------------------------------ flange pair + tee

/** Weld-neck flange (ASME B16.5 Class 150) with its face at zFace, body and hub running toward `side`. */
function weldNeckFlange(d: Dims, zFace: number, side: 1 | -1, add: (k: string, g: THREE.BufferGeometry) => void, key: string) {
  const [fOD, fT, , , , fY] = FLANGE_150[NPS_KEY(d)].map((v, i) => (i === 3 ? v : v * IN)) as number[]
  const f1 = zFace + side * fT
  const hubEnd = zFace + side * fY
  const hubR = d.rPipe + 0.4 * IN
  const S = Slot
  add(`${key}-flange`, sweep(annulusProfile(d.rBore, fOD / 2, Math.min(zFace, f1), Math.max(zFace, f1), { outer: S.PipeOuter, inner: S.PipeBore, end: S.PipeEnd }, 0.0015), { segments: 96 }))
  const hub: [number, number][] = side > 0
    ? [[d.rBore, f1], [hubR, f1], [d.rPipe, hubEnd], [d.rBore, hubEnd]]
    : [[d.rBore, hubEnd], [d.rPipe, hubEnd], [hubR, f1], [d.rBore, f1]]
  add(`${key}-hub`, sweep({ pts: hub, edges: [{ mat: S.PipeEnd }, { mat: S.PipeOuter }, { mat: S.PipeEnd }, { mat: S.PipeBore }] }, { segments: 96 }))
  return { hubEnd, fT, fY, fOD }
}

/** Studs through a bolted joint centred at zMid, with heavy hex nuts on both sides. */
function studsAndNuts(d: Dims, zMid: number, grip: number, add: (k: string, g: THREE.BufferGeometry) => void, key: string) {
  const [, , fBC, nB, bD] = FLANGE_150[NPS_KEY(d)].map((v, i) => (i === 3 ? v : v * IN)) as number[]
  const S = Slot
  const studLen = grip + 2.2 * bD
  for (let i = 0; i < nB; i++) {
    const th = (TAU * (i + 0.5)) / nB
    const x = (fBC / 2) * Math.cos(th), y = (fBC / 2) * Math.sin(th)
    const along = new THREE.Matrix4().compose(new THREE.Vector3(x, y, zMid), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), new THREE.Vector3(1, 1, 1))
    add(`${key}-stud-${i}`, cylPart(bD / 2, studLen, S.Bolt, along, 12))
    for (const e of [-1, 1]) {
      const zNut = zMid + e * (grip / 2 + 0.5 * bD)
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, zNut), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), new THREE.Vector3(1, 1, 1))
      add(`${key}-nut-${i}-${e}`, cylPart(0.95 * bD, bD, S.Bolt, m, 6))
    }
  }
  return { bD, fBC }
}

/**
 * Bolted flange pair in a straight run: two weld-neck flanges, gasket, studs.
 * As on the valve, the pipe insulation stops a stud length + 1" short of the
 * flanges so the bolts can be pulled, and a removable blanket covers the joint
 * and laps 2" onto the jacket each side.
 */
function flangeAssembly(d: Dims, view: ViewMode, outerRadius: number): Assembly {
  const parts: Part[] = []
  const add = (key: string, g: THREE.BufferGeometry, layer: LayerId = 'pipe') => parts.push({ key, geometry: g, layer })
  const gasket = 0.003
  const a = weldNeckFlange(d, -gasket / 2, -1, add, 'fa')
  weldNeckFlange(d, gasket / 2, 1, add, 'fb')
  const { bD, fBC } = studsAndNuts(d, 0, 2 * a.fT + gasket, add, 'joint')
  add('gasket', sweep(annulusProfile(d.rPipe + 0.2 * IN, fBC / 2 - bD * 0.6, -gasket / 2, gasket / 2, { outer: Slot.Bolt, inner: Slot.Bolt, end: Slot.Bolt }), { segments: 96 }))
  const zi = gasket / 2 + a.fY + 1.5 * bD + 1 * IN
  const zEnd = 0.95
  const reach = zi - (gasket / 2 + a.fY) + 0.002
  for (const part of straightSegment(d, {
    key: 'runL', z0: -zEnd, z1: -zi, pipeExt: [4 * IN, reach],
    cutaway: null, raisedStart: false, lipAtEnd: false, seamTheta: 203 * DEG, sealTheta: 222 * DEG,
  })) parts.push(part)
  for (const part of straightSegment(d, {
    key: 'runR', z0: zi, z1: zEnd, pipeExt: [reach, 4 * IN],
    cutaway: view === 'cutaway' ? [90 * DEG, 180 * DEG] : null, raisedStart: false, lipAtEnd: false, seamTheta: 203 * DEG, sealTheta: 222 * DEG,
  })) parts.push(part)
  const blanket = removableBlanket({
    zSpan: zi + 2 * IN,
    rCore: a.fOD / 2 + 0.25 * IN,
    rEnd: outerRadius + 0.002,
    T: 2 * IN,
    bonnet: null,
    halfOnly: view === 'cutaway' || view === 'layers',
  })
  for (const [k, g] of blanket.geos) add(`blanket-${k}`, g, 'blanket')
  const callouts: Callout[] = []
  if (view === 'layers') {
    const rb = blanket.rOuter
    callouts.push(
      { title: 'Flange pair, weld neck', detail: `NPS ${npsLabel(d.npsNominal)}" Class 150 · studs & gasket`, pos: [0, a.fOD / 2, 0], side: 'up', tier: 0, layer: 'pipe' },
      { title: 'Removable flange cover', detail: '2 layers × 1" fiberglass mat, laced', pos: [0, -rb, -0.3 * zi], side: 'down', tier: 0, layer: 'blanket' },
      { title: 'Insulation stops short', detail: 'Stud length + 1" clear, so bolts can be pulled', pos: [0, -outerRadius, zi + 3 * IN], side: 'down', tier: 1, layer: 'insulation' },
      { ...finishCallout(d), pos: [0, outerRadius, zi + 8 * IN], side: 'up', tier: 1 },
    )
  }
  return {
    parts, outerRadius, cradles: [-zEnd + 0.2, zEnd - 0.2], zMin: -zEnd, zMax: zEnd, yMax: blanket.rOuter, callouts,
    zones: fittingZones(d, outerRadius, zi, zEnd, blanket.rOuter, a.fOD / 2, view === 'cutaway'),
  }
}

/** Height where a branch of radius r at angle θ meets a run cylinder of radius Rm (fish-mouth cope). */
const saddle = (Rm: number, r: number, th: number) => Math.sqrt(Math.max(Rm * Rm - (r * Math.cos(th)) ** 2, 0))

/** Branch frame of a tee: pipe axis → +y, rising from the run's centreline at z = 0. */
const BRANCH = new THREE.Matrix4().makeRotationX(-Math.PI / 2)

/**
 * Equal tee in a horizontal run with the branch going up. Field practice:
 * the run insulation carries through, and the branch insulation and jacket
 * are fish-mouthed (coped) to sit on it; on the run, a plain collar of
 * insulation and jacket spans the tee so no band lands on the opening.
 */
function teeAssembly(d: Dims, view: ViewMode, outerRadius: number): Assembly {
  const parts: Part[] = []
  const add = (key: string, g: THREE.BufferGeometry, layer: LayerId, m?: THREE.Matrix4) => {
    if (m) g.applyMatrix4(m)
    parts.push({ key, geometry: g, layer })
  }
  const zEnd = 0.95
  const rTop = d.jacketed ? d.rJ + d.t : d.rFinish
  const w = rTop + 1.25 * IN
  const S = Slot
  // run, either side of the collar
  for (const part of straightSegment(d, {
    key: 'runL', z0: -zEnd, z1: -w, pipeExt: [4 * IN, 0],
    cutaway: null, raisedStart: false, lipAtEnd: false, seamTheta: 203 * DEG, sealTheta: 222 * DEG,
  })) parts.push(part)
  for (const part of straightSegment(d, {
    key: 'runR', z0: w, z1: zEnd, pipeExt: [0, (view === 'cutaway' ? 7 : 4) * IN],
    cutaway: view === 'cutaway' ? [90 * DEG, 180 * DEG] : null, raisedStart: false, lipAtEnd: false, seamTheta: 203 * DEG, sealTheta: 222 * DEG,
  })) parts.push(part)
  // collar over the tee: pipe, insulation, then each sheet layer
  const pipeMats = { outer: S.PipeOuter, inner: S.PipeBore, end: S.PipeEnd }
  const insMats = { outer: S.InsSkin, inner: S.InsBore, end: S.InsCut }
  add('collar-pipe', sweep(annulusProfile(d.rBore, d.rPipe, -w, w, pipeMats, 0, [false, false]), { segments: 128 }), 'pipe')
  add('collar-ins', sweep(annulusProfile(d.rIns0, d.rInsOut, -w, w, insMats, 0, [false, false]), { segments: 128, tint: pieceTint('collar') }), 'insulation')
  const stack = sheetStack(d, { seamTheta: 203 * DEG })
  for (const sh of stack) add(`collar-${sh.layer}`, sweep(lipProfile(sh.r, sh.t, -w, w, sh.mats.outer, { inner: sh.mats.inner, edge: sh.mats.edge }), { segments: 160 }), sh.layer)
  // branch: coped collar pieces from the run surface up to just above it
  const zTop = rTop + 0.006
  const cope = (Rm: number) => (r: number, z: number, th: number) => (z < 1e-7 ? saddle(Rm, r, th) : z)
  add('br-pipe-cope', sweep(annulusProfile(d.rBore, d.rPipe, 0, zTop, pipeMats, 0, [false, false]), { segments: 128, zMap: cope(d.rPipe) }), 'pipe', BRANCH)
  add('br-ins-cope', sweep(annulusProfile(d.rIns0, d.rInsOut, 0, zTop, insMats, 0, [false, false]), { segments: 128, zMap: cope(d.rInsOut), tint: pieceTint('brcope') }), 'insulation', BRANCH)
  for (const sh of stack) {
    add(`br-${sh.layer}-cope`, sweep(lipProfile(sh.r, sh.t, 0, zTop, sh.mats.outer, { inner: sh.mats.inner, edge: sh.mats.edge }), { segments: 160, zMap: cope(sh.r + sh.t) }), sh.layer, BRANCH)
  }
  // branch: an ordinary insulated run from there up
  const branchLen = 0.62
  for (const part of straightSegment(d, {
    key: 'branch', z0: zTop, z1: branchLen, pipeExt: [0, 4 * IN],
    cutaway: null, raisedStart: false, lipAtEnd: false, seamTheta: 203 * DEG, sealTheta: 222 * DEG,
  })) add(part.key, part.geometry, part.layer, BRANCH)
  const cut = view === 'cutaway'
  const zones: SimZone[] = [
    { key: 'runL', kind: 'run', z0: -zEnd + 0.012, z1: w, radius: outerRadius, rBare: d.rPipe, bareZ: [-zEnd - 4 * IN, zEnd + (cut ? 7 : 4) * IN] },
    { key: 'runR', kind: 'run', z0: w, z1: zEnd - (cut ? 4 * IN : 0) - 0.012, radius: outerRadius, rBare: d.rPipe, bareZ: null, ...(cut ? { wedge: [Math.PI / 2 - 0.05, Math.PI + 0.05] as [number, number], zWedge: zEnd - 18 * IN - 0.01 } : {}) },
    { key: 'branch', kind: 'run', matrix: BRANCH, vertical: true, z0: zTop + 0.01, z1: branchLen - 0.01, radius: outerRadius, rBare: d.rPipe, bareZ: [0, branchLen + 4 * IN] },
    ...stubs(d, [[-zEnd - 4 * IN, -zEnd], [zEnd, zEnd + (cut ? 7 : 4) * IN]]),
    ...stubs(d, [[branchLen, branchLen + 4 * IN]], BRANCH, true),
  ]
  const callouts: Callout[] = view === 'layers'
    ? [
      { title: 'Equal tee', detail: `NPS ${npsLabel(d.npsNominal)}" · branch up`, pos: [0, branchLen + 2 * IN, d.rPipe], side: 'right', tier: 0, layer: 'pipe' },
      { title: 'Fish-mouthed branch', detail: 'Insulation coped to sit on the run', pos: [-rTop * 0.7, rTop * 0.75, 0], side: 'up', tier: 1, layer: 'insulation' },
      { title: 'Collar over the tee', detail: 'No band over the branch opening', pos: [0, -rTop, w * 0.5], side: 'down', tier: 0, layer: d.jacketed ? 'jacket' : 'insulation' },
      { ...finishCallout(d), pos: [0, outerRadius, zEnd - 0.5], side: 'up', tier: 1 },
    ]
    : []
  return { parts, outerRadius, cradles: [-zEnd + 0.2, zEnd - 0.2], zMin: -zEnd, zMax: zEnd, yMax: branchLen + 4 * IN, callouts, zones }
}

/** Bare pipe sticking out past the insulation at the ends of a display run. */
function stubs(d: Dims, spans: [number, number][], matrix?: THREE.Matrix4, vertical?: boolean): SimZone[] {
  return spans.filter(([a, b]) => b - a > 0.01).map(([a, b], i) => ({
    key: `stub-${i}-${a.toFixed(3)}`, kind: 'stub', matrix, vertical, z0: a + 0.006, z1: b - 0.006, radius: d.rPipe, rBare: d.rPipe,
  }))
}

/** Runs either side of a valve or flange pair, their stubs, and the fitting itself (blanket, or bare flanges). */
function fittingZones(d: Dims, outerRadius: number, zi: number, zEnd: number, rBlanket: number, rFlange: number, cut = false): SimZone[] {
  return [
    { key: 'runL', kind: 'run', z0: -zEnd + 0.012, z1: -zi - 0.01, radius: outerRadius, rBare: d.rPipe, bareZ: [-zEnd - 4 * IN, -zi] },
    { key: 'runR', kind: 'run', z0: zi + 0.01, z1: zEnd - 0.012, radius: outerRadius, rBare: d.rPipe, bareZ: [zi, zEnd + 4 * IN], ...(cut ? { wedge: [Math.PI / 2 - 0.05, Math.PI + 0.05] as [number, number], zWedge: zEnd - 18 * IN } : {}) },
    { key: 'fitting', kind: 'fitting', z0: -zi + 0.01, z1: zi - 0.01, radius: rBlanket, rBare: rFlange },
    ...stubs(d, [[-zEnd - 4 * IN, -zEnd], [zEnd, zEnd + 4 * IN]]),
  ]
}

function NPS_KEY(d: Dims): string {
  return npsLabel(d.npsNominal)
}

interface BlanketOpts {
  zSpan: number
  rCore: number
  rEnd: number
  T: number
  /** Valve bonnet boot; null for a flange cover. */
  bonnet: { r: number; yTop: number } | null
  halfOnly: boolean
}

/**
 * Removable insulation blanket over a flanged valve: cold-face silicone-coated
 * fiberglass cloth, 2 × 1" fiberglass mat, hot-face cloth. Quilted panels puff
 * between stitch lines, the ends gather down onto the pipe jacket, a boot covers
 * the bonnet, and the closure is laced with stainless wire across lacing anchors.
 * halfOnly shows just the lower half so the valve and the layer build-up show.
 */
function removableBlanket(o: BlanketOpts) {
  const geos: [string, THREE.BufferGeometry][] = []
  const Rb = o.rCore + o.T
  const taper = 3 * IN
  const lapLen = 2 * IN
  const zc = o.zSpan - lapLen - taper
  const seamTh = 200 * DEG
  const cellZ = 5 * IN
  const cellT = (6 * IN) / Rb
  const smooth = (x: number) => x * x * (3 - 2 * x)
  // outer radius field
  const rOuter = (z: number, th: number) => {
    const az = Math.abs(z)
    let r: number
    if (az <= zc) r = Rb
    else if (az <= zc + taper) r = o.rEnd + o.T * 0.35 + (Rb - o.rEnd - o.T * 0.35) * (1 - smooth((az - zc) / taper))
    else r = o.rEnd + o.T * 0.35 * (1 - smooth(Math.min(1, (az - zc - taper) / (lapLen * 0.6))))
    const core = az <= zc - IN ? 1 : Math.max(0, (zc - az) / IN)
    // quilting: soft pillows between stitch lines (centre panel only)
    const u = ((z + 1000 * cellZ) % cellZ) / cellZ
    const v = ((((th - seamTh) % TAU) + TAU) % TAU) / cellT
    const puff = Math.sin(Math.PI * u) ** 0.8 * Math.sin(Math.PI * (v % 1)) ** 0.8
    r += 0.006 * core * puff - 0.002 * core
    // gathered folds where the end is cinched onto the jacket: radial pleats that
    // run along the pipe, irregular in spacing and depth
    const gather = Math.max(0, Math.min(1, (az - zc + IN) / (taper + IN)))
    const fold = Math.sin(th * 11 + 1.7 * Math.sin(th * 3 + z * 9) + (z > 0 ? 0.8 : 0))
    r += 0.0045 * gather * (1 - gather * 0.6) * Math.sign(fold) * Math.abs(fold) ** 0.6
    // closure seam groove
    const dth = Math.atan2(Math.sin(th - seamTh), Math.cos(th - seamTh))
    r -= 0.003 * Math.exp(-(((dth * Rb) / 0.004) ** 2))
    return r
  }
  const grid = (th0: number, th1: number, inner: boolean, mat: number, rFn: (z: number, th: number) => number) => {
    const NZ = 260
    const NT = 180
    const pos: number[] = []
    const uv: number[] = []
    for (let i = 0; i <= NZ; i++) {
      const z = -o.zSpan + (2 * o.zSpan * i) / NZ
      for (let j = 0; j <= NT; j++) {
        const th = th0 + ((th1 - th0) * j) / NT
        const r = rFn(z, th)
        pos.push(r * Math.cos(th), r * Math.sin(th), z)
        uv.push(th * Rb, z)
      }
    }
    const idx: number[] = []
    for (let i = 0; i < NZ; i++)
      for (let j = 0; j < NT; j++) {
        const q = i * (NT + 1) + j
        if (inner) idx.push(q, q + 1, q + NT + 2, q, q + NT + 2, q + NT + 1)
        else idx.push(q, q + NT + 2, q + 1, q, q + NT + 1, q + NT + 2)
      }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.setIndex(idx)
    g.computeVertexNormals()
    // make sure the outer skin's normals face out (and the inner face in)
    const n = g.getAttribute('normal')
    const p0 = new THREE.Vector3().fromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute, Math.floor(NZ / 2) * (NT + 1) + Math.floor(NT / 2))
    const n0 = new THREE.Vector3().fromBufferAttribute(n as THREE.BufferAttribute, Math.floor(NZ / 2) * (NT + 1) + Math.floor(NT / 2))
    const out = n0.dot(new THREE.Vector3(p0.x, p0.y, 0)) > 0
    if (out === inner) {
      const ix = g.getIndex()!.array as Uint32Array
      for (let k = 0; k < ix.length; k += 3) [ix[k + 1], ix[k + 2]] = [ix[k + 2], ix[k + 1]]
      g.computeVertexNormals()
    }
    const ng = g.toNonIndexed()
    g.dispose()
    return withGroup(ng, mat)
  }
  const th0 = o.halfOnly ? Math.PI : seamTh - TAU
  const th1 = o.halfOnly ? TAU : seamTh
  const rInner = (z: number, th: number) => Math.max(rOuter(z, th) - o.T, o.rEnd - 0.001)
  geos.push(['outer', grid(th0, th1, false, Slot.Fabric, rOuter)])
  geos.push(['inner', grid(th0, th1, true, Slot.FabricInner, rInner)])
  if (o.halfOnly) {
    // cut faces at both θ edges: hot-face cloth | fiberglass mat | cold-face cloth
    for (const th of [th0, th1]) {
      const NZ = 160
      const strips: [number, number, number][] = [[0, 0.04, Slot.FabricInner], [0.04, 0.96, Slot.BlanketCore], [0.96, 1, Slot.Fabric]]
      for (const [a, b, mat] of strips) {
        const pos: number[] = []
        const uv: number[] = []
        for (let i = 0; i < NZ; i++) {
          const za = -o.zSpan + (2 * o.zSpan * i) / NZ
          const zb = -o.zSpan + (2 * o.zSpan * (i + 1)) / NZ
          const ri = (z: number, f: number) => rInner(z, th) + (rOuter(z, th) - rInner(z, th)) * f
          const P = (z: number, f: number) => [ri(z, f) * Math.cos(th), ri(z, f) * Math.sin(th), z]
          const q = [P(za, a), P(zb, a), P(zb, b), P(za, b)]
          const quv = [[ri(za, a), za], [ri(zb, a), zb], [ri(zb, b), zb], [ri(za, b), za]]
          for (const k of th === th0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]) {
            pos.push(...q[k])
            uv.push(...quv[k])
          }
        }
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
        g.computeVertexNormals()
        geos.push([`cut-${th.toFixed(2)}-${mat}`, withGroup(g, mat)])
      }
    }
  } else if (o.bonnet) {
    const bonnet = o.bonnet
    // bonnet boot: a quilted sleeve over the bonnet, gathered at the yoke
    const NB = 64
    const NT = 120
    const y0 = Rb * 0.55
    const pos: number[] = []
    const uv: number[] = []
    for (let i = 0; i <= NB; i++) {
      const y = y0 + ((bonnet.yTop - y0) * i) / NB
      for (let j = 0; j <= NT; j++) {
        const th = (TAU * j) / NT
        const top = Math.max(0, (y - (bonnet.yTop - 0.5 * IN)) / (0.5 * IN))
        const r = (bonnet.r + o.T * 0.6) * (1 - 0.45 * top) + 0.002 * Math.sin(th * 17) * top + 0.003 * Math.sin((Math.PI * i) / NB) ** 2
        pos.push(r * Math.cos(th), y, r * Math.sin(th))
        uv.push(th * r, y)
      }
    }
    const idx: number[] = []
    for (let i = 0; i < NB; i++)
      for (let j = 0; j < NT; j++) {
        const q = i * (NT + 1) + j
        idx.push(q, q + 1, q + NT + 2, q, q + NT + 2, q + NT + 1)
      }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.setIndex(idx)
    g.computeVertexNormals()
    const nn = g.getAttribute('normal')
    if (new THREE.Vector3().fromBufferAttribute(nn as THREE.BufferAttribute, Math.floor(NB / 2) * (NT + 1)).x < 0) {
      const ix = g.getIndex()!.array as Uint32Array
      for (let k = 0; k < ix.length; k += 3) [ix[k + 1], ix[k + 2]] = [ix[k + 2], ix[k + 1]]
      g.computeVertexNormals()
    }
    geos.push(['boot', withGroup(g.toNonIndexed(), Slot.Fabric)])
    // boot top: gathered annulus around the yoke base
    const capR0 = 0.13 * (bonnet.r / 0.42)
    const cap = new THREE.RingGeometry(capR0, (bonnet.r + o.T * 0.6) * 0.55, 64, 2).toNonIndexed()
    cap.rotateX(-Math.PI / 2)
    cap.translate(0, bonnet.yTop, 0)
    geos.push(['boot-cap', withGroup(cap, Slot.Fabric)])
  }

  // lacing anchors (teardrop washer + bent tab) in two rows either side of the
  // closure, stainless lacing wire crossed between them
  const hooks: THREE.BufferGeometry[] = []
  const wires: THREE.BufferGeometry[] = []
  const off = (1.1 * IN) / Rb
  const rows = [seamTh - off, seamTh + off]
  const zs: number[] = []
  for (let z = -zc + 1.5 * IN; z <= zc - 1.5 * IN + 1e-6; z += 4 * IN) zs.push(z)
  let hookAnchor: [number, number, number] = [0, 0, 0]
  const visibleTh = (th: number) => !o.halfOnly || (th > Math.PI && th < TAU)
  rows.forEach((th, ri) => {
    zs.forEach((z, zi) => {
      if (!visibleTh(th)) return
      const r = rOuter(z, th)
      const washer = new THREE.CylinderGeometry(0.42 * IN, 0.42 * IN, 0.045 * IN, 20).toNonIndexed()
      washer.rotateX(Math.PI / 2)
      washer.translate(0, 0, 0.02 * IN)
      const tab = new THREE.BoxGeometry(0.16 * IN, 0.34 * IN, 0.045 * IN).toNonIndexed()
      tab.rotateX(-0.9)
      tab.translate(0, (ri === 0 ? -1 : 1) * 0.12 * IN, 0.14 * IN)
      const g = mergeGeos([withGroup(washer, Slot.Hardware), withGroup(tab, Slot.Hardware)])
      hooks.push(placeRadial(g, r, th, z))
      if (ri === 0 && zi === Math.floor(zs.length / 2)) hookAnchor = [r * Math.cos(th), r * Math.sin(th), z]
    })
  })
  for (let i = 0; i < zs.length - 1; i++) {
    for (const [ta, tb] of [[rows[0], rows[1]], [rows[1], rows[0]]]) {
      if (!visibleTh(ta) || !visibleTh(tb)) continue
      const pts: THREE.Vector3[] = []
      for (let k = 0; k <= 12; k++) {
        const u = k / 12
        const z = zs[i] + (zs[i + 1] - zs[i]) * u
        const th = ta + (tb - ta) * u
        const r = rOuter(z, th) + 0.0035
        pts.push(new THREE.Vector3(r * Math.cos(th), r * Math.sin(th), z))
      }
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.001, 6).toNonIndexed()
      wires.push(withGroup(tube, Slot.Hardware))
    }
  }
  if (hooks.length) geos.push(['hooks', mergeGeos(hooks)])
  if (wires.length) geos.push(['wires', mergeGeos(wires)])
  return { geos, rOuter: Rb, hookAnchor }
}
