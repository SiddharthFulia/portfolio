// 0/1 Knapsack — DP table, cell-by-cell fill, then backtrack.
//
// dp[i][w] = max value using first i items with capacity w.
// dp[i][w] = max(dp[i-1][w], dp[i-1][w - w_i] + v_i)   if w >= w_i
//          = dp[i-1][w]                                  else
//
// Viz plays through every cell fill in row-major order, showing which
// cell above-and-diagonally we're comparing. When done, we backtrack
// from dp[n][C] to reconstruct which items were taken (glow amber).

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
function genItems(n, seed, maxW = 8) {
  const rng = mulberry32(seed)
  const items = []
  for (let i = 0; i < n; i++) {
    items.push({
      id: i,
      w: Math.floor(rng() * maxW) + 1,
      v: Math.floor(rng() * 25) + 5,
    })
  }
  return items
}

// ─── Build DP + backtrack frames ────────────────────────
function buildFrames(items, C) {
  const n = items.length
  const dp = Array.from({ length: n + 1 }, () => new Array(C + 1).fill(0))
  const frames = []
  frames.push({ dp: dp.map(r => r.slice()), i: 0, w: 0, msg: 'row 0 = base case: 0 items → 0 value', line: 0, phase: 'init' })
  for (let i = 1; i <= n; i++) {
    for (let w = 0; w <= C; w++) {
      const it = items[i - 1]
      let val = dp[i - 1][w]
      let take = false
      if (w >= it.w) {
        const alt = dp[i - 1][w - it.w] + it.v
        if (alt > val) { val = alt; take = true }
      }
      dp[i][w] = val
      frames.push({
        dp: dp.map(r => r.slice()),
        i, w,
        msg: take ? `take item ${i}: v=${it.v}` : `skip item ${i}`,
        line: take ? 5 : 4,
        phase: 'fill',
        take, item: it,
      })
    }
  }
  // Backtrack
  const taken = []
  let ci = n, cw = C
  while (ci > 0) {
    if (dp[ci][cw] !== dp[ci - 1][cw]) {
      taken.push(items[ci - 1].id)
      frames.push({
        dp: dp.map(r => r.slice()), i: ci, w: cw,
        msg: `backtrack: took item ${ci}`,
        line: 8,
        phase: 'back',
        taken: taken.slice(),
      })
      cw -= items[ci - 1].w
    } else {
      frames.push({
        dp: dp.map(r => r.slice()), i: ci, w: cw,
        msg: `backtrack: skipped item ${ci}`,
        line: 9,
        phase: 'back',
        taken: taken.slice(),
      })
    }
    ci--
  }
  frames.push({
    dp: dp.map(r => r.slice()), i: 0, w: 0,
    msg: `answer = ${dp[n][C]}, items taken = [${taken.join(', ')}]`,
    line: 10, phase: 'done', taken: taken.slice(),
  })
  return { frames, dp, taken, answer: dp[n][C] }
}

const CODE = {
  pseudo: `dp[0..n][0..C] = 0
for i = 1 .. n:
  for w = 0 .. C:
    if w < items[i].w:
      dp[i][w] = dp[i-1][w]
    else:
      dp[i][w] = max(dp[i-1][w],
                     dp[i-1][w - items[i].w] + items[i].v)

# Backtrack for taken items
i = n; w = C; taken = []
while i > 0:
  if dp[i][w] != dp[i-1][w]:
    taken.push(i); w -= items[i].w
  i -= 1`,

  c: `#include <stdio.h>
#include <stdlib.h>

typedef struct { int w, v; } Item;

int knapsack01(Item* items, int n, int C, int* taken_out, int* taken_count) {
    int (*dp)[C + 1] = malloc(sizeof(int[n + 1][C + 1]));
    for (int w = 0; w <= C; w++) dp[0][w] = 0;
    for (int i = 1; i <= n; i++) {
        for (int w = 0; w <= C; w++) {
            dp[i][w] = dp[i - 1][w];
            if (w >= items[i - 1].w) {
                int alt = dp[i - 1][w - items[i - 1].w] + items[i - 1].v;
                if (alt > dp[i][w]) dp[i][w] = alt;
            }
        }
    }
    int ans = dp[n][C], k = 0, cw = C;
    for (int i = n; i > 0; i--) {
        if (dp[i][cw] != dp[i - 1][cw]) {
            taken_out[k++] = i - 1;
            cw -= items[i - 1].w;
        }
    }
    *taken_count = k;
    free(dp);
    return ans;
}

int main(void) {
    Item items[] = {{2, 3}, {3, 4}, {4, 5}, {5, 6}};
    int taken[8], k;
    int best = knapsack01(items, 4, 5, taken, &k);
    printf("Best value: %d\\n", best);
    printf("Items taken (0-indexed):");
    for (int i = k - 1; i >= 0; i--) printf(" %d", taken[i]);
    printf("\\n");
    return 0;
}`,

  cpp: `#include <iostream>
#include <vector>
#include <algorithm>

struct Item { int w, v; };

int knapsack01(const std::vector<Item>& items, int C, std::vector<int>& taken) {
    int n = (int)items.size();
    std::vector<std::vector<int>> dp(n + 1, std::vector<int>(C + 1, 0));
    for (int i = 1; i <= n; ++i) {
        for (int w = 0; w <= C; ++w) {
            dp[i][w] = dp[i - 1][w];
            if (w >= items[i - 1].w)
                dp[i][w] = std::max(dp[i][w], dp[i - 1][w - items[i - 1].w] + items[i - 1].v);
        }
    }
    int cw = C;
    for (int i = n; i > 0; --i) {
        if (dp[i][cw] != dp[i - 1][cw]) {
            taken.push_back(i - 1);
            cw -= items[i - 1].w;
        }
    }
    return dp[n][C];
}

int main() {
    std::vector<Item> items = {{2, 3}, {3, 4}, {4, 5}, {5, 6}};
    int C = 5;
    std::vector<int> taken;
    int best = knapsack01(items, C, taken);
    std::cout << "Best value: " << best << "\\n";
    std::cout << "Items taken (0-indexed):";
    for (int i = taken.size() - 1; i >= 0; --i) std::cout << " " << taken[i];
    std::cout << "\\n";
    return 0;
}`,

  python: `def knapsack01(items, C):
    n = len(items)
    dp = [[0] * (C + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        w, v = items[i - 1]
        for cap in range(C + 1):
            dp[i][cap] = dp[i - 1][cap]
            if cap >= w:
                dp[i][cap] = max(dp[i][cap], dp[i - 1][cap - w] + v)
    taken, cap = [], C
    for i in range(n, 0, -1):
        if dp[i][cap] != dp[i - 1][cap]:
            taken.append(i - 1)
            cap -= items[i - 1][0]
    return dp[n][C], taken[::-1]

if __name__ == "__main__":
    items = [(2, 3), (3, 4), (4, 5), (5, 6)]
    best, taken = knapsack01(items, 5)
    print(f"Best value: {best}")
    print(f"Items taken (0-indexed): {taken}")`,

  java: `import java.util.*;

public class Main {
    public static int knapsack01(int[][] items, int C, List<Integer> taken) {
        int n = items.length;
        int[][] dp = new int[n + 1][C + 1];
        for (int i = 1; i <= n; i++) {
            int w = items[i - 1][0], v = items[i - 1][1];
            for (int cap = 0; cap <= C; cap++) {
                dp[i][cap] = dp[i - 1][cap];
                if (cap >= w)
                    dp[i][cap] = Math.max(dp[i][cap], dp[i - 1][cap - w] + v);
            }
        }
        int cw = C;
        for (int i = n; i > 0; i--) {
            if (dp[i][cw] != dp[i - 1][cw]) {
                taken.add(i - 1);
                cw -= items[i - 1][0];
            }
        }
        Collections.reverse(taken);
        return dp[n][C];
    }

    public static void main(String[] args) {
        int[][] items = {{2, 3}, {3, 4}, {4, 5}, {5, 6}};
        List<Integer> taken = new ArrayList<>();
        int best = knapsack01(items, 5, taken);
        System.out.println("Best value: " + best);
        System.out.println("Items taken (0-indexed): " + taken);
    }
}`,

  rust: `fn knapsack01(items: &[(u32, u32)], capacity: usize) -> (u32, Vec<usize>) {
    let n = items.len();
    let mut dp = vec![vec![0u32; capacity + 1]; n + 1];
    for i in 1..=n {
        let (w, v) = items[i - 1];
        let w = w as usize;
        for cap in 0..=capacity {
            dp[i][cap] = dp[i - 1][cap];
            if cap >= w {
                let alt = dp[i - 1][cap - w] + v;
                if alt > dp[i][cap] { dp[i][cap] = alt; }
            }
        }
    }
    let mut taken = Vec::new();
    let mut cw = capacity;
    for i in (1..=n).rev() {
        if dp[i][cw] != dp[i - 1][cw] {
            taken.push(i - 1);
            cw -= items[i - 1].0 as usize;
        }
    }
    taken.reverse();
    (dp[n][capacity], taken)
}

fn main() {
    let items = [(2u32, 3u32), (3, 4), (4, 5), (5, 6)];
    let (best, taken) = knapsack01(&items, 5);
    println!("Best value: {}", best);
    println!("Items taken (0-indexed): {:?}", taken);
}`,
}

const KNAPSACK_SAMPLES = [
  { name: 'Classic',   description: '4 items, capacity 5 → best 7', stdin: '', expected: '' },
  { name: 'Zero cap',  description: 'C=0 — no items fit',           stdin: '', expected: '' },
  { name: 'Single',    description: '1 item consuming full capacity', stdin: '', expected: '' },
  { name: 'All fit',   description: 'Sum of weights ≤ capacity',    stdin: '', expected: '' },
]

const ACTIVE_MAP = {
  pseudo: { init: 0, fill: 6, back: 12 },
  c:      { init: 6, fill: 12, back: 21 },
  cpp:    { init: 9, fill: 14, back: 21 },
  python: { init: 4, fill: 9, back: 14 },
  java:   { init: 5, fill: 10, back: 17 },
  rust:   { init: 4, fill: 9, back: 20 },
}
function activeLinesFor(phase) {
  const out = {}
  for (const lang of Object.keys(ACTIVE_MAP)) {
    const v = ACTIVE_MAP[lang][phase]
    if (typeof v === 'number') out[lang] = v
  }
  return out
}

function DPGrid({ dp, cur, taken = [], phase }) {
  const rows = dp.length
  const cols = dp[0]?.length || 0
  const cellW = 26
  const cellH = 22
  return (
    <div className='overflow-x-auto rounded-lg border border-white/10 bg-black/30 p-2'>
      <table className='text-[10px] sm:text-xs font-mono border-collapse'>
        <thead>
          <tr>
            <th className='px-1.5 py-1 text-white/45'>i \ w</th>
            {Array.from({ length: cols }, (_, w) => (
              <th key={w} className='px-1.5 py-1 text-white/45 text-center' style={{ minWidth: cellW }}>{w}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dp.map((row, i) => (
            <tr key={i}>
              <td className='px-1.5 py-1 text-white/45'>{i}</td>
              {row.map((v, w) => {
                const isCur = cur?.i === i && cur?.w === w
                const isRef = cur?.phase === 'fill' && cur?.i - 1 === i && cur?.w === w
                const isRefDiag = cur?.phase === 'fill' && cur?.item && cur?.i - 1 === i && cur?.w - cur.item.w === w
                const isBack = phase === 'back' && cur?.i === i && cur?.w === w
                let cls = 'bg-black/40 text-white/85 border border-white/5'
                if (isCur) cls = 'bg-amber-400/40 text-amber-100 border-2 border-amber-300'
                if (isRef) cls = 'bg-cyan-400/25 text-cyan-100 border border-cyan-400/60'
                if (isRefDiag) cls = 'bg-fuchsia-400/25 text-fuchsia-100 border border-fuchsia-400/60'
                if (isBack) cls = 'bg-rose-400/35 text-rose-100 border-2 border-rose-300'
                return (
                  <td
                    key={w}
                    className={`px-1.5 py-1 text-center ${cls}`}
                    style={{ minWidth: cellW, height: cellH }}
                  >
                    {v}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ItemsList({ items, taken }) {
  return (
    <div className='grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3'>
      {items.map((it, i) => {
        const isTaken = taken?.includes(it.id)
        return (
          <div
            key={it.id}
            className={`rounded-md border p-2 text-xs font-mono ${
              isTaken ? 'bg-amber-400/15 border-amber-300/50 text-amber-100' : 'bg-white/[0.03] border-white/10 text-white/60'
            }`}
          >
            <div>item {i + 1}</div>
            <div className='text-[10px]'>w={it.w} · v={it.v}</div>
          </div>
        )
      })}
    </div>
  )
}

export default function DPKnapsack() {
  const [n, setN] = useState(5)
  const [seed, setSeed] = useState(3)
  const [C, setC] = useState(10)
  const items = useMemo(() => genItems(n, seed), [n, seed])
  const { frames, answer } = useMemo(() => buildFrames(items, C), [items, C])
  const [idx, setIdx] = useState(0)
  const { i, playing, play, pause, step, reset, speed, setSpeed } = useStepEngine({
    frameCount: frames.length,
    onFrame: setIdx,
  })
  useEffect(() => { reset() /* eslint-disable-next-line */ }, [n, seed, C])
  const f = frames[idx] || frames[0]

  return (
    <><ExplanationBlock>
        <p>
          Same setup as fractional knapsack, but items are indivisible —
          take or leave. The greedy trick breaks: an item with the best
          ratio might not fit whole, and skipping it in favour of a lower-
          ratio item may leave less waste.
        </p>
        <p>
          DP saves us. Define <TeX tex='dp[i][w]' /> = max value using
          only the first <TeX tex='i' /> items and capacity <TeX tex='w' />.
          For each item you either skip it (
          <TeX tex='dp[i-1][w]' />) or take it (
          <TeX tex='dp[i-1][w - w_i] + v_i' />). Take the max.
        </p>
        <p>
          Time <TeX tex='O(nC)' />, space <TeX tex='O(nC)' /> (can be
          reduced to <TeX tex='O(C)' /> by rolling rows). The
          <TeX tex='C' /> factor is the number of distinct capacity
          values — so this is <b>pseudo-polynomial</b>, not truly
          polynomial in the input size.
        </p>
      </ExplanationBlock>

      <VisualiserSection>
        <VizPanel>
          <DPGrid dp={f.dp} cur={f} taken={f.taken} phase={f.phase} />
          <ItemsList items={items} taken={f.taken} />
          <div className='mt-3 text-xs text-white/70 font-mono'>
            step {i + 1}/{frames.length} · {f.msg}
          </div>
          <div className='mt-1 text-xs text-emerald-300 font-mono'>
            optimal value = {answer}
          </div>
        </VizPanel>
        <ControlsPanel>
          <Field label='Items'>
            <InputNumber min={2} max={9} value={n} onChange={v => setN(v || 2)} className='w-full' />
          </Field>
          <Field label='Capacity'>
            <InputNumber min={3} max={20} value={C} onChange={v => setC(v || 3)} className='w-full' />
          </Field>
          <Field label='Seed'>
            <InputNumber min={0} max={9999} value={seed} onChange={v => setSeed(v || 0)} className='w-full' />
          </Field>
          <StepControls
            playing={playing} onPlay={play} onPause={pause} onStep={step} onReset={reset}
            speed={speed} onSpeed={setSpeed}
          />
          <div className='pt-2 flex gap-1.5 flex-wrap'>
            <Chip tone='amber'>current cell</Chip>
            <Chip tone='cyan'>dp[i-1][w]</Chip>
            <Chip tone='fuchsia'>dp[i-1][w-wᵢ]</Chip>
            <Chip tone='rose'>backtrack</Chip>
          </div>
        </ControlsPanel>
      </VisualiserSection>

      <MultiLangCode title='0/1 Knapsack — DP + backtrack' code={CODE} samples={KNAPSACK_SAMPLES} activeLines={activeLinesFor(f?.phase)} />

      <ComplexityTable rows={[
        { op: '0/1 Knapsack DP',       best: 'O(nC)',   avg: 'O(nC)',   worst: 'O(nC)',   space: 'O(nC)' },
        { op: 'Rolling-row variant',   best: 'O(nC)',   avg: 'O(nC)',   worst: 'O(nC)',   space: 'O(C)' },
        { op: 'Meet-in-the-middle',    best: 'O(2^{n/2})', avg: 'O(2^{n/2})', worst: 'O(2^{n/2})', space: 'O(2^{n/2})' },
        { op: 'Branch & bound',        best: 'O(n)',    avg: 'O(2^n)',  worst: 'O(2^n)',  space: 'O(n)' },
      ]} />

      <section className='luxe-glass rounded-2xl p-5 sm:p-6'>
        <h2 className='text-lg sm:text-xl font-bold text-amber-100 mb-3'>Pseudo-polynomial vs polynomial</h2>
        <p className='text-sm text-gray-300 leading-relaxed mb-2'>
          The DP runs in <TeX tex='O(nC)' /> time. That looks polynomial —
          and it is, in the numeric <i>value</i> of <TeX tex='C' />. But
          the input size is <TeX tex='\\log C' /> bits, so this is
          exponential in the input length. That's what "pseudo-
          polynomial" means, and it's why 0/1 knapsack is NP-hard in
          general even though our DP feels efficient.
        </p>
        <p className='text-sm text-gray-300 leading-relaxed'>
          Once <TeX tex='C \\approx 10^9' /> the table doesn't fit. Then
          you drop back to branch-and-bound with a fractional upper
          bound, or a meet-in-the-middle attack for
          <TeX tex='n \\leq 40' />.
        </p>
      </section>

      <section className='luxe-glass rounded-2xl p-5 sm:p-6'>
        <h2 className='text-lg sm:text-xl font-bold text-amber-100 mb-3'>Space optimisation</h2>
        <p className='text-sm text-gray-300 leading-relaxed mb-2'>
          Notice <TeX tex='dp[i][w]' /> only depends on
          <TeX tex='dp[i-1][*]' />. Drop <TeX tex='O(n)' /> rows and keep
          a 1-D array of size <TeX tex='C+1' />. Iterate
          <TeX tex='w' /> from <TeX tex='C' /> <b>down</b> to
          <TeX tex='w_i' /> so we don't accidentally reuse the current
          item — that's the classic "0/1 vs unbounded" distinction.
          Unbounded knapsack iterates <TeX tex='w' /> forward, which
          allows re-taking.
        </p>
      </section>

      <section className='luxe-glass rounded-2xl p-5 sm:p-6'>
        <h2 className='text-lg sm:text-xl font-bold text-amber-100 mb-3'>Variants</h2>
        <ul className='text-sm text-gray-300 space-y-2 list-disc list-inside'>
          <li>
            <b>Unbounded knapsack</b> — items can be taken infinitely.
            Iterate <TeX tex='w' /> ascending in the rolled DP.
          </li>
          <li>
            <b>Multi-dimensional knapsack</b> — capacity is a vector
            (weight AND volume). Add another loop dimension.
          </li>
          <li>
            <b>Subset sum</b> — special case with <TeX tex='v_i = w_i' />.
            Question is "can we hit exactly a target sum?"
          </li>
          <li>
            <b>Partition equal subset</b> — subset sum with target
            <TeX tex='\\sum w_i / 2' />.
          </li>
        </ul>
      </section>

      <RealWorldCard>
        <p>
          Container packing, ad-inventory allocation, resource budgeting
          under an integer constraint, and every "pick a subset that
          maximises value under a limit" problem you'll ever see.
        </p>
        <p>
          A famous instance: cutting stock. Given a fixed-length board
          and orders of various sizes, maximise the number of orders you
          fit — same recurrence.
        </p>
      </RealWorldCard></>
  )
}
