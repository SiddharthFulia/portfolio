// Smoke test for the Analyze tab on /algorithms/dp-knapsack.
//   node scripts/smoke-analyze.mjs
//
// Verifies:
//   1. Page loads without pageerror.
//   2. Language tab bar contains Python + an "Analyze" chip.
//   3. Clicking Python then Analyze surfaces the "Trace this code" CTA.
//   4. Clicking Trace runs the Pyodide tracer end-to-end and shows
//      the transport bar + a non-zero step count.
//
// Uses the dev server at http://localhost:3000 (assumes it's running).

import { chromium } from 'playwright'

const BASE = process.env.SMOKE_BASE || 'http://localhost:3000'
const ROUTE = '/algorithms/dp-knapsack'

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1400, height: 900 },
})
const page = await context.newPage()

const errors = []
page.on('pageerror', (e) => errors.push({ kind: 'pageerror', msg: e?.message }))
page.on('console', (m) => {
  if (m.type() === 'error' && !/AbortError|preloadError|MediaPipe/i.test(m.text())) {
    errors.push({ kind: 'console', msg: m.text() })
  }
})

let ok = true
const step = async (label, fn) => {
  try {
    await fn()
    console.log(`PASS  ${label}`)
  } catch (err) {
    console.log(`FAIL  ${label}\n      → ${err?.message || err}`)
    ok = false
  }
}

console.log(`→ ${BASE}${ROUTE}`)
await page.goto(BASE + ROUTE, { waitUntil: 'domcontentloaded', timeout: 20_000 })
await page.waitForTimeout(1200)

await step('DPKnapsack page loads without pageerror', async () => {
  if (errors.some((e) => e.kind === 'pageerror')) {
    throw new Error(`pageerror(s): ${errors.map((e) => e.msg).join(' | ')}`)
  }
})

await step('Language tab bar shows Python + Analyze chip', async () => {
  const analyzeBtn = page.getByRole('button', { name: /Analyze/i }).first()
  await analyzeBtn.waitFor({ state: 'visible', timeout: 4000 })
  const pyBtn = page.getByRole('button', { name: /^Python$/ }).first()
  await pyBtn.waitFor({ state: 'visible', timeout: 4000 })
})

await step('Switch to Python and open Analyze tab', async () => {
  await page.getByRole('button', { name: /^Python$/ }).first().click()
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: /Analyze/i }).first().click()
  await page.waitForTimeout(500)
  // "Trace this code" CTA visible
  await page.getByRole('button', { name: /Trace this code/i }).waitFor({ state: 'visible', timeout: 4000 })
  // Populate the demo call so the tracer has something to execute.
  const demo = page.locator('#analyze-demo-call')
  await demo.fill('items = [(2, 3), (3, 4), (4, 5), (5, 6)]\nvalue, taken = knapsack01(items, 5)\nprint(value, taken)')
})

await step('Trace click surfaces loading state', async () => {
  await page.getByRole('button', { name: /Trace this code/i }).click()
  // Look for the "Loading runtime" or "Tracing" caption within 3s.
  const banner = page.getByText(/Loading runtime|Tracing execution/i).first()
  await banner.waitFor({ state: 'visible', timeout: 3000 })
})

// Give Pyodide up to 40s cold, 15s warm to finish.
await step('Trace finishes and TransportBar appears (allow ≤ 45s for Pyodide)', async () => {
  const stepCounter = page.getByText(/Step \d+ \/ \d+/i).first()
  await stepCounter.waitFor({ state: 'visible', timeout: 45_000 })
  const txt = await stepCounter.textContent()
  const m = /Step (\d+) \/ (\d+)/.exec(txt || '')
  if (!m) throw new Error(`step counter text unexpected: ${txt}`)
  const total = Number(m[2])
  if (!(total > 0)) throw new Error(`total frames was ${total}, expected > 0`)
  console.log(`      captured ${total} trace frames`)
})

await step('Step forward advances the counter', async () => {
  const before = await page.getByText(/Step \d+ \/ \d+/i).first().textContent()
  await page.getByRole('button', { name: 'Step forward one frame' }).click()
  await page.waitForTimeout(200)
  const after = await page.getByText(/Step \d+ \/ \d+/i).first().textContent()
  if (before === after) throw new Error(`counter did not advance: ${before} → ${after}`)
})

if (errors.length) {
  console.log(`\nConsole errors (${errors.length}):`)
  for (const e of errors.slice(0, 10)) console.log(`  [${e.kind}] ${e.msg}`)
}

await browser.close()
if (!ok) process.exit(1)
console.log('\n✓ Analyze smoke pass.')
