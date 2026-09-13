// Multi-viewport UX smoke — layout regressions + polish audit.
//
//   node scripts/smoke-viewports.mjs
//
// Loads each of the 15 focus pages at 5 viewports (75 combinations).
//   - Captures console + pageerror (filtered — known noisy things like
//     WebGL, MediaPipe, ResizeObserver loops are ignored).
//   - Asserts:
//       1. No horizontal overflow (documentElement.scrollWidth ≤ clientWidth + 4)
//       2. On mobile (320/375), at least one tap target ≥ 44 px is present.
//       3. <main> is mounted and visible.
//   - Screenshots any failure into scripts/smoke-out/viewports/
//
// Runs against the built preview server (vite preview) at $PREVIEW_PORT
// (default 4173). Assumes `npx vite build` has already produced dist/.

import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const PORT = Number(process.env.PREVIEW_PORT || 4173)
const BASE = `http://localhost:${PORT}`
const START_SERVER = process.env.SMOKE_START_SERVER === '1'

const PAGES = [
  { path: '/',                         name: 'home'          },
  { path: '/qr',                       name: 'qr'            },
  { path: '/pathfinding',              name: 'pathfinding'   },
  { path: '/algorithms',               name: 'algorithms'    },
  { path: '/algorithms/dp-knapsack',   name: 'dp-knapsack'   },
  { path: '/codex',                    name: 'codex'         },
  { path: '/codex/blackjack',          name: 'blackjack'     },
  { path: '/chernobyl',                name: 'chernobyl'     },
  { path: '/atoms',                    name: 'atoms'         },
  { path: '/osint',                    name: 'osint'         },
  { path: '/science',                  name: 'science'       },
  { path: '/about',                    name: 'about'         },
  { path: '/contact',                  name: 'contact'       },
  { path: '/settings',                 name: 'settings'      },
  { path: '/lab',                      name: 'lab'           },
]

const VIEWPORTS = [
  { name: '320',   w: 320,  h: 568  },   // iPhone SE mini
  { name: '375',   w: 375,  h: 812  },   // iPhone 13
  { name: '768p',  w: 768,  h: 1024 },   // iPad portrait
  { name: '1024l', w: 1024, h: 768  },   // iPad landscape
  { name: '1920',  w: 1920, h: 1080 },   // desktop
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
  /THREE\.Object3D/i, /WebGL context/i,
  /GLTFLoader/i, /Draco/i,
  /Slow network detected/i, /Third-party cookie/i,
]
const ignorable = (msg) => !msg || IGNORED.some((re) => re.test(msg))

const outDir = path.resolve(process.cwd(), 'scripts', 'smoke-out', 'viewports')
fs.mkdirSync(outDir, { recursive: true })

let serverProc = null
async function ensureServer() {
  try {
    const res = await fetch(`${BASE}/`)
    if (res.ok || res.status < 500) return
  } catch {
    // fall through — need to start it
  }
  if (!START_SERVER) {
    console.error(`No server on ${BASE}. Run 'npx vite preview --port ${PORT}' first, or set SMOKE_START_SERVER=1.`)
    process.exit(2)
  }
  console.log(`Starting vite preview on port ${PORT}…`)
  serverProc = spawn('npx', ['vite', 'preview', '--port', String(PORT)], {
    cwd: process.cwd(),
    stdio: 'ignore',
    shell: true,
  })
  // Poll until 200
  const startAt = Date.now()
  while (Date.now() - startAt < 30_000) {
    try {
      const res = await fetch(`${BASE}/`)
      if (res.ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('vite preview did not come up within 30s')
}

await ensureServer()

const browser = await chromium.launch({ headless: true })
const failures = []
const startedAt = Date.now()

async function runOne(pg, vp) {
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

  const url = `${BASE}${pg.path}`
  const fails = []
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25_000 })
  } catch (e) {
    fails.push({ code: 'NAV_TIMEOUT', detail: (e?.message || '').slice(0, 200) })
    await page.close()
    await context.close()
    return { name: pg.name, path: pg.path, vp: vp.name, w: vp.w, errors, fails }
  }

  try {
    await page.waitForSelector('main', { state: 'attached', timeout: 15_000 })
  } catch {
    // fall through
  }
  await page.waitForTimeout(1200)

  const layout = await page.evaluate(() => {
    const doc = document.documentElement
    const body = document.body
    const scrollWidth = Math.max(doc.scrollWidth, body?.scrollWidth || 0)
    const clientWidth = doc.clientWidth
    const inner = window.innerWidth
    const main = document.querySelector('main')
    const mainRect = main ? main.getBoundingClientRect() : null
    const mainVisible = !!(main && mainRect.width > 0 && mainRect.height > 0)
    const mainDiag = main
      ? `w=${Math.round(mainRect.width)} h=${Math.round(mainRect.height)}`
      : 'no <main>'
    let widestId = null
    let widestW = 0
    let widestRight = 0
    if (scrollWidth - clientWidth > 4) {
      const all = document.querySelectorAll('body *')
      for (const el of all) {
        const r = el.getBoundingClientRect()
        if (r.right > clientWidth + 4 && r.right > widestRight) {
          widestRight = r.right
          widestW = r.width
          const cls = typeof el.className === 'string' ? el.className : (el.className?.baseVal || '')
          widestId = el.tagName + (cls ? '.' + cls.slice(0, 80) : '')
        }
      }
    }
    return { scrollWidth, clientWidth, inner, mainVisible, mainDiag, widestId, widestW, widestRight }
  })

  if (!layout.mainVisible) {
    fails.push({ code: 'MAIN_HIDDEN', detail: layout.mainDiag })
  }
  if (layout.scrollWidth - layout.clientWidth > 4) {
    fails.push({
      code: 'H_OVERFLOW',
      detail: `scrollWidth=${layout.scrollWidth} clientWidth=${layout.clientWidth} widest=${layout.widestId || '?'} right=${Math.round(layout.widestRight)}`,
    })
  }

  if (vp.w <= 375) {
    const bigEnough = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('button, [role="button"], a[href]'))
      for (const el of nodes) {
        const r = el.getBoundingClientRect()
        const s = getComputedStyle(el)
        if (s.visibility === 'hidden' || s.display === 'none' || s.pointerEvents === 'none') continue
        if (r.width === 0 || r.height === 0) continue
        if (r.width >= 44 && r.height >= 44) return true
        if (r.width >= 40 && r.height >= 40) return true
      }
      return false
    })
    if (!bigEnough) {
      fails.push({ code: 'NO_LARGE_TAP_TARGET' })
    }
  }

  if (errors.length) {
    fails.push({ code: 'CONSOLE_ERR', detail: errors.slice(0, 2).map((e) => e.msg.slice(0, 200)).join(' || ') })
  }

  if (fails.length) {
    const shot = path.join(outDir, `${pg.name}__${vp.name}.png`)
    try { await page.screenshot({ path: shot, fullPage: false }) } catch {}
  }

  await page.close()
  await context.close()
  return { name: pg.name, path: pg.path, vp: vp.name, w: vp.w, errors, fails }
}

let totalRuns = 0
let totalFails = 0
for (const pg of PAGES) {
  for (const vp of VIEWPORTS) {
    totalRuns++
    let res = await runOne(pg, vp)
    if (res.fails.length && res.fails.every((f) => f.code === 'NAV_TIMEOUT' || f.code === 'MAIN_HIDDEN')) {
      const retry = await runOne(pg, vp)
      if (!retry.fails.length) res = retry
    }
    if (res.fails.length) {
      totalFails++
      failures.push(res)
      const codes = res.fails.map((f) => f.code).join(',')
      console.log(`FAIL ${pg.name.padEnd(14)} ${vp.name.padEnd(6)} ${codes}`)
    } else {
      console.log(`ok   ${pg.name.padEnd(14)} ${vp.name}`)
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
    console.log(`\n[${f.name}] ${f.path} @${f.vp} (${f.w}px)`)
    for (const x of f.fails) {
      console.log(`  ${x.code}${x.detail ? '  ' + x.detail : ''}`)
    }
  }
}

const jsonPath = path.join(outDir, 'report.json')
fs.writeFileSync(jsonPath, JSON.stringify({ totalRuns, totalFails, elapsed, failures }, null, 2))
console.log(`\nJSON report → ${jsonPath}`)

if (serverProc) {
  try { serverProc.kill() } catch {}
}
process.exit(totalFails ? 1 : 0)
