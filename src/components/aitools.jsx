// Shared AI tool components — extracted from the old standalone AIStudio
// page so Image Studio and Audio Studio can embed them as tabs without
// duplicating code. Each export is the same component AIStudio used.

import { useState, useRef, useEffect } from 'react'
import { Input, Button, Select } from 'antd'
import {
  PictureOutlined, SoundOutlined, FileTextOutlined, EyeOutlined,
  DownloadOutlined, CopyOutlined, CheckOutlined,
} from '@ant-design/icons'
import { generateImage, geminiVision, summarizeText, textToSpeech } from '../api/ai'
import ReactMarkdown from 'react-markdown'
import CameraCapture from './CameraCapture'

const P = 'animate-pulse bg-gray-800 rounded-xl'

// ─── Fast Image Gen ───
// Two routing tiers — neutral labels keep the user from caring about
// which third-party host runs it. Internally still routed to Cloudflare
// and HuggingFace respectively (`id` stays the same), only the label
// the user sees changes.
const PROVIDERS = [
  { id: 'cloudflare',  label: '⚡ Instant',  desc: 'Sub-second · best for quick iterations' },
  { id: 'huggingface', label: '🎨 Quality',  desc: 'Slightly slower · richer detail' },
]

export function FastImageGen() {
  const [prompt, setPrompt] = useState('')
  const [image, setImage] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [provider, setProvider] = useState('cloudflare')

  const generate = async () => {
    if (!prompt.trim()) return
    setLoading(true); setError(null); setImage(null)
    const { data, error: err } = await generateImage(prompt.trim(), { provider })
    if (err) setError(err)
    else if (data?.image) setImage(data.image)
    setLoading(false)
  }

  const download = () => {
    if (!image) return
    const a = document.createElement('a')
    a.href = image; a.download = `ai-${Date.now()}.png`; a.click()
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-2">Provider</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {PROVIDERS.map(p => (
            <button key={p.id} onClick={() => setProvider(p.id)}
              className={`p-3 rounded-lg border text-left transition-colors ${
                provider === p.id
                  ? 'border-fuchsia-500 bg-fuchsia-500/10'
                  : 'border-gray-700 bg-gray-800/40 hover:bg-gray-800'
              }`}>
              <div className={`text-sm font-semibold ${provider === p.id ? 'text-fuchsia-300' : 'text-gray-300'}`}>{p.label}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">{p.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Input.TextArea value={prompt} onChange={e => setPrompt(e.target.value)}
          placeholder="A futuristic city at sunset, cyberpunk style, neon lights..."
          autoSize={{ minRows: 2, maxRows: 4 }} className="flex-1" />
        <Button type="primary" onClick={generate} loading={loading} disabled={!prompt.trim()}
          icon={<PictureOutlined />} style={{ height: 'auto', minHeight: 60 }}>
          {loading ? 'Generating…' : 'Generate'}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {['A majestic dragon in space', 'Cute robot reading a book', 'Abstract colorful fluid art', 'Cyberpunk Tokyo street', 'Watercolor mountain landscape'].map(s => (
          <button key={s} onClick={() => setPrompt(s)}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs rounded-lg transition-colors">{s}</button>
        ))}
      </div>

      {error && (
        <div className="p-4 bg-gray-800/60 border border-gray-700 rounded-xl">
          <p className="text-yellow-400 text-sm font-medium">
            {error.includes('429') || error.includes('rate') || error.includes('limit') || error.includes('quota') ? 'High demand right now' : 'Generation failed'}
          </p>
          <p className="text-gray-500 text-xs mt-0.5">
            {error.includes('loading') ? 'The AI model is warming up. Please try again in 30 seconds.' :
             error.includes('429') || error.includes('rate') || error.includes('quota') ? 'Too many requests. Please wait a moment and try again.' : error}
          </p>
        </div>
      )}

      {loading && <div className={`${P} h-80 w-full flex items-center justify-center`}><span className="text-gray-600 text-sm">Generating image…</span></div>}

      {image && (
        <div className="rounded-2xl overflow-hidden border border-gray-700">
          <img src={image} alt={prompt} className="w-full max-h-[500px] object-contain bg-black" />
          <div className="flex items-center justify-between p-3 bg-gray-800/60">
            <span className="text-gray-400 text-xs truncate max-w-[70%]">{prompt}</span>
            <Button icon={<DownloadOutlined />} onClick={download} size="small">Download</Button>
          </div>
        </div>
      )}

      {!image && !loading && !error && (
        <div className="h-64 rounded-2xl border border-gray-800 bg-gray-900/50 flex items-center justify-center">
          <div className="text-center text-gray-600"><PictureOutlined style={{ fontSize: 40 }} /><p className="text-sm mt-2">Type a prompt and click Generate</p></div>
        </div>
      )}
    </div>
  )
}

// ─── Vision AI (Gemini Vision) ───
export function VisionAI() {
  const [image, setImage] = useState(null)
  const [prompt, setPrompt] = useState('Describe this image in detail.')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const fileRef = useRef(null)

  const handleUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setImage(reader.result)
    reader.readAsDataURL(file)
  }

  const analyze = async () => {
    if (!image) return
    setLoading(true); setError(null); setResult(null)
    const { data, error: err } = await geminiVision(image, prompt)
    if (err) setError(err)
    else if (data?.reply) setResult(data.reply)
    setLoading(false)
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <Input value={prompt} onChange={e => setPrompt(e.target.value)}
          placeholder="What do you want to know about this image?"
          className="flex-1" size="large" />
        <Button type="primary" onClick={analyze} loading={loading} disabled={!image}
          icon={<EyeOutlined />} size="large">Analyze</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          {image ? (
            <div className="rounded-xl overflow-hidden border border-gray-700">
              <img src={image} alt="Upload" className="w-full max-h-80 object-contain bg-black" />
              <div className="p-2 flex justify-between">
                <Button size="small" onClick={() => fileRef.current?.click()}>Change</Button>
                <Button size="small" onClick={() => { setImage(null); setResult(null) }}>Clear</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="h-48 rounded-xl border-2 border-dashed border-gray-700 flex items-center justify-center cursor-pointer hover:border-gray-500 transition-colors"
                onClick={() => fileRef.current?.click()}>
                <div className="text-center text-gray-500"><PictureOutlined style={{ fontSize: 40 }} /><p className="text-sm mt-2">Click to upload image</p></div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-gray-800" />
                <span className="text-[10px] uppercase tracking-wider text-gray-600">or snap</span>
                <div className="flex-1 h-px bg-gray-800" />
              </div>
              <CameraCapture accentColor="#22d3ee" onSnap={(dataUrl) => setImage(dataUrl)} />
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
        </div>

        <div>
          {loading && <div className={`${P} h-64`} />}
          {error && <div className="p-4 bg-red-900/20 border border-red-800/40 rounded-xl text-red-400 text-sm">{error}</div>}
          {result && (
            <div className="p-4 bg-gray-900 border border-gray-700 rounded-xl max-h-80 overflow-y-auto">
              <div className="text-sm text-gray-200 leading-relaxed prose-invert">
                <ReactMarkdown>{result}</ReactMarkdown>
              </div>
            </div>
          )}
          {!result && !loading && !error && (
            <div className="h-64 rounded-xl border border-gray-800 bg-gray-900/50 flex items-center justify-center text-gray-600 text-sm">
              Upload an image and click Analyze
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Fast TTS (Browser + Cloud) ───
const CLOUD_VOICES = [
  { value: 'en-US-Standard-A', label: 'US Female A' },
  { value: 'en-US-Standard-B', label: 'US Male B' },
  { value: 'en-US-Standard-C', label: 'US Female C' },
  { value: 'en-US-Standard-D', label: 'US Male D' },
  { value: 'en-GB-Standard-A', label: 'UK Female A' },
  { value: 'en-GB-Standard-B', label: 'UK Male B' },
  { value: 'en-IN-Standard-A', label: 'India Female A' },
  { value: 'en-IN-Standard-B', label: 'India Male B' },
  { value: 'hi-IN-Standard-A', label: 'Hindi Female' },
  { value: 'hi-IN-Standard-B', label: 'Hindi Male' },
]

export function FastTTS() {
  const [text, setText] = useState('')
  const [mode, setMode] = useState('browser')
  const [speaking, setSpeaking] = useState(false)
  const [voices, setVoices] = useState([])
  const [selectedVoice, setSelectedVoice] = useState('')
  const [rate, setRate] = useState(1)
  const [pitch, setPitch] = useState(1)
  const [cloudVoice, setCloudVoice] = useState('en-US-Standard-D')
  const [audio, setAudio] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const loadVoices = () => {
      const v = window.speechSynthesis?.getVoices() || []
      setVoices(v)
      if (v.length && !selectedVoice) setSelectedVoice(v[0].name)
    }
    loadVoices()
    window.speechSynthesis?.addEventListener('voiceschanged', loadVoices)
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', loadVoices)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const speakBrowser = () => {
    if (!text.trim() || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text.trim())
    const voice = voices.find(v => v.name === selectedVoice)
    if (voice) u.voice = voice
    u.rate = rate; u.pitch = pitch
    u.onstart = () => setSpeaking(true)
    u.onend = () => setSpeaking(false)
    u.onerror = () => setSpeaking(false)
    window.speechSynthesis.speak(u)
  }

  const speakCloud = async () => {
    if (!text.trim()) return
    setLoading(true); setError(null); setAudio(null)
    const { data, error: err } = await textToSpeech(text.trim(), { voice: cloudVoice })
    if (err) setError(err)
    else if (data?.audio) setAudio(data.audio)
    setLoading(false)
  }

  const stop = () => { window.speechSynthesis?.cancel(); setSpeaking(false) }

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <Button size="small" type={mode === 'browser' ? 'primary' : 'default'}
          onClick={() => setMode('browser')}>🌐 Browser Voice</Button>
        <Button size="small" type={mode === 'cloud' ? 'primary' : 'default'}
          onClick={() => setMode('cloud')}>☁ Cloud Voice</Button>
      </div>

      <Input.TextArea value={text} onChange={e => setText(e.target.value)}
        placeholder="Type text to hear it spoken…"
        autoSize={{ minRows: 3, maxRows: 6 }}
        maxLength={mode === 'cloud' ? 200 : undefined}
        showCount={mode === 'cloud'} />

      {mode === 'browser' ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Voice</label>
              <Select value={selectedVoice} onChange={setSelectedVoice} size="small" style={{ width: '100%' }}
                showSearch filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                options={voices.map(v => ({ value: v.name, label: `${v.name} (${v.lang})` }))} />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Speed: {rate}×</label>
              <input type="range" min="0.5" max="2" step="0.1" value={rate} onChange={e => setRate(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-fuchsia-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Pitch: {pitch}</label>
              <input type="range" min="0.5" max="2" step="0.1" value={pitch} onChange={e => setPitch(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-fuchsia-500" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="primary" onClick={speakBrowser} disabled={!text.trim() || speaking}
              icon={<SoundOutlined />}>{speaking ? 'Speaking…' : 'Speak'}</Button>
            {speaking && <Button onClick={stop} danger>Stop</Button>}
          </div>
        </>
      ) : (
        <>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Voice</label>
            <Select value={cloudVoice} onChange={setCloudVoice} size="small" style={{ width: 220 }} options={CLOUD_VOICES} />
          </div>
          <Button type="primary" onClick={speakCloud} loading={loading} disabled={!text.trim()}
            icon={<SoundOutlined />}>{loading ? 'Generating…' : 'Generate Audio'}</Button>
          {error && (
            <div className="p-4 bg-gray-800/60 border border-gray-700 rounded-xl">
              <p className="text-yellow-400 text-sm font-medium">Cloud TTS unavailable</p>
              <p className="text-gray-500 text-xs mt-1">Google Cloud TTS needs billing. Use Browser Voice instead — instant, no setup.</p>
              <Button size="small" className="mt-2" onClick={() => setMode('browser')}>Switch to Browser Voice</Button>
            </div>
          )}
          {audio && (
            <div className="p-4 bg-gray-900 border border-gray-700 rounded-xl">
              <audio controls src={audio} className="w-full" />
              <Button size="small" className="mt-2" icon={<DownloadOutlined />}
                onClick={() => { const a = document.createElement('a'); a.href = audio; a.download = 'speech.mp3'; a.click() }}>
                Download MP3
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Summarizer ───
export function Summarizer() {
  const [text, setText] = useState('')
  const [summary, setSummary] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  const summarize = async () => {
    if (!text.trim()) return
    setLoading(true); setError(null); setSummary('')
    const { data, error: err } = await summarizeText(text.trim())
    if (err) setError(err)
    else if (data?.summary) setSummary(data.summary)
    setLoading(false)
  }

  const copy = () => { navigator.clipboard.writeText(summary); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  return (
    <div className="space-y-5">
      <Input.TextArea value={text} onChange={e => setText(e.target.value)}
        placeholder="Paste a long article or text to summarize…"
        autoSize={{ minRows: 5, maxRows: 10 }} />
      <Button type="primary" onClick={summarize} loading={loading} disabled={!text.trim()}
        icon={<FileTextOutlined />}>
        {loading ? 'Summarizing…' : 'Summarize'}
      </Button>
      {error && <div className="p-4 bg-red-900/20 border border-red-800/40 rounded-xl text-red-400 text-sm">{error}</div>}
      {summary && (
        <div className="p-4 bg-gray-900 border border-gray-700 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 font-semibold uppercase">Summary</span>
            <Button size="small" icon={copied ? <CheckOutlined /> : <CopyOutlined />} onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <p className="text-gray-200 text-sm leading-relaxed">{summary}</p>
        </div>
      )}
    </div>
  )
}
