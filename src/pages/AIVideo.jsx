import { useState, useEffect, useRef } from 'react'
import { Input, Button, Select, Switch } from 'antd'
import { VideoCameraOutlined, ThunderboltOutlined, CopyOutlined, CheckOutlined, DownloadOutlined, ReloadOutlined, LinkOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { generateVideo, getJobStatus, getTodayVideo, getVideoProviders } from '../api/ai'

const BE_URL = import.meta.env.VITE_BE_URL || 'http://localhost:4001'

const PROVIDERS = [
  {
    id: 'auto',
    label: 'Auto',
    desc: 'Tries ZSky → ComfyUI',
    badge: 'Smart',
    accent: 'from-fuchsia-500 via-cyan-500 to-amber-400',
    border: 'border-fuchsia-500/60',
    glow: 'shadow-fuchsia-500/20',
  },
  {
    id: 'zsky',
    label: 'ZSky AI',
    desc: 'Hosted • free tier • always live',
    badge: 'Fast',
    accent: 'from-sky-500 to-blue-400',
    border: 'border-sky-500/60',
    glow: 'shadow-sky-500/20',
  },
  {
    id: 'comfyui',
    label: 'ComfyUI',
    desc: 'My GPU worker → Cloudinary',
    badge: 'Best',
    accent: 'from-emerald-500 to-cyan-400',
    border: 'border-emerald-500/60',
    glow: 'shadow-emerald-500/20',
  },
]

const MODELS_BY_PROVIDER = {
  auto: [{ value: 'auto', label: 'Auto' }],
  zsky: [
    { value: 'cinematic', label: 'Cinematic' },
    { value: 'realistic', label: 'Realistic' },
    { value: 'anime', label: 'Anime' },
    { value: 'cartoon', label: 'Cartoon' },
  ],
  comfyui: [
    { value: 'ltx-video', label: 'LTX-Video' },
    { value: 'wan-2.1', label: 'Wan 2.1' },
    { value: 'wan-2.2', label: 'Wan 2.2' },
    { value: 'hunyuan', label: 'Hunyuan' },
    { value: 'cogvideox', label: 'CogVideoX' },
    { value: 'mochi', label: 'Mochi' },
  ],
}

// All verified to pass ZSky's safety filter — short, no people, no brands, no quality words.
// Long prompts with style suffixes ("cinematic, vertical reel") tend to get flagged.
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

const resolveVideoUrl = (url) => (url?.startsWith('http') ? url : `${BE_URL}${url}`)

const Tag = ({ children }) => (
  <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider rounded-md bg-gray-800 text-gray-400 border border-gray-700">
    {children}
  </span>
)

const VideoCard = ({ video, label = 'Latest', tone = 'cyan' }) => {
  const tones = {
    cyan: 'from-cyan-400 to-purple-400',
    pink: 'from-pink-400 to-amber-400',
  }
  if (!video?.videoUrl) return null
  return (
    <div className="rounded-2xl overflow-hidden border border-gray-800 bg-gray-900/60 backdrop-blur-sm">
      <div className="relative bg-black">
        <video src={resolveVideoUrl(video.videoUrl)} controls playsInline loop
          className="w-full max-h-[70vh] object-contain" />
        <div className={`absolute top-2 left-2 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-gradient-to-r ${tones[tone]} text-black`}>
          {label}
        </div>
      </div>
      <div className="p-4 space-y-2.5">
        <p className="text-gray-300 text-sm leading-relaxed">{video.prompt}</p>
        {video.caption && (
          <p className="text-gray-500 text-xs italic border-l-2 border-gray-700 pl-3 whitespace-pre-line">{video.caption}</p>
        )}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {video.provider && <Tag>{video.provider}</Tag>}
          {video.model && <Tag>{video.model}</Tag>}
          {video.aspectRatio && <Tag>{video.aspectRatio}</Tag>}
          {video.resolution && <Tag>{video.resolution}</Tag>}
          {video.duration && <Tag>{video.duration}s</Tag>}
        </div>
      </div>
    </div>
  )
}

const STATUS_COPY = {
  queued:        { label: 'Queued',     hint: 'Waiting for a worker to pick this up…',                 tone: 'cyan' },
  gpu_offline:   { label: 'GPU offline', hint: 'GPU worker is asleep. Will start as soon as it wakes.', tone: 'amber' },
  processing:    { label: 'Generating', hint: 'On a GPU now. Usually 60-90s.',                          tone: 'fuchsia' },
  completed:     { label: 'Done',       hint: '',                                                       tone: 'emerald' },
  failed:        { label: 'Failed',     hint: '',                                                       tone: 'rose' },
}

const Skeleton = ({ jobId, status, providerHint, workerOnline }) => {
  const copy = STATUS_COPY[status] || STATUS_COPY.queued
  const ringColor = {
    cyan: 'border-cyan-500/40 border-t-cyan-400',
    amber: 'border-amber-500/40 border-t-amber-400',
    fuchsia: 'border-fuchsia-500/40 border-t-fuchsia-400',
    emerald: 'border-emerald-500/40 border-t-emerald-400',
    rose: 'border-rose-500/40 border-t-rose-400',
  }[copy.tone]
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/40 overflow-hidden">
      <div className="aspect-[9/16] sm:aspect-video bg-gray-800/60 animate-pulse flex items-center justify-center">
        <div className="text-center space-y-3 px-6">
          <div className={`w-16 h-16 mx-auto rounded-full border-2 ${ringColor} animate-spin`} />
          <p className="text-gray-200 text-sm font-semibold">{copy.label}…</p>
          <p className="text-gray-500 text-xs">{copy.hint}</p>
          {providerHint === 'comfyui' && !workerOnline && status === 'queued' && (
            <p className="text-amber-400/80 text-[11px] leading-snug">
              GPU worker is asleep. Job is safe — it'll process when worker comes back online.
            </p>
          )}
          {jobId && <p className="text-gray-700 text-[10px] font-mono break-all">{jobId}</p>}
        </div>
      </div>
    </div>
  )
}

const AIVideo = () => {
  const [prompt, setPrompt] = useState('')
  const [provider, setProvider] = useState('auto')
  const [model, setModel] = useState('auto')
  const [duration, setDuration] = useState(5)
  const [resolution, setResolution] = useState('1080p')
  const [aspectRatio, setAspectRatio] = useState('9:16')
  const [style, setStyle] = useState('cinematic')
  const [audio, setAudio] = useState(true)
  const [withCaption, setWithCaption] = useState(true)
  const [imageUrl, setImageUrl] = useState('')

  const [loading, setLoading] = useState(false)
  const [job, setJob] = useState(null)            // current in-flight or finished job
  const [video, setVideo] = useState(null)         // resolved completed job
  const [error, setError] = useState(null)
  const [workerOnline, setWorkerOnline] = useState(false)

  const [today, setToday] = useState(null)
  const [todayLoading, setTodayLoading] = useState(true)

  const [copied, setCopied] = useState(false)
  const pollTimer = useRef(null)

  useEffect(() => {
    let cancelled = false
    getTodayVideo().then(({ data }) => {
      if (!cancelled) {
        setToday(data)
        setTodayLoading(false)
      }
    })
    getVideoProviders().then(({ data }) => {
      if (!cancelled && data) setWorkerOnline(!!data.workerOnline)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const list = MODELS_BY_PROVIDER[provider] || []
    if (list.length && !list.find(m => m.value === model)) setModel(list[0].value)
  }, [provider]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (pollTimer.current) clearInterval(pollTimer.current) }, [])

  const startPolling = (jobId) => {
    if (pollTimer.current) clearInterval(pollTimer.current)
    let attempts = 0
    pollTimer.current = setInterval(async () => {
      attempts += 1
      const { data, error: err } = await getJobStatus(jobId)
      if (err) {
        if (attempts > 5) {
          clearInterval(pollTimer.current); pollTimer.current = null
          setLoading(false); setError(err)
        }
        return
      }
      if (!data) return
      setJob(data)
      if (data.status === 'completed') {
        clearInterval(pollTimer.current); pollTimer.current = null
        setVideo(data); setLoading(false)
        if (!today) setToday(data)
      } else if (data.status === 'failed') {
        clearInterval(pollTimer.current); pollTimer.current = null
        setLoading(false); setError(data.error || 'Generation failed')
      }
      // Stop after 15 minutes max
      if (attempts > 300) {
        clearInterval(pollTimer.current); pollTimer.current = null
        setLoading(false); setError('Timed out waiting for the job to complete')
      }
    }, 3000)
  }

  const generate = async () => {
    if (!prompt.trim() || loading) return
    setLoading(true); setError(null); setVideo(null); setJob(null)
    const { data, error: err } = await generateVideo(prompt.trim(), {
      provider, model, duration, resolution, aspectRatio, style, audio, imageUrl: imageUrl.trim(), generateCaption: withCaption,
    })
    if (err) {
      setLoading(false); setError(err); return
    }
    if (data?.jobId) {
      setJob({ ...data })
      startPolling(data.jobId)
    } else if (data?.videoUrl) {
      setVideo(data); setLoading(false)
      if (!today) setToday(data)
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
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const downloadVideo = () => {
    if (!video?.videoUrl) return
    const a = document.createElement('a')
    a.href = resolveVideoUrl(video.videoUrl)
    a.download = `${video.videoId || 'ai-video'}.mp4`
    a.target = '_blank'
    a.click()
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/30 via-cyan-900/10 to-amber-900/20 pointer-events-none" />
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-cyan-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-5 sm:px-6 pt-28 sm:pt-32 pb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-800/60 border border-gray-700 backdrop-blur-sm mb-4">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-[11px] uppercase tracking-wider text-gray-300 font-semibold">3 providers • smart fallback</span>
          </div>
          <h1 className="font-poppins font-black text-4xl sm:text-5xl md:text-6xl bg-gradient-to-r from-cyan-300 via-purple-300 to-amber-300 bg-clip-text text-transparent leading-tight mb-3">
            AI Video Studio
          </h1>
          <p className="text-gray-400 text-sm sm:text-base max-w-xl">
            Type a prompt → get a Reel-style video. ZSky hosted, ComfyUI on my GPU worker, and HuggingFace fallback.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-5 sm:px-6 pb-24 grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-5">
          {/* Provider cards */}
          <div>
            <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-2">1 — Pick a provider</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
              {PROVIDERS.map(p => {
                const active = provider === p.id
                return (
                  <button key={p.id} onClick={() => setProvider(p.id)}
                    className={`relative p-3 sm:p-4 rounded-xl border text-left transition-all ${
                      active ? `${p.border} bg-gray-900 shadow-lg ${p.glow}` : 'border-gray-800 bg-gray-900/40 hover:bg-gray-900 hover:border-gray-700'
                    }`}>
                    <div className="flex items-start justify-between gap-1 mb-1">
                      <span className={`text-xs sm:text-sm font-bold ${active ? 'text-white' : 'text-gray-300'}`}>{p.label}</span>
                      <span className={`text-[8px] sm:text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-gradient-to-r ${p.accent} text-black whitespace-nowrap`}>
                        {p.badge}
                      </span>
                    </div>
                    <p className="text-[10px] sm:text-[11px] text-gray-500 leading-snug">{p.desc}</p>
                    {active && <div className={`absolute inset-0 rounded-xl border-2 ${p.border} pointer-events-none`} />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Prompt */}
          <div>
            <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-2">2 — Describe your video</p>
            <Input.TextArea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="a cat dancing"
              autoSize={{ minRows: 3, maxRows: 6 }}
              maxLength={400}
              showCount
            />
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Verified prompts (click to use)</p>
                <span className="text-[9px] text-emerald-500 font-semibold">✓ pass safety filter</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {PROMPT_PRESETS.map(p => {
                  const active = prompt === p
                  return (
                    <button key={p} onClick={() => setPrompt(p)}
                      className={`px-3 py-2 text-left text-xs rounded-lg transition-colors break-words whitespace-normal leading-snug ${
                        active
                          ? 'bg-cyan-600/20 text-cyan-200 border border-cyan-500/50'
                          : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-transparent'
                      }`}>
                      {p}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mt-3">
              <label className="text-[10px] text-gray-500 block mb-1 uppercase tracking-wider">
                Image URL <span className="text-gray-700 normal-case">— optional, animates a still photo (ZSky only)</span>
              </label>
              <Input
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
                placeholder="https://example.com/photo.jpg"
                allowClear
              />
            </div>
          </div>

          {/* Settings grid */}
          <div>
            <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-2">3 — Tune it</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div>
                <label className="text-[10px] text-gray-500 block mb-1 uppercase tracking-wider">Model</label>
                <Select size="middle" value={model} onChange={setModel} style={{ width: '100%' }}
                  popupMatchSelectWidth={false} placement="bottomLeft"
                  options={MODELS_BY_PROVIDER[provider]} />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-1 uppercase tracking-wider">Aspect</label>
                <Select size="middle" value={aspectRatio} onChange={setAspectRatio} style={{ width: '100%' }}
                  popupMatchSelectWidth={false} placement="bottomLeft"
                  options={[
                    { value: '9:16', label: '9:16 Reel' },
                    { value: '16:9', label: '16:9 Wide' },
                    { value: '1:1', label: '1:1 Square' },
                  ]} />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-1 uppercase tracking-wider">Resolution</label>
                <Select size="middle" value={resolution} onChange={setResolution} style={{ width: '100%' }}
                  popupMatchSelectWidth={false} placement="bottomLeft"
                  options={[
                    { value: '720p', label: '720p' },
                    { value: '1080p', label: '1080p' },
                  ]} />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-1 uppercase tracking-wider">Style</label>
                <Select size="middle" value={style} onChange={setStyle} style={{ width: '100%' }}
                  popupMatchSelectWidth={false} placement="bottomLeft"
                  options={[
                    { value: 'cinematic', label: 'Cinematic' },
                    { value: 'realistic', label: 'Realistic' },
                    { value: 'anime', label: 'Anime' },
                    { value: '3d render', label: '3D Render' },
                    { value: 'cyberpunk', label: 'Cyberpunk' },
                    { value: 'oil painting', label: 'Oil Painting' },
                  ]} />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-1 uppercase tracking-wider">Duration</label>
                <Select size="middle" value={duration} onChange={setDuration} style={{ width: '100%' }}
                  popupMatchSelectWidth={false} placement="bottomLeft"
                  options={[
                    { value: 5, label: '5s' },
                    { value: 7, label: '7s' },
                    { value: 10, label: '10s' },
                  ]} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <label className="flex items-center justify-between p-3 rounded-lg bg-gray-900/60 border border-gray-800 cursor-pointer">
                <span className="text-xs text-gray-400">Generate audio</span>
                <Switch checked={audio} onChange={setAudio} size="small" />
              </label>
              <label className="flex items-center justify-between p-3 rounded-lg bg-gray-900/60 border border-gray-800 cursor-pointer">
                <span className="text-xs text-gray-400">Auto-write Reel caption (Groq)</span>
                <Switch checked={withCaption} onChange={setWithCaption} size="small" />
              </label>
            </div>
          </div>

          {/* Generate button */}
          <Button
            type="primary" size="large" block
            onClick={generate} loading={loading}
            disabled={!prompt.trim()}
            icon={<ThunderboltOutlined />}
            style={{ height: 52, background: 'linear-gradient(135deg, #7c3aed, #06b6d4, #f59e0b)', border: 'none', fontWeight: 700, fontSize: 15 }}>
            {loading ? 'Generating…' : 'Generate Video'}
          </Button>

          {/* Honest banner */}
          <div className="p-3 rounded-lg bg-gray-900/40 border border-gray-800 space-y-2">
            <div className="flex items-start gap-2">
              <InfoCircleOutlined className="text-gray-500 mt-0.5" />
              <div className="text-[11px] text-gray-500 leading-relaxed">
                <span className="text-gray-300 font-semibold">Auto</span> tries ZSky → HF → ComfyUI in order until one succeeds.
                ComfyUI requires the GPU worker running — see <code className="text-cyan-400">/gpu-worker/README.md</code>.
              </div>
            </div>
          </div>
        </div>

        {/* Preview column */}
        <div className="lg:col-span-2">
          <div className="lg:sticky lg:top-28 space-y-5">
            {loading && (
              <div className="space-y-3">
                <Skeleton
                  jobId={job?.jobId}
                  status={job?.status || 'queued'}
                  providerHint={provider}
                  workerOnline={workerOnline}
                />
                <Button block onClick={cancel} icon={<ReloadOutlined />}>
                  Stop watching (job continues in background)
                </Button>
              </div>
            )}

            {!loading && video && (
              <div className="space-y-3">
                <VideoCard video={video} label={video.providerUsed ? `via ${video.providerUsed}` : 'Just generated'} tone="cyan" />
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={downloadVideo} icon={<DownloadOutlined />} block>Save MP4</Button>
                  <Button onClick={copyCaption} icon={copied ? <CheckOutlined /> : <CopyOutlined />} block disabled={!video.caption}>
                    {copied ? 'Copied' : 'Copy caption'}
                  </Button>
                </div>
                <a href={resolveVideoUrl(video.videoUrl)} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-cyan-400 transition-colors break-all">
                  <LinkOutlined />
                  <span className="truncate">{video.videoUrl}</span>
                </a>
              </div>
            )}

            {!loading && error && (() => {
              const isPolicy = /safety filter|flagged|rephrasing|prompt was/i.test(error)
              return (
                <div className={`p-4 rounded-xl ${isPolicy ? 'bg-orange-950/40 border border-orange-700/50' : 'bg-gray-900/60 border border-yellow-700/40'}`}>
                  <p className={`text-sm font-semibold mb-1 ${isPolicy ? 'text-orange-300' : 'text-yellow-400'}`}>
                    {isPolicy ? 'Prompt flagged' : 'Generation failed'}
                  </p>
                  <p className="text-gray-400 text-xs leading-relaxed mb-3">{error}</p>
                  {isPolicy && (
                    <div className="space-y-2 mb-3">
                      <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Try a safe preset</p>
                      <div className="grid grid-cols-1 gap-1.5">
                        {PROMPT_PRESETS.slice(0, 4).map(p => (
                          <button key={p} onClick={() => setPrompt(p)}
                            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs rounded-md transition-colors text-left break-words whitespace-normal leading-snug">
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button size="small" icon={<ReloadOutlined />} onClick={generate}>Try again</Button>
                    {!isPolicy && provider !== 'auto' && (
                      <Button size="small" type="primary" onClick={() => setProvider('auto')}
                        style={{ background: 'linear-gradient(135deg,#a855f7,#06b6d4)', border: 'none' }}>
                        Try Auto fallback
                      </Button>
                    )}
                  </div>
                </div>
              )
            })()}

            {!loading && !video && !error && (
              <>
                <div className="text-[10px] uppercase tracking-wider text-gray-600 font-semibold">Video of the Day</div>
                {todayLoading ? (
                  <Skeleton status="queued" providerHint="auto" workerOnline={workerOnline} />
                ) : today ? (
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
    </div>
  )
}

export default AIVideo
