import { useState, useRef, useCallback } from 'react'

// ── Fibonacci ────────────────────────────────────────────────
function FibSection() {
  const [n, setN] = useState(8)
  const [table, setTable] = useState([])
  const [currentIdx, setCurrentIdx] = useState(-1)
  const [animating, setAnimating] = useState(false)
  const [done, setDone] = useState(false)
  const timersRef = useRef([])

  const clearTimers = () => { timersRef.current.forEach(t => clearTimeout(t)); timersRef.current = [] }

  const run = useCallback(() => {
    if (animating) return
    clearTimers()
    setDone(false)
    setCurrentIdx(-1)
    setTable([])
    const size = Math.min(n, 15)
    const dp = Array(size + 1).fill(0)
    dp[0] = 0
    if (size >= 1) dp[1] = 1
    for (let i = 2; i <= size; i++) dp[i] = dp[i - 1] + dp[i - 2]

    setAnimating(true)
    const steps = []
    for (let i = 0; i <= size; i++) {
      steps.push(dp.slice(0, i + 1))
    }
    steps.forEach((snap, i) => {
      const t = setTimeout(() => {
        setTable([...snap])
        setCurrentIdx(i)
        if (i === steps.length - 1) {
          const fin = setTimeout(() => { setAnimating(false); setDone(true); setCurrentIdx(-1) }, 400)
          timersRef.current.push(fin)
        }
      }, i * 300)
      timersRef.current.push(t)
    })
  }, [n, animating])

  return (
    <div className="space-y-4">
      <div className="bg-gray-800/50 rounded-lg p-3 text-xs font-mono text-purple-300 border border-gray-700">
        <span className="text-gray-400">Recurrence: </span>F(n) = F(n-1) + F(n-2), F(0)=0, F(1)=1
      </div>
      <div className="flex gap-3 items-center flex-wrap">
        <label className="text-sm text-gray-400">n =</label>
        <input type="number" value={n} onChange={e => setN(Math.min(15, Math.max(2, parseInt(e.target.value) || 2)))}
          className="bg-gray-800 border border-gray-700 text-yellow-300 px-2 py-1 rounded w-20 text-sm font-mono focus:outline-none focus:border-yellow-500" />
        <button onClick={run} disabled={animating}
          className="px-4 py-1.5 bg-yellow-700 hover:bg-yellow-600 disabled:opacity-50 text-white text-sm rounded-lg font-semibold transition-colors">
          {animating ? 'Running...' : 'Compute'}
        </button>
        <button onClick={() => { clearTimers(); setAnimating(false); setTable([]); setCurrentIdx(-1); setDone(false) }}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg font-semibold transition-colors">
          Reset
        </button>
      </div>

      {/* Memoization table */}
      <div className="overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {Array.from({ length: Math.min(n, 15) + 1 }, (_, i) => (
            <div key={i} className="flex flex-col items-center">
              <div className="text-xs text-gray-500 mb-1 font-mono">F({i})</div>
              <div className={`w-14 h-10 flex items-center justify-center rounded font-mono font-bold text-sm border transition-all duration-300 ${
                i < table.length
                  ? i === currentIdx
                    ? 'bg-yellow-600 border-yellow-400 text-white'
                    : done || i < currentIdx
                      ? 'bg-blue-800/70 border-blue-500 text-blue-200'
                      : 'bg-gray-700 border-gray-600 text-gray-400'
                  : 'bg-gray-800/40 border-gray-700 text-gray-600'
              }`}>
                {i < table.length ? table[i] : '?'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {done && table.length > 0 && (
        <div className="bg-green-900/30 border border-green-600/40 rounded-lg px-4 py-2 text-green-300 text-sm font-mono">
          F({Math.min(n, 15)}) = <span className="font-bold text-green-200">{table[table.length - 1]}</span>
        </div>
      )}
    </div>
  )
}

// ── LCS ─────────────────────────────────────────────────────
function LCSSection() {
  const [s1, setS1] = useState('ABCBDAB')
  const [s2, setS2] = useState('BDCAB')
  const [dpTable, setDpTable] = useState([])
  const [path, setPath] = useState([])
  const [current, setCurrent] = useState(null)
  const [animating, setAnimating] = useState(false)
  const [result, setResult] = useState(null)
  const timersRef = useRef([])

  const clearTimers = () => { timersRef.current.forEach(t => clearTimeout(t)); timersRef.current = [] }

  const run = useCallback(() => {
    if (animating) return
    clearTimers()
    setPath([])
    setCurrent(null)
    setResult(null)

    const a = s1.slice(0, 8).toUpperCase()
    const b = s2.slice(0, 8).toUpperCase()
    const m = a.length, nnLen = b.length
    const dp = Array(m + 1).fill(null).map(() => Array(nnLen + 1).fill(0))

    const steps = []
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= nnLen; j++) {
        if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1
        else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
        steps.push({ i, j, snap: dp.map(r => [...r]) })
      }
    }

    // Backtrack
    const pathSet = new Set()
    let i = m, j = nnLen
    const lcsChars = []
    while (i > 0 && j > 0) {
      if (a[i - 1] === b[j - 1]) {
        pathSet.add(`${i},${j}`)
        lcsChars.unshift(a[i - 1])
        i--; j--
      } else if (dp[i - 1][j] > dp[i][j - 1]) {
        i--
      } else {
        j--
      }
    }

    setAnimating(true)
    setDpTable(Array(m + 1).fill(null).map(() => Array(nnLen + 1).fill(null)))

    steps.forEach((step, idx) => {
      const t = setTimeout(() => {
        setDpTable(step.snap.map(r => [...r]))
        setCurrent(`${step.i},${step.j}`)
        if (idx === steps.length - 1) {
          const fin = setTimeout(() => {
            setDpTable(dp.map(r => [...r]))
            setPath([...pathSet])
            setCurrent(null)
            setResult(lcsChars.join(''))
            setAnimating(false)
          }, 350)
          timersRef.current.push(fin)
        }
      }, idx * 80)
      timersRef.current.push(t)
    })
  }, [s1, s2, animating])

  const a = s1.slice(0, 8).toUpperCase()
  const b = s2.slice(0, 8).toUpperCase()

  return (
    <div className="space-y-4">
      <div className="bg-gray-800/50 rounded-lg p-3 text-xs font-mono text-purple-300 border border-gray-700">
        <span className="text-gray-400">Recurrence: </span>
        dp[i][j] = dp[i-1][j-1]+1 if match, else max(dp[i-1][j], dp[i][j-1])
      </div>
      <div className="flex flex-wrap gap-3 items-center">
        <input value={s1} onChange={e => setS1(e.target.value.slice(0, 8))}
          className="bg-gray-800 border border-gray-700 text-cyan-300 px-2 py-1 rounded font-mono text-sm w-28 focus:outline-none focus:border-cyan-500" placeholder="String 1" />
        <input value={s2} onChange={e => setS2(e.target.value.slice(0, 8))}
          className="bg-gray-800 border border-gray-700 text-orange-300 px-2 py-1 rounded font-mono text-sm w-28 focus:outline-none focus:border-orange-500" placeholder="String 2" />
        <button onClick={run} disabled={animating}
          className="px-4 py-1.5 bg-yellow-700 hover:bg-yellow-600 disabled:opacity-50 text-white text-sm rounded-lg font-semibold transition-colors">
          {animating ? 'Running...' : 'Compute LCS'}
        </button>
        <button onClick={() => { clearTimers(); setAnimating(false); setDpTable([]); setPath([]); setCurrent(null); setResult(null) }}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors text-sm font-semibold">
          Reset
        </button>
      </div>

      {dpTable.length > 0 && (
        <div className="overflow-x-auto">
          <table className="border-collapse text-xs font-mono">
            <thead>
              <tr>
                <td className="w-8 h-8" />
                <td className="w-8 h-8 text-center text-gray-500">ε</td>
                {b.split('').map((c, j) => (
                  <td key={j} className="w-8 h-8 text-center text-orange-400 font-bold">{c}</td>
                ))}
              </tr>
            </thead>
            <tbody>
              {dpTable.map((row, i) => (
                <tr key={i}>
                  <td className="w-8 h-8 text-center text-cyan-400 font-bold">{i === 0 ? 'ε' : a[i - 1]}</td>
                  {row.map((val, j) => {
                    const key = `${i},${j}`
                    const isCurrent = current === key
                    const isPath = path.includes(key) && i > 0 && j > 0
                    return (
                      <td key={j} className={`w-8 h-8 text-center border border-gray-700/50 transition-all duration-200 font-bold ${
                        isCurrent ? 'bg-yellow-600 text-white' :
                        isPath ? 'bg-orange-700/70 text-orange-200' :
                        val !== null && val > 0 ? 'bg-blue-900/50 text-blue-300' :
                        val === 0 ? 'bg-gray-800/40 text-gray-600' :
                        'bg-gray-900/30 text-gray-700'
                      }`}>
                        {val !== null ? val : ''}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result !== null && (
        <div className="bg-green-900/30 border border-green-600/40 rounded-lg px-4 py-2 text-green-300 text-sm font-mono">
          LCS = <span className="font-bold text-green-200">"{result}"</span>
          <span className="text-gray-400 ml-2">length: {result.length}</span>
        </div>
      )}
    </div>
  )
}

// ── 0/1 Knapsack ────────────────────────────────────────────
function KnapsackSection() {
  const defaultItems = [
    { w: 2, v: 6 }, { w: 2, v: 10 }, { w: 3, v: 12 }, { w: 5, v: 20 }, { w: 1, v: 3 }
  ]
  const [items] = useState(defaultItems)
  const [capacity, setCapacity] = useState(8)
  const [dpTable, setDpTable] = useState([])
  const [selected, setSelected] = useState([])
  const [current, setCurrent] = useState(null)
  const [animating, setAnimating] = useState(false)
  const [result, setResult] = useState(null)
  const timersRef = useRef([])

  const clearTimers = () => { timersRef.current.forEach(t => clearTimeout(t)); timersRef.current = [] }

  const run = useCallback(() => {
    if (animating) return
    clearTimers()
    setSelected([])
    setCurrent(null)
    setResult(null)

    const W = Math.min(capacity, 15)
    const n = items.length
    const dp = Array(n + 1).fill(null).map(() => Array(W + 1).fill(0))
    const steps = []

    for (let i = 1; i <= n; i++) {
      for (let w = 0; w <= W; w++) {
        const item = items[i - 1]
        if (item.w <= w) {
          dp[i][w] = Math.max(dp[i - 1][w], dp[i - 1][w - item.w] + item.v)
        } else {
          dp[i][w] = dp[i - 1][w]
        }
        steps.push({ i, w, snap: dp.map(r => [...r]) })
      }
    }

    // Backtrack
    const sel = []
    let i = n, w = W
    while (i > 0 && w > 0) {
      if (dp[i][w] !== dp[i - 1][w]) {
        sel.push(i - 1)
        w -= items[i - 1].w
      }
      i--
    }

    setAnimating(true)
    setDpTable(Array(n + 1).fill(null).map(() => Array(W + 1).fill(null)))

    steps.forEach((step, idx) => {
      const t = setTimeout(() => {
        setDpTable(step.snap.map(r => [...r]))
        setCurrent(`${step.i},${step.w}`)
        if (idx === steps.length - 1) {
          const fin = setTimeout(() => {
            setDpTable(dp.map(r => [...r]))
            setSelected(sel)
            setCurrent(null)
            setResult(dp[n][W])
            setAnimating(false)
          }, 350)
          timersRef.current.push(fin)
        }
      }, idx * 60)
      timersRef.current.push(t)
    })
  }, [items, capacity, animating])

  const W = Math.min(capacity, 15)

  return (
    <div className="space-y-4">
      <div className="bg-gray-800/50 rounded-lg p-3 text-xs font-mono text-purple-300 border border-gray-700">
        <span className="text-gray-400">Recurrence: </span>
        dp[i][w] = max(dp[i-1][w], dp[i-1][w-wt[i]] + val[i]) if wt[i] ≤ w
      </div>

      {/* Items table */}
      <div className="flex flex-wrap gap-2 text-xs">
        {items.map((item, i) => (
          <div key={i} className={`px-3 py-1.5 rounded-lg border font-mono transition-all ${
            selected.includes(i) ? 'bg-green-800/50 border-green-500 text-green-300' : 'bg-gray-800 border-gray-700 text-gray-400'
          }`}>
            Item {i + 1}: w={item.w}, v={item.v}
            {selected.includes(i) && <span className="ml-1 text-green-400">✓</span>}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <label className="text-sm text-gray-400">Capacity:</label>
        <input type="number" value={capacity}
          onChange={e => setCapacity(Math.min(15, Math.max(1, parseInt(e.target.value) || 1)))}
          className="bg-gray-800 border border-gray-700 text-yellow-300 px-2 py-1 rounded w-20 text-sm font-mono focus:outline-none focus:border-yellow-500" />
        <button onClick={run} disabled={animating}
          className="px-4 py-1.5 bg-yellow-700 hover:bg-yellow-600 disabled:opacity-50 text-white text-sm rounded-lg font-semibold transition-colors">
          {animating ? 'Running...' : 'Solve'}
        </button>
        <button onClick={() => { clearTimers(); setAnimating(false); setDpTable([]); setSelected([]); setCurrent(null); setResult(null) }}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg font-semibold transition-colors">
          Reset
        </button>
      </div>

      {dpTable.length > 0 && (
        <div className="overflow-x-auto">
          <table className="border-collapse text-xs font-mono">
            <thead>
              <tr>
                <td className="w-14 h-7 px-1 text-gray-500">item\W</td>
                {Array.from({ length: W + 1 }, (_, j) => (
                  <td key={j} className="w-9 h-7 text-center text-gray-500">{j}</td>
                ))}
              </tr>
            </thead>
            <tbody>
              {dpTable.map((row, i) => (
                <tr key={i}>
                  <td className="px-1 text-cyan-400 font-bold">
                    {i === 0 ? '∅' : `i${i}(w${items[i-1].w},v${items[i-1].v})`}
                  </td>
                  {row.map((val, j) => {
                    const key = `${i},${j}`
                    const isCurrent = current === key
                    return (
                      <td key={j} className={`w-9 h-7 text-center border border-gray-700/50 transition-all duration-200 ${
                        isCurrent ? 'bg-yellow-600 text-white font-bold' :
                        val !== null && val > 0 ? 'bg-blue-900/50 text-blue-300' :
                        val === 0 ? 'bg-gray-800/40 text-gray-600' :
                        'bg-gray-900/30 text-gray-700'
                      }`}>
                        {val !== null ? val : ''}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result !== null && (
        <div className="bg-green-900/30 border border-green-600/40 rounded-lg px-4 py-2 text-green-300 text-sm font-mono">
          Max value = <span className="font-bold text-green-200">{result}</span>
          {selected.length > 0 && (
            <span className="text-gray-400 ml-2">
              (Items: {selected.map(i => i + 1).join(', ')})
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────
const TABS = [
  { id: 'fib', label: 'Fibonacci', subtitle: 'Memoization' },
  { id: 'lcs', label: 'LCS', subtitle: '2D Table' },
  { id: 'knapsack', label: '0/1 Knapsack', subtitle: 'Item Selection' },
]

export default function DPVisualizer() {
  const [tab, setTab] = useState('fib')

  return (
    <div className="bg-gray-900 rounded-xl p-5 text-white select-none">
      {/* Tab bar */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === t.id
                ? 'bg-yellow-600 text-white shadow-lg shadow-yellow-900/30'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
            }`}>
            {t.label}
            <span className="ml-1.5 text-xs opacity-70">{t.subtitle}</span>
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-4 text-xs">
        {[
          { color: 'bg-gray-700', label: 'Unfilled' },
          { color: 'bg-yellow-600', label: 'Current' },
          { color: 'bg-blue-800', label: 'Filled' },
          { color: 'bg-orange-700', label: 'Path' },
          { color: 'bg-green-800', label: 'Selected' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`w-3.5 h-3.5 rounded ${color}`} />
            <span className="text-gray-400">{label}</span>
          </div>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'fib' && <FibSection />}
      {tab === 'lcs' && <LCSSection />}
      {tab === 'knapsack' && <KnapsackSection />}
    </div>
  )
}
