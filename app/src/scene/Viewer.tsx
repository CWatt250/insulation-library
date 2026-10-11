import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import { Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { buildAssembly, buildCradle, splitByMaterial, type AssemblyParams } from '../geo/assembly'
import { PhotoMode, type PhotoProgress } from './PhotoMode'
import { Callouts } from './Callouts'
import { MechRoom, ROOM } from './MechRoom'
import { PhysicalCamera } from 'three-gpu-pathtracer'
import { buildSlots, cradleMat, padMat, pbr, setMaxAnisotropy } from '../materials/library'

export interface ViewerProps extends AssemblyParams {
  stage: 'studio' | 'plant' | 'room'
  /** Phone: lighter render settings. */
  mobile?: boolean
  photo?: boolean
  onPhotoProgress?: (p: PhotoProgress) => void
  cam?: [number, number, number]
  target?: [number, number, number]
}

const FLOOR_Y = -0.42

function Run(props: ViewerProps) {
  const asm = useMemo(
    () => {
      const a = buildAssembly({ ...props, span: props.stage === 'room' ? ROOM.half * 2 - 0.02 : undefined })
      const split = splitByMaterial(a.parts.map((p) => (p.geometry.index ? p.geometry.toNonIndexed() : p.geometry)))
      a.parts.forEach((p) => p.geometry.dispose())
      return { ...a, meshes: split }
    },
    [props.component, props.npsIndex, props.thicknessIn, props.insulation, props.jacket, props.view, props.stage === 'room'], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const slots = useMemo(() => buildSlots(props.insulation, props.jacket), [props.insulation, props.jacket])
  useEffect(() => () => asm.meshes.forEach((m) => m.geometry.dispose()), [asm])
  useEffect(() => () => slots.forEach((m) => m.dispose()), [slots])
  const groupRef = useRef<THREE.Group>(null)
  return (
    <>
    <group ref={groupRef} rotation={[0, Math.PI / 2, 0]} position={[-(asm.zMin + asm.zMax) / 2, 0, 0]}>
      <group name="assembly">
        {asm.meshes.map((m) => (
          <mesh key={m.mat} geometry={m.geometry} material={slots[m.mat]} castShadow receiveShadow />
        ))}
      </group>
      {props.stage !== 'room' && <Cradles radius={asm.outerRadius} stations={asm.cradles} />}
    </group>
    {props.stage === 'room' && (
      <MechRoom
        stations={asm.cradles.map((z) => z - (asm.zMin + asm.zMax) / 2)}
        radius={asm.outerRadius}
        pipeRadius={asm.outerRadius}
      />
    )}
    <Callouts items={asm.callouts} parent={groupRef} />
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
}

/** Mech room: eye height (1.6 m above the floor) looking up at the overhead line. */
const ROOM_VIEWS: Record<AssemblyParams['component'], { cam: [number, number, number]; target: [number, number, number] }> = {
  straight: { cam: [1.9, -0.95, 2.6], target: [-0.2, 0.05, -0.3] },
  elbow: { cam: [1.9, -0.6, 2.9], target: [0.0, 0.25, -0.2] },
  valve: { cam: [1.5, -0.9, 2.3], target: [0, 0.05, -0.1] },
}

const VIEWS: Record<AssemblyParams['component'], { cam: [number, number, number]; target: [number, number, number] }> = {
  straight: { cam: [1.72, 0.66, 1.64], target: [0.16, -0.08, 0] },
  elbow: { cam: [1.9, 1.05, 2.3], target: [0.0, 0.24, 0] },
  valve: { cam: [1.15, 0.62, 1.4], target: [0, 0.08, 0] },
}

/**
 * Presets are framed for a ~1.6 landscape aspect. On narrower screens (phones
 * in portrait) widen the vertical FOV so the horizontal coverage stays the same.
 */
function applyFov(camera: THREE.PerspectiveCamera) {
  const base = (camera.userData.baseFov as number | undefined) ?? 30
  // phones have no side panels to frame around, so they can cover less width
  const coverage = (camera.userData.coverage as number | undefined) ?? 1
  const aspect = camera.aspect || 1.6
  const want = 1.6 * coverage
  const fov = aspect >= want ? base : (2 * Math.atan((Math.tan((base * Math.PI) / 360) * want) / aspect) * 180) / Math.PI
  camera.fov = Math.min(fov, 80)
  camera.updateProjectionMatrix()
}

/** Frames the assembly when the component changes (URL cam/tgt override for screenshots). */
function CameraRig({ component, view, stage, cam, target }: Pick<ViewerProps, 'component' | 'view' | 'stage' | 'cam' | 'target'>) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null
  useEffect(() => {
    const v = (stage === 'room' && view !== 'layers' ? ROOM_VIEWS : view === 'layers' ? LAYER_VIEWS : VIEWS)[component]
    const pc = camera as THREE.PerspectiveCamera
    pc.userData.baseFov = stage === 'room' && view !== 'layers' ? 52 : 30
    applyFov(pc)
    camera.position.set(...(cam ?? v.cam))
    if (controls) {
      controls.target.set(...(target ?? v.target))
      controls.update()
    }
  }, [component, view === 'layers', stage === 'room', camera, controls]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

function RendererSetup({ mobile }: { mobile?: boolean }) {
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  // R3F leaves aspect alone on cameras passed in as instances.
  useEffect(() => {
    camera.userData.coverage = mobile ? 0.68 : 1
    camera.aspect = size.width / size.height
    applyFov(camera)
  }, [camera, size, mobile])
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
      shadows="variance"
      dpr={props.mobile ? [1, 1.5] : [1, 2]}
      camera={camera}
      gl={{ antialias: false, toneMapping: THREE.NoToneMapping, powerPreference: 'high-performance' }}
    >
      <RendererSetup mobile={props.mobile} />
      <CameraRig component={props.component} view={props.view} stage={props.stage} cam={props.cam} target={props.target} />
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
        <Run {...props} />
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
        minDistance={0.2}
        maxDistance={4.5}
        maxPolarAngle={props.stage === 'room' ? Math.PI * 0.95 : Math.PI * 0.53}
      />
      <PhotoMode
        active={!!props.photo}
        sceneKey={`${props.component}-${props.npsIndex}-${props.thicknessIn}-${props.insulation}-${props.jacket}-${props.view}-${props.stage}`}
        onProgress={props.onPhotoProgress}
      />
      {!props.photo && (
      <EffectComposer multisampling={0}>
        <N8AO aoRadius={0.06} distanceFalloff={0.5} intensity={2.2} quality={props.mobile ? 'medium' : 'high'} halfRes={!!props.mobile} />
        <SMAA />
        <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        <Vignette offset={0.35} darkness={0.35} />
      </EffectComposer>
      )}
    </Canvas>
  )
}
