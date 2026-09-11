// Chinese Checkers — 2-player (human vs AI) race on the classic 6-star
// board. Human plays the bottom triangle (blue), AI the top (red).
//
// Board: 121-node star ("Halma-16" style) with a hexagonal centre and
// six triangular arms of 10 pieces each. Only two arms are populated
// in a 2-player game.
//
// Rules:
//   • Move to an adjacent empty node OR
//   • Jump over an adjacent piece to the empty node on the other side.
//     Jumps chain (multi-hop). A single "move" is a step OR a whole
//     jump chain (no mixing).
//   • Cannot leave your destination triangle once fully inside it.
//   • First side to land all 10 pieces in the opposite triangle wins.
//
// AI: BFS-based greedy — for each of its pieces, enumerate all reachable
// nodes in a single move (adjacent + full jump chains via BFS). Score
// each candidate move by how much closer it moves the piece to the
// AI's target triangle centroid, with a bonus for jumps (they cover
// more ground) and a penalty for leaving already-in-goal pieces.
// Difficulty controls: number of pieces the AI evaluates ("greed"),
// with higher difficulties simulating a shallow 2-ply look-ahead.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import GameShell from '../../components/arcade/GameShell'
import { Button } from '../../components/ui'
import { getSfx } from '../../components/arcade/sfx'

const EMPTY = 0
const HUMAN = 1
const AI    = 2

// ── Board geometry ──────────────────────────────────────────────
// The Halma star is generated procedurally on an axial hex grid.
// We use a "cube" coordinate system (x + y + z = 0) which makes
// triangle detection trivial.
//
// The standard 6-arm board has 121 nodes:
//   1 centre hexagon of 61 nodes (radius 4) — the shared middle.
//   6 triangles of 10 nodes each, jutting off each face of the hex.
//
// We emit them as {x, y, z} → assign flat indices 0..120.

function generateBoard() {
  const nodes = []                 // { x, y, z, key, screenX, screenY }
  const seen = new Set()
  const addNode = (x, y, z) => {
    if (x + y + z !== 0) return    // invalid cube coord
    const k = `${x},${y},${z}`
    if (seen.has(k)) return
    seen.add(k)
    nodes.push({ x, y, z, key: k })
  }

  // Star = center hex (radius 4) ∪ six arms (10 cells each).
  // On a cube-coord hex grid an arm is the set of cells where exactly
  // ONE axis lies in [5..8] (or [-8..-5]) and the OTHER TWO axes both
  // lie in [-4..4]. That gives exactly 10 cells per arm (4+3+2+1).
  const inHex = (x, y, z) => Math.abs(x) <= 4 && Math.abs(y) <= 4 && Math.abs(z) <= 4
  const isArmCell = (x, y, z) => {
    const overX = Math.abs(x) >= 5 && Math.abs(x) <= 8
    const overY = Math.abs(y) >= 5 && Math.abs(y) <= 8
    const overZ = Math.abs(z) >= 5 && Math.abs(z) <= 8
    const overCount = (overX ? 1 : 0) + (overY ? 1 : 0) + (overZ ? 1 : 0)
    if (overCount !== 1) return false
    // The non-over axes must each be within [-4, 4].
    if (!overX && Math.abs(x) > 4) return false
    if (!overY && Math.abs(y) > 4) return false
    if (!overZ && Math.abs(z) > 4) return false
    return true
  }
  for (let x = -8; x <= 8; x++) {
    for (let y = -8; y <= 8; y++) {
      const z = -x - y
      if (Math.abs(z) > 8) continue
      if (inHex(x, y, z) || isArmCell(x, y, z)) addNode(x, y, z)
    }
  }

  // Assign indices.
  const nodesById = nodes.map((n, i) => ({ ...n, i }))
  const keyToId = new Map(nodesById.map((n) => [n.key, n.i]))

  // Screen coords for rendering — flat-topped hex projection.
  const HEX_R = 22
  for (const n of nodesById) {
    // Cube (x, y, z) → axial (q=x, r=z), screen coords.
    const q = n.x
    const r = n.z
    n.screenX = HEX_R * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r)
    n.screenY = HEX_R * (1.5 * r)
  }

  // Adjacency — six unit directions in cube coords.
  const DIRS = [
    [+1, -1, 0], [+1, 0, -1], [0, +1, -1],
    [-1, +1, 0], [-1, 0, +1], [0, -1, +1],
  ]
  const adj = nodesById.map(() => [])
  for (const n of nodesById) {
    for (const [dx, dy, dz] of DIRS) {
      const k = `${n.x + dx},${n.y + dy},${n.z + dz}`
      const id = keyToId.get(k)
      if (id !== undefined) adj[n.i].push(id)
    }
  }

  // Triangle sets — identify the top and bottom triangle nodes for the
  // 2-player start/goal.
  const topTriangle = nodesById.filter((n) => n.z <= -5).map((n) => n.i)
  const bottomTriangle = nodesById.filter((n) => n.z >= 5).map((n) => n.i)

  return { nodes: nodesById, adj, topTriangle, bottomTriangle, keyToId, DIRS }
}

const BOARD = generateBoard()

function initialState() {
  const board = new Uint8Array(BOARD.nodes.length)
  for (const i of BOARD.topTriangle) board[i] = AI       // AI starts up top
  for (const i of BOARD.bottomTriangle) board[i] = HUMAN // Human at bottom
  return {
    board,
    turn: HUMAN,
    selected: -1,
    lastMove: null,
    winner: null,
  }
}

// Enumerate all destinations reachable from `from` in one move.
// Returns an array of { to, isJump, path:[nodes visited in order] }.
// Path length 1 means a simple step. A step CANNOT be followed by jumps.
function reachableFrom(board, from) {
  const results = []
  // Simple adjacent steps.
  for (const nb of BOARD.adj[from]) {
    if (board[nb] === EMPTY) results.push({ to: nb, isJump: false, path: [from, nb] })
  }
  // Jump BFS — repeatedly hop over occupied neighbours to empty landing.
  const visited = new Set([from])
  const queue = [{ node: from, path: [from] }]
  while (queue.length > 0) {
    const { node, path } = queue.shift()
    for (let d = 0; d < BOARD.DIRS.length; d++) {
      const [dx, dy, dz] = BOARD.DIRS[d]
      const n = BOARD.nodes[node]
      const midKey = `${n.x + dx},${n.y + dy},${n.z + dz}`
      const midId = BOARD.keyToId.get(midKey)
      if (midId === undefined) continue
      if (board[midId] === EMPTY) continue    // must jump over a piece
      const landKey = `${n.x + 2 * dx},${n.y + 2 * dy},${n.z + 2 * dz}`
      const landId = BOARD.keyToId.get(landKey)
      if (landId === undefined) continue
      if (board[landId] !== EMPTY) continue
      if (visited.has(landId)) continue
      visited.add(landId)
      const newPath = [...path, landId]
      results.push({ to: landId, isJump: true, path: newPath })
      queue.push({ node: landId, path: newPath })
    }
  }
  return results
}

function applyMove(state, from, to, path) {
  const board = new Uint8Array(state.board)
  const piece = board[from]
  board[from] = EMPTY
  board[to] = piece
  const opponent = piece === HUMAN ? AI : HUMAN
  // Win: all of `piece`'s pieces inside the opposite triangle.
  const goal = piece === HUMAN ? BOARD.topTriangle : BOARD.bottomTriangle
  const allIn = goal.every((n) => board[n] === piece)
  return {
    board,
    turn: opponent,
    selected: -1,
    lastMove: { from, to, path },
    winner: allIn ? (piece === HUMAN ? 'human' : 'ai') : null,
  }
}

// Distance from node to a target centroid (in cube distance).
function cubeDistance(a, b) {
  return (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z)) / 2
}

// Centroid of the AI's goal (bottom-most row = bottom of bottom triangle).
const AI_GOAL_CENTROID = (() => {
  // Bottom-most row is the lowest z. Take the deepest node.
  const deepest = BOARD.bottomTriangle.reduce((m, i) => {
    const n = BOARD.nodes[i]
    return n.z > m.z ? n : m
  }, BOARD.nodes[BOARD.bottomTriangle[0]])
  return { x: deepest.x, y: deepest.y, z: deepest.z }
})()
const HUMAN_GOAL_CENTROID = (() => {
  const deepest = BOARD.topTriangle.reduce((m, i) => {
    const n = BOARD.nodes[i]
    return n.z < m.z ? n : m
  }, BOARD.nodes[BOARD.topTriangle[0]])
  return { x: deepest.x, y: deepest.y, z: deepest.z }
})()

// Score a single move from the AI's perspective — higher = better.
function scoreMove(board, from, move, side) {
  const centroid = side === AI ? AI_GOAL_CENTROID : HUMAN_GOAL_CENTROID
  const fromNode = BOARD.nodes[from]
  const toNode   = BOARD.nodes[move.to]
  const beforeDist = cubeDistance(fromNode, centroid)
  const afterDist  = cubeDistance(toNode, centroid)
  const progress = beforeDist - afterDist
  let score = progress * 10
  // Bonus for jumps (they cover more ground).
  if (move.isJump) score += 3
  // Penalty for moving BACK toward own home.
  if (progress < 0) score -= 5
  // Penalty for pulling a piece OUT of the goal triangle once it's inside.
  const goalTri = side === AI ? BOARD.bottomTriangle : BOARD.topTriangle
  if (goalTri.includes(from) && !goalTri.includes(move.to)) score -= 30
  // Big bonus for LANDING in the goal triangle.
  if (!goalTri.includes(from) && goalTri.includes(move.to)) score += 15
  return score
}

// Pick a move for `side` using greedy BFS scoring. Higher `depth` uses
// a shallow 2-ply look-ahead — after each candidate, we simulate the
// opponent's best greedy response and adjust.
function pickAiMove(state, side, depth) {
  const candidates = []
  for (let i = 0; i < state.board.length; i++) {
    if (state.board[i] !== side) continue
    const moves = reachableFrom(state.board, i)
    for (const m of moves) {
      const s = scoreMove(state.board, i, m, side)
      candidates.push({ from: i, move: m, score: s })
    }
  }
  if (candidates.length === 0) return null
  candidates.sort((a, b) => b.score - a.score)

  if (depth <= 1) {
    // Pure greedy — pick the best one, with a small random tie-break
    // among the top 3 to avoid perfectly repetitive play.
    const topThree = candidates.slice(0, Math.min(3, candidates.length))
    return topThree[Math.floor(Math.random() * topThree.length)]
  }

  // Depth-2: for the top K candidates, simulate opponent response and
  // score net progress.
  const K = depth >= 3 ? 12 : 6
  const top = candidates.slice(0, K)
  const opponent = side === AI ? HUMAN : AI
  let best = { score: -Infinity, cand: top[0] }
  for (const cand of top) {
    const next = applyMove(state, cand.from, cand.move.to, cand.move.path)
    if (next.winner === (side === AI ? 'ai' : 'human')) {
      // Instant win — grab it.
      return cand
    }
    // Opponent's best greedy response.
    let bestOppScore = -Infinity
    for (let j = 0; j < next.board.length; j++) {
      if (next.board[j] !== opponent) continue
      const moves = reachableFrom(next.board, j)
      for (const m of moves) {
        const s = scoreMove(next.board, j, m, opponent)
        if (s > bestOppScore) bestOppScore = s
      }
    }
    // Net = our score minus opponent's best response.
    const netScore = cand.score - bestOppScore * 0.75
    if (netScore > best.score) best = { score: netScore, cand }
  }
  return best.cand
}

// ── Rendering ────────────────────────────────────────────────
const CENTER = { x: 200, y: 200 }

export default function ChineseCheckers() {
  const [state, setState] = useState(() => initialState())
  const [depth, setDepth] = useState(2)
  const [aiThinking, setAiThinking] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const [vsAI, setVsAI] = useState(true)
  const sfxRef = useRef(getSfx())

  // Compute reachable set for the currently selected piece.
  const reachable = useMemo(() => {
    if (state.selected < 0) return []
    return reachableFrom(state.board, state.selected)
  }, [state.selected, state.board])
  const reachableMap = useMemo(() => {
    const m = new Map()
    for (const r of reachable) m.set(r.to, r)
    return m
  }, [reachable])

  const status = state.winner
    ? (state.winner === 'human' ? 'won' : 'over')
    : (aiThinking ? 'paused' : 'playing')

  const resetGame = useCallback(() => {
    setState(initialState())
  }, [])

  const handleNodeClick = useCallback((node) => {
    if (state.winner || aiThinking) return
    // In vs-AI mode, only allow interaction on human turns.
    if (vsAI && state.turn !== HUMAN) return
    const side = vsAI ? HUMAN : state.turn
    if (state.board[node] === side) {
      setState((s) => ({ ...s, selected: node }))
      return
    }
    if (state.selected < 0) return
    // Sanity — selection must belong to the side to move.
    if (state.board[state.selected] !== side) return
    const m = reachableMap.get(node)
    if (!m) return
    if (soundOn) sfxRef.current[m.isJump ? 'hit' : 'pop']()
    setState((s) => applyMove(s, state.selected, node, m.path))
  }, [state, aiThinking, vsAI, reachableMap, soundOn])

  // AI turn.
  useEffect(() => {
    if (!vsAI || state.winner) return
    if (state.turn !== AI) return
    setAiThinking(true)
    const t = setTimeout(() => {
      const pick = pickAiMove(state, AI, depth)
      if (!pick) { setAiThinking(false); return }
      if (soundOn) sfxRef.current[pick.move.isJump ? 'hit' : 'pop']()
      setState((s) => applyMove(s, pick.from, pick.move.to, pick.move.path))
      setAiThinking(false)
    }, 120)
    return () => clearTimeout(t)
  }, [state, depth, vsAI, soundOn])

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

  // Progress = number of pieces of each side already in their goal triangle.
  const humanProgress = BOARD.topTriangle.reduce((n, i) => n + (state.board[i] === HUMAN ? 1 : 0), 0)
  const aiProgress    = BOARD.bottomTriangle.reduce((n, i) => n + (state.board[i] === AI ? 1 : 0), 0)

  const difficultyLabel = depth === 1 ? 'Easy' : depth === 2 ? 'Medium' : depth === 3 ? 'Hard' : 'Master'

  return (
    <GameShell
      title="Chinese Checkers"
      category="Board"
      score={humanProgress}
      best={aiProgress}
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
            <span className="text-[10px] uppercase tracking-widest text-white/40">Mode</span>
            <span className="text-sm font-bold text-fuchsia-300">{vsAI ? 'vs AI' : '2 Player'}</span>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Turn</span>
            <span className={`text-sm font-bold ${state.turn === HUMAN ? 'text-cyan-300' : 'text-rose-300'}`}>
              {aiThinking ? 'AI thinking…' : state.turn === HUMAN ? (vsAI ? 'Your turn' : 'Blue turn') : (vsAI ? 'AI turn' : 'Red turn')}
            </span>
          </div>
        </div>
      }
      controls={[
        { key: 'Click', label: 'Select piece, click empty node or jump target' },
        { key: 'R',     label: 'Restart' },
      ]}
      footer={
        <div className="mt-4 luxe-card-alt rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between flex-wrap">
            <div>
              <p className="text-[11px] uppercase tracking-widest text-white/50 mb-1">AI difficulty</p>
              <p className="text-sm font-bold text-white">{difficultyLabel} <span className="text-white/50 font-normal">· look-ahead {depth}</span></p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[1, 2, 3, 4].map((d) => (
                <Button
                  key={d}
                  variant={depth === d ? 'primary' : 'ghost'}
                  size="small"
                  onClick={() => setDepth(d)}
                >
                  {d === 1 ? 'Easy' : d === 2 ? 'Medium' : d === 3 ? 'Hard' : 'Master'}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button variant={vsAI ? 'primary' : 'ghost'} size="small" onClick={() => { setVsAI(true); resetGame() }}>
                vs AI
              </Button>
              <Button variant={!vsAI ? 'primary' : 'ghost'} size="small" onClick={() => { setVsAI(false); resetGame() }}>
                2 Player
              </Button>
            </div>
            <Button variant="primary" onClick={resetGame}>New game</Button>
          </div>
          <p className="mt-3 text-[12px] text-white/50 leading-relaxed">
            Move one step to an empty adjacent node, or jump chains over any pieces. First side to fill the opposite triangle wins. AI uses BFS-based jump-chain enumeration + centroid-progress scoring, with an optional 2-ply look-ahead on Hard / Master.
          </p>
        </div>
      }
    >
      <div
        className="relative w-full flex items-center justify-center py-6 select-none"
        style={{
          background: 'radial-gradient(ellipse at 50% 30%, rgba(139,69,19,0.15), transparent 60%), linear-gradient(180deg, #170a03 0%, #080402 100%)',
          minHeight: 400,
        }}
      >
        <svg
          viewBox="-220 -220 440 440"
          style={{ width: 'min(100%, 500px)', maxWidth: '100%', height: 'auto' }}
          className="touch-manipulation"
        >
          <defs>
            <radialGradient id="ccHuman" cx="0.4" cy="0.35" r="0.7">
              <stop offset="0%" stopColor="#bfdbfe" />
              <stop offset="45%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#1e3a8a" />
            </radialGradient>
            <radialGradient id="ccAI" cx="0.4" cy="0.35" r="0.7">
              <stop offset="0%" stopColor="#fecaca" />
              <stop offset="45%" stopColor="#f43f5e" />
              <stop offset="100%" stopColor="#7f1d1d" />
            </radialGradient>
            <filter id="ccGlow">
              <feGaussianBlur stdDeviation="2" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Star board rim polygon (approx) */}
          <circle cx="0" cy="0" r="205" fill="rgba(30, 15, 5, 0.5)" stroke="rgba(255, 235, 200, 0.25)" strokeWidth="2" />

          {/* Adjacency lines (subtle) */}
          {BOARD.nodes.map((n, i) => (
            BOARD.adj[i].map((j) => {
              if (j <= i) return null
              const m = BOARD.nodes[j]
              return (
                <line
                  key={`e-${i}-${j}`}
                  x1={n.screenX} y1={n.screenY}
                  x2={m.screenX} y2={m.screenY}
                  stroke="rgba(255, 220, 160, 0.08)"
                  strokeWidth="1"
                />
              )
            })
          ))}

          {/* Nodes */}
          {BOARD.nodes.map((n, i) => {
            const v = state.board[i]
            const isSelected = state.selected === i
            const isReachable = reachableMap.has(i)
            const isLast = state.lastMove?.from === i || state.lastMove?.to === i
            const inHome = BOARD.topTriangle.includes(i) || BOARD.bottomTriangle.includes(i)
            return (
              <g
                key={i}
                onClick={() => handleNodeClick(i)}
                style={{ cursor: (v === HUMAN || isReachable) ? 'pointer' : 'default' }}
              >
                <circle cx={n.screenX} cy={n.screenY} r="11" fill="transparent" />
                {/* Base hole */}
                <circle
                  cx={n.screenX} cy={n.screenY}
                  r="6.5"
                  fill={inHome
                    ? (BOARD.topTriangle.includes(i) ? 'rgba(244, 63, 94, 0.15)' : 'rgba(59, 130, 246, 0.15)')
                    : 'rgba(0,0,0,0.35)'}
                  stroke="rgba(255,230,200,0.25)"
                  strokeWidth="1"
                />
                {/* Piece */}
                {v !== EMPTY && (
                  <>
                    <circle
                      cx={n.screenX} cy={n.screenY}
                      r="9"
                      fill={v === HUMAN ? 'url(#ccHuman)' : 'url(#ccAI)'}
                      stroke={isSelected ? '#fbbf24' : isLast ? '#fbbf24' : 'transparent'}
                      strokeWidth={isSelected ? 2 : isLast ? 1.5 : 0}
                      filter={isSelected ? 'url(#ccGlow)' : undefined}
                      style={{ filter: isSelected ? 'drop-shadow(0 0 3px #fbbf24)' : 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}
                    />
                    <circle
                      cx={n.screenX - 2.5} cy={n.screenY - 2.5}
                      r="2"
                      fill="white" opacity="0.4"
                    />
                  </>
                )}
                {/* Reachable-target indicator */}
                {isReachable && (
                  <motion.circle
                    cx={n.screenX} cy={n.screenY}
                    r="10"
                    fill="none"
                    stroke={reachableMap.get(i)?.isJump ? '#a78bfa' : '#34d399'}
                    strokeWidth="1.5"
                    animate={{ opacity: [0.4, 1, 0.4], r: [8, 11, 8] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
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
