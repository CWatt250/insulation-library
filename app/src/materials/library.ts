import * as THREE from 'three'
import scales from '../data/textureScales.json'
import { INSULATION, type InsulationId, type JacketId } from '../data/catalog'
import type { PipeMaterial } from '../data/pipe'

export type { InsulationId, JacketId }

/**
 * PBR material factory. Every texture set lives in /tex/<name>/ and covers a
 * known physical size (textureScales.json, millimetres). Geometry UVs are in
 * metres, so `repeat = 1000 / tileMm` maps every texture at true scale.
 */

const loader = new THREE.TextureLoader()
const cache = new Map<string, THREE.Texture>()

/**
 * Phones (App's MOBILE_QUERY breakpoint) load the half-resolution copies in
 * tex-half/ (tools/half_textures.py): the same look at phone screen sizes for a
 * quarter of the download.
 */
export const TEXTURE_DIR = typeof matchMedia === 'function' && matchMedia('(max-width: 860px)').matches ? 'tex-half' : 'tex'
let maxAniso = 8

export function setMaxAnisotropy(n: number) {
  maxAniso = n
  cache.forEach((t) => {
    t.anisotropy = n
    t.needsUpdate = true
  })
}

function tex(name: string, map: 'albedo.webp' | 'normal.webp' | 'rough.webp') {
  const key = `${name}/${map}`
  let t = cache.get(key)
  if (!t) {
    t = loader.load(`${import.meta.env.BASE_URL}${TEXTURE_DIR}/${key}`)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = maxAniso
    if (map === 'albedo.webp') t.colorSpace = THREE.SRGBColorSpace
    const mm = (scales as Record<string, number>)[name] ?? 200
    t.repeat.setScalar(1000 / mm)
    cache.set(key, t)
  }
  return t
}

export interface PBROpts extends THREE.MeshPhysicalMaterialParameters {
  normalStrength?: number
}

export function pbr(name: string, { normalStrength = 1, ...params }: PBROpts = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    map: tex(name, 'albedo.webp'),
    normalMap: tex(name, 'normal.webp'),
    roughnessMap: tex(name, 'rough.webp'),
    roughness: 1, // roughnessMap is multiplied by this
    metalness: 0,
    vertexColors: true, // every sweep carries a per-piece tint (white by default)
    ...params,
  })
  m.normalScale.setScalar(normalStrength)
  return m
}

const plain = (params: THREE.MeshStandardMaterialParameters) =>
  new THREE.MeshStandardMaterial({ vertexColors: true, ...params })

// ----------------------------------------------------------------- catalogue

/** Material slots used by geometry groups. Every assembly mesh shares this layout. */
export const Slot = {
  PipeOuter: 0,
  PipeEnd: 1,
  PipeBore: 2,
  InsSkin: 3,
  InsCut: 4,
  JacketOuter: 5,
  JacketInner: 6,
  JacketEdge: 7,
  Band: 8,
  InsBore: 9,
  /** PVC fitting covers on elbows. */
  Cover: 10,
  /** Butt strips / foil tape. */
  Tape: 11,
  /** Zinc-plated sheet-metal screws. */
  Screw: 12,
  /** Pressed (formed) elbow covers: clear-coated 1100-O aluminum or T316 SS. */
  Pressed: 13,
  /** Moisture barrier film shown in the Layers view. */
  Barrier: 14,
  /** Valve, flanges and fasteners. */
  ValveBody: 15,
  Handwheel: 16,
  Bolt: 17,
  Stem: 18,
  /** Removable blanket: cold-face cloth, hot-face cloth, fiberglass mat core. */
  Fabric: 19,
  FabricInner: 20,
  BlanketCore: 21,
  /** Stainless lacing anchors and lacing wire. */
  Hardware: 22,
  /** Factory ASJ facing on the insulation: white face, kraft back, cut edge, butt strips. */
  Facing: 23,
  FacingInner: 24,
  FacingEdge: 25,
  FacingTape: 26,
  /** Vapor-retarder membrane over the insulation (cold service). */
  Vapor: 27,
  VaporEdge: 28,
  /** FSK facing on duct wrap and board. */
  DuctFacing: 29,
  /** FSK tape on duct seams, washers and corners (whatever the outer jacket). */
  FoilTape: 30,
} as const
export const SLOT_COUNT = 31

const steelOuter = () => pbr('steel-millscale', { metalness: 0.75 })
const copperOuter = () => pbr('copper-tube', { metalness: 0.9 })
const copperEnd = () => pbr('copper-tube', { metalness: 0.95, roughness: 0.6, color: '#f2c9a8' })
const pvcOuter = () => pbr('pvc-pipe', { clearcoat: 0.25, clearcoatRoughness: 0.4 })
const pvcBore = () => plain({ color: '#c9c9c4', roughness: 0.6 })
const galvOuter = () => pbr('galvanized', { metalness: 0.9 })
const galvInner = () => pbr('galvanized', { metalness: 0.8, color: '#8a8f94', roughness: 1.2 })
const galvEdge = () => plain({ color: '#b9bec2', roughness: 0.5, metalness: 0.9 })
const steelBore = () => plain({ color: '#2a2622', roughness: 0.85, metalness: 0.3 })
const steelEnd = () => pbr('steel-millscale', { metalness: 0.6, color: '#c3c6c9', roughness: 0.5 })
const pvc = () => pbr('pvc-white', { clearcoat: 0.3, clearcoatRoughness: 0.25 })

function jacket(id: JacketId) {
  // Polyfilm moisture barrier shows light blue at cut edges of metal jacketing.
  const polyfilm = plain({ color: '#a9cfe6', roughness: 0.5 })
  switch (id) {
    case 'alu-stucco':
      return {
        outer: pbr('alu-stucco', { metalness: 1 }),
        inner: polyfilm,
        edge: pbr('alu-smooth', { metalness: 1, roughness: 0.6 }),
      }
    case 'ss':
      return {
        outer: pbr('ss-2b', { metalness: 1 }),
        inner: plain({ color: '#888', metalness: 1, roughness: 0.4 }),
        edge: pbr('ss-2b', { metalness: 1, roughness: 0.5 }),
      }
    case 'asj':
      return {
        outer: pbr('asj', { normalStrength: 0.7 }),
        inner: plain({ color: '#b08a5a', roughness: 0.9 }), // kraft side
        edge: plain({ color: '#e9e8e2', roughness: 0.8 }),
      }
    case 'fsk':
      return {
        outer: pbr('foil-scrim', { metalness: 1, normalStrength: 1.5 }),
        inner: plain({ color: '#b08a5a', roughness: 0.9 }),
        edge: plain({ color: '#cfd1d3', metalness: 1, roughness: 0.35 }),
      }
    case 'pvc':
      return { outer: pvc(), inner: plain({ color: '#e8e8e2', roughness: 0.4 }), edge: plain({ color: '#efefe9', roughness: 0.35 }) }
    case 'none':
    case 'alu-smooth':
    default:
      return {
        outer: pbr('alu-smooth', { metalness: 1 }),
        inner: polyfilm,
        edge: pbr('alu-smooth', { metalness: 1, roughness: 0.6 }),
      }
  }
}

/**
 * Stainless bands: smoother and a touch cooler than the aluminum jacket, with a
 * brushed (anisotropic) sheen along the strap, so they read as separate straps
 * the way they do in field photos rather than as seams.
 */
const bandMat = () =>
  pbr('ss-2b', { metalness: 1, roughness: 0.42, color: new THREE.Color(0.9, 0.93, 0.97), anisotropy: 0.55 })

/** The materials for one assembly, made (and their textures fetched) only when a part first uses one. */
export interface Slots {
  get(slot: number): THREE.Material
  dispose(): void
}

const once = <T,>(make: () => T) => {
  let v: T | undefined
  return () => (v ??= make())
}
const SLOT_NAME = Object.fromEntries(Object.entries(Slot).map(([name, i]) => [i, name])) as Record<number, string>

export function buildSlots(ins: InsulationId, jac: JacketId, pipe: PipeMaterial | 'galvanized' = 'steel'): Slots {
  const v = INSULATION[ins]
  const skin = once(() => pbr(v.skin.tex, v.skin.params))
  const cut = once(() => pbr(v.cut.tex, v.cut.params))
  const bore = once(() => (v.bore ? pbr(v.bore.tex, v.bore.params) : skin()))
  const j = once(() => jacket(jac))
  const f = once(() => jacket('asj'))
  const pvcCover = once(pvc)
  const foilTape = once(() => pbr('foil-scrim', { metalness: 1, normalStrength: 2.2, roughness: 1.3 }))
  // the vapor-retarder membrane as made: white (Insulrap 30-NG), silver foil (PITTWRAP IW50 AL) or black coating
  const look = v.vapor.membrane?.look ?? 'black'
  const make: Record<number, () => THREE.Material> = {
    [Slot.PipeOuter]: () => (pipe === 'galvanized' ? galvOuter() : pipe === 'copper' ? copperOuter() : pipe === 'pvc' ? pvcOuter() : steelOuter()),
    [Slot.PipeEnd]: () => (pipe === 'galvanized' ? galvEdge() : pipe === 'copper' ? copperEnd() : pipe === 'pvc' ? pvcOuter() : steelEnd()),
    [Slot.PipeBore]: () => (pipe === 'galvanized' ? galvInner() : pipe === 'copper' ? copperOuter() : pipe === 'pvc' ? pvcBore() : steelBore()),
    [Slot.DuctFacing]: () => pbr('foil-scrim', { metalness: 0.65, normalStrength: 1.2, roughness: 1.15, color: '#e6e8ea' }),
    [Slot.InsSkin]: skin,
    [Slot.InsCut]: cut,
    [Slot.InsBore]: bore,
    // flat duct faces mirror the ground; stucco-embossed sheet reads brighter and more diffuse
    [Slot.JacketOuter]: () => (pipe === 'galvanized' && jac === 'alu-stucco' ? pbr('alu-stucco', { metalness: 1, roughness: 1.45, color: '#f4f6f8' }) : j().outer),
    [Slot.JacketInner]: () => j().inner,
    [Slot.JacketEdge]: () => j().edge,
    [Slot.Band]: bandMat,
    [Slot.Cover]: pvcCover,
    [Slot.Pressed]: () => (jac === 'ss'
      ? pbr('ss-2b', { metalness: 1, roughness: 0.8 })
      : pbr('alu-smooth', { metalness: 1, roughness: 0.75, clearcoat: 0.6, clearcoatRoughness: 0.12, color: '#f4f2ec' })),
    [Slot.Barrier]: () => new THREE.MeshPhysicalMaterial({ color: '#8fbfe0', roughness: 0.35, clearcoat: 0.4, vertexColors: true }),
    [Slot.ValveBody]: () => pbr('valve-paint', { metalness: 0.25 }),
    [Slot.Handwheel]: () => pbr('valve-paint', { metalness: 0.2, color: '#5d8f6a', roughness: 0.9 }),
    [Slot.Bolt]: () => pbr('steel-millscale', { metalness: 0.8, color: '#6c6f73', roughness: 0.8 }),
    [Slot.Stem]: () => pbr('ss-2b', { metalness: 1, roughness: 0.45 }),
    [Slot.Fabric]: () => pbr('blanket-fabric', { color: '#9a9ea1', sheen: 0.15, sheenColor: '#b9bdc0', sheenRoughness: 0.7 }),
    [Slot.FabricInner]: () => pbr('blanket-fabric', { color: '#d8cfb8', roughness: 1.2 }),
    [Slot.BlanketCore]: () => pbr('blanket-mat', { sheen: 0.2, sheenColor: '#ffffff' }),
    [Slot.Hardware]: () => pbr('ss-2b', { metalness: 0.9, roughness: 1.6, color: '#c9ccd0' }),
    [Slot.Screw]: () => pbr('ss-2b', { metalness: 1, roughness: 1.5, color: '#8c9095' }),
    [Slot.Tape]: () => (jac === 'fsk' ? foilTape() : j().outer),
    [Slot.FoilTape]: foilTape,
    // ASJ on a duct's broad flat faces under room lights: a shade off paper-white so it keeps its texture
    [Slot.Facing]: () => (pipe === 'galvanized' ? pbr('asj', { normalStrength: 0.9, color: '#dcdad3' }) : f().outer),
    [Slot.FacingInner]: () => f().inner,
    [Slot.FacingEdge]: () => f().edge,
    [Slot.FacingTape]: () => pbr('asj', { normalStrength: 0.7 }),
    [Slot.Vapor]: () => (look === 'foil'
      ? pbr('foil-scrim', { metalness: 1, normalStrength: 1.2, roughness: 0.9 })
      : look === 'white'
        ? pbr('pvc-white', { color: '#e9e8e3', roughness: 0.85, clearcoat: 0.1, normalStrength: 0.8 })
        : pbr('pvc-white', { color: '#2c2e30', roughness: 0.7, clearcoat: 0.25, clearcoatRoughness: 0.35, normalStrength: 0.6 })),
    [Slot.VaporEdge]: () => plain({ color: look === 'white' ? '#d8d6cf' : look === 'foil' ? '#2a2a28' : '#242527', roughness: 0.6 }),
  }
  const made = new Map<number, THREE.Material>()
  return {
    get(slot) {
      let m = made.get(slot)
      if (!m) {
        m = make[slot]()
        if (!m.name) m.name = SLOT_NAME[slot]
        made.set(slot, m)
      }
      return m
    },
    dispose() {
      new Set(made.values()).forEach((m) => m.dispose())
    },
  }
}

/** Matte black powder-coated steel for the display cradles. */
export const cradleMat = () =>
  pbr('alu-stucco', { metalness: 0.2, color: '#1b1c1e', roughness: 1.6, normalStrength: 0.25 })
export const padMat = () => plain({ color: '#141414', roughness: 0.75 })
