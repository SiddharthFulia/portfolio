import { useState, useEffect, useRef } from 'react'
import { Upload, Input, Select, message as antMessage } from 'antd'
import { UploadOutlined, SoundOutlined, ThunderboltOutlined, ReloadOutlined, DownloadOutlined } from '@ant-design/icons'
import { submitLipsync, getLipsyncStatus, fileToDataUrl } from '../api/ai'

const MODELS = [
  { value: 'latentsync', label: 'LatentSync 1.5', blurb: 'Best quality. Open ByteDance model. ~60s for a 10s clip.' },
  { value: 'musetalk',   label: 'MuseTalk (coming soon)', blurb: 'Faster but lower quality. Wire pending.', disabled: true },
  { value: 'liveportrait', label: 'LivePortrait (coming soon)', blurb: 'Face-puppeteering from a driver video.', disabled: true },
]

export default function LipSync() {
  const [audioFile, setAudioFile] = useState(null)
  const [audioDataUrl, setAudioDataUrl] = useState('')
  const [portraitFile, setPortraitFile] = useState(null)
  const [portraitDataUrl, setPortraitDataUrl] = useState('')
  const [model, setModel] = useState('latentsync')
  const [working, setWorking] = useState(false)
  const [job, setJob] = useState(null)
  const [error, setError] = useState(null)
  const pollTimer = useRef(null)

  useEffect(() => { document.title = 'Lip Sync Studio · Sid' }, [])
  useEffect(() => () => { if (pollTimer.current) clearInterval(pollTimer.current) }, [])

  const handleAudio = async (f) => {
    try { const d = await fileToDataUrl(f); setAudioFile(f); setAudioDataUrl(d); setError(null) }
    catch { antMessage.error('Could not read audio') }
    return false
  }
  const handlePortrait = async (f) => {
    try { const d = await fileToDataUrl(f); setPortraitFile(f); setPortraitDataUrl(d); setError(null) }
    catch { antMessage.error('Could not read image') }
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

  const reset = () => {
    setAudioFile(null); setAudioDataUrl('')
    setPortraitFile(null); setPortraitDataUrl('')
    setJob(null); setError(null); setWorking(false)
    if (pollTimer.current) clearInterval(pollTimer.current)
  }

  return (
    <div className="min-h-screen bg-black text-gray-100 pt-20 pb-16 px-3 sm:px-6">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <SoundOutlined className="text-emerald-400 text-xl" />
            <h1 className="text-2xl sm:text-4xl font-bold bg-gradient-to-r from-emerald-300 via-cyan-400 to-fuchsia-300 bg-clip-text text-transparent">
              Lip Sync Studio
            </h1>
          </div>
          <p className="text-sm text-gray-400 max-w-2xl">
            Drop an audio clip + a portrait. Get a talking-head video where the
            mouth tracks the audio perfectly. Runs LatentSync on the 5090 — no
            cloud, no watermark.
          </p>
        </header>

        <section className="grid sm:grid-cols-2 gap-4 mb-6">
          {/* Source audio */}
          <div className="rounded-2xl border-2 border-dashed border-gray-800 hover:border-emerald-500/40 transition-colors p-4 bg-gray-900/40">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Source audio</p>
            {audioDataUrl ? (
              <div className="space-y-2">
                <audio controls src={audioDataUrl} className="w-full" />
                <p className="text-[10px] text-gray-600 font-mono truncate">{audioFile?.name}</p>
                <button onClick={() => { setAudioFile(null); setAudioDataUrl('') }}
                  className="text-[10px] text-rose-400 hover:text-rose-300">✕ Replace</button>
              </div>
            ) : (
              <Upload.Dragger multiple={false} showUploadList={false}
                accept="audio/*,video/*" beforeUpload={handleAudio}
                style={{ background: 'transparent', borderColor: 'transparent', padding: '20px 0' }}>
                <UploadOutlined className="text-3xl text-emerald-400 mb-2" />
                <p className="text-sm text-gray-300">Drop audio or click to upload</p>
                <p className="text-[10px] text-gray-500 mt-1">mp3 / wav / m4a · max 60s</p>
              </Upload.Dragger>
            )}
          </div>

          {/* Source portrait */}
          <div className="rounded-2xl border-2 border-dashed border-gray-800 hover:border-cyan-500/40 transition-colors p-4 bg-gray-900/40">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Portrait image</p>
            {portraitDataUrl ? (
              <div className="relative">
                <img src={portraitDataUrl} alt="portrait" className="w-full max-h-72 object-contain rounded-lg" />
                <button onClick={() => { setPortraitFile(null); setPortraitDataUrl('') }}
                  className="absolute top-2 right-2 px-2 py-1 text-[10px] rounded-full bg-black/70 hover:bg-rose-600 text-white">
                  ✕ Replace
                </button>
              </div>
            ) : (
              <Upload.Dragger multiple={false} showUploadList={false}
                accept="image/*" beforeUpload={handlePortrait}
                style={{ background: 'transparent', borderColor: 'transparent', padding: '20px 0' }}>
                <UploadOutlined className="text-3xl text-cyan-400 mb-2" />
                <p className="text-sm text-gray-300">Drop portrait or click to upload</p>
                <p className="text-[10px] text-gray-500 mt-1">Single face, front-facing works best</p>
              </Upload.Dragger>
            )}
          </div>
        </section>

        <section className="mb-6 space-y-3">
          <label className="text-[10px] uppercase tracking-wider text-gray-500">Lip-sync model</label>
          <Select className="w-full" size="middle" value={model} onChange={setModel}
            options={MODELS} optionLabelProp="label"
            optionRender={(o) => (
              <div className={`py-0.5 ${o.data.disabled ? 'opacity-50' : ''}`}>
                <div className="text-[12px] font-semibold text-gray-100">{o.data.label}</div>
                <div className="text-[10px] text-gray-500">{o.data.blurb}</div>
              </div>
            )}
          />
        </section>

        {/* Result */}
        <section className="rounded-2xl border border-gray-800 p-4 bg-gray-900/40 mb-6">
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
            <div className="py-6 text-center">
              <p className="text-rose-400 text-sm font-mono mb-2">✗ {error}</p>
              <button onClick={generate}
                className="text-xs px-3 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300">
                <ReloadOutlined /> Retry
              </button>
            </div>
          ) : (
            <p className="text-xs text-gray-600 text-center py-8">Result will appear here</p>
          )}
        </section>

        <div className="flex items-center justify-end gap-2">
          {(audioDataUrl || portraitDataUrl) && (
            <button onClick={reset} className="text-xs text-gray-500 hover:text-gray-300 px-3 py-2">Clear</button>
          )}
          <button onClick={generate}
            disabled={working || !audioDataUrl || !portraitDataUrl}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
              working || !audioDataUrl || !portraitDataUrl
                ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                : 'bg-gradient-to-r from-emerald-400 to-cyan-400 text-black hover:scale-[1.02]'
            }`}>
            <ThunderboltOutlined />
            {working ? 'Working…' : 'Generate lip-sync'}
          </button>
        </div>
      </div>
    </div>
  )
}
