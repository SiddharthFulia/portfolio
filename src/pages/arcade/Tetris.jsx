// Tetris — full modern ruleset (SRS + T-spin + back-to-back + combo).
//
// Why so much code:
//   • Rotation is not "rotate the matrix" — it's the Super Rotation System.
//     Each piece has 4 rotation states with 5 wall-kick offsets between
//     every adjacent pair. J/L/S/T/Z share one kick table; I has its own.
//   • T-spin detection is corner-based: after a T locks, count the four
//     diagonal corners of the T's centre. Three or four filled → T-spin.
//     The "kind" (mini vs full) depends on the last kick used.
//   • Back-to-back is a bonus applied when the previous scoring clear
//     AND the current clear are both "difficult" (Tetris or T-spin).
//   • Ghost piece is the same shape projected down as far as it fits.
//   • Hold is one swap per lock — flag resets when the piece locks.
//   • 7-bag randomizer — shuffle {I,O,T,S,Z,L,J} and deal in order.
//
// State is intentionally NOT split across a hundred hooks — everything
// mutation-happy lives in a ref and we bump a tick counter to re-render.
// React does poorly at 60 FPS with granular state; a single ref+tick
// combo lets us keep the game logic clean and imperative.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GameShell from '../../components/arcade/GameShell'
import { getSfx } from '../../components/arcade/sfx'
import { RULES, DIFFICULTIES, CUSTOM_SCHEMA } from './tetris/rules'

const COLS = 10
const ROWS = 20
const HIDDEN_ROWS = 2      // stack can spawn slightly above the visible board
const TOTAL_ROWS = ROWS + HIDDEN_ROWS

// Piece definitions. Each shape is expressed as offsets from its rotation
// centre — SRS convention. I and O are special: I has a 4x4 bounding box,
// O never rotates.
const PIECES = {
  I: { color: '#22d3ee',
       cells: [
         [[-1,0],[0,0],[1,0],[2,0]],
         [[1,-1],[1,0],[1,1],[1,2]],
         [[-1,1],[0,1],[1,1],[2,1]],
         [[0,-1],[0,0],[0,1],[0,2]],
       ] },
  O: { color: '#facc15',
       cells: [
         [[0,0],[1,0],[0,1],[1,1]],
         [[0,0],[1,0],[0,1],[1,1]],
         [[0,0],[1,0],[0,1],[1,1]],
         [[0,0],[1,0],[0,1],[1,1]],
       ] },
  T: { color: '#a855f7',
       cells: [
         [[0,-1],[-1,0],[0,0],[1,0]],
         [[0,-1],[0,0],[1,0],[0,1]],
         [[-1,0],[0,0],[1,0],[0,1]],
         [[0,-1],[-1,0],[0,0],[0,1]],
       ] },
  S: { color: '#4ade80',
       cells: [
         [[0,-1],[1,-1],[-1,0],[0,0]],
         [[0,-1],[0,0],[1,0],[1,1]],
         [[0,0],[1,0],[-1,1],[0,1]],
         [[-1,-1],[-1,0],[0,0],[0,1]],
       ] },
  Z: { color: '#f43f5e',
       cells: [
         [[-1,-1],[0,-1],[0,0],[1,0]],
         [[1,-1],[0,0],[1,0],[0,1]],
         [[-1,0],[0,0],[0,1],[1,1]],
         [[0,-1],[-1,0],[0,0],[-1,1]],
       ] },
  L: { color: '#fb923c',
       cells: [
         [[1,-1],[-1,0],[0,0],[1,0]],
         [[0,-1],[0,0],[0,1],[1,1]],
         [[-1,0],[0,0],[1,0],[-1,1]],
         [[-1,-1],[0,-1],[0,0],[0,1]],
       ] },
  J: { color: '#3b82f6',
       cells: [
         [[-1,-1],[-1,0],[0,0],[1,0]],
         [[0,-1],[1,-1],[0,0],[0,1]],
         [[-1,0],[0,0],[1,0],[1,1]],
         [[0,-1],[0,0],[-1,1],[0,1]],
       ] },
}

const PIECE_ORDER = ['I','O','T','S','Z','L','J']

// SRS wall-kick tables. Each key is "from>to" rotation state (0/1/2/3).
// Try each offset in order until one fits. First that fits is the kick.
const KICKS_JLSTZ = {
  '0>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '1>0': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '1>2': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '2>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '2>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  '3>2': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '3>0': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '0>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
}
const KICKS_I = {
  '0>1': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '1>0': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '1>2': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
  '2>1': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '2>3': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '3>2': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '3>0': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '0>3': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
}

function makeBoard() {
  return Array.from({ length: TOTAL_ROWS }, () => Array(COLS).fill(null))
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function newPiece(type) {
  return {
    type,
    rot: 0,
    x: 4,
    y: type === 'I' ? 0 : 1,
    lastKick: 0,
  }
}

function cellsOf(piece) {
  return PIECES[piece.type].cells[piece.rot].map(([dx, dy]) => [piece.x + dx, piece.y + dy])
}

function collides(board, piece, ox = 0, oy = 0, rot = null) {
  const cells = PIECES[piece.type].cells[rot === null ? piece.rot : rot]
  for (const [dx, dy] of cells) {
    const x = piece.x + dx + ox
    const y = piece.y + dy + oy
    if (x < 0 || x >= COLS || y >= TOTAL_ROWS) return true
    if (y < 0) continue
    if (board[y][x]) return true
  }
  return false
}

function ghostY(board, piece) {
  let d = 0
  while (!collides(board, piece, 0, d + 1)) d++
  return piece.y + d
}

// Level-based gravity in ms per drop. Falls off fast then asymptotes.
function gravityMs(level) {
  const table = [800, 720, 640, 560, 480, 400, 320, 240, 180, 140, 110, 90, 70, 55, 45, 35, 28, 22, 18, 15]
  return table[Math.min(table.length - 1, Math.max(0, level - 1))]
}

function scoreForClear({ lines, tSpin, tSpinMini, backToBack, level }) {
  let base = 0
  if (tSpin) {
    if (tSpinMini) base = [100, 200, 400, 0][lines] || 0
    else           base = [400, 800, 1200, 1600][lines] || 0
  } else {
    base = [0, 100, 300, 500, 800][lines] || 0
  }
  const bonus = (backToBack && (lines === 4 || tSpin)) ? Math.floor(base * 0.5) : 0
  return (base + bonus) * level
}

function makeInitialState(startLevel = 1) {
  const bag = shuffle(PIECE_ORDER)
  const first = bag.shift()
  return {
    board:      makeBoard(),
    bag,
    queue:      shuffle(PIECE_ORDER),
    piece:      newPiece(first),
    hold:       null,
    holdUsed:   false,
    score:      0,
    lines:      0,
    level:      Math.max(1, Math.min(20, startLevel)),
    combo:      -1,
    b2b:        false,
    over:       false,
    clearingRows: [],
    lastAction: null,
    lastKick:   0,
  }
}

export default function Tetris() {
  const [, setTick] = useState(0)
  const [status, setStatus] = useState('playing')
  const [paused, setPaused] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const [best, setBest] = useState(() => {
    try { return Number(localStorage.getItem('arcade.tetris.best')) || 0 } catch { return 0 }
  })
  const [pop, setPop] = useState(null)
  const [difficulty, setDifficulty] = useState('Medium')
  const [customValues, setCustomValues] = useState(() => Object.fromEntries(
    Object.entries(CUSTOM_SCHEMA).map(([k, v]) => [k, v.default])
  ))
  const cfg = useMemo(
    () => difficulty === 'Custom' ? customValues : DIFFICULTIES[difficulty] || DIFFICULTIES.Medium,
    [difficulty, customValues],
  )
  const cfgRef = useRef(cfg)
  useEffect(() => { cfgRef.current = cfg }, [cfg])
  const stateRef = useRef(makeInitialState())
  const dropAccRef = useRef(0)
  const lastTsRef  = useRef(0)
  const rafRef     = useRef(0)
  const sfxRef     = useRef(getSfx())

  const bump = useCallback(() => setTick((t) => (t + 1) % 1e9), [])

  useEffect(() => { sfxRef.current.setEnabled(soundOn) }, [soundOn])

  const refillQueue = useCallback(() => {
    const s = stateRef.current
    while (s.queue.length < 7) s.queue.push(...shuffle(PIECE_ORDER))
  }, [])

  const spawn = useCallback(() => {
    const s = stateRef.current
    refillQueue()
    const type = s.queue.shift()
    s.piece = newPiece(type)
    s.holdUsed = false
    s.lastAction = null
    if (collides(s.board, s.piece)) {
      s.over = true
      setStatus('over')
      sfxRef.current.death()
    }
  }, [refillQueue])

  const rotate = useCallback((dir) => {
    const s = stateRef.current
    if (s.over || paused) return
    const from = s.piece.rot
    const to   = (from + (dir === 1 ? 1 : 3)) % 4
    const key  = `${from}>${to}`
    const kicks = s.piece.type === 'I' ? KICKS_I[key] : KICKS_JLSTZ[key]
    if (!kicks) return
    for (let i = 0; i < kicks.length; i++) {
      const [ox, oy] = kicks[i]
      if (!collides(s.board, s.piece, ox, -oy, to)) {
        s.piece.rot = to
        s.piece.x += ox
        s.piece.y -= oy
        s.piece.lastKick = i
        s.lastAction = 'rot'
        sfxRef.current.pop()
        bump()
        return
      }
    }
  }, [bump, paused])

  const move = useCallback((dx) => {
    const s = stateRef.current
    if (s.over || paused) return
    if (!collides(s.board, s.piece, dx, 0)) {
      s.piece.x += dx
      s.lastAction = 'move'
      sfxRef.current.chirp()
      bump()
    }
  }, [bump, paused])

  const doLock = useCallback(() => {
    const s = stateRef.current
    for (const [x, y] of cellsOf(s.piece)) {
      if (y >= 0 && y < TOTAL_ROWS && x >= 0 && x < COLS) {
        s.board[y][x] = PIECES[s.piece.type].color
      }
    }
    // T-spin detection (before row removal)
    let tSpin = false, mini = false
    if (s.piece.type === 'T' && s.lastAction === 'rot') {
      const { x, y } = s.piece
      const corners = [[-1,-1],[1,-1],[-1,1],[1,1]]
      const filled = corners.map(([dx, dy]) => {
        const cx = x + dx, cy = y + dy
        if (cx < 0 || cx >= COLS || cy < 0 || cy >= TOTAL_ROWS) return true
        return !!s.board[cy][cx]
      })
      const total = filled.filter(Boolean).length
      if (total >= 3) {
        tSpin = true
        const frontIdx = { 0: [0, 1], 1: [1, 3], 2: [2, 3], 3: [0, 2] }[s.piece.rot]
        const frontFilled = frontIdx.filter((i) => filled[i]).length
        const isFull = frontFilled === 2 || s.piece.lastKick === 4
        mini = !isFull
      }
    }

    const rowsToClear = []
    for (let y = 0; y < TOTAL_ROWS; y++) {
      if (s.board[y].every((c) => c !== null)) rowsToClear.push(y)
    }
    const cleared = rowsToClear.length

    const gained = scoreForClear({
      lines: cleared, tSpin, tSpinMini: mini, backToBack: s.b2b, level: s.level,
    })
    s.score += gained

    if (cleared > 0 || tSpin) {
      const label =
        tSpin ? (mini ? 'T-Spin Mini' : `T-Spin${cleared ? ` ${['','Single','Double','Triple'][cleared]}` : ''}`) :
        cleared === 4 ? 'Tetris!' :
        ['','Single','Double','Triple'][cleared] || ''
      setPop({ text: label, sub: gained ? `+${gained}` : '', ts: Date.now() })
    }

    const difficult = (cleared === 4) || (tSpin && cleared > 0)
    if (cleared > 0) {
      s.b2b = difficult
      s.combo += 1
      s.score += 50 * s.combo * s.level
      sfxRef.current.coin()
    } else {
      s.combo = -1
    }

    if (cleared > 0) {
      s.clearingRows = rowsToClear
      bump()
      setTimeout(() => {
        for (const y of [...rowsToClear].sort((a, b) => a - b)) {
          s.board.splice(y, 1)
          s.board.unshift(Array(COLS).fill(null))
        }
        s.lines += cleared
        const nextLevel = 1 + Math.floor(s.lines / 10)
        if (nextLevel > s.level) sfxRef.current.win()
        s.level = nextLevel
        s.clearingRows = []
        spawn()
        bump()
      }, 160)
    } else {
      spawn()
      bump()
    }
  }, [bump, spawn])

  const softDrop = useCallback(() => {
    const s = stateRef.current
    if (s.over || paused) return
    if (!collides(s.board, s.piece, 0, 1)) {
      s.piece.y += 1
      s.lastAction = 'move'
      s.score += 1
      bump()
    } else {
      doLock()
    }
  }, [bump, paused, doLock])

  const hardDrop = useCallback(() => {
    const s = stateRef.current
    if (s.over || paused) return
    let d = 0
    while (!collides(s.board, s.piece, 0, d + 1)) d++
    s.piece.y += d
    s.score += d * 2
    s.lastAction = 'drop'
    sfxRef.current.hit()
    doLock()
  }, [paused, doLock])

  const holdSwap = useCallback(() => {
    const s = stateRef.current
    if (s.over || paused || s.holdUsed) return
    const cur = s.piece.type
    if (s.hold) {
      s.piece = newPiece(s.hold)
    } else {
      refillQueue()
      s.piece = newPiece(s.queue.shift())
    }
    s.hold = cur
    s.holdUsed = true
    s.lastAction = null
    sfxRef.current.chirp()
    bump()
  }, [bump, paused, refillQueue])

  const reset = useCallback(() => {
    stateRef.current = makeInitialState(cfgRef.current.startLevel || 1)
    setStatus('playing')
    setPaused(false)
    setPop(null)
    bump()
  }, [bump])

  useEffect(() => {
    const s = stateRef.current
    if (s.score > best) {
      setBest(s.score)
      try { localStorage.setItem('arcade.tetris.best', String(s.score)) } catch {}
    }
  })

  useEffect(() => {
    const loop = (ts) => {
      const s = stateRef.current
      if (!lastTsRef.current) lastTsRef.current = ts
      const dt = ts - lastTsRef.current
      lastTsRef.current = ts
      if (!paused && !s.over && !s.clearingRows.length) {
        dropAccRef.current += dt
        const g = gravityMs(s.level)
        while (dropAccRef.current >= g) {
          dropAccRef.current -= g
          if (!collides(s.board, s.piece, 0, 1)) {
            s.piece.y += 1
            s.lastAction = 'move'
            bump()
          } else {
            doLock()
            break
          }
        }
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [paused, bump, doLock])

  useEffect(() => {
    const onKey = (e) => {
      if (['ArrowLeft','ArrowRight','ArrowDown','ArrowUp',' '].includes(e.key)) e.preventDefault()
      const s = stateRef.current
      if (s.over) return
      if (e.key === 'p' || e.key === 'P') { setPaused((p) => !p); return }
      if (paused) return
      if (e.key === 'ArrowLeft')  move(-1)
      else if (e.key === 'ArrowRight') move(1)
      else if (e.key === 'ArrowDown')  softDrop()
      else if (e.key === 'ArrowUp' || e.key === 'x' || e.key === 'X') rotate(1)
      else if (e.key === 'z' || e.key === 'Z') rotate(-1)
      else if (e.key === ' ') hardDrop()
      else if (e.key === 'c' || e.key === 'C' || e.key === 'Shift') holdSwap()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [move, softDrop, hardDrop, rotate, holdSwap, paused])

  useEffect(() => {
    if (!pop) return
    const t = setTimeout(() => setPop(null), 1500)
    return () => clearTimeout(t)
  }, [pop])

  const s = stateRef.current
  const ghost = useMemo(() => {
    if (s.over) return null
    const gy = ghostY(s.board, s.piece)
    return { ...s.piece, y: gy }
    // eslint-disable-next-line
  })

  const cellSize = 28
  const width = COLS * cellSize
  const height = ROWS * cellSize

  const display = useMemo(() => {
    const b = s.board.map((row) => row.slice())
    if (ghost && !s.over) {
      for (const [x, y] of cellsOf(ghost)) {
        if (y >= HIDDEN_ROWS && y < TOTAL_ROWS && x >= 0 && x < COLS && !b[y][x]) {
          b[y][x] = { ghost: true, color: PIECES[s.piece.type].color }
        }
      }
    }
    if (!s.over) {
      for (const [x, y] of cellsOf(s.piece)) {
        if (y >= 0 && y < TOTAL_ROWS && x >= 0 && x < COLS) {
          b[y][x] = { active: true, color: PIECES[s.piece.type].color }
        }
      }
    }
    return b
    // eslint-disable-next-line
  })

  const touchRef = useRef(null)
  const onTouchStart = (e) => {
    const t = e.touches[0]
    touchRef.current = { x: t.clientX, y: t.clientY, t: Date.now(), moved: false }
  }
  const onTouchMove = (e) => {
    const st = touchRef.current
    if (!st) return
    const t = e.touches[0]
    const dx = t.clientX - st.x
    const dy = t.clientY - st.y
    if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy)) {
      move(dx > 0 ? 1 : -1)
      touchRef.current = { ...st, x: t.clientX, y: t.clientY, moved: true }
    } else if (dy > 40) {
      softDrop()
      touchRef.current = { ...st, x: t.clientX, y: t.clientY, moved: true }
    }
  }
  const onTouchEnd = () => {
    const st = touchRef.current
    if (st && !st.moved && Date.now() - st.t < 200) rotate(1)
    touchRef.current = null
  }

  return (
    <GameShell
      title="Tetris"
      category="Puzzle"
      score={s.score}
      best={best}
      level={s.level}
      status={s.over ? 'over' : (paused ? 'paused' : status)}
      extraStats={
        <>
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Lines</span>
            <span className="text-xl sm:text-2xl font-bold tabular-nums text-emerald-300">{s.lines}</span>
          </div>
          {s.combo > 0 && (
            <div className="flex flex-col items-start">
              <span className="text-[10px] uppercase tracking-widest text-white/40">Combo</span>
              <span className="text-xl sm:text-2xl font-bold tabular-nums text-fuchsia-300">×{s.combo}</span>
            </div>
          )}
          {s.b2b && (
            <div className="flex flex-col items-start">
              <span className="text-[10px] uppercase tracking-widest text-white/40">Bonus</span>
              <span className="text-sm font-semibold text-amber-200">B2B</span>
            </div>
          )}
        </>
      }
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn((v) => !v)}
      onRestart={reset}
      onPause={() => setPaused((p) => !p)}
      controls={[
        { key: '← →', label: 'Move' },
        { key: '↓',   label: 'Soft drop' },
        { key: '↑ / X',   label: 'Rotate CW' },
        { key: 'Z',   label: 'Rotate CCW' },
        { key: 'Space',label: 'Hard drop' },
        { key: 'C',   label: 'Hold' },
        { key: 'P',   label: 'Pause' },
        { key: 'Swipe',label: 'Mobile move + tap rotate' },
      ]}
      rules={RULES}
      difficulty={difficulty}
      onDifficultyChange={setDifficulty}
      difficultyModes={['Easy', 'Medium', 'Hard', 'Custom']}
      customSchema={CUSTOM_SCHEMA}
      customValues={customValues}
      onCustomChange={setCustomValues}
    >
      <div
        className="flex items-start justify-center gap-4 p-3 sm:p-4"
        style={{ background: 'radial-gradient(120% 90% at 50% -10%, rgba(244,114,182,.10), transparent 60%)' }}
      >
        <SidePanel title="Hold">
          {s.hold ? <PieceIcon type={s.hold} dim={s.holdUsed} /> : <EmptyPiece />}
        </SidePanel>

        <div
          className="relative rounded-lg overflow-hidden select-none"
          style={{
            width, height,
            background:
              'repeating-linear-gradient(0deg, rgba(255,255,255,.02) 0 1px, transparent 1px 28px), ' +
              'repeating-linear-gradient(90deg, rgba(255,255,255,.02) 0 1px, transparent 1px 28px), ' +
              'linear-gradient(180deg, #0b0b12 0%, #060609 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 0 40px -12px rgba(244,114,182,.25) inset',
          }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {display.slice(HIDDEN_ROWS).map((row, ry) => (
            row.map((cell, cx) => {
              if (!cell) return null
              const clearing = s.clearingRows.includes(ry + HIDDEN_ROWS)
              const isGhost  = cell.ghost
              const color    = typeof cell === 'string' ? cell : cell.color
              return (
                <BevelCell
                  key={`${cx}-${ry}`}
                  x={cx * cellSize}
                  y={ry * cellSize}
                  size={cellSize}
                  color={color}
                  ghost={isGhost}
                  clearing={clearing}
                />
              )
            })
          ))}

          {pop && (
            <div
              className="absolute left-1/2 top-6 -translate-x-1/2 pointer-events-none"
              style={{ animation: 'tetris-pop 1.4s ease-out forwards' }}
            >
              <div className="text-center">
                <div className="text-lg sm:text-2xl font-black bg-gradient-to-r from-amber-300 via-rose-300 to-fuchsia-400 bg-clip-text text-transparent">{pop.text}</div>
                {pop.sub && <div className="text-xs text-white/70 mt-0.5">{pop.sub}</div>}
              </div>
            </div>
          )}

          {s.over && (
            <div className="absolute inset-0 backdrop-blur-sm bg-black/60 flex flex-col items-center justify-center gap-4">
              <div className="text-3xl font-black bg-gradient-to-r from-amber-300 via-rose-300 to-fuchsia-400 bg-clip-text text-transparent">
                Stack overflow
              </div>
              <div className="text-white/70 text-sm">Score {s.score.toLocaleString()} · Lines {s.lines}</div>
              <button onClick={reset} className="mt-1 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold">
                Play again
              </button>
            </div>
          )}

          {paused && !s.over && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center text-white/80 text-lg font-semibold">Paused</div>
          )}
        </div>

        <SidePanel title="Next">
          <div className="flex flex-col gap-2 items-center">
            {s.queue.slice(0, Math.max(0, cfg.previewCount ?? 3)).map((t, i) => <PieceIcon key={i} type={t} />)}
          </div>
        </SidePanel>
      </div>

      <style>{`
        @keyframes tetris-pop {
          0%   { transform: translate(-50%, 0) scale(.8); opacity: 0; }
          15%  { transform: translate(-50%, 4px) scale(1.05); opacity: 1; }
          80%  { transform: translate(-50%, -6px) scale(1); opacity: 1; }
          100% { transform: translate(-50%,-24px) scale(.9); opacity: 0; }
        }
        @keyframes tetris-clear {
          0%   { filter: brightness(1); }
          40%  { filter: brightness(2.4) saturate(1.4); }
          100% { filter: brightness(1);  opacity: 0.35; }
        }
      `}</style>
    </GameShell>
  )
}

function BevelCell({ x, y, size, color, ghost, clearing }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x, top: y,
        width: size, height: size,
        padding: 1,
      }}
    >
      <div
        style={{
          width: '100%', height: '100%',
          background: ghost
            ? 'transparent'
            : `linear-gradient(160deg, ${color} 0%, ${shade(color, -0.25)} 100%)`,
          border: ghost ? `1.5px dashed ${color}88` : `1px solid ${shade(color, -0.4)}`,
          boxShadow: ghost
            ? 'none'
            : `inset 0 2px 0 ${shade(color, 0.35)}, inset 0 -2px 0 ${shade(color, -0.4)}, 0 1px 2px rgba(0,0,0,0.4)`,
          borderRadius: 3,
          position: 'relative',
          overflow: 'hidden',
          animation: clearing ? 'tetris-clear 160ms ease-out forwards' : undefined,
        }}
      >
        {!ghost && (
          <div style={{
            position: 'absolute',
            top: 2, left: 2, right: '50%', bottom: '55%',
            background: `linear-gradient(180deg, rgba(255,255,255,0.35), transparent)`,
            borderRadius: 2,
          }} />
        )}
      </div>
    </div>
  )
}

function shade(hex, amt) {
  const c = hex.replace('#', '')
  const num = parseInt(c, 16)
  let r = (num >> 16) & 0xff
  let g = (num >> 8) & 0xff
  let b = num & 0xff
  r = Math.max(0, Math.min(255, Math.round(r + (amt * 255))))
  g = Math.max(0, Math.min(255, Math.round(g + (amt * 255))))
  b = Math.max(0, Math.min(255, Math.round(b + (amt * 255))))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

function SidePanel({ title, children }) {
  return (
    <div className="flex-shrink-0 w-24 sm:w-28 luxe-card-alt rounded-xl bg-white/5 border border-white/10 p-3">
      <div className="text-[10px] uppercase tracking-widest text-white/40 mb-2">{title}</div>
      {children}
    </div>
  )
}

function PieceIcon({ type, dim }) {
  const cells = PIECES[type].cells[0]
  const color = PIECES[type].color
  const xs = cells.map(([x]) => x)
  const ys = cells.map(([, y]) => y)
  const minX = Math.min(...xs), minY = Math.min(...ys)
  const w = Math.max(...xs) - minX + 1
  const h = Math.max(...ys) - minY + 1
  const s = 12
  return (
    <div
      style={{
        width: 4 * s, height: 3 * s,
        position: 'relative',
        opacity: dim ? 0.35 : 1,
      }}
    >
      {cells.map(([cx, cy], i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: (cx - minX + (4 - w) / 2) * s,
            top:  (cy - minY + (3 - h) / 2) * s,
            width: s, height: s,
            background: `linear-gradient(160deg, ${color}, ${shade(color, -0.3)})`,
            border: `1px solid ${shade(color, -0.4)}`,
            borderRadius: 2,
            boxShadow: `inset 0 1px 0 ${shade(color, 0.35)}`,
          }}
        />
      ))}
    </div>
  )
}

function EmptyPiece() {
  return <div className="w-12 h-9 rounded border border-dashed border-white/15" />
}
