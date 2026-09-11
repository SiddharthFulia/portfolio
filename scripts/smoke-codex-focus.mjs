// Targeted responsive smoke — only re-tests the games we're fixing.
//
//   node scripts/smoke-codex-focus.mjs
//
// Same viewport matrix as the full script, but only the failing set.

import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const PORT = Number(process.env.PREVIEW_PORT || 4173)
const BASE = `http://localhost:${PORT}`

const SLUGS = (process.env.SMOKE_SLUGS || 'nine-mens-morris,subway-runner,city-builder,rhythm-tap').split(',')
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

for (const slug of SLUGS) {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
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
    try {
      await page.goto(`${BASE}/codex/${slug}`, { waitUntil: 'domcontentloaded', timeout: 20_000 })
    } catch (e) {
      console.log(`FAIL ${slug} @${vp.name} NAV: ${e.message.slice(0, 120)}`)
      await page.close(); await context.close(); continue
    }
    await page.waitForTimeout(1500)
    const diag = await page.evaluate(() => {
      const main = document.querySelector('main')
      const r = main?.getBoundingClientRect()
      const inner = window.innerWidth
      return {
        hasMain: !!main,
        mainW: r ? Math.round(r.width) : 0,
        mainH: r ? Math.round(r.height) : 0,
        mainDisp: main ? getComputedStyle(main).display : null,
        scrollW: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        inner,
      }
    })
    console.log(`${slug} @${vp.name}: main=${diag.mainW}x${diag.mainH} disp=${diag.mainDisp} scrollW=${diag.scrollW}/${diag.inner} errs=${errors.length}`)
    for (const e of errors.slice(0, 3)) console.log(`   [${e.kind}] ${e.msg.slice(0, 200)}`)
    await page.close()
    await context.close()
  }
}
await browser.close()
