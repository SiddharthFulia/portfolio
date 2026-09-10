// Reproduce blank-page-on-nav for /algorithms/*.
// Navigates through several topics via sidebar links, checks that
// the main content actually renders after each nav.
//
//   node scripts/smoke-algorithms-nav.mjs

import { chromium } from 'playwright'

const PORT = Number(process.env.PREVIEW_PORT || 4173)
const BASE = `http://localhost:${PORT}`

const IGNORED = [
  /Failed to load resource/i, /net::ERR_/i, /React Router Future Flag/i,
  /Download the React DevTools/i, /\[antd:/i, /ResizeObserver loop/i,
]
const ignorable = (msg) => !msg || IGNORED.some((re) => re.test(msg))

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => {
  const msg = e?.message || String(e)
  if (!ignorable(msg)) errors.push({ kind: 'pageerror', msg })
})
page.on('console', (m) => {
  if (m.type() !== 'error') return
  const t = m.text()
  if (!ignorable(t)) errors.push({ kind: 'console.error', msg: t })
})

// All 30 topic slugs.
const SLUGS = [
  'arrays','linked-lists','stacks','queues','hash-tables',
  'graphs','trees','bst','balanced-trees','heaps','tries',
  'segment-trees','fenwick-trees','dsu','mst',
  'divide-conquer','sorting','searching','sieve','kmp',
  'greedy-intervals','greedy-knapsack',
  'dp-knapsack','dp-lcs','dp-lis',
  'convex-hull','graph-traversal','floyd-warshall',
  'dijkstra-bellman','topological-sort',
]

console.log(`GO ${BASE}/algorithms/arrays`)
await page.goto(`${BASE}/algorithms/arrays`, { waitUntil: 'domcontentloaded', timeout: 20_000 })
await page.waitForTimeout(1000)

let blankCount = 0
let ok = 0
const blanks = []

for (const slug of SLUGS.slice(1)) {
  // Click sidebar link via evaluate — avoids Playwright stale-locator issues
  // when the sidebar re-renders on nav.
  const clickResult = await page.evaluate((s) => {
    const a = document.querySelector(`a[href="/algorithms/${s}"]`)
    if (!a) return { ok: false, reason: 'link not found' }
    a.click()
    return { ok: true }
  }, slug)
  if (!clickResult.ok) console.log(`  click ${slug} failed: ${clickResult.reason}`)
  await page.waitForTimeout(800)

  // Check main content is rendered — the hero <h1> should show topic title
  const main = await page.evaluate(() => {
    const h1 = document.querySelector('h1')
    const h1Text = h1?.innerText || ''
    // Count elements inside main column excluding sidebar
    const mainCol = document.querySelector('.flex-1.min-w-0')
    const bodyChildren = mainCol ? mainCol.children.length : 0
    // The direct child that wraps the topic body (added by AlgorithmsShell —
    // it's the motion.div holding the Outlet). Check that its opacity is 1.
    // We identify it as the direct <div> child of mainCol that has children
    // (skipping the mobile-only bits).
    let wrapperOpacity = 1
    if (mainCol) {
      for (const child of mainCol.children) {
        if (child.tagName !== 'DIV') continue
        // Skip small mobile-only wrappers (they use flex layouts).
        if (child.children.length < 2) continue
        // The topic body has spaces + multiple sections.
        if ((child.innerText || '').length > 500) {
          const op = Number(getComputedStyle(child).opacity)
          if (!Number.isNaN(op) && op < wrapperOpacity) wrapperOpacity = op
        }
      }
    }
    const minOpacity = wrapperOpacity
    // Get actual visible text length
    const textLen = (mainCol?.innerText || '').length
    return { h1Text, bodyChildren, opacity: minOpacity, textLen, url: window.location.pathname }
  })

  const isBlank = main.textLen < 200 || main.opacity < 0.5
  if (isBlank) {
    blankCount++
    blanks.push({ slug, ...main })
    console.log(`  BLANK ${slug} — h1="${main.h1Text}" textLen=${main.textLen} opacity=${main.opacity}`)
  } else {
    ok++
    console.log(`  OK    ${slug} — h1="${main.h1Text}" textLen=${main.textLen}`)
  }
}

console.log(`\nRESULT: ${ok} ok, ${blankCount} blank`)
if (blanks.length) {
  console.log('\nBlank pages:')
  for (const b of blanks) console.log('  -', b)
}
if (errors.length) {
  console.log('\nErrors:')
  for (const e of errors.slice(0, 20)) console.log(`  [${e.kind}] ${e.msg}`)
}

await browser.close()
process.exit(blankCount || errors.length ? 1 : 0)
