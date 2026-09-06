// Pathfinding Lab — Bangalore Roads.
//
// Browser-only pathfinding visualizer running over a real OpenStreetMap
// road graph of central Bangalore. On first load we fetch the graph from
// the Overpass API, parse it into { nodes, adj } with haversine-weighted
// edges (respecting oneway=yes), and cache the whole thing in IndexedDB
// via idb-keyval so the second visit boots instantly.
//
// Five algorithms implemented as JS generators so we can consume N pops
// per frame (slider controlled) inside a requestAnimationFrame loop:
//   Dijkstra, A*, BFS, DFS, Bidirectional Dijkstra.
//
// Rendering: plate carrée projection (safe at Bangalore's latitude, no
// mercator warping needed for a ~15 km viewport). The base road network
// is batched into a single Path2D so we can stroke ALL edges in one
// canvas call per frame — 10-20x faster than per-edge beginPath+stroke.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Segmented, Slider } from 'antd'
import {
  PlayCircleFilled, PauseCircleFilled, ReloadOutlined,
  NodeIndexOutlined, ThunderboltFilled, EnvironmentFilled,
  AimOutlined, SwapOutlined,
} from '@ant-design/icons'
import { get as idbGet, set as idbSet } from 'idb-keyval'

// ─── Constants ────────────────────────────────────────────────
const BLR_CENTER = { lat: 12.9716, lng: 77.5946 }
const BBOX = { south: 12.90, west: 77.54, north: 13.02, east: 77.68 }
const CACHE_KEY = 'sid-blr-road-graph-v1'
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const OVERPASS_QL = `[out:json][timeout:60][bbox:${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}];
way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential)$"];
(._;>;);
out body;`

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

// ─── Fetch + parse Overpass into { nodes: Map, adj: Map } ─────
// nodes: id -> { lat, lng }
// adj:   id -> Array<{ to, w }>   w in meters
async function fetchRoadGraph() {
  const body = new URLSearchParams({ data: OVERPASS_QL }).toString()
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`)
  const json = await res.json()
  return parseOverpass(json)
}

function parseOverpass(json) {
  const nodes = new Map()
  const adj = new Map()
  // First pass — collect all node positions.
  for (const el of json.elements) {
    if (el.type === 'node') {
      nodes.set(el.id, { lat: el.lat, lng: el.lon })
    }
  }
  // Second pass — walk each way, add edges between consecutive nodes.
  for (const el of json.elements) {
    if (el.type !== 'way' || !el.nodes) continue
    const oneway = el.tags?.oneway === 'yes' || el.tags?.oneway === 'true' || el.tags?.oneway === '1'
    for (let i = 0; i < el.nodes.length - 1; i++) {
      const a = el.nodes[i]
      const b = el.nodes[i + 1]
      const na = nodes.get(a), nb = nodes.get(b)
      if (!na || !nb) continue
      const w = haversine(na, nb)
      if (!adj.has(a)) adj.set(a, [])
      adj.get(a).push({ to: b, w })
      if (!oneway) {
        if (!adj.has(b)) adj.set(b, [])
        adj.get(b).push({ to: a, w })
      }
    }
  }
  return { nodes, adj }
}

// idb-keyval stores Maps directly, but to be safe we serialize to arrays
// so a cross-browser JSON dump also works if we ever need to inspect.
async function loadCachedGraph() {
  const raw = await idbGet(CACHE_KEY)
  if (!raw) return null
  const nodes = new Map(raw.nodes)
  const adj = new Map(raw.adj)
  return { nodes, adj }
}

async function saveCachedGraph({ nodes, adj }) {
  const payload = { nodes: [...nodes.entries()], adj: [...adj.entries()] }
  await idbSet(CACHE_KEY, payload)
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
// event, so the renderer can colour the map. Every yield is ONE pop.

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
  const h = (id) => {
    const n = nodes.get(id)
    return haversine(n, goal)
  }
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

  while (heapF.size && heapB.size) {
    // Advance the smaller frontier for balance.
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
    // Termination — when the sum of top keys ≥ best, we're done.
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

// ─── Reverse graph builder for bidirectional Dijkstra ─────────
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
  // Walk prevB from meet to dst (prevB.get(x) gives the neighbour closer to dst).
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
    m += haversine(nodes.get(path[i]), nodes.get(path[i + 1]))
  }
  return m / 1000
}

// ─── Nearest node to a lat/lng click ───────────────────────────
// Cheap linear scan — the network is ~10k nodes so it's still fast.
function nearestNode(nodes, lat, lng) {
  let bestId = null, best = Infinity
  for (const [id, n] of nodes) {
    const dLat = n.lat - lat, dLng = n.lng - lng
    const d2 = dLat * dLat + dLng * dLng
    if (d2 < best) { best = d2; bestId = id }
  }
  return bestId
}

// ─── Algorithm metadata ───────────────────────────────────────
const ALGO_INFO = {
  dijkstra:      { name: 'Dijkstra',              tc: 'O((V+E) log V)', desc: 'Uniform-cost search — expands radially by distance.' },
  astar:         { name: 'A*',                    tc: 'O((V+E) log V)', desc: 'Heuristic-guided — pulls toward the goal.' },
  bfs:           { name: 'BFS',                   tc: 'O(V+E)',         desc: 'Level-by-level wave — hop-count, not distance.' },
  dfs:           { name: 'DFS',                   tc: 'O(V+E)',         desc: 'Depth-first probe — rarely optimal.' },
  bidirectional: { name: 'Bidirectional Dijkstra', tc: 'O((V+E) log V)', desc: 'Two frontiers race and meet — typically ~½ the work.' },
}

// ─── Main component ──────────────────────────────────────────
export default function Pathfinding() {
  const [status, setStatus] = useState('boot') // boot | fetching | ready | error
  const [error, setError] = useState('')
  const [algo, setAlgo] = useState('dijkstra')
  const [running, setRunning] = useState(false)
  const [speed, setSpeed] = useState(120)  // steps per frame
  const [src, setSrc] = useState(null)
  const [dst, setDst] = useState(null)
  const [tele, setTele] = useState({ visited: 0, ms: 0, pathKm: 0, pathN: 0, done: false, found: false })

  const graphRef        = useRef(null)   // { nodes, adj }
  const revAdjRef       = useRef(null)
  const canvasRef       = useRef(null)
  const projRef         = useRef(null)   // { xOf, yOf, dpr, w, h }
  const basePathRef     = useRef(null)   // Path2D of the whole road network
  const genRef          = useRef(null)
  const visitedSetRef   = useRef(new Set())
  const visitedListRef  = useRef([])
  const frontierRef     = useRef(new Set())  // ids currently in heap/queue
  const pathRef         = useRef(null)   // Array<id> once solved
  const startTsRef      = useRef(0)
  const rafRef          = useRef(null)
  const bidiSideRef     = useRef(new Map()) // id -> 'F' | 'B' (for colouring)

  // ── Boot: try cache → else fetch Overpass → else error ──
  useEffect(() => {
    document.title = 'Pathfinding Lab · Sid'
    let cancelled = false
    ;(async () => {
      try {
        setStatus('boot')
        let g = await loadCachedGraph()
        if (!g) {
          if (cancelled) return
          setStatus('fetching')
          g = await fetchRoadGraph()
          if (cancelled) return
          await saveCachedGraph(g)
        }
        if (cancelled) return
        graphRef.current = g
        revAdjRef.current = buildReverseAdj(g.adj)
        // Seed some sensible defaults so the map isn't blank.
        const ids = [...g.nodes.keys()]
        const s = ids[Math.floor(ids.length * 0.25)]
        const d = ids[Math.floor(ids.length * 0.75)]
        setSrc(s); setDst(d)
        setStatus('ready')
      } catch (e) {
        console.error(e)
        setError(e.message || String(e))
        setStatus('error')
      }
    })()
    return () => { cancelled = true }
  }, [])

  // ── Build the projection + base Path2D once the graph is ready ──
  useEffect(() => {
    if (status !== 'ready') return
    resizeAndProject()
    const onResize = () => { resizeAndProject(); requestFrame() }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  function resizeAndProject() {
    const canvas = canvasRef.current
    const g = graphRef.current
    if (!canvas || !g) return
    const parent = canvas.parentElement
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = parent.clientWidth, h = parent.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // Plate carrée — flat lat/lng scaled to fit the bbox with a small
    // aspect correction (cos(lat)) so E-W and N-S scales look right.
    const cosLat = Math.cos(((BBOX.south + BBOX.north) / 2) * Math.PI / 180)
    const bbW = (BBOX.east - BBOX.west) * cosLat
    const bbH = BBOX.north - BBOX.south
    const scale = Math.min(w / bbW, h / bbH) * 0.98
    const offX = (w - bbW * scale) / 2
    const offY = (h - bbH * scale) / 2

    const xOf = (lng) => offX + (lng - BBOX.west) * cosLat * scale
    const yOf = (lat) => offY + (BBOX.north - lat) * scale
    projRef.current = { xOf, yOf, dpr, w, h, scale }

    // Batch the base road network into ONE Path2D.
    const base = new Path2D()
    for (const [u, edges] of g.adj) {
      const nu = g.nodes.get(u)
      if (!nu) continue
      const ux = xOf(nu.lng), uy = yOf(nu.lat)
      for (const { to: v } of edges) {
        const nv = g.nodes.get(v)
        if (!nv) continue
        base.moveTo(ux, uy)
        base.lineTo(xOf(nv.lng), yOf(nv.lat))
      }
    }
    basePathRef.current = base
  }

  // ── Rebuild generator whenever algo / src / dst changes ──
  useEffect(() => {
    if (status !== 'ready' || src == null || dst == null) return
    resetRun()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, algo, src, dst])

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

    if (algo === 'dijkstra')          genRef.current = dijkstra(g.adj, src, dst)
    else if (algo === 'astar')        genRef.current = astar(g.adj, g.nodes, src, dst)
    else if (algo === 'bfs')          genRef.current = bfs(g.adj, src, dst)
    else if (algo === 'dfs')          genRef.current = dfs(g.adj, src, dst)
    else if (algo === 'bidirectional') genRef.current = bidirectional(g.adj, revAdjRef.current, src, dst)
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
        if (algo === 'bidirectional') {
          path = reconstructBidi(resultNow.prevF, resultNow.prevB, src, dst, resultNow.meet)
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
      draw() // one more with the final path drawn
      return
    }

    // Update telemetry live at ~10 Hz cadence.
    if (running) {
      setTele((t) => ({
        ...t,
        visited: visitedListRef.current.length,
        ms: Math.round(ts - startTsRef.current),
      }))
      requestFrame()
    }
  }

  // Kick RAF back on when running flips true.
  useEffect(() => {
    if (running) requestFrame()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  // Redraw once when we're paused so the UI reflects changes.
  useEffect(() => {
    if (status === 'ready') draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, src, dst, algo])

  // ── Rendering ──
  function draw() {
    const canvas = canvasRef.current
    const proj = projRef.current
    const g = graphRef.current
    if (!canvas || !proj || !g) return
    const ctx = canvas.getContext('2d')
    const { w, h, xOf, yOf } = proj

    // Background
    ctx.fillStyle = '#05050a'
    ctx.fillRect(0, 0, w, h)

    // Base road network — one Path2D, one stroke call. Fast.
    ctx.lineWidth = 0.6
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.stroke(basePathRef.current)

    // Visited (settled) — subtle white/side-tinted dots.
    const visited = visitedListRef.current
    ctx.lineWidth = 1
    if (visited.length) {
      // Batch per colour category.
      const batchWhite = new Path2D()
      const batchF = new Path2D()
      const batchB = new Path2D()
      for (let i = 0; i < visited.length; i++) {
        const id = visited[i]
        const n = g.nodes.get(id)
        if (!n) continue
        const x = xOf(n.lng), y = yOf(n.lat)
        const side = bidiSideRef.current.get(id)
        const p = side === 'F' ? batchF : side === 'B' ? batchB : batchWhite
        p.moveTo(x + 1.4, y)
        p.arc(x, y, 1.4, 0, Math.PI * 2)
      }
      ctx.fillStyle = 'rgba(230,230,230,0.35)'
      ctx.fill(batchWhite)
      ctx.fillStyle = 'rgba(34,211,238,0.55)'
      ctx.fill(batchF)
      ctx.fillStyle = 'rgba(244,114,182,0.55)'
      ctx.fill(batchB)
    }

    // Final path — amber, thick.
    if (pathRef.current) {
      ctx.strokeStyle = 'rgba(251,191,36,0.95)'
      ctx.lineWidth = 2.8
      ctx.beginPath()
      const p = pathRef.current
      for (let i = 0; i < p.length; i++) {
        const n = g.nodes.get(p[i])
        if (!n) continue
        const x = xOf(n.lng), y = yOf(n.lat)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }

    // Source + destination markers.
    const drawMarker = (id, color, ring) => {
      if (id == null) return
      const n = g.nodes.get(id)
      if (!n) return
      const x = xOf(n.lng), y = yOf(n.lat)
      ctx.fillStyle = color
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = ring
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.stroke()
    }
    drawMarker(src, '#22c55e', 'rgba(34,197,94,0.5)')
    drawMarker(dst, '#ef4444', 'rgba(239,68,68,0.5)')
  }

  // ── Canvas click → place src / dst ──
  const [placeMode, setPlaceMode] = useState('src') // 'src' | 'dst'
  function onCanvasClick(e) {
    const g = graphRef.current
    const proj = projRef.current
    if (!g || !proj) return
    const rect = canvasRef.current.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    // Invert plate carrée.
    const cosLat = Math.cos(((BBOX.south + BBOX.north) / 2) * Math.PI / 180)
    const bbW = (BBOX.east - BBOX.west) * cosLat
    const bbH = BBOX.north - BBOX.south
    const scale = Math.min(rect.width / bbW, rect.height / bbH) * 0.98
    const offX = (rect.width - bbW * scale) / 2
    const offY = (rect.height - bbH * scale) / 2
    const lng = ((px - offX) / scale) / cosLat + BBOX.west
    const lat = BBOX.north - (py - offY) / scale
    const id = nearestNode(g.nodes, lat, lng)
    if (id == null) return
    if (placeMode === 'src') { setSrc(id); setPlaceMode('dst') }
    else { setDst(id); setPlaceMode('src') }
  }

  function randomize() {
    const g = graphRef.current
    if (!g) return
    const ids = [...g.nodes.keys()]
    const s = ids[Math.floor(Math.random() * ids.length)]
    let d = ids[Math.floor(Math.random() * ids.length)]
    if (d === s) d = ids[(ids.indexOf(s) + Math.floor(ids.length / 2)) % ids.length]
    setSrc(s); setDst(d)
  }

  const info = ALGO_INFO[algo]

  // ─── Render ────────────────────────────────────────────────
  return (
    <div className='min-h-screen bg-[var(--luxe-bg-base)] text-fg-primary pt-24 sm:pt-28 pb-16 px-3 sm:px-6'
         style={{ fontVariantNumeric: 'tabular-nums' }}>
      <div className='max-w-7xl mx-auto'>
        <header className='mb-6'>
          <p className='eyebrow-mono mb-2 text-amber-300/80 flex items-center gap-2'>
            <NodeIndexOutlined /> — Amazing Engineering · Pathfinding Lab
          </p>
          <h1 className='text-3xl sm:text-4xl font-bold gradient-text-amber leading-tight'>
            Pathfinding Lab · Bangalore Roads
          </h1>
          <p className='text-sm text-fg-muted mt-1 max-w-3xl'>
            Five algorithms racing through OSM road data. Click the map to set start/end. Watch how each
            algorithm thinks — Dijkstra sweeps radially, A* pulls toward the goal, BFS explores in waves.
          </p>
        </header>

        {/* Layout — canvas ~60% desktop, right panel ~40%; stacks on mobile. */}
        <div className='grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4'>
          {/* ── Canvas panel ── */}
          <div className='luxe-glass overflow-hidden relative'
               style={{ height: 'min(72vh, 640px)' }}>
            {status !== 'ready' && (
              <div className='absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 bg-black/40 backdrop-blur-sm'>
                {status === 'error' ? (
                  <>
                    <div className='text-rose-300 text-sm'>Failed to load Bangalore road graph</div>
                    <div className='text-[11px] font-mono text-fg-muted max-w-md text-center px-6'>{error}</div>
                  </>
                ) : (
                  <>
                    <div className='w-10 h-10 border-2 border-amber-300 border-t-transparent rounded-full animate-spin' />
                    <div className='text-sm text-amber-200'>
                      {status === 'fetching' ? 'Fetching OSM road network…' : 'Loading cached graph…'}
                    </div>
                    <div className='text-[11px] font-mono text-fg-muted'>
                      {status === 'fetching' ? 'One-time · ~2-5 MB · cached in IndexedDB' : ''}
                    </div>
                  </>
                )}
              </div>
            )}
            <canvas
              ref={canvasRef}
              onClick={onCanvasClick}
              style={{ display: 'block', width: '100%', height: '100%', cursor: 'crosshair' }}
            />
            {/* Legend */}
            <div className='absolute top-2 left-2 flex flex-wrap gap-2 text-[10px] font-mono px-3 py-1.5 rounded-lg bg-black/50 backdrop-blur border border-white/10'>
              <span className='flex items-center gap-1'><span className='w-2 h-2 rounded-full bg-emerald-400' /> Start</span>
              <span className='flex items-center gap-1'><span className='w-2 h-2 rounded-full bg-rose-500' /> End</span>
              <span className='flex items-center gap-1'><span className='w-2 h-2 rounded-full bg-cyan-300' /> Visited</span>
              <span className='flex items-center gap-1'><span className='w-2 h-2 rounded-full bg-amber-300' /> Path</span>
            </div>
            <div className='absolute bottom-2 right-2 text-[10px] font-mono text-fg-muted bg-black/50 backdrop-blur px-2 py-1 rounded-md border border-white/10'>
              {BLR_CENTER.lat.toFixed(4)}°N · {BLR_CENTER.lng.toFixed(4)}°E
            </div>
          </div>

          {/* ── Right control panel ── */}
          <div className='space-y-3'>
            {/* Algorithm picker */}
            <div className='luxe-glass p-3'>
              <p className='eyebrow-mono mb-2 text-cyan-300/80'>— Algorithm</p>
              <Segmented
                size='small'
                value={algo}
                onChange={setAlgo}
                block
                options={[
                  { label: 'Dijkstra', value: 'dijkstra' },
                  { label: 'A*',       value: 'astar' },
                  { label: 'BFS',      value: 'bfs' },
                  { label: 'DFS',      value: 'dfs' },
                  { label: 'Bidi',     value: 'bidirectional' },
                ]}
              />
              <p className='text-[11px] text-fg-muted leading-snug mt-1'>
                Dijkstra: shortest cost. A*: heuristic-guided. BFS: fewest edges. DFS: depth. Bidi: two-ended.
              </p>
              <div className='mt-2 text-[11px] leading-snug text-fg-muted'>
                <span className='text-amber-300 font-semibold'>{info.name}</span> · {info.tc}
                <div className='mt-0.5 text-fg-dim'>{info.desc}</div>
              </div>
            </div>

            {/* Controls */}
            <div className='luxe-glass p-3 space-y-3'>
              <div>
                <div className='flex flex-wrap items-center gap-2'>
                  <button
                    onClick={() => setRunning(r => !r)}
                    disabled={status !== 'ready' || tele.done || src == null || dst == null}
                    className='luxe-btn luxe-btn-primary text-xs disabled:opacity-40'>
                    {running ? <><PauseCircleFilled /> Pause</> : <><PlayCircleFilled /> Play</>}
                  </button>
                  <button
                    onClick={resetRun}
                    disabled={status !== 'ready'}
                    className='luxe-btn luxe-btn-secondary text-xs disabled:opacity-40'>
                    <ReloadOutlined /> Reset
                  </button>
                  <button
                    onClick={randomize}
                    disabled={status !== 'ready'}
                    className='luxe-btn luxe-btn-secondary text-xs disabled:opacity-40'>
                    <SwapOutlined /> Random
                  </button>
                </div>
                <p className='text-[11px] text-fg-muted leading-snug mt-1'>
                  Play/Pause animation. Reset clears state. Random picks fresh start/end.
                </p>
              </div>

              <div>
                <div className='flex items-center justify-between text-[11px] mb-0.5'>
                  <span className='text-fg-muted'>Steps per frame</span>
                  <span className='font-mono text-amber-300'>{speed}</span>
                </div>
                <Slider min={1} max={500} step={1} value={speed} onChange={setSpeed} tooltip={{ open: false }} />
                <p className='text-[11px] text-fg-muted leading-snug mt-1'>
                  Nodes expanded per animation frame. Higher = faster traversal.
                </p>
              </div>

              <div className='text-[11px] text-fg-muted'>
                Click on the map to place
                <button
                  onClick={() => setPlaceMode('src')}
                  className={`mx-1 px-1.5 py-0.5 rounded ${placeMode === 'src' ? 'bg-emerald-500/20 text-emerald-300' : 'text-fg-dim hover:text-fg-muted'}`}>
                  <EnvironmentFilled /> start
                </button>
                or
                <button
                  onClick={() => setPlaceMode('dst')}
                  className={`mx-1 px-1.5 py-0.5 rounded ${placeMode === 'dst' ? 'bg-rose-500/20 text-rose-300' : 'text-fg-dim hover:text-fg-muted'}`}>
                  <AimOutlined /> end
                </button>
                — next click auto-swaps.
              </div>
            </div>

            {/* Telemetry */}
            <div className='luxe-glass p-3'>
              <div className='flex items-center gap-2 mb-2'>
                <ThunderboltFilled className='text-amber-300' />
                <p className='eyebrow-mono text-amber-300/80'>— Live telemetry</p>
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
