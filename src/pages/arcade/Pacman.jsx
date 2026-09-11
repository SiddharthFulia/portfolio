// Pac-Man — full 28x31 maze, 4 ghosts with distinct target-tile AI,
// power pellets, fruit bonus, extra life at 10k, level progression.
//
// AI reference (Iwatani/Iwaya arcade behaviour):
//   Blinky (red)    → chase mode: target = Pac-Man's current tile.
//   Pinky  (pink)   → target = 4 tiles ahead of Pac-Man's facing direction.
//   Inky   (cyan)   → 2 tiles ahead of Pac-Man is the "pivot". Vector
//                     from Blinky to pivot, doubled, gives Inky's target.
//   Clyde  (orange) → chase target when > 8 tiles away; scatter to bottom
//                     left corner when ≤ 8 tiles from Pac-Man.
//
// Scatter mode flips targets to the four board corners at intervals.
// Frightened mode reverses direction, ghosts flee (edible, 200/400/800/1600
// per chain), eyes route back to the ghost house then respawn.
//
// The maze is a 28-col × 31-row grid stored as a string per row:
//   # wall, . dot, o power pellet, - door, ' ' empty
//
// Rendering: 16px cells, pac drawn as an arc that opens/closes each frame,
// ghost sprites as chunky pixel bodies with pupils that track direction.
// A subtle horizontal scanline overlay keeps the CRT feel.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GameShell from '../../components/arcade/GameShell'
import { getSfx } from '../../components/arcade/sfx'

const COLS = 28
const ROWS = 31
const CELL = 16

const RULES = [
  { heading: 'Goal', body: 'Eat every dot and power pellet on the maze without being caught by a ghost. Clearing all dots advances to the next, faster level.' },
  { heading: 'Controls', body: 'Arrow keys / WASD move Pac-Man. On mobile, swipe in the direction you want to travel. Pac-Man queues your next turn — pressing early is safe. Space pauses; R restarts.' },
  { heading: 'Scoring', body: 'Dot = 10. Power pellet = 50. Fruit bonus = 100–500 depending on level. Eating ghosts while a power pellet is active pays 200 → 400 → 800 → 1600, so chaining all four is worth 3000 total.' },
  { heading: 'Ghost AI', body: 'Blinky (red) chases Pac-Man\'s current tile.\nPinky (pink) targets 4 tiles ahead of your facing direction.\nInky (cyan) uses Blinky + a pivot 2 tiles in front of you to plot a mirror.\nClyde (orange) chases when far, scatters to bottom-left when within 8 tiles.' },
  { heading: 'Modes', body: 'Ghosts alternate scatter (flee to corners) and chase (target you) every few seconds. Eating a power pellet flips them to Frightened — they reverse and turn edible for a shrinking window. Eaten ghosts revert to eye-only and route back to the house.' },
  { heading: 'Extras', body: 'Row 14 has tunnels — leaving one side wraps to the other, faster than a ghost can follow. Extra life at 10,000 points. Speed and ghost mode timings tighten every level.' },
  { heading: 'Difficulty', body: 'Easy slows ghosts, extends power-mode to 12 s, and releases the ghost house one at a time. Hard speeds ghosts, shortens power-mode to 4 s, and releases everyone almost immediately. Custom tunes ghost speed, pellet duration, and release delay.' },
]

const DIFFICULTIES = {
  Easy:   { ghostSpeed: 5.2, powerDuration: 12, houseRelease: 60, dotCountMult: 1.0 },
  Medium: { ghostSpeed: 6.5, powerDuration: 8,  houseRelease: 30, dotCountMult: 1.0 },
  Hard:   { ghostSpeed: 7.8, powerDuration: 4,  houseRelease: 10, dotCountMult: 1.0 },
}

const CUSTOM_SCHEMA = {
  ghostSpeed:    { label: 'Ghost speed',      min: 3.5, max: 9.0, step: 0.1, default: 6.5 },
  powerDuration: { label: 'Power mode (s)',   min: 2,   max: 20,  step: 1,   default: 8 },
  houseRelease: { label: 'House release (dots)', min: 0,  max: 100, step: 5,  default: 30 },
  dotCountMult:  { label: 'Dot speed mult',   min: 0.5, max: 1.5, step: 0.05, default: 1.0 },
}

// Hand-authored maze. Symmetrical, with tunnels on row 14 (0-indexed).
// #   = wall
// .   = pellet
// o   = power pellet
// -   = ghost house door
// ' ' = empty (ghost house interior / tunnels)
const MAZE = [
  '############################',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#o####.#####.##.#####.####o#',
  '#.####.#####.##.#####.####.#',
  '#..........................#',
  '#.####.##.########.##.####.#',
  '#.####.##.########.##.####.#',
  '#......##....##....##......#',
  '######.##### ## #####.######',
  '     #.##### ## #####.#     ',
  '     #.##          ##.#     ',
  '     #.## ###--### ##.#     ',
  '######.## #      # ##.######',
  '      .   #      #   .      ',
  '######.## #      # ##.######',
  '     #.## ######## ##.#     ',
  '     #.##          ##.#     ',
  '     #.## ######## ##.#     ',
  '######.## ######## ##.######',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#.####.#####.##.#####.####.#',
  '#o..##................##..o#',
  '###.##.##.########.##.##.###',
  '###.##.##.########.##.##.###',
  '#......##....##....##......#',
  '#.##########.##.##########.#',
  '#.##########.##.##########.#',
  '#..........................#',
  '############################',
]

const TILE = { WALL: '#', DOT: '.', POWER: 'o', DOOR: '-', EMPTY: ' ' }

const DIRS = {
  up:    { dx:  0, dy: -1, ang: -Math.PI / 2 },
  down:  { dx:  0, dy:  1, ang:  Math.PI / 2 },
  left:  { dx: -1, dy:  0, ang:  Math.PI },
  right: { dx:  1, dy:  0, ang:  0 },
}
const DIR_KEYS = ['up', 'down', 'left', 'right']
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' }

const GHOST_HOME = { x: 13.5, y: 14 }
const SCATTER_CORNERS = {
  blinky: { x: 25, y: 0 },
  pinky:  { x: 2,  y: 0 },
  inky:   { x: 27, y: 30 },
  clyde:  { x: 0,  y: 30 },
}
const GHOST_COLORS = {
  blinky: '#ff3b3b',
  pinky:  '#ffb8de',
  inky:   '#37e0ff',
  clyde:  '#ff9d3a',
}
const GHOST_SPAWN = {
  blinky: { x: 13.5, y: 11 },
  pinky:  { x: 13.5, y: 14 },
  inky:   { x: 11.5, y: 14 },
  clyde:  { x: 15.5, y: 14 },
}
const FRIGHT_COLOR = '#2033ff'
const FRIGHT_END_COLOR = '#ffffff'

const parseMaze = () => MAZE.map((row) => row.split(''))

const isWall = (grid, x, y) => {
  if (y < 0 || y >= ROWS) return true
  if (x < 0 || x >= COLS) return false
  return grid[y][x] === TILE.WALL
}
const isDoor = (grid, x, y) => y >= 0 && y < ROWS && x >= 0 && x < COLS && grid[y][x] === TILE.DOOR

const countPellets = (grid) => {
  let n = 0
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++)
      if (grid[y][x] === TILE.DOT || grid[y][x] === TILE.POWER) n++
  return n
}

const dist2 = (a, b) => {
  const dx = a.x - b.x, dy = a.y - b.y
  return dx * dx + dy * dy
}

const chooseGhostDir = (ghost, target, grid, canReverse = false) => {
  const cx = Math.round(ghost.x), cy = Math.round(ghost.y)
  const opts = []
  for (const k of ['up', 'left', 'down', 'right']) {
    if (!canReverse && k === OPPOSITE[ghost.dir]) continue
    const d = DIRS[k]
    const nx = cx + d.dx, ny = cy + d.dy
    const blocked = isWall(grid, nx, ny) ||
      (isDoor(grid, nx, ny) && ghost.mode !== 'eyes' && !ghost.inHouse)
    if (!blocked) opts.push({ k, d: dist2({ x: nx, y: ny }, target) })
  }
  if (opts.length === 0) return ghost.dir
  opts.sort((a, b) => a.d - b.d)
  return opts[0].k
}

const targetForGhost = (ghost, pac, blinky, mode) => {
  if (mode === 'scatter' && ghost.mode !== 'eyes')
    return SCATTER_CORNERS[ghost.name]
  if (ghost.mode === 'eyes') return GHOST_HOME
  const pd = DIRS[pac.dir]

  if (ghost.name === 'blinky') return { x: pac.x, y: pac.y }
  if (ghost.name === 'pinky')
    return { x: pac.x + pd.dx * 4, y: pac.y + pd.dy * 4 }
  if (ghost.name === 'inky') {
    const pivot = { x: pac.x + pd.dx * 2, y: pac.y + pd.dy * 2 }
    return { x: pivot.x + (pivot.x - blinky.x), y: pivot.y + (pivot.y - blinky.y) }
  }
  if (ghost.name === 'clyde') {
    const d = Math.hypot(ghost.x - pac.x, ghost.y - pac.y)
    return d > 8 ? { x: pac.x, y: pac.y } : SCATTER_CORNERS.clyde
  }
  return { x: pac.x, y: pac.y }
}

const initialPac = () => ({
  x: 13.5, y: 23,
  dir: 'left',
  next: 'left',
  mouth: 0,
  alive: true,
  deathT: 0,
})

const newGhost = (name, baseRelease = 30) => ({
  name,
  x: GHOST_SPAWN[name].x,
  y: GHOST_SPAWN[name].y,
  dir: name === 'blinky' ? 'left' : 'up',
  mode: 'normal',
  inHouse: name !== 'blinky',
  // Pinky always leaves immediately; inky at 1×base; clyde at 2×base.
  releaseAt: name === 'pinky' ? 0 : name === 'inky' ? baseRelease : name === 'clyde' ? baseRelease * 2 : 0,
  wobble: 0,
})

export default function Pacman() {
  const canvasRef = useRef(null)
  const rafRef = useRef(0)

  const [status, setStatus] = useState('ready')
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(() => Number(localStorage.getItem('arcade.pacman.best') || 0))
  const [level, setLevel] = useState(1)
  const [lives, setLives] = useState(3)
  const [soundOn, setSoundOn] = useState(true)
  const [difficulty, setDifficulty] = useState('Medium')
  const [customValues, setCustomValues] = useState({
    ghostSpeed: CUSTOM_SCHEMA.ghostSpeed.default,
    powerDuration: CUSTOM_SCHEMA.powerDuration.default,
    houseRelease: CUSTOM_SCHEMA.houseRelease.default,
    dotCountMult: CUSTOM_SCHEMA.dotCountMult.default,
  })
  const cfg = difficulty === 'Custom' ? customValues : DIFFICULTIES[difficulty]
  const cfgRef = useRef(cfg)
  useEffect(() => { cfgRef.current = cfg }, [cfg])

  const state = useRef(null)
  const sfx = useMemo(() => getSfx(), [])

  const reset = useCallback((keepLevel = false) => {
    const grid = parseMaze()
    const totalPellets = countPellets(grid)
    state.current = {
      grid,
      totalPellets,
      pelletsLeft: totalPellets,
      pac: initialPac(),
      ghosts: ['blinky', 'pinky', 'inky', 'clyde'].map((n) => newGhost(n, cfgRef.current.houseRelease)),
      mode: 'chase',
      modeTimer: 0,
      frightTimer: 0,
      chainMul: 1,
      dotsEatenThisLife: 0,
      score: 0,
      level: keepLevel ? state.current?.level ?? 1 : 1,
      lives: keepLevel ? state.current?.lives ?? 3 : 3,
      fruit: null,
      fruitTimer: 0,
      shake: 0,
      chromatic: 0,
      popups: [],
      extraLifeAwarded: false,
      startCountdown: 90,
    }
    if (!keepLevel) {
      setScore(0)
      setLevel(1)
      setLives(3)
    }
    setStatus('ready')
  }, [])

  const nextLevel = useCallback(() => {
    const grid = parseMaze()
    const s = state.current
    s.grid = grid
    s.pelletsLeft = countPellets(grid)
    s.totalPellets = s.pelletsLeft
    s.pac = initialPac()
    s.ghosts = ['blinky', 'pinky', 'inky', 'clyde'].map((n) => newGhost(n, cfgRef.current.houseRelease))
    s.mode = 'chase'
    s.modeTimer = 0
    s.frightTimer = 0
    s.fruit = null
    s.fruitTimer = 0
    s.level += 1
    s.startCountdown = 90
    setLevel(s.level)
    setStatus('ready')
  }, [])

  useEffect(() => { reset(false) }, [reset])

  useEffect(() => {
    const onKey = (e) => {
      const s = state.current; if (!s) return
      if (e.key === 'p' || e.key === 'P') {
        setStatus((prev) => prev === 'paused' ? 'playing' : prev === 'playing' ? 'paused' : prev)
        return
      }
      const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
                    w: 'up', s: 'down', a: 'left', d: 'right',
                    W: 'up', S: 'down', A: 'left', D: 'right' }
      const dir = map[e.key]; if (!dir) return
      e.preventDefault()
      s.pac.next = dir
      if (status === 'ready') setStatus('playing')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [status])

  const nudge = useCallback((dir) => {
    const s = state.current; if (!s) return
    s.pac.next = dir
    if (status === 'ready') setStatus('playing')
  }, [status])

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = COLS * CELL, H = ROWS * CELL
    canvas.width = W; canvas.height = H

    let last = performance.now()
    let frame = 0

    const loop = (t) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t
      frame++
      const reduced = document.querySelector('[data-reduced-motion="true"]') != null
      if (status === 'playing') step(dt, frame)
      draw(ctx, W, H, frame, reduced)
      rafRef.current = requestAnimationFrame(loop)
    }

    const step = (dt, f) => {
      const s = state.current; if (!s) return
      if (s.startCountdown > 0) { s.startCountdown--; return }

      s.modeTimer += dt
      if (s.mode === 'frightened') {
        s.frightTimer -= dt
        if (s.frightTimer <= 0) {
          s.mode = 'chase'
          s.chainMul = 1
          for (const g of s.ghosts) if (g.mode === 'frightened') g.mode = 'normal'
        }
      } else {
        const t = s.modeTimer
        const target = t < 7 ? 'scatter' : t < 27 ? 'chase' : t < 34 ? 'scatter' : 'chase'
        if (s.mode !== target) {
          s.mode = target
          for (const g of s.ghosts) if (g.mode === 'normal') g.dir = OPPOSITE[g.dir]
        }
      }

      const pacSpeed = 8 + s.level * 0.15
      const pac = s.pac
      if (!pac.alive) {
        pac.deathT += dt
        if (pac.deathT > 1.4) {
          if (s.lives <= 1) {
            s.lives = 0
            setLives(0)
            setStatus('over')
            const bestPrev = Number(localStorage.getItem('arcade.pacman.best') || 0)
            if (s.score > bestPrev) {
              localStorage.setItem('arcade.pacman.best', String(s.score))
              setBest(s.score)
            }
          } else {
            s.lives -= 1
            setLives(s.lives)
            s.pac = initialPac()
            s.ghosts = ['blinky','pinky','inky','clyde'].map((n) => newGhost(n, cfgRef.current.houseRelease))
            s.startCountdown = 60
            s.mode = 'chase'
            s.modeTimer = 0
          }
        }
        return
      }
      pac.mouth = (pac.mouth + dt * 8) % 1

      const nearCentreX = Math.abs(pac.x - Math.round(pac.x)) < 0.15
      const nearCentreY = Math.abs(pac.y - Math.round(pac.y)) < 0.15
      if (nearCentreX && nearCentreY) {
        const cx = Math.round(pac.x), cy = Math.round(pac.y)
        const nd = DIRS[pac.next]
        if (!isWall(s.grid, cx + nd.dx, cy + nd.dy)) {
          pac.dir = pac.next
          pac.x = cx; pac.y = cy
        }
      }
      const d = DIRS[pac.dir]
      const nx = pac.x + d.dx * pacSpeed * dt
      const ny = pac.y + d.dy * pacSpeed * dt
      const leadX = Math.round(nx + d.dx * 0.4)
      const leadY = Math.round(ny + d.dy * 0.4)
      if (!isWall(s.grid, leadX, leadY)) {
        pac.x = nx; pac.y = ny
      } else {
        pac.x = Math.round(pac.x)
        pac.y = Math.round(pac.y)
      }
      if (pac.x < -0.5) pac.x = COLS - 0.5
      if (pac.x > COLS - 0.5) pac.x = -0.5

      const tx = Math.round(pac.x), ty = Math.round(pac.y)
      if (ty >= 0 && ty < ROWS && tx >= 0 && tx < COLS) {
        const cell = s.grid[ty][tx]
        if (cell === TILE.DOT) {
          s.grid[ty][tx] = TILE.EMPTY
          s.pelletsLeft--
          s.score += 10
          s.dotsEatenThisLife++
          if (soundOn && (f % 4 === 0)) sfx.chirp()
        } else if (cell === TILE.POWER) {
          s.grid[ty][tx] = TILE.EMPTY
          s.pelletsLeft--
          s.score += 50
          s.mode = 'frightened'
          s.frightTimer = Math.max(2, cfgRef.current.powerDuration - s.level * 0.5)
          s.chainMul = 1
          for (const g of s.ghosts) if (g.mode === 'normal') {
            g.mode = 'frightened'
            g.dir = OPPOSITE[g.dir]
          }
          if (soundOn) sfx.pop()
        }
        const eaten = s.totalPellets - s.pelletsLeft
        if ((eaten === 70 || eaten === 170) && !s.fruit) {
          s.fruit = { x: 13.5, y: 17, value: 100 + s.level * 20 }
          s.fruitTimer = 10
        }
      }

      if (s.fruit) {
        s.fruitTimer -= dt
        if (s.fruitTimer <= 0) s.fruit = null
        else if (Math.hypot(pac.x - s.fruit.x, pac.y - s.fruit.y) < 0.7) {
          s.score += s.fruit.value
          s.popups.push({ x: s.fruit.x, y: s.fruit.y, text: `+${s.fruit.value}`, ttl: 40, color: '#ff6b9a' })
          s.fruit = null
          if (soundOn) sfx.coin()
        }
      }

      if (!s.extraLifeAwarded && s.score >= 10000) {
        s.extraLifeAwarded = true
        s.lives += 1
        setLives(s.lives)
        s.popups.push({ x: 13.5, y: 15, text: '+1 LIFE', ttl: 90, color: '#ffe066' })
        if (soundOn) sfx.win()
      }

      for (const g of s.ghosts) {
        if (g.inHouse && s.dotsEatenThisLife >= g.releaseAt) {
          g.inHouse = false
          g.x = 13.5; g.y = 11; g.dir = 'left'
        }
        const baseSpeed = g.mode === 'frightened' ? Math.max(3, cfgRef.current.ghostSpeed * 0.65) :
                          g.mode === 'eyes' ? 12 :
                          cfgRef.current.ghostSpeed + s.level * 0.12
        const gd = DIRS[g.dir]
        g.x += gd.dx * baseSpeed * dt
        g.y += gd.dy * baseSpeed * dt
        if (g.x < -0.5) g.x = COLS - 0.5
        if (g.x > COLS - 0.5) g.x = -0.5
        g.wobble = (g.wobble + dt * 6) % (Math.PI * 2)

        const centred = Math.abs(g.x - Math.round(g.x)) < 0.12 &&
                        Math.abs(g.y - Math.round(g.y)) < 0.12
        if (centred) {
          g.x = Math.round(g.x); g.y = Math.round(g.y)
          const blinky = s.ghosts.find(x => x.name === 'blinky')
          if (g.mode === 'frightened') {
            const opts = DIR_KEYS.filter(k => {
              if (k === OPPOSITE[g.dir]) return false
              const dd = DIRS[k]
              return !isWall(s.grid, g.x + dd.dx, g.y + dd.dy) &&
                     !isDoor(s.grid, g.x + dd.dx, g.y + dd.dy)
            })
            if (opts.length) g.dir = opts[Math.floor(Math.random() * opts.length)]
          } else if (g.mode === 'eyes') {
            g.dir = chooseGhostDir(g, GHOST_HOME, s.grid, true)
            if (Math.hypot(g.x - GHOST_HOME.x, g.y - GHOST_HOME.y) < 0.6) {
              g.mode = 'normal'
              g.x = GHOST_SPAWN[g.name].x
              g.y = GHOST_SPAWN[g.name].y
              g.dir = 'up'
            }
          } else {
            const target = targetForGhost(g, pac, blinky, s.mode)
            g.dir = chooseGhostDir(g, target, s.grid, false)
          }
        }

        if (Math.hypot(g.x - pac.x, g.y - pac.y) < 0.7) {
          if (g.mode === 'frightened') {
            const pts = 200 * s.chainMul
            s.score += pts
            s.popups.push({ x: g.x, y: g.y, text: `+${pts}`, ttl: 40, color: '#37e0ff' })
            s.chainMul = Math.min(8, s.chainMul * 2)
            g.mode = 'eyes'
            if (soundOn) sfx.hit()
          } else if (g.mode === 'normal') {
            pac.alive = false
            pac.deathT = 0
            s.shake = 20
            s.chromatic = 20
            if (soundOn) sfx.death()
          }
        }
      }

      for (const p of s.popups) p.ttl--
      s.popups = s.popups.filter(p => p.ttl > 0)
      if (s.shake > 0) s.shake *= 0.9
      if (s.chromatic > 0) s.chromatic *= 0.92

      setScore(s.score)

      if (s.pelletsLeft === 0) {
        if (soundOn) sfx.win()
        setStatus('won')
        setTimeout(() => nextLevel(), 1600)
      }
    }

    const draw = (ctx, W, H, f, reduced) => {
      const s = state.current; if (!s) return
      ctx.save()
      if (!reduced && s.shake > 0.1) {
        ctx.translate((Math.random() - 0.5) * s.shake * 0.4, (Math.random() - 0.5) * s.shake * 0.4)
      }
      ctx.fillStyle = '#05050a'
      ctx.fillRect(0, 0, W, H)

      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const c = s.grid[y][x]
          if (c === TILE.WALL) {
            ctx.fillStyle = '#111a5a'
            ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2)
            ctx.strokeStyle = '#3652ff'
            ctx.lineWidth = 1
            ctx.strokeRect(x * CELL + 1.5, y * CELL + 1.5, CELL - 3, CELL - 3)
          } else if (c === TILE.DOT) {
            ctx.fillStyle = '#fce8b0'
            ctx.fillRect(x * CELL + CELL/2 - 1, y * CELL + CELL/2 - 1, 2, 2)
          } else if (c === TILE.POWER) {
            const pulse = 3 + Math.sin(f * 0.15) * 1
            ctx.fillStyle = '#ffcf5a'
            ctx.beginPath()
            ctx.arc(x * CELL + CELL/2, y * CELL + CELL/2, pulse, 0, Math.PI * 2)
            ctx.fill()
          } else if (c === TILE.DOOR) {
            ctx.fillStyle = '#ffb8de'
            ctx.fillRect(x * CELL, y * CELL + CELL/2 - 1, CELL, 2)
          }
        }
      }

      if (s.fruit) {
        const fx = s.fruit.x * CELL + CELL/2
        const fy = s.fruit.y * CELL + CELL/2
        ctx.fillStyle = '#ff425c'
        ctx.beginPath(); ctx.arc(fx, fy, 6, 0, Math.PI*2); ctx.fill()
        ctx.fillStyle = '#3ba55c'
        ctx.fillRect(fx - 1, fy - 8, 2, 4)
      }

      const pac = s.pac
      const px = pac.x * CELL + CELL/2
      const py = pac.y * CELL + CELL/2
      const ang = DIRS[pac.dir].ang
      if (pac.alive) {
        const mouth = Math.abs(Math.sin(pac.mouth * Math.PI))
        ctx.fillStyle = '#ffe066'
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.arc(px, py, CELL/2 - 1, ang + mouth * 0.5, ang - mouth * 0.5 + Math.PI * 2)
        ctx.closePath()
        ctx.fill()
      } else {
        const t = Math.min(1, pac.deathT / 1.2)
        ctx.fillStyle = '#ffe066'
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.arc(px, py, CELL/2 - 1, -Math.PI/2 + t * Math.PI, -Math.PI/2 - t * Math.PI + Math.PI * 2)
        ctx.closePath()
        ctx.fill()
      }

      for (const g of s.ghosts) {
        const gx = g.x * CELL + CELL/2
        const gy = g.y * CELL + CELL/2
        const body = g.mode === 'eyes' ? 'transparent' :
                     g.mode === 'frightened'
                       ? (s.frightTimer < 2 && Math.floor(f/6) % 2 ? FRIGHT_END_COLOR : FRIGHT_COLOR)
                       : GHOST_COLORS[g.name]
        if (body !== 'transparent') {
          ctx.fillStyle = body
          ctx.beginPath()
          ctx.arc(gx, gy - 1, CELL/2 - 1, Math.PI, 0)
          const y0 = gy + CELL/2 - 2
          const zig = 3
          const step = (CELL - 2) / (zig * 2)
          for (let i = 0; i < zig * 2; i++) {
            const dx = -(CELL/2 - 1) + i * step
            const dy = i % 2 === 0 ? 2 : 0
            ctx.lineTo(gx + dx + step, y0 - dy)
          }
          ctx.lineTo(gx - (CELL/2 - 1), gy - 1)
          ctx.closePath()
          ctx.fill()
        }
        const gd = DIRS[g.dir]
        const eyeOffset = 1.5
        const pupilOffX = gd.dx * eyeOffset
        const pupilOffY = gd.dy * eyeOffset
        ctx.fillStyle = '#ffffff'
        ctx.beginPath(); ctx.arc(gx - 3, gy - 2, 2.5, 0, Math.PI*2); ctx.fill()
        ctx.beginPath(); ctx.arc(gx + 3, gy - 2, 2.5, 0, Math.PI*2); ctx.fill()
        ctx.fillStyle = g.mode === 'frightened' ? '#ffcf5a' : '#0a0f4f'
        ctx.beginPath(); ctx.arc(gx - 3 + pupilOffX, gy - 2 + pupilOffY, 1.3, 0, Math.PI*2); ctx.fill()
        ctx.beginPath(); ctx.arc(gx + 3 + pupilOffX, gy - 2 + pupilOffY, 1.3, 0, Math.PI*2); ctx.fill()
      }

      ctx.font = 'bold 11px monospace'
      ctx.textAlign = 'center'
      for (const p of s.popups) {
        ctx.fillStyle = p.color
        ctx.globalAlpha = Math.min(1, p.ttl / 40)
        ctx.fillText(p.text, p.x * CELL + CELL/2, p.y * CELL - (40 - p.ttl) * 0.4)
      }
      ctx.globalAlpha = 1

      ctx.fillStyle = '#ffe066'
      for (let i = 0; i < s.lives - 1; i++) {
        const lx = 12 + i * 18
        const ly = H - 12
        ctx.beginPath()
        ctx.moveTo(lx, ly)
        ctx.arc(lx, ly, 6, 0.4, Math.PI * 2 - 0.4)
        ctx.closePath()
        ctx.fill()
      }

      if (s.startCountdown > 0) {
        ctx.font = 'bold 16px monospace'
        ctx.fillStyle = '#ffe066'
        ctx.textAlign = 'center'
        ctx.fillText('READY!', 13.5 * CELL, 17.5 * CELL)
      }

      ctx.restore()

      if (!reduced && s.chromatic > 1) {
        ctx.save()
        ctx.globalCompositeOperation = 'screen'
        ctx.globalAlpha = 0.35
        ctx.drawImage(canvas, s.chromatic * 0.3, 0)
        ctx.fillStyle = '#ff2244'
        ctx.globalAlpha = 0.15
        ctx.fillRect(0, 0, W, H)
        ctx.restore()
      }

      ctx.save()
      ctx.globalAlpha = 0.08
      ctx.fillStyle = '#000'
      for (let y = 0; y < H; y += 2) ctx.fillRect(0, y, W, 1)
      ctx.restore()
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [status, soundOn, sfx, nextLevel])

  useEffect(() => { sfx.setEnabled(soundOn) }, [soundOn, sfx])

  return (
    <GameShell
      title="Pac-Man"
      category="Retro"
      score={score}
      best={best}
      level={level}
      status={status}
      extraStats={
        <div className="flex flex-col items-start">
          <span className="text-[10px] uppercase tracking-widest text-white/40">Lives</span>
          <span className="text-xl sm:text-2xl font-bold tabular-nums text-yellow-300">{lives}</span>
        </div>
      }
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn((v) => !v)}
      onPause={() => setStatus((prev) => prev === 'paused' ? 'playing' : prev === 'playing' ? 'paused' : prev)}
      onRestart={() => reset(false)}
      rules={RULES}
      difficulty={difficulty}
      onDifficultyChange={setDifficulty}
      customSchema={CUSTOM_SCHEMA}
      customValues={customValues}
      onCustomChange={setCustomValues}
      controls={[
        { key: 'Arrows', label: 'Move' },
        { key: 'WASD',   label: 'Move' },
        { key: 'P',      label: 'Pause' },
      ]}
    >
      <div className="w-full flex items-center justify-center p-2">
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-[70vh]"
          style={{ imageRendering: 'pixelated', touchAction: 'none' }}
        />
      </div>

      <div className="sm:hidden grid grid-cols-3 gap-2 p-3 border-t border-white/10 bg-white/5">
        <div />
        <button type="button" onTouchStart={() => nudge('up')}    className="h-12 rounded-lg bg-white/10 border border-white/20 text-white text-lg active:bg-white/20">↑</button>
        <div />
        <button type="button" onTouchStart={() => nudge('left')}  className="h-12 rounded-lg bg-white/10 border border-white/20 text-white text-lg active:bg-white/20">←</button>
        <button type="button" onTouchStart={() => nudge('down')}  className="h-12 rounded-lg bg-white/10 border border-white/20 text-white text-lg active:bg-white/20">↓</button>
        <button type="button" onTouchStart={() => nudge('right')} className="h-12 rounded-lg bg-white/10 border border-white/20 text-white text-lg active:bg-white/20">→</button>
      </div>
    </GameShell>
  )
}
