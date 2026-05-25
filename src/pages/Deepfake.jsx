import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, Input, Select, Alert } from 'antd'
import { notice } from '../lib/notice'
import { UploadOutlined, ThunderboltOutlined, DownloadOutlined, SyncOutlined, LockOutlined, ReloadOutlined, SmileOutlined, AudioOutlined, VideoCameraOutlined } from '@ant-design/icons'
import VaultGate from '../components/VaultGate'
import AudioRecorder from '../components/AudioRecorder'
import CameraCapture from '../components/CameraCapture'
import VoiceCloneAnalysis from '../components/VoiceCloneAnalysis'
import JobLogsAgentPlan from '../components/JobLogsAgentPlan'
import { submitDeepfakeJob, getDeepfakeStatus, listDeepfakeJobs, fileToDataUrl } from '../api/ai'
import useQueryState from '../hooks/useQueryState'

// /deepfake — Vault-gated lane. Behind the same sid-vault-token gate as
// the rest of the AI Studio. Two tabs:
//   1) Face Swap — upload source face + target image → swapped output
//   2) Voice (anyone) — XTTS/RVC voice clone without the public consent
//      attestation; the Vault password is the attestation.
//
// All submissions hit /api/deepfake/* which is `requireVault`-gated on the
// BE — so this isn't just a UI hide. A leaked token is the only way around.

const XTTS_LANGUAGES = [
  { value: 'en', label: '🇬🇧 English' },
  { value: 'hi', label: '🇮🇳 Hindi' },
  { value: 'es', label: '🇪🇸 Spanish' },
  { value: 'fr', label: '🇫🇷 French' },
  { value: 'de', label: '🇩🇪 German' },
  { value: 'it', label: '🇮🇹 Italian' },
  { value: 'pt', label: '🇵🇹 Portuguese' },
  { value: 'pl', label: '🇵🇱 Polish' },
  { value: 'tr', label: '🇹🇷 Turkish' },
  { value: 'ru', label: '🇷🇺 Russian' },
  { value: 'nl', label: '🇳🇱 Dutch' },
  { value: 'cs', label: '🇨🇿 Czech' },
  { value: 'ar', label: '🇸🇦 Arabic' },
  { value: 'zh-cn', label: '🇨🇳 Chinese' },
  { value: 'ja', label: '🇯🇵 Japanese' },
  { value: 'ko', label: '🇰🇷 Korean' },
]

function DeepfakeInner() {
  const navigate = useNavigate()
  // Tab + per-lane selectors mirrored to URL so refresh restores the same
  // tab + language combo. File uploads stay local — can't be serialised.
  const [tab, setTab] = useQueryState('tab', 'face-swap', { allowed: ['face-swap', 'voice-any'] })
  // Face-swap state
  const [srcFile, setSrcFile] = useState(null)
  const [srcDataUrl, setSrcDataUrl] = useState('')
  const [tgtFile, setTgtFile] = useState(null)
  const [tgtDataUrl, setTgtDataUrl] = useState('')
  // Voice-any state
  const [refFile, setRefFile] = useState(null)
  const [refDataUrl, setRefDataUrl] = useState('')
  const [melodyFile, setMelodyFile] = useState(null)
  const [melodyDataUrl, setMelodyDataUrl] = useState('')
  const [prompt, setPrompt] = useState('')
  const [language, setLanguage] = useQueryState('lang', 'en')
  // Shared job state
  const [working, setWorking] = useState(false)
  const [job, setJob] = useState(null)
  const [error, setError] = useState(null)
  const pollRef = useRef(null)
  // Library state — past saved deepfakes (face-swap images + voice-any audio).
  // Loads on mount and refreshes after each successful submission.
  const [library, setLibrary] = useState([])
  const [libraryFilter, setLibraryFilter] = useQueryState('lib', 'all', { allowed: ['all', 'face-swap', 'voice-any'] })
  const [libraryRefresh, setLibraryRefresh] = useState(0)

  useEffect(() => { document.title = 'Deepfake · Sid' }, [])
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  // Pull the library on mount + after every successful submission. Filter
  // is applied server-side via the `kind` query param when set.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await listDeepfakeJobs({
        kind: libraryFilter === 'all' ? undefined : libraryFilter,
        limit: 60,
      })
      if (cancelled) return
      setLibrary(data?.items || [])
    })()
    return () => { cancelled = true }
  }, [libraryFilter, libraryRefresh])

  const startPolling = (jobId) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      const { data, error: err } = await getDeepfakeStatus(jobId)
      if (err || !data) return
      setJob(data)
      if (data.status === 'completed' || data.status === 'failed') {
        clearInterval(pollRef.current); pollRef.current = null
        setWorking(false)
        if (data.status === 'failed') setError(data.error || 'Generation failed')
        // Refresh library so the new output appears in the gallery
        if (data.status === 'completed') setLibraryRefresh(k => k + 1)
      }
    }, 1500)
  }

  const handleUpload = (setter) => async (file) => {
    if (!file) return false
    if (file.size > 16 * 1024 * 1024) {
      notice.error('File too large (max 16 MB)'); return false
    }
    try {
      const d = await fileToDataUrl(file)
      setter({ file, dataUrl: d })
      setError(null)
    } catch { notice.error('Could not read file') }
    return false
  }
  const handleSrcUpload    = handleUpload(({ file, dataUrl }) => { setSrcFile(file); setSrcDataUrl(dataUrl) })
  const handleTgtUpload    = handleUpload(({ file, dataUrl }) => { setTgtFile(file); setTgtDataUrl(dataUrl) })
  const handleRefUpload    = handleUpload(({ file, dataUrl }) => { setRefFile(file); setRefDataUrl(dataUrl) })
  const handleMelodyUpload = handleUpload(({ file, dataUrl }) => { setMelodyFile(file); setMelodyDataUrl(dataUrl) })

  const generate = async () => {
    setError(null); setJob(null)
    let payload
    if (tab === 'face-swap') {
      if (!srcDataUrl) { setError('Upload a source face image'); return }
      if (!tgtDataUrl) { setError('Upload a target image to swap onto'); return }
      payload = {
        kind: 'face-swap',
        sourceFaceDataUrl: srcDataUrl,
        targetImageDataUrl: tgtDataUrl,
      }
    } else {
      if (!refDataUrl)    { setError('Upload a reference voice clip (6-30s)'); return }
      if (!prompt.trim()) { setError('Add the text/lyrics'); return }
      payload = {
        kind: 'voice-any',
        referenceAudioDataUrl: refDataUrl,
        prompt: prompt.trim(),
        language,
        ...(melodyDataUrl ? { melodyAudioDataUrl: melodyDataUrl } : {}),
      }
    }
    setWorking(true)
    const { data, error: err } = await submitDeepfakeJob(payload)
    if (err) { setWorking(false); setError(err); return }
    setJob(data)
    startPolling(data.jobId)
  }

  const status = job?.status
  const outputUrl = job?.outputUrl

  return (
    <section className="relative min-h-screen bg-[#0a0a0e] text-gray-100 pt-24 pb-16 px-4 sm:px-6 overflow-hidden">
      <div aria-hidden className="ambient-orb -top-32 left-1/2 -translate-x-1/2" />
      <div aria-hidden className="ambient-orb ambient-orb-cool -bottom-40 -right-32" />
      <div className="relative max-w-5xl mx-auto">
        <header className="mb-8">
          <p className="eyebrow-mono">— AI Studio · Vault</p>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <LockOutlined className="text-rose-400 text-2xl" />
            <h1 className="text-4xl sm:text-5xl font-bold leading-tight text-white">
              Deepfake Studio
            </h1>
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-300 inline-flex items-center gap-1">
              <LockOutlined /> Vault · Private
            </span>
          </div>
          <p className="mt-3 text-sm text-fg-secondary max-w-2xl leading-relaxed">
            Personal-use lane. Face swap + unrestricted voice clone. Behind the
            Vault password — not exposed to public visitors.
          </p>
        </header>

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          {[
            { id: 'face-swap', label: 'Face Swap', icon: <SmileOutlined /> },
            { id: 'voice-any', label: 'Voice (any)', icon: <AudioOutlined /> },
          ].map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setJob(null); setError(null) }}
              className={`luxe-btn text-xs sm:text-sm inline-flex items-center gap-2 ${tab === t.id ? 'luxe-btn-primary' : 'luxe-btn-secondary'}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {tab === 'face-swap' ? (
          <section className="grid sm:grid-cols-2 gap-4 mb-6">
            <UploadCard label="Source face"
              accent="fuchsia" dataUrl={srcDataUrl} file={srcFile}
              onUpload={handleSrcUpload}
              onClear={() => { setSrcFile(null); setSrcDataUrl('') }}
              onCapture={(dataUrl) => { setSrcDataUrl(dataUrl); setSrcFile(null); setError(null) }}
              hint="Clean front-facing portrait works best" />
            <UploadCard label="Target image"
              accent="amber" dataUrl={tgtDataUrl} file={tgtFile}
              onUpload={handleTgtUpload}
              onClear={() => { setTgtFile(null); setTgtDataUrl('') }}
              onCapture={(dataUrl) => { setTgtDataUrl(dataUrl); setTgtFile(null); setError(null) }}
              hint="Any photo · multi-face targets swap every face" />
          </section>
        ) : (
          <section className="space-y-4 mb-6">
            <div>
              <label className="text-[11px] uppercase tracking-wider text-gray-400 mb-1 block font-semibold">
                Reference voice clip · 6–30s
              </label>
              {refDataUrl ? (
                <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-3 space-y-2">
                  <audio src={refDataUrl} controls className="w-full" />
                  <div className="flex items-center justify-between gap-2 text-[10px] text-gray-500 font-mono">
                    <span className="truncate">{refFile?.name || 'recorded clip'}</span>
                    <button onClick={() => { setRefFile(null); setRefDataUrl('') }}
                      className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg border border-rose-500/40 hover:border-rose-400 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300">
                      <SyncOutlined className="text-[9px]" /> Replace
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload.Dragger multiple={false} showUploadList={false}
                    accept="audio/*"
                    beforeUpload={handleRefUpload}
                    style={{ background: 'transparent', borderColor: '#374151', padding: '24px 0' }}>
                    <UploadOutlined className="text-3xl text-rose-400 mb-2" />
                    <p className="text-sm text-gray-300">Drop a reference clip</p>
                    <p className="text-[10px] text-gray-500 mt-1">mp3 · wav · m4a · max 16 MB</p>
                  </Upload.Dragger>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-gray-800" />
                    <span className="text-[10px] uppercase tracking-wider text-gray-600">or record</span>
                    <div className="flex-1 h-px bg-gray-800" />
                  </div>
                  <AudioRecorder accentColor="#fb7185" maxSeconds={30}
                    onComplete={(d) => { setRefDataUrl(d); setRefFile(null); setError(null) }} />
                </div>
              )}
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wider text-gray-400 mb-1 block font-semibold">
                Melody track <span className="text-gray-600 normal-case font-normal">(optional · singing pipeline)</span>
              </label>
              {melodyDataUrl ? (
                <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-3 space-y-2">
                  <audio src={melodyDataUrl} controls className="w-full" />
                  <div className="flex items-center justify-between gap-2 text-[10px] text-gray-500 font-mono">
                    <span className="truncate">{melodyFile?.name || 'hummed melody'}</span>
                    <button onClick={() => { setMelodyFile(null); setMelodyDataUrl('') }}
                      className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg border border-rose-500/40 hover:border-rose-400 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300">
                      <SyncOutlined className="text-[9px]" /> Replace
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload.Dragger multiple={false} showUploadList={false}
                    accept="audio/*"
                    beforeUpload={handleMelodyUpload}
                    style={{ background: 'transparent', borderColor: '#374151', padding: '16px 0' }}>
                    <UploadOutlined className="text-2xl text-amber-400 mb-1" />
                    <p className="text-xs text-gray-300">Upload a hummed / sung melody</p>
                  </Upload.Dragger>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-gray-800" />
                    <span className="text-[10px] uppercase tracking-wider text-gray-600">or hum it live</span>
                    <div className="flex-1 h-px bg-gray-800" />
                  </div>
                  <AudioRecorder accentColor="#fbbf24" maxSeconds={60}
                    onComplete={(d) => { setMelodyDataUrl(d); setMelodyFile(null); setError(null) }} />
                </div>
              )}
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wider text-gray-400 mb-1 block font-semibold">
                {melodyDataUrl ? 'Lyrics' : 'Text to speak'}
              </label>
              <Input.TextArea value={prompt} onChange={e => setPrompt(e.target.value)}
                autoSize={{ minRows: 3, maxRows: 10 }}
                placeholder={melodyDataUrl ? 'Lyrics, line by line.' : 'The text to speak in the cloned voice.'}
                maxLength={2000} showCount />
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wider text-gray-400 mb-1 block font-semibold">Language</label>
              <Select className="w-full" value={language} onChange={setLanguage}
                showSearch allowClear
                placeholder="Search language…"
                filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                options={XTTS_LANGUAGES} />
            </div>
          </section>
        )}

        {/* Output */}
        <section className="luxe-card p-4 mb-6">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Output</p>
          {outputUrl ? (
            tab === 'face-swap' ? (
              <>
                <img src={outputUrl} alt="swapped" className="w-full max-h-[60vh] object-contain rounded-lg" />
                <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[10px] text-gray-500 font-mono">{job.jobId}</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Hand the swapped image to /ai-video — pre-fills
                        imageUrl AND auto-picks the 5090 'optimized'
                        provider since that's the lane with image-to-video
                        + decent face identity. AIVideo's existing mount
                        effect already reads ?provider= and flips the
                        selector for us, so the user lands ready-to-render. */}
                    <button
                      onClick={() => navigate(`/ai-video?image=${encodeURIComponent(outputUrl)}&fromDeepfake=1&provider=optimized`)}
                      className="text-xs font-semibold px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-500/12 text-amber-300 hover:bg-amber-500/20 inline-flex items-center gap-1.5">
                      <VideoCameraOutlined /> Send to Video Studio
                    </button>
                    <a href={outputUrl} download
                      className="flex items-center gap-1 text-xs px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40">
                      <DownloadOutlined /> Download
                    </a>
                  </div>
                </div>
              </>
            ) : (
              <>
                <audio src={outputUrl} controls className="w-full" />
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[10px] text-gray-500 font-mono">{job.jobId}</span>
                  <a href={outputUrl} download
                    className="flex items-center gap-1 text-xs px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40">
                    <DownloadOutlined /> Download
                  </a>
                </div>
                {/* Comparison card — before/after stats + inline waveforms */}
                <VoiceCloneAnalysis
                  analysis={job?.analysis}
                  referenceUrl={job?.sourceUrl}
                  outputUrl={outputUrl}
                />
              </>
            )
          ) : working ? (
            <div className="py-6 flex flex-col items-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-rose-500/30 border-t-rose-400 animate-spin" />
              <p className="text-rose-300 text-sm font-semibold">
                {status === 'processing' ? 'Working on the 5090…' : 'Queued'}
              </p>
              {job?.jobId && (
                <div className="w-full">
                  <JobLogsAgentPlan lane="deepfake" jobId={job.jobId}
                    status={status} progressMessage={job?.progressMessage} error={job?.error} />
                </div>
              )}
            </div>
          ) : error ? (
            <Alert
              type="error"
              showIcon
              message="Deepfake failed"
              description={error}
              action={
                <button onClick={generate}
                  className="text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 inline-flex items-center gap-1">
                  <ReloadOutlined /> Retry
                </button>
              }
            />
          ) : (
            <p className="text-xs text-gray-600 text-center py-8">Output will appear here</p>
          )}
        </section>

        <div className="flex justify-end">
          <button onClick={generate} disabled={working}
            className={`tap-44 luxe-btn luxe-btn-primary min-h-[48px] ${working ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <ThunderboltOutlined />
            {working ? 'Working…' : tab === 'face-swap' ? 'Swap faces' : 'Generate voice'}
          </button>
        </div>

        {/* Library — past deepfakes (Vault-gated, persisted in deepfake_jobs). */}
        <DeepfakeLibrary
          items={library}
          filter={libraryFilter} setFilter={setLibraryFilter}
        />
      </div>
    </section>
  )
}

// ─── Library panel ─────────────────────────────────────────────
function DeepfakeLibrary({ items, filter, setFilter }) {
  const fmtDate = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return `${d.toLocaleDateString()} · ${d.toTimeString().slice(0, 5)}`
  }
  return (
    <section className="mt-10">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <h2 className="text-lg font-bold text-white">
          Your private library
        </h2>
        <div className="flex items-center gap-1.5">
          {[
            { id: 'all',        label: 'All', icon: null },
            { id: 'face-swap',  label: 'Face', icon: <SmileOutlined /> },
            { id: 'voice-any',  label: 'Voice', icon: <AudioOutlined /> },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-colors inline-flex items-center gap-1 ${
                filter === f.id
                  ? 'border-rose-400/60 bg-rose-500/10 text-rose-300'
                  : 'border-gray-800 bg-gray-900/40 text-gray-400 hover:text-gray-200'
              }`}>
              {f.icon}{f.label}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-gray-500 text-center py-8 border border-dashed border-gray-800 rounded-lg">
          Nothing yet — your generated deepfakes will land here.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map(item => (
            <div key={item.jobId}
              className="rounded-lg border border-gray-800 bg-gray-900/40 overflow-hidden hover:border-rose-500/40 transition-colors">
              {item.kind === 'face-swap' && item.outputUrl ? (
                <img src={item.outputUrl} alt="swap" className="w-full h-44 object-cover" />
              ) : item.kind === 'voice-any' && item.outputUrl ? (
                <div className="p-3 bg-rose-500/8 h-44 flex flex-col justify-center gap-2">
                  <p className="text-[11px] text-gray-300 line-clamp-3 leading-snug">
                    {item.prompt || '(no text)'}
                  </p>
                  <audio src={item.outputUrl} controls className="w-full" />
                </div>
              ) : (
                <div className="h-44 flex items-center justify-center text-[10px] text-gray-600">
                  {item.status === 'failed' ? 'failed' : item.status}
                </div>
              )}
              <div className="px-3 py-2 flex items-center justify-between gap-2 border-t border-gray-800/60">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-300 inline-flex items-center gap-1.5">
                    {item.kind === 'face-swap' ? <><SmileOutlined /> Face Swap</> : <><AudioOutlined /> Voice Clone</>}
                  </p>
                  <p className="text-[9px] text-gray-500 font-mono">{fmtDate(item.createdAt)}</p>
                </div>
                {item.outputUrl && (
                  <a href={item.outputUrl} download target="_blank" rel="noopener noreferrer"
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40 inline-flex items-center gap-1">
                    <DownloadOutlined />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function UploadCard({ label, accent, dataUrl, file, onUpload, onClear, onCapture, hint }) {
  const accentMap = {
    fuchsia: { border: 'border-cyan-500/40', icon: 'text-cyan-400', btn: 'border-cyan-500/40 hover:border-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300', hex: '#22d3ee' },
    amber:   { border: 'border-amber-500/40',   icon: 'text-amber-400',   btn: 'border-amber-500/40 hover:border-amber-400 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300', hex: '#fbbf24' },
  }
  const a = accentMap[accent] || accentMap.fuchsia
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wider text-gray-400 mb-1 block font-semibold">
        {label}
      </label>
      {dataUrl ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3 space-y-2">
          <img src={dataUrl} alt={label} className="w-full max-h-64 object-contain rounded-lg" />
          <div className="flex items-center justify-between gap-2 text-[10px] text-gray-500 font-mono">
            <span className="truncate">{file?.name || 'image'}</span>
            <button onClick={onClear}
              className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg border ${a.btn}`}>
              <SyncOutlined className="text-[9px]" /> Replace
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Upload.Dragger multiple={false} showUploadList={false}
            accept="image/*"
            beforeUpload={onUpload}
            style={{ background: 'transparent', borderColor: '#374151', padding: '32px 0' }}>
            <UploadOutlined className={`text-3xl ${a.icon} mb-2`} />
            <p className="text-sm text-gray-300">Drop an image</p>
            <p className="text-[10px] text-gray-500 mt-1">{hint}</p>
          </Upload.Dragger>
          {/* Camera-capture alternative — same input pattern the Image Enhancer
              uses. Lets the user snap a face from their webcam instead of
              digging for a file. */}
          {onCapture && (
            <>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-gray-800" />
                <span className="text-[10px] uppercase tracking-wider text-gray-600">or snap</span>
                <div className="flex-1 h-px bg-gray-800" />
              </div>
              <CameraCapture accentColor={a.hex} onSnap={onCapture} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function Deepfake() {
  return (
    <VaultGate label="Deepfake Studio">
      <DeepfakeInner />
    </VaultGate>
  )
}
