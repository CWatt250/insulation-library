// Renders every material × jacket × component combo; reports page errors.
// Usage: node tools/matrix.mjs <outDir> [baseUrl]
import { chromium } from '../app/node_modules/playwright/index.mjs'
const [out, base = 'http://localhost:5179/'] = process.argv.slice(2)
const combos = {
  calsil: ['alu-smooth', 'alu-stucco', 'ss', 'none'],
  fiberglass: ['asj', 'pvc', 'alu-smooth', 'alu-stucco', 'ss', 'none'],
  'mineral-wool': ['alu-smooth', 'alu-stucco', 'ss', 'asj', 'none'],
  'cellular-glass': ['alu-smooth', 'alu-stucco', 'ss', 'pvc', 'none'],
  elastomeric: ['none', 'pvc', 'alu-smooth'],
  phenolic: ['fsk', 'pvc', 'alu-smooth', 'alu-stucco', 'ss', 'none'],
}
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await b.newPage({ viewport: { width: 800, height: 500 } })
const errors = []
page.on('pageerror', (e) => errors.push(`${page.url()} :: ${e.message}`))
page.on('console', (m) => m.type() === 'error' && errors.push(`${page.url()} :: ${m.text()}`))
for (const [ins, jackets] of Object.entries(combos)) {
  for (const jacket of jackets) {
    for (const comp of ['straight', 'elbow']) {
      const url = `${base}?ui=0&ins=${ins}&jacket=${jacket}&comp=${comp}`
      await page.goto(url)
      await page.waitForTimeout(4500)
      await page.screenshot({ path: `${out}/${ins}__${jacket}__${comp}.png` })
    }
  }
}
console.log(errors.length ? errors.join('\n') : 'no page errors')
await b.close()
