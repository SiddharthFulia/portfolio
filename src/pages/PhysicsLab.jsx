// Amazing Engineering — Double Pendulum Lab.
//
// Physics: the compound double pendulum with rigid massless rods and
// point masses. Equations of motion derived from the Lagrangian
//   L = K - V
// where
//   K = ½ m₁ l₁² θ̇₁² + ½ m₂ (l₁² θ̇₁² + l₂² θ̇₂² + 2 l₁ l₂ θ̇₁ θ̇₂ cos(θ₁-θ₂))
//   V = -(m₁+m₂) g l₁ cosθ₁ - m₂ g l₂ cosθ₂
// Euler-Lagrange gives the two coupled second-order ODEs the canvas
// integrates with fourth-order Runge-Kutta at h = 6 ms.
//
// This page is deliberately dense — a portfolio piece for the
// "Amazing Engineering" section. Kinematic diagram, live energy
// telemetry, live θ(t) chart, presets, mobile-responsive grid, and
// full LaTeX-style equation panels.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Segmented, Slider, Switch, Tooltip } from 'antd'
import {
  PlayCircleFilled, PauseCircleFilled, ReloadOutlined,
  ExperimentOutlined, ThunderboltFilled,
} from '@ant-design/icons'

const DEG = Math.PI / 180

// ─── Equations of motion ───────────────────────────────────────
// θ̈₁, θ̈₂ from Euler-Lagrange on the double-pendulum Lagrangian.
// Params: g gravity, m1/m2 point masses, L1/L2 rod lengths.
function accelerations({ t1, t2, w1, w2, m1, m2, L1, L2, g }) {
  const dt = t1 - t2
  const sinDt = Math.sin(dt)
  const cosDt = Math.cos(dt)
  const denom1 = L1 * (2 * m1 + m2 - m2 * Math.cos(2 * dt))
  const denom2 = L2 * (2 * m1 + m2 - m2 * Math.cos(2 * dt))
  const a1 = (
    -g * (2 * m1 + m2) * Math.sin(t1)
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

const add = (a, b) => ({ t1: a.t1 + b.t1, t2: a.t2 + b.t2, w1: a.w1 + b.w1, w2: a.w2 + b.w2 })
const mul = (a, s) => ({ t1: a.t1 * s, t2: a.t2 * s, w1: a.w1 * s, w2: a.w2 * s })

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

// ─── Energy scalars (for the telemetry panel) ──────────────────
function energies({ t1, t2, w1, w2, m1, m2, L1, L2, g }) {
  const K = 0.5 * m1 * L1 * L1 * w1 * w1
    + 0.5 * m2 * (L1 * L1 * w1 * w1 + L2 * L2 * w2 * w2 + 2 * L1 * L2 * w1 * w2 * Math.cos(t1 - t2))
  const V = -(m1 + m2) * g * L1 * Math.cos(t1) - m2 * g * L2 * Math.cos(t2)
  return { K, V, E: K + V }
}

const PRESETS = {
  chaos:    { t1: 120 * DEG, t2: -10 * DEG, w1: 0, w2: 0 },
  lissajous:{ t1: 90 * DEG,  t2: 90 * DEG,  w1: 0, w2: 0 },
  spin:     { t1: 179 * DEG, t2: 179 * DEG, w1: 0, w2: 0 },
  calm:     { t1: 30 * DEG,  t2: 15 * DEG,  w1: 0, w2: 0 },
}

export default function PhysicsLab() {
  // Params
  const [L1, setL1]           = useState(1.0)
  const [L2, setL2]           = useState(1.0)
  const [m1, setM1]           = useState(1.0)
  const [m2, setM2]           = useState(1.0)
  const [g, setG]             = useState(9.81)
  const [damping, setDamping] = useState(0.0)

  // Population
  const [count, setCount]         = useState(24)
  const [offsetDeg, setOffsetDeg] = useState(0.4)
  const [trailLen, setTrailLen]   = useState(500)
  const [rainbow, setRainbow]     = useState(true)

  // Initial conditions
  const [preset, setPreset]  = useState('chaos')
  const [ic1Deg, setIc1Deg]  = useState(120)  // θ₁ initial (degrees)
  const [ic2Deg, setIc2Deg]  = useState(-10)  // θ₂ initial (degrees)
  const [ico1, setIco1]      = useState(0)    // ω₁ initial (rad/s)
  const [ico2, setIco2]      = useState(0)    // ω₂ initial (rad/s)

  const [running, setRunning] = useState(true)
  const [now, setNow]         = useState(0)   // simulated seconds

  // Live telemetry read from the loop into React state at ~10 Hz.
  const [telemetry, setTelemetry] = useState({
    t1: 0, t2: 0, w1: 0, w2: 0, K: 0, V: 0, E: 0,
  })

  // Chart series — bounded ring buffer of {t, θ1(deg), θ2(deg)}.
  const CHART_MAX = 400
  const [chart, setChart] = useState([])

  const canvasRef  = useRef(null)
  const chartRef   = useRef(null)
  const stateRef   = useRef([])
  const trailsRef  = useRef([])
  const chartRefBuf= useRef([])
  const rafRef     = useRef(null)
  const lastTsRef  = useRef(0)
  const simTRef    = useRef(0)
  const teleAccRef = useRef(0)

  useEffect(() => { document.title = 'Physics Lab · Sid' }, [])

  // Apply preset → snap initial condition sliders.
  useEffect(() => {
    const p = PRESETS[preset]
    if (!p) return
    setIc1Deg(Math.round(p.t1 / DEG))
    setIc2Deg(Math.round(p.t2 / DEG))
    setIco1(p.w1)
    setIco2(p.w2)
  }, [preset])

  // Rebuild population on any parameter that changes the initial
  // condition set. Also runs on gravity / L / m changes so the sim
  // restarts consistently.
  useEffect(() => {
    const t10 = ic1Deg * DEG
    const t20 = ic2Deg * DEG
    stateRef.current = Array.from({ length: count }, (_, i) => ({
      t1: t10 + i * offsetDeg * DEG,
      t2: t20,
      w1: ico1,
      w2: ico2,
    }))
    trailsRef.current = Array.from({ length: count }, () => [])
    chartRefBuf.current = []
    simTRef.current = 0
    setChart([])
    setNow(0)
  }, [count, offsetDeg, ic1Deg, ic2Deg, ico1, ico2])

  // Physics + canvas render loop.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const H = 0.006
    const params = { m1, m2, L1, L2, g }

    const step = (ts) => {
      const dtReal = lastTsRef.current ? Math.min(0.05, (ts - lastTsRef.current) / 1000) : 1 / 60
      lastTsRef.current = ts
      const subSteps = running ? Math.min(30, Math.floor(dtReal / H) + 1) : 0

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
        simTRef.current += H
      }

      // Resize canvas to fill parent with DPR.
      const parent = canvas.parentElement
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = parent.clientWidth, h = parent.clientHeight
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr
        canvas.height = h * dpr
        canvas.style.width = w + 'px'
        canvas.style.height = h + 'px'
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }

      // Persistence-of-vision fade for the trails.
      ctx.fillStyle = 'rgba(5, 5, 10, 0.15)'
      ctx.fillRect(0, 0, w, h)

      const cx = w / 2
      const cy = h * 0.32
      const totalArm = L1 + L2
      const scale = Math.min(w, h) * 0.42 / totalArm

      // Draw trails for every pendulum.
      for (let i = 0; i < stateRef.current.length; i++) {
        const st = stateRef.current[i]
        const x1 = cx + scale * L1 * Math.sin(st.t1)
        const y1 = cy + scale * L1 * Math.cos(st.t1)
        const x2 = x1 + scale * L2 * Math.sin(st.t2)
        const y2 = y1 + scale * L2 * Math.cos(st.t2)

        const tr = trailsRef.current[i] || (trailsRef.current[i] = [])
        tr.push({ x: x2, y: y2 })
        while (tr.length > trailLen) tr.shift()

        const hue = rainbow ? (i / stateRef.current.length) * 300 + 20 : 45
        ctx.strokeStyle = `hsla(${hue}, 90%, 62%, 0.55)`
        ctx.lineWidth = 1
        ctx.beginPath()
        for (let k = 0; k < tr.length; k++) {
          const p = tr[k]
          if (k === 0) ctx.moveTo(p.x, p.y)
          else ctx.lineTo(p.x, p.y)
        }
        ctx.stroke()
      }

      // Overlay the ONE representative pendulum's rods + bobs on top.
      const st0 = stateRef.current[stateRef.current.length - 1]
      if (st0) {
        const x1 = cx + scale * L1 * Math.sin(st0.t1)
        const y1 = cy + scale * L1 * Math.cos(st0.t1)
        const x2 = x1 + scale * L2 * Math.sin(st0.t2)
        const y2 = y1 + scale * L2 * Math.cos(st0.t2)

        // Ceiling hatch pattern.
        ctx.strokeStyle = 'rgba(230, 230, 230, 0.45)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(cx - 26, cy - 10); ctx.lineTo(cx + 26, cy - 10)
        for (let hx = -22; hx <= 22; hx += 6) {
          ctx.moveTo(cx + hx, cy - 10); ctx.lineTo(cx + hx - 4, cy - 16)
        }
        ctx.stroke()

        // Rods.
        ctx.strokeStyle = 'rgba(245, 245, 245, 0.85)'
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.moveTo(cx, cy); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2)
        ctx.stroke()

        // Bobs, sized by mass ratio.
        const r1 = Math.max(4, Math.min(14, 4 + m1 * 4))
        const r2 = Math.max(4, Math.min(14, 4 + m2 * 4))
        ctx.fillStyle = 'rgba(251, 191, 36, 0.98)'
        ctx.beginPath(); ctx.arc(x1, y1, r1, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = 'rgba(244, 63, 94, 0.98)'
        ctx.beginPath(); ctx.arc(x2, y2, r2, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = 'rgba(251, 191, 36, 0.9)'
        ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill()
      }

      // Push telemetry at ~10 Hz to keep React re-renders cheap.
      teleAccRef.current += dtReal
      if (teleAccRef.current > 0.1) {
        teleAccRef.current = 0
        const p0 = stateRef.current[0]
        if (p0) {
          const { K, V, E } = energies({ ...p0, ...params })
          setTelemetry({ t1: p0.t1, t2: p0.t2, w1: p0.w1, w2: p0.w2, K, V, E })
        }
        setNow(simTRef.current)
      }

      // Chart sample — one sample per 30 ms.
      if (running && subSteps > 0) {
        const p0 = stateRef.current[0]
        if (p0) {
          chartRefBuf.current.push({ t: simTRef.current, a: p0.t1 / DEG, b: p0.t2 / DEG })
          if (chartRefBuf.current.length > CHART_MAX) chartRefBuf.current.shift()
        }
      }

      // Chart render — separate canvas.
      drawChart(chartRef.current, chartRefBuf.current)

      rafRef.current = requestAnimationFrame(step)
    }

    rafRef.current = requestAnimationFrame(step)
    return () => rafRef.current && cancelAnimationFrame(rafRef.current)
  }, [running, m1, m2, L1, L2, g, damping, trailLen, rainbow])

  // Also stream chart samples into React state periodically so the
  // rendered chart component knows to redraw (~5 Hz is smooth enough).
  useEffect(() => {
    const id = setInterval(() => setChart([...chartRefBuf.current]), 200)
    return () => clearInterval(id)
  }, [])

  const reset = () => {
    const t10 = ic1Deg * DEG
    const t20 = ic2Deg * DEG
    stateRef.current = Array.from({ length: count }, (_, i) => ({
      t1: t10 + i * offsetDeg * DEG,
      t2: t20,
      w1: ico1,
      w2: ico2,
    }))
    trailsRef.current = Array.from({ length: count }, () => [])
    chartRefBuf.current = []
    simTRef.current = 0
    setChart([])
    setNow(0)
  }

  // Live force estimate on bob 2 (magnitude of net force on m₂).
  // For display in the telemetry — |F₂| ≈ m₂ · |a_tangential|.
  const force2 = useMemo(() => {
    const { a2 } = accelerations({
      t1: telemetry.t1, t2: telemetry.t2, w1: telemetry.w1, w2: telemetry.w2,
      m1, m2, L1, L2, g,
    })
    return Math.abs(m2 * L2 * a2)
  }, [telemetry, m1, m2, L1, L2, g])

  return (
    <div className='min-h-screen bg-[var(--luxe-bg-base)] text-fg-primary pt-24 sm:pt-28 pb-16 px-3 sm:px-6' style={{ fontVariantNumeric: 'tabular-nums' }}>
      <div className='max-w-7xl mx-auto'>
        <header className='mb-6'>
          <p className='eyebrow-mono mb-2 text-amber-300/80 flex items-center gap-2'>
            <ExperimentOutlined /> — Amazing Engineering · Physics Lab
          </p>
          <h1 className='text-3xl sm:text-4xl font-bold gradient-text-amber leading-tight'>
            Double Pendulum · Lagrangian Mechanics
          </h1>
          <p className='text-sm text-fg-muted mt-1 max-w-3xl'>
            A compound double pendulum solved from its Lagrangian and integrated with 4th-order Runge–Kutta.
            Set an angle offset between neighbouring pendulums and watch identical physics diverge into a chaotic
            bouquet — sensitive dependence on initial conditions in ~5 seconds.
          </p>
        </header>

        {/* ── Row 1 · Kinematic diagram + Controls ── */}
        <div className='grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-4 mb-4'>
          <KinematicDiagram L1={L1} L2={L2} m1={m1} m2={m2} t1={ic1Deg * DEG} t2={ic2Deg * DEG} />
          <div className='luxe-glass p-4 space-y-3'>
            <div className='flex items-center gap-2 flex-wrap'>
              <button onClick={() => setRunning(r => !r)} className='luxe-btn luxe-btn-primary text-xs'>
                {running ? <><PauseCircleFilled /> Pause</> : <><PlayCircleFilled /> Play</>}
              </button>
              <button onClick={reset} className='luxe-btn luxe-btn-secondary text-xs'>
                <ReloadOutlined /> Reset
              </button>
              <span className='ml-auto text-[10px] font-mono text-fg-muted'>
                t = <span className='text-amber-300'>{now.toFixed(2)}</span> s
              </span>
            </div>

            <div>
              <p className='eyebrow-mono mb-1 text-fg-muted'>Preset</p>
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

            <div className='grid grid-cols-2 gap-x-4 gap-y-1'>
              <NumRow label='l₁ (m)'   value={L1}       min={0.3} max={2}   step={0.05} onChange={setL1} />
              <NumRow label='l₂ (m)'   value={L2}       min={0.3} max={2}   step={0.05} onChange={setL2} />
              <NumRow label='m₁ (kg)'  value={m1}       min={0.2} max={4}   step={0.1}  onChange={setM1} />
              <NumRow label='m₂ (kg)'  value={m2}       min={0.2} max={4}   step={0.1}  onChange={setM2} />
              <NumRow label='g (m/s²)' value={g}        min={0}   max={30}  step={0.1}  onChange={setG} />
              <NumRow label='Damping'  value={damping}  min={0}   max={0.5} step={0.01} onChange={setDamping} />
              <NumRow label='θ₁₀ (°)'  value={ic1Deg}   min={-180} max={180} step={1}   onChange={setIc1Deg} />
              <NumRow label='θ₂₀ (°)'  value={ic2Deg}   min={-180} max={180} step={1}   onChange={setIc2Deg} />
              <NumRow label='ω₁₀ (rad/s)' value={ico1}  min={-8} max={8} step={0.1}     onChange={setIco1} />
              <NumRow label='ω₂₀ (rad/s)' value={ico2}  min={-8} max={8} step={0.1}     onChange={setIco2} />
              <NumRow label='Pendulums' value={count}   min={1}   max={200} step={1}    onChange={setCount} />
              <NumRow label='Δθ offset (°)' value={offsetDeg} min={0} max={5} step={0.05} onChange={setOffsetDeg} />
              <NumRow label='Trail length' value={trailLen} min={0} max={2000} step={50} onChange={setTrailLen} />
              <div>
                <div className='flex items-center justify-between text-[11px] mb-1'>
                  <span className='text-fg-muted'>Rainbow</span>
                  <Switch size='small' checked={rainbow} onChange={setRainbow} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Row 2 · Live canvas + θ(t) chart ── */}
        <div className='grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4 mb-4'>
          <div className='luxe-glass overflow-hidden' style={{ height: 'min(60vh, 520px)' }}>
            <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
          </div>
          <div className='luxe-glass p-3 flex flex-col' style={{ height: 'min(60vh, 520px)' }}>
            <div className='flex items-center justify-between mb-2'>
              <p className='eyebrow-mono text-amber-300/80'>— θ(t) · angles over time</p>
              <div className='flex items-center gap-3 text-[10px] font-mono'>
                <span className='flex items-center gap-1'><span className='w-2.5 h-2.5 rounded-full bg-rose-400' /> θ₁</span>
                <span className='flex items-center gap-1'><span className='w-2.5 h-2.5 rounded-full bg-cyan-400' /> θ₂</span>
              </div>
            </div>
            <div className='flex-1 min-h-0'>
              <canvas ref={chartRef} style={{ display: 'block', width: '100%', height: '100%' }} />
            </div>
          </div>
        </div>

        {/* ── Row 3 · Telemetry (energy, angles, forces) ── */}
        <div className='luxe-glass p-4 mb-4'>
          <div className='flex items-center gap-2 mb-3'>
            <ThunderboltFilled className='text-amber-300' />
            <p className='eyebrow-mono text-amber-300/80'>— Live telemetry (pendulum 1)</p>
          </div>
          <div className='grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs'>
            <Metric label='θ₁' unit='°' value={(telemetry.t1 / DEG).toFixed(1)} color='text-rose-300' />
            <Metric label='θ₂' unit='°' value={(telemetry.t2 / DEG).toFixed(1)} color='text-cyan-300' />
            <Metric label='ω₁' unit='rad/s' value={telemetry.w1.toFixed(2)} color='text-rose-200' />
            <Metric label='ω₂' unit='rad/s' value={telemetry.w2.toFixed(2)} color='text-cyan-200' />
            <Metric label='K'  unit='J' value={telemetry.K.toFixed(2)} color='text-amber-200' />
            <Metric label='V'  unit='J' value={telemetry.V.toFixed(2)} color='text-fuchsia-200' />
            <Metric label='|F₂|' unit='N' value={force2.toFixed(2)} color='text-emerald-200' />
          </div>
          <div className='mt-3 text-[10px] font-mono text-fg-muted'>
            Total energy E = K + V = <span className='text-amber-300'>{telemetry.E.toFixed(3)} J</span>
            {damping === 0 && <span className='ml-2 text-fg-dim'>(conserved in a lossless system — verify RK4 stability)</span>}
          </div>
        </div>

        {/* ── Row 4 · Equations panel ── */}
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
          <div className='luxe-glass p-4'>
            <p className='eyebrow-mono mb-3 text-cyan-300/80'>— Kinetic + Potential Energy</p>
            <div className='space-y-3 text-xs sm:text-sm font-mono leading-relaxed'>
              <div>
                <div className='text-fg-muted mb-1'>K =</div>
                <div className='pl-3 text-fg-primary break-all'>
                  ½ m₁ l₁² θ̇₁²
                  <br />+ ½ m₂ ( l₁² θ̇₁² + l₂² θ̇₂² + 2 l₁ l₂ θ̇₁ θ̇₂ cos(θ₁ − θ₂) )
                </div>
              </div>
              <div>
                <div className='text-fg-muted mb-1'>V =</div>
                <div className='pl-3 text-fg-primary break-all'>
                  −( m₁ + m₂ ) g l₁ cos θ₁ − m₂ g l₂ cos θ₂
                </div>
              </div>
              <div>
                <div className='text-fg-muted mb-1'>L = K − V</div>
              </div>
            </div>
          </div>

          <div className='luxe-glass p-4'>
            <p className='eyebrow-mono mb-3 text-emerald-300/80'>— Euler–Lagrange EOM</p>
            <div className='space-y-4 text-xs sm:text-sm font-mono leading-relaxed'>
              <div>
                <div className='text-fg-muted mb-1'>θ̈₁ =</div>
                <div className='pl-3 text-fg-primary break-all'>
                  ( −g( 2m₁+m₂ ) sin θ₁
                  <br />&nbsp;&nbsp;− m₂ g sin( θ₁ − 2θ₂ )
                  <br />&nbsp;&nbsp;− 2 sin(Δθ) m₂ ( ω₂² l₂ + ω₁² l₁ cos Δθ ) )
                  <br />÷ ( l₁ · (2m₁ + m₂ − m₂ cos 2Δθ) )
                </div>
              </div>
              <div>
                <div className='text-fg-muted mb-1'>θ̈₂ =</div>
                <div className='pl-3 text-fg-primary break-all'>
                  ( 2 sin(Δθ) · [
                  <br />&nbsp;&nbsp;ω₁² l₁ (m₁+m₂)
                  <br />&nbsp;&nbsp;+ g(m₁+m₂) cos θ₁
                  <br />&nbsp;&nbsp;+ ω₂² l₂ m₂ cos Δθ ] )
                  <br />÷ ( l₂ · (2m₁ + m₂ − m₂ cos 2Δθ) )
                </div>
              </div>
              <div className='text-[10px] text-fg-muted'>
                Δθ = θ₁ − θ₂. Integrated with 4th-order Runge–Kutta at h = 6 ms.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Sub components ───────────────────────────────────────────

function NumRow({ label, value, min, max, step, onChange }) {
  return (
    <div>
      <div className='flex items-center justify-between text-[11px] mb-0.5'>
        <span className='text-fg-muted'>{label}</span>
        <span className='font-mono text-amber-300 tabular-nums'>{Number(value).toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0)}</span>
      </div>
      <Slider min={min} max={max} step={step} value={value} onChange={onChange} tooltip={{ open: false }} />
    </div>
  )
}

function Metric({ label, unit, value, color }) {
  return (
    <div className='rounded-lg border border-line bg-surface-elevated px-3 py-2'>
      <div className='text-[10px] uppercase tracking-widest text-fg-muted'>{label} <span className='text-fg-dim'>({unit})</span></div>
      <div className={`text-lg font-mono font-semibold ${color} tabular-nums`}>{value}</div>
    </div>
  )
}

// Static SVG kinematic diagram showing the labelled geometry — mirrors
// the "reference textbook" figure with θ₁, l₁, m₁, θ₂, l₂, m₂ + ceiling
// hatches. Uses the current initial angles + length ratio for the pose.
function KinematicDiagram({ L1, L2, m1, m2, t1, t2 }) {
  const W = 380, H = 300
  const cx = W / 2, cy = 50
  const totalArm = L1 + L2
  const scale = Math.min(W, H - cy) * 0.36 / totalArm
  const x1 = cx + scale * L1 * Math.sin(t1)
  const y1 = cy + scale * L1 * Math.cos(t1)
  const x2 = x1 + scale * L2 * Math.sin(t2)
  const y2 = y1 + scale * L2 * Math.cos(t2)
  return (
    <div className='luxe-glass p-3'>
      <p className='eyebrow-mono mb-2 text-fuchsia-300/80'>— Kinematic diagram</p>
      <svg viewBox={`0 0 ${W} ${H}`} className='w-full h-auto'>
        {/* Ceiling hatch */}
        <line x1={cx - 40} y1={cy - 12} x2={cx + 40} y2={cy - 12} stroke='#e5e5e5' strokeWidth='1' />
        {Array.from({ length: 14 }).map((_, i) => (
          <line key={i} x1={cx - 40 + i * 6} y1={cy - 12} x2={cx - 40 + i * 6 - 6} y2={cy - 20} stroke='#e5e5e5' strokeWidth='1' />
        ))}
        {/* Vertical reference from pivot */}
        <line x1={cx} y1={cy} x2={cx} y2={cy + 90} stroke='#666' strokeDasharray='4 4' strokeWidth='1' />
        {/* Rod 1 */}
        <line x1={cx} y1={cy} x2={x1} y2={y1} stroke='#fafafa' strokeWidth='2.5' />
        {/* Rod 2 */}
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke='#fafafa' strokeWidth='2.5' />
        {/* Vertical reference from bob 1 */}
        <line x1={x1} y1={y1} x2={x1} y2={y1 + 80} stroke='#666' strokeDasharray='4 4' strokeWidth='1' />
        {/* Pivot */}
        <circle cx={cx} cy={cy} r='3' fill='#fbbf24' />
        {/* Bobs */}
        <circle cx={x1} cy={y1} r={Math.max(6, 6 + m1 * 3)} fill='#3b82f6' stroke='#93c5fd' strokeWidth='1' />
        <circle cx={x2} cy={y2} r={Math.max(6, 6 + m2 * 3)} fill='#3b82f6' stroke='#93c5fd' strokeWidth='1' />
        {/* θ₁ arc */}
        <path d={`M ${cx} ${cy + 30} A 30 30 0 0 ${t1 > 0 ? 1 : 0} ${cx + 30 * Math.sin(t1)} ${cy + 30 * Math.cos(t1)}`}
              fill='none' stroke='#4ade80' strokeWidth='1.5' />
        {/* θ₂ arc */}
        <path d={`M ${x1} ${y1 + 30} A 30 30 0 0 ${t2 > 0 ? 1 : 0} ${x1 + 30 * Math.sin(t2)} ${y1 + 30 * Math.cos(t2)}`}
              fill='none' stroke='#4ade80' strokeWidth='1.5' />
        {/* Labels */}
        <text x={cx + 8} y={cy + 22} fill='#fbbf24' fontSize='12' fontStyle='italic'>θ₁</text>
        <text x={x1 + 8} y={y1 + 22} fill='#fbbf24' fontSize='12' fontStyle='italic'>θ₂</text>
        <text x={(cx + x1) / 2 + 8} y={(cy + y1) / 2} fill='#e5e5e5' fontSize='12' fontStyle='italic'>l₁</text>
        <text x={(x1 + x2) / 2 + 8} y={(y1 + y2) / 2} fill='#e5e5e5' fontSize='12' fontStyle='italic'>l₂</text>
        <text x={x1 + 12} y={y1 + 4} fill='#93c5fd' fontSize='12' fontStyle='italic'>m₁</text>
        <text x={x2 + 12} y={y2 + 4} fill='#93c5fd' fontSize='12' fontStyle='italic'>m₂</text>
      </svg>
    </div>
  )
}

// Draws the θ(t) live chart on a plain canvas — no recharts overhead.
function drawChart(canvas, data) {
  if (!canvas || !data.length) return
  const parent = canvas.parentElement
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = parent.clientWidth, h = parent.clientHeight
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, w, h)

  const padL = 34, padR = 8, padT = 8, padB = 22
  const cw = w - padL - padR
  const ch = h - padT - padB

  const tMin = data[0].t
  const tMax = data[data.length - 1].t || (tMin + 1)
  let vMin = Infinity, vMax = -Infinity
  for (const p of data) {
    if (p.a < vMin) vMin = p.a
    if (p.a > vMax) vMax = p.a
    if (p.b < vMin) vMin = p.b
    if (p.b > vMax) vMax = p.b
  }
  if (vMin === vMax) { vMin -= 10; vMax += 10 }
  const pad = (vMax - vMin) * 0.1
  vMin -= pad; vMax += pad

  const xOf = (t) => padL + (t - tMin) / (tMax - tMin) * cw
  const yOf = (v) => padT + (1 - (v - vMin) / (vMax - vMin)) * ch

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 1
  for (let i = 0; i <= 4; i++) {
    const y = padT + (i / 4) * ch
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + cw, y); ctx.stroke()
    const v = vMax - (i / 4) * (vMax - vMin)
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.font = '10px ui-monospace, Menlo, monospace'
    ctx.fillText(v.toFixed(0), 2, y + 4)
  }
  for (let i = 0; i <= 4; i++) {
    const x = padL + (i / 4) * cw
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + ch); ctx.stroke()
    const t = tMin + (i / 4) * (tMax - tMin)
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.fillText(t.toFixed(1) + 's', x - 12, h - 6)
  }

  // Zero line
  if (vMin < 0 && vMax > 0) {
    const zy = yOf(0)
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'
    ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(padL, zy); ctx.lineTo(padL + cw, zy); ctx.stroke()
    ctx.setLineDash([])
  }

  // θ₁ (rose)
  ctx.strokeStyle = '#fb7185'
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let i = 0; i < data.length; i++) {
    const p = data[i]
    if (i === 0) ctx.moveTo(xOf(p.t), yOf(p.a))
    else ctx.lineTo(xOf(p.t), yOf(p.a))
  }
  ctx.stroke()

  // θ₂ (cyan)
  ctx.strokeStyle = '#22d3ee'
  ctx.beginPath()
  for (let i = 0; i < data.length; i++) {
    const p = data[i]
    if (i === 0) ctx.moveTo(xOf(p.t), yOf(p.b))
    else ctx.lineTo(xOf(p.t), yOf(p.b))
  }
  ctx.stroke()
}
