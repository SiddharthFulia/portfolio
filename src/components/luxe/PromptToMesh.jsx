// PromptToMesh — type a description → submit to BE Shap-E worker on
// the 5090 → poll until done → render the resulting .glb in
// react-three-fiber. Unlike the Groq DSL tab next door this is a real
// generated mesh: a single triangle soup produced by a diffusion model.
//
// Flow:
//   1) POST /api/mesh/generate { prompt, model, steps } → { jobId }
//   2) Poll GET /api/mesh/status/:jobId every 1500ms
//   3) When status == 'completed', drei's useGLTF loads glbUrl
//   4) Bounding box auto-scales the mesh to a unit cube so the camera
//      framing works for every prompt without re-aiming.
//
// History (last 8 jobs) persists to localStorage so a refresh keeps
// the user's recent meshes one click away.
//
// All generation happens on a self-hosted RTX 5090. If the worker is
// offline the BE returns 'failed' with a clear error — see the amber
// note rendered above the prompt.

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { useGLTF, PresentationControls, Environment } from '@react-three/drei'
import * as THREE from 'three'
import { submitMeshJob, getMeshStatus } from '../../api/ai'
import notify from '../../utils/notify'

const HISTORY_KEY = 'sid:mesh:history'
const POLL_MS     = 1500
const MAX_HISTORY = 8

const SAMPLE_PROMPTS = [
  'a low-poly fox',
  'a stylised teapot',
  'a chess knight, marble',
  'a small wooden boat',
  'a crystal mushroom',
  'a tiny robot toy',
]

// ── GltfModel ─────────────────────────────────────────────────────
// Loads + auto-centers + auto-scales-to-unit-cube. Re-keying the
// parent <Suspense> by url forces drei to drop the previous gltf
// when the user picks a new mesh from history.
function GltfModel({ url }) {
  const { scene } = useGLTF(url)
  const cloned = useMemo(() => scene.clone(true), [scene])
  const { center, scale } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(cloned)
    const size = new THREE.Vector3()
    box.getSize(size)
    const c = new THREE.Vector3()
    box.getCenter(c)
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    return { center: c, scale: 1.4 / maxDim }
  }, [cloned])
  return (
    <group scale={scale} position={[-center.x * scale, -center.y * scale, -center.z * scale]}>
      <primitive object={cloned} />
    </group>
  )
}

// ── Idle / loading placeholders for the canvas overlay ────────────
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
            real Shap-E mesh on the GPU.
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
            {progressMessage || 'Shap-E sampling latents · ~30-60s on 5090'}
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

// ── Helper: read / write history safely (corrupt JSON → []) ────────
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
  catch { /* localStorage full / private mode — non-fatal */ }
}

export default function PromptToMesh() {
  const [prompt, setPrompt]                 = useState('')
  const [model, setModel]                   = useState('shap-e')
  const [steps, setSteps]                   = useState(32)
  const [submitting, setSubmitting]         = useState(false)
  const [jobId, setJobId]                   = useState('')
  const [status, setStatus]                 = useState('')          // 'queued' | 'processing' | 'completed' | 'failed'
  const [progressMessage, setProgressMessage] = useState('')
  const [glbUrl, setGlbUrl]                 = useState('')
  const [error, setError]                   = useState('')
  const [elapsedMs, setElapsedMs]           = useState(0)
  const [history, setHistory]               = useState(() => readHistory())

  const pollRef     = useRef(null)
  const startedAtRef = useRef(0)

  // Rehydrate history into localStorage when it changes.
  useEffect(() => { writeHistory(history) }, [history])

  // Stop polling on unmount — critical, otherwise we leak setIntervals
  // across navigations.
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const isWorking = submitting || status === 'queued' || status === 'processing'

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
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
      if (pollErr) {
        // Transient network errors keep polling — only stop on terminal job state.
        return
      }
      if (!data) return
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
        setError(msg)
        setSubmitting(false)
        notify.error(msg, { title: 'Mesh generation failed' })
      }
    }, POLL_MS)
  }

  const generate = async () => {
    const text = prompt.trim()
    if (!text || isWorking) return
    setSubmitting(true)
    setError('')
    setGlbUrl('')
    setStatus('queued')
    setProgressMessage('Submitting…')
    setElapsedMs(0)
    startedAtRef.current = Date.now()

    const { data, error: subErr } = await submitMeshJob({ prompt: text, model, steps })
    if (subErr || !data?.jobId) {
      const msg = subErr || 'Failed to queue mesh job'
      setError(msg)
      setStatus('failed')
      setSubmitting(false)
      notify.error(msg, { title: 'Mesh generation failed' })
      return
    }
    setJobId(data.jobId)
    setStatus(data.status || 'queued')
    startPolling(data.jobId)
  }

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isWorking) {
      e.preventDefault(); generate()
    }
  }

  const restoreFromHistory = (entry) => {
    if (isWorking) return
    setPrompt(entry.prompt || '')
    setGlbUrl(entry.glbUrl || '')
    setJobId(entry.jobId || '')
    setStatus('completed')
    setError('')
    setProgressMessage('')
    setElapsedMs(0)
  }

  // Pick the right overlay for the current state.
  let overlayKind = null
  if (error)                       overlayKind = 'error'
  else if (isWorking)              overlayKind = 'loading'
  else if (!glbUrl)                overlayKind = 'idle'

  return (
    <div className="space-y-3">
      {/* 5090 worker note */}
      <div className="luxe-card p-3 border border-amber-500/30 bg-amber-500/[0.04] flex items-start gap-3">
        <span className="text-xl leading-none mt-0.5">🔥</span>
        <p className="text-[12.5px] text-amber-100/85 leading-relaxed">
          Generation runs on your home GPU. Up to ~60s per mesh. If the
          worker is offline you'll see a queue-stuck error; switch back
          to the Groq tab for instant results.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* 3D stage */}
        <div className="lg:col-span-3 luxe-card overflow-hidden">
          <div className="relative w-full" style={{ height: 'min(60vh, 540px)' }}>
            <Canvas camera={{ position: [0, 0, 3], fov: 45 }} dpr={[1, 2]}>
              <Suspense fallback={null}>
                <color attach="background" args={['#06060a']} />
                <ambientLight intensity={0.55} />
                <directionalLight position={[4, 6, 5]} intensity={1.2} color="#fde68a" />
                <directionalLight position={[-4, -2, -3]} intensity={0.7} color="#a78bfa" />
                {glbUrl && (
                  <PresentationControls
                    global
                    snap
                    polar={[-Math.PI / 3, Math.PI / 3]}
                    azimuth={[-Math.PI, Math.PI]}
                    config={{ mass: 1, tension: 220, friction: 24 }}>
                    <GltfModel key={glbUrl} url={glbUrl} />
                  </PresentationControls>
                )}
                <Environment preset="city" />
              </Suspense>
            </Canvas>

            <CanvasOverlay
              kind={overlayKind}
              progressMessage={progressMessage}
              elapsedMs={elapsedMs}
              error={error}
            />

            {/* Footer hint */}
            <div className="absolute bottom-3 left-3 luxe-card px-3 py-1.5 text-[11px] text-gray-300 pointer-events-none">
              <span className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${isWorking ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
                {isWorking
                  ? (status || 'working') + (jobId ? ` · ${jobId.slice(0, 8)}` : '')
                  : (glbUrl ? 'Drag to rotate · 5090 mesh' : 'Idle')}
              </span>
            </div>
          </div>
        </div>

        {/* Right column */}
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

            {/* Steps slider */}
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] uppercase tracking-wider text-gray-500">
                  Steps · quality vs speed
                </label>
                <span className="text-[10px] font-mono text-gray-400">{steps}</span>
              </div>
              <input
                type="range" min={16} max={64} step={1}
                value={steps}
                disabled={isWorking}
                onChange={e => setSteps(parseInt(e.target.value, 10))}
                className="w-full accent-amber-400" />
            </div>

            <div className="flex items-center justify-between mt-3 gap-2">
              <span className="text-[10px] text-gray-500">
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

          {/* Sample prompts when idle */}
          {!isWorking && !glbUrl && (
            <div className="luxe-card p-4">
              <p className="luxe-eyebrow text-cyan-300/80 mb-2">— Try one</p>
              <div className="flex flex-wrap gap-1.5">
                {SAMPLE_PROMPTS.map(s => (
                  <button key={s}
                    onClick={() => { setPrompt(s) }}
                    className="luxe-btn luxe-btn-ghost text-[11px] px-2.5 py-1.5">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* History */}
          {history.length > 0 && (
            <div className="luxe-card p-4">
              <p className="luxe-eyebrow text-fuchsia-300/80 mb-2">— Recent meshes</p>
              <ul className="space-y-1.5">
                {history.map((h) => (
                  <li key={h.jobId}>
                    <button
                      onClick={() => restoreFromHistory(h)}
                      disabled={isWorking}
                      className="w-full text-left text-xs text-gray-400 hover:text-white truncate px-2 py-1.5 rounded-md hover:bg-white/[0.04] transition-colors disabled:opacity-50">
                      <span className="text-amber-300/80 mr-1.5">●</span>
                      {h.prompt}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
