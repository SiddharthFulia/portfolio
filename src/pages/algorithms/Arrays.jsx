// Arrays visualiser.
//
// Interactive:
//   - Append / prepend / insert-at / delete-at / access-by-index
//   - Animates the shift on insert / delete (the whole point of the
//     "arrays cost O(n) to insert in the middle" story)
//   - Shows the underlying capacity vs length so users understand
//     the amortised O(1) push (doubling when capacity is hit)
//
// Correctness notes:
//   - "Insert" reserves a new slot at the target index, pushes
//     everything to the right, then plants the value. We emit one
//     frame per shift so the animation actually shows the O(n) work
//     — not just a start/end diff.
//   - "Delete" is the mirror: hole → shift-left → shrink length.
//   - Capacity doubles (2, 4, 8, …) when length would exceed it, and
//     we emit a "grow" frame so the amortised cost is visible.

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ExplanationBlock, VisualiserSection, VizPanel, ControlsPanel,
  MultiLangCode, ComplexityTable, RealWorldCard, StepControls, useStepEngine,
  Field, TextInput, Chip, OperationLog,
} from '../../components/algorithms'
import { Button } from '../../components/ui'
import { ARRAYS_CODE } from './code/Arrays'

const INITIAL = [3, 8, 15, 21, 42, 61]
const INITIAL_CAP = 8

/* ---------- frame planners ---------- */
// Each function returns a list of "frames" — snapshots the engine
// steps through. Every frame carries the array + capacity + which
// slot is currently being touched + a human label.

function planAccess(arr, cap, index) {
  const frames = [{ arr: [...arr], cap, touch: null, msg: `arr[${index}] — jump directly to the slot` }]
  if (index < 0 || index >= arr.length) {
    frames.push({ arr: [...arr], cap, touch: null, msg: `index ${index} out of bounds`, err: true })
    return frames
  }
  frames.push({ arr: [...arr], cap, touch: index, msg: `read arr[${index}] = ${arr[index]}` })
  return frames
}

function planInsert(arr, cap, index, value) {
  const frames = []
  const a = [...arr]
  const idx = Math.max(0, Math.min(index, a.length))
  let curCap = cap
  frames.push({ arr: [...a], cap: curCap, touch: null, msg: `insert ${value} at index ${idx}` })
  // Grow?
  if (a.length + 1 > curCap) {
    const newCap = Math.max(1, curCap * 2)
    frames.push({ arr: [...a], cap: newCap, touch: null, msg: `capacity ${curCap} full → double to ${newCap}`, grow: true })
    curCap = newCap
  }
  // Shift right — one step per element for O(n) visualisation.
  for (let i = a.length; i > idx; i--) {
    a[i] = a[i - 1]
    frames.push({ arr: [...a], cap: curCap, touch: i, msg: `shift arr[${i - 1}] → arr[${i}]` })
  }
  a[idx] = value
  frames.push({ arr: [...a], cap: curCap, touch: idx, msg: `plant arr[${idx}] = ${value}` })
  return frames
}

function planDelete(arr, cap, index) {
  const frames = []
  const a = [...arr]
  if (a.length === 0 || index < 0 || index >= a.length) {
    return [{ arr: [...a], cap, touch: null, msg: 'nothing to delete', err: true }]
  }
  frames.push({ arr: [...a], cap, touch: index, msg: `delete arr[${index}] (=${a[index]})` })
  a[index] = null
  frames.push({ arr: [...a], cap, touch: index, msg: `hole at index ${index}` })
  // Shift left.
  for (let i = index; i < a.length - 1; i++) {
    a[i] = a[i + 1]
    a[i + 1] = null
    frames.push({ arr: [...a], cap, touch: i, msg: `shift arr[${i + 1}] → arr[${i}]` })
  }
  a.pop()
  frames.push({ arr: [...a], cap, touch: null, msg: `length--; done` })
  return frames
}

/* ---------- render ---------- */

function ArrayViz({ frame }) {
  if (!frame) return null
  const { arr, cap, touch, err, grow } = frame
  const slots = []
  for (let i = 0; i < cap; i++) slots.push(i < arr.length ? arr[i] : null)
  return (
    <div className="w-full flex flex-col items-center justify-center min-h-[240px] py-4">
      <div className="flex gap-1 flex-wrap justify-center">
        {slots.map((v, i) => {
          const filled = i < arr.length && arr[i] !== null
          const isTouch = i === touch
          return (
            <div key={i} className="flex flex-col items-center">
              <motion.div
                layout
                initial={false}
                animate={{
                  scale: isTouch ? 1.08 : 1,
                  boxShadow: isTouch
                    ? '0 0 24px rgba(251, 191, 36, 0.55)'
                    : '0 0 0 rgba(0,0,0,0)',
                  backgroundColor: isTouch
                    ? (err ? '#7f1d1d' : '#78350f')
                    : filled ? '#1f2937' : 'transparent',
                  borderColor: filled ? (isTouch ? '#fbbf24' : '#9ca3af') : '#374151',
                }}
                transition={{ duration: 0.25 }}
                className="w-10 h-12 sm:w-12 sm:h-14 border rounded-md flex items-center justify-center font-mono text-sm"
                style={{ borderStyle: filled ? 'solid' : 'dashed' }}
              >
                <AnimatePresence mode="wait">
                  {filled && (
                    <motion.span
                      key={String(v)}
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      transition={{ duration: 0.18 }}
                      className={isTouch ? 'text-amber-100' : 'text-gray-100'}
                    >
                      {v}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.div>
              <div className="text-[10px] text-gray-500 font-mono mt-1">{i}</div>
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex gap-2 flex-wrap justify-center">
        <Chip tone="amber">length {arr.length}</Chip>
        <Chip tone={grow ? 'fuchsia' : 'gray'}>capacity {cap}</Chip>
        {err && <Chip tone="rose">error</Chip>}
      </div>
    </div>
  )
}

/* ---------- page ---------- */

export default function Arrays() {
  const [arr, setArr] = useState(INITIAL)
  const [cap, setCap] = useState(INITIAL_CAP)
  const [insertIdx, setInsertIdx] = useState('2')
  const [insertVal, setInsertVal] = useState('99')
  const [delIdx, setDelIdx] = useState('3')
  const [accessIdx, setAccessIdx] = useState('4')
  const [frames, setFrames] = useState([{ arr: INITIAL, cap: INITIAL_CAP, touch: null, msg: 'ready' }])

  const engine = useStepEngine({ frameCount: frames.length })
  const current = frames[engine.i]

  // Match pseudocode line to frame semantics.
  const activeLine = useMemo(() => {
    if (!current) return -1
    if (current.grow) return 2
    if (current.msg?.startsWith('shift')) return 4
    if (current.msg?.startsWith('plant')) return 5
    if (current.msg?.startsWith('insert ')) return 0
    return -1
  }, [current])

  const runInsert = () => {
    const v = Number(insertVal)
    const i = Number(insertIdx)
    if (Number.isNaN(v) || Number.isNaN(i)) return
    const plan = planInsert(arr, cap, i, v)
    setFrames(plan)
    // Commit new state at end of animation.
    const last = plan[plan.length - 1]
    setArr(last.arr.filter(x => x !== null))
    setCap(last.cap)
    engine.reset()
  }
  const runDelete = () => {
    const i = Number(delIdx)
    if (Number.isNaN(i)) return
    const plan = planDelete(arr, cap, i)
    setFrames(plan)
    const last = plan[plan.length - 1]
    setArr(last.arr.filter(x => x !== null))
    engine.reset()
  }
  const runAccess = () => {
    const i = Number(accessIdx)
    if (Number.isNaN(i)) return
    setFrames(planAccess(arr, cap, i))
    engine.reset()
  }
  const runAppend = () => {
    const plan = planInsert(arr, cap, arr.length, Math.floor(Math.random() * 90) + 10)
    setFrames(plan)
    const last = plan[plan.length - 1]
    setArr(last.arr.filter(x => x !== null))
    setCap(last.cap)
    engine.reset()
  }
  const resetAll = () => {
    setArr(INITIAL); setCap(INITIAL_CAP)
    setFrames([{ arr: INITIAL, cap: INITIAL_CAP, touch: null, msg: 'reset' }])
    engine.reset()
  }

  return (
    <><ExplanationBlock>
        <p>
          An <b>array</b> is a run of contiguous memory that stores fixed-size
          elements. Because every slot is the same size, the address of index{' '}
          <code>i</code> is a single arithmetic step: <code>base + i * stride</code>.
          That is why <b>random access is O(1)</b> — no traversal, no comparison,
          the CPU literally goes to the byte.
        </p>
        <p>
          The trade-off: insertions in the middle have to <b>shift every element to
          the right</b> to make room, and deletions leave a hole that has to be
          collapsed. Both are O(n) in the worst case. Appending at the end is O(1)
          <i> amortised</i> — a growable array (Java <code>ArrayList</code>, Python
          <code> list</code>, C++ <code>std::vector</code>, JS array) doubles its
          capacity when full, so the expensive copy only happens every O(log n)
          pushes, and the average cost per push is a constant.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>Invariant:</b> <code>0 &le; length &le; capacity</code>, and all slots
            in <code>[0, length)</code> are live.</li>
          <li><b>Edge cases:</b> insert at <code>index == length</code> (append) does no shift;
            insert at <code>index == 0</code> shifts every existing element.</li>
          <li><b>When to use:</b> lots of reads, few structural changes, cache-friendly
            iteration (linear scan hits every element in one cache line).</li>
        </ul>
      </ExplanationBlock>

      <VisualiserSection>
        <VizPanel>
          <ArrayViz frame={current} />
          <div className="mt-3 text-xs text-gray-400 text-center min-h-[16px]">
            {current?.msg}
          </div>
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

          <Field label="Insert" helper="Shifts elements to the right of the index.">
            <div className="grid grid-cols-2 gap-1.5">
              <TextInput value={insertIdx} onChange={setInsertIdx} placeholder="index" />
              <TextInput value={insertVal} onChange={setInsertVal} placeholder="value" />
            </div>
            <Button variant="primary" size="small" onClick={runInsert} className="mt-1.5 w-full">
              Insert at index
            </Button>
          </Field>

          <Field label="Delete" helper="Removes at index and shifts left.">
            <TextInput value={delIdx} onChange={setDelIdx} placeholder="index" />
            <Button variant="danger" size="small" onClick={runDelete} className="mt-1.5 w-full">
              Delete at index
            </Button>
          </Field>

          <Field label="Access" helper="O(1) — jump straight to the slot.">
            <TextInput value={accessIdx} onChange={setAccessIdx} placeholder="index" />
            <Button variant="ghost" size="small" onClick={runAccess} className="mt-1.5 w-full">
              Read arr[index]
            </Button>
          </Field>

          <div className="grid grid-cols-2 gap-1.5">
            <Button variant="accent" size="small" onClick={runAppend}>Append random</Button>
            <Button variant="subtle" size="small" onClick={resetAll}>Reset all</Button>
          </div>
        </ControlsPanel>
      </VisualiserSection>

      <MultiLangCode
        title="Implementation — insert at index"
        code={ARRAYS_CODE}
        activeLines={{ pseudo: activeLine }}
      />

      <ComplexityTable rows={[
        { op: 'access',   best: 'O(1)', avg: 'O(1)', worst: 'O(1)', space: 'O(n)' },
        { op: 'search',   best: 'O(1)', avg: 'O(n)', worst: 'O(n)', space: 'O(n)' },
        { op: 'append',   best: 'O(1)', avg: 'O(1)^*', worst: 'O(n)', space: 'O(n)' },
        { op: 'insert',   best: 'O(1)', avg: 'O(n)', worst: 'O(n)', space: 'O(n)' },
        { op: 'delete',   best: 'O(1)', avg: 'O(n)', worst: 'O(n)', space: 'O(n)' },
      ]} />

      <RealWorldCard>
        <p>
          Every language's dynamic array — Python's <code>list</code>, Java's
          <code> ArrayList</code>, C++ <code>std::vector</code>, JS's <code>Array</code>
          — is exactly this structure. GPU vertex buffers, WebAssembly linear
          memory, network packet queues, and pixel buffers are all arrays under
          the hood. Any time you're processing a batch of same-shaped items
          in a tight loop, an array is going to win on cache behaviour alone.
        </p>
      </RealWorldCard></>
  )
}
