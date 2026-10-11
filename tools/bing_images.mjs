// Reference-photo finder (Bing Images, large photos only). Usage: node tools/bing_images.mjs "<query>" > out.json  -> [{img, page, title}]
import { chromium } from '../app/node_modules/playwright/index.mjs'
const q = process.argv[2]
const b = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await b.newContext({ locale: 'en-US', userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', viewport: { width: 1400, height: 1000 } })
const p = await ctx.newPage()
await p.goto(`https://www.bing.com/images/search?q=${encodeURIComponent(q)}&qft=+filterui:imagesize-large+filterui:photo-photo&form=IRFLTR`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(3000)
for (let i = 0; i < 3; i++) { await p.mouse.wheel(0, 3000); await p.waitForTimeout(800) }
const items = await p.$$eval('a.iusc', (as) => as.map((a) => { try { const m = JSON.parse(a.getAttribute('m')); return { img: m.murl, page: m.purl, title: m.t } } catch { return null } }).filter(Boolean))
console.error('title:', await p.title(), 'found:', items.length)
console.log(JSON.stringify(items))
await b.close()
