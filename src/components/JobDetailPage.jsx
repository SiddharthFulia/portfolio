import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Button, Modal, message as antMessage } from 'antd'
import {
  ArrowLeftOutlined, ReloadOutlined, PauseOutlined, CaretRightOutlined,
  ExpandAltOutlined, ClockCircleOutlined, ThunderboltOutlined,
  CheckCircleOutlined, CloseCircleOutlined,
} from '@ant-design/icons'

// Shared detail page for any single job/asset in the studio stack. URL pattern:
//   /<lane>/:id   →  /ai-video/<videoId>, /image-enhancer/<imageId>,
//                    /lipsync/<jobId>, /audio/<jobId>, /cinema/<projectId>
//
// Each lane wraps this component with the right `getStatus` API caller +
// `renderOutput` lane-specific output card. Polling, log feed, pause/resume,
// expand-modal, back link are all shared.
//
// Why a dedicated page (and not just a modal):
//   • survives a hard refresh — the URL is enough to re-attach
//   • shareable links — paste /ai-video/<id> to a friend to show progress
//   • avoids the "stop watching → lost track of job" trap
//
// Props:
//   lane         — 'ai-video' | 'image-enhancer' | 'lipsync' | 'audio' | 'cinema'
//   title        — Section heading ("AI Video", "Lip Sync Studio", ...)
//   accentClass  — Tailwind text gradient for the heading
//   backTo       — Library route to return to ("/ai-video", "/lipsync", ...)
//   getStatus    — async (id) => { data, error }; returns the job row
//   renderOutput — (job) => JSX; lane-specific completed/output card
//   renderError? — optional (job) => JSX for failed jobs (default: generic)
//   idKey        — id field on the job ('videoId' | 'jobId' | 'imageId' | 'projectId')

const TONE_COLORS = {
  queued:     'border-amber-500/40 bg-amber-500/10 text-amber-300',
  processing: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300',
  completed:  'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  failed:     'border-rose-500/40 bg-rose-500/10 text-rose-300',
}

const STATUS_ICON = {
  queued:     <ClockCircleOutlined />,
  processing: <ThunderboltOutlined className="animate-pulse" />,
  completed:  <CheckCircleOutlined />,
  failed:     <CloseCircleOutlined />,
}

const logTone = (text) => {
  if (!text) return 'text-gray-400'
  if (text.startsWith('✗')) return 'text-rose-400'
  if (text.startsWith('🎬') || text.startsWith('🖼') || text.startsWith('🔊')) return 'text-emerald-300'
  if (text.startsWith('✓')) return 'text-emerald-400/80'
  if (text.startsWith('⚡')) return 'text-amber-300'
  if (text.startsWith('⏱')) return 'text-cyan-300'
  if (text.startsWith('→') || text.startsWith('↑')) return 'text-fuchsia-300'
  if (text.startsWith('sampler') || text.startsWith('step')) return 'text-sky-300'
  return 'text-gray-400'
}

const fmtTs = (ts) => {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n, w = 2) => String(n).padStart(w, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

const fmtSec = (s) => {
  if (!Number.isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const r = Math.floor(s % 60)
  return m > 0 ? `${m}m ${r}s` : `${r}s`
}

export default function JobDetailPage({
  lane, title, accentClass, backTo,
  getStatus, renderOutput, renderError, idKey = 'jobId',
}) {
  const params = useParams()
  const navigate = useNavigate()
  const id = params.id || params.jobId || params.videoId || params.imageId || params.projectId
  const [job, setJob] = useState(null)
  const [error, setError] = useState(null)
  const [paused, setPaused] = useState(false)
  const [logsOpen, setLogsOpen] = useState(false)
  const [now, setNow] = useState(Date.now())
  const pollTimer = useRef(null)
  const pausedRef = useRef(false)
  useEffect(() => { pausedRef.current = paused }, [paused])

  useEffect(() => { document.title = `${title} · ${id} · Sid` }, [title, id])

  // 1s tick for the elapsed timer
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Initial fetch + 1.5s polling while job is in-flight
  useEffect(() => {
    if (!id) return
    let cancelled = false
    let attempts = 0

    const fetchOnce = async () => {
      if (pausedRef.current) return
      attempts += 1
      const { data, error: err } = await getStatus(id)
      if (cancelled) return
      if (err) {
        if (attempts > 5) {
          if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null }
          setError(err)
        }
        return
      }
      if (!data) {
        setError('Job not found')
        if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null }
        return
      }
      setJob(data)
      const done = ['completed', 'failed'].includes(data.status)
      if (done && pollTimer.current) {
        clearInterval(pollTimer.current); pollTimer.current = null
      }
    }

    fetchOnce()
    pollTimer.current = setInterval(fetchOnce, 1500)
    return () => {
      cancelled = true
      if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const refresh = async () => {
    if (!id) return
    const { data, error: err } = await getStatus(id)
    if (err) { antMessage.error(err); return }
    if (data) { setJob(data); antMessage.success('Refreshed') }
  }

  const allLogs = Array.isArray(job?.logs) ? job.logs : []
  const status = job?.status || (error ? 'failed' : 'queued')
  const tone = TONE_COLORS[status] || TONE_COLORS.queued

  // Progress math
  const startedAt = job?.startedAt ? new Date(job.startedAt).getTime() : null
  const completedAt = job?.completedAt ? new Date(job.completedAt).getTime() : null
  const estTotal = Number(job?.estimatedSeconds) || null
  const elapsed = startedAt
    ? Math.max(0, ((completedAt || now) - startedAt) / 1000)
    : 0
  const remaining = estTotal && !completedAt ? Math.max(0, estTotal - elapsed) : null
  const pct = (estTotal && elapsed > 0 && !completedAt)
    ? Math.min(99, Math.round((elapsed / estTotal) * 100))
    : completedAt ? 100 : null

  return (
    /* pt-28 (was pt-20) — the global Navbar is `fixed` and ~80px tall.
       Old padding put the Back button right under the navbar, clipping
       it on phones + producing a "where's the button" moment on desktop. */
    <div className="min-h-screen bg-black text-gray-100 pt-28 pb-16 px-3 sm:px-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="mb-6">
          {/* Pill-style back button with hover affordance — was inline
              text only which felt unfinished. */}
          <button onClick={() => navigate(backTo)}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-full border border-gray-800 hover:border-cyan-500/50 bg-gray-900/60 hover:bg-cyan-500/10 text-gray-400 hover:text-cyan-200 mb-4 transition-all">
            <ArrowLeftOutlined className="text-[10px]" /> Back to {title}
          </button>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
            <h1 className={`text-2xl sm:text-3xl font-bold leading-tight pb-1 ${accentClass}`}>
              {title}
            </h1>
            <span className={`px-3 py-1 rounded-full border text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5 ${tone}`}>
              {STATUS_ICON[status]} {status}
            </span>
          </div>
          <p className="text-[10px] font-mono text-gray-600 break-all">{id}</p>
        </header>

        {/* Progress bar + ETA — only while active */}
        {pct != null && status !== 'failed' && (
          <section className="rounded-2xl border border-gray-800 bg-gray-900/40 p-4 mb-5">
            <div className="flex items-center justify-between text-[10px] font-mono text-gray-500 mb-2">
              <span>elapsed {fmtSec(elapsed)}</span>
              <span className="text-gray-200 text-xs font-semibold">{pct}%</span>
              <span>{remaining != null ? `~${fmtSec(remaining)} left` : 'done'}</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-gray-800 overflow-hidden">
              <div className={`h-full ${pct === 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-cyan-500 to-fuchsia-500'} transition-all duration-1000 ease-linear`}
                style={{ width: `${pct}%` }} />
            </div>
            {job?.progressMessage && (
              <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">{job.progressMessage}</p>
            )}
          </section>
        )}

        {/* Output / Error / In-flight body */}
        <section className="mb-5">
          {status === 'completed' && renderOutput && renderOutput(job)}
          {status === 'failed' && (
            renderError ? renderError(job) : (
              <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4">
                <p className="text-sm font-semibold text-rose-300 mb-1">Generation failed</p>
                <p className="text-gray-400 text-xs leading-relaxed">{job?.error || error || 'Unknown error'}</p>
              </div>
            )
          )}
          {(status === 'queued' || status === 'processing') && (
            <div className="rounded-2xl border-2 border-dashed border-gray-800 py-12 flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full border-2 border-cyan-500/40 border-t-cyan-400 animate-spin" />
              <p className="text-sm text-gray-300 font-semibold">
                {status === 'processing' ? 'Generating…' : 'Queued…'}
              </p>
              <p className="text-[11px] text-gray-600 max-w-sm text-center px-4 leading-relaxed">
                This page survives refreshes — close the tab and come back any time.
                The worker keeps rendering even if you leave.
              </p>
            </div>
          )}
        </section>

        {/* Live log feed — always rendered when there are any logs */}
        <section className="rounded-2xl border border-gray-800 bg-gray-900/40 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800 bg-gradient-to-r from-cyan-500/5 to-fuchsia-500/5">
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${
                status === 'completed' ? 'bg-emerald-400'
                : status === 'failed' ? 'bg-rose-400'
                : paused ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'
              }`} />
              <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-300">
                {status === 'completed' || status === 'failed'
                  ? 'Worker transcript'
                  : (paused ? 'paused' : 'live')} · {allLogs.length} {allLogs.length === 1 ? 'event' : 'events'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {(status === 'queued' || status === 'processing') && (
                <button type="button" onClick={() => setPaused(p => !p)}
                  className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white transition-colors">
                  {paused ? <><CaretRightOutlined className="text-[9px]" /> Resume</>
                          : <><PauseOutlined className="text-[9px]" /> Pause</>}
                </button>
              )}
              <button type="button" onClick={refresh}
                className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white transition-colors">
                <ReloadOutlined className="text-[9px]" /> Refresh
              </button>
              {allLogs.length > 0 && (
                <button type="button" onClick={() => setLogsOpen(true)}
                  className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-cyan-500/40 hover:border-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 transition-colors">
                  <ExpandAltOutlined className="text-[9px]" /> Expand
                </button>
              )}
            </div>
          </div>
          <button type="button"
            onClick={() => allLogs.length > 0 && setLogsOpen(true)}
            className="block w-full text-left bg-black/40 hover:bg-black/60 transition-colors">
            <div className="max-h-80 overflow-y-auto p-4">
              {allLogs.length === 0 ? (
                <p className="text-center text-gray-600 text-xs py-6">
                  Waiting for the worker to emit its first event…
                </p>
              ) : (
                <ul className="space-y-1">
                  {allLogs.slice(-30).map((entry, i) => (
                    <li key={`${entry?.ts || i}-${i}`}
                        className={`text-[11px] font-mono leading-relaxed break-all ${logTone(entry?.msg || '')}`}>
                      {entry?.msg || ''}
                    </li>
                  ))}
                </ul>
              )}
              {allLogs.length > 30 && (
                <p className="text-[10px] text-gray-500 mt-2 text-center hover:text-cyan-300 transition-colors">
                  + {allLogs.length - 30} earlier events — click to view all
                </p>
              )}
            </div>
          </button>
        </section>

        {/* Full-history modal */}
        <Modal open={logsOpen} onCancel={() => setLogsOpen(false)} footer={null}
          width={760} centered closeIcon={null}
          styles={{
            content: { background: '#0b0f17', padding: 0, borderRadius: 16, border: '1px solid rgba(34,211,238,0.25)' },
            body: { padding: 0 },
            header: { display: 'none' },
            mask: { backdropFilter: 'blur(6px)' },
          }}>
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 bg-gradient-to-r from-cyan-500/10 via-fuchsia-500/5 to-transparent">
            <h3 className="text-sm font-semibold text-white tracking-wide">
              Worker activity · <span className="font-mono text-cyan-300 break-all">{id}</span>
            </h3>
            <button onClick={() => setLogsOpen(false)}
              className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded">✕</button>
          </div>
          <div className="max-h-[65vh] overflow-y-auto p-5 bg-[#06080d]">
            {allLogs.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-12">No events yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {allLogs.map((entry, i) => (
                  <li key={`${entry?.ts || i}-${i}`} className="flex gap-3 items-start">
                    <span className="text-[10px] font-mono text-gray-600 shrink-0 pt-0.5 select-none">
                      {fmtTs(entry?.ts)}
                    </span>
                    <span className={`text-[12px] font-mono leading-relaxed break-all ${logTone(entry?.msg || '')}`}>
                      {entry?.msg || ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Modal>

        {/* Footer: back link */}
        <div className="mt-6 flex justify-center">
          <Link to={backTo}
            className="text-xs text-gray-500 hover:text-cyan-300 transition-colors flex items-center gap-1.5">
            <ArrowLeftOutlined /> Back to {title} library
          </Link>
        </div>
      </div>
    </div>
  )
}
