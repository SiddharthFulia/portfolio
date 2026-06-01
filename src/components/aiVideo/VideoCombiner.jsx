// VideoCombiner — multi-mp4 concatenation tab on /ai-video.
//
// Two sub-tabs:
//   • Build   — pick 2-12 clips, see a pre-flight estimate, fire the
//               ffmpeg-concat job, watch the live log tail.
//   • Library — every past combine (paginated, vault-aware). Replays
//               status + offers Download / Delete.
//
// Pagination model (used by BOTH the source picker AND the library):
//   • Default page size 20.
//   • antd Pagination's size dropdown lists 10 / 20 / 30 / 40 / 50 / 100.
//   • An inline "Custom" field accepts any integer 1..1000 and applies
//     it on Enter — for the times when the user just wants to see all
//     243 clips at once and scroll.
//   • Both list endpoints are server-paginated (BE clamps to 1000) so
//     "page size 1000" is real, not a FE-only trick.
//
// Vault inheritance: the BE flags the combined row as vault=1 whenever
// ANY of the source videos was already in the Vault. The Library tab
// here surfaces both public AND vault rows when the FE has vault auth
// (handled server-side via maybeVault).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Modal, Progress, Tag, Input, InputNumber, Pagination, Tabs } from 'antd'
import { notice } from '../../lib/notice'
import { DownloadOutlined, DeleteOutlined, ReloadOutlined, CheckOutlined, LockOutlined, GlobalOutlined, ToolOutlined, BookOutlined, ThunderboltOutlined, RocketOutlined, VideoCameraOutlined } from '@ant-design/icons'
import {
  combineCreate, combineList, combineDelete, combineFileUrl,
  combineUpload,
  listVideos,
} from '../../api/ai'
import useQueryState from '../../hooks/useQueryState'

const POLL_MS = 1500
const TRACKED_KEY = 'sid-combine-tracked'
const PAGE_SIZE_OPTIONS = ['10', '20', '30', '40', '50', '100']
const DEFAULT_PAGE_SIZE = 20

// Resolve a stored video URL to an absolute one. listVideos() can return
// either fully-qualified Cloudinary URLs (`https://res.cloudinary.com/…`)
// or BE-relative paths (`/api/files/…`) for self-hosted clips. Without
// this prefix, relative URLs resolve against the FE origin and 404 — the
// <video> element silently renders an empty box (the bug the user saw:
// "I can't see the videos"). Mirrors the helper in pages/AIVideo.jsx.
const BE_URL = import.meta.env.VITE_BE_URL || ''
const resolveVideoUrl = (url) => {
  if (!url) return ''
  return url.startsWith('http') ? url : `${BE_URL}${url}`
}
// Build a Cloudinary poster (single-frame JPG) so the picker tile shows
// a thumbnail instead of a black box before hover. No-op for non-
// Cloudinary URLs — `poster={null}` is harmless on <video>.
const thumbFromVideo = (videoUrl) => {
  if (!videoUrl || !/cloudinary\.com\/.+\/video\/upload\//.test(videoUrl)) return null
  return videoUrl
    .replace('/video/upload/', '/video/upload/so_1,w_400,c_fill,q_auto,f_jpg/')
    .replace(/\.(mp4|webm|mov)$/i, '.jpg')
}

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
const fmtSeconds = (s) => {
  if (s < 60) return `~${s}s`
  const m = Math.floor(s / 60), sec = s % 60
  return `~${m}m ${sec}s`
}

// ── reusable page-size strip ─────────────────────────────────────────
// antd's Pagination only knows about a fixed pageSizeOptions list. This
// adds a "Custom (≤ 1000)" InputNumber alongside so the user can punch in
// any value the server still accepts. Applies on Enter or on the ✓ button.
function PageSizeStrip({ pageSize, setPageSize }) {
  const [draft, setDraft] = useState(pageSize)
  useEffect(() => { setDraft(pageSize) }, [pageSize])
  const apply = () => {
    const n = Math.max(1, Math.min(1000, parseInt(draft, 10) || pageSize))
    setPageSize(n)
  }
  return (
    <span className='inline-flex items-center gap-1.5'>
      <span className='text-[10px] uppercase tracking-wider text-fg-muted'>Custom</span>
      <InputNumber
        size='small' min={1} max={1000} value={draft}
        onChange={setDraft} onPressEnter={apply}
        style={{ width: 80 }}
      />
      <button onClick={apply}
        className='text-[10px] px-2 py-1 rounded border border-line hover:border-line-strong text-fg-muted inline-flex items-center'>
        <CheckOutlined />
      </button>
    </span>
  )
}

// ── status pill (shared by Build right-rail + Library) ──────────────
function StatusTag({ status }) {
  const map = {
    queued:     { color: 'default',    label: 'Queued' },
    processing: { color: 'processing', label: 'Working' },
    completed:  { color: 'success',    label: 'Ready' },
    failed:     { color: 'error',      label: 'Failed' },
  }
  const m = map[status] || { color: 'default', label: status || 'Unknown' }
  return <Tag color={m.color} className='!text-[10px] !uppercase !tracking-wider !m-0'>{m.label}</Tag>
}

// ── one combine row card (used by both right-rail and Library tab) ──
function CombineCard({ job, logs, onDelete }) {
  return (
    <li className='rounded-lg border border-line bg-surface-elevated p-3'>
      <div className='flex items-center justify-between mb-1'>
        <span className='text-[10px] uppercase tracking-wider text-fg-muted font-mono'>
          #{job.id} · {job.strategy || job.status}
          {job.vault ? <span className='ml-1.5 text-amber-300 inline-flex items-center gap-0.5'><LockOutlined /> Vault</span> : null}
        </span>
        <StatusTag status={job.status} />
      </div>
      <p className='text-xs text-fg-secondary font-mono truncate'>{job.title || `Combine #${job.id}`}</p>
      {(job.status === 'queued' || job.status === 'processing') && (
        <Progress percent={job.progress || 0} size='small' showInfo={false}
          strokeColor='#fbbf24' trailColor='#1f2937'
          className='!mb-0 !mt-2' />
      )}
      {logs?.length > 0 && (job.status === 'queued' || job.status === 'processing') && (
        <div className='mt-2 p-2 rounded bg-surface-overlay border border-line max-h-32 overflow-y-auto'>
          {logs.slice(-5).map((line, i) => (
            <p key={i} className='text-[10px] font-mono text-fg-muted leading-snug truncate'>
              {line.msg || line.message || JSON.stringify(line)}
            </p>
          ))}
        </div>
      )}
      {job.error && (
        <p className='mt-2 text-[10px] font-mono text-rose-400 break-words'>{job.error}</p>
      )}
      <div className='flex items-center justify-between gap-2 mt-2'>
        <span className='text-[10px] font-mono text-fg-muted'>
          {job.fileSize ? fmtBytes(job.fileSize) : `${job.progress || 0}%`}
        </span>
        <div className='flex items-center gap-1'>
          {job.status === 'completed' && (
            <a href={combineFileUrl(job.id)}
              className='text-[10px] font-semibold px-2 py-1 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 inline-flex items-center gap-1'>
              <DownloadOutlined /> Save
            </a>
          )}
          <button onClick={() => onDelete(job)}
            className='text-[10px] font-semibold px-2 py-1 rounded border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'>
            <DeleteOutlined />
          </button>
        </div>
      </div>
    </li>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Build tab — the existing flow (picker + selection rail + live jobs).
// ─────────────────────────────────────────────────────────────────────
function BuildTab({
  trackedIds, setTrackedIds, history, logsByJob, onDelete, refreshHistory,
}) {
  // ── library picker pagination ──
  const [libItems, setLibItems]         = useState([])
  const [libTotal, setLibTotal]         = useState(0)
  const [libPage, setLibPage]           = useState(1)
  const [libPageSize, setLibPageSize]   = useState(DEFAULT_PAGE_SIZE)
  const [libLoading, setLibLoading]     = useState(false)

  // ── selection (ordered) ──
  const [picked, setPicked] = useState([])
  const [manualUrl, setManualUrl] = useState('')
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // ── upload state (local mp4s) ──
  const [uploadPct, setUploadPct] = useState(null)
  const [uploadName, setUploadName] = useState('')
  const fileInputRef = useRef(null)

  // ── combined-library picker (chain combines together) ──
  const [combinedItems, setCombinedItems] = useState([])
  const [combinedLoading, setCombinedLoading] = useState(false)
  const [showCombined, setShowCombined] = useState(false)

  // Load library page whenever pagination changes.
  useEffect(() => {
    let cancelled = false
    setLibLoading(true)
    listVideos({ page: libPage, limit: libPageSize }).then(({ data }) => {
      if (cancelled) return
      setLibLoading(false)
      setLibItems(data?.items || [])
      setLibTotal(data?.total || 0)
    })
    return () => { cancelled = true }
  }, [libPage, libPageSize])

  const refreshLib = () => {
    setLibLoading(true)
    listVideos({ page: libPage, limit: libPageSize }).then(({ data }) => {
      setLibLoading(false)
      setLibItems(data?.items || [])
      setLibTotal(data?.total || 0)
    })
  }

  // ── selection ops ──
  const toggleSelect = (item) => {
    // When the row has a videoId the BE resolves the source from the DB
    // (so a relative URL is fine to keep around for UI), but for the
    // pasted/external case we want an absolute URL.
    const url = resolveVideoUrl(item.videoUrl || item.outputUrl)
    if (!url && !item.videoId) return
    const exists = picked.find(p => p.videoId === item.videoId)
    if (exists) {
      setPicked(picked.filter(p => p.videoId !== item.videoId))
    } else {
      setPicked([...picked, {
        videoId: item.videoId,
        url,
        title: (item.prompt || item.title || item.videoId).slice(0, 60),
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

  // ── local mp4 upload — sends multipart to /api/combine/upload,
  // receives an uploadId, and adds an entry to the picked list with
  // that id so the BE can resolve it when /api/combine fires.
  const onPickFile = async (file) => {
    if (!file) return
    if (!/^video\//i.test(file.type) && !/\.mp4$/i.test(file.name)) {
      notice.warning('Only mp4 / video uploads')
      return
    }
    setUploadName(file.name)
    setUploadPct(0)
    const { data, error: err } = await combineUpload(file, { onProgress: setUploadPct })
    setUploadPct(null)
    setUploadName('')
    if (err) { notice.error(`Upload failed: ${err}`); return }
    setPicked(prev => [...prev, {
      uploadId: data.uploadId,
      title: data.name?.slice(0, 60) || `upload-${data.uploadId.slice(0, 6)}`,
      bytes: data.size || null,
    }])
    notice.success('Uploaded — added to selection')
  }
  const onFileInputChange = (e) => {
    const f = e.target.files?.[0]
    onPickFile(f)
    e.target.value = ''     // allow re-uploading the same file
  }
  const onDropFile = (e) => {
    e.preventDefault()
    const f = e.dataTransfer?.files?.[0]
    onPickFile(f)
  }

  // ── chain-combine picker — load the combine library once on expand.
  const loadCombined = useCallback(async () => {
    setCombinedLoading(true)
    const { data } = await combineList({ status: 'completed', page: 1, pageSize: 100 })
    setCombinedLoading(false)
    setCombinedItems(Array.isArray(data?.items) ? data.items : [])
  }, [])
  useEffect(() => {
    if (showCombined && combinedItems.length === 0) loadCombined()
  }, [showCombined, combinedItems.length, loadCombined])
  const addCombined = (row) => {
    if (picked.find(p => p.combineId === row.id)) {
      notice.info(`Combine #${row.id} is already in your selection`)
      return
    }
    setPicked(prev => [...prev, {
      combineId: row.id,
      title: row.title?.slice(0, 60) || `combine-${row.id}`,
      bytes: row.fileSize || null,
    }])
  }

  // ── submit ──
  const onSubmit = async () => {
    if (picked.length < 2) return notice.warning('Pick at least 2 videos to combine')
    if (picked.length > 12) return notice.warning('Cap is 12 videos per combine')
    setSubmitting(true)
    // Pass through whichever source-shape the row carries. The BE's
    // resolveSource handles videoId / url / combineId / uploadId.
    const sources = picked.map(p => {
      if (p.videoId)   return { videoId: p.videoId,     title: p.title }
      if (p.combineId) return { combineId: p.combineId, title: p.title }
      if (p.uploadId)  return { uploadId: p.uploadId,   title: p.title }
      return { url: p.url, title: p.title }
    })
    const { data, error } = await combineCreate({ sources, title: title.trim() || null })
    setSubmitting(false)
    if (error) { notice.error(error); return }
    setTrackedIds(prev => [...prev.filter(id => id !== data.jobId), data.jobId])
    notice.info(`Combine #${data.jobId} queued — ffmpeg working`)
    setPicked([]); setTitle('')
    refreshHistory()
  }

  // ── pre-flight estimate ──
  const estimate = useMemo(() => {
    if (picked.length < 2) return null
    const knownBytes    = picked.filter(p => p.bytes).reduce((s, p) => s + p.bytes, 0)
    const knownDuration = picked.filter(p => p.duration).reduce((s, p) => s + p.duration, 0)
    const knownClips    = picked.filter(p => p.bytes).length
    const avgBytes    = knownClips ? knownBytes    / knownClips : 5 * 1024 * 1024
    const avgDuration = knownClips ? knownDuration / knownClips : 5
    const totalBytes  = knownBytes + avgBytes * (picked.length - knownClips)
    const totalSecs   = knownDuration + avgDuration * (picked.length - knownClips)
    const downloadSecs = totalBytes / (5 * 1024 * 1024)
    const optimisticSecs = Math.ceil(downloadSecs + 5)
    const pessimisticSecs = Math.ceil(downloadSecs + totalSecs)
    return {
      totalBytes, totalSecs, optimisticSecs, pessimisticSecs,
      knownClips, unknownClips: picked.length - knownClips,
    }
  }, [picked])

  const mineHistory = useMemo(
    () => history.filter(j => trackedIds.includes(j.id)),
    [history, trackedIds]
  )

  return (
    <div className='grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5'>
      {/* ── Picker ──────────────────────────────────────────────── */}
      <div className='space-y-4'>
        <div className='luxe-card p-4 sm:p-5'>
          <div className='flex items-center justify-between mb-3 flex-wrap gap-2'>
            <h3 className='text-sm font-semibold uppercase tracking-wider text-fg-primary'>Library</h3>
            <div className='flex items-center gap-2'>
              <span className='text-[10px] text-fg-muted font-mono'>
                {libTotal.toLocaleString()} videos · page {libPage}/{Math.max(1, Math.ceil(libTotal / libPageSize))}
              </span>
              <button onClick={refreshLib}
                className='text-[10px] font-semibold px-2 py-1 rounded-full border border-line hover:border-line-strong text-fg-muted inline-flex items-center gap-1'>
                <ReloadOutlined /> Refresh
              </button>
            </div>
          </div>

          {libLoading && <p className='text-xs text-fg-muted'>Loading…</p>}
          {!libLoading && !libItems.length && (
            <p className='text-xs text-fg-muted py-6 text-center'>No videos in the library yet — generate some on the Generate tab first.</p>
          )}

          <div className='grid grid-cols-2 sm:grid-cols-3 gap-3'>
            {libItems.map((item) => {
              const isPicked = !!picked.find(p => p.videoId === item.videoId)
              // listVideos() returns either an absolute Cloudinary URL or a
              // BE-relative path — both need resolving. The poster gives the
              // tile a real thumbnail in its idle state (instead of a black
              // box); hover triggers .play() and mouse-leave pauses + rewinds
              // so the next hover always starts from frame 0. preload stays
              // at 'metadata' so a 30-tile page doesn't drag every clip
              // across the wire on mount.
              const src    = resolveVideoUrl(item.videoUrl)
              const poster = item.thumbnailUrl || thumbFromVideo(src)
              return (
                <button
                  key={item.videoId}
                  type='button'
                  onClick={() => toggleSelect(item)}
                  className={`group relative aspect-video rounded-lg overflow-hidden border transition-colors bg-black/40
                    ${isPicked ? 'border-amber-400 ring-2 ring-amber-400/40' : 'border-line hover:border-line-strong'}`}
                >
                  {src ? (
                    <video
                      src={src}
                      poster={poster || undefined}
                      className='w-full h-full object-cover pointer-events-none'
                      muted
                      loop
                      playsInline
                      preload='metadata'
                      onMouseEnter={(e) => { e.currentTarget.play?.().catch(() => {}) }}
                      onMouseLeave={(e) => { e.currentTarget.pause?.(); try { e.currentTarget.currentTime = 0 } catch {} }}
                    />
                  ) : (
                    <div className='w-full h-full flex items-center justify-center text-[10px] uppercase tracking-wider text-fg-muted'>
                      no preview
                    </div>
                  )}
                  {isPicked && (
                    <span className='absolute top-1 right-1 z-10 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500 text-black inline-flex items-center gap-0.5'>
                      <CheckOutlined /> {picked.findIndex(p => p.videoId === item.videoId) + 1}
                    </span>
                  )}
                  <span className='absolute inset-x-0 bottom-0 z-10 px-2 py-1 text-[10px] bg-gradient-to-t from-black/90 to-transparent text-fg-secondary truncate'>
                    {(item.prompt || item.videoId).slice(0, 40)}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Pagination row — antd Pagination + custom-size strip */}
          <div className='flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 border-t border-line'>
            <Pagination
              current={libPage}
              pageSize={libPageSize}
              total={libTotal}
              showSizeChanger
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              size='small'
              showQuickJumper
              showTotal={(t, [a, b]) => `${a}-${b} of ${t.toLocaleString()}`}
              onChange={(p, s) => { setLibPage(p); if (s !== libPageSize) setLibPageSize(s) }}
              onShowSizeChange={(_p, s) => { setLibPageSize(s); setLibPage(1) }}
            />
            <PageSizeStrip pageSize={libPageSize} setPageSize={(n) => { setLibPageSize(n); setLibPage(1) }} />
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

        {/* Local-mp4 upload — drag-drop or file-picker. The BE keeps a
            registry of uploadIds so the source spec can reference one
            without copying bytes through Cloudinary. */}
        <div className='luxe-card p-4 sm:p-5'>
          <h3 className='text-sm font-semibold uppercase tracking-wider text-fg-primary mb-2'>Or upload a local mp4</h3>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDropFile}
            onClick={() => fileInputRef.current?.click()}
            className='cursor-pointer rounded-lg border-2 border-dashed border-line hover:border-amber-400/50 hover:bg-amber-500/5 transition-colors p-5 text-center'
          >
            <input
              ref={fileInputRef}
              type='file'
              accept='video/*,.mp4'
              onChange={onFileInputChange}
              className='hidden'
            />
            {uploadPct === null ? (
              <p className='text-xs text-fg-muted'>
                Drag an mp4 here or <span className='text-amber-300'>click to pick</span> — up to 500 MB.
              </p>
            ) : (
              <div className='space-y-1.5'>
                <p className='text-[11px] font-mono text-fg-secondary truncate'>{uploadName || 'Uploading…'}</p>
                <Progress percent={uploadPct} size='small' strokeColor='#fbbf24' trailColor='#1f2937' />
              </div>
            )}
          </div>
        </div>

        {/* Pick from the Combine Library — chain combines together
            (combine the output of A+B with C, etc.). The BE feeds the
            previous combine's local file straight into ffmpeg. */}
        <div className='luxe-card p-4 sm:p-5'>
          <div className='flex items-center justify-between mb-2'>
            <h3 className='text-sm font-semibold uppercase tracking-wider text-fg-primary'>Or chain a previous combine</h3>
            <button onClick={() => setShowCombined(s => !s)}
              className='text-[10px] font-semibold px-2 py-1 rounded-full border border-line hover:border-line-strong text-fg-muted'>
              {showCombined ? 'Hide' : 'Browse'}
            </button>
          </div>
          {showCombined && (
            <>
              {combinedLoading && <p className='text-xs text-fg-muted'>Loading…</p>}
              {!combinedLoading && combinedItems.length === 0 && (
                <p className='text-xs text-fg-muted py-2'>No completed combines yet.</p>
              )}
              <ul className='space-y-1.5 max-h-64 overflow-y-auto'>
                {combinedItems.map(row => (
                  <li key={row.id}
                    className='flex items-center justify-between gap-2 p-2 rounded-lg bg-surface-elevated border border-line'>
                    <div className='min-w-0 flex-1'>
                      <p className='text-xs text-fg-secondary truncate'>{row.title || `Combine #${row.id}`}</p>
                      <p className='text-[10px] font-mono text-fg-muted'>#{row.id} · {fmtBytes(row.fileSize)}</p>
                    </div>
                    <button onClick={() => addCombined(row)}
                      className='text-[10px] font-semibold px-2 py-1 rounded border border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 shrink-0'>
                      + Add
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {/* ── Right rail: ordered selection + submit + tracked jobs ─── */}
      <aside className='space-y-4'>
        <div className='luxe-card p-4 sm:p-5'>
          <h3 className='text-sm font-semibold uppercase tracking-wider text-fg-primary mb-2'>
            Selected · {picked.length}
          </h3>
          {!picked.length && (
            <p className='text-xs text-fg-muted py-4 text-center'>Pick 2+ videos from the library →</p>
          )}
          <ul className='space-y-1.5'>
            {picked.map((p, idx) => {
              // Stable key across all source kinds. Falls back to idx if
              // nothing identifying is set (shouldn't happen).
              const key = p.videoId || p.uploadId || (p.combineId ? `cmb-${p.combineId}` : null) || p.url || `slot-${idx}`
              const kindBadge =
                p.uploadId  ? <span className='text-[9px] text-amber-300 font-mono'>UPLOAD</span>
                : p.combineId ? <span className='text-[9px] text-fuchsia-300 font-mono'>COMBINE #{p.combineId}</span>
                : p.url     ? <span className='text-[9px] text-cyan-300 font-mono'>URL</span>
                : null
              return (
              <li key={key}
                className='flex items-center gap-2 text-xs p-2 rounded-lg bg-surface-elevated border border-line'>
                <span className='font-mono text-fg-muted shrink-0 w-5 text-center'>{idx + 1}</span>
                <span className='flex-1 truncate text-fg-secondary'>
                  {kindBadge && <span className='mr-1.5'>{kindBadge}</span>}
                  {p.title}
                </span>
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
            )})}
          </ul>
          {picked.length >= 2 && (
            <div className='mt-3 space-y-2'>
              <Input
                size='small'
                placeholder='Title (optional)'
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />

              {estimate && (
                <div className='rounded-lg border border-line bg-surface-overlay p-2.5 text-[10px] font-mono space-y-1' style={{ fontVariantNumeric: 'tabular-nums' }}>
                  <div className='flex items-center justify-between text-fg-secondary'>
                    <span>Output size</span>
                    <span className='text-fg-primary'>~{fmtBytes(estimate.totalBytes)}</span>
                  </div>
                  <div className='flex items-center justify-between text-fg-secondary'>
                    <span>Output length</span>
                    <span className='text-fg-primary'>~{Math.round(estimate.totalSecs)}s</span>
                  </div>
                  <div className='flex items-center justify-between text-fg-secondary'>
                    <span>ETA (fast path)</span>
                    <span className='text-emerald-300'>{fmtSeconds(estimate.optimisticSecs)}</span>
                  </div>
                  <div className='flex items-center justify-between text-fg-muted'>
                    <span>ETA (re-encode)</span>
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
                className='w-full text-sm font-bold px-5 py-2.5 rounded-lg border border-amber-500/50 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25 disabled:opacity-50 min-h-[44px] inline-flex items-center justify-center gap-1.5'>
                {submitting ? 'Queuing…' : <><VideoCameraOutlined /> Combine {picked.length} videos</>}
              </button>
              <p className='text-[10px] text-emerald-400 text-center inline-flex items-center justify-center gap-1 w-full'><LockOutlined /> Auto-deletes when you save the file</p>
            </div>
          )}
        </div>

        {/* In-flight + recently-tracked jobs */}
        <div className='luxe-card p-4 sm:p-5'>
          <h3 className='text-sm font-semibold uppercase tracking-wider text-fg-primary mb-2'>Recent (this session)</h3>
          {!mineHistory.length && <p className='text-xs text-fg-muted py-3 text-center'>No combines yet.</p>}
          <ul className='space-y-2'>
            {mineHistory.map(j => (
              <CombineCard key={j.id} job={j} logs={logsByJob[j.id]} onDelete={onDelete} />
            ))}
          </ul>
        </div>
      </aside>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Library tab — every past combine across all sessions (paginated,
// vault-aware). Independent state from the Build tab's `history` so the
// user can browse without losing the live-tail context.
// ─────────────────────────────────────────────────────────────────────
function LibraryTab({ onDelete, refreshKey }) {
  const [items, setItems]       = useState([])
  const [total, setTotal]       = useState(0)
  // Pagination + filters mirrored to URL so refresh keeps the user on
  // page 3 of completed combines (etc.). `cl` (combine library) prefix
  // avoids collisions with parent useQueryState keys like AIVideo's tab.
  const [page, setPage]         = useQueryState('clPage',     1,                  { parse: Number })
  const [pageSize, setPageSize] = useQueryState('clSize',     DEFAULT_PAGE_SIZE,  { parse: Number })
  const [visibility, setVisibility] = useQueryState('clVis',  'public',           { allowed: ['public', 'vault'] })
  const [status, setStatus]     = useQueryState('clStatus',   '',                 { allowed: ['', 'queued', 'processing', 'completed', 'failed'] })
  const [loading, setLoading]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await combineList({ visibility, status: status || undefined, page, pageSize })
    setLoading(false)
    setItems(Array.isArray(data?.items) ? data.items : [])
    setTotal(Number(data?.total || 0))
  }, [visibility, status, page, pageSize])

  useEffect(() => { load() }, [load, refreshKey])

  return (
    <div className='space-y-4'>
      <div className='luxe-card p-4 sm:p-5'>
        <div className='flex flex-wrap items-center justify-between gap-3 mb-3'>
          <div className='flex items-center gap-2 flex-wrap'>
            <h3 className='text-sm font-semibold uppercase tracking-wider text-fg-primary'>
              Combined library
            </h3>
            <span className='text-[10px] text-fg-muted font-mono'>
              {total.toLocaleString()} combine{total === 1 ? '' : 's'}
            </span>
          </div>
          <div className='flex items-center gap-2 flex-wrap'>
            {/* Visibility */}
            <div className='flex items-center gap-1'>
              {['public', 'vault'].map(v => (
                <button key={v}
                  onClick={() => { setVisibility(v); setPage(1) }}
                  className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-colors inline-flex items-center gap-1 ${
                    visibility === v
                      ? 'border-amber-400/60 bg-amber-500/15 text-amber-200'
                      : 'border-line text-fg-muted hover:border-line-strong'
                  }`}>
                  {v === 'vault' ? <><LockOutlined /> Vault</> : <><GlobalOutlined /> Public</>}
                </button>
              ))}
            </div>
            {/* Status filter */}
            <div className='flex items-center gap-1'>
              {['', 'queued', 'processing', 'completed', 'failed'].map(s => (
                <button key={s || 'all'}
                  onClick={() => { setStatus(s); setPage(1) }}
                  className={`text-[10px] px-2 py-1 rounded-lg border transition-colors ${
                    status === s
                      ? 'border-amber-400/60 bg-amber-500/15 text-amber-200'
                      : 'border-line text-fg-muted hover:border-line-strong'
                  }`}>
                  {s || 'all'}
                </button>
              ))}
            </div>
            <button onClick={load}
              className='text-[10px] font-semibold px-2 py-1 rounded-full border border-line hover:border-line-strong text-fg-muted inline-flex items-center gap-1'>
              <ReloadOutlined /> Refresh
            </button>
          </div>
        </div>

        {loading && <p className='text-xs text-fg-muted'>Loading…</p>}
        {!loading && !items.length && (
          <p className='text-xs text-fg-muted py-10 text-center'>
            No combines{status ? ` with status “${status}”` : ''}{visibility === 'vault' ? ' in the Vault' : ''} yet.
          </p>
        )}

        <ul className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3'>
          {items.map(j => (
            <CombineCard key={j.id} job={j} logs={null} onDelete={onDelete} />
          ))}
        </ul>

        <div className='flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 border-t border-line'>
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            showSizeChanger
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            size='small'
            showQuickJumper
            showTotal={(t, [a, b]) => `${a}-${b} of ${t.toLocaleString()}`}
            onChange={(p, s) => { setPage(p); if (s !== pageSize) setPageSize(s) }}
            onShowSizeChange={(_p, s) => { setPageSize(s); setPage(1) }}
          />
          <PageSizeStrip pageSize={pageSize} setPageSize={(n) => { setPageSize(n); setPage(1) }} />
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Outer component — owns the shared state that both tabs care about
// (tracked jobs + the polling history of those tracked jobs).
// ─────────────────────────────────────────────────────────────────────
export default function VideoCombiner({ refreshKey = 0 } = {}) {
  const [tab, setTab] = useQueryState('cTab', 'build', { allowed: ['build', 'library'] })
  const [trackedIds, setTrackedIds] = useState(loadTracked)
  const [history, setHistory] = useState([])
  const [logsByJob, setLogsByJob] = useState({})
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0)
  const notifiedRef = useRef(new Set())

  // Parent (AIVideo Tabs) bumps `refreshKey` on every tab change so the
  // library + tracked-history view both reload their counts. Mirrors
  // the same plumbing Cinema uses.
  useEffect(() => {
    if (refreshKey) setLibraryRefreshKey(k => k + 1)
  }, [refreshKey])

  useEffect(() => { saveTracked(trackedIds) }, [trackedIds])

  // Poll the public list for tracked-job state changes only. The Library
  // tab pulls its own paginated view independently — this fetch is only
  // here to drive the right-rail completion toasts.
  const refreshHistory = useCallback(async () => {
    const { data } = await combineList({ page: 1, pageSize: 50 })
    const items = Array.isArray(data?.items) ? data.items : []
    setHistory(items)
    for (const j of items) {
      if (!trackedIds.includes(j.id)) continue
      if (notifiedRef.current.has(j.id)) continue
      if (j.status === 'completed') {
        notice.success(`#${j.id} ready — click Download to save`)
        notifiedRef.current.add(j.id)
      } else if (j.status === 'failed') {
        notifiedRef.current.add(j.id)
      }
    }
  }, [trackedIds])

  useEffect(() => {
    refreshHistory()
    const anyInFlight = history.some(j => trackedIds.includes(j.id) && (j.status === 'queued' || j.status === 'processing'))
    const id = setInterval(refreshHistory, anyInFlight ? 1200 : 4000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackedIds.join(','), history.map(h => `${h.id}:${h.status}:${h.progress}`).join(',')])

  // Log tail for in-flight tracked jobs.
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
    const id = setInterval(tickLogs, POLL_MS)
    return () => { cancelled = true; clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.map(h => `${h.id}:${h.status}`).join(',')])

  // Two-step destructive delete — shared by both tabs.
  const onDelete = (job) => {
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
        if (error) { notice.error(error); return }
        notice.success('Removed')
        setTrackedIds(prev => prev.filter(x => x !== job.id))
        notifiedRef.current.delete(job.id)
        setLogsByJob(prev => { const c = { ...prev }; delete c[job.id]; return c })
        refreshHistory()
        setLibraryRefreshKey(k => k + 1)
      },
    })
  }

  return (
    <div className='space-y-6'>
      <div>
        <p className='eyebrow-mono'>— Tools · combine</p>
        <h2 className='text-amber-300 text-h2 mt-2 font-bold'>Combine videos</h2>
        <p className='mt-2 text-fg-secondary max-w-2xl text-sm'>
          Stitch any 2–12 clips into one mp4. Pick from your library or paste URLs.
          Server-side ffmpeg with progress + live log tail. File auto-deletes from
          the server the moment you save it. Vault-tagged sources promote the
          combined output to the Vault too.
        </p>
      </div>

      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: 'build',
            label: <span className='text-sm inline-flex items-center gap-1.5'><ToolOutlined /> Build</span>,
            children: (
              <BuildTab
                trackedIds={trackedIds}
                setTrackedIds={setTrackedIds}
                history={history}
                logsByJob={logsByJob}
                onDelete={onDelete}
                refreshHistory={() => { refreshHistory(); setLibraryRefreshKey(k => k + 1) }}
              />
            ),
          },
          {
            key: 'library',
            label: <span className='text-sm inline-flex items-center gap-1.5'><BookOutlined /> Library</span>,
            children: <LibraryTab onDelete={onDelete} refreshKey={libraryRefreshKey} />,
          },
        ]}
      />
    </div>
  )
}
