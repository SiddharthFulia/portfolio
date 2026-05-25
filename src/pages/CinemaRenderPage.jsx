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

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Alert, message as antMessage } from 'antd'
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons'
import { getCinemaRender } from '../api/ai'
import CinemaRenderer from '../components/cinema/CinemaRenderer'

const POLL_INTERVAL_MS = 3000

export default function CinemaRenderPage() {
  const { renderId } = useParams()
  const [render, setRender] = useState(null)
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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
          <h1 className="text-2xl sm:text-3xl font-bold text-white">
            {project?.masterPrompt
              ? project.masterPrompt.slice(0, 120) + (project.masterPrompt.length > 120 ? '…' : '')
              : 'Untitled render'}
          </h1>
          <p className="text-[11px] font-mono text-gray-500 mt-1">
            project {render.projectId} · {render.shotCount} shots · status <span className="text-amber-300">{render.status}</span>
          </p>
        </header>

        {project && (
          <CinemaRenderer
            project={project}
            renderId={renderId}
            initialRender={render}
          />
        )}
      </div>
    </div>
  )
}
