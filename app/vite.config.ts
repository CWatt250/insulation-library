import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

/**
 * Writes dist/sw.js from sw/sw.js with every built file and a hash of its
 * contents, so the service worker can keep the app (and, on request, every
 * texture) for offline use and re-download only what a deploy changed.
 */
function offlineServiceWorker(): Plugin {
  let root = ''
  let outDir = ''
  return {
    name: 'offline-service-worker',
    apply: 'build',
    configResolved(c) {
      root = c.root
      outDir = resolve(c.root, c.build.outDir)
    },
    closeBundle() {
      const files: [string, string][] = []
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const p = join(dir, name)
          if (statSync(p).isDirectory()) walk(p)
          else {
            const rel = relative(outDir, p).split(sep).join('/')
            if (rel !== 'sw.js') files.push([rel, createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 12)])
          }
        }
      }
      walk(outDir)
      files.sort((a, b) => a[0].localeCompare(b[0]))
      const src = readFileSync(resolve(root, 'sw/sw.js'), 'utf8')
      if (src.split('__BUILD_FILES__').length !== 2) throw new Error('sw/sw.js needs exactly one __BUILD_FILES__ placeholder')
      writeFileSync(join(outDir, 'sw.js'), src.replace('__BUILD_FILES__', () => JSON.stringify(files)))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), offlineServiceWorker()],
})
