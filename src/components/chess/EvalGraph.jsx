// Eval-over-time line chart. Pure SVG, no recharts dependency.
// Centipawn axis clamped to ±500 (5 pawns); mate scores pinned to the edge.
//
// Props:
//   history — Array<{score: { type: 'cp'|'mate', value: number } | null, depth }>
//   width   — px, defaults 280
//   height  — px, defaults 80

export default function EvalGraph({ history, width = 280, height = 80 }) {
  const pts = history.map((e, i) => {
    if (!e?.score) return null
    const cp = e.score.type === 'mate'
      ? (e.score.value > 0 ? 500 : -500)
      : Math.max(-500, Math.min(500, e.score.value))
    const x = (i / Math.max(1, history.length - 1)) * width
    const y = height / 2 - (cp / 1000) * height
    return [x, y]
  }).filter(Boolean)
  if (!pts.length) return null
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
      {/* Centre line — above = white advantage, below = black */}
      <line x1={0} y1={height / 2} x2={width} y2={height / 2}
        stroke="#374151" strokeWidth={0.5} strokeDasharray="2 2" />
      <path d={path} stroke="#fbbf24" strokeWidth={1.5} fill="none"
        strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={1.6} fill="#fbbf24" />
      ))}
    </svg>
  )
}
