import { useState, useEffect, useRef } from 'react'
import { Input, Button, Select, Switch, Tabs, Modal } from 'antd'
import {
  VideoCameraOutlined, ThunderboltOutlined, CopyOutlined, CheckOutlined,
  DownloadOutlined, ReloadOutlined, LinkOutlined, InfoCircleOutlined, AppstoreOutlined,
  PlayCircleOutlined, LeftOutlined, RightOutlined,
} from '@ant-design/icons'
import {
  generateVideo, getJobStatus, getTodayVideo, getVideoProviders, listVideos, deleteVideo,
} from '../api/ai'
import { DeleteOutlined } from '@ant-design/icons'

const BE_URL = import.meta.env.VITE_BE_URL || 'http://localhost:4001'

const PROVIDERS = [
  {
    id: 'zsky',
    label: 'ZSky AI',
    desc: 'Hosted • free with sign-in • ~60-90s',
    badge: 'Default',
    accent: 'from-sky-500 to-blue-400',
    border: 'border-sky-500/60',
    glow: 'shadow-sky-500/20',
  },
  {
    id: 'worker',
    label: 'My GPU Worker',
    desc: 'ComfyUI on Lightning • text-to-video only • ~3-5min',
    badge: 'Free',
    accent: 'from-emerald-500 to-cyan-400',
    border: 'border-emerald-500/60',
    glow: 'shadow-emerald-500/20',
  },
  {
    id: 'local',
    label: '5090 Beast',
    desc: 'My RTX 5090 • text + image-to-video • ~30-60s',
    badge: 'Luxury',
    accent: 'from-amber-400 via-rose-400 to-fuchsia-500',
    border: 'border-amber-400/60',
    glow: 'shadow-amber-400/30',
    luxe: true,
  },
]

// Model options per provider. Each option gets a 2-line render: name + tagline.
const modelOpt = (value, name, tagline, disabled = false) => ({
  value,
  disabled,
  label: (
    <div className="leading-tight py-0.5">
      <div className="text-sm">{name}</div>
      <div className="text-[10px] text-gray-500">{tagline}</div>
    </div>
  ),
})

// Per-provider capability map — drives which form fields show.
// imageUrl: provider can animate a still photo (image-to-video)
// audio:    provider can attach generated audio
// style:    provider exposes an explicit style preset (drawing/cinematic/etc.)
// caption:  provider can auto-write a Reel caption (uses Groq, available everywhere)
const CAPABILITIES = {
  zsky:   { imageUrl: true,  audio: true,  style: true,  caption: true },
  worker: { imageUrl: false, audio: false, style: false, caption: true },
  local:  { imageUrl: true,  audio: false, style: false, caption: true },
}

// Per-model overrides for the local provider — finer control than the
// provider-level CAPABILITIES because individual models have very different
// requirements (SVD has no prompt, Wan I2V needs an image, etc.).
//   t2v:           supports text-only generation
//   i2v:           supports image conditioning
//   imageRequired: image is mandatory (model is image-only)
//   prompt:        accepts a text prompt at all
const MODEL_CAPS = {
  'ltx-video':   { t2v: true,  i2v: true,  imageRequired: false, prompt: true  },
  'wan-2.1':     { t2v: true,  i2v: false, imageRequired: false, prompt: true  },
  'wan-2.1-i2v': { t2v: false, i2v: true,  imageRequired: true,  prompt: true  },
  'wan-2.2':     { t2v: true,  i2v: true,  imageRequired: false, prompt: true  },
  'svd':         { t2v: false, i2v: true,  imageRequired: true,  prompt: false },
  'hunyuan':     { t2v: true,  i2v: false, imageRequired: false, prompt: true  },
  'mochi':       { t2v: true,  i2v: false, imageRequired: false, prompt: true  },
}

const MODELS_BY_PROVIDER = {
  zsky: [
    modelOpt('cinematic', 'Cinematic', 'film grade, soft motion'),
    modelOpt('realistic', 'Realistic', 'natural lighting, photo-real'),
    modelOpt('anime',     'Anime',     'illustrated, stylized'),
    modelOpt('cartoon',   'Cartoon',   'flat shading, vibrant'),
  ],
  worker: [
    modelOpt('ltx-video', 'LTX-Video 2B', 'balanced quality + speed'),
  ],
  local: [
    modelOpt('ltx-video',   'LTX-Video 2B',     'fast all-rounder • text + image-to-video'),
    modelOpt('wan-2.1',     'Wan 2.1 1.3B',     'cinematic motion, T2V only'),
    modelOpt('wan-2.1-i2v', 'Wan 2.1 I2V 14B',  'top quality I2V • 14B model'),
    modelOpt('hunyuan',     'HunyuanVideo',     'Tencent • highest fidelity T2V'),
    modelOpt('wan-2.2',     'Wan 2.2 5B',       'newest gen TI2V • text + image'),
    modelOpt('mochi',       'Mochi 1',          'Apache-2 license • distinctive style'),
    modelOpt('svd',         'SVD-XT 1.1',       'gated — needs HF login', true),
  ],
}

const PROMPT_PRESETS = [
  'a cat dancing',
  'a panda eating bamboo',
  'ocean waves at sunset',
  'snow falling in a forest',
  'a hot air balloon over mountains',
  'cherry blossoms in the wind',
  'a butterfly landing on a flower',
  'northern lights over a frozen lake',
  'desert dunes at golden hour',
  'a sailboat on calm water',
  'rain falling on a window',
  'autumn leaves swirling in the wind',
]

const STATUS_COPY = {
  zsky_running: { label: 'Generating', hint: 'ZSky is rendering on hosted GPUs. ~60-90s.', tone: 'fuchsia' },
  local_queued: { label: 'Queued',     hint: 'Waiting for the 5090 to wake up and pick up.', tone: 'amber' },
  queued:       { label: 'Queued',     hint: 'Waiting for the GPU worker to pick up.',     tone: 'cyan' },
  processing:   { label: 'Generating', hint: 'On a GPU now.',                              tone: 'fuchsia' },
  completed:    { label: 'Done',       hint: '',                                           tone: 'emerald' },
  failed:       { label: 'Failed',     hint: '',                                           tone: 'rose' },
}

const resolveVideoUrl = (url) => (url?.startsWith('http') ? url : `${BE_URL}${url}`)

// Build a Cloudinary thumbnail (single JPG frame) URL from a stored video URL.
// Works only for Cloudinary-hosted assets; returns null otherwise.
const thumbFromVideo = (videoUrl, opts = {}) => {
  if (!videoUrl || !/cloudinary\.com\/.+\/video\/upload\//.test(videoUrl)) return null
  const w = opts.width || 400
  const so = opts.startOffset != null ? opts.startOffset : 1
  const transform = `so_${so},w_${w},c_fill,q_auto,f_jpg`
  return videoUrl
    .replace('/video/upload/', `/video/upload/${transform}/`)
    .replace(/\.(mp4|webm|mov)$/i, '.jpg')
}

const Tag = ({ children, tone = 'gray' }) => {
  const tones = {
    gray: 'bg-gray-800 text-gray-400 border-gray-700',
    sky: 'bg-sky-900/40 text-sky-300 border-sky-700/60',
    emerald: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/60',
  }
  return (
    <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wider rounded-md border ${tones[tone] || tones.gray}`}>
      {children}
    </span>
  )
}

const VideoCard = ({ video, label = 'Latest', tone = 'cyan', compact = false }) => {
  const tones = {
    cyan: 'from-cyan-400 to-purple-400',
    pink: 'from-pink-400 to-amber-400',
  }
  if (!video?.videoUrl) return null
  return (
    <div className="rounded-2xl overflow-hidden border border-gray-800 bg-gray-900/60 backdrop-blur-sm">
      <div className="relative bg-black">
        <video src={resolveVideoUrl(video.videoUrl)} controls playsInline loop muted={compact}
          className={`w-full ${compact ? 'aspect-[9/16] object-cover' : 'max-h-[70vh] object-contain'}`} />
        <div className={`absolute top-2 left-2 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-gradient-to-r ${tones[tone]} text-black`}>
          {label}
        </div>
      </div>
      <div className="p-3 space-y-2">
        <p className={`text-gray-300 ${compact ? 'text-xs line-clamp-2' : 'text-sm'} leading-relaxed`}>{video.prompt}</p>
        {!compact && video.caption && (
          <p className="text-gray-500 text-xs italic border-l-2 border-gray-700 pl-3 whitespace-pre-line">{video.caption}</p>
        )}
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          <Tag tone={video.provider === 'zsky' ? 'sky' : 'emerald'}>{video.provider}</Tag>
          {video.aspectRatio && <Tag>{video.aspectRatio}</Tag>}
          {video.duration && <Tag>{video.duration}s</Tag>}
        </div>
      </div>
    </div>
  )
}

const Skeleton = ({ jobId, status }) => {
  const copy = STATUS_COPY[status] || STATUS_COPY.queued
  const ringColor = {
    cyan: 'border-cyan-500/40 border-t-cyan-400',
    fuchsia: 'border-fuchsia-500/40 border-t-fuchsia-400',
    amber: 'border-amber-400/40 border-t-amber-300',
  }[copy.tone] || 'border-cyan-500/40 border-t-cyan-400'
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/40 overflow-hidden">
      <div className="aspect-[9/16] sm:aspect-video bg-gray-800/60 animate-pulse flex items-center justify-center">
        <div className="text-center space-y-3 px-6">
          <div className={`w-16 h-16 mx-auto rounded-full border-2 ${ringColor} animate-spin`} />
          <p className="text-gray-200 text-sm font-semibold">{copy.label}…</p>
          <p className="text-gray-500 text-xs">{copy.hint}</p>
          {jobId && <p className="text-gray-700 text-[10px] font-mono break-all">{jobId}</p>}
        </div>
      </div>
    </div>
  )
}

// ─── Generate tab ─────────────────────────────────────────
const GenerateTab = ({ today, setToday, onJobCompleted }) => {
  const [prompt, setPrompt] = useState('')
  const [provider, setProvider] = useState('zsky')
  const [model, setModel] = useState('ltx-video')
  const [duration, setDuration] = useState(5)
  const [resolution, setResolution] = useState('720p')
  const [aspectRatio, setAspectRatio] = useState('9:16')
  const [style, setStyle] = useState('cinematic')
  const [audio, setAudio] = useState(true)
  const [withCaption, setWithCaption] = useState(true)
  const [imageUrl, setImageUrl] = useState('')

  const [loading, setLoading] = useState(false)
  const [job, setJob] = useState(null)
  const [video, setVideo] = useState(null)
  const [error, setError] = useState(null)
  const [workerOnline, setWorkerOnline] = useState(false)
  const [localOnline, setLocalOnline] = useState(false)
  const [copied, setCopied] = useState(false)
  const pollTimer = useRef(null)

  useEffect(() => {
    getVideoProviders().then(({ data }) => {
      if (!data) return
      setWorkerOnline(!!(data.workers?.worker?.online ?? data.workerOnline))
      setLocalOnline(!!data.workers?.local?.online)
    })
    return () => { if (pollTimer.current) clearInterval(pollTimer.current) }
  }, [])

  // Reset model to the first usable option when provider changes
  useEffect(() => {
    const list = MODELS_BY_PROVIDER[provider] || []
    const firstUsable = list.find(m => !m.disabled) || list[0]
    if (firstUsable) setModel(firstUsable.value)
  }, [provider])

  const startPolling = (jobId) => {
    if (pollTimer.current) clearInterval(pollTimer.current)
    let attempts = 0
    pollTimer.current = setInterval(async () => {
      attempts += 1
      const { data, error: err } = await getJobStatus(jobId)
      if (err) {
        if (attempts > 5) { clearInterval(pollTimer.current); pollTimer.current = null; setLoading(false); setError(err) }
        return
      }
      if (!data) return
      setJob(data)
      if (data.status === 'completed') {
        clearInterval(pollTimer.current); pollTimer.current = null
        setVideo(data); setLoading(false)
        if (!today) setToday(data)
        onJobCompleted?.()
      } else if (data.status === 'failed') {
        clearInterval(pollTimer.current); pollTimer.current = null
        setLoading(false); setError(data.error || 'Generation failed')
      }
      if (attempts > 600) {
        clearInterval(pollTimer.current); pollTimer.current = null
        setLoading(false); setError('Timed out waiting for the job')
      }
    }, 3000)
  }

  const generate = async () => {
    if (loading) return
    const caps = CAPABILITIES[provider] || {}
    const mc = provider === 'local' ? MODEL_CAPS[model] : null
    const promptNeeded = !mc || mc.prompt !== false
    const imageNeeded = !!mc?.imageRequired
    if (promptNeeded && !prompt.trim()) {
      setError('Prompt is required for this model')
      return
    }
    if (imageNeeded && !imageUrl.trim()) {
      setError(`This model is image-only — paste a source image URL above`)
      return
    }
    setLoading(true); setError(null); setVideo(null); setJob(null)
    const { data, error: err } = await generateVideo(prompt.trim() || `(${model} animating image)`, {
      provider,
      model,
      duration,
      resolution,
      aspectRatio,
      style: caps.style ? style : '',
      audio: caps.audio ? audio : false,
      imageUrl: caps.imageUrl ? imageUrl.trim() : '',
      generateCaption: withCaption,
    })
    if (err) { setLoading(false); setError(err); return }

    if (data?.status === 'completed' && data?.videoUrl) {
      // ZSky sync path
      setVideo(data); setLoading(false)
      if (!today) setToday(data)
      onJobCompleted?.()
    } else if (data?.jobId) {
      // Worker async path
      setJob(data); startPolling(data.jobId)
    } else {
      setLoading(false); setError('Unexpected backend response')
    }
  }

  const cancel = () => {
    if (pollTimer.current) clearInterval(pollTimer.current)
    pollTimer.current = null
    setLoading(false); setJob(null)
  }

  const copyCaption = () => {
    if (!video?.caption) return
    navigator.clipboard.writeText(video.caption)
    setCopied(true); setTimeout(() => setCopied(false), 1800)
  }

  const downloadVideo = () => {
    if (!video?.videoUrl) return
    const a = document.createElement('a')
    a.href = resolveVideoUrl(video.videoUrl)
    a.download = `${video.videoId || 'ai-video'}.mp4`
    a.target = '_blank'; a.click()
  }

  const isPolicy = error && /safety filter|flagged|rephrasing|prompt was/i.test(error)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Form */}
      <div className="lg:col-span-3 space-y-5">
        <div>
          <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-2">1 — Pick a provider</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {PROVIDERS.map(p => {
              const active = provider === p.id
              const isOnline = p.id === 'worker' ? workerOnline : p.id === 'local' ? localOnline : null
              return (
                <button key={p.id} onClick={() => setProvider(p.id)} type="button"
                  aria-pressed={active}
                  className={`relative p-4 rounded-xl border text-left transition-all duration-200 overflow-hidden ${
                    active
                      ? `border-2 ${p.border.replace('/60', '')} bg-gray-900 shadow-xl ${p.glow.replace('/20', '/40')} scale-[1.02] ring-1 ring-white/5`
                      : 'border-2 border-gray-800 bg-gray-900/40 hover:bg-gray-900 hover:border-gray-700 hover:scale-[1.01]'
                  }`}>
                  {p.luxe && (
                    <div aria-hidden className={`absolute inset-0 pointer-events-none opacity-30 bg-gradient-to-br ${p.accent} mix-blend-overlay`} />
                  )}
                  {active && (
                    <div className={`absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gradient-to-br ${p.accent} flex items-center justify-center text-black shadow-md z-10`}>
                      <CheckOutlined className="text-[10px] font-bold" />
                    </div>
                  )}
                  <div className="relative flex items-start justify-between gap-1 mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-sm font-bold ${active ? 'text-white' : 'text-gray-300'}`}>{p.label}</span>
                      {isOnline === true && (
                        <span title="Worker online" className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      )}
                      {isOnline === false && (
                        <span title="Worker offline" className="w-1.5 h-1.5 rounded-full bg-gray-600" />
                      )}
                    </div>
                    <span className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-gradient-to-r ${p.accent} text-black whitespace-nowrap`}>
                      {p.badge}
                    </span>
                  </div>
                  <p className={`relative text-[11px] leading-snug ${active ? 'text-gray-400' : 'text-gray-500'}`}>{p.desc}</p>
                </button>
              )
            })}
          </div>

          {provider === 'local' && (
            <div className="mt-3">
              <label className="text-[10px] text-gray-500 block mb-1 uppercase tracking-wider">Model</label>
              <Select size="middle" value={model} onChange={setModel} style={{ width: '100%' }}
                popupMatchSelectWidth={false}
                options={MODELS_BY_PROVIDER.local} />
              <p className="text-[10px] text-gray-600 mt-1">
                7 models wired. Each becomes available the moment its checkpoint finishes downloading on the 5090.
              </p>
            </div>
          )}
        </div>

        <div>
          {provider === 'local' && MODEL_CAPS[model]?.prompt === false ? (
            <div className="p-4 rounded-lg bg-gradient-to-br from-amber-500/5 to-rose-500/5 border border-amber-400/20 text-xs text-gray-300">
              <p className="font-semibold text-amber-200 mb-1">No prompt needed for SVD-XT</p>
              <p className="text-gray-400 leading-relaxed">
                SVD-XT animates the source image directly using motion priors. Skip the prompt and
                paste an image URL below.
              </p>
            </div>
          ) : (
            <>
              <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-2">2 — Describe your video</p>
              <Input.TextArea value={prompt} onChange={e => setPrompt(e.target.value)}
                placeholder="a cat dancing"
                autoSize={{ minRows: 3, maxRows: 6 }} maxLength={400} showCount />

              <div className="mt-3">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Verified prompts</p>
                  <span className="text-[9px] text-emerald-500 font-semibold">✓ pass safety filter</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {PROMPT_PRESETS.map(p => {
                    const active = prompt === p
                    return (
                      <button key={p} onClick={() => setPrompt(p)}
                        className={`px-3 py-2 text-left text-xs rounded-lg transition-colors break-words whitespace-normal leading-snug ${
                          active ? 'bg-cyan-600/20 text-cyan-200 border border-cyan-500/50'
                                 : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-transparent'
                        }`}>
                        {p}
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          {(() => {
            const mc = provider === 'local' ? MODEL_CAPS[model] : null
            const provImg = CAPABILITIES[provider]?.imageUrl
            // Show field if provider supports i2v AND (no model gating OR model supports i2v)
            const showImage = provImg && (!mc || mc.i2v)
            if (!showImage) return null
            const required = mc?.imageRequired
            return (
              <div className="mt-3">
                <label className="text-[10px] text-gray-500 block mb-1 uppercase tracking-wider">
                  Image URL
                  <span className={`normal-case ml-1 ${required ? 'text-rose-400' : 'text-gray-700'}`}>
                    — {required ? 'required for this model' : 'optional, animates a still photo'}
                  </span>
                </label>
                <Input value={imageUrl} onChange={e => setImageUrl(e.target.value)}
                  placeholder="https://example.com/photo.jpg" allowClear
                  status={required && !imageUrl.trim() ? 'warning' : undefined} />
              </div>
            )
          })()}
        </div>

        <div>
          <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-2">3 — Tune it</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 block mb-1 uppercase tracking-wider">Aspect</label>
              <Select size="middle" value={aspectRatio} onChange={setAspectRatio} style={{ width: '100%' }}
                popupMatchSelectWidth={false}
                options={[
                  { value: '9:16', label: '9:16 Reel' },
                  { value: '16:9', label: '16:9 Wide' },
                  { value: '1:1', label: '1:1 Square' },
                ]} />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-1 uppercase tracking-wider">Resolution</label>
              <Select size="middle" value={resolution} onChange={setResolution} style={{ width: '100%' }}
                popupMatchSelectWidth={false}
                options={[
                  { value: '720p', label: '720p' },
                  { value: '1080p', label: '1080p' },
                ]} />
            </div>
            {CAPABILITIES[provider]?.style && (
              <div>
                <label className="text-[10px] text-gray-500 block mb-1 uppercase tracking-wider">Style</label>
                <Select size="middle" value={style} onChange={setStyle} style={{ width: '100%' }}
                  popupMatchSelectWidth={false}
                  options={[
                    { value: 'cinematic', label: 'Cinematic' },
                    { value: 'realistic', label: 'Realistic' },
                    { value: 'anime', label: 'Anime' },
                    { value: '3d render', label: '3D Render' },
                    { value: 'cyberpunk', label: 'Cyberpunk' },
                    { value: 'oil painting', label: 'Oil Painting' },
                  ]} />
              </div>
            )}
            <div>
              <label className="text-[10px] text-gray-500 block mb-1 uppercase tracking-wider">Duration</label>
              <Select size="middle" value={duration} onChange={setDuration} style={{ width: '100%' }}
                popupMatchSelectWidth={false}
                options={[
                  { value: 5, label: '5s' },
                  { value: 7, label: '7s' },
                  { value: 10, label: '10s' },
                ]} />
            </div>
            {CAPABILITIES[provider]?.audio && (
              <div className="col-span-2 sm:col-span-1">
                <label className="text-[10px] text-gray-500 block mb-1 uppercase tracking-wider">Audio</label>
                <div className="h-[36px] flex items-center px-3 rounded-md bg-gray-900/60 border border-gray-800">
                  <Switch checked={audio} onChange={setAudio} size="small" />
                  <span className="ml-2 text-xs text-gray-400">{audio ? 'on' : 'off'}</span>
                </div>
              </div>
            )}
          </div>

          <label className="flex items-center justify-between p-3 rounded-lg bg-gray-900/60 border border-gray-800 cursor-pointer mt-3">
            <span className="text-xs text-gray-400">Auto-write Reel caption (Groq)</span>
            <Switch checked={withCaption} onChange={setWithCaption} size="small" />
          </label>
        </div>

        <Button type="primary" size="large" block onClick={generate} loading={loading}
          disabled={(() => {
            const mc = provider === 'local' ? MODEL_CAPS[model] : null
            const promptNeeded = !mc || mc.prompt !== false
            const imageNeeded = !!mc?.imageRequired
            if (promptNeeded && !prompt.trim()) return true
            if (imageNeeded && !imageUrl.trim()) return true
            return false
          })()}
          icon={<ThunderboltOutlined />}
          style={{ height: 52, background: 'linear-gradient(135deg, #7c3aed, #06b6d4, #f59e0b)', border: 'none', fontWeight: 700, fontSize: 15 }}>
          {loading ? 'Generating…' : 'Generate Video'}
        </Button>

        <div className="p-3 rounded-lg bg-gradient-to-br from-amber-500/5 via-rose-500/5 to-fuchsia-500/5 border border-amber-400/20 flex items-start gap-2">
          <InfoCircleOutlined className="text-amber-400/80 mt-0.5" />
          <div className="text-[11px] text-gray-400 leading-relaxed">
            <span className="text-amber-300 font-semibold">5090 Beast</span> is the exclusive luxe path — when it's online, your video renders in seconds on Siddharth's personal RTX 5090 with the latest open-source models.
            Status dot on each card shows what's live right now.
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="lg:col-span-2">
        <div className="lg:sticky lg:top-28 space-y-5">
          {loading && (
            <div className="space-y-3">
              <Skeleton
                jobId={job?.jobId || job?.videoId}
                status={
                  job?.status ||
                  (provider === 'zsky'  ? 'zsky_running' :
                   provider === 'local' ? 'local_queued' :
                   'queued')
                }
              />
              <Button block onClick={cancel} icon={<ReloadOutlined />}>
                Stop watching (job continues in background)
              </Button>
            </div>
          )}

          {!loading && video && (
            <div className="space-y-3">
              <VideoCard video={video} label={`via ${video.provider}`} tone="cyan" />
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={downloadVideo} icon={<DownloadOutlined />} block>Save MP4</Button>
                <Button onClick={copyCaption} icon={copied ? <CheckOutlined /> : <CopyOutlined />} block disabled={!video.caption}>
                  {copied ? 'Copied' : 'Copy caption'}
                </Button>
              </div>
              <a href={resolveVideoUrl(video.videoUrl)} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-cyan-400 transition-colors break-all">
                <LinkOutlined /><span className="truncate">{video.videoUrl}</span>
              </a>
            </div>
          )}

          {!loading && error && (
            <div className={`p-4 rounded-xl ${isPolicy ? 'bg-orange-950/40 border border-orange-700/50' : 'bg-gray-900/60 border border-yellow-700/40'}`}>
              <p className={`text-sm font-semibold mb-1 ${isPolicy ? 'text-orange-300' : 'text-yellow-400'}`}>
                {isPolicy ? 'Prompt flagged' : 'Generation failed'}
              </p>
              <p className="text-gray-400 text-xs leading-relaxed mb-3">{error}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="small" icon={<ReloadOutlined />} onClick={generate}>Try again</Button>
              </div>
            </div>
          )}

          {!loading && !video && !error && (
            <>
              <div className="text-[10px] uppercase tracking-wider text-gray-600 font-semibold">Latest video</div>
              {today ? (
                <VideoCard video={today} label="Latest" tone="pink" />
              ) : (
                <div className="aspect-[9/16] sm:aspect-video rounded-2xl border-2 border-dashed border-gray-800 flex items-center justify-center">
                  <div className="text-center text-gray-600 px-6">
                    <VideoCameraOutlined style={{ fontSize: 36 }} />
                    <p className="text-sm mt-2">No videos yet</p>
                    <p className="text-[11px] mt-1">Generate the first one →</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Library tab — paginated, no eager video loads ─────────
const LibraryCard = ({ video, onClick, onDelete }) => {
  const provColor =
    video.provider === 'zsky'  ? 'from-sky-500 to-blue-400' :
    video.provider === 'local' ? 'from-amber-400 via-rose-400 to-fuchsia-500' :
                                 'from-emerald-500 to-cyan-400'
  const date = new Date(video.createdAt)
  const dateLabel = isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const thumb = thumbFromVideo(resolveVideoUrl(video.videoUrl))

  return (
    <div className="group relative rounded-xl overflow-hidden border border-gray-800 bg-gray-900/50 hover:bg-gray-900 hover:border-gray-700 transition-all">
      <button onClick={onClick} className="w-full text-left">
        <div className="relative aspect-[9/16] bg-gradient-to-br from-gray-800/80 to-gray-950 overflow-hidden">
          {thumb ? (
            <img src={thumb} alt={video.prompt} loading="lazy"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <PlayCircleOutlined className="text-4xl text-gray-700" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/30 opacity-100 group-hover:from-black/40 transition-opacity" />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <PlayCircleOutlined className="text-5xl text-white drop-shadow-lg" />
          </div>
          <div className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-gradient-to-r ${provColor} text-black`}>
            {video.provider}
          </div>
          {dateLabel && (
            <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full text-[9px] bg-black/60 text-gray-300 border border-white/10">
              {dateLabel}
            </div>
          )}
        </div>
        <div className="p-2.5">
          <p className="text-xs text-gray-200 line-clamp-2 leading-snug min-h-[2.4em]">
            {video.prompt}
          </p>
        </div>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete?.(video) }}
        title="Delete video"
        className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-black/60 hover:bg-rose-600 text-gray-300 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <DeleteOutlined className="text-xs" />
      </button>
    </div>
  )
}

const LibraryTab = ({ refreshKey }) => {
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ items: [], total: 0, pages: 1, page: 1 })
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [internalReload, setInternalReload] = useState(0)

  useEffect(() => { setPage(1) }, [filter, refreshKey])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const opts = { page, limit: 12 }
    if (filter !== 'all') opts.provider = filter
    listVideos(opts).then(({ data }) => {
      if (!cancelled) {
        setData(data)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [filter, page, refreshKey, internalReload])

  const askDelete = (video) => {
    Modal.confirm({
      title: 'Delete this video?',
      content: (
        <div className="text-sm text-gray-300">
          <p className="mb-2 italic">"{video.prompt}"</p>
          <p className="text-xs text-gray-500">This permanently removes the video from Cloudinary. Can't be undone.</p>
        </div>
      ),
      okText: 'Delete',
      okButtonProps: { danger: true },
      cancelText: 'Keep',
      centered: true,
      onOk: async () => {
        setDeleting(video.videoId)
        const { error: err } = await deleteVideo(video.videoId)
        setDeleting(null)
        if (err) {
          Modal.error({ title: 'Delete failed', content: err })
          return
        }
        if (selected?.videoId === video.videoId) setSelected(null)
        setInternalReload(n => n + 1)
      },
    })
  }

  const filters = [
    { v: 'all', label: 'All' },
    { v: 'zsky', label: 'ZSky' },
    { v: 'worker', label: 'GPU Worker' },
    { v: 'local', label: '5090 Beast' },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {filters.map(f => (
            <button key={f.v} onClick={() => setFilter(f.v)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                filter === f.v ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/40'
                                : 'bg-gray-800 hover:bg-gray-700 text-gray-400 border border-transparent'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="text-[11px] text-gray-500">
          {data.total > 0 ? `${data.total} video${data.total === 1 ? '' : 's'}` : ''}
        </div>
      </div>

      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="rounded-xl overflow-hidden border border-gray-800">
              <div className="aspect-[9/16] bg-gray-800/60 animate-pulse" />
              <div className="p-2.5 space-y-1.5 bg-gray-900/40">
                <div className="h-3 w-full rounded bg-gray-800 animate-pulse" />
                <div className="h-3 w-2/3 rounded bg-gray-800 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && data.items.length === 0 && (
        <div className="aspect-video rounded-2xl border-2 border-dashed border-gray-800 flex items-center justify-center">
          <div className="text-center text-gray-600 px-6">
            <AppstoreOutlined style={{ fontSize: 36 }} />
            <p className="text-sm mt-2">No videos yet{filter !== 'all' ? ` for ${filter}` : ''}</p>
            <p className="text-[11px] mt-1">Generated videos will appear here</p>
          </div>
        </div>
      )}

      {!loading && data.items.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {data.items.map(item => (
              <LibraryCard
                key={item.videoId}
                video={item}
                onClick={() => setSelected(item)}
                onDelete={askDelete}
              />
            ))}
          </div>

          {data.pages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-3">
              <Button
                icon={<LeftOutlined />}
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}>
                Prev
              </Button>
              <span className="text-xs text-gray-400">
                Page <span className="text-white font-semibold">{data.page}</span> of {data.pages}
              </span>
              <Button
                disabled={page >= data.pages}
                onClick={() => setPage(p => Math.min(data.pages, p + 1))}>
                Next <RightOutlined />
              </Button>
            </div>
          )}
        </>
      )}

      <Modal open={!!selected} onCancel={() => setSelected(null)} footer={null}
        centered width={520} destroyOnClose
        styles={{ body: { padding: 0, background: 'transparent' } }}>
        {selected && (
          <VideoCard video={selected} label={`via ${selected.provider}`}
            tone={selected.provider === 'zsky' ? 'cyan' : 'pink'} />
        )}
      </Modal>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────
const AIVideo = () => {
  const [today, setToday] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    getTodayVideo().then(({ data }) => setToday(data))
  }, [])

  const onCompleted = () => setRefreshKey(k => k + 1)

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/30 via-cyan-900/10 to-amber-900/20 pointer-events-none" />
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-cyan-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-5 sm:px-6 pt-28 sm:pt-32 pb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-800/60 border border-gray-700 backdrop-blur-sm mb-3">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-[11px] uppercase tracking-wider text-gray-300 font-semibold">3 providers • free</span>
          </div>
          <h1 className="font-poppins font-black text-4xl sm:text-5xl md:text-6xl bg-gradient-to-r from-cyan-300 via-purple-300 to-amber-300 bg-clip-text text-transparent leading-tight mb-2">
            AI Video Studio
          </h1>
          <p className="text-gray-400 text-sm sm:text-base max-w-xl">
            Type a prompt → get a Reel-style video. ZSky for instant results, GPU Worker for queued open-source ComfyUI, or my 5090 Beast for fast text + image-to-video.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-5 sm:px-6 pb-24">
        <Tabs
          defaultActiveKey="generate"
          size="large"
          items={[
            {
              key: 'generate',
              label: <span><ThunderboltOutlined /> Generate</span>,
              children: <GenerateTab today={today} setToday={setToday} onJobCompleted={onCompleted} />,
            },
            {
              key: 'library',
              label: <span><AppstoreOutlined /> Library</span>,
              children: <LibraryTab refreshKey={refreshKey} />,
            },
          ]}
        />
      </div>
    </div>
  )
}

export default AIVideo
