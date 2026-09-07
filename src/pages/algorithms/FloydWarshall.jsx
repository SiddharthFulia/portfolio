// Floyd–Warshall — all-pairs shortest paths.
//
// dist[i][j] = shortest distance from i to j using only intermediate
// vertices in {0..k-1}. After iterating k = 0..n-1, dist is the final
// APSP matrix.
//
// Viz: matrix on the left, current k highlighted; every cell that
// changes glows amber; the "if dist[i][k] + dist[k][j] < dist[i][j]"
// path is highlighted as a bridge.

import { useEffect, useMemo, useState } from 'react'
import { InputNumber } from 'antd'
import {
  TopicShell, ExplanationBlock, VisualiserSection, VizPanel,
  ControlsPanel, StepControls, useStepEngine, PseudocodeBlock,
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

const INF = 1e9

function genGraph(n, density, seed) {
  const rng = mulberry32(seed)
  const dist = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => i === j ? 0 : INF)
  )
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j && rng() < density) {
        dist[i][j] = Math.floor(rng() * 8) + 1
      }
    }
  }
  return dist
}

function fwFrames(dist0) {
  const n = dist0.length
  const dist = dist0.map(r => r.slice())
  const frames = [{ dist: dist.map(r => r.slice()), k: -1, changed: new Set(), msg: 'initial', line: 0 }]
  for (let k = 0; k < n; k++) {
    const changedThisK = new Set()
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (dist[i][k] + dist[k][j] < dist[i][j]) {
          dist[i][j] = dist[i][k] + dist[k][j]
          changedThisK.add(`${i}-${j}`)
        }
      }
    }
    frames.push({
      dist: dist.map(r => r.slice()),
      k,
      changed: changedThisK,
      msg: `k = ${k} · ${changedThisK.size} cells updated`,
      line: 3,
    })
  }
  frames.push({ dist: dist.map(r => r.slice()), k: -1, changed: new Set(), msg: 'done', line: 4 })
  return frames
}

const PSEUDO = [
  'dist = adjacency matrix (INF for no edge, 0 on diagonal)',
  'for k = 0 .. n-1:',
  '  for i = 0 .. n-1:',
  '    for j = 0 .. n-1:',
  '      dist[i][j] = min(dist[i][j], dist[i][k] + dist[k][j])',
  '# invariant: after iteration k, dist[i][j] uses only nodes 0..k',
]

function Matrix({ dist, k, changed }) {
  const n = dist.length
  const cellSize = 40
  return (
    <div className='overflow-x-auto rounded-lg border border-white/10 bg-black/30 p-3'>
      <table className='text-xs font-mono border-collapse'>
        <thead>
          <tr>
            <th className='px-1 py-1' />
            {Array.from({ length: n }, (_, j) => (
              <th
                key={j}
                className={`px-2 py-1 text-center font-medium ${j === k ? 'text-amber-300' : 'text-white/45'}`}
                style={{ minWidth: cellSize }}
              >
                {j}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dist.map((row, i) => (
            <tr key={i}>
              <th
                className={`px-2 py-1 text-center font-medium ${i === k ? 'text-amber-300' : 'text-white/45'}`}
              >
                {i}
              </th>
              {row.map((v, j) => {
                const isChanged = changed.has(`${i}-${j}`)
                const inCol = j === k
                const inRow = i === k
                let cls = 'bg-black/40 text-white/85'
                if (isChanged) cls = 'bg-emerald-400/30 text-emerald-100 border-emerald-300/60'
                else if (inRow || inCol) cls = 'bg-amber-400/10 text-amber-100'
                return (
                  <td
                    key={j}
                    className={`px-2 py-1 text-center border border-white/5 ${cls}`}
                    style={{ minWidth: cellSize, height: 32 }}
                  >
                    {v >= INF / 2 ? '∞' : v}
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

export default function FloydWarshall() {
  const [n, setN] = useState(6)
  const [density, setDensity] = useState(0.4)
  const [seed, setSeed] = useState(3)
  const dist0 = useMemo(() => genGraph(n, density, seed), [n, density, seed])
  const frames = useMemo(() => fwFrames(dist0), [dist0])
  const [idx, setIdx] = useState(0)
  const { i, playing, play, pause, step, reset, speed, setSpeed } = useStepEngine({
    frameCount: frames.length,
    onFrame: setIdx,
  })
  useEffect(() => { reset() /* eslint-disable-next-line */ }, [dist0])
  const f = frames[idx] || frames[0]

  return (
    <TopicShell slug='floyd-warshall' title='Floyd–Warshall' category='Algorithms'>
      <ExplanationBlock>
        <p>
          Floyd–Warshall computes shortest paths between <b>every</b>
          pair of vertices in <TeX tex='O(V^3)' /> time and
          <TeX tex='O(V^2)' /> space. Beats <b>V</b> runs of Dijkstra
          when the graph is dense or when edge weights can be negative
          (as long as there's no negative cycle).
        </p>
        <p>
          The core insight: at iteration <TeX tex='k' />, the DP invariant
          is that <TeX tex='dist[i][j]' /> equals the shortest path using
          only intermediate nodes in <TeX tex='\\{0, \\dots, k-1\\}' />.
          Adding node <TeX tex='k' /> lets us either keep the current
          path or route through <TeX tex='k' />:
          {' '}<TeX tex='\\min(dist[i][j],\\ dist[i][k] + dist[k][j])' />.
        </p>
        <p>
          The visualiser highlights the current <TeX tex='k' /> row and
          column; cells that change during this iteration flash green.
        </p>
      </ExplanationBlock>

      <VisualiserSection>
        <VizPanel>
          <Matrix dist={f.dist} k={f.k} changed={f.changed} />
          <div className='mt-3 text-xs text-white/70 font-mono'>
            step {i + 1}/{frames.length} · {f.msg}
          </div>
        </VizPanel>
        <ControlsPanel>
          <Field label='Node count'>
            <InputNumber min={3} max={9} value={n} onChange={v => setN(v || 3)} className='w-full' />
          </Field>
          <Field label='Edge density' helper='Probability of any (i,j) edge.'>
            <InputNumber min={0.1} max={0.9} step={0.05} value={density} onChange={v => setDensity(v || 0.4)} className='w-full' />
          </Field>
          <Field label='Seed'>
            <InputNumber min={0} max={9999} value={seed} onChange={v => setSeed(v || 0)} className='w-full' />
          </Field>
          <StepControls
            playing={playing} onPlay={play} onPause={pause} onStep={step} onReset={reset}
            speed={speed} onSpeed={setSpeed}
          />
          <div className='pt-2 flex gap-1.5 flex-wrap'>
            <Chip tone='amber'>current k row/col</Chip>
            <Chip tone='emerald'>updated cell</Chip>
            <Chip tone='gray'>unchanged</Chip>
          </div>
        </ControlsPanel>
      </VisualiserSection>

      <PseudocodeBlock lines={PSEUDO} activeLine={f?.line ?? -1} />

      <ComplexityTable rows={[
        { op: 'Floyd–Warshall',    best: 'O(V^3)',      avg: 'O(V^3)',       worst: 'O(V^3)',       space: 'O(V^2)' },
        { op: 'V × Dijkstra',      best: 'O(V(V+E)\\log V)', avg: 'O(V(V+E)\\log V)', worst: 'O(V(V+E)\\log V)', space: 'O(V+E)' },
        { op: 'Johnson (sparse)',  best: 'O(VE \\log V)', avg: 'O(VE \\log V)', worst: 'O(VE \\log V)', space: 'O(V+E)' },
        { op: 'BFS × V (unweighted)', best: 'O(V(V+E))', avg: 'O(V(V+E))', worst: 'O(V(V+E))', space: 'O(V+E)' },
      ]} />

      <section className='luxe-glass rounded-2xl p-5 sm:p-6'>
        <h2 className='text-lg sm:text-xl font-bold text-amber-100 mb-3'>Path reconstruction</h2>
        <p className='text-sm text-gray-300 leading-relaxed mb-2'>
          Distances alone aren't a route. To reconstruct the path, keep
          a second matrix <TeX tex='next[i][j]' /> — the first node on
          the shortest path from <TeX tex='i' /> to <TeX tex='j' />.
          Update whenever <TeX tex='dist[i][j]' /> updates via
          <TeX tex='next[i][j] = next[i][k]' />. Then to reconstruct,
          keep following <TeX tex='next' /> pointers.
        </p>
      </section>

      <section className='luxe-glass rounded-2xl p-5 sm:p-6'>
        <h2 className='text-lg sm:text-xl font-bold text-amber-100 mb-3'>Related APSP algorithms</h2>
        <ul className='text-sm text-gray-300 space-y-2 list-disc list-inside'>
          <li>
            <b>Johnson's algorithm</b> — <TeX tex='O(V^2 \\log V + VE)' />{' '}
            on sparse graphs. Uses Bellman–Ford once to reweight
            negative edges, then runs Dijkstra from each vertex on the
            non-negative graph.
          </li>
          <li>
            <b>Seidel's algorithm</b> — <TeX tex='O(V^\\omega \\log V)' />{' '}
            on unweighted undirected graphs via matrix multiplication.
            Theoretical breakthrough, rarely used in practice.
          </li>
          <li>
            <b>Warshall's transitive closure</b> — replace
            <TeX tex='+' /> and <TeX tex='\\min' /> with <TeX tex='\\lor' />{' '}
            and <TeX tex='\\land' />. Same algorithm computes
            "is there a path?" instead of "how short?".
          </li>
        </ul>
      </section>

      <RealWorldCard>
        <p>
          Small dense networks: airline route tables, road-network
          precomputation for a city with a few hundred landmarks,
          latency matrices in an intra-datacenter fabric. Also used
          inside the transitive closure of relations (reachability,
          regular expression → DFA construction, Warshall's original).
        </p>
        <p>
          Detect a negative cycle: if any diagonal entry
          <TeX tex='dist[i][i] < 0' /> after the algorithm finishes, the
          graph has one.
        </p>
      </RealWorldCard>
    </TopicShell>
  )
}
