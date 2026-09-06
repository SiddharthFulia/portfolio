// scripts/sync-osint-catalog.js
//
// Copies the OSINT API catalog from E:/Siddharth/osint/ into the portfolio
// so the FE can `import` it as a static JSON module.
//
// Input:  E:/Siddharth/osint/framework.json  (rich hierarchy w/ descriptions,
//                                              pricing, opsec notes, etc.)
//         E:/Siddharth/osint/flat.json       (flattened list for search)
//         E:/Siddharth/osint/categories.json (top-level category names)
//
// Output: portfolio/src/constants/osintCatalog.json
//         Shape:
//           {
//             generatedAt: ISO string,
//             categories: [{ name, apis: [{ name, url, description, pricing,
//                          bestFor, input, output, opsec, opsecNote, api,
//                          registration, localInstall, deprecated,
//                          categoryPath: [top, sub] }] }],
//             stats: { total, free, freemium, paid, unknown, categoriesCount }
//           }
//
// Run once (or whenever the catalog updates):
//   node scripts/sync-osint-catalog.js

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

const SRC_DIR = path.resolve(__dirname, '..', '..', 'osint')
const OUT_PATH = path.resolve(__dirname, '..', 'src', 'constants', 'osintCatalog.json')

// Walk framework.json (folder / url tree) into a flat list of APIs, each
// tagged with its category path so we can group later.
function walk(node, pathSoFar = []) {
  const out = []
  if (!node) return out

  if (node.type === 'folder') {
    const nextPath = node.name ? [...pathSoFar, node.name] : pathSoFar
    for (const child of node.children || []) {
      out.push(...walk(child, nextPath))
    }
    return out
  }

  if (node.type === 'url') {
    // Skip anything explicitly marked deprecated.
    if (node.deprecated === true) return out
    out.push({
      name        : node.name,
      url         : node.url,
      description : node.description || '',
      pricing     : node.pricing || 'unknown',
      bestFor     : node.bestFor || '',
      input       : node.input || '',
      output      : node.output || '',
      opsec       : node.opsec || 'unknown',
      opsecNote   : node.opsecNote || '',
      api         : !!node.api,
      registration: !!node.registration,
      localInstall: !!node.localInstall,
      googleDork  : !!node.googleDork,
      categoryPath: pathSoFar,   // e.g. ['Username','Username Search Engines']
    })
  }

  return out
}

function main() {
  const frameworkPath = path.join(SRC_DIR, 'framework.json')
  if (!fs.existsSync(frameworkPath)) {
    console.error('framework.json not found at', frameworkPath)
    process.exit(1)
  }

  const framework = JSON.parse(fs.readFileSync(frameworkPath, 'utf8'))
  // The framework.json wraps everything in a single root folder named
  // "OSINT Framework". Peel it off so the first path segment we track is
  // the real category (Username / Email Address / etc).
  const roots = framework.type === 'folder' && framework.name === 'OSINT Framework'
    ? (framework.children || [])
    : [framework]
  const flat = roots.flatMap((r) => walk(r))

  // Group by top-level category (categoryPath[0]).
  const byCat = new Map()
  for (const api of flat) {
    const cat = api.categoryPath[0] || 'Other'
    if (!byCat.has(cat)) byCat.set(cat, [])
    byCat.get(cat).push(api)
  }

  const categories = [...byCat.entries()]
    .sort((a, b) => b[1].length - a[1].length)   // biggest cats first
    .map(([name, apis]) => ({ name, apis }))

  const stats = {
    total          : flat.length,
    free           : flat.filter(a => a.pricing === 'free').length,
    freemium       : flat.filter(a => a.pricing === 'freemium' || a.pricing === 'free/freemium').length,
    paid           : flat.filter(a => a.pricing === 'paid').length,
    unknown        : flat.filter(a => a.pricing === 'unknown').length,
    categoriesCount: categories.length,
    withApi        : flat.filter(a => a.api).length,
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    stats,
    categories,
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true })
  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 0), 'utf8')

  const sizeKB = (fs.statSync(OUT_PATH).size / 1024).toFixed(1)
  console.log(`osint catalog synced:`)
  console.log(`  ${flat.length} APIs across ${categories.length} categories`)
  console.log(`  free: ${stats.free}  freemium: ${stats.freemium}  paid: ${stats.paid}  unknown: ${stats.unknown}`)
  console.log(`  wrote ${OUT_PATH}  (${sizeKB} KB)`)
}

main()
