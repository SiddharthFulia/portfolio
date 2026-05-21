// Move list — paired white/black SAN with optional per-move eval.
//
// Props:
//   history     — string[] of SAN (chess.js .history() output)
//   evalHistory — Array<{score, depth}> aligned by index with history

const fmtScore = (s) => {
  if (!s) return ''
  if (s.type === 'mate') return `M${Math.abs(s.value)}${s.value > 0 ? '' : '⁻'}`
  return `${s.value >= 0 ? '+' : ''}${(s.value / 100).toFixed(2)}`
}

export default function MoveList({ history, evalHistory = [] }) {
  if (history.length === 0) {
    return <p className="text-gray-600 text-center py-4 text-xs">No moves yet</p>
  }
  // Build paired rows: [moveNumber, whiteSan + eval, blackSan + eval]
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
    <div className="max-h-72 overflow-y-auto text-xs font-mono">
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
      <span className="text-gray-500">{row.n}.</span>
      <Cell move={row.white} />
      {row.black ? <Cell move={row.black} /> : <span />}
    </>
  )
}

function Cell({ move }) {
  return (
    <span className="text-gray-200">
      {move.san}
      {move.evalStr && (
        <span className="text-gray-600 text-[10px] ml-1">{move.evalStr}</span>
      )}
    </span>
  )
}
