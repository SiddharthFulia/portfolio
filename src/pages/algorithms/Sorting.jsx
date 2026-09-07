// Sorting — Bubble, Counting, Quick, Merge, Radix.
//
// Two modes:
//   • Race mode  — all five algorithms run in parallel on the same
//                  random array, bar-chart per algo with live counters
//                  and a comparison table at the end (comparisons, swaps,
//                  time, stable).
//   • Detail mode — pick one algorithm and step through its execution
//                   with pseudocode highlighting.
//
// Each sort is a JS generator that yields a plain-object frame per
// interesting event. Race mode consumes N frames per animation tick per
// algorithm and enforces a 5-second timeout so a slow bubble sort
// doesn't hold the whole race hostage.

import { useEffect, useMemo, useRef, useState } from 'react'
import { InputNumber, Segmented, Progress } from 'antd'
import {
  TopicShell, ExplanationBlock, VisualiserSection, VizPanel,
  ControlsPanel, StepControls, useStepEngine, PseudocodeBlock,
  ComplexityTable, RealWorldCard, Field, Chip, TeX,
} from '../../components/algorithms'
import { Button } from '../../components/ui'

// ─── RNG ──────────────────────────────────────────────────
function mulberry32(seed) {
  let a = (seed | 0) || 1
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function genArray(n, seed) {
  const rng = mulberry32(seed)
  const a = new Array(n)
  for (let i = 0; i < n; i++) a[i] = Math.floor(rng() * 100) + 1
  return a
}

// ─── Bubble sort ─────────────────────────────────────────
function* bubbleSort(a) {
  a = a.slice()
  const n = a.length
  let cmp = 0, swap = 0
  for (let i = 0; i < n - 1; i++) {
    let swapped = false
    for (let j = 0; j < n - i - 1; j++) {
      cmp++
      yield { a: a.slice(), cmp, swap, line: 3, hi: [j, j + 1] }
      if (a[j] > a[j + 1]) {
        [a[j], a[j + 1]] = [a[j + 1], a[j]]
        swap++
        swapped = true
        yield { a: a.slice(), cmp, swap, line: 4, hi: [j, j + 1], swapped: [j, j + 1] }
      }
    }
    if (!swapped) break
  }
  return { a, cmp, swap }
}
const BUBBLE_PSEUDO = [
  'for i = 0 .. n-2:',
  '  swapped = false',
  '  for j = 0 .. n-i-2:',
  '    if a[j] > a[j+1]:',
  '      swap a[j], a[j+1]; swapped = true',
  '  if not swapped: break',
]

// ─── Counting sort (assumes non-negative bounded values) ─
function* countingSort(a) {
  a = a.slice()
  const n = a.length
  let cmp = 0, swap = 0
  const max = a.reduce((m, v) => v > m ? v : m, 0)
  const count = new Array(max + 1).fill(0)
  for (let i = 0; i < n; i++) {
    count[a[i]]++
    yield { a: a.slice(), cmp, swap, line: 2, hi: [i], count: count.slice() }
  }
  let out = 0
  for (let v = 0; v <= max; v++) {
    while (count[v] > 0) {
      a[out++] = v; count[v]--; swap++
      yield { a: a.slice(), cmp, swap, line: 5, hi: [out - 1], count: count.slice() }
    }
  }
  return { a, cmp, swap }
}
const COUNTING_PSEUDO = [
  'k = max(a)',
  'count = int[k+1]',
  'for x in a: count[x] += 1',
  'out = 0',
  'for v = 0 .. k:',
  '  while count[v] > 0: a[out++] = v; count[v]--',
]

// ─── Quicksort (Lomuto) ──────────────────────────────────
function* quickSort(a) {
  a = a.slice()
  let cmp = 0, swap = 0
  function* rec(lo, hi) {
    if (lo >= hi) return
    const pivot = a[hi]
    let i = lo - 1
    for (let j = lo; j < hi; j++) {
      cmp++
      yield { a: a.slice(), cmp, swap, line: 4, hi: [j, hi], pivot: hi }
      if (a[j] < pivot) {
        i++
        if (i !== j) { [a[i], a[j]] = [a[j], a[i]]; swap++ }
        yield { a: a.slice(), cmp, swap, line: 5, hi: [i, j], pivot: hi }
      }
    }
    [a[i + 1], a[hi]] = [a[hi], a[i + 1]]; swap++
    yield { a: a.slice(), cmp, swap, line: 7, hi: [i + 1, hi], pivot: i + 1 }
    yield* rec(lo, i)
    yield* rec(i + 2, hi)
  }
  yield* rec(0, a.length - 1)
  return { a, cmp, swap }
}
const QUICK_PSEUDO = [
  'quicksort(lo, hi):',
  '  if lo >= hi: return',
  '  pivot = a[hi]; i = lo - 1',
  '  for j = lo .. hi-1:',
  '    if a[j] < pivot:',
  '      i++; swap a[i], a[j]',
  '  swap a[i+1], a[hi]',
  '  quicksort(lo, i); quicksort(i+2, hi)',
]

// ─── Merge sort ──────────────────────────────────────────
function* mergeSort(a) {
  a = a.slice()
  let cmp = 0, swap = 0
  function* rec(lo, hi) {
    if (hi - lo <= 1) return
    const mid = (lo + hi) >> 1
    yield* rec(lo, mid)
    yield* rec(mid, hi)
    const merged = []
    let i = lo, j = mid
    while (i < mid && j < hi) {
      cmp++
      yield { a: a.slice(), cmp, swap, line: 6, hi: [i, j] }
      if (a[i] <= a[j]) merged.push(a[i++])
      else merged.push(a[j++])
    }
    while (i < mid) merged.push(a[i++])
    while (j < hi) merged.push(a[j++])
    for (let k = 0; k < merged.length; k++) {
      a[lo + k] = merged[k]; swap++
      yield { a: a.slice(), cmp, swap, line: 9, hi: [lo + k] }
    }
  }
  yield* rec(0, a.length)
  return { a, cmp, swap }
}
const MERGE_PSEUDO = [
  'mergesort(lo, hi):',
  '  if hi - lo <= 1: return',
  '  mid = (lo + hi) / 2',
  '  mergesort(lo, mid)',
  '  mergesort(mid, hi)',
  '  # merge',
  '  while i < mid and j < hi:',
  '    take smaller of a[i], a[j]',
  '  drain the rest',
  '  copy merged back into a',
]

// ─── Radix sort (LSD, base 10) ───────────────────────────
function* radixSort(a) {
  a = a.slice()
  let cmp = 0, swap = 0
  const max = a.reduce((m, v) => v > m ? v : m, 0)
  for (let exp = 1; exp <= max; exp *= 10) {
    const buckets = Array.from({ length: 10 }, () => [])
    for (let i = 0; i < a.length; i++) {
      const digit = Math.floor(a[i] / exp) % 10
      buckets[digit].push(a[i])
      yield { a: a.slice(), cmp, swap, line: 4, hi: [i], exp, digit }
    }
    let k = 0
    for (let d = 0; d < 10; d++) {
      for (const v of buckets[d]) {
        a[k++] = v; swap++
        yield { a: a.slice(), cmp, swap, line: 6, hi: [k - 1], exp }
      }
    }
  }
  return { a, cmp, swap }
}
const RADIX_PSEUDO = [
  'max = max(a)',
  'for exp = 1, 10, 100 .. max:',
  '  buckets[0..9] = []',
  '  for x in a:',
  '    buckets[(x / exp) % 10].push(x)',
  '  flatten buckets back into a',
]

// ─── Registry ──────────────────────────────────────────
const ALGS = {
  bubble:   { name: 'Bubble Sort',   gen: bubbleSort,   pseudo: BUBBLE_PSEUDO,   stable: 'yes', color: '#fbbf24' },
  counting: { name: 'Counting Sort', gen: countingSort, pseudo: COUNTING_PSEUDO, stable: 'yes', color: '#34d399' },
  quick:    { name: 'Quick Sort',    gen: quickSort,    pseudo: QUICK_PSEUDO,    stable: 'no',  color: '#fb7185' },
  merge:    { name: 'Merge Sort',    gen: mergeSort,    pseudo: MERGE_PSEUDO,    stable: 'yes', color: '#a78bfa' },
  radix:    { name: 'Radix Sort',    gen: radixSort,    pseudo: RADIX_PSEUDO,    stable: 'yes', color: '#22d3ee' },
}

// ─── Bar chart ─────────────────────────────────────────
function BarChart({ arr, highlight = [], pivot = null, color = '#fbbf24', height = 140, maxVal = 100 }) {
  const n = arr.length
  const barW = 100 / n
  return (
    <svg viewBox='0 0 100 100' preserveAspectRatio='none' className='w-full' style={{ height }}>
      {arr.map((v, i) => (
        <rect
          key={i}
          x={i * barW}
          y={100 - (v / maxVal) * 95 - 3}
          width={barW * 0.85}
          height={(v / maxVal) * 95}
          fill={
            i === pivot ? '#fbbf24' :
            highlight.includes(i) ? '#fb7185' : color
          }
          opacity={i === pivot ? 1 : highlight.includes(i) ? 1 : 0.85}
        />
      ))}
    </svg>
  )
}

// ─── Race controller ───────────────────────────────────
function useRace(baseArray, running, speed) {
  const [states, setStates] = useState({})
  const stateRef = useRef({})
  const rafRef = useRef(0)
  const startRef = useRef(0)

  useEffect(() => {
    if (!running) return
    // init all iterators
    const st = {}
    for (const key of Object.keys(ALGS)) {
      st[key] = {
        it: ALGS[key].gen(baseArray),
        frame: { a: baseArray.slice(), cmp: 0, swap: 0 },
        done: false, timedOut: false, elapsed: 0,
      }
    }
    stateRef.current = st
    startRef.current = performance.now()
    setStates({ ...st })
    let running2 = true
    const STEPS_PER_FRAME_BASE = 12
    function tick(t) {
      if (!running2) return
      const now = performance.now()
      const elapsed = now - startRef.current
      const stepsPerFrame = Math.max(1, Math.floor(STEPS_PER_FRAME_BASE * speed))
      const cur = stateRef.current
      for (const key of Object.keys(cur)) {
        const s = cur[key]
        if (s.done || s.timedOut) continue
        if (elapsed > 5000) { s.timedOut = true; continue }
        for (let k = 0; k < stepsPerFrame; k++) {
          const step = s.it.next()
          if (step.done) {
            s.done = true
            s.frame = { a: step.value.a, cmp: step.value.cmp, swap: step.value.swap }
            s.elapsed = elapsed
            break
          }
          s.frame = step.value
        }
        if (!s.done) s.elapsed = elapsed
      }
      setStates({ ...cur })
      const allSettled = Object.values(cur).every(s => s.done || s.timedOut)
      if (!allSettled) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { running2 = false; cancelAnimationFrame(rafRef.current) }
  }, [running, baseArray, speed])

  return states
}

// ─── Detail mode component ────────────────────────────
function DetailMode({ pick, base }) {
  const [frames, setFrames] = useState([])
  useEffect(() => {
    const out = []
    const it = ALGS[pick].gen(base)
    let step
    while (!(step = it.next()).done) out.push(step.value)
    setFrames(out)
  }, [pick, base])
  const [idx, setIdx] = useState(0)
  const { i, playing, play, pause, step, reset, speed, setSpeed } = useStepEngine({
    frameCount: frames.length,
    onFrame: setIdx,
  })
  useEffect(() => { reset() /* eslint-disable-next-line */ }, [pick, base])
  const cur = frames[idx] || { a: base, cmp: 0, swap: 0, hi: [], line: -1 }

  return (
    <>
      <BarChart arr={cur.a} highlight={cur.hi || []} pivot={cur.pivot ?? null} color={ALGS[pick].color} height={180} />
      <div className='mt-2 flex flex-wrap gap-2 text-xs text-white/70 font-mono'>
        <Chip tone='amber'>cmp {cur.cmp}</Chip>
        <Chip tone='rose'>swap {cur.swap}</Chip>
        <Chip tone='gray'>step {i + 1}/{frames.length || 1}</Chip>
      </div>
      <div className='mt-3'>
        <StepControls
          playing={playing} onPlay={play} onPause={pause} onStep={step} onReset={reset}
          speed={speed} onSpeed={setSpeed}
        />
      </div>
      <div className='mt-4'>
        <PseudocodeBlock lines={ALGS[pick].pseudo} activeLine={cur.line ?? -1} title={`${ALGS[pick].name} — pseudocode`} />
      </div>
    </>
  )
}

// ─── Page ─────────────────────────────────────────────
export default function Sorting() {
  const [n, setN] = useState(40)
  const [seed, setSeed] = useState(3)
  const base = useMemo(() => genArray(n, seed), [n, seed])
  const [mode, setMode] = useState('race')
  const [pick, setPick] = useState('bubble')
  const [running, setRunning] = useState(false)
  const [runToken, setRunToken] = useState(0)
  const [raceSpeed, setRaceSpeed] = useState(1)

  const races = useRace(base, running, raceSpeed)

  useEffect(() => { setRunning(false) }, [base, mode])

  return (
    <TopicShell slug='sorting' title='Sorting' category='Algorithms'>
      <ExplanationBlock>
        <p>
          Sorting is the algorithmic pantry. Almost every non-trivial
          problem starts with "first, sort the input" — searches become
          binary, dedupe becomes a linear scan, medians become O(1)
          lookups. So the question is never "should I sort" but "which
          sort matches the shape of my data".
        </p>
        <p>
          Below, race five classic sorts on the same random array. Watch
          how <b>Bubble Sort</b> crawls, <b>Counting Sort</b> finishes in a
          single pass (but only works for small integer keys), <b>Quick
          Sort</b> is fast on average but hates already-sorted input,
          <b> Merge Sort</b> is rock-solid <TeX tex='O(n\\log n)' /> always
          but needs O(n) extra memory, and <b>Radix Sort</b> beats them all
          on fixed-width integer keys.
        </p>
        <p>Then flip to detail mode and step through any one algorithm.</p>
      </ExplanationBlock>

      <VisualiserSection>
        <VizPanel>
          <div className='flex flex-wrap items-center gap-2 mb-3'>
            <Segmented
              options={[
                { label: 'Race all five', value: 'race' },
                { label: 'Detail one', value: 'detail' },
              ]}
              value={mode} onChange={setMode}
            />
            {mode === 'detail' && (
              <Segmented
                options={Object.entries(ALGS).map(([k, v]) => ({ label: v.name, value: k }))}
                value={pick} onChange={setPick}
              />
            )}
          </div>

          {mode === 'race' ? (
            <>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                {Object.entries(ALGS).map(([key, meta]) => {
                  const s = races[key] || { frame: { a: base, cmp: 0, swap: 0 }, elapsed: 0, done: false, timedOut: false }
                  return (
                    <div key={key} className='rounded-lg border border-white/10 bg-black/30 p-3'>
                      <div className='flex items-center justify-between text-xs mb-1'>
                        <span className='font-medium' style={{ color: meta.color }}>{meta.name}</span>
                        <span className='text-white/60 font-mono'>
                          {s.done ? `${(s.elapsed / 1000).toFixed(2)}s` : s.timedOut ? 'timeout' : `${(s.elapsed / 1000).toFixed(1)}s`}
                        </span>
                      </div>
                      <BarChart arr={s.frame.a} highlight={s.frame.hi || []} color={meta.color} height={80} />
                      <div className='mt-1 flex gap-2 text-[10px] text-white/50 font-mono'>
                        <span>cmp {s.frame.cmp}</span>
                        <span>swap {s.frame.swap}</span>
                        {s.done ? <span className='text-emerald-300'>done</span> : null}
                        {s.timedOut ? <span className='text-rose-300'>5s cap</span> : null}
                      </div>
                    </div>
                  )
                })}
              </div>
              {/* Comparison table shows once at least one is settled */}
              <div className='mt-4 overflow-x-auto'>
                <table className='w-full text-xs sm:text-sm'>
                  <thead>
                    <tr className='text-left text-white/60 border-b border-white/10'>
                      <th className='py-1.5 pr-3'>Algorithm</th>
                      <th className='py-1.5 pr-3'>Comparisons</th>
                      <th className='py-1.5 pr-3'>Swaps / writes</th>
                      <th className='py-1.5 pr-3'>Time</th>
                      <th className='py-1.5 pr-3'>Stable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(ALGS).map(([key, meta]) => {
                      const s = races[key] || { frame: { cmp: 0, swap: 0 }, elapsed: 0 }
                      return (
                        <tr key={key} className='border-b border-white/5'>
                          <td className='py-1.5 pr-3'><span style={{ color: meta.color }}>■</span> {meta.name}</td>
                          <td className='py-1.5 pr-3 font-mono'>{s.frame.cmp}</td>
                          <td className='py-1.5 pr-3 font-mono'>{s.frame.swap}</td>
                          <td className='py-1.5 pr-3 font-mono'>{(s.elapsed / 1000).toFixed(2)}s</td>
                          <td className='py-1.5 pr-3'>{meta.stable === 'yes' ? <span className='text-emerald-300'>yes</span> : <span className='text-rose-300'>no</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <DetailMode pick={pick} base={base} />
          )}
        </VizPanel>
        <ControlsPanel>
          <Field label='Array size' helper='Race caps at 5s per algorithm.'>
            <InputNumber min={5} max={200} value={n} onChange={v => setN(v || 5)} className='w-full' />
          </Field>
          <Field label='Seed'>
            <InputNumber min={0} max={9999} value={seed} onChange={v => setSeed(v || 0)} className='w-full' />
          </Field>
          {mode === 'race' && (
            <>
              <Field label='Race speed' helper='Steps per animation frame.'>
                <InputNumber min={0.25} max={4} step={0.25} value={raceSpeed} onChange={v => setRaceSpeed(v || 1)} className='w-full' />
              </Field>
              <Button
                variant='primary'
                onClick={() => { setRunning(false); setTimeout(() => setRunning(true), 30); setRunToken(x => x + 1) }}
              >
                {running ? 'Restart race' : 'Run race'}
              </Button>
              <Button variant='ghost' onClick={() => setRunning(false)}>Stop</Button>
            </>
          )}
        </ControlsPanel>
      </VisualiserSection>

      <ComplexityTable rows={[
        { op: 'Bubble Sort',   best: 'O(n)',        avg: 'O(n^2)',       worst: 'O(n^2)',       space: 'O(1)' },
        { op: 'Counting Sort', best: 'O(n+k)',      avg: 'O(n+k)',       worst: 'O(n+k)',       space: 'O(k)' },
        { op: 'Quick Sort',    best: 'O(n\\log n)', avg: 'O(n\\log n)',  worst: 'O(n^2)',       space: 'O(\\log n)' },
        { op: 'Merge Sort',    best: 'O(n\\log n)', avg: 'O(n\\log n)',  worst: 'O(n\\log n)',  space: 'O(n)' },
        { op: 'Radix Sort',    best: 'O(nk)',       avg: 'O(nk)',        worst: 'O(nk)',        space: 'O(n+k)' },
      ]} />

      <RealWorldCard>
        <p>
          <b>Quicksort</b> is what <code>std::sort</code>, Rust's
          <code>slice::sort_unstable</code>, and V8's Array.sort actually
          use (with median-of-three + insertion-sort tail).
          <b> Timsort</b> (a hybrid of Merge + Insertion) powers Python's
          <code>sorted()</code> and Java's <code>Arrays.sort(Object[])</code>.
        </p>
        <p>
          <b>Radix</b> and <b>Counting</b> show up in specialised paths:
          GPU sort, IP-address sorting, database column sort on integer
          keys. They dodge the <TeX tex='\\Omega(n \\log n)' /> comparison
          lower bound by not using comparisons.
        </p>
      </RealWorldCard>
    </TopicShell>
  )
}

