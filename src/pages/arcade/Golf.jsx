// Golf.jsx — Mini golf, 9 unique holes, hand-rolled 2D physics.
//
// Physics approach:
//   - Ball is a point-mass on a top-down 2D plane (no gravity — friction only).
//   - Rolling friction as per-frame velocity multiplier (0.985 grass / 0.90 sand).
//   - Water hazards reset the ball to last-shot origin with +1 stroke.
//   - Walls are line segments, ball reflects with 0.85 restitution.
//   - Boulders are static circles.
//   - Wind is a constant vector per hole; adds small impulse each frame.
//
// Drag-to-aim UI: drag from ball to set direction + power. Release to strike.

import { useEffect, useRef, useState, useCallback } from 'react'
import GameShell from '../../components/arcade/GameShell'

const W = 640
const H = 420
const BALL_R = 7
const HOLE_R = 12
const FRICTION = 0.985
const SAND_FRICTION = 0.90
const MAX_POWER = 22

const HOLES = [
  {
    name: 'Fairway', par: 2,
    start: [80, H / 2], hole: [W - 80, H / 2],
    walls: [[40, 40, W - 40, 40], [40, H - 40, W - 40, H - 40], [40, 40, 40, H - 40], [W - 40, 40, W - 40, H - 40]],
    sand: [], water: [], wind: [0, 0],
  },
  {
    name: 'Dogleg', par: 3,
    start: [80, H - 100], hole: [W - 80, 100],
    walls: [
      [40, 40, W - 40, 40], [40, H - 40, W - 40, H - 40], [40, 40, 40, H - 40], [W - 40, 40, W - 40, H - 40],
      [200, 40, 200, 250], [200, 250, 400, 250], [400, 250, 400, H - 40],
    ],
    sand: [{ x: 300, y: 300, r: 40 }], water: [], wind: [0, 0],
  },
  {
    name: 'Sand Bar', par: 3,
    start: [70, H / 2], hole: [W - 80, H / 2],
    walls: [[40, 40, W - 40, 40], [40, H - 40, W - 40, H - 40], [40, 40, 40, H - 40], [W - 40, 40, W - 40, H - 40]],
    sand: [{ x: 300, y: H / 2, r: 60 }, { x: 200, y: 120, r: 40 }, { x: 450, y: 300, r: 40 }],
    water: [], wind: [0, 0],
  },
  {
    name: 'Water Crossing', par: 3,
    start: [80, H / 2], hole: [W - 80, H / 2],
    walls: [[40, 40, W - 40, 40], [40, H - 40, W - 40, H - 40], [40, 40, 40, H - 40], [W - 40, 40, W - 40, H - 40]],
    sand: [], water: [{ x: 240, y: 40, w: 160, h: H - 80 }], wind: [0, 0],
  },
  {
    name: 'Windy Coast', par: 4,
    start: [80, 100], hole: [W - 80, H - 100],
    walls: [[40, 40, W - 40, 40], [40, H - 40, W - 40, H - 40], [40, 40, 40, H - 40], [W - 40, 40, W - 40, H - 40]],
    sand: [{ x: 350, y: 200, r: 55 }],
    water: [{ x: 40, y: H - 100, w: 200, h: 60 }],
    wind: [-0.03, 0.01],
  },
  {
    name: 'Zigzag', par: 4,
    start: [80, H - 80], hole: [W - 80, 80],
    walls: [
      [40, 40, W - 40, 40], [40, H - 40, W - 40, H - 40], [40, 40, 40, H - 40], [W - 40, 40, W - 40, H - 40],
      [150, 40, 150, 260], [280, H - 40, 280, 160], [420, 40, 420, 260], [520, H - 40, 520, 160],
    ],
    sand: [], water: [], wind: [0, 0],
  },
  {
    name: 'Island Green', par: 3,
    start: [80, H / 2], hole: [W - 100, H / 2],
    walls: [[40, 40, W - 40, 40], [40, H - 40, W - 40, H - 40], [40, 40, 40, H - 40], [W - 40, 40, W - 40, H - 40]],
    sand: [],
    water: [{ x: 250, y: 40, w: 250, h: 130 }, { x: 250, y: H - 170, w: 250, h: 130 }],
    wind: [0.02, 0],
  },
  {
    name: 'Boulder Alley', par: 4,
    start: [80, H / 2], hole: [W - 80, H / 2],
    walls: [[40, 40, W - 40, 40], [40, H - 40, W - 40, H - 40], [40, 40, 40, H - 40], [W - 40, 40, W - 40, H - 40]],
    sand: [{ x: 500, y: 100, r: 30 }, { x: 500, y: H - 100, r: 30 }],
    water: [], wind: [0, 0],
    boulders: [
      { x: 220, y: 180, r: 22 }, { x: 330, y: 240, r: 22 }, { x: 440, y: 180, r: 22 },
      { x: 280, y: 100, r: 18 }, { x: 400, y: H - 100, r: 18 },
    ],
  },
  {
    name: 'Final Green', par: 5,
    start: [80, H - 80], hole: [W - 100, 80],
    walls: [
      [40, 40, W - 40, 40], [40, H - 40, W - 40, H - 40], [40, 40, 40, H - 40], [W - 40, 40, W - 40, H - 40],
      [200, 100, 200, 300], [400, 100, 400, 300],
    ],
    sand: [{ x: 300, y: 200, r: 45 }, { x: W - 130, y: 160, r: 30 }],
    water: [{ x: 100, y: 100, w: 60, h: 200 }, { x: W - 200, y: 200, w: 60, h: 150 }],
    wind: [-0.02, -0.02],
  },
]

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

const segCircle = (x1, y1, x2, y2, cx, cy, r) => {
  const dx = x2 - x1, dy = y2 - y1
  const len2 = dx * dx + dy * dy
  const t = len2 > 0 ? clamp(((cx - x1) * dx + (cy - y1) * dy) / len2, 0, 1) : 0
  const px = x1 + t * dx, py = y1 + t * dy
  const nx = cx - px, ny = cy - py
  const d = Math.hypot(nx, ny)
  if (d < r) { const l = d || 0.0001; return [nx / l, ny / l, r - d] }
  return null
}

export default function Golf() {
  const canvasRef = useRef(null)
  const stateRef = useRef({
    holeIndex: 0,
    ball: { x: 0, y: 0, vx: 0, vy: 0 },
    lastShot: { x: 0, y: 0 },
    aiming: false, aimStart: [0, 0], aimEnd: [0, 0],
    strokes: 0, totalStrokes: 0,
    reduced: false, particles: [], shake: 0,
    holed: false, flagWave: 0,
  })

  const [holeIdx, setHoleIdx] = useState(0)
  const [strokes, setStrokes] = useState(0)
  const [totalStrokes, setTotalStrokes] = useState(0)
  const [status, setStatus] = useState('playing')
  const [paused, setPaused] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const [best, setBest] = useState(999)

  const audioRef = useRef(null)
  const beep = useCallback((f, d, t = 'sine', v = 0.05) => {
    if (!soundOn) return
    try {
      if (!audioRef.current) audioRef.current = new (window.AudioContext || window.webkitAudioContext)()
      const ctx = audioRef.current
      const osc = ctx.createOscillator(); const g = ctx.createGain()
      osc.type = t; osc.frequency.value = f
      g.gain.setValueAtTime(v, ctx.currentTime)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + d)
      osc.connect(g).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + d)
    } catch {}
  }, [soundOn])

  const loadHole = useCallback((idx) => {
    const s = stateRef.current
    const h = HOLES[idx]
    s.holeIndex = idx
    s.ball = { x: h.start[0], y: h.start[1], vx: 0, vy: 0 }
    s.lastShot = { x: h.start[0], y: h.start[1] }
    s.strokes = 0; s.holed = false
    setHoleIdx(idx); setStrokes(0)
  }, [])

  const reset = useCallback(() => {
    stateRef.current.totalStrokes = 0
    setTotalStrokes(0); setStatus('playing')
    loadHole(0)
  }, [loadHole])

  useEffect(() => { reset() }, [reset])

  useEffect(() => {
    try { const b = +(localStorage.getItem('golf-best') || 999); if (b < 999) setBest(b) } catch {}
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const s = stateRef.current
    const getPt = (e) => {
      const rect = canvas.getBoundingClientRect()
      const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left
      const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top
      return [cx / rect.width * W, cy / rect.height * H]
    }
    const isBallMoving = () => Math.hypot(s.ball.vx, s.ball.vy) > 0.1
    const down = (e) => {
      if (isBallMoving() || s.holed) return
      e.preventDefault()
      const [px, py] = getPt(e)
      if (Math.hypot(px - s.ball.x, py - s.ball.y) < 40) {
        s.aiming = true
        s.aimStart = [s.ball.x, s.ball.y]
        s.aimEnd = [px, py]
      }
    }
    const move = (e) => {
      if (!s.aiming) return
      e.preventDefault()
      s.aimEnd = getPt(e)
    }
    const up = () => {
      if (!s.aiming) return
      s.aiming = false
      const dx = s.aimStart[0] - s.aimEnd[0]
      const dy = s.aimStart[1] - s.aimEnd[1]
      const power = clamp(Math.hypot(dx, dy) / 8, 0, MAX_POWER)
      if (power < 1) return
      const ang = Math.atan2(dy, dx)
      s.ball.vx = Math.cos(ang) * power
      s.ball.vy = Math.sin(ang) * power
      s.lastShot = { x: s.ball.x, y: s.ball.y }
      s.strokes++
      setStrokes(s.strokes)
      beep(300, 0.05, 'square', 0.05)
    }
    canvas.addEventListener('mousedown', down)
    canvas.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    canvas.addEventListener('touchstart', down, { passive: false })
    canvas.addEventListener('touchmove', move, { passive: false })
    canvas.addEventListener('touchend', up)
    return () => {
      canvas.removeEventListener('mousedown', down)
      canvas.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      canvas.removeEventListener('touchstart', down)
      canvas.removeEventListener('touchmove', move)
      canvas.removeEventListener('touchend', up)
    }
  }, [beep])

  useEffect(() => {
    let raf, lastTime = performance.now()
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    canvas.width = W; canvas.height = H
    const s = stateRef.current
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    s.reduced = mq.matches

    const addParticles = (x, y, n, color) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        const sp = 1 + Math.random() * 3
        s.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 25, color })
      }
    }

    const dimples = []
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      dimples.push([Math.cos(a) * BALL_R * 0.5, Math.sin(a) * BALL_R * 0.5])
    }

    const step = () => {
      const hole = HOLES[s.holeIndex]
      const ball = s.ball
      ball.vx += hole.wind[0]; ball.vy += hole.wind[1]
      let inSand = false
      for (const sa of hole.sand) if (Math.hypot(ball.x - sa.x, ball.y - sa.y) < sa.r) { inSand = true; break }
      const fric = inSand ? SAND_FRICTION : FRICTION
      ball.vx *= fric; ball.vy *= fric
      const speed = Math.hypot(ball.vx, ball.vy)
      if (speed < 0.05) { ball.vx = 0; ball.vy = 0 }
      const subs = speed > 6 ? 3 : (speed > 2 ? 2 : 1)
      for (let sub = 0; sub < subs; sub++) {
        ball.x += ball.vx / subs; ball.y += ball.vy / subs
        for (const [x1, y1, x2, y2] of hole.walls) {
          const hit = segCircle(x1, y1, x2, y2, ball.x, ball.y, BALL_R)
          if (hit) {
            const [nx, ny, pen] = hit
            ball.x += nx * pen; ball.y += ny * pen
            const vdot = ball.vx * nx + ball.vy * ny
            if (vdot < 0) {
              ball.vx -= 1.7 * vdot * nx; ball.vy -= 1.7 * vdot * ny
              ball.vx *= 0.85; ball.vy *= 0.85
              addParticles(ball.x, ball.y, 3, '#a3e635')
              if (!s.reduced) s.shake = Math.min(s.shake + 2, 5)
              beep(200, 0.04, 'triangle', 0.04)
            }
          }
        }
        if (hole.boulders) {
          for (const b of hole.boulders) {
            const dx = ball.x - b.x, dy = ball.y - b.y
            const d = Math.hypot(dx, dy)
            if (d < b.r + BALL_R) {
              const nx = dx / (d || 1), ny = dy / (d || 1)
              const pen = b.r + BALL_R - d
              ball.x += nx * pen; ball.y += ny * pen
              const vdot = ball.vx * nx + ball.vy * ny
              if (vdot < 0) { ball.vx -= 1.7 * vdot * nx; ball.vy -= 1.7 * vdot * ny; ball.vx *= 0.85; ball.vy *= 0.85 }
              addParticles(ball.x, ball.y, 4, '#94a3b8')
            }
          }
        }
      }

      for (const w of hole.water) {
        if (ball.x > w.x && ball.x < w.x + w.w && ball.y > w.y && ball.y < w.y + w.h) {
          addParticles(ball.x, ball.y, 20, '#38bdf8')
          if (!s.reduced) s.shake = 8
          ball.x = s.lastShot.x; ball.y = s.lastShot.y
          ball.vx = 0; ball.vy = 0
          s.strokes++; setStrokes(s.strokes)
          beep(150, 0.3, 'sine', 0.06)
          break
        }
      }

      const dh = Math.hypot(ball.x - hole.hole[0], ball.y - hole.hole[1])
      if (dh < HOLE_R && speed < 6 && !s.holed) {
        s.holed = true
        s.totalStrokes += s.strokes
        setTotalStrokes(s.totalStrokes)
        addParticles(hole.hole[0], hole.hole[1], 30, '#fbbf24')
        if (!s.reduced) s.shake = 10
        beep(880, 0.2, 'triangle', 0.08)
        setTimeout(() => beep(1200, 0.15, 'triangle', 0.08), 150)
        setTimeout(() => {
          if (s.holeIndex < HOLES.length - 1) loadHole(s.holeIndex + 1)
          else {
            setStatus('won')
            if (s.totalStrokes < best) {
              setBest(s.totalStrokes)
              try { localStorage.setItem('golf-best', String(s.totalStrokes)) } catch {}
            }
          }
        }, 1200)
      }

      s.flagWave += 0.08
      s.particles = s.particles.filter(p => {
        p.x += p.vx; p.y += p.vy; p.vx *= 0.94; p.vy *= 0.94; p.life--
        return p.life > 0
      })
      if (s.shake > 0) s.shake *= 0.88
    }

    const draw = () => {
      const shakeX = s.shake > 0.5 && !s.reduced ? (Math.random() - 0.5) * s.shake : 0
      const shakeY = s.shake > 0.5 && !s.reduced ? (Math.random() - 0.5) * s.shake : 0
      ctx.save(); ctx.translate(shakeX, shakeY)
      const hole = HOLES[s.holeIndex]
      ctx.fillStyle = '#052e16'; ctx.fillRect(0, 0, W, H)
      for (let y = 40; y < H - 40; y += 12) {
        ctx.fillStyle = (Math.floor(y / 12) % 2) === 0 ? '#166534' : '#15803d'
        ctx.fillRect(40, y, W - 80, 12)
      }

      hole.water.forEach(w => {
        const grad = ctx.createLinearGradient(w.x, w.y, w.x, w.y + w.h)
        grad.addColorStop(0, '#0891b2'); grad.addColorStop(1, '#0e7490')
        ctx.fillStyle = grad; ctx.fillRect(w.x, w.y, w.w, w.h)
        ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1
        for (let ry = w.y + 10; ry < w.y + w.h; ry += 15) {
          ctx.beginPath(); ctx.moveTo(w.x + 5, ry)
          for (let rx = w.x + 5; rx < w.x + w.w - 5; rx += 8) ctx.lineTo(rx, ry + Math.sin(rx * 0.1 + s.flagWave) * 2)
          ctx.stroke()
        }
      })
      hole.sand.forEach(sa => {
        const grad = ctx.createRadialGradient(sa.x, sa.y, sa.r * 0.3, sa.x, sa.y, sa.r)
        grad.addColorStop(0, '#fef3c7'); grad.addColorStop(1, '#eab308')
        ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(sa.x, sa.y, sa.r, 0, Math.PI * 2); ctx.fill()
      })
      if (hole.boulders) hole.boulders.forEach(b => {
        ctx.fillStyle = '#475569'
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#64748b'
        ctx.beginPath(); ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.4, 0, Math.PI * 2); ctx.fill()
      })

      ctx.strokeStyle = '#78716c'; ctx.lineWidth = 6; ctx.lineCap = 'round'
      hole.walls.forEach(([x1, y1, x2, y2]) => {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
      })

      ctx.fillStyle = '#020617'
      ctx.beginPath(); ctx.arc(hole.hole[0], hole.hole[1], HOLE_R, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke()
      const flagSway = Math.sin(s.flagWave) * 5 + hole.wind[0] * 100
      ctx.strokeStyle = '#f1f5f9'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(hole.hole[0], hole.hole[1])
      ctx.lineTo(hole.hole[0] + flagSway * 0.2, hole.hole[1] - 40); ctx.stroke()
      ctx.fillStyle = '#ef4444'
      ctx.beginPath()
      ctx.moveTo(hole.hole[0] + flagSway * 0.2, hole.hole[1] - 40)
      ctx.lineTo(hole.hole[0] + flagSway * 0.2 + 20, hole.hole[1] - 35)
      ctx.lineTo(hole.hole[0] + flagSway * 0.2, hole.hole[1] - 30)
      ctx.closePath(); ctx.fill()

      if (hole.wind[0] !== 0 || hole.wind[1] !== 0) {
        const wx = W - 60, wy = 60
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = 'bold 9px monospace'
        ctx.fillText('WIND', wx - 10, wy - 20)
        ctx.strokeStyle = '#a3e635'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + hole.wind[0] * 500, wy + hole.wind[1] * 500); ctx.stroke()
      }

      if (s.aiming) {
        const dx = s.aimStart[0] - s.aimEnd[0], dy = s.aimStart[1] - s.aimEnd[1]
        const power = clamp(Math.hypot(dx, dy) / 8, 0, MAX_POWER)
        const pct = power / MAX_POWER
        ctx.strokeStyle = `rgba(251,191,36,${0.4 + pct * 0.5})`
        ctx.lineWidth = 2
        ctx.setLineDash([4, 4])
        ctx.beginPath(); ctx.moveTo(s.ball.x, s.ball.y); ctx.lineTo(s.ball.x + dx * 2, s.ball.y + dy * 2); ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = '#0f172a'; ctx.fillRect(20, H - 30, 200, 10)
        ctx.fillStyle = pct > 0.7 ? '#ef4444' : (pct > 0.4 ? '#fbbf24' : '#22c55e')
        ctx.fillRect(20, H - 30, 200 * pct, 10)
        ctx.strokeStyle = '#fff'; ctx.strokeRect(20, H - 30, 200, 10)
      }

      const bx = s.ball.x, by = s.ball.y
      const grad = ctx.createRadialGradient(bx - 2, by - 2, 1, bx, by, BALL_R)
      grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#94a3b8')
      ctx.fillStyle = grad
      ctx.beginPath(); ctx.arc(bx, by, BALL_R, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = 'rgba(0,0,0,0.15)'
      dimples.forEach(([dx, dy]) => {
        ctx.beginPath(); ctx.arc(bx + dx * 0.7, by + dy * 0.7, 1.2, 0, Math.PI * 2); ctx.fill()
      })

      s.particles.forEach(p => {
        ctx.fillStyle = p.color; ctx.globalAlpha = clamp(p.life / 25, 0, 1)
        ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3)
      })
      ctx.globalAlpha = 1

      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, 30)
      ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 14px monospace'
      ctx.fillText(`HOLE ${s.holeIndex + 1}/9 · ${HOLES[s.holeIndex].name}`, 12, 20)
      ctx.fillStyle = '#fff'
      ctx.fillText(`PAR ${HOLES[s.holeIndex].par}  STROKES ${s.strokes}  TOTAL ${s.totalStrokes}`, W - 340, 20)
      ctx.restore()
    }

    const loop = () => {
      if (!paused && status === 'playing') step()
      draw()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [paused, status, best, loadHole, beep])

  return (
    <GameShell
      title="Mini Golf"
      category="Physics"
      score={0}
      best={best === 999 ? 0 : best}
      level={holeIdx + 1}
      status={paused ? 'paused' : status}
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn(v => !v)}
      onPause={() => setPaused(p => !p)}
      onRestart={reset}
      extraStats={
        <>
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Par</span>
            <span className="text-xl sm:text-2xl font-bold tabular-nums text-emerald-300">{HOLES[holeIdx].par}</span>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Strokes</span>
            <span className="text-xl sm:text-2xl font-bold tabular-nums text-amber-300">{strokes}</span>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Total</span>
            <span className="text-xl sm:text-2xl font-bold tabular-nums text-rose-300">{totalStrokes}</span>
          </div>
        </>
      }
      controls={[
        { key: 'Drag from ball', label: 'Pull back to aim + power' },
        { key: 'Release', label: 'Strike ball' },
        { key: 'Touch', label: 'Drag on mobile' },
      ]}
      overlay={status === 'won' ? (
        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3">
          <div className="text-4xl font-bold bg-gradient-to-r from-amber-300 to-rose-400 bg-clip-text text-transparent">Tournament complete!</div>
          <div className="text-white/70 text-sm">Total {totalStrokes} strokes · Best {best === 999 ? '—' : best}</div>
          <button type="button" onClick={reset} className="mt-2 px-4 py-2 rounded-lg bg-amber-500 text-black font-bold hover:bg-amber-400">Play again</button>
        </div>
      ) : null}
    >
      <canvas
        ref={canvasRef}
        className="w-full max-h-[80vh] object-contain bg-emerald-950 block mx-auto"
        style={{ imageRendering: 'crisp-edges', aspectRatio: `${W}/${H}`, touchAction: 'none' }}
      />
    </GameShell>
  )
}
