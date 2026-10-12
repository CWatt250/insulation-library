import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Environment } from '@react-three/drei'
import { sweep, annulusProfile } from '../geo/sweep'
import { pbr } from '../materials/library'
import { plantHdri } from './hdri'

/**
 * Plant stage: an outdoor process area around the pipe, so every metal jacket
 * has a real yard, sky and sun to reflect. Lit by a CC0 Poly Haven HDRI
 * (abandoned_tank_farm_03, Sergej Majboroda; CREDITS.md) with a shadow-casting
 * sun placed where the HDRI's sun is.
 *
 * Everything else is built here, procedurally, at real scale: a steel pipe rack
 * with jacketed and painted lines, an insulated storage tank, a painted tank, an
 * insulated horizontal vessel on saddles, a scissor lift under the rack and a
 * boom lift at the vessel (generic, unbranded), a caution-tape cordon with
 * delineator posts and cones, and a pallet of insulation cartons with pipe
 * sections and a coil of jacketing.
 *
 * World frame: the main pipe axis is world x at y = 0, z = 0; the floor is at
 * `floorY`. The default cameras look from +x +z, so the yard sits at −z.
 */

/** Direction to the HDRI's sun (three.js equirect, unrotated): 39° up, measured from the image. */
const SUN = new THREE.Vector3(0.624, 0.634, 0.456).normalize()


export function PlantLights({ mobile, photo }: { mobile: boolean; photo: boolean }) {
  return (
    <>
      <Environment files={`${import.meta.env.BASE_URL}${plantHdri(mobile)}`} background backgroundBlurriness={mobile ? 0.04 : 0.015} environmentIntensity={0.85} />
      {/* raster only: the path tracer sees the HDRI's own sun */}
      {!photo && (
        <directionalLight
          castShadow
          position={SUN.clone().multiplyScalar(26).toArray()}
          intensity={3.2}
          color="#fff1dc"
          shadow-mapSize={mobile ? [2048, 2048] : [4096, 4096]}
          shadow-camera-left={-7}
          shadow-camera-right={7}
          shadow-camera-top={7}
          shadow-camera-bottom={-7}
          shadow-camera-near={10}
          shadow-camera-far={45}
          shadow-radius={5}
          shadow-blurSamples={16}
          shadow-bias={-0.0004}
          shadow-normalBias={0.02}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------- helpers

type Part = { g: THREE.BufferGeometry; m: keyof Mats; shadow?: boolean }

const withColor = (g: THREE.BufferGeometry, c = 1) => {
  const n = g.getAttribute('position').count
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(c), 3))
  return g
}

/** A box from its centre and size, optionally turned about y. */
const box = (w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0) => {
  const g = new THREE.BoxGeometry(w, h, d)
  if (rotY) g.rotateY(rotY)
  return withColor(g.translate(x, y, z))
}

/**
 * BoxGeometry UVs run 0–1 on every face; rescale them to metres so a pbr()
 * texture lands at true scale (faces: ±x, ±y, ±z, four vertices each).
 */
function metricUV(g: THREE.BufferGeometry, w: number, h: number, d: number) {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute
  const size: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]
  for (let i = 0; i < uv.count; i++) {
    const [su, sv] = size[Math.floor(i / 4)]
    uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv)
  }
  return g
}

/** A round bar between two points. */
function bar(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 10) {
  const len = a.distanceTo(b)
  const g = new THREE.CylinderGeometry(r, r, len, seg)
  g.translate(0, len / 2, 0)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()))
  return withColor(g.translate(a.x, a.y, a.z))
}

/** A square tube between two points (scissor arms, boom). */
function beam(a: THREE.Vector3, b: THREE.Vector3, w: number, h: number) {
  const len = a.distanceTo(b)
  const g = new THREE.BoxGeometry(w, len, h)
  g.translate(0, len / 2, 0)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()))
  return withColor(g.translate(a.x, a.y, a.z))
}

/** Wide-flange steel member along an axis: two flanges and a web. */
function wideFlange(len: number, d: number, bf: number, axis: 'x' | 'y' | 'z', x: number, y: number, z: number) {
  const tf = 0.012
  const tw = 0.008
  const parts = [
    new THREE.BoxGeometry(bf, tf, len).translate(0, d / 2 - tf / 2, 0),
    new THREE.BoxGeometry(bf, tf, len).translate(0, -d / 2 + tf / 2, 0),
    new THREE.BoxGeometry(tw, d - 2 * tf, len),
  ]
  return parts.map((g) => {
    if (axis === 'x') g.rotateY(Math.PI / 2)
    if (axis === 'y') g.rotateX(Math.PI / 2).rotateY(Math.PI / 2)
    return withColor(g.translate(x, y, z))
  })
}

/** A seeded 0–1 hash, so the yard looks the same on every load. */
const rnd = (i: number, s: number) => {
  const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453
  return v - Math.floor(v)
}

/** Jacketed cylinder (tank shell, vessel shell, rack line): panels with their own shade, plus bands. */
function jacketedShell(r: number, h: number, courseH: number, panels: number, seed: number) {
  const out: THREE.BufferGeometry[] = []
  const bands: THREE.BufferGeometry[] = []
  const courses = Math.max(1, Math.round(h / courseH))
  const ch = h / courses
  for (let c = 0; c < courses; c++) {
    for (let p = 0; p < panels; p++) {
      const g = new THREE.CylinderGeometry(r, r, ch - 0.004, Math.max(4, Math.round(96 / panels)), 1, true, (p / panels) * Math.PI * 2, (Math.PI * 2) / panels - 0.002)
      g.translate(0, c * ch + ch / 2, 0)
      out.push(withColor(g, 0.93 + 0.12 * rnd(c * 31 + p, seed)))
    }
    // a band on each circumferential lap (and one mid-course on tall courses)
    for (const f of c === 0 ? [0.5] : [0, 0.5]) {
      const b = new THREE.CylinderGeometry(r + 0.004, r + 0.004, 0.019, 96, 1, true)
      bands.push(withColor(b.translate(0, c * ch + f * ch, 0)))
    }
  }
  return { out, bands }
}

// ------------------------------------------------------------------ props

type Mats = ReturnType<typeof makeMats>

function makeMats() {
  const tapeTex = cautionTexture()
  return {
    steel: new THREE.MeshStandardMaterial({ color: '#8b9096', roughness: 0.62, metalness: 0.55, vertexColors: true }),
    galv: new THREE.MeshStandardMaterial({ color: '#b9bfc4', roughness: 0.45, metalness: 0.85, vertexColors: true }),
    jacket: new THREE.MeshStandardMaterial({ color: '#dfe2e5', roughness: 0.3, metalness: 1, vertexColors: true }),
    band: new THREE.MeshStandardMaterial({ color: '#eceff2', roughness: 0.18, metalness: 1, vertexColors: true }),
    paintWhite: new THREE.MeshStandardMaterial({ color: '#e7e5df', roughness: 0.55, metalness: 0.05, vertexColors: true }),
    paintGrey: new THREE.MeshStandardMaterial({ color: '#7d8287', roughness: 0.5, metalness: 0.1, vertexColors: true }),
    paintYellow: new THREE.MeshStandardMaterial({ color: '#e3ad17', roughness: 0.45, metalness: 0.1, vertexColors: true }),
    paintGreen: new THREE.MeshStandardMaterial({ color: '#4f7a5a', roughness: 0.5, metalness: 0.1, vertexColors: true }),
    liftBody: new THREE.MeshStandardMaterial({ color: '#e9a91c', roughness: 0.42, metalness: 0.15, vertexColors: true }),
    boomBody: new THREE.MeshStandardMaterial({ color: '#e26a1b', roughness: 0.42, metalness: 0.15, vertexColors: true }),
    darkSteel: new THREE.MeshStandardMaterial({ color: '#2f3236', roughness: 0.55, metalness: 0.4, vertexColors: true }),
    rubber: new THREE.MeshStandardMaterial({ color: '#1b1b1d', roughness: 0.9, metalness: 0, vertexColors: true }),
    concrete: new THREE.MeshStandardMaterial({ color: '#b6b1a7', roughness: 0.92, metalness: 0, vertexColors: true }),
    orange: new THREE.MeshStandardMaterial({ color: '#f2581c', roughness: 0.5, metalness: 0, vertexColors: true }),
    white: new THREE.MeshStandardMaterial({ color: '#f1f1ee', roughness: 0.35, metalness: 0, vertexColors: true }),
    wood: new THREE.MeshStandardMaterial({ color: '#a27b4f', roughness: 0.85, metalness: 0, vertexColors: true }),
    carton: new THREE.MeshStandardMaterial({ color: '#b48d5e', roughness: 0.9, metalness: 0, vertexColors: true }),
    asj: pbr('asj', { normalStrength: 0.6 }),
    tape: new THREE.MeshStandardMaterial({ map: tapeTex, roughness: 0.45, metalness: 0, side: THREE.DoubleSide, vertexColors: true }),
  }
}

/** Barricade tape: black CAUTION on yellow, repeating. */
function cautionTexture() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 48
  const x = c.getContext('2d')!
  x.fillStyle = '#ffd21a'
  x.fillRect(0, 0, c.width, c.height)
  x.fillStyle = '#111111'
  x.font = 'bold 34px Arial, Helvetica, sans-serif'
  x.textBaseline = 'middle'
  x.fillText('CAUTION', 22, 25)
  x.fillText('CAUTION', 278, 25)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = THREE.RepeatWrapping
  t.anisotropy = 4
  return t
}

/** Steel pipe rack along x at z = zc: bents every 6 m, two levels, lines on the lower level. */
function pipeRack(f: number, zc: number): Part[] {
  const parts: Part[] = []
  const half = 1.5
  const lv1 = f + 3.2
  const lv2 = f + 4.6
  const xs = [-13, -7, -1, 5, 11]
  for (const x of xs) {
    for (const s of [-1, 1]) {
      wideFlange(lv2 - f + 0.1, 0.2, 0.2, 'y', x, f + (lv2 - f) / 2, zc + s * half).forEach((g) => parts.push({ g, m: 'steel', shadow: true }))
      parts.push({ g: box(0.45, 0.25, 0.45, x, f + 0.12, zc + s * half), m: 'concrete' })
    }
    for (const y of [lv1, lv2]) wideFlange(2 * half + 0.2, 0.25, 0.15, 'z', x, y - 0.125, zc).forEach((g) => parts.push({ g, m: 'steel', shadow: true }))
  }
  // longitudinal struts tying the bents together
  for (const s of [-1, 1]) wideFlange(xs[xs.length - 1] - xs[0], 0.15, 0.1, 'x', (xs[0] + xs[xs.length - 1]) / 2, lv2 - 0.075, zc + s * half).forEach((g) => parts.push({ g, m: 'steel' }))
  // lines on the lower level: jacketed (with bands), painted, and a small yellow gas line
  const lines: [number, number, keyof Mats][] = [[-1.1, 0.2, 'jacket'], [-0.55, 0.15, 'jacket'], [-0.05, 0.085, 'paintGrey'], [0.35, 0.11, 'jacket'], [0.75, 0.045, 'paintYellow'], [1.1, 0.07, 'paintGreen']]
  const x0 = xs[0] - 3
  const x1 = xs[xs.length - 1] + 3
  lines.forEach(([dz, r, m], i) => {
    const g = new THREE.CylinderGeometry(r, r, x1 - x0, 40, 1, true)
    g.rotateZ(Math.PI / 2).translate((x0 + x1) / 2, lv1 + r, zc + dz)
    parts.push({ g: withColor(g, 0.95 + 0.08 * rnd(i, 4)), m, shadow: true })
    if (m === 'jacket') {
      for (let x = x0 + 0.3; x < x1; x += 0.3048) {
        const b = new THREE.CylinderGeometry(r + 0.002, r + 0.002, 0.0127, 32, 1, true)
        parts.push({ g: withColor(b.rotateZ(Math.PI / 2).translate(x, lv1 + r, zc + dz)), m: 'band' })
      }
    }
  })
  // two lines on the upper level
  for (const [dz, r, m] of [[-0.6, 0.13, 'jacket'], [0.5, 0.09, 'paintGrey']] as [number, number, keyof Mats][]) {
    const g = new THREE.CylinderGeometry(r, r, x1 - x0, 40, 1, true)
    g.rotateZ(Math.PI / 2).translate((x0 + x1) / 2, lv2 + r, zc + dz)
    parts.push({ g: withColor(g), m })
  }
  return parts
}

/** Vertical storage tank: insulated (jacketed, banded) or painted, cone roof, caged ladder. */
function storageTank(f: number, x: number, z: number, D: number, H: number, insulated: boolean, seed: number, ladderAt: number): Part[] {
  const parts: Part[] = []
  const r = D / 2
  if (insulated) {
    const { out, bands } = jacketedShell(r, H, 1.2, 24, seed)
    out.forEach((g) => parts.push({ g: g.translate(x, f, z), m: 'jacket' }))
    bands.forEach((g) => parts.push({ g: g.translate(x, f, z), m: 'band' }))
  } else {
    parts.push({ g: withColor(new THREE.CylinderGeometry(r, r, H, 96, 1, true).translate(x, f + H / 2, z)), m: 'paintWhite' })
  }
  // cone roof (1:6) with a rim angle
  const roofH = r / 6
  parts.push({ g: withColor(new THREE.ConeGeometry(r + 0.05, roofH, 96).translate(x, f + H + roofH / 2, z)), m: insulated ? 'jacket' : 'paintWhite' })
  parts.push({ g: withColor(new THREE.TorusGeometry(r + 0.03, 0.03, 8, 96).rotateX(Math.PI / 2).translate(x, f + H, z)), m: insulated ? 'band' : 'paintWhite' })
  // roof handrail
  const railR = r - 0.25
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    const p = new THREE.Vector3(x + railR * Math.cos(a), f + H + roofH * 0.1, z + railR * Math.sin(a))
    parts.push({ g: bar(p, p.clone().setY(p.y + 1.07), 0.02), m: 'paintYellow' })
  }
  parts.push({ g: withColor(new THREE.TorusGeometry(railR, 0.022, 6, 96).rotateX(Math.PI / 2).translate(x, f + H + roofH * 0.1 + 1.07, z)), m: 'paintYellow' })
  // caged ladder up the side facing the yard
  const lx = x + (r + 0.35) * Math.cos(ladderAt)
  const lz = z + (r + 0.35) * Math.sin(ladderAt)
  const t = new THREE.Vector3(-Math.sin(ladderAt), 0, Math.cos(ladderAt))
  for (const s of [-0.23, 0.23]) {
    const a = new THREE.Vector3(lx, f, lz).addScaledVector(t, s)
    parts.push({ g: bar(a, a.clone().setY(f + H + 1.1), 0.025), m: 'paintYellow' })
  }
  for (let y = f + 0.3; y < f + H; y += 0.3) {
    const a = new THREE.Vector3(lx, y, lz).addScaledVector(t, -0.23)
    parts.push({ g: bar(a, a.clone().addScaledVector(t, 0.46), 0.012, 6), m: 'paintYellow' })
  }
  const n = new THREE.Vector3(Math.cos(ladderAt), 0, Math.sin(ladderAt))
  for (let y = f + 2.3; y < f + H + 1; y += 0.9) {
    const hoop = new THREE.TorusGeometry(0.36, 0.018, 6, 24, Math.PI)
    hoop.rotateX(Math.PI / 2).rotateY(-ladderAt + Math.PI / 2)
    const c = new THREE.Vector3(lx, y, lz).addScaledVector(n, 0.02)
    parts.push({ g: withColor(hoop.translate(c.x, c.y, c.z)), m: 'paintYellow' })
  }
  // ring-wall foundation
  parts.push({ g: withColor(new THREE.CylinderGeometry(r + 0.3, r + 0.35, 0.3, 64).translate(x, f + 0.15, z)), m: 'concrete' })
  return parts
}

/** Horizontal vessel along x on two concrete saddles: jacketed shell and 2:1 heads, nozzles on top. */
function horizontalVessel(f: number, x: number, z: number, D: number, L: number, seed: number): Part[] {
  const parts: Part[] = []
  const r = D / 2
  const yc = f + 1.0 + r
  const toX = (g: THREE.BufferGeometry) => g.rotateZ(Math.PI / 2).translate(x, yc, z)
  const { out, bands } = jacketedShell(r, L, 1.0, 16, seed)
  out.forEach((g) => parts.push({ g: toX(g.translate(0, -L / 2, 0)), m: 'jacket' }))
  bands.forEach((g) => parts.push({ g: toX(g.translate(0, -L / 2, 0)), m: 'band' }))
  // 2:1 semi-elliptical heads (depth D/4), each banded radially at the knuckle
  for (const s of [-1, 1]) {
    const pts: THREE.Vector2[] = []
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * (Math.PI / 2)
      pts.push(new THREE.Vector2(r * Math.cos(a), (r / 2) * Math.sin(a)))
    }
    const head = new THREE.LatheGeometry(pts, 64)
    if (s < 0) head.rotateX(Math.PI)
    parts.push({ g: withColor(toX(head.translate(0, (s * L) / 2, 0)), 0.97), m: 'jacket' })
  }
  // nozzles and a manway on top
  for (const [dx, nr, nh] of [[-L * 0.3, 0.12, 0.45], [0, 0.32, 0.4], [L * 0.32, 0.09, 0.5]] as const) {
    parts.push({ g: withColor(new THREE.CylinderGeometry(nr, nr, nh, 32).translate(x + dx, yc + r + nh / 2 - 0.05, z)), m: 'jacket' })
    parts.push({ g: withColor(new THREE.CylinderGeometry(nr + 0.06, nr + 0.06, 0.05, 32).translate(x + dx, yc + r + nh - 0.05, z)), m: 'steel' })
  }
  // saddles on concrete piers
  for (const s of [-1, 1]) {
    const sx = x + s * L * 0.3
    parts.push({ g: box(0.45, 1.0 + r * 0.35, D * 0.9, sx, f + (1.0 + r * 0.35) / 2, z), m: 'concrete' })
    const saddle = sweep(annulusProfile(r + 0.01, r + 0.03, -0.12, 0.12, { outer: 0, inner: 0, end: 0 }), { theta0: Math.PI * 1.15, theta1: Math.PI * 1.85, segments: 48 })
    parts.push({ g: withColor(saddle.rotateY(Math.PI / 2).translate(sx, yc, z)), m: 'steel' })
  }
  return parts
}

/** Electric scissor lift, deck raised to `deckH` above the floor; local length along x. */
function scissorLift(f: number, x: number, z: number, rotY: number, deckH: number): Part[] {
  const parts: Part[] = []
  const L = 1.85
  const W = 0.8
  const m = new THREE.Matrix4().makeRotationY(rotY).premultiply(new THREE.Matrix4().makeTranslation(x, f, z))
  const add = (g: THREE.BufferGeometry, mat: keyof Mats, shadow = true) => parts.push({ g: g.applyMatrix4(m), m: mat, shadow })
  const wheelR = 0.155
  add(box(L, 0.3, W - 0.12, 0, wheelR + 0.15, 0), 'liftBody')
  add(box(L * 0.55, 0.12, W - 0.2, -0.2, wheelR + 0.34, 0), 'darkSteel')
  for (const sx of [-0.68, 0.68]) for (const sz of [-1, 1]) {
    const w = new THREE.CylinderGeometry(wheelR, wheelR, 0.12, 24).rotateX(Math.PI / 2)
    add(withColor(w.translate(sx, wheelR, sz * (W / 2 - 0.04))), 'rubber')
  }
  // scissor stack: 4 tiers of crossed arms on each side
  const tiers = 4
  const base = wheelR + 0.4
  const h = (deckH - base) / tiers
  const span = 1.5
  for (const sz of [-1, 1]) {
    const zz = sz * (W / 2 - 0.1)
    for (let i = 0; i < tiers; i++) {
      const y0 = base + i * h
      add(beam(new THREE.Vector3(-span / 2, y0, zz), new THREE.Vector3(span / 2, y0 + h, zz), 0.07, 0.04), 'liftBody')
      add(beam(new THREE.Vector3(span / 2, y0, zz), new THREE.Vector3(-span / 2, y0 + h, zz), 0.07, 0.04), 'liftBody')
    }
  }
  // deck, toe boards, guardrails (1.1 m), control box
  add(box(L + 0.1, 0.07, W, 0, deckH + 0.035, 0), 'darkSteel')
  const top = deckH + 0.07
  const posts: [number, number][] = [[-L / 2, -1], [-L / 2, 1], [0, -1], [0, 1], [L / 2, -1], [L / 2, 1]]
  for (const [px, s] of posts) add(bar(new THREE.Vector3(px, top, s * W / 2), new THREE.Vector3(px, top + 1.1, s * W / 2), 0.022, 8), 'liftBody')
  for (const y of [top + 0.55, top + 1.1]) {
    for (const s of [-1, 1]) add(bar(new THREE.Vector3(-L / 2, y, s * W / 2), new THREE.Vector3(L / 2, y, s * W / 2), 0.022, 8), 'liftBody')
    for (const px of [-L / 2, L / 2]) add(bar(new THREE.Vector3(px, y, -W / 2), new THREE.Vector3(px, y, W / 2), 0.022, 8), 'liftBody')
  }
  for (const s of [-1, 1]) add(box(L, 0.15, 0.012, 0, top + 0.075, s * W / 2), 'liftBody', false)
  add(box(0.22, 0.28, 0.14, L / 2 - 0.25, top + 1.0, W / 2 - 0.02), 'darkSteel', false)
  return parts
}

/** Telescopic boom lift, boom raised at `angle` toward local +x, basket at the tip. */
function boomLift(f: number, x: number, z: number, rotY: number, angle: number, boomLen: number): Part[] {
  const parts: Part[] = []
  const m = new THREE.Matrix4().makeRotationY(rotY).premultiply(new THREE.Matrix4().makeTranslation(x, f, z))
  const add = (g: THREE.BufferGeometry, mat: keyof Mats, shadow = false) => parts.push({ g: g.applyMatrix4(m), m: mat, shadow })
  const tireR = 0.38
  add(box(2.5, 0.55, 1.6, 0, tireR + 0.2, 0), 'boomBody')
  for (const sx of [-0.95, 0.95]) for (const sz of [-1, 1]) {
    const w = new THREE.CylinderGeometry(tireR, tireR, 0.32, 24).rotateX(Math.PI / 2)
    add(withColor(w.translate(sx, tireR, sz * 0.95)), 'rubber')
  }
  // turret with counterweight
  add(box(1.5, 0.8, 1.3, -0.3, tireR + 0.85, 0), 'boomBody')
  add(box(0.5, 0.75, 1.25, -1.15, tireR + 0.82, 0), 'darkSteel')
  // telescoping boom (three sections) and jib
  const pivot = new THREE.Vector3(0.2, tireR + 1.25, 0)
  const dir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0)
  const secs = [0.36, 0.29, 0.22]
  secs.forEach((w, i) => {
    const a = pivot.clone().addScaledVector(dir, (boomLen / 3) * i * 0.95)
    add(beam(a, a.clone().addScaledVector(dir, boomLen / 3 + 0.2), w, w * 0.8), i === 0 ? 'boomBody' : 'white')
  })
  const tip = pivot.clone().addScaledVector(dir, boomLen)
  const jibEnd = tip.clone().add(new THREE.Vector3(0.6, -0.15, 0))
  add(beam(tip, jibEnd, 0.14, 0.12), 'darkSteel')
  // basket: floor, rails
  const bx = jibEnd.x + 0.5
  const by = jibEnd.y - 0.6
  add(box(0.9, 0.08, 1.8, bx, by, 0), 'darkSteel')
  for (const [px, pz] of [[-0.45, -0.9], [-0.45, 0.9], [0.45, -0.9], [0.45, 0.9]]) {
    add(bar(new THREE.Vector3(bx + px, by, pz), new THREE.Vector3(bx + px, by + 1.1, pz), 0.025, 8), 'boomBody')
  }
  for (const y of [by + 0.55, by + 1.1]) {
    for (const px of [-0.45, 0.45]) add(bar(new THREE.Vector3(bx + px, y, -0.9), new THREE.Vector3(bx + px, y, 0.9), 0.025, 8), 'boomBody')
    for (const pz of [-0.9, 0.9]) add(bar(new THREE.Vector3(bx - 0.45, y, pz), new THREE.Vector3(bx + 0.45, y, pz), 0.025, 8), 'boomBody')
  }
  return parts
}

/** Barricade tape strung post to post with a little sag, plus the delineator posts. */
function cordon(f: number, pts: [number, number][]): Part[] {
  const parts: Part[] = []
  const tapeY = f + 0.95
  const w = 0.075
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  let u = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i]
    const [bx, bz] = pts[i + 1]
    const len = Math.hypot(bx - ax, bz - az)
    const n = Math.max(8, Math.round(len * 6))
    for (let k = 0; k <= n; k++) {
      if (i > 0 && k === 0) continue
      const s = k / n
      const sag = 0.06 * Math.min(1, len / 3) * 4 * s * (1 - s)
      const twist = 0.25 * Math.sin(s * Math.PI * 2 + i) * 4 * s * (1 - s)
      const x = ax + (bx - ax) * s
      const z = az + (bz - az) * s
      // the tape hangs edge-up; a slight twist shows its face
      const nx = -(bz - az) / len
      const nz = (bx - ax) / len
      const v = pos.length / 3
      pos.push(x + nx * twist * w, tapeY - sag + w / 2, z + nz * twist * w, x - nx * twist * w, tapeY - sag - w / 2, z - nz * twist * w)
      const uu = u + (s * len) / 0.75
      uv.push(uu, 1, uu, 0)
      if (v > 0) idx.push(v - 2, v - 1, v, v - 1, v + 1, v)
    }
    u += len / 0.75
  }
  const tape = new THREE.BufferGeometry()
  tape.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  tape.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  tape.setIndex(idx)
  tape.computeVertexNormals()
  parts.push({ g: withColor(tape), m: 'tape', shadow: true })
  for (const [x, z] of pts) {
    // delineator post: orange tube, two white reflective bands, black rubber base
    parts.push({ g: withColor(new THREE.CylinderGeometry(0.035, 0.04, 1.05, 16).translate(x, f + 0.06 + 0.525, z)), m: 'orange', shadow: true })
    for (const y of [0.78, 0.9]) parts.push({ g: withColor(new THREE.CylinderGeometry(0.037, 0.037, 0.06, 16).translate(x, f + y, z)), m: 'white' })
    parts.push({ g: box(0.36, 0.06, 0.36, x, f + 0.03, z), m: 'rubber' })
  }
  return parts
}

function cone(f: number, x: number, z: number): Part[] {
  return [
    { g: box(0.36, 0.035, 0.36, x, f + 0.018, z), m: 'rubber' },
    { g: withColor(new THREE.CylinderGeometry(0.025, 0.13, 0.68, 24, 1, true).translate(x, f + 0.035 + 0.34, z)), m: 'orange', shadow: true },
    { g: withColor(new THREE.CylinderGeometry(0.062, 0.078, 0.12, 24, 1, true).translate(x, f + 0.035 + 0.43, z)), m: 'white' },
  ]
}

/** Pallet of insulation cartons, a bundle of ASJ pipe sections, and a coil of jacketing. */
function materialDrop(f: number, x: number, z: number, rotY: number): Part[] {
  const parts: Part[] = []
  const m = new THREE.Matrix4().makeRotationY(rotY).premultiply(new THREE.Matrix4().makeTranslation(x, f, z))
  const add = (g: THREE.BufferGeometry, mat: keyof Mats, shadow = true) => parts.push({ g: g.applyMatrix4(m), m: mat, shadow })
  // pallet: three runners and deck boards
  for (const pz of [-0.45, 0, 0.45]) add(box(1.2, 0.09, 0.1, 0, 0.045, pz), 'wood', false)
  for (let i = 0; i < 7; i++) add(withColor(new THREE.BoxGeometry(1.2 / 7 - 0.02, 0.02, 1.0).translate(-0.6 + (i + 0.5) * (1.2 / 7), 0.1, 0), 0.9 + 0.15 * rnd(i, 7)), 'wood', false)
  // cartons 2 x 2 x 2
  for (let ix = 0; ix < 2; ix++) for (let iz = 0; iz < 2; iz++) for (let iy = 0; iy < 2; iy++) {
    const g = new THREE.BoxGeometry(0.58, 0.42, 0.48)
    add(withColor(g.translate(-0.3 + ix * 0.6, 0.11 + 0.21 + iy * 0.43, -0.25 + iz * 0.5), 0.92 + 0.14 * rnd(ix * 4 + iz * 2 + iy, 9)), 'carton')
  }
  // bundle of 3 ft ASJ pipe insulation sections beside the pallet
  const sec = (px: number, py: number, pz: number) => {
    const g = new THREE.CylinderGeometry(0.06, 0.06, 0.914, 24)
    add(withColor(g.rotateZ(Math.PI / 2).translate(px, py, pz)), 'asj')
  }
  for (let i = 0; i < 4; i++) sec(0.05, 0.06, 0.75 + i * 0.122)
  for (let i = 0; i < 3; i++) sec(0.05, 0.165, 0.81 + i * 0.122)
  // coil of aluminum jacketing lying on its side
  const coil = new THREE.CylinderGeometry(0.2, 0.2, 0.9, 40, 1, false)
  add(withColor(coil.rotateX(Math.PI / 2).translate(1.05, 0.2, 0.2)), 'jacket')
  return parts
}

// ------------------------------------------------------------- the stage

export function PlantProps({ floorY }: { floorY: number }) {
  const mats = useMemo(() => makeMats(), [])
  const meshes = useMemo(() => {
    const f = floorY
    const all: Part[] = [
      ...pipeRack(f, -8.5),
      ...storageTank(f, -16, -21, 8, 9, true, 3, Math.PI * 0.32),
      ...storageTank(f, -5, -25, 5, 7, false, 5, Math.PI * 0.4),
      ...horizontalVessel(f, 11, -17, 2.4, 7.5, 7),
      ...scissorLift(f, -3.2, -8.3, 0.12, 2.0),
      ...boomLift(f, 6.2, -14.2, -0.35, 0.95, 6.5),
      // runs +x along the front so CAUTION reads left to right from the default cameras
      ...cordon(f, [[-5.6, -5.6], [0.4, -5.6], [0.4, -10.6], [-5.6, -10.6], [-5.6, -5.6]]),
      ...cone(f, 0.9, -5.3),
      ...cone(f, -6.05, -5.25),
      ...materialDrop(f, 3.6, -4.2, -0.25),
    ]
    // one mesh per material (and shadow casting), so the yard stays a handful of draw calls
    const groups = new Map<string, { m: keyof Mats; shadow: boolean; geos: THREE.BufferGeometry[] }>()
    for (const p of all) {
      const key = `${p.m}|${p.shadow ? 1 : 0}`
      let g = groups.get(key)
      if (!g) groups.set(key, (g = { m: p.m, shadow: !!p.shadow, geos: [] }))
      g.geos.push(p.g.index ? p.g.toNonIndexed() : p.g)
    }
    return [...groups.values()].map((g) => {
      const merged = mergeSimple(g.geos)
      g.geos.forEach((x) => x.dispose())
      return { ...g, geometry: merged }
    })
  }, [floorY])
  useEffect(() => () => meshes.forEach((x) => x.geometry.dispose()), [meshes])
  // textures from pbr() are shared and cached; only the tape's own canvas texture is ours to free
  useEffect(() => () => Object.values(mats).forEach((m) => { if (m === mats.tape) m.map?.dispose(); m.dispose() }), [mats])
  return (
    <group name="plant-yard">
      {meshes.map((x) => (
        <mesh key={`${x.m}-${x.shadow}`} geometry={x.geometry} material={mats[x.m]} castShadow={x.shadow} receiveShadow />
      ))}
    </group>
  )
}

/** Merge non-indexed geometries that all carry position, normal, uv and color. */
function mergeSimple(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const names = ['position', 'normal', 'uv', 'color'] as const
  const sizes = { position: 3, normal: 3, uv: 2, color: 3 }
  const total = geos.reduce((n, g) => n + g.getAttribute('position').count, 0)
  const out = new THREE.BufferGeometry()
  for (const name of names) {
    const arr = new Float32Array(total * sizes[name])
    let o = 0
    for (const g of geos) {
      const a = g.getAttribute(name) as THREE.BufferAttribute | undefined
      const n = g.getAttribute('position').count
      if (a) arr.set(a.array as Float32Array, o)
      o += n * sizes[name]
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, sizes[name]))
  }
  return out
}

// --------------------------------------------------------- pipe supports

const IN = 0.0254

/**
 * Supports for the main line at each station (assembly frame: run along z,
 * y up). A concrete sleeper with a steel cap carries:
 *  - hot service: a welded T-shoe (base plate + web) standing the pipe off the
 *    sleeper, so the insulation and jacket pass over it;
 *  - cold service: a galvanized 180° shield cradling the jacket, so the
 *    insulation and vapor retarder stay unbroken (no metal path to the pipe).
 * Shown bare, a cold line sits on a saddle block at the same height.
 * Lengths are typical field sizes, for the picture only.
 */
export function PlantSupports({ stations, rPipe, rOut, service, bare, floorY }: {
  stations: number[]
  rPipe: number
  /** Jacket outside radius (bands included). */
  rOut: number
  service: 'hot' | 'cold'
  bare: boolean
  floorY: number
}) {
  const geo = useMemo(() => {
    const concrete: THREE.BufferGeometry[] = []
    const steel: THREE.BufferGeometry[] = []
    const galv: THREE.BufferGeometry[] = []
    const shieldT = 0.0015
    const shoeLen = 12 * IN
    const od = (2 * rPipe) / IN
    const shieldLen = (od <= 4.6 ? 12 : od <= 6.7 ? 18 : 24) * IN
    for (const z of stations) {
      const cold = service === 'cold'
      const top = cold && !bare ? -(rOut + shieldT) : -(rOut + 0.055)
      const capT = 0.01
      const blockTop = top - capT
      const h = blockTop - floorY
      if (h > 0.02) concrete.push(metricUV(box(0.46, h, 0.22, 0, floorY + h / 2, z), 0.46, h, 0.22))
      steel.push(box(0.5, capT, 0.16, 0, top - capT / 2, z))
      if (cold && !bare) {
        const sh = sweep(annulusProfile(rOut + 0.0004, rOut + 0.0004 + shieldT, z - shieldLen / 2, z + shieldLen / 2, { outer: 0, inner: 0, end: 0 }, 0.0006), {
          theta0: Math.PI, theta1: 2 * Math.PI, segments: 96,
        })
        galv.push(withColor(sh))
        continue
      }
      // T-shoe (or, bare cold line, a saddle block): base plate on the cap, web up to the pipe
      steel.push(box(0.16, 0.012, shoeLen, 0, top + 0.006, z))
      const webH = -rPipe + 0.002 - (top + 0.012)
      steel.push(box(0.012, webH, shoeLen * 0.92, 0, top + 0.012 + webH / 2, z))
    }
    return { concrete, steel, galv }
  }, [stations, rPipe, rOut, service, bare, floorY])
  const mats = useMemo(() => ({
    concrete: pbr('concrete-floor', { roughness: 1, color: new THREE.Color(1.3, 1.29, 1.25) }),
    steel: new THREE.MeshStandardMaterial({ color: '#7f858b', roughness: 0.55, metalness: 0.6, vertexColors: true }),
    galv: new THREE.MeshStandardMaterial({ color: '#c3c8cc', roughness: 0.4, metalness: 0.85, vertexColors: true }),
  }), [])
  useEffect(() => () => Object.values(geo).flat().forEach((g) => g.dispose()), [geo])
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])
  return (
    <group name="supports">
      {geo.concrete.map((g, i) => <mesh key={`c${i}`} geometry={g} material={mats.concrete} castShadow receiveShadow />)}
      {geo.steel.map((g, i) => <mesh key={`s${i}`} geometry={g} material={mats.steel} castShadow receiveShadow />)}
      {geo.galv.map((g, i) => <mesh key={`g${i}`} geometry={g} material={mats.galv} castShadow receiveShadow />)}
    </group>
  )
}

/**
 * Outdoor duct supports: a 1-5/8" strut cross-member under the jacketed duct on
 * two strut posts, each standing on a concrete block on the yard slab. In the
 * duct's local frame (run along z, across x), like the display stands they replace.
 */
export function PlantDuctSupports({ halfW, bottomY, stations, floorY }: { halfW: number; bottomY: number; stations: number[]; floorY: number }) {
  const at = stations.join()
  const geo = useMemo(() => {
    const concrete: THREE.BufferGeometry[] = []
    const galv: THREE.BufferGeometry[] = []
    const S = 0.041
    const postX = halfW + 0.07
    const crossY = bottomY - S / 2
    const blockH = Math.min(0.1, Math.max(0.04, (crossY - S / 2 - floorY) * 0.4))
    for (const z of at ? at.split(',').map(Number) : []) {
      galv.push(box(2 * postX + 0.1, S, S, 0, crossY, z))
      for (const sx of [-1, 1]) {
        const x = sx * postX
        concrete.push(metricUV(box(0.2, blockH, 0.2, x, floorY + blockH / 2, z), 0.2, blockH, 0.2))
        const postH = crossY - S / 2 - (floorY + blockH)
        if (postH > 0.01) galv.push(box(S, postH, S, x, floorY + blockH + postH / 2, z))
        // base plate on the block
        galv.push(box(0.11, 0.006, 0.11, x, floorY + blockH + 0.003, z))
      }
    }
    // boxes are indexed; the merge wants plain triangles
    const flat = (gs: THREE.BufferGeometry[]) => gs.map((g) => {
      const n = g.toNonIndexed()
      g.dispose()
      return n
    })
    const c = flat(concrete)
    const g = flat(galv)
    const out = { concrete: mergeSimple(c), galv: mergeSimple(g) }
    ;[...c, ...g].forEach((x) => x.dispose())
    return out
  }, [halfW, bottomY, at, floorY])
  const mats = useMemo(() => ({
    concrete: pbr('concrete-floor', { roughness: 1, color: new THREE.Color(1.3, 1.29, 1.25) }),
    galv: pbr('galvanized', { metalness: 0.55, roughness: 1.6, color: '#b4b9bd' }),
  }), [])
  useEffect(() => () => { geo.concrete.dispose(); geo.galv.dispose() }, [geo])
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])
  return (
    <group name="duct-supports">
      <mesh geometry={geo.concrete} material={mats.concrete} castShadow receiveShadow />
      <mesh geometry={geo.galv} material={mats.galv} castShadow receiveShadow />
    </group>
  )
}
