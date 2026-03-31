import { useState, useRef, useCallback } from 'react'

const ALGOS = ['Bubble', 'Selection', 'Insertion', 'Quick', 'Merge']
const N = 70

const genBars = () =>
  Array.from({ length: N }, () => ({ val: Math.floor(Math.random() * 95) + 5, state: 'idle' }))

const sleep = ms => new Promise(r => setTimeout(r, ms))

const COMPLEXITY = {
  Bubble:    { time: 'O(n²)',      space: 'O(1)',       note: 'Stable · Simple' },
  Selection: { time: 'O(n²)',      space: 'O(1)',       note: 'Unstable · Simple' },
  Insertion: { time: 'O(n²)',      space: 'O(1)',       note: 'Stable · Good for small n' },
  Quick:     { time: 'O(n log n)', space: 'O(log n)',   note: 'Unstable · Fast in practice' },
  Merge:     { time: 'O(n log n)', space: 'O(n)',       note: 'Stable · Divide & conquer' },
}

const SortingVisualizer = () => {
  const [bars, setBars] = useState(genBars)
  const [algo, setAlgo] = useState('Bubble')
  const [running, setRunning] = useState(false)
  const [speed, setSpeed] = useState(60)
  const [stats, setStats] = useState({ comparisons: 0, swaps: 0 })
  const stopRef = useRef(false)

  const reset = () => {
    stopRef.current = true
    setRunning(false)
    setBars(genBars())
    setStats({ comparisons: 0, swaps: 0 })
  }

  const run = useCallback(async () => {
    stopRef.current = false
    setRunning(true)
    const arr = bars.map(b => ({ ...b, state: 'idle' }))
    let comps = 0, swps = 0
    const delay = () => sleep(Math.max(2, 110 - speed))
    const upd = () => setBars([...arr])
    const swap = (i, j) => { ;[arr[i], arr[j]] = [arr[j], arr[i]]; swps++; setStats(s => ({ ...s, swaps: swps })) }
    const cmp = () => { comps++; setStats(s => ({ ...s, comparisons: comps })) }

    if (algo === 'Bubble') {
      for (let i = 0; i < arr.length && !stopRef.current; i++) {
        for (let j = 0; j < arr.length - i - 1 && !stopRef.current; j++) {
          arr[j].state = 'comparing'; arr[j + 1].state = 'comparing'
          upd(); await delay(); cmp()
          if (arr[j].val > arr[j + 1].val) swap(j, j + 1)
          arr[j].state = 'idle'; arr[j + 1].state = 'idle'
        }
        arr[arr.length - i - 1].state = 'sorted'; upd()
      }
    } else if (algo === 'Selection') {
      for (let i = 0; i < arr.length && !stopRef.current; i++) {
        let min = i; arr[i].state = 'pivot'
        for (let j = i + 1; j < arr.length && !stopRef.current; j++) {
          arr[j].state = 'comparing'; upd(); await delay(); cmp()
          if (arr[j].val < arr[min].val) { if (min !== i) arr[min].state = 'idle'; min = j } else arr[j].state = 'idle'
        }
        if (min !== i) swap(i, min)
        arr[i].state = 'sorted'; if (min !== i) arr[min].state = 'idle'; upd()
      }
    } else if (algo === 'Insertion') {
      arr[0].state = 'sorted'
      for (let i = 1; i < arr.length && !stopRef.current; i++) {
        let j = i; arr[j].state = 'comparing'
        while (j > 0 && arr[j].val < arr[j - 1].val && !stopRef.current) {
          upd(); await delay(); cmp(); swap(j, j - 1)
          arr[j].state = 'sorted'; j--; arr[j].state = 'comparing'
        }
        arr[j].state = 'sorted'; upd()
      }
    } else if (algo === 'Quick') {
      const qs = async (lo, hi) => {
        if (lo >= hi || stopRef.current) return
        const pivot = arr[hi].val; arr[hi].state = 'pivot'; let i = lo - 1
        for (let j = lo; j < hi && !stopRef.current; j++) {
          arr[j].state = 'comparing'; upd(); await delay(); cmp()
          if (arr[j].val <= pivot) { i++; swap(i, j) }
          arr[j].state = 'idle'
        }
        swap(i + 1, hi); arr[i + 1].state = 'sorted'; arr[hi].state = 'idle'; upd()
        await qs(lo, i); await qs(i + 2, hi)
      }
      await qs(0, arr.length - 1)
    } else if (algo === 'Merge') {
      const mg = async (lo, hi) => {
        if (lo >= hi || stopRef.current) return
        const mid = (lo + hi) >> 1
        await mg(lo, mid); await mg(mid + 1, hi)
        const L = arr.slice(lo, mid + 1).map(x => x.val)
        const R = arr.slice(mid + 1, hi + 1).map(x => x.val)
        let i = 0, j = 0, k = lo
        while (i < L.length && j < R.length && !stopRef.current) {
          arr[k].state = 'comparing'; upd(); await delay(); cmp()
          arr[k].val = L[i] <= R[j] ? L[i++] : (swps++, setStats(s => ({ ...s, swaps: swps })), R[j++])
          arr[k].state = 'sorted'; k++
        }
        while (i < L.length && !stopRef.current) { arr[k].val = L[i++]; arr[k].state = 'sorted'; k++ }
        while (j < R.length && !stopRef.current) { arr[k].val = R[j++]; arr[k].state = 'sorted'; k++ }
        upd()
      }
      await mg(0, arr.length - 1)
    }

    if (!stopRef.current) { arr.forEach(b => (b.state = 'sorted')); upd() }
    setRunning(false)
  }, [bars, algo, speed])

  const color = s => ({ idle: '#1d4ed8', comparing: '#fbbf24', sorted: '#10b981', pivot: '#f43f5e' }[s] ?? '#1d4ed8')
  const cx = COMPLEXITY[algo]

  return (
    <div className='bg-gray-900 rounded-xl p-6'>
      <div className='flex flex-wrap gap-2 mb-5 items-center'>
        {ALGOS.map(a => (
          <button key={a} onClick={() => { if (!running) { setAlgo(a); reset() } }}
            disabled={running && algo !== a}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all
              ${algo === a ? 'bg-cyan-500 text-black' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>
            {a} Sort
          </button>
        ))}
        <div className='ml-auto flex items-center gap-2 text-xs text-gray-400'>
          Speed <input type='range' min={5} max={100} value={speed} onChange={e => setSpeed(+e.target.value)}
            disabled={running} className='w-20 accent-cyan-500' />
        </div>
        <button onClick={reset} disabled={running}
          className='px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700 disabled:opacity-40'>
          Shuffle
        </button>
        <button onClick={running ? () => { stopRef.current = true; setRunning(false) } : run}
          className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all
            ${running ? 'bg-red-500 text-white hover:bg-red-400' : 'bg-cyan-500 text-black hover:bg-cyan-400'}`}>
          {running ? '■ Stop' : '▶ Sort'}
        </button>
      </div>

      <div className='flex items-end gap-px rounded-lg overflow-hidden' style={{ height: '260px' }}>
        {bars.map((b, i) => (
          <div key={i} className='flex-1 rounded-t-sm'
            style={{ height: `${b.val}%`, backgroundColor: color(b.state), transition: 'height 0.04s' }} />
        ))}
      </div>

      <div className='flex flex-wrap gap-x-6 gap-y-1 mt-4 text-sm text-gray-400 items-center'>
        <span>Comparisons: <strong className='text-cyan-400'>{stats.comparisons.toLocaleString()}</strong></span>
        <span>Swaps: <strong className='text-yellow-400'>{stats.swaps.toLocaleString()}</strong></span>
        <span className='ml-auto text-xs text-gray-500'>
          Time: <span className='text-white'>{cx.time}</span> · Space: <span className='text-white'>{cx.space}</span> · {cx.note}
        </span>
      </div>

      <div className='flex gap-5 mt-3 text-xs text-gray-500'>
        {[['#1d4ed8', 'Unsorted'], ['#fbbf24', 'Comparing'], ['#10b981', 'Sorted'], ['#f43f5e', 'Pivot']].map(([c, l]) => (
          <span key={l} className='flex items-center gap-1.5'>
            <span className='w-3 h-3 rounded-sm inline-block' style={{ background: c }} />{l}
          </span>
        ))}
      </div>
    </div>
  )
}

export default SortingVisualizer
