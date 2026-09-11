// 2048 — sliding tile merger with smooth animations.
//
// Design notes:
//   • Every "move" is a state transition that produces (a) the new grid
//     and (b) tile records with { id, value, merged, spawned } flags —
//     these drive the merge/spawn animations.
//   • Undo keeps the last 3 grid snapshots + score snapshots. Anything
//     more would let you brute-force the game.
//   • The 5x5 mode toggle only affects the initial grid size; scores
//     for 4x4 and 5x5 are tracked separately in localStorage.
//   • Swipe: horizontal beats vertical if |dx|>|dy|, threshold 24px.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GameShell from '../../components/arcade/GameShell'
import { getSfx } from '../../components/arcade/sfx'

// Tile visual palette — chosen to make each value distinct at a glance.
const TILE_STYLE = {
  2:    { bg: '#26262e', fg: '#e5e7eb', shadow: 'rgba(255,255,255,0.05)' },
  4:    { bg: '#2f2b2b', fg: '#f3f4f6', shadow: 'rgba(255,255,255,0.05)' },
  8:    { bg: 'linear-gradient(135deg,#f59e0b,#f97316)', fg: '#000', shadow: 'rgba(245,158,11,0.35)' },
  16:   { bg: 'linear-gradient(135deg,#f97316,#ef4444)', fg: '#fff', shadow: 'rgba(249,115,22,0.35)' },
  32:   { bg: 'linear-gradient(135deg,#ef4444,#e11d48)', fg: '#fff', shadow: 'rgba(239,68,68,0.35)' },
  64:   { bg: 'linear-gradient(135deg,#e11d48,#be185d)', fg: '#fff', shadow: 'rgba(225,29,72,0.4)' },
  128:  { bg: 'linear-gradient(135deg,#be185d,#7c3aed)', fg: '#fff', shadow: 'rgba(190,24,93,0.5)' },
  256:  { bg: 'linear-gradient(135deg,#7c3aed,#4f46e5)', fg: '#fff', shadow: 'rgba(124,58,237,0.55)' },
  512:  { bg: 'linear-gradient(135deg,#4f46e5,#0ea5e9)', fg: '#fff', shadow: 'rgba(79,70,229,0.6)' },
  1024: { bg: 'linear-gradient(135deg,#0ea5e9,#06b6d4)', fg: '#001b26', shadow: 'rgba(14,165,233,0.7)' },
  2048: { bg: 'linear-gradient(135deg,#facc15,#f59e0b,#ef4444)', fg: '#000', shadow: 'rgba(250,204,21,0.7)' },
  4096: { bg: 'linear-gradient(135deg,#22c55e,#84cc16)', fg: '#001b0a', shadow: 'rgba(34,197,94,0.7)' },
  8192: { bg: 'linear-gradient(135deg,#22d3ee,#a855f7,#ec4899)', fg: '#fff', shadow: 'rgba(168,85,247,0.7)' },
}

const fontFor = (v) => v < 100 ? 40 : v < 1000 ? 34 : v < 10000 ? 28 : 22

let idCounter = 1
const nextId = () => idCounter++

function newTile(value) {
  return { id: nextId(), value, merged: false, spawned: true }
}

function emptyGrid(n) {
  return Array.from({ length: n }, () => Array(n).fill(null))
}

function coordsFor(grid) {
  const n = grid.length
  const out = []
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out.push({ x, y })
  return out
}

function spawnRandom(grid) {
  const empties = coordsFor(grid).filter(({ x, y }) => !grid[y][x])
  if (!empties.length) return grid
  const spot = empties[(Math.random() * empties.length) | 0]
  const value = Math.random() < 0.9 ? 2 : 4
  grid[spot.y][spot.x] = newTile(value)
  return grid
}

function cloneGrid(grid) {
  return grid.map((row) => row.map((c) => (c ? { ...c, merged: false, spawned: false } : null)))
}

function slideRowLeft(row) {
  const n = row.length
  const filled = row.filter(Boolean).map((t) => ({ ...t, merged: false, spawned: false }))
  const out = []
  let gained = 0
  for (let i = 0; i < filled.length; i++) {
    const a = filled[i]
    const b = filled[i + 1]
    if (b && a.value === b.value) {
      const merged = { id: nextId(), value: a.value * 2, merged: true, spawned: false }
      out.push(merged)
      gained += merged.value
      i++
    } else {
      out.push(a)
    }
  }
  while (out.length < n) out.push(null)
  return { row: out, gained }
}

function moveLeft(grid) {
  let gained = 0, changed = false
  const out = grid.map((row) => {
    const before = row.map((t) => t?.id ?? null)
    const { row: nr, gained: g } = slideRowLeft(row)
    gained += g
    const after = nr.map((t) => t?.id ?? null)
    if (before.length !== after.length ||
        before.some((v, i) => v !== after[i])) changed = true
    return nr
  })
  return { grid: out, gained, changed }
}

function transpose(grid) {
  const n = grid.length
  const out = Array.from({ length: n }, () => Array(n).fill(null))
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out[x][y] = grid[y][x]
  return out
}

function reverseRows(grid) {
  return grid.map((row) => row.slice().reverse())
}

function applyMove(grid, dir) {
  let g = cloneGrid(grid)
  if (dir === 'left') {
    return moveLeft(g)
  } else if (dir === 'right') {
    const rev = reverseRows(g)
    const { grid: mg, gained, changed } = moveLeft(rev)
    return { grid: reverseRows(mg), gained, changed }
  } else if (dir === 'up') {
    const t = transpose(g)
    const { grid: mg, gained, changed } = moveLeft(t)
    return { grid: transpose(mg), gained, changed }
  } else if (dir === 'down') {
    const t = transpose(g)
    const rev = reverseRows(t)
    const { grid: mg, gained, changed } = moveLeft(rev)
    return { grid: transpose(reverseRows(mg)), gained, changed }
  }
  return { grid: g, gained: 0, changed: false }
}

function isGameOver(grid) {
  const n = grid.length
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!grid[y][x]) return false
    if (x + 1 < n && grid[y][x + 1]?.value === grid[y][x].value) return false
    if (y + 1 < n && grid[y + 1][x]?.value === grid[y][x].value) return false
  }
  return true
}

function has2048(grid) {
  return grid.flat().some((t) => t && t.value >= 2048)
}

export default function Twenty48() {
  const [size, setSize] = useState(() => {
    try { return Number(localStorage.getItem('arcade.2048.size')) || 4 } catch { return 4 }
  })
  const [grid, setGrid] = useState(() => spawnRandom(spawnRandom(emptyGrid(4))))
  const [score, setScore] = useState(0)
  const [best4, setBest4] = useState(() => Number(localStorage.getItem('arcade.2048.best.4') || 0))
  const [best5, setBest5] = useState(() => Number(localStorage.getItem('arcade.2048.best.5') || 0))
  const [history, setHistory] = useState([])
  const [status, setStatus] = useState('playing')
  const [reached2048, setReached2048] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const [paused, setPaused] = useState(false)
  const [popup, setPopup] = useState(null)
  const sfxRef = useRef(getSfx())

  const best = size === 4 ? best4 : best5

  useEffect(() => { sfxRef.current.setEnabled(soundOn) }, [soundOn])

  useEffect(() => {
    try { localStorage.setItem('arcade.2048.size', String(size)) } catch {}
    setGrid(spawnRandom(spawnRandom(emptyGrid(size))))
    setScore(0)
    setHistory([])
    setStatus('playing')
    setReached2048(false)
  }, [size])

  const move = useCallback((dir) => {
    if (status === 'over' || paused) return
    const { grid: ng, gained, changed } = applyMove(grid, dir)
    if (!changed) return
    setHistory((h) => [{ grid: cloneGrid(grid), score }, ...h].slice(0, 3))
    let after = ng
    after = spawnRandom(cloneGrid(after))
    setGrid(after)
    const newScore = score + gained
    setScore(newScore)
    if (gained > 0) {
      sfxRef.current.pop()
      setPopup({ text: `+${gained}`, ts: Date.now() })
    } else {
      sfxRef.current.chirp()
    }
    if (size === 4 && newScore > best4) { setBest4(newScore); try { localStorage.setItem('arcade.2048.best.4', String(newScore)) } catch {} }
    if (size === 5 && newScore > best5) { setBest5(newScore); try { localStorage.setItem('arcade.2048.best.5', String(newScore)) } catch {} }
    if (!reached2048 && has2048(after)) {
      setReached2048(true)
      setStatus('won')
      sfxRef.current.win()
      setTimeout(() => setStatus('playing'), 3200)
    }
    setTimeout(() => {
      if (isGameOver(after)) {
        setStatus('over')
        sfxRef.current.death()
      }
    }, 200)
  }, [grid, score, status, paused, size, best4, best5, reached2048])

  const undo = useCallback(() => {
    if (!history.length || paused) return
    const [last, ...rest] = history
    setGrid(last.grid)
    setScore(last.score)
    setHistory(rest)
    setStatus('playing')
    sfxRef.current.chirp()
  }, [history, paused])

  const reset = useCallback(() => {
    setGrid(spawnRandom(spawnRandom(emptyGrid(size))))
    setScore(0)
    setHistory([])
    setStatus('playing')
    setReached2048(false)
  }, [size])

  useEffect(() => {
    if (!popup) return
    const t = setTimeout(() => setPopup(null), 900)
    return () => clearTimeout(t)
  }, [popup])

  useEffect(() => {
    const onKey = (e) => {
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','w','a','s','d','W','A','S','D','h','H'].includes(e.key)) e.preventDefault()
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') move('left')
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') move('right')
      else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') move('up')
      else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') move('down')
      else if (e.key === 'u' || e.key === 'U' || e.key === 'z') undo()
      else if (e.key === 'p' || e.key === 'P') setPaused((p) => !p)
    }
    window.addEventListener('keydown', onKey, { passive: false })
    return () => window.removeEventListener('keydown', onKey)
  }, [move, undo])

  const touchRef = useRef(null)
  const onTouchStart = (e) => {
    const t = e.touches[0]
    touchRef.current = { x: t.clientX, y: t.clientY }
  }
  const onTouchEnd = (e) => {
    const st = touchRef.current
    if (!st) return
    const t = e.changedTouches[0]
    const dx = t.clientX - st.x
    const dy = t.clientY - st.y
    const TH = 24
    if (Math.max(Math.abs(dx), Math.abs(dy)) < TH) return
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left')
    else                              move(dy > 0 ? 'down' : 'up')
    touchRef.current = null
  }

  const CELL = size === 4 ? 88 : 70
  const GAP  = 10
  const boardPx = size * CELL + (size + 1) * GAP

  const tiles = useMemo(() => {
    const list = []
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const t = grid[y][x]
      if (t) list.push({ ...t, x, y })
    }
    return list
  }, [grid, size])

  const anyMovesLeft = useMemo(() => !isGameOver(grid), [grid])

  return (
    <GameShell
      title="2048"
      category="Puzzle"
      score={score}
      best={best}
      level={size === 4 ? 1 : 2}
      status={status === 'won' ? 'won' : status === 'over' ? 'over' : (paused ? 'paused' : 'playing')}
      extraStats={
        <>
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Mode</span>
            <span className="text-sm font-semibold text-cyan-300">{size}×{size}</span>
          </div>
          {history.length > 0 && (
            <div className="flex flex-col items-start">
              <span className="text-[10px] uppercase tracking-widest text-white/40">Undo</span>
              <span className="text-sm font-semibold text-emerald-300">{history.length}/3</span>
            </div>
          )}
        </>
      }
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn((v) => !v)}
      onRestart={reset}
      onPause={() => setPaused((p) => !p)}
      controls={[
        { key: '↑↓←→', label: 'Slide' },
        { key: 'WASD', label: 'Slide (alt)' },
        { key: 'U / Z', label: 'Undo' },
        { key: 'Swipe', label: 'Mobile' },
      ]}
    >
      <div className="flex flex-col items-center gap-4 p-3 sm:p-6">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSize(4)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${size===4 ? 'bg-amber-500 text-black border-amber-400' : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10'}`}
          >4×4 Classic</button>
          <button
            onClick={() => setSize(5)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${size===5 ? 'bg-amber-500 text-black border-amber-400' : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10'}`}
          >5×5 Endless</button>
          <button
            onClick={undo}
            disabled={!history.length}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border bg-white/5 text-white/70 border-white/10 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
          >Undo</button>
        </div>

        <div
          className="relative rounded-2xl select-none touch-none"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          style={{
            width: boardPx,
            height: boardPx,
            padding: GAP,
            background: 'linear-gradient(135deg, #1a1a22, #0e0e14)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 12px 40px -20px rgba(244,114,182,0.5)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {Array.from({ length: size * size }).map((_, i) => {
            const x = i % size, y = Math.floor(i / size)
            return (
              <div
                key={`bg-${i}`}
                className="absolute rounded-lg"
                style={{
                  left: GAP + x * (CELL + GAP),
                  top:  GAP + y * (CELL + GAP),
                  width: CELL, height: CELL,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.05)',
                }}
              />
            )
          })}

          {tiles.map((t) => {
            const style = TILE_STYLE[t.value] || TILE_STYLE[8192]
            return (
              <div
                key={t.id}
                className="absolute rounded-lg flex items-center justify-center font-black transition-all duration-150 ease-out"
                style={{
                  width: CELL, height: CELL,
                  left: GAP + t.x * (CELL + GAP),
                  top:  GAP + t.y * (CELL + GAP),
                  background: style.bg,
                  color: style.fg,
                  fontSize: fontFor(t.value) * (size === 5 ? 0.8 : 1),
                  boxShadow: `0 4px 20px -6px ${style.shadow}, inset 0 1px 0 rgba(255,255,255,0.15)`,
                  animation: t.merged
                    ? 'ta-merge 260ms ease-out'
                    : t.spawned
                    ? 'ta-spawn 220ms ease-out'
                    : undefined,
                }}
              >
                {t.value}
              </div>
            )
          })}

          {popup && (
            <div
              className="absolute right-3 top-3 pointer-events-none text-lg font-bold text-amber-300"
              style={{ animation: 'ta-popup 800ms ease-out forwards' }}
            >
              {popup.text}
            </div>
          )}

          {status === 'won' && (
            <div className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center gap-3 bg-black/60 backdrop-blur-sm">
              <div className="text-4xl font-black bg-gradient-to-r from-amber-300 via-rose-300 to-fuchsia-400 bg-clip-text text-transparent">
                2048 unlocked
              </div>
              <div className="text-white/70 text-sm">Keep going for higher tiles</div>
            </div>
          )}

          {status === 'over' && (
            <div className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center gap-3 bg-black/60 backdrop-blur-sm">
              <div className="text-4xl font-black bg-gradient-to-r from-amber-300 via-rose-300 to-fuchsia-400 bg-clip-text text-transparent">Grid locked</div>
              <div className="text-white/70 text-sm">Score {score.toLocaleString()}</div>
              <button onClick={reset} className="mt-1 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold">
                New game
              </button>
            </div>
          )}

          {paused && status === 'playing' && (
            <div className="absolute inset-0 rounded-2xl flex items-center justify-center bg-black/60 backdrop-blur-sm text-white/80 font-semibold">
              Paused
            </div>
          )}
        </div>

        <div className="text-center max-w-md">
          <div className="text-white/50 text-xs">
            Slide the whole board with arrow keys or swipe. Equal tiles combine. Reach {size === 4 ? '2048' : '4096'} to trigger the win pop — keep going for higher stacks.
          </div>
          {!anyMovesLeft && status !== 'over' && (
            <div className="text-rose-300 text-xs mt-2">No moves left — press R to reset.</div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes ta-spawn {
          0%   { transform: scale(0.2); opacity: 0.3; }
          60%  { transform: scale(1.06); opacity: 1; }
          100% { transform: scale(1); }
        }
        @keyframes ta-merge {
          0%   { transform: scale(1); }
          40%  { transform: scale(1.20); filter: brightness(1.4); }
          100% { transform: scale(1); }
        }
        @keyframes ta-popup {
          0%   { transform: translateY(0) scale(0.8); opacity: 0; }
          20%  { transform: translateY(-4px) scale(1.1); opacity: 1; }
          100% { transform: translateY(-30px) scale(0.9); opacity: 0; }
        }
      `}</style>
    </GameShell>
  )
}
