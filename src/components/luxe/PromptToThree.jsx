// PromptToThree — type a description, Groq writes a constrained JSON
// scene DSL, we render it live with react-three-fiber. After generation
// the user can click any mesh to edit it inline (color, scale, geometry,
// animation) — or add new primitives, delete, re-roll. No `eval`, no
// arbitrary code execution: the LLM only ever produces JSON that
// matches our schema, and we sanity-check every field before it
// reaches Three.js. Generation runs on Groq Llama 3.3 70B (~1-2s).

import { Suspense, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Stars, Float } from '@react-three/drei'
import { sendGroq } from '../../api/ai'
import notify from '../../utils/notify'

// ── Whitelisted geometry constructors ──────────────────────────────
const GEOMETRIES = {
  box:          (a = [1, 1, 1])         => <boxGeometry args={a} />,
  sphere:       (a = [1, 32, 32])       => <sphereGeometry args={a} />,
  icosahedron:  (a = [1, 0])            => <icosahedronGeometry args={a} />,
  dodecahedron: (a = [1, 0])            => <dodecahedronGeometry args={a} />,
  octahedron:   (a = [1, 0])            => <octahedronGeometry args={a} />,
  tetrahedron:  (a = [1, 0])            => <tetrahedronGeometry args={a} />,
  torus:        (a = [1, 0.4, 16, 64])  => <torusGeometry args={a} />,
  torusKnot:    (a = [1, 0.3, 64, 8])   => <torusKnotGeometry args={a} />,
  cone:         (a = [1, 2, 32])        => <coneGeometry args={a} />,
  cylinder:     (a = [1, 1, 2, 32])     => <cylinderGeometry args={a} />,
  capsule:      (a = [0.5, 1.4, 8, 16]) => <capsuleGeometry args={a} />,
  plane:        (a = [4, 4])            => <planeGeometry args={a} />,
}
const GEOMETRY_KEYS = Object.keys(GEOMETRIES)

const ANIMATIONS = ['none', 'spin-y', 'spin-x', 'spin-xy', 'float', 'pulse', 'orbit-center']

// Sanitise raw LLM JSON → safe scene spec. Trust boundary. Anything
// out-of-schema gets dropped, anything missing gets sensible defaults.
function sanitiseScene(raw) {
  if (!raw || typeof raw !== 'object') return null
  const num   = (v, d = 0)        => (typeof v === 'number' && isFinite(v) ? v : d)
  const hex   = (v, d)            => (typeof v === 'string' && /^#?[0-9a-f]{3,8}$/i.test(v) ? v : d)
  const v3    = (v, d = [0, 0, 0]) => (Array.isArray(v) && v.length === 3 ? v.map(x => num(x, 0)) : d)
  const arr   = (v, max)          => (Array.isArray(v) ? v.slice(0, max) : [])
  return {
    background: hex(raw.background, '#06060a'),
    lights: arr(raw.lights, 4).map(l => ({
      type:      ['ambient', 'point', 'directional'].includes(l?.type) ? l.type : 'ambient',
      color:     hex(l?.color, '#ffffff'),
      intensity: Math.max(0, num(l?.intensity, 1)),
      position:  v3(l?.position, [4, 4, 4]),
    })),
    meshes: arr(raw.meshes, 16).map(m => ({
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
      animation: ANIMATIONS.includes(m?.animation) ? m.animation : 'spin-y',
    })),
  }
}

// System prompt — explicit composite-creature instructions + concrete
// dragon / robot examples so the model assembles believable scenes
// from primitives instead of returning a single sphere.
const SYSTEM_PROMPT = `You are a Three.js scene generator. Given a description, output ONE raw JSON object describing a scene. No prose, no markdown, no code fences — JUST the JSON.

Schema:
{
  "background": "#hex",
  "lights": [
    { "type": "ambient" | "point" | "directional",
      "color": "#hex", "intensity": float, "position": [x,y,z] }
  ],
  "meshes": [
    {
      "geometry": "box" | "sphere" | "icosahedron" | "dodecahedron" |
                  "octahedron" | "tetrahedron" | "torus" | "torusKnot" |
                  "cone" | "cylinder" | "capsule" | "plane",
      "args": [float, ...],
      "position": [x,y,z], "rotation": [x,y,z], "scale": [x,y,z],
      "material": {
        "color": "#hex", "emissive": "#hex",
        "emissiveIntensity": float (0..3),
        "wireframe": false,
        "roughness": float (0..1), "metalness": float (0..1)
      },
      "animation": "none" | "spin-y" | "spin-x" | "spin-xy" | "float" | "pulse" | "orbit-center"
    }
  ]
}

Rules:
- 6 to 16 meshes (more meshes = more believable scene)
- 2 to 4 lights, always one ambient + one or two coloured points
- For CREATURES (dragon, snake, robot, fish, bird, octopus): build the body from a chain of capsule / cone / sphere meshes. e.g. a dragon = head (icosahedron) + neck (capsule rotated) + body (cylinder/capsule chain of 4-6) + tail (cones tapering smaller) + wings (flat thin boxes or cones) + eyes (tiny spheres with emissive glow). Coil the body using progressive y/z positions. Use 'float' on the head + 'spin-y' on the body for motion.
- For STRUCTURES (castle, temple, city): combine boxes + cylinders + cones for towers and roofs. Plane for ground.
- For ABSTRACT scenes: tasteful mix of icosahedron + torus + sphere with strong emissive colours.
- Emissive colours give a glow; use them for eyes, gems, fire.
- Coordinates roughly in [-4..4]; scale in [0.1..2.0].
- Output JSON only, no explanation.`

// Animation runner per mesh.
function Animated({ animation, basePosition, baseRotation, baseScale, onClick, children }) {
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
  })
  return (
    <group ref={ref} position={basePosition} rotation={baseRotation} onClick={onClick}>
      {children}
    </group>
  )
}

function MeshFromSpec({ spec, selected, onSelect }) {
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
  const handleClick = (e) => { e.stopPropagation(); onSelect?.() }
  // Selection: render a wireframe duplicate slightly larger so the user
  // sees which mesh they picked without the colour shift confusing them.
  const meshNode = (
    <group>
      <mesh scale={spec.scale} castShadow receiveShadow onClick={handleClick}>
        {geom}
        {mat}
      </mesh>
      {selected && (
        <mesh scale={spec.scale.map(s => s * 1.04)}>
          {GEOMETRIES[spec.geometry](spec.args)}
          <meshBasicMaterial color="#fbbf24" wireframe transparent opacity={0.7} />
        </mesh>
      )}
    </group>
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
      baseRotation={spec.rotation}
      baseScale={spec.scale}
      onClick={handleClick}>
      {meshNode}
    </Animated>
  )
}

function SceneRoot({ scene, selectedIndex, onSelect }) {
  return (
    <>
      <color attach="background" args={[scene.background]} />
      <Stars radius={30} depth={50} count={1500} factor={3} fade speed={0.4} />
      {scene.lights.map((l, i) => {
        if (l.type === 'ambient')     return <ambientLight key={i} intensity={l.intensity} color={l.color} />
        if (l.type === 'directional') return <directionalLight key={i} position={l.position} intensity={l.intensity} color={l.color} />
        return <pointLight key={i} position={l.position} intensity={l.intensity} color={l.color} />
      })}
      {scene.meshes.map((m, i) => (
        <MeshFromSpec key={i} spec={m}
          selected={selectedIndex === i}
          onSelect={() => onSelect(i)} />
      ))}
    </>
  )
}

// Default opening scene.
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
  'a coiled crystal dragon with glowing red eyes',
  'cyberpunk neon city in the rain',
  'a crystal lotus flower with a glowing core',
  'a small temple under aurora lights',
  'a friendly robot waving hello',
  'octopus made of stained glass',
]

export default function PromptToThree() {
  const [prompt, setPrompt]   = useState('')
  const [scene, setScene]     = useState(DEFAULT_SCENE)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState([])     // [{prompt, scene}]
  const [selectedIndex, setSelectedIndex] = useState(-1)

  const sel = selectedIndex >= 0 && scene.meshes[selectedIndex]

  // Patch a single mesh by index — used by every editor control.
  const updateMesh = (i, patch) => {
    setScene(s => ({
      ...s,
      meshes: s.meshes.map((m, idx) => idx === i ? { ...m, ...patch, material: patch.material ? { ...m.material, ...patch.material } : m.material } : m),
    }))
  }

  const addMesh = () => {
    const newMesh = {
      geometry: 'icosahedron',
      args: [0.8, 0],
      position: [(Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      material: { color: '#a78bfa', emissive: '#7c3aed', emissiveIntensity: 0.6, wireframe: false, roughness: 0.4, metalness: 0.5 },
      animation: 'spin-y',
    }
    setScene(s => ({ ...s, meshes: [...s.meshes, newMesh] }))
    setSelectedIndex(scene.meshes.length)
  }

  const deleteMesh = () => {
    if (selectedIndex < 0) return
    setScene(s => ({ ...s, meshes: s.meshes.filter((_, i) => i !== selectedIndex) }))
    setSelectedIndex(-1)
  }

  const generate = async () => {
    const text = prompt.trim()
    if (!text) return
    setLoading(true)
    try {
      const { data, error } = await sendGroq(text, {
        system: SYSTEM_PROMPT,
        model: 'llama-3.3-70b',
        maxTokens: 2200,
        temperature: 0.9,
      })
      if (error) throw new Error(error)
      const raw = data?.reply || data?.message || ''
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
      let parsed
      try { parsed = JSON.parse(cleaned) }
      catch {
        const m = cleaned.match(/\{[\s\S]*\}/)
        if (!m) throw new Error('Model returned unparseable output')
        parsed = JSON.parse(m[0])
      }
      const safe = sanitiseScene(parsed)
      if (!safe || !safe.meshes.length) throw new Error('Scene came back empty')
      setScene(safe)
      setSelectedIndex(-1)
      setHistory(h => [{ prompt: text, scene: safe }, ...h].slice(0, 8))
      notify.success(`${safe.meshes.length} mesh${safe.meshes.length === 1 ? '' : 'es'} · click any to edit`, { title: 'Scene generated' })
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
        <div className="relative w-full" style={{ height: 'min(60vh, 540px)' }}
          onClick={() => setSelectedIndex(-1)}>
          <Canvas camera={{ position: [0, 0, 7], fov: 50 }} shadows>
            <Suspense fallback={null}>
              <SceneRoot scene={scene} selectedIndex={selectedIndex} onSelect={setSelectedIndex} />
              <OrbitControls enablePan={false} enableZoom autoRotate={false} />
            </Suspense>
          </Canvas>

          {/* Selection hint */}
          <div className="absolute bottom-3 left-3 luxe-card px-3 py-1.5 text-[11px] text-gray-300 pointer-events-none">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
              {sel ? `Selected mesh #${selectedIndex + 1} · edit in sidebar →` : 'Click any mesh to edit · drag empty space to orbit'}
            </span>
          </div>

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

      {/* Right column */}
      <div className="lg:col-span-2 space-y-3">
        {/* Prompt */}
        <div className="luxe-card p-4">
          <p className="luxe-eyebrow text-violet-300/80 mb-2">Describe a scene</p>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={onKey}
            placeholder='e.g. "a coiled crystal dragon with glowing red eyes"'
            rows={3}
            className="luxe-textarea text-sm"
            disabled={loading}
          />
          <div className="flex items-center justify-between mt-3 gap-2">
            <span className="text-[10px] text-gray-500">
              Enter to generate · Shift+Enter for newline
            </span>
            <button onClick={generate} disabled={loading || !prompt.trim()}
              className={`luxe-btn luxe-btn-primary ${loading ? 'opacity-60 cursor-wait' : ''}`}>
              {loading ? 'Generating…' : 'Generate'}
            </button>
          </div>
        </div>

        {/* Mesh editor — visible only when a mesh is selected */}
        {sel ? (
          <MeshEditor
            spec={sel}
            index={selectedIndex}
            total={scene.meshes.length}
            onPatch={p => updateMesh(selectedIndex, p)}
            onDelete={deleteMesh}
            onDeselect={() => setSelectedIndex(-1)}
          />
        ) : (
          <div className="luxe-card p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="luxe-eyebrow text-cyan-300/80">Try one</p>
              <button onClick={addMesh}
                className="luxe-btn luxe-btn-secondary text-[11px] px-2 py-1">
                + Add mesh
              </button>
            </div>
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
        )}

        {/* Recent */}
        {history.length > 0 && (
          <div className="luxe-card p-4">
            <p className="luxe-eyebrow text-fuchsia-300/80 mb-2">Recent</p>
            <ul className="space-y-1.5">
              {history.map((h, i) => (
                <li key={i}>
                  <button onClick={() => { setScene(h.scene); setSelectedIndex(-1) }}
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

// ── Inline mesh editor ────────────────────────────────────────────
// Lives in the sidebar when the user selects a mesh in the canvas.
// Every control patches the parent scene state via onPatch.
function MeshEditor({ spec, index, total, onPatch, onDelete, onDeselect }) {
  const setVec3 = (key, axis, val) => {
    const v = [...spec[key]]
    v[axis] = parseFloat(val)
    onPatch({ [key]: v })
  }
  return (
    <div className="luxe-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="luxe-eyebrow text-amber-300/90">
          — Editing mesh #{index + 1} / {total}
        </p>
        <button onClick={onDeselect}
          className="luxe-btn luxe-btn-ghost text-[10px] px-2 py-0.5">
          ✕ close
        </button>
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">Geometry</label>
        <select value={spec.geometry}
          onChange={e => onPatch({ geometry: e.target.value })}
          className="luxe-input text-xs">
          {GEOMETRY_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">Color</label>
          <input type="color" value={spec.material.color}
            onChange={e => onPatch({ material: { color: e.target.value } })}
            className="w-full h-9 rounded-md bg-transparent border border-gray-800 cursor-pointer" />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">Glow color</label>
          <input type="color" value={spec.material.emissive}
            onChange={e => onPatch({ material: { emissive: e.target.value } })}
            className="w-full h-9 rounded-md bg-transparent border border-gray-800 cursor-pointer" />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] uppercase tracking-wider text-gray-500">Glow strength</label>
          <span className="text-[10px] font-mono text-gray-400">{spec.material.emissiveIntensity.toFixed(2)}</span>
        </div>
        <input type="range" min={0} max={3} step={0.05}
          value={spec.material.emissiveIntensity}
          onChange={e => onPatch({ material: { emissiveIntensity: parseFloat(e.target.value) } })}
          className="w-full accent-violet-400" />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {['x', 'y', 'z'].map((axis, i) => (
          <div key={`pos-${i}`}>
            <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">pos {axis}</label>
            <input type="number" step="0.1" value={spec.position[i]}
              onChange={e => setVec3('position', i, e.target.value)}
              className="luxe-input text-xs px-2 py-1" />
          </div>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] uppercase tracking-wider text-gray-500">Scale (uniform)</label>
          <span className="text-[10px] font-mono text-gray-400">{spec.scale[0].toFixed(2)}</span>
        </div>
        <input type="range" min={0.1} max={3} step={0.05}
          value={spec.scale[0]}
          onChange={e => {
            const s = parseFloat(e.target.value)
            onPatch({ scale: [s, s, s] })
          }}
          className="w-full accent-violet-400" />
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">Animation</label>
        <select value={spec.animation}
          onChange={e => onPatch({ animation: e.target.value })}
          className="luxe-input text-xs">
          {ANIMATIONS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2">
        <label className="inline-flex items-center gap-2 text-[11px] text-gray-300 cursor-pointer">
          <input type="checkbox" checked={spec.material.wireframe}
            onChange={e => onPatch({ material: { wireframe: e.target.checked } })}
            className="accent-violet-400" />
          Wireframe
        </label>
        <button onClick={onDelete}
          className="luxe-btn luxe-btn-secondary text-[11px] !border-rose-500/40 !text-rose-300 hover:!bg-rose-500/10">
          Delete mesh
        </button>
      </div>
    </div>
  )
}
