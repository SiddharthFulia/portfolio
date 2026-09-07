// Divide & Conquer — a live recursion-tree visualiser + the classic
// "closest pair of points" instance to make the strategy tangible.
//
// UI:
//   1. User picks N points and a seed. We generate them, sort by X.
//   2. The user hits Run — we compute the closest pair via D&C, but we
//      *record* every recursive call as a tree node so the viz can play
//      back the divide → combine sweep.
//   3. Left panel shows the recursion tree drawn as a real SVG tree
//      (radially horizontal, so wide trees still fit).
//      Right panel shows the point cloud with the current strip / active
//      slab / candidate segment overlaid.
//
// We ship the O(n log n) algorithm — sort by y within the strip and
// only inspect the next 7 points below (the classic Shamos bound), so
// this is a real implementation, not brute force in a wig.

import { useEffect, useMemo, useRef, useState } from 'react'
import { InputNumber } from 'antd'
import {
  TopicShell, ExplanationBlock, VisualiserSection, VizPanel,
  ControlsPanel, StepControls, useStepEngine, PseudocodeBlock,
  ComplexityTable, RealWorldCard, Field, Chip, TeX,
} from '../../components/algorithms'
import { Button } from '../../components/ui'

// ─── Seeded RNG ────────────────────────────────────────────────
function mulberry32(seed) {
  let a = (seed | 0) || 1
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ─── Generate points in a unit box ─────────────────────────────
function genPoints(n, seed) {
  const rng = mulberry32(seed)
  const out = []
  for (let i = 0; i < n; i++) out.push({ id: i, x: rng() * 100, y: rng() * 100 })
  return out
}

// ─── Distance ────────────────────────────────────────────────
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

// ─── Closest pair D&C ────────────────────────────────────────
// Returns { pair, dist, frames } where `frames` records every
// recursive call, brute-force base case, and combine step so the
// visualiser can play them back.
function closestPairFrames(points) {
  const byX = points.slice().sort((a, b) => a.x - b.x || a.y - b.y)
  const frames = []
  const treeNodes = []  // { id, parent, depth, lo, hi, best, kind }
  let nextId = 0

  function rec(lo, hi, depth, parent) {
    const id = nextId++
    treeNodes.push({ id, parent, depth, lo, hi, kind: 'divide', best: null })
    const n = hi - lo
    frames.push({ kind: 'divide', id, lo, hi, depth, msg: `divide [${lo}, ${hi})` })

    // Brute base
    if (n <= 3) {
      let best = { d: Infinity, a: null, b: null }
      for (let i = lo; i < hi; i++) {
        for (let j = i + 1; j < hi; j++) {
          const d = dist(byX[i], byX[j])
          if (d < best.d) best = { d, a: byX[i], b: byX[j] }
          frames.push({ kind: 'brute', id, i, j, best, msg: `brute-force check` })
        }
      }
      treeNodes[id].kind = 'leaf'
      treeNodes[id].best = best
      frames.push({ kind: 'leaf-done', id, best, msg: `leaf best = ${best.d.toFixed(2)}` })
      return best
    }

    const mid = (lo + hi) >> 1
    const midX = byX[mid].x
    const left = rec(lo, mid, depth + 1, id)
    const right = rec(mid, hi, depth + 1, id)
    let best = left.d < right.d ? left : right
    frames.push({ kind: 'compare', id, best, msg: `left ${left.d.toFixed(2)} vs right ${right.d.toFixed(2)}` })

    // Combine — build strip
    const strip = []
    for (let i = lo; i < hi; i++) {
      if (Math.abs(byX[i].x - midX) < best.d) strip.push(byX[i])
    }
    strip.sort((a, b) => a.y - b.y)
    frames.push({ kind: 'strip', id, midX, delta: best.d, strip: strip.slice(), msg: `strip has ${strip.length} pts` })
    for (let i = 0; i < strip.length; i++) {
      for (let j = i + 1; j < strip.length && strip[j].y - strip[i].y < best.d; j++) {
        const d = dist(strip[i], strip[j])
        frames.push({ kind: 'strip-check', id, a: strip[i], b: strip[j], d, msg: `strip pair d=${d.toFixed(2)}` })
        if (d < best.d) best = { d, a: strip[i], b: strip[j] }
      }
    }
    treeNodes[id].best = best
    frames.push({ kind: 'combine-done', id, best, msg: `combined best = ${best.d.toFixed(2)}` })
    return best
  }

  const result = rec(0, byX.length, 0, -1)
  return { result, frames, treeNodes, byX }
}

// ─── Layout the recursion tree (nodes → x/y coords) ────────────
function layoutTree(treeNodes) {
  if (!treeNodes.length) return { positions: [], width: 0, height: 0 }
  // Assign x per leaf, then interior = midpoint of children.
  const children = new Map()
  for (const n of treeNodes) {
    if (!children.has(n.parent)) children.set(n.parent, [])
    children.get(n.parent).push(n.id)
  }
  const positions = new Array(treeNodes.length)
  let leafX = 0
  const LEAF_W = 60
  const LEVEL_H = 60
  function place(id) {
    const kids = children.get(id) || []
    if (!kids.length) {
      positions[id] = { x: leafX * LEAF_W + 30, y: treeNodes[id].depth * LEVEL_H + 30 }
      leafX++
      return positions[id].x
    }
    const xs = kids.map(place)
    const mid = (Math.min(...xs) + Math.max(...xs)) / 2
    positions[id] = { x: mid, y: treeNodes[id].depth * LEVEL_H + 30 }
    return mid
  }
  place(0)
  const width = leafX * LEAF_W + 60
  const maxDepth = Math.max(...treeNodes.map(n => n.depth))
  const height = (maxDepth + 1) * LEVEL_H + 60
  return { positions, width, height, children }
}

// ─── Pseudocode (lines highlighted by frame kind) ─────────────
const PSEUDO = [
  'closestPair(P):',
  '  sort P by x',
  '  return solve(0, |P|)',
  '',
  'solve(lo, hi):',
  '  if hi - lo <= 3: return bruteForce(lo, hi)',
  '  mid = (lo + hi) / 2',
  '  left  = solve(lo, mid)',
  '  right = solve(mid, hi)',
  '  best  = min(left, right)',
  '  strip = { p in P[lo..hi) : |p.x - midX| < best }',
  '  sort strip by y',
  '  for i in 0..|strip|:',
  '    for j = i+1 while strip[j].y - strip[i].y < best:',
  '      best = min(best, dist(strip[i], strip[j]))',
  '  return best',
]
function lineForKind(kind) {
  switch (kind) {
    case 'divide': return 4
    case 'brute': case 'leaf-done': return 5
    case 'compare': return 9
    case 'strip': return 10
    case 'strip-check': return 14
    case 'combine-done': return 15
    default: return -1
  }
}

// ─── Point cloud viz ─────────────────────────────────────────
function PointCloud({ points, frame }) {
  const W = 320, H = 320
  const pad = 12
  const scale = ([lo, hi]) => (v) => pad + ((v - lo) / (hi - lo)) * (W - 2 * pad)
  const sx = scale([0, 100])
  const sy = scale([0, 100])
  const activeIds = new Set()
  if (frame) {
    if (frame.a) activeIds.add(frame.a.id)
    if (frame.b) activeIds.add(frame.b.id)
    if (frame.best?.a) activeIds.add(frame.best.a.id)
    if (frame.best?.b) activeIds.add(frame.best.b.id)
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className='w-full h-auto max-h-[420px]'>
      <rect x={0} y={0} width={W} height={H} fill='#0b0b0f' rx={8} />
      {/* strip band */}
      {frame?.kind === 'strip' && (
        <rect
          x={sx(frame.midX - frame.delta)}
          y={0}
          width={sx(frame.midX + frame.delta) - sx(frame.midX - frame.delta)}
          height={H}
          fill='#fbbf2411'
          stroke='#fbbf24'
          strokeDasharray='3 3'
        />
      )}
      {/* current best */}
      {frame?.best?.a && frame.best.b && (
        <line
          x1={sx(frame.best.a.x)} y1={sy(frame.best.a.y)}
          x2={sx(frame.best.b.x)} y2={sy(frame.best.b.y)}
          stroke='#34d399' strokeWidth={2}
        />
      )}
      {/* current check */}
      {frame?.a && frame?.b && (
        <line
          x1={sx(frame.a.x)} y1={sy(frame.a.y)}
          x2={sx(frame.b.x)} y2={sy(frame.b.y)}
          stroke='#fb7185' strokeWidth={1.5} strokeDasharray='4 3'
        />
      )}
      {points.map(p => (
        <circle
          key={p.id}
          cx={sx(p.x)} cy={sy(p.y)}
          r={activeIds.has(p.id) ? 5 : 3}
          fill={activeIds.has(p.id) ? '#fbbf24' : '#94a3b8'}
        />
      ))}
    </svg>
  )
}

// ─── Recursion tree viz ─────────────────────────────────────
function RecursionTree({ treeNodes, layout, frame }) {
  if (!treeNodes.length) return null
  const { positions, width, height, children } = layout
  const activeId = frame?.id
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className='w-full h-auto max-h-[420px]'>
      {/* edges */}
      {treeNodes.map(n => {
        if (n.parent === -1) return null
        const a = positions[n.parent], b = positions[n.id]
        return <line key={`e-${n.id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke='#334155' strokeWidth={1.5} />
      })}
      {treeNodes.map(n => {
        const p = positions[n.id]
        const isActive = n.id === activeId
        const isLeaf = n.kind === 'leaf'
        return (
          <g key={n.id}>
            <circle
              cx={p.x} cy={p.y} r={14}
              fill={isActive ? '#fbbf24' : isLeaf ? '#0f766e' : '#1f2937'}
              stroke={isActive ? '#fef3c7' : isLeaf ? '#34d399' : '#64748b'}
              strokeWidth={2}
            />
            <text x={p.x} y={p.y + 3} textAnchor='middle' fontSize={9} fontFamily='ui-monospace, monospace' fill={isActive ? '#000' : '#e5e7eb'}>
              {n.hi - n.lo}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default function DivideConquer() {
  const [n, setN] = useState(20)
  const [seed, setSeed] = useState(7)
  const points = useMemo(() => genPoints(n, seed), [n, seed])
  const { result, frames, treeNodes } = useMemo(() => closestPairFrames(points), [points])
  const layout = useMemo(() => layoutTree(treeNodes), [treeNodes])
  const [frameIdx, setFrameIdx] = useState(0)
  const { i, playing, play, pause, step, reset, speed, setSpeed } = useStepEngine({
    frameCount: frames.length,
    onFrame: setFrameIdx,
  })
  // Reset when inputs change
  useEffect(() => { reset() /* eslint-disable-next-line */ }, [n, seed])

  const frame = frames[frameIdx] || null
  const activeLine = lineForKind(frame?.kind)

  return (
    <TopicShell slug='divide-conquer' title='Divide & Conquer' category='Algorithms'>
      <ExplanationBlock>
        <p>
          <b>Divide & Conquer</b> attacks a big problem by chopping it into
          smaller versions of itself, solving each recursively, then merging
          the sub-solutions. Three ingredients: a <b>base case</b>, a
          <b> recursive step</b>, and a <b>combine</b> that stitches
          sub-answers together in less time than solving the whole thing
          from scratch.
        </p>
        <p>
          Because each level of recursion halves the input, the depth is
          <TeX tex='\\log_2 n' /> and — if the combine is linear — the total
          cost is <TeX tex='T(n)=2T(n/2)+O(n)=O(n\\log n)' /> by the Master
          Theorem.
        </p>
        <p>
          The concrete example below is <b>closest pair of points</b> — a
          brute check is <TeX tex='O(n^2)' />, but Shamos & Hoey's D&C
          strategy is <TeX tex='O(n\\log n)' />. Sort by x, split at the
          median, recurse on each half, then combine by only checking a
          narrow vertical strip against the current best.
        </p>
      </ExplanationBlock>

      <VisualiserSection>
        <VizPanel>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <div>
              <div className='text-xs text-white/50 mb-2'>Recursion tree (label = subarray size)</div>
              <RecursionTree treeNodes={treeNodes} layout={layout} frame={frame} />
            </div>
            <div>
              <div className='text-xs text-white/50 mb-2'>Point cloud (green = current best pair)</div>
              <PointCloud points={points} frame={frame} />
            </div>
          </div>
          <div className='mt-3 text-xs text-white/60 font-mono'>
            step {i + 1}/{frames.length} · {frame?.msg || '—'} · closest so far
            {' '}<span className='text-emerald-300'>
              {frame?.best ? frame.best.d.toFixed(3) : '—'}
            </span>
          </div>
        </VizPanel>
        <ControlsPanel>
          <Field label='Point count' helper='More points = deeper recursion tree.'>
            <InputNumber min={4} max={80} value={n} onChange={v => setN(v || 4)} className='w-full' />
          </Field>
          <Field label='Seed' helper='Same seed = same random cloud.'>
            <InputNumber min={0} max={9999} value={seed} onChange={v => setSeed(v || 0)} className='w-full' />
          </Field>
          <StepControls
            playing={playing} onPlay={play} onPause={pause} onStep={step} onReset={reset}
            speed={speed} onSpeed={setSpeed}
          />
          <div className='flex flex-wrap gap-1.5 pt-2 border-t border-white/10'>
            <Chip tone='amber'>divide</Chip>
            <Chip tone='emerald'>base case</Chip>
            <Chip tone='fuchsia'>combine</Chip>
            <Chip tone='rose'>strip check</Chip>
          </div>
          <div className='pt-2 text-xs text-white/70 font-mono'>
            answer d = <span className='text-emerald-300'>{result.d.toFixed(3)}</span>
          </div>
        </ControlsPanel>
      </VisualiserSection>

      <PseudocodeBlock lines={PSEUDO} activeLine={activeLine} />

      <ComplexityTable rows={[
        { op: 'Closest pair (D&C)',   best: 'O(n \\log n)', avg: 'O(n \\log n)', worst: 'O(n \\log n)', space: 'O(n)' },
        { op: 'Closest pair (brute)', best: 'O(n^2)',       avg: 'O(n^2)',       worst: 'O(n^2)',       space: 'O(1)' },
        { op: 'Merge sort',           best: 'O(n \\log n)', avg: 'O(n \\log n)', worst: 'O(n \\log n)', space: 'O(n)' },
        { op: 'Karatsuba multiply',   best: 'O(n^{1.58})',  avg: 'O(n^{1.58})',  worst: 'O(n^{1.58})',  space: 'O(n)' },
      ]} />

      <RealWorldCard>
        <p>
          D&C is the shape of most fast algorithms you already use:
          MergeSort, QuickSort, FFT, Strassen's matrix multiply, Karatsuba
          integer multiplication, spatial trees like kd-tree, and every
          divide step in geometry (convex hull, closest pair, Voronoi).
        </p>
        <p>
          At scale, D&C also parallelises beautifully — each recursive
          call is independent, so map-reduce / Rust's Rayon / OpenMP just
          fan the calls out to threads.
        </p>
      </RealWorldCard>
    </TopicShell>
  )
}
