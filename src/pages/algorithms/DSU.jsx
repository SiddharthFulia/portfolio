// Disjoint Set Union — Union-Find with both path compression and
// union by rank. This is the canonical near-O(1) amortised
// data structure (inverse Ackermann α(n)).
//
// Interactive:
//   - Click Union to merge two elements' sets. Union by rank
//     picks the taller tree as the new root so trees stay shallow.
//   - Click Find to flatten the path from x to its root. Every node
//     on the path becomes a direct child of the root — you can
//     literally watch a "chain" collapse into a "star" in one call.

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ExplanationBlock, VisualiserSection, VizPanel, ControlsPanel,
  MultiLangCode, ComplexityTable, RealWorldCard, StepControls, useStepEngine,
  Field, TextInput, Chip, OperationLog,
} from '../../components/algorithms'
import { Button } from '../../components/ui'
import { DSU_CODE } from './code/DSU'

/* ---------- ops ---------- */

function makeDSU(n) {
  return { parent: Array.from({ length: n }, (_, i) => i), rank: Array(n).fill(0) }
}

function planFind(dsu, x) {
  const frames = []
  const parent = [...dsu.parent], rank = [...dsu.rank]
  const path = []
  let cur = x
  while (parent[cur] !== cur) {
    frames.push({ parent: [...parent], rank: [...rank], touch: cur, msg: `at ${cur} — parent is ${parent[cur]}, walk up` })
    path.push(cur)
    cur = parent[cur]
  }
  const root = cur
  frames.push({ parent: [...parent], rank: [...rank], touch: root, msg: `root of ${x} is ${root}` })
  // Path compression
  for (const p of path) {
    parent[p] = root
    frames.push({ parent: [...parent], rank: [...rank], touch: p, msg: `compress: parent[${p}] = ${root}` })
  }
  frames.push({ parent: [...parent], rank: [...rank], touch: null, msg: `find(${x}) = ${root}` })
  return { frames, root, next: { parent, rank } }
}

function planUnion(dsu, a, b) {
  const frames = []
  // Find roots (with path compression happening in the plan).
  const A = planFind(dsu, a)
  frames.push(...A.frames.map(f => ({ ...f, msg: `find(${a}): ${f.msg}` })))
  const dsu2 = A.next
  const B = planFind(dsu2, b)
  frames.push(...B.frames.map(f => ({ ...f, msg: `find(${b}): ${f.msg}` })))
  const rA = A.root, rB = B.root
  if (rA === rB) {
    frames.push({ ...B.frames[B.frames.length - 1], msg: `same set — nothing to union` })
    return { frames, next: B.next }
  }
  const parent = [...B.next.parent], rank = [...B.next.rank]
  let winner, loser
  if (rank[rA] < rank[rB]) { winner = rB; loser = rA }
  else if (rank[rA] > rank[rB]) { winner = rA; loser = rB }
  else { winner = rA; loser = rB; rank[winner] += 1 }
  parent[loser] = winner
  frames.push({ parent: [...parent], rank: [...rank], touch: loser, msg: `union: parent[${loser}] = ${winner}${winner === rA && loser === rB ? '' : ''}` })
  if (rank[winner] > B.next.rank[winner]) {
    frames.push({ parent: [...parent], rank: [...rank], touch: winner, msg: `rank[${winner}] → ${rank[winner]}` })
  }
  return { frames, next: { parent, rank } }
}

/* ---------- layout: each root is a tree ---------- */

function forest(parent) {
  const n = parent.length
  const children = Array.from({ length: n }, () => [])
  const roots = []
  for (let i = 0; i < n; i++) {
    if (parent[i] === i) roots.push(i)
    else children[parent[i]].push(i)
  }
  return { children, roots }
}

function layoutForest(parent) {
  const { children, roots } = forest(parent)
  const H_GAP = 34, V_GAP = 46
  const positions = []
  let xCursor = 0
  function measure(r) {
    if (children[r].length === 0) return 1
    return children[r].reduce((sum, c) => sum + measure(c), 0)
  }
  function place(r, xOff, depth) {
    const w = measure(r) * H_GAP
    let cur = xOff
    const kidsPositioned = children[r].map(c => {
      const cw = measure(c) * H_GAP
      const cx = place(c, cur, depth + 1)
      cur += cw
      return { c, x: cx }
    })
    const cx = children[r].length === 0
      ? xOff + H_GAP / 2
      : (kidsPositioned[0].x + kidsPositioned[kidsPositioned.length - 1].x) / 2
    positions.push({ id: r, x: cx, y: depth * V_GAP + 26 })
    return cx
  }
  for (const r of roots) {
    place(r, xCursor, 0)
    xCursor += measure(r) * H_GAP + 10
  }
  return { positions, w: xCursor, h: Math.max(...positions.map(p => p.y)) + 30 }
}

function ForestSVG({ parent, rank, touch }) {
  const { positions, w, h } = useMemo(() => layoutForest(parent), [parent])
  const byId = new Map(positions.map(p => [p.id, p]))
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      {positions.map(p => {
        const par = parent[p.id]
        if (par === p.id) return null
        const parentPos = byId.get(par); if (!parentPos) return null
        return <line key={`e-${p.id}`} x1={p.x} y1={p.y} x2={parentPos.x} y2={parentPos.y} stroke="#4b5563" strokeWidth={1.5} />
      })}
      {positions.map(p => {
        const isRoot = parent[p.id] === p.id
        const isTouch = p.id === touch
        const tone = isTouch ? { fill: '#78350f', stroke: '#fbbf24', text: '#fef3c7' }
                  : isRoot   ? { fill: '#064e3b', stroke: '#34d399', text: '#d1fae5' }
                  : { fill: '#1f2937', stroke: '#9ca3af', text: '#f3f4f6' }
        return (
          <motion.g key={`n-${p.id}`} initial={false} animate={{ x: p.x, y: p.y }} transition={{ type: 'spring', stiffness: 240, damping: 24 }}>
            <circle r={14} fill={tone.fill} stroke={tone.stroke} strokeWidth={2} />
            <text y={4} textAnchor="middle" fontSize={10} fill={tone.text} fontFamily="ui-monospace">{p.id}</text>
            {isRoot && <text y={-19} textAnchor="middle" fontSize={8} fill="#34d399" fontFamily="ui-monospace">r={rank[p.id]}</text>}
          </motion.g>
        )
      })}
    </svg>
  )
}

const N = 10
const SEED_EDGES = [[0, 1], [2, 3], [4, 5], [1, 2], [6, 7], [8, 9]]

export default function DSU() {
  const [dsu, setDsu] = useState(() => {
    const s = makeDSU(N)
    // apply seed unions with rank/compression so the initial state
    // is a real DSU, not just parent[i]=i.
    let state = s
    for (const [a, b] of SEED_EDGES) {
      const { next } = planUnion(state, a, b); state = next
    }
    return state
  })
  const [a, setA] = useState('6'); const [b, setB] = useState('0')
  const [fx, setFx] = useState('7')
  const [frames, setFrames] = useState([{ ...dsu, msg: 'ready' }])
  const engine = useStepEngine({ frameCount: frames.length })
  const current = frames[engine.i] || dsu

  const doUnion = () => {
    const { frames: f, next } = planUnion(dsu, Number(a) | 0, Number(b) | 0)
    setFrames([{ ...dsu, msg: `union(${a}, ${b})` }, ...f]); setDsu(next); engine.reset()
  }
  const doFind = () => {
    const { frames: f, next } = planFind(dsu, Number(fx) | 0)
    setFrames([{ ...dsu, msg: `find(${fx})` }, ...f]); setDsu(next); engine.reset()
  }
  const doReset = () => {
    let state = makeDSU(N)
    for (const [x, y] of SEED_EDGES) { const { next } = planUnion(state, x, y); state = next }
    setDsu(state); setFrames([{ ...state, msg: 'reset' }]); engine.reset()
  }

  const activeLine = useMemo(() => {
    if (!current.msg) return -1
    if (current.msg.includes('walk up')) return 2
    if (current.msg.includes('compress')) return 2
    if (current.msg.includes('root of')) return 1
    if (current.msg.startsWith('union:')) return 9
    if (current.msg.startsWith('rank[')) return 10
    return -1
  }, [current])

  const numSets = useMemo(() => new Set(current.parent?.map((_, i) => {
    let x = i; while (current.parent[x] !== x) x = current.parent[x]
    return x
  })).size, [current])

  return (
    <><ExplanationBlock>
        <p>
          <b>Union-Find</b> (a.k.a. DSU) maintains a collection of disjoint sets
          with two operations: <code>find(x)</code> returns the "root" of x's
          set, and <code>union(a, b)</code> merges the two sets containing a
          and b. Both are almost O(1) — technically O(α(n)) where α is the
          inverse Ackermann function, which is &le; 4 for any n you'll ever
          see.
        </p>
        <p>
          Two optimisations are both needed to hit that bound:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>Union by rank</b> — attach the shorter tree under the taller.
            Keeps trees balanced. Rank is an upper bound on height.</li>
          <li><b>Path compression</b> — during find, rewire every node on the
            walk to point directly at the root. Watch the tree flatten in
            the viz — a chain 0→1→2→3→4 becomes four direct edges to the
            root in a single find call.</li>
        </ul>
        <p>
          Green nodes are roots (their parent is themselves). Amber = the
          node currently being touched. The tag above roots shows their rank.
        </p>
      </ExplanationBlock>

      <VisualiserSection>
        <VizPanel>
          <ForestSVG parent={current.parent || dsu.parent} rank={current.rank || dsu.rank} touch={current.touch} />
          <div className="mt-3 flex gap-2 flex-wrap justify-center">
            <Chip tone="amber">n = {N}</Chip>
            <Chip tone="fuchsia">disjoint sets: {numSets}</Chip>
          </div>
          <div className="mt-3 text-xs text-gray-400 text-center min-h-[16px]">{current.msg}</div>
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

          <Field label="Union" helper="Merges two sets by rank.">
            <div className="grid grid-cols-2 gap-1.5">
              <TextInput value={a} onChange={setA} placeholder="a" />
              <TextInput value={b} onChange={setB} placeholder="b" />
            </div>
            <Button variant="primary" size="small" onClick={doUnion} className="mt-1.5 w-full">union(a, b)</Button>
          </Field>

          <Field label="Find" helper="Compresses the path from x to root.">
            <TextInput value={fx} onChange={setFx} placeholder="x" />
            <Button variant="ghost" size="small" onClick={doFind} className="mt-1.5 w-full">find(x)</Button>
          </Field>

          <Button variant="subtle" size="small" onClick={doReset}>Reset DSU</Button>
        </ControlsPanel>
      </VisualiserSection>

      <MultiLangCode
        title="Implementation — find + union"
        code={DSU_CODE}
        activeLines={{ pseudo: activeLine }}
      />

      <ComplexityTable rows={[
        { op: 'find (amortised)',   best: 'O(1)', avg: 'O(\\alpha(n))', worst: 'O(\\log n)', space: 'O(n)' },
        { op: 'union (amortised)',  best: 'O(1)', avg: 'O(\\alpha(n))', worst: 'O(\\log n)', space: 'O(n)' },
        { op: 'makeSet',            best: 'O(1)', avg: 'O(1)', worst: 'O(1)', space: 'O(n)' },
      ]} />

      <RealWorldCard>
        <p>
          Union-Find is the backbone of <b>Kruskal's MST</b> (fastest way to
          check "would this edge form a cycle?"), the offline range-query
          trick "small-to-large merging", and social-network friend-of-friend
          reachability. Every connected-component question over a live edge
          stream (Twitter friend graph, cluster in a distributed system,
          dynamic graph in a game) is DSU. Compiler union-find is used in
          type inference (Hindley-Milner). Percolation simulations in
          physics use it.
        </p>
      </RealWorldCard></>
  )
}
