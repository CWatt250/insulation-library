#!/usr/bin/env node
// The simulator for other Watt apps (src/wattbot/api.ts):
//   dist-wattbot/cli.mjs          stdin→stdout JSON CLI (watt-wattbot-worker deep mode)
//   public/wattbot/engine.mjs     browser ES module (BidWatt Toolbox; CORS in vercel.json)
//   public/wattbot/*.svg          the duct-location images WattBot sends / BidWatt draws on
// Run by `npm run build` before Vite, so the deployed images always match
// src/sim/ductSpots.ts; the worker rebuilds the CLI itself when src/ changes.
import { build } from 'esbuild'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const app = join(dirname(fileURLToPath(import.meta.url)), '..')
const common = { bundle: true, platform: 'node', format: 'esm', target: 'node20', jsx: 'automatic', logLevel: 'warning', absWorkingDir: app }

await build({ ...common, entryPoints: ['src/wattbot/cli.ts'], outfile: 'dist-wattbot/cli.mjs' })

if (!process.argv.includes('--cli-only')) {
  await build({ ...common, platform: 'browser', target: 'es2022', minify: true, entryPoints: ['src/wattbot/api.ts'], outfile: 'public/wattbot/engine.mjs' })
  const tmp = join(app, 'dist-wattbot', 'images.mjs')
  await build({ ...common, entryPoints: ['src/wattbot/images.tsx'], outfile: tmp, packages: 'external' })
  const { ductImages } = await import(pathToFileURL(tmp).href)
  const dir = join(app, 'public', 'wattbot')
  mkdirSync(dir, { recursive: true })
  const files = ductImages()
  for (const [name, svg] of Object.entries(files)) writeFileSync(join(dir, name), `<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n`)
  console.log(`wattbot: cli + engine + ${Object.keys(files).length} images`)
}
