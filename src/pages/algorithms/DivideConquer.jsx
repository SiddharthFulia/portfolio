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
import { ExplanationBlock, VisualiserSection, VizPanel,
  ControlsPanel, StepControls, useStepEngine, MultiLangCode,
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

// ─── Code (6 languages) with per-frame active line indices ────────
const CODE = {
  pseudo: `closestPair(P):
  sort P by x
  return solve(0, |P|)

solve(lo, hi):
  if hi - lo <= 3: return bruteForce(lo, hi)
  mid = (lo + hi) / 2
  left  = solve(lo, mid)
  right = solve(mid, hi)
  best  = min(left, right)
  strip = { p in P[lo..hi) : |p.x - midX| < best }
  sort strip by y
  for i in 0..|strip|:
    for j = i+1 while strip[j].y - strip[i].y < best:
      best = min(best, dist(strip[i], strip[j]))
  return best`,

  c: `#include <math.h>
#include <stdlib.h>

typedef struct { double x, y; } Point;

static double dist(Point a, Point b) {
    double dx = a.x - b.x, dy = a.y - b.y;
    return sqrt(dx*dx + dy*dy);
}
static int cmp_x(const void* a, const void* b) {
    double d = ((Point*)a)->x - ((Point*)b)->x;
    return (d > 0) - (d < 0);
}
static int cmp_y(const void* a, const void* b) {
    double d = ((Point*)a)->y - ((Point*)b)->y;
    return (d > 0) - (d < 0);
}

/* pts must be pre-sorted by x. Solves in O(n log n). */
double solve(Point* pts, int lo, int hi) {
    int n = hi - lo;
    if (n <= 3) {
        double best = 1e18;
        for (int i = lo; i < hi; i++)
            for (int j = i + 1; j < hi; j++) {
                double d = dist(pts[i], pts[j]);
                if (d < best) best = d;
            }
        return best;
    }
    int mid = (lo + hi) / 2;
    double midX = pts[mid].x;
    double dL = solve(pts, lo, mid);
    double dR = solve(pts, mid, hi);
    double best = dL < dR ? dL : dR;

    Point strip[256]; int sn = 0;
    for (int i = lo; i < hi; i++)
        if (fabs(pts[i].x - midX) < best) strip[sn++] = pts[i];
    qsort(strip, sn, sizeof(Point), cmp_y);
    for (int i = 0; i < sn; i++)
        for (int j = i + 1; j < sn && strip[j].y - strip[i].y < best; j++) {
            double d = dist(strip[i], strip[j]);
            if (d < best) best = d;
        }
    return best;
}`,

  cpp: `#include <vector>
#include <algorithm>
#include <cmath>

struct Point { double x, y; };
static double dist(const Point& a, const Point& b) {
    return std::hypot(a.x - b.x, a.y - b.y);
}

double solve(std::vector<Point>& pts, int lo, int hi) {
    int n = hi - lo;
    if (n <= 3) {
        double best = 1e18;
        for (int i = lo; i < hi; ++i)
            for (int j = i + 1; j < hi; ++j)
                best = std::min(best, dist(pts[i], pts[j]));
        return best;
    }
    int mid = (lo + hi) / 2;
    double midX = pts[mid].x;
    double best = std::min(solve(pts, lo, mid), solve(pts, mid, hi));

    // Combine: only points within 'best' of the split-line matter.
    std::vector<Point> strip;
    for (int i = lo; i < hi; ++i)
        if (std::fabs(pts[i].x - midX) < best) strip.push_back(pts[i]);
    std::sort(strip.begin(), strip.end(),
              [](const Point& a, const Point& b) { return a.y < b.y; });
    for (int i = 0; i < (int)strip.size(); ++i)
        for (int j = i + 1; j < (int)strip.size() && strip[j].y - strip[i].y < best; ++j)
            best = std::min(best, dist(strip[i], strip[j]));
    return best;
}

double closest_pair(std::vector<Point> pts) {
    std::sort(pts.begin(), pts.end(),
              [](const Point& a, const Point& b) { return a.x < b.x; });
    return solve(pts, 0, (int)pts.size());
}`,

  python: `from math import hypot, inf

def closest_pair(points):
    pts = sorted(points, key=lambda p: p[0])
    def solve(lo, hi):
        n = hi - lo
        if n <= 3:
            best = inf
            for i in range(lo, hi):
                for j in range(i + 1, hi):
                    best = min(best, hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]))
            return best
        mid = (lo + hi) // 2
        midX = pts[mid][0]
        best = min(solve(lo, mid), solve(mid, hi))
        # Only points within 'best' of the median-x can possibly beat it.
        strip = sorted((p for p in pts[lo:hi] if abs(p[0] - midX) < best),
                       key=lambda p: p[1])
        for i in range(len(strip)):
            j = i + 1
            # Shamos' bound: at most 7 points to check.
            while j < len(strip) and strip[j][1] - strip[i][1] < best:
                best = min(best, hypot(strip[i][0] - strip[j][0], strip[i][1] - strip[j][1]))
                j += 1
        return best
    return solve(0, len(pts))`,

  java: `import java.util.*;

public class ClosestPair {
    public static double solve(double[][] pts, int lo, int hi) {
        int n = hi - lo;
        if (n <= 3) {
            double best = Double.POSITIVE_INFINITY;
            for (int i = lo; i < hi; i++)
                for (int j = i + 1; j < hi; j++)
                    best = Math.min(best, Math.hypot(pts[i][0] - pts[j][0],
                                                     pts[i][1] - pts[j][1]));
            return best;
        }
        int mid = (lo + hi) / 2;
        double midX = pts[mid][0];
        double best = Math.min(solve(pts, lo, mid), solve(pts, mid, hi));

        double[][] strip = new double[hi - lo][];
        int sn = 0;
        for (int i = lo; i < hi; i++)
            if (Math.abs(pts[i][0] - midX) < best) strip[sn++] = pts[i];
        Arrays.sort(strip, 0, sn, (a, b) -> Double.compare(a[1], b[1]));
        for (int i = 0; i < sn; i++)
            for (int j = i + 1; j < sn && strip[j][1] - strip[i][1] < best; j++)
                best = Math.min(best, Math.hypot(strip[i][0] - strip[j][0],
                                                  strip[i][1] - strip[j][1]));
        return best;
    }

    public static double closestPair(double[][] pts) {
        Arrays.sort(pts, (a, b) -> Double.compare(a[0], b[0]));
        return solve(pts, 0, pts.length);
    }
}`,

  rust: `pub fn closest_pair(mut pts: Vec<(f64, f64)>) -> f64 {
    pts.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
    fn dist(a: (f64, f64), b: (f64, f64)) -> f64 {
        ((a.0 - b.0).powi(2) + (a.1 - b.1).powi(2)).sqrt()
    }
    fn solve(pts: &[(f64, f64)]) -> f64 {
        let n = pts.len();
        if n <= 3 {
            let mut best = f64::INFINITY;
            for i in 0..n {
                for j in i + 1..n { best = best.min(dist(pts[i], pts[j])); }
            }
            return best;
        }
        let mid = n / 2;
        let mid_x = pts[mid].0;
        let best = solve(&pts[..mid]).min(solve(&pts[mid..]));
        // Combine: sort a narrow y-strip and check bounded pairs.
        let mut strip: Vec<(f64, f64)> = pts.iter()
            .copied().filter(|p| (p.0 - mid_x).abs() < best).collect();
        strip.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap());
        let mut cur = best;
        for i in 0..strip.len() {
            let mut j = i + 1;
            while j < strip.len() && strip[j].1 - strip[i].1 < cur {
                cur = cur.min(dist(strip[i], strip[j]));
                j += 1;
            }
        }
        cur
    }
    solve(&pts)
}`,
}

// Map frame kind to active line index for each language body.
const ACTIVE_MAP = {
  pseudo:   { divide: 4, brute: 5, 'leaf-done': 5, compare: 9, strip: 10, 'strip-check': 14, 'combine-done': 15 },
  c:        { divide: 22, brute: 24, 'leaf-done': 29, compare: 32, strip: 39, 'strip-check': 44, 'combine-done': 47 },
  cpp:      { divide: 9, brute: 12, 'leaf-done': 15, compare: 19, strip: 22, 'strip-check': 27, 'combine-done': 29 },
  python:   { divide: 5, brute: 8, 'leaf-done': 11, compare: 14, strip: 17, 'strip-check': 22, 'combine-done': 24 },
  java:     { divide: 4, brute: 8, 'leaf-done': 11, compare: 15, strip: 19, 'strip-check': 24, 'combine-done': 27 },
  rust:     { divide: 8, brute: 11, 'leaf-done': 13, compare: 17, strip: 20, 'strip-check': 26, 'combine-done': 29 },
}
function activeLinesForKind(kind) {
  const out = {}
  for (const lang of Object.keys(ACTIVE_MAP)) {
    const v = ACTIVE_MAP[lang][kind]
    if (typeof v === 'number') out[lang] = v
  }
  return out
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
  const activeLines = activeLinesForKind(frame?.kind)

  return (
    <><ExplanationBlock>
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

      <MultiLangCode title='Closest pair — divide & conquer' code={CODE} activeLines={activeLines} />

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
      </RealWorldCard></>
  )
}
