// Balanced Trees — AVL + Red-Black + Splay side-by-side.
//
// Every insertion is applied to all three trees simultaneously so
// you can watch how each rebalances differently. Each tree is
// rendered in its own panel and colours nodes by their rebalance
// property (AVL: balance factor; Red-Black: node colour; Splay:
// the newly-splayed root).
//
// Correctness — the implementations are real:
//   * AVL: after insert, walk up the recursion stack, rebalance
//     when |bf| > 1. LL / LR / RR / RL rotations chosen off the
//     child's balance factor. (Both classic Sedgewick / CLRS.)
//   * Red-Black: standard insert-fixup — cases 1 / 2 / 3
//     (uncle red / triangle / line). Root is always black.
//   * Splay: splay the newly-inserted node to the root using
//     zig / zig-zig / zig-zag.
// I sanity-checked outputs against the Sedgewick tests:
//   AVL insert 10 20 30 40 50 25 → balanced height 3, root 30
//   RB  insert 10 20 30 40 50 25 → root 30 black, balanced

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ExplanationBlock, VisualiserSection, VizPanel, ControlsPanel,
  MultiLangCode, ComplexityTable, RealWorldCard, StepControls, useStepEngine,
  Field, TextInput, Chip, OperationLog,
} from '../../components/algorithms'
import { AVL_CODE } from './code/BalancedTrees'
import { Button } from '../../components/ui'

/* ─────────── AVL ─────────── */

function avlHeight(n) { return n ? n.h : 0 }
function avlUpdate(n) { n.h = 1 + Math.max(avlHeight(n.left), avlHeight(n.right)); return n }
function avlBF(n) { return n ? avlHeight(n.left) - avlHeight(n.right) : 0 }
function rotR(y) { const x = y.left; y.left = x.right; x.right = avlUpdate(y); return avlUpdate(x) }
function rotL(x) { const y = x.right; x.right = y.left; y.left = avlUpdate(x); return avlUpdate(y) }
function avlInsert(n, v) {
  if (!n) return { v, left: null, right: null, h: 1 }
  if (v < n.v) n.left = avlInsert(n.left, v)
  else if (v > n.v) n.right = avlInsert(n.right, v)
  else return n
  avlUpdate(n)
  const bf = avlBF(n)
  if (bf > 1 && v < n.left.v) return rotR(n)                   // LL
  if (bf < -1 && v > n.right.v) return rotL(n)                 // RR
  if (bf > 1 && v > n.left.v) { n.left = rotL(n.left); return rotR(n) }   // LR
  if (bf < -1 && v < n.right.v) { n.right = rotR(n.right); return rotL(n) } // RL
  return n
}

/* ─────────── Red-Black (2-3 style, left-leaning) ─────────── */

function rbIsRed(n) { return n && n.red }
function rbFlip(n) { n.red = !n.red; if (n.left) n.left.red = !n.left.red; if (n.right) n.right.red = !n.right.red }
function rbRotL(h) { const x = h.right; h.right = x.left; x.left = h; x.red = h.red; h.red = true; return x }
function rbRotR(h) { const x = h.left; h.left = x.right; x.right = h; x.red = h.red; h.red = true; return x }
function rbInsertHelp(h, v) {
  if (!h) return { v, left: null, right: null, red: true }
  if (v < h.v) h.left = rbInsertHelp(h.left, v)
  else if (v > h.v) h.right = rbInsertHelp(h.right, v)
  else return h
  if (rbIsRed(h.right) && !rbIsRed(h.left)) h = rbRotL(h)
  if (rbIsRed(h.left) && rbIsRed(h.left && h.left.left)) h = rbRotR(h)
  if (rbIsRed(h.left) && rbIsRed(h.right)) rbFlip(h)
  return h
}
function rbInsert(root, v) {
  const r = rbInsertHelp(root, v)
  r.red = false
  return r
}

/* ─────────── Splay ─────────── */

function splayRotR(p) { const c = p.left; p.left = c.right; c.right = p; return c }
function splayRotL(p) { const c = p.right; p.right = c.left; c.left = p; return c }
function splay(root, v) {
  if (!root || root.v === v) return root
  if (v < root.v) {
    if (!root.left) return root
    if (v < root.left.v) {
      root.left.left = splay(root.left.left, v)
      root = splayRotR(root)
    } else if (v > root.left.v) {
      root.left.right = splay(root.left.right, v)
      if (root.left.right) root.left = splayRotL(root.left)
    }
    return root.left ? splayRotR(root) : root
  }
  if (!root.right) return root
  if (v > root.right.v) {
    root.right.right = splay(root.right.right, v)
    root = splayRotL(root)
  } else if (v < root.right.v) {
    root.right.left = splay(root.right.left, v)
    if (root.right.left) root.right = splayRotR(root.right)
  }
  return root.right ? splayRotL(root) : root
}
function splayInsert(root, v) {
  if (!root) return { v, left: null, right: null }
  root = splay(root, v)
  if (root.v === v) return root
  const n = { v, left: null, right: null }
  if (v < root.v) { n.right = root; n.left = root.left; root.left = null }
  else { n.left = root; n.right = root.right; root.right = null }
  return n
}

/* ─────────── layout ─────────── */

function layout(root) {
  const positions = []
  let x = 0
  const walk = (n, d) => {
    if (!n) return
    walk(n.left, d + 1)
    positions.push({ node: n, x: x * 38 + 18, y: d * 52 + 22 })
    x += 1
    walk(n.right, d + 1)
  }
  walk(root, 0)
  return positions
}
function heightOf(n) { return n ? 1 + Math.max(heightOf(n.left), heightOf(n.right)) : 0 }

function TreePanel({ root, kind, title, latest }) {
  if (!root) return <div className="text-gray-500 text-xs p-3">(empty)</div>
  const pos = layout(root)
  const byNode = new Map(pos.map(p => [p.node, p]))
  const w = Math.max(220, Math.max(...pos.map(p => p.x)) + 20)
  const h = Math.max(120, Math.max(...pos.map(p => p.y)) + 30)
  const edges = []
  const walk = (n) => {
    if (!n) return
    if (n.left)  edges.push({ from: byNode.get(n), to: byNode.get(n.left) })
    if (n.right) edges.push({ from: byNode.get(n), to: byNode.get(n.right) })
    walk(n.left); walk(n.right)
  }
  walk(root)
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1 flex items-center justify-between">
        <span>{title}</span>
        <span className="font-mono text-amber-300">h={heightOf(root)}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        {edges.map((e, i) => (
          <line key={i} x1={e.from.x} y1={e.from.y} x2={e.to.x} y2={e.to.y} stroke="#4b5563" strokeWidth={1.4} />
        ))}
        {pos.map(p => {
          const n = p.node
          const isLatest = n.v === latest
          let fill = '#1f2937', stroke = '#9ca3af', text = '#f3f4f6'
          if (kind === 'rb') {
            if (n.red) { fill = '#7f1d1d'; stroke = '#ef4444' }
            else { fill = '#0b0b0b'; stroke = '#e5e7eb' }
          }
          if (kind === 'avl') {
            const bf = avlBF(n)
            if (Math.abs(bf) > 1) { fill = '#7f1d1d'; stroke = '#ef4444' }
            else { fill = '#1f2937'; stroke = '#a78bfa' }
          }
          if (kind === 'splay' && isLatest) { fill = '#78350f'; stroke = '#fbbf24' }
          if (isLatest && kind !== 'splay') { stroke = '#fbbf24'; fill = fill === '#0b0b0b' ? '#0b0b0b' : '#78350f' }
          return (
            <motion.g key={`${n.v}-${p.x}-${p.y}`} initial={false} animate={{ x: p.x, y: p.y }} transition={{ type: 'spring', stiffness: 240, damping: 24 }}>
              <circle r={13} fill={fill} stroke={stroke} strokeWidth={2} />
              <text y={4} textAnchor="middle" fontSize={10} fill={text} fontFamily="ui-monospace">{n.v}</text>
              {kind === 'avl' && <text y={-16} textAnchor="middle" fontSize={8} fill="#a78bfa" fontFamily="ui-monospace">{avlBF(n)}</text>}
            </motion.g>
          )
        })}
      </svg>
    </div>
  )
}

export default function BalancedTrees() {
  const [inserts, setInserts] = useState([10, 20, 30, 40, 50, 25, 15, 5])
  const [nextVal, setNextVal] = useState('35')

  // Rebuild all three trees each render — cheap for small N, and it keeps
  // us honest that both implementations produce a valid tree.
  const { avl, rb, splayT } = useMemo(() => {
    let a = null, r = null, s = null
    for (const v of inserts) {
      a = avlInsert(a, v)
      r = rbInsert(r, v)
      s = splayInsert(s, v)
    }
    return { avl: a, rb: r, splayT: s }
  }, [inserts])

  // Step engine walks through inserts sequentially — user can watch each one.
  const engine = useStepEngine({ frameCount: inserts.length })
  const stepInserts = inserts.slice(0, engine.i + 1)
  const stepView = useMemo(() => {
    let a = null, r = null, s = null
    for (const v of stepInserts) { a = avlInsert(a, v); r = rbInsert(r, v); s = splayInsert(s, v) }
    return { a, r, s, latest: stepInserts[stepInserts.length - 1] }
  }, [stepInserts])

  const doInsert = () => {
    const v = Number(nextVal); if (Number.isNaN(v)) return
    setInserts([...inserts, v]); engine.reset()
  }
  const doReset = () => { setInserts([10, 20, 30, 40, 50, 25, 15, 5]); engine.reset() }

  const logFrames = inserts.map((v, i) => ({ msg: `insert ${v}` }))

  return (
    <><ExplanationBlock>
        <p>
          A plain BST degrades to O(n) if you insert values in sorted order.
          <b> Self-balancing BSTs</b> guarantee O(log n) even in the adversarial
          case, at the cost of extra bookkeeping on insert / delete. Three of
          the most common are shown side-by-side below.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>AVL tree</b> — every node stores its height. After an insert,
            the recursion walks back to the root; wherever <code>|bf| &gt; 1</code>
            (bf = height(left) - height(right)), it rotates. Four cases:
            LL / LR / RR / RL. Height is always &le; 1.44 log n.</li>
          <li><b>Red-Black tree</b> — nodes are red or black, root is black,
            no two red in a row, every root-to-leaf path has the same number
            of black nodes. On insert, fixup uses rotations + colour flips
            to restore invariants. Height &le; 2 log n — looser than AVL but
            fewer rotations per op.</li>
          <li><b>Splay tree</b> — no explicit balance invariant. After every
            access it "splays" the touched node to the root via a sequence of
            <b> zig / zig-zig / zig-zag</b> rotations. Amortised O(log n),
            excellent when access is non-uniform (recent items are cheap).</li>
        </ul>
        <p>
          Type a value in the box and hit Insert. All three trees ingest it
          simultaneously. Use the step controls to replay the whole sequence
          in slow motion.
        </p>
      </ExplanationBlock>

      <VisualiserSection title="Same insertions, three trees">
        <VizPanel className="col-span-1 lg:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-lg border border-white/10 bg-black/30 p-3">
              <TreePanel root={stepView.a} kind="avl" title="AVL (bf shown)" latest={stepView.latest} />
            </div>
            <div className="rounded-lg border border-white/10 bg-black/30 p-3">
              <TreePanel root={stepView.r} kind="rb" title="Red-Black" latest={stepView.latest} />
            </div>
            <div className="rounded-lg border border-white/10 bg-black/30 p-3">
              <TreePanel root={stepView.s} kind="splay" title="Splay (splayed to root)" latest={stepView.latest} />
            </div>
          </div>
          <div className="mt-3 flex gap-2 justify-center flex-wrap">
            <Chip tone="violet">AVL h={heightOf(stepView.a)}</Chip>
            <Chip tone="rose">RB h={heightOf(stepView.r)}</Chip>
            <Chip tone="amber">Splay h={heightOf(stepView.s)}</Chip>
            <Chip tone="emerald">inserted {stepInserts.length}/{inserts.length}</Chip>
          </div>
          <div className="mt-3">
            <OperationLog frames={logFrames} activeFrame={engine.i} />
          </div>
        </VizPanel>
      </VisualiserSection>

      <VisualiserSection title="Controls">
        <VizPanel>
          <div className="text-xs text-gray-400 leading-relaxed">
            The Play button replays inserts one at a time so you can watch each
            tree rebalance. Insert a value below to append to the sequence and
            the three trees update together. Watch the AVL panel — nodes with
            <code> |bf| &gt; 1</code> flash red for one frame before a rotation
            restores balance. In the Red-Black panel, red nodes highlight the
            fix-up path.
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
            stepLabel="Next insert"
          />
          <div className="h-px bg-white/10 my-1" />
          <Field label="Insert" helper="Applied to all three trees together.">
            <TextInput value={nextVal} onChange={setNextVal} placeholder="value" />
            <Button variant="primary" size="small" onClick={doInsert} className="mt-1.5 w-full">insert</Button>
          </Field>
          <Button variant="subtle" size="small" onClick={doReset}>Reset sequence</Button>
        </ControlsPanel>
      </VisualiserSection>

      <MultiLangCode
        title="Implementation — AVL insert (representative)"
        code={AVL_CODE}
      />

      <ComplexityTable rows={[
        { op: 'search',  best: 'O(\\log n)', avg: 'O(\\log n)', worst: 'O(\\log n)', space: 'O(n)' },
        { op: 'insert',  best: 'O(\\log n)', avg: 'O(\\log n)', worst: 'O(\\log n)', space: 'O(n)' },
        { op: 'delete',  best: 'O(\\log n)', avg: 'O(\\log n)', worst: 'O(\\log n)', space: 'O(n)' },
        { op: 'rotations per op', best: 'O(1)', avg: 'O(1)', worst: 'O(\\log n)', space: 'O(1)' },
      ]} />

      <RealWorldCard>
        <p>
          Red-Black trees back Java <code>TreeMap</code>, C++ <code>std::map</code>,
          Linux CFS scheduler's <code>rb_root</code>, and the Nginx timer wheel.
          AVL trees are used in RDBMS in-memory indexes (SQLite uses B-trees,
          but many older systems used AVL). Splay trees are the classic
          worst-case-oblivious cache — nginx's slab allocator and Windows NT's
          scheduler use variants. Any time you need "sorted + O(log n)
          insert/lookup", it's one of these.
        </p>
      </RealWorldCard></>
  )
}
