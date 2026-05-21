// Move list — paired white/black moves with piece glyphs + eval.
//
// SAN like 'Nf3' becomes '♘f3' (piece symbol + destination). Pawn moves
// stay as-is (no piece letter to swap). Captures keep the 'x'. Castles
// stay as O-O / O-O-O.
//
// Props:
//   history     — string[] of SAN (chess.js .history() output)
//   evalHistory — Array<{score, depth}> aligned by index with history

const PIECE_GLYPH = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘' }

const fmtScore = (s) => {
  if (!s) return ''
  if (s.type === 'mate') return `M${Math.abs(s.value)}${s.value > 0 ? '' : '⁻'}`
  return `${s.value >= 0 ? '+' : ''}${(s.value / 100).toFixed(2)}`
}

// 'Nf3' → '♘f3'; 'e4' → 'e4'; 'Bxe5' → '♗xe5'; 'O-O' → 'O-O'.
function withGlyph(san) {
  if (!san) return ''
  const first = san[0]
  if (PIECE_GLYPH[first]) return `${PIECE_GLYPH[first]}${san.slice(1)}`
  return san
}

export default function MoveList({ history, evalHistory = [] }) {
  if (history.length === 0) {
    return <p className="text-gray-600 text-center py-4 text-xs">No moves yet</p>
  }
  // Build paired rows: { n, white: {san, evalStr}, black?: {san, evalStr} }
  const rows = []
  for (let i = 0; i < history.length; i += 2) {
    rows.push({
      n: Math.floor(i / 2) + 1,
      white: { san: history[i], evalStr: fmtScore(evalHistory[i]?.score) },
      black: history[i + 1]
        ? { san: history[i + 1], evalStr: fmtScore(evalHistory[i + 1]?.score) }
        : null,
    })
  }
  return (
    <div className="max-h-72 overflow-y-auto text-xs">
      <ol className="grid grid-cols-[2.5rem_1fr_1fr] gap-x-2 gap-y-0.5">
        {rows.map(r => (
          <Row key={r.n} row={r} />
        ))}
      </ol>
    </div>
  )
}

function Row({ row }) {
  return (
    <>
      <span className="text-gray-500 font-mono">{row.n}.</span>
      <Cell move={row.white} side="white" />
      {row.black ? <Cell move={row.black} side="black" /> : <span />}
    </>
  )
}

function Cell({ move, side }) {
  // White side picks up amber tint, black picks up cool gray so the user
  // can read who-moved at a glance even when scrolling fast.
  const colour = side === 'white' ? 'text-amber-100' : 'text-gray-300'
  return (
    <span className={`font-semibold ${colour}`}>
      <span className="text-base mr-0.5">{withGlyph(move.san)}</span>
      {move.evalStr && (
        <span className="text-gray-600 text-[10px] ml-1 font-mono">{move.evalStr}</span>
      )}
    </span>
  )
}
