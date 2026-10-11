// Usage: node tools/sim_shots.mjs <outDir> [baseUrl] [WxH] [only]
// Captures each simulator mode in its key states (insulated, bare, thermal, compare).
import { chromium } from '../app/node_modules/playwright/index.mjs'
const [outDir, base = 'http://localhost:5179/', size = '1600x1000', only = ''] = process.argv.slice(2)
const [w, h] = size.split('x').map(Number)
const mobile = w < 860
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, hasTouch: mobile, isMobile: mobile })
const logs = []
page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text().slice(0, 300)) })
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
const click = (name) => page.getByRole('button', { name, exact: true }).first().click()
const radio = (name) => page.getByRole('radio', { name, exact: true }).first().click()
const shots = {
  hot: async () => [['hot', null], ['hot-bare', () => radio('Bare')], ['hot-thermal', async () => { await radio('Insulated'); await click('Thermal') }], ['hot-compare', async () => { await click('Thermal'); await click('Compare') }]],
  cold: async () => [['cold', null], ['cold-bare', () => radio('Bare')], ['cold-thermal', async () => { await radio('Insulated'); await click('Thermal') }], ['cold-compare', async () => { await click('Thermal'); await click('Compare') }]],
  condensate: async () => [['cond', null], ['cond-bare', () => radio('Bare')], ['cond-compare', async () => { await radio('Insulated'); await click('Compare') }]],
}
for (const mode of Object.keys(shots)) {
  if (only && !only.split(',').includes(mode)) continue
  await page.goto(`${base}?mode=${mode}`)
  await page.waitForTimeout(6000)
  for (const [name, act] of await shots[mode]()) {
    if (act) { await act(); await page.waitForTimeout(3500) }
    await page.screenshot({ path: `${outDir}/${name}${mobile ? '-m' : ''}.png` })
  }
}
console.log(logs.slice(0, 10).join('\n') || 'no errors')
await browser.close()
