import * as THREE from 'three'
import { Slot } from '../materials/library'
import type { Assembly, Callout, Part, SimZone, ViewMode } from './assembly'

/**
 * A horizontal run of galvanized duct, bare or insulated:
 *  - rectangular duct: 24 ga sheet, flat drive-slip joint; round: spiral seam
 *  - duct wrap: blanket at its installed (25 % compressed) thickness, rounding
 *    over the corners, FSK facing, 3" foil tape on the 2" stapling-flange seam
 *    along the top and on the butt joints between 48" rolls (Knauf, OC, JM)
 *  - rigid board: square-cut and butted at the corners, FSK or ASJ facing,
 *    3" tape on the corners and the joints between 48" boards
 *  - ducts 24" and wider: pins on the underside at 18" on center, with square
 *    speed clips on wrap and the washers taped over on board (JM Microlite)
 *  - outdoors: 0.016" stucco-embossed aluminum jacket over the board, 36" sheets
 *    lapped 3", screwed on rectangular duct and banded on round (UFGS 23 07 00)
 * Installed: the insulation stops short of the end to show the bare duct, with
 * the facing peeled back a little so the edge shows. Cutaway: stripped in steps
 * along the run — jacket, facing, insulation — so every layer shows.
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
  /** Duct wrap (compressed blanket), rigid fiberglass board, or foil-faced polyiso board (outdoors). */
  insulation: 'wrap' | 'board' | 'polyiso'
  /** Factory facing: FSK foil, or white ASJ (board). */
  facing: 'fsk' | 'asj'
  /** Outdoors: an aluminum jacket over the facing. */
  jacket: 'none' | 'alu'
  view: ViewMode
}

const IN = 0.0254
const SHEET = 0.024 * IN // 24 ga

/** Closed 2-D outline: rounded rectangle (r may be 0) or circle, with outward normals and arc length. */
interface Outline { p: [number, number][]; n: [number, number][]; s: number[]; corners?: number[] }

/**
 * Rounded rectangle, counter-clockwise from the +x+y corner. `flat` adds that
 * many segments along the top/bottom and the sides (so a wavy surface can bend
 * between corners); `corners` records where each corner arc starts.
 */
function roundedRect(hw: number, hh: number, r: number, nArc = 10, flat: [number, number] = [1, 1], rise = 0): Outline {
  const p: [number, number][] = []
  const n: [number, number][] = []
  const marks: number[] = []
  const corners: [number, number, number][] = [[1, 1, 0], [-1, 1, 90], [-1, -1, 180], [1, -1, 270]]
  corners.forEach(([sx, sy, a0], k) => {
    const cx = sx * (hw - r)
    // a tapered top: the +x side stands `rise` higher, so water runs off
    const cy = sy * (hh - r) + (k === 0 ? rise : 0)
    marks.push(p.length)
    for (let j = 0; j <= nArc; j++) {
      const a = ((a0 + (90 * j) / nArc) * Math.PI) / 180
      p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
      n.push([Math.cos(a), Math.sin(a)])
    }
    // the flat edge on to the next corner: top, left side, bottom, right side
    const segs = k % 2 === 0 ? flat[0] : flat[1]
    const a1 = ((a0 + 90) * Math.PI) / 180
    const [nx, ny] = [Math.round(Math.cos(a1)), Math.round(Math.sin(a1))]
    const [qx, qy] = p[p.length - 1]
    const [ex, ey] = k === 0 ? [-(hw - r), hh] : k === 1 ? [-hw, -(hh - r)] : k === 2 ? [hw - r, -hh] : [hw, hh - r + rise]
    // the sloped top's normal leans toward the low side
    const tn = k === 0 && rise ? (() => { const l = Math.hypot(rise, 2 * (hw - r)); return [rise / l, (2 * (hw - r)) / l] as [number, number] })() : [nx, ny] as [number, number]
    for (let j = 1; j < segs; j++) {
      p.push([qx + ((ex - qx) * j) / segs, qy + ((ey - qy) * j) / segs])
      n.push(tn)
    }
  })
  return { ...withArc(p, n), corners: marks }
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

/**
 * An open strip over one corner of a rounded rectangle (0 = +x+y, then
 * counter-clockwise), running `reach` along each face: tape over a board corner.
 */
function cornerStrip(hw: number, hh: number, r: number, corner: 0 | 1 | 2 | 3, reach: number, nArc = 6): Outline {
  const [sx, sy, deg] = ([[1, 1, 0], [-1, 1, 90], [-1, -1, 180], [1, -1, 270]] as const)[corner]
  const cx = sx * (hw - r)
  const cy = sy * (hh - r)
  const a0 = (deg * Math.PI) / 180
  const a1 = a0 + Math.PI / 2
  const p: [number, number][] = [[cx + r * Math.cos(a0) + Math.sin(a0) * reach, cy + r * Math.sin(a0) - Math.cos(a0) * reach]]
  const n: [number, number][] = [[Math.cos(a0), Math.sin(a0)]]
  for (let j = 0; j <= nArc; j++) {
    const a = a0 + ((a1 - a0) * j) / nArc
    p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
    n.push([Math.cos(a), Math.sin(a)])
  }
  p.push([cx + r * Math.cos(a1) - Math.sin(a1) * reach, cy + r * Math.sin(a1) + Math.cos(a1) * reach])
  n.push([Math.cos(a1), Math.sin(a1)])
  const s = [0]
  for (let i = 1; i < p.length; i++) s.push(s[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]))
  return { p, n, s }
}

type V3 = [number, number, number]

class Builder {
  pos: number[] = []
  nor: number[] = []
  uv: number[] = []
  groups: { start: number; count: number; mat: number }[] = []
  /**
   * Optional waviness: how far (m) the surface at an outline point (x, y, outward
   * normal nx, ny) moves out along that normal at z. Walls are then split along
   * the run every `dz` so the surface can bend.
   */
  disp: ((x: number, y: number, z: number, nx: number, ny: number) => number) | null = null
  dz = 0.035
  /** An outline point at z, moved by the waviness, with the surface normal there (outward). */
  private at(x: number, y: number, nx: number, ny: number, z: number): { p: V3; n: V3 } {
    const d = this.disp
    if (!d) return { p: [x, y, z], n: [nx, ny, 0] }
    const h = d(x, y, z, nx, ny)
    const e = 0.004
    const tx = -ny, ty = nx
    const hs = (d(x + tx * e, y + ty * e, z, nx, ny) - d(x - tx * e, y - ty * e, z, nx, ny)) / (2 * e)
    const hz = (d(x, y, z + e, nx, ny) - d(x, y, z - e, nx, ny)) / (2 * e)
    const v: V3 = [nx - hs * tx, ny - hs * ty, -hz]
    const l = Math.hypot(v[0], v[1], v[2]) || 1
    return { p: [x + nx * h, y + ny * h, z], n: [v[0] / l, v[1] / l, v[2] / l] }
  }
  /** Run stations from z0 to z1: just the ends, or every `dz` when the surface is wavy and moves here. */
  private zs(o: Outline, z0: number, z1: number): number[] {
    const d = this.disp
    if (!d || !o.p.some(([x, y], i) => Math.abs(d(x, y, (z0 + z1) / 2, o.n[i][0], o.n[i][1])) > 1e-5)) return [z0, z1]
    const k = Math.max(1, Math.ceil((z1 - z0) / this.dz))
    return Array.from({ length: k + 1 }, (_, i) => z0 + ((z1 - z0) * i) / k)
  }
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
    const zs = this.zs(o, z0, z1)
    const f = inward ? -1 : 1
    const V = (i: number, z: number) => {
      const r = this.at(o.p[i][0], o.p[i][1], o.n[i][0], o.n[i][1], z)
      return { p: r.p, n: [r.n[0] * f, r.n[1] * f, r.n[2] * f] as V3 }
    }
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m
      if (Math.hypot(o.p[j][0] - o.p[i][0], o.p[j][1] - o.p[i][1]) < 1e-7) continue
      for (let q = 0; q < zs.length - 1; q++) {
        const za = zs[q], zb = zs[q + 1]
        const A0 = V(i, za), B0 = V(j, za), A1 = V(i, zb), B1 = V(j, zb)
        const ua: [number, number] = [o.s[i], za]
        const ub: [number, number] = [o.s[i + 1], za]
        const ua1: [number, number] = [o.s[i], zb]
        const ub1: [number, number] = [o.s[i + 1], zb]
        if (!inward) {
          this.tri(A0.p, B0.p, B1.p, A0.n, B0.n, B1.n, ua, ub, ub1, mat)
          this.tri(A0.p, B1.p, A1.p, A0.n, B1.n, A1.n, ua, ub1, ua1, mat)
        } else {
          this.tri(A0.p, B1.p, B0.p, A0.n, B1.n, B0.n, ua, ub1, ub, mat)
          this.tri(A0.p, A1.p, B1.p, A0.n, A1.n, B1.n, ua, ua1, ub1, mat)
        }
      }
    }
  }
  /** Flat ring between two outlines with matching point counts, at z, facing ±z. */
  cap(inner: Outline, outer: Outline, z: number, dir: 1 | -1, mat: number) {
    const m = inner.p.length
    const nn: [number, number, number] = [0, 0, dir]
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m
      const P = (o: Outline, k: number) => this.at(o.p[k][0], o.p[k][1], o.n[k][0], o.n[k][1], z).p
      const a = P(inner, i)
      const b = P(inner, j)
      const c = P(outer, j)
      const d = P(outer, i)
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
  /** A quad wound to face `n`. */
  quad(a: V3, b: V3, c: V3, d: V3, n: V3, uv: [number, number][], mat: number) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    const fx = e1[1] * e2[2] - e1[2] * e2[1]
    const fy = e1[2] * e2[0] - e1[0] * e2[2]
    const fz = e1[0] * e2[1] - e1[1] * e2[0]
    if (fx * n[0] + fy * n[1] + fz * n[2] >= 0) {
      this.tri(a, b, c, n, n, n, uv[0], uv[1], uv[2], mat)
      this.tri(a, c, d, n, n, n, uv[0], uv[2], uv[3], mat)
    } else {
      this.tri(a, c, b, n, n, n, uv[0], uv[2], uv[1], mat)
      this.tri(a, d, c, n, n, n, uv[0], uv[3], uv[2], mat)
    }
  }
  /**
   * Part of a shell: only the outline points listed in `idx` (in path order),
   * with the cut faces where the shell has been cut back along the run.
   */
  partial(inner: Outline, outer: Outline, idx: number[], z0: number, z1: number, m: { outer: number; inner: number; end: number }) {
    const sub = (o: Outline): Outline => {
      const p = idx.map((i) => o.p[i])
      const n = idx.map((i) => o.n[i])
      const s2 = [0]
      for (let k = 1; k < p.length; k++) s2.push(s2[k - 1] + Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]))
      return { p, n, s: s2 }
    }
    const I = sub(inner)
    const O = sub(outer)
    const last = idx.length - 1
    const at = (o: Outline, k: number, z: number) => this.at(o.p[k][0], o.p[k][1], o.n[k][0], o.n[k][1], z)
    const zs = this.zs(O, z0, z1)
    for (let k = 0; k < last; k++) {
      for (let q = 0; q < zs.length - 1; q++) {
        const za = zs[q], zb = zs[q + 1]
        // outside face, wound outward; inside face, wound inward
        const A0 = at(O, k, za), B0 = at(O, k + 1, za), A1 = at(O, k, zb), B1 = at(O, k + 1, zb)
        this.tri(A0.p, B0.p, B1.p, A0.n, B0.n, B1.n, [O.s[k], za], [O.s[k + 1], za], [O.s[k + 1], zb], m.outer)
        this.tri(A0.p, B1.p, A1.p, A0.n, B1.n, A1.n, [O.s[k], za], [O.s[k + 1], zb], [O.s[k], zb], m.outer)
        const a0 = at(I, k, za), b0 = at(I, k + 1, za), a1 = at(I, k, zb), b1 = at(I, k + 1, zb)
        const neg = (v: V3): V3 => [-v[0], -v[1], -v[2]]
        this.tri(a0.p, b1.p, b0.p, neg(a0.n), neg(b1.n), neg(b0.n), [I.s[k], za], [I.s[k + 1], zb], [I.s[k + 1], za], m.inner)
        this.tri(a0.p, a1.p, b1.p, neg(a0.n), neg(a1.n), neg(b1.n), [I.s[k], za], [I.s[k], zb], [I.s[k + 1], zb], m.inner)
      }
      for (const [z, dir] of [[z0, -1], [z1, 1]] as const) {
        const a = at(I, k, z).p, b = at(I, k + 1, z).p, B = at(O, k + 1, z).p, A = at(O, k, z).p
        this.quad(a, b, B, A, [0, 0, dir], [[a[0], a[1]], [b[0], b[1]], [B[0], B[1]], [A[0], A[1]]], m.end)
      }
    }
    // the two long cut faces: each faces along the path, away from what's kept
    for (const [k, sgn] of [[0, -1], [last, 1]] as const) {
      const nn = O.n[k]
      const tang: V3 = [-nn[1] * sgn, nn[0] * sgn, 0]
      for (let q = 0; q < zs.length - 1; q++) {
        const za = zs[q], zb = zs[q + 1]
        const a0 = at(I, k, za).p, A0 = at(O, k, za).p, A1 = at(O, k, zb).p, a1 = at(I, k, zb).p
        const depth = Math.hypot(A0[0] - a0[0], A0[1] - a0[1])
        this.quad(a0, A0, A1, a1, tang, [[0, za], [depth, za], [depth, zb], [0, zb]], m.end)
      }
    }
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
  /** Any small solid (a screw head), in place. */
  solid(g: THREE.BufferGeometry, mat: number) {
    const n = g.index ? g.toNonIndexed() : g
    const P = n.getAttribute('position')
    const N = n.getAttribute('normal')
    const U = n.getAttribute('uv')
    this.begin(mat)
    for (let i = 0; i < P.count; i++) this.add([P.getX(i), P.getY(i), P.getZ(i)], [N.getX(i), N.getY(i), N.getZ(i)], [U.getX(i), U.getY(i)])
    this.groups[this.groups.length - 1].count += P.count
    if (n !== g) n.dispose()
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

/**
 * Hex-washer-head screws along a jacket lap at z, `pitch` apart round the
 * outline, kept `clear` of the corners (0 = none to keep clear of: round duct).
 */
function screwsAround(b: Builder, o: Outline, z: number, pitch: number, clear: number) {
  const total = o.s[o.s.length - 1]
  const m = o.p.length
  for (let at = pitch / 2; at < total; at += pitch) {
    let i = 0
    while (i < m - 1 && o.s[i + 1] < at) i++
    const j = (i + 1) % m
    const f = (at - o.s[i]) / Math.max(1e-9, o.s[i + 1] - o.s[i])
    const x = o.p[i][0] + (o.p[j][0] - o.p[i][0]) * f
    const y = o.p[i][1] + (o.p[j][1] - o.p[i][1]) * f
    const nx = o.n[i][0] + (o.n[j][0] - o.n[i][0]) * f
    const ny = o.n[i][1] + (o.n[j][1] - o.n[i][1]) * f
    if (clear > 0) {
      // skip screws on (or near) a corner arc: corners on a rect outline sit where both |x| and |y| are near the edge
      const hx = Math.max(...o.p.map((q) => q[0]))
      const hy = Math.max(...o.p.map((q) => q[1]))
      if (Math.abs(x) > hx - clear && Math.abs(y) > hy - clear) continue
    }
    const a = Math.atan2(ny, nx)
    const head = new THREE.CylinderGeometry(0.0052, 0.0056, 0.0026, 6)
    // cylinder axis (y) → the outline normal, sitting on the surface
    head.rotateZ(a - Math.PI / 2)
    head.translate(x + Math.cos(a) * 0.0013, y + Math.sin(a) * 0.0013, z)
    b.solid(head, Slot.Screw)
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
  // Installed: the insulation stops short of the end, leaving a stub of bare duct, with the
  // facing peeled back a little so the blanket edge shows. Cutaway: insulation to near the
  // end, stripped in steps along the run instead (below).
  const stub = cut ? 0.07 : Math.max(0.16, 0.5 * Math.min(outW, outH) + 0.08)
  const zIns = len - stub
  // cutaway: along the far part of the run the top and near side are stripped in steps —
  // facing first, then the blanket — so facing, blanket and sheet metal each show
  const zJacket = len * (d.jacket === 'alu' && d.t > 0 ? 0.3 : 0.24)
  const zFacing = len * 0.42
  const zBlanket = len * 0.6
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

  let cutWedge: [number, number] | null = null
  const callouts: Callout[] = [{ title: round ? 'Spiral duct' : 'Galvanized duct', detail: round ? `${(d.d / IN).toFixed(0)}" round, galvanized` : `${(d.w / IN).toFixed(0)}" × ${(d.h / IN).toFixed(0)}", 24 ga galvanized`, pos: [hw * 0.7, hh, len - stub * 0.5], layer: 'pipe' }]

  if (insulated) {
    const wrap = d.insulation === 'wrap'
    const poly = d.insulation === 'polyiso'
    const asj = d.facing === 'asj'
    const alu = d.jacket === 'alu'
    // ---- insulation: wrap is compressed over the corners (radius ≈ its thickness);
    // board is cut square and butted at the corners. Rectangular outlines carry points
    // along the flat faces (every ~3 cm) so the wrap can pillow between the corners.
    const rCorner = wrap ? t * 0.9 : 0.003
    const flat: [number, number] = round ? [1, 1] : [Math.max(1, Math.round((2 * hw) / 0.03)), Math.max(1, Math.round((2 * hh) / 0.03))]
    // polyiso outdoors: JM puts tapered boards on top of ducts over 32" wide so water runs
    // off — 1" more thickness over each 4' board (the ¼ slope JM prints, read as ¼" per foot)
    const rise = poly && !round && d.w > 32 * IN ? (0.25 * IN * (2 * outW)) / 0.3048 : 0
    const insIn = round ? circle(hw + 0.0004) : roundedRect(hw + 0.0004, hh + 0.0004, 0.0015, nArc, flat)
    /** The insulation's outline grown by `o` (facing, tape and jacket sit on it). */
    const over = (o: number) => (round ? circle(outW + o) : roundedRect(outW + o, outH + o, rCorner + o, nArc, flat, rise))
    const insOut = over(0)
    // what the cutaway keeps: the far side and underside (rect: corner 2 → corner 0; round: 180° → 90°)
    const nC = nArc + 1
    const kept = round
      ? [...Array.from({ length: 48 }, (_, i) => 48 + i), ...Array.from({ length: 25 }, (_, i) => i)]
      : [...Array.from({ length: insOut.p.length - insOut.corners![2] }, (_, i) => insOut.corners![2] + i), ...Array.from({ length: nC }, (_, i) => i)]
    cutWedge = round ? [Math.PI / 2, Math.PI] : [Math.atan2(outH, outW - rCorner), Math.PI + Math.atan2(outH - rCorner, outW)]

    // ---- the wrap is a blanket: it pillows between the compressed corners, pinches in at
    // the taped butt joints, ripples, and on wide ducts dips at each pin and speed clip
    const joints: number[] = []
    for (let z = 48 * IN * 0.62; z < zIns; z += 48 * IN) joints.push(z)
    const pins: [number, number][] = []
    if (!round && d.w >= 24 * IN - 1e-6) {
      const across = Math.max(1, Math.round(d.w / (18 * IN)))
      for (let z = 9 * IN; z < zIns - 0.035 - 3 * IN; z += 18 * IN) for (let k = 0; k < across; k++) pins.push([-d.w / 2 + ((k + 0.5) / across) * d.w, z])
    }
    const A = Math.min(0.0065, 0.2 * t)
    const smooth = (e0: number, e1: number, x: number) => {
      const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
      return u * u * (3 - 2 * u)
    }
    const pinch = (z: number) => joints.reduce((m, zj) => Math.min(m, 1 - 0.8 * Math.exp(-(((z - zj) / 0.07) ** 2))), 1) * smooth(0, 0.06, z)
    const wave = (x: number, y: number, z: number, nx: number, ny: number) => {
      if (round) {
        const depth = Math.hypot(x, y) - hw
        const a = Math.atan2(y, x)
        const ripple = 0.55 + 0.3 * Math.sin(3 * a + 7 * z + 1.3) + 0.15 * Math.sin(7 * a - 13 * z + 0.4)
        return 0.6 * A * ripple * pinch(z) * smooth(0.002, 0.6 * t, depth)
      }
      const top = Math.abs(ny) >= Math.abs(nx)
      const c = top ? x : y
      const half = (top ? outW : outH) - rCorner
      if (Math.abs(c) >= half) return 0
      const depth = top ? Math.abs(y) - hh : Math.abs(x) - hw
      const face = top ? (ny > 0 ? 0 : 1) : nx > 0 ? 2 : 3
      const across = Math.cos((Math.PI / 2) * (c / half)) ** 0.7
      const ripple = 0.7 + 0.2 * Math.sin(c * 11 + z * 6.3 + face * 1.7) + 0.12 * Math.sin(c * 23 - z * 14 + face * 3.4)
      let h = A * across * ripple * pinch(z)
      if (face === 1) for (const [px, pz] of pins) h -= 1.3 * A * Math.exp(-((x - px) ** 2 + (z - pz) ** 2) / 0.05 ** 2)
      return h * smooth(0.002, 0.6 * t, depth)
    }
    const ins = new Builder()
    if (wrap) ins.disp = wave
    const insMats = { outer: Slot.InsSkin, inner: Slot.InsBore, end: Slot.InsCut }
    if (cut) {
      ins.shell(insIn, insOut, 0.002, zBlanket, insMats)
      ins.partial(insIn, insOut, kept, zBlanket, zIns, insMats)
    } else ins.shell(insIn, insOut, 0.002, zIns, insMats)
    parts.push({ key: 'insulation', geometry: ins.geometry(), layer: 'insulation' })
    callouts.push({
      title: wrap ? 'Fiberglass duct wrap' : poly ? 'Polyiso board' : 'Rigid fiberglass board',
      detail: wrap ? `${(t / IN).toFixed(2)}" installed (25% compressed)` : `${(t / IN).toFixed(2)}" board${rise ? ', tapered top' : ''}`,
      pos: [outW * 0.6, outH * 0.6, zIns], layer: 'insulation',
    })

    // ---- factory facing: FSK foil or white ASJ, a thin skin over the insulation
    // (cutaway: peeled off the top and near side first)
    const fz1 = cut ? zIns : zIns - 0.035
    const tapeEnd = cut ? zFacing : fz1
    const fIn = over(0.0002)
    const fOut = over(0.0007)
    const fac = new Builder()
    if (wrap) fac.disp = wave
    const facMats = { outer: asj ? Slot.Facing : Slot.DuctFacing, inner: Slot.FacingInner, end: Slot.FacingEdge }
    const tape = asj ? Slot.FacingTape : Slot.FoilTape
    if (cut) {
      fac.shell(fIn, fOut, 0.002, zFacing, facMats)
      fac.partial(fIn, fOut, kept, zFacing, fz1, facMats)
    } else fac.shell(fIn, fOut, 0.002, fz1, facMats)
    // ---- 3" tape: butt joints between 48" rolls or boards, then the long seams —
    // the wrap's stapling-flange seam on top, the board's four corners
    const tIn = fOut
    const tOut = over(0.0011)
    const tapeMats = { outer: tape, inner: tape, end: tape }
    for (let z = 48 * IN * 0.62; z < tapeEnd - 2 * IN; z += 48 * IN) fac.shell(tIn, tOut, z - 1.5 * IN, z + 1.5 * IN, tapeMats)
    if (round) {
      // the stapled lap along the top, 3" of tape over it
      const a0 = 2.15, da = (3 * IN) / outW
      const arc = (r: number): Outline => {
        const pts: [number, number][] = [], nrm: [number, number][] = []
        for (let i = 0; i <= 6; i++) {
          const a = a0 - da / 2 + (da * i) / 6
          pts.push([r * Math.cos(a), r * Math.sin(a)])
          nrm.push([Math.cos(a), Math.sin(a)])
        }
        return withArc(pts, nrm)
      }
      const a = arc(outW + 0.0007), b = arc(outW + 0.0011)
      fac.partial(a, b, a.p.map((_, i) => i), 0.004, tapeEnd - 0.004, tapeMats)
    } else if (wrap) {
      // the stapling-flange seam along the top, 3" of tape over it
      const x = outW - rCorner - 2.2 * IN
      const strip = (y: number): Outline => withArc(Array.from({ length: 7 }, (_, i) => [x + 1.5 * IN - (3 * IN * i) / 6, y] as [number, number]), Array.from({ length: 7 }, () => [0, 1] as [number, number]))
      const a = strip(outH + 0.0007), b = strip(outH + 0.0011)
      fac.partial(a, b, a.p.map((_, i) => i), 0.004, tapeEnd - 0.004, tapeMats)
    } else {
      for (const c of [0, 1, 2, 3] as const) {
        const a = cornerStrip(outW + 0.0007, outH + 0.0007, rCorner + 0.0007, c, 1.5 * IN)
        const b = cornerStrip(outW + 0.0011, outH + 0.0011, rCorner + 0.0011, c, 1.5 * IN)
        // the tapered top's high corner
        if (c === 0 && rise) for (const o of [a, b]) o.p.forEach((q) => { q[1] += rise })
        fac.partial(a, b, a.p.map((_, i) => i), 0.002, tapeEnd - 0.004, tapeMats)
      }
    }
    // ---- ducts 24" and wider: pins on the underside, 18" on center — square speed
    // clips on wrap; on board the washers are taped over (under a metal jacket, unseen)
    if (!alu) {
      for (const [x2, z] of pins) {
        if (z >= fz1 - 3 * IN) continue
        if (wrap) {
          const y = -outH - wave(x2, -outH, z, 0, -1)
          fac.box(x2, y - 0.0012, z, 1.5 * IN, 0.0012, 1.5 * IN, Slot.Hardware)
          fac.box(x2, y - 0.004, z, 0.12 * IN, 0.006, 0.12 * IN, Slot.Hardware)
        } else {
          fac.box(x2, -outH - 0.0012, z, 3 * IN, 0.0012, 3 * IN, tape)
          fac.box(x2, -outH - 0.0019, z, 1.5 * IN, 0.0012, 1.5 * IN, tape)
        }
      }
    }
    parts.push({ key: 'facing', geometry: fac.geometry(), layer: 'facing' })
    callouts.push({ title: asj ? 'ASJ facing' : 'FSK facing', detail: asj ? 'All-service jacket, seams taped' : 'Foil-scrim-kraft vapor retarder, seams taped', pos: [-outW * 0.4, outH + 0.001, zIns * 0.6], layer: 'facing' })

    // ---- outdoors: 0.016" stucco-embossed aluminum over the board, in 36" sheets
    // lapped 2" with screws along each lap (cutaway: taken off the top and near side first)
    if (alu) {
      const j0 = 0.0013
      const jt = 0.016 * IN
      const jIn = over(j0)
      const jOut = over(j0 + jt)
      const jMats = { outer: Slot.JacketOuter, inner: Slot.JacketInner, end: Slot.JacketEdge }
      const jz1 = cut ? zIns : zIns - 0.012
      const jac = new Builder()
      if (cut) {
        jac.shell(jIn, jOut, 0.002, zJacket, jMats)
        jac.partial(jIn, jOut, kept, zJacket, jz1, jMats)
      } else jac.shell(jIn, jOut, 0.002, jz1, jMats)
      // 36" sheets lapped 3" (UFGS 23 07 00): screwed on rectangular duct; on round duct
      // banded at each lap and no more than 12" apart
      const lapOut = over(j0 + 2 * jt + 0.0011)
      const bandIn = over(j0 + jt + 0.0001)
      const bandOut = over(j0 + jt + 0.0009)
      const lapEnd = cut ? zJacket : jz1
      const laps: number[] = []
      for (let z = 36 * IN * 0.55; z < lapEnd - 2 * IN; z += 36 * IN) {
        laps.push(z)
        jac.shell(jOut, lapOut, z - 1.5 * IN, z + 1.5 * IN, jMats)
        if (!round) screwsAround(jac, lapOut, z + 1 * IN, 6 * IN, rCorner + 1.5 * IN)
      }
      if (round) {
        const bandMats = { outer: Slot.Band, inner: Slot.Band, end: Slot.Band }
        const lapBand = over(j0 + 2 * jt + 0.0012)
        const lapBandOut = over(j0 + 2 * jt + 0.002)
        for (const z of laps) jac.shell(lapBand, lapBandOut, z - 0.25 * IN, z + 0.25 * IN, bandMats)
        const step = 12 * IN
        for (let z = 6 * IN; z < lapEnd - 1 * IN; z += step) {
          if (laps.some((l) => Math.abs(l - z) < 3 * IN)) continue
          jac.shell(bandIn, bandOut, z - 0.25 * IN, z + 0.25 * IN, bandMats)
        }
      }
      parts.push({ key: 'jacket', geometry: jac.geometry(), layer: 'jacket' })
      callouts.push({ title: 'Aluminum jacket', detail: round ? '0.016", 3" laps, banded' : '0.016" stucco embossed, 3" laps, screwed', pos: [-outW * 0.3, outH + 0.003, zJacket * 0.5], layer: 'jacket' })
    }
  }
  // the exposed surface: facing and tape, or the jacket and its laps
  const skin = d.jacket === 'alu' && insulated ? 0.0025 : 0.001
  const minHalf = Math.min(outW, outH)
  const zones: SimZone[] = [
    round
      ? { key: 'run', kind: 'run', z0: 0.012, z1: zIns - 0.012, radius: outW + skin, rBare: hw, bareZ: [0, len], ...(cut && cutWedge ? { wedge: cutWedge, zWedge: zBlanket } : {}) }
      : { key: 'run', kind: 'run', z0: 0.012, z1: zIns - 0.012, radius: minHalf, rBare: Math.min(hw, hh), bareZ: [0, len], box: [outW + skin, outH + skin], boxBare: [hw, hh], ...(cut && cutWedge ? { wedge: cutWedge, zWedge: zBlanket } : {}) },
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
