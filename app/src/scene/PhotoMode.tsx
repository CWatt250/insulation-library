import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { DenoiseMaterial, WebGLPathTracer } from 'three-gpu-pathtracer'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'

/**
 * Photo mode: a progressive, physically based path tracer (three-gpu-pathtracer).
 * Light bounces between the jacket, insulation, floor and backdrop; shadows come
 * from the actual size of the softboxes. While the camera moves the regular
 * raster view shows, then the path-traced image fades in and keeps refining
 * until MAX_SAMPLES, where it stops to spare the GPU (and laptop batteries).
 */

const MAX_SAMPLES = 768

export interface PhotoProgress {
  samples: number
  max: number
  building: boolean
}

/**
 * Resolve once the scene is complete: environment lighting baked (the HDRI
 * loads inside a Suspense boundary, so the model mounts with it), the assembly
 * mesh present, and every texture referenced by scene materials decoded.
 */
function sceneReady(scene: THREE.Scene): Promise<void> {
  const pending = (): boolean => {
    if (!scene.environment || !scene.getObjectByName('assembly')) return true
    let waiting = false
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material
      if (!m) return
      for (const mat of Array.isArray(m) ? m : [m]) {
        for (const v of Object.values(mat)) {
          if (v instanceof THREE.Texture && !(v as THREE.Texture & { isRenderTargetTexture?: boolean }).isRenderTargetTexture) {
            const img = v.image as HTMLImageElement | ImageBitmap | undefined
            if (!img || ('complete' in img && !img.complete)) waiting = true
          }
        }
      }
    })
    return waiting
  }
  return new Promise((resolve) => {
    const tick = () => (pending() ? setTimeout(tick, 100) : resolve())
    tick()
  })
}

export function PhotoMode({
  active,
  sceneKey,
  onProgress,
}: {
  active: boolean
  /** Changes whenever geometry/materials/environment change, forcing a rebuild. */
  sceneKey: string
  onProgress?: (p: PhotoProgress) => void
}) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as (THREE.EventDispatcher<{ change: object }> & { target: THREE.Vector3 }) | null
  const ready = useRef(false)
  const lastReport = useRef(-1)

  // Created only while photo mode is on, and disposed with it (GPU memory).
  const [pt, setPt] = useState<WebGLPathTracer | null>(null)
  useEffect(() => {
    if (!active) return
    const p = new WebGLPathTracer(gl)
    p.tiles.set(2, 2)
    p.bounces = 7
    p.minSamples = 4
    p.renderDelay = 120
    p.fadeDuration = 450
    p.dynamicLowRes = false
    p.rasterizeScene = true
    p.textureSize.set(1024, 1024)
    p.filterGlossyFactor = 0.5
    // Final blit through an edge-preserving denoiser. It also applies tone
    // mapping + sRGB, which the library's default blit skips. Denoising eases
    // off as samples accumulate so converged detail stays crisp.
    const denoise = new DenoiseMaterial({ transparent: true, premultipliedAlpha: true })
    const dq = new FullScreenQuad(denoise)
    p.renderToCanvasCallback = (target, renderer, quad) => {
      const k = Math.min(p.samples / MAX_SAMPLES, 1)
      denoise.map = target.texture
      denoise.opacity = (quad.material as THREE.ShaderMaterial & { opacity: number }).opacity
      denoise.sigma = 4.5 - 3 * k
      denoise.threshold = 0.06 - 0.04 * k
      denoise.kSigma = 1
      denoise.blending = denoise.opacity < 1 ? THREE.NormalBlending : THREE.NoBlending
      const ac = renderer.autoClear
      renderer.autoClear = false
      dq.render(renderer)
      renderer.autoClear = ac
    }
    if (import.meta.env.DEV) (window as unknown as { __pt: WebGLPathTracer }).__pt = p
    setPt(p)
    return () => {
      p.dispose()
      dq.dispose()
      denoise.dispose()
      setPt(null)
    }
  }, [active, gl])

  // (Re)build the BVH + material/texture atlases when the scene changes.
  useEffect(() => {
    if (!active || !pt) return
    let cancelled = false
    ready.current = false
    onProgress?.({ samples: 0, max: MAX_SAMPLES, building: true })
    const prevTone = gl.toneMapping
    gl.toneMapping = THREE.NeutralToneMapping
    // let the environment / textures settle, then build
    const t = setTimeout(async () => {
      await sceneReady(scene)
      if (cancelled) return
      try {
        focus()
        pt.setScene(scene, camera)
      } catch (e) {
        console.error('[photo] scene build failed', e)
        return
      }
      if (cancelled) return
      ready.current = true
      lastReport.current = -1
      if (import.meta.env.DEV) console.info('[photo] ready')
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
      ready.current = false
      gl.toneMapping = prevTone
    }
  }, [active, sceneKey, pt, scene, camera, gl]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the lens focused on whatever the orbit controls are looking at.
  const focus = () => {
    const c = camera as THREE.PerspectiveCamera & { focusDistance?: number }
    if (controls && 'focusDistance' in c) c.focusDistance = c.position.distanceTo(controls.target)
  }

  // Restart accumulation whenever the camera moves.
  useEffect(() => {
    if (!active || !controls || !pt) return
    const onChange = () => {
      focus()
      if (ready.current) pt.updateCamera()
    }
    controls.addEventListener('change', onChange)
    return () => controls.removeEventListener('change', onChange)
  }, [active, controls, pt])

  useFrame(() => {
    if (!active) return
    if (!pt || !ready.current) {
      gl.render(scene, camera)
      return
    }
    pt.pausePathTracing = pt.samples >= MAX_SAMPLES
    pt.renderSample()
    const s = Math.floor(pt.samples)
    if (onProgress && s !== lastReport.current && (s % 4 === 0 || s >= MAX_SAMPLES)) {
      lastReport.current = s
      onProgress({ samples: Math.min(s, MAX_SAMPLES), max: MAX_SAMPLES, building: false })
    }
  }, active ? 1 : 0)

  return null
}
