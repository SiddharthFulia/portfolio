// Convex Hull — Andrew's Monotone Chain (O(n log n)).
//
// Sort points by (x, y). Build the upper hull left→right, then the
// lower hull right→left, using the cross-product test to pop last
// two points whenever we'd make a non-left turn.
//
// Users can click on the canvas to add points, then Run to compute.

import { useEffect, useMemo, useRef, useState } from 'react'
import { InputNumber } from 'antd'
import { ExplanationBlock, VisualiserSection, VizPanel,
  ControlsPanel, StepControls, useStepEngine, MultiLangCode,
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

// Andrew's Monotone Chain in six languages.
const CODE = {
  pseudo: `sort points by (x, y)
lower = []
for p in points:
  while |lower| >= 2 and cross(lower[-2], lower[-1], p) <= 0:
    lower.pop()
  lower.push(p)
upper = []
for p in reversed(points):
  while |upper| >= 2 and cross(upper[-2], upper[-1], p) <= 0:
    upper.pop()
  upper.push(p)
hull = lower[:-1] + upper[:-1]`,

  c: `#include <stdio.h>
#include <stdlib.h>

typedef struct { double x, y; } Pt;

static double cross(Pt O, Pt A, Pt B) {
    return (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x);
}
static int cmp(const void* a, const void* b) {
    Pt *p = (Pt*)a, *q = (Pt*)b;
    if (p->x != q->x) return p->x < q->x ? -1 : 1;
    return p->y < q->y ? -1 : p->y > q->y ? 1 : 0;
}

/* Writes hull to 'out', returns its vertex count. */
int convex_hull(Pt* pts, int n, Pt* out) {
    qsort(pts, n, sizeof(Pt), cmp);
    int k = 0;
    for (int i = 0; i < n; i++) {
        while (k >= 2 && cross(out[k - 2], out[k - 1], pts[i]) <= 0) k--;
        out[k++] = pts[i];
    }
    int lower = k + 1;
    for (int i = n - 2; i >= 0; i--) {
        while (k >= lower && cross(out[k - 2], out[k - 1], pts[i]) <= 0) k--;
        out[k++] = pts[i];
    }
    return k - 1;
}

int main(void) {
    Pt pts[] = {{0,0},{4,0},{4,4},{0,4},{2,2},{1,1},{3,1}};
    Pt out[16];
    int n = convex_hull(pts, 7, out);
    printf("Hull (%d vertices):", n);
    for (int i = 0; i < n; i++) printf(" (%.0f,%.0f)", out[i].x, out[i].y);
    printf("\\n");
    return 0;
}`,

  cpp: `#include <iostream>
#include <vector>
#include <algorithm>

struct Pt { double x, y; };
static double cross(Pt O, Pt A, Pt B) {
    return (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x);
}

std::vector<Pt> convex_hull(std::vector<Pt> pts) {
    std::sort(pts.begin(), pts.end(),
              [](Pt a, Pt b) { return a.x != b.x ? a.x < b.x : a.y < b.y; });
    int n = (int)pts.size(), k = 0;
    std::vector<Pt> h(2 * n);
    // Lower hull, left-to-right.
    for (int i = 0; i < n; ++i) {
        while (k >= 2 && cross(h[k - 2], h[k - 1], pts[i]) <= 0) --k;
        h[k++] = pts[i];
    }
    // Upper hull, right-to-left.
    for (int i = n - 2, t = k + 1; i >= 0; --i) {
        while (k >= t && cross(h[k - 2], h[k - 1], pts[i]) <= 0) --k;
        h[k++] = pts[i];
    }
    h.resize(k - 1);
    return h;
}

int main() {
    std::vector<Pt> pts = {{0,0},{4,0},{4,4},{0,4},{2,2},{1,1},{3,1}};
    auto hull = convex_hull(pts);
    std::cout << "Hull (" << hull.size() << " vertices):";
    for (auto& p : hull) std::cout << " (" << p.x << "," << p.y << ")";
    std::cout << "\\n";
    return 0;
}`,

  python: `def convex_hull(points):
    pts = sorted(set(map(tuple, points)))
    if len(pts) <= 1:
        return pts
    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    # Lower hull.
    lower = []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    # Upper hull.
    upper = []
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]

if __name__ == "__main__":
    pts = [(0,0),(4,0),(4,4),(0,4),(2,2),(1,1),(3,1)]
    hull = convex_hull(pts)
    print(f"Hull ({len(hull)} vertices):", hull)`,

  java: `import java.util.*;

public class Main {
    static double cross(double[] o, double[] a, double[] b) {
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    }
    public static double[][] convexHull(double[][] pts) {
        Arrays.sort(pts, (a, b) -> a[0] != b[0]
            ? Double.compare(a[0], b[0]) : Double.compare(a[1], b[1]));
        int n = pts.length, k = 0;
        double[][] h = new double[2 * n][];
        for (int i = 0; i < n; i++) {
            while (k >= 2 && cross(h[k - 2], h[k - 1], pts[i]) <= 0) k--;
            h[k++] = pts[i];
        }
        for (int i = n - 2, t = k + 1; i >= 0; i--) {
            while (k >= t && cross(h[k - 2], h[k - 1], pts[i]) <= 0) k--;
            h[k++] = pts[i];
        }
        return Arrays.copyOf(h, k - 1);
    }
    public static void main(String[] args) {
        double[][] pts = {{0,0},{4,0},{4,4},{0,4},{2,2},{1,1},{3,1}};
        double[][] hull = convexHull(pts);
        StringBuilder sb = new StringBuilder("Hull (" + hull.length + " vertices):");
        for (double[] p : hull) sb.append(" (").append((int) p[0]).append(",").append((int) p[1]).append(")");
        System.out.println(sb);
    }
}`,

  rust: `fn convex_hull(mut pts: Vec<(f64, f64)>) -> Vec<(f64, f64)> {
    pts.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap()
        .then(a.1.partial_cmp(&b.1).unwrap()));
    let cross = |o: (f64, f64), a: (f64, f64), b: (f64, f64)| -> f64 {
        (a.0 - o.0) * (b.1 - o.1) - (a.1 - o.1) * (b.0 - o.0)
    };
    let n = pts.len();
    let mut h: Vec<(f64, f64)> = Vec::with_capacity(2 * n);
    // Lower hull.
    for &p in &pts {
        while h.len() >= 2 && cross(h[h.len() - 2], h[h.len() - 1], p) <= 0.0 { h.pop(); }
        h.push(p);
    }
    // Upper hull.
    let t = h.len() + 1;
    for &p in pts.iter().rev().skip(1) {
        while h.len() >= t && cross(h[h.len() - 2], h[h.len() - 1], p) <= 0.0 { h.pop(); }
        h.push(p);
    }
    h.pop();
    h
}

fn main() {
    let pts = vec![(0.0, 0.0), (4.0, 0.0), (4.0, 4.0), (0.0, 4.0), (2.0, 2.0), (1.0, 1.0), (3.0, 1.0)];
    let hull = convex_hull(pts);
    println!("Hull ({} vertices): {:?}", hull.len(), hull);
}`,
}

const CH_SAMPLES = [
  { name: 'Square + interior', description: '4 corners + 3 interior points → 4 hull vertices', stdin: '', expected: '' },
  { name: 'Triangle',          description: '3 points — hull = all of them',                  stdin: '', expected: '' },
  { name: 'Colinear',          description: 'All on a line — hull = 2 endpoints',             stdin: '', expected: '' },
]

const ACTIVE_MAP = {
  pseudo: { 'lower-pop': 4, 'lower-push': 6, 'upper-pop': 9, 'upper-push': 11, done: 12 },
  c:      { 'lower-pop': 18, 'lower-push': 19, 'upper-pop': 23, 'upper-push': 24, done: 26 },
  cpp:    { 'lower-pop': 13, 'lower-push': 14, 'upper-pop': 18, 'upper-push': 19, done: 22 },
  python: { 'lower-pop': 9, 'lower-push': 10, 'upper-pop': 14, 'upper-push': 15, done: 16 },
  java:   { 'lower-pop': 7, 'lower-push': 8, 'upper-pop': 11, 'upper-push': 12, done: 14 },
  rust:   { 'lower-pop': 11, 'lower-push': 12, 'upper-pop': 16, 'upper-push': 17, done: 19 },
}
function activeLinesFor(phase) {
  const out = {}
  for (const lang of Object.keys(ACTIVE_MAP)) {
    const v = ACTIVE_MAP[lang][phase]
    if (typeof v === 'number') out[lang] = v
  }
  return out
}

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
    <><ExplanationBlock>
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

      <MultiLangCode title='Convex hull — Andrew monotone chain' code={CODE} samples={CH_SAMPLES} activeLines={activeLinesFor(f?.phase)} />

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
      </RealWorldCard></>
  )
}
