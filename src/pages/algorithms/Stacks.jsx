// Stacks — push / pop / peek + a live bracket-matching demo.
//
// Left panel: vertical stack of tiles that animates in / out
// from the top. Right panel: an editable input where each
// character streams through a bracket-matcher, showing the
// stack state after every push / pop.
//
// Correctness:
//   - Bracket matcher opens on { [ (, closes on } ] )
//     — the closer must match the top of the stack or it's a mismatch
//     — trailing openers = unbalanced
//     — a valid string leaves the stack empty
//   - Every push emits an "expand" frame, every pop emits a "collapse"
//     frame with a match badge (ok / mismatch)

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ExplanationBlock, VisualiserSection, VizPanel, ControlsPanel,
  MultiLangCode, ComplexityTable, RealWorldCard, StepControls, useStepEngine,
  Field, TextInput, Chip, OperationLog,
} from '../../components/algorithms'
import { Button } from '../../components/ui'

const OPEN = { '(': ')', '[': ']', '{': '}' }
const CLOSE = { ')': '(', ']': '[', '}': '{' }

function planBracketMatch(input) {
  const frames = [{ stack: [], msg: 'start — stack is empty', ok: true }]
  const stack = []
  let ok = true
  let err = null
  for (let i = 0; i < input.length; i++) {
    const c = input[i]
    if (OPEN[c]) {
      stack.push(c)
      frames.push({ stack: [...stack], msg: `push '${c}' at index ${i}`, ok, cursor: i })
    } else if (CLOSE[c]) {
      const top = stack[stack.length - 1]
      if (top === CLOSE[c]) {
        stack.pop()
        frames.push({ stack: [...stack], msg: `pop '${top}' — matches ']''${c}'`.replace("]'", ''), ok, cursor: i, match: 'ok' })
      } else {
        ok = false
        err = `mismatch at index ${i}: '${c}' vs top '${top ?? 'null'}'`
        frames.push({ stack: [...stack], msg: err, ok: false, cursor: i, match: 'bad' })
        break
      }
    }
  }
  if (ok && stack.length > 0) {
    ok = false
    frames.push({ stack: [...stack], msg: `unbalanced — ${stack.length} opener(s) left`, ok: false })
  } else if (ok) {
    frames.push({ stack: [...stack], msg: 'balanced!', ok: true })
  }
  return frames
}

function planPush(stack, v) {
  const s2 = [...stack, v]
  return [
    { stack: [...stack], msg: `push(${v}) — new top` },
    { stack: s2, msg: `top = ${v}, size = ${s2.length}`, cursor: s2.length - 1 },
  ]
}
function planPop(stack) {
  if (stack.length === 0) return [{ stack: [], msg: 'stack empty — pop underflow', ok: false }]
  const s2 = [...stack]
  const v = s2.pop()
  return [
    { stack: [...stack], msg: `pop() — take top ${v}`, cursor: stack.length - 1 },
    { stack: s2, msg: `size = ${s2.length}` },
  ]
}
function planPeek(stack) {
  if (stack.length === 0) return [{ stack: [], msg: 'stack empty — peek returns null' }]
  return [{ stack: [...stack], msg: `peek() = ${stack[stack.length - 1]}`, cursor: stack.length - 1 }]
}

function StackViz({ frame, input, mode }) {
  if (!frame) return null
  const { stack, cursor } = frame
  return (
    <div className="w-full min-h-[280px] flex flex-col items-center justify-end py-4">
      <div className="w-40 flex flex-col-reverse items-stretch relative border-x border-b border-white/15 rounded-b-md bg-black/40" style={{ minHeight: 220 }}>
        <AnimatePresence>
          {stack.map((v, i) => {
            const isTop = i === stack.length - 1
            return (
              <motion.div
                key={`${i}-${v}`}
                layout
                initial={{ opacity: 0, y: -30, scale: 0.85 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -30, scale: 0.85 }}
                transition={{ type: 'spring', stiffness: 240, damping: 22 }}
                className="mx-1 my-0.5 py-1.5 text-center font-mono text-sm rounded-md border"
                style={{
                  background: isTop ? '#78350f' : '#111827',
                  borderColor: isTop ? '#fbbf24' : '#4b5563',
                  color: isTop ? '#fef3c7' : '#e5e7eb',
                }}
              >
                {v}
              </motion.div>
            )
          })}
        </AnimatePresence>
        {stack.length === 0 && (
          <div className="py-8 text-center text-xs text-gray-500">(empty)</div>
        )}
      </div>
      <div className="mt-2 text-[10px] text-gray-500 uppercase tracking-widest">stack — LIFO</div>
      {mode === 'brackets' && (
        <div className="mt-4 font-mono text-sm text-gray-200">
          {input.split('').map((c, i) => (
            <span
              key={i}
              className={`px-0.5 ${i === cursor ? 'bg-amber-500/30 text-amber-100 rounded' : ''}`}
            >
              {c}
            </span>
          ))}
        </div>
      )}
      <div className="mt-2 flex gap-2 flex-wrap justify-center">
        <Chip tone="amber">size: {stack.length}</Chip>
        <Chip tone="fuchsia">top: {stack[stack.length - 1] ?? 'null'}</Chip>
        {frame.match === 'ok' && <Chip tone="emerald">match</Chip>}
        {frame.match === 'bad' && <Chip tone="rose">mismatch</Chip>}
        {frame.ok === false && <Chip tone="rose">invalid</Chip>}
      </div>
    </div>
  )
}

import { STACK_CORE_CODE, STACK_BRACKETS_CODE } from './code/Stacks'

export default function Stacks() {
  const [stack, setStack] = useState([12, 34, 55])
  const [pushVal, setPushVal] = useState('99')
  const [brackets, setBrackets] = useState('({[()]})[]')
  const [mode, setMode] = useState('stack') // stack | brackets
  const [frames, setFrames] = useState([{ stack: [12, 34, 55], msg: 'ready' }])

  const engine = useStepEngine({ frameCount: frames.length })
  const current = frames[engine.i]

  const activeLine = useMemo(() => {
    if (!current || !current.msg) return -1
    if (mode === 'brackets') {
      if (current.msg.startsWith('push')) return 4
      if (current.msg.startsWith('pop')) return 7
      if (current.msg.includes('mismatch')) return 7
      if (current.msg === 'balanced!') return 8
      return 2
    }
    if (current.msg.includes('push')) return 0
    if (current.msg.includes('pop')) return 1
    if (current.msg.includes('peek')) return 2
    return -1
  }, [current, mode])

  const doPush = () => {
    const plan = planPush(stack, pushVal)
    setStack(plan[plan.length - 1].stack)
    setFrames(plan); setMode('stack'); engine.reset()
  }
  const doPop = () => {
    const plan = planPop(stack)
    setStack(plan[plan.length - 1].stack)
    setFrames(plan); setMode('stack'); engine.reset()
  }
  const doPeek = () => {
    setFrames(planPeek(stack))
    setMode('stack'); engine.reset()
  }
  const doBracket = () => {
    setFrames(planBracketMatch(brackets))
    setMode('brackets'); engine.reset()
  }
  const doReset = () => {
    setStack([12, 34, 55])
    setFrames([{ stack: [12, 34, 55], msg: 'reset' }])
    setMode('stack'); engine.reset()
  }

  return (
    <><ExplanationBlock>
        <p>
          A <b>stack</b> is a LIFO (Last-In-First-Out) collection. Only two
          things happen: <code>push</code> puts something on top,{' '}
          <code>pop</code> takes the top thing off. Both are O(1) because
          there's no searching — you always touch the top.
        </p>
        <p>
          Stacks show up everywhere execution "nests." Function calls stack:
          each call pushes a frame with its locals, each return pops one.
          Undo/redo stacks a history of commands. Expression parsing stacks
          the operators until enough operands appear. Backtracking search
          (DFS, Sudoku, regex) is a stack in disguise.
        </p>
        <p>
          <b>Bracket matching</b> is the canonical stack demo. Walk the string:
          push every opener, and when you see a closer, pop and check.
          If the pop doesn't match — invalid. If the stack is non-empty at the
          end — unbalanced. Try mixing valid + broken input in the box below.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>Invariant:</b> <code>top</code> always points at the last pushed
          element; <code>top = -1</code> means empty.</li>
          <li><b>Edge cases:</b> pop on empty is "underflow" — return null or throw;
            fixed-size stacks also have "overflow" when push exceeds capacity.</li>
        </ul>
      </ExplanationBlock>

      <VisualiserSection>
        <VizPanel>
          <StackViz frame={current} input={brackets} mode={mode} />
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

          <Field label="Push" helper="Adds a new top element in O(1).">
            <TextInput value={pushVal} onChange={setPushVal} placeholder="value" />
            <Button variant="primary" size="small" onClick={doPush} className="mt-1.5 w-full">push(value)</Button>
          </Field>

          <div className="grid grid-cols-2 gap-1.5">
            <Button variant="danger" size="small" onClick={doPop}>pop()</Button>
            <Button variant="ghost" size="small" onClick={doPeek}>peek()</Button>
          </div>

          <div className="h-px bg-white/10 my-1" />

          <Field label="Bracket matcher" helper="() [] {} — must nest correctly.">
            <TextInput value={brackets} onChange={setBrackets} placeholder="({[()]})" />
            <Button variant="accent" size="small" onClick={doBracket} className="mt-1.5 w-full">
              Check brackets
            </Button>
          </Field>

          <Button variant="subtle" size="small" onClick={doReset}>Reset stack</Button>
        </ControlsPanel>
      </VisualiserSection>

      <MultiLangCode
        title={mode === 'brackets' ? 'Implementation — bracket matcher' : 'Implementation — stack ops'}
        code={mode === 'brackets' ? STACK_BRACKETS_CODE : STACK_CORE_CODE}
        activeLines={{ pseudo: activeLine }}
      />

      <ComplexityTable rows={[
        { op: 'push', best: 'O(1)', avg: 'O(1)', worst: 'O(1)', space: 'O(n)' },
        { op: 'pop', best: 'O(1)', avg: 'O(1)', worst: 'O(1)', space: 'O(n)' },
        { op: 'peek', best: 'O(1)', avg: 'O(1)', worst: 'O(1)', space: 'O(n)' },
        { op: 'search', best: 'O(1)', avg: 'O(n)', worst: 'O(n)', space: 'O(n)' },
      ]} />

      <RealWorldCard>
        <p>
          The CPU's <b>call stack</b> is literally an array-backed stack — that's
          why a runaway recursion throws "stack overflow." Undo/redo in every
          editor is two stacks (or one stack + a redo pointer). Shunting-yard
          expression parsers push operators. Postfix (RPN) calculators use a
          value stack. DFS = a stack instead of a queue. And every compiler
          uses a symbol-table stack to track lexical scopes.
        </p>
      </RealWorldCard></>
  )
}
