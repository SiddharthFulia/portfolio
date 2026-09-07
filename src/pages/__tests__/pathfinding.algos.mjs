// Smoke harness for Pathfinding algorithms.
// Constructs a small 20-node undirected road-like graph with a known
// shortest path, then runs every algorithm generator and checks:
//   1. the algorithm returns found=true and can reconstruct a path
//   2. optimal algorithms match the reference Dijkstra distance
//   3. suboptimal algorithms at least reach the goal
//
// Run with: node src/pages/__tests__/pathfinding.algos.mjs

import { performance } from 'node:perf_hooks'

// ─── Minimal MinHeap (mirrors Pathfinding.jsx) ─────────────────
class MinHeap {
  constructor() { this.a = [] }
  get size() { return this.a.length }
  push(item) {
    const a = this.a
    a.push(item)
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (a[p].key <= a[i].key) break
      ;[a[p], a[i]] = [a[i], a[p]]
      i = p
    }
  }
  pop() {
    const a = this.a
    if (!a.length) return undefined
    const top = a[0]
    const last = a.pop()
    if (a.length) {
      a[0] = last
      let i = 0
      const n = a.length
      while (true) {
        const l = 2 * i + 1, r = 2 * i + 2
        let s = i
        if (l < n && a[l].key < a[s].key) s = l
        if (r < n && a[r].key < a[s].key) s = r
        if (s === i) break
        ;[a[s], a[i]] = [a[i], a[s]]
        i = s
      }
    }
    return top
  }
}

function haversine(a, b) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const la1 = toRad(a.lat), la2 = toRad(b.lat)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

// ─── Build a 20-node grid-like graph — 4 rows × 5 cols ──────────
// Each node connected to N/S/E/W neighbours. Weights = haversine.
// Node id = row*5 + col.  src = 0 (top-left), dst = 19 (bottom-right).
// Known shortest path visits 4+5-2 = 7 edges (Manhattan).
function buildGrid(rows = 4, cols = 5) {
  const nodes = new Map()
  const adj = new Map()
  const step = 0.001    // ~100m per hop at Bangalore latitude
  const baseLat = 12.97
  const baseLng = 77.60
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = r * cols + c
      nodes.set(id, { lat: baseLat + r * step, lng: baseLng + c * step })
      adj.set(id, [])
    }
  }
  const addEdge = (u, v) => {
    const nu = nodes.get(u), nv = nodes.get(v)
    const w = haversine(nu, nv)
    adj.get(u).push({ to: v, w })
    adj.get(v).push({ to: u, w })
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = r * cols + c
      if (c + 1 < cols) addEdge(id, id + 1)
      if (r + 1 < rows) addEdge(id, id + cols)
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

// ─── Reference Dijkstra (non-generator) ─────────────────────────
function refDijkstra(adj, src, dst) {
  const dist = new Map([[src, 0]])
  const prev = new Map()
  const visited = new Set()
  const heap = new MinHeap()
  heap.push({ id: src, key: 0 })
  while (heap.size) {
    const { id: u, key: d } = heap.pop()
    if (visited.has(u)) continue
    visited.add(u)
    if (u === dst) break
    const edges = adj.get(u) || []
    for (const { to: v, w } of edges) {
      if (visited.has(v)) continue
      const nd = d + w
      const cur = dist.get(v)
      if (cur === undefined || nd < cur) {
        dist.set(v, nd)
        prev.set(v, u)
        heap.push({ id: v, key: nd })
      }
    }
  }
  return { dist: dist.get(dst), prev }
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

function pathCost(path, adj) {
  let m = 0
  for (let i = 0; i < path.length - 1; i++) {
    const edges = adj.get(path[i]) || []
    const e = edges.find(x => x.to === path[i + 1])
    if (!e) return NaN
    m += e.w
  }
  return m
}

// ─── Import all algorithms from Pathfinding.jsx via source parse ─
// Rather than transpile JSX, we inline the algorithms below (kept
// bit-for-bit identical to the file so we can iterate the FIX here
// and then diff back). Update this block whenever the file changes.

function* dijkstra(adj, src, dst) {
  const dist = new Map([[src, 0]])
  const prev = new Map()
  const visited = new Set()
  const heap = new MinHeap()
  heap.push({ id: src, key: 0 })
  while (heap.size) {
    const { id: u, key: d } = heap.pop()
    if (visited.has(u)) { yield { u, skipped: true }; continue }
    visited.add(u)
    yield { u, dist: d }
    if (u === dst) return { found: true, prev, dist }
    const edges = adj.get(u) || []
    for (const { to: v, w } of edges) {
      if (visited.has(v)) continue
      const nd = d + w
      const cur = dist.get(v)
      if (cur === undefined || nd < cur) {
        dist.set(v, nd)
        prev.set(v, u)
        heap.push({ id: v, key: nd })
      }
    }
  }
  return { found: false, prev, dist }
}

function* astar(adj, nodes, src, dst) {
  const goal = nodes.get(dst)
  const h = (id) => haversine(nodes.get(id), goal)
  const g = new Map([[src, 0]])
  const prev = new Map()
  const visited = new Set()
  const heap = new MinHeap()
  heap.push({ id: src, key: h(src) })
  while (heap.size) {
    const { id: u } = heap.pop()
    if (visited.has(u)) { yield { u, skipped: true }; continue }
    visited.add(u)
    yield { u, dist: g.get(u) }
    if (u === dst) return { found: true, prev, dist: g }
    const edges = adj.get(u) || []
    const gu = g.get(u)
    for (const { to: v, w } of edges) {
      if (visited.has(v)) continue
      const ng = gu + w
      const cur = g.get(v)
      if (cur === undefined || ng < cur) {
        g.set(v, ng)
        prev.set(v, u)
        heap.push({ id: v, key: ng + h(v) })
      }
    }
  }
  return { found: false, prev, dist: g }
}

function* bfs(adj, src, dst) {
  const prev = new Map()
  const visited = new Set([src])
  const queue = [src]
  let head = 0
  while (head < queue.length) {
    const u = queue[head++]
    yield { u }
    if (u === dst) return { found: true, prev }
    const edges = adj.get(u) || []
    for (const { to: v } of edges) {
      if (visited.has(v)) continue
      visited.add(v)
      prev.set(v, u)
      queue.push(v)
    }
  }
  return { found: false, prev }
}

function* dfs(adj, src, dst) {
  const prev = new Map()
  const visited = new Set()
  const stack = [src]
  while (stack.length) {
    const u = stack.pop()
    if (visited.has(u)) { yield { u, skipped: true }; continue }
    visited.add(u)
    yield { u }
    if (u === dst) return { found: true, prev }
    const edges = adj.get(u) || []
    for (const { to: v } of edges) {
      if (visited.has(v)) continue
      if (!prev.has(v)) prev.set(v, u)
      stack.push(v)
    }
  }
  return { found: false, prev }
}

function* bidirectional(adj, revAdj, src, dst) {
  const distF = new Map([[src, 0]]), distB = new Map([[dst, 0]])
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
    if (visited.has(u)) { yield { u, side: forward ? 'F' : 'B', skipped: true }; continue }
    visited.add(u)
    yield { u, side: forward ? 'F' : 'B', dist: d }
    if (otherVisited.has(u)) {
      const total = distF.get(u) + distB.get(u)
      if (total < best) { best = total; meet = u }
    }
    if (heapF.size && heapB.size && (heapF.a[0].key + heapB.a[0].key) >= best) {
      return { found: meet !== null, meet, prevF, prevB, distF, distB }
    }
    const list = edges.get(u) || []
    for (const { to: v, w } of list) {
      if (visited.has(v)) continue
      const nd = d + w
      const cur = dist.get(v)
      if (cur === undefined || nd < cur) {
        dist.set(v, nd)
        prev.set(v, u)
        heap.push({ id: v, key: nd })
      }
      if (otherDist.has(v)) {
        const total = nd + otherDist.get(v)
        if (total < best) { best = total; meet = v }
      }
    }
  }
  return { found: meet !== null, meet, prevF, prevB, distF, distB }
}

function* bidirectionalAstar(adj, revAdj, nodes, src, dst) {
  const nSrc = nodes.get(src), nDst = nodes.get(dst)
  const hF = (id) => haversine(nodes.get(id), nDst)
  const hB = (id) => haversine(nodes.get(id), nSrc)
  const gF = new Map([[src, 0]]), gB = new Map([[dst, 0]])
  const prevF = new Map(), prevB = new Map()
  const visitedF = new Set(), visitedB = new Set()
  const heapF = new MinHeap(), heapB = new MinHeap()
  heapF.push({ id: src, key: hF(src) }); heapB.push({ id: dst, key: hB(dst) })
  let best = Infinity, meet = null
  while (heapF.size && heapB.size) {
    const forward = heapF.size <= heapB.size
    const heap = forward ? heapF : heapB
    const g    = forward ? gF : gB
    const prev = forward ? prevF : prevB
    const visited = forward ? visitedF : visitedB
    const otherVisited = forward ? visitedB : visitedF
    const otherG  = forward ? gB : gF
    const edges = forward ? adj : revAdj
    const h     = forward ? hF : hB
    const { id: u } = heap.pop()
    if (visited.has(u)) { yield { u, side: forward ? 'F' : 'B', skipped: true }; continue }
    visited.add(u)
    yield { u, side: forward ? 'F' : 'B', dist: g.get(u) }
    if (otherVisited.has(u)) {
      const total = gF.get(u) + gB.get(u)
      if (total < best) { best = total; meet = u }
    }
    if (heapF.size && heapB.size && (heapF.a[0].key + heapB.a[0].key) >= best) {
      return { found: meet !== null, meet, prevF, prevB, distF: gF, distB: gB }
    }
    const list = edges.get(u) || []
    const gu = g.get(u)
    for (const { to: v, w } of list) {
      if (visited.has(v)) continue
      const ng = gu + w
      const cur = g.get(v)
      if (cur === undefined || ng < cur) {
        g.set(v, ng)
        prev.set(v, u)
        heap.push({ id: v, key: ng + h(v) })
      }
      if (otherG.has(v)) {
        const total = ng + otherG.get(v)
        if (total < best) { best = total; meet = v }
      }
    }
  }
  return { found: meet !== null, meet, prevF, prevB, distF: gF, distB: gB }
}

// ─── IDA* (v2 — patched) ────────────────────────────────────────
// Bucketed on both g and h + per-pass best-g pruning so dense road
// graphs converge in seconds instead of thrashing exponentially.
function* idaStar(adj, nodes, src, dst) {
  const nDst = nodes.get(dst)
  const BUCKET = 500
  const h = (id) => Math.ceil(haversine(nodes.get(id), nDst) / BUCKET) * BUCKET
  const b = (w) => Math.ceil(w / BUCKET) * BUCKET
  const MAX_ITERS = 2_000_000
  let expansions = 0
  let threshold = h(src)
  const outerCap = 80
  let lastPrev = new Map()
  const bestG = new Map()   // pass-scoped best g reached at each node

  for (let outer = 0; outer < outerCap; outer++) {
    let nextThreshold = Infinity
    bestG.clear(); bestG.set(src, 0)
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
      if (top.iter >= edges.length) {
        onPath.delete(top.id)
        stack.pop()
        continue
      }
      const { to: v, w } = edges[top.iter++]
      if (onPath.has(v)) continue
      const ng = top.g + b(w)
      const seenG = bestG.get(v)
      if (seenG !== undefined && seenG <= ng) continue
      const f = ng + h(v)
      if (f > threshold) {
        if (f < nextThreshold) nextThreshold = f
        continue
      }
      bestG.set(v, ng)
      prev.set(v, top.id)
      onPath.add(v)
      stack.push({ id: v, g: ng, iter: 0 })
    }
    lastPrev = prev
    if (found) return { found: true, prev }
    if (nextThreshold === Infinity) break
    threshold = nextThreshold
  }
  return { found: false, prev: lastPrev }
}

function* greedyBest(adj, nodes, src, dst) {
  const nDst = nodes.get(dst)
  const h = (id) => haversine(nodes.get(id), nDst)
  const prev = new Map()
  const visited = new Set()
  const heap = new MinHeap()
  heap.push({ id: src, key: h(src) })
  while (heap.size) {
    const { id: u } = heap.pop()
    if (visited.has(u)) { yield { u, skipped: true }; continue }
    visited.add(u)
    yield { u }
    if (u === dst) return { found: true, prev }
    const edges = adj.get(u) || []
    for (const { to: v } of edges) {
      if (visited.has(v)) continue
      if (!prev.has(v)) prev.set(v, u)
      heap.push({ id: v, key: h(v) })
    }
  }
  return { found: false, prev }
}

function* uniformCost(adj, src, dst) {
  const dist = new Map([[src, 0]])
  const prev = new Map()
  const heap = new MinHeap()
  heap.push({ id: src, key: 0 })
  while (heap.size) {
    const { id: u, key: d } = heap.pop()
    if (d > (dist.get(u) ?? Infinity)) { yield { u, skipped: true }; continue }
    yield { u, dist: d }
    if (u === dst) return { found: true, prev, dist }
    const edges = adj.get(u) || []
    for (const { to: v, w } of edges) {
      const nd = d + w
      const cur = dist.get(v)
      if (cur === undefined || nd < cur) {
        dist.set(v, nd)
        prev.set(v, u)
        heap.push({ id: v, key: nd })
      }
    }
  }
  return { found: false, prev, dist }
}

// ─── Fringe Search (v2 — patched) ────────────────────────────────
// Bucketed on BOTH g and h. Threshold sweeps in BUCKET-metre jumps.
// Real (unbucketed) g is kept for path cost correctness; bucketed g
// (bg) drives the f-bound check so the outer loop actually terminates.
// Deque-style via head pointer (O(1) shift).
function* fringe(adj, nodes, src, dst) {
  const nDst = nodes.get(dst)
  const BUCKET = 200
  const bh = (id) => Math.ceil(haversine(nodes.get(id), nDst) / BUCKET) * BUCKET
  const bw = (w) => Math.ceil(w / BUCKET) * BUCKET
  const g  = new Map([[src, 0]])
  const bg = new Map([[src, 0]])
  const prev = new Map()
  const visited = new Set()
  let threshold = bh(src)
  let now = [src]
  let later = []
  const MAX_PASSES = 1000
  for (let outer = 0; outer < MAX_PASSES; outer++) {
    let nextThreshold = Infinity
    let head = 0
    while (head < now.length) {
      const u = now[head++]
      const gu = g.get(u)
      if (gu === undefined) continue
      const fu = bg.get(u) + bh(u)
      if (fu > threshold) {
        if (fu < nextThreshold) nextThreshold = fu
        later.push(u)
        continue
      }
      if (visited.has(u)) continue
      visited.add(u)
      yield { u, dist: gu }
      if (u === dst) return { found: true, prev }
      const edges = adj.get(u) || []
      const bgu = bg.get(u)
      for (const { to: v, w } of edges) {
        const ng = gu + w
        const nbg = bgu + bw(w)
        const cur = g.get(v)
        if (cur === undefined || ng < cur) {
          g.set(v, ng)
          bg.set(v, nbg)
          prev.set(v, u)
          if (!visited.has(v)) now.push(v)
        }
      }
    }
    if (!later.length) break
    now = later
    later = []
    threshold = nextThreshold === Infinity ? threshold + BUCKET : nextThreshold
  }
  return { found: false, prev }
}

function* beamSearch(adj, nodes, src, dst, beamWidth = 32) {
  const nDst = nodes.get(dst)
  const h = (id) => haversine(nodes.get(id), nDst)
  const g = new Map([[src, 0]])
  const prev = new Map()
  const visited = new Set()
  let frontier = [src]
  while (frontier.length) {
    const next = []
    for (const u of frontier) {
      if (visited.has(u)) continue
      visited.add(u)
      yield { u, dist: g.get(u) }
      if (u === dst) return { found: true, prev }
      const edges = adj.get(u) || []
      const gu = g.get(u)
      for (const { to: v, w } of edges) {
        if (visited.has(v)) continue
        const ng = gu + w
        const cur = g.get(v)
        if (cur === undefined || ng < cur) {
          g.set(v, ng)
          prev.set(v, u)
        }
        next.push(v)
      }
    }
    const unique = Array.from(new Set(next)).filter((id) => !visited.has(id))
    unique.sort((a, b) => (g.get(a) + h(a)) - (g.get(b) + h(b)))
    frontier = unique.slice(0, beamWidth)
  }
  return { found: false, prev }
}

// ─── JPS-highway (v2 — patched) ─────────────────────────────────
// Correct undirected degree; safe fallback when src/dst are non-junctions;
// path reconstruction covers non-junction endpoints.
function buildContractedGraph(adj) {
  // Undirected degree: for each unordered pair {u,v}, count once.
  const degree = new Map()
  const seenEdge = new Set()
  const bump = (id) => degree.set(id, (degree.get(id) || 0) + 1)
  for (const [u, edges] of adj) {
    for (const { to: v } of edges) {
      const a = u < v ? u : v
      const b = u < v ? v : u
      const key = `${a}|${b}`
      if (seenEdge.has(key)) continue
      seenEdge.add(key)
      bump(u); bump(v)
    }
  }
  const isJunction = (id) => (degree.get(id) || 0) !== 2

  const superAdj = new Map()
  const superWaypoints = new Map()
  for (const [u, edges] of adj) {
    if (!isJunction(u)) continue
    for (const { to: firstV, w: firstW } of edges) {
      let prev = u
      let cur = firstV
      let sum = firstW
      const way = [firstV]
      const guard = new Set([u, cur])
      while (!isJunction(cur)) {
        const nextEdges = adj.get(cur) || []
        let picked = null
        for (const { to: v2, w: w2 } of nextEdges) {
          if (v2 === prev) continue
          picked = { to: v2, w: w2 }
          break
        }
        if (!picked) break
        if (guard.has(picked.to)) break
        prev = cur
        cur = picked.to
        sum += picked.w
        way.push(cur)
        guard.add(cur)
      }
      if (!superAdj.has(u)) superAdj.set(u, [])
      superAdj.get(u).push({ to: cur, w: sum })
      superWaypoints.set(`${u}_${cur}`, way)
    }
  }
  return { superAdj, superWaypoints, isJunction }
}

function* jpsHighway(adj, nodes, src, dst) {
  const { superAdj, superWaypoints, isJunction } = buildContractedGraph(adj)
  const goal = nodes.get(dst)
  const h = (id) => haversine(nodes.get(id), goal)
  const g = new Map([[src, 0]])
  const prev = new Map()
  const meta = new Map()
  const visited = new Set()
  const heap = new MinHeap()
  heap.push({ id: src, key: h(src) })

  // Enumerate outgoing edges from u — prefer super-edges when u is a
  // junction; when u is a chain-node, walk both directions to the nearest
  // junctions and emit super-edges to each so we don't degenerate to raw.
  const outEdges = (u) => {
    if (isJunction(u) && superAdj.has(u)) return superAdj.get(u)
    // Non-junction: build ad-hoc super-edges to nearest junctions along
    // each of its (up to 2) chain directions. Also register waypoints
    // under the u_j key so reconstruct can expand them.
    const edges = adj.get(u) || []
    const out = []
    for (const { to: firstV, w: firstW } of edges) {
      let prev2 = u
      let cur = firstV
      let sum = firstW
      const way = [firstV]
      const guard = new Set([u, cur])
      while (!isJunction(cur)) {
        const nextEdges = adj.get(cur) || []
        let picked = null
        for (const { to: v2, w: w2 } of nextEdges) {
          if (v2 === prev2) continue
          picked = { to: v2, w: w2 }
          break
        }
        if (!picked || guard.has(picked.to)) break
        prev2 = cur
        cur = picked.to
        sum += picked.w
        way.push(cur)
        guard.add(cur)
      }
      out.push({ to: cur, w: sum })
      superWaypoints.set(`${u}_${cur}`, way)
    }
    return out
  }

  // If dst is not a junction, we may hop over it via super-edges. Detect
  // super-edges whose waypoints contain dst and rewrite them to terminate
  // AT dst with the truncated weight. This only matters for the u→j edge
  // that would skip past dst.
  const containsDst = (way) => {
    for (const w of way) if (w === dst) return true
    return false
  }

  while (heap.size) {
    const { id: u } = heap.pop()
    if (visited.has(u)) { yield { u, skipped: true }; continue }
    visited.add(u)
    yield { u, dist: g.get(u) }
    if (u === dst) return { found: true, prev, meta }
    const gu = g.get(u)
    for (const { to: v, w } of outEdges(u)) {
      let target = v
      let ew = w
      const wayKey = `${u}_${v}`
      const way = superWaypoints.get(wayKey)
      // If the super-edge passes through dst, snap the target to dst with
      // truncated weight computed from the waypoint list.
      if (v !== dst && way && containsDst(way)) {
        let acc = 0
        let node = u
        const truncated = []
        for (const wp of way) {
          const raw = (adj.get(node) || []).find(e => e.to === wp)
          if (!raw) { acc = NaN; break }
          acc += raw.w
          truncated.push(wp)
          node = wp
          if (wp === dst) break
        }
        if (!Number.isNaN(acc)) {
          target = dst
          ew = acc
          superWaypoints.set(`${u}_${dst}`, truncated)
        }
      }
      if (visited.has(target)) continue
      const ng = gu + ew
      const cur = g.get(target)
      if (cur === undefined || ng < cur) {
        g.set(target, ng)
        prev.set(target, u)
        const w2 = superWaypoints.get(`${u}_${target}`)
        if (w2) meta.set(target, w2)
        heap.push({ id: target, key: ng + h(target) })
      }
    }
  }
  return { found: false, prev, meta }
}

function expandContractedPath(path, meta) {
  if (!path) return null
  const out = [path[0]]
  for (let i = 1; i < path.length; i++) {
    const way = meta.get(path[i])
    if (way && way.length) {
      for (const w of way) out.push(w)
    } else {
      out.push(path[i])
    }
  }
  return out
}

function reconstructBidi(prevF, prevB, src, dst, meet) {
  if (meet === null || meet === undefined) return null
  const left = reconstruct(prevF, src, meet)
  if (!left) return null
  const right = []
  let cur = prevB.get(meet)
  const guard = new Set([meet])
  while (cur !== undefined && cur !== null) {
    if (guard.has(cur)) break
    guard.add(cur)
    right.push(cur)
    if (cur === dst) break
    cur = prevB.get(cur)
  }
  return left.concat(right)
}

// ─── Runner ─────────────────────────────────────────────────────
function runGen(gen) {
  let last = null
  let steps = 0
  const MAX = 1_000_000
  while (true) {
    const r = gen.next()
    steps++
    if (r.done) { last = r.value; break }
    if (steps > MAX) { console.error('  ! runaway generator, stopping'); break }
  }
  return { last, steps }
}

const graph = buildGrid(4, 5)
const revAdj = buildReverseAdj(graph.adj)
const SRC = 0
const DST = 19
const ref = refDijkstra(graph.adj, SRC, DST)
console.log(`Reference Dijkstra: dst dist = ${ref.dist.toFixed(2)} m, path = ${reconstruct(ref.prev, SRC, DST).join('→')}`)

const cases = [
  { name: 'Dijkstra',       gen: () => dijkstra(graph.adj, SRC, DST),                  optimal: true,  build: (r) => reconstruct(r.prev, SRC, DST) },
  { name: 'A*',              gen: () => astar(graph.adj, graph.nodes, SRC, DST),         optimal: true,  build: (r) => reconstruct(r.prev, SRC, DST) },
  { name: 'BFS',             gen: () => bfs(graph.adj, SRC, DST),                        optimal: false, build: (r) => reconstruct(r.prev, SRC, DST) },
  { name: 'DFS',             gen: () => dfs(graph.adj, SRC, DST),                        optimal: false, build: (r) => reconstruct(r.prev, SRC, DST) },
  { name: 'Bidi Dijkstra',   gen: () => bidirectional(graph.adj, revAdj, SRC, DST),      optimal: true,  build: (r) => reconstructBidi(r.prevF, r.prevB, SRC, DST, r.meet) },
  { name: 'Bidi A*',         gen: () => bidirectionalAstar(graph.adj, revAdj, graph.nodes, SRC, DST), optimal: true, build: (r) => reconstructBidi(r.prevF, r.prevB, SRC, DST, r.meet) },
  { name: 'IDA*',            gen: () => idaStar(graph.adj, graph.nodes, SRC, DST),       optimal: true,  build: (r) => reconstruct(r.prev, SRC, DST) },
  { name: 'Greedy Best',     gen: () => greedyBest(graph.adj, graph.nodes, SRC, DST),    optimal: false, build: (r) => reconstruct(r.prev, SRC, DST) },
  { name: 'Uniform Cost',    gen: () => uniformCost(graph.adj, SRC, DST),                optimal: true,  build: (r) => reconstruct(r.prev, SRC, DST) },
  { name: 'Fringe',          gen: () => fringe(graph.adj, graph.nodes, SRC, DST),        optimal: true,  build: (r) => reconstruct(r.prev, SRC, DST) },
  { name: 'Beam (w=32)',     gen: () => beamSearch(graph.adj, graph.nodes, SRC, DST, 32),optimal: false, build: (r) => reconstruct(r.prev, SRC, DST) },
  { name: 'JPS-highway',     gen: () => jpsHighway(graph.adj, graph.nodes, SRC, DST),    optimal: true,  build: (r) => {
    const raw = reconstruct(r.prev, SRC, DST)
    return expandContractedPath(raw, r.meta)
  } },
]

let pass = 0, fail = 0
for (const c of cases) {
  const t0 = performance.now()
  const { last, steps } = runGen(c.gen())
  const t1 = performance.now()
  const found = !!last?.found
  const path = found ? c.build(last) : null
  const cost = path ? pathCost(path, graph.adj) : NaN
  // Grid has many equal-length paths; floating-point accumulation of
  // haversine over 7 edges can differ by ~0.01 m across permutations.
  // Accept optimal if within 1 m (well under 1 edge = ~100 m).
  const optimalOk = c.optimal ? Math.abs(cost - ref.dist) < 1.0 : true
  const ok = found && path && optimalOk
  const status = ok ? 'PASS' : 'FAIL'
  const tag = c.optimal ? 'opt' : 'sub'
  console.log(`  ${status} ${c.name.padEnd(15)} [${tag}] · steps=${String(steps).padStart(5)} · ms=${(t1 - t0).toFixed(1).padStart(5)} · path=${path ? path.join('→') : 'null'} · cost=${cost.toFixed(2)}`)
  if (ok) pass++; else fail++
}
console.log(`\n${pass}/${pass + fail} PASSED`)
process.exit(fail === 0 ? 0 : 1)
