// CinemaRenderPage — /cinema/render/:renderId
//
// Resumable live-logs view for one Cinema render attempt. Loads:
//   1. The render row from /api/cinema/render/:renderId (status, phase,
//      currentShotIndex, shotJobIds, combineJobId, finalDownloadHref).
//   2. The parent project (shotPrompts + duration + aspect + resolution)
//      — included in the same response so the page renders with one
//      round-trip on cold load.
// Then renders <CinemaRenderer> with both hydrated as props. The chain
// orchestrator inside CinemaRenderer reads shotJobIds to mark already-
// completed shots as such, and the user clicks Start/Resume to continue
// from `currentShotIndex` — completed shots are skipped so we don't
// burn GPU re-generating what's already on Cloudinary.
//
// Refresh-safety: this whole page is read-only on mount. The chain only
// runs after the user clicks Start/Resume. Two tabs open on the same
// renderId can't cause duplicate generations (the second tab sees the
// shotJobIds populated and the chain skips them).

import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Alert, Modal } from 'antd'
import { ArrowLeftOutlined, ReloadOutlined, ExpandAltOutlined } from '@ant-design/icons'
import { getCinemaRender, getCinemaRenderLogs } from '../api/ai'
import CinemaRenderer from '../components/cinema/CinemaRenderer'

const POLL_INTERVAL_MS = 3000

export default function CinemaRenderPage() {
  const { renderId } = useParams()
  const [render, setRender] = useState(null)
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [titleModalOpen, setTitleModalOpen] = useState(false)
  // Unified-by-render log stream. Aggregates every log line across all
  // shots + the combine step into one chronologically-ordered list.
  // Default-collapsed (the per-shot accordions inside CinemaRenderer
  // already give an organised view; the unified stream is for when the
  // user wants to scroll across everything at once / debug the chain).
  const [unifiedLogsOpen, setUnifiedLogsOpen] = useState(false)
  const [unifiedLogs, setUnifiedLogs] = useState([])
  const unifiedSinceRef = useRef(0)

  useEffect(() => {
    document.title = `Cinema render · ${renderId?.slice(-8) || ''}`
  }, [renderId])

  // Cold load + lightweight poll. Polls every 3s as long as the render
  // is not in a terminal state — keeps the page state in sync with any
  // ANOTHER tab running the chain. When the chain runs in THIS tab,
  // CinemaRenderer PATCHes the row inline; the poll is the catch-all.
  useEffect(() => {
    let cancelled = false
    const fetchOnce = async () => {
      const { data, error: fetchError } = await getCinemaRender(renderId)
      if (cancelled) return
      if (fetchError) {
        setError(fetchError)
        setLoading(false)
        return
      }
      if (data) {
        setRender(data)
        if (data.project) setProject(data.project)
      }
      setLoading(false)
    }
    fetchOnce()
    const id = setInterval(() => {
      // Stop polling once the row is in a terminal state — no point
      // hammering the BE for a row that won't change.
      if (render?.status === 'completed' || render?.status === 'failed' || render?.status === 'cancelled') {
        clearInterval(id)
        return
      }
      fetchOnce()
    }, POLL_INTERVAL_MS)
    return () => { cancelled = true; clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderId])

  // Unified log poller — runs only when the user has the panel open.
  // Cursor-based via `since` so each tick only fetches new lines.
  useEffect(() => {
    if (!unifiedLogsOpen || !renderId) return undefined
    let cancelled = false
    const fetchTail = async () => {
      const { data } = await getCinemaRenderLogs(renderId, unifiedSinceRef.current, 500)
      if (cancelled || !data) return
      const incoming = Array.isArray(data.logs) ? data.logs : []
      if (incoming.length > 0) {
        setUnifiedLogs(prev => [...prev, ...incoming].slice(-2000))
        unifiedSinceRef.current = data.nextSince || unifiedSinceRef.current
      }
    }
    fetchTail()
    const id = setInterval(fetchTail, 1500)
    return () => { cancelled = true; clearInterval(id) }
  }, [unifiedLogsOpen, renderId])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0e] text-gray-100 pt-24 pb-16 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs text-gray-500 font-mono">
            <ReloadOutlined spin /> Loading render…
          </p>
        </div>
      </div>
    )
  }

  if (error || !render) {
    return (
      <div className="min-h-screen bg-[#0a0a0e] text-gray-100 pt-24 pb-16 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto space-y-3">
          <Link to="/ai-video?tab=cinema" className="text-xs text-gray-400 hover:text-gray-200 inline-flex items-center gap-1">
            <ArrowLeftOutlined /> Back to Cinema
          </Link>
          <Alert
            type="error" showIcon
            message="Couldn't load this render"
            description={error || 'Not found.'}
          />
        </div>
      </div>
    )
  }

  // Render the live UI. CinemaRenderer reads `initialRender.shotJobIds`
  // to hydrate per-shot state + uses `renderId` to PATCH the row after
  // every transition. The user clicks Start / Resume to drive the
  // chain from whatever shot we're up to.
  return (
    <div className="min-h-screen bg-[#0a0a0e] text-gray-100 pt-24 pb-16 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Link to="/ai-video?tab=cinema" className="text-xs text-gray-400 hover:text-gray-200 inline-flex items-center gap-1">
            <ArrowLeftOutlined /> Back to Cinema
          </Link>
          <div className="text-[10px] font-mono text-gray-500">
            render <span className="text-gray-300">{renderId}</span>
          </div>
        </div>

        <header className="pb-2 border-b border-gray-800">
          <p className="eyebrow-mono mb-2">— Cinema · live render</p>
          {(() => {
            const fullTitle = project?.masterPrompt || 'Untitled render'
            const isTruncated = fullTitle.length > 120
            // Title shows truncated by default + an expand button when
            // it's been clipped. Click anywhere on the heading (or the
            // explicit button) to open a Modal with the full prompt —
            // saves the user from squinting at the trailing "…".
            return (
              <>
                <h1
                  className={`text-2xl sm:text-3xl font-bold text-white leading-tight ${isTruncated ? 'cursor-pointer hover:text-amber-200' : ''}`}
                  onClick={() => isTruncated && setTitleModalOpen(true)}
                  title={isTruncated ? 'Click to read the full prompt' : undefined}>
                  {isTruncated ? fullTitle.slice(0, 120) + '…' : fullTitle}
                  {isTruncated && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setTitleModalOpen(true) }}
                      className="ml-2 inline-flex items-center gap-1 text-[11px] font-mono text-amber-300/80 hover:text-amber-200 underline align-middle">
                      <ExpandAltOutlined /> full
                    </button>
                  )}
                </h1>
                <p className="text-[11px] font-mono text-gray-500 mt-1">
                  project {render.projectId} · {render.shotCount} shots · status <span className="text-amber-300">{render.status}</span>
                </p>
              </>
            )
          })()}
        </header>

        {/* Full-title modal. Centered, no chrome around the prose — just
            the master prompt verbatim so the user can read or copy it.
            Closes on backdrop click + Escape (antd Modal defaults). */}
        <Modal
          open={titleModalOpen}
          onCancel={() => setTitleModalOpen(false)}
          footer={null}
          centered
          width={640}
          title="Master prompt"
        >
          <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap font-mono">
            {project?.masterPrompt || '—'}
          </p>
        </Modal>

        {project && (
          <CinemaRenderer
            project={project}
            renderId={renderId}
            initialRender={render}
          />
        )}

        {/* Unified-by-render logs — one chronologically-ordered stream
            across every shot + the combine step. Default-collapsed
            because the per-shot accordions inside CinemaRenderer above
            already provide an organised view; this is for the user
            who wants to scroll across everything at once (or debug
            the chain across shots). */}
        <section className="luxe-card p-4">
          <button
            type="button"
            onClick={() => setUnifiedLogsOpen(open => !open)}
            aria-expanded={unifiedLogsOpen}
            className="w-full flex items-center justify-between text-left">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-amber-300/80">— Unified logs</p>
              <p className="text-xs text-fg-muted mt-1">
                Every log line across all {render.shotCount} shots + the combine step, ordered by time.
              </p>
            </div>
            <span className="text-[11px] font-mono text-gray-400">
              {unifiedLogsOpen ? '▾ collapse' : '▸ open'}
            </span>
          </button>
          {unifiedLogsOpen && (
            <div className="mt-3 max-h-[480px] overflow-y-auto rounded-md border border-gray-800 bg-black/40 p-2">
              {unifiedLogs.length === 0 ? (
                <p className="text-xs text-gray-500 py-6 text-center">
                  No logs yet — they stream in as each shot runs.
                </p>
              ) : (
                <ul className="space-y-0.5 text-[11px] font-mono leading-snug">
                  {unifiedLogs.map((line, idx) => {
                    const shotLabel = line.shotIndex === -1
                      ? 'COMBINE'
                      : (line.shotIndex != null ? `SHOT ${String(line.shotIndex + 1).padStart(2, '0')}` : '─')
                    const shotTone = line.shotIndex === -1
                      ? 'text-violet-300'
                      : (line.shotIndex != null ? 'text-amber-300' : 'text-gray-500')
                    return (
                      <li key={`${line.ts}-${idx}`} className="grid grid-cols-[80px_1fr] gap-2 items-baseline">
                        <span className={`${shotTone} text-[9px] uppercase tracking-wider`}>{shotLabel}</span>
                        <span className="text-gray-300 break-words">{line.msg}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
