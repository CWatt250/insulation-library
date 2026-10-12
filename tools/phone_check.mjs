// Phone layout check: every tab at iPhone size (390x844), with screenshots.
//
//   node tools/phone_check.mjs              build the working tree into a temp folder, serve it, check it
//   node tools/phone_check.mjs --url <base> check a running site (dev server, preview or production)
//
// Checks each tab for page errors, sideways scrolling, the section bar, the one-row
// 3D toolbar and its More menu, the bare-stub tag framed between the status pill and
// the toolbar, the duct's R-value tag, Reset view after a drag, and the bottom sheet
// opening on screen.
// Screenshots go to app/test-results/phone/. Exits 1 on any failure.
// Runs before every push (.githooks/pre-push); SKIP_PHONE_CHECK=1 skips it.
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '../app/node_modules/playwright/index.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const APP = join(ROOT, 'app')
const SHOTS = join(APP, 'test-results', 'phone')
const W = 390
const H = 844
// known noise that is not a failure
const IGNORE = [/THREE\.Clock/, /GL Driver Message/, /WebGLPathTracer/, /GPU stall/]

const argv = process.argv.slice(2)
const urlArg = argv.includes('--url') ? argv[argv.indexOf('--url') + 1] : null
const t0 = Date.now()
const secs = () => ((Date.now() - t0) / 1000).toFixed(0)

// ----------------------------------------------------------------- serve
let server = null
let outDir = null
function cleanup() {
  if (server && server.exitCode === null) {
    try { process.kill(-server.pid, 'SIGTERM') } catch { try { server.kill('SIGTERM') } catch { /* gone */ } }
  }
  server = null
  if (outDir) {
    rmSync(outDir, { recursive: true, force: true })
    outDir = null
  }
}
process.on('exit', cleanup)
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(130) })

const freePort = (from) => new Promise((ok) => {
  const s = createServer()
  s.once('error', () => ok(freePort(from + 1)))
  s.listen(from, '127.0.0.1', () => s.close(() => ok(from)))
})

async function buildAndServe() {
  outDir = mkdtempSync(join(tmpdir(), 'il-phone-check-'))
  console.log('building the working tree…')
  const run = (args) => {
    const r = spawnSync('npx', args, { cwd: APP, encoding: 'utf8' })
    if (r.status !== 0) {
      console.error(r.stdout, r.stderr)
      throw new Error(`npx ${args.join(' ')} failed`)
    }
  }
  run(['tsc', '-b'])
  run(['vite', 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'warn'])
  const port = await freePort(4180)
  server = spawn('npx', ['vite', 'preview', '--outDir', outDir, '--port', String(port), '--strictPort'], { cwd: APP, detached: true, stdio: 'ignore' })
  const base = `http://localhost:${port}/`
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base)).ok) return base
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('preview server did not start')
}

// ---------------------------------------------------------------- checks
const results = []
let failed = 0
function check(tab, what, ok, detail = '') {
  results.push({ tab, what, ok, detail })
  if (!ok) failed++
}

// missing elements fail fast instead of waiting out Playwright's 30 s default
const box = (loc) => loc.boundingBox({ timeout: 1500 }).catch(() => null)
const inside = (b, pad = 1) => !!b && b.x >= -pad && b.y >= -pad && b.x + b.width <= W + pad && b.y + b.height <= H + pad

async function checkTab(page, tab, errors) {
  errors.length = 0
  await page.goto(`${BASE}?mode=${tab}`)
  await page.waitForTimeout(6000)
  const gotIt = page.getByRole('button', { name: 'Got it' })
  if (await gotIt.count()) {
    await gotIt.first().click()
    await page.waitForTimeout(700)
  }
  const sim = ['hot', 'cold', 'condensate', 'duct'].includes(tab)
  await page.screenshot({ path: join(SHOTS, `${tab}.png`) })

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  check(tab, 'no sideways scroll', overflow <= 1, overflow > 1 ? `page is ${overflow}px wider than the screen` : '')
  const nav = await box(page.locator('nav.modebar').first())
  check(tab, 'section bar visible and fits', inside(nav), nav ? `bar at x ${nav.x.toFixed(0)}–${(nav.x + nav.width).toFixed(0)}` : 'nav.modebar not found')

  if (tab === 'recommend') {
    const btn = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => !x.closest('nav') && /^(Recommend|Update recommendation|Recommend again)$/.test(x.textContent.trim()))
      if (!b) return null
      const r = b.getBoundingClientRect()
      return { y: r.y, h: r.height, w: r.width, x: r.x }
    })
    check(tab, 'Recommend button on screen', !!btn && btn.h > 0 && btn.y + btn.h <= H + 1 && btn.y >= 0, btn ? '' : 'no Recommend button outside the section bar')
  }

  if (sim) {
    const bar = page.locator('[role=toolbar][aria-label=View]').first()
    const tb = await box(bar)
    check(tab, 'toolbar is one row, on screen', !!tb && tb.height <= 56 && inside(tb), tb ? `${tb.width.toFixed(0)}×${tb.height.toFixed(0)} at y ${tb.y.toFixed(0)}` : 'toolbar not found')

    const more = page.getByRole('button', { name: 'More', exact: true })
    if (await more.count()) {
      await more.first().click()
      await page.waitForTimeout(400)
      const menu = await box(page.getByRole('menu').first())
      check(tab, 'More menu on screen', inside(menu), menu ? `menu ${menu.width.toFixed(0)}×${menu.height.toFixed(0)} at ${menu.x.toFixed(0)},${menu.y.toFixed(0)}` : 'menu did not open')
      await page.screenshot({ path: join(SHOTS, `${tab}-menu.png`) })
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
      check(tab, 'More menu closes', (await page.getByRole('menu').count()) === 0)
    } else check(tab, 'More menu on screen', false, 'no button named More')

    const tag = await box(page.locator('.stub-tag').first())
    const pill = await box(page.locator('.status-pill').first())
    if (!tag) check(tab, 'model framed in the open band', false, 'bare-stub tag (.stub-tag) not found')
    else {
      const top = pill ? pill.y + pill.height - 4 : 0
      const bottom = tb ? tb.y + 4 : H
      const ok = tag.x >= -1 && tag.x + tag.width <= W + 1 && tag.y >= top && tag.y + tag.height <= bottom
      check(tab, 'model framed in the open band', ok, `tag at ${tag.x.toFixed(0)},${tag.y.toFixed(0)} (band y ${top.toFixed(0)}–${bottom.toFixed(0)})`)
    }
    if (tab === 'duct') {
      check(tab, 'Location guide visible', await page.getByRole('button', { name: 'Location guide' }).first().isVisible().catch(() => false))
      // the duct's R-value and thickness, on the model and on screen
      const ins = page.locator('.ins-tag').first()
      const ib = await box(ins)
      const txt = ib ? await ins.textContent() : ''
      check(tab, 'R-value and thickness tag on screen', inside(ib) && /R-\d/.test(txt) && /"/.test(txt), ib ? `"${txt}" at ${ib.x.toFixed(0)},${ib.y.toFixed(0)}` : 'no .ins-tag')
    }
  } else if (tab === 'explore') {
    check(tab, '3D canvas present', (await page.locator('canvas').count()) > 0)
  }

  if (tab !== 'recommend') {
    // a drag on the 3D: Reset view appears, and goes once used
    const cv = await box(page.locator('canvas').first())
    if (cv) {
      const x = cv.x + cv.width / 2
      const y = cv.y + Math.min(cv.height / 2, 380)
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x + 110, y + 25, { steps: 8 })
      await page.mouse.up()
      await page.waitForTimeout(600)
      const reset = page.getByRole('button', { name: 'Reset view' })
      const shown = (await reset.count()) > 0 && (await reset.first().isVisible())
      check(tab, 'Reset view after a drag', shown)
      if (shown) {
        await page.screenshot({ path: join(SHOTS, `${tab}-moved.png`) })
        await reset.first().click()
        await page.waitForTimeout(600)
        check(tab, 'Reset view hides once used', (await reset.count()) === 0 || !(await reset.first().isVisible()))
      }
    } else check(tab, 'Reset view after a drag', false, 'no canvas')

    const expand = page.getByRole('button', { name: 'Expand panel' })
    if (await expand.count()) {
      await expand.first().click()
      await page.waitForTimeout(900)
      const sheet = await box(page.locator('section.sheet').first())
      const body = await box(page.locator('section.sheet .sheet-body').first())
      check(tab, 'panel opens on screen', inside(sheet) && !!body && body.height > 40, sheet ? `panel ${sheet.height.toFixed(0)}px tall at y ${sheet.y.toFixed(0)}` : 'no section.sheet')
      await page.screenshot({ path: join(SHOTS, `${tab}-open.png`) })
      const collapse = page.getByRole('button', { name: 'Collapse panel' })
      if (await collapse.count()) await collapse.first().click()
    } else check(tab, 'panel opens on screen', false, 'no button named Expand panel')
  }

  const errs = errors.filter((e) => !IGNORE.some((re) => re.test(e)))
  check(tab, 'no page errors', errs.length === 0, errs.slice(0, 2).join(' | '))
}

// ------------------------------------------------------------------- run
let BASE = urlArg ? (urlArg.endsWith('/') ? urlArg : `${urlArg}/`) : null
let browser = null
try {
  if (!BASE) BASE = await buildAndServe()
  mkdirSync(SHOTS, { recursive: true })
  console.log(`checking ${BASE} at ${W}×${H}…`)
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] })
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  page.setDefaultTimeout(8000)
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
  for (const tab of ['recommend', 'hot', 'cold', 'condensate', 'duct', 'explore']) {
    try {
      await checkTab(page, tab, errors)
    } catch (e) {
      check(tab, 'tab ran', false, e.message.split('\n')[0])
      await page.screenshot({ path: join(SHOTS, `${tab}-error.png`) }).catch(() => {})
    }
  }
} catch (e) {
  check('setup', 'build and serve', false, e.message)
} finally {
  await browser?.close()
  cleanup()
}

const w = Math.max(...results.map((r) => r.what.length))
let last = ''
for (const r of results) {
  if (r.ok && process.env.PHONE_CHECK_QUIET) continue
  const tab = r.tab === last ? '' : r.tab
  last = r.tab
  console.log(`${r.ok ? ' ok ' : 'FAIL'}  ${tab.padEnd(11)} ${r.what.padEnd(w)}  ${r.ok ? '' : r.detail}`)
}
console.log(`\n${failed ? `${failed} failed` : 'all passed'} · ${results.length} checks · ${secs()} s · screenshots in app/test-results/phone/`)
process.exit(failed ? 1 : 0)
