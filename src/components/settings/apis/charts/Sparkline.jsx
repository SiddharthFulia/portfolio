// Tiny inline sparkline for the "calls per hour" column in the endpoint
// table. Uses raw SVG (no recharts overhead per-row) so 200-row tables
// stay smooth. Falls back to a "—" glyph when the series is empty.

export default function Sparkline({ data = [], width = 60, height = 18, color = '#f59e0b' }) {
  if (!data || data.length < 2) {
    return <span className="text-[10px] text-gray-600">—</span>
  }
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const dx = width / (data.length - 1)
  const points = data.map((v, i) => {
    const x = i * dx
    const y = height - ((v - min) / range) * (height - 2) - 1
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg width={width} height={height} className="inline-block align-middle">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  )
}
