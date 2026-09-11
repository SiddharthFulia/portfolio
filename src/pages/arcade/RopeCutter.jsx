// RopeCutter.jsx — verlet rope physics, swipe to cut. 15 puzzle levels.
//
// Physics approach: Verlet integration.
//   - Each rope is a chain of point-particles connected by distance constraints.
//   - Verlet position update: new = pos + (pos - prev) * damping + accel
//     (no explicit velocity — implicit from position history).
//   - Distance constraints solved iteratively (4 iterations/frame) by
//     projecting each constrained pair back to rest length.
//   - Anchor particles have inv-mass 0 → they don't move.
//   - Candy is attached to the rope's tail; monster below waits for it.
//   - Stars are collectibles the candy passes through.
//   - Bubbles rise, capturing the candy and floating it up until popped.

import { useEffect, useRef, useState, useCallback } from 'react'
import GameShell from '../../components/arcade/GameShell'

const W = 600
const H = 500
const GRAVITY = 0.35
const DAMPING = 0.99
const AIR = 0.995
const CONSTRAINT_ITER = 6
const CANDY_R = 14

const mkParticle = (x, y, pinned = false) => ({
  x, y, px: x, py: y, pinned, inv: pinned ? 0 : 1,
})

const mkConstraint = (a, b, restOverride = null) => ({
  a, b, rest: restOverride !== null ? restOverride : Math.hypot(a.x - b.x, a.y - b.y), cut: false,
})

// ── Levels ──────────────────────────────────────────────────────────────────
// Each level: { ropes: [{ anchor: [x,y], length: n, spacing: 20, angle: deg }],
//               monster: [x,y], stars: [[x,y], ...], bubbles: [[x,y,r], ...] }
const LEVELS = Array.from({ length: 15 }, (_, i) => {
  const seed = i * 7 + 3
  const rand = (n) => ((Math.sin(seed + n) + 1) / 2)
  const ropes = []
  const numRopes = 1 + (i % 3)
  for (let r = 0; r < numRopes; r++) {
    const anchorX = 100 + rand(r) * (W - 200)
    const anchorY = 40 + rand(r + 10) * 100
    ropes.push({
      anchor: [anchorX, anchorY],
      length: 6 + Math.floor(rand(r + 20) * 6),
      spacing: 15,
    })
  }
  // Monster position
  const monster = [W / 2, H - 60]
  // Stars: 3 per level in random-ish positions
  const stars = []
  for (let s = 0; s < 3; s++) {
    stars.push([
      100 + rand(s + 100) * (W - 200),
      160 + rand(s + 200) * (H - 260),
    ])
  }
  // Bubbles: harder levels get more
  const bubbles = []
  if (i >= 3) {
    const nBub = Math.min(3, Math.floor(i / 3))
    for (let b = 0; b < nBub; b++) {
      bubbles.push([100 + rand(b + 300) * (W - 200), 100 + rand(b + 400) * (H - 200), 30])
    }
  }
  return { ropes, monster, stars, bubbles }
})

const distSegPoint = (x1, y1, x2, y2, px, py) => {
  const dx = x2 - x1, dy = y2 - y1
  const len2 = dx * dx + dy * dy
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2)) : 0
  const cx = x1 + t * dx, cy = y1 + t * dy
  return Math.hypot(cx - px, cy - py)
}

export default function RopeCutter() {
  const canvasRef = useRef(null)
  const stateRef = useRef({
    particles: [],
    constraints: [],
    candy: null,
    monster: [0, 0],
    stars: [],
    bubbles: [],
    swipe: null,
    cutTrail: [],
    particlesFx: [],
    reduced: false,
    shake: 0,
    holed: false,
    monsterMouthOpen: 0,
    starsCollected: 0,
    won: false,
  })

  const [level, setLevel] = useState(0)
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(0)
  const [status, setStatus] = useState('playing')
  const [paused, setPaused] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const [stars, setStars] = useState(0)

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

  useEffect(() => {
    try { const b = +(localStorage.getItem('rope-best') || 0); if (b) setBest(b) } catch {}
  }, [])

  const loadLevel = useCallback((idx) => {
    const s = stateRef.current
    const L = LEVELS[idx]
    s.particles = []
    s.constraints = []
    // Create candy first — shared by all ropes
    const candy = mkParticle(W / 2, H / 2)
    s.candy = candy
    s.particles.push(candy)
    // Build each rope, tail attached to candy
    L.ropes.forEach(r => {
      const anchor = mkParticle(r.anchor[0], r.anchor[1], true)
      s.particles.push(anchor)
      let prev = anchor
      const chain = []
      for (let i = 1; i <= r.length; i++) {
        const px = r.anchor[0] + (candy.x - r.anchor[0]) * (i / r.length)
        const py = r.anchor[1] + (candy.y - r.anchor[1]) * (i / r.length)
        const p = mkParticle(px, py)
        s.particles.push(p)
        chain.push(p)
        s.constraints.push(mkConstraint(prev, p, r.spacing))
        prev = p
      }
      // Attach last to candy
      s.constraints.push(mkConstraint(prev, candy, r.spacing))
    })
    s.monster = [...L.monster]
    s.stars = L.stars.map(([x, y]) => ({ x, y, taken: false }))
    s.bubbles = L.bubbles.map(([x, y, r]) => ({ x, y, r, active: true, holding: false }))
    s.starsCollected = 0
    s.holed = false
    s.won = false
    s.monsterMouthOpen = 0
    setLevel(idx)
    setStars(0)
  }, [])

  const reset = useCallback(() => {
    setScore(0)
    setStatus('playing')
    loadLevel(0)
  }, [loadLevel])

  useEffect(() => { reset() }, [reset])

  // Swipe / cut input
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
    const down = (e) => {
      e.preventDefault()
      const [x, y] = getPt(e)
      s.swipe = { x, y, prevX: x, prevY: y }
      s.cutTrail = [{ x, y, life: 15 }]
    }
    const move = (e) => {
      if (!s.swipe) return
      e.preventDefault()
      const [x, y] = getPt(e)
      const px = s.swipe.x, py = s.swipe.y
      s.swipe.prevX = px; s.swipe.prevY = py
      s.swipe.x = x; s.swipe.y = y
      s.cutTrail.push({ x, y, life: 15 })
      if (s.cutTrail.length > 20) s.cutTrail.shift()
      // Try cut any constraint intersecting this swipe segment
      s.constraints.forEach(c => {
        if (c.cut) return
        const d = distSegPoint(px, py, x, y, (c.a.x + c.b.x) / 2, (c.a.y + c.b.y) / 2)
        // Better: proper seg-seg. Use approx: if any midpoint close.
        // Do a proper seg-seg test.
        const seg1 = [px, py, x, y]
        const seg2 = [c.a.x, c.a.y, c.b.x, c.b.y]
        if (segIntersect(seg1, seg2)) {
          c.cut = true
          beep(600 + Math.random() * 200, 0.05, 'triangle', 0.05)
        }
      })
      // Pop bubbles the swipe passes through
      s.bubbles.forEach(b => {
        if (!b.active) return
        if (Math.hypot(b.x - x, b.y - y) < b.r) {
          b.active = false
          b.holding = false
          addFx(b.x, b.y, 15, '#67e8f9')
          beep(880, 0.1, 'triangle', 0.05)
        }
      })
    }
    const up = () => { s.swipe = null }
    const segIntersect = (s1, s2) => {
      const [ax, ay, bx, by] = s1
      const [cx, cy, dx, dy] = s2
      const denom = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx)
      if (Math.abs(denom) < 0.0001) return false
      const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / denom
      const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / denom
      return t >= 0 && t <= 1 && u >= 0 && u <= 1
    }
    const addFx = (x, y, n, color) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        const sp = 1 + Math.random() * 3
        s.particlesFx.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 25, color })
      }
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
    let raf, last = performance.now()
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')
    const s = stateRef.current
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    s.reduced = mq.matches

    const addFx = (x, y, n, color) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        const sp = 1 + Math.random() * 3
        s.particlesFx.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 25, color })
      }
    }

    const step = () => {
      // Verlet integration
      s.particles.forEach(p => {
        if (p.pinned) return
        const vx = (p.x - p.px) * DAMPING * AIR
        const vy = (p.y - p.py) * DAMPING * AIR
        p.px = p.x; p.py = p.y
        p.x += vx
        p.y += vy + GRAVITY
      })

      // Bubble mechanic: if candy is inside an active bubble, mark holding.
      // Bubbles rise, dragging candy up.
      const candy = s.candy
      s.bubbles.forEach(b => {
        if (!b.active) return
        const d = Math.hypot(candy.x - b.x, candy.y - b.y)
        if (d < b.r && !b.holding) {
          // Only attach if no other bubble already holds
          if (!s.bubbles.some(o => o.holding)) b.holding = true
        }
        if (b.holding) {
          // Move bubble up, drag candy
          b.y -= 0.8
          candy.px = candy.x
          candy.py = candy.y
          candy.x = b.x
          candy.y = b.y
          if (b.y < 30) b.active = false
        }
      })

      // Constraint solve (Verlet distance constraints)
      for (let iter = 0; iter < CONSTRAINT_ITER; iter++) {
        s.constraints.forEach(c => {
          if (c.cut) return
          const dx = c.b.x - c.a.x, dy = c.b.y - c.a.y
          const d = Math.hypot(dx, dy) || 0.001
          const diff = (d - c.rest) / d
          const invA = c.a.pinned ? 0 : 1
          const invB = c.b.pinned ? 0 : 1
          const total = invA + invB
          if (total === 0) return
          const kx = dx * 0.5 * diff
          const ky = dy * 0.5 * diff
          c.a.x += kx * (invA / total) * 2
          c.a.y += ky * (invA / total) * 2
          c.b.x -= kx * (invB / total) * 2
          c.b.y -= ky * (invB / total) * 2
        })
      }

      // Bounds
      s.particles.forEach(p => {
        if (p.pinned) return
        if (p.x < 0) { p.x = 0; p.px = p.x + 1 }
        if (p.x > W) { p.x = W; p.px = p.x - 1 }
      })

      // Stars: check candy overlap
      s.stars.forEach(st => {
        if (st.taken) return
        if (Math.hypot(candy.x - st.x, candy.y - st.y) < CANDY_R + 12) {
          st.taken = true
          s.starsCollected++
          setStars(sc => sc + 1)
          setScore(sc => sc + 500)
          addFx(st.x, st.y, 15, '#fbbf24')
          beep(1200, 0.15, 'triangle', 0.06)
        }
      })

      // Monster catch (candy falls into mouth)
      const [mx, my] = s.monster
      if (Math.hypot(candy.x - mx, candy.y - my) < 30 && !s.holed) {
        s.holed = true
        s.monsterMouthOpen = 20
        addFx(mx, my, 20, '#fb923c')
        if (!s.reduced) s.shake = 8
        beep(400, 0.3, 'sawtooth', 0.08)
        setScore(sc => sc + 1000 + s.starsCollected * 500)
        setTimeout(() => {
          if (level + 1 >= LEVELS.length) {
            setStatus('won')
            setScore(sc => {
              if (sc > best) { setBest(sc); try { localStorage.setItem('rope-best', String(sc)) } catch {} }
              return sc
            })
          } else {
            loadLevel(level + 1)
          }
        }, 1000)
      }

      // Failure: candy off screen without being caught
      if (candy.y > H + 60 && !s.holed) {
        setStatus('over')
      }

      // Cut trail decay
      s.cutTrail = s.cutTrail.filter(t => { t.life--; return t.life > 0 })

      // Fx particles
      s.particlesFx = s.particlesFx.filter(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life--
        return p.life > 0
      })

      if (s.shake > 0) s.shake *= 0.87
      if (s.monsterMouthOpen > 0) s.monsterMouthOpen--
    }

    // Bezier-smoothed rope render helper
    const drawRope = (points) => {
      if (points.length < 2) return
      ctx.beginPath()
      ctx.moveTo(points[0].x, points[0].y)
      for (let i = 1; i < points.length - 1; i++) {
        const p = points[i], n = points[i + 1]
        const cx = (p.x + n.x) / 2, cy = (p.y + n.y) / 2
        ctx.quadraticCurveTo(p.x, p.y, cx, cy)
      }
      ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y)
      ctx.stroke()
    }

    const draw = () => {
      const shakeX = s.shake > 0.5 && !s.reduced ? (Math.random() - 0.5) * s.shake : 0
      const shakeY = s.shake > 0.5 && !s.reduced ? (Math.random() - 0.5) * s.shake : 0
      ctx.save(); ctx.translate(shakeX, shakeY)

      // Background
      const bg = ctx.createLinearGradient(0, 0, 0, H)
      bg.addColorStop(0, '#312e81'); bg.addColorStop(1, '#1e1b4b')
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)

      // Wood plank ceiling
      ctx.fillStyle = '#78350f'
      ctx.fillRect(0, 0, W, 25)
      ctx.fillStyle = '#451a03'
      for (let x = 0; x < W; x += 30) ctx.fillRect(x, 5, 1, 15)

      // Group constraints by rope (by tracing from anchors)
      // Simpler: draw each constraint as a curve; group consecutive
      // constraints sharing endpoints into a smooth curve
      const visited = new Set()
      s.constraints.forEach(c => {
        if (c.cut || visited.has(c)) return
        // Walk chain: from anchor along particles
        // Find start (a is pinned or has no incoming)
        let start = c
        // Not necessary to fully walk — draw each segment.
        // But we want the smooth curve. Since ropes were built sequentially
        // in the s.particles array we can just iterate constraints in order
        // per rope. Instead do a simple approach: draw as thin lines with
        // brown color; then draw each particle as a small circle.
      })

      // Draw constraints (rope segments)
      ctx.strokeStyle = '#a16207'
      ctx.lineWidth = 3.5
      ctx.lineCap = 'round'
      s.constraints.forEach(c => {
        if (c.cut) return
        ctx.beginPath()
        ctx.moveTo(c.a.x, c.a.y)
        ctx.lineTo(c.b.x, c.b.y)
        ctx.stroke()
      })
      // Highlight strand
      ctx.strokeStyle = '#fbbf24'
      ctx.lineWidth = 1
      s.constraints.forEach(c => {
        if (c.cut) return
        ctx.beginPath()
        ctx.moveTo(c.a.x, c.a.y)
        ctx.lineTo(c.b.x, c.b.y)
        ctx.stroke()
      })

      // Anchor pins
      s.particles.forEach(p => {
        if (!p.pinned) return
        ctx.fillStyle = '#a3a3a3'
        ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = '#3f3f46'; ctx.lineWidth = 1; ctx.stroke()
      })

      // Stars
      s.stars.forEach(st => {
        if (st.taken) return
        ctx.save(); ctx.translate(st.x, st.y)
        const pts = 5, outer = 12, inner = 6
        ctx.beginPath()
        for (let i = 0; i < pts * 2; i++) {
          const r = i % 2 === 0 ? outer : inner
          const a = -Math.PI / 2 + (i / (pts * 2)) * Math.PI * 2
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
        }
        ctx.closePath()
        ctx.fillStyle = '#facc15'; ctx.fill()
        ctx.strokeStyle = '#a16207'; ctx.lineWidth = 1.5; ctx.stroke()
        ctx.restore()
      })

      // Bubbles
      s.bubbles.forEach(b => {
        if (!b.active) return
        const bg2 = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, 0, b.x, b.y, b.r)
        bg2.addColorStop(0, 'rgba(255,255,255,0.6)')
        bg2.addColorStop(0.7, 'rgba(103,232,249,0.3)')
        bg2.addColorStop(1, 'rgba(6,182,212,0.5)')
        ctx.fillStyle = bg2
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2; ctx.stroke()
        // Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.8)'
        ctx.beginPath(); ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.35, b.r * 0.25, 0, Math.PI * 2); ctx.fill()
      })

      // Candy (donut-ish)
      const candy = s.candy
      if (candy) {
        const c1 = ctx.createRadialGradient(candy.x - 3, candy.y - 3, 2, candy.x, candy.y, CANDY_R)
        c1.addColorStop(0, '#fca5a5'); c1.addColorStop(0.6, '#ef4444'); c1.addColorStop(1, '#7f1d1d')
        ctx.fillStyle = c1
        ctx.beginPath(); ctx.arc(candy.x, candy.y, CANDY_R, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.beginPath(); ctx.arc(candy.x, candy.y, CANDY_R * 0.4, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#f97316'
        for (let i = 0; i < 5; i++) {
          const a = i * (Math.PI * 2 / 5) + candy.x * 0.02
          ctx.beginPath()
          ctx.arc(candy.x + Math.cos(a) * CANDY_R * 0.7, candy.y + Math.sin(a) * CANDY_R * 0.7, 2, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // Monster (bottom)
      const [mx, my] = s.monster
      const mouth = 8 + s.monsterMouthOpen
      // Body
      const mg = ctx.createRadialGradient(mx - 15, my - 15, 5, mx, my, 40)
      mg.addColorStop(0, '#a3e635'); mg.addColorStop(1, '#365314')
      ctx.fillStyle = mg
      ctx.beginPath(); ctx.arc(mx, my, 40, 0, Math.PI * 2); ctx.fill()
      // Eyes
      ctx.fillStyle = '#fff'
      ctx.beginPath(); ctx.arc(mx - 15, my - 15, 8, 0, Math.PI * 2); ctx.arc(mx + 15, my - 15, 8, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#000'
      ctx.beginPath(); ctx.arc(mx - 13, my - 13, 3, 0, Math.PI * 2); ctx.arc(mx + 17, my - 13, 3, 0, Math.PI * 2); ctx.fill()
      // Mouth
      ctx.fillStyle = '#7c2d12'
      ctx.beginPath(); ctx.ellipse(mx, my + 10, 20, mouth, 0, 0, Math.PI * 2); ctx.fill()
      // Teeth
      ctx.fillStyle = '#fff'
      for (let t = -12; t <= 12; t += 6) {
        ctx.beginPath()
        ctx.moveTo(mx + t, my + 10 - mouth * 0.7)
        ctx.lineTo(mx + t + 2, my + 10 - mouth * 0.4)
        ctx.lineTo(mx + t - 2, my + 10 - mouth * 0.4)
        ctx.closePath(); ctx.fill()
      }

      // Cut trail
      if (s.cutTrail.length > 1) {
        ctx.strokeStyle = 'rgba(251,191,36,0.7)'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(s.cutTrail[0].x, s.cutTrail[0].y)
        s.cutTrail.forEach(t => ctx.lineTo(t.x, t.y))
        ctx.stroke()
      }

      // Fx
      s.particlesFx.forEach(p => {
        ctx.fillStyle = p.color; ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 25))
        ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill()
      })
      ctx.globalAlpha = 1

      // HUD
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, 26)
      ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 13px monospace'
      ctx.fillText(`LEVEL ${level + 1}/15  ·  STARS ${stars}/3  ·  SCORE ${score}`, 10, 18)

      ctx.restore()
    }

    const loop = () => {
      if (!paused && status === 'playing') step()
      draw()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [paused, status, level, score, best, stars, loadLevel, beep])

  return (
    <GameShell
      title="Rope Cutter"
      category="Physics"
      score={score}
      best={best}
      level={level + 1}
      status={paused ? 'paused' : status}
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn(v => !v)}
      onPause={() => setPaused(p => !p)}
      onRestart={reset}
      extraStats={
        <div className="flex flex-col items-start">
          <span className="text-[10px] uppercase tracking-widest text-white/40">Stars</span>
          <span className="text-xl sm:text-2xl font-bold tabular-nums text-amber-300">{stars}/3</span>
        </div>
      }
      controls={[
        { key: 'Swipe', label: 'Cut a rope' },
        { key: 'Swipe bubble', label: 'Pop it' },
        { key: 'Goal', label: 'Feed candy to the monster' },
      ]}
      overlay={status === 'won' ? (
        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3">
          <div className="text-4xl font-bold bg-gradient-to-r from-amber-300 to-rose-400 bg-clip-text text-transparent">Monster is full!</div>
          <div className="text-white/70 text-sm">Final score {score.toLocaleString()}</div>
          <button type="button" onClick={reset} className="mt-2 px-4 py-2 rounded-lg bg-amber-500 text-black font-bold hover:bg-amber-400">Play again</button>
        </div>
      ) : status === 'over' ? (
        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3">
          <div className="text-4xl font-bold text-rose-300">Candy lost!</div>
          <div className="text-white/70 text-sm">Score {score.toLocaleString()}</div>
          <button type="button" onClick={() => loadLevel(level)} className="mt-2 px-4 py-2 rounded-lg bg-amber-500 text-black font-bold hover:bg-amber-400">Retry level</button>
        </div>
      ) : null}
    >
      <canvas
        ref={canvasRef}
        className="w-full max-h-[80vh] object-contain block mx-auto"
        style={{ imageRendering: 'crisp-edges', aspectRatio: `${W}/${H}`, touchAction: 'none' }}
      />
    </GameShell>
  )
}
