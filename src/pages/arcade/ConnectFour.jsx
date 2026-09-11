// Connect Four — 7×6 grid, alpha-beta minimax AI up to depth 8.
//
// Design notes:
//   - Board: navy panel with drilled holes revealing pieces. Pieces
//     drop with a spring bounce (framer-motion) to the resting row.
//   - AI: negamax with alpha-beta pruning, iterative deepening up to the
//     configured depth. Move ordering prefers centre columns first (huge
//     alpha-beta boost). Transposition table stores exact / lower / upper
//     bounds keyed by a board-state string. Evaluator counts open 2/3-in-
//     a-rows across the 69 possible winning lines. Terminal wins score
//     `1e6 + depthRemaining` so shorter wins beat longer ones.
//   - Winning line glows amber-rose on victory + confetti burst.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import GameShell from '../../components/arcade/GameShell'
import { Button, Slider } from '../../components/ui'
import { getSfx } from '../../components/arcade/sfx'

const COLS = 7
const ROWS = 6
const EMPTY = 0
const HUMAN = 1
const AI    = 2

// All 69 four-in-a-row lines pre-computed once. Each entry is an
// array of 4 cell indices (row*COLS + col). Used for both win-detection
// and evaluation — hot path, so caching this is worth ~15% speedup.
const LINES = (() => {
  const lines = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (c + 3 < COLS) lines.push([r*COLS+c, r*COLS+c+1, r*COLS+c+2, r*COLS+c+3])
      if (r + 3 < ROWS) lines.push([r*COLS+c, (r+1)*COLS+c, (r+2)*COLS+c, (r+3)*COLS+c])
      if (r + 3 < ROWS && c + 3 < COLS)
        lines.push([r*COLS+c, (r+1)*COLS+c+1, (r+2)*COLS+c+2, (r+3)*COLS+c+3])
      if (r - 3 >= 0 && c + 3 < COLS)
        lines.push([r*COLS+c, (r-1)*COLS+c+1, (r-2)*COLS+c+2, (r-3)*COLS+c+3])
    }
  }
  return lines
})()

const idx = (r, c) => r * COLS + c
const emptyBoard = () => new Uint8Array(ROWS * COLS)

function nextRow(board, c) {
  for (let r = ROWS - 1; r >= 0; r--) if (board[idx(r, c)] === EMPTY) return r
  return -1
}

function checkWin(board, player) {
  for (const line of LINES) {
    if (board[line[0]] === player && board[line[1]] === player &&
        board[line[2]] === player && board[line[3]] === player) return line
  }
  return null
}

function isDraw(board) {
  for (let c = 0; c < COLS; c++) if (board[idx(0, c)] === EMPTY) return false
  return true
}

// Static eval. Positive = AI favoured.
function evaluate(board) {
  let score = 0
  // Centre column bonus — centre touches 4 lines vs 3 for edges.
  for (let r = 0; r < ROWS; r++) {
    const v = board[idx(r, 3)]
    if (v === AI) score += 3
    else if (v === HUMAN) score -= 3
  }
  for (const line of LINES) {
    let ai = 0, human = 0
    for (const i of line) {
      const v = board[i]
      if (v === AI) ai++
      else if (v === HUMAN) human++
    }
    if (ai > 0 && human > 0) continue
    if (ai === 4) return 100000
    if (human === 4) return -100000
    if (ai === 3) score += 50
    else if (ai === 2) score += 10
    else if (human === 3) score -= 60
    else if (human === 2) score -= 10
  }
  return score
}

// Centre-first move ordering.
const MOVE_ORDER = [3, 2, 4, 1, 5, 0, 6]
function legalCols(board) {
  const out = []
  for (const c of MOVE_ORDER) if (board[idx(0, c)] === EMPTY) out.push(c)
  return out
}

// Negamax + alpha-beta + transposition table. Score is from side-to-move
// perspective (negamax convention). sign = +1 when AI is to move.
function search(board, depth, alpha, beta, sign, tt) {
  const key = board.join('') + sign
  const cached = tt.get(key)
  if (cached && cached.depth >= depth) {
    if (cached.flag === 0) return cached
    if (cached.flag === 1 && cached.score <= alpha) return cached
    if (cached.flag === 2 && cached.score >= beta) return cached
  }
  if (depth === 0) return { score: evaluate(board) * sign, move: -1, flag: 0 }

  const player = sign === 1 ? AI : HUMAN
  const moves = legalCols(board)
  if (moves.length === 0) return { score: 0, move: -1, flag: 0 }

  let bestScore = -Infinity
  let bestMove = moves[0]
  const alphaOrig = alpha

  for (const c of moves) {
    const r = nextRow(board, c)
    if (r < 0) continue
    board[idx(r, c)] = player
    if (checkWin(board, player)) {
      board[idx(r, c)] = EMPTY
      return { score: 1_000_000 + depth, move: c, flag: 0 }
    }
    const child = search(board, depth - 1, -beta, -alpha, -sign, tt)
    board[idx(r, c)] = EMPTY
    const val = -child.score
    if (val > bestScore) { bestScore = val; bestMove = c }
    if (val > alpha) alpha = val
    if (alpha >= beta) break
  }

  let flag = 0
  if (bestScore <= alphaOrig) flag = 1
  else if (bestScore >= beta) flag = 2
  tt.set(key, { score: bestScore, move: bestMove, depth, flag })
  return { score: bestScore, move: bestMove, flag }
}

function pickAiMove(board, maxDepth) {
  const tt = new Map()
  let best = { move: 3, score: 0 }
  for (let d = 1; d <= maxDepth; d++) {
    const res = search(new Uint8Array(board), d, -Infinity, Infinity, 1, tt)
    best = res
    if (Math.abs(res.score) > 500_000) break
  }
  return best.move
}

// Confetti burst on win.
function Confetti({ active }) {
  const reduce = useReducedMotion()
  const pieces = useMemo(() => {
    const out = []
    for (let i = 0; i < 60; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 220 + Math.random() * 200
      out.push({
        id: i,
        x: Math.cos(angle) * speed,
        y: Math.sin(angle) * speed - 200,
        rot: Math.random() * 720 - 360,
        color: ['#fbbf24', '#f43f5e', '#e879f9', '#22d3ee', '#34d399'][i % 5],
        size: 6 + Math.random() * 6,
      })
    }
    return out
  }, [])
  if (!active || reduce) return null
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
      {pieces.map((p) => (
        <motion.div
          key={p.id}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{ x: p.x, y: p.y + 500, opacity: 0, rotate: p.rot }}
          transition={{ duration: 1.6, ease: 'easeOut' }}
          className="absolute"
          style={{ width: p.size, height: p.size * 1.4, background: p.color, borderRadius: 2 }}
        />
      ))}
    </div>
  )
}

export default function ConnectFour() {
  const [board, setBoard] = useState(() => emptyBoard())
  const [turn, setTurn] = useState(HUMAN)
  const [winner, setWinner] = useState(0)              // 0 | HUMAN | AI | -1 (draw)
  const [winLine, setWinLine] = useState(null)
  const [hoverCol, setHoverCol] = useState(-1)
  const [depth, setDepth] = useState(6)
  const [aiThinking, setAiThinking] = useState(false)
  const [wins, setWins] = useState({ human: 0, ai: 0, draws: 0 })
  const [soundOn, setSoundOn] = useState(true)
  const [lastMove, setLastMove] = useState(-1)
  const sfxRef = useRef(getSfx())
  const reduce = useReducedMotion()

  const status = winner
    ? (winner === HUMAN ? 'won' : winner === AI ? 'over' : 'paused')
    : (aiThinking ? 'paused' : 'playing')

  const resetGame = useCallback((swapFirst = false) => {
    setBoard(emptyBoard()); setWinner(0); setWinLine(null)
    setLastMove(-1); setHoverCol(-1); setTurn(swapFirst ? AI : HUMAN)
  }, [])

  const drop = useCallback((currentBoard, col, player) => {
    const r = nextRow(currentBoard, col)
    if (r < 0) return null
    const next = new Uint8Array(currentBoard)
    next[idx(r, col)] = player
    return { board: next, row: r, cell: idx(r, col) }
  }, [])

  const handleColClick = useCallback((col) => {
    if (winner || turn !== HUMAN || aiThinking) return
    const res = drop(board, col, HUMAN)
    if (!res) return
    if (soundOn) sfxRef.current.pop()
    setBoard(res.board); setLastMove(res.cell)
    const win = checkWin(res.board, HUMAN)
    if (win) {
      setWinner(HUMAN); setWinLine(win)
      setWins((w) => ({ ...w, human: w.human + 1 }))
      if (soundOn) setTimeout(() => sfxRef.current.win(), 100)
      return
    }
    if (isDraw(res.board)) {
      setWinner(-1); setWins((w) => ({ ...w, draws: w.draws + 1 })); return
    }
    setTurn(AI)
  }, [board, winner, turn, aiThinking, drop, soundOn])

  useEffect(() => {
    if (winner || turn !== AI) return
    setAiThinking(true)
    const t = setTimeout(() => {
      const move = pickAiMove(board, depth)
      const res = drop(board, move, AI)
      if (!res) { setAiThinking(false); return }
      if (soundOn) sfxRef.current.hit()
      setBoard(res.board); setLastMove(res.cell)
      const win = checkWin(res.board, AI)
      if (win) {
        setWinner(AI); setWinLine(win)
        setWins((w) => ({ ...w, ai: w.ai + 1 }))
        if (soundOn) setTimeout(() => sfxRef.current.death(), 100)
      } else if (isDraw(res.board)) {
        setWinner(-1); setWins((w) => ({ ...w, draws: w.draws + 1 }))
      } else {
        setTurn(HUMAN)
      }
      setAiThinking(false)
    }, 40)
    return () => clearTimeout(t)
  }, [turn, winner, board, depth, drop, soundOn])

  useEffect(() => { sfxRef.current.setEnabled(soundOn) }, [soundOn])

  const cellSize = 56
  const boardWidth = cellSize * COLS
  const boardHeight = cellSize * ROWS

  const boardCells = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = idx(r, c)
      const v = board[i]
      const inWin = winLine?.includes(i)
      boardCells.push({ r, c, i, v, inWin })
    }
  }

  const difficultyLabel = depth <= 4 ? 'Easy' : depth <= 5 ? 'Medium' : depth <= 6 ? 'Hard' : depth <= 7 ? 'Expert' : 'Master'

  const overlay = winner ? (
    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center pointer-events-none">
      <div className="text-center">
        <div className="text-4xl sm:text-5xl font-black mb-2"
          style={{ backgroundImage: 'linear-gradient(90deg,#fbbf24,#f43f5e,#e879f9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          {winner === HUMAN ? 'You Win!' : winner === AI ? 'AI Wins' : 'Draw'}
        </div>
        <div className="text-white/70 text-sm">Press Restart for another round</div>
      </div>
      <Confetti active={winner === HUMAN} />
    </div>
  ) : null

  return (
    <GameShell
      title="Connect Four"
      category="Board"
      score={wins.human}
      best={wins.ai}
      level={depth}
      status={status}
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn((s) => !s)}
      onRestart={() => resetGame(false)}
      onPause={() => {}}
      overlay={overlay}
      extraStats={
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Draws</span>
            <span className="text-xl font-bold text-cyan-300 tabular-nums">{wins.draws}</span>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Turn</span>
            <span className={`text-sm font-bold ${turn === HUMAN ? 'text-amber-300' : 'text-rose-300'}`}>
              {aiThinking ? 'AI thinking…' : turn === HUMAN ? 'Yours' : 'AI'}
            </span>
          </div>
        </div>
      }
      controls={[
        { key: 'Click', label: 'Drop a piece in a column' },
        { key: 'R',     label: 'Restart' },
      ]}
      footer={
        <div className="mt-4 luxe-card-alt rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-widest text-white/50 mb-1">AI difficulty</p>
              <p className="text-sm font-bold text-white">{difficultyLabel} <span className="text-white/50 font-normal">· depth {depth}</span></p>
            </div>
            <div className="w-full sm:w-56">
              <Slider min={4} max={8} value={depth} onChange={setDepth} accent="rose" />
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => resetGame(true)}>AI starts</Button>
              <Button variant="primary" onClick={() => resetGame(false)}>New game</Button>
            </div>
          </div>
          <p className="mt-3 text-[12px] text-white/50 leading-relaxed">
            Alpha-beta minimax with iterative deepening + transposition table. At depth 8 the engine evaluates hundreds of thousands of positions per move — beating it requires forcing a double threat.
          </p>
        </div>
      }
    >
      <div
        className="relative w-full flex items-center justify-center py-6 sm:py-8 select-none"
        style={{
          background: 'radial-gradient(ellipse at 50% 30%, rgba(59, 130, 246, 0.15), transparent 60%), linear-gradient(180deg, #0a0f1a 0%, #060a12 100%)',
        }}
      >
        <svg
          viewBox={`0 0 ${boardWidth} ${boardHeight + cellSize}`}
          style={{ width: 'min(100%, 520px)', maxWidth: '100%', height: 'auto' }}
          className="touch-manipulation"
        >
          <defs>
            <linearGradient id="woodGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%"  stopColor="#1e40af" />
              <stop offset="50%" stopColor="#1e3a8a" />
              <stop offset="100%" stopColor="#1e293b" />
            </linearGradient>
            <radialGradient id="humanGrad" cx="0.4" cy="0.35" r="0.7">
              <stop offset="0%" stopColor="#fef3c7" />
              <stop offset="45%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#b45309" />
            </radialGradient>
            <radialGradient id="aiGrad" cx="0.4" cy="0.35" r="0.7">
              <stop offset="0%" stopColor="#fecdd3" />
              <stop offset="45%" stopColor="#f43f5e" />
              <stop offset="100%" stopColor="#881337" />
            </radialGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2.5" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <mask id="boardHoles">
              <rect x="0" y={cellSize} width={boardWidth} height={boardHeight} fill="white" />
              {boardCells.map((c) => (
                <circle
                  key={`m-${c.i}`}
                  cx={c.c * cellSize + cellSize / 2}
                  cy={c.r * cellSize + cellSize + cellSize / 2}
                  r={cellSize * 0.4}
                  fill="black"
                />
              ))}
            </mask>
          </defs>

          {/* Hover preview */}
          {!winner && !aiThinking && turn === HUMAN && hoverCol >= 0 && nextRow(board, hoverCol) >= 0 && (
            <circle
              cx={hoverCol * cellSize + cellSize / 2}
              cy={cellSize / 2}
              r={cellSize * 0.38}
              fill="url(#humanGrad)"
              opacity="0.55"
            />
          )}

          {/* Column hitboxes (invisible, above the board) */}
          {Array.from({ length: COLS }).map((_, c) => (
            <rect
              key={`hit-${c}`}
              x={c * cellSize} y={0}
              width={cellSize} height={boardHeight + cellSize}
              fill="transparent"
              onClick={() => handleColClick(c)}
              onMouseEnter={() => setHoverCol(c)}
              onMouseLeave={() => setHoverCol((h) => h === c ? -1 : h)}
              style={{ cursor: winner || turn !== HUMAN || aiThinking ? 'default' : 'pointer' }}
            />
          ))}

          {/* Pieces — behind the board so holes reveal them */}
          <g>
            <AnimatePresence>
              {boardCells.filter((c) => c.v !== EMPTY).map((c) => (
                <motion.circle
                  key={`p-${c.i}`}
                  cx={c.c * cellSize + cellSize / 2}
                  cy={c.r * cellSize + cellSize + cellSize / 2}
                  r={cellSize * 0.4}
                  fill={c.v === HUMAN ? 'url(#humanGrad)' : 'url(#aiGrad)'}
                  filter={c.inWin ? 'url(#glow)' : undefined}
                  initial={reduce
                    ? { opacity: 0 }
                    : { cy: cellSize / 2, opacity: 0 }}
                  animate={{
                    cy: c.r * cellSize + cellSize + cellSize / 2,
                    opacity: 1,
                    scale: c.inWin ? [1, 1.12, 1] : 1,
                  }}
                  transition={{
                    cy:      { type: 'spring', stiffness: 380, damping: 22, mass: 0.9 },
                    opacity: { duration: 0.12 },
                    scale:   { duration: 1.2, repeat: c.inWin ? Infinity : 0, repeatType: 'loop' },
                  }}
                />
              ))}
            </AnimatePresence>
            {/* Piece rim highlights */}
            {boardCells.filter((c) => c.v !== EMPTY).map((c) => (
              <circle
                key={`h-${c.i}`}
                cx={c.c * cellSize + cellSize / 2 - cellSize * 0.10}
                cy={c.r * cellSize + cellSize + cellSize / 2 - cellSize * 0.10}
                r={cellSize * 0.10}
                fill="white"
                opacity="0.28"
                pointerEvents="none"
              />
            ))}
            {/* Last-move marker */}
            {lastMove >= 0 && (() => {
              const lr = Math.floor(lastMove / COLS)
              const lc = lastMove % COLS
              return (
                <circle
                  cx={lc * cellSize + cellSize / 2}
                  cy={lr * cellSize + cellSize + cellSize / 2}
                  r={cellSize * 0.44}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                  opacity="0.6"
                  pointerEvents="none"
                />
              )
            })()}
          </g>

          {/* Board on top with holes cut out */}
          <rect
            x="0" y={cellSize}
            width={boardWidth} height={boardHeight}
            fill="url(#woodGrad)"
            mask="url(#boardHoles)"
            pointerEvents="none"
            rx="10"
          />

          {/* Winning line highlight */}
          {winLine && (() => {
            const a = winLine[0], b = winLine[3]
            const ax = (a % COLS) * cellSize + cellSize / 2
            const ay = Math.floor(a / COLS) * cellSize + cellSize + cellSize / 2
            const bx = (b % COLS) * cellSize + cellSize / 2
            const by = Math.floor(b / COLS) * cellSize + cellSize + cellSize / 2
            return (
              <line
                x1={ax} y1={ay} x2={bx} y2={by}
                stroke="#fbbf24" strokeWidth="4" strokeLinecap="round"
                opacity="0.75" filter="url(#glow)" pointerEvents="none"
              />
            )
          })()}
        </svg>
      </div>
    </GameShell>
  )
}
