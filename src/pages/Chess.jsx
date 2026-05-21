import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
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
import {
  chessBestMove, chessAnalyze, chessPlay, chessEngineStatus,
} from '../api/ai'

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
  // Chess.js instance — single source of truth for moves. Lives in a ref
  // so we don't recreate it on every React render.
  const chessRef = useRef(new Chess())
  const [fen, setFen] = useState(STARTING_FEN)
  const [history, setHistory] = useState([])
  const [evalHistory, setEvalHistory] = useState([])
  const [engineMode, setEngineMode] = useState('play')
  const [playerColor, setPlayerColor] = useState('white')
  const [engineElo, setEngineElo] = useState(1500)
  const [analyzeDepth, setAnalyzeDepth] = useState(14)
  const [variations, setVariations] = useState([])
  const [thinking, setThinking] = useState(false)
  const [status, setStatus] = useState({ kind: 'idle', text: 'Ready' })
  const [engineHealth, setEngineHealth] = useState(null)
  const [fenInput, setFenInput] = useState('')
  // Live engine telemetry — populated from every best-move / analyze
  // response. Drives the EnginePanel sidebar widget.
  const [telemetry, setTelemetry] = useState(null)
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

  // Engine health probe on mount — surfaces "binary not installed".
  useEffect(() => {
    chessEngineStatus().then(({ data }) => setEngineHealth(data))
  }, [])

  const turnColor = useMemo(
    () => chessRef.current.turn() === 'w' ? 'white' : 'black',
    [fen],
  )
  const isPlayerTurn = engineMode === 'human-vs-human' || turnColor === playerColor
  const movableColor = engineMode === 'human-vs-human'
    ? turnColor
    : (isPlayerTurn ? playerColor : null)

  // Called by ChessBoard when the user finishes a drag/drop legal move.
  const onUserMove = useCallback((from, to) => {
    const chess = chessRef.current
    try {
      const move = chess.move({ from, to, promotion: 'q' })
      if (!move) return
    } catch { return }
    setFen(chess.fen())
    setHistory(chess.history())
    setEvalHistory(prev => [...prev, { score: null, depth: 0 }])
  }, [])

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

  return (
    <div className="min-h-screen bg-[#0a0a0e] text-gray-100 pt-24 pb-16 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <Header engineHealth={engineHealth} />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
          {/* ── Board column ── */}
          <div className="space-y-3">
            <ModeBar
              engineMode={engineMode} setEngineMode={setEngineMode}
              playerColor={playerColor} setPlayerColor={setPlayerColor}
              engineElo={engineElo} setEngineElo={setEngineElo}
              analyzeDepth={analyzeDepth} setAnalyzeDepth={setAnalyzeDepth}
            />

            <div className="flex gap-3">
              <EvalBar score={evalLatest?.score} orientation={playerColor} />
              {/* Clocks column — only when a time control is active.
                  Active side ticks; flagged side flashes red. */}
              {timeControl.baseMs != null && (
                <div className="w-24">
                  <Clocks
                    white={whiteMs} black={blackMs}
                    activeSide={chessRef.current.isGameOver() || flagged ? null
                                : history.length === 0 ? null
                                : (chessRef.current.turn() === 'w' ? 'white' : 'black')}
                    orientation={playerColor}
                  />
                </div>
              )}
              <div className="flex-1 max-w-[640px]">
                <ChessBoard
                  chess={chessRef.current}
                  fen={fen}
                  orientation={playerColor}
                  movableColor={movableColor}
                  onMove={onUserMove}
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
            />

            <FenImport
              value={fenInput} setValue={setFenInput} onLoad={loadFen} currentFen={fen}
            />
          </div>

          {/* ── Sidebar ── */}
          <div className="space-y-3">
            <EnginePanel telemetry={telemetry} status={status} thinking={thinking} />
            {engineMode === 'analyze' && variations.length > 0 && (
              <Variations variations={variations} chess={chessRef.current} />
            )}
            <div className="luxe-card p-3">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Moves</p>
              <MoveList history={history} evalHistory={evalHistory} />
            </div>
            {evalHistory.some(e => e?.score) && (
              <div className="luxe-card p-3">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Eval over time</p>
                <EvalGraph history={evalHistory} />
              </div>
            )}
            <TimeControlPicker value={timeControl} onChange={setTimeControl} />
            <PieceSetPicker value={pieceSet} onChange={setPieceSet} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Header ──
function Header({ engineHealth }) {
  return (
    <header className="mb-6">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <h1 className="text-2xl sm:text-4xl font-bold bg-gradient-to-r from-amber-300 via-rose-400 to-fuchsia-400 bg-clip-text text-transparent">
          ♛ Chess
        </h1>
        <div className="flex items-center gap-2 text-[10px]">
          {engineHealth?.status === 'ok' ? (
            <span className="px-2 py-0.5 rounded-full border border-emerald-400/40 bg-emerald-500/10 text-emerald-300">
              Stockfish online
            </span>
          ) : engineHealth?.status === 'missing' ? (
            <span className="px-2 py-0.5 rounded-full border border-rose-400/40 bg-rose-500/10 text-rose-300">
              Stockfish not installed
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full border border-gray-700 bg-gray-900/60 text-gray-400">
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
        { id: 'play',            label: '🎯 Play vs engine' },
        { id: 'analyze',         label: '🔍 Analyze' },
        { id: 'human-vs-human',  label: '👥 Pass and play' },
      ].map(m => (
        <button key={m.id} onClick={() => setEngineMode(m.id)}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
            engineMode === m.id
              ? 'border-amber-400/60 bg-amber-500/15 text-amber-200'
              : 'border-gray-800 bg-gray-900/40 text-gray-400 hover:text-gray-200'
          }`}>
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
                className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${
                  playerColor === c.id
                    ? 'border-fuchsia-400/60 bg-fuchsia-500/15 text-fuchsia-200'
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
function StatusBar({ status, thinking, isGameOver, gameOverReason, onUndo, onFlip, onReset, onCopyPgn }) {
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
      <div className="flex items-center gap-1.5">
        <button onClick={onUndo}
          className="text-[11px] font-semibold px-2.5 py-1 rounded-full border border-gray-800 hover:border-gray-600 text-gray-300">
          ↶ Undo
        </button>
        <button onClick={onFlip}
          className="text-[11px] font-semibold px-2.5 py-1 rounded-full border border-gray-800 hover:border-gray-600 text-gray-300">
          ⇅ Flip
        </button>
        <button onClick={onReset}
          className="text-[11px] font-semibold px-2.5 py-1 rounded-full border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20">
          ⟲ New game
        </button>
        <button onClick={onCopyPgn}
          className="text-[11px] font-semibold px-2.5 py-1 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20">
          ⎘ Copy PGN
        </button>
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
