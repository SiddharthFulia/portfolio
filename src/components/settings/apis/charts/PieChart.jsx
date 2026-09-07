// Category breakdown donut. Uses the portfolio's brand gradient palette
// so the first three slices read as amber → rose → fuchsia.

import {
  ResponsiveContainer, PieChart as RPieChart, Pie, Cell, Tooltip, Legend,
} from 'recharts'

const CHART_COLORS = [
  '#f59e0b', '#f43f5e', '#d946ef', '#10b981', '#06b6d4',
  '#8b5cf6', '#eab308', '#ec4899', '#3b82f6', '#a855f7',
  '#22d3ee', '#84cc16', '#fb7185', '#c084fc', '#fbbf24',
]

export default function PieChart({ data = [], nameKey = 'name', valueKey = 'value', height = 240 }) {
  if (!data || data.length === 0) {
    return (
      <div className="text-[11px] text-gray-500 py-6 text-center">No data yet.</div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RPieChart>
        <Pie
          data={data}
          dataKey={valueKey}
          nameKey={nameKey}
          innerRadius="45%"
          outerRadius="80%"
          paddingAngle={1}
          stroke="rgba(0,0,0,0.4)"
        >
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
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
        <Legend
          layout="vertical"
          verticalAlign="middle"
          align="right"
          wrapperStyle={{ fontSize: 10, fontFamily: 'monospace' }}
        />
      </RPieChart>
    </ResponsiveContainer>
  )
}
