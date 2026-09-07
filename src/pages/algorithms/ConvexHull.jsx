// Convex Hull — Andrew's Monotone Chain (O(n log n)).
//
// Sort points by (x, y). Build the upper hull left→right, then the
// lower hull right→left, using the cross-product test to pop last
// two points whenever we'd make a non-left turn.
//
// Users can click on the canvas to add points, then Run to compute.

import { useEffect, useMemo, useRef, useState } from 'react'
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
function genPoints(n, seed) {
  const rng = mulberry32(seed)
  const out = []
  for (let i = 0; i < n; i++) out.push({ x: 40 + rng() * 320, y: 40 + rng() * 240 })
  return out
}

// ─── Cross product ──────────────────────────────
const cross = (O, A, B) => (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x)

// ─── Monotone chain w/ frames ──────────────────
function hullFrames(points) {
  const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y)
  const frames = []
  const lower = []
  for (let i = 0; i < pts.length; i++) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pts[i]) <= 0) {
      const popped = lower.pop()
      frames.push({ pts, hullLower: lower.slice(), hullUpper: [], cur: pts[i], popped, phase: 'lower-pop', line: 3, msg: 'right turn — pop' })
    }
    lower.push(pts[i])
    frames.push({ pts, hullLower: lower.slice(), hullUpper: [], cur: pts[i], phase: 'lower-push', line: 4, msg: 'push to lower' })
  }
  const upper = []
  for (let i = pts.length - 1; i >= 0; i--) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pts[i]) <= 0) {
      const popped = upper.pop()
      frames.push({ pts, hullLower: lower.slice(), hullUpper: upper.slice(), cur: pts[i], popped, phase: 'upper-pop', line: 7, msg: 'right turn — pop upper' })
    }
    upper.push(pts[i])
    frames.push({ pts, hullLower: lower.slice(), hullUpper: upper.slice(), cur: pts[i], phase: 'upper-push', line: 8, msg: 'push to upper' })
  }
  // Concat (drop last of each — same as first of the other)
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1))
  frames.push({ pts, hullLower: lower.slice(), hullUpper: upper.slice(), hull, phase: 'done', line: 9, msg: `hull has ${hull.length} vertices` })
  return { frames, hull }
}

const PSEUDO = [
  'sort points by (x, y)',
  'lower = []',
  'for p in points:',
  '  while |lower| >= 2 and cross(lower[-2], lower[-1], p) <= 0:',
  '    lower.pop()',
  '  lower.push(p)',
  'upper = []',
  'for p in reversed(points):',
  '  while |upper| >= 2 and cross(upper[-2], upper[-1], p) <= 0:',
  '    upper.pop()',
  '  upper.push(p)',
  'hull = lower[:-1] + upper[:-1]',
]

function Canvas({ points, frame, onClick }) {
  const W = 400, H = 320
  const path = (arr) => arr.length < 2 ? '' : 'M ' + arr.map(p => `${p.x} ${p.y}`).join(' L ')
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className='w-full h-auto max-h-[420px] cursor-crosshair'
      onClick={onClick}
    >
      <rect x={0} y={0} width={W} height={H} fill='#0b0b0f' rx={8} />
      {/* lower */}
      {frame?.hullLower?.length >= 2 && (
        <path d={path(frame.hullLower)} stroke='#22d3ee' strokeWidth={2} fill='none' />
      )}
      {/* upper */}
      {frame?.hullUpper?.length >= 2 && (
        <path d={path(frame.hullUpper)} stroke='#a78bfa' strokeWidth={2} fill='none' />
      )}
      {/* final polygon */}
      {frame?.hull && (
        <path
          d={path(frame.hull.concat([frame.hull[0]]))}
          stroke='#fbbf24'
          strokeWidth={2.5}
          fill='#fbbf2422'
        />
      )}
      {/* points */}
      {points.map((p, i) => {
        const isCur = frame?.cur === p
        const isPopped = frame?.popped === p
        return (
          <circle
            key={i}
            cx={p.x} cy={p.y}
            r={isCur ? 6 : 4}
            fill={isCur ? '#fbbf24' : isPopped ? '#fb7185' : '#e5e7eb'}
          />
        )
      })}
    </svg>
  )
}

export default function ConvexHull() {
  const [n, setN] = useState(18)
  const [seed, setSeed] = useState(9)
  const [extra, setExtra] = useState([])
  const points = useMemo(() => genPoints(n, seed).concat(extra), [n, seed, extra])
  const { frames, hull } = useMemo(() => hullFrames(points), [points])
  const [idx, setIdx] = useState(0)
  const { i, playing, play, pause, step, reset, speed, setSpeed } = useStepEngine({
    frameCount: frames.length,
    onFrame: setIdx,
  })
  useEffect(() => { reset() /* eslint-disable-next-line */ }, [points])

  const f = frames[idx] || frames[0]

  const handleCanvasClick = (e) => {
    const svg = e.currentTarget
    const box = svg.getBoundingClientRect()
    const vb = svg.viewBox.baseVal
    const x = ((e.clientX - box.left) / box.width) * vb.width
    const y = ((e.clientY - box.top) / box.height) * vb.height
    setExtra(prev => [...prev, { x, y }])
  }

  return (
    <TopicShell slug='convex-hull' title='Convex Hull' category='Algorithms'>
      <ExplanationBlock>
        <p>
          The convex hull of a point set is the smallest convex polygon
          that contains every point. Think of a rubber band snapped
          around a bunch of nails — that's the hull.
        </p>
        <p>
          <b>Andrew's monotone chain</b>: sort by
          <TeX tex='(x, y)' />, build the lower hull left-to-right and
          the upper hull right-to-left. When adding a point would create
          a right turn, pop the last hull vertex. The turn is decided by
          the sign of the cross product{' '}
          <TeX tex='(A - O) \\times (B - O)' /> — positive means left
          turn, zero means collinear, negative means right turn.
        </p>
        <p>
          Runs in <TeX tex='O(n \\log n)' /> — sorted once, each point
          pushed/popped at most once.
        </p>
      </ExplanationBlock>

      <VisualiserSection>
        <VizPanel>
          <Canvas points={points} frame={f} onClick={handleCanvasClick} />
          <div className='mt-2 text-xs text-white/70 font-mono'>
            step {i + 1}/{frames.length} · {f?.msg}
          </div>
          <div className='mt-1 text-xs text-amber-300 font-mono'>
            hull vertices: {hull.length} · click the canvas to add a point
          </div>
        </VizPanel>
        <ControlsPanel>
          <Field label='Random point count'>
            <InputNumber min={4} max={40} value={n} onChange={v => setN(v || 4)} className='w-full' />
          </Field>
          <Field label='Seed'>
            <InputNumber min={0} max={9999} value={seed} onChange={v => setSeed(v || 0)} className='w-full' />
          </Field>
          <Button variant='ghost' onClick={() => setExtra([])}>Clear clicked points ({extra.length})</Button>
          <StepControls
            playing={playing} onPlay={play} onPause={pause} onStep={step} onReset={reset}
            speed={speed} onSpeed={setSpeed}
          />
          <div className='pt-2 flex gap-1.5 flex-wrap'>
            <Chip tone='cyan'>lower chain</Chip>
            <Chip tone='violet'>upper chain</Chip>
            <Chip tone='amber'>final hull</Chip>
            <Chip tone='rose'>popped</Chip>
          </div>
        </ControlsPanel>
      </VisualiserSection>

      <PseudocodeBlock lines={PSEUDO} activeLine={f?.line ?? -1} />

      <ComplexityTable rows={[
        { op: 'Andrew monotone chain', best: 'O(n \\log n)', avg: 'O(n \\log n)', worst: 'O(n \\log n)', space: 'O(n)' },
        { op: 'Graham scan',           best: 'O(n \\log n)', avg: 'O(n \\log n)', worst: 'O(n \\log n)', space: 'O(n)' },
        { op: 'Jarvis march (gift wrap)', best: 'O(nh)',     avg: 'O(nh)',        worst: 'O(n^2)',      space: 'O(n)' },
        { op: 'Chan\'s algorithm',     best: 'O(n \\log h)', avg: 'O(n \\log h)', worst: 'O(n \\log h)', space: 'O(n)' },
      ]} />

      <section className='luxe-glass rounded-2xl p-5 sm:p-6'>
        <h2 className='text-lg sm:text-xl font-bold text-amber-100 mb-3'>Cross-product test cheatsheet</h2>
        <p className='text-sm text-gray-300 leading-relaxed mb-2'>
          Given three points O, A, B, the signed area of triangle
          OAB is <TeX tex='\\tfrac12((A_x - O_x)(B_y - O_y) - (A_y - O_y)(B_x - O_x))' />.
        </p>
        <ul className='text-sm text-gray-300 space-y-1 list-disc list-inside'>
          <li><b>Positive</b> → OAB is a counter-clockwise (left) turn — keep it.</li>
          <li><b>Zero</b> → the three points are collinear. Convention varies: strict hull skips them.</li>
          <li><b>Negative</b> → clockwise (right) turn — pop the last hull vertex.</li>
        </ul>
      </section>

      <section className='luxe-glass rounded-2xl p-5 sm:p-6'>
        <h2 className='text-lg sm:text-xl font-bold text-amber-100 mb-3'>Variations</h2>
        <ul className='text-sm text-gray-300 space-y-2 list-disc list-inside'>
          <li>
            <b>Graham scan</b> — sort by polar angle around the
            lowest point, then sweep with the same right-turn test.
            Same complexity, slightly simpler geometry.
          </li>
          <li>
            <b>Jarvis march</b> (gift wrap) — output-sensitive
            <TeX tex='O(nh)' /> where <TeX tex='h' /> is the number of
            hull vertices. Beats the log-linear algorithms when the
            hull is tiny relative to <TeX tex='n' />.
          </li>
          <li>
            <b>Chan's algorithm</b> — <TeX tex='O(n \\log h)' />{' '}
            output-sensitive, asymptotically the best possible.
            Combines Graham scan on chunks with a Jarvis-style walk
            across them.
          </li>
          <li>
            <b>QuickHull</b> — divide-and-conquer analogue of
            quicksort. Expected <TeX tex='O(n \\log n)' />, worst-case
            <TeX tex='O(n^2)' />. Popular because it generalises
            neatly to 3D.
          </li>
        </ul>
      </section>

      <RealWorldCard>
        <p>
          Collision detection in physics engines (bounding hulls),
          route planning for a UAV around no-fly zones, and every
          "which points are on the outside" question in geometry —
          image cropping via largest enclosed rectangle, clustering
          under a diameter constraint.
        </p>
        <p>
          In machine learning: hull-based outlier detection, SVM support
          vector geometry, and the α-shape family generalises hulls to
          concave outlines.
        </p>
      </RealWorldCard>
    </TopicShell>
  )
}
