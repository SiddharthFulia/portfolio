// Breakout — full brick breaker with power-ups, 20 levels, particles,
// screen shake, ball trail. Fixed-timestep physics on a 800×600 canvas
// scaled responsively.
//
// Controls:
//   • ← → / A D           — move paddle
//   • Enter / ↑ / W       — launch ball / fire laser
//   • Touch drag on canvas — move paddle
//   • Space               — pause (handled by GameShell)
//
// Game-feel details beyond the base spec:
//   • Ball leaves a fading 14-position trail.
//   • Bricks are beveled, gradient-filled and grow cracks at low HP.
//   • Power-ups fall as spinning capsules that must be caught with the
//     paddle. Types: MULTI, WIDE, LASER, SLOW, +1 LIFE, +500.
//   • Screen shake ramps with impact strength; killed by reduced-motion.
//   • Chromatic flash on level clear.

import { useEffect, useRef, useState, useCallback } from 'react'
import GameShell from '../../components/arcade/GameShell'
import { getSfx } from '../../components/arcade/sfx'

const W = 800
const H = 600
const PADDLE_Y   = H - 40
const PADDLE_W   = 100
const PADDLE_H   = 14
const BALL_R     = 7
const BRICK_ROWS = 6
const BRICK_COLS = 12
const BRICK_W    = 58
const BRICK_H    = 22
const BRICK_TOP  = 70
const BRICK_GAP  = 4
const BRICK_LEFT = (W - (BRICK_COLS * (BRICK_W + BRICK_GAP) - BRICK_GAP)) / 2

const POWER_TYPES = ['multi', 'wide', 'laser', 'slow', 'life', 'points']

// Twenty distinct layouts.
const LEVELS = (() => {
  const out = []
  const empty = () => Array.from({ length: BRICK_ROWS }, () => Array(BRICK_COLS).fill(0))
  const fill = (fn) => {
    const g = empty()
    for (let r = 0; r < BRICK_ROWS; r++)
      for (let c = 0; c < BRICK_COLS; c++)
        g[r][c] = fn(r, c)
    return g
  }
  out.push(fill((r) => 1 + Math.floor(r / 2)))                                    // 1: full
  out.push(fill((r, c) => (r + c) % 2 === 0 ? 1 + (r % 3) : 0))                    // 2: checker
  out.push(fill((r, c) => (c >= r && c < BRICK_COLS - r) ? 1 + r : 0))             // 3: pyramid
  out.push(fill((r, c) => (c < r + 1 || c >= BRICK_COLS - r - 1) ? 0 : 1 + (BRICK_ROWS - r))) // 4: inv-pyramid
  out.push(fill((r) => r < 3 ? 2 + r : 0))                                         // 5: top-heavy
  out.push(fill((r, c) => (c === Math.floor(BRICK_COLS / 2) || c === Math.floor(BRICK_COLS / 2) - 1 || r === Math.floor(BRICK_ROWS / 2)) ? 2 : 0)) // 6: cross
  out.push(fill((r, c) => ((r + c) % 3 === 0) ? 1 + (r % 3) : 0))                  // 7: zigzag
  out.push(fill((r, c) => {                                                        // 8: arches
    const localC = c % (BRICK_COLS / 2)
    return ((BRICK_COLS / 2 - localC - 1 >= r) && (localC >= r)) ? 1 + r : 0
  }))
  out.push(fill((r, c) => {                                                        // 9: heart-ish
    const d = Math.abs(c - BRICK_COLS / 2 + 0.5)
    return (d + r * 0.8 < 5.5) ? 2 + Math.floor(r / 2) : 0
  }))
  out.push(fill((r, c) => 1 + ((c + r) % 4)))                                       // 10: hp waves
  out.push(fill((r, c) => c % 3 !== 0 ? 2 : 0))                                     // 11: gaps
  out.push(fill((r, c) => (Math.abs(r - (BRICK_ROWS / 2 - 0.5)) + Math.abs(c - (BRICK_COLS / 2 - 0.5)) * 0.6 < 3) ? 2 + r : 0)) // 12: diamond
  out.push(fill((r) => r % 2 === 0 ? 3 : 1))                                        // 13: stripes
  out.push(fill((r, c) => (r === 2 && c > 3 && c < 8) ? 0 : (2 + (r % 3))))          // 14: window
  out.push(fill((r, c) => (c + r) % 4 < 2 ? 2 : 0))                                  // 15: chevrons
  out.push(fill((r) => 3 + Math.floor(r / 2)))                                       // 16: wall
  out.push(fill((r, c) => r < 2 || r > 3 ? 3 : (c % 2 === 0 ? 3 : 0)))                // 17: banded
  out.push(fill((r, c) => ((r === 0 || r === BRICK_ROWS - 1) && c >= 1 && c <= 10) || (c === 1 && r > 0 && r < BRICK_ROWS - 1) ? 3 : 0)) // 18: B
  out.push(fill((r, c) => (r === c) || (r + c === BRICK_COLS - 1) || (r === 0) ? 4 : 0)) // 19: pinwheel
  out.push(fill(() => 5))                                                             // 20: boss
  return out
})()

const HP_COLORS = {
  1: ['#f97316', '#ea580c', '#c2410c'],
  2: ['#f43f5e', '#e11d48', '#9f1239'],
  3: ['#d946ef', '#c026d3', '#86198f'],
  4: ['#22d3ee', '#0891b2', '#155e75'],
  5: ['#a3e635', '#65a30d', '#365314'],
}

export default function Breakout() {
  const canvasRef = useRef(null)
  const sfx = useRef(getSfx()).current

  const [score, setScore] = useState(0)
  const [status, setStatus] = useState('ready') // ready | playing | paused | over | won
  const [level, setLevel] = useState(1)
  const [lives, setLives] = useState(3)
  const [soundOn, setSoundOn] = useState(true)

  const stateRef = useRef({
    paddle: { x: W / 2 - PADDLE_W / 2, w: PADDLE_W, laserCd: 0, wideT: 0, laserT: 0 },
    balls: [],
    bricks: [],
    powers: [],
    lasers: [],
    particles: [],
    popups: [],
    shake: 0,
    keys: { left: false, right: false, fire: false },
    pointerX: null,
    slowT: 0,
    flashT: 0,
    started: false,
    reduced: false,
  })

  useEffect(() => { sfx.setEnabled(soundOn) }, [soundOn, sfx])

  const buildLevel = useCallback((lvIdx) => {
    const layout = LEVELS[lvIdx % LEVELS.length]
    const bricks = []
    for (let r = 0; r < BRICK_ROWS; r++) {
      for (let c = 0; c < BRICK_COLS; c++) {
        const hp = layout[r][c]
        if (!hp) continue
        bricks.push({
          x: BRICK_LEFT + c * (BRICK_W + BRICK_GAP),
          y: BRICK_TOP + r * (BRICK_H + BRICK_GAP),
          w: BRICK_W, h: BRICK_H,
          hp, maxHp: hp, alive: true,
        })
      }
    }
    return bricks
  }, [])

  const resetBallPaddle = useCallback((s) => {
    s.paddle = { x: W / 2 - PADDLE_W / 2, w: PADDLE_W, laserCd: 0, wideT: 0, laserT: 0 }
    s.balls = [{ x: W / 2, y: PADDLE_Y - BALL_R - 1, vx: 0, vy: 0, stuck: true, trail: [] }]
    s.powers = []
    s.lasers = []
    s.slowT = 0
    s.started = false
  }, [])

  const startLevel = useCallback((lvIdx) => {
    const s = stateRef.current
    s.bricks = buildLevel(lvIdx)
    resetBallPaddle(s)
    s.particles = []
    s.popups = []
    s.shake = 0
    s.flashT = 0
  }, [buildLevel, resetBallPaddle])

  const reset = useCallback(() => {
    setScore(0); setLevel(1); setLives(3); setStatus('ready')
    startLevel(0)
  }, [startLevel])

  useEffect(() => { startLevel(0) }, [startLevel])

  // Keyboard input.
  useEffect(() => {
    const s = stateRef.current
    const kd = (e) => {
      if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') s.keys.left  = true
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') s.keys.right = true
      // Enter / ↑ / W handle launch + laser fire. Space is left to the shell for pause.
      if (e.code === 'Enter' || e.code === 'ArrowUp' || e.code === 'KeyW') { s.keys.fire = true; e.preventDefault() }
    }
    const ku = (e) => {
      if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') s.keys.left  = false
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') s.keys.right = false
      if (e.code === 'Enter' || e.code === 'ArrowUp' || e.code === 'KeyW') s.keys.fire = false
    }
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku) }
  }, [])

  // Pointer / touch.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const move = (e) => {
      const rect = canvas.getBoundingClientRect()
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      stateRef.current.pointerX = (clientX - rect.left) / rect.width * W
    }
    const tap = () => {
      const s = stateRef.current
      s.keys.fire = true
      setTimeout(() => { s.keys.fire = false }, 120)
    }
    canvas.addEventListener('mousemove', move)
    canvas.addEventListener('touchmove', move, { passive: true })
    canvas.addEventListener('mousedown', tap)
    canvas.addEventListener('touchstart', tap, { passive: true })
    return () => {
      canvas.removeEventListener('mousemove', move)
      canvas.removeEventListener('touchmove', move)
      canvas.removeEventListener('mousedown', tap)
      canvas.removeEventListener('touchstart', tap)
    }
  }, [])

  // Ready→Playing on first launch input.
  useEffect(() => {
    if (status !== 'ready') return
    const id = setInterval(() => {
      if (stateRef.current.keys.fire) setStatus('playing')
    }, 60)
    return () => clearInterval(id)
  }, [status])

  // Main loop.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let raf = 0
    let last = performance.now()

    stateRef.current.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const spawnPower = (x, y) => {
      const type = POWER_TYPES[Math.floor(Math.random() * POWER_TYPES.length)]
      stateRef.current.powers.push({ x, y, vy: 1.6, type, rot: 0 })
    }
    const spawnParticles = (x, y, color, n = 20, speed = 3) => {
      const s = stateRef.current
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        const v = 0.5 + Math.random() * speed
        s.particles.push({
          x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          life: 1, decay: 0.02 + Math.random() * 0.03,
          size: 1 + Math.random() * 2.5, color,
        })
      }
    }
    const popup = (x, y, text, color = '#fef3c7') => stateRef.current.popups.push({ x, y, t: 1, text, color })
    const shake = (v) => {
      if (stateRef.current.reduced) return
      stateRef.current.shake = Math.min(24, stateRef.current.shake + v)
    }

    const applyPower = (type) => {
      const s = stateRef.current
      if (type === 'multi') {
        const newBalls = []
        s.balls.forEach((b) => {
          if (b.stuck) return
          const speed = Math.hypot(b.vx, b.vy)
          for (const angle of [-0.4, 0.4]) {
            const a = Math.atan2(b.vy, b.vx) + angle
            newBalls.push({ x: b.x, y: b.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, trail: [] })
          }
        })
        s.balls.push(...newBalls.slice(0, 6))
        popup(s.paddle.x + s.paddle.w / 2, PADDLE_Y - 12, '+MULTI', '#f0abfc')
        sfx.chirp()
      } else if (type === 'wide') {
        s.paddle.w = PADDLE_W * 1.7
        s.paddle.wideT = 12
        popup(s.paddle.x + s.paddle.w / 2, PADDLE_Y - 12, 'WIDE', '#a3e635')
        sfx.pop()
      } else if (type === 'laser') {
        s.paddle.laserT = 10
        popup(s.paddle.x + s.paddle.w / 2, PADDLE_Y - 12, 'LASER', '#22d3ee')
        sfx.pop()
      } else if (type === 'slow') {
        s.slowT = 10
        popup(s.paddle.x + s.paddle.w / 2, PADDLE_Y - 12, 'SLOW', '#93c5fd')
        sfx.pop()
      } else if (type === 'life') {
        setLives((v) => Math.min(v + 1, 6))
        popup(s.paddle.x + s.paddle.w / 2, PADDLE_Y - 12, '+1 LIFE', '#4ade80')
        sfx.coin()
      } else if (type === 'points') {
        setScore((v) => v + 500)
        popup(s.paddle.x + s.paddle.w / 2, PADDLE_Y - 12, '+500', '#fde68a')
        sfx.coin()
      }
    }

    const tick = (now) => {
      let dt = (now - last) / 16.666
      last = now
      if (dt > 3) dt = 3
      const s = stateRef.current

      if (status === 'playing') {
        const spd = 8 * dt
        if (s.keys.left)  s.paddle.x -= spd
        if (s.keys.right) s.paddle.x += spd
        if (s.pointerX != null) {
          const target = s.pointerX - s.paddle.w / 2
          s.paddle.x += (target - s.paddle.x) * Math.min(1, 0.3 * dt)
        }
        s.paddle.x = Math.max(0, Math.min(W - s.paddle.w, s.paddle.x))

        if (s.paddle.wideT > 0) { s.paddle.wideT -= dt / 60; if (s.paddle.wideT <= 0) s.paddle.w = PADDLE_W }
        if (s.paddle.laserT > 0) s.paddle.laserT -= dt / 60
        if (s.slowT > 0)         s.slowT -= dt / 60
        if (s.paddle.laserCd > 0) s.paddle.laserCd -= dt

        if (s.paddle.laserT > 0 && s.keys.fire && s.paddle.laserCd <= 0) {
          s.lasers.push({ x: s.paddle.x + 10, y: PADDLE_Y - 10, vy: -9 })
          s.lasers.push({ x: s.paddle.x + s.paddle.w - 10, y: PADDLE_Y - 10, vy: -9 })
          s.paddle.laserCd = 8
          sfx.laser()
        }

        if (s.keys.fire) {
          s.balls.forEach((b) => {
            if (b.stuck) {
              b.stuck = false
              b.vx = (Math.random() - 0.5) * 3
              b.vy = -5
              s.started = true
              sfx.pop()
            }
          })
        }

        const speedMul = s.slowT > 0 ? 0.6 : 1
        for (const b of s.balls) {
          if (b.stuck) {
            b.x = s.paddle.x + s.paddle.w / 2
            b.y = PADDLE_Y - BALL_R - 1
            continue
          }
          b.trail.push({ x: b.x, y: b.y })
          if (b.trail.length > 14) b.trail.shift()

          b.x += b.vx * dt * speedMul
          b.y += b.vy * dt * speedMul

          if (b.x < BALL_R) { b.x = BALL_R; b.vx *= -1; sfx.hit() }
          if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx *= -1; sfx.hit() }
          if (b.y < BALL_R) { b.y = BALL_R; b.vy *= -1; sfx.hit() }

          if (b.vy > 0 &&
              b.y + BALL_R > PADDLE_Y && b.y - BALL_R < PADDLE_Y + PADDLE_H &&
              b.x > s.paddle.x - BALL_R && b.x < s.paddle.x + s.paddle.w + BALL_R) {
            const hit = (b.x - (s.paddle.x + s.paddle.w / 2)) / (s.paddle.w / 2)
            const speed = Math.min(9, Math.hypot(b.vx, b.vy) * 1.02)
            const angle = hit * 1.05 - Math.PI / 2
            b.vx = Math.cos(angle) * speed
            b.vy = Math.sin(angle) * speed
            b.y = PADDLE_Y - BALL_R - 1
            shake(2)
            sfx.pop()
          }

          for (const br of s.bricks) {
            if (!br.alive) continue
            if (b.x + BALL_R > br.x && b.x - BALL_R < br.x + br.w &&
                b.y + BALL_R > br.y && b.y - BALL_R < br.y + br.h) {
              const dx = Math.min(b.x - br.x, br.x + br.w - b.x)
              const dy = Math.min(b.y - br.y, br.y + br.h - b.y)
              if (dx < dy) b.vx *= -1
              else         b.vy *= -1
              br.hp -= 1
              if (br.hp <= 0) {
                br.alive = false
                setScore((v) => v + 20 * br.maxHp)
                const cx = br.x + br.w / 2, cy = br.y + br.h / 2
                spawnParticles(cx, cy, HP_COLORS[br.maxHp]?.[0] || '#f0abfc', 24, 3.5)
                if (Math.random() < 0.14) spawnPower(cx, cy)
                sfx.boom(); shake(1.4)
              } else {
                sfx.hit()
                spawnParticles(b.x, b.y, '#fbbf24', 6, 1.5)
              }
              break
            }
          }
        }

        s.balls = s.balls.filter((b) => b.y < H + 40)
        if (s.balls.length === 0) {
          setLives((v) => {
            const nl = v - 1
            if (nl <= 0) { setStatus('over'); sfx.death() }
            else { resetBallPaddle(s); sfx.death() }
            return nl
          })
        }

        s.powers.forEach((p) => { p.y += p.vy * dt; p.rot += 0.1 * dt })
        s.powers = s.powers.filter((p) => {
          if (p.y > H + 20) return false
          if (p.y + 8 > PADDLE_Y && p.y - 8 < PADDLE_Y + PADDLE_H &&
              p.x > s.paddle.x && p.x < s.paddle.x + s.paddle.w) {
            applyPower(p.type)
            return false
          }
          return true
        })

        s.lasers.forEach((l) => { l.y += l.vy * dt })
        s.lasers = s.lasers.filter((l) => {
          if (l.y < 0) return false
          for (const br of s.bricks) {
            if (!br.alive) continue
            if (l.x > br.x && l.x < br.x + br.w && l.y > br.y && l.y < br.y + br.h) {
              br.hp -= 1
              if (br.hp <= 0) {
                br.alive = false
                setScore((v) => v + 20 * br.maxHp)
                spawnParticles(br.x + br.w / 2, br.y + br.h / 2, HP_COLORS[br.maxHp]?.[0] || '#f0abfc', 20, 3)
                if (Math.random() < 0.08) spawnPower(br.x + br.w / 2, br.y + br.h / 2)
                sfx.boom()
              } else {
                spawnParticles(l.x, l.y, '#22d3ee', 4, 1.5)
                sfx.hit()
              }
              return false
            }
          }
          return true
        })

        s.particles.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 0.06 * dt; p.life -= p.decay * dt })
        s.particles = s.particles.filter((p) => p.life > 0)
        s.popups.forEach((p) => { p.y -= 0.6 * dt; p.t -= 0.014 * dt })
        s.popups = s.popups.filter((p) => p.t > 0)
        s.shake *= Math.pow(0.86, dt)
        s.flashT *= Math.pow(0.92, dt)

        const remaining = s.bricks.some((b) => b.alive)
        if (!remaining && s.started) {
          s.flashT = 1
          sfx.win()
          setTimeout(() => {
            setLevel((l) => {
              const next = l + 1
              if (next > LEVELS.length) { setStatus('won'); return l }
              startLevel(next - 1)
              return next
            })
          }, 700)
        }
      }

      // ─── render ───
      ctx.save()
      ctx.clearRect(0, 0, W, H)
      const bg = ctx.createLinearGradient(0, 0, 0, H)
      bg.addColorStop(0, '#0b0b16'); bg.addColorStop(1, '#000')
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
      ctx.globalAlpha = 0.05
      ctx.strokeStyle = '#f0abfc'
      ctx.lineWidth = 1
      for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
      for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }
      ctx.globalAlpha = 1

      const shakeX = s.shake ? (Math.random() - 0.5) * s.shake : 0
      const shakeY = s.shake ? (Math.random() - 0.5) * s.shake : 0
      ctx.translate(shakeX, shakeY)

      // Bricks.
      for (const br of s.bricks) {
        if (!br.alive) continue
        const pal = HP_COLORS[br.maxHp] || HP_COLORS[1]
        const grad = ctx.createLinearGradient(br.x, br.y, br.x, br.y + br.h)
        grad.addColorStop(0, pal[0]); grad.addColorStop(0.5, pal[1]); grad.addColorStop(1, pal[2])
        ctx.fillStyle = grad
        ctx.fillRect(br.x, br.y, br.w, br.h)
        ctx.fillStyle = 'rgba(255,255,255,0.28)'
        ctx.fillRect(br.x, br.y, br.w, 2); ctx.fillRect(br.x, br.y, 2, br.h)
        ctx.fillStyle = 'rgba(0,0,0,0.28)'
        ctx.fillRect(br.x, br.y + br.h - 2, br.w, 2); ctx.fillRect(br.x + br.w - 2, br.y, 2, br.h)
        if (br.hp < br.maxHp) {
          ctx.strokeStyle = 'rgba(0,0,0,0.5)'
          ctx.lineWidth = 1
          const dmg = 1 - br.hp / br.maxHp
          ctx.beginPath()
          ctx.moveTo(br.x + br.w * 0.2, br.y + 2)
          ctx.lineTo(br.x + br.w * 0.45, br.y + br.h * 0.6)
          ctx.lineTo(br.x + br.w * 0.8, br.y + br.h - 2)
          ctx.stroke()
          if (dmg > 0.5) {
            ctx.beginPath()
            ctx.moveTo(br.x + br.w * 0.55, br.y + 3)
            ctx.lineTo(br.x + br.w * 0.35, br.y + br.h - 4)
            ctx.stroke()
          }
        }
      }

      // Particles.
      for (const p of s.particles) {
        ctx.globalAlpha = Math.max(0, p.life)
        ctx.fillStyle = p.color
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill()
      }
      ctx.globalAlpha = 1

      // Balls with trail.
      for (const b of s.balls) {
        for (let i = 0; i < b.trail.length; i++) {
          const t = b.trail[i]
          const a = i / b.trail.length
          ctx.globalAlpha = a * 0.5
          ctx.fillStyle = '#fde68a'
          ctx.beginPath(); ctx.arc(t.x, t.y, BALL_R * a, 0, Math.PI * 2); ctx.fill()
        }
        ctx.globalAlpha = 1
        const g = ctx.createRadialGradient(b.x - 2, b.y - 2, 1, b.x, b.y, BALL_R)
        g.addColorStop(0, '#fff'); g.addColorStop(0.4, '#fef3c7'); g.addColorStop(1, '#f59e0b')
        ctx.fillStyle = g
        ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2); ctx.fill()
      }

      // Power capsules.
      for (const p of s.powers) {
        const label = { multi: 'M', wide: 'W', laser: 'L', slow: 'S', life: '+', points: '$' }[p.type]
        const col   = { multi: '#f0abfc', wide: '#a3e635', laser: '#22d3ee', slow: '#93c5fd', life: '#4ade80', points: '#fde68a' }[p.type]
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(Math.sin(p.rot) * 0.4)
        ctx.fillStyle = col
        ctx.fillRect(-14, -8, 28, 16)
        ctx.strokeStyle = '#000'
        ctx.strokeRect(-14, -8, 28, 16)
        ctx.fillStyle = '#000'
        ctx.font = 'bold 12px system-ui'
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(label, 0, 0)
        ctx.restore()
      }

      // Lasers.
      ctx.fillStyle = '#22d3ee'
      ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 8
      for (const l of s.lasers) ctx.fillRect(l.x - 1.5, l.y - 8, 3, 10)
      ctx.shadowBlur = 0

      // Paddle.
      const pd = s.paddle
      const pgrad = ctx.createLinearGradient(pd.x, PADDLE_Y, pd.x, PADDLE_Y + PADDLE_H)
      pgrad.addColorStop(0, '#fbbf24'); pgrad.addColorStop(1, '#b45309')
      ctx.fillStyle = pgrad
      ctx.fillRect(pd.x, PADDLE_Y, pd.w, PADDLE_H)
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      ctx.fillRect(pd.x, PADDLE_Y, pd.w, 3)
      ctx.fillStyle = 'rgba(0,0,0,0.35)'
      ctx.fillRect(pd.x, PADDLE_Y + PADDLE_H - 3, pd.w, 3)
      if (pd.laserT > 0) {
        ctx.fillStyle = '#22d3ee'
        ctx.fillRect(pd.x + 6, PADDLE_Y - 4, 4, 4)
        ctx.fillRect(pd.x + pd.w - 10, PADDLE_Y - 4, 4, 4)
      }

      for (const pu of s.popups) {
        ctx.globalAlpha = Math.max(0, pu.t)
        ctx.fillStyle = pu.color
        ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'center'
        ctx.fillText(pu.text, pu.x, pu.y)
      }
      ctx.globalAlpha = 1

      // Lives + level chrome.
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.font = '13px system-ui'; ctx.textAlign = 'left'
      ctx.fillText('LIVES', 20, 30)
      for (let i = 0; i < lives; i++) {
        ctx.fillStyle = '#f43f5e'
        ctx.beginPath(); ctx.arc(72 + i * 22, 26, 6, 0, Math.PI * 2); ctx.fill()
      }
      ctx.textAlign = 'right'
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.fillText(`Level ${level} / ${LEVELS.length}`, W - 20, 30)

      if (s.flashT > 0.02) {
        ctx.globalAlpha = s.flashT * 0.35
        ctx.fillStyle = '#fef3c7'
        ctx.fillRect(0, 0, W, H)
        ctx.globalAlpha = 1
      }

      if (status === 'ready') {
        ctx.fillStyle = 'rgba(0,0,0,0.45)'
        ctx.fillRect(0, 0, W, H)
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 36px system-ui'; ctx.textAlign = 'center'
        ctx.fillText('Tap or press Enter to launch', W / 2, H / 2)
      }

      ctx.restore()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [status, level, lives, startLevel, resetBallPaddle, sfx])

  return (
    <GameShell
      slug="breakout"
      title="Breakout"
      category="Arcade"
      score={score}
      level={level}
      status={status}
      extraStats={<div className="flex flex-col items-start"><span className="text-[10px] uppercase tracking-widest text-white/40 font-mono">Lives</span><span className="font-poppins font-black tabular-nums text-lg sm:text-xl text-emerald-300">{lives}</span></div>}
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn((v) => !v)}
      onRestart={reset}
      onPause={() => setStatus((v) => v === 'paused' ? 'playing' : (v === 'playing' ? 'paused' : v))}
      controls={[
        { key: '← →', label: 'Move' },
        { key: 'Enter', label: 'Launch / Laser' },
        { key: 'Drag', label: 'Touch to move' },
        { key: 'Space', label: 'Pause' },
      ]}
      subtitle="Twenty layouts, six power-ups. Catch capsules to unlock lasers, split the ball, or widen the paddle."
    >
      <canvas ref={canvasRef} width={W} height={H} className="w-full h-auto max-h-[78vh] block bg-black" />
    </GameShell>
  )
}
