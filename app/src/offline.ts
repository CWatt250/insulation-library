import { TEXTURE_DIR } from './materials/library'

/**
 * Offline use (production only): register the service worker (sw/sw.js), and
 * once the first view has loaded ask it to save every texture and lighting
 * file this device uses, so the whole app works without signal. Skipped when
 * the browser asks to save data. Says so once, the first time it finishes.
 */
export function registerOffline() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type !== 'warmed' || e.data.failed) return
    try {
      if (localStorage.getItem('il.offline.told')) return
      localStorage.setItem('il.offline.told', '1')
    } catch { /* private mode: say it anyway */ }
    toast('Saved for offline use')
  })
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
      const reg = await navigator.serviceWorker.ready
      const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
      if (conn?.saveData) return
      setTimeout(() => reg.active?.postMessage({ type: 'warm', prefixes: [`${TEXTURE_DIR}/`, 'hdri/'] }), 5000)
    } catch { /* no offline support here; the app still works online */ }
  })
}

function toast(text: string) {
  const el = document.createElement('div')
  el.className = 'toast'
  el.setAttribute('role', 'status')
  el.textContent = text
  document.body.append(el)
  setTimeout(() => el.classList.add('out'), 3500)
  setTimeout(() => el.remove(), 4000)
}
