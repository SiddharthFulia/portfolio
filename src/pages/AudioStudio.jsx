import { useState, useEffect, useRef } from 'react'
import { Input, Select, Slider, message as antMessage } from 'antd'
import { CustomerServiceOutlined, ThunderboltOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons'
import { submitAudio, getAudioStatus } from '../api/ai'

const KINDS = [
  { value: 'music', label: '🎵 Music', blurb: 'Background tracks, soundtracks, loops. Best for video soundtracks.', defaultModel: 'musicgen' },
  { value: 'sfx',   label: '🔊 SFX / Ambience', blurb: 'One-shot effects, foley, drones, ambient textures.', defaultModel: 'stable-audio' },
  { value: 'tts',   label: '🗣 Text → Speech', blurb: 'Voice cloning + multilingual TTS (Bark).', defaultModel: 'bark' },
]

const MODELS = {
  music: [{ value: 'musicgen', label: 'MusicGen Small', blurb: 'Meta MusicGen — fast, music-tuned. Up to 30s.' }],
  sfx:   [{ value: 'stable-audio', label: 'Stable Audio Open 1.0', blurb: 'Stability AI — best for non-music SFX up to 47s.' }],
  tts:   [{ value: 'bark', label: 'Bark', blurb: 'Multilingual TTS with voice presets. Suno research.' }],
}

const BARK_VOICES = [
  { value: 'v2/en_speaker_6', label: '🇬🇧 en_speaker_6 (male, clear)' },
  { value: 'v2/en_speaker_9', label: '🇬🇧 en_speaker_9 (female, warm)' },
  { value: 'v2/en_speaker_1', label: '🇺🇸 en_speaker_1 (US, narration)' },
  { value: 'v2/en_speaker_3', label: '🇺🇸 en_speaker_3 (US, casual)' },
]

export default function AudioStudio() {
  const [kind, setKind] = useState('music')
  const [model, setModel] = useState('musicgen')
  const [prompt, setPrompt] = useState('')
  const [duration, setDuration] = useState(10)
  const [voice, setVoice] = useState(BARK_VOICES[0].value)
  const [working, setWorking] = useState(false)
  const [job, setJob] = useState(null)
  const [error, setError] = useState(null)
  const pollTimer = useRef(null)

  useEffect(() => { document.title = 'Audio Studio · Sid' }, [])
  useEffect(() => () => { if (pollTimer.current) clearInterval(pollTimer.current) }, [])
  useEffect(() => {
    const k = KINDS.find(k => k.value === kind)
    if (k) setModel(k.defaultModel)
  }, [kind])

  const startPolling = (jobId) => {
    if (pollTimer.current) clearInterval(pollTimer.current)
    pollTimer.current = setInterval(async () => {
      const { data, error: err } = await getAudioStatus(jobId)
      if (err) return
      if (!data) return
      setJob(data)
      if (data.status === 'completed') {
        clearInterval(pollTimer.current); pollTimer.current = null; setWorking(false)
      } else if (data.status === 'failed') {
        clearInterval(pollTimer.current); pollTimer.current = null; setWorking(false)
        setError(data.error || 'Audio generation failed')
      }
    }, 2000)
  }

  const generate = async () => {
    if (!prompt.trim()) { setError('Add a prompt'); return }
    setError(null); setJob(null); setWorking(true)
    const payload = { kind, model, prompt: prompt.trim(), duration }
    if (kind === 'tts') payload.voice = voice
    const { data, error: err } = await submitAudio(payload)
    if (err) { setWorking(false); setError(err); return }
    setJob(data)
    startPolling(data.jobId)
  }

  const kindObj = KINDS.find(k => k.value === kind)

  return (
    <div className="min-h-screen bg-black text-gray-100 pt-20 pb-16 px-3 sm:px-6">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <CustomerServiceOutlined className="text-fuchsia-400 text-xl" />
            <h1 className="text-2xl sm:text-4xl font-bold bg-gradient-to-r from-fuchsia-300 via-amber-300 to-emerald-300 bg-clip-text text-transparent">
              Audio Studio
            </h1>
          </div>
          <p className="text-sm text-gray-400 max-w-2xl">
            Generate music, sound effects, or voice from text prompts. MusicGen + Stable Audio Open + Bark TTS, all on the 5090.
          </p>
        </header>

        {/* Kind picker */}
        <section className="mb-6">
          <h2 className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Type</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {KINDS.map(k => {
              const active = kind === k.value
              return (
                <button key={k.value} type="button" onClick={() => setKind(k.value)}
                  className={`p-3 rounded-xl text-left border-2 transition-all ${
                    active
                      ? 'border-fuchsia-400/70 bg-fuchsia-500/10 shadow-lg shadow-fuchsia-500/10'
                      : 'border-gray-800 bg-gray-900/40 hover:border-gray-700 hover:bg-gray-900'
                  }`}>
                  <p className={`text-sm font-bold ${active ? 'text-white' : 'text-gray-200'}`}>{k.label}</p>
                  <p className={`text-[10px] mt-0.5 ${active ? 'text-gray-300' : 'text-gray-500'}`}>{k.blurb}</p>
                </button>
              )
            })}
          </div>
        </section>

        <section className="mb-6 space-y-4">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">Model</label>
            <Select className="w-full" value={model} onChange={setModel}
              options={MODELS[kind]} optionLabelProp="label"
              optionRender={(o) => (
                <div className="py-0.5">
                  <div className="text-[12px] font-semibold text-gray-100">{o.data.label}</div>
                  <div className="text-[10px] text-gray-500">{o.data.blurb}</div>
                </div>
              )}
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">Prompt</label>
            <Input.TextArea value={prompt} onChange={e => setPrompt(e.target.value)}
              autoSize={{ minRows: 2, maxRows: 6 }}
              placeholder={
                kind === 'music' ? 'e.g. "upbeat synthwave with driving bass and warm pads"'
                : kind === 'sfx' ? 'e.g. "thunderclap echoing in a cathedral, low rumble fade-out"'
                : 'Hi, this is what I want you to say in this voice.'
              }
              maxLength={2000} showCount
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">
              Duration · <span className="text-fuchsia-300 font-mono">{duration}s</span>
            </label>
            <Slider min={kind === 'tts' ? 1 : 3} max={kind === 'sfx' ? 47 : kind === 'music' ? 30 : 20}
              value={duration} onChange={setDuration} />
          </div>

          {kind === 'tts' && (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">Voice</label>
              <Select className="w-full" value={voice} onChange={setVoice} options={BARK_VOICES} />
            </div>
          )}
        </section>

        {/* Output */}
        <section className="rounded-2xl border border-gray-800 p-4 bg-gray-900/40 mb-6">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Output</p>
          {job?.outputUrl ? (
            <>
              <audio src={job.outputUrl} controls className="w-full" />
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[10px] text-gray-500 font-mono">{job.jobId}</span>
                <a href={job.outputUrl} download
                  className="flex items-center gap-1 text-xs px-3 py-1 rounded-lg bg-fuchsia-500/20 hover:bg-fuchsia-500/30 text-fuchsia-300 border border-fuchsia-500/40">
                  <DownloadOutlined /> Download
                </a>
              </div>
            </>
          ) : working ? (
            <div className="py-6 flex flex-col items-center gap-2">
              <div className="w-8 h-8 rounded-full border-2 border-fuchsia-500/30 border-t-fuchsia-400 animate-spin" />
              <p className="text-fuchsia-300 text-sm font-semibold">{job?.status === 'processing' ? 'Generating audio…' : 'Queued'}</p>
              {Array.isArray(job?.logs) && job.logs.length > 0 && (
                <ul className="mt-3 w-full max-h-40 overflow-y-auto bg-black/40 rounded-lg p-2 space-y-0.5">
                  {job.logs.slice(-10).map((l, i) => (
                    <li key={i} className="text-[10px] font-mono text-fuchsia-200/80 break-all">{l.msg}</li>
                  ))}
                </ul>
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
          <button onClick={generate} disabled={working || !prompt.trim()}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
              working || !prompt.trim()
                ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                : 'bg-gradient-to-r from-fuchsia-400 to-amber-400 text-black hover:scale-[1.02]'
            }`}>
            <ThunderboltOutlined />
            {working ? 'Working…' : `Generate ${kindObj?.label.toLowerCase().replace(/[🎵🔊🗣 ]/g, '').trim() || 'audio'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
