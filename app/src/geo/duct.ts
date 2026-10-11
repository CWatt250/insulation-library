import * as THREE from 'three'
import { Slot } from '../materials/library'
import type { Assembly, Callout, Part, SimZone, ViewMode } from './assembly'

/**
 * A horizontal run of galvanized duct, bare or insulated:
 *  - rectangular duct: 24 ga sheet, flat drive-slip joint; round: spiral seam
 *  - duct wrap: blanket at its installed (25 % compressed) thickness, rounding
 *    over the corners, FSK facing, 3" foil tape on the 2" stapling-flange seam
 *    along the top and on the butt joints between 48" rolls (Knauf, OC, JM)
 *  - ducts 24" and wider: pins with square speed clips on the underside at
 *    18" on center (OC, JM, Knauf, CertainTeed)
 *  - elastomeric sheet: black closed-cell sheet, fully adhered, no facing
 * Cutaway: the insulation stops short of the end to show the bare duct, with
 * the facing peeled back a little so the blanket edge shows.
 * Local frame as the pipe assemblies: run along +z, y up.
 */

export interface DuctParams {
  shape: 'rect' | 'round'
  /** Sheet-metal size, m. */
  w: number
  h: number
  d: number
  /** Installed insulation thickness, m (0 = bare). */
  t: number
  insulation: 'wrap' | 'elastomeric'
  view: ViewMode
}

const IN = 0.0254
const SHEET = 0.024 * IN // 24 ga

/** Closed 2-D outline: rounded rectangle (r may be 0) or circle, with outward normals and arc length. */
interface Outline { p: [number, number][]; n: [number, number][]; s: number[] }

function roundedRect(hw: number, hh: number, r: number, nArc = 10): Outline {
  const p: [number, number][] = []
  const n: [number, number][] = []
  const corners: [number, number, number][] = [[1, 1, 0], [-1, 1, 90], [-1, -1, 180], [1, -1, 270]]
  for (const [sx, sy, a0] of corners) {
    const cx = sx * (hw - r)
    const cy = sy * (hh - r)
    for (let j = 0; j <= nArc; j++) {
      const a = ((a0 + (90 * j) / nArc) * Math.PI) / 180
      p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
      n.push([Math.cos(a), Math.sin(a)])
    }
  }
  return withArc(p, n)
}

function circle(r: number, seg = 96): Outline {
  const p: [number, number][] = []
  const n: [number, number][] = []
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2
    p.push([r * Math.cos(a), r * Math.sin(a)])
    n.push([Math.cos(a), Math.sin(a)])
  }
  return withArc(p, n)
}

function withArc(p: [number, number][], n: [number, number][]): Outline {
  const s = [0]
  for (let i = 1; i <= p.length; i++) {
    const a = p[i - 1]
    const b = p[i % p.length]
    s.push(s[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]))
  }
  return { p, n, s }
}

class Builder {
  pos: number[] = []
  nor: number[] = []
  uv: number[] = []
  groups: { start: number; count: number; mat: number }[] = []
  private add(v: [number, number, number], nn: [number, number, number], u: [number, number]) {
    this.pos.push(...v)
    this.nor.push(...nn)
    this.uv.push(...u)
  }
  begin(mat: number) {
    const last = this.groups[this.groups.length - 1]
    if (last && last.mat === mat && last.start + last.count === this.pos.length / 3) return
    this.groups.push({ start: this.pos.length / 3, count: 0, mat })
  }
  tri(a: [number, number, number], b: [number, number, number], c: [number, number, number], na: [number, number, number], nb: [number, number, number], nc: [number, number, number], ua: [number, number], ub: [number, number], uc: [number, number], mat: number) {
    this.begin(mat)
    this.add(a, na, ua)
    this.add(b, nb, ub)
    this.add(c, nc, uc)
    this.groups[this.groups.length - 1].count += 3
  }
  /** The side wall of an outline swept from z0 to z1; `inward` flips it to face the inside. */
  wall(o: Outline, z0: number, z1: number, mat: number, inward = false) {
    const m = o.p.length
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m
      const [ax, ay] = o.p[i]
      const [bx, by] = o.p[j]
      if (Math.hypot(bx - ax, by - ay) < 1e-7) continue
      const f = inward ? -1 : 1
      const na: [number, number, number] = [o.n[i][0] * f, o.n[i][1] * f, 0]
      const nb: [number, number, number] = [o.n[j][0] * f, o.n[j][1] * f, 0]
      const A0: [number, number, number] = [ax, ay, z0]
      const B0: [number, number, number] = [bx, by, z0]
      const A1: [number, number, number] = [ax, ay, z1]
      const B1: [number, number, number] = [bx, by, z1]
      const ua: [number, number] = [o.s[i], z0]
      const ub: [number, number] = [o.s[i + 1], z0]
      const ua1: [number, number] = [o.s[i], z1]
      const ub1: [number, number] = [o.s[i + 1], z1]
      if (!inward) {
        this.tri(A0, B0, B1, na, nb, nb, ua, ub, ub1, mat)
        this.tri(A0, B1, A1, na, nb, na, ua, ub1, ua1, mat)
      } else {
        this.tri(A0, B1, B0, na, nb, nb, ua, ub1, ub, mat)
        this.tri(A0, A1, B1, na, na, nb, ua, ua1, ub1, mat)
      }
    }
  }
  /** Flat ring between two outlines with matching point counts, at z, facing ±z. */
  cap(inner: Outline, outer: Outline, z: number, dir: 1 | -1, mat: number) {
    const m = inner.p.length
    const nn: [number, number, number] = [0, 0, dir]
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m
      const a: [number, number, number] = [inner.p[i][0], inner.p[i][1], z]
      const b: [number, number, number] = [inner.p[j][0], inner.p[j][1], z]
      const c: [number, number, number] = [outer.p[j][0], outer.p[j][1], z]
      const d: [number, number, number] = [outer.p[i][0], outer.p[i][1], z]
      const uv = (q: [number, number, number]): [number, number] => [q[0], q[1]]
      if (dir > 0) {
        this.tri(a, b, c, nn, nn, nn, uv(a), uv(b), uv(c), mat)
        this.tri(a, c, d, nn, nn, nn, uv(a), uv(c), uv(d), mat)
      } else {
        this.tri(a, c, b, nn, nn, nn, uv(a), uv(c), uv(b), mat)
        this.tri(a, d, c, nn, nn, nn, uv(a), uv(d), uv(c), mat)
      }
    }
  }
  /** A closed shell between two outlines over z0..z1, with both ends capped. */
  shell(inner: Outline, outer: Outline, z0: number, z1: number, m: { outer: number; inner: number; end: number }) {
    this.wall(outer, z0, z1, m.outer)
    this.wall(inner, z0, z1, m.inner, true)
    this.cap(inner, outer, z0, -1, m.end)
    this.cap(inner, outer, z1, 1, m.end)
  }
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, mat: number) {
    const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed()
    g.translate(cx, cy, cz)
    const P = g.getAttribute('position')
    const N = g.getAttribute('normal')
    const U = g.getAttribute('uv')
    this.begin(mat)
    for (let i = 0; i < P.count; i++) this.add([P.getX(i), P.getY(i), P.getZ(i)], [N.getX(i), N.getY(i), N.getZ(i)], [U.getX(i) * sx, U.getY(i) * sz])
    this.groups[this.groups.length - 1].count += P.count
    g.dispose()
  }
  geometry() {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(this.pos.length).fill(1), 3))
    for (const gr of this.groups) g.addGroup(gr.start, gr.count, gr.mat)
    return g
  }
}

export interface DuctAssembly extends Assembly {
  /** Rectangular duct stands: half-width of the top plate, the duct's underside, and stations along z. */
  stands: { halfW: number; bottomY: number; stations: number[] }
  /** Floor height for this duct (lowered under tall ducts). */
  floorY: number
}

const DEFAULT_FLOOR = -0.42

export function ductAssembly(d: DuctParams): DuctAssembly {
  const round = d.shape === 'round'
  const hw = round ? d.d / 2 : d.w / 2
  const hh = round ? d.d / 2 : d.h / 2
  const t = d.t
  const insulated = t > 0
  const outW = hw + t
  const outH = hh + t
  const len = Math.max(1.6, 2.4 * Math.max(outW, outH))
  const cut = d.view === 'cutaway'
  // insulation ends short of the duct end; the cutaway leaves a longer bare stub
  const stub = cut ? Math.max(0.16, 0.5 * Math.min(outW, outH) + 0.08) : 0.07
  const zIns = len - stub
  const parts: Part[] = []
  const nArc = 10

  // ---- sheet metal
  const sheetOut = round ? circle(hw) : roundedRect(hw, hh, 0.0015, nArc)
  const sheetIn = round ? circle(hw - SHEET) : roundedRect(hw - SHEET, hh - SHEET, 0.0008, nArc)
  const metal = new Builder()
  metal.shell(sheetIn, sheetOut, 0, len, { outer: Slot.PipeOuter, inner: Slot.PipeBore, end: Slot.PipeEnd })
  if (!round) {
    // flat drive-slip joint: a raised band 1-1/2" wide, one sheet thick, at the roll-out seam
    const zj = len * 0.36
    const band = roundedRect(hw + SHEET * 2.2, hh + SHEET * 2.2, 0.002, nArc)
    metal.shell(sheetOut, band, zj - 0.75 * IN, zj + 0.75 * IN, { outer: Slot.PipeOuter, inner: Slot.PipeOuter, end: Slot.PipeEnd })
  } else {
    // spiral lock seam: a low ridge winding round at ~5-1/2" pitch
    const pitch = 5.5 * IN
    const turns = len / pitch
    const steps = Math.ceil(turns * 64)
    const r = hw + 0.0012
    const wSeam = 0.007
    for (let i = 0; i < steps; i++) {
      const z0 = (i / steps) * len
      const z1 = ((i + 1) / steps) * len
      const a0 = (z0 / pitch) * Math.PI * 2
      const a1 = (z1 / pitch) * Math.PI * 2
      const P = (a: number, z: number, dz: number): [number, number, number] => [r * Math.cos(a), r * Math.sin(a), z + dz]
      const n0: [number, number, number] = [Math.cos(a0), Math.sin(a0), 0]
      const n1: [number, number, number] = [Math.cos(a1), Math.sin(a1), 0]
      metal.tri(P(a0, z0, -wSeam / 2), P(a1, z1, -wSeam / 2), P(a1, z1, wSeam / 2), n0, n1, n1, [0, z0], [0.01, z1], [0.01, z1], Slot.PipeOuter)
      metal.tri(P(a0, z0, -wSeam / 2), P(a1, z1, wSeam / 2), P(a0, z0, wSeam / 2), n0, n1, n0, [0, z0], [0.01, z1], [0, z0], Slot.PipeOuter)
    }
  }
  parts.push({ key: 'duct', geometry: metal.geometry(), layer: 'pipe' })

  const callouts: Callout[] = [{ title: round ? 'Spiral duct' : 'Galvanized duct', detail: round ? `${(d.d / IN).toFixed(0)}" round, galvanized` : `${(d.w / IN).toFixed(0)}" × ${(d.h / IN).toFixed(0)}", 24 ga galvanized`, pos: [hw * 0.7, hh, len - stub * 0.5], layer: 'pipe' }]

  if (insulated) {
    // ---- insulation: hugs the sheet, rounds over the corners (radius ≈ its thickness)
    const insIn = round ? circle(hw + 0.0004) : roundedRect(hw + 0.0004, hh + 0.0004, 0.0015, nArc)
    const rCorner = d.insulation === 'wrap' ? t * 0.9 : t * 0.5
    const insOut = round ? circle(outW) : roundedRect(outW, outH, rCorner, nArc)
    const ins = new Builder()
    ins.shell(insIn, insOut, 0.002, zIns, { outer: Slot.InsSkin, inner: Slot.InsBore, end: Slot.InsCut })
    parts.push({ key: 'insulation', geometry: ins.geometry(), layer: 'insulation' })
    callouts.push({
      title: d.insulation === 'wrap' ? 'Fiberglass duct wrap' : 'Elastomeric sheet',
      detail: d.insulation === 'wrap' ? `${(t / IN).toFixed(2)}" installed (25% compressed)` : `${(t / IN).toFixed(2)}", fully adhered`,
      pos: [outW * 0.6, outH * 0.6, zIns], layer: 'insulation',
    })

    if (d.insulation === 'wrap') {
      // ---- FSK facing: a thin skin over the blanket, peeled back a little at the cut end
      const fz1 = cut ? zIns - 0.035 : zIns
      const fIn = round ? circle(outW + 0.0002) : roundedRect(outW + 0.0002, outH + 0.0002, rCorner + 0.0002, nArc)
      const fOut = round ? circle(outW + 0.0007) : roundedRect(outW + 0.0007, outH + 0.0007, rCorner + 0.0007, nArc)
      const fac = new Builder()
      fac.shell(fIn, fOut, 0.002, fz1, { outer: Slot.DuctFacing, inner: Slot.FacingInner, end: Slot.FacingEdge })
      // ---- 3" foil tape: butt joints between 48" rolls, and the longitudinal flange seam on top
      const tIn = fOut
      const tOut = round ? circle(outW + 0.0011) : roundedRect(outW + 0.0011, outH + 0.0011, rCorner + 0.0011, nArc)
      for (let z = 48 * IN * 0.62; z < fz1 - 2 * IN; z += 48 * IN) fac.shell(tIn, tOut, z - 1.5 * IN, z + 1.5 * IN, { outer: Slot.Tape, inner: Slot.Tape, end: Slot.Tape })
      if (round) {
        fac.box(-outW * 0.55, outH * 0.84, fz1 / 2, 3 * IN, 0.0012, fz1 - 0.01, Slot.Tape)
      } else {
        const x = outW - rCorner - 2.2 * IN
        fac.box(x, outH + 0.0012, (0.002 + fz1) / 2, 3 * IN, 0.0012, fz1 - 0.004, Slot.Tape)
        // ---- pins and speed clips under ducts 24" and wider, 18" on center
        if (d.w >= 24 * IN - 1e-6) {
          const across = Math.max(1, Math.round(d.w / (18 * IN)))
          for (let z = 9 * IN; z < fz1 - 3 * IN; z += 18 * IN) {
            for (let k = 0; k < across; k++) {
              const x2 = -d.w / 2 + ((k + 0.5) / across) * d.w
              fac.box(x2, -outH - 0.0012, z, 1.5 * IN, 0.0012, 1.5 * IN, Slot.Hardware)
              fac.box(x2, -outH - 0.004, z, 0.12 * IN, 0.006, 0.12 * IN, Slot.Hardware)
            }
          }
        }
      }
      parts.push({ key: 'facing', geometry: fac.geometry(), layer: 'facing' })
      callouts.push({ title: 'FSK facing', detail: 'Foil-scrim-kraft vapor retarder, seams taped', pos: [-outW * 0.4, outH + 0.001, zIns * 0.6], layer: 'facing' })
    }
  }

  const minHalf = Math.min(outW, outH)
  const zones: SimZone[] = [
    round
      ? { key: 'run', kind: 'run', z0: 0.012, z1: zIns - 0.012, radius: outW + 0.001, rBare: hw, bareZ: [0, len] }
      : { key: 'run', kind: 'run', z0: 0.012, z1: zIns - 0.012, radius: minHalf, rBare: Math.min(hw, hh), bareZ: [0, len], box: [outW + 0.001, outH + 0.001], boxBare: [hw, hh] },
    round
      ? { key: 'stub', kind: 'stub', z0: zIns + 0.004, z1: len, radius: hw, rBare: hw }
      : { key: 'stub', kind: 'stub', z0: zIns + 0.004, z1: len, radius: Math.min(hw, hh), rBare: Math.min(hw, hh), box: [hw, hh], boxBare: [hw, hh] },
  ]
  const floorY = Math.min(DEFAULT_FLOOR, -(outH + 0.16))
  return {
    parts,
    zones,
    outerRadius: Math.max(outW, outH),
    cradles: [],
    zMin: 0,
    zMax: len,
    yMax: outH,
    // labels belong to the Layers view, which ducts don't offer yet
    callouts: d.view === 'layers' ? callouts : [],
    stands: { halfW: outW, bottomY: -outH, stations: [0.28, len - stub - 0.32] },
    floorY,
  }
}
