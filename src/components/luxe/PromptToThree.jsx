// PromptToThree — type a description, Groq writes a constrained JSON
// scene DSL, we render it live with react-three-fiber. No `eval`, no
// arbitrary code execution: the LLM only ever produces JSON that
// matches our schema, and we sanity-check every field before passing
// it to Three.js. Generation takes ~1-2s on Groq Llama 3.3 70B.

import { Suspense, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Stars, Float } from '@react-three/drei'
import * as THREE from 'three'
import { sendGroq } from '../../api/ai'
import notify from '../../utils/notify'

// ── Whitelisted geometry constructors ──────────────────────────────
// Adding new ones is a 2-line change: append the key + factory below.
// We never trust the LLM to instantiate things — we pick the geometry
// type, the LLM only supplies args.
const GEOMETRIES = {
  box:         (a = [1, 1, 1])    => <boxGeometry args={a} />,
  sphere:      (a = [1, 32, 32])  => <sphereGeometry args={a} />,
  icosahedron: (a = [1, 0])       => <icosahedronGeometry args={a} />,
  dodecahedron:(a = [1, 0])       => <dodecahedronGeometry args={a} />,
  octahedron:  (a = [1, 0])       => <octahedronGeometry args={a} />,
  tetrahedron: (a = [1, 0])       => <tetrahedronGeometry args={a} />,
  torus:       (a = [1, 0.4, 16, 64]) => <torusGeometry args={a} />,
  torusKnot:   (a = [1, 0.3, 64, 8])  => <torusKnotGeometry args={a} />,
  cone:        (a = [1, 2, 32])   => <coneGeometry args={a} />,
  cylinder:    (a = [1, 1, 2, 32])=> <cylinderGeometry args={a} />,
  plane:       (a = [4, 4])       => <planeGeometry args={a} />,
}

const ALLOWED_ANIMATIONS = new Set([
  'none', 'spin-y', 'spin-x', 'spin-xy', 'float', 'pulse', 'orbit-center',
])

// Coerce LLM output into a safe shape. Anything out-of-schema gets
// dropped, anything missing gets sensible defaults. This is the trust
// boundary between the LLM and the renderer.
function sanitiseScene(raw) {
  if (!raw || typeof raw !== 'object') return null
  const num   = (v, d = 0)  => (typeof v === 'number' && isFinite(v) ? v : d)
  const hex   = (v, d)      => (typeof v === 'string' && /^#?[0-9a-f]{3,8}$/i.test(v) ? v : d)
  const v3    = (v, d = [0, 0, 0]) =>
    (Array.isArray(v) && v.length === 3 ? v.map(x => num(x, 0)) : d)
  const arrayOf = (v, max = 8) => (Array.isArray(v) ? v.slice(0, max) : [])

  return {
    background: hex(raw.background, '#06060a'),
    lights: arrayOf(raw.lights, 4).map(l => ({
      type:      ['ambient', 'point', 'directional'].includes(l?.type) ? l.type : 'ambient',
      color:     hex(l?.color, '#ffffff'),
      intensity: Math.max(0, num(l?.intensity, 1)),
      position:  v3(l?.position, [4, 4, 4]),
    })),
    meshes: arrayOf(raw.meshes, 8).map(m => ({
      geometry: GEOMETRIES[m?.geometry] ? m.geometry : 'icosahedron',
      args:     Array.isArray(m?.args) ? m.args.map(x => num(x, 1)).slice(0, 6) : undefined,
      position: v3(m?.position, [0, 0, 0]),
      rotation: v3(m?.rotation, [0, 0, 0]),
      scale:    v3(m?.scale,    [1, 1, 1]),
      material: {
        color:             hex(m?.material?.color, '#8b5cf6'),
        emissive:          hex(m?.material?.emissive, '#000000'),
        emissiveIntensity: Math.max(0, num(m?.material?.emissiveIntensity, 0.4)),
        wireframe:         !!m?.material?.wireframe,
        roughness:         Math.min(1, Math.max(0, num(m?.material?.roughness, 0.4))),
        metalness:         Math.min(1, Math.max(0, num(m?.material?.metalness, 0.3))),
      },
      animation: ALLOWED_ANIMATIONS.has(m?.animation) ? m.animation : 'spin-y',
    })),
  }
}

// The system prompt — locks Groq into JSON only, restricts geometry
// types to our whitelist, caps mesh count, and explains the animation
// vocabulary. Output is fed into JSON.parse + sanitiseScene.
const SYSTEM_PROMPT = `You are a Three.js scene generator. Given a description, output ONE JSON object describing a small scene. No prose, no markdown, no code fences — JUST the raw JSON.

Schema:
{
  "background": "#hex",
  "lights": [
    { "type": "ambient" | "point" | "directional",
      "color": "#hex",
      "intensity": float,
      "position": [x, y, z] }
  ],
  "meshes": [
    {
      "geometry": "box" | "sphere" | "icosahedron" | "dodecahedron" |
                  "octahedron" | "tetrahedron" | "torus" | "torusKnot" |
                  "cone" | "cylinder" | "plane",
      "args": [float, ...],
      "position": [x, y, z],
      "rotation": [x, y, z],
      "scale": [x, y, z],
      "material": {
        "color": "#hex",
        "emissive": "#hex",
        "emissiveIntensity": float,
        "wireframe": false,
        "roughness": float (0..1),
        "metalness": float (0..1)
      },
      "animation": "none" | "spin-y" | "spin-x" | "spin-xy" | "float" | "pulse" | "orbit-center"
    }
  ]
}

Rules:
- 1 to 6 meshes max
- 1 to 3 lights (always at least one ambient + one point)
- Pick a palette that matches the prompt mood
- Emissive colors give a glow
- Coordinates roughly in [-3..3], scale in [0.2..1.5]
- For organic / creature prompts (dragon, snake, etc.) compose multiple icosahedron / torus / cone shapes
- Output JSON only.`

// Animate a mesh based on the LLM-chosen animation key. Frame-rate
// independent (we use delta).
function Animated({ animation, basePosition, baseRotation, children }) {
  const ref = useRef()
  const t0  = useRef(Math.random() * 1000)
  useFrame((state, delta) => {
    if (!ref.current) return
    const t = state.clock.elapsedTime + t0.current
    const m = ref.current
    if (animation === 'spin-y')     m.rotation.y += delta * 0.6
    else if (animation === 'spin-x') m.rotation.x += delta * 0.6
    else if (animation === 'spin-xy') {
      m.rotation.x += delta * 0.4; m.rotation.y += delta * 0.6
    }
    else if (animation === 'pulse') {
      const s = 1 + Math.sin(t * 2) * 0.12
      m.scale.set(s * baseScale[0], s * baseScale[1], s * baseScale[2])
    }
    else if (animation === 'orbit-center') {
      const r = Math.hypot(basePosition[0], basePosition[2]) || 1
      const ang = t * 0.5
      m.position.x = Math.cos(ang) * r
      m.position.z = Math.sin(ang) * r
      m.rotation.y += delta * 0.4
    }
    // 'float' is handled by drei's <Float> wrapper, 'none' = no-op
  })
  const baseScale = [1, 1, 1]
  return <group ref={ref} position={basePosition} rotation={baseRotation}>{children}</group>
}

function MeshFromSpec({ spec }) {
  const geom = GEOMETRIES[spec.geometry](spec.args)
  const mat  = (
    <meshStandardMaterial
      color={spec.material.color}
      emissive={spec.material.emissive}
      emissiveIntensity={spec.material.emissiveIntensity}
      wireframe={spec.material.wireframe}
      roughness={spec.material.roughness}
      metalness={spec.material.metalness}
    />
  )
  const meshNode = (
    <mesh scale={spec.scale} castShadow receiveShadow>
      {geom}
      {mat}
    </mesh>
  )
  if (spec.animation === 'float') {
    return (
      <Float position={spec.position} rotation={spec.rotation}
        speed={2} rotationIntensity={0.5} floatIntensity={0.8}>
        {meshNode}
      </Float>
    )
  }
  return (
    <Animated animation={spec.animation}
      basePosition={spec.position}
      baseRotation={spec.rotation}>
      {meshNode}
    </Animated>
  )
}

function SceneRoot({ scene }) {
  return (
    <>
      <color attach="background" args={[scene.background]} />
      <Stars radius={30} depth={50} count={1500} factor={3} fade speed={0.4} />
      {scene.lights.map((l, i) => {
        if (l.type === 'ambient')     return <ambientLight key={i} intensity={l.intensity} color={l.color} />
        if (l.type === 'directional') return <directionalLight key={i} position={l.position} intensity={l.intensity} color={l.color} />
        return <pointLight key={i} position={l.position} intensity={l.intensity} color={l.color} />
      })}
      {scene.meshes.map((m, i) => <MeshFromSpec key={i} spec={m} />)}
    </>
  )
}

// Default starter scene shown before the user generates anything.
// Keeps the canvas from being empty on first paint.
const DEFAULT_SCENE = sanitiseScene({
  background: '#06060a',
  lights: [
    { type: 'ambient', intensity: 0.35 },
    { type: 'point', position: [4, 6, 4], color: '#8b5cf6', intensity: 1.8 },
    { type: 'point', position: [-4, -3, -2], color: '#22d3ee', intensity: 1.2 },
  ],
  meshes: [
    { geometry: 'icosahedron', args: [1.2, 0], position: [0, 0, 0], material: { color: '#7c3aed', emissive: '#3b0764', emissiveIntensity: 0.6, roughness: 0.25, metalness: 0.7 }, animation: 'spin-xy' },
    { geometry: 'torus', args: [2, 0.05, 16, 100], position: [0, 0, 0], rotation: [1.2, 0, 0], material: { color: '#22d3ee', emissive: '#0e7490', emissiveIntensity: 0.7, roughness: 0.4, metalness: 0.8 }, animation: 'spin-y' },
    { geometry: 'sphere', args: [0.18, 24, 24], position: [2.4, 0, 0], material: { color: '#ec4899', emissive: '#831843', emissiveIntensity: 1.2, roughness: 0.3 }, animation: 'orbit-center' },
  ],
})

const SAMPLE_PROMPTS = [
  'a majestic dragon coiled around a glowing pearl',
  'cyberpunk neon city in the rain',
  'crystal lotus flower with a glowing core',
  'futuristic spaceship at warp speed',
  'a cute robot waving hello',
  'aurora over snowy mountains',
]

export default function PromptToThree() {
  const [prompt, setPrompt]   = useState('')
  const [scene, setScene]     = useState(DEFAULT_SCENE)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState([])  // [{prompt, scene}]

  const generate = async () => {
    const text = prompt.trim()
    if (!text) return
    setLoading(true)
    try {
      // Ask Groq for the JSON DSL. Llama 3.3 70B follows the schema reliably.
      const { data, error } = await sendGroq(text, {
        system: SYSTEM_PROMPT,
        model: 'llama-3.3-70b',
        maxTokens: 1200,
        temperature: 0.85,
      })
      if (error) throw new Error(error)
      const raw = data?.reply || data?.message || ''
      // Strip code fences if the model wrapped the JSON anyway
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
      let parsed
      try { parsed = JSON.parse(cleaned) }
      catch (e) {
        // Try to find the first {...} block
        const m = cleaned.match(/\{[\s\S]*\}/)
        if (!m) throw new Error('Model returned unparseable output')
        parsed = JSON.parse(m[0])
      }
      const safe = sanitiseScene(parsed)
      if (!safe || !safe.meshes.length) throw new Error('Scene came back empty')
      setScene(safe)
      setHistory(h => [{ prompt: text, scene: safe }, ...h].slice(0, 8))
      notify.success(`${safe.meshes.length} mesh${safe.meshes.length === 1 ? '' : 'es'} · ${safe.lights.length} light${safe.lights.length === 1 ? '' : 's'}`, { title: 'Scene generated' })
    } catch (e) {
      notify.error(e.message || 'Generation failed')
    } finally {
      setLoading(false)
    }
  }

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !loading) { e.preventDefault(); generate() }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* 3D stage */}
      <div className="lg:col-span-3 luxe-card overflow-hidden">
        <div className="relative w-full" style={{ height: 'min(60vh, 540px)' }}>
          <Canvas camera={{ position: [0, 0, 6], fov: 50 }} shadows>
            <Suspense fallback={null}>
              <SceneRoot scene={scene} />
              <OrbitControls enablePan={false} enableZoom autoRotate={false} />
            </Suspense>
          </Canvas>
          {loading && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-300">Composing scene…</p>
                <p className="text-[11px] text-gray-500 font-mono">Groq Llama 3.3 70B</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Prompt + samples + history */}
      <div className="lg:col-span-2 space-y-3">
        <div className="luxe-card p-4">
          <p className="luxe-eyebrow text-violet-300/80 mb-2">— Describe a scene</p>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={onKey}
            placeholder='e.g. "a majestic dragon coiled around a glowing pearl"'
            rows={3}
            className="luxe-textarea text-sm"
            disabled={loading}
          />
          <div className="flex items-center justify-between mt-3 gap-2">
            <span className="text-[10px] text-gray-500">
              Enter to generate · Shift+Enter for newline
            </span>
            <button
              onClick={generate}
              disabled={loading || !prompt.trim()}
              className={`luxe-btn luxe-btn-primary ${loading ? 'opacity-60 cursor-wait' : ''}`}>
              {loading ? 'Generating…' : 'Generate scene'}
            </button>
          </div>
        </div>

        <div className="luxe-card p-4">
          <p className="luxe-eyebrow text-cyan-300/80 mb-2">— Try one</p>
          <div className="flex flex-wrap gap-1.5">
            {SAMPLE_PROMPTS.map(s => (
              <button key={s} onClick={() => { setPrompt(s); setTimeout(generate, 50) }}
                disabled={loading}
                className="luxe-btn luxe-btn-ghost text-[11px] px-2.5 py-1.5">
                {s}
              </button>
            ))}
          </div>
        </div>

        {history.length > 0 && (
          <div className="luxe-card p-4">
            <p className="luxe-eyebrow text-fuchsia-300/80 mb-2">— Recent</p>
            <ul className="space-y-1.5">
              {history.map((h, i) => (
                <li key={i}>
                  <button onClick={() => setScene(h.scene)}
                    className="w-full text-left text-xs text-gray-400 hover:text-white truncate px-2 py-1.5 rounded-md hover:bg-white/[0.04] transition-colors">
                    {h.prompt}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
