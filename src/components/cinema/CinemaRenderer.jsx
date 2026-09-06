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
import { Modal, Progress } from 'antd'
import { notice } from '../../lib/notice'
import { DownloadOutlined } from '@ant-design/icons'
import { Button } from '../ui'
import JobLogsAgentPlan from '../JobLogsAgentPlan'
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

  // Hydrate per-shot state from `initialRender.shotJobIds` if present.
  // Every populated entry means the shot was at least kicked off — but
  // it might still be processing / failed / completed. We mark every
  // populated jobId as 'processing' optimistically; an effect below
  // then fetches /api/ai-video/status/:jobId for each and patches in
  // the real status + videoUrl. Without that fetch the user would see
  // "all shots completed" on refresh even when shots 2/3/4 were still
  // running on the worker.
  const initialShots = () => {
    const base = shotPrompts.map(initialShotState)
    if (initialRender?.shotJobIds) {
      initialRender.shotJobIds.forEach((jobId, idx) => {
        if (jobId && base[idx]) {
          base[idx] = { ...base[idx], jobId, videoId: jobId, status: 'processing' }
        }
      })
    }
    return base
  }

  const [shots, setShots] = useState(initialShots)
  const [phase, setPhase] = useState(() => initialRender?.phase || 'idle')
  const [currentShotIndex, setCurrentShotIndex] = useState(() => initialRender?.currentShotIndex || 0)
  const [combineJobId, setCombineJobId] = useState(() => initialRender?.combineJobId || null)
  // Per-shot accordion. Set of shot indices that are EXPANDED. Default
  // is "auto" — in-flight shots open themselves, completed shots stay
  // closed so the user isn't staring at the AgentPlan tree's
  // boilerplate "Setup / Generate / Post-process · pending" for shots
  // whose logs have already expired. Manual click overrides.
  const [expandedShots, setExpandedShots] = useState(() => new Set())
  const [combineExpanded, setCombineExpanded] = useState(false)
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

  // Hydrate per-shot REAL status + videoUrl from the BE for each
  // populated jobId. The render row only stores jobIds (not status or
  // videoUrl), so without this the cards would show:
  //   - all shots as 'processing' even when several are completed
  //   - no inline <video> preview because shotRow.videoUrl is missing
  //
  // Polls in two modes:
  //   1) ONE-SHOT — whenever the render row's shotJobIds array changes
  //      (a new shot was queued by the orchestrator). Re-hydrates every
  //      shot's status + videoUrl.
  //   2) PERIODIC — every 3s as long as ANY shot is still in a
  //      non-terminal state. This is the critical bit for the
  //      BE-driven chain: after all N shots are queued the array
  //      stops changing, so without periodic polling we'd never see
  //      shot 4's completion or its videoUrl until a manual refresh.
  //      Stops on its own once every shot is terminal.
  useEffect(() => {
    const jobIdsToHydrate = (initialRender?.shotJobIds || [])
      .map((jobId, idx) => ({ jobId, idx }))
      .filter(entry => entry.jobId)
    if (jobIdsToHydrate.length === 0) return
    let cancelled = false

    const hydrateOnce = async () => {
      const results = await Promise.all(jobIdsToHydrate.map(async ({ jobId, idx }) => {
        const { data } = await getJobStatus(jobId)
        return { idx, jobId, data }
      }))
      if (cancelled) return results
      setShots(previousShots => previousShots.map((shotRow, rowIndex) => {
        const result = results.find(r => r.idx === rowIndex)
        if (!result?.data) return shotRow
        const job = result.data
        return {
          ...shotRow,
          jobId: result.jobId,
          videoId: job.videoId || result.jobId,
          status:  job.status   || shotRow.status,
          videoUrl: job.videoUrl || shotRow.videoUrl || null,
          progressPercent: typeof job.progress === 'number' ? job.progress : shotRow.progressPercent,
          error: job.error || shotRow.error,
        }
      }))
      return results
    }

    // Schedule periodic re-polls. Each tick decides whether to keep
    // going based on the freshest set of statuses (not the React
    // state, which lags by one render).
    let timer = null
    const scheduleNext = (latestResults) => {
      if (cancelled) return
      const anyLive = (latestResults || []).some(r => {
        const status = r?.data?.status
        return status === 'queued' || status === 'processing'
      })
      if (!anyLive) return
      timer = setTimeout(async () => {
        const next = await hydrateOnce()
        scheduleNext(next)
      }, 3000)
    }

    hydrateOnce().then(scheduleNext)

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
    // Restart whenever shotJobIds changes (orchestrator queued a new
    // shot). The previous effect run is cancelled by the cleanup above.
  }, [initialRender?.shotJobIds?.join(',') || ''])

  // Re-sync the live fields from the BE row on every poll tick. The
  // CinemaRenderPage above us polls /api/cinema/render/:renderId every
  // 3s and re-passes initialRender as a prop. Without this effect the
  // FE would render whatever phase / combineJobId / finalDownloadHref
  // we hydrated at first mount, so the BE flipping phase='done' +
  // setting finalDownloadHref wouldn't reach the UI until a manual
  // refresh. That was the symptom of the "Download button missing /
  // redirects to homepage" bug — the BE row WAS correct but the
  // component's local state was stale.
  useEffect(() => {
    if (!initialRender) return
    if (initialRender.phase) setPhase(initialRender.phase)
    if (initialRender.combineJobId != null) setCombineJobId(initialRender.combineJobId)
    if (initialRender.finalDownloadHref) setFinalDownloadHref(initialRender.finalDownloadHref)
    if (typeof initialRender.currentShotIndex === 'number') setCurrentShotIndex(initialRender.currentShotIndex)
    if (initialRender.error) setPipelineError(initialRender.error)
  }, [
    initialRender?.phase,
    initialRender?.combineJobId,
    initialRender?.finalDownloadHref,
    initialRender?.currentShotIndex,
    initialRender?.error,
  ])

  // Re-init shots whenever the project changes (new plan).
  useEffect(() => {
    setShots(initialShots())
    setPhase(initialRender?.phase || 'idle')
    setCurrentShotIndex(initialRender?.currentShotIndex || 0)
    setCombineJobId(initialRender?.combineJobId || null)
    setCombineRow(null)
    setFinalDownloadHref(initialRender?.finalDownloadHref || '')
    setPipelineError(initialRender?.error || '')
    setExpandedShots(new Set())
    setCombineExpanded(false)
    isCancelledRef.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.projectId, shotPrompts.length, renderId])

  // Auto-expand whichever shot is currently in flight, so the user
  // always sees the running shot's log tree without having to click.
  // Done by ADDING to the set, not replacing — manual closes stick
  // unless the user opens them again.
  useEffect(() => {
    setExpandedShots(prev => {
      let changed = false
      const next = new Set(prev)
      shots.forEach((shotRow, idx) => {
        const live = shotRow.status === 'queued' || shotRow.status === 'processing'
        if (live && !next.has(idx)) { next.add(idx); changed = true }
      })
      return changed ? next : prev
    })
  }, [shots])

  // Same for the combine row — auto-open while it's running.
  useEffect(() => {
    if (combineRow?.status === 'queued' || combineRow?.status === 'processing') {
      setCombineExpanded(true)
    }
  }, [combineRow?.status])

  const toggleShot = (idx) => {
    setExpandedShots(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  // Helper to patch a single shot row by index.
  const patchShot = (shotIndex, patchObject) => {
    setShots(previousShots => previousShots.map((shotRow, rowIndex) =>
      rowIndex === shotIndex ? { ...shotRow, ...patchObject } : shotRow
    ))
  }

  // startRender — BE-driven. We only need to submit SHOT 1 here. The
  // BE's cinemaChain orchestrator (services/aiVideo/cinemaChain.js)
  // hooks into the worker's job-complete callback and handles every
  // subsequent step server-side:
  //   • extract last frame of completed shot via ffmpeg
  //   • upload frame to Cloudinary
  //   • queue next shot with imageUrl set
  //   • after the last shot, kick off the combine
  //
  // Closing the tab / refreshing / losing the network mid-render is
  // now safe — the chain continues regardless. The FE just polls the
  // render row to display the current state.
  async function startRender({ resume = false } = {}) {
    if (!shotPrompts.length) return
    if (phase === 'rendering' || phase === 'extracting' || phase === 'uploading' || phase === 'combining') {
      notice.warning('Already running — Cancel first if you want to restart')
      return
    }

    // Resume path: figure out if ANY shot has completed yet.
    // - If yes → POST /resume. BE chain advances from the last completed
    //   shot (extracts frame + queues next, or fires combine on last).
    // - If no  → fall through to doSubmitShot0(). Nothing completed
    //   means the BE has no jobId to resume from — we need to re-submit
    //   shot 0 from the FE.
    // Previous behaviour silently fired /resume regardless, and the BE
    // returned 400 ("No completed shots yet…") which the FE swallowed
    // with no user feedback. Hence "Resume button doesn't work".
    if (resume && renderId) {
      // Decide based on local shot state. shots[i].status === 'completed'
      // means we have a usable videoUrl for that index. Also accept
      // currentShotIndex > 0 (BE thinks we've moved past shot 0) as a
      // signal at least one shot finished.
      const hasAnyCompleted = shots.some(s => s?.status === 'completed' && s?.videoUrl)
        || (currentShotIndex && currentShotIndex > 0)

      // Always clear the error + flip status FIRST so the polling
      // loop sees the new state immediately, even on the BE failure path.
      const { error: resumeError } = await patchCinemaRender(renderId, {
        status: 'rendering', phase: 'rendering', error: null,
      })
      if (resumeError) notice.error(`Resume PATCH failed: ${resumeError}`)

      if (hasAnyCompleted) {
        // Real BE chain resume. Parse the response so we can surface
        // failures to the user instead of swallowing them.
        try {
          const base = import.meta.env.VITE_BE_URL || ''
          const resp = await fetch(`${base}/api/cinema/render/${renderId}/resume`, { method: 'POST' })
          const body = await resp.json().catch(() => null)
          if (!resp.ok || body?.status === false) {
            const msg = body?.message || body?.error || `Resume failed (${resp.status})`
            notice.error(msg)
            setPhase('failed')
            persist({ status: 'failed', phase: 'failed', error: msg })
          } else {
            notice.success(`Resuming from shot ${(body?.data?.resumedFromShotIndex ?? 0) + 1}…`)
          }
        } catch (e) {
          notice.error(`Resume request failed: ${e.message || e}`)
        }
        return
      }

      // No shot ever completed — re-submit shot 0 from scratch.
      // Same FE-driven path as the initial "Render all shots" click.
      notice.info('Nothing has completed yet — restarting from shot 1.')
      // doSubmitShot0 is defined below; we hoist by running it after
      // the closure is set up. Set phase first so user sees progress.
      setPhase('rendering')
      // Fall through; the closure below is reached because we DON'T
      // return, and the Modal.confirm branch is gated on `!renderId`.
    }

    const doSubmitShot0 = async () => {
      setPhase('rendering')
      persist({ status: 'rendering', phase: 'rendering', error: null, currentShotIndex: 0 })
      patchShot(0, { status: 'queued', startedAtMs: Date.now() })

      // Determine engine + mode from the render row (set when the
      // planner created the render). Defaults to optimized/balanced
      // for back-compat with old rows.
      const chainProvider = initialRender?.provider     || 'optimized'
      const chainMode     = initialRender?.optimizedMode || 'balanced'
      // §69 — when engine is 5090 Beast, send the picked beast model
      // through. Before this, shot 0 fell through to the BE's
      // default ('ltx-video') even when the user picked Hunyuan in
      // the planner — chain ended up mixing models, breaking
      // continuity.
      const chainBeastModel = initialRender?.beastModel  || 'wan-2.2'
      // §71 — same step count across every shot in the render. Pull
      // from project.stepsPerShot if the user overrode it, else
      // continuity-default per model. Shots 2+ use the same value
      // (BE chain reads project.stepsPerShot).
      const STEP_DEFAULTS = {
        'ltx-video': 30, 'ltx-distilled': 8, 'wan-2.1': 20, 'wan-2.1-i2v': 20,
        'wan-2.2': 18, 'hunyuan': 20, 'mochi': 30, 'svd': 25,
      }
      const chainSteps = Number.isFinite(project?.stepsPerShot) && project.stepsPerShot > 0
        ? project.stepsPerShot
        : (chainProvider === 'local' ? (STEP_DEFAULTS[chainBeastModel] || 18) : undefined)

      const { data, error: submitError } = await generateVideo(
        shotPrompts[0],
        {
          provider:    chainProvider,
          mode:        chainMode,
          // Only pass model on the local lane — optimized derives its
          // model from `mode`, ZSky picks server-side.
          ...(chainProvider === 'local' ? { model: chainBeastModel } : {}),
          ...(chainSteps ? { steps: chainSteps } : {}),
          duration:    projectDuration,
          aspectRatio: projectAspect,
          resolution:  projectResolution,
          imageUrl:    '',                    // shot 1 is text-to-video
          withMusic:   false,
          generateCaption: false,
          silentWake:  true,
        },
      )
      if (submitError || !data?.jobId) {
        const msg = submitError || 'Failed to queue shot 1'
        patchShot(0, { status: 'failed', error: msg })
        setPhase('failed')
        persist({ status: 'failed', phase: 'failed', error: msg })
        notice.error(msg)
        return
      }
      patchShot(0, { jobId: data.jobId, status: 'processing' })
      const nextJobIds = [...shots.map(s => s.videoId || s.jobId)]
      nextJobIds[0] = data.jobId
      persist({ shotJobIds: nextJobIds })
      notice.success('Shot 1 queued — BE chain takes over from here')
    }

    if (renderId) {
      // Standalone page — start immediately, no second confirm.
      doSubmitShot0()
      return
    }
    Modal.confirm({
      title: `Render ${shotPrompts.length} shots back-to-back?`,
      content: (
        <div className="text-sm space-y-2">
          <p>
            This kicks off <span className="font-semibold text-amber-300">shot 1</span>. The BE then
            extracts the last frame of each completed shot, uploads it, and queues the next shot
            automatically — closing the tab is safe.
          </p>
          <p className="text-fg-muted text-xs">
            Each shot takes ~60–90s. Total wall time ≈ {Math.ceil(shotPrompts.length * 75 / 60)}m.
            Final ffmpeg stitch happens server-side after the last shot.
          </p>
        </div>
      ),
      okText: 'Start rendering',
      cancelText: 'Back',
      autoFocusButton: 'ok',
      centered: true,
      onOk: () => doSubmitShot0(),
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

      // Cinema chain knobs — provider / mode come from the render row
      // (set when the user clicked "Render all shots" on the planner).
      // Defaults match the old hardcoded behaviour so legacy rows
      // without these fields still work.
      const chainProvider    = initialRender?.provider     || 'optimized'
      const chainMode        = initialRender?.optimizedMode || 'balanced'
      const chainBeastModel  = initialRender?.beastModel  || 'wan-2.2'
      // §71 — same step lookup as doSubmitShot0 so retried shots
      // never drift to the BE default 30.
      const STEP_DEFAULTS = {
        'ltx-video': 30, 'ltx-distilled': 8, 'wan-2.1': 20, 'wan-2.1-i2v': 20,
        'wan-2.2': 18, 'hunyuan': 20, 'mochi': 30, 'svd': 25,
      }
      const chainSteps = Number.isFinite(project?.stepsPerShot) && project.stepsPerShot > 0
        ? project.stepsPerShot
        : (chainProvider === 'local' ? (STEP_DEFAULTS[chainBeastModel] || 18) : undefined)
      const { data: submitData, error: submitError } = await generateVideo(
        shotPrompts[shotIndex],
        {
          provider:    chainProvider,         // 5090 lane — Wan 2.2 5B, supports i2v
          mode:        chainMode,             // preview / balanced / quality — controls model + steps
          // §69 — when on the local lane, send the picked beast model
          // (Hunyuan / Wan 2.1 I2V 14B / etc.). Without this the BE
          // falls through to its default 'ltx-video' and the chain
          // silently mixes models, killing continuity.
          ...(chainProvider === 'local' ? { model: chainBeastModel } : {}),
          ...(chainSteps ? { steps: chainSteps } : {}),
          duration:    projectDuration,
          aspectRatio: projectAspect,
          resolution:  projectResolution,
          imageUrl:    previousFrameUrl || '',
          withMusic:   false,                 // music gets added once at the combine step
          generateCaption: false,
          silentWake:  true,                  // skip Telegram alert (N shots = N noisy notifications otherwise)
        },
      )
      if (submitError || !submitData?.jobId) {
        const messageText = submitError || 'Failed to queue shot'
        patchShot(shotIndex, { status: 'failed', error: messageText })
        setPipelineError(`Shot ${shotIndex + 1}: ${messageText}`)
        setPhase('failed')
        notice.error(messageText)
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
          notice.success('Cinema render complete — Download to save the mp4')
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
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-amber-300/80">Inline render</p>
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

      {/* Per-shot rows — accordion. Header (shot # / status / prompt /
          inline preview) is always visible. The agentic log tree mounts
          only when the card is expanded so completed shots don't show
          "Setup / Generate / Post-process · pending" when their logs
          have already expired in the BE. In-flight shots auto-expand
          via the effect above so the running shot's logs are visible
          without a click. */}
      <ol className="space-y-2">
        {shots.map((shotRow, shotIndex) => {
          const expanded = expandedShots.has(shotIndex)
          // "pending" reads as ambiguous to the user — they wanted
          // "queued" everywhere a shot hasn't started yet. The
          // underlying state machine keeps `pending` for code clarity;
          // we just relabel at display time.
          const displayStatus =
            shotRow.status === 'pending'    ? 'queued'
            : shotRow.status === 'queued'     ? 'queued'
            : shotRow.status === 'processing' ? 'processing'
            : shotRow.status
          const headerStatusTone =
            shotRow.status === 'completed' ? 'text-emerald-300'
            : shotRow.status === 'failed' ? 'text-rose-300'
            : shotRow.status === 'processing' ? 'text-cyan-300 animate-pulse'
            : shotRow.status === 'queued' || shotRow.status === 'pending' ? 'text-amber-300'
            : 'text-fg-muted'
          return (
            <li key={shotIndex} className="luxe-card p-3">
              <button
                type="button"
                onClick={() => toggleShot(shotIndex)}
                className="w-full text-left flex items-start justify-between gap-3 flex-wrap"
                aria-expanded={expanded}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-[11px] font-mono text-amber-400 font-bold tabular-nums">
                      SHOT {String(shotIndex + 1).padStart(2, '0')}
                    </span>
                    <span className={`text-[10px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                      shotRow.status === 'completed' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40'
                      : shotRow.status === 'failed' ? 'bg-rose-500/15 text-rose-300 border border-rose-500/40'
                      : shotRow.status === 'processing' ? 'bg-cyan-500/15 text-cyan-200 border border-cyan-500/40'
                      : shotRow.status === 'queued' || shotRow.status === 'pending' ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40'
                      : 'bg-gray-500/15 text-gray-400 border border-gray-500/40'
                    }`}>
                      {displayStatus}
                    </span>
                    {shotRow.sourceImageUrl && (
                      <span className="text-[10px] font-mono text-cyan-300/80">
                        ← from shot {shotIndex} tail frame
                      </span>
                    )}
                    {/* Collapse / expand chip — was a faint grey arrow,
                        now a proper outlined chip with bold copy + tone
                        switch between collapsed and expanded states.
                        Mobile users were missing the click target. */}
                    <span className={`ml-auto inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border transition-colors ${
                      expanded
                        ? 'border-cyan-400/60 bg-cyan-500/15 text-cyan-200'
                        : 'border-line bg-surface-elevated text-fg-secondary hover:border-amber-400/50 hover:text-amber-200'
                    }`}>
                      {expanded ? <>▾ Collapse logs</> : <>▸ Show live logs</>}
                    </span>
                  </div>
                  <p className="text-[12px] text-gray-300 font-mono leading-relaxed">
                    {shotRow.prompt}
                  </p>
                  {/* Progress bar removed per user request — the live
                      log tree already shows sampler step / VAE decode
                      progress more clearly than a percent bar. */}
                  {shotRow.error && (
                    <p className="mt-2 text-[10px] font-mono text-rose-400 break-words">{shotRow.error}</p>
                  )}
                </div>
                {shotRow.videoUrl && (
                  <video
                    src={shotRow.videoUrl} muted playsInline preload="metadata" controls
                    className="w-40 aspect-video rounded-md border border-line"
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
              </button>

              {/* Log tree mounts only when expanded — saves polling
                  cycles on completed shots that the user isn't looking
                  at, and avoids the "Setup pending" boilerplate on
                  shots whose logs have already aged out. */}
              {expanded && shotRow.jobId && (
                <div className="mt-2">
                  <JobLogsAgentPlan
                    lane="video"
                    jobId={shotRow.jobId}
                    status={shotRow.status}
                    error={shotRow.error}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ol>

      {/* Combine row */}
      {(phase === 'combining' || phase === 'done' || combineJobId) && (
        <div className="mt-4 pt-4 border-t border-line">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-amber-300/80">Final combine</p>
              <h4 className="mt-1 text-sm font-semibold text-fg-primary tabular-nums">
                {combineRow?.status === 'completed' ? 'Stitched mp4 ready' : `ffmpeg-concat #${combineJobId}`}
              </h4>
            </div>
            {/* Resolve the download URL at render time so it works
                regardless of how the href landed in state:
                  • BE-driven chain stores '/api/combine/file/<id>' (rel)
                  • Legacy FE chain stored the full VITE_BE_URL'd path
                A bare path would otherwise navigate to the FE domain
                (siddharthfulia.com/api/combine/file/...) → React Router
                catch-all redirect → homepage. That's the symptom the
                user just hit: "doesn't download, redirects to home".
                combineFileUrl always returns the absolute BE URL when
                we have a combineJobId. Falls back to whatever's stored
                on the row, with a prepend if relative. */}
            {phase === 'done' && (combineJobId || finalDownloadHref) ? (
              <a href={
                combineJobId
                  ? combineFileUrl(combineJobId)
                  : (finalDownloadHref?.startsWith('http')
                      ? finalDownloadHref
                      : `${import.meta.env.VITE_BE_URL || ''}${finalDownloadHref || ''}`)
              }
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
          {/* ffmpeg-concat agentic logs — same accordion pattern as the
              shot cards above. Auto-opens while combining, collapsed
              once done so the user isn't staring at an empty plan tree. */}
          {combineJobId && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setCombineExpanded(o => !o)}
                aria-expanded={combineExpanded}
                className="text-[10px] font-mono text-gray-400 hover:text-gray-200 inline-flex items-center gap-1">
                {combineExpanded ? '▾ collapse combine logs' : '▸ combine logs'}
              </button>
              {combineExpanded && (
                <div className="mt-2">
                  <JobLogsAgentPlan
                    lane="combine"
                    jobId={combineJobId}
                    status={combineRow?.status || 'queued'}
                    error={combineRow?.error}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
