// Tiny Web-Audio synth for arcade sound effects.
// One shared AudioContext lives at module scope so five games sharing
// this file don't spin up five contexts (Chrome caps at ~6). Each
// helper is a one-shot beep/thump/laser — no external assets, no
// preload. Everything's a plain oscillator + envelope.
//
// Public API:
//   const s = getSfx()
//   s.beep({ freq: 440, type: 'square', dur: 0.08, gain: 0.05 })
//   s.laser(), s.hit(), s.boom(), s.pop(), s.chirp(), s.coin(), s.thrust()
//
// All calls no-op if the shared `enabled` flag is false.

let _ctx = null
let _enabled = true

const ensureCtx = () => {
  if (typeof window === 'undefined') return null
  if (!_ctx) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      _ctx = AC ? new AC() : null
    } catch { _ctx = null }
  }
  // Chrome suspends on load until a user gesture — try to resume
  // whenever we're asked for a sound.
  if (_ctx && _ctx.state === 'suspended') { try { _ctx.resume() } catch {} }
  return _ctx
}

const beep = ({ freq = 440, type = 'square', dur = 0.08, gain = 0.06, sweep = 0, delay = 0 } = {}) => {
  if (!_enabled) return
  const ctx = ensureCtx(); if (!ctx) return
  const t0 = ctx.currentTime + delay
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + sweep), t0 + dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g).connect(ctx.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

// Noise burst — for explosions.
const noise = ({ dur = 0.25, gain = 0.08, filterFreq = 800, filterQ = 0.6, delay = 0 } = {}) => {
  if (!_enabled) return
  const ctx = ensureCtx(); if (!ctx) return
  const t0 = ctx.currentTime + delay
  const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
  const src = ctx.createBufferSource()
  src.buffer = buf
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = filterFreq
  filter.Q.value = filterQ
  const g = ctx.createGain()
  g.gain.setValueAtTime(gain, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(filter).connect(g).connect(ctx.destination)
  src.start(t0)
  src.stop(t0 + dur + 0.02)
}

export function getSfx() {
  return {
    setEnabled: (v) => { _enabled = !!v },
    isEnabled:  () => _enabled,
    beep,
    noise,
    // Named presets — semantic call sites keep games readable.
    laser:  () => beep({ freq: 900,  type: 'sawtooth', dur: 0.10, gain: 0.05, sweep: -700 }),
    hit:    () => beep({ freq: 320,  type: 'square',   dur: 0.06, gain: 0.06, sweep: -120 }),
    boom:   () => { noise({ dur: 0.35, gain: 0.09, filterFreq: 500 }); beep({ freq: 90, type: 'sine', dur: 0.28, gain: 0.05, sweep: -50 }) },
    pop:    () => beep({ freq: 700,  type: 'triangle',dur: 0.06, gain: 0.05, sweep: -300 }),
    chirp:  () => beep({ freq: 1400, type: 'square',  dur: 0.05, gain: 0.04, sweep: 400 }),
    coin:   () => { beep({ freq: 988, type: 'square', dur: 0.06, gain: 0.05 }); beep({ freq: 1319, type: 'square', dur: 0.10, gain: 0.05, delay: 0.06 }) },
    thrust: () => noise({ dur: 0.06, gain: 0.03, filterFreq: 1200 }),
    jump:   () => beep({ freq: 400, type: 'triangle', dur: 0.10, gain: 0.05, sweep: 300 }),
    death:  () => { beep({ freq: 260, type: 'sawtooth', dur: 0.35, gain: 0.07, sweep: -200 }); noise({ dur: 0.4, gain: 0.05, filterFreq: 400 }) },
    win:    () => { beep({ freq: 660, type: 'square', dur: 0.08 }); beep({ freq: 880, type: 'square', dur: 0.08, delay: 0.09 }); beep({ freq: 1175, type: 'square', dur: 0.14, delay: 0.18 }) },
  }
}
