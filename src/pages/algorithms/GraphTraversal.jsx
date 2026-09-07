// BFS + DFS — same graph, side by side. Queue / stack shown alongside.
//
// Graph is generated as a random connected graph on N nodes with a
// user-chosen edge density. Layouts use a simple ring for readability
// (spring layout is nice but a distraction here).

import { useEffect, useMemo, useState } from 'react'
import { InputNumber } from 'antd'
import {
  TopicShell, ExplanationBlock, VisualiserSection, VizPanel,
  ControlsPanel, StepControls, useStepEngine, PseudocodeBlock,
  ComplexityTable, RealWorldCard, Field, Chip, TeX,
} from '../../components/algorithms'

function mulberry32(seed) {
  let a = (seed | 0) || 1
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Build a random connected graph — spanning tree + extra edges.
function genGraph(n, extraEdges, seed) {
  const rng = mulberry32(seed)
  const nodes = Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2
    return { id: i, x: 200 + 130 * Math.cos(angle), y: 160 + 110 * Math.sin(angle) }
  })
  const adj = Array.from({ length: n }, () => new Set())
  const shuffled = Array.from({ length: n }, (_, i) => i)
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  for (let i = 1; i < n; i++) {
    const parent = shuffled[Math.floor(rng() * i)]
    adj[shuffled[i]].add(parent)
    adj[parent].add(shuffled[i])
  }
  let added = 0
  while (added < extraEdges) {
    const a = Math.floor(rng() * n)
    const b = Math.floor(rng() * n)
    if (a !== b && !adj[a].has(b)) {
      adj[a].add(b); adj[b].add(a); added++
    }
  }
  return { nodes, adj: adj.map(s => Array.from(s).sort((a, b) => a - b)) }
}

// ─── BFS + DFS frame builders ─────────────────
function bfsFrames(adj, start) {
  const visited = new Set()
  const q = [start]
  const parent = new Map()
  parent.set(start, -1)
  const frames = []
  const order = []
  while (q.length) {
    const u = q.shift()
    if (visited.has(u)) continue
    visited.add(u)
    order.push(u)
    frames.push({ kind: 'visit', u, visited: new Set(visited), q: q.slice(), order: order.slice(), parent: new Map(parent), line: 3 })
    for (const v of adj[u]) {
      if (!visited.has(v) && !q.includes(v)) {
        q.push(v)
        parent.set(v, u)
        frames.push({ kind: 'enqueue', u, v, visited: new Set(visited), q: q.slice(), order: order.slice(), parent: new Map(parent), line: 6 })
      }
    }
  }
  frames.push({ kind: 'done', visited: new Set(visited), q: [], order: order.slice(), parent, line: 8 })
  return frames
}

function dfsFrames(adj, start) {
  const visited = new Set()
  const stack = [start]
  const parent = new Map()
  parent.set(start, -1)
  const frames = []
  const order = []
  while (stack.length) {
    const u = stack.pop()
    if (visited.has(u)) continue
    visited.add(u)
    order.push(u)
    frames.push({ kind: 'visit', u, visited: new Set(visited), stack: stack.slice(), order: order.slice(), parent: new Map(parent), line: 3 })
    for (let k = adj[u].length - 1; k >= 0; k--) {
      const v = adj[u][k]
      if (!visited.has(v)) {
        stack.push(v)
        if (!parent.has(v)) parent.set(v, u)
        frames.push({ kind: 'push', u, v, visited: new Set(visited), stack: stack.slice(), order: order.slice(), parent: new Map(parent), line: 6 })
      }
    }
  }
  frames.push({ kind: 'done', visited: new Set(visited), stack: [], order: order.slice(), parent, line: 8 })
  return frames
}

const BFS_PSEUDO = [
  'visited = {}',
  'queue = [start]',
  'while queue not empty:',
  '  u = queue.dequeue()',
  '  visited.add(u)',
  '  for v in adj[u]:',
  '    if v not in visited: queue.enqueue(v)',
  '# order = level-by-level',
]

const DFS_PSEUDO = [
  'visited = {}',
  'stack = [start]',
  'while stack not empty:',
  '  u = stack.pop()',
  '  visited.add(u)',
  '  for v in adj[u]:',
  '    if v not in visited: stack.push(v)',
  '# order = deep-first',
]

function GraphSVG({ nodes, adj, frame, tone = 'amber' }) {
  const isVisited = (id) => frame?.visited?.has(id)
  const isCurrent = (id) => frame?.u === id
  const isFrontier = (id) => (frame?.q || frame?.stack || []).includes(id)
  const toneColor = tone === 'amber' ? '#fbbf24' : '#22d3ee'
  return (
    <svg viewBox='0 0 400 320' className='w-full h-auto max-h-[320px]'>
      {/* edges */}
      {nodes.map(u => adj[u.id].map(vId => {
        if (u.id > vId) return null
        const v = nodes[vId]
        const inTree = frame?.parent?.get(u.id) === vId || frame?.parent?.get(vId) === u.id
        return (
          <line
            key={`${u.id}-${vId}`}
            x1={u.x} y1={u.y} x2={v.x} y2={v.y}
            stroke={inTree ? toneColor : '#334155'}
            strokeWidth={inTree ? 2 : 1}
            opacity={inTree ? 0.95 : 0.55}
          />
        )
      }))}
      {/* nodes */}
      {nodes.map(n => (
        <g key={n.id}>
          <circle
            cx={n.x} cy={n.y} r={16}
            fill={isCurrent(n.id) ? toneColor : isVisited(n.id) ? '#052e2b' : '#1f2937'}
            stroke={isFrontier(n.id) ? '#fb7185' : isVisited(n.id) ? toneColor : '#64748b'}
            strokeWidth={isCurrent(n.id) || isFrontier(n.id) ? 2.5 : 1.5}
          />
          <text
            x={n.x} y={n.y + 4}
            textAnchor='middle' fontSize={11} fontFamily='ui-monospace, monospace'
            fill={isCurrent(n.id) ? '#000' : '#e5e7eb'}
          >
            {n.id}
          </text>
        </g>
      ))}
    </svg>
  )
}

function FrontierList({ label, items, tone }) {
  const color = tone === 'rose' ? 'text-rose-300 border-rose-300/40 bg-rose-400/10' : 'text-cyan-300 border-cyan-300/40 bg-cyan-400/10'
  return (
    <div className='mt-2'>
      <div className='text-[10px] uppercase tracking-widest text-white/45 mb-1'>{label} [{items.length}]</div>
      <div className='flex flex-wrap gap-1'>
        {items.length === 0
          ? <span className='text-xs text-white/40 italic'>empty</span>
          : items.map((v, i) => (
              <span key={i} className={`rounded border font-mono text-xs px-2 py-0.5 ${color}`}>{v}</span>
            ))
        }
      </div>
    </div>
  )
}

function OrderList({ order }) {
  return (
    <div className='mt-2'>
      <div className='text-[10px] uppercase tracking-widest text-white/45 mb-1'>visit order</div>
      <div className='text-xs font-mono text-emerald-300'>{order.join(' → ') || '—'}</div>
    </div>
  )
}

export default function GraphTraversal() {
  const [n, setN] = useState(8)
  const [seed, setSeed] = useState(3)
  const [extra, setExtra] = useState(3)
  const [start, setStart] = useState(0)
  const { nodes, adj } = useMemo(() => genGraph(n, extra, seed), [n, seed, extra])
  useEffect(() => { if (start >= n) setStart(0) }, [n, start])
  const bfsAll = useMemo(() => bfsFrames(adj, start), [adj, start])
  const dfsAll = useMemo(() => dfsFrames(adj, start), [adj, start])

  const bfsEng = useStepEngine({ frameCount: bfsAll.length })
  const dfsEng = useStepEngine({ frameCount: dfsAll.length })

  useEffect(() => { bfsEng.reset(); dfsEng.reset() /* eslint-disable-next-line */ }, [adj, start])

  const bfsF = bfsAll[bfsEng.i] || bfsAll[0]
  const dfsF = dfsAll[dfsEng.i] || dfsAll[0]

  return (
    <TopicShell slug='graph-traversal' title='BFS & DFS' category='Algorithms'>
      <ExplanationBlock>
        <p>
          BFS and DFS are the same skeleton — mark visited, expand
          neighbours — with different frontier data structures. BFS uses
          a <b>queue</b> (FIFO), so it visits level-by-level. DFS uses a
          <b> stack</b> (LIFO), so it drills all the way down one branch
          before backtracking.
        </p>
        <p>
          Both run in <TeX tex='O(V + E)' /> on adjacency lists. Below,
          both run from the same start node on the same random graph —
          watch how the two frontiers diverge.
        </p>
      </ExplanationBlock>

      <VisualiserSection>
        <VizPanel>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <div>
              <div className='text-xs text-white/60 mb-1'>BFS · step {bfsEng.i + 1}/{bfsAll.length}</div>
              <GraphSVG nodes={nodes} adj={adj} frame={bfsF} tone='amber' />
              <FrontierList label='queue' items={bfsF?.q || []} tone='rose' />
              <OrderList order={bfsF?.order || []} />
            </div>
            <div>
              <div className='text-xs text-white/60 mb-1'>DFS · step {dfsEng.i + 1}/{dfsAll.length}</div>
              <GraphSVG nodes={nodes} adj={adj} frame={dfsF} tone='cyan' />
              <FrontierList label='stack' items={dfsF?.stack || []} tone='cyan' />
              <OrderList order={dfsF?.order || []} />
            </div>
          </div>
        </VizPanel>
        <ControlsPanel>
          <Field label='Node count'>
            <InputNumber min={4} max={16} value={n} onChange={v => setN(v || 4)} className='w-full' />
          </Field>
          <Field label='Extra edges' helper='On top of a spanning tree.'>
            <InputNumber min={0} max={20} value={extra} onChange={v => setExtra(v ?? 0)} className='w-full' />
          </Field>
          <Field label='Seed'>
            <InputNumber min={0} max={9999} value={seed} onChange={v => setSeed(v || 0)} className='w-full' />
          </Field>
          <Field label='Start node'>
            <InputNumber min={0} max={n - 1} value={start} onChange={v => setStart(v ?? 0)} className='w-full' />
          </Field>
          <StepControls
            playing={bfsEng.playing || dfsEng.playing}
            onPlay={() => { bfsEng.play(); dfsEng.play() }}
            onPause={() => { bfsEng.pause(); dfsEng.pause() }}
            onStep={() => { bfsEng.step(); dfsEng.step() }}
            onReset={() => { bfsEng.reset(); dfsEng.reset() }}
            speed={bfsEng.speed}
            onSpeed={(v) => { bfsEng.setSpeed(v); dfsEng.setSpeed(v) }}
          />
        </ControlsPanel>
      </VisualiserSection>

      <PseudocodeBlock lines={BFS_PSEUDO} activeLine={bfsF?.line ?? -1} title='BFS — pseudocode' />
      <PseudocodeBlock lines={DFS_PSEUDO} activeLine={dfsF?.line ?? -1} title='DFS — pseudocode' />

      <ComplexityTable rows={[
        { op: 'BFS',                   best: 'O(V+E)', avg: 'O(V+E)', worst: 'O(V+E)', space: 'O(V)' },
        { op: 'DFS (iterative)',       best: 'O(V+E)', avg: 'O(V+E)', worst: 'O(V+E)', space: 'O(V)' },
        { op: 'DFS (recursive)',       best: 'O(V+E)', avg: 'O(V+E)', worst: 'O(V+E)', space: 'O(V)' },
        { op: 'BFS shortest path (unweighted)', best: 'O(V+E)', avg: 'O(V+E)', worst: 'O(V+E)', space: 'O(V)' },
      ]} />

      <RealWorldCard>
        <p>
          BFS is the go-to for shortest-hop distances on unweighted
          graphs — 6 degrees of Kevin Bacon, "friend of a friend"
          suggestions, Rubik's cube solvers. It also underpins the
          layer-by-layer BFS in graph databases like Neo4j.
        </p>
        <p>
          DFS is the workhorse for topological sort, cycle detection,
          strongly-connected components (Tarjan / Kosaraju), and every
          "find a path" problem where you don't need the shortest one.
        </p>
      </RealWorldCard>
    </TopicShell>
  )
}
