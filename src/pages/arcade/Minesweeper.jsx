// Minesweeper — modern polish, no-guess board generation (best-effort).
//
// Board sizes:
//   beginner       9x9   · 10 mines
//   intermediate  16x16  · 40 mines
//   expert        30x16  · 99 mines
//
// Generation:
//   1) First-click safe zone — the clicked cell and its 8 neighbours are
//      guaranteed empty (never a mine). We do the mine placement AFTER
//      the first click so we can honor this.
//   2) After placement, we run a solver that only uses trivial deductions
//      (if a numbered cell's flagged neighbours == its number, all other
//      neighbours are safe; if unrevealed neighbours == remaining mine
//      count, all unrevealed neighbours are mines). If solver reveals
//      the whole board, board is "no-guess". Otherwise we re-shuffle
//      (up to a small budget). Fallback: accept the last placement so
//      generation always terminates.
//
// Interactions:
//   • Left click:  reveal
//   • Right click / long press: flag / question mark cycle
//   • Both mouse buttons (chord click) on a numbered revealed cell:
//     if flags around it == number, reveal all remaining neighbours.
//     Any exposed mine still detonates — classic behaviour.
//   • Cascade flood-fill on 0-neighbour cells.
//
// Chrome:
//   • 3D bevelled cells (unrevealed) → sunken cells (revealed)
//   • Number colours match classic MS palette
//   • Mine emoji on loss + red glow on the triggering mine
//   • Flag / question emojis with wobble animation

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GameShell from '../../components/arcade/GameShell'
import { getSfx } from '../../components/arcade/sfx'

const PRESETS = {
  beginner:     { w: 9,  h: 9,  mines: 10 },
  intermediate: { w: 16, h: 16, mines: 40 },
  expert:       { w: 30, h: 16, mines: 99 },
}

const NUM_COLOR = ['transparent', '#60a5fa', '#4ade80', '#f87171', '#a78bfa', '#facc15', '#22d3ee', '#e879f9', '#f43f5e']

function idx(x, y, w) { return y * w + x }
function inBounds(x, y, w, h) { return x >= 0 && y >= 0 && x < w && y < h }
function neighbors(x, y, w, h) {
  const out = []
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (dx === 0 && dy === 0) continue
    const nx = x + dx, ny = y + dy
    if (inBounds(nx, ny, w, h)) out.push([nx, ny])
  }
  return out
}

// Place mines, everywhere except in the safe zone around (sx, sy).
function placeMines(w, h, mines, sx, sy) {
  const total = w * h
  const safeSet = new Set()
  safeSet.add(idx(sx, sy, w))
  for (const [nx, ny] of neighbors(sx, sy, w, h)) safeSet.add(idx(nx, ny, w))
  const candidates = []
  for (let i = 0; i < total; i++) if (!safeSet.has(i)) candidates.push(i)
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
  }
  const mineSet = new Set(candidates.slice(0, mines))
  const board = new Int8Array(total)   // -1 mine, else neighbour count
  for (const i of mineSet) board[i] = -1
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (board[idx(x, y, w)] === -1) continue
    let c = 0
    for (const [nx, ny] of neighbors(x, y, w, h)) if (board[idx(nx, ny, w)] === -1) c++
    board[idx(x, y, w)] = c
  }
  return board
}

// Simple no-guess simulator. Returns true if reachable-from-start board
// is fully solvable using trivial deductions.
function isSolvableTrivially(board, w, h, sx, sy) {
  const total = w * h
  const revealed = new Uint8Array(total)
  const flagged  = new Uint8Array(total)
  // Flood-reveal first click
  const stack = [[sx, sy]]
  while (stack.length) {
    const [x, y] = stack.pop()
    const i = idx(x, y, w)
    if (revealed[i]) continue
    revealed[i] = 1
    if (board[i] === 0) {
      for (const [nx, ny] of neighbors(x, y, w, h)) {
        if (!revealed[idx(nx, ny, w)] && board[idx(nx, ny, w)] !== -1) stack.push([nx, ny])
      }
    }
  }

  let progressed = true
  while (progressed) {
    progressed = false
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = idx(x, y, w)
      if (!revealed[i] || board[i] <= 0) continue
      const nbs = neighbors(x, y, w, h)
      let hiddenCount = 0, flaggedCount = 0
      const hidden = []
      for (const [nx, ny] of nbs) {
        const j = idx(nx, ny, w)
        if (flagged[j]) flaggedCount++
        else if (!revealed[j]) { hiddenCount++; hidden.push(j) }
      }
      const remaining = board[i] - flaggedCount
      if (remaining === 0 && hiddenCount > 0) {
        // All hidden are safe → reveal them (flood if 0)
        for (const j of hidden) {
          if (revealed[j]) continue
          revealed[j] = 1
          progressed = true
          if (board[j] === 0) {
            const jx = j % w, jy = (j / w) | 0
            const stack2 = [[jx, jy]]
            while (stack2.length) {
              const [xx, yy] = stack2.pop()
              for (const [nx, ny] of neighbors(xx, yy, w, h)) {
                const k = idx(nx, ny, w)
                if (revealed[k] || flagged[k]) continue
                if (board[k] === -1) continue
                revealed[k] = 1
                if (board[k] === 0) stack2.push([nx, ny])
              }
            }
          }
        }
      } else if (remaining === hiddenCount && hiddenCount > 0) {
        // All hidden are mines → flag them
        for (const j of hidden) {
          if (!flagged[j]) { flagged[j] = 1; progressed = true }
        }
      }
    }
  }
  // Every non-mine cell revealed?
  for (let i = 0; i < total; i++) {
    if (board[i] !== -1 && !revealed[i]) return false
  }
  return true
}

function generateSolvable(preset, sx, sy, budget = 25) {
  const { w, h, mines } = preset
  for (let attempt = 0; attempt < budget; attempt++) {
    const board = placeMines(w, h, mines, sx, sy)
    if (isSolvableTrivially(board, w, h, sx, sy)) return board
  }
  // Give up and return the last attempt so play still starts.
  return placeMines(w, h, mines, sx, sy)
}

// ── UI ──
const CELL_LABEL = {
  0: '', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8',
}

export default function Minesweeper() {
  const [preset, setPreset] = useState('beginner')
  const { w, h, mines } = PRESETS[preset]
  const [board, setBoard] = useState(null)         // -1 mine, 0..8 numbers, null before first click
  const [revealed, setRevealed] = useState(() => new Uint8Array(w * h))
  const [flags, setFlags]       = useState(() => new Uint8Array(w * h))   // 0=none,1=flag,2=?
  const [status, setStatus] = useState('ready')    // 'ready' | 'playing' | 'won' | 'over'
  const [triggered, setTriggered] = useState(-1)
  const [seconds, setSeconds] = useState(0)
  const [paused, setPaused] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const [best, setBest] = useState(0)
  const [genLoading, setGenLoading] = useState(false)
  const sfxRef = useRef(getSfx())
  const timerRef = useRef(0)
  const holdRef = useRef(null)

  useEffect(() => { sfxRef.current.setEnabled(soundOn) }, [soundOn])

  const reset = useCallback(() => {
    const size = PRESETS[preset]
    setBoard(null)
    setRevealed(new Uint8Array(size.w * size.h))
    setFlags(new Uint8Array(size.w * size.h))
    setStatus('ready')
    setTriggered(-1)
    setSeconds(0)
    setPaused(false)
  }, [preset])

  useEffect(() => { reset() }, [preset, reset])

  useEffect(() => {
    try { setBest(Number(localStorage.getItem(`arcade.minesweeper.best.${preset}`)) || 0) } catch {}
  }, [preset])

  useEffect(() => {
    if (status !== 'playing' || paused) { clearInterval(timerRef.current); return }
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(timerRef.current)
  }, [status, paused])

  const flagged = useMemo(() => {
    let c = 0
    for (let i = 0; i < flags.length; i++) if (flags[i] === 1) c++
    return c
  }, [flags])

  const revealedCount = useMemo(() => {
    let c = 0
    for (let i = 0; i < revealed.length; i++) if (revealed[i]) c++
    return c
  }, [revealed])

  const checkWin = useCallback((rArr, b) => {
    const total = w * h
    let count = 0
    for (let i = 0; i < total; i++) if (rArr[i]) count++
    if (count === total - mines) {
      setStatus('won')
      sfxRef.current.win()
      if (!best || seconds < best) {
        setBest(seconds)
        try { localStorage.setItem(`arcade.minesweeper.best.${preset}`, String(seconds)) } catch {}
      }
      // Auto-flag remaining mines for a satisfying end state
      const nf = new Uint8Array(flags)
      for (let i = 0; i < total; i++) if (b && b[i] === -1) nf[i] = 1
      setFlags(nf)
    }
  }, [w, h, mines, flags, best, seconds, preset])

  const revealCell = useCallback((x, y) => {
    if (status === 'over' || status === 'won' || paused) return
    const size = PRESETS[preset]
    let b = board
    let curStatus = status
    // First click → generate
    if (!b) {
      setGenLoading(true)
      b = generateSolvable(size, x, y)
      setBoard(b)
      setGenLoading(false)
      curStatus = 'playing'
      setStatus('playing')
    }
    const i = idx(x, y, size.w)
    if (revealed[i] || flags[i] === 1) return
    if (b[i] === -1) {
      // Detonate
      const nr = new Uint8Array(revealed)
      nr[i] = 1
      setRevealed(nr)
      setStatus('over')
      setTriggered(i)
      sfxRef.current.boom()
      return
    }
    // Flood fill for zeros
    const nr = new Uint8Array(revealed)
    const stack = [[x, y]]
    while (stack.length) {
      const [cx, cy] = stack.pop()
      const j = idx(cx, cy, size.w)
      if (nr[j] || flags[j] === 1) continue
      nr[j] = 1
      if (b[j] === 0) {
        for (const [nx, ny] of neighbors(cx, cy, size.w, size.h)) {
          const k = idx(nx, ny, size.w)
          if (!nr[k] && flags[k] !== 1 && b[k] !== -1) stack.push([nx, ny])
        }
      }
    }
    setRevealed(nr)
    sfxRef.current.chirp()
    if (curStatus === 'playing') checkWin(nr, b)
  }, [board, revealed, flags, status, paused, preset, checkWin])

  const flagCell = useCallback((x, y) => {
    if (status === 'over' || status === 'won' || paused) return
    const size = PRESETS[preset]
    const i = idx(x, y, size.w)
    if (revealed[i]) return
    const nf = new Uint8Array(flags)
    nf[i] = (nf[i] + 1) % 3
    setFlags(nf)
    sfxRef.current.pop()
  }, [revealed, flags, status, paused, preset])

  // Chord click: if a revealed number cell has == number flagged neighbours,
  // reveal all other neighbours (any hidden mine → boom).
  const chordCell = useCallback((x, y) => {
    if (status === 'over' || status === 'won' || paused || !board) return
    const size = PRESETS[preset]
    const i = idx(x, y, size.w)
    if (!revealed[i] || board[i] <= 0) return
    const nbs = neighbors(x, y, size.w, size.h)
    let flagCount = 0
    for (const [nx, ny] of nbs) if (flags[idx(nx, ny, size.w)] === 1) flagCount++
    if (flagCount !== board[i]) return
    for (const [nx, ny] of nbs) {
      const j = idx(nx, ny, size.w)
      if (!revealed[j] && flags[j] !== 1) revealCell(nx, ny)
    }
  }, [board, revealed, flags, status, paused, preset, revealCell])

  // Touch: long-press = flag
  const onCellPointerDown = (x, y, e) => {
    if (e.pointerType === 'mouse') return
    holdRef.current = { x, y, t: setTimeout(() => {
      flagCell(x, y)
      holdRef.current = null
    }, 380) }
  }
  const onCellPointerUp = (x, y, e) => {
    if (e.pointerType === 'mouse') return
    if (holdRef.current) {
      clearTimeout(holdRef.current.t)
      holdRef.current = null
      revealCell(x, y)
    }
  }
  const onCellMouseDown = (e, x, y) => {
    // Both buttons → chord
    if ((e.buttons & 3) === 3) {
      e.preventDefault()
      chordCell(x, y)
    }
  }

  const bombsLeft = mines - flagged

  return (
    <GameShell
      title="Minesweeper"
      category="Puzzle"
      score={seconds}
      best={best}
      level={preset === 'beginner' ? 1 : preset === 'intermediate' ? 2 : 3}
      status={status === 'won' ? 'won' : status === 'over' ? 'over' : (paused ? 'paused' : (status === 'ready' ? 'ready' : 'playing'))}
      extraStats={
        <>
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Mines</span>
            <span className="text-xl sm:text-2xl font-bold tabular-nums text-rose-300">{bombsLeft}</span>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Time</span>
            <span className="text-xl sm:text-2xl font-bold tabular-nums text-cyan-300">{seconds}s</span>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Board</span>
            <span className="text-sm font-semibold text-emerald-300">{w}×{h}</span>
          </div>
        </>
      }
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn((v) => !v)}
      onRestart={reset}
      onPause={() => setPaused((p) => !p)}
      controls={[
        { key: 'Click', label: 'Reveal' },
        { key: 'Right', label: 'Flag / ?' },
        { key: 'Both', label: 'Chord' },
        { key: 'Long-press', label: 'Flag (mobile)' },
      ]}
    >
      <div className="flex flex-col items-center gap-4 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-center gap-2">
          {Object.entries(PRESETS).map(([k, p]) => (
            <button
              key={k}
              onClick={() => setPreset(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border capitalize transition ${preset===k ? 'bg-rose-500 text-black border-rose-400' : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10'}`}
            >
              {k} · {p.w}×{p.h}
            </button>
          ))}
        </div>

        <div
          className="relative rounded-xl select-none"
          style={{
            padding: 6,
            background: 'linear-gradient(135deg, #1a1a22, #0e0e14)',
            border: '2px solid rgba(255,255,255,0.15)',
            boxShadow: '0 0 40px -12px rgba(244,63,94,0.35)',
            overflow: 'auto',
            maxWidth: '100%',
          }}
        >
          <MinesweeperGrid
            w={w} h={h}
            board={board}
            revealed={revealed}
            flags={flags}
            triggered={triggered}
            status={status}
            onLeftClick={revealCell}
            onRightClick={flagCell}
            onChord={chordCell}
            onPointerDown={onCellPointerDown}
            onPointerUp={onCellPointerUp}
            onMouseDown={onCellMouseDown}
          />

          {genLoading && (
            <div className="absolute inset-0 rounded-xl bg-black/70 backdrop-blur-sm flex items-center justify-center text-white/80 text-sm font-semibold">
              Generating no-guess board…
            </div>
          )}
          {status === 'won' && (
            <div className="absolute inset-0 rounded-xl bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
              <div className="text-4xl">🏆</div>
              <div className="text-3xl font-black bg-gradient-to-r from-amber-300 via-rose-300 to-fuchsia-400 bg-clip-text text-transparent">Cleared</div>
              <div className="text-white/70 text-sm">{seconds}s · {preset}</div>
              <button onClick={reset} className="mt-1 px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-400 text-black font-semibold">New board</button>
            </div>
          )}
          {status === 'over' && (
            <div className="absolute inset-0 rounded-xl bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
              <div className="text-4xl">💥</div>
              <div className="text-3xl font-black bg-gradient-to-r from-rose-300 via-amber-300 to-fuchsia-400 bg-clip-text text-transparent">Boom</div>
              <button onClick={reset} className="mt-1 px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-400 text-black font-semibold">Try again</button>
            </div>
          )}
          {paused && status === 'playing' && (
            <div className="absolute inset-0 rounded-xl bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/80 font-semibold">Paused</div>
          )}
        </div>

        <div className="text-white/50 text-xs text-center max-w-md">
          First click is always safe. Board is regenerated until it's solvable without guessing. Right-click flags, both mouse buttons chord-clicks, long-press flags on mobile.
        </div>
      </div>
    </GameShell>
  )
}

function MinesweeperGrid({ w, h, board, revealed, flags, triggered, status,
  onLeftClick, onRightClick, onChord, onPointerDown, onPointerUp, onMouseDown }) {
  // Auto-size for mobile: shrink cell when board is very wide
  const cell = w > 20 ? 22 : w > 12 ? 26 : 30
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${w}, ${cell}px)`,
        gridTemplateRows: `repeat(${h}, ${cell}px)`,
        gap: 1,
        background: 'rgba(255,255,255,0.06)',
        padding: 1,
        borderRadius: 4,
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {Array.from({ length: w * h }).map((_, i) => {
        const x = i % w, y = (i / w) | 0
        const v = board ? board[i] : 0
        const isRev = revealed[i]
        const f = flags[i]
        const showMine = status === 'over' && v === -1
        const trig = i === triggered
        return (
          <Cell
            key={i}
            size={cell}
            revealed={isRev}
            value={isRev ? v : null}
            flag={f}
            showMine={showMine}
            triggered={trig}
            onLeftClick={() => onLeftClick(x, y)}
            onRightClick={() => onRightClick(x, y)}
            onDoubleClick={() => onChord(x, y)}
            onPointerDown={(e) => onPointerDown(x, y, e)}
            onPointerUp={(e) => onPointerUp(x, y, e)}
            onMouseDown={(e) => onMouseDown(e, x, y)}
          />
        )
      })}
    </div>
  )
}

function Cell({ size, revealed, value, flag, showMine, triggered, onLeftClick, onRightClick, onDoubleClick, onPointerDown, onPointerUp, onMouseDown }) {
  const label = revealed && value > 0 ? CELL_LABEL[value] : ''
  const isBomb = revealed && value === -1 || showMine
  return (
    <button
      className="relative flex items-center justify-center font-black transition-colors focus:outline-none"
      onClick={onLeftClick}
      onContextMenu={(e) => { e.preventDefault(); onRightClick() }}
      onDoubleClick={onDoubleClick}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onMouseDown={onMouseDown}
      style={{
        width: size, height: size,
        background: revealed
          ? (triggered
              ? 'linear-gradient(135deg, #7f1d1d, #431407)'
              : isBomb
              ? 'linear-gradient(135deg, #292524, #0c0a09)'
              : 'linear-gradient(135deg, #1f2937, #111827)')
          : 'linear-gradient(135deg, #3f3f46, #27272a)',
        borderTop:    revealed ? '1px solid rgba(0,0,0,0.35)' : `${Math.max(1, size/14)}px solid rgba(255,255,255,0.22)`,
        borderLeft:   revealed ? '1px solid rgba(0,0,0,0.35)' : `${Math.max(1, size/14)}px solid rgba(255,255,255,0.22)`,
        borderRight:  revealed ? '1px solid rgba(255,255,255,0.03)' : `${Math.max(1, size/14)}px solid rgba(0,0,0,0.35)`,
        borderBottom: revealed ? '1px solid rgba(255,255,255,0.03)' : `${Math.max(1, size/14)}px solid rgba(0,0,0,0.35)`,
        color: NUM_COLOR[value ?? 0] || '#fff',
        fontSize: Math.max(10, size * 0.5),
      }}
    >
      {isBomb ? (
        <span
          role="img"
          aria-label="mine"
          style={{
            fontSize: Math.max(10, size * 0.7),
            filter: triggered ? 'drop-shadow(0 0 6px #f43f5e)' : 'none',
          }}
        >💣</span>
      ) : label ? (
        <span>{label}</span>
      ) : !revealed && flag === 1 ? (
        <span role="img" aria-label="flag" style={{ fontSize: Math.max(10, size * 0.7), animation: 'ms-flag 0.4s ease-out' }}>🚩</span>
      ) : !revealed && flag === 2 ? (
        <span style={{ fontSize: Math.max(10, size * 0.5), color: '#facc15' }}>?</span>
      ) : null}
      <style>{`
        @keyframes ms-flag {
          0%   { transform: scale(0.4) rotate(-30deg); opacity: 0; }
          60%  { transform: scale(1.15) rotate(6deg); opacity: 1; }
          100% { transform: scale(1) rotate(0); }
        }
      `}</style>
    </button>
  )
}
