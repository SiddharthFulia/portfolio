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
import VariantsRulesCard from '../components/chess/VariantsHub'
import PuzzleTrainer    from '../components/chess/PuzzleTrainer'
import {
  chessBestMove, chessAnalyze, chessPlay, chessEngineStatus,
  chessSaveGame, chessLoadGame, chessCreateMatch,
  chessIdentifyOpening, chessGetOpening,
} from '../api/ai'
import useQueryState from '../hooks/useQueryState'
import { buildVariantGame, ENGINE_SUPPORTED_MODES } from '../lib/variantGame'
import { generate960Fen } from '../lib/chess960'
import { getBestMove as localBestMove, skillLevelFromElo } from '../lib/stockfishLocal'

// Mode catalogue — drives the chip row near the page heading. `engine`
// flags whether Stockfish can play this variant (KoTH / 3-Check play under
// standard rules; atomic / antichess etc. need a variant-aware engine we
// don't ship). Offline mode is a pure pass-and-play standard board.
const MODES = [
  { id: 'standard',    label: 'Standard',     icon: '♛', engine: true,  rules: 'chess.js' },
  { id: 'chess960',    label: '960',          icon: '🎲', engine: true,  rules: 'chess.js' },
  { id: 'koth',        label: 'KoTH',         icon: '⛰️', engine: true,  rules: 'chessops' },
  { id: 'threeCheck',  label: '3-Check',      icon: '✓✓✓', engine: true,  rules: 'chessops' },
  { id: 'atomic',      label: 'Atomic',       icon: '💥', engine: false, rules: 'chessops' },
  { id: 'antichess',   label: 'Antichess',    icon: '🪞', engine: false, rules: 'chessops' },
  { id: 'horde',       label: 'Horde',        icon: '🛡️', engine: false, rules: 'chessops' },
  { id: 'crazyhouse',  label: 'Crazyhouse',   icon: '♛↺', engine: false, rules: 'chessops' },
  { id: 'racingKings', label: 'Racing Kings', icon: '🏁', engine: false, rules: 'chessops' },
  { id: 'offline',     label: 'Offline 2P',   icon: '🪑', engine: false, rules: 'chess.js' },
]
// 960 uses chessops (chess.js v1 can't parse X-FEN castling like "AHah").
const USES_CHESSJS = new Set(['standard', 'offline'])

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
  // Chess.js instance — single source of truth for moves IN STANDARD MODES.
  // Lives in a ref so we don't recreate it on every React render. For
  // non-standard variants we swap to a chessops-backed adapter held in
  // variantGameRef so the same ChessBoard component renders any rules.
  const chessRef = useRef(new Chess())
  const variantGameRef = useRef(null)
  // Top-level tab — drives the page sections. Variants are NOT a tab; they
  // live inside Play as a mode chip row, so the user never leaves the board.
  const [topTab, setTopTab] = useQueryState('tab', 'play', {
    allowed: ['play', 'puzzles', 'online', 'saved'],
  })
  // Mode chip — variant rules + starting position. Default Standard.
  const [mode, setMode] = useQueryState('variant', 'standard', {
    allowed: MODES.map(m => m.id),
  })
  // Bump this to force ChessBoard to rebuild after a mode swap / new 960
  // shuffle / reset — chessground caches piece positions, we want a fresh
  // mount when the underlying rules engine flips.
  const [boardKey, setBoardKey] = useState(0)
  // Chosen game object for THIS render. For chess.js modes (standard / 960 /
  // offline) it's chessRef.current. For chessops modes it's whatever we
  // built into variantGameRef.current on the last mode-change effect.
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

  // ── Mode swap — rebuild the active game whenever the user picks a
  // different variant. Uses chess.js for standard/960/offline, chessops
  // for everything else. Resets history + clears engine telemetry so the
  // sidebar doesn't show stale evals from the previous mode.
  const modeMeta = useMemo(() => MODES.find(m => m.id === mode) || MODES[0], [mode])
  const usesChessjs = USES_CHESSJS.has(mode)
  // Variants that DON'T have engine support are forced to pass-and-play.
  // Standard/960/KoTH/3-Check can run the engine for play/analyze.
  const engineSupported = ENGINE_SUPPORTED_MODES.has(mode)
  // Some modes are inherently pass-and-play only:
  //   • offline (by design — user picked the 2-player lane)
  //   • all variants where chessops rules differ from Stockfish's standard
  //     rules (atomic / antichess / horde / crazyhouse / racingKings)
  const forcedPassAndPlay = mode === 'offline' || !engineSupported

  // Build the active game from scratch when mode changes. Standard mode
  // hands the existing chess.js instance back; other modes spin up a fresh
  // chessops-backed adapter (or a fresh chess.js for 960 / offline). We do
  // NOT carry FEN across modes — switching variants means a brand new game.
  useEffect(() => {
    if (mode === 'standard') {
      chessRef.current = new Chess()
      variantGameRef.current = null
      setFen(chessRef.current.fen())
    } else if (mode === 'chess960') {
      const f = generate960Fen()
      const g = buildVariantGame('chess960', f)
      chessRef.current = null
      variantGameRef.current = g
      setFen(g ? g.fen() : f)
    } else if (mode === 'offline') {
      chessRef.current = new Chess()
      variantGameRef.current = null
      setFen(chessRef.current.fen())
    } else {
      // chessops-backed variant.
      const g = buildVariantGame(mode)
      variantGameRef.current = g
      setFen(g.fen())
    }
    setHistory([]); setEvalHistory([]); setVariations([])
    setTelemetry(null)
    setStatus({ kind: 'idle', text: 'Ready' })
    setBoardKey(k => k + 1)
    // When entering a forced pass-and-play mode, swap engineMode to HvH so
    // the engine doesn't try to play a turn against rules it can't handle.
    if (forcedPassAndPlay && engineMode === 'play') {
      setEngineMode('human-vs-human')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // Saved games and puzzles are standard-chess-only. If the user lands
  // on those tabs with a non-standard variant in the URL (e.g. clicking
  // a saved game while ?variant=chess960 was stuck), snap mode back so
  // the board renders and replays work.
  useEffect(() => {
    if ((topTab === 'saved' || topTab === 'puzzles') && mode !== 'standard') {
      setMode('standard')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topTab])

  // ── Live opening detection ───────────────────────────────────────
  // After each completed ply the FE asks the BE to name the line. We
  // keep the LAST known opening in state and only swap to "(out of
  // book)" when the BE returns null — so a 30-move game whose tail
  // wandered off-book still shows the name we identified earlier.
  // - Debounced 300ms so blitz-quick moves don't N+1 the BE.
  // - Gated to matchedPly >= 3 for display (move 1 is noise: "King's
  //   Pawn Game" etc.). Detection still runs from move 1 so the moment
  //   we cross 3 plies the heading appears with the correct name.
  // - Resets when the move list empties (board reset / new game).
  const [openingInfo, setOpeningInfo] = useState(null)
  // null = never identified ↔ { eco, name, slug, matchedPly, outOfBook? }
  const [openingExpanded, setOpeningExpanded] = useState(false)
  const [openingDetail, setOpeningDetail] = useState(null)
  // Cache last-fetched detail keyed by slug so toggling open re-uses it.
  const openingDetailCacheRef = useRef(new Map())

  useEffect(() => {
    if (history.length === 0) {
      // Fresh board — wipe any prior identification + collapse the panel.
      setOpeningInfo(null)
      setOpeningExpanded(false)
      setOpeningDetail(null)
      return
    }
    let cancelled = false
    const t = setTimeout(async () => {
      const { data, error: err } = await chessIdentifyOpening(history)
      if (cancelled) return
      if (err) return
      const eco  = data?.eco  || null
      const name = data?.name || null
      if (eco && name) {
        setOpeningInfo({
          eco,
          name,
          slug: data.slug,
          matchedPly: data.matchedPly || 0,
          outOfBook: false,
        })
      } else {
        // No prefix match at any depth → stick on the last name we saw,
        // tagged out-of-book. If we never had one in the first place,
        // leave openingInfo as null so the panel stays hidden.
        setOpeningInfo(prev => prev ? { ...prev, outOfBook: true } : null)
      }
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [history])

  // When the user expands the collapsible, lazy-fetch the full opening
  // record (PGN + computed FEN + the canonical move list) for the body.
  // Cached per slug — switching openings within the same session is free
  // after the first hit on each.
  useEffect(() => {
    if (!openingExpanded || !openingInfo?.slug) {
      setOpeningDetail(null)
      return
    }
    const slug = openingInfo.slug
    const cached = openingDetailCacheRef.current.get(slug)
    if (cached) { setOpeningDetail(cached); return }
    let cancelled = false
    chessGetOpening(slug).then(({ data }) => {
      if (cancelled || !data) return
      openingDetailCacheRef.current.set(slug, data)
      setOpeningDetail(data)
    })
    return () => { cancelled = true }
  }, [openingExpanded, openingInfo?.slug])

  // Accessor — chess.js OR chessops adapter, whichever drives the current
  // mode. ChessBoard treats both identically thanks to the adapter shim.
  const activeGame = () => usesChessjs ? chessRef.current : variantGameRef.current
  const turnColor = useMemo(
    () => (activeGame()?.turn() === 'w' ? 'white' : 'black'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fen, mode],
  )
  // In analyze + pass-and-play, the user drives BOTH sides — movableColor
  // follows whoever's turn it is. In play-vs-engine, lock to the player's
  // chosen colour so they can't move for the engine.
  const bothSidesMovable = engineMode === 'human-vs-human' || engineMode === 'analyze'
  const isPlayerTurn = bothSidesMovable || turnColor === playerColor
  const movableColor = bothSidesMovable ? turnColor : (isPlayerTurn ? playerColor : null)

  // Called by ChessBoard when the user finishes a drag/drop legal move.
  // Standard / 960 / offline use the full chess.js promotion picker; for
  // chessops-backed variants we auto-queen (variants are a quicker lane
  // and the parent picker is already there for the main standard board).
  const onUserMove = useCallback((from, to) => {
    const game = usesChessjs ? chessRef.current : variantGameRef.current
    if (!game) return
    const piece = game.get(from)
    const toRank = to[1]
    const isPromotion = piece && piece.type === 'p' &&
      ((piece.color === 'w' && toRank === '8') || (piece.color === 'b' && toRank === '1'))
    if (isPromotion) {
      if (usesChessjs) {
        setPendingPromotion({ from, to, color: piece.color })
        return
      }
      // Auto-queen for chessops variants.
      try { game.move({ from, to, promotion: 'q' }) } catch { return }
      setFen(game.fen())
      setHistory(game.history())
      setEvalHistory(prev => [...prev, { score: null, depth: 0 }])
      return
    }
    try {
      const move = game.move({ from, to })
      if (!move) return
    } catch { return }
    setFen(game.fen())
    setHistory(game.history())
    setEvalHistory(prev => [...prev, { score: null, depth: 0 }])
  }, [usesChessjs])

  // User picked a promotion piece from the modal — apply the held move.
  const completePromotion = useCallback((pieceChar) => {
    const p = pendingPromotion
    if (!p) return
    const game = usesChessjs ? chessRef.current : variantGameRef.current
    try {
      game.move({ from: p.from, to: p.to, promotion: pieceChar })
    } catch {
      setPendingPromotion(null)
      return
    }
    setFen(game.fen())
    setHistory(game.history())
    setEvalHistory(prev => [...prev, { score: null, depth: 0 }])
    setPendingPromotion(null)
  }, [pendingPromotion, usesChessjs])

  const cancelPromotion = () => {
    // Restore the board view to current game state — chessground may
    // have already animated the pawn forward; re-set fen pushes it back.
    setPendingPromotion(null)
    const game = usesChessjs ? chessRef.current : variantGameRef.current
    if (game) setFen(game.fen())
  }

  // ── BE Stockfish engine — only for STANDARD mode. Other engine-supported
  // modes (960 / KoTH / 3-Check) use the local Web-Worker Stockfish below
  // so we can pass UCI_Chess960 + skip the BE call entirely.
  useEffect(() => {
    if (mode !== 'standard') return
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
  }, [fen, isPlayerTurn, engineMode, engineElo, mode])

  // ── Local Stockfish (Web Worker) — handles 960 + chessops variants that
  // chessops can score under standard rules (KoTH / 3-Check). The variant
  // win conditions are enforced FE-side via the chessops adapter, so as
  // far as Stockfish is concerned it's just "standard chess from this FEN".
  // The variant rules layer terminates the game when KoTH / 3-Check trips.
  useEffect(() => {
    if (mode === 'standard' || mode === 'offline') return
    if (!engineSupported) return
    if (engineMode !== 'play' || isPlayerTurn) return
    const game = activeGame()
    if (!game || game.isGameOver()) return
    let cancelled = false
    setThinking(true)
    setStatus({ kind: 'thinking', text: `Stockfish (local) · ELO ${engineElo}` })
    const options = { 'Skill Level': skillLevelFromElo(engineElo) }
    if (mode === 'chess960') options.UCI_Chess960 = true
    localBestMove(fen, { movetime: 1200, options })
      .then(({ bestmove, info }) => {
        if (cancelled) return
        setThinking(false)
        if (!bestmove) {
          setStatus({ kind: 'error', text: 'Engine returned no move' })
          return
        }
        const move = game.move({
          from: bestmove.slice(0, 2),
          to:   bestmove.slice(2, 4),
          promotion: bestmove.length === 5 ? bestmove[4] : undefined,
        })
        if (!move) {
          setStatus({ kind: 'error', text: `Engine move illegal in variant: ${bestmove}` })
          return
        }
        setFen(game.fen())
        setHistory(game.history())
        setEvalHistory(prev => [...prev, { score: null, depth: 0 }])
        setTelemetry(info ? { source: 'local', ...info } : null)
        setStatus({ kind: 'idle', text: 'Your turn' })
      })
      .catch(err => {
        if (cancelled) return
        setThinking(false)
        setStatus({ kind: 'error', text: err?.message || 'Local engine error' })
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, isPlayerTurn, engineMode, engineElo, mode, engineSupported])

  // Auto-analyze in 'analyze' mode (debounced 250ms) — STANDARD ONLY.
  // The BE engine is plain Stockfish; analysing chessops variants would
  // produce nonsense scores (SF doesn't know about atomic explosions etc.).
  useEffect(() => {
    if (mode !== 'standard') return
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
  }, [fen, engineMode, analyzeDepth, mode])

  // ── Controls ──
  // Reset replays the active mode's setup — re-shuffles 960, restarts a
  // chessops variant from defaultPosition, or new() the chess.js game.
  const resetBoard = () => {
    if (mode === 'standard' || mode === 'offline') {
      chessRef.current = new Chess()
      setFen(chessRef.current.fen())
    } else if (mode === 'chess960') {
      const f = generate960Fen()
      const g = buildVariantGame('chess960', f)
      chessRef.current = null
      variantGameRef.current = g
      setFen(g ? g.fen() : f)
    } else {
      const g = buildVariantGame(mode)
      variantGameRef.current = g
      setFen(g.fen())
    }
    setHistory([]); setEvalHistory([]); setVariations([])
    setTelemetry(null)
    setStatus({ kind: 'idle', text: 'Ready' })
    setBoardKey(k => k + 1)
  }
  const undoMove = () => {
    // chess.js modes (standard / offline) and chessops modes (960 + every
    // variant) both expose .undo(). For engine play, undo TWICE so the user
    // lands back on their own turn instead of facing the engine again with
    // the same position.
    const game = activeGame()
    if (!game) return
    if (!game.undo()) return
    if (engineMode === 'play' && !game.isGameOver()) game.undo()
    setFen(game.fen())
    setHistory(game.history())
    setEvalHistory(prev => prev.slice(0, game.history().length))
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
      const text = usesChessjs
        ? chessRef.current.pgn()
        // chessops adapter doesn't expose a real PGN engine; fall back to
        // the UCI move list with a variant tag header so the user still
        // has something useful to paste somewhere (e.g. Lichess analysis).
        : `[Variant "${mode}"]\n[FEN "${variantGameRef.current?.fen?.() || ''}"]\n\n${(variantGameRef.current?.history?.() || []).join(' ')}`
      await navigator.clipboard.writeText(text)
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
    const name = saveName.trim()
    if (!name) return
    // Saved games rely on chess.js PGN export. For variant games (chessops)
    // we don't have a real PGN engine wired up yet — save the FEN + UCI
    // history string as a fallback so the user still has something to
    // reload (the saved-games panel can render either gracefully).
    const game = usesChessjs ? chessRef.current : variantGameRef.current
    if (!game) { setSaveModalOpen(false); return }
    const isMate = game.isCheckmate?.() || false
    const result = isMate
      ? (game.turn() === 'w' ? '0-1' : '1-0')
      : (game.isDraw?.() ? '1/2-1/2' : '*')
    const pgn = usesChessjs ? chessRef.current.pgn() : `[Variant "${mode}"]\n${(game.history() || []).join(' ')}`
    const { error: err } = await chessSaveGame({
      name,
      pgn,
      fen: game.fen(),
      side: engineMode === 'play' ? playerColor : null,
      mode: `${mode}/${engineMode}`,
      engineName: engineMode === 'play' && engineSupported ? 'Stockfish' : null,
      engineType: engineMode === 'play' && engineSupported ? 'stockfish' : null,
      engineStrength: engineMode === 'play' && engineSupported ? engineElo : null,
      timeControl: timeControl?.id || 'none',
      result,
      moveCount: game.history().length,
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
    // Snap the user back to the Play tab + Standard mode so they see the
    // loaded position on the main board immediately. Saved games are
    // chess.js PGNs — they only make sense in standard.
    setMode('standard')
    setTopTab('play')
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

  const activeGameInstance = usesChessjs ? chessRef.current : variantGameRef.current
  const isGameOver = !!(activeGameInstance && activeGameInstance.isGameOver())
  const gameOverReason = (() => {
    const c = activeGameInstance
    if (!c || !c.isGameOver()) return null
    if (!usesChessjs && typeof c.variantOutcome === 'function') {
      const outcome = c.variantOutcome()
      if (outcome) {
        if (outcome.winner === 'white') return `${modeMeta.label} · White wins`
        if (outcome.winner === 'black') return `${modeMeta.label} · Black wins`
        return `${modeMeta.label} · Draw`
      }
    }
    if (c.isCheckmate()) return `Checkmate · ${c.turn() === 'w' ? 'Black' : 'White'} wins`
    if (c.isStalemate()) return 'Stalemate'
    if (c.isInsufficientMaterial()) return 'Draw — insufficient material'
    if (typeof c.isThreefoldRepetition === 'function' && c.isThreefoldRepetition()) return 'Draw — threefold repetition'
    if (c.isDraw && c.isDraw()) return 'Draw — 50-move rule'
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
                activeSide={isGameOver || flagged ? null
                            : history.length === 0 ? null
                            : turnColor}
                orientation={playerColor}
              />
            </div>
          )}
          <div style={{ width: 'min(calc(100vh - 60px), 100%)', maxWidth: '100%' }}>
            <ChessBoard
              key={`fs-${mode}-${boardKey}`}
              chess={activeGameInstance}
              fen={fen}
              orientation={playerColor}
              movableColor={movableColor}
              onMove={onUserMove}
              layoutKey={layoutKey}
              candidateMoves={engineMode === 'analyze' && mode === 'standard'
                ? variations.slice(0, 3).map(v => v.pv?.[0]).filter(Boolean)
                : []}
            />
          </div>
        </div>
      </div>
    )
  }

  // Variant-specific status row (3-Check counters / KoTH hill / Atomic blast info).
  const threeCheckCounts = (mode === 'threeCheck' && variantGameRef.current)
    ? variantGameRef.current.threeCheckCounts() : null

  return (
    <div className="min-h-screen bg-[#0a0a0e] text-gray-100 pt-24 sm:pt-32 pb-16 px-3 sm:px-6">
      {promotionPicker}
      <div className="max-w-6xl mx-auto">
        <Header engineHealth={engineHealth} onFullscreen={() => setFullscreen(true)} />

        {/* ── Top-level tabs ── peer sections of /chess. Puzzles & Online live
            up here so the user doesn't have to scroll past the entire play
            stack to find them. */}
        <TopTabs value={topTab} onChange={setTopTab} />

        {topTab === 'play' && (
          <>
            {/* ── Mode chip row — variants live here. ONE shared board renders
                whichever rules engine the active mode requires. Chessops drives
                atomic / antichess / horde / crazyhouse / racingKings / koth /
                threeCheck; chess.js drives standard / 960 / offline. */}
            <ModeChips
              value={mode} onChange={setMode}
              modes={MODES}
            />

            <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[1fr_320px] mt-4">
              {/* ── Board column ── */}
              <div className="space-y-3">
                <ModeBar
                  engineMode={engineMode} setEngineMode={setEngineMode}
                  playerColor={playerColor} setPlayerColor={setPlayerColor}
                  engineElo={engineElo} setEngineElo={setEngineElo}
                  analyzeDepth={analyzeDepth} setAnalyzeDepth={setAnalyzeDepth}
                  forcedPassAndPlay={forcedPassAndPlay}
                  modeId={mode}
                />

                {/* Variant info row — for chessops modes, show the rule
                    summary + any per-variant counters (3-Check, KoTH hill). */}
                {mode !== 'standard' && (
                  <VariantInfoStrip
                    modeId={mode}
                    threeCheckCounts={threeCheckCounts}
                  />
                )}

                <div className="flex gap-2 sm:gap-3 touch-manipulation">
                  {/* EvalBar — disabled in variants where Stockfish would
                      lie (atomic explosions / antichess captures-only /
                      horde / crazyhouse / racing kings). Stockfish only
                      understands standard chess. */}
                  {showEval && mode === 'standard' && (
                    <div className="hidden sm:block">
                      <EvalBar score={evalLatest?.score} orientation={playerColor} />
                    </div>
                  )}
                  {timeControl.baseMs != null && (
                    <div className="w-20 sm:w-24 shrink-0">
                      <Clocks
                        white={whiteMs} black={blackMs}
                        activeSide={isGameOver || flagged ? null
                                    : history.length === 0 ? null
                                    : turnColor}
                        orientation={playerColor}
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0 max-w-[min(640px,calc(100vw-32px))] mx-auto">
                    <ChessBoard
                      key={`board-${mode}-${boardKey}`}
                      chess={activeGameInstance}
                      fen={fen}
                      orientation={playerColor}
                      movableColor={movableColor}
                      onMove={onUserMove}
                      layoutKey={layoutKey}
                      candidateMoves={engineMode === 'analyze' && mode === 'standard'
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
                  onChallenge={mode === 'standard' ? onChallenge : null}
                  showEval={showEval && mode === 'standard'}
                  onToggleEval={() => setShowEval(v => !v)}
                  undoSupported={true}
                />

                {/* FEN / PGN import only for standard chess.js modes. */}
                {usesChessjs && (
                  <>
                    <FenImport
                      value={fenInput} setValue={setFenInput} onLoad={loadFen} currentFen={fen}
                    />
                    <PgnImport
                      value={pgnInput} setValue={setPgnInput} onLoad={loadPgn}
                    />
                    <PgnDatabaseLoader onLoad={applyPgn} />
                  </>
                )}
              </div>

              {/* ── Sidebar ── */}
              <div className="flex flex-col gap-3">
                {mode === 'standard' && (
                  <EnginePanel telemetry={telemetry} status={status} thinking={thinking} />
                )}
                {engineMode === 'analyze' && mode === 'standard' && variations.length > 0 && (
                  <div className="hidden md:block">
                    <Variations variations={variations} chess={chessRef.current} />
                  </div>
                )}
                <div className="luxe-card p-3">
                  {openingInfo && openingInfo.matchedPly >= 3 && mode === 'standard' && (
                    <OpeningHeading
                      info={openingInfo}
                      expanded={openingExpanded}
                      onToggle={() => setOpeningExpanded(v => !v)}
                      detail={openingDetail}
                    />
                  )}
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Moves</p>
                  <MoveList history={history} evalHistory={evalHistory} />
                </div>
                {showEval && mode === 'standard' && evalHistory.some(e => e?.score) && (
                  <div className="luxe-card p-3 hidden md:block">
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Eval over time</p>
                    <EvalGraph history={evalHistory} />
                  </div>
                )}
                <TimeControlPicker value={timeControl} onChange={setTimeControl} />
                <PieceSetPicker value={pieceSet} onChange={setPieceSet} />
              </div>
            </div>

            {/* ECO opening database — only meaningful in standard chess.
                Collapsed by default. */}
            {mode === 'standard' && <OpeningExplorer defaultOpen={false} />}

            {/* Variants rules-only reference card — shown when the user is in
                a chessops variant, gives the canonical rule summary. NO board:
                the only board on this page is the one above. */}
            {mode !== 'standard' && mode !== 'offline' && (
              <VariantsRulesCard activeMode={mode} />
            )}
          </>
        )}

        {topTab === 'puzzles' && (
          <div className="mt-2">
            <PuzzleTrainer />
          </div>
        )}

        {topTab === 'online' && (
          <div className="mt-2 space-y-4">
            <LiveGamesLobby defaultOpen={true} />
            <div className="luxe-card p-4">
              <p className="text-sm text-gray-300">
                Challenge a friend from the Play tab's <span className="text-amber-300">Challenge</span> button —
                or join an open match above.
              </p>
            </div>
          </div>
        )}

        {topTab === 'saved' && (
          <div className="mt-2">
            <SavedGames refreshKey={savedRefresh} onLoad={loadSavedGame} />
          </div>
        )}
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
            Give this game a name. {history.length} ply, {isGameOver ? 'finished' : 'in progress'}.
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

// ── Top-level tabs ── Play / Puzzles / Online / Saved.
// Variants live INSIDE the Play tab (mode chip row) so the user never has
// to scroll past the entire play stack to find puzzles or vice-versa.
function TopTabs({ value, onChange }) {
  const tabs = [
    { id: 'play',    label: 'Play',    icon: <AimOutlined /> },
    { id: 'puzzles', label: 'Puzzles', icon: <BookOutlined /> },
    { id: 'online',  label: 'Online',  icon: <SendOutlined /> },
    { id: 'saved',   label: 'Saved',   icon: <SaveOutlined /> },
  ]
  return (
    <div className="luxe-card p-2 mb-4 flex items-center gap-1 flex-wrap">
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={`text-xs font-semibold px-3 py-2 min-h-[40px] sm:min-h-0 sm:py-1.5 rounded-lg border transition-colors inline-flex items-center gap-1.5 ${
            value === t.id
              ? 'border-amber-400/60 bg-amber-500/15 text-amber-200'
              : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-900/40'
          }`}>
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ── Mode chip row — sits above the board inside the Play tab. Changing
// the mode resets the board to that variant's starting position. The board
// component below uses chess.js for standard/960/offline and the chessops
// adapter for everything else; same chessground render in either case.
function ModeChips({ value, onChange, modes }) {
  return (
    <div className="luxe-card p-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 mr-1">Mode</span>
        {modes.map(m => (
          <button key={m.id} onClick={() => onChange(m.id)}
            title={m.engine ? `${m.label} · Stockfish supported` : `${m.label} · Pass-and-play only (chessops rules)`}
            className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-colors inline-flex items-center gap-1.5 ${
              value === m.id
                ? 'border-amber-400/60 bg-amber-500/20 text-amber-100 ring-1 ring-amber-400/40'
                : 'border-gray-800 bg-gray-900/40 text-gray-300 hover:border-amber-500/40 hover:text-amber-200'
            }`}>
            <span className="text-sm leading-none">{m.icon}</span>
            {m.label}
            {!m.engine && m.id !== 'offline' && (
              <span className="text-[9px] uppercase tracking-wider text-fuchsia-300/80 ml-0.5">chessops</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Variant info strip — surfaced just under the mode chips, gives the
// rule summary + per-variant live counters (3-Check counts, KoTH hint).
const VARIANT_BLURB = {
  chess960:    'Back rank shuffled. Bishops on opposite colours, king between rooks. Castling adapts to starting files.',
  koth:        'First king to reach d4, e4, d5 or e5 wins. Checkmate ends the game as normal.',
  threeCheck:  'First side to deliver three checks wins. Mate also ends the game.',
  atomic:      "Captures detonate a 3×3 square (pawns excepted). Explode the opponent's king to win. Rules by chessops.",
  antichess:   'Captures are mandatory. No check, no mate. First to lose all pieces wins. Rules by chessops.',
  horde:       'White has 36 pawns and no other pieces. Black mates White; White wins by clearing the board. Rules by chessops.',
  crazyhouse:  'Captured pieces switch sides and join your reserve. Drops are a move. Rules by chessops.',
  racingKings: 'No checks allowed. First king to reach the 8th rank wins. Rules by chessops.',
  offline:     'Pass-and-play — two humans on one device. No engine, no network. Standard rules.',
}
function VariantInfoStrip({ modeId, threeCheckCounts }) {
  const blurb = VARIANT_BLURB[modeId]
  if (!blurb) return null
  return (
    <div className="luxe-card p-3 flex items-start gap-3 flex-wrap">
      <p className="text-xs text-gray-300 leading-relaxed flex-1 min-w-[200px]">
        {blurb}
      </p>
      {modeId === 'threeCheck' && threeCheckCounts && (
        <div className="flex items-center gap-2 text-[11px] font-mono shrink-0">
          <span className="text-gray-400">Checks:</span>
          <span className="text-amber-200">W {threeCheckCounts.white}/3</span>
          <span className="text-gray-600">·</span>
          <span className="text-amber-200">B {threeCheckCounts.black}/3</span>
        </div>
      )}
      {modeId === 'koth' && (
        <div className="text-[11px] font-mono shrink-0 text-amber-200">
          <span className="text-gray-500">Hill:</span> d4 · e4 · d5 · e5
        </div>
      )}
    </div>
  )
}

// ── Mode + colour + slider bar ──
// forcedPassAndPlay = true when the active variant has rules Stockfish can't
// play (atomic, antichess, etc.). We grey-out Play / Analyze in that case and
// surface a helpful pill explaining why.
function ModeBar({ engineMode, setEngineMode, playerColor, setPlayerColor, engineElo, setEngineElo, analyzeDepth, setAnalyzeDepth, forcedPassAndPlay, modeId }) {
  const ENGINE_MODES = [
    { id: 'play',            label: 'Play vs engine', icon: <AimOutlined />,    engine: true },
    { id: 'analyze',         label: 'Analyze',        icon: <SearchOutlined />, engine: true },
    { id: 'human-vs-human',  label: 'Pass and play',  icon: <TeamOutlined />,   engine: false },
  ]
  return (
    <div className="luxe-card p-3 flex items-center gap-2 flex-wrap">
      {ENGINE_MODES.map(m => {
        const disabled = m.engine && forcedPassAndPlay
        return (
        <button key={m.id} onClick={() => !disabled && setEngineMode(m.id)}
          disabled={disabled}
          title={disabled ? `Stockfish can't play ${modeId} — Pass-and-play only.` : ''}
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors inline-flex items-center gap-1.5 ${
            disabled
              ? 'border-gray-900 bg-gray-900/30 text-gray-600 cursor-not-allowed'
              : engineMode === m.id
                ? 'border-amber-400/60 bg-amber-500/15 text-amber-200'
                : 'border-gray-800 bg-gray-900/40 text-gray-400 hover:text-gray-200'
          }`}>
          {m.icon}
          {m.label}
        </button>
      )})}
      {forcedPassAndPlay && (
        <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-gray-700 bg-gray-900/60 text-gray-400 ml-1">
          Engine: variant unsupported
        </span>
      )}
      {engineMode === 'play' && !forcedPassAndPlay && (
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
function StatusBar({ status, thinking, isGameOver, gameOverReason, onUndo, onFlip, onReset, onCopyPgn, onSave, onChallenge, showEval, onToggleEval, undoSupported = true }) {
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
          disabled={!undoSupported}
          title={undoSupported ? 'Roll one move back (two in engine play)' : 'Take back not supported in this variant'}
          className="text-[11px] font-semibold px-3 py-2 sm:px-2.5 sm:py-1 min-h-[40px] sm:min-h-0 rounded-lg border border-gray-800 hover:border-gray-600 text-gray-300 inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed">
          <UndoOutlined /> Take back
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

// ── Live opening heading ──
// Collapsible chip that sits above the move list on the sidebar.
// Collapsed view = a single tappable row with ECO + name. Expanded
// view shows the canonical SAN sequence + PGN string + a copy button.
// The "out of book" tag appears when the live game has wandered past
// the line we recognise — the displayed name stays the LAST identified
// one rather than regressing to a shorter / less specific match.
function OpeningHeading({ info, expanded, onToggle, detail }) {
  if (!info) return null
  const pgnFromDetail = detail?.pgn || (Array.isArray(detail?.moves) ? renderPairs(detail.moves) : '')
  const copyPgn = async () => {
    const text = detail?.pgn || pgnFromDetail || ''
    if (!text) return
    try { await navigator.clipboard.writeText(text) } catch {}
  }
  return (
    <div className="mb-3 -mt-1">
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center justify-between gap-2 text-left rounded-lg border px-2.5 py-1.5 transition-colors
          ${expanded
            ? 'border-amber-500/50 bg-amber-500/10'
            : 'border-amber-500/25 bg-amber-500/5 hover:bg-amber-500/10'}`}
        title={info.name}
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className={`inline-block text-[10px] leading-none transition-transform ${expanded ? 'rotate-90' : ''} text-amber-300`}>▶</span>
          <span className="text-[10px] uppercase tracking-wider text-amber-300/80">Opening</span>
          <span className="text-amber-200 font-mono text-[11px] tabular-nums shrink-0">{info.eco}</span>
          <span className="text-amber-100 text-xs font-semibold truncate">{info.name}</span>
        </span>
        {info.outOfBook && (
          <span className="text-[9px] uppercase tracking-wider text-amber-400/70 font-mono shrink-0">out of book</span>
        )}
      </button>
      {expanded && (
        <div className="mt-2 rounded-lg border border-amber-500/20 bg-black/30 p-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] uppercase tracking-wider text-gray-500">Canonical line · {info.matchedPly} ply</p>
            <button
              type="button"
              onClick={copyPgn}
              disabled={!detail?.pgn}
              className="text-[10px] font-mono px-2 py-0.5 rounded border border-gray-700 text-gray-400 hover:text-amber-200 hover:border-amber-500/50 disabled:opacity-30">
              Copy PGN
            </button>
          </div>
          {!detail ? (
            <p className="text-[11px] text-gray-500 font-mono">Loading…</p>
          ) : (
            <p className="text-[11px] text-gray-200 font-mono break-words leading-relaxed">
              {detail.pgn || (Array.isArray(detail.moves) ? renderPairs(detail.moves) : '—')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// Numbered SAN pairs as a plain string fallback for when detail.pgn is
// empty (some openings have no PGN string indexed — only the moves[] array).
function renderPairs(moves) {
  if (!Array.isArray(moves) || moves.length === 0) return ''
  const out = []
  for (let i = 0; i < moves.length; i += 2) {
    const n = Math.floor(i / 2) + 1
    out.push(moves[i + 1] ? `${n}. ${moves[i]} ${moves[i + 1]}` : `${n}. ${moves[i]}`)
  }
  return out.join(' ')
}
