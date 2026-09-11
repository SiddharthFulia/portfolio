// Heaps — binary heap with array-backed storage.
//
// Two operations both animated:
//   insert(v)    → append at end, sift-up while heap property violated
//   extract()    → save arr[0], move last to arr[0], sift-down
//
// Toggle between min-heap and max-heap. Both views render:
//   Left  — tree drawn from the array indices (2i+1, 2i+2)
//   Right — the underlying flat array with the same colouring
//
// Correctness — both the sift-up and sift-down implementations are
// straight from CLRS §6.

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ExplanationBlock, VisualiserSection, VizPanel, ControlsPanel,
  MultiLangCode, ComplexityTable, RealWorldCard, StepControls, useStepEngine,
  Field, TextInput, Chip, OperationLog,
} from '../../components/algorithms'
import { Button } from '../../components/ui'
import { HEAP_INSERT_CODE, HEAP_EXTRACT_CODE, HEAP_INSERT_SAMPLES, HEAP_EXTRACT_SAMPLES } from './code/Heaps'

const cmp = (a, b, isMin) => isMin ? a < b : a > b

function planInsert(arr, v, isMin) {
  const frames = []
  const a = [...arr, v]
  let i = a.length - 1
  frames.push({ arr: [...a], touch: i, msg: `append ${v} at index ${i}` })
  while (i > 0) {
    const p = (i - 1) >> 1
    if (cmp(a[i], a[p], isMin)) {
      [a[i], a[p]] = [a[p], a[i]]
      frames.push({ arr: [...a], touch: p, swap: [i, p], msg: `swap up (${a[p]} <-> ${a[i]}); parent = ${p}` })
      i = p
    } else {
      frames.push({ arr: [...a], touch: i, msg: `heap property ok at ${i}` })
      break
    }
  }
  return { frames, next: a }
}

function planExtract(arr, isMin) {
  if (arr.length === 0) return { frames: [{ arr: [], msg: 'empty heap', err: true }], next: [] }
  const frames = []
  const a = [...arr]
  const root = a[0]
  frames.push({ arr: [...a], touch: 0, msg: `extract ${isMin ? 'min' : 'max'} = ${root}` })
  const last = a.pop()
  if (a.length === 0) {
    frames.push({ arr: [], msg: 'heap now empty' })
    return { frames, next: [] }
  }
  a[0] = last
  frames.push({ arr: [...a], touch: 0, msg: `move last (${last}) to root` })
  let i = 0
  while (true) {
    const l = 2 * i + 1, r = 2 * i + 2
    let best = i
    if (l < a.length && cmp(a[l], a[best], isMin)) best = l
    if (r < a.length && cmp(a[r], a[best], isMin)) best = r
    if (best === i) {
      frames.push({ arr: [...a], touch: i, msg: `heap property ok at ${i}` })
      break
    }
    [a[i], a[best]] = [a[best], a[i]]
    frames.push({ arr: [...a], touch: best, swap: [i, best], msg: `sift down (${a[best]} <-> ${a[i]})` })
    i = best
  }
  return { frames, next: a }
}

/* ---------- layout ---------- */

function heapPositions(arr) {
  const H = 52
  const positions = []
  for (let i = 0; i < arr.length; i++) {
    const level = Math.floor(Math.log2(i + 1))
    const slotsInLevel = 2 ** level
    const first = 2 ** level - 1
    const idxInLevel = i - first
    positions.push({
      i,
      x: (idxInLevel + 0.5) * (1 / slotsInLevel),
      y: level * H + 24,
    })
  }
  return positions
}

function HeapTree({ frame }) {
  if (!frame || frame.arr.length === 0) return <div className="text-gray-500 text-xs p-4">(empty heap)</div>
  const raw = heapPositions(frame.arr)
  const w = 340, h = Math.max(120, (Math.floor(Math.log2(frame.arr.length)) + 1) * 52 + 20)
  const pos = raw.map(p => ({ ...p, x: p.x * w }))
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      {pos.map(p => {
        const l = 2 * p.i + 1, r = 2 * p.i + 2
        return (
          <g key={`e-${p.i}`}>
            {l < frame.arr.length && <line x1={p.x} y1={p.y} x2={pos[l].x} y2={pos[l].y} stroke="#4b5563" />}
            {r < frame.arr.length && <line x1={p.x} y1={p.y} x2={pos[r].x} y2={pos[r].y} stroke="#4b5563" />}
          </g>
        )
      })}
      {pos.map(p => {
        const isTouch = p.i === frame.touch
        const inSwap = frame.swap && (p.i === frame.swap[0] || p.i === frame.swap[1])
        const tone = isTouch ? { fill: '#78350f', stroke: '#fbbf24', text: '#fef3c7' }
                  : inSwap ? { fill: '#4c1d95', stroke: '#a78bfa', text: '#ede9fe' }
                  : { fill: '#1f2937', stroke: '#9ca3af', text: '#f3f4f6' }
        return (
          <motion.g key={`n-${p.i}`} initial={false} animate={{ x: p.x, y: p.y }} transition={{ type: 'spring', stiffness: 240, damping: 24 }}>
            <circle r={15} fill={tone.fill} stroke={tone.stroke} strokeWidth={2} />
            <text y={4} textAnchor="middle" fontSize={11} fill={tone.text} fontFamily="ui-monospace">{frame.arr[p.i]}</text>
            <text y={-19} textAnchor="middle" fontSize={8} fill="#6b7280" fontFamily="ui-monospace">{p.i}</text>
          </motion.g>
        )
      })}
    </svg>
  )
}

function HeapArrayStrip({ frame }) {
  if (!frame) return null
  return (
    <div className="flex flex-wrap gap-1">
      {frame.arr.map((v, i) => {
        const isTouch = i === frame.touch
        const inSwap = frame.swap && (i === frame.swap[0] || i === frame.swap[1])
        return (
          <motion.div
            key={i}
            layout
            className="w-10 h-11 flex flex-col items-center justify-center rounded border font-mono text-xs"
            style={{
              background: isTouch ? '#78350f' : inSwap ? '#4c1d95' : '#111827',
              borderColor: isTouch ? '#fbbf24' : inSwap ? '#a78bfa' : '#4b5563',
              color: isTouch ? '#fef3c7' : inSwap ? '#ede9fe' : '#f3f4f6',
            }}
          >
            <span>{v}</span>
            <span className="text-[9px] text-gray-500">{i}</span>
          </motion.div>
        )
      })}
    </div>
  )
}

export default function Heaps() {
  const [isMin, setIsMin] = useState(true)
  const [arr, setArr] = useState([2, 5, 4, 15, 10, 9, 8, 22])
  const [insertVal, setInsertVal] = useState('3')
  const [frames, setFrames] = useState([{ arr: [2, 5, 4, 15, 10, 9, 8, 22], msg: 'ready' }])
  const [mode, setMode] = useState('insert')
  const engine = useStepEngine({ frameCount: frames.length })
  const current = frames[engine.i]

  const activeLine = useMemo(() => {
    if (!current || !current.msg) return -1
    if (mode === 'extract') {
      if (current.msg.includes('extract')) return 1
      if (current.msg.includes('move last')) return 2
      if (current.msg.includes('sift down')) return 9
      if (current.msg.includes('heap property ok')) return 8
      return -1
    }
    if (current.msg.includes('append')) return 1
    if (current.msg.includes('swap up')) return 4
    return -1
  }, [current, mode])

  const doInsert = () => {
    const v = Number(insertVal); if (Number.isNaN(v)) return
    const { frames: f, next } = planInsert(arr, v, isMin)
    setFrames(f); setArr(next); setMode('insert'); engine.reset()
  }
  const doExtract = () => {
    const { frames: f, next } = planExtract(arr, isMin)
    setFrames(f); setArr(next); setMode('extract'); engine.reset()
  }
  const doToggle = () => {
    const next = !isMin
    const a = [...arr]
    for (let start = (a.length >> 1) - 1; start >= 0; start--) {
      let i = start
      while (true) {
        const l = 2 * i + 1, r = 2 * i + 2
        let best = i
        if (l < a.length && cmp(a[l], a[best], next)) best = l
        if (r < a.length && cmp(a[r], a[best], next)) best = r
        if (best === i) break
        ;[a[i], a[best]] = [a[best], a[i]]
        i = best
      }
    }
    setIsMin(next); setArr(a); setFrames([{ arr: a, msg: `heapified as ${next ? 'min' : 'max'}-heap` }]); engine.reset()
  }
  const doReset = () => {
    setArr([2, 5, 4, 15, 10, 9, 8, 22])
    setFrames([{ arr: [2, 5, 4, 15, 10, 9, 8, 22], msg: 'reset' }])
    engine.reset()
  }

  return (
    <><ExplanationBlock>
        <p>
          A <b>binary heap</b> is a complete binary tree that satisfies the
          heap property: in a <b>min-heap</b>, every node is &le; its children;
          in a <b>max-heap</b>, every node is &ge; its children. It's stored
          in a flat array — no pointers required — because completeness means
          child indices are algebraic:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>parent(i) = floor((i - 1) / 2)</li>
          <li>leftChild(i)  = 2i + 1</li>
          <li>rightChild(i) = 2i + 2</li>
        </ul>
        <p>
          <b>Insert</b> — append to the end and <i>sift-up</i>: while the new
          node is smaller than its parent, swap. <b>Extract-min</b> — return
          the root, move the last element to the root, and <i>sift-down</i>:
          while a child is smaller than the current node, swap with the
          smaller child. Both operations touch at most O(log n) nodes because
          the tree's height is bounded.
        </p>
        <p>
          The array strip below the tree is the same heap. Watch how a
          single swap in the tree corresponds to a single swap in the array —
          they're the same structure viewed two ways.
        </p>
      </ExplanationBlock>

      <VisualiserSection>
        <VizPanel>
          <HeapTree frame={current} />
          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Array backing store</div>
            <HeapArrayStrip frame={current} />
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
          <Field label="Type" helper="Toggle rebuilds the heap in O(n).">
            <div className="grid grid-cols-2 gap-1.5">
              <Button variant={isMin ? 'primary' : 'ghost'} size="small" onClick={() => !isMin && doToggle()}>min-heap</Button>
              <Button variant={isMin ? 'ghost' : 'primary'} size="small" onClick={() => isMin && doToggle()}>max-heap</Button>
            </div>
          </Field>
          <Field label="Insert" helper="Append + sift-up.">
            <TextInput value={insertVal} onChange={setInsertVal} placeholder="value" />
            <Button variant="primary" size="small" onClick={doInsert} className="mt-1.5 w-full">insert</Button>
          </Field>
          <Button variant="accent" size="small" onClick={doExtract}>extract-{isMin ? 'min' : 'max'}</Button>
          <Button variant="subtle" size="small" onClick={doReset}>Reset heap</Button>
        </ControlsPanel>
      </VisualiserSection>

      <MultiLangCode
        title={mode === 'extract' ? 'Implementation — extract min' : 'Implementation — insert (min-heap)'}
        code={mode === 'extract' ? HEAP_EXTRACT_CODE : HEAP_INSERT_CODE}
        samples={mode === 'extract' ? HEAP_EXTRACT_SAMPLES : HEAP_INSERT_SAMPLES}
        activeLines={{ pseudo: activeLine }}
      />

      <ComplexityTable rows={[
        { op: 'peek',         best: 'O(1)', avg: 'O(1)', worst: 'O(1)', space: 'O(n)' },
        { op: 'insert',       best: 'O(1)', avg: 'O(\\log n)', worst: 'O(\\log n)', space: 'O(n)' },
        { op: 'extract-min',  best: 'O(\\log n)', avg: 'O(\\log n)', worst: 'O(\\log n)', space: 'O(n)' },
        { op: 'heapify (build)', best: 'O(n)', avg: 'O(n)', worst: 'O(n)', space: 'O(n)' },
      ]} />

      <RealWorldCard>
        <p>
          Priority queues everywhere. Dijkstra's algorithm uses a min-heap to
          pick the next-nearest unvisited node. Kernel task schedulers,
          A* pathfinding, event queues (SimPy, ns-3, game loops), Kafka's
          consumer group balancing — anywhere "process the smallest / largest
          next" is the semantic, there's a heap. Heapsort is a heap-based
          in-place O(n log n) sort with O(1) extra space.
        </p>
      </RealWorldCard></>
  )
}
