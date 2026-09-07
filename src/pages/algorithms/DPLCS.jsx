// Longest Common Subsequence — 2D DP grid + backtrack.
//
// dp[i][j] = LCS length of A[0..i) and B[0..j).
// Rule:
//   if A[i-1] == B[j-1]:  dp[i][j] = dp[i-1][j-1] + 1        (diagonal)
//   else:                 dp[i][j] = max(dp[i-1][j], dp[i][j-1])
//
// Backtrack from dp[m][n] to reconstruct the LCS string.

import { useEffect, useMemo, useState } from 'react'
import { Input } from 'antd'
import {
  TopicShell, ExplanationBlock, VisualiserSection, VizPanel,
  ControlsPanel, StepControls, useStepEngine, MultiLangCode,
  ComplexityTable, RealWorldCard, Field, Chip, TeX,
} from '../../components/algorithms'

function buildFrames(A, B) {
  const m = A.length, n = B.length
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  const frames = [{ dp: dp.map(r => r.slice()), i: 0, j: 0, phase: 'init', msg: 'base: empty prefix → 0', line: 0 }]
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (A[i - 1] === B[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
        frames.push({ dp: dp.map(r => r.slice()), i, j, phase: 'fill', kind: 'diag', match: true, msg: `A[${i}]='${A[i - 1]}' = B[${j}]='${B[j - 1]}' → diag+1`, line: 4 })
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
        frames.push({ dp: dp.map(r => r.slice()), i, j, phase: 'fill', kind: 'max', match: false, msg: `A[${i}] ≠ B[${j}] → max(up, left)`, line: 6 })
      }
    }
  }
  // Backtrack
  const chosen = []
  let i = m, j = n
  while (i > 0 && j > 0) {
    if (A[i - 1] === B[j - 1]) {
      chosen.push({ char: A[i - 1], i, j })
      frames.push({ dp: dp.map(r => r.slice()), i, j, phase: 'back', kind: 'diag', chosen: chosen.slice(), msg: `keep '${A[i - 1]}'`, line: 9 })
      i--; j--
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      frames.push({ dp: dp.map(r => r.slice()), i, j, phase: 'back', kind: 'up', chosen: chosen.slice(), msg: `go up`, line: 11 })
      i--
    } else {
      frames.push({ dp: dp.map(r => r.slice()), i, j, phase: 'back', kind: 'left', chosen: chosen.slice(), msg: `go left`, line: 12 })
      j--
    }
  }
  const lcs = chosen.map(c => c.char).reverse().join('')
  frames.push({ dp: dp.map(r => r.slice()), i: 0, j: 0, phase: 'done', chosen: chosen.slice(), lcs, msg: `LCS = "${lcs}"`, line: 13 })
  return { frames, lcs, length: dp[m][n] }
}

const CODE = {
  pseudo: `dp[0..m][0..n] = 0
for i = 1 .. m:
  for j = 1 .. n:
    if A[i-1] == B[j-1]:
      dp[i][j] = dp[i-1][j-1] + 1
    else:
      dp[i][j] = max(dp[i-1][j], dp[i][j-1])

# Backtrack from dp[m][n]
i = m; j = n; out = []
while i > 0 and j > 0:
  if A[i-1] == B[j-1]:
    out.push(A[i-1]); i -= 1; j -= 1
  else if dp[i-1][j] >= dp[i][j-1]:
    i -= 1
  else:
    j -= 1
reverse out → LCS`,

  c: `#include <string.h>
#include <stdlib.h>

/* Returns LCS length; writes the LCS string to 'out' (caller pre-allocates). */
int lcs(const char* A, const char* B, char* out) {
    int m = (int)strlen(A), n = (int)strlen(B);
    int (*dp)[n + 1] = calloc(m + 1, sizeof(int[n + 1]));
    for (int i = 1; i <= m; i++) {
        for (int j = 1; j <= n; j++) {
            if (A[i - 1] == B[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
            else dp[i][j] = dp[i - 1][j] >= dp[i][j - 1] ? dp[i - 1][j] : dp[i][j - 1];
        }
    }
    int len = dp[m][n], i = m, j = n, k = len;
    out[len] = '\\0';
    while (i > 0 && j > 0) {
        if (A[i - 1] == B[j - 1]) { out[--k] = A[i - 1]; i--; j--; }
        else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
        else j--;
    }
    free(dp);
    return len;
}`,

  cpp: `#include <string>
#include <vector>
#include <algorithm>

std::string lcs(const std::string& A, const std::string& B) {
    int m = (int)A.size(), n = (int)B.size();
    std::vector<std::vector<int>> dp(m + 1, std::vector<int>(n + 1, 0));
    for (int i = 1; i <= m; ++i) {
        for (int j = 1; j <= n; ++j) {
            if (A[i - 1] == B[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
            else dp[i][j] = std::max(dp[i - 1][j], dp[i][j - 1]);
        }
    }
    std::string out;
    int i = m, j = n;
    while (i > 0 && j > 0) {
        if (A[i - 1] == B[j - 1]) { out.push_back(A[i - 1]); --i; --j; }
        else if (dp[i - 1][j] >= dp[i][j - 1]) --i;
        else --j;
    }
    std::reverse(out.begin(), out.end());
    return out;
}`,

  python: `def lcs(A, B):
    m, n = len(A), len(B)
    # dp[i][j] = LCS length of prefixes A[:i] and B[:j].
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if A[i - 1] == B[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])
    # Backtrack from the corner — reveals the LCS in reverse.
    out, i, j = [], m, n
    while i > 0 and j > 0:
        if A[i - 1] == B[j - 1]:
            out.append(A[i - 1]); i -= 1; j -= 1
        elif dp[i - 1][j] >= dp[i][j - 1]:
            i -= 1
        else:
            j -= 1
    return ''.join(reversed(out))`,

  java: `public static String lcs(String A, String B) {
    int m = A.length(), n = B.length();
    int[][] dp = new int[m + 1][n + 1];
    for (int i = 1; i <= m; i++) {
        for (int j = 1; j <= n; j++) {
            if (A.charAt(i - 1) == B.charAt(j - 1)) dp[i][j] = dp[i - 1][j - 1] + 1;
            else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
    }
    StringBuilder sb = new StringBuilder();
    int i = m, j = n;
    while (i > 0 && j > 0) {
        if (A.charAt(i - 1) == B.charAt(j - 1)) {
            sb.append(A.charAt(i - 1)); i--; j--;
        } else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
        else j--;
    }
    return sb.reverse().toString();
}`,

  rust: `pub fn lcs(a: &[u8], b: &[u8]) -> Vec<u8> {
    let (m, n) = (a.len(), b.len());
    let mut dp = vec![vec![0u32; n + 1]; m + 1];
    for i in 1..=m {
        for j in 1..=n {
            dp[i][j] = if a[i - 1] == b[j - 1] {
                dp[i - 1][j - 1] + 1
            } else {
                dp[i - 1][j].max(dp[i][j - 1])
            };
        }
    }
    // Backtrack along the winning direction at every cell.
    let (mut i, mut j, mut out) = (m, n, Vec::new());
    while i > 0 && j > 0 {
        if a[i - 1] == b[j - 1] {
            out.push(a[i - 1]);
            i -= 1; j -= 1;
        } else if dp[i - 1][j] >= dp[i][j - 1] {
            i -= 1;
        } else {
            j -= 1;
        }
    }
    out.reverse();
    out
}`,
}

const ACTIVE_MAP = {
  pseudo: { init: 0, fill: 6, back: 13 },
  c:      { init: 4, fill: 10, back: 15 },
  cpp:    { init: 6, fill: 12, back: 17 },
  python: { init: 3, fill: 9, back: 14 },
  java:   { init: 3, fill: 9, back: 14 },
  rust:   { init: 3, fill: 8, back: 15 },
}
function activeLinesFor(phase) {
  const out = {}
  for (const lang of Object.keys(ACTIVE_MAP)) {
    const v = ACTIVE_MAP[lang][phase]
    if (typeof v === 'number') out[lang] = v
  }
  return out
}

function DPGrid({ A, B, dp, cur }) {
  const m = A.length, n = B.length
  const cellW = 28, cellH = 24
  const backHit = new Set()
  if (cur?.chosen) cur.chosen.forEach(c => backHit.add(`${c.i}-${c.j}`))
  return (
    <div className='overflow-auto rounded-lg border border-white/10 bg-black/30 p-2'>
      <table className='text-[10px] sm:text-xs font-mono border-collapse'>
        <thead>
          <tr>
            <th className='px-1.5 py-1' />
            <th className='px-1.5 py-1 text-white/45'>ε</th>
            {B.split('').map((c, j) => (
              <th key={j} className='px-1.5 py-1 text-white/70 text-center' style={{ minWidth: cellW }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dp.map((row, i) => (
            <tr key={i}>
              <td className='px-1.5 py-1 text-white/70'>{i === 0 ? 'ε' : A[i - 1]}</td>
              {row.map((v, j) => {
                const isCur = cur?.i === i && cur?.j === j
                const isBack = backHit.has(`${i}-${j}`)
                let cls = 'bg-black/40 text-white/85 border border-white/5'
                if (isBack) cls = 'bg-amber-400/25 text-amber-100 border border-amber-300/60'
                if (isCur && cur?.phase === 'fill') cls = cur.match ? 'bg-emerald-400/40 text-emerald-100 border-2 border-emerald-300' : 'bg-cyan-400/30 text-cyan-100 border-2 border-cyan-300'
                if (isCur && cur?.phase === 'back') cls = 'bg-rose-400/40 text-rose-100 border-2 border-rose-300'
                return (
                  <td
                    key={j}
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

export default function DPLCS() {
  const [A, setA] = useState('AGCAT')
  const [B, setB] = useState('GAC')
  const { frames, lcs, length } = useMemo(() => buildFrames(A, B), [A, B])
  const [idx, setIdx] = useState(0)
  const { i, playing, play, pause, step, reset, speed, setSpeed } = useStepEngine({
    frameCount: frames.length,
    onFrame: setIdx,
  })
  useEffect(() => { reset() /* eslint-disable-next-line */ }, [A, B])
  const f = frames[idx] || frames[0]

  return (
    <TopicShell slug='dp-lcs' title='Longest Common Subsequence' category='Algorithms'>
      <ExplanationBlock>
        <p>
          A subsequence of a string keeps some characters in order but
          drops others. The <b>Longest Common Subsequence</b> of two
          strings is the longest such shared skeleton — for
          <TeX tex='\\text{AGCAT}' /> and <TeX tex='\\text{GAC}' /> it's
          <TeX tex='\\text{GA}' /> (length 2).
        </p>
        <p>
          Define <TeX tex='dp[i][j]' /> as the LCS length of the first
          <TeX tex='i' /> chars of A and first <TeX tex='j' /> of B. When
          the next chars match, LCS grows by 1 diagonally; when they
          don't, take the better of "skip one from A" or "skip one from
          B".
        </p>
        <p>
          After the grid is filled, backtrack from
          <TeX tex='dp[m][n]' />: follow the diagonal on matches, take
          the larger neighbour on mismatches. That path reveals the LCS
          in reverse.
        </p>
      </ExplanationBlock>

      <VisualiserSection>
        <VizPanel>
          <DPGrid A={A} B={B} dp={f.dp} cur={f} />
          <div className='mt-3 text-xs text-white/70 font-mono'>
            step {i + 1}/{frames.length} · {f.msg}
          </div>
          <div className='mt-1 text-xs text-emerald-300 font-mono'>
            LCS length = {length} · LCS = "{lcs}"
          </div>
        </VizPanel>
        <ControlsPanel>
          <Field label='String A' helper='Up to 10 chars for a readable grid.'>
            <Input value={A} onChange={e => setA(e.target.value.toUpperCase().slice(0, 10))} />
          </Field>
          <Field label='String B'>
            <Input value={B} onChange={e => setB(e.target.value.toUpperCase().slice(0, 10))} />
          </Field>
          <StepControls
            playing={playing} onPlay={play} onPause={pause} onStep={step} onReset={reset}
            speed={speed} onSpeed={setSpeed}
          />
          <div className='pt-2 flex gap-1.5 flex-wrap'>
            <Chip tone='emerald'>match (diag)</Chip>
            <Chip tone='cyan'>max (up/left)</Chip>
            <Chip tone='rose'>backtrack</Chip>
            <Chip tone='amber'>chosen path</Chip>
          </div>
        </ControlsPanel>
      </VisualiserSection>

      <MultiLangCode title='Longest Common Subsequence' code={CODE} activeLines={activeLinesFor(f?.phase)} />

      <ComplexityTable rows={[
        { op: 'LCS DP',                 best: 'O(mn)',        avg: 'O(mn)',        worst: 'O(mn)',        space: 'O(mn)' },
        { op: 'Hirschberg (space-opt)', best: 'O(mn)',        avg: 'O(mn)',        worst: 'O(mn)',        space: 'O(\\min(m,n))' },
        { op: 'Hunt–Szymanski',         best: 'O((n+r) \\log n)', avg: 'O((n+r) \\log n)', worst: 'O(mn)', space: 'O(mn)' },
        { op: 'Bit-parallel Myers',     best: 'O(mn/w)',       avg: 'O(mn/w)',      worst: 'O(mn/w)',      space: 'O(m)' },
      ]} />

      <section className='luxe-glass rounded-2xl p-5 sm:p-6'>
        <h2 className='text-lg sm:text-xl font-bold text-amber-100 mb-3'>Space optimisations</h2>
        <p className='text-sm text-gray-300 leading-relaxed mb-2'>
          The full grid is <TeX tex='O(mn)' /> memory, but if you only
          need the LCS <i>length</i> (not the string itself) you can get
          away with <TeX tex='O(\\min(m,n))' /> by rolling two rows.
        </p>
        <p className='text-sm text-gray-300 leading-relaxed mb-2'>
          <b>Hirschberg's algorithm</b> keeps the string reconstruction
          alive in linear space via a clever divide-and-conquer:
          compute LCS length from both ends, meet in the middle, recurse
          on the two halves. Same <TeX tex='O(mn)' /> time,
          <TeX tex='O(\\min(m,n))' /> space.
        </p>
        <p className='text-sm text-gray-300 leading-relaxed'>
          <b>Bit-parallel Myers</b> packs each row into 64-bit words and
          uses SIMD-friendly bit operations to get
          <TeX tex='O(mn / w)' /> where <TeX tex='w' /> is the machine
          word size — practical 30–60× speedup on modern CPUs.
        </p>
      </section>

      <section className='luxe-glass rounded-2xl p-5 sm:p-6'>
        <h2 className='text-lg sm:text-xl font-bold text-amber-100 mb-3'>Related DP recurrences</h2>
        <ul className='text-sm text-gray-300 space-y-2 list-disc list-inside'>
          <li>
            <b>Edit distance (Levenshtein)</b> — same grid shape;{' '}
            <TeX tex='dp[i][j] = \\min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]) + \\text{cost}' />.
          </li>
          <li>
            <b>Longest Common Substring</b> — reset to 0 on mismatch
            instead of taking max; answer is the max over the whole
            grid.
          </li>
          <li>
            <b>Shortest Common Supersequence</b> — of length
            <TeX tex='m + n - \\text{LCS}(A, B)' />.
          </li>
          <li>
            <b>Longest Palindromic Subsequence</b> — LCS of the string
            with its reverse.
          </li>
        </ul>
      </section>

      <RealWorldCard>
        <p>
          <code>diff</code>, <code>git diff</code>, patch generation —
          all built on LCS or a very close cousin (Myers' edit-graph
          shortest-path is optimised diff).
        </p>
        <p>
          Bioinformatics: DNA / protein alignment. Cosmetics on your
          phone: autocorrect looks for smallest-edit fixes (a related
          DP over Levenshtein distance).
        </p>
      </RealWorldCard>
    </TopicShell>
  )
}
