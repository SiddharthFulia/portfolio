import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal, Input } from 'antd'
import {
  ArrowLeftOutlined, FullscreenOutlined, UndoOutlined, SwapOutlined,
  EyeOutlined, EyeInvisibleOutlined, ReloadOutlined, CopyOutlined,
  SaveOutlined, SendOutlined, CloseOutlined, BookOutlined,
  AimOutlined, SearchOutlined, TeamOutlined,
} from '@ant-design/icons'
import { Chess } from 'chess.js'
import 'chessground/assets/chessground.base.css'
import 'chessground/assets/chessground.brown.css'
// cburnett.css NOT imported — usePieceSet injects piece CSS dynamically
// from /public/piece/{set}/{file}.svg so users can switch themes.

import ChessBoard       from '../components/chess/ChessBoard'
import EvalBar          from '../components/chess/EvalBar'
import EvalGraph        from '../components/chess/EvalGraph'
import MoveList         from '../components/chess/MoveList'
import Variations       from '../components/chess/Variations'
import EnginePanel      from '../components/chess/EnginePanel'
import PieceSetPicker   from '../components/chess/PieceSetPicker'
import usePieceSet      from '../components/chess/usePieceSet'
import Clocks           from '../components/chess/Clocks'
import TimeControlPicker, { TIME_CONTROLS } from '../components/chess/TimeControl'
import SavedGames       from '../components/chess/SavedGames'
import PgnDatabaseLoader from '../components/chess/PgnDatabase'
import LiveGamesLobby   from '../components/chess/LiveGamesLobby'
import OpeningExplorer  from '../components/chess/OpeningExplorer'
import {
  chessBestMove, chessAnalyze, chessPlay, chessEngineStatus,
  chessSaveGame, chessLoadGame, chessCreateMatch,
} from '../api/ai'
import useQueryState from '../hooks/useQueryState'

// /chess — Stockfish-backed analysis board. chess.js owns the move state,
// chessground (Lichess's board) renders, BE Stockfish provides engine
// moves + analysis. Sub-components live in components/chess/*.

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const fmtScore = (s) => {
  if (!s) return '—'
  if (s.type === 'mate') return `M${Math.abs(s.value)}${s.value > 0 ? '' : '⁻'}`
  return `${s.value >= 0 ? '+' : ''}${(s.value / 100).toFixed(2)}`
}

export default function ChessPage() {
  const navigate = useNavigate()
  // Chess.js instance — single source of truth for moves. Lives in a ref
  // so we don't recreate it on every React render.
  const chessRef = useRef(new Chess())
  const [fen, setFen] = useState(STARTING_FEN)
  const [history, setHistory] = useState([])
  const [evalHistory, setEvalHistory] = useState([])
  // ?mode= mirrors the engine mode chip; ?elo= mirrors the strength slider.
  // Defaults stay out of the URL so /chess keeps a clean landing path.
  const [engineMode, setEngineMode] = useQueryState('mode', 'play', {
    allowed: ['play', 'analyze', 'human-vs-human'],
  })
  const [playerColor, setPlayerColor] = useState('white')
  const [engineElo, setEngineElo] = useQueryState('elo', 1500, {
    parse: (s) => parseInt(s, 10),
  })
  const [analyzeDepth, setAnalyzeDepth] = useState(14)
  const [variations, setVariations] = useState([])
  const [thinking, setThinking] = useState(false)
  const [status, setStatus] = useState({ kind: 'idle', text: 'Ready' })
  const [engineHealth, setEngineHealth] = useState(null)
  const [fenInput, setFenInput] = useState('')
  // Live engine telemetry — populated from every best-move / analyze
  // response. Drives the EnginePanel sidebar widget.
  const [telemetry, setTelemetry] = useState(null)
  // Saved-games refresh trigger — bump after save/delete to re-fetch list.
  const [savedRefresh, setSavedRefresh] = useState(0)
  // Library modal — keeps the sidebar clean. A small button opens this
  // and the user can browse / load / rename / delete saved games here.
  const [libraryOpen, setLibraryOpen] = useState(false)
  // PGN paste — paste any PGN to import a game (like FEN, but full move list).
  const [pgnInput, setPgnInput] = useState('')
  // Pending promotion — set when the user drags a pawn to the last rank.
  // We hold the move until the user picks the piece in the modal so we
  // never auto-queen for them.
  const [pendingPromotion, setPendingPromotion] = useState(null)
  // Save-game modal — replaces the browser prompt() with a real form.
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  // Fullscreen board-only mode. Hides header + sidebar + nav so the
  // board can grow to the viewport. Back button restores normal layout.
  const [fullscreen, setFullscreen] = useState(false)
  // Piece set — persists across reloads via localStorage.
  const [pieceSet, setPieceSet] = useState(() => {
    try { return localStorage.getItem('sid-chess-pieces') || 'cburnett' } catch { return 'cburnett' }
  })
  useEffect(() => {
    try { localStorage.setItem('sid-chess-pieces', pieceSet) } catch {}
  }, [pieceSet])
  // Inject the active set's CSS into <head>. Hot-swappable at runtime.
  usePieceSet(pieceSet)
  // Clock state. timeControl is the picked preset (null = no clock).
  // whiteMs / blackMs are the remaining millis; null when no clock.
  const [timeControl, setTimeControl] = useState(TIME_CONTROLS[0])
  const [whiteMs, setWhiteMs] = useState(null)
  const [blackMs, setBlackMs] = useState(null)
  const [flagged, setFlagged] = useState(null)   // 'white' | 'black' on flag fall
  // Eval visibility toggle — peeking at Stockfish's score while you're
  // actively playing (vs engine OR pass-and-play with a friend) is
  // basically cheating, so we default OFF in play/HvH and ON in analyze.
  // Toggle stays in the same session but re-applies the mode default
  // whenever the user switches modes — that's the expected behavior.
  const [showEval, setShowEval] = useState(false)
  // Layout key — bumped on any change that resizes the board container.
  // MUST come after timeControl/fullscreen declarations or we hit TDZ
  // and the page crashes with 'Cannot access timeControl before initialization'.
  const layoutKey = useMemo(
    () => `${fullscreen ? 'fs' : 'win'}-${timeControl.id}`,
    [fullscreen, timeControl.id],
  )
  // ESC key exits fullscreen, mirroring browser fullscreen behavior.
  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e) => { if (e.key === 'Escape') setFullscreen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  // Tick the active side's clock once per 100ms. Pause when game-over,
  // not started (no clock), or paused (no activeSide).
  useEffect(() => {
    if (!timeControl.baseMs) return    // 'none' control — clocks disabled
    if (chessRef.current.isGameOver() || flagged) return
    if (history.length === 0) return    // game hasn't started yet
    const tickActive = chessRef.current.turn() === 'w' ? 'white' : 'black'
    const setter = tickActive === 'white' ? setWhiteMs : setBlackMs
    let last = performance.now()
    const id = setInterval(() => {
      const now = performance.now()
      const delta = now - last
      last = now
      setter(prev => {
        if (prev == null) return prev
        const next = prev - delta
        if (next <= 0) {
          setFlagged(tickActive)
          setStatus({ kind: 'error', text: `${tickActive[0].toUpperCase() + tickActive.slice(1)} flagged on time` })
          return 0
        }
        return next
      })
    }, 100)
    return () => clearInterval(id)
  }, [history.length, timeControl, flagged, fen])

  // When the user picks a new time control, reset both clocks.
  useEffect(() => {
    if (timeControl.baseMs == null) {
      setWhiteMs(null); setBlackMs(null); setFlagged(null)
    } else {
      setWhiteMs(timeControl.baseMs)
      setBlackMs(timeControl.baseMs)
      setFlagged(null)
    }
  }, [timeControl])

  // After every completed move (history grows), add the Fischer increment
  // to the side that just moved. The new turn's side starts ticking via
  // the effect above.
  useEffect(() => {
    if (!timeControl.baseMs || timeControl.incMs <= 0) return
    if (history.length === 0) return
    // history.length is even AFTER black moves → previous mover was black.
    const justMoved = history.length % 2 === 0 ? 'black' : 'white'
    const adder = justMoved === 'white' ? setWhiteMs : setBlackMs
    adder(prev => (prev == null ? prev : prev + timeControl.incMs))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.length])

  useEffect(() => { document.title = 'Chess · Sid' }, [])

  // Re-apply the eval-visibility default whenever the mode changes —
  // entering analyze auto-shows, returning to play/HvH auto-hides. User
  // can still override via the eyeball toggle after any change.
  useEffect(() => {
    setShowEval(engineMode === 'analyze')
  }, [engineMode])

  // Engine health probe on mount — surfaces "binary not installed".
  useEffect(() => {
    chessEngineStatus().then(({ data }) => setEngineHealth(data))
  }, [])

  const turnColor = useMemo(
    () => chessRef.current.turn() === 'w' ? 'white' : 'black',
    [fen],
  )
  // In analyze + pass-and-play, the user drives BOTH sides — movableColor
  // follows whoever's turn it is. In play-vs-engine, lock to the player's
  // chosen colour so they can't move for the engine.
  const bothSidesMovable = engineMode === 'human-vs-human' || engineMode === 'analyze'
  const isPlayerTurn = bothSidesMovable || turnColor === playerColor
  const movableColor = bothSidesMovable ? turnColor : (isPlayerTurn ? playerColor : null)

  // Called by ChessBoard when the user finishes a drag/drop legal move.
  // Detect promotions BEFORE applying the move so we can show the piece
  // picker — chess.js needs the promotion piece in the move args, so
  // we hold the move pending the user's choice.
  const onUserMove = useCallback((from, to) => {
    const chess = chessRef.current
    const piece = chess.get(from)
    // Promotion = pawn moving onto the last rank for its colour.
    const toRank = to[1]
    const isPromotion = piece && piece.type === 'p' &&
      ((piece.color === 'w' && toRank === '8') || (piece.color === 'b' && toRank === '1'))
    if (isPromotion) {
      setPendingPromotion({ from, to, color: piece.color })
      return
    }
    try {
      const move = chess.move({ from, to })
      if (!move) return
    } catch { return }
    setFen(chess.fen())
    setHistory(chess.history())
    setEvalHistory(prev => [...prev, { score: null, depth: 0 }])
  }, [])

  // User picked a promotion piece from the modal — apply the held move.
  const completePromotion = useCallback((pieceChar) => {
    const p = pendingPromotion
    if (!p) return
    const chess = chessRef.current
    try {
      chess.move({ from: p.from, to: p.to, promotion: pieceChar })
    } catch {
      setPendingPromotion(null)
      return
    }
    setFen(chess.fen())
    setHistory(chess.history())
    setEvalHistory(prev => [...prev, { score: null, depth: 0 }])
    setPendingPromotion(null)
  }, [pendingPromotion])

  const cancelPromotion = () => {
    // Restore the board view to current chess.js state — chessground may
    // have already animated the pawn forward; re-set fen pushes it back.
    setPendingPromotion(null)
    setFen(chessRef.current.fen())
  }

  // Engine plays its turn (mode = 'play' + engine's colour).
  useEffect(() => {
    if (engineMode !== 'play' || isPlayerTurn) return
    if (chessRef.current.isGameOver()) return
    let cancelled = false
    setThinking(true)
    setStatus({ kind: 'thinking', text: `Engine thinking · ELO ${engineElo}` })
    chessPlay({ fen, elo: engineElo, thinkMs: 600 }).then(({ data, error: err }) => {
      if (cancelled) return
      setThinking(false)
      if (err || !data?.bestmove) {
        setStatus({ kind: 'error', text: err || 'Engine returned no move' })
        return
      }
      if (data) setTelemetry(data)
      const uci = data.bestmove
      const move = chessRef.current.move({
        from: uci.slice(0, 2),
        to:   uci.slice(2, 4),
        promotion: uci.length === 5 ? uci[4] : undefined,
      })
      if (!move) return
      setFen(chessRef.current.fen())
      setHistory(chessRef.current.history())
      setEvalHistory(prev => [...prev, { score: null, depth: 0 }])
      setStatus({ kind: 'idle', text: 'Your turn' })
    })
    return () => { cancelled = true }
  }, [fen, isPlayerTurn, engineMode, engineElo])

  // Auto-analyze in 'analyze' mode (debounced 250ms).
  useEffect(() => {
    if (engineMode !== 'analyze') return
    let cancelled = false
    const timer = setTimeout(() => {
      setStatus({ kind: 'analyzing', text: `Analyzing · depth ${analyzeDepth}` })
      chessAnalyze({ fen, multiPv: 3, depth: analyzeDepth, thinkMs: 700 })
        .then(({ data, error: err }) => {
          if (cancelled) return
          if (err) { setStatus({ kind: 'error', text: err }); return }
          setVariations(data?.variations || [])
          if (data) setTelemetry(data)
          const topScore = data?.variations?.[0]?.score || null
          setEvalHistory(prev => {
            if (!prev.length) return prev
            const next = [...prev]
            next[next.length - 1] = { score: topScore, depth: analyzeDepth }
            return next
          })
          setStatus({ kind: 'idle', text: `Depth ${analyzeDepth} · ${fmtScore(topScore)}` })
        })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [fen, engineMode, analyzeDepth])

  // ── Controls ──
  const resetBoard = () => {
    chessRef.current = new Chess()
    setFen(chessRef.current.fen())
    setHistory([]); setEvalHistory([]); setVariations([])
    setStatus({ kind: 'idle', text: 'Ready' })
  }
  const undoMove = () => {
    const chess = chessRef.current
    if (!chess.undo()) return
    if (engineMode === 'play' && !chess.isGameOver()) chess.undo()
    setFen(chess.fen())
    setHistory(chess.history())
    setEvalHistory(prev => prev.slice(0, chess.history().length))
  }
  const flipBoard = () => {
    setPlayerColor(playerColor === 'white' ? 'black' : 'white')
  }
  const loadFen = () => {
    const trimmed = fenInput.trim()
    if (!trimmed) return
    try {
      chessRef.current = new Chess(trimmed)
      setFen(chessRef.current.fen())
      setHistory(chessRef.current.history())
      setEvalHistory([]); setVariations([])
      setFenInput('')
    } catch (err) {
      setStatus({ kind: 'error', text: `Invalid FEN: ${err.message}` })
    }
  }
  const copyPgn = async () => {
    try {
      await navigator.clipboard.writeText(chessRef.current.pgn())
      setStatus({ kind: 'idle', text: 'PGN copied to clipboard' })
    } catch {
      setStatus({ kind: 'error', text: 'Clipboard unavailable' })
    }
  }

  // "🎯 Challenge a friend" — creates a fresh online match on the BE,
  // stashes the creator's session token (so this tab can post moves as
  // White), and navigates to the live match page. The opponent joins
  // by opening the same share URL and clicking 'Join as Black'.
  const onChallenge = async () => {
    setStatus({ kind: 'thinking', text: 'Creating match…' })
    const { data, error: err } = await chessCreateMatch({ whiteName: 'You' })
    if (err || !data?.matchId) {
      setStatus({ kind: 'error', text: err || 'Could not create match' })
      return
    }
    try {
      sessionStorage.setItem(`sid-chess-session-${data.matchId}`, data.whiteSession || '')
    } catch {}
    navigate(`/chess/m/${data.matchId}`)
  }

  // Open the Save-game modal pre-filled with a sensible default name.
  // Actual API call happens in confirmSaveGame() once user confirms.
  const openSaveModal = () => {
    setSaveName(`${engineMode === 'play' ? `vs Stockfish ${engineElo}`
                  : engineMode === 'analyze' ? 'Analysis'
                  : 'Pass-and-play'} · ${new Date().toLocaleDateString()}`)
    setSaveModalOpen(true)
  }
  const confirmSaveGame = async () => {
    const chess = chessRef.current
    const name = saveName.trim()
    if (!name) return
    const result = chess.isCheckmate()
      ? (chess.turn() === 'w' ? '0-1' : '1-0')
      : chess.isDraw() ? '1/2-1/2' : '*'
    const { error: err } = await chessSaveGame({
      name,
      pgn: chess.pgn(),
      fen: chess.fen(),
      side: engineMode === 'play' ? playerColor : null,
      mode: engineMode,
      engineName: engineMode === 'play' ? 'Stockfish' : null,
      engineType: engineMode === 'play' ? 'stockfish' : null,
      engineStrength: engineMode === 'play' ? engineElo : null,
      timeControl: timeControl?.id || 'none',
      result,
      moveCount: chess.history().length,
    })
    setSaveModalOpen(false)
    if (err) setStatus({ kind: 'error', text: `Save failed: ${err}` })
    else { setStatus({ kind: 'idle', text: `Saved as "${name}"` }); setSavedRefresh(k => k + 1) }
  }

  const loadSavedGame = async (row) => {
    const chess = new Chess()
    try {
      chess.loadPgn(row.pgn || '')
    } catch (err) {
      setStatus({ kind: 'error', text: `Couldn't load: ${err.message}` })
      return
    }
    chessRef.current = chess
    setFen(chess.fen())
    setHistory(chess.history())
    setEvalHistory([]); setVariations([])
    setStatus({ kind: 'idle', text: `Loaded "${row.name}"` })
    setLibraryOpen(false)
  }
  // Apply a PGN string to the board. Used by both the textarea paste
  // ('Load PGN' button) and the file-upload picker. Decoupled from
  // pgnInput state so callers can hand us a string directly.
  const applyPgn = (raw) => {
    const trimmed = String(raw || '').trim()
    if (!trimmed) return
    const chess = new Chess()
    try { chess.loadPgn(trimmed) }
    catch (err) {
      setStatus({ kind: 'error', text: `Invalid PGN: ${err.message}` })
      return
    }
    chessRef.current = chess
    setFen(chess.fen())
    setHistory(chess.history())
    setEvalHistory([]); setVariations([])
    setStatus({ kind: 'idle', text: `Loaded ${chess.history().length}-ply PGN` })
  }
  const loadPgn = () => {
    applyPgn(pgnInput)
    setPgnInput('')
  }

  const isGameOver = chessRef.current.isGameOver()
  const gameOverReason = (() => {
    const c = chessRef.current
    if (!c.isGameOver()) return null
    if (c.isCheckmate()) return `Checkmate · ${c.turn() === 'w' ? 'Black' : 'White'} wins`
    if (c.isStalemate()) return 'Stalemate'
    if (c.isInsufficientMaterial()) return 'Draw — insufficient material'
    if (c.isThreefoldRepetition()) return 'Draw — threefold repetition'
    if (c.isDraw()) return 'Draw — 50-move rule'
    return 'Game over'
  })()

  const evalLatest = evalHistory[evalHistory.length - 1]

  // ── Fullscreen render: just the board + eval bar + clocks + back button.
  // No sidebar, no header. Footer is hidden via ConditionalFooter at the
  // App level (it already hides on '/'). We use position:fixed inset:0 so
  // the entire viewport becomes the board.
  // Promotion picker — overlay rendered on top of the board (works both
  // in normal layout AND fullscreen via z-50).
  const promotionPicker = pendingPromotion && (
    <PromotionPicker
      color={pendingPromotion.color}
      pieceSet={pieceSet}
      onPick={completePromotion}
      onCancel={cancelPromotion}
    />
  )

  if (fullscreen) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0e] z-50 flex items-center justify-center p-3 sm:p-6">
        {promotionPicker}
        {/* Back button — top-left corner, always visible */}
        <button onClick={() => setFullscreen(false)}
          className="absolute top-4 left-4 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                     bg-gray-900/80 backdrop-blur border border-gray-700 hover:border-amber-400/60
                     text-gray-200 hover:text-amber-200 text-xs font-semibold transition-colors">
          <ArrowLeftOutlined /> Back
        </button>
        {/* Status pill — fullscreen has no status bar, surface the basics */}
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2 text-[11px]">
          <span className={`px-2 py-0.5 rounded-lg border font-mono ${
            status.kind === 'error' ? 'border-rose-400/40 bg-rose-500/10 text-rose-300'
            : (thinking || status.kind === 'thinking' || status.kind === 'analyzing') ? 'border-cyan-400/40 bg-cyan-500/10 text-cyan-300'
            : 'border-gray-700 bg-gray-900/60 text-gray-400'
          }`}>
            {(thinking || status.kind === 'thinking' || status.kind === 'analyzing') && <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse mr-1.5 align-middle" />}
            {status.text}{isGameOver && ` · ${gameOverReason}`}
          </span>
        </div>
        {/* Board + side rails. max-h ensures it scales to viewport height
            even on tall windows; aspect-square inside keeps it a square. */}
        <div className="flex gap-3 items-center w-full justify-center" style={{ height: 'min(100%, calc(100vh - 60px))' }}>
          {showEval && <EvalBar score={evalLatest?.score} orientation={playerColor} />}
          {timeControl.baseMs != null && (
            <div className="w-24 sm:w-28">
              <Clocks
                white={whiteMs} black={blackMs}
                activeSide={chessRef.current.isGameOver() || flagged ? null
                            : history.length === 0 ? null
                            : (chessRef.current.turn() === 'w' ? 'white' : 'black')}
                orientation={playerColor}
              />
            </div>
          )}
          <div style={{ width: 'min(calc(100vh - 60px), 100%)', maxWidth: '100%' }}>
            <ChessBoard
              chess={chessRef.current}
              fen={fen}
              orientation={playerColor}
              movableColor={movableColor}
              onMove={onUserMove}
              layoutKey={layoutKey}
              candidateMoves={engineMode === 'analyze'
                ? variations.slice(0, 3).map(v => v.pv?.[0]).filter(Boolean)
                : []}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0e] text-gray-100 pt-24 sm:pt-32 pb-16 px-3 sm:px-6">
      {promotionPicker}
      <div className="max-w-6xl mx-auto">
        <Header engineHealth={engineHealth} onFullscreen={() => setFullscreen(true)} />

        {/* Live lobby — collapsible. One-shot fetch on mount. */}
        <div className="mb-5">
          <LiveGamesLobby defaultOpen={false} />
        </div>

        <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[1fr_320px]">
          {/* ── Board column ── */}
          <div className="space-y-3">
            <ModeBar
              engineMode={engineMode} setEngineMode={setEngineMode}
              playerColor={playerColor} setPlayerColor={setPlayerColor}
              engineElo={engineElo} setEngineElo={setEngineElo}
              analyzeDepth={analyzeDepth} setAnalyzeDepth={setAnalyzeDepth}
            />

            <div className="flex gap-2 sm:gap-3 touch-manipulation">
              {/* EvalBar — hidden on mobile to save horizontal space.
                  Also gated by the showEval toggle (off by default in
                  play / human-vs-human so peeking at Stockfish's eval
                  isn't a way to cheat against yourself or a friend). */}
              {showEval && (
                <div className="hidden sm:block">
                  <EvalBar score={evalLatest?.score} orientation={playerColor} />
                </div>
              )}
              {/* Clocks column — only when a time control is active.
                  Active side ticks; flagged side flashes red. */}
              {timeControl.baseMs != null && (
                <div className="w-20 sm:w-24 shrink-0">
                  <Clocks
                    white={whiteMs} black={blackMs}
                    activeSide={chessRef.current.isGameOver() || flagged ? null
                                : history.length === 0 ? null
                                : (chessRef.current.turn() === 'w' ? 'white' : 'black')}
                    orientation={playerColor}
                  />
                </div>
              )}
              <div className="flex-1 min-w-0 max-w-[min(640px,calc(100vw-32px))] mx-auto">
                <ChessBoard
                  chess={chessRef.current}
                  fen={fen}
                  orientation={playerColor}
                  movableColor={movableColor}
                  onMove={onUserMove}
                  layoutKey={layoutKey}
                  // Top-3 candidate arrows — only in analyze mode so they
                  // don't spoil play-vs-engine. Each variation's first
                  // UCI move is the arrow's orig→dest.
                  candidateMoves={engineMode === 'analyze'
                    ? variations.slice(0, 3).map(v => v.pv?.[0]).filter(Boolean)
                    : []}
                />
              </div>
            </div>

            <StatusBar
              status={status} thinking={thinking}
              isGameOver={isGameOver} gameOverReason={gameOverReason}
              onUndo={undoMove} onFlip={flipBoard}
              onReset={resetBoard} onCopyPgn={copyPgn}
              onSave={openSaveModal}
              onChallenge={onChallenge}
              showEval={showEval}
              onToggleEval={() => setShowEval(v => !v)}
            />

            <FenImport
              value={fenInput} setValue={setFenInput} onLoad={loadFen} currentFen={fen}
            />
            <PgnImport
              value={pgnInput} setValue={setPgnInput} onLoad={loadPgn}
            />
            {/* Multi-game files open a picker; single-game files load
                straight away. Either way the chosen PGN is passed to
                applyPgn (decoupled from the textarea's pgnInput state). */}
            <PgnDatabaseLoader onLoad={applyPgn} />
          </div>

          {/* ── Sidebar ── On mobile this stacks below the board as a
              single flex-column; on lg it becomes the 320px right rail. */}
          <div className="flex flex-col gap-3">
            <EnginePanel telemetry={telemetry} status={status} thinking={thinking} />
            {engineMode === 'analyze' && variations.length > 0 && (
              <div className="hidden md:block">
                <Variations variations={variations} chess={chessRef.current} />
              </div>
            )}
            <div className="luxe-card p-3">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Moves</p>
              <MoveList history={history} evalHistory={evalHistory} />
            </div>
            {showEval && evalHistory.some(e => e?.score) && (
              <div className="luxe-card p-3 hidden md:block">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Eval over time</p>
                <EvalGraph history={evalHistory} />
              </div>
            )}
            <TimeControlPicker value={timeControl} onChange={setTimeControl} />
            <PieceSetPicker value={pieceSet} onChange={setPieceSet} />
            {/* Library button — opens the full saved-games library in a
                modal. Was inline in the sidebar but that ate vertical
                space and the user wanted it tucked behind a small button. */}
            <button onClick={() => setLibraryOpen(true)}
              className="w-full text-left luxe-card p-3 min-h-[40px] hover:border-amber-500/40 transition-colors flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-500">Saved games</p>
                <p className="text-xs text-gray-200 mt-0.5">Browse your library</p>
              </div>
              <BookOutlined className="text-base text-amber-300" />
            </button>
          </div>
        </div>

        {/* ECO opening database — collapsed by default. Browses the
            full lichess-org/chess-openings dataset (~3.7k entries) via
            paginated BE endpoints + on-click detail + Lichess masters. */}
        <OpeningExplorer defaultOpen={false} />
      </div>

      {/* Save-game modal — replaces window.prompt with antd input */}
      <Modal
        open={saveModalOpen}
        onCancel={() => setSaveModalOpen(false)}
        onOk={confirmSaveGame}
        title="Save game"
        okText="Save"
        okButtonProps={{ disabled: !saveName.trim() }}
        cancelText="Cancel"
      >
        <div className="space-y-3 py-2">
          <p className="text-xs text-gray-400">
            Give this game a name. {history.length} ply, {chessRef.current.isGameOver() ? 'finished' : 'in progress'}.
          </p>
          <Input
            size="large"
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            onPressEnter={confirmSaveGame}
            placeholder="e.g. Najdorf vs Stockfish 1500"
            maxLength={80}
            autoFocus
          />
        </div>
      </Modal>

      {/* Library modal — full SavedGames panel tucked behind a button */}
      <Modal
        open={libraryOpen}
        onCancel={() => setLibraryOpen(false)}
        footer={null}
        title="Saved games"
        width={520}
      >
        <SavedGames refreshKey={savedRefresh} onLoad={loadSavedGame} />
      </Modal>
    </div>
  )
}

// ── Header ──
function Header({ engineHealth, onFullscreen }) {
  return (
    <header className="mb-6">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <div>
          <div className="eyebrow-mono mb-1">// Stockfish analysis board</div>
          <h1 className="text-2xl sm:text-3xl font-bold gradient-text-amber">
            ♛ Chess
          </h1>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <button onClick={onFullscreen}
            title="Fullscreen board (ESC to exit)"
            className="px-2 py-1 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 font-semibold inline-flex items-center gap-1">
            <FullscreenOutlined /> Fullscreen
          </button>
          {engineHealth?.status === 'ok' ? (
            <span className="px-2 py-0.5 rounded-lg border border-emerald-400/40 bg-emerald-500/10 text-emerald-300">
              Stockfish online
            </span>
          ) : engineHealth?.status === 'missing' ? (
            <span className="px-2 py-0.5 rounded-lg border border-rose-400/40 bg-rose-500/10 text-rose-300">
              Stockfish not installed
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-lg border border-gray-700 bg-gray-900/60 text-gray-400">
              Engine status…
            </span>
          )}
        </div>
      </div>
      <p className="text-sm text-gray-400 max-w-2xl">
        Stockfish on the server, chessground board on the client. Play vs the engine,
        analyze any position, or import a FEN / export a PGN.
      </p>
    </header>
  )
}

// ── Mode + colour + slider bar ──
function ModeBar({ engineMode, setEngineMode, playerColor, setPlayerColor, engineElo, setEngineElo, analyzeDepth, setAnalyzeDepth }) {
  return (
    <div className="luxe-card p-3 flex items-center gap-2 flex-wrap">
      {[
        { id: 'play',            label: 'Play vs engine', icon: <AimOutlined /> },
        { id: 'analyze',         label: 'Analyze',        icon: <SearchOutlined /> },
        { id: 'human-vs-human',  label: 'Pass and play',  icon: <TeamOutlined /> },
      ].map(m => (
        <button key={m.id} onClick={() => setEngineMode(m.id)}
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors inline-flex items-center gap-1.5 ${
            engineMode === m.id
              ? 'border-amber-400/60 bg-amber-500/15 text-amber-200'
              : 'border-gray-800 bg-gray-900/40 text-gray-400 hover:text-gray-200'
          }`}>
          {m.icon}
          {m.label}
        </button>
      ))}
      {engineMode === 'play' && (
        <>
          <span className="text-[10px] text-gray-600 mx-1">·</span>
          <span className="text-[10px] text-gray-400">You:</span>
          <div className="flex items-center gap-1">
            {[{ id: 'white', label: 'White' }, { id: 'black', label: 'Black' }].map(c => (
              <button key={c.id} onClick={() => setPlayerColor(c.id)}
                className={`text-[10px] font-semibold px-2 py-1 rounded-lg border ${
                  playerColor === c.id
                    ? 'border-amber-400/60 bg-amber-500/15 text-amber-200'
                    : 'border-gray-800 bg-gray-900/40 text-gray-400'
                }`}>{c.label}</button>
            ))}
          </div>
          <span className="text-[10px] text-gray-600 mx-1">·</span>
          <label className="text-[10px] text-gray-400 flex items-center gap-1.5">
            Engine ELO
            <input type="range" min="1320" max="3190" step="50" value={engineElo}
              onChange={e => setEngineElo(parseInt(e.target.value, 10))}
              className="w-24 accent-amber-400" />
            <span className="text-amber-300 font-mono text-[11px] w-10 text-right">{engineElo}</span>
          </label>
        </>
      )}
      {engineMode === 'analyze' && (
        <>
          <span className="text-[10px] text-gray-600 mx-1">·</span>
          <label className="text-[10px] text-gray-400 flex items-center gap-1.5">
            Depth
            <input type="range" min="6" max="22" step="1" value={analyzeDepth}
              onChange={e => setAnalyzeDepth(parseInt(e.target.value, 10))}
              className="w-24 accent-cyan-400" />
            <span className="text-cyan-300 font-mono text-[11px] w-6 text-right">{analyzeDepth}</span>
          </label>
        </>
      )}
    </div>
  )
}

// ── Status + action buttons row ──
function StatusBar({ status, thinking, isGameOver, gameOverReason, onUndo, onFlip, onReset, onCopyPgn, onSave, onChallenge, showEval, onToggleEval }) {
  return (
    <div className="luxe-card p-3 flex items-center justify-between gap-2 flex-wrap">
      <span className={`text-xs font-mono ${
        status.kind === 'error' ? 'text-rose-300'
        : status.kind === 'thinking' || status.kind === 'analyzing' ? 'text-cyan-300'
        : 'text-gray-300'
      }`}>
        {thinking && <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-pulse mr-2" />}
        {status.text}
        {isGameOver && ` · ${gameOverReason}`}
      </span>
      {/* Action buttons — wrap to a second row on mobile so they don't
          cram into a single line on narrow screens. Each button has a
          40×40 minimum tap target on mobile per Apple HIG / Material. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button onClick={onUndo}
          className="text-[11px] font-semibold px-3 py-2 sm:px-2.5 sm:py-1 min-h-[40px] sm:min-h-0 rounded-lg border border-gray-800 hover:border-gray-600 text-gray-300 inline-flex items-center gap-1.5">
          <UndoOutlined /> Undo
        </button>
        <button onClick={onFlip}
          className="text-[11px] font-semibold px-3 py-2 sm:px-2.5 sm:py-1 min-h-[40px] sm:min-h-0 rounded-lg border border-gray-800 hover:border-gray-600 text-gray-300 inline-flex items-center gap-1.5">
          <SwapOutlined /> Flip
        </button>
        {/* Eval visibility toggle — off during play / human-vs-human so
            Stockfish's score doesn't give away the answer; user can
            still peek with one click. Auto-syncs to the mode default
            (analyze=on, play/HvH=off) on mode change. */}
        <button onClick={onToggleEval}
          title={showEval ? 'Hide engine eval' : 'Show engine eval'}
          className={`text-[11px] font-semibold px-3 py-2 sm:px-2.5 sm:py-1 min-h-[40px] sm:min-h-0 rounded-lg border transition-colors inline-flex items-center gap-1.5 ${
            showEval
              ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20'
              : 'border-gray-800 hover:border-gray-600 text-gray-400'
          }`}>
          {showEval ? <EyeOutlined /> : <EyeInvisibleOutlined />} Eval
        </button>
        <button onClick={onReset}
          className="text-[11px] font-semibold px-3 py-2 sm:px-2.5 sm:py-1 min-h-[40px] sm:min-h-0 rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 inline-flex items-center gap-1.5">
          <ReloadOutlined /> New game
        </button>
        <button onClick={onCopyPgn}
          className="text-[11px] font-semibold px-3 py-2 sm:px-2.5 sm:py-1 min-h-[40px] sm:min-h-0 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 inline-flex items-center gap-1.5">
          <CopyOutlined /> Copy PGN
        </button>
        <button onClick={onSave}
          className="text-[11px] font-semibold px-3 py-2 sm:px-2.5 sm:py-1 min-h-[40px] sm:min-h-0 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 inline-flex items-center gap-1.5">
          <SaveOutlined /> Save game
        </button>
        {onChallenge && (
          <button onClick={onChallenge}
            className="text-[11px] font-semibold px-3 py-2 sm:px-2.5 sm:py-1 min-h-[40px] sm:min-h-0 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 inline-flex items-center gap-1.5">
            <SendOutlined /> Challenge
          </button>
        )}
      </div>
    </div>
  )
}

// ── Promotion picker ──
// Centred modal with the 4 promotion pieces (Q R B N) rendered as SVGs
// from the user's active piece set, so the picker matches the board look.
// Click any piece to apply; click backdrop or × to cancel.
function PromotionPicker({ color, pieceSet, onPick, onCancel }) {
  // chess.js uses lowercase piece chars for moves.
  const choices = [
    { piece: 'q', label: 'Queen'  },
    { piece: 'r', label: 'Rook'   },
    { piece: 'b', label: 'Bishop' },
    { piece: 'n', label: 'Knight' },
  ]
  // Filename letter for the SVG (cburnett etc. use uppercase role letters).
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

// ── FEN import box ──
function FenImport({ value, setValue, onLoad, currentFen }) {
  return (
    <div className="luxe-card p-3 space-y-2">
      <label className="text-[10px] uppercase tracking-wider text-gray-500 block">Import FEN</label>
      <div className="flex gap-2">
        <input value={value} onChange={e => setValue(e.target.value)}
          placeholder="rnbqkbnr/... w KQkq - 0 1"
          className="flex-1 bg-black/40 border border-gray-800 rounded-lg px-3 py-1.5 text-xs font-mono text-gray-200 focus:outline-none focus:border-amber-500/60" />
        <button onClick={onLoad}
          disabled={!value.trim()}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 disabled:opacity-40 disabled:cursor-not-allowed">
          Load
        </button>
      </div>
      <p className="text-[10px] text-gray-500 font-mono truncate">Current: {currentFen}</p>
    </div>
  )
}

// ── PGN import box ──
// Same shape as FEN import but textarea-sized for full game move lists.
// PGN export already lives behind the 'Copy PGN' button on the status bar.
function PgnImport({ value, setValue, onLoad }) {
  return (
    <div className="luxe-card p-3 space-y-2">
      <label className="text-[10px] uppercase tracking-wider text-gray-500 block">Import PGN</label>
      <textarea value={value} onChange={e => setValue(e.target.value)}
        placeholder={'1. e4 e5 2. Nf3 Nc6 3. Bb5 ...'}
        rows={3}
        className="w-full bg-black/40 border border-gray-800 rounded-lg px-3 py-1.5 text-xs font-mono text-gray-200 focus:outline-none focus:border-amber-500/60 resize-y" />
      <button onClick={onLoad}
        disabled={!value.trim()}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 disabled:opacity-40 disabled:cursor-not-allowed">
        Load PGN
      </button>
    </div>
  )
}
