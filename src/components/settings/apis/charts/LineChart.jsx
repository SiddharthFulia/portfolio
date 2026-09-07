// Small recharts wrapper for the APIs tab. Kept intentionally thin —
// recharts is already loaded elsewhere in Settings (DbExplorer + Visualize),
// so there's no extra bundle cost for reusing it here.
//
// Series prop shape: [{ key: 'p50', name: 'p50', color: '#f59e0b' }, …]
// Data prop shape:   [{ label: '00:00', p50: 12, p95: 45 }, …]

import {
  ResponsiveContainer, LineChart as RLineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'

export default function LineChart({ data = [], series = [], xKey = 'label', height = 200, showLegend = true }) {
  if (!data || data.length === 0) {
    return (
      <div className="text-[11px] text-gray-500 py-6 text-center">No data yet.</div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RLineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.06)" />
        <XAxis
          dataKey={xKey}
          tick={{ fill: '#6b7280', fontSize: 10, fontFamily: 'monospace' }}
          axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#6b7280', fontSize: 10, fontFamily: 'monospace' }}
          axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            background: 'rgba(10,10,14,0.95)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            fontSize: 11,
            fontFamily: 'monospace',
          }}
          labelStyle={{ color: '#f59e0b' }}
        />
        {showLegend && series.length > 1 && (
          <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'monospace' }} />
        )}
        {series.map(s => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name || s.key}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </RLineChart>
    </ResponsiveContainer>
  )
}
