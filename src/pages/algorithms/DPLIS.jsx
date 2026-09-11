// Longest Increasing Subsequence — side-by-side O(n²) DP and O(n log n) patience sort.
//
// LEFT: dp[i] = length of LIS ending at index i.
//   dp[i] = 1 + max(dp[j] for j<i where a[j] < a[i])   (fallback 1)
//   Trace parent for reconstruction.
//
// RIGHT: patience sort.
//   Maintain "piles" (or the equivalent tails[] array). For each x:
//     find leftmost pile whose top ≥ x; replace it. If none, new pile.
//   Length of LIS = number of piles at end.

import { useEffect, useMemo, useState } from 'react'
import { InputNumber } from 'antd'
import { ExplanationBlock, VisualiserSection, VizPanel,
  ControlsPanel, StepControls, useStepEngine, MultiLangCode,
  ComplexityTable, RealWorldCard, Field, Chip, TeX,
} from '../../components/algorithms'
import { CODE as LIS_CODE, LIS_DP_SAMPLES, LIS_PATIENCE_SAMPLES } from './code/DPLIS'

function mulberry32(seed) {
  let a = (seed | 0) || 1
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function genPerm(n, seed) {
  const rng = mulberry32(seed)
  const a = []
  for (let i = 1; i <= n; i++) a.push(i)
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ─── O(n^2) DP frames ─────────────────────────────
function dpFrames(a) {
  const n = a.length
  const dp = new Array(n).fill(1)
  const par = new Array(n).fill(-1)
  const frames = []
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) {
      frames.push({ i, j, dp: dp.slice(), par: par.slice(), kind: 'check' })
      if (a[j] < a[i] && dp[j] + 1 > dp[i]) {
        dp[i] = dp[j] + 1
        par[i] = j
        frames.push({ i, j, dp: dp.slice(), par: par.slice(), kind: 'update' })
      }
    }
    frames.push({ i, j: -1, dp: dp.slice(), par: par.slice(), kind: 'seal' })
  }
  // Reconstruct
  let best = 0
  for (let i = 1; i < n; i++) if (dp[i] > dp[best]) best = i
  const path = []
  for (let cur = best; cur !== -1; cur = par[cur]) path.push(cur)
  path.reverse()
  frames.push({ dp, par, kind: 'done', path, length: dp[best] })
  return frames
}

// ─── Patience sort (O(n log n)) frames ────────────
function patienceFrames(a) {
  const n = a.length
  const piles = []       // each pile = array of chips (top is last)
  const tails = []       // for binary search: tails[k] = top of pile k
  const parents = []     // parent[i] = index in a of pointer to previous chip
  const idxAt = []       // idxAt[k] = index (in a) of top of pile k
  const parentOfIdx = new Array(n).fill(-1)
  const frames = []
  for (let i = 0; i < n; i++) {
    const x = a[i]
    // binary search for leftmost tail ≥ x
    let lo = 0, hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (tails[mid] >= x) hi = mid
      else lo = mid + 1
    }
    const pileIdx = lo
    if (pileIdx > 0) parentOfIdx[i] = idxAt[pileIdx - 1]
    if (pileIdx === piles.length) {
      piles.push([x])
      tails.push(x)
      idxAt.push(i)
      frames.push({ i, piles: piles.map(p => p.slice()), tails: tails.slice(), kind: 'new-pile' })
    } else {
      piles[pileIdx].push(x)
      tails[pileIdx] = x
      idxAt[pileIdx] = i
      frames.push({ i, piles: piles.map(p => p.slice()), tails: tails.slice(), kind: 'replace', pileIdx })
    }
  }
  const length = tails.length
  // Reconstruct path: chase parents from the top of the last pile
  let cur = idxAt[length - 1]
  const path = []
  while (cur !== -1) { path.push(cur); cur = parentOfIdx[cur] }
  path.reverse()
  frames.push({ piles: piles.map(p => p.slice()), tails: tails.slice(), kind: 'done', length, path })
  return frames
}

const DP_PSEUDO = [
  'dp[0..n-1] = 1',
  'for i in 0..n-1:',
  '  for j in 0..i-1:',
  '    if a[j] < a[i]:',
  '      if dp[j] + 1 > dp[i]:',
  '        dp[i] = dp[j] + 1',
  '        parent[i] = j',
  'answer = max(dp)',
]

const PATIENCE_PSEUDO = [
  'tails = []',
  'for x in a:',
  '  # binary search for leftmost tail >= x',
  '  k = bisect_left(tails, x)',
  '  if k == len(tails):',
  '    tails.push(x); new pile',
  '  else:',
  '    tails[k] = x; replace top',
  'answer = len(tails)',
]

// ─── Rendering ─────────────────────────────────
function DPPanel({ a, frame }) {
  const cellW = 34
  return (
    <div className='overflow-x-auto rounded-lg border border-white/10 bg-black/30 p-3'>
      <div className='flex gap-1 mb-2'>
        {a.map((v, i) => {
          const isI = frame?.i === i
          const isJ = frame?.j === i
          const isPath = frame?.path?.includes(i)
          const cls =
            isPath ? 'bg-amber-400/30 border-amber-300 text-amber-100' :
            isI ? 'bg-rose-400/30 border-rose-300 text-rose-100' :
            isJ ? 'bg-cyan-400/30 border-cyan-300 text-cyan-100' :
            'bg-white/[0.05] border-white/15 text-white/85'
          return (
            <div key={i} className={`rounded border font-mono text-xs flex items-center justify-center ${cls}`} style={{ width: cellW, height: cellW }}>
              {v}
            </div>
          )
        })}
      </div>
      <div className='flex gap-1'>
        {(frame?.dp || []).map((v, i) => (
          <div key={i} className='rounded border font-mono text-[10px] flex items-center justify-center bg-black/40 border-white/10 text-emerald-300' style={{ width: cellW, height: 22 }}>
            {v}
          </div>
        ))}
      </div>
      <div className='text-[10px] text-white/45 mt-1 font-mono'>dp[i]</div>
    </div>
  )
}

function PatiencePanel({ a, frame }) {
  return (
    <div className='overflow-x-auto rounded-lg border border-white/10 bg-black/30 p-3'>
      <div className='flex gap-1 mb-3'>
        {a.map((v, i) => {
          const isI = frame?.i === i
          const isPath = frame?.path?.includes(i)
          const cls =
            isPath ? 'bg-amber-400/30 border-amber-300 text-amber-100' :
            isI ? 'bg-rose-400/30 border-rose-300 text-rose-100' :
            'bg-white/[0.05] border-white/15 text-white/85'
          return (
            <div key={i} className={`rounded border font-mono text-xs w-8 h-8 flex items-center justify-center ${cls}`}>
              {v}
            </div>
          )
        })}
      </div>
      <div className='flex gap-2 items-end'>
        {(frame?.piles || []).map((pile, k) => (
          <div key={k} className='flex flex-col-reverse gap-1'>
            {pile.map((c, m) => (
              <div key={m} className='rounded border font-mono text-xs w-8 h-8 flex items-center justify-center bg-fuchsia-400/15 border-fuchsia-300/40 text-fuchsia-100'>
                {c}
              </div>
            ))}
            <div className='text-[9px] text-white/40 font-mono text-center'>{k}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function DPLIS() {
  const [n, setN] = useState(10)
  const [seed, setSeed] = useState(7)
  const a = useMemo(() => genPerm(n, seed), [n, seed])
  const dp = useMemo(() => dpFrames(a), [a])
  const pat = useMemo(() => patienceFrames(a), [a])

  const dpEng = useStepEngine({ frameCount: dp.length })
  const patEng = useStepEngine({ frameCount: pat.length })

  useEffect(() => { dpEng.reset(); patEng.reset() /* eslint-disable-next-line */ }, [a])

  const runBoth = () => { dpEng.play(); patEng.play() }
  const stopBoth = () => { dpEng.pause(); patEng.pause() }
  const resetBoth = () => { dpEng.reset(); patEng.reset() }
  const stepBoth = () => { dpEng.step(); patEng.step() }

  const dpF = dp[dpEng.i] || dp[0]
  const patF = pat[patEng.i] || pat[0]

  return (
    <><ExplanationBlock>
        <p>
          Given a sequence, find the longest strictly increasing
          subsequence. For <TeX tex='[10, 9, 2, 5, 3, 7, 101, 18]' /> the
          answer is 4 (<TeX tex='[2, 3, 7, 18]' /> or
          <TeX tex='[2, 3, 7, 101]' />).
        </p>
        <p>
          The classic DP: <TeX tex='dp[i] = 1 + \\max_{j < i,\\ a[j]<a[i]} dp[j]' />
          takes <TeX tex='O(n^2)' />. Fine for small inputs but painful
          at <TeX tex='n = 10^5' />.
        </p>
        <p>
          <b>Patience sort</b> gives <TeX tex='O(n \\log n)' />. Deal
          cards left-to-right onto piles by the rule "smallest tail
          &ge; card". By an exchange argument the number of piles equals
          the LIS length, and the piles themselves let you reconstruct
          it. We keep an array <TeX tex='\\text{tails}[k]' /> — top of
          the <TeX tex='k' />-th pile — and binary-search into it for
          each card.
        </p>
      </ExplanationBlock>

      <VisualiserSection>
        <VizPanel>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <div>
              <div className='text-xs text-white/60 mb-1'>DP · O(n²) · step {dpEng.i + 1}/{dp.length}</div>
              <DPPanel a={a} frame={dpF} />
              <div className='text-xs text-emerald-300 font-mono mt-1'>
                length {Math.max(1, ...(dpF?.dp || [1]))}
              </div>
            </div>
            <div>
              <div className='text-xs text-white/60 mb-1'>Patience · O(n log n) · step {patEng.i + 1}/{pat.length}</div>
              <PatiencePanel a={a} frame={patF} />
              <div className='text-xs text-emerald-300 font-mono mt-1'>
                piles {patF?.piles?.length || 0}
              </div>
            </div>
          </div>
        </VizPanel>
        <ControlsPanel>
          <Field label='Array size'>
            <InputNumber min={4} max={16} value={n} onChange={v => setN(v || 4)} className='w-full' />
          </Field>
          <Field label='Seed'>
            <InputNumber min={0} max={9999} value={seed} onChange={v => setSeed(v || 0)} className='w-full' />
          </Field>
          <StepControls
            playing={dpEng.playing || patEng.playing}
            onPlay={runBoth} onPause={stopBoth}
            onStep={stepBoth}
            onReset={resetBoth}
            speed={dpEng.speed}
            onSpeed={(v) => { dpEng.setSpeed(v); patEng.setSpeed(v) }}
          />
          <div className='pt-2 flex gap-1.5 flex-wrap'>
            <Chip tone='rose'>current i</Chip>
            <Chip tone='cyan'>compare j</Chip>
            <Chip tone='amber'>reconstructed LIS</Chip>
          </div>
        </ControlsPanel>
      </VisualiserSection>

      <MultiLangCode title='LIS — O(n²) DP' code={LIS_CODE.dp} samples={LIS_DP_SAMPLES} />
      <MultiLangCode title='LIS — Patience O(n log n)' code={LIS_CODE.patience} samples={LIS_PATIENCE_SAMPLES} />

      <ComplexityTable rows={[
        { op: 'DP (n²)',                best: 'O(n)',      avg: 'O(n^2)',       worst: 'O(n^2)',       space: 'O(n)' },
        { op: 'Patience (n log n)',     best: 'O(n)',      avg: 'O(n \\log n)',  worst: 'O(n \\log n)',  space: 'O(n)' },
        { op: 'Segment tree DP',        best: 'O(n \\log n)', avg: 'O(n \\log n)', worst: 'O(n \\log n)', space: 'O(n)' },
      ]} />

      <RealWorldCard>
        <p>
          Version-control merge base finding (LCS reduces to LIS on
          renumbered lines), stock-price monotonic problems, gene
          alignment shortcuts.
        </p>
        <p>
          Fun fact: patience sort is called that because it's literally
          the card game "Patience" (aka Klondike) with a rule that
          makes the pile count equal the LIS length. Named by Persi
          Diaconis.
        </p>
      </RealWorldCard></>
  )
}
