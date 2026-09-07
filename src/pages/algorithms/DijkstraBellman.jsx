// Dijkstra vs Bellman–Ford — same graph, side by side.
//
// Dijkstra uses a priority queue and greedily extracts the smallest
// tentative distance; only works on non-negative edges. If you toggle
// the "allow negative edges" switch, Dijkstra will happily return a
// wrong answer — we call that out explicitly so users see the failure.
//
// Bellman–Ford relaxes every edge V-1 times, so it always converges
// on a negative-cycle-free graph. On the V-th pass, if anything is
// still relaxable, we've found a negative cycle.

import { useEffect, useMemo, useState } from 'react'
import { InputNumber, Switch } from 'antd'
import {
  TopicShell, ExplanationBlock, VisualiserSection, VizPanel,
  ControlsPanel, StepControls, useStepEngine, MultiLangCode,
  ComplexityTable, RealWorldCard, Field, Chip, TeX,
} from '../../components/algorithms'
import { CODE as SP_CODE } from './code/DijkstraBellman'

function mulberry32(seed) {
  let a = (seed | 0) || 1
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const INF = 1e9

// ─── Graph ────────────────────────────────────
function genGraph(n, extra, seed, allowNeg) {
  const rng = mulberry32(seed)
  const nodes = Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2
    return { id: i, x: 200 + 130 * Math.cos(angle), y: 160 + 110 * Math.sin(angle) }
  })
  const edges = []
  const seen = new Set()
  const addEdge = (u, v, w) => {
    if (u === v) return
    const key = `${u}-${v}`
    if (seen.has(key)) return
    seen.add(key)
    edges.push({ from: u, to: v, w })
  }
  // Spanning path so graph is connected
  const perm = Array.from({ length: n }, (_, i) => i)
  for (let i = perm.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[perm[i], perm[j]] = [perm[j], perm[i]]
  }
  for (let i = 1; i < n; i++) {
    const w = Math.floor(rng() * 6) + 1
    addEdge(perm[i - 1], perm[i], w)
  }
  // Extra edges
  let added = 0
  let guard = 0
  while (added < extra && guard++ < 200) {
    const u = Math.floor(rng() * n)
    const v = Math.floor(rng() * n)
    let w = Math.floor(rng() * 8) + 1
    if (allowNeg && rng() < 0.35) w = -(Math.floor(rng() * 4) + 1)
    if (u !== v && !seen.has(`${u}-${v}`)) { addEdge(u, v, w); added++ }
  }
  return { nodes, edges }
}

// ─── Adjacency ────────────────────────────────
function buildAdj(n, edges) {
  const adj = Array.from({ length: n }, () => [])
  for (const e of edges) adj[e.from].push({ to: e.to, w: e.w, edgeIdx: edges.indexOf(e) })
  return adj
}

// ─── Dijkstra frames ──────────────────────────
function dijkstraFrames(n, edges, start) {
  const adj = buildAdj(n, edges)
  const dist = new Array(n).fill(INF); dist[start] = 0
  const parent = new Array(n).fill(-1)
  const visited = new Set()
  const heap = [{ id: start, key: 0 }]
  const frames = []
  while (heap.length) {
    heap.sort((a, b) => a.key - b.key)
    const { id: u } = heap.shift()
    if (visited.has(u)) continue
    visited.add(u)
    frames.push({ kind: 'extract', u, dist: dist.slice(), parent: parent.slice(), visited: new Set(visited), line: 4 })
    for (const { to: v, w } of adj[u]) {
      if (dist[u] + w < dist[v]) {
        dist[v] = dist[u] + w
        parent[v] = u
        heap.push({ id: v, key: dist[v] })
        frames.push({ kind: 'relax', u, v, dist: dist.slice(), parent: parent.slice(), visited: new Set(visited), line: 6 })
      }
    }
  }
  frames.push({ kind: 'done', dist: dist.slice(), parent: parent.slice(), visited: new Set(visited), line: 8 })
  return { frames, dist }
}

// ─── Bellman–Ford frames ─────────────────────
function bellmanFordFrames(n, edges, start) {
  const dist = new Array(n).fill(INF); dist[start] = 0
  const parent = new Array(n).fill(-1)
  const frames = [{ kind: 'init', dist: dist.slice(), parent: parent.slice(), line: 0, iter: 0 }]
  for (let iter = 0; iter < n - 1; iter++) {
    let changed = false
    for (const e of edges) {
      if (dist[e.from] < INF && dist[e.from] + e.w < dist[e.to]) {
        dist[e.to] = dist[e.from] + e.w
        parent[e.to] = e.from
        changed = true
        frames.push({ kind: 'relax', iter, u: e.from, v: e.to, w: e.w, dist: dist.slice(), parent: parent.slice(), line: 3 })
      }
    }
    frames.push({ kind: 'iter-end', iter, changed, dist: dist.slice(), parent: parent.slice(), line: 5 })
    if (!changed) break
  }
  // Detect negative cycle
  let negCycle = null
  for (const e of edges) {
    if (dist[e.from] < INF && dist[e.from] + e.w < dist[e.to]) {
      negCycle = { u: e.from, v: e.to }; break
    }
  }
  frames.push({ kind: 'done', dist: dist.slice(), parent: parent.slice(), line: 6, negCycle })
  return { frames, dist, negCycle }
}

const DIJKSTRA_PSEUDO = [
  'dist[start] = 0; rest = INF',
  'heap = { (start, 0) }',
  'while heap not empty:',
  '  u = extract-min(heap)',
  '  for (v, w) in adj[u]:',
  '    if dist[u] + w < dist[v]:',
  '      dist[v] = dist[u] + w',
  '      heap.push((v, dist[v]))',
]

const BF_PSEUDO = [
  'dist[start] = 0; rest = INF',
  'repeat V-1 times:',
  '  for each edge (u, v, w):',
  '    if dist[u] + w < dist[v]:',
  '      dist[v] = dist[u] + w',
  '# one more pass — if anything still relaxes, negative cycle exists',
]

function GraphSVG({ nodes, edges, frame, tone = 'amber' }) {
  const isVisited = (id) => frame?.visited?.has(id)
  const toneColor = tone === 'amber' ? '#fbbf24' : '#22d3ee'
  const rimColor = tone === 'amber' ? '#f59e0b' : '#0891b2'
  return (
    <svg viewBox='0 0 400 320' className='w-full h-auto max-h-[320px]'>
      {/* edges */}
      {edges.map((e, i) => {
        const a = nodes[e.from], b = nodes[e.to]
        const dx = b.x - a.x, dy = b.y - a.y
        const len = Math.hypot(dx, dy) || 1
        const nx = dx / len, ny = dy / len
        const t = 18
        const x2 = b.x - nx * t, y2 = b.y - ny * t
        const isInTree = frame?.parent?.[e.to] === e.from
        const isCur = frame?.u === e.from && frame?.v === e.to
        const negFlag = e.w < 0
        return (
          <g key={i}>
            <line
              x1={a.x} y1={a.y} x2={x2} y2={y2}
              stroke={isCur ? '#fb7185' : isInTree ? toneColor : negFlag ? '#f97316' : '#334155'}
              strokeWidth={isCur ? 2.4 : isInTree ? 2 : 1}
              opacity={isCur ? 1 : 0.9}
              markerEnd='url(#arrow)'
            />
            <rect
              x={(a.x + b.x) / 2 - 10}
              y={(a.y + b.y) / 2 - 8}
              width={20} height={14} rx={3}
              fill='#0f172a' stroke={negFlag ? '#f97316' : '#475569'}
            />
            <text
              x={(a.x + b.x) / 2}
              y={(a.y + b.y) / 2 + 3}
              textAnchor='middle' fontSize={9} fontFamily='ui-monospace, monospace'
              fill={negFlag ? '#fdba74' : '#e5e7eb'}
            >
              {e.w}
            </text>
          </g>
        )
      })}
      <defs>
        <marker id='arrow' viewBox='0 0 10 10' refX='9' refY='5' markerWidth='6' markerHeight='6' orient='auto-start-reverse'>
          <path d='M 0 0 L 10 5 L 0 10 z' fill='#94a3b8' />
        </marker>
      </defs>
      {/* nodes */}
      {nodes.map(n => (
        <g key={n.id}>
          <circle
            cx={n.x} cy={n.y} r={16}
            fill={frame?.u === n.id || frame?.v === n.id ? toneColor : isVisited(n.id) ? '#052e2b' : '#1f2937'}
            stroke={frame?.u === n.id ? rimColor : isVisited(n.id) ? toneColor : '#64748b'}
            strokeWidth={frame?.u === n.id ? 3 : 1.5}
          />
          <text
            x={n.x} y={n.y - 4}
            textAnchor='middle' fontSize={10} fontFamily='ui-monospace, monospace'
            fill='#e5e7eb'
          >
            {n.id}
          </text>
          <text
            x={n.x} y={n.y + 8}
            textAnchor='middle' fontSize={9} fontFamily='ui-monospace, monospace'
            fill='#34d399'
          >
            {(frame?.dist?.[n.id] ?? INF) >= INF ? '∞' : frame.dist[n.id]}
          </text>
        </g>
      ))}
    </svg>
  )
}

export default function DijkstraBellman() {
  const [n, setN] = useState(6)
  const [extra, setExtra] = useState(3)
  const [seed, setSeed] = useState(4)
  const [allowNeg, setAllowNeg] = useState(false)
  const [start, setStart] = useState(0)

  const { nodes, edges } = useMemo(() => genGraph(n, extra, seed, allowNeg), [n, extra, seed, allowNeg])

  const dj = useMemo(() => dijkstraFrames(n, edges, start), [n, edges, start])
  const bf = useMemo(() => bellmanFordFrames(n, edges, start), [n, edges, start])

  const djEng = useStepEngine({ frameCount: dj.frames.length })
  const bfEng = useStepEngine({ frameCount: bf.frames.length })

  useEffect(() => { djEng.reset(); bfEng.reset() /* eslint-disable-next-line */ }, [n, edges, start])

  const djF = dj.frames[djEng.i] || dj.frames[0]
  const bfF = bf.frames[bfEng.i] || bf.frames[0]

  const disagreement = allowNeg
    ? dj.dist.some((d, i) => (d !== bf.dist[i]) && d < INF && bf.dist[i] < INF)
    : false

  return (
    <TopicShell slug='dijkstra-bellman' title='Dijkstra & Bellman–Ford' category='Algorithms'>
      <ExplanationBlock>
        <p>
          Both algorithms compute single-source shortest paths, but with
          different trade-offs.
        </p>
        <p>
          <b>Dijkstra</b> maintains a priority queue and always extracts
          the vertex with the smallest tentative distance. That greedy
          extraction only works when edges are non-negative — otherwise
          a later relaxation could improve a supposedly-settled node.
          Runtime: <TeX tex='O((V + E) \\log V)' /> with a binary heap.
        </p>
        <p>
          <b>Bellman–Ford</b> relaxes every edge <TeX tex='V - 1' />{' '}
          times, no priority queue needed. It handles negative edges
          natively and can detect a <b>negative cycle</b> by trying one
          more relaxation pass — if anything still improves,
          you've found one. Runtime: <TeX tex='O(V \\cdot E)' />.
        </p>
        <p>
          Toggle "allow negative edges" and watch what happens: Dijkstra
          confidently returns wrong distances, while Bellman–Ford keeps
          working (or flags a negative cycle if one exists).
        </p>
      </ExplanationBlock>

      <VisualiserSection>
        <VizPanel>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <div>
              <div className='text-xs text-white/60 mb-1'>
                Dijkstra · step {djEng.i + 1}/{dj.frames.length}
                {allowNeg && <span className='ml-2 text-rose-300'>(may be wrong with negative edges)</span>}
              </div>
              <GraphSVG nodes={nodes} edges={edges} frame={djF} tone='amber' />
              <div className='text-xs text-emerald-300 font-mono mt-1'>
                dist: [{dj.dist.map(d => d >= INF ? '∞' : d).join(', ')}]
              </div>
            </div>
            <div>
              <div className='text-xs text-white/60 mb-1'>Bellman–Ford · step {bfEng.i + 1}/{bf.frames.length}</div>
              <GraphSVG nodes={nodes} edges={edges} frame={bfF} tone='cyan' />
              <div className='text-xs text-emerald-300 font-mono mt-1'>
                dist: [{bf.dist.map(d => d >= INF ? '∞' : d).join(', ')}]
                {bf.negCycle && <span className='ml-2 text-rose-300'>· negative cycle detected!</span>}
              </div>
            </div>
          </div>
          {disagreement && (
            <div className='mt-3 text-xs text-rose-300 font-mono bg-rose-500/10 border border-rose-500/30 rounded-md p-2'>
              Dijkstra disagrees with Bellman–Ford on at least one node — that's the negative-edge failure mode.
            </div>
          )}
        </VizPanel>
        <ControlsPanel>
          <Field label='Nodes'>
            <InputNumber min={4} max={10} value={n} onChange={v => setN(v || 4)} className='w-full' />
          </Field>
          <Field label='Extra edges'>
            <InputNumber min={0} max={12} value={extra} onChange={v => setExtra(v ?? 0)} className='w-full' />
          </Field>
          <Field label='Seed'>
            <InputNumber min={0} max={9999} value={seed} onChange={v => setSeed(v || 0)} className='w-full' />
          </Field>
          <Field label='Start node'>
            <InputNumber min={0} max={n - 1} value={start} onChange={v => setStart(v ?? 0)} className='w-full' />
          </Field>
          <Field label='Allow negative edges' helper='Dijkstra will silently give wrong answers.'>
            <Switch checked={allowNeg} onChange={setAllowNeg} />
          </Field>
          <StepControls
            playing={djEng.playing || bfEng.playing}
            onPlay={() => { djEng.play(); bfEng.play() }}
            onPause={() => { djEng.pause(); bfEng.pause() }}
            onStep={() => { djEng.step(); bfEng.step() }}
            onReset={() => { djEng.reset(); bfEng.reset() }}
            speed={djEng.speed}
            onSpeed={(v) => { djEng.setSpeed(v); bfEng.setSpeed(v) }}
          />
        </ControlsPanel>
      </VisualiserSection>

      <MultiLangCode title='Dijkstra (priority queue)' code={SP_CODE.dijkstra} />
      <MultiLangCode title='Bellman–Ford (with negative-cycle detection)' code={SP_CODE.bellman} />

      <ComplexityTable rows={[
        { op: 'Dijkstra (binary heap)', best: 'O((V+E) \\log V)', avg: 'O((V+E) \\log V)', worst: 'O((V+E) \\log V)', space: 'O(V+E)' },
        { op: 'Dijkstra (Fibonacci heap)', best: 'O(V \\log V + E)', avg: 'O(V \\log V + E)', worst: 'O(V \\log V + E)', space: 'O(V+E)' },
        { op: 'Bellman–Ford',            best: 'O(V+E)',          avg: 'O(VE)',            worst: 'O(VE)',            space: 'O(V+E)' },
        { op: 'SPFA (Bellman variant)',  best: 'O(V+E)',          avg: 'O(kE)',            worst: 'O(VE)',            space: 'O(V+E)' },
      ]} />

      <RealWorldCard>
        <p>
          Dijkstra powers virtually every routing engine you touch:
          Google Maps, OSRM, Uber's dispatch. Real deployments use
          contraction hierarchies or A* on top for speed, but Dijkstra
          is the correctness reference.
        </p>
        <p>
          Bellman–Ford is the algorithm behind distance-vector routing
          (RIP), currency arbitrage detection (negative cycle == free
          money), and any graph problem with negative "costs" (rewards,
          discounts).
        </p>
      </RealWorldCard>
    </TopicShell>
  )
}
