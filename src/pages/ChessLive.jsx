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
import { Modal } from 'antd'
import {
  ReloadOutlined, ArrowLeftOutlined, LinkOutlined, ThunderboltOutlined,
  FlagOutlined, CopyOutlined, CheckOutlined, CloseOutlined,
  RollbackOutlined,
} from '@ant-design/icons'
import 'chessground/assets/chessground.base.css'
import 'chessground/assets/chessground.brown.css'

import ChessBoard from '../components/chess/ChessBoard'
import Clocks from '../components/chess/Clocks'
import usePieceSet from '../components/chess/usePieceSet'
import {
  chessGetMatch, chessJoinMatch, chessMatchMove, chessResignMatch,
  chessMatchTakebackRequest, chessMatchTakebackAccept, chessMatchTakebackDecline,
} from '../api/ai'

const POLL_MS = 1500
// Auto-retry config for /chess/m/:matchId when the match isn't there yet.
// 30 retries × 1500ms ≈ 45s — covers a link shared moments before the
// creator finishes hitting "Challenge".
const NOTFOUND_RETRY_MS  = 1500
const NOTFOUND_RETRY_MAX = 30

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
  // Share modal — bigger touch-target than the inline copy bar.
  const [shareOpen, setShareOpen] = useState(false)
  // 404 auto-retry tracking. Counts attempts and either backs off (gives
  // up after MAX) or starts polling once the match shows up.
  const [notFoundAttempts, setNotFoundAttempts] = useState(0)
  const [givenUp, setGivenUp] = useState(false)
  // Local clock interpolation — BE values are the anchor, FE just ticks
  // down by elapsed-since-poll between fetches.
  const [whiteMsLocal, setWhiteMsLocal] = useState(null)
  const [blackMsLocal, setBlackMsLocal] = useState(null)
  // Anchor timestamp — when the BE values were last received.
  const clockAnchorRef = useRef({ ts: 0, white: null, black: null, side: null })
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

  // Pull match state once on mount + on every poll tick. The BE uses
  // ?session=… to bump our lastSeenAt so the auto-abort timer (60s of
  // silence from both sides) doesn't kill a match we're actively viewing.
  const fetchState = useCallback(async () => {
    if (!matchId) return null
    const { data, error: err } = await chessGetMatch(matchId, session)
    if (err) {
      // 404 "match not found" — increment attempts; the retry effect
      // below handles scheduling the next try. Don't surface 404 as a
      // fatal error until we've exhausted retries.
      const isNotFound = /not found/i.test(err)
      if (isNotFound) {
        setNotFoundAttempts(n => n + 1)
      } else {
        setError(err)
      }
      return null
    }
    setError(null)
    setNotFoundAttempts(0)
    setGivenUp(false)
    setMatch(data)
    // Anchor the clock to whatever the BE just returned.
    if (data) {
      clockAnchorRef.current = {
        ts: Date.now(),
        white: data.whiteMs ?? data.baseMs ?? null,
        black: data.blackMs ?? data.baseMs ?? null,
        side: data.sideToMove === 'w' ? 'white' : 'black',
      }
      setWhiteMsLocal(data.whiteMs ?? data.baseMs ?? null)
      setBlackMsLocal(data.blackMs ?? data.baseMs ?? null)
    }
    return data
  }, [matchId, session])

  // Initial load.
  useEffect(() => { fetchState() }, [fetchState])

  // 404 auto-retry. If the FIRST fetch (or any subsequent re-fetch
  // while we don't have match data) came back "match not found", retry
  // every 1500ms — up to NOTFOUND_RETRY_MAX — so a share link opened
  // moments before the creator finishes hitting "Challenge" still works.
  // Stops cleanly the instant the match shows up or we give up.
  useEffect(() => {
    if (match) return
    if (notFoundAttempts === 0) return
    if (notFoundAttempts >= NOTFOUND_RETRY_MAX) {
      setGivenUp(true)
      return
    }
    const id = setTimeout(fetchState, NOTFOUND_RETRY_MS)
    return () => clearTimeout(id)
  }, [match, notFoundAttempts, fetchState])

  // Poll loop. Only runs while the match is waiting/active; once
  // completed there's nothing new to fetch so we stop hitting the BE.
  useEffect(() => {
    if (!match) return
    if (match.status !== 'waiting' && match.status !== 'active') return
    const id = setInterval(fetchState, POLL_MS)
    return () => clearInterval(id)
  }, [match?.status, fetchState])

  // Game-over auto-redirect — once the match is completed/aborted the
  // page is just a result screen. We hold the user here for a short
  // grace period so they can see the outcome + maybe copy the PGN, then
  // bounce them back to /chess. They can hit "🔄 New game" sooner to
  // skip the countdown.
  const [endCountdown, setEndCountdown] = useState(null)
  useEffect(() => {
    const s = match?.status
    if (s !== 'completed' && s !== 'aborted') {
      setEndCountdown(null)
      return
    }
    setEndCountdown(15)
    const id = setInterval(() => {
      setEndCountdown(prev => {
        if (prev == null) return prev
        if (prev <= 1) {
          clearInterval(id)
          // Clear our session for this match before bouncing so a stale
          // token can't follow us into the next game.
          try {
            sessionStorage.removeItem(sessionKey(matchId))
            sessionStorage.removeItem(`${sessionKey(matchId)}-role`)
          } catch {}
          navigate('/chess')
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [match?.status, matchId, navigate])

  // Local clock interpolation — decrement the active side's clock
  // between polls so the timer counts down visibly. BE values are
  // re-anchored on every successful fetch/move.
  useEffect(() => {
    if (!match?.baseMs) return
    if (match.status !== 'active') return
    const tick = () => {
      const anchor = clockAnchorRef.current
      if (!anchor || !anchor.side) return
      const elapsed = Date.now() - anchor.ts
      if (anchor.side === 'white') {
        const next = Math.max(0, (anchor.white ?? 0) - elapsed)
        setWhiteMsLocal(next)
      } else {
        const next = Math.max(0, (anchor.black ?? 0) - elapsed)
        setBlackMsLocal(next)
      }
    }
    const id = setInterval(tick, 100)
    return () => clearInterval(id)
  }, [match?.status, match?.baseMs, match?.sideToMove])

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

  const doResign = useCallback(async () => {
    const { data, error: err } = await chessResignMatch(matchId, { session })
    if (err) {
      setError(err)
      return
    }
    setMatch(data)
  }, [matchId, session])

  const onResign = useCallback(() => {
    if (!session) return
    Modal.confirm({
      title: 'Resign this match?',
      content: 'The other player will be awarded the win. This cannot be undone.',
      okText: 'Resign',
      cancelText: 'Cancel',
      okType: 'danger',
      okButtonProps: { danger: true },
      autoFocusButton: 'cancel',
      centered: true,
      onOk: doResign,
    })
  }, [session, doResign])

  // ── Takeback flow ───────────────────────────────────────────────
  // Mirrors the request → opponent-approval pattern from over-the-board
  // play. The requester hits "Takeback", which posts to the BE; the
  // polling FE on the opponent's tab sees match.takebackRequest with a
  // requestedBy that's not their side, and shows the approval modal.
  // Unlimited per match — no counter, no cap.
  const [takebackBusy, setTakebackBusy] = useState(false)
  // Tracks the requestedAt timestamp of the request WE just sent, so we
  // can show "Takeback requested…" on our own button until the polling
  // round-trip confirms the BE has stored it (or the opponent
  // accepts/declines and it disappears).
  const takebackReq = match?.takebackRequest || null
  const iAmRequester = !!(takebackReq && mySide && takebackReq.requestedBy === mySide)
  const opponentIsRequester = !!(takebackReq && mySide && takebackReq.requestedBy !== mySide)

  const onRequestTakeback = useCallback(async () => {
    if (!session || takebackBusy) return
    setTakebackBusy(true)
    const { data, error: err } = await chessMatchTakebackRequest(matchId, { session })
    setTakebackBusy(false)
    if (err) {
      setError(err)
      return
    }
    setMatch(data)
  }, [session, matchId, takebackBusy])

  const onAcceptTakeback = useCallback(async () => {
    if (!session || takebackBusy) return
    setTakebackBusy(true)
    const { data, error: err } = await chessMatchTakebackAccept(matchId, { session })
    setTakebackBusy(false)
    if (err) {
      setError(err)
      return
    }
    setMatch(data)
  }, [session, matchId, takebackBusy])

  const onDeclineTakeback = useCallback(async () => {
    if (!session || takebackBusy) return
    setTakebackBusy(true)
    const { data, error: err } = await chessMatchTakebackDecline(matchId, { session })
    setTakebackBusy(false)
    if (err) {
      setError(err)
      return
    }
    setMatch(data)
  }, [session, matchId, takebackBusy])

  // The requester can also cancel their own pending request by
  // declining — keep the surface simple: one button toggles between
  // "Takeback" and "Cancel request".
  const onCancelOwnTakeback = onDeclineTakeback

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
  // No match yet, but we're still trying (or first fetch hasn't come back).
  if (!match && !error && !givenUp) {
    return (
      <div className="min-h-screen bg-[#0a0a0e] text-gray-100 pt-24 sm:pt-32 pb-16 px-4 flex items-center justify-center">
        <div className="luxe-card p-6 max-w-md w-full text-center space-y-2">
          <div className="text-sm text-gray-300">
            {notFoundAttempts > 0 ? 'Waiting for match to start…' : 'Loading match…'}
          </div>
          {notFoundAttempts > 0 && (
            <p className="text-[11px] text-gray-500 font-mono">
              The link is valid — retrying ({notFoundAttempts}/{NOTFOUND_RETRY_MAX}).
            </p>
          )}
        </div>
      </div>
    )
  }

  // Gave up after MAX retries — the wording matters: user asked for the
  // refresh-to-try-again copy explicitly.
  if (!match && givenUp) {
    return (
      <div className="min-h-screen bg-[#0a0a0e] text-gray-100 pt-24 sm:pt-32 pb-16 px-4 flex items-center justify-center">
        <div className="luxe-card p-6 max-w-md w-full text-center space-y-3">
          <h2 className="text-lg font-bold text-rose-300">Match not found</h2>
          <p className="text-xs text-gray-400">Refresh to try again.</p>
          <div className="flex items-center justify-center gap-2">
            <button onClick={() => { setNotFoundAttempts(0); setGivenUp(false); fetchState() }}
              className="text-xs font-semibold px-4 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 inline-flex items-center gap-1.5">
              <ReloadOutlined /> Try again
            </button>
            <button onClick={() => navigate('/chess')}
              className="text-xs font-semibold px-4 py-2 rounded-lg border border-gray-700 bg-gray-900/60 text-gray-300 hover:border-gray-500 inline-flex items-center gap-1.5">
              <ArrowLeftOutlined /> Back to /chess
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (error && !match) {
    return (
      <div className="min-h-screen bg-[#0a0a0e] text-gray-100 pt-24 sm:pt-32 pb-16 px-4 flex items-center justify-center">
        <div className="luxe-card p-6 max-w-md w-full text-center space-y-3">
          <h2 className="text-lg font-bold text-rose-300">Match unavailable</h2>
          <p className="text-xs text-gray-400 font-mono break-all">{error}</p>
          <button onClick={() => navigate('/chess')}
            className="text-xs font-semibold px-4 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 inline-flex items-center gap-1.5">
            <ArrowLeftOutlined /> Back to /chess
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
  const isAborted = status === 'aborted'
  const isOver    = isDone || isAborted
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
    if (isAborted) return 'Aborted'
    if (!isDone) return null
    if (result === '1-0') return 'White wins'
    if (result === '0-1') return 'Black wins'
    if (result === '1/2-1/2') return 'Draw'
    return 'Game over'
  })()

  const youWonText = (() => {
    if (!isDone || !mySide) return null
    if (result === '1-0' && mySide === 'white') return 'You won!'
    if (result === '0-1' && mySide === 'black') return 'You won!'
    if (result === '1/2-1/2') return 'Drawn'
    if (result === '1-0' || result === '0-1') return 'You lost'
    return null
  })()

  return (
    <div className="min-h-screen bg-[#0a0a0e] text-gray-100 pt-24 sm:pt-32 pb-16 px-4 sm:px-6">
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
          <div>
            <div className="eyebrow-mono mb-1">// Live online challenge</div>
            <h1 className="text-2xl sm:text-3xl font-bold gradient-text-amber">
              ♛ Live match
            </h1>
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            <span className={`px-2 py-0.5 rounded-lg border font-mono ${
              isDone ? 'border-amber-400/40 bg-amber-500/10 text-amber-300'
              : isActive ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300'
              : 'border-gray-700 bg-gray-900/60 text-gray-400'
            }`}>
              {isWaiting && 'Waiting for opponent'}
              {isActive && 'Match active'}
              {isDone && 'Completed'}
              {isAborted && 'Aborted — both players left'}
            </span>
            <span className="px-2 py-0.5 rounded-lg border border-gray-700 bg-gray-900/60 text-gray-400 font-mono">
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
            {isOver && resultText && <span className="text-amber-300">{resultText}</span>}
          </div>
          <PlayerTag side="black" name={whoIsBlack} isTurn={turnSide === 'black' && isActive} align="right" />
        </div>

        {/* Share button — opens a modal (touch-friendly, easier to read
            the full URL on phones than a one-line truncated bar). */}
        {!isOver && (
          <div className="luxe-card p-3 flex items-center gap-2 justify-between">
            <span className="text-[11px] text-gray-400">Share this link so a friend can join.</span>
            <button onClick={() => setShareOpen(true)}
              className="text-xs font-semibold px-4 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 shrink-0 inline-flex items-center gap-1.5">
              <LinkOutlined /> Share link
            </button>
          </div>
        )}

        {/* Join CTA — only when waiting and we don't already have a session */}
        {isWaiting && !session && (
          <div className="luxe-card p-4 flex items-center justify-between gap-3 flex-wrap border border-amber-500/30 bg-amber-500/5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-200">Someone challenged you to a chess game.</p>
              <p className="text-xs text-gray-400 mt-0.5">You'll be playing as Black.</p>
            </div>
            <button onClick={onJoin} disabled={joining}
              className="text-sm font-semibold px-5 py-3 rounded-lg border border-amber-500/60 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 disabled:opacity-50 shrink-0 inline-flex items-center gap-1.5">
              <ThunderboltOutlined /> {joining ? 'Joining…' : 'Join as Black'}
            </button>
          </div>
        )}

        {/* Error pill (non-fatal — match still rendered) */}
        {error && match && (
          <div className="text-xs text-rose-300 font-mono px-3 py-2 rounded-lg border border-rose-500/30 bg-rose-500/10">
            {error}
          </div>
        )}

        {/* Takeback approval panel — only the opponent of the requester
            sees this. The board stays interactive in case they'd rather
            ignore it (declining is one click; moving also clears it on
            the BE). Unlimited per match — no counter shown. */}
        {opponentIsRequester && isActive && session && (
          <div className="luxe-card p-4 border border-amber-400/40 bg-amber-500/5 flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-200 inline-flex items-center gap-1.5">
                <RollbackOutlined /> Opponent requests a takeback
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Revert {Math.max(1, (takebackReq?.requestedAtPly ?? 0) - (takebackReq?.plyToRevertTo ?? 0))} move(s) — back to ply {takebackReq?.plyToRevertTo ?? 0}.
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={onAcceptTakeback} disabled={takebackBusy}
                className="text-xs font-semibold px-3 py-2 rounded-lg border border-emerald-500/50 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50 inline-flex items-center gap-1.5">
                <CheckOutlined /> Accept
              </button>
              <button onClick={onDeclineTakeback} disabled={takebackBusy}
                className="text-xs font-semibold px-3 py-2 rounded-lg border border-gray-700 bg-gray-900/60 text-gray-300 hover:border-gray-500 disabled:opacity-50 inline-flex items-center gap-1.5">
                <CloseOutlined /> Decline
              </button>
            </div>
          </div>
        )}

        {/* Clocks — only when a time control is configured on the match.
            Tickdown is interpolated locally; BE values are re-anchored on
            every poll / move response. */}
        {match?.baseMs ? (
          <div className="luxe-card p-3">
            <div className="max-w-[640px] mx-auto">
              <Clocks
                white={whiteMsLocal} black={blackMsLocal}
                activeSide={isActive ? turnSide : null}
                orientation={orientation}
              />
            </div>
          </div>
        ) : null}

        {/* Board */}
        <div className="luxe-card p-2 sm:p-3">
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
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Takeback — only meaningful once at least one move is on
                the board and it's an active game we belong to. Hidden
                while the opponent has an outstanding request (the
                inline approval panel below replaces it). */}
            {isActive && session && (match?.moveCount || 0) >= 1 && !opponentIsRequester && (
              iAmRequester ? (
                <button onClick={onCancelOwnTakeback} disabled={takebackBusy}
                  className="text-xs font-semibold px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 disabled:opacity-50 inline-flex items-center gap-1.5">
                  <RollbackOutlined /> Takeback requested · cancel
                </button>
              ) : (
                <button onClick={onRequestTakeback} disabled={takebackBusy}
                  className="text-xs font-semibold px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 disabled:opacity-50 inline-flex items-center gap-1.5">
                  <RollbackOutlined /> {takebackBusy ? 'Requesting…' : 'Takeback'}
                </button>
              )
            )}
            {isActive && session && (
              <button onClick={onResign}
                className="text-xs font-semibold px-3 py-2 rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 inline-flex items-center gap-1.5">
                <FlagOutlined /> Resign
              </button>
            )}
            {isOver && (
              <>
                {isAborted && (
                  <span className="text-xs font-semibold text-gray-400 mr-2">Match aborted</span>
                )}
                {!isAborted && youWonText && (
                  <span className="text-xs font-semibold text-amber-300 mr-2">{youWonText}</span>
                )}
                {endCountdown != null && (
                  <span className="text-[11px] font-mono text-gray-500 mr-1">
                    Closing in {endCountdown}s…
                  </span>
                )}
                <button onClick={onNewGame}
                  className="text-xs font-semibold px-3 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 inline-flex items-center gap-1.5">
                  <ReloadOutlined /> New game
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

      {/* Share modal — uses antd so the URL wraps + copy button is large
          enough to tap comfortably on phones. */}
      <Modal
        open={shareOpen}
        onCancel={() => setShareOpen(false)}
        footer={null}
        title="Share this match"
      >
        <div className="space-y-3 py-2">
          <p className="text-xs text-gray-500">
            Send this link to whoever you want to play. The first person to open it joins as Black.
          </p>
          <code className="block text-xs font-mono text-gray-700 break-all bg-gray-100 px-3 py-2 rounded border border-gray-200">
            {shareUrl}
          </code>
          <button onClick={onCopyLink}
            className="w-full text-sm font-semibold px-4 py-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 inline-flex items-center justify-center gap-1.5">
            {copied ? <><CheckOutlined /> Copied to clipboard</> : <><CopyOutlined /> Copy link</>}
          </button>
        </div>
      </Modal>
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
          <h3 className="text-base font-bold text-amber-300">
            Promote pawn
          </h3>
          <button onClick={onCancel}
            className="text-xs text-gray-500 hover:text-gray-200 px-2 py-1 rounded border border-gray-800 hover:border-gray-600 inline-flex items-center gap-1">
            <CloseOutlined /> Cancel
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-4">Pick what your pawn becomes.</p>
        <div className="grid grid-cols-4 gap-2">
          {choices.map(c => (
            <button key={c.piece}
              onClick={() => onPick(c.piece)}
              className="group aspect-square rounded-lg bg-gray-900/60 border-2 border-gray-800 hover:border-amber-400 hover:bg-amber-500/10 transition-colors flex flex-col items-center justify-center p-1">
              <img
                src={`/piece/${pieceSet}/${colorLetter}${c.piece.toUpperCase()}.svg`}
                alt={c.label}
                className="w-full h-full max-w-[88px] max-h-[88px] object-contain"
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
