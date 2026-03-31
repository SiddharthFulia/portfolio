import { useState, useRef, useCallback, useEffect } from 'react'

const ROWS = 45, COLS = 90
const CELL = 10

const empty = () => Array.from({ length: ROWS }, () => new Uint8Array(COLS))
const rand = () => Array.from({ length: ROWS }, () => Uint8Array.from({ length: COLS }, () => (Math.random() > 0.72 ? 1 : 0)))

const tick = grid => {
  const next = empty()
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      let n = 0
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue
          n += grid[(r + dr + ROWS) % ROWS][(c + dc + COLS) % COLS]
        }
      next[r][c] = grid[r][c] ? (n === 2 || n === 3 ? 1 : 0) : (n === 3 ? 1 : 0)
    }
  }
  return next
}

// Preset patterns
const PRESETS = {
  Glider: { r: 5, c: 5, cells: [[0,1],[1,2],[2,0],[2,1],[2,2]] },
  Pulsar: { r: 8, c: 8, cells: [
    [0,2],[0,3],[0,4],[0,8],[0,9],[0,10],
    [2,0],[2,5],[2,7],[2,12],[3,0],[3,5],[3,7],[3,12],
    [4,0],[4,5],[4,7],[4,12],[4,2],[4,3],[4,4],[4,8],[4,9],[4,10],
    [6,2],[6,3],[6,4],[6,8],[6,9],[6,10],
    [7,0],[7,5],[7,7],[7,12],[8,0],[8,5],[8,7],[8,12],
    [9,0],[9,5],[9,7],[9,12],[9,2],[9,3],[9,4],[9,8],[9,9],[9,10],
    [11,2],[11,3],[11,4],[11,8],[11,9],[11,10],
  ]},
  'R-Pentomino': { r: 20, c: 44, cells: [[0,1],[0,2],[1,0],[1,1],[2,1]] },
}

const GameOfLife = () => {
  const [grid, setGrid] = useState(rand)
  const [running, setRunning] = useState(false)
  const [gen, setGen] = useState(0)
  const [speed, setSpeed] = useState(60)
  const runRef = useRef(false)
  const speedRef = useRef(60)
  speedRef.current = speed
  const canvasRef = useRef()
  const mouseDown = useRef(false)

  // Draw grid on canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#030712'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c]) {
          const age = grid[r][c]
          ctx.fillStyle = '#22d3ee'
          ctx.fillRect(c * CELL + 1, r * CELL + 1, CELL - 1, CELL - 1)
        }
      }
    }
  }, [grid])

  const runGame = useCallback(() => {
    if (!runRef.current) return
    setGrid(g => tick(g))
    setGen(n => n + 1)
    setTimeout(runGame, Math.max(20, 220 - speedRef.current * 2))
  }, [])

  const toggleRun = () => {
    setRunning(r => {
      runRef.current = !r
      if (!r) setTimeout(runGame, 0)
      return !r
    })
  }

  const clearGrid = () => {
    runRef.current = false; setRunning(false); setGrid(empty()); setGen(0)
  }
  const randomize = () => {
    runRef.current = false; setRunning(false); setGrid(rand()); setGen(0)
  }
  const stepOnce = () => {
    if (running) return
    setGrid(g => tick(g)); setGen(n => n + 1)
  }

  const addPreset = name => {
    const { r, c, cells } = PRESETS[name]
    setGrid(g => {
      const ng = g.map(row => new Uint8Array(row))
      cells.forEach(([dr, dc]) => { ng[r + dr][c + dc] = 1 })
      return ng
    })
  }

  const handleCanvasClick = e => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY
    const c = Math.floor(x / CELL), r = Math.floor(y / CELL)
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
      setGrid(g => {
        const ng = g.map(row => new Uint8Array(row))
        ng[r][c] = ng[r][c] ? 0 : 1
        return ng
      })
    }
  }

  const handleCanvasMove = e => {
    if (!mouseDown.current) return
    handleCanvasClick(e)
  }

  const population = grid.reduce((sum, row) => sum + row.reduce((a, b) => a + b, 0), 0)

  return (
    <div className='bg-gray-900 rounded-xl p-6'>
      <div className='flex flex-wrap gap-2 mb-4 items-center'>
        <button onClick={toggleRun}
          className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all
            ${running ? 'bg-red-500 text-white hover:bg-red-400' : 'bg-cyan-500 text-black hover:bg-cyan-400'}`}>
          {running ? '⏸ Pause' : '▶ Play'}
        </button>
        <button onClick={stepOnce} disabled={running}
          className='px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700 disabled:opacity-40'>
          Step
        </button>
        <button onClick={randomize} className='px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700'>
          Random
        </button>
        <button onClick={clearGrid} className='px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700'>
          Clear
        </button>

        <div className='w-px h-5 bg-gray-700' />

        {Object.keys(PRESETS).map(name => (
          <button key={name} onClick={() => addPreset(name)}
            className='px-3 py-1.5 bg-gray-800 text-gray-400 rounded-lg text-xs hover:bg-gray-700 hover:text-gray-200'>
            + {name}
          </button>
        ))}

        <div className='flex items-center gap-2 text-xs text-gray-400 ml-auto'>
          Speed <input type='range' min={1} max={100} value={speed}
            onChange={e => setSpeed(+e.target.value)} className='w-20 accent-cyan-500' />
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={COLS * CELL}
        height={ROWS * CELL}
        className='rounded-lg w-full cursor-crosshair'
        style={{ imageRendering: 'pixelated' }}
        onClick={handleCanvasClick}
        onMouseMove={handleCanvasMove}
        onMouseDown={() => (mouseDown.current = true)}
        onMouseUp={() => (mouseDown.current = false)}
        onMouseLeave={() => (mouseDown.current = false)}
        onTouchStart={e => { e.preventDefault(); mouseDown.current = true; handleCanvasClick(e.touches[0]) }}
        onTouchMove={e => { e.preventDefault(); handleCanvasClick(e.touches[0]) }}
        onTouchEnd={() => (mouseDown.current = false)}
      />

      <div className='flex flex-wrap gap-x-6 mt-3 text-sm text-gray-400 items-center'>
        <span>Generation: <strong className='text-cyan-400'>{gen.toLocaleString()}</strong></span>
        <span>Population: <strong className='text-emerald-400'>{population.toLocaleString()}</strong></span>
        <span className='ml-auto text-xs text-gray-600'>
          3 rules · Birth on 3 neighbours · Survival on 2–3 · Death otherwise
        </span>
      </div>
    </div>
  )
}

export default GameOfLife
