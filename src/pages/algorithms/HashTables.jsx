// Hash Tables — separate chaining + open addressing (linear probe).
//
// Interactive:
//   - Insert / get / delete on either implementation
//   - Load-factor slider triggers a real rehash (double capacity, re-insert)
//   - Every op highlights the hash → bucket path
//
// Correctness:
//   - Hash is a djb2-style rolling hash of the string form of the key
//     (works for both string and number keys) so identical inputs
//     always hit the same bucket.
//   - Chaining stores an array of {k,v} per bucket.
//   - Open addressing marks deletion with a "tombstone" so probing
//     for later inserts still walks past it (classic linear-probe bug).
//   - Rehash reinserts every live entry into a table with the new
//     capacity — deletions do not carry over.

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  TopicShell, ExplanationBlock, VisualiserSection, VizPanel, ControlsPanel,
  PseudocodeBlock, ComplexityTable, RealWorldCard, StepControls, useStepEngine,
  Field, TextInput, Chip, OperationLog,
} from '../../components/algorithms'
import { Button, Slider } from '../../components/ui'

const INITIAL_CAP = 8

// djb2 — small, fast, well-distributed on ASCII strings.
function hashStr(s) {
  let h = 5381
  const str = String(s)
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0
  return h
}
const bucket = (k, cap) => hashStr(k) % cap
const TOMB = Symbol('tomb')

/* ---------- chaining ops ---------- */

function chainInsert(state, key, val) {
  const cap = state.cap
  const b = bucket(key, cap)
  const frames = [{ ...state, msg: `hash("${key}") = ${hashStr(key)} → bucket ${b}`, touch: b }]
  const table = state.table.map(chain => chain.map(e => ({ ...e })))
  const idx = table[b].findIndex(e => e.k === String(key))
  if (idx >= 0) {
    table[b][idx].v = val
    frames.push({ ...state, table, msg: `update in bucket ${b}`, touch: b })
    return { frames, next: { ...state, table } }
  }
  table[b].push({ k: String(key), v: val })
  const next = { ...state, table, size: state.size + 1 }
  frames.push({ ...next, msg: `append to chain at bucket ${b}`, touch: b })
  return { frames, next }
}
function chainGet(state, key) {
  const b = bucket(key, state.cap)
  const frames = [{ ...state, msg: `hash("${key}") → bucket ${b}`, touch: b }]
  const idx = state.table[b].findIndex(e => e.k === String(key))
  if (idx < 0) frames.push({ ...state, msg: `bucket ${b} does not contain "${key}"`, touch: b, err: true })
  else frames.push({ ...state, msg: `bucket ${b} → "${key}" = ${state.table[b][idx].v}`, touch: b })
  return { frames, next: state }
}
function chainDelete(state, key) {
  const b = bucket(key, state.cap)
  const frames = [{ ...state, msg: `hash("${key}") → bucket ${b}`, touch: b }]
  const table = state.table.map(chain => chain.map(e => ({ ...e })))
  const idx = table[b].findIndex(e => e.k === String(key))
  if (idx < 0) {
    frames.push({ ...state, msg: `"${key}" not found`, touch: b, err: true })
    return { frames, next: state }
  }
  table[b].splice(idx, 1)
  const next = { ...state, table, size: state.size - 1 }
  frames.push({ ...next, msg: `removed from bucket ${b}`, touch: b })
  return { frames, next }
}

/* ---------- open addressing ops (linear probe) ---------- */

function probeInsert(state, key, val) {
  const cap = state.cap
  const start = bucket(key, cap)
  const frames = [{ ...state, msg: `hash("${key}") → slot ${start}`, touch: start }]
  const arr = state.arr.map(e => e && e !== TOMB ? { ...e } : e)
  let firstTomb = -1
  let i = start
  for (let step = 0; step < cap; step++) {
    const e = arr[i]
    if (e === undefined || e === null) {
      const dst = firstTomb >= 0 ? firstTomb : i
      arr[dst] = { k: String(key), v: val }
      const next = { ...state, arr, size: state.size + 1 }
      frames.push({ ...next, msg: `empty at ${i} → insert at ${dst}`, touch: dst })
      return { frames, next }
    }
    if (e === TOMB) {
      if (firstTomb < 0) firstTomb = i
      frames.push({ ...state, arr, msg: `slot ${i} tombstone — keep probing`, touch: i })
    } else if (e.k === String(key)) {
      arr[i] = { k: e.k, v: val }
      const next = { ...state, arr }
      frames.push({ ...next, msg: `slot ${i} matches — update`, touch: i })
      return { frames, next }
    } else {
      frames.push({ ...state, arr, msg: `slot ${i} occupied by "${e.k}" — probe next`, touch: i })
    }
    i = (i + 1) % cap
  }
  frames.push({ ...state, msg: 'table full', err: true })
  return { frames, next: state }
}
function probeGet(state, key) {
  const cap = state.cap
  const start = bucket(key, cap)
  const frames = [{ ...state, msg: `hash("${key}") → slot ${start}`, touch: start }]
  let i = start
  for (let step = 0; step < cap; step++) {
    const e = state.arr[i]
    if (e === undefined || e === null) {
      frames.push({ ...state, msg: `slot ${i} empty → "${key}" not present`, touch: i, err: true })
      return { frames, next: state }
    }
    if (e !== TOMB && e.k === String(key)) {
      frames.push({ ...state, msg: `slot ${i} → "${key}" = ${e.v}`, touch: i })
      return { frames, next: state }
    }
    frames.push({ ...state, msg: `slot ${i} — probe next`, touch: i })
    i = (i + 1) % cap
  }
  frames.push({ ...state, msg: 'walked whole table', err: true })
  return { frames, next: state }
}
function probeDelete(state, key) {
  const cap = state.cap
  const start = bucket(key, cap)
  const frames = [{ ...state, msg: `hash("${key}") → slot ${start}`, touch: start }]
  const arr = state.arr.slice()
  let i = start
  for (let step = 0; step < cap; step++) {
    const e = arr[i]
    if (e === undefined || e === null) {
      frames.push({ ...state, msg: `slot ${i} empty → not found`, touch: i, err: true })
      return { frames, next: state }
    }
    if (e !== TOMB && e.k === String(key)) {
      arr[i] = TOMB
      const next = { ...state, arr, size: state.size - 1 }
      frames.push({ ...next, msg: `slot ${i} → tombstone`, touch: i })
      return { frames, next }
    }
    i = (i + 1) % cap
  }
  return { frames, next: state }
}

function rehashChain(state, newCap) {
  const table = Array.from({ length: newCap }, () => [])
  let size = 0
  for (const chain of state.table) {
    for (const { k, v } of chain) {
      table[bucket(k, newCap)].push({ k, v })
      size += 1
    }
  }
  return { table, cap: newCap, size }
}
function rehashProbe(state, newCap) {
  const arr = new Array(newCap)
  let size = 0
  for (const e of state.arr) {
    if (!e || e === TOMB) continue
    let i = bucket(e.k, newCap)
    while (arr[i] != null) i = (i + 1) % newCap
    arr[i] = { k: e.k, v: e.v }
    size += 1
  }
  return { arr, cap: newCap, size }
}

/* ---------- render ---------- */

function ChainViz({ state, touch }) {
  const table = state?.table ?? []
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {table.map((chain, i) => {
        const hi = i === touch
        return (
          <div
            key={i}
            className="flex items-start gap-1.5 p-1.5 rounded-md border transition-colors"
            style={{
              background: hi ? '#78350f' : '#0b1220',
              borderColor: hi ? '#fbbf24' : '#374151',
            }}
          >
            <div className="text-[10px] font-mono text-gray-400 w-4 text-right">{i}</div>
            <div className="flex-1 flex flex-wrap gap-1">
              {chain.length === 0 && <span className="text-[10px] text-gray-600">∅</span>}
              <AnimatePresence>
                {chain.map((e, j) => (
                  <motion.span
                    key={e.k + j}
                    layout
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.6, opacity: 0 }}
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-800 border border-gray-600 text-emerald-200"
                  >
                    {e.k}:{e.v}
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ProbeViz({ state, touch }) {
  const arr = state?.arr ?? []
  return (
    <div className="flex flex-wrap gap-1.5">
      {arr.map((e, i) => {
        const hi = i === touch
        const filled = e && e !== TOMB
        const tomb = e === TOMB
        return (
          <div
            key={i}
            className="w-16 rounded-md border p-1.5 text-center transition-colors"
            style={{
              background: hi ? '#78350f' : filled ? '#0b1220' : tomb ? '#3f0e1e' : 'transparent',
              borderColor: hi ? '#fbbf24' : filled ? '#4b5563' : tomb ? '#7f1d1d' : '#374151',
              borderStyle: filled || tomb ? 'solid' : 'dashed',
            }}
          >
            <div className="text-[9px] text-gray-500 font-mono">{i}</div>
            {filled && <div className="text-[10px] font-mono text-emerald-200 truncate">{e.k}:{e.v}</div>}
            {tomb && <div className="text-[10px] font-mono text-rose-300">✗</div>}
          </div>
        )
      })}
    </div>
  )
}

const PSEUDO_CHAIN = [
  'function insert(k, v):',
  '    b = hash(k) mod capacity',
  '    for entry in table[b]:',
  '        if entry.k == k: entry.v = v; return',
  '    table[b].append({k, v})',
]
const PSEUDO_PROBE = [
  'function insert(k, v):',
  '    i = hash(k) mod capacity',
  '    while arr[i] is set and arr[i].k != k:',
  '        i = (i + 1) mod capacity   # linear probe',
  '    arr[i] = {k, v}',
]

export default function HashTables() {
  const [mode, setMode] = useState('chain') // chain | probe
  const [chain, setChain] = useState(() => {
    let s = { table: Array.from({ length: INITIAL_CAP }, () => []), cap: INITIAL_CAP, size: 0 }
    for (const [k, v] of [['ada', 1], ['linus', 42], ['grace', 7], ['edsger', 3], ['alan', 9]]) {
      const b = bucket(k, s.cap); s.table[b].push({ k, v }); s.size += 1
    }
    return s
  })
  const [probe, setProbe] = useState(() => {
    let s = { arr: new Array(INITIAL_CAP), cap: INITIAL_CAP, size: 0 }
    for (const [k, v] of [['ada', 1], ['linus', 42], ['grace', 7]]) {
      let i = bucket(k, s.cap)
      while (s.arr[i] != null) i = (i + 1) % s.cap
      s.arr[i] = { k, v }; s.size += 1
    }
    return s
  })
  const [insertKey, setInsertKey] = useState('rust')
  const [insertVal, setInsertVal] = useState('12')
  const [getKey, setGetKey] = useState('linus')
  const [delKey, setDelKey] = useState('ada')

  const state = mode === 'chain' ? chain : probe
  const load = state.size / state.cap
  const [frames, setFrames] = useState([{ ...state, msg: 'ready' }])
  const engine = useStepEngine({ frameCount: frames.length })
  const current = frames[engine.i]

  const activeLine = useMemo(() => {
    if (!current || !current.msg) return -1
    const m = current.msg
    if (m.startsWith('hash(')) return 1
    if (m.startsWith('append') || m.startsWith('insert')) return 4
    if (m.startsWith('update')) return 3
    if (m.startsWith('slot') && m.includes('probe')) return 3
    if (m.startsWith('slot') && m.includes('empty')) return 4
    return -1
  }, [current])

  const commit = (frames, nextState) => {
    setFrames(frames)
    if (mode === 'chain') setChain(nextState)
    else setProbe(nextState)
    engine.reset()
  }

  const doInsert = () => {
    if (!insertKey) return
    if (mode === 'chain') {
      const { frames, next } = chainInsert(chain, insertKey, insertVal); commit(frames, next)
    } else {
      const { frames, next } = probeInsert(probe, insertKey, insertVal); commit(frames, next)
    }
  }
  const doGet = () => {
    if (mode === 'chain') {
      const { frames, next } = chainGet(chain, getKey); commit(frames, next)
    } else {
      const { frames, next } = probeGet(probe, getKey); commit(frames, next)
    }
  }
  const doDelete = () => {
    if (mode === 'chain') {
      const { frames, next } = chainDelete(chain, delKey); commit(frames, next)
    } else {
      const { frames, next } = probeDelete(probe, delKey); commit(frames, next)
    }
  }
  const doRehash = () => {
    const newCap = state.cap * 2
    const rehashed = mode === 'chain' ? rehashChain(chain, newCap) : rehashProbe(probe, newCap)
    if (mode === 'chain') setChain(rehashed); else setProbe(rehashed)
    setFrames([{ ...rehashed, msg: `rehash → capacity ${newCap}` }])
    engine.reset()
  }

  return (
    <TopicShell slug="hash-tables" title="Hash Tables">
      <ExplanationBlock>
        <p>
          A <b>hash table</b> maps keys to values in expected O(1). It uses a
          hash function to compute a bucket index from the key, then stores the
          entry there. Two things can go wrong: two keys can land in the same
          bucket (a <b>collision</b>), and the table can fill up.
        </p>
        <p>
          <b>Separate chaining</b> puts a linked list (or small array) at each
          bucket. Collisions just append to the chain. Simple, robust, and
          the natural fit if entries have unpredictable sizes.
        </p>
        <p>
          <b>Open addressing</b> keeps every entry in one flat array. On
          collision it <i>probes</i> to a nearby slot (linear probe: i+1, i+2, …).
          Cache-friendly and allocation-free, but demands a <b>tombstone</b>{' '}
          marker on delete so later lookups don't stop at what looks like an
          empty slot. Slide the load factor slider — as the table fills past
          0.6-0.7, expect the collision animation to get visibly longer, which is
          exactly why every open-addressing table triggers a rehash at that
          threshold.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>Invariant:</b> for every live entry <code>e</code>,
            <code> arr[hash(e.k) mod cap ... e.slot]</code> is filled with either
            a different key or a tombstone — probing must always find the entry.</li>
          <li><b>Rehash trigger:</b> load factor <TeXInline tex="\alpha = n/m" /> exceeds a
            threshold (typically 0.75 for chaining, 0.5–0.6 for open addressing).</li>
        </ul>
      </ExplanationBlock>

      <VisualiserSection>
        <VizPanel>
          <div className="mb-3 flex gap-2 justify-center">
            <Button variant={mode === 'chain' ? 'primary' : 'ghost'} size="small" onClick={() => { setMode('chain'); setFrames([{ ...chain, msg: 'ready' }]); engine.reset() }}>Separate chaining</Button>
            <Button variant={mode === 'probe' ? 'primary' : 'ghost'} size="small" onClick={() => { setMode('probe'); setFrames([{ ...probe, msg: 'ready' }]); engine.reset() }}>Open addressing</Button>
          </div>
          {mode === 'chain'
            ? <ChainViz state={current} touch={current?.touch} />
            : <ProbeViz state={current} touch={current?.touch} />}
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

          <Field label="Insert" helper="Key + value pair.">
            <div className="grid grid-cols-2 gap-1.5">
              <TextInput value={insertKey} onChange={setInsertKey} placeholder="key" />
              <TextInput value={insertVal} onChange={setInsertVal} placeholder="val" />
            </div>
            <Button variant="primary" size="small" onClick={doInsert} className="mt-1.5 w-full">insert(k, v)</Button>
          </Field>

          <Field label="Get" helper="Follows the hash → bucket path.">
            <TextInput value={getKey} onChange={setGetKey} placeholder="key" />
            <Button variant="ghost" size="small" onClick={doGet} className="mt-1.5 w-full">get(k)</Button>
          </Field>

          <Field label="Delete" helper={mode === 'probe' ? 'Leaves a tombstone.' : 'Removes from chain.'}>
            <TextInput value={delKey} onChange={setDelKey} placeholder="key" />
            <Button variant="danger" size="small" onClick={doDelete} className="mt-1.5 w-full">delete(k)</Button>
          </Field>

          <Field label="Load factor" helper="size / capacity — higher = more collisions.">
            <div className="flex gap-2 items-center">
              <div className="flex-1"><Slider accent="rose" min={0} max={1} step={0.05} value={load} disabled /></div>
              <span className="text-xs font-mono text-rose-200">{load.toFixed(2)}</span>
            </div>
            <Button variant="accent" size="small" onClick={doRehash} className="mt-1.5 w-full">Rehash (× 2)</Button>
          </Field>
        </ControlsPanel>
      </VisualiserSection>

      <PseudocodeBlock
        title={mode === 'chain' ? 'Pseudocode — chaining insert' : 'Pseudocode — linear probe insert'}
        lines={mode === 'chain' ? PSEUDO_CHAIN : PSEUDO_PROBE}
        activeLine={activeLine}
      />

      <ComplexityTable rows={[
        { op: 'insert', best: 'O(1)', avg: 'O(1)', worst: 'O(n)', space: 'O(n)' },
        { op: 'get',    best: 'O(1)', avg: 'O(1)', worst: 'O(n)', space: 'O(n)' },
        { op: 'delete', best: 'O(1)', avg: 'O(1)', worst: 'O(n)', space: 'O(n)' },
        { op: 'rehash', best: 'O(n)', avg: 'O(n)', worst: 'O(n)', space: 'O(n)' },
      ]} />

      <RealWorldCard>
        <p>
          Every language's built-in map/dict — Python's <code>dict</code>,
          Java's <code>HashMap</code>, Go's <code>map</code>, JS <code>Object</code>
          and <code>Map</code> — is a hash table. Redis is an in-memory hash
          table on the wire. TCP session tables in the kernel are open-addressed
          hash tables. Bloom filters and cuckoo hashing are hash-table
          variants tuned for space or worst-case guarantees.
        </p>
      </RealWorldCard>
    </TopicShell>
  )
}

/* KaTeX inline helper — the shared TeX exports as a span, but this
 * page uses it inside a bullet where we don't want extra imports. */
function TeXInline({ tex }) {
  const ref = useMemo(() => ({ current: null }), [])
  return (
    <span
      ref={el => {
        if (!el) return
        ref.current = el
        import('katex').then(({ default: katex }) => {
          try { katex.render(tex, el, { throwOnError: false }) } catch { el.textContent = tex }
        })
      }}
    />
  )
}
