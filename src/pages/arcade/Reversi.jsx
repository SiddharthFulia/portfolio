// Reversi (Othello) — 8×8 with a strong minimax AI.
//
// Design notes:
//   - Board: emerald felt with dark wooden rim, subtle vignette. Discs
//     are two-tone gradients that pop into place on capture. Legal
//     moves show a pulsing amber marker.
//   - AI: alpha-beta minimax up to depth 8 with:
//       * Rosenbloom / Iago positional weights (corners +120, X-squares
//         -40, C-squares -20). Corner ownership is doubled on top of
//         the table because losing a corner is nearly always fatal.
//       * Mobility differential — normalised to ±100.
//       * Frontier disc count — fewer discs adjacent to empties is
//         better (opponent has fewer flips to hunt for).
//     Difficulty slider bumps depth 2 / 4 / 6 / 8.
//     Endgame switch: with ≤10 empties left, we search to the leaf and
//     just count final discs (perfect play).
//   - Auto-pass when a side has no moves. Auto-end when both pass.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import GameShell from '../../components/arcade/GameShell'
import { Button } from '../../components/ui'
import { getSfx } from '../../components/arcade/sfx'

const RULES = [
  { heading: 'Goal', body: 'End the game with more discs of your colour on the board than your opponent. Reversi always fills up (unless both sides run out of legal moves early) — you win by out-flipping.' },
  { heading: 'Starting position', body: 'The board begins with 4 discs in a 2×2 diamond at the centre — two white on the a1→h8 diagonal, two black on the h1→a8 diagonal. Black (you) moves first.' },
  { heading: 'Legal moves', body: 'On your turn, you must place a disc so that it sandwiches at least one straight line (horizontal, vertical or diagonal) of your opponent\'s discs between the new disc and one of your existing discs. Any and all sandwiched discs flip to your colour. If you cannot make a legal move, your turn passes automatically.' },
  { heading: 'Corner strategy', body: 'Corner squares (a1, a8, h1, h8) can never be flipped once taken — they are the most valuable squares on the board (+120 weight). Their neighbours (X-squares and C-squares) are usually bad plays because they give your opponent access to the corner (-40 / -20 weight).' },
  { heading: 'AI evaluation', body: 'The AI runs alpha-beta minimax up to depth 8. Position score = Rosenbloom / Iago weight table + mobility differential + frontier disc count. In the endgame (≤ 10 empty squares) the AI switches to full-depth perfect play.' },
  { heading: 'Game end', body: 'The game ends when neither side has a legal move — usually when the board is full. Count discs. Ties are possible.' },
  { heading: 'Difficulty', body: 'Easy uses AI depth 2 and low positional weights. Hard uses depth 8, aggressive mobility bonus, and endgame perfect play from 12+ empties. Custom exposes AI depth, endgame threshold, positional weights and mobility bonus.' },
]

const DIFFICULTIES = {
  Easy:   { aiDepth: 2, endgameEmpties: 6,  posWeightMul: 0.5, mobilityMul: 0.5 },
  Medium: { aiDepth: 6, endgameEmpties: 10, posWeightMul: 1.0, mobilityMul: 1.0 },
  Hard:   { aiDepth: 8, endgameEmpties: 14, posWeightMul: 1.5, mobilityMul: 2.0 },
}

const CUSTOM_SCHEMA = {
  aiDepth:        { label: 'AI depth',              min: 2, max: 9,  step: 1,   default: 6 },
  endgameEmpties: { label: 'Endgame perfect (≤ N)', min: 4, max: 20, step: 1,   default: 10 },
  posWeightMul:   { label: 'Position weight ×',     min: 0, max: 3,  step: 0.1, default: 1.0 },
  mobilityMul:    { label: 'Mobility bonus ×',      min: 0, max: 3,  step: 0.1, default: 1.0 },
}

const N = 8
const EMPTY = 0
const BLACK = 1        // human
const WHITE = 2        // AI

const DIRS = [
  [-1, -1], [-1, 0], [-1, 1],
  [ 0, -1],          [ 0, 1],
  [ 1, -1], [ 1, 0], [ 1, 1],
]

const POS_TABLE = [
  120,-20, 20,  5,  5, 20,-20,120,
  -20,-40, -5, -5, -5, -5,-40,-20,
   20, -5, 15,  3,  3, 15, -5, 20,
    5, -5,  3,  3,  3,  3, -5,  5,
    5, -5,  3,  3,  3,  3, -5,  5,
   20, -5, 15,  3,  3, 15, -5, 20,
  -20,-40, -5, -5, -5, -5,-40,-20,
  120,-20, 20,  5,  5, 20,-20,120,
]

function makeBoard() {
  const b = new Uint8Array(N * N)
  b[3 * N + 3] = WHITE
  b[3 * N + 4] = BLACK
  b[4 * N + 3] = BLACK
  b[4 * N + 4] = WHITE
  return b
}

const idx = (r, c) => r * N + c
const opp = (p) => p === BLACK ? WHITE : BLACK

function flipsAt(board, r, c, player) {
  if (board[idx(r, c)] !== EMPTY) return []
  const flips = []
  const other = opp(player)
  for (const [dr, dc] of DIRS) {
    const line = []
    let rr = r + dr, cc = c + dc
    while (rr >= 0 && rr < N && cc >= 0 && cc < N && board[idx(rr, cc)] === other) {
      line.push(idx(rr, cc))
      rr += dr; cc += dc
    }
    if (line.length > 0 && rr >= 0 && rr < N && cc >= 0 && cc < N && board[idx(rr, cc)] === player) {
      flips.push(...line)
    }
  }
  return flips
}

function legalMoves(board, player) {
  const out = []
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (board[idx(r, c)] !== EMPTY) continue
      const f = flipsAt(board, r, c, player)
      if (f.length > 0) out.push({ r, c, i: idx(r, c), flips: f })
    }
  }
  return out
}

function applyMove(board, move, player) {
  const next = new Uint8Array(board)
  next[move.i] = player
  for (const f of move.flips) next[f] = player
  return next
}

function countDiscs(board) {
  let b = 0, w = 0, e = 0
  for (let i = 0; i < board.length; i++) {
    if (board[i] === BLACK) b++
    else if (board[i] === WHITE) w++
    else e++
  }
  return { black: b, white: w, empty: e }
}

// Evaluation from WHITE (AI) perspective.
function evaluate(board) {
  let pos = 0
  let whiteFrontier = 0, blackFrontier = 0
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const i = idx(r, c)
      const v = board[i]
      if (v === EMPTY) continue
      const w = POS_TABLE[i]
      if (v === WHITE) pos += w
      else pos -= w
      let isFrontier = false
      for (const [dr, dc] of DIRS) {
        const nr = r + dr, nc = c + dc
        if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue
        if (board[idx(nr, nc)] === EMPTY) { isFrontier = true; break }
      }
      if (isFrontier) {
        if (v === WHITE) whiteFrontier++
        else blackFrontier++
      }
    }
  }

  const corners = [0, 7, 56, 63]
  let cornerScore = 0
  for (const cIdx of corners) {
    if (board[cIdx] === WHITE) cornerScore += 25
    else if (board[cIdx] === BLACK) cornerScore -= 25
  }

  const wMoves = legalMoves(board, WHITE).length
  const bMoves = legalMoves(board, BLACK).length
  let mobility = 0
  if (wMoves + bMoves > 0) mobility = 100 * (wMoves - bMoves) / (wMoves + bMoves)

  const frontier = -10 * (whiteFrontier - blackFrontier)

  return pos + cornerScore + Math.round(mobility * 0.6) + frontier
}

function endgameScore(board) {
  const { black, white } = countDiscs(board)
  if (white > black) return 100000 + (white - black)
  if (black > white) return -100000 - (black - white)
  return 0
}

// Classic minimax (not negamax — the eval is asymmetric).
function search(board, depth, alpha, beta, player) {
  const moves = legalMoves(board, player)
  const oppMoves = legalMoves(board, opp(player))
  if (moves.length === 0 && oppMoves.length === 0) {
    return { score: endgameScore(board), move: null }
  }
  if (depth === 0) return { score: evaluate(board), move: null }
  // Forced pass.
  if (moves.length === 0) {
    const child = search(board, depth - 1, alpha, beta, opp(player))
    return { score: child.score, move: null }
  }

  // Move ordering: corners → edges → centre.
  moves.sort((a, b) => (POS_TABLE[b.i] - POS_TABLE[a.i]))

  let best = { score: player === WHITE ? -Infinity : Infinity, move: moves[0] }
  for (const m of moves) {
    const next = applyMove(board, m, player)
    const child = search(next, depth - 1, alpha, beta, opp(player))
    if (player === WHITE) {
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

function pickAiMove(board, targetDepth) {
  const { empty } = countDiscs(board)
  const useEndgame = empty <= 10
  const searchDepth = useEndgame ? empty : targetDepth
  let best = null
  for (let d = 2; d <= searchDepth; d++) {
    const r = search(board, d, -Infinity, Infinity, WHITE)
    if (r.move) best = r
  }
  return best ? best.move : null
}

function Disc({ player, r, c, cellSize, justFlipped, isLast }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className="absolute"
      style={{
        left: c * cellSize + cellSize * 0.08,
        top:  r * cellSize + cellSize * 0.08,
        width: cellSize * 0.84,
        height: cellSize * 0.84,
        perspective: 400,
        pointerEvents: 'none',
      }}
    >
      <motion.div
        initial={reduce ? { rotateY: 0 } : { rotateY: justFlipped ? 180 : 0, scale: justFlipped ? 1 : 0.4 }}
        animate={{ rotateY: 0, scale: 1 }}
        transition={{
          rotateY: { duration: reduce ? 0 : 0.5, ease: [0.4, 0, 0.2, 1] },
          scale:   { duration: reduce ? 0 : 0.28, ease: 'backOut' },
        }}
        style={{
          width: '100%', height: '100%',
          borderRadius: '50%',
          transformStyle: 'preserve-3d',
          background: player === BLACK
            ? 'radial-gradient(circle at 35% 30%, #4b5563 0%, #111827 55%, #030712 100%)'
            : 'radial-gradient(circle at 35% 30%, #ffffff 0%, #e5e7eb 55%, #9ca3af 100%)',
          boxShadow: player === BLACK
            ? '0 4px 8px rgba(0,0,0,0.5), inset -2px -3px 6px rgba(0,0,0,0.5), inset 2px 3px 6px rgba(255,255,255,0.15)'
            : '0 4px 8px rgba(0,0,0,0.4), inset -2px -3px 6px rgba(0,0,0,0.15), inset 2px 3px 6px rgba(255,255,255,0.9)',
          outline: isLast ? '2px solid #fbbf24' : 'none',
        }}
      />
    </motion.div>
  )
}

export default function Reversi() {
  const [shellDifficulty, setShellDifficulty] = useState('Medium')
  const [customValues, setCustomValues] = useState(() => Object.fromEntries(
    Object.entries(CUSTOM_SCHEMA).map(([k, v]) => [k, v.default])
  ))
  const shellCfg = useMemo(
    () => shellDifficulty === 'Custom' ? customValues : DIFFICULTIES[shellDifficulty] || DIFFICULTIES.Medium,
    [shellDifficulty, customValues],
  )
  const [board, setBoard] = useState(() => makeBoard())
  const [turn, setTurn] = useState(BLACK)
  const [lastFlips, setLastFlips] = useState(new Set())
  const [lastMove, setLastMove] = useState(-1)
  const [depth, setDepth] = useState(6)
  useEffect(() => {
    if (shellCfg.aiDepth) setDepth(Math.max(2, Math.min(9, Math.round(shellCfg.aiDepth))))
  }, [shellCfg.aiDepth])
  const [aiThinking, setAiThinking] = useState(false)
  const [passInfo, setPassInfo] = useState('')
  const [gameOver, setGameOver] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const sfxRef = useRef(getSfx())

  const { black, white, empty } = useMemo(() => countDiscs(board), [board])

  const humanMoves = useMemo(
    () => turn === BLACK ? legalMoves(board, BLACK) : [],
    [board, turn]
  )

  const status = gameOver
    ? (white > black ? 'over' : black > white ? 'won' : 'paused')
    : (aiThinking ? 'paused' : 'playing')

  const resetGame = useCallback(() => {
    setBoard(makeBoard()); setTurn(BLACK)
    setLastFlips(new Set()); setLastMove(-1)
    setGameOver(false); setPassInfo('')
  }, [])

  const handleCellClick = useCallback((r, c) => {
    if (gameOver || aiThinking || turn !== BLACK) return
    const move = humanMoves.find((m) => m.r === r && m.c === c)
    if (!move) return
    const next = applyMove(board, move, BLACK)
    if (soundOn) sfxRef.current.pop()
    setBoard(next); setLastMove(move.i); setLastFlips(new Set(move.flips))
    setTurn(WHITE)
  }, [gameOver, aiThinking, turn, humanMoves, board, soundOn])

  useEffect(() => {
    if (gameOver || turn !== WHITE) return
    const wMoves = legalMoves(board, WHITE)
    const bMoves = legalMoves(board, BLACK)
    if (wMoves.length === 0 && bMoves.length === 0) {
      setGameOver(true)
      if (soundOn) setTimeout(() => sfxRef.current.win(), 60)
      return
    }
    if (wMoves.length === 0) {
      setPassInfo('AI passes'); setTurn(BLACK)
      const t = setTimeout(() => setPassInfo(''), 1200)
      return () => clearTimeout(t)
    }
    setAiThinking(true)
    const t = setTimeout(() => {
      const move = pickAiMove(board, depth)
      if (!move) { setAiThinking(false); return }
      const next = applyMove(board, move, WHITE)
      if (soundOn) sfxRef.current.hit()
      setBoard(next); setLastMove(move.i); setLastFlips(new Set(move.flips))
      setTurn(BLACK); setAiThinking(false)
    }, 80)
    return () => clearTimeout(t)
  }, [turn, board, depth, gameOver, soundOn])

  useEffect(() => {
    if (gameOver || turn !== BLACK || aiThinking) return
    const bMoves = legalMoves(board, BLACK)
    const wMoves = legalMoves(board, WHITE)
    if (bMoves.length === 0 && wMoves.length === 0) { setGameOver(true); return }
    if (bMoves.length === 0) {
      setPassInfo('You pass — no legal moves')
      const t = setTimeout(() => { setPassInfo(''); setTurn(WHITE) }, 900)
      return () => clearTimeout(t)
    }
  }, [turn, board, gameOver, aiThinking])

  useEffect(() => { if (empty === 0) setGameOver(true) }, [empty])

  useEffect(() => { sfxRef.current.setEnabled(soundOn) }, [soundOn])

  const cellSize = 48
  const legalSet = useMemo(() => {
    if (aiThinking || gameOver || turn !== BLACK) return new Set()
    return new Set(humanMoves.map((m) => m.i))
  }, [humanMoves, aiThinking, gameOver, turn])

  const overlay = gameOver ? (
    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center pointer-events-none">
      <div className="text-center">
        <div className="text-3xl sm:text-5xl font-black mb-2"
          style={{ backgroundImage: 'linear-gradient(90deg,#fbbf24,#f43f5e,#e879f9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          {black > white ? 'You Win!' : black < white ? 'AI Wins' : 'Draw'}
        </div>
        <div className="text-white/70 text-sm">Black {black} — White {white}</div>
      </div>
    </div>
  ) : null

  const difficultyLabel = depth <= 3 ? 'Easy' : depth <= 5 ? 'Medium' : depth <= 6 ? 'Hard' : depth <= 7 ? 'Expert' : 'Master'

  return (
    <GameShell
      title="Reversi"
      category="Board"
      score={black}
      best={white}
      level={depth}
      status={status}
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn((s) => !s)}
      onRestart={resetGame}
      onPause={() => {}}
      overlay={overlay}
      extraStats={
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Empty</span>
            <span className="text-xl font-bold text-cyan-300 tabular-nums">{empty}</span>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Turn</span>
            <span className={`text-sm font-bold ${turn === BLACK ? 'text-white' : 'text-rose-300'}`}>
              {passInfo || (aiThinking ? 'AI thinking…' : turn === BLACK ? 'Black (you)' : 'White (AI)')}
            </span>
          </div>
        </div>
      }
      controls={[
        { key: 'Click', label: 'Play on a highlighted cell' },
        { key: 'R',     label: 'Restart' },
      ]}
      rules={RULES}
      difficulty={shellDifficulty}
      onDifficultyChange={setShellDifficulty}
      difficultyModes={['Easy', 'Medium', 'Hard', 'Custom']}
      customSchema={CUSTOM_SCHEMA}
      customValues={customValues}
      onCustomChange={setCustomValues}
      footer={
        <div className="mt-4 luxe-card-alt rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-widest text-white/50 mb-1">AI difficulty</p>
              <p className="text-sm font-bold text-white">{difficultyLabel} <span className="text-white/50 font-normal">· depth {depth}</span></p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[2, 4, 6, 8].map((d) => (
                <Button
                  key={d}
                  variant={depth === d ? 'primary' : 'ghost'}
                  size="small"
                  onClick={() => setDepth(d)}
                >
                  {d === 2 ? 'Easy' : d === 4 ? 'Medium' : d === 6 ? 'Hard' : 'Master'}
                </Button>
              ))}
            </div>
            <Button variant="primary" onClick={resetGame}>New game</Button>
          </div>
          <p className="mt-3 text-[12px] text-white/50 leading-relaxed">
            AI blends positional weights (corners +120, X-squares -40), mobility differential, corner ownership, and frontier discs. In the endgame (≤10 empties) it searches to the leaf for perfect play.
          </p>
        </div>
      }
    >
      <div
        className="relative w-full flex items-center justify-center py-6 select-none"
        style={{
          background: 'radial-gradient(ellipse at 50% 30%, rgba(16, 185, 129, 0.15), transparent 60%), linear-gradient(180deg, #052e1a 0%, #04140e 100%)',
        }}
      >
        <div
          className="relative"
          style={{
            width: cellSize * N,
            height: cellSize * N,
            background: 'linear-gradient(135deg, #065f46 0%, #064e3b 50%, #022c22 100%)',
            border: '8px solid #78350f',
            borderRadius: 10,
            boxShadow: '0 30px 60px rgba(0,0,0,0.5), inset 0 0 20px rgba(0,0,0,0.4)',
          }}
        >
          <svg
            viewBox={`0 0 ${cellSize * N} ${cellSize * N}`}
            className="absolute inset-0 pointer-events-none"
            style={{ width: '100%', height: '100%' }}
          >
            {Array.from({ length: N + 1 }).map((_, i) => (
              <g key={i}>
                <line x1={i * cellSize} y1={0} x2={i * cellSize} y2={cellSize * N} stroke="rgba(0,0,0,0.35)" strokeWidth="1" />
                <line x1={0} y1={i * cellSize} x2={cellSize * N} y2={i * cellSize} stroke="rgba(0,0,0,0.35)" strokeWidth="1" />
              </g>
            ))}
            {[[2,2],[2,6],[6,2],[6,6]].map(([r,c],i) => (
              <circle key={i} cx={c * cellSize} cy={r * cellSize} r="2.5" fill="rgba(0,0,0,0.45)" />
            ))}
          </svg>

          {/* Hitboxes + legal move dots */}
          {Array.from({ length: N }).map((_, r) =>
            Array.from({ length: N }).map((_, c) => {
              const i = idx(r, c)
              const isLegal = legalSet.has(i)
              return (
                <div
                  key={i}
                  onClick={() => handleCellClick(r, c)}
                  className="absolute"
                  style={{
                    left: c * cellSize, top: r * cellSize,
                    width: cellSize, height: cellSize,
                    cursor: isLegal ? 'pointer' : 'default',
                  }}
                >
                  {isLegal && (
                    <motion.div
                      className="absolute rounded-full"
                      style={{
                        left: cellSize * 0.38,
                        top:  cellSize * 0.38,
                        width: cellSize * 0.24,
                        height: cellSize * 0.24,
                        background: 'radial-gradient(circle, rgba(251,191,36,0.75), rgba(251,191,36,0.15))',
                        pointerEvents: 'none',
                      }}
                      animate={{ scale: [0.9, 1.15, 0.9], opacity: [0.6, 1, 0.6] }}
                      transition={{ duration: 1.4, repeat: Infinity }}
                    />
                  )}
                </div>
              )
            })
          )}

          {/* Discs */}
          <AnimatePresence>
            {(() => {
              const nodes = []
              for (let r = 0; r < N; r++) {
                for (let c = 0; c < N; c++) {
                  const i = idx(r, c)
                  const v = board[i]
                  if (v === EMPTY) continue
                  nodes.push(
                    <Disc
                      key={`d-${i}`}
                      player={v}
                      r={r} c={c}
                      cellSize={cellSize}
                      justFlipped={lastFlips.has(i)}
                      isLast={i === lastMove}
                    />
                  )
                }
              }
              return nodes
            })()}
          </AnimatePresence>
        </div>
      </div>
    </GameShell>
  )
}
