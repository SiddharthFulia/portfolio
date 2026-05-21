// /chess/m/:matchId — Live online challenge match page.
//
// Flow:
//   1. Creator lands here from /chess after clicking "🎯 Challenge".
//      Their whiteSession token is already in sessionStorage under
//      sid-chess-session-${matchId} (stashed by the Chess page before
//      navigating).
//   2. Creator copies the share link and sends it to a friend.
//   3. Friend opens the link; the page sees status==='waiting' and no
//      session in sessionStorage, so it shows the "Join as Black" CTA.
//      Clicking it POSTs /join, receives the blackSession, stashes it,
//      and starts playing.
//   4. Both tabs poll GET /matches/:id every 1.5s while waiting/active.
//      movableColor is set to the player's side ONLY when it's their
//      turn, so the FE blocks bogus moves before the BE has to.
//   5. Moves go out as UCI strings — chessground gives us from/to, we
//      concatenate; promotions append the piece char. The BE applies the
//      move against the canonical FEN, updates PGN/result, returns the
//      new public view; we sync state from that response (no optimistic
//      update — keeps the two tabs in lockstep).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Chess } from 'chess.js'
import 'chessground/assets/chessground.base.css'
import 'chessground/assets/chessground.brown.css'

import ChessBoard from '../components/chess/ChessBoard'
import usePieceSet from '../components/chess/usePieceSet'
import {
  chessGetMatch, chessJoinMatch, chessMatchMove, chessResignMatch,
} from '../api/ai'

const POLL_MS = 1500

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const sessionKey = (id) => `sid-chess-session-${id}`

function readSession(id) {
  try { return sessionStorage.getItem(sessionKey(id)) || '' } catch { return '' }
}
function writeSession(id, token) {
  try { sessionStorage.setItem(sessionKey(id), token || '') } catch {}
}

export default function ChessLive() {
  const { matchId } = useParams()
  const navigate = useNavigate()

  // chess.js mirror of the canonical BE state. We rebuild it from the
  // returned FEN after every poll/move so it always matches the server.
  const chessRef = useRef(new Chess())
  const [match, setMatch] = useState(null)         // public view from BE
  const [session, setSession] = useState(() => readSession(matchId))
  const [error, setError] = useState(null)
  const [joining, setJoining] = useState(false)
  const [copied, setCopied] = useState(false)
  // Promotion pending — chessground hands us (from,to); if it's a pawn
  // hitting the last rank we open the picker before POSTing the move.
  const [pendingPromotion, setPendingPromotion] = useState(null)
  // Piece set — read-only here (set by main Chess page); fall back to default.
  const pieceSet = (() => {
    try { return localStorage.getItem('sid-chess-pieces') || 'cburnett' } catch { return 'cburnett' }
  })()
  usePieceSet(pieceSet)

  useEffect(() => { document.title = `Chess Match · ${matchId}` }, [matchId])

  // Recover session token from sessionStorage if the user reloaded the page.
  useEffect(() => {
    if (!matchId) return
    const stored = readSession(matchId)
    if (stored && stored !== session) setSession(stored)
  }, [matchId, session])

  // Sync chess.js to whatever FEN the BE last returned.
  useEffect(() => {
    if (!match?.fen) return
    try {
      chessRef.current = new Chess(match.fen)
    } catch {
      // Should not happen — BE owns the FEN — but don't crash the page.
      chessRef.current = new Chess()
    }
  }, [match?.fen])

  // Pull match state once on mount + on every poll tick.
  const fetchState = useCallback(async () => {
    if (!matchId) return null
    const { data, error: err } = await chessGetMatch(matchId)
    if (err) {
      setError(err)
      return null
    }
    setError(null)
    setMatch(data)
    return data
  }, [matchId])

  // Initial load.
  useEffect(() => { fetchState() }, [fetchState])

  // Poll loop. Only runs while the match is waiting/active; once
  // completed there's nothing new to fetch so we stop hitting the BE.
  useEffect(() => {
    if (!match) return
    if (match.status !== 'waiting' && match.status !== 'active') return
    const id = setInterval(fetchState, POLL_MS)
    return () => clearInterval(id)
  }, [match?.status, fetchState])

  // Which side does this session control? null until we join (or if
  // session was lost / never set — e.g. someone else opening the link).
  const mySide = useMemo(() => {
    if (!match || !session) return null
    // The session tokens themselves are stripped from publicView, so we
    // can't directly compare — but we DID store the session right after
    // create/join, and only the creator/joiner have those tokens. So if
    // we have a session and the match is past 'waiting', we know we're
    // either white (creator) or black (joiner) based on which key path
    // wrote our session. Simplest signal: there's only ever one session
    // per side, so we track it by which name field was set.
    //
    // The creator's session was written before joinMatch ran (whiteName
    // is 'You'); the joiner's session is written by the join button on
    // this page. So infer from the order: if we joined on this page we
    // know we're black; otherwise we're white.
    // We persist that role separately to avoid ambiguity.
    try {
      const role = sessionStorage.getItem(`${sessionKey(matchId)}-role`)
      if (role === 'white' || role === 'black') return role
    } catch {}
    // Fallback heuristic for legacy tabs that don't have the role marker:
    // if blackSession was just created by us in this tab, the join handler
    // sets the role marker; otherwise default to white.
    return 'white'
  }, [match, session, matchId])

  const turnSide = match?.sideToMove === 'w' ? 'white' : match?.sideToMove === 'b' ? 'black' : null
  const isMyTurn = mySide && turnSide && mySide === turnSide && match?.status === 'active'
  const movableColor = isMyTurn ? mySide : null

  // ── Join as black ───────────────────────────────────────────────
  const onJoin = async () => {
    if (joining) return
    setJoining(true)
    const { data, error: err } = await chessJoinMatch(matchId, { blackName: 'Friend' })
    setJoining(false)
    if (err) {
      setError(err)
      return
    }
    const token = data?.blackSession
    if (token) {
      writeSession(matchId, token)
      try { sessionStorage.setItem(`${sessionKey(matchId)}-role`, 'black') } catch {}
      setSession(token)
    }
    fetchState()
  }

  // Tag this tab as white if we have a session but no role marker
  // (creator path — Chess page wrote the session but not the role).
  useEffect(() => {
    if (!matchId || !session) return
    try {
      const existing = sessionStorage.getItem(`${sessionKey(matchId)}-role`)
      if (!existing) sessionStorage.setItem(`${sessionKey(matchId)}-role`, 'white')
    } catch {}
  }, [matchId, session])

  // ── Move handling ───────────────────────────────────────────────
  const sendMove = useCallback(async (uci) => {
    if (!session || !matchId) return
    const { data, error: err } = await chessMatchMove(matchId, { session, uci })
    if (err) {
      setError(err)
      // Re-sync from BE — the optimistic chessground move may now be wrong.
      fetchState()
      return
    }
    setError(null)
    setMatch(data)
  }, [session, matchId, fetchState])

  const onUserMove = useCallback((from, to) => {
    const chess = chessRef.current
    const piece = chess.get(from)
    const toRank = to[1]
    const isPromotion = piece && piece.type === 'p' &&
      ((piece.color === 'w' && toRank === '8') || (piece.color === 'b' && toRank === '1'))
    if (isPromotion) {
      setPendingPromotion({ from, to, color: piece.color })
      return
    }
    sendMove(`${from}${to}`)
  }, [sendMove])

  const completePromotion = (pieceChar) => {
    const p = pendingPromotion
    if (!p) return
    sendMove(`${p.from}${p.to}${pieceChar}`)
    setPendingPromotion(null)
  }

  const onResign = async () => {
    if (!session) return
    if (!confirm('Resign this match? The other player will be awarded the win.')) return
    const { data, error: err } = await chessResignMatch(matchId, { session })
    if (err) {
      setError(err)
      return
    }
    setMatch(data)
  }

  // ── Share-link copy ──
  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/chess/m/${matchId}`
    : `/chess/m/${matchId}`
  const onCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard unavailable — surface as inline error so user can copy manually.
      setError('Clipboard unavailable — copy the URL from the address bar.')
    }
  }

  // ── New game ──
  const onNewGame = () => {
    // Clear our local session/role for this match so a stale token from
    // the completed game can't follow the user into the next one.
    try {
      sessionStorage.removeItem(sessionKey(matchId))
      sessionStorage.removeItem(`${sessionKey(matchId)}-role`)
    } catch {}
    navigate('/chess')
  }

  // ── Render ──
  if (!match && !error) {
    return (
      <div className="min-h-screen bg-[#0a0a0e] text-gray-100 pt-24 pb-16 px-4 flex items-center justify-center">
        <div className="text-sm text-gray-400">Loading match…</div>
      </div>
    )
  }

  if (error && !match) {
    return (
      <div className="min-h-screen bg-[#0a0a0e] text-gray-100 pt-24 pb-16 px-4 flex items-center justify-center">
        <div className="luxe-card p-6 max-w-md w-full text-center space-y-3">
          <h2 className="text-lg font-bold text-rose-300">Match unavailable</h2>
          <p className="text-xs text-gray-400 font-mono break-all">{error}</p>
          <button onClick={() => navigate('/chess')}
            className="text-xs font-semibold px-3 py-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20">
            ← Back to /chess
          </button>
        </div>
      </div>
    )
  }

  const status = match?.status
  const result = match?.result
  const isWaiting = status === 'waiting'
  const isActive  = status === 'active'
  const isDone    = status === 'completed'
  const fen = match?.fen || STARTING_FEN

  // We orient the board so the local player sees their pieces at the
  // bottom. If we haven't joined yet (spectator-as-potential-black), show
  // black perspective so the user understands the side they'll be on.
  const orientation = mySide === 'black' ? 'black'
                    : !session && isWaiting ? 'black'
                    : 'white'

  const whoIsWhite = mySide === 'white' ? 'You' : (match?.whiteName || 'Opponent')
  const whoIsBlack = mySide === 'black' ? 'You'
                    : (match?.blackName ? match.blackName : (isWaiting ? 'Waiting…' : 'Opponent'))

  const resultText = (() => {
    if (!isDone) return null
    if (result === '1-0') return 'White wins'
    if (result === '0-1') return 'Black wins'
    if (result === '1/2-1/2') return 'Draw'
    return 'Game over'
  })()

  const youWonText = (() => {
    if (!isDone || !mySide) return null
    if (result === '1-0' && mySide === 'white') return '🎉 You won!'
    if (result === '0-1' && mySide === 'black') return '🎉 You won!'
    if (result === '1/2-1/2') return '🤝 Drawn'
    if (result === '1-0' || result === '0-1') return 'You lost'
    return null
  })()

  return (
    <div className="min-h-screen bg-[#0a0a0e] text-gray-100 pt-24 pb-16 px-4 sm:px-6">
      {pendingPromotion && (
        <PromotionPicker
          color={pendingPromotion.color}
          pieceSet={pieceSet}
          onPick={completePromotion}
          onCancel={() => setPendingPromotion(null)}
        />
      )}
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Header */}
        <header className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-amber-300 via-rose-400 to-fuchsia-400 bg-clip-text text-transparent">
            ♛ Live match
          </h1>
          <div className="flex items-center gap-2 text-[10px]">
            <span className={`px-2 py-0.5 rounded-full border font-mono ${
              isDone ? 'border-amber-400/40 bg-amber-500/10 text-amber-300'
              : isActive ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300'
              : 'border-gray-700 bg-gray-900/60 text-gray-400'
            }`}>
              {isWaiting && 'Waiting for opponent'}
              {isActive && 'Match active'}
              {isDone && 'Completed'}
            </span>
            <span className="px-2 py-0.5 rounded-full border border-gray-700 bg-gray-900/60 text-gray-400 font-mono">
              #{matchId}
            </span>
          </div>
        </header>

        {/* Player strip */}
        <div className="luxe-card p-3 grid grid-cols-3 items-center gap-2">
          <PlayerTag side="white" name={whoIsWhite} isTurn={turnSide === 'white' && isActive} />
          <div className="text-center text-[11px] text-gray-500 font-mono">
            {isActive && (
              <span>{turnSide === 'white' ? '♙' : '♟'} {turnSide} to move</span>
            )}
            {isWaiting && <span className="text-amber-300">Share the link →</span>}
            {isDone && resultText && <span className="text-amber-300">{resultText}</span>}
          </div>
          <PlayerTag side="black" name={whoIsBlack} isTurn={turnSide === 'black' && isActive} align="right" />
        </div>

        {/* Share link bar — visible while waiting OR active (so creator
            can still send a friend the link if they lost it). */}
        {!isDone && (
          <div className="luxe-card p-3 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-gray-500 shrink-0">Share</span>
            <code className="flex-1 text-[11px] font-mono text-gray-300 truncate bg-black/30 px-2 py-1 rounded border border-gray-800">
              {shareUrl}
            </code>
            <button onClick={onCopyLink}
              className="text-[11px] font-semibold px-2.5 py-1 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 shrink-0">
              {copied ? '✓ Copied' : '⎘ Copy'}
            </button>
          </div>
        )}

        {/* Join CTA — only when waiting and we don't already have a session */}
        {isWaiting && !session && (
          <div className="luxe-card p-4 flex items-center justify-between gap-3 flex-wrap border border-fuchsia-500/30 bg-fuchsia-500/5">
            <div>
              <p className="text-sm font-semibold text-fuchsia-200">Someone challenged you to a chess game.</p>
              <p className="text-xs text-gray-400 mt-0.5">You'll be playing as Black.</p>
            </div>
            <button onClick={onJoin} disabled={joining}
              className="text-xs font-semibold px-4 py-2 rounded-full border border-fuchsia-500/60 bg-fuchsia-500/15 text-fuchsia-200 hover:bg-fuchsia-500/25 disabled:opacity-50">
              {joining ? 'Joining…' : '⚔️ Join as Black'}
            </button>
          </div>
        )}

        {/* Error pill (non-fatal — match still rendered) */}
        {error && match && (
          <div className="text-xs text-rose-300 font-mono px-3 py-2 rounded-lg border border-rose-500/30 bg-rose-500/10">
            {error}
          </div>
        )}

        {/* Board */}
        <div className="luxe-card p-3">
          <div className="max-w-[640px] mx-auto">
            <ChessBoard
              chess={chessRef.current}
              fen={fen}
              orientation={orientation}
              movableColor={movableColor}
              onMove={onUserMove}
              layoutKey={`live-${match?.moveCount || 0}-${status}`}
            />
          </div>
        </div>

        {/* Action row */}
        <div className="luxe-card p-3 flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[11px] text-gray-500 font-mono">
            {match?.moveCount || 0} {match?.moveCount === 1 ? 'move' : 'moves'} played
          </span>
          <div className="flex items-center gap-1.5">
            {isActive && session && (
              <button onClick={onResign}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-full border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20">
                🏳️ Resign
              </button>
            )}
            {isDone && (
              <>
                {youWonText && (
                  <span className="text-xs font-semibold text-amber-300 mr-2">{youWonText}</span>
                )}
                <button onClick={onNewGame}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20">
                  🔄 New game
                </button>
              </>
            )}
          </div>
        </div>

        {/* PGN preview — handy for sharing the move list */}
        {match?.pgn && (
          <div className="luxe-card p-3">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Moves</p>
            <p className="text-xs font-mono text-gray-300 whitespace-pre-wrap break-words">{match.pgn}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function PlayerTag({ side, name, isTurn, align = 'left' }) {
  return (
    <div className={`flex items-center gap-2 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
      <span className={`inline-block w-2.5 h-2.5 rounded-full ${
        side === 'white' ? 'bg-gray-200' : 'bg-gray-900 border border-gray-500'
      } ${isTurn ? 'ring-2 ring-emerald-400/70' : ''}`} />
      <span className={`text-xs font-semibold ${isTurn ? 'text-emerald-200' : 'text-gray-300'}`}>
        {name}
      </span>
    </div>
  )
}

// Lightweight promotion picker — mirrors the one on the main /chess page
// but lives standalone here so the live page doesn't depend on internals
// of that file. Click any piece to apply; click backdrop or × to cancel.
function PromotionPicker({ color, pieceSet, onPick, onCancel }) {
  const choices = [
    { piece: 'q', label: 'Queen'  },
    { piece: 'r', label: 'Rook'   },
    { piece: 'b', label: 'Bishop' },
    { piece: 'n', label: 'Knight' },
  ]
  const colorLetter = color === 'w' ? 'w' : 'b'
  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onCancel}>
      <div onClick={e => e.stopPropagation()}
        className="luxe-card p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold bg-gradient-to-r from-amber-300 to-fuchsia-400 bg-clip-text text-transparent">
            Promote pawn
          </h3>
          <button onClick={onCancel}
            className="text-xs text-gray-500 hover:text-gray-200 px-2 py-1 rounded border border-gray-800 hover:border-gray-600">
            ✕ Cancel
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-4">Pick what your pawn becomes.</p>
        <div className="grid grid-cols-4 gap-2">
          {choices.map(c => (
            <button key={c.piece}
              onClick={() => onPick(c.piece)}
              className="group aspect-square rounded-xl bg-gray-900/60 border-2 border-gray-800 hover:border-amber-400 hover:bg-amber-500/10 transition-all flex flex-col items-center justify-center p-1">
              <img
                src={`/piece/${pieceSet}/${colorLetter}${c.piece.toUpperCase()}.svg`}
                alt={c.label}
                className="w-full h-full max-w-[88px] max-h-[88px] object-contain transition-transform group-hover:scale-110"
              />
              <span className="text-[10px] uppercase tracking-wider text-gray-500 group-hover:text-amber-300 mt-1">
                {c.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
