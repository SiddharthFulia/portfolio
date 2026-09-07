// Fractional Knapsack — greedy by value/weight ratio.
//
// Sort items by value/weight descending; fill until you can't take a
// whole item, then take a fraction of the next. This is where fractional
// knapsack differs from 0/1: the fractional cut lets greedy be OPTIMAL.
// In 0/1 knapsack you can't cut, and greedy stops working — see the
// dp-knapsack page.
//
// UI: bar chart of item ratios (tallest = best ratio) with a running
// "capacity used" bar.

import { useEffect, useMemo, useState } from 'react'
import { InputNumber } from 'antd'
import { ExplanationBlock, VisualiserSection, VizPanel,
  ControlsPanel, StepControls, useStepEngine, MultiLangCode,
  ComplexityTable, RealWorldCard, Field, Chip, TeX,
} from '../../components/algorithms'

function mulberry32(seed) {
  let a = (seed | 0) || 1
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function genItems(n, seed) {
  const rng = mulberry32(seed)
  const items = []
  for (let i = 0; i < n; i++) {
    const weight = Math.floor(rng() * 8) + 1
    const value = Math.floor(rng() * 40) + 5
    items.push({ id: i, weight, value })
  }
  return items
}

// ─── Frames ───────────────────────────────────
function buildFrames(items, capacity) {
  const sorted = items.slice().sort((a, b) => (b.value / b.weight) - (a.value / a.weight))
  const frames = [{ kind: 'sort', sorted: sorted.slice(), taken: {}, used: 0, gain: 0, line: 0 }]
  const taken = {}
  let used = 0, gain = 0
  for (let i = 0; i < sorted.length; i++) {
    const it = sorted[i]
    if (used + it.weight <= capacity) {
      taken[it.id] = 1
      used += it.weight
      gain += it.value
      frames.push({ kind: 'whole', cur: i, taken: { ...taken }, used, gain, sorted, line: 4 })
    } else {
      const remaining = capacity - used
      if (remaining > 0) {
        const frac = remaining / it.weight
        taken[it.id] = frac
        gain += it.value * frac
        used = capacity
        frames.push({ kind: 'frac', cur: i, taken: { ...taken }, used, gain, sorted, frac, line: 6 })
      }
      break
    }
  }
  frames.push({ kind: 'done', taken, used, gain, sorted, line: 7 })
  return frames
}

const CODE = {
  pseudo: `sort items by value/weight desc
used = 0
gain = 0.0
for it in items:
  if used + it.weight <= C:
    take whole
    used += it.weight
    gain += it.value
  else:
    frac = (C - used) / it.weight
    gain += it.value * frac
    break
return gain`,

  c: `#include <stdlib.h>

typedef struct { double weight, value; } Item;

static int cmp_ratio_desc(const void* a, const void* b) {
    double ra = ((Item*)a)->value / ((Item*)a)->weight;
    double rb = ((Item*)b)->value / ((Item*)b)->weight;
    return (rb > ra) - (rb < ra);
}

double fractional_knapsack(Item* items, int n, double C) {
    qsort(items, n, sizeof(Item), cmp_ratio_desc);
    double used = 0, gain = 0;
    for (int i = 0; i < n; i++) {
        if (used + items[i].weight <= C) {
            used += items[i].weight;
            gain += items[i].value;
        } else {
            /* Top up with a slice of the current item. */
            gain += items[i].value * (C - used) / items[i].weight;
            break;
        }
    }
    return gain;
}`,

  cpp: `#include <vector>
#include <algorithm>

struct Item { double weight, value; };

double fractional_knapsack(std::vector<Item> items, double C) {
    std::sort(items.begin(), items.end(),
              [](const Item& a, const Item& b) {
                  return a.value / a.weight > b.value / b.weight;
              });
    double used = 0, gain = 0;
    for (const auto& it : items) {
        if (used + it.weight <= C) {
            used += it.weight;
            gain += it.value;
        } else {
            gain += it.value * (C - used) / it.weight;   // partial slice
            break;
        }
    }
    return gain;
}`,

  python: `def fractional_knapsack(items, C):
    """items = list of (weight, value). Returns max gain (float)."""
    # Best ratio first — linear gain per unit weight.
    items = sorted(items, key=lambda x: x[1] / x[0], reverse=True)
    used, gain = 0.0, 0.0
    for w, v in items:
        if used + w <= C:
            used += w
            gain += v
        else:
            gain += v * (C - used) / w
            break
    return gain`,

  java: `import java.util.*;

public static double fractionalKnapsack(double[][] items, double C) {
    // items[i] = { weight, value }. Sort by value/weight descending.
    Arrays.sort(items, (a, b) -> Double.compare(b[1] / b[0], a[1] / a[0]));
    double used = 0, gain = 0;
    for (double[] it : items) {
        if (used + it[0] <= C) {
            used += it[0];
            gain += it[1];
        } else {
            gain += it[1] * (C - used) / it[0];   // fractional top-up
            break;
        }
    }
    return gain;
}`,

  rust: `pub fn fractional_knapsack(mut items: Vec<(f64, f64)>, capacity: f64) -> f64 {
    // items = (weight, value). Best value/weight ratio first.
    items.sort_by(|a, b| (b.1 / b.0).partial_cmp(&(a.1 / a.0)).unwrap());
    let (mut used, mut gain) = (0.0, 0.0);
    for (w, v) in items {
        if used + w <= capacity {
            used += w;
            gain += v;
        } else {
            gain += v * (capacity - used) / w;   // last fractional slice
            break;
        }
    }
    gain
}`,
}

const ACTIVE_MAP = {
  pseudo: { sort: 0, whole: 6, frac: 10, done: 12 },
  c:      { sort: 10, whole: 14, frac: 19, done: 22 },
  cpp:    { sort: 6, whole: 13, frac: 17, done: 20 },
  python: { sort: 3, whole: 8, frac: 10, done: 12 },
  java:   { sort: 4, whole: 8, frac: 12, done: 15 },
  rust:   { sort: 2, whole: 7, frac: 10, done: 13 },
}
function activeLinesFor(kind) {
  const out = {}
  for (const lang of Object.keys(ACTIVE_MAP)) {
    const v = ACTIVE_MAP[lang][kind]
    if (typeof v === 'number') out[lang] = v
  }
  return out
}

// ─── Chart ───────────────────────────────────
function RatioChart({ items, frame, capacity }) {
  if (!items.length) return null
  const W = 380
  const H = 220
  const pad = 20
  const barW = (W - pad * 2) / items.length
  const maxRatio = Math.max(...items.map(it => it.value / it.weight))
  return (
    <svg viewBox={`0 0 ${W} ${H + 60}`} className='w-full h-auto max-h-[420px]'>
      {items.map((it, i) => {
        const ratio = it.value / it.weight
        const barH = (ratio / maxRatio) * (H - 20)
        const takeFrac = frame?.taken?.[it.id] ?? 0
        const isCur = frame?.cur === i
        const takenH = barH * takeFrac
        const fill = isCur ? '#fbbf24' : takeFrac > 0 ? '#34d399' : '#475569'
        return (
          <g key={it.id}>
            <rect
              x={pad + i * barW + 2}
              y={H - barH}
              width={barW - 4}
              height={barH}
              fill='#334155'
              opacity={0.5}
            />
            <rect
              x={pad + i * barW + 2}
              y={H - takenH}
              width={barW - 4}
              height={takenH}
              fill={fill}
              stroke={isCur ? '#fef3c7' : 'none'}
              strokeWidth={isCur ? 1.5 : 0}
            />
            <text x={pad + i * barW + barW / 2} y={H + 12} fontSize={7} textAnchor='middle' fill='#94a3b8' fontFamily='ui-monospace, monospace'>
              v={it.value}
            </text>
            <text x={pad + i * barW + barW / 2} y={H + 22} fontSize={7} textAnchor='middle' fill='#94a3b8' fontFamily='ui-monospace, monospace'>
              w={it.weight}
            </text>
            <text x={pad + i * barW + barW / 2} y={H + 32} fontSize={8} textAnchor='middle' fill='#fbbf24' fontFamily='ui-monospace, monospace'>
              {ratio.toFixed(1)}
            </text>
          </g>
        )
      })}
      {/* Capacity bar */}
      <text x={pad} y={H + 50} fontSize={9} fill='#e5e7eb' fontFamily='ui-monospace, monospace'>
        capacity: {frame?.used?.toFixed(1) || 0} / {capacity}
      </text>
      <rect x={pad + 90} y={H + 42} width={200} height={8} fill='#1f2937' rx={2} />
      <rect x={pad + 90} y={H + 42} width={Math.min(200, (frame?.used || 0) / capacity * 200)} height={8} fill='#34d399' rx={2} />
    </svg>
  )
}

export default function GreedyKnapsack() {
  const [n, setN] = useState(8)
  const [seed, setSeed] = useState(4)
  const [capacity, setCapacity] = useState(20)
  const items = useMemo(() => genItems(n, seed), [n, seed])
  const frames = useMemo(() => buildFrames(items, capacity), [items, capacity])
  const [idx, setIdx] = useState(0)
  const { i, playing, play, pause, step, reset, speed, setSpeed } = useStepEngine({
    frameCount: frames.length,
    onFrame: setIdx,
  })
  useEffect(() => { reset() /* eslint-disable-next-line */ }, [n, seed, capacity])
  const f = frames[idx] || frames[0]
  const rendered = f?.sorted || items

  return (
    <><ExplanationBlock>
        <p>
          You have a knapsack of capacity <TeX tex='C' /> and a set of
          items each with weight and value. You may take fractions of
          items. Maximise total value.
        </p>
        <p>
          Sort items by <TeX tex='v_i / w_i' /> descending. Take as many
          whole high-ratio items as fit, then a fraction of the next one
          to top up. Optimal because value is <i>linear</i> in the fraction
          taken — no reason to prefer a lower ratio.
        </p>
        <p>
          The trick evaporates if fractions aren't allowed (0/1
          knapsack). Then a high-ratio item may be too heavy to fit,
          forcing us to leave the sack partly empty — and DP takes over.
        </p>
      </ExplanationBlock>

      <VisualiserSection>
        <VizPanel>
          <RatioChart items={rendered} frame={f} capacity={capacity} />
          <div className='mt-2 text-xs text-white/70 font-mono'>
            step {i + 1}/{frames.length} · gain
            <span className='text-emerald-300 ml-1'>{f?.gain?.toFixed(2) || '0'}</span>
          </div>
          {f?.kind === 'frac' && (
            <div className='text-xs text-amber-200 font-mono mt-1'>
              taking fraction {f.frac.toFixed(2)} of item · v/w = {(f.sorted[f.cur].value / f.sorted[f.cur].weight).toFixed(2)}
            </div>
          )}
        </VizPanel>
        <ControlsPanel>
          <Field label='Item count'>
            <InputNumber min={3} max={15} value={n} onChange={v => setN(v || 3)} className='w-full' />
          </Field>
          <Field label='Seed'>
            <InputNumber min={0} max={9999} value={seed} onChange={v => setSeed(v || 0)} className='w-full' />
          </Field>
          <Field label='Capacity' helper='Total weight the sack can hold.'>
            <InputNumber min={5} max={50} value={capacity} onChange={v => setCapacity(v || 5)} className='w-full' />
          </Field>
          <StepControls
            playing={playing} onPlay={play} onPause={pause} onStep={step} onReset={reset}
            speed={speed} onSpeed={setSpeed}
          />
          <div className='flex gap-1.5 flex-wrap'>
            <Chip tone='amber'>current</Chip>
            <Chip tone='emerald'>taken</Chip>
            <Chip tone='gray'>skipped</Chip>
          </div>
        </ControlsPanel>
      </VisualiserSection>

      <MultiLangCode title='Fractional knapsack' code={CODE} activeLines={activeLinesFor(f?.kind)} />

      <ComplexityTable rows={[
        { op: 'Fractional Knapsack (sort + scan)', best: 'O(n \\log n)', avg: 'O(n \\log n)', worst: 'O(n \\log n)', space: 'O(n)' },
        { op: 'Median-of-medians pivot',           best: 'O(n)',         avg: 'O(n)',         worst: 'O(n)',         space: 'O(n)' },
        { op: '0/1 Knapsack (DP)',                 best: 'O(nC)',        avg: 'O(nC)',        worst: 'O(nC)',        space: 'O(nC)' },
      ]} />

      <section className='luxe-glass rounded-2xl p-5 sm:p-6'>
        <h2 className='text-lg sm:text-xl font-bold text-amber-100 mb-3'>Why greedy is optimal here</h2>
        <p className='text-sm text-gray-300 leading-relaxed mb-2'>
          Exchange argument. Suppose in some optimal solution
          <TeX tex='O' /> we take fraction <TeX tex='f_i' /> of item
          <TeX tex='i' /> and fraction <TeX tex='f_j' /> of item
          <TeX tex='j' /> with ratio<TeX tex='v_i / w_i > v_j / w_j' />{' '}
          but <TeX tex='f_i < 1' />. We can move
          <TeX tex='\\epsilon' /> weight from <TeX tex='j' /> to
          <TeX tex='i' />; the gain per unit weight is strictly higher,
          so <TeX tex='O' /> improves — contradiction. So any optimal
          takes the higher ratios first.
        </p>
        <p className='text-sm text-gray-300 leading-relaxed'>
          Formally: sorting maximises the LP relaxation. The trick fails
          in 0/1 knapsack because we can't move weight continuously.
        </p>
      </section>

      <section className='luxe-glass rounded-2xl p-5 sm:p-6'>
        <h2 className='text-lg sm:text-xl font-bold text-amber-100 mb-3'>Faster: median-of-medians</h2>
        <p className='text-sm text-gray-300 leading-relaxed mb-2'>
          Sorting is <TeX tex='O(n \\log n)' />, but the answer only
          cares about a single "cut" in the ratio order — the pivot
          where we run out of capacity. A weighted median (
          <TeX tex='O(n)' /> via median-of-medians) finds that pivot
          without a full sort, giving <b>linear-time</b> fractional
          knapsack.
        </p>
        <p className='text-sm text-gray-300 leading-relaxed'>
          Practical impact: irrelevant for a handful of items, huge for
          a billion — think ad-server bidding, real-time cargo
          reallocation.
        </p>
      </section>

      <RealWorldCard>
        <p>
          Cargo planning, budget allocation, ad-slot fill (when
          impressions are divisible), and portfolio construction under a
          leverage cap. Any time the resource is continuous and the
          objective is linear, fractional-knapsack greedy is optimal.
        </p>
        <p>
          In competitive-programming, fractional knapsack is often the
          upper bound used to prune 0/1 branch-and-bound.
        </p>
      </RealWorldCard></>
  )
}
