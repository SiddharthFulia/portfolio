// Grid overview for the APIs tab — big stat cards + 24h call-volume line
// chart + category breakdown donut + three "top-N" horizontal bar charts
// (hottest, slowest, error-iest endpoints).
//
// All numbers tolerate undefined so the panel renders skeleton-like
// placeholders while the BE catches up. The parent (ApisTab) has already
// decided to render this — meaning either usage came back OK, or we're
// in a partial-catalog-only state — so we don't gate anything here.

import { useMemo } from 'react'
import { Tag } from 'antd'
import {
  ApiOutlined, RiseOutlined, WarningOutlined, ThunderboltOutlined,
  DatabaseOutlined, ClockCircleOutlined,
} from '@ant-design/icons'
import LineChart from './charts/LineChart'
import BarChart from './charts/BarChart'
import PieChart from './charts/PieChart'

// Strip the leading /api/ so labels don't leak the routing prefix.
function displayPath(path) {
  if (!path) return '—'
  return String(path).replace(/^\/api\//, '').replace(/^\//, '')
}

function fmtNum(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  const v = Number(n)
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`
  return v.toLocaleString()
}
function fmtPct(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  return `${Number(n).toFixed(1)}%`
}
function fmtMs(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  return `${Math.round(Number(n))} ms`
}

// A stat card. Tint colours the accent stripe + number. Every card gets
// a "helper" line under the value so the number never sits alone.
function StatCard({ icon, label, value, helper, tint = 'amber' }) {
  const tintMap = {
    amber:   { border: 'border-amber-400/30',   glow: 'bg-amber-500/[0.03]',   num: 'text-amber-200',  chip: 'bg-amber-500/15 text-amber-300' },
    cyan:    { border: 'border-cyan-400/30',    glow: 'bg-cyan-500/[0.03]',    num: 'text-cyan-200',   chip: 'bg-cyan-500/15 text-cyan-300' },
    rose:    { border: 'border-rose-400/30',    glow: 'bg-rose-500/[0.03]',    num: 'text-rose-200',   chip: 'bg-rose-500/15 text-rose-300' },
    fuchsia: { border: 'border-fuchsia-400/30', glow: 'bg-fuchsia-500/[0.03]', num: 'text-fuchsia-200',chip: 'bg-fuchsia-500/15 text-fuchsia-300' },
    emerald: { border: 'border-emerald-400/30', glow: 'bg-emerald-500/[0.03]', num: 'text-emerald-200',chip: 'bg-emerald-500/15 text-emerald-300' },
    violet:  { border: 'border-violet-400/30',  glow: 'bg-violet-500/[0.03]',  num: 'text-violet-200', chip: 'bg-violet-500/15 text-violet-300' },
  }[tint] || {}
  return (
    <div className={`rounded-2xl border ${tintMap.border} ${tintMap.glow} p-3`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={`w-6 h-6 inline-flex items-center justify-center rounded-lg ${tintMap.chip}`}>
          {icon}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">{label}</span>
      </div>
      <div className={`text-2xl font-bold tabular-nums leading-none ${tintMap.num}`}>{value}</div>
      <div className="text-[10px] text-gray-500 mt-1.5 font-mono">{helper}</div>
    </div>
  )
}

// Section wrapper — same chrome as DbExplorer's panels so both tabs feel
// like siblings. Panel titles are font-bold per house rules.
function Panel({ title, subtitle, children, className = '', right }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.02] p-3 ${className}`}>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div>
          <div className="text-xs font-bold text-gray-200">{title}</div>
          {subtitle && <div className="text-[10px] text-gray-500 font-mono mt-0.5">{subtitle}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

export default function ApisOverview({ rows = [], usage = null }) {
  // ── Derive stats from usage.summary if present, else compute from rows.
  const stats = useMemo(() => {
    if (usage?.summary) return usage.summary
    // Fallback — sum whatever fields the rows carry.
    const calls24 = rows.reduce((s, r) => s + (r.calls24h || 0), 0)
    const calls7  = rows.reduce((s, r) => s + (r.calls7d || 0), 0)
    const errs    = rows.reduce((s, r) => s + ((r.errorRate || 0) * (r.calls24h || 0) / 100), 0)
    const latSum  = rows.reduce((s, r) => s + ((r.avgMs || 0) * (r.calls24h || 0)), 0)
    const cacheHits = rows.reduce((s, r) => s + ((r.cacheHit || 0) * (r.calls24h || 0) / 100), 0)
    return {
      totalEndpoints: rows.length,
      calls24h: calls24,
      calls7d: calls7,
      avgLatencyMs: calls24 ? latSum / calls24 : null,
      errorRatePct: calls24 ? (errs / calls24) * 100 : null,
      cacheHitPct: calls24 ? (cacheHits / calls24) * 100 : null,
    }
  }, [rows, usage])

  // 24h volume — usage.hourlyVolume: [{ label: '00:00', calls: 123 }] or
  // fallback: sum across per-endpoint .hourly arrays.
  const hourlyData = useMemo(() => {
    if (Array.isArray(usage?.hourlyVolume) && usage.hourlyVolume.length) return usage.hourlyVolume
    // Fallback: line up rows[].hourly (24 buckets each) and sum column-wise.
    const buckets = new Array(24).fill(0)
    for (const r of rows) {
      const h = r.hourly || []
      for (let i = 0; i < Math.min(24, h.length); i++) buckets[i] += h[i] || 0
    }
    return buckets.map((v, i) => ({ label: `${String(i).padStart(2, '0')}:00`, calls: v }))
  }, [usage, rows])

  // Category pie — usage.byCategory: [{ name, value }] or fallback bucket by row.
  const categoryData = useMemo(() => {
    if (Array.isArray(usage?.byCategory) && usage.byCategory.length) return usage.byCategory
    const map = new Map()
    for (const r of rows) {
      const cat = r.category || 'Other'
      const v = r.calls24h || 0
      map.set(cat, (map.get(cat) || 0) + v)
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [usage, rows])

  // Top-N helpers. Rows come pre-fused so we can just sort.
  const topHot = useMemo(() =>
    [...rows]
      .filter(r => (r.calls24h || 0) > 0)
      .sort((a, b) => (b.calls24h || 0) - (a.calls24h || 0))
      .slice(0, 10)
      .map(r => ({ label: displayPath(r.path), value: r.calls24h || 0 }))
  , [rows])

  const topSlow = useMemo(() =>
    [...rows]
      .filter(r => (r.avgMs || 0) > 0 && (r.calls24h || 0) > 0)
      .sort((a, b) => (b.avgMs || 0) - (a.avgMs || 0))
      .slice(0, 5)
      .map(r => ({ label: displayPath(r.path), value: Math.round(r.avgMs || 0) }))
  , [rows])

  const topErr = useMemo(() =>
    [...rows]
      .filter(r => (r.errorRate || 0) > 0 && (r.calls24h || 0) > 0)
      .sort((a, b) => (b.errorRate || 0) - (a.errorRate || 0))
      .slice(0, 5)
      .map(r => ({ label: displayPath(r.path), value: Number((r.errorRate || 0).toFixed(2)) }))
  , [rows])

  return (
    <div className="space-y-4">
      {/* ── Big stats row ────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard
          icon={<ApiOutlined />}
          label="Endpoints"
          value={fmtNum(stats.totalEndpoints)}
          helper="cataloged & routed"
          tint="amber"
        />
        <StatCard
          icon={<RiseOutlined />}
          label="Calls today"
          value={fmtNum(stats.calls24h)}
          helper="last 24 hours"
          tint="cyan"
        />
        <StatCard
          icon={<DatabaseOutlined />}
          label="Calls this week"
          value={fmtNum(stats.calls7d)}
          helper="last 7 days"
          tint="fuchsia"
        />
        <StatCard
          icon={<ClockCircleOutlined />}
          label="Avg latency"
          value={fmtMs(stats.avgLatencyMs)}
          helper="mean response time"
          tint="violet"
        />
        <StatCard
          icon={<WarningOutlined />}
          label="Error rate"
          value={fmtPct(stats.errorRatePct)}
          helper="4xx + 5xx over 24h"
          tint="rose"
        />
        <StatCard
          icon={<ThunderboltOutlined />}
          label="Cache hit"
          value={fmtPct(stats.cacheHitPct)}
          helper="served from memory"
          tint="emerald"
        />
      </div>

      {/* ── 24h volume + category pie ────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Panel
          title="Call volume · last 24h"
          subtitle="Per-hour bucket count across all endpoints."
          className="lg:col-span-2"
          right={<Tag color="cyan" className="!text-[10px] !font-mono !m-0">hourly</Tag>}
        >
          <LineChart
            data={hourlyData}
            xKey="label"
            series={[{ key: 'calls', name: 'Calls', color: '#f59e0b' }]}
            height={220}
            showLegend={false}
          />
        </Panel>
        <Panel
          title="By category · 24h"
          subtitle="Share of traffic per endpoint group."
        >
          <PieChart data={categoryData} nameKey="name" valueKey="value" height={220} />
        </Panel>
      </div>

      {/* ── Top-N leaderboards ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Panel
          title="Hottest endpoints · 24h"
          subtitle="Top 10 by call volume."
        >
          <BarChart data={topHot} height={280} gradient />
        </Panel>
        <Panel
          title="Slowest endpoints · 24h"
          subtitle="Top 5 by avg latency (ms)."
        >
          <BarChart data={topSlow} height={200} color="#8b5cf6" />
        </Panel>
        <Panel
          title="Error-iest endpoints · 24h"
          subtitle="Top 5 by 4xx + 5xx rate."
        >
          <BarChart data={topErr} height={200} color="#f43f5e" />
        </Panel>
      </div>
    </div>
  )
}
