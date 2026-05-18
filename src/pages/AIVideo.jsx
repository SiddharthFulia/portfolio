import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Input, Button, Select, Switch, Tabs, Modal, Upload, message as antMessage } from 'antd'
import {
  VideoCameraOutlined, ThunderboltOutlined, CopyOutlined, CheckOutlined,
  DownloadOutlined, ReloadOutlined, LinkOutlined, InfoCircleOutlined, AppstoreOutlined,
  PlayCircleOutlined, LeftOutlined, RightOutlined, ExpandAltOutlined, PauseOutlined,
  CaretRightOutlined, BulbOutlined,
} from '@ant-design/icons'
import {
  generateVideo, getJobStatus, getTodayVideo, getVideoProviders, listVideos, deleteVideo,
  uploadSourceImage, listJobs,
} from '../api/ai'
import { UploadOutlined } from '@ant-design/icons'
import { DeleteOutlined } from '@ant-design/icons'
import PromptHelper from '../components/PromptHelper'

const BE_URL = import.meta.env.VITE_BE_URL || 'http://localhost:4001'

// localStorage key for an in-flight job id. We persist this on /generate so
// that a page refresh can resume the live spinner + log feed instead of
// orphaning the user mid-render. Cleared on completion, failure, or manual
// cancel.
const INFLIGHT_JOB_KEY = 'sid-aivideo-inflight-job'

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
    label: 'GPU Worker',
    desc: 'ComfyUI on Lightning • offline for now',
    badge: 'Off',
    accent: 'from-emerald-500 to-cyan-400',
    border: 'border-emerald-500/60',
    glow: 'shadow-emerald-500/20',
    disabled: true,
  },
  {
    id: 'optimized',
    label: '5090 Optimized',
    desc: 'Speed-tuned • LTX distilled / Wan 2.2 / cache acceleration',
    badge: 'Fast',
    accent: 'from-cyan-300 via-fuchsia-400 to-purple-500',
    border: 'border-cyan-300/60',
    glow: 'shadow-cyan-300/30',
    luxe: true,
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
  zsky:      { imageUrl: true,  audio: true,  style: true,  caption: true },
  worker:    { imageUrl: false, audio: false, style: false, caption: true },
  local:     { imageUrl: true,  audio: false, style: false, caption: true },
  optimized: { imageUrl: true,  audio: false, style: false, caption: true },
}

// Per-model overrides for the local provider — finer control than the
// provider-level CAPABILITIES because individual models have very different
// requirements (SVD has no prompt, Wan I2V needs an image, etc.).
//   t2v:           supports text-only generation
//   i2v:           supports image conditioning
//   imageRequired: image is mandatory (model is image-only)
//   prompt:        accepts a text prompt at all
const MODEL_CAPS = {
  'ltx-distilled': { t2v: true, i2v: true, imageRequired: false, prompt: true },
  'ltx-video':   { t2v: true,  i2v: true,  imageRequired: false, prompt: true  },
  'wan-2.1':     { t2v: true,  i2v: false, imageRequired: false, prompt: true  },
  'wan-2.1-i2v': { t2v: false, i2v: true,  imageRequired: true,  prompt: true  },
  'wan-2.2':     { t2v: true,  i2v: true,  imageRequired: false, prompt: true  },
  'svd':         { t2v: false, i2v: true,  imageRequired: true,  prompt: false },
  'hunyuan':     { t2v: true,  i2v: true,  imageRequired: false, prompt: true  },
  'mochi':       { t2v: true,  i2v: false, imageRequired: false, prompt: true  },
}

// Speed modes for the '5090 Optimized' provider — each picks a model + sane defaults.
const OPTIMIZED_MODES = [
  {
    id: 'preview',
    label: 'Fast Preview',
    desc: 'LTX distilled • 8 steps • ~10-25 sec',
    target: '~15s',
    accent: 'from-cyan-300 to-blue-400',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    desc: 'Wan 2.2 5B • 14 steps • ~30-90 sec',
    target: '~60s',
    accent: 'from-fuchsia-400 to-purple-500',
  },
  {
    id: 'quality',
    label: 'Quality',
    desc: 'HunyuanVideo • 16 steps • slow but premium output',
    target: '~30min',
    accent: 'from-amber-400 via-rose-400 to-fuchsia-500',
  },
]

// Recommended step counts per model. Auto-applied when the user picks a model;
// the user can still override via the Steps dropdown.
const MODEL_DEFAULT_STEPS = {
  'ltx-video':   30,   // template default
  'wan-2.1':     30,
  'wan-2.1-i2v': 30,
  'wan-2.2':     20,   // Wan 2.2 official template uses 20
  'svd':         25,
  'hunyuan':     20,   // Hunyuan template default; higher hurts a lot
  'mochi':       30,
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
    modelOpt('hunyuan',     'HunyuanVideo',     'Tencent • highest fidelity T2V + I2V'),
    modelOpt('wan-2.2',     'Wan 2.2 5B',       'newest gen TI2V • text + image'),
    modelOpt('mochi',       'Mochi 1',          'Apache-2 license • distinctive style'),
    modelOpt('svd',         'SVD-XT 1.1',       'image-only animation, no prompt'),
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

// Tick every second so countdown / elapsed display updates smoothly
const useTick = (active) => {
  const [, set] = useState(0)
  useEffect(() => {
    if (!active) return undefined
    const id = setInterval(() => set(n => n + 1), 1000)
    return () => clearInterval(id)
  }, [active])
}

const fmtSec = (s) => {
  if (!Number.isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const r = Math.floor(s % 60)
  return m > 0 ? `${m}m ${r}s` : `${r}s`
}

// Pretty timestamp for the modal: hh:mm:ss with millis
const fmtTs = (ts) => {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n, w = 2) => String(n).padStart(w, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

// Tone-from-text — same rules used in the inline feed and the modal so the
// expanded view shows the exact same colour coding the user saw in-card.
const logTone = (text) => {
  if (text.startsWith('✗')) return 'text-rose-400'
  if (text.startsWith('🎬')) return 'text-emerald-300'
  if (text.startsWith('✓')) return 'text-emerald-400/80'
  if (text.startsWith('⚡')) return 'text-amber-300'
  if (text.startsWith('⏱')) return 'text-cyan-300'
  if (text.startsWith('→') || text.startsWith('↑')) return 'text-fuchsia-300'
  if (text.startsWith('sampler')) return 'text-sky-300'
  return 'text-gray-400'
}

const Skeleton = ({ jobId, status, job, paused = false, onTogglePause }) => {
  const [logsOpen, setLogsOpen] = useState(false)
  // Auto-scroll the modal log list to the latest line whenever new entries arrive
  const modalScrollRef = useRef(null)
  useEffect(() => {
    if (logsOpen && modalScrollRef.current) {
      modalScrollRef.current.scrollTop = modalScrollRef.current.scrollHeight
    }
  }, [logsOpen, job?.logs?.length])

  const allLogs = Array.isArray(job?.logs) ? job.logs : []
  const copy = STATUS_COPY[status] || STATUS_COPY.queued
  const ringColor = {
    cyan: 'border-cyan-500/40 border-t-cyan-400',
    fuchsia: 'border-fuchsia-500/40 border-t-fuchsia-400',
    amber: 'border-amber-400/40 border-t-amber-300',
  }[copy.tone] || 'border-cyan-500/40 border-t-cyan-400'

  // Tick once per second so the live ETA / elapsed values refresh
  useTick(true)

  // Progress math — startedAt + estimatedSeconds come from BE/worker
  const startedAt = job?.startedAt ? new Date(job.startedAt).getTime() : null
  const estTotal = Number(job?.estimatedSeconds) || null
  const elapsed = startedAt ? Math.max(0, (Date.now() - startedAt) / 1000) : 0
  const remaining = estTotal ? Math.max(0, estTotal - elapsed) : null
  const pct = (estTotal && elapsed > 0)
    ? Math.min(99, Math.round((elapsed / estTotal) * 100))
    : null

  const barColor = {
    cyan: 'from-cyan-500 to-blue-400',
    fuchsia: 'from-fuchsia-500 to-pink-400',
    amber: 'from-amber-400 via-rose-400 to-fuchsia-500',
  }[copy.tone] || 'from-cyan-500 to-blue-400'

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/40 overflow-hidden">
      <div className="aspect-[9/16] sm:aspect-video bg-gray-800/60 flex items-center justify-center relative overflow-hidden">
        {/* Subtle moving gradient backdrop */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-800/40 via-gray-900/40 to-gray-800/40 animate-pulse" />
        <div className="relative text-center space-y-3 px-6 max-w-sm w-full">
          <div className={`w-16 h-16 mx-auto rounded-full border-2 ${ringColor} animate-spin`} />
          <p className="text-gray-200 text-sm font-semibold">{copy.label}…</p>

          {job?.progressMessage ? (
            <p className="text-gray-300 text-xs leading-relaxed">{job.progressMessage}</p>
          ) : (
            <p className="text-gray-500 text-xs">{copy.hint}</p>
          )}

          {pct != null && (
            <>
              <div className="w-full h-1.5 rounded-full bg-gray-800 overflow-hidden">
                <div className={`h-full bg-gradient-to-r ${barColor} transition-all duration-1000 ease-linear`}
                  style={{ width: `${pct}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-gray-500 font-mono">
                <span>elapsed {fmtSec(elapsed)}</span>
                <span className="text-gray-300">{pct}%</span>
                <span>~{fmtSec(remaining)} left</span>
              </div>
            </>
          )}

          {pct == null && estTotal && (
            <p className="text-[10px] text-gray-600">
              ETA ~{fmtSec(estTotal)} once it picks up
            </p>
          )}

          {jobId && <p className="text-gray-700 text-[10px] font-mono break-all pt-1">{jobId}</p>}

          {/* Live log feed — fills the otherwise-empty bottom of the spinner card
              with a tall, scrollable, terminal-style activity stream. Click anywhere
              in the panel (or the Expand button) to open a full-height modal that
              shows the entire log history with timestamps. Pause/Resume halts the
              polling but the elapsed timer keeps running. */}
          {(allLogs.length > 0) || onTogglePause ? (
            <div className="mt-4 w-full">
              {onTogglePause && (
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider ${paused ? 'text-amber-400' : 'text-emerald-400'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${paused ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'}`} />
                    {paused ? 'paused' : 'live'} · {allLogs.length} {allLogs.length === 1 ? 'event' : 'events'}
                  </span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={(e) => { e.stopPropagation(); onTogglePause() }}
                      className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white transition-colors">
                      {paused ? <><CaretRightOutlined className="text-[9px]" /> Resume</>
                              : <><PauseOutlined className="text-[9px]" /> Pause</>}
                    </button>
                    {allLogs.length > 0 && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); setLogsOpen(true) }}
                        className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-cyan-500/40 hover:border-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 hover:text-cyan-200 transition-colors">
                        <ExpandAltOutlined className="text-[9px]" /> Expand
                      </button>
                    )}
                  </div>
                </div>
              )}
              {allLogs.length > 0 && (
                <button type="button" onClick={() => setLogsOpen(true)}
                  className="block w-full text-left rounded-xl bg-gradient-to-b from-black/70 to-black/40 border border-gray-800/80 hover:border-cyan-500/40 transition-colors overflow-hidden group">
                  <div className="max-h-72 sm:max-h-80 overflow-y-auto p-3">
                    <ul className="space-y-1">
                      {allLogs.slice(-22).map((entry, i) => (
                        <li key={`${entry?.ts || i}-${i}`}
                            className={`text-[11px] font-mono leading-relaxed break-all ${logTone(entry?.msg || '')}`}>
                          {entry?.msg || ''}
                        </li>
                      ))}
                    </ul>
                    {allLogs.length > 22 && (
                      <p className="text-[10px] text-gray-500 mt-2 text-center group-hover:text-cyan-300 transition-colors">
                        + {allLogs.length - 22} earlier events — click to view all
                      </p>
                    )}
                  </div>
                </button>
              )}
            </div>
          ) : null}

          {/* Full-history modal — opens when the user clicks the log panel or
              the Expand button. Auto-scrolls to the newest line when more
              events arrive while it's open. */}
          <Modal open={logsOpen} onCancel={() => setLogsOpen(false)} footer={null}
            width={760}
            styles={{
              content: { background: '#0b0f17', padding: 0, borderRadius: 16, border: '1px solid rgba(34,211,238,0.25)' },
              body: { padding: 0 },
              header: { display: 'none' },
              mask: { backdropFilter: 'blur(6px)' },
            }}
            closeIcon={null}
            centered>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800/80 bg-gradient-to-r from-cyan-500/10 via-fuchsia-500/5 to-transparent">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${paused ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'}`} />
                <h3 className="text-sm font-semibold text-white tracking-wide">
                  Worker activity · <span className="font-mono text-cyan-300">{jobId}</span>
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-gray-500">
                  {allLogs.length} {allLogs.length === 1 ? 'event' : 'events'}
                </span>
                {onTogglePause && (
                  <button type="button" onClick={onTogglePause}
                    className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white transition-colors">
                    {paused ? <><CaretRightOutlined className="text-[9px]" /> Resume</>
                            : <><PauseOutlined className="text-[9px]" /> Pause</>}
                  </button>
                )}
                <button type="button" onClick={() => setLogsOpen(false)}
                  className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded">
                  ✕
                </button>
              </div>
            </div>
            <div ref={modalScrollRef} className="max-h-[65vh] overflow-y-auto p-5 bg-[#06080d]">
              {allLogs.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-12">Waiting for the worker to emit its first event…</p>
              ) : (
                <ul className="space-y-1.5">
                  {allLogs.map((entry, i) => (
                    <li key={`${entry?.ts || i}-${i}`} className="flex gap-3 items-start">
                      <span className="text-[10px] font-mono text-gray-600 shrink-0 pt-0.5 select-none">
                        {fmtTs(entry?.ts)}
                      </span>
                      <span className={`text-[12px] font-mono leading-relaxed break-all ${logTone(entry?.msg || '')}`}>
                        {entry?.msg || ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Modal>
        </div>
      </div>
    </div>
  )
}

// ─── Generate tab ─────────────────────────────────────────
const GenerateTab = ({ today, setToday, onJobCompleted }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const [prompt, setPrompt] = useState('')
  const [provider, setProvider] = useState('zsky')
  const [model, setModel] = useState('ltx-video')
  const [duration, setDuration] = useState(5)
  const [resolution, setResolution] = useState('720p')
  const [aspectRatio, setAspectRatio] = useState('9:16')
  const [style, setStyle] = useState('cinematic')
  const [audio, setAudio] = useState(true)
  const [steps, setSteps] = useState(30)
  const [withCaption, setWithCaption] = useState(true)
  const [imageUrl, setImageUrl] = useState('')
  const [optimizedMode, setOptimizedMode] = useState('balanced')   // preview | balanced | quality
  const [withMusic, setWithMusic] = useState(false)
  const [musicPrompt, setMusicPrompt] = useState('')

  // Prompt helper modal — same Groq coach the other lanes use (Cinema, Audio).
  // State lives here so the user can close + reopen without losing context.
  const [helperOpen, setHelperOpen] = useState(false)
  const [coachIdea, setCoachIdea] = useState('')
  const [coachResult, setCoachResult] = useState(null)
  const [coachError, setCoachError] = useState('')

  const [loading, setLoading] = useState(false)
  const [job, setJob] = useState(null)
  const [video, setVideo] = useState(null)
  const [error, setError] = useState(null)
  const [workerOnline, setWorkerOnline] = useState(false)
  const [localOnline, setLocalOnline] = useState(false)
  const [copied, setCopied] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [logsPaused, setLogsPaused] = useState(false)
  const pollTimer = useRef(null)
  // Ref mirrors logsPaused so the setInterval closure reads fresh state
  // without needing to recreate the timer when the user toggles.
  const pausedRef = useRef(false)
  useEffect(() => { pausedRef.current = logsPaused }, [logsPaused])

  // Cinema → AI Video hand-off. When the user clicks "Render in AI Video" in
  // /cinema we redirect with ?prompt=...&provider=optimized&mode=balanced&music=1.
  // Apply those once on mount, then scrub the URL so a manual refresh doesn't
  // re-apply (otherwise the user's later tweaks to provider/prompt would be
  // silently overwritten on every reload).
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (!params.toString()) return
    const qPrompt   = params.get('prompt')
    const qProvider = params.get('provider')
    const qMode     = params.get('mode')
    const qMusic    = params.get('music')
    const qMusicPrompt = params.get('musicPrompt')
    if (qPrompt) setPrompt(qPrompt)
    if (qProvider && ['zsky', 'local', 'optimized'].includes(qProvider)) setProvider(qProvider)
    if (qMode && ['preview', 'balanced', 'quality'].includes(qMode)) setOptimizedMode(qMode)
    if (qMusic === '1' || qMusic === 'true') setWithMusic(true)
    if (qMusicPrompt) setMusicPrompt(qMusicPrompt)
    if (qPrompt || qProvider) {
      antMessage.success('Prompt loaded — review and hit Generate Video')
    }
    // Strip query string so future refreshes don't re-trigger the prefill.
    navigate(location.pathname, { replace: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Upload a local file → BE → Cloudinary → set imageUrl to the returned URL.
  // Cloudinary auto-converts HEIC, WEBP, BMP, etc. to JPG when delivered, so any
  // browser-readable image works with the worker downstream.
  const handleImageUpload = async (file) => {
    if (!file) return false
    if (file.size > 25 * 1024 * 1024) {
      antMessage.error('Image too large (max 25 MB)')
      return false
    }
    setUploadingImage(true)
    setError(null)
    const { data, error: err } = await uploadSourceImage(file)
    setUploadingImage(false)
    if (err) {
      antMessage.error(`Upload failed: ${err}`)
      return false
    }
    setImageUrl(data.url)
    antMessage.success('Image uploaded')
    return false   // false = don't let antd Upload also do its own POST
  }

  useEffect(() => {
    getVideoProviders().then(({ data }) => {
      if (!data) return
      setWorkerOnline(!!(data.workers?.worker?.online ?? data.workerOnline))
      setLocalOnline(!!data.workers?.local?.online)
    })

    // Resume an in-flight job after a page refresh. If the BE has it as
    // queued/processing → reattach the spinner + start polling. If it already
    // completed → show the finished video. If failed → surface the error.
    // If gone (404) → silently clear; the BE may have already evicted it.
    let inflight
    try { inflight = localStorage.getItem(INFLIGHT_JOB_KEY) } catch {}
    if (inflight) {
      getJobStatus(inflight).then(({ data, error: err }) => {
        if (err || !data) {
          try { localStorage.removeItem(INFLIGHT_JOB_KEY) } catch {}
          return
        }
        if (data.status === 'completed' && data.videoUrl) {
          try { localStorage.removeItem(INFLIGHT_JOB_KEY) } catch {}
          setVideo(data)
          if (!today) setToday(data)
        } else if (data.status === 'failed') {
          try { localStorage.removeItem(INFLIGHT_JOB_KEY) } catch {}
          setError(data.error || 'Generation failed')
        } else {
          // queued or processing — reattach
          setJob(data); setLoading(true); startPolling(inflight)
        }
      })
    }

    return () => { if (pollTimer.current) clearInterval(pollTimer.current) }
  }, [])

  // Reset model to the first usable option when provider changes
  useEffect(() => {
    const list = MODELS_BY_PROVIDER[provider] || []
    const firstUsable = list.find(m => !m.disabled) || list[0]
    if (firstUsable) setModel(firstUsable.value)
  }, [provider])

  // Auto-update step count to the model's recommended default when model changes.
  // (User can still override via the Steps dropdown afterwards.)
  useEffect(() => {
    if (provider !== 'local') return
    const def = MODEL_DEFAULT_STEPS[model]
    if (def) setSteps(def)
  }, [model, provider])

  const startPolling = (jobId) => {
    if (pollTimer.current) clearInterval(pollTimer.current)
    let attempts = 0
    pollTimer.current = setInterval(async () => {
      // User-controlled pause — polling halts, elapsed timer keeps ticking via
      // its own clock so the spinner still shows "live" duration. Resume just
      // re-enters this branch on the next interval tick (no restart needed).
      if (pausedRef.current) return
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
        try { localStorage.removeItem(INFLIGHT_JOB_KEY) } catch {}
        setVideo(data); setLoading(false)
        if (!today) setToday(data)
        onJobCompleted?.()
      } else if (data.status === 'failed') {
        clearInterval(pollTimer.current); pollTimer.current = null
        try { localStorage.removeItem(INFLIGHT_JOB_KEY) } catch {}
        setLoading(false); setError(data.error || 'Generation failed')
      }
      if (attempts > 1200) {
        clearInterval(pollTimer.current); pollTimer.current = null
        setLoading(false); setError('Timed out waiting for the job')
      }
    }, 1500)   // tighter poll so the log feed and progress bar feel live
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
      steps,
      style: caps.style ? style : '',
      audio: caps.audio ? audio : false,
      imageUrl: caps.imageUrl ? imageUrl.trim() : '',
      generateCaption: withCaption,
      mode: provider === 'optimized' ? optimizedMode : undefined,
      withMusic: (provider === 'optimized' || provider === 'local') ? withMusic : false,
      musicPrompt: withMusic ? musicPrompt.trim() : '',
    })
    if (err) { setLoading(false); setError(err); return }

    if (data?.status === 'completed' && data?.videoUrl) {
      // ZSky sync path
      setVideo(data); setLoading(false)
      if (!today) setToday(data)
      onJobCompleted?.()
    } else if (data?.jobId) {
      // Worker async path — persist the jobId so a page refresh can resume the
      // spinner + log feed instead of dropping the user mid-flight.
      try { localStorage.setItem(INFLIGHT_JOB_KEY, data.jobId) } catch {}
      setJob(data); startPolling(data.jobId)
    } else {
      setLoading(false); setError('Unexpected backend response')
    }
  }

  const cancel = () => {
    if (pollTimer.current) clearInterval(pollTimer.current)
    pollTimer.current = null
    try { localStorage.removeItem(INFLIGHT_JOB_KEY) } catch {}
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
    <>
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
                <button key={p.id} onClick={() => !p.disabled && setProvider(p.id)} type="button"
                  aria-pressed={active}
                  aria-disabled={!!p.disabled}
                  disabled={!!p.disabled}
                  className={`relative p-4 rounded-xl border text-left transition-all duration-200 overflow-hidden ${
                    p.disabled
                      ? 'border-2 border-gray-900 bg-gray-900/30 opacity-50 cursor-not-allowed grayscale'
                      : active
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
                7 models live: LTX, Wan 2.1, Wan 2.1 I2V, Wan 2.2, Hunyuan, Mochi, SVD-XT.
              </p>
            </div>
          )}

          {provider === 'optimized' && (
            <div className="mt-3 space-y-2">
              <label className="text-[10px] text-gray-500 block uppercase tracking-wider">
                Speed mode
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {OPTIMIZED_MODES.map(m => {
                  const active = optimizedMode === m.id
                  return (
                    <button key={m.id} onClick={() => setOptimizedMode(m.id)} type="button"
                      className={`p-2.5 rounded-lg border text-left transition-all ${
                        active
                          ? `border-cyan-300/70 bg-gradient-to-br ${m.accent} bg-opacity-10 shadow-md`
                          : 'border-gray-800 bg-gray-900/40 hover:border-gray-700 hover:bg-gray-900'
                      }`}>
                      <div className="flex items-baseline justify-between mb-0.5">
                        <span className={`text-xs font-semibold ${active ? 'text-white' : 'text-gray-200'}`}>
                          {m.label}
                        </span>
                        <span className={`text-[9px] font-mono ${active ? 'text-white/80' : 'text-gray-500'}`}>
                          {m.target}
                        </span>
                      </div>
                      <p className={`text-[10px] leading-snug ${active ? 'text-white/70' : 'text-gray-500'}`}>
                        {m.desc}
                      </p>
                    </button>
                  )
                })}
              </div>
              <p className="text-[10px] text-gray-600">
                Optimized lane uses distilled checkpoints, lower frame counts, and cache acceleration where supported.
                Steps / resolution / duration are auto-tuned per mode — override below if you want.
              </p>
            </div>
          )}

          {/* Background music — 5090 lanes only. Worker generates audio via
              MusicGen on the local GPU and ffmpeg-muxes it into the mp4. */}
          {(provider === 'local' || provider === 'optimized') && (
            <div className="mt-4 p-3 rounded-lg border border-gray-800 bg-gray-900/40">
              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span className="flex items-center gap-2">
                  <span className="text-base">🎵</span>
                  <span className="text-xs font-semibold text-gray-200">Add background music</span>
                  <span className="text-[10px] text-gray-500">+10-30s · MusicGen on 5090</span>
                </span>
                <Switch size="small" checked={withMusic} onChange={setWithMusic} />
              </label>
              {withMusic && (
                <div className="mt-2 space-y-1">
                  <Input.TextArea
                    value={musicPrompt} onChange={e => setMusicPrompt(e.target.value)}
                    autoSize={{ minRows: 2, maxRows: 4 }}
                    placeholder="e.g. 'cinematic orchestral build, slow cellos, hopeful' — leave blank to auto-derive from the video prompt"
                    maxLength={400}
                  />
                </div>
              )}
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
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider">2 — Describe your video</p>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => setHelperOpen(true)}
                    title="AI prompt helper + sample prompts"
                    className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-amber-500/40 hover:border-amber-400 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 transition-colors">
                    <BulbOutlined className="text-[10px]" /> Help me write
                  </button>
                  {prompt && (
                    <button type="button" onClick={() => setPrompt('')}
                      className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors">
                      clear
                    </button>
                  )}
                </div>
              </div>
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
            const showImage = provImg && (!mc || mc.i2v)
            if (!showImage) return null
            const required = mc?.imageRequired
            return (
              <div className="mt-3">
                <label className="text-[10px] text-gray-500 block mb-1 uppercase tracking-wider">
                  Source image
                  <span className={`normal-case ml-1 ${required ? 'text-rose-400' : 'text-gray-700'}`}>
                    — {required ? 'required' : 'optional, animates a still photo'}
                  </span>
                </label>
                <div className="flex gap-2">
                  <Input value={imageUrl} onChange={e => setImageUrl(e.target.value)}
                    placeholder="paste a URL or upload from your device →" allowClear
                    status={required && !imageUrl.trim() ? 'warning' : undefined} />
                  <Upload
                    accept="image/*,.heic,.heif"
                    showUploadList={false}
                    beforeUpload={handleImageUpload}>
                    <Button icon={<UploadOutlined />} loading={uploadingImage}>
                      {uploadingImage ? 'Uploading' : 'Upload'}
                    </Button>
                  </Upload>
                </div>
                {imageUrl && (
                  <div className="mt-2 flex items-center gap-2">
                    <img src={imageUrl} alt="source preview"
                      className="w-16 h-16 object-cover rounded-md border border-gray-700"
                      onError={(e) => { e.currentTarget.style.display = 'none' }} />
                    <span className="text-[10px] text-gray-500 break-all">{imageUrl.slice(0, 80)}{imageUrl.length > 80 ? '…' : ''}</span>
                  </div>
                )}
                <p className="text-[10px] text-gray-600 mt-1">
                  Accepts JPG, PNG, WEBP, HEIC, BMP — any image your browser can read.
                </p>
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
            {provider === 'local' && (
              <div>
                <label className="text-[10px] text-gray-500 block mb-1 uppercase tracking-wider">Steps</label>
                <Select size="middle" value={steps} onChange={setSteps} style={{ width: '100%' }}
                  popupMatchSelectWidth={false}
                  options={[
                    { value: 20, label: '20 — fast' },
                    { value: 30, label: '30 — default' },
                    { value: 40, label: '40 — sharper' },
                    { value: 50, label: '50 — slow, max quality' },
                  ]} />
              </div>
            )}
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

        <div className="relative overflow-hidden rounded-xl border border-amber-400/25 bg-gradient-to-br from-amber-500/[0.06] via-rose-500/[0.05] to-fuchsia-500/[0.06]">
          <div aria-hidden className="absolute -top-12 -right-12 w-44 h-44 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />
          <div aria-hidden className="absolute -bottom-16 -left-12 w-44 h-44 bg-fuchsia-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative p-3.5 flex items-start gap-3">
            <div className="shrink-0 mt-0.5 w-7 h-7 rounded-full bg-gradient-to-br from-amber-300 via-rose-400 to-fuchsia-500 flex items-center justify-center shadow-md shadow-rose-500/20">
              <ThunderboltOutlined className="text-black text-xs" />
            </div>
            <div className="text-[11px] leading-relaxed">
              <p className="mb-0.5">
                <span className="font-semibold bg-gradient-to-r from-amber-200 via-rose-200 to-fuchsia-300 bg-clip-text text-transparent tracking-wide">
                  5090 Beast
                </span>
                <span className="text-gray-500"> · the personal lane</span>
              </p>
              <p className="text-gray-400">
                Real RTX 5090 in Siddharth's home, polling for jobs in real time. Renders the same workflows that ship in ComfyUI's official examples — LTX, Wan, Hunyuan, Mochi, SVD —
                with thermal-managed power capping and live progress streaming back to this page.
              </p>
              <p className="text-[10px] text-gray-600 mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                <span>· status dot on each card shows live availability</span>
                <span>· capped at {`${import.meta.env.VITE_GPU_POWER_LIMIT_W || 525}W`} for cool-running stability</span>
              </p>
            </div>
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
                job={job}
                status={
                  job?.status ||
                  (provider === 'zsky'      ? 'zsky_running' :
                   provider === 'local'     ? 'local_queued' :
                   provider === 'optimized' ? 'local_queued' :
                   'queued')
                }
                paused={logsPaused}
                onTogglePause={
                  // Only show the pause button for the 5090 lanes — ZSky is so
                  // fast (sub-30s) that pausing is meaningless, and Lightning's
                  // worker doesn't emit logs.
                  (provider === 'local' || provider === 'optimized')
                    ? () => setLogsPaused(p => !p)
                    : undefined
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

    <PromptHelper
      open={helperOpen} onClose={() => setHelperOpen(false)}
      family="video" currentPrompt={prompt}
      idea={coachIdea} setIdea={setCoachIdea}
      coachResult={coachResult} setCoachResult={setCoachResult}
      coachError={coachError} setCoachError={setCoachError}
      onApply={(text) => { setPrompt(text); setHelperOpen(false) }}
      onAppend={(text) => setPrompt(prompt.trim() ? `${prompt.trim()}, ${text}` : text)}
    />
    </>
  )
}

// ─── Library tab — paginated, no eager video loads ─────────
const LibraryCard = ({ video, onClick, onDelete, selectMode, isSelected, onToggleSelect }) => {
  const provColor =
    video.provider === 'zsky'  ? 'from-sky-500 to-blue-400' :
    video.provider === 'local' ? 'from-amber-400 via-rose-400 to-fuchsia-500' :
                                 'from-emerald-500 to-cyan-400'
  const date = new Date(video.createdAt)
  const dateLabel = isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const thumb = thumbFromVideo(resolveVideoUrl(video.videoUrl))

  const handleClick = () => {
    if (selectMode) onToggleSelect?.(video.videoId)
    else onClick?.()
  }

  return (
    <div className={`group relative rounded-xl overflow-hidden border bg-gray-900/50 hover:bg-gray-900 transition-all ${
      isSelected
        ? 'border-cyan-400 ring-2 ring-cyan-400/40'
        : 'border-gray-800 hover:border-gray-700'
    }`}>
      <button onClick={handleClick} className="w-full text-left">
        <div className="relative aspect-[9/16] bg-gradient-to-br from-gray-800/80 to-gray-950 overflow-hidden">
          {thumb ? (
            <img src={thumb} alt={video.prompt} loading="lazy"
              className={`w-full h-full object-cover transition-transform duration-300 ${
                isSelected ? 'scale-95 opacity-80' : 'group-hover:scale-105'
              }`} />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <PlayCircleOutlined className="text-4xl text-gray-700" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/30 opacity-100 group-hover:from-black/40 transition-opacity" />
          {!selectMode && (
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <PlayCircleOutlined className="text-5xl text-white drop-shadow-lg" />
            </div>
          )}
          <div className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-gradient-to-r ${provColor} text-black`}>
            {video.provider}
          </div>
          {dateLabel && (
            <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full text-[9px] bg-black/60 text-gray-300 border border-white/10">
              {dateLabel}
            </div>
          )}
          {selectMode && (
            <div className={`absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-md border-2 transition-all ${
              isSelected
                ? 'bg-cyan-400 border-cyan-400 text-black'
                : 'bg-black/60 border-white/40 text-transparent'
            }`}>
              <CheckOutlined className="text-[12px] font-bold" />
            </div>
          )}
        </div>
        <div className="p-2.5">
          <p className="text-xs text-gray-200 line-clamp-2 leading-snug min-h-[2.4em]">
            {video.prompt}
          </p>
        </div>
      </button>
      {!selectMode && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete?.(video) }}
          title="Delete video"
          className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-black/60 hover:bg-rose-600 text-gray-300 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <DeleteOutlined className="text-xs" />
        </button>
      )}
    </div>
  )
}

// ─── Jobs tab ─────────────────────────────────────────────
// Unified view across queued / processing / completed / failed.
// Reads from `GET /api/ai-video/jobs` (SQLite-backed, paginated, gzipped).
// Cards stream live updates only while user is on this tab — refresh on
// status filter change, page change, or every 4s if there are still active
// jobs (queued/processing). Completed-only view = no polling at all.
const JOB_STATUS_META = {
  queued:     { tone: 'amber',   ring: 'border-amber-400/60',   chip: 'bg-amber-500/15 text-amber-300 border-amber-500/40',   icon: '⏳', label: 'Queued' },
  processing: { tone: 'cyan',    ring: 'border-cyan-400/70',    chip: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40',     icon: '⚡', label: 'Processing' },
  completed:  { tone: 'emerald', ring: 'border-emerald-500/50', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', icon: '✓', label: 'Completed' },
  failed:     { tone: 'rose',    ring: 'border-rose-500/60',    chip: 'bg-rose-500/15 text-rose-300 border-rose-500/40',     icon: '✗', label: 'Failed' },
}

const LANE_COPY = {
  optimized: { label: '5090 Optimized', bg: 'from-cyan-300 via-fuchsia-400 to-purple-500' },
  local:     { label: '5090 Beast',     bg: 'from-amber-400 via-rose-400 to-fuchsia-500' },
  worker:    { label: 'GPU Worker',     bg: 'from-emerald-500 to-cyan-400' },
  zsky:      { label: 'ZSky',           bg: 'from-sky-500 to-blue-400' },
}

const JobCard = ({ job }) => {
  const meta = JOB_STATUS_META[job.status] || JOB_STATUS_META.queued
  const lane = LANE_COPY[job.lane] || { label: job.lane || '?', bg: 'from-gray-500 to-gray-600' }
  const created = job.createdAt ? new Date(job.createdAt) : null
  const ago = created ? timeAgo(created) : ''
  const errShort = (job.error || '').slice(0, 120)

  return (
    <div className={`group relative rounded-2xl border ${meta.ring} bg-gradient-to-b from-gray-900/70 to-gray-950/50 overflow-hidden transition-all hover:scale-[1.01] hover:shadow-xl`}>
      <div className="aspect-video bg-black/40 relative overflow-hidden">
        {job.status === 'completed' && job.videoUrl ? (
          <video src={job.videoUrl} muted loop playsInline
            onMouseEnter={(e) => e.currentTarget.play().catch(()=>{})}
            onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0 }}
            className="w-full h-full object-cover" />
        ) : (
          <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${lane.bg} opacity-30`}>
            <span className="text-5xl opacity-60">{meta.icon}</span>
          </div>
        )}
        <div className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${meta.chip}`}>
          {meta.icon} {meta.label}
        </div>
        <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider bg-gradient-to-r ${lane.bg} text-black`}>
          {lane.label}
        </div>
      </div>
      <div className="p-3 space-y-1.5">
        <p className="text-xs text-gray-200 line-clamp-2 leading-snug min-h-[2.4em]">
          {job.prompt || '(no prompt)'}
        </p>
        <div className="flex items-center justify-between text-[10px] text-gray-500 font-mono">
          <span>{job.model || '?'} · {job.duration ?? '?'}s · {job.resolution}</span>
          <span>{ago}</span>
        </div>
        {job.status === 'failed' && errShort && (
          <p className="text-[10px] text-rose-400/80 font-mono line-clamp-2 pt-1 border-t border-rose-500/20">
            ✗ {errShort}
          </p>
        )}
      </div>
    </div>
  )
}

const timeAgo = (date) => {
  const sec = Math.floor((Date.now() - date.getTime()) / 1000)
  if (sec < 60) return `${sec}s ago`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  return `${Math.floor(sec / 86400)}d ago`
}

const JobsTab = ({ refreshKey }) => {
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ items: [], total: 0, pages: 1, counts: { queued: 0, processing: 0, completed: 0, failed: 0 } })
  const [loading, setLoading] = useState(true)

  // Reset page on filter change so we don't paginate to ghost pages
  useEffect(() => { setPage(1) }, [statusFilter, refreshKey])

  // Fetch on mount + on dependency change. Auto-refresh every 4s ONLY if
  // there are active (queued/processing) jobs visible — otherwise idle.
  useEffect(() => {
    let cancelled = false
    const fetchPage = async () => {
      const { data: result } = await listJobs({ status: statusFilter, page, limit: 24 })
      if (cancelled) return
      if (result) setData(result)
      setLoading(false)
    }
    setLoading(true)
    fetchPage()

    // Tick if active work is in flight
    const hasActive = (data.counts?.queued || 0) + (data.counts?.processing || 0) > 0
    if (!hasActive) return () => { cancelled = true }
    const iv = setInterval(fetchPage, 4000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [statusFilter, page, refreshKey, data.counts?.queued, data.counts?.processing])

  const filters = [
    { v: 'all',        label: 'All',        n: data.counts ? (data.counts.queued + data.counts.processing + data.counts.completed + data.counts.failed) : null },
    { v: 'queued',     label: 'Queued',     n: data.counts?.queued },
    { v: 'processing', label: 'Processing', n: data.counts?.processing },
    { v: 'completed',  label: 'Completed',  n: data.counts?.completed },
    { v: 'failed',     label: 'Failed',     n: data.counts?.failed },
  ]

  return (
    <div className="space-y-5">
      {/* Filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        {filters.map(f => {
          const active = statusFilter === f.v
          const meta = JOB_STATUS_META[f.v]
          return (
            <button key={f.v} onClick={() => setStatusFilter(f.v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                active
                  ? meta ? meta.chip : 'bg-cyan-600/20 text-cyan-300 border-cyan-500/40'
                  : 'bg-gray-800/60 hover:bg-gray-800 text-gray-400 border-transparent hover:border-gray-700'
              }`}>
              {meta && <span>{meta.icon}</span>}
              <span>{f.label}</span>
              {f.n != null && <span className="text-[10px] opacity-70 font-mono">({f.n})</span>}
            </button>
          )
        })}
      </div>

      {/* Cards grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="aspect-[4/3] rounded-2xl bg-gray-900/40 animate-pulse" />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <div className="py-16 text-center text-gray-500 text-sm">
          No {statusFilter === 'all' ? '' : statusFilter} jobs yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.items.map(j => <JobCard key={`${j.src}-${j.videoId}-${j.ts}`} job={j} />)}
        </div>
      )}

      {/* Pagination */}
      {data.pages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed">
            <LeftOutlined />
          </button>
          <span className="text-xs text-gray-500 font-mono">{page} / {data.pages}</span>
          <button onClick={() => setPage(p => Math.min(data.pages, p + 1))} disabled={page === data.pages}
            className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed">
            <RightOutlined />
          </button>
        </div>
      )}
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
  // Multi-select state
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  // Reset selection when leaving select mode or paging
  useEffect(() => { if (!selectMode) setSelectedIds(new Set()) }, [selectMode])
  useEffect(() => { setSelectedIds(new Set()) }, [page, filter, refreshKey])

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllOnPage = () => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      data.items.forEach(it => next.add(it.videoId))
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  const askDeleteSelected = () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    Modal.confirm({
      title: `Delete ${ids.length} video${ids.length === 1 ? '' : 's'}?`,
      content: (
        <p className="text-xs text-gray-500">
          Permanently removes them from Cloudinary. Can't be undone.
        </p>
      ),
      okText: `Delete ${ids.length}`,
      okButtonProps: { danger: true },
      cancelText: 'Keep',
      centered: true,
      onOk: async () => {
        setBulkDeleting(true)
        const results = await Promise.allSettled(ids.map(id => deleteVideo(id)))
        const failed = results.filter(r => r.status === 'rejected' || r.value?.error)
        setBulkDeleting(false)
        setSelectedIds(new Set())
        setSelectMode(false)
        setInternalReload(n => n + 1)
        if (failed.length > 0) {
          Modal.error({
            title: `${failed.length} of ${ids.length} failed to delete`,
            content: 'The rest were removed. Check console for details.',
          })
        }
      },
    })
  }

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

  // Library provider filters. 'optimized' and 'local' both run on the same
  // physical 5090, but the BE now persists the original FE provider on the
  // job's Cloudinary context so we can split them visually here.
  const filters = [
    { v: 'all',       label: 'All' },
    { v: 'zsky',      label: 'ZSky' },
    { v: 'optimized', label: '5090 Optimized' },
    { v: 'local',     label: '5090 Beast' },
    { v: 'worker',    label: 'GPU Worker' },
  ]

  const allOnPageSelected = data.items.length > 0 && data.items.every(it => selectedIds.has(it.videoId))

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
        <div className="flex items-center gap-2 flex-wrap">
          {!selectMode ? (
            <>
              <span className="text-[11px] text-gray-500">
                {data.total > 0 ? `${data.total} video${data.total === 1 ? '' : 's'}` : ''}
              </span>
              {data.items.length > 0 && (
                <Button size="small" onClick={() => setSelectMode(true)}>Select</Button>
              )}
            </>
          ) : (
            <>
              <span className="text-[11px] text-cyan-300">
                {selectedIds.size} selected
              </span>
              <Button size="small" onClick={allOnPageSelected ? clearSelection : selectAllOnPage}>
                {allOnPageSelected ? 'Clear' : 'Select all on page'}
              </Button>
              <Button size="small" danger
                disabled={selectedIds.size === 0}
                loading={bulkDeleting}
                icon={<DeleteOutlined />}
                onClick={askDeleteSelected}>
                Delete ({selectedIds.size})
              </Button>
              <Button size="small" type="text" onClick={() => setSelectMode(false)}>
                Cancel
              </Button>
            </>
          )}
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
                selectMode={selectMode}
                isSelected={selectedIds.has(item.videoId)}
                onToggleSelect={toggleSelect}
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
              key: 'jobs',
              label: <span><InfoCircleOutlined /> Jobs</span>,
              children: <JobsTab refreshKey={refreshKey} />,
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
