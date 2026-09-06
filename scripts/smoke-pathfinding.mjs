// Headless smoke test — verify every algorithm in Pathfinding.jsx
// produces a valid path on a small synthetic grid graph. Run once
// after major changes to catch regressions in the generators.
//
//   node scripts/smoke-pathfinding.mjs

// Re-declare a minimal set of the algo generators here (identical logic,
// no React imports) so we can exercise them in Node.

function haversine(a, b) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const la1 = toRad(a.lat), la2 = toRad(b.lat)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

class MinHeap {
  constructor() { this.a = [] }
  get size() { return this.a.length }
  push(item) { const a=this.a; a.push(item); let i=a.length-1; while(i>0){const p=(i-1)>>1; if(a[p].key<=a[i].key) break; [a[p],a[i]]=[a[i],a[p]]; i=p} }
  pop() { const a=this.a; if(!a.length) return; const top=a[0]; const last=a.pop(); if(a.length){a[0]=last; let i=0; const n=a.length; while(true){const l=2*i+1,r=2*i+2; let s=i; if(l<n&&a[l].key<a[s].key) s=l; if(r<n&&a[r].key<a[s].key) s=r; if(s===i) break; [a[s],a[i]]=[a[i],a[s]]; i=s}} return top }
}

// Build a 20x20 grid graph over a small lat/lng patch.
function buildGrid(N=20) {
  const nodes = new Map()
  const adj = new Map()
  const baseLat = 12.9, baseLng = 77.5
  const step = 0.005
  const idOf = (i,j) => i*N + j
  for (let i=0; i<N; i++) {
    for (let j=0; j<N; j++) {
      nodes.set(idOf(i,j), { lat: baseLat + i*step, lng: baseLng + j*step })
    }
  }
  const neigh = [[1,0],[-1,0],[0,1],[0,-1]]
  for (let i=0; i<N; i++) {
    for (let j=0; j<N; j++) {
      const u = idOf(i,j)
      const list = []
      for (const [di,dj] of neigh) {
        const ni=i+di, nj=j+dj
        if (ni<0||nj<0||ni>=N||nj>=N) continue
        const v = idOf(ni,nj)
        const w = Math.round(haversine(nodes.get(u), nodes.get(v)))
        list.push({ to: v, w })
      }
      adj.set(u, list)
    }
  }
  return { nodes, adj }
}

function buildReverseAdj(adj) {
  const rev = new Map()
  for (const [u, edges] of adj) {
    for (const { to: v, w } of edges) {
      if (!rev.has(v)) rev.set(v, [])
      rev.get(v).push({ to: u, w })
    }
  }
  return rev
}

function reconstruct(prev, src, dst) {
  const path = []
  let cur = dst
  const guard = new Set()
  while (cur !== undefined && cur !== null) {
    if (guard.has(cur)) return null
    guard.add(cur)
    path.push(cur)
    if (cur === src) break
    cur = prev.get(cur)
  }
  if (path[path.length - 1] !== src) return null
  path.reverse()
  return path
}
function reconstructBidi(prevF, prevB, src, dst, meet) {
  if (meet == null) return null
  const left = reconstruct(prevF, src, meet)
  if (!left) return null
  const right = []
  let cur = prevB.get(meet)
  const guard = new Set([meet])
  while (cur != null) { if (guard.has(cur)) break; guard.add(cur); right.push(cur); if (cur === dst) break; cur = prevB.get(cur) }
  return left.concat(right)
}

// Import the module — but that's tricky in Node since it's JSX. We
// instead inline the generators from Pathfinding.jsx here for the
// smoke test. Kept in sync manually with the page.

function* dijkstra(adj, src, dst) {
  const dist = new Map([[src,0]]), prev = new Map(), visited = new Set(), heap = new MinHeap()
  heap.push({ id: src, key: 0 })
  while (heap.size) {
    const { id: u, key: d } = heap.pop()
    if (visited.has(u)) { yield { u, skipped:true }; continue }
    visited.add(u)
    yield { u, dist: d }
    if (u === dst) return { found: true, prev, dist }
    for (const { to: v, w } of adj.get(u) || []) {
      if (visited.has(v)) continue
      const nd = d + w
      const cur = dist.get(v)
      if (cur === undefined || nd < cur) { dist.set(v, nd); prev.set(v, u); heap.push({ id: v, key: nd }) }
    }
  }
  return { found: false, prev, dist }
}

function* astar(adj, nodes, src, dst) {
  const goal = nodes.get(dst)
  const h = (id) => haversine(nodes.get(id), goal)
  const g = new Map([[src,0]]), prev = new Map(), visited = new Set(), heap = new MinHeap()
  heap.push({ id: src, key: h(src) })
  while (heap.size) {
    const { id: u } = heap.pop()
    if (visited.has(u)) { yield { u, skipped:true }; continue }
    visited.add(u)
    yield { u, dist: g.get(u) }
    if (u === dst) return { found: true, prev, dist: g }
    const gu = g.get(u)
    for (const { to: v, w } of adj.get(u) || []) {
      if (visited.has(v)) continue
      const ng = gu + w
      const cur = g.get(v)
      if (cur === undefined || ng < cur) { g.set(v, ng); prev.set(v, u); heap.push({ id: v, key: ng + h(v) }) }
    }
  }
  return { found: false, prev, dist: g }
}

function* bfs(adj, src, dst) {
  const prev = new Map(), visited = new Set([src]), queue = [src]
  let head = 0
  while (head < queue.length) {
    const u = queue[head++]
    yield { u }
    if (u === dst) return { found: true, prev }
    for (const { to: v } of adj.get(u) || []) { if (visited.has(v)) continue; visited.add(v); prev.set(v, u); queue.push(v) }
  }
  return { found: false, prev }
}

function* dfs(adj, src, dst) {
  const prev = new Map(), visited = new Set(), stack = [src]
  while (stack.length) {
    const u = stack.pop()
    if (visited.has(u)) { yield { u, skipped:true }; continue }
    visited.add(u)
    yield { u }
    if (u === dst) return { found: true, prev }
    for (const { to: v } of adj.get(u) || []) { if (visited.has(v)) continue; if (!prev.has(v)) prev.set(v, u); stack.push(v) }
  }
  return { found: false, prev }
}

function* bidirectional(adj, revAdj, src, dst) {
  const distF = new Map([[src,0]]), distB = new Map([[dst,0]])
  const prevF = new Map(), prevB = new Map()
  const visitedF = new Set(), visitedB = new Set()
  const heapF = new MinHeap(), heapB = new MinHeap()
  heapF.push({ id: src, key: 0 }); heapB.push({ id: dst, key: 0 })
  let best = Infinity, meet = null
  while (heapF.size && heapB.size) {
    const forward = heapF.size <= heapB.size
    const heap = forward ? heapF : heapB
    const dist = forward ? distF : distB
    const prev = forward ? prevF : prevB
    const visited = forward ? visitedF : visitedB
    const otherVisited = forward ? visitedB : visitedF
    const otherDist = forward ? distB : distF
    const edges = forward ? adj : revAdj
    const { id: u, key: d } = heap.pop()
    if (visited.has(u)) { yield { u, side: forward?'F':'B', skipped:true }; continue }
    visited.add(u)
    yield { u, side: forward?'F':'B', dist: d }
    if (otherVisited.has(u)) { const total = distF.get(u) + distB.get(u); if (total < best) { best = total; meet = u } }
    if (heapF.size && heapB.size && (heapF.a[0].key + heapB.a[0].key) >= best) return { found: meet !== null, meet, prevF, prevB, distF, distB }
    for (const { to: v, w } of edges.get(u) || []) {
      if (visited.has(v)) continue
      const nd = d + w
      const cur = dist.get(v)
      if (cur === undefined || nd < cur) { dist.set(v, nd); prev.set(v, u); heap.push({ id: v, key: nd }) }
      if (otherDist.has(v)) { const total = nd + otherDist.get(v); if (total < best) { best = total; meet = v } }
    }
  }
  return { found: meet !== null, meet, prevF, prevB, distF, distB }
}

function* bidiAstar(adj, revAdj, nodes, src, dst) {
  const nSrc = nodes.get(src), nDst = nodes.get(dst)
  const hF = (id) => haversine(nodes.get(id), nDst)
  const hB = (id) => haversine(nodes.get(id), nSrc)
  const gF = new Map([[src,0]]), gB = new Map([[dst,0]])
  const prevF = new Map(), prevB = new Map()
  const visitedF = new Set(), visitedB = new Set()
  const heapF = new MinHeap(), heapB = new MinHeap()
  heapF.push({ id: src, key: hF(src) }); heapB.push({ id: dst, key: hB(dst) })
  let best = Infinity, meet = null
  while (heapF.size && heapB.size) {
    const forward = heapF.size <= heapB.size
    const heap = forward ? heapF : heapB
    const g = forward ? gF : gB
    const prev = forward ? prevF : prevB
    const visited = forward ? visitedF : visitedB
    const otherVisited = forward ? visitedB : visitedF
    const otherG = forward ? gB : gF
    const edges = forward ? adj : revAdj
    const h = forward ? hF : hB
    const { id: u } = heap.pop()
    if (visited.has(u)) { yield { u, side: forward?'F':'B', skipped:true }; continue }
    visited.add(u)
    yield { u, side: forward?'F':'B', dist: g.get(u) }
    if (otherVisited.has(u)) { const total = gF.get(u) + gB.get(u); if (total < best) { best = total; meet = u } }
    if (heapF.size && heapB.size && (heapF.a[0].key + heapB.a[0].key) >= best) return { found: meet !== null, meet, prevF, prevB, distF: gF, distB: gB }
    const gu = g.get(u)
    for (const { to: v, w } of edges.get(u) || []) {
      if (visited.has(v)) continue
      const ng = gu + w
      const cur = g.get(v)
      if (cur === undefined || ng < cur) { g.set(v, ng); prev.set(v, u); heap.push({ id: v, key: ng + h(v) }) }
      if (otherG.has(v)) { const total = ng + otherG.get(v); if (total < best) { best = total; meet = v } }
    }
  }
  return { found: meet !== null, meet, prevF, prevB, distF: gF, distB: gB }
}

function* idaStar(adj, nodes, src, dst) {
  const nDst = nodes.get(dst)
  const BUCKET = 200
  const h = (id) => Math.ceil(haversine(nodes.get(id), nDst) / BUCKET) * BUCKET
  const b = (w) => Math.ceil(w / BUCKET) * BUCKET
  let threshold = h(src)
  const MAX_ITERS = 200000
  let expansions = 0
  for (let outer = 0; outer < 60; outer++) {
    let nextThreshold = Infinity
    const stack = [{ id: src, g: 0, iter: 0 }]
    const prev = new Map()
    const onPath = new Set([src])
    let found = null
    while (stack.length) {
      const top = stack[stack.length - 1]
      if (top.iter === 0) {
        expansions++
        yield { u: top.id, dist: top.g }
        if (top.id === dst) { found = true; break }
        if (expansions > MAX_ITERS) return { found: false, prev }
      }
      const edges = adj.get(top.id) || []
      if (top.iter >= edges.length) { onPath.delete(top.id); stack.pop(); continue }
      const { to: v, w } = edges[top.iter++]
      if (onPath.has(v)) continue
      const ng = top.g + b(w)
      const f = ng + h(v)
      if (f > threshold) { if (f < nextThreshold) nextThreshold = f; continue }
      prev.set(v, top.id)
      onPath.add(v)
      stack.push({ id: v, g: ng, iter: 0 })
    }
    if (found) return { found: true, prev }
    if (nextThreshold === Infinity) break
    threshold = nextThreshold
  }
  return { found: false, prev: new Map() }
}

function* greedy(adj, nodes, src, dst) {
  const nDst = nodes.get(dst)
  const h = (id) => haversine(nodes.get(id), nDst)
  const prev = new Map(), visited = new Set(), heap = new MinHeap()
  heap.push({ id: src, key: h(src) })
  while (heap.size) {
    const { id: u } = heap.pop()
    if (visited.has(u)) { yield { u, skipped:true }; continue }
    visited.add(u)
    yield { u }
    if (u === dst) return { found: true, prev }
    for (const { to: v } of adj.get(u) || []) {
      if (visited.has(v)) continue
      if (!prev.has(v)) prev.set(v, u)
      heap.push({ id: v, key: h(v) })
    }
  }
  return { found: false, prev }
}

function* uniform(adj, src, dst) {
  const dist = new Map([[src,0]]), prev = new Map(), heap = new MinHeap()
  heap.push({ id: src, key: 0 })
  while (heap.size) {
    const { id: u, key: d } = heap.pop()
    if (d > (dist.get(u) ?? Infinity)) { yield { u, skipped:true }; continue }
    yield { u, dist: d }
    if (u === dst) return { found: true, prev, dist }
    for (const { to: v, w } of adj.get(u) || []) {
      const nd = d + w
      const cur = dist.get(v)
      if (cur === undefined || nd < cur) { dist.set(v, nd); prev.set(v, u); heap.push({ id: v, key: nd }) }
    }
  }
  return { found: false, prev, dist }
}

function* fringe(adj, nodes, src, dst) {
  const nDst = nodes.get(dst)
  const h = (id) => haversine(nodes.get(id), nDst)
  const g = new Map([[src,0]])
  const prev = new Map()
  let threshold = h(src)
  let now = [src], later = []
  for (let outer = 0; outer < 400; outer++) {
    let nextThreshold = Infinity
    while (now.length) {
      const u = now.shift()
      const gu = g.get(u)
      const fu = gu + h(u)
      if (fu > threshold) { if (fu < nextThreshold) nextThreshold = fu; later.push(u); continue }
      yield { u, dist: gu }
      if (u === dst) return { found: true, prev }
      for (const { to: v, w } of adj.get(u) || []) {
        const ng = gu + w
        const cur = g.get(v)
        if (cur === undefined || ng < cur) { g.set(v, ng); prev.set(v, u); now.push(v) }
      }
    }
    if (!later.length) break
    now = later; later = []
    threshold = nextThreshold === Infinity ? threshold + 1 : nextThreshold
  }
  return { found: false, prev }
}

function* beam(adj, nodes, src, dst, beamWidth = 32) {
  const nDst = nodes.get(dst)
  const h = (id) => haversine(nodes.get(id), nDst)
  const g = new Map([[src,0]])
  const prev = new Map(), visited = new Set()
  let frontier = [src]
  while (frontier.length) {
    const next = []
    for (const u of frontier) {
      if (visited.has(u)) continue
      visited.add(u)
      yield { u, dist: g.get(u) }
      if (u === dst) return { found: true, prev }
      const gu = g.get(u)
      for (const { to: v, w } of adj.get(u) || []) {
        if (visited.has(v)) continue
        const ng = gu + w
        const cur = g.get(v)
        if (cur === undefined || ng < cur) { g.set(v, ng); prev.set(v, u) }
        next.push(v)
      }
    }
    const unique = [...new Set(next)].filter((id) => !visited.has(id))
    unique.sort((a,b) => (g.get(a)+h(a)) - (g.get(b)+h(b)))
    frontier = unique.slice(0, beamWidth)
  }
  return { found: false, prev }
}

function buildContractedGraph(adj) {
  const degree = new Map()
  for (const [u, edges] of adj) {
    degree.set(u, (degree.get(u) || 0) + edges.length)
    for (const { to: v } of edges) degree.set(v, (degree.get(v) || 0) + 1)
  }
  const isJunction = (id) => (degree.get(id) || 0) !== 2
  const superAdj = new Map()
  const superWaypoints = new Map()
  for (const [u, edges] of adj) {
    if (!isJunction(u)) continue
    for (const { to: firstV, w: firstW } of edges) {
      let prev = u, cur = firstV, sum = firstW
      const way = [firstV]
      const guard = new Set([u, cur])
      while (!isJunction(cur)) {
        const nextEdges = adj.get(cur) || []
        let picked = null
        for (const { to: v2, w: w2 } of nextEdges) { if (v2 === prev) continue; picked = { to: v2, w: w2 }; break }
        if (!picked) break
        if (guard.has(picked.to)) break
        prev = cur; cur = picked.to; sum += picked.w; way.push(cur); guard.add(cur)
      }
      if (!superAdj.has(u)) superAdj.set(u, [])
      superAdj.get(u).push({ to: cur, w: sum })
      superWaypoints.set(`${u}_${cur}`, way)
    }
  }
  return { superAdj, superWaypoints, isJunction }
}

function* jps(adj, nodes, src, dst) {
  const { superAdj, superWaypoints, isJunction } = buildContractedGraph(adj)
  const goal = nodes.get(dst)
  const h = (id) => haversine(nodes.get(id), goal)
  const g = new Map([[src,0]])
  const prev = new Map(), meta = new Map(), visited = new Set(), heap = new MinHeap()
  heap.push({ id: src, key: h(src) })
  const outEdges = (u) => (isJunction(u) && superAdj.has(u)) ? superAdj.get(u) : (adj.get(u) || []).map(({to,w}) => ({to,w}))
  while (heap.size) {
    const { id: u } = heap.pop()
    if (visited.has(u)) { yield { u, skipped:true }; continue }
    visited.add(u)
    yield { u, dist: g.get(u) }
    if (u === dst) return { found: true, prev, meta }
    const gu = g.get(u)
    for (const { to: v, w } of outEdges(u)) {
      if (visited.has(v)) continue
      const ng = gu + w
      const cur = g.get(v)
      if (cur === undefined || ng < cur) {
        g.set(v, ng); prev.set(v, u)
        const way = superWaypoints.get(`${u}_${v}`)
        if (way) meta.set(v, way)
        heap.push({ id: v, key: ng + h(v) })
      }
    }
  }
  return { found: false, prev, meta }
}

function expandContracted(path, meta) {
  if (!path) return null
  const out = [path[0]]
  for (let i = 1; i < path.length; i++) {
    const way = meta.get(path[i])
    if (way && way.length) for (const w of way) out.push(w)
    else out.push(path[i])
  }
  return out
}

// Drive a generator to completion.
function drain(gen) {
  let steps = 0, last = null
  while (true) {
    const r = gen.next()
    steps++
    if (r.done) { last = r.value; break }
    if (steps > 5_000_000) { console.error('runaway generator, aborting'); break }
  }
  return { steps, result: last }
}

// Build a road-like sparse graph — a spanning tree over the grid so
// branching factor ≈ 2 (like real OSM road networks) rather than 4
// (like a dense grid, which is IDA*'s worst case).
function buildSparse(N=15) {
  const { nodes, adj: fullAdj } = buildGrid(N)
  const adj = new Map()
  for (const id of nodes.keys()) adj.set(id, [])
  const visited = new Set([0])
  const queue = [0]
  const rng = (() => { let s = 1234; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff })()
  while (queue.length) {
    const u = queue.shift()
    const edges = [...(fullAdj.get(u) || [])].sort(() => rng() - 0.5)
    for (const e of edges) {
      if (visited.has(e.to)) continue
      visited.add(e.to)
      adj.get(u).push({ to: e.to, w: e.w })
      adj.get(e.to).push({ to: u, w: e.w })
      queue.push(e.to)
    }
  }
  return { nodes, adj }
}

const { nodes, adj } = buildSparse(15)
const revAdj = buildReverseAdj(adj)
const ids = [...nodes.keys()]
const src = 0
const dst = ids[ids.length - 1]
console.log(`Sparse graph: V=${nodes.size} src=${src} dst=${dst}`)

const tests = [
  ['dijkstra',      () => drain(dijkstra(adj, src, dst)),      (r) => reconstruct(r.prev, src, dst)],
  ['astar',         () => drain(astar(adj, nodes, src, dst)),  (r) => reconstruct(r.prev, src, dst)],
  ['bfs',           () => drain(bfs(adj, src, dst)),           (r) => reconstruct(r.prev, src, dst)],
  ['dfs',           () => drain(dfs(adj, src, dst)),           (r) => reconstruct(r.prev, src, dst)],
  ['bidirectional', () => drain(bidirectional(adj, revAdj, src, dst)), (r) => reconstructBidi(r.prevF, r.prevB, src, dst, r.meet)],
  ['bidiAstar',     () => drain(bidiAstar(adj, revAdj, nodes, src, dst)), (r) => reconstructBidi(r.prevF, r.prevB, src, dst, r.meet)],
  ['idaStar',       () => drain(idaStar(adj, nodes, src, dst)), (r) => reconstruct(r.prev, src, dst)],
  ['greedy',        () => drain(greedy(adj, nodes, src, dst)), (r) => reconstruct(r.prev, src, dst)],
  ['uniform',       () => drain(uniform(adj, src, dst)),       (r) => reconstruct(r.prev, src, dst)],
  ['fringe',        () => drain(fringe(adj, nodes, src, dst)), (r) => reconstruct(r.prev, src, dst)],
  ['beam',          () => drain(beam(adj, nodes, src, dst, 32)), (r) => reconstruct(r.prev, src, dst)],
  ['jps',           () => drain(jps(adj, nodes, src, dst)),    (r) => { const p = reconstruct(r.prev, src, dst); return expandContracted(p, r.meta) }],
]

let pass = 0, fail = 0
const results = []
for (const [name, run, recon] of tests) {
  const t0 = performance.now()
  const { steps, result } = run()
  const ms = performance.now() - t0
  const path = result?.found ? recon(result) : null
  const ok = !!path && path[0] === src && path[path.length - 1] === dst
  if (ok) pass++; else fail++
  let km = 0
  if (path) {
    for (let i=0;i<path.length-1;i++) km += haversine(nodes.get(path[i]), nodes.get(path[i+1]))
    km /= 1000
  }
  results.push({ name, ok, steps, ms: ms.toFixed(1), pathLen: path?.length ?? 0, km: km.toFixed(3) })
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(15)} steps=${String(steps).padStart(6)} ms=${ms.toFixed(1).padStart(6)} pathN=${(path?.length ?? 0).toString().padStart(4)} km=${km.toFixed(3)}`)
}
console.log(`\nTotal: ${pass}/${tests.length} passed`)
if (fail > 0) process.exit(1)
