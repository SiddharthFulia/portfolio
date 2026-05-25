import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Input, Button, Select, Switch, Tabs, Modal, Upload, Alert } from 'antd'

import { notice } from '../lib/notice'
// Cinema lives inside this page as a tab. Lazy-loaded so the Cinema
// bundle only ships when the user actually opens the tab.
const Cinema = lazy(() => import('./Cinema'))
import {
  VideoCameraOutlined, ThunderboltOutlined, CopyOutlined, CheckOutlined,
  DownloadOutlined, ReloadOutlined, LinkOutlined, InfoCircleOutlined, AppstoreOutlined,
  PlayCircleOutlined, LeftOutlined, RightOutlined, ExpandAltOutlined, PauseOutlined,
  CaretRightOutlined, BulbOutlined, CustomerServiceOutlined, BookOutlined, ToolOutlined,
  FullscreenOutlined, GlobalOutlined, LockOutlined, PictureOutlined,
} from '@ant-design/icons'
import {
  generateVideo, getJobStatus, getTodayVideo, getVideoProviders, listVideos, deleteVideo,
  uploadSourceImage, listJobs, listEnhancedImages,
} from '../api/ai'
import { getVaultToken } from '../components/VaultGate'
import { UploadOutlined } from '@ant-design/icons'
import { DeleteOutlined } from '@ant-design/icons'
import PromptHelper from '../components/PromptHelper'
import useQueryState from '../hooks/useQueryState'
import JobLogsAgentPlan from '../components/JobLogsAgentPlan'
import VideoCombiner from '../components/aiVideo/VideoCombiner'

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
    desc: 'Hosted • ~60-90s',
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
    cyan: 'bg-cyan-500',
    pink: 'bg-amber-500',
  }
  if (!video?.videoUrl) return null
  return (
    <div className="rounded-lg overflow-hidden border border-gray-800 bg-gray-900/60">
      <div className="relative bg-black">
        <video src={resolveVideoUrl(video.videoUrl)} controls playsInline loop muted={compact}
          className={`w-full ${compact ? 'aspect-[9/16] object-cover' : 'max-h-[70vh] object-contain'}`} />
        <div className={`absolute top-2 left-2 px-2.5 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wider ${tones[tone]} text-black`}>
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
  if (text.startsWith('→') || text.startsWith('↑')) return 'text-amber-300'
  if (text.startsWith('sampler')) return 'text-sky-300'
  return 'text-gray-400'
}

const Skeleton = ({ jobId, status, job, paused = false, onTogglePause }) => {
  const [logsOpen, setLogsOpen] = useState(false)
  // Toggle between the classic flat log list and the AgentPlan tree view.
  // Default is 'plan' — same tree the deepfake / mesh / voice clones use,
  // which scans cleanly and never cuts off content like the flat view did.
  const [logsView, setLogsView] = useState('plan')
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
    fuchsia: 'border-amber-500/40 border-t-amber-400',
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
    cyan: 'bg-cyan-500',
    fuchsia: 'bg-amber-500',
    amber: 'bg-amber-500',
  }[copy.tone] || 'bg-cyan-500'

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/40 overflow-hidden">
      <div className="aspect-[9/16] sm:aspect-video bg-gray-800/60 flex items-center justify-center relative overflow-hidden">
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
                <div className={`h-full ${barColor} transition-all duration-1000 ease-linear`}
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
                    {/* Logs view toggle — flips between the flat tail and the AgentPlan tree. */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setLogsView(v => v === 'flat' ? 'plan' : 'flat')
                      }}
                      className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-lg border border-amber-500/40 hover:border-amber-400 bg-amber-500/12 hover:bg-amber-500/20 text-amber-300 hover:text-amber-200 transition-colors"
                      title={logsView === 'flat' ? 'Switch to Plan view' : 'Switch to Logs view'}
                    >
                      {logsView === 'flat' ? 'Plan' : 'Logs'}
                    </button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); onTogglePause() }}
                      className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-lg border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white transition-colors">
                      {paused ? <><CaretRightOutlined className="text-[9px]" /> Resume</>
                              : <><PauseOutlined className="text-[9px]" /> Pause</>}
                    </button>
                    {allLogs.length > 0 && logsView === 'flat' && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); setLogsOpen(true) }}
                        className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-lg border border-cyan-500/40 hover:border-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 hover:text-cyan-200 transition-colors">
                        <ExpandAltOutlined className="text-[9px]" /> Expand
                      </button>
                    )}
                  </div>
                </div>
              )}
              {/* Plan view — synthesised AgentPlan tree powered by /api/job-logs. */}
              {logsView === 'plan' && jobId && (
                <div onClick={(e) => e.stopPropagation()}>
                  <JobLogsAgentPlan
                    lane="video"
                    jobId={jobId}
                    status={status}
                    progressMessage={job?.progressMessage}
                    error={job?.error}
                  />
                </div>
              )}
              {logsView === 'flat' && allLogs.length > 0 && (
                <button type="button" onClick={() => setLogsOpen(true)}
                  className="block w-full text-left rounded-lg bg-black/60 border border-gray-800/80 hover:border-cyan-500/40 transition-colors overflow-hidden group">
                  {/* Bumped max-h so 22 lines breathe. Old 72/80 (288/320px)
                      cut off mid-message on long ComfyUI status lines. */}
                  <div className="max-h-[28rem] sm:max-h-[34rem] overflow-y-auto p-3">
                    <ul className="space-y-1">
                      {allLogs.slice(-40).map((entry, i) => (
                        <li key={`${entry?.ts || i}-${i}`}
                            className={`text-[11px] font-mono leading-relaxed break-all ${logTone(entry?.msg || '')}`}>
                          {entry?.msg || ''}
                        </li>
                      ))}
                    </ul>
                    {allLogs.length > 40 && (
                      <p className="text-[10px] text-gray-500 mt-2 text-center group-hover:text-cyan-300 transition-colors">
                        + {allLogs.length - 40} earlier events — click to view all
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
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800/80 bg-cyan-500/8">
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
                    className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white transition-colors">
                    {paused ? <><CaretRightOutlined className="text-[9px]" /> Resume</>
                            : <><PauseOutlined className="text-[9px]" /> Pause</>}
                  </button>
                )}
                <button type="button" onClick={() => setLogsOpen(false)}
                  className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded inline-flex items-center"
                  aria-label="Close">
                  ×
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
  // All the card-style selectors below mirror to the URL via useQueryState
  // so a refresh keeps the user on the same "5090 Optimized · Balanced ·
  // 9:16 · 720p" combo they picked, instead of snapping back to the
  // hardcoded defaults. Default values are omitted from the URL by the
  // hook so /ai-video stays clean when nothing's customised.
  const [provider, setProvider]         = useQueryState('provider',   'zsky',       { allowed: ['zsky', 'local', 'optimized'] })
  const [model, setModel]               = useQueryState('model',      'ltx-video')
  const [duration, setDuration]         = useQueryState('duration',   5,            { parse: Number })
  const [resolution, setResolution]     = useQueryState('resolution', '720p',       { allowed: ['480p', '720p', '1080p'] })
  const [aspectRatio, setAspectRatio]   = useQueryState('aspect',     '9:16',       { allowed: ['9:16', '16:9', '1:1', '21:9'] })
  const [style, setStyle]               = useQueryState('style',      'cinematic')
  const [audio, setAudio]               = useQueryState('audio',      true,         { parse: (s) => s === '1', serialize: (v) => v ? '1' : '0' })
  const [steps, setSteps]               = useQueryState('steps',      30,           { parse: Number })
  const [withCaption, setWithCaption]   = useQueryState('caption',    true,         { parse: (s) => s === '1', serialize: (v) => v ? '1' : '0' })
  const [imageUrl, setImageUrl]         = useState('')
  // sourceIsVault — true when the source image came from a Vault library
  // item (or arrived with ?vault=1). Propagated to the generate call so
  // the resulting video lands in Vault rather than the public library.
  // Auto-resets to false when the user clears the imageUrl.
  const [sourceIsVault, setSourceIsVault] = useState(false)
  const [optimizedMode, setOptimizedMode] = useQueryState('mode', 'balanced', { allowed: ['preview', 'balanced', 'quality'] })

  // Legacy URL helper — kept for the existing prefill effect at the top
  // of the component. New per-field selections use useQueryState above
  // which writes to the URL automatically; no need for the manual call
  // on each setter anymore.
  const setUrlParam = (key, value) => {
    const next = new URLSearchParams(window.location.search)
    if (value != null && value !== '' && value !== false) next.set(key, String(value))
    else next.delete(key)
    navigate({ search: next.toString() ? `?${next.toString()}` : '' }, { replace: true })
  }
  const [withMusic, setWithMusic] = useQueryState('music', false, { parse: (s) => s === '1', serialize: (v) => v ? '1' : '0' })
  const [musicPrompt, setMusicPrompt] = useState('')
  // Image Studio library picker modal — opens from the "🖼 From Library"
  // button next to the source-image Upload control.
  const [libraryOpen, setLibraryOpen] = useState(false)

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
    // Hand-offs: Deepfake + Image Studio both navigate here with the
    // generated image's URL pre-filled. fromDeepfake / fromImage toast
    // confirms which lane sent us. vault=1 marks the source as Vault so
    // the resulting video lands in the private library.
    const qImage      = params.get('image')
    const fromDeepfake = params.get('fromDeepfake') === '1'
    const fromImage    = params.get('fromImage') === '1'
    const qVault       = params.get('vault') === '1'
    if (qPrompt) setPrompt(qPrompt)
    if (qProvider && ['zsky', 'local', 'optimized'].includes(qProvider)) setProvider(qProvider)
    if (qMode && ['preview', 'balanced', 'quality'].includes(qMode)) setOptimizedMode(qMode)
    if (qMusic === '1' || qMusic === 'true') setWithMusic(true)
    if (qMusicPrompt) setMusicPrompt(qMusicPrompt)
    if (qImage) setImageUrl(qImage)
    if (qVault) setSourceIsVault(true)
    if (fromDeepfake) {
      notice.info('Imported from Deepfake Studio — image pre-filled.')
    } else if (fromImage) {
      notice.info(qVault
        ? 'Imported from Image Studio (Vault) — output will save to Vault.'
        : 'Imported from Image Studio — image pre-filled.')
    } else if (qPrompt || qProvider) {
      notice.success('Prompt loaded — review and hit Generate Video')
    }
    // Strip one-shot hand-off flags (fromDeepfake / fromImage) so a refresh
    // doesn't re-toast. Keep prompt / provider / mode / music / model in the
    // URL so the current configuration is visible + shareable.
    const stripped = new URLSearchParams(location.search)
    stripped.delete('fromDeepfake')
    stripped.delete('fromImage')
    stripped.delete('vault')
    navigate({ search: stripped.toString() ? `?${stripped.toString()}` : '' }, { replace: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Upload a local file → BE → Cloudinary → set imageUrl to the returned URL.
  // Cloudinary auto-converts HEIC, WEBP, BMP, etc. to JPG when delivered, so any
  // browser-readable image works with the worker downstream.
  const handleImageUpload = async (file) => {
    if (!file) return false
    if (file.size > 25 * 1024 * 1024) {
      notice.error('Image too large (max 25 MB)')
      return false
    }
    setUploadingImage(true)
    setError(null)
    const { data, error: err } = await uploadSourceImage(file)
    setUploadingImage(false)
    if (err) {
      notice.error(`Upload failed: ${err}`)
      return false
    }
    setImageUrl(data.url)
    notice.success('Image uploaded')
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
      // Inherits the Vault flag from the source image (if it came from
      // Image Studio's vault library) so the output video lands in
      // Vault too. Honoured by the BE only when a Vault token is present.
      vault: sourceIsVault && !!imageUrl.trim(),
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
    // Keep jobId in localStorage so "Watch logs again" + page refresh both
    // know where to re-attach. We just stop polling; the job is still
    // running on the worker and will eventually complete.
    setLoading(false)
    // job state stays so the Watch-again button can read job.jobId
  }

  // Re-attach to the inflight job after a Stop-watching. Or hop over to the
  // dedicated detail page for the full history view — `/ai-video/:videoId`
  // renders status + complete log feed + back link.
  const resumeWatching = () => {
    const jobId = job?.jobId || job?.videoId
    if (!jobId) return
    setError(null); setLoading(true)
    startPolling(jobId)
  }
  const openJobDetail = () => {
    const jobId = job?.jobId || job?.videoId
    if (!jobId) return
    navigate(`/ai-video/${encodeURIComponent(jobId)}`)
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
                <button key={p.id} onClick={() => { if (p.disabled) return; setProvider(p.id) }} type="button"
                  aria-pressed={active}
                  aria-disabled={!!p.disabled}
                  disabled={!!p.disabled}
                  className={`luxe-card luxe-card-hover relative p-4 text-left overflow-hidden ${
                    p.disabled
                      ? 'opacity-50 cursor-not-allowed grayscale'
                      : active
                        ? `ring-2 ${p.border.replace('border-', 'ring-').replace('/60', '/70')}`
                        : ''
                  }`}>
                  {active && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-lg bg-amber-500 flex items-center justify-center text-black z-10">
                      <CheckOutlined className="text-[9px] font-bold" />
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
                    <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-lg bg-amber-500/12 border border-amber-500/40 text-amber-200 whitespace-nowrap">
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
                showSearch allowClear
                placeholder="Search model…"
                filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
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
                      className={`p-2.5 rounded-lg border text-left transition-colors ${
                        active
                          ? 'border-cyan-300/70 bg-cyan-500/12'
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
                Mode picks the model + step count for you (the "speed" knobs).
                Duration / resolution / aspect ratio stay yours — set them below.
              </p>
            </div>
          )}

          {/* Background music — 5090 lanes only. Worker generates audio via
              MusicGen on the local GPU and ffmpeg-muxes it into the mp4. */}
          {(provider === 'local' || provider === 'optimized') && (
            <div className="mt-4 p-3 rounded-lg border border-gray-800 bg-gray-900/40">
              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span className="flex items-center gap-2">
                  <CustomerServiceOutlined className="text-base text-amber-300" />
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
            <div className="p-4 rounded-lg bg-amber-500/8 border border-amber-400/20 text-xs text-gray-300">
              <p className="font-semibold text-amber-200 mb-1">No prompt needed for SVD-XT</p>
              <p className="text-gray-400 leading-relaxed">
                SVD-XT animates the source image directly using motion priors. Skip the prompt and
                paste an image URL below.
              </p>
            </div>
          ) : (
            <>
              {/* flex-wrap so the Help button drops below the label on narrow
                  screens instead of overflowing the row. */}
              <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider">2 — Describe your video</p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button type="button" onClick={() => setHelperOpen(true)}
                    title="AI prompt helper + sample prompts"
                    className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-lg border border-amber-500/40 hover:border-amber-400 bg-amber-500/12 hover:bg-amber-500/20 text-amber-300 transition-colors whitespace-nowrap">
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
                className="luxe-textarea"
                autoSize={{ minRows: 3, maxRows: 6 }} maxLength={400} showCount />

              {/* Saved prompts — searchable Antd Select. Replaces the 12-tile
                  grid that ate vertical space and the cartoony green "✓ pass
                  safety filter" tag. Pick to set the textarea; clear to wipe.
                  Type to filter — handy as the preset list grows. */}
              <div className="mt-3">
                <label className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-1.5 block">
                  Saved prompts
                </label>
                <Select
                  showSearch
                  allowClear
                  placeholder="Search a saved prompt…"
                  value={PROMPT_PRESETS.includes(prompt) ? prompt : undefined}
                  onChange={(value) => setPrompt(value || '')}
                  options={PROMPT_PRESETS.map(presetText => ({ value: presetText, label: presetText }))}
                  filterOption={(input, option) =>
                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  style={{ width: '100%' }}
                />
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
                <div className="flex gap-2 flex-wrap">
                  <Input value={imageUrl}
                    onChange={e => { setImageUrl(e.target.value); if (!e.target.value) setSourceIsVault(false) }}
                    placeholder="paste a URL · upload · pick from Image Studio →" allowClear
                    status={required && !imageUrl.trim() ? 'warning' : undefined} />
                  <Upload
                    accept="image/*,.heic,.heif"
                    showUploadList={false}
                    beforeUpload={(file) => { setSourceIsVault(false); return handleImageUpload(file) }}>
                    <Button icon={<UploadOutlined />} loading={uploadingImage}>
                      {uploadingImage ? 'Uploading' : 'Upload'}
                    </Button>
                  </Upload>
                  <Button onClick={() => setLibraryOpen(true)} icon={<PictureOutlined />}>
                    From Library
                  </Button>
                </div>
                {imageUrl && (
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <img src={imageUrl} alt="source preview"
                      className="w-16 h-16 object-cover rounded-md border border-gray-700"
                      onError={(e) => { e.currentTarget.style.display = 'none' }} />
                    <span className="text-[10px] text-gray-500 break-all">{imageUrl.slice(0, 80)}{imageUrl.length > 80 ? '…' : ''}</span>
                    {sourceIsVault && (
                      <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-lg border border-amber-500/50 bg-amber-500/12 text-amber-300 inline-flex items-center gap-1">
                        <LockOutlined /> Vault · output → Vault
                      </span>
                    )}
                  </div>
                )}
                {libraryOpen && (
                  <LibraryPickerModal
                    open={libraryOpen}
                    onClose={() => setLibraryOpen(false)}
                    onPick={(item) => {
                      setImageUrl(item.outputUrl || item.sourceUrl || '')
                      setSourceIsVault(item.vault === 1 || item.vault === true)
                      setLibraryOpen(false)
                    }}
                  />
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
          className="luxe-btn luxe-btn-primary"
          style={{ height: 52, fontSize: 15, width: '100%' }}>
          {loading ? 'Generating…' : 'Generate Video'}
        </Button>

        <div className="relative overflow-hidden rounded-lg border border-amber-400/25 bg-amber-500/8">
          <div className="relative p-3.5 flex items-start gap-3">
            <div className="shrink-0 mt-0.5 w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center">
              <ThunderboltOutlined className="text-black text-xs" />
            </div>
            <div className="text-[11px] leading-relaxed">
              <p className="mb-0.5">
                <span className="font-semibold text-amber-200 tracking-wide">
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
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={cancel} icon={<PauseOutlined />}>
                  Stop watching
                </Button>
                <Button onClick={openJobDetail} icon={<ExpandAltOutlined />}>
                  Open detail page
                </Button>
              </div>
              <p className="text-[10px] text-gray-600 text-center">
                Job continues in the background even after you stop watching.
              </p>
            </div>
          )}

          {/* After Stop-watching: re-attach polling OR open the dedicated
              detail page. The detail page survives refreshes — useful when
              the user wants to close this tab and check progress later. */}
          {!loading && job && !video && !error && (
            <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-4 space-y-2">
              <p className="text-sm text-cyan-200 font-semibold">
                Job <span className="font-mono">{job.jobId || job.videoId}</span> still running
              </p>
              <p className="text-xs text-gray-400 leading-relaxed">
                You stopped watching but the worker is still rendering. Re-attach the
                live log feed below, or open the standalone detail page that survives
                a refresh.
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button onClick={resumeWatching} icon={<CaretRightOutlined />} type="primary"
                  style={{ background: 'linear-gradient(135deg, #06b6d4, #7c3aed)', border: 'none' }}>
                  Watch logs again
                </Button>
                <Button onClick={openJobDetail} icon={<ExpandAltOutlined />}>
                  Open detail page
                </Button>
              </div>
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
  const navigate = useNavigate()
  const provColor =
    video.provider === 'zsky'  ? 'bg-sky-500' :
    video.provider === 'local' ? 'bg-amber-500' :
                                 'bg-emerald-500'
  const date = new Date(video.createdAt)
  const dateLabel = isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const thumb = thumbFromVideo(resolveVideoUrl(video.videoUrl))
  const isActive = video.status && video.status !== 'completed'

  const handleClick = () => {
    if (selectMode) { onToggleSelect?.(video.videoId); return }
    // In-flight / failed → standalone detail page with live logs.
    // Completed → existing in-page play modal.
    if (isActive) { navigate(`/ai-video/${encodeURIComponent(video.videoId)}`); return }
    onClick?.()
  }

  return (
    <div className={`luxe-card luxe-card-hover group relative overflow-hidden ${
      isSelected
        ? 'ring-2 ring-cyan-400/60'
        : ''
    }`}>
      <button onClick={handleClick} className="w-full text-left">
        <div className="relative aspect-[9/16] bg-gray-900 overflow-hidden">
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
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/30 opacity-100" />
          {!selectMode && (
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <PlayCircleOutlined className="text-5xl text-white" />
            </div>
          )}
          <div className={`absolute top-2 left-2 px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase tracking-wider ${provColor} text-black`}>
            {video.provider}
          </div>
          {dateLabel && (
            <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-lg text-[9px] bg-black/60 text-gray-300 border border-white/10">
              {dateLabel}
            </div>
          )}
          {selectMode && (
            <div className={`absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-md border-2 transition-colors ${
              isSelected
                ? 'bg-cyan-400 border-cyan-400 text-black'
                : 'bg-black/60 border-white/40 text-white/0'
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
          className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-lg bg-black/60 hover:bg-rose-600 text-gray-300 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity z-10">
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
  queued:     { tone: 'amber',   ring: 'border-amber-400/60',   chip: 'bg-amber-500/15 text-amber-300 border-amber-500/40',   label: 'Queued' },
  processing: { tone: 'cyan',    ring: 'border-cyan-400/70',    chip: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40',     label: 'Processing' },
  completed:  { tone: 'emerald', ring: 'border-emerald-500/50', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', label: 'Completed' },
  failed:     { tone: 'rose',    ring: 'border-rose-500/60',    chip: 'bg-rose-500/15 text-rose-300 border-rose-500/40',     label: 'Failed' },
}

const LANE_COPY = {
  optimized: { label: '5090 Optimized', bg: 'bg-cyan-500' },
  local:     { label: '5090 Beast',     bg: 'bg-amber-500' },
  worker:    { label: 'GPU Worker',     bg: 'bg-emerald-500' },
  zsky:      { label: 'ZSky',           bg: 'bg-sky-500' },
}

const JobCard = ({ job, onDelete }) => {
  const meta = JOB_STATUS_META[job.status] || JOB_STATUS_META.queued
  const lane = LANE_COPY[job.lane] || { label: job.lane || '?', bg: 'bg-gray-700' }
  const created = job.createdAt ? new Date(job.createdAt) : null
  const ago = created ? timeAgo(created) : ''
  const errShort = (job.error || '').slice(0, 120)
  const isLive = job.status === 'queued' || job.status === 'processing'

  return (
    <div className={`luxe-card luxe-card-hover group relative overflow-hidden ring-1 ${meta.ring.replace('border-', 'ring-')}`}>
      <div className="aspect-video bg-black/40 relative overflow-hidden">
        {job.status === 'completed' && job.videoUrl ? (
          <video src={job.videoUrl} muted loop playsInline
            onMouseEnter={(e) => e.currentTarget.play().catch(()=>{})}
            onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0 }}
            className="w-full h-full object-cover" />
        ) : (
          <div className={`w-full h-full flex items-center justify-center ${lane.bg} opacity-25`}>
            <span className="text-[10px] uppercase tracking-wider font-mono text-black/80">{meta.label}</span>
          </div>
        )}
        <div className={`glass absolute top-2 left-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${meta.chip}`}>
          {meta.label}
        </div>
        <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-lg text-[9px] font-semibold uppercase tracking-wider ${lane.bg} text-black`}>
          {lane.label}
        </div>
        {/* Delete / cancel — top-right corner, only renders if a handler
            was passed (the JobsTab passes one; other consumers might not).
            Tooltip swaps label based on whether the row is live or
            terminal. e.stopPropagation so the card's hover-play doesn't
            grab the click. */}
        {onDelete && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(job) }}
            title={isLive ? 'Cancel this job' : 'Delete this job'}
            aria-label={isLive ? 'Cancel job' : 'Delete job'}
            className="absolute bottom-2 right-2 w-7 h-7 rounded-md grid place-items-center
                       border border-rose-500/40 bg-rose-500/10 text-rose-300
                       hover:bg-rose-500/25 hover:text-rose-100 transition-colors
                       opacity-0 group-hover:opacity-100 focus:opacity-100">
            <DeleteOutlined className="text-xs" />
          </button>
        )}
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
            {errShort}
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
  // Internal bump triggers an immediate refetch after a delete — without
  // it, the user would have to wait for the next auto-poll (or only see
  // the change if the row was queued/processing). Same pattern Library
  // uses after its bulk ops.
  const [internalReload, setInternalReload] = useState(0)

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
  }, [statusFilter, page, refreshKey, internalReload, data.counts?.queued, data.counts?.processing])

  // Per-row delete. The BE endpoint (`DELETE /api/ai-video/:videoId`)
  // already handles BOTH inflight jobs AND completed videos — the
  // controller checks the inflight `jobs` table first, then falls
  // through to Cloudinary cleanup for completed `videos` rows. So one
  // button does the right thing whether the row is queued, processing,
  // failed, or completed.
  const requestDelete = (job) => {
    const isLive = job.status === 'queued' || job.status === 'processing'
    Modal.confirm({
      title: isLive ? `Cancel job ${job.videoId.slice(-8)}?` : `Delete job ${job.videoId.slice(-8)}?`,
      content: isLive
        ? "This removes the row before the worker finishes. If the worker has already started, the result lands in the database orphaned — you'll see it in Library and can delete it from there too."
        : "This removes the row + Cloudinary asset. Can't be undone.",
      okText:  isLive ? 'Cancel job' : 'Delete',
      okType:  'danger',
      okButtonProps: { danger: true },
      cancelText: 'Back',
      autoFocusButton: 'cancel',
      centered: true,
      onOk: async () => {
        const { error } = await deleteVideo(job.videoId)
        if (error) { notice.error(`Delete failed: ${error}`); return }
        notice.success(isLive ? 'Job cancelled' : 'Deleted')
        setInternalReload(n => n + 1)
      },
    })
  }

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
          {data.items.map(j => <JobCard key={`${j.src}-${j.videoId}-${j.ts}`} job={j} onDelete={requestDelete} />)}
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
  // Active tab is mirrored to the URL (?tab=cinema) so links + browser
  // back-button work intuitively. Default to 'generate' when nothing
  // is in the URL.
  const [searchParams, setSearchParams] = useSearchParams()
  const activeKey = ['generate', 'jobs', 'library', 'cinema', 'cinema-library', 'combine'].includes(searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'generate'
  const onTabChange = (k) => {
    const next = new URLSearchParams(searchParams)
    if (k === 'generate') next.delete('tab')
    else next.set('tab', k)
    setSearchParams(next, { replace: false })
    // Bump the shared refreshKey so the newly-active card re-fetches its
    // list. Without this, deleting in Combine and switching to Cinema
    // Library would leave the old (now-stale) disk-stats / counts
    // sitting until the user manually hits Refresh.
    setRefreshKey(k => k + 1)
  }

  useEffect(() => {
    getTodayVideo().then(({ data }) => setToday(data))
  }, [])

  const onCompleted = () => setRefreshKey(k => k + 1)

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="relative overflow-hidden">
        <div className="relative max-w-6xl mx-auto px-5 sm:px-6 pt-28 sm:pt-32 pb-8">
          <div className="eyebrow-mono mb-3 inline-flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            {activeKey === 'cinema' ? 'MULTI-SHOT ORCHESTRATOR · 5090 POWERED' : 'MULTI-PROVIDER · 5090 POWERED'}
          </div>
          <h1 className="font-poppins font-black text-3xl sm:text-5xl md:text-6xl leading-tight text-white mb-2">
            {activeKey === 'cinema' ? 'Cinema · Multi-shot' : 'AI Video Studio'}
          </h1>
          <p className="text-gray-400 text-sm sm:text-base max-w-xl">
            {activeKey === 'cinema'
              ? 'One master prompt → Groq plans N shots → render each via the AI Video lane → stitch.'
              : 'Type a prompt → get a Reel-style video. ZSky for instant results, GPU Worker for queued open-source ComfyUI, or my 5090 Beast for fast text + image-to-video.'
            }
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-5 sm:px-6 pb-24">
        <Tabs
          activeKey={activeKey}
          onChange={onTabChange}
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
            {
              key: 'cinema',
              label: <span><VideoCameraOutlined /> Cinema</span>,
              children: (
                <Suspense fallback={
                  <div className="py-10 flex items-center justify-center text-gray-500 text-sm">
                    Loading Cinema…
                  </div>
                }>
                  <Cinema embedded view="planner" refreshKey={refreshKey} />
                </Suspense>
              ),
            },
            {
              key: 'cinema-library',
              label: <span><VideoCameraOutlined /> Cinema Library</span>,
              children: (
                <Suspense fallback={
                  <div className="py-10 flex items-center justify-center text-gray-500 text-sm">
                    Loading Cinema Library…
                  </div>
                }>
                  <Cinema embedded view="library" refreshKey={refreshKey} />
                </Suspense>
              ),
            },
            {
              key: 'combine',
              label: <span><ToolOutlined /> Combine</span>,
              children: <VideoCombiner refreshKey={refreshKey} />,
            },
            {
              key: 'jobs',
              label: <span><InfoCircleOutlined /> Jobs</span>,
              children: <JobsTab refreshKey={refreshKey} />,
            },
          ]}
        />
      </div>
    </div>
  )
}

// ── Image Studio library picker ─────────────────────────────────────
// Opens from the "From Library" button next to the source-image
// Upload control. Shows tiles from /api/image-enhance/list. Vault items
// are only included when the user has a Vault token (the BE downgrades
// visibility to 'public' otherwise); each tile carries its vault flag
// so picking a Vault image marks sourceIsVault=true on the parent,
// which propagates to the generated video.
function LibraryPickerModal({ open, onClose, onPick }) {
  const [tab, setTab] = useState('public')        // 'public' | 'vault' | 'all'
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)
  const hasVault = !!getVaultToken()

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setErr(null)
    listEnhancedImages({ status: 'completed', visibility: tab, limit: 48 })
      .then(({ data, error }) => {
        if (cancelled) return
        setLoading(false)
        if (error) { setErr(error); return }
        setItems(Array.isArray(data?.items) ? data.items : [])
      })
  }, [open, tab])

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title="Pick an image from your library"
      width={920}
      centered
    >
      <div className='space-y-3'>
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            { key: 'public', label: <span className='inline-flex items-center gap-1.5'><GlobalOutlined /> Public</span> },
            ...(hasVault ? [
              { key: 'vault', label: <span className='inline-flex items-center gap-1.5'><LockOutlined /> Vault</span> },
              { key: 'all',   label: 'All' },
            ] : []),
          ]}
        />
        {!hasVault && (
          <p className='text-[11px] text-gray-500 inline-flex items-center gap-1.5'>
            <LockOutlined /> Vault images are hidden — unlock the Vault on the Image Studio page first to see your private items here.
          </p>
        )}
        {err && <Alert type='error' showIcon message={err} className='!mb-1' />}
        {loading && <p className='text-xs text-gray-500'>Loading…</p>}
        {!loading && !items.length && (
          <p className='text-xs text-gray-500 py-6 text-center'>No images in this tab yet.</p>
        )}
        <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[60vh] overflow-y-auto'>
          {items.map(item => {
            const url = item.outputUrl || item.sourceUrl
            if (!url) return null
            const isVault = item.vault === 1 || item.vault === true
            return (
              <button
                key={item.imageId || url}
                type='button'
                onClick={() => onPick(item)}
                className='group relative aspect-square rounded-lg overflow-hidden border border-gray-700 hover:border-amber-400 transition-colors'
              >
                <img src={url} alt='' className='w-full h-full object-cover' onError={(e) => { e.currentTarget.style.opacity = 0.2 }} />
                {isVault && (
                  <span className='absolute top-1 right-1 text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-lg border border-amber-400/70 bg-amber-900/70 text-amber-100 inline-flex items-center gap-1'>
                    <LockOutlined /> Vault
                  </span>
                )}
                <span className='absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent text-[10px] px-2 py-1 text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity truncate'>
                  {(item.prompt || '').slice(0, 60) || 'pick'}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}

export default AIVideo
