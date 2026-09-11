// Asteroids — vector-graphics wireframe rocks in 3 sizes, wraparound
// universe, thrust + inertia flight, hyperspace jump, enemy saucer.
//
// Controls:
//   • ← → / A D    — rotate
//   • ↑ / W        — thrust
//   • Z / Enter    — fire
//   • X / Shift    — hyperspace (2s cooldown, ~10% chance of self-destruct)
//   • Space        — pause (shell)
//
// Every rock is an irregular polygon with a layered inner stroke for
// weathered shading, not just a circle. Ship, saucer and shots are pure
// vector primitives to keep the classic vector-arcade feel.

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import GameShell from '../../components/arcade/GameShell'
import { getSfx } from '../../components/arcade/sfx'

const RULES = [
  { heading: 'Goal', body: 'Destroy every asteroid on screen without letting one collide with your ship. Clearing all rocks spawns the next wave with one more rock than the last.' },
  { heading: 'Controls', body: '← / → or A / D rotate. ↑ or W applies thrust — your ship keeps its inertia so plan your stops. Z or Enter fires (small cooldown). X or Shift triggers hyperspace: you jump to a random point with a ~10% chance of self-destructing on arrival. The universe wraps at every edge.' },
  { heading: 'Rock sizes & scoring', body: 'Large rocks split into two mediums, mediums split into two smalls, smalls vanish.\n• Large = 20 pts\n• Medium = 50 pts\n• Small = 100 pts\n• Saucer = 200 pts (small) / 1000 pts (large)' },
  { heading: 'Saucer', body: 'A vector saucer appears every ~1200 ticks and takes potshots at you. Large saucers aim loosely, small saucers aim right at you. Kill or evade before it clears the screen.' },
  { heading: 'Lives & invulnerability', body: 'You start with 3 lives. Respawning gives ~2 seconds of blinking invulnerability. Zero lives ends the game.' },
  { heading: 'Difficulty', body: 'Easy starts with 3 slow rocks, weaker thrust and rarer saucers. Hard opens with 6 fast rocks, faster saucers and twice-normal thrust. Custom exposes initial rock count, rock speed, saucer frequency and thrust power.' },
]

const DIFFICULTIES = {
  Easy:   { startRocks: 3, rockSpeed: 0.8, saucerInterval: 1800, thrustPower: 0.12 },
  Medium: { startRocks: 4, rockSpeed: 1.0, saucerInterval: 1200, thrustPower: 0.18 },
  Hard:   { startRocks: 6, rockSpeed: 1.5, saucerInterval: 700,  thrustPower: 0.24 },
}

const CUSTOM_SCHEMA = {
  startRocks:     { label: 'Starting rocks',   min: 2,    max: 10,   step: 1,    default: 4 },
  rockSpeed:      { label: 'Rock speed',       min: 0.4,  max: 2.5,  step: 0.1,  default: 1.0 },
  saucerInterval: { label: 'Saucer interval',  min: 400,  max: 3000, step: 100,  default: 1200 },
  thrustPower:    { label: 'Thrust power',     min: 0.06, max: 0.35, step: 0.02, default: 0.18 },
}

const W = 800
const H = 600

const makeRockShape = (radius) => {
  const n = 10 + Math.floor(Math.random() * 4)
  const pts = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const r = radius * (0.72 + Math.random() * 0.42)
    pts.push([Math.cos(a) * r, Math.sin(a) * r])
  }
  return pts
}
const SIZE_R = { 3: 42, 2: 26, 1: 14 }
const SIZE_PTS = { 3: 20, 2: 50, 1: 100 }
const wrap = (v, max) => v < 0 ? v + max : v > max ? v - max : v

export default function Asteroids() {
  const canvasRef = useRef(null)
  const sfx = useRef(getSfx()).current

  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [level, setLevel] = useState(1)
  const [status, setStatus] = useState('playing')
  const [soundOn, setSoundOn] = useState(true)
  const [difficulty, setDifficulty] = useState('Medium')
  const [customValues, setCustomValues] = useState(() => Object.fromEntries(
    Object.entries(CUSTOM_SCHEMA).map(([k, v]) => [k, v.default])
  ))
  const cfg = useMemo(
    () => difficulty === 'Custom' ? customValues : DIFFICULTIES[difficulty] || DIFFICULTIES.Medium,
    [difficulty, customValues],
  )
  const cfgRef = useRef(cfg)
  useEffect(() => { cfgRef.current = cfg }, [cfg])

  const stateRef = useRef({
    ship: { x: W / 2, y: H / 2, vx: 0, vy: 0, angle: -Math.PI / 2, thrust: false, invuln: 60, dead: false, deadT: 0, hyperCd: 0 },
    rocks: [],
    bullets: [],
    saucer: null,
    saucerTimer: 1200,
    saucerBullets: [],
    particles: [],
    popups: [],
    shake: 0,
    keys: { left: false, right: false, thrust: false, fire: false, hyper: false },
    fireCd: 0,
    hyperKeyLatch: false,
    reduced: false,
  })

  useEffect(() => { sfx.setEnabled(soundOn) }, [soundOn, sfx])

  const spawnWave = useCallback((n) => {
    const rocks = []
    const rockSpeedMul = cfgRef.current.rockSpeed || 1
    const count = Math.max(2, Math.round(n))
    for (let i = 0; i < count; i++) {
      let x, y
      do { x = Math.random() * W; y = Math.random() * H }
      while (Math.hypot(x - W / 2, y - H / 2) < 140)
      const a = Math.random() * Math.PI * 2
      const spd = (0.6 + Math.random() * 1.1) * rockSpeedMul
      rocks.push({
        x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
        size: 3, shape: makeRockShape(SIZE_R[3]),
        rot: Math.random() * Math.PI * 2, rotV: (Math.random() - 0.5) * 0.02,
      })
    }
    stateRef.current.rocks = rocks
  }, [])

  const reset = useCallback(() => {
    setScore(0); setLives(3); setLevel(1); setStatus('playing')
    stateRef.current.ship = { x: W / 2, y: H / 2, vx: 0, vy: 0, angle: -Math.PI / 2, thrust: false, invuln: 60, dead: false, deadT: 0, hyperCd: 0 }
    stateRef.current.bullets = []
    stateRef.current.saucer = null
    stateRef.current.saucerTimer = cfgRef.current.saucerInterval || 1200
    stateRef.current.saucerBullets = []
    spawnWave(cfgRef.current.startRocks || 4)
  }, [spawnWave])

  useEffect(() => { spawnWave(cfgRef.current.startRocks || 4) }, [spawnWave])

  useEffect(() => {
    const s = stateRef.current
    const kd = (e) => {
      if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') s.keys.left = true
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') s.keys.right = true
      if (e.key === 'ArrowUp'    || e.key === 'w' || e.key === 'W') s.keys.thrust = true
      if (e.code === 'KeyZ' || e.code === 'Enter') { s.keys.fire = true; e.preventDefault() }
      if (e.code === 'KeyX' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') s.keys.hyper = true
    }
    const ku = (e) => {
      if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') s.keys.left = false
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') s.keys.right = false
      if (e.key === 'ArrowUp'    || e.key === 'w' || e.key === 'W') s.keys.thrust = false
      if (e.code === 'KeyZ' || e.code === 'Enter') s.keys.fire = false
      if (e.code === 'KeyX' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') { s.keys.hyper = false; s.hyperKeyLatch = false }
    }
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku) }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let raf = 0
    let last = performance.now()
    stateRef.current.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const spawnParticles = (x, y, color, n = 20, spd = 3) => {
      const s = stateRef.current
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        const v = 0.4 + Math.random() * spd
        s.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, decay: 0.018 + Math.random() * 0.03, size: 1 + Math.random() * 1.6, color })
      }
    }
    const shake = (v) => {
      if (stateRef.current.reduced) return
      stateRef.current.shake = Math.min(20, stateRef.current.shake + v)
    }
    const popup = (x, y, text, color) => stateRef.current.popups.push({ x, y, t: 1, text, color: color || '#fef3c7' })

    const splitRock = (r) => {
      const s = stateRef.current
      spawnParticles(r.x, r.y, '#e5e7eb', 22, 3)
      setScore((v) => v + SIZE_PTS[r.size])
      popup(r.x, r.y - 8, `+${SIZE_PTS[r.size]}`, '#fde68a')
      sfx.boom()
      if (r.size > 1) {
        for (let i = 0; i < 2; i++) {
          const a = Math.random() * Math.PI * 2
          const spd = 1 + Math.random() * 1.4
          s.rocks.push({
            x: r.x, y: r.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
            size: r.size - 1, shape: makeRockShape(SIZE_R[r.size - 1]),
            rot: Math.random() * Math.PI * 2, rotV: (Math.random() - 0.5) * 0.04,
          })
        }
      }
    }

    const shipHit = () => {
      const s = stateRef.current
      if (s.ship.dead || s.ship.invuln > 0) return
      s.ship.dead = true
      s.ship.deadT = 90
      spawnParticles(s.ship.x, s.ship.y, '#f43f5e', 40, 4)
      shake(10)
      sfx.death()
      setLives((v) => {
        const nl = v - 1
        if (nl <= 0) setStatus('over')
        return nl
      })
    }

    const tick = (now) => {
      let dt = (now - last) / 16.666; last = now
      if (dt > 3) dt = 3
      const s = stateRef.current

      if (status === 'playing') {
        if (s.ship.dead) {
          s.ship.deadT -= dt
          if (s.ship.deadT <= 0) {
            s.ship = { x: W / 2, y: H / 2, vx: 0, vy: 0, angle: -Math.PI / 2, thrust: false, invuln: 120, dead: false, deadT: 0, hyperCd: 0 }
          }
        } else {
          if (s.keys.left)  s.ship.angle -= 0.08 * dt
          if (s.keys.right) s.ship.angle += 0.08 * dt
          s.ship.thrust = s.keys.thrust
          if (s.ship.thrust) {
            const tp = cfgRef.current.thrustPower || 0.14
            s.ship.vx += Math.cos(s.ship.angle) * tp * dt
            s.ship.vy += Math.sin(s.ship.angle) * tp * dt
            const speed = Math.hypot(s.ship.vx, s.ship.vy)
            if (speed > 6) { s.ship.vx *= 6 / speed; s.ship.vy *= 6 / speed }
            sfx.thrust()
            spawnParticles(s.ship.x - Math.cos(s.ship.angle) * 10, s.ship.y - Math.sin(s.ship.angle) * 10, '#fbbf24', 2, 1)
          }
          s.ship.vx *= Math.pow(0.995, dt)
          s.ship.vy *= Math.pow(0.995, dt)
          s.ship.x = wrap(s.ship.x + s.ship.vx * dt, W)
          s.ship.y = wrap(s.ship.y + s.ship.vy * dt, H)

          if (s.ship.hyperCd > 0) s.ship.hyperCd -= dt
          if (s.keys.hyper && !s.hyperKeyLatch && s.ship.hyperCd <= 0) {
            s.hyperKeyLatch = true
            if (Math.random() < 0.10) {
              shipHit()
            } else {
              s.ship.x = Math.random() * W
              s.ship.y = Math.random() * H
              s.ship.vx = 0; s.ship.vy = 0
              s.ship.invuln = 40
              sfx.chirp()
            }
            s.ship.hyperCd = 120
          }
          if (s.ship.invuln > 0) s.ship.invuln -= dt

          s.fireCd -= dt
          if (s.keys.fire && s.fireCd <= 0 && s.bullets.length < 4) {
            s.bullets.push({
              x: s.ship.x + Math.cos(s.ship.angle) * 14,
              y: s.ship.y + Math.sin(s.ship.angle) * 14,
              vx: Math.cos(s.ship.angle) * 8 + s.ship.vx,
              vy: Math.sin(s.ship.angle) * 8 + s.ship.vy,
              life: 55,
            })
            s.fireCd = 10
            sfx.laser()
          }
        }

        for (const r of s.rocks) {
          r.x = wrap(r.x + r.vx * dt, W)
          r.y = wrap(r.y + r.vy * dt, H)
          r.rot += r.rotV * dt
        }
        if (!s.ship.dead && s.ship.invuln <= 0) {
          for (const r of s.rocks) {
            if (Math.hypot(r.x - s.ship.x, r.y - s.ship.y) < SIZE_R[r.size] - 6) { shipHit(); break }
          }
        }
        for (const b of s.bullets) {
          b.x = wrap(b.x + b.vx * dt, W)
          b.y = wrap(b.y + b.vy * dt, H)
          b.life -= dt
        }
        for (let i = s.bullets.length - 1; i >= 0; i--) {
          const b = s.bullets[i]
          if (b.life <= 0) { s.bullets.splice(i, 1); continue }
          for (let j = s.rocks.length - 1; j >= 0; j--) {
            const r = s.rocks[j]
            if (Math.hypot(b.x - r.x, b.y - r.y) < SIZE_R[r.size]) {
              s.rocks.splice(j, 1)
              s.bullets.splice(i, 1)
              splitRock(r)
              break
            }
          }
        }
        if (s.saucer) {
          for (let i = s.bullets.length - 1; i >= 0; i--) {
            const b = s.bullets[i]
            if (Math.hypot(b.x - s.saucer.x, b.y - s.saucer.y) < 18) {
              s.bullets.splice(i, 1)
              setScore((v) => v + (s.saucer.small ? 1000 : 200))
              popup(s.saucer.x, s.saucer.y, s.saucer.small ? '+1000' : '+200', '#f0abfc')
              spawnParticles(s.saucer.x, s.saucer.y, '#f0abfc', 40, 4)
              shake(6); sfx.win()
              s.saucer = null; s.saucerTimer = cfgRef.current.saucerInterval || 1200
              break
            }
          }
        }

        s.saucerTimer -= dt
        if (s.saucerTimer <= 0 && !s.saucer) {
          const fromLeft = Math.random() < 0.5
          const small = score > 6000 || level >= 3
          s.saucer = { x: fromLeft ? -20 : W + 20, y: 60 + Math.random() * (H - 120), vx: fromLeft ? 1.4 : -1.4, small, shootCd: 90, zigT: 0 }
          sfx.chirp()
        }
        if (s.saucer) {
          s.saucer.zigT += dt
          s.saucer.x += s.saucer.vx * dt
          s.saucer.y += Math.sin(s.saucer.zigT * 0.05) * 0.6 * dt
          s.saucer.shootCd -= dt
          if (s.saucer.shootCd <= 0) {
            const dx = s.ship.x - s.saucer.x
            const dy = s.ship.y - s.saucer.y
            let a = Math.atan2(dy, dx)
            if (!s.saucer.small) a += (Math.random() - 0.5) * 0.5
            s.saucerBullets.push({ x: s.saucer.x, y: s.saucer.y, vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, life: 90 })
            s.saucer.shootCd = 60 + Math.random() * 60
            sfx.laser()
          }
          if (s.saucer.x < -40 || s.saucer.x > W + 40) {
            s.saucer = null; s.saucerTimer = (cfgRef.current.saucerInterval || 1200) * 0.75 + Math.random() * (cfgRef.current.saucerInterval || 1200) * 0.5
          }
        }
        for (const sb of s.saucerBullets) {
          sb.x = wrap(sb.x + sb.vx * dt, W)
          sb.y = wrap(sb.y + sb.vy * dt, H)
          sb.life -= dt
        }
        s.saucerBullets = s.saucerBullets.filter((sb) => sb.life > 0)
        if (!s.ship.dead && s.ship.invuln <= 0) {
          for (let i = s.saucerBullets.length - 1; i >= 0; i--) {
            const sb = s.saucerBullets[i]
            if (Math.hypot(sb.x - s.ship.x, sb.y - s.ship.y) < 10) {
              s.saucerBullets.splice(i, 1)
              shipHit()
              break
            }
          }
        }

        if (s.rocks.length === 0) {
          setLevel((l) => {
            const nl = l + 1
            spawnWave(3 + nl)
            popup(W / 2, H / 2, `WAVE ${nl}`, '#a3e635')
            sfx.win()
            return nl
          })
        }

        s.particles.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.99; p.vy *= 0.99; p.life -= p.decay * dt })
        s.particles = s.particles.filter((p) => p.life > 0)
        s.popups.forEach((p) => { p.y -= 0.5 * dt; p.t -= 0.014 * dt })
        s.popups = s.popups.filter((p) => p.t > 0)
        s.shake *= Math.pow(0.86, dt)
      }

      // ─── render ───
      ctx.clearRect(0, 0, W, H)
      const bg = ctx.createLinearGradient(0, 0, 0, H)
      bg.addColorStop(0, '#04040a'); bg.addColorStop(1, '#000')
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = '#fff'
      for (let i = 0; i < 90; i++) {
        const x = (i * 137) % W, y = (i * 91) % H
        ctx.globalAlpha = 0.2 + ((i * 7) % 6) / 12
        ctx.fillRect(x, y, 1, 1)
      }
      ctx.globalAlpha = 1

      const shakeX = s.shake ? (Math.random() - 0.5) * s.shake : 0
      const shakeY = s.shake ? (Math.random() - 0.5) * s.shake : 0
      ctx.save()
      ctx.translate(shakeX, shakeY)

      ctx.lineWidth = 2
      for (const r of s.rocks) {
        for (const [ox, oy] of [[0, 0], [-W, 0], [W, 0], [0, -H], [0, H]]) {
          const cx = r.x + ox, cy = r.y + oy
          if (cx < -60 || cx > W + 60 || cy < -60 || cy > H + 60) continue
          ctx.save()
          ctx.translate(cx, cy)
          ctx.rotate(r.rot)
          ctx.strokeStyle = '#e5e7eb'
          ctx.beginPath()
          for (let i = 0; i < r.shape.length; i++) {
            const [px, py] = r.shape[i]
            if (i === 0) ctx.moveTo(px, py)
            else ctx.lineTo(px, py)
          }
          ctx.closePath()
          ctx.stroke()
          ctx.strokeStyle = 'rgba(255,255,255,0.15)'
          ctx.lineWidth = 1
          ctx.beginPath()
          for (let i = 0; i < r.shape.length; i++) {
            const [px, py] = r.shape[i]
            if (i === 0) ctx.moveTo(px * 0.7, py * 0.7)
            else ctx.lineTo(px * 0.7, py * 0.7)
          }
          ctx.closePath()
          ctx.stroke()
          ctx.lineWidth = 2
          ctx.restore()
        }
      }

      ctx.fillStyle = '#fef3c7'
      for (const b of s.bullets) {
        ctx.beginPath(); ctx.arc(b.x, b.y, 2, 0, Math.PI * 2); ctx.fill()
      }
      ctx.fillStyle = '#f0abfc'
      for (const sb of s.saucerBullets) {
        ctx.beginPath(); ctx.arc(sb.x, sb.y, 2.4, 0, Math.PI * 2); ctx.fill()
      }

      if (!s.ship.dead) {
        const blink = s.ship.invuln > 0 && Math.floor(s.ship.invuln / 5) % 2 === 0
        if (!blink) {
          ctx.save()
          ctx.translate(s.ship.x, s.ship.y)
          ctx.rotate(s.ship.angle + Math.PI / 2)
          ctx.strokeStyle = '#22d3ee'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(0, -14)
          ctx.lineTo(10, 12)
          ctx.lineTo(4, 8)
          ctx.lineTo(-4, 8)
          ctx.lineTo(-10, 12)
          ctx.closePath()
          ctx.stroke()
          if (s.ship.thrust && Math.floor(now / 60) % 2 === 0) {
            ctx.strokeStyle = '#fbbf24'
            ctx.beginPath()
            ctx.moveTo(-4, 10)
            ctx.lineTo(0, 20)
            ctx.lineTo(4, 10)
            ctx.stroke()
          }
          ctx.restore()
        }
      }

      if (s.saucer) {
        ctx.save()
        ctx.translate(s.saucer.x, s.saucer.y)
        ctx.strokeStyle = '#f0abfc'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(-16, 0); ctx.lineTo(-8, -6); ctx.lineTo(8, -6); ctx.lineTo(16, 0)
        ctx.lineTo(8, 6); ctx.lineTo(-8, 6); ctx.closePath()
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(-6, -6); ctx.lineTo(-2, -12); ctx.lineTo(2, -12); ctx.lineTo(6, -6)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(-16, 0); ctx.lineTo(16, 0)
        ctx.stroke()
        ctx.restore()
      }

      for (const p of s.particles) {
        ctx.globalAlpha = Math.max(0, p.life)
        ctx.fillStyle = p.color
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
      }
      ctx.globalAlpha = 1

      for (const pu of s.popups) {
        ctx.globalAlpha = Math.max(0, pu.t)
        ctx.fillStyle = pu.color
        ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'center'
        ctx.fillText(pu.text, pu.x, pu.y)
      }
      ctx.globalAlpha = 1

      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.font = '13px system-ui'; ctx.textAlign = 'left'
      ctx.fillText(`LIVES`, 20, 30)
      for (let i = 0; i < lives; i++) {
        ctx.save()
        ctx.translate(70 + i * 22, 26)
        ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(-6, 6); ctx.closePath()
        ctx.stroke()
        ctx.restore()
      }
      ctx.textAlign = 'right'
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.fillText(`WAVE ${level}`, W - 20, 30)

      if (s.ship.hyperCd > 0) {
        const barW = 60
        ctx.fillStyle = 'rgba(255,255,255,0.15)'
        ctx.fillRect(W / 2 - barW / 2, H - 24, barW, 6)
        ctx.fillStyle = '#f0abfc'
        ctx.fillRect(W / 2 - barW / 2, H - 24, barW * (1 - s.ship.hyperCd / 120), 6)
        ctx.fillStyle = 'rgba(255,255,255,0.5)'
        ctx.font = '10px system-ui'; ctx.textAlign = 'center'
        ctx.fillText('HYPERSPACE', W / 2, H - 30)
      }

      ctx.restore()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [status, level, lives, spawnWave, sfx, score])

  const bindTouch = (key, on) => (e) => { e.preventDefault(); stateRef.current.keys[key] = on }
  const mobilePad = (
    <div className="flex items-center gap-2">
      <button type="button"
        onTouchStart={bindTouch('left', true)} onTouchEnd={bindTouch('left', false)}
        onMouseDown={bindTouch('left', true)} onMouseUp={bindTouch('left', false)} onMouseLeave={bindTouch('left', false)}
        className="w-11 h-11 rounded-full bg-white/10 border border-white/30 text-white text-lg font-bold active:bg-white/20">↺</button>
      <button type="button"
        onTouchStart={bindTouch('right', true)} onTouchEnd={bindTouch('right', false)}
        onMouseDown={bindTouch('right', true)} onMouseUp={bindTouch('right', false)} onMouseLeave={bindTouch('right', false)}
        className="w-11 h-11 rounded-full bg-white/10 border border-white/30 text-white text-lg font-bold active:bg-white/20">↻</button>
      <button type="button"
        onTouchStart={bindTouch('thrust', true)} onTouchEnd={bindTouch('thrust', false)}
        onMouseDown={bindTouch('thrust', true)} onMouseUp={bindTouch('thrust', false)} onMouseLeave={bindTouch('thrust', false)}
        className="w-14 h-11 rounded-lg bg-amber-500/30 border border-amber-400 text-white text-[11px] font-bold active:bg-amber-500/50">THRUST</button>
      <button type="button"
        onTouchStart={bindTouch('fire', true)} onTouchEnd={bindTouch('fire', false)}
        onMouseDown={bindTouch('fire', true)} onMouseUp={bindTouch('fire', false)} onMouseLeave={bindTouch('fire', false)}
        className="w-12 h-11 rounded-lg bg-rose-500/30 border border-rose-400 text-white text-[11px] font-bold active:bg-rose-500/50">FIRE</button>
      <button type="button"
        onTouchStart={bindTouch('hyper', true)} onTouchEnd={bindTouch('hyper', false)}
        onMouseDown={bindTouch('hyper', true)} onMouseUp={bindTouch('hyper', false)} onMouseLeave={bindTouch('hyper', false)}
        className="w-11 h-11 rounded-full bg-fuchsia-500/30 border border-fuchsia-400 text-white text-[10px] font-bold active:bg-fuchsia-500/50">HYP</button>
    </div>
  )

  return (
    <GameShell
      slug="asteroids"
      title="Asteroids"
      category="Arcade"
      score={score} level={level} status={status}
      extraStats={<div className="flex flex-col items-start"><span className="text-[10px] uppercase tracking-widest text-white/40 font-mono">Lives</span><span className="font-poppins font-black tabular-nums text-lg sm:text-xl text-emerald-300">{lives}</span></div>}
      soundOn={soundOn} onSoundToggle={() => setSoundOn((v) => !v)}
      onRestart={reset}
      onPause={() => setStatus((v) => v === 'paused' ? 'playing' : (v === 'playing' ? 'paused' : v))}
      controls={[
        { key: '← →', label: 'Rotate' },
        { key: '↑ / W', label: 'Thrust' },
        { key: 'Z', label: 'Fire' },
        { key: 'X', label: 'Hyperspace' },
        { key: 'Space', label: 'Pause' },
      ]}
      mobile={mobilePad}
      subtitle="Vector wireframes, true inertia, wraparound universe. Beware the pink saucer and think twice before hitting hyperspace."
      rules={RULES}
      difficulty={difficulty}
      onDifficultyChange={setDifficulty}
      difficultyModes={['Easy', 'Medium', 'Hard', 'Custom']}
      customSchema={CUSTOM_SCHEMA}
      customValues={customValues}
      onCustomChange={setCustomValues}
    >
      <canvas ref={canvasRef} width={W} height={H} className="w-full h-auto max-h-[78vh] block bg-black" />
    </GameShell>
  )
}
