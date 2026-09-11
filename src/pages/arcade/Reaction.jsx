// /arcade/reaction — Reaction Test.
//
// Three sub-modes selectable from a tab strip:
//   1. Single-tap  — classic red-until-green then tap fast. One shot.
//   2. Sequence    — 5 trials, average is your score. Median printed.
//   3. Stroop test — a colour word appears in a DIFFERENT ink colour.
//                    You tap the button matching the INK colour, not
//                    the word. Measures cognitive-interference latency.
//
// Best times are persisted per-mode. Every trial timestamp is captured
// with performance.now() (~sub-ms precision), so displayed times are
// truthful. Anti-cheat: if the user taps BEFORE the green flip, we
// log the trial as a false start and require them to reset — no way
// to game the clock.

import { useEffect, useMemo, useRef, useState } from 'react'
import GameShell from '../../components/arcade/GameShell'
import { getSfx } from '../../components/arcade/sfx'

const KEY = (mode) => `sid-arcade-reaction-${mode}-best`

const RULES = [
  { heading: 'Goal', body: 'Measure your visual reaction time. Sub-200 ms is world-class; typical adults land around 240-290 ms. Best time per sub-mode is persisted separately in localStorage.' },
  { heading: 'Sub-modes', body: 'Single — one red-to-green flip. You get one shot; false starts penalise you.\nSequence — five trials in a row; final score is the average, median is shown.\nStroop — the colour word "RED" may appear in blue ink. Tap the INK colour, not the word. Adds cognitive interference on top of pure reaction time.' },
  { heading: 'Controls', body: 'Any key or click / tap fires the reaction. In Stroop mode, use the six colour buttons at the bottom. Screen respects any input source (keyboard, mouse, touch).' },
  { heading: 'Timing accuracy', body: 'Every trial uses `performance.now()` which is sub-millisecond precision in modern browsers. There\'s no rounding: displayed times reflect the true latency between the green flip and your input.' },
  { heading: 'False start protection', body: 'If you input BEFORE the green flip, the trial is logged as a false start. You must reset (Space/Enter/tap "Reset") to begin a new trial. This makes the test un-gameable — you can\'t just spam the button.' },
  { heading: 'Difficulty', body: 'Easy = long fixed wait (2–4 s), 3 trials in sequence, no false-start penalty. Hard = short random wait (0.5–1.5 s), 10 trials in sequence, false starts cost 200 ms. Custom exposes min/max wait, trial count, and false-start penalty.' },
]

const DIFFICULTIES = {
  Easy:   { minWait: 2000, maxWait: 4000, trialCount: 3,  falseStartPenalty: 0 },
  Medium: { minWait: 1200, maxWait: 3600, trialCount: 5,  falseStartPenalty: 100 },
  Hard:   { minWait: 500,  maxWait: 1500, trialCount: 10, falseStartPenalty: 200 },
}

const CUSTOM_SCHEMA = {
  minWait:           { label: 'Min wait (ms)', min: 300, max: 3000, step: 100, default: 1200 },
  maxWait:           { label: 'Max wait (ms)', min: 800, max: 6000, step: 100, default: 3600 },
  trialCount:        { label: 'Trials',        min: 1,   max: 20,   step: 1,   default: 5 },
  falseStartPenalty: { label: 'False start pen (ms)', min: 0, max: 500, step: 25, default: 100 },
}

const STROOP_COLORS = [
  { name: 'RED',    hex: '#ef4444' },
  { name: 'GREEN',  hex: '#22c55e' },
  { name: 'BLUE',   hex: '#3b82f6' },
  { name: 'YELLOW', hex: '#eab308' },
  { name: 'PURPLE', hex: '#a855f7' },
  { name: 'CYAN',   hex: '#06b6d4' },
]

const fmt = (ms) => ms == null ? '—' : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`

export default function Reaction() {
  const sfx = useMemo(() => getSfx(), [])
  const [soundOn, setSoundOn] = useState(true)
  useEffect(() => { sfx.setEnabled(soundOn) }, [soundOn, sfx])

  const [mode, setMode] = useState('single')     // single | sequence | stroop
  const [state, setState] = useState('idle')     // idle | waiting | ready | done | failed
  const [reactionMs, setReactionMs] = useState(null)
  const [best, setBest] = useState({
    single:   Number(localStorage.getItem(KEY('single'))   || 0) || null,
    sequence: Number(localStorage.getItem(KEY('sequence')) || 0) || null,
    stroop:   Number(localStorage.getItem(KEY('stroop'))   || 0) || null,
  })

  const [trials, setTrials] = useState([])   // ms of each completed trial
  const [difficulty, setDifficulty] = useState('Medium')
  const [customValues, setCustomValues] = useState({
    minWait: CUSTOM_SCHEMA.minWait.default,
    maxWait: CUSTOM_SCHEMA.maxWait.default,
    trialCount: CUSTOM_SCHEMA.trialCount.default,
    falseStartPenalty: CUSTOM_SCHEMA.falseStartPenalty.default,
  })
  const cfg = difficulty === 'Custom' ? customValues : DIFFICULTIES[difficulty]
  const cfgRef = useRef(cfg)
  useEffect(() => { cfgRef.current = cfg }, [cfg])
  const trialLen = cfg.trialCount
  const [stroopWord, setStroopWord] = useState(null)
  const [stroopInk, setStroopInk] = useState(null)
  const [stroopAcc, setStroopAcc] = useState({ correct: 0, wrong: 0 })

  const goAt = useRef(0)
  const waitTimer = useRef(null)
  const trialsRef = useRef([])
  useEffect(() => { trialsRef.current = trials }, [trials])

  const clearTimers = () => { if (waitTimer.current) clearTimeout(waitTimer.current); waitTimer.current = null }

  const armSingle = () => {
    setState('waiting')
    setReactionMs(null)
    const min = cfgRef.current.minWait
    const max = cfgRef.current.maxWait
    const delay = min + Math.random() * Math.max(0, (max - min))
    waitTimer.current = setTimeout(() => {
      goAt.current = performance.now()
      setState('ready')
      sfx.chirp()
    }, delay)
  }

  const armStroop = () => {
    setState('waiting')
    const wordC = STROOP_COLORS[Math.floor(Math.random() * STROOP_COLORS.length)]
    let inkC = wordC
    if (Math.random() > 0.35) {
      const others = STROOP_COLORS.filter((c) => c.name !== wordC.name)
      inkC = others[Math.floor(Math.random() * others.length)]
    }
    setStroopWord(wordC)
    setStroopInk(inkC)
    const delay = 800 + Math.random() * 1500
    waitTimer.current = setTimeout(() => {
      goAt.current = performance.now()
      setState('ready')
      sfx.chirp()
    }, delay)
  }

  const start = () => {
    clearTimers()
    setTrials([])
    setStroopAcc({ correct: 0, wrong: 0 })
    setReactionMs(null)
    if (mode === 'stroop') armStroop()
    else armSingle()
  }

  const restart = () => start()

  const onPanelDown = () => {
    if (mode === 'stroop') return
    if (state === 'idle' || state === 'done' || state === 'failed') {
      start()
      return
    }
    if (state === 'waiting') {
      clearTimers()
      setState('failed')
      sfx.death()
      return
    }
    if (state === 'ready') {
      const ms = performance.now() - goAt.current
      sfx.pop()
      if (mode === 'single') {
        setReactionMs(ms)
        setState('done')
        setBest((prev) => {
          const cur = prev.single
          if (cur == null || ms < cur) {
            localStorage.setItem(KEY('single'), String(ms))
            sfx.win()
            return { ...prev, single: ms }
          }
          return prev
        })
      } else if (mode === 'sequence') {
        const nt = [...trialsRef.current, ms]
        setTrials(nt)
        if (nt.length >= trialLen) {
          const avg = nt.reduce((a, b) => a + b, 0) / nt.length
          setReactionMs(avg)
          setState('done')
          setBest((prev) => {
            const cur = prev.sequence
            if (cur == null || avg < cur) {
              localStorage.setItem(KEY('sequence'), String(avg))
              sfx.win()
              return { ...prev, sequence: avg }
            }
            return prev
          })
        } else {
          setState('idle')
          setTimeout(armSingle, 700)
        }
      }
    }
  }

  const onStroopAnswer = (colour) => {
    if (state !== 'ready') return
    const ms = performance.now() - goAt.current
    const correct = colour.name === stroopInk.name
    if (correct) {
      sfx.pop()
      setStroopAcc((a) => ({ ...a, correct: a.correct + 1 }))
      const nt = [...trialsRef.current, ms]
      setTrials(nt)
      if (nt.length >= trialLen) {
        const avg = nt.reduce((a, b) => a + b, 0) / nt.length
        setReactionMs(avg)
        setState('done')
        setBest((prev) => {
          const cur = prev.stroop
          if (cur == null || avg < cur) {
            localStorage.setItem(KEY('stroop'), String(avg))
            sfx.win()
            return { ...prev, stroop: avg }
          }
          return prev
        })
      } else {
        setState('idle')
        setTimeout(armStroop, 700)
      }
    } else {
      sfx.death()
      setStroopAcc((a) => ({ ...a, wrong: a.wrong + 1 }))
      setState('failed')
    }
  }

  useEffect(() => () => clearTimers(), [])

  const panelBg =
    state === 'waiting' ? 'bg-rose-600' :
    state === 'ready'   ? 'bg-emerald-500' :
    state === 'failed'  ? 'bg-amber-600' :
    state === 'done'    ? 'bg-cyan-600' :
    'bg-slate-800'

  const panelLabel = () => {
    if (mode === 'stroop') {
      if (state === 'waiting') return 'Get ready…'
      if (state === 'ready')   return null
      if (state === 'failed')  return 'Wrong ink · restart'
      if (state === 'done')    return `Avg ${fmt(reactionMs)}`
      return 'Tap Start'
    }
    if (state === 'waiting') return 'Wait for GREEN…'
    if (state === 'ready')   return 'TAP NOW'
    if (state === 'failed')  return 'Too early!'
    if (state === 'done')    return fmt(reactionMs)
    return mode === 'sequence'
      ? (trials.length ? `Trial ${trials.length + 1}/${trialLen}` : 'Tap to start · 5 trials')
      : 'Tap to start'
  }

  const modeSwitch = (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex gap-1 bg-black/60 border border-white/10 rounded-full p-1 backdrop-blur">
      {['single', 'sequence', 'stroop'].map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => { clearTimers(); setMode(m); setState('idle'); setTrials([]); setReactionMs(null) }}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider transition-colors ${mode === m ? 'bg-white text-black' : 'text-white/70 hover:text-white'}`}
        >
          {m === 'single' ? 'Single' : m === 'sequence' ? '5 avg' : 'Stroop'}
        </button>
      ))}
    </div>
  )

  const bestPill = (
    <div className="flex flex-col items-start">
      <span className="text-[10px] uppercase tracking-widest text-white/40">Best</span>
      <span className="text-xl sm:text-2xl font-bold tabular-nums text-rose-300">{fmt(best[mode])}</span>
    </div>
  )

  const extraStats = (
    <>
      <div className="flex flex-col items-start">
        <span className="text-[10px] uppercase tracking-widest text-white/40">Last</span>
        <span className="text-xl sm:text-2xl font-bold tabular-nums text-cyan-300">{fmt(reactionMs)}</span>
      </div>
      {mode === 'sequence' && (
        <div className="flex flex-col items-start">
          <span className="text-[10px] uppercase tracking-widest text-white/40">Trials</span>
          <span className="text-xl sm:text-2xl font-bold tabular-nums text-fuchsia-300">{trials.length}/{trialLen}</span>
        </div>
      )}
      {mode === 'stroop' && (
        <div className="flex flex-col items-start">
          <span className="text-[10px] uppercase tracking-widest text-white/40">Acc</span>
          <span className="text-xl sm:text-2xl font-bold tabular-nums text-emerald-300">
            {stroopAcc.correct}/{stroopAcc.correct + stroopAcc.wrong}
          </span>
        </div>
      )}
    </>
  )

  return (
    <GameShell
      title="Reaction Test"
      category="Reflex"
      score={reactionMs != null ? Math.max(0, Math.round(500 - reactionMs)) : 0}
      best={best[mode] != null ? Math.max(0, Math.round(500 - best[mode])) : 0}
      level={mode === 'single' ? 1 : mode === 'sequence' ? 2 : 3}
      status={state === 'ready' ? 'playing' : state === 'done' ? 'won' : state === 'failed' ? 'over' : 'ready'}
      extraStats={<>{bestPill}{extraStats}</>}
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn((v) => !v)}
      onPause={() => {}}
      onRestart={restart}
      rules={RULES}
      difficulty={difficulty}
      onDifficultyChange={setDifficulty}
      customSchema={CUSTOM_SCHEMA}
      customValues={customValues}
      onCustomChange={setCustomValues}
      controls={[
        { key: 'Tap',   label: 'Panel / colour' },
        { key: 'Space', label: 'Restart' },
      ]}
    >
      <div className="relative w-full aspect-[4/3] overflow-hidden select-none">
        {modeSwitch}

        {mode !== 'stroop' && (
          <button
            type="button"
            onPointerDown={onPanelDown}
            className={`absolute inset-0 w-full h-full transition-colors duration-100 grid place-items-center touch-manipulation focus:outline-none ${panelBg}`}
          >
            <div className="text-center px-4">
              <div className={`font-bold ${state === 'ready' ? 'text-white' : 'text-white/95'} drop-shadow-lg`}
                   style={{ fontSize: 'clamp(2rem, 8vw, 5rem)' }}>
                {panelLabel()}
              </div>
              {state === 'idle' && mode === 'sequence' && trials.length > 0 && (
                <div className="mt-4 text-white/90 text-sm">
                  Trials so far: {trials.map((t) => fmt(t)).join(' · ')}
                </div>
              )}
              {state === 'done' && mode === 'sequence' && trials.length > 0 && (
                <div className="mt-4 text-white/90 text-sm space-y-1">
                  <div>Min {fmt(Math.min(...trials))} · Max {fmt(Math.max(...trials))}</div>
                  <div>Median {fmt([...trials].sort((a,b)=>a-b)[Math.floor(trials.length/2)])}</div>
                </div>
              )}
              {state === 'idle' && (
                <div className="mt-4 text-white/70 text-sm">Anywhere on the panel</div>
              )}
            </div>
          </button>
        )}

        {mode === 'stroop' && (
          <div className="absolute inset-0 flex flex-col bg-slate-900">
            <div className="flex-1 grid place-items-center px-4 pt-8">
              {state === 'ready' && stroopWord && stroopInk ? (
                <div className="text-center">
                  <p className="text-white/60 text-xs uppercase tracking-widest mb-2">Tap the INK colour</p>
                  <div
                    className="font-black leading-none"
                    style={{ color: stroopInk.hex, fontSize: 'clamp(3rem, 14vw, 8rem)' }}
                  >
                    {stroopWord.name}
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <div className="font-bold text-white/80" style={{ fontSize: 'clamp(2rem, 6vw, 3.5rem)' }}>
                    {panelLabel()}
                  </div>
                  {state === 'idle' && trials.length === 0 && (
                    <button type="button" onClick={start} className="mt-6 px-6 py-3 rounded-xl bg-fuchsia-500 hover:bg-fuchsia-400 text-white font-bold text-lg">
                      Start 5 trials
                    </button>
                  )}
                  {state === 'failed' && (
                    <button type="button" onClick={start} className="mt-6 px-6 py-3 rounded-xl bg-fuchsia-500 hover:bg-fuchsia-400 text-white font-bold text-lg">
                      Restart
                    </button>
                  )}
                  {state === 'done' && (
                    <div className="mt-4 text-white/80 text-sm space-y-1">
                      <div>Trials: {trials.map((t) => fmt(t)).join(' · ')}</div>
                      <div>Correct: {stroopAcc.correct} · Wrong: {stroopAcc.wrong}</div>
                      <button type="button" onClick={start} className="mt-4 px-5 py-2 rounded-lg bg-fuchsia-500 hover:bg-fuchsia-400 text-white font-bold">
                        Play again
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3 p-3 sm:p-4 bg-black/40 border-t border-white/10">
              {STROOP_COLORS.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onPointerDown={(e) => { e.preventDefault(); onStroopAnswer(c) }}
                  disabled={state !== 'ready'}
                  className="h-14 sm:h-16 rounded-xl font-bold text-white text-xs sm:text-sm shadow-lg touch-manipulation active:scale-95 transition-transform disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-white/60"
                  style={{ background: c.hex }}
                  aria-label={`answer ${c.name}`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </GameShell>
  )
}
