import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { Bloom, EffectComposer, N8AO, Outline, SMAA, Select, Selection, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { buildAssembly, buildCradle, splitByMaterial, type Assembly, type AssemblyParams } from '../geo/assembly'
import type { LayerId } from '../data/catalog'
import { PhotoMode, type PhotoProgress } from './PhotoMode'
import { Callouts } from './Callouts'
import { MechRoom, ROOM } from './MechRoom'
import { PhysicalCamera } from 'three-gpu-pathtracer'
import { buildSlots, cradleMat, padMat, pbr, setMaxAnisotropy } from '../materials/library'
import { ZoneEffects, type RunExtent, type SimVisual } from './effects'
import { thermalMaterial, updateThermal } from './thermal'
import { IN } from '../data/pipe'
import { pipeSpec } from '../data/pipes'

/** Shared camera state for side-by-side compare: whoever is being dragged leads. */
export class CamSync {
  pos = new THREE.Vector3()
  target = new THREE.Vector3()
  version = 0
  owner = -1
}

export interface ViewerProps extends AssemblyParams {
  stage: 'studio' | 'plant' | 'room'
  /** Phone: lighter render settings. */
  mobile?: boolean
  photo?: boolean
  onPhotoProgress?: (p: PhotoProgress) => void
  cam?: [number, number, number]
  target?: [number, number, number]
  /** Layers switched off in the layer list. */
  hidden?: LayerId[]
  /** Layer picked in the list or by clicking the model. */
  selected?: LayerId | null
  onSelect?: (layer: LayerId | null) => void
  /** Pixels covered by side panels, so framing and labels stay in the open area. */
  insetLeft?: number
  insetRight?: number
  /** Simulation overlays (Hot / Cold / Condensate modes). */
  sim?: SimVisual
  /** Compare mode: cameras move together. */
  sync?: { group: CamSync; id: number }
  /**
   * Compare mode: frame the model to this panel's own width and height, sized
   * for the largest model in the row (metres) so every panel shows the same view.
   */
  frameRadius?: number
  /** Fraction of the landscape framing a narrow view must keep (phones 0.68, compare panes less). */
  coverage?: number
  /** Presentation mode: a slow turntable. */
  autoRotate?: boolean
}

const SHEET_LAYERS: LayerId[] = ['insulation', 'facing', 'vapor', 'jacket', 'blanket']

const FLOOR_Y = -0.42

type Built = Assembly & { groups: { key: string; layer: LayerId; lift: number; meshes: { mat: number; geometry: THREE.BufferGeometry }[] }[] }

function useAssembly(props: ViewerProps): Built {
  const asm = useMemo(
    () => {
      const t0 = performance.now()
      const a = buildAssembly({ ...props, span: props.stage === 'room' ? ROOM.half * 2 - 0.02 : undefined })
      // one group per layer (and per lifted half in the exploded view), one mesh per material
      const byKey = new Map<string, { layer: LayerId; lift: number; geos: THREE.BufferGeometry[] }>()
      for (const p of a.parts) {
        const lift = p.lift ?? 0
        const key = `${p.layer}|${lift.toFixed(4)}`
        let g = byKey.get(key)
        if (!g) byKey.set(key, (g = { layer: p.layer, lift, geos: [] }))
        g.geos.push(p.geometry.index ? p.geometry.toNonIndexed() : p.geometry)
      }
      const groups = [...byKey.entries()].map(([key, g]) => ({ key, layer: g.layer, lift: g.lift, meshes: splitByMaterial(g.geos) }))
      a.parts.forEach((p) => p.geometry.dispose())
      if (import.meta.env.DEV) (window as unknown as { __buildMs: number }).__buildMs = performance.now() - t0
      return { ...a, groups }
    },
    [props.component, props.npsIndex, props.thicknessIn, props.insulation, props.jacket, props.facing, props.service, props.view, props.stage === 'room', props.pipe], // eslint-disable-line react-hooks/exhaustive-deps
  )
  useEffect(() => () => asm.groups.forEach((g) => g.meshes.forEach((m) => m.geometry.dispose())), [asm])
  return asm
}

const noRaycast = () => null

/** One layer of the build-up: shown or hidden, outlined when selected, lifted in the exploded view. */
function LayerGroup({ lift, animate, visible, selected, children }: { lift: number; animate: boolean; visible: boolean; selected: boolean; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    const k = animate ? 1 - Math.exp(-dt * 7) : 1
    g.position.y += (lift - g.position.y) * k
    if (Math.abs(lift - g.position.y) < 1e-5) g.position.y = lift
  })
  return (
    <Select enabled={selected && visible}>
      <group ref={ref} visible={visible}>{children}</group>
    </Select>
  )
}

function Run({ asm, ...props }: ViewerProps & { asm: Built }) {
  const slots = useMemo(() => buildSlots(props.insulation, props.jacket, props.pipe), [props.insulation, props.jacket, props.pipe])
  useEffect(() => () => slots.forEach((m) => m.dispose()), [slots])
  const thermal = useMemo(() => thermalMaterial(), [])
  useEffect(() => () => thermal.dispose(), [thermal])
  const groupRef = useRef<THREE.Group>(null)
  const sim = props.sim
  const hidden = sim?.bare ? SHEET_LAYERS : sim?.fittingBare ? ['blanket' as LayerId] : props.hidden ?? []
  const rPipe = (pipeSpec(props.pipe, props.npsIndex).od / 2) * IN
  const rIns = rPipe + 0.0004 + props.thicknessIn * IN
  if (sim?.thermal) updateThermal(thermal, sim, rPipe, rIns)
  const onSelect = props.onSelect
  const click = (layer: LayerId) => (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6) return // an orbit drag, not a pick
    e.stopPropagation()
    onSelect?.(props.selected === layer ? null : layer)
  }
  const callouts = useMemo(() => asm.callouts.filter((c) => !c.layer || !hidden.includes(c.layer)), [asm, hidden.join()]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
    <group ref={groupRef} rotation={[0, Math.PI / 2, 0]} position={[-(asm.zMin + asm.zMax) / 2, 0, 0]}>
      <group name="assembly">
        {asm.groups.map((g) => {
          const visible = !hidden.includes(g.layer)
          return (
            <LayerGroup key={g.key} lift={g.lift} animate={!props.photo} visible={visible} selected={props.selected === g.layer}>
              {g.meshes.map((m) => (
                <mesh
                  key={m.mat}
                  geometry={m.geometry}
                  material={sim?.thermal ? thermal : slots[m.mat]}
                  castShadow
                  receiveShadow
                  onClick={click(g.layer)}
                  raycast={visible ? undefined : noRaycast}
                />
              ))}
            </LayerGroup>
          )
        })}
      </group>
      {props.stage !== 'room' && <Cradles radius={sim?.bare ? rPipe : asm.outerRadius} stations={asm.cradles} />}
      {sim && !props.photo && (asm.zones ?? []).filter((z) => !(sim.bare && (z.kind === 'stub' || z.bareZ === null))).map((z) => {
        const state = z.kind === 'stub' ? sim.stub ?? sim : z.kind === 'fitting' ? sim.fitting ?? sim : sim
        const bareFit = z.kind === 'fitting' && (sim.bare || sim.fittingBare)
        // shown bare, a run covers its stubs too and nothing is cut away
        const span = sim.bare && z.bareZ ? z.bareZ : [z.z0, z.z1]
        const extent: RunExtent = {
          radius: sim.bare || bareFit ? z.rBare : z.radius,
          z0: span[0], z1: span[1],
          wedge: sim.bare ? null : z.wedge ?? null, zWedge: z.zWedge ?? Infinity,
          floorY: FLOOR_Y, vertical: z.vertical,
          box: sim.bare ? z.boxBare : z.box,
        }
        const fx = <ZoneEffects key={z.key} extent={extent} mode={sim.mode} zone={state} />
        return z.matrix ? <group key={z.key} matrix={z.matrix} matrixAutoUpdate={false}>{fx}</group> : fx
      })}
    </group>
    {props.stage === 'room' && (
      <MechRoom
        stations={asm.cradles.map((z) => z - (asm.zMin + asm.zMax) / 2)}
        radius={asm.outerRadius}
        pipeRadius={asm.outerRadius}
      />
    )}
    <Callouts items={callouts} parent={groupRef} insetRight={props.insetRight ?? 0} extent={asm.extent} />
    </>
  )
}

function Cradles({ radius, stations }: { radius: number; stations: number[] }) {
  const geos = useMemo(() => {
    const parts = stations.flatMap((z) => buildCradle(radius, z, FLOOR_Y)).map((g) => {
      const n = g.index ? g.toNonIndexed() : g
      if (!n.groups.length) n.addGroup(0, n.getAttribute('position').count, 0)
      return n
    })
    return splitByMaterial(parts)
  }, [radius, stations])
  const mats = useMemo(() => [cradleMat(), padMat()], [])
  useEffect(() => () => geos.forEach((g) => g.geometry.dispose()), [geos])
  return (
    <>
      {geos.map((g) => (
        <mesh key={g.mat} geometry={g.geometry} material={mats[g.mat]} castShadow receiveShadow />
      ))}
    </>
  )
}

const LAYER_VIEWS: Record<AssemblyParams['component'], { cam: [number, number, number]; target: [number, number, number] }> = {
  straight: { cam: [1.32, 0.42, 1.36], target: [0.42, -0.04, 0] },
  elbow: { cam: [1.6, 1.0, 1.9], target: [0.12, 0.42, 0] },
  valve: { cam: [0.95, 0.55, 1.15], target: [0, 0.05, 0] },
  tee: { cam: [1.5, 0.9, 1.75], target: [0.1, 0.18, 0] },
  flange: { cam: [0.95, 0.45, 1.15], target: [0, 0.0, 0] },
}

/** Mech room: eye height (1.6 m above the floor) looking up at the overhead line. */
const ROOM_VIEWS: Record<AssemblyParams['component'], { cam: [number, number, number]; target: [number, number, number] }> = {
  straight: { cam: [1.9, -0.95, 2.6], target: [-0.2, 0.05, -0.3] },
  elbow: { cam: [1.9, -0.6, 2.9], target: [0.0, 0.25, -0.2] },
  valve: { cam: [1.5, -0.9, 2.3], target: [0, 0.05, -0.1] },
  tee: { cam: [1.9, -0.7, 2.8], target: [0.0, 0.2, -0.2] },
  flange: { cam: [1.5, -0.9, 2.3], target: [0, 0.0, -0.1] },
}

const VIEWS: Record<AssemblyParams['component'], { cam: [number, number, number]; target: [number, number, number] }> = {
  straight: { cam: [1.72, 0.66, 1.64], target: [0.16, -0.08, 0] },
  elbow: { cam: [1.9, 1.05, 2.3], target: [0.0, 0.24, 0] },
  valve: { cam: [1.15, 0.62, 1.4], target: [0, 0.08, 0] },
  tee: { cam: [1.75, 1.0, 2.05], target: [0.08, 0.2, 0] },
  flange: { cam: [1.1, 0.5, 1.35], target: [0, 0.0, 0] },
}

/**
 * Presets are framed for a ~1.6 landscape aspect. On narrower screens (phones
 * in portrait) widen the vertical FOV so the horizontal coverage stays the same.
 */
function applyFov(camera: THREE.PerspectiveCamera) {
  const base = (camera.userData.baseFov as number | undefined) ?? 30
  const aspect0 = camera.aspect || 1.6
  if (camera.userData.fit) {
    // compare panels are framed by distance; tall narrow panels just open the
    // vertical angle a little so the camera need not back off as far
    camera.fov = aspect0 >= 1 ? base : Math.min(Math.max((2 * Math.atan(Math.tan((13 * Math.PI) / 180) / aspect0) * 180) / Math.PI, base), 58)
    camera.updateProjectionMatrix()
    return
  }
  // phones have no side panels to frame around, so they can cover less width
  const coverage = (camera.userData.coverage as number | undefined) ?? 1
  const aspect = camera.aspect || 1.6
  const want = 1.6 * coverage
  const fov = aspect >= want ? base : (2 * Math.atan((Math.tan((base * Math.PI) / 360) * want) / aspect) * 180) / Math.PI
  camera.fov = Math.min(fov, 80)
  camera.updateProjectionMatrix()
}

type Preset = { cam: [number, number, number]; target: [number, number, number] }

/**
 * Exploded and section views are framed from the model's size: the lifted
 * stack grows with pipe size, and the section face should fill the frame
 * with room on the right for its ring labels.
 */
function fitPreset(view: AssemblyParams['view'], asm: Assembly, camera: THREE.PerspectiveCamera, screen: { w: number; h: number; left: number; right: number }): Preset | null {
  const R = asm.outerRadius
  const half = (asm.zMax - asm.zMin) / 2 + 0.1 // + pipe stub
  let dir: THREE.Vector3
  // fraction of the open width kept for the label column on the right
  let labelRoom: number
  let fill: number
  if (view === 'exploded') {
    dir = new THREE.Vector3(1.25, 0.62, 1.7).normalize()
    labelRoom = 0.26
    fill = 0.9
  } else if (view === 'section') {
    dir = new THREE.Vector3(0.95, 0.3, 0.62).normalize()
    labelRoom = 0.4
    fill = 0.92
  } else return null
  // world-space box of the model (run along world x, centred)
  const box = view === 'section'
    // the section is about the cut face: frame the face and the first stretch of run behind it
    ? new THREE.Box3(new THREE.Vector3(half - 0.1 - Math.max(0.12, 1.2 * R), -R, -R), new THREE.Vector3(half - 0.1, R, R))
    : new THREE.Box3(new THREE.Vector3(-half, -R, -R), new THREE.Vector3(half, asm.yMax, R))
  // open area in NDC, model to the left of the label column
  const openL = (screen.left / screen.w) * 2 - 1
  const openR = 1 - (screen.right / screen.w) * 2
  const modelR = openR - (openR - openL) * labelRoom
  return fitBox(camera, box, dir, { l: openL, r: modelR, b: -0.82, t: 0.8 }, fill)
}

/** Camera along `dir` that just fits `box` inside the NDC rectangle `want` (× fill). */
function fitBox(camera: THREE.PerspectiveCamera, box: THREE.Box3, dir: THREE.Vector3, want: { l: number; r: number; b: number; t: number }, fill: number): Preset {
  const center = box.getCenter(new THREE.Vector3())
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => new THREE.Vector3(
    i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z,
  ))
  const cam = camera.clone()
  const right = new THREE.Vector3().crossVectors(dir.clone().negate(), new THREE.Vector3(0, 1, 0)).normalize()
  const up = new THREE.Vector3().crossVectors(right, dir.clone().negate()).normalize()
  // find the distance where the box just fits, then slide it into the open area
  let lo = 0.2, hi = 12, shift = 0, lift = 0
  const centre = (d: number) => {
    for (let k = 0; k < 3; k++) {
      const f = place(d, shift, lift)
      const perX = d * Math.tan((cam.fov * Math.PI) / 360) * cam.aspect
      const perY = d * Math.tan((cam.fov * Math.PI) / 360)
      shift -= ((want.l + want.r) / 2 - (f.l + f.r) / 2) * perX
      lift -= ((want.b + want.t) / 2 - (f.b + f.tp) / 2) * perY
    }
  }
  const place = (dist: number, sh: number, li: number) => {
    const t = center.clone().addScaledVector(right, sh).addScaledVector(up, li)
    cam.position.copy(t).addScaledVector(dir, dist)
    cam.lookAt(t)
    cam.updateMatrixWorld()
    const p = corners.map((c) => c.clone().project(cam))
    return { t, l: Math.min(...p.map((v) => v.x)), r: Math.max(...p.map((v) => v.x)), b: Math.min(...p.map((v) => v.y)), tp: Math.max(...p.map((v) => v.y)) }
  }
  for (let i = 0; i < 28; i++) {
    const d = (lo + hi) / 2
    centre(d)
    const f = place(d, shift, lift)
    const fits = f.r - f.l <= (want.r - want.l) * fill && f.tp - f.b <= (want.t - want.b) * fill
    if (fits) hi = d
    else lo = d
  }
  const dist = Math.min(hi, 9)
  centre(dist)
  const f = place(dist, shift, lift)
  return { cam: [cam.position.x, cam.position.y, cam.position.z], target: [f.t.x, f.t.y, f.t.z] }
}

/**
 * Compare panels: the cut end (straight run) or the fitting, fitted to the
 * panel's own shape between its label and the controls. `radius` is the
 * largest model in the row so every panel computes the same camera.
 */
function fitCompare(component: AssemblyParams['component'], asm: Assembly, camera: THREE.PerspectiveCamera, radius: number): Preset {
  const v = VIEWS[component]
  const dir = new THREE.Vector3(...v.cam).sub(new THREE.Vector3(...v.target)).normalize()
  const R = Math.max(radius, asm.outerRadius)
  const half = (asm.zMax - asm.zMin) / 2
  const rise = Math.max(0.05, 0.7 * R) // heat waves and arrows above the pipe
  let box: THREE.Box3
  if (component === 'straight') {
    const L = Math.min(2 * half, Math.max(0.42, 9 * R))
    box = new THREE.Box3(new THREE.Vector3(half - L, -R, -R), new THREE.Vector3(half + 7 * IN, R + rise, R))
  } else if (component === 'elbow') {
    box = new THREE.Box3(new THREE.Vector3(-half, -R, -R), new THREE.Vector3(half, asm.yMax, R))
  } else {
    const hw = Math.min(half, Math.max(0.36, 6 * R))
    box = new THREE.Box3(new THREE.Vector3(-hw, -R, -R), new THREE.Vector3(hw, Math.max(asm.yMax, R) + rise, R))
  }
  return fitBox(camera, box, dir, { l: -0.9, r: 0.9, b: -0.5, t: 0.6 }, 0.94)
}

/** Frames the assembly when the component or view changes (URL cam/tgt override for screenshots). */
function CameraRig({ component, view, stage, cam, target, asm, insetLeft = 0, insetRight = 0, zoom = 1, frameRadius }: Pick<ViewerProps, 'component' | 'view' | 'stage' | 'cam' | 'target' | 'insetLeft' | 'insetRight' | 'frameRadius'> & { asm: Assembly; zoom?: number }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null
  const fit = view === 'exploded' || view === 'section'
  const compare = frameRadius !== undefined && !cam && (view === 'cutaway' || view === 'installed')
  useEffect(() => {
    if (!compare) return
    const pc = camera as THREE.PerspectiveCamera
    pc.userData.fit = true
    pc.userData.baseFov = 30
    pc.aspect = size.width / size.height
    applyFov(pc)
    const v = fitCompare(component, asm, pc, frameRadius!)
    camera.position.set(...v.cam)
    if (controls) {
      controls.target.set(...v.target)
      controls.update()
    }
  }, [compare, component, view, camera, controls, size.width, size.height, frameRadius, asm.zMin, asm.zMax, asm.yMax]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (compare) return
    const room = stage === 'room' && view !== 'layers' && !fit
    const pc = camera as THREE.PerspectiveCamera
    pc.userData.fit = false
    pc.userData.baseFov = room ? 52 : 30
    applyFov(pc)
    const v = fitPreset(view, asm, pc, { w: size.width, h: size.height, left: insetLeft, right: insetRight })
      ?? (room ? ROOM_VIEWS : view === 'layers' ? LAYER_VIEWS : VIEWS)[component]
    camera.position.set(...(cam ?? v.cam))
    let aim = target ?? v.target
    // simulation: centre on the cut end and bare stub (where the effects tell the story),
    // and pull in on small pipe so they read (presets are framed for ~NPS 8)
    if (!cam && zoom !== 1 && component === 'straight' && (view === 'cutaway' || view === 'installed')) {
      const from = new THREE.Vector3(...v.cam).sub(new THREE.Vector3(...v.target))
      aim = [0.36, -0.06, 0]
      camera.position.copy(from.multiplyScalar(zoom).add(new THREE.Vector3(...aim)))
    }
    if (controls) {
      controls.target.set(...aim)
      controls.update()
    }
  }, [component, view, stage === 'room', camera, controls, fit ? `${asm.outerRadius.toFixed(4)}-${asm.yMax.toFixed(4)}` : '', zoom]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

/** Compare mode: the panel being dragged writes its camera; the others follow. */
function SyncCamera({ group, id }: { group: CamSync; id: number }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as (THREE.EventDispatcher<{ start: object; change: object }> & { target: THREE.Vector3; update: () => void }) | null
  const seen = useRef(-1)
  useEffect(() => {
    if (!controls) return
    const start = () => { group.owner = id }
    const change = () => {
      if (group.owner !== id) return
      group.pos.copy(camera.position)
      group.target.copy(controls.target)
      group.version++
      seen.current = group.version
    }
    controls.addEventListener('start', start)
    controls.addEventListener('change', change)
    return () => {
      controls.removeEventListener('start', start)
      controls.removeEventListener('change', change)
    }
  }, [controls, camera, group, id])
  useFrame(() => {
    if (!controls || group.owner === id || group.version === seen.current || group.owner < 0) return
    seen.current = group.version
    camera.position.copy(group.pos)
    controls.target.copy(group.target)
    controls.update()
  })
  return null
}

function RendererSetup({ mobile, coverage }: { mobile?: boolean; coverage?: number }) {
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  // R3F leaves aspect alone on cameras passed in as instances.
  useEffect(() => {
    camera.userData.coverage = coverage ?? (mobile ? 0.68 : 1)
    camera.aspect = size.width / size.height
    applyFov(camera)
  }, [camera, size, mobile, coverage])
  useEffect(() => {
    setMaxAnisotropy(gl.capabilities.getMaxAnisotropy())
  }, [gl])
  return null
}

/**
 * Seamless 360° studio cove: a floor that curves up into a low lip all the way
 * round, so every orbit angle sees backdrop. It stays below the softboxes;
 * a tall wall would physically block their light in photo mode.
 */
function Cyc() {
  const geo = useMemo(() => {
    const R0 = 4 // flat floor radius
    const Rc = 1.4 // cove radius
    const H = 2.2 // lip height: hides the void from high orbits, stays under the softboxes
    const pts: THREE.Vector2[] = []
    for (let i = 0; i <= 12; i++) pts.push(new THREE.Vector2((R0 * i) / 12, 0))
    for (let i = 1; i <= 24; i++) {
      const a = (Math.PI / 2) * (i / 24)
      pts.push(new THREE.Vector2(R0 + Rc * Math.sin(a), Rc - Rc * Math.cos(a)))
    }
    pts.push(new THREE.Vector2(R0 + Rc, H))
    const g = new THREE.LatheGeometry(pts, 128)
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 3).fill(1), 3))
    return g
  }, [])
  return (
    <mesh geometry={geo} position={[0, FLOOR_Y, 0]} receiveShadow>
      <meshStandardMaterial color="#3a3b3d" roughness={0.92} side={THREE.DoubleSide} />
    </mesh>
  )
}

/** Plant stage: worn concrete slab, real scale (CC0 texture, 3 m tile). */
function ConcreteFloor() {
  const geo = useMemo(() => {
    const size = 60
    const g = new THREE.PlaneGeometry(size, size, 1, 1)
    g.rotateX(-Math.PI / 2)
    const uv = g.getAttribute('uv')
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * size, uv.getY(i) * size)
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 3).fill(1), 3))
    return g
  }, [])
  const mat = useMemo(() => pbr('concrete-floor', { roughness: 1 }), [])
  return <mesh geometry={geo} material={mat} position={[0, FLOOR_Y, 0]} receiveShadow />
}

/**
 * Product-photography lighting baked into the environment map: a large overhead
 * softbox, two long strip lights that draw the clean highlight lines you see on
 * metal-jacketed pipe in catalogue shots, and a dim fill so shadows never go
 * black. The real studio HDRI underneath adds natural variation.
 */
function StudioLights() {
  return (
    <Environment
      files={`${import.meta.env.BASE_URL}hdri/studio_small_09_1k.hdr`}
      environmentIntensity={0.8}
      resolution={1024}
    >
      <Lightformer form="rect" intensity={1.5} color="#fff8f0" scale={[10, 4, 1]} position={[0, 6, 0]} rotation-x={Math.PI / 2} />
      <Lightformer form="rect" intensity={3.2} scale={[12, 0.9, 1]} position={[0, 2.2, 5]} rotation-x={-0.4} />
      <Lightformer form="rect" intensity={1.4} color="#e8f0ff" scale={[12, 0.6, 1]} position={[0, -0.6, 5]} />
      <Lightformer form="rect" intensity={1.6} scale={[3, 6, 1]} position={[6, 2.8, 1]} rotation-y={-Math.PI / 2} />
      <Lightformer form="rect" intensity={0.6} scale={[3, 6, 1]} position={[-6, 2.8, -1]} rotation-y={Math.PI / 2} />
      <Lightformer form="ring" intensity={1.2} scale={2} position={[-3, 3, -6]} />
    </Environment>
  )
}

export function Viewer(props: ViewerProps) {
  const asm = useAssembly(props)
  const down = useRef<[number, number] | null>(null)
  // A physical camera so photo mode can render real depth of field (f/5.6,
  // focused on the orbit target, like a product shot on a 50 mm-ish lens).
  const camera = useMemo(() => {
    const c = new PhysicalCamera(30, 1, 0.01, 60)
    c.position.set(...(props.cam ?? VIEWS[props.component].cam))
    c.fStop = 5.6
    c.apertureBlades = 7
    return c
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Canvas
      onPointerDown={(e) => { down.current = [e.clientX, e.clientY] }}
      onPointerMissed={(e) => {
        // a click on empty space clears the selection; an orbit drag does not
        const d = down.current
        if (d && Math.hypot(e.clientX - d[0], e.clientY - d[1]) < 6) props.onSelect?.(null)
      }}
      shadows="variance"
      dpr={props.mobile ? [1, 1.5] : [1, 2]}
      camera={camera}
      gl={{ antialias: false, toneMapping: THREE.NoToneMapping, powerPreference: 'high-performance', preserveDrawingBuffer: !!props.sim }}
    >
      <Selection>
      <RendererSetup mobile={props.mobile} coverage={props.coverage} />
      <CameraRig
        component={props.component} view={props.view} stage={props.stage} cam={props.cam} target={props.target} asm={asm}
        insetLeft={props.insetLeft} insetRight={props.insetRight} frameRadius={props.frameRadius}
        zoom={props.sim ? Math.round(Math.min(Math.max((asm.outerRadius + 0.07) / 0.18, 0.62), 1.1) * 100) / 100 + 0.001 : 1}
      />
      {props.sync && <SyncCamera group={props.sync.group} id={props.sync.id} />}
      <color attach="background" args={['#3a3b3e']} />
      <Suspense fallback={null}>
        {props.stage === 'studio' ? (
          <StudioLights />
        ) : props.stage === 'room' ? null : (
          <Environment
            files={`${import.meta.env.BASE_URL}hdri/overcast_industrial_courtyard_2k.hdr`}
            background
            backgroundBlurriness={0.03}
            environmentIntensity={1}
          />
        )}
        <Run {...props} asm={asm} />
        {props.stage === 'studio' ? <Cyc /> : props.stage === 'plant' ? <ConcreteFloor /> : null}
        {props.photo ? (props.stage === 'studio' && (
          // Photo mode: a real 2.4 m softbox. Area lights give the path tracer
          // physically soft shadows whose penumbra grows with distance.
          <rectAreaLight
            position={[0.9, 4.2, 1.6]}
            width={2.4}
            height={2.4}
            intensity={12}
            color="#fff6ec"
            onUpdate={(l) => l.lookAt(0, 0, 0)}
          />
        )) : (
          // Raster: a key light standing in for the overhead softbox, soft VSM shadows on the cyc.
          <directionalLight
            castShadow
            position={[0.9, 4.2, 1.6]}
            intensity={props.stage === 'studio' ? 1.3 : props.stage === 'room' ? 0.35 : 0.5}
            color="#fff6ec"
            shadow-mapSize={props.mobile ? [2048, 2048] : [4096, 4096]}
            shadow-camera-left={-3.2}
            shadow-camera-right={3.2}
            shadow-camera-top={3.2}
            shadow-camera-bottom={-3.2}
            shadow-camera-near={2}
            shadow-camera-far={7}
            shadow-radius={18}
            shadow-blurSamples={24}
            shadow-bias={-0.0006}
            shadow-normalBias={0.005}
          />
        )}

      </Suspense>
      <OrbitControls
        makeDefault
        target={props.target ?? VIEWS[props.component].target}
        enableDamping
        dampingFactor={0.08}
        autoRotate={!!props.autoRotate}
        autoRotateSpeed={0.55}
        minDistance={0.2}
        maxDistance={4.5}
        maxPolarAngle={props.stage === 'room' ? Math.PI * 0.95 : Math.PI * 0.53}
      />
      <PhotoMode
        active={!!props.photo}
        sceneKey={`${props.pipe}-${props.component}-${props.npsIndex}-${props.thicknessIn}-${props.insulation}-${props.jacket}-${props.facing}-${props.service}-${props.view}-${props.stage}-${(props.hidden ?? []).join()}`}
        onProgress={props.onPhotoProgress}
      />
      {!props.photo && (
      <EffectComposer multisampling={0} autoClear={false}>
        <N8AO aoRadius={0.06} distanceFalloff={0.5} intensity={2.2} quality={props.mobile ? 'medium' : 'high'} halfRes={!!props.mobile} />
        <Outline blur edgeStrength={4} visibleEdgeColor={0xffd27a} hiddenEdgeColor={0x7a6232} xRay />
        {props.sim ? <Bloom mipmapBlur luminanceThreshold={1.05} luminanceSmoothing={0.25} intensity={0.7} radius={0.7} /> : <></>}
        <SMAA />
        <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        <Vignette offset={0.35} darkness={0.35} />
      </EffectComposer>
      )}
      </Selection>
    </Canvas>
  )
}
