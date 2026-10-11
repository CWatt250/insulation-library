// Phone screenshots (iPhone-sized viewport, touch, DPR 3).
// Usage: node tools/shot_mobile.mjs <url> <outPrefix>  -> <prefix>-collapsed.png, -open.png, -specs.png
import { chromium } from '../app/node_modules/playwright/index.mjs'
const [url, out] = process.argv.slice(2)
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push(e.message))
await p.goto(url)
await p.waitForTimeout(9000)
await p.screenshot({ path: `${out}-collapsed.png` })
await p.getByRole('button', { name: 'Expand panel' }).click()
await p.waitForTimeout(800)
await p.screenshot({ path: `${out}-open.png` })
await p.getByRole('tab', { name: 'Specs' }).click()
await p.waitForTimeout(600)
await p.screenshot({ path: `${out}-specs.png` })
console.log(errs.length ? errs.join('\n') : 'no page errors')
await b.close()
