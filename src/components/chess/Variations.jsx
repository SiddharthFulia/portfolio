// Top-N candidate moves with eval — populated by /api/chess/analyze.
//
// Props:
//   variations — Array<{rank, score, depth, pv: string[]}>
//                pv is UCI moves (e.g. "e2e4")

const fmtScore = (s) => {
  if (!s) return '—'
  if (s.type === 'mate') return `M${Math.abs(s.value)}${s.value > 0 ? '' : '⁻'}`
  return `${s.value >= 0 ? '+' : ''}${(s.value / 100).toFixed(2)}`
}

export default function Variations({ variations }) {
  if (!variations || variations.length === 0) return null
  return (
    <div className="luxe-card p-3">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">
        Top {variations.length} moves
      </p>
      <ul className="space-y-1">
        {variations.map(v => (
          <li key={v.rank} className="flex items-center justify-between gap-2 text-xs font-mono">
            <span className="text-amber-300 w-4 text-right">{v.rank}.</span>
            <span className="text-gray-200 flex-1 truncate">
              {v.pv.slice(0, 6).join(' ')}
            </span>
            <span className={`font-bold ${
              v.score?.value > 0 ? 'text-emerald-300'
              : v.score?.value < 0 ? 'text-rose-300'
              : 'text-gray-400'
            }`}>
              {fmtScore(v.score)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
