// variantGame — wraps chessops Position into a chess.js-shaped adapter so
// our existing ChessBoard (built around chess.js's surface) can render any
// Lichess variant without modification.
//
// chessops is Lichess's own rules library — it correctly implements
// Atomic explosions, Antichess mandatory captures, Crazyhouse drops,
// Horde, KoTH, Three-Check, Racing Kings, and 960 castling. Standard
// chess on /chess still uses chess.js (massive existing surface).
//
// API parity (subset that ChessBoard touches):
//   game.turn()        → 'w' | 'b'
//   game.inCheck()     → boolean
//   game.fen()         → string
//   game.history()     → string[] (UCI strings — SAN is overkill here)
//   game.isGameOver()  → boolean (combines isEnd + variantOutcome)
//   game.moves({square, verbose:true}) → [{ from, to, promotion? }, ...]
//   game.move({from, to, promotion}) → { from, to, promotion, color, san } | null
//   game.get(sq)       → { type, color } | null     (for promotion detection)
//   game.board()       → 8×8 array (used by parent reset logic — leave empty stub)
//
// The chess.js surface above is enough for ChessBoard.jsx. Anything richer
// (PGN, undo() across variants, threefold detection beyond chessops's
// built-in) stays in chess.js / standard mode where it already works.

import {
  Chess as OpsChess,
  Atomic, Antichess, KingOfTheHill, ThreeCheck,
  Crazyhouse, Horde, RacingKings, defaultPosition,
} from 'chessops/variant'
import { parseFen, makeFen, INITIAL_FEN } from 'chessops/fen'
import { parseUci, makeUci, parseSquare, makeSquare, opposite } from 'chessops/util'
import { chessgroundDests } from 'chessops/compat'
import { makeSan } from 'chessops/san'

// ── Mode → chessops rules string ────────────────────────────────────
// `chess960` maps to standard rules (chessops doesn't separate them;
// the X-FEN castling rights handle 960 within the standard rules engine).
const MODE_TO_RULES = {
  standard: 'chess',
  chess960: 'chess',
  koth: 'kingofthehill',
  threeCheck: '3check',
  atomic: 'atomic',
  antichess: 'antichess',
  horde: 'horde',
  crazyhouse: 'crazyhouse',
  racingKings: 'racingkings',
}

// chess.js piece role char ↔ chessops role string.
const ROLE_TO_CHAR = {
  pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k',
}
const CHAR_TO_ROLE = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
}

export const VARIANT_MODES = [
  'standard', 'chess960', 'koth', 'threeCheck',
  'atomic', 'antichess', 'horde', 'crazyhouse', 'racingKings', 'offline',
]

// Modes that are "standard chess shape" → Stockfish can play them. Stockfish
// understands KoTH/3-Check moves (the win condition is enforced FE-side),
// and 960 with the UCI_Chess960 flag. Atomic/Antichess/Horde/Crazyhouse/
// RacingKings have different move legality so SF would play illegal moves.
export const ENGINE_SUPPORTED_MODES = new Set([
  'standard', 'chess960', 'koth', 'threeCheck',
])

// Build a VariantGame from a starting position (or supplied FEN for 960).
// Returns null if the FEN is malformed for the rules.
export function buildVariantGame(mode, fen) {
  const rules = MODE_TO_RULES[mode] || 'chess'
  let pos
  if (fen) {
    // parseFen returns Result<Setup>; chain to position constructor by rules.
    const parsed = parseFen(fen)
    if (parsed.isErr) return null
    const setup = parsed.value
    let made
    switch (rules) {
      case 'chess':         made = OpsChess.fromSetup(setup); break
      case 'kingofthehill': made = KingOfTheHill.fromSetup(setup); break
      case '3check':        made = ThreeCheck.fromSetup(setup); break
      case 'atomic':        made = Atomic.fromSetup(setup); break
      case 'antichess':     made = Antichess.fromSetup(setup); break
      case 'horde':         made = Horde.fromSetup(setup); break
      case 'crazyhouse':    made = Crazyhouse.fromSetup(setup); break
      case 'racingkings':   made = RacingKings.fromSetup(setup); break
      default:              made = OpsChess.fromSetup(setup); break
    }
    if (made.isErr) return null
    pos = made.value
  } else {
    pos = defaultPosition(rules)
  }
  return wrap(pos, mode, [])
}

// Wrap a chessops Position with the chess.js subset our board uses.
function wrap(pos, mode, historyUci) {
  // Snapshot stack — each entry is the cloned Position from BEFORE a move.
  // Lets us roll back N times by popping. chessops Positions have .clone()
  // which deep-copies board + state, so each snapshot is independent.
  const posSnapshots = []
  // Parallel array of SAN strings ("Nf3", "O-O", "exd5", etc.) so the move
  // list can render piece glyphs instead of UCI ("g1f3"). chess.js's
  // .history() returns SAN by default; we match that contract so MoveList
  // works without branching by rules engine.
  const historySan = []
  const game = {
    // ── chess.js-shaped getters ─────────────────────────────────────
    turn: () => pos.turn === 'white' ? 'w' : 'b',
    fen: () => makeFen(pos.toSetup()),
    inCheck: () => pos.isCheck(),
    isGameOver: () => pos.isEnd(),
    // SAN history (chess.js parity — MoveList expects SAN to swap in glyphs).
    history: () => historySan.slice(),
    // UCI history (for save/replay — drops in Crazyhouse like 'P@e4' too).
    historyUci: () => historyUci.slice(),
    // chessgroundDests gives us the legal-move map directly; we expose it
    // both via a custom getter AND via .moves({square}) for chess.js parity.
    cgDests: () => chessgroundDests(pos),
    moves: (opts) => {
      const dests = chessgroundDests(pos)
      if (opts?.square) {
        const list = dests.get(opts.square) || []
        return list.map(to => ({ from: opts.square, to }))
      }
      const all = []
      for (const [from, tos] of dests) {
        for (const to of tos) all.push({ from, to })
      }
      return all
    },
    get: (sq) => {
      const square = parseSquare(sq)
      if (square === undefined) return null
      const piece = pos.board.get(square)
      if (!piece) return null
      return { type: ROLE_TO_CHAR[piece.role], color: piece.color === 'white' ? 'w' : 'b' }
    },
    board: () => {
      // 8×8 rows, top = rank 8 → index 0 (chess.js .board() shape).
      const rows = []
      for (let r = 7; r >= 0; r--) {
        const row = []
        for (let f = 0; f < 8; f++) {
          const sq = f + 8 * r
          const piece = pos.board.get(sq)
          row.push(piece ? { type: ROLE_TO_CHAR[piece.role], color: piece.color === 'white' ? 'w' : 'b' } : null)
        }
        rows.push(row)
      }
      return rows
    },
    isCheckmate: () => pos.isCheckmate(),
    isStalemate: () => pos.isStalemate(),
    isInsufficientMaterial: () => pos.isInsufficientMaterial(),
    isDraw: () => {
      const outcome = pos.outcome()
      return outcome && outcome.winner === undefined
    },
    // ── mutating: apply a move (chess.js .move({from,to,promotion})) ──
    move: (m) => {
      if (!m || !m.from || !m.to) return null
      const uci = m.from + m.to + (m.promotion || '')
      const parsed = parseUci(uci)
      if (!parsed) return null
      // Validate the move is legal under chessops rules. Antichess forces
      // captures; Atomic disallows certain captures (own-king blast);
      // chessops returns false from isLegal() in those cases.
      if (!pos.isLegal(parsed)) return null
      const movingPiece = pos.board.get(parsed.from)
      const color = movingPiece ? movingPiece.color : pos.turn
      // Compute SAN BEFORE play() — chessops makeSan needs the pre-move
      // position to disambiguate ("Nbd2" vs "Nfd2"), detect check (+) and
      // mate (#). Fall back to UCI if anything goes wrong.
      let san = uci
      try { san = makeSan(pos, parsed) || uci } catch { san = uci }
      // Snapshot BEFORE the play() so undo can roll back deterministically.
      posSnapshots.push(pos.clone())
      pos.play(parsed)
      historyUci.push(uci)
      historySan.push(san)
      return {
        from: m.from,
        to: m.to,
        promotion: m.promotion,
        color: color === 'white' ? 'w' : 'b',
        san,
      }
    },
    // chess.js parity: roll one ply back. Returns the popped move shape
    // or null if there's nothing to undo. Works for ALL variants because
    // we snapshot the Position before each play.
    undo: () => {
      if (posSnapshots.length === 0) return null
      pos = posSnapshots.pop()
      const uci = historyUci.pop() || ''
      historySan.pop()
      return {
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length === 5 ? uci[4] : undefined,
      }
    },
    // ── variant-specific telemetry ──────────────────────────────────
    mode,
    threeCheckCounts: () => {
      // chessops ThreeCheck stores remainingChecks (3 - given). Convert
      // back to given-counts which is what our status row displays.
      if (mode !== 'threeCheck') return null
      const r = pos.remainingChecks
      if (!r) return null
      return { white: 3 - r.white, black: 3 - r.black }
    },
    variantOutcome: () => {
      // Combined outcome (variant + standard). { winner: 'white' | 'black' | undefined } | undefined.
      return pos.outcome()
    },
    // raw chessops position for advanced callers (e.g. variant info text)
    _pos: pos,
  }
  return game
}

// Standard chess starting FEN (re-export for callers).
export const INITIAL_FEN_STR = INITIAL_FEN
