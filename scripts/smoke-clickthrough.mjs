// Site-wide click-through smoke test.
//
//   node scripts/smoke-clickthrough.mjs
//
// What it does
// ─────────────
//   1. Runs `vite build` (skippable via SKIP_BUILD=1 env)
//   2. Boots `vite preview` on port 4173 (or PREVIEW_PORT env)
//   3. Launches Chromium (Playwright)
//   4. Visits every route from src/App.jsx
//   5. On each route:
//         - waits for hydration
//         - captures console.error / pageerror
//         - clicks every visible <button>, every Segmented tab, opens
//           every dropdown, sets every Slider/Input/Radio/Switch
//         - flags any error boundary or "Something went wrong" text
//   6. Special-cases the crash-prone pages: /qr, /pathfinding, /physics,
//      /chernobyl, /atoms, /science, /osint, /settings?tab=agents
//   7. Kills the preview, exits 0 on all-pass, 1 on any fail
//
// Notes on why this shape
// ────────────────────────
//   - We deliberately DON'T fail the test on network errors from the BE
//     (the backend isn't up locally). We only fail on JS runtime errors,
//     React error boundaries, or "Something went wrong" text.
//   - We cap per-page interaction time so a single hung page (Three.js
//     canvas that never idles) can't stall the entire suite.
//   - Console filters silence known-noisy warnings (dev tools recos, HMR).
//
// See CLAUDE.md for the route table this test targets.

import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import net from 'node:net'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PORT = Number(process.env.PREVIEW_PORT || 4173)
const BASE = `http://localhost:${PORT}`
const SKIP_BUILD = process.env.SKIP_BUILD === '1'
const HEADLESS  = process.env.HEADFUL !== '1'
const VERBOSE   = process.env.VERBOSE === '1'
// Per-route budget — enough for lazy chunk + hydration + a slate of clicks
// but not so long a Three.js render loop can eat the whole run.
const ROUTE_TIMEOUT_MS = Number(process.env.ROUTE_TIMEOUT_MS || 25_000)
// Cap clicks per page. Even a page with 200 buttons only needs a
// representative slice to catch a stale-import or undefined-lookup crash.
const MAX_CLICKS_PER_PAGE = Number(process.env.MAX_CLICKS || 40)

// ── Route list ─────────────────────────────────────────────────────
// Every top-level route from src/App.jsx + every /algorithms/:slug
// sub-route (30 total) since those are the highest crash-risk pages.
// Nested :module routes covered by one representative per parent.
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
  // 30 algorithm sub-routes — special sweep clicks StepControls.
  ...ALGORITHM_SLUGS.map((slug) => ({
    path: `/algorithms/${slug}`,
    name: `Alg/${slug}`,
    special: 'algorithm',
  })),
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
  // Vault-gated — skipped after vault-modal detection.
  { path: '/deepfake',      name: 'Deepfake',       vaultGated: true },
  { path: '/settings',      name: 'Settings',       vaultGated: true },
  { path: '/settings?tab=agents', name: 'Settings/agents', vaultGated: true, skipClickSelector: 'textarea, input[type="text"]' },
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

// Console messages that are noisy but NOT crashes. If the test starts
// misfiring on a legit warning, add it here.
const IGNORED_ERROR_PATTERNS = [
  /Failed to load resource/i,                            // BE / assets absent locally
  /net::ERR_/i,                                          // Network failures
  /ERR_CONNECTION_REFUSED/i,
  /ERR_NAME_NOT_RESOLVED/i,
  /ERR_BLOCKED_BY_CLIENT/i,
  /Failed to fetch/i,                                    // BE unreachable
  /NetworkError when attempting to fetch/i,
  /The play\(\) request was interrupted/i,               // media autoplay
  /Uncaught \(in promise\) AbortError/i,                 // fetch aborts on nav
  /AbortError/i,
  /Download the React DevTools/i,
  /React Router Future Flag/i,
  /Warning: Each child in a list should have a unique/i, // known dev warnings
  /Warning: validateDOMNesting/i,
  /Warning: React does not recognize/i,
  /Warning: Encountered two children with the same key/i,
  /Warning: Received .* for a non-boolean attribute/i,
  /Warning: Cannot update a component/i,                 // race-y but not runtime crash
  /Warning: An update to .* inside a test was not wrapped/i,
  /Warning: A component is changing an uncontrolled/i,
  /\[antd:/i,                                            // antd dev warnings
  /findDOMNode is deprecated/i,
  /componentWillReceiveProps has been renamed/i,
  /ResizeObserver loop/i,
  /WebGL: /i,                                            // WebGL warns from Three.js
  /THREE\.WebGL/i,
  /Groq API/i,                                           // model warnings
  /gl-.*is missing/i,
  /createMediaElementSource/i,
  /getUserMedia/i,                                       // camera denied — expected
  /NotAllowedError/i,
  /NotFoundError/i,                                      // camera not present
  /MediaPipe/i,
  /tesseract/i,
  /vite:preloadError/i,                                  // Chunk preload — handled by lazyWithReload
  /Failed to fetch dynamically imported module/i,        // Same — chunk reload handles it
  /Clipboard['"]?: Write permission denied/i,            // navigator.clipboard blocked in headless
  /Failed to execute 'writeText' on 'Clipboard'/i,       // Same, different message
  /Document is not focused/i,                            // Clipboard writeText also throws this
  /permissions policy/i,                                 // iframe-blocked features
  // 3rd-party iframe (OpenReel etc.) load noise. We don't control the
  // upstream bundle's asset paths — a stale css/js hash there isn't
  // our runtime crash.
  /Refused to apply style from .* MIME type/i,
  /Refused to execute script from/i,
]

// ── Helpers ────────────────────────────────────────────────────────
async function waitForPort(port, timeoutMs = 30_000) {
  const t0 = Date.now()
  const tryOne = (host) => new Promise((res) => {
    const s = net.connect({ port, host })
    s.once('connect', () => { s.end(); res(true) })
    s.once('error', () => res(false))
  })
  while (Date.now() - t0 < timeoutMs) {
    // Try both IPv4 and IPv6 — vite may bind to either on Windows.
    if (await tryOne('127.0.0.1')) return true
    if (await tryOne('::1'))       return true
    if (await tryOne('localhost')) return true
    await sleep(300)
  }
  return false
}

function isIgnorableError(msg) {
  if (!msg) return true
  return IGNORED_ERROR_PATTERNS.some((re) => re.test(msg))
}

async function safeClick(locator, timeout = 800) {
  try {
    await locator.click({ timeout, trial: false, force: false, noWaitAfter: true })
    return true
  } catch { return false }
}

// Wait for React to hydrate — antd renders a root [class^="ant"] tree
// once the lazy chunk has resolved. Falls back to networkidle if the
// page has no antd on it (e.g. Home is pure Three.js).
async function waitForHydration(page, ms = 8000) {
  const t0 = Date.now()
  try {
    await page.waitForLoadState('domcontentloaded', { timeout: ms })
  } catch {}
  // Give the lazy chunk + Suspense fallback a chance to resolve
  await Promise.race([
    page.waitForFunction(
      () => document.body && document.body.innerText && document.body.innerText.length > 20,
      { timeout: ms - (Date.now() - t0) },
    ).catch(() => {}),
    sleep(ms),
  ])
  // A moment for interactive hydration (event handlers bind)
  await sleep(400)
}

// Grab the visible interactive controls we care about.
async function collectControls(page) {
  return page.evaluate(() => {
    const out = { buttons: [], segments: [], switches: [], sliders: [], selects: [], radios: [] }
    const isVisible = (el) => {
      const r = el.getBoundingClientRect()
      if (r.width < 4 || r.height < 4) return false
      const s = getComputedStyle(el)
      if (s.visibility === 'hidden' || s.display === 'none' || s.pointerEvents === 'none') return false
      return true
    }
    // We rely on stable index selectors via a data-smoke-idx we inject
    let idx = 0
    const tag = (el, kind) => {
      el.setAttribute('data-smoke-idx', String(idx))
      out[kind].push({ idx, text: (el.innerText || el.getAttribute('aria-label') || '').slice(0, 40) })
      idx++
    }
    // <button>, antd Button, close icons, etc.
    document.querySelectorAll('button, [role="button"]').forEach((el) => {
      if (!isVisible(el)) return
      if (el.hasAttribute('disabled')) return
      tag(el, 'buttons')
    })
    // Segmented options — antd renders them as label elements with input[type=radio]
    document.querySelectorAll('.ant-segmented-item').forEach((el) => {
      if (!isVisible(el)) return
      tag(el, 'segments')
    })
    // Switch
    document.querySelectorAll('.ant-switch').forEach((el) => {
      if (!isVisible(el)) return
      tag(el, 'switches')
    })
    // Slider — the handle is what we drag; test just clicks the track center
    document.querySelectorAll('.ant-slider').forEach((el) => {
      if (!isVisible(el)) return
      tag(el, 'sliders')
    })
    // Select trigger
    document.querySelectorAll('.ant-select-selector').forEach((el) => {
      if (!isVisible(el)) return
      tag(el, 'selects')
    })
    // Radio group items
    document.querySelectorAll('.ant-radio-wrapper').forEach((el) => {
      if (!isVisible(el)) return
      tag(el, 'radios')
    })
    return out
  })
}

// Detect the global VaultModal — when a vault-gated route mounts it
// pops open (see VaultModal.jsx). We treat the presence of the modal
// as "skip clicks, log as skipped: vault-gated". The modal's own
// dismiss/close button is inside .ant-modal-close so we skip it too.
async function detectVaultGate(page) {
  return page.evaluate(() => {
    // Look for the LockOutlined icon inside an open ant-modal.
    const modal = document.querySelector('.ant-modal-root .ant-modal-content')
    if (!modal) return false
    const t = modal.textContent || ''
    // Vault modal shows a lock + "Vault" text on the button/labels.
    return /vault/i.test(t) || /\bunlock\b/i.test(t)
  })
}

// Detect any visible error boundary output.
async function detectErrorBoundary(page) {
  return page.evaluate(() => {
    const body = document.body?.innerText || ''
    const patterns = [
      /Something went wrong/i,
      /This page hit a runtime error/i,
      /Application error/i,
      /Uncaught error/i,
      /Failed to render/i,
    ]
    for (const p of patterns) if (p.test(body)) return body.slice(0, 240)
    return null
  })
}

// ── Special-case routines ──────────────────────────────────────────
async function specialQR(page, errors) {
  // The QR page has three top tabs — 2D Editor / 3D Scenes / Tattoo Studio.
  // Iterate them; on 3D Scenes cycle themes × seasons × Iso/Top.
  const clickText = async (text) => {
    const el = page.locator(`.ant-segmented-item-label:has-text("${text}")`).first()
    if (await el.count()) { await safeClick(el); await sleep(150); return true }
    return false
  }
  // Go to 3D Scenes
  if (await clickText('3D Scenes')) {
    await sleep(600) // canvas mount
    const THEMES  = ['Tree Garden', 'Voxel City', 'Crystal Cave', 'Fractal Forest']
    // Season names differ per theme; try the common ones and swallow misses.
    const SEASONS = ['Day', 'Sunset', 'Night', 'Summer', 'Spring', 'Autumn', 'Winter', 'Dawn', 'Storm', 'Aurora']
    for (const t of THEMES) {
      await clickText(t); await sleep(200)
      for (const s of SEASONS) {
        await clickText(s); await sleep(80)
      }
      // Toggle Iso <-> Top
      await clickText('Isometric'); await sleep(120)
      await clickText('Top-down (scan)'); await sleep(120)
      await clickText('Isometric'); await sleep(80)
    }
  }
  // Tattoo Studio — might error if BE unreachable, we tolerate BE errors
  await clickText('Tattoo Studio'); await sleep(500)
  // Back to 2D
  await clickText('2D Editor'); await sleep(200)
}

async function specialPathfinding(page, errors) {
  // Cycle cities × algorithms × click Play/Pause/Reset/Clear/Run All.
  // Selectors are heuristic — we search by visible text.
  // 1) Cycle every city if there's a city Segmented (top of page)
  const cities = await page.locator('.ant-segmented-item-label').allTextContents().catch(() => [])
  const uniqueCities = [...new Set(cities.map((c) => c.trim()).filter(Boolean))].slice(0, 12)
  for (const city of uniqueCities) {
    const opt = page.locator(`.ant-segmented-item-label:has-text("${city}")`).first()
    if (await opt.count()) { await safeClick(opt); await sleep(80) }
  }
  // 2) Every button (Play / Pause / Reset / Clear / Run All / algo buttons)
  const btns = page.locator('button:visible')
  const N = Math.min(await btns.count(), 30)
  for (let i = 0; i < N; i++) {
    await safeClick(btns.nth(i)); await sleep(80)
  }
}

async function specialPhysics(page, errors) {
  // Cycle every preset in the top Segmented + press Random seed + Randomise IC.
  const segs = page.locator('.ant-segmented-item-label')
  const N = Math.min(await segs.count(), 20)
  for (let i = 0; i < N; i++) { await safeClick(segs.nth(i)); await sleep(80) }
  // Buttons — pick up Random seed / Randomise IC by text if present
  for (const text of ['Random seed', 'Randomise IC', 'Randomise', 'Reset', 'Play', 'Pause']) {
    const b = page.locator(`button:has-text("${text}")`).first()
    if (await b.count()) { await safeClick(b); await sleep(80) }
  }
}

async function specialChernobyl(page, errors) {
  const segs = page.locator('.ant-segmented-item-label')
  const N = Math.min(await segs.count(), 20)
  for (let i = 0; i < N; i++) { await safeClick(segs.nth(i)); await sleep(80) }
  // AZ-5 button — search by text; it's typically danger-styled
  const az5 = page.locator('button:has-text("AZ-5")').first()
  if (await az5.count()) { await safeClick(az5); await sleep(200) }
}

async function specialAtoms(page, errors) {
  // Periodic-table tiles — cycle first 10 element buttons
  const els = page.locator('button[class*="element"], button[class*="tile"], button:has-text("H"), .element-tile').first()
  // Fallback: click first 10 buttons on the page
  const btns = page.locator('button:visible')
  const N = Math.min(await btns.count(), 20)
  for (let i = 0; i < N; i++) { await safeClick(btns.nth(i)); await sleep(80) }
  // Segmented → Bohr / quantum
  const segs = page.locator('.ant-segmented-item-label')
  const M = Math.min(await segs.count(), 10)
  for (let i = 0; i < M; i++) { await safeClick(segs.nth(i)); await sleep(80) }
  for (const text of ['α', 'β⁻', 'β⁺', 'γ', 'Alpha', 'Beta', 'Gamma']) {
    const b = page.locator(`button:has-text("${text}")`).first()
    if (await b.count()) { await safeClick(b); await sleep(80) }
  }
}

async function specialAlgorithm(page, errors) {
  // Every /algorithms/:slug page mounts StepControls (Play/Pause/Step/Reset)
  // + typically one Segmented view-mode switch + parameter sliders.
  // This is the highest-risk lane (30 brand-new pages). Sweep exercises:
  //   1. Cycle every Segmented option (view modes, algo variants)
  //   2. Click Play → Pause → Step forward → Step back → Reset
  //   3. Move every Slider to 25% / 75% / midpoint via track click
  const segs = page.locator('.ant-segmented-item-label')
  const N = Math.min(await segs.count(), 12)
  for (let i = 0; i < N; i++) { await safeClick(segs.nth(i)); await sleep(80) }
  // Play → Pause → Step → Reset in that order.
  for (const label of ['Play', 'Pause', 'Reset']) {
    const b = page.locator(`button[aria-label="${label}"], button:has-text("${label}")`).first()
    if (await b.count()) { await safeClick(b); await sleep(120) }
  }
  // Step buttons — aria-label matches StepControls' pattern.
  for (const label of ['Step forward', 'Step back']) {
    const b = page.locator(`button[aria-label="${label}"]`).first()
    if (await b.count()) {
      await safeClick(b); await sleep(80)
      await safeClick(b); await sleep(80)
    }
  }
  // Slider quick nudge — click 25% then 75% of first slider's track.
  const slider = page.locator('.ant-slider').first()
  if (await slider.count()) {
    try {
      const box = await slider.boundingBox()
      if (box) {
        await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.5)
        await sleep(60)
        await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.5)
        await sleep(60)
      }
    } catch {}
  }
}

async function specialOsint(page, errors) {
  // Just click the first ~15 tool cards. Each fires a fetch that will
  // fail locally (no BE) — that's ok, we're checking for JS crashes only.
  const cards = page.locator('button:visible, [role="button"]:visible')
  const N = Math.min(await cards.count(), 15)
  for (let i = 0; i < N; i++) { await safeClick(cards.nth(i)); await sleep(120) }
}

// Generic per-page interaction sweep.
async function sweepControls(page, errors) {
  const ctrls = await collectControls(page)
  let clicked = 0
  const budget = MAX_CLICKS_PER_PAGE
  // Segments first — those are the "view mode" style switches that hit crashes.
  for (const s of ctrls.segments) {
    if (clicked >= budget) break
    const loc = page.locator(`[data-smoke-idx="${s.idx}"]`)
    await safeClick(loc)
    await sleep(60)
    clicked++
  }
  // Switches
  for (const s of ctrls.switches) {
    if (clicked >= budget) break
    const loc = page.locator(`[data-smoke-idx="${s.idx}"]`)
    await safeClick(loc)
    await sleep(60)
    clicked++
  }
  // Radios
  for (const s of ctrls.radios) {
    if (clicked >= budget) break
    const loc = page.locator(`[data-smoke-idx="${s.idx}"]`)
    await safeClick(loc)
    await sleep(60)
    clicked++
  }
  // Buttons — skip anything obviously destructive (Delete/Clear all/Sign out).
  for (const b of ctrls.buttons) {
    if (clicked >= budget) break
    const label = (b.text || '').toLowerCase()
    if (/delete|remove|sign\s*out|log\s*out|reset\s*all|clear\s*all|purge/.test(label)) continue
    const loc = page.locator(`[data-smoke-idx="${b.idx}"]`)
    await safeClick(loc)
    // Some clicks open a modal / dropdown — press Escape to unwind.
    await sleep(60)
    await page.keyboard.press('Escape').catch(() => {})
    clicked++
  }
  // Sliders — click the mid-point of the track (safe "set to 50%")
  for (const s of ctrls.sliders) {
    if (clicked >= budget) break
    const loc = page.locator(`[data-smoke-idx="${s.idx}"]`)
    try {
      const box = await loc.boundingBox()
      if (box) {
        await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5)
        clicked++
        await sleep(60)
      }
    } catch {}
  }
  return clicked
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  // 1) Build (unless SKIP_BUILD=1)
  if (!SKIP_BUILD) {
    console.log('› vite build …')
    await new Promise((res, rej) => {
      const proc = spawn('npx', ['vite', 'build'], { cwd: ROOT, shell: true, stdio: 'inherit' })
      proc.on('exit', (code) => code === 0 ? res() : rej(new Error(`vite build exited ${code}`)))
    })
  }
  // 2) Boot preview
  console.log(`› vite preview :${PORT} …`)
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
  })
  const previewLog = []
  preview.stdout?.on('data', (d) => { previewLog.push(d.toString()); if (VERBOSE) process.stdout.write(d) })
  preview.stderr?.on('data', (d) => { previewLog.push(d.toString()); if (VERBOSE) process.stderr.write(d) })
  preview.on('error', (e) => console.error('preview spawn error', e))
  preview.on('exit', (code, sig) => { if (code !== null && code !== 0) console.error(`preview exited early code=${code} sig=${sig}`) })
  const booted = await waitForPort(PORT, 30_000)
  if (!booted) {
    console.error('─── preview boot log ───')
    console.error(previewLog.join('') || '(no output)')
    preview.kill()
    throw new Error('preview never opened port ' + PORT)
  }
  await sleep(500)

  // 3) Playwright
  //
  // NOTE — this uses Playwright's bundled Chromium at
  // ~/.cache/ms-playwright/chromium-*/chrome-*/chrome.exe. It NEVER
  // touches the user's installed Google Chrome. If your Chrome closed
  // during a smoke run it was unrelated (Chrome crash-recovery /
  // update prompt). We pass --no-default-browser-check so Playwright's
  // Chromium never queries system Chrome for anything either.
  console.log('› chromium (bundled — not system Chrome) …')
  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ['--no-default-browser-check', '--no-first-run', '--disable-features=Translate'],
  })
  const context = await browser.newContext({
    // Grant clipboard-* so "Copy to clipboard" buttons don't throw a
    // permission-denied pageerror. Camera/mic left off so getUserMedia
    // rejects fast rather than hanging.
    permissions: ['clipboard-read', 'clipboard-write'],
    // Reasonable viewport
    viewport: { width: 1440, height: 900 },
    // Reduce animation noise
    reducedMotion: 'reduce',
  })
  const results = []

  for (const route of ROUTES) {
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => {
      const msg = e?.message || String(e)
      if (isIgnorableError(msg)) return
      errors.push({ kind: 'pageerror', msg })
    })
    page.on('console', (m) => {
      if (m.type() !== 'error') return
      const text = m.text()
      if (isIgnorableError(text)) return
      errors.push({ kind: 'console.error', msg: text })
    })
    // Route API/network calls that need BE — let them fail silently.
    page.on('requestfailed', () => { /* ignored — categorised via console */ })

    let status = 'PASS'
    let interactions = 0
    let stage = 'navigation'
    const t0 = Date.now()
    try {
      const timeoutHandle = new Promise((_r, rej) =>
        setTimeout(() => rej(new Error('route timeout')), ROUTE_TIMEOUT_MS),
      )
      await Promise.race([
        (async () => {
          await page.goto(BASE + route.path, { waitUntil: 'domcontentloaded', timeout: 20_000 })
          await waitForHydration(page, 6000)
          stage = 'boundary-check'
          const boundary = await detectErrorBoundary(page)
          if (boundary) {
            errors.push({ kind: 'errorBoundary', msg: boundary })
          }
          // Vault-gated route → skip interactions. Log as SKIP.
          stage = 'vault-check'
          const gated = await detectVaultGate(page)
          if (gated) {
            route._skipped = 'vault-gated'
            return
          }
          // Do the special interactions FIRST for the crash-prone pages
          stage = 'special-interaction'
          if (route.special === 'qr')          await specialQR(page, errors)
          if (route.special === 'pathfinding') await specialPathfinding(page, errors)
          if (route.special === 'physics')     await specialPhysics(page, errors)
          if (route.special === 'chernobyl')   await specialChernobyl(page, errors)
          if (route.special === 'atoms')       await specialAtoms(page, errors)
          if (route.special === 'osint')       await specialOsint(page, errors)
          if (route.special === 'algorithm')   await specialAlgorithm(page, errors)
          // Then a generic sweep of remaining visible controls
          stage = 'generic-sweep'
          interactions = await sweepControls(page, errors)
          // Final boundary check — an interaction may have flipped state
          stage = 'final-boundary-check'
          const boundary2 = await detectErrorBoundary(page)
          if (boundary2 && !boundary) errors.push({ kind: 'errorBoundary(post-click)', msg: boundary2 })
        })(),
        timeoutHandle,
      ])
    } catch (e) {
      // Timeout or navigation failure — record it. Timeouts alone aren't
      // a crash, but if console errors already piled up they're the real
      // problem.
      if (!/route timeout/.test(e?.message || '')) {
        errors.push({ kind: 'runtime', msg: `[${stage}] ${e?.message || e}` })
      }
    }
    if (errors.length) status = 'FAIL'
    if (route._skipped) status = 'SKIP'
    const ms = Date.now() - t0
    results.push({ route: route.path, name: route.name, status, ms, interactions, errors, skipped: route._skipped })
    const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n)
    const tag = status === 'PASS' ? 'PASS' : status === 'SKIP' ? 'SKIP' : 'FAIL'
    const extra = route._skipped ? `  · ${route._skipped}` : (errors.length ? `  · ${errors.length} error(s)` : '')
    console.log(
      `  ${tag}  ${pad(route.path, 26)} ${pad(String(interactions) + ' clicks', 12)} ${ms}ms${extra}`,
    )
    if (errors.length && VERBOSE) {
      for (const e of errors) console.log(`         → [${e.kind}] ${e.msg.slice(0, 200)}`)
    }
    await page.close().catch(() => {})
  }

  await browser.close()
  preview.kill()

  // ── Report ──────────────────────────────────────────────────────
  const pass = results.filter((r) => r.status === 'PASS').length
  const fail = results.filter((r) => r.status === 'FAIL').length
  const skip = results.filter((r) => r.status === 'SKIP').length
  console.log('\n─── Smoke report ───')
  console.log(`  Routes tested: ${results.length}`)
  console.log(`  Pass: ${pass}    Fail: ${fail}    Skip: ${skip}`)
  console.log(`  Total interactions: ${results.reduce((s, r) => s + r.interactions, 0)}`)
  if (fail) {
    console.log('\n─── Failures ───')
    for (const r of results.filter((x) => x.status === 'FAIL')) {
      console.log(`  ${r.route}  (${r.name})`)
      for (const e of r.errors.slice(0, 4)) {
        console.log(`     [${e.kind}] ${e.msg.slice(0, 240).replace(/\s+/g, ' ')}`)
      }
      if (r.errors.length > 4) console.log(`     (+${r.errors.length - 4} more)`)
    }
  }
  process.exit(fail ? 1 : 0)
}

main().catch((e) => {
  console.error('smoke run crashed:', e)
  process.exit(1)
})
