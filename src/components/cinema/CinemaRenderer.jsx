// CinemaRenderer — sequential multi-shot video rendering with
// client-side frame continuity. Runs entirely in the browser by
// chaining the existing /api/ai-video/generate endpoint per shot.
//
// Flow (all in the FE — no BE orchestrator needed):
//   1. For shot 0: text-to-video via /api/ai-video/generate.
//   2. Poll /api/ai-video/status/:jobId until 'completed'.
//   3. Load the resulting mp4 in a hidden <video>, seek to the last
//      frame, paint to a <canvas>, export as a JPEG Blob.
//   4. Upload that Blob via /api/ai-video/upload-image → get a public URL.
//   5. For shot N (N>0): image-to-video, passing the URL from step 4
//      as imageUrl so the next clip starts exactly where the previous
//      one ended. Same poll loop.
//   6. After all shots complete, POST /api/combine with the ordered
//      videoIds → poll until the stitched mp4 is ready → download.
//
// No BE changes are required — the existing image-to-video providers
// (Wan 2.2 5B on the 5090 lane, in particular) already accept imageUrl
// and the worker uses it as the first frame.

import { useEffect, useRef, useState } from 'react'
import { Modal, Progress, message as antMessage } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import { Button } from '../ui'
import {
  generateVideo, getJobStatus, uploadSourceImage,
  combineCreate, combineStatus, combineFileUrl,
  patchCinemaRender,
} from '../../api/ai'

const POLL_MS                 = 2500
const COMBINE_POLL_MS         = 2000
const FRAME_EXTRACT_TIMEOUT_MS = 30_000

// Phases for the top-level renderer status pill.
const PHASES = {
  idle:       { label: 'Idle',                tone: 'text-fg-muted' },
  rendering:  { label: 'Rendering shot',      tone: 'text-amber-300' },
  extracting: { label: 'Extracting frame',    tone: 'text-cyan-300' },
  uploading:  { label: 'Uploading frame',     tone: 'text-cyan-300' },
  combining:  { label: 'Combining',           tone: 'text-amber-300' },
  done:       { label: 'Done',                tone: 'text-emerald-300' },
  failed:     { label: 'Failed',              tone: 'text-rose-300' },
  cancelled:  { label: 'Cancelled',           tone: 'text-fg-muted' },
}

// One row per shot. `status` matches the worker's job status verbs so
// we can pretty-print without a translation table.
const initialShotState = (prompt) => ({
  prompt,
  status: 'pending',           // pending | queued | processing | extracting | uploading | completed | failed
  jobId: null,
  videoUrl: null,
  videoId: null,
  sourceImageUrl: null,        // null for shot 0; populated from previous shot's last frame for shot N>0
  logs: [],
  error: null,
  progressPercent: 0,
  startedAtMs: null,
  completedAtMs: null,
})

// extractLastFrame — load a remote mp4 into a hidden <video>, seek to
// `duration - 0.05` (just shy of the final frame to avoid the often-black
// 1-frame tail), paint into a <canvas>, export as a JPEG blob. The
// crossOrigin attribute is set because Cloudinary serves with proper CORS;
// without it the canvas would be tainted and toBlob would throw.
async function extractLastFrame(videoUrl) {
  return new Promise((resolve, reject) => {
    const videoElement = document.createElement('video')
    videoElement.crossOrigin = 'anonymous'
    videoElement.preload = 'auto'
    videoElement.muted = true                // required for autoplay-style media operations on some browsers
    videoElement.playsInline = true
    videoElement.src = videoUrl

    const timeoutHandle = setTimeout(() => {
      reject(new Error('Frame extraction timed out (video too slow to load)'))
    }, FRAME_EXTRACT_TIMEOUT_MS)

    videoElement.addEventListener('loadedmetadata', () => {
      const totalDuration = Number.isFinite(videoElement.duration) ? videoElement.duration : 0
      const seekTarget = Math.max(0, totalDuration - 0.05)
      try {
        videoElement.currentTime = seekTarget
      } catch (seekError) {
        clearTimeout(timeoutHandle)
        reject(seekError)
      }
    })

    videoElement.addEventListener('seeked', () => {
      try {
        const canvasElement = document.createElement('canvas')
        canvasElement.width  = videoElement.videoWidth
        canvasElement.height = videoElement.videoHeight
        const canvasContext = canvasElement.getContext('2d')
        canvasContext.drawImage(videoElement, 0, 0)
        canvasElement.toBlob((frameBlob) => {
          clearTimeout(timeoutHandle)
          if (!frameBlob) {
            reject(new Error('Canvas toBlob returned null — frame paint failed'))
            return
          }
          resolve(frameBlob)
        }, 'image/jpeg', 0.92)
      } catch (paintError) {
        clearTimeout(timeoutHandle)
        reject(paintError)
      }
    })

    videoElement.addEventListener('error', () => {
      clearTimeout(timeoutHandle)
      reject(new Error('Video element error — could not load source URL'))
    })
  })
}

// pollJobUntilTerminal — small loop around getJobStatus that resolves
// when status is 'completed' or 'failed'. Calls onTick with the latest
// row so the UI can update progress + per-shot logs as it goes.
async function pollJobUntilTerminal(jobId, onTick, isCancelledRef) {
  while (!isCancelledRef.current) {
    const { data: jobRow, error: pollError } = await getJobStatus(jobId)
    if (pollError) {
      // Network blips are transient — keep polling.
      await new Promise(sleepResolve => setTimeout(sleepResolve, POLL_MS))
      continue
    }
    if (jobRow) {
      onTick(jobRow)
      if (jobRow.status === 'completed') return { ok: true, row: jobRow }
      if (jobRow.status === 'failed') {
        return { ok: false, error: jobRow.error || 'Worker reported failure', row: jobRow }
      }
    }
    await new Promise(sleepResolve => setTimeout(sleepResolve, POLL_MS))
  }
  return { ok: false, error: 'Cancelled', row: null }
}

// CinemaRenderer — now takes optional `renderId` + `initialRender` props.
// When set (the standalone /cinema/render/:renderId page passes them),
// the component:
//   • hydrates initial state from the BE render row (so refresh resumes
//     where the previous tab stopped — currentShotIndex, shotJobIds,
//     combineJobId, finalDownloadHref, etc. all come from the row)
//   • PATCHes the row on every transition so the next refresh / shared
//     link sees the same state
//   • does NOT auto-start the chain — the user clicks Start/Resume.
//     Auto-restart on refresh would risk duplicate shot generations if
//     two tabs are open.
// When `renderId` is absent, the component behaves like before (purely
// in-memory; used by Cinema.jsx's planner view to show the initial UI
// before kicking off a render).
export default function CinemaRenderer({ project, renderId, initialRender }) {
  const shotPrompts = Array.isArray(project?.shotPrompts) ? project.shotPrompts : []
  const projectDuration   = project?.durationPerShot || 5
  const projectAspect     = project?.aspectRatio     || '16:9'
  const projectResolution = project?.resolution      || '720p'

  // Hydrate per-shot state from `initialRender.shotJobIds` if present:
  // every populated entry means that shot was at least kicked off, so
  // we map it to a status='completed' row with the jobId. The chain
  // skips already-completed shots on Resume.
  const initialShots = () => {
    const base = shotPrompts.map(initialShotState)
    if (initialRender?.shotJobIds) {
      initialRender.shotJobIds.forEach((jobId, idx) => {
        if (jobId && base[idx]) {
          base[idx] = { ...base[idx], jobId, videoId: jobId, status: 'completed', progressPercent: 100 }
        }
      })
    }
    return base
  }

  const [shots, setShots] = useState(initialShots)
  const [phase, setPhase] = useState(() => initialRender?.phase || 'idle')
  const [currentShotIndex, setCurrentShotIndex] = useState(() => initialRender?.currentShotIndex || 0)
  const [combineJobId, setCombineJobId] = useState(() => initialRender?.combineJobId || null)
  const [combineRow, setCombineRow] = useState(null)
  const [finalDownloadHref, setFinalDownloadHref] = useState(() => initialRender?.finalDownloadHref || '')
  const [pipelineError, setPipelineError] = useState(() => initialRender?.error || '')

  // Cancellation flag — flipped by the Cancel button. Read inside the
  // poll loop so an in-flight wait can break out cleanly.
  const isCancelledRef = useRef(false)

  // Tiny helper to PATCH the BE render row. Fire-and-forget — the chain
  // doesn't wait on it. Errors are silently swallowed (the next PATCH
  // overrides them) so a flaky BE doesn't break the user's render.
  const persist = (patch) => {
    if (!renderId) return
    patchCinemaRender(renderId, patch).catch(() => {})
  }

  // Re-init shots whenever the project changes (new plan).
  useEffect(() => {
    setShots(initialShots())
    setPhase(initialRender?.phase || 'idle')
    setCurrentShotIndex(initialRender?.currentShotIndex || 0)
    setCombineJobId(initialRender?.combineJobId || null)
    setCombineRow(null)
    setFinalDownloadHref(initialRender?.finalDownloadHref || '')
    setPipelineError(initialRender?.error || '')
    isCancelledRef.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.projectId, shotPrompts.length, renderId])

  // Helper to patch a single shot row by index.
  const patchShot = (shotIndex, patchObject) => {
    setShots(previousShots => previousShots.map((shotRow, rowIndex) =>
      rowIndex === shotIndex ? { ...shotRow, ...patchObject } : shotRow
    ))
  }

  // startRender — kick off the chain. On the standalone render page
  // (renderId set) we skip the confirm modal — the user already
  // confirmed on the previous page. On the planner page (no renderId)
  // this function isn't called anyway; the planner has its own button
  // that creates the render row + navigates.
  async function startRender({ resume = false } = {}) {
    if (!shotPrompts.length) return
    if (phase === 'rendering' || phase === 'extracting' || phase === 'uploading' || phase === 'combining') {
      antMessage.warning('Already running — Cancel first if you want to restart')
      return
    }
    const startFromShotIndex = resume ? (currentShotIndex || 0) : 0
    if (renderId) {
      // Standalone page — start immediately, no second confirm.
      runPipeline({ startFromShotIndex })
      return
    }
    Modal.confirm({
      title: `Render ${shotPrompts.length} shots back-to-back?`,
      content: (
        <div className="text-sm space-y-2">
          <p>
            This will generate <span className="font-semibold text-amber-300">shot 1</span> from text,
            then use its <span className="font-semibold text-cyan-300">last frame</span> as the starting frame for
            shot 2, and so on through shot {shotPrompts.length}.
          </p>
          <p className="text-fg-muted text-xs">
            Each shot takes ~60–90s. Total wall time ≈ {Math.ceil(shotPrompts.length * 75 / 60)}m.
            Finally the {shotPrompts.length} clips are stitched into one mp4.
          </p>
        </div>
      ),
      okText: 'Start rendering',
      cancelText: 'Back',
      autoFocusButton: 'ok',
      centered: true,
      onOk: () => runPipeline({ startFromShotIndex }),
    })
  }

  // runPipeline — the actual chain. Sequential by design (each shot's
  // start frame depends on the previous shot's end frame, so we can't
  // parallelize). Cancellation flag is checked between every async
  // step so the worst-case wait after pressing Cancel is one poll tick.
  //
  // When `renderId` is set, every status / phase / shot transition is
  // PATCHed to the BE render row, so a refresh / new tab can see where
  // the chain is. When `startFromShotIndex` > 0, the loop SKIPS those
  // shots — used on Resume after a refresh so completed shots aren't
  // re-generated (which would duplicate Cloudinary assets + burn GPU
  // for no reason).
  async function runPipeline({ startFromShotIndex = 0 } = {}) {
    isCancelledRef.current = false
    setPipelineError('')
    // If resuming, preserve the existing shot rows for already-completed
    // shots — only the rest get reset. Fresh start (idx=0) resets all.
    if (startFromShotIndex === 0) {
      setShots(shotPrompts.map(initialShotState))
      setCombineJobId(null)
      setCombineRow(null)
      setFinalDownloadHref('')
    }

    // Seed completedVideoIds from already-finished shots in the current
    // state so the final combine step has the full ordered list.
    const completedVideoIds = shots.slice(0, startFromShotIndex)
      .map(s => s.videoId).filter(Boolean)
    let previousFrameUrl = startFromShotIndex > 0
      ? shots[startFromShotIndex - 1]?.sourceImageUrl || null
      : null

    persist({ status: 'rendering', phase: 'rendering', error: null })

    for (let shotIndex = startFromShotIndex; shotIndex < shotPrompts.length; shotIndex += 1) {
      if (isCancelledRef.current) {
        setPhase('cancelled')
        return
      }
      setCurrentShotIndex(shotIndex)
      setPhase('rendering')

      // 1) Submit the generate request for this shot.
      patchShot(shotIndex, {
        status: 'queued',
        startedAtMs: Date.now(),
        sourceImageUrl: previousFrameUrl,
      })

      const { data: submitData, error: submitError } = await generateVideo(
        shotPrompts[shotIndex],
        {
          provider:    'optimized',           // 5090 lane — Wan 2.2 5B, supports i2v
          mode:        'balanced',            // ~60-90s per shot
          duration:    projectDuration,
          aspectRatio: projectAspect,
          resolution:  projectResolution,
          imageUrl:    previousFrameUrl || '',
          withMusic:   false,                 // music gets added once at the combine step
          generateCaption: false,
        },
      )
      if (submitError || !submitData?.jobId) {
        const messageText = submitError || 'Failed to queue shot'
        patchShot(shotIndex, { status: 'failed', error: messageText })
        setPipelineError(`Shot ${shotIndex + 1}: ${messageText}`)
        setPhase('failed')
        antMessage.error(messageText)
        return
      }
      patchShot(shotIndex, { jobId: submitData.jobId, status: 'processing' })
      // Persist the new jobId in the BE row so refresh sees this shot
      // as in-flight + can tail its logs via /api/job-logs/ai-video/<jobId>.
      {
        const nextJobIds = shots.map(s => s.videoId || s.jobId)
        nextJobIds[shotIndex] = submitData.jobId
        persist({ shotJobIds: nextJobIds, currentShotIndex: shotIndex, phase: 'rendering' })
      }

      // 2) Poll until terminal.
      const pollResult = await pollJobUntilTerminal(
        submitData.jobId,
        (latestRow) => {
          patchShot(shotIndex, {
            status: latestRow.status || 'processing',
            progressPercent: typeof latestRow.progress === 'number' ? latestRow.progress : 0,
            videoUrl: latestRow.videoUrl || null,
            videoId: latestRow.videoId || null,
          })
        },
        isCancelledRef,
      )
      if (!pollResult.ok) {
        patchShot(shotIndex, { status: 'failed', error: pollResult.error })
        setPipelineError(`Shot ${shotIndex + 1}: ${pollResult.error}`)
        setPhase(isCancelledRef.current ? 'cancelled' : 'failed')
        return
      }
      const finishedRow = pollResult.row
      const finishedVideoUrl = finishedRow.videoUrl
      const finishedVideoId  = finishedRow.videoId
      if (!finishedVideoUrl || !finishedVideoId) {
        const messageText = 'Worker reported completed but returned no videoUrl/videoId'
        patchShot(shotIndex, { status: 'failed', error: messageText })
        setPipelineError(`Shot ${shotIndex + 1}: ${messageText}`)
        setPhase('failed')
        return
      }
      patchShot(shotIndex, {
        status: 'completed',
        completedAtMs: Date.now(),
        videoUrl: finishedVideoUrl,
        videoId: finishedVideoId,
        progressPercent: 100,
      })
      completedVideoIds.push(finishedVideoId)
      {
        const nextJobIds = shots.map(s => s.videoId || s.jobId)
        nextJobIds[shotIndex] = finishedVideoId
        persist({ shotJobIds: nextJobIds, currentShotIndex: shotIndex + 1 })
      }

      // 3) For all shots except the last, extract last frame + upload
      //    so the next iteration can use it as imageUrl.
      const isLastShot = shotIndex === shotPrompts.length - 1
      if (!isLastShot) {
        setPhase('extracting')
        persist({ phase: 'extracting' })
        let frameBlob
        try {
          frameBlob = await extractLastFrame(finishedVideoUrl)
        } catch (extractError) {
          patchShot(shotIndex, { error: `Frame extract: ${extractError.message}` })
          setPipelineError(`Shot ${shotIndex + 1} extract: ${extractError.message}`)
          setPhase('failed')
          return
        }

        setPhase('uploading')
        persist({ phase: 'uploading' })
        const frameFile = new File([frameBlob], `cinema-${project.projectId}-shot${shotIndex + 1}-tail.jpg`, {
          type: 'image/jpeg',
        })
        const { data: uploadData, error: uploadError } = await uploadSourceImage(frameFile)
        if (uploadError || !uploadData?.url) {
          const messageText = uploadError || 'Upload returned no URL'
          patchShot(shotIndex, { error: `Frame upload: ${messageText}` })
          setPipelineError(`Shot ${shotIndex + 1} upload: ${messageText}`)
          setPhase('failed')
          return
        }
        previousFrameUrl = uploadData.url
      }
    }

    if (isCancelledRef.current) {
      setPhase('cancelled')
      return
    }

    // 4) Combine — POST to /api/combine with the ordered videoIds.
    setPhase('combining')
    persist({ phase: 'combining', status: 'combining' })
    const combineSources = completedVideoIds.map(videoId => ({ videoId }))
    const { data: combineCreateData, error: combineCreateError } = await combineCreate({
      sources: combineSources,
      title: `Cinema · ${project.masterPrompt?.slice(0, 60) || project.projectId}`,
    })
    if (combineCreateError || !combineCreateData?.jobId) {
      const messageText = combineCreateError || 'Combine create returned no jobId'
      setPipelineError(`Combine: ${messageText}`)
      setPhase('failed')
      return
    }
    setCombineJobId(combineCreateData.jobId)
    persist({ combineJobId: combineCreateData.jobId })

    // 5) Poll combine status until terminal — separate loop because
    //    combine status lives at a different endpoint than per-shot.
    while (!isCancelledRef.current) {
      const { data: combineStatusData, error: combineStatusError } = await combineStatus(combineCreateData.jobId)
      if (combineStatusError) {
        await new Promise(sleepResolve => setTimeout(sleepResolve, COMBINE_POLL_MS))
        continue
      }
      if (combineStatusData) {
        setCombineRow(combineStatusData)
        if (combineStatusData.status === 'completed') {
          const href = combineFileUrl(combineCreateData.jobId)
          setFinalDownloadHref(href)
          setPhase('done')
          persist({ status: 'completed', phase: 'done', finalDownloadHref: href })
          antMessage.success('Cinema render complete — Download to save the mp4')
          return
        }
        if (combineStatusData.status === 'failed') {
          const msg = `Combine: ${combineStatusData.error || 'unknown failure'}`
          setPipelineError(msg)
          setPhase('failed')
          persist({ status: 'failed', phase: 'failed', error: msg })
          return
        }
      }
      await new Promise(sleepResolve => setTimeout(sleepResolve, COMBINE_POLL_MS))
    }
    if (isCancelledRef.current) setPhase('cancelled')
  }

  function cancelPipeline() {
    isCancelledRef.current = true
    persist({ status: 'cancelled', phase: 'cancelled' })
  }

  if (!shotPrompts.length) return null

  const phaseMeta = PHASES[phase] || PHASES.idle
  const isRunning = phase === 'rendering' || phase === 'extracting' || phase === 'uploading' || phase === 'combining'

  return (
    <section className="luxe-card p-5 sm:p-6 mb-6 border-amber-500/30">
      {/* Header — title + global status + start/cancel */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-amber-300/80">— Inline render</p>
          <h3 className="mt-1 text-lg font-bold text-fg-primary tabular-nums">
            {shotPrompts.length} shots · {projectDuration}s each · {projectAspect} · {projectResolution}
          </h3>
          <p className="mt-1 text-xs text-fg-muted">
            Sequential chain — last frame of each shot becomes the first frame of the next.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-mono uppercase tracking-wider ${phaseMeta.tone}`}>
            {phaseMeta.label}{isRunning && currentShotIndex >= 0 ? ` ${currentShotIndex + 1}/${shotPrompts.length}` : ''}
          </span>
          {!isRunning && phase !== 'done' && (
            <Button variant="primary"
              onClick={() => {
                // Resume from currentShotIndex when there's already
                // work done on this render (refresh case). Fresh render
                // starts from 0.
                const hasProgress = currentShotIndex > 0
                  || shots.some(s => s.videoId)
                  || phase === 'failed' || phase === 'cancelled'
                startRender({ resume: hasProgress })
              }}>
              {phase === 'failed' || phase === 'cancelled'
                ? `Resume from shot ${(currentShotIndex || 0) + 1}`
                : (currentShotIndex > 0 || shots.some(s => s.videoId)
                    ? `Resume from shot ${(currentShotIndex || 0) + 1}`
                    : 'Render all shots')}
            </Button>
          )}
          {isRunning && (
            <Button variant="danger" onClick={cancelPipeline}>
              Cancel
            </Button>
          )}
        </div>
      </div>

      {pipelineError && (
        <p className="mb-3 text-xs font-mono text-rose-300 break-words">{pipelineError}</p>
      )}

      {/* Per-shot rows */}
      <ol className="space-y-2">
        {shots.map((shotRow, shotIndex) => (
          <li key={shotIndex} className="luxe-card p-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] font-mono text-amber-400 font-bold tabular-nums">
                    SHOT {String(shotIndex + 1).padStart(2, '0')}
                  </span>
                  <span className={`text-[10px] font-mono uppercase tracking-wider ${
                    shotRow.status === 'completed' ? 'text-emerald-300'
                    : shotRow.status === 'failed' ? 'text-rose-300'
                    : shotRow.status === 'processing' || shotRow.status === 'queued' ? 'text-amber-300'
                    : 'text-fg-muted'
                  }`}>
                    {shotRow.status}
                  </span>
                  {shotRow.sourceImageUrl && (
                    <span className="text-[10px] font-mono text-cyan-300/80">
                      ← from shot {shotIndex} tail frame
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-gray-300 font-mono leading-relaxed">
                  {shotRow.prompt}
                </p>
                {(shotRow.status === 'queued' || shotRow.status === 'processing') && (
                  <Progress
                    percent={shotRow.progressPercent || 0} size="small" showInfo={false}
                    strokeColor="#fbbf24" trailColor="#1f2937"
                    className="!mt-2 !mb-0"
                  />
                )}
                {shotRow.error && (
                  <p className="mt-2 text-[10px] font-mono text-rose-400 break-words">{shotRow.error}</p>
                )}
              </div>
              {shotRow.videoUrl && (
                <video
                  src={shotRow.videoUrl} muted playsInline preload="metadata" controls
                  className="w-40 aspect-video rounded-md border border-line"
                />
              )}
            </div>
          </li>
        ))}
      </ol>

      {/* Combine row */}
      {(phase === 'combining' || phase === 'done' || combineJobId) && (
        <div className="mt-4 pt-4 border-t border-line">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-amber-300/80">— Final combine</p>
              <h4 className="mt-1 text-sm font-semibold text-fg-primary tabular-nums">
                {combineRow?.status === 'completed' ? 'Stitched mp4 ready' : `ffmpeg-concat #${combineJobId}`}
              </h4>
            </div>
            {phase === 'done' && finalDownloadHref ? (
              <a href={finalDownloadHref}
                className="text-xs font-semibold px-3 py-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 inline-flex items-center gap-1.5">
                <DownloadOutlined /> Download final mp4
              </a>
            ) : (
              <span className="text-[11px] font-mono text-amber-300 uppercase tracking-wider">
                {combineRow?.status || 'queued'} · {combineRow?.progress || 0}%
              </span>
            )}
          </div>
          {(combineRow?.status === 'queued' || combineRow?.status === 'processing') && (
            <Progress
              percent={combineRow?.progress || 0} size="small" showInfo={false}
              strokeColor="#fbbf24" trailColor="#1f2937"
              className="!mt-2"
            />
          )}
        </div>
      )}
    </section>
  )
}
