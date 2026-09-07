// Topological Sort — Kahn's algorithm + DFS post-order side-by-side.
//
// Kahn's: repeatedly remove a node with in-degree 0.
// DFS: run DFS; on finish, push node onto a stack; reversed stack is
// the topological order.
//
// Both fail on cyclic graphs. Kahn's detects it: if we can't remove
// all nodes, there's a cycle. DFS detects it: on a back edge to a
// node currently on the recursion stack, we've found a cycle.

import { useEffect, useMemo, useState } from 'react'
import { InputNumber, Switch } from 'antd'
import { ExplanationBlock, VisualiserSection, VizPanel,
  ControlsPanel, StepControls, useStepEngine, MultiLangCode,
  ComplexityTable, RealWorldCard, Field, Chip, TeX,
} from '../../components/algorithms'
import { CODE as TOPO_CODE } from './code/TopologicalSort'

function mulberry32(seed) {
  let a = (seed | 0) || 1
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Build a DAG on layered layout, optionally add a back-edge to force a cycle.
function genDAG(n, extra, seed, addCycle) {
  const rng = mulberry32(seed)
  const layerCount = Math.max(2, Math.min(4, Math.ceil(n / 3)))
  const layers = Array.from({ length: layerCount }, () => [])
  for (let i = 0; i < n; i++) layers[Math.floor(rng() * layerCount)].push(i)
  // Fix any empty layers
  layers.forEach((l, idx) => {
    if (l.length === 0 && idx > 0) l.push(layers[0].pop())
  })
  const nodes = []
  const yStep = 260 / (layerCount + 1)
  layers.forEach((layer, li) => {
    const y = yStep * (li + 1) + 20
    layer.forEach((id, i) => {
      const x = (400 / (layer.length + 1)) * (i + 1)
      nodes[id] = { id, x, y, layer: li }
    })
  })

  const edges = []
  const seen = new Set()
  const addEdge = (u, v) => {
    const key = `${u}-${v}`
    if (seen.has(key)) return
    seen.add(key)
    edges.push({ from: u, to: v })
  }
  // Connect each non-first-layer node to a previous-layer node so the DAG is meaningful.
  for (let li = 1; li < layerCount; li++) {
    for (const v of layers[li]) {
      const prev = layers[li - 1]
      const u = prev[Math.floor(rng() * prev.length)]
      addEdge(u, v)
    }
  }
  // Extra forward edges
  let added = 0
  let guard = 0
  while (added < extra && guard++ < 200) {
    const u = Math.floor(rng() * n)
    const v = Math.floor(rng() * n)
    if (u === v) continue
    if (nodes[u].layer >= nodes[v].layer) continue
    if (!seen.has(`${u}-${v}`)) { addEdge(u, v); added++ }
  }
  if (addCycle && n >= 3) {
    // add a back-edge from a later layer back to earlier
    const late = layers[layerCount - 1][0]
    const early = layers[0][0]
    addEdge(late, early)
  }
  return { nodes, edges, layers }
}

function buildAdj(n, edges) {
  const adj = Array.from({ length: n }, () => [])
  const indeg = new Array(n).fill(0)
  for (const e of edges) { adj[e.from].push(e.to); indeg[e.to]++ }
  return { adj, indeg }
}

// ─── Kahn's frames ─────────────────────
function kahnFrames(n, edges) {
  const { adj, indeg } = buildAdj(n, edges)
  const inDeg = indeg.slice()
  const q = []
  for (let i = 0; i < n; i++) if (inDeg[i] === 0) q.push(i)
  const order = []
  const frames = [{ kind: 'init', q: q.slice(), order: [], indeg: inDeg.slice(), line: 1 }]
  while (q.length) {
    const u = q.shift()
    order.push(u)
    frames.push({ kind: 'take', u, q: q.slice(), order: order.slice(), indeg: inDeg.slice(), line: 3 })
    for (const v of adj[u]) {
      inDeg[v]--
      if (inDeg[v] === 0) q.push(v)
      frames.push({ kind: 'decr', u, v, q: q.slice(), order: order.slice(), indeg: inDeg.slice(), line: 5 })
    }
  }
  const hasCycle = order.length < n
  frames.push({ kind: 'done', order: order.slice(), indeg: inDeg.slice(), hasCycle, line: 7 })
  return { frames, order, hasCycle }
}

// ─── DFS frames ────────────────────────
function dfsTopoFrames(n, edges) {
  const { adj } = buildAdj(n, edges)
  const state = new Array(n).fill(0)   // 0 = white, 1 = gray, 2 = black
  const finished = []
  const frames = []
  let hasCycle = false

  function dfs(u) {
    state[u] = 1
    frames.push({ kind: 'enter', u, state: state.slice(), finished: finished.slice(), line: 3 })
    for (const v of adj[u]) {
      if (state[v] === 1) {
        hasCycle = true
        frames.push({ kind: 'back-edge', u, v, state: state.slice(), finished: finished.slice(), line: 5 })
      } else if (state[v] === 0) {
        dfs(v)
      }
    }
    state[u] = 2
    finished.push(u)
    frames.push({ kind: 'finish', u, state: state.slice(), finished: finished.slice(), line: 8 })
  }

  for (let i = 0; i < n; i++) {
    if (state[i] === 0) dfs(i)
  }
  const order = hasCycle ? [] : finished.slice().reverse()
  frames.push({ kind: 'done', state: state.slice(), finished: finished.slice(), order, hasCycle, line: 9 })
  return { frames, order, hasCycle }
}

const KAHN_PSEUDO = [
  'compute in-degree for every node',
  'queue = { v : indeg[v] == 0 }',
  'while queue not empty:',
  '  u = queue.dequeue(); order.push(u)',
  '  for v in adj[u]:',
  '    indeg[v]--; if indeg[v] == 0: queue.push(v)',
  '# if |order| < n: cycle exists',
  '# else: order is a valid topological ordering',
]

const DFS_PSEUDO = [
  'color[v] = WHITE for all v',
  'for v in nodes:',
  '  if color[v] == WHITE: dfs(v)',
  '',
  'dfs(u):',
  '  color[u] = GRAY',
  '  for w in adj[u]:',
  '    if color[w] == GRAY: CYCLE!',
  '    else if color[w] == WHITE: dfs(w)',
  '  color[u] = BLACK; finish.push(u)',
  '# topological order = reverse(finish)',
]

function GraphSVG({ nodes, edges, frame, kahn }) {
  return (
    <svg viewBox='0 0 400 320' className='w-full h-auto max-h-[320px]'>
      {edges.map((e, i) => {
        const a = nodes[e.from], b = nodes[e.to]
        const dx = b.x - a.x, dy = b.y - a.y
        const len = Math.hypot(dx, dy) || 1
        const nx = dx / len, ny = dy / len
        const t = 18
        const x2 = b.x - nx * t, y2 = b.y - ny * t
        const isBack = frame?.kind === 'back-edge' && frame.u === e.from && frame.v === e.to
        return (
          <line
            key={i}
            x1={a.x} y1={a.y} x2={x2} y2={y2}
            stroke={isBack ? '#f43f5e' : '#334155'}
            strokeWidth={isBack ? 2.5 : 1.5}
            markerEnd='url(#arrow-topo)'
            opacity={0.85}
          />
        )
      })}
      <defs>
        <marker id='arrow-topo' viewBox='0 0 10 10' refX='9' refY='5' markerWidth='6' markerHeight='6' orient='auto-start-reverse'>
          <path d='M 0 0 L 10 5 L 0 10 z' fill='#94a3b8' />
        </marker>
      </defs>
      {nodes.map(n => {
        const isCur = frame?.u === n.id
        // Kahn: colour by in-degree
        // DFS: colour by state
        let fill = '#1f2937', stroke = '#64748b'
        if (kahn) {
          const deg = frame?.indeg?.[n.id] ?? 0
          if (frame?.order?.includes(n.id)) { fill = '#052e2b'; stroke = '#22d3ee' }
          else if (deg === 0) { fill = '#78350f'; stroke = '#fbbf24' }
        } else {
          const s = frame?.state?.[n.id]
          if (s === 1) { fill = '#4c1d95'; stroke = '#a78bfa' }
          else if (s === 2) { fill = '#052e2b'; stroke = '#22d3ee' }
        }
        if (isCur) { fill = '#fbbf24'; stroke = '#fef3c7' }
        return (
          <g key={n.id}>
            <circle cx={n.x} cy={n.y} r={16} fill={fill} stroke={stroke} strokeWidth={isCur ? 3 : 1.5} />
            <text
              x={n.x} y={n.y + 4}
              textAnchor='middle' fontSize={11} fontFamily='ui-monospace, monospace'
              fill={isCur ? '#000' : '#e5e7eb'}
            >
              {n.id}
            </text>
            {kahn && (
              <text x={n.x + 18} y={n.y - 12} fontSize={8} fill='#94a3b8' fontFamily='ui-monospace, monospace'>
                d={frame?.indeg?.[n.id] ?? 0}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export default function TopologicalSort() {
  const [n, setN] = useState(7)
  const [extra, setExtra] = useState(3)
  const [seed, setSeed] = useState(2)
  const [addCycle, setAddCycle] = useState(false)

  const { nodes, edges } = useMemo(() => genDAG(n, extra, seed, addCycle), [n, extra, seed, addCycle])
  const kahn = useMemo(() => kahnFrames(n, edges), [n, edges])
  const dfs = useMemo(() => dfsTopoFrames(n, edges), [n, edges])

  const kEng = useStepEngine({ frameCount: kahn.frames.length })
  const dEng = useStepEngine({ frameCount: dfs.frames.length })

  useEffect(() => { kEng.reset(); dEng.reset() /* eslint-disable-next-line */ }, [n, edges])

  const kF = kahn.frames[kEng.i] || kahn.frames[0]
  const dF = dfs.frames[dEng.i] || dfs.frames[0]

  return (
    <><ExplanationBlock>
        <p>
          A topological sort of a directed acyclic graph orders the
          nodes so every edge points forward. Any DAG has at least one
          such ordering (usually many); a cyclic graph has none.
        </p>
        <p>
          <b>Kahn's algorithm</b> repeatedly plucks any node with
          in-degree 0 and decrements its neighbours. Beautifully simple
          and inherently BFS-like — but crucially: if we run out of
          zero-indegree nodes before we've placed all <TeX tex='n' />{' '}
          of them, the graph has a cycle.
        </p>
        <p>
          <b>DFS</b> topological sort colours nodes WHITE → GRAY (in the
          stack) → BLACK (finished). When DFS finishes with a node, push
          it onto a list; the reverse of that list is a valid ordering.
          If we ever see a GRAY neighbour, that's a back edge — a cycle.
        </p>
        <p>Both run in <TeX tex='O(V + E)' />.</p>
      </ExplanationBlock>

      <VisualiserSection>
        <VizPanel>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <div>
              <div className='text-xs text-white/60 mb-1'>Kahn · step {kEng.i + 1}/{kahn.frames.length}</div>
              <GraphSVG nodes={nodes} edges={edges} frame={kF} kahn={true} />
              <div className='text-xs mt-1 font-mono'>
                <span className='text-white/60'>queue: </span>
                <span className='text-rose-300'>[{(kF?.q || []).join(', ')}]</span>
              </div>
              <div className='text-xs mt-1 font-mono'>
                <span className='text-white/60'>order: </span>
                <span className='text-emerald-300'>{(kF?.order || []).join(' → ')}</span>
              </div>
              {kahn.hasCycle && (
                <div className='mt-1 text-xs text-rose-300 font-mono'>cycle detected — no full ordering</div>
              )}
            </div>
            <div>
              <div className='text-xs text-white/60 mb-1'>DFS (post-order) · step {dEng.i + 1}/{dfs.frames.length}</div>
              <GraphSVG nodes={nodes} edges={edges} frame={dF} kahn={false} />
              <div className='text-xs mt-1 font-mono'>
                <span className='text-white/60'>finished (rev to get order): </span>
                <span className='text-cyan-300'>[{(dF?.finished || []).join(', ')}]</span>
              </div>
              <div className='text-xs mt-1 font-mono'>
                <span className='text-white/60'>topo order: </span>
                <span className='text-emerald-300'>{dfs.order.join(' → ')}</span>
              </div>
              {dF?.kind === 'back-edge' && (
                <div className='mt-1 text-xs text-rose-300 font-mono'>back edge {dF.u}→{dF.v} — cycle!</div>
              )}
            </div>
          </div>
        </VizPanel>
        <ControlsPanel>
          <Field label='Nodes'>
            <InputNumber min={4} max={12} value={n} onChange={v => setN(v || 4)} className='w-full' />
          </Field>
          <Field label='Extra edges'>
            <InputNumber min={0} max={15} value={extra} onChange={v => setExtra(v ?? 0)} className='w-full' />
          </Field>
          <Field label='Seed'>
            <InputNumber min={0} max={9999} value={seed} onChange={v => setSeed(v || 0)} className='w-full' />
          </Field>
          <Field label='Add a back-edge (cycle)' helper='Both algorithms should detect it.'>
            <Switch checked={addCycle} onChange={setAddCycle} />
          </Field>
          <StepControls
            playing={kEng.playing || dEng.playing}
            onPlay={() => { kEng.play(); dEng.play() }}
            onPause={() => { kEng.pause(); dEng.pause() }}
            onStep={() => { kEng.step(); dEng.step() }}
            onReset={() => { kEng.reset(); dEng.reset() }}
            speed={kEng.speed}
            onSpeed={(v) => { kEng.setSpeed(v); dEng.setSpeed(v) }}
          />
          <div className='pt-2 flex gap-1.5 flex-wrap'>
            <Chip tone='amber'>current</Chip>
            <Chip tone='violet'>on stack (gray)</Chip>
            <Chip tone='cyan'>finished (black)</Chip>
            <Chip tone='rose'>back edge</Chip>
          </div>
        </ControlsPanel>
      </VisualiserSection>

      <MultiLangCode title="Kahn's algorithm (BFS on in-degree)" code={TOPO_CODE.kahn} />
      <MultiLangCode title='DFS post-order topological sort' code={TOPO_CODE.dfs} />

      <ComplexityTable rows={[
        { op: "Kahn's algorithm", best: 'O(V+E)', avg: 'O(V+E)', worst: 'O(V+E)', space: 'O(V)' },
        { op: 'DFS post-order',   best: 'O(V+E)', avg: 'O(V+E)', worst: 'O(V+E)', space: 'O(V)' },
        { op: 'Cycle detection (via either)', best: 'O(V+E)', avg: 'O(V+E)', worst: 'O(V+E)', space: 'O(V)' },
        { op: 'All linear extensions',        best: 'O(V!)',  avg: 'O(V!)',  worst: 'O(V!)',  space: 'O(V)' },
      ]} />

      <RealWorldCard>
        <p>
          Build systems (Make, Bazel, Turborepo) topologically sort
          tasks so every dependency finishes before its dependants.
          Package managers (npm, pip) resolve install order the same
          way. Course-prerequisite planners, spreadsheet cell
          recomputation, and scheduler pipelines all rely on it.
        </p>
        <p>
          When any of the above throws "cyclic dependency detected",
          that's almost always Kahn's failure mode (indegree never
          hits 0) or DFS's failure mode (back edge to a GRAY node).
        </p>
      </RealWorldCard></>
  )
}
