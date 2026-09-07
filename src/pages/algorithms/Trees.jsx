// Trees — general N-ary with the four traversals.
//
// Interactive:
//   - Add child under any node
//   - Delete a node (and its subtree)
//   - Run pre-order / in-order / post-order / level-order
//     traversal — every visit highlights the current node
//     and appends to a growing "visit order" strip below.
//
// For general N-ary "in-order" doesn't really exist. We use a
// pragmatic version: recurse left-half children, visit self,
// recurse right-half children — a standard interpretation you'll
// find in most competitive programming references.

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  TopicShell, ExplanationBlock, VisualiserSection, VizPanel, ControlsPanel,
  PseudocodeBlock, ComplexityTable, RealWorldCard, StepControls, useStepEngine,
  Field, TextInput, Chip, OperationLog,
} from '../../components/algorithms'
import { Button } from '../../components/ui'

let NID = 100
const mkNode = (v, children = []) => ({ id: NID++, v, children })

const seedTree = () => ({
  id: 1, v: 'A', children: [
    { id: 2, v: 'B', children: [
      { id: 5, v: 'E', children: [] },
      { id: 6, v: 'F', children: [] },
    ]},
    { id: 3, v: 'C', children: [
      { id: 7, v: 'G', children: [] },
    ]},
    { id: 4, v: 'D', children: [
      { id: 8, v: 'H', children: [] },
      { id: 9, v: 'I', children: [] },
    ]},
  ],
})

/* ---------- traversals ---------- */

function preOrder(node, out = []) {
  if (!node) return out
  out.push({ id: node.id, v: node.v })
  for (const c of node.children) preOrder(c, out)
  return out
}
function postOrder(node, out = []) {
  if (!node) return out
  for (const c of node.children) postOrder(c, out)
  out.push({ id: node.id, v: node.v })
  return out
}
function inOrderNary(node, out = []) {
  if (!node) return out
  const half = Math.floor(node.children.length / 2)
  for (let i = 0; i < half; i++) inOrderNary(node.children[i], out)
  out.push({ id: node.id, v: node.v })
  for (let i = half; i < node.children.length; i++) inOrderNary(node.children[i], out)
  return out
}
function levelOrder(root) {
  const out = []
  if (!root) return out
  const q = [root]
  while (q.length) {
    const n = q.shift()
    out.push({ id: n.id, v: n.v })
    for (const c of n.children) q.push(c)
  }
  return out
}

/* ---------- layout ---------- */

function layoutTree(node) {
  // Reingold-Tilford simplified: compute subtree width first, then place.
  const H_GAP = 34, V_GAP = 60
  function measure(n) {
    if (n.children.length === 0) return { ...n, w: 1 }
    const children = n.children.map(measure)
    return { ...n, children, w: children.reduce((a, b) => a + b.w, 0) }
  }
  const measured = measure(node)
  const positions = []
  function place(n, xOffset, depth) {
    const totalW = n.w * H_GAP
    let cursor = xOffset
    const positioned = []
    for (const c of n.children) {
      const cw = c.w * H_GAP
      const cx = place(c, cursor, depth + 1)
      positioned.push({ id: c.id, x: cx })
      cursor += cw
    }
    const cx = n.children.length === 0
      ? xOffset + H_GAP / 2
      : (positioned[0].x + positioned[positioned.length - 1].x) / 2
    positions.push({ id: n.id, v: n.v, x: cx, y: depth * V_GAP + 40, children: n.children.map(c => c.id) })
    return cx
  }
  place(measured, 20, 0)
  return positions
}

function findNode(root, v) {
  if (!root) return null
  if (root.v === v) return root
  for (const c of root.children) {
    const r = findNode(c, v); if (r) return r
  }
  return null
}
function removeNode(root, v) {
  if (!root || root.v === v) return null
  return {
    ...root,
    children: root.children
      .filter(c => c.v !== v)
      .map(c => removeNode(c, v)).filter(Boolean),
  }
}
function addChild(root, parentV, val) {
  if (!root) return null
  if (root.v === parentV) {
    return { ...root, children: [...root.children, mkNode(val)] }
  }
  return { ...root, children: root.children.map(c => addChild(c, parentV, val)) }
}

/* ---------- render ---------- */

function TreeSVG({ root, visits, currentIdx }) {
  const positions = useMemo(() => layoutTree(root), [root])
  const byId = new Map(positions.map(p => [p.id, p]))
  const w = Math.max(320, Math.max(...positions.map(p => p.x)) + 30)
  const h = Math.max(200, Math.max(...positions.map(p => p.y)) + 40)
  const visited = new Set(visits.slice(0, currentIdx + 1).map(v => v.id))
  const currentId = visits[currentIdx]?.id
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      {/* edges */}
      {positions.map(p => p.children.map(cid => {
        const c = byId.get(cid); if (!c) return null
        return <line key={`${p.id}-${cid}`} x1={p.x} y1={p.y} x2={c.x} y2={c.y} stroke="#4b5563" strokeWidth={1.5} />
      }))}
      {/* nodes */}
      {positions.map(p => {
        const isCurrent = p.id === currentId
        const isVisited = visited.has(p.id) && !isCurrent
        const tone = isCurrent ? { fill: '#78350f', stroke: '#fbbf24', text: '#fef3c7' }
                   : isVisited ? { fill: '#064e3b', stroke: '#34d399', text: '#d1fae5' }
                   : { fill: '#1f2937', stroke: '#9ca3af', text: '#f3f4f6' }
        return (
          <motion.g key={p.id} initial={false} animate={{ x: p.x, y: p.y }} transition={{ type: 'spring', stiffness: 220, damping: 24 }}>
            {isCurrent && (
              <motion.circle r={22} fill="none" stroke="#fbbf24" strokeWidth={2}
                animate={{ r: [20, 28, 20], opacity: [0.7, 0, 0.7] }} transition={{ duration: 1.2, repeat: Infinity }} />
            )}
            <circle r={18} fill={tone.fill} stroke={tone.stroke} strokeWidth={2} />
            <text y={5} textAnchor="middle" fontSize={13} fill={tone.text} fontFamily="ui-monospace">{p.v}</text>
          </motion.g>
        )
      })}
    </svg>
  )
}

const PSEUDO = {
  pre:   ['preOrder(node):', '    visit(node)', '    for c in node.children:', '        preOrder(c)'],
  in:    ['inOrder(node):     # N-ary variant', '    half = children.length / 2', '    for c in children[0..half]: inOrder(c)', '    visit(node)', '    for c in children[half..]: inOrder(c)'],
  post:  ['postOrder(node):', '    for c in node.children:', '        postOrder(c)', '    visit(node)'],
  level: ['levelOrder(root):', '    queue = [root]', '    while queue:', '        n = queue.dequeue()', '        visit(n)', '        for c in n.children: queue.enqueue(c)'],
}

export default function Trees() {
  const [root, setRoot] = useState(seedTree())
  const [order, setOrder] = useState('pre')
  const visits = useMemo(() => {
    if (order === 'pre') return preOrder(root)
    if (order === 'in') return inOrderNary(root)
    if (order === 'post') return postOrder(root)
    return levelOrder(root)
  }, [root, order])
  const engine = useStepEngine({ frameCount: Math.max(1, visits.length) })
  const currentIdx = Math.min(engine.i, visits.length - 1)

  const [parent, setParent] = useState('B')
  const [child, setChild] = useState('J')
  const [delV, setDelV] = useState('F')

  const doAdd = () => {
    if (!parent || !child) return
    setRoot(prev => addChild(prev, parent, child))
    engine.reset()
  }
  const doRemove = () => { setRoot(prev => removeNode(prev, delV)); engine.reset() }
  const doReset = () => { NID = 100; setRoot(seedTree()); engine.reset() }

  const visitFrames = useMemo(() => visits.map((v, i) => ({ msg: `visit ${v.v}`, i })), [visits])

  return (
    <TopicShell slug="trees" title="Trees">
      <ExplanationBlock>
        <p>
          A <b>tree</b> is a connected graph with no cycles and one designated
          root. Every non-root node has exactly one parent; nodes with no
          children are called leaves. When we say "N-ary" we mean the branching
          factor is unbounded — each parent can have any number of children.
        </p>
        <p>
          Four canonical traversals cover most needs:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>Pre-order</b> — visit node, then its children. Used for tree
            serialisation, expression cloning, and rendering an outline.</li>
          <li><b>In-order</b> — for a binary tree, visits left → self → right,
            which returns values in sorted order for a BST. For N-ary trees
            "in-order" is not standard; we use half-then-self-then-half.</li>
          <li><b>Post-order</b> — visit children first, then the node.
            Used for computing subtree sums, freeing memory bottom-up,
            expression evaluation.</li>
          <li><b>Level-order</b> — BFS from the root. Used for shortest depth,
            printing by level, tree diffing algorithms.</li>
        </ul>
        <p>
          Click a traversal, then Play or Step through it. The active node
          pulses amber and the visit order accumulates in the strip below.
        </p>
      </ExplanationBlock>

      <VisualiserSection>
        <VizPanel>
          <TreeSVG root={root} visits={visits} currentIdx={currentIdx} />
          <div className="mt-3">
            <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Visit order</div>
            <div className="flex flex-wrap gap-1">
              {visits.slice(0, currentIdx + 1).map((v, i) => (
                <motion.span
                  key={`${v.id}-${i}`}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-emerald-900/40 border border-emerald-700 text-emerald-200"
                >
                  {v.v}
                </motion.span>
              ))}
            </div>
          </div>
          <div className="mt-3">
            <OperationLog frames={visitFrames} activeFrame={currentIdx} />
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
            stepLabel="Next visit"
          />
          <div className="h-px bg-white/10 my-1" />

          <Field label="Traversal" helper="Pick an order, then Play.">
            <div className="grid grid-cols-2 gap-1.5">
              {['pre', 'in', 'post', 'level'].map(k => (
                <Button
                  key={k}
                  variant={order === k ? 'primary' : 'ghost'}
                  size="small"
                  onClick={() => { setOrder(k); engine.reset() }}
                >{k}-order</Button>
              ))}
            </div>
          </Field>

          <Field label="Add child" helper="Attaches a new child under the named parent.">
            <div className="grid grid-cols-2 gap-1.5">
              <TextInput value={parent} onChange={setParent} placeholder="parent" />
              <TextInput value={child} onChange={setChild} placeholder="new" />
            </div>
            <Button variant="primary" size="small" onClick={doAdd} className="mt-1.5 w-full">+ child</Button>
          </Field>

          <Field label="Remove subtree" helper="Removes node and everything under it.">
            <TextInput value={delV} onChange={setDelV} placeholder="value" />
            <Button variant="danger" size="small" onClick={doRemove} className="mt-1.5 w-full">- subtree</Button>
          </Field>

          <Button variant="subtle" size="small" onClick={doReset}>Reset tree</Button>
        </ControlsPanel>
      </VisualiserSection>

      <PseudocodeBlock
        title={`Pseudocode — ${order}-order`}
        lines={PSEUDO[order]}
        activeLine={currentIdx >= 0 ? 1 : -1}
      />

      <ComplexityTable rows={[
        { op: 'traversal', best: 'O(n)', avg: 'O(n)', worst: 'O(n)', space: 'O(h)' },
        { op: 'search (unsorted)', best: 'O(1)', avg: 'O(n)', worst: 'O(n)', space: 'O(h)' },
        { op: 'insert child', best: 'O(1)', avg: 'O(1)', worst: 'O(1)', space: 'O(1)' },
        { op: 'delete subtree', best: 'O(1)', avg: 'O(k)', worst: 'O(k)', space: 'O(h)' },
      ]} />

      <RealWorldCard>
        <p>
          File systems are trees (directories → subdirectories → files). HTML
          DOM is a tree — every element is a node. Abstract syntax trees are
          what every compiler and parser produces. Game-tree search (chess,
          Go, MCTS) reasons over trees. React reconciles component trees.
          B-trees back nearly every database index — one N-ary tree per
          index, one node per disk page.
        </p>
      </RealWorldCard>
    </TopicShell>
  )
}
