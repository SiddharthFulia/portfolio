import { useState, useEffect, useRef } from 'react'
import { Upload, Input, Select, message as antMessage } from 'antd'
import { UploadOutlined, ThunderboltOutlined, DownloadOutlined, SyncOutlined, LockOutlined, ReloadOutlined } from '@ant-design/icons'
import VaultGate from '../components/VaultGate'
import AudioRecorder from '../components/AudioRecorder'
import JobLogsAgentPlan from '../components/JobLogsAgentPlan'
import { submitDeepfakeJob, getDeepfakeStatus, fileToDataUrl } from '../api/ai'

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
  const [tab, setTab] = useState('face-swap')   // 'face-swap' | 'voice-any'
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
  const [language, setLanguage] = useState('en')
  // Shared job state
  const [working, setWorking] = useState(false)
  const [job, setJob] = useState(null)
  const [error, setError] = useState(null)
  const pollRef = useRef(null)

  useEffect(() => { document.title = 'Deepfake · Sid' }, [])
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

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
      }
    }, 1500)
  }

  const handleUpload = (setter) => async (file) => {
    if (!file) return false
    if (file.size > 16 * 1024 * 1024) {
      antMessage.error('File too large (max 16 MB)'); return false
    }
    try {
      const d = await fileToDataUrl(file)
      setter({ file, dataUrl: d })
      setError(null)
    } catch { antMessage.error('Could not read file') }
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
    <div className="min-h-screen bg-black text-gray-100 pt-20 pb-16 px-3 sm:px-6">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <LockOutlined className="text-rose-400 text-xl" />
            <h1 className="text-2xl sm:text-4xl font-bold leading-tight pb-1 bg-gradient-to-r from-rose-300 via-fuchsia-400 to-amber-300 bg-clip-text text-transparent">
              Deepfake Studio
            </h1>
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border border-rose-500/40 bg-rose-500/10 text-rose-300">
              Vault · Private
            </span>
          </div>
          <p className="text-sm text-gray-400 max-w-2xl">
            Personal-use lane. Face swap + unrestricted voice clone. Behind the
            Vault password — not exposed to public visitors.
          </p>
        </header>

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          {[
            { id: 'face-swap', label: '🎭 Face Swap' },
            { id: 'voice-any', label: '🎤 Voice (any)' },
          ].map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setJob(null); setError(null) }}
              className={`luxe-btn text-xs sm:text-sm ${tab === t.id ? 'luxe-btn-primary' : 'luxe-btn-secondary'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'face-swap' ? (
          <section className="grid sm:grid-cols-2 gap-4 mb-6">
            <UploadCard label="Source face"
              accent="fuchsia" dataUrl={srcDataUrl} file={srcFile}
              onUpload={handleSrcUpload}
              onClear={() => { setSrcFile(null); setSrcDataUrl('') }}
              hint="Clean front-facing portrait works best" />
            <UploadCard label="Target image"
              accent="amber" dataUrl={tgtDataUrl} file={tgtFile}
              onUpload={handleTgtUpload}
              onClear={() => { setTgtFile(null); setTgtDataUrl('') }}
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
                      className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full border border-rose-500/40 hover:border-rose-400 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300">
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
                      className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full border border-rose-500/40 hover:border-rose-400 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300">
                      <SyncOutlined className="text-[9px]" /> Replace
                    </button>
                  </div>
                </div>
              ) : (
                <Upload.Dragger multiple={false} showUploadList={false}
                  accept="audio/*"
                  beforeUpload={handleMelodyUpload}
                  style={{ background: 'transparent', borderColor: '#374151', padding: '16px 0' }}>
                  <UploadOutlined className="text-2xl text-amber-400 mb-1" />
                  <p className="text-xs text-gray-300">Upload a hummed / sung melody</p>
                </Upload.Dragger>
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
              <Select className="w-full" value={language} onChange={setLanguage} options={XTTS_LANGUAGES} />
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
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[10px] text-gray-500 font-mono">{job.jobId}</span>
                  <a href={outputUrl} download
                    className="flex items-center gap-1 text-xs px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40">
                    <DownloadOutlined /> Download
                  </a>
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
            <div className="py-6 text-center">
              <p className="text-rose-400 text-sm font-mono mb-2">✗ {error}</p>
              <button onClick={generate} className="text-xs px-3 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300">
                <ReloadOutlined /> Retry
              </button>
            </div>
          ) : (
            <p className="text-xs text-gray-600 text-center py-8">Output will appear here</p>
          )}
        </section>

        <div className="flex justify-end">
          <button onClick={generate} disabled={working}
            className={`luxe-btn luxe-btn-primary ${working ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <ThunderboltOutlined />
            {working ? 'Working…' : tab === 'face-swap' ? 'Swap faces' : 'Generate voice'}
          </button>
        </div>
      </div>
    </div>
  )
}

function UploadCard({ label, accent, dataUrl, file, onUpload, onClear, hint }) {
  const accentMap = {
    fuchsia: { border: 'border-fuchsia-500/40', icon: 'text-fuchsia-400', btn: 'border-fuchsia-500/40 hover:border-fuchsia-400 bg-fuchsia-500/10 hover:bg-fuchsia-500/20 text-fuchsia-300' },
    amber:   { border: 'border-amber-500/40',   icon: 'text-amber-400',   btn: 'border-amber-500/40 hover:border-amber-400 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300' },
  }
  const a = accentMap[accent] || accentMap.fuchsia
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wider text-gray-400 mb-1 block font-semibold">
        {label}
      </label>
      {dataUrl ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-3 space-y-2">
          <img src={dataUrl} alt={label} className="w-full max-h-64 object-contain rounded-lg" />
          <div className="flex items-center justify-between gap-2 text-[10px] text-gray-500 font-mono">
            <span className="truncate">{file?.name || 'image'}</span>
            <button onClick={onClear}
              className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full border ${a.btn}`}>
              <SyncOutlined className="text-[9px]" /> Replace
            </button>
          </div>
        </div>
      ) : (
        <Upload.Dragger multiple={false} showUploadList={false}
          accept="image/*"
          beforeUpload={onUpload}
          style={{ background: 'transparent', borderColor: '#374151', padding: '32px 0' }}>
          <UploadOutlined className={`text-3xl ${a.icon} mb-2`} />
          <p className="text-sm text-gray-300">Drop an image</p>
          <p className="text-[10px] text-gray-500 mt-1">{hint}</p>
        </Upload.Dragger>
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
