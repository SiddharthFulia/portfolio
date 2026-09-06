// Settings → Keep-alive tab.
//
// Fires POST /api/admin/keep-alive/trigger, polls
// GET /api/admin/keep-alive/status every 2s so a message published from
// this panel shows up in the "recent runs" list within a heartbeat.
//
// The BE runs a nightly cron at 00:00 IST that pushes exactly one message
// to the `keep_alive` queue. This tab is the manual button for firing
// on-demand + watching the consumer eat the message live.

import { useEffect, useRef, useState } from 'react'
import { ThunderboltOutlined, ReloadOutlined, CheckCircleFilled, CloseCircleFilled } from '@ant-design/icons'
import { notice } from '../../lib/notice'
import { adminKeepAliveTrigger, adminKeepAliveStatus } from '../../api/ai'

const POLL_MS = 2000

function fmtDelta(iso) {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return String(iso)
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ${secs % 60}s ago`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ${mins % 60}m ago`
}

function fmtTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return String(iso)
  return d.toTimeString().slice(0, 8)
}

export default function KeepAliveTab() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [firing, setFiring]   = useState(false)
  const [err, setErr]         = useState(null)
  const [now, setNow]         = useState(Date.now())
  const inFlight = useRef(false)

  const load = async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const { data, error } = await adminKeepAliveStatus()
      if (error) setErr(error)
      else { setErr(null); setStatus(data) }
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, POLL_MS)
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => { clearInterval(t); clearInterval(tick) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fire = async () => {
    setFiring(true)
    const { data, error } = await adminKeepAliveTrigger()
    setFiring(false)
    if (error) {
      notice.error(`Trigger failed: ${error}`)
      return
    }
    if (data?.published) {
      notice.success(`Published (requestId=${data.requestId?.slice?.(-6) || '—'})`)
      setTimeout(load, 400)
    } else {
      notice.warning(data?.error || 'Broker returned no ack')
    }
  }

  const history = status?.history || []
  const consumerLive = !!status?.consumerStarted

  return (
    <div className="space-y-4">
      {/* Header + fire button */}
      <div className="rounded-lg border border-gray-800 bg-gray-950/60 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <ThunderboltOutlined className="text-amber-300" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-300">
              Keep-alive queue
            </h2>
            <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${
              consumerLive
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
            }`}>
              consumer {consumerLive ? 'live' : 'down'}
            </span>
          </div>
          <p className="text-xs text-gray-400">
            Fires one message to <span className="font-mono text-gray-300">keep_alive</span>. Consumer probes <span className="font-mono text-gray-300">Server health</span> + <span className="font-mono text-gray-300">Server stats</span> and records the outcome below. Nightly cron runs at <span className="font-mono text-gray-300">00:00 IST</span>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="text-[10px] font-semibold px-2 py-1 rounded-full border border-line hover:border-line-strong text-fg-muted inline-flex items-center gap-1"
          >
            <ReloadOutlined /> Refresh
          </button>
          <button
            onClick={fire}
            disabled={firing}
            className="text-xs font-semibold px-4 py-2 rounded-full border border-amber-500/50 bg-gradient-to-r from-amber-500/20 to-rose-500/20 hover:from-amber-500/30 hover:to-rose-500/30 text-amber-200 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <ThunderboltOutlined />
            {firing ? 'Publishing…' : 'Fire keep-alive'}
          </button>
        </div>
      </div>

      {err && (
        <p className="text-rose-400 text-xs font-mono">{err}</p>
      )}

      {/* Recent runs */}
      <div className="rounded-lg border border-gray-800 bg-gray-950/60 overflow-hidden">
        <header className="px-4 py-2.5 border-b border-gray-800 flex items-center justify-between text-xs">
          <span className="uppercase tracking-wider text-gray-400 font-semibold">
            Recent runs · newest first
          </span>
          <span className="text-gray-500 font-mono">
            {history.length} / {status?.historyCount ?? 0} kept · polling {POLL_MS}ms
          </span>
        </header>
        <div className="p-3">
          {loading && history.length === 0 ? (
            <p className="text-xs text-gray-500 py-8 text-center">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-gray-500 py-8 text-center">
              No runs yet — hit <span className="font-mono text-amber-300">Fire keep-alive</span> to publish one.
            </p>
          ) : (
            <ul className="space-y-2">
              {history.map((h) => (
                <li
                  key={h.requestId || `${h.startedAt}-${h.reason}`}
                  className="rounded-md border border-gray-800 bg-gray-900/40 p-3"
                >
                  <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      {h.ok
                        ? <CheckCircleFilled className="text-emerald-400" />
                        : <CloseCircleFilled className="text-rose-400" />}
                      <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${
                        h.reason === 'manual'
                          ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                          : 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
                      }`}>
                        {h.reason || 'unknown'}
                      </span>
                      <span className="text-xs font-mono text-gray-400 truncate">
                        {h.requestId || '—'}
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-500 font-mono whitespace-nowrap tabular-nums">
                      {fmtTime(h.startedAt)} · {fmtDelta(h.startedAt)}
                      {now && null /* re-render on tick */}
                    </div>
                  </div>

                  {Array.isArray(h.probes) && h.probes.length > 0 && (
                    <table className="w-full text-[11px] font-mono">
                      <tbody>
                        {h.probes.map((p) => (
                          <tr key={p.path} className="border-t border-gray-900 first:border-0">
                            <td className="py-1 text-gray-400 truncate">{p.path}</td>
                            <td className="py-1 text-right w-16">
                              <span className={p.ok ? 'text-emerald-300' : 'text-rose-300'}>
                                {p.status || 'err'}
                              </span>
                            </td>
                            <td className="py-1 text-right text-gray-500 w-16 tabular-nums">
                              {p.durationMs != null ? `${p.durationMs}ms` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {h.probes?.some(p => !p.ok) && (
                    <p className="text-[10px] text-rose-300/80 mt-1.5 font-mono">
                      {h.probes.filter(p => !p.ok).map(p => p.error || `HTTP ${p.status}`).join(' · ')}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
