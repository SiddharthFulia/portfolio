// Amazing Engineering — N-body double pendulum lab.
//
// Lagrangian mechanics on a compound double pendulum, integrated with
// RK4. Renders N pendulums in parallel, each with a tiny initial-angle
// offset — that seeds sensitive dependence on initial conditions, so
// the paths diverge into a chaotic bouquet. The bob-tip traces build
// a persistence-of-vision pattern that reads as art after ~30 seconds.
//
// Controls:
//   · pendulum count            (1 → 200)
//   · initial angle offset      (0 → 5 degrees between neighbors)
//   · gravity                   (0 → 30 m/s²)
//   · length ratio L2 / L1      (0.2 → 2)
//   · mass ratio  m2 / m1       (0.2 → 5)
//   · damping                   (0 → 0.5)
//   · trail length              (0 → 2000 samples)
//   · rainbow hue rotation      (on/off)
//   · play / pause / reset
//
// The equations come from the Euler–Lagrange derivation of the double
// pendulum Hamiltonian. See the "Equations" panel in the UI for the
// full expressions we're integrating.

import { useEffect, useRef, useState } from 'react'
import { Segmented, Slider, Switch } from 'antd'
import {
  PlayCircleFilled, PauseCircleFilled, ReloadOutlined, ExperimentOutlined,
} from '@ant-design/icons'

// Canonical form of the double pendulum equations of motion. Each θ̈ is
// computed from the current (θ1, θ2, ω1, ω2) using the Euler-Lagrange
// derivation. m1, m2 are bob masses; L1, L2 are arm lengths.
function accelerations({ t1, t2, w1, w2, m1, m2, L1, L2, g }) {
  const dt = t1 - t2
  const sinDt = Math.sin(dt)
  const cosDt = Math.cos(dt)
  const sinT1 = Math.sin(t1)
  const sinT2 = Math.sin(t2)
  const denom1 = L1 * (2 * m1 + m2 - m2 * Math.cos(2 * dt))
  const denom2 = L2 * (2 * m1 + m2 - m2 * Math.cos(2 * dt))

  const a1 = (
    -g * (2 * m1 + m2) * sinT1
    - m2 * g * Math.sin(t1 - 2 * t2)
    - 2 * sinDt * m2 * (w2 * w2 * L2 + w1 * w1 * L1 * cosDt)
  ) / denom1

  const a2 = (
    2 * sinDt * (
      w1 * w1 * L1 * (m1 + m2)
      + g * (m1 + m2) * Math.cos(t1)
      + w2 * w2 * L2 * m2 * cosDt
    )
  ) / denom2

  return { a1, a2 }
}

// One RK4 step advances the state (t1, t2, w1, w2) by `h` seconds.
// Fourth-order Runge-Kutta gives us stable long-horizon integration
// even at large step sizes — a naive Euler pass drifts noticeably in
// 5 seconds. h=0.008s (~120Hz) is the sweet spot.
function rk4Step(state, params, h) {
  const derive = (s) => {
    const { a1, a2 } = accelerations({ ...s, ...params })
    return { t1: s.w1, t2: s.w2, w1: a1, w2: a2 }
  }
  const k1 = derive(state)
  const k2 = derive(add(state, mul(k1, h / 2)))
  const k3 = derive(add(state, mul(k2, h / 2)))
  const k4 = derive(add(state, mul(k3, h)))
  return add(state, mul(add(add(k1, mul(k2, 2)), add(mul(k3, 2), k4)), h / 6))
}
const add = (a, b) => ({ t1: a.t1 + b.t1, t2: a.t2 + b.t2, w1: a.w1 + b.w1, w2: a.w2 + b.w2 })
const mul = (a, s) => ({ t1: a.t1 * s, t2: a.t2 * s, w1: a.w1 * s, w2: a.w2 * s })

const DEG = Math.PI / 180

export default function PhysicsLab() {
  const canvasRef = useRef(null)
  const stateRef = useRef([])       // per-pendulum simulation states
  const trailsRef = useRef([])      // per-pendulum tip trail (ring buffer of {x,y})
  const rafRef = useRef(null)
  const lastTsRef = useRef(0)

  const [count, setCount]           = useState(40)
  const [offsetDeg, setOffsetDeg]   = useState(0.3)
  const [gravity, setGravity]       = useState(9.81)
  const [lengthRatio, setLengthRatio] = useState(1)   // L2 / L1
  const [massRatio, setMassRatio]     = useState(1)   // m2 / m1
  const [damping, setDamping]       = useState(0.0)
  const [trailLen, setTrailLen]     = useState(600)
  const [rainbow, setRainbow]       = useState(true)
  const [running, setRunning]       = useState(true)
  const [preset, setPreset]         = useState('chaos')
  const [step, setStep]             = useState(0)

  useEffect(() => { document.title = 'Physics Lab · Sid' }, [])

  // Rebuild the population whenever count / offset / preset changes.
  useEffect(() => {
    const initial = {
      chaos:    { t1: 120 * DEG, t2: -10 * DEG, w1: 0, w2: 0 },
      lissajous:{ t1: 90 * DEG,  t2: 90 * DEG,  w1: 0, w2: 0 },
      spin:     { t1: 179 * DEG, t2: 179 * DEG, w1: 0, w2: 0 },
      calm:     { t1: 30 * DEG,  t2: 15 * DEG,  w1: 0, w2: 0 },
    }[preset] || { t1: 120 * DEG, t2: -10 * DEG, w1: 0, w2: 0 }

    stateRef.current = Array.from({ length: count }, (_, i) => ({
      t1: initial.t1 + i * offsetDeg * DEG,
      t2: initial.t2,
      w1: initial.w1,
      w2: initial.w2,
    }))
    trailsRef.current = Array.from({ length: count }, () => [])
    setStep(0)
  }, [count, offsetDeg, preset])

  // RAF loop — physics + draw.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const draw = (ts) => {
      const dtReal = lastTsRef.current ? Math.min(0.05, (ts - lastTsRef.current) / 1000) : 1 / 60
      lastTsRef.current = ts

      // Fixed sub-step so tuning gravity/mass doesn't destabilise RK4.
      const H = 0.008
      const subSteps = running ? Math.min(20, Math.floor(dtReal / H) + 1) : 0

      const params = { m1: 1, m2: massRatio, L1: 1, L2: lengthRatio, g: gravity }

      for (let s = 0; s < subSteps; s++) {
        for (let i = 0; i < stateRef.current.length; i++) {
          let st = stateRef.current[i]
          st = rk4Step(st, params, H)
          if (damping > 0) {
            const k = 1 - damping * H
            st = { ...st, w1: st.w1 * k, w2: st.w2 * k }
          }
          stateRef.current[i] = st
        }
      }

      // Resize handling — read parent size each frame; cheap.
      const parent = canvas.parentElement
      if (parent) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const w = parent.clientWidth, h = parent.clientHeight
        if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
          canvas.width = w * dpr
          canvas.height = h * dpr
          canvas.style.width = w + 'px'
          canvas.style.height = h + 'px'
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        }
      }

      const cw = canvas.clientWidth
      const ch = canvas.clientHeight
      const cx = cw / 2
      const cy = ch * 0.35

      // Fade the scene each frame so trails leave a persistence-of-vision
      // glow that gently decays.
      ctx.fillStyle = 'rgba(5, 5, 10, 0.14)'
      ctx.fillRect(0, 0, cw, ch)

      const scale = Math.min(cw, ch) * 0.22

      // Update + draw trails, then rods + bobs.
      for (let i = 0; i < stateRef.current.length; i++) {
        const { t1, t2 } = stateRef.current[i]
        const x1 = cx + scale * Math.sin(t1)
        const y1 = cy + scale * Math.cos(t1)
        const x2 = x1 + scale * lengthRatio * Math.sin(t2)
        const y2 = y1 + scale * lengthRatio * Math.cos(t2)

        // Push to trail (ring buffer).
        const tr = trailsRef.current[i] || (trailsRef.current[i] = [])
        tr.push({ x: x2, y: y2 })
        while (tr.length > trailLen) tr.shift()

        // Draw trail as a gradient polyline.
        const hue = rainbow ? (i / stateRef.current.length) * 360 : 45
        ctx.strokeStyle = `hsla(${hue}, 85%, 60%, 0.55)`
        ctx.lineWidth = 1
        ctx.beginPath()
        for (let k = 0; k < tr.length; k++) {
          const p = tr[k]
          if (k === 0) ctx.moveTo(p.x, p.y)
          else ctx.lineTo(p.x, p.y)
        }
        ctx.stroke()

        // Draw rods + bobs — only for the LAST pendulum in the group so
        // we don't obscure the trail canvas with hundreds of rods.
        if (i === stateRef.current.length - 1) {
          ctx.strokeStyle = 'rgba(245, 245, 245, 0.65)'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(cx, cy)
          ctx.lineTo(x1, y1)
          ctx.lineTo(x2, y2)
          ctx.stroke()

          ctx.fillStyle = 'rgba(251, 191, 36, 0.95)'
          ctx.beginPath(); ctx.arc(x1, y1, 5, 0, Math.PI * 2); ctx.fill()
          ctx.fillStyle = 'rgba(244, 63, 94, 0.95)'
          ctx.beginPath(); ctx.arc(x2, y2, 6, 0, Math.PI * 2); ctx.fill()

          // Pivot dot.
          ctx.fillStyle = 'rgba(251, 191, 36, 0.9)'
          ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill()
        }
      }

      setStep((s) => s + 1)
      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [running, gravity, lengthRatio, massRatio, damping, trailLen, rainbow])

  const reset = () => {
    const initial = {
      chaos:    { t1: 120 * DEG, t2: -10 * DEG, w1: 0, w2: 0 },
      lissajous:{ t1: 90 * DEG,  t2: 90 * DEG,  w1: 0, w2: 0 },
      spin:     { t1: 179 * DEG, t2: 179 * DEG, w1: 0, w2: 0 },
      calm:     { t1: 30 * DEG,  t2: 15 * DEG,  w1: 0, w2: 0 },
    }[preset]
    stateRef.current = Array.from({ length: count }, (_, i) => ({
      t1: initial.t1 + i * offsetDeg * DEG,
      t2: initial.t2,
      w1: initial.w1,
      w2: initial.w2,
    }))
    trailsRef.current = Array.from({ length: count }, () => [])
  }

  return (
    <div className='min-h-screen bg-[var(--luxe-bg-base)] text-fg-primary pt-24 sm:pt-28 pb-16 px-3 sm:px-6' style={{ fontVariantNumeric: 'tabular-nums' }}>
      <div className='max-w-7xl mx-auto'>
        <header className='mb-6'>
          <p className='eyebrow-mono mb-2 text-amber-300/80 flex items-center gap-2'>
            <ExperimentOutlined /> — Amazing Engineering · Physics Lab
          </p>
          <h1 className='text-3xl sm:text-4xl font-bold gradient-text-amber leading-tight'>
            N-body double pendulum
          </h1>
          <p className='text-sm text-fg-muted mt-1 max-w-3xl'>
            Chaos from a Lagrangian. Set a tiny angle offset between neighbouring pendulums and watch identical
            physics diverge into a bouquet of paths that never repeats. Integrated with 4th-order Runge–Kutta at
            ~120 Hz. All GPU-free — just math.
          </p>
        </header>

        <div className='grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4'>
          <div className='luxe-glass overflow-hidden' style={{ minHeight: 520 }}>
            <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
          </div>

          <div className='space-y-3'>
            <div className='luxe-glass p-4 space-y-3'>
              <div className='flex items-center gap-2 flex-wrap'>
                <button onClick={() => setRunning(r => !r)} className='luxe-btn luxe-btn-primary text-xs'>
                  {running ? <><PauseCircleFilled /> Pause</> : <><PlayCircleFilled /> Play</>}
                </button>
                <button onClick={reset} className='luxe-btn luxe-btn-secondary text-xs'>
                  <ReloadOutlined /> Reset
                </button>
                <span className='ml-auto text-[10px] text-fg-muted font-mono'>step {step}</span>
              </div>

              <div>
                <p className='eyebrow-mono mb-1 text-fg-muted'>Initial state</p>
                <Segmented
                  size='small'
                  value={preset}
                  onChange={setPreset}
                  options={[
                    { label: 'Chaos', value: 'chaos' },
                    { label: 'Lissajous', value: 'lissajous' },
                    { label: 'Spin', value: 'spin' },
                    { label: 'Calm', value: 'calm' },
                  ]}
                  block
                />
              </div>

              <NumRow label='Pendulums' value={count} min={1} max={200} step={1} onChange={setCount} />
              <NumRow label='Angle offset · °' value={offsetDeg} min={0} max={5} step={0.05} onChange={setOffsetDeg} />
              <NumRow label='Gravity · m/s²' value={gravity} min={0} max={30} step={0.1} onChange={setGravity} />
              <NumRow label='L₂ / L₁' value={lengthRatio} min={0.2} max={2} step={0.05} onChange={setLengthRatio} />
              <NumRow label='m₂ / m₁' value={massRatio} min={0.2} max={5} step={0.1} onChange={setMassRatio} />
              <NumRow label='Damping' value={damping} min={0} max={0.5} step={0.01} onChange={setDamping} />
              <NumRow label='Trail length' value={trailLen} min={0} max={2000} step={50} onChange={setTrailLen} />

              <div className='flex items-center justify-between text-xs'>
                <span className='text-fg-muted'>Rainbow hue</span>
                <Switch size='small' checked={rainbow} onChange={setRainbow} />
              </div>
            </div>

            <div className='luxe-glass p-4'>
              <p className='eyebrow-mono mb-2 text-amber-300/80'>— Equations of motion</p>
              <pre className='text-[11px] font-mono leading-6 whitespace-pre-wrap text-fg-secondary'>
{`θ̈₁ = ( -g(2m₁ + m₂)·sinθ₁
      - m₂·g·sin(θ₁ - 2θ₂)
      - 2·sin(Δθ)·m₂·(ω₂²·L₂ + ω₁²·L₁·cos(Δθ)) )
     / ( L₁·(2m₁ + m₂ - m₂·cos(2Δθ)) )

θ̈₂ = ( 2·sin(Δθ)·(
         ω₁²·L₁·(m₁ + m₂)
       + g·(m₁ + m₂)·cosθ₁
       + ω₂²·L₂·m₂·cos(Δθ)) )
     / ( L₂·(2m₁ + m₂ - m₂·cos(2Δθ)) )

Δθ = θ₁ - θ₂
integrated with RK4 at h = 8 ms`}
              </pre>
              <p className='text-[10px] text-fg-muted mt-2 leading-relaxed'>
                Derived from the Euler–Lagrange equations of the compound double pendulum. Because the system
                is chaotic (Lyapunov exponent {'>'} 0), even a 0.05° change in θ₁ produces exponentially
                divergent trajectories — that&apos;s what draws the fan of trails you see when you crank
                pendulum count above 30.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function NumRow({ label, value, min, max, step, onChange }) {
  return (
    <div>
      <div className='flex items-center justify-between text-xs mb-1'>
        <span className='text-fg-muted'>{label}</span>
        <span className='font-mono text-amber-300'>{Number(value).toFixed(step < 1 ? 2 : 0)}</span>
      </div>
      <Slider min={min} max={max} step={step} value={value} onChange={onChange} tooltip={{ open: false }} />
    </div>
  )
}
