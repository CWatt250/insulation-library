import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { sweep, annulusProfile, bandProfile } from '../geo/sweep'
import { pbr } from '../materials/library'

/**
 * Mechanical room stage, built from the field photos: the pipe hangs overhead on
 * unistrut trapezes with insulation shields, parallel lines run alongside, LED
 * strip fixtures hang below a dark deck, painted CMU walls and a sealed concrete
 * floor close the box so every metal jacket reflects a real room.
 *
 * World frame: the main pipe axis is world x at y = 0, z = 0.
 */

export const ROOM = { floorY: -2.55, ceilY: 1.15, back: -2.4, front: 3.6, half: 6 }
const IN = 0.0254

let rectInit = false

/** Painted CMU: the texture covers 2 blocks × 2 courses (813 × 406 mm). */
function cmuMaterial() {
  const m = pbr('cmu-painted')
  for (const t of [m.map, m.normalMap, m.roughnessMap]) {
    if (!t) continue
    const c = t.clone()
    c.repeat.set(1 / 0.8128, 1 / 0.4064)
    if (t === m.map) m.map = c
    else if (t === m.normalMap) m.normalMap = c
    else m.roughnessMap = c
  }
  return m
}

const colorAttr = (g: THREE.BufferGeometry) => {
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 3).fill(1), 3))
  return g
}

/** A context line along world x: jacketed (with bands) or bare painted pipe. */
function contextRun(r: number, kind: 'alu' | 'pvc' | 'bare-red' | 'conduit', y: number, z: number) {
  const L = ROOM.half
  const toX = new THREE.Matrix4().makeRotationY(Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(0, y, z))
  const body = sweep(annulusProfile(r * 0.9, r, -L, L, { outer: 0, inner: 0, end: 0 }), { segments: 96 })
  body.applyMatrix4(toX)
  const bands: THREE.BufferGeometry[] = []
  if (kind === 'alu') {
    for (let x = -L + 0.2; x < L; x += 9 * IN) {
      const b = sweep(bandProfile(r + 0.0002, 0.0005, x, 0.5 * IN, 0), { segments: 96 })
      b.applyMatrix4(toX)
      bands.push(b)
    }
  }
  return { body, bands }
}

/** Room materials, shared by the pipe and duct rooms. */
function useRoomMats() {
  const mats = useMemo(
    () => ({
      floor: pbr('concrete-floor', { roughness: 0.55, color: '#b9b6ae' }),
      wall: cmuMaterial(),
      deck: new THREE.MeshStandardMaterial({ color: '#7b7e82', roughness: 0.75, metalness: 0.15 }),
      joist: new THREE.MeshStandardMaterial({ color: '#6c6f74', roughness: 0.6, metalness: 0.3 }),
      fixture: new THREE.MeshStandardMaterial({ color: '#e8e8e6', roughness: 0.5 }),
      lens: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff7ee', emissiveIntensity: 5 }),
      galv: pbr('ss-2b', { metalness: 0.55, roughness: 2.2, color: '#c9cdd0' }),
      strut: pbr('ss-2b', { metalness: 0.55, roughness: 2.2, color: '#bfc3c6' }),
      rod: new THREE.MeshStandardMaterial({ color: '#8d9196', roughness: 0.45, metalness: 1 }),
      alu: pbr('alu-smooth', { metalness: 1 }),
      band: pbr('ss-2b', { metalness: 1, roughness: 0.85, color: new THREE.Color(1.15, 1.15, 1.15) }),
      pvc: pbr('pvc-white', { clearcoat: 0.3, clearcoatRoughness: 0.25 }),
      red: new THREE.MeshPhysicalMaterial({ color: '#a3241f', roughness: 0.35, clearcoat: 0.4 }),
      conduit: pbr('ss-2b', { metalness: 1, roughness: 1.4, color: '#c8cbce' }),
    }),
    [],
  )
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])
  return mats
}
type RoomMats = ReturnType<typeof useRoomMats>

/**
 * The room itself: CMU walls, sealed floor, a dark deck on joists and pendant LED
 * strips (rows at `fixtureZ`), with a matching environment for reflections.
 */
function RoomShell({ mats, ceilY = ROOM.ceilY, fixtureZ = [-1.6, 0.35, 2.2] }: { mats: RoomMats; ceilY?: number; fixtureZ?: number[] }) {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    if (!rectInit) {
      RectAreaLightUniformsLib.init()
      rectInit = true
    }
  }, [gl])
  // memo keys: plain strings, so a new array with the same numbers keeps the geometry
  const rows = fixtureZ.join()
  const geo = useMemo(() => {
    const W = ROOM.half * 2
    const H = ceilY - ROOM.floorY
    const D = ROOM.front - ROOM.back
    const zMid = (ROOM.front + ROOM.back) / 2
    const floor = colorAttr(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2).translate(0, ROOM.floorY, zMid))
    const scaleUV = (g: THREE.BufferGeometry, sx: number, sy: number) => {
      const uv = g.getAttribute('uv')
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy)
      return g
    }
    scaleUV(floor, W, D)
    const walls = [
      scaleUV(colorAttr(new THREE.PlaneGeometry(W, H).translate(0, ROOM.floorY + H / 2, ROOM.back)), W, H),
      scaleUV(colorAttr(new THREE.PlaneGeometry(W, H).rotateY(Math.PI).translate(0, ROOM.floorY + H / 2, ROOM.front)), W, H),
      scaleUV(colorAttr(new THREE.PlaneGeometry(D, H).rotateY(Math.PI / 2).translate(-ROOM.half, ROOM.floorY + H / 2, zMid)), D, H),
      scaleUV(colorAttr(new THREE.PlaneGeometry(D, H).rotateY(-Math.PI / 2).translate(ROOM.half, ROOM.floorY + H / 2, zMid)), D, H),
    ]
    const deck = colorAttr(new THREE.PlaneGeometry(W, D).rotateX(Math.PI / 2).translate(0, ceilY, zMid))
    const joists: THREE.BufferGeometry[] = []
    for (let x = -ROOM.half + 0.9; x < ROOM.half; x += 1.8) {
      joists.push(colorAttr(new THREE.BoxGeometry(0.1, 0.36, D).translate(x, ceilY - 0.18, zMid)))
    }
    // LED strip fixtures: 4 ft, pendant-hung
    const fixtures: { x: number; z: number }[] = []
    for (const z of rows.split(',').map(Number)) for (const x of [-3.6, -1.2, 1.2, 3.6]) fixtures.push({ x, z })
    return { floor, walls, deck, joists, fixtures, fy: ceilY - 0.45 }
  }, [ceilY, rows])
  useEffect(() => () => [geo.floor, ...geo.walls, geo.deck, ...geo.joists].forEach((g) => g.dispose()), [geo])
  const midY = (ceilY + ROOM.floorY) / 2
  const H = ceilY - ROOM.floorY
  return (
    <>
      {/* reflections in raster mode come from this room-shaped environment */}
      <Environment resolution={512} frames={1} environmentIntensity={0.85}>
        <color attach="background" args={['#3a3936']} />
        {geo.fixtures.map((f, i) => (
          <Lightformer key={i} form="rect" intensity={14} color="#fff6ea" scale={[1.2, 0.06, 1]} position={[f.x, geo.fy - 0.01, f.z]} rotation-x={Math.PI / 2} />
        ))}
        <Lightformer form="rect" intensity={0.55} color="#d8d5cc" scale={[12, H, 1]} position={[0, midY, ROOM.back]} />
        <Lightformer form="rect" intensity={0.45} color="#d8d5cc" scale={[12, H, 1]} position={[0, midY, ROOM.front]} rotation-y={Math.PI} />
        <Lightformer form="rect" intensity={0.4} color="#d8d5cc" scale={[6, H, 1]} position={[ROOM.half, midY, 0.6]} rotation-y={-Math.PI / 2} />
        <Lightformer form="rect" intensity={0.4} color="#d8d5cc" scale={[6, H, 1]} position={[-ROOM.half, midY, 0.6]} rotation-y={Math.PI / 2} />
        <Lightformer form="rect" intensity={0.25} color="#8e8a82" scale={[12, 6, 1]} position={[0, ROOM.floorY, 0.6]} rotation-x={-Math.PI / 2} />
      </Environment>

      <mesh geometry={geo.floor} material={mats.floor} receiveShadow />
      {geo.walls.map((g, i) => <mesh key={i} geometry={g} material={mats.wall} receiveShadow />)}
      <mesh geometry={geo.deck} material={mats.deck} />
      {geo.joists.map((g, i) => <mesh key={i} geometry={g} material={mats.joist} />)}

      {geo.fixtures.map((f, i) => (
        <group key={i} position={[f.x, geo.fy, f.z]}>
          <mesh material={mats.fixture} castShadow>
            <boxGeometry args={[1.22, 0.05, 0.1]} />
          </mesh>
          <mesh material={mats.lens} position={[0, -0.0255, 0]} rotation-x={Math.PI / 2}>
            <planeGeometry args={[1.18, 0.07]} />
          </mesh>
          {[-0.5, 0.5].map((dx) => (
            <mesh key={dx} material={mats.rod} position={[dx, (ceilY - geo.fy) / 2, 0]}>
              <cylinderGeometry args={[0.002, 0.002, ceilY - geo.fy, 6]} />
            </mesh>
          ))}
          <rectAreaLight width={1.18} height={0.07} intensity={140} color="#fff4e6" position={[0, -0.03, 0]} rotation-x={-Math.PI / 2} />
        </group>
      ))}
      {/* overall fill so raster shadows still read; the path tracer uses the area lights */}
      <hemisphereLight args={['#f4efe6', '#9a968e', 0.45]} />
    </>
  )
}

export function MechRoom({ stations, radius, pipeRadius }: { stations: number[]; radius: number; pipeRadius: number }) {
  const mats = useRoomMats()
  const geo = useMemo(() => {
    // context lines (radius, kind, y, z)
    // parallel lines sharing the trapeze sit with their bottoms on the strut
    const r1 = radius * 0.82
    const r2 = radius * 0.62
    const ctx: [number, 'alu' | 'pvc' | 'bare-red' | 'conduit', number, number][] = [
      [r1, 'alu', -(radius - r1), -0.62],
      [r2, 'pvc', -(radius - r2), -1.08],
      [0.0572, 'bare-red', 0.78, -0.3],
      [0.0167, 'conduit', 1.06, 0.35],
    ]
    const runs = ctx.map(([r, kind, y, z]) => ({ kind, ...contextRun(r, kind, y, z), r, y, z }))

    // trapezes: unistrut + threaded rods + insulation shields under each line
    const strutY = -radius - 0.0025 - 0.0205
    const trapezes: { strut: THREE.BufferGeometry[]; rods: THREE.BufferGeometry[]; shields: THREE.BufferGeometry[] } = { strut: [], rods: [], shields: [] }
    const zA = -1.32, zB = 0.42
    for (const x of stations) {
      trapezes.strut.push(colorAttr(new THREE.BoxGeometry(0.041, 0.041, zB - zA + 0.1).translate(x, strutY, (zA + zB) / 2)))
      for (const z of [zA, zB]) {
        const len = ROOM.ceilY - strutY
        trapezes.rods.push(colorAttr(new THREE.CylinderGeometry(0.0048, 0.0048, len, 10).translate(x, strutY + len / 2, z)))
        // nut + washer under the strut
        trapezes.rods.push(colorAttr(new THREE.CylinderGeometry(0.009, 0.009, 0.009, 6).translate(x, strutY - 0.025, z)))
      }
      // 12" galvanized shield cradling the main line and the parallel alu line
      for (const [r, z] of [[radius, 0], [r1, -0.62], [r2, -1.08]] as const) {
        const sh = sweep(annulusProfile(r + 0.0002, r + 0.0016, x - 6 * IN, x + 6 * IN, { outer: 0, inner: 0, end: 0 }), {
          theta0: Math.PI * 1.08, theta1: Math.PI * 1.92, segments: 64, capMat: 0,
        })
        sh.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2))
        // after rotation local z → world x; the shield was built around z = x
        sh.applyMatrix4(new THREE.Matrix4().makeTranslation(0, -(radius - r), z))
        trapezes.shields.push(sh)
      }
      // sprinkler main on its own rod + ring hanger
      const ry = 0.78
      const ring = new THREE.TorusGeometry(0.0572 + 0.004, 0.003, 8, 32).rotateY(Math.PI / 2).translate(x + 0.15, ry, -0.3)
      trapezes.rods.push(colorAttr(ring))
      const len2 = ROOM.ceilY - (ry + 0.06)
      trapezes.rods.push(colorAttr(new THREE.CylinderGeometry(0.0048, 0.0048, len2, 10).translate(x + 0.15, ry + 0.06 + len2 / 2, -0.3)))
    }
    return { runs, trapezes }
  }, [stations, radius, pipeRadius])

  useEffect(
    () => () => {
      const all = [...geo.trapezes.strut, ...geo.trapezes.rods, ...geo.trapezes.shields]
      geo.runs.forEach((r) => all.push(r.body, ...r.bands))
      all.forEach((g) => g.dispose())
    },
    [geo],
  )

  return (
    <>
      <RoomShell mats={mats} />
      <ContextRuns runs={geo.runs} mats={mats} />
      {geo.trapezes.strut.map((g, i) => <mesh key={i} geometry={g} material={mats.strut} castShadow receiveShadow />)}
      {geo.trapezes.rods.map((g, i) => <mesh key={i} geometry={g} material={mats.rod} castShadow />)}
      {geo.trapezes.shields.map((g, i) => <mesh key={i} geometry={g} material={mats.galv} castShadow receiveShadow />)}
    </>
  )
}

function ContextRuns({ runs, mats }: { runs: { kind: 'alu' | 'pvc' | 'bare-red' | 'conduit'; body: THREE.BufferGeometry; bands: THREE.BufferGeometry[] }[]; mats: RoomMats }) {
  return (
    <>
      {runs.map((r, i) => (
        <group key={i}>
          <mesh geometry={r.body} material={r.kind === 'alu' ? mats.alu : r.kind === 'pvc' ? mats.pvc : r.kind === 'bare-red' ? mats.red : mats.conduit} castShadow receiveShadow />
          {r.bands.map((b, j) => <mesh key={j} geometry={b} material={mats.band} />)}
        </group>
      ))}
    </>
  )
}

/**
 * Ductwork indoors: the duct hangs overhead on strut trapezes — 1-5/8" channel
 * under the insulated duct, 3/8" threaded rods to the deck — with a sprinkler
 * main, conduit and a jacketed pipe sharing the space. The deck rises over
 * large ducts, and the light rows stand clear of the duct on either side.
 * World frame as MechRoom: the duct runs along world x at y = 0, z = 0;
 * `halfW` is the insulated half-width (world z), `bottomY`/`topY` its underside and top.
 */
export function DuctRoom({ stations, halfW, bottomY, topY }: { stations: number[]; halfW: number; bottomY: number; topY: number }) {
  const mats = useRoomMats()
  const ceilY = Math.max(ROOM.ceilY, topY + 0.8)
  const side = Math.max(1.1, halfW + 0.75)
  const fixtureZ = [-side, side, side + 1.9]
  const at = stations.join()
  const geo = useMemo(() => {
    const strut: THREE.BufferGeometry[] = []
    const rods: THREE.BufferGeometry[] = []
    const strutY = bottomY - 0.0205
    const rodZ = halfW + 0.07
    for (const x of at ? at.split(',').map(Number) : []) {
      strut.push(colorAttr(new THREE.BoxGeometry(0.041, 0.041, 2 * rodZ + 0.12).translate(x, strutY, 0)))
      for (const z of [-rodZ, rodZ]) {
        const len = ceilY - strutY
        rods.push(colorAttr(new THREE.CylinderGeometry(0.0048, 0.0048, len, 10).translate(x, strutY + len / 2, z)))
        // nut and washer under the strut, and on top of it
        rods.push(colorAttr(new THREE.CylinderGeometry(0.009, 0.009, 0.009, 6).translate(x, strutY - 0.025, z)))
        rods.push(colorAttr(new THREE.CylinderGeometry(0.009, 0.009, 0.009, 6).translate(x, strutY + 0.025, z)))
      }
    }
    // other trades overhead: a sprinkler main and conduit above the duct, a jacketed line beyond it
    const redY = Math.max(topY + 0.32, ceilY - 0.42)
    const ctx: [number, 'alu' | 'bare-red' | 'conduit', number, number][] = [
      [0.0572, 'bare-red', redY, -(halfW * 0.4 + 0.25)],
      [0.0167, 'conduit', ceilY - 0.07, halfW * 0.5 + 0.1],
      [0.12, 'alu', topY + 0.3, -(halfW + 1.05)],
    ]
    const runs = ctx.map(([r, kind, y, z]) => ({ kind, ...contextRun(r, kind, y, z) }))
    for (let x = -ROOM.half + 0.75; x < ROOM.half; x += 2.4) {
      // ring hangers on the sprinkler main, clevis rods on the jacketed line
      rods.push(colorAttr(new THREE.TorusGeometry(0.0572 + 0.004, 0.003, 8, 32).rotateY(Math.PI / 2).translate(x, redY, ctx[0][3])))
      const l1 = ceilY - (redY + 0.06)
      rods.push(colorAttr(new THREE.CylinderGeometry(0.0048, 0.0048, l1, 10).translate(x, redY + 0.06 + l1 / 2, ctx[0][3])))
      const ay = ctx[2][2]
      const l2 = ceilY - (ay + 0.12)
      rods.push(colorAttr(new THREE.CylinderGeometry(0.0048, 0.0048, l2, 10).translate(x + 0.6, ay + 0.12 + l2 / 2, ctx[2][3])))
    }
    return { strut, rods, runs }
  }, [at, halfW, bottomY, topY, ceilY])
  useEffect(() => () => {
    [...geo.strut, ...geo.rods].forEach((g) => g.dispose())
    geo.runs.forEach((r) => [r.body, ...r.bands].forEach((g) => g.dispose()))
  }, [geo])
  return (
    <>
      <RoomShell mats={mats} ceilY={ceilY} fixtureZ={fixtureZ} />
      <ContextRuns runs={geo.runs} mats={mats} />
      {geo.strut.map((g, i) => <mesh key={i} geometry={g} material={mats.strut} castShadow receiveShadow />)}
      {geo.rods.map((g, i) => <mesh key={i} geometry={g} material={mats.rod} castShadow />)}
    </>
  )
}
