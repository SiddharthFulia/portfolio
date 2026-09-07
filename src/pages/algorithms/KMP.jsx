// Knuth–Morris–Pratt string matching.
//
// The magic of KMP is the failure function π. When a mismatch happens
// at position j in the pattern, instead of resetting to j=0 we jump to
// π[j-1] — the length of the longest proper prefix of pattern[0..j-1]
// that is ALSO a suffix. That preserves the work already done.
//
// This visualiser makes the jump visible: pattern row slides under text
// row, current i (text) and j (pattern) glow, and the failure-function
// table is drawn separately. When we jump, the pattern doesn't reset to
// under text[i] — it stays anchored to what π allows, and the arrow to
// π[j-1] flashes.

import { useEffect, useMemo, useState } from 'react'
import { Input } from 'antd'
import {
  TopicShell, ExplanationBlock, VisualiserSection, VizPanel,
  ControlsPanel, StepControls, useStepEngine, PseudocodeBlock,
  ComplexityTable, RealWorldCard, Field, Chip, TeX,
} from '../../components/algorithms'

// ─── Compute failure function ──────────────────────────
// Return { pi, frames } — frames also drive the "how is π built" mini-viz.
function buildFailureFrames(pat) {
  const m = pat.length
  const pi = new Array(m).fill(0)
  const frames = [{ pi: pi.slice(), i: 0, j: 0, msg: 'π[0] = 0 (always)', line: 0 }]
  let k = 0
  for (let i = 1; i < m; i++) {
    while (k > 0 && pat[k] !== pat[i]) {
      frames.push({ pi: pi.slice(), i, j: k, msg: `mismatch at k=${k}, jump to π[${k - 1}] = ${pi[k - 1]}`, line: 3 })
      k = pi[k - 1]
    }
    if (pat[k] === pat[i]) k++
    pi[i] = k
    frames.push({ pi: pi.slice(), i, j: k, msg: `π[${i}] = ${k}`, line: 5 })
  }
  return { pi, frames }
}

// ─── KMP search frames ────────────────────────────────
function buildSearchFrames(text, pat, pi) {
  const frames = []
  const n = text.length, m = pat.length
  if (m === 0) return { matches: [], frames }
  const matches = []
  let j = 0
  for (let i = 0; i < n; i++) {
    while (j > 0 && text[i] !== pat[j]) {
      frames.push({ i, j, kind: 'jump', from: j, to: pi[j - 1], msg: `mismatch, jump π[${j - 1}] = ${pi[j - 1]}`, line: 3 })
      j = pi[j - 1]
    }
    if (text[i] === pat[j]) {
      j++
      frames.push({ i, j, kind: 'match-char', msg: `text[${i}] = pattern[${j - 1}]`, line: 5 })
    } else {
      frames.push({ i, j, kind: 'compare', msg: `text[${i}] ≠ pattern[${j}]`, line: 6 })
    }
    if (j === m) {
      matches.push(i - m + 1)
      frames.push({ i, j, kind: 'match', at: i - m + 1, msg: `match at ${i - m + 1}`, line: 8 })
      j = pi[j - 1]
    }
  }
  return { matches, frames }
}

const SEARCH_PSEUDO = [
  'j = 0',
  'for i = 0 .. |text| - 1:',
  '  while j > 0 and text[i] ≠ pat[j]:',
  '    j = π[j-1]         # jump using failure function',
  '  if text[i] == pat[j]:',
  '    j++',
  '  # else j stays at 0',
  '  if j == |pat|:',
  '    report match at i - |pat| + 1',
  '    j = π[j-1]',
]

// ─── Row renderer ────────────────────────────────
function TextRow({ chars, active, matched = [], label, tone = 'gray' }) {
  const cellCls = (i) => {
    if (matched.includes(i)) return 'bg-emerald-400/30 text-emerald-100 border-emerald-300/60'
    if (active === i) return 'bg-amber-400/30 text-amber-100 border-amber-300/70'
    return 'bg-white/[0.05] text-white/85 border-white/10'
  }
  return (
    <div>
      <div className='text-[10px] uppercase tracking-wider text-white/45 mb-1'>{label}</div>
      <div className='flex flex-wrap gap-1'>
        {chars.map((c, i) => (
          <div key={i} className={`w-7 h-7 sm:w-8 sm:h-8 rounded border font-mono text-xs sm:text-sm flex items-center justify-center ${cellCls(i)}`}>
            {c}
          </div>
        ))}
      </div>
    </div>
  )
}

function PatternUnderText({ text, pat, i, j }) {
  const patStart = i - j
  const chars = text.split('')
  return (
    <div>
      <div className='text-[10px] uppercase tracking-wider text-white/45 mb-1'>alignment (i={i}, j={j})</div>
      <div className='flex flex-wrap gap-1'>
        {chars.map((c, k) => (
          <div key={k} className={`w-7 h-7 sm:w-8 sm:h-8 rounded border font-mono text-xs sm:text-sm flex items-center justify-center ${
            k === i ? 'bg-amber-400/30 border-amber-300/70 text-amber-100' : 'bg-white/[0.03] border-white/10 text-white/80'
          }`}>{c}</div>
        ))}
      </div>
      <div className='flex gap-1 mt-1' style={{ paddingLeft: `calc(${patStart} * (max(1.75rem, 2rem) + 0.25rem))` }}>
        {pat.split('').map((c, k) => (
          <div key={k} className={`w-7 h-7 sm:w-8 sm:h-8 rounded border font-mono text-xs sm:text-sm flex items-center justify-center ${
            k === j ? 'bg-rose-400/30 border-rose-300/70 text-rose-100' : 'bg-white/[0.03] border-fuchsia-500/25 text-fuchsia-200/80'
          }`}>{c}</div>
        ))}
      </div>
    </div>
  )
}

function FailureTable({ pat, pi, highlight }) {
  return (
    <div className='overflow-x-auto mt-3'>
      <div className='text-[10px] uppercase tracking-wider text-white/45 mb-1'>failure function π</div>
      <table className='text-xs sm:text-sm font-mono border-collapse'>
        <tbody>
          <tr>
            <td className='px-2 py-1 text-white/50'>i</td>
            {pat.split('').map((_, i) => (
              <td key={i} className='px-2 py-1 border border-white/10 text-white/60 text-center'>{i}</td>
            ))}
          </tr>
          <tr>
            <td className='px-2 py-1 text-white/50'>pat[i]</td>
            {pat.split('').map((c, i) => (
              <td key={i} className='px-2 py-1 border border-white/10 text-white/85 text-center'>{c}</td>
            ))}
          </tr>
          <tr>
            <td className='px-2 py-1 text-white/50'>π[i]</td>
            {pi.map((v, i) => (
              <td
                key={i}
                className={`px-2 py-1 border text-center ${
                  highlight === i ? 'bg-amber-400/30 border-amber-300/70 text-amber-100' : 'border-white/10 text-emerald-300'
                }`}
              >
                {v}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export default function KMP() {
  const [text, setText] = useState('ababcababcababaabab')
  const [pat, setPat] = useState('ababa')

  const { pi } = useMemo(() => buildFailureFrames(pat || 'a'), [pat])
  const { frames, matches } = useMemo(() => buildSearchFrames(text, pat, pi), [text, pat, pi])
  const [idx, setIdx] = useState(0)
  const { i, playing, play, pause, step, reset, speed, setSpeed } = useStepEngine({
    frameCount: frames.length,
    onFrame: setIdx,
  })
  useEffect(() => { reset() /* eslint-disable-next-line */ }, [text, pat])

  const f = frames[idx] || { i: 0, j: 0, msg: 'ready', kind: 'idle' }
  const matched = f?.kind === 'match' ? Array.from({ length: pat.length }, (_, k) => f.at + k) : []
  const jumpTargetPi = f?.kind === 'jump' ? f.from - 1 : null

  return (
    <TopicShell slug='kmp' title='Knuth–Morris–Pratt' category='Algorithms'>
      <ExplanationBlock>
        <p>
          Naive string search wastes work. When you mismatch at some
          position, you slide the pattern one step and start over —
          throwing away the characters you already matched.
        </p>
        <p>
          KMP's insight: since you already know what pattern prefix you
          matched, you can pre-compute how much of that prefix is
          <i> also </i>
          a suffix. That number is <TeX tex='\\pi[j-1]' /> — the failure
          function. On a mismatch, jump to <TeX tex='\\pi[j-1]' /> and
          keep going. No character in the text is ever re-inspected.
        </p>
        <p>
          Result: <TeX tex='O(n + m)' /> total. The failure function is
          built in <TeX tex='O(m)' /> using the exact same trick recursively.
        </p>
      </ExplanationBlock>

      <VisualiserSection>
        <VizPanel>
          <div className='space-y-3'>
            <PatternUnderText text={text} pat={pat} i={f.i} j={f.j} />
            <FailureTable pat={pat} pi={pi} highlight={jumpTargetPi} />
          </div>
          <div className='mt-3 text-xs text-white/70 font-mono'>
            step {i + 1}/{frames.length} · {f.msg} · matches so far
            <span className='text-emerald-300 ml-1'>[{matches.filter((_, k) => k * pat.length <= f.i).length}]</span>
          </div>
          {matches.length > 0 && (
            <div className='mt-2 text-xs text-emerald-300 font-mono'>
              all matches: [{matches.join(', ')}]
            </div>
          )}
        </VizPanel>
        <ControlsPanel>
          <Field label='Text' helper='The haystack to search.'>
            <Input value={text} onChange={e => setText(e.target.value.slice(0, 60))} />
          </Field>
          <Field label='Pattern' helper='Try "aabaabaaa" against text "aabaabaaaabaabaaa" — π shows off.'>
            <Input value={pat} onChange={e => setPat(e.target.value.slice(0, 15))} />
          </Field>
          <StepControls
            playing={playing} onPlay={play} onPause={pause} onStep={step} onReset={reset}
            speed={speed} onSpeed={setSpeed}
          />
          <div className='pt-2 flex gap-1.5 flex-wrap'>
            <Chip tone='amber'>text pointer i</Chip>
            <Chip tone='rose'>pattern pointer j</Chip>
            <Chip tone='emerald'>match</Chip>
          </div>
        </ControlsPanel>
      </VisualiserSection>

      <PseudocodeBlock lines={SEARCH_PSEUDO} activeLine={f?.line ?? -1} title='KMP search — pseudocode' />

      <ComplexityTable rows={[
        { op: 'Naive search',      best: 'O(n)',      avg: 'O(nm)',   worst: 'O(nm)',   space: 'O(1)' },
        { op: 'KMP search',        best: 'O(n+m)',    avg: 'O(n+m)',  worst: 'O(n+m)',  space: 'O(m)' },
        { op: 'Build failure π',   best: 'O(m)',      avg: 'O(m)',    worst: 'O(m)',    space: 'O(m)' },
        { op: 'Rabin–Karp',        best: 'O(n+m)',    avg: 'O(n+m)',  worst: 'O(nm)',   space: 'O(1)' },
        { op: 'Boyer–Moore',       best: 'O(n/m)',    avg: 'O(n)',    worst: 'O(nm)',   space: 'O(m + \\sigma)' },
      ]} />

      <section className='luxe-glass rounded-2xl p-5 sm:p-6'>
        <h2 className='text-lg sm:text-xl font-bold text-amber-100 mb-3'>Why π is what it is</h2>
        <p className='text-sm text-gray-300 leading-relaxed mb-2'>
          <TeX tex='\\pi[i]' /> = length of the longest proper prefix of
          <TeX tex='pat[0..i]' /> that is also a suffix of it. When the
          text pointer <TeX tex='i' /> and pattern pointer <TeX tex='j' />{' '}
          disagree, we <i>know</i> that the last <TeX tex='j' /> chars of
          text agree with the first <TeX tex='j' /> of pattern. The
          longest matched prefix of those <TeX tex='j' /> is precisely
          <TeX tex='\\pi[j-1]' /> — so we can shift the pattern so that
          prefix aligns with the same suffix, and continue at
          <TeX tex='j = \\pi[j-1]' />.
        </p>
        <p className='text-sm text-gray-300 leading-relaxed'>
          Amortised cost: each character in the text is only ever
          compared O(1) times per phase (any run of failed comparisons
          decreases <TeX tex='j' /> monotonically, so total decreases ≤
          total increases = n).
        </p>
      </section>

      <section className='luxe-glass rounded-2xl p-5 sm:p-6'>
        <h2 className='text-lg sm:text-xl font-bold text-amber-100 mb-3'>Related string algorithms</h2>
        <ul className='text-sm text-gray-300 space-y-2 list-disc list-inside'>
          <li>
            <b>Z-algorithm</b> — computes the "Z-array" where
            <TeX tex='Z[i]' /> is the length of the longest substring
            starting at <TeX tex='i' /> that matches a prefix. Equivalent
            in power to π, sometimes cleaner to reason about.
          </li>
          <li>
            <b>Aho–Corasick</b> — multi-pattern generalisation. Build a
            trie of patterns, add "failure edges" (KMP-style) so you
            can search for many patterns in one pass. Used by tools like
            <code>fgrep -f</code>, virus scanners, ad blockers.
          </li>
          <li>
            <b>Boyer–Moore</b> — scan pattern right-to-left; use bad-
            character and good-suffix shifts to skip. Sub-linear on
            average, worst case <TeX tex='O(nm)' /> (or
            <TeX tex='O(n)' /> with Galil's variant).
          </li>
          <li>
            <b>Rabin–Karp</b> — rolling hash of length-m windows.
            Great when you're searching multiple patterns of the same
            length; O(1) hash update per shift.
          </li>
          <li>
            <b>Suffix automaton</b> / <b>suffix array</b> — preprocess
            the text once, then match any pattern in
            <TeX tex='O(m)' />. Preprocessing is
            <TeX tex='O(n)' /> / <TeX tex='O(n \\log n)' /> respectively.
          </li>
        </ul>
      </section>

      <RealWorldCard>
        <p>
          KMP shows up in <code>grep</code>-like tools when the pattern is
          fixed and no regex features are needed, in DNA / protein
          matching pipelines, and inside the tokenisers of every
          plagiarism detector.
        </p>
        <p>
          Modern grep actually uses Boyer–Moore or SIMD-accelerated
          multi-string matching (Aho–Corasick, Commentz-Walter) because
          those are faster on natural-language text — but KMP's
          <TeX tex='O(n+m)' /> worst-case guarantee is what makes it a
          fixture in interview problems and formal analysis.
        </p>
      </RealWorldCard>
    </TopicShell>
  )
}
