// TempleRunner — forced-3D pseudo-perspective jungle run.
//
// Uses the same lane-projection trick as SubwayRunner but adds:
//   • corner turns (path visibly bends; you must swipe/arrow at the
//     right time to stay on it — miss and you fall off the edge)
//   • gap jumps (long pits)
//   • vine ducks (slide under)
//   • proximity indicator for a chasing monkey — arrows glow red as
//     the monkey gets close, kills you if the meter tops out
//   • gems (rare, high-value) and coins (common)
//   • upgrade mission board with three procedurally-picked goals per
//     run; completing them awards permanent multipliers stored in
//     localStorage
//
// PRNG: mulberry32. Best score under `arcade.temple.best`. Upgrades
// under `arcade.temple.upgrades` (JSON).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GameShell from '../../components/arcade/GameShell'
import { getSfx } from '../../components/arcade/sfx'

const BEST_KEY = 'arcade.temple.best'
const UPG_KEY = 'arcade.temple.upgrades'
const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const LOGICAL_W = 480
const LOGICAL_H = 700
const HORIZON_Y = 220
const LANE_X = [-0.35, 0, 0.35]

const readBest = () => { try { return parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0 } catch { return 0 } }
const writeBest = (v) => { try { localStorage.setItem(BEST_KEY, String(v)) } catch {} }
const readUpg = () => {
  try { return JSON.parse(localStorage.getItem(UPG_KEY) || '{}') || {} } catch { return {} }
}
const writeUpg = (v) => { try { localStorage.setItem(UPG_KEY, JSON.stringify(v)) } catch {} }

const project = (laneOffX, z) => {
  const scale = 1 / (1 + z * 0.02)
  const x = LOGICAL_W / 2 + laneOffX * (LOGICAL_W * 0.55) * scale
  const y = HORIZON_Y + (LOGICAL_H - HORIZON_Y) * (1 - scale) + 20 * scale
  return { x, y, scale }
}

const genMissions = (rand) => {
  const pool = [
    { id: 'run500', label: 'Run 500m in one life', target: 500, kind: 'distance' },
    { id: 'run1000', label: 'Run 1000m in one life', target: 1000, kind: 'distance' },
    { id: 'coins50', label: 'Collect 50 coins', target: 50, kind: 'coins' },
    { id: 'coins120', label: 'Collect 120 coins', target: 120, kind: 'coins' },
    { id: 'gems3', label: 'Grab 3 gems in one run', target: 3, kind: 'gems' },
    { id: 'turn10', label: 'Nail 10 corners', target: 10, kind: 'turns' },
    { id: 'slide8', label: 'Slide under 8 vines', target: 8, kind: 'slides' },
    { id: 'jump12', label: 'Jump 12 gaps', target: 12, kind: 'jumps' },
  ]
  // pick 3 without repetition
  const out = []
  const used = new Set()
  while (out.length < 3) {
    const idx = (rand() * pool.length) | 0
    if (used.has(idx)) continue
    used.add(idx)
    out.push({ ...pool[idx], progress: 0, done: false })
  }
  return out
}

export default function TempleRunner() {
  const canvasRef = useRef(null)
  const stateRef = useRef(null)
  const rafRef = useRef(0)
  const sfx = useMemo(() => getSfx(), [])

  const [score, setScore] = useState(0)
  const [best, setBest] = useState(readBest())
  const [coins, setCoins] = useState(0)
  const [gems, setGems] = useState(0)
  const [monkey, setMonkey] = useState(0)     // 0..1 proximity
  const [status, setStatus] = useState('ready')
  const [soundOn, setSoundOn] = useState(true)
  const [gameOver, setGameOver] = useState(null)
  const [missions, setMissions] = useState([])
  const [upgrades, setUpgrades] = useState(readUpg())

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
    const initialMissions = genMissions(rand)
    setMissions(initialMissions)
    stateRef.current = {
      rand, seed,
      lane: 1,
      laneT: 1,
      jumpH: 0,
      jumpVy: 0,
      slide: 0,
      obstacles: [],   // types: gap / vine / rock
      coins: [],
      gems: [],
      pathBend: 0,     // current path curvature offset (radians per z unit)
      turnAheadZ: 40 + rand() * 30,  // z distance to next required turn
      turnDir: 0,      // -1 or 1 (required swipe)
      distance: 0,
      speed: 260,
      score: 0,
      coinCount: 0,
      gemCount: 0,
      turnCount: 0,
      slideCount: 0,
      jumpCount: 0,
      monkeyProx: 0.2,
      shake: 0,
      alive: true,
      splat: null,
      runFrame: 0,
      runTime: 0,
      spawnZ: 40,
      floaters: [],
      trail: [],
      missions: initialMissions,
    }
  }, [])

  useEffect(() => { initWorld() }, [initWorld])

  const reset = useCallback(() => {
    initWorld()
    setScore(0)
    setCoins(0)
    setGems(0)
    setMonkey(0)
    setGameOver(null)
    setStatus('ready')
  }, [initWorld])

  const changeLane = useCallback((delta) => {
    const s = stateRef.current
    if (!s || !s.alive) return
    s.lane = Math.max(0, Math.min(2, s.lane + delta))
    // Turn detection — if a corner is close and lane change matches direction
    if (s.turnDir !== 0 && s.turnAheadZ < 6 && Math.sign(delta) === s.turnDir) {
      s.turnCount += 1
      s.floaters.push({ x: LOGICAL_W / 2, y: 260, t: 0, text: 'Turn!' })
      s.turnDir = 0
      // Reset monkey proximity a bit — good turn buys you space.
      s.monkeyProx = Math.max(0, s.monkeyProx - 0.15)
      sfx.chirp()
    }
  }, [sfx])

  const doJump = useCallback(() => {
    const s = stateRef.current
    if (!s || !s.alive) return
    if (s.jumpH <= 0.01 && s.slide <= 0) {
      s.jumpVy = -560
      s.jumpH = 0.001
      s.jumpCount += 1
      sfx.jump()
    }
  }, [sfx])

  const doSlide = useCallback(() => {
    const s = stateRef.current
    if (!s || !s.alive) return
    if (s.jumpH <= 0.01 && s.slide <= 0) {
      s.slide = 0.6
      s.slideCount += 1
      sfx.thrust()
    }
  }, [sfx])

  const startIfReady = useCallback(() => {
    setStatus((p) => p === 'ready' ? 'playing' : p)
  }, [])

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

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    let sx = 0, sy = 0, active = false
    const onDown = (e) => { sx = e.clientX; sy = e.clientY; active = true; startIfReady() }
    const onUp = (e) => {
      if (!active) return
      active = false
      const dx = e.clientX - sx, dy = e.clientY - sy
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) { doJump(); return }
      if (Math.abs(dx) > Math.abs(dy)) changeLane(dx > 0 ? 1 : -1)
      else if (dy < 0) doJump()
      else doSlide()
    }
    c.addEventListener('pointerdown', onDown)
    c.addEventListener('pointerup', onUp)
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
    s.laneT += (s.lane - s.laneT) * Math.min(1, dt * 12)

    // Jump physics
    if (s.jumpH > 0 || s.jumpVy !== 0) {
      s.jumpVy += 1400 * dt
      s.jumpH -= s.jumpVy * dt
      if (s.jumpH < 0) { s.jumpH = 0; s.jumpVy = 0 }
    }
    if (s.slide > 0) s.slide = Math.max(0, s.slide - dt)

    // Run cycle
    s.runTime += dt
    if (s.runTime > 0.09) { s.runTime = 0; s.runFrame = (s.runFrame + 1) % 3 }

    // Distance
    const speedMult = 1 + (upgrades.speedBonus || 0)
    const speed = s.speed * speedMult
    s.distance += speed * dt
    // Move things toward player in z
    for (const o of s.obstacles) o.z -= speed * dt * 0.02
    for (const c of s.coins) c.z -= speed * dt * 0.02
    for (const g of s.gems) g.z -= speed * dt * 0.02
    s.spawnZ -= speed * dt * 0.02
    if (s.turnAheadZ > 0) s.turnAheadZ -= speed * dt * 0.02

    if (s.spawnZ <= 0) {
      spawnPattern(s)
      s.spawnZ = 22 + s.rand() * 20 - Math.min(12, s.distance / 250)
    }

    // Turn management
    if (s.turnAheadZ <= 0) {
      // Missed the turn — the runner "falls off"
      if (s.turnDir !== 0) {
        onDeath(s, 'fell off the edge')
        return
      }
      // Otherwise, roll a new turn
      s.turnDir = s.rand() < 0.5 ? -1 : 1
      s.turnAheadZ = 30 + s.rand() * 25
      // Give a lookahead arrow (implicit via draw)
    }

    // Cull
    s.obstacles = s.obstacles.filter((o) => o.z > -3)
    s.coins = s.coins.filter((c) => c.z > -3 && !c.taken)
    s.gems = s.gems.filter((g) => g.z > -3 && !g.taken)

    // Collision at z ~ 0
    for (const o of s.obstacles) {
      if (o.z > 0.6 || o.z < -0.6 || o.lane !== s.lane) continue
      if (o.type === 'gap' && s.jumpH > 0.5) continue
      if (o.type === 'vine' && s.slide > 0) continue
      if (o.type === 'rock' && (s.jumpH > 0.7)) continue
      onDeath(s, 'faceplant')
      break
    }

    // Coins
    for (const c of s.coins) {
      if (c.taken) continue
      if (c.lane === s.lane && c.z > -0.5 && c.z < 0.7 && Math.abs(s.jumpH - c.h) < 0.6) {
        c.taken = true
        s.coinCount += 1
        setCoins(s.coinCount)
        s.floaters.push({ x: LOGICAL_W / 2 + LANE_X[c.lane] * 200, y: LOGICAL_H * 0.6, t: 0, text: '+1' })
        sfx.coin()
      }
    }
    // Gems
    for (const g of s.gems) {
      if (g.taken) continue
      if (g.lane === s.lane && g.z > -0.5 && g.z < 0.7) {
        g.taken = true
        s.gemCount += 1
        setGems(s.gemCount)
        s.floaters.push({ x: LOGICAL_W / 2 + LANE_X[g.lane] * 200, y: LOGICAL_H * 0.5, t: 0, text: '💎 +25' })
        s.distance += 25   // bonus metres
        sfx.win()
      }
    }

    // Monkey proximity — climbs slowly, kicked down by turns / gems
    s.monkeyProx = Math.min(1, s.monkeyProx + dt * 0.06)
    setMonkey(s.monkeyProx)
    if (s.monkeyProx >= 0.999) onDeath(s, 'caught')

    // Update mission progress
    const m = s.missions
    for (const mi of m) {
      if (mi.done) continue
      let v = 0
      if (mi.kind === 'distance') v = s.distance
      else if (mi.kind === 'coins') v = s.coinCount
      else if (mi.kind === 'gems') v = s.gemCount
      else if (mi.kind === 'turns') v = s.turnCount
      else if (mi.kind === 'slides') v = s.slideCount
      else if (mi.kind === 'jumps') v = s.jumpCount
      mi.progress = v
      if (v >= mi.target) {
        mi.done = true
        s.floaters.push({ x: LOGICAL_W / 2, y: 100, t: 0, text: `Mission: ${mi.label}` })
        // Grant permanent bonus
        const up = readUpg()
        up.speedBonus = (up.speedBonus || 0) + 0.02
        up.gems = (up.gems || 0) + 1
        writeUpg(up)
        setUpgrades(up)
        sfx.win()
      }
    }
    setMissions([...m])

    // Speed ramp
    s.speed = Math.min(560, 260 + s.distance * 0.14)

    // Score
    const newScore = Math.floor(s.distance)
    if (newScore > s.score) { s.score = newScore; setScore(newScore) }

    // Trail
    if (s.jumpH <= 0.05 && s.slide <= 0 && Math.random() < 0.6) {
      s.trail.push({ x: LOGICAL_W / 2 + LANE_X[s.lane] * 200 * 0.9, y: LOGICAL_H - 110, vx: (Math.random() - 0.5) * 40, vy: 30 + Math.random() * 40, t: 0 })
    }
    for (const q of s.trail) { q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt }
    s.trail = s.trail.filter((q) => q.t < 0.6)

    // Floaters
    for (const fl of s.floaters) { fl.t += dt; fl.y -= 50 * dt }
    s.floaters = s.floaters.filter((fl) => fl.t < 1.4)

    s.shake = Math.max(0, s.shake - dt * 5)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sfx, upgrades.speedBonus])

  const onDeath = (s, cause = 'died') => {
    if (!s.alive) return
    s.alive = false
    s.shake = 4
    sfx.death()
    s.splat = Array.from({ length: 20 }, () => ({ x: LOGICAL_W / 2 + LANE_X[s.lane] * 200, y: LOGICAL_H - 130, vx: (Math.random() - 0.5) * 260, vy: -Math.random() * 260, r: 3 + Math.random() * 3, c: ['#eab308', '#dc2626', '#fff'][(Math.random() * 3) | 0], t: 0 }))
    const final = s.score
    setStatus('over')
    setGameOver({ score: final, coins: s.coinCount, gems: s.gemCount, cause })
    setBest((prev) => { if (final > prev) { writeBest(final); return final } return prev })
  }

  const overlay = status === 'over' && gameOver ? (
    <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-auto">
      <div className="bg-slate-900/95 border border-white/15 rounded-2xl px-6 py-5 text-center max-w-md w-full">
        <div className="text-white/70 text-xs uppercase tracking-widest mb-1">You {gameOver.cause}</div>
        <div className="text-white text-3xl font-bold mb-1">{gameOver.score}m</div>
        <div className="text-white/60 text-xs mb-3">Best: {best}m · {gameOver.coins} coins · {gameOver.gems} gems</div>

        <div className="text-left text-white/80 text-sm mb-4">
          <div className="text-white/50 text-[10px] uppercase tracking-widest mb-2">Missions this run</div>
          <ul className="space-y-1">
            {missions.map((mi) => (
              <li key={mi.id} className="flex items-center justify-between text-xs">
                <span className={mi.done ? 'text-emerald-300' : 'text-white/60'}>
                  {mi.done ? '✓' : '·'} {mi.label}
                </span>
                <span className="text-white/40 tabular-nums">
                  {Math.min(mi.target, Math.floor(mi.progress))}/{mi.target}
                </span>
              </li>
            ))}
          </ul>
          {(upgrades.gems || 0) > 0 && (
            <div className="text-[10px] text-fuchsia-300 mt-3">
              Permanent: +{Math.round(((upgrades.speedBonus || 0) * 100))}% speed · {upgrades.gems || 0} runs completed
            </div>
          )}
        </div>

        <button type="button" onClick={reset}
          className="px-4 py-2 rounded-lg font-semibold bg-gradient-to-r from-amber-400 to-rose-500 text-slate-900 hover:brightness-110 transition">
          Run again
        </button>
      </div>
    </div>
  ) : null

  return (
    <GameShell
      title="Temple Runner"
      category="Runner"
      score={score}
      best={best}
      level={1 + Math.floor(score / 200)}
      status={status}
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn((v) => !v)}
      onPause={() => setStatus((p) => p === 'paused' ? 'playing' : p === 'playing' ? 'paused' : p)}
      onRestart={reset}
      overlay={overlay}
      extraStats={
        <>
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Coins</span>
            <span className="text-xl font-bold text-amber-300 tabular-nums">{coins}</span>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Gems</span>
            <span className="text-xl font-bold text-fuchsia-300 tabular-nums">{gems}</span>
          </div>
          <div className="flex flex-col items-start min-w-[64px]">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Monkey</span>
            <div className="w-16 h-2 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500 transition-all"
                   style={{ width: `${Math.round(monkey * 100)}%` }} />
            </div>
          </div>
        </>
      }
      controls={[
        { key: '← / →', label: 'Turn / lane' },
        { key: '↑', label: 'Jump' },
        { key: '↓', label: 'Slide' },
        { key: 'Swipe', label: 'All (mobile)' },
        { key: 'P', label: 'Pause' },
        { key: 'R', label: 'Restart' },
      ]}
      footer={missions.length ? (
        <div className="mt-4 luxe-card-alt rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-3">
          <div className="text-[10px] uppercase tracking-widest text-white/40 mb-2">Missions this run</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            {missions.map((mi) => (
              <div key={mi.id}
                   className={`px-3 py-2 rounded-lg border ${mi.done ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200' : 'border-white/10 bg-white/5 text-white/70'}`}>
                <div className="flex items-center justify-between">
                  <span>{mi.done ? '✓' : '·'} {mi.label}</span>
                  <span className="text-white/50 tabular-nums">
                    {Math.min(mi.target, Math.floor(mi.progress))}/{mi.target}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    >
      <canvas
        ref={canvasRef}
        className="w-full block max-h-[80vh]"
        style={{ aspectRatio: '3 / 4', touchAction: 'none' }}
      />
    </GameShell>
  )
}

// ── Spawn ──
function spawnPattern(s) {
  const r = s.rand()
  const z = 40
  if (r < 0.3) {
    // gap in one lane (must jump)
    const lane = (s.rand() * 3) | 0
    s.obstacles.push({ lane, z, type: 'gap' })
  } else if (r < 0.55) {
    // vine (must slide)
    const lane = (s.rand() * 3) | 0
    s.obstacles.push({ lane, z, type: 'vine' })
  } else if (r < 0.75) {
    // rock (must jump)
    const lane = (s.rand() * 3) | 0
    s.obstacles.push({ lane, z, type: 'rock' })
  } else if (r < 0.88) {
    // coin trail
    const lane = (s.rand() * 3) | 0
    const arc = s.rand() < 0.4
    for (let i = 0; i < 6; i++) {
      const h = arc ? Math.sin((i / 5) * Math.PI) * 1.4 : 0
      s.coins.push({ lane, z: z - i * 2, taken: false, h })
    }
  } else {
    // gem
    const lane = (s.rand() * 3) | 0
    s.gems.push({ lane, z, taken: false })
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

  // Jungle sky
  const grd = ctx.createLinearGradient(0, 0, 0, HORIZON_Y + 40)
  grd.addColorStop(0, '#14532d')
  grd.addColorStop(1, '#a3e635')
  ctx.fillStyle = grd
  ctx.fillRect(0, 0, LOGICAL_W, HORIZON_Y + 40)

  // Distant temple silhouette
  ctx.fillStyle = 'rgba(60,30,20,0.7)'
  for (let i = 0; i < 6; i++) {
    const x = i * 100 - 20
    ctx.fillRect(x, HORIZON_Y - 40 - (i % 3) * 20, 60, 80)
  }
  // Tree line
  ctx.fillStyle = '#166534'
  for (let i = 0; i < 20; i++) {
    const x = (i * 30 + (s.distance * 0.3) % 30) % LOGICAL_W
    ctx.beginPath()
    ctx.arc(x, HORIZON_Y + 4, 24, Math.PI, 0)
    ctx.fill()
  }
  // Ground path
  const grndG = ctx.createLinearGradient(0, HORIZON_Y, 0, LOGICAL_H)
  grndG.addColorStop(0, '#4b2e1a')
  grndG.addColorStop(1, '#78350f')
  ctx.fillStyle = grndG
  ctx.fillRect(0, HORIZON_Y, LOGICAL_W, LOGICAL_H - HORIZON_Y)

  // Path (stone-tiled)
  ctx.fillStyle = '#a8a29e'
  ctx.beginPath()
  ctx.moveTo(LOGICAL_W / 2 - 40, HORIZON_Y)
  ctx.lineTo(LOGICAL_W / 2 + 40, HORIZON_Y)
  ctx.lineTo(LOGICAL_W * 0.9, LOGICAL_H + 40)
  ctx.lineTo(LOGICAL_W * 0.1, LOGICAL_H + 40)
  ctx.closePath()
  ctx.fill()

  // Tile stripes
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'
  ctx.setLineDash([14, 22])
  ctx.lineDashOffset = -((s.distance * 0.4) % 36)
  ctx.lineWidth = 2
  for (const off of [-0.18, 0.18]) {
    ctx.beginPath()
    ctx.moveTo(LOGICAL_W / 2 + off * 40, HORIZON_Y + 4)
    ctx.lineTo(LOGICAL_W / 2 + off * LOGICAL_W * 1.2, LOGICAL_H + 20)
    ctx.stroke()
  }
  ctx.setLineDash([])

  // Turn arrow indicator
  if (s.turnDir !== 0 && s.turnAheadZ < 20) {
    const glow = 1 - Math.max(0, s.turnAheadZ / 20)
    ctx.fillStyle = `rgba(251,191,36,${0.4 + glow * 0.6})`
    ctx.font = 'bold 42px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(s.turnDir < 0 ? '⟵' : '⟶', LOGICAL_W / 2, HORIZON_Y - 10)
    ctx.font = '12px system-ui, sans-serif'
    ctx.fillText(`Turn in ${Math.max(0, Math.floor(s.turnAheadZ))}m`, LOGICAL_W / 2, HORIZON_Y - 40)
  }

  // Vine hangs top (visual)
  ctx.strokeStyle = 'rgba(20,83,45,0.6)'
  ctx.lineWidth = 4
  for (let i = 0; i < 8; i++) {
    const x = (i * 65 + (s.distance * 0.5) % 65) % LOGICAL_W
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.quadraticCurveTo(x + 10, HORIZON_Y - 30, x - 4, HORIZON_Y)
    ctx.stroke()
  }

  // Depth-sort items
  const items = []
  for (const o of s.obstacles) items.push({ kind: 'obstacle', z: o.z, obj: o })
  for (const c of s.coins) if (!c.taken) items.push({ kind: 'coin', z: c.z, obj: c })
  for (const g of s.gems) if (!g.taken) items.push({ kind: 'gem', z: g.z, obj: g })
  items.sort((a, b) => b.z - a.z)
  for (const it of items) {
    if (it.kind === 'obstacle') drawObstacle(ctx, it.obj)
    else if (it.kind === 'coin') drawCoin(ctx, it.obj)
    else drawGem(ctx, it.obj)
  }

  // Trail
  for (const q of s.trail) {
    const a = Math.max(0, 1 - q.t / 0.6)
    ctx.globalAlpha = a
    ctx.fillStyle = 'rgba(150,120,80,0.5)'
    ctx.beginPath(); ctx.arc(q.x, q.y, 3, 0, Math.PI * 2); ctx.fill()
  }
  ctx.globalAlpha = 1

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
    const a = Math.max(0, 1 - fl.t / 1.4)
    ctx.globalAlpha = a
    ctx.font = 'bold 18px system-ui, sans-serif'
    ctx.fillStyle = '#fef3c7'
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'
    ctx.lineWidth = 3
    ctx.strokeText(fl.text, fl.x, fl.y)
    ctx.fillText(fl.text, fl.x, fl.y)
  }
  ctx.globalAlpha = 1

  if (status === 'ready') {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(30, LOGICAL_H / 2 - 70, LOGICAL_W - 60, 140)
    ctx.textAlign = 'center'
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 22px system-ui, sans-serif'
    ctx.fillText('Race the monkey', LOGICAL_W / 2, LOGICAL_H / 2 - 20)
    ctx.font = '13px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.fillText('Arrows / swipe. Turn at corners. Jump gaps. Slide under vines.', LOGICAL_W / 2, LOGICAL_H / 2 + 6)
    ctx.fillText('Missions unlock permanent speed bonuses.', LOGICAL_W / 2, LOGICAL_H / 2 + 26)
  }

  ctx.restore()
}

function drawObstacle(ctx, o) {
  const { x, y, scale } = project(LANE_X[o.lane], o.z)
  if (o.type === 'gap') {
    // dark gap in the ground
    ctx.fillStyle = '#0f172a'
    const w = 110 * scale, h = 20 * scale
    ctx.beginPath()
    ctx.ellipse(x, y - h / 2, w / 2, h / 2 + 6 * scale, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#000'
    ctx.stroke()
  } else if (o.type === 'vine') {
    // hanging vines
    ctx.fillStyle = '#14532d'
    ctx.strokeStyle = '#052e16'
    ctx.lineWidth = 2 * scale
    const w = 100 * scale
    ctx.fillRect(x - w / 2, y - 100 * scale, w, 12 * scale)
    ctx.strokeRect(x - w / 2, y - 100 * scale, w, 12 * scale)
    for (let i = 0; i < 4; i++) {
      const vx = x - w / 2 + (i + 0.5) * (w / 4)
      ctx.strokeStyle = '#166534'
      ctx.lineWidth = 3 * scale
      ctx.beginPath()
      ctx.moveTo(vx, y - 90 * scale)
      ctx.quadraticCurveTo(vx + 4, y - 60 * scale, vx - 3, y - 30 * scale)
      ctx.stroke()
      // leaf
      ctx.fillStyle = '#22c55e'
      ctx.beginPath(); ctx.ellipse(vx - 3, y - 30 * scale, 6 * scale, 3 * scale, 0, 0, Math.PI * 2); ctx.fill()
    }
  } else {
    // rock — dark stone
    ctx.fillStyle = '#57534e'
    ctx.strokeStyle = '#292524'
    ctx.lineWidth = 2 * scale
    const w = 90 * scale, h = 60 * scale
    ctx.beginPath()
    ctx.ellipse(x, y - h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.beginPath(); ctx.ellipse(x - 10 * scale, y - h * 0.7, 12 * scale, 6 * scale, -0.3, 0, Math.PI * 2); ctx.fill()
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
}

function drawGem(ctx, g) {
  const { x, y, scale } = project(LANE_X[g.lane], g.z)
  const cy = y - 45 * scale
  ctx.save()
  ctx.translate(x, cy)
  const size = 14 * scale
  ctx.fillStyle = '#c026d3'
  ctx.strokeStyle = '#701a75'
  ctx.lineWidth = 2 * scale
  ctx.beginPath()
  ctx.moveTo(0, -size)
  ctx.lineTo(size, 0)
  ctx.lineTo(0, size)
  ctx.lineTo(-size, 0)
  ctx.closePath()
  ctx.fill(); ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.beginPath()
  ctx.moveTo(0, -size)
  ctx.lineTo(size * 0.5, -size * 0.3)
  ctx.lineTo(0, -size * 0.2)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function drawRunner(ctx, s) {
  const laneOff = LANE_X[0] + (LANE_X[2] - LANE_X[0]) * (s.laneT / 2)
  const laneX = LOGICAL_W / 2 + laneOff * 200
  const groundY = LOGICAL_H - 110
  const y = groundY - s.jumpH * 80

  ctx.save()
  ctx.translate(laneX, y)
  // shadow
  ctx.globalAlpha = Math.max(0.15, 0.4 - s.jumpH * 0.2)
  ctx.fillStyle = '#000'
  ctx.beginPath(); ctx.ellipse(0, 22, 22, 6, 0, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 1

  if (s.slide > 0) drawSlide(ctx)
  else if (s.jumpH > 0.1) drawJump(ctx)
  else drawRun(ctx, s.runFrame)
  ctx.restore()
}

function drawRun(ctx, frame) {
  // Explorer with hat + backpack
  ctx.fillStyle = '#84cc16'   // shirt
  ctx.strokeStyle = '#365314'
  ctx.lineWidth = 2
  roundRect(ctx, -10, -34, 20, 26, 4); ctx.fill(); ctx.stroke()

  // Backpack
  ctx.fillStyle = '#7c2d12'
  roundRect(ctx, -8, -30, 16, 18, 3); ctx.fill(); ctx.stroke()

  // Head
  ctx.fillStyle = '#fbcfa1'
  ctx.strokeStyle = '#7c2d12'
  ctx.beginPath(); ctx.arc(0, -44, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke()

  // Fedora
  ctx.fillStyle = '#78350f'
  ctx.strokeStyle = '#3f1d0a'
  ctx.beginPath()
  ctx.ellipse(0, -50, 14, 4, 0, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()
  ctx.beginPath()
  ctx.arc(0, -52, 8, Math.PI, 0)
  ctx.lineTo(-8, -52); ctx.closePath()
  ctx.fill(); ctx.stroke()

  ctx.fillStyle = '#fff'
  ctx.beginPath(); ctx.arc(-3, -44, 1.4, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(3, -44, 1.4, 0, Math.PI * 2); ctx.fill()

  // Legs
  ctx.fillStyle = '#1f2937'
  ctx.strokeStyle = '#0f172a'
  ctx.lineWidth = 1.5
  const legRot = frame === 0 ? -0.35 : frame === 1 ? 0 : 0.35
  ctx.save(); ctx.translate(-4, -6); ctx.rotate(legRot)
  roundRect(ctx, -3, 0, 6, 18, 2); ctx.fill(); ctx.stroke()
  ctx.restore()
  ctx.save(); ctx.translate(4, -6); ctx.rotate(-legRot)
  roundRect(ctx, -3, 0, 6, 18, 2); ctx.fill(); ctx.stroke()
  ctx.restore()

  // Arms
  ctx.fillStyle = '#fbcfa1'
  ctx.strokeStyle = '#7c2d12'
  const armSwing = frame === 0 ? 0.4 : frame === 1 ? 0 : -0.4
  ctx.save(); ctx.translate(-10, -28); ctx.rotate(armSwing)
  roundRect(ctx, -3, 0, 6, 16, 2); ctx.fill(); ctx.stroke()
  ctx.restore()
  ctx.save(); ctx.translate(10, -28); ctx.rotate(-armSwing)
  roundRect(ctx, -3, 0, 6, 16, 2); ctx.fill(); ctx.stroke()
  ctx.restore()
}

function drawJump(ctx) {
  ctx.fillStyle = '#84cc16'
  ctx.strokeStyle = '#365314'
  ctx.lineWidth = 2
  roundRect(ctx, -10, -30, 20, 22, 4); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#fbcfa1'
  ctx.strokeStyle = '#7c2d12'
  ctx.beginPath(); ctx.arc(0, -40, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#78350f'
  ctx.beginPath(); ctx.arc(0, -48, 10, Math.PI, 0); ctx.lineTo(-10, -48); ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.beginPath(); ctx.arc(-3, -40, 1.4, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(3, -40, 1.4, 0, Math.PI * 2); ctx.fill()

  ctx.fillStyle = '#1f2937'
  roundRect(ctx, -8, -10, 6, 14, 2); ctx.fill(); ctx.stroke()
  roundRect(ctx, 2, -10, 6, 14, 2); ctx.fill(); ctx.stroke()

  ctx.fillStyle = '#fbcfa1'
  ctx.save(); ctx.translate(-10, -26); ctx.rotate(-0.9)
  roundRect(ctx, -3, 0, 6, 16, 2); ctx.fill(); ctx.stroke()
  ctx.restore()
  ctx.save(); ctx.translate(10, -26); ctx.rotate(0.9)
  roundRect(ctx, -3, 0, 6, 16, 2); ctx.fill(); ctx.stroke()
  ctx.restore()
}

function drawSlide(ctx) {
  ctx.save()
  ctx.translate(0, 8); ctx.rotate(-0.2)
  ctx.fillStyle = '#84cc16'
  ctx.strokeStyle = '#365314'
  ctx.lineWidth = 2
  roundRect(ctx, -22, -14, 44, 14, 6); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#fbcfa1'
  ctx.strokeStyle = '#7c2d12'
  ctx.beginPath(); ctx.arc(-24, -8, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#78350f'
  ctx.beginPath(); ctx.arc(-24, -12, 8, Math.PI, 0); ctx.lineTo(-32, -12); ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.beginPath(); ctx.arc(-26, -9, 1.4, 0, Math.PI * 2); ctx.fill()

  ctx.strokeStyle = 'rgba(255,255,255,0.4)'
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
