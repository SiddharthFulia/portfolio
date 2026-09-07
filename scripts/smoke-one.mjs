// One-route debug repro. Mirrors smoke-clickthrough's sweep more closely.
//
//   node scripts/smoke-one.mjs /projects

import { chromium } from 'playwright'

const route = process.argv[2] || '/'
const PORT = Number(process.env.PREVIEW_PORT || 4173)
const BASE = `http://localhost:${PORT}`

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
]
const ignorable = (msg) => !msg || IGNORED.some((re) => re.test(msg))

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  permissions: ['clipboard-read', 'clipboard-write'],
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => {
  const msg = e?.message || String(e)
  if (ignorable(msg)) return
  errors.push({ kind: 'pageerror', msg, stack: (e?.stack || '').split('\n').slice(0, 6).join(' | ') })
})
page.on('console', (m) => {
  if (m.type() !== 'error') return
  const text = m.text()
  if (ignorable(text)) return
  errors.push({ kind: 'console.error', msg: text })
})

console.log(`GO ${BASE}${route}`)
await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 20_000 })
await page.waitForTimeout(1500)

// Mimic sweepControls: tag every control, then click by index.
const ctrls = await page.evaluate(() => {
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
console.log(`Found: ${ctrls.buttons.length} buttons, ${ctrls.segments.length} segs, ${ctrls.switches.length} switches, ${ctrls.sliders.length} sliders`)

let clicked = 0
const clickIdx = async (idx, label) => {
  const loc = page.locator(`[data-smoke-idx="${idx}"]`)
  const preErr = errors.length
  try { await loc.click({ timeout: 800, force: false, noWaitAfter: true }) } catch {}
  await page.waitForTimeout(80)
  await page.keyboard.press('Escape').catch(() => {})
  clicked++
  if (errors.length > preErr) {
    console.log(`  CLICK ${idx} [${label.slice(0,30)}] triggered ${errors.length - preErr} error(s)`)
  }
}
for (const s of ctrls.segments)  await clickIdx(s.idx, s.text)
for (const s of ctrls.switches)  await clickIdx(s.idx, s.text)
for (const s of ctrls.radios)    await clickIdx(s.idx, s.text)
for (const b of ctrls.buttons) {
  if (clicked >= 40) break
  const label = (b.text || '').toLowerCase()
  if (/delete|remove|sign\s*out|log\s*out|reset\s*all|clear\s*all|purge/.test(label)) continue
  await clickIdx(b.idx, b.text)
}

await page.waitForTimeout(400)
await browser.close()
console.log(`\nDONE ${errors.length} error(s), ${clicked} clicks`)
for (const e of errors.slice(0, 40)) {
  console.log(`\n[${e.kind}] ${e.msg}`)
  if (e.stack) console.log(`  ${e.stack}`)
}
process.exit(errors.length ? 1 : 0)
