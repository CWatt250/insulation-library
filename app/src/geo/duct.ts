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
  /** Duct wrap (compressed blanket) or rigid board (square-cut, pinned). */
  insulation: 'wrap' | 'board'
  /** Factory facing: FSK foil, or white ASJ (board). */
  facing: 'fsk' | 'asj'
  /** Outdoors: an aluminum jacket over the facing. */
  jacket: 'none' | 'alu'
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
    for (let k = 0; k < last; k++) {
      const A = O.p[k], B = O.p[k + 1], a = I.p[k], b = I.p[k + 1]
      this.quad([A[0], A[1], z0], [B[0], B[1], z0], [B[0], B[1], z1], [A[0], A[1], z1], [(O.n[k][0] + O.n[k + 1][0]) / 2, (O.n[k][1] + O.n[k + 1][1]) / 2, 0], [[O.s[k], z0], [O.s[k + 1], z0], [O.s[k + 1], z1], [O.s[k], z1]], m.outer)
      this.quad([a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1], [-(I.n[k][0] + I.n[k + 1][0]) / 2, -(I.n[k][1] + I.n[k + 1][1]) / 2, 0], [[I.s[k], z0], [I.s[k + 1], z0], [I.s[k + 1], z1], [I.s[k], z1]], m.inner)
      for (const [z, dir] of [[z0, -1], [z1, 1]] as const) {
        this.quad([a[0], a[1], z], [b[0], b[1], z], [B[0], B[1], z], [A[0], A[1], z], [0, 0, dir], [[a[0], a[1]], [b[0], b[1]], [B[0], B[1]], [A[0], A[1]]], m.end)
      }
    }
    // the two long cut faces: each faces along the path, away from what's kept
    for (const [k, sgn] of [[0, -1], [last, 1]] as const) {
      const A = O.p[k], a = I.p[k]
      const nn = O.n[k]
      const tang: V3 = [-nn[1] * sgn, nn[0] * sgn, 0]
      const depth = Math.hypot(A[0] - a[0], A[1] - a[1])
      this.quad([a[0], a[1], z0], [A[0], A[1], z0], [A[0], A[1], z1], [a[0], a[1], z1], tang, [[0, z0], [depth, z0], [depth, z1], [0, z1]], m.end)
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
    const asj = d.facing === 'asj'
    const alu = d.jacket === 'alu'
    // ---- insulation: wrap is compressed over the corners (radius ≈ its thickness);
    // board is cut square and butted at the corners
    const insIn = round ? circle(hw + 0.0004) : roundedRect(hw + 0.0004, hh + 0.0004, 0.0015, nArc)
    const rCorner = wrap ? t * 0.9 : 0.003
    /** The insulation's outline grown by `o` (facing, tape and jacket sit on it). */
    const over = (o: number) => (round ? circle(outW + o) : roundedRect(outW + o, outH + o, rCorner + o, nArc))
    const insOut = over(0)
    // what the cutaway keeps: the far side and underside (rect: corner 2 → corner 0; round: 180° → 90°)
    const nC = nArc + 1
    const kept = round
      ? [...Array.from({ length: 48 }, (_, i) => 48 + i), ...Array.from({ length: 25 }, (_, i) => i)]
      : [...Array.from({ length: 2 * nC }, (_, i) => 2 * nC + i), ...Array.from({ length: nC }, (_, i) => i)]
    cutWedge = round ? [Math.PI / 2, Math.PI] : [Math.atan2(outH, outW - rCorner), Math.PI + Math.atan2(outH - rCorner, outW)]
    const ins = new Builder()
    const insMats = { outer: Slot.InsSkin, inner: Slot.InsBore, end: Slot.InsCut }
    if (cut) {
      ins.shell(insIn, insOut, 0.002, zBlanket, insMats)
      ins.partial(insIn, insOut, kept, zBlanket, zIns, insMats)
    } else ins.shell(insIn, insOut, 0.002, zIns, insMats)
    parts.push({ key: 'insulation', geometry: ins.geometry(), layer: 'insulation' })
    callouts.push({
      title: wrap ? 'Fiberglass duct wrap' : 'Rigid fiberglass board',
      detail: wrap ? `${(t / IN).toFixed(2)}" installed (25% compressed)` : `${(t / IN).toFixed(2)}" board`,
      pos: [outW * 0.6, outH * 0.6, zIns], layer: 'insulation',
    })

    // ---- factory facing: FSK foil or white ASJ, a thin skin over the insulation
    // (cutaway: peeled off the top and near side first)
    const fz1 = cut ? zIns : zIns - 0.035
    const tapeEnd = cut ? zFacing : fz1
    const fIn = over(0.0002)
    const fOut = over(0.0007)
    const fac = new Builder()
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
      fac.box(-outW * 0.55, outH * 0.84, tapeEnd / 2, 3 * IN, 0.0012, tapeEnd - 0.01, tape)
    } else if (wrap) {
      const x = outW - rCorner - 2.2 * IN
      fac.box(x, outH + 0.0012, (0.002 + tapeEnd) / 2, 3 * IN, 0.0012, tapeEnd - 0.004, tape)
    } else {
      for (const c of [0, 1, 2, 3] as const) {
        const a = cornerStrip(outW + 0.0007, outH + 0.0007, rCorner + 0.0007, c, 1.5 * IN)
        const b = cornerStrip(outW + 0.0011, outH + 0.0011, rCorner + 0.0011, c, 1.5 * IN)
        fac.partial(a, b, a.p.map((_, i) => i), 0.002, tapeEnd - 0.004, tapeMats)
      }
    }
    // ---- ducts 24" and wider: pins on the underside, 18" on center — square speed
    // clips on wrap; on board the washers are taped over (under a metal jacket, unseen)
    if (!round && !alu && d.w >= 24 * IN - 1e-6) {
      const across = Math.max(1, Math.round(d.w / (18 * IN)))
      for (let z = 9 * IN; z < fz1 - 3 * IN; z += 18 * IN) {
        for (let k = 0; k < across; k++) {
          const x2 = -d.w / 2 + ((k + 0.5) / across) * d.w
          if (wrap) {
            fac.box(x2, -outH - 0.0012, z, 1.5 * IN, 0.0012, 1.5 * IN, Slot.Hardware)
            fac.box(x2, -outH - 0.004, z, 0.12 * IN, 0.006, 0.12 * IN, Slot.Hardware)
          } else {
            fac.box(x2, -outH - 0.0012, z, 3 * IN, 0.0012, 3 * IN, tape)
            fac.box(x2, -outH - 0.0019, z, 1.5 * IN, 0.0012, 1.5 * IN, tape)
          }
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
