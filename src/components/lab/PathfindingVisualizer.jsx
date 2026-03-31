import { useState, useRef, useCallback } from 'react'

const ROWS = 22, COLS = 48
const START = [11, 4], END = [11, 43]
const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]]

const initGrid = () =>
  Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) => ({ r, c, wall: false, state: 'idle', parent: null })))

const heuristic = ([r1, c1], [r2, c2]) => Math.abs(r1 - r2) + Math.abs(c1 - c2)
const sleep = ms => new Promise(res => setTimeout(res, ms))
const isStart = (r, c) => r === START[0] && c === START[1]
const isEnd = (r, c) => r === END[0] && c === END[1]

const PathfindingVisualizer = () => {
  const [grid, setGrid] = useState(initGrid)
  const [algo, setAlgo] = useState('A*')
  const [running, setRunning] = useState(false)
  const [stats, setStats] = useState({ visited: 0, pathLen: 0, found: null })
  const stopRef = useRef(false)
  const mouseDown = useRef(false)

  const upd = g => setGrid(g.map(row => [...row]))

  const reset = () => {
    stopRef.current = true
    setRunning(false)
    setGrid(initGrid())
    setStats({ visited: 0, pathLen: 0, found: null })
  }

  const toggleWall = (r, c) => {
    if (isStart(r, c) || isEnd(r, c) || running) return
    setGrid(g => {
      const ng = g.map(row => row.map(cell => ({ ...cell })))
      ng[r][c].wall = !ng[r][c].wall
      return ng
    })
  }

  const run = useCallback(async () => {
    stopRef.current = false
    setRunning(true)
    setStats({ visited: 0, pathLen: 0, found: null })

    const g = grid.map(row => row.map(cell => ({
      ...cell, state: cell.wall ? 'wall' : 'idle', parent: null, g: Infinity, f: Infinity,
    })))

    let visited = 0

    const tracePath = () => {
      let cur = [END[0], END[1]]
      let len = 0
      while (cur) {
        const [r, c] = cur
        if (!isStart(r, c) && !isEnd(r, c)) g[r][c].state = 'path'
        cur = g[r][c].parent
        len++
      }
      setStats({ visited, pathLen: len - 1, found: true })
      upd(g)
    }

    if (algo === 'A*') {
      const open = [[0, START[0], START[1]]]
      g[START[0]][START[1]].g = 0
      g[START[0]][START[1]].f = heuristic(START, END)

      while (open.length && !stopRef.current) {
        open.sort((a, b) => a[0] - b[0])
        const [, r, c] = open.shift()
        if (g[r][c].state === 'closed') continue
        if (!isStart(r, c) && !isEnd(r, c)) g[r][c].state = 'closed'
        visited++; setStats(s => ({ ...s, visited }))
        upd(g); await sleep(10)
        if (isEnd(r, c)) { tracePath(); setRunning(false); return }
        for (const [dr, dc] of DIRS) {
          const nr = r + dr, nc = c + dc
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue
          if (g[nr][nc].wall || g[nr][nc].state === 'closed') continue
          const ng = g[r][c].g + 1
          if (ng < g[nr][nc].g) {
            g[nr][nc].g = ng
            g[nr][nc].f = ng + heuristic([nr, nc], END)
            g[nr][nc].parent = [r, c]
            if (!isEnd(nr, nc)) g[nr][nc].state = 'open'
            open.push([g[nr][nc].f, nr, nc])
          }
        }
      }
    } else if (algo === 'BFS') {
      const queue = [[START[0], START[1]]]
      const seen = new Set([`${START[0]},${START[1]}`])
      while (queue.length && !stopRef.current) {
        const [r, c] = queue.shift()
        if (!isStart(r, c) && !isEnd(r, c)) g[r][c].state = 'closed'
        visited++; setStats(s => ({ ...s, visited }))
        upd(g); await sleep(14)
        if (isEnd(r, c)) { tracePath(); setRunning(false); return }
        for (const [dr, dc] of DIRS) {
          const nr = r + dr, nc = c + dc, key = `${nr},${nc}`
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || g[nr][nc].wall || seen.has(key)) continue
          seen.add(key); g[nr][nc].parent = [r, c]
          if (!isEnd(nr, nc)) g[nr][nc].state = 'open'
          queue.push([nr, nc])
        }
      }
    } else {
      const stack = [[START[0], START[1]]]
      const seen = new Set([`${START[0]},${START[1]}`])
      while (stack.length && !stopRef.current) {
        const [r, c] = stack.pop()
        if (!isStart(r, c) && !isEnd(r, c)) g[r][c].state = 'closed'
        visited++; setStats(s => ({ ...s, visited }))
        upd(g); await sleep(10)
        if (isEnd(r, c)) { tracePath(); setRunning(false); return }
        for (const [dr, dc] of DIRS) {
          const nr = r + dr, nc = c + dc, key = `${nr},${nc}`
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || g[nr][nc].wall || seen.has(key)) continue
          seen.add(key); g[nr][nc].parent = [r, c]
          if (!isEnd(nr, nc)) g[nr][nc].state = 'open'
          stack.push([nr, nc])
        }
      }
    }

    if (!stopRef.current) setStats(s => ({ ...s, found: false }))
    setRunning(false)
  }, [grid, algo])

  const cellBg = cell => {
    if (isStart(cell.r, cell.c)) return '#10b981'
    if (isEnd(cell.r, cell.c)) return '#f43f5e'
    if (cell.wall) return '#374151'
    return { idle: '#111827', open: '#1e3a5f', closed: '#1e40af55', path: '#fbbf24' }[cell.state] ?? '#111827'
  }

  return (
    <div className='bg-gray-900 rounded-xl p-6'>
      <div className='flex flex-wrap gap-2 mb-4 items-center'>
        {['A*', 'BFS', 'DFS'].map(a => (
          <button key={a} onClick={() => { if (!running) setAlgo(a) }}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all
              ${algo === a ? 'bg-cyan-500 text-black' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>
            {a}
          </button>
        ))}
        <span className='text-gray-600 text-xs ml-1'>click + drag grid to draw walls</span>
        <div className='ml-auto flex gap-2'>
          <button onClick={reset} disabled={running}
            className='px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700 disabled:opacity-40'>
            Reset
          </button>
          <button onClick={run} disabled={running}
            className='px-4 py-1.5 bg-cyan-500 text-black rounded-lg text-sm font-bold hover:bg-cyan-400 disabled:opacity-40'>
            {running ? 'Running…' : '▶ Visualize'}
          </button>
        </div>
      </div>

      <div className='rounded-lg overflow-hidden border border-gray-800 cursor-crosshair'
        onMouseDown={() => (mouseDown.current = true)}
        onMouseUp={() => (mouseDown.current = false)}
        onMouseLeave={() => (mouseDown.current = false)}>
        {grid.map((row, r) => (
          <div key={r} className='flex'>
            {row.map((cell, c) => (
              <div key={c}
                className='relative flex-1 transition-colors duration-75'
                style={{ paddingBottom: `${100 / COLS}%`, backgroundColor: cellBg(cell) }}
                onMouseDown={() => toggleWall(r, c)}
                onMouseEnter={() => { if (mouseDown.current) toggleWall(r, c) }}>
                {isStart(r, c) && (
                  <span className='absolute inset-0 flex items-center justify-center text-[7px] font-black text-black'>S</span>
                )}
                {isEnd(r, c) && (
                  <span className='absolute inset-0 flex items-center justify-center text-[7px] font-black text-white'>E</span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className='flex flex-wrap gap-x-6 gap-y-1 mt-4 text-sm text-gray-400 items-center'>
        <span>Visited: <strong className='text-cyan-400'>{stats.visited}</strong></span>
        <span>Path: <strong className='text-yellow-400'>{stats.pathLen || '—'}</strong> nodes</span>
        {stats.found === false && <span className='text-red-400 font-semibold'>No path found!</span>}
        <span className='ml-auto text-xs text-gray-500'>
          {algo === 'A*' && '✓ Optimal · Manhattan heuristic'}
          {algo === 'BFS' && '✓ Optimal · Explores layer by layer'}
          {algo === 'DFS' && '✗ Not optimal · Goes deep first'}
        </span>
      </div>

      <div className='flex gap-5 mt-2 text-xs text-gray-600'>
        {[['#10b981', 'Start'], ['#f43f5e', 'End'], ['#374151', 'Wall'], ['#1e40af55', 'Visited'], ['#fbbf24', 'Path']].map(([c, l]) => (
          <span key={l} className='flex items-center gap-1.5'>
            <span className='w-3 h-3 rounded-sm inline-block' style={{ background: c }} />{l}
          </span>
        ))}
      </div>
    </div>
  )
}

export default PathfindingVisualizer
