// Top-N candidate moves from /api/chess/analyze.
// Stockfish returns PV as UCI strings ("e2e4"). We convert each PV to SAN
// via a sandbox chess.js instance so the user sees "♕d3" instead of
// "d1d3" — much more readable.
//
// Props:
//   variations — Array<{rank, score, depth, pv: string[] (UCI)}>
//   chess      — chess.js Chess instance for the CURRENT root position
//                (used as the base for converting PV UCI → SAN)

import { Chess } from 'chess.js'

const fmtScore = (s) => {
  if (!s) return '—'
  if (s.type === 'mate') return `M${Math.abs(s.value)}${s.value > 0 ? '' : '⁻'}`
  return `${s.value >= 0 ? '+' : ''}${(s.value / 100).toFixed(2)}`
}

// Piece glyph by SAN. SAN starts with K/Q/R/B/N for non-pawn moves; pawn
// moves have no piece letter. We use white-piece unicode regardless of
// side — the SAN itself encodes "who moves" via turn order.
const PIECE_GLYPH = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘' }

// Convert UCI move list → array of SAN with piece glyph prefixes. Plays
// each UCI through a fresh chess.js instance seeded from the current FEN
// so promotions / captures / castles all render correctly.
function uciPVToSAN(rootFen, uciList) {
  const sandbox = new Chess(rootFen)
  const out = []
  for (const uci of uciList) {
    try {
      const move = sandbox.move({
        from: uci.slice(0, 2),
        to:   uci.slice(2, 4),
        promotion: uci.length === 5 ? uci[4] : undefined,
      })
      if (!move) break
      // Augment SAN with a leading piece glyph for non-pawn moves.
      const lead = PIECE_GLYPH[move.san[0]] || ''
      const sanRest = lead ? move.san.slice(1) : move.san
      out.push({ san: move.san, display: `${lead}${sanRest}`, color: move.color })
    } catch { break }
  }
  return out
}

export default function Variations({ variations, chess }) {
  if (!variations || variations.length === 0) return null
  return (
    <div className="luxe-card p-3">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">
        Top {variations.length} moves
      </p>
      <ul className="space-y-1.5">
        {variations.map(v => {
          const sanPv = chess ? uciPVToSAN(chess.fen(), v.pv) : []
          const headColour = sanPv[0]?.color === 'b' ? 'text-gray-300' : 'text-amber-100'
          return (
            <li key={v.rank} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-amber-300 font-mono w-4 text-right">{v.rank}.</span>
                <span className={`flex-1 font-semibold ${headColour} truncate`}>
                  {/* First move pops with a slightly larger font so the
                      eye lands on it before the PV continuation. */}
                  <span className="text-[14px] mr-1">{sanPv[0]?.display || v.pv[0]}</span>
                  <span className="text-gray-500 text-[10px] font-mono">
                    {sanPv.slice(1, 5).map(m => m.display).join(' ')}
                  </span>
                </span>
                <span className={`font-bold tabular-nums text-xs ${
                  v.score?.value > 0 ? 'text-emerald-300'
                  : v.score?.value < 0 ? 'text-rose-300'
                  : 'text-gray-400'
                }`}>
                  {fmtScore(v.score)}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
      <p className="text-[9px] text-gray-600 mt-2 leading-snug">
        Top-3 candidate arrows drawn on the board · opacity drops by rank.
      </p>
    </div>
  )
}
