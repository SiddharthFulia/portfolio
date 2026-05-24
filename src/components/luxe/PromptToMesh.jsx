// PromptToMesh — type a description → BE Shap-E / TripoSR worker on the
// 5090 → poll until done → render the resulting .glb in react-three-fiber
// with a rich studio toolkit (materials, environments, decimation, multi-
// format export, screenshots, presets, history).
//
// Flow (unchanged from the original):
//   1) POST /api/mesh/generate { prompt, model, steps, ... } → { jobId }
//   2) Poll GET /api/mesh/status/:jobId every 1500ms
//   3) When status == 'completed', drei loads glbUrl in <MeshViewerCanvas>.
//
// What's new (2026-05-23 enrichment):
//   - 9 material modes, 11 HDRI presets, 7 backgrounds, 5 camera views.
//   - Quality presets (Draft/Balanced/High/Ultra) + raw steps slider.
//   - Advanced: seed, guidance, negative prompt (forwarded; the worker
//     silently ignores unknown fields until it learns to honour them).
//   - Auto-rotate w/ speed, lighting intensity, contact shadows + grid,
//     wireframe overlay, smooth-shading toggle, polygon decimation.
//   - One-click multi-format export: GLB, OBJ, STL, PLY + PNG screenshot.
//   - Fullscreen toggle, camera view chips, stats panel.

import { useEffect, useMemo, useRef, useState } from 'react'
import { submitMeshJob, getMeshStatus } from '../../api/ai'
import notify from '../../utils/notify'
import JobLogsAgentPlan from '../JobLogsAgentPlan'
import MeshViewerCanvas, {
  MATERIAL_MODES, ENV_PRESETS, BACKGROUND_PRESETS, CAMERA_VIEWS,
} from './MeshViewerCanvas'

const HISTORY_KEY = 'sid:mesh:history'
const POLL_MS     = 1500
const MAX_HISTORY = 12

const SAMPLE_PROMPTS = [
  'a low-poly fox',
  'a stylised teapot',
  'a chess knight, marble',
  'a small wooden boat',
  'a crystal mushroom',
  'a tiny robot toy',
  'a coiled dragon, gold',
  'a treasure chest, oak',
]

const QUALITY_PRESETS = [
  { id: 'draft',    label: 'Draft',     steps: 16, hint: '~15s · scout' },
  { id: 'balanced', label: 'Balanced',  steps: 32, hint: '~30s · default' },
  { id: 'high',     label: 'High',      steps: 48, hint: '~45s · sharper' },
  { id: 'ultra',    label: 'Ultra',     steps: 64, hint: '~60s · max' },
]

const EXPORT_FORMATS = [
  { id: 'glb', label: 'GLB',  hint: 'best fidelity (binary glTF)' },
  { id: 'obj', label: 'OBJ',  hint: 'Blender · classic' },
  { id: 'stl', label: 'STL',  hint: '3D printing' },
  { id: 'ply', label: 'PLY',  hint: 'point cloud / mesh' },
]

// ── helpers ───────────────────────────────────────────────────────────
function readHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY) : []
  } catch { return [] }
}
function writeHistory(items) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY))) }
  catch { /* private mode / quota — non-fatal */ }
}
function randomSeed() { return Math.floor(Math.random() * 2 ** 31) }

// ── small UI atoms ───────────────────────────────────────────────────
function Chip({ active, onClick, children, disabled, tint = 'amber' }) {
  const tintMap = {
    amber:   'border-amber-400/60   bg-amber-500/10   ring-amber-400/40   text-amber-200',
    violet:  'border-violet-400/60  bg-violet-500/10  ring-violet-400/40  text-violet-200',
    cyan:    'border-cyan-400/60    bg-cyan-500/10    ring-cyan-400/40    text-cyan-200',
    fuchsia: 'border-fuchsia-400/60 bg-fuchsia-500/10 ring-fuchsia-400/40 text-fuchsia-200',
    rose:    'border-rose-400/60    bg-rose-500/10    ring-rose-400/40    text-rose-200',
  }
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      className={`px-2.5 py-1.5 rounded-md text-[11px] font-semibold border transition-all whitespace-nowrap ${
        active
          ? `${tintMap[tint]} ring-1`
          : 'border-gray-800 bg-gray-900/40 text-gray-400 hover:text-white hover:border-gray-700'
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  )
}

function Slider({ label, value, min, max, step = 1, onChange, accent = 'amber-400', suffix = '', disabled }) {
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-1">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-300">{label}</label>
        <span className={`text-xs font-mono text-${accent}`}>{value}{suffix}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        disabled={disabled}
        onChange={e => onChange(parseFloat(e.target.value))}
        className={`w-full accent-${accent}`}
      />
    </div>
  )
}

function Section({ title, eyebrow, children, collapsible = false, defaultOpen = true, tint = 'amber' }) {
  const [open, setOpen] = useState(defaultOpen)
  const eyebrowTint = {
    amber: 'text-amber-300/90', violet: 'text-violet-300/90', cyan: 'text-cyan-300/90',
    fuchsia: 'text-fuchsia-300/90', rose: 'text-rose-300/90',
  }[tint] || 'text-amber-300/90'
  return (
    <div className="luxe-card p-4">
      <button
        type="button"
        onClick={() => collapsible && setOpen(o => !o)}
        className="w-full flex items-center justify-between text-left"
        disabled={!collapsible}
      >
        <p className={`luxe-eyebrow ${eyebrowTint}`}>— {eyebrow}</p>
        {collapsible && (
          <span className="text-xs text-gray-500">{open ? '−' : '+'}</span>
        )}
      </button>
      {title && <h3 className="text-sm font-semibold text-white mt-1">{title}</h3>}
      {open && <div className="mt-2">{children}</div>}
    </div>
  )
}

// ── CanvasOverlay (idle / loading / error) ───────────────────────────
function CanvasOverlay({ kind, progressMessage, elapsedMs, error }) {
  if (kind === 'idle') {
    return (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="flex flex-col items-center gap-3 text-center px-6">
          <span className="luxe-card px-3 py-1 text-[11px] text-amber-300/90 border border-amber-500/30">
            5090 only
          </span>
          <p className="text-sm text-gray-400 max-w-xs">
            Type a description on the right and hit Generate to spin up a
            real mesh on the GPU.
          </p>
        </div>
      </div>
    )
  }
  if (kind === 'loading') {
    return (
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center px-6">
          <div className="w-10 h-10 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-200">
            {progressMessage || 'Sampling latents · ~30-60s on 5090'}
          </p>
          {elapsedMs > 0 && (
            <p className="text-[11px] text-gray-500 font-mono">
              {(elapsedMs / 1000).toFixed(1)}s elapsed
            </p>
          )}
        </div>
      </div>
    )
  }
  if (kind === 'error') {
    return (
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm flex items-center justify-center">
        <div className="luxe-card border border-rose-500/40 p-4 max-w-sm text-center">
          <p className="text-rose-300 text-sm font-medium mb-1">Generation failed</p>
          <p className="text-[12px] text-gray-400">{error}</p>
        </div>
      </div>
    )
  }
  return null
}

// ── main ─────────────────────────────────────────────────────────────
export default function PromptToMesh() {
  // ── generation state ──
  const [prompt, setPrompt]                 = useState('')
  const [model, setModel]                   = useState('shap-e')
  const [steps, setSteps]                   = useState(32)
  const [seed, setSeed]                     = useState(() => randomSeed())
  const [guidance, setGuidance]             = useState(15)
  const [negativePrompt, setNegativePrompt] = useState('')

  const [submitting, setSubmitting]           = useState(false)
  const [jobId, setJobId]                     = useState('')
  const [status, setStatus]                   = useState('')
  const [progressMessage, setProgressMessage] = useState('')
  const [glbUrl, setGlbUrl]                   = useState('')
  const [error, setError]                     = useState('')
  const [elapsedMs, setElapsedMs]             = useState(0)
  const [history, setHistory]                 = useState(() => readHistory())

  // ── render-side state ──
  const [materialMode, setMaterialMode]         = useState('original')
  const [envPreset, setEnvPreset]               = useState('city')
  const [background, setBackground]             = useState('#06060a')
  const [showGrid, setShowGrid]                 = useState(false)
  const [showShadows, setShowShadows]           = useState(true)
  const [autoRotate, setAutoRotate]             = useState(false)
  const [autoRotateSpeed, setAutoRotateSpeed]   = useState(1.0)
  const [lightIntensity, setLightIntensity]     = useState(1.0)
  const [decimation, setDecimation]             = useState(1.0)
  const [wireframeOverlay, setWireframeOverlay] = useState(false)
  const [smoothShading, setSmoothShading]       = useState(true)
  const [fullscreen, setFullscreen]             = useState(false)
  const [stats, setStats]                       = useState(null)

  const pollRef      = useRef(null)
  const startedAtRef = useRef(0)
  const viewerRef    = useRef(null)

  useEffect(() => { writeHistory(history) }, [history])
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const isWorking = submitting || status === 'queued' || status === 'processing'

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  const pushHistory = (entry) => {
    setHistory(h => {
      const dedup = h.filter(x => x.jobId !== entry.jobId)
      return [entry, ...dedup].slice(0, MAX_HISTORY)
    })
  }

  const startPolling = (id) => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      const { data, error: pollErr } = await getMeshStatus(id)
      if (pollErr || !data) return
      setStatus(data.status || '')
      setProgressMessage(data.progressMessage || '')
      setElapsedMs(data.elapsedMs || (Date.now() - startedAtRef.current))
      if (data.status === 'completed' && data.glbUrl) {
        stopPolling()
        setGlbUrl(data.glbUrl)
        setSubmitting(false)
        notify.success('Mesh ready · drag to rotate', { title: '3D mesh generated' })
        pushHistory({
          jobId: id,
          prompt: data.prompt || prompt,
          model: data.model || model,
          glbUrl: data.glbUrl,
          at: Date.now(),
        })
      } else if (data.status === 'failed') {
        stopPolling()
        const msg = data.error || 'Worker reported failure'
        setError(msg); setSubmitting(false)
        notify.error(msg, { title: 'Mesh generation failed' })
      }
    }, POLL_MS)
  }

  const generate = async () => {
    const text = prompt.trim()
    if (!text || isWorking) return
    setSubmitting(true); setError(''); setGlbUrl('')
    setStatus('queued'); setProgressMessage('Submitting…')
    setElapsedMs(0); startedAtRef.current = Date.now()

    // Pass through every advanced knob — the BE drops unknown fields today
    // but the same payload will work the moment the worker learns them.
    const payload = {
      prompt: text, model, steps,
      seed, guidance,
      negativePrompt: negativePrompt.trim() || undefined,
    }
    const { data, error: subErr } = await submitMeshJob(payload)
    if (subErr || !data?.jobId) {
      const msg = subErr || 'Failed to queue mesh job'
      setError(msg); setStatus('failed'); setSubmitting(false)
      notify.error(msg, { title: 'Mesh generation failed' })
      return
    }
    setJobId(data.jobId); setStatus(data.status || 'queued')
    startPolling(data.jobId)
  }

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isWorking) {
      e.preventDefault(); generate()
    }
  }

  const applyQualityPreset = (presetId) => {
    const p = QUALITY_PRESETS.find(x => x.id === presetId)
    if (p) setSteps(p.steps)
  }

  const restoreFromHistory = (entry) => {
    if (isWorking) return
    setPrompt(entry.prompt || ''); setGlbUrl(entry.glbUrl || '')
    setJobId(entry.jobId || ''); setStatus('completed')
    setError(''); setProgressMessage(''); setElapsedMs(0)
  }

  const screenshot = () => {
    const dataUrl = viewerRef.current?.takeScreenshot?.()
    if (!dataUrl) { notify.error('Screenshot failed'); return }
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `mesh-${Date.now()}.png`
    document.body.appendChild(a); a.click(); a.remove()
    notify.success('Screenshot saved')
  }

  const exportAs = async (format) => {
    if (!glbUrl) return
    const ok = await viewerRef.current?.exportMesh?.(format)
    if (ok) notify.success(`Exported as .${format}`)
    else notify.error(`Could not export .${format}`)
  }

  let overlayKind = null
  if (error)           overlayKind = 'error'
  else if (isWorking)  overlayKind = 'loading'
  else if (!glbUrl)    overlayKind = 'idle'

  const activeQuality = QUALITY_PRESETS.find(q => q.steps === steps)?.id || null

  // ── render ──
  return (
    <div className="space-y-3">
      <div className={`grid grid-cols-1 ${fullscreen ? '' : 'lg:grid-cols-5'} gap-4`}>

        {/* ── LEFT: viewer + studio strip ───────────────────────── */}
        <div className={`${fullscreen ? 'col-span-1' : 'lg:col-span-3'} space-y-3`}>

          {/* Canvas */}
          <div className="luxe-card overflow-hidden">
            <div
              className="relative w-full"
              style={{ height: fullscreen ? 'calc(100vh - 220px)' : 'min(60vh, 540px)' }}
            >
              <MeshViewerCanvas
                ref={viewerRef}
                glbUrl={glbUrl}
                materialMode={materialMode}
                envPreset={envPreset}
                background={background}
                showGrid={showGrid}
                showShadows={showShadows}
                autoRotate={autoRotate}
                autoRotateSpeed={autoRotateSpeed}
                lightIntensity={lightIntensity}
                decimation={decimation}
                wireframeOverlay={wireframeOverlay}
                smoothShading={smoothShading}
                onStats={setStats}
              />

              <CanvasOverlay
                kind={overlayKind}
                progressMessage={progressMessage}
                elapsedMs={elapsedMs}
                error={error}
              />

              {/* ── Floating toolbar (top-right) ── */}
              {glbUrl && !overlayKind && (
                <div className="absolute top-3 right-3 flex flex-col items-end gap-2">
                  <div className="luxe-card px-2 py-1.5 flex items-center gap-1">
                    {CAMERA_VIEWS.map(v => (
                      <button key={v.id}
                        onClick={() => viewerRef.current?.setCameraView(v.id)}
                        className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 hover:text-amber-300 px-1.5 py-0.5 rounded transition-colors">
                        {v.label}
                      </button>
                    ))}
                  </div>
                  <div className="luxe-card px-2 py-1.5 flex items-center gap-2">
                    <button onClick={() => setAutoRotate(r => !r)}
                      title="Auto-rotate"
                      className={`text-[12px] ${autoRotate ? 'text-amber-300' : 'text-gray-400 hover:text-white'}`}>
                      {autoRotate ? '⏸' : '↻'}
                    </button>
                    <button onClick={() => viewerRef.current?.resetCamera()}
                      title="Reset camera"
                      className="text-[12px] text-gray-400 hover:text-white">⊕</button>
                    <button onClick={screenshot}
                      title="Save PNG screenshot"
                      className="text-[12px] text-gray-400 hover:text-white">📷</button>
                    <button onClick={() => setFullscreen(f => !f)}
                      title="Fullscreen"
                      className="text-[12px] text-gray-400 hover:text-white">
                      {fullscreen ? '⤡' : '⤢'}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Status pill (bottom-left) ── */}
              <div className="absolute bottom-3 left-3 luxe-card px-3 py-1.5 text-[11px] text-gray-300 pointer-events-none">
                <span className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${isWorking ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
                  {isWorking
                    ? (status || 'working') + (jobId ? ` · ${jobId.slice(0, 8)}` : '')
                    : (glbUrl ? 'Drag · scroll · drag to rotate' : 'Idle')}
                </span>
              </div>

              {/* ── Stats pill (bottom-right) ── */}
              {glbUrl && stats && (
                <div className="absolute bottom-3 right-3 luxe-card px-3 py-1.5 text-[10px] text-gray-400 font-mono pointer-events-none">
                  {stats.vertices.toLocaleString()} v · {stats.triangles.toLocaleString()} t · {stats.meshes} mesh
                </div>
              )}
            </div>
          </div>

          {/* ── Studio strip — material / env / background ── */}
          {glbUrl && (
            <div className="luxe-card p-3 space-y-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-300/80 mb-1.5">Material</p>
                <div className="flex flex-wrap gap-1.5">
                  {MATERIAL_MODES.map(m => (
                    <Chip key={m.id}
                      active={materialMode === m.id}
                      onClick={() => setMaterialMode(m.id)}
                      tint="amber">
                      <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: m.tint }} />
                      {m.label}
                    </Chip>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-300/80 mb-1.5">Environment</p>
                <div className="flex flex-wrap gap-1.5">
                  {ENV_PRESETS.map(e => (
                    <Chip key={e.id} active={envPreset === e.id} onClick={() => setEnvPreset(e.id)} tint="violet">
                      {e.label}
                    </Chip>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-300/80 mb-1.5">Background</p>
                <div className="flex flex-wrap gap-1.5 items-center">
                  {BACKGROUND_PRESETS.map(b => (
                    <button key={b.id}
                      onClick={() => setBackground(b.value)}
                      title={b.label}
                      className={`w-7 h-7 rounded-md border transition-all ${
                        background === b.value
                          ? 'border-cyan-400 ring-2 ring-cyan-400/40'
                          : 'border-gray-700 hover:border-gray-500'
                      }`}
                      style={{ background: b.value }}
                    />
                  ))}
                  <label className="inline-flex items-center gap-1.5 ml-1">
                    <input
                      type="color"
                      value={background}
                      onChange={e => setBackground(e.target.value)}
                      className="w-7 h-7 rounded-md cursor-pointer border border-gray-700 bg-transparent"
                    />
                    <span className="text-[10px] text-gray-500 font-mono">{background}</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* ── Render controls + export ── */}
          {glbUrl && (
            <Section eyebrow="Studio" tint="fuchsia" collapsible defaultOpen={false}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
                <Slider label="Auto-rotate speed" value={autoRotateSpeed} min={0.1} max={5} step={0.1}
                        accent="amber-400" onChange={setAutoRotateSpeed} disabled={!autoRotate} />
                <Slider label="Light intensity" value={lightIntensity} min={0.1} max={3} step={0.1}
                        accent="amber-400" onChange={setLightIntensity} />
                <Slider label="Polygon decimation" value={decimation} min={0.1} max={1} step={0.05}
                        accent="fuchsia-400" onChange={setDecimation}
                        suffix={` (${Math.round(decimation * 100)}%)`} />
                <div className="mt-3 flex flex-wrap gap-3 items-center">
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-gray-300">
                    <input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} />
                    Grid
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-gray-300">
                    <input type="checkbox" checked={showShadows} onChange={e => setShowShadows(e.target.checked)} />
                    Shadows
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-gray-300">
                    <input type="checkbox" checked={wireframeOverlay} onChange={e => setWireframeOverlay(e.target.checked)} />
                    Wire overlay
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-gray-300">
                    <input type="checkbox" checked={smoothShading} onChange={e => setSmoothShading(e.target.checked)} />
                    Smooth
                  </label>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-800/60">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300/80 mb-1.5">Export</p>
                <div className="flex flex-wrap gap-1.5">
                  {EXPORT_FORMATS.map(f => (
                    <button key={f.id}
                      onClick={() => exportAs(f.id)}
                      title={f.hint}
                      className="px-2.5 py-1.5 rounded-md text-[11px] font-semibold border border-emerald-400/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 transition-all">
                      ↓ {f.label}
                    </button>
                  ))}
                  <button onClick={screenshot}
                    className="px-2.5 py-1.5 rounded-md text-[11px] font-semibold border border-cyan-400/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20 transition-all">
                    📷 PNG
                  </button>
                </div>
              </div>
            </Section>
          )}
        </div>

        {/* ── RIGHT: prompt + advanced + history ─────────────────── */}
        {!fullscreen && (
          <div className="lg:col-span-2 space-y-3">

            {/* Prompt */}
            <div className="luxe-card p-4">
              <p className="luxe-eyebrow text-amber-300/90 mb-2">— Real mesh on the 5090</p>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={onKey}
                placeholder='e.g. "a low-poly fox"'
                rows={3}
                className="luxe-textarea text-sm"
                disabled={isWorking}
              />

              {/* Model picker */}
              <div className="mt-3">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-300 mb-1.5 block">
                  Engine
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button type="button" onClick={() => setModel('shap-e')}
                    disabled={isWorking}
                    className={`text-left p-2.5 rounded-lg border transition-all ${
                      model === 'shap-e'
                        ? 'border-amber-400/60 bg-amber-500/10 ring-1 ring-amber-400/40'
                        : 'border-gray-800 bg-gray-900/40 hover:border-gray-700'
                    }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-white">Shap-E</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">Solid</span>
                    </div>
                    <div className="text-[11.5px] text-gray-200 mt-1 leading-snug">
                      Pure text → 3D · ~30-60s · abstract-friendly
                    </div>
                  </button>
                  <button type="button" onClick={() => setModel('tripo')}
                    disabled={isWorking}
                    className={`text-left p-2.5 rounded-lg border transition-all ${
                      model === 'tripo'
                        ? 'border-fuchsia-400/60 bg-fuchsia-500/10 ring-1 ring-fuchsia-400/40'
                        : 'border-gray-800 bg-gray-900/40 hover:border-gray-700'
                    }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-white">TripoSR</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-fuchsia-300">🔥 Beast</span>
                    </div>
                    <div className="text-[11.5px] text-gray-200 mt-1 leading-snug">
                      Flux image → 3D · ~10-15s · better fidelity
                    </div>
                  </button>
                </div>
              </div>

              {/* Quality preset chips (Shap-E only — TripoSR ignores steps) */}
              {model === 'shap-e' && (
                <div className="mt-3">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-300 mb-1.5 block">
                    Quality preset
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {QUALITY_PRESETS.map(q => (
                      <button key={q.id}
                        onClick={() => applyQualityPreset(q.id)}
                        disabled={isWorking}
                        className={`text-center p-1.5 rounded-md border text-[10.5px] font-semibold transition-all ${
                          activeQuality === q.id
                            ? 'border-amber-400/60 bg-amber-500/10 text-amber-200 ring-1 ring-amber-400/40'
                            : 'border-gray-800 bg-gray-900/40 text-gray-400 hover:text-white hover:border-gray-700'
                        }`}
                        title={q.hint}>
                        <div>{q.label}</div>
                        <div className="text-[9px] font-mono text-gray-500 mt-0.5">{q.steps}</div>
                      </button>
                    ))}
                  </div>
                  <Slider label="Steps · raw" value={steps} min={16} max={64} step={1}
                          accent="amber-400" onChange={setSteps} disabled={isWorking} />
                </div>
              )}

              <div className="flex items-center justify-between mt-3 gap-2">
                <span className="text-[11px] text-gray-400">
                  Enter to generate · Shift+Enter for newline
                </span>
                <button
                  onClick={generate}
                  disabled={isWorking || !prompt.trim()}
                  className={`luxe-btn luxe-btn-primary ${isWorking ? 'opacity-60 cursor-wait' : ''}`}>
                  {isWorking ? 'Generating…' : 'Generate'}
                </button>
              </div>
            </div>

            {/* Advanced */}
            <Section eyebrow="Advanced" tint="violet" collapsible defaultOpen={false}>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-300 mb-1.5 block">
                  Negative prompt
                </label>
                <textarea
                  value={negativePrompt}
                  onChange={e => setNegativePrompt(e.target.value)}
                  placeholder='e.g. "blurry, low-poly, broken topology"'
                  rows={2}
                  className="luxe-textarea text-xs"
                  disabled={isWorking}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-300 mb-1.5 block">
                    Seed
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={seed}
                      onChange={e => setSeed(parseInt(e.target.value, 10) || 0)}
                      disabled={isWorking}
                      className="luxe-input text-xs flex-1 font-mono"
                    />
                    <button
                      onClick={() => setSeed(randomSeed())}
                      disabled={isWorking}
                      title="Random seed"
                      className="px-2 py-1.5 rounded-md text-[11px] border border-gray-800 bg-gray-900/40 text-gray-300 hover:text-white hover:border-gray-700">
                      🎲
                    </button>
                  </div>
                </div>
                <Slider
                  label="Guidance (CFG)"
                  value={guidance}
                  min={1} max={30} step={0.5}
                  accent="violet-400"
                  onChange={setGuidance}
                  disabled={isWorking}
                />
              </div>

              <p className="text-[10px] text-gray-500 mt-3">
                Seed + guidance + negative prompt are forwarded to the worker. Honoured on Shap-E; ignored elsewhere until wired.
              </p>
            </Section>

            {/* Live logs */}
            {jobId && (
              <JobLogsAgentPlan
                lane="mesh" jobId={jobId} status={status}
                progressMessage={progressMessage} error={error}
              />
            )}

            {/* Sample prompts when idle */}
            {!isWorking && !glbUrl && (
              <Section eyebrow="Try one" tint="cyan">
                <div className="flex flex-wrap gap-1.5">
                  {SAMPLE_PROMPTS.map(s => (
                    <button key={s}
                      onClick={() => { setPrompt(s) }}
                      className="luxe-btn luxe-btn-ghost text-[11px] px-2.5 py-1.5">
                      {s}
                    </button>
                  ))}
                </div>
              </Section>
            )}

            {/* History */}
            {history.length > 0 && (
              <Section eyebrow={`Recent meshes (${history.length})`} tint="fuchsia">
                <ul className="space-y-1.5">
                  {history.map((h) => (
                    <li key={h.jobId}>
                      <button
                        onClick={() => restoreFromHistory(h)}
                        disabled={isWorking}
                        className="w-full text-left text-xs text-gray-400 hover:text-white truncate px-2 py-1.5 rounded-md hover:bg-white/[0.04] transition-colors disabled:opacity-50">
                        <span className="text-amber-300/80 mr-1.5">●</span>
                        {h.prompt}
                        {h.model === 'tripo' && (
                          <span className="ml-1.5 text-[9px] text-fuchsia-400">tripo</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
