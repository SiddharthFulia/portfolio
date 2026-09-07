// Batch smoke driver — runs the same coverage as smoke-clickthrough.mjs
// but flushes route-by-route status so it works over Windows console
// redirection (which line-buffers node stdout ~4KB at a time).
//
// Assumes preview server already up on PORT (default 4173).
//
//   node scripts/smoke-batch.mjs

import { chromium } from 'playwright'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = Number(process.env.PREVIEW_PORT || 4173)
const BASE = `http://localhost:${PORT}`
const ROUTE_TIMEOUT_MS = Number(process.env.ROUTE_TIMEOUT_MS || 20_000)
const MAX_CLICKS_PER_PAGE = Number(process.env.MAX_CLICKS || 40)
const START_INDEX = Number(process.env.START_INDEX || 0)

// Force stdout flush per line so redirected runs progress live.
const log = (s) => { process.stdout.write(s + '\n') }

const ALGORITHM_SLUGS = [
  'arrays', 'linked-lists', 'stacks', 'queues', 'hash-tables',
  'graphs', 'trees', 'bst', 'balanced-trees', 'heaps',
  'tries', 'segment-trees', 'fenwick-trees', 'dsu', 'mst',
  'divide-conquer', 'sorting', 'searching', 'sieve', 'kmp',
  'greedy-intervals', 'greedy-knapsack', 'dp-knapsack', 'dp-lcs', 'dp-lis',
  'convex-hull', 'graph-traversal', 'floyd-warshall', 'dijkstra-bellman', 'topological-sort',
]

const ROUTES = [
  { path: '/',              name: 'Home' },
  { path: '/about',         name: 'About' },
  { path: '/projects',      name: 'Projects' },
  { path: '/contact',       name: 'Contact' },
  { path: '/lab',           name: 'Lab' },
  { path: '/learn',         name: 'Learn' },
  { path: '/algorithms',    name: 'Algorithms' },
  ...ALGORITHM_SLUGS.map((slug) => ({ path: `/algorithms/${slug}`, name: `Alg/${slug}`, special: 'algorithm' })),
  { path: '/creative',      name: 'Creative' },
  { path: '/chess',         name: 'Chess' },
  { path: '/chess-classic', name: 'ChessViz' },
  { path: '/science',       name: 'Science' },
  { path: '/science/apod',  name: 'Science/APOD' },
  { path: '/vision',        name: 'Vision' },
  { path: '/explore',       name: 'Explore' },
  { path: '/explore/pokedex', name: 'Explore/Pokedex' },
  { path: '/ai',            name: 'AIChat' },
  { path: '/ai-video',      name: 'AIVideo' },
  { path: '/image-enhancer', name: 'ImageEnhancer' },
  { path: '/ai-studio',     name: 'AIStudio' },
  { path: '/3d',            name: 'Dragon3D' },
  { path: '/deepfake',      name: 'Deepfake', vaultGated: true },
  { path: '/settings',      name: 'Settings', vaultGated: true },
  { path: '/runner',        name: 'Runner' },
  { path: '/simple-game',   name: 'SimpleGame' },
  { path: '/physics',       name: 'PhysicsLab',   special: 'physics' },
  { path: '/pathfinding',   name: 'Pathfinding',  special: 'pathfinding' },
  { path: '/chernobyl',     name: 'Chernobyl',    special: 'chernobyl' },
  { path: '/atoms',         name: 'Atoms',        special: 'atoms' },
  { path: '/gesture-memes', name: 'GestureMemes' },
  { path: '/gesture-hammy', name: 'GestureHammy' },
  { path: '/osint',         name: 'Osint',        special: 'osint' },
  { path: '/qr',            name: 'QRCompiler',   special: 'qr' },
  { path: '/summarizer',    name: 'Summarizer' },
  { path: '/yt-dl',         name: 'YoutubeDl' },
  { path: '/hand',          name: 'HandTracking' },
  { path: '/lipsync',       name: 'LipSync' },
  { path: '/audio',         name: 'AudioStudio' },
  { path: '/splat',         name: 'SplatViewer' },
  { path: '/showreel',      name: 'Showreel' },
  { path: '/room',          name: 'RoomDesign' },
  { path: '/edit',          name: 'VideoEditor' },
  { path: '/edit/advanced', name: 'VideoEditorAdvanced' },
  { path: '/edit/library',  name: 'VideoLibrary' },
  { path: '/realism',       name: 'Realism' },
  { path: '/realism/library', name: 'RealismLibrary' },
]

const IGNORED = [
  /Failed to load resource/i, /net::ERR_/i, /Failed to fetch/i,
  /AbortError/i, /Download the React DevTools/i, /React Router Future Flag/i,
  /Warning:/i, /\[antd:/i, /vite:preloadError/i, /MediaPipe/i, /tesseract/i,
  /WebGL:/i, /THREE\.WebGL/i, /getUserMedia/i, /NotAllowedError/i,
  /NotFoundError/i, /ResizeObserver loop/i, /Groq API/i, /gl-.*is missing/i,
  /createMediaElementSource/i, /Clipboard['"]?: Write permission denied/i,
  /Failed to execute 'writeText' on 'Clipboard'/i, /Document is not focused/i,
  /permissions policy/i, /findDOMNode is deprecated/i,
  /componentWillReceiveProps has been renamed/i,
  /Failed to fetch dynamically imported module/i,
  /Refused to apply style from .* MIME type/i,
  /Refused to execute script from/i,
]
const ignorable = (msg) => !msg || IGNORED.some((re) => re.test(msg))

async function safeClick(loc, timeout = 800) {
  try { await loc.click({ timeout, force: false, noWaitAfter: true }); return true } catch { return false }
}

async function detectVault(page) {
  return page.evaluate(() => {
    const modal = document.querySelector('.ant-modal-root .ant-modal-content')
    if (!modal) return false
    const t = modal.textContent || ''
    return /vault/i.test(t) || /\bunlock\b/i.test(t)
  })
}

async function collectControls(page) {
  return page.evaluate(() => {
    const out = { buttons: [], segments: [], switches: [], sliders: [], radios: [] }
    const isVisible = (el) => {
      const r = el.getBoundingClientRect()
      if (r.width < 4 || r.height < 4) return false
      const s = getComputedStyle(el)
      if (s.visibility === 'hidden' || s.display === 'none' || s.pointerEvents === 'none') return false
      return true
    }
    let idx = 0
    const tag = (el, kind) => {
      el.setAttribute('data-smoke-idx', String(idx))
      out[kind].push({ idx, text: (el.innerText || el.getAttribute('aria-label') || '').slice(0, 40) })
      idx++
    }
    document.querySelectorAll('button, [role="button"]').forEach((el) => {
      if (!isVisible(el)) return
      if (el.hasAttribute('disabled')) return
      tag(el, 'buttons')
    })
    document.querySelectorAll('.ant-segmented-item').forEach((el) => { if (isVisible(el)) tag(el, 'segments') })
    document.querySelectorAll('.ant-switch').forEach((el) => { if (isVisible(el)) tag(el, 'switches') })
    document.querySelectorAll('.ant-slider').forEach((el) => { if (isVisible(el)) tag(el, 'sliders') })
    document.querySelectorAll('.ant-radio-wrapper').forEach((el) => { if (isVisible(el)) tag(el, 'radios') })
    return out
  })
}

async function sweep(page) {
  const ctrls = await collectControls(page)
  let clicked = 0
  const budget = MAX_CLICKS_PER_PAGE
  for (const s of ctrls.segments) {
    if (clicked >= budget) break
    await safeClick(page.locator(`[data-smoke-idx="${s.idx}"]`))
    await sleep(60); clicked++
  }
  for (const s of ctrls.switches) {
    if (clicked >= budget) break
    await safeClick(page.locator(`[data-smoke-idx="${s.idx}"]`))
    await sleep(60); clicked++
  }
  for (const s of ctrls.radios) {
    if (clicked >= budget) break
    await safeClick(page.locator(`[data-smoke-idx="${s.idx}"]`))
    await sleep(60); clicked++
  }
  for (const b of ctrls.buttons) {
    if (clicked >= budget) break
    const l = (b.text || '').toLowerCase()
    if (/delete|remove|sign\s*out|log\s*out|reset\s*all|clear\s*all|purge/.test(l)) continue
    await safeClick(page.locator(`[data-smoke-idx="${b.idx}"]`))
    await sleep(60)
    await page.keyboard.press('Escape').catch(() => {})
    clicked++
  }
  for (const s of ctrls.sliders) {
    if (clicked >= budget) break
    try {
      const box = await page.locator(`[data-smoke-idx="${s.idx}"]`).boundingBox()
      if (box) {
        await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5)
        clicked++; await sleep(60)
      }
    } catch {}
  }
  return clicked
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  permissions: ['clipboard-read', 'clipboard-write'],
  reducedMotion: 'reduce',
})

const results = []
for (let i = START_INDEX; i < ROUTES.length; i++) {
  const route = ROUTES[i]
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => {
    const msg = e?.message || String(e)
    if (ignorable(msg)) return
    errors.push({ kind: 'pageerror', msg })
  })
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const t = m.text()
    if (ignorable(t)) return
    errors.push({ kind: 'console.error', msg: t })
  })

  const t0 = Date.now()
  let status = 'PASS', clicks = 0, note = ''
  try {
    await Promise.race([
      (async () => {
        await page.goto(BASE + route.path, { waitUntil: 'domcontentloaded', timeout: 15_000 })
        await sleep(1200)
        if (await detectVault(page)) { status = 'SKIP'; note = 'vault-gated'; return }
        clicks = await sweep(page)
      })(),
      new Promise((_r, rej) => setTimeout(() => rej(new Error('route timeout')), ROUTE_TIMEOUT_MS)),
    ])
  } catch (e) {
    if (!/route timeout/.test(e?.message || '')) errors.push({ kind: 'runtime', msg: e?.message || String(e) })
    else note = 'timeout'
  }
  if (errors.length) status = 'FAIL'
  const ms = Date.now() - t0
  results.push({ ...route, status, ms, clicks, errors, note })
  const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n)
  log(`  ${pad(status, 4)}  ${pad(route.path, 28)} ${pad(String(clicks) + ' clicks', 12)} ${ms}ms${note ? ' · ' + note : ''}${errors.length ? ' · ' + errors.length + ' err' : ''}`)
  if (errors.length) {
    for (const e of errors.slice(0, 5)) log(`         [${e.kind}] ${e.msg.slice(0, 220).replace(/\s+/g, ' ')}`)
  }
  await page.close().catch(() => {})
}

await browser.close()
const pass = results.filter((r) => r.status === 'PASS').length
const fail = results.filter((r) => r.status === 'FAIL').length
const skip = results.filter((r) => r.status === 'SKIP').length
log(`\n─── Smoke report ───`)
log(`  Routes tested: ${results.length}`)
log(`  Pass: ${pass}    Fail: ${fail}    Skip: ${skip}`)
log(`  Total interactions: ${results.reduce((s, r) => s + r.clicks, 0)}`)
if (fail) {
  log('\n─── Failures ───')
  for (const r of results.filter((x) => x.status === 'FAIL')) {
    log(`  ${r.path}`)
    for (const e of r.errors.slice(0, 6)) log(`     [${e.kind}] ${e.msg.slice(0, 260).replace(/\s+/g, ' ')}`)
  }
}
process.exit(fail ? 1 : 0)
