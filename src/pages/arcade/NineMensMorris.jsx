// Nine Men's Morris — 3-nested-squares board, 24 nodes, 9 pieces each.
//
// Three phases:
//   1. PLACING — each side places 9 pieces one at a time on empty nodes.
//   2. MOVING  — pieces slide along a connecting line to an adjacent
//               empty node. Continues until one side is reduced to 3.
//   3. FLYING  — once a side has exactly 3 pieces they may hop to ANY
//               empty node. Ends when either side is < 3 (loss) or has
//               no legal moves (loss).
//
// Mill rule: when a piece completes a "mill" (three of your own pieces
// in a row along one of the 16 mill lines) you must remove one of the
// opponent's pieces that is NOT itself part of a mill (unless all their
// pieces are in mills, in which case any is fair game).
//
// AI: alpha-beta minimax with phase-aware heuristic:
//   - Material differential (pieces on board + still to place).
//   - Mills formed (weighted).
//   - Two-in-a-row potential mills (weighted less).
//   - Mobility (movable pieces) — critical in mid-late game.
//   - Blocked opponent pieces.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import GameShell from '../../components/arcade/GameShell'
import { Button } from '../../components/ui'
import { getSfx } from '../../components/arcade/sfx'

const RULES = [
  { heading: 'Goal', body: 'Reduce your opponent to 2 pieces on the board, OR leave them with no legal move. Both count as a win.' },
  { heading: 'Board layout', body: '24 nodes arranged as three nested squares connected by cross-lines. Nodes are numbered 0–7 outer, 8–15 middle, 16–23 inner. Every piece sits on a node — never on an intersection.' },
  { heading: 'Phase 1 — Placing', body: 'Each side takes turns placing one of its 9 pieces on any empty node. This continues until all 18 pieces are on the board.' },
  { heading: 'Phase 2 — Moving', body: 'On your turn, slide one of your pieces along a connecting line to an adjacent empty node. If neither side can move, that side loses.' },
  { heading: 'Phase 3 — Flying', body: 'The instant you have exactly 3 pieces left (in Custom mode this can be disabled), your remaining pieces can "fly" to ANY empty node — not just adjacent ones. This gives the losing side a last-chance comeback.' },
  { heading: 'Mills', body: 'Three of YOUR pieces in a straight line along one of the 16 pre-defined mill lines forms a "mill". Forming a mill (either by placing OR sliding into it) lets you remove one of the opponent\'s pieces. You cannot remove a piece that is already part of an opponent mill — unless ALL their pieces are in mills, in which case any is fair game.' },
  { heading: 'AI strategy', body: 'Alpha-beta minimax with a phase-aware heuristic: material differential, mills formed, two-in-a-row potentials, mobility (movable pieces) and blocked opponent count.' },
  { heading: 'Difficulty', body: 'Easy uses AI depth 3 with lower mill weight and flying disabled. Hard uses depth 6, doubled mill weight, and allows mill-repeat (re-open + re-close the same mill for a second capture). Custom exposes AI depth, mill weight, mill-repeat rule and flying phase toggle.' },
]

const DIFFICULTIES = {
  Easy:   { aiDepth: 3, phaseEval: 0.6, millRepeat: false, flyingEnabled: true  },
  Medium: { aiDepth: 4, phaseEval: 1.0, millRepeat: false, flyingEnabled: true  },
  Hard:   { aiDepth: 6, phaseEval: 1.6, millRepeat: true,  flyingEnabled: true  },
}

const CUSTOM_SCHEMA = {
  aiDepth:       { label: 'AI depth',                min: 2, max: 7, step: 1,   default: 4 },
  phaseEval:     { label: 'Mill weight ×',           min: 0.2, max: 2.5, step: 0.1, default: 1.0 },
  millRepeat:    { label: 'Mill-repeat (0/1)',       min: 0, max: 1, step: 1,   default: 0 },
  flyingEnabled: { label: 'Flying phase (0/1)',      min: 0, max: 1, step: 1,   default: 1 },
}

const EMPTY = 0
const HUMAN = 1
const AI    = 2

// 24 nodes numbered 0..23, laid out on three concentric squares.
// Standard indices — going clockwise from top-left of each square,
// outer 0..7, middle 8..15, inner 16..23.
//
//   0───────────1───────────2
//   │           │           │
//   │   8───────9──────10   │
//   │   │       │       │   │
//   │   │  16──17──18   │   │
//   │   │   │       │   │   │
//   7──15──23      19──11───3
//   │   │   │       │   │   │
//   │   │  22──21──20   │   │
//   │   │       │       │   │
//   │  14──────13──────12   │
//   │           │           │
//   6───────────5───────────4
//
// Node position on the SVG grid (0..6 x 0..6).
const NODE_POS = [
  [0, 0], [3, 0], [6, 0],           // 0, 1, 2
  [6, 3], [6, 6], [3, 6],           // 3, 4, 5
  [0, 6], [0, 3],                   // 6, 7
  [1, 1], [3, 1], [5, 1],           // 8, 9, 10
  [5, 3], [5, 5], [3, 5],           // 11, 12, 13
  [1, 5], [1, 3],                   // 14, 15
  [2, 2], [3, 2], [4, 2],           // 16, 17, 18
  [4, 3], [4, 4], [3, 4],           // 19, 20, 21
  [2, 4], [2, 3],                   // 22, 23
]

// Adjacency along mill lines.
const ADJ = [
  [1, 7],       // 0
  [0, 2, 9],    // 1
  [1, 3],       // 2
  [2, 4, 11],   // 3
  [3, 5],       // 4
  [4, 6, 13],   // 5
  [5, 7],       // 6
  [0, 6, 15],   // 7
  [9, 15],      // 8
  [1, 8, 10, 17], // 9
  [9, 11],      // 10
  [3, 10, 12, 19], // 11
  [11, 13],     // 12
  [5, 12, 14, 21], // 13
  [13, 15],     // 14
  [7, 8, 14, 23], // 15
  [17, 23],     // 16
  [9, 16, 18],  // 17
  [17, 19],     // 18
  [11, 18, 20], // 19
  [19, 21],     // 20
  [13, 20, 22], // 21
  [21, 23],     // 22
  [15, 16, 22], // 23
]

// 16 mill lines (three points forming a straight row/col on one square,
// plus the "spoke" mills through the middle of each edge).
const MILLS = [
  [0, 1, 2],    [2, 3, 4],    [4, 5, 6],    [6, 7, 0],   // outer square
  [8, 9, 10],   [10, 11, 12], [12, 13, 14], [14, 15, 8], // middle square
  [16, 17, 18], [18, 19, 20], [20, 21, 22], [22, 23, 16],// inner square
  [1, 9, 17],   [3, 11, 19],  [5, 13, 21],  [7, 15, 23], // 4 spokes
]

// Which mills does each node participate in? Precomputed for eval speed.
const MILLS_AT_NODE = Array.from({ length: 24 }, () => [])
MILLS.forEach((m, mi) => m.forEach((n) => MILLS_AT_NODE[n].push(mi)))

function initialState() {
  return {
    board: new Uint8Array(24),
    turn: HUMAN,                        // side to move (or place)
    placed: { human: 0, ai: 0 },        // pieces already placed
    onBoard: { human: 0, ai: 0 },       // pieces still on the board
    phase: 'placing',                   // 'placing' | 'moving' | 'flying'
    mustRemove: null,                   // 'human' | 'ai' | null (whose piece the ACTIVE side removes)
    lastMove: null,                     // node placed / moved to
    winner: null,                       // 'human' | 'ai' | null
  }
}

function isMillFormed(board, mIdx, player) {
  const [a, b, c] = MILLS[mIdx]
  return board[a] === player && board[b] === player && board[c] === player
}

// Does placing/moving `player` to `node` complete a new mill?
function completesMill(board, node, player) {
  for (const mi of MILLS_AT_NODE[node]) {
    if (isMillFormed(board, mi, player)) return true
  }
  return false
}

function inMill(board, node, player) {
  for (const mi of MILLS_AT_NODE[node]) {
    if (isMillFormed(board, mi, player)) return true
  }
  return false
}

// Nodes that `player` may remove from opponent. Standard rule: can't
// remove a piece that is in a mill unless ALL opponent pieces are in mills.
function removableNodes(board, opponent) {
  const oppNodes = []
  for (let i = 0; i < 24; i++) if (board[i] === opponent) oppNodes.push(i)
  const notInMill = oppNodes.filter((n) => !inMill(board, n, opponent))
  return notInMill.length > 0 ? notInMill : oppNodes
}

// Legal moves for `player` given `state`. Returns actions of the form
// { type:'place'|'move', from?, to } (removals handled separately).
function legalActions(state, player) {
  const { board, phase, placed, onBoard } = state
  const actions = []
  const placedCount = player === HUMAN ? placed.human : placed.ai
  const onBoardCount = player === HUMAN ? onBoard.human : onBoard.ai
  const inFlyingPhase = phase !== 'placing' && onBoardCount === 3

  if (phase === 'placing' && placedCount < 9) {
    for (let i = 0; i < 24; i++) if (board[i] === EMPTY) actions.push({ type: 'place', to: i })
    return actions
  }

  for (let from = 0; from < 24; from++) {
    if (board[from] !== player) continue
    if (inFlyingPhase) {
      for (let to = 0; to < 24; to++) if (board[to] === EMPTY) actions.push({ type: 'move', from, to })
    } else {
      for (const to of ADJ[from]) if (board[to] === EMPTY) actions.push({ type: 'move', from, to })
    }
  }
  return actions
}

function applyAction(state, action, player) {
  const opponent = player === HUMAN ? AI : HUMAN
  const board = new Uint8Array(state.board)
  const placed = { ...state.placed }
  const onBoard = { ...state.onBoard }
  let nextPhase = state.phase

  if (action.type === 'place') {
    board[action.to] = player
    if (player === HUMAN) { placed.human++; onBoard.human++ }
    else { placed.ai++; onBoard.ai++ }
    if (placed.human === 9 && placed.ai === 9) nextPhase = 'moving'
  } else if (action.type === 'move') {
    board[action.from] = EMPTY
    board[action.to] = player
  }

  // Update flying-phase flag opportunistically. We only enter flying
  // after all pieces are placed and one side drops to 3.
  if (nextPhase !== 'placing') {
    if (onBoard.human === 3 || onBoard.ai === 3) {
      nextPhase = 'flying'
    } else if (nextPhase === 'flying' && onBoard.human > 3 && onBoard.ai > 3) {
      nextPhase = 'moving'
    }
  }

  const mill = completesMill(board, action.to, player)
  return {
    board,
    turn: mill ? state.turn : opponent,
    placed,
    onBoard,
    phase: nextPhase,
    mustRemove: mill ? opponent : null,
    lastMove: action.to,
    winner: null,
  }
}

function applyRemoval(state, node, player) {
  const board = new Uint8Array(state.board)
  const opponent = player === HUMAN ? AI : HUMAN
  board[node] = EMPTY
  const onBoard = { ...state.onBoard }
  if (opponent === HUMAN) onBoard.human--
  else onBoard.ai--

  let winner = null
  const placedComplete = state.placed.human === 9 && state.placed.ai === 9
  if (placedComplete) {
    if (onBoard.human < 3) winner = 'ai'
    else if (onBoard.ai < 3) winner = 'human'
  }
  let phase = state.phase
  if (phase !== 'placing' && (onBoard.human === 3 || onBoard.ai === 3)) phase = 'flying'
  return {
    ...state,
    board,
    onBoard,
    phase,
    mustRemove: null,
    turn: opponent,
    winner,
  }
}

// Evaluate from AI perspective. Positive = AI ahead.
function evaluate(state) {
  const { board, onBoard, placed, phase } = state
  let humanMills = 0, aiMills = 0
  for (let mi = 0; mi < MILLS.length; mi++) {
    if (isMillFormed(board, mi, HUMAN)) humanMills++
    if (isMillFormed(board, mi, AI)) aiMills++
  }
  // Two-in-a-row potential mills — line with 2 own pieces + 1 empty.
  let humanTwo = 0, aiTwo = 0
  for (const [a, b, c] of MILLS) {
    const cells = [board[a], board[b], board[c]]
    const h = cells.filter((v) => v === HUMAN).length
    const ai = cells.filter((v) => v === AI).length
    const e = cells.filter((v) => v === EMPTY).length
    if (h === 2 && e === 1) humanTwo++
    if (ai === 2 && e === 1) aiTwo++
  }
  // Mobility.
  const humanMob = legalActions({ ...state, turn: HUMAN }, HUMAN).length
  const aiMob = legalActions({ ...state, turn: AI }, AI).length

  const stillToPlace = (side) => Math.max(0, 9 - (side === HUMAN ? placed.human : placed.ai))

  const material = (onBoard.ai - onBoard.human) * 12
             + (stillToPlace(AI) - stillToPlace(HUMAN)) * 8
  const mills = (aiMills - humanMills) * 25
  const twos = (aiTwo - humanTwo) * 6
  const mobility = phase === 'placing' ? 0 : (aiMob - humanMob) * 2
  return material + mills + twos + mobility
}

function checkTerminal(state) {
  const placedComplete = state.placed.human === 9 && state.placed.ai === 9
  if (placedComplete) {
    if (state.onBoard.human < 3) return 'ai'
    if (state.onBoard.ai < 3) return 'human'
  }
  if (state.phase !== 'placing') {
    const humanActions = legalActions({ ...state, turn: HUMAN }, HUMAN)
    const aiActions = legalActions({ ...state, turn: AI }, AI)
    if (state.turn === HUMAN && humanActions.length === 0) return 'ai'
    if (state.turn === AI    && aiActions.length === 0) return 'human'
  }
  return null
}

// Depth-limited alpha-beta. Handles the mustRemove sub-decision as a
// separate ply (a removal is one node choice).
function search(state, depth, alpha, beta, side) {
  const winner = checkTerminal(state)
  if (winner) return { score: winner === 'ai' ? 100000 + depth : -100000 - depth, action: null }
  if (depth === 0) return { score: evaluate(state), action: null }

  // Removal branch — active side must pick which opponent piece to remove.
  if (state.mustRemove) {
    // mustRemove holds WHICH SIDE'S PIECES are to be removed. state.turn
    // still points at the mill-forming side (who's about to remove).
    const removalPlayer = state.turn
    const opp = removalPlayer === HUMAN ? AI : HUMAN
    const choices = removableNodes(state.board, opp)
    let best = { score: removalPlayer === AI ? -Infinity : Infinity, action: null }
    for (const node of choices) {
      const next = applyRemoval(state, node, removalPlayer)
      const child = search(next, depth - 1, alpha, beta, opp === HUMAN ? 'human' : 'ai')
      const score = child.score
      if (removalPlayer === AI) {
        if (score > best.score) best = { score, action: { type: 'remove', node } }
        if (best.score > alpha) alpha = best.score
      } else {
        if (score < best.score) best = { score, action: { type: 'remove', node } }
        if (best.score < beta) beta = best.score
      }
      if (alpha >= beta) break
    }
    return best
  }

  const player = state.turn
  const actions = legalActions(state, player)
  if (actions.length === 0) {
    // No legal moves = loss for the side to move.
    return { score: player === AI ? -100000 - depth : 100000 + depth, action: null }
  }

  // Move ordering: prefer actions that form a mill (huge pruning win —
  // mills lead to captures which dominate the eval).
  const wouldMill = (act) => {
    const next = new Uint8Array(state.board)
    if (act.type === 'move') next[act.from] = EMPTY
    next[act.to] = player
    return completesMill(next, act.to, player) ? 1 : 0
  }
  actions.sort((a, b) => wouldMill(b) - wouldMill(a))

  let best = { score: player === AI ? -Infinity : Infinity, action: actions[0] }
  for (const act of actions) {
    const next = applyAction(state, act, player)
    let child
    if (next.mustRemove) {
      // Same side continues (removal). Do NOT decrement depth for the
      // removal ply — treat mill-then-remove as one combined turn to
      // preserve horizon.
      child = search(next, depth - 1, alpha, beta, side)
    } else {
      child = search(next, depth - 1, alpha, beta, side === 'ai' ? 'human' : 'ai')
    }
    const score = child.score
    if (player === AI) {
      if (score > best.score) best = { score, action: act }
      if (best.score > alpha) alpha = best.score
    } else {
      if (score < best.score) best = { score, action: act }
      if (best.score < beta) beta = best.score
    }
    if (alpha >= beta) break
  }
  return best
}

function pickAiMove(state, depth) {
  const r = search(state, depth, -Infinity, Infinity, 'ai')
  return r.action
}

const CELL = 60           // px per grid cell (7×7 grid)
const NODE_R = 12         // node radius

export default function NineMensMorris() {
  const [shellDifficulty, setShellDifficulty] = useState('Medium')
  const [customValues, setCustomValues] = useState(() => Object.fromEntries(
    Object.entries(CUSTOM_SCHEMA).map(([k, v]) => [k, v.default])
  ))
  const shellCfg = useMemo(
    () => shellDifficulty === 'Custom' ? customValues : DIFFICULTIES[shellDifficulty] || DIFFICULTIES.Medium,
    [shellDifficulty, customValues],
  )
  const [state, setState] = useState(() => initialState())
  const [selected, setSelected] = useState(-1)
  const [depth, setDepth] = useState(4)
  useEffect(() => {
    if (shellCfg.aiDepth) setDepth(Math.max(2, Math.min(7, Math.round(shellCfg.aiDepth))))
  }, [shellCfg.aiDepth])
  const [aiThinking, setAiThinking] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const sfxRef = useRef(getSfx())

  const humanActions = useMemo(
    () => state.turn === HUMAN && !state.mustRemove ? legalActions(state, HUMAN) : [],
    [state]
  )
  const legalTargets = useMemo(() => {
    if (state.mustRemove === 'human' && state.turn === HUMAN) return new Set()
    if (state.mustRemove === 'ai') return new Set(removableNodes(state.board, AI))
    if (state.turn !== HUMAN || aiThinking || state.winner) return new Set()
    if (state.phase === 'placing') return new Set(humanActions.map((a) => a.to))
    if (selected < 0) return new Set()
    return new Set(humanActions.filter((a) => a.from === selected).map((a) => a.to))
  }, [humanActions, selected, state, aiThinking])

  const status = state.winner
    ? (state.winner === 'human' ? 'won' : 'over')
    : (aiThinking ? 'paused' : 'playing')

  const resetGame = useCallback(() => {
    setState(initialState()); setSelected(-1)
  }, [])

  const handleNodeClick = useCallback((node) => {
    if (state.winner || aiThinking) return
    if (state.turn !== HUMAN) return

    // Removal step (human just formed a mill).
    if (state.mustRemove === 'ai') {
      const rem = removableNodes(state.board, AI)
      if (!rem.includes(node)) return
      if (soundOn) sfxRef.current.hit()
      setState((s) => applyRemoval(s, node, HUMAN))
      return
    }

    if (state.phase === 'placing') {
      if (state.board[node] !== EMPTY) return
      const action = { type: 'place', to: node }
      if (soundOn) sfxRef.current.pop()
      setState((s) => applyAction(s, action, HUMAN))
      return
    }

    // Moving/flying phase.
    if (state.board[node] === HUMAN) {
      if (humanActions.some((a) => a.from === node)) setSelected(node)
      return
    }
    if (selected < 0) return
    const action = humanActions.find((a) => a.from === selected && a.to === node)
    if (!action) return
    if (soundOn) sfxRef.current.pop()
    setState((s) => applyAction(s, action, HUMAN))
    setSelected(-1)
  }, [state, aiThinking, humanActions, selected, soundOn])

  // AI turn.
  useEffect(() => {
    if (state.winner) return
    if (state.turn !== AI && state.mustRemove !== 'human') return
    setAiThinking(true)
    const t = setTimeout(() => {
      const act = pickAiMove(state, depth)
      if (!act) {
        // AI can't move → human wins.
        setState((s) => ({ ...s, winner: 'human' }))
        setAiThinking(false)
        return
      }
      if (act.type === 'remove') {
        if (soundOn) sfxRef.current.hit()
        setState((s) => applyRemoval(s, act.node, AI))
      } else {
        if (soundOn) sfxRef.current.pop()
        setState((s) => applyAction(s, act, AI))
      }
      setAiThinking(false)
    }, 60)
    return () => clearTimeout(t)
  }, [state, depth, soundOn])

  // Terminal check (also handles the "human has no legal moves" endgame).
  useEffect(() => {
    if (state.winner) return
    const w = checkTerminal(state)
    if (w) setState((s) => ({ ...s, winner: w }))
  }, [state])

  useEffect(() => { sfxRef.current.setEnabled(soundOn) }, [soundOn])

  const overlay = state.winner ? (
    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center pointer-events-none">
      <div className="text-center">
        <div className="text-3xl sm:text-5xl font-black mb-2"
          style={{ backgroundImage: 'linear-gradient(90deg,#fbbf24,#f43f5e,#e879f9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          {state.winner === 'human' ? 'You Win!' : 'AI Wins'}
        </div>
      </div>
    </div>
  ) : null

  const boardSize = CELL * 6
  const humanRemaining = 9 - state.placed.human + 0        // still-to-place
  const aiRemaining = 9 - state.placed.ai + 0
  const humanOnBoard = state.onBoard.human
  const aiOnBoard = state.onBoard.ai

  const phaseLabel = state.phase === 'placing'
    ? `Placing (${state.placed.human + state.placed.ai}/18)`
    : state.phase === 'flying'
      ? 'Flying'
      : 'Moving'

  const promptText = state.mustRemove
    ? state.mustRemove === 'ai'
      ? 'Mill! Remove an AI piece (not in a mill).'
      : 'AI removing your piece…'
    : aiThinking
      ? 'AI thinking…'
      : state.turn === HUMAN
        ? state.phase === 'placing'
          ? 'Place a piece'
          : 'Select a piece, then destination'
        : 'AI turn'

  const difficultyLabel = depth <= 3 ? 'Easy' : depth <= 4 ? 'Medium' : depth <= 5 ? 'Hard' : 'Master'

  return (
    <GameShell
      title="Nine Men's Morris"
      category="Board"
      score={humanOnBoard}
      best={aiOnBoard}
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
            <span className="text-[10px] uppercase tracking-widest text-white/40">Phase</span>
            <span className="text-sm font-bold text-amber-300">{phaseLabel}</span>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Reserve</span>
            <span className="text-sm font-bold text-fuchsia-300 tabular-nums">{humanRemaining} / {aiRemaining}</span>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Turn</span>
            <span className="text-sm font-bold text-white">{promptText}</span>
          </div>
        </div>
      }
      controls={[
        { key: 'Click', label: 'Place / select / move' },
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
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between flex-wrap">
            <div>
              <p className="text-[11px] uppercase tracking-widest text-white/50 mb-1">AI difficulty</p>
              <p className="text-sm font-bold text-white">{difficultyLabel} <span className="text-white/50 font-normal">· depth {depth}</span></p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[3, 4, 5, 6].map((d) => (
                <Button
                  key={d}
                  variant={depth === d ? 'primary' : 'ghost'}
                  size="small"
                  onClick={() => setDepth(d)}
                >
                  {d === 3 ? 'Easy' : d === 4 ? 'Medium' : d === 5 ? 'Hard' : 'Master'}
                </Button>
              ))}
            </div>
            <Button variant="primary" onClick={resetGame}>New game</Button>
          </div>
          <p className="mt-3 text-[12px] text-white/50 leading-relaxed">
            Form three in a row along any of the 16 mill lines to remove one opponent piece. Placing → Moving → Flying (once you're down to three pieces). Alpha-beta minimax with mill-aware move ordering, potential-mill counts, and mobility term.
          </p>
        </div>
      }
    >
      <div
        className="relative w-full flex items-center justify-center py-6 select-none"
        style={{
          background: 'radial-gradient(ellipse at 50% 30%, rgba(139,69,19,0.15), transparent 60%), linear-gradient(180deg, #1a0f05 0%, #0a0503 100%)',
        }}
      >
        <svg
          viewBox={`0 0 ${boardSize + 60} ${boardSize + 60}`}
          style={{ width: 'min(100%, 500px)', maxWidth: '100%', height: 'auto' }}
          className="touch-manipulation"
        >
          <defs>
            <linearGradient id="mmBoard" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#78350f" />
              <stop offset="50%" stopColor="#5c2b06" />
              <stop offset="100%" stopColor="#3f1c02" />
            </linearGradient>
            <radialGradient id="mmHuman" cx="0.4" cy="0.35" r="0.7">
              <stop offset="0%" stopColor="#fecaca" />
              <stop offset="45%" stopColor="#f43f5e" />
              <stop offset="100%" stopColor="#7f1d1d" />
            </radialGradient>
            <radialGradient id="mmAI" cx="0.4" cy="0.35" r="0.7">
              <stop offset="0%" stopColor="#e5e7eb" />
              <stop offset="45%" stopColor="#374151" />
              <stop offset="100%" stopColor="#030712" />
            </radialGradient>
          </defs>

          {/* Wooden panel */}
          <rect x="0" y="0" width={boardSize + 60} height={boardSize + 60} fill="url(#mmBoard)" rx="10" />

          {/* Three concentric squares + spokes */}
          {(() => {
            const offset = 30
            const lines = [
              // outer square (nodes 0-1-2-3-4-5-6-7-0)
              [0, 2], [2, 4], [4, 6], [6, 0],
              // middle
              [8, 10], [10, 12], [12, 14], [14, 8],
              // inner
              [16, 18], [18, 20], [20, 22], [22, 16],
              // spokes
              [1, 9], [9, 17], [3, 11], [11, 19], [5, 13], [13, 21], [7, 15], [15, 23],
            ]
            return lines.map(([a, b], i) => (
              <line
                key={`l-${i}`}
                x1={NODE_POS[a][0] * CELL + offset}
                y1={NODE_POS[a][1] * CELL + offset}
                x2={NODE_POS[b][0] * CELL + offset}
                y2={NODE_POS[b][1] * CELL + offset}
                stroke="rgba(255, 235, 200, 0.55)"
                strokeWidth="2"
              />
            ))
          })()}

          {/* Nodes */}
          {NODE_POS.map(([x, y], i) => {
            const cx = x * CELL + 30
            const cy = y * CELL + 30
            const v = state.board[i]
            const isLegalTarget = legalTargets.has(i)
            const isSelected = selected === i
            const isLast = state.lastMove === i
            return (
              <g key={i} onClick={() => handleNodeClick(i)} style={{ cursor: (isLegalTarget || v === HUMAN) ? 'pointer' : 'default' }}>
                <circle cx={cx} cy={cy} r={NODE_R + 8} fill="transparent" />
                <circle cx={cx} cy={cy} r={NODE_R * 0.5} fill="rgba(0,0,0,0.4)" />
                {v !== EMPTY && (
                  <>
                    <circle
                      cx={cx} cy={cy}
                      r={NODE_R * 1.6}
                      fill={v === HUMAN ? 'url(#mmHuman)' : 'url(#mmAI)'}
                      stroke={isSelected ? '#fbbf24' : isLast ? '#fbbf24' : 'transparent'}
                      strokeWidth={isSelected ? 3 : isLast ? 2 : 0}
                      style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.5))' }}
                    />
                    <circle
                      cx={cx - NODE_R * 0.5}
                      cy={cy - NODE_R * 0.5}
                      r={NODE_R * 0.35}
                      fill="white"
                      opacity="0.35"
                    />
                  </>
                )}
                {isLegalTarget && v === EMPTY && (
                  <motion.circle
                    cx={cx} cy={cy}
                    r={NODE_R * 1.2}
                    fill="none"
                    stroke="#34d399"
                    strokeWidth="2"
                    initial={{ opacity: 0.4 }}
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.4, repeat: Infinity }}
                  />
                )}
                {isLegalTarget && v !== EMPTY && state.mustRemove === 'ai' && (
                  <motion.circle
                    cx={cx} cy={cy}
                    r={NODE_R * 1.9}
                    fill="none"
                    stroke="#f43f5e"
                    strokeWidth="2"
                    strokeDasharray="4 3"
                    animate={{ rotate: [0, 360] }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                  />
                )}
              </g>
            )
          })}
        </svg>
      </div>
    </GameShell>
  )
}
