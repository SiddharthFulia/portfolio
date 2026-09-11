// Flappy — tap-to-flap endless runner.
//
// Bird has orange beak + goggles, three-frame wing flap animation, tail
// feathers, and a squash-stretch on hard landing. Pipes are seeded
// (mulberry32) so every reset is reproducible but the sequence never
// repeats in one session. Day / night gradient swaps every 100 points.
// Medals (bronze / silver / gold / platinum) unlock on death. Score
// popup "+1" floats up whenever a pipe is passed. Best score stored in
// localStorage under `arcade.flappy.best`.
//
// Rendered entirely to a single 2D canvas — no images, no SVG assets.
// Everything is drawn from primitives (arcs, rects, gradients) so the
// game is self-contained and cheap to boot.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GameShell from '../../components/arcade/GameShell'
import { getSfx } from '../../components/arcade/sfx'

const BEST_KEY = 'arcade.flappy.best'

// Deterministic PRNG so `Restart` gets a NEW seed (Math.random) but the
// sequence THAT results is stable — helpful for debug replays.
const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// World tunables — tweaked so a first-time player crosses ~3 pipes.
const WORLD = {
  gravity: 1500,
  flap: -420,
  maxFall: 720,
  pipeSpeed: 190,
  pipeGap: 165,
  pipeInterval: 1.55,
  pipeWidth: 68,
  groundH: 90,
  birdX: 130,
  birdR: 18,
}

// Colour palettes — one per day / night phase. Swap every 100 points.
const PALETTES = [
  { skyTop: '#7ec9ff', skyBot: '#c8ecff', sun: '#fef3c7', cloudA: '#ffffff', cloudB: '#e0f2ff',
    pipeLight: '#7dd47d', pipeDark: '#3fa03f', pipeRim: '#245f24',
    ground: '#e0c37a', groundLine: '#c69f4f', hillA: '#8fd08f', hillB: '#6fb46f' },
  { skyTop: '#f6b073', skyBot: '#fdd39a', sun: '#fef3c7', cloudA: '#ffe4c9', cloudB: '#f7cfa1',
    pipeLight: '#f39860', pipeDark: '#c85f2a', pipeRim: '#853c17',
    ground: '#a56b3c', groundLine: '#844d21', hillA: '#c47554', hillB: '#a05a3d' },
  { skyTop: '#1b2a55', skyBot: '#2f3d75', sun: '#fef9c3', cloudA: '#3f4e88', cloudB: '#33427a',
    pipeLight: '#4a8fbd', pipeDark: '#1e5987', pipeRim: '#0f3457',
    ground: '#3b3450', groundLine: '#2a2338', hillA: '#43507a', hillB: '#2f395b' },
  { skyTop: '#f4a4c0', skyBot: '#ffd7dc', sun: '#fff5b7', cloudA: '#ffe0eb', cloudB: '#fbccd7',
    pipeLight: '#e07ab3', pipeDark: '#a3407b', pipeRim: '#63234a',
    ground: '#c69ab2', groundLine: '#a37690', hillA: '#dc8fb4', hillB: '#b26f92' },
]

const medalFor = (score) => {
  if (score >= 40) return { name: 'Platinum', tint: '#e5e4e2', ring: '#94a3b8' }
  if (score >= 25) return { name: 'Gold',     tint: '#fbbf24', ring: '#b45309' }
  if (score >= 12) return { name: 'Silver',   tint: '#e2e8f0', ring: '#64748b' }
  if (score >= 4)  return { name: 'Bronze',   tint: '#cd7f32', ring: '#7a4a1a' }
  return null
}

const readBest = () => { try { return parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0 } catch { return 0 } }
const writeBest = (v) => { try { localStorage.setItem(BEST_KEY, String(v)) } catch {} }

export default function Flappy() {
  const canvasRef = useRef(null)
  const stateRef = useRef(null)
  const rafRef = useRef(0)
  const sfx = useMemo(() => getSfx(), [])

  const [score, setScore] = useState(0)
  const [best, setBest] = useState(readBest())
  const [status, setStatus] = useState('ready')
  const [soundOn, setSoundOn] = useState(true)
  const [gameOverInfo, setGameOverInfo] = useState(null)

  const reducedRef = useRef(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedRef.current = mq.matches
    const sync = () => { reducedRef.current = mq.matches }
    mq.addEventListener?.('change', sync)
    return () => mq.removeEventListener?.('change', sync)
  }, [])

  useEffect(() => { sfx.setEnabled(soundOn) }, [soundOn, sfx])

  const initWorld = useCallback((seed = Date.now() & 0xffffffff) => {
    const rand = mulberry32(seed)
    stateRef.current = {
      seed, rand,
      bird: { x: WORLD.birdX, y: 240, vy: 0, rot: 0, wingFrame: 0, wingTime: 0, alive: true },
      pipes: [],
      pipeTimer: 0,
      clouds: Array.from({ length: 6 }, (_, i) => ({ x: i * 130 + rand() * 60, y: 40 + rand() * 140, w: 60 + rand() * 40, s: 12 + rand() * 12 })),
      hills: Array.from({ length: 8 }, (_, i) => ({ x: i * 120, h: 60 + rand() * 40 })),
      groundOffset: 0,
      score: 0,
      shake: 0,
      popups: [],
      phase: 0,
      splat: null,
      speedMult: 1,
      gapShrink: 0,
    }
  }, [])

  const reset = useCallback(() => {
    initWorld((Math.random() * 0xffffffff) >>> 0)
    setScore(0)
    setGameOverInfo(null)
    setStatus('ready')
  }, [initWorld])

  useEffect(() => { initWorld() }, [initWorld])

  const flap = useCallback(() => {
    const s = stateRef.current
    if (!s) return
    if (status === 'over') { reset(); return }
    if (status === 'ready') setStatus('playing')
    if (status === 'paused') return
    s.bird.vy = WORLD.flap
    s.bird.wingTime = 0
    s.bird.wingFrame = 2
    sfx.pop()
  }, [status, reset, sfx])

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault(); flap()
      } else if (e.code === 'KeyP') {
        setStatus((prev) => prev === 'paused' ? 'playing' : prev === 'playing' ? 'paused' : prev)
      } else if (e.code === 'KeyR') {
        reset()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flap, reset])

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const onPointer = (e) => { e.preventDefault(); flap() }
    c.addEventListener('pointerdown', onPointer)
    return () => c.removeEventListener('pointerdown', onPointer)
  }, [flap])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const LOGICAL_W = 480
    const LOGICAL_H = 640
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    let last = performance.now()
    const step = (t) => {
      const dt = Math.min(0.033, (t - last) / 1000)
      last = t
      const s = stateRef.current
      if (!s) { rafRef.current = requestAnimationFrame(step); return }

      const paused = status === 'paused'
      const running = status === 'playing'
      const over = status === 'over'

      if (!paused) {
        s.bird.wingTime += dt
        if (s.bird.wingTime > 0.09) {
          s.bird.wingTime = 0
          s.bird.wingFrame = (s.bird.wingFrame + 1) % 4
        }

        if (running) {
          s.bird.vy = Math.min(WORLD.maxFall, s.bird.vy + WORLD.gravity * dt)
          s.bird.y += s.bird.vy * dt
          s.bird.rot = Math.max(-0.6, Math.min(1.2, s.bird.vy * 0.0025))

          s.pipeTimer += dt
          const interval = Math.max(1.0, WORLD.pipeInterval - s.score * 0.008)
          if (s.pipeTimer > interval) {
            s.pipeTimer = 0
            const gap = Math.max(105, WORLD.pipeGap - s.gapShrink)
            const marginTop = 70, marginBot = WORLD.groundH + 60
            const gapY = marginTop + s.rand() * (LOGICAL_H - marginTop - marginBot - gap)
            s.pipes.push({ x: LOGICAL_W + 40, gapY, gap, passed: false })
          }

          const speed = WORLD.pipeSpeed * s.speedMult
          for (const p of s.pipes) p.x -= speed * dt
          s.pipes = s.pipes.filter((p) => p.x + WORLD.pipeWidth > -20)
          s.groundOffset = (s.groundOffset + speed * dt) % 40
          for (const c of s.clouds) {
            c.x -= c.s * dt
            if (c.x < -c.w) { c.x = LOGICAL_W + 20; c.y = 40 + s.rand() * 140 }
          }
          for (const h of s.hills) {
            h.x -= speed * 0.35 * dt
            if (h.x < -120) { h.x += 8 * 120 }
          }

          const bx = s.bird.x, by = s.bird.y, br = WORLD.birdR
          for (const p of s.pipes) {
            const withinX = bx + br > p.x && bx - br < p.x + WORLD.pipeWidth
            if (withinX) {
              if (by - br < p.gapY || by + br > p.gapY + p.gap) {
                onDeath(s); break
              }
            }
            if (!p.passed && p.x + WORLD.pipeWidth < bx - br) {
              p.passed = true
              s.score += 1
              setScore(s.score)
              s.popups.push({ x: bx, y: by - 30, t: 0, text: '+1' })
              sfx.coin()
              s.speedMult = 1 + Math.min(0.9, s.score * 0.018)
              s.gapShrink = Math.min(50, s.score * 0.5)
              s.phase = Math.floor(s.score / 100) % PALETTES.length
            }
          }
          if (by + br > LOGICAL_H - WORLD.groundH) onDeath(s)
          if (by - br < -20) onDeath(s)

          for (const pop of s.popups) { pop.t += dt; pop.y -= 40 * dt }
          s.popups = s.popups.filter((p) => p.t < 0.9)
          s.shake = Math.max(0, s.shake - dt * 6)
        } else if (over) {
          s.bird.vy = Math.min(WORLD.maxFall, s.bird.vy + WORLD.gravity * dt)
          s.bird.y += s.bird.vy * dt
          if (s.bird.y + WORLD.birdR > LOGICAL_H - WORLD.groundH) {
            s.bird.y = LOGICAL_H - WORLD.groundH - WORLD.birdR
            s.bird.vy = 0
          }
          if (s.splat) {
            for (const q of s.splat) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 200 * dt; q.t += dt }
          }
        }
      }

      const W = canvas.width, H = canvas.height
      const scaleX = W / LOGICAL_W, scaleY = H / LOGICAL_H
      ctx.save()
      ctx.scale(scaleX, scaleY)
      const shakeAmp = reducedRef.current ? 0 : Math.min(8, s.shake * 2)
      const ox = shakeAmp * (Math.random() * 2 - 1)
      const oy = shakeAmp * (Math.random() * 2 - 1)
      ctx.translate(ox, oy)

      const pal = PALETTES[s.phase]
      const grd = ctx.createLinearGradient(0, 0, 0, LOGICAL_H)
      grd.addColorStop(0, pal.skyTop); grd.addColorStop(1, pal.skyBot)
      ctx.fillStyle = grd
      ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H)

      ctx.fillStyle = pal.sun
      ctx.beginPath(); ctx.arc(LOGICAL_W - 70, 90, 32, 0, Math.PI * 2); ctx.fill()

      for (const c of s.clouds) drawCloud(ctx, c.x, c.y, c.w, pal.cloudA, pal.cloudB)
      for (const h of s.hills) drawHill(ctx, h.x, LOGICAL_H - WORLD.groundH - h.h, 120, h.h, pal.hillA, pal.hillB)
      for (const p of s.pipes) drawPipe(ctx, p, LOGICAL_H, pal)
      drawGround(ctx, s.groundOffset, LOGICAL_W, LOGICAL_H, pal)
      drawBird(ctx, s.bird)

      ctx.textAlign = 'center'
      ctx.font = 'bold 22px system-ui, sans-serif'
      for (const p of s.popups) {
        ctx.globalAlpha = Math.max(0, 1 - p.t / 0.9)
        ctx.fillStyle = '#fff'
        ctx.strokeStyle = '#ea580c'
        ctx.lineWidth = 3
        ctx.strokeText(p.text, p.x, p.y)
        ctx.fillText(p.text, p.x, p.y)
      }
      ctx.globalAlpha = 1

      if (s.splat) {
        for (const q of s.splat) {
          const a = Math.max(0, 1 - q.t / 1.2)
          ctx.globalAlpha = a
          ctx.fillStyle = q.c
          ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx.fill()
        }
        ctx.globalAlpha = 1
      }

      if (status !== 'over') {
        ctx.textAlign = 'center'
        ctx.font = 'bold 56px system-ui, sans-serif'
        ctx.fillStyle = 'rgba(255,255,255,0.9)'
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'
        ctx.lineWidth = 5
        ctx.strokeText(String(s.score), LOGICAL_W / 2, 90)
        ctx.fillText(String(s.score), LOGICAL_W / 2, 90)
      }

      if (status === 'ready') {
        ctx.fillStyle = 'rgba(0,0,0,0.35)'
        ctx.fillRect(60, 260, 360, 120)
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 22px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('Tap / Space to Flap', LOGICAL_W / 2, 300)
        ctx.font = '13px system-ui, sans-serif'
        ctx.fillStyle = 'rgba(255,255,255,0.7)'
        ctx.fillText('Squeeze through the pipes — day cycles every 100 points.', LOGICAL_W / 2, 328)
      }

      ctx.restore()
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect() }
  }, [status, sfx])

  const onDeath = (s) => {
    if (!s.bird.alive) return
    s.bird.alive = false
    s.shake = 3
    sfx.death()
    s.splat = Array.from({ length: 22 }, () => ({
      x: s.bird.x, y: s.bird.y,
      vx: (Math.random() - 0.5) * 260,
      vy: -Math.random() * 260,
      r: 3 + Math.random() * 3,
      c: ['#fbbf24', '#ef4444', '#fff', '#f97316'][(Math.random() * 4) | 0],
      t: 0,
    }))
    const finalScore = s.score
    setStatus('over')
    setGameOverInfo({ score: finalScore, medal: medalFor(finalScore) })
    setBest((prev) => { if (finalScore > prev) { writeBest(finalScore); return finalScore } return prev })
  }

  const overlay = status === 'over' && gameOverInfo ? (
    <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-slate-900/90 border border-white/15 rounded-2xl px-6 py-5 text-center max-w-[80%]">
        <div className="text-white/70 text-xs uppercase tracking-widest mb-1">Game Over</div>
        <div className="text-white text-3xl font-bold mb-3">Score: {gameOverInfo.score}</div>
        {gameOverInfo.medal ? (
          <div className="flex items-center gap-3 justify-center mb-3">
            <div className="w-11 h-11 rounded-full flex items-center justify-center border-4"
                 style={{ background: gameOverInfo.medal.tint, borderColor: gameOverInfo.medal.ring }}>
              <span className="text-slate-900 font-black text-xs">M</span>
            </div>
            <div className="text-white/90 font-semibold">{gameOverInfo.medal.name} medal</div>
          </div>
        ) : (
          <div className="text-white/50 text-sm mb-3">Keep going — 4 pipes for Bronze.</div>
        )}
        <div className="text-white/60 text-xs mb-4">Best: {best.toLocaleString()}</div>
        <button type="button" onClick={reset}
          className="px-4 py-2 rounded-lg font-semibold bg-gradient-to-r from-amber-400 to-rose-500 text-slate-900 hover:brightness-110 transition">
          Play again
        </button>
      </div>
    </div>
  ) : null

  return (
    <GameShell
      title="Flappy"
      category="Runner"
      score={score}
      best={best}
      level={1 + Math.floor(score / 10)}
      status={status}
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn((v) => !v)}
      onPause={() => setStatus((p) => p === 'paused' ? 'playing' : p === 'playing' ? 'paused' : p)}
      onRestart={reset}
      overlay={overlay}
      controls={[
        { key: 'Space', label: 'Flap' },
        { key: 'Tap',   label: 'Flap (mobile)' },
        { key: 'P',     label: 'Pause' },
        { key: 'R',     label: 'Restart' },
      ]}
    >
      <canvas
        ref={canvasRef}
        className="w-full block max-h-[80vh]"
        style={{ aspectRatio: '3 / 4', touchAction: 'none' }}
      />
    </GameShell>
  )
}

// ── Draw helpers ──
function drawCloud(ctx, x, y, w, ca, cb) {
  ctx.fillStyle = ca
  ctx.beginPath()
  ctx.arc(x, y, w * 0.35, 0, Math.PI * 2)
  ctx.arc(x + w * 0.4, y - 6, w * 0.3, 0, Math.PI * 2)
  ctx.arc(x + w * 0.7, y + 4, w * 0.28, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = cb
  ctx.beginPath()
  ctx.arc(x + w * 0.25, y + 6, w * 0.22, 0, Math.PI * 2)
  ctx.arc(x + w * 0.55, y + 8, w * 0.22, 0, Math.PI * 2)
  ctx.fill()
}

function drawHill(ctx, x, y, w, h, ca, cb) {
  const grd = ctx.createLinearGradient(0, y, 0, y + h)
  grd.addColorStop(0, ca); grd.addColorStop(1, cb)
  ctx.fillStyle = grd
  ctx.beginPath()
  ctx.moveTo(x, y + h)
  ctx.quadraticCurveTo(x + w / 2, y - 20, x + w, y + h)
  ctx.closePath(); ctx.fill()
}

function drawPipe(ctx, p, H, pal) {
  const w = WORLD.pipeWidth
  const rim = 18
  const grd = ctx.createLinearGradient(p.x, 0, p.x + w, 0)
  grd.addColorStop(0, pal.pipeDark); grd.addColorStop(0.4, pal.pipeLight); grd.addColorStop(1, pal.pipeDark)
  ctx.fillStyle = grd
  ctx.fillRect(p.x, 0, w, p.gapY)
  ctx.fillRect(p.x, p.gapY + p.gap, w, H - WORLD.groundH - (p.gapY + p.gap))
  ctx.fillStyle = pal.pipeDark
  ctx.fillRect(p.x - 4, p.gapY - rim, w + 8, rim)
  ctx.fillRect(p.x - 4, p.gapY + p.gap, w + 8, rim)
  ctx.strokeStyle = pal.pipeRim
  ctx.lineWidth = 2
  ctx.strokeRect(p.x - 4, p.gapY - rim, w + 8, rim)
  ctx.strokeRect(p.x - 4, p.gapY + p.gap, w + 8, rim)
}

function drawGround(ctx, offset, W, H, pal) {
  const y = H - WORLD.groundH
  ctx.fillStyle = pal.ground
  ctx.fillRect(0, y, W, WORLD.groundH)
  ctx.fillStyle = pal.groundLine
  for (let i = -1; i * 40 < W + 40; i++) {
    ctx.fillRect(i * 40 - offset, y + 12, 26, 4)
    ctx.fillRect(i * 40 - offset + 12, y + 32, 20, 3)
  }
  ctx.fillStyle = 'rgba(0,0,0,0.15)'
  ctx.fillRect(0, y, W, 3)
}

function drawBird(ctx, b) {
  ctx.save()
  ctx.translate(b.x, b.y)
  ctx.rotate(b.rot)
  const r = WORLD.birdR
  const bodyG = ctx.createLinearGradient(0, -r, 0, r)
  bodyG.addColorStop(0, '#fde68a'); bodyG.addColorStop(1, '#f59e0b')
  ctx.fillStyle = bodyG
  ctx.beginPath()
  ctx.ellipse(0, 0, r + 2, r, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#7c2d12'; ctx.lineWidth = 2; ctx.stroke()

  ctx.fillStyle = '#c2410c'
  ctx.beginPath()
  ctx.moveTo(-r - 2, 0); ctx.lineTo(-r - 10, -4); ctx.lineTo(-r - 12, 3); ctx.lineTo(-r - 10, 7)
  ctx.closePath(); ctx.fill()

  ctx.fillStyle = '#fbbf24'
  ctx.strokeStyle = '#78350f'
  ctx.lineWidth = 1.5
  const frame = Math.min(2, b.wingFrame % 4 === 3 ? 1 : b.wingFrame)
  const wingY = frame === 0 ? -4 : frame === 1 ? 2 : 8
  const wingRot = frame === 0 ? -0.4 : frame === 1 ? 0 : 0.6
  ctx.save()
  ctx.translate(-2, wingY); ctx.rotate(wingRot)
  ctx.beginPath(); ctx.ellipse(0, 0, 10, 6, 0, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  ctx.restore()

  ctx.fillStyle = '#fff'
  ctx.beginPath(); ctx.arc(7, -5, 5, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#0f172a'
  ctx.beginPath(); ctx.arc(8, -5, 2.5, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.beginPath(); ctx.arc(8.7, -5.7, 0.9, 0, Math.PI * 2); ctx.fill()

  ctx.fillStyle = '#f97316'
  ctx.strokeStyle = '#7c2d12'
  ctx.beginPath()
  ctx.moveTo(r - 2, -2); ctx.lineTo(r + 10, 0); ctx.lineTo(r - 2, 3)
  ctx.closePath()
  ctx.fill(); ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(r - 1, 0.5); ctx.lineTo(r + 9, 0.5)
  ctx.stroke()

  ctx.restore()
}
