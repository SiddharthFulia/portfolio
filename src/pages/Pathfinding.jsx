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

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Segmented, InputNumber, Input, Tag } from 'antd'
import { Slider, Button } from '../components/ui'
import {
  PlayCircleFilled, PauseCircleFilled, ReloadOutlined,
  NodeIndexOutlined, ThunderboltFilled, EnvironmentFilled,
  AimOutlined, SwapOutlined, ExpandOutlined,
  EyeOutlined, EyeInvisibleOutlined,
  ExperimentOutlined, ClearOutlined, HistoryOutlined,
} from '@ant-design/icons'
import { get as apiGet } from '../api/request'
import { ENDPOINTS } from '../api/endpoints'
import { notify } from '../utils/notify'

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
  // and re-explores exponential subtrees each pass. Standard fix is
  // "Bucketed IDA*": coarsen both g AND h to a common bucket size so
  // the f-bound advances in ≥ BUCKET jumps. Costs ≤ BUCKET·depth of
  // path suboptimality but converges in tens of outer iterations
  // even on 100k-node metros.
  const BUCKET = 200      // metres
  const h = (id) => Math.ceil(haversine(nodes.get(id), nDst) / BUCKET) * BUCKET
  const b = (w) => Math.ceil(w / BUCKET) * BUCKET      // bucket a raw edge weight
  const MAX_ITERS = 200_000
  let expansions = 0
  let edgesRelaxed = 0

  let threshold = h(src)
  const outerCap = 60

  for (let outer = 0; outer < outerCap; outer++) {
    let nextThreshold = Infinity
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
      const f = ng + h(v)
      if (f > threshold) {
        if (f < nextThreshold) nextThreshold = f
        continue
      }
      prev.set(v, top.id)
      onPath.add(v)
      stack.push({ id: v, g: ng, iter: 0 })
    }

    if (found) return { found: true, prev, edgesRelaxed }
    if (nextThreshold === Infinity) break
    threshold = nextThreshold
  }
  return { found: false, prev: new Map(), edgesRelaxed }
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
// `later`. Uses a single dist map so we don't re-explore.
function* fringe(adj, nodes, src, dst) {
  const nDst = nodes.get(dst)
  const h = (id) => haversine(nodes.get(id), nDst)
  const g = new Map([[src, 0]])
  const prev = new Map()
  let threshold = h(src)
  let now = [src]
  let later = []
  let edgesRelaxed = 0
  // Same rationale as IDA* — fractional haversine + integer edge weights
  // means the threshold nudges up slowly, needs many outer passes.
  const MAX_ITERS = 400

  for (let outer = 0; outer < MAX_ITERS; outer++) {
    let nextThreshold = Infinity
    while (now.length) {
      const u = now.shift()
      const gu = g.get(u)
      const fu = gu + h(u)
      if (fu > threshold) {
        if (fu < nextThreshold) nextThreshold = fu
        later.push(u)
        continue
      }
      yield { u, dist: gu, edgesRelaxed }
      if (u === dst) return { found: true, prev, edgesRelaxed }
      const edges = adj.get(u) || []
      for (const { to: v, w } of edges) {
        edgesRelaxed++
        const ng = gu + w
        const cur = g.get(v)
        if (cur === undefined || ng < cur) {
          g.set(v, ng)
          prev.set(v, u)
          now.push(v)
        }
      }
    }
    if (!later.length) break
    now = later
    later = []
    threshold = nextThreshold === Infinity ? threshold + 1 : nextThreshold
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
  // A node has "degree" = out edges + in edges (approx — we treat the
  // graph as undirected for skip detection since the BE emits both
  // directions for two-way roads). Degree-2 = intersection-free.
  const degree = new Map()
  for (const [u, edges] of adj) {
    degree.set(u, (degree.get(u) || 0) + edges.length)
    for (const { to: v } of edges) {
      degree.set(v, (degree.get(v) || 0) + 1)
    }
  }
  // Nodes we'll KEEP as junctions in the contracted graph: any node
  // with degree ≠ 2 (or with no incoming/outgoing at all).
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
  // If src/dst aren't junctions, we need to snap them to the nearest
  // junction on their chain — otherwise the contracted graph doesn't
  // know about them. For simplicity + correctness, we run A* over the
  // super-graph FROM src TO dst but include their raw adjacency lists
  // as fallbacks if they aren't junctions.
  const goal = nodes.get(dst)
  const h = (id) => haversine(nodes.get(id), goal)
  const g = new Map([[src, 0]])
  const prev = new Map()
  const meta = new Map()   // v -> waypoints from prev to v
  const visited = new Set()
  const heap = new MinHeap()
  let edgesRelaxed = 0
  heap.push({ id: src, key: h(src) })

  const outEdges = (u) => {
    // Junctions: use the super graph. Non-junctions: fall back to the
    // raw graph. Src is often a non-junction so we handle both.
    if (isJunction(u) && superAdj.has(u)) return superAdj.get(u)
    return (adj.get(u) || []).map(({ to, w }) => ({ to, w }))
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
      if (visited.has(v)) continue
      const ng = gu + w
      const cur = g.get(v)
      if (cur === undefined || ng < cur) {
        g.set(v, ng)
        prev.set(v, u)
        const way = superWaypoints.get(`${u}_${v}`)
        if (way) meta.set(v, way)
        heap.push({ id: v, key: ng + h(v) })
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

  // Run-all state
  const [comparisonRows, setComparisonRows] = useState([])
  const [runAllBusy, setRunAllBusy] = useState(false)
  const [hidden, setHidden] = useState({})   // key -> bool (hidden path overlay)
  const [sortKey, setSortKey] = useState('ms')
  const [sortDir, setSortDir] = useState('asc')

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
  async function loadCity(slug, opts = {}) {
    const isCancelled = () => opts.cancelled?.() === true
    const cached = cityCacheRef.current.get(slug)
    if (cached) {
      installCity(slug, cached)
      return
    }
    try {
      setStatus('fetching')
      const res = await apiGet(`${ENDPOINTS.CITY_GRAPHS}/${slug}`)
      if (isCancelled()) return
      const payload = res?.data
      if (!payload?.graph) throw new Error('Empty graph payload')
      const { nodes, adj } = inflateGraph(payload.graph)
      const revAdj = buildReverseAdj(adj)
      const bbox = parseBbox(payload.bbox)
      const entry = {
        nodes, adj, revAdj, bbox,
        meta: {
          slug: payload.slug,
          name: payload.name,
          node_count: payload.node_count,
          edge_count: payload.edge_count,
          fetched_at: payload.fetched_at,
          kb: payload.kb,
          center: payload.center,
        },
      }
      cityCacheRef.current.set(slug, entry)
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
    setPlaceSuggestions([])
    setPlaceQuery('')
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
  function tick(ts) {
    rafRef.current = null
    if (!startTsRef.current && running) startTsRef.current = ts

    const gen = genRef.current
    let doneNow = false, resultNow = null

    if (running && gen) {
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

    if (running) {
      setTele((t) => ({
        ...t,
        visited: visitedListRef.current.length,
        ms: Math.round(ts - startTsRef.current),
      }))
      requestFrame()
    }
  }

  useEffect(() => {
    if (running) requestFrame()
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
    setTransform({ tx: 0, ty: 0, scale: 1 })
  }

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
  async function runAll() {
    const g = graphRef.current
    if (!g || src == null || dst == null) return
    setRunAllBusy(true)
    setComparisonRows([])
    setHidden({})
    const rows = []
    // Compute Dijkstra first as the optimal reference.
    for (const meta of ALGOS) {
      // Yield to the event loop between algos so the UI stays responsive.
      // Small delay is enough — we're in the main thread.
      await new Promise((r) => setTimeout(r, 30))
      let result
      try {
        result = runAlgoSync(meta.key, g, revAdjRef.current, src, dst, 6000)
      } catch (err) {
        result = { key: meta.key, name: meta.name, path: null, visited: 0, iterations: 0, edgesRelaxed: 0, ms: 0, pathKm: 0, found: false, error: err.message }
      }
      rows.push(result)
      // Streamed render — user sees results appear one by one.
      setComparisonRows([...rows])
    }
    setRunAllBusy(false)
  }

  // ── Enrich comparison rows with vs-Optimal ratio ──
  const enrichedRows = useMemo(() => {
    if (!comparisonRows.length) return []
    const dij = comparisonRows.find((r) => r.key === 'dijkstra' && r.found)
    const opt = dij?.pathKm || 0
    return comparisonRows.map((r) => {
      const ratio = r.found && opt > 0 ? opt / r.pathKm : null
      const info = ALGO_MAP.get(r.key)
      let verdict = 'failed'
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
  const cityOptions = useMemo(
    () => (cities.length ? cities : []).map((c) => ({ label: c.name, value: c.slug })),
    [cities],
  )
  const fetchedIso = cityMeta?.fetched_at ? new Date(cityMeta.fetched_at).toISOString() : null
  const currentCenterLabel = cityMeta?.center
    ? `${cityMeta.center.lat.toFixed(4)}°N · ${cityMeta.center.lng.toFixed(4)}°E`
    : '—'

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
            Twelve algorithms racing through OpenStreetMap road data across 10 Indian metros. Pick a city,
            drag to pan, wheel to zoom, click to set start/end, and watch how each algorithm thinks — or
            hit <span className='text-amber-300'>Run all</span> to race them side-by-side.
          </p>
        </header>

        {/* City picker */}
        <div className='luxe-glass p-3 mb-3'>
          <p className='eyebrow-mono mb-2 text-amber-300/80 font-bold'>City</p>
          <div className='overflow-x-auto -mx-1 px-1'>
            <Segmented
              size='small'
              value={citySlug}
              onChange={onPickCity}
              options={cityOptions}
              disabled={status === 'catalog' || status === 'fetching' || !cityOptions.length}
            />
          </div>
          <p className='text-[11px] text-fg-muted mt-2 leading-snug'>
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
                helper='Type any landmark, area or suburb across our 10 metros.'
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
                helper='Type any landmark, area or suburb across our 10 metros.'
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
          <div className='luxe-glass overflow-hidden relative'
               style={{ height: 'min(72vh, 640px)' }}>
            {(status === 'catalog' || status === 'fetching' || status === 'boot' || status === 'error') && (
              <div className='absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 bg-black/40 backdrop-blur-sm'>
                {status === 'error' ? (
                  <>
                    <div className='text-rose-300 text-sm font-bold'>Failed to load road graph</div>
                    <div className='text-[11px] font-mono text-fg-muted max-w-md text-center px-6'>{errMsg}</div>
                  </>
                ) : (
                  <>
                    <div className='w-10 h-10 border-2 border-amber-300 border-t-transparent rounded-full animate-spin' />
                    <div className='text-sm text-amber-200'>
                      {status === 'catalog' ? 'Loading city catalogue…' : 'Fetching road network…'}
                    </div>
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
            {/* Legend */}
            <div className='absolute top-2 left-2 flex flex-wrap gap-2 text-[10px] font-mono px-3 py-1.5 rounded-lg bg-black/50 backdrop-blur border border-white/10'>
              <span className='flex items-center gap-1'><span className='w-2 h-2 rounded-full bg-emerald-400' /> Start</span>
              <span className='flex items-center gap-1'><span className='w-2 h-2 rounded-full bg-rose-500' /> End</span>
              <span className='flex items-center gap-1'><span className='w-2 h-2 rounded-full bg-cyan-300' /> Visited</span>
              <span className='flex items-center gap-1'><span className='w-2 h-2 rounded-full bg-amber-300' /> Path</span>
            </div>
            {/* Zoom controls */}
            <div className='absolute top-2 right-2 flex items-center gap-1 text-[10px] font-mono bg-black/50 backdrop-blur px-2 py-1 rounded-md border border-white/10'>
              <span className='text-fg-muted'>zoom {transform.scale.toFixed(2)}×</span>
              <button
                onClick={resetView}
                className='ml-1 px-1.5 py-0.5 rounded hover:bg-white/10 text-amber-300'>
                <ExpandOutlined /> reset
              </button>
            </div>
            <div className='absolute bottom-2 right-2 text-[10px] font-mono text-fg-muted bg-black/50 backdrop-blur px-2 py-1 rounded-md border border-white/10'>
              {currentCenterLabel}
            </div>
          </div>

          {/* ── Right control panel ── */}
          <div className='space-y-3'>
            {/* Run All */}
            <div className='luxe-glass p-3'>
              <p className='eyebrow-mono mb-2 text-fuchsia-300/80 font-bold'>Race the field</p>
              <Button
                variant='primary'
                block
                loading={runAllBusy}
                onClick={runAll}
                disabled={status !== 'ready' || src == null || dst == null}
                icon={<ExperimentOutlined />}
              >
                {runAllBusy ? 'Racing algorithms…' : 'Run all algorithms'}
              </Button>
              <p className='text-[11px] text-fg-muted leading-snug mt-2'>
                Runs every algorithm on the current start / end. Table + coloured overlays land below.
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
                </div>
                <p className='text-[11px] text-fg-muted leading-snug mt-1'>
                  Play/Pause animation. Reset clears state. Clear paths (or press <span className='text-amber-300'>C</span>) wipes overlays and the comparison table but keeps your pins. Random picks a fresh start/end pair.
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
                          <VerdictBadge v={r.verdict} timedOut={r.timedOut} />
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
              OpenStreetMap payload after the first time this city is warmed.
            </p>
          </div>
        )}
      </div>
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

function VerdictBadge({ v, timedOut }) {
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
function ComposerRow({
  id, which, iconDot, iconRing, placeholder, value, onChange, onFocus, onBlur,
  onKeyDown, open, suggestions, recents, highlight, setHighlight,
  onPick, query, srcNodeLatLng, disabled, helper,
}) {
  const showRecents = !value && open && recents.length > 0
  const list = showRecents ? recents : suggestions
  const showList = open && list.length > 0

  return (
    <div className='relative'>
      <div className='relative'>
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
      {showList && (
        <div className='absolute z-30 left-0 right-0 top-full mt-1 max-h-80 overflow-y-auto rounded-lg border border-line bg-[#0a0a0e]/95 backdrop-blur shadow-2xl'>
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
        </div>
      )}
      {helper && <p className='text-[11px] text-fg-muted leading-snug mt-1'>{helper}</p>}
    </div>
  )
}

// Kind → emoji glyph. Kept as a plain lookup so unknown kinds fall
// through to a neutral pin without runtime cost.
const KIND_ICON = {
  landmark:       '📍',
  suburb:         '🏘️',
  neighbourhood:  '🏙️',
  quarter:        '🏙️',
  square:         '⛲',
  town:           '🏛️',
  village:        '🏡',
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
