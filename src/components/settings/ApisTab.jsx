// Settings → APIs tab container.
//
// Two data sources:
//   • GET /api/api-catalog        — public catalog (list of endpoints + shape)
//   • GET /api/admin/api-usage    — vault-gated aggregated metrics (24h)
//
// Sibling agents are shipping these on the BE side in parallel — they may
// return 404 / 502 during the migration window. This container is
// deliberately forgiving: if either endpoint fails we show a friendly
// "waiting for BE" state with a Retry button. If the catalog succeeds but
// usage fails, we still render the endpoint list — just without metrics.
//
// The metrics + catalog are merged into a single `rows` array before the
// child views render, so downstream components don't need to know which
// stream a field came from.

import { useEffect, useMemo, useState, useCallback } from 'react'
import { Segmented, Tag } from 'antd'
import {
  ApiOutlined, ReloadOutlined, DashboardOutlined, WarningOutlined,
  BarsOutlined, TableOutlined,
} from '@ant-design/icons'
import { Button } from '../ui'
import { apiCatalog, apiUsage } from '../../api/ai'
import ApisOverview from './apis/ApisOverview'
import ApisTable    from './apis/ApisTable'
import ApiDetailPane from './apis/ApiDetailPane'

const CATEGORY_ORDER = [
  'All',
  'OSINT', 'NASA', 'Proxy', 'AI', 'Chess', 'City Graphs', 'QR', 'Admin',
  'Agents', 'Physics', 'Chernobyl', 'Games', 'Vision', 'Combine',
  'YTDL', 'Mesh', 'Audio', 'Video', 'Room', 'Cinema',
]

// ── Merge catalog + usage into flat rows ──────────────────────────────
// Catalog entries carry the endpoint shape; usage entries carry metrics.
// Key by `${METHOD} ${path}`. Anything usage returns without a matching
// catalog entry is dropped (we can't render it without a category).
function mergeRows(catalog, usage) {
  const endpoints = catalog?.endpoints || catalog?.data || catalog || []
  const metrics = usage?.endpoints || usage?.metrics || []
  const metricMap = new Map()
  for (const m of metrics) {
    const key = `${(m.method || 'GET').toUpperCase()} ${m.path}`
    metricMap.set(key, m)
  }
  return endpoints.map(ep => {
    const method = (ep.method || 'GET').toUpperCase()
    const key = `${method} ${ep.path}`
    const m = metricMap.get(key) || {}
    return {
      // catalog fields
      path:        ep.path,
      method,
      category:    ep.category || 'Other',
      upstream:    ep.upstream || ep.upstreamUrl || '',
      auth:        ep.auth || ep.authRequired || null,
      rateLimit:   ep.rateLimit || null,
      cacheTtl:    ep.cacheTtl ?? ep.cacheTtlSec ?? null,
      params:      ep.params || ep.parameters || [],
      examples:    ep.examples || ep.exampleParams || {},
      description: ep.description || '',
      // metric fields (all optional)
      calls24h:    m.calls24h ?? m.calls ?? null,
      calls7d:     m.calls7d ?? null,
      avgMs:       m.avgMs ?? m.avgLatencyMs ?? null,
      errorRate:   m.errorRate ?? m.errorRatePct ?? null,
      cacheHit:    m.cacheHit ?? m.cacheHitPct ?? null,
      hourly:      m.hourly || m.hourlyVolume || [],
      hourlyP50:   m.hourlyP50 || [],
      hourlyP95:   m.hourlyP95 || [],
      recentErrors: m.recentErrors || m.errors || [],
    }
  })
}

// ── Friendly "BE not ready" fallback ──────────────────────────────────
function WaitingForBackend({ status, message, onRetry }) {
  const title = status === 404
    ? 'Endpoint not deployed yet'
    : status === 502 || status === 503
      ? 'Backend upgrading'
      : 'Waiting for backend'
  const helper = status === 404
    ? 'The BE catalog endpoint isn\'t live yet. Sibling agents are shipping it in parallel.'
    : 'The BE is momentarily unreachable. This is expected during the Oracle upgrade window.'
  return (
    <div className="rounded-2xl border border-amber-400/30 bg-amber-500/[0.04] p-8 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-300 mb-3">
        <WarningOutlined style={{ fontSize: 22 }} />
      </div>
      <div className="text-sm font-bold text-amber-200 mb-1">{title}</div>
      <div className="text-xs text-gray-400 max-w-md mx-auto mb-4 font-mono leading-relaxed">
        {helper}
        {message && (
          <>
            <br />
            <span className="text-gray-500 text-[10px]">detail: {message}</span>
          </>
        )}
      </div>
      <Button variant="primary" size="small" onClick={onRetry}>
        <ReloadOutlined /> Retry
      </Button>
    </div>
  )
}

export default function ApisTab() {
  const [catalog, setCatalog]     = useState(null)
  const [usage, setUsage]         = useState(null)
  const [catStatus, setCatStatus] = useState(0)      // 0 = pending, 200 = ok, other = failed
  const [useStatus, setUseStatus] = useState(0)
  const [catError, setCatError]   = useState(null)
  const [useError, setUseError]   = useState(null)
  const [loading, setLoading]     = useState(true)

  const [view, setView]           = useState('overview')  // 'overview' | 'detail'
  const [selected, setSelected]   = useState(null)        // full row from merged list
  const [category, setCategory]   = useState('All')

  const loadAll = useCallback(async () => {
    setLoading(true)
    setCatError(null); setUseError(null)
    const [catRes, useRes] = await Promise.all([apiCatalog(), apiUsage({ range: '24h' })])
    setCatalog(catRes.data)
    setCatStatus(catRes.status || (catRes.data ? 200 : 0))
    setCatError(catRes.error)
    setUsage(useRes.data)
    setUseStatus(useRes.status || (useRes.data ? 200 : 0))
    setUseError(useRes.error)
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // Merged rows fed into every child view.
  const allRows = useMemo(() => {
    if (!catalog) return []
    try { return mergeRows(catalog, usage) } catch { return [] }
  }, [catalog, usage])

  const rows = useMemo(() => {
    if (category === 'All') return allRows
    return allRows.filter(r => (r.category || '').toLowerCase() === category.toLowerCase())
  }, [allRows, category])

  // The catalog is the hard dependency — no catalog = no table = show
  // the fallback. Usage is soft; without it we just show 0-count columns.
  const catalogMissing = !loading && !catalog

  const handleSelect = (row) => {
    setSelected(row)
    setView('detail')
    // Scroll to top so the header is visible.
    try { window.scrollTo({ top: 0, behavior: 'smooth' }) } catch {}
  }
  const handleBack = () => {
    setView('overview')
    setSelected(null)
  }

  return (
    <div className="space-y-4">
      {/* ── Header strip — pills + reload + view toggle ──────── */}
      <div className="flex flex-wrap items-center gap-2">
        <Tag color="cyan" className="!flex !items-center !gap-1 !text-[11px] !font-mono">
          <ApiOutlined /> API observatory
        </Tag>
        <Tag color="default" className="!text-[11px] !font-mono">
          {allRows.length} endpoints
        </Tag>
        {useStatus !== 200 && !loading && (
          <Tag color="orange" className="!text-[10px] !font-mono">
            metrics offline
          </Tag>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Segmented
            size="small"
            value={view}
            onChange={setView}
            options={[
              { value: 'overview', label: <span className="inline-flex items-center gap-1"><DashboardOutlined /> Overview</span> },
              { value: 'detail',   label: <span className="inline-flex items-center gap-1"><BarsOutlined /> Detail</span>, disabled: !selected },
            ]}
          />
          <Button
            variant="subtle"
            size="small"
            onClick={loadAll}
            disabled={loading}
          >
            <ReloadOutlined spin={loading} /> Reload
          </Button>
        </div>
      </div>

      {/* Field helper: what the user is looking at + how it's sourced. */}
      <p className="text-[11px] text-gray-500 font-mono leading-relaxed">
        Every endpoint mounted by the backend, plus 24h aggregated metrics.
        Upstream hosts shown as hostname only; secrets never leave the server.
      </p>

      {/* ── Category filter chips ────────────────────────────── */}
      {!catalogMissing && (
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_ORDER.map(c => {
            const active = category === c
            const count = c === 'All'
              ? allRows.length
              : allRows.filter(r => (r.category || '').toLowerCase() === c.toLowerCase()).length
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={[
                  'px-2.5 py-1 rounded-full border font-mono text-[10px] transition-colors flex items-center gap-1.5 font-bold',
                  active
                    ? 'bg-amber-500/15 border-amber-400/40 text-amber-200'
                    : 'bg-white/[0.02] border-white/10 text-gray-400 hover:text-gray-200 hover:border-white/20',
                ].join(' ')}
              >
                {c}
                <span className={active ? 'text-amber-300/70' : 'text-gray-600'}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Body ─────────────────────────────────────────────── */}
      {loading && !catalog ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
          <ReloadOutlined spin className="text-amber-300 text-2xl mb-2" />
          <div className="text-xs text-gray-400 font-mono">Loading API catalog…</div>
        </div>
      ) : catalogMissing ? (
        <WaitingForBackend
          status={catStatus}
          message={catError}
          onRetry={loadAll}
        />
      ) : view === 'detail' && selected ? (
        <>
          <ApiDetailPane endpoint={selected} onBack={handleBack} />
          <div className="pt-2">
            <div className="text-[11px] font-bold text-gray-400 mb-2 uppercase tracking-wider">
              All endpoints
            </div>
            <ApisTable
              rows={rows}
              onSelect={handleSelect}
              selectedPath={selected?.path}
            />
          </div>
        </>
      ) : (
        <>
          <ApisOverview rows={rows} usage={usage} />
          <div className="pt-2">
            <div className="text-[11px] font-bold text-gray-400 mb-2 uppercase tracking-wider">
              All endpoints · {category}
            </div>
            <ApisTable
              rows={rows}
              onSelect={handleSelect}
              selectedPath={selected?.path}
            />
          </div>
        </>
      )}

      {/* ── Soft metrics warning ─────────────────────────────── */}
      {!loading && catalog && useStatus !== 200 && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-500/[0.03] p-2.5 text-[10px] text-amber-200/80 font-mono flex items-center gap-2">
          <WarningOutlined className="text-amber-300" />
          <span>
            Aggregated metrics endpoint isn't live yet. Catalog is shown without call counts + latency.
          </span>
          <Button variant="ghost" size="small" onClick={loadAll} className="!ml-auto">
            <ReloadOutlined /> Retry
          </Button>
        </div>
      )}
    </div>
  )
}
