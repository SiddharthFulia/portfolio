import { useState, useEffect, useRef, useMemo } from 'react'
import { Modal, message as antMessage, InputNumber, Select } from 'antd'
import { LockOutlined, ReloadOutlined, DatabaseOutlined, CloudServerOutlined, ApiOutlined, ClusterOutlined } from '@ant-design/icons'
import VaultGate from '../components/VaultGate'
import {
  adminServerStats, adminDbStats, adminQueueStats, adminWorkers, adminPurgeQueue,
} from '../api/ai'

// /settings — Vault-gated admin dashboard. Intentionally NOT in the public
// nav; only the password-holder navigates here directly. Mirrors the
// Deepfake.jsx pattern: outer VaultGate wraps an inner component that
// runs the actual UI once the JWT is in localStorage.

const DEFAULT_POLL_MS = 2000
const MIN_POLL_MS     = 100
const POLL_STORAGE_KEY = 'sid-settings-poll-ms'

function fmtUptime(secs) {
  if (!secs || secs < 0) return '—'
  const s = Math.floor(secs)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h <= 0) return `${m}m`
  return `${h}h ${m}m`
}

function fmtBytes(b) {
  if (!b) return '0 MB'
  const mb = b / (1024 * 1024)
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return `${d.toLocaleDateString()} ${d.toTimeString().slice(0, 8)}`
}

function SettingsInner() {
  const [server, setServer] = useState(null)
  const [dbStats, setDbStats] = useState(null)
  const [queues, setQueues] = useState(null)
  const [workers, setWorkers] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const timerRef = useRef(null)
  // Poll-interval control. Stored as raw ms so the timer can use it
  // directly; the UI splits it into "value + unit" for display. Persists
  // across reloads so the user's preference sticks.
  const [pollMs, setPollMs] = useState(() => {
    try {
      const stored = parseInt(localStorage.getItem(POLL_STORAGE_KEY) || '', 10)
      if (Number.isFinite(stored) && stored >= MIN_POLL_MS) return stored
    } catch {}
    return DEFAULT_POLL_MS
  })
  const [pollUnit, setPollUnit] = useState(() => {
    // Default unit: ms if the value is non-integer-seconds, else s.
    const init = (() => {
      try {
        const stored = parseInt(localStorage.getItem(POLL_STORAGE_KEY) || '', 10)
        return Number.isFinite(stored) ? stored : DEFAULT_POLL_MS
      } catch { return DEFAULT_POLL_MS }
    })()
    return init >= 1000 && init % 1000 === 0 ? 's' : 'ms'
  })
  const pollValue = useMemo(() => pollUnit === 's' ? pollMs / 1000 : pollMs, [pollMs, pollUnit])
  const minForUnit = pollUnit === 's' ? 0.1 : MIN_POLL_MS

  useEffect(() => { document.title = 'Settings · Sid' }, [])

  const tick = async () => {
    // Fire all four in parallel — each helper already returns { data, error }
    // so a single failing endpoint doesn't break the others.
    const [s, d, q, w] = await Promise.all([
      adminServerStats(),
      adminDbStats(),
      adminQueueStats(),
      adminWorkers(),
    ])
    if (s.data) setServer(s.data)
    if (d.data) setDbStats(d.data)
    if (q.data) setQueues(q.data)
    if (w.data) setWorkers(w.data?.workers || [])
    // Track the worst error so the user knows something's off, but keep
    // rendering stale data from the cards that did succeed.
    const firstErr = s.error || d.error || q.error || w.error || null
    setErr(firstErr)
    setLoading(false)
  }

  useEffect(() => {
    tick()
    timerRef.current = setInterval(tick, pollMs)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollMs])

  // Persist whichever ms value the user lands on.
  useEffect(() => {
    try { localStorage.setItem(POLL_STORAGE_KEY, String(pollMs)) } catch {}
  }, [pollMs])

  const handlePollValueChange = (v) => {
    if (v == null || Number.isNaN(v)) return
    const ms = pollUnit === 's' ? Math.round(v * 1000) : Math.round(v)
    if (ms < MIN_POLL_MS) {
      setPollMs(MIN_POLL_MS)
    } else {
      setPollMs(ms)
    }
  }

  const confirmPurge = (queue) => {
    Modal.confirm({
      title: `Purge ${queue}?`,
      content: `This discards every message currently in ${queue}. Workers won't see them. This can't be undone.`,
      okText: 'Purge',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        const { data, error } = await adminPurgeQueue(queue)
        if (error) {
          antMessage.error(`Purge failed: ${error}`)
        } else {
          antMessage.success(`Purged ${data?.purged ?? 0} messages from ${queue}`)
          await tick()
        }
      },
    })
  }

  return (
    <div className="min-h-screen bg-black text-gray-100 pt-20 pb-16 px-3 sm:px-6" style={{ fontVariantNumeric: 'tabular-nums' }}>
      <div className="max-w-6xl mx-auto">
        <header className="mb-6">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <LockOutlined className="text-cyan-400 text-xl" />
            <h1 className="text-2xl sm:text-4xl font-bold leading-tight pb-1 bg-gradient-to-r from-cyan-300 via-fuchsia-400 to-amber-300 bg-clip-text text-transparent">
              Settings
            </h1>
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border border-cyan-500/40 bg-cyan-500/10 text-cyan-300">
              Vault · Admin
            </span>
            {loading && (
              <span className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1">
                <ReloadOutlined spin /> loading
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400">
            Admin only — Sid's monitoring panel.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-gray-500">Poll every</span>
            <InputNumber
              size="small"
              value={pollValue}
              min={minForUnit}
              step={pollUnit === 's' ? 0.1 : 100}
              onChange={handlePollValueChange}
              className="!w-24"
            />
            <Select
              size="small"
              value={pollUnit}
              onChange={(u) => setPollUnit(u)}
              options={[
                { value: 'ms', label: 'ms' },
                { value: 's',  label: 's' },
              ]}
              className="!w-20"
            />
            <span className="text-[10px] uppercase tracking-wider text-gray-600">
              (min 100ms · resolves to {pollMs} ms)
            </span>
          </div>
          {err && (
            <p className="text-rose-400 text-xs mt-2 font-mono">✗ {err}</p>
          )}
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ServerCard data={server} />
          <DatabaseCard data={dbStats} />
          <QueuesCard data={queues} onPurge={confirmPurge} />
          <WorkersCard rows={workers} />
        </div>
      </div>
    </div>
  )
}

// ─── Server card ──────────────────────────────────────────────
function ServerCard({ data }) {
  const used = data?.memUsedPercent ?? 0
  const usedMB = data ? (data.memTotalMB - data.memFreeMB) : 0
  return (
    <Card icon={<CloudServerOutlined />} title="Server" accent="cyan">
      {!data ? <Empty /> : (
        <div className="space-y-3 text-sm">
          <Row label="Host" value={`${data.hostname}`} />
          <Row label="Platform" value={`${data.platform} · ${data.arch}`} />
          <Row label="CPU cores" value={`${data.cpuCount}`} />
          <Row label="Load avg (1m/5m/15m)"
            value={(data.loadAvg || []).map(n => Number(n).toFixed(2)).join(' · ') || '—'} />
          <Row label="Uptime (process)" value={fmtUptime(data.uptime)} />

          <div>
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-gray-500 mb-1">
              <span>RAM</span>
              <span className="font-mono text-gray-300">{usedMB} / {data.memTotalMB} MB · {used}%</span>
            </div>
            <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-fuchsia-400 to-amber-300 transition-[width] duration-500"
                style={{ width: `${Math.max(2, Math.min(100, used))}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

// ─── Database card ────────────────────────────────────────────
function DatabaseCard({ data }) {
  const tables = data?.tables || []
  return (
    <Card icon={<DatabaseOutlined />} title="Database" accent="fuchsia">
      {!data ? <Empty /> : (
        <div className="space-y-3">
          <Row label="File size" value={fmtBytes(data.sizeBytes)} />
          <div className="border-t border-gray-800 pt-2">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
              Tables ({tables.length})
            </div>
            <div>
              <table className="w-full text-xs">
                <tbody>
                  {tables.map(t => (
                    <tr key={t.name} className="border-b border-gray-900 last:border-0">
                      <td className="py-1 text-gray-400 font-mono">{t.name}</td>
                      <td className="py-1 text-right text-gray-200 font-mono">{t.rows.toLocaleString()}</td>
                    </tr>
                  ))}
                  {tables.length === 0 && (
                    <tr><td colSpan={2} className="text-xs text-gray-500 py-3 text-center">No tables found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

// ─── Queues card ──────────────────────────────────────────────
function QueuesCard({ data, onPurge }) {
  return (
    <Card icon={<ApiOutlined />} title="Queues (RabbitMQ)" accent="amber">
      {!data ? <Empty /> : data.configured === false ? (
        <p className="text-xs text-gray-500 py-4 text-center">
          RABBITMQ_URL not configured on this BE.
        </p>
      ) : (
        <div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-gray-500">
                <th className="text-left font-medium py-1">Queue</th>
                <th className="text-right font-medium py-1">Msg</th>
                <th className="text-right font-medium py-1">Cons</th>
                <th className="text-right font-medium py-1 w-14">Act</th>
              </tr>
            </thead>
            <tbody>
              {(data.queues || []).map(q => (
                <tr key={q.name} className="border-b border-gray-900 last:border-0">
                  <td className="py-1.5 text-gray-300 font-mono">{q.name}</td>
                  <td className="py-1.5 text-right font-mono">
                    <span className={q.messageCount > 0 ? 'text-amber-300' : 'text-gray-500'}>
                      {q.messageCount.toLocaleString()}
                    </span>
                  </td>
                  <td className="py-1.5 text-right font-mono">
                    <span className={q.consumerCount > 0 ? 'text-emerald-300' : 'text-gray-600'}>
                      {q.consumerCount}
                    </span>
                  </td>
                  <td className="py-1.5 text-right">
                    {q.messageCount > 0 ? (
                      <button onClick={() => onPurge(q.name)}
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300">
                        Purge
                      </button>
                    ) : (
                      <span className="text-[10px] text-gray-700">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {(!data.queues || data.queues.length === 0) && (
                <tr><td colSpan={4} className="text-xs text-gray-500 py-3 text-center">No queues found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

// ─── Workers card ─────────────────────────────────────────────
function WorkersCard({ rows }) {
  return (
    <Card icon={<ClusterOutlined />} title="Workers" accent="emerald">
      {!rows ? <Empty /> : rows.length === 0 ? (
        <p className="text-xs text-gray-500 py-4 text-center">
          No worker heartbeats recorded.
        </p>
      ) : (
        <div className="space-y-1.5">
          {rows.map(w => (
            <div key={w.id || `${w.role}-${w.lastSeenAt}`}
              className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-gray-900/40 border border-gray-800">
              <div className="min-w-0">
                <p className="text-xs text-gray-200 font-mono truncate">{w.id || '—'}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                  {w.role || w.kind || 'worker'}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] text-gray-400 font-mono">{fmtDate(w.lastSeenAt)}</p>
                {w.status && (
                  <p className="text-[10px] text-emerald-300 uppercase tracking-wider">{w.status}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ─── Generic card chrome ──────────────────────────────────────
function Card({ icon, title, accent, children }) {
  const accentMap = {
    cyan:    'from-cyan-500/20 via-cyan-500/5 to-transparent text-cyan-300 border-cyan-500/30',
    fuchsia: 'from-fuchsia-500/20 via-fuchsia-500/5 to-transparent text-fuchsia-300 border-fuchsia-500/30',
    amber:   'from-amber-500/20 via-amber-500/5 to-transparent text-amber-300 border-amber-500/30',
    emerald: 'from-emerald-500/20 via-emerald-500/5 to-transparent text-emerald-300 border-emerald-500/30',
  }
  const a = accentMap[accent] || accentMap.cyan
  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-950/60 overflow-hidden">
      <header className={`px-4 py-2.5 border-b border-gray-800 bg-gradient-to-r ${a} flex items-center gap-2`}>
        <span className="text-base">{icon}</span>
        <h2 className="text-sm font-semibold uppercase tracking-wider">{title}</h2>
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-gray-500 uppercase tracking-wider text-[10px]">{label}</span>
      <span className="text-gray-200 font-mono truncate">{value}</span>
    </div>
  )
}

function Empty() {
  return <p className="text-xs text-gray-600 py-4 text-center">Loading…</p>
}

export default function Settings() {
  return (
    <VaultGate
      label="Settings"
      subtitle="Admin only · Sid's monitoring panel · server, DB, queues, workers"
    >
      <SettingsInner />
    </VaultGate>
  )
}
