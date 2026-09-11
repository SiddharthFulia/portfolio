// SnakeAi.jsx — genetic algorithm self-play snake.
// Population of 20 snakes running in parallel on their own tiny boards.
// Each snake carries a small 2-layer neural net (input: 8-direction
// vision + food angle, output: 4 moves). At the end of a generation we
// select top-K parents by fitness, crossover their weights, and mutate.
// The best-so-far snake gets a big centered board with its weights shown
// as a heatmap. Real GA — no fake randomness masquerading as "AI".

import { useCallback, useEffect, useRef, useState } from 'react'
import GameShell from '../../components/arcade/GameShell'
import { getSfx } from '../../components/arcade/sfx'

// ── Neural net (2 layers, dense, tanh + softmax) ─────────────
// Input:  24 features
//   for each of 8 directions: distance to wall (1/d), sees food (0/1), sees self (0/1)
// Hidden: 12 tanh
// Output: 4 (up, right, down, left) — argmax

const INPUT = 24
const HIDDEN = 12
const OUTPUT = 4
const W1_SIZE = INPUT * HIDDEN     // 288
const B1_SIZE = HIDDEN             // 12
const W2_SIZE = HIDDEN * OUTPUT    // 48
const B2_SIZE = OUTPUT             // 4
const GENOME = W1_SIZE + B1_SIZE + W2_SIZE + B2_SIZE

const POP = 20
const BOARD = 15
const CELL_MINI = 12
const CELL_HERO = 22
const MAX_STEPS = 220     // steps without food before starve

function randomGenome() {
  const g = new Float32Array(GENOME)
  for (let i = 0; i < GENOME; i++) g[i] = (Math.random() * 2 - 1) * 0.7
  return g
}

function crossover(a, b) {
  const c = new Float32Array(GENOME)
  const cut = Math.floor(Math.random() * GENOME)
  for (let i = 0; i < GENOME; i++) c[i] = i < cut ? a[i] : b[i]
  return c
}

function mutate(g, rate = 0.04, sigma = 0.35) {
  for (let i = 0; i < g.length; i++) {
    if (Math.random() < rate) {
      g[i] += (Math.random() * 2 - 1) * sigma
      if (g[i] > 1.5) g[i] = 1.5
      if (g[i] < -1.5) g[i] = -1.5
    }
  }
  return g
}

// Forward pass — returns argmax index in [0..3]
const _hidden = new Float32Array(HIDDEN)
const _out = new Float32Array(OUTPUT)
function forward(genome, input) {
  // Layer 1: hidden = tanh(input @ W1 + b1)
  for (let h = 0; h < HIDDEN; h++) {
    let sum = genome[W1_SIZE + h] // bias1
    for (let i = 0; i < INPUT; i++) {
      sum += input[i] * genome[i * HIDDEN + h]
    }
    _hidden[h] = Math.tanh(sum)
  }
  // Layer 2: out = hidden @ W2 + b2
  const w2Off = W1_SIZE + B1_SIZE
  const b2Off = w2Off + W2_SIZE
  for (let o = 0; o < OUTPUT; o++) {
    let sum = genome[b2Off + o]
    for (let h = 0; h < HIDDEN; h++) {
      sum += _hidden[h] * genome[w2Off + h * OUTPUT + o]
    }
    _out[o] = sum
  }
  // Argmax
  let bestI = 0, bestV = _out[0]
  for (let o = 1; o < OUTPUT; o++) if (_out[o] > bestV) { bestV = _out[o]; bestI = o }
  return bestI
}

// Direction vectors: [dx, dy]
const DIRS = [
  [0, -1], [1, -1], [1, 0], [1, 1],
  [0, 1], [-1, 1], [-1, 0], [-1, -1],
]

// Move vectors for output actions (up, right, down, left)
const MOVES = [[0,-1],[1,0],[0,1],[-1,0]]

// Encode the snake state as INPUT floats.
function encode(snake, food) {
  const input = new Float32Array(INPUT)
  const head = snake.body[0]
  const bodySet = new Set(snake.body.slice(1).map(([x,y]) => x*100 + y))
  for (let d = 0; d < 8; d++) {
    const [dx, dy] = DIRS[d]
    let step = 1
    let sawFood = 0
    let sawSelf = 0
    while (true) {
      const x = head[0] + dx * step
      const y = head[1] + dy * step
      if (x < 0 || y < 0 || x >= BOARD || y >= BOARD) break
      if (x === food[0] && y === food[1]) sawFood = 1
      if (bodySet.has(x*100 + y) && !sawSelf) sawSelf = 1
      step++
    }
    input[d*3 + 0] = 1 / step        // wall distance (closer = larger)
    input[d*3 + 1] = sawFood
    input[d*3 + 2] = sawSelf
  }
  return input
}

function newSnake(genome) {
  const start = Math.floor(BOARD / 2)
  return {
    genome,
    body: [[start, start], [start-1, start], [start-2, start]],
    dir: 1,          // right
    food: [Math.floor(Math.random() * BOARD), Math.floor(Math.random() * BOARD)],
    alive: true,
    steps: 0,
    stepsSinceFood: 0,
    score: 0,
    fitness: 0,
  }
}

function stepSnake(s) {
  if (!s.alive) return
  const input = encode(s, s.food)
  const action = forward(s.genome, input)
  // Prevent 180° reversal on the fly — if opposite direction, keep current.
  const opp = (s.dir + 2) % 4
  const newDir = action === opp ? s.dir : action
  s.dir = newDir
  const [dx, dy] = MOVES[newDir]
  const head = s.body[0]
  const nx = head[0] + dx, ny = head[1] + dy
  if (nx < 0 || ny < 0 || nx >= BOARD || ny >= BOARD) { s.alive = false; return }
  for (let i = 0; i < s.body.length; i++) if (s.body[i][0] === nx && s.body[i][1] === ny) { s.alive = false; return }
  s.body.unshift([nx, ny])
  if (nx === s.food[0] && ny === s.food[1]) {
    s.score += 1
    s.stepsSinceFood = 0
    // New food
    let placed = false
    for (let tries = 0; tries < 100; tries++) {
      const fx = Math.floor(Math.random() * BOARD)
      const fy = Math.floor(Math.random() * BOARD)
      const on = s.body.some(([bx, by]) => bx === fx && by === fy)
      if (!on) { s.food = [fx, fy]; placed = true; break }
    }
    if (!placed) { s.alive = false; return }
  } else {
    s.body.pop()
  }
  s.steps++
  s.stepsSinceFood++
  if (s.stepsSinceFood > MAX_STEPS) s.alive = false
}

function fitness(s) {
  // Reward score exponentially, shave off wandering
  return Math.pow(2, s.score) + s.steps * 0.02 - s.stepsSinceFood * 0.005
}

// ── Component ─────────────────────────────────────────────────
export default function SnakeAi() {
  const canvasRef = useRef(null)
  const sfxRef = useRef(getSfx())

  const [soundOn, setSoundOn] = useState(true)
  const [generation, setGeneration] = useState(1)
  const [bestScore, setBestScore] = useState(0)
  const [avgScore, setAvgScore] = useState(0)
  const [bestEver, setBestEver] = useState(0)
  const [speed, setSpeed] = useState(4)      // steps per frame multiplier
  const [status, setStatus] = useState('playing')

  useEffect(() => { sfxRef.current.setEnabled(soundOn) }, [soundOn])
  useEffect(() => { try { setBestEver(Number(localStorage.getItem('sid-snake-best') || 0)) } catch {} }, [])

  const stateRef = useRef(null)

  const reset = useCallback(() => {
    const pop = []
    for (let i = 0; i < POP; i++) pop.push(newSnake(randomGenome()))
    stateRef.current = {
      pop, gen: 1, paused: false,
      history: [],       // last N generations best score
      bestGenomeEver: pop[0].genome, bestScoreEver: 0,
      accum: 0,
    }
    setGeneration(1); setBestScore(0); setAvgScore(0); setStatus('playing')
  }, [])

  useEffect(() => { reset() }, [reset])

  const advanceGeneration = () => {
    const s = stateRef.current
    // Score fitness
    for (const snake of s.pop) snake.fitness = fitness(snake)
    s.pop.sort((a, b) => b.fitness - a.fitness)
    const best = s.pop[0]
    const avg = s.pop.reduce((a, b) => a + b.score, 0) / s.pop.length
    setBestScore(best.score)
    setAvgScore(avg)
    if (best.score > s.bestScoreEver) {
      s.bestScoreEver = best.score
      s.bestGenomeEver = new Float32Array(best.genome)
      try {
        if (best.score > bestEver) { localStorage.setItem('sid-snake-best', String(best.score)); setBestEver(best.score) }
      } catch {}
      if (best.score >= 20) sfxRef.current.win()
    }
    s.history.push(best.score)
    if (s.history.length > 40) s.history.shift()
    // Selection — top 6 as parents
    const parents = s.pop.slice(0, 6).map((s) => s.genome)
    // Elitism — 2 top clones survive
    const nextPop = [
      newSnake(new Float32Array(s.pop[0].genome)),
      newSnake(new Float32Array(s.pop[1].genome)),
    ]
    while (nextPop.length < POP) {
      const a = parents[Math.floor(Math.random() * parents.length)]
      const b = parents[Math.floor(Math.random() * parents.length)]
      const child = mutate(crossover(a, b))
      nextPop.push(newSnake(child))
    }
    s.pop = nextPop
    s.gen++
    setGeneration(s.gen)
  }

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    // Layout: 4 columns × 5 rows of mini boards on the right,
    // one big hero board on the left showing the best snake.
    const heroSize = BOARD * CELL_HERO
    const miniSize = BOARD * CELL_MINI
    const cols = 4
    const rows = 5
    const gap = 6
    const gridW = cols * miniSize + (cols - 1) * gap
    const totalW = heroSize + 20 + gridW
    const totalH = Math.max(heroSize + 130, rows * miniSize + (rows - 1) * gap)
    canvas.width = totalW * dpr
    canvas.height = totalH * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    let raf = 0
    let last = performance.now()

    const step = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const s = stateRef.current
      if (!s || s.paused) { draw(); raf = requestAnimationFrame(step); return }
      s.accum += dt
      // Run `speed` snake steps per frame across the population
      const iters = Math.floor(s.accum * 20 * speed)
      s.accum -= iters / (20 * speed)
      for (let i = 0; i < iters; i++) {
        let anyAlive = false
        for (const snake of s.pop) {
          if (snake.alive) { stepSnake(snake); anyAlive = true }
        }
        if (!anyAlive) { advanceGeneration(); break }
      }
      draw()
      raf = requestAnimationFrame(step)
    }

    const drawBoard = (snake, x, y, cell) => {
      // Background
      ctx.fillStyle = '#0e1216'
      ctx.fillRect(x, y, BOARD * cell, BOARD * cell)
      ctx.strokeStyle = snake.alive ? '#1e293b' : '#7f1d1d'
      ctx.lineWidth = 1
      ctx.strokeRect(x + 0.5, y + 0.5, BOARD * cell - 1, BOARD * cell - 1)
      // Grid subtle
      if (cell >= 16) {
        ctx.strokeStyle = 'rgba(255,255,255,0.03)'
        for (let g = 1; g < BOARD; g++) {
          ctx.beginPath(); ctx.moveTo(x + g * cell, y); ctx.lineTo(x + g * cell, y + BOARD*cell); ctx.stroke()
          ctx.beginPath(); ctx.moveTo(x, y + g * cell); ctx.lineTo(x + BOARD*cell, y + g * cell); ctx.stroke()
        }
      }
      // Food
      ctx.fillStyle = '#ef4444'
      const [fx, fy] = snake.food
      ctx.beginPath(); ctx.arc(x + fx*cell + cell/2, y + fy*cell + cell/2, cell*0.4, 0, Math.PI*2); ctx.fill()
      // Body
      for (let i = snake.body.length - 1; i >= 0; i--) {
        const [bx, by] = snake.body[i]
        const t = 1 - i / Math.max(1, snake.body.length - 1)
        const hue = 140 + t * 40
        ctx.fillStyle = i === 0 ? '#4ade80' : `hsl(${hue}, 60%, ${45 + t * 15}%)`
        ctx.fillRect(x + bx*cell + 1, y + by*cell + 1, cell - 2, cell - 2)
      }
      // Score badge
      if (cell < 16) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)'
        ctx.fillRect(x, y, 22, 12)
        ctx.fillStyle = '#e5e7eb'
        ctx.font = 'bold 9px ui-monospace, monospace'
        ctx.textAlign = 'left'
        ctx.fillText(String(snake.score), x + 3, y + 9)
      }
    }

    const drawHeatmap = (genome, x, y, w, h) => {
      // Draw W1 (INPUT × HIDDEN = 24 × 12) as a heatmap
      const cellW = w / HIDDEN
      const cellH = h / INPUT
      for (let i = 0; i < INPUT; i++) {
        for (let hh = 0; hh < HIDDEN; hh++) {
          const v = genome[i * HIDDEN + hh]
          const t = Math.max(-1, Math.min(1, v))
          const r = t > 0 ? 255 : Math.floor(255 * (1 + t))
          const g = t > 0 ? Math.floor(255 * (1 - t)) : Math.floor(255 * (1 + t))
          const b = t > 0 ? 0 : 255
          ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
          ctx.globalAlpha = 0.85
          ctx.fillRect(x + hh * cellW, y + i * cellH, Math.ceil(cellW), Math.ceil(cellH))
        }
      }
      ctx.globalAlpha = 1
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'
      ctx.strokeRect(x, y, w, h)
    }

    const draw = () => {
      const s = stateRef.current; if (!s) return
      ctx.fillStyle = '#0a0a0e'
      ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr)
      const heroSize = BOARD * CELL_HERO
      const miniSize = BOARD * CELL_MINI
      const cols = 4, rows = 5, gap = 6
      // Hero — best living snake or #0
      let hero = s.pop.find((sn) => sn.alive) || s.pop[0]
      // Actually prefer the highest-score one for visibility
      for (const sn of s.pop) if (sn.alive && sn.score > (hero.alive ? hero.score : -1)) hero = sn
      drawBoard(hero, 8, 8, CELL_HERO)
      // Hero label
      ctx.fillStyle = '#fbbf24'
      ctx.font = 'bold 12px ui-monospace, monospace'
      ctx.textAlign = 'left'
      ctx.fillText(`BEST ALIVE · score ${hero.score} · steps ${hero.steps}`, 8, heroSize + 26)
      ctx.fillStyle = '#94a3b8'
      ctx.font = '10px ui-monospace, monospace'
      ctx.fillText(`Generation ${s.gen} · population ${POP} · genome ${GENOME}`, 8, heroSize + 42)

      // Heatmap of hero's W1 layer
      const hmX = 8, hmY = heroSize + 54
      const hmW = heroSize, hmH = 60
      drawHeatmap(hero.genome, hmX, hmY, hmW, hmH)
      ctx.fillStyle = '#94a3b8'
      ctx.font = '9px ui-monospace, monospace'
      ctx.fillText('Layer 1 weights (input × hidden). Red = strong +, Blue = strong -', hmX, hmY + hmH + 12)

      // Mini boards
      const gx = heroSize + 20
      const gy = 8
      for (let i = 0; i < POP; i++) {
        const col = i % cols
        const row = Math.floor(i / cols)
        const bx = gx + col * (miniSize + gap)
        const by = gy + row * (miniSize + gap)
        drawBoard(s.pop[i], bx, by, CELL_MINI)
      }

      // History sparkline
      if (s.history.length > 1) {
        const sx = gx
        const sy = gy + rows * (miniSize + gap) + 8
        const sw = cols * miniSize + (cols - 1) * gap
        const sh = 40
        ctx.fillStyle = 'rgba(255,255,255,0.05)'
        ctx.fillRect(sx, sy, sw, sh)
        ctx.strokeStyle = '#334155'
        ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1)
        const maxV = Math.max(3, ...s.history)
        ctx.strokeStyle = '#4ade80'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        for (let i = 0; i < s.history.length; i++) {
          const px = sx + (i / (s.history.length - 1)) * sw
          const py = sy + sh - (s.history[i] / maxV) * (sh - 4) - 2
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
        }
        ctx.stroke()
        ctx.fillStyle = '#94a3b8'
        ctx.font = '9px ui-monospace, monospace'
        ctx.fillText(`Best per gen · max ${maxV}`, sx + 4, sy + 10)
      }
    }

    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [speed, bestEver])

  const onPause = () => {
    if (!stateRef.current) return
    stateRef.current.paused = !stateRef.current.paused
    setStatus(stateRef.current.paused ? 'paused' : 'playing')
  }
  const onRestart = () => reset()

  const skipToNextGen = () => {
    const s = stateRef.current; if (!s) return
    for (const sn of s.pop) sn.alive = false
    advanceGeneration()
  }

  return (
    <GameShell
      title="Snake AI"
      category="Strategy"
      score={bestScore}
      best={bestEver}
      level={generation}
      status={status}
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn((v) => !v)}
      onRestart={onRestart}
      onPause={onPause}
      extraStats={
        <>
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Gen</span>
            <span className="text-xl sm:text-2xl font-bold tabular-nums text-fuchsia-300">{generation}</span>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Avg</span>
            <span className="text-xl sm:text-2xl font-bold tabular-nums text-emerald-300">{avgScore.toFixed(1)}</span>
          </div>
        </>
      }
      controls={[
        { key: 'Slider', label: 'Playback speed' },
        { key: 'Skip', label: 'Next generation' },
      ]}
      footer={
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 sm:col-span-2">
            <div className="text-[11px] uppercase tracking-widest text-white/50 mb-2">Playback speed</div>
            <input
              type="range" min={1} max={30} value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="w-full accent-fuchsia-400"
            />
            <div className="text-xs text-white/60 mt-1">{speed}× — higher = faster training, harder to watch individual moves</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-[11px] uppercase tracking-widest text-white/50 mb-2">Fast forward</div>
            <button
              type="button"
              onClick={skipToNextGen}
              className="w-full px-3 py-2 rounded-lg bg-fuchsia-500/20 border border-fuchsia-400/40 text-fuchsia-200 text-xs font-semibold hover:bg-fuchsia-500/30"
            >
              Kill all → next gen
            </button>
          </div>
        </div>
      }
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', maxHeight: '80vh', display: 'block' }}
      />
    </GameShell>
  )
}
