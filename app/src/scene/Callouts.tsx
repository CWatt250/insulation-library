import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import type { Callout } from '../geo/assembly'

/**
 * Labelled leader lines for the Layers view, laid out in screen space every
 * frame: anchors are projected, then each label is pushed further from the
 * pipe until it no longer overlaps a label already placed on the same side.
 */
export function Callouts({ items, parent }: { items: Callout[]; parent: React.RefObject<THREE.Object3D | null> }) {
  const size = useThree((s) => s.size)
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const svgRef = useRef<SVGSVGElement>(null)
  const labels = useRef<(HTMLDivElement | null)[]>([])
  const lines = useRef<(SVGLineElement | null)[]>([])
  const dots = useRef<(SVGCircleElement | null)[]>([])
  const v = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    const obj = parent.current
    if (!obj) return
    obj.updateWorldMatrix(true, false)
    // drei's fullscreen Html container isn't anchored at the canvas corner;
    // measure the offset so projected anchors land on the model.
    const host = svgRef.current?.getBoundingClientRect()
    const cv = gl.domElement.getBoundingClientRect()
    const ox = host ? cv.left - host.left : 0
    const oy = host ? cv.top - host.top : 0
    const placed: { x0: number; x1: number; y0: number; y1: number }[] = []
    const order = items
      .map((c, i) => {
        v.set(...c.pos).applyMatrix4(obj.matrixWorld).project(camera)
        return { i, side: c.side ?? 'up', x: ox + ((v.x + 1) / 2) * size.width, y: oy + ((1 - v.y) / 2) * size.height, behind: v.z > 1 }
      })
      .sort((a, b) => (a.side === 'right' && b.side === 'right' ? a.y - b.y : a.x - b.x))
    for (const a of order) {
      const el = labels.current[a.i]
      const ln = lines.current[a.i]
      const dot = dots.current[a.i]
      if (!el || !ln || !dot) continue
      const w = el.offsetWidth
      const h = el.offsetHeight
      if (a.side === 'right') {
        // horizontal leader to a label column on the right; slide down past collisions
        const lx = a.x + 70
        let ty = a.y - h / 2
        let rect = { x0: lx - 6, x1: lx + w + 6, y0: ty - 4, y1: ty + h + 4 }
        for (let k = 0; k < 20 && placed.some((p) => rect.x0 < p.x1 && rect.x1 > p.x0 && rect.y0 < p.y1 && rect.y1 > p.y0); k++) {
          ty += 12
          rect = { x0: lx - 6, x1: lx + w + 6, y0: ty - 4, y1: ty + h + 4 }
        }
        placed.push(rect)
        el.style.transform = `translate(${lx}px, ${ty}px)`
        el.style.opacity = a.behind ? '0' : '1'
        ln.setAttribute('x1', String(a.x))
        ln.setAttribute('y1', String(a.y))
        ln.setAttribute('x2', String(lx))
        ln.setAttribute('y2', String(ty + h / 2))
        ln.style.opacity = a.behind ? '0' : '1'
        dot.setAttribute('cx', String(a.x))
        dot.setAttribute('cy', String(a.y))
        dot.style.opacity = a.behind ? '0' : '1'
        continue
      }
      const dir = a.side === 'up' ? -1 : 1
      let lift = 40
      let rect = { x0: 0, x1: 0, y0: 0, y1: 0 }
      for (let k = 0; k < 12; k++) {
        const cy = a.y + dir * lift
        const top = a.side === 'up' ? cy - h : cy
        rect = { x0: a.x - w / 2 - 6, x1: a.x + w / 2 + 6, y0: top - 4, y1: top + h + 4 }
        const hit = placed.some((p) => rect.x0 < p.x1 && rect.x1 > p.x0 && rect.y0 < p.y1 && rect.y1 > p.y0)
        if (!hit) break
        lift += 26
      }
      placed.push(rect)
      const labelTop = a.side === 'up' ? a.y - lift - h : a.y + lift
      el.style.transform = `translate(${a.x - w / 2}px, ${labelTop}px)`
      el.style.opacity = a.behind ? '0' : '1'
      ln.setAttribute('x1', String(a.x))
      ln.setAttribute('y1', String(a.y))
      ln.setAttribute('x2', String(a.x))
      ln.setAttribute('y2', String(a.side === 'up' ? a.y - lift : a.y + lift))
      ln.style.opacity = a.behind ? '0' : '1'
      dot.setAttribute('cx', String(a.x))
      dot.setAttribute('cy', String(a.y))
      dot.style.opacity = a.behind ? '0' : '1'
    }
  })

  if (!items.length) return null
  return (
    <Html fullscreen zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
      <svg ref={svgRef} className="callout-lines" width={size.width} height={size.height}>
        {items.map((c, i) => (
          <g key={`${c.title}-${i}`}>
            <line ref={(el) => { lines.current[i] = el }} />
            <circle ref={(el) => { dots.current[i] = el }} r={3.5} />
          </g>
        ))}
      </svg>
      {items.map((c, i) => (
        <div key={`${c.title}-${i}`} ref={(el) => { labels.current[i] = el }} className="callout-label">
          <strong>{c.title}</strong>
          <span>{c.detail}</span>
        </div>
      ))}
    </Html>
  )
}
