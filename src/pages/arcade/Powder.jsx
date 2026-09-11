// Powder.jsx — Falling-Sand cellular automaton
//
// Sim game #2 of 5. Every cell in a 160×100 grid holds a "material" byte
// (0 = empty). A cellular-automata step advances all pixels once per frame
// with per-material rules and cross-material interactions.
//
// Materials (id → colour + rule set):
//   0 EMPTY   • never rendered
//   1 SAND    • gravity, piles at rest angle, displaces water
//   2 WATER   • gravity + spread sideways
//   3 FIRE    • rises, decays with age, ignites plant + powder, evaporates
//               water → steam
//   4 STEAM   • rises, condenses back to water at low chance
//   5 PLANT   • static, grows into adjacent damp cells
//   6 SALT    • gravity like sand, dissolves in water
//   7 WALL    • static, indestructible
//   8 POWDER  • lightweight sand — piles higher, ignites on contact with fire
//
// Iteration order:
//   Bottom-up, alternating left-first / right-first per row+tick so all sand
//   doesn't drift the same way. A per-tick "moved" bitmap prevents double-
//   processing cells that already stepped this frame.
//
// Rendering:
//   ImageData buffer at 1px-per-cell resolution, blit once per frame via
//   putImageData, and CSS scaled 5× — vastly cheaper than 16 000 fillRects.
//   Deterministic per-cell noise gives a subtle grain; fire + steam
//   additionally shimmer per frame for animation.
//
// Persistence:
//   Save / load canvas as base64 to localStorage. Two slots.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GameShell from '../../components/arcade/GameShell'
import { Slider } from '../../components/ui'
import { getSfx } from '../../components/arcade/sfx'

const RULES = [
  { heading: 'What this is', body: 'A falling-sand cellular automaton. Every pixel in a 160×100 grid holds a material; a physics step moves them once per frame according to per-material rules and cross-material interactions.' },
  { heading: 'Controls', body: 'Left-click / drag — paint the currently selected material.\nRight-click / drag — erase.\nMaterial palette in the panel — pick one.\nBrush slider — 1-12 px paint radius.\nSpace pauses; R clears the grid.' },
  { heading: 'Materials', body: 'Sand — falls, piles at rest angle, displaces water.\nWater — falls, spreads sideways.\nFire — rises, decays with age, ignites plants/powder, evaporates water into steam.\nSteam — rises, occasionally condenses back into water.\nPlant — static, grows into adjacent damp cells.\nSalt — falls like sand, dissolves when touching water.\nWall — indestructible.\nPowder — lightweight sand, ignites on contact with fire.' },
  { heading: 'Interactions', body: 'Fire + water → steam. Steam ceiling → drops back as water. Salt + water → both dissolve. Fire + plant → plant burns. Fire + powder → explosive burn (fast propagation).' },
  { heading: 'Persistence', body: 'You can save the current canvas as base64 to localStorage — two named slots. Handy for building a complex fire-water-plant scene once and reloading it whenever.' },
  { heading: 'Perf', body: 'The simulation writes to an ImageData buffer at 1 px-per-cell then blits once per frame with putImageData, CSS-scaled 5× for the visible view. That\'s vastly cheaper than 16,000 fillRect calls.' },
  { heading: 'Difficulty', body: 'Sim games don\'t really "get harder" — treat presets as sandbox modes. Easy = big brush, full palette, half-speed. Hard = tiny brush, small palette, 2× sim speed. Custom exposes brush size, gravity strength, palette breadth, and simulation speed.' },
]

const DIFFICULTIES = {
  Easy:   { brushSize: 8, gravity: 1.0, paletteWidth: 8, simSpeed: 0.5 },
  Medium: { brushSize: 4, gravity: 1.0, paletteWidth: 8, simSpeed: 1.0 },
  Hard:   { brushSize: 2, gravity: 1.5, paletteWidth: 5, simSpeed: 2.0 },
}

const CUSTOM_SCHEMA = {
  brushSize:    { label: 'Brush size',   min: 1,   max: 12,  step: 1,  default: 4 },
  gravity:      { label: 'Gravity',      min: 0.3, max: 2.0, step: 0.1, default: 1.0 },
  paletteWidth: { label: 'Palette size', min: 3,   max: 8,   step: 1,  default: 8 },
  simSpeed:     { label: 'Sim speed',    min: 0.3, max: 3.0, step: 0.1, default: 1.0 },
}

const COLS = 160
const ROWS = 100
const SIZE = COLS * ROWS

// Material ids
const EMPTY = 0, SAND = 1, WATER = 2, FIRE = 3, STEAM = 4, PLANT = 5, SALT = 6, WALL = 7, POWDER = 8

const MATERIALS = [
  { id: SAND,   name: 'Sand',   base: [239, 213, 141], density: 3 },
  { id: WATER,  name: 'Water',  base: [72, 145, 220],  density: 2 },
  { id: FIRE,   name: 'Fire',   base: [255, 120, 60],  density: 0 },
  { id: STEAM,  name: 'Steam',  base: [200, 210, 220], density: -1 },
  { id: PLANT,  name: 'Plant',  base: [72, 187, 100],  density: 99 },
  { id: SALT,   name: 'Salt',   base: [230, 230, 240], density: 3 },
  { id: WALL,   name: 'Wall',   base: [110, 110, 120], density: 99 },
  { id: POWDER, name: 'Powder', base: [220, 155, 90],  density: 2 },
]
const MAT_BY_ID = MATERIALS.reduce((m, x) => { m[x.id] = x; return m }, {})

const idx = (x, y) => y * COLS + x

// Per-cell shading. Deterministic seed keeps still cells from flickering.
function shade(mat, i, tick) {
  const base = MAT_BY_ID[mat]?.base
  if (!base) return [11, 11, 18]
  const shimmer = mat === FIRE || mat === STEAM
  const seed = shimmer ? (i * 2654435761 + tick * 374761393) : (i * 2654435761)
  const h = ((seed >>> 0) % 40) - 20
  return [
    Math.max(0, Math.min(255, base[0] + (mat === FIRE ? h * 0.6 : h * 0.18))),
    Math.max(0, Math.min(255, base[1] + h * 0.18)),
    Math.max(0, Math.min(255, base[2] + h * 0.18)),
  ]
}

export default function Powder() {
  const canvasRef = useRef(null)
  const gridRef   = useRef(new Uint8Array(SIZE))
  const ageRef    = useRef(new Uint8Array(SIZE))
  const drawRef   = useRef(null)
  const tickRef   = useRef(0)
  const rafRef    = useRef(0)
  const imageDataRef = useRef(null)

  const [material, setMaterial] = useState(SAND)
  const [brush, setBrush]       = useState(4)
  const [difficulty, setDifficulty] = useState('Medium')
  const [customValues, setCustomValues] = useState({
    brushSize: CUSTOM_SCHEMA.brushSize.default,
    gravity: CUSTOM_SCHEMA.gravity.default,
    paletteWidth: CUSTOM_SCHEMA.paletteWidth.default,
    simSpeed: CUSTOM_SCHEMA.simSpeed.default,
  })
  const cfg = difficulty === 'Custom' ? customValues : DIFFICULTIES[difficulty]
  const cfgRef = useRef(cfg)
  useEffect(() => {
    cfgRef.current = cfg
    setBrush(cfg.brushSize)
  }, [cfg])
  const [running, setRunning]   = useState(true)
  const [soundOn, setSoundOn]   = useState(true)
  const [flash, setFlash]       = useState('')

  const sfx = useMemo(() => getSfx(), [])
  useEffect(() => sfx.setEnabled(soundOn), [soundOn, sfx])

  // Wall floor so materials don't fall off the bottom.
  useEffect(() => {
    const g = gridRef.current
    for (let x = 0; x < COLS; x++) g[idx(x, ROWS - 1)] = WALL
  }, [])

  // ── Render ──
  const paint = useCallback(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    if (!imageDataRef.current) imageDataRef.current = ctx.createImageData(COLS, ROWS)
    const img = imageDataRef.current
    const data = img.data
    const g = gridRef.current
    const tick = tickRef.current

    for (let i = 0; i < SIZE; i++) {
      const m = g[i]
      const j = i * 4
      if (m === EMPTY) {
        data[j] = 11; data[j + 1] = 11; data[j + 2] = 18; data[j + 3] = 255
      } else {
        const s = shade(m, i, tick)
        data[j] = s[0]; data[j + 1] = s[1]; data[j + 2] = s[2]; data[j + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
  }, [])

  // ── Simulation ──
  const step = useCallback(() => {
    const g = gridRef.current
    const age = ageRef.current
    tickRef.current++
    const tick = tickRef.current
    const moved = new Uint8Array(SIZE)

    for (let y = ROWS - 1; y >= 0; y--) {
      const ltr = (y + tick) & 1
      const xStart = ltr ? 0 : COLS - 1
      const xEnd = ltr ? COLS : -1
      const xStep = ltr ? 1 : -1
      for (let x = xStart; x !== xEnd; x += xStep) {
        const i = idx(x, y)
        const m = g[i]
        if (m === EMPTY || moved[i]) continue

        // WALL — never moves.
        if (m === WALL) continue

        // PLANT — grows into empty cell if adjacent to water.
        if (m === PLANT) {
          if ((tick & 15) === 0 && Math.random() < 0.35) {
            const nbrs = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
            let hasWater = false, empt = -1
            for (const [nx, ny] of nbrs) {
              if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue
              const ni = idx(nx, ny)
              if (g[ni] === WATER) hasWater = true
              else if (g[ni] === EMPTY && empt < 0) empt = ni
            }
            if (hasWater && empt >= 0) {
              g[empt] = PLANT
              moved[empt] = 1
              age[empt] = 0
            }
          }
          continue
        }

        // FIRE — rises, decays, ignites plant/powder, evaporates water.
        if (m === FIRE) {
          age[i]++
          if (age[i] > 40) { g[i] = EMPTY; continue }
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue
              const nx = x + dx, ny = y + dy
              if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue
              const ni = idx(nx, ny)
              const nm = g[ni]
              if (nm === PLANT && Math.random() < 0.28) { g[ni] = FIRE; age[ni] = 0; moved[ni] = 1 }
              else if (nm === POWDER && Math.random() < 0.35) { g[ni] = FIRE; age[ni] = 0; moved[ni] = 1 }
              else if (nm === WATER && Math.random() < 0.55) {
                g[ni] = STEAM; age[ni] = 0; moved[ni] = 1
                g[i] = EMPTY
              }
            }
          }
          if (g[i] !== FIRE) continue
          // Rise
          if (y > 0 && Math.random() < 0.85) {
            const dx = Math.random() < 0.4 ? (Math.random() < 0.5 ? -1 : 1) : 0
            const nx = x + dx
            if (nx >= 0 && nx < COLS) {
              const up = idx(nx, y - 1)
              if (g[up] === EMPTY) {
                g[up] = FIRE; age[up] = age[i]; g[i] = EMPTY; moved[up] = 1
                continue
              }
            }
          }
          moved[i] = 1
          continue
        }

        // STEAM — rises, condenses to water occasionally.
        if (m === STEAM) {
          age[i]++
          if (age[i] > 200 && Math.random() < 0.02) { g[i] = WATER; age[i] = 0; continue }
          if (y > 0) {
            const candidates = [
              idx(x, y - 1),
              idx(Math.max(0, x - 1), y - 1),
              idx(Math.min(COLS - 1, x + 1), y - 1),
            ]
            for (const c of candidates) {
              if (g[c] === EMPTY) {
                g[c] = STEAM; age[c] = age[i]; g[i] = EMPTY; moved[c] = 1
                break
              }
            }
          }
          continue
        }

        // WATER — falls, spreads.
        if (m === WATER) {
          if (y < ROWS - 1) {
            const below = idx(x, y + 1)
            if (g[below] === EMPTY) { g[below] = WATER; g[i] = EMPTY; moved[below] = 1; continue }
            if (g[below] === SALT && Math.random() < 0.05) { g[below] = WATER; g[i] = EMPTY; moved[below] = 1; continue }
            const dl = x > 0 ? idx(x - 1, y + 1) : -1
            const dr = x < COLS - 1 ? idx(x + 1, y + 1) : -1
            const pick = Math.random() < 0.5 ? [dl, dr] : [dr, dl]
            for (const c of pick) {
              if (c < 0) continue
              if (g[c] === EMPTY) { g[c] = WATER; g[i] = EMPTY; moved[c] = 1; break }
            }
            if (g[i] !== WATER) continue
          }
          const dir = Math.random() < 0.5 ? -1 : 1
          for (const d of [dir, -dir]) {
            const nx = x + d
            if (nx < 0 || nx >= COLS) continue
            const ni = idx(nx, y)
            if (g[ni] === EMPTY) { g[ni] = WATER; g[i] = EMPTY; moved[ni] = 1; break }
          }
          continue
        }

        // SAND / SALT / POWDER — gravity + diagonal fall.
        if (m === SAND || m === SALT || m === POWDER) {
          const dropChance = m === POWDER ? 0.75 : 1
          if (y < ROWS - 1 && Math.random() < dropChance) {
            const below = idx(x, y + 1)
            if (g[below] === EMPTY) { g[below] = m; g[i] = EMPTY; moved[below] = 1; continue }
            if (g[below] === WATER && MAT_BY_ID[m].density > MAT_BY_ID[WATER].density) {
              g[below] = m; g[i] = WATER; moved[below] = 1; continue
            }
            const dl = x > 0 ? idx(x - 1, y + 1) : -1
            const dr = x < COLS - 1 ? idx(x + 1, y + 1) : -1
            const pick = Math.random() < 0.5 ? [dl, dr] : [dr, dl]
            for (const c of pick) {
              if (c < 0) continue
              if (g[c] === EMPTY) { g[c] = m; g[i] = EMPTY; moved[c] = 1; break }
              if (g[c] === WATER && MAT_BY_ID[m].density > MAT_BY_ID[WATER].density) {
                g[c] = m; g[i] = WATER; moved[c] = 1; break
              }
            }
          }
          continue
        }
      }
    }
  }, [])

  // ── Loop ──
  useEffect(() => {
    let last = performance.now()
    const loop = (t) => {
      if (running && t - last >= 32) { step(); last = t }
      paint()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, step, paint])

  // ── Input ──
  const posFromEvent = (e) => {
    const c = canvasRef.current
    if (!c) return null
    const rect = c.getBoundingClientRect()
    const clientX = e.touches?.[0]?.clientX ?? e.clientX
    const clientY = e.touches?.[0]?.clientY ?? e.clientY
    const sx = COLS / rect.width
    const sy = ROWS / rect.height
    const x = Math.floor((clientX - rect.left) * sx)
    const y = Math.floor((clientY - rect.top) * sy)
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return null
    return { x, y }
  }

  const paintBrush = (cx, cy, mat) => {
    const g = gridRef.current
    const age = ageRef.current
    const r = brush
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue
        const x = cx + dx, y = cy + dy
        if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue
        const i = idx(x, y)
        if (mat === EMPTY) {
          g[i] = EMPTY; age[i] = 0
        } else if (g[i] === EMPTY || mat === WALL || Math.random() < 0.8) {
          g[i] = mat; age[i] = 0
        }
      }
    }
  }

  const onDown = (e) => {
    e.preventDefault()
    const p = posFromEvent(e); if (!p) return
    drawRef.current = { erase: e.button === 2 || e.ctrlKey }
    paintBrush(p.x, p.y, drawRef.current.erase ? EMPTY : material)
  }
  const onMove = (e) => {
    if (!drawRef.current) return
    e.preventDefault()
    const p = posFromEvent(e); if (!p) return
    paintBrush(p.x, p.y, drawRef.current.erase ? EMPTY : material)
  }
  const onUp = () => { drawRef.current = null }

  // ── Save / load / clear ──
  const clearAll = () => {
    gridRef.current.fill(0)
    ageRef.current.fill(0)
    const g = gridRef.current
    for (let x = 0; x < COLS; x++) g[idx(x, ROWS - 1)] = WALL
    tickRef.current = 0
  }
  const saveCanvas = (slot = 1) => {
    try {
      const bin = String.fromCharCode.apply(null, gridRef.current)
      localStorage.setItem(`sid-powder-slot-${slot}`, btoa(bin))
      setFlash(`Saved to slot ${slot}`)
      setTimeout(() => setFlash(''), 1500)
      sfx.coin()
    } catch { setFlash('Save failed'); setTimeout(() => setFlash(''), 1500) }
  }
  const loadCanvas = (slot = 1) => {
    const raw = localStorage.getItem(`sid-powder-slot-${slot}`)
    if (!raw) { setFlash(`Slot ${slot} empty`); setTimeout(() => setFlash(''), 1500); return }
    try {
      const bin = atob(raw)
      const g = gridRef.current
      for (let i = 0; i < SIZE; i++) g[i] = bin.charCodeAt(i) || 0
      setFlash(`Loaded slot ${slot}`)
      setTimeout(() => setFlash(''), 1500)
      sfx.pop()
    } catch { setFlash('Load failed'); setTimeout(() => setFlash(''), 1500) }
  }

  return (
    <GameShell
      title="Powder Game"
      category="Sim"
      score={tickRef.current}
      best={0}
      level={brush}
      status={running ? 'playing' : 'paused'}
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn(v => !v)}
      onPause={() => setRunning(r => !r)}
      onRestart={clearAll}
      rules={RULES}
      difficulty={difficulty}
      onDifficultyChange={setDifficulty}
      customSchema={CUSTOM_SCHEMA}
      customValues={customValues}
      onCustomChange={setCustomValues}
      controls={[
        { key: 'L-click', label: 'Paint material' },
        { key: 'R-click', label: 'Erase' },
        { key: 'Drag',    label: 'Continuous paint' },
      ]}
    >
      <div className="p-3 sm:p-4 flex flex-col gap-3 lg:flex-row">
        <div className="flex-1 min-w-0">
          <div className="relative rounded-xl overflow-hidden border border-white/10 bg-[#0b0b12]">
            <canvas
              ref={canvasRef}
              width={COLS}
              height={ROWS}
              onContextMenu={(e) => e.preventDefault()}
              onMouseDown={onDown}
              onMouseMove={onMove}
              onMouseUp={onUp}
              onMouseLeave={onUp}
              onTouchStart={onDown}
              onTouchMove={onMove}
              onTouchEnd={onUp}
              style={{
                width: '100%',
                aspectRatio: `${COLS} / ${ROWS}`,
                imageRendering: 'pixelated',
                display: 'block',
                cursor: 'crosshair',
                touchAction: 'none',
              }}
            />
          </div>

          <div className="mt-3 p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="flex justify-between text-xs text-white/60 mb-1">
              <span>Brush size</span>
              <span className="text-fuchsia-300 font-mono">{brush}px</span>
            </div>
            <Slider min={1} max={12} value={brush} onChange={setBrush} accent="fuchsia" />
          </div>
        </div>

        <div className="w-full lg:w-72 shrink-0 space-y-3">
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="text-[11px] uppercase tracking-widest text-white/40 mb-2">Materials</div>
            <div className="grid grid-cols-2 gap-2">
              {MATERIALS.map((m) => {
                const active = material === m.id
                const [r, g, b] = m.base
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMaterial(m.id)}
                    className={`px-2 py-2 rounded-lg border text-xs flex items-center gap-2 transition-colors ${active ? 'bg-white/15 border-white/40 text-white' : 'bg-white/5 border-white/10 hover:border-white/25 text-white/80'}`}
                  >
                    <span
                      className="w-4 h-4 rounded-sm border border-white/20"
                      style={{ background: `rgb(${r},${g},${b})` }}
                    />
                    <span>{m.name}</span>
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => setMaterial(EMPTY)}
                className={`px-2 py-2 rounded-lg border text-xs flex items-center gap-2 col-span-2 ${material === EMPTY ? 'bg-white/15 border-white/40 text-white' : 'bg-white/5 border-white/10 hover:border-white/25 text-white/80'}`}
              >
                <span className="w-4 h-4 rounded-sm border border-white/20 bg-[#0b0b12]" />
                <span>Eraser</span>
              </button>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="text-[11px] uppercase tracking-widest text-white/40 mb-2">Canvas</div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => saveCanvas(1)} className="px-3 py-2 rounded-lg font-semibold border border-amber-400/40 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25 text-xs">Save 1</button>
              <button type="button" onClick={() => loadCanvas(1)} className="px-3 py-2 rounded-lg font-semibold border border-white/15 bg-white/5 hover:bg-white/10 text-xs">Load 1</button>
              <button type="button" onClick={() => saveCanvas(2)} className="px-3 py-2 rounded-lg font-semibold border border-amber-400/40 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25 text-xs">Save 2</button>
              <button type="button" onClick={() => loadCanvas(2)} className="px-3 py-2 rounded-lg font-semibold border border-white/15 bg-white/5 hover:bg-white/10 text-xs">Load 2</button>
              <button type="button" onClick={clearAll} className="col-span-2 px-3 py-2 rounded-lg font-semibold border border-rose-400/40 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25 text-xs">Clear canvas</button>
            </div>
            {flash && <div className="mt-2 text-[11px] text-emerald-300">{flash}</div>}
          </div>

          <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs text-white/60 leading-relaxed">
            <div className="text-[11px] uppercase tracking-widest text-white/40 mb-2">Interactions</div>
            <ul className="space-y-1">
              <li>· fire + water → steam</li>
              <li>· water + salt → salt dissolves</li>
              <li>· plant + water → plant grows</li>
              <li>· fire + plant / powder → burns</li>
              <li>· steam cools → water</li>
            </ul>
          </div>
        </div>
      </div>
    </GameShell>
  )
}
