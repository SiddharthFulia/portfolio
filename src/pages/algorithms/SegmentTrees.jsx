// Segment Trees — range sum / range min with O(log n) point update
// and range query.
//
// We build a segment tree over an array. Each internal node stores
// the reduction (sum or min) over a range [lo, hi]. Point update
// walks a path from leaf to root. Range query visits a logarithmic
// set of segments — this is the classic "left border rises, right
// border falls" walk which the viz highlights amber.
//
// Correctness — implementation is the standard recursive segment
// tree from cp-algorithms.com. I sanity-checked:
//   arr = [1,3,-2,8,7]; range sum [1,3] = 3 + -2 + 8 = 9 ✓
//   arr = [5,2,4,7,1]; range min [0,4] = 1 ✓

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ExplanationBlock, VisualiserSection, VizPanel, ControlsPanel,
  MultiLangCode, ComplexityTable, RealWorldCard, StepControls, useStepEngine,
  Field, TextInput, Chip, OperationLog,
} from '../../components/algorithms'
import { Button } from '../../components/ui'
import { SEG_QUERY_CODE, SEG_UPDATE_CODE } from './code/SegmentTrees'

const OP_SUM = 'sum'
const OP_MIN = 'min'
const IDENTITY = { [OP_SUM]: 0, [OP_MIN]: Infinity }
const combine = (op, a, b) => op === OP_SUM ? a + b : Math.min(a, b)

function build(arr, op) {
  const n = arr.length
  const seg = new Array(4 * n).fill(IDENTITY[op])
  function _build(node, lo, hi) {
    if (lo === hi) { seg[node] = arr[lo]; return }
    const mid = (lo + hi) >> 1
    _build(node * 2, lo, mid)
    _build(node * 2 + 1, mid + 1, hi)
    seg[node] = combine(op, seg[node * 2], seg[node * 2 + 1])
  }
  if (n > 0) _build(1, 0, n - 1)
  return seg
}

function planQuery(seg, arr, op, ql, qh) {
  const frames = []
  const n = arr.length
  function _q(node, lo, hi) {
    frames.push({ node, lo, hi, msg: `visit node ${node} [${lo},${hi}]` })
    if (qh < lo || hi < ql) {
      frames.push({ node, lo, hi, msg: `disjoint — return identity`, skip: true })
      return IDENTITY[op]
    }
    if (ql <= lo && hi <= qh) {
      frames.push({ node, lo, hi, msg: `fully inside — return ${seg[node]}`, take: true })
      return seg[node]
    }
    const mid = (lo + hi) >> 1
    const L = _q(node * 2, lo, mid)
    const R = _q(node * 2 + 1, mid + 1, hi)
    const c = combine(op, L, R)
    frames.push({ node, lo, hi, msg: `combine left(${L}) with right(${R}) = ${c}`, take: false })
    return c
  }
  const result = _q(1, 0, n - 1)
  frames.push({ msg: `query [${ql}, ${qh}] = ${result}`, final: true, result })
  return { frames, result }
}

function planUpdate(seg, arr, op, idx, val) {
  const frames = []
  const n = arr.length
  const newSeg = [...seg]
  const newArr = [...arr]
  newArr[idx] = val
  function _u(node, lo, hi) {
    frames.push({ node, lo, hi, msg: `visit node ${node} [${lo},${hi}]` })
    if (lo === hi) {
      newSeg[node] = val
      frames.push({ node, lo, hi, msg: `leaf — set to ${val}`, take: true })
      return
    }
    const mid = (lo + hi) >> 1
    if (idx <= mid) _u(node * 2, lo, mid)
    else _u(node * 2 + 1, mid + 1, hi)
    newSeg[node] = combine(op, newSeg[node * 2], newSeg[node * 2 + 1])
    frames.push({ node, lo, hi, msg: `recombine node ${node} = ${newSeg[node]}` })
  }
  _u(1, 0, n - 1)
  return { frames, newSeg, newArr }
}

/* ---------- layout ---------- */

function collectNodes(arr) {
  // Compute (node, lo, hi) for every node so we can lay it out level-by-level.
  const nodes = []
  const n = arr.length
  function walk(node, lo, hi, depth) {
    nodes.push({ node, lo, hi, depth })
    if (lo === hi) return
    const mid = (lo + hi) >> 1
    walk(node * 2, lo, mid, depth + 1)
    walk(node * 2 + 1, mid + 1, hi, depth + 1)
  }
  if (n > 0) walk(1, 0, n - 1, 0)
  return nodes
}

function layout(arr) {
  const nodes = collectNodes(arr)
  const depths = new Map()
  for (const n of nodes) { if (!depths.has(n.depth)) depths.set(n.depth, []); depths.get(n.depth).push(n) }
  const H = 62
  const w = 480
  const positioned = []
  for (const [depth, list] of depths) {
    list.forEach((nd, idx) => {
      positioned.push({ ...nd, x: (idx + 0.5) * w / list.length, y: depth * H + 26 })
    })
  }
  return { positioned, w, h: (depths.size) * H + 20 }
}

function SegSVG({ seg, arr, activeNode, take, skip }) {
  const { positioned, w, h } = useMemo(() => layout(arr), [arr])
  const byNode = new Map(positioned.map(p => [p.node, p]))
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      {positioned.map(p => {
        const parent = byNode.get(p.node >> 1)
        if (!parent) return null
        return <line key={`e-${p.node}`} x1={parent.x} y1={parent.y} x2={p.x} y2={p.y} stroke="#4b5563" strokeWidth={1.4} />
      })}
      {positioned.map(p => {
        const isActive = p.node === activeNode
        const isTake = take && take.has(p.node)
        const isSkip = skip && skip.has(p.node)
        const tone = isActive ? { fill: '#78350f', stroke: '#fbbf24', text: '#fef3c7' }
                  : isTake   ? { fill: '#064e3b', stroke: '#34d399', text: '#d1fae5' }
                  : isSkip   ? { fill: '#3f0e1e', stroke: '#f43f5e', text: '#ffe4e6' }
                  : { fill: '#1f2937', stroke: '#9ca3af', text: '#f3f4f6' }
        return (
          <motion.g key={`n-${p.node}`} initial={false} animate={{ x: p.x, y: p.y }} transition={{ type: 'spring', stiffness: 240, damping: 24 }}>
            <rect x={-24} y={-14} width={48} height={28} rx={5} fill={tone.fill} stroke={tone.stroke} strokeWidth={1.5} />
            <text y={-2} textAnchor="middle" fontSize={9} fill={tone.text} fontFamily="ui-monospace">[{p.lo},{p.hi}]</text>
            <text y={9} textAnchor="middle" fontSize={10} fontWeight="bold" fill={tone.text} fontFamily="ui-monospace">{seg[p.node]}</text>
          </motion.g>
        )
      })}
    </svg>
  )
}

function ArrayStrip({ arr, hi }) {
  return (
    <div className="flex flex-wrap gap-1 justify-center">
      {arr.map((v, i) => {
        const inR = hi && i >= hi.lo && i <= hi.hi
        return (
          <div
            key={i}
            className="w-10 h-11 flex flex-col items-center justify-center rounded border font-mono text-xs"
            style={{
              background: inR ? '#78350f' : '#111827',
              borderColor: inR ? '#fbbf24' : '#4b5563',
              color: inR ? '#fef3c7' : '#f3f4f6',
            }}
          >
            <span>{v}</span>
            <span className="text-[9px] text-gray-500">{i}</span>
          </div>
        )
      })}
    </div>
  )
}

const INITIAL = [1, 3, -2, 8, 7, 4, 6, 5]

export default function SegmentTrees() {
  const [arr, setArr] = useState(INITIAL)
  const [op, setOp] = useState(OP_SUM)
  const seg = useMemo(() => build(arr, op), [arr, op])
  const [ql, setQl] = useState('1')
  const [qh, setQh] = useState('4')
  const [ui, setUi] = useState('3')
  const [uv, setUv] = useState('10')
  const [mode, setMode] = useState('query')
  const [frames, setFrames] = useState([{ msg: 'ready' }])
  const engine = useStepEngine({ frameCount: frames.length })
  const current = frames[engine.i]

  const [pendingSeg, setPendingSeg] = useState(null)
  const [pendingArr, setPendingArr] = useState(null)

  const doQuery = () => {
    const l = Math.max(0, Number(ql) | 0), h = Math.min(arr.length - 1, Number(qh) | 0)
    const { frames } = planQuery(seg, arr, op, l, h)
    setFrames(frames); setMode('query'); engine.reset(); setPendingSeg(null); setPendingArr(null)
  }
  const doUpdate = () => {
    const i = Math.max(0, Math.min(arr.length - 1, Number(ui) | 0))
    const v = Number(uv) | 0
    const { frames, newSeg, newArr } = planUpdate(seg, arr, op, i, v)
    setFrames(frames); setMode('update'); setPendingSeg(newSeg); setPendingArr(newArr); engine.reset()
  }
  // Commit pending state after user finishes stepping through the frames.
  const commit = () => {
    if (pendingArr) { setArr(pendingArr); setPendingSeg(null); setPendingArr(null) }
  }

  const activeLine = useMemo(() => {
    if (!current || !current.msg) return -1
    if (mode === 'query') {
      if (current.msg.includes('disjoint')) return 2
      if (current.msg.includes('fully inside')) return 4
      if (current.msg.includes('combine')) return 8
      if (current.msg.includes('visit')) return 0
      return -1
    }
    if (current.msg.includes('leaf')) return 2
    if (current.msg.includes('recombine')) return 7
    return -1
  }, [current, mode])

  const takeSet = useMemo(() => {
    const s = new Set()
    frames.slice(0, engine.i + 1).forEach(f => { if (f.take) s.add(f.node) })
    return s
  }, [frames, engine.i])
  const skipSet = useMemo(() => {
    const s = new Set()
    frames.slice(0, engine.i + 1).forEach(f => { if (f.skip) s.add(f.node) })
    return s
  }, [frames, engine.i])

  return (
    <><ExplanationBlock>
        <p>
          A <b>segment tree</b> supports range queries (sum, min, max, gcd, …)
          + point updates in O(log n) each. It stores an associative reduction
          of each contiguous range in an internal node. The root covers the
          whole array; its two children split it in half; leaves are single
          elements.
        </p>
        <p>
          <b>Query [l, r]:</b> walk down from the root, at each node classify
          it as disjoint (return identity), fully inside (return the stored
          value), or partial (recurse both halves and combine). Only O(log n)
          nodes are ever "fully inside" — that's why the query cost is
          logarithmic even though the tree has ~2n nodes.
        </p>
        <p>
          <b>Update idx = v:</b> walk down to the leaf, set it, then
          re-combine every node on the path back to the root. Exactly
          O(log n) nodes touched.
        </p>
        <p>
          Green nodes are values pulled into the answer. Red nodes were
          visited but disjoint (skipped). Amber is the node currently being
          examined.
        </p>
      </ExplanationBlock>

      <VisualiserSection>
        <VizPanel>
          <SegSVG
            seg={mode === 'update' && pendingSeg ? pendingSeg : seg}
            arr={arr}
            activeNode={current?.node}
            take={takeSet}
            skip={skipSet}
          />
          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Backing array</div>
            <ArrayStrip arr={mode === 'update' && pendingArr ? pendingArr : arr} hi={mode === 'query' && current ? { lo: Number(ql) | 0, hi: Number(qh) | 0 } : null} />
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
          <Field label="Reduction" helper="Tree rebuilds when you switch.">
            <div className="grid grid-cols-2 gap-1.5">
              <Button variant={op === OP_SUM ? 'primary' : 'ghost'} size="small" onClick={() => setOp(OP_SUM)}>range sum</Button>
              <Button variant={op === OP_MIN ? 'primary' : 'ghost'} size="small" onClick={() => setOp(OP_MIN)}>range min</Button>
            </div>
          </Field>

          <Field label="Query" helper="Inclusive range [ql, qh].">
            <div className="grid grid-cols-2 gap-1.5">
              <TextInput value={ql} onChange={setQl} placeholder="ql" />
              <TextInput value={qh} onChange={setQh} placeholder="qh" />
            </div>
            <Button variant="primary" size="small" onClick={doQuery} className="mt-1.5 w-full">query</Button>
          </Field>

          <Field label="Point update" helper="Commit happens on Reset.">
            <div className="grid grid-cols-2 gap-1.5">
              <TextInput value={ui} onChange={setUi} placeholder="idx" />
              <TextInput value={uv} onChange={setUv} placeholder="val" />
            </div>
            <Button variant="accent" size="small" onClick={doUpdate} className="mt-1.5 w-full">update</Button>
            <Button variant="success" size="small" onClick={commit} className="mt-1.5 w-full">Commit update</Button>
          </Field>
          <Button variant="subtle" size="small" onClick={() => { setArr(INITIAL); engine.reset() }}>Reset array</Button>
        </ControlsPanel>
      </VisualiserSection>

      <MultiLangCode
        title={mode === 'update' ? 'Implementation — point update' : 'Implementation — range query'}
        code={mode === 'update' ? SEG_UPDATE_CODE : SEG_QUERY_CODE}
        activeLines={{ pseudo: activeLine }}
      />

      <ComplexityTable rows={[
        { op: 'build',        best: 'O(n)', avg: 'O(n)', worst: 'O(n)', space: 'O(n)' },
        { op: 'range query',  best: 'O(\\log n)', avg: 'O(\\log n)', worst: 'O(\\log n)', space: 'O(n)' },
        { op: 'point update', best: 'O(\\log n)', avg: 'O(\\log n)', worst: 'O(\\log n)', space: 'O(n)' },
      ]} />

      <RealWorldCard>
        <p>
          Segment trees are a competitive-programming staple, but they show
          up in real systems anywhere you need "aggregate over a moving
          window": OLAP time-series databases (partial pre-aggregation),
          game engines (visibility BVHs are the geometric cousin — same
          divide-and-cover structure), and version control (git range-diff
          walks a similar range structure over the commit graph). Redis's
          RedisTimeSeries module uses a segment-tree-like index for range
          aggregates.
        </p>
      </RealWorldCard></>
  )
}
