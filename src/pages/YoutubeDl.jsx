// /yt-dl — paste a YouTube link, pick format + quality, download.
//
// The BE wraps yt-dlp; this page just submits a job and polls until
// the file is ready. As soon as the user downloads the file, the BE
// deletes it from disk (privacy). A daily cron sweeps anything left
// over after 48h.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Input, Segmented, Select, Progress, Modal, Alert, message as antMessage, Tag, Tooltip } from 'antd'
import { LinkOutlined, DownloadOutlined, DeleteOutlined, ReloadOutlined, FileTextOutlined, ClockCircleOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { ytdlCreate, ytdlStatus, ytdlList, ytdlDelete, ytdlFileUrl } from '../api/ai'

// Locally-tracked job IDs we care about. Persisted so a page refresh
// keeps us showing the jobs the user submitted in this browser even
// though the BE doesn't know anything about session identity.
const TRACKED_KEY = 'sid-ytdl-tracked'
const loadTracked = () => {
  try {
    const v = JSON.parse(localStorage.getItem(TRACKED_KEY) || '[]')
    return Array.isArray(v) ? v.slice(-30) : []
  } catch { return [] }
}
const saveTracked = (ids) => {
  try { localStorage.setItem(TRACKED_KEY, JSON.stringify(ids.slice(-30))) } catch {}
}

const AUDIO_QUALITIES = [
  { value: '128', label: '128 kbps · small' },
  { value: '192', label: '192 kbps · balanced' },
  { value: '320', label: '320 kbps · studio' },
]
const VIDEO_QUALITIES = [
  { value: '360',  label: '360p · light · ~50 MB / 10 min' },
  { value: '720',  label: '720p · standard · ~150 MB / 10 min' },
  { value: '1080', label: '1080p · HD · ~400 MB / 10 min' },
  { value: 'best', label: 'Best available · 4K when YouTube has it' },
]

const fmtBytes = (n) => {
  if (!n) return '—'
  const mb = n / (1024 * 1024)
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}
const fmtDur = (s) => {
  if (!s) return null
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60)
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

const isYtUrl = (s) => /youtu\.?be/i.test(s || '')

export default function YoutubeDl() {
  const [url, setUrl] = useState('')
  const [format,  setFormat]  = useState('mp4')
  const [quality, setQuality] = useState('720')
  // worker: 'cobalt' (online API, default — fast, no auth) | 'home' (5090
  // worker on residential IP — bypasses YouTube anti-bot when Cobalt fails)
  const [worker, setWorker] = useState('cobalt')
  const [submitting, setSubmitting] = useState(false)
  const [history, setHistory] = useState([])
  // Job IDs submitted from THIS browser. Persisted in localStorage so a
  // refresh shows the user's own in-flight downloads without surfacing
  // jobs submitted by anyone else who happens to hit the BE.
  const [trackedIds, setTrackedIds] = useState(loadTracked)
  // Remembers which terminal job IDs we've already toasted about so a
  // re-poll after refresh doesn't spam a fresh toast for each.
  const notifiedRef = useRef(new Set())

  useEffect(() => { document.title = 'YouTube Downloader · Sid' }, [])

  useEffect(() => {
    setQuality(format === 'mp3' ? '320' : '720')
  }, [format])

  // Persist tracked IDs.
  useEffect(() => { saveTracked(trackedIds) }, [trackedIds])

  // The full history list (everybody's recent jobs) — we cross-reference
  // against trackedIds to know which rows are "ours".
  const loadHistory = async () => {
    const { data } = await ytdlList(30)
    const items = Array.isArray(data?.items) ? data.items : []
    setHistory(items)
    // Toast on terminal transitions for OUR jobs only.
    for (const j of items) {
      if (!trackedIds.includes(j.id)) continue
      if (notifiedRef.current.has(j.id)) continue
      if (j.status === 'completed') {
        antMessage.success(`#${j.id} ready — click Download to save it`)
        notifiedRef.current.add(j.id)
      } else if (j.status === 'failed') {
        // Failed jobs render their own antd Alert card with retry — no
        // toast from the top, that was just shouting the same thing twice.
        notifiedRef.current.add(j.id)
      }
    }
  }

  useEffect(() => {
    loadHistory()
    // Faster polling while we have an in-flight job; slow down once
    // everything's terminal so we don't hammer the BE for no reason.
    let id = null
    const restart = () => {
      if (id) clearInterval(id)
      const anyInFlight = history.some(j =>
        trackedIds.includes(j.id) && (j.status === 'queued' || j.status === 'processing')
      )
      id = setInterval(loadHistory, anyInFlight ? 1000 : 4000)
    }
    restart()
    return () => { if (id) clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackedIds.join(','), history.map(h => `${h.id}:${h.status}`).join(',')])

  const handlePaste = async () => {
    try {
      const txt = await navigator.clipboard.readText()
      if (!txt) { antMessage.info('Clipboard is empty'); return }
      setUrl(txt.trim())
      if (!isYtUrl(txt)) antMessage.warning('That doesn\'t look like a YouTube URL — paste a watch/short link')
    } catch {
      antMessage.warning('Clipboard unavailable — paste with Ctrl+V instead')
    }
  }

  const onSubmit = async () => {
    const trimmed = (url || '').trim()
    if (!trimmed) return antMessage.warning('Paste a YouTube URL first')
    if (!isYtUrl(trimmed)) return antMessage.warning('Not a YouTube URL')
    setSubmitting(true)
    const { data, error } = await ytdlCreate({ url: trimmed, format, quality, worker })
    setSubmitting(false)
    if (error) { antMessage.error(error); return }
    setTrackedIds(prev => [...prev.filter(id => id !== data.jobId), data.jobId])
    antMessage.info(`Job #${data.jobId} queued — leave the tab open or come back later`)
    setUrl('')
    loadHistory()
  }

  // Delete a single job — wrapped in antd Modal.confirm so neither a
  // mid-download cancel nor a tap on the wrong row is one-click
  // catastrophic. Red OK button, cancel auto-focused.
  const requestDelete = (job) => {
    const isCancel = job.status === 'queued' || job.status === 'processing'
    Modal.confirm({
      title: isCancel ? `Cancel #${job.id}?` : `Remove #${job.id}?`,
      content: isCancel
        ? 'This kills the yt-dlp worker and removes the row. Any progress is lost.'
        : 'This removes the row + on-disk file. Can\'t be undone.',
      okText: isCancel ? 'Cancel job' : 'Remove',
      okType: 'danger',
      okButtonProps: { danger: true },
      cancelText: 'Back',
      autoFocusButton: 'cancel',
      centered: true,
      onOk: async () => {
        const { error } = await ytdlDelete(job.id)
        if (error) { antMessage.error(error); return }
        antMessage.success('Removed')
        setTrackedIds(prev => prev.filter(x => x !== job.id))
        notifiedRef.current.delete(job.id)
        loadHistory()
      },
    })
  }

  // Bulk delete — N jobs at once. Shows the count + breakdown in the
  // confirm so the user can't blow away in-flight work without realising.
  const requestBulkDelete = (jobs, label) => {
    if (!jobs.length) return
    const counts = jobs.reduce((acc, j) => { acc[j.status] = (acc[j.status] || 0) + 1; return acc }, {})
    const breakdown = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(' · ')
    Modal.confirm({
      title: `${label} — ${jobs.length} job(s)?`,
      content: (
        <div>
          <p>This will remove rows + on-disk files for every job listed.</p>
          <p className='text-xs font-mono text-gray-500 mt-1'>{breakdown}</p>
          <p className='text-[11px] text-rose-500 mt-2'>Can't be undone.</p>
        </div>
      ),
      okText: `Yes, ${label.toLowerCase()}`,
      okType: 'danger',
      okButtonProps: { danger: true },
      cancelText: 'Back',
      autoFocusButton: 'cancel',
      centered: true,
      width: 460,
      onOk: async () => {
        const ids = jobs.map(j => j.id)
        // Fire all deletes in parallel — they're independent.
        const results = await Promise.all(ids.map(id => ytdlDelete(id)))
        const failed = results.filter(r => r.error).length
        if (failed) antMessage.warning(`${ids.length - failed} removed · ${failed} failed`)
        else        antMessage.success(`${ids.length} job(s) removed`)
        setTrackedIds(prev => prev.filter(x => !ids.includes(x)))
        ids.forEach(id => notifiedRef.current.delete(id))
        loadHistory()
      },
    })
  }

  // Jobs the user is currently waiting on — same browser, not terminal.
  const inFlightJobs = useMemo(
    () => history.filter(j => trackedIds.includes(j.id) && (j.status === 'queued' || j.status === 'processing')),
    [history, trackedIds]
  )
  // Jobs the user submitted and that are ready to grab (cross-refresh).
  const readyJobs = useMemo(
    () => history.filter(j => trackedIds.includes(j.id) && j.status === 'completed' && j.filePath !== null),
    [history, trackedIds]
  )
  // Failed jobs the user submitted — surfaced as antd Alerts so the
  // error is readable + the user has a one-click retry.
  const failedJobs = useMemo(
    () => history.filter(j => trackedIds.includes(j.id) && j.status === 'failed'),
    [history, trackedIds]
  )

  // yt-dlp's error lines are very noisy ("ERROR: [youtube] ID:
  // Sign in to confirm..."). Strip the cruft so the FE can show a clean
  // human-readable first sentence + classify into a friendlier reason.
  const humaniseError = (raw) => {
    const text = String(raw || '').trim()
    if (!text) return { title: 'Download failed', detail: '' }
    if (/Sign in to confirm you.?re not a bot/i.test(text)) {
      return { title: 'YouTube blocked the request', detail: 'This video has a per-video gate (age, region, members-only, or Premium) that the server\'s cookies don\'t satisfy. Open the URL in your normal browser to see which gate.' }
    }
    if (/Video unavailable/i.test(text)) {
      return { title: 'Video unavailable', detail: 'YouTube reports the video is removed or private.' }
    }
    if (/Premieres in/i.test(text) || /upcoming/i.test(text)) {
      return { title: 'Premiere not started yet', detail: 'This video hasn\'t aired — come back after it premieres.' }
    }
    if (/yt-dlp not available/i.test(text)) {
      return { title: 'Server misconfigured', detail: 'yt-dlp + ffmpeg aren\'t installed on the BE. Ping Sid.' }
    }
    // Generic — keep the cleaned-up tail end of the error.
    const cleaned = text
      .replace(/^ERROR:\s*\[[^\]]+\]\s*[A-Za-z0-9_-]+:\s*/i, '')   // strip "ERROR: [youtube] ABC:"
      .slice(0, 400)
    return { title: 'Download failed', detail: cleaned }
  }

  const stats = useMemo(() => {
    const done = history.filter(j => j.status === 'completed')
    return {
      total: history.length,
      done: done.length,
      bytes: done.reduce((sum, j) => sum + (j.fileSize || 0), 0),
    }
  }, [history])

  return (
    <section className='relative min-h-screen bg-[#0a0a0e] text-gray-100 pt-24 pb-16 px-4 sm:px-6 overflow-hidden'>
      {/* Ambient atmosphere */}
      <div aria-hidden className='pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[640px] h-[640px] rounded-full bg-gradient-to-br from-rose-500/15 via-amber-500/10 to-fuchsia-500/15 blur-3xl' />
      <div aria-hidden className='pointer-events-none absolute bottom-0 right-0 w-[420px] h-[420px] rounded-full bg-gradient-to-br from-cyan-500/12 via-violet-500/8 to-transparent blur-3xl' />

      <div className='relative max-w-5xl mx-auto'>
        {/* ── Hero ── */}
        <header className='mb-6'>
          <p className='text-[10px] font-mono uppercase tracking-[0.3em] text-amber-300/80'>— Tools</p>
          <h1 className='mt-2 text-4xl sm:text-5xl font-bold leading-tight pb-1 bg-gradient-to-r from-amber-200 via-rose-300 to-fuchsia-300 bg-clip-text text-transparent'>
            YouTube Downloader
          </h1>
          <p className='mt-2 text-sm text-gray-400 max-w-2xl'>
            Paste a link (video, short, or playlist URL — first video only). Pick MP3 for audio or MP4 for video. Server runs <code className='font-mono text-gray-300'>yt-dlp</code> + ffmpeg, then streams the file back to you. Hour-long videos render fine.
          </p>
          <div className='mt-3 flex flex-wrap gap-2 text-[10px] font-mono uppercase tracking-wider'>
            <span className='px-2 py-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-200'>🛡 Auto-deleted on download</span>
            <span className='px-2 py-1 rounded-full border border-gray-700 bg-gray-900/60 text-gray-400'>48h fallback sweep</span>
            <span className='px-2 py-1 rounded-full border border-gray-700 bg-gray-900/60 text-gray-400'>3 concurrent max</span>
          </div>
        </header>

        {/* ── Stat strip ── */}
        {history.length > 0 && (
          <div className='mb-5 grid grid-cols-3 gap-3' style={{ fontVariantNumeric: 'tabular-nums' }}>
            <StatBubble icon={<FileTextOutlined />} label='Downloads' value={stats.total} />
            <StatBubble icon={<ThunderboltOutlined />} label='Ready'    value={stats.done} accent='emerald' />
            <StatBubble icon={<ClockCircleOutlined />} label='Pulled' value={fmtBytes(stats.bytes)} accent='amber' />
          </div>
        )}

        <div className='grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5'>
          {/* ── Form + active job ── */}
          <div className='space-y-5'>
            <div className='luxe-card p-5 sm:p-6 space-y-5'>
              <div>
                <label className='block text-[11px] uppercase tracking-wider text-gray-400 mb-1.5'>YouTube URL</label>
                <div className='flex items-stretch gap-2'>
                  <Input
                    size='large'
                    prefix={<LinkOutlined className='text-gray-500' />}
                    placeholder='https://www.youtube.com/watch?v=... or https://youtu.be/...'
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onPressEnter={onSubmit}
                    allowClear
                  />
                  <Tooltip title='Paste from clipboard'>
                    <button
                      onClick={handlePaste}
                      className='shrink-0 text-xs font-semibold px-3 rounded-lg border border-gray-700 hover:border-gray-500 text-gray-300'>
                      📋 Paste
                    </button>
                  </Tooltip>
                </div>
                {url && !isYtUrl(url) && (
                  <p className='mt-1.5 text-[10px] font-mono text-rose-400'>That doesn't look like a YouTube URL.</p>
                )}
              </div>

              <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                <div>
                  <label className='block text-[11px] uppercase tracking-wider text-gray-400 mb-1.5'>Format</label>
                  <Segmented
                    block
                    value={format}
                    onChange={setFormat}
                    options={[
                      { value: 'mp4', label: <span>🎬 MP4 · video</span> },
                      { value: 'mp3', label: <span>🎵 MP3 · audio</span> },
                    ]}
                  />
                </div>
                <div>
                  <label className='block text-[11px] uppercase tracking-wider text-gray-400 mb-1.5'>Quality</label>
                  <Select
                    size='large'
                    style={{ width: '100%' }}
                    value={quality}
                    onChange={setQuality}
                    options={format === 'mp3' ? AUDIO_QUALITIES : VIDEO_QUALITIES}
                  />
                </div>
              </div>

              <div>
                <label className='block text-[11px] uppercase tracking-wider text-gray-400 mb-1.5'>Worker</label>
                <Segmented
                  block
                  value={worker}
                  onChange={setWorker}
                  options={[
                    { value: 'cobalt', label: <span>☁ Online · instant</span> },
                    { value: 'home',   label: <span>⚡ 5090 · residential</span> },
                  ]}
                />
                <p className='mt-1 text-[10px] text-gray-500 font-mono leading-snug'>
                  {worker === 'cobalt'
                    ? "Cobalt's public API. Fastest path — works for ~95% of YouTube URLs. No 5090 needed."
                    : 'Routes through your 5090 worker over your home IP — bypasses YouTube\'s datacenter-IP anti-bot if Cobalt refuses. Slower (depends on your home upload).'}
                </p>
              </div>

              <button
                onClick={onSubmit}
                disabled={submitting || !url.trim() || !isYtUrl(url)}
                className='relative w-full overflow-hidden text-sm font-bold px-6 py-3.5 rounded-full border border-amber-500/50 bg-gradient-to-r from-amber-500/25 via-rose-500/25 to-fuchsia-500/25 text-amber-100 hover:from-amber-500/35 hover:to-fuchsia-500/35 disabled:opacity-50 min-h-[48px] transition-all'>
                {submitting ? 'Queuing…' : '⬇  Start download'}
              </button>
              <p className='text-[10px] font-mono text-gray-600 leading-relaxed'>
                File auto-deletes off the server as soon as your browser finishes saving it. Anything stuck around → nightly 04:30 IST sweep clears terminal rows + files older than 48h. Queue up as many as you want — BE runs 3 at a time and the rest wait.
              </p>
            </div>

            {/* Ready-to-grab jobs (completed but the user hasn't saved yet) */}
            {readyJobs.length > 0 && (
              <div className='luxe-card p-5 sm:p-6'>
                <p className='text-[10px] uppercase tracking-wider text-emerald-300 font-mono mb-3'>✓ Ready · click to save</p>
                <ul className='space-y-2'>
                  {readyJobs.map(j => (
                    <li key={j.id} className='flex items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 flex-wrap'>
                      <div className='min-w-0 flex-1'>
                        <div className='flex items-center gap-2 text-[10px] uppercase tracking-wider text-gray-500 font-mono mb-0.5'>
                          <span>#{j.id}</span><span>·</span><span>{j.format}</span><span>·</span><span>{fmtBytes(j.fileSize)}</span>
                          {j.duration && <><span>·</span><span>{fmtDur(j.duration)}</span></>}
                        </div>
                        <p className='text-sm text-gray-100 font-mono truncate'>{j.title || j.url}</p>
                      </div>
                      <a
                        href={ytdlFileUrl(j.id)}
                        className='text-sm font-bold px-5 py-2 rounded-full border border-emerald-500/50 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30 min-h-[40px] inline-flex items-center gap-2'>
                        <DownloadOutlined /> Save
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Failed jobs — antd Alerts with a friendlier message + retry. */}
            {failedJobs.length > 0 && (
              <div className='luxe-card p-5 sm:p-6'>
                <div className='flex items-center justify-between gap-2 mb-3'>
                  <p className='text-[10px] uppercase tracking-wider text-rose-300 font-mono'>✗ Failed · {failedJobs.length}</p>
                  <button
                    onClick={() => requestBulkDelete(failedJobs, 'Clear all failed')}
                    className='text-[10px] font-semibold px-3 py-1 rounded-full border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 inline-flex items-center gap-1'>
                    <DeleteOutlined /> Clear all
                  </button>
                </div>
                <div className='space-y-2'>
                  {failedJobs.map(j => {
                    const { title, detail } = humaniseError(j.error)
                    return (
                      <Alert
                        key={j.id}
                        type='error'
                        showIcon
                        message={
                          <div className='flex items-center justify-between gap-2 flex-wrap'>
                            <span className='font-semibold'>{title}</span>
                            <span className='text-[10px] font-mono uppercase tracking-wider opacity-70'>#{j.id} · {j.format} · {j.quality}</span>
                          </div>
                        }
                        description={
                          <div className='space-y-1.5'>
                            <p className='text-xs break-words'>{detail}</p>
                            <p className='text-[10px] font-mono opacity-60 break-all'>{j.url}</p>
                          </div>
                        }
                        action={
                          <div className='flex flex-col gap-1.5 ml-2'>
                            <button
                              onClick={() => { setUrl(j.url); setFormat(j.format); setQuality(j.quality); if (j.worker) setWorker(j.worker); requestDelete(j) }}
                              className='text-[10px] font-semibold px-2 py-1 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20'>
                              ↺ Retry
                            </button>
                            <button
                              onClick={() => requestDelete(j)}
                              className='text-[10px] font-semibold px-2 py-1 rounded-full border border-gray-300 hover:border-gray-500 text-gray-600'>
                              dismiss
                            </button>
                          </div>
                        }
                      />
                    )
                  })}
                </div>
              </div>
            )}

            {/* In-flight jobs — one card per job, polled together */}
            {inFlightJobs.length > 0 && (
              <div className='luxe-card p-5 sm:p-6'>
                <div className='flex items-center justify-between gap-2 mb-3'>
                  <p className='text-[10px] uppercase tracking-wider text-amber-300 font-mono'>⏳ In flight · {inFlightJobs.length}</p>
                  <button
                    onClick={() => requestBulkDelete(inFlightJobs, 'Cancel all')}
                    className='text-[10px] font-semibold px-3 py-1 rounded-full border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 inline-flex items-center gap-1'>
                    <DeleteOutlined /> Cancel all
                  </button>
                </div>
                <ul className='space-y-3'>
                  {inFlightJobs.map(j => (
                    <li key={j.id} className='rounded-lg border border-gray-800 bg-gray-950/40 p-3'>
                      <div className='flex items-center justify-between gap-2 mb-1.5'>
                        <span className='text-[10px] uppercase tracking-wider text-gray-500 font-mono'>#{j.id} · {j.format} · {j.quality}</span>
                        <StatusTag status={j.status} />
                      </div>
                      <p className='text-xs text-gray-200 font-mono truncate'>{j.title || j.url}</p>
                      <Progress
                        percent={j.progress || 0}
                        size='small'
                        showInfo={false}
                        strokeColor={{ from: '#fbbf24', to: '#fb7185' }}
                        trailColor='#1f2937'
                        className='!mb-0 !mt-2'
                      />
                      <div className='flex items-center justify-between mt-1.5 text-[10px] font-mono text-gray-500 tabular-nums'>
                        <span>{j.status === 'queued' ? 'Waiting for a free worker…' : `${j.progress || 0}%`}</span>
                        <button onClick={() => requestDelete(j)} className='text-rose-300/80 hover:text-rose-200 inline-flex items-center gap-1'>
                          <DeleteOutlined /> cancel
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* ── History sidebar ── */}
          <aside>
            <div className='luxe-card p-4 sm:p-5'>
              <div className='flex items-center justify-between mb-2'>
                <h2 className='text-sm font-semibold tracking-wider uppercase text-gray-300'>Recent</h2>
                <button onClick={loadHistory}
                  className='text-[10px] font-semibold px-2 py-1 rounded-full border border-gray-800 hover:border-gray-600 text-gray-400 inline-flex items-center gap-1'>
                  <ReloadOutlined /> Refresh
                </button>
              </div>
              {/* Bulk-clear bar — only shows when there's something to clear in this browser. */}
              {(() => {
                const mine = history.filter(j => trackedIds.includes(j.id))
                const completed = mine.filter(j => j.status === 'completed')
                const failed    = mine.filter(j => j.status === 'failed')
                const all       = mine
                if (!mine.length) return null
                return (
                  <div className='flex flex-wrap gap-1.5 mb-3'>
                    {completed.length > 0 && (
                      <button
                        onClick={() => requestBulkDelete(completed, 'Clear completed')}
                        className='text-[10px] font-semibold px-2 py-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20'>
                        ✓ Clear {completed.length} done
                      </button>
                    )}
                    {failed.length > 0 && (
                      <button
                        onClick={() => requestBulkDelete(failed, 'Clear failed')}
                        className='text-[10px] font-semibold px-2 py-1 rounded-full border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'>
                        ✗ Clear {failed.length} failed
                      </button>
                    )}
                    {all.length > 1 && (
                      <button
                        onClick={() => requestBulkDelete(all, 'Wipe all my jobs')}
                        className='text-[10px] font-semibold px-2 py-1 rounded-full border border-rose-500/60 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25'>
                        🗑 Wipe all {all.length}
                      </button>
                    )}
                  </div>
                )
              })()}
              {!history.length && (
                <div className='py-6 text-center'>
                  <div aria-hidden className='text-3xl mb-1.5'>🎬</div>
                  <p className='text-xs text-gray-500'>Nothing yet — paste a YouTube link above.</p>
                </div>
              )}
              <ul className='space-y-2'>
                {history.map(j => (
                  <li key={j.id} className='rounded-lg border border-gray-800 bg-gray-950/40 p-3 hover:border-gray-700 transition-colors'>
                    <div className='flex items-center justify-between mb-1'>
                      <span className='text-[10px] uppercase tracking-wider text-gray-500 font-mono'>#{j.id} · {j.format}</span>
                      <StatusTag status={j.status} />
                    </div>
                    <p className='text-xs text-gray-200 font-mono truncate'>{j.title || j.url}</p>
                    {j.status === 'processing' && (
                      <Progress
                        percent={j.progress || 0}
                        size='small'
                        showInfo={false}
                        strokeColor={{ from: '#fbbf24', to: '#fb7185' }}
                        trailColor='#1f2937'
                        className='!mb-0 !mt-1.5'
                      />
                    )}
                    <div className='flex items-center justify-between gap-2 mt-2'>
                      <span className='text-[10px] font-mono text-gray-500 tabular-nums'>
                        {j.fileSize ? fmtBytes(j.fileSize) : `${j.progress || 0}%`}
                        {j.duration ? <> · {fmtDur(j.duration)}</> : null}
                      </span>
                      <div className='flex items-center gap-1'>
                        {j.status === 'completed' && (
                          <a
                            href={ytdlFileUrl(j.id)}
                            title='Download'
                            className='text-[10px] font-semibold px-2 py-1 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 inline-flex items-center gap-1'>
                            <DownloadOutlined />
                          </a>
                        )}
                        <button
                          onClick={() => requestDelete(j)}
                          title='Remove'
                          className='text-[10px] font-semibold px-2 py-1 rounded border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 inline-flex items-center gap-1'>
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
    </section>
  )
}

function StatusTag({ status }) {
  const map = {
    queued:     { color: 'default', label: 'Queued' },
    processing: { color: 'processing', label: 'Downloading' },
    completed:  { color: 'success', label: 'Ready' },
    failed:     { color: 'error', label: 'Failed' },
  }
  const m = map[status] || { color: 'default', label: status || 'Unknown' }
  return <Tag color={m.color} className='!text-[10px] !uppercase !tracking-wider !m-0'>{m.label}</Tag>
}

function StatBubble({ icon, label, value, accent = 'gray' }) {
  const accents = {
    gray:    'border-gray-800        bg-gray-900/60       text-gray-100',
    emerald: 'border-emerald-500/40 bg-emerald-500/10   text-emerald-200',
    amber:   'border-amber-500/40   bg-amber-500/10     text-amber-200',
  }
  return (
    <div className={`rounded-xl border ${accents[accent]} px-3 py-2.5`}>
      <div className='flex items-center gap-1.5 text-[10px] uppercase tracking-wider opacity-70'>
        {icon} {label}
      </div>
      <div className='text-xl font-bold mt-0.5'>{value}</div>
    </div>
  )
}
