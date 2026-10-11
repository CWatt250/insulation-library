import * as THREE from 'three'

/**
 * Sweeps a closed 2D profile (r, z) around the z axis over [theta0, theta1].
 *
 * This is the one geometry primitive behind every round part: pipe, insulation
 * shells, jacket sheets, laps and bands. A partial sweep (span < 2π) is closed
 * with flat "cut" faces at both angles, which is how cutaways get real section
 * faces instead of hollow shells.
 *
 * UVs are in metres so textures can be mapped at true physical scale:
 *   'arc'    → u = arc length along θ at that radius, v = z  (cylinders, cones)
 *   'planar' → u = x, v = y                               (faces ⟂ to the axis)
 *   'polar'  → u = arc length, v = r  (faces ⟂ to the axis; concentric layers
 *              of wound fibrous insulation follow lines of constant v)
 *   cut faces → u = r, v = z  (or u = z, v = r with capUv: 'zr')
 */

export type UVMode = 'arc' | 'planar' | 'polar'

export interface ProfileEdge {
  /** Material index for this swept surface. */
  mat: number
  uv?: UVMode
  /** Edges sharing the same smooth id get averaged normals at shared vertices. */
  smooth?: number
}

export interface Profile {
  /** Closed polygon of [r, z] points, in either winding. */
  pts: [number, number][]
  /** edges[i] describes the segment pts[i] → pts[i+1]. */
  edges: ProfileEdge[]
}

export interface SweepOpts {
  theta0?: number
  theta1?: number
  /** Segments for a full revolution. */
  segments?: number
  /** Material index for the θ cut faces. */
  capMat?: number
  /** Radial offset added as a function of θ (used for lap ramps). */
  rOffset?: (theta: number) => number
  /** Per-piece colour multiplier (vertex colour), e.g. batch-to-batch shade variation. */
  tint?: [number, number, number]
  /** UV layout on θ cut faces; 'zr' keeps radial layering along v. */
  capUv?: 'rz' | 'zr'
  /**
   * Small radial displacement δ(θ, z) in metres (sheet waviness, pinching under
   * bands). Shading normals are tilted by its gradient so reflections wobble the
   * way they do on real jacketing.
   */
  disp?: (theta: number, z: number) => number
  /** Shifts UVs (metres) so repeated pieces don't share identical texture. */
  uvOffset?: [number, number]
  /** Remaps z after placement, e.g. to shear segment ends onto miter planes. */
  zMap?: (r: number, z: number, theta: number) => number
}

const TAU = Math.PI * 2

export function sweep(profile: Profile, opts: SweepOpts = {}): THREE.BufferGeometry {
  const theta0 = opts.theta0 ?? 0
  const theta1 = opts.theta1 ?? TAU
  const span = theta1 - theta0
  const full = Math.abs(span - TAU) < 1e-6
  const steps = Math.max(3, Math.ceil(((opts.segments ?? 96) * Math.abs(span)) / TAU))
  const rOff = opts.rOffset ?? (() => 0)
  const zMap = opts.zMap
  const disp = opts.disp
  const uvo = opts.uvOffset ?? [0, 0]

  const { pts, edges } = profile
  const n = pts.length

  // Orient the profile so per-edge normals point outward.
  let area = 0
  for (let i = 0; i < n; i++) {
    const [r0, z0] = pts[i]
    const [r1, z1] = pts[(i + 1) % n]
    area += r0 * z1 - r1 * z0
  }
  const ccw = area > 0 // counter-clockwise in (r right, z up)

  const edgeN: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const [r0, z0] = pts[i]
    const [r1, z1] = pts[(i + 1) % n]
    const dr = r1 - r0
    const dz = z1 - z0
    const l = Math.hypot(dr, dz) || 1
    // outward normal: right-hand perpendicular for CCW polygons
    edgeN.push(ccw ? [dz / l, -dr / l] : [-dz / l, dr / l])
  }
  // vertex normals per edge end, averaging across smooth junctions
  const nStart: [number, number][] = []
  const nEnd: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const prev = (i - 1 + n) % n
    const next = (i + 1) % n
    const e = edges[i]
    const avg = (a: [number, number], b: [number, number]): [number, number] => {
      const x = a[0] + b[0]
      const y = a[1] + b[1]
      const l = Math.hypot(x, y) || 1
      return [x / l, y / l]
    }
    nStart.push(e.smooth !== undefined && edges[prev].smooth === e.smooth ? avg(edgeN[prev], edgeN[i]) : edgeN[i])
    nEnd.push(e.smooth !== undefined && edges[next].smooth === e.smooth ? avg(edgeN[i], edgeN[next]) : edgeN[i])
  }

  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const groups: { start: number; count: number; mat: number }[] = []
  let vcount = 0

  const pushTri = (
    a: number[], b: number[], c: number[],
    na: number[], nb: number[], nc: number[],
    ua: number[], ub: number[], uc: number[],
  ) => {
    // Fix winding so the geometric face normal agrees with the shading normal.
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    const cx = ab[1] * ac[2] - ab[2] * ac[1]
    const cy = ab[2] * ac[0] - ab[0] * ac[2]
    const cz = ab[0] * ac[1] - ab[1] * ac[0]
    const dot = cx * (na[0] + nb[0] + nc[0]) + cy * (na[1] + nb[1] + nc[1]) + cz * (na[2] + nb[2] + nc[2])
    if (dot < 0) {
      ;[b, c] = [c, b]
      ;[nb, nc] = [nc, nb]
      ;[ub, uc] = [uc, ub]
    }
    pos.push(...a, ...b, ...c)
    nor.push(...na, ...nb, ...nc)
    uv.push(...ua, ...ub, ...uc)
    vcount += 3
  }

  const P = (r: number, z: number, t: number) => {
    const rr = r + rOff(t) + (disp ? disp(t, z) : 0)
    return [rr * Math.cos(t), rr * Math.sin(t), zMap ? zMap(rr, z, t) : z]
  }
  const N3base = (nn: [number, number], t: number) => [nn[0] * Math.cos(t), nn[0] * Math.sin(t), nn[1]]
  // With displacement, tilt radial-facing normals by the displacement gradient.
  const N3 = (nn: [number, number], t: number, r = 1, z = 0) => {
    const n = N3base(nn, t)
    if (!disp || Math.abs(nn[0]) < 0.3) return n
    const e = 0.002
    const dz = (disp(t, z + e) - disp(t, z - e)) / (2 * e)
    const dt = (disp(t + e / r, z) - disp(t - e / r, z)) / (2 * e)
    const s = nn[0] // +1 outward faces, −1 inner faces
    const tx = -Math.sin(t), ty = Math.cos(t)
    const x = n[0] - s * dt * tx, y = n[1] - s * dt * ty, zz = n[2] - s * dz
    const l = Math.hypot(x, y, zz) || 1
    return [x / l, y / l, zz / l]
  }
  const UV = (mode: UVMode, r: number, z: number, t: number, p: number[]) =>
    mode === 'planar' ? [p[0] + uvo[0], p[1] + uvo[1]] : mode === 'polar' ? [t * 0.08 + uvo[0], r + uvo[1]] : [(r + rOff(t)) * t + uvo[0], z + uvo[1]]

  // Swept surfaces, grouped by material so each edge's triangles stay contiguous.
  const byMat = new Map<number, number[]>()
  edges.forEach((e, i) => {
    const list = byMat.get(e.mat) ?? []
    list.push(i)
    byMat.set(e.mat, list)
  })

  for (const [mat, list] of byMat) {
    const start = vcount
    for (const i of list) {
      const e = edges[i]
      const mode = e.uv ?? 'arc'
      const [r0, z0] = pts[i]
      const [r1, z1] = pts[(i + 1) % n]
      for (let s = 0; s < steps; s++) {
        const ta = theta0 + (span * s) / steps
        const tb = theta0 + (span * (s + 1)) / steps
        const a0 = P(r0, z0, ta), a1 = P(r1, z1, ta)
        const b0 = P(r0, z0, tb), b1 = P(r1, z1, tb)
        const na0 = N3(nStart[i], ta, r0, z0), na1 = N3(nEnd[i], ta, r1, z1)
        const nb0 = N3(nStart[i], tb, r0, z0), nb1 = N3(nEnd[i], tb, r1, z1)
        const ua0 = UV(mode, r0, z0, ta, a0), ua1 = UV(mode, r1, z1, ta, a1)
        const ub0 = UV(mode, r0, z0, tb, b0), ub1 = UV(mode, r1, z1, tb, b1)
        pushTri(a0, a1, b1, na0, na1, nb1, ua0, ua1, ub1)
        pushTri(a0, b1, b0, na0, nb1, nb0, ua0, ub1, ub0)
      }
    }
    groups.push({ start, count: vcount - start, mat })
  }

  // θ cut faces for partial sweeps.
  if (!full) {
    const contour = pts.map(([r, z]) => new THREE.Vector2(r, z))
    const tris = THREE.ShapeUtils.triangulateShape(contour, [])
    const start = vcount
    for (const t of [theta0, theta1]) {
      const sign = t === theta0 ? -1 : 1
      const nn = [-Math.sin(t) * sign, Math.cos(t) * sign, 0]
      for (const [i, j, k] of tris) {
        const a = P(pts[i][0], pts[i][1], t)
        const b = P(pts[j][0], pts[j][1], t)
        const c = P(pts[k][0], pts[k][1], t)
        const cuv = (q: [number, number]) => (opts.capUv === 'zr' ? [q[1], q[0]] : [q[0], q[1]])
        pushTri(a, b, c, nn, nn, nn, cuv(pts[i]), cuv(pts[j]), cuv(pts[k]))
      }
    }
    groups.push({ start, count: vcount - start, mat: opts.capMat ?? edges[0].mat })
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  const tint = opts.tint ?? [1, 1, 1]
  const col = new Float32Array(vcount * 3)
  for (let i = 0; i < vcount; i++) col.set(tint, i * 3)
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  for (const gr of groups) g.addGroup(gr.start, gr.count, gr.mat)
  g.computeBoundingSphere()
  return g
}

// ------------------------------------------------------------------ profiles

/**
 * Rectangular annulus [rIn, rOut] × [z0, z1] with optional chamfers on the
 * outer edges, which catch light the way real cut edges do.
 * Materials: outer, bore, ends (planar UV), chamfers use the end material.
 */
export function annulusProfile(
  rIn: number, rOut: number, z0: number, z1: number,
  m: { outer: number; inner: number; end: number },
  bevel = 0,
  bevelEnds: [boolean, boolean] = [true, true],
  endUv: UVMode = 'planar',
): Profile {
  const b0 = bevelEnds[0] ? bevel : 0
  const b1 = bevelEnds[1] ? bevel : 0
  const pts: [number, number][] = []
  const edges: ProfileEdge[] = []
  // walk CCW: inner bottom → outer bottom → outer top → inner top
  pts.push([rIn, z0]); edges.push({ mat: m.end, uv: endUv })
  if (b0 > 0) {
    pts.push([rOut - b0, z0]); edges.push({ mat: m.end, uv: 'arc' })
  }
  pts.push([rOut, z0 + b0]); edges.push({ mat: m.outer, uv: 'arc' })
  pts.push([rOut, z1 - b1])
  if (b1 > 0) {
    edges.push({ mat: m.end, uv: 'arc' })
    pts.push([rOut - b1, z1])
  }
  edges.push({ mat: m.end, uv: endUv })
  pts.push([rIn, z1]); edges.push({ mat: m.inner, uv: 'arc' })
  return { pts, edges }
}

/**
 * Strap band: flat inner face on the jacket, fully rounded edges (radius = t)
 * so highlights roll off the band edges like real strapping.
 */
export function bandProfile(r: number, t: number, zc: number, w: number, mat: number): Profile {
  const z0 = zc - w / 2
  const z1 = zc + w / 2
  const k = 6
  const pts: [number, number][] = []
  const edges: ProfileEdge[] = []
  for (let i = 0; i <= k; i++) {
    const a = -Math.PI / 2 + (Math.PI / 2) * (i / k)
    pts.push([r + t * Math.cos(a), z0 + t + t * Math.sin(a)])
    edges.push({ mat, smooth: 1 })
  }
  for (let i = 0; i <= k; i++) {
    const a = (Math.PI / 2) * (i / k)
    pts.push([r + t * Math.cos(a), z1 - t + t * Math.sin(a)])
    edges.push({ mat, smooth: 1 })
  }
  edges[edges.length - 1] = { mat } // inner face against the jacket
  return { pts, edges }
}
