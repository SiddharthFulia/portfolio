// Searching — linear vs binary, on a sorted array, side-by-side race.
//
// User picks size, seed, target. Both searches step through the same
// array; a live pointer / lo–hi–mid overlay makes the difference
// visceral. Race mode: both start at t=0 and we track total steps.

import { useEffect, useMemo, useState } from 'react'
import { InputNumber, Segmented } from 'antd'
import {
  TopicShell, ExplanationBlock, VisualiserSection, VizPanel,
  ControlsPanel, StepControls, useStepEngine, PseudocodeBlock,
  ComplexityTable, RealWorldCard, Field, Chip, TeX,
} from '../../components/algorithms'
import { Button } from '../../components/ui'

function mulberry32(seed) {
  let a = (seed | 0) || 1
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function genSorted(n, seed) {
  const rng = mulberry32(seed)
  // Distinct sorted values in [1, 500]
  const set = new Set()
  while (set.size < n) set.add(Math.floor(rng() * 500) + 1)
  return [...set].sort((a, b) => a - b)
}

// ─── Linear ─────────────────────────────────────────
function* linearSearch(arr, target) {
  for (let i = 0; i < arr.length; i++) {
    yield { i, line: 1, found: false }
    if (arr[i] === target) {
      yield { i, line: 2, found: true }
      return { found: true, at: i, steps: i + 1 }
    }
  }
  return { found: false, at: -1, steps: arr.length }
}
const LINEAR_PSEUDO = [
  'for i = 0 .. n-1:',
  '  if a[i] == target: return i',
  'return -1',
]

// ─── Binary ─────────────────────────────────────────
function* binarySearch(arr, target) {
  let lo = 0, hi = arr.length - 1
  let steps = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    steps++
    yield { lo, hi, mid, line: 3, found: false }
    if (arr[mid] === target) {
      yield { lo, hi, mid, line: 4, found: true }
      return { found: true, at: mid, steps }
    }
    if (arr[mid] < target) { lo = mid + 1; yield { lo, hi, mid, line: 6, found: false } }
    else { hi = mid - 1; yield { lo, hi, mid, line: 7, found: false } }
  }
  return { found: false, at: -1, steps }
}
const BINARY_PSEUDO = [
  'lo = 0; hi = n - 1',
  'while lo <= hi:',
  '  mid = (lo + hi) / 2',
  '  if a[mid] == target: return mid',
  '  else if a[mid] < target:',
  '    lo = mid + 1',
  '  else:',
  '    hi = mid - 1',
  'return -1',
]

// ─── Row viz ─────────────────────────────────────────
function ArrayRow({ arr, target, cur, kind }) {
  const n = arr.length
  const W = 100, barW = W / n
  return (
    <svg viewBox={`0 0 ${W} 22`} preserveAspectRatio='none' className='w-full' style={{ height: 60 }}>
      {arr.map((v, i) => {
        let fill = '#334155'
        if (kind === 'linear' && cur?.i === i) fill = cur.found ? '#34d399' : '#fbbf24'
        if (kind === 'binary') {
          if (cur && i >= cur.lo && i <= cur.hi) fill = '#475569'
          if (cur?.mid === i) fill = cur.found ? '#34d399' : '#fbbf24'
        }
        return (
          <g key={i}>
            <rect x={i * barW + 0.1} y={4} width={barW - 0.2} height={14} fill={fill} />
            {n <= 32 && (
              <text
                x={i * barW + barW / 2}
                y={14}
                fontSize={Math.min(4, barW * 0.4)}
                textAnchor='middle'
                fill={v === target ? '#fbbf24' : '#e5e7eb'}
                fontFamily='ui-monospace, monospace'
              >
                {v}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ─── Per-algo player ────────────────────────────────
function useFrames(gen, arr, target) {
  return useMemo(() => {
    const frames = []
    const it = gen(arr, target)
    let step
    while (!(step = it.next()).done) frames.push(step.value)
    frames.push({ done: true, value: step.value })
    return frames
  }, [gen, arr, target])
}

export default function Searching() {
  const [n, setN] = useState(24)
  const [seed, setSeed] = useState(5)
  const arr = useMemo(() => genSorted(n, seed), [n, seed])
  const [target, setTarget] = useState(arr[Math.floor(arr.length / 2)])
  useEffect(() => { setTarget(arr[Math.floor(arr.length / 2)]) }, [arr])
  const [mode, setMode] = useState('race')

  const linFrames = useFrames(linearSearch, arr, target)
  const binFrames = useFrames(binarySearch, arr, target)

  const lin = useStepEngine({ frameCount: linFrames.length })
  const bin = useStepEngine({ frameCount: binFrames.length })

  useEffect(() => { lin.reset(); bin.reset() /* eslint-disable-next-line */ }, [n, seed, target])

  const linCur = linFrames[lin.i] || null
  const binCur = binFrames[bin.i] || null

  const linSteps = (linCur && linCur.i != null) ? linCur.i + 1 : 0
  const binSteps = Math.ceil((bin.i + 1) / 2)

  const runBoth = () => { lin.play(); bin.play() }
  const stopBoth = () => { lin.pause(); bin.pause() }
  const resetBoth = () => { lin.reset(); bin.reset() }

  return (
    <TopicShell slug='searching' title='Searching' category='Algorithms'>
      <ExplanationBlock>
        <p>
          Linear search reads every element in turn — it works on any
          array. Binary search halves the search space every step but
          requires the array to be sorted first. On <TeX tex='n' /> items
          binary makes <TeX tex='\\lceil \\log_2 n \\rceil' /> comparisons
          worst case, so 1 million items resolves in ~20 steps.
        </p>
        <p>
          Watch the pointers move below. The array is sorted ascending;
          binary jumps to the midpoint of the current lo/hi window,
          shrinks it, and repeats. Linear walks it left-to-right.
        </p>
      </ExplanationBlock>

      <VisualiserSection>
        <VizPanel>
          <div className='flex flex-wrap items-center gap-2 mb-3'>
            <Segmented
              options={[
                { label: 'Race both', value: 'race' },
                { label: 'Linear only', value: 'linear' },
                { label: 'Binary only', value: 'binary' },
              ]}
              value={mode} onChange={setMode}
            />
          </div>
          {(mode === 'race' || mode === 'linear') && (
            <div className='mb-4'>
              <div className='text-xs text-white/60 mb-1'>Linear search · steps <span className='font-mono text-amber-300'>{linSteps}</span></div>
              <ArrayRow arr={arr} target={target} cur={linCur} kind='linear' />
            </div>
          )}
          {(mode === 'race' || mode === 'binary') && (
            <div className='mb-2'>
              <div className='text-xs text-white/60 mb-1'>Binary search · steps <span className='font-mono text-cyan-300'>{binSteps}</span></div>
              <ArrayRow arr={arr} target={target} cur={binCur} kind='binary' />
            </div>
          )}
          <div className='mt-3 flex gap-2 flex-wrap'>
            <Button variant='primary' onClick={runBoth}>Play both</Button>
            <Button variant='ghost' onClick={stopBoth}>Pause</Button>
            <Button variant='subtle' onClick={resetBoth}>Reset</Button>
          </div>
        </VizPanel>
        <ControlsPanel>
          <Field label='Array size' helper='Values are distinct and pre-sorted.'>
            <InputNumber min={4} max={64} value={n} onChange={v => setN(v || 4)} className='w-full' />
          </Field>
          <Field label='Seed'>
            <InputNumber min={0} max={9999} value={seed} onChange={v => setSeed(v || 0)} className='w-full' />
          </Field>
          <Field label='Target' helper='Enter a value that may or may not exist.'>
            <InputNumber min={0} max={1000} value={target} onChange={v => setTarget(v || 0)} className='w-full' />
          </Field>
          <div className='flex flex-wrap gap-1.5 text-[11px] text-white/60'>
            <Chip tone='amber'>{arr.includes(target) ? 'target present' : 'target missing'}</Chip>
            <Chip tone='gray'>log₂(n) = {Math.ceil(Math.log2(Math.max(1, n)))}</Chip>
          </div>
          <div className='pt-2'>
            <StepControls
              playing={lin.playing || bin.playing}
              onPlay={runBoth} onPause={stopBoth}
              onStep={() => { lin.step(); bin.step() }}
              onReset={resetBoth}
              speed={lin.speed}
              onSpeed={(v) => { lin.setSpeed(v); bin.setSpeed(v) }}
            />
          </div>
        </ControlsPanel>
      </VisualiserSection>

      {(mode === 'race' || mode === 'linear') && (
        <PseudocodeBlock lines={LINEAR_PSEUDO} activeLine={linCur?.line ?? -1} title='Linear Search — pseudocode' />
      )}
      {(mode === 'race' || mode === 'binary') && (
        <PseudocodeBlock lines={BINARY_PSEUDO} activeLine={binCur?.line ?? -1} title='Binary Search — pseudocode' />
      )}

      <ComplexityTable rows={[
        { op: 'Linear Search',      best: 'O(1)',        avg: 'O(n)',        worst: 'O(n)',        space: 'O(1)' },
        { op: 'Binary Search',      best: 'O(1)',        avg: 'O(\\log n)',   worst: 'O(\\log n)',   space: 'O(1)' },
        { op: 'Interpolation',      best: 'O(1)',        avg: 'O(\\log\\log n)', worst: 'O(n)',    space: 'O(1)' },
        { op: 'Exponential (bounded)', best: 'O(1)',    avg: 'O(\\log n)',   worst: 'O(\\log n)',   space: 'O(1)' },
      ]} />

      <section className='luxe-glass rounded-2xl p-5 sm:p-6'>
        <h2 className='text-lg sm:text-xl font-bold text-amber-100 mb-3'>Binary search gotchas</h2>
        <ul className='text-sm text-gray-300 space-y-2 list-disc list-inside'>
          <li>
            <b>Off-by-one</b> — the <TeX tex='lo <= hi' /> vs
            <TeX tex='lo < hi' /> distinction depends on whether you
            include <TeX tex='hi' /> as a valid index. Pick one
            convention and stick with it.
          </li>
          <li>
            <b>Overflow</b> — <TeX tex='(lo + hi) / 2' /> overflows in
            C/Java when both are large. Use <TeX tex='lo + (hi - lo) / 2' />.
            JS's Number handles it fine up to <TeX tex='2^{53}' />.
          </li>
          <li>
            <b>Duplicates</b> — vanilla binary search returns
            <i> some </i> index of the target if it exists. For "first"
            or "last" occurrence you need <TeX tex='lower\\_bound' /> or
            <TeX tex='upper\\_bound' /> (finding the boundary of the
            equal range).
          </li>
          <li>
            <b>Non-uniform data</b> — if values are roughly uniformly
            distributed, interpolation search averages
            <TeX tex='O(\\log\\log n)' />. Beats binary on huge sorted
            files.
          </li>
        </ul>
      </section>

      <section className='luxe-glass rounded-2xl p-5 sm:p-6'>
        <h2 className='text-lg sm:text-xl font-bold text-amber-100 mb-3'>Binary search on the answer</h2>
        <p className='text-sm text-gray-300 leading-relaxed mb-2'>
          A meta-pattern that shows up often in interviews: if the
          predicate "can we finish in ≤ X time" is monotone in X, you
          can binary-search on X even without a sorted array.
        </p>
        <p className='text-sm text-gray-300 leading-relaxed'>
          Classic examples: "minimum capacity to ship packages within D
          days", "smallest divisor with sum ≤ threshold", "aggressive
          cows on a fence". All reduce to
          <TeX tex='O(\\log R \\cdot n)' /> where <TeX tex='R' /> is the
          range of answers.
        </p>
      </section>

      <RealWorldCard>
        <p>
          Every DB index resolves in log time via a B-tree, which is
          "binary search but with wider fan-out". Rust's
          <code>slice::binary_search</code>, C++'s
          <code>std::lower_bound</code>, Python's <code>bisect</code>, and
          the lookup phase of Git's object database all use binary search
          under the hood.
        </p>
        <p>
          Linear stays useful when data is unsorted, small (cache-line
          scan), or when you also need to <i>process</i> each element
          (average, sum, first-match with side effects).
        </p>
      </RealWorldCard>
    </TopicShell>
  )
}
