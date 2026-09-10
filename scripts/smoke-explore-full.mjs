// Full smoke of the 9 explore modules with mocked BE endpoints.
//
// Preview server is on localhost:4173 which the prod BE won't accept
// CORS-wise. We intercept each proxy endpoint and return real fixture
// data (or fetch upstream when it's CORS-friendly, e.g. TheMealDB).

import { chromium } from 'playwright'

const PORT = Number(process.env.PREVIEW_PORT || 4173)
const BASE = `http://localhost:${PORT}`

const MOCKS = {
  'quotes': {
    handler: async (route) => {
      const arr = Array.from({ length: 50 }, (_, i) => ({
        q: `Test quote ${Math.random().toString(36).slice(2, 8)}#${i}`,
        a: `Author ${i % 20}`,
        c: 30,
      }))
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(arr) })
    },
  },
  'pokemon': {
    handler: async (route) => {
      const results = Array.from({ length: 151 }, (_, i) => ({
        name: `poke${i + 1}`,
        url: `https://pokeapi.co/api/v2/pokemon/${i + 1}/`,
      }))
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 151, next: null, results }) })
    },
  },
  'pokemon-detail': {
    handler: async (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        id: 1, name: 'bulbasaur', height: 7, weight: 69, base_experience: 64,
        types: [{ type: { name: 'grass' } }, { type: { name: 'poison' } }],
        stats: [{ base_stat: 45, stat: { name: 'hp' } }, { base_stat: 49, stat: { name: 'attack' } }],
        abilities: [{ ability: { name: 'overgrow' }, is_hidden: false }],
      }) })
    },
  },
  'rickmorty': {
    handler: async (route) => {
      const results = Array.from({ length: 20 }, (_, i) => ({
        id: i + 1, name: `Char ${i + 1}`, status: ['Alive', 'Dead', 'unknown'][i % 3],
        species: 'Human', gender: 'Male', origin: { name: 'Earth' }, location: { name: 'Earth' },
        episode: Array.from({ length: 10 }, (_, j) => `https://ep/${j + 1}`),
        image: `https://picsum.photos/seed/${i}/200/200`, created: new Date().toISOString(),
      }))
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ info: { count: 826, pages: 42 }, results }) })
    },
  },
  'launches': {
    handler: async (route) => {
      const results = Array.from({ length: 10 }, (_, i) => ({
        id: `launch-${i}`, name: `Falcon ${i}`,
        status: { id: 1, name: 'Go for Launch' },
        launch_service_provider: { name: 'SpaceX' },
        rocket: { configuration: { full_name: 'Falcon 9' } },
        pad: { name: 'LC-39A', location: { name: 'KSC' } },
        mission: { name: 'Starlink', type: 'Communications', description: 'Deploy satellites' },
        net: new Date(Date.now() + (i + 1) * 3600000).toISOString(),
        image: { image_url: `https://picsum.photos/seed/launch${i}/300/200` },
      }))
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 10, next: null, results }) })
    },
  },
  'mtg': {
    handler: async (route, request) => {
      const url = new URL(request.url())
      const random = url.searchParams.get('random')
      const card = (n) => ({
        id: `card-${n}-${Math.random()}`, name: `Test Card ${n}`,
        mana_cost: '{2}{R}', type_line: 'Creature — Dragon',
        oracle_text: 'Flying, haste', rarity: 'rare',
        color_identity: ['R'], power: '4', toughness: '4',
        set_name: 'Test Set', collector_number: n,
        image_uris: { small: 'https://picsum.photos/seed/c1/244/340', normal: 'https://picsum.photos/seed/c1/488/680', large: 'https://picsum.photos/seed/c1/672/936' },
      })
      if (random) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(card(1)) })
      }
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [card(1), card(2), card(3)], has_more: true }) })
    },
  },
  'memes': {
    handler: async (route) => {
      const memes = Array.from({ length: 24 }, (_, i) => ({
        id: `m${i}`, name: `Meme ${i}`, url: `https://picsum.photos/seed/m${i}/300/300`,
        width: 500, height: 500, box_count: 2,
      }))
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { memes } }) })
    },
  },
  'countries': {
    handler: async (route) => {
      // Simulate the deprecated response so the FE falls back to jsDelivr.
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: false, data: null, errors: [{ message: 'deprecated' }] }) })
    },
  },
  'randomdog': {
    handler: async (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        status: 'success',
        message: Array.from({ length: 12 }, (_, i) => `https://picsum.photos/seed/d${i}/300/300`),
      }) })
    },
  },
  'dogbreeds': {
    handler: async (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        status: 'success',
        message: { labrador: [], husky: ['siberian'], poodle: ['toy', 'standard'] },
      }) })
    },
  },
  'dogbreed': {
    handler: async (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        status: 'success',
        message: Array.from({ length: 12 }, (_, i) => `https://picsum.photos/seed/dd${i}/300/300`),
      }) })
    },
  },
}

async function testRoute(slug, subpath = '') {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  const page = await context.newPage()
  const errors = []
  const IGNORED = [/net::ERR_/i, /Failed to fetch/i, /AbortError/i]
  page.on('pageerror', (e) => {
    const msg = e?.message || String(e)
    if (IGNORED.some(re => re.test(msg))) return
    errors.push({ kind: 'pageerror', msg, stack: (e?.stack || '').split('\n').slice(0, 6).join(' | ') })
  })
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const t = m.text()
    if (IGNORED.some(re => re.test(t))) return
    errors.push({ kind: 'console.error', msg: t })
  })

  // Wire up all mocks. Use a single catch-all + dispatch table so
  // overlapping paths (dogbreed vs dogbreeds, pokemon vs pokemon-detail)
  // don't accidentally hit the wrong handler — Playwright's last-wins
  // rule bit us the first time.
  await page.route('**/api/proxy/*', async (route, request) => {
    const u = new URL(request.url())
    const path = u.pathname.replace('/api/proxy/', '')
    const mock = MOCKS[path]
    if (mock) return mock.handler(route, request)
    // Fallthrough: 500 so the FE surfaces its own error state.
    return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ status: false, message: 'no mock' }) })
  })

  await page.goto(`${BASE}${subpath || `/explore/${slug}`}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)

  // Try one interactive click if there's a Load-more.
  const lm = page.locator('button', { hasText: /load more|show more|random|shuffle/i }).first()
  if (await lm.isVisible().catch(() => false)) {
    await lm.click({ timeout: 1500 }).catch(() => {})
    await page.waitForTimeout(1500)
  }

  // Click first card.
  const firstCard = page.locator('[role="button"], .cursor-pointer').first()
  if (await firstCard.isVisible().catch(() => false)) {
    await firstCard.click({ timeout: 1500 }).catch(() => {})
    await page.waitForTimeout(1200)
    await page.keyboard.press('Escape').catch(() => {})
  }

  await browser.close()
  return errors
}

const ROUTES = ['pokedex', 'rickmorty', 'launches', 'mtg', 'memes', 'food', 'dogs', 'countries', 'quotes']
let allErrors = 0

for (const r of ROUTES) {
  const errs = await testRoute(r)
  console.log(`${r.padEnd(10)}  ${errs.length === 0 ? 'OK' : `FAIL (${errs.length})`}`)
  for (const e of errs.slice(0, 4)) {
    console.log(`   [${e.kind}] ${e.msg.substring(0, 200)}`)
    if (e.stack) console.log(`   ↳ ${e.stack.substring(0, 500)}`)
  }
  allErrors += errs.length
}

// foodish alias route.
const foodishErrs = await testRoute('food', '/explore/foodish')
console.log(`${'foodish'.padEnd(10)}  ${foodishErrs.length === 0 ? 'OK' : `FAIL (${foodishErrs.length})`}`)
allErrors += foodishErrs.length

console.log(`\nTotal errors: ${allErrors}`)
process.exit(allErrors ? 1 : 0)
