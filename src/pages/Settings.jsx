import { useState, useEffect, useRef, useMemo } from 'react'
import { Modal, InputNumber, Select, Tabs, Segmented } from 'antd'
import { notice } from '../lib/notice'
import { LockOutlined, ReloadOutlined, DatabaseOutlined, CloudServerOutlined, ApiOutlined, ClusterOutlined, DashboardOutlined, BarChartOutlined, DeleteOutlined, CheckOutlined } from '@ant-design/icons'
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts'
import VaultGate from '../components/VaultGate'
import {
  adminServerStats, adminDbStats, adminDiskStats, adminQueueStats, adminWorkers, adminPurgeQueue,
  adminActivity, adminMeshStats,
  adminCloudinaryUsage, adminCloudinaryResources, adminCloudinaryDelete,
} from '../api/ai'
import useQueryState from '../hooks/useQueryState'

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
  // ?tab= mirrors the active Tabs key so refreshing or sharing the URL
  // preserves which pane the user was viewing. Defaults to 'overview',
  // which is omitted from the URL so /settings stays clean.
  const [tab, setTab] = useQueryState('tab', 'overview', { allowed: ['overview', 'storage', 'visualize'] })
  const [server, setServer] = useState(null)
  const [dbStats, setDbStats] = useState(null)
  const [diskStats, setDiskStats] = useState(null)
  const [queues, setQueues] = useState(null)
  const [workers, setWorkers] = useState(null)
  // Per-card loading flags so each card renders its own data the
  // moment its endpoint returns — no more waiting for the slowest call
  // (RabbitMQ queue-check) to gate the whole page. `loading` is now a
  // derived "any card still has no data yet" boolean used only for the
  // small spinner pill in the header.
  const [serverLoading,  setServerLoading]  = useState(true)
  const [dbLoading,      setDbLoading]      = useState(true)
  const [diskLoading,    setDiskLoading]    = useState(true)
  const [queuesLoading,  setQueuesLoading]  = useState(true)
  const [workersLoading, setWorkersLoading] = useState(true)
  const [err, setErr] = useState(null)
  // Per-endpoint overlap guards. Each fetch's `finally` releases its
  // own ref, so a slow Queues call doesn't block its sibling fetches.
  const inFlightServer  = useRef(false)
  const inFlightDb      = useRef(false)
  const inFlightDisk    = useRef(false)
  const inFlightQueues  = useRef(false)
  const inFlightWorkers = useRef(false)
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

  // Each endpoint owns its own overlap guard + loading flag. Fire-and-
  // forget on the tick — no Promise.all gating, no single slow call
  // holding up the rest. When an individual call returns, only its
  // card's state updates. The page no longer waits for the queue-check
  // (which can take 5-10s) before showing anything.
  // Distinguish transient browser-level fetch failures (TypeError:
  // Failed to fetch — CORS preflight, BE briefly down, Wi-Fi blip)
  // from real BE-side errors (500 / 401 / 404). The transient kind
  // is shown as a small "Reconnecting…" hint that disappears the
  // moment ANY endpoint succeeds. Real errors stay until the next
  // successful tick. Without this, every single poll cycle stamped
  // "Failed to fetch" into a scary red banner.
  const isTransientNetError = (e) =>
    typeof e === 'string' && (
      e.toLowerCase().includes('failed to fetch') ||
      e.toLowerCase().includes('network') ||
      e.toLowerCase().includes('load failed')
    )
  // Centralized "any endpoint completed" reconcile — keeps the err
  // state from going stale after recovery.
  const reconcile = (data, error) => {
    if (data && err) setErr(null)             // any success clears the banner
    else if (error)  setErr(error)
  }
  const fetchServer = async () => {
    if (inFlightServer.current) return
    inFlightServer.current = true
    try {
      const { data, error } = await adminServerStats()
      if (data) setServer(data)
      reconcile(data, error)
      setServerLoading(false)
    } finally { inFlightServer.current = false }
  }
  const fetchDb = async () => {
    if (inFlightDb.current) return
    inFlightDb.current = true
    try {
      const { data, error } = await adminDbStats()
      if (data) setDbStats(data)
      reconcile(data, error)
      setDbLoading(false)
    } finally { inFlightDb.current = false }
  }
  const fetchDisk = async () => {
    if (inFlightDisk.current) return
    inFlightDisk.current = true
    try {
      const { data, error } = await adminDiskStats()
      if (data) setDiskStats(data)
      reconcile(data, error)
      setDiskLoading(false)
    } finally { inFlightDisk.current = false }
  }
  const fetchQueues = async () => {
    if (inFlightQueues.current) return
    inFlightQueues.current = true
    try {
      const { data, error } = await adminQueueStats()
      if (data) setQueues(data)
      reconcile(data, error)
      setQueuesLoading(false)
    } finally { inFlightQueues.current = false }
  }
  const fetchWorkers = async () => {
    if (inFlightWorkers.current) return
    inFlightWorkers.current = true
    try {
      const { data, error } = await adminWorkers()
      if (data) setWorkers(data?.workers || [])
      reconcile(data, error)
      setWorkersLoading(false)
    } finally { inFlightWorkers.current = false }
  }

  // Aggregate "still loading something" — drives the header spinner pill.
  // The cards themselves show per-section skeletons via their own flags.
  const loading = serverLoading || dbLoading || diskLoading || queuesLoading || workersLoading

  // The fetch fns above are recreated on every render, but the polling
  // loops below need a stable reference. Refs hold the latest version
  // so the loop always calls the most up-to-date closure (matters for
  // any future state captured inside fetchX — today nothing relevant,
  // but keeps the pattern bulletproof for later edits).
  const fetchServerRef  = useRef(fetchServer);  fetchServerRef.current  = fetchServer
  const fetchDbRef      = useRef(fetchDb);      fetchDbRef.current      = fetchDb
  const fetchDiskRef    = useRef(fetchDisk);    fetchDiskRef.current    = fetchDisk
  const fetchQueuesRef  = useRef(fetchQueues);  fetchQueuesRef.current  = fetchQueues
  const fetchWorkersRef = useRef(fetchWorkers); fetchWorkersRef.current = fetchWorkers

  // Per-endpoint poll loops. Each loop awaits its own fetch, sleeps
  // pollMs, fires again. A 5-second Queues call holds up only the
  // Queues card's next refresh — Server / DB / Disk / Workers keep
  // ticking at 2s (or whatever pollMs is) independently. The user's
  // stated contract: "call all others every 2s and wait for this to
  // get called and then wait 2sec for this to get called again."
  useEffect(() => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms))
    let cancelled = false
    const runLoop = async (getFetch) => {
      while (!cancelled) {
        await getFetch()()
        if (cancelled) break
        await sleep(pollMs)
      }
    }
    runLoop(() => fetchServerRef.current)
    runLoop(() => fetchDbRef.current)
    runLoop(() => fetchDiskRef.current)
    runLoop(() => fetchQueuesRef.current)
    runLoop(() => fetchWorkersRef.current)
    return () => { cancelled = true }
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
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      autoFocusButton: 'cancel',
      centered: true,
      onOk: async () => {
        const { data, error } = await adminPurgeQueue(queue)
        if (error) {
          notice.error(`Purge failed: ${error}`)
        } else {
          notice.success(`Purged ${data?.purged ?? 0} messages from ${queue}`)
          // Only the Queues card needs to refresh after a purge — fan-out
          // tick would re-poll everything else for no reason.
          fetchQueues()
        }
      },
    })
  }

  return (
    <div className="min-h-screen bg-black text-gray-100 pt-20 pb-16 px-3 sm:px-6" style={{ fontVariantNumeric: 'tabular-nums' }}>
      <div className="max-w-6xl mx-auto">
        <header className="mb-6">
          <div className="eyebrow-mono mb-2 flex items-center gap-2">
            <LockOutlined className="text-amber-300" />
            // Admin · vault
          </div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <h1 className="text-2xl sm:text-4xl font-bold leading-tight pb-1 text-cyan-300">
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
            isTransientNetError(err) ? (
              // Transient network blip — Oracle BE momentarily
              // unreachable, CORS preflight delayed, browser put
              // the request to sleep. Don't scare the user; the
              // next poll tick recovers on its own.
              <p className="text-amber-300/80 text-xs mt-2 font-mono inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                Reconnecting to backend… (will resume on next successful poll)
              </p>
            ) : (
              <p className="text-rose-400 text-xs mt-2 font-mono">{err}</p>
            )
          )}
        </header>

        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: 'overview',
              label: <span className="text-sm inline-flex items-center gap-1.5"><DashboardOutlined /> Overview</span>,
              children: (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <ServerCard   data={server}  loading={serverLoading} />
                  <DatabaseCard data={dbStats} loading={dbLoading} />
                  <QueuesCard   data={queues}  loading={queuesLoading} onPurge={confirmPurge} />
                  <WorkersCard  rows={workers} loading={workersLoading} />
                </div>
              ),
            },
            {
              key: 'storage',
              label: <span className="text-sm inline-flex items-center gap-1.5"><DatabaseOutlined /> Storage</span>,
              children: <StorageCard data={diskStats} loading={diskLoading} />,
            },
            {
              key: 'visualize',
              label: <span className="text-sm inline-flex items-center gap-1.5"><BarChartOutlined /> Visualize</span>,
              children: <VisualizeTab pollMs={pollMs} />,
            },
            {
              key: 'cloudinary',
              label: <span className="text-sm inline-flex items-center gap-1.5"><CloudServerOutlined /> Cloudinary</span>,
              children: <CloudinaryTab />,
            },
          ]}
        />
      </div>
    </div>
  )
}

// ─── Visualize tab ────────────────────────────────────────────
// Polls /api/admin/activity at the same cadence as the Overview tab
// (pollMs from the outer component). Renders one LineChart per
// non-empty table + a stacked AreaChart of TOTAL activity per day.
//
// Days selector: 7 / 14 / 30. Empty state: "No activity in the last Nd."
const TABLE_COLORS = {
  jobs:            '#06b6d4', // cyan
  videos:          '#d946ef', // fuchsia
  enhanced_images: '#fbbf24', // amber
  lipsync_jobs:    '#34d399', // emerald
  audio_jobs:      '#fb7185', // rose
  mesh_jobs:       '#06b6d4',
  deepfake_jobs:   '#d946ef',
  chess_games:     '#fbbf24',
  chess_matches:   '#34d399',
  games_scores:    '#fb7185',
  chat_messages:   '#06b6d4',
}
const FALLBACK_PALETTE = ['#06b6d4', '#d946ef', '#fbbf24', '#34d399', '#fb7185']

function colorForTable(table, idx) {
  return TABLE_COLORS[table] || FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length]
}

function fmtMd(day) {
  // 'YYYY-MM-DD' → 'M/D'. Fallback to raw string on parse failure.
  if (!day || typeof day !== 'string') return String(day || '')
  const m = day.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return day
  return `${parseInt(m[2], 10)}/${parseInt(m[3], 10)}`
}

function fmtLongDay(day) {
  if (!day || typeof day !== 'string') return String(day || '')
  const d = new Date(`${day}T00:00:00`)
  if (Number.isNaN(d.getTime())) return day
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-950/95 px-3 py-2 text-xs shadow-xl">
      <p className="text-gray-400 mb-1">{fmtLongDay(label)}</p>
      {payload.map((p, i) => (
        <p key={i} className="font-mono" style={{ color: p.color || p.stroke || p.fill }}>
          {p.name}: <span className="text-gray-100">{Number(p.value || 0).toLocaleString()}</span>
        </p>
      ))}
    </div>
  )
}

function VisualizeTab({ pollMs }) {
  // ?days= mirrors the window selector. 14 is the default and stays out
  // of the URL; 7/30 round-trip through the query string.
  const [days, setDays] = useQueryState('days', 14, {
    parse: (s) => Number(s),
    allowed: [7, 14, 30],
  })
  const [activity, setActivity] = useState(null)
  const [meshStats, setMeshStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const timerRef = useRef(null)
  const inFlightRef = useRef(false)

  const fetchActivity = async (n) => {
    // Same overlap-guard as Overview — the activity endpoint runs N table
    // group-by queries and can take a few seconds on Oracle ARM. Mesh
    // stats fire in parallel — cheap aggregate query, never blocks.
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      const [activityRes, meshRes] = await Promise.all([
        adminActivity(n),
        adminMeshStats(),
      ])
      if (activityRes.error) {
        setErr(activityRes.error)
      } else {
        setErr(null)
        setActivity(activityRes.data)
      }
      if (meshRes.data) setMeshStats(meshRes.data)
      setLoading(false)
    } finally {
      inFlightRef.current = false
    }
  }

  // Refetch on days change + on the same poll interval as Overview, but
  // never tighter than 5s — the activity timeseries is heavy and changes
  // slowly, so polling it at 100ms would just waste BE cycles.
  useEffect(() => {
    setLoading(true)
    fetchActivity(days)
    if (timerRef.current) clearInterval(timerRef.current)
    const interval = Math.max(5000, pollMs || 5000)
    timerRef.current = setInterval(() => fetchActivity(days), interval)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [days, pollMs])

  const series = activity?.series || []
  const nonEmpty = useMemo(
    () => series.filter(s => Array.isArray(s.points) && s.points.length > 0),
    [series],
  )

  // Build a unified day-axis for the stacked area chart so every series
  // shares the same x-buckets — missing buckets get filled with 0.
  const stackedData = useMemo(() => {
    const dayMap = new Map() // day → { day, <table>: n, ... }
    for (const s of nonEmpty) {
      for (const p of s.points) {
        const row = dayMap.get(p.day) || { day: p.day }
        row[s.table] = (row[s.table] || 0) + Number(p.n || 0)
        dayMap.set(p.day, row)
      }
    }
    // Sort by day asc, ensure every table key is present (0 fill).
    const sorted = Array.from(dayMap.values()).sort((a, b) => a.day.localeCompare(b.day))
    for (const row of sorted) {
      for (const s of nonEmpty) {
        if (row[s.table] == null) row[s.table] = 0
      }
    }
    return sorted
  }, [nonEmpty])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-gray-500">Window</span>
          <Segmented
            size="small"
            value={days}
            onChange={(v) => setDays(Number(v))}
            options={[
              { value: 7,  label: '7d' },
              { value: 14, label: '14d' },
              { value: 30, label: '30d' },
            ]}
          />
        </div>
        {loading && (
          <span className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1">
            <ReloadOutlined spin /> loading
          </span>
        )}
        {err && (
          // Same transient-vs-real split as Overview — "Failed to fetch"
          // is browser-level (CORS / network / BE restart), not a real
          // error worth scaring the user. Render an amber pulse hint.
          (typeof err === 'string' && (err.toLowerCase().includes('failed to fetch') || err.toLowerCase().includes('network') || err.toLowerCase().includes('load failed')))
            ? (
              <span className="text-amber-300/80 text-xs font-mono inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                Reconnecting…
              </span>
            )
            : <span className="text-rose-400 text-xs font-mono">{err}</span>
        )}
      </div>

      {/* Mesh details — by-status + by-model breakdown + BLOB totals.
          Two Recharts bar charts side by side on lg; stacked on phone.
          The data is independent of the day-window slider above (it's
          all-time aggregates), but lives in this tab so the user has
          one place for "everything about mesh gen". */}
      {meshStats && (meshStats.byStatus || meshStats.byModel) && (
        <MeshDetailsCard meshStats={meshStats} />
      )}

      {nonEmpty.length === 0 ? (
        <Card icon={<DatabaseOutlined />} title="Activity" accent="cyan">
          <p className="text-xs text-gray-500 py-8 text-center">
            No activity in the last {days}d.
          </p>
        </Card>
      ) : (
        <>
          {/* Stacked total — top card spans full width on lg as well. */}
          <Card icon={<ApiOutlined />} title={`Total activity · last ${days}d`} accent="cyan">
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stackedData} margin={{ top: 6, right: 12, left: -8, bottom: 0 }}>
                  <defs>
                    {nonEmpty.map((s, i) => {
                      const c = colorForTable(s.table, i)
                      return (
                        <linearGradient key={s.table} id={`g-${s.table}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={c} stopOpacity={0.85} />
                          <stop offset="95%" stopColor={c} stopOpacity={0.12} />
                        </linearGradient>
                      )
                    })}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="day"
                    tickFormatter={fmtMd}
                    tick={{ fill: '#9ca3af', fontSize: 10 }}
                    stroke="rgba(255,255,255,0.15)"
                  />
                  <YAxis
                    tick={{ fill: '#9ca3af', fontSize: 10 }}
                    stroke="rgba(255,255,255,0.15)"
                    allowDecimals={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 10, color: '#9ca3af' }} />
                  {nonEmpty.map((s, i) => {
                    const c = colorForTable(s.table, i)
                    return (
                      <Area
                        key={s.table}
                        type="monotone"
                        dataKey={s.table}
                        name={s.table}
                        stackId="1"
                        stroke={c}
                        fill={`url(#g-${s.table})`}
                        strokeWidth={1.5}
                      />
                    )
                  })}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* One LineChart per non-empty table, 2-col responsive grid. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {nonEmpty.map((s, i) => {
              const c = colorForTable(s.table, i)
              const total = s.points.reduce((sum, p) => sum + Number(p.n || 0), 0)
              return (
                <Card
                  key={s.table}
                  icon={<DatabaseOutlined />}
                  title={
                    <span className="flex items-center justify-between gap-2 w-full">
                      <span className="font-mono normal-case tracking-normal text-xs">{s.table}</span>
                      <span className="text-[10px] text-gray-400 font-mono">
                        {total.toLocaleString()} total
                      </span>
                    </span>
                  }
                  accent={accentForTable(s.table, i)}
                >
                  <div style={{ width: '100%', height: 200 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={s.points} margin={{ top: 6, right: 12, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis
                          dataKey="day"
                          tickFormatter={fmtMd}
                          tick={{ fill: '#9ca3af', fontSize: 10 }}
                          stroke="rgba(255,255,255,0.15)"
                        />
                        <YAxis
                          tick={{ fill: '#9ca3af', fontSize: 10 }}
                          stroke="rgba(255,255,255,0.15)"
                          allowDecimals={false}
                          width={28}
                        />
                        <Tooltip content={<ChartTooltip />} />
                        <Line
                          type="monotone"
                          dataKey="n"
                          name={s.table}
                          stroke={c}
                          strokeWidth={2}
                          dot={{ r: 2.5, fill: c }}
                          activeDot={{ r: 4 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Mesh details card — Visualize tab ──────────────────────────
// Two Recharts BarCharts (by-status + by-model) on top of a 4-up stat
// row showing GLB BLOB totals (count / total / avg / max). Recent rows
// at the bottom give a click-into-context for whatever's at the top.
// Status colours match the dot-indicator convention used elsewhere on
// the dashboard (emerald = ready, amber = queued/working, rose = failed).
const STATUS_TONE = {
  queued:     '#fbbf24',   // amber
  processing: '#fbbf24',
  completed:  '#34d399',   // emerald
  failed:     '#fb7185',   // rose
}
const MODEL_TONE = {
  'shap-e':     '#22d3ee',
  'tripo':      '#06b6d4',
  'trellis':    '#fbbf24',
  'trellis-v2': '#f59e0b',
  'hunyuan3d':  '#34d399',
}

function MeshDetailsCard({ meshStats }) {
  const byStatusData = Object.entries(meshStats.byStatus || {}).map(([name, count]) => ({ name, count }))
  const byModelData  = Object.entries(meshStats.byModel  || {}).map(([name, count]) => ({ name, count }))
  const blob = meshStats.blob || { count: 0, totalBytes: 0, avgBytes: 0, maxBytes: 0 }
  const recent = Array.isArray(meshStats.recent) ? meshStats.recent : []

  return (
    <Card icon={<DatabaseOutlined />} title="Mesh details" accent="amber">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* By status */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">By status</p>
          {byStatusData.length === 0 ? (
            <p className="text-xs text-gray-500 py-6 text-center">No mesh jobs yet.</p>
          ) : (
            <div style={{ width: '100%', height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byStatusData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={{ stroke: '#1f2937' }} tickLine={false} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={{ stroke: '#1f2937' }} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {byStatusData.map(entry => (
                      <Cell key={entry.name} fill={STATUS_TONE[entry.name] || '#94a3b8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* By model */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">By engine</p>
          {byModelData.length === 0 ? (
            <p className="text-xs text-gray-500 py-6 text-center">No mesh jobs yet.</p>
          ) : (
            <div style={{ width: '100%', height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byModelData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={{ stroke: '#1f2937' }} tickLine={false} interval={0} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={{ stroke: '#1f2937' }} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {byModelData.map(entry => (
                      <Cell key={entry.name} fill={MODEL_TONE[entry.name] || '#94a3b8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* GLB BLOB totals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 pt-3 border-t border-gray-800">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500">Count</div>
          <div className="text-sm font-mono text-gray-200 mt-0.5 tabular-nums">{blob.count.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500">Total bytes</div>
          <div className="text-sm font-mono text-amber-300 mt-0.5">{fmtBytes(blob.totalBytes)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500">Avg / job</div>
          <div className="text-sm font-mono text-gray-200 mt-0.5">{fmtBytes(blob.avgBytes)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500">Largest</div>
          <div className="text-sm font-mono text-gray-200 mt-0.5">{fmtBytes(blob.maxBytes)}</div>
        </div>
      </div>

      {/* Last 10 — compact table so the user can spot what's running now */}
      {recent.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-800">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">
            Recent 10
          </p>
          <table className="w-full text-[11px] font-mono">
            <thead>
              <tr className="text-gray-600 uppercase tracking-wider text-[9px]">
                <th className="text-left py-1">Job</th>
                <th className="text-left py-1">Engine</th>
                <th className="text-left py-1">Status</th>
                <th className="text-right py-1">Bytes</th>
                <th className="text-left py-1 pl-4">Prompt</th>
              </tr>
            </thead>
            <tbody>
              {recent.map(row => (
                <tr key={row.jobId} className="border-t border-gray-900">
                  <td className="py-1 text-gray-500">{row.jobId.slice(-8)}</td>
                  <td className="py-1 text-amber-300">{row.model}</td>
                  <td className="py-1">
                    <span style={{ color: STATUS_TONE[row.status] || '#94a3b8' }}>
                      {row.status}
                    </span>
                  </td>
                  <td className="py-1 text-right text-gray-300 tabular-nums">{fmtBytes(row.bytes)}</td>
                  <td className="py-1 pl-4 text-gray-300 truncate max-w-[260px]">{row.prompt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

// Pick a card-chrome accent that roughly matches the line colour. Card
// only has 4 hardcoded accents — we map cyan/fuchsia/amber/emerald in
// rotation and let the rose-line cards fall back to fuchsia.
function accentForTable(table, idx) {
  const c = TABLE_COLORS[table] || FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length]
  if (c === '#06b6d4') return 'cyan'
  if (c === '#d946ef') return 'fuchsia'
  if (c === '#fbbf24') return 'amber'
  if (c === '#34d399') return 'emerald'
  return 'fuchsia' // rose → fuchsia (closest in the existing map)
}

// ─── Server card ──────────────────────────────────────────────
function ServerCard({ data, loading }) {
  const used = data?.memUsedPercent ?? 0
  const usedMB = data ? (data.memTotalMB - data.memFreeMB) : 0
  return (
    <Card icon={<CloudServerOutlined />} title="Server" accent="cyan">
      {!data ? (loading ? <CardSkeleton rows={4} /> : <Empty />) : (
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
                className="h-full rounded-full bg-cyan-400 transition-[width] duration-500"
                style={{ width: `${Math.max(2, Math.min(100, used))}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

// ─── Storage card ─────────────────────────────────────────────
// Pulls /api/admin/disk-stats and shows three blocks:
//   1) Filesystem header with a single fill bar (used vs free).
//   2) Per-bucket table — the actual binary lanes that grow over time
//      (sqlite db, combined videos, yt downloads, loose state files).
//      Each bucket renders a coloured mini-bar relative to its share of
//      the tracked total, so you can eyeball which lane is hogging space
//      without doing the math.
//   3) Domain row counts — chess_games, mesh_jobs, etc. These do not
//      directly map to disk bytes (most live inside the sqlite file), but
//      the user thinks in terms of "how many chess games", so we expose
//      both axes.
const BUCKET_ACCENT = {
  sqlite:   ['bg-fuchsia-500/50', 'text-fuchsia-300'],
  combined: ['bg-amber-500/50',   'text-amber-300'],
  ytdl:     ['bg-rose-500/50',    'text-rose-300'],
  other:    ['bg-gray-500/50',    'text-gray-300'],
}

function StorageCard({ data, loading }) {
  if (!data) {
    return (
      <Card icon={<DatabaseOutlined />} title="Storage" accent="emerald">
        {loading ? <CardSkeleton rows={5} /> : <Empty />}
      </Card>
    )
  }
  const { disk, buckets = [], trackedBytes = 0, domains = [] } = data
  const diskPct = disk?.totalBytes
    ? Math.min(100, Math.round((disk.usedBytes / disk.totalBytes) * 1000) / 10)
    : null
  const maxBucket = Math.max(1, ...buckets.map(b => b.sizeBytes || 0))

  return (
    <div className="space-y-4">
      <Card icon={<DatabaseOutlined />} title="Disk" accent="emerald">
        {disk ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-gray-500">Total</div>
                <div className="text-sm font-mono text-gray-200 mt-0.5">{fmtBytes(disk.totalBytes)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-gray-500">Used</div>
                <div className="text-sm font-mono text-amber-300 mt-0.5">{fmtBytes(disk.usedBytes)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-gray-500">Free</div>
                <div className="text-sm font-mono text-emerald-300 mt-0.5">{fmtBytes(disk.freeBytes)}</div>
              </div>
            </div>
            <div className="w-full h-2 rounded-full bg-gray-900 overflow-hidden">
              <div
                className="h-full bg-amber-400 transition-all"
                style={{ width: `${diskPct || 0}%` }}
              />
            </div>
            <p className="text-[10px] text-gray-500 text-right">
              {diskPct != null ? `${diskPct}% used` : 'stats unavailable'}
            </p>
          </div>
        ) : (
          <p className="text-xs text-gray-500">Filesystem stats unavailable on this host.</p>
        )}
      </Card>

      <Card icon={<DatabaseOutlined />} title="Buckets" accent="amber">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">
          Tracked: {fmtBytes(trackedBytes)} · across {buckets.length} lanes
        </div>
        <div className="space-y-2">
          {buckets.map(b => {
            const [grad, txt] = BUCKET_ACCENT[b.id] || BUCKET_ACCENT.other
            const pct = Math.round(((b.sizeBytes || 0) / maxBucket) * 100)
            return (
              <div key={b.id} className="p-2.5 rounded-md border border-gray-900 bg-gray-950/50">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-300">
                    <span className="mr-1.5">{b.emoji}</span>
                    <span className="font-semibold">{b.label}</span>
                    <span className="ml-2 text-gray-500 font-mono">{b.path}</span>
                  </span>
                  <span className={`font-mono ${txt}`}>{fmtBytes(b.sizeBytes)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-900 overflow-hidden">
                  <div className={`h-full ${grad} transition-all`} style={{ width: `${pct}%` }} />
                </div>
                <div className="text-[10px] text-gray-600 mt-1">{b.fileCount.toLocaleString()} files</div>
              </div>
            )
          })}
        </div>
      </Card>

      {domains.length > 0 && (
        <Card icon={<DatabaseOutlined />} title="By domain" accent="cyan">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">
            Row counts (live db) — not file size; lives inside the sqlite file
          </div>
          <table className="w-full text-xs">
            <tbody>
              {domains.map(d => (
                <tr key={d.id} className="border-b border-gray-900 last:border-0">
                  <td className="py-1 text-gray-400">{d.label}</td>
                  <td className="py-1 text-right text-gray-200 font-mono">{d.rows.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

// ─── Database card ────────────────────────────────────────────
function DatabaseCard({ data, loading }) {
  const tables = data?.tables || []
  return (
    <Card icon={<DatabaseOutlined />} title="Database" accent="fuchsia">
      {!data ? (loading ? <CardSkeleton rows={6} /> : <Empty />) : (
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
function QueuesCard({ data, onPurge, loading }) {
  return (
    <Card icon={<ApiOutlined />} title="Queues (RabbitMQ)" accent="amber">
      {!data ? (loading ? <CardSkeleton rows={8} /> : <Empty />) : data.configured === false ? (
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
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-lg border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300">
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
function WorkersCard({ rows, loading }) {
  return (
    <Card icon={<ClusterOutlined />} title="Workers" accent="emerald">
      {!rows ? (loading ? <CardSkeleton rows={3} /> : <Empty />) : rows.length === 0 ? (
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
    cyan:    'bg-cyan-500/8 text-cyan-300 border-cyan-500/30',
    fuchsia: 'bg-fuchsia-500/8 text-fuchsia-300 border-fuchsia-500/30',
    amber:   'bg-amber-500/8 text-amber-300 border-amber-500/30',
    emerald: 'bg-emerald-500/8 text-emerald-300 border-emerald-500/30',
  }
  const a = accentMap[accent] || accentMap.cyan
  return (
    <section className="rounded-lg border border-gray-800 bg-gray-950/60 overflow-hidden">
      <header className={`px-4 py-2.5 border-b border-gray-800 ${a} flex items-center gap-2`}>
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

// Empty — shown when an endpoint returned no rows (not the same as
// "still loading"). The single label distinguishes the two states for
// the user without needing different styling.
function Empty({ label = 'No data' }) {
  return <p className="text-xs text-gray-600 py-4 text-center">{label}</p>
}

// CardSkeleton — pulsing placeholder rows so a card with a pending
// fetch never collapses to "Loading…" text. Caller picks the row
// count; default 3 matches the typical server/db card height.
function CardSkeleton({ rows = 3 }) {
  return (
    <div className="space-y-2 py-1">
      {Array.from({ length: rows }).map((_, idx) => (
        <div key={idx} className="luxe-skeleton h-3"
          style={{ width: `${100 - (idx % 3) * 12}%` }} />
      ))}
    </div>
  )
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

// ── CloudinaryTab ────────────────────────────────────────────────
// Settings → Cloudinary. Free-tier monitoring + asset purge.
//
// Top card: live usage (storage + bandwidth + credits remaining +
// resource count). BE caches the /usage response for 60s.
//
// Below it: type + prefix selector + paginated asset list. Multi-
// select via checkboxes. "Delete selected" hits the bulk delete
// endpoint, invalidates the usage cache so the savings show on the
// next poll, and pops a Modal.confirm before firing.
function CloudinaryTab() {
  const [usage, setUsage] = useState(null)
  const [usageLoading, setUsageLoading] = useState(true)
  const [usageErr, setUsageErr] = useState(null)
  const [resourceType, setResourceType] = useState('video')
  const [prefix, setPrefix] = useState('ai-videos')
  const [items, setItems] = useState([])
  const [nextCursor, setNextCursor] = useState(null)
  const [listLoading, setListLoading] = useState(false)
  const [listErr, setListErr] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [deleting, setDeleting] = useState(false)

  const fmtBytesLocal = (b) => {
    if (!b) return '0 B'
    const mb = b / (1024 * 1024)
    if (mb < 1024) return `${mb.toFixed(1)} MB`
    return `${(mb / 1024).toFixed(2)} GB`
  }
  const pct = (used, limit) => {
    if (!limit) return null
    return Math.min(100, Math.round((used / limit) * 100))
  }

  const loadUsage = async () => {
    setUsageLoading(true)
    const { data, error } = await adminCloudinaryUsage()
    setUsageLoading(false)
    if (error) { setUsageErr(error); return }
    setUsage(data || null); setUsageErr(null)
  }

  const loadResources = async ({ reset = true, cursor } = {}) => {
    setListLoading(true)
    const { data, error } = await adminCloudinaryResources({
      type: resourceType,
      prefix: prefix.trim() || 'ai-videos',
      max: 30,
      next: cursor,
    })
    setListLoading(false)
    if (error) { setListErr(error); return }
    setListErr(null)
    setNextCursor(data?.nextCursor || null)
    setItems(prev => reset ? (data?.items || []) : [...prev, ...(data?.items || [])])
    if (reset) setSelected(new Set())
  }

  useEffect(() => { loadUsage(); loadResources({ reset: true }) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])
  useEffect(() => { loadResources({ reset: true }) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [resourceType, prefix])

  const toggleSelect = (publicId) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(publicId)) next.delete(publicId); else next.add(publicId)
      return next
    })
  }
  const selectAllOnPage = () => {
    if (selected.size === items.length && items.length > 0) setSelected(new Set())
    else setSelected(new Set(items.map(it => it.publicId)))
  }

  const onDeleteSelected = () => {
    if (selected.size === 0) return
    const ids = Array.from(selected).slice(0, 50)
    Modal.confirm({
      title: `Delete ${ids.length} Cloudinary asset${ids.length === 1 ? '' : 's'}?`,
      content: (
        <div className="text-xs space-y-2">
          <p>Removes the {resourceType}{ids.length === 1 ? '' : 's'} from Cloudinary permanently. The corresponding DB rows on Oracle are NOT touched — only the binary on Cloudinary.</p>
          <p className="text-rose-300/80">Cannot be undone. Cloudinary has no trash.</p>
        </div>
      ),
      okText: 'Delete', cancelText: 'Back',
      okType: 'danger', okButtonProps: { danger: true },
      centered: true,
      onOk: async () => {
        setDeleting(true)
        const { data, error } = await adminCloudinaryDelete({ publicIds: ids, resourceType })
        setDeleting(false)
        if (error) { notice.error(`Delete failed: ${error}`); return }
        const deletedMap = data?.deleted || {}
        const okCount = Object.values(deletedMap).filter(v => v === 'deleted' || v === 'ok').length
        notice.success(`${okCount}/${ids.length} deleted on Cloudinary`)
        setSelected(new Set())
        loadUsage()
        loadResources({ reset: true })
      },
    })
  }

  return (
    <div className="space-y-4">
      <div className="luxe-card p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-amber-300/80">— Cloudinary free tier</p>
            <p className="text-[11px] text-fg-muted mt-0.5">
              {usage?.cached ? `cached ${usage.cacheAgeSec}s ago` : 'live'} · plan {usage?.plan || 'Free'}
            </p>
          </div>
          <button onClick={loadUsage} disabled={usageLoading}
            className="text-[10px] font-semibold px-2 py-1 rounded-full border border-line hover:border-line-strong text-fg-muted inline-flex items-center gap-1">
            <ReloadOutlined /> Refresh
          </button>
        </div>
        {usageErr && <p className="text-[11px] font-mono text-rose-400 mb-2">{usageErr}</p>}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Storage</p>
            <p className="text-lg font-bold text-amber-200 tabular-nums">
              {fmtBytesLocal(usage?.storage?.used || 0)}
              {usage?.storage?.limit ? <span className="text-[10px] text-gray-500 ml-1">/ {fmtBytesLocal(usage.storage.limit)}</span> : null}
            </p>
            {pct(usage?.storage?.used, usage?.storage?.limit) != null && (
              <div className="h-1 mt-1 rounded bg-gray-800 overflow-hidden">
                <div className="h-full bg-amber-400" style={{ width: `${pct(usage.storage.used, usage.storage.limit)}%` }} />
              </div>
            )}
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Bandwidth (this month)</p>
            <p className="text-lg font-bold text-amber-200 tabular-nums">
              {fmtBytesLocal(usage?.bandwidth?.used || 0)}
              {usage?.bandwidth?.limit ? <span className="text-[10px] text-gray-500 ml-1">/ {fmtBytesLocal(usage.bandwidth.limit)}</span> : null}
            </p>
            {pct(usage?.bandwidth?.used, usage?.bandwidth?.limit) != null && (
              <div className="h-1 mt-1 rounded bg-gray-800 overflow-hidden">
                <div className="h-full bg-amber-400" style={{ width: `${pct(usage.bandwidth.used, usage.bandwidth.limit)}%` }} />
              </div>
            )}
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Credits used</p>
            <p className="text-lg font-bold text-amber-200 tabular-nums">
              {typeof usage?.credits?.used === 'number' ? usage.credits.used.toFixed(2) : '—'}
              {usage?.credits?.limit ? <span className="text-[10px] text-gray-500 ml-1">/ {usage.credits.limit}</span> : null}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Assets</p>
            <p className="text-lg font-bold text-amber-200 tabular-nums">
              {(usage?.objects ?? usage?.resources ?? 0).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      <div className="luxe-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Type</span>
            <Segmented size="small" value={resourceType}
              onChange={(v) => setResourceType(v)}
              options={[
                { label: 'Video', value: 'video' },
                { label: 'Image', value: 'image' },
                { label: 'Raw',   value: 'raw'   },
              ]} />
            <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500 ml-2">Prefix</span>
            <input value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder="ai-videos"
              className="bg-surface-elevated border border-line rounded px-2 py-1 text-[12px] font-mono text-fg-primary w-48 focus:outline-none focus:border-amber-400/50" />
            <button onClick={() => loadResources({ reset: true })}
              className="text-[10px] font-semibold px-2 py-1 rounded-full border border-line hover:border-line-strong text-fg-muted inline-flex items-center gap-1">
              <ReloadOutlined /> Refresh
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono text-gray-500">
              {selected.size} selected · {items.length} on this page
            </span>
            <button onClick={selectAllOnPage}
              className="text-[10px] font-semibold px-2 py-1 rounded border border-line hover:border-line-strong text-fg-muted inline-flex items-center gap-1">
              <CheckOutlined /> {selected.size === items.length && items.length > 0 ? 'Clear' : 'Select all'}
            </button>
            <button onClick={onDeleteSelected} disabled={selected.size === 0 || deleting}
              className="text-[10px] font-semibold px-2 py-1 rounded border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 inline-flex items-center gap-1 disabled:opacity-40">
              <DeleteOutlined /> Delete {selected.size > 0 ? `(${Math.min(selected.size, 50)})` : ''}
            </button>
          </div>
        </div>

        {listErr && <p className="text-[11px] font-mono text-rose-400 mb-2">{listErr}</p>}

        {listLoading && items.length === 0 ? (
          <p className="text-xs text-gray-500 py-8 text-center">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-gray-500 py-8 text-center">No assets under <span className="font-mono">{prefix}</span> ({resourceType}).</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {items.map(it => {
              const isSel = selected.has(it.publicId)
              return (
                <li key={it.publicId}
                  className={`rounded-lg border p-2 transition cursor-pointer ${
                    isSel
                      ? 'border-amber-400/60 bg-amber-500/10'
                      : 'border-line bg-surface-elevated hover:border-line-strong'
                  }`}
                  onClick={() => toggleSelect(it.publicId)}>
                  <div className="flex items-start gap-2">
                    <input type="checkbox" checked={isSel} onChange={() => toggleSelect(it.publicId)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 accent-amber-400" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-mono text-fg-primary truncate">{it.publicId}</p>
                      <p className="text-[10px] font-mono text-gray-500 tabular-nums">
                        {fmtBytesLocal(it.bytes)} · {it.format || '—'}
                        {it.duration ? ` · ${it.duration.toFixed(1)}s` : ''}
                        {it.width && it.height ? ` · ${it.width}×${it.height}` : ''}
                      </p>
                      <p className="text-[10px] font-mono text-gray-600 tabular-nums">
                        {new Date(it.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  {resourceType === 'image' && (
                    <img src={it.url} alt={it.publicId}
                      className="mt-2 w-full aspect-video object-cover rounded border border-line"
                      loading="lazy"
                      onClick={(e) => e.stopPropagation()} />
                  )}
                  {resourceType === 'video' && (
                    <video src={it.url}
                      muted playsInline preload="metadata"
                      className="mt-2 w-full aspect-video object-cover rounded border border-line bg-black"
                      onClick={(e) => e.stopPropagation()} />
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {nextCursor && (
          <div className="flex justify-center mt-3">
            <button onClick={() => loadResources({ reset: false, cursor: nextCursor })}
              disabled={listLoading}
              className="text-[11px] font-semibold px-3 py-1.5 rounded-full border border-line hover:border-line-strong text-fg-muted disabled:opacity-40">
              {listLoading ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
