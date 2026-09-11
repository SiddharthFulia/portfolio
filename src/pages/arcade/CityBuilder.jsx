// CityBuilder.jsx — SimCity-lite.
// Zone residential / commercial / industrial, drop roads and power lines,
// watch citizens grow and commute between homes / shops / factories.
// Budget with a tax rate slider, random disaster events (fire + quake),
// agent-based sim with 100-1000 agents visualising commute paths.

import { useCallback, useEffect, useRef, useState } from 'react'
import GameShell from '../../components/arcade/GameShell'
import { getSfx } from '../../components/arcade/sfx'

const COLS = 40
const ROWS = 24
const TILE = 20
const CANVAS_W = COLS * TILE
const CANVAS_H = ROWS * TILE

// Tile kinds
const K = {
  GRASS: 0,
  ROAD:  1,
  POWER: 2,
  R:     3, // Residential zone (bare)
  C:     4, // Commercial zone
  I:     5, // Industrial zone
  WATER: 6,
  RUBBLE: 7,
}

const ZONE_COLORS = {
  [K.R]: '#22c55e',
  [K.C]: '#3b82f6',
  [K.I]: '#eab308',
}

const TOOL = {
  BULLDOZE: 'bulldoze',
  ROAD: 'road',
  POWER: 'power',
  R: 'zone-r',
  C: 'zone-c',
  I: 'zone-i',
}

const TOOL_COSTS = {
  [TOOL.BULLDOZE]: 2,
  [TOOL.ROAD]: 10,
  [TOOL.POWER]: 8,
  [TOOL.R]: 12,
  [TOOL.C]: 15,
  [TOOL.I]: 20,
}

// Seed river running vertically
function seedMap() {
  const m = new Uint8Array(COLS * ROWS)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const rx = 28 + Math.sin(r * 0.4) * 2
      if (c > rx && c < rx + 2) m[r*COLS + c] = K.WATER
      else m[r*COLS + c] = K.GRASS
    }
  }
  return m
}

export default function CityBuilder() {
  const canvasRef = useRef(null)
  const sfxRef = useRef(getSfx())

  const [status, setStatus] = useState('playing')
  const [soundOn, setSoundOn] = useState(true)
  const [money, setMoney] = useState(20000)
  const [population, setPopulation] = useState(0)
  const [year, setYear] = useState(1)
  const [best, setBest] = useState(0)
  const [tool, setTool] = useState(TOOL.R)
  const [tax, setTax] = useState(7)
  const [tick, setTick] = useState(0)

  useEffect(() => { sfxRef.current.setEnabled(soundOn) }, [soundOn])
  useEffect(() => { try { setBest(Number(localStorage.getItem('sid-city-best') || 0)) } catch {} }, [])

  const stateRef = useRef(null)

  const reset = useCallback(() => {
    stateRef.current = {
      map: seedMap(),
      density: new Float32Array(COLS * ROWS),  // 0..3 building height
      powered: new Uint8Array(COLS * ROWS),
      agents: [],
      particles: [],
      floats: [],       // floating +/- money text
      moneyFloat: 20000,
      elapsed: 0,
      dayTimer: 0,
      taxTimer: 0,
      agentSpawnT: 0,
      disaster: null,
      disasterTimer: 25,   // seconds until next roll
      paused: false,
      score: 0,
    }
    setMoney(20000); setPopulation(0); setYear(1); setStatus('playing')
  }, [])

  useEffect(() => { reset() }, [reset])

  const mouseToCell = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const x = (e.clientX - rect.left) * (canvasRef.current.width / rect.width) / dpr
    const y = (e.clientY - rect.top) * (canvasRef.current.height / rect.height) / dpr
    return { c: Math.floor(x / TILE), r: Math.floor(y / TILE) }
  }

  const applyTool = (c, r) => {
    const s = stateRef.current
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return
    const idx = r * COLS + c
    const kind = s.map[idx]
    if (kind === K.WATER) { sfxRef.current.hit(); return }
    const cost = TOOL_COSTS[tool] || 0
    if (s.moneyFloat < cost && tool !== TOOL.BULLDOZE) { sfxRef.current.hit(); return }
    if (tool === TOOL.BULLDOZE) {
      s.map[idx] = K.GRASS
      s.density[idx] = 0
      s.floats.push({ x: c*TILE + TILE/2, y: r*TILE + TILE/2, text: `-$${cost}`, color: '#ef4444', life: 0.9 })
      s.moneyFloat -= cost
    } else if (tool === TOOL.ROAD) {
      if (kind === K.GRASS || kind === K.RUBBLE) {
        s.map[idx] = K.ROAD; s.density[idx] = 0
        s.moneyFloat -= cost
        s.floats.push({ x: c*TILE + TILE/2, y: r*TILE + TILE/2, text: `-$${cost}`, color: '#f87171', life: 0.9 })
      }
    } else if (tool === TOOL.POWER) {
      if (kind === K.GRASS || kind === K.RUBBLE) {
        s.map[idx] = K.POWER; s.density[idx] = 0
        s.moneyFloat -= cost
        s.floats.push({ x: c*TILE + TILE/2, y: r*TILE + TILE/2, text: `-$${cost}`, color: '#f87171', life: 0.9 })
      }
    } else {
      const zoneKind = tool === TOOL.R ? K.R : tool === TOOL.C ? K.C : K.I
      if (kind === K.GRASS || kind === K.RUBBLE) {
        s.map[idx] = zoneKind
        s.moneyFloat -= cost
        s.floats.push({ x: c*TILE + TILE/2, y: r*TILE + TILE/2, text: `-$${cost}`, color: '#f87171', life: 0.9 })
      }
    }
    sfxRef.current.pop()
  }

  const onCanvasDown = (e) => {
    const s = stateRef.current; if (!s) return
    s.dragging = true
    const { c, r } = mouseToCell(e)
    applyTool(c, r)
  }
  const onCanvasMove = (e) => {
    const s = stateRef.current; if (!s || !s.dragging) return
    const { c, r } = mouseToCell(e)
    if (tool === TOOL.ROAD || tool === TOOL.POWER || tool === TOOL.BULLDOZE) applyTool(c, r)
  }
  const onCanvasUp = () => {
    const s = stateRef.current; if (!s) return
    s.dragging = false
  }

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    canvas.width = CANVAS_W * dpr
    canvas.height = CANVAS_H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    let raf = 0
    let last = performance.now()
    let hudTimer = 0

    // Power propagation — flood fill from any power tile that has a
    // neighbouring zone/road, out to a distance of 12 tiles.
    const propagatePower = (s) => {
      s.powered.fill(0)
      const queue = []
      for (let i = 0; i < s.map.length; i++) {
        if (s.map[i] === K.POWER) { s.powered[i] = 1; queue.push(i) }
      }
      let head = 0
      const maxHops = 14
      // Track distance
      const dist = new Uint8Array(s.map.length)
      while (head < queue.length) {
        const idx = queue[head++]
        const c = idx % COLS; const r = Math.floor(idx / COLS)
        if (dist[idx] >= maxHops) continue
        const neigh = [[c-1,r],[c+1,r],[c,r-1],[c,r+1]]
        for (const [nc, nr] of neigh) {
          if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue
          const ni = nr*COLS + nc
          if (s.powered[ni]) continue
          const k = s.map[ni]
          if (k === K.WATER) continue
          if (k === K.POWER || k === K.ROAD || k === K.R || k === K.C || k === K.I) {
            s.powered[ni] = 1
            dist[ni] = dist[idx] + 1
            queue.push(ni)
          }
        }
      }
    }

    const nearRoad = (s, c, r) => {
      for (const [dc, dr] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nc = c + dc, nr = r + dr
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue
        if (s.map[nr*COLS + nc] === K.ROAD) return true
      }
      return false
    }

    // Density growth — every zone tile that is powered + adjacent to road
    // grows density up to 3 based on nearby R/C/I balance.
    const growCity = (s, dt) => {
      let rCount = 0, cCount = 0, iCount = 0, pop = 0
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const idx = r*COLS + c
          const k = s.map[idx]
          if (k === K.R) rCount += Math.max(1, s.density[idx])
          else if (k === K.C) cCount += Math.max(1, s.density[idx])
          else if (k === K.I) iCount += Math.max(1, s.density[idx])
        }
      }
      // Growth per-zone driven by balance: R grows if C+I >= R*0.4
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const idx = r*COLS + c
          const k = s.map[idx]
          if (k !== K.R && k !== K.C && k !== K.I) continue
          if (!s.powered[idx]) continue
          if (!nearRoad(s, c, r)) continue
          const cur = s.density[idx]
          let want = 0
          if (k === K.R) want = Math.min(3, (cCount + iCount) / Math.max(1, rCount) * 2)
          else if (k === K.C) want = Math.min(3, (rCount * 0.6) / Math.max(1, cCount))
          else if (k === K.I) want = Math.min(3, (rCount * 0.4) / Math.max(1, iCount))
          if (want > cur) s.density[idx] = Math.min(want, cur + dt * 0.35)
          if (k === K.R) pop += Math.floor(s.density[idx] * 20)
        }
      }
      return pop
    }

    // Random walk agents — spawn from R tiles, wander to nearest C/I tile,
    // then back home. Visual only; commute path illustrates the sim.
    const stepAgents = (s, dt) => {
      // Spawn agents proportional to population, capped.
      s.agentSpawnT += dt
      const target = Math.min(120, Math.floor(population / 12))
      if (s.agentSpawnT > 0.6 && s.agents.length < target) {
        s.agentSpawnT = 0
        // Pick a random R with density > 0
        let src = null
        for (let tries = 0; tries < 30; tries++) {
          const c = Math.floor(Math.random() * COLS)
          const r = Math.floor(Math.random() * ROWS)
          if (s.map[r*COLS + c] === K.R && s.density[r*COLS + c] > 0.5) { src = { c, r }; break }
        }
        if (src) {
          let dst = null; let bestD = Infinity
          for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
              const k = s.map[r*COLS + c]
              if (k === K.C || k === K.I) {
                const d = Math.abs(c - src.c) + Math.abs(r - src.r)
                if (d < bestD) { bestD = d; dst = { c, r } }
              }
            }
          }
          if (dst) {
            s.agents.push({
              x: src.c * TILE + TILE/2, y: src.r * TILE + TILE/2,
              home: src, work: dst, phase: 'toWork', t: 0,
              color: `hsl(${(Math.random()*80+180)|0}, 70%, 65%)`,
            })
          }
        }
      }
      for (const a of s.agents) {
        const goal = a.phase === 'toWork' ? a.work : a.home
        const gx = goal.c * TILE + TILE/2
        const gy = goal.r * TILE + TILE/2
        const dx = gx - a.x, dy = gy - a.y
        const d = Math.hypot(dx, dy)
        if (d < 4) {
          a.phase = a.phase === 'toWork' ? 'toHome' : 'toWork'
          a.t += 1
          continue
        }
        const speed = 22
        a.x += (dx/d) * speed * dt
        a.y += (dy/d) * speed * dt
      }
      // Cull very old agents
      if (s.agents.length > 200) s.agents.splice(0, s.agents.length - 200)
    }

    const doDisaster = (s) => {
      const roll = Math.random()
      if (roll < 0.55) {
        // Fire — pick random built-up zone and burn it down
        const buildings = []
        for (let i = 0; i < s.map.length; i++) {
          if ((s.map[i] === K.R || s.map[i] === K.C || s.map[i] === K.I) && s.density[i] > 1) buildings.push(i)
        }
        if (!buildings.length) return
        const idx = buildings[Math.floor(Math.random() * buildings.length)]
        s.disaster = { type: 'fire', idx, ttl: 4 }
        s.map[idx] = K.RUBBLE
        s.density[idx] = 0
        sfxRef.current.boom()
      } else {
        // Earthquake — damage 6-10 random tiles
        const count = 6 + Math.floor(Math.random() * 5)
        for (let i = 0; i < count; i++) {
          const c = Math.floor(Math.random() * COLS)
          const r = Math.floor(Math.random() * ROWS)
          const idx = r*COLS + c
          const k = s.map[idx]
          if (k === K.R || k === K.C || k === K.I || k === K.ROAD || k === K.POWER) {
            s.map[idx] = K.RUBBLE; s.density[idx] = 0
          }
        }
        s.disaster = { type: 'quake', ttl: 3 }
        sfxRef.current.death()
      }
    }

    const draw = () => {
      const s = stateRef.current; if (!s) return
      // Base map
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const idx = r*COLS + c
          const k = s.map[idx]
          let fill = '#2e5a35'
          if ((c + r) % 2 === 1) fill = '#28522f'
          if (k === K.WATER) fill = '#0e7490'
          else if (k === K.ROAD) fill = '#3f3f46'
          else if (k === K.POWER) fill = '#450a0a'
          else if (k === K.RUBBLE) fill = '#78716c'
          ctx.fillStyle = fill
          ctx.fillRect(c*TILE, r*TILE, TILE, TILE)
          // Road markings
          if (k === K.ROAD) {
            ctx.fillStyle = '#fef3c7'
            ctx.fillRect(c*TILE + TILE/2 - 1, r*TILE + 4, 2, 4)
            ctx.fillRect(c*TILE + TILE/2 - 1, r*TILE + TILE - 8, 2, 4)
          }
          // Power lines
          if (k === K.POWER) {
            ctx.strokeStyle = '#facc15'
            ctx.lineWidth = 1
            ctx.beginPath(); ctx.moveTo(c*TILE + 2, r*TILE + 2); ctx.lineTo(c*TILE + TILE - 2, r*TILE + TILE - 2); ctx.stroke()
            ctx.beginPath(); ctx.moveTo(c*TILE + TILE - 2, r*TILE + 2); ctx.lineTo(c*TILE + 2, r*TILE + TILE - 2); ctx.stroke()
          }
          // Zones
          if (k === K.R || k === K.C || k === K.I) {
            ctx.fillStyle = ZONE_COLORS[k] + '30'
            ctx.fillRect(c*TILE, r*TILE, TILE, TILE)
            const density = s.density[idx]
            if (density > 0.4) {
              const h = Math.min(TILE - 3, density * 5 + 3)
              const w = TILE - 6
              const bx = c*TILE + 3
              const by = r*TILE + TILE - h - 2
              // Shadow
              ctx.fillStyle = 'rgba(0,0,0,0.35)'
              ctx.fillRect(bx + 2, by + 2, w, h)
              // Building
              ctx.fillStyle = ZONE_COLORS[k]
              ctx.fillRect(bx, by, w, h)
              ctx.strokeStyle = '#000'; ctx.lineWidth = 1
              ctx.strokeRect(bx, by, w, h)
              // Windows
              ctx.fillStyle = 'rgba(254,240,138,0.6)'
              for (let wr = 2; wr < h - 2; wr += 3) {
                for (let wc = 2; wc < w - 2; wc += 3) {
                  ctx.fillRect(bx + wc, by + wr, 1, 1)
                }
              }
              // No power overlay
              if (!s.powered[idx]) {
                ctx.fillStyle = 'rgba(0,0,0,0.55)'
                ctx.fillRect(bx, by, w, h)
                ctx.fillStyle = '#fecaca'
                ctx.font = '8px system-ui'
                ctx.textAlign = 'center'
                ctx.fillText('⚡', c*TILE + TILE/2, r*TILE + TILE/2 + 2)
              }
            }
          }
          if (k === K.RUBBLE) {
            ctx.fillStyle = '#292524'
            ctx.fillRect(c*TILE + 3, r*TILE + 3, 4, 4)
            ctx.fillRect(c*TILE + TILE - 8, r*TILE + TILE - 8, 5, 5)
          }
        }
      }

      // Agents
      for (const a of s.agents) {
        ctx.fillStyle = a.color
        ctx.fillRect(a.x - 1, a.y - 1, 2, 2)
      }

      // Floating money text
      for (const f of s.floats) {
        ctx.fillStyle = f.color + Math.floor(Math.min(1, f.life/0.9) * 255).toString(16).padStart(2,'0')
        ctx.font = 'bold 10px ui-monospace, monospace'
        ctx.textAlign = 'center'
        ctx.fillText(f.text, f.x, f.y)
      }

      // Disaster overlay
      if (s.disaster) {
        if (s.disaster.type === 'fire' && s.disaster.idx != null) {
          const c = s.disaster.idx % COLS; const r = Math.floor(s.disaster.idx / COLS)
          ctx.fillStyle = 'rgba(239,68,68,0.6)'
          ctx.fillRect(c*TILE, r*TILE, TILE, TILE)
        } else if (s.disaster.type === 'quake') {
          const shake = Math.sin(s.elapsed * 40) * 3
          ctx.setTransform(dpr, 0, 0, dpr, shake, shake)
        }
      }

      // Population growth indicator — pulsing green ring on newly grown buildings
      // (handled visually via building drawing; we skip an extra pass for perf)
    }

    const step = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const s = stateRef.current
      if (!s || s.paused) { draw(); raf = requestAnimationFrame(step); return }
      s.elapsed += dt
      s.dayTimer += dt
      s.taxTimer += dt
      s.disasterTimer -= dt

      // Propagate power once per second
      if (s.dayTimer > 1) {
        s.dayTimer = 0
        propagatePower(s)
      }

      // Grow city
      const pop = growCity(s, dt)
      // Set population every 0.5s to avoid render churn
      if (Math.random() < dt * 2) setPopulation(pop)

      // Tax collection every 6 seconds — represents "month end"
      if (s.taxTimer > 6) {
        s.taxTimer = 0
        const income = Math.floor(pop * tax * 0.05)
        const upkeep = Math.floor(s.map.reduce((acc, k) => acc + (k === K.ROAD ? 0.2 : k === K.POWER ? 0.3 : 0), 0))
        s.moneyFloat += income - upkeep
        if (income) s.floats.push({ x: CANVAS_W - 40, y: 20, text: `+$${income}`, color: '#4ade80', life: 1.2 })
        if (upkeep) s.floats.push({ x: CANVAS_W - 40, y: 32, text: `-$${upkeep}`, color: '#f87171', life: 1.2 })
      }

      // Year every 30 seconds
      if (Math.floor(s.elapsed / 30) + 1 > year) setYear(Math.floor(s.elapsed / 30) + 1)

      // Agents
      stepAgents(s, dt)

      // Disaster rolls
      if (s.disasterTimer <= 0) {
        s.disasterTimer = 25 + Math.random() * 25
        if (pop > 40 && Math.random() < 0.7) doDisaster(s)
      }
      if (s.disaster) {
        s.disaster.ttl -= dt
        if (s.disaster.ttl <= 0) s.disaster = null
      }

      // Floats
      for (const f of s.floats) { f.life -= dt; f.y -= 10 * dt }
      s.floats = s.floats.filter((f) => f.life > 0)

      draw()

      hudTimer += dt
      if (hudTimer > 0.2) {
        hudTimer = 0
        setMoney(Math.floor(s.moneyFloat))
        setTick((t) => t + 1)
        // Update best on population high water mark
        try {
          if (pop > best) { localStorage.setItem('sid-city-best', String(pop)); setBest(pop) }
        } catch {}
      }

      // Game over — bankruptcy
      if (s.moneyFloat < -3000 && status !== 'over') {
        setStatus('over'); s.paused = true; sfxRef.current.death()
      }

      raf = requestAnimationFrame(step)
    }

    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [tool, tax, best, population, year, status])

  const onPause = () => {
    if (!stateRef.current) return
    stateRef.current.paused = !stateRef.current.paused
    setStatus(stateRef.current.paused ? 'paused' : 'playing')
  }
  const onRestart = () => reset()

  const toolBtn = (t, label, color) => (
    <button
      type="button"
      key={t}
      onClick={() => setTool(t)}
      className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-all ${tool === t ? 'border-amber-400 bg-amber-400/10' : 'border-white/15 hover:border-white/30'}`}
      style={tool === t ? {} : { color }}
    >
      {label} <span className="text-white/50">${TOOL_COSTS[t]}</span>
    </button>
  )

  return (
    <GameShell
      title="City Builder"
      category="Strategy"
      score={population}
      best={best}
      level={year}
      status={status}
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn((v) => !v)}
      onRestart={onRestart}
      onPause={onPause}
      extraStats={
        <>
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Cash</span>
            <span className={`text-xl sm:text-2xl font-bold tabular-nums ${money < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>${money}</span>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Tax</span>
            <span className="text-xl sm:text-2xl font-bold tabular-nums text-amber-300">{tax}%</span>
          </div>
        </>
      }
      controls={[
        { key: 'Click', label: 'Apply tool' },
        { key: 'Drag', label: 'Paint roads/power' },
        { key: 'R', label: 'Zone R' },
        { key: 'C', label: 'Zone C' },
        { key: 'I', label: 'Zone I' },
      ]}
      footer={
        <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 lg:col-span-2">
            <div className="text-[11px] uppercase tracking-widest text-white/50 mb-2">Tools</div>
            <div className="flex flex-wrap gap-1.5">
              {toolBtn(TOOL.BULLDOZE, 'Bulldoze', '#f87171')}
              {toolBtn(TOOL.ROAD, 'Road', '#fbbf24')}
              {toolBtn(TOOL.POWER, 'Power', '#facc15')}
              {toolBtn(TOOL.R, 'Zone R', '#4ade80')}
              {toolBtn(TOOL.C, 'Zone C', '#60a5fa')}
              {toolBtn(TOOL.I, 'Zone I', '#eab308')}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-[11px] uppercase tracking-widest text-white/50 mb-2">Tax rate</div>
            <input
              type="range" min={0} max={20} value={tax}
              onChange={(e) => setTax(Number(e.target.value))}
              className="w-full accent-amber-400"
            />
            <div className="text-xs text-white/60 mt-1">
              {tax < 4 ? 'Low tax — pop grows fast, cash slow' : tax > 12 ? 'High tax — cash flows, pop shrinks' : 'Balanced'}
            </div>
          </div>
        </div>
      }
      overlay={status === 'over' ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="text-center">
            <div className="text-4xl font-bold bg-gradient-to-r from-amber-300 to-rose-300 bg-clip-text text-transparent mb-2">
              Bankrupt
            </div>
            <div className="text-white/70 mb-4">Population peaked at {best}</div>
            <button type="button" onClick={onRestart} className="px-5 py-2 rounded-lg bg-white text-black font-semibold">Rebuild</button>
          </div>
        </div>
      ) : null}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={onCanvasDown}
        onMouseMove={onCanvasMove}
        onMouseUp={onCanvasUp}
        onMouseLeave={onCanvasUp}
        onTouchStart={(e) => { const t = e.touches[0]; if (t) onCanvasDown({ clientX: t.clientX, clientY: t.clientY }) }}
        onTouchMove={(e) => { const t = e.touches[0]; if (t) onCanvasMove({ clientX: t.clientX, clientY: t.clientY }); e.preventDefault() }}
        onTouchEnd={onCanvasUp}
        onKeyDown={(e) => {
          if (e.key === 'r' || e.key === 'R') setTool(TOOL.R)
          if (e.key === 'c' || e.key === 'C') setTool(TOOL.C)
          if (e.key === 'i' || e.key === 'I') setTool(TOOL.I)
          if (e.key === 'd' || e.key === 'D') setTool(TOOL.ROAD)
          if (e.key === 'p' || e.key === 'P') setTool(TOOL.POWER)
          if (e.key === 'x' || e.key === 'X') setTool(TOOL.BULLDOZE)
        }}
        tabIndex={0}
        style={{ width: '100%', maxHeight: '80vh', display: 'block', cursor: 'crosshair' }}
      />
    </GameShell>
  )
}
