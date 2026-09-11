// IcyTower — climb-the-tower runner.
//
// The character wall-jumps between the left and right icy walls. Chain
// wall-touches in a short window to build a combo. Screen scrolls up
// with a floor-of-fire that speeds up over time — miss a jump and the
// fire eats you. Blocks are colour-coded by tier so you can tell how
// high you climbed: cyan → violet → magenta → orange → gold.
//
// Character sprite: chunky pixel-art shape rendered from primitives.
// Directional facing based on last jump direction, plus a squish on
// landing / stretch during airtime. Combo counter floats over head.
//
// Procedural seed via mulberry32. Best score (highest floor) stored
// under `arcade.icy.best`.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GameShell from '../../components/arcade/GameShell'
import { getSfx } from '../../components/arcade/sfx'

const BEST_KEY = 'arcade.icy.best'
const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const LOGICAL_W = 400
const LOGICAL_H = 640
const WALL_W = 30
const GRAV = 1200
const JUMP_V = -680
const WALL_KICK_H = 260

const readBest = () => { try { return parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0 } catch { return 0 } }
const writeBest = (v) => { try { localStorage.setItem(BEST_KEY, String(v)) } catch {} }

// Block tint by floor height. Sparse platforms in the middle come from
// these tiers. Every 40 floors we shift into the next hue.
const tierColor = (floor) => {
  const t = Math.floor(floor / 40) % 5
  return ['#38bdf8', '#a78bfa', '#f472b6', '#fb923c', '#fbbf24'][t]
}

export default function IcyTower() {
  const canvasRef = useRef(null)
  const stateRef = useRef(null)
  const rafRef = useRef(0)
  const keysRef = useRef({ left: false, right: false, up: false })
  const sfx = useMemo(() => getSfx(), [])

  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [best, setBest] = useState(readBest())
  const [status, setStatus] = useState('ready')
  const [soundOn, setSoundOn] = useState(true)
  const [gameOver, setGameOver] = useState(null)

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
    const blocks = []
    // Sparse middle platforms — 1 in every ~3 floor bands.
    let y = LOGICAL_H - 60
    for (let i = 0; i < 40; i++) {
      if (rand() < 0.55) {
        const wide = 60 + rand() * 90
        const x = 40 + rand() * (LOGICAL_W - 80 - wide)
        blocks.push({ x, y, w: wide, h: 12 })
      }
      y -= 90
    }
    stateRef.current = {
      rand, seed,
      player: { x: LOGICAL_W / 2, y: LOGICAL_H - 120, vx: 0, vy: 0, dir: 1, onGround: true, squash: 1, stretch: 1, lastWall: 0 },
      blocks,
      fireY: LOGICAL_H + 40,       // pixel Y in world space that fire has climbed to
      camY: 0,                     // total world scroll up
      lastBlockY: y,
      floor: 0,
      score: 0,
      combo: 0,
      comboT: 0,                   // seconds since last wall-jump
      shake: 0,
      splat: null,
      alive: true,
      scrollSpeed: 30,             // px / s (base). Ramps up with score.
      particles: [],
      floaters: [],                // combo popups
    }
    setCombo(0)
  }, [])

  useEffect(() => { initWorld() }, [initWorld])

  const reset = useCallback(() => {
    initWorld()
    setScore(0)
    setCombo(0)
    setGameOver(null)
    setStatus('ready')
  }, [initWorld])

  useEffect(() => {
    const set = (e, down) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') { keysRef.current.left = down; e.preventDefault() }
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') { keysRef.current.right = down; e.preventDefault() }
      else if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        keysRef.current.up = down
        if (down) setStatus((p) => p === 'ready' ? 'playing' : p)
      }
      else if (down && e.code === 'KeyP') setStatus((p) => p === 'paused' ? 'playing' : p === 'playing' ? 'paused' : p)
      else if (down && e.code === 'KeyR') reset()
    }
    const dn = (e) => set(e, true)
    const up = (e) => set(e, false)
    window.addEventListener('keydown', dn)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up) }
  }, [reset])

  // Touch — left half moves left, right half moves right, tap top for jump.
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const onDown = (e) => {
      const rect = c.getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width
      const y = (e.clientY - rect.top) / rect.height
      if (y < 0.35) keysRef.current.up = true
      else if (x < 0.5) keysRef.current.left = true
      else keysRef.current.right = true
      setStatus((p) => p === 'ready' ? 'playing' : p)
    }
    const onUp = () => { keysRef.current.left = false; keysRef.current.right = false; keysRef.current.up = false }
    c.addEventListener('pointerdown', onDown)
    c.addEventListener('pointerup', onUp)
    c.addEventListener('pointerleave', onUp)
    return () => { c.removeEventListener('pointerdown', onDown); c.removeEventListener('pointerup', onUp); c.removeEventListener('pointerleave', onUp) }
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
    const p = s.player
    const kb = keysRef.current
    // Horizontal input — capped so it feels tight.
    const horiz = (kb.left ? -1 : 0) + (kb.right ? 1 : 0)
    p.vx = horiz * 280

    p.vy = Math.min(1400, p.vy + GRAV * dt)
    p.x += p.vx * dt
    p.y += p.vy * dt

    // Wall bounce — kick off when hitting a wall AND holding jump / up.
    let hitWall = 0
    if (p.x - 14 <= WALL_W) {
      p.x = WALL_W + 14
      hitWall = -1
    } else if (p.x + 14 >= LOGICAL_W - WALL_W) {
      p.x = LOGICAL_W - WALL_W - 14
      hitWall = 1
    }
    if (hitWall && (kb.up || p.vy > 60)) {
      // wall-jump: kick off horizontally + upward burst
      p.vx = -hitWall * WALL_KICK_H
      p.vy = JUMP_V
      p.dir = -hitWall
      p.squash = 0.55
      // combo — chain if within 1.2s AND on the OPPOSITE wall
      if (p.lastWall === -hitWall && s.comboT < 1.2) {
        s.combo += 1
      } else {
        s.combo = 1
      }
      s.comboT = 0
      p.lastWall = hitWall
      setCombo(s.combo)
      if (s.combo > 3) s.floaters.push({ x: p.x, y: p.y - 20, t: 0, text: `x${s.combo}!` })
      sfx.jump()
    }

    // Block landing — only when falling.
    if (p.vy > 0) {
      for (const b of s.blocks) {
        if (p.x > b.x - 12 && p.x < b.x + b.w + 12 && p.y > b.y - 4 && p.y < b.y + b.h + 4) {
          if (p.y - p.vy * dt <= b.y) {
            p.y = b.y
            p.vy = 0
            p.onGround = true
            p.squash = 0.6
            // Jump on landing if holding up
            if (kb.up) {
              p.vy = JUMP_V * 0.9
              sfx.pop()
            }
          }
        }
      }
    }
    // Ground jump
    if (p.onGround && kb.up && p.vy >= 0) {
      p.vy = JUMP_V
      p.onGround = false
      sfx.jump()
    }
    if (p.vy !== 0) p.onGround = false

    if (horiz > 0) p.dir = 1
    else if (horiz < 0) p.dir = -1
    p.squash = Math.min(1, p.squash + dt * 5)

    // Scroll camera so player stays around 45% of view
    const scrollTarget = LOGICAL_H * 0.45
    let scrollDelta = 0
    if (p.y < scrollTarget) {
      scrollDelta = scrollTarget - p.y
      p.y = scrollTarget
    }
    // Auto scroll (fire chase)
    const autoScroll = s.scrollSpeed * dt
    scrollDelta += autoScroll

    if (scrollDelta > 0) {
      s.camY += scrollDelta
      for (const b of s.blocks) b.y += scrollDelta
      for (const q of s.particles) q.y += scrollDelta
      for (const fl of s.floaters) fl.y += scrollDelta
      s.lastBlockY += scrollDelta
      s.fireY += scrollDelta
    }

    // Fire creeps up regardless (in world space). It has climbed
    // proportional to s.camY - initial-camY. Simpler: keep it slightly
    // below the current bottom of screen and only rise when player is
    // idle. We use scrollSpeed to already move it up by autoScroll.

    // Increase difficulty
    s.floor = Math.floor(s.camY / 90)
    if (s.floor > s.score) { s.score = s.floor; setScore(s.floor) }
    s.scrollSpeed = 30 + Math.min(140, s.floor * 1.2)

    // Fire death
    if (p.y > s.fireY) onDeath(s)

    // Spawn new blocks upward
    while (s.lastBlockY > -80) {
      s.lastBlockY -= 90
      if (s.rand() < 0.6) {
        const wide = 55 + s.rand() * 100
        const x = 40 + s.rand() * (LOGICAL_W - 80 - wide)
        s.blocks.push({ x, y: s.lastBlockY, w: wide, h: 12 })
      }
    }
    // Cull below screen
    s.blocks = s.blocks.filter((b) => b.y < LOGICAL_H + 40)

    // Combo decay
    s.comboT += dt
    if (s.comboT > 1.2 && s.combo > 0) { s.combo = 0; setCombo(0) }

    // Floaters
    for (const fl of s.floaters) { fl.t += dt; fl.y -= 30 * dt }
    s.floaters = s.floaters.filter((fl) => fl.t < 1.2)

    // Frost particles from wall (ambient)
    if (Math.random() < 0.6) {
      const side = Math.random() < 0.5 ? WALL_W : LOGICAL_W - WALL_W
      s.particles.push({ x: side + (Math.random() - 0.5) * 4, y: Math.random() * LOGICAL_H, vx: (Math.random() - 0.5) * 20, vy: 30 + Math.random() * 40, t: 0, r: 1 + Math.random() * 1.5, c: 'rgba(255,255,255,0.7)' })
    }
    for (const q of s.particles) { q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt }
    s.particles = s.particles.filter((q) => q.t < 2 && q.y < LOGICAL_H + 10)

    s.shake = Math.max(0, s.shake - dt * 5)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sfx])

  const onDeath = (s) => {
    if (!s.alive) return
    s.alive = false
    s.shake = 3
    sfx.death()
    s.splat = Array.from({ length: 20 }, () => ({ x: s.player.x, y: s.player.y, vx: (Math.random() - 0.5) * 260, vy: -Math.random() * 260, r: 3 + Math.random() * 3, c: ['#f97316', '#fbbf24', '#fff'][(Math.random() * 3) | 0], t: 0 }))
    const final = s.score
    setStatus('over')
    setGameOver({ score: final, combo: s.combo })
    setBest((prev) => { if (final > prev) { writeBest(final); return final } return prev })
  }

  const overlay = status === 'over' && gameOver ? (
    <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900/90 border border-white/15 rounded-2xl px-6 py-5 text-center max-w-[80%]">
        <div className="text-white/70 text-xs uppercase tracking-widest mb-1">Toasted</div>
        <div className="text-white text-3xl font-bold mb-2">Floor: {gameOver.score}</div>
        <div className="text-white/60 text-xs mb-4">Best floor: {best}</div>
        <button type="button" onClick={reset}
          className="px-4 py-2 rounded-lg font-semibold bg-gradient-to-r from-cyan-400 to-fuchsia-400 text-slate-900 hover:brightness-110 transition">
          Climb again
        </button>
      </div>
    </div>
  ) : null

  return (
    <GameShell
      title="Icy Tower"
      category="Runner"
      score={score}
      best={best}
      level={1 + Math.floor(score / 20)}
      status={status}
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn((v) => !v)}
      onPause={() => setStatus((p) => p === 'paused' ? 'playing' : p === 'playing' ? 'paused' : p)}
      onRestart={reset}
      overlay={overlay}
      extraStats={combo > 1 ? (
        <div className="flex flex-col items-start">
          <span className="text-[10px] uppercase tracking-widest text-white/40">Combo</span>
          <span className="text-xl font-bold text-fuchsia-300 tabular-nums">x{combo}</span>
        </div>
      ) : null}
      controls={[
        { key: '←/→', label: 'Move' },
        { key: 'Space / ↑', label: 'Jump / wall-jump' },
        { key: 'Tap L/R', label: 'Move (mobile)' },
        { key: 'Tap top', label: 'Jump (mobile)' },
        { key: 'P', label: 'Pause' },
        { key: 'R', label: 'Restart' },
      ]}
    >
      <canvas
        ref={canvasRef}
        className="w-full block max-h-[80vh]"
        style={{ aspectRatio: '5 / 8', touchAction: 'none' }}
      />
    </GameShell>
  )
}

// ── Draw ──
function draw(ctx, canvas, s, status, reduced) {
  const W = canvas.width, H = canvas.height
  const sx = W / LOGICAL_W, sy = H / LOGICAL_H
  ctx.save(); ctx.scale(sx, sy)
  const amp = reduced ? 0 : Math.min(6, s.shake * 2)
  const ox = amp * (Math.random() * 2 - 1), oy = amp * (Math.random() * 2 - 1)
  ctx.translate(ox, oy)

  // Background — icy blue → deep violet
  const grd = ctx.createLinearGradient(0, 0, 0, LOGICAL_H)
  grd.addColorStop(0, '#0e1b3a')
  grd.addColorStop(1, '#1b0e35')
  ctx.fillStyle = grd
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H)

  // Frost mist
  ctx.strokeStyle = 'rgba(180,220,255,0.05)'
  ctx.lineWidth = 40
  ctx.beginPath()
  for (let y = 0; y < LOGICAL_H; y += 80) {
    ctx.moveTo(0, y + Math.sin(y * 0.02) * 20)
    ctx.lineTo(LOGICAL_W, y + Math.cos(y * 0.02) * 20)
  }
  ctx.stroke()

  // Frost particles
  for (const q of s.particles) {
    ctx.globalAlpha = Math.max(0, 1 - q.t / 2)
    ctx.fillStyle = q.c
    ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx.fill()
  }
  ctx.globalAlpha = 1

  // Walls (icy)
  drawWall(ctx, 0, 0, WALL_W, LOGICAL_H)
  drawWall(ctx, LOGICAL_W - WALL_W, 0, WALL_W, LOGICAL_H)

  // Middle blocks — tinted by tier
  for (const b of s.blocks) {
    const floor = Math.max(0, Math.floor((s.camY + (LOGICAL_H - b.y)) / 90) - 1)
    const c = tierColor(floor)
    ctx.fillStyle = c
    roundRect(ctx, b.x, b.y, b.w, b.h, 4)
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'
    ctx.lineWidth = 1.5
    ctx.stroke()
    // top highlight
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.fillRect(b.x + 2, b.y + 1, b.w - 4, 2)
  }

  // Player
  drawPlayer(ctx, s.player)

  // Floaters
  ctx.textAlign = 'center'
  for (const fl of s.floaters) {
    const a = Math.max(0, 1 - fl.t / 1.2)
    ctx.globalAlpha = a
    ctx.font = 'bold 24px system-ui, sans-serif'
    ctx.fillStyle = '#f472b6'
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'
    ctx.lineWidth = 3
    ctx.strokeText(fl.text, fl.x, fl.y)
    ctx.fillText(fl.text, fl.x, fl.y)
  }
  ctx.globalAlpha = 1

  // FIRE at bottom
  drawFire(ctx, s.fireY, LOGICAL_W)

  // Death particles
  if (s.splat) {
    for (const q of s.splat) {
      q.t += 0.016; q.x += q.vx * 0.016; q.y += q.vy * 0.016; q.vy += 200 * 0.016
      ctx.globalAlpha = Math.max(0, 1 - q.t / 1.2)
      ctx.fillStyle = q.c
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  // HUD floor
  ctx.textAlign = 'left'
  ctx.font = 'bold 18px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'
  ctx.lineWidth = 3
  ctx.strokeText(`Floor ${s.floor}`, 44, 30)
  ctx.fillText(`Floor ${s.floor}`, 44, 30)

  if (status === 'ready') {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(WALL_W + 8, LOGICAL_H / 2 - 60, LOGICAL_W - 2 * WALL_W - 16, 120)
    ctx.textAlign = 'center'
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 22px system-ui, sans-serif'
    ctx.fillText('Wall-jump to climb', LOGICAL_W / 2, LOGICAL_H / 2 - 10)
    ctx.font = '13px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.fillText('Space to jump. Chain both walls for combos. Fire chases.', LOGICAL_W / 2, LOGICAL_H / 2 + 18)
  }

  ctx.restore()
}

function drawWall(ctx, x, y, w, h) {
  const grd = ctx.createLinearGradient(x, 0, x + w, 0)
  grd.addColorStop(0, '#1e3a8a')
  grd.addColorStop(0.5, '#60a5fa')
  grd.addColorStop(1, '#1e3a8a')
  ctx.fillStyle = grd
  ctx.fillRect(x, y, w, h)
  // ice cracks
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = 1
  for (let i = 0; i < 12; i++) {
    const py = i * (h / 12) + (i % 2) * 4
    ctx.beginPath()
    ctx.moveTo(x + 2, py)
    ctx.lineTo(x + w - 2, py + 8)
    ctx.stroke()
  }
}

function drawPlayer(ctx, p) {
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.scale(p.dir, 1)
  ctx.scale(p.squash, 2 - p.squash)

  // Pixel-art rectangle body
  const bodyG = ctx.createLinearGradient(0, -18, 0, 12)
  bodyG.addColorStop(0, '#fde68a')
  bodyG.addColorStop(1, '#f59e0b')
  ctx.fillStyle = bodyG
  ctx.strokeStyle = '#78350f'
  ctx.lineWidth = 2
  roundRect(ctx, -10, -18, 20, 30, 4)
  ctx.fill(); ctx.stroke()

  // Cap
  ctx.fillStyle = '#dc2626'
  ctx.strokeStyle = '#7f1d1d'
  roundRect(ctx, -11, -24, 22, 8, 3)
  ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#fff'
  ctx.beginPath(); ctx.arc(8, -20, 3, 0, Math.PI * 2); ctx.fill()

  // Eyes
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#0f172a'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.arc(-2, -10, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.beginPath(); ctx.arc(6, -10, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#0f172a'
  ctx.beginPath(); ctx.arc(-1, -10, 1.2, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(7, -10, 1.2, 0, Math.PI * 2); ctx.fill()
  // Mouth
  ctx.strokeStyle = '#78350f'; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(-2, -3); ctx.lineTo(6, -3); ctx.stroke()

  // Legs
  ctx.fillStyle = '#1e40af'
  ctx.fillRect(-8, 12, 6, 8)
  ctx.fillRect(2, 12, 6, 8)
  ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1
  ctx.strokeRect(-8, 12, 6, 8)
  ctx.strokeRect(2, 12, 6, 8)

  // Arms
  ctx.fillStyle = '#fde68a'
  ctx.strokeStyle = '#78350f'
  ctx.lineWidth = 1
  ctx.fillRect(-14, -12, 4, 10)
  ctx.fillRect(10, -12, 4, 10)
  ctx.strokeRect(-14, -12, 4, 10)
  ctx.strokeRect(10, -12, 4, 10)

  ctx.restore()
}

function drawFire(ctx, fireY, W) {
  // Fire fills from fireY down to LOGICAL_H
  const y = Math.max(0, fireY)
  ctx.save()
  const grd = ctx.createLinearGradient(0, y - 40, 0, LOGICAL_H)
  grd.addColorStop(0, 'rgba(251,191,36,0)')
  grd.addColorStop(0.4, '#f97316')
  grd.addColorStop(1, '#7f1d1d')
  ctx.fillStyle = grd
  ctx.fillRect(0, y - 40, W, LOGICAL_H - y + 40)

  // Flame tongues
  ctx.fillStyle = '#fbbf24'
  const time = Date.now() * 0.005
  for (let i = 0; i < 12; i++) {
    const fx = (i * W) / 12 + (Math.sin(time + i) * 6)
    ctx.beginPath()
    ctx.moveTo(fx, y)
    ctx.quadraticCurveTo(fx + 10, y - 24, fx + 22, y)
    ctx.closePath()
    ctx.fill()
  }
  // Hot rim
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, y + 2); ctx.lineTo(W, y + 2); ctx.stroke()
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
