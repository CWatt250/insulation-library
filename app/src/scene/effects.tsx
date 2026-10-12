import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import type { CondensationStatus, SimMode } from '../sim/types'

/**
 * Simulation overlays, built in the assembly's local frame (pipe axis on +z,
 * θ = 0 → +x, θ = 90° → +y). Each is driven by calculated values:
 *  - HeatWaves:    soft orange waves rising off a hot surface; fewer and fainter as heat loss drops
 *  - AirArrows:    blue airflow arrows carrying heat into a cold surface
 *  - SurfaceTint:  warm glow on a hot bare pipe, icy tint on a cold one
 *  - Condensation: droplets that form, grow, run down and drip — only while the
 *                  calculated surface is below the dew point; they evaporate when it isn't
 * The thermal false-colour material lives in thermal.ts.
 */

/** What one exposed surface is doing, from the engine. */
export interface ZoneState {
  /** 0–1 heat-flow strength (sim/model.ts rayIntensity). */
  intensity: number
  status: CondensationStatus
  /** Surface below the dew point. */
  condensing: boolean
  /** Condensation rate, g/(m²·h). */
  rate: number
  /** Below the dew point and below 32°F. */
  frost: boolean
}

export interface SimVisual extends ZoneState {
  mode: SimMode
  /** Show the bare pipe (insulation layers hidden). */
  bare: boolean
  thermal: boolean
  processF: number
  ambientF: number
  surfaceF: number
  dewF: number
  /** Normalised radial profile through the insulation: s = 0 at the pipe, 1 at the insulation OD. */
  profile: { s: number; tF: number }[]
  /** The bare pipe stubs that stick out past the insulation, when insulated. */
  stub: ZoneState | null
  /** The valve or flange pair itself (covered or bare), when the component has one. */
  fitting: ZoneState | null
  /** The fitting is left uncovered. */
  fittingBare: boolean
  /** On-screen tag on the bare stub, so its state reads apart from the insulated run's. */
  stubTag?: { text: string; tone: 'hot' | 'wet' | 'frost' | 'dry' }
}

export interface RunExtent {
  /** Exposed surface radius, m. */
  radius: number
  /** Exposed surface along z (m). */
  z0: number
  z1: number
  /** Cutaway wedge (θ range) applied for z ≥ zWedge, or null. */
  wedge: [number, number] | null
  zWedge: number
  /** Floor height in the local frame. */
  floorY: number
  /** The zone's axis points up (riser, tee branch): heat rises along it and water runs down it. */
  vertical?: boolean
  /** Rectangular duct: half-width (x) and half-height (y) of the exposed surface, m. `radius` is then the smaller. */
  box?: [number, number]
}

/** Point on the exposed surface at angle θ and its outward normal: the cylinder, or the duct's flat faces. */
function surfacePoint(e: RunExtent, theta: number, p: THREE.Vector3, n: THREE.Vector3) {
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  if (!e.box) {
    n.set(c, s, 0)
    p.copy(n).multiplyScalar(e.radius)
    return
  }
  const tx = e.box[0] / Math.max(Math.abs(c), 1e-4)
  const ty = e.box[1] / Math.max(Math.abs(s), 1e-4)
  if (tx < ty) {
    p.set(c * tx, s * tx, 0)
    n.set(Math.sign(c), 0, 0)
  } else {
    p.set(c * ty, s * ty, 0)
    n.set(0, Math.sign(s), 0)
  }
}

/**
 * On a duct, spread angles evenly by distance round the perimeter rather than by
 * angle (which would bunch effects at the corners of a wide duct).
 */
function perimeterAngle(e: RunExtent, theta: number) {
  if (!e.box) return theta
  const [w, h] = e.box
  const per = 4 * (w + h)
  // walk the perimeter from θ = 0 (right face, mid-height) anticlockwise
  let d = ((((theta / TAU) % 1) + 1) % 1) * per
  const seg: [number, (t: number) => [number, number]][] = [
    [h, (t) => [w, t]],
    [2 * w, (t) => [w - t, h]],
    [2 * h, (t) => [-w, h - t]],
    [2 * w, (t) => [-w + t, -h]],
    [h, (t) => [w, -h + t]],
  ]
  for (const [len, at] of seg) {
    if (d <= len) {
      const [x, y] = at(d)
      return Math.atan2(y, x)
    }
    d -= len
  }
  return theta
}

/** GLSL twin of surfacePoint; uBox = 0 for a round surface of radius uBoxR. */
const surfGlsl = /* glsl */ `
  uniform vec2 uBox;
  uniform float uBoxR;
  void surf(float a, out vec3 p, out vec3 n) {
    vec3 d = vec3(cos(a), sin(a), 0.0);
    if (uBox.x <= 0.0) { p = d * uBoxR; n = d; return; }
    float tx = uBox.x / max(abs(d.x), 1e-4);
    float ty = uBox.y / max(abs(d.y), 1e-4);
    if (tx < ty) { p = d * tx; n = vec3(sign(d.x), 0.0, 0.0); }
    else { p = d * ty; n = vec3(0.0, sign(d.y), 0.0); }
  }
`

/** Deterministic PRNG so effects don't reshuffle on every render. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TAU = Math.PI * 2
const wrap = (t: number) => ((t % TAU) + TAU) % TAU
const inWedge = (theta: number, z: number, e: RunExtent) => {
  if (!e.wedge || z < e.zWedge) return false
  const t = wrap(theta)
  return t >= e.wedge[0] && t <= e.wedge[1]
}
const noRaycast = () => null

/** Premultiplied blending: glows add up, while alpha still darkens what is behind a little. */
function glowMaterial(vertexShader: string, fragmentShader: string, uniforms: Record<string, THREE.IUniform>) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  })
}

/** Cutaway wedge test for the shell shaders, in the assembly's local frame. */
const wedgeGlsl = /* glsl */ `
  uniform vec2 uWedge;
  uniform float uZWedge;
  bool cutAway(vec3 p) {
    if (uWedge.y <= uWedge.x || p.z < uZWedge) return false;
    float t = atan(p.y, p.x);
    if (t < 0.0) t += 6.2831853;
    return t >= uWedge.x && t <= uWedge.y;
  }
`

/** Evenly spread instances on rings along the run; `angles` picks θ for each ring. */
function ringLayout(e: RunExtent, spacing: number, angles: (ring: number, rand: () => number) => number[], seed: number) {
  const rand = rng(seed)
  const len = e.z1 - e.z0
  const rings = Math.max(1, Math.round(len / spacing))
  const out: { theta: number; z: number; ring: number; rand: number }[] = []
  for (let k = 0; k < rings; k++) {
    const z = e.z0 + ((k + 0.5) / rings) * len
    for (const theta0 of angles(k, rand)) {
      const theta = perimeterAngle(e, theta0)
      const zz = z + (rand() - 0.5) * (len / rings) * 0.35
      if (!inWedge(theta, zz, e)) out.push({ theta, z: zz, ring: k, rand: rand() })
    }
  }
  return out
}

function ribbonGeometry(segments: number) {
  const g = new THREE.InstancedBufferGeometry()
  const u: number[] = []
  const v: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= segments; i++) {
    for (const s of [-1, 1]) {
      u.push(i / segments)
      v.push(s)
    }
    if (i < segments) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(u.length * 3), 3))
  g.setAttribute('aU', new THREE.Float32BufferAttribute(u, 1))
  g.setAttribute('aV', new THREE.Float32BufferAttribute(v, 1))
  g.setIndex(idx)
  return g
}

// ------------------------------------------------------------- heat waves

const waveVert = /* glsl */ `
  attribute float aU;
  attribute float aV;
  attribute vec4 iA; // theta, z, phase, seed
  uniform float uTime;
  uniform float uR0;
  uniform float uLen;
  uniform float uTravel;
  uniform float uWidth;
  uniform float uAmp;
  uniform float uActive;
  uniform float uRise;
  uniform vec3 uUp;
  varying float vU;
  varying float vV;
  varying float vFade;
  ${surfGlsl}
  void main() {
    float on = step(fract(iA.w * 13.37), uActive);
    float p = fract(uTime * 0.16 + iA.z);
    vec3 base;
    vec3 radial;
    surf(iA.x, base, radial);
    // heat leaves outward and the warm air carries it up
    vec3 D = normalize(radial + uUp * uRise);
    float s = p * uTravel + aU * uLen;
    vec3 local = base + radial * (uR0 - uBoxR) + D * s + vec3(0.0, 0.0, iA.y);
    vec4 world = modelMatrix * vec4(local, 1.0);
    vec3 dir = normalize(mat3(modelMatrix) * D);
    vec3 toCam = normalize(cameraPosition - world.xyz);
    vec3 side = normalize(cross(dir, toCam));
    // the wave: a gentle sine that drifts along the ribbon
    float env = sin(3.14159 * aU);
    float wave = sin(6.2831853 * (aU * 1.3 - uTime * 0.55) + iA.w * 6.2831853);
    world.xyz += side * (wave * uAmp * env + aV * uWidth * (0.55 + 0.45 * env));
    gl_Position = projectionMatrix * viewMatrix * world;
    vU = aU;
    vV = aV;
    vFade = on * smoothstep(0.0, 0.25, p) * (1.0 - smoothstep(0.55, 1.0, p));
  }
`
const waveFrag = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uEdge;
  uniform float uOpacity;
  varying float vU;
  varying float vV;
  varying float vFade;
  void main() {
    float across = exp(-vV * vV * 3.2);
    float ends = smoothstep(0.0, 0.3, vU) * smoothstep(1.0, 0.6, vU);
    float a = across * ends * vFade * uOpacity;
    vec3 c = mix(uEdge, uCore, across * across) * (1.0 + 0.8 * across);
    gl_FragColor = vec4(c * a, a);
  }
`

export function HeatWaves({ extent, intensity }: { extent: RunExtent; intensity: number }) {
  const geo = useMemo(() => {
    const g = ribbonGeometry(24)
    // waves leave the sides and the top; heat off the underside wraps round and rises too
    const spacing = Math.max(0.07, extent.radius * 1.6)
    const list = ringLayout(extent, spacing, (k, r) => {
      if (extent.vertical) return Array.from({ length: 6 }, (_, j) => ((j + 0.5 * (k % 2)) / 6) * TAU + (r() - 0.5) * 0.3)
      const n = 5
      return Array.from({ length: n }, (_, j) => (-25 + (230 * (j + 0.5 * (k % 2) + 0.25)) / n + (r() - 0.5) * 14) * (Math.PI / 180))
    }, 3)
    const a = new Float32Array(list.length * 4)
    list.forEach((w, i) => a.set([w.theta, w.z, (w.ring * 0.21 + w.rand * 0.5) % 1, w.rand], i * 4))
    g.setAttribute('iA', new THREE.InstancedBufferAttribute(a, 4))
    g.instanceCount = list.length
    return g
  }, [extent])
  useEffect(() => () => geo.dispose(), [geo])
  const mat = useMemo(() => glowMaterial(waveVert, waveFrag, {
    uTime: { value: 0 }, uR0: { value: 0.05 }, uLen: { value: 0.1 }, uTravel: { value: 0.1 }, uWidth: { value: 0.01 },
    uAmp: { value: 0.01 }, uActive: { value: 1 }, uRise: { value: 0.8 }, uOpacity: { value: 0.5 }, uUp: { value: new THREE.Vector3(0, 1, 0) },
    uBox: { value: new THREE.Vector2() }, uBoxR: { value: 0.05 },
    uCore: { value: new THREE.Color('#ffd08a') }, uEdge: { value: new THREE.Color('#ff6a1a') },
  }), [])
  useEffect(() => () => mat.dispose(), [mat])
  const i = Math.min(1, Math.max(0, intensity))
  const u = mat.uniforms
  const size = Math.min(Math.max(extent.radius, 0.03), 0.16)
  u.uR0.value = extent.radius + 0.004
  u.uBoxR.value = extent.radius
  ;(u.uBox.value as THREE.Vector2).set(extent.box?.[0] ?? 0, extent.box?.[1] ?? 0)
  u.uLen.value = size * (0.9 + 0.9 * i)
  u.uTravel.value = size * (0.5 + 1.1 * i)
  u.uWidth.value = size * 0.16
  u.uAmp.value = size * 0.12
  // no floor: how many waves show, and how bright, follows the heat flow
  u.uActive.value = i
  u.uOpacity.value = 0.3 + 0.4 * i
  ;(u.uUp.value as THREE.Vector3).set(0, extent.vertical ? 0 : 1, extent.vertical ? 1 : 0)
  u.uRise.value = extent.vertical ? 1.4 : 0.8
  useFrame((_, dt) => { u.uTime.value += dt })
  if (i < 0.02) return null
  return <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={5} raycast={noRaycast} />
}

// ------------------------------------------------------------ air arrows

const arrowVert = /* glsl */ `
  attribute float aU;
  attribute float aV;
  attribute float aW;
  attribute float aEdge;
  attribute vec4 iA; // theta, z, phase, seed
  uniform float uTime;
  uniform float uR0;
  uniform float uLen;
  uniform float uTravel;
  uniform float uWidth;
  uniform float uActive;
  varying float vU;
  varying float vEdge;
  varying float vFade;
  ${surfGlsl}
  void main() {
    float on = step(fract(iA.w * 7.31), uActive);
    float p = fract(uTime * 0.22 + iA.z);
    vec3 base;
    vec3 radial;
    surf(iA.x, base, radial);
    vec3 tang = vec3(-radial.y, radial.x, 0.0);
    // the head (u = 1) points at the pipe; the whole arrow drifts inward
    float off = uR0 - uBoxR + 0.006 + (1.0 - p) * uTravel + (1.0 - aU) * uLen;
    float curl = (fract(iA.w * 3.7) - 0.5) * 0.5;
    vec3 local = base + radial * off + tang * curl * uLen * aU * (1.0 - aU) + vec3(0.0, 0.0, iA.y);
    vec4 world = modelMatrix * vec4(local, 1.0);
    vec3 dir = normalize(mat3(modelMatrix) * radial);
    vec3 toCam = normalize(cameraPosition - world.xyz);
    vec3 side = normalize(cross(dir, toCam));
    world.xyz += side * aV * aW * uWidth;
    gl_Position = projectionMatrix * viewMatrix * world;
    vU = aU;
    vEdge = aEdge;
    vFade = on * smoothstep(0.0, 0.3, p) * (1.0 - smoothstep(0.75, 1.0, p));
  }
`
const arrowFrag = /* glsl */ `
  uniform vec3 uHead;
  uniform vec3 uTail;
  uniform float uOpacity;
  varying float vU;
  varying float vEdge;
  varying float vFade;
  void main() {
    float soft = smoothstep(0.0, 0.45, vEdge);
    float a = soft * smoothstep(0.0, 0.55, vU) * vFade * uOpacity;
    vec3 c = mix(uTail, uHead, smoothstep(0.3, 1.0, vU)) * (1.0 + 0.6 * vEdge);
    gl_FragColor = vec4(c * a, a);
  }
`

/** Flat arrow: tapered shaft then a head. aEdge is 0 on the outline and 1 inside, for soft edges. */
function arrowGeometry() {
  const g = new THREE.InstancedBufferGeometry()
  const U: number[] = [], V: number[] = [], W: number[] = [], E: number[] = []
  const vert = (u: number, v: number, w: number, e: number) => {
    U.push(u); V.push(v); W.push(w); E.push(e)
    return U.length - 1
  }
  const idx: number[] = []
  const shaftEnd = 0.68
  const N = 8
  let prev: number[] | null = null
  for (let i = 0; i <= N; i++) {
    const u = (shaftEnd * i) / N
    const w = 0.45 + 0.55 * (u / shaftEnd)
    const row = [vert(u, -1, w, 0), vert(u, 0, w, 1), vert(u, 1, w, 0)]
    if (prev) idx.push(prev[0], row[0], prev[1], row[0], row[1], prev[1], prev[1], row[1], prev[2], row[1], row[2], prev[2])
    prev = row
  }
  // head: a fan round an interior point
  const c = vert(shaftEnd + 0.1, 0, 1, 1)
  const bl = vert(shaftEnd, -1, 2.4, 0)
  const br = vert(shaftEnd, 1, 2.4, 0)
  const tip = vert(1, 0, 0, 0)
  idx.push(c, bl, tip, c, tip, br, c, br, bl)
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(U.length * 3), 3))
  g.setAttribute('aU', new THREE.Float32BufferAttribute(U, 1))
  g.setAttribute('aV', new THREE.Float32BufferAttribute(V, 1))
  g.setAttribute('aW', new THREE.Float32BufferAttribute(W, 1))
  g.setAttribute('aEdge', new THREE.Float32BufferAttribute(E, 1))
  g.setIndex(idx)
  return g
}

/** Cold work reads light and icy; condensate reads deep teal, so the two modes never look alike. */
const COOL = {
  cold: { head: '#f0faff', tail: '#86cdff', tint: '#a5dcff', rim: '#f2fbff' },
  condensate: { head: '#b6f5e8', tail: '#0f9e8e', tint: '#14897f', rim: '#6ee7d2' },
}

export function AirArrows({ extent, intensity, mode }: { extent: RunExtent; intensity: number; mode: SimMode }) {
  const geo = useMemo(() => {
    const g = arrowGeometry()
    const spacing = Math.max(0.13, extent.radius * 2.8)
    const list = ringLayout(extent, spacing, (k, r) => {
      const n = 5
      return Array.from({ length: n }, (_, j) => ((j + (k % 2) * 0.5) / n) * TAU + (r() - 0.5) * 0.25)
    }, 5)
    const a = new Float32Array(list.length * 4)
    list.forEach((w, i) => a.set([w.theta, w.z, (w.ring * 0.17 + w.rand * 0.6) % 1, w.rand], i * 4))
    g.setAttribute('iA', new THREE.InstancedBufferAttribute(a, 4))
    g.instanceCount = list.length
    return g
  }, [extent])
  useEffect(() => () => geo.dispose(), [geo])
  const mat = useMemo(() => glowMaterial(arrowVert, arrowFrag, {
    uTime: { value: 0 }, uR0: { value: 0.05 }, uLen: { value: 0.1 }, uTravel: { value: 0.05 }, uWidth: { value: 0.006 },
    uActive: { value: 1 }, uOpacity: { value: 0.5 },
    uBox: { value: new THREE.Vector2() }, uBoxR: { value: 0.05 },
    uHead: { value: new THREE.Color('#d6efff') }, uTail: { value: new THREE.Color('#3b7fe0') },
  }), [])
  useEffect(() => () => mat.dispose(), [mat])
  const i = Math.min(1, Math.max(0, intensity))
  const u = mat.uniforms
  const size = Math.min(Math.max(extent.radius, 0.03), 0.14)
  u.uR0.value = extent.radius
  u.uBoxR.value = extent.radius
  ;(u.uBox.value as THREE.Vector2).set(extent.box?.[0] ?? 0, extent.box?.[1] ?? 0)
  u.uLen.value = size * (0.6 + 0.5 * i)
  u.uTravel.value = size * (0.3 + 0.35 * i)
  u.uWidth.value = size * 0.05
  u.uActive.value = 0.12 + 0.88 * i
  u.uOpacity.value = 0.12 + 0.3 * i
  const pal = COOL[mode === 'condensate' ? 'condensate' : 'cold']
  ;(u.uHead.value as THREE.Color).set(pal.head)
  ;(u.uTail.value as THREE.Color).set(pal.tail)
  useFrame((_, dt) => { u.uTime.value += dt })
  if (i < 0.02) return null
  return <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={5} raycast={noRaycast} />
}

// ----------------------------------------------------------- surface tint

const shellVert = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vP;
  varying float vU;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    vP = position;
    vU = uv.y;
    gl_Position = projectionMatrix * mv;
  }
`
const tintFrag = /* glsl */ `
  ${wedgeGlsl}
  uniform vec3 uColor;
  uniform vec3 uRim;
  uniform float uAmount;
  uniform float uTime;
  uniform float uRimK;
  uniform mat4 uLocal;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vP;
  varying float vU;
  void main() {
    vec3 p = (uLocal * vec4(vP, 1.0)).xyz;
    if (cutAway(p)) discard;
    // a flat face seen edge-on would go all rim: damp it on ducts
    float f = (1.0 - abs(dot(normalize(vN), normalize(vV)))) * uRimK;
    float flicker = 0.92 + 0.08 * sin(uTime * 3.0 + p.z * 40.0);
    vec3 c = mix(uColor, uRim, f) * flicker;
    float a = uAmount * (0.55 + 0.45 * f) * smoothstep(0.0, 0.03, vU) * smoothstep(1.0, 0.97, vU);
    gl_FragColor = vec4(c * a, a * 0.6);
  }
`

/** A thin shell over the exposed surface: a glow on a hot bare pipe that follows heat flux; an icy tint on a cold one. */
export function SurfaceTint({ extent, mode, intensity }: { extent: RunExtent; mode: SimMode; intensity: number }) {
  const hot = mode === 'hot'
  const boxed = !!extent.box
  const geo = useMemo(() => {
    if (boxed) return rectTube()
    const g = new THREE.CylinderGeometry(1, 1, 1, 96, 1, true)
    g.rotateX(Math.PI / 2)
    return g
  }, [boxed])
  useEffect(() => () => geo.dispose(), [geo])
  const mat = useMemo(() => glowMaterial(shellVert, tintFrag, {
    uColor: { value: new THREE.Color() }, uRim: { value: new THREE.Color() }, uAmount: { value: 0 }, uTime: { value: 0 },
    uLocal: { value: new THREE.Matrix4() }, uRimK: { value: 1 },
    uWedge: { value: new THREE.Vector2() }, uZWedge: { value: 1e9 },
  }), [])
  useEffect(() => () => mat.dispose(), [mat])
  const i = Math.min(1, Math.max(0, intensity))
  const len = extent.z1 - extent.z0
  const Rx = (extent.box?.[0] ?? extent.radius) * 1.004 + (extent.box ? 0.001 : 0)
  const Ry = (extent.box?.[1] ?? extent.radius) * 1.004 + (extent.box ? 0.001 : 0)
  const zc = (extent.z0 + extent.z1) / 2
  const u = mat.uniforms
  // shell vertices are unit-cylinder coordinates: map them back to the local frame for the wedge test
  ;(u.uLocal.value as THREE.Matrix4).compose(new THREE.Vector3(0, 0, zc), new THREE.Quaternion(), new THREE.Vector3(Rx, Ry, len))
  ;(u.uWedge.value as THREE.Vector2).set(extent.wedge?.[0] ?? 0, extent.wedge?.[1] ?? 0)
  u.uZWedge.value = extent.wedge ? extent.zWedge : 1e9
  const pal = COOL[mode === 'condensate' ? 'condensate' : 'cold']
  ;(u.uColor.value as THREE.Color).set(hot ? '#ff5a12' : pal.tint).multiplyScalar(hot ? 1.6 : mode === 'cold' ? 0.75 : 0.6)
  ;(u.uRim.value as THREE.Color).set(hot ? '#ffc070' : pal.rim).multiplyScalar(hot ? 2.2 : 0.9)
  u.uAmount.value = (hot ? i ** 1.6 * 0.85 : i ** 1.4 * 0.45) * (boxed ? 0.6 : 1)
  u.uRimK.value = boxed ? 0.3 : 1
  useFrame((_, dt) => { u.uTime.value += dt })
  if (i < 0.12) return null
  return <mesh geometry={geo} material={mat} position={[0, 0, zc]} scale={[Rx, Ry, len]} renderOrder={4} raycast={noRaycast} />
}

/** Open rectangular tube, ±1 in x and y, z from −½ to ½; uv.y runs along z like the cylinder's. */
function rectTube() {
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const faces: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]]
  for (const [nx, ny] of faces) {
    // two corners of the face edge, anticlockwise seen from outside
    const a: [number, number] = nx ? [nx, -nx] : [ny, ny]
    const b: [number, number] = nx ? [nx, nx] : [-ny, ny]
    const quad: [number, number, number][] = [[a[0], a[1], -0.5], [b[0], b[1], -0.5], [b[0], b[1], 0.5], [a[0], a[1], -0.5], [b[0], b[1], 0.5], [a[0], a[1], 0.5]]
    for (const [x, y, z] of quad) {
      pos.push(x, y, z)
      nor.push(nx, ny, 0)
      uv.push(0, z + 0.5)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  return g
}

// ----------------------------------------------------------- condensation

interface Bead { theta: number; z: number; r: number; max: number; state: 0 | 1 | 2; speed: number }
interface Hang { x: number; z: number; vol: number; fall: number; fallV: number; puddle: number }

const MAX_BEADS = 520

const dropVert = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`
const dropFrag = /* glsl */ `
  uniform float uFrost;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(vV);
    float ndv = max(dot(n, v), 0.0);
    float rim = pow(1.0 - ndv, 1.6);
    vec3 l = normalize(vec3(-0.35, 0.8, 0.5));
    vec3 h = normalize(l + v);
    float spec = pow(max(dot(n, h), 0.0), 90.0);
    float glint = pow(max(dot(n, normalize(vec3(0.4, -0.6, 0.7) + v)), 0.0), 30.0) * 0.25;
    if (uFrost > 0.5) {
      vec3 c = vec3(0.86, 0.9, 0.95) * (0.65 + 0.35 * ndv);
      gl_FragColor = vec4(c, 0.92);
      return;
    }
    // a bead lenses its surroundings: dark at the edge, clear in the middle, one bright highlight
    vec3 body = mix(vec3(0.62, 0.74, 0.84) * 0.22, vec3(0.03, 0.05, 0.08), rim);
    vec3 c = body + vec3(1.0) * spec * 2.4 + vec3(0.7, 0.85, 1.0) * glint;
    float a = clamp(0.16 + 0.62 * rim + spec, 0.0, 1.0);
    gl_FragColor = vec4(c * a, a);
  }
`
const X_AXIS = new THREE.Vector3(1, 0, 0)

/** How wet the surface is getting: 0 (just condensing) to 1 (heavy), from the condensation rate. */
const wetness = (rate: number) => Math.min(1, Math.sqrt(Math.max(rate, 0) / 150))

/**
 * Condensate on one exposed surface. Beads nucleate, grow at a pace set by the
 * calculated condensation rate, run down round the pipe once heavy enough, feed
 * hanging drops on the underside, and those drip to the floor. When the surface
 * is above the dew point nothing new forms and what is there evaporates.
 * Bead sizes are exaggerated (scaled with the pipe) so they read on screen.
 */
export function Condensation({ extent, zone }: { extent: RunExtent; zone: ZoneState }) {
  const unit = Math.min(Math.max(extent.radius * 0.06, 0.0026), 0.0068)
  const sim = useMemo(() => {
    const rand = rng(91)
    const nHang = Math.max(2, Math.round((extent.z1 - extent.z0) / Math.max(0.07, extent.radius * 1.6)))
    const hangs: Hang[] = Array.from({ length: nHang }, (_, k) => ({
      // a duct's flat underside drips across its width
      x: extent.box ? (rand() - 0.5) * 1.6 * extent.box[0] : 0,
      z: extent.z0 + ((k + 0.5 + (rand() - 0.5) * 0.4) / nHang) * (extent.z1 - extent.z0),
      vol: 0, fall: -1, fallV: 0, puddle: 0,
    }))
    const beads: Bead[] = Array.from({ length: MAX_BEADS }, () => ({ theta: 0, z: 0, r: 0, max: 0, state: 0, speed: 0 }))
    return { rand, beads, hangs, spawnAcc: 0 }
  }, [extent])
  const beadRef = useRef<THREE.InstancedMesh>(null)
  const dropRef = useRef<THREE.InstancedMesh>(null)
  const puddleRef = useRef<THREE.InstancedMesh>(null)
  const zoneRef = useRef(zone)
  zoneRef.current = zone
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(), p: new THREE.Vector3(), n: new THREE.Vector3(), z: new THREE.Vector3(0, 0, 1) }), [])

  const bottom = extent.box ? extent.box[1] : extent.radius
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const zs = zoneRef.current
    const w = zs.condensing ? wetness(zs.rate) : 0
    const frost = zs.frost
    const { beads, hangs, rand } = sim
    const target = zs.condensing ? Math.round(MAX_BEADS * (0.25 + 0.75 * w)) : 0
    let live = 0
    for (const b of beads) if (b.state) live++
    // nucleation
    if (live < target) {
      sim.spawnAcc += dt * (40 + 260 * w)
      while (sim.spawnAcc > 1 && live < target) {
        sim.spawnAcc -= 1
        const b = beads.find((x) => x.state === 0)
        if (!b) break
        let theta = rand() * TAU
        const z = extent.z0 + rand() * (extent.z1 - extent.z0)
        if (inWedge(theta, z, extent)) theta = Math.PI * 1.5 + (rand() - 0.5)
        Object.assign(b, { theta, z, r: unit * 0.15, max: unit * (0.9 + 1.0 * rand()) * (frost ? 0.8 : 1), state: 1, speed: 0 })
        live++
      }
    } else sim.spawnAcc = 0
    const grow = unit * (0.12 + 0.9 * w) * (frost ? 0.5 : 1)
    for (const b of beads) {
      if (!b.state) continue
      if (!zs.condensing) {
        // above the dew point: evaporate
        b.r -= unit * 0.9 * dt
        if (b.r <= 0) b.state = 0
        continue
      }
      if (b.state === 1) {
        b.r = Math.min(b.max, b.r + grow * dt * (0.6 + 0.8 * rand()))
        // heavy beads let go and run, except frost, which stays put
        if (!frost && b.r >= b.max * 0.98 && rand() < dt * (0.4 + 1.6 * w)) b.state = 2
      } else if (extent.vertical) {
        // a riser: beads run straight down the pipe and off the bottom of the zone
        b.speed = Math.min(b.speed + dt * 3, 1.6)
        b.z -= b.speed * dt * unit * 14
        b.r += grow * dt * 0.4
        if (b.z < extent.z0) b.state = 0
      } else {
        // running down round the pipe toward the underside (θ = 270°)
        const t = wrap(b.theta)
        const toward = t > Math.PI / 2 && t < Math.PI * 1.5 ? 1 : -1
        const pull = Math.abs(Math.cos(t)) + 0.25
        b.speed = Math.min(b.speed + dt * 6 * pull, 3.2)
        b.theta += toward * b.speed * dt * (unit / extent.radius) * 9
        b.r += grow * dt * 0.4
        const under = extent.box
          ? Math.abs(Math.sin(wrap(b.theta))) * extent.box[0] > Math.abs(Math.cos(wrap(b.theta))) * extent.box[1] + 1e-6 && Math.sin(wrap(b.theta)) < 0
          : Math.abs(wrap(b.theta) - Math.PI * 1.5) < 0.12
        if (under) {
          // joins the nearest hanging drop
          let h = hangs[0]
          for (const x of hangs) if (Math.abs(x.z - b.z) < Math.abs(h.z - b.z)) h = x
          h.vol += (b.r / unit) ** 3 * 0.08
          b.state = 0
        }
      }
    }
    // hanging drops and drips
    for (const h of extent.vertical ? [] : hangs) {
      if (!zs.condensing) h.vol = Math.max(0, h.vol - dt * 0.5)
      if (h.fall < 0 && h.vol >= 1 && !frost) {
        h.fall = 0
        h.fallV = 0
        h.vol = 0.15
      }
      if (h.fall >= 0) {
        // slowed fall so the eye can follow it
        h.fallV += 9.8 * 0.35 * dt
        h.fall += h.fallV * dt
        if (-bottom - h.fall < extent.floorY) {
          h.fall = -1
          h.puddle = Math.min(1, h.puddle + 0.08)
          // the drop that fell under an odd slot lands in its neighbour's puddle
          const k = hangs.indexOf(h)
          if (k % 2 && hangs[k - 1]) hangs[k - 1].puddle = Math.min(1, hangs[k - 1].puddle + 0.08)
        }
      }
      if (!zs.condensing) h.puddle = Math.max(0, h.puddle - dt * 0.05)
    }
    // ---- write instances
    const bm = beadRef.current
    if (bm) {
      let n = 0
      for (const b of beads) {
        if (!b.state) continue
        surfacePoint(extent, b.theta, tmp.p, tmp.n)
        tmp.q.setFromUnitVectors(tmp.z, tmp.n)
        const stretch = b.state === 2 && !extent.vertical ? 1.5 : 1
        tmp.p.addScaledVector(tmp.n, b.r * 0.12)
        tmp.p.z = b.z
        tmp.s.set(b.r * stretch, b.r * (b.state === 2 && extent.vertical ? 1.5 : 1), b.r * (frost ? 0.45 : 0.6))
        tmp.m.compose(tmp.p, tmp.q, tmp.s)
        bm.setMatrixAt(n++, tmp.m)
      }
      bm.count = n
      bm.instanceMatrix.needsUpdate = true
    }
    const dm = dropRef.current
    if (dm) {
      let n = 0
      tmp.q.identity()
      for (const h of hangs) {
        if (h.vol > 0.05) {
          const r = unit * (0.6 + 1.1 * Math.min(h.vol, 1))
          tmp.p.set(h.x, -bottom - r * 0.9, h.z)
          tmp.s.set(r, r * (1.1 + 0.5 * Math.min(h.vol, 1)), r)
          tmp.m.compose(tmp.p, tmp.q, tmp.s)
          dm.setMatrixAt(n++, tmp.m)
        }
        if (h.fall >= 0) {
          const r2 = unit * 1.3
          tmp.p.set(h.x, -bottom - unit * 2 - h.fall, h.z)
          tmp.s.set(r2 * 0.85, r2 * 1.5, r2 * 0.85)
          tmp.m.compose(tmp.p, tmp.q, tmp.s)
          dm.setMatrixAt(n++, tmp.m)
        }
      }
      dm.count = n
      dm.instanceMatrix.needsUpdate = true
    }
    const pm = puddleRef.current
    if (pm) {
      let n = 0
      tmp.q.setFromAxisAngle(X_AXIS, -Math.PI / 2)
      for (let k = 0; k < hangs.length; k += 2) {
        const h = hangs[k]
        if (h.puddle <= 0.01) continue
        const r = (0.012 + 0.04 * h.puddle) * Math.min(1, 0.4 + extent.radius * 8)
        tmp.p.set(h.x, extent.floorY + 0.0015, h.z)
        tmp.s.set(r * 1.3, r, 1)
        tmp.m.compose(tmp.p, tmp.q, tmp.s)
        pm.setMatrixAt(n++, tmp.m)
      }
      pm.count = n
      pm.instanceMatrix.needsUpdate = true
    }
  })

  const geo = useMemo(() => new THREE.SphereGeometry(1, 16, 12), [])
  const disc = useMemo(() => new THREE.CircleGeometry(1, 40), [])
  useEffect(() => () => { geo.dispose(); disc.dispose() }, [geo, disc])
  const water = useMemo(() => {
    const m = glowMaterial(dropVert, dropFrag, { uFrost: { value: 0 } })
    m.depthWrite = false
    return m
  }, [])
  useEffect(() => () => water.dispose(), [water])
  water.uniforms.uFrost.value = zone.frost ? 1 : 0
  const puddleMat = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#0e1a22', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.55, clearcoat: 1, envMapIntensity: 1.5,
  }), [])
  useEffect(() => () => puddleMat.dispose(), [puddleMat])
  return (
    <>
      <instancedMesh ref={beadRef} args={[geo, water, MAX_BEADS]} count={0} frustumCulled={false} renderOrder={3} raycast={noRaycast} />
      <instancedMesh ref={dropRef} args={[geo, water, sim.hangs.length * 2]} count={0} frustumCulled={false} raycast={noRaycast} />
      <instancedMesh ref={puddleRef} args={[disc, puddleMat, sim.hangs.length]} count={0} frustumCulled={false} raycast={noRaycast} />
    </>
  )
}

/** Every overlay for one exposed surface. */
export function ZoneEffects({ extent, mode, zone }: { extent: RunExtent; mode: SimMode; zone: ZoneState }) {
  return (
    <>
      {mode === 'hot' ? <HeatWaves extent={extent} intensity={zone.intensity} /> : <AirArrows extent={extent} intensity={zone.intensity} mode={mode} />}
      <SurfaceTint extent={extent} mode={mode} intensity={zone.intensity} />
      {mode !== 'hot' && <Condensation extent={extent} zone={zone} />}
    </>
  )
}
