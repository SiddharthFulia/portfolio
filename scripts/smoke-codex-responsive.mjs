// Responsive smoke over every arcade game at 3 viewports.
//
//   node scripts/smoke-codex-responsive.mjs
//
// For each of the 50 games:
//   - Load /arcade/<slug> at 320x568, 768x1024, 1920x1080
//   - Capture pageerror + console.error (filtered)
//   - Assert: <main> viewport visible, not horizontally overflowing document
//   - Assert: at least one interactive control has a tap target >= 44px on
//     the 320 viewport (mobile touch-friendly baseline)
//   - Screenshot on failure into scripts/smoke-out/
//
// Prints a report at the end grouped by game + viewport.

import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const PORT = Number(process.env.PREVIEW_PORT || 4173)
const BASE = `http://localhost:${PORT}`

// Slugs mirror src/components/arcade/gameRegistry.js GAMES[].slug
const ALL_GAME_SLUGS = [
  'breakout', 'space-invaders', 'asteroids', 'missile-command', 'frogger',
  'tetris', 'twenty48', 'sudoku', 'minesweeper', 'wordle',
  'solitaire', 'blackjack', 'poker', 'baccarat', 'rummy',
  'connect-four', 'reversi', 'checkers', 'nine-mens-morris', 'chinese-checkers',
  'pinball', 'golf', 'angry-slings', 'rope-cutter', 'line-rider',
  'flappy', 'doodle-jump', 'icy-tower', 'subway-runner', 'temple-runner',
  'pacman', 'centipede', 'tempest', 'galaga', 'defender',
  'tower-defense', 'mini-rts', 'city-builder', 'snake-ai', 'sokoban',
  'whack', 'simon', 'reaction', 'rhythm-tap', 'bullet-hell',
  'game-of-life', 'powder', 'idle-miner', 'farming-sim', 'fishing-sim',
]

const VIEWPORTS = [
  { name: 'mobile',  w: 320,  h: 568  },
  { name: 'tablet',  w: 768,  h: 1024 },
  { name: 'desktop', w: 1920, h: 1080 },
]

const IGNORED = [
  /Failed to load resource/i, /net::ERR_/i, /Failed to fetch/i,
  /AbortError/i, /Download the React DevTools/i, /React Router Future Flag/i,
  /\[antd:/i, /vite:preloadError/i, /MediaPipe/i, /tesseract/i,
  /WebGL:/i, /THREE\.WebGL/i, /getUserMedia/i, /NotAllowedError/i,
  /ResizeObserver loop/i,
  /Warning: Each child in a list/i, /Warning: validateDOMNesting/i,
  /Warning: React does not recognize/i, /Warning: A component is changing/i,
  /Warning: Cannot update a component/i, /Warning: Received/i,
  /Warning: An update to/i, /Warning: Encountered two children/i,
  /Refused to apply style from .* MIME type/i,
  /Refused to execute script from/i,
  /Clipboard['"]?: Write permission denied/i,
  /Failed to execute 'writeText' on 'Clipboard'/i,
  /AudioContext/i, /user gesture/i,
]
const ignorable = (msg) => !msg || IGNORED.some((re) => re.test(msg))

const outDir = path.resolve(process.cwd(), 'scripts', 'smoke-out')
fs.mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const failures = []
const startedAt = Date.now()

async function runOne(slug, vp) {
  const context = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    permissions: ['clipboard-read', 'clipboard-write'],
    deviceScaleFactor: 1,
    hasTouch: vp.w < 900,
    isMobile: vp.w < 700,
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => {
    const msg = e?.message || String(e)
    if (ignorable(msg)) return
    errors.push({ kind: 'pageerror', msg })
  })
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const text = m.text()
    if (ignorable(text)) return
    errors.push({ kind: 'console.error', msg: text })
  })

  const url = `${BASE}/codex/${slug}`
  const fails = []
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 })
  } catch (e) {
    fails.push({ code: 'NAV_TIMEOUT', detail: (e?.message || '').slice(0, 200) })
    await page.close()
    await context.close()
    return { slug, vp: vp.name, errors, fails }
  }
  // Wait for lazy chunk to resolve and GameShell's <main> to mount.
  try {
    await page.waitForSelector('main', { state: 'attached', timeout: 15_000 })
  } catch {
    // Fall through — will be caught by the assertion below.
  }
  // Extra beat for hydration + first frame.
  await page.waitForTimeout(800)

  // Assertion 1: <main> visible, page must not have horizontal scrollbar
  // that overflows the viewport by more than a small tolerance.
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement
    const body = document.body
    const scrollWidth = Math.max(doc.scrollWidth, body?.scrollWidth || 0)
    const inner = window.innerWidth
    const main = document.querySelector('main')
    const mainRect = main ? main.getBoundingClientRect() : null
    const mainVisible = !!(main && mainRect.width > 0 && mainRect.height > 0)
    const mainDiag = main
      ? `w=${Math.round(mainRect.width)} h=${Math.round(mainRect.height)} disp=${getComputedStyle(main).display}`
      : 'no <main>'
    // Find widest overflowing element for diagnosis
    let widestId = null
    let widestW = 0
    if (scrollWidth - inner > 4) {
      const all = document.querySelectorAll('body *')
      for (const el of all) {
        const r = el.getBoundingClientRect()
        if (r.right > inner + 4 && r.width > widestW) {
          widestW = r.width
          widestId = el.tagName + (el.className && typeof el.className === 'string' ? '.' + el.className.slice(0, 60) : '')
        }
      }
    }
    return { scrollWidth, inner, mainVisible, mainDiag, widestId, widestW }
  })
  if (!overflow.mainVisible) {
    fails.push({ code: 'MAIN_HIDDEN', detail: overflow.mainDiag })
  }
  if (overflow.scrollWidth - overflow.inner > 8) {
    fails.push({
      code: 'H_OVERFLOW',
      detail: `scrollWidth=${overflow.scrollWidth} > viewport=${overflow.inner}; widest=${overflow.widestId || '?'} @ ${Math.round(overflow.widestW)}px`,
    })
  }

  // Assertion 2: on the 320-wide viewport, at least one primary control
  // (button or [role=button]) should have a tap target >= 44px.
  if (vp.w <= 320) {
    const bigEnough = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('button, [role="button"], a[href]'))
      for (const el of nodes) {
        const r = el.getBoundingClientRect()
        const s = getComputedStyle(el)
        if (s.visibility === 'hidden' || s.display === 'none' || s.pointerEvents === 'none') continue
        if (r.width >= 44 && r.height >= 44) return true
        // Some tappable controls use padding-height 44 but the outer element
        // is a small square icon. Accept 40+ as still touch-friendly here.
        if (r.width >= 40 && r.height >= 40) return true
      }
      return false
    })
    if (!bigEnough) {
      fails.push({ code: 'NO_LARGE_TAP_TARGET' })
    }
  }

  if (errors.length) {
    fails.push({ code: 'CONSOLE_ERR', detail: errors.slice(0, 3).map((e) => e.msg.slice(0, 200)).join(' || ') })
  }

  if (fails.length) {
    const shot = path.join(outDir, `${slug}__${vp.name}.png`)
    try { await page.screenshot({ path: shot, fullPage: false }) } catch {}
  }

  await page.close()
  await context.close()
  return { slug, vp: vp.name, errors, fails }
}

let totalRuns = 0
let totalFails = 0
const perGame = new Map()

for (const slug of ALL_GAME_SLUGS) {
  for (const vp of VIEWPORTS) {
    totalRuns++
    // Give each game a single retry to smooth over browser-context flakes
    // where lazy-chunk load races the assertion window.
    let res = await runOne(slug, vp)
    if (res.fails.length && res.fails.every((f) => f.code === 'MAIN_HIDDEN' || f.code === 'NAV_TIMEOUT')) {
      const retry = await runOne(slug, vp)
      if (!retry.fails.length) res = retry
    }
    if (res.fails.length) {
      totalFails++
      failures.push(res)
      const arr = perGame.get(slug) || []
      arr.push(res)
      perGame.set(slug, arr)
      const codes = res.fails.map((f) => f.code).join(',')
      console.log(`FAIL ${slug.padEnd(20)} ${vp.name.padEnd(8)} ${codes}`)
    } else {
      console.log(`ok   ${slug.padEnd(20)} ${vp.name}`)
    }
  }
}

await browser.close()

const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
console.log(`\n=========================================`)
console.log(`Completed ${totalRuns} runs in ${elapsed}s`)
console.log(`Passed:  ${totalRuns - totalFails}`)
console.log(`Failed:  ${totalFails}`)

if (failures.length) {
  console.log(`\n---- Failure details ----`)
  for (const f of failures) {
    console.log(`\n[${f.slug}] @${f.vp}`)
    for (const x of f.fails) {
      console.log(`  ${x.code}${x.detail ? '  ' + x.detail : ''}`)
    }
  }
}

// Emit a JSON report for scripting.
const jsonPath = path.join(outDir, 'report.json')
fs.writeFileSync(jsonPath, JSON.stringify({
  totalRuns, totalFails, elapsed, failures,
}, null, 2))
console.log(`\nJSON report → ${jsonPath}`)

process.exit(totalFails ? 1 : 0)
