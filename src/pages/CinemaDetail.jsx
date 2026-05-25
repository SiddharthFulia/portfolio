import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CopyOutlined, SendOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons'
import { message as antMessage } from 'antd'
import JobDetailPage from '../components/JobDetailPage'
import { getCinemaStatus, listCinemaRenders, getCinemaRenderLogs } from '../api/ai'

// CinemaDetail renders /cinema/:projectId. The cinema project itself
// isn't a single worker job — its logs are spread across N shot jobIds
// and the combine step, all tagged by cinemaRenderId in job_logs. So
// instead of the generic JobDetailPage worker transcript (which always
// shows "Worker transcript · 0 events" for cinema projects), we pull
// the latest render's unified-by-render log stream + add a Download
// button when the combine has finished.
//
// JobDetailPage's worker transcript section is hidden via hideLogs prop
// — we pass our own rich panel through renderOutput instead.

function CinemaOutput({ job }) {
  const navigate = useNavigate()
  const shots = Array.isArray(job?.shotPrompts) ? job.shotPrompts : []
  const copy = async (t) => {
    try { await navigator.clipboard.writeText(t); antMessage.success('Copied') } catch {}
  }
  const sendToAIVideo = (t) => {
    if (!t || !t.trim()) return
    const qs = new URLSearchParams({
      prompt: t.trim(),
      provider: 'optimized',
      mode: 'balanced',
      music: '1',
    }).toString()
    navigate(`/ai-video?${qs}`)
  }

  // ── Resolve the download URL — set onto cinema_projects.outputUrl by
  //     the BE orchestrator when the combine completes. Falls back to
  //     null when the project hasn't finished yet.
  const beBase = import.meta.env.VITE_BE_URL || ''
  const downloadHref = job?.outputUrl
    ? (job.outputUrl.startsWith('http') ? job.outputUrl : `${beBase}${job.outputUrl}`)
    : null

  // ── Latest-render unified logs. The cinema_renders table tracks one
  //     row per render attempt; we ask for the most recent and stream
  //     its logs. If the user has never rendered this project, this
  //     stays empty — that's accurate (there really are no logs yet).
  const [latestRender, setLatestRender] = useState(null)
  const [logs, setLogs] = useState([])
  const sinceRef = useRef(0)

  useEffect(() => {
    if (!job?.projectId) return
    let cancelled = false
    listCinemaRenders({ projectId: job.projectId, page: 1, pageSize: 1 }).then(({ data }) => {
      if (cancelled) return
      const row = Array.isArray(data?.items) ? data.items[0] : null
      setLatestRender(row || null)
    })
    return () => { cancelled = true }
  }, [job?.projectId])

  // Poll logs every 1.5s when the latest render is still running. Once
  // terminal, drop to a slow refresh (10s) so an already-completed
  // render still gets the occasional sync if the user leaves the tab open.
  useEffect(() => {
    if (!latestRender?.renderId) return undefined
    let cancelled = false
    const tick = async () => {
      const { data } = await getCinemaRenderLogs(latestRender.renderId, sinceRef.current, 500)
      if (cancelled || !data) return
      const incoming = Array.isArray(data.logs) ? data.logs : []
      if (incoming.length) {
        setLogs(prev => [...prev, ...incoming].slice(-2000))
        sinceRef.current = data.nextSince || sinceRef.current
      }
    }
    tick()
    const terminal = ['completed', 'failed', 'cancelled'].includes(latestRender.status)
    const id = setInterval(tick, terminal ? 10000 : 1500)
    return () => { cancelled = true; clearInterval(id) }
  }, [latestRender?.renderId, latestRender?.status])

  // Manual refresh — useful when the user just hit Render in another
  // tab and wants to pull the new log lines without waiting for the
  // next poll tick.
  const refreshLogs = async () => {
    if (!latestRender?.renderId) return
    sinceRef.current = 0
    setLogs([])
    const { data } = await getCinemaRenderLogs(latestRender.renderId, 0, 500)
    if (!data) return
    setLogs(Array.isArray(data.logs) ? data.logs : [])
    sinceRef.current = data.nextSince || 0
  }

  return (
    <div className="space-y-3">
      {/* Download + render-status banner. Shown only when there's a
          combine artifact to download or a render in flight worth
          tracking — keeps the page tidy for fresh, never-rendered
          projects. */}
      {(downloadHref || latestRender) && (
        <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/8 to-amber-500/8 p-4 flex flex-wrap items-center gap-3 justify-between">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300/80">— Latest render</p>
            <p className="text-sm text-white mt-1">
              {latestRender
                ? <>render <span className="font-mono text-amber-200">{latestRender.renderId.slice(-12)}</span> · status <span className="font-mono text-amber-200">{latestRender.status}</span></>
                : 'No render attempts yet — hit "Render" on a shot to start.'}
            </p>
          </div>
          {downloadHref && (
            <a href={downloadHref}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-emerald-500/50 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25">
              <DownloadOutlined /> Download combined mp4
            </a>
          )}
        </div>
      )}

      {/* Per-shot list + per-shot Render-in-AI-Video shortcut */}
      {shots.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-gray-900/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-amber-300">{shots.length} planned shots</h3>
            <span className="text-[10px] font-mono text-gray-500">
              {job.shotCount || shots.length} · {job.aspectRatio} · {job.resolution}
            </span>
          </div>
          {job.masterPrompt && (
            <p className="text-[11px] text-gray-400 leading-relaxed italic border-l-2 border-amber-500/40 pl-3">
              {job.masterPrompt}
            </p>
          )}
          <ol className="space-y-2">
            {shots.map((p, i) => (
              <li key={i} className="rounded-lg border border-gray-800 bg-black/40 p-3 hover:border-amber-500/40 transition-colors">
                <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
                  <span className="text-[10px] font-mono text-amber-400 font-bold">SHOT {i + 1}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => copy(p)}
                      className="text-[10px] flex items-center gap-1 px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300">
                      <CopyOutlined /> Copy
                    </button>
                    <button onClick={() => sendToAIVideo(p)}
                      className="text-[10px] flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/12 hover:bg-cyan-500/20 text-cyan-200 border border-cyan-500/40">
                      <SendOutlined /> Render
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-gray-300 font-mono leading-relaxed">{p}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Unified logs — replaces the generic "Worker transcript · 0
          events" panel (hidden via JobDetailPage's hideLogs prop). Logs
          come from job_logs filtered by cinemaRenderId, ordered ASC by
          ts, with `shotIndex` computed server-side. */}
      {latestRender && (
        <section className="rounded-2xl border border-gray-800 bg-gray-900/40 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800 bg-gradient-to-r from-amber-500/8 to-fuchsia-500/5">
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${
                latestRender.status === 'completed' ? 'bg-emerald-400'
                : latestRender.status === 'failed' ? 'bg-rose-400'
                : 'bg-amber-400 animate-pulse'
              }`} />
              <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-300">
                Combined logs · {logs.length} {logs.length === 1 ? 'event' : 'events'}
              </span>
            </div>
            <button onClick={refreshLogs}
              className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white transition-colors">
              <ReloadOutlined className="text-[9px]" /> Refresh
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto p-3 bg-black/40">
            {logs.length === 0 ? (
              <p className="text-center text-gray-600 text-xs py-6">
                No logs yet — they stream in as each shot runs.
              </p>
            ) : (
              <ul className="space-y-0.5 text-[11px] font-mono leading-snug">
                {logs.slice(-200).map((line, idx) => {
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
        </section>
      )}
    </div>
  )
}

export default function CinemaDetail() {
  return <JobDetailPage
    lane="cinema"
    title="Cinema"
    accentClass="text-white"
    backTo="/cinema"
    getStatus={getCinemaStatus}
    idKey="projectId"
    hideLogs
    renderOutput={(job) => <CinemaOutput job={job} />}
  />
}
