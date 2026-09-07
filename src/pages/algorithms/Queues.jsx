// Queues — enqueue / dequeue with two implementations side-by-side:
//   1. Logical FIFO strip (what the queue conceptually looks like)
//   2. Circular buffer ring (physical storage — head/tail wrap around)
// The whole point of showing both is that the second lets a
// queue live in a fixed slice of memory without ever shifting.

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ExplanationBlock, VisualiserSection, VizPanel, ControlsPanel,
  MultiLangCode, ComplexityTable, RealWorldCard, StepControls, useStepEngine,
  Field, TextInput, Chip, OperationLog,
} from '../../components/algorithms'
import { Button } from '../../components/ui'

const CAP = 8

function planEnq(state, v) {
  const frames = []
  const { cbuf, head, tail, size } = state
  frames.push({ ...state, msg: `enqueue(${v})`, touch: tail })
  if (size >= CAP) {
    frames.push({ ...state, msg: 'buffer full', err: true })
    return { frames, next: state }
  }
  const buf = [...cbuf]
  buf[tail] = v
  const newTail = (tail + 1) % CAP
  const next = { cbuf: buf, head, tail: newTail, size: size + 1 }
  frames.push({ ...next, msg: `store at buf[${tail}]; tail → ${newTail}`, touch: tail })
  return { frames, next }
}

function planDeq(state) {
  const frames = []
  const { cbuf, head, tail, size } = state
  if (size === 0) {
    frames.push({ ...state, msg: 'empty — nothing to dequeue', err: true })
    return { frames, next: state }
  }
  const v = cbuf[head]
  frames.push({ ...state, msg: `dequeue → ${v}`, touch: head })
  const buf = [...cbuf]; buf[head] = null
  const newHead = (head + 1) % CAP
  const next = { cbuf: buf, head: newHead, tail, size: size - 1 }
  frames.push({ ...next, msg: `clear buf[${head}]; head → ${newHead}`, touch: head })
  return { frames, next }
}

/* ---------- render ---------- */

function CircularViz({ frame }) {
  if (!frame) return null
  const R = 90
  const cx = 120, cy = 120
  const slots = []
  for (let i = 0; i < CAP; i++) {
    const angle = (i / CAP) * Math.PI * 2 - Math.PI / 2
    const x = cx + R * Math.cos(angle)
    const y = cy + R * Math.sin(angle)
    slots.push({ i, x, y, v: frame.cbuf[i] })
  }
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 240 240" width={240} height={240}>
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="#374151" strokeDasharray="4 6" />
        {slots.map(s => {
          const filled = s.v != null
          const isHead = s.i === frame.head
          const isTail = s.i === frame.tail
          const isTouch = s.i === frame.touch
          const tone = isTouch ? '#fbbf24' : isHead ? '#34d399' : isTail ? '#fb7185' : filled ? '#9ca3af' : '#374151'
          return (
            <g key={s.i}>
              <circle cx={s.x} cy={s.y} r={17} fill={filled ? '#1f2937' : 'transparent'} stroke={tone} strokeWidth={2} />
              <text x={s.x} y={s.y + 4} textAnchor="middle" fontSize={11} fill={filled ? '#f3f4f6' : '#4b5563'} fontFamily="ui-monospace">
                {filled ? s.v : s.i}
              </text>
            </g>
          )
        })}
        {(() => {
          const hAngle = (frame.head / CAP) * Math.PI * 2 - Math.PI / 2
          const tAngle = (frame.tail / CAP) * Math.PI * 2 - Math.PI / 2
          const hx = cx + (R + 26) * Math.cos(hAngle)
          const hy = cy + (R + 26) * Math.sin(hAngle)
          const tx = cx + (R + 26) * Math.cos(tAngle)
          const ty = cy + (R + 26) * Math.sin(tAngle)
          return (
            <>
              <text x={hx} y={hy + 3} textAnchor="middle" fontSize={9} fill="#34d399" fontFamily="ui-monospace">HEAD</text>
              {frame.tail !== frame.head && (
                <text x={tx} y={ty + 3} textAnchor="middle" fontSize={9} fill="#fb7185" fontFamily="ui-monospace">TAIL</text>
              )}
            </>
          )
        })()}
      </svg>
      <div className="mt-2 flex gap-2 justify-center flex-wrap">
        <Chip tone="emerald">head: {frame.head}</Chip>
        <Chip tone="rose">tail: {frame.tail}</Chip>
        <Chip tone="amber">size: {frame.size} / {CAP}</Chip>
      </div>
    </div>
  )
}

function LinearViz({ frame }) {
  if (!frame) return null
  const order = []
  let idx = frame.head
  for (let i = 0; i < frame.size; i++) {
    order.push({ v: frame.cbuf[idx], pos: idx })
    idx = (idx + 1) % CAP
  }
  return (
    <div className="flex flex-col items-center min-h-[120px]">
      <div className="flex items-center gap-1 flex-wrap justify-center">
        <span className="text-[10px] text-emerald-400 mr-1 font-mono">HEAD →</span>
        <AnimatePresence>
          {order.length === 0 && <div className="text-xs text-gray-500 px-2">(empty)</div>}
          {order.map((n, i) => (
            <motion.div
              key={`${n.pos}-${n.v}-${i}`}
              layout
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              className="w-10 h-10 flex items-center justify-center rounded-md border font-mono text-sm"
              style={{
                background: i === 0 ? '#064e3b' : '#1f2937',
                borderColor: i === 0 ? '#34d399' : '#4b5563',
                color: '#f3f4f6',
              }}
            >
              {n.v}
            </motion.div>
          ))}
        </AnimatePresence>
        <span className="text-[10px] text-rose-400 ml-1 font-mono">← TAIL</span>
      </div>
      <div className="text-[10px] text-gray-500 mt-1 uppercase tracking-widest">Logical FIFO order</div>
    </div>
  )
}

import { QUEUE_CODE } from './code/Queues'

export default function Queues() {
  const [state, setState] = useState(() => ({
    cbuf: [11, 22, 33, null, null, null, null, null],
    head: 0, tail: 3, size: 3,
  }))
  const [enqVal, setEnqVal] = useState('77')
  const [frames, setFrames] = useState(() => [{
    cbuf: [11, 22, 33, null, null, null, null, null], head: 0, tail: 3, size: 3, msg: 'ready',
  }])
  const engine = useStepEngine({ frameCount: frames.length })
  const current = frames[engine.i]

  const activeLine = useMemo(() => {
    if (!current || !current.msg) return -1
    const m = current.msg
    if (m.startsWith('enqueue(')) return 0
    if (m.startsWith('store at')) return 2
    if (m.startsWith('dequeue →')) return 6
    if (m.startsWith('clear buf')) return 9
    return -1
  }, [current])

  const doEnq = () => {
    const { frames: f, next } = planEnq(state, enqVal)
    setFrames(f); setState(next); engine.reset()
  }
  const doDeq = () => {
    const { frames: f, next } = planDeq(state)
    setFrames(f); setState(next); engine.reset()
  }
  const doReset = () => {
    const s = { cbuf: [11, 22, 33, null, null, null, null, null], head: 0, tail: 3, size: 3 }
    setState(s); setFrames([{ ...s, msg: 'reset' }]); engine.reset()
  }

  return (
    <><ExplanationBlock>
        <p>
          A <b>queue</b> is a FIFO (First-In-First-Out) collection. The first
          element to go in is the first to come out — like a line at a coffee
          shop. Two operations: <code>enqueue</code> at the tail,{' '}
          <code>dequeue</code> at the head. Both are O(1) with the right storage.
        </p>
        <p>
          The naive implementation — array + shift — makes dequeue O(n) because
          you have to slide every remaining element left. A{' '}
          <b>circular buffer</b> fixes this by keeping the storage array
          stationary and moving two indices: <code>head</code> (next to read)
          and <code>tail</code> (next to write). When either index reaches
          the end, it wraps back to 0. That's why circular queues are the
          bread-and-butter of embedded systems, kernel schedulers, and
          ring-buffer audio pipelines — no allocations, cache-friendly.
        </p>
        <p>
          The two rendered views below show the same queue: the ring on the
          left is the physical storage (see head / tail slide around),
          and the strip on the right is the logical FIFO order.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>Invariant:</b> after N enqueues and M dequeues, size = N - M and
            0 &le; head, tail &lt; CAP.</li>
          <li><b>Edge case:</b> when head == tail the buffer is either full or empty —
            distinguish via <code>size</code>.</li>
        </ul>
      </ExplanationBlock>

      <VisualiserSection>
        <VizPanel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <CircularViz frame={current} />
            <LinearViz frame={current} />
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

          <Field label="Enqueue" helper="Store at tail, tail = (tail+1) mod CAP.">
            <TextInput value={enqVal} onChange={setEnqVal} placeholder="value" />
            <Button variant="primary" size="small" onClick={doEnq} className="mt-1.5 w-full">enqueue(v)</Button>
          </Field>

          <Button variant="danger" size="small" onClick={doDeq}>dequeue()</Button>
          <Button variant="subtle" size="small" onClick={doReset}>Reset queue</Button>
        </ControlsPanel>
      </VisualiserSection>

      <MultiLangCode
        title="Implementation — circular-buffer queue"
        code={QUEUE_CODE}
        activeLines={{ pseudo: activeLine }}
      />

      <ComplexityTable rows={[
        { op: 'enqueue', best: 'O(1)', avg: 'O(1)', worst: 'O(1)', space: 'O(n)' },
        { op: 'dequeue', best: 'O(1)', avg: 'O(1)', worst: 'O(1)', space: 'O(n)' },
        { op: 'peek', best: 'O(1)', avg: 'O(1)', worst: 'O(1)', space: 'O(n)' },
        { op: 'search', best: 'O(1)', avg: 'O(n)', worst: 'O(n)', space: 'O(n)' },
      ]} />

      <RealWorldCard>
        <p>
          Every OS scheduler puts runnable processes in a queue (usually one per
          priority level). Message brokers — Kafka, RabbitMQ, SQS — are
          distributed queues at their core. BFS traversal uses a queue. Every
          audio driver and DMA buffer is a ring buffer (fixed-capacity circular
          queue). BFS on unweighted graphs is optimal precisely because the
          queue enforces "process every node at depth k before any node at
          depth k+1."
        </p>
      </RealWorldCard></>
  )
}
