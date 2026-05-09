import { useState, useEffect, useRef } from 'react'
import { Modal, Upload, Tabs, message as antMessage } from 'antd'
import {
  UploadOutlined, ExpandAltOutlined, DownloadOutlined,
  CheckOutlined, ReloadOutlined, ThunderboltOutlined,
  AppstoreOutlined, CloudOutlined, DesktopOutlined, DeleteOutlined,
} from '@ant-design/icons'
import {
  enhanceImage, getImageStatus, listEnhancedImages, fileToDataUrl,
} from '../api/ai'

// localStorage key — persists the in-flight enhancement across refreshes
const INFLIGHT_KEY = 'sid-imgenh-inflight'

// Map a preset to a workflow `type` for the BE. All current presets are
// "polish without changing identity" → type='quality' for local engine, the
// cloud engine uses prompt directly so type is informational only.
const PRESET_TYPE = {
  'cinematic-upscale':     'quality',
  'sony-a1-portrait':      'quality',
  '4k-detail-recovery':    'quality',
  'studio-cinematic-light': 'cinematic',
  'hong-kong-night':       'cinematic',
}

// ─── Preset prompts ─────────────────────────────────────────────
// Each card on the page is one of these. The full text (the actual prompt
// sent to Gemini) shows up in the Modal when the user clicks Expand.
// Tone/accent drives the gradient colour on the card and modal header.
const PRESETS = [
  {
    id: 'cinematic-upscale',
    name: 'Cinematic Upscale',
    short: 'Pristine ultra-HD cinematic version. Identity, pose, environment unchanged.',
    accent: 'from-cyan-400 via-sky-400 to-blue-500',
    border: 'border-cyan-400/40',
    glow: 'shadow-cyan-400/20',
    icon: '🎬',
    prompt: `Upgrade the uploaded image into a pristine, ultra-high-definition cinematic version while preserving the subject with absolute fidelity. The person's identity, facial anatomy, expression, body posture, clothing, accessories, environment, framing, and overall composition must remain completely unchanged. Do not modify, reinterpret, replace, or introduce any new visual elements. Reconstruct and refine micro-level details including precise facial contours, authentic skin texture with naturally visible pores, individually defined hair strands, sharp and lifelike eyes, and clean, well-resolved edges throughout the image. Enhance dynamic range, contrast, and dimensional depth using balanced, studio-quality cinematic lighting.`,
  },
  {
    id: 'sony-a1-portrait',
    name: 'Sony A1 Editorial',
    short: 'Re-renders as if shot on a Sony A1 + 85mm f/1.4. Background untouched.',
    accent: 'from-amber-400 via-rose-400 to-fuchsia-500',
    border: 'border-amber-400/40',
    glow: 'shadow-amber-400/20',
    icon: '📷',
    prompt: `Enhance the portrait while strictly preserving the subject's identity with accurate facial geometry. Do not change their expression or face shape. Only allow subtle feature cleanup without altering who they are. Keep the exact same background from the reference image. No replacements, no changes, no new objects, no layout shifts. The environment must look identical. The image must be recreated as if it was shot on a Sony A1, using an 85mm f1.4 lens, at f1.6, ISO 100, 1/200 shutter speed, cinematic shallow depth of field, perfect facial focus, and an editorial-neutral color profile. This Sony A1 + 85mm f1.4 setup is mandatory. The final image must clearly look like premium full-frame Sony A1 quality.
Lighting must match the exact direction, angle, and mood of the reference photo. Upgrade the lighting into a cinematic, subject-focused style: soft directional light, warm highlights, cool shadows, deeper contrast, expanded dynamic range, micro-contrast boost, smooth gradations, and zero harsh shadows.
Maintain neutral premium color tone, cinematic contrast curve, natural saturation, real skin texture (not plastic), and subtle film grain. No fake glow, no runway lighting, no over smoothing. Render in 4K resolution, 10-bit color, cinematic editorial style, premium clarity, portrait crop, and keep the original environmental vibe untouched.
Re-render the subject with improved realism, depth, texture, and lighting while keeping identity and background fully preserved.
NEGATIVE INSTRUCTIONS:
No new background.
No background change.
No overly dramatic lighting.
No face morphing.
No fake glow.
No flat lighting.
No over-smooth skin.`,
  },
  {
    id: '4k-detail-recovery',
    name: '4K Detail Recovery',
    short: 'Recovers pores, hair, fabric weave at true-to-life realism. Zero stylization.',
    accent: 'from-emerald-400 via-teal-400 to-cyan-500',
    border: 'border-emerald-400/40',
    glow: 'shadow-emerald-400/20',
    icon: '🔍',
    prompt: `Ultra-high-resolution 4K enhancement based strictly on the provided reference image. Absolute fidelity to original facial anatomy, proportions, and identity. Preserve expression, gaze, pose, camera angle, framing, and perspective with zero deviation. Clothing, hair, skin, and background elements must remain unchanged in structure, placement, and design.
Recover fine-grain detail with natural realism. Enhance pores, fine lines, hair strands, eyelashes, fabric weave, seams, and material edges without introducing stylization. Maintain original color science, white balance, and tonal relationships exactly as captured. Lighting direction, intensity, contrast, and shadow behavior must match the source image precisely, with only improved clarity and expanded dynamic range. No relighting, no reshaping. Remove any grain. Apply controlled sharpening and high-frequency detail reconstruction. Remove compression artifacts and noise while retaining authentic texture. No smoothing, no plastic skin, no artificial gloss. Facial features must remain consistent across the entire image with coherent anatomy and clean, stable edges.
Negative constraints: no warping, no facial drift, no added or missing anatomy, no altered hands, no distortions, no perspective shift, no text or graphics, no hallucinated detail, no stylized rendering. Output must read as a true-to-life, photorealistic upscale that matches the reference exactly, only clearer, sharper, and higher resolution.`,
  },
  {
    id: 'studio-cinematic-light',
    name: 'Studio Cinematic Light',
    short: 'Same composition. Adds balanced studio-quality cinematic lighting.',
    accent: 'from-purple-400 via-pink-400 to-rose-500',
    border: 'border-purple-400/40',
    glow: 'shadow-purple-400/20',
    icon: '💡',
    prompt: `Upgrade the uploaded image into a pristine, ultra-high-definition cinematic version while preserving the subject with absolute fidelity. The person's identity, facial anatomy, expression, body posture, clothing, accessories, environment, framing, and overall composition must remain completely unchanged. Do not modify, reinterpret, replace, or introduce any new visual elements. Reconstruct and refine micro-level details including precise facial contours, authentic skin texture with naturally visible pores, individually defined hair strands, sharp and lifelike eyes, and clean, well-resolved edges throughout the image. Enhance dynamic range, contrast, and dimensional depth using balanced, studio-quality cinematic lighting.`,
  },
  {
    id: 'hong-kong-night',
    name: 'Hong Kong Night Cinema',
    short: 'Wong Kar-wai 1990s neon film aesthetic. Subject + composition unchanged.',
    accent: 'from-rose-500 via-fuchsia-500 to-indigo-500',
    border: 'border-rose-400/40',
    glow: 'shadow-rose-400/20',
    icon: '🌙',
    prompt: `Apply a Hong Kong movie aesthetic to the user uploaded image. Keep the subject exactly the same, unchanged identity, pose, proportions, and outfit. Add a cinematic Hong Kong film look inspired by 1990s Wong Kar-wai and modern HK street cinema: deep emerald and crimson color tones, strong neon reflections, lights, high contrast shadows, soft bloom around lights, slight motion blur on background edges, rich film grain, and subtle chromatic aberration. Lighting becomes moody and atmospheric with cool teal ambient mixed with warm-yellow practical lights. Keep composition and background structure the same but stylize it with the HK-film palette and texture. Add gentle haze, vignette, and a nostalgic melancholy mood. Ultra high resolution, cinematic, realistic.`,
  },
]

// ─── Page ───────────────────────────────────────────────────────
export default function ImageEnhancer() {
  const [sourceFile, setSourceFile] = useState(null)
  const [sourceDataUrl, setSourceDataUrl] = useState('')
  const [selectedPreset, setSelectedPreset] = useState(PRESETS[0].id)
  const [expandedPreset, setExpandedPreset] = useState(null)
  const [engine, setEngine] = useState('cloud')          // cloud (Gemini) | local (5090)
  const [working, setWorking] = useState(false)
  const [job, setJob] = useState(null)                    // active or last-finished SQLite row
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const pollTimer = useRef(null)

  useEffect(() => { document.title = 'Image Enhancer · Sid' }, [])

  // Resume an in-flight job after a page refresh
  useEffect(() => {
    let inflight
    try { inflight = localStorage.getItem(INFLIGHT_KEY) } catch {}
    if (!inflight) return
    getImageStatus(inflight).then(({ data }) => {
      if (!data) { try { localStorage.removeItem(INFLIGHT_KEY) } catch {}; return }
      if (['completed', 'failed'].includes(data.status)) {
        try { localStorage.removeItem(INFLIGHT_KEY) } catch {}
        setJob(data)
        if (data.status === 'failed') setError(data.error || 'Enhancement failed')
      } else {
        setJob(data); setWorking(true); startPolling(inflight)
      }
    })
    return () => { if (pollTimer.current) clearInterval(pollTimer.current) }
  }, [])

  const startPolling = (imageId) => {
    if (pollTimer.current) clearInterval(pollTimer.current)
    let attempts = 0
    pollTimer.current = setInterval(async () => {
      attempts += 1
      const { data, error: err } = await getImageStatus(imageId)
      if (err) {
        if (attempts > 5) { clearInterval(pollTimer.current); pollTimer.current = null; setWorking(false); setError(err) }
        return
      }
      if (!data) return
      setJob(data)
      if (data.status === 'completed') {
        clearInterval(pollTimer.current); pollTimer.current = null
        try { localStorage.removeItem(INFLIGHT_KEY) } catch {}
        setWorking(false)
        setRefreshKey(k => k + 1)   // reload Library tab
      } else if (data.status === 'failed') {
        clearInterval(pollTimer.current); pollTimer.current = null
        try { localStorage.removeItem(INFLIGHT_KEY) } catch {}
        setWorking(false); setError(data.error || 'Enhancement failed')
      }
      if (attempts > 200) {
        clearInterval(pollTimer.current); pollTimer.current = null
        setWorking(false); setError('Timed out waiting for enhancement')
      }
    }, 1500)
  }

  const handleFile = async (file) => {
    setError(null); setJob(null)
    if (!file?.type?.startsWith('image/')) { antMessage.error('Pick an image file'); return false }
    if (file.size > 8 * 1024 * 1024)        { antMessage.error('Image too large (max 8 MB)'); return false }
    setSourceFile(file)
    try {
      const dataUrl = await fileToDataUrl(file)
      setSourceDataUrl(dataUrl)
    } catch {
      antMessage.error('Could not read the image')
    }
    return false
  }

  const enhance = async () => {
    const preset = PRESETS.find(p => p.id === selectedPreset)
    if (!preset) return
    if (!sourceDataUrl) { setError('Upload an image first.'); return }
    setError(null); setJob(null); setWorking(true)
    const { data, error: err } = await enhanceImage({
      dataUrl: sourceDataUrl,
      prompt: preset.prompt,
      presetId: preset.id,
      type: PRESET_TYPE[preset.id] || 'fast',
      engine,
    })
    if (err) { setWorking(false); setError(err); return }
    setJob(data)
    try { localStorage.setItem(INFLIGHT_KEY, data.imageId) } catch {}
    startPolling(data.imageId)
  }

  const reset = () => {
    if (pollTimer.current) clearInterval(pollTimer.current)
    pollTimer.current = null
    try { localStorage.removeItem(INFLIGHT_KEY) } catch {}
    setSourceFile(null); setSourceDataUrl('')
    setJob(null); setError(null); setWorking(false)
  }

  const downloadResult = () => {
    if (!job?.outputUrl) return
    const a = document.createElement('a')
    a.href = job.outputUrl
    a.download = `enhanced-${job.presetId || job.imageId}-${Date.now()}.png`
    a.target = '_blank'; a.rel = 'noopener'
    a.click()
  }

  const expanded = expandedPreset ? PRESETS.find(p => p.id === expandedPreset) : null
  const activePreset = PRESETS.find(p => p.id === selectedPreset)
  const resultUrl = job?.outputUrl
  const status = job?.status

  return (
    <div className="min-h-screen bg-black text-gray-100 pt-20 pb-16 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8">
          <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
            <div className="flex items-center gap-2">
              <ThunderboltOutlined className="text-amber-400 text-xl" />
              <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-cyan-300 via-fuchsia-400 to-amber-300 bg-clip-text text-transparent">
                Image Enhancer
              </h1>
            </div>
            {/* Engine toggle — Cloud (Gemini, fast) vs Local (5090, free) */}
            <div className="flex items-center gap-1 p-1 rounded-full bg-gray-900/60 border border-gray-800">
              {[
                { id: 'cloud', label: 'Cloud', icon: <CloudOutlined />, sub: 'Gemini · 10-15s' },
                { id: 'local', label: 'Local', icon: <DesktopOutlined />, sub: '5090 · free' },
              ].map(opt => (
                <button key={opt.id} onClick={() => setEngine(opt.id)}
                  disabled={working}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all ${
                    engine === opt.id
                      ? 'bg-gradient-to-r from-cyan-500/30 to-fuchsia-500/30 text-white border border-cyan-400/40'
                      : 'text-gray-400 hover:text-gray-200'
                  } ${working ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  {opt.icon}
                  <span className="font-semibold">{opt.label}</span>
                  <span className="text-[9px] opacity-60">{opt.sub}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="text-sm text-gray-400 max-w-2xl">
            Polish photos with cinematic prompts. Pick a preset below, click{' '}
            <span className="text-cyan-300">Expand</span> to read the full prompt,
            upload an image, and hit <span className="text-amber-300">Enhance</span>.
            Cloud uses Gemini 2.5 Flash Image. Local uses the 5090 + ComfyUI.
          </p>
        </header>

        <Tabs
          defaultActiveKey="generate"
          size="large"
          items={[
            {
              key: 'generate',
              label: <span><ThunderboltOutlined /> Generate</span>,
              children: (
                <GenerateSection
                  sourceDataUrl={sourceDataUrl} reset={reset} handleFile={handleFile}
                  resultUrl={resultUrl} status={status} working={working} engine={engine}
                  job={job} activePreset={activePreset} downloadResult={downloadResult}
                  error={error}
                  selectedPreset={selectedPreset} setSelectedPreset={setSelectedPreset}
                  setExpandedPreset={setExpandedPreset} enhance={enhance}
                />
              ),
            },
            {
              key: 'library',
              label: <span><AppstoreOutlined /> Library</span>,
              children: <ImageLibrary refreshKey={refreshKey} />,
            },
          ]}
        />

        {/* Modal stays at root so it overlays both tabs */}
        <ImageEnhancerModal expanded={expanded}
          setExpandedPreset={setExpandedPreset} setSelectedPreset={setSelectedPreset} />
      </div>
    </div>
  )
}

// ─── Generator section (extracted so the Tabs structure stays clean) ──
function GenerateSection({
  sourceDataUrl, reset, handleFile, resultUrl, status, working, engine, job,
  activePreset, downloadResult, error, selectedPreset, setSelectedPreset,
  setExpandedPreset, enhance,
}) {
  return (
    <>
      <section className="grid sm:grid-cols-2 gap-4 mb-6">
          <div className="rounded-2xl border-2 border-dashed border-gray-800 hover:border-cyan-500/40 transition-colors p-4 bg-gray-900/40">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Source image</p>
            {sourceDataUrl ? (
              <div className="relative">
                <img src={sourceDataUrl} alt="source" className="w-full max-h-72 object-contain rounded-lg" />
                <button onClick={reset}
                  className="absolute top-2 right-2 px-2 py-1 text-[10px] rounded-full bg-black/70 hover:bg-rose-600 text-white border border-white/10">
                  ✕ Replace
                </button>
              </div>
            ) : (
              <Upload.Dragger
                multiple={false}
                showUploadList={false}
                accept="image/*"
                beforeUpload={handleFile}
                style={{ background: 'transparent', borderColor: 'transparent', padding: '20px 0' }}>
                <UploadOutlined className="text-3xl text-cyan-400 mb-2" />
                <p className="text-sm text-gray-300">Drop image or click to upload</p>
                <p className="text-[10px] text-gray-500 mt-1">JPG / PNG / WEBP · max 8 MB</p>
              </Upload.Dragger>
            )}
          </div>

          <div className="rounded-2xl border border-gray-800 p-4 bg-gray-900/40 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-500">Enhanced output</p>
              {status && status !== 'completed' && (
                <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                  status === 'queued'     ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                  : status === 'processing' ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
                  : 'bg-rose-500/15 text-rose-300 border-rose-500/40'
                }`}>{status}</span>
              )}
            </div>
            {resultUrl ? (
              <>
                <img src={resultUrl} alt="enhanced" className="w-full max-h-72 object-contain rounded-lg" />
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-gray-500">
                    {activePreset?.name} · {job?.engine === 'cloud' ? 'Gemini' : '5090 local'}
                  </span>
                  <button onClick={downloadResult}
                    className="flex items-center gap-1 text-xs px-3 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 transition-colors">
                    <DownloadOutlined /> Download
                  </button>
                </div>
              </>
            ) : working ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 py-8">
                <div className="w-10 h-10 rounded-full border-2 border-cyan-500/30 border-t-cyan-400 animate-spin" />
                <p className="text-xs text-gray-500">
                  {status === 'queued' ? 'Queued — waiting for worker…'
                    : status === 'processing' ? 'Enhancing…'
                    : `Enhancing… typically ${engine === 'cloud' ? '5-15' : '20-60'}s`}
                </p>
                {job?.imageId && <p className="text-[10px] text-gray-700 font-mono break-all pt-1">{job.imageId}</p>}
              </div>
            ) : error ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 py-8 text-center">
                <p className="text-rose-400 text-sm font-mono">✗ {error}</p>
                <button onClick={enhance}
                  className="text-xs px-3 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300">
                  <ReloadOutlined /> Retry
                </button>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-gray-600">
                Result will appear here
              </div>
            )}
          </div>
        </section>

        {/* ─── Preset cards ─── */}
        <section className="mb-6">
          <h2 className="text-xs uppercase tracking-wider text-gray-500 mb-3">Choose a polish</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {PRESETS.map(p => {
              const active = selectedPreset === p.id
              return (
                <button key={p.id} type="button" onClick={() => setSelectedPreset(p.id)}
                  className={`relative p-4 rounded-2xl text-left border-2 transition-all overflow-hidden ${
                    active
                      ? `${p.border.replace('/40', '')} bg-gray-900 shadow-xl ${p.glow} scale-[1.01]`
                      : 'border-gray-800 bg-gray-900/40 hover:bg-gray-900 hover:border-gray-700'
                  }`}>
                  {active && (
                    <div aria-hidden className={`absolute inset-0 pointer-events-none opacity-20 bg-gradient-to-br ${p.accent}`} />
                  )}
                  {active && (
                    <div className={`absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gradient-to-br ${p.accent} flex items-center justify-center text-black shadow-md z-10`}>
                      <CheckOutlined className="text-[10px] font-bold" />
                    </div>
                  )}
                  <div className="relative">
                    <div className="flex items-start justify-between mb-1.5">
                      <span className={`text-sm font-bold ${active ? 'text-white' : 'text-gray-200'}`}>
                        <span className="mr-1.5">{p.icon}</span>{p.name}
                      </span>
                      <button onClick={(e) => { e.stopPropagation(); setExpandedPreset(p.id) }}
                        className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-gray-700 hover:border-cyan-400 text-gray-400 hover:text-cyan-300 transition-colors">
                        <ExpandAltOutlined /> Expand
                      </button>
                    </div>
                    <p className={`text-[11px] leading-snug ${active ? 'text-gray-300' : 'text-gray-500'}`}>
                      {p.short}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        {/* ─── Action ─── */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-gray-500">
            Active preset: <span className="text-cyan-300 font-semibold">{activePreset?.name}</span>
          </p>
          <button onClick={enhance} disabled={!sourceDataUrl || working}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl font-semibold text-sm transition-all ${
              !sourceDataUrl || working
                ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                : 'bg-gradient-to-r from-cyan-400 via-fuchsia-400 to-amber-400 text-black hover:shadow-xl hover:shadow-fuchsia-500/30 hover:scale-[1.02]'
            }`}>
            <ThunderboltOutlined />
            {working ? 'Enhancing…' : 'Enhance image'}
          </button>
        </div>
    </>
  )
}

// ─── Library tab ─────────────────────────────────────────────────
function ImageLibrary({ refreshKey }) {
  const [filter, setFilter] = useState('completed')
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ items: [], total: 0, pages: 1, counts: {} })
  const [loading, setLoading] = useState(true)

  useEffect(() => { setPage(1) }, [filter, refreshKey])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listEnhancedImages({ status: filter, page, limit: 24 }).then(({ data: result }) => {
      if (cancelled) return
      if (result) setData(result)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [filter, page, refreshKey])

  const filters = [
    { v: 'completed',  label: 'Completed',  n: data.counts?.completed },
    { v: 'processing', label: 'Processing', n: data.counts?.processing },
    { v: 'queued',     label: 'Queued',     n: data.counts?.queued },
    { v: 'failed',     label: 'Failed',     n: data.counts?.failed },
    { v: 'all',        label: 'All',        n: null },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {filters.map(f => {
          const active = filter === f.v
          return (
            <button key={f.v} onClick={() => setFilter(f.v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                active
                  ? 'bg-cyan-600/20 text-cyan-300 border-cyan-500/40'
                  : 'bg-gray-800/60 hover:bg-gray-800 text-gray-400 border-transparent hover:border-gray-700'
              }`}>
              <span>{f.label}</span>
              {f.n != null && <span className="text-[10px] opacity-70 font-mono">({f.n})</span>}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[1,2,3,4,5,6,7,8].map(i => (
            <div key={i} className="aspect-square rounded-xl bg-gray-900/40 animate-pulse" />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <div className="py-16 text-center text-gray-500 text-sm">
          No {filter === 'all' ? '' : filter} enhancements yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {data.items.map(it => <LibraryCard key={it.imageId} image={it} />)}
        </div>
      )}
    </div>
  )
}

function LibraryCard({ image }) {
  const url = image.outputUrl || image.sourceUrl
  return (
    <a href={image.outputUrl || image.sourceUrl} target="_blank" rel="noopener"
      className="group relative aspect-square rounded-xl overflow-hidden border border-gray-800 hover:border-cyan-400/50 transition-all bg-gray-900/40">
      {url ? (
        <img src={url} alt={image.prompt}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-950">
          <span className="text-3xl opacity-50">
            {image.status === 'failed' ? '✗' : image.status === 'processing' ? '⚡' : '⏳'}
          </span>
        </div>
      )}
      <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-black/60 text-white border border-white/10">
        {image.engine === 'cloud' ? '☁ Gemini' : '🖥 5090'}
      </div>
      {image.status !== 'completed' && (
        <div className={`absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
          image.status === 'failed' ? 'bg-rose-500/80 text-white'
          : image.status === 'processing' ? 'bg-cyan-500/80 text-white'
          : 'bg-amber-500/80 text-black'
        }`}>{image.status}</div>
      )}
    </a>
  )
}

// ─── Full-prompt modal (extracted so it can sit above the Tabs) ──
function ImageEnhancerModal({ expanded, setExpandedPreset, setSelectedPreset }) {
  return (
    <Modal
      open={!!expanded}
      onCancel={() => setExpandedPreset(null)}
      footer={null}
      width={720}
      centered
      closeIcon={null}
      styles={{
        content: { background: '#0b0f17', padding: 0, borderRadius: 16, border: '1px solid rgba(34,211,238,0.25)' },
        body: { padding: 0 },
        header: { display: 'none' },
        mask: { backdropFilter: 'blur(6px)' },
      }}>
      {expanded && (
        <>
          <div className={`flex items-center justify-between px-5 py-3 border-b border-gray-800/80 bg-gradient-to-r ${expanded.accent.replace('via-', 'to-').split(' ')[0]} bg-opacity-10`}>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{expanded.icon}</span>
              <h3 className="text-sm font-semibold text-white tracking-wide">{expanded.name}</h3>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { setSelectedPreset(expanded.id); setExpandedPreset(null) }}
                className="text-[10px] font-semibold px-2 py-1 rounded-full bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 transition-colors">
                Use this prompt
              </button>
              <button onClick={() => setExpandedPreset(null)}
                className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded">
                ✕
              </button>
            </div>
          </div>
          <div className="max-h-[65vh] overflow-y-auto p-5 bg-[#06080d]">
            <p className="text-xs text-gray-400 mb-3">{expanded.short}</p>
            <pre className="text-[12px] font-mono text-gray-200 leading-relaxed whitespace-pre-wrap break-words bg-black/40 border border-gray-800 rounded-lg p-4">
{expanded.prompt}
            </pre>
          </div>
        </>
      )}
    </Modal>
  )
}
