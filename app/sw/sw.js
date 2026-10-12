/* Insulation Library service worker: keeps the app usable offline.
 *
 * vite.config.ts (offlineServiceWorker) builds dist/sw.js from this file,
 * filling in FILES: every built file and a hash of its contents.
 * Edit this file, not dist/sw.js.
 *
 * - Install saves the app itself (page, scripts, styles, icons).
 * - Textures and lighting files are saved as they are first used, and all at
 *   once when the page asks ("warm") after it has loaded, so the whole app
 *   works without signal.
 * - Saved files are keyed by content hash: a deploy re-downloads only what
 *   changed, and activation drops anything no longer in the build.
 * - Pages load from the network when it answers within a few seconds (so a new
 *   deploy shows straight away) and from the saved copy otherwise.
 */
const FILES = __BUILD_FILES__
const CACHE = 'il-offline'
const rev = new Map(FILES)
const scope = new URL(self.registration.scope)
const keyOf = (path) => `${scope.origin}${scope.pathname}${path}?rev=${rev.get(path)}`
const LAZY = ['tex/', 'tex-half/', 'hdri/']
const SHELL = FILES.map(([p]) => p).filter((p) => !LAZY.some((x) => p.startsWith(x)))

/** Saves the given files (skipping ones already saved); resolves to how many could not be fetched. */
async function store(paths) {
  const cache = await caches.open(CACHE)
  let next = 0
  let failed = 0
  const worker = async () => {
    while (next < paths.length) {
      const path = paths[next++]
      const key = keyOf(path)
      if (await cache.match(key)) continue
      try {
        const res = await fetch(new URL(path, scope), { cache: 'no-cache' })
        if (res.ok) await cache.put(key, res)
        else failed++
      } catch {
        failed++
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  return failed
}

self.addEventListener('install', (e) => {
  // a half-saved app would break offline: keep the previous worker until all of it is saved
  e.waitUntil(store(SHELL).then((failed) => {
    if (failed) throw new Error(`${failed} app files could not be saved`)
    return self.skipWaiting()
  }))
})

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name)
    const valid = new Set(FILES.map(([p]) => keyOf(p)))
    const cache = await caches.open(CACHE)
    for (const req of await cache.keys()) if (!valid.has(req.url)) await cache.delete(req)
    await self.clients.claim()
  })())
})

async function page(req) {
  try {
    return await Promise.race([
      fetch(req),
      new Promise((_, fail) => setTimeout(() => fail(new Error('slow')), 4000)),
    ])
  } catch {
    return (await caches.match(keyOf('index.html'))) ?? Response.error()
  }
}

async function file(path, req) {
  const cache = await caches.open(CACHE)
  const key = keyOf(path)
  const hit = await cache.match(key)
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok && res.type === 'basic') await cache.put(key, res.clone())
  return res
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== scope.origin) return
  if (req.mode === 'navigate') {
    e.respondWith(page(req))
    return
  }
  const path = url.pathname.slice(scope.pathname.length)
  if (url.search || !rev.has(path)) return
  e.respondWith(file(path, req))
})

self.addEventListener('message', (e) => {
  if (e.data?.type !== 'warm') return
  const prefixes = e.data.prefixes ?? []
  const paths = FILES.map(([p]) => p).filter((p) => prefixes.some((x) => p.startsWith(x)))
  e.waitUntil(store(paths).then((failed) => e.source?.postMessage({ type: 'warmed', failed, total: paths.length })))
})
