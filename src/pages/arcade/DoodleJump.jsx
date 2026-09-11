// DoodleJump — auto-jump vertical runner.
//
// Doodle is a green humanoid with big goggle eyes and a squash / stretch
// on jump apex. Platforms come in five flavours: static (green), moving
// (blue, ping-pong), breakable (grey, one-hit), spring (yellow, boost),
// cloud (white, disappears after one landing). Power-ups: rocket,
// propeller hat, jetpack — each different duration. Monster obstacles
// wander on some platforms; jump on the head to kill (bonus points),
// touch from side / below and you die.
//
// World is procedurally seeded (mulberry32) with progressive difficulty:
// platforms sparser and higher gaps as height climbs. Best score
// (max height in metres) stored under `arcade.doodle.best`.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GameShell from '../../components/arcade/GameShell'
import { getSfx } from '../../components/arcade/sfx'

const BEST_KEY = 'arcade.doodle.best'
const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const LOGICAL_W = 400
const LOGICAL_H = 600
const GRAV = 900
const JUMP_V = -560
const SPRING_V = -960
const ROCKET_V = -720
const MOVE_SPEED = 280
const PLAT_W = 68
const PLAT_H = 14

const readBest = () => { try { return parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0 } catch { return 0 } }
const writeBest = (v) => { try { localStorage.setItem(BEST_KEY, String(v)) } catch {} }

export default function DoodleJump() {
  const canvasRef = useRef(null)
  const stateRef = useRef(null)
  const rafRef = useRef(0)
  const keysRef = useRef({ left: false, right: false })
  const tiltRef = useRef(0)
  const sfx = useMemo(() => getSfx(), [])

  const [score, setScore] = useState(0)
  const [best, setBest] = useState(readBest())
  const [status, setStatus] = useState('ready')
  const [soundOn, setSoundOn] = useState(true)
  const [gameOver, setGameOver] = useState(null)
  const [powerup, setPowerup] = useState(null)

  const reducedRef = useRef(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedRef.current = mq.matches
    const sync = () => { reducedRef.current = mq.matches }
    mq.addEventListener?.('change', sync)
    return () => mq.removeEventListener?.('change', sync)
  }, [])

  useEffect(() => { sfx.setEnabled(soundOn) }, [soundOn, sfx])

  const initWorld = useCallback((seed = (Math.random() * 0xffffffff) >>> 0) => {
    const rand = mulberry32(seed)
    const platforms = []
    platforms.push({ x: LOGICAL_W / 2 - PLAT_W / 2, y: LOGICAL_H - 80, type: 'static', dx: 0, alive: true, hit: false })
    let y = LOGICAL_H - 130
    for (let i = 0; i < 30; i++) {
      platforms.push(makePlatform(rand, y, 0))
      y -= 55 + rand() * 30
    }
    stateRef.current = {
      rand, seed,
      doodle: { x: LOGICAL_W / 2, y: LOGICAL_H - 100, vx: 0, vy: 0, dir: 1, squash: 1, powerup: null, powerT: 0 },
      platforms,
      monsters: [],
      pickups: [],
      particles: [],
      camY: 0,
      maxHeight: 0,
      score: 0,
      shake: 0,
      lastPlatY: y,
      splat: null,
      alive: true,
    }
  }, [])

  useEffect(() => { initWorld() }, [initWorld])

  const reset = useCallback(() => {
    initWorld()
    setScore(0)
    setPowerup(null)
    setGameOver(null)
    setStatus('ready')
  }, [initWorld])

  useEffect(() => {
    const onKey = (e, down) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') { keysRef.current.left = down; e.preventDefault() }
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') { keysRef.current.right = down; e.preventDefault() }
      else if (down && e.code === 'KeyP') setStatus((p) => p === 'paused' ? 'playing' : p === 'playing' ? 'paused' : p)
      else if (down && e.code === 'KeyR') reset()
      else if (down && (e.code === 'Space' || e.code === 'ArrowUp')) {
        setStatus((p) => p === 'ready' ? 'playing' : p)
      }
    }
    const dn = (e) => onKey(e, true)
    const up = (e) => onKey(e, false)
    window.addEventListener('keydown', dn)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up) }
  }, [reset])

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const onDown = (e) => {
      const rect = c.getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width
      if (x < 0.5) keysRef.current.left = true
      else keysRef.current.right = true
      setStatus((p) => p === 'ready' ? 'playing' : p)
    }
    const onUp = () => { keysRef.current.left = false; keysRef.current.right = false }
    c.addEventListener('pointerdown', onDown)
    c.addEventListener('pointerup', onUp)
    c.addEventListener('pointerleave', onUp)
    return () => { c.removeEventListener('pointerdown', onDown); c.removeEventListener('pointerup', onUp); c.removeEventListener('pointerleave', onUp) }
  }, [])

  useEffect(() => {
    const onTilt = (e) => { tiltRef.current = Math.max(-1, Math.min(1, (e.gamma || 0) / 30)) }
    window.addEventListener('deviceorientation', onTilt)
    return () => window.removeEventListener('deviceorientation', onTilt)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
    }
    resize()
    const ro = new ResizeObserver(resize); ro.observe(canvas)
    let last = performance.now()

    const step = (t) => {
      const dt = Math.min(0.033, (t - last) / 1000); last = t
      const s = stateRef.current
      if (!s) { rafRef.current = requestAnimationFrame(step); return }
      if (status === 'playing') update(s, dt)
      draw(ctx, canvas, s, status, reducedRef.current)
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect() }
  }, [status])

  const update = useCallback((s, dt) => {
    const d = s.doodle
    const kb = keysRef.current
    const targetVx = ((kb.left ? -1 : 0) + (kb.right ? 1 : 0) + tiltRef.current) * MOVE_SPEED
    d.vx = targetVx

    if (d.powerup === 'rocket')        d.vy = ROCKET_V
    else if (d.powerup === 'jetpack')  d.vy = -900
    else if (d.powerup === 'propeller') d.vy = Math.min(d.vy, -400)
    else d.vy = Math.min(1400, d.vy + GRAV * dt)

    d.x += d.vx * dt
    d.y += d.vy * dt

    if (d.x < -20) d.x = LOGICAL_W + 20
    if (d.x > LOGICAL_W + 20) d.x = -20
    if (d.vx > 5) d.dir = 1
    else if (d.vx < -5) d.dir = -1

    const threshold = LOGICAL_H * 0.4
    if (d.y < threshold) {
      const delta = threshold - d.y
      d.y = threshold
      s.camY += delta
      s.maxHeight = Math.max(s.maxHeight, s.camY)
      const newScore = Math.floor(s.maxHeight / 10)
      if (newScore > s.score) { s.score = newScore; setScore(newScore) }
      for (const p of s.platforms) p.y += delta
      for (const m of s.monsters) m.y += delta
      for (const pu of s.pickups) pu.y += delta
      for (const q of s.particles) q.y += delta
      s.lastPlatY += delta
    }

    while (s.lastPlatY > -80) {
      const gap = 55 + s.rand() * (30 + Math.min(60, s.score * 0.5))
      s.lastPlatY -= gap
      s.platforms.push(makePlatform(s.rand, s.lastPlatY, s.score))
      if (s.rand() < 0.05 + Math.min(0.15, s.score * 0.002)) {
        s.monsters.push({ x: 40 + s.rand() * (LOGICAL_W - 80), y: s.lastPlatY - 24, r: 16, dir: s.rand() > 0.5 ? 1 : -1, phase: s.rand() * 6.28, alive: true })
      }
      if (s.rand() < 0.06) {
        const type = ['rocket', 'propeller', 'jetpack'][(s.rand() * 3) | 0]
        s.pickups.push({ x: 30 + s.rand() * (LOGICAL_W - 60), y: s.lastPlatY - 20, type, alive: true })
      }
    }

    for (const p of s.platforms) {
      if (p.type === 'moving') {
        p.x += p.dx * dt
        if (p.x < 10) { p.x = 10; p.dx = Math.abs(p.dx) }
        if (p.x + PLAT_W > LOGICAL_W - 10) { p.x = LOGICAL_W - 10 - PLAT_W; p.dx = -Math.abs(p.dx) }
      }
    }

    for (const m of s.monsters) {
      m.phase += dt * 3
      m.x += m.dir * 40 * dt
      m.y += Math.sin(m.phase) * 0.4
      if (m.x < 20 || m.x > LOGICAL_W - 20) m.dir *= -1
    }

    if (d.vy > 0 && !d.powerup) {
      for (const p of s.platforms) {
        if (!p.alive) continue
        const px = p.x, py = p.y
        if (d.x > px - 6 && d.x < px + PLAT_W + 6 && d.y > py - 6 && d.y < py + PLAT_H + 6) {
          if (p.type === 'spring') { d.vy = SPRING_V; sfx.chirp() }
          else if (p.type === 'breakable') { p.alive = false; sfx.hit() }
          else { d.vy = JUMP_V; sfx.jump() }
          if (p.type === 'cloud') p.alive = false
          d.squash = 0.55
        }
      }
    }
    d.squash = Math.min(1, d.squash + dt * 4)

    for (const m of s.monsters) {
      if (!m.alive) continue
      const dx = d.x - m.x, dy = d.y - m.y
      if (dx * dx + dy * dy < (m.r + 14) * (m.r + 14)) {
        if (d.vy > 40 && d.y < m.y - 4) {
          m.alive = false
          d.vy = JUMP_V
          s.score += 20
          setScore(s.score)
          for (let k = 0; k < 8; k++) s.particles.push({ x: m.x, y: m.y, vx: (s.rand() - 0.5) * 200, vy: -100 - s.rand() * 100, t: 0, c: '#ef4444' })
          sfx.boom()
        } else if (!d.powerup) {
          onDeath(s)
        }
      }
    }

    for (const pu of s.pickups) {
      if (!pu.alive) continue
      const dx = d.x - pu.x, dy = d.y - pu.y
      if (dx * dx + dy * dy < 26 * 26) {
        pu.alive = false
        d.powerup = pu.type
        d.powerT = pu.type === 'rocket' ? 1.8 : pu.type === 'propeller' ? 3.0 : 4.0
        setPowerup(pu.type)
        sfx.coin()
      }
    }

    if (d.powerup) {
      d.powerT -= dt
      s.particles.push({ x: d.x, y: d.y + 12, vx: (s.rand() - 0.5) * 30, vy: 60 + s.rand() * 40, t: 0, c: d.powerup === 'rocket' ? '#f97316' : d.powerup === 'jetpack' ? '#22d3ee' : '#a78bfa' })
      if (d.powerT <= 0) { d.powerup = null; setPowerup(null) }
    }

    for (const q of s.particles) { q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 200 * dt }
    s.particles = s.particles.filter((q) => q.t < 0.7)
    s.platforms = s.platforms.filter((p) => p.y < LOGICAL_H + 20)
    s.monsters  = s.monsters.filter((m) => m.alive && m.y < LOGICAL_H + 40)
    s.pickups   = s.pickups.filter((pu) => pu.alive && pu.y < LOGICAL_H + 40)

    if (d.y > LOGICAL_H + 40) onDeath(s)
    s.shake = Math.max(0, s.shake - dt * 5)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sfx])

  const onDeath = (s) => {
    if (!s.alive) return
    s.alive = false
    s.shake = 2
    sfx.death()
    s.splat = Array.from({ length: 18 }, () => ({ x: s.doodle.x, y: s.doodle.y, vx: (Math.random() - 0.5) * 220, vy: -Math.random() * 220, r: 3 + Math.random() * 3, c: '#22c55e', t: 0 }))
    const final = s.score
    setStatus('over')
    setGameOver({ score: final })
    setBest((prev) => { if (final > prev) { writeBest(final); return final } return prev })
  }

  const overlay = status === 'over' && gameOver ? (
    <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900/90 border border-white/15 rounded-2xl px-6 py-5 text-center max-w-[80%]">
        <div className="text-white/70 text-xs uppercase tracking-widest mb-1">Game Over</div>
        <div className="text-white text-3xl font-bold mb-2">Height: {gameOver.score}m</div>
        <div className="text-white/60 text-xs mb-4">Best: {best}m</div>
        <button type="button" onClick={reset}
          className="px-4 py-2 rounded-lg font-semibold bg-gradient-to-r from-emerald-400 to-lime-400 text-slate-900 hover:brightness-110 transition">
          Play again
        </button>
      </div>
    </div>
  ) : null

  return (
    <GameShell
      title="Doodle Jump"
      category="Runner"
      score={score}
      best={best}
      level={1 + Math.floor(score / 30)}
      status={status}
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn((v) => !v)}
      onPause={() => setStatus((p) => p === 'paused' ? 'playing' : p === 'playing' ? 'paused' : p)}
      onRestart={reset}
      overlay={overlay}
      extraStats={powerup ? (
        <div className="flex flex-col items-start">
          <span className="text-[10px] uppercase tracking-widest text-white/40">Power</span>
          <span className="text-sm font-semibold text-cyan-300 uppercase">{powerup}</span>
        </div>
      ) : null}
      controls={[
        { key: '←/→', label: 'Move' },
        { key: 'Tap L/R', label: 'Move (mobile)' },
        { key: 'Tilt', label: 'Move (device)' },
        { key: 'P', label: 'Pause' },
        { key: 'R', label: 'Restart' },
      ]}
    >
      <canvas
        ref={canvasRef}
        className="w-full block max-h-[80vh]"
        style={{ aspectRatio: '2 / 3', touchAction: 'none' }}
      />
    </GameShell>
  )
}

function makePlatform(rand, y, score) {
  const r = rand()
  const x = 15 + rand() * (LOGICAL_W - PLAT_W - 30)
  let type = 'static'
  const roll = rand()
  if (score > 5   && roll < 0.14) type = 'moving'
  else if (score > 10 && roll < 0.24) type = 'breakable'
  else if (roll < 0.29 && score > 3) type = 'cloud'
  if (roll > 0.94) type = 'spring'
  const dx = type === 'moving' ? (r > 0.5 ? 60 : -60) : 0
  return { x, y, type, dx, alive: true, hit: false }
}

function draw(ctx, canvas, s, status, reduced) {
  const W = canvas.width, H = canvas.height
  const sx = W / LOGICAL_W, sy = H / LOGICAL_H
  ctx.save(); ctx.scale(sx, sy)
  const amp = reduced ? 0 : Math.min(8, s.shake * 2)
  const ox = amp * (Math.random() * 2 - 1), oy = amp * (Math.random() * 2 - 1)
  ctx.translate(ox, oy)

  const height = Math.min(1, s.maxHeight / 6000)
  const grd = ctx.createLinearGradient(0, 0, 0, LOGICAL_H)
  grd.addColorStop(0, lerpColor('#a7d8ff', '#312e81', height))
  grd.addColorStop(1, lerpColor('#e0f2ff', '#0f172a', height))
  ctx.fillStyle = grd
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H)

  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 1
  for (let y = 0; y < LOGICAL_H; y += 24) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(LOGICAL_W, y); ctx.stroke()
  }

  for (const p of s.platforms) { if (p.alive) drawPlatform(ctx, p) }
  for (const m of s.monsters) if (m.alive) drawMonster(ctx, m)
  for (const pu of s.pickups) if (pu.alive) drawPickup(ctx, pu)
  for (const q of s.particles) {
    const a = Math.max(0, 1 - q.t / 0.7)
    ctx.globalAlpha = a
    ctx.fillStyle = q.c
    ctx.beginPath(); ctx.arc(q.x, q.y, 3, 0, Math.PI * 2); ctx.fill()
  }
  ctx.globalAlpha = 1

  drawDoodle(ctx, s.doodle)
  if (s.splat) {
    for (const q of s.splat) {
      q.t += 0.016; q.x += q.vx * 0.016; q.y += q.vy * 0.016; q.vy += 200 * 0.016
      const a = Math.max(0, 1 - q.t / 1.2)
      ctx.globalAlpha = a
      ctx.fillStyle = q.c
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  ctx.font = 'bold 18px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.lineWidth = 3
  ctx.textAlign = 'left'
  ctx.strokeText(`${s.score}m`, 12, 26)
  ctx.fillText(`${s.score}m`, 12, 26)

  if (status === 'ready') {
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.fillRect(30, LOGICAL_H / 2 - 60, LOGICAL_W - 60, 120)
    ctx.textAlign = 'center'
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 22px system-ui, sans-serif'
    ctx.fillText('Move ←/→ to jump higher', LOGICAL_W / 2, LOGICAL_H / 2 - 10)
    ctx.font = '13px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.fillText('Springs boost. Clouds vanish. Monsters — jump on them.', LOGICAL_W / 2, LOGICAL_H / 2 + 18)
  }
  ctx.restore()
}

function drawPlatform(ctx, p) {
  const y = p.y, x = p.x
  const colors = {
    static:    { top: '#22c55e', bot: '#166534', rim: '#052e16' },
    moving:    { top: '#38bdf8', bot: '#0369a1', rim: '#082f49' },
    breakable: { top: '#94a3b8', bot: '#475569', rim: '#0f172a' },
    spring:    { top: '#fbbf24', bot: '#b45309', rim: '#3f1d0a' },
    cloud:     { top: '#ffffff', bot: '#e5e7eb', rim: '#94a3b8' },
  }[p.type] || { top: '#22c55e', bot: '#166534', rim: '#052e16' }

  const grd = ctx.createLinearGradient(0, y, 0, y + PLAT_H)
  grd.addColorStop(0, colors.top); grd.addColorStop(1, colors.bot)
  ctx.fillStyle = grd
  roundRect(ctx, x, y, PLAT_W, PLAT_H, 6)
  ctx.fill()
  ctx.strokeStyle = colors.rim
  ctx.lineWidth = 2
  ctx.stroke()

  if (p.type === 'spring') {
    ctx.fillStyle = '#f59e0b'
    ctx.fillRect(x + PLAT_W / 2 - 8, y - 6, 16, 6)
    ctx.strokeRect(x + PLAT_W / 2 - 8, y - 6, 16, 6)
  }
  if (p.type === 'moving') {
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'
    ctx.beginPath()
    ctx.moveTo(x + 12, y + PLAT_H / 2)
    ctx.lineTo(x + PLAT_W - 12, y + PLAT_H / 2)
    ctx.stroke()
  }
}

function drawMonster(ctx, m) {
  ctx.save()
  ctx.translate(m.x, m.y)
  ctx.fillStyle = '#a855f7'
  ctx.strokeStyle = '#4c1d95'
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.arc(0, 0, m.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(-8, -m.r + 2); ctx.lineTo(-4, -m.r - 6); ctx.lineTo(-2, -m.r + 2); ctx.closePath(); ctx.fill(); ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(2, -m.r + 2); ctx.lineTo(6, -m.r - 6); ctx.lineTo(9, -m.r + 2); ctx.closePath(); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#fff'
  ctx.beginPath(); ctx.arc(-5, -2, 4, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(6, -2, 4, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#0f172a'
  ctx.beginPath(); ctx.arc(-4, -1, 2, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(7, -1, 2, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.moveTo(-3, 6); ctx.lineTo(-1, 12); ctx.lineTo(1, 6); ctx.closePath(); ctx.fill()
  ctx.beginPath()
  ctx.moveTo(3, 6); ctx.lineTo(5, 12); ctx.lineTo(7, 6); ctx.closePath(); ctx.fill()
  ctx.restore()
}

function drawPickup(ctx, pu) {
  ctx.save()
  ctx.translate(pu.x, pu.y)
  if (pu.type === 'rocket') {
    ctx.fillStyle = '#f97316'; ctx.strokeStyle = '#7c2d12'
    ctx.beginPath()
    ctx.moveTo(0, -14); ctx.lineTo(-6, 6); ctx.lineTo(6, 6); ctx.closePath()
    ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fbbf24'
    ctx.beginPath(); ctx.moveTo(-4, 6); ctx.lineTo(0, 14); ctx.lineTo(4, 6); ctx.closePath(); ctx.fill()
  } else if (pu.type === 'propeller') {
    ctx.fillStyle = '#a78bfa'; ctx.strokeStyle = '#4c1d95'
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.strokeStyle = '#e0e7ff'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(-14, -8); ctx.lineTo(14, -8); ctx.stroke()
  } else {
    ctx.fillStyle = '#22d3ee'; ctx.strokeStyle = '#155e75'
    roundRect(ctx, -8, -10, 16, 20, 3); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#f97316'
    ctx.beginPath(); ctx.moveTo(-4, 10); ctx.lineTo(0, 16); ctx.lineTo(4, 10); ctx.closePath(); ctx.fill()
  }
  ctx.restore()
}

function drawDoodle(ctx, d) {
  ctx.save()
  ctx.translate(d.x, d.y)
  ctx.scale(d.dir, 1)
  const sq = d.squash
  ctx.scale(sq, 2 - sq)

  ctx.fillStyle = 'rgba(0,0,0,0.15)'
  ctx.beginPath(); ctx.ellipse(0, 16, 12, 3, 0, 0, Math.PI * 2); ctx.fill()

  const bodyG = ctx.createRadialGradient(-4, -4, 3, 0, 0, 16)
  bodyG.addColorStop(0, '#bbf7d0')
  bodyG.addColorStop(1, '#22c55e')
  ctx.fillStyle = bodyG
  ctx.strokeStyle = '#14532d'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(-12, 8)
  ctx.quadraticCurveTo(-16, -8, -4, -14)
  ctx.quadraticCurveTo(4, -18, 12, -10)
  ctx.quadraticCurveTo(16, 6, 8, 14)
  ctx.quadraticCurveTo(-2, 18, -12, 8)
  ctx.closePath()
  ctx.fill(); ctx.stroke()

  ctx.fillStyle = '#166534'
  ctx.beginPath(); ctx.ellipse(-6, 14, 4, 3, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(6, 14, 4, 3, 0, 0, Math.PI * 2); ctx.fill()

  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#052e16'
  ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.arc(3, -4, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#0f172a'
  ctx.beginPath(); ctx.arc(5, -4, 3, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.beginPath(); ctx.arc(6, -5.5, 1.2, 0, Math.PI * 2); ctx.fill()

  if (d.powerup === 'propeller') {
    ctx.strokeStyle = '#e0e7ff'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(-14, -18); ctx.lineTo(14, -18); ctx.stroke()
    ctx.fillStyle = '#a78bfa'
    ctx.beginPath(); ctx.arc(0, -16, 3, 0, Math.PI * 2); ctx.fill()
  } else if (d.powerup === 'rocket') {
    ctx.fillStyle = '#f97316'; ctx.strokeStyle = '#7c2d12'
    ctx.beginPath()
    ctx.moveTo(0, -22); ctx.lineTo(-5, -10); ctx.lineTo(5, -10); ctx.closePath()
    ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fde68a'
    ctx.beginPath(); ctx.arc(0, 18, 4, 0, Math.PI * 2); ctx.fill()
  } else if (d.powerup === 'jetpack') {
    ctx.fillStyle = '#22d3ee'; ctx.strokeStyle = '#155e75'
    roundRect(ctx, -14, -6, 6, 14, 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#f59e0b'
    ctx.beginPath(); ctx.arc(-11, 12, 3, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y,     x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x,     y + h, r)
  ctx.arcTo(x,     y + h, x,     y,     r)
  ctx.arcTo(x,     y,     x + w, y,     r)
  ctx.closePath()
}

function lerpColor(a, b, t) {
  const pa = hexToRgb(a), pb = hexToRgb(b)
  const r = Math.round(pa.r + (pb.r - pa.r) * t)
  const g = Math.round(pa.g + (pb.g - pa.g) * t)
  const bl = Math.round(pa.b + (pb.b - pa.b) * t)
  return `rgb(${r},${g},${bl})`
}
function hexToRgb(h) {
  const s = h.replace('#', '')
  return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16) }
}
