// VariantsHub — grid of chess-variant cards on /chess.
//
// 100 % client-side. Stockfish runs in a Web Worker inside the page
// (see src/lib/stockfishLocal.js). Zero BE calls for any variant here —
// the analysis page above the hub still uses BE Stockfish for the main
// board, but this hub is fully self-contained.
//
// Three engine variants:
//   • Chess960 (Fischer Random) — shuffled back rank, X-FEN castling.
//     UCI_Chess960=true is forwarded to the worker.
//   • King of the Hill — first king on d4/e4/d5/e5 wins. We post the
//     position to a vanilla Stockfish; our own JS layer checks the
//     hill-win after each move.
//   • Three-Check — first side to 3 checks wins. Same approach: vanilla
//     SF for the move search, FE win-check after each ply.
// One pure-FE variant:
//   • Offline 2-Player Board — hot-seat pass-and-play. No engine, no
//     network. Two humans alternate on one device. Flip board + PGN
//     export at game end.
// Four rules-card-only variants:
//   Atomic · Crazyhouse · Antichess · Horde.
//
// Clicking a playable card opens an inline panel below the grid with a
// fresh ChessBoard + a small status header + "New game" / "Close" buttons.
// chess.js owns move state; we never mutate the parent /chess page's
// chess instance so the standard board above this section is untouched.

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { Chess } from 'chess.js'
import { CloseOutlined, ReloadOutlined, SwapOutlined, CopyOutlined } from '@ant-design/icons'
import ChessBoard from './ChessBoard'
import { generate960Fen } from '../../lib/chess960'
import { getBestMove, skillLevelFromElo } from '../../lib/stockfishLocal'

// ── Variant catalogue ───────────────────────────────────────────────
// Cards with `playable: true` open the inline engine panel; cards with
// `offline: true` open the human-only hot-seat panel; the rest are
// rules-only and show a "Coming soon" pill.
const VARIANTS = [
  {
    id: 'chess960',
    name: 'Chess960',
    aka: 'Fischer Random',
    icon: '🎲',
    eco: 'FRC',
    playable: true,
    summary: 'Back rank shuffled. Bishops on opposite colours, king between rooks. Castling rules adapt to starting files.',
  },
  {
    id: 'koth',
    name: 'King of the Hill',
    aka: 'KoTH',
    icon: '⛰️',
    eco: 'KOTH',
    playable: true,
    summary: 'First king to reach one of the four central squares (d4, e4, d5, e5) wins. Checkmate also wins as normal.',
  },
  {
    id: 'threeCheck',
    name: 'Three-Check',
    aka: '3-Check',
    icon: '✓✓✓',
    eco: '3C',
    playable: true,
    summary: 'Standard rules, but the first side to deliver three checks wins immediately. Mate ends the game as usual.',
  },
  {
    id: 'offline',
    name: 'Offline Board',
    aka: 'Hot-Seat',
    icon: '🪑',
    eco: 'PvP',
    offline: true,
    summary: 'Pass-and-play, no engine, no internet. Just two humans on one screen.',
  },
  {
    id: 'atomic',
    name: 'Atomic',
    aka: 'Boom chess',
    icon: '💥',
    eco: 'ATM',
    playable: false,
    summary: 'Captures detonate a 3×3 square (pawns excepted). You can win by exploding the opponent\'s king.',
  },
  {
    id: 'crazyhouse',
    name: 'Crazyhouse',
    aka: 'Drop chess',
    icon: '♛↺',
    eco: 'CZH',
    playable: false,
    summary: 'Captured pieces switch sides and join your reserve. You can drop them onto any empty square as your move.',
  },
  {
    id: 'antichess',
    name: 'Antichess',
    aka: 'Losing chess',
    icon: '🪞',
    eco: 'ATC',
    playable: false,
    summary: 'Captures are mandatory. The king is just a piece — no check, no mate. First to lose every piece wins.',
  },
  {
    id: 'horde',
    name: 'Horde',
    aka: 'Pawn swarm',
    icon: '🛡️',
    eco: 'HRD',
    playable: false,
    summary: 'Black plays standard. White has 36 pawns and no other pieces. White wins by mating; black wins by clearing the swarm.',
  },
]

// Central-hill squares for KoTH. Win condition fires the moment a king
// LANDS on any of these, regardless of check status.
const HILL_SQUARES = new Set(['d4', 'e4', 'd5', 'e5'])

// Find the file/rank of the king of the given colour using chess.js .board().
function kingSquare(chess, color) {
  const board = chess.board()
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq = board[r][f]
      if (sq && sq.type === 'k' && sq.color === color) {
        return `${'abcdefgh'[f]}${8 - r}`
      }
    }
  }
  return null
}

export default function VariantsHub() {
  const [openVariant, setOpenVariant] = useState(null)
  const variant = openVariant ? VARIANTS.find(v => v.id === openVariant) : null

  return (
    <section className="mt-10">
      <header className="mb-5">
        <div className="eyebrow-mono mb-1">// chess variants</div>
        <h2 className="text-xl sm:text-2xl font-bold gradient-text-amber mb-1.5">
          ♟ Variants
        </h2>
        <p className="text-sm text-gray-400 max-w-2xl">
          Eight rule-sets beyond standard chess. Three play vs Stockfish in the browser (no server),
          one is a pure 2-player hot-seat board, the rest are documented for now.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {VARIANTS.map(v => (
          <VariantCard
            key={v.id}
            variant={v}
            active={openVariant === v.id}
            onPlay={() => (v.playable || v.offline) && setOpenVariant(v.id)}
          />
        ))}
      </div>

      {variant && variant.offline && (
        <div className="mt-5">
          <OfflinePanel
            variant={variant}
            onClose={() => setOpenVariant(null)}
          />
        </div>
      )}
      {variant && variant.playable && (
        <div className="mt-5">
          <VariantPanel
            variant={variant}
            onClose={() => setOpenVariant(null)}
          />
        </div>
      )}
    </section>
  )
}

// ── Variant card ────────────────────────────────────────────────────
function VariantCard({ variant, active, onPlay }) {
  const interactive = variant.playable || variant.offline
  // Pill text + accent — engine cards say "Play vs Stockfish", the
  // hot-seat card says "2-Player Hot-Seat" so the user knows the lane.
  const pillText = variant.offline
    ? (active ? 'Playing ↓' : '2-Player Hot-Seat ↗')
    : (active ? 'Playing ↓' : 'Play vs Stockfish ↗')
  return (
    <button
      type="button"
      onClick={onPlay}
      disabled={!interactive}
      className={`group text-left luxe-card p-4 transition-colors flex flex-col gap-3 min-h-[180px]
        ${active ? 'border-amber-400/60 ring-1 ring-amber-400/30' : ''}
        ${interactive ? 'hover:border-amber-500/40 cursor-pointer' : 'opacity-80 cursor-default'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl leading-none">{variant.icon}</span>
          <div>
            <p className="text-sm font-bold text-amber-100 leading-tight">{variant.name}</p>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mt-0.5">{variant.aka}</p>
          </div>
        </div>
        <span className="text-[9px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded border border-gray-700 bg-gray-900/60 text-gray-400">
          {variant.eco}
        </span>
      </div>
      <p className="text-xs text-gray-300 leading-relaxed line-clamp-3 flex-1">
        {variant.summary}
      </p>
      <div className="flex items-center justify-between gap-2 pt-1">
        {interactive ? (
          <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-lg border
            ${active
              ? 'border-amber-400/60 bg-amber-500/20 text-amber-200'
              : 'border-amber-500/40 bg-amber-500/10 text-amber-300 group-hover:bg-amber-500/20'}`}>
            {pillText}
          </span>
        ) : (
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-lg border border-gray-700 bg-gray-900/60 text-gray-400">
            Coming soon
          </span>
        )}
      </div>
    </button>
  )
}

// ── Inline play panel (engine variants) ─────────────────────────────
// Fresh chess.js instance scoped to the variant — does NOT touch the
// parent /chess page's main board. Win conditions overlay chess.js's
// built-in isGameOver() check so KoTH / 3-Check terminate even when no
// checkmate has occurred. Engine moves come from the local stockfish
// worker (src/lib/stockfishLocal.js) — no network.
function VariantPanel({ variant, onClose }) {
  // Initial FEN depends on variant — 960 uses a generated shuffled FEN;
  // KoTH / 3-Check use the standard starting position.
  const buildInitialFen = useCallback(() => {
    return variant.id === 'chess960' ? generate960Fen() : new Chess().fen()
  }, [variant.id])

  const chessRef = useRef(null)
  const [fen, setFen] = useState('')
  const [playerColor, setPlayerColor] = useState('white')
  const [history, setHistory] = useState([])
  const [status, setStatus] = useState({ kind: 'idle', text: 'Your move' })
  const [thinking, setThinking] = useState(false)
  // KoTH winner — set the moment a king lands on the hill.
  const [hillWinner, setHillWinner] = useState(null)         // 'w' | 'b' | null
  // 3-Check counters — incremented on the side that just got checked.
  const [whiteChecksGiven, setWhiteChecksGiven] = useState(0)
  const [blackChecksGiven, setBlackChecksGiven] = useState(0)
  const [checkWinner, setCheckWinner] = useState(null)       // 'w' | 'b' | null
  // Used to force ChessBoard to rebuild on reset / 960 reshuffle.
  const [boardKey, setBoardKey] = useState(0)

  // Boot / reset — generate fresh state. Runs on variant change and reset.
  const reset = useCallback(() => {
    const f = buildInitialFen()
    // chess.js v1+ accepts 960-style castling letters when given a custom
    // FEN; we still want the rules engine to enforce moves either way.
    let c
    try { c = new Chess(f) } catch { c = new Chess() }
    chessRef.current = c
    setFen(c.fen())
    setHistory([])
    setHillWinner(null)
    setWhiteChecksGiven(0)
    setBlackChecksGiven(0)
    setCheckWinner(null)
    setStatus({ kind: 'idle', text: 'Your move' })
    setBoardKey(k => k + 1)
  }, [buildInitialFen])

  useEffect(() => { reset() }, [reset])

  // Compose game-over state from chess.js + our variant rules.
  const isGameOver = useMemo(() => {
    if (!chessRef.current) return false
    if (chessRef.current.isGameOver()) return true
    if (variant.id === 'koth' && hillWinner) return true
    if (variant.id === 'threeCheck' && checkWinner) return true
    return false
  }, [fen, variant.id, hillWinner, checkWinner])

  const gameOverReason = useMemo(() => {
    if (!chessRef.current) return null
    if (variant.id === 'koth' && hillWinner) {
      return `${hillWinner === 'w' ? 'White' : 'Black'} reached the hill`
    }
    if (variant.id === 'threeCheck' && checkWinner) {
      return `${checkWinner === 'w' ? 'White' : 'Black'} delivered 3 checks`
    }
    const c = chessRef.current
    if (!c.isGameOver()) return null
    if (c.isCheckmate()) return `Checkmate · ${c.turn() === 'w' ? 'Black' : 'White'} wins`
    if (c.isStalemate()) return 'Stalemate'
    if (c.isInsufficientMaterial()) return 'Insufficient material'
    if (c.isDraw()) return 'Draw'
    return 'Game over'
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, variant.id, hillWinner, checkWinner])

  const turnColor = useMemo(
    () => (chessRef.current?.turn() === 'w' ? 'white' : 'black'),
    [fen],
  )
  const isPlayerTurn = !isGameOver && turnColor === playerColor

  // Apply a move (from user OR engine) and run variant win-condition checks.
  // Centralised so KoTH/3-Check logic only lives in one place.
  const applyMove = useCallback((move) => {
    const c = chessRef.current
    if (!c) return null
    let result
    try {
      result = c.move(move)
    } catch { return null }
    if (!result) return null

    // ── King of the Hill ── win condition spot:
    // After every successful move, check whether the side-that-just-moved's
    // king is sitting on d4/e4/d5/e5. If so, that side wins immediately.
    if (variant.id === 'koth') {
      const moverColor = result.color   // 'w' | 'b'
      const ksq = kingSquare(c, moverColor)
      if (ksq && HILL_SQUARES.has(ksq)) {
        setHillWinner(moverColor)
      }
    }

    // ── Three-Check ── win condition spot:
    // chess.js .inCheck() reports whether the SIDE TO MOVE is in check.
    // After a move, the side to move is the OPPONENT of the mover, so
    // a check delivered by the mover increments the mover's counter.
    if (variant.id === 'threeCheck' && c.inCheck()) {
      if (result.color === 'w') {
        setWhiteChecksGiven(prev => {
          const next = prev + 1
          if (next >= 3) setCheckWinner('w')
          return next
        })
      } else {
        setBlackChecksGiven(prev => {
          const next = prev + 1
          if (next >= 3) setCheckWinner('b')
          return next
        })
      }
    }

    setFen(c.fen())
    setHistory(c.history())
    return result
  }, [variant.id])

  const onUserMove = useCallback((from, to) => {
    if (!isPlayerTurn) return
    // Auto-queen for variants (the parent /chess page has a full promo
    // picker; variants are a quicker lane — keep it simple).
    const piece = chessRef.current.get(from)
    const promotion = piece && piece.type === 'p' && (to[1] === '8' || to[1] === '1') ? 'q' : undefined
    applyMove({ from, to, promotion })
  }, [applyMove, isPlayerTurn])

  // Engine reply — runs when it becomes the engine's turn and the game
  // isn't over (including via variant win conditions, not just chess.js).
  // Uses the local Web Worker; no network involved.
  useEffect(() => {
    if (isGameOver) return
    if (turnColor === playerColor) return
    if (!chessRef.current) return
    let cancelled = false
    setThinking(true)
    setStatus({ kind: 'thinking', text: 'Engine thinking…' })
    // 960 needs the UCI_Chess960 flag so SF interprets castling correctly.
    // Skill Level approximates ELO 1500 → roughly Skill 10/20 — strong
    // enough to challenge but not crushing.
    const options = { 'Skill Level': skillLevelFromElo(1500) }
    if (variant.id === 'chess960') options.UCI_Chess960 = true
    getBestMove(fen, { movetime: 1500, options })
      .then(({ bestmove }) => {
        if (cancelled) return
        setThinking(false)
        if (!bestmove) {
          setStatus({ kind: 'error', text: 'Engine returned no move' })
          return
        }
        applyMove({
          from: bestmove.slice(0, 2),
          to:   bestmove.slice(2, 4),
          promotion: bestmove.length === 5 ? bestmove[4] : undefined,
        })
        setStatus({ kind: 'idle', text: 'Your move' })
      })
      .catch((err) => {
        if (cancelled) return
        setThinking(false)
        setStatus({ kind: 'error', text: err?.message || 'Engine error' })
      })
    return () => { cancelled = true }
  // fen drives the effect — every time the position changes, re-evaluate.
  }, [fen, playerColor, isGameOver, turnColor, variant.id, applyMove])

  const flip = () => setPlayerColor(c => c === 'white' ? 'black' : 'white')

  // Movable colour follows turn when it's the human's turn; null when
  // game is over OR engine is to move (locks board → no premoves).
  const movableColor = isGameOver ? null : (isPlayerTurn ? playerColor : null)

  return (
    <div className="luxe-card p-4 sm:p-5 border-amber-500/30">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">{variant.icon}</span>
          <div>
            <h3 className="text-base font-bold text-amber-200">{variant.name}</h3>
            <p className="text-[10px] uppercase tracking-wider text-gray-500">
              vs Stockfish (local) · ELO ~1500
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button onClick={flip}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-gray-800 hover:border-gray-600 text-gray-300 inline-flex items-center gap-1.5">
            <SwapOutlined /> Flip
          </button>
          <button onClick={reset}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 inline-flex items-center gap-1.5">
            <ReloadOutlined /> New game
          </button>
          <button onClick={onClose}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-gray-800 hover:border-gray-600 text-gray-300 inline-flex items-center gap-1.5">
            <CloseOutlined /> Close
          </button>
        </div>
      </div>

      {/* Variant-specific status row — for 3-Check we show the check
          counters; for KoTH we show the hill squares as a hint. */}
      {variant.id === 'threeCheck' && (
        <div className="mb-3 flex items-center gap-3 text-[11px]">
          <span className="text-gray-400">Checks:</span>
          <span className="font-mono text-amber-200">White {whiteChecksGiven}/3</span>
          <span className="text-gray-600">·</span>
          <span className="font-mono text-amber-200">Black {blackChecksGiven}/3</span>
        </div>
      )}
      {variant.id === 'koth' && (
        <div className="mb-3 text-[11px] text-gray-400">
          <span className="text-gray-500">Hill:</span>{' '}
          <span className="font-mono text-amber-200">d4 · e4 · d5 · e5</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-3 items-start">
        <div className="max-w-[520px] mx-auto w-full">
          {chessRef.current && (
            <ChessBoard
              key={boardKey}
              chess={chessRef.current}
              fen={fen}
              orientation={playerColor}
              movableColor={movableColor}
              onMove={onUserMove}
              layoutKey={`variant-${variant.id}-${boardKey}`}
            />
          )}
        </div>

        <div className="space-y-2 text-xs">
          <div className={`px-3 py-2 rounded-lg border font-mono ${
            status.kind === 'error' ? 'border-rose-400/40 bg-rose-500/10 text-rose-300'
            : thinking ? 'border-cyan-400/40 bg-cyan-500/10 text-cyan-300'
            : 'border-gray-800 bg-gray-900/60 text-gray-300'
          }`}>
            {thinking && <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse mr-1.5 align-middle" />}
            {isGameOver ? gameOverReason : status.text}
          </div>
          <div className="luxe-card p-3 bg-black/30">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Rules</p>
            <p className="text-[11px] text-gray-300 leading-relaxed">{variant.summary}</p>
          </div>
          {history.length > 0 && (
            <div className="luxe-card p-3 bg-black/30">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Moves · {history.length}</p>
              <p className="text-[11px] font-mono text-gray-200 break-words leading-relaxed max-h-32 overflow-y-auto">
                {history.join(' ')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Offline 2-Player hot-seat panel ─────────────────────────────────
// Pure local pass-and-play. No engine, no network, ever. chess.js owns
// move validation + game-over detection. The board orientation flips
// after each ply so the side to move always faces the player on the
// other side of the screen — unless the user has explicitly locked
// orientation via the Flip button (autoFlip = false).
function OfflinePanel({ variant, onClose }) {
  const chessRef = useRef(null)
  const [fen, setFen] = useState('')
  // orientation = the colour currently rendered at the bottom of the
  // board. Starts on 'white'; auto-rotates on each move when autoFlip
  // is on. Manual Flip button toggles + sets autoFlip = false so the
  // user keeps a fixed perspective once they explicitly pick one.
  const [orientation, setOrientation] = useState('white')
  const [autoFlip, setAutoFlip] = useState(true)
  const [history, setHistory] = useState([])
  const [boardKey, setBoardKey] = useState(0)
  const [copyStatus, setCopyStatus] = useState(null)

  const reset = useCallback(() => {
    chessRef.current = new Chess()
    setFen(chessRef.current.fen())
    setHistory([])
    setOrientation('white')
    setAutoFlip(true)
    setBoardKey(k => k + 1)
    setCopyStatus(null)
  }, [])

  useEffect(() => { reset() }, [reset])

  const turnColor = useMemo(
    () => (chessRef.current?.turn() === 'w' ? 'white' : 'black'),
    [fen],
  )

  const isGameOver = chessRef.current?.isGameOver() ?? false
  const gameOverReason = useMemo(() => {
    const c = chessRef.current
    if (!c || !c.isGameOver()) return null
    if (c.isCheckmate()) return `Checkmate · ${c.turn() === 'w' ? 'Black' : 'White'} wins`
    if (c.isStalemate()) return 'Stalemate · Draw'
    if (c.isInsufficientMaterial()) return 'Insufficient material · Draw'
    if (c.isThreefoldRepetition()) return 'Threefold repetition · Draw'
    if (c.isDraw()) return '50-move rule · Draw'
    return 'Game over'
  }, [fen])

  // Movable colour follows whose turn it is — pass-and-play means BOTH
  // players use this same device, so we never lock to a fixed side.
  const movableColor = isGameOver ? null : turnColor

  const onUserMove = useCallback((from, to) => {
    if (isGameOver) return
    const c = chessRef.current
    const piece = c.get(from)
    // Auto-queen — the offline lane is meant to be a quick hot-seat game
    // and the parent /chess page already exposes the full promo picker.
    const promotion = piece && piece.type === 'p' && (to[1] === '8' || to[1] === '1') ? 'q' : undefined
    let move
    try { move = c.move({ from, to, promotion }) } catch { return }
    if (!move) return
    setFen(c.fen())
    setHistory(c.history())
    // Auto-rotate the board so the next player always sees their own
    // pieces facing them. User can disable this by hitting Flip manually.
    if (autoFlip) setOrientation(o => (o === 'white' ? 'black' : 'white'))
  }, [autoFlip, isGameOver])

  // Manual flip — also disables auto-flip so the user's chosen perspective
  // sticks for the rest of the game (until they reset).
  const manualFlip = () => {
    setOrientation(o => (o === 'white' ? 'black' : 'white'))
    setAutoFlip(false)
  }

  const copyPgn = async () => {
    const pgn = chessRef.current?.pgn() || ''
    if (!pgn) {
      setCopyStatus({ kind: 'error', text: 'No moves yet' })
      return
    }
    try {
      await navigator.clipboard.writeText(pgn)
      setCopyStatus({ kind: 'ok', text: 'PGN copied' })
    } catch {
      setCopyStatus({ kind: 'error', text: 'Clipboard unavailable' })
    }
  }

  return (
    <div className="luxe-card p-4 sm:p-5 border-amber-500/30">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">{variant.icon}</span>
          <div>
            <h3 className="text-base font-bold text-amber-200">{variant.name}</h3>
            <p className="text-[10px] uppercase tracking-wider text-gray-500">
              2-Player hot-seat · No engine · Fully offline
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button onClick={manualFlip}
            title={autoFlip ? 'Lock orientation (disables auto-flip)' : 'Flip board'}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-gray-800 hover:border-gray-600 text-gray-300 inline-flex items-center gap-1.5">
            <SwapOutlined /> Flip
          </button>
          <button onClick={copyPgn}
            disabled={history.length === 0}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5">
            <CopyOutlined /> Export PGN
          </button>
          <button onClick={reset}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 inline-flex items-center gap-1.5">
            <ReloadOutlined /> New game
          </button>
          <button onClick={onClose}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-gray-800 hover:border-gray-600 text-gray-300 inline-flex items-center gap-1.5">
            <CloseOutlined /> Close
          </button>
        </div>
      </div>

      <div className="mb-3 flex items-center gap-3 text-[11px] flex-wrap">
        <span className={`px-2 py-0.5 rounded font-mono ${
          turnColor === 'white' ? 'bg-gray-100 text-gray-900' : 'bg-gray-900 text-gray-100 border border-gray-700'
        }`}>
          {turnColor === 'white' ? 'White' : 'Black'} to move
        </span>
        <span className="text-gray-500">·</span>
        <span className="text-gray-400">
          Auto-flip{' '}
          <button
            type="button"
            onClick={() => setAutoFlip(a => !a)}
            className={`font-mono text-[11px] px-1.5 py-0.5 rounded border ${
              autoFlip
                ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                : 'border-gray-700 bg-gray-900/60 text-gray-400'
            }`}>
            {autoFlip ? 'ON' : 'OFF'}
          </button>
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-3 items-start">
        <div className="max-w-[520px] mx-auto w-full">
          {chessRef.current && (
            <ChessBoard
              key={boardKey}
              chess={chessRef.current}
              fen={fen}
              orientation={orientation}
              movableColor={movableColor}
              onMove={onUserMove}
              layoutKey={`offline-${boardKey}-${orientation}`}
            />
          )}
        </div>

        <div className="space-y-2 text-xs">
          <div className={`px-3 py-2 rounded-lg border font-mono ${
            isGameOver
              ? 'border-amber-400/40 bg-amber-500/10 text-amber-200'
              : 'border-gray-800 bg-gray-900/60 text-gray-300'
          }`}>
            {isGameOver ? gameOverReason : `${turnColor === 'white' ? 'White' : 'Black'}'s turn`}
          </div>
          {copyStatus && (
            <div className={`px-3 py-1.5 rounded-lg border font-mono text-[11px] ${
              copyStatus.kind === 'error'
                ? 'border-rose-400/40 bg-rose-500/10 text-rose-300'
                : 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300'
            }`}>
              {copyStatus.text}
            </div>
          )}
          <div className="luxe-card p-3 bg-black/30">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Hot-seat tips</p>
            <p className="text-[11px] text-gray-300 leading-relaxed">
              Pass the device between moves. Auto-flip rotates the board so
              the next player always sees their pieces facing them. Hit
              Export PGN at any time to save the game.
            </p>
          </div>
          {history.length > 0 && (
            <div className="luxe-card p-3 bg-black/30">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Moves · {history.length}</p>
              <p className="text-[11px] font-mono text-gray-200 break-words leading-relaxed max-h-32 overflow-y-auto">
                {history.join(' ')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
