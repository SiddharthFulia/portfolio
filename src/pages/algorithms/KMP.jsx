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
import { ExplanationBlock, VisualiserSection, VizPanel,
  ControlsPanel, StepControls, useStepEngine, MultiLangCode,
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

// KMP — failure function + search loop, in six languages.
const CODE = {
  pseudo: `# Build π (failure function)
pi[0] = 0
k = 0
for i = 1 .. m-1:
  while k > 0 and pat[k] != pat[i]:
    k = pi[k-1]
  if pat[k] == pat[i]: k += 1
  pi[i] = k

# Search
j = 0
for i = 0 .. n-1:
  while j > 0 and text[i] != pat[j]:
    j = pi[j-1]
  if text[i] == pat[j]:
    j += 1
  if j == m:
    report match at i - m + 1
    j = pi[j-1]`,

  c: `#include <stdio.h>
#include <string.h>
#include <stdlib.h>

void build_pi(const char* pat, int m, int* pi) {
    pi[0] = 0;
    int k = 0;
    for (int i = 1; i < m; i++) {
        while (k > 0 && pat[k] != pat[i]) k = pi[k - 1];
        if (pat[k] == pat[i]) k++;
        pi[i] = k;
    }
}

int kmp_search(const char* text, const char* pat, int* out) {
    int n = (int)strlen(text), m = (int)strlen(pat);
    if (m == 0) return 0;
    int* pi = malloc(m * sizeof(int));
    build_pi(pat, m, pi);
    int j = 0, matches = 0;
    for (int i = 0; i < n; i++) {
        while (j > 0 && text[i] != pat[j]) j = pi[j - 1];
        if (text[i] == pat[j]) j++;
        if (j == m) {
            out[matches++] = i - m + 1;
            j = pi[j - 1];
        }
    }
    free(pi);
    return matches;
}

int main(void) {
    const char* text = "ababcababcababaabab";
    const char* pat = "ababc";
    int out[64];
    int n = kmp_search(text, pat, out);
    printf("Text: %s\\nPattern: %s\\nMatches at indices:", text, pat);
    for (int i = 0; i < n; i++) printf(" %d", out[i]);
    printf("\\n");
    return 0;
}`,

  cpp: `#include <iostream>
#include <string>
#include <vector>

std::vector<int> build_pi(const std::string& pat) {
    int m = (int)pat.size();
    std::vector<int> pi(m, 0);
    int k = 0;
    for (int i = 1; i < m; ++i) {
        while (k > 0 && pat[k] != pat[i]) k = pi[k - 1];
        if (pat[k] == pat[i]) k++;
        pi[i] = k;
    }
    return pi;
}

std::vector<int> kmp_search(const std::string& text, const std::string& pat) {
    std::vector<int> matches;
    if (pat.empty()) return matches;
    auto pi = build_pi(pat);
    int j = 0, m = (int)pat.size();
    for (int i = 0; i < (int)text.size(); ++i) {
        while (j > 0 && text[i] != pat[j]) j = pi[j - 1];
        if (text[i] == pat[j]) j++;
        if (j == m) { matches.push_back(i - m + 1); j = pi[j - 1]; }
    }
    return matches;
}

int main() {
    std::string text = "ababcababcababaabab";
    std::string pat = "ababc";
    auto m = kmp_search(text, pat);
    std::cout << "Text: " << text << "\\nPattern: " << pat << "\\nMatches at indices:";
    for (int x : m) std::cout << " " << x;
    std::cout << "\\n";
    return 0;
}`,

  python: `def build_pi(pat):
    m = len(pat)
    pi = [0] * m
    k = 0
    for i in range(1, m):
        while k > 0 and pat[k] != pat[i]: k = pi[k - 1]
        if pat[k] == pat[i]: k += 1
        pi[i] = k
    return pi

def kmp_search(text, pat):
    if not pat: return []
    pi = build_pi(pat)
    matches, j = [], 0
    for i, ch in enumerate(text):
        while j > 0 and ch != pat[j]: j = pi[j - 1]
        if ch == pat[j]: j += 1
        if j == len(pat):
            matches.append(i - len(pat) + 1)
            j = pi[j - 1]
    return matches

if __name__ == "__main__":
    text, pat = "ababcababcababaabab", "ababc"
    m = kmp_search(text, pat)
    print(f"Text: {text}\\nPattern: {pat}\\nMatches at indices: {m}")`,

  java: `import java.util.*;

public class Main {
    public static int[] buildPi(String pat) {
        int m = pat.length();
        int[] pi = new int[m];
        int k = 0;
        for (int i = 1; i < m; i++) {
            while (k > 0 && pat.charAt(k) != pat.charAt(i)) k = pi[k - 1];
            if (pat.charAt(k) == pat.charAt(i)) k++;
            pi[i] = k;
        }
        return pi;
    }

    public static List<Integer> kmpSearch(String text, String pat) {
        List<Integer> matches = new ArrayList<>();
        if (pat.isEmpty()) return matches;
        int[] pi = buildPi(pat);
        int j = 0, m = pat.length();
        for (int i = 0; i < text.length(); i++) {
            while (j > 0 && text.charAt(i) != pat.charAt(j)) j = pi[j - 1];
            if (text.charAt(i) == pat.charAt(j)) j++;
            if (j == m) { matches.add(i - m + 1); j = pi[j - 1]; }
        }
        return matches;
    }

    public static void main(String[] args) {
        String text = "ababcababcababaabab", pat = "ababc";
        System.out.println("Text: " + text + "\\nPattern: " + pat + "\\nMatches at indices: " + kmpSearch(text, pat));
    }
}`,

  rust: `fn build_pi(pat: &[u8]) -> Vec<usize> {
    let m = pat.len();
    let mut pi = vec![0usize; m];
    let mut k = 0usize;
    for i in 1..m {
        while k > 0 && pat[k] != pat[i] { k = pi[k - 1]; }
        if pat[k] == pat[i] { k += 1; }
        pi[i] = k;
    }
    pi
}

fn kmp_search(text: &[u8], pat: &[u8]) -> Vec<usize> {
    if pat.is_empty() { return Vec::new(); }
    let pi = build_pi(pat);
    let (mut j, mut matches) = (0usize, Vec::new());
    for (i, &ch) in text.iter().enumerate() {
        while j > 0 && pat[j] != ch { j = pi[j - 1]; }
        if pat[j] == ch { j += 1; }
        if j == pat.len() {
            matches.push(i + 1 - pat.len());
            j = pi[j - 1];
        }
    }
    matches
}

fn main() {
    let text = "ababcababcababaabab";
    let pat = "ababc";
    let m = kmp_search(text.as_bytes(), pat.as_bytes());
    println!("Text: {}\\nPattern: {}\\nMatches at indices: {:?}", text, pat, m);
}`,
}

const KMP_SAMPLES = [
  { name: 'Overlap',    description: '"ababc" in "ababcababcababaabab" (2 matches)', stdin: '', expected: '' },
  { name: 'No match',   description: '"xyz" not present',                            stdin: '', expected: '' },
  { name: 'All match',  description: '"aa" in "aaaa" — 3 overlapping matches',       stdin: '', expected: '' },
]

// Map the current visualiser step to an active line per language.
const ACTIVE_MAP = {
  pseudo: { jump: 14, 'match-char': 16, compare: 15, match: 18 },
  c:      { jump: 17, 'match-char': 18, compare: 17, match: 20 },
  cpp:    { jump: 17, 'match-char': 18, compare: 17, match: 21 },
  python: { jump: 22, 'match-char': 24, compare: 23, match: 26 },
  java:   { jump: 20, 'match-char': 21, compare: 20, match: 23 },
  rust:   { jump: 18, 'match-char': 19, compare: 18, match: 22 },
}
function activeLinesFor(kind) {
  const out = {}
  for (const lang of Object.keys(ACTIVE_MAP)) {
    const v = ACTIVE_MAP[lang][kind]
    if (typeof v === 'number') out[lang] = v
  }
  return out
}

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
    <><ExplanationBlock>
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

      <MultiLangCode title='KMP — failure function + search' code={CODE} samples={KMP_SAMPLES} activeLines={activeLinesFor(f?.kind)} />

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
      </RealWorldCard></>
  )
}
