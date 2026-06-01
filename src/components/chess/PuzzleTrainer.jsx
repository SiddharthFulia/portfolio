// PuzzleTrainer — the /chess Puzzles section.
//
// State machine per puzzle:
//   loading  → fetch /chess/puzzles/next on user+difficulty change
//   playing  → user plays the side-to-move, each user move is checked
//              against the expected solution ply; engine auto-plays the
//              opponent's reply between user plies.
//   wrong    → user move did NOT match → board snaps back to the post-
//              opponent FEN; triesLeft--; user clicks "Try again" to
//              re-enter playing.
//   done     → success (full sequence) OR fail (triesLeft === 0 OR user
//              clicked "Show solution" before solving) — Analyze panel
//              appears with full solution + lichess link.
//
// Why not call Stockfish for the opponent's reply? Lichess puzzles ship
// with the FULL solution sequence (UCI moves), starting with the opponent's
// "setup" move that creates the puzzle. We auto-apply the opponent's reply
// from that script — no engine round-trip needed.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { Modal, Input, Select, Tag, message, Tooltip } from 'antd'
import {
  PlayCircleOutlined, ReloadOutlined, EyeOutlined,
  DeleteOutlined, PlusOutlined, BulbOutlined, LinkOutlined,
  ArrowRightOutlined, TrophyOutlined, FireOutlined, CheckCircleOutlined,
  CloseCircleOutlined, LoadingOutlined,
} from '@ant-design/icons'
import { Button } from '../ui'
import ChessBoard from './ChessBoard'
import {
  chessPuzzleListUsers, chessPuzzleCreateUser, chessPuzzleDeleteUser,
  chessPuzzleNext, chessPuzzleAttempt, chessPuzzleStats,
} from '../../api/ai'

// ── Difficulty tiers — keep in lock-step with services/chess/puzzleStore.js
const DIFFS = [
  { id: 'easy',   label: 'Easy',   sub: '+1 to +100',  hint: '+15 / -10 / retry -5',  accent: 'emerald' },
  { id: 'medium', label: 'Medium', sub: '+200 to +400', hint: '+25 / -15 / retry -10', accent: 'amber'   },
  { id: 'hard',   label: 'Hard',   sub: '+500 to +800', hint: '+40 / -20 / retry -15', accent: 'rose'    },
]
const MAX_TRIES = 3

// Tag accent → tailwind border + bg + text triple. Tag isn't a real UI
// primitive (we don't want full antd Tag chrome), it's a luxe chip.
const ACCENTS = {
  emerald: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20',
  amber:   'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20',
  rose:    'border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20',
}
const ACCENTS_ACTIVE = {
  emerald: 'border-emerald-400 bg-emerald-500/25 text-emerald-100 ring-1 ring-emerald-400/60',
  amber:   'border-amber-400 bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/60',
  rose:    'border-rose-400 bg-rose-500/25 text-rose-100 ring-1 ring-rose-400/60',
}

// Turn "rnbqk... w KQkq - 0 1" into a Chess instance.
function freshChess(fen) {
  const c = new Chess()
  try { c.load(fen) } catch { /* invalid FEN — caller handles */ }
  return c
}

// Parse the puzzle's moves string ("c8e6 f1b5 e8g8 b5c6") into UCI tokens.
function tokenize(moves) {
  return (moves || '').trim().split(/\s+/).filter(Boolean)
}

export default function PuzzleTrainer() {
  // ── User selection / management ─────────────────────────────────
  const [users, setUsers] = useState([])
  const [userId, setUserId] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')

  // ── Difficulty + puzzle state ───────────────────────────────────
  const [difficulty, setDifficulty] = useState('easy')
  const [puzzle, setPuzzle] = useState(null)   // { puzzleId, fen, moves, rating, themes, gameUrl, openingTags, ... }
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)

  // ── Board state ─────────────────────────────────────────────────
  // The "starting" FEN is the position AFTER lichess's setup move (opponent's
  // first move from the puzzle). The user plays from there.
  const chessRef = useRef(new Chess())
  const [boardFen, setBoardFen] = useState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
  const [solutionMoves, setSolutionMoves] = useState([])  // UCI tokens
  const [solveIdx, setSolveIdx] = useState(0)             // index of the NEXT expected user move
  const [playerSide, setPlayerSide] = useState('white')

  // ── Attempt state ───────────────────────────────────────────────
  const [triesLeft, setTriesLeft] = useState(MAX_TRIES)
  const [phase, setPhase] = useState('playing')   // 'playing' | 'wrong' | 'done'
  const [resultKind, setResultKind] = useState(null)  // 'win' | 'loss' | null
  const [lastWrongMove, setLastWrongMove] = useState(null)
  const [showSolutionMode, setShowSolutionMode] = useState(false)  // user revealed solution
  const [outcomeMessage, setOutcomeMessage] = useState(null)
  const [ratingDelta, setRatingDelta] = useState(null)

  // ── Live counters ───────────────────────────────────────────────
  const [stats, setStats] = useState(null)   // { rating, solvedCount, totalAvailable }

  // ── Bootstrap: load users on mount ──────────────────────────────
  const refreshUsers = useCallback(async () => {
    const { data, error } = await chessPuzzleListUsers()
    if (error) { message.error(error); return }
    const items = data?.items || []
    setUsers(items)
    return items
  }, [])

  useEffect(() => {
    refreshUsers().then(items => {
      if (items && items.length && userId == null) setUserId(items[0].id)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Stats refresh ──────────────────────────────────────────────
  const refreshStats = useCallback(async (uid) => {
    const id = uid ?? userId
    if (!id) return
    const { data, error } = await chessPuzzleStats(id)
    if (error) return
    setStats(data)
  }, [userId])

  useEffect(() => {
    if (userId) refreshStats(userId)
  }, [userId, refreshStats])

  // ── Load next puzzle ───────────────────────────────────────────
  // Fires on user / difficulty change, and after a successful attempt
  // (with a small delay so the win message has time to land).
  const loadPuzzle = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setLoadError(null)
    setPuzzle(null)
    setOutcomeMessage(null)
    setRatingDelta(null)
    setShowSolutionMode(false)

    const { data, error } = await chessPuzzleNext({ userId, difficulty })
    setLoading(false)
    if (error) {
      setLoadError(error)
      return
    }
    // Lichess puzzles start with the OPPONENT's move (sets up the tactic).
    // Apply it so the FE board shows the position the user actually has to
    // solve, and the user plays from the side-to-move of THAT position.
    const moves = tokenize(data.moves)
    const c = freshChess(data.fen)
    const setupMove = moves[0]
    if (setupMove) {
      try {
        c.move({ from: setupMove.slice(0, 2), to: setupMove.slice(2, 4), promotion: setupMove[4] })
      } catch { /* malformed — skip */ }
    }
    chessRef.current = c
    setBoardFen(c.fen())
    setSolutionMoves(moves)        // includes setup at index 0
    setSolveIdx(1)                  // user's next move is index 1
    setPlayerSide(c.turn() === 'w' ? 'white' : 'black')
    setTriesLeft(MAX_TRIES)
    setPhase('playing')
    setResultKind(null)
    setLastWrongMove(null)
    setPuzzle(data)
  }, [userId, difficulty])

  useEffect(() => { loadPuzzle() }, [loadPuzzle])

  // ── Submit attempt to BE + bubble counters ─────────────────────
  const submitAttempt = useCallback(async ({ success: succ, attemptsUsed, viewedSolution }) => {
    if (!puzzle || !userId) return
    const { data, error } = await chessPuzzleAttempt({
      userId, puzzleId: puzzle.puzzleId,
      success: succ,
      attemptsUsed,
      viewedSolution,
      difficulty,
    })
    if (error) { message.error(error); return }
    setOutcomeMessage(data.message)
    setRatingDelta(data.ratingDelta)
    // Refresh stats so the corner counter updates immediately.
    refreshStats(userId)
  }, [puzzle, userId, difficulty, refreshStats])

  // ── Move handler ────────────────────────────────────────────────
  // Called by ChessBoard after a legal drag/drop. Compares the move's
  // UCI string against the expected solution ply. Promotion handled by
  // auto-queening for now (lichess solutions specify the promo letter
  // in the UCI suffix, so simple queening matches most cases; we accept
  // any promotion that lands on the same from/to as a soft match).
  const onUserMove = useCallback((from, to) => {
    if (phase !== 'playing') return
    const chess = chessRef.current
    const piece = chess.get(from)
    // Auto-queen on promotion — matches lichess's "q" default in puzzles.
    const toRank = to[1]
    const isPromotion = piece && piece.type === 'p' &&
      ((piece.color === 'w' && toRank === '8') || (piece.color === 'b' && toRank === '1'))
    const uci = `${from}${to}${isPromotion ? 'q' : ''}`
    const expected = solutionMoves[solveIdx]
    if (!expected) return

    // Match: exact UCI OR same from/to with different promotion piece.
    const matches = uci === expected
      || (expected.length >= 4 && expected.slice(0, 4) === uci.slice(0, 4))

    if (!matches) {
      // Wrong move — show it briefly via the board's history? Simpler:
      // tag the wrong move and snap back to current FEN by re-loading.
      setLastWrongMove({ from, to, uci, expected })
      setTriesLeft(prev => prev - 1)
      setPhase('wrong')
      return
    }

    // Apply the user's correct move (use the expected UCI so promotion
    // letter is honoured exactly).
    try {
      chess.move({
        from: expected.slice(0, 2),
        to: expected.slice(2, 4),
        promotion: expected.length === 5 ? expected[4] : undefined,
      })
    } catch { return }
    const nextIdx = solveIdx + 1
    setBoardFen(chess.fen())

    // If there's an opponent reply scripted, auto-apply it after a short
    // beat so the user sees their move land before the opponent responds.
    const opponentReply = solutionMoves[nextIdx]
    if (opponentReply) {
      setTimeout(() => {
        try {
          chess.move({
            from: opponentReply.slice(0, 2),
            to: opponentReply.slice(2, 4),
            promotion: opponentReply.length === 5 ? opponentReply[4] : undefined,
          })
        } catch { return }
        setBoardFen(chess.fen())
        setSolveIdx(nextIdx + 1)
      }, 350)
    } else {
      // No more opponent replies → user's last move WAS the final move.
      setSolveIdx(nextIdx)
      setPhase('done')
      setResultKind('win')
      submitAttempt({
        success: true,
        attemptsUsed: MAX_TRIES - triesLeft + 1,
        viewedSolution: false,
      })
    }
  }, [phase, solutionMoves, solveIdx, triesLeft, submitAttempt])

  // ── Retry handler: snap board back to the position BEFORE the wrong move ──
  const handleRetry = useCallback(() => {
    if (triesLeft <= 0) {
      // No tries left — counts as a loss.
      setPhase('done')
      setResultKind('loss')
      submitAttempt({
        success: false,
        attemptsUsed: MAX_TRIES,
        viewedSolution: false,
      })
      return
    }
    // Rebuild board from puzzle.fen + replay all moves up to solveIdx-1
    // (the position right after the opponent's last reply / setup move).
    if (!puzzle) return
    const c = freshChess(puzzle.fen)
    for (let i = 0; i < solveIdx; i++) {
      const mv = solutionMoves[i]
      if (!mv) break
      try {
        c.move({
          from: mv.slice(0, 2),
          to: mv.slice(2, 4),
          promotion: mv.length === 5 ? mv[4] : undefined,
        })
      } catch { break }
    }
    chessRef.current = c
    setBoardFen(c.fen())
    setLastWrongMove(null)
    setPhase('playing')
  }, [puzzle, solveIdx, solutionMoves, triesLeft, submitAttempt])

  // ── Show solution (counts as fail if invoked before win) ────────
  const handleShowSolution = useCallback(() => {
    if (phase === 'done' && resultKind === 'win') {
      // Already solved — just toggle the analyze view, no penalty.
      setShowSolutionMode(true)
      return
    }
    // Cheat path → fail.
    setShowSolutionMode(true)
    setPhase('done')
    setResultKind('loss')
    submitAttempt({
      success: false,
      attemptsUsed: MAX_TRIES - triesLeft + 1,
      viewedSolution: true,
    })
  }, [phase, resultKind, triesLeft, submitAttempt])

  // ── User creation ───────────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    const name = newName.trim()
    if (!name) return
    const { data, error } = await chessPuzzleCreateUser(name)
    if (error) { message.error(error); return }
    setCreateOpen(false)
    setNewName('')
    await refreshUsers()
    setUserId(data.id)
    message.success(`Welcome, ${data.name}! Starting at ${data.rating}.`)
  }, [newName, refreshUsers])

  // ── User deletion (vault-gated) ─────────────────────────────────
  const handleDelete = useCallback(async (id) => {
    const target = users.find(u => u.id === id)
    if (!target) return
    Modal.confirm({
      title: `Delete user "${target.name}"?`,
      content: 'This wipes their rating + attempt history. Vault auth required.',
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        const { error, status } = await chessPuzzleDeleteUser(id)
        if (error) {
          if (status === 401) message.error('Vault unlock required to delete users.')
          else message.error(error)
          return
        }
        message.success(`Deleted "${target.name}".`)
        const remaining = await refreshUsers()
        if (id === userId) setUserId(remaining?.[0]?.id ?? null)
      },
    })
  }, [users, userId, refreshUsers])

  // ── Derived display values ──────────────────────────────────────
  const playerToMove = useMemo(() => {
    if (!puzzle) return null
    return playerSide === 'white' ? 'White to move' : 'Black to move'
  }, [puzzle, playerSide])

  const movableColor = phase === 'playing' ? playerSide : null

  // Bracket display — recomputed from stats.rating + difficulty so it
  // stays in sync after every attempt resolves.
  const bracket = useMemo(() => {
    const base = stats?.rating ?? users.find(u => u.id === userId)?.rating ?? 1000
    if (difficulty === 'easy')   return `${base + 1}-${base + 100}`
    if (difficulty === 'medium') return `${base + 200}-${base + 400}`
    return `${base + 500}-${base + 800}`
  }, [stats?.rating, users, userId, difficulty])

  // ── Render ─────────────────────────────────────────────────────
  return (
    <section className="luxe-card p-4 sm:p-5 space-y-4">
      {/* Heading */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="eyebrow-mono mb-1">// puzzle trainer</div>
          <h2 className="text-xl sm:text-2xl font-bold gradient-text-amber">
            <FireOutlined /> Chess Puzzles
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            ~{stats?.totalAvailable?.toLocaleString() || '—'} lichess puzzles · pick your difficulty · ratings update live.
          </p>
        </div>
        {/* Live counters in the corner */}
        {stats && (
          <div className="flex items-center gap-2">
            <div className="px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/5 min-w-[88px]">
              <div className="text-[9px] uppercase tracking-wider text-gray-500">Rating</div>
              <div className="text-amber-300 font-mono text-lg tabular-nums leading-tight">{stats.rating}</div>
            </div>
            <div className="px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 min-w-[88px]">
              <div className="text-[9px] uppercase tracking-wider text-gray-500">Solved</div>
              <div className="text-emerald-300 font-mono text-lg tabular-nums leading-tight">{stats.solvedCount}</div>
            </div>
          </div>
        )}
      </div>

      {/* Top bar — user select + create + difficulty */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={userId}
          onChange={setUserId}
          placeholder="Pick a player"
          style={{ minWidth: 200 }}
          options={users.map(u => ({
            value: u.id,
            label: <span><b>{u.name}</b> <span className="text-gray-500 text-xs">· {u.rating}</span></span>,
          }))}
          notFoundContent={<span className="text-gray-500 text-xs">No players yet — create one →</span>}
        />
        <Button variant="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)} size="middle">
          New player
        </Button>
        {userId && (
          <Tooltip title="Delete this player (vault unlock required)">
            <Button variant="danger" icon={<DeleteOutlined />} onClick={() => handleDelete(userId)} size="middle" />
          </Tooltip>
        )}
        <div className="flex-1 min-w-[200px]" />
        <div className="flex items-center gap-1.5 ml-auto">
          {DIFFS.map(d => {
            const active = difficulty === d.id
            const cls = active ? ACCENTS_ACTIVE[d.accent] : ACCENTS[d.accent]
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setDifficulty(d.id)}
                className={`text-xs font-semibold px-3 py-2 rounded-lg border transition-colors ${cls}`}
                title={d.hint}
              >
                {d.label}
                <span className="text-[10px] opacity-70 ml-1.5">{d.sub}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Main panel: board + side info */}
      {!userId ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          Create or pick a player above to start solving puzzles.
        </div>
      ) : loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          <LoadingOutlined className="text-2xl text-amber-400 mb-2" />
          <div>Picking a puzzle in your bracket…</div>
        </div>
      ) : loadError ? (
        <div className="text-center py-8 text-rose-300 text-sm">
          {loadError}
          <div className="mt-3">
            <Button variant="secondary" icon={<ReloadOutlined />} onClick={loadPuzzle}>Retry</Button>
          </div>
        </div>
      ) : !puzzle ? (
        <div className="text-center py-8 text-gray-500 text-sm">No puzzle loaded.</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          {/* Board */}
          <div className="space-y-3">
            <div className="max-w-[560px] mx-auto">
              <ChessBoard
                chess={chessRef.current}
                fen={boardFen}
                orientation={playerSide}
                movableColor={movableColor}
                onMove={onUserMove}
              />
            </div>
            {/* Status line under the board */}
            <div className="luxe-card p-3 flex items-center justify-between flex-wrap gap-2">
              <span className="text-sm font-mono">
                {phase === 'playing' && (
                  <>
                    <PlayCircleOutlined className="text-amber-400 mr-2" />
                    <span className="text-amber-200">{playerToMove}</span>
                  </>
                )}
                {phase === 'wrong' && (
                  <>
                    <CloseCircleOutlined className="text-rose-400 mr-2" />
                    <span className="text-rose-300">
                      Wrong move. {triesLeft > 0 ? `${triesLeft} ${triesLeft === 1 ? 'try' : 'tries'} left.` : 'No retries — counts as a loss.'}
                    </span>
                  </>
                )}
                {phase === 'done' && resultKind === 'win' && (
                  <>
                    <CheckCircleOutlined className="text-emerald-400 mr-2" />
                    <span className="text-emerald-200 font-semibold">{outcomeMessage || 'Solved!'}</span>
                    {ratingDelta != null && (
                      <span className={`ml-2 font-mono ${ratingDelta >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                        ({ratingDelta >= 0 ? '+' : ''}{ratingDelta})
                      </span>
                    )}
                  </>
                )}
                {phase === 'done' && resultKind === 'loss' && (
                  <>
                    <CloseCircleOutlined className="text-rose-400 mr-2" />
                    <span className="text-rose-300">{outcomeMessage || 'Better luck next puzzle.'}</span>
                    {ratingDelta != null && (
                      <span className="ml-2 font-mono text-rose-300">({ratingDelta})</span>
                    )}
                  </>
                )}
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {phase === 'wrong' && triesLeft > 0 && (
                  <Button variant="danger" icon={<ReloadOutlined />} onClick={handleRetry} size="small">
                    Try again
                  </Button>
                )}
                {phase === 'wrong' && triesLeft <= 0 && (
                  <Button variant="danger" onClick={handleRetry} size="small">
                    Reveal result
                  </Button>
                )}
                {phase !== 'done' && (
                  <Button variant="ghost" icon={<EyeOutlined />} onClick={handleShowSolution} size="small">
                    Show solution
                  </Button>
                )}
                {phase === 'done' && (
                  <Button variant="primary" icon={<ArrowRightOutlined />} onClick={loadPuzzle} size="small">
                    Next puzzle
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Side panel — bracket + themes + retry pip */}
          <div className="flex flex-col gap-3">
            <div className="luxe-card p-3">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Puzzle bracket</div>
              <div className="text-sm font-mono text-amber-200">{bracket}</div>
              <div className="text-[10px] text-gray-500 mt-1">
                difficulty <span className="text-amber-300">{difficulty}</span> · puzzle rated <span className="text-amber-300">{puzzle.rating}</span>
              </div>
            </div>

            <div className="luxe-card p-3">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Tries remaining</div>
              <div className="flex gap-1.5">
                {[0, 1, 2].map(i => {
                  const used = i >= triesLeft
                  return (
                    <span key={i} className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-bold
                      ${used ? 'border-gray-700 bg-gray-900 text-gray-600' : 'border-emerald-400 bg-emerald-500/20 text-emerald-200'}`}>
                      {used ? '✗' : i + 1}
                    </span>
                  )
                })}
              </div>
            </div>

            {puzzle.themes?.length > 0 && (
              <div className="luxe-card p-3">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Themes</div>
                <div className="flex flex-wrap gap-1">
                  {/* Themes are only shown post-solve so they don't spoil
                      the tactic. While playing, render a placeholder. */}
                  {phase === 'done' || showSolutionMode
                    ? puzzle.themes.map(t => (
                        <Tag key={t} color="default" className="!bg-gray-800 !border-gray-700 !text-gray-300 !text-[10px]">{t}</Tag>
                      ))
                    : <span className="text-[11px] text-gray-600 italic">hidden until you solve</span>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Analyze panel — shows after each puzzle attempt resolves */}
      {phase === 'done' && puzzle && (
        <AnalyzePanel
          puzzle={puzzle}
          resultKind={resultKind}
          outcomeMessage={outcomeMessage}
          ratingDelta={ratingDelta}
        />
      )}

      {/* Create user modal */}
      <Modal
        open={createOpen}
        onCancel={() => { setCreateOpen(false); setNewName('') }}
        onOk={handleCreate}
        title="New player"
        okText="Create"
        okButtonProps={{ disabled: !newName.trim() }}
        cancelText="Cancel"
      >
        <div className="space-y-3 py-2">
          <p className="text-xs text-gray-400">
            Pick a nickname. Anyone can create a player — your rating starts at <b className="text-amber-300">1000</b>.
          </p>
          <Input
            size="large"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onPressEnter={handleCreate}
            placeholder="e.g. ChessLover42"
            maxLength={24}
            autoFocus
          />
        </div>
      </Modal>
    </section>
  )
}

// ── Analyze panel — appears after the puzzle resolves ─────────────
// Shows the full UCI solution sequence as numbered SAN-ish pairs,
// themes, opening tags, and a deep-link to the source lichess game.
// The user can step through the moves manually with prev/next pips.
function AnalyzePanel({ puzzle, resultKind, outcomeMessage, ratingDelta }) {
  const moves = useMemo(() => tokenize(puzzle.moves), [puzzle.moves])
  // Build a parallel chess.js timeline so we can render SAN + per-move
  // FEN snapshots for the "step through" experience.
  const timeline = useMemo(() => {
    const c = freshChess(puzzle.fen)
    const arr = [{ san: '(start)', fen: c.fen() }]
    for (const uci of moves) {
      try {
        const mv = c.move({
          from: uci.slice(0, 2), to: uci.slice(2, 4),
          promotion: uci.length === 5 ? uci[4] : undefined,
        })
        arr.push({ san: mv.san, fen: c.fen() })
      } catch { break }
    }
    return arr
  }, [puzzle.fen, moves])

  const [step, setStep] = useState(0)
  // The board for the analyze view is a fresh chess.js so the user can
  // step around without affecting the live trainer board above.
  const analyzeChessRef = useRef(new Chess())
  useEffect(() => {
    analyzeChessRef.current = freshChess(timeline[step]?.fen || puzzle.fen)
  }, [step, timeline, puzzle.fen])

  return (
    <div className="luxe-card p-4 border-l-4 border-amber-500/60 bg-amber-500/[0.03]">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2">
          <BulbOutlined className={resultKind === 'win' ? 'text-emerald-400' : 'text-rose-400'} />
          <h3 className="text-base font-bold text-amber-200">Analyze</h3>
          {resultKind === 'win' && (
            <span className="text-[10px] uppercase tracking-wider text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10">
              <TrophyOutlined className="mr-1" /> Solved
            </span>
          )}
          {resultKind === 'loss' && (
            <span className="text-[10px] uppercase tracking-wider text-rose-400 px-2 py-0.5 rounded border border-rose-500/40 bg-rose-500/10">
              Missed
            </span>
          )}
        </div>
        {ratingDelta != null && (
          <span className={`text-sm font-mono px-2 py-0.5 rounded border
            ${ratingDelta >= 0 ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
                                : 'text-rose-300 border-rose-500/40 bg-rose-500/10'}`}>
            {ratingDelta >= 0 ? '+' : ''}{ratingDelta} rating
          </span>
        )}
      </div>

      {outcomeMessage && (
        <p className={`text-sm mb-3 ${resultKind === 'win' ? 'text-emerald-200' : 'text-rose-200'}`}>
          {outcomeMessage}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Solution mini-board */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Solution playback</div>
          <div className="max-w-[280px]">
            <ChessBoard
              chess={analyzeChessRef.current}
              fen={timeline[step]?.fen || puzzle.fen}
              orientation={timeline[1] ? (freshChess(timeline[1].fen).turn() === 'b' ? 'white' : 'black') : 'white'}
              movableColor={null}
              onMove={() => {}}
            />
          </div>
          <div className="flex items-center justify-center gap-2 mt-2">
            <Button
              variant="ghost" size="small"
              disabled={step === 0}
              onClick={() => setStep(s => Math.max(0, s - 1))}
            >‹ Prev</Button>
            <span className="text-xs font-mono text-gray-400 tabular-nums px-2">{step}/{timeline.length - 1}</span>
            <Button
              variant="ghost" size="small"
              disabled={step >= timeline.length - 1}
              onClick={() => setStep(s => Math.min(timeline.length - 1, s + 1))}
            >Next ›</Button>
          </div>
        </div>

        {/* Solution sequence + metadata */}
        <div className="space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Move sequence</div>
            <div className="text-xs font-mono text-gray-200 leading-relaxed bg-black/40 rounded p-2 border border-gray-800">
              {timeline.slice(1).map((t, i) => (
                <span key={i}
                  onClick={() => setStep(i + 1)}
                  className={`inline-block mr-2 cursor-pointer px-1 rounded ${step === i + 1 ? 'bg-amber-500/30 text-amber-100' : 'hover:bg-gray-800'}`}>
                  {i % 2 === 0 && <span className="text-gray-600">{Math.floor(i / 2) + 1}.</span>}{' '}
                  {t.san}
                </span>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Themes</div>
            <div className="flex flex-wrap gap-1">
              {puzzle.themes?.map(t => (
                <Tag key={t} className="!bg-gray-800 !border-gray-700 !text-gray-300 !text-[10px]">{t}</Tag>
              ))}
            </div>
          </div>

          {puzzle.openingTags?.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Opening</div>
              <div className="flex flex-wrap gap-1">
                {puzzle.openingTags.map(o => (
                  <Tag key={o} className="!bg-amber-500/10 !border-amber-500/30 !text-amber-200 !text-[10px]">
                    {o.replace(/_/g, ' ')}
                  </Tag>
                ))}
              </div>
            </div>
          )}

          <div className="pt-1">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Starting FEN</div>
            <code className="block text-[10px] text-gray-300 bg-black/40 rounded p-2 break-all border border-gray-800 font-mono">
              {puzzle.fen}
            </code>
          </div>

          {puzzle.gameUrl && (
            <a href={puzzle.gameUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-amber-300 hover:text-amber-200">
              <LinkOutlined /> View source game on Lichess
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
