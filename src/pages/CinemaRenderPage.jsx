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
import { ArrowLeftOutlined, ReloadOutlined, ExpandAltOutlined, FileSearchOutlined } from '@ant-design/icons'
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
  // §69 — read-only "everything we sent to the model" panel. Pulls
  // from `project` + `render` already on this page; never edits.
  const [specsOpen, setSpecsOpen] = useState(false)
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
      <div className="min-h-screen bg-[#0a0a0e] text-gray-100 pt-24 sm:pt-32 pb-16 px-4 sm:px-6">
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
      <div className="min-h-screen bg-[#0a0a0e] text-gray-100 pt-24 sm:pt-32 pb-16 px-4 sm:px-6">
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSpecsOpen(true)}
              title="See every input + rule the chain is using for this render"
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full border border-cyan-500/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20 transition-colors"
            >
              <FileSearchOutlined className="text-[11px]" /> Render specs
            </button>
            <div className="text-[10px] font-mono text-gray-500">
              render <span className="text-gray-300">{renderId}</span>
            </div>
          </div>
        </div>

        <header className="pb-2 border-b border-gray-800">
          <p className="eyebrow-mono mb-2">Cinema · live render</p>
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
              <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-amber-300/80">Unified logs</p>
              <p className="text-xs text-fg-muted mt-1">
                Every log line across all {render.shotCount} shots + the combine step, ordered by time.
              </p>
            </div>
            <span className="text-[11px] font-mono text-gray-400">
              {unifiedLogsOpen ? '▾ collapse' : '▸ open'}
            </span>
          </button>
          {unifiedLogsOpen && (
            <div className="mt-3 max-h-[480px] overflow-y-auto rounded-md border border-line bg-surface-elevated p-2">
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

        <RenderSpecsModal
          open={specsOpen}
          onClose={() => setSpecsOpen(false)}
          project={project}
          render={render}
        />
      </div>
    </div>
  )
}

// ── RenderSpecsModal ──────────────────────────────────────────────
// Read-only viewer for every input + rule the chain is using for
// THIS render. Pure render of project + render row data already on
// the page; never writes. Sections:
//   • Master prompt + project metadata
//   • Engine / Mode / Beast model
//   • Locked seed + motion strength + duration / aspect / resolution
//   • Director modes (Continuity / Realism / Overlap)
//   • Hero image preview
//   • Continuity bible (6 fields)
//   • Director state (physicalState, cameraState, emotionArc,
//                     negativeContinuityRules)
//   • Per-shot list — action prompt + per-shot music + jobId
//
// Mobile-friendly — antd Modal full-screen below sm, scrolls within
// the modal body, all rows use grid layouts that wrap.
function RenderSpecsModal({ open, onClose, project, render }) {
  if (!project && !render) return null
  const bible = project?.continuityBible || {}
  const ds = project?.directorState || {}
  const phys = ds.physicalState || {}
  const cam = ds.cameraState || {}
  const arc = ds.emotionArc || {}
  const rules = Array.isArray(ds.negativeContinuityRules) ? ds.negativeContinuityRules : []
  const shotPrompts = Array.isArray(project?.shotPrompts) ? project.shotPrompts : []
  const shotMusic = Array.isArray(project?.shotMusic) ? project.shotMusic : []
  const shotJobIds = Array.isArray(render?.shotJobIds) ? render.shotJobIds : []

  // — small read-only key/value row used throughout the modal.
  const KV = ({ k, v, mono = true }) => (
    <div className="grid grid-cols-[120px_1fr] gap-2 items-baseline">
      <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">{k}</span>
      <span className={`text-[12px] text-gray-200 ${mono ? 'font-mono' : ''} break-words`}>
        {v != null && v !== '' ? String(v) : <span className="text-gray-600 italic">—</span>}
      </span>
    </div>
  )
  const Section = ({ title, accent = 'amber', children }) => {
    const toneText  = accent === 'cyan'    ? 'text-cyan-300/80'
                    : accent === 'emerald' ? 'text-emerald-300/80'
                    : accent === 'rose'    ? 'text-rose-300/80'
                    :                         'text-amber-300/80'
    const toneBorder = accent === 'cyan'    ? 'border-cyan-500/30'
                     : accent === 'emerald' ? 'border-emerald-500/30'
                     : accent === 'rose'    ? 'border-rose-500/30'
                     :                         'border-amber-500/30'
    return (
      <section className={`luxe-card p-3 border ${toneBorder}`}>
        <p className={`text-[10px] font-mono uppercase tracking-[0.3em] ${toneText} mb-2`}>{title}</p>
        {children}
      </section>
    )
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      centered
      width={780}
      title={
        <span className="inline-flex items-center gap-2">
          <FileSearchOutlined />
          <span>Render specs</span>
          <span className="text-[10px] font-mono text-gray-500 font-normal normal-case tracking-normal">read-only · what the chain is using</span>
        </span>
      }
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
    >
      <div className="space-y-3">
        <Section title="Project" accent="amber">
          <div className="space-y-1.5">
            <KV k="projectId"  v={project?.projectId} />
            <KV k="renderId"   v={render?.renderId} />
            <KV k="status"     v={render?.status} />
            <KV k="phase"      v={render?.phase} />
            <KV k="shotCount"  v={render?.shotCount ?? project?.shotCount} />
            <KV k="duration"   v={project?.durationPerShot ? `${project.durationPerShot}s per shot` : null} />
            <KV k="aspect"     v={project?.aspectRatio} />
            <KV k="resolution" v={project?.resolution} />
          </div>
          <div className="mt-2 pt-2 border-t border-line/30">
            <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-1">master prompt</p>
            <p className="text-[12px] text-gray-200 leading-relaxed font-mono whitespace-pre-wrap">
              {project?.masterPrompt || <span className="text-gray-600 italic">—</span>}
            </p>
          </div>
        </Section>

        <Section title="Engine + model" accent="amber">
          <div className="space-y-1.5">
            <KV k="provider"  v={render?.provider} />
            {render?.provider === 'optimized' && <KV k="mode"       v={render?.optimizedMode} />}
            {render?.provider === 'local'     && <KV k="beastModel" v={render?.beastModel || 'wan-2.2'} />}
            <KV k="lockedSeed"     v={project?.lockedSeed} />
            <KV k="motionStrength" v={project?.motionStrength} />
          </div>
        </Section>

        <Section title="Director modes" accent="cyan">
          <div className="space-y-1.5">
            <KV k="continuity" v={project?.continuityMode === false ? 'off' : 'ON'} />
            <KV k="realism"    v={project?.realismMode    === false ? 'off' : 'ON'} />
            <KV k="overlap"    v={project?.overlapMode             ?  'ON' : 'off'} />
          </div>
        </Section>

        {project?.heroImageUrl ? (
          <Section title="Hero image" accent="amber">
            <img
              src={project.heroImageUrl}
              alt="hero"
              className="w-full max-w-md aspect-video object-cover rounded border border-line"
            />
            <p className="text-[10px] font-mono text-gray-500 mt-1.5 break-all">{project.heroImageUrl}</p>
          </Section>
        ) : (
          <Section title="Hero image" accent="amber">
            <p className="text-[11px] text-gray-500 italic">No hero set — chain ran T2V on shot 1.</p>
          </Section>
        )}

        <Section title="Continuity bible" accent="amber">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {['subject', 'wardrobe', 'environment', 'lighting', 'camera', 'palette'].map(k => (
              <KV key={k} k={k} v={bible[k]} />
            ))}
          </div>
        </Section>

        <Section title="Physical state" accent="cyan">
          <div className="space-y-1.5">
            {['screenDirection', 'subjectMotion', 'windDirection', 'snowDirection', 'weatherIntensity', 'terrain', 'timeOfDay'].map(k => (
              <KV key={k} k={k} v={phys[k]} />
            ))}
          </div>
        </Section>

        <Section title="Camera state" accent="cyan">
          <div className="space-y-1.5">
            {['lens', 'height', 'movement', 'energy', 'stabilization'].map(k => (
              <KV key={k} k={k} v={cam[k]} />
            ))}
          </div>
        </Section>

        <Section title="Emotion arc" accent="emerald">
          <div className="space-y-1.5">
            {['start', 'middle', 'end'].map(k => <KV key={k} k={k} v={arc[k]} />)}
          </div>
        </Section>

        <Section title={`Negative continuity rules · ${rules.length}`} accent="rose">
          {rules.length === 0 ? (
            <p className="text-[11px] text-gray-500 italic">No rules — chain uses only the built-in director negatives.</p>
          ) : (
            <ul className="space-y-0.5 text-[12px] font-mono leading-snug text-gray-200 list-disc pl-4">
              {rules.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          )}
        </Section>

        <Section title={`Shots · ${shotPrompts.length}`} accent="amber">
          <ol className="space-y-2">
            {shotPrompts.map((action, idx) => (
              <li key={idx} className="rounded-md border border-line bg-surface-elevated p-2.5">
                <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                  <span className="text-[10px] font-mono text-amber-400 font-bold">
                    SHOT {String(idx + 1).padStart(2, '0')}
                  </span>
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-gray-500">
                    {shotMusic[idx] && <span className="text-emerald-300">music ON</span>}
                    {shotJobIds[idx] && (
                      <span className="text-gray-400">job {String(shotJobIds[idx]).slice(-10)}</span>
                    )}
                  </div>
                </div>
                <p className="text-[12px] text-gray-200 font-mono leading-relaxed whitespace-pre-wrap">
                  {action}
                </p>
              </li>
            ))}
          </ol>
        </Section>
      </div>
    </Modal>
  )
}
