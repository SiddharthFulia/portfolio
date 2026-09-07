// Sieve of Eratosthenes.
//
// User picks N. We display 2..N in a grid, then step the sieve: pick
// the smallest unmarked p, flag it as prime, cross out its multiples.
// Composites fade; primes glow.

import { useEffect, useMemo, useState } from 'react'
import { InputNumber } from 'antd'
import { ExplanationBlock, VisualiserSection, VizPanel,
  ControlsPanel, StepControls, useStepEngine, MultiLangCode,
  ComplexityTable, RealWorldCard, Field, Chip, TeX,
} from '../../components/algorithms'

// ─── Analytic helpers (twin primes, primorial, PNT check) ────
// π(N) counts primes up to N. Prime counting function grows like N/ln(N)
// (the Prime Number Theorem). We show both the exact count and the PNT
// estimate so users see the approximation lock in as N grows.
function twinPrimes(state, n) {
  const pairs = []
  for (let i = 2; i <= n - 2; i++) {
    if (state[i] === 'prime' && state[i + 2] === 'prime') pairs.push([i, i + 2])
  }
  return pairs
}
function pntEstimate(n) {
  return n < 2 ? 0 : Math.round(n / Math.log(n))
}

// ─── Build frames ─────────────────────────────────────
// Each frame is a state snapshot: array of one of ['pending', 'prime', 'composite', 'active'].
function buildSieve(n) {
  const state = new Array(n + 1).fill('pending')
  state[0] = state[1] = 'composite'
  const frames = [{ state: state.slice(), msg: 'initial', p: null, line: 0 }]

  for (let p = 2; p * p <= n; p++) {
    if (state[p] === 'composite') continue
    state[p] = 'prime'
    frames.push({ state: state.slice(), msg: `p = ${p} is prime`, p, line: 2 })
    for (let m = p * p; m <= n; m += p) {
      if (state[m] !== 'prime') {
        state[m] = 'composite'
        frames.push({ state: state.slice(), msg: `cross ${m} (multiple of ${p})`, p, mark: m, line: 4 })
      }
    }
  }
  // Any remaining "pending" are primes
  for (let i = 2; i <= n; i++) if (state[i] === 'pending') state[i] = 'prime'
  frames.push({ state: state.slice(), msg: 'complete', p: null, line: 5 })
  return frames
}

const CODE = {
  pseudo: `let mark[2..N] = false
for p = 2 .. sqrt(N):
  if not mark[p]:
    for m = p*p, p*p+p, ... <= N:
      mark[m] = true
primes = { i : not mark[i] }`,

  c: `#include <stdbool.h>
#include <stdlib.h>

/* Returns the count of primes in [2, N] and fills 'out' with them. */
int sieve(int N, int* out) {
    bool* mark = (bool*)calloc(N + 1, sizeof(bool));
    for (int p = 2; (long)p * p <= N; p++) {
        if (mark[p]) continue;
        /* Start crossing at p*p — every smaller multiple has a smaller prime factor. */
        for (long m = (long)p * p; m <= N; m += p) mark[m] = true;
    }
    int k = 0;
    for (int i = 2; i <= N; i++) if (!mark[i]) out[k++] = i;
    free(mark);
    return k;
}`,

  cpp: `#include <vector>

std::vector<int> sieve(int N) {
    std::vector<bool> mark(N + 1, false);
    for (int p = 2; (long long)p * p <= N; ++p) {
        if (mark[p]) continue;
        // Start at p*p — every smaller multiple of p was crossed by a smaller prime.
        for (long long m = (long long)p * p; m <= N; m += p) mark[m] = true;
    }
    std::vector<int> primes;
    for (int i = 2; i <= N; ++i) if (!mark[i]) primes.push_back(i);
    return primes;
}`,

  python: `def sieve(N):
    """Sieve of Eratosthenes — returns all primes in [2, N]."""
    if N < 2:
        return []
    mark = [False] * (N + 1)
    p = 2
    while p * p <= N:
        if not mark[p]:
            # Composites below p*p were already crossed by a smaller prime.
            for m in range(p * p, N + 1, p):
                mark[m] = True
        p += 1
    return [i for i in range(2, N + 1) if not mark[i]]`,

  java: `import java.util.*;

public static List<Integer> sieve(int N) {
    boolean[] mark = new boolean[N + 1];
    for (int p = 2; (long) p * p <= N; p++) {
        if (mark[p]) continue;
        // Kick off from p*p — smaller multiples already have a smaller prime factor.
        for (long m = (long) p * p; m <= N; m += p) mark[(int) m] = true;
    }
    List<Integer> primes = new ArrayList<>();
    for (int i = 2; i <= N; i++) if (!mark[i]) primes.add(i);
    return primes;
}`,

  rust: `pub fn sieve(n: usize) -> Vec<usize> {
    if n < 2 { return Vec::new(); }
    let mut mark = vec![false; n + 1];
    let mut p = 2usize;
    while p * p <= n {
        if !mark[p] {
            // Start at p*p — smaller multiples of p are already crossed off.
            let mut m = p * p;
            while m <= n { mark[m] = true; m += p; }
        }
        p += 1;
    }
    (2..=n).filter(|&i| !mark[i]).collect()
}`,
}

const ACTIVE_MAP = {
  pseudo: { init: 0, prime: 2, cross: 4, done: 5 },
  c:      { init: 5, prime: 7, cross: 10, done: 13 },
  cpp:    { init: 3, prime: 5, cross: 8, done: 11 },
  python: { init: 4, prime: 7, cross: 10, done: 12 },
  java:   { init: 3, prime: 5, cross: 8, done: 11 },
  rust:   { init: 2, prime: 5, cross: 8, done: 12 },
}
function activeLinesFor(frame) {
  const kind = !frame?.p ? (frame?.msg === 'complete' ? 'done' : 'init')
              : frame?.mark ? 'cross' : 'prime'
  const out = {}
  for (const lang of Object.keys(ACTIVE_MAP)) {
    const v = ACTIVE_MAP[lang][kind]
    if (typeof v === 'number') out[lang] = v
  }
  return out
}

function Grid({ state, p, mark, n }) {
  const cols = n <= 100 ? 10 : n <= 400 ? 20 : 25
  return (
    <div className='overflow-auto rounded-lg border border-white/10 bg-black/30 p-2'>
      <div
        className='grid gap-1'
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {state.map((s, i) => {
          if (i < 2) return null
          const cls =
            s === 'prime' ? 'bg-amber-400/25 text-amber-200 border-amber-300/60' :
            s === 'composite' ? 'bg-white/[0.02] text-white/25 line-through border-white/5' :
            'bg-white/[0.05] text-white/80 border-white/10'
          const ring = i === p ? 'ring-2 ring-emerald-300' : i === mark ? 'ring-2 ring-rose-400' : ''
          return (
            <div
              key={i}
              className={`aspect-square flex items-center justify-center rounded border font-mono text-[10px] sm:text-xs ${cls} ${ring}`}
            >
              {i}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Sieve() {
  const [n, setN] = useState(120)
  const frames = useMemo(() => buildSieve(n), [n])
  const [idx, setIdx] = useState(0)
  const { i, playing, play, pause, step, reset, speed, setSpeed } = useStepEngine({
    frameCount: frames.length,
    onFrame: setIdx,
  })
  useEffect(() => { reset() /* eslint-disable-next-line */ }, [n])
  const f = frames[idx] || frames[0]
  const primeCount = f.state.filter(s => s === 'prime').length
  const twins = useMemo(() => twinPrimes(f.state, n), [f.state, n])
  const pntEst = pntEstimate(n)
  const finalCount = frames[frames.length - 1].state.filter(s => s === 'prime').length
  const density = n > 1 ? (finalCount / (n - 1)) * 100 : 0

  return (
    <><ExplanationBlock>
        <p>
          Around 240 BC Eratosthenes of Cyrene noticed that if you list
          all integers from 2 to N and repeatedly cross out multiples of
          the smallest surviving number, whatever remains is exactly the
          set of primes up to N.
        </p>
        <p>
          Two optimisations turn this into the algorithm you'd actually
          ship. First, you only need to sieve up to <TeX tex='\\sqrt{N}' /> —
          any composite <TeX tex='c \\le N' /> has a prime factor no larger
          than <TeX tex='\\sqrt c' />. Second, when you sieve a new prime
          <TeX tex='p' />, start at <TeX tex='p^2' /> rather than
          <TeX tex='2p' />: every smaller multiple of <TeX tex='p' /> was
          already crossed out by a smaller prime.
        </p>
        <p>
          Total work: <TeX tex='O(N \\log \\log N)' /> — nearly linear,
          which is why the sieve stays the go-to method for primes up to
          <TeX tex='\\sim 10^9' />.
        </p>
      </ExplanationBlock>

      <VisualiserSection>
        <VizPanel>
          <Grid state={f.state} p={f.p} mark={f.mark} n={n} />
          <div className='mt-3 text-xs text-white/70 font-mono'>
            step {i + 1}/{frames.length} · {f.msg} · primes so far
            <span className='text-amber-300 ml-1'>{primeCount}</span>
          </div>
        </VizPanel>
        <ControlsPanel>
          <Field label='N (upper bound)' helper='All integers from 2 to N are sieved.'>
            <InputNumber min={10} max={600} value={n} onChange={v => setN(v || 10)} className='w-full' />
          </Field>
          <StepControls
            playing={playing} onPlay={play} onPause={pause} onStep={step} onReset={reset}
            speed={speed} onSpeed={setSpeed}
          />
          <div className='pt-2 flex gap-1.5 flex-wrap'>
            <Chip tone='amber'>prime</Chip>
            <Chip tone='gray'>pending</Chip>
            <Chip tone='rose'>crossed</Chip>
          </div>
          <div className='pt-2 text-xs text-white/60'>
            √N ≈ <span className='font-mono text-emerald-300'>{Math.floor(Math.sqrt(n))}</span> — sieve stops here.
          </div>
          <div className='pt-2 mt-2 border-t border-white/10 space-y-1'>
            <div className='text-[10px] uppercase tracking-widest text-white/45'>stats</div>
            <div className='text-xs font-mono flex justify-between'>
              <span className='text-white/60'>π(N) exact</span>
              <span className='text-amber-300'>{finalCount}</span>
            </div>
            <div className='text-xs font-mono flex justify-between'>
              <span className='text-white/60'>N / ln(N)</span>
              <span className='text-emerald-300'>{pntEst}</span>
            </div>
            <div className='text-xs font-mono flex justify-between'>
              <span className='text-white/60'>density</span>
              <span className='text-cyan-300'>{density.toFixed(1)}%</span>
            </div>
            <div className='text-xs font-mono flex justify-between'>
              <span className='text-white/60'>twin primes</span>
              <span className='text-fuchsia-300'>{twins.length}</span>
            </div>
          </div>
        </ControlsPanel>
      </VisualiserSection>

      {/* Extra deep-dive panel */}
      <section className='luxe-glass rounded-2xl p-5 sm:p-6'>
        <h2 className='text-lg sm:text-xl font-bold text-amber-100 mb-3'>Twin primes so far</h2>
        <p className='text-sm text-gray-300 leading-relaxed mb-3'>
          Two primes that differ by exactly 2 (like 11 &amp; 13 or 41 &amp; 43)
          form a <b>twin pair</b>. The Twin Prime Conjecture — still open
          — claims infinitely many exist. Below is every twin pair
          discovered up to <TeX tex='N' />.
        </p>
        <div className='flex flex-wrap gap-1.5'>
          {twins.length === 0
            ? <span className='text-xs text-white/40 italic'>no twin primes in this range yet</span>
            : twins.map(([a, b]) => (
                <span key={a} className='rounded border border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-100 font-mono text-xs px-2 py-0.5'>
                  ({a}, {b})
                </span>
              ))
          }
        </div>
      </section>

      <section className='luxe-glass rounded-2xl p-5 sm:p-6'>
        <h2 className='text-lg sm:text-xl font-bold text-amber-100 mb-3'>Variations</h2>
        <ul className='text-sm text-gray-300 space-y-2 list-disc list-inside'>
          <li>
            <b>Linear (Euler) sieve</b> — each composite is crossed by
            its <i>smallest</i> prime factor exactly once, giving
            <TeX tex='O(N)' /> time at the cost of a slightly more
            careful loop.
          </li>
          <li>
            <b>Segmented sieve</b> — for large N that doesn't fit in
            RAM, sieve in windows of size <TeX tex='\\sqrt N' /> using
            only the primes found in the first window as "wheels".
          </li>
          <li>
            <b>Wheel factorisation</b> — pre-skip multiples of 2, 3,
            5, 7 so the inner loop only touches candidates coprime to
            210. Cuts constant factor by ~4×.
          </li>
          <li>
            <b>Sieve of Atkin</b> — <TeX tex='O(N / \\log\\log N)' />{' '}
            using quadratic forms; asymptotically faster but the
            constants are worse until <TeX tex='N > 10^{10}' />.
          </li>
        </ul>
      </section>

      <MultiLangCode title='Sieve of Eratosthenes' code={CODE} activeLines={activeLinesFor(f)} />

      <ComplexityTable rows={[
        { op: 'Sieve of Eratosthenes', best: 'O(N \\log \\log N)', avg: 'O(N \\log \\log N)', worst: 'O(N \\log \\log N)', space: 'O(N)' },
        { op: 'Linear (Euler) Sieve',  best: 'O(N)',              avg: 'O(N)',              worst: 'O(N)',              space: 'O(N)' },
        { op: 'Trial division per q',  best: 'O(1)',              avg: 'O(\\sqrt q)',        worst: 'O(\\sqrt q)',        space: 'O(1)' },
        { op: 'Miller–Rabin (per q)',  best: 'O(k \\log^2 q)',    avg: 'O(k \\log^2 q)',    worst: 'O(k \\log^3 q)',    space: 'O(1)' },
      ]} />

      <RealWorldCard>
        <p>
          The sieve underpins the pre-compute step in most competitive-
          programming number-theory templates (smallest prime factor,
          Möbius, Euler totient). At crypto scale, once you need primes
          above 2<sup>2048</sup> you switch to Miller–Rabin because a
          10<sup>600</sup>-size bit array is not a thing.
        </p>
        <p>
          Every <code>ssh-keygen -t rsa</code>, TLS handshake key
          generation, and hashcash-style proof-of-work touches primality
          testing — but always probabilistic, never sieve.
        </p>
      </RealWorldCard></>
  )
}
