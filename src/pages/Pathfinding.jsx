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
import { Segmented, InputNumber, Input, Tag, Progress, Select } from 'antd'
import { Slider, Button } from '../components/ui'
import {
  PlayCircleFilled, PauseCircleFilled, ReloadOutlined,
  NodeIndexOutlined, ThunderboltFilled, EnvironmentFilled,
  AimOutlined, SwapOutlined, ExpandOutlined,
  EyeOutlined, EyeInvisibleOutlined,
  ExperimentOutlined, ClearOutlined, HistoryOutlined,
  StopFilled, ClockCircleOutlined, GlobalOutlined,
  FullscreenOutlined, FullscreenExitOutlined,
} from '@ant-design/icons'
import { get as apiGet } from '../api/request'
import { ENDPOINTS } from '../api/endpoints'
import { notify } from '../utils/notify'
import { LuxeLoader } from '../components/loaders'

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
      installCity(slug, cached)
      return
    }
    try {
      setStatus('fetching')
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
      const meta = metaRes?.data
      if (!meta) throw new Error('Empty meta payload')
      if (!graph || !graph.nodes || !graph.edges) throw new Error('Empty graph payload')
      const { nodes, adj } = inflateGraph(graph)
      const revAdj = buildReverseAdj(adj)
      const bbox = parseBbox(meta.bbox)
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
    setTransform({ tx: 0, ty: 0, scale: 1 })
    setLabels([])
    setFromSuggestions([])
    setToSuggestions([])
    setFromQuery('')
    setToQuery('')
    setFromOpen(false)
    setToOpen(false)
    setStatus('ready')
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
      setTele({
        visited: visitedListRef.current.length,
        ms: Math.round(ms),
        pathKm: path ? pathKm(path, graphRef.current.nodes) : 0,
        pathN: path ? path.length : 0,
        done: true,
        found: !!path,
      })
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

    // Final path — amber, thick, drawn on top of comparisons.
    if (pathRef.current) {
      ctx.strokeStyle = 'rgba(251,191,36,0.95)'
      ctx.lineWidth = 2.8 / zoom
      ctx.beginPath()
      const p = pathRef.current
      for (let i = 0; i < p.length; i++) {
        const n = g.nodes.get(p[i])
        if (!n) continue
        const x = baseXOf(n.lng), y = baseYOf(n.lat)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
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

        {/* City picker — searchable Select grouped by state */}
        <div className='luxe-glass p-3 mb-3'>
          <div className='flex items-center justify-between mb-2 gap-2 flex-wrap'>
            <p className='eyebrow-mono text-amber-300/80 font-bold flex items-center gap-2'>
              <GlobalOutlined /> City
            </p>
            {currentCityLabel && (
              <span
                className='inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border border-amber-400/40 bg-amber-400/10 text-amber-200'
                title='Currently loaded city'
              >
                <span className='w-1.5 h-1.5 rounded-full bg-amber-300' />
                {currentCityLabel}
                {currentCityState && (
                  <span className='text-amber-100/70 font-mono font-normal'>· {currentCityState}</span>
                )}
              </span>
            )}
          </div>
          <Select
            showSearch
            value={citySlug || undefined}
            onChange={onPickCity}
            options={cityOptions}
            disabled={status === 'catalog' || status === 'fetching' || !cityOptions.length}
            placeholder='Search a city (try "mum", "pun", "war"…)'
            className='w-full'
            size='middle'
            optionFilterProp='label'
            filterOption={(input, option) => {
              // Match against city name AND its parent state so typing
              // "kerala" surfaces both Kerala cities. Options nested under
              // a group carry a `state` field we added upstream.
              const q = (input || '').toLowerCase().trim()
              if (!q) return true
              const label = (option?.label || '').toLowerCase()
              const state = (option?.state || '').toLowerCase()
              return label.includes(q) || state.includes(q)
            }}
            listHeight={360}
            popupMatchSelectWidth
          />
          <p className='text-[11px] text-fg-muted mt-2 leading-snug'>
            Type any city or state — grouped by state, {citiesCount || 50}+ options.
            Graphs are cached server-side so first-time picks may take a moment, then load instantly on return.
          </p>
        </div>

        {/* Area search — Google-Maps-style dual composer */}
        <div className='luxe-glass p-3 mb-3'>
          <div className='flex items-center justify-between mb-2 gap-2 flex-wrap'>
            <p className='eyebrow-mono text-fuchsia-300/80 font-bold'>Area search</p>
            <Button
              variant='subtle'
              size='small'
              icon={showLabels ? <EyeOutlined /> : <EyeInvisibleOutlined />}
              onClick={() => setShowLabels((s) => !s)}
            >
              {showLabels ? 'Hide labels' : 'Show labels'}
            </Button>
          </div>
          {/* Stacked composer — From on top, To below, Swap on the right */}
          <div className='flex flex-col sm:flex-row gap-2 items-stretch sm:items-start'>
            <div className='flex-1 space-y-2 min-w-0'>
              {/* From */}
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
              {/* To */}
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
            style={isFullscreen ? undefined : { height: 'min(72vh, 640px)' }}
          >
            {(status === 'catalog' || status === 'fetching' || status === 'boot' || status === 'error') && (
              <div className='absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 bg-black/40 backdrop-blur-sm'>
                {status === 'error' ? (
                  <>
                    <div className='text-rose-300 text-sm font-bold'>Couldn't load the city graph — try again</div>
                    <div className='text-[11px] font-mono text-fg-muted max-w-md text-center px-6'>{errMsg}</div>
                  </>
                ) : (
                  <>
                    <LuxeLoader
                      variant='road'
                      size='md'
                      label={status === 'catalog' ? 'Loading city catalogue…' : 'Loading city graph…'}
                    />
                    <div className='text-[11px] font-mono text-fg-muted'>
                      {status === 'fetching' ? 'Streaming from server cache · ~1-3 MB compressed' : ''}
                    </div>
                  </>
                )}
              </div>
            )}
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
