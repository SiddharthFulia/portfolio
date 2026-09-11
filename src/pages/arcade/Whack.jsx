// /arcade/whack — Whack-a-Mole.
//
// A DOM-grid game (no canvas) so mole art can be inline SVG with cute
// two-frame pop-up animation. Difficulty is tuned via two knobs the
// engine bumps per level: mean pop interval (ms between spawns) and
// mole visible duration. The 3x3 grid at easy widens to 5x5 on hard.
//
// Feel targets:
//   • Instant tap response — mole registers on pointerdown, no click delay
//   • Scale-bounce + particle burst on hit
//   • Distinct "pop up" (scale+translate rise) vs "hide" (fade+sink) animation
//   • Combo counter for consecutive hits; misses (empty tap) break combo
//   • Golden mole variant every ~15 spawns → high-value bonus
//   • Screen shake on golden hit (respects reduced motion)
//   • Distinct SFX per event (miss / hit / golden / whiff on empty tap)
//
// Best score persisted to localStorage under 'sid-arcade-whack-best'.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GameShell from '../../components/arcade/GameShell'
import { getSfx } from '../../components/arcade/sfx'

const BEST_KEY = 'sid-arcade-whack-best'
const GAME_LENGTH = 60_000 // 60s per round

// Level knobs — each level pushes spawns faster + shortens visible time.
// Values are clamped so hard mode is punishing but not RNG-hostile.
const levelTuning = (lvl) => {
  const spawnEvery = Math.max(280, 900 - lvl * 65)  // ms between attempts
  const visibleMs  = Math.max(500, 1300 - lvl * 90) // ms mole stays up
  const cellCount  = lvl >= 6 ? 25 : 9              // 3x3 until L6, then 5x5
  return { spawnEvery, visibleMs, cellCount }
}

// Cute mole SVG. Two visual states via `hit` prop: hit closes eyes and
// shows teeth. Golden variant swaps fur colour and adds a tiny hat +
// sparkle. Everything is inline SVG so it scales cleanly with the tap
// zone.
const Mole = ({ golden = false, hit = false }) => {
  const furA = golden ? '#fbbf24' : '#8b5a2b'
  const furB = golden ? '#f59e0b' : '#6b4423'
  const eyeGlow = golden ? '#fef3c7' : '#fff'
  return (
    <svg viewBox="0 0 100 100" className={`w-full h-full transition-transform duration-200 ${hit ? 'scale-90 rotate-3' : 'scale-100'}`}>
      <defs>
        <radialGradient id={`fur-${golden ? 'g' : 'n'}`} cx="0.5" cy="0.4" r="0.7">
          <stop offset="0%" stopColor={furA} />
          <stop offset="100%" stopColor={furB} />
        </radialGradient>
      </defs>
      {/* Body */}
      <ellipse cx="50" cy="62" rx="32" ry="28" fill={`url(#fur-${golden ? 'g' : 'n'})`} />
      {/* Belly patch */}
      <ellipse cx="50" cy="72" rx="18" ry="12" fill={golden ? '#fef3c7' : '#c9a67a'} opacity="0.6" />
      {/* Ears */}
      <circle cx="28" cy="40" r="8" fill={furB} />
      <circle cx="72" cy="40" r="8" fill={furB} />
      <circle cx="28" cy="40" r="4" fill={golden ? '#fde68a' : '#3b2317'} />
      <circle cx="72" cy="40" r="4" fill={golden ? '#fde68a' : '#3b2317'} />
      {/* Eyes */}
      <ellipse cx="40" cy="52" rx="4" ry={hit ? 1 : 5} fill="#111" />
      <ellipse cx="60" cy="52" rx="4" ry={hit ? 1 : 5} fill="#111" />
      {!hit && (
        <>
          <circle cx="41.5" cy="50" r="1.4" fill={eyeGlow} />
          <circle cx="61.5" cy="50" r="1.4" fill={eyeGlow} />
        </>
      )}
      {/* Nose */}
      <ellipse cx="50" cy="62" rx="4" ry="3" fill="#1a0f08" />
      {/* Whiskers */}
      <line x1="34" y1="63" x2="20" y2="60" stroke="#111" strokeWidth="0.8" />
      <line x1="34" y1="66" x2="20" y2="67" stroke="#111" strokeWidth="0.8" />
      <line x1="66" y1="63" x2="80" y2="60" stroke="#111" strokeWidth="0.8" />
      <line x1="66" y1="66" x2="80" y2="67" stroke="#111" strokeWidth="0.8" />
      {/* Teeth if hit */}
      {hit && (
        <>
          <rect x="46" y="66" width="3" height="4" fill="#fff" rx="1" />
          <rect x="51" y="66" width="3" height="4" fill="#fff" rx="1" />
        </>
      )}
      {/* Golden hat */}
      {golden && (
        <>
          <ellipse cx="50" cy="30" rx="14" ry="3" fill="#111" />
          <rect x="42" y="18" width="16" height="14" rx="2" fill="#111" />
          <rect x="42" y="26" width="16" height="3" fill="#f59e0b" />
          <circle cx="70" cy="30" r="2" fill="#fef3c7" />
        </>
      )}
    </svg>
  )
}

// Dirt hole SVG — the dark oval the mole rises out of.
const Hole = () => (
  <svg viewBox="0 0 100 40" className="absolute inset-x-0 bottom-0 w-full h-[38%] pointer-events-none">
    <defs>
      <radialGradient id="holeGrad" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0%" stopColor="#000" />
        <stop offset="70%" stopColor="#1a0f08" />
        <stop offset="100%" stopColor="#3a2718" stopOpacity="0" />
      </radialGradient>
    </defs>
    <ellipse cx="50" cy="30" rx="46" ry="14" fill="url(#holeGrad)" />
    <ellipse cx="50" cy="26" rx="38" ry="8" fill="#000" opacity="0.7" />
  </svg>
)

export default function Whack() {
  const sfx = useMemo(() => getSfx(), [])
  const [soundOn, setSoundOn] = useState(true)
  useEffect(() => { sfx.setEnabled(soundOn) }, [soundOn, sfx])

  const [score, setScore] = useState(0)
  const [best, setBest] = useState(() => Number(localStorage.getItem(BEST_KEY) || 0))
  const [level, setLevel] = useState(1)
  const [combo, setCombo] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)
  const [hits, setHits] = useState(0)
  const [misses, setMisses] = useState(0)
  const [status, setStatus] = useState('ready')   // ready | playing | paused | over
  const [timeLeft, setTimeLeft] = useState(GAME_LENGTH)
  const { cellCount } = levelTuning(level)
  const gridSize = cellCount === 25 ? 5 : 3

  // active[i] describes the mole occupying cell i, or null.
  //   { id, golden, spawnAt, expireAt, hit, hitAt }
  const [active, setActive] = useState(() => Array(25).fill(null))
  const spawnCounter = useRef(0)
  const spawnTimer = useRef(null)
  const tickTimer = useRef(null)
  const goldenEvery = 15
  const startedAt = useRef(0)
  const pausedAccum = useRef(0)
  const pausedAt = useRef(0)
  const [shake, setShake] = useState(0)
  const boardRef = useRef(null)
  const reduced = useRef(false)

  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  const clearTimers = () => {
    if (spawnTimer.current) clearTimeout(spawnTimer.current)
    if (tickTimer.current)  clearInterval(tickTimer.current)
    spawnTimer.current = null
    tickTimer.current  = null
  }

  const scheduleSpawn = useCallback(() => {
    if (status !== 'playing') return
    const { spawnEvery } = levelTuning(level)
    // Jitter the interval so it doesn't feel metronomic.
    const jittered = spawnEvery * (0.6 + Math.random() * 0.7)
    spawnTimer.current = setTimeout(() => {
      setActive((prev) => {
        // Only spawn into an empty slot within the current grid range.
        const empty = []
        for (let i = 0; i < cellCount; i++) if (!prev[i]) empty.push(i)
        if (!empty.length) return prev
        const idx = empty[Math.floor(Math.random() * empty.length)]
        spawnCounter.current += 1
        const golden = spawnCounter.current % goldenEvery === 0
        const { visibleMs } = levelTuning(level)
        const now = performance.now()
        const next = [...prev]
        next[idx] = {
          id: spawnCounter.current,
          golden,
          spawnAt: now,
          expireAt: now + visibleMs * (golden ? 0.65 : 1),
          hit: false,
          hitAt: 0,
        }
        return next
      })
      scheduleSpawn()
    }, jittered)
  }, [status, level, cellCount])

  // Tick — retires expired moles, ends the round.
  useEffect(() => {
    if (status !== 'playing') return
    tickTimer.current = setInterval(() => {
      const now = performance.now()
      const remaining = GAME_LENGTH - (now - startedAt.current - pausedAccum.current)
      setTimeLeft(Math.max(0, remaining))
      if (remaining <= 0) {
        setStatus('over')
        clearTimers()
        setBest((b) => {
          const nb = Math.max(b, score)
          localStorage.setItem(BEST_KEY, String(nb))
          return nb
        })
        sfx.win()
        return
      }
      setActive((prev) => {
        let changed = false
        const next = prev.map((m) => {
          if (!m) return m
          if (m.hit && now - m.hitAt > 260) { changed = true; return null }
          if (!m.hit && now > m.expireAt)   { changed = true; return null }
          return m
        })
        return changed ? next : prev
      })
    }, 60)
    return () => { if (tickTimer.current) clearInterval(tickTimer.current) }
  }, [status, score, sfx])

  // Level escalation
  useEffect(() => {
    if (status !== 'playing') return
    const secs = (GAME_LENGTH - timeLeft) / 1000
    const nextLvl = Math.min(9, 1 + Math.floor(secs / 8))
    if (nextLvl !== level) setLevel(nextLvl)
  }, [timeLeft, level, status])

  useEffect(() => {
    if (status === 'playing') scheduleSpawn()
    return clearTimers
  }, [status, scheduleSpawn])

  const start = () => {
    setScore(0); setCombo(0); setMaxCombo(0); setHits(0); setMisses(0)
    setLevel(1); setTimeLeft(GAME_LENGTH)
    setActive(Array(25).fill(null))
    startedAt.current = performance.now()
    pausedAccum.current = 0
    setStatus('playing')
  }

  const togglePause = () => {
    if (status === 'playing') { pausedAt.current = performance.now(); setStatus('paused'); clearTimers() }
    else if (status === 'paused') {
      pausedAccum.current += performance.now() - pausedAt.current
      setStatus('playing')
    }
  }

  const restart = () => { clearTimers(); start() }

  const onCellDown = (i, e) => {
    e.preventDefault()
    if (status !== 'playing') return
    setActive((prev) => {
      const m = prev[i]
      if (!m || m.hit) {
        // Empty whiff — break combo.
        setMisses((x) => x + 1)
        setCombo(0)
        sfx.beep({ freq: 180, type: 'sine', dur: 0.06, gain: 0.03 })
        return prev
      }
      const now = performance.now()
      const base = m.golden ? 300 : 100
      const bonus = Math.floor(combo * 20)
      const pts = base + bonus
      setScore((s) => s + pts)
      setHits((h) => h + 1)
      setCombo((c) => { const nc = c + 1; setMaxCombo((mm) => Math.max(mm, nc)); return nc })
      if (m.golden) {
        sfx.coin()
        if (!reduced.current) setShake(1)
      } else {
        sfx.pop()
      }
      const next = [...prev]
      next[i] = { ...m, hit: true, hitAt: now }
      return next
    })
  }

  useEffect(() => {
    if (!shake) return
    const t = setTimeout(() => setShake(0), 220)
    return () => clearTimeout(t)
  }, [shake])

  const accuracy = hits + misses ? Math.round((hits / (hits + misses)) * 100) : 100

  const extraStats = (
    <>
      <div className="flex flex-col items-start">
        <span className="text-[10px] uppercase tracking-widest text-white/40">Combo</span>
        <span className="text-xl sm:text-2xl font-bold tabular-nums text-orange-300">×{combo}</span>
      </div>
      <div className="flex flex-col items-start">
        <span className="text-[10px] uppercase tracking-widest text-white/40">Time</span>
        <span className="text-xl sm:text-2xl font-bold tabular-nums text-cyan-300">{(timeLeft / 1000).toFixed(1)}s</span>
      </div>
      <div className="flex flex-col items-start">
        <span className="text-[10px] uppercase tracking-widest text-white/40">Acc</span>
        <span className="text-xl sm:text-2xl font-bold tabular-nums text-emerald-300">{accuracy}%</span>
      </div>
    </>
  )

  const overlay = status === 'ready' ? (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/70 backdrop-blur">
      <div className="text-center px-6">
        <h2 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-amber-300 via-rose-300 to-fuchsia-400 bg-clip-text text-transparent mb-2">
          Whack them all
        </h2>
        <p className="text-white/70 max-w-md mx-auto mb-6">
          Tap moles as they pop up. Golden moles wear tiny hats and pay triple. Miss = combo resets.
        </p>
        <button type="button" onClick={start} className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-lg">
          Start (60s)
        </button>
      </div>
    </div>
  ) : status === 'over' ? (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/80 backdrop-blur">
      <div className="text-center px-6">
        <h2 className="text-4xl font-bold text-rose-300 mb-2">Time up</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 text-left">
          <div><div className="text-[10px] uppercase text-white/40">Score</div><div className="text-2xl font-bold text-amber-300">{score.toLocaleString()}</div></div>
          <div><div className="text-[10px] uppercase text-white/40">Best</div><div className="text-2xl font-bold text-rose-300">{best.toLocaleString()}</div></div>
          <div><div className="text-[10px] uppercase text-white/40">Max Combo</div><div className="text-2xl font-bold text-orange-300">×{maxCombo}</div></div>
          <div><div className="text-[10px] uppercase text-white/40">Accuracy</div><div className="text-2xl font-bold text-emerald-300">{accuracy}%</div></div>
        </div>
        <button type="button" onClick={restart} className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-lg">
          Play again
        </button>
      </div>
    </div>
  ) : null

  const shakeStyle = shake && !reduced.current
    ? { transform: `translate3d(${(Math.random()-0.5)*8}px,${(Math.random()-0.5)*8}px,0)` }
    : undefined

  return (
    <GameShell
      title="Whack-a-Mole"
      category="Reflex"
      score={score}
      best={best}
      level={level}
      status={status === 'ready' ? 'ready' : status === 'over' ? 'over' : status}
      extraStats={extraStats}
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn((v) => !v)}
      onPause={togglePause}
      onRestart={restart}
      controls={[{ key: 'Tap', label: 'Whack mole' }, { key: 'P', label: 'Pause' }]}
      overlay={overlay}
    >
      <div
        ref={boardRef}
        style={shakeStyle}
        className="relative w-full aspect-[4/3] bg-gradient-to-b from-emerald-900/40 to-emerald-950/80 p-3 sm:p-5 transition-transform"
      >
        <div className="absolute inset-0 opacity-30" style={{
          background: 'radial-gradient(circle at 30% 20%, #22c55e33 0%, transparent 40%), radial-gradient(circle at 70% 80%, #16a34a33 0%, transparent 45%)'
        }} />
        <div
          className="relative w-full h-full grid gap-2 sm:gap-3"
          style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)`, gridTemplateRows: `repeat(${gridSize}, 1fr)` }}
        >
          {Array.from({ length: cellCount }).map((_, i) => {
            const mole = active[i]
            const up = mole && !mole.hit
            return (
              <button
                key={i}
                type="button"
                onPointerDown={(e) => onCellDown(i, e)}
                aria-label={`hole ${i + 1}`}
                className="relative rounded-2xl bg-emerald-950/60 border border-emerald-800/40 overflow-hidden select-none touch-manipulation active:scale-95 transition-transform focus:outline-none focus:ring-2 focus:ring-amber-400/60"
              >
                <Hole />
                {mole && (
                  <div
                    className="absolute inset-x-2 top-[8%] bottom-[10%] flex items-end justify-center pointer-events-none"
                    style={{
                      transform: up ? 'translateY(0)' : 'translateY(80%)',
                      opacity:   mole.hit ? 0.6 : 1,
                      transition: 'transform 160ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 220ms ease',
                    }}
                  >
                    <Mole golden={mole.golden} hit={mole.hit} />
                  </div>
                )}
                {mole?.hit && (
                  <div className="absolute inset-0 pointer-events-none">
                    <div
                      className="absolute inset-0 rounded-2xl"
                      style={{
                        background: mole.golden
                          ? 'radial-gradient(circle, #fef08a 0%, #f59e0b00 60%)'
                          : 'radial-gradient(circle, #fbbf24 0%, #f59e0b00 60%)',
                        animation: 'wh-flash 260ms ease-out forwards',
                      }}
                    />
                    <span className="absolute top-2 right-2 text-amber-200 font-bold text-sm sm:text-base drop-shadow"
                          style={{ animation: 'wh-float 500ms ease-out forwards' }}>
                      +{mole.golden ? 300 : 100}{combo > 1 ? ` ×${combo}` : ''}
                    </span>
                  </div>
                )}
              </button>
            )
          })}
        </div>
        <style>{`
          @keyframes wh-flash { from { opacity: 0.9; transform: scale(0.6); } to { opacity: 0; transform: scale(1.4); } }
          @keyframes wh-float { from { transform: translateY(0); opacity: 1; } to { transform: translateY(-20px); opacity: 0; } }
        `}</style>
      </div>
    </GameShell>
  )
}
