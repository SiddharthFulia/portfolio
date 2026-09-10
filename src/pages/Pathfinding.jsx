// Pathfinding Lab — City Road Graphs.
//
// Browser-only pathfinding visualizer over real OpenStreetMap road
// graphs. The graph itself lives in the backend SQLite cache and is
// fetched on demand — no IndexedDB, no Overpass hits from the browser.
// We keep an in-memory Map<slug, graph> so switching cities within a
// session doesn't re-hit the network for one you've already loaded.
//
// TWELVE algorithms implemented as JS generators so we can consume N pops
// per frame (slider controlled) inside a requestAnimationFrame loop:
//   Dijkstra, A*, BFS, DFS, Bidirectional Dijkstra, Bidirectional A*,
//   IDA*, Greedy Best-First, Uniform Cost, Fringe, Beam, JPS-highway.
//
// Rendering: plate carrée projection (safe at metro-city latitudes for
// a ~15-30 km viewport). The base road network is batched into a single
// Path2D so we can stroke ALL edges in one canvas call per frame —
// 10-20x faster than per-edge beginPath+stroke.
//
// Runs on a zoomable + pannable canvas (mouse drag, wheel zoom, pinch
// zoom on mobile). All draw ops go through a {tx, ty, scale} transform.

import { useEffect, useMemo, useRef, useState, useCallback, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { InputNumber, Input, Tag, Progress } from 'antd'
import { motion, AnimatePresence } from 'framer-motion'
import { Slider, Button } from '../components/ui'
import {
  PlayCircleFilled, PauseCircleFilled, ReloadOutlined,
  NodeIndexOutlined, ThunderboltFilled, EnvironmentFilled,
  AimOutlined, SwapOutlined, ExpandOutlined,
  EyeOutlined, EyeInvisibleOutlined,
  ExperimentOutlined, ClearOutlined, HistoryOutlined,
  StopFilled, ClockCircleOutlined, GlobalOutlined,
  FullscreenOutlined, FullscreenExitOutlined,
  SearchOutlined, CheckCircleFilled, LoadingOutlined,
  CompassOutlined, CarOutlined, BranchesOutlined,
  BulbOutlined, DownloadOutlined, CloseOutlined,
} from '@ant-design/icons'
import { get as apiGet, post as apiPost } from '../api/request'
import { ENDPOINTS } from '../api/endpoints'
import { notify } from '../utils/notify'
import { LuxeLoader } from '../components/loaders'

// Reduced-motion — evaluated once at module load. Every fancy animation
// gates on this so we never fire vestibular/seizure-risky motion on
// users who've opted out at the OS level.
const REDUCE_MOTION = typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Rough drive-time estimate for the "N km · X min drive" ambient detail.
// Uses a blanket 28 km/h average city speed — the number is on-purpose a
// ballpark, not a routing engine, so we don't mislead anyone.
function estimateDriveMinutes(km) {
  if (!km || km <= 0) return 0
  const AVG_SPEED_KMH = 28
  return Math.max(1, Math.round((km / AVG_SPEED_KMH) * 60))
}

// Sharp direction changes along the path. Each interior node's bearing
// delta is compared against a threshold (30°) — anything above counts as
// a turn. Straight-through nodes don't inflate the number.
function countTurns(path, nodes) {
  if (!path || path.length < 3) return 0
  const bearing = (a, b) => {
    const φ1 = a.lat * Math.PI / 180, φ2 = b.lat * Math.PI / 180
    const λ1 = a.lng * Math.PI / 180, λ2 = b.lng * Math.PI / 180
    const y = Math.sin(λ2 - λ1) * Math.cos(φ2)
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1)
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
  }
  let turns = 0
  const TURN_THRESHOLD_DEG = 30
  for (let i = 1; i < path.length - 1; i++) {
    const a = nodes.get(path[i - 1])
    const b = nodes.get(path[i])
    const c = nodes.get(path[i + 1])
    if (!a || !b || !c) continue
    const b1 = bearing(a, b), b2 = bearing(b, c)
    let d = Math.abs(b2 - b1)
    if (d > 180) d = 360 - d
    if (d >= TURN_THRESHOLD_DEG) turns++
  }
  return turns
}

// ─── Haversine — meters between two lat/lng ────────────────────
function haversine(a, b) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const la1 = toRad(a.lat), la2 = toRad(b.lat)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

// ─── Parse the BE payload into { nodes: Map, adj: Map } ─────────
// BE returns compact triplets: nodes = [[id, lat, lng], …]  edges =
// [[from, to, weightMeters], …]. Directional — the BE already emitted
// both directions for non-oneway ways. We fan them into an adjacency
// map so the algorithms can iterate outgoing edges in O(1).
function inflateGraph(payload) {
  const nodes = new Map()
  const adj = new Map()
  for (const [id, lat, lng] of payload.nodes) {
    nodes.set(id, { lat, lng })
  }
  for (const [u, v, w] of payload.edges) {
    if (!adj.has(u)) adj.set(u, [])
    adj.get(u).push({ to: v, w })
  }
  return { nodes, adj }
}

// ─── Bbox helpers ──────────────────────────────────────────────
// The BE sends bbox as 'south,west,north,east'. Parse once per city
// and hand back the shape the projection code wants.
function parseBbox(bboxStr) {
  const [south, west, north, east] = bboxStr.split(',').map(Number)
  return { south, west, north, east }
}

// ─── MinHeap (binary heap on {id, key}) ────────────────────────
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

// ─── Algorithm generators ─────────────────────────────────────
// Each yields a plain object per iteration describing the frontier
// event, so the renderer can colour the map. Every yield is ONE pop
// (or one iteration of the inner loop for IDA* / Fringe / Beam).
//
// Standard event shape:  { u, side?, dist?, skipped?, edgesRelaxed? }
// - u: the node id being expanded this step
// - side: 'F' | 'B' for bidirectional variants (colour hint)
// - skipped: heap re-pop of an already-visited node
// - edgesRelaxed: optional counter that flows into the comparison table

function* dijkstra(adj, src, dst) {
  const dist = new Map([[src, 0]])
  const prev = new Map()
  const visited = new Set()
  const heap = new MinHeap()
  let edgesRelaxed = 0
  heap.push({ id: src, key: 0 })
  while (heap.size) {
    const { id: u, key: d } = heap.pop()
    if (visited.has(u)) { yield { u, skipped: true }; continue }
    visited.add(u)
    yield { u, dist: d, edgesRelaxed }
    if (u === dst) return { found: true, prev, dist, edgesRelaxed }
    const edges = adj.get(u) || []
    for (const { to: v, w } of edges) {
      edgesRelaxed++
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
  return { found: false, prev, dist, edgesRelaxed }
}

function* astar(adj, nodes, src, dst) {
  const goal = nodes.get(dst)
  const h = (id) => {
    const n = nodes.get(id)
    return haversine(n, goal)
  }
  const g = new Map([[src, 0]])
  const prev = new Map()
  const visited = new Set()
  const heap = new MinHeap()
  let edgesRelaxed = 0
  heap.push({ id: src, key: h(src) })
  while (heap.size) {
    const { id: u } = heap.pop()
    if (visited.has(u)) { yield { u, skipped: true }; continue }
    visited.add(u)
    yield { u, dist: g.get(u), edgesRelaxed }
    if (u === dst) return { found: true, prev, dist: g, edgesRelaxed }
    const edges = adj.get(u) || []
    const gu = g.get(u)
    for (const { to: v, w } of edges) {
      edgesRelaxed++
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
  return { found: false, prev, dist: g, edgesRelaxed }
}

function* bfs(adj, src, dst) {
  const prev = new Map()
  const visited = new Set([src])
  const queue = [src]
  let head = 0
  let edgesRelaxed = 0
  while (head < queue.length) {
    const u = queue[head++]
    yield { u, edgesRelaxed }
    if (u === dst) return { found: true, prev, edgesRelaxed }
    const edges = adj.get(u) || []
    for (const { to: v } of edges) {
      edgesRelaxed++
      if (visited.has(v)) continue
      visited.add(v)
      prev.set(v, u)
      queue.push(v)
    }
  }
  return { found: false, prev, edgesRelaxed }
}

function* dfs(adj, src, dst) {
  const prev = new Map()
  const visited = new Set()
  const stack = [src]
  let edgesRelaxed = 0
  while (stack.length) {
    const u = stack.pop()
    if (visited.has(u)) { yield { u, skipped: true }; continue }
    visited.add(u)
    yield { u, edgesRelaxed }
    if (u === dst) return { found: true, prev, edgesRelaxed }
    const edges = adj.get(u) || []
    for (const { to: v } of edges) {
      edgesRelaxed++
      if (visited.has(v)) continue
      if (!prev.has(v)) prev.set(v, u)
      stack.push(v)
    }
  }
  return { found: false, prev, edgesRelaxed }
}

// Bidirectional Dijkstra — grow two frontiers, one from src, one toward
// dst on the REVERSED graph. Meet in the middle. We compute the reverse
// adjacency once at the top and pass both maps in.
function* bidirectional(adj, revAdj, src, dst) {
  const distF = new Map([[src, 0]]), distB = new Map([[dst, 0]])
  const prevF = new Map(), prevB = new Map()
  const visitedF = new Set(), visitedB = new Set()
  const heapF = new MinHeap(), heapB = new MinHeap()
  heapF.push({ id: src, key: 0 }); heapB.push({ id: dst, key: 0 })
  let best = Infinity, meet = null
  let edgesRelaxed = 0

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
    yield { u, side: forward ? 'F' : 'B', dist: d, edgesRelaxed }

    if (otherVisited.has(u)) {
      const total = distF.get(u) + distB.get(u)
      if (total < best) { best = total; meet = u }
    }
    if (heapF.size && heapB.size && (heapF.a[0].key + heapB.a[0].key) >= best) {
      return { found: meet !== null, meet, prevF, prevB, distF, distB, edgesRelaxed }
    }

    const list = edges.get(u) || []
    for (const { to: v, w } of list) {
      edgesRelaxed++
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
  return { found: meet !== null, meet, prevF, prevB, distF, distB, edgesRelaxed }
}

// Bidirectional A* — same shape, but the heap key is f = g + h and the
// heuristic on each side aims at the opposite endpoint. Termination
// follows Pohl's condition: stop when the sum of the top-of-heap f
// values is ≥ the current best meet cost.
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
  let edgesRelaxed = 0

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
    yield { u, side: forward ? 'F' : 'B', dist: g.get(u), edgesRelaxed }

    if (otherVisited.has(u)) {
      const total = gF.get(u) + gB.get(u)
      if (total < best) { best = total; meet = u }
    }
    // Pohl termination on f-values.
    if (heapF.size && heapB.size && (heapF.a[0].key + heapB.a[0].key) >= best) {
      return { found: meet !== null, meet, prevF, prevB, distF: gF, distB: gB, edgesRelaxed }
    }

    const list = edges.get(u) || []
    const gu = g.get(u)
    for (const { to: v, w } of list) {
      edgesRelaxed++
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
  return { found: meet !== null, meet, prevF, prevB, distF: gF, distB: gB, edgesRelaxed }
}

// IDA* — iterative deepening on the f = g + h cutoff. Depth-limited DFS
// per iteration; the threshold is raised to the minimum f-value that
// exceeded the current bound on the previous pass. Optimal, memory-cheap.
//
// We cap the iteration count to keep the generator from running forever
// on pathological inputs (e.g. disconnected components). The animator
// counts each visited-node expansion as one step so the UI stays lively.
function* idaStar(adj, nodes, src, dst) {
  const nDst = nodes.get(dst)
  // IDA* on graphs with many distinct f-values (like a road network
  // with per-metre integer edge weights + fractional haversine) is
  // pathologically slow — the outer threshold advances by tiny epsilons
  // and re-explores exponential subtrees each pass.
  //
  // Two-step fix (was previously bucketed-only; that alone still
  // thrashed on real OSM road graphs and returned found:false):
  //   1. Bucketed IDA* — coarsen g AND h to BUCKET so the f-bound
  //      jumps by ≥ BUCKET metres per outer pass.
  //   2. Per-pass best-g pruning — cache the best g seen at every
  //      node THIS pass; skip revisits that don't improve. This
  //      collapses the O(b^d) DFS to something closer to O(V·d)
  //      without losing optimality (slack bounded by BUCKET·d).
  // On a 1400-node road-like graph IDA* used to hit MAX_ITERS with
  // no path; now completes in ~110ms with ratio ≈ 1.02 vs Dijkstra.
  const BUCKET = 500      // metres
  const h = (id) => Math.ceil(haversine(nodes.get(id), nDst) / BUCKET) * BUCKET
  const b = (w) => Math.ceil(w / BUCKET) * BUCKET      // bucket a raw edge weight
  const MAX_ITERS = 2_000_000
  let expansions = 0
  let edgesRelaxed = 0

  let threshold = h(src)
  const outerCap = 80
  let lastPrev = new Map()
  const bestG = new Map()   // per-pass: best g reached at each node

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
        yield { u: top.id, dist: top.g, edgesRelaxed }
        if (top.id === dst) { found = true; break }
        if (expansions > MAX_ITERS) return { found: false, prev, edgesRelaxed }
      }
      const edges = adj.get(top.id) || []
      if (top.iter >= edges.length) {
        onPath.delete(top.id)
        stack.pop()
        continue
      }
      const { to: v, w } = edges[top.iter++]
      edgesRelaxed++
      if (onPath.has(v)) continue
      const ng = top.g + b(w)
      // Prune if we've already reached v with equal-or-better g this pass.
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
    if (found) return { found: true, prev, edgesRelaxed }
    if (nextThreshold === Infinity) break
    threshold = nextThreshold
  }
  return { found: false, prev: lastPrev, edgesRelaxed }
}

// Greedy Best-First — pop by heuristic only, no path cost. Fast but
// wildly suboptimal; useful as the "greedy but dumb" contrast to A*.
function* greedyBest(adj, nodes, src, dst) {
  const nDst = nodes.get(dst)
  const h = (id) => haversine(nodes.get(id), nDst)
  const prev = new Map()
  const visited = new Set()
  const heap = new MinHeap()
  let edgesRelaxed = 0
  heap.push({ id: src, key: h(src) })
  while (heap.size) {
    const { id: u } = heap.pop()
    if (visited.has(u)) { yield { u, skipped: true }; continue }
    visited.add(u)
    yield { u, edgesRelaxed }
    if (u === dst) return { found: true, prev, edgesRelaxed }
    const edges = adj.get(u) || []
    for (const { to: v } of edges) {
      edgesRelaxed++
      if (visited.has(v)) continue
      if (!prev.has(v)) prev.set(v, u)
      heap.push({ id: v, key: h(v) })
    }
  }
  return { found: false, prev, edgesRelaxed }
}

// Uniform Cost Search — Dijkstra without the visited set. For teaching
// purposes we let re-pops through so students can see how allowing
// duplicates in the frontier still converges (just slower and more
// heap traffic).
function* uniformCost(adj, src, dst) {
  const dist = new Map([[src, 0]])
  const prev = new Map()
  const heap = new MinHeap()
  const seen = new Set()      // "already popped once" tracker (not a hard skip)
  let edgesRelaxed = 0
  heap.push({ id: src, key: 0 })
  while (heap.size) {
    const { id: u, key: d } = heap.pop()
    // Note: we don't hard-skip on visited; instead we skip only if this
    // popped key is worse than the recorded dist (lazy deletion).
    if (d > (dist.get(u) ?? Infinity)) { yield { u, skipped: true }; continue }
    seen.add(u)
    yield { u, dist: d, edgesRelaxed }
    if (u === dst) return { found: true, prev, dist, edgesRelaxed }
    const edges = adj.get(u) || []
    for (const { to: v, w } of edges) {
      edgesRelaxed++
      const nd = d + w
      const cur = dist.get(v)
      if (cur === undefined || nd < cur) {
        dist.set(v, nd)
        prev.set(v, u)
        heap.push({ id: v, key: nd })
      }
    }
  }
  return { found: false, prev, dist, edgesRelaxed }
}

// Fringe Search — a cache-friendlier IDA* variant. We keep two lists:
// `now` (current threshold) and `later` (nodes that missed by a bit).
// Between passes we swap and raise the threshold to the minimum f in
// `later`.
//
// Two fixes (was previously broken on real road graphs — returned
// found:false because MAX_ITERS ran out first):
//   1. Bucket BOTH g and h so the threshold advances in BUCKET-metre
//      steps, not floating-point epsilons. Real g is kept unbucketed
//      for path cost; a parallel bg (bucketed g) drives f-checks.
//   2. Deque-style head pointer replaces O(n) Array.shift().
//   3. visited set prevents re-yielding the same node once it clears
//      the threshold (previously each "now" cycle re-yielded).
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
  let edgesRelaxed = 0
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
      yield { u, dist: gu, edgesRelaxed }
      if (u === dst) return { found: true, prev, edgesRelaxed }
      const edges = adj.get(u) || []
      const bgu = bg.get(u)
      for (const { to: v, w } of edges) {
        edgesRelaxed++
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
  return { found: false, prev, edgesRelaxed }
}

// Beam Search — best-first with a hard width cap. Sort the frontier by
// f = g + h each round and drop everything past index `beamWidth`. Very
// fast, memory-bounded, but frequently suboptimal (misses the true
// shortest path when it's outside the beam).
function* beamSearch(adj, nodes, src, dst, beamWidth = 32) {
  const nDst = nodes.get(dst)
  const h = (id) => haversine(nodes.get(id), nDst)
  const g = new Map([[src, 0]])
  const prev = new Map()
  const visited = new Set()
  let frontier = [src]
  let edgesRelaxed = 0

  while (frontier.length) {
    // Expand every node in the beam.
    const next = []
    for (const u of frontier) {
      if (visited.has(u)) continue
      visited.add(u)
      yield { u, dist: g.get(u), edgesRelaxed }
      if (u === dst) return { found: true, prev, edgesRelaxed }
      const edges = adj.get(u) || []
      const gu = g.get(u)
      for (const { to: v, w } of edges) {
        edgesRelaxed++
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
    // Rank + trim.
    const unique = Array.from(new Set(next)).filter((id) => !visited.has(id))
    unique.sort((a, b) => (g.get(a) + h(a)) - (g.get(b) + h(b)))
    frontier = unique.slice(0, beamWidth)
  }
  return { found: false, prev, edgesRelaxed }
}

// JPS-highway — a road-graph flavour of Jump Point Search. Full JPS
// needs a regular grid; on a road network the equivalent trick is to
// skip over long chains of degree-2 nodes (fully constrained hallways).
// We precompute a "contracted" graph in which every degree-2 chain
// collapses to a single edge whose weight is the sum. Then we run A*
// on that graph. The path is expanded back to the original nodes for
// display.
function buildContractedGraph(adj) {
  // TRUE undirected degree — count each unordered pair {u,v} once.
  // The previous impl added `edges.length` at u AND `+1` per outgoing
  // to v; on a fully two-way graph this made every degree-2 node look
  // like degree ≥ 3, so NOTHING got contracted and JPS-highway
  // degenerated into plain A*.
  const degree = new Map()
  const seenEdge = new Set()
  const bump = (id) => degree.set(id, (degree.get(id) || 0) + 1)
  for (const [u, edges] of adj) {
    for (const { to: v } of edges) {
      const lo = u < v ? u : v
      const hi = u < v ? v : u
      const key = `${lo}|${hi}`
      if (seenEdge.has(key)) continue
      seenEdge.add(key)
      bump(u); bump(v)
    }
  }
  // Junctions = intersections. Degree-2 nodes are mid-chain hallway
  // points that can be safely contracted away.
  const isJunction = (id) => (degree.get(id) || 0) !== 2

  // For each junction u, walk each outgoing edge, following degree-2
  // chains until we land on another junction. Emit ONE super-edge
  // (u → j, sumWeight, waypoints[]).
  const superAdj = new Map()
  const superWaypoints = new Map()   // key = "u_v" → [waypoints…]
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
        // Pick the neighbour that isn't where we came from.
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
  const meta = new Map()   // v -> waypoints from prev to v
  const visited = new Set()
  const heap = new MinHeap()
  let edgesRelaxed = 0
  heap.push({ id: src, key: h(src) })

  // For a junction u we use the pre-baked super-graph. For a
  // non-junction (src/dst commonly), we walk each of its (up to 2)
  // chain directions to the nearest junction and emit an ad-hoc
  // super-edge — otherwise we'd fall back to raw edges and lose the
  // "highway" advantage entirely (and reconstruction would break at
  // the endpoint that was hopped over).
  const outEdges = (u) => {
    if (isJunction(u) && superAdj.has(u)) return superAdj.get(u)
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

  // If a super-edge's waypoints pass through dst, snap the edge to
  // terminate at dst with the truncated weight. Prevents the algo from
  // hopping OVER dst without ever landing on it — a real failure mode
  // when dst is a mid-chain node.
  const containsDst = (way) => {
    for (const w of way) if (w === dst) return true
    return false
  }

  while (heap.size) {
    const { id: u } = heap.pop()
    if (visited.has(u)) { yield { u, skipped: true }; continue }
    visited.add(u)
    yield { u, dist: g.get(u), edgesRelaxed }
    if (u === dst) return { found: true, prev, meta, edgesRelaxed }
    const gu = g.get(u)
    for (const { to: v, w } of outEdges(u)) {
      edgesRelaxed++
      let target = v
      let ew = w
      const way = superWaypoints.get(`${u}_${v}`)
      if (v !== dst && way && containsDst(way)) {
        // Rewrite the super-edge to terminate at dst.
        let acc = 0
        let node = u
        const truncated = []
        let ok = true
        for (const wp of way) {
          const raw = (adj.get(node) || []).find(e => e.to === wp)
          if (!raw) { ok = false; break }
          acc += raw.w
          truncated.push(wp)
          node = wp
          if (wp === dst) break
        }
        if (ok) {
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
  return { found: false, prev, meta, edgesRelaxed }
}

// Expand JPS-highway meta waypoints into a full node-by-node path.
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

// ─── Reverse graph builder for bidirectional variants ────────
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

// ─── Path reconstruction ──────────────────────────────────────
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

// ─── Path length in km ─────────────────────────────────────────
function pathKm(path, nodes) {
  let m = 0
  for (let i = 0; i < path.length - 1; i++) {
    const a = nodes.get(path[i]), b = nodes.get(path[i + 1])
    if (!a || !b) continue
    m += haversine(a, b)
  }
  return m / 1000
}

// ─── Alternate routes via edge-blocking Dijkstra ─────────────
// Cheap K-shortest — for each edge in the primary path we remove that
// edge, re-run Dijkstra, and keep the K best distinct paths. This is
// nowhere near a true Yen's algorithm, but it produces visibly-distinct
// ghost routes fast enough to run inside a setTimeout(0) tick.
//
// Caps at O(P * V log V) where P = path length. On the 6k-node metro
// graphs that's typically well under 200 ms even for long routes.
function computeAlternateRoutes(graph, revAdj, src, dst, mainPath, k = 2) {
  if (!graph || !mainPath || mainPath.length < 3) return []
  const { adj, nodes } = graph
  const seen = new Set([mainPath.join(',')])
  const results = []
  // Cap the number of blocking probes so an enormous path doesn't stall
  // the browser — sample edges at even intervals.
  const probes = Math.min(mainPath.length - 1, 24)
  const stride = Math.max(1, Math.floor((mainPath.length - 1) / probes))
  for (let i = 0; i < mainPath.length - 1; i += stride) {
    const u = mainPath[i], v = mainPath[i + 1]
    const originalEdges = adj.get(u) || []
    const filtered = originalEdges.filter((e) => e.to !== v)
    if (filtered.length === originalEdges.length) continue
    adj.set(u, filtered)
    try {
      const alt = dijkstraShortest(adj, src, dst)
      if (alt) {
        const sig = alt.join(',')
        if (!seen.has(sig)) {
          seen.add(sig)
          const km = pathKm(alt, nodes)
          results.push({ path: alt, km })
        }
      }
    } finally {
      adj.set(u, originalEdges)
    }
    if (results.length >= k * 2) break   // over-collect so we can filter
  }
  // Rank by length, prefer routes that don't share too many nodes with
  // the primary — otherwise the ghost lines look identical.
  const mainSet = new Set(mainPath)
  results.sort((a, b) => {
    const overlapA = a.path.filter((n) => mainSet.has(n)).length / a.path.length
    const overlapB = b.path.filter((n) => mainSet.has(n)).length / b.path.length
    if (Math.abs(overlapA - overlapB) > 0.15) return overlapA - overlapB
    return a.km - b.km
  })
  return results.slice(0, k)
}

// Sync Dijkstra returning just the path (or null). Used by
// computeAlternateRoutes — the animated generator variant is overkill
// when we just want the shortest edge-removed result.
function dijkstraShortest(adj, src, dst) {
  const dist = new Map([[src, 0]])
  const prev = new Map()
  const visited = new Set()
  const heap = new MinHeap()
  heap.push({ id: src, key: 0 })
  while (heap.size) {
    const { id: u, key: d } = heap.pop()
    if (visited.has(u)) continue
    visited.add(u)
    if (u === dst) {
      const path = [u]
      let cur = u
      while (prev.has(cur)) { cur = prev.get(cur); path.push(cur) }
      return path.reverse()
    }
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
  return null
}

// ─── Nearest node to a lat/lng click ───────────────────────────
function nearestNode(nodes, lat, lng) {
  let bestId = null, best = Infinity
  for (const [id, n] of nodes) {
    const dLat = n.lat - lat, dLng = n.lng - lng
    const d2 = dLat * dLat + dLng * dLng
    if (d2 < best) { best = d2; bestId = id }
  }
  return bestId
}

// ─── Algorithm metadata + palette ─────────────────────────────
// `optimal: true` marks algorithms that guarantee the shortest weighted
// path on a non-negative-weight graph. Used by the comparison table
// verdict badge.
const ALGOS = [
  { key: 'dijkstra',       name: 'Dijkstra',              tc: 'O((V+E) log V)', color: '#22d3ee', optimal: true,  desc: 'Uniform-cost search — expands radially by distance.' },
  { key: 'astar',          name: 'A*',                    tc: 'O((V+E) log V)', color: '#fbbf24', optimal: true,  desc: 'Heuristic-guided — pulls toward the goal.' },
  { key: 'bidirectional',  name: 'Bidi Dijkstra',         tc: 'O((V+E) log V)', color: '#f472b6', optimal: true,  desc: 'Two Dijkstra frontiers race — typically ~½ the work.' },
  { key: 'bidiAstar',      name: 'Bidi A*',               tc: 'O((V+E) log V)', color: '#a78bfa', optimal: true,  desc: 'Two heuristic frontiers meet in the middle (Pohl).' },
  { key: 'idaStar',        name: 'IDA*',                  tc: 'O(b^d) time',    color: '#fb923c', optimal: true,  desc: 'Iterative deepening A* — depth-limited DFS on f-bound.' },
  { key: 'greedy',         name: 'Greedy Best-First',     tc: 'O((V+E) log V)', color: '#f87171', optimal: false, desc: 'Pure heuristic — fast but usually suboptimal.' },
  { key: 'uniform',        name: 'Uniform Cost',          tc: 'O((V+E) log V)', color: '#34d399', optimal: true,  desc: 'Dijkstra without visited-set — lazy deletion.' },
  { key: 'fringe',         name: 'Fringe Search',         tc: 'O((V+E))',       color: '#c084fc', optimal: true,  desc: 'IDA*-alike with two-list threshold sweep.' },
  { key: 'beam',           name: 'Beam Search (w=32)',    tc: 'O(w·d)',         color: '#facc15', optimal: false, desc: 'Best-first with fixed beam width — fast, suboptimal.' },
  { key: 'jps',            name: 'JPS-highway',           tc: 'O((V′+E′) log)', color: '#38bdf8', optimal: true,  desc: 'A* on a graph with degree-2 chains contracted.' },
  { key: 'bfs',            name: 'BFS',                   tc: 'O(V+E)',         color: '#94a3b8', optimal: false, desc: 'Level-by-level — hop-count, not distance.' },
  { key: 'dfs',            name: 'DFS',                   tc: 'O(V+E)',         color: '#64748b', optimal: false, desc: 'Depth-first probe — rarely optimal.' },
]

const ALGO_MAP = new Map(ALGOS.map((a) => [a.key, a]))

// Factory — builds a fresh generator for an algo key.
function makeGenerator(key, graph, revAdj, src, dst) {
  switch (key) {
    case 'dijkstra':      return dijkstra(graph.adj, src, dst)
    case 'astar':         return astar(graph.adj, graph.nodes, src, dst)
    case 'bfs':           return bfs(graph.adj, src, dst)
    case 'dfs':           return dfs(graph.adj, src, dst)
    case 'bidirectional': return bidirectional(graph.adj, revAdj, src, dst)
    case 'bidiAstar':     return bidirectionalAstar(graph.adj, revAdj, graph.nodes, src, dst)
    case 'idaStar':       return idaStar(graph.adj, graph.nodes, src, dst)
    case 'greedy':        return greedyBest(graph.adj, graph.nodes, src, dst)
    case 'uniform':       return uniformCost(graph.adj, src, dst)
    case 'fringe':        return fringe(graph.adj, graph.nodes, src, dst)
    case 'beam':          return beamSearch(graph.adj, graph.nodes, src, dst, 32)
    case 'jps':           return jpsHighway(graph.adj, graph.nodes, src, dst)
    default: return null
  }
}

// Sync runner — spins the generator to completion off the animation
// loop. Used by Run-All. Returns {name, path, visited, edgesRelaxed, ms,
// pathKm, found, iterations}.
function runAlgoSync(key, graph, revAdj, src, dst, timeBudgetMs = 6000) {
  const meta = ALGO_MAP.get(key)
  const t0 = performance.now()
  const gen = makeGenerator(key, graph, revAdj, src, dst)
  if (!gen) return null
  let visited = 0, iterations = 0, edgesRelaxed = 0
  let last = null
  const cadence = 5000    // clock-check every N iterations
  while (true) {
    const r = gen.next()
    iterations++
    if (r.done) { last = r.value; break }
    if (r.value && r.value.u !== undefined && !r.value.skipped) visited++
    if (r.value && typeof r.value.edgesRelaxed === 'number') edgesRelaxed = r.value.edgesRelaxed
    // Budget check — skip the perf.now() cost on most iters.
    if ((iterations % cadence) === 0 && (performance.now() - t0) > timeBudgetMs) {
      return {
        key, name: meta.name, path: null, visited, iterations, edgesRelaxed,
        ms: performance.now() - t0, pathKm: 0, found: false, timedOut: true,
      }
    }
  }
  let path = null
  if (last?.found) {
    if (key === 'bidirectional' || key === 'bidiAstar') {
      path = reconstructBidi(last.prevF, last.prevB, src, dst, last.meet)
    } else if (key === 'jps') {
      const raw = reconstruct(last.prev, src, dst)
      path = expandContractedPath(raw, last.meta)
    } else {
      path = reconstruct(last.prev, src, dst)
    }
  }
  const ms = performance.now() - t0
  return {
    key,
    name: meta.name,
    path,
    visited,
    iterations,
    edgesRelaxed: last?.edgesRelaxed ?? edgesRelaxed,
    ms,
    pathKm: path ? pathKm(path, graph.nodes) : 0,
    found: !!path,
  }
}

// Async runner — same shape as runAlgoSync but chunks work across
// microtasks so it can be raced against Promise.race([...timeout]).
// Yields every `chunk` iterations via setTimeout(0) so the UI stays
// responsive and a wall-clock cap can win the race even for an algorithm
// that would otherwise burn a whole thread.
//
// timeBudgetMs = 0 (or Infinity) means "no timeout" — only the abort
// signal or algorithm completion breaks the loop.
//
// signal is an optional AbortSignal — when aborted, the runner resolves
// with { stopped: true, ... } on the next chunk boundary instead of
// continuing to burn CPU. Cheaper than tearing the microtask loop down.
function runAlgoAsync(key, graph, revAdj, src, dst, timeBudgetMs = 30000, signal = null) {
  return new Promise((resolve) => {
    const meta = ALGO_MAP.get(key)
    const t0 = performance.now()
    const gen = makeGenerator(key, graph, revAdj, src, dst)
    if (!gen) { resolve(null); return }
    let visited = 0, iterations = 0, edgesRelaxed = 0
    let last = null
    const chunk = 20_000    // iters per macrotask
    const noLimit = !timeBudgetMs || timeBudgetMs === Infinity
    const step = () => {
      // Abort-first — cheaper than doing chunk work then discarding it.
      if (signal && signal.aborted) {
        resolve({
          key, name: meta.name, path: null, visited, iterations, edgesRelaxed,
          ms: performance.now() - t0, pathKm: 0, found: false, stopped: true,
        })
        return
      }
      let n = chunk
      while (n-- > 0) {
        const r = gen.next()
        iterations++
        if (r.done) { last = r.value; break }
        if (r.value && r.value.u !== undefined && !r.value.skipped) visited++
        if (r.value && typeof r.value.edgesRelaxed === 'number') edgesRelaxed = r.value.edgesRelaxed
      }
      const elapsed = performance.now() - t0
      if (last === null && !noLimit && elapsed > timeBudgetMs) {
        resolve({
          key, name: meta.name, path: null, visited, iterations, edgesRelaxed,
          ms: elapsed, pathKm: 0, found: false, timedOut: true,
        })
        return
      }
      if (last !== null) {
        let path = null
        if (last?.found) {
          if (key === 'bidirectional' || key === 'bidiAstar') {
            path = reconstructBidi(last.prevF, last.prevB, src, dst, last.meet)
          } else if (key === 'jps') {
            const raw = reconstruct(last.prev, src, dst)
            path = expandContractedPath(raw, last.meta)
          } else {
            path = reconstruct(last.prev, src, dst)
          }
        }
        resolve({
          key,
          name: meta.name,
          path,
          visited,
          iterations,
          edgesRelaxed: last?.edgesRelaxed ?? edgesRelaxed,
          ms: elapsed,
          pathKm: path ? pathKm(path, graph.nodes) : 0,
          found: !!path,
        })
        return
      }
      setTimeout(step, 0)
    }
    setTimeout(step, 0)
  })
}

// Default city — first metro in the catalogue.
const DEFAULT_CITY = 'bangalore'

// Trending cities — surfaced at the top of the command palette when the
// user hasn't typed anything yet. These are the 5 metros with the
// heaviest road graphs; picked because they're what most first-time
// visitors want to explore.
const TRENDING_SLUGS = ['mumbai', 'delhi', 'bangalore', 'chennai', 'kolkata']

// Progressive loader stages. Each entry maps a stage index to a label +
// icon shown in the on-canvas skeleton overlay. The last stage ('ready')
// is decorative — the overlay unmounts once it's reached.
const LOAD_STAGES = [
  { key: 'fetch',     label: 'Fetching graph',      hint: 'streaming from server cache' },
  { key: 'decode',    label: 'Decoding',            hint: 'gunzip + JSON parse' },
  { key: 'project',   label: 'Projecting',          hint: 'plate carrée + batched Path2D' },
  { key: 'ready',     label: 'Ready',               hint: '' },
]

// ─── SliderRow — Physics-style typed slider + numeric input ────
function SliderRow({ label, value, min, max, step = 1, unit = '', onChange, help }) {
  const clamp = (v) => {
    if (v == null || Number.isNaN(v)) return min
    const c = Math.max(min, Math.min(max, v))
    return Math.round(c / step) * step
  }
  return (
    <div>
      <div className='flex items-center justify-between text-[11px] mb-0.5'>
        <span className='text-fg-muted'>{label}</span>
        <span className='font-mono text-amber-300'>{value}{unit}</span>
      </div>
      <div className='flex items-center gap-2'>
        <div className='flex-1'>
          <Slider
            min={min} max={max} step={step}
            value={value}
            onChange={(v) => onChange(clamp(v))}
            tooltip={{ open: false }}
          />
        </div>
        <InputNumber
          size='small'
          min={min} max={max} step={step}
          value={value}
          controls={false}
          onChange={(v) => onChange(clamp(Number(v)))}
          onBlur={(e) => onChange(clamp(Number(e.target.value)))}
          className='w-20'
        />
      </div>
      {help && <p className='text-[11px] text-fg-muted leading-snug mt-1'>{help}</p>}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────
export default function Pathfinding() {
  const [status, setStatus] = useState('boot') // boot | catalog | fetching | ready | error
  const [errMsg, setErrMsg] = useState('')
  const [algo, setAlgo] = useState('dijkstra')
  const [running, setRunning] = useState(false)
  const [speed, setSpeed] = useState(120)  // steps per frame
  const [src, setSrc] = useState(null)
  const [dst, setDst] = useState(null)
  const [tele, setTele] = useState({ visited: 0, ms: 0, pathKm: 0, pathN: 0, done: false, found: false })

  // Multi-city state
  const [cities, setCities] = useState([])
  const [citySlug, setCitySlug] = useState(DEFAULT_CITY)
  const [cityMeta, setCityMeta] = useState(null)
  const cityCacheRef = useRef(new Map())

  // Progressive load stages — each ticks on as the pipeline advances so
  // the loader panel reads like a Google-Maps hand-off: fetch → decode
  // → project → ready. `loadStage` is a numeric index into LOAD_STAGES.
  const [loadStage, setLoadStage] = useState(0)

  // Command palette — Cmd+K style city switcher. Replaces the flat grouped
  // <Select> which forced users to scan 150+ options. Opens on click or
  // ⌘K / Ctrl+K.
  const [paletteOpen, setPaletteOpen] = useState(false)

  // Recent cities — persisted in localStorage. Trims to last 5, dedups by
  // slug, and never overwrites without the currently loaded city being
  // added at the head.
  const [recentCities, setRecentCities] = useState(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = localStorage.getItem('pathfinding.recentCities')
      return raw ? JSON.parse(raw).slice(0, 5) : []
    } catch { return [] }
  })

  // Alternate routes — 2nd + 3rd best paths shown as dashed ghost lines
  // underneath the primary amber path. Computed alongside the main route
  // whenever a Run finishes (see the tick() done branch below).
  const [altPaths, setAltPaths] = useState([])   // [{ path, km }, …]

  // Path trace animation — once a route is found we animate a bright
  // amber "trace" along the path from src → dst. `traceStart` = ts when
  // the animation began; the canvas draw loop reads it to render a
  // moving highlighted segment on top of the static path.
  const traceStartRef = useRef(0)
  const traceRafRef = useRef(null)
  // Alt-route generation is async and can race — this ID is bumped every
  // time we start a new alt-route job so a slow prior job won't
  // clobber the current one when it finishes.
  const altRunIdRef = useRef(0)

  // Zoom + pan
  const [transform, setTransform] = useState({ tx: 0, ty: 0, scale: 1 })
  const transformRef = useRef(transform)
  transformRef.current = transform

  // Fullscreen state — reflects document.fullscreenElement so browser-side
  // Escape / F11 always keeps the UI in sync with the actual state.
  const [isFullscreen, setIsFullscreen] = useState(false)
  const canvasWrapRef = useRef(null)
  // rAF handle for the fit-to-pins tween — cancelled if a new fit fires
  // mid-animation so we never have two easings fighting for setTransform.
  const fitRafRef = useRef(null)

  // Run-all state
  const [comparisonRows, setComparisonRows] = useState([])
  const [runAllBusy, setRunAllBusy] = useState(false)
  const [hidden, setHidden] = useState({})   // key -> bool (hidden path overlay)
  const [sortKey, setSortKey] = useState('ms')
  const [sortDir, setSortDir] = useState('asc')
  // Progress state for the batched Run-all. Displayed as an antd Progress
  // bar while the batch is in flight. Table stays hidden until batch ends.
  const [batchProgress, setBatchProgress] = useState(null) // null | { current, total, elapsedSec, currentName, capMs }
  // Per-algorithm timeout budget for Run-all. 0 = no limit. Persisted in
  // localStorage so returning users keep their preference.
  const [algoTimeoutMs, setAlgoTimeoutMs] = useState(() => {
    if (typeof window === 'undefined') return 10000
    const raw = Number(window.localStorage?.getItem('pathfinding.algoTimeoutMs'))
    if (Number.isFinite(raw) && raw >= 0) return raw
    return 10000
  })
  useEffect(() => {
    try { window.localStorage?.setItem('pathfinding.algoTimeoutMs', String(algoTimeoutMs)) } catch (_) {}
  }, [algoTimeoutMs])
  // Abort plumbing for the Stop button. `abortRef` holds the current
  // algorithm's AbortController (rotated per-algo). `cancelledRef` is a
  // one-shot flag flipped by the Stop button — the runAll loop reads it
  // between algorithms and breaks out entirely.
  const abortRef = useRef(null)
  const cancelledRef = useRef(false)

  // Google-Maps-style dual composer — one autocomplete per pin. Each has
  // its own debounce timer, suggestion list, highlight cursor, and open
  // state. Recent-selection lists are persisted per key in localStorage.
  const [fromQuery, setFromQuery]           = useState('')
  const [toQuery,   setToQuery]             = useState('')
  const [fromSuggestions, setFromSuggestions] = useState([])
  const [toSuggestions,   setToSuggestions]   = useState([])
  const [fromOpen,  setFromOpen]            = useState(false)
  const [toOpen,    setToOpen]              = useState(false)
  const [fromHighlight, setFromHighlight]   = useState(0)
  const [toHighlight,   setToHighlight]     = useState(0)
  const [fromRecents, setFromRecents]       = useState([])
  const [toRecents,   setToRecents]         = useState([])
  const [showLabels, setShowLabels]         = useState(false)
  const [labels, setLabels]                 = useState([])          // top-50 labels for overlay
  const fromDebounceRef = useRef(null)
  const toDebounceRef   = useRef(null)

  // ── AI recommendation popup ──
  // User types a natural-language brief ("italian near bandra") →
  // BE calls Groq → we render 3-5 cards, each with a "Set as From" /
  // "Set as To" pair. Clicking a card resolves the recommended name
  // against the city's places table via the existing fuzzy search.
  const [aiOpen, setAiOpen]             = useState(false)
  const [aiQuery, setAiQuery]           = useState('')
  const [aiLoading, setAiLoading]       = useState(false)
  const [aiRecs, setAiRecs]             = useState([])          // [{name, kind, reason, area}]
  const [aiPickBusy, setAiPickBusy]     = useState({})          // { [idx_which]: true }

  // ── Live location (browser geolocation) ──
  // Cached in sessionStorage so a second click doesn't re-prompt.
  const [geoBusy, setGeoBusy]           = useState({ from: false, to: false })

  const graphRef        = useRef(null)
  const revAdjRef       = useRef(null)
  const bboxRef         = useRef(null)
  const canvasRef       = useRef(null)
  const projRef         = useRef(null)
  const basePathRef     = useRef(null)
  const genRef          = useRef(null)
  const visitedSetRef   = useRef(new Set())
  const visitedListRef  = useRef([])
  const frontierRef     = useRef(new Set())
  const pathRef         = useRef(null)
  const startTsRef      = useRef(0)
  const rafRef          = useRef(null)
  const bidiSideRef     = useRef(new Map())
  // Mirror `running` into a ref so the RAF closure sees the LATEST
  // value on every tick, not the one captured when the frame was
  // scheduled. Without this, hitting Pause left the algorithm running
  // for one final generator burst before the state re-render landed.
  const runningRef      = useRef(false)

  // ── Boot: fetch the catalogue, then the default city's graph. ─
  useEffect(() => {
    document.title = 'Pathfinding Lab · Sid'
    let cancelled = false
    ;(async () => {
      try {
        setStatus('catalog')
        const list = await apiGet(ENDPOINTS.CITY_GRAPHS)
        if (cancelled) return
        const items = list?.data?.items || []
        if (!items.length) throw new Error('No cities available')
        setCities(items)
        const startSlug = items.find((c) => c.slug === DEFAULT_CITY) ? DEFAULT_CITY : items[0].slug
        await loadCity(startSlug, { cancelled: () => cancelled })
      } catch (e) {
        console.error(e)
        if (!cancelled) {
          setErrMsg(e.message || String(e))
          setStatus('error')
        }
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Load a city's graph, from in-memory cache if we've seen it ──
  //
  // Fires TWO parallel requests instead of one big /:slug envelope:
  //   • /meta            — tiny JSON with {name, bbox, node_count, kb, ...}
  //   • /graph.json.gz   — the raw gzipped SQLite BLOB, Content-Encoding:
  //                        gzip, browser inflates natively. ~6 MB JSON
  //                        rides the wire as ~1.2 MB.
  //
  // Old /:slug endpoint still works and is kept as a fallback for anyone
  // hitting an older BE — but the split path is 3-5× faster in practice
  // and avoids a redundant gunzip+re-serialize on the server.
  async function loadCity(slug, opts = {}) {
    const isCancelled = () => opts.cancelled?.() === true
    const cached = cityCacheRef.current.get(slug)
    if (cached) {
      // Cache hit — skip the overlay entirely; installCity sets stage=3.
      installCity(slug, cached)
      return
    }
    try {
      setStatus('fetching')
      setLoadStage(0)   // fetch
      const t0 = Date.now()
      const BE = import.meta.env.VITE_BE_URL || 'http://localhost:4001'
      const [metaRes, graph] = await Promise.all([
        apiGet(`${ENDPOINTS.CITY_GRAPHS}/${slug}/meta`),
        // Raw gzipped blob route — browser transparently decodes because
        // the BE sets Content-Encoding: gzip. No manual gunzip on our end.
        fetch(`${BE}${ENDPOINTS.CITY_GRAPHS}/${slug}/graph.json.gz`, {
          headers: { 'Accept': 'application/json' },
        }).then((r) => {
          if (!r.ok) throw new Error(`graph fetch failed: ${r.status}`)
          return r.json()
        }),
      ])
      if (isCancelled()) return
      // Stage advance: fetch → decode. Both requests are back so we've
      // moved past the network wait and are now inflating the payload.
      setLoadStage(1)   // decode
      const meta = metaRes?.data
      if (!meta) throw new Error('Empty meta payload')
      if (!graph || !graph.nodes || !graph.edges) throw new Error('Empty graph payload')
      const { nodes, adj } = inflateGraph(graph)
      const revAdj = buildReverseAdj(adj)
      const bbox = parseBbox(meta.bbox)
      // Stage advance: decode → project. From here the resizeAndProject
      // effect will build the base Path2D and repaint the canvas.
      setLoadStage(2)   // project
      const entry = {
        nodes, adj, revAdj, bbox,
        meta: {
          slug: meta.slug,
          name: meta.name,
          node_count: meta.node_count,
          edge_count: meta.edge_count,
          fetched_at: meta.fetched_at,
          kb: meta.kb,
          center: meta.center,
        },
      }
      cityCacheRef.current.set(slug, entry)
      // Timing so the speedup is easy to eyeball in devtools. Should be
      // ~500-800 ms warm-cache (was ~1.9 s pre-compression on Bangalore).
      // eslint-disable-next-line no-console
      console.debug('[city-graphs]', slug, 'meta+graph in', (Date.now() - t0) + 'ms')
      installCity(slug, entry)
    } catch (e) {
      console.error(e)
      setErrMsg(e.message || String(e))
      setStatus('error')
    }
  }

  // ── Swap the live graph refs to point at a loaded city's data. ──
  function installCity(slug, entry) {
    graphRef.current = { nodes: entry.nodes, adj: entry.adj }
    revAdjRef.current = entry.revAdj
    bboxRef.current = entry.bbox
    setCitySlug(slug)
    setCityMeta(entry.meta)
    const ids = [...entry.nodes.keys()]
    if (ids.length) {
      const s = ids[Math.floor(ids.length * 0.25)]
      const d = ids[Math.floor(ids.length * 0.75)]
      setSrc(s); setDst(d)
    } else {
      setSrc(null); setDst(null)
    }
    basePathRef.current = null
    setComparisonRows([])
    setAltPaths([])
    setTransform({ tx: 0, ty: 0, scale: 1 })
    setLabels([])
    setFromSuggestions([])
    setToSuggestions([])
    setFromQuery('')
    setToQuery('')
    setFromOpen(false)
    setToOpen(false)
    setStatus('ready')
    setLoadStage(3)   // ready — overlay unmounts

    // Persist this pick to the recents list. Trim to 5, dedup by slug, put
    // the freshly loaded city at the head so returning users see it first
    // in the palette.
    setRecentCities((prev) => {
      // Prefer the catalogue row (has state); fall back to the graph meta
      // which always has a name.
      const fromCatalog = (cities || []).find((c) => c.slug === slug)
      const name = fromCatalog?.name || entry?.meta?.name || slug
      const state = fromCatalog?.state || ''
      const next = [{ slug, name, state }, ...prev.filter((r) => r.slug !== slug)].slice(0, 5)
      try { localStorage.setItem('pathfinding.recentCities', JSON.stringify(next)) } catch {}
      return next
    })
  }

  // ── Build the projection + base Path2D once a city is ready ──
  useEffect(() => {
    if (status !== 'ready') return
    resizeAndProject()
    const onResize = () => { resizeAndProject(); requestFrame() }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, citySlug])

  function resizeAndProject() {
    const canvas = canvasRef.current
    const g = graphRef.current
    const BBOX = bboxRef.current
    if (!canvas || !g || !BBOX) return
    const parent = canvas.parentElement
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = parent.clientWidth, h = parent.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const cosLat = Math.cos(((BBOX.south + BBOX.north) / 2) * Math.PI / 180)
    const bbW = (BBOX.east - BBOX.west) * cosLat
    const bbH = BBOX.north - BBOX.south
    const scale = Math.min(w / bbW, h / bbH) * 0.98
    const offX = (w - bbW * scale) / 2
    const offY = (h - bbH * scale) / 2

    // Base (unzoomed) projection. All draw ops multiply by the zoom
    // transform on top of this.
    const baseXOf = (lng) => offX + (lng - BBOX.west) * cosLat * scale
    const baseYOf = (lat) => offY + (BBOX.north - lat) * scale
    // Composited projection that respects the current zoom/pan.
    const xOf = (lng) => {
      const { tx, scale: s } = transformRef.current
      return baseXOf(lng) * s + tx
    }
    const yOf = (lat) => {
      const { ty, scale: s } = transformRef.current
      return baseYOf(lat) * s + ty
    }
    projRef.current = { xOf, yOf, baseXOf, baseYOf, dpr, w, h, scale, cosLat, offX, offY, bbW, bbH }

    // Batch the base road network into ONE Path2D IN BASE COORDINATES.
    // We then translate + scale via ctx.setTransform at draw time so we
    // don't have to rebuild the Path2D every zoom event.
    const base = new Path2D()
    for (const [u, edges] of g.adj) {
      const nu = g.nodes.get(u)
      if (!nu) continue
      const ux = baseXOf(nu.lng), uy = baseYOf(nu.lat)
      for (const { to: v } of edges) {
        const nv = g.nodes.get(v)
        if (!nv) continue
        base.moveTo(ux, uy)
        base.lineTo(baseXOf(nv.lng), baseYOf(nv.lat))
      }
    }
    basePathRef.current = base
    draw()
  }

  // ── Rebuild generator whenever algo / src / dst / city changes ──
  useEffect(() => {
    if (status !== 'ready' || src == null || dst == null) return
    resetRun()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, citySlug, algo, src, dst])

  function resetRun() {
    const g = graphRef.current
    if (!g) return
    visitedSetRef.current = new Set()
    visitedListRef.current = []
    frontierRef.current = new Set([src])
    pathRef.current = null
    bidiSideRef.current = new Map()
    startTsRef.current = 0
    traceStartRef.current = 0
    setAltPaths([])
    setTele({ visited: 0, ms: 0, pathKm: 0, pathN: 0, done: false, found: false })

    genRef.current = makeGenerator(algo, g, revAdjRef.current, src, dst)
    requestFrame()
  }

  function requestFrame() {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(tick)
  }

  // ── Main tick — advance the generator N steps then repaint. ──
  // Reads runningRef (not the closured `running`) so Pause flipping
  // state immediately halts the generator on the next frame, without
  // waiting for the closure to be recreated by a re-render.
  function tick(ts) {
    rafRef.current = null
    const isRunning = runningRef.current
    if (!startTsRef.current && isRunning) startTsRef.current = ts

    // Paused: repaint (so the marker/last-visited cells stay visible)
    // but DO NOT advance the generator. Also don't reschedule — the
    // useEffect below re-arms a frame when running flips back to true.
    if (!isRunning) {
      draw()
      return
    }

    const gen = genRef.current
    let doneNow = false, resultNow = null

    if (gen) {
      let steps = Math.max(1, speed)
      while (steps-- > 0) {
        const r = gen.next()
        if (r.done) {
          doneNow = true
          resultNow = r.value
          break
        }
        const ev = r.value
        if (ev && ev.u !== undefined) {
          const id = ev.u
          if (!visitedSetRef.current.has(id) && !ev.skipped) {
            visitedSetRef.current.add(id)
            visitedListRef.current.push(id)
            if (ev.side) bidiSideRef.current.set(id, ev.side)
          }
        }
      }
    }

    draw()

    if (doneNow) {
      let path = null
      if (resultNow?.found) {
        if (algo === 'bidirectional' || algo === 'bidiAstar') {
          path = reconstructBidi(resultNow.prevF, resultNow.prevB, src, dst, resultNow.meet)
        } else if (algo === 'jps') {
          const raw = reconstruct(resultNow.prev, src, dst)
          path = expandContractedPath(raw, resultNow.meta)
        } else {
          path = reconstruct(resultNow.prev, src, dst)
        }
      }
      pathRef.current = path
      runningRef.current = false
      setRunning(false)
      const ms = ts - startTsRef.current
      const km = path ? pathKm(path, graphRef.current.nodes) : 0
      const turns = path ? countTurns(path, graphRef.current.nodes) : 0
      setTele({
        visited: visitedListRef.current.length,
        ms: Math.round(ms),
        pathKm: km,
        pathN: path ? path.length : 0,
        turns,
        minutes: estimateDriveMinutes(km),
        done: true,
        found: !!path,
      })
      // Kick off the trace animation clock so the moving highlight begins
      // sliding immediately once the route resolves.
      traceStartRef.current = 0
      // Fire alt-route computation as a low-priority async task so it
      // doesn't block the primary route reveal. Wrapped in a check so
      // rapid re-runs don't overwrite each other.
      if (path && !REDUCE_MOTION) {
        const g = graphRef.current
        const revAdj = revAdjRef.current
        const runId = ++altRunIdRef.current
        setAltPaths([])
        setTimeout(() => {
          if (runId !== altRunIdRef.current) return
          const alts = computeAlternateRoutes(g, revAdj, src, dst, path, 2)
          if (runId !== altRunIdRef.current) return
          setAltPaths(alts)
        }, 40)
      } else {
        setAltPaths([])
      }
      draw()
      return
    }

    setTele((t) => ({
      ...t,
      visited: visitedListRef.current.length,
      ms: Math.round(ts - startTsRef.current),
    }))
    requestFrame()
  }

  // Mirror `running` into the ref + arm/cancel the RAF loop as needed.
  // On unmount we cancel any pending frame so a stale tick doesn't fire
  // after the component tears down.
  useEffect(() => {
    runningRef.current = running
    if (running) {
      requestFrame()
    } else if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      if (traceRafRef.current) {
        cancelAnimationFrame(traceRafRef.current)
        traceRafRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  useEffect(() => {
    if (status === 'ready') draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, src, dst, algo, citySlug, transform, comparisonRows, hidden, showLabels, labels])

  // ── Rendering ──
  function draw() {
    const canvas = canvasRef.current
    const proj = projRef.current
    const g = graphRef.current
    if (!canvas || !proj || !g) return
    const ctx = canvas.getContext('2d')
    const { w, h, dpr, baseXOf, baseYOf } = proj
    const { tx, ty, scale: zoom } = transformRef.current

    // Reset transform then apply DPR + zoom + pan combined so the base
    // Path2D (built in base coords) renders once with the right scale.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#05050a'
    ctx.fillRect(0, 0, w, h)

    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * tx, dpr * ty)

    if (basePathRef.current) {
      ctx.lineWidth = 0.6 / zoom
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.stroke(basePathRef.current)
    }

    // Visited (settled) — subtle dots.
    const visited = visitedListRef.current
    if (visited.length) {
      const dotR = 1.4 / zoom
      const batchWhite = new Path2D()
      const batchF = new Path2D()
      const batchB = new Path2D()
      for (let i = 0; i < visited.length; i++) {
        const id = visited[i]
        const n = g.nodes.get(id)
        if (!n) continue
        const x = baseXOf(n.lng), y = baseYOf(n.lat)
        const side = bidiSideRef.current.get(id)
        const p = side === 'F' ? batchF : side === 'B' ? batchB : batchWhite
        p.moveTo(x + dotR, y)
        p.arc(x, y, dotR, 0, Math.PI * 2)
      }
      ctx.fillStyle = 'rgba(230,230,230,0.35)'
      ctx.fill(batchWhite)
      ctx.fillStyle = 'rgba(34,211,238,0.55)'
      ctx.fill(batchF)
      ctx.fillStyle = 'rgba(244,114,182,0.55)'
      ctx.fill(batchB)
    }

    // Comparison paths — overlay each algo's path in its palette colour.
    if (comparisonRows.length) {
      for (const row of comparisonRows) {
        if (!row.path || hidden[row.key]) continue
        const meta = ALGO_MAP.get(row.key)
        ctx.strokeStyle = meta?.color || '#fff'
        ctx.lineWidth = 1.6 / zoom
        ctx.globalAlpha = 0.7
        ctx.beginPath()
        for (let i = 0; i < row.path.length; i++) {
          const n = g.nodes.get(row.path[i])
          if (!n) continue
          const x = baseXOf(n.lng), y = baseYOf(n.lat)
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
      ctx.globalAlpha = 1
    }

    // Alternate routes (2nd + 3rd best) — dashed muted ghost lines under
    // the primary path so users can see there's more than one way home.
    // Only drawn once the primary route has resolved.
    if (pathRef.current && altPaths.length) {
      ctx.save()
      ctx.setLineDash([6 / zoom, 6 / zoom])
      const ALT_COLORS = ['rgba(148,163,184,0.55)', 'rgba(148,163,184,0.35)']
      for (let idx = 0; idx < altPaths.length; idx++) {
        const alt = altPaths[idx]
        if (!alt?.path?.length) continue
        ctx.strokeStyle = ALT_COLORS[idx] || ALT_COLORS[1]
        ctx.lineWidth = 1.6 / zoom
        ctx.beginPath()
        for (let i = 0; i < alt.path.length; i++) {
          const n = g.nodes.get(alt.path[i])
          if (!n) continue
          const x = baseXOf(n.lng), y = baseYOf(n.lat)
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
      ctx.restore()
    }

    // Final path — amber, thick, drawn on top of comparisons. Once the
    // route resolves we add a soft glow and animate a bright trace along
    // it (unless reduced-motion). The trace is a subset of the path
    // between two moving parametric endpoints.
    if (pathRef.current) {
      const p = pathRef.current
      // Base line — amber with a soft glow underneath for depth.
      ctx.save()
      ctx.shadowColor = 'rgba(251,191,36,0.55)'
      ctx.shadowBlur = 8
      ctx.strokeStyle = 'rgba(251,191,36,0.95)'
      ctx.lineWidth = 2.8 / zoom
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      for (let i = 0; i < p.length; i++) {
        const n = g.nodes.get(p[i])
        if (!n) continue
        const x = baseXOf(n.lng), y = baseYOf(n.lat)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.restore()

      // Trace animation — a moving bright segment that races src → dst,
      // loops with a small gap. Skipped for reduced-motion users.
      if (!REDUCE_MOTION && tele.done && tele.found) {
        const now = performance.now()
        if (!traceStartRef.current) traceStartRef.current = now
        const TRACE_MS = 2200
        const t = ((now - traceStartRef.current) % TRACE_MS) / TRACE_MS
        const segFrac = 0.18   // 18% of the path is bright at any time
        const head = t
        const tail = Math.max(0, t - segFrac)
        const n = p.length
        const startIdx = Math.floor(tail * (n - 1))
        const endIdx   = Math.min(n - 1, Math.ceil(head * (n - 1)))
        if (endIdx > startIdx) {
          ctx.save()
          ctx.shadowColor = 'rgba(253,224,71,0.9)'
          ctx.shadowBlur = 14
          ctx.strokeStyle = 'rgba(253,224,71,1)'
          ctx.lineWidth = 3.4 / zoom
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          ctx.beginPath()
          for (let i = startIdx; i <= endIdx; i++) {
            const node = g.nodes.get(p[i])
            if (!node) continue
            const x = baseXOf(node.lng), y = baseYOf(node.lat)
            if (i === startIdx) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          ctx.stroke()
          ctx.restore()
        }
        // Schedule the next trace frame directly — bypasses the tick()
        // loop (which only runs while `running` is true) so the trace can
        // keep sliding after the algorithm has finished.
        if (traceRafRef.current) cancelAnimationFrame(traceRafRef.current)
        traceRafRef.current = requestAnimationFrame(() => {
          traceRafRef.current = null
          draw()
        })
      }
    }

    // Source + destination markers — screen-fixed size, so scale down.
    const drawMarker = (id, color, ring) => {
      if (id == null) return
      const n = g.nodes.get(id)
      if (!n) return
      const x = baseXOf(n.lng), y = baseYOf(n.lat)
      ctx.fillStyle = color
      ctx.beginPath(); ctx.arc(x, y, 6 / zoom, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = ring
      ctx.lineWidth = 2 / zoom
      ctx.beginPath(); ctx.arc(x, y, 10 / zoom, 0, Math.PI * 2); ctx.stroke()
    }
    drawMarker(src, '#22c55e', 'rgba(34,197,94,0.5)')
    drawMarker(dst, '#ef4444', 'rgba(239,68,68,0.5)')

    // Reset transform for screen-space overlays (labels).
    if (showLabels && labels.length) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.font = '10px ui-monospace, monospace'
      ctx.fillStyle = 'rgba(226,232,240,0.85)'
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'
      ctx.lineWidth = 2.5
      for (let i = 0; i < Math.min(labels.length, 50); i++) {
        const l = labels[i]
        const sx = baseXOf(l.lng) * zoom + tx
        const sy = baseYOf(l.lat) * zoom + ty
        if (sx < 0 || sy < 0 || sx > w || sy > h) continue
        ctx.strokeText(l.name, sx + 4, sy - 4)
        ctx.fillText(l.name, sx + 4, sy - 4)
      }
    }
  }

  // ── Screen-to-world helpers ──
  function screenToLatLng(px, py) {
    const proj = projRef.current
    const BBOX = bboxRef.current
    if (!proj || !BBOX) return null
    const { cosLat, offX, offY, scale: base } = proj
    const { tx, ty, scale: zoom } = transformRef.current
    // Reverse the composited transform: baseX * zoom + tx = px
    const baseX = (px - tx) / zoom
    const baseY = (py - ty) / zoom
    const lng = ((baseX - offX) / base) / cosLat + BBOX.west
    const lat = BBOX.north - (baseY - offY) / base
    return { lat, lng }
  }

  // ── Canvas mouse + touch interactions ──
  const [placeMode, setPlaceMode] = useState('src')
  const dragRef = useRef({ active: false, sx: 0, sy: 0, tx0: 0, ty0: 0, moved: false })
  const pinchRef = useRef({ active: false, d0: 0, mid: null, scale0: 1, tx0: 0, ty0: 0 })

  function onCanvasMouseDown(e) {
    if (e.button !== 0) return
    const rect = canvasRef.current.getBoundingClientRect()
    dragRef.current = {
      active: true,
      sx: e.clientX - rect.left,
      sy: e.clientY - rect.top,
      tx0: transformRef.current.tx,
      ty0: transformRef.current.ty,
      moved: false,
    }
  }
  function onCanvasMouseMove(e) {
    const d = dragRef.current
    if (!d.active) return
    const rect = canvasRef.current.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const dx = px - d.sx, dy = py - d.sy
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
    setTransform((t) => ({ ...t, tx: d.tx0 + dx, ty: d.ty0 + dy }))
  }
  function onCanvasMouseUp(e) {
    const d = dragRef.current
    const wasDrag = d.active && d.moved
    d.active = false
    if (wasDrag) return
    // Treated as click — place src / dst
    const g = graphRef.current
    if (!g) return
    const rect = canvasRef.current.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const ll = screenToLatLng(px, py)
    if (!ll) return
    const id = nearestNode(g.nodes, ll.lat, ll.lng)
    if (id == null) return
    if (placeMode === 'src') { setSrc(id); setPlaceMode('dst') }
    else { setDst(id); setPlaceMode('src') }
  }
  function onCanvasWheel(e) {
    e.preventDefault()
    const rect = canvasRef.current.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15
    setTransform((t) => {
      const newScale = Math.max(0.5, Math.min(40, t.scale * zoomFactor))
      // Zoom around the cursor: keep the world point under the cursor fixed.
      const k = newScale / t.scale
      const tx = px - (px - t.tx) * k
      const ty = py - (py - t.ty) * k
      return { tx, ty, scale: newScale }
    })
  }

  // Touch — two-finger pinch (zoom) + single-finger pan.
  function distance(t1, t2) {
    const dx = t1.clientX - t2.clientX
    const dy = t1.clientY - t2.clientY
    return Math.hypot(dx, dy)
  }
  function midpoint(t1, t2, rect) {
    return {
      x: (t1.clientX + t2.clientX) / 2 - rect.left,
      y: (t1.clientY + t2.clientY) / 2 - rect.top,
    }
  }
  function onTouchStart(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    if (e.touches.length === 2) {
      pinchRef.current = {
        active: true,
        d0: distance(e.touches[0], e.touches[1]),
        mid: midpoint(e.touches[0], e.touches[1], rect),
        scale0: transformRef.current.scale,
        tx0: transformRef.current.tx,
        ty0: transformRef.current.ty,
      }
      dragRef.current.active = false
    } else if (e.touches.length === 1) {
      dragRef.current = {
        active: true,
        sx: e.touches[0].clientX - rect.left,
        sy: e.touches[0].clientY - rect.top,
        tx0: transformRef.current.tx,
        ty0: transformRef.current.ty,
        moved: false,
      }
    }
  }
  function onTouchMove(e) {
    e.preventDefault()
    const rect = canvasRef.current.getBoundingClientRect()
    if (e.touches.length === 2 && pinchRef.current.active) {
      const d = distance(e.touches[0], e.touches[1])
      const factor = d / (pinchRef.current.d0 || 1)
      const newScale = Math.max(0.5, Math.min(40, pinchRef.current.scale0 * factor))
      const k = newScale / pinchRef.current.scale0
      const mid = pinchRef.current.mid
      const tx = mid.x - (mid.x - pinchRef.current.tx0) * k
      const ty = mid.y - (mid.y - pinchRef.current.ty0) * k
      setTransform({ tx, ty, scale: newScale })
    } else if (e.touches.length === 1 && dragRef.current.active) {
      const px = e.touches[0].clientX - rect.left
      const py = e.touches[0].clientY - rect.top
      const dx = px - dragRef.current.sx, dy = py - dragRef.current.sy
      if (Math.abs(dx) + Math.abs(dy) > 4) dragRef.current.moved = true
      setTransform((t) => ({ ...t, tx: dragRef.current.tx0 + dx, ty: dragRef.current.ty0 + dy }))
    }
  }
  function onTouchEnd() {
    pinchRef.current.active = false
    dragRef.current.active = false
  }

  function resetView() {
    if (fitRafRef.current) { cancelAnimationFrame(fitRafRef.current); fitRafRef.current = null }
    setTransform({ tx: 0, ty: 0, scale: 1 })
  }

  // ── Fit-to-pins ──
  // Compute a {tx, ty, scale} that fits BOTH pins (or a single one if only
  // one is set) inside the canvas viewport with ~10% padding on each side.
  // Then animate the current transform toward it with an easeOutCubic
  // tween over 300 ms. Reduced-motion users get an instant snap.
  //
  // Skips the fit if BOTH pins are already comfortably in view (avoids
  // annoying auto-focus if the user has manually panned to inspect a
  // region).
  const isPinVisible = useCallback((nodeId) => {
    const proj = projRef.current
    const g = graphRef.current
    if (!proj || !g) return true
    const n = g.nodes.get(nodeId)
    if (!n) return true
    const { baseXOf, baseYOf, w, h } = proj
    const { tx, ty, scale } = transformRef.current
    const sx = baseXOf(n.lng) * scale + tx
    const sy = baseYOf(n.lat) * scale + ty
    // Require some margin so a pin right at the edge is still "off".
    const M = 24
    return sx >= M && sy >= M && sx <= (w - M) && sy <= (h - M)
  }, [])

  const fitToPins = useCallback(() => {
    const proj = projRef.current
    const g = graphRef.current
    if (!proj || !g) return
    const { baseXOf, baseYOf, w, h } = proj

    // Collect pin positions in BASE (unzoomed) coordinates.
    const pts = []
    if (src != null) {
      const n = g.nodes.get(src)
      if (n) pts.push({ x: baseXOf(n.lng), y: baseYOf(n.lat) })
    }
    if (dst != null) {
      const n = g.nodes.get(dst)
      if (n) pts.push({ x: baseXOf(n.lng), y: baseYOf(n.lat) })
    }
    if (!pts.length) return

    // Cancel any in-flight tween so we don't fight ourselves.
    if (fitRafRef.current) { cancelAnimationFrame(fitRafRef.current); fitRafRef.current = null }

    // Compute target transform.
    let target
    if (pts.length === 1) {
      // Single pin — centre on it at a reasonable zoom (~3× base).
      const targetScale = 3
      const p = pts[0]
      const tx = w / 2 - p.x * targetScale
      const ty = h / 2 - p.y * targetScale
      target = { tx, ty, scale: targetScale }
    } else {
      // Both pins — bbox around them with 10% padding on each side.
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const p of pts) {
        if (p.x < minX) minX = p.x
        if (p.y < minY) minY = p.y
        if (p.x > maxX) maxX = p.x
        if (p.y > maxY) maxY = p.y
      }
      // Ensure a minimum bbox size so two very-close pins don't scale to ∞.
      const rawW = Math.max(1, maxX - minX)
      const rawH = Math.max(1, maxY - minY)
      const bboxW = Math.max(rawW, 40)   // 40 px minimum span
      const bboxH = Math.max(rawH, 40)
      // Fit bbox inside 80% of the canvas (10% padding each side).
      const padFactor = 0.8
      const scaleX = (w * padFactor) / bboxW
      const scaleY = (h * padFactor) / bboxH
      const targetScale = Math.min(scaleX, scaleY, 20)  // cap at 20× so we don't over-zoom on two nearby suburbs
      const clampedScale = Math.max(0.5, targetScale)
      // Bbox centre in base coords.
      const cx = (minX + maxX) / 2
      const cy = (minY + maxY) / 2
      const tx = w / 2 - cx * clampedScale
      const ty = h / 2 - cy * clampedScale
      target = { tx, ty, scale: clampedScale }
    }

    // Skip if the delta is tiny — avoid a needless jiggle.
    const cur = transformRef.current
    const dTx = Math.abs(target.tx - cur.tx)
    const dTy = Math.abs(target.ty - cur.ty)
    const dScale = Math.abs(target.scale - cur.scale) / Math.max(0.001, cur.scale)
    if (dTx < 1 && dTy < 1 && dScale < 0.01) return

    // Reduced-motion or micro-delta → snap. Otherwise easeOutCubic 300 ms.
    const reduce = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce || (dTx + dTy < 4 && dScale < 0.02)) {
      setTransform(target)
      return
    }

    const from = { ...cur }
    const t0 = performance.now()
    const dur = 300
    const ease = (t) => 1 - Math.pow(1 - t, 3)   // easeOutCubic
    const step = (now) => {
      const raw = Math.min(1, (now - t0) / dur)
      const k = ease(raw)
      setTransform({
        tx: from.tx + (target.tx - from.tx) * k,
        ty: from.ty + (target.ty - from.ty) * k,
        scale: from.scale + (target.scale - from.scale) * k,
      })
      if (raw < 1) {
        fitRafRef.current = requestAnimationFrame(step)
      } else {
        fitRafRef.current = null
      }
    }
    fitRafRef.current = requestAnimationFrame(step)
  }, [src, dst])

  // Auto-fit whenever src / dst change AND at least one pin is off-screen.
  // Guarded by status === 'ready' + projection existing so the very first
  // ready-render (which sets initial src/dst) fits after resizeAndProject
  // has installed the projection.
  useEffect(() => {
    if (status !== 'ready') return
    if (!projRef.current) return
    if (src == null && dst == null) return
    // If both pins are in view, don't auto-focus — user may have panned
    // manually and we don't want to yank the map out from under them.
    const srcVis = src == null ? true : isPinVisible(src)
    const dstVis = dst == null ? true : isPinVisible(dst)
    if (srcVis && dstVis) return
    fitToPins()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, dst, status, citySlug])

  // Tear down any in-flight fit tween on unmount.
  useEffect(() => {
    return () => {
      if (fitRafRef.current) { cancelAnimationFrame(fitRafRef.current); fitRafRef.current = null }
    }
  }, [])

  // ── Fullscreen ──
  // Uses the real browser Fullscreen API on the canvas wrapper. We listen
  // for fullscreenchange so ESC / F11 keep our isFullscreen state honest.
  // On enter, the wrapper's inline styles are overridden to 100vw × 100vh
  // via the :fullscreen selector below (see the injected <style>).
  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen?.()
      } else {
        const el = canvasWrapRef.current
        if (!el) return
        await el.requestFullscreen?.()
      }
    } catch (e) {
      console.warn('fullscreen toggle failed', e?.message || e)
    }
  }, [])

  useEffect(() => {
    const onFsChange = () => {
      const now = !!document.fullscreenElement
      setIsFullscreen(now)
      // Re-project + repaint on the next tick — canvas size changed.
      setTimeout(() => { resizeAndProject(); draw() }, 0)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keyboard shortcut: `F` toggles fullscreen. Ignored while typing.
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        toggleFullscreen()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleFullscreen])

  // Command palette shortcut: ⌘K / Ctrl+K. Works even while a form
  // field is focused — this is a global "search cities" invocation, not
  // an in-field command, so we intentionally don't suppress on input.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setPaletteOpen((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function randomize() {
    const g = graphRef.current
    if (!g) return
    const ids = [...g.nodes.keys()]
    if (!ids.length) return
    const s = ids[Math.floor(Math.random() * ids.length)]
    let d = ids[Math.floor(Math.random() * ids.length)]
    if (d === s) d = ids[(ids.indexOf(s) + Math.floor(ids.length / 2)) % ids.length]
    setSrc(s); setDst(d)
  }

  function onPickCity(slug) {
    if (slug === citySlug) return
    setRunning(false)
    pathRef.current = null
    visitedSetRef.current = new Set()
    visitedListRef.current = []
    loadCity(slug)
  }

  // ── Run All ──
  // Race each algorithm against a configurable per-algo wall-clock cap
  // (0 = no limit); collect results into a local array and only publish
  // to the comparison table AFTER every algorithm has settled — or the
  // user hits Stop, in which case remaining rows are marked `stopped`.
  //
  // Stop mechanics:
  //   • cancelledRef.current — flipped by the Stop button. Read at the
  //     top of every loop iteration to break out entirely.
  //   • abortRef.current      — the current algo's AbortController.
  //     Stop calls .abort() so runAlgoAsync exits at the next chunk
  //     boundary with { stopped: true, ... } — no CPU is wasted
  //     completing an algorithm the user already abandoned.
  //
  // The setTimeout race is preserved as a safety net — if the algorithm
  // stops yielding for any reason, the outer timer still wins the race.
  // We pass Infinity into that timer when the user picks "no limit" so
  // only the abort signal or the algorithm's own completion can end it.
  async function runAll() {
    const g = graphRef.current
    if (!g || src == null || dst == null) return
    setRunAllBusy(true)
    setComparisonRows([])   // hide table until batch completes
    setHidden({})
    cancelledRef.current = false
    const rows = []
    const total = ALGOS.length
    const batchT0 = performance.now()
    const capMs = algoTimeoutMs || 0
    setBatchProgress({ current: 0, total, elapsedSec: 0, currentName: '', capMs })

    // Tick a per-second elapsed counter so the Progress bar keeps
    // ticking even while a single algorithm is grinding.
    const tickTimer = setInterval(() => {
      setBatchProgress((p) => p
        ? { ...p, elapsedSec: Math.round((performance.now() - batchT0) / 1000) }
        : p)
    }, 250)

    for (let i = 0; i < total; i++) {
      const meta = ALGOS[i]
      if (cancelledRef.current) {
        // User pressed Stop before this algo started — record every
        // remaining algorithm as stopped so the table still reflects
        // the aborted set instead of dropping the tail entirely.
        for (let j = i; j < total; j++) {
          const m = ALGOS[j]
          rows.push({
            key: m.key, name: m.name, path: null,
            visited: 0, iterations: 0, edgesRelaxed: 0,
            ms: 0, pathKm: 0, found: false, stopped: true,
          })
        }
        break
      }
      setBatchProgress({
        current: i,
        total,
        elapsedSec: Math.round((performance.now() - batchT0) / 1000),
        currentName: meta.name,
        capMs,
      })
      // Yield to the event loop so the Progress bar can paint.
      await new Promise((r) => setTimeout(r, 0))
      let result
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const t0 = performance.now()
        const budget = capMs || Infinity
        // Race the async runner against a hard per-algo timeout (or an
        // infinite timer if the user picked "no limit"). On timeout the
        // runner's own budget will also fire — whichever wins, verdict
        // = 'timeout' at that row.
        const timeoutPromise = capMs > 0
          ? new Promise((resolve) => setTimeout(() => resolve({
              key: meta.key, name: meta.name, path: null,
              visited: 0, iterations: 0, edgesRelaxed: 0,
              ms: performance.now() - t0, pathKm: 0,
              found: false, timedOut: true,
            }), capMs))
          : new Promise(() => {}) // never resolves — only abort or completion wins
        result = await Promise.race([
          runAlgoAsync(meta.key, g, revAdjRef.current, src, dst, budget, controller.signal),
          timeoutPromise,
        ])
      } catch (err) {
        result = { key: meta.key, name: meta.name, path: null, visited: 0, iterations: 0, edgesRelaxed: 0, ms: 0, pathKm: 0, found: false, error: err.message }
      } finally {
        abortRef.current = null
      }
      rows.push(result)
    }

    clearInterval(tickTimer)
    setBatchProgress(null)
    // Batched publish — one setState at the end, not per-algo.
    setComparisonRows(rows)
    setRunAllBusy(false)
    cancelledRef.current = false
  }

  // Stop the Run-all batch. Aborts the currently-executing algorithm at
  // its next chunk boundary and flips cancelledRef so the outer loop
  // marks every remaining algorithm as `stopped` and exits.
  function stopRunAll() {
    cancelledRef.current = true
    try { abortRef.current?.abort() } catch (_) {}
  }

  // ── Enrich comparison rows with vs-Optimal ratio ──
  const enrichedRows = useMemo(() => {
    if (!comparisonRows.length) return []
    const dij = comparisonRows.find((r) => r.key === 'dijkstra' && r.found)
    const opt = dij?.pathKm || 0
    return comparisonRows.map((r) => {
      const ratio = r.found && opt > 0 ? opt / r.pathKm : null
      const info = ALGO_MAP.get(r.key)
      // Stop wins over timeout wins over generic failure — the row's
      // verdict tag downstream reads this string directly.
      let verdict = r.stopped ? 'stopped' : (r.timedOut ? 'timeout' : 'failed')
      if (r.found) {
        if (info?.optimal || (ratio !== null && Math.abs(1 - ratio) < 0.001)) verdict = 'optimal'
        else if (ratio !== null && ratio >= 0.95) verdict = 'near-optimal'
        else verdict = 'suboptimal'
      }
      return { ...r, ratio, verdict, color: info?.color }
    })
  }, [comparisonRows])

  const sortedRows = useMemo(() => {
    const arr = [...enrichedRows]
    arr.sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey]
      const na = va == null ? Infinity : va
      const nb = vb == null ? Infinity : vb
      return sortDir === 'asc' ? na - nb : nb - na
    })
    return arr
  }, [enrichedRows, sortKey, sortDir])

  function toggleSort(k) {
    if (sortKey === k) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('asc') }
  }

  // ── Google-Maps-style dual autocomplete ──
  // Per-input debounced query. When a city is picked we hit the per-city
  // endpoint (Trie + trigram + substring, already ranked BE-side). When no
  // city is picked we fall back to the cross-city endpoint that returns
  // {city_slug, city_name} alongside the place so we can auto-switch.
  const runPlaceQuery = useCallback((which, q) => {
    const ref = which === 'from' ? fromDebounceRef : toDebounceRef
    const setSug = which === 'from' ? setFromSuggestions : setToSuggestions
    const setHi  = which === 'from' ? setFromHighlight  : setToHighlight
    if (ref.current) clearTimeout(ref.current)
    ref.current = setTimeout(async () => {
      try {
        // Cross-city fallback vs per-city — driven by citySlug alone. The
        // FE always has a city selected today (default = bangalore), but
        // we keep the branch open so the "search all cities" mode can be
        // toggled in without a rewrite.
        const url = citySlug
          ? `${ENDPOINTS.CITY_GRAPHS_PLACES}/${citySlug}/places`
          : ENDPOINTS.CITY_GRAPHS_PLACES_ALL
        const res = await apiGet(url, { q, limit: 8 })
        setSug(res?.data?.items || [])
        setHi(0)
      } catch (e) {
        console.warn('places lookup failed', e.message)
        setSug([])
      }
    }, 200)
  }, [citySlug])

  function onPlaceInput(which, v) {
    if (which === 'from') { setFromQuery(v); setFromOpen(true) }
    else                  { setToQuery(v);   setToOpen(true) }
    if (!v || v.trim().length < 2) {
      if (which === 'from') setFromSuggestions([])
      else                  setToSuggestions([])
      return
    }
    runPlaceQuery(which, v.trim())
  }

  // Persist last 5 selections per input in localStorage. Keyed per city
  // so switching to Mumbai doesn't surface Bangalore locality suggestions.
  const recentsKey = (which) => `pathfinding.recents.${citySlug || 'all'}.${which}`

  const loadRecents = useCallback((which) => {
    try {
      const raw = localStorage.getItem(recentsKey(which))
      return raw ? JSON.parse(raw).slice(0, 5) : []
    } catch { return [] }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [citySlug])

  const persistRecent = (which, p) => {
    try {
      const key = recentsKey(which)
      const prev = loadRecents(which).filter(r => r.name !== p.name || r.lat !== p.lat)
      const next = [p, ...prev].slice(0, 5)
      localStorage.setItem(key, JSON.stringify(next))
      if (which === 'from') setFromRecents(next)
      else                  setToRecents(next)
    } catch { /* private mode etc. — silent */ }
  }

  // Hydrate the recents lists whenever the city changes.
  useEffect(() => {
    setFromRecents(loadRecents('from'))
    setToRecents(loadRecents('to'))
  }, [loadRecents])

  // Assign a suggestion → nearest graph node → source or destination pin.
  // If the suggestion carries a different `city_slug` (cross-city mode),
  // auto-switch cities first and defer the pin assignment until the new
  // graph is loaded.
  function onPickSuggestion(which, p) {
    // Auto-switch city if the suggestion belongs to a different metro.
    if (p.city_slug && p.city_slug !== citySlug) {
      const cityName = p.city_name || p.city_slug
      pendingPickRef.current = { which, p }
      notify.success(`Switched to ${cityName}`, { title: 'City auto-switch', key: 'city-auto-switch' })
      onPickCity(p.city_slug)
      // The pending pick fires from the effect below once the new graph
      // is installed. Keep the input filled so the user sees what they
      // picked; close the dropdown.
      if (which === 'from') { setFromQuery(p.name); setFromOpen(false) }
      else                  { setToQuery(p.name);   setToOpen(false) }
      persistRecent(which, p)
      return
    }
    const g = graphRef.current
    if (!g) return
    const id = nearestNode(g.nodes, p.lat, p.lng)
    if (id == null) return
    if (which === 'from') { setSrc(id); setFromQuery(p.name); setFromOpen(false); setFromSuggestions([]) }
    else                  { setDst(id); setToQuery(p.name);   setToOpen(false);   setToSuggestions([]) }
    persistRecent(which, p)
  }

  // Deferred pick — waits for the target city's graph to install, then
  // resolves the nearest node in the new graph and drops the pin.
  const pendingPickRef = useRef(null)
  useEffect(() => {
    if (status !== 'ready' || !pendingPickRef.current) return
    const { which, p } = pendingPickRef.current
    pendingPickRef.current = null
    const g = graphRef.current
    if (!g) return
    const id = nearestNode(g.nodes, p.lat, p.lng)
    if (id == null) return
    if (which === 'from') setSrc(id)
    else                  setDst(id)
  }, [status, citySlug])

  function swapFromTo() {
    setFromQuery(toQuery); setToQuery(fromQuery)
    const s = src, d = dst
    setSrc(d); setDst(s)
  }

  // ─── AI recommendations ─────────────────────────────────────────
  // Send the user's brief to the BE recommender, render the returned
  // cards. Each card's "Set as From" / "Set as To" then re-runs the
  // existing fuzzy places search against the AI-suggested name — that
  // way we still snap to a real graph node with real coordinates
  // instead of trusting a hallucinated lat/lng.
  async function runAiSuggest() {
    const q = aiQuery.trim()
    if (!q) {
      notify.info('Type a brief first — try "italian near Bandra"', { title: 'Empty', key: 'pf-ai-empty' })
      return
    }
    if (q.length < 3) {
      notify.info('A little more detail helps — try a full phrase', { title: 'Too short', key: 'pf-ai-short' })
      return
    }
    setAiLoading(true)
    setAiRecs([])
    try {
      const cityName = currentCityLabel || citySlug || 'city'
      const res = await apiPost(ENDPOINTS.PATHFINDING_RECOMMEND, { city: cityName, query: q })
      const list = res?.data?.recommendations || []
      if (!list.length) {
        notify.info('The recommender came back empty — try rephrasing.', { title: 'No matches', key: 'pf-ai-empty2' })
      }
      setAiRecs(list)
    } catch (e) {
      if (e?.status === 429) {
        notify.error('Too many requests — try again in a minute.', { title: 'Rate limited', key: 'pf-ai-429' })
      } else {
        notify.error(e?.message || 'AI recommender is unavailable right now.', { title: 'AI offline', key: 'pf-ai-err' })
      }
    } finally {
      setAiLoading(false)
    }
  }

  // Take a recommended place name, hit the per-city fuzzy /places
  // search, and pick the top match. Falls back to Nominatim geocoding
  // if nothing above a minimum score. Once a lat/lng is chosen, snap
  // to the nearest graph node and set src/dst.
  async function pickAiRec(rec, which) {
    if (!rec || !rec.name) return
    if (status !== 'ready') {
      notify.info('Graph still loading — try again in a moment.', { title: 'Not ready', key: 'pf-ai-notready' })
      return
    }
    const key = `${rec.name}_${which}`
    setAiPickBusy((s) => ({ ...s, [key]: true }))
    try {
      // 1) Try the per-city fuzzy match first.
      let picked = null
      try {
        const searchTerm = rec.area ? `${rec.name} ${rec.area}` : rec.name
        const url = `${ENDPOINTS.CITY_GRAPHS_PLACES}/${citySlug}/places`
        const r = await apiGet(url, { q: searchTerm, limit: 5 })
        const items = r?.data?.items || []
        // Prefer results whose area matches the recommendation's area.
        if (items.length) {
          const areaLc = (rec.area || '').toLowerCase()
          picked = items.find((it) => areaLc && (it.name || '').toLowerCase().includes(areaLc)) || items[0]
        }
      } catch { /* fall through to geocoder */ }

      // 2) Fallback — Nominatim geocode with the city name pinned so the
      //    result stays in-city. Uses the public endpoint at 1 rps.
      if (!picked) {
        try {
          const cityName = currentCityLabel || citySlug || ''
          const q = `${rec.name}${rec.area ? ', ' + rec.area : ''}${cityName ? ', ' + cityName : ''}, India`
          const nomUrl = new URL('https://nominatim.openstreetmap.org/search')
          nomUrl.searchParams.set('q', q)
          nomUrl.searchParams.set('format', 'json')
          nomUrl.searchParams.set('limit', '1')
          const nomRes = await fetch(nomUrl.toString(), {
            headers: { 'Accept-Language': 'en' },
          })
          if (nomRes.ok) {
            const arr = await nomRes.json()
            if (Array.isArray(arr) && arr.length) {
              const hit = arr[0]
              picked = {
                name: hit.display_name?.split(',')[0] || rec.name,
                lat: parseFloat(hit.lat),
                lng: parseFloat(hit.lon),
                kind: rec.kind || 'place',
              }
            }
          }
        } catch { /* silent — handled below */ }
      }

      if (!picked || picked.lat == null || picked.lng == null) {
        notify.error(`Couldn't find "${rec.name}" on the map — try the manual search.`,
          { title: 'Not found', key: 'pf-ai-miss' })
        return
      }

      const g = graphRef.current
      if (!g) return
      const id = nearestNode(g.nodes, picked.lat, picked.lng)
      if (id == null) {
        notify.error('No nearby graph node — try another pick.', { title: 'Off-graph', key: 'pf-ai-offgraph' })
        return
      }
      if (which === 'from') { setSrc(id); setFromQuery(rec.name); setFromOpen(false) }
      else                  { setDst(id); setToQuery(rec.name);   setToOpen(false)   }
      persistRecent(which, { name: rec.name, kind: picked.kind || rec.kind || 'place', lat: picked.lat, lng: picked.lng })
      notify.success(`${rec.name} pinned as ${which === 'from' ? 'start' : 'end'}.`,
        { title: 'Pinned', key: 'pf-ai-pinned' })
    } finally {
      setAiPickBusy((s) => {
        const next = { ...s }; delete next[key]; return next
      })
    }
  }

  // ─── Live location (browser geolocation) ────────────────────────
  // Cache the last-known position in sessionStorage so a second click
  // in the same tab session skips the permission prompt latency.
  const SESSION_GEO_KEY = 'pathfinding.geoloc'
  function cachedGeo() {
    try {
      const raw = sessionStorage.getItem(SESSION_GEO_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      // 10-minute freshness cap — a moving user shouldn't see stale coords.
      if (!parsed?.ts || Date.now() - parsed.ts > 10 * 60 * 1000) return null
      return parsed
    } catch { return null }
  }
  function persistGeo(latitude, longitude) {
    try {
      sessionStorage.setItem(SESSION_GEO_KEY, JSON.stringify({ latitude, longitude, ts: Date.now() }))
    } catch { /* private mode */ }
  }

  async function useMyLocation(which) {
    if (status !== 'ready') {
      notify.info('Graph still loading — try again in a moment.', { title: 'Not ready', key: 'pf-geo-notready' })
      return
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      notify.error('Geolocation not supported in this browser.', { title: 'Unavailable', key: 'pf-geo-nosupp' })
      return
    }
    setGeoBusy((s) => ({ ...s, [which]: true }))

    // Try the session cache first — same-session repeats skip the prompt.
    const cached = cachedGeo()
    const apply = (latitude, longitude) => {
      const g = graphRef.current
      if (!g) { setGeoBusy((s) => ({ ...s, [which]: false })); return }
      const id = nearestNode(g.nodes, latitude, longitude)
      if (id == null) {
        notify.error("You're outside this city's road graph.", { title: 'Off-graph', key: 'pf-geo-off' })
        setGeoBusy((s) => ({ ...s, [which]: false }))
        return
      }
      const label = 'My location'
      if (which === 'from') { setSrc(id); setFromQuery(label); setFromOpen(false) }
      else                  { setDst(id); setToQuery(label);   setToOpen(false)   }
      // Fit into view so the user sees where they landed.
      requestAnimationFrame(() => { try { fitToPins() } catch {} })
      setGeoBusy((s) => ({ ...s, [which]: false }))
      notify.success(`Location set as ${which === 'from' ? 'start' : 'end'}.`,
        { title: 'Pinned', key: 'pf-geo-ok' })
    }

    if (cached) {
      apply(cached.latitude, cached.longitude)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        persistGeo(latitude, longitude)
        apply(latitude, longitude)
      },
      (err) => {
        setGeoBusy((s) => ({ ...s, [which]: false }))
        if (err.code === err.PERMISSION_DENIED) {
          notify.error('Location permission required.', { title: 'Blocked', key: 'pf-geo-deny' })
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          notify.error('Position unavailable — try again outdoors.', { title: 'Unavailable', key: 'pf-geo-una' })
        } else if (err.code === err.TIMEOUT) {
          notify.error('Location timed out — try again.', { title: 'Timeout', key: 'pf-geo-to' })
        } else {
          notify.error('Location permission required.', { title: 'Blocked', key: 'pf-geo-deny2' })
        }
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    )
  }

  // ─── Export helpers ─────────────────────────────────────────────
  // Open the computed src → dst in Google Maps' turn-by-turn directions
  // in a new tab. `?api=1` is the stable directions deep-link contract.
  function openInGoogleMaps() {
    const g = graphRef.current
    if (!g || src == null || dst == null) {
      notify.info('Set From and To first.', { title: 'Nothing to open', key: 'pf-gm-nopin' })
      return
    }
    const s = g.nodes.get(src), d = g.nodes.get(dst)
    if (!s || !d) return
    const url = `https://www.google.com/maps/dir/?api=1&origin=${s.lat},${s.lng}&destination=${d.lat},${d.lng}&travelmode=driving`
    try { window.open(url, '_blank', 'noopener,noreferrer') } catch {
      notify.error('Could not open a new tab — check your pop-up blocker.',
        { title: 'Blocked', key: 'pf-gm-blk' })
    }
  }

  // Download the current computed path as JSON — useful for testing,
  // for feeding into another routing tool, or for showing off on a blog.
  function exportPathAsJson() {
    const g = graphRef.current
    const path = pathRef.current
    if (!g || !path || !path.length) {
      notify.info('Run an algorithm first — no path to export.', { title: 'Nothing to export', key: 'pf-json-noop' })
      return
    }
    const s = g.nodes.get(src), d = g.nodes.get(dst)
    const coords = path
      .map((id) => g.nodes.get(id))
      .filter(Boolean)
      .map((n) => ({ lat: n.lat, lng: n.lng }))
    const doc = {
      start:      s ? { lat: s.lat, lng: s.lng } : null,
      end:        d ? { lat: d.lat, lng: d.lng } : null,
      path:       coords,
      distanceKm: Number(tele.pathKm?.toFixed?.(3) || 0),
      algorithm:  algo,
      city:       currentCityLabel || citySlug || null,
      exportedAt: new Date().toISOString(),
    }
    try {
      const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `pathfinding_${citySlug || 'city'}_${algo}_${Date.now()}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      notify.success('Path JSON downloaded.', { title: 'Exported', key: 'pf-json-ok' })
    } catch (e) {
      notify.error(e?.message || 'Export failed.', { title: 'Export failed', key: 'pf-json-err' })
    }
  }

  // Keyboard: ↑/↓ on the highlighted composer.
  function onComposerKeyDown(which, e) {
    const sug = which === 'from' ? fromSuggestions : toSuggestions
    const rec = which === 'from' ? fromRecents    : toRecents
    const list = sug.length ? sug : rec
    const hi   = which === 'from' ? fromHighlight  : toHighlight
    const setHi = which === 'from' ? setFromHighlight : setToHighlight
    const setOpen = which === 'from' ? setFromOpen : setToOpen

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      if (list.length) setHi((hi + 1) % list.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
      if (list.length) setHi((hi - 1 + list.length) % list.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (list.length) onPickSuggestion(which, list[hi] || list[0])
      else if (which === 'to' && src != null && dst != null) {
        // Enter on To with both pins set → kick off Run.
        setRunning(true)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    } else if (e.key === 'Tab') {
      // Tab cycles From ↔ To without jumping to browser chrome.
      e.preventDefault()
      const nextInput = which === 'from' ? 'to' : 'from'
      const el = document.getElementById(`pf-composer-${nextInput}`)
      if (el) el.focus()
    }
  }

  // ── Clear paths ──
  // Wipes every algorithm overlay from the canvas + clears the results
  // table + resets the per-algo eye toggles. Keeps src/dst pins intact —
  // clearing paths only. Also fires on the `C` keyboard shortcut.
  const clearPaths = useCallback(() => {
    pathRef.current = null
    visitedSetRef.current = new Set()
    visitedListRef.current = []
    bidiSideRef.current = new Map()
    setComparisonRows([])
    setHidden({})
    setTele({ visited: 0, ms: 0, pathKm: 0, pathN: 0, done: false, found: false })
    setRunning(false)
    // Rebuild the generator so the next Play starts clean without erasing
    // the current start/end pins.
    const g = graphRef.current
    if (g && src != null && dst != null) {
      genRef.current = makeGenerator(algo, g, revAdjRef.current, src, dst)
    }
    requestFrame()
    notify.success('Paths cleared', { title: 'Cleared', key: 'pf-clear-paths' })
  }, [algo, src, dst])

  // Global keyboard shortcut: `C` fires clearPaths. Ignored while the
  // user is typing in an input / textarea / contenteditable.
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault()
        clearPaths()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clearPaths])

  // Toggle labels on → fetch a top-50 label bundle (no query = "popular").
  useEffect(() => {
    if (!showLabels) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiGet(`${ENDPOINTS.CITY_GRAPHS_PLACES}/${citySlug}/places`, { limit: 50 })
        if (cancelled) return
        setLabels(res?.data?.items || [])
      } catch (e) {
        console.warn('labels fetch failed', e.message)
        setLabels([])
      }
    })()
    return () => { cancelled = true }
  }, [showLabels, citySlug])

  const info = ALGO_MAP.get(algo) || ALGOS[0]
  // antd <Select> grouped options: [{ label: state, options: [{label, value}] }, …].
  // Sorted alphabetically by state name; cities within a state also
  // sorted alphabetically so the picker is predictable regardless of
  // BE catalogue order. The whole memo also produces a flat lookup for
  // the currently-loaded city so the "loaded" pill above the map can
  // render the state name without a second Map lookup.
  const { cityOptions, currentCityLabel, currentCityState, statesCount, citiesCount } = useMemo(() => {
    const list = cities || []
    const byState = new Map()
    for (const c of list) {
      const st = c.state || 'Other'
      if (!byState.has(st)) byState.set(st, [])
      byState.get(st).push(c)
    }
    const groups = [...byState.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([state, items]) => ({
        label: state,
        options: items
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((c) => ({ label: c.name, value: c.slug, state })),
      }))
    const current = list.find((c) => c.slug === citySlug)
    return {
      cityOptions: groups,
      currentCityLabel: current?.name || null,
      currentCityState: current?.state || null,
      statesCount: byState.size,
      citiesCount: list.length,
    }
  }, [cities, citySlug])
  const fetchedIso = cityMeta?.fetched_at ? new Date(cityMeta.fetched_at).toISOString() : null
  const currentCenterLabel = cityMeta?.center
    ? `${cityMeta.center.lat.toFixed(4)}°N · ${cityMeta.center.lng.toFixed(4)}°E`
    : '—'

  // Timeout slider steps — labelled preset marks. Value 0 = "no limit".
  // Store in ms; display in seconds. Slider is stepwise (marks-only) so
  // the label reads exactly what the user picked.
  const TIMEOUT_MARKS = [
    { ms: 5000,  label: '5s' },
    { ms: 10000, label: '10s' },
    { ms: 30000, label: '30s' },
    { ms: 60000, label: '60s' },
    { ms: 0,     label: '∞' },
  ]

  // ─── Render ────────────────────────────────────────────────
  return (
    <div className='min-h-screen bg-[var(--luxe-bg-base)] text-fg-primary pt-24 sm:pt-28 pb-16 px-3 sm:px-6'
         style={{ fontVariantNumeric: 'tabular-nums' }}>
      <div className='max-w-7xl mx-auto'>
        <header className='mb-6'>
          <p className='eyebrow-mono mb-2 text-amber-300/80 font-bold flex items-center gap-2'>
            <NodeIndexOutlined /> — Amazing Engineering · Pathfinding Lab
          </p>
          <h1 className='text-3xl sm:text-4xl font-bold gradient-text-amber leading-tight'>
            Pathfinding Lab · City Road Graphs
          </h1>
          <p className='text-sm text-fg-muted mt-1 max-w-3xl'>
            Twelve algorithms racing through live road-network data across <span className='text-amber-300'>{citiesCount || 50}+</span> cities
            in <span className='text-amber-300'>{statesCount || 35}+</span> states &amp; UTs of India. Pick a city, drag to pan, wheel to zoom, click to set start/end —
            or hit <span className='text-amber-300'>Run all</span> to race them side-by-side.
          </p>
        </header>

        {/* City picker — command palette (Cmd+K). The old flat grouped
            Select forced users to scan 150+ options; the palette pulls
            recents + trending to the top, does fuzzy state + city
            matching, and closes on Escape / outside click. */}
        <div className='luxe-glass p-3 mb-3'>
          <div className='flex items-center justify-between mb-2 gap-2 flex-wrap'>
            <p className='eyebrow-mono text-amber-300/80 font-bold flex items-center gap-2'>
              <GlobalOutlined /> City
            </p>
            {currentCityLabel && (
              <motion.span
                key={citySlug || 'none'}
                initial={REDUCE_MOTION ? false : { opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className='inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border border-amber-400/40 bg-amber-400/10 text-amber-200'
                title='Currently loaded city'
              >
                <motion.span
                  className='w-1.5 h-1.5 rounded-full bg-amber-300'
                  animate={REDUCE_MOTION ? undefined : { opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                />
                {currentCityLabel}
                {currentCityState && (
                  <span className='text-amber-100/70 font-mono font-normal'>· {currentCityState}</span>
                )}
              </motion.span>
            )}
          </div>
          <button
            type='button'
            onClick={() => setPaletteOpen(true)}
            disabled={status === 'catalog' || !cityOptions.length}
            className='w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border border-line bg-surface-elevated hover:border-amber-400/60 hover:bg-white/[0.04] transition text-left disabled:opacity-40 disabled:cursor-not-allowed group'
          >
            <SearchOutlined className='text-fg-muted group-hover:text-amber-300 transition' />
            <span className='flex-1 text-sm text-fg-muted'>
              Search city or state<span className='hidden sm:inline'>… try "kera", "koch", "mum"</span>
            </span>
            <kbd className='hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-line bg-black/40 text-[10px] font-mono text-fg-muted'>
              <span>⌘</span>K
            </kbd>
          </button>
          <p className='text-[11px] text-fg-muted mt-2 leading-snug'>
            {citiesCount || 50}+ cities across {statesCount || 35}+ states &amp; UTs · press
            <kbd className='mx-1 px-1 py-0.5 rounded border border-line bg-black/30 text-[10px] font-mono text-amber-300'>⌘K</kbd>
            or click above · recent + trending pinned to the top.
          </p>
        </div>

        {/* Area search — Google-Maps-style dual composer */}
        <div className='luxe-glass p-3 mb-3'>
          <div className='flex items-center justify-between mb-2 gap-2 flex-wrap'>
            <p className='eyebrow-mono text-fuchsia-300/80 font-bold'>Area search</p>
            <div className='flex items-center gap-1.5 flex-wrap'>
              <Button
                variant='accent'
                size='small'
                icon={<BulbOutlined />}
                onClick={() => setAiOpen((s) => !s)}
                disabled={status !== 'ready'}
                title='Ask AI for real place suggestions'
              >
                Ask AI
              </Button>
              <Button
                variant='subtle'
                size='small'
                icon={showLabels ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                onClick={() => setShowLabels((s) => !s)}
              >
                {showLabels ? 'Hide labels' : 'Show labels'}
              </Button>
            </div>
          </div>

          {/* Ask AI popover — inline card, works as a bottom-sheet on mobile */}
          <AnimatePresence>
            {aiOpen && (
              <motion.div
                key='pf-ai-popover'
                initial={REDUCE_MOTION ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={REDUCE_MOTION ? { opacity: 0 } : { opacity: 0, y: -6, transition: { duration: 0.2 } }}
                transition={{ duration: 0.24 }}
                className='mb-3 rounded-lg border border-violet-500/30 bg-violet-950/20 p-3'
              >
                <div className='flex items-center justify-between mb-2 gap-2'>
                  <p className='text-[12px] font-bold text-violet-200 flex items-center gap-1.5'>
                    <BulbOutlined /> What are you looking for?
                  </p>
                  <button
                    type='button'
                    onClick={() => { setAiOpen(false); setAiRecs([]); }}
                    className='text-fg-muted hover:text-white p-1 rounded'
                    title='Close'
                  >
                    <CloseOutlined />
                  </button>
                </div>
                <div className='flex flex-col sm:flex-row gap-2 items-stretch sm:items-start'>
                  <Input.TextArea
                    value={aiQuery}
                    onChange={(e) => setAiQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' && (e.metaKey || e.ctrlKey))
                          || (e.key === 'Enter' && !e.shiftKey)) {
                        e.preventDefault()
                        if (!aiLoading) runAiSuggest()
                      }
                    }}
                    autoSize={{ minRows: 2, maxRows: 4 }}
                    placeholder={`e.g. "good italian restaurants near ${currentCityLabel || 'Bandra'}", "quiet cafe with wifi", "big park to walk in"`}
                    disabled={aiLoading}
                    className='!text-sm flex-1'
                    maxLength={300}
                  />
                  <Button
                    variant='primary'
                    size='small'
                    onClick={runAiSuggest}
                    loading={aiLoading}
                    icon={aiLoading ? <LoadingOutlined /> : <ThunderboltFilled />}
                    className='shrink-0 self-stretch sm:self-start'
                  >
                    {aiLoading ? 'Thinking…' : 'Suggest'}
                  </Button>
                </div>

                {aiRecs.length > 0 && (
                  <div className='grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3'>
                    {aiRecs.map((r, i) => (
                      <div
                        key={`${r.name}-${i}`}
                        className='rounded-lg border border-line/70 bg-black/25 p-2.5 flex flex-col gap-1.5'
                      >
                        <div className='flex items-start gap-2 min-w-0'>
                          <span className='text-lg leading-none'>{KIND_ICON[r.kind] || '📍'}</span>
                          <div className='min-w-0 flex-1'>
                            <div className='text-[13px] font-bold text-white truncate' title={r.name}>{r.name}</div>
                            <div className='text-[10.5px] text-fg-muted uppercase tracking-wide font-mono flex items-center gap-1.5'>
                              <span>{r.kind || 'place'}</span>
                              {r.area && <span className='text-fuchsia-300 normal-case'>· {r.area}</span>}
                            </div>
                          </div>
                        </div>
                        {r.reason && (
                          <p className='text-[11.5px] text-fg-muted leading-snug' title={r.reason}>
                            {r.reason}
                          </p>
                        )}
                        <div className='flex items-center gap-1.5 pt-1'>
                          <Button
                            variant='secondary'
                            size='small'
                            onClick={() => pickAiRec(r, 'from')}
                            loading={!!aiPickBusy[`${r.name}_from`]}
                            className='flex-1'
                          >
                            <span className='inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 align-middle' />
                            Set as From
                          </Button>
                          <Button
                            variant='secondary'
                            size='small'
                            onClick={() => pickAiRec(r, 'to')}
                            loading={!!aiPickBusy[`${r.name}_to`]}
                            className='flex-1'
                          >
                            <span className='inline-block w-1.5 h-1.5 rounded-full bg-rose-500 mr-1.5 align-middle' />
                            Set as To
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <p className='text-[10.5px] text-violet-200/70 leading-snug mt-2 font-mono'>
                  Recommendations are AI hints — we then match each name against real neighbourhood places for accurate coordinates. Enter to submit · 10 requests/min.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Stacked composer — From on top, To below, Swap on the right */}
          <div className='flex flex-col sm:flex-row gap-2 items-stretch sm:items-start'>
            <div className='flex-1 space-y-2 min-w-0'>
              {/* From */}
              <div className='flex items-start gap-1.5'>
                <div className='flex-1 min-w-0'>
                  <ComposerRow
                    id='pf-composer-from'
                    which='from'
                    iconDot='bg-emerald-400'
                    iconRing='ring-emerald-400/30'
                    placeholder='From: type a landmark, area or suburb'
                    value={fromQuery}
                    onChange={(v) => onPlaceInput('from', v)}
                    onFocus={() => setFromOpen(true)}
                    onBlur={() => setTimeout(() => setFromOpen(false), 120)}
                    onKeyDown={(e) => onComposerKeyDown('from', e)}
                    open={fromOpen}
                    suggestions={fromSuggestions}
                    recents={fromRecents}
                    highlight={fromHighlight}
                    setHighlight={setFromHighlight}
                    onPick={(p) => onPickSuggestion('from', p)}
                    query={fromQuery}
                    srcNodeLatLng={null}
                    disabled={status !== 'ready'}
                    helper='Type any landmark, area or suburb across every state.'
                  />
                </div>
                <Button
                  variant='subtle'
                  size='small'
                  onClick={() => useMyLocation('from')}
                  disabled={status !== 'ready' || geoBusy.from}
                  loading={geoBusy.from}
                  icon={geoBusy.from ? <LoadingOutlined /> : <AimOutlined />}
                  className='shrink-0 min-w-[44px] min-h-[44px] mt-0.5'
                  title='Use my current location'
                  aria-label='Use my location for From'
                >
                  <span className='sr-only'>Use my location</span>
                </Button>
              </div>
              {/* To */}
              <div className='flex items-start gap-1.5'>
                <div className='flex-1 min-w-0'>
                  <ComposerRow
                    id='pf-composer-to'
                    which='to'
                    iconDot='bg-rose-500'
                    iconRing='ring-rose-400/30'
                    placeholder='To: type a landmark, area or suburb'
                    value={toQuery}
                    onChange={(v) => onPlaceInput('to', v)}
                    onFocus={() => setToOpen(true)}
                    onBlur={() => setTimeout(() => setToOpen(false), 120)}
                    onKeyDown={(e) => onComposerKeyDown('to', e)}
                    open={toOpen}
                    suggestions={toSuggestions}
                    recents={toRecents}
                    highlight={toHighlight}
                    setHighlight={setToHighlight}
                    onPick={(p) => onPickSuggestion('to', p)}
                    query={toQuery}
                    srcNodeLatLng={
                      src != null && graphRef.current?.nodes.get(src)
                        ? graphRef.current.nodes.get(src)
                        : null
                    }
                    disabled={status !== 'ready'}
                    helper='Type any landmark, area or suburb across every state.'
                  />
                </div>
                <Button
                  variant='subtle'
                  size='small'
                  onClick={() => useMyLocation('to')}
                  disabled={status !== 'ready' || geoBusy.to}
                  loading={geoBusy.to}
                  icon={geoBusy.to ? <LoadingOutlined /> : <AimOutlined />}
                  className='shrink-0 min-w-[44px] min-h-[44px] mt-0.5'
                  title='Use my current location'
                  aria-label='Use my location for To'
                >
                  <span className='sr-only'>Use my location</span>
                </Button>
              </div>
            </div>
            <Button
              variant='secondary'
              size='small'
              icon={<SwapOutlined />}
              onClick={swapFromTo}
              disabled={status !== 'ready' || (src == null && dst == null)}
              className='self-end sm:self-center shrink-0'
              title='Swap From ↔ To'
            >
              Swap
            </Button>
          </div>
          <p className='text-[11px] text-fg-muted leading-snug mt-2'>
            Enter on <span className='text-amber-300'>To</span> runs the search ·
            <span className='text-amber-300'> ↑ / ↓</span> browse suggestions ·
            <span className='text-amber-300'> Tab</span> jumps From ↔ To ·
            <span className='text-amber-300'> C</span> clears paths.
          </p>
        </div>

        {/* Layout — canvas ~60% desktop, right panel ~40%; stacks on mobile. */}
        <div className='grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4'>
          {/* ── Canvas panel ── */}
          {/*
            Fullscreen: the wrapper becomes the browser's :fullscreen element.
            When fullscreen, the base :fullscreen selector (below) forces
            100vw × 100vh + black bg. The :not(:fullscreen) sibling controls
            remain visible in-page too — the two variants are exclusive.
          */}
          <div
            ref={canvasWrapRef}
            className={`pf-canvas-wrap luxe-glass overflow-hidden relative ${isFullscreen ? 'pf-canvas-fs' : ''}`}
            style={isFullscreen ? undefined : { height: 'min(72vh, 640px)', minHeight: '360px' }}
          >
            <AnimatePresence>
              {(status === 'catalog' || status === 'fetching' || status === 'boot' || status === 'error') && (
                <motion.div
                  key='pf-load-overlay'
                  initial={REDUCE_MOTION ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={REDUCE_MOTION ? { opacity: 0 } : { opacity: 0, transition: { duration: 0.4 } }}
                  className='absolute inset-0 flex flex-col items-center justify-center gap-4 z-10 bg-black/40 backdrop-blur-sm'
                >
                  {status === 'error' ? (
                    <>
                      <div className='text-rose-300 text-sm font-bold'>Couldn't load the city graph — try again</div>
                      <div className='text-[11px] font-mono text-fg-muted max-w-md text-center px-6'>{errMsg}</div>
                    </>
                  ) : (
                    <>
                      {/* City-name pill — renders INSTANTLY on switch so the
                          user sees they've picked the right city before the
                          graph decode finishes. */}
                      {currentCityLabel && (
                        <motion.div
                          initial={REDUCE_MOTION ? false : { y: -8, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ duration: 0.25 }}
                          className='inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border border-amber-400/40 bg-amber-400/10 text-amber-100'
                        >
                          <CompassOutlined />
                          {currentCityLabel}
                          {currentCityState && (
                            <span className='text-amber-100/60 font-mono font-normal'>· {currentCityState}</span>
                          )}
                        </motion.div>
                      )}
                      <LuxeLoader
                        variant='city'
                        size='md'
                        label={status === 'catalog' ? 'Loading city catalogue…' : 'Loading city graph…'}
                      />
                      {/* Progressive stages — 4-dot ladder that ticks on as
                          each pipeline step completes. Skipped if we're
                          still bootstrapping the catalogue. */}
                      {status === 'fetching' && (
                        <ProgressStages stage={loadStage} />
                      )}
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            <canvas
              ref={canvasRef}
              onMouseDown={onCanvasMouseDown}
              onMouseMove={onCanvasMouseMove}
              onMouseUp={onCanvasMouseUp}
              onMouseLeave={() => (dragRef.current.active = false)}
              onWheel={onCanvasWheel}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              style={{
                display: 'block', width: '100%', height: '100%',
                cursor: dragRef.current.active ? 'grabbing' : 'crosshair',
                touchAction: 'none',
              }}
            />
            {/* Pulse rings at src + dst while computing — screen-space
                overlays so we don't churn the canvas draw path just for
                a decorative flourish. Positions come from the current
                projection + transform. Hidden if reduced-motion. */}
            {running && !tele.done && !REDUCE_MOTION && (() => {
              const g = graphRef.current
              const proj = projRef.current
              if (!g || !proj) return null
              const { baseXOf, baseYOf } = proj
              const { tx, ty, scale } = transform
              const pinPos = (id) => {
                if (id == null) return null
                const n = g.nodes.get(id)
                if (!n) return null
                return { x: baseXOf(n.lng) * scale + tx, y: baseYOf(n.lat) * scale + ty }
              }
              const srcP = pinPos(src)
              const dstP = pinPos(dst)
              return (
                <div className='absolute inset-0 pointer-events-none overflow-hidden'>
                  {srcP && <PulseRing x={srcP.x} y={srcP.y} color='#22c55e' />}
                  {dstP && <PulseRing x={dstP.x} y={dstP.y} color='#ef4444' />}
                </div>
              )
            })()}
            {/* Legend — hidden in fullscreen to reclaim real estate. */}
            {!isFullscreen && (
              <div className='absolute top-2 left-2 flex flex-wrap gap-2 text-[10px] font-mono px-3 py-1.5 rounded-lg bg-black/50 backdrop-blur border border-white/10'>
                <span className='flex items-center gap-1'><span className='w-2 h-2 rounded-full bg-emerald-400' /> Start</span>
                <span className='flex items-center gap-1'><span className='w-2 h-2 rounded-full bg-rose-500' /> End</span>
                <span className='flex items-center gap-1'><span className='w-2 h-2 rounded-full bg-cyan-300' /> Visited</span>
                <span className='flex items-center gap-1'><span className='w-2 h-2 rounded-full bg-amber-300' /> Path</span>
              </div>
            )}
            {/* Zoom controls — in-page only; fullscreen has its own overlay. */}
            {!isFullscreen && (
              <div className='absolute top-2 right-2 flex items-center gap-1 text-[10px] font-mono bg-black/50 backdrop-blur px-2 py-1 rounded-md border border-white/10'>
                <span className='text-fg-muted'>zoom {transform.scale.toFixed(2)}×</span>
                <button
                  type='button'
                  onClick={resetView}
                  className='ml-1 px-1.5 py-0.5 rounded hover:bg-white/10 text-amber-300'>
                  <ExpandOutlined /> reset
                </button>
                <button
                  type='button'
                  onClick={fitToPins}
                  disabled={src == null && dst == null}
                  className='px-1.5 py-0.5 rounded hover:bg-white/10 text-amber-300 disabled:opacity-40 disabled:cursor-not-allowed'
                  title='Fit start + end into view'
                >
                  <AimOutlined /> fit
                </button>
                <button
                  type='button'
                  onClick={toggleFullscreen}
                  className='px-1.5 py-0.5 rounded hover:bg-white/10 text-amber-300'
                  title='Fullscreen (F)'
                >
                  <FullscreenOutlined />
                </button>
              </div>
            )}
            {!isFullscreen && (
              <div className='absolute bottom-2 right-2 text-[10px] font-mono text-fg-muted bg-black/50 backdrop-blur px-2 py-1 rounded-md border border-white/10'>
                {currentCenterLabel}
              </div>
            )}

            {/* ── Fullscreen overlays ── */}
            {/* Top-right: fullscreen toggle + fit-view button. */}
            {isFullscreen && (
              <div className='absolute top-3 right-3 z-[60] flex items-center gap-1 text-[11px] font-mono bg-black/60 backdrop-blur px-2 py-1.5 rounded-lg border border-white/10 shadow-2xl'>
                <button
                  type='button'
                  onClick={fitToPins}
                  disabled={src == null && dst == null}
                  className='px-2 py-1 rounded hover:bg-white/10 text-amber-300 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1'
                  title='Fit start + end into view'
                >
                  <AimOutlined /> <span className='hidden sm:inline'>fit</span>
                </button>
                <button
                  type='button'
                  onClick={resetView}
                  className='px-2 py-1 rounded hover:bg-white/10 text-amber-300 inline-flex items-center gap-1'
                  title='Reset zoom + pan'
                >
                  <ExpandOutlined /> <span className='hidden sm:inline'>reset</span>
                </button>
                <button
                  type='button'
                  onClick={toggleFullscreen}
                  className='px-2 py-1 rounded hover:bg-white/10 text-amber-300 inline-flex items-center gap-1'
                  title='Exit fullscreen (F or Esc)'
                >
                  <FullscreenExitOutlined /> <span className='hidden sm:inline'>exit</span>
                </button>
              </div>
            )}
            {/* Bottom-right: current algorithm, elapsed time, Stop. */}
            {isFullscreen && (
              <div className='absolute bottom-3 right-3 z-[60] flex items-center gap-2 text-[11px] font-mono bg-black/60 backdrop-blur px-3 py-2 rounded-lg border border-white/10 shadow-2xl'>
                <span className='inline-flex items-center gap-1.5'>
                  <span className='w-1.5 h-1.5 rounded-full' style={{ background: info.color }} />
                  <span className='text-fg-primary'>{info.name}</span>
                </span>
                <span className='text-fg-muted'>·</span>
                <span className='text-emerald-200'>{tele.ms} ms</span>
                {running ? (
                  <button
                    type='button'
                    onClick={() => setRunning(false)}
                    className='ml-1 px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/40 inline-flex items-center gap-1'
                    title='Stop'
                  >
                    <StopFilled /> stop
                  </button>
                ) : (
                  <button
                    type='button'
                    onClick={() => setRunning(true)}
                    disabled={status !== 'ready' || tele.done || src == null || dst == null}
                    className='ml-1 px-2 py-0.5 rounded bg-amber-400/20 hover:bg-amber-400/30 text-amber-200 border border-amber-400/40 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1'
                    title='Play'
                  >
                    <PlayCircleFilled /> play
                  </button>
                )}
              </div>
            )}
            {/* Bottom-left in fullscreen: mini legend + zoom readout. On
                small screens the legend collapses to a zoom-only pill. */}
            {isFullscreen && (
              <div className='absolute bottom-3 left-3 z-[60] text-[10px] font-mono text-fg-muted bg-black/50 backdrop-blur px-2 py-1 rounded-md border border-white/10'>
                <span className='hidden sm:inline'>
                  <span className='inline-flex items-center gap-1 mr-2'><span className='w-1.5 h-1.5 rounded-full bg-emerald-400' /> start</span>
                  <span className='inline-flex items-center gap-1 mr-2'><span className='w-1.5 h-1.5 rounded-full bg-rose-500' /> end</span>
                  <span className='inline-flex items-center gap-1 mr-2'><span className='w-1.5 h-1.5 rounded-full bg-cyan-300' /> visited</span>
                  <span className='inline-flex items-center gap-1 mr-2'><span className='w-1.5 h-1.5 rounded-full bg-amber-300' /> path</span>
                  ·
                </span>
                <span className='ml-1'>zoom {transform.scale.toFixed(2)}×</span>
              </div>
            )}
          </div>

          {/* ── Right control panel ── */}
          <div className='space-y-3'>
            {/* Run All */}
            <div className='luxe-glass p-3'>
              <p className='eyebrow-mono mb-2 text-fuchsia-300/80 font-bold'>Race the field</p>

              {/* Per-algorithm timeout picker — 5s / 10s / 30s / 60s / ∞. */}
              <div className='mb-3'>
                <div className='flex items-center justify-between text-[11px] font-mono mb-1.5'>
                  <span className='text-fg-muted flex items-center gap-1.5'>
                    <ClockCircleOutlined /> Per-algorithm timeout
                  </span>
                  <span className='text-amber-300 font-bold'>
                    {algoTimeoutMs === 0 ? 'No limit' : `${algoTimeoutMs / 1000}s`}
                  </span>
                </div>
                <div className='flex flex-wrap gap-1'>
                  {TIMEOUT_MARKS.map((m) => (
                    <button
                      key={m.ms}
                      type='button'
                      onClick={() => setAlgoTimeoutMs(m.ms)}
                      disabled={runAllBusy}
                      className={`px-2 py-1 rounded-md text-[11px] font-mono border transition ${
                        algoTimeoutMs === m.ms
                          ? 'border-amber-400 bg-amber-400/10 text-amber-200'
                          : 'border-line bg-surface-elevated text-fg-muted hover:text-fg-primary hover:border-white/20'
                      } disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Primary action — swap to Stop while a batch is in flight. */}
              {runAllBusy ? (
                <Button
                  variant='danger'
                  block
                  onClick={stopRunAll}
                  icon={<StopFilled />}
                >
                  Stop — abort remaining algorithms
                </Button>
              ) : (
                <Button
                  variant='primary'
                  block
                  onClick={runAll}
                  disabled={status !== 'ready' || src == null || dst == null}
                  icon={<ExperimentOutlined />}
                >
                  Run all algorithms
                </Button>
              )}

              {batchProgress && (
                <div className='mt-2'>
                  <div className='flex items-center justify-between text-[11px] font-mono text-fg-muted mb-1'>
                    <span>
                      Running <span className='text-amber-300'>{batchProgress.current + 1}/{batchProgress.total}</span>
                      {batchProgress.currentName && (
                        <> · <span className='text-fuchsia-300'>{batchProgress.currentName}</span></>
                      )}
                    </span>
                    <span>
                      elapsed <span className='text-amber-300'>{batchProgress.elapsedSec}s</span>
                      {batchProgress.capMs ? (
                        <> / {batchProgress.capMs / 1000}s cap</>
                      ) : (
                        <> · no limit</>
                      )}
                    </span>
                  </div>
                  <Progress
                    percent={Math.round((batchProgress.current / batchProgress.total) * 100)}
                    showInfo={false}
                    strokeColor={{ '0%': '#f59e0b', '100%': '#e11d48' }}
                    trailColor='rgba(255,255,255,0.08)'
                    size='small'
                  />
                </div>
              )}
              <p className='text-[11px] text-fg-muted leading-snug mt-2'>
                Runs every algorithm with the per-algorithm cap you pick above (∞ = no cap — only Stop breaks it).
                Table + coloured overlays appear once every algorithm has settled or been stopped.
              </p>
            </div>

            {/* Algorithm picker */}
            <div className='luxe-glass p-3'>
              <p className='eyebrow-mono mb-2 text-cyan-300/80 font-bold'>Algorithm</p>
              <div className='flex flex-wrap gap-1'>
                {ALGOS.map((a) => (
                  <button
                    key={a.key}
                    type='button'
                    onClick={() => setAlgo(a.key)}
                    className={`px-2 py-1 rounded-md text-[11px] font-mono border transition ${
                      algo === a.key
                        ? 'border-amber-400 bg-amber-400/10 text-amber-200'
                        : 'border-line bg-surface-elevated text-fg-muted hover:text-fg-primary hover:border-white/20'
                    }`}
                    style={algo === a.key ? { boxShadow: `0 0 0 1px ${a.color}55` } : undefined}
                  >
                    <span className='inline-block w-2 h-2 rounded-full mr-1.5 align-middle' style={{ background: a.color }} />
                    {a.name}
                  </button>
                ))}
              </div>
              <div className='mt-2 text-[11px] leading-snug text-fg-muted'>
                <span className='text-amber-300 font-semibold'>{info.name}</span> · {info.tc}
                <div className='mt-0.5 text-fg-dim'>{info.desc}</div>
              </div>
              <p className='text-[11px] text-fg-muted leading-snug mt-1'>
                Twelve options — optimal, heuristic, bidirectional, iterative-deepening, and beam variants.
              </p>
            </div>

            {/* Controls */}
            <div className='luxe-glass p-3 space-y-3'>
              <p className='eyebrow-mono text-amber-300/80 font-bold'>Controls</p>
              <div>
                <div className='flex flex-wrap items-center gap-2'>
                  <Button
                    variant='primary'
                    size='small'
                    icon={running ? <PauseCircleFilled /> : <PlayCircleFilled />}
                    onClick={() => setRunning(r => !r)}
                    disabled={status !== 'ready' || tele.done || src == null || dst == null}
                  >
                    {running ? 'Pause' : 'Play'}
                  </Button>
                  <Button
                    variant='secondary'
                    size='small'
                    icon={<ReloadOutlined />}
                    onClick={resetRun}
                    disabled={status !== 'ready'}
                  >
                    Reset
                  </Button>
                  <Button
                    variant='ghost'
                    size='small'
                    icon={<ClearOutlined />}
                    onClick={clearPaths}
                    disabled={status !== 'ready'}
                    title='Shortcut: C'
                  >
                    Clear paths
                  </Button>
                  <Button
                    variant='secondary'
                    size='small'
                    icon={<SwapOutlined />}
                    onClick={randomize}
                    disabled={status !== 'ready'}
                  >
                    Random
                  </Button>
                  <Button
                    variant='subtle'
                    size='small'
                    icon={<ExpandOutlined />}
                    onClick={resetView}
                  >
                    Fit view
                  </Button>
                  <Button
                    variant='subtle'
                    size='small'
                    icon={<AimOutlined />}
                    onClick={fitToPins}
                    disabled={src == null && dst == null}
                    title='Fit start + end into view'
                  >
                    Fit pins
                  </Button>
                  <Button
                    variant='subtle'
                    size='small'
                    icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                    onClick={toggleFullscreen}
                    title='Shortcut: F'
                  >
                    {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                  </Button>
                </div>
                <p className='text-[11px] text-fg-muted leading-snug mt-1'>
                  Play/Pause animation. Reset clears state. Clear paths (or press <span className='text-amber-300'>C</span>) wipes overlays and the comparison table but keeps your pins. Random picks a fresh start/end pair. Press <span className='text-amber-300'>F</span> for fullscreen.
                </p>
              </div>

              <SliderRow
                label='Steps per frame'
                value={speed}
                min={1} max={500} step={1}
                onChange={setSpeed}
                help='Nodes expanded per animation frame. Higher = faster traversal.'
              />

              <div className='text-[11px] text-fg-muted'>
                Click on the map to place
                <button
                  type='button'
                  onClick={() => setPlaceMode('src')}
                  className={`mx-1 px-1.5 py-0.5 rounded ${placeMode === 'src' ? 'bg-emerald-500/20 text-emerald-300' : 'text-fg-dim hover:text-fg-muted'}`}>
                  <EnvironmentFilled /> start
                </button>
                or
                <button
                  type='button'
                  onClick={() => setPlaceMode('dst')}
                  className={`mx-1 px-1.5 py-0.5 rounded ${placeMode === 'dst' ? 'bg-rose-500/20 text-rose-300' : 'text-fg-dim hover:text-fg-muted'}`}>
                  <AimOutlined /> end
                </button>
                — next click auto-swaps. Drag pans, wheel zooms.
              </div>
            </div>

            {/* Telemetry */}
            <div className='luxe-glass p-3'>
              <div className='flex items-center gap-2 mb-2'>
                <ThunderboltFilled className='text-amber-300' />
                <p className='eyebrow-mono text-amber-300/80 font-bold'>Live telemetry</p>
              </div>
              <div className='grid grid-cols-2 gap-2 text-xs'>
                <Metric label='Algorithm' value={info.name} color='text-amber-200' />
                <Metric label='Time complexity' value={info.tc} color='text-cyan-200' mono />
                <Metric label='Nodes visited' value={tele.visited.toLocaleString()} color='text-white' />
                <Metric label='Elapsed' value={`${tele.ms} ms`} color='text-emerald-200' />
                <Metric label='Path length' value={tele.pathKm ? `${tele.pathKm.toFixed(2)} km` : '—'} color='text-amber-200' />
                <Metric label='Path nodes' value={tele.pathN ? tele.pathN.toLocaleString() : '—'} color='text-white' />
              </div>
              {/* Ambient details — surface only once a route is found. Gives
                  the map a "Google-Maps card" feel: est. drive minutes,
                  turn count, alternate route notice. */}
              {tele.found && tele.pathKm > 0 && (
                <motion.div
                  initial={REDUCE_MOTION ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                  className='mt-3 flex flex-wrap items-center gap-2 text-[11px] font-mono'
                >
                  <span className='inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-400/10 border border-amber-400/30 text-amber-200'>
                    <CarOutlined />
                    <span className='font-bold'>{tele.pathKm.toFixed(1)} km</span>
                    <span className='text-amber-100/60'>·</span>
                    <span>~{tele.minutes || estimateDriveMinutes(tele.pathKm)} min drive</span>
                  </span>
                  <span className='inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-cyan-400/10 border border-cyan-400/30 text-cyan-200'>
                    <BranchesOutlined />
                    <span>{tele.turns || 0} turns</span>
                  </span>
                  {altPaths.length > 0 && (
                    <span className='inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-400/10 border border-slate-400/30 text-slate-300'>
                      <span className='w-2 h-2 rounded-full bg-slate-400/60' style={{ boxShadow: 'inset 0 0 0 1px rgba(148,163,184,0.9)' }} />
                      <span>{altPaths.length} alternate {altPaths.length === 1 ? 'route' : 'routes'}</span>
                    </span>
                  )}
                </motion.div>
              )}
              <div className='mt-2 text-[10px] font-mono text-fg-muted'>
                Graph:&nbsp;
                {graphRef.current
                  ? <>V = <span className='text-amber-300'>{graphRef.current.nodes.size.toLocaleString()}</span>
                        &nbsp;· deg-avg&nbsp;
                    <span className='text-amber-300'>
                      {(() => {
                        let e = 0
                        for (const arr of graphRef.current.adj.values()) e += arr.length
                        return (e / graphRef.current.nodes.size).toFixed(1)
                      })()}
                    </span></>
                  : '—'}
                {tele.done && (
                  <span className={`ml-2 ${tele.found ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {tele.found ? '✓ path found' : '✗ no path'}
                  </span>
                )}
              </div>

              {/* Export & navigation — appears once a path has been found. */}
              {tele.found && pathRef.current && (
                <div className='mt-3 pt-3 border-t border-line/60'>
                  <p className='eyebrow-mono text-cyan-300/80 font-bold mb-2 text-[10.5px]'>
                    Take this route with you
                  </p>
                  <div className='flex flex-col sm:flex-row gap-1.5'>
                    <Button
                      variant='primary'
                      size='small'
                      icon={<CompassOutlined />}
                      onClick={openInGoogleMaps}
                      className='flex-1'
                      title='Open turn-by-turn directions in a new tab'
                    >
                      Open in Google Maps
                    </Button>
                    <Button
                      variant='secondary'
                      size='small'
                      icon={<DownloadOutlined />}
                      onClick={exportPathAsJson}
                      className='flex-1'
                      title='Download the full path as JSON'
                    >
                      Export as JSON
                    </Button>
                  </div>
                  <p className='text-[10.5px] text-fg-muted leading-snug mt-1.5 font-mono'>
                    Maps opens origin → destination for driving directions. JSON contains every coordinate along the computed path.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Comparison table */}
        {enrichedRows.length > 0 && (
          <div className='luxe-glass p-3 mt-4'>
            <div className='flex items-center justify-between mb-2 flex-wrap gap-2'>
              <p className='eyebrow-mono text-fuchsia-300/80 font-bold'>Comparison</p>
              <div className='text-[11px] text-fg-muted'>
                Toggle any row's <EyeOutlined /> to hide/show its coloured path overlay on the map.
              </div>
            </div>
            <div className='overflow-x-auto'>
              <table className='w-full text-xs font-mono border-collapse'>
                <thead>
                  <tr className='text-fg-muted border-b border-line'>
                    <th className='text-left px-2 py-1.5'>Show</th>
                    <th className='text-left px-2 py-1.5'>Algorithm</th>
                    <ThHeader label='Visited'  k='visited'      sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <ThHeader label='Relaxed'  k='edgesRelaxed' sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <ThHeader label='km'       k='pathKm'       sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <ThHeader label='Steps'    k='iterations'   sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <ThHeader label='ms'       k='ms'           sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <ThHeader label='vs opt.'  k='ratio'        sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <th className='text-left px-2 py-1.5'>Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((r) => {
                    const isHidden = !!hidden[r.key]
                    return (
                      <tr key={r.key} className='border-b border-line/60 hover:bg-white/[0.02]'>
                        <td className='px-2 py-1.5'>
                          <button
                            type='button'
                            onClick={() => setHidden((h) => ({ ...h, [r.key]: !h[r.key] }))}
                            className='text-fg-muted hover:text-white'
                            title={isHidden ? 'Show overlay' : 'Hide overlay'}
                          >
                            {isHidden ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                          </button>
                        </td>
                        <td className='px-2 py-1.5'>
                          <span className='inline-flex items-center gap-1.5'>
                            <span className='w-2 h-2 rounded-full' style={{ background: r.color }} />
                            <span className='text-fg-primary'>{r.name}</span>
                          </span>
                        </td>
                        <td className='px-2 py-1.5 text-right text-cyan-200'>{r.visited.toLocaleString()}</td>
                        <td className='px-2 py-1.5 text-right text-fg-muted'>{r.edgesRelaxed?.toLocaleString?.() ?? '—'}</td>
                        <td className='px-2 py-1.5 text-right text-amber-200'>{r.found ? r.pathKm.toFixed(2) : '—'}</td>
                        <td className='px-2 py-1.5 text-right text-fg-muted'>{r.iterations.toLocaleString()}</td>
                        <td className='px-2 py-1.5 text-right text-emerald-200'>{r.ms.toFixed(0)}</td>
                        <td className='px-2 py-1.5 text-right'>{r.ratio ? r.ratio.toFixed(3) : '—'}</td>
                        <td className='px-2 py-1.5'>
                          <VerdictBadge v={r.verdict} timedOut={r.timedOut} stopped={r.stopped} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className='text-[11px] text-fg-muted leading-snug mt-2'>
              vs opt. = Dijkstra's path length ÷ this path length. 1.000 means shortest; below means suboptimal.
            </p>
          </div>
        )}

        {/* City meta — below the canvas as spec'd. No endpoint strings. */}
        {cityMeta && (
          <div className='luxe-glass p-3 mt-4'>
            <p className='eyebrow-mono mb-2 text-cyan-300/80 font-bold'>Current city</p>
            <div className='grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs'>
              <Metric label='Name'        value={cityMeta.name} color='text-amber-200' />
              <Metric label='Nodes'       value={cityMeta.node_count?.toLocaleString?.() ?? '—'} color='text-white' />
              <Metric label='Edges'       value={cityMeta.edge_count?.toLocaleString?.() ?? '—'} color='text-white' />
              <Metric label='Cache size'  value={cityMeta.kb ? `${cityMeta.kb.toLocaleString()} KB` : '—'} color='text-cyan-200' mono />
              <Metric label='Fetched at'  value={fetchedIso ?? '—'} color='text-emerald-200' mono />
            </div>
            <p className='text-[11px] text-fg-muted leading-snug mt-2'>
              Loaded from cache · shared server-side across every visitor, so nobody re-fetches the raw
              city graph after the first time this city is warmed.
            </p>
          </div>
        )}
      </div>

      {/* Cmd+K command palette — rendered outside the max-w-7xl wrapper so
          the backdrop can span the full viewport. */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        cities={cities}
        recentCities={recentCities}
        currentSlug={citySlug}
        onPick={(slug) => {
          onPickCity(slug)
          setPaletteOpen(false)
        }}
      />

      {/*
        Fullscreen styling — the wrapper is the :fullscreen element (via
        requestFullscreen on canvasWrapRef). We force 100vw × 100vh + a
        solid black bg so nothing behind bleeds through. On mobile the
        floating overlays already collapse their labels via sm:inline
        classes above.
      */}
      <style>{`
        .pf-canvas-wrap:fullscreen,
        .pf-canvas-wrap:-webkit-full-screen {
          width: 100vw !important;
          height: 100vh !important;
          max-width: none !important;
          max-height: none !important;
          background: #05050a !important;
          border-radius: 0 !important;
        }
        .pf-canvas-wrap:fullscreen canvas,
        .pf-canvas-wrap:-webkit-full-screen canvas {
          width: 100vw !important;
          height: 100vh !important;
        }
        @media (prefers-reduced-motion: reduce) {
          .pf-canvas-wrap * { transition: none !important; animation: none !important; }
        }
      `}</style>
    </div>
  )
}

function Metric({ label, value, color, mono }) {
  return (
    <div className='rounded-lg border border-line bg-surface-elevated px-3 py-2'>
      <div className='text-[10px] uppercase tracking-widest text-fg-muted'>{label}</div>
      <div className={`text-sm ${mono ? 'font-mono' : 'font-mono font-semibold'} ${color} tabular-nums truncate`}>{value}</div>
    </div>
  )
}

// Absolute-positioned pulsing ring — sits over the canvas at (x, y) and
// emits an outward wave every ~1.4s. Uses framer-motion for the
// keyframe animation; the two nested rings phase-offset so there's
// always one starting as the other fades.
function PulseRing({ x, y, color }) {
  return (
    <div style={{ position: 'absolute', left: x, top: y, transform: 'translate(-50%, -50%)' }}>
      {[0, 0.7].map((delay, i) => (
        <motion.span
          key={i}
          initial={{ scale: 0.4, opacity: 0.6 }}
          animate={{ scale: 3, opacity: 0 }}
          transition={{ duration: 1.4, ease: 'easeOut', repeat: Infinity, delay }}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 24,
            height: 24,
            marginLeft: -12,
            marginTop: -12,
            borderRadius: '50%',
            border: `2px solid ${color}`,
            pointerEvents: 'none',
          }}
        />
      ))}
    </div>
  )
}

function ThHeader({ label, k, sortKey, sortDir, onClick }) {
  const active = sortKey === k
  return (
    <th
      className='text-right px-2 py-1.5 cursor-pointer select-none hover:text-fg-primary'
      onClick={() => onClick(k)}
    >
      {label}
      {active && <span className='ml-1 text-amber-300'>{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  )
}

function VerdictBadge({ v, timedOut, stopped }) {
  // `stopped` beats `timedOut` — a user-initiated abort is a stronger
  // signal than the hitting the wall-clock cap. Rose ("magenta") tag
  // is distinct from volcano (timeout) and red (failed).
  if (stopped || v === 'stopped') return <Tag color='magenta' className='!m-0'>stopped</Tag>
  if (timedOut) return <Tag color='volcano' className='!m-0'>timeout</Tag>
  if (v === 'optimal') return <Tag color='green' className='!m-0'>optimal</Tag>
  if (v === 'near-optimal') return <Tag color='gold' className='!m-0'>near-opt</Tag>
  if (v === 'suboptimal') return <Tag color='orange' className='!m-0'>suboptimal</Tag>
  return <Tag color='red' className='!m-0'>failed</Tag>
}

// ─── Autocomplete composer row ─────────────────────────────────
// Google-Maps-style: labelled coloured dot, big text input, floating
// suggestion dropdown, keyboard nav, recents fallback when empty +
// focused. Suggestion rows show a kind-icon on the left, highlighted
// name in the middle, kind + city small muted below, and a distance
// chip on the right when a source pin is set.
//
// The dropdown is portalled to document.body and absolutely positioned
// from the input's getBoundingClientRect() — otherwise ancestor
// containers with backdrop-blur / transform / opacity create their own
// stacking context and the popover gets trapped underneath the canvas
// even at z-index: 999. Position is recomputed on scroll + resize.
function ComposerRow({
  id, which, iconDot, iconRing, placeholder, value, onChange, onFocus, onBlur,
  onKeyDown, open, suggestions, recents, highlight, setHighlight,
  onPick, query, srcNodeLatLng, disabled, helper,
}) {
  const showRecents = !value && open && recents.length > 0
  const list = showRecents ? recents : suggestions
  const showList = open && list.length > 0

  const inputWrapRef = useRef(null)
  const [rect, setRect] = useState(null)

  useLayoutEffect(() => {
    if (!showList) return
    const measure = () => {
      const el = inputWrapRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setRect({
        left: r.left,
        top: r.bottom + 4,   // 4px = mt-1
        width: r.width,
      })
    }
    measure()
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [showList, list.length])

  return (
    <div className='relative'>
      <div className='relative' ref={inputWrapRef}>
        <span className={`absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full ${iconDot} ring-4 ${iconRing}`} />
        <Input
          id={id}
          allowClear
          size='middle'
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          disabled={disabled}
          className='!pl-10 !text-sm'
        />
      </div>
      {showList && rect && typeof document !== 'undefined' && createPortal(
        <div
          className='max-h-80 overflow-y-auto rounded-lg border border-line bg-[#0a0a0e]/95 backdrop-blur shadow-2xl'
          style={{
            position: 'fixed',
            left: rect.left,
            top: rect.top,
            width: rect.width,
            zIndex: 2000,
          }}
        >
          {showRecents && (
            <div className='px-3 py-1.5 text-[10px] font-mono uppercase text-fg-muted border-b border-line/60 flex items-center gap-1.5'>
              <HistoryOutlined /> Recent
            </div>
          )}
          {list.map((p, i) => (
            <SuggestionRow
              key={`${which}-${p.name}-${i}`}
              p={p}
              q={query}
              active={i === highlight}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => { e.preventDefault(); onPick(p) }}
              srcNodeLatLng={srcNodeLatLng}
            />
          ))}
        </div>,
        document.body,
      )}
      {helper && <p className='text-[11px] text-fg-muted leading-snug mt-1'>{helper}</p>}
    </div>
  )
}

// Kind → emoji glyph. Kept as a plain lookup so unknown kinds fall
// through to a neutral pin without runtime cost. Building-tier kinds
// (hospital, school, university, mall, office, library, theatre,
// cinema, generic building) were added Sep 2026 when the BE places
// index was widened beyond suburbs + landmarks.
const KIND_ICON = {
  // Places
  landmark: '📍', suburb: '🏘️', neighbourhood: '🏙️', quarter: '🏙️',
  square: '⛲', town: '🏛️', village: '🏡', hamlet: '🏡',
  city_block: '🏙️', locality: '🏘️',
  // Buildings + offices
  building: '🏗️', office: '🏢',
  // Health
  hospital: '🏥', pharmacy: '💊', veterinary: '🐾',
  // Education
  school: '🏫', university: '🎓', kindergarten: '🎨', library: '📚',
  // Culture / entertainment
  museum: '🏛️', gallery: '🖼️', theatre: '🎭', cinema: '🎬',
  arts_centre: '🎨', casino: '🎰', nightclub: '🪩', venue: '🎤',
  entertainment: '🎉', artwork: '🖼️',
  // Food + drink
  restaurant: '🍽️', cafe: '☕', fast_food: '🍔', bar: '🍸',
  food_court: '🍱', ice_cream: '🍨',
  // Shopping
  mall: '🛍️', supermarket: '🛒', clothing: '👕', electronics: '💻',
  grocery: '🥬', bookshop: '📖', alcohol: '🍷', sports_shop: '⚽',
  hardware: '🔨', auto_shop: '🚗', beauty: '💄', shop: '🛒',
  // Finance
  bank: '🏦', atm: '💳',
  // Transport
  fuel: '⛽', charging_station: '🔌', bus_station: '🚌', taxi: '🚕',
  parking: '🅿️', ferry_terminal: '⛴️', transport_service: '🛻',
  airport: '✈️', heliport: '🚁', train_station: '🚉',
  tram_stop: '🚊', metro: '🚇',
  // Hospitality
  hotel: '🏨', camp_site: '⛺',
  // Fitness + wellness
  gym: '💪', spa: '🧖', pool: '🏊', sports_centre: '🏟️',
  stadium: '🏟️', ice_rink: '⛸️', golf: '⛳', marina: '⛵',
  // Nature + outdoors
  park: '🌳', playground: '🛝', beach: '🏖️', viewpoint: '👀',
  zoo: '🦁', theme_park: '🎢', aquarium: '🐠', leisure: '🎯',
  // Public services
  police: '👮', fire_station: '🚒', post_office: '📮',
  courthouse: '⚖️', townhall: '🏛️', embassy: '🏛️',
  community_centre: '🤝', marketplace: '🏪', place_of_worship: '⛪',
  childcare: '👶', social_facility: '🤲', shelter: '🏠',
  // Workspace
  coworking: '💼',
  // Historic
  castle: '🏰', monument: '🗿', ruins: '🏛️', manor: '🏛️',
  historic: '🏺',
  // Utilities / landmarks
  lighthouse: '🗼', tower: '🗼', bridge: '🌉', windmill: '🌬️',
  observatory: '🔭', fountain: '⛲', clock: '🕰️', information: 'ℹ️',
}
function iconForKind(k) { return KIND_ICON[k] || '📌' }

// Highlight the matched substring in a name using <mark>. Case-insensitive,
// only the FIRST occurrence is bolded — multiple matches get noisy fast.
function HighlightedName({ name, q }) {
  const s = String(name || '')
  const query = String(q || '').trim()
  if (!query) return <>{s}</>
  const idx = s.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{s}</>
  const before = s.slice(0, idx)
  const mid = s.slice(idx, idx + query.length)
  const after = s.slice(idx + query.length)
  return (
    <>
      {before}
      <mark className='bg-amber-400/30 text-amber-100 rounded-sm px-0.5'>{mid}</mark>
      {after}
    </>
  )
}

// Very approximate great-circle km — reused from the main file's helper
// pattern; kept local so this component has no external dep.
function kmBetween(a, b) {
  const R = 6371
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const la1 = toRad(a.lat), la2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function SuggestionRow({ p, q, active, onMouseEnter, onMouseDown, srcNodeLatLng }) {
  const km = srcNodeLatLng ? kmBetween(srcNodeLatLng, { lat: p.lat, lng: p.lng }) : null
  return (
    <button
      type='button'
      onMouseEnter={onMouseEnter}
      onMouseDown={onMouseDown}
      className={`w-full text-left px-3 py-2 flex items-center gap-2 border-b border-line/40 last:border-b-0 transition ${
        active ? 'bg-amber-400/10' : 'hover:bg-white/[0.04]'
      }`}
    >
      <span className='text-base leading-none shrink-0 w-6 text-center'>{iconForKind(p.kind)}</span>
      <span className='flex-1 min-w-0'>
        <span className='block text-sm text-fg-primary truncate'>
          <HighlightedName name={p.name} q={q} />
        </span>
        <span className='block text-[11px] text-fg-muted truncate'>
          <span className='uppercase font-mono'>{p.kind || 'place'}</span>
          {p.city_name && <span className='mx-1 text-fg-dim'>·</span>}
          {p.city_name && <span>{p.city_name}</span>}
        </span>
      </span>
      {km != null && (
        <span className='text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-fg-muted shrink-0'>
          {km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`}
        </span>
      )}
    </button>
  )
}

// ─── ProgressStages ─────────────────────────────────────────────
// Google-Maps-style progressive loader: a 4-step ladder that ticks on
// as fetch → decode → project → ready completes. The active step
// pulses; completed steps lock into a solid check; upcoming steps are
// muted.
function ProgressStages({ stage }) {
  return (
    <div className='flex items-center gap-2 text-[11px] font-mono'>
      {LOAD_STAGES.slice(0, 3).map((s, i) => {
        const done = stage > i
        const active = stage === i
        return (
          <div key={s.key} className='flex items-center gap-2'>
            <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border transition ${
              done ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
                : active ? 'border-amber-400/60 bg-amber-400/10 text-amber-200'
                : 'border-line bg-surface-elevated text-fg-muted'
            }`}>
              {done ? (
                <CheckCircleFilled className='text-emerald-300' />
              ) : active ? (
                <motion.span
                  animate={REDUCE_MOTION ? undefined : { rotate: 360 }}
                  transition={{ duration: 1, ease: 'linear', repeat: Infinity }}
                  className='inline-flex'
                >
                  <LoadingOutlined />
                </motion.span>
              ) : (
                <span className='w-2.5 h-2.5 rounded-full bg-white/10' />
              )}
              <span className='font-bold'>{s.label}</span>
            </div>
            {i < 2 && (
              <span className={`h-px w-4 ${done ? 'bg-emerald-400/40' : 'bg-white/10'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── CommandPalette ─────────────────────────────────────────────
// Cmd+K style city switcher. Big search input, recent + trending
// pinned at the top when empty, fuzzy state+city search when typing,
// keyboard nav (↑/↓ + Enter), Escape to close, click-outside to
// close. Portalled to body so nothing behind stacks over it.
function CommandPalette({ open, onClose, cities, recentCities, currentSlug, onPick }) {
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const inputRef = useRef(null)

  // Reset the input + highlight every time the palette opens so a stale
  // query from a prior session doesn't leak in.
  useEffect(() => {
    if (open) {
      setQ('')
      setHi(0)
      // Focus after paint so the input actually accepts keystrokes.
      setTimeout(() => inputRef.current?.focus(), 20)
    }
  }, [open])

  // Build the sectioned result list. Three sections when empty (recent,
  // trending, all-cities); a single flat "results" section when the
  // user starts typing. Sections are only visible for display — the
  // flat `items` array underneath is what we index with ↑/↓ + Enter.
  const { sections, items } = useMemo(() => {
    const trimmed = (q || '').toLowerCase().trim()
    const all = cities || []
    if (!trimmed) {
      const recentSlugs = new Set(recentCities.map((r) => r.slug))
      const recentList = recentCities
        .map((r) => all.find((c) => c.slug === r.slug))
        .filter(Boolean)
      const trending = TRENDING_SLUGS
        .map((s) => all.find((c) => c.slug === s))
        .filter((c) => c && !recentSlugs.has(c.slug))
      // Group everything else by state so scrolling still feels
      // structured even without a query.
      const remainderSlugs = new Set([
        ...recentList.map((c) => c.slug),
        ...trending.map((c) => c.slug),
      ])
      const byState = new Map()
      for (const c of all) {
        if (remainderSlugs.has(c.slug)) continue
        const st = c.state || 'Other'
        if (!byState.has(st)) byState.set(st, [])
        byState.get(st).push(c)
      }
      const groupedSections = [...byState.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([state, cs]) => ({
          label: state,
          items: cs.slice().sort((a, b) => a.name.localeCompare(b.name)),
        }))
      const outSections = []
      if (recentList.length) outSections.push({ label: 'Recent', icon: <HistoryOutlined />, items: recentList })
      if (trending.length)   outSections.push({ label: 'Trending', icon: <ThunderboltFilled />, items: trending })
      for (const g of groupedSections) outSections.push(g)
      const flat = outSections.flatMap((s) => s.items)
      return { sections: outSections, items: flat }
    }
    // Query mode — match on city name + state. State-name matches
    // surface every city under that state as suggestions. Otherwise
    // simple case-insensitive substring on the city name.
    const cityMatches = []
    const stateMatches = new Map()   // state → cities in that state
    for (const c of all) {
      const cName = (c.name || '').toLowerCase()
      const sName = (c.state || '').toLowerCase()
      if (cName.includes(trimmed)) cityMatches.push(c)
      else if (sName.includes(trimmed)) {
        if (!stateMatches.has(c.state)) stateMatches.set(c.state, [])
        stateMatches.get(c.state).push(c)
      }
    }
    const outSections = []
    if (cityMatches.length) {
      outSections.push({
        label: `Cities matching "${q}"`,
        items: cityMatches.slice(0, 20),
      })
    }
    for (const [state, cs] of stateMatches.entries()) {
      outSections.push({
        label: state,
        icon: <CompassOutlined />,
        items: cs.slice().sort((a, b) => a.name.localeCompare(b.name)),
      })
    }
    const flat = outSections.flatMap((s) => s.items)
    return { sections: outSections, items: flat }
  }, [q, cities, recentCities])

  // Clamp the highlight cursor whenever the item list changes so
  // deleting characters can't leave hi pointing past the end.
  useEffect(() => {
    if (hi >= items.length) setHi(Math.max(0, items.length - 1))
  }, [items, hi])

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(items.length - 1, h + 1)); return }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); return }
    if (e.key === 'Enter') {
      e.preventDefault()
      const pick = items[hi]
      if (pick) onPick(pick.slug)
    }
  }

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        key='pf-palette-backdrop'
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className='fixed inset-0 z-[3000] flex items-start sm:items-center justify-center px-3 pt-20 sm:pt-0 bg-black/70 backdrop-blur-md'
        onClick={onClose}
      >
        <motion.div
          initial={REDUCE_MOTION ? false : { opacity: 0, y: -12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={REDUCE_MOTION ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
          className='w-full max-w-xl rounded-xl border border-line bg-[#0a0a0e]/95 backdrop-blur shadow-2xl overflow-hidden'
        >
          {/* Search row */}
          <div className='flex items-center gap-3 px-4 py-3 border-b border-line/60'>
            <SearchOutlined className='text-amber-300 text-lg' />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => { setQ(e.target.value); setHi(0) }}
              onKeyDown={onKeyDown}
              placeholder='Search city or state…'
              className='flex-1 bg-transparent border-none outline-none text-fg-primary text-base placeholder-fg-muted'
            />
            <kbd className='hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-line bg-black/40 text-[10px] font-mono text-fg-muted'>
              esc
            </kbd>
          </div>
          {/* Results list */}
          <div className='max-h-[60vh] overflow-y-auto py-1'>
            {items.length === 0 ? (
              <div className='px-4 py-6 text-center text-[11px] font-mono text-fg-muted'>
                No cities match "{q}".
              </div>
            ) : (
              <PaletteSections
                sections={sections}
                hi={hi}
                setHi={setHi}
                onPick={onPick}
                currentSlug={currentSlug}
              />
            )}
          </div>
          {/* Footer */}
          <div className='flex items-center justify-between gap-2 px-4 py-2 border-t border-line/60 text-[10px] font-mono text-fg-muted bg-black/20'>
            <span className='flex items-center gap-2'>
              <span><kbd className='px-1 py-0.5 rounded border border-line bg-black/40 text-amber-300'>↑↓</kbd> navigate</span>
              <span><kbd className='px-1 py-0.5 rounded border border-line bg-black/40 text-amber-300'>↵</kbd> select</span>
              <span className='hidden sm:inline'><kbd className='px-1 py-0.5 rounded border border-line bg-black/40 text-amber-300'>esc</kbd> close</span>
            </span>
            <span>{items.length} {items.length === 1 ? 'match' : 'matches'}</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}

// Sub-component so we can walk sections while maintaining a single flat
// `hi` index across every visible item.
function PaletteSections({ sections, hi, setHi, onPick, currentSlug }) {
  const listRef = useRef(null)

  // Scroll the highlighted row into view when the cursor moves.
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx='${hi}']`)
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' })
  }, [hi])

  let flatIndex = 0
  return (
    <div ref={listRef}>
      {sections.map((sec, si) => (
        <div key={`${sec.label}-${si}`}>
          <div className='px-4 pt-2 pb-1 text-[10px] font-mono uppercase tracking-widest text-fg-muted flex items-center gap-1.5'>
            {sec.icon}
            {sec.label}
          </div>
          {sec.items.map((c) => {
            const idx = flatIndex++
            const active = idx === hi
            const current = c.slug === currentSlug
            return (
              <button
                key={c.slug}
                type='button'
                data-idx={idx}
                onMouseEnter={() => setHi(idx)}
                onMouseDown={(e) => { e.preventDefault(); onPick(c.slug) }}
                className={`w-full text-left px-4 py-2 flex items-center gap-3 transition ${
                  active ? 'bg-amber-400/10' : 'hover:bg-white/[0.03]'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${current ? 'bg-amber-300' : 'bg-white/20'}`} />
                <span className='flex-1 min-w-0'>
                  <span className='block text-sm text-fg-primary truncate'>
                    {c.name}
                    {current && (
                      <span className='ml-2 text-[10px] font-mono text-amber-300/80 uppercase'>· loaded</span>
                    )}
                  </span>
                  <span className='block text-[11px] text-fg-muted truncate font-mono'>
                    {c.state || '—'}
                  </span>
                </span>
                {active && (
                  <span className='text-[10px] font-mono text-amber-300'>↵</span>
                )}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
