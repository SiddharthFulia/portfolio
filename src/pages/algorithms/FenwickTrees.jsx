// Fenwick Tree — a.k.a. Binary Indexed Tree (BIT).
//
// Simpler and smaller than a segment tree, only supports prefix sum
// (and by extension range sum via prefix[r] - prefix[l-1]) + point
// update. Both O(log n). The whole trick is the "low bit" — the
// least significant 1-bit of the index — which controls how far each
// step jumps.
//
// Interactive:
//   - Point update (delta)
//   - Prefix sum query up to index r
//   - Range sum via two prefix queries
// The viz highlights the exact BIT nodes touched, drawn as a bar
// chart of responsibility ranges so users can see WHY the low-bit
// trick produces O(log n) jumps.

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  TopicShell, ExplanationBlock, VisualiserSection, VizPanel, ControlsPanel,
  PseudocodeBlock, ComplexityTable, RealWorldCard, StepControls, useStepEngine,
  Field, TextInput, Chip, OperationLog,
} from '../../components/algorithms'
import { Button } from '../../components/ui'

const lowbit = (x) => x & -x

function buildBIT(arr) {
  const n = arr.length
  const bit = new Array(n + 1).fill(0)
  const update = (i, d) => { for (; i <= n; i += lowbit(i)) bit[i] += d }
  arr.forEach((v, idx) => update(idx + 1, v))
  return bit
}

function planUpdate(bit, arr, idx, delta) {
  const frames = []
  const n = arr.length
  const b = [...bit]
  frames.push({ msg: `update index ${idx} by ${delta > 0 ? '+' : ''}${delta}`, touch: null })
  let i = idx + 1
  while (i <= n) {
    b[i] += delta
    frames.push({ touch: i, msg: `bit[${i}] += ${delta}; jump +low(${i})=${lowbit(i)}`, jump: lowbit(i) })
    i += lowbit(i)
  }
  frames.push({ msg: 'done', touch: null })
  const newArr = [...arr]; newArr[idx] += delta
  return { frames, newBit: b, newArr }
}

function planPrefix(bit, r) {
  const frames = []
  frames.push({ msg: `prefix sum up to index ${r}`, touch: null })
  let sum = 0
  let i = r + 1
  while (i > 0) {
    sum += bit[i]
    frames.push({ touch: i, msg: `sum += bit[${i}] (=${bit[i]}); i -= low(${i})=${lowbit(i)}`, jump: -lowbit(i), take: true })
    i -= lowbit(i)
  }
  frames.push({ msg: `prefix[${r}] = ${sum}`, touch: null, result: sum })
  return { frames, result: sum }
}

/* ---------- render ---------- */

function BitChart({ bit, arr, activeSet, takeSet }) {
  // Each BIT index covers a range of the underlying array; draw that
  // range as a horizontal bar so it's obvious why the responsibilities
  // form a binary tree of ranges.
  const n = arr.length
  const bars = []
  for (let i = 1; i <= n; i++) {
    const lb = lowbit(i)
    const lo = i - lb, hi = i - 1
    bars.push({ i, lo, hi, val: bit[i], width: lb })
  }
  const W = 460, H_ROW = 20
  const cellW = W / n
  const yPos = (i) => {
    // Sort bars: higher lowbit = higher row so shorter bars sit at bottom.
    const order = [...bars].sort((a, b) => a.width - b.width || a.i - b.i)
    return order.findIndex(b => b.i === i) * H_ROW + 14
  }
  return (
    <svg viewBox={`0 0 ${W + 32} ${bars.length * H_ROW + 40}`} className="w-full">
      {/* index labels along the top */}
      {arr.map((v, i) => (
        <g key={`hdr-${i}`}>
          <text x={i * cellW + cellW / 2 + 16} y={10} fontSize={9} textAnchor="middle" fill="#9ca3af" fontFamily="ui-monospace">{i}</text>
          <text x={i * cellW + cellW / 2 + 16} y={bars.length * H_ROW + 32} fontSize={9} textAnchor="middle" fill="#f3f4f6" fontFamily="ui-monospace">{v}</text>
        </g>
      ))}
      {bars.map((b) => {
        const x = b.lo * cellW + 16
        const w = (b.hi - b.lo + 1) * cellW
        const y = yPos(b.i)
        const isActive = activeSet.has(b.i)
        const isTake = takeSet.has(b.i)
        const bg = isActive ? '#78350f' : isTake ? '#064e3b' : '#111827'
        const stroke = isActive ? '#fbbf24' : isTake ? '#34d399' : '#4b5563'
        return (
          <motion.g key={`b-${b.i}`} initial={false} animate={{ y }} transition={{ type: 'spring', stiffness: 220, damping: 24 }}>
            <rect x={x} width={w - 2} height={H_ROW - 4} fill={bg} stroke={stroke} rx={3} />
            <text x={x + w / 2} y={H_ROW / 2 + 3} fontSize={9} textAnchor="middle" fill="#fef3c7" fontFamily="ui-monospace">
              i={b.i} val={b.val}
            </text>
          </motion.g>
        )
      })}
    </svg>
  )
}

const PSEUDO = [
  'function update(i, delta):',
  '    while i <= n:',
  '        bit[i] += delta',
  '        i += i & -i     # low bit — climb to responsible parent',
  '',
  'function prefix(r):',
  '    s = 0',
  '    while r > 0:',
  '        s += bit[r]',
  '        r -= r & -r     # low bit — descend accumulating',
  '    return s',
]

const INITIAL = [3, 5, 2, 7, 4, 1, 6, 8]

export default function FenwickTrees() {
  const [arr, setArr] = useState(INITIAL)
  const bit = useMemo(() => buildBIT(arr), [arr])
  const [ui, setUi] = useState('3')
  const [ud, setUd] = useState('4')
  const [pr, setPr] = useState('5')
  const [rl, setRl] = useState('1')
  const [rr, setRr] = useState('5')
  const [frames, setFrames] = useState([{ msg: 'ready' }])
  const [mode, setMode] = useState('update')
  const [pendingBit, setPendingBit] = useState(null)
  const [pendingArr, setPendingArr] = useState(null)
  const engine = useStepEngine({ frameCount: frames.length })
  const current = frames[engine.i]

  const activeSet = useMemo(() => {
    const s = new Set()
    for (let k = 0; k <= engine.i; k++) {
      const f = frames[k]; if (f?.touch != null) s.add(f.touch)
    }
    if (current?.touch != null) s.clear(), s.add(current.touch)
    return s
  }, [frames, engine.i, current])
  const takeSet = useMemo(() => {
    const s = new Set()
    frames.slice(0, engine.i + 1).forEach(f => { if (f.take) s.add(f.touch) })
    return s
  }, [frames, engine.i])

  const doUpdate = () => {
    const i = Math.max(0, Math.min(arr.length - 1, Number(ui) | 0))
    const d = Number(ud); if (Number.isNaN(d)) return
    const { frames, newBit, newArr } = planUpdate(bit, arr, i, d)
    setFrames(frames); setMode('update'); setPendingBit(newBit); setPendingArr(newArr); engine.reset()
  }
  const doPrefix = () => {
    const r = Math.max(0, Math.min(arr.length - 1, Number(pr) | 0))
    const { frames } = planPrefix(bit, r)
    setFrames(frames); setMode('prefix'); setPendingBit(null); setPendingArr(null); engine.reset()
  }
  const doRange = () => {
    const l = Math.max(0, Number(rl) | 0), r = Math.max(0, Math.min(arr.length - 1, Number(rr) | 0))
    // prefix(r) - prefix(l-1)
    const A = planPrefix(bit, r).frames.map(f => ({ ...f, msg: `[prefix(r)] ${f.msg}` }))
    const B = l === 0 ? [] : planPrefix(bit, l - 1).frames.map(f => ({ ...f, msg: `[prefix(l-1)] ${f.msg}` }))
    const sumR = planPrefix(bit, r).result
    const sumL = l === 0 ? 0 : planPrefix(bit, l - 1).result
    const combined = [...A, ...B, { msg: `range [${l}, ${r}] = ${sumR} - ${sumL} = ${sumR - sumL}`, result: sumR - sumL }]
    setFrames(combined); setMode('range'); engine.reset()
  }
  const commit = () => { if (pendingArr) { setArr(pendingArr); setPendingArr(null); setPendingBit(null) } }

  const activeLine = useMemo(() => {
    if (!current || !current.msg) return -1
    if (mode === 'update') {
      if (current.msg.startsWith('bit[')) return 2
      if (current.msg.startsWith('update')) return 0
      return -1
    }
    if (current.msg.startsWith('sum +=')) return 8
    if (current.msg.startsWith('prefix')) return 5
    return -1
  }, [current, mode])

  return (
    <TopicShell slug="fenwick-trees" title="Fenwick Trees (BIT)">
      <ExplanationBlock>
        <p>
          A <b>Binary Indexed Tree</b> (Fenwick) is a compact structure for
          prefix sums with point updates: both O(log n). It uses only <b>n + 1</b>
          integers of extra space (vs ~4n for a segment tree). The whole
          thing runs on one trick — the <b>lowbit</b> function
          <code> i &amp; -i</code>, which extracts the least significant
          1-bit of i.
        </p>
        <p>
          <b>Interpretation:</b> bit[i] stores the sum of arr[i - low(i) + 1 ..
          i]. That range is exactly 2<sup>k</sup> long, where k is the position
          of the low bit. So bit[6] (=110b) covers 2 elements; bit[8] (=1000b)
          covers 8; bit[3] (=11b) covers 1. The chart below draws each bit
          index as a bar over its covered range so this responsibility
          hierarchy is visible at a glance.
        </p>
        <p>
          <b>Update</b> walks upward, adding lowbit each time — that's how it
          reaches every ancestor that contains i. <b>Prefix sum</b> walks
          downward, subtracting lowbit each time — that skips over already-
          accounted-for ranges. Both paths visit at most log₂(n) nodes.
        </p>
      </ExplanationBlock>

      <VisualiserSection>
        <VizPanel>
          <BitChart bit={pendingBit || bit} arr={pendingArr || arr} activeSet={activeSet} takeSet={takeSet} />
          <div className="mt-3 flex gap-2 flex-wrap justify-center">
            <Chip tone="amber">n = {arr.length}</Chip>
            <Chip tone="fuchsia">log₂ n ≈ {Math.ceil(Math.log2(arr.length))}</Chip>
            {current?.result != null && <Chip tone="emerald">result = {current.result}</Chip>}
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

          <Field label="Point update" helper="Adds delta to arr[idx].">
            <div className="grid grid-cols-2 gap-1.5">
              <TextInput value={ui} onChange={setUi} placeholder="idx" />
              <TextInput value={ud} onChange={setUd} placeholder="delta" />
            </div>
            <Button variant="primary" size="small" onClick={doUpdate} className="mt-1.5 w-full">update</Button>
            <Button variant="success" size="small" onClick={commit} className="mt-1.5 w-full">Commit update</Button>
          </Field>

          <Field label="Prefix sum" helper="Sum from 0..r.">
            <TextInput value={pr} onChange={setPr} placeholder="r" />
            <Button variant="ghost" size="small" onClick={doPrefix} className="mt-1.5 w-full">prefix(r)</Button>
          </Field>

          <Field label="Range sum" helper="prefix(r) - prefix(l-1).">
            <div className="grid grid-cols-2 gap-1.5">
              <TextInput value={rl} onChange={setRl} placeholder="l" />
              <TextInput value={rr} onChange={setRr} placeholder="r" />
            </div>
            <Button variant="accent" size="small" onClick={doRange} className="mt-1.5 w-full">range [l, r]</Button>
          </Field>

          <Button variant="subtle" size="small" onClick={() => { setArr(INITIAL); engine.reset() }}>Reset array</Button>
        </ControlsPanel>
      </VisualiserSection>

      <PseudocodeBlock lines={PSEUDO} activeLine={activeLine} />

      <ComplexityTable rows={[
        { op: 'build',       best: 'O(n)',        avg: 'O(n)',        worst: 'O(n)',        space: 'O(n)' },
        { op: 'point update', best: 'O(\\log n)', avg: 'O(\\log n)', worst: 'O(\\log n)', space: 'O(n)' },
        { op: 'prefix sum',   best: 'O(\\log n)', avg: 'O(\\log n)', worst: 'O(\\log n)', space: 'O(n)' },
        { op: 'range sum',    best: 'O(\\log n)', avg: 'O(\\log n)', worst: 'O(\\log n)', space: 'O(n)' },
      ]} />

      <RealWorldCard>
        <p>
          BITs are competitive-programming's favourite tool for order-statistics
          problems (count inversions, k-th smallest online) because they nail
          both memory (n words) and cache locality (a flat array).
          Analytics systems that need running counts over sliding windows
          (a la MongoDB's index-only counts, DuckDB's window aggregates) use
          the same idea. And any "how many elements less than x are still
          alive" question in a game engine's collision system.
        </p>
      </RealWorldCard>
    </TopicShell>
  )
}
