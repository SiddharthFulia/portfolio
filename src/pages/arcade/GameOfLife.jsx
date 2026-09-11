// GameOfLife.jsx — Conway's Game of Life
//
// Sim game #1 of 5 in the /arcade "Sim Pack".
//
// What ships here:
//   • 80×50 cell grid rendered on a <canvas> with generation-based age heatmap
//     (younger = amber, older = rose → fuchsia)
//   • Click / drag paint to spawn cells; right-click erases; touch-drag paints
//     on mobile
//   • Play / pause / step-once / clear / randomise controls
//   • Speed slider (1..30 gens/sec), wrap-around toggle
//   • Pattern library (6 classic patterns) — arm a pattern, then click the
//     grid to stamp it at the cursor
//   • Live stats: generation counter, live-cell count, cell density %
//   • Save state as URL — base64-packed bits appended as ?s=… so the URL
//     becomes a shareable snapshot
//
// Rendering strategy:
//   Two Uint8Arrays (alive / next) + Uint16Array (age). Simulation step iterates
//   in a toroidal (wrap) or clipped fashion depending on toggle. Age drives the
//   colour in the paint pass — younger = amber, older = rose → fuchsia — so
//   long-lived colonies visibly saturate over time.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GameShell from '../../components/arcade/GameShell'
import { Slider } from '../../components/ui'
import { getSfx } from '../../components/arcade/sfx'

const COLS = 80
const ROWS = 50
const CELL = 12                    // canvas cell size in CSS pixels

// ── Pattern library ── (dx, dy offsets from the anchor click)
const PATTERNS = {
  Glider: [
    [1,0],[2,1],[0,2],[1,2],[2,2],
  ],
  'Glider Gun': [
    [24,0],[22,1],[24,1],[12,2],[13,2],[20,2],[21,2],[34,2],[35,2],
    [11,3],[15,3],[20,3],[21,3],[34,3],[35,3],
    [0,4],[1,4],[10,4],[16,4],[20,4],[21,4],
    [0,5],[1,5],[10,5],[14,5],[16,5],[17,5],[22,5],[24,5],
    [10,6],[16,6],[24,6],
    [11,7],[15,7],
    [12,8],[13,8],
  ],
  Pulsar: [
    [2,0],[3,0],[4,0],[8,0],[9,0],[10,0],
    [0,2],[5,2],[7,2],[12,2],
    [0,3],[5,3],[7,3],[12,3],
    [0,4],[5,4],[7,4],[12,4],
    [2,5],[3,5],[4,5],[8,5],[9,5],[10,5],
    [2,7],[3,7],[4,7],[8,7],[9,7],[10,7],
    [0,8],[5,8],[7,8],[12,8],
    [0,9],[5,9],[7,9],[12,9],
    [0,10],[5,10],[7,10],[12,10],
    [2,12],[3,12],[4,12],[8,12],[9,12],[10,12],
  ],
  Pentadecathlon: [
    [0,0],[1,0],[2,-1],[2,1],[3,0],[4,0],[5,0],[6,0],[7,-1],[7,1],[8,0],[9,0],
  ],
  Acorn: [
    [1,0],[3,1],[0,2],[1,2],[4,2],[5,2],[6,2],
  ],
  'R-pentomino': [
    [1,0],[2,0],[0,1],[1,1],[1,2],
  ],
}

function encodeGrid(alive) {
  const bytes = new Uint8Array(Math.ceil(alive.length / 8))
  for (let i = 0; i < alive.length; i++) {
    if (alive[i]) bytes[i >> 3] |= (1 << (i & 7))
  }
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}
function decodeGrid(b64, len) {
  try {
    const bin = atob(b64)
    const out = new Uint8Array(len)
    for (let i = 0; i < len; i++) {
      const b = bin.charCodeAt(i >> 3) || 0
      out[i] = (b >> (i & 7)) & 1
    }
    return out
  } catch { return null }
}

export default function GameOfLife() {
  const canvasRef = useRef(null)
  const aliveRef  = useRef(new Uint8Array(COLS * ROWS))
  const ageRef    = useRef(new Uint16Array(COLS * ROWS))
  const nextRef   = useRef(new Uint8Array(COLS * ROWS))
  const drawingRef = useRef(null)   // 'add' | 'erase' | null
  // Cached mouse-over cell — used only for the ghost preview.
  const hoverRef  = useRef(null)

  const [running, setRunning] = useState(false)
  const [gen, setGen]         = useState(0)
  const [population, setPop]  = useState(0)
  const [speed, setSpeed]     = useState(10)   // gens per second
  const [wrap, setWrap]       = useState(true)
  const [soundOn, setSoundOn] = useState(true)
  const [armedPattern, setArmed] = useState(null)
  const [copied, setCopied]   = useState(false)

  const sfx = useMemo(() => getSfx(), [])
  useEffect(() => sfx.setEnabled(soundOn), [soundOn, sfx])

  // ── Draw pass ──
  const paint = useCallback(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const w = c.width, h = c.height
    ctx.fillStyle = '#0b0b12'
    ctx.fillRect(0, 0, w, h)

    // faint grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'
    ctx.lineWidth = 1
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath(); ctx.moveTo(x * CELL + 0.5, 0); ctx.lineTo(x * CELL + 0.5, h); ctx.stroke()
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * CELL + 0.5); ctx.lineTo(w, y * CELL + 0.5); ctx.stroke()
    }

    const alive = aliveRef.current
    const age   = ageRef.current
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const i = y * COLS + x
        if (!alive[i]) continue
        const a = age[i]
        let fill = '#fbbf24'                // <9  gens
        if (a > 30)      fill = '#e879f9'    // >30 gens
        else if (a > 8)  fill = '#fb7185'    // 9-30 gens
        ctx.fillStyle = fill
        ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2)
      }
    }

    // Ghost preview of armed pattern at hover cell.
    const hover = hoverRef.current
    if (hover && armedPattern) {
      ctx.fillStyle = 'rgba(232, 121, 249, 0.35)'
      for (const [dx, dy] of PATTERNS[armedPattern]) {
        let x = hover.x + dx, y = hover.y + dy
        if (wrap) {
          x = ((x % COLS) + COLS) % COLS
          y = ((y % ROWS) + ROWS) % ROWS
        } else if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue
        ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2)
      }
    }
  }, [armedPattern, wrap])

  // ── Load from ?s= on mount ──
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const s = p.get('s')
    if (s) {
      const g = decodeGrid(s, COLS * ROWS)
      if (g) {
        aliveRef.current = g
        const age = new Uint16Array(COLS * ROWS)
        for (let i = 0; i < g.length; i++) if (g[i]) age[i] = 20
        ageRef.current = age
        let pop = 0
        for (let i = 0; i < g.length; i++) pop += g[i]
        setPop(pop)
        paint()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Simulation step ──
  const step = useCallback(() => {
    const alive = aliveRef.current
    const age   = ageRef.current
    const next  = nextRef.current
    let pop = 0
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        let n = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue
            let nx = x + dx, ny = y + dy
            if (wrap) {
              if (nx < 0) nx = COLS - 1; else if (nx >= COLS) nx = 0
              if (ny < 0) ny = ROWS - 1; else if (ny >= ROWS) ny = 0
            } else if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue
            n += alive[ny * COLS + nx]
          }
        }
        const i = y * COLS + x
        const live = alive[i]
        let nv = 0
        if (live && (n === 2 || n === 3)) nv = 1
        else if (!live && n === 3) nv = 1
        next[i] = nv
        if (nv) {
          age[i] = live ? Math.min(age[i] + 1, 65535) : 1
          pop++
        } else {
          age[i] = 0
        }
      }
    }
    alive.set(next)
    setPop(pop)
    setGen(g => g + 1)
  }, [wrap])

  // ── Loop ──
  useEffect(() => {
    if (!running) return
    let raf = 0
    let last = performance.now()
    const interval = 1000 / speed
    const loop = (t) => {
      if (t - last >= interval) {
        step()
        paint()
        last = t
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [running, speed, step, paint])

  useEffect(() => { paint() }, [paint])

  // ── Space to play/pause ──
  useEffect(() => {
    const handler = (e) => {
      if (e.code === 'Space' && !e.target.closest('input, textarea')) {
        e.preventDefault()
        setRunning(r => !r)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ── Grid input ──
  const cellFromEvent = (e) => {
    const c = canvasRef.current
    if (!c) return null
    const rect = c.getBoundingClientRect()
    const clientX = e.touches?.[0]?.clientX ?? e.clientX
    const clientY = e.touches?.[0]?.clientY ?? e.clientY
    const sx = c.width / rect.width
    const sy = c.height / rect.height
    const x = Math.floor(((clientX - rect.left) * sx) / CELL)
    const y = Math.floor(((clientY - rect.top) * sy) / CELL)
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return null
    return { x, y }
  }

  const stamp = (cx, cy) => {
    const pts = PATTERNS[armedPattern]
    if (!pts) return
    const alive = aliveRef.current, age = ageRef.current
    for (const [dx, dy] of pts) {
      let x = cx + dx, y = cy + dy
      if (wrap) {
        x = ((x % COLS) + COLS) % COLS
        y = ((y % ROWS) + ROWS) % ROWS
      } else if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue
      const i = y * COLS + x
      alive[i] = 1
      age[i] = 1
    }
    let pop = 0
    for (let i = 0; i < alive.length; i++) pop += alive[i]
    setPop(pop)
    setArmed(null)
    sfx.chirp()
    paint()
  }

  const countPop = () => {
    const a = aliveRef.current
    let pop = 0
    for (let i = 0; i < a.length; i++) pop += a[i]
    return pop
  }

  const onPointerDown = (e) => {
    e.preventDefault()
    const p = cellFromEvent(e); if (!p) return
    if (armedPattern) { stamp(p.x, p.y); return }
    const alive = aliveRef.current, age = ageRef.current
    const i = p.y * COLS + p.x
    const mode = e.button === 2 ? 'erase' : 'add'
    drawingRef.current = mode
    alive[i] = mode === 'add' ? 1 : 0
    age[i]   = mode === 'add' ? 1 : 0
    setPop(countPop())
    paint()
  }
  const onPointerMove = (e) => {
    const p = cellFromEvent(e)
    if (p) hoverRef.current = p
    if (!drawingRef.current) {
      if (armedPattern) paint()   // update ghost preview
      return
    }
    e.preventDefault()
    if (!p) return
    const alive = aliveRef.current, age = ageRef.current
    const i = p.y * COLS + p.x
    const on = drawingRef.current === 'add'
    if (!!alive[i] === on) return
    alive[i] = on ? 1 : 0
    age[i]   = on ? 1 : 0
    setPop(countPop())
    paint()
  }
  const onPointerUp = () => { drawingRef.current = null }
  const onPointerLeave = () => { drawingRef.current = null; hoverRef.current = null; if (armedPattern) paint() }

  // ── Buttons ──
  const clearAll = () => {
    aliveRef.current.fill(0)
    ageRef.current.fill(0)
    setPop(0)
    setGen(0)
    paint()
  }
  const randomise = () => {
    const a = aliveRef.current, age = ageRef.current
    for (let i = 0; i < a.length; i++) {
      a[i] = Math.random() < 0.32 ? 1 : 0
      age[i] = a[i] ? 1 : 0
    }
    setPop(countPop())
    setGen(0)
    paint()
  }
  const stepOnce = () => {
    if (!running) { step(); paint() }
  }
  const saveState = () => {
    const s = encodeGrid(aliveRef.current)
    const url = `${window.location.origin}${window.location.pathname}?s=${s}`
    try {
      history.replaceState(null, '', `?s=${s}`)
      navigator.clipboard?.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch { /* clipboard may be denied */ }
    sfx.coin()
  }

  const density = ((population / (COLS * ROWS)) * 100).toFixed(1)

  return (
    <GameShell
      title="Game of Life"
      category="Sim"
      score={gen}
      best={population}
      level={speed}
      status={running ? 'playing' : gen > 0 ? 'paused' : 'ready'}
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn(v => !v)}
      onPause={() => setRunning(r => !r)}
      onRestart={clearAll}
      controls={[
        { key: 'L-click', label: 'Paint cell' },
        { key: 'R-click', label: 'Erase' },
        { key: 'Drag',    label: 'Paint / erase multiple' },
        { key: 'Space',   label: 'Play / pause' },
      ]}
    >
      <div className="p-3 sm:p-4 flex flex-col gap-3 lg:flex-row">
        {/* Grid */}
        <div className="flex-1 min-w-0">
          <div className="relative rounded-xl overflow-hidden border border-white/10 bg-[#0b0b12]">
            <canvas
              ref={canvasRef}
              width={COLS * CELL}
              height={ROWS * CELL}
              onContextMenu={(e) => e.preventDefault()}
              onMouseDown={onPointerDown}
              onMouseMove={onPointerMove}
              onMouseUp={onPointerUp}
              onMouseLeave={onPointerLeave}
              onTouchStart={onPointerDown}
              onTouchMove={onPointerMove}
              onTouchEnd={onPointerUp}
              style={{
                width: '100%',
                height: 'auto',
                display: 'block',
                cursor: armedPattern ? 'crosshair' : 'cell',
                touchAction: 'none',
              }}
            />
            {armedPattern && (
              <div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-fuchsia-500/20 border border-fuchsia-400/40 text-fuchsia-100 text-xs flex items-center gap-2">
                <span>Armed: <span className="font-semibold">{armedPattern}</span> — click to stamp</span>
                <button
                  type="button"
                  className="text-white/60 hover:text-white text-base leading-none"
                  onClick={() => setArmed(null)}
                >×</button>
              </div>
            )}
          </div>

          {/* Speed + toggles */}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="flex justify-between text-xs text-white/60 mb-1">
                <span>Speed</span>
                <span className="text-amber-300 font-mono">{speed} gen/s</span>
              </div>
              <Slider min={1} max={30} value={speed} onChange={setSpeed} accent="amber" />
            </div>
            <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center gap-3 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={wrap} onChange={e => setWrap(e.target.checked)} className="accent-fuchsia-500" />
                <span>Wraparound edges</span>
              </label>
              <div className="ml-auto text-xs text-white/50">Density <span className="text-emerald-300 font-mono">{density}%</span></div>
            </div>
          </div>
        </div>

        {/* Side panel */}
        <div className="w-full lg:w-72 shrink-0 space-y-3">
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="text-[11px] uppercase tracking-widest text-white/40 mb-2">Simulation</div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setRunning(r => !r)}
                className={`px-3 py-2 rounded-lg font-semibold border transition-colors text-sm ${running ? 'bg-rose-500/20 border-rose-400/40 text-rose-100 hover:bg-rose-500/30' : 'bg-emerald-500/20 border-emerald-400/40 text-emerald-100 hover:bg-emerald-500/30'}`}>
                {running ? 'Pause' : 'Play'}
              </button>
              <button type="button" onClick={stepOnce}
                className="px-3 py-2 rounded-lg font-semibold border border-white/15 bg-white/5 hover:bg-white/10 text-sm">
                Step
              </button>
              <button type="button" onClick={randomise}
                className="px-3 py-2 rounded-lg font-semibold border border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-100 hover:bg-fuchsia-500/25 text-sm">
                Random
              </button>
              <button type="button" onClick={clearAll}
                className="px-3 py-2 rounded-lg font-semibold border border-white/15 bg-white/5 hover:bg-white/10 text-sm">
                Clear
              </button>
              <button type="button" onClick={saveState}
                className="col-span-2 px-3 py-2 rounded-lg font-semibold border border-amber-400/40 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25 text-sm">
                Save state → copy URL
              </button>
            </div>
            {copied && (
              <div className="mt-2 text-[11px] text-emerald-300">
                URL copied to clipboard.
              </div>
            )}
          </div>

          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="text-[11px] uppercase tracking-widest text-white/40 mb-2">Pattern library</div>
            <div className="grid grid-cols-2 gap-2">
              {Object.keys(PATTERNS).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setArmed(p === armedPattern ? null : p)}
                  className={`px-2.5 py-2 text-xs rounded-lg border text-left ${armedPattern === p ? 'bg-fuchsia-500/25 border-fuchsia-400/50 text-white' : 'bg-white/5 border-white/10 hover:border-white/25 text-white/80'}`}
                >
                  {p}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-white/50 leading-relaxed">
              Pick a pattern, then click the grid to stamp it at the cursor.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs text-white/60 leading-relaxed">
            <div className="text-[11px] uppercase tracking-widest text-white/40 mb-2">About</div>
            Conway's Game of Life: cells with exactly 3 neighbours are born; 2–3 keeps them alive; other counts kill.
            Older colonies redden then turn fuchsia as their ages accrue.
          </div>
        </div>
      </div>
    </GameShell>
  )
}
