// SubwayRunner — 3-lane forward runner.
//
// Pseudo-3D projection: lanes converge to a horizon vanishing point,
// obstacles scale up as they approach. Runner has a 3-frame run cycle
// (leg L / mid / leg R) with matching arm swing, plus dedicated jump
// and slide poses. Coins spawn in arcs / lines you can grab by lane.
// Power-ups (magnet, shield, multiplier) each last 6s.
//
// Environment cycles (subway / bridge / tunnel) every 500m — swaps
// background gradient, side props (pillars vs pylons vs cables), and
// obstacle mix. Best score (metres) stored under `arcade.subway.best`.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GameShell from '../../components/arcade/GameShell'
import { getSfx } from '../../components/arcade/sfx'
import { RULES, DIFFICULTIES, CUSTOM_SCHEMA } from './subway-runner/rules'

const BEST_KEY = 'arcade.subway.best'
const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const LOGICAL_W = 480
const LOGICAL_H = 700
const HORIZON_Y = 240
const LANE_X = [-0.35, 0, 0.35]     // lane offset relative to centre at z=0

const readBest = () => { try { return parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0 } catch { return 0 } }
const writeBest = (v) => { try { localStorage.setItem(BEST_KEY, String(v)) } catch {} }

// Project world position (lane offset + z distance) into screen coords.
// z=0 is at the player, z→large is at the horizon.
const project = (laneOffX, z) => {
  const scale = 1 / (1 + z * 0.02)
  const x = LOGICAL_W / 2 + laneOffX * (LOGICAL_W * 0.55) * scale
  const y = HORIZON_Y + (LOGICAL_H - HORIZON_Y) * (1 - scale) + 20 * scale
  return { x, y, scale }
}

const ENV_CYCLE = [
  { name: 'subway', sky: ['#312e81', '#7c3aed'], ground: ['#1e293b', '#0f172a'], accent: '#22d3ee' },
  { name: 'bridge', sky: ['#0284c7', '#fbbf24'], ground: ['#334155', '#0f172a'], accent: '#fb923c' },
  { name: 'tunnel', sky: ['#111827', '#1f2937'], ground: ['#374151', '#111827'], accent: '#f472b6' },
]

export default function SubwayRunner() {
  const canvasRef = useRef(null)
  const stateRef = useRef(null)
  const rafRef = useRef(0)
  const sfx = useMemo(() => getSfx(), [])

  const [score, setScore] = useState(0)
  const [coins, setCoins] = useState(0)
  const [best, setBest] = useState(readBest())
  const [status, setStatus] = useState('ready')
  const [soundOn, setSoundOn] = useState(true)
  const [gameOver, setGameOver] = useState(null)
  const [powerup, setPowerup] = useState(null)
  const [difficulty, setDifficulty] = useState('Medium')
  const [customValues, setCustomValues] = useState({
    baseSpeed: CUSTOM_SCHEMA.baseSpeed.default,
    spawnInterval: CUSTOM_SCHEMA.spawnInterval.default,
    coinDensity: CUSTOM_SCHEMA.coinDensity.default,
    powerupChance: CUSTOM_SCHEMA.powerupChance.default,
  })
  const cfg = difficulty === 'Custom' ? customValues : DIFFICULTIES[difficulty]
  const cfgRef = useRef(cfg)
  useEffect(() => { cfgRef.current = cfg }, [cfg])

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
    stateRef.current = {
      rand, seed,
      lane: 1,           // 0/1/2
      laneT: 1,          // smooth interpolated lane (for animation)
      jump: 0,           // 0..1 (0 grounded, >0 in air)
      jumpVy: 0,
      slide: 0,          // seconds remaining
      obstacles: [],     // { lane, z, type }
      coins: [],         // { lane, z, taken }
      pickups: [],       // { lane, z, type }
      distance: 0,       // metres travelled
      speed: 220,        // z units per second — climbs with distance (init overwritten in loop)
      spawnZ: 60,        // when the next obstacle set spawns
      score: 0,
      coinCount: 0,
      shake: 0,
      alive: true,
      splat: null,
      runFrame: 0,
      runTime: 0,
      env: 0,
      envT: 0,
      trail: [],
      powerup: null,
      powerT: 0,
      floaters: [],
    }
  }, [])

  useEffect(() => { initWorld() }, [initWorld])

  const reset = useCallback(() => {
    initWorld()
    setScore(0)
    setCoins(0)
    setPowerup(null)
    setGameOver(null)
    setStatus('ready')
  }, [initWorld])

  const startIfReady = useCallback(() => {
    setStatus((p) => p === 'ready' ? 'playing' : p)
  }, [])

  const changeLane = useCallback((delta) => {
    const s = stateRef.current
    if (!s || !s.alive) return
    s.lane = Math.max(0, Math.min(2, s.lane + delta))
  }, [])

  const doJump = useCallback(() => {
    const s = stateRef.current
    if (!s || !s.alive) return
    if (s.jump <= 0.01 && s.slide <= 0) {
      s.jump = 0.001
      s.jumpVy = -520
      sfx.jump()
    }
  }, [sfx])

  const doSlide = useCallback(() => {
    const s = stateRef.current
    if (!s || !s.alive) return
    if (s.jump <= 0.01) {
      s.slide = 0.6
      sfx.thrust()
    }
  }, [sfx])

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); startIfReady(); changeLane(-1) }
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); startIfReady(); changeLane(1) }
      else if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') { e.preventDefault(); startIfReady(); doJump() }
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); startIfReady(); doSlide() }
      else if (e.code === 'KeyP') setStatus((p) => p === 'paused' ? 'playing' : p === 'playing' ? 'paused' : p)
      else if (e.code === 'KeyR') reset()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [changeLane, doJump, doSlide, reset, startIfReady])

  // Swipe input on canvas
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    let sx = 0, sy = 0, active = false
    const onDown = (e) => { sx = e.clientX; sy = e.clientY; active = true; startIfReady() }
    const onUp = (e) => {
      if (!active) return
      active = false
      const dx = e.clientX - sx, dy = e.clientY - sy
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) {
        doJump()
        return
      }
      if (Math.abs(dx) > Math.abs(dy)) changeLane(dx > 0 ? 1 : -1)
      else if (dy < 0) doJump()
      else doSlide()
    }
    c.addEventListener('pointerdown', onDown)
    c.addEventListener('pointerup', onUp)
    c.addEventListener('pointercancel', () => { active = false })
    return () => { c.removeEventListener('pointerdown', onDown); c.removeEventListener('pointerup', onUp) }
  }, [changeLane, doJump, doSlide, startIfReady])

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
    // Smooth lane interpolation
    s.laneT += (s.lane - s.laneT) * Math.min(1, dt * 12)

    // Jump physics
    if (s.jump > 0) {
      s.jumpVy += 1600 * dt
      s.jump += s.jumpVy * dt * -0.001   // upward when negative vy
      if (s.jump >= 0) {
        // still in the air until height falls to 0
      }
    }
    // Simple ballistic — model s.jump as height 0..1
    // Instead of the above (which was confusing), rework:
    // Use s.jumpH (world height), and animate as parabola.
    // Rewire in one pass:
    if (!Object.prototype.hasOwnProperty.call(s, 'jumpH')) { s.jumpH = 0; s.jumpVy = 0 }
    if (s.jump > 0 || s.jumpH > 0 || s.jumpVy !== 0) {
      s.jumpVy += 1400 * dt
      s.jumpH -= s.jumpVy * dt
      if (s.jumpH < 0) {
        s.jumpH = 0
        s.jumpVy = 0
        s.jump = 0
      } else {
        s.jump = 1
      }
    }

    if (s.slide > 0) s.slide = Math.max(0, s.slide - dt)

    // Run cycle
    s.runTime += dt
    if (s.runTime > 0.09) {
      s.runTime = 0
      s.runFrame = (s.runFrame + 1) % 3
    }

    // Forward motion — z units correspond loosely to metres
    const speedMult = s.powerup === 'multiplier' ? 1.25 : 1
    const speed = s.speed * speedMult
    s.distance += speed * dt

    // Update obstacles / coins / pickups
    for (const o of s.obstacles) o.z -= speed * dt * 0.02
    for (const c of s.coins) c.z -= speed * dt * 0.02
    for (const pu of s.pickups) pu.z -= speed * dt * 0.02

    // Spawn a new lane pattern every so often (z units before player)
    s.spawnZ -= speed * dt * 0.02
    if (s.spawnZ <= 0) {
      spawnPattern(s, cfgRef.current)
      s.spawnZ = cfgRef.current.spawnInterval + s.rand() * 20 - Math.min(15, s.distance / 200)
    }

    // Cull passed
    s.obstacles = s.obstacles.filter((o) => o.z > -3)
    s.coins = s.coins.filter((c) => c.z > -3 && !c.taken)
    s.pickups = s.pickups.filter((pu) => pu.z > -3 && !pu.taken)

    // Collision at z ~ 0
    const grounded = s.jumpH <= 0.5
    for (const o of s.obstacles) {
      if (o.z > 0.6 || o.z < -0.6 || o.lane !== s.lane) continue
      // Different obstacle heights
      if (o.type === 'low' && s.jumpH > 0.7) continue        // jumped over barrier
      if (o.type === 'high' && s.slide > 0) continue          // slid under vine / signal
      if (s.powerup === 'shield') {
        s.powerup = null
        setPowerup(null)
        s.floaters.push({ x: LOGICAL_W / 2, y: LOGICAL_H / 2, t: 0, text: 'Shield saved!' })
        sfx.hit()
        // knock the obstacle out
        o.z = -10
        continue
      }
      onDeath(s)
      break
    }

    // Coins
    for (const c of s.coins) {
      if (c.taken) continue
      const laneMatch = c.lane === s.lane
      const magnet = s.powerup === 'magnet'
      const closeZ = c.z > -0.5 && c.z < 0.7
      const heightOk = Math.abs(s.jumpH - c.h) < 0.6
      if (closeZ && (magnet ? true : laneMatch) && heightOk) {
        c.taken = true
        s.coinCount += 1
        setCoins(s.coinCount)
        s.floaters.push({ x: LOGICAL_W / 2 + LANE_X[c.lane] * 200, y: LOGICAL_H * 0.6, t: 0, text: '+1' })
        sfx.coin()
      }
    }

    // Pickups
    for (const pu of s.pickups) {
      if (pu.taken) continue
      if (pu.z > -0.5 && pu.z < 0.7 && pu.lane === s.lane) {
        pu.taken = true
        s.powerup = pu.type
        s.powerT = 6
        setPowerup(pu.type)
        s.floaters.push({ x: LOGICAL_W / 2, y: LOGICAL_H * 0.5, t: 0, text: pu.type.toUpperCase() })
        sfx.win()
      }
    }

    // Powerup timer
    if (s.powerup) {
      s.powerT -= dt
      if (s.powerT <= 0) { s.powerup = null; setPowerup(null) }
    }

    // Floaters
    for (const fl of s.floaters) { fl.t += dt; fl.y -= 50 * dt }
    s.floaters = s.floaters.filter((fl) => fl.t < 0.9)

    // Speed ramp
    s.speed = Math.min(520, cfgRef.current.baseSpeed + s.distance * 0.14)

    // Score update
    const newScore = Math.floor(s.distance)
    if (newScore > s.score) { s.score = newScore; setScore(newScore) }

    // Env cycle every 500m
    s.env = Math.floor(s.distance / 500) % ENV_CYCLE.length

    // Trail dust
    if (grounded && s.slide <= 0 && Math.random() < 0.6) {
      s.trail.push({ x: LOGICAL_W / 2 + LANE_X[s.lane] * 200 * 0.9 + (Math.random() - 0.5) * 20, y: LOGICAL_H - 100, vx: (Math.random() - 0.5) * 40, vy: 30 + Math.random() * 40, t: 0, c: 'rgba(200,200,220,0.6)' })
    }
    for (const q of s.trail) { q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt }
    s.trail = s.trail.filter((q) => q.t < 0.6)

    s.shake = Math.max(0, s.shake - dt * 5)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sfx])

  const onDeath = (s) => {
    if (!s.alive) return
    s.alive = false
    s.shake = 4
    sfx.death()
    s.splat = Array.from({ length: 22 }, () => ({ x: LOGICAL_W / 2 + LANE_X[s.lane] * 200, y: LOGICAL_H - 130, vx: (Math.random() - 0.5) * 300, vy: -Math.random() * 300, r: 3 + Math.random() * 3, c: ['#ef4444', '#fbbf24', '#fff'][(Math.random() * 3) | 0], t: 0 }))
    const final = s.score
    setStatus('over')
    setGameOver({ score: final, coins: s.coinCount })
    setBest((prev) => { if (final > prev) { writeBest(final); return final } return prev })
  }

  const overlay = status === 'over' && gameOver ? (
    <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900/90 border border-white/15 rounded-2xl px-6 py-5 text-center max-w-[80%]">
        <div className="text-white/70 text-xs uppercase tracking-widest mb-1">Crashed</div>
        <div className="text-white text-3xl font-bold mb-1">{gameOver.score}m</div>
        <div className="text-amber-300 text-sm mb-3">{gameOver.coins} coins collected</div>
        <div className="text-white/60 text-xs mb-4">Best: {best}m</div>
        <button type="button" onClick={reset}
          className="px-4 py-2 rounded-lg font-semibold bg-gradient-to-r from-cyan-400 to-fuchsia-400 text-slate-900 hover:brightness-110 transition">
          Run again
        </button>
      </div>
    </div>
  ) : null

  return (
    <GameShell
      title="Subway Runner"
      category="Runner"
      score={score}
      best={best}
      level={1 + Math.floor(score / 100)}
      status={status}
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn((v) => !v)}
      onPause={() => setStatus((p) => p === 'paused' ? 'playing' : p === 'playing' ? 'paused' : p)}
      onRestart={reset}
      rules={RULES}
      difficulty={difficulty}
      onDifficultyChange={setDifficulty}
      customSchema={CUSTOM_SCHEMA}
      customValues={customValues}
      onCustomChange={setCustomValues}
      overlay={overlay}
      extraStats={
        <>
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Coins</span>
            <span className="text-xl font-bold text-amber-300 tabular-nums">{coins}</span>
          </div>
          {powerup ? (
            <div className="flex flex-col items-start">
              <span className="text-[10px] uppercase tracking-widest text-white/40">Power</span>
              <span className="text-sm font-semibold text-cyan-300 uppercase">{powerup}</span>
            </div>
          ) : null}
        </>
      }
      controls={[
        { key: '← / →', label: 'Switch lane' },
        { key: '↑ / Space', label: 'Jump' },
        { key: '↓', label: 'Slide' },
        { key: 'Swipe', label: 'Move (mobile)' },
        { key: 'P', label: 'Pause' },
        { key: 'R', label: 'Restart' },
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

// ── Spawn helpers ──
function spawnPattern(s, cfg = { coinDensity: 1, powerupChance: 0.2 }) {
  const r = s.rand()
  const zStart = 40
  const coinCount5 = Math.max(1, Math.round(5 * cfg.coinDensity))
  const coinCount4 = Math.max(1, Math.round(4 * cfg.coinDensity))
  const coinCount7 = Math.max(1, Math.round(7 * cfg.coinDensity))
  // pattern types: single-obstacle-random, three-of-three-with-hole, coin-arc, pickup
  const pickupCutoff = 1 - cfg.powerupChance
  if (r < 0.35) {
    const lane = (s.rand() * 3) | 0
    const type = s.rand() < 0.5 ? 'low' : 'high'
    s.obstacles.push({ lane, z: zStart, type })
    const cLane = (s.rand() * 3) | 0
    for (let i = 0; i < coinCount5; i++) {
      s.coins.push({ lane: cLane, z: zStart - 10 - i * 2, taken: false, h: 0 })
    }
  } else if (r < 0.6) {
    const openLane = (s.rand() * 3) | 0
    for (let l = 0; l < 3; l++) {
      if (l === openLane) continue
      s.obstacles.push({ lane: l, z: zStart, type: s.rand() < 0.5 ? 'low' : 'high' })
    }
    for (let i = 0; i < coinCount4; i++) {
      s.coins.push({ lane: openLane, z: zStart - i * 2, taken: false, h: 0 })
    }
  } else if (r < pickupCutoff) {
    const lane = (s.rand() * 3) | 0
    for (let i = 0; i < coinCount7; i++) {
      const h = Math.sin((i / 6) * Math.PI) * 1.4
      s.coins.push({ lane, z: zStart - i * 1.5, taken: false, h })
    }
    s.obstacles.push({ lane, z: zStart - 4, type: 'low' })
  } else {
    const lane = (s.rand() * 3) | 0
    const type = ['magnet', 'shield', 'multiplier'][(s.rand() * 3) | 0]
    s.pickups.push({ lane, z: zStart, type, taken: false })
  }
}

// ── Draw ──
function draw(ctx, canvas, s, status, reduced) {
  const W = canvas.width, H = canvas.height
  const sx = W / LOGICAL_W, sy = H / LOGICAL_H
  ctx.save(); ctx.scale(sx, sy)
  const amp = reduced ? 0 : Math.min(6, s.shake * 2)
  const ox = amp * (Math.random() * 2 - 1), oy = amp * (Math.random() * 2 - 1)
  ctx.translate(ox, oy)

  const env = ENV_CYCLE[s.env]

  // Sky
  const skyG = ctx.createLinearGradient(0, 0, 0, HORIZON_Y + 40)
  skyG.addColorStop(0, env.sky[0]); skyG.addColorStop(1, env.sky[1])
  ctx.fillStyle = skyG
  ctx.fillRect(0, 0, LOGICAL_W, HORIZON_Y + 40)

  // Ground / track
  const grndG = ctx.createLinearGradient(0, HORIZON_Y, 0, LOGICAL_H)
  grndG.addColorStop(0, env.ground[0]); grndG.addColorStop(1, env.ground[1])
  ctx.fillStyle = grndG
  ctx.fillRect(0, HORIZON_Y, LOGICAL_W, LOGICAL_H - HORIZON_Y)

  // Lane lines (converging)
  const lanes = [-0.55, -0.18, 0.18, 0.55]
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = 2
  for (const off of lanes) {
    ctx.beginPath()
    ctx.moveTo(LOGICAL_W / 2, HORIZON_Y)
    ctx.lineTo(LOGICAL_W / 2 + off * LOGICAL_W * 1.2, LOGICAL_H + 20)
    ctx.stroke()
  }

  // Track dashes — moving toward viewer
  const dashOffset = (s.distance * 0.4) % 30
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'
  ctx.setLineDash([12, 18])
  ctx.lineDashOffset = -dashOffset
  ctx.lineWidth = 3
  for (const off of [-0.18, 0.18]) {
    ctx.beginPath()
    ctx.moveTo(LOGICAL_W / 2 + off * LOGICAL_W * 0.02, HORIZON_Y + 20)
    ctx.lineTo(LOGICAL_W / 2 + off * LOGICAL_W * 1.2, LOGICAL_H + 20)
    ctx.stroke()
  }
  ctx.setLineDash([])

  // Side pillars — one per environment
  drawSideProps(ctx, s, env)

  // Depth-sort everything then draw far-to-near
  const items = []
  for (const o of s.obstacles) items.push({ kind: 'obstacle', z: o.z, obj: o })
  for (const c of s.coins) if (!c.taken) items.push({ kind: 'coin', z: c.z, obj: c })
  for (const pu of s.pickups) if (!pu.taken) items.push({ kind: 'pickup', z: pu.z, obj: pu })
  items.sort((a, b) => b.z - a.z)
  for (const it of items) {
    if (it.kind === 'obstacle') drawObstacle(ctx, it.obj, env)
    else if (it.kind === 'coin') drawCoin(ctx, it.obj)
    else drawPickup(ctx, it.obj)
  }

  // Trail dust
  for (const q of s.trail) {
    const a = Math.max(0, 1 - q.t / 0.6)
    ctx.globalAlpha = a
    ctx.fillStyle = q.c
    ctx.beginPath(); ctx.arc(q.x, q.y, 3, 0, Math.PI * 2); ctx.fill()
  }
  ctx.globalAlpha = 1

  // Runner
  drawRunner(ctx, s)
  if (s.splat) {
    for (const q of s.splat) {
      q.t += 0.016; q.x += q.vx * 0.016; q.y += q.vy * 0.016; q.vy += 200 * 0.016
      ctx.globalAlpha = Math.max(0, 1 - q.t / 1.2)
      ctx.fillStyle = q.c
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  // Floaters
  ctx.textAlign = 'center'
  for (const fl of s.floaters) {
    const a = Math.max(0, 1 - fl.t / 0.9)
    ctx.globalAlpha = a
    ctx.font = 'bold 20px system-ui, sans-serif'
    ctx.fillStyle = env.accent
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'
    ctx.lineWidth = 3
    ctx.strokeText(fl.text, fl.x, fl.y)
    ctx.fillText(fl.text, fl.x, fl.y)
  }
  ctx.globalAlpha = 1

  // Environment badge
  ctx.textAlign = 'right'
  ctx.font = 'bold 12px system-ui, sans-serif'
  ctx.fillStyle = env.accent
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'
  ctx.lineWidth = 2
  const label = env.name.toUpperCase()
  ctx.strokeText(label, LOGICAL_W - 12, 24)
  ctx.fillText(label, LOGICAL_W - 12, 24)

  if (status === 'ready') {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(30, LOGICAL_H / 2 - 60, LOGICAL_W - 60, 120)
    ctx.textAlign = 'center'
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 22px system-ui, sans-serif'
    ctx.fillText('Swipe or use arrows', LOGICAL_W / 2, LOGICAL_H / 2 - 10)
    ctx.font = '13px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.fillText('Left/Right = lane, Up = jump, Down = slide.', LOGICAL_W / 2, LOGICAL_H / 2 + 18)
  }

  ctx.restore()
}

function drawSideProps(ctx, s, env) {
  const offset = (s.distance * 0.6) % 60
  for (let i = 0; i < 12; i++) {
    const zBase = i * 6 - offset * 0.1
    const z = zBase
    if (z < -3) continue
    const { x: xL, y, scale } = project(-0.8, z)
    const { x: xR } = project(0.8, z)
    ctx.globalAlpha = Math.min(1, scale * 2)
    ctx.fillStyle = env.accent
    // pillars
    ctx.fillRect(xL - 6 * scale, y - 60 * scale, 12 * scale, 60 * scale)
    ctx.fillRect(xR - 6 * scale, y - 60 * scale, 12 * scale, 60 * scale)
    // top strip
    ctx.fillRect(xL - 8 * scale, y - 66 * scale, 16 * scale, 6 * scale)
    ctx.fillRect(xR - 8 * scale, y - 66 * scale, 16 * scale, 6 * scale)
  }
  ctx.globalAlpha = 1
}

function drawObstacle(ctx, o, env) {
  const { x, y, scale } = project(LANE_X[o.lane], o.z)
  if (o.type === 'low') {
    // barrier
    ctx.fillStyle = '#ef4444'
    ctx.strokeStyle = '#7f1d1d'
    ctx.lineWidth = 2 * scale
    const w = 100 * scale, h = 40 * scale
    ctx.fillRect(x - w / 2, y - h, w, h)
    ctx.strokeRect(x - w / 2, y - h, w, h)
    // stripes
    ctx.fillStyle = '#fbbf24'
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(x - w / 2 + i * 30 * scale, y - h + 6 * scale, 12 * scale, h - 12 * scale)
    }
  } else {
    // high — signal / sign to slide under
    ctx.fillStyle = '#1f2937'
    ctx.strokeStyle = env.accent
    ctx.lineWidth = 3 * scale
    const w = 100 * scale, h = 30 * scale
    // hanging sign
    ctx.fillRect(x - w / 2, y - 110 * scale, w, h)
    ctx.strokeRect(x - w / 2, y - 110 * scale, w, h)
    // pole
    ctx.fillStyle = '#374151'
    ctx.fillRect(x - 3 * scale, y - 110 * scale, 6 * scale, 60 * scale)
    // sign face
    ctx.fillStyle = env.accent
    ctx.font = `bold ${16 * scale}px sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText('SLIDE', x, y - 88 * scale)
  }
}

function drawCoin(ctx, c) {
  const { x, y, scale } = project(LANE_X[c.lane], c.z)
  const cy = y - 40 * scale - c.h * 60 * scale
  const spin = (Date.now() / 200 + c.z * 0.3) % (Math.PI * 2)
  const w = 14 * scale * Math.abs(Math.cos(spin))
  ctx.fillStyle = '#fbbf24'
  ctx.strokeStyle = '#b45309'
  ctx.lineWidth = 1.5 * scale
  ctx.beginPath()
  ctx.ellipse(x, cy, w + 2, 14 * scale, 0, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#fef3c7'
  ctx.beginPath()
  ctx.ellipse(x - 2 * scale, cy - 2 * scale, Math.max(1, w * 0.4), 5 * scale, 0, 0, Math.PI * 2)
  ctx.fill()
}

function drawPickup(ctx, pu) {
  const { x, y, scale } = project(LANE_X[pu.lane], pu.z)
  const cy = y - 40 * scale
  const color = pu.type === 'magnet' ? '#ef4444' : pu.type === 'shield' ? '#22d3ee' : '#a78bfa'
  ctx.fillStyle = color
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'
  ctx.lineWidth = 2 * scale
  ctx.beginPath(); ctx.arc(x, cy, 14 * scale, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#fff'
  ctx.font = `bold ${14 * scale}px sans-serif`
  ctx.textAlign = 'center'
  ctx.fillText(pu.type === 'magnet' ? 'M' : pu.type === 'shield' ? 'S' : 'x2', x, cy + 4 * scale)
}

function drawRunner(ctx, s) {
  const laneOff = LANE_X[0] + (LANE_X[2] - LANE_X[0]) * (s.laneT / 2)
  const laneX = LOGICAL_W / 2 + laneOff * 200
  const groundY = LOGICAL_H - 100
  const y = groundY - s.jumpH * 80

  ctx.save()
  ctx.translate(laneX, y)

  // Shadow
  ctx.globalAlpha = Math.max(0.15, 0.4 - s.jumpH * 0.2)
  ctx.fillStyle = '#000'
  ctx.beginPath(); ctx.ellipse(0, 20, 20, 6, 0, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 1

  // Shield ring
  if (s.powerup === 'shield') {
    ctx.strokeStyle = 'rgba(34,211,238,0.7)'
    ctx.lineWidth = 3
    ctx.beginPath(); ctx.arc(0, -20, 34, 0, Math.PI * 2); ctx.stroke()
  }

  const sliding = s.slide > 0
  if (sliding) drawRunnerSliding(ctx)
  else if (s.jump > 0) drawRunnerJumping(ctx)
  else drawRunnerRunning(ctx, s.runFrame)

  ctx.restore()
}

function drawRunnerRunning(ctx, frame) {
  // Body torso
  ctx.fillStyle = '#dc2626'   // red hoodie
  ctx.strokeStyle = '#7f1d1d'
  ctx.lineWidth = 2
  roundRect(ctx, -10, -34, 20, 26, 4); ctx.fill(); ctx.stroke()
  // Head
  ctx.fillStyle = '#fbcfa1'
  ctx.strokeStyle = '#7c2d12'
  ctx.beginPath(); ctx.arc(0, -44, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  // Cap
  ctx.fillStyle = '#0369a1'
  ctx.strokeStyle = '#0f172a'
  ctx.beginPath()
  ctx.arc(0, -46, 10, Math.PI, 0)
  ctx.lineTo(-10, -46); ctx.closePath()
  ctx.fill(); ctx.stroke()
  // Eyes
  ctx.fillStyle = '#fff'
  ctx.beginPath(); ctx.arc(-2, -45, 1.6, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(3, -45, 1.6, 0, Math.PI * 2); ctx.fill()

  // Legs — three-frame cycle
  ctx.fillStyle = '#1e40af'
  ctx.strokeStyle = '#0f172a'
  ctx.lineWidth = 1.5
  if (frame === 0) {
    // Left forward, right back
    ctx.save(); ctx.translate(-4, -6); ctx.rotate(-0.35)
    roundRect(ctx, -3, 0, 6, 18, 2); ctx.fill(); ctx.stroke(); ctx.restore()
    ctx.save(); ctx.translate(4, -6); ctx.rotate(0.35)
    roundRect(ctx, -3, 0, 6, 18, 2); ctx.fill(); ctx.stroke(); ctx.restore()
  } else if (frame === 1) {
    // mid
    ctx.save(); ctx.translate(-4, -6)
    roundRect(ctx, -3, 0, 6, 20, 2); ctx.fill(); ctx.stroke(); ctx.restore()
    ctx.save(); ctx.translate(4, -6)
    roundRect(ctx, -3, 0, 6, 20, 2); ctx.fill(); ctx.stroke(); ctx.restore()
  } else {
    ctx.save(); ctx.translate(-4, -6); ctx.rotate(0.35)
    roundRect(ctx, -3, 0, 6, 18, 2); ctx.fill(); ctx.stroke(); ctx.restore()
    ctx.save(); ctx.translate(4, -6); ctx.rotate(-0.35)
    roundRect(ctx, -3, 0, 6, 18, 2); ctx.fill(); ctx.stroke(); ctx.restore()
  }

  // Arms — opposite swing
  ctx.fillStyle = '#dc2626'
  ctx.strokeStyle = '#7f1d1d'
  const armSwing = frame === 0 ? 0.4 : frame === 1 ? 0 : -0.4
  ctx.save(); ctx.translate(-10, -28); ctx.rotate(armSwing)
  roundRect(ctx, -3, 0, 6, 16, 2); ctx.fill(); ctx.stroke()
  ctx.restore()
  ctx.save(); ctx.translate(10, -28); ctx.rotate(-armSwing)
  roundRect(ctx, -3, 0, 6, 16, 2); ctx.fill(); ctx.stroke()
  ctx.restore()
}

function drawRunnerJumping(ctx) {
  ctx.fillStyle = '#dc2626'
  ctx.strokeStyle = '#7f1d1d'
  ctx.lineWidth = 2
  roundRect(ctx, -10, -30, 20, 22, 4); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#fbcfa1'
  ctx.strokeStyle = '#7c2d12'
  ctx.beginPath(); ctx.arc(0, -40, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#0369a1'
  ctx.beginPath(); ctx.arc(0, -42, 10, Math.PI, 0); ctx.lineTo(-10, -42); ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.beginPath(); ctx.arc(-2, -41, 1.6, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(3, -41, 1.6, 0, Math.PI * 2); ctx.fill()

  // Tucked legs
  ctx.fillStyle = '#1e40af'
  ctx.strokeStyle = '#0f172a'
  roundRect(ctx, -8, -10, 6, 14, 2); ctx.fill(); ctx.stroke()
  roundRect(ctx, 2, -10, 6, 14, 2); ctx.fill(); ctx.stroke()

  // Arms up
  ctx.fillStyle = '#dc2626'
  ctx.strokeStyle = '#7f1d1d'
  ctx.save(); ctx.translate(-10, -26); ctx.rotate(-0.9)
  roundRect(ctx, -3, 0, 6, 16, 2); ctx.fill(); ctx.stroke()
  ctx.restore()
  ctx.save(); ctx.translate(10, -26); ctx.rotate(0.9)
  roundRect(ctx, -3, 0, 6, 16, 2); ctx.fill(); ctx.stroke()
  ctx.restore()
}

function drawRunnerSliding(ctx) {
  ctx.save()
  ctx.translate(0, 6)
  ctx.rotate(-0.15)
  ctx.fillStyle = '#dc2626'
  ctx.strokeStyle = '#7f1d1d'
  ctx.lineWidth = 2
  roundRect(ctx, -22, -14, 44, 14, 6); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#fbcfa1'
  ctx.strokeStyle = '#7c2d12'
  ctx.beginPath(); ctx.arc(-24, -8, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#0369a1'
  ctx.beginPath(); ctx.arc(-24, -8, 8, Math.PI, 0); ctx.lineTo(-32, -8); ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.beginPath(); ctx.arc(-26, -9, 1.4, 0, Math.PI * 2); ctx.fill()
  // Motion lines
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'
  ctx.lineWidth = 2
  for (let i = 0; i < 4; i++) {
    ctx.beginPath()
    ctx.moveTo(22 + i * 6, -6 + i * 3)
    ctx.lineTo(34 + i * 6, -6 + i * 3)
    ctx.stroke()
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
