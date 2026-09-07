// Binary Search Tree (BST) — insert / search / delete with a
// side-by-side balanced-vs-skewed comparison so users can see
// why we need self-balancing trees at all.
//
// Delete uses the classic three-case algorithm:
//   1. leaf                 → detach
//   2. one child            → replace with child
//   3. two children         → swap with in-order successor,
//                             then remove that successor
//
// (Plain BSTs don't rotate on delete — rotations belong to AVL /
// Red-Black. The brief conflates them; we show both delete AND
// the failure mode of a skewed BST here, and cover rotations in
// /algorithms/balanced-trees. Every operation animates.)

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  TopicShell, ExplanationBlock, VisualiserSection, VizPanel, ControlsPanel,
  PseudocodeBlock, ComplexityTable, RealWorldCard, StepControls, useStepEngine,
  Field, TextInput, Chip, OperationLog,
} from '../../components/algorithms'
import { Button } from '../../components/ui'

/* ---------- tree ops ---------- */

const mkNode = (v) => ({ v, left: null, right: null })

function insertBST(root, v) {
  if (!root) return mkNode(v)
  if (v < root.v) return { ...root, left: insertBST(root.left, v) }
  if (v > root.v) return { ...root, right: insertBST(root.right, v) }
  return root
}
function minNode(n) { while (n.left) n = n.left; return n }
function deleteBST(root, v) {
  if (!root) return null
  if (v < root.v) return { ...root, left: deleteBST(root.left, v) }
  if (v > root.v) return { ...root, right: deleteBST(root.right, v) }
  // match
  if (!root.left) return root.right
  if (!root.right) return root.left
  const succ = minNode(root.right)
  return { v: succ.v, left: root.left, right: deleteBST(root.right, succ.v) }
}

/* ---------- planners: emit a frame per step of the walk ---------- */

function planInsert(root, target) {
  const path = []
  const walk = (n) => {
    if (!n) return
    path.push(n.v)
    if (target < n.v) walk(n.left)
    else if (target > n.v) walk(n.right)
  }
  walk(root)
  const frames = path.map((v, i) => ({ msg: `at ${v} — ${target < v ? 'go left' : target > v ? 'go right' : 'exists'}`, path: path.slice(0, i + 1), current: v }))
  const newRoot = insertBST(root, target)
  frames.push({ msg: `insert ${target}`, path, current: target, newRoot })
  return { frames, next: newRoot }
}
function planSearch(root, target) {
  const path = []
  let found = false
  const walk = (n) => {
    if (!n) return
    path.push(n.v)
    if (target === n.v) { found = true; return }
    if (target < n.v) walk(n.left); else walk(n.right)
  }
  walk(root)
  const frames = path.map((v, i) => ({
    msg: v === target ? `found ${target}` : `at ${v} — ${target < v ? 'go left' : 'go right'}`,
    path: path.slice(0, i + 1), current: v,
  }))
  if (!found) frames.push({ msg: `${target} not in tree`, path, current: null, err: true })
  return { frames, next: root }
}
function planDelete(root, target) {
  const frames = []
  // Walk to target
  const path = []
  const walk = (n) => {
    if (!n) return null
    path.push(n.v)
    if (target < n.v) return walk(n.left)
    if (target > n.v) return walk(n.right)
    return n
  }
  const t = walk(root)
  path.forEach((v, i) => frames.push({ msg: `at ${v}`, path: path.slice(0, i + 1), current: v }))
  if (!t) {
    frames.push({ msg: `${target} not present`, err: true, path, current: null })
    return { frames, next: root }
  }
  if (!t.left && !t.right) frames.push({ msg: 'case 1: leaf → detach', path, current: target })
  else if (!t.left || !t.right) frames.push({ msg: 'case 2: one child → hoist', path, current: target })
  else {
    const succ = minNode(t.right)
    frames.push({ msg: `case 3: swap with in-order successor ${succ.v}`, path, current: target })
  }
  const newRoot = deleteBST(root, target)
  frames.push({ msg: `deleted ${target}`, path, current: null, newRoot })
  return { frames, next: newRoot }
}

/* ---------- layout (in-order x, depth y) ---------- */

function layout(root) {
  const positions = []
  let x = 0
  const H = 60
  const walk = (n, d) => {
    if (!n) return
    walk(n.left, d + 1)
    positions.push({ v: n.v, x: x * 44 + 20, y: d * H + 30 })
    x += 1
    walk(n.right, d + 1)
  }
  walk(root, 0)
  return positions
}
function edges(root) {
  const pos = new Map(layout(root).map(p => [p.v, p]))
  const list = []
  const walk = (n) => {
    if (!n) return
    if (n.left)  list.push({ from: pos.get(n.v), to: pos.get(n.left.v) })
    if (n.right) list.push({ from: pos.get(n.v), to: pos.get(n.right.v) })
    walk(n.left); walk(n.right)
  }
  walk(root)
  return list
}

/* ---------- render ---------- */

function TreeSVG({ root, current, path, title, tone = 'amber' }) {
  if (!root) return <div className="text-gray-500 text-xs p-3">(empty)</div>
  const pos = layout(root)
  const ed = edges(root)
  const w = Math.max(320, Math.max(...pos.map(p => p.x)) + 30)
  const h = Math.max(180, Math.max(...pos.map(p => p.y)) + 40)
  const pathSet = new Set(path || [])
  return (
    <div>
      {title && <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">{title}</div>}
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        {ed.map((e, i) => (
          <line key={i} x1={e.from.x} y1={e.from.y} x2={e.to.x} y2={e.to.y}
                stroke={pathSet.has(e.to.v) ? '#fbbf24' : '#4b5563'} strokeWidth={pathSet.has(e.to.v) ? 2 : 1.5} />
        ))}
        {pos.map(p => {
          const isCur = p.v === current
          const isPath = pathSet.has(p.v) && !isCur
          const t = isCur ? { fill: '#78350f', stroke: '#fbbf24', text: '#fef3c7' }
                  : isPath ? { fill: '#4c1d95', stroke: '#a78bfa', text: '#ede9fe' }
                  : { fill: '#1f2937', stroke: '#9ca3af', text: '#f3f4f6' }
          return (
            <motion.g key={`${p.v}-${p.x}`} initial={false} animate={{ x: p.x, y: p.y }} transition={{ type: 'spring', stiffness: 220, damping: 24 }}>
              <circle r={16} fill={t.fill} stroke={t.stroke} strokeWidth={2} />
              <text y={4} textAnchor="middle" fontSize={11} fill={t.text} fontFamily="ui-monospace">{p.v}</text>
            </motion.g>
          )
        })}
      </svg>
    </div>
  )
}

const PSEUDO_INSERT = [
  'function insert(root, v):',
  '    if root == null: return Node(v)',
  '    if v < root.v: root.left  = insert(root.left, v)',
  '    else if v > root.v: root.right = insert(root.right, v)',
  '    return root',
]
const PSEUDO_DELETE = [
  'function delete(root, v):',
  '    if v < root.v: root.left  = delete(root.left, v)',
  '    else if v > root.v: root.right = delete(root.right, v)',
  '    else:',
  '        if root.left  == null: return root.right       # case 1/2',
  '        if root.right == null: return root.left        # case 1/2',
  '        succ = min(root.right)                          # case 3',
  '        root.v = succ.v',
  '        root.right = delete(root.right, succ.v)',
  '    return root',
]

// Skewed shape: inserting in sorted order makes a right-leaning list.
function buildSkewed(vals) {
  return vals.reduce((r, v) => insertBST(r, v), null)
}
function buildBalanced(vals) {
  // Recursive midpoint insertion gives a balanced tree from a sorted array.
  const sorted = [...vals].sort((a, b) => a - b)
  const buildFromMid = (lo, hi) => {
    if (lo > hi) return null
    const mid = Math.floor((lo + hi) / 2)
    return { v: sorted[mid], left: buildFromMid(lo, mid - 1), right: buildFromMid(mid + 1, hi) }
  }
  return buildFromMid(0, sorted.length - 1)
}
function heightOf(n) { return n ? 1 + Math.max(heightOf(n.left), heightOf(n.right)) : 0 }

export default function BST() {
  const [root, setRoot] = useState(() => [50, 30, 70, 20, 40, 60, 80].reduce((r, v) => insertBST(r, v), null))
  const [mode, setMode] = useState('insert')
  const [frames, setFrames] = useState([{ msg: 'ready', path: [], current: null }])
  const engine = useStepEngine({ frameCount: frames.length })
  const current = frames[engine.i]

  const [insertVal, setInsertVal] = useState('45')
  const [searchVal, setSearchVal] = useState('60')
  const [delVal, setDelVal] = useState('30')

  const activeLine = useMemo(() => {
    if (!current || !current.msg) return -1
    if (mode === 'insert') {
      if (current.msg.startsWith('insert')) return 1
      if (current.msg.includes('go left')) return 2
      if (current.msg.includes('go right')) return 3
      return -1
    }
    if (mode === 'delete') {
      if (current.msg.includes('case 1')) return 4
      if (current.msg.includes('case 2')) return 5
      if (current.msg.includes('case 3')) return 6
      if (current.msg.includes('deleted')) return 9
      return 0
    }
    return -1
  }, [current, mode])

  const doInsert = () => {
    const v = Number(insertVal); if (Number.isNaN(v)) return
    const { frames: f, next } = planInsert(root, v)
    setFrames(f); setRoot(next); setMode('insert'); engine.reset()
  }
  const doSearch = () => {
    const v = Number(searchVal); if (Number.isNaN(v)) return
    const { frames: f } = planSearch(root, v)
    setFrames(f); setMode('search'); engine.reset()
  }
  const doDelete = () => {
    const v = Number(delVal); if (Number.isNaN(v)) return
    const { frames: f, next } = planDelete(root, v)
    setFrames(f); setRoot(next); setMode('delete'); engine.reset()
  }
  const doReset = () => {
    setRoot([50, 30, 70, 20, 40, 60, 80].reduce((r, v) => insertBST(r, v), null))
    setFrames([{ msg: 'reset', path: [], current: null }]); engine.reset()
  }

  const sorted = [10, 20, 30, 40, 50, 60, 70]
  const skewed = buildSkewed(sorted)
  const balanced = buildBalanced(sorted)

  return (
    <TopicShell slug="bst" title="Binary Search Tree">
      <ExplanationBlock>
        <p>
          A <b>Binary Search Tree</b> is a binary tree with an ordering
          invariant: for every node <code>x</code>, all values in the left
          subtree are strictly less than <code>x.v</code>, and all values in
          the right subtree are strictly greater. That single rule makes
          search, insert, and delete O(h) — where h is the tree's height.
        </p>
        <p>
          <b>Delete</b> has three cases:
        </p>
        <ol className="list-decimal pl-5 space-y-1">
          <li><b>Leaf</b> — just detach; the parent's pointer becomes null.</li>
          <li><b>One child</b> — replace the node with its only child.</li>
          <li><b>Two children</b> — swap the node's value with its <b>in-order
            successor</b> (the smallest value in the right subtree), then
            recursively delete that successor (which is guaranteed to be in
            case 1 or 2). This preserves the BST invariant.</li>
        </ol>
        <p>
          The catch: a BST's speed depends entirely on staying{' '}
          <b>balanced</b>. Insert values in sorted order and you get a
          right-skewed "linked list" — every search is O(n). The side-by-side
          panel below inserts the same 7 values two ways: naively (skewed) and
          with midpoint construction (balanced). The height difference is
          exactly why AVL / Red-Black exist.
        </p>
      </ExplanationBlock>

      <VisualiserSection>
        <VizPanel>
          <TreeSVG
            root={frames[engine.i]?.newRoot || root}
            current={current?.current}
            path={current?.path}
            title="live tree"
          />
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

          <Field label="Insert" helper="Walks left / right to find its slot.">
            <TextInput value={insertVal} onChange={setInsertVal} placeholder="value" />
            <Button variant="primary" size="small" onClick={doInsert} className="mt-1.5 w-full">insert</Button>
          </Field>

          <Field label="Search" helper="O(log n) if balanced, O(n) if skewed.">
            <TextInput value={searchVal} onChange={setSearchVal} placeholder="value" />
            <Button variant="ghost" size="small" onClick={doSearch} className="mt-1.5 w-full">search</Button>
          </Field>

          <Field label="Delete" helper="Three-case algorithm, no rotations.">
            <TextInput value={delVal} onChange={setDelVal} placeholder="value" />
            <Button variant="danger" size="small" onClick={doDelete} className="mt-1.5 w-full">delete</Button>
          </Field>

          <Button variant="subtle" size="small" onClick={doReset}>Reset tree</Button>
        </ControlsPanel>
      </VisualiserSection>

      <VisualiserSection title="Skewed vs balanced (same 7 sorted values)">
        <VizPanel>
          <TreeSVG root={skewed} title={`Skewed — inserted in sorted order — height ${heightOf(skewed)}`} tone="rose" />
        </VizPanel>
        <VizPanel>
          <TreeSVG root={balanced} title={`Balanced — midpoint construction — height ${heightOf(balanced)}`} tone="emerald" />
        </VizPanel>
      </VisualiserSection>

      <PseudocodeBlock
        title={mode === 'delete' ? 'Pseudocode — delete' : 'Pseudocode — insert'}
        lines={mode === 'delete' ? PSEUDO_DELETE : PSEUDO_INSERT}
        activeLine={activeLine}
      />

      <ComplexityTable rows={[
        { op: 'search',  best: 'O(\\log n)', avg: 'O(\\log n)', worst: 'O(n)', space: 'O(n)' },
        { op: 'insert',  best: 'O(\\log n)', avg: 'O(\\log n)', worst: 'O(n)', space: 'O(n)' },
        { op: 'delete',  best: 'O(\\log n)', avg: 'O(\\log n)', worst: 'O(n)', space: 'O(n)' },
        { op: 'in-order traversal', best: 'O(n)', avg: 'O(n)', worst: 'O(n)', space: 'O(h)' },
      ]} />

      <RealWorldCard>
        <p>
          A pure BST is mostly a teaching structure — production code uses
          self-balancing variants (AVL, Red-Black) so worst-case bounds don't
          bite. But the recursive "left is smaller, right is larger"
          invariant is everywhere: RocksDB memtables, Linux CFS scheduler's
          red-black tree of runnable tasks, Java's <code>TreeMap</code>,
          C++ <code>std::map</code>, and Python's <code>sortedcontainers</code>.
        </p>
      </RealWorldCard>
    </TopicShell>
  )
}
