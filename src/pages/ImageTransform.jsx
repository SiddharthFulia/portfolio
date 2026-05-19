import { useEffect, useRef, useState } from 'react'
import { Upload, Slider, Button } from 'antd'
import {
  UploadOutlined, ThunderboltFilled, ReloadOutlined, SwapOutlined,
  PictureOutlined, ArrowRightOutlined,
} from '@ant-design/icons'
import { enhanceImage, getImageStatus, fileToDataUrl } from '../api/ai'
import MessageImage from '../components/MessageImage'
import notify from '../utils/notify'

// Dedicated Image-to-Image page. Focused, opinionated UI for the single
// "give me an image + a prompt → get a transformed image" use case.
// Routes the request through the same /api/image-enhance lane the
// Image Studio uses (workflow = custom-sdxl, family = img2img), but
// hides the technical knobs visitors don't care about.

// Quick-start style presets — each fills the prompt textarea and nudges
// denoise into a sensible range.
const STYLE_PRESETS = [
  { id: 'anime',     emoji: '🎌', label: 'Anime',          prompt: 'anime style, clean linework, vibrant cel-shaded colors, expressive eyes', denoise: 0.65 },
  { id: 'oil',       emoji: '🖼️', label: 'Oil painting',   prompt: 'oil painting, thick brushwork, classical lighting, museum-quality', denoise: 0.55 },
  { id: 'cyber',     emoji: '🌃', label: 'Cyberpunk',      prompt: 'cyberpunk neon city, rain reflections, electric magenta + cyan lighting, futuristic', denoise: 0.70 },
  { id: 'studio',    emoji: '📸', label: 'Studio photo',   prompt: 'professional studio photograph, soft key light, sharp focus, magazine quality', denoise: 0.35 },
  { id: 'pencil',    emoji: '✏️', label: 'Pencil sketch',  prompt: 'detailed pencil sketch, graphite shading, paper texture, fine art drawing', denoise: 0.60 },
  { id: 'pixar',     emoji: '🎬', label: '3D Pixar',       prompt: '3D Pixar-style render, subsurface scattering, warm cinematic lighting, expressive', denoise: 0.70 },
  { id: 'watercolor',emoji: '🎨', label: 'Watercolor',     prompt: 'watercolor painting, soft wet edges, paper bleed, gentle pigment washes', denoise: 0.55 },
  { id: 'restore',   emoji: '✨', label: 'Polish + restore', prompt: 'enhanced detail, fixed lighting, professional color grade, clean and sharp', denoise: 0.20 },
]

// Friendly strength labels keyed off the denoise value.
const strengthLabel = (d) => {
  if (d <= 0.25) return { label: 'Light polish', desc: 'Barely changes — like a quality pass' }
  if (d <= 0.45) return { label: 'Medium edit',  desc: 'Recognizable, but visibly improved' }
  if (d <= 0.70) return { label: 'Strong transform', desc: 'Meaningful new look, same subject' }
  return { label: 'Full reinterpret', desc: 'Completely new image inspired by the original' }
}

export default function ImageTransform() {
  const [sourceFile, setSourceFile] = useState(null)
  const [sourceDataUrl, setSourceDataUrl] = useState('')
  const [prompt, setPrompt] = useState('')
  const [denoise, setDenoise] = useState(0.55)
  const [selectedPreset, setSelectedPreset] = useState(null)
  const [working, setWorking] = useState(false)
  const [job, setJob] = useState(null)
  const [error, setError] = useState(null)
  const pollRef = useRef(null)

  useEffect(() => { document.title = 'Image → Image · Sid' }, [])
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const onUpload = async (file) => {
    if (!file) return false
    if (file.size > 12 * 1024 * 1024) {
      notify.error('Image too large (max 12 MB)')
      return false
    }
    try {
      const dataUrl = await fileToDataUrl(file)
      setSourceFile(file)
      setSourceDataUrl(dataUrl)
      setError(null)
      notify.success(`${file.name} ready · ${(file.size / 1024 / 1024).toFixed(1)} MB`, { title: 'Image loaded' })
    } catch {
      notify.error('Could not read that image')
    }
    return false
  }

  const pickPreset = (p) => {
    setSelectedPreset(p.id)
    setPrompt(p.prompt)
    setDenoise(p.denoise)
  }

  const startPolling = (imageId) => {
    if (pollRef.current) clearInterval(pollRef.current)
    let attempts = 0
    pollRef.current = setInterval(async () => {
      attempts += 1
      const { data, error: err } = await getImageStatus(imageId)
      if (err) {
        if (attempts > 5) {
          clearInterval(pollRef.current); pollRef.current = null
          setWorking(false); setError(err)
        }
        return
      }
      if (!data) return
      if (data.status === 'completed') {
        clearInterval(pollRef.current); pollRef.current = null
        setJob(data); setWorking(false)
        notify.success('Tap to download, open full-size, or copy the URL', { title: 'Transform ready' })
      } else if (data.status === 'failed') {
        clearInterval(pollRef.current); pollRef.current = null
        setWorking(false); setError(data.error || 'Generation failed')
      }
      if (attempts > 240) {  // ~6min @ 1.5s
        clearInterval(pollRef.current); pollRef.current = null
        setWorking(false); setError('Timed out waiting — try again in a moment')
      }
      // Surface the in-flight row so the UI can show the progress bar
      if (data.status === 'queued' || data.status === 'processing') setJob(data)
    }, 1500)
  }

  const generate = async () => {
    if (!sourceDataUrl) { setError('Upload an image first.'); return }
    if (!prompt.trim()) { setError('Add a prompt — say what you want.'); return }
    setError(null); setJob(null); setWorking(true)
    const body = {
      engine: 'atelier',
      workflow: 'custom-sdxl',   // img2img family on the 5090
      type: 'img2img',
      prompt: prompt.trim(),
      dataUrl: sourceDataUrl,
      steps: 30,
      denoise,
      cfg: 6.0,
      width: 1024,
      height: 1024,
    }
    const { data, error: err } = await enhanceImage(body)
    if (err) { setWorking(false); setError(err); return }
    setJob(data)
    startPolling(data.imageId)
  }

  const reset = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    setJob(null); setError(null); setWorking(false)
  }

  const startOver = () => {
    reset()
    setSourceFile(null); setSourceDataUrl(''); setPrompt('')
    setSelectedPreset(null); setDenoise(0.55)
  }

  const strength = strengthLabel(denoise)

  return (
    <div className="min-h-screen bg-black text-gray-100 pt-20 pb-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        {/* Hero */}
        <header className="text-center mb-6 sm:mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full
                          bg-gradient-to-r from-fuchsia-500/20 via-violet-500/20 to-cyan-500/20
                          border border-fuchsia-500/30 text-[10px] uppercase tracking-wider
                          text-fuchsia-200 font-semibold mb-3">
            <ThunderboltFilled /> Image → Image · powered by your 5090
          </div>
          <h1 className="text-3xl sm:text-5xl font-black leading-tight pb-1
                         bg-gradient-to-r from-fuchsia-300 via-violet-300 to-cyan-300
                         bg-clip-text text-transparent">
            Transform any image with a prompt
          </h1>
          <p className="text-gray-400 text-sm sm:text-base mt-2 max-w-2xl mx-auto leading-relaxed">
            Drop a photo, sketch, or screenshot. Tell the model what to change.
            Slide the strength — from gentle polish to a total reinterpretation.
          </p>
        </header>

        {/* Step 1: Upload + result side by side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          {/* INPUT */}
          <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-3 sm:p-4">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2 px-1">
              1 · Source image
            </div>
            {!sourceDataUrl ? (
              <Upload.Dragger
                accept="image/*,.heic,.heif,.webp,.bmp,.avif,.tif,.tiff"
                showUploadList={false}
                multiple={false}
                beforeUpload={onUpload}
                className="!bg-gray-900/40 !border !border-dashed !border-gray-700 hover:!border-fuchsia-400/60 !rounded-xl">
                <div className="py-8 px-2">
                  <PictureOutlined className="text-4xl text-gray-600 mb-3 block" />
                  <p className="text-sm font-bold text-gray-200">Drag your image here</p>
                  <p className="text-xs text-gray-500 mt-1">or click to browse · JPG / PNG / HEIC / WEBP · 12 MB max</p>
                </div>
              </Upload.Dragger>
            ) : (
              <div className="relative">
                <img src={sourceDataUrl} alt="source"
                  className="w-full max-h-[420px] object-contain rounded-xl border border-gray-800 bg-gray-950" />
                <button onClick={startOver}
                  className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1
                             rounded-full bg-gray-950/90 border border-gray-700 hover:border-rose-400
                             text-[10px] text-gray-300 hover:text-rose-200 font-semibold">
                  <ReloadOutlined /> Change
                </button>
                <div className="mt-2 text-[10px] text-gray-500 font-mono truncate">
                  {sourceFile?.name || 'uploaded source'}
                </div>
              </div>
            )}
          </div>

          {/* OUTPUT */}
          <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-3 sm:p-4">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2 px-1 flex items-center justify-between">
              <span>4 · Result</span>
              {job?.status && (
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                  job.status === 'completed' ? 'text-emerald-300 bg-emerald-500/15' :
                  job.status === 'failed'    ? 'text-rose-300    bg-rose-500/15'     :
                                               'text-cyan-300    bg-cyan-500/15'
                }`}>{job.status}</span>
              )}
            </div>
            {!job && !working && (
              <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-center text-gray-600 py-10">
                <ArrowRightOutlined className="text-3xl mb-2 rotate-180" />
                <p className="text-xs">Your transformed image will appear here.</p>
              </div>
            )}
            {working && (
              <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-center py-10">
                <div className="w-12 h-12 rounded-full border-2 border-fuchsia-500/40 border-t-fuchsia-400 animate-spin mb-3" />
                <p className="text-xs text-gray-300 font-semibold">
                  {job?.status === 'processing' ? 'Painting on the 5090…' : 'Queued — worker is picking it up…'}
                </p>
                {job?.progressMessage && (
                  <p className="text-[10px] text-gray-500 mt-1.5 font-mono">{job.progressMessage}</p>
                )}
              </div>
            )}
            {job?.imageUrl && job.status === 'completed' && (
              <MessageImage src={job.imageUrl} messageId={job.imageId} prompt={prompt} />
            )}
            {error && (
              <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 mt-2">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Step 2 — style presets */}
        <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-3 sm:p-4 mb-4">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2 px-1">
            2 · Pick a style (optional) · or write your own prompt below
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1.5 -mx-1 px-1">
            {STYLE_PRESETS.map(p => {
              const active = selectedPreset === p.id
              return (
                <button key={p.id} onClick={() => pickPreset(p)}
                  className={`shrink-0 inline-flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl
                              border-2 transition-all min-w-[88px] ${
                    active
                      ? 'border-fuchsia-400/70 bg-fuchsia-500/15 text-white shadow-md shadow-fuchsia-500/20 scale-[1.03]'
                      : 'border-gray-800 bg-gray-900/40 text-gray-300 hover:border-gray-700 hover:bg-gray-900 hover:-translate-y-0.5'
                  }`}>
                  <span className="text-xl">{p.emoji}</span>
                  <span className="text-[11px] font-bold">{p.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Step 3 — prompt + strength */}
        <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-3 sm:p-4 mb-4">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2 px-1">
            3 · Tell the model what you want
          </div>
          <textarea
            value={prompt}
            onChange={(e) => { setPrompt(e.target.value); setSelectedPreset(null) }}
            placeholder='e.g. "redraw as a 90s anime, glowing eyes, neon Tokyo background"'
            rows={3}
            className="w-full px-3 py-2 rounded-xl bg-gray-900 border border-gray-800
                       focus:border-fuchsia-400 focus:outline-none text-sm text-gray-100
                       placeholder:text-gray-600 resize-y"
          />

          <div className="mt-4 flex items-center justify-between gap-3 px-1">
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-gray-200">
                Strength · <span className="text-fuchsia-300">{strength.label}</span>
              </div>
              <div className="text-[10px] text-gray-500">{strength.desc}</div>
            </div>
            <span className="text-[10px] font-mono text-fuchsia-300 shrink-0">{denoise.toFixed(2)}</span>
          </div>
          <Slider
            min={0.1} max={1.0} step={0.05}
            value={denoise}
            onChange={setDenoise}
            marks={{ 0.15: 'Light', 0.40: 'Medium', 0.65: 'Strong', 0.90: 'Reinterpret' }}
            tooltip={{ formatter: (v) => v?.toFixed(2) }}
          />

          <div className="mt-4 flex items-center justify-end gap-2">
            <Button onClick={startOver} disabled={working} icon={<ReloadOutlined />}>
              Start over
            </Button>
            <Button
              type="primary" size="large"
              onClick={generate} loading={working}
              disabled={!sourceDataUrl || !prompt.trim()}
              icon={<SwapOutlined />}
              style={{ background: 'linear-gradient(135deg, #ec4899, #8b5cf6, #06b6d4)', border: 'none', fontWeight: 700 }}
              className="!h-11 !px-5">
              {working ? 'Transforming…' : 'Transform image'}
            </Button>
          </div>
        </div>

        {/* Tips footer */}
        <div className="rounded-2xl border border-gray-800 bg-gray-950/40 p-3 sm:p-4">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2 px-1">
            Tips
          </div>
          <ul className="text-[11px] text-gray-400 space-y-1 pl-4 list-disc leading-relaxed">
            <li><span className="text-gray-200 font-semibold">Light polish (0.10–0.25):</span> sharpen, denoise, fix colors — keeps the photo almost identical.</li>
            <li><span className="text-gray-200 font-semibold">Medium (0.30–0.45):</span> change clothing, lighting, mood — same person, new vibe.</li>
            <li><span className="text-gray-200 font-semibold">Strong (0.50–0.70):</span> swap art style entirely (anime / oil / 3D).</li>
            <li><span className="text-gray-200 font-semibold">Reinterpret (0.75–1.00):</span> only the composition stays — everything else can change.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
