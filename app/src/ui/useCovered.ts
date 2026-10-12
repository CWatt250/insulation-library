import { useLayoutEffect, useState, type RefObject } from 'react'

/**
 * How much of a stage the overlays cover, in pixels from its top and bottom
 * edges: the lowest bottom edge among `top` elements and the highest top edge
 * among `bottom` elements. Kept current as they resize (a bottom sheet opening,
 * a toolbar wrapping), so phones can frame the 3D in the open band between.
 * `key` re-collects the elements when they may have changed.
 */
export function useCovered(stage: RefObject<HTMLElement | null>, top: string, bottom: string, key: string, active = true) {
  const [ins, setIns] = useState({ top: 0, bottom: 0 })
  useLayoutEffect(() => {
    const el = stage.current
    if (!el || !active) return
    const measure = () => {
      const s = el.getBoundingClientRect()
      let t = 0
      let b = 0
      document.querySelectorAll<HTMLElement>(top).forEach((o) => {
        const r = o.getBoundingClientRect()
        if (r.height) t = Math.max(t, r.bottom - s.top)
      })
      document.querySelectorAll<HTMLElement>(bottom).forEach((o) => {
        const r = o.getBoundingClientRect()
        if (r.height) b = Math.max(b, s.bottom - r.top)
      })
      const next = { top: Math.round(Math.max(0, t)), bottom: Math.round(Math.max(0, b)) }
      setIns((p) => (p.top === next.top && p.bottom === next.bottom ? p : next))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    document.querySelectorAll(`${top}, ${bottom}`).forEach((o) => ro.observe(o))
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [stage, top, bottom, key, active])
  return ins
}
