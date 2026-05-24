// VideoCombiner — multi-mp4 concatenation tab on /ai-video.
//
// Flow:
//   1. Lists recent library videos (paginated server-side).
//   2. User clicks tiles to select; selected videos appear in an ordered
//      list above where they can drag to reorder.
//   3. "Combine & Save" POSTs to /api/combine, then polls /status/:id
//      every 1.5s until terminal. ffmpeg writes per-step messages to
//      the job_logs table (lane='combine'); we tail them inline.
//   4. On completion: download button. File auto-deletes from the
//      server the moment the browser saves it (privacy mirror of yt-dl).

import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal, Progress, Tag, Input, message as antMessage } from 'antd'
import { DownloadOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  combineCreate, combineStatus, combineList, combineDelete, combineFileUrl,
  listVideos,
} from '../../api/ai'

const POLL_MS = 1500
const TRACKED_KEY = 'sid-combine-tracked'

const loadTracked = () => {
  try {
    const v = JSON.parse(localStorage.getItem(TRACKED_KEY) || '[]')
    return Array.isArray(v) ? v.slice(-20) : []
  } catch { return [] }
}
const saveTracked = (ids) => {
  try { localStorage.setItem(TRACKED_KEY, JSON.stringify(ids.slice(-20))) } catch {}
}

const fmtBytes = (n) => {
  if (!n) return '—'
  const mb = n / (1024 * 1024)
  return mb < 1024 ? `${mb.toFixed(1)} MB` : `${(mb / 1024).toFixed(2)} GB`
}

export default function VideoCombiner() {
  // ── Library ─────────────────────────────────────────────────────────
  const [libraryItems, setLibraryItems] = useState([])
  const [libraryLoading, setLibraryLoading] = useState(false)
  // ── Selection (ordered) — each entry is { videoId, url, title } ─────
  const [picked, setPicked] = useState([])
  // ── Manual URL input (paste-in alternative to library picking) ──────
  const [manualUrl, setManualUrl] = useState('')
  // ── Submission + tracked jobs ───────────────────────────────────────
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [trackedIds, setTrackedIds] = useState(loadTracked)
  const [history, setHistory] = useState([])
  const notifiedRef = useRef(new Set())
  // ── Per-job log tail ───────────────────────────────────────────────
  const [logsByJob, setLogsByJob] = useState({})

  // Load library on mount.
  useEffect(() => {
    let cancelled = false
    setLibraryLoading(true)
    listVideos({ limit: 24 }).then(({ data }) => {
      if (cancelled) return
      setLibraryLoading(false)
      const items = data?.items || data?.videos || []
      setLibraryItems(items)
    })
    return () => { cancelled = true }
  }, [])

  // Persist tracked ids.
  useEffect(() => { saveTracked(trackedIds) }, [trackedIds])

  // History poll — fast when any job is in flight, slow otherwise.
  const loadHistory = async () => {
    const { data } = await combineList(20)
    const items = Array.isArray(data?.items) ? data.items : []
    setHistory(items)
    for (const j of items) {
      if (!trackedIds.includes(j.id)) continue
      if (notifiedRef.current.has(j.id)) continue
      if (j.status === 'completed') {
        antMessage.success(`#${j.id} ready — click Download to save`)
        notifiedRef.current.add(j.id)
      } else if (j.status === 'failed') {
        notifiedRef.current.add(j.id)
      }
    }
  }
  useEffect(() => {
    loadHistory()
    const anyInFlight = history.some(j => trackedIds.includes(j.id) && (j.status === 'queued' || j.status === 'processing'))
    const id = setInterval(loadHistory, anyInFlight ? 1200 : 4000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackedIds.join(','), history.map(h => `${h.id}:${h.status}:${h.progress}`).join(',')])

  // Log tail — polls /api/job-logs/combine/:id for each in-flight job.
  useEffect(() => {
    const live = history.filter(j => trackedIds.includes(j.id) && (j.status === 'queued' || j.status === 'processing'))
    if (!live.length) return
    let cancelled = false
    const tickLogs = async () => {
      for (const j of live) {
        const since = (logsByJob[j.id] || []).slice(-1)[0]?.ts || 0
        try {
          const base = import.meta.env.VITE_BE_URL || ''
          const r = await fetch(`${base}/api/job-logs/combine/${j.id}?since=${since}&limit=50`)
          const body = await r.json()
          const newLines = body?.data?.logs || []
          if (newLines.length && !cancelled) {
            setLogsByJob(prev => ({ ...prev, [j.id]: [...(prev[j.id] || []), ...newLines].slice(-200) }))
          }
        } catch {}
      }
    }
    tickLogs()
    const id = setInterval(tickLogs, 1500)
    return () => { cancelled = true; clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.map(h => `${h.id}:${h.status}`).join(',')])

  // ── Selection ops ──────────────────────────────────────────────────
  const toggleSelect = (item) => {
    const url = item.videoUrl || item.outputUrl
    if (!url) return
    const exists = picked.find(p => p.videoId === item.videoId)
    if (exists) {
      setPicked(picked.filter(p => p.videoId !== item.videoId))
    } else {
      setPicked([...picked, {
        videoId: item.videoId,
        url,
        title: (item.prompt || item.title || item.videoId).slice(0, 60),
        // Capture bytes + duration from the library row if present —
        // drives the pre-flight estimate without an extra round-trip.
        bytes:    item.bytes || item.fileSize || null,
        duration: item.duration || item.durationSec || null,
      }])
    }
  }
  const move = (idx, dir) => {
    const j = idx + dir
    if (j < 0 || j >= picked.length) return
    const next = [...picked]
    ;[next[idx], next[j]] = [next[j], next[idx]]
    setPicked(next)
  }
  const removeAt = (idx) => setPicked(picked.filter((_, i) => i !== idx))
  const addManual = () => {
    const u = manualUrl.trim()
    if (!u) return
    setPicked([...picked, { url: u, title: u.split('/').pop()?.slice(0, 60) || 'pasted clip' }])
    setManualUrl('')
  }

  // ── Submit ─────────────────────────────────────────────────────────
  const onSubmit = async () => {
    if (picked.length < 2) {
      return antMessage.warning('Pick at least 2 videos to combine')
    }
    if (picked.length > 12) {
      return antMessage.warning('Cap is 12 videos per combine')
    }
    setSubmitting(true)
    const sources = picked.map(p => p.videoId ? { videoId: p.videoId, title: p.title } : { url: p.url, title: p.title })
    const { data, error } = await combineCreate({ sources, title: title.trim() || null })
    setSubmitting(false)
    if (error) { antMessage.error(error); return }
    setTrackedIds(prev => [...prev.filter(id => id !== data.jobId), data.jobId])
    antMessage.info(`Combine #${data.jobId} queued — ffmpeg working`)
    setPicked([])
    setTitle('')
    loadHistory()
  }

  // ── Delete ─────────────────────────────────────────────────────────
  const requestDelete = (job) => {
    Modal.confirm({
      title: `Remove combine #${job.id}?`,
      content: 'Removes the row + on-disk file. Can\'t be undone.',
      okText: 'Remove',
      okType: 'danger',
      okButtonProps: { danger: true },
      cancelText: 'Back',
      autoFocusButton: 'cancel',
      centered: true,
      onOk: async () => {
        const { error } = await combineDelete(job.id)
        if (error) { antMessage.error(error); return }
        antMessage.success('Removed')
        setTrackedIds(prev => prev.filter(x => x !== job.id))
        notifiedRef.current.delete(job.id)
        setLogsByJob(prev => { const c = { ...prev }; delete c[job.id]; return c })
        loadHistory()
      },
    })
  }

  // ── Derived ────────────────────────────────────────────────────────
  const mineHistory = useMemo(
    () => history.filter(j => trackedIds.includes(j.id)),
    [history, trackedIds]
  )

  // Pre-flight estimate — sums what we know about the picked sources so
  // the user sees expected output size + ETA BEFORE hitting submit. The
  // fast path (concat demuxer with -c copy) is ~5s of overhead + the
  // network download of each source; the reencode path runs at roughly
  // realtime (a 20s output takes ~20s of ffmpeg). We optimistically
  // assume copy will work, then note re-encode as a worst case.
  const estimate = useMemo(() => {
    if (picked.length < 2) return null
    const knownBytes    = picked.filter(p => p.bytes).reduce((s, p) => s + p.bytes, 0)
    const knownDuration = picked.filter(p => p.duration).reduce((s, p) => s + p.duration, 0)
    const knownClips    = picked.filter(p => p.bytes).length
    // Extrapolate unknowns assuming the typical 5090-lane output
    // (~5 MB and ~5s per clip). Better than no estimate.
    const avgBytes    = knownClips ? knownBytes    / knownClips : 5 * 1024 * 1024
    const avgDuration = knownClips ? knownDuration / knownClips : 5
    const totalBytes  = knownBytes + avgBytes * (picked.length - knownClips)
    const totalSecs   = knownDuration + avgDuration * (picked.length - knownClips)
    // Optimistic (copy): download + 5s ffmpeg. Pessimistic (reencode):
    // realtime over the total seconds.
    const downloadSecs = totalBytes / (5 * 1024 * 1024)   // assume 5 MB/s pull from Cloudinary
    const optimisticSecs = Math.ceil(downloadSecs + 5)
    const pessimisticSecs = Math.ceil(downloadSecs + totalSecs)
    return {
      totalBytes,
      totalSecs,
      optimisticSecs,
      pessimisticSecs,
      knownClips,
      unknownClips: picked.length - knownClips,
    }
  }, [picked])

  const fmtSeconds = (s) => {
    if (s < 60) return `~${s}s`
    const m = Math.floor(s / 60), sec = s % 60
    return `~${m}m ${sec}s`
  }

  return (
    <div className='space-y-6'>
      <div>
        <p className='eyebrow-mono'>— Tools · combine</p>
        <h2 className='gradient-text-amber text-h2 mt-2'>Combine videos</h2>
        <p className='mt-2 text-fg-secondary max-w-2xl text-sm'>
          Stitch any 2–12 clips into one mp4. Pick from your library or paste URLs.
          Server-side ffmpeg with progress + live log tail. File auto-deletes from
          the server the moment you save it.
        </p>
      </div>

      <div className='grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5'>
        {/* ── Picker ──────────────────────────────────────────────── */}
        <div className='space-y-4'>
          <div className='luxe-card p-4 sm:p-5'>
            <div className='flex items-center justify-between mb-3'>
              <h3 className='text-sm font-semibold uppercase tracking-wider text-fg-primary'>Library</h3>
              <button onClick={() => { setLibraryLoading(true); listVideos({ limit: 24 }).then(({ data }) => { setLibraryLoading(false); setLibraryItems(data?.items || data?.videos || []) }) }}
                className='text-[10px] font-semibold px-2 py-1 rounded-full border border-line hover:border-line-strong text-fg-muted inline-flex items-center gap-1'>
                <ReloadOutlined /> Refresh
              </button>
            </div>
            {libraryLoading && <p className='text-xs text-fg-muted'>Loading…</p>}
            {!libraryLoading && !libraryItems.length && (
              <p className='text-xs text-fg-muted py-6 text-center'>No videos in the library yet — generate some on the Generate tab first.</p>
            )}
            <div className='grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[480px] overflow-y-auto'>
              {libraryItems.map((item) => {
                const isPicked = !!picked.find(p => p.videoId === item.videoId)
                return (
                  <button
                    key={item.videoId}
                    type='button'
                    onClick={() => toggleSelect(item)}
                    className={`relative aspect-video rounded-lg overflow-hidden border transition-all
                      ${isPicked ? 'border-amber-400 ring-2 ring-amber-400/40 shadow-glow' : 'border-line hover:border-line-strong'}`}
                  >
                    <video src={item.videoUrl} className='w-full h-full object-cover' muted playsInline preload='metadata' />
                    {isPicked && (
                      <span className='absolute top-1 right-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-black'>
                        ✓ {picked.findIndex(p => p.videoId === item.videoId) + 1}
                      </span>
                    )}
                    <span className='absolute inset-x-0 bottom-0 px-2 py-1 text-[10px] bg-gradient-to-t from-black/90 to-transparent text-fg-secondary truncate'>
                      {(item.prompt || item.videoId).slice(0, 40)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Paste-a-URL alternative */}
          <div className='luxe-card p-4 sm:p-5'>
            <h3 className='text-sm font-semibold uppercase tracking-wider text-fg-primary mb-2'>Or paste an URL</h3>
            <div className='flex gap-2'>
              <Input
                placeholder='https://…/video.mp4'
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                onPressEnter={addManual}
              />
              <button onClick={addManual}
                className='text-xs font-semibold px-4 py-2 rounded-lg border border-line hover:border-line-strong text-fg-secondary tap-44'>
                + Add
              </button>
            </div>
          </div>
        </div>

        {/* ── Right rail: ordered selection + submit + history ───── */}
        <aside className='space-y-4'>
          <div className='luxe-card p-4 sm:p-5'>
            <h3 className='text-sm font-semibold uppercase tracking-wider text-fg-primary mb-2'>
              Selected · {picked.length}
            </h3>
            {!picked.length && (
              <p className='text-xs text-fg-muted py-4 text-center'>Pick 2+ videos from the library →</p>
            )}
            <ul className='space-y-1.5'>
              {picked.map((p, idx) => (
                <li key={`${p.videoId || p.url}-${idx}`}
                  className='flex items-center gap-2 text-xs p-2 rounded-lg bg-surface-elevated border border-line'>
                  <span className='font-mono text-fg-muted shrink-0 w-5 text-center'>{idx + 1}</span>
                  <span className='flex-1 truncate text-fg-secondary'>{p.title}</span>
                  <div className='flex items-center gap-0.5 shrink-0'>
                    <button onClick={() => move(idx, -1)} disabled={idx === 0}
                      className='tap-44 text-fg-muted hover:text-fg-primary disabled:opacity-30'>↑</button>
                    <button onClick={() => move(idx, +1)} disabled={idx === picked.length - 1}
                      className='tap-44 text-fg-muted hover:text-fg-primary disabled:opacity-30'>↓</button>
                    <button onClick={() => removeAt(idx)} className='tap-44 text-rose-300/70 hover:text-rose-200'>
                      <DeleteOutlined />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {picked.length >= 2 && (
              <div className='mt-3 space-y-2'>
                <Input
                  size='small'
                  placeholder='Title (optional)'
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />

                {/* Pre-flight estimate — sets expectations on size +
                    ETA so the user knows what they're signing up for
                    before the ffmpeg pass starts. Numbers are optimistic
                    (assumes copy strategy succeeds); a re-encode falls
                    back to roughly realtime over total seconds. */}
                {estimate && (
                  <div className='rounded-lg border border-line bg-surface-overlay p-2.5 text-[10px] font-mono space-y-1' style={{ fontVariantNumeric: 'tabular-nums' }}>
                    <div className='flex items-center justify-between text-fg-secondary'>
                      <span>📦 Output size</span>
                      <span className='text-fg-primary'>~{fmtBytes(estimate.totalBytes)}</span>
                    </div>
                    <div className='flex items-center justify-between text-fg-secondary'>
                      <span>⏱  Output length</span>
                      <span className='text-fg-primary'>~{Math.round(estimate.totalSecs)}s</span>
                    </div>
                    <div className='flex items-center justify-between text-fg-secondary'>
                      <span>🚀 ETA (fast path)</span>
                      <span className='text-emerald-300'>{fmtSeconds(estimate.optimisticSecs)}</span>
                    </div>
                    <div className='flex items-center justify-between text-fg-muted'>
                      <span>🐢 ETA (re-encode)</span>
                      <span>{fmtSeconds(estimate.pessimisticSecs)}</span>
                    </div>
                    {estimate.unknownClips > 0 && (
                      <p className='text-fg-muted/70 text-[9px] pt-1 border-t border-line'>
                        {estimate.unknownClips} of {picked.length} clips have no size metadata — estimate may drift up to ~20%.
                      </p>
                    )}
                  </div>
                )}

                <button
                  onClick={onSubmit}
                  disabled={submitting || picked.length < 2}
                  className='w-full text-sm font-bold px-5 py-2.5 rounded-full border border-amber-500/50 bg-gradient-to-r from-amber-500/25 to-rose-500/25 text-amber-100 hover:from-amber-500/35 hover:to-rose-500/35 disabled:opacity-50 min-h-[44px]'>
                  {submitting ? 'Queuing…' : `🎬 Combine ${picked.length} videos`}
                </button>
                <p className='text-[10px] text-emerald-400 text-center'>🛡 Auto-deletes when you save the file</p>
              </div>
            )}
          </div>

          {/* History */}
          <div className='luxe-card p-4 sm:p-5'>
            <h3 className='text-sm font-semibold uppercase tracking-wider text-fg-primary mb-2'>Recent</h3>
            {!mineHistory.length && <p className='text-xs text-fg-muted py-3 text-center'>No combines yet.</p>}
            <ul className='space-y-2'>
              {mineHistory.map(j => (
                <li key={j.id} className='rounded-lg border border-line bg-surface-elevated p-3'>
                  <div className='flex items-center justify-between mb-1'>
                    <span className='text-[10px] uppercase tracking-wider text-fg-muted font-mono'>
                      #{j.id} · {j.strategy || j.status}
                    </span>
                    <StatusTag status={j.status} />
                  </div>
                  <p className='text-xs text-fg-secondary font-mono truncate'>{j.title || `Combine #${j.id}`}</p>
                  {(j.status === 'queued' || j.status === 'processing') && (
                    <Progress percent={j.progress || 0} size='small' showInfo={false}
                      strokeColor={{ from: '#fbbf24', to: '#fb7185' }} trailColor='#1f2937'
                      className='!mb-0 !mt-2' />
                  )}
                  {/* Agentic log tail */}
                  {logsByJob[j.id]?.length > 0 && (j.status === 'queued' || j.status === 'processing') && (
                    <div className='mt-2 p-2 rounded bg-surface-overlay border border-line max-h-32 overflow-y-auto'>
                      {logsByJob[j.id].slice(-5).map((line, i) => (
                        <p key={i} className='text-[10px] font-mono text-fg-muted leading-snug truncate'>
                          {line.msg || line.message || JSON.stringify(line)}
                        </p>
                      ))}
                    </div>
                  )}
                  {j.error && (
                    <p className='mt-2 text-[10px] font-mono text-rose-400 break-words'>{j.error}</p>
                  )}
                  <div className='flex items-center justify-between gap-2 mt-2'>
                    <span className='text-[10px] font-mono text-fg-muted'>
                      {j.fileSize ? fmtBytes(j.fileSize) : `${j.progress || 0}%`}
                    </span>
                    <div className='flex items-center gap-1'>
                      {j.status === 'completed' && (
                        <a href={combineFileUrl(j.id)}
                          className='text-[10px] font-semibold px-2 py-1 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 inline-flex items-center gap-1'>
                          <DownloadOutlined /> Save
                        </a>
                      )}
                      <button onClick={() => requestDelete(j)}
                        className='text-[10px] font-semibold px-2 py-1 rounded border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'>
                        <DeleteOutlined />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}

function StatusTag({ status }) {
  const map = {
    queued:     { color: 'default', label: 'Queued' },
    processing: { color: 'processing', label: 'Working' },
    completed:  { color: 'success', label: 'Ready' },
    failed:     { color: 'error', label: 'Failed' },
  }
  const m = map[status] || { color: 'default', label: status || 'Unknown' }
  return <Tag color={m.color} className='!text-[10px] !uppercase !tracking-wider !m-0'>{m.label}</Tag>
}
