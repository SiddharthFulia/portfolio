// Checkers (English draughts) — 8×8, 12 pieces per side.
//
// Rules implemented:
//   • Diagonal moves on dark squares only.
//   • Forced captures (jumps): if a jump is available, the player MUST
//     jump. Non-capturing moves are hidden when captures exist.
//   • Multi-jump chains: after a jump, if more jumps are available with
//     the same piece, the chain continues until no more.
//   • King promotion when a man reaches the back rank. Kings move
//     and jump both diagonals.
//
// AI: alpha-beta minimax on the move tree. Evaluator counts material
// (kings = 3× men), positional weight (advancing pawns, centre control),
// and back-row control. Difficulty slider bumps depth 4 / 6 / 8. Move
// ordering prioritises multi-captures for stronger pruning.
//
// UI: click to select, click to move. Valid destinations glow emerald.
// Undo unwinds the last full ply. Colour themes: 'wood', 'stone', 'crimson'.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import GameShell from '../../components/arcade/GameShell'
import { Button } from '../../components/ui'
import { getSfx } from '../../components/arcade/sfx'

const N = 8
const EMPTY = 0
const HUMAN_MAN  = 1
const HUMAN_KING = 2
const AI_MAN     = 3
const AI_KING    = 4

const isHuman = (v) => v === HUMAN_MAN || v === HUMAN_KING
const isAI    = (v) => v === AI_MAN    || v === AI_KING
const isKing  = (v) => v === HUMAN_KING || v === AI_KING
const owner   = (v) => isHuman(v) ? 'human' : isAI(v) ? 'ai' : null

const DIRS_HUMAN = [[-1, -1], [-1, 1]]
const DIRS_AI    = [[ 1, -1], [ 1, 1]]
const DIRS_ALL   = [[-1, -1], [-1, 1], [ 1, -1], [ 1, 1]]

const idx = (r, c) => r * N + c
const inBounds = (r, c) => r >= 0 && r < N && c >= 0 && c < N

function initialBoard() {
  const b = new Uint8Array(N * N)
  // AI (top) on rows 0..2, on dark squares (r+c) is odd.
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < N; c++) if ((r + c) % 2 === 1) b[idx(r, c)] = AI_MAN
  // Human (bottom) on rows 5..7.
  for (let r = 5; r < N; r++)
    for (let c = 0; c < N; c++) if ((r + c) % 2 === 1) b[idx(r, c)] = HUMAN_MAN
  return b
}

function dirsFor(v) {
  if (isKing(v)) return DIRS_ALL
  if (v === HUMAN_MAN) return DIRS_HUMAN
  if (v === AI_MAN)    return DIRS_AI
  return []
}

// All legal moves for `side`. Each move: { from, path, captures, becomesKing }.
// If ANY capture exists for the side, only captures are returned (forced-capture rule).
function legalMoves(board, side) {
  const captures = []
  const quiet = []
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const v = board[idx(r, c)]
      if (v === EMPTY) continue
      if (owner(v) !== side) continue
      const chains = findCaptureChains(board, r, c, v, [], new Set())
      if (chains.length > 0) {
        for (const ch of chains) {
          captures.push({ from: idx(r, c), path: ch.path, captures: ch.caps, becomesKing: ch.becomesKing })
        }
        continue
      }
      for (const [dr, dc] of dirsFor(v)) {
        const nr = r + dr, nc = c + dc
        if (!inBounds(nr, nc)) continue
        if (board[idx(nr, nc)] !== EMPTY) continue
        const becomesKing = (v === HUMAN_MAN && nr === 0) || (v === AI_MAN && nr === N - 1)
        quiet.push({ from: idx(r, c), path: [idx(nr, nc)], captures: [], becomesKing })
      }
    }
  }
  return captures.length > 0 ? captures : quiet
}

// Recursive capture-chain finder.
function findCaptureChains(board, r, c, piece, pathSoFar, capsSoFar) {
  const results = []
  const dirs = dirsFor(piece)
  let extended = false
  for (const [dr, dc] of dirs) {
    const mr = r + dr, mc = c + dc
    const lr = r + 2 * dr, lc = c + 2 * dc
    if (!inBounds(lr, lc)) continue
    const midIdx = idx(mr, mc)
    if (capsSoFar.has(midIdx)) continue
    const mid = board[midIdx]
    if (mid === EMPTY) continue
    if (owner(mid) === owner(piece)) continue
    if (board[idx(lr, lc)] !== EMPTY) continue
    extended = true
    const newCaps = new Set(capsSoFar); newCaps.add(midIdx)
    const newPath = [...pathSoFar, idx(lr, lc)]
    let nextPiece = piece
    let becameKing = false
    if (piece === HUMAN_MAN && lr === 0) { nextPiece = HUMAN_KING; becameKing = true }
    if (piece === AI_MAN    && lr === N - 1) { nextPiece = AI_KING; becameKing = true }
    if (becameKing) {
      results.push({ path: newPath, caps: [...newCaps], becomesKing: true })
      continue
    }
    const sub = findCaptureChains(board, lr, lc, nextPiece, newPath, newCaps)
    if (sub.length === 0) {
      results.push({ path: newPath, caps: [...newCaps], becomesKing: false })
    } else {
      results.push(...sub)
    }
  }
  if (!extended && pathSoFar.length === 0) return []
  return results
}

function applyMove(board, move) {
  const next = new Uint8Array(board)
  const from = move.from
  const to = move.path[move.path.length - 1]
  let piece = next[from]
  next[from] = EMPTY
  for (const c of move.captures) next[c] = EMPTY
  const toR = Math.floor(to / N)
  if (piece === HUMAN_MAN && toR === 0) piece = HUMAN_KING
  if (piece === AI_MAN    && toR === N - 1) piece = AI_KING
  next[to] = piece
  return next
}

function countPieces(board) {
  let hMen = 0, hKing = 0, aMen = 0, aKing = 0
  for (let i = 0; i < board.length; i++) {
    const v = board[i]
    if (v === HUMAN_MAN) hMen++
    else if (v === HUMAN_KING) hKing++
    else if (v === AI_MAN) aMen++
    else if (v === AI_KING) aKing++
  }
  return { hMen, hKing, aMen, aKing }
}

// Eval from AI perspective.
function evaluate(board) {
  let score = 0
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const v = board[idx(r, c)]
      if (v === EMPTY) continue
      const centre = 4 - Math.abs(3.5 - c) - Math.abs(3.5 - r) * 0.5
      if (v === AI_MAN)         score += 100 + r * 3 + centre
      else if (v === AI_KING)   score += 300 + centre
      else if (v === HUMAN_MAN) score -= 100 + (N - 1 - r) * 3 + centre
      else if (v === HUMAN_KING) score -= 300 + centre
    }
  }
  return score
}

function search(board, depth, alpha, beta, side) {
  const moves = legalMoves(board, side)
  if (moves.length === 0) {
    return { score: side === 'ai' ? -100000 - depth : 100000 + depth, move: null }
  }
  if (depth === 0) return { score: evaluate(board), move: null }
  moves.sort((a, b) => b.captures.length - a.captures.length)
  let best = { score: side === 'ai' ? -Infinity : Infinity, move: moves[0] }
  for (const m of moves) {
    const next = applyMove(board, m)
    const child = search(next, depth - 1, alpha, beta, side === 'ai' ? 'human' : 'ai')
    if (side === 'ai') {
      if (child.score > best.score) best = { score: child.score, move: m }
      if (best.score > alpha) alpha = best.score
    } else {
      if (child.score < best.score) best = { score: child.score, move: m }
      if (best.score < beta) beta = best.score
    }
    if (alpha >= beta) break
  }
  return best
}

function pickAiMove(board, depth) {
  const r = search(board, depth, -Infinity, Infinity, 'ai')
  return r.move
}

const THEMES = {
  wood: {
    light: 'linear-gradient(135deg,#f5deb3,#e6c088)',
    dark:  'linear-gradient(135deg,#8b4513,#5c3210)',
    rim:   '#3b2508',
    label: 'Wood',
  },
  stone: {
    light: 'linear-gradient(135deg,#e5e7eb,#9ca3af)',
    dark:  'linear-gradient(135deg,#374151,#111827)',
    rim:   '#0f172a',
    label: 'Stone',
  },
  crimson: {
    light: 'linear-gradient(135deg,#fecaca,#fca5a5)',
    dark:  'linear-gradient(135deg,#7f1d1d,#450a0a)',
    rim:   '#450a0a',
    label: 'Crimson',
  },
}

const Crown = ({ size, color }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill={color} style={{ pointerEvents: 'none' }}>
    <path d="M4 18h16v2H4v-2zM6 16l-2-8 5 4 3-6 3 6 5-4-2 8H6z" />
  </svg>
)

export default function Checkers() {
  const [board, setBoard] = useState(() => initialBoard())
  const [turn, setTurn] = useState('human')
  const [selected, setSelected] = useState(-1)
  const [depth, setDepth] = useState(6)
  const [aiThinking, setAiThinking] = useState(false)
  const [gameOver, setGameOver] = useState(null)
  const [theme, setTheme] = useState('wood')
  const [soundOn, setSoundOn] = useState(true)
  const [history, setHistory] = useState([])
  const sfxRef = useRef(getSfx())

  const T = THEMES[theme]
  const { hMen, hKing, aMen, aKing } = useMemo(() => countPieces(board), [board])
  const humanCount = hMen + hKing
  const aiCount = aMen + aKing

  const humanMoves = useMemo(
    () => turn === 'human' ? legalMoves(board, 'human') : [],
    [board, turn]
  )
  const movesFromSelected = useMemo(
    () => humanMoves.filter((m) => m.from === selected),
    [humanMoves, selected]
  )

  const status = gameOver
    ? (gameOver === 'human' ? 'won' : gameOver === 'ai' ? 'over' : 'paused')
    : (aiThinking ? 'paused' : 'playing')

  const resetGame = useCallback(() => {
    setBoard(initialBoard()); setTurn('human'); setSelected(-1)
    setGameOver(null); setHistory([])
  }, [])

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h
      const last = h[h.length - 1]
      setBoard(last.board); setTurn(last.turn)
      setGameOver(null); setSelected(-1)
      return h.slice(0, -1)
    })
  }, [])

  const doMove = useCallback((move, side) => {
    const next = applyMove(board, move)
    setHistory((h) => [...h, { board, turn }])
    setBoard(next); setSelected(-1)
    if (move.captures.length > 0) {
      if (soundOn) sfxRef.current.hit()
    } else {
      if (soundOn) sfxRef.current.pop()
    }
    setTurn(side === 'human' ? 'ai' : 'human')
  }, [board, turn, soundOn])

  const handleCellClick = useCallback((r, c) => {
    if (gameOver || aiThinking || turn !== 'human') return
    const i = idx(r, c)
    const v = board[i]
    if (isHuman(v)) {
      if (humanMoves.some((m) => m.from === i)) setSelected(i)
      return
    }
    if (selected < 0) return
    const move = movesFromSelected.find((m) => m.path[m.path.length - 1] === i)
    if (!move) return
    doMove(move, 'human')
  }, [board, gameOver, aiThinking, turn, humanMoves, movesFromSelected, selected, doMove])

  useEffect(() => {
    if (gameOver || turn !== 'ai') return
    const aiMoves = legalMoves(board, 'ai')
    if (aiMoves.length === 0) { setGameOver('human'); return }
    setAiThinking(true)
    const t = setTimeout(() => {
      const move = pickAiMove(board, depth)
      if (!move) { setGameOver('human'); setAiThinking(false); return }
      doMove(move, 'ai')
      setAiThinking(false)
    }, 60)
    return () => clearTimeout(t)
  }, [turn, board, depth, gameOver, doMove])

  useEffect(() => {
    if (gameOver) return
    if (humanCount === 0) { setGameOver('ai'); return }
    if (aiCount === 0) { setGameOver('human'); return }
    if (turn === 'human' && humanMoves.length === 0 && !aiThinking) { setGameOver('ai'); return }
  }, [humanCount, aiCount, humanMoves.length, turn, aiThinking, gameOver])

  useEffect(() => { sfxRef.current.setEnabled(soundOn) }, [soundOn])

  const cellSize = 56
  const destSet = useMemo(
    () => new Set(movesFromSelected.map((m) => m.path[m.path.length - 1])),
    [movesFromSelected]
  )

  const overlay = gameOver ? (
    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center pointer-events-none">
      <div className="text-center">
        <div className="text-3xl sm:text-5xl font-black mb-2"
          style={{ backgroundImage: 'linear-gradient(90deg,#fbbf24,#f43f5e,#e879f9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          {gameOver === 'human' ? 'You Win!' : gameOver === 'ai' ? 'AI Wins' : 'Draw'}
        </div>
      </div>
    </div>
  ) : null

  const difficultyLabel = depth <= 4 ? 'Easy' : depth <= 6 ? 'Hard' : 'Master'

  return (
    <GameShell
      title="Checkers"
      category="Board"
      score={humanCount}
      best={aiCount}
      level={depth}
      status={status}
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn((s) => !s)}
      onRestart={resetGame}
      onPause={undo}
      overlay={overlay}
      extraStats={
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Kings</span>
            <span className="text-xl font-bold text-amber-300 tabular-nums">{hKing} / {aKing}</span>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Turn</span>
            <span className={`text-sm font-bold ${turn === 'human' ? 'text-amber-300' : 'text-rose-300'}`}>
              {aiThinking ? 'AI thinking…' : turn === 'human' ? 'Your move' : 'AI'}
            </span>
          </div>
        </div>
      }
      controls={[
        { key: 'Click',  label: 'Select piece, then destination' },
        { key: 'Pause',  label: 'Undo (last pair of plies)' },
        { key: 'R',      label: 'Restart' },
      ]}
      footer={
        <div className="mt-4 luxe-card-alt rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between flex-wrap">
            <div>
              <p className="text-[11px] uppercase tracking-widest text-white/50 mb-1">AI difficulty</p>
              <p className="text-sm font-bold text-white">{difficultyLabel} <span className="text-white/50 font-normal">· depth {depth}</span></p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[4, 6, 8].map((d) => (
                <Button
                  key={d}
                  variant={depth === d ? 'primary' : 'ghost'}
                  size="small"
                  onClick={() => setDepth(d)}
                >
                  {d === 4 ? 'Easy' : d === 6 ? 'Hard' : 'Master'}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] uppercase tracking-widest text-white/50">Theme</span>
              {Object.keys(THEMES).map((k) => (
                <Button
                  key={k}
                  variant={theme === k ? 'primary' : 'ghost'}
                  size="small"
                  onClick={() => setTheme(k)}
                >
                  {THEMES[k].label}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={undo} disabled={history.length === 0}>Undo</Button>
              <Button variant="primary" onClick={resetGame}>New game</Button>
            </div>
          </div>
          <p className="mt-3 text-[12px] text-white/50 leading-relaxed">
            Forced captures on. Multi-jumps chain automatically. Alpha-beta minimax with king-weighted material (kings 3× men), advancement bonus, and centre-control term.
          </p>
        </div>
      }
    >
      <div
        className="relative w-full flex items-center justify-center py-6 select-none"
        style={{
          background: 'radial-gradient(ellipse at 50% 30%, rgba(139,69,19,0.15), transparent 60%), linear-gradient(180deg, #0f0803 0%, #060403 100%)',
        }}
      >
        <div
          className="relative"
          style={{
            width: cellSize * N,
            height: cellSize * N,
            border: `10px solid ${T.rim}`,
            borderRadius: 8,
            boxShadow: '0 30px 60px rgba(0,0,0,0.5), inset 0 0 20px rgba(0,0,0,0.4)',
          }}
        >
          {Array.from({ length: N }).map((_, r) =>
            Array.from({ length: N }).map((_, c) => {
              const dark = (r + c) % 2 === 1
              const i = idx(r, c)
              const isSelected = selected === i
              const isDest = destSet.has(i)
              return (
                <div
                  key={i}
                  onClick={() => handleCellClick(r, c)}
                  className="absolute"
                  style={{
                    left: c * cellSize, top: r * cellSize,
                    width: cellSize, height: cellSize,
                    background: dark ? T.dark : T.light,
                    cursor: dark && turn === 'human' && !aiThinking && !gameOver ? 'pointer' : 'default',
                    boxShadow: isSelected ? 'inset 0 0 0 3px #fbbf24'
                             : isDest ? 'inset 0 0 0 3px #34d399' : 'none',
                  }}
                >
                  {isDest && (
                    <motion.div
                      className="absolute inset-0 flex items-center justify-center pointer-events-none"
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 1.2, repeat: Infinity }}
                    >
                      <div style={{
                        width: cellSize * 0.35, height: cellSize * 0.35,
                        borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(52,211,153,0.7), transparent)',
                      }} />
                    </motion.div>
                  )}
                </div>
              )
            })
          )}

          {Array.from({ length: N }).map((_, r) =>
            Array.from({ length: N }).map((_, c) => {
              const i = idx(r, c)
              const v = board[i]
              if (v === EMPTY) return null
              const human = isHuman(v)
              const king = isKing(v)
              return (
                <motion.div
                  key={`p-${i}-${v}`}
                  className="absolute flex items-center justify-center"
                  style={{
                    left: c * cellSize, top: r * cellSize,
                    width: cellSize, height: cellSize,
                    pointerEvents: 'none',
                  }}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                >
                  <div style={{
                    width: cellSize * 0.72, height: cellSize * 0.72,
                    borderRadius: '50%',
                    background: human
                      ? 'radial-gradient(circle at 35% 30%, #fecaca 0%, #f43f5e 50%, #7f1d1d 100%)'
                      : 'radial-gradient(circle at 35% 30%, #d1d5db 0%, #374151 50%, #030712 100%)',
                    boxShadow: '0 3px 6px rgba(0,0,0,0.5), inset -2px -3px 6px rgba(0,0,0,0.35), inset 2px 3px 5px rgba(255,255,255,0.18)',
                    outline: selected === i ? '2px solid #fbbf24' : 'none',
                    outlineOffset: 2,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {king && <Crown size={cellSize * 0.36} color="#fef3c7" />}
                  </div>
                </motion.div>
              )
            })
          )}
        </div>
      </div>
    </GameShell>
  )
}
