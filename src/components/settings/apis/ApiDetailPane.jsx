// Endpoint detail view — the "View 2" of the APIs tab.
//
// Shows path + method + category, redacted upstream (hostname only),
// auth / rate limit / cache TTL, params list, 24h p50 + p95 latency,
// 24h volume, recent errors list, and a "Test" button that fires a
// sample request with the example params baked into the catalog entry
// and renders the response inline.

import { useState, useMemo } from 'react'
import { Tag, Tooltip, Empty } from 'antd'
import {
  ArrowLeftOutlined, SafetyOutlined, ClockCircleOutlined,
  ThunderboltOutlined, LinkOutlined, PlayCircleOutlined,
  WarningOutlined, KeyOutlined,
} from '@ant-design/icons'
import { Button } from '../../ui'
import LineChart from './charts/LineChart'
import { notice } from '../../../lib/notice'

const BE_URL = import.meta.env.VITE_BE_URL || 'http://localhost:4001'

// Hostname-only redaction. Never leak the full upstream URL.
function hostOnly(upstream) {
  if (!upstream) return 'not proxied'
  try {
    if (/^https?:\/\//i.test(upstream)) return new URL(upstream).hostname
    return upstream
  } catch { return upstream }
}
function displayPath(path) {
  if (!path) return '—'
  return String(path).replace(/^\/api\//, '').replace(/^\//, '')
}
function fmtTtl(secs) {
  if (secs == null || !Number.isFinite(Number(secs))) return 'none'
  const s = Number(secs)
  if (s === 0) return 'none'
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)} min`
  return `${Math.round(s / 3600)} h`
}
function fmtTime(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return String(iso)
    return `${d.toLocaleDateString()} ${d.toTimeString().slice(0, 8)}`
  } catch { return String(iso) }
}

// A single stat pill used along the top of the detail header.
function InfoPill({ icon, label, value, tint = 'gray' }) {
  const tintMap = {
    gray:    'bg-white/[0.04] text-gray-300 border-white/10',
    amber:   'bg-amber-500/10 text-amber-300 border-amber-400/30',
    cyan:    'bg-cyan-500/10 text-cyan-300 border-cyan-400/30',
    emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-400/30',
    rose:    'bg-rose-500/10 text-rose-300 border-rose-400/30',
  }[tint]
  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-[10px] ${tintMap}`}>
      {icon}
      <span className="text-gray-500 uppercase tracking-wider font-bold">{label}</span>
      <span className="text-gray-100">{value}</span>
    </div>
  )
}

function Panel({ title, subtitle, children, right }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
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

export default function ApiDetailPane({ endpoint, onBack }) {
  const [testing, setTesting]     = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [testError, setTestError] = useState(null)

  if (!endpoint) {
    return (
      <Panel title="No endpoint selected" subtitle="Pick a row from the table to inspect it.">
        <Empty description={<span className="text-xs text-gray-500 font-bold">Nothing to show.</span>} />
      </Panel>
    )
  }

  const params = endpoint.params || []
  const examples = endpoint.examples || {}
  const recentErrors = endpoint.recentErrors || []

  // Combine p50 + p95 into one series for the latency chart when both are
  // present. Falls back to whichever is provided.
  const latencyData = useMemo(() => {
    const h = endpoint.hourly || []
    const p50 = endpoint.hourlyP50 || []
    const p95 = endpoint.hourlyP95 || []
    const len = Math.max(h.length, p50.length, p95.length)
    if (len === 0) return []
    return Array.from({ length: len }, (_, i) => ({
      label: `${String(i).padStart(2, '0')}:00`,
      p50: p50[i] ?? null,
      p95: p95[i] ?? null,
    }))
  }, [endpoint])

  const volumeData = useMemo(() => {
    const h = endpoint.hourly || []
    return h.map((v, i) => ({ label: `${String(i).padStart(2, '0')}:00`, calls: v || 0 }))
  }, [endpoint])

  // Test button — build a URL from examples, fire GET or POST, render JSON.
  const runTest = async () => {
    setTesting(true)
    setTestResult(null)
    setTestError(null)
    try {
      const path = endpoint.path
      let url = `${BE_URL}${path}`
      const method = (endpoint.method || 'GET').toUpperCase()
      const opts = {
        method,
        headers: { 'Content-Type': 'application/json' },
      }
      // Vault-gated endpoints — attach the JWT.
      try {
        const t = localStorage.getItem('sid-vault-token')
        if (t) opts.headers.Authorization = `Bearer ${t}`
      } catch {}
      if (method === 'GET') {
        // Serialize examples as query string.
        const qs = new URLSearchParams()
        Object.entries(examples).forEach(([k, v]) => {
          if (v != null) qs.set(k, String(v))
        })
        const query = qs.toString()
        if (query) url += (path.includes('?') ? '&' : '?') + query
      } else {
        opts.body = JSON.stringify(examples)
      }
      const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(15000) })
      const contentType = res.headers.get('content-type') || ''
      let body
      if (contentType.includes('application/json')) {
        body = await res.json()
      } else {
        const text = await res.text()
        body = { _raw: text.slice(0, 4000) }
      }
      setTestResult({ status: res.status, ok: res.ok, body })
      if (res.ok) notice.success(`Test → ${res.status}`)
      else       notice.warning(`Test → ${res.status}`)
    } catch (err) {
      setTestError(err.message || 'Request failed')
      notice.error(`Test failed: ${err.message}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* ── Header ────────────────────────────────────────── */}
      <div className="rounded-2xl border border-amber-400/30 bg-amber-500/[0.04] p-3">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <Button variant="subtle" size="small" onClick={onBack}>
            <ArrowLeftOutlined /> Back to overview
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="primary"
              size="small"
              onClick={runTest}
              disabled={testing}
            >
              <PlayCircleOutlined /> {testing ? 'Testing…' : 'Send test request'}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Tag color={endpoint.method === 'POST' ? 'gold' : endpoint.method === 'DELETE' ? 'red' : 'blue'} className="!m-0 !text-[10px] !font-mono">
            {endpoint.method || 'GET'}
          </Tag>
          <span className="font-mono text-sm text-gray-100 break-all">
            {displayPath(endpoint.path)}
          </span>
          {endpoint.category && (
            <Tag color="purple" className="!m-0 !text-[10px] !font-mono">{endpoint.category}</Tag>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <InfoPill
            icon={<LinkOutlined />}
            label="Upstream"
            value={hostOnly(endpoint.upstream)}
            tint="cyan"
          />
          <InfoPill
            icon={<KeyOutlined />}
            label="Auth"
            value={endpoint.auth || 'public'}
            tint={endpoint.auth ? 'amber' : 'gray'}
          />
          <InfoPill
            icon={<SafetyOutlined />}
            label="Rate limit"
            value={endpoint.rateLimit || 'none'}
            tint="gray"
          />
          <InfoPill
            icon={<ThunderboltOutlined />}
            label="Cache TTL"
            value={fmtTtl(endpoint.cacheTtl)}
            tint="emerald"
          />
        </div>
        {endpoint.description && (
          <p className="text-xs text-gray-400 mt-3 leading-relaxed">
            {endpoint.description}
          </p>
        )}
      </div>

      {/* ── Params + Charts row ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Panel
          title="Parameters"
          subtitle={params.length ? `${params.length} param${params.length === 1 ? '' : 's'}` : 'No params required'}
        >
          {params.length === 0 ? (
            <div className="text-[11px] text-gray-500 py-4 text-center font-mono">No params</div>
          ) : (
            <div className="space-y-2 max-h-[280px] overflow-auto">
              {params.map((p, i) => (
                <div key={p.name || i} className="rounded-lg border border-white/10 bg-black/30 p-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono text-[11px] text-amber-300">{p.name}</span>
                    <Tag color="default" className="!text-[9px] !font-mono !m-0 !px-1.5">{p.type || 'string'}</Tag>
                    {p.required && (
                      <Tag color="red" className="!text-[9px] !font-mono !m-0 !px-1.5">required</Tag>
                    )}
                  </div>
                  {p.description && (
                    <p className="text-[10px] text-gray-500 font-mono mt-1">{p.description}</p>
                  )}
                  {(p.example != null || examples[p.name] != null) && (
                    <div className="text-[10px] text-gray-400 font-mono mt-1">
                      <span className="text-gray-600">example:</span>{' '}
                      <span className="text-cyan-300">{String(p.example ?? examples[p.name])}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Latency · last 24h"
          subtitle="p50 + p95 response time (ms)."
        >
          <LineChart
            data={latencyData}
            xKey="label"
            series={[
              { key: 'p50', name: 'p50', color: '#f59e0b' },
              { key: 'p95', name: 'p95', color: '#f43f5e' },
            ]}
            height={200}
          />
        </Panel>

        <Panel
          title="Call volume · last 24h"
          subtitle="Requests per hour."
        >
          <LineChart
            data={volumeData}
            xKey="label"
            series={[{ key: 'calls', name: 'Calls', color: '#d946ef' }]}
            height={200}
            showLegend={false}
          />
        </Panel>
      </div>

      {/* ── Recent errors ─────────────────────────────────── */}
      <Panel
        title="Recent errors"
        subtitle="Last 20 failed responses."
        right={
          recentErrors.length > 0
            ? <Tag color="red" className="!text-[10px] !font-mono !m-0">{recentErrors.length}</Tag>
            : <Tag color="green" className="!text-[10px] !font-mono !m-0">clean</Tag>
        }
      >
        {recentErrors.length === 0 ? (
          <div className="text-[11px] text-gray-500 py-4 text-center font-mono">No recent errors.</div>
        ) : (
          <div className="max-h-[260px] overflow-auto rounded-lg border border-white/5">
            <table className="w-full text-[11px]">
              <thead className="bg-white/[0.03] border-b border-white/10 sticky top-0">
                <tr>
                  <th className="text-left px-2 py-1.5 font-mono text-[10px] text-gray-400 uppercase tracking-wider font-bold">When</th>
                  <th className="text-left px-2 py-1.5 font-mono text-[10px] text-gray-400 uppercase tracking-wider font-bold">Status</th>
                  <th className="text-left px-2 py-1.5 font-mono text-[10px] text-gray-400 uppercase tracking-wider font-bold">Message</th>
                </tr>
              </thead>
              <tbody>
                {recentErrors.slice(0, 20).map((e, i) => (
                  <tr key={i} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
                    <td className="px-2 py-1 font-mono text-[10px] text-gray-400">
                      {fmtTime(e.timestamp || e.at)}
                    </td>
                    <td className="px-2 py-1 font-mono text-[10px]">
                      <Tag color={e.status >= 500 ? 'red' : e.status >= 400 ? 'orange' : 'default'} className="!text-[9px] !font-mono !m-0 !px-1.5">
                        {e.status || '—'}
                      </Tag>
                    </td>
                    <td className="px-2 py-1 font-mono text-[10px] text-gray-300 max-w-[420px] truncate">
                      <Tooltip title={e.message || e.error}>
                        {e.message || e.error || '—'}
                      </Tooltip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* ── Test result ───────────────────────────────────── */}
      {(testResult || testError) && (
        <Panel
          title="Test response"
          subtitle="Live response from the endpoint."
          right={
            testResult
              ? <Tag color={testResult.ok ? 'green' : 'red'} className="!text-[10px] !font-mono !m-0">
                  {testResult.status}
                </Tag>
              : <Tag color="red" className="!text-[10px] !font-mono !m-0">error</Tag>
          }
        >
          {testError ? (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-rose-200 text-xs font-mono">
              <WarningOutlined className="mr-1" /> {testError}
            </div>
          ) : (
            <pre className="font-mono text-[10px] leading-relaxed bg-black/40 border border-white/10 p-2 rounded-lg max-h-[320px] overflow-auto whitespace-pre-wrap break-all text-gray-200">
              {(() => {
                try { return JSON.stringify(testResult.body, null, 2) }
                catch { return String(testResult.body) }
              })()}
            </pre>
          )}
        </Panel>
      )}
    </div>
  )
}
