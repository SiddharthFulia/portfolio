// /arcade/rhythm-tap — Rhythm Tap.
//
// 4-lane rhythm game (D F J K on keyboard, or four big buttons on touch).
// Notes fall from the top and must be tapped when they cross the hit
// line near the bottom.
//
// Timing windows (± ms from perfect hit):
//   • perfect  : 40ms  → 300 pts + combo builds
//   • great    : 80ms  → 200 pts + combo builds
//   • good     : 140ms → 100 pts, combo builds
//   • miss     : outside window → 0 pts, combo resets
//
// Three built-in tracks:
//   • Neon Pulse   — 100 BPM, mostly on-beat quarter notes with occasional
//                    double-taps. Easy warmup.
//   • Rush Hour    — 132 BPM, syncopated eighths, some short chords (two
//                    lanes at once). Medium.
//   • Storm Front  — 156 BPM, dense pattern with fast alt-lane triplets.
//                    Hard.
//
// Music is synthesised via AudioContext — a kick + snare pattern on the
// downbeats and a melody note per note-event. No external audio assets.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GameShell from '../../components/arcade/GameShell'
import { getSfx } from '../../components/arcade/sfx'

const BEST_KEY = 'sid-arcade-rhythm-best'
const LANES = 4
const LANE_KEYS = ['d', 'f', 'j', 'k']
const LANE_LABELS = ['D', 'F', 'J', 'K']
const LANE_HUES = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6']
const LANE_GLOWS = ['#fda4af', '#fde68a', '#86efac', '#93c5fd']
const NOTE_TRAVEL_MS = 1400   // ms from spawn (top) to hit line (bottom)

// Judgement windows in ms
const WIN_PERFECT = 40
const WIN_GREAT   = 80
const WIN_GOOD    = 140
const WIN_MAX     = 180   // outside this = miss auto-registered

// Track builder — creates a note list from a beat pattern.
// Pattern strings use one char per subdivision:
//   .        rest
//   0/1/2/3  hit on lane N
//   AB       chord: hit lanes A and B simultaneously (any two digits joined)
// Each string is interpreted at `subdiv` ms per step.
const buildTrack = (rows, subdiv, melodyRoot = 220) => {
  const notes = []
  let t = 2000  // 2s intro
  const patternChars = rows.join('').split('')
  patternChars.forEach((ch, i) => {
    if (ch === '.') return
    if (/[0-3]/.test(ch)) {
      notes.push({ lane: Number(ch), t, melody: melodyRoot * Math.pow(1.05946, (i % 12)) })
    } else if (ch === '*') {
      // Chord — random two lanes on the same beat
      const a = Math.floor(Math.random() * LANES)
      let b = Math.floor(Math.random() * LANES); if (b === a) b = (a + 1) % LANES
      notes.push({ lane: a, t, melody: melodyRoot })
      notes.push({ lane: b, t, melody: melodyRoot * 1.5 })
    }
    t += subdiv
  })
  return { notes, duration: t + 2000 }
}

// Three hand-crafted tracks.
const TRACKS = [
  {
    id: 'neon',
    name: 'Neon Pulse',
    bpm: 100,
    difficulty: 1,
    ...buildTrack([
      '0.1.2.3.', '0.2.1.3.',
      '01.23.01', '..2.3.1.',
      '3.2.1.0.', '.0.1.2.3',
      '0.1.2.3.', '..*...*.',
    ], 150, 196),
  },
  {
    id: 'rush',
    name: 'Rush Hour',
    bpm: 132,
    difficulty: 2,
    ...buildTrack([
      '0.2.1.3.', '01.23.01',
      '0123.201', '.10.32.1',
      '2.0.1.3.', '*..*..*.',
      '0.1.2.3.', '3210.123',
      '01.10.23', '.0.1.2.3',
    ], 110, 261),
  },
  {
    id: 'storm',
    name: 'Storm Front',
    bpm: 156,
    difficulty: 3,
    ...buildTrack([
      '01230123', '32103210',
      '01.02.03', '*.*.*.*.',
      '0.1.2.3.', '01230123',
      '30201202', '*.1.*.3.',
      '01023012', '32.10.32',
      '01230123', '*..*..*.',
    ], 88, 330),
  },
]

// A note object at runtime: { id, lane, t, hit, judge, melody }
export default function RhythmTap() {
  const sfx = useMemo(() => getSfx(), [])
  const [soundOn, setSoundOn] = useState(true)
  useEffect(() => { sfx.setEnabled(soundOn) }, [soundOn, sfx])

  const [trackIdx, setTrackIdx] = useState(0)
  const track = TRACKS[trackIdx]
  const [status, setStatus] = useState('ready')  // ready | playing | over
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(() => Number(localStorage.getItem(BEST_KEY) || 0))
  const [combo, setCombo] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)
  const [judgeCounts, setJudgeCounts] = useState({ perfect: 0, great: 0, good: 0, miss: 0 })
  const [lastJudge, setLastJudge] = useState(null)  // { kind, at }

  // Live notes on the field
  const [notes, setNotes] = useState([])
  const notesRef = useRef([])
  useEffect(() => { notesRef.current = notes }, [notes])

  const startAt = useRef(0)  // performance.now() when track began
  const rafRef = useRef(0)
  const [tick, setTick] = useState(0)  // triggers re-render each frame
  const laneFlashUntil = useRef([0, 0, 0, 0])

  // AudioContext for melody
  const audioCtx = useRef(null)
  const ensureAC = () => {
    if (typeof window === 'undefined') return null
    if (!audioCtx.current) {
      const AC = window.AudioContext || window.webkitAudioContext
      if (AC) audioCtx.current = new AC()
    }
    if (audioCtx.current?.state === 'suspended') { try { audioCtx.current.resume() } catch {} }
    return audioCtx.current
  }
  const playMelody = (freq) => {
    if (!soundOn) return
    const ctx = ensureAC(); if (!ctx) return
    const t0 = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(freq, t0)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14)
    osc.connect(g).connect(ctx.destination)
    osc.start(t0)
    osc.stop(t0 + 0.16)
  }

  // Background beat — kick/snare on beat count. Runs on interval based on BPM.
  const beatTimer = useRef(null)
  useEffect(() => {
    if (status !== 'playing') { if (beatTimer.current) clearInterval(beatTimer.current); return }
    const stepMs = 60_000 / track.bpm / 2 // eighth note
    let beat = 0
    beatTimer.current = setInterval(() => {
      const ctx = ensureAC(); if (!ctx || !soundOn) { beat = (beat + 1) % 8; return }
      const t0 = ctx.currentTime
      if (beat % 4 === 0) {
        // kick
        const osc = ctx.createOscillator(); const g = ctx.createGain()
        osc.type = 'sine'; osc.frequency.setValueAtTime(120, t0); osc.frequency.exponentialRampToValueAtTime(40, t0 + 0.15)
        g.gain.setValueAtTime(0.12, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2)
        osc.connect(g).connect(ctx.destination); osc.start(t0); osc.stop(t0 + 0.22)
      } else if (beat % 4 === 2) {
        // snare (noise burst)
        const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.15), ctx.sampleRate)
        const d = buf.getChannelData(0)
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length)
        const src = ctx.createBufferSource(); src.buffer = buf
        const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800
        const g = ctx.createGain(); g.gain.setValueAtTime(0.06, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14)
        src.connect(f).connect(g).connect(ctx.destination); src.start(t0); src.stop(t0 + 0.16)
      }
      beat = (beat + 1) % 8
    }, stepMs)
    return () => clearInterval(beatTimer.current)
  }, [status, track, soundOn])

  const start = () => {
    setScore(0); setCombo(0); setMaxCombo(0)
    setJudgeCounts({ perfect: 0, great: 0, good: 0, miss: 0 })
    setLastJudge(null)
    startAt.current = performance.now()
    // Seed live notes as a copy of the track's note list (with unique ids)
    const seeded = track.notes.map((n, i) => ({ ...n, id: i, hit: false, judged: false }))
    setNotes(seeded)
    setStatus('playing')
  }

  const restart = () => start()

  // Main render loop — advances tick, evaluates auto-misses for notes
  // that fell past the hit line, and ends the track when done.
  useEffect(() => {
    if (status !== 'playing') return
    const loop = () => {
      setTick((t) => t + 1)
      const now = performance.now() - startAt.current
      // Auto-miss for un-hit notes past their window
      setNotes((prev) => {
        let mutated = false
        const next = prev.map((n) => {
          if (n.judged) return n
          if (now - n.t > WIN_MAX) {
            mutated = true
            setJudgeCounts((jc) => ({ ...jc, miss: jc.miss + 1 }))
            setCombo(0)
            setLastJudge({ kind: 'miss', at: performance.now() })
            return { ...n, judged: true }
          }
          return n
        })
        return mutated ? next : prev
      })
      // End condition
      if (now > track.duration) {
        setStatus('over')
        setBest((b) => {
          const nb = Math.max(b, score)
          localStorage.setItem(BEST_KEY, String(nb))
          return nb
        })
        return
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [status, track, score])

  // Tap resolver — called when a lane fires. Finds the closest un-judged
  // note in that lane. Compares delta-ms to window thresholds.
  const tapLane = useCallback((lane) => {
    if (status !== 'playing') return
    const now = performance.now() - startAt.current
    laneFlashUntil.current[lane] = performance.now() + 140
    const live = notesRef.current
    let bestNote = null
    let bestDelta = Infinity
    for (const n of live) {
      if (n.judged || n.lane !== lane) continue
      const delta = Math.abs(now - n.t)
      if (delta < bestDelta) { bestDelta = delta; bestNote = n }
    }
    if (!bestNote || bestDelta > WIN_MAX) {
      // Ghost tap — small penalty (no combo break, no score change)
      sfx.beep({ freq: 220, type: 'sine', dur: 0.04, gain: 0.03 })
      return
    }
    let judge, pts
    if      (bestDelta <= WIN_PERFECT) { judge = 'perfect'; pts = 300 }
    else if (bestDelta <= WIN_GREAT)   { judge = 'great';   pts = 200 }
    else if (bestDelta <= WIN_GOOD)    { judge = 'good';    pts = 100 }
    else                                { judge = 'miss';    pts = 0 }
    setNotes((prev) => prev.map((n) => n.id === bestNote.id ? { ...n, judged: true, hit: judge !== 'miss', judgeKind: judge } : n))
    setJudgeCounts((jc) => ({ ...jc, [judge]: jc[judge] + 1 }))
    if (judge === 'miss') { setCombo(0); sfx.hit() }
    else {
      setCombo((c) => { const nc = c + 1; setMaxCombo((mm) => Math.max(mm, nc)); return nc })
      setScore((s) => s + pts + Math.floor(combo * 5))
      playMelody(bestNote.melody || 330)
    }
    setLastJudge({ kind: judge, at: performance.now() })
  }, [status, combo, sfx, soundOn])

  // Keyboard input
  useEffect(() => {
    if (status !== 'playing') return
    const down = (e) => {
      const k = e.key.toLowerCase()
      const idx = LANE_KEYS.indexOf(k)
      if (idx >= 0) { e.preventDefault(); tapLane(idx) }
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [status, tapLane])

  const accuracy = (() => {
    const j = judgeCounts
    const total = j.perfect + j.great + j.good + j.miss
    if (!total) return 100
    // Weighted accuracy: perfect=100, great=75, good=40, miss=0
    return Math.round((j.perfect * 100 + j.great * 75 + j.good * 40) / total)
  })()

  const extraStats = (
    <>
      <div className="flex flex-col items-start">
        <span className="text-[10px] uppercase tracking-widest text-white/40">Combo</span>
        <span className="text-xl sm:text-2xl font-bold tabular-nums text-orange-300">×{combo}</span>
      </div>
      <div className="flex flex-col items-start">
        <span className="text-[10px] uppercase tracking-widest text-white/40">Acc</span>
        <span className="text-xl sm:text-2xl font-bold tabular-nums text-emerald-300">{accuracy}%</span>
      </div>
    </>
  )

  const overlay = status === 'ready' ? (
    <div className="absolute inset-0 z-30 grid place-items-center bg-black/70 backdrop-blur">
      <div className="text-center px-6 max-w-md">
        <h2 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-amber-300 via-rose-300 to-fuchsia-400 bg-clip-text text-transparent mb-2">
          Feel the beat
        </h2>
        <p className="text-white/70 mb-4">Tap when notes cross the hit line. 4 lanes: D F J K.</p>
        <div className="grid gap-2 mb-6">
          {TRACKS.map((t, i) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTrackIdx(i)}
              className={`px-4 py-2 rounded-lg border text-left transition-colors ${trackIdx === i ? 'border-fuchsia-400 bg-fuchsia-500/20 text-white' : 'border-white/15 bg-white/5 text-white/80 hover:border-white/30'}`}
            >
              <div className="font-bold">{t.name}</div>
              <div className="text-xs text-white/50">{t.bpm} BPM · {t.notes.length} notes · {'★'.repeat(t.difficulty)}</div>
            </button>
          ))}
        </div>
        <button type="button" onClick={start} className="px-6 py-3 rounded-xl bg-fuchsia-500 hover:bg-fuchsia-400 text-white font-bold text-lg">
          Play {track.name}
        </button>
      </div>
    </div>
  ) : status === 'over' ? (
    <div className="absolute inset-0 z-30 grid place-items-center bg-black/85 backdrop-blur">
      <div className="text-center px-6">
        <h2 className="text-4xl font-bold text-cyan-300 mb-2">Track complete</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 text-left">
          <div><div className="text-[10px] uppercase text-white/40">Score</div><div className="text-2xl font-bold text-amber-300">{score.toLocaleString()}</div></div>
          <div><div className="text-[10px] uppercase text-white/40">Max Combo</div><div className="text-2xl font-bold text-orange-300">×{maxCombo}</div></div>
          <div><div className="text-[10px] uppercase text-white/40">Accuracy</div><div className="text-2xl font-bold text-emerald-300">{accuracy}%</div></div>
          <div><div className="text-[10px] uppercase text-white/40">Best</div><div className="text-2xl font-bold text-rose-300">{best.toLocaleString()}</div></div>
        </div>
        <div className="text-white/70 text-sm mb-4">
          Perfect {judgeCounts.perfect} · Great {judgeCounts.great} · Good {judgeCounts.good} · Miss {judgeCounts.miss}
        </div>
        <button type="button" onClick={() => setStatus('ready')} className="px-6 py-3 rounded-xl bg-fuchsia-500 hover:bg-fuchsia-400 text-white font-bold text-lg">
          Pick another track
        </button>
      </div>
    </div>
  ) : null

  // Playfield metrics
  const HIT_LINE_FROM_BOTTOM_PCT = 15
  const playT = status === 'playing' ? performance.now() - startAt.current : 0

  // Compute Y position of a note as a % from top.
  // At (n.t - NOTE_TRAVEL_MS) it spawns at top (0%),
  // at n.t it should be at hit line (100 - HIT_LINE_FROM_BOTTOM_PCT).
  const yPctForNote = (n) => {
    const timeToHit = n.t - playT
    const progress = 1 - (timeToHit / NOTE_TRAVEL_MS)
    return progress * (100 - HIT_LINE_FROM_BOTTOM_PCT)
  }

  const judgeColor = {
    perfect: 'text-fuchsia-300',
    great:   'text-emerald-300',
    good:    'text-cyan-300',
    miss:    'text-rose-300',
  }
  const judgeLabel = { perfect: 'PERFECT', great: 'GREAT', good: 'GOOD', miss: 'MISS' }

  return (
    <GameShell
      title="Rhythm Tap"
      category="Reflex"
      score={score}
      best={best}
      level={track.difficulty}
      status={status === 'ready' ? 'ready' : status === 'over' ? 'won' : 'playing'}
      extraStats={extraStats}
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn((v) => !v)}
      onPause={() => {}}
      onRestart={restart}
      controls={[
        { key: 'D F J K', label: 'Lane taps' },
        { key: 'Tap',     label: 'Touch lane buttons' },
      ]}
      overlay={overlay}
    >
      <div className="relative w-full aspect-[3/4] sm:aspect-[4/5] bg-gradient-to-b from-slate-950 via-purple-950/30 to-black overflow-hidden select-none">
        {/* Ambient background */}
        <div className="absolute inset-0 pointer-events-none opacity-20"
             style={{ background: 'radial-gradient(circle at 50% 40%, #a855f755 0%, transparent 55%)' }} />

        {/* Track name pill */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-black/60 border border-white/10 text-xs text-white/80 font-semibold">
          {track.name} · {track.bpm} BPM
        </div>

        {/* Lane vertical dividers + notes */}
        <div className="absolute inset-0 flex">
          {Array.from({ length: LANES }).map((_, laneIdx) => {
            const flash = laneFlashUntil.current[laneIdx] > performance.now()
            return (
              <div
                key={laneIdx}
                className="relative flex-1 border-l last:border-r border-white/5"
                style={{ background: flash ? `${LANE_HUES[laneIdx]}22` : undefined, transition: 'background 120ms' }}
              >
                {/* Lane glow bar */}
                <div className="absolute inset-x-0 top-0 h-full opacity-10"
                     style={{ background: `linear-gradient(to bottom, transparent, ${LANE_HUES[laneIdx]} 90%)` }} />
                {notes.map((n) => {
                  if (n.lane !== laneIdx || n.judged) return null
                  const y = yPctForNote(n)
                  if (y < -8 || y > 105) return null
                  return (
                    <div
                      key={n.id}
                      className="absolute left-1/2 -translate-x-1/2"
                      style={{ top: `${y}%`, width: '70%', pointerEvents: 'none' }}
                    >
                      {/* Trailing glow */}
                      <div className="absolute inset-x-0 -top-8 h-8 rounded-full opacity-60"
                           style={{ background: `linear-gradient(to bottom, transparent, ${LANE_GLOWS[laneIdx]}66)` }} />
                      {/* The tile note */}
                      <div className="h-3 sm:h-4 rounded-md shadow-[0_0_20px_rgba(255,255,255,0.3)]"
                           style={{
                             background: `linear-gradient(to bottom, ${LANE_GLOWS[laneIdx]}, ${LANE_HUES[laneIdx]})`,
                             border: `1px solid ${LANE_GLOWS[laneIdx]}`,
                           }} />
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Hit line */}
        <div className="absolute inset-x-0 z-10 pointer-events-none"
             style={{ bottom: `${HIT_LINE_FROM_BOTTOM_PCT}%`, height: 4 }}>
          <div className="w-full h-full bg-white/60 shadow-[0_0_20px_rgba(255,255,255,0.7)]" />
        </div>

        {/* Judgement flash */}
        {lastJudge && performance.now() - lastJudge.at < 500 && (
          <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none z-20"
               style={{ bottom: `${HIT_LINE_FROM_BOTTOM_PCT + 12}%` }}>
            <div className={`font-black text-2xl sm:text-4xl ${judgeColor[lastJudge.kind]}`}
                 style={{ animation: 'rt-pop 500ms ease-out forwards' }}>
              {judgeLabel[lastJudge.kind]}
              {combo > 3 && lastJudge.kind !== 'miss' && (
                <span className="ml-2 text-amber-300 text-lg sm:text-2xl">×{combo}</span>
              )}
            </div>
          </div>
        )}

        {/* Lane tap buttons (touch/click) */}
        <div className="absolute inset-x-0 bottom-0 z-20 flex" style={{ height: `${HIT_LINE_FROM_BOTTOM_PCT}%` }}>
          {Array.from({ length: LANES }).map((_, i) => (
            <button
              key={i}
              type="button"
              onPointerDown={(e) => { e.preventDefault(); tapLane(i) }}
              className="flex-1 border-l last:border-r border-white/10 touch-manipulation active:brightness-125 focus:outline-none"
              style={{ background: `linear-gradient(to top, ${LANE_HUES[i]}66, ${LANE_HUES[i]}00)` }}
              aria-label={`lane ${i + 1}`}
            >
              <div className="w-full h-full grid place-items-center">
                <span className="font-bold text-white/70 text-sm sm:text-base">{LANE_LABELS[i]}</span>
              </div>
            </button>
          ))}
        </div>

        <style>{`
          @keyframes rt-pop {
            0%   { transform: translateY(0)   scale(0.6); opacity: 0; }
            25%  { transform: translateY(-10px) scale(1.2); opacity: 1; }
            100% { transform: translateY(-30px) scale(1);   opacity: 0; }
          }
        `}</style>
      </div>
    </GameShell>
  )
}
