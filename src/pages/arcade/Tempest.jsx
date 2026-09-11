// Tempest — Atari 1981, vector graphics. The playfield is a circular
// tunnel viewed head-on: 16 rail segments arranged around a perimeter.
// The player (a "claw") sits on the rim and can slide between segments.
// Enemies spawn at the far end of the tunnel and climb up along the
// rails toward the rim.
//
// Enemy types:
//   • Flipper   — moves up its rail, occasionally hops sideways to a
//                 neighbouring rail. Deadly at the rim.
//   • Tanker    — slow tank that reaches the rim and splits into two
//                 flippers.
//   • Spiker    — plants an axial "spike" that grows outward and blocks
//                 the player's zap-line unless shot down.
//   • Fuseball  — bounces vertically along rails; wraps around and can
//                 kill the player if it reaches the rim.
//
// Player superzapper — one per level: annihilates all enemies on screen.
//
// Rendering: pure wireframe. Everything drawn as 1-2px thin lines with
// perspective projection to a vanishing point. Depth z ∈ [0,1] scales
// the rail x/y toward the centre. No pixel-art sprites — this is the
// vector-graphics odd-one-out.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GameShell from '../../components/arcade/GameShell'
import { getSfx } from '../../components/arcade/sfx'

const RAILS = 16
const CANVAS_W = 640
const CANVAS_H = 480
const CX = CANVAS_W / 2
const CY = CANVAS_H / 2
const RIM_R = 220         // rim (near) radius in screen space
const CENTRE_R = 24       // far end (vanishing) radius

// Precompute the 16 rim points around a circle. Rail i sits between
// perimeter points i and i+1.
const RAIL_ANGLES = Array.from({ length: RAILS }, (_, i) => (i / RAILS) * Math.PI * 2 - Math.PI / 2)

// z: 0 = far, 1 = rim
const project = (rail, z) => {
  const a = RAIL_ANGLES[rail]
  const r = CENTRE_R + (RIM_R - CENTRE_R) * z
  return { x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r }
}

// Player centre on rail edge (between rail and rail+1)
const projectPlayer = (railPos, z) => {
  const iA = Math.floor(railPos) % RAILS
  const iB = (iA + 1) % RAILS
  const t = railPos - Math.floor(railPos)
  const a = RAIL_ANGLES[iA] * (1 - t) + RAIL_ANGLES[iB] * t
  const r = CENTRE_R + (RIM_R - CENTRE_R) * z
  return { x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r, angle: a }
}

const spawnFlipper = (level) => ({
  type: 'flipper',
  rail: Math.floor(Math.random() * RAILS),
  z: 0.02,
  vz: 0.0018 + level * 0.00015,
  flipT: 0,
  flipDir: Math.random() < 0.5 ? -1 : 1,
})
const spawnTanker = (level) => ({
  type: 'tanker',
  rail: Math.floor(Math.random() * RAILS),
  z: 0.02,
  vz: 0.0012 + level * 0.0001,
})
const spawnSpiker = (level) => ({
  type: 'spiker',
  rail: Math.floor(Math.random() * RAILS),
  z: 0.02,
  vz: 0.0022 + level * 0.00018,
  spikeZ: 0,
  spiking: true,
})
const spawnFuseball = () => ({
  type: 'fuseball',
  rail: Math.floor(Math.random() * RAILS),
  z: 0.02,
  vz: 0.003,
  wobble: 0,
})

const enemyForLevel = (level) => {
  const r = Math.random()
  if (level >= 4 && r < 0.12) return spawnFuseball()
  if (level >= 3 && r < 0.28) return spawnSpiker(level)
  if (level >= 2 && r < 0.42) return spawnTanker(level)
  return spawnFlipper(level)
}

export default function Tempest() {
  const canvasRef = useRef(null)
  const rafRef = useRef(0)

  const [status, setStatus] = useState('ready')
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(() => Number(localStorage.getItem('arcade.tempest.best') || 0))
  const [level, setLevel] = useState(1)
  const [lives, setLives] = useState(3)
  const [superzaps, setSuperzaps] = useState(1)
  const [soundOn, setSoundOn] = useState(true)

  const state = useRef(null)
  const keys = useRef({})
  const sfx = useMemo(() => getSfx(), [])

  const reset = useCallback(() => {
    state.current = {
      playerRail: 0,
      enemies: [],
      bullets: [],           // {rail, z, vz}
      spikes: new Map(),     // rail -> z growth
      score: 0,
      lives: 3,
      level: 1,
      superzaps: 1,
      spawnTimer: 0,
      killsToWin: 15,
      kills: 0,
      shake: 0,
      chromatic: 0,
      popups: [],             // {rail, z, text, ttl, color}
      cooldown: 0,
      startCountdown: 60,
    }
    setScore(0); setLevel(1); setLives(3); setSuperzaps(1); setStatus('ready')
  }, [])

  useEffect(() => { reset() }, [reset])

  useEffect(() => {
    const down = (e) => {
      keys.current[e.key] = true
      if (e.key === ' ') fire()
      if (e.key === 'Shift') superzap()
      if (e.key === 'p' || e.key === 'P') setStatus(p => p === 'paused' ? 'playing' : p === 'playing' ? 'paused' : p)
      if (['ArrowLeft','ArrowRight',' ','Shift'].includes(e.key)) e.preventDefault()
      if (status === 'ready') setStatus('playing')
    }
    const up = (e) => { keys.current[e.key] = false }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  const fire = useCallback(() => {
    const s = state.current; if (!s) return
    if (s.cooldown > 0) return
    s.bullets.push({ rail: Math.floor(s.playerRail + 0.5) % RAILS, z: 0.98, vz: -0.03 })
    s.cooldown = 6
    if (soundOn) sfx.laser()
    if (status === 'ready') setStatus('playing')
  }, [soundOn, sfx, status])

  const superzap = useCallback(() => {
    const s = state.current; if (!s) return
    if (s.superzaps <= 0 || status !== 'playing') return
    s.superzaps--
    setSuperzaps(s.superzaps)
    for (const e of s.enemies) {
      s.score += 100
      s.popups.push({ rail: e.rail, z: e.z, text: '+100', ttl: 30, color: '#37e0ff' })
    }
    s.enemies.length = 0
    s.shake = 12
    s.chromatic = 20
    if (soundOn) sfx.boom()
  }, [soundOn, sfx, status])

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')
    canvas.width = CANVAS_W; canvas.height = CANVAS_H

    let last = performance.now()
    let frame = 0

    const loop = (t) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t
      frame++
      if (status === 'playing') step(dt, frame)
      draw(frame)
      rafRef.current = requestAnimationFrame(loop)
    }

    const killPlayer = () => {
      const s = state.current
      s.lives -= 1
      s.shake = 20
      s.chromatic = 30
      if (soundOn) sfx.death()
      if (s.lives <= 0) {
        setLives(0)
        setStatus('over')
        const prev = Number(localStorage.getItem('arcade.tempest.best') || 0)
        if (s.score > prev) {
          localStorage.setItem('arcade.tempest.best', String(s.score))
          setBest(s.score)
        }
      } else {
        setLives(s.lives)
        s.enemies.length = 0
        s.bullets.length = 0
        s.spikes.clear()
        s.startCountdown = 40
      }
    }

    const step = (dt, f) => {
      const s = state.current; if (!s) return
      if (s.startCountdown > 0) { s.startCountdown--; return }

      s.cooldown = Math.max(0, s.cooldown - 1)

      const railSpeed = 6 * dt
      if (keys.current.ArrowLeft || keys.current.a || keys.current.A) s.playerRail = (s.playerRail - railSpeed + RAILS) % RAILS
      if (keys.current.ArrowRight || keys.current.d || keys.current.D) s.playerRail = (s.playerRail + railSpeed) % RAILS

      // Bullets travel outward (z decreases from rim to far)
      for (const b of s.bullets) b.z += b.vz
      s.bullets = s.bullets.filter(b => b.z > 0)

      // Spikes grow outward from the far end
      for (const [rail, sp] of s.spikes) {
        if (sp.growing) sp.z = Math.min(sp.z + 0.002, 0.9)
      }

      // Bullet vs enemy
      for (const b of s.bullets) {
        for (const e of s.enemies) {
          if (e.rail === b.rail && Math.abs(e.z - b.z) < 0.05) {
            const pts = e.type === 'flipper' ? 150 : e.type === 'tanker' ? 100 : e.type === 'spiker' ? 50 : 250
            s.score += pts
            s.popups.push({ rail: e.rail, z: e.z, text: `+${pts}`, ttl: 30, color: '#ffb8de' })
            e.dead = true
            b.dead = true
            s.kills++
            if (e.type === 'tanker') {
              // Split into two flippers
              s.enemies.push({ type: 'flipper', rail: e.rail, z: e.z, vz: 0.003, flipT: 0, flipDir: 1 })
              s.enemies.push({ type: 'flipper', rail: (e.rail + 1) % RAILS, z: e.z, vz: 0.003, flipT: 0, flipDir: -1 })
            }
            if (soundOn) sfx.hit()
            break
          }
        }
      }
      // Bullet vs spike
      for (const b of s.bullets) {
        const sp = s.spikes.get(b.rail)
        if (sp && b.z <= sp.z + 0.02) {
          sp.z = Math.max(0, sp.z - 0.08)
          if (sp.z <= 0.01) s.spikes.delete(b.rail)
          b.dead = true
          s.score += 5
          if (soundOn) sfx.pop()
        }
      }
      s.enemies = s.enemies.filter(e => !e.dead)
      s.bullets = s.bullets.filter(b => !b.dead)

      // Enemy updates
      for (const e of s.enemies) {
        if (e.type === 'flipper') {
          e.z += e.vz + s.level * 0.00005
          e.flipT += dt
          if (e.flipT > 1.2) {
            e.flipT = 0
            e.rail = (e.rail + e.flipDir + RAILS) % RAILS
            if (Math.random() < 0.3) e.flipDir *= -1
          }
        } else if (e.type === 'tanker') {
          e.z += e.vz
        } else if (e.type === 'spiker') {
          e.z += e.vz
          if (e.spiking) {
            const sp = s.spikes.get(e.rail) || { z: 0, growing: true }
            sp.growing = true
            s.spikes.set(e.rail, sp)
          }
          if (e.z > 0.7) e.spiking = false
        } else if (e.type === 'fuseball') {
          e.wobble += dt
          e.z += e.vz * (0.5 + Math.abs(Math.sin(e.wobble * 3)) * 0.8)
          if (Math.random() < 0.02) e.rail = (e.rail + (Math.random() < 0.5 ? -1 : 1) + RAILS) % RAILS
        }
        // Reached the rim?
        if (e.z >= 0.98) {
          if (e.type === 'flipper' || e.type === 'fuseball') {
            const dr = ((e.rail - s.playerRail + RAILS) % RAILS)
            if (dr < 0.7 || dr > RAILS - 0.7) {
              killPlayer()
              e.dead = true
            } else {
              e.dead = true
              // "Miss" — enemy still despawns but no damage
            }
          } else if (e.type === 'tanker') {
            // Tanker at rim splits into two flippers
            s.enemies.push({ type: 'flipper', rail: e.rail, z: 0.96, vz: 0.003, flipT: 0, flipDir: 1 })
            s.enemies.push({ type: 'flipper', rail: (e.rail + 1) % RAILS, z: 0.96, vz: 0.003, flipT: 0, flipDir: -1 })
            e.dead = true
          } else {
            e.dead = true
          }
        }
      }
      s.enemies = s.enemies.filter(e => !e.dead)

      // Spike-at-rim damage
      const playerRailInt = Math.floor(s.playerRail + 0.5) % RAILS
      for (const [rail, sp] of s.spikes) {
        if (sp.z > 0.85 && rail === playerRailInt) {
          killPlayer()
          break
        }
      }

      // Spawn enemies
      s.spawnTimer -= dt
      if (s.spawnTimer <= 0 && s.enemies.length < 6 + s.level && s.kills < s.killsToWin) {
        s.enemies.push(enemyForLevel(s.level))
        s.spawnTimer = Math.max(0.5, 2.0 - s.level * 0.12)
      }

      // Level clear
      if (s.kills >= s.killsToWin && s.enemies.length === 0) {
        s.level++
        setLevel(s.level)
        s.superzaps++
        setSuperzaps(s.superzaps)
        s.kills = 0
        s.killsToWin = 15 + s.level * 3
        s.spikes.clear()
        s.startCountdown = 60
        if (soundOn) sfx.win()
      }

      for (const p of s.popups) p.ttl--
      s.popups = s.popups.filter(p => p.ttl > 0)
      if (s.shake > 0) s.shake *= 0.9
      if (s.chromatic > 0) s.chromatic *= 0.92

      setScore(s.score)
    }

    const drawSegment = (rail, colour = '#37e0ff', dash = false) => {
      const p1 = project(rail, 0)
      const p2 = project(rail, 1)
      if (dash) ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(p1.x, p1.y)
      ctx.lineTo(p2.x, p2.y)
      ctx.strokeStyle = colour
      ctx.stroke()
      ctx.setLineDash([])
    }

    const drawPolygonZ = (z, colour = '#0a2540') => {
      ctx.beginPath()
      for (let i = 0; i < RAILS; i++) {
        const p = project(i, z)
        if (i === 0) ctx.moveTo(p.x, p.y)
        else ctx.lineTo(p.x, p.y)
      }
      ctx.closePath()
      ctx.strokeStyle = colour
      ctx.stroke()
    }

    const drawEnemyGlyph = (e, f) => {
      const p = project(e.rail, e.z)
      const size = 4 + e.z * 20
      ctx.save()
      ctx.translate(p.x, p.y)
      if (e.type === 'flipper') {
        ctx.strokeStyle = '#ff6ad5'
        ctx.lineWidth = 2
        // X-shape with wings
        const wing = size * (Math.floor(f / 6) % 2 ? 1.2 : 0.8)
        ctx.beginPath()
        ctx.moveTo(-wing, -size); ctx.lineTo(wing, size)
        ctx.moveTo(-wing, size); ctx.lineTo(wing, -size)
        ctx.stroke()
      } else if (e.type === 'tanker') {
        ctx.strokeStyle = '#c4a300'
        ctx.lineWidth = 2
        ctx.strokeRect(-size, -size * 0.6, size * 2, size * 1.2)
      } else if (e.type === 'spiker') {
        ctx.strokeStyle = '#a3ff9c'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(-size, 0); ctx.lineTo(0, -size); ctx.lineTo(size, 0); ctx.lineTo(0, size); ctx.closePath()
        ctx.stroke()
      } else if (e.type === 'fuseball') {
        ctx.strokeStyle = '#ff425c'
        ctx.lineWidth = 2
        const rr = size * (0.6 + Math.abs(Math.sin(e.wobble * 6)) * 0.4)
        ctx.beginPath()
        for (let k = 0; k < 8; k++) {
          const a = k / 8 * Math.PI * 2
          const rrr = rr * (0.6 + Math.random() * 0.6)
          const x = Math.cos(a) * rrr, y = Math.sin(a) * rrr
          k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        }
        ctx.closePath()
        ctx.stroke()
      }
      ctx.restore()
    }

    const draw = (f) => {
      const s = state.current; if (!s) return
      ctx.save()
      const reducedEl = document.querySelector('[data-reduced-motion="true"]')
      if (!reducedEl && s.shake > 0.1) {
        ctx.translate((Math.random() - 0.5) * s.shake * 0.4, (Math.random() - 0.5) * s.shake * 0.4)
      }
      ctx.fillStyle = '#020210'
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

      // Tunnel wireframe
      ctx.lineWidth = 1
      for (const zd of [0.2, 0.4, 0.6, 0.8]) drawPolygonZ(zd, `rgba(80, 140, 255, ${0.15 + zd * 0.2})`)
      // Perimeter (rim) — brighter
      ctx.lineWidth = 2
      drawPolygonZ(1, '#37e0ff')
      // Vanishing point ring
      ctx.lineWidth = 1
      drawPolygonZ(0.02, 'rgba(80,140,255,0.5)')

      // Rails
      ctx.lineWidth = 1
      for (let i = 0; i < RAILS; i++) drawSegment(i, 'rgba(80,140,255,0.4)')

      // Spikes
      for (const [rail, sp] of s.spikes) {
        const from = project(rail, 0.02)
        const to = project(rail, Math.min(sp.z, 1))
        ctx.strokeStyle = '#a3ff9c'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(from.x, from.y)
        ctx.lineTo(to.x, to.y)
        ctx.stroke()
      }

      // Enemies
      for (const e of s.enemies) drawEnemyGlyph(e, f)

      // Bullets
      for (const b of s.bullets) {
        const p = project(b.rail, b.z)
        ctx.fillStyle = '#fff2a8'
        ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI*2); ctx.fill()
      }

      // Player claw at rim
      const pl = projectPlayer(s.playerRail + 0.5, 1)
      ctx.strokeStyle = '#ffe066'
      ctx.lineWidth = 3
      const clawSize = 26
      const c = Math.cos(pl.angle), sA = Math.sin(pl.angle)
      // 4-prong claw
      for (const off of [-0.13, -0.05, 0.05, 0.13]) {
        const ax = pl.x - c * 6 + sA * clawSize * off * 2
        const ay = pl.y - sA * 6 - c * clawSize * off * 2
        const bx = ax + c * 22
        const by = ay + sA * 22
        ctx.beginPath()
        ctx.moveTo(ax, ay)
        ctx.lineTo(bx, by)
        ctx.stroke()
      }

      // Popups
      ctx.font = 'bold 13px monospace'
      ctx.textAlign = 'center'
      for (const p of s.popups) {
        const pp = project(p.rail, p.z)
        ctx.fillStyle = p.color
        ctx.globalAlpha = Math.min(1, p.ttl / 30)
        ctx.fillText(p.text, pp.x, pp.y - (30 - p.ttl))
      }
      ctx.globalAlpha = 1

      // HUD overlay: superzappers count
      ctx.font = 'bold 12px monospace'
      ctx.textAlign = 'left'
      ctx.fillStyle = '#37e0ff'
      ctx.fillText(`SUPERZAP × ${s.superzaps}`, 16, 22)

      if (s.startCountdown > 0) {
        ctx.font = 'bold 22px monospace'
        ctx.fillStyle = '#ffe066'
        ctx.textAlign = 'center'
        ctx.fillText(`LEVEL ${s.level}`, CX, CY - 30)
      }

      ctx.restore()

      if (!reducedEl && s.chromatic > 2) {
        ctx.save()
        ctx.globalCompositeOperation = 'screen'
        ctx.globalAlpha = 0.35
        ctx.drawImage(canvas, s.chromatic * 0.3, 0)
        ctx.restore()
      }

      // Scanlines (subtle)
      ctx.save()
      ctx.globalAlpha = 0.06
      ctx.fillStyle = '#000'
      for (let y = 0; y < CANVAS_H; y += 2) ctx.fillRect(0, y, CANVAS_W, 1)
      ctx.restore()
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [status, soundOn, sfx])

  useEffect(() => { sfx.setEnabled(soundOn) }, [soundOn, sfx])

  const touchHold = (k, v) => { keys.current[k] = v }

  return (
    <GameShell
      title="Tempest"
      category="Retro"
      score={score}
      best={best}
      level={level}
      status={status}
      extraStats={
        <>
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Lives</span>
            <span className="text-xl sm:text-2xl font-bold tabular-nums text-yellow-300">{lives}</span>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Zap</span>
            <span className="text-xl sm:text-2xl font-bold tabular-nums text-cyan-300">{superzaps}</span>
          </div>
        </>
      }
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn(v => !v)}
      onPause={() => setStatus(p => p === 'paused' ? 'playing' : p === 'playing' ? 'paused' : p)}
      onRestart={reset}
      controls={[
        { key: '← →',   label: 'Rotate' },
        { key: 'Space', label: 'Fire' },
        { key: 'Shift', label: 'Superzap' },
      ]}
    >
      <div className="w-full flex items-center justify-center p-2">
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-[70vh]"
          style={{ touchAction: 'none' }}
        />
      </div>
      <div className="sm:hidden grid grid-cols-4 gap-2 p-3 border-t border-white/10 bg-white/5">
        <button type="button" onTouchStart={() => touchHold('ArrowLeft', true)}  onTouchEnd={() => touchHold('ArrowLeft', false)}  className="h-12 rounded-lg bg-white/10 border border-white/20 text-white text-lg active:bg-white/20">←</button>
        <button type="button" onTouchStart={() => touchHold('ArrowRight', true)} onTouchEnd={() => touchHold('ArrowRight', false)} className="h-12 rounded-lg bg-white/10 border border-white/20 text-white text-lg active:bg-white/20">→</button>
        <button type="button" onTouchStart={fire}       className="h-12 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-200 text-sm font-semibold active:bg-amber-500/30">FIRE</button>
        <button type="button" onTouchStart={superzap}   className="h-12 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 text-sm font-semibold active:bg-cyan-500/30">ZAP</button>
      </div>
    </GameShell>
  )
}
