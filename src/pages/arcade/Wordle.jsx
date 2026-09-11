// Wordle — 5-letter word guessing puzzle.
//
// Design notes:
//   • Two word pools: ANSWERS (~2300 common words used as puzzle
//     solutions) and VALID_GUESSES (~7000+ combined pool that also
//     accepts obscure words as guesses but never as answers).
//   • Letter classification uses Wordle's canonical two-pass rule:
//     1) mark exact matches as green, decrement their remaining-count
//        from the answer's letter multiset
//     2) for each remaining guess letter, mark yellow if there's still
//        one available in the multiset; else gray
//     This correctly handles duplicates (e.g. answer=CANAL, guess=NAANA
//     highlights only the appropriate N's and A's).
//   • Tile flip: 5 tiles flip left→right with 320ms stagger. Flip
//     reveals the classification colour at the halfway point.
//   • Keyboard state is aggregated across all attempts — a letter
//     is green if ever green, else yellow if ever yellow, else gray.
//   • Hard mode: revealed hints must be re-used in subsequent guesses.
//   • Streak persists across sessions in localStorage. A streak breaks
//     on a loss OR skipping (Give up).
//   • Share button generates the emoji grid the classic Wordle way.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GameShell from '../../components/arcade/GameShell'
import { getSfx } from '../../components/arcade/sfx'
import { ANSWERS, VALID_GUESSES, VALID_GUESS_COUNT } from './wordleWords'

const ROWS = 6
const COLS = 5

const KEYBOARD_ROWS = [
  ['q','w','e','r','t','y','u','i','o','p'],
  ['a','s','d','f','g','h','j','k','l'],
  ['ENTER','z','x','c','v','b','n','m','BACK'],
]

// Classify a single guess against the answer. Returns 5-char string of
// 'g' (green), 'y' (yellow), 'x' (gray).
function classifyGuess(guess, answer) {
  const g = guess.toLowerCase()
  const a = answer.toLowerCase()
  const result = ['x','x','x','x','x']
  const remaining = {}
  // First pass: greens + build letter counts of un-matched answer letters.
  for (let i = 0; i < COLS; i++) {
    if (g[i] === a[i]) {
      result[i] = 'g'
    } else {
      remaining[a[i]] = (remaining[a[i]] || 0) + 1
    }
  }
  // Second pass: yellows if letter still available.
  for (let i = 0; i < COLS; i++) {
    if (result[i] === 'g') continue
    const ch = g[i]
    if (remaining[ch] > 0) {
      result[i] = 'y'
      remaining[ch]--
    }
  }
  return result.join('')
}

// Aggregate keyboard states: green beats yellow beats gray beats unseen.
function keyboardStateFrom(history) {
  const state = {}
  for (const { guess, mark } of history) {
    for (let i = 0; i < guess.length; i++) {
      const ch = guess[i]
      const m = mark[i]
      const cur = state[ch]
      if (m === 'g') state[ch] = 'g'
      else if (m === 'y' && cur !== 'g') state[ch] = 'y'
      else if (!cur) state[ch] = 'x'
    }
  }
  return state
}

// Given a history so far, extract the required constraints for hard mode
// (positions that must be a specific letter + set of letters that must
// appear somewhere).
function hardModeRequirements(history) {
  const musts = ['','','','','']
  const mustContain = new Map() // letter → minimum count
  for (const { guess, mark } of history) {
    const counts = {}
    for (let i = 0; i < guess.length; i++) {
      if (mark[i] === 'g') musts[i] = guess[i]
      if (mark[i] === 'g' || mark[i] === 'y') counts[guess[i]] = (counts[guess[i]] || 0) + 1
    }
    for (const [ch, n] of Object.entries(counts)) {
      mustContain.set(ch, Math.max(mustContain.get(ch) || 0, n))
    }
  }
  return { musts, mustContain }
}

function violatesHardMode(guess, req) {
  for (let i = 0; i < COLS; i++) {
    if (req.musts[i] && req.musts[i] !== guess[i]) return `Position ${i + 1} must be ${req.musts[i].toUpperCase()}`
  }
  for (const [ch, n] of req.mustContain) {
    let count = 0
    for (const c of guess) if (c === ch) count++
    if (count < n) return `Must contain ${ch.toUpperCase()}${n > 1 ? ` × ${n}` : ''}`
  }
  return null
}

function pickAnswer() {
  return ANSWERS[(Math.random() * ANSWERS.length) | 0]
}

const MARK_TO_EMOJI = { g: '🟩', y: '🟨', x: '⬛' }

export default function Wordle() {
  const [answer, setAnswer] = useState(() => pickAnswer())
  const [history, setHistory] = useState([])          // [{ guess, mark }]
  const [current, setCurrent] = useState('')
  const [status, setStatus] = useState('playing')     // playing | won | over
  const [shake, setShake] = useState(false)
  const [flash, setFlash] = useState(null)
  const [hardMode, setHardMode] = useState(() => {
    try { return localStorage.getItem('arcade.wordle.hard') === '1' } catch { return false }
  })
  const [streak, setStreak] = useState(() => {
    try { return Number(localStorage.getItem('arcade.wordle.streak')) || 0 } catch { return 0 }
  })
  const [best, setBest] = useState(() => {
    try { return Number(localStorage.getItem('arcade.wordle.best-streak')) || 0 } catch { return 0 }
  })
  const [soundOn, setSoundOn] = useState(true)
  const [paused, setPaused] = useState(false)
  const [confetti, setConfetti] = useState(false)
  const [copied, setCopied] = useState(false)
  const [flippingRow, setFlippingRow] = useState(-1)
  const sfxRef = useRef(getSfx())

  useEffect(() => { sfxRef.current.setEnabled(soundOn) }, [soundOn])
  useEffect(() => {
    try { localStorage.setItem('arcade.wordle.hard', hardMode ? '1' : '0') } catch {}
  }, [hardMode])

  const kbdState = useMemo(() => keyboardStateFrom(history), [history])
  const hardReq  = useMemo(() => hardModeRequirements(history), [history])

  const showFlash = useCallback((text) => {
    setFlash({ text, id: Date.now() })
    setShake(true)
    setTimeout(() => setShake(false), 500)
    setTimeout(() => setFlash(null), 1400)
  }, [])

  const submit = useCallback(() => {
    if (status !== 'playing' || paused) return
    if (current.length !== COLS) {
      showFlash('Not enough letters')
      sfxRef.current.hit()
      return
    }
    const g = current.toLowerCase()
    if (!VALID_GUESSES.has(g)) {
      showFlash('Not in word list')
      sfxRef.current.hit()
      return
    }
    if (hardMode) {
      const v = violatesHardMode(g, hardReq)
      if (v) { showFlash(v); sfxRef.current.hit(); return }
    }
    const mark = classifyGuess(g, answer)
    const newHistory = [...history, { guess: g, mark }]
    setHistory(newHistory)
    setCurrent('')
    setFlippingRow(newHistory.length - 1)
    // Delay outcome so tile flips finish.
    const flipDur = COLS * 320 + 200
    setTimeout(() => {
      setFlippingRow(-1)
      if (mark === 'ggggg') {
        setStatus('won')
        setConfetti(true)
        sfxRef.current.win()
        const nextStreak = streak + 1
        setStreak(nextStreak)
        try { localStorage.setItem('arcade.wordle.streak', String(nextStreak)) } catch {}
        if (nextStreak > best) {
          setBest(nextStreak)
          try { localStorage.setItem('arcade.wordle.best-streak', String(nextStreak)) } catch {}
        }
      } else if (newHistory.length >= ROWS) {
        setStatus('over')
        sfxRef.current.death()
        setStreak(0)
        try { localStorage.setItem('arcade.wordle.streak', '0') } catch {}
      } else {
        sfxRef.current.pop()
      }
    }, flipDur)
  }, [status, paused, current, hardMode, hardReq, history, answer, showFlash, streak, best])

  const type = useCallback((ch) => {
    if (status !== 'playing' || paused) return
    if (flippingRow >= 0) return
    if (current.length >= COLS) return
    setCurrent((c) => c + ch.toLowerCase())
    sfxRef.current.chirp()
  }, [status, paused, current, flippingRow])

  const backspace = useCallback(() => {
    if (status !== 'playing' || paused) return
    if (flippingRow >= 0) return
    setCurrent((c) => c.slice(0, -1))
    sfxRef.current.chirp()
  }, [status, paused, flippingRow])

  const reset = useCallback(() => {
    setAnswer(pickAnswer())
    setHistory([])
    setCurrent('')
    setStatus('playing')
    setFlippingRow(-1)
    setConfetti(false)
    setCopied(false)
  }, [])

  const giveUp = useCallback(() => {
    if (status !== 'playing') return
    setStatus('over')
    sfxRef.current.death()
    setStreak(0)
    try { localStorage.setItem('arcade.wordle.streak', '0') } catch {}
  }, [status])

  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Enter') { e.preventDefault(); submit(); return }
      if (e.key === 'Backspace') { e.preventDefault(); backspace(); return }
      if (/^[a-zA-Z]$/.test(e.key)) { e.preventDefault(); type(e.key); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [submit, backspace, type])

  const shareText = useMemo(() => {
    const attempts = status === 'won' ? history.length : 'X'
    const lines = [`Wordle · Sid Arcade  ${attempts}/${ROWS}${hardMode ? '*' : ''}`]
    for (const { mark } of history) {
      lines.push(mark.split('').map((m) => MARK_TO_EMOJI[m]).join(''))
    }
    return lines.join('\n')
  }, [history, status, hardMode])

  const doShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ text: shareText, title: 'Wordle Result' })
      } else {
        await navigator.clipboard.writeText(shareText)
        setCopied(true)
        setTimeout(() => setCopied(false), 1400)
      }
    } catch (_) { /* ignore */ }
  }

  return (
    <GameShell
      title="Wordle"
      category="Puzzle"
      score={streak}
      best={best}
      level={hardMode ? 2 : 1}
      status={status === 'won' ? 'won' : status === 'over' ? 'over' : (paused ? 'paused' : 'playing')}
      extraStats={
        <>
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Streak</span>
            <span className="text-xl sm:text-2xl font-bold tabular-nums text-amber-300">{streak}</span>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Attempts</span>
            <span className="text-sm font-semibold text-cyan-300">{history.length}/{ROWS}</span>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Pool</span>
            <span className="text-sm font-semibold text-fuchsia-300">{VALID_GUESS_COUNT.toLocaleString()} words</span>
          </div>
        </>
      }
      soundOn={soundOn}
      onSoundToggle={() => setSoundOn((v) => !v)}
      onRestart={reset}
      onPause={() => setPaused((p) => !p)}
      controls={[
        { key: 'A-Z', label: 'Type' },
        { key: 'Enter', label: 'Submit' },
        { key: 'Bksp', label: 'Undo letter' },
      ]}
    >
      <div className="flex flex-col items-center gap-4 sm:gap-6 p-3 sm:p-6">
        {/* Toggle rail */}
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
          <button
            onClick={() => setHardMode((v) => !v)}
            disabled={history.length > 0}
            title={history.length > 0 ? 'Cannot switch mid-game' : ''}
            className={`px-3 py-1.5 rounded-lg font-semibold border transition ${hardMode ? 'bg-rose-500 text-black border-rose-400' : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10'} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            Hard mode: {hardMode ? 'on' : 'off'}
          </button>
          <button
            onClick={giveUp}
            disabled={status !== 'playing'}
            className="px-3 py-1.5 rounded-lg font-semibold border bg-white/5 text-white/70 border-white/10 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Give up
          </button>
        </div>

        {/* Board */}
        <div
          className="relative"
          style={{
            animation: shake ? 'wordle-shake 400ms cubic-bezier(.36,.07,.19,.97)' : undefined,
          }}
        >
          <div className="grid gap-1.5">
            {Array.from({ length: ROWS }).map((_, r) => {
              const hist = history[r]
              const inputRow = r === history.length && status === 'playing'
              const flipping = flippingRow === r
              return (
                <div key={r} className="flex gap-1.5">
                  {Array.from({ length: COLS }).map((_, c) => {
                    let letter = ''
                    let mark = null
                    if (hist) { letter = hist.guess[c]?.toUpperCase() || ''; mark = hist.mark[c] }
                    else if (inputRow) letter = current[c]?.toUpperCase() || ''
                    return (
                      <Tile
                        key={c}
                        letter={letter}
                        mark={mark}
                        flipping={flipping}
                        delay={c * 320}
                        typing={inputRow && letter && !mark}
                      />
                    )
                  })}
                </div>
              )
            })}
          </div>

          {flash && (
            <div
              key={flash.id}
              className="absolute left-1/2 -top-8 -translate-x-1/2 whitespace-nowrap"
              style={{ animation: 'wordle-flash 1.4s ease-out forwards' }}
            >
              <div className="px-3 py-1.5 rounded-full bg-white text-black font-semibold text-xs shadow-lg">
                {flash.text}
              </div>
            </div>
          )}
        </div>

        {/* Result panel */}
        {(status === 'won' || status === 'over') && (
          <div className="flex flex-col items-center gap-3 mt-2">
            <div className="text-2xl font-black bg-gradient-to-r from-amber-300 via-rose-300 to-fuchsia-400 bg-clip-text text-transparent">
              {status === 'won' ? `Nailed it in ${history.length}` : 'Answer was'}
            </div>
            <div className="text-white/80 font-mono text-lg tracking-widest uppercase">
              {answer}
            </div>
            <pre className="text-xs text-white/70 leading-5 font-mono bg-white/5 border border-white/10 rounded-lg p-3 max-w-full overflow-x-auto">
{shareText}
            </pre>
            <div className="flex gap-2">
              <button
                onClick={doShare}
                className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-sm"
              >
                {copied ? 'Copied!' : 'Share result'}
              </button>
              <button
                onClick={reset}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm"
              >
                New word
              </button>
            </div>
          </div>
        )}

        {/* On-screen keyboard */}
        <div className="w-full max-w-md flex flex-col gap-1.5 mt-2">
          {KEYBOARD_ROWS.map((row, i) => (
            <div key={i} className="flex gap-1 sm:gap-1.5 justify-center">
              {row.map((k) => (
                <Key
                  key={k}
                  label={k}
                  onPress={() => {
                    if (k === 'ENTER') submit()
                    else if (k === 'BACK') backspace()
                    else type(k)
                  }}
                  state={kbdState[k]}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {confetti && <WordleConfetti onDone={() => setConfetti(false)} />}

      <style>{`
        @keyframes wordle-shake {
          10%, 90%  { transform: translate3d(-1px, 0, 0); }
          20%, 80%  { transform: translate3d(2px, 0, 0); }
          30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
          40%, 60%      { transform: translate3d(4px, 0, 0); }
        }
        @keyframes wordle-flash {
          0%   { opacity: 0; transform: translate(-50%, 10px); }
          10%  { opacity: 1; transform: translate(-50%, 0); }
          80%  { opacity: 1; }
          100% { opacity: 0; transform: translate(-50%, -6px); }
        }
        @keyframes wordle-pop {
          0%   { transform: scale(.85); }
          40%  { transform: scale(1.08); }
          100% { transform: scale(1); }
        }
      `}</style>
    </GameShell>
  )
}

function Tile({ letter, mark, flipping, delay, typing }) {
  const bg =
    mark === 'g' ? '#22c55e' :
    mark === 'y' ? '#eab308' :
    mark === 'x' ? '#374151' :
    'transparent'
  const border =
    mark ? bg :
    letter ? '#6b7280' :
    '#374151'
  const size = 56
  const half = mark ? 'wordle-flip' : ''
  return (
    <div
      style={{
        width: size, height: size,
        perspective: 600,
      }}
    >
      <div
        style={{
          width: '100%', height: '100%',
          transformStyle: 'preserve-3d',
          transition: flipping ? 'transform 320ms ease-in-out' : undefined,
          transitionDelay: `${delay}ms`,
          transform: flipping ? 'rotateX(180deg)' : 'rotateX(0deg)',
          position: 'relative',
        }}
      >
        {/* Front (empty / typing) */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'transparent',
            border: `2px solid ${border}`,
            borderRadius: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 30, fontWeight: 800, color: '#fff', textTransform: 'uppercase',
            backfaceVisibility: 'hidden',
            animation: typing ? 'wordle-pop 140ms ease-out' : undefined,
          }}
        >
          {letter}
        </div>
        {/* Back (revealed) */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: bg,
            border: `2px solid ${bg}`,
            borderRadius: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 30, fontWeight: 800, color: '#fff', textTransform: 'uppercase',
            transform: 'rotateX(180deg)',
            backfaceVisibility: 'hidden',
            boxShadow: mark ? `0 4px 12px -6px ${bg}` : undefined,
          }}
        >
          {letter}
        </div>
      </div>
    </div>
  )
}

function Key({ label, onPress, state }) {
  const wide = label === 'ENTER' || label === 'BACK'
  const bg =
    state === 'g' ? '#22c55e' :
    state === 'y' ? '#eab308' :
    state === 'x' ? '#374151' :
    '#525252'
  const fg = state ? '#fff' : '#e5e7eb'
  return (
    <button
      onClick={onPress}
      className="rounded-md font-bold text-xs sm:text-sm select-none active:scale-95 transition-transform"
      style={{
        background: bg,
        color: fg,
        height: 48,
        minWidth: wide ? 56 : 30,
        flex: wide ? '1 0 auto' : '1 1 0',
        maxWidth: wide ? 80 : 44,
        textTransform: label.length === 1 ? 'uppercase' : 'none',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.25)',
      }}
    >
      {label === 'BACK' ? '⌫' : label}
    </button>
  )
}

function WordleConfetti({ onDone }) {
  const pieces = useMemo(() => {
    return Array.from({ length: 60 }, (_, i) => ({
      id: i,
      x: 50 + (Math.random() - 0.5) * 30,
      dx: (Math.random() - 0.5) * 100,
      dy: -Math.random() * 60 - 20,
      rot: Math.random() * 360,
      dr: (Math.random() - 0.5) * 720,
      color: ['#22c55e','#eab308','#f43f5e','#a855f7','#22d3ee','#f59e0b'][(Math.random()*6)|0],
    }))
  }, [])
  useEffect(() => {
    const t = setTimeout(() => onDone?.(), 2200)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div className="fixed inset-0 pointer-events-none z-40">
      {pieces.map((p) => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.x}%`,
            top: '30%',
            width: 8, height: 12,
            background: p.color,
            borderRadius: 2,
            transform: `rotate(${p.rot}deg)`,
            animation: 'wordle-conf 2.2s cubic-bezier(.4,0,.2,1) forwards',
            '--dx': `${p.dx}vw`,
            '--dy': `${p.dy}vh`,
            '--dr': `${p.dr}deg`,
          }}
        />
      ))}
      <style>{`
        @keyframes wordle-conf {
          0%   { transform: translate(0,0) rotate(0); opacity: 1; }
          100% { transform: translate(var(--dx), calc(80vh + var(--dy))) rotate(var(--dr)); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
