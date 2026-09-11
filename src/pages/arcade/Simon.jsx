// /arcade/simon — Simon.
//
// Classic memory-sequence game: the machine plays a sequence of colour
// tones, you replay it. Every round the sequence grows by one. Playback
// tempo tightens with each level (down to 220ms per beat by level 12).
//
// Pads:
//   • Easy    — 4 quadrants (classic red / green / blue / yellow)
//   • Hard    — 6 pads (adds violet + cyan) with slightly tighter timing
//
// Each pad has a distinct AudioContext tone (real note frequencies in a
// minor pentatonic so mashing them sounds musical, not painful).
//
// The pad is a real 3D-bevel SVG with two states (dim / bright). When
// active it emits a soft outer glow via a filter blur. On press the
// pad scales down slightly so tapping *feels* responsive.
//
// Longest sequence persisted to localStorage. Streak counter tracks
// consecutive perfect rounds without a mistake.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GameShell from '../../components/arcade/GameShell'
import { getSfx } from '../../components/arcade/sfx'

const BEST_KEY = 'sid-arcade-simon-best'

const RULES = [
  { heading: 'Goal', body: 'Watch the sequence, then replay it. Every round adds one more note. Your score is the length of the longest sequence you\'ve completed.' },
  { heading: 'Controls', body: 'Tap or click the pad that matches each colour/tone in the sequence. On desktop, the pointer registers on down (no click delay). Missing a pad or pressing the wrong one ends the run.' },
  { heading: 'Musical', body: 'Each pad plays a distinct triangle-wave tone from a minor pentatonic scale — mashing them accidentally will still sound musical. AudioContext resumes on first tap (browser autoplay-policy compliant).' },
  { heading: 'Tempo', body: 'Level 1 plays notes at 620 ms each. Every level tightens the note duration until floor of 220 ms at level 12+. Gap between notes is 40 % of the note length.' },
  { heading: 'Modes', body: 'The classic mode uses 4 pads (red / green / blue / yellow). Hard mode adds violet and cyan for a 6-pad layout — sequences become much harder to memorise as the ear has to track more colours.' },
  { heading: 'Streak', body: 'Streak = consecutive perfect rounds without a mistake. It resets to 0 on game over and is shown in the HUD alongside sequence length.' },
  { heading: 'Difficulty', body: 'Easy = 4 pads, sequences begin at length 1, slow playback, forgiving error window. Hard = 6 pads, sequences begin at length 3, faster playback. Custom exposes sequence start length, playback speed, error tolerance, and pad count.' },
]

const DIFFICULTIES = {
  Easy:   { startLen: 1, playbackMult: 1.5, errorTolerance: 300, padCount: 4 },
  Medium: { startLen: 1, playbackMult: 1.0, errorTolerance: 120, padCount: 4 },
  Hard:   { startLen: 3, playbackMult: 0.7, errorTolerance: 60,  padCount: 6 },
}

const CUSTOM_SCHEMA = {
  startLen:       { label: 'Start length',    min: 1,   max: 6,   step: 1,  default: 1 },
  playbackMult:   { label: 'Playback speed',  min: 0.4, max: 2.0, step: 0.1, default: 1.0 },
  errorTolerance: { label: 'Error tolerance', min: 0,   max: 500, step: 20, default: 120 },
  padCount:       { label: 'Pad count',       min: 4,   max: 6,   step: 2,  default: 4 },
}

// Notes tuned to a pentatonic scale — mashing feels musical.
const PADS_4 = [
  { id: 'g', freq: 220.00, hex: '#22c55e', glow: '#86efac' },
  { id: 'r', freq: 261.63, hex: '#ef4444', glow: '#fca5a5' },
  { id: 'y', freq: 329.63, hex: '#eab308', glow: '#fde68a' },
  { id: 'b', freq: 392.00, hex: '#3b82f6', glow: '#93c5fd' },
]

const PADS_6 = [
  { id: 'g', freq: 196.00, hex: '#22c55e', glow: '#86efac' },
  { id: 'r', freq: 246.94, hex: '#ef4444', glow: '#fca5a5' },
  { id: 'y', freq: 293.66, hex: '#eab308', glow: '#fde68a' },
  { id: 'b', freq: 349.23, hex: '#3b82f6', glow: '#93c5fd' },
  { id: 'v', freq: 440.00, hex: '#a855f7', glow: '#d8b4fe' },
  { id: 'c', freq: 523.25, hex: '#06b6d4', glow: '#67e8f9' },
]

// Sequence playback tempo curve. Level 1 plays each note for 600ms;
// level 12 down to ~220ms. Gap = 40% of the play length.
const tempoFor = (level, mult = 1) => {
  const dur = Math.max(180, (620 - level * 32) * mult)
  return { dur, gap: Math.round(dur * 0.4) }
}

export default function Simon() {
  const sfx = useMemo(() => getSfx(), [])
  const [soundOn, setSoundOn] = useState(true)
  useEffect(() => { sfx.setEnabled(soundOn) }, [soundOn, sfx])

  const [mode, setMode] = useState('easy')  // easy | hard (legacy pad switch)
  const [difficulty, setDifficulty] = useState('Medium')
  const [customValues, setCustomValues] = useState({
    startLen: CUSTOM_SCHEMA.startLen.default,
    playbackMult: CUSTOM_SCHEMA.playbackMult.default,
    errorTolerance: CUSTOM_SCHEMA.errorTolerance.default,
    padCount: CUSTOM_SCHEMA.padCount.default,
  })
  const cfg = difficulty === 'Custom' ? customValues : DIFFICULTIES[difficulty]
  const cfgRef = useRef(cfg)
  useEffect(() => { cfgRef.current = cfg; setMode(cfg.padCount >= 6 ? 'hard' : 'easy') }, [cfg])
  const pads = (cfg.padCount >= 6 || mode !== 'easy') ? PADS_6 : PADS_4
  const [level, setLevel] = useState(1)
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(() => Number(localStorage.getItem(BEST_KEY) || 0))
  const [streak, setStreak] = useState(0)
  const [status, setStatus] = useState('ready')   // ready | playing | over
  const [phase, setPhase] = useState('idle')      // idle | showing | input
  const [activePad, setActivePad] = useState(null)
  const [pressPad, setPressPad] = useState(null)
  const [wrongPad, setWrongPad] = useState(null)
  const seq = useRef([])
  const inputIdx = useRef(0)
  const cancelPlay = useRef(null)

  // AudioContext oscillator — sustained tone with envelope.
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
  const playTone = useCallback((freq, dur = 0.35, gain = 0.08) => {
    if (!soundOn) return
    const ctx = ensureAC(); if (!ctx) return
    const t0 = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(freq, t0)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(g).connect(ctx.destination)
    osc.start(t0)
    osc.stop(t0 + dur + 0.02)
  }, [soundOn])

  const flash = (padId, ms) => new Promise((res) => {
    setActivePad(padId)
    const t = setTimeout(() => { setActivePad(null); res() }, ms)
    cancelPlay.current = () => { clearTimeout(t); res() }
  })

  const playSequence = useCallback(async (arr) => {
    setPhase('showing')
    const { dur, gap } = tempoFor(level, cfgRef.current.playbackMult)
    await new Promise((r) => setTimeout(r, 500))
    for (let i = 0; i < arr.length; i++) {
      const p = pads.find((x) => x.id === arr[i])
      if (!p) continue
      playTone(p.freq, dur / 1000)
      await flash(p.id, dur)
      await new Promise((r) => setTimeout(r, gap))
    }
    setPhase('input')
    inputIdx.current = 0
  }, [level, pads, playTone])

  const addToSequence = useCallback(() => {
    const nextId = pads[Math.floor(Math.random() * pads.length)].id
    seq.current = [...seq.current, nextId]
  }, [pads])

  const startRound = useCallback(() => {
    addToSequence()
    playSequence(seq.current)
  }, [addToSequence, playSequence])

  const start = () => {
    seq.current = []
    inputIdx.current = 0
    setLevel(1); setScore(0); setStreak(0)
    setStatus('playing')
    setTimeout(() => {
      const initialLen = Math.max(1, cfgRef.current.startLen)
      for (let i = 0; i < initialLen; i++) addToSequence()
      playSequence([...seq.current])
    }, 200)
  }

  const gameOver = (padId) => {
    setWrongPad(padId)
    setStatus('over')
    setPhase('idle')
    setStreak(0)
    sfx.death()
    setBest((b) => {
      const nb = Math.max(b, seq.current.length - 1)
      localStorage.setItem(BEST_KEY, String(nb))
      return nb
    })
    setTimeout(() => setWrongPad(null), 1200)
  }

  const onPadTap = (padId) => {
    if (phase !== 'input' || status !== 'playing') return
    const p = pads.find((x) => x.id === padId)
    if (!p) return
    setPressPad(padId)
    setActivePad(padId)
    playTone(p.freq, 0.22, 0.09)
    setTimeout(() => { setActivePad(null); setPressPad(null) }, 180)

    const expected = seq.current[inputIdx.current]
    if (padId !== expected) { gameOver(padId); return }
    inputIdx.current += 1
    if (inputIdx.current >= seq.current.length) {
      setLevel((l) => l + 1)
      setScore((s) => s + seq.current.length * 10)
      setStreak((k) => k + 1)
      sfx.chirp()
      setTimeout(() => startRound(), 500)
    }
  }

  useEffect(() => () => cancelPlay.current?.(), [])

  const extraStats = (
    <>
      <div className="flex flex-col items-start">
        <span className="text-[10px] uppercase tracking-widest text-white/40">Streak</span>
        <span className="text-xl sm:text-2xl font-bold tabular-nums text-orange-300">{streak}</span>
      </div>
      <div className="flex flex-col items-start">
        <span className="text-[10px] uppercase tracking-widest text-white/40">Sequence</span>
        <span className="text-xl sm:text-2xl font-bold tabular-nums text-cyan-300">{seq.current.length}</span>
      </div>
    </>
  )

  const modeSwitch = (
    <div className="absolute top-3 right-3 z-10 flex gap-1 bg-black/60 border border-white/10 rounded-full p-1">
      {['easy','hard'].map((m) => (
        <button
          key={m}
          type="button"
          disabled={status === 'playing'}
          onClick={() => setMode(m)}
          className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider transition-colors ${mode === m ? 'bg-white text-black' : 'text-white/70 hover:text-white'} disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {m === 'easy' ? '4 pads' : '6 pads'}
        </button>
      ))}
    </div>
  )

  const overlay = status === 'ready' ? (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/70 backdrop-blur">
      <div className="text-center px-6">
        <h2 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-amber-300 via-rose-300 to-fuchsia-400 bg-clip-text text-transparent mb-2">
          Simon says
        </h2>
        <p className="text-white/70 max-w-md mx-auto mb-6">Watch. Then repeat. Every round adds one.</p>
        <button type="button" onClick={start} className="px-6 py-3 rounded-xl bg-fuchsia-500 hover:bg-fuchsia-400 text-white font-bold text-lg">
          Start
        </button>
      </div>
    </div>
  ) : status === 'over' ? (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/80 backdrop-blur">
      <div className="text-center px-6">
        <h2 className="text-4xl font-bold text-rose-300 mb-2">Wrong pad</h2>
        <p className="text-white/70 mb-1">Sequence reached: <span className="text-white font-bold">{seq.current.length}</span></p>
        <p className="text-white/70 mb-6">Longest ever: <span className="text-white font-bold">{Math.max(best, seq.current.length - 1)}</span></p>
        <button type="button" onClick={start} className="px-6 py-3 rounded-xl bg-fuchsia-500 hover:bg-fuchsia-400 text-white font-bold text-lg">
          Try again
        </button>
      </div>
    </div>
  ) : null

  const layoutClasses = mode === 'easy'
    ? 'grid-cols-2 grid-rows-2'
    : 'grid-cols-3 grid-rows-2'

  return (
    <GameShell
      title="Simon"
      category="Reflex"
      score={score}
      best={best}
      level={level}
      status={phase === 'showing' ? 'playing' : status === 'ready' ? 'ready' : status}
      extraStats={extraStats}
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn((v) => !v)}
      onPause={() => {}}
      onRestart={start}
      rules={RULES}
      difficulty={difficulty}
      onDifficultyChange={setDifficulty}
      customSchema={CUSTOM_SCHEMA}
      customValues={customValues}
      onCustomChange={setCustomValues}
      controls={[{ key: 'Tap', label: 'Press pad' }]}
      overlay={overlay}
    >
      <div className="relative w-full aspect-[4/3] bg-gradient-to-br from-slate-950 via-purple-950/40 to-slate-950 grid place-items-center overflow-hidden">
        {modeSwitch}
        <div className="absolute inset-0 pointer-events-none opacity-20">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(217,70,239,0.4)_0%,transparent_45%)]" />
        </div>
        <div className={`relative grid ${layoutClasses} gap-3 sm:gap-4 w-[86%] max-w-[560px] aspect-square`}>
          {pads.map((p) => {
            const active = activePad === p.id
            const pressed = pressPad === p.id
            const wrong = wrongPad === p.id
            return (
              <button
                key={p.id}
                type="button"
                onPointerDown={(e) => { e.preventDefault(); onPadTap(p.id) }}
                aria-label={`pad ${p.id}`}
                className="relative rounded-3xl select-none touch-manipulation focus:outline-none focus:ring-4 focus:ring-white/20"
                style={{
                  transform: pressed ? 'scale(0.96)' : 'scale(1)',
                  transition: 'transform 120ms ease',
                }}
              >
                <svg viewBox="0 0 100 100" className="w-full h-full">
                  <defs>
                    <radialGradient id={`grad-${p.id}`} cx="0.4" cy="0.3" r="0.8">
                      <stop offset="0%" stopColor={p.glow} stopOpacity={active ? 1 : 0.55} />
                      <stop offset="60%" stopColor={p.hex} />
                      <stop offset="100%" stopColor="#000" stopOpacity={0.7} />
                    </radialGradient>
                    <filter id={`glow-${p.id}`}>
                      <feGaussianBlur stdDeviation="4" />
                    </filter>
                  </defs>
                  {active && (
                    <rect x="4" y="4" width="92" height="92" rx="22" fill={p.glow} opacity="0.6" filter={`url(#glow-${p.id})`} />
                  )}
                  <rect x="6" y="6" width="88" height="88" rx="20" fill={`url(#grad-${p.id})`} />
                  <rect x="6" y="6" width="88" height="30" rx="20" fill="white" opacity={active ? 0.35 : 0.12} />
                  <rect x="6" y="70" width="88" height="24" rx="20" fill="black" opacity={active ? 0.05 : 0.2} />
                  {wrong && (
                    <rect x="6" y="6" width="88" height="88" rx="20" fill="none" stroke="#f43f5e" strokeWidth="4" opacity="0.9">
                      <animate attributeName="opacity" values="0.9;0.2;0.9" dur="0.4s" repeatCount="2" />
                    </rect>
                  )}
                </svg>
              </button>
            )
          })}
        </div>
        <div className="absolute pointer-events-none">
          <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-slate-900 border-4 border-slate-700 grid place-items-center shadow-inner">
            <span className={`font-bold text-lg tracking-widest ${phase === 'showing' ? 'text-amber-300' : phase === 'input' ? 'text-emerald-300' : 'text-white/50'}`}>
              {phase === 'showing' ? 'WATCH' : phase === 'input' ? 'GO' : 'SIMON'}
            </span>
          </div>
        </div>
      </div>
    </GameShell>
  )
}
