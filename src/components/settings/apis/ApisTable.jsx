// Endpoint browser table for the APIs tab.
//
// Sortable columns · row hover · row click opens detail view · paginated
// once we cross 50 rows · sparkline column showing per-hour call counts
// for the last 24h. The catalog + usage props are merged inside the
// container — this component just renders the fused rows.
//
// Rows are the catalog entries with .metrics attached. Every metric field
// tolerates undefined so we don't crash while the BE is still warming up.

import { useMemo, useState } from 'react'
import { Empty, Input, Pagination, Tag, Tooltip } from 'antd'
import { CaretDownOutlined, CaretUpOutlined, SearchOutlined } from '@ant-design/icons'
import Sparkline from './charts/Sparkline'

// Category → chip color. Falls back to default for anything we haven't
// hand-tinted; keeps the table readable without a rainbow explosion.
const CATEGORY_TINT = {
  OSINT:     'blue',
  NASA:      'geekblue',
  Proxy:     'purple',
  AI:        'gold',
  Chess:     'lime',
  Admin:     'red',
  Agents:    'volcano',
  Physics:   'cyan',
  Vision:    'magenta',
  Games:     'orange',
  Room:      'green',
  Cinema:    'gold',
  QR:        'default',
  Audio:     'default',
  Video:     'default',
  Mesh:      'default',
  Combine:   'default',
  YTDL:      'default',
  Chernobyl: 'default',
}

// Extract hostname only — never expose the full upstream URL. If the
// value is already just a hostname or blank, return it as-is.
function hostOnly(upstream) {
  if (!upstream) return '—'
  try {
    // If it looks like a URL, parse it
    if (/^https?:\/\//i.test(upstream)) {
      return new URL(upstream).hostname
    }
    return upstream
  } catch { return upstream }
}

// Strip the leading /api/ so labels don't leak the routing prefix.
function displayPath(path) {
  if (!path) return '—'
  return String(path).replace(/^\/api\//, '').replace(/^\//, '')
}

function fmtNum(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  return Number(n).toLocaleString()
}
function fmtPct(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  return `${Number(n).toFixed(1)}%`
}
function fmtMs(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  return `${Math.round(Number(n))} ms`
}
function fmtTtl(secs) {
  if (secs == null || !Number.isFinite(Number(secs))) return '—'
  const s = Number(secs)
  if (s === 0) return 'none'
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  return `${Math.round(s / 3600)}h`
}

const COLUMNS = [
  { key: 'path',      label: 'Endpoint',    align: 'left',  sortable: true,  width: 'auto' },
  { key: 'category',  label: 'Category',    align: 'left',  sortable: true,  width: 100 },
  { key: 'upstream',  label: 'Upstream',    align: 'left',  sortable: true,  width: 140 },
  { key: 'auth',      label: 'Auth',        align: 'left',  sortable: true,  width: 80 },
  { key: 'cacheTtl',  label: 'Cache TTL',   align: 'right', sortable: true,  width: 90 },
  { key: 'calls24h',  label: 'Calls 24h',   align: 'right', sortable: true,  width: 100 },
  { key: 'sparkline', label: 'Trend',       align: 'left',  sortable: false, width: 80 },
  { key: 'avgMs',     label: 'Avg latency', align: 'right', sortable: true,  width: 110 },
  { key: 'errorRate', label: 'Error rate',  align: 'right', sortable: true,  width: 100 },
  { key: 'cacheHit',  label: 'Cache hit',   align: 'right', sortable: true,  width: 100 },
]

const PAGE_SIZE = 25

export default function ApisTable({ rows = [], onSelect, selectedPath }) {
  const [search, setSearch]   = useState('')
  const [sortKey, setSortKey] = useState('calls24h')
  const [sortDir, setSortDir] = useState('desc')
  const [page, setPage]       = useState(1)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r =>
      (r.path || '').toLowerCase().includes(q) ||
      (r.category || '').toLowerCase().includes(q) ||
      (r.upstream || '').toLowerCase().includes(q)
    )
  }, [rows, search])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      // Nulls sort last regardless of direction.
      const an = av == null || av === '' || Number.isNaN(av)
      const bn = bv == null || bv === '' || Number.isNaN(bv)
      if (an && bn) return 0
      if (an) return 1
      if (bn) return -1
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'desc' ? bv - av : av - bv
      }
      const cmp = String(av).localeCompare(String(bv))
      return sortDir === 'desc' ? -cmp : cmp
    })
    return arr
  }, [filtered, sortKey, sortDir])

  const paged = useMemo(() => {
    if (sorted.length <= PAGE_SIZE * 2) return sorted
    const start = (page - 1) * PAGE_SIZE
    return sorted.slice(start, start + PAGE_SIZE)
  }, [sorted, page])

  const showPagination = sorted.length > 50

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortKey(key); setSortDir('desc')
    }
    setPage(1)
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="font-mono text-[11px] text-gray-400">
          {filtered.length.toLocaleString()} endpoint{filtered.length === 1 ? '' : 's'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Input
            allowClear
            size="small"
            placeholder="Filter by path or upstream…"
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="!w-64"
          />
        </div>
      </div>

      {sorted.length === 0 ? (
        <Empty description={<span className="text-xs text-gray-500 font-bold">No endpoints match.</span>} />
      ) : (
        <div className="overflow-auto max-h-[55vh] rounded-lg border border-white/5">
          <table className="w-full text-[11px]">
            <thead className="bg-white/[0.03] border-b border-white/10 sticky top-0 z-10 backdrop-blur">
              <tr>
                {COLUMNS.map(c => {
                  const active = sortKey === c.key
                  return (
                    <th
                      key={c.key}
                      className={[
                        'px-2 py-1.5 font-mono text-[10px] text-gray-400 uppercase tracking-wider whitespace-nowrap font-bold',
                        c.align === 'right' ? 'text-right' : 'text-left',
                      ].join(' ')}
                      style={c.width && c.width !== 'auto' ? { width: c.width } : undefined}
                    >
                      {c.sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(c.key)}
                          className={active ? 'text-amber-300 inline-flex items-center gap-0.5' : 'hover:text-gray-200 inline-flex items-center gap-0.5'}
                        >
                          {c.label}
                          {active && (sortDir === 'desc'
                            ? <CaretDownOutlined className="text-[9px]" />
                            : <CaretUpOutlined   className="text-[9px]" />)}
                        </button>
                      ) : c.label}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {paged.map((row, i) => {
                const isSelected = selectedPath && row.path === selectedPath
                const errRate = row.errorRate
                const errTint =
                  errRate == null ? 'text-gray-500' :
                  errRate >= 5    ? 'text-rose-300' :
                  errRate >= 1    ? 'text-amber-300' :
                                    'text-emerald-300'
                return (
                  <tr
                    key={`${row.method}-${row.path}-${i}`}
                    onClick={() => onSelect?.(row)}
                    className={[
                      'border-b border-white/[0.04] last:border-0 cursor-pointer transition-colors',
                      isSelected
                        ? 'bg-amber-500/10 hover:bg-amber-500/15'
                        : 'hover:bg-white/[0.03]',
                    ].join(' ')}
                  >
                    <td className="px-2 py-1.5 align-middle">
                      <div className="flex items-center gap-1.5">
                        <Tag color={row.method === 'POST' ? 'gold' : row.method === 'DELETE' ? 'red' : 'blue'} className="!m-0 !text-[9px] !font-mono !leading-tight !px-1.5">
                          {row.method || 'GET'}
                        </Tag>
                        <Tooltip title={row.path}>
                          <span className="font-mono text-[11px] text-gray-200 truncate max-w-[240px] inline-block align-middle">
                            {displayPath(row.path)}
                          </span>
                        </Tooltip>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 align-middle">
                      <Tag color={CATEGORY_TINT[row.category] || 'default'} className="!m-0 !text-[9px] !font-mono !px-1.5">
                        {row.category || '—'}
                      </Tag>
                    </td>
                    <td className="px-2 py-1.5 align-middle text-gray-400 font-mono text-[10px] truncate max-w-[140px]">
                      {hostOnly(row.upstream)}
                    </td>
                    <td className="px-2 py-1.5 align-middle text-[10px] font-mono">
                      {row.auth
                        ? <span className="text-amber-300">{row.auth}</span>
                        : <span className="text-gray-500">none</span>}
                    </td>
                    <td className="px-2 py-1.5 align-middle text-right text-gray-400 font-mono text-[10px]">
                      {fmtTtl(row.cacheTtl)}
                    </td>
                    <td className="px-2 py-1.5 align-middle text-right font-mono tabular-nums text-gray-200">
                      {fmtNum(row.calls24h)}
                    </td>
                    <td className="px-2 py-1.5 align-middle">
                      <Sparkline data={row.hourly || []} />
                    </td>
                    <td className="px-2 py-1.5 align-middle text-right font-mono tabular-nums text-gray-300">
                      {fmtMs(row.avgMs)}
                    </td>
                    <td className={`px-2 py-1.5 align-middle text-right font-mono tabular-nums ${errTint}`}>
                      {fmtPct(row.errorRate)}
                    </td>
                    <td className="px-2 py-1.5 align-middle text-right font-mono tabular-nums text-cyan-300">
                      {fmtPct(row.cacheHit)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showPagination && (
        <div className="mt-3 flex justify-end">
          <Pagination
            size="small"
            current={page}
            pageSize={PAGE_SIZE}
            total={sorted.length}
            showSizeChanger={false}
            onChange={(p) => setPage(p)}
          />
        </div>
      )}
    </div>
  )
}
