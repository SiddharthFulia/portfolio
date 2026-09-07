// Horizontal bar chart for top-N lists (hot endpoints, slow endpoints,
// error-iest endpoints). Layout is horizontal so endpoint labels stay
// legible on the left even when they're long.

import {
  ResponsiveContainer, BarChart as RBarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts'

const CHART_COLORS = ['#f59e0b', '#f43f5e', '#d946ef', '#10b981', '#06b6d4', '#8b5cf6', '#eab308', '#ec4899', '#3b82f6', '#a855f7']

export default function BarChart({
  data = [],
  xKey = 'value',
  yKey = 'label',
  height = 240,
  color = '#f59e0b',
  gradient = false,
}) {
  if (!data || data.length === 0) {
    return (
      <div className="text-[11px] text-gray-500 py-6 text-center">No data yet.</div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RBarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.06)" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fill: '#6b7280', fontSize: 10, fontFamily: 'monospace' }}
          axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey={yKey}
          width={140}
          tick={{ fill: '#9ca3af', fontSize: 10, fontFamily: 'monospace' }}
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
          cursor={{ fill: 'rgba(245,158,11,0.08)' }}
        />
        <Bar dataKey={xKey} radius={[0, 4, 4, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={gradient ? CHART_COLORS[i % CHART_COLORS.length] : color} />
          ))}
        </Bar>
      </RBarChart>
    </ResponsiveContainer>
  )
}
