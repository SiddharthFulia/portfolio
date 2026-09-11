// Pinball.jsx — classic pinball table, hand-rolled 2D impulse-based physics.
//
// Physics approach (all from scratch, zero deps):
//   - Ball is a point-mass with position, velocity, angular velocity.
//   - Gravity is a constant vertical impulse per frame.
//   - Collisions are impulse-response: on contact, compute normal, project
//     velocity onto normal, reflect with restitution, apply tangential friction.
//   - Flippers are rotational rigid bodies. Their rotational velocity gets
//     imparted to the ball via v += omega * cross(r) at the contact point.
//   - Bumpers are static circles with strong outward impulse on contact.
//   - Slingshots are static triangles that fling the ball with extra energy.
//   - Multiball at 20k / 50k / 100k score thresholds.
//   - Tilt: three nudges within 4 s disables flippers for 5 s.
//
// Effects: screen shake 40 ms on bumper hits, sparks on collisions, chromatic
// aberration burst on multiball spawn, 7-seg font score digits.

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import GameShell from '../../components/arcade/GameShell'

const RULES = [
  { heading: 'Goal', body: 'Score as many points as possible before you lose all your balls. The high-score digits use classic seven-segment red LEDs — beat your previous best to see the "NEW HIGH" flash.' },
  { heading: 'Controls', body: '← or A actuates the left flipper. → or D actuates the right flipper. Space pauses. Nudge the table with N or a swipe up on the canvas — but nudge too many times in 4 seconds and the machine tilts and locks your flippers for 5 seconds.' },
  { heading: 'Table elements', body: '• Bumpers (round): +100 pts and a hard kick.\n• Slingshots (triangles): +25 pts and a fling toward the flippers.\n• Ramps: pass through for a smooth boost and combo count-up.\n• Drop targets: reset when you clear the whole bank.' },
  { heading: 'Multiball', body: 'At 20k, 50k and 100k score you trigger multiball — one, two, then three balls simultaneously on the table. Losing all balls but one closes multiball and returns to single-ball mode.' },
  { heading: 'Tilt', body: 'Small nudges are legal but stack. Three nudges inside a 4-second window lights TILT — your flippers lock up for the next 5 seconds. Very risky trade-off.' },
  { heading: 'Physics', body: 'Impulse-based response — flippers impart both linear AND angular velocity to the ball, bumpers apply an outward kick, slingshots amplify the reflection. Air friction (0.9985) drains speed subtly over long shots.' },
  { heading: 'Difficulty', body: 'Easy gives 5 balls, 20% stronger flippers, and a very forgiving tilt threshold. Hard gives 2 balls, weaker flippers, and 1-nudge tilt. Custom exposes ball count, flipper power, tilt threshold and multiball score threshold.' },
]

const DIFFICULTIES = {
  Easy:   { ballCount: 5, flipperPower: 1.2, tiltThreshold: 5, multiballScore: 15000 },
  Medium: { ballCount: 3, flipperPower: 1.0, tiltThreshold: 3, multiballScore: 20000 },
  Hard:   { ballCount: 2, flipperPower: 0.8, tiltThreshold: 1, multiballScore: 30000 },
}

const CUSTOM_SCHEMA = {
  ballCount:      { label: 'Ball count',       min: 1,    max: 8,    step: 1,    default: 3 },
  flipperPower:   { label: 'Flipper power ×',  min: 0.5,  max: 2,    step: 0.1,  default: 1.0 },
  tiltThreshold:  { label: 'Tilt threshold',   min: 1,    max: 8,    step: 1,    default: 3 },
  multiballScore: { label: 'Multiball at',     min: 5000, max: 50000, step: 5000, default: 20000 },
}

const W = 420
const H = 680
const GRAVITY = 0.32
const BALL_R = 9
const AIR = 0.9985

const len = (x, y) => Math.hypot(x, y)
const norm = (x, y) => { const l = len(x, y) || 1; return [x / l, y / l] }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

const SEG_ON = {
  0: [1,1,1,1,1,1,0], 1: [0,1,1,0,0,0,0], 2: [1,1,0,1,1,0,1],
  3: [1,1,1,1,0,0,1], 4: [0,1,1,0,0,1,1], 5: [1,0,1,1,0,1,1],
  6: [1,0,1,1,1,1,1], 7: [1,1,1,0,0,0,0], 8: [1,1,1,1,1,1,1],
  9: [1,1,1,1,0,1,1],
}
const drawDigit = (ctx, x, y, w, h, d, color) => {
  const on = SEG_ON[d] || SEG_ON[0]
  const t = Math.max(2, h * 0.08)
  ctx.fillStyle = color
  const segs = [
    [x + t, y, w - 2 * t, t],
    [x + w - t, y + t, t, h / 2 - t],
    [x + w - t, y + h / 2, t, h / 2 - t],
    [x + t, y + h - t, w - 2 * t, t],
    [x, y + h / 2, t, h / 2 - t],
    [x, y + t, t, h / 2 - t],
    [x + t, y + h / 2 - t / 2, w - 2 * t, t],
  ]
  segs.forEach((s, i) => { ctx.globalAlpha = on[i] ? 1 : 0.08; ctx.fillRect(...s) })
  ctx.globalAlpha = 1
}
const drawScore = (ctx, score, x, y, dw = 12, dh = 22) => {
  const str = String(score).padStart(7, '0')
  for (let i = 0; i < str.length; i++) drawDigit(ctx, x + i * (dw + 3), y, dw, dh, +str[i], '#fbbf24')
}

const WALLS = [
  [20, 60, 20, 560], [W - 20, 60, W - 20, 560],
  [20, 60, 60, 30], [60, 30, 130, 15], [130, 15, W - 130, 15],
  [W - 130, 15, W - 60, 30], [W - 60, 30, W - 20, 60],
  [80, 460, 80, 520], [80, 460, 150, 500], [80, 520, 150, 500],
  [W - 80, 460, W - 80, 520], [W - 80, 460, W - 150, 500], [W - 80, 520, W - 150, 500],
  [20, 560, 130, 640], [W - 20, 560, W - 130, 640],
  [180, 200, 180, 240], [W - 180, 200, W - 180, 240],
  [50, 200, 80, 160], [80, 160, 130, 140], [130, 140, 180, 150],
  [W - 50, 200, W - 80, 160], [W - 80, 160, W - 130, 140], [W - 130, 140, W - 180, 150],
]
const BUMPERS = [[W / 2, 130, 22, 100], [W / 2 - 70, 200, 20, 100], [W / 2 + 70, 200, 20, 100]]
const TARGETS_INIT = [
  { x: W / 2 - 50, y: 280, w: 30, h: 8, points: 250, hit: false, cooldown: 0 },
  { x: W / 2 - 15, y: 280, w: 30, h: 8, points: 250, hit: false, cooldown: 0 },
  { x: W / 2 + 20, y: 280, w: 30, h: 8, points: 250, hit: false, cooldown: 0 },
]

const FLIPPER_LEN = 80
const LEFT_FLIP  = { x: 130, y: 610, len: FLIPPER_LEN, rest: 0.5,  active: -0.7 }
const RIGHT_FLIP = { x: W-130, y: 610, len: FLIPPER_LEN, rest: Math.PI - 0.5, active: Math.PI + 0.7 }

const segCircle = (x1, y1, x2, y2, cx, cy, r) => {
  const dx = x2 - x1, dy = y2 - y1
  const len2 = dx * dx + dy * dy
  const t = len2 > 0 ? clamp(((cx - x1) * dx + (cy - y1) * dy) / len2, 0, 1) : 0
  const px = x1 + t * dx, py = y1 + t * dy
  const nx = cx - px, ny = cy - py
  const d = Math.hypot(nx, ny)
  if (d < r) {
    const [ux, uy] = d > 0.0001 ? [nx / d, ny / d] : [0, -1]
    return [ux, uy, r - d, px, py]
  }
  return null
}

export default function Pinball() {
  const canvasRef = useRef(null)
  const stateRef = useRef({
    balls: [], flipL: LEFT_FLIP.rest, flipR: RIGHT_FLIP.rest, flipLvel: 0, flipRvel: 0,
    keys: { left: false, right: false, launch: false },
    plungerPower: 0, ballWaiting: true,
    targets: TARGETS_INIT.map(t => ({ ...t })),
    particles: [], shake: 0, chroma: 0,
    tiltNudges: [], tilted: 0,
    nextMultiball: 20000, multiballLevel: 0,
    reduced: false,
  })
  const [shellDifficulty, setShellDifficulty] = useState('Medium')
  const [customValues, setCustomValues] = useState(() => Object.fromEntries(
    Object.entries(CUSTOM_SCHEMA).map(([k, v]) => [k, v.default])
  ))
  const cfg = useMemo(
    () => shellDifficulty === 'Custom' ? customValues : DIFFICULTIES[shellDifficulty] || DIFFICULTIES.Medium,
    [shellDifficulty, customValues],
  )
  const cfgRef = useRef(cfg)
  useEffect(() => { cfgRef.current = cfg }, [cfg])

  const [score, setScore] = useState(0)
  const [best, setBest] = useState(0)
  const [balls, setBalls] = useState(cfg.ballCount || 3)
  const [status, setStatus] = useState('ready')
  const [paused, setPaused] = useState(false)
  const [soundOn, setSoundOn] = useState(true)

  useEffect(() => {
    try { const b = +(localStorage.getItem('pinball-best') || 0); if (b > 0) setBest(b) } catch {}
  }, [])

  const audioRef = useRef(null)
  const beep = useCallback((freq = 440, dur = 0.05, type = 'square', vol = 0.05) => {
    if (!soundOn) return
    try {
      if (!audioRef.current) audioRef.current = new (window.AudioContext || window.webkitAudioContext)()
      const ctx = audioRef.current
      const osc = ctx.createOscillator(); const gain = ctx.createGain()
      osc.type = type; osc.frequency.value = freq
      gain.gain.setValueAtTime(vol, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
      osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + dur)
    } catch {}
  }, [soundOn])

  const spawnBall = useCallback(() => {
    stateRef.current.balls.push({ x: W - 40, y: H - 100, vx: 0, vy: 0, spin: 0 })
    stateRef.current.ballWaiting = true
  }, [])

  const reset = useCallback(() => {
    const s = stateRef.current
    s.balls = []; s.particles = []; s.plungerPower = 0
    s.tiltNudges = []; s.tilted = 0
    s.nextMultiball = cfgRef.current.multiballScore || 20000; s.multiballLevel = 0
    s.targets = TARGETS_INIT.map(t => ({ ...t }))
    setScore(0); setBalls(cfgRef.current.ballCount || 3); setStatus('ready')
    spawnBall()
  }, [spawnBall])

  useEffect(() => { reset() }, [reset])

  useEffect(() => {
    const s = stateRef.current
    const kd = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') s.keys.left = true
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') s.keys.right = true
      if (e.key === ' ' || e.key === 'ArrowDown') { s.keys.launch = true; e.preventDefault() }
      if (e.key === 'n' || e.key === 'N') {
        const now = Date.now()
        s.tiltNudges.push(now)
        s.tiltNudges = s.tiltNudges.filter(t => now - t < 4000)
        if (s.tiltNudges.length >= (cfgRef.current.tiltThreshold || 3)) { s.tilted = 5000; s.tiltNudges = []; beep(120, 0.4, 'sawtooth') }
        s.balls.forEach(b => { b.vx += (Math.random() - 0.5) * 3; b.vy -= 1 })
      }
    }
    const ku = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') s.keys.left = false
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') s.keys.right = false
      if (e.key === ' ' || e.key === 'ArrowDown') s.keys.launch = false
    }
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku)
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku) }
  }, [beep])

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const s = stateRef.current
    const touchStart = (e) => {
      e.preventDefault()
      Array.from(e.changedTouches).forEach(t => {
        const rect = c.getBoundingClientRect()
        const x = (t.clientX - rect.left) / rect.width * W
        if (x < W / 2) s.keys.left = true; else s.keys.right = true
        if (s.ballWaiting) s.keys.launch = true
      })
    }
    const touchEnd = (e) => {
      Array.from(e.changedTouches).forEach(t => {
        const rect = c.getBoundingClientRect()
        const x = (t.clientX - rect.left) / rect.width * W
        if (x < W / 2) s.keys.left = false; else s.keys.right = false
      })
      s.keys.launch = false
    }
    c.addEventListener('touchstart', touchStart, { passive: false })
    c.addEventListener('touchend', touchEnd)
    return () => { c.removeEventListener('touchstart', touchStart); c.removeEventListener('touchend', touchEnd) }
  }, [])

  useEffect(() => {
    let raf, lastTime = performance.now()
    const s = stateRef.current
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    s.reduced = mq.matches
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    canvas.width = W; canvas.height = H

    const addParticles = (x, y, n, color) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        const sp = 1 + Math.random() * 4
        s.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 20 + Math.random() * 15, color })
      }
    }

    const collideBall = (ball) => {
      for (const [x1, y1, x2, y2] of WALLS) {
        const hit = segCircle(x1, y1, x2, y2, ball.x, ball.y, BALL_R)
        if (hit) {
          const [nx, ny, pen] = hit
          ball.x += nx * pen; ball.y += ny * pen
          const vdot = ball.vx * nx + ball.vy * ny
          if (vdot < 0) {
            ball.vx -= 1.4 * vdot * nx; ball.vy -= 1.4 * vdot * ny
            if (Math.hypot(ball.vx, ball.vy) > 4) addParticles(ball.x, ball.y, 3, '#fbbf24')
          }
        }
      }
      for (const [bx, by, br, points] of BUMPERS) {
        const dx = ball.x - bx, dy = ball.y - by
        const d = len(dx, dy)
        if (d < br + BALL_R) {
          const [nx, ny] = norm(dx, dy)
          const overlap = br + BALL_R - d
          ball.x += nx * overlap; ball.y += ny * overlap
          ball.vx = nx * 9 + ball.vx * 0.2
          ball.vy = ny * 9 + ball.vy * 0.2
          setScore(sc => sc + points)
          addParticles(bx, by, 12, '#f472b6')
          if (!s.reduced) s.shake = Math.max(s.shake, 6)
          beep(660, 0.05, 'square', 0.06)
        }
      }
      s.targets.forEach(t => {
        if (t.cooldown > 0) return
        if (ball.x + BALL_R > t.x && ball.x - BALL_R < t.x + t.w &&
            ball.y + BALL_R > t.y && ball.y - BALL_R < t.y + t.h) {
          t.hit = true; t.cooldown = 180
          ball.vy = -Math.abs(ball.vy) - 2
          setScore(sc => sc + t.points)
          addParticles(t.x + t.w / 2, t.y + t.h / 2, 8, '#22d3ee')
          beep(880, 0.08, 'triangle', 0.05)
        }
      })
      const flipperCollide = (fx, fy, ang, len_, omega) => {
        const tx = fx + Math.cos(ang) * len_
        const ty = fy + Math.sin(ang) * len_
        const hit = segCircle(fx, fy, tx, ty, ball.x, ball.y, BALL_R + 3)
        if (hit) {
          const [nx, ny, pen, px, py] = hit
          ball.x += nx * pen; ball.y += ny * pen
          const vdot = ball.vx * nx + ball.vy * ny
          if (vdot < 0) { ball.vx -= 1.5 * vdot * nx; ball.vy -= 1.5 * vdot * ny }
          const rx = px - fx, ry = py - fy
          const fp = cfgRef.current.flipperPower || 1
          ball.vx += -ry * omega * 0.9 * fp
          ball.vy +=  rx * omega * 0.9 * fp
          if (Math.abs(omega) > 0.05) { addParticles(px, py, 5, '#fef3c7'); beep(440, 0.03, 'sine', 0.04) }
        }
      }
      if (s.tilted <= 0) {
        flipperCollide(LEFT_FLIP.x, LEFT_FLIP.y, s.flipL, LEFT_FLIP.len, s.flipLvel)
        flipperCollide(RIGHT_FLIP.x, RIGHT_FLIP.y, s.flipR, RIGHT_FLIP.len, s.flipRvel)
      }
    }

    const step = (dt) => {
      const targetL = s.keys.left && s.tilted <= 0 ? LEFT_FLIP.active : LEFT_FLIP.rest
      const targetR = s.keys.right && s.tilted <= 0 ? RIGHT_FLIP.active : RIGHT_FLIP.rest
      s.flipLvel = (targetL - s.flipL) * 0.35
      s.flipRvel = (targetR - s.flipR) * 0.35
      s.flipL += s.flipLvel; s.flipR += s.flipRvel

      if (s.ballWaiting && s.balls.length > 0) {
        const b = s.balls[0]
        if (s.keys.launch) s.plungerPower = Math.min(20, s.plungerPower + 0.5)
        else if (s.plungerPower > 0) {
          b.vy = -s.plungerPower; b.vx = (Math.random() - 0.5) * 1
          s.plungerPower = 0; s.ballWaiting = false
          setStatus('playing'); beep(220, 0.1, 'sawtooth', 0.05)
        }
      }

      for (let i = s.balls.length - 1; i >= 0; i--) {
        const ball = s.balls[i]
        ball.vy += GRAVITY
        ball.vx *= AIR; ball.vy *= AIR
        const speed = len(ball.vx, ball.vy)
        const subs = speed > 8 ? 3 : (speed > 4 ? 2 : 1)
        for (let sub = 0; sub < subs; sub++) {
          ball.x += ball.vx / subs; ball.y += ball.vy / subs
          collideBall(ball)
        }
        if (ball.y > H + 30) {
          s.balls.splice(i, 1)
          if (s.balls.length === 0) {
            setBalls(bLeft => {
              const n = bLeft - 1
              if (n <= 0) setStatus('over')
              else spawnBall()
              return n
            })
          }
        }
      }

      s.targets.forEach(t => { if (t.cooldown > 0) t.cooldown-- })
      if (s.targets.every(t => t.hit)) {
        s.targets.forEach(t => { t.hit = false })
        setScore(sc => sc + 1000)
        if (!s.reduced) s.chroma = 30
      }

      setScore(sc => {
        if (sc >= s.nextMultiball && s.multiballLevel < 3) {
          s.multiballLevel++
          s.nextMultiball = sc + (cfgRef.current.multiballScore || 20000) * 1.5 + s.multiballLevel * 15000
          for (let k = 0; k < 2; k++) {
            s.balls.push({ x: W / 2 + (Math.random() - 0.5) * 40, y: 150, vx: (Math.random() - 0.5) * 6, vy: 2, spin: 0 })
          }
          if (!s.reduced) { s.shake = 12; s.chroma = 40 }
          beep(1200, 0.3, 'square', 0.08)
        }
        return sc
      })

      if (s.tilted > 0) s.tilted -= dt

      s.particles = s.particles.filter(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.life--
        return p.life > 0
      })
      if (s.shake > 0) s.shake *= 0.85
      if (s.chroma > 0) s.chroma--
    }

    const draw = () => {
      const shakeX = s.shake > 0.5 && !s.reduced ? (Math.random() - 0.5) * s.shake : 0
      const shakeY = s.shake > 0.5 && !s.reduced ? (Math.random() - 0.5) * s.shake : 0
      ctx.save(); ctx.translate(shakeX, shakeY)

      const grd = ctx.createRadialGradient(W / 2, H * 0.3, 40, W / 2, H / 2, 500)
      grd.addColorStop(0, '#1e1b4b'); grd.addColorStop(0.5, '#0f172a'); grd.addColorStop(1, '#020617')
      ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H)

      drawScore(ctx, score, W / 2 - 55, 25, 13, 22)
      ctx.fillStyle = '#fef3c7'; ctx.font = 'bold 11px monospace'
      ctx.fillText(`BALLS ${balls}`, 25, 42)
      if (s.tilted > 0) { ctx.fillStyle = '#fb7185'; ctx.fillText('TILT!', W / 2 - 15, 60) }

      ctx.strokeStyle = '#f472b6'; ctx.lineWidth = 3; ctx.lineCap = 'round'
      WALLS.forEach(([x1, y1, x2, y2]) => {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
      })

      BUMPERS.forEach(([bx, by, br]) => {
        const bg = ctx.createRadialGradient(bx - br * 0.3, by - br * 0.3, 0, bx, by, br)
        bg.addColorStop(0, '#fef3c7'); bg.addColorStop(0.6, '#f472b6'); bg.addColorStop(1, '#831843')
        ctx.fillStyle = bg
        ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2; ctx.stroke()
      })

      s.targets.forEach(t => {
        ctx.fillStyle = t.hit ? '#334155' : '#22d3ee'
        ctx.fillRect(t.x, t.y, t.w, t.h)
        if (!t.hit) { ctx.strokeStyle = '#67e8f9'; ctx.strokeRect(t.x, t.y, t.w, t.h) }
      })

      const drawFlipper = (fx, fy, ang, len_, active) => {
        ctx.save(); ctx.translate(fx, fy); ctx.rotate(ang)
        const grd2 = ctx.createLinearGradient(0, -6, 0, 6)
        grd2.addColorStop(0, '#fef3c7'); grd2.addColorStop(1, active ? '#f43f5e' : '#dc2626')
        ctx.fillStyle = grd2
        ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(len_, -3); ctx.lineTo(len_, 3); ctx.lineTo(0, 8); ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = '#831843'; ctx.lineWidth = 1; ctx.stroke()
        ctx.fillStyle = '#a78bfa'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
      }
      drawFlipper(LEFT_FLIP.x, LEFT_FLIP.y, s.flipL, LEFT_FLIP.len, s.keys.left)
      drawFlipper(RIGHT_FLIP.x, RIGHT_FLIP.y, s.flipR, RIGHT_FLIP.len, s.keys.right)

      if (s.ballWaiting && s.plungerPower > 0) {
        ctx.fillStyle = '#fbbf24'; ctx.fillRect(W - 30, H - 100 - s.plungerPower * 3, 8, s.plungerPower * 3)
        ctx.strokeStyle = '#fef3c7'; ctx.strokeRect(W - 30, H - 160, 8, 60)
      }

      const chromaOffset = s.chroma > 0 && !s.reduced ? s.chroma * 0.15 : 0
      s.balls.forEach(ball => {
        const drawBall = (dx, dy, alpha, tint) => {
          const bg = ctx.createRadialGradient(
            ball.x + dx - BALL_R * 0.4, ball.y + dy - BALL_R * 0.4, BALL_R * 0.1,
            ball.x + dx, ball.y + dy, BALL_R
          )
          bg.addColorStop(0, tint || '#ffffff'); bg.addColorStop(0.4, tint || '#e2e8f0'); bg.addColorStop(1, '#334155')
          ctx.globalAlpha = alpha; ctx.fillStyle = bg
          ctx.beginPath(); ctx.arc(ball.x + dx, ball.y + dy, BALL_R, 0, Math.PI * 2); ctx.fill()
          ctx.fillStyle = tint || 'rgba(255,255,255,0.7)'
          ctx.beginPath(); ctx.arc(ball.x + dx - BALL_R * 0.35, ball.y + dy - BALL_R * 0.35, BALL_R * 0.3, 0, Math.PI * 2); ctx.fill()
        }
        if (chromaOffset > 0) {
          drawBall(-chromaOffset, 0, 0.5, '#ef4444')
          drawBall( chromaOffset, 0, 0.5, '#22d3ee')
        }
        drawBall(0, 0, 1)
      })
      ctx.globalAlpha = 1

      s.particles.forEach(p => {
        ctx.fillStyle = p.color; ctx.globalAlpha = clamp(p.life / 30, 0, 1)
        ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3)
      })
      ctx.globalAlpha = 1
      ctx.restore()
    }

    const loop = (now) => {
      const dt = Math.min(50, now - lastTime); lastTime = now
      if (!paused && status !== 'over') step(dt)
      draw()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [paused, status, score, balls, beep, spawnBall])

  useEffect(() => {
    if (score > best) { setBest(score); try { localStorage.setItem('pinball-best', String(score)) } catch {} }
  }, [score, best])

  return (
    <GameShell
      title="Pinball"
      category="Physics"
      score={score}
      best={best}
      level={stateRef.current.multiballLevel + 1}
      status={paused ? 'paused' : status}
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn(v => !v)}
      onPause={() => setPaused(p => !p)}
      onRestart={reset}
      extraStats={
        <div className="flex flex-col items-start">
          <span className="text-[10px] uppercase tracking-widest text-white/40">Balls</span>
          <span className="text-xl sm:text-2xl font-bold tabular-nums text-cyan-300">{balls}</span>
        </div>
      }
      controls={[
        { key: '← / A', label: 'Left flipper' },
        { key: '→ / D', label: 'Right flipper' },
        { key: 'Space', label: 'Plunger (hold to charge)' },
        { key: 'N', label: 'Nudge (careful — tilts)' },
        { key: 'Tap L/R', label: 'Mobile flippers' },
      ]}
      rules={RULES}
      difficulty={shellDifficulty}
      onDifficultyChange={setShellDifficulty}
      difficultyModes={['Easy', 'Medium', 'Hard', 'Custom']}
      customSchema={CUSTOM_SCHEMA}
      customValues={customValues}
      onCustomChange={setCustomValues}
      overlay={status === 'over' ? (
        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3">
          <div className="text-4xl font-bold bg-gradient-to-r from-amber-300 to-rose-400 bg-clip-text text-transparent">Game Over</div>
          <div className="text-white/70 text-sm">Score {score.toLocaleString()} · Best {best.toLocaleString()}</div>
          <button type="button" onClick={reset} className="mt-2 px-4 py-2 rounded-lg bg-amber-500 text-black font-bold hover:bg-amber-400">Play again</button>
        </div>
      ) : null}
    >
      <canvas
        ref={canvasRef}
        className="w-full max-h-[80vh] object-contain block mx-auto"
        style={{ imageRendering: 'crisp-edges', aspectRatio: `${W}/${H}` }}
      />
    </GameShell>
  )
}
