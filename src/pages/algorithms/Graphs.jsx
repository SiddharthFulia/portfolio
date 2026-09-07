// Graphs — adjacency list vs adjacency matrix side-by-side.
// Interactive:
//   - Add / remove nodes and edges live
//   - Toggle directed / weighted
//   - Both representations update together so you see the same graph
//     from two angles.
//
// Layout: nodes are placed on a circle for stability. Edges are drawn
// as straight lines (or curved arcs when directed to distinguish
// a→b from b→a).

import { useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  TopicShell, ExplanationBlock, VisualiserSection, VizPanel, ControlsPanel,
  MultiLangCode, ComplexityTable, RealWorldCard, Field, TextInput, Chip,
} from '../../components/algorithms'
import { Button } from '../../components/ui'
import { GRAPH_CODE } from './code/Graphs'

const INITIAL = {
  nodes: ['A', 'B', 'C', 'D', 'E'],
  edges: [
    ['A', 'B', 4], ['A', 'C', 2], ['B', 'C', 5],
    ['B', 'D', 10], ['C', 'D', 3], ['D', 'E', 7],
  ],
}

function nodeLayout(nodes, w = 340, h = 260) {
  const R = Math.min(w, h) / 2 - 34
  const cx = w / 2, cy = h / 2
  const n = nodes.length
  return nodes.map((id, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2
    return { id, x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) }
  })
}

function AdjacencyList({ nodes, edges, directed }) {
  const map = new Map(nodes.map(n => [n, []]))
  for (const [u, v, w] of edges) {
    map.get(u)?.push({ to: v, w })
    if (!directed) map.get(v)?.push({ to: u, w })
  }
  return (
    <div className="space-y-1">
      {nodes.map(n => (
        <div key={n} className="flex items-start gap-2 text-xs font-mono">
          <span className="text-amber-300 w-6">{n}</span>
          <span className="text-gray-500">→</span>
          <span className="text-gray-200 flex-1">
            {map.get(n).length === 0
              ? <span className="text-gray-600">∅</span>
              : map.get(n).map((e, i) => (
                <span key={i} className="inline-block bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 mr-1 mb-1">
                  {e.to}{e.w != null ? `(${e.w})` : ''}
                </span>
              ))}
          </span>
        </div>
      ))}
    </div>
  )
}

function AdjacencyMatrix({ nodes, edges, directed, weighted }) {
  const idx = new Map(nodes.map((n, i) => [n, i]))
  const n = nodes.length
  const M = Array.from({ length: n }, () => Array(n).fill(0))
  for (const [u, v, w] of edges) {
    const i = idx.get(u), j = idx.get(v)
    const val = weighted ? w : 1
    M[i][j] = val
    if (!directed) M[j][i] = val
  }
  return (
    <div className="overflow-auto max-w-full">
      <table className="text-[10px] font-mono border-collapse">
        <thead>
          <tr>
            <th className="p-1"></th>
            {nodes.map(x => <th key={x} className="p-1 text-amber-300 text-center w-8">{x}</th>)}
          </tr>
        </thead>
        <tbody>
          {nodes.map((row, i) => (
            <tr key={row}>
              <td className="p-1 text-amber-300 text-right">{row}</td>
              {nodes.map((_, j) => (
                <td
                  key={j}
                  className={`p-1 w-8 h-6 text-center border ${
                    M[i][j] ? 'bg-emerald-900/40 border-emerald-700 text-emerald-200' : 'border-gray-800 text-gray-600'
                  }`}
                >
                  {M[i][j] || '·'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GraphCanvas({ nodes, edges, directed, weighted }) {
  const pts = nodeLayout(nodes)
  const posById = new Map(pts.map(p => [p.id, p]))
  return (
    <svg viewBox="0 0 340 260" className="w-full max-w-md mx-auto">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#fbbf24" />
        </marker>
      </defs>
      {edges.map(([u, v, w], i) => {
        const p1 = posById.get(u), p2 = posById.get(v)
        if (!p1 || !p2) return null
        const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2
        return (
          <g key={i}>
            <motion.line
              initial={false}
              animate={{ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }}
              stroke="#9ca3af"
              strokeWidth={2}
              markerEnd={directed ? 'url(#arrow)' : undefined}
            />
            {weighted && (
              <g>
                <rect x={mx - 10} y={my - 8} width={20} height={13} rx={3} fill="#111" stroke="#fbbf24" />
                <text x={mx} y={my + 2} fontSize={9} textAnchor="middle" fill="#fbbf24" fontFamily="ui-monospace">{w}</text>
              </g>
            )}
          </g>
        )
      })}
      {pts.map(p => (
        <motion.g key={p.id} initial={false} animate={{ x: p.x, y: p.y }}>
          <circle r={18} fill="#1f2937" stroke="#fbbf24" strokeWidth={2} />
          <text y={5} textAnchor="middle" fontSize={13} fill="#fef3c7" fontFamily="ui-monospace">{p.id}</text>
        </motion.g>
      ))}
    </svg>
  )
}

export default function Graphs() {
  const [nodes, setNodes] = useState(INITIAL.nodes)
  const [edges, setEdges] = useState(INITIAL.edges)
  const [directed, setDirected] = useState(false)
  const [weighted, setWeighted] = useState(true)

  const [newNode, setNewNode] = useState('F')
  const [edgeU, setEdgeU] = useState('A')
  const [edgeV, setEdgeV] = useState('E')
  const [edgeW, setEdgeW] = useState('6')

  const addNode = () => {
    const nn = String(newNode).trim().toUpperCase()
    if (!nn || nodes.includes(nn)) return
    setNodes([...nodes, nn])
  }
  const removeNode = () => {
    const nn = String(newNode).trim().toUpperCase()
    if (!nn) return
    setNodes(nodes.filter(x => x !== nn))
    setEdges(edges.filter(([u, v]) => u !== nn && v !== nn))
  }
  const addEdge = () => {
    if (!nodes.includes(edgeU) || !nodes.includes(edgeV) || edgeU === edgeV) return
    setEdges([...edges, [edgeU, edgeV, Number(edgeW) || 1]])
  }
  const removeEdge = () => {
    setEdges(edges.filter(([u, v]) => !(u === edgeU && v === edgeV) && !(!directed && u === edgeV && v === edgeU)))
  }

  return (
    <TopicShell slug="graphs" title="Graphs">
      <ExplanationBlock>
        <p>
          A <b>graph</b> is a set of nodes (vertices) connected by edges. That's
          it — but graphs model an absurd amount of the real world: road maps,
          social networks, dependency trees, TCP topologies, molecule bonds,
          game states, deadlock detection. Almost every non-trivial problem
          eventually looks like a graph.
        </p>
        <p>
          Two universal representations:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>Adjacency list</b> — for each node, keep a list of its neighbours.
            Space: <code>O(V + E)</code>. Great for sparse graphs. Iterating over
            a node's neighbours is O(deg).</li>
          <li><b>Adjacency matrix</b> — an <code>V × V</code> grid of booleans (or weights).
            Space: <code>O(V²)</code>. Great for dense graphs and for O(1) edge lookups —
            "does u→v exist?" — but wasteful when most cells are 0.</li>
        </ul>
        <p>
          The visualiser below draws the graph and shows both representations
          side-by-side. Toggle directed / weighted, add nodes and edges, and
          watch the list and matrix update together.
        </p>
      </ExplanationBlock>

      <VisualiserSection>
        <VizPanel>
          <GraphCanvas nodes={nodes} edges={edges} directed={directed} weighted={weighted} />
          <div className="mt-3 flex gap-2 justify-center flex-wrap">
            <Chip tone="amber">V = {nodes.length}</Chip>
            <Chip tone="fuchsia">E = {edges.length}</Chip>
            <Chip tone={directed ? 'cyan' : 'gray'}>{directed ? 'directed' : 'undirected'}</Chip>
            <Chip tone={weighted ? 'emerald' : 'gray'}>{weighted ? 'weighted' : 'unweighted'}</Chip>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            <div className="rounded-lg border border-white/10 bg-black/30 p-3">
              <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Adjacency list</div>
              <AdjacencyList nodes={nodes} edges={edges} directed={directed} />
            </div>
            <div className="rounded-lg border border-white/10 bg-black/30 p-3">
              <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Adjacency matrix</div>
              <AdjacencyMatrix nodes={nodes} edges={edges} directed={directed} weighted={weighted} />
            </div>
          </div>
        </VizPanel>

        <ControlsPanel>
          <Field label="Graph type" helper="Directed reads edges as one-way.">
            <div className="grid grid-cols-2 gap-1.5">
              <Button variant={directed ? 'ghost' : 'primary'} size="small" onClick={() => setDirected(false)}>Undirected</Button>
              <Button variant={directed ? 'primary' : 'ghost'} size="small" onClick={() => setDirected(true)}>Directed</Button>
            </div>
            <div className="grid grid-cols-2 gap-1.5 mt-1.5">
              <Button variant={weighted ? 'ghost' : 'primary'} size="small" onClick={() => setWeighted(false)}>Unweighted</Button>
              <Button variant={weighted ? 'primary' : 'ghost'} size="small" onClick={() => setWeighted(true)}>Weighted</Button>
            </div>
          </Field>

          <Field label="Node" helper="Add / remove by name.">
            <TextInput value={newNode} onChange={setNewNode} placeholder="name" />
            <div className="grid grid-cols-2 gap-1.5 mt-1.5">
              <Button variant="primary" size="small" onClick={addNode}>+ node</Button>
              <Button variant="danger" size="small" onClick={removeNode}>- node</Button>
            </div>
          </Field>

          <Field label="Edge" helper="From, To, Weight.">
            <div className="grid grid-cols-3 gap-1">
              <TextInput value={edgeU} onChange={setEdgeU} placeholder="u" />
              <TextInput value={edgeV} onChange={setEdgeV} placeholder="v" />
              <TextInput value={edgeW} onChange={setEdgeW} placeholder="w" />
            </div>
            <div className="grid grid-cols-2 gap-1.5 mt-1.5">
              <Button variant="primary" size="small" onClick={addEdge}>+ edge</Button>
              <Button variant="danger" size="small" onClick={removeEdge}>- edge</Button>
            </div>
          </Field>

          <Button variant="subtle" size="small" onClick={() => { setNodes(INITIAL.nodes); setEdges(INITIAL.edges) }}>Reset</Button>
        </ControlsPanel>
      </VisualiserSection>

      <MultiLangCode
        title="Implementation — representations"
        code={GRAPH_CODE}
      />

      <ComplexityTable rows={[
        { op: 'adj-list · has edge', best: 'O(1)', avg: 'O(deg)', worst: 'O(V)', space: 'O(V + E)' },
        { op: 'adj-list · iterate neighbours', best: 'O(1)', avg: 'O(deg)', worst: 'O(V)', space: 'O(V + E)' },
        { op: 'adj-matrix · has edge', best: 'O(1)', avg: 'O(1)', worst: 'O(1)', space: 'O(V^2)' },
        { op: 'adj-matrix · iterate neighbours', best: 'O(V)', avg: 'O(V)', worst: 'O(V)', space: 'O(V^2)' },
      ]} />

      <RealWorldCard>
        <p>
          Google Maps and Waze are directed weighted graphs — each intersection
          is a vertex, each road segment an edge with travel-time weight.
          Facebook / LinkedIn are undirected graphs of people. Git commit
          history is a DAG (directed acyclic graph). Neural network topologies
          are graphs. And every real-world routing protocol (OSPF, BGP)
          runs shortest-path on a graph of network nodes.
        </p>
      </RealWorldCard>
    </TopicShell>
  )
}
