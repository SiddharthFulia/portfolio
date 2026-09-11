// Defender — Williams 1980. Horizontal side-scroller on a wraparound
// planetary surface. Player flies a ship that can turn to face left or
// right, thrust forward, and fire. A radar mini-map at the top shows
// the whole world (~3600 units wide) — enemies + humans + ship.
//
// Enemies:
//   • Lander     — descends toward a human, grabs it, then climbs.
//                  If it reaches the top with a human → mutant (fast,
//                  aggressive).
//   • Mutant     — swarms the player, no grab behaviour.
//   • Human      — walks the surface. Falls if the carrying lander is
//                  shot (>3 tiles fall = dead).
//
// Player actions:
//   • Smart bomb — one-shot kills all enemies on screen.
//   • Hyperspace — teleport to a random location (chance to explode).
//
// The world wraps: positions are stored mod WORLD_W and rendered relative
// to the camera which tracks the player.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GameShell from '../../components/arcade/GameShell'
import { getSfx } from '../../components/arcade/sfx'

const CANVAS_W = 720
const CANVAS_H = 480
const WORLD_W = 3600
const GROUND_Y = 400
const RADAR_H = 44

const wrap = (x) => ((x % WORLD_W) + WORLD_W) % WORLD_W
const wrapDelta = (a, b) => {
  let d = a - b
  if (d > WORLD_W / 2) d -= WORLD_W
  if (d < -WORLD_W / 2) d += WORLD_W
  return d
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

const buildTerrain = () => {
  const pts = []
  let y = GROUND_Y - 20
  for (let x = 0; x < WORLD_W; x += 16) {
    y += (Math.random() - 0.5) * 20
    y = clamp(y, GROUND_Y - 60, GROUND_Y - 4)
    pts.push({ x, y })
  }
  return pts
}

export default function Defender() {
  const canvasRef = useRef(null)
  const rafRef = useRef(0)

  const [status, setStatus] = useState('ready')
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(() => Number(localStorage.getItem('arcade.defender.best') || 0))
  const [level, setLevel] = useState(1)
  const [lives, setLives] = useState(3)
  const [bombs, setBombs] = useState(3)
  const [soundOn, setSoundOn] = useState(true)

  const state = useRef(null)
  const keys = useRef({})
  const sfx = useMemo(() => getSfx(), [])

  const seedWave = useCallback((lvl) => {
    const s = state.current
    if (!s) return
    s.humans.length = 0
    s.landers.length = 0
    s.mutants.length = 0
    for (let i = 0; i < 10; i++)
      s.humans.push({ x: Math.random() * WORLD_W, y: GROUND_Y - 10, dir: Math.random() < 0.5 ? -1 : 1, alive: true, grabbedBy: null, falling: false, fallStart: 0, waveArms: false })
    for (let i = 0; i < 5 + lvl * 2; i++)
      s.landers.push({ x: Math.random() * WORLD_W, y: 60 + Math.random() * 120, vx: 0, vy: 0.4, state: 'seek', target: null })
  }, [])

  const reset = useCallback(() => {
    state.current = {
      player: { x: WORLD_W / 2, y: 200, vx: 0, vy: 0, dir: 1, alive: true, deathT: 0 },
      camX: WORLD_W / 2 - CANVAS_W / 2,
      humans: [],
      landers: [],
      mutants: [],
      bullets: [],
      enemyBullets: [],
      terrain: buildTerrain(),
      bombs: 3,
      hyperspace: 3,
      score: 0,
      lives: 3,
      level: 1,
      cooldown: 0,
      startT: 60,
      shake: 0,
      chromatic: 0,
      popups: [],
    }
    seedWave(1)
    setScore(0); setLives(3); setLevel(1); setBombs(3); setStatus('ready')
  }, [seedWave])

  useEffect(() => { reset() }, [reset])

  const fire = useCallback(() => {
    const s = state.current; if (!s) return
    if (s.cooldown > 0 || !s.player.alive) return
    s.bullets.push({ x: s.player.x, y: s.player.y, vx: 10 * s.player.dir, ttl: 60 })
    s.cooldown = 5
    if (soundOn) sfx.laser()
    if (status === 'ready') setStatus('playing')
  }, [soundOn, sfx, status])

  const smartBomb = useCallback(() => {
    const s = state.current; if (!s) return
    if (s.bombs <= 0 || !s.player.alive) return
    s.bombs--
    setBombs(s.bombs)
    for (const l of s.landers) {
      const dx = wrapDelta(l.x, s.player.x)
      if (Math.abs(dx) < CANVAS_W / 2 + 100) {
        l.dead = true
        s.score += 150
        if (l.target) l.target.grabbedBy = null
      }
    }
    for (const m of s.mutants) {
      const dx = wrapDelta(m.x, s.player.x)
      if (Math.abs(dx) < CANVAS_W / 2 + 100) {
        m.dead = true
        s.score += 250
      }
    }
    s.shake = 18
    s.chromatic = 25
    if (soundOn) sfx.boom()
  }, [soundOn, sfx])

  const hyperspace = useCallback(() => {
    const s = state.current; if (!s) return
    if (s.hyperspace <= 0 || !s.player.alive) return
    s.hyperspace--
    if (Math.random() < 0.15) {
      s.player.alive = false
      s.player.deathT = 0
      s.shake = 25
      s.chromatic = 30
      if (soundOn) sfx.death()
    } else {
      s.player.x = wrap(Math.random() * WORLD_W)
      s.player.y = 80 + Math.random() * 200
      if (soundOn) sfx.pop()
    }
  }, [soundOn, sfx])

  useEffect(() => {
    const down = (e) => {
      keys.current[e.key] = true
      if (e.key === ' ') fire()
      if (e.key === 'b' || e.key === 'B') smartBomb()
      if (e.key === 'h' || e.key === 'H') hyperspace()
      if (e.key === 'p' || e.key === 'P') setStatus(p => p === 'paused' ? 'playing' : p === 'playing' ? 'paused' : p)
      if (status === 'ready') setStatus('playing')
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key)) e.preventDefault()
    }
    const up = (e) => { keys.current[e.key] = false }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [status, fire, smartBomb, hyperspace])

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
      if (!s.player.alive) return
      s.player.alive = false
      s.player.deathT = 0
      s.shake = 22
      s.chromatic = 30
      if (soundOn) sfx.death()
    }

    const step = (dt, f) => {
      const s = state.current; if (!s) return
      s.startT = Math.max(0, s.startT - 1)

      if (!s.player.alive) {
        s.player.deathT += dt
        if (s.player.deathT > 1.4) {
          if (s.lives <= 1) {
            s.lives = 0
            setLives(0)
            setStatus('over')
            const prev = Number(localStorage.getItem('arcade.defender.best') || 0)
            if (s.score > prev) {
              localStorage.setItem('arcade.defender.best', String(s.score))
              setBest(s.score)
            }
            return
          }
          s.lives--
          setLives(s.lives)
          s.player.alive = true
          s.player.deathT = 0
          s.player.vy = 0; s.player.vx = 0
          s.startT = 60
        }
        return
      }

      s.cooldown = Math.max(0, s.cooldown - 1)

      const accel = 900
      if (keys.current.ArrowUp || keys.current.w || keys.current.W) s.player.vy -= accel * dt
      if (keys.current.ArrowDown || keys.current.s || keys.current.S) s.player.vy += accel * dt
      if (keys.current.ArrowLeft || keys.current.a || keys.current.A) {
        s.player.dir = -1
        s.player.vx -= accel * dt
      }
      if (keys.current.ArrowRight || keys.current.d || keys.current.D) {
        s.player.dir = 1
        s.player.vx += accel * dt
      }
      s.player.vx *= 0.94
      s.player.vy *= 0.9
      s.player.vx = clamp(s.player.vx, -400, 400)
      s.player.vy = clamp(s.player.vy, -260, 260)
      s.player.x = wrap(s.player.x + s.player.vx * dt)
      s.player.y = clamp(s.player.y + s.player.vy * dt, RADAR_H + 20, GROUND_Y - 20)

      const camTarget = s.player.x - (s.player.dir > 0 ? CANVAS_W * 0.35 : CANVAS_W * 0.55)
      s.camX = wrap(s.camX + wrapDelta(camTarget, s.camX) * 0.1)

      for (const b of s.bullets) { b.x = wrap(b.x + b.vx); b.ttl-- }
      s.bullets = s.bullets.filter(b => b.ttl > 0 && !b.dead)
      for (const b of s.enemyBullets) { b.x = wrap(b.x + b.vx); b.y += b.vy; b.ttl-- }
      s.enemyBullets = s.enemyBullets.filter(b => b.ttl > 0 && !b.dead)

      for (const h of s.humans) {
        if (!h.alive) continue
        if (h.grabbedBy) {
          h.x = h.grabbedBy.x
          h.y = h.grabbedBy.y + 18
          h.waveArms = true
        } else if (h.falling) {
          h.y += 3
          if (h.y >= GROUND_Y - 10) {
            h.y = GROUND_Y - 10
            if (h.fallStart && h.y - h.fallStart > 60) h.alive = false
            h.falling = false
            h.fallStart = 0
          }
        } else {
          h.waveArms = false
          if (Math.random() < 0.01) h.dir *= -1
          h.x = wrap(h.x + h.dir * 0.3)
        }
      }

      for (const l of s.landers) {
        if (l.dead) continue
        if (l.state === 'seek') {
          if (!l.target || !l.target.alive || l.target.grabbedBy) {
            l.target = s.humans.find(h => h.alive && !h.grabbedBy) || null
          }
          l.y += l.vy
          if (l.target) {
            const dx = wrapDelta(l.target.x, l.x)
            l.x = wrap(l.x + Math.sign(dx) * 0.4)
            if (Math.abs(dx) < 8 && Math.abs(l.y - (GROUND_Y - 30)) < 12) {
              l.state = 'lift'
              l.target.grabbedBy = l
            }
          }
        } else if (l.state === 'lift') {
          l.y -= 0.6
          if (l.y < RADAR_H + 10 && l.target) {
            s.mutants.push({ x: l.x, y: l.y, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 2 })
            l.target.alive = false
            l.dead = true
          }
        }
        if (Math.random() < 0.002 && Math.abs(wrapDelta(l.x, s.player.x)) < CANVAS_W / 2) {
          const dx = wrapDelta(s.player.x, l.x)
          const dy = s.player.y - l.y
          const d = Math.hypot(dx, dy) || 1
          s.enemyBullets.push({ x: l.x, y: l.y, vx: dx/d * 4, vy: dy/d * 4, ttl: 80 })
        }
      }
      s.landers = s.landers.filter(l => !l.dead)

      for (const m of s.mutants) {
        if (m.dead) continue
        const dx = wrapDelta(s.player.x, m.x)
        const dy = s.player.y - m.y
        const d = Math.hypot(dx, dy) || 1
        m.vx = m.vx * 0.94 + (dx / d) * 0.4
        m.vy = m.vy * 0.94 + (dy / d) * 0.3
        m.x = wrap(m.x + m.vx)
        m.y = clamp(m.y + m.vy, RADAR_H + 10, GROUND_Y - 10)
        if (Math.random() < 0.006) {
          const dd = Math.hypot(dx, dy) || 1
          s.enemyBullets.push({ x: m.x, y: m.y, vx: dx/dd * 5, vy: dy/dd * 5, ttl: 80 })
        }
      }
      s.mutants = s.mutants.filter(m => !m.dead)

      for (const b of s.bullets) {
        for (const l of s.landers) {
          if (Math.abs(wrapDelta(l.x, b.x)) < 12 && Math.abs(l.y - b.y) < 12) {
            l.dead = true
            b.dead = true
            s.score += 150
            s.popups.push({ x: l.x, y: l.y, text: '+150', ttl: 30, color: '#ffb8de', worldX: true })
            if (l.target) {
              l.target.grabbedBy = null
              l.target.falling = true
              l.target.fallStart = l.target.y
            }
            if (soundOn) sfx.hit()
            break
          }
        }
        if (b.dead) continue
        for (const m of s.mutants) {
          if (Math.abs(wrapDelta(m.x, b.x)) < 12 && Math.abs(m.y - b.y) < 12) {
            m.dead = true
            b.dead = true
            s.score += 250
            s.popups.push({ x: m.x, y: m.y, text: '+250', ttl: 30, color: '#a3ff9c', worldX: true })
            if (soundOn) sfx.hit()
            break
          }
        }
      }
      s.bullets = s.bullets.filter(b => !b.dead)
      s.landers = s.landers.filter(l => !l.dead)
      s.mutants = s.mutants.filter(m => !m.dead)

      for (const b of s.enemyBullets) {
        if (Math.abs(wrapDelta(b.x, s.player.x)) < 12 && Math.abs(b.y - s.player.y) < 12) {
          killPlayer()
          b.dead = true
          break
        }
      }
      for (const l of s.landers) {
        if (Math.abs(wrapDelta(l.x, s.player.x)) < 14 && Math.abs(l.y - s.player.y) < 14) {
          killPlayer(); l.dead = true; break
        }
      }
      for (const m of s.mutants) {
        if (Math.abs(wrapDelta(m.x, s.player.x)) < 14 && Math.abs(m.y - s.player.y) < 14) {
          killPlayer(); m.dead = true; break
        }
      }

      for (const h of s.humans) {
        if (!h.alive || h.grabbedBy) continue
        if (Math.abs(wrapDelta(h.x, s.player.x)) < 14 && Math.abs(h.y - s.player.y) < 14) {
          s.score += 500
          s.popups.push({ x: h.x, y: h.y, text: 'RESCUED +500', ttl: 60, color: '#ffe066', worldX: true })
          h.alive = false
          if (soundOn) sfx.win()
        }
      }

      for (const p of s.popups) p.ttl--
      s.popups = s.popups.filter(p => p.ttl > 0)
      if (s.shake > 0) s.shake *= 0.9
      if (s.chromatic > 0) s.chromatic *= 0.92

      setScore(s.score)

      if (s.landers.length === 0 && s.mutants.length === 0) {
        s.level++
        setLevel(s.level)
        s.bombs = Math.min(s.bombs + 1, 5)
        setBombs(s.bombs)
        seedWave(s.level)
      }

      if (s.humans.filter(h => h.alive).length === 0 && s.mutants.length === 0) {
        for (let i = 0; i < 6; i++)
          s.mutants.push({ x: Math.random() * WORLD_W, y: 60 + Math.random() * 100, vx: 0, vy: 0 })
      }
    }

    const worldToScreen = (x, camX) => {
      let dx = x - camX
      if (dx > WORLD_W / 2) dx -= WORLD_W
      if (dx < -WORLD_W / 2) dx += WORLD_W
      return dx
    }

    const drawShip = (x, y, dir) => {
      ctx.fillStyle = '#37e0ff'
      ctx.fillRect(x - 10 * dir, y - 4, 20, 8)
      ctx.fillStyle = '#fff'
      ctx.fillRect(x + 4 * dir, y - 2, 6, 4)
      ctx.fillStyle = '#ff425c'
      ctx.fillRect(x - 12 * dir, y - 6, 4, 4)
      ctx.fillRect(x - 12 * dir, y + 2, 4, 4)
      ctx.fillStyle = '#ffcf5a'
      ctx.fillRect(x - 14 * dir, y - 1, 3, 2)
    }

    const draw = (f) => {
      const s = state.current; if (!s) return
      ctx.save()
      const reducedEl = document.querySelector('[data-reduced-motion="true"]')
      if (!reducedEl && s.shake > 0.1) {
        ctx.translate((Math.random() - 0.5) * s.shake * 0.4, (Math.random() - 0.5) * s.shake * 0.4)
      }
      ctx.fillStyle = '#010514'
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

      // Star parallax
      ctx.fillStyle = '#8b9dff'
      for (let i = 0; i < 60; i++) {
        const seed = i * 173
        const sx = ((seed - s.camX * 0.4) % CANVAS_W + CANVAS_W) % CANVAS_W
        const sy = ((i * 41) % (CANVAS_H - RADAR_H - 20)) + RADAR_H + 10
        ctx.fillRect(sx, sy, 1, 1)
      }

      // Radar strip
      const radarPad = 24
      ctx.fillStyle = '#0a0f2f'
      ctx.fillRect(radarPad, 6, CANVAS_W - radarPad*2, RADAR_H - 12)
      ctx.strokeStyle = '#3652ff'
      ctx.lineWidth = 1
      ctx.strokeRect(radarPad + 0.5, 6.5, CANVAS_W - radarPad*2 - 1, RADAR_H - 13)
      const radarW = CANVAS_W - radarPad * 2
      const radarH = RADAR_H - 12
      const toRadar = (wx, wy) => ({
        x: radarPad + ((wx / WORLD_W) * radarW),
        y: 6 + (wy / CANVAS_H) * radarH,
      })
      // Camera window rectangle
      {
        const l = toRadar(wrap(s.camX), 0).x
        const w = (CANVAS_W / WORLD_W) * radarW
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'
        ctx.strokeRect(l, 8, w, radarH - 4)
      }
      for (const h of s.humans) if (h.alive) {
        const r = toRadar(h.x, h.y)
        ctx.fillStyle = '#ffe066'
        ctx.fillRect(r.x, r.y, 2, 2)
      }
      for (const l of s.landers) if (!l.dead) {
        const r = toRadar(l.x, l.y)
        ctx.fillStyle = '#ff425c'
        ctx.fillRect(r.x, r.y, 2, 2)
      }
      for (const m of s.mutants) if (!m.dead) {
        const r = toRadar(m.x, m.y)
        ctx.fillStyle = '#c93cff'
        ctx.fillRect(r.x, r.y, 2, 2)
      }
      { const r = toRadar(s.player.x, s.player.y); ctx.fillStyle = '#37e0ff'; ctx.fillRect(r.x - 1, r.y - 1, 4, 4) }

      // Terrain
      ctx.strokeStyle = '#a3ff9c'
      ctx.lineWidth = 2
      ctx.beginPath()
      const camIdx = Math.floor(s.camX / 16)
      let started = false
      for (let i = -2; i < CANVAS_W / 16 + 4; i++) {
        const idx = ((camIdx + i) % s.terrain.length + s.terrain.length) % s.terrain.length
        const p = s.terrain[idx]
        const sx = i * 16 - (s.camX % 16)
        const sy = p.y
        if (!started) { ctx.moveTo(sx, sy); started = true }
        else ctx.lineTo(sx, sy)
      }
      ctx.stroke()

      // Humans
      for (const h of s.humans) {
        if (!h.alive) continue
        const sx = worldToScreen(h.x, s.camX)
        if (sx < -20 || sx > CANVAS_W + 20) continue
        ctx.fillStyle = '#ffe066'
        ctx.fillRect(sx - 2, h.y - 6, 4, 4)
        ctx.fillRect(sx - 3, h.y - 2, 6, 4)
        const armY = h.waveArms && (Math.floor(f / 6) % 2 === 0) ? -4 : 0
        ctx.fillRect(sx - 5, h.y - 2 + armY, 2, 2)
        ctx.fillRect(sx + 3, h.y - 2 + armY, 2, 2)
        ctx.fillRect(sx - 2, h.y + 2, 2, 3)
        ctx.fillRect(sx + 0, h.y + 2, 2, 3)
      }

      for (const l of s.landers) {
        const sx = worldToScreen(l.x, s.camX)
        if (sx < -30 || sx > CANVAS_W + 30) continue
        ctx.fillStyle = '#ff425c'
        ctx.fillRect(sx - 6, l.y - 4, 12, 8)
        ctx.fillStyle = '#ffe066'
        ctx.fillRect(sx - 8, l.y + 4, 3, 3)
        ctx.fillRect(sx + 5, l.y + 4, 3, 3)
        if (l.state === 'lift') {
          ctx.strokeStyle = '#ff425c'
          ctx.beginPath(); ctx.moveTo(sx, l.y + 4); ctx.lineTo(sx, l.y + 20); ctx.stroke()
        }
      }
      for (const m of s.mutants) {
        const sx = worldToScreen(m.x, s.camX)
        if (sx < -30 || sx > CANVAS_W + 30) continue
        const flick = Math.floor(f / 4) % 2
        ctx.fillStyle = flick ? '#c93cff' : '#ff6ad5'
        ctx.fillRect(sx - 6, m.y - 6, 12, 12)
        ctx.fillStyle = '#fff'
        ctx.fillRect(sx - 3, m.y - 3, 2, 2)
        ctx.fillRect(sx + 1, m.y - 3, 2, 2)
      }

      ctx.fillStyle = '#fff2a8'
      for (const b of s.bullets) {
        const sx = worldToScreen(b.x, s.camX)
        if (sx < -6 || sx > CANVAS_W + 6) continue
        ctx.fillRect(sx - (b.vx > 0 ? 0 : 6), b.y - 1, 6, 2)
      }
      ctx.fillStyle = '#ff6ad5'
      for (const b of s.enemyBullets) {
        const sx = worldToScreen(b.x, s.camX)
        if (sx < -6 || sx > CANVAS_W + 6) continue
        ctx.fillRect(sx - 1, b.y - 1, 2, 2)
      }

      const psx = worldToScreen(s.player.x, s.camX)
      if (s.player.alive) {
        drawShip(psx, s.player.y, s.player.dir)
      } else {
        const t = s.player.deathT
        ctx.strokeStyle = '#ff425c'
        ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(psx, s.player.y, 4 + t * 60, 0, Math.PI*2); ctx.stroke()
      }

      ctx.font = 'bold 11px monospace'
      ctx.textAlign = 'center'
      for (const p of s.popups) {
        const sx = p.worldX ? worldToScreen(p.x, s.camX) : p.x
        if (sx < -40 || sx > CANVAS_W + 40) continue
        ctx.fillStyle = p.color
        ctx.globalAlpha = Math.min(1, p.ttl / 60)
        ctx.fillText(p.text, sx, p.y - (60 - p.ttl) * 0.4)
      }
      ctx.globalAlpha = 1

      ctx.font = 'bold 12px monospace'
      ctx.fillStyle = '#37e0ff'
      ctx.textAlign = 'left'
      ctx.fillText(`BOMB × ${s.bombs}   WARP × ${s.hyperspace}`, 16, RADAR_H + 16)

      if (s.startT > 0) {
        ctx.font = 'bold 20px monospace'
        ctx.fillStyle = '#ffe066'
        ctx.textAlign = 'center'
        ctx.fillText(`WAVE ${s.level}`, CANVAS_W/2, CANVAS_H/2)
      }

      ctx.restore()

      if (!reducedEl && s.chromatic > 2) {
        ctx.save()
        ctx.globalCompositeOperation = 'screen'
        ctx.globalAlpha = 0.35
        ctx.drawImage(canvas, s.chromatic * 0.3, 0)
        ctx.restore()
      }

      ctx.save()
      ctx.globalAlpha = 0.08
      ctx.fillStyle = '#000'
      for (let y = 0; y < CANVAS_H; y += 2) ctx.fillRect(0, y, CANVAS_W, 1)
      ctx.restore()
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [status, soundOn, sfx, seedWave])

  useEffect(() => { sfx.setEnabled(soundOn) }, [soundOn, sfx])

  const touchHold = (k, v) => { keys.current[k] = v }

  return (
    <GameShell
      title="Defender"
      category="Retro"
      score={score}
      best={best}
      level={level}
      status={status}
      extraStats={
        <>
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Lives</span>
            <span className="text-xl sm:text-2xl font-bold tabular-nums text-cyan-300">{lives}</span>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Bomb</span>
            <span className="text-xl sm:text-2xl font-bold tabular-nums text-rose-300">{bombs}</span>
          </div>
        </>
      }
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn(v => !v)}
      onPause={() => setStatus(p => p === 'paused' ? 'playing' : p === 'playing' ? 'paused' : p)}
      onRestart={reset}
      controls={[
        { key: 'Arrows', label: 'Fly' },
        { key: 'Space',  label: 'Fire' },
        { key: 'B',      label: 'Smart Bomb' },
        { key: 'H',      label: 'Hyperspace' },
      ]}
    >
      <div className="w-full flex items-center justify-center p-2">
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-[70vh]"
          style={{ imageRendering: 'pixelated', touchAction: 'none' }}
        />
      </div>
      <div className="sm:hidden grid grid-cols-4 gap-2 p-3 border-t border-white/10 bg-white/5">
        <button type="button" onTouchStart={() => touchHold('ArrowLeft', true)}  onTouchEnd={() => touchHold('ArrowLeft', false)}  className="h-12 rounded-lg bg-white/10 border border-white/20 text-white text-lg active:bg-white/20">←</button>
        <button type="button" onTouchStart={() => touchHold('ArrowUp', true)}    onTouchEnd={() => touchHold('ArrowUp', false)}    className="h-12 rounded-lg bg-white/10 border border-white/20 text-white text-lg active:bg-white/20">↑</button>
        <button type="button" onTouchStart={() => touchHold('ArrowDown', true)}  onTouchEnd={() => touchHold('ArrowDown', false)}  className="h-12 rounded-lg bg-white/10 border border-white/20 text-white text-lg active:bg-white/20">↓</button>
        <button type="button" onTouchStart={() => touchHold('ArrowRight', true)} onTouchEnd={() => touchHold('ArrowRight', false)} className="h-12 rounded-lg bg-white/10 border border-white/20 text-white text-lg active:bg-white/20">→</button>
        <button type="button" onTouchStart={fire}      className="h-12 col-span-2 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-200 text-sm font-semibold active:bg-amber-500/30">FIRE</button>
        <button type="button" onTouchStart={smartBomb} className="h-12 rounded-lg bg-rose-500/20 border border-rose-400/40 text-rose-200 text-sm font-semibold active:bg-rose-500/30">BOMB</button>
        <button type="button" onTouchStart={hyperspace} className="h-12 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 text-sm font-semibold active:bg-cyan-500/30">WARP</button>
      </div>
    </GameShell>
  )
}
