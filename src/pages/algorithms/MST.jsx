// Minimum Spanning Tree — Kruskal + Prim side-by-side over the
// SAME weighted undirected graph so users can compare strategies.
//
// Kruskal: sort edges by weight, add each edge if it doesn't form
//   a cycle (DSU check). Greedy over edges.
// Prim:   grow a tree from a start vertex, always adding the
//   cheapest edge that reaches a new vertex. Greedy over vertices.
//
// Both are correct — I sanity-checked total MST weight on a fixed
// seed and both algorithms produce the same total (as they must —
// MST is unique when all weights are distinct).

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ExplanationBlock, VisualiserSection, VizPanel, ControlsPanel,
  MultiLangCode, ComplexityTable, RealWorldCard, StepControls, useStepEngine,
  Field, TextInput, Chip, OperationLog,
} from '../../components/algorithms'
import { Button } from '../../components/ui'

/* ---------- graph ---------- */

const GRAPH = {
  nodes: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
  edges: [
    ['A', 'B', 7], ['A', 'D', 5],
    ['B', 'C', 8], ['B', 'D', 9], ['B', 'E', 7],
    ['C', 'E', 5],
    ['D', 'E', 15], ['D', 'F', 6],
    ['E', 'F', 8], ['E', 'G', 9],
    ['F', 'G', 11],
  ],
}

function nodeLayout(nodes, w = 380, h = 260) {
  const R = Math.min(w, h) / 2 - 40
  const cx = w / 2, cy = h / 2
  const n = nodes.length
  return nodes.map((id, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2
    return { id, x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) }
  })
}

/* ---------- Kruskal ---------- */

function planKruskal(nodes, edges) {
  const sorted = [...edges].sort((a, b) => a[2] - b[2])
  const parent = new Map(nodes.map(n => [n, n]))
  const rank = new Map(nodes.map(n => [n, 0]))
  function find(x) { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x) } return x }
  function union(a, b) {
    const rA = find(a), rB = find(b); if (rA === rB) return false
    if (rank.get(rA) < rank.get(rB)) parent.set(rA, rB)
    else if (rank.get(rA) > rank.get(rB)) parent.set(rB, rA)
    else { parent.set(rB, rA); rank.set(rA, rank.get(rA) + 1) }
    return true
  }
  const frames = []
  const mst = []
  let total = 0
  for (const [u, v, w] of sorted) {
    frames.push({ mst: [...mst], candidate: [u, v, w], msg: `consider ${u}-${v} (w=${w})` })
    const merged = union(u, v)
    if (merged) {
      mst.push([u, v, w]); total += w
      frames.push({ mst: [...mst], added: [u, v, w], total, msg: `accept ${u}-${v} — merges two components` })
    } else {
      frames.push({ mst: [...mst], rejected: [u, v, w], total, msg: `reject ${u}-${v} — would form a cycle` })
    }
    if (mst.length === nodes.length - 1) {
      frames.push({ mst: [...mst], total, msg: `MST complete — total weight ${total}` })
      break
    }
  }
  return { frames, mst, total }
}

/* ---------- Prim ---------- */

function planPrim(nodes, edges, start) {
  const adj = new Map(nodes.map(n => [n, []]))
  for (const [u, v, w] of edges) {
    adj.get(u).push({ to: v, w })
    adj.get(v).push({ to: u, w })
  }
  const inTree = new Set([start])
  const frames = []
  const mst = []
  let total = 0
  frames.push({ inTree: new Set(inTree), mst: [...mst], msg: `start at ${start}` })
  while (inTree.size < nodes.length) {
    // Find the cheapest edge crossing the tree boundary.
    let best = null
    for (const u of inTree) {
      for (const { to, w } of adj.get(u)) {
        if (inTree.has(to)) continue
        if (!best || w < best.w) best = { u, v: to, w }
      }
    }
    if (!best) break
    frames.push({ inTree: new Set(inTree), mst: [...mst], candidate: [best.u, best.v, best.w], msg: `cheapest crossing edge: ${best.u}-${best.v} (w=${best.w})` })
    inTree.add(best.v)
    mst.push([best.u, best.v, best.w]); total += best.w
    frames.push({ inTree: new Set(inTree), mst: [...mst], added: [best.u, best.v, best.w], total, msg: `add ${best.u}-${best.v}; grow tree to ${best.v}` })
  }
  frames.push({ inTree: new Set(inTree), mst: [...mst], total, msg: `MST complete — total weight ${total}` })
  return { frames, mst, total }
}

/* ---------- render ---------- */

function GraphViz({ frame, algo }) {
  const pts = nodeLayout(GRAPH.nodes)
  const pos = new Map(pts.map(p => [p.id, p]))
  const mstEdges = new Set((frame?.mst || []).map(([u, v]) => [u, v].sort().join('-')))
  const cand = frame?.candidate ? [frame.candidate[0], frame.candidate[1]].sort().join('-') : null
  const rej = frame?.rejected ? [frame.rejected[0], frame.rejected[1]].sort().join('-') : null
  const inTree = frame?.inTree instanceof Set ? frame.inTree : null
  return (
    <svg viewBox="0 0 380 260" className="w-full">
      {GRAPH.edges.map(([u, v, w], i) => {
        const p1 = pos.get(u), p2 = pos.get(v)
        const key = [u, v].sort().join('-')
        const inMst = mstEdges.has(key)
        const isCand = key === cand
        const isRej = key === rej
        const stroke = inMst ? '#34d399' : isCand ? '#fbbf24' : isRej ? '#f43f5e' : '#4b5563'
        const sw = inMst ? 3 : isCand || isRej ? 2.5 : 1.5
        const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2
        return (
          <g key={i}>
            <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={stroke} strokeWidth={sw} strokeDasharray={isRej ? '4 4' : '0'} />
            <rect x={mx - 10} y={my - 8} width={20} height={13} rx={3} fill="#111" stroke={stroke} />
            <text x={mx} y={my + 2} fontSize={9} textAnchor="middle" fill={stroke} fontFamily="ui-monospace">{w}</text>
          </g>
        )
      })}
      {pts.map(p => {
        const included = algo === 'prim' && inTree ? inTree.has(p.id) : mstEdges.size > 0
        const inMST = mstEdges.size > 0 &&
          (frame?.mst || []).some(([u, v]) => u === p.id || v === p.id)
        const tone = included || inMST
          ? { fill: '#064e3b', stroke: '#34d399', text: '#d1fae5' }
          : { fill: '#1f2937', stroke: '#9ca3af', text: '#f3f4f6' }
        return (
          <motion.g key={p.id} initial={false} animate={{ x: p.x, y: p.y }}>
            <circle r={16} fill={tone.fill} stroke={tone.stroke} strokeWidth={2} />
            <text y={5} textAnchor="middle" fontSize={12} fill={tone.text} fontFamily="ui-monospace">{p.id}</text>
          </motion.g>
        )
      })}
    </svg>
  )
}

import { MST_KRUSKAL_CODE, MST_PRIM_CODE } from './code/MST'

export default function MST() {
  const [algo, setAlgo] = useState('kruskal')
  const [start, setStart] = useState('A')
  const kr = useMemo(() => planKruskal(GRAPH.nodes, GRAPH.edges), [])
  const pr = useMemo(() => planPrim(GRAPH.nodes, GRAPH.edges, start), [start])
  const frames = algo === 'kruskal' ? kr.frames : pr.frames
  const engine = useStepEngine({ frameCount: frames.length })
  const current = frames[engine.i]

  const activeLine = useMemo(() => {
    if (!current || !current.msg) return -1
    if (algo === 'kruskal') {
      if (current.msg.startsWith('consider')) return 4
      if (current.msg.startsWith('accept')) return 7
      if (current.msg.startsWith('reject')) return 5
      if (current.msg.startsWith('MST complete')) return 9
      return -1
    }
    if (current.msg.startsWith('cheapest')) return 4
    if (current.msg.startsWith('add')) return 6
    if (current.msg.startsWith('MST complete')) return 7
    return -1
  }, [current, algo])

  const total = current?.total ?? 0
  const totalFinal = algo === 'kruskal' ? kr.total : pr.total

  return (
    <><ExplanationBlock>
        <p>
          A <b>spanning tree</b> of a connected undirected graph is a subset
          of edges that connects every vertex with no cycles — exactly V - 1
          edges. The <b>minimum</b> spanning tree is the spanning tree of
          least total weight. Two classic greedy algorithms solve it:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>Kruskal</b> — sort all edges by weight. Walk them in order.
            Add each edge if its endpoints aren't already connected in the
            partial MST. "Connected?" is a union-find query, which is why the
            DSU page is a prerequisite. O(E log E).</li>
          <li><b>Prim</b> — grow one tree from a seed vertex. Repeatedly add
            the cheapest edge that reaches a vertex outside the current tree.
            With a binary heap, O((V + E) log V); with a Fibonacci heap,
            O(E + V log V).</li>
        </ul>
        <p>
          Both are correct (and produce the same total weight when edge
          weights are distinct), but they take different paths through the
          graph — Kruskal considers edges globally, Prim locally. Toggle the
          two side-by-side to see the frame-by-frame difference.
        </p>
      </ExplanationBlock>

      <VisualiserSection>
        <VizPanel>
          <GraphViz frame={current} algo={algo} />
          <div className="mt-3 flex gap-2 flex-wrap justify-center">
            <Chip tone="amber">algorithm: {algo}</Chip>
            <Chip tone="emerald">MST edges: {current?.mst?.length || 0} / {GRAPH.nodes.length - 1}</Chip>
            <Chip tone="fuchsia">running total: {total}</Chip>
            <Chip tone="cyan">final MST: {totalFinal}</Chip>
          </div>
          <div className="mt-3 text-xs text-gray-400 text-center min-h-[16px]">{current?.msg}</div>
          <div className="mt-3">
            <OperationLog frames={frames} activeFrame={engine.i} />
          </div>
        </VizPanel>

        <ControlsPanel>
          <StepControls
            playing={engine.playing}
            onPlay={engine.play}
            onPause={engine.pause}
            onStep={engine.step}
            onReset={engine.reset}
            speed={engine.speed}
            onSpeed={engine.setSpeed}
          />
          <div className="h-px bg-white/10 my-1" />
          <Field label="Algorithm" helper="Both build the same MST.">
            <div className="grid grid-cols-2 gap-1.5">
              <Button variant={algo === 'kruskal' ? 'primary' : 'ghost'} size="small" onClick={() => { setAlgo('kruskal'); engine.reset() }}>Kruskal</Button>
              <Button variant={algo === 'prim' ? 'primary' : 'ghost'} size="small" onClick={() => { setAlgo('prim'); engine.reset() }}>Prim</Button>
            </div>
          </Field>
          <Field label="Prim start" helper="Any node — MST is the same.">
            <div className="grid grid-cols-4 gap-1">
              {GRAPH.nodes.map(n => (
                <Button key={n} variant={start === n ? 'primary' : 'ghost'} size="small" onClick={() => { setStart(n); engine.reset() }}>{n}</Button>
              ))}
            </div>
          </Field>
        </ControlsPanel>
      </VisualiserSection>

      <MultiLangCode
        title={algo === 'kruskal' ? 'Implementation — Kruskal' : 'Implementation — Prim'}
        code={algo === 'kruskal' ? MST_KRUSKAL_CODE : MST_PRIM_CODE}
        activeLines={{ pseudo: activeLine }}
      />

      <ComplexityTable rows={[
        { op: 'Kruskal (sort + DSU)', best: 'O(E \\log E)', avg: 'O(E \\log E)', worst: 'O(E \\log E)', space: 'O(V)' },
        { op: 'Prim (binary heap)',   best: 'O((V+E) \\log V)', avg: 'O((V+E) \\log V)', worst: 'O((V+E) \\log V)', space: 'O(V)' },
        { op: 'Prim (Fibonacci heap)', best: 'O(E + V \\log V)', avg: 'O(E + V \\log V)', worst: 'O(E + V \\log V)', space: 'O(V)' },
      ]} />

      <RealWorldCard>
        <p>
          MSTs are how network engineers lay out spanning-tree protocol (STP)
          on switched LANs — every packet flows over a computed MST that
          eliminates loops. Chip designers use MSTs for wire routing (least
          copper). Cluster analysis in ML uses MSTs to detect natural groups
          (single-linkage clustering = MST cut). ISPs plan fibre rollouts on
          MSTs. And every Dungeons & Dragons dungeon generator that produces
          a "connected maze with corridors" is running a randomised MST.
        </p>
      </RealWorldCard></>
  )
}
