// Maximum non-overlapping intervals — the canonical greedy proof.
//
// Sort intervals by end time. Scan left to right; take an interval iff
// it starts at or after the last accepted end. That's it. The proof
// of optimality is a beautiful exchange argument.
//
// Visualiser draws intervals as bars on a horizontal timeline. Play
// steps through: (1) sort, (2) scan left to right, and (3) at each
// step, either accept (glow amber) or reject (fade gray).

import { useEffect, useMemo, useState } from 'react'
import { InputNumber } from 'antd'
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

function genIntervals(n, seed, span = 30) {
  const rng = mulberry32(seed)
  const out = []
  for (let i = 0; i < n; i++) {
    const s = Math.floor(rng() * (span - 3))
    const len = Math.floor(rng() * 5) + 2
    out.push({ id: i, start: s, end: Math.min(span, s + len), origIdx: i })
  }
  return out
}

// ─── Frames ─────────────────────────────────────
function buildFrames(input) {
  const sorted = input.slice().sort((a, b) => a.end - b.end || a.start - b.start)
  const frames = []
  frames.push({ kind: 'sort', sorted: sorted.slice(), accepted: [], msg: 'sorted by end time', line: 0 })
  const accepted = []
  let lastEnd = -Infinity
  for (let i = 0; i < sorted.length; i++) {
    const iv = sorted[i]
    if (iv.start >= lastEnd) {
      accepted.push(iv.id)
      lastEnd = iv.end
      frames.push({ kind: 'accept', cur: i, accepted: accepted.slice(), lastEnd, sorted, msg: `accept [${iv.start}, ${iv.end})`, line: 3 })
    } else {
      frames.push({ kind: 'reject', cur: i, accepted: accepted.slice(), lastEnd, sorted, msg: `skip [${iv.start}, ${iv.end}) overlaps`, line: 5 })
    }
  }
  frames.push({ kind: 'done', accepted: accepted.slice(), sorted, msg: `chose ${accepted.length}`, line: 6 })
  return frames
}

const PSEUDO = [
  'sort intervals by end time',
  'chosen = []',
  'lastEnd = -inf',
  'for iv in intervals:',
  '  if iv.start >= lastEnd:',
  '    chosen.push(iv); lastEnd = iv.end',
  'return chosen',
]

function Timeline({ intervals, frame, span }) {
  if (!intervals.length) return null
  const H = 16
  const rowH = 22
  const W = 400
  const scale = (t) => (t / span) * (W - 20) + 10
  const rows = intervals.length
  return (
    <svg viewBox={`0 0 ${W} ${rows * rowH + 20}`} className='w-full h-auto max-h-[500px]'>
      {/* time axis */}
      <line x1={10} x2={W - 10} y1={rows * rowH + 8} y2={rows * rowH + 8} stroke='#334155' strokeWidth={1} />
      {Array.from({ length: span + 1 }, (_, i) => (
        <g key={i}>
          <line x1={scale(i)} x2={scale(i)} y1={rows * rowH + 6} y2={rows * rowH + 12} stroke='#475569' />
          {i % 5 === 0 && <text x={scale(i)} y={rows * rowH + 18} fontSize={7} textAnchor='middle' fill='#94a3b8'>{i}</text>}
        </g>
      ))}
      {/* current-lastEnd marker */}
      {frame && frame.lastEnd != null && isFinite(frame.lastEnd) && (
        <line x1={scale(frame.lastEnd)} x2={scale(frame.lastEnd)} y1={0} y2={rows * rowH + 4} stroke='#34d399' strokeDasharray='2 2' />
      )}
      {intervals.map((iv, r) => {
        const isAccepted = frame?.accepted?.includes(iv.id)
        const isCur = frame?.cur === r
        const fill = isAccepted ? '#fbbf24' : isCur ? '#fb7185' : '#475569'
        return (
          <g key={iv.id}>
            <rect
              x={scale(iv.start)}
              y={r * rowH + 3}
              width={Math.max(2, scale(iv.end) - scale(iv.start))}
              height={H}
              fill={fill}
              opacity={isAccepted ? 1 : isCur ? 1 : 0.55}
              rx={2}
            />
            <text x={scale(iv.start) + 3} y={r * rowH + 15} fontSize={9} fill='#0b0b0f' fontFamily='ui-monospace, monospace'>
              [{iv.start},{iv.end})
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default function GreedyIntervals() {
  const [n, setN] = useState(12)
  const [seed, setSeed] = useState(2)
  const [span, setSpan] = useState(30)
  const input = useMemo(() => genIntervals(n, seed, span), [n, seed, span])
  const frames = useMemo(() => buildFrames(input), [input])
  const [idx, setIdx] = useState(0)
  const { i, playing, play, pause, step, reset, speed, setSpeed } = useStepEngine({
    frameCount: frames.length,
    onFrame: setIdx,
  })
  useEffect(() => { reset() /* eslint-disable-next-line */ }, [n, seed, span])
  const f = frames[idx] || frames[0]
  const rendered = f?.sorted || input

  return (
    <TopicShell slug='greedy-intervals' title='Interval Scheduling (Greedy)' category='Algorithms'>
      <ExplanationBlock>
        <p>
          Given a set of intervals, pick the largest subset such that no
          two overlap. The greedy strategy: sort by <b>end time</b>, scan
          left to right, take an interval iff it starts at or after the
          last accepted end.
        </p>
        <p>
          Why <i>end</i> time and not <i>start</i> time? Because
          finishing early leaves the most room for future intervals — the
          textbook "exchange argument". If an optimal solution ever
          skipped the earliest-finishing interval, we could swap it in
          without hurting anything.
        </p>
        <p>
          Runs in <TeX tex='O(n \\log n)' /> (dominated by the sort).
          Selecting is a single linear pass.
        </p>
      </ExplanationBlock>

      <VisualiserSection>
        <VizPanel>
          <Timeline intervals={rendered} frame={f} span={span} />
          <div className='mt-3 text-xs text-white/70 font-mono'>
            step {i + 1}/{frames.length} · {f?.msg}
          </div>
          <div className='mt-1 text-xs text-emerald-300 font-mono'>
            accepted: {f?.accepted?.length || 0} intervals
          </div>
        </VizPanel>
        <ControlsPanel>
          <Field label='Interval count' helper='More intervals = more conflicts.'>
            <InputNumber min={4} max={20} value={n} onChange={v => setN(v || 4)} className='w-full' />
          </Field>
          <Field label='Seed'>
            <InputNumber min={0} max={9999} value={seed} onChange={v => setSeed(v || 0)} className='w-full' />
          </Field>
          <Field label='Time span' helper='Total width of the schedule.'>
            <InputNumber min={10} max={60} value={span} onChange={v => setSpan(v || 10)} className='w-full' />
          </Field>
          <StepControls
            playing={playing} onPlay={play} onPause={pause} onStep={step} onReset={reset}
            speed={speed} onSpeed={setSpeed}
          />
          <div className='pt-2 flex gap-1.5 flex-wrap'>
            <Chip tone='amber'>accepted</Chip>
            <Chip tone='rose'>current</Chip>
            <Chip tone='gray'>rejected</Chip>
            <Chip tone='emerald'>lastEnd</Chip>
          </div>
        </ControlsPanel>
      </VisualiserSection>

      <PseudocodeBlock lines={PSEUDO} activeLine={f?.line ?? -1} />

      <ComplexityTable rows={[
        { op: 'Greedy (end sort)', best: 'O(n \\log n)', avg: 'O(n \\log n)', worst: 'O(n \\log n)', space: 'O(n)' },
        { op: 'Greedy (start sort)', best: 'O(n \\log n)', avg: 'O(n \\log n)', worst: 'O(n \\log n)', space: 'O(n)' },
        { op: 'DP (weighted variant)', best: 'O(n \\log n)', avg: 'O(n \\log n)', worst: 'O(n \\log n)', space: 'O(n)' },
        { op: 'Brute force (2^n)', best: 'O(2^n)', avg: 'O(2^n)', worst: 'O(2^n)', space: 'O(n)' },
      ]} />

      <RealWorldCard>
        <p>
          Room/resource booking systems, meeting-room schedulers, and
          batch-job placement all use variants of this. When jobs have
          weights (not just count), the greedy stops being optimal — you
          need <b>weighted interval scheduling</b> DP instead.
        </p>
        <p>
          In OS land, Earliest Deadline First (EDF) scheduling for
          real-time tasks is the same shape of algorithm applied to
          preemptive jobs.
        </p>
      </RealWorldCard>
    </TopicShell>
  )
}
