import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Upload, Input, Select, Modal, Alert } from 'antd'
import { notice } from '../lib/notice'
import { UploadOutlined, SoundOutlined, ThunderboltOutlined, ReloadOutlined, DownloadOutlined, CheckOutlined, DeleteOutlined, SyncOutlined } from '@ant-design/icons'
import { submitLipsync, getLipsyncStatus, fileToDataUrl, listLipsyncJobs, lipsyncBulkAction } from '../api/ai'
import StudioLibrary, { SelectCheckbox } from '../components/StudioLibrary'
import AudioRecorder from '../components/AudioRecorder'
import CameraCapture from '../components/CameraCapture'
import useQueryState from '../hooks/useQueryState'

const MODELS = [
  { value: 'latentsync',   label: 'LatentSync 1.5',  blurb: 'Best mouth detail. ByteDance. ~1-3min for a 10s clip on 5090.' },
  { value: 'musetalk',     label: 'MuseTalk',         blurb: '2× faster than LatentSync. Slightly softer mouth shapes. ~30-60s.' },
  { value: 'liveportrait', label: 'LivePortrait (puppet)', blurb: 'Driver-video mode — upload a VIDEO instead of audio. The portrait mimics the driver\'s expressions.' },
]

export default function LipSync() {
  const [audioFile, setAudioFile] = useState(null)
  const [audioDataUrl, setAudioDataUrl] = useState('')
  const [portraitFile, setPortraitFile] = useState(null)
  const [portraitDataUrl, setPortraitDataUrl] = useState('')
  // Model card mirrored to URL so refresh keeps the same engine selected.
  const [model, setModel] = useQueryState('model', 'latentsync', { allowed: ['latentsync', 'musetalk', 'liveportrait'] })
  // When switching to/from LivePortrait, clear the upload — audio and
  // video file inputs are mutually incompatible. Otherwise the file from
  // before the switch silently submits to the new model and breaks.
  useEffect(() => {
    setAudioFile(null); setAudioDataUrl('')
  }, [model])
  const [working, setWorking] = useState(false)
  const [job, setJob] = useState(null)
  const [error, setError] = useState(null)
  const pollTimer = useRef(null)
  const [libraryRefresh, setLibraryRefresh] = useState(0)

  useEffect(() => { document.title = 'Lip Sync Studio · Sid' }, [])
  useEffect(() => () => { if (pollTimer.current) clearInterval(pollTimer.current) }, [])

  const handleAudio = async (f) => {
    try { const d = await fileToDataUrl(f); setAudioFile(f); setAudioDataUrl(d); setError(null) }
    catch { notice.error('Could not read audio') }
    return false
  }
  const handlePortrait = async (f) => {
    try { const d = await fileToDataUrl(f); setPortraitFile(f); setPortraitDataUrl(d); setError(null) }
    catch { notice.error('Could not read image') }
    return false
  }

  const startPolling = (jobId) => {
    if (pollTimer.current) clearInterval(pollTimer.current)
    pollTimer.current = setInterval(async () => {
      const { data, error: err } = await getLipsyncStatus(jobId)
      if (err) return
      if (!data) return
      setJob(data)
      if (data.status === 'completed') {
        clearInterval(pollTimer.current); pollTimer.current = null; setWorking(false)
        setLibraryRefresh(k => k + 1)
      } else if (data.status === 'failed') {
        clearInterval(pollTimer.current); pollTimer.current = null; setWorking(false)
        setError(data.error || 'Lip sync failed')
      }
    }, 2000)
  }

  const generate = async () => {
    if (!audioDataUrl) { setError('Upload an audio clip'); return }
    if (!portraitDataUrl) { setError('Upload a portrait'); return }
    setError(null); setJob(null); setWorking(true)
    const { data, error: err } = await submitLipsync({
      audioDataUrl, portraitDataUrl, model,
    })
    if (err) { setWorking(false); setError(err); return }
    setJob(data)
    startPolling(data.jobId)
  }

  const doReset = () => {
    setAudioFile(null); setAudioDataUrl('')
    setPortraitFile(null); setPortraitDataUrl('')
    setJob(null); setError(null); setWorking(false)
    if (pollTimer.current) clearInterval(pollTimer.current)
  }

  // Clear is destructive — both inputs go away + any in-flight job stops
  // polling. Modal.confirm with red OK + cancel auto-focused so a phone
  // mistap doesn't nuke an audio recording the user just made.
  const reset = () => {
    if (!audioDataUrl && !portraitDataUrl && !job) { doReset(); return }
    Modal.confirm({
      title: 'Clear everything?',
      content: working
        ? 'This stops polling the in-flight job (the BE keeps rendering, but you won\'t see the result here) and removes both uploads.'
        : 'This removes the audio + portrait + any result on screen. The library entry is kept.',
      okText: 'Clear',
      okType: 'danger',
      okButtonProps: { danger: true },
      cancelText: 'Keep',
      autoFocusButton: 'cancel',
      centered: true,
      onOk: doReset,
    })
  }

  return (
    <section className="relative min-h-screen bg-[#0a0a0e] text-gray-100 pt-24 sm:pt-32 pb-16 px-4 sm:px-6 overflow-hidden">
      <div aria-hidden className="ambient-orb ambient-orb-cool -top-32 left-1/2 -translate-x-1/2" />
      <div aria-hidden className="ambient-orb -bottom-40 -right-32" />
      <div className="relative max-w-5xl mx-auto">
        <header className="mb-8">
          <p className="eyebrow-mono">— AI Studio · Lip Sync</p>
          <div className="flex items-center gap-3 mt-2">
            <SoundOutlined className="text-emerald-400 text-2xl" />
            <h1 className="text-4xl sm:text-5xl font-bold leading-tight text-white">
              Lip Sync Studio
            </h1>
          </div>
          <p className="mt-3 text-sm text-fg-secondary max-w-2xl leading-relaxed">
            Drop an audio clip + a portrait. Get a talking-head video where the
            mouth tracks the audio perfectly. Runs LatentSync on the 5090 — no
            cloud, no watermark.
          </p>
        </header>

        {/* mb-8 (was mb-6) — gives the recorder button below the dropzone
            breathing room before the "Lip-sync model" picker. On phones the
            grid collapses to a single column and the recorder used to sit
            flush against the next heading. */}
        <section className="grid sm:grid-cols-2 gap-4 mb-8">
          {/* Source audio — relabelled "driver video" when LivePortrait is picked */}
          <div className="rounded-2xl border-2 border-dashed border-gray-800 hover:border-emerald-500/40 transition-colors p-4 bg-gray-900/40 flex flex-col gap-2">
            <p className="text-[10px] uppercase tracking-wider text-gray-500">
              {model === 'liveportrait' ? 'Driver video' : 'Source audio'}
            </p>
            {audioDataUrl ? (
              <div className="space-y-2">
                {model === 'liveportrait'
                  ? <video controls src={audioDataUrl} className="w-full max-h-[40vh] rounded-lg" />
                  : <audio controls src={audioDataUrl} className="w-full" />}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-[10px] text-gray-600 font-mono truncate">{audioFile?.name || 'recorded audio'}</span>
                  <button onClick={() => { setAudioFile(null); setAudioDataUrl('') }}
                    className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg border border-rose-500/40 hover:border-rose-400 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 transition-colors">
                    <SyncOutlined className="text-[9px]" /> Replace
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <Upload.Dragger multiple={false} showUploadList={false}
                  accept={model === 'liveportrait' ? 'video/*' : 'audio/*,video/*'}
                  beforeUpload={handleAudio}
                  style={{ background: 'transparent', borderColor: 'transparent', padding: '12px 0' }}>
                  <UploadOutlined className="text-3xl text-emerald-400 mb-2" />
                  <p className="text-sm text-gray-300">
                    {model === 'liveportrait'
                      ? 'Drop driver video — the portrait will mimic its expressions'
                      : 'Drop audio or click to upload'}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-1">
                    {model === 'liveportrait' ? 'mp4 / webm · short clip recommended' : 'mp3 / wav / m4a · max 60s'}
                  </p>
                </Upload.Dragger>
                {/* Mic record — only for audio-driven models. LivePortrait
                    wants a driver VIDEO, so no record option for it. The
                    block is wrapped in its own div with extra bottom padding
                    so the button doesn't visually crowd the next section's
                    heading on narrow viewports. */}
                {model !== 'liveportrait' && (
                  <div className="pt-1">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex-1 h-px bg-gray-800" />
                      <span className="text-[10px] uppercase tracking-wider text-gray-600 whitespace-nowrap">or speak now</span>
                      <div className="flex-1 h-px bg-gray-800" />
                    </div>
                    <AudioRecorder accentColor="#34d399" maxSeconds={60} compact
                      onComplete={(d) => { setAudioDataUrl(d); setAudioFile(null); setError(null) }} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Source portrait */}
          <div className="rounded-2xl border-2 border-dashed border-gray-800 hover:border-cyan-500/40 transition-colors p-4 bg-gray-900/40">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Portrait image</p>
            {portraitDataUrl ? (
              <div className="relative">
                <img src={portraitDataUrl} alt="portrait" className="w-full max-h-72 object-contain rounded-lg" />
                <button onClick={() => { setPortraitFile(null); setPortraitDataUrl('') }}
                  className="absolute top-2 right-2 inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-black/70 hover:bg-rose-600 text-gray-200 hover:text-white border border-white/10 transition-colors">
                  <SyncOutlined className="text-[9px]" /> Replace
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload.Dragger multiple={false} showUploadList={false}
                  accept="image/*" beforeUpload={handlePortrait}
                  style={{ background: 'transparent', borderColor: 'transparent', padding: '20px 0' }}>
                  <UploadOutlined className="text-3xl text-cyan-400 mb-2" />
                  <p className="text-sm text-gray-300">Drop portrait or click to upload</p>
                  <p className="text-[10px] text-gray-500 mt-1">Single face, front-facing works best</p>
                </Upload.Dragger>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-gray-800" />
                  <span className="text-[10px] uppercase tracking-wider text-gray-600">or snap</span>
                  <div className="flex-1 h-px bg-gray-800" />
                </div>
                <CameraCapture accentColor="#22d3ee"
                  onSnap={(dataUrl) => { setPortraitDataUrl(dataUrl); setPortraitFile(null) }} />
              </div>
            )}
          </div>
        </section>

        <section className="mb-6 space-y-2">
          <label className="text-[10px] uppercase tracking-wider text-gray-500">Lip-sync model</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 [perspective:1200px]">
            {MODELS.map(m => (
              <ModelCard key={m.value} model={m} active={model === m.value}
                onSelect={() => setModel(m.value)} />
            ))}
          </div>
        </section>

        {/* Result */}
        <section className="rounded-2xl border border-gray-800 bg-gray-900/40 p-4 mb-6">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Output</p>
          {job?.outputUrl ? (
            <>
              <video src={job.outputUrl} controls className="w-full max-h-96 rounded-lg" />
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[10px] text-gray-500 font-mono">{job.jobId}</span>
                <a href={job.outputUrl} download
                  className="flex items-center gap-1 text-xs px-3 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40">
                  <DownloadOutlined /> Download
                </a>
              </div>
            </>
          ) : working ? (
            <div className="py-6 flex flex-col items-center gap-2">
              <div className="w-8 h-8 rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin" />
              <p className="text-emerald-300 text-sm font-semibold">{job?.status === 'processing' ? 'Generating lip-sync…' : 'Queued'}</p>
              {job?.jobId && <p className="text-[9px] text-gray-700 font-mono">{job.jobId}</p>}
              {Array.isArray(job?.logs) && job.logs.length > 0 && (
                <ul className="mt-3 w-full max-h-40 overflow-y-auto bg-black/40 rounded-lg p-2 space-y-0.5">
                  {job.logs.slice(-10).map((l, i) => (
                    <li key={i} className="text-[10px] font-mono text-emerald-200/80 break-all">{l.msg}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : error ? (
            <Alert
              type="error"
              showIcon
              message="Lip sync failed"
              description={error}
              action={
                <button onClick={generate}
                  className="text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/12 text-emerald-300 hover:bg-emerald-500/20 inline-flex items-center gap-1">
                  <ReloadOutlined /> Retry
                </button>
              }
            />
          ) : (
            <p className="text-xs text-gray-600 text-center py-8">Result will appear here</p>
          )}
        </section>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2">
          {(audioDataUrl || portraitDataUrl) && (
            <button onClick={reset}
              className="tap-44 px-4 text-sm text-gray-400 hover:text-gray-200 border border-line hover:border-line-strong rounded-lg transition-colors">
              Clear
            </button>
          )}
          <button onClick={generate}
            disabled={working || !audioDataUrl || !portraitDataUrl}
            className={`tap-44 luxe-btn luxe-btn-primary min-h-[48px] ${
              working || !audioDataUrl || !portraitDataUrl
                ? 'opacity-50 cursor-not-allowed'
                : ''
            }`}>
            <ThunderboltOutlined />
            {working ? 'Working…' : 'Generate lip-sync'}
          </button>
        </div>

        {/* Library — every lipsync you've generated, with bulk delete. */}
        <StudioLibrary
          refreshKey={libraryRefresh}
          title="Your Lip Syncs"
          listFn={({ status, page, limit }) => listLipsyncJobs({ status, page, limit })}
          bulkFn={lipsyncBulkAction}
          getId={(it) => it.jobId}
          bulkAccent="emerald"
          renderCard={(it, { selectMode, checked, onToggleSelect, onDelete }) => (
            <LipsyncCard key={it.jobId} item={it}
              selectMode={selectMode} checked={checked}
              onToggleSelect={onToggleSelect} onDelete={onDelete} />
          )}
        />
      </div>
    </section>
  )
}

// Library card for a finished (or in-flight) lipsync job
function LipsyncCard({ item, selectMode, checked, onToggleSelect, onDelete }) {
  const url = item.outputUrl
  const handleClick = (e) => {
    if (selectMode) { e.preventDefault(); onToggleSelect?.() }
  }
  // Completed → open the mp4 in a new tab. In-flight / failed → land on the
  // detail page so the user can watch logs / read the failure / share the
  // URL while it's still rendering.
  const isActive = item.status !== 'completed'
  const href = isActive ? `/lipsync/${encodeURIComponent(item.jobId)}` : (url || '#')
  const Linker = isActive ? Link : 'a'
  const linkerProps = isActive
    ? { to: href }
    : { href, target: '_blank', rel: 'noopener' }
  return (
    <div className={`group relative aspect-video rounded-lg overflow-hidden border transition-colors bg-gray-900/40 ${
      checked
        ? 'border-emerald-400 ring-2 ring-emerald-400/40'
        : 'border-gray-800 hover:border-emerald-400/50'
    }`}>
      <Linker {...linkerProps} onClick={handleClick}
        className={`block w-full h-full ${selectMode ? 'cursor-pointer' : ''}`}>
        {url ? (
          <video src={url} muted playsInline preload="metadata"
            className={`w-full h-full object-cover ${selectMode && !checked ? 'opacity-60' : ''}`} />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-950">
            <span className="text-xs uppercase tracking-wider text-gray-500 font-mono">
              {item.status === 'failed' ? 'failed' : item.status === 'processing' ? 'rendering' : 'queued'}
            </span>
          </div>
        )}
      </Linker>
      {selectMode && <SelectCheckbox checked={checked} onToggle={onToggleSelect} />}
      <div className="pointer-events-none absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-black/60 text-white border border-white/10">
        {item.model || 'lip'}
      </div>
      {item.status !== 'completed' && (
        <div className={`pointer-events-none absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
          item.status === 'failed' ? 'bg-rose-500/80 text-white'
          : item.status === 'processing' ? 'bg-cyan-500/80 text-white'
          : 'bg-amber-500/80 text-black'
        }`}>{item.status}</div>
      )}
      {!selectMode && onDelete && (
        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete() }}
          title="Delete"
          className="absolute bottom-1.5 right-1.5 w-7 h-7 flex items-center justify-center rounded-lg bg-black/70 hover:bg-rose-600 text-gray-200 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity">
          <DeleteOutlined className="text-xs" />
        </button>
      )}
    </div>
  )
}

// Flat model picker card
function ModelCard({ model: m, active, onSelect }) {
  return (
    <button type="button" onClick={onSelect}
      className={`relative p-3 rounded-lg text-left border-2 transition-colors overflow-hidden group ${
        active
          ? 'border-emerald-400/70 bg-emerald-500/10'
          : 'border-gray-800 bg-gray-900/40 hover:border-gray-700 hover:bg-gray-900'
      }`}>
      {active && (
        <span aria-hidden className="absolute -top-2 -right-2 w-6 h-6 rounded-lg bg-emerald-500 flex items-center justify-center text-black z-10">
          <CheckOutlined className="text-[10px] font-bold" />
        </span>
      )}
      <div className="relative">
        <p className={`text-sm font-bold ${active ? 'text-white' : 'text-gray-200'}`}>{m.label}</p>
        <p className={`text-[10px] mt-0.5 leading-snug ${active ? 'text-gray-300' : 'text-gray-500'}`}>{m.blurb}</p>
      </div>
    </button>
  )
}
