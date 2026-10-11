// Renders material × jacket × service on the elbow (it exercises the most code),
// plus the exploded / section / layers views and the valve per material; reports page errors.
// Usage: node tools/matrix.mjs <outDir> [baseUrl]
import { chromium } from '../app/node_modules/playwright/index.mjs'
const [out, base = 'http://localhost:5179/'] = process.argv.slice(2)
const mats = {
  calsil: { jackets: ['alu-smooth', 'alu-stucco', 'ss', 'none'], services: ['hot'] },
  fiberglass: { jackets: ['none', 'pvc', 'alu-smooth', 'alu-stucco', 'ss'], services: ['hot', 'cold'] },
  'mineral-wool': { jackets: ['alu-smooth', 'alu-stucco', 'ss', 'pvc', 'none'], services: ['hot'] },
  'cellular-glass': { jackets: ['alu-smooth', 'alu-stucco', 'ss', 'pvc', 'none'], services: ['cold', 'hot'] },
  elastomeric: { jackets: ['none', 'pvc', 'alu-smooth'], services: ['cold', 'hot'] },
  phenolic: { jackets: ['none', 'pvc', 'alu-smooth', 'alu-stucco', 'ss'], services: ['cold', 'hot'] },
}
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await b.newPage({ viewport: { width: 800, height: 500 } })
const errors = []
page.on('pageerror', (e) => errors.push(`${page.url()} :: ${e.message}`))
page.on('console', (m) => m.type() === 'error' && errors.push(`${page.url()} :: ${m.text()}`))
const shot = async (q, name) => {
  await page.goto(`${base}?ui=0&${q}`)
  await page.waitForFunction(() => window.__buildMs, null, { timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${out}/${name}.png` })
}
for (const [ins, m] of Object.entries(mats)) {
  for (const svc of m.services) {
    for (const jacket of m.jackets) await shot(`ins=${ins}&jacket=${jacket}&svc=${svc}&comp=elbow&view=installed`, `${ins}__${svc}__${jacket}__elbow`)
    for (const view of ['exploded', 'section', 'layers']) await shot(`ins=${ins}&jacket=${m.jackets[0]}&svc=${svc}&view=${view}&thk=4`, `${ins}__${svc}__${view}`)
  }
  await shot(`ins=${ins}&comp=valve&view=installed`, `${ins}__valve`)
}
console.log(errors.length ? errors.join('\n') : 'no page errors')
await b.close()
