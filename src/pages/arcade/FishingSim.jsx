// FishingSim.jsx — Side-view fishing simulation
//
// Sim game #5 of 5. Four-phase gameplay:
//
//   1. AIM   → hold-click to charge a power meter (0..1); release to cast.
//              Power maps to depth; deeper = rarer species.
//   2. WAIT  → lure sits at chosen depth. Fish approach from random sides
//              at species-specific speeds. If any fish's nose touches the
//              lure and lingers > 400ms, it commits to biting.
//   3. HOOK  → 500ms window to react — click "SET" once the "!" indicator
//              appears. Missing scares the fish off; too early wastes cast.
//   4. REEL  → alternating left/right click drags reel the fish in while
//              managing line tension. Too much tension → line snaps;
//              too little → fish gets slack and escapes.
//
// Fish species (10): tiered by depth zone. XP unlocks deeper zones and
// higher-tier lures (baitLevel gates which species will bite).
//
// Encyclopedia:
//   Each caught species is recorded — count + rarest weight + zone. The
//   side panel shows unlocked / mysterious silhouettes for undiscovered
//   ones.
//
// Rendering:
//   • Parallax water backdrop: 3 layers of translucent bands drift at
//     different rates.
//   • Fish sprites: SVG paths with subtle tail-wobble animation via
//     transform.
//   • Line + lure drawn dynamically on a canvas overlay so the tension
//     bar physics stay smooth.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GameShell from '../../components/arcade/GameShell'
import { getSfx } from '../../components/arcade/sfx'

const WATER_TOP = 0.22             // fraction of canvas occupied by sky
const CANVAS_W = 900
const CANVAS_H = 560

// ── Species ──
const SPECIES = [
  { id: 'minnow',    name: 'Minnow',      icon: '🐟', zone: 'shallow', speed: 60, weight: [0.05, 0.2], xp: 5,  bait: 1, colour: '#a5b4fc' },
  { id: 'perch',     name: 'Perch',       icon: '🐠', zone: 'shallow', speed: 45, weight: [0.4, 1.2],  xp: 12, bait: 1, colour: '#fbbf24' },
  { id: 'bass',      name: 'Bass',        icon: '🐟', zone: 'mid',     speed: 35, weight: [1.5, 4.2],  xp: 25, bait: 2, colour: '#34d399' },
  { id: 'trout',     name: 'Trout',       icon: '🐠', zone: 'mid',     speed: 55, weight: [1.0, 3.5],  xp: 22, bait: 2, colour: '#fb7185' },
  { id: 'catfish',   name: 'Catfish',     icon: '🐡', zone: 'mid',     speed: 25, weight: [4.0, 12],   xp: 40, bait: 2, colour: '#a78bfa' },
  { id: 'tuna',      name: 'Tuna',        icon: '🐟', zone: 'deep',    speed: 70, weight: [20, 80],    xp: 80, bait: 3, colour: '#22d3ee' },
  { id: 'swordfish', name: 'Swordfish',   icon: '🐟', zone: 'deep',    speed: 90, weight: [60, 180],   xp: 120,bait: 3, colour: '#e5e7eb' },
  { id: 'grouper',   name: 'Grouper',     icon: '🐡', zone: 'deep',    speed: 30, weight: [30, 100],   xp: 95, bait: 3, colour: '#d97706' },
  { id: 'shark',     name: 'Shark',       icon: '🦈', zone: 'deep',    speed: 60, weight: [80, 400],   xp: 200,bait: 4, colour: '#94a3b8' },
  { id: 'anglerfish',name: 'Anglerfish',  icon: '🐟', zone: 'abyss',   speed: 20, weight: [3, 8],      xp: 300,bait: 4, colour: '#e879f9' },
]
const SPECIES_BY_ID = SPECIES.reduce((m, s) => { m[s.id] = s; return m }, {})

// ── Zones ── (depth ranges 0..1 of the water portion of canvas)
const ZONES = [
  { id: 'shallow', name: 'Shallow',    min: 0.00, max: 0.30, tint: '#3b82f6' },
  { id: 'mid',     name: 'Mid Water',  min: 0.30, max: 0.60, tint: '#1d4ed8' },
  { id: 'deep',    name: 'Deep Sea',   min: 0.60, max: 0.90, tint: '#0c247e' },
  { id: 'abyss',   name: 'Abyss',      min: 0.90, max: 1.00, tint: '#050a30' },
]

// ── Lures ──
const LURES = [
  { id: 'basic',   name: 'Basic',   baitLevel: 1, xpUnlock: 0,   attraction: 1.0 },
  { id: 'spinner', name: 'Spinner', baitLevel: 2, xpUnlock: 100, attraction: 1.3 },
  { id: 'jig',     name: 'Jig',     baitLevel: 3, xpUnlock: 400, attraction: 1.6 },
  { id: 'deep',    name: 'Deep-Sea',baitLevel: 4, xpUnlock: 1200,attraction: 2.0 },
]

// XP → zone unlocks
const ZONE_UNLOCKS = { shallow: 0, mid: 80, deep: 300, abyss: 900 }

const PHASE = { AIM: 'aim', WAIT: 'wait', HOOK: 'hook', REEL: 'reel', DONE: 'done' }

const STORAGE_KEY = 'sid-fishing-sim-v1'

function randBetween(a, b) { return a + Math.random() * (b - a) }
function fmtWeight(kg) {
  if (kg < 1) return `${(kg * 1000).toFixed(0)}g`
  return `${kg.toFixed(1)}kg`
}

function initialSave() {
  return { xp: 0, casts: 0, encyclopedia: {}, lure: 'basic' }
}
function loadSave() {
  try { return { ...initialSave(), ...(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')) } }
  catch { return initialSave() }
}

export default function FishingSim() {
  const canvasRef = useRef(null)
  const rafRef    = useRef(0)

  // Persistent progression.
  const boot = useMemo(() => loadSave(), [])
  const [xp, setXp]                   = useState(boot.xp || 0)
  const [casts, setCasts]             = useState(boot.casts || 0)
  const [encyclopedia, setEnc]        = useState(boot.encyclopedia || {})
  const [selectedLure, setLure]       = useState(boot.lure || 'basic')

  // Runtime.
  const [phase, setPhase]             = useState(PHASE.AIM)
  const [charging, setCharging]       = useState(false)
  const [power, setPower]             = useState(0)          // 0..1 while charging
  const [castPower, setCastPower]     = useState(0)          // fixed after cast
  const [lureDepth, setLureDepth]     = useState(0)
  const [lureX, setLureX]             = useState(300)
  const [fish, setFish]               = useState([])         // active fish array
  const [biterId, setBiterId]         = useState(null)       // id of committed biter
  const [biteAt, setBiteAt]           = useState(0)          // ts of bite window start
  const [reel, setReel]               = useState({ line: 100, tension: 0.4, distance: 100 }) // fish-side vs lure-side
  const [reelDir, setReelDir]         = useState('L')        // 'L' | 'R' alternation
  const [lastCatch, setLastCatch]     = useState(null)
  const [flash, setFlash]             = useState(null)
  const [soundOn, setSoundOn]         = useState(true)

  const sfx = useMemo(() => getSfx(), [])
  useEffect(() => sfx.setEnabled(soundOn), [soundOn, sfx])

  // Persist.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ xp, casts, encyclopedia, lure: selectedLure }))
    } catch { /* quota */ }
  }, [xp, casts, encyclopedia, selectedLure])

  // Derived: which zones + lures are unlocked?
  const unlockedZones = useMemo(() => ZONES.filter(z => xp >= (ZONE_UNLOCKS[z.id] ?? 0)), [xp])
  const unlockedLures = useMemo(() => LURES.filter(l => xp >= l.xpUnlock), [xp])
  const lureObj = useMemo(() => LURES.find(l => l.id === selectedLure) || LURES[0], [selectedLure])

  // Which zone is the lure currently in? (based on lureDepth 0..1)
  const currentZone = useMemo(() => {
    for (const z of ZONES) if (lureDepth >= z.min && lureDepth < z.max) return z
    return ZONES[ZONES.length - 1]
  }, [lureDepth])

  const zoneUnlocked = useMemo(
    () => unlockedZones.some(z => z.id === currentZone.id),
    [unlockedZones, currentZone]
  )

  const showFlash = (text, kind = 'ok') => {
    setFlash({ text, kind, ts: Date.now() })
    setTimeout(() => setFlash(f => f && f.text === text ? null : f), 1500)
  }

  // ── Charge power meter while mouse held during AIM ──
  useEffect(() => {
    if (!charging || phase !== PHASE.AIM) return
    let raf = 0
    let last = performance.now()
    let dir = 1
    const loop = (t) => {
      const dt = (t - last) / 1000
      last = t
      setPower(p => {
        let np = p + dir * dt * 0.9
        if (np > 1) { np = 1; dir = -1 }
        else if (np < 0) { np = 0; dir = 1 }
        return np
      })
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [charging, phase])

  // ── After cast: sink lure to target depth, spawn fish ──
  useEffect(() => {
    if (phase !== PHASE.WAIT) return
    let raf = 0
    let last = performance.now()
    let sinkComplete = false
    const target = castPower
    const spawnFish = () => {
      const zoneFish = SPECIES.filter(s => {
        const zone = ZONES.find(z => z.id === s.zone)
        return zone && target >= zone.min && target <= zone.max && s.bait <= lureObj.baitLevel
      })
      if (!zoneFish.length) return
      const sp = zoneFish[Math.floor(Math.random() * zoneFish.length)]
      const fromLeft = Math.random() < 0.5
      setFish(f => [
        ...f,
        {
          id: Math.random(),
          species: sp.id,
          x: fromLeft ? -40 : CANVAS_W + 40,
          y: WATER_TOP + (1 - WATER_TOP) * (target + randBetween(-0.03, 0.03)),
          vx: (fromLeft ? 1 : -1) * (sp.speed * (0.8 + Math.random() * 0.5)),
          interest: 0,
          weight: randBetween(sp.weight[0], sp.weight[1]),
          size: 22 + sp.weight[1] > 100 ? 42 : 22 + Math.min(28, sp.weight[1] * 1.5),
        },
      ])
    }
    let spawnTimer = 0
    const loop = (t) => {
      const dt = (t - last) / 1000
      last = t

      // Sink phase
      setLureDepth(d => {
        if (sinkComplete) return d
        const next = d + dt * 0.35
        if (next >= target) { sinkComplete = true; return target }
        return next
      })

      // Fish spawn (0.8..2.4s intervals)
      spawnTimer -= dt
      if (spawnTimer <= 0 && sinkComplete && zoneUnlocked && fish.length < 6) {
        spawnFish()
        spawnTimer = 0.8 + Math.random() * 1.6
      }

      // Move + interest logic
      setFish(prev => {
        const nextFish = []
        for (const f of prev) {
          let nx = f.x + f.vx * dt
          const dxToLure = lureX - nx
          const dyToLure = (WATER_TOP + (1 - WATER_TOP) * target) - f.y
          const dist = Math.hypot(dxToLure, dyToLure * CANVAS_H)
          // Attract towards lure when nearby
          let interest = f.interest
          const sp = SPECIES_BY_ID[f.species]
          if (dist < 120 && sp.bait <= lureObj.baitLevel) {
            interest += dt * lureObj.attraction * 0.7
            // Steer x towards lure
            const wanted = Math.sign(dxToLure) * sp.speed
            const blend = 0.05
            const nvx = f.vx * (1 - blend) + wanted * blend
            const closeEnough = dist < 22
            if (closeEnough && interest > 0.9 && !biterId) {
              setBiterId(f.id)
              setBiteAt(performance.now())
              setPhase(PHASE.HOOK)
              sfx.pop()
            }
            nextFish.push({ ...f, x: nx, vx: nvx, interest })
          } else {
            // Cruise past
            if (nx < -60 || nx > CANVAS_W + 60) continue
            nextFish.push({ ...f, x: nx, interest: Math.max(0, interest - dt * 0.2) })
          }
        }
        return nextFish
      })

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [phase, castPower, lureObj, biterId, zoneUnlocked, lureX, fish.length, sfx])

  // ── HOOK phase: 500ms react window ──
  useEffect(() => {
    if (phase !== PHASE.HOOK) return
    const timer = setTimeout(() => {
      // Missed the window — fish flees.
      showFlash('Missed — the fish got away.', 'err')
      setBiterId(null)
      setFish(f => f.filter(x => x.id !== biterId))
      setPhase(PHASE.AIM)
      setLureDepth(0)
      setPower(0)
      setCastPower(0)
      sfx.death()
    }, 500)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, biterId, sfx])

  // ── REEL phase: tension drifts up, alternating clicks reel it in ──
  useEffect(() => {
    if (phase !== PHASE.REEL) return
    let raf = 0
    let last = performance.now()
    const loop = (t) => {
      const dt = (t - last) / 1000
      last = t
      setReel(r => {
        // Tension drifts up over time (fish fights).
        const biter = fish.find(f => f.id === biterId)
        const sp = biter ? SPECIES_BY_ID[biter.species] : SPECIES[0]
        const fightMult = Math.min(2.2, 0.5 + (biter?.weight || 1) / 25)
        const tension = Math.max(0, r.tension + dt * 0.35 * fightMult)
        if (tension > 1) {
          // Line snapped.
          showFlash('Line snapped!', 'err')
          setBiterId(null)
          setFish([])
          setPhase(PHASE.AIM)
          setLureDepth(0)
          setPower(0)
          setCastPower(0)
          sfx.death()
          return { line: 100, tension: 0.4, distance: 100 }
        }
        if (tension < 0.05 && r.distance > 30) {
          // Slack — fish escapes.
          showFlash('Fish escaped — line went slack.', 'err')
          setBiterId(null)
          setFish([])
          setPhase(PHASE.AIM)
          setLureDepth(0)
          setPower(0)
          setCastPower(0)
          sfx.death()
          return { line: 100, tension: 0.4, distance: 100 }
        }
        return { ...r, tension }
      })
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, biterId, fish, sfx])

  // Canvas render loop (runs every phase).
  useEffect(() => {
    const draw = () => {
      renderScene(canvasRef.current, {
        phase, power, castPower, lureDepth, lureX, fish, biterId, reel, currentZone,
        zoneUnlocked, unlockedZones,
      })
      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [phase, power, castPower, lureDepth, lureX, fish, biterId, reel, currentZone, zoneUnlocked, unlockedZones])

  // ── Actions ──
  const cast = useCallback(() => {
    if (phase !== PHASE.AIM) return
    setCastPower(power)
    setLureDepth(0)
    setLureX(CANVAS_W * 0.4 + Math.random() * CANVAS_W * 0.2)   // slight variance
    setFish([])
    setBiterId(null)
    setPhase(PHASE.WAIT)
    setCasts(c => c + 1)
    sfx.thrust()
    showFlash(`Cast to ${Math.round(power * 100)}% depth`, 'ok')
  }, [phase, power, sfx])

  const setHook = useCallback(() => {
    if (phase !== PHASE.HOOK) return
    const dt = performance.now() - biteAt
    if (dt < 500) {
      // Success — enter reel phase.
      setPhase(PHASE.REEL)
      setReel({ line: 100, tension: 0.45, distance: 100 })
      setReelDir('L')
      sfx.chirp()
      showFlash('Hooked! Reel it in.', 'ok')
    }
  }, [phase, biteAt, sfx])

  const doReel = useCallback((dir) => {
    if (phase !== PHASE.REEL) return
    if (dir !== reelDir) {
      // Wrong direction — tension spikes.
      setReel(r => ({ ...r, tension: Math.min(1, r.tension + 0.15) }))
      sfx.hit()
      return
    }
    // Correct alternation — reel distance closer.
    setReel(r => ({
      ...r,
      distance: Math.max(0, r.distance - 8),
      tension: Math.max(0, r.tension - 0.06),
    }))
    setReelDir(d => (d === 'L' ? 'R' : 'L'))
    sfx.pop()
    // Check win.
    const nextDistance = Math.max(0, reel.distance - 8)
    if (nextDistance <= 0) {
      // Catch!
      const biter = fish.find(f => f.id === biterId)
      if (biter) {
        const sp = SPECIES_BY_ID[biter.species]
        setXp(x => x + sp.xp)
        setEnc(e => {
          const rec = e[biter.species] || { count: 0, best: 0, zone: sp.zone }
          return {
            ...e,
            [biter.species]: {
              count: rec.count + 1,
              best: Math.max(rec.best, biter.weight),
              zone: sp.zone,
            },
          }
        })
        setLastCatch({ ...biter, sp })
        sfx.win()
        showFlash(`Caught ${sp.name}! +${sp.xp} XP`, 'ok')
      }
      setBiterId(null)
      setFish([])
      setPhase(PHASE.DONE)
      setTimeout(() => {
        setPhase(PHASE.AIM)
        setLureDepth(0)
        setPower(0)
        setCastPower(0)
        setLastCatch(null)
      }, 2000)
    }
  }, [phase, reelDir, reel.distance, fish, biterId, sfx])

  // ── Input on the game canvas ──
  const onCanvasDown = (e) => {
    e.preventDefault()
    if (phase === PHASE.AIM) {
      setCharging(true)
      setPower(0)
    } else if (phase === PHASE.HOOK) {
      setHook()
    } else if (phase === PHASE.REEL) {
      // Left half of canvas = L, right half = R.
      const rect = e.currentTarget.getBoundingClientRect()
      const cx = (e.clientX ?? e.touches?.[0]?.clientX) - rect.left
      doReel(cx < rect.width / 2 ? 'L' : 'R')
    }
  }
  const onCanvasUp = () => {
    if (phase === PHASE.AIM && charging) {
      setCharging(false)
      cast()
    }
  }

  const resetProgress = () => {
    if (!confirm('Reset XP, casts, and encyclopedia?')) return
    localStorage.removeItem(STORAGE_KEY)
    setXp(0); setCasts(0); setEnc({}); setLure('basic')
    setPhase(PHASE.AIM); setPower(0); setCastPower(0); setLureDepth(0); setFish([])
  }

  return (
    <GameShell
      title="Fishing Sim"
      category="Sim"
      score={xp}
      best={Object.keys(encyclopedia).length}
      level={casts}
      status={phase === PHASE.DONE ? 'won' : 'playing'}
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn(v => !v)}
      onPause={() => {}}
      onRestart={resetProgress}
      controls={[
        { key: 'Hold',    label: 'Charge cast power' },
        { key: 'Release', label: 'Cast the lure' },
        { key: 'Click',   label: 'SET on bite (500ms)' },
        { key: 'L / R',   label: 'Alternate to reel in' },
      ]}
    >
      <div className="p-3 sm:p-4 flex flex-col gap-3 lg:flex-row">
        <div className="flex-1 min-w-0">
          <div
            className="relative rounded-xl overflow-hidden border border-white/10 bg-[#050a30] select-none"
            onMouseDown={onCanvasDown}
            onMouseUp={onCanvasUp}
            onMouseLeave={onCanvasUp}
            onTouchStart={onCanvasDown}
            onTouchEnd={onCanvasUp}
            style={{ touchAction: 'none' }}
          >
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />
            {/* Phase overlay */}
            <div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-black/60 border border-white/20 text-xs">
              <span className="text-white/50">Phase: </span>
              <span className="text-amber-300 font-semibold uppercase">{phase}</span>
              {phase === PHASE.HOOK && <span className="ml-2 text-rose-300 font-bold animate-pulse">SET NOW!</span>}
            </div>
            {/* Zone label */}
            <div className="absolute top-2 right-2 px-2 py-1 rounded-md bg-black/60 border border-white/20 text-xs">
              <span className="text-white/50">Zone: </span>
              <span className="text-cyan-300 font-semibold">{currentZone.name}</span>
              {!zoneUnlocked && <span className="ml-2 text-rose-300">locked</span>}
            </div>
            {/* Last catch banner */}
            {lastCatch && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
                <div className="text-center px-6 py-4 rounded-2xl bg-emerald-500/20 border border-emerald-400/50 backdrop-blur">
                  <div className="text-4xl">{lastCatch.sp.icon}</div>
                  <div className="text-2xl font-bold text-emerald-100">{lastCatch.sp.name}</div>
                  <div className="text-sm text-white/70">{fmtWeight(lastCatch.weight)} · +{lastCatch.sp.xp} XP</div>
                </div>
              </div>
            )}
          </div>

          {/* Bottom action row */}
          <div className="mt-3 p-3 rounded-xl bg-white/5 border border-white/10">
            {phase === PHASE.AIM && (
              <div>
                <div className="text-xs text-white/60 mb-1">Hold anywhere on the water — release to cast.</div>
                <div className="h-3 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald-400 via-amber-300 to-rose-400 transition-none" style={{ width: `${power * 100}%` }} />
                </div>
                <div className="mt-1 text-[11px] text-white/50 flex justify-between">
                  <span>Shallow</span><span>Mid</span><span>Deep</span><span>Abyss</span>
                </div>
              </div>
            )}
            {phase === PHASE.WAIT && (
              <div className="text-xs text-white/60">Fish approach the lure. Wait for the strike…</div>
            )}
            {phase === PHASE.HOOK && (
              <button
                type="button"
                onClick={setHook}
                className="w-full px-4 py-3 rounded-lg bg-rose-500/30 border border-rose-400/60 text-rose-100 font-bold uppercase tracking-wider animate-pulse"
              >
                SET THE HOOK!
              </button>
            )}
            {phase === PHASE.REEL && (
              <div className="space-y-2">
                <div className="text-xs text-white/60">Alternate <b>{reelDir}</b> next. Watch the tension.</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => doReel('L')}
                    className={`px-3 py-3 rounded-lg font-bold border ${reelDir === 'L' ? 'bg-cyan-500/25 border-cyan-400/60 text-cyan-100' : 'bg-white/5 border-white/10 text-white/50'}`}
                  >← L</button>
                  <button
                    type="button"
                    onClick={() => doReel('R')}
                    className={`px-3 py-3 rounded-lg font-bold border ${reelDir === 'R' ? 'bg-fuchsia-500/25 border-fuchsia-400/60 text-fuchsia-100' : 'bg-white/5 border-white/10 text-white/50'}`}
                  >R →</button>
                </div>
                <div>
                  <div className="text-[11px] text-white/60 mb-1 flex justify-between">
                    <span>Line tension</span>
                    <span className={reel.tension > 0.8 ? 'text-rose-300' : reel.tension < 0.15 ? 'text-amber-300' : 'text-emerald-300'}>
                      {(reel.tension * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-400 via-amber-300 to-rose-500" style={{ width: `${reel.tension * 100}%` }} />
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-white/60 mb-1 flex justify-between">
                    <span>Distance</span>
                    <span className="text-white/80 font-mono">{reel.distance.toFixed(0)}m</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full bg-cyan-400" style={{ width: `${100 - reel.distance}%` }} />
                  </div>
                </div>
              </div>
            )}
            {flash && (
              <div className={`mt-2 text-xs ${flash.kind === 'ok' ? 'text-emerald-300' : 'text-rose-300'}`}>
                {flash.text}
              </div>
            )}
          </div>
        </div>

        {/* Side panel */}
        <div className="w-full lg:w-80 shrink-0 space-y-3">
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="text-[11px] uppercase tracking-widest text-white/40 mb-2">Progression</div>
            <div className="text-xs flex justify-between mb-1">
              <span className="text-white/60">XP</span>
              <span className="text-amber-300 font-mono">{xp}</span>
            </div>
            <div className="text-xs flex justify-between mb-1">
              <span className="text-white/60">Casts</span>
              <span className="text-white/80 font-mono">{casts}</span>
            </div>
            <div className="text-xs flex justify-between">
              <span className="text-white/60">Caught species</span>
              <span className="text-fuchsia-300 font-mono">{Object.keys(encyclopedia).length} / {SPECIES.length}</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="text-[11px] uppercase tracking-widest text-white/40 mb-2">Lure</div>
            <div className="space-y-1">
              {LURES.map((l) => {
                const unlocked = xp >= l.xpUnlock
                const active = selectedLure === l.id
                return (
                  <button
                    key={l.id}
                    type="button"
                    disabled={!unlocked}
                    onClick={() => setLure(l.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors ${active ? 'bg-fuchsia-500/25 border-fuchsia-400/50 text-white' : unlocked ? 'bg-white/5 border-white/10 hover:border-white/25 text-white/80' : 'bg-white/5 border-white/10 text-white/30 cursor-not-allowed'}`}
                  >
                    <div className="flex justify-between font-semibold">
                      <span>{l.name}</span>
                      <span className="text-white/50">Tier {l.baitLevel}</span>
                    </div>
                    <div className="text-white/50">
                      Attraction ×{l.attraction.toFixed(1)} · {unlocked ? '✔ unlocked' : `unlock at ${l.xpUnlock} XP`}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="text-[11px] uppercase tracking-widest text-white/40 mb-2">Zone unlocks</div>
            <div className="space-y-1 text-xs">
              {ZONES.map((z) => {
                const unlocked = xp >= (ZONE_UNLOCKS[z.id] ?? 0)
                return (
                  <div key={z.id} className="flex items-center justify-between">
                    <span className={unlocked ? 'text-white/80' : 'text-white/30'}>{z.name}</span>
                    <span className={unlocked ? 'text-emerald-300 font-mono' : 'text-white/30 font-mono'}>
                      {unlocked ? '✔' : `${ZONE_UNLOCKS[z.id]} XP`}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="text-[11px] uppercase tracking-widest text-white/40 mb-2">Encyclopedia</div>
            <div className="grid grid-cols-2 gap-1.5 max-h-72 overflow-y-auto pr-1">
              {SPECIES.map((s) => {
                const rec = encyclopedia[s.id]
                return (
                  <div key={s.id} className={`px-2 py-1.5 rounded border text-[11px] ${rec ? 'bg-white/5 border-white/10' : 'bg-white/5 border-white/5 opacity-50'}`}>
                    <div className="flex items-center gap-1.5">
                      <span className="text-base">{rec ? s.icon : '❓'}</span>
                      <span className={rec ? 'font-semibold text-white/80' : 'text-white/40'}>{rec ? s.name : '???'}</span>
                    </div>
                    {rec && (
                      <div className="text-white/50 text-[10px]">
                        ×{rec.count} · best {fmtWeight(rec.best)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </GameShell>
  )
}

// ── Canvas renderer — draws parallax water, fish sprites, line, lure, HUD ──
function renderScene(canvas, state) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width, h = canvas.height
  const { phase, castPower, lureDepth, lureX, fish, biterId, currentZone, zoneUnlocked, unlockedZones } = state

  // Sky
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h * WATER_TOP)
  skyGrad.addColorStop(0, '#0b1226')
  skyGrad.addColorStop(1, '#2d3d78')
  ctx.fillStyle = skyGrad
  ctx.fillRect(0, 0, w, h * WATER_TOP)

  // Sun / moon glow
  ctx.fillStyle = 'rgba(251, 191, 36, 0.4)'
  ctx.beginPath()
  ctx.arc(w * 0.75, h * 0.08, 30, 0, Math.PI * 2)
  ctx.fill()

  // Water — layered zones
  const waterTop = h * WATER_TOP
  const waterH = h - waterTop
  for (const zone of ZONES) {
    const y0 = waterTop + waterH * zone.min
    const y1 = waterTop + waterH * zone.max
    const grad = ctx.createLinearGradient(0, y0, 0, y1)
    grad.addColorStop(0, zone.tint)
    grad.addColorStop(1, ZONES[Math.min(ZONES.length - 1, ZONES.indexOf(zone) + 1)]?.tint || zone.tint)
    ctx.fillStyle = grad
    ctx.fillRect(0, y0, w, y1 - y0)
    // Lock veil
    const locked = !unlockedZones.some(z => z.id === zone.id)
    if (locked) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
      ctx.fillRect(0, y0, w, y1 - y0)
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      ctx.font = '11px monospace'
      ctx.fillText(`🔒 ${zone.name}`, 8, y0 + 14)
    }
  }

  // Parallax bubble bands
  const t = performance.now() / 1000
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = `rgba(160, 200, 240, ${0.06 + i * 0.04})`
    ctx.lineWidth = 1
    const offset = (t * (10 + i * 4)) % w
    ctx.beginPath()
    for (let x = -offset; x < w; x += 40) {
      const y = waterTop + waterH * (0.15 + i * 0.25) + Math.sin((x + t * 20) * 0.02) * 4
      ctx.moveTo(x, y); ctx.lineTo(x + 20, y)
    }
    ctx.stroke()
  }

  // Boat + fisherman on surface
  const boatX = 90, boatY = waterTop - 4
  ctx.fillStyle = '#7a4a20'
  ctx.beginPath()
  ctx.moveTo(boatX - 40, boatY)
  ctx.lineTo(boatX + 50, boatY)
  ctx.lineTo(boatX + 40, boatY + 22)
  ctx.lineTo(boatX - 30, boatY + 22)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#3b2010'; ctx.stroke()
  // Fisherman
  ctx.fillStyle = '#3b82f6'
  ctx.fillRect(boatX - 6, boatY - 16, 12, 16)     // body
  ctx.fillStyle = '#f7d5a3'
  ctx.beginPath(); ctx.arc(boatX, boatY - 22, 5, 0, Math.PI * 2); ctx.fill()  // head
  ctx.fillStyle = '#dc2626'
  ctx.fillRect(boatX - 6, boatY - 27, 12, 4)      // hat
  // Rod
  ctx.strokeStyle = '#3a2010'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(boatX + 4, boatY - 20); ctx.lineTo(boatX + 40, boatY - 60); ctx.stroke()

  // Line
  const lureY = waterTop + waterH * (phase === PHASE.AIM ? 0 : lureDepth)
  const lineStartX = boatX + 40, lineStartY = boatY - 60
  ctx.strokeStyle = 'rgba(230,230,240,0.8)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(lineStartX, lineStartY)
  if (phase === PHASE.AIM) {
    ctx.lineTo(lineStartX + 10, lineStartY + 20)
  } else {
    // Slight curve to lure
    ctx.quadraticCurveTo((lineStartX + lureX) / 2, lineStartY + 20, lureX, lureY)
  }
  ctx.stroke()

  // Fish — sorted so biter draws on top
  const sortedFish = [...fish].sort((a, b) => (a.id === biterId ? 1 : b.id === biterId ? -1 : 0))
  for (const f of sortedFish) {
    const sp = SPECIES_BY_ID[f.species]
    if (!sp) continue
    const fx = f.x
    const fy = waterTop + waterH * (f.y - WATER_TOP) / (1 - WATER_TOP)
    const facing = f.vx >= 0 ? 1 : -1
    const wobble = Math.sin(t * 6 + f.id * 100) * 3
    ctx.save()
    ctx.translate(fx, fy)
    ctx.scale(facing, 1)
    // Body
    ctx.fillStyle = sp.colour
    ctx.beginPath()
    ctx.ellipse(0, 0, sp.zone === 'deep' || sp.zone === 'abyss' ? 26 : 16, sp.zone === 'deep' || sp.zone === 'abyss' ? 12 : 8, 0, 0, Math.PI * 2)
    ctx.fill()
    // Tail
    ctx.beginPath()
    ctx.moveTo(-16, -6)
    ctx.lineTo(-26 + wobble * 0.5, 0)
    ctx.lineTo(-16, 6)
    ctx.closePath()
    ctx.fill()
    // Eye
    ctx.fillStyle = 'white'
    ctx.beginPath(); ctx.arc(8, -2, 2, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'black'
    ctx.beginPath(); ctx.arc(8, -2, 1, 0, Math.PI * 2); ctx.fill()
    // Angler light for abyss species
    if (sp.zone === 'abyss') {
      ctx.fillStyle = 'rgba(232, 121, 249, 0.8)'
      ctx.beginPath(); ctx.arc(18, -8, 2, 0, Math.PI * 2); ctx.fill()
    }
    // Interest indicator
    if (f.interest > 0.5 && biterId !== f.id) {
      ctx.fillStyle = '#fbbf24'
      ctx.font = '14px monospace'
      ctx.fillText('?', 8, -18)
    }
    if (biterId === f.id) {
      ctx.fillStyle = '#fb7185'
      ctx.font = 'bold 18px monospace'
      ctx.fillText('!', 4, -22)
    }
    ctx.restore()
  }

  // Lure
  if (phase !== PHASE.AIM) {
    ctx.fillStyle = '#fbbf24'
    ctx.beginPath(); ctx.arc(lureX, lureY, 4, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.stroke()
    // Ripple
    if ((Math.floor(t * 2) % 2) === 0) {
      ctx.strokeStyle = 'rgba(251,191,36,0.4)'
      ctx.beginPath(); ctx.arc(lureX, lureY, 8, 0, Math.PI * 2); ctx.stroke()
    }
  }

  // Depth marker overlay while WAIT
  if (phase === PHASE.WAIT || phase === PHASE.HOOK || phase === PHASE.REEL) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.font = '11px monospace'
    ctx.fillText(`Depth ${Math.round(lureDepth * 100)}m`, 8, waterTop + 14)
  }
}
