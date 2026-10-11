// Usage: node tools/shot.mjs <url> <out.png> [waitMs] [WxH]
import { chromium } from '../app/node_modules/playwright/index.mjs'
const [url, out, wait = '9000', size = '1600x1000'] = process.argv.slice(2)
const [w, h] = size.split('x').map(Number)
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'],
})
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
const logs = []
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`))
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
await page.goto(url)
await page.waitForTimeout(Number(wait))
const gpu = await page.evaluate(() => {
  const c = document.createElement('canvas').getContext('webgl2')
  const ext = c && c.getExtension('WEBGL_debug_renderer_info')
  return ext ? c.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'n/a'
})
await page.screenshot({ path: out })
console.log('GPU:', gpu)
console.log(logs.filter((l) => !l.includes('[vite]') && !l.includes('React DevTools')).slice(0, 20).join('\n'))
await browser.close()
