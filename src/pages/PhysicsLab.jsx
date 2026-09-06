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
// telemetry, KaTeX-rendered equations, force overlays, four live
// charts, three BE-powered heavy-compute lanes.

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Segmented, Slider, Switch, Tooltip } from 'antd'
import {
  PlayCircleFilled, PauseCircleFilled, ReloadOutlined,
  ExperimentOutlined, ThunderboltFilled, CloudServerOutlined,
  InfoCircleOutlined, LoadingOutlined,
} from '@ant-design/icons'
import katex from 'katex'
import {
  simulatePendulum, phasePendulum, lyapunovPendulum,
} from '../api/physics'

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

// ─── Tooltip copy for every symbol / constant ──────────────────
// Kept in one dictionary so hovering matches everywhere — telemetry,
// controls, equations. Newlines are respected by antd Tooltip when the
// title is a ReactNode, so we use JSX with divs.
const HELP = {
  theta1: 'θ₁ — angle of the upper rod from vertical (radians in the math, degrees in the UI).',
  theta2: 'θ₂ — angle of the lower rod from vertical (radians in the math, degrees in the UI).',
  w1:     'ω₁ = θ̇₁ — angular velocity of the upper rod (rad/s).',
  w2:     'ω₂ = θ̇₂ — angular velocity of the lower rod (rad/s).',
  a1:     'θ̈₁ — angular acceleration of the upper rod (rad/s²), solved from the Euler–Lagrange equation.',
  a2:     'θ̈₂ — angular acceleration of the lower rod (rad/s²).',
  L1:     'ℓ₁ — length of the upper (massless) rod, metres.',
  L2:     'ℓ₂ — length of the lower (massless) rod, metres.',
  m1:     'm₁ — mass of the upper bob, kilograms.',
  m2:     'm₂ — mass of the lower bob, kilograms.',
  g:      'g — gravitational acceleration, m/s². Earth ≈ 9.81, Moon ≈ 1.62, Jupiter ≈ 24.8.',
  K:      'K — total kinetic energy, ½ Σ mᵢ vᵢ². Sum of translational KE of both bobs.',
  V:      'V — gravitational potential energy, measured from the pivot; sign convention makes V < 0 when bobs hang below.',
  E:      'E = K + V — total mechanical energy. Should be constant for a lossless system (damping = 0); its flatness is a proxy for RK4 stability.',
  damping: 'Linear viscous damping coefficient on ω. Adds a term −ζω to each acceleration; energy decays exponentially.',
  count:  'Number of near-identical pendulums simulated in parallel. Each one starts at θ₁₀ + i·Δθ_offset so you can watch chaos fan out.',
  offset: 'Angular offset Δθ between consecutive members of the swarm (degrees). Even 0.1° separates trajectories within a few seconds.',
  trail:  'How many past positions of bob 2 to keep on screen for each pendulum. Higher = prettier trails, more paint per frame.',
  Ftension: 'T — rod tension. Constrains |bob – pivot| = ℓ. Points along the rod, toward the pivot (or the previous bob). Value shown is m·(g cos θ + ℓω²) — the centripetal + gravity projection.',
  Fgravity: 'F_g = m·g — gravitational force on each bob. Always straight down.',
  Fnet:     'F_net — sum of tension + gravity per bob. Equals m·a and dictates the trajectory.',
  lyapunov: (<>
    <div><b>Lyapunov exponent (λ)</b> quantifies how fast two nearby trajectories in phase space diverge.</div>
    <div className='mt-1'>|δ(t)| ≈ |δ₀|·e^(λt). If λ &gt; 0 the system is chaotic — a tiny error grows exponentially.</div>
    <div className='mt-1'>For a heavy double pendulum from a large angle expect λ ≈ 0.5–2 s⁻¹, meaning predictions decay in ~1 s.</div>
  </>),
  poincare: (<>
    <div><b>Poincaré section</b> — sample the state every time the lower pendulum crosses θ₂ = 0 with positive velocity.</div>
    <div className='mt-1'>Plot θ₁ vs ω₁ at those crossings. For a chaotic run it scatters; for an integrable orbit it lands on a closed curve.</div>
  </>),
  phase:    'θ₁ vs ω₁. Draws a closed curve for a periodic orbit and a strange attractor for a chaotic one.',
  energy:   'Live K, V, E over time. A flat E curve confirms RK4 is conserving energy — good visual check of the integrator.',
}

// ─── KaTeX helper ───────────────────────────────────────────────
// Render a LaTeX string to sanitised HTML for dangerouslySetInnerHTML.
// throwOnError: false keeps the page alive if we ever hit a typo.
function renderTex(src, opts = {}) {
  try {
    return katex.renderToString(src, {
      throwOnError: false,
      displayMode: !!opts.display,
      strict: 'ignore',
      output: 'html',
    })
  } catch (e) {
    return `<span class="text-rose-400">${String(src)}</span>`
  }
}

function Tex({ src, display, className = '' }) {
  const html = useMemo(() => renderTex(src, { display }), [src, display])
  return (
    <span
      className={`katex-host ${display ? 'block overflow-x-auto' : 'inline-block'} ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

// ─── Small helper: symbol chip with hover tooltip ──────────────
function Sym({ tex, help, className = '' }) {
  return (
    <Tooltip title={help} placement='top' overlayStyle={{ maxWidth: 320 }}>
      <span className={`katex-host inline-block cursor-help border-b border-dashed border-white/20 hover:border-amber-300/60 ${className}`}
        dangerouslySetInnerHTML={{ __html: renderTex(tex) }}
      />
    </Tooltip>
  )
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
  const [showForces, setShowForces] = useState(true)

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
  const [energyChart, setEnergyChart] = useState([])
  const [phasePts, setPhasePts]       = useState([])
  const [poincarePts, setPoincarePts] = useState([])

  // BE compute state.
  const [beMode, setBeMode]         = useState('simulate')  // 'simulate' | 'phase' | 'lyapunov'
  const [beLoading, setBeLoading]   = useState(false)
  const [beError, setBeError]       = useState('')
  const [beSimulate, setBeSimulate] = useState(null)
  const [bePhase, setBePhase]       = useState(null)
  const [beLyapunov, setBeLyapunov] = useState(null)

  const canvasRef      = useRef(null)
  const chartRef       = useRef(null)
  const energyRef      = useRef(null)
  const phaseRef       = useRef(null)
  const poincareRef    = useRef(null)
  const beSeriesRef    = useRef(null)
  const bePhaseCanvasRef = useRef(null)
  const beLyapunovRef  = useRef(null)
  const stateRef       = useRef([])
  const trailsRef      = useRef([])
  const chartRefBuf    = useRef([])
  const energyRefBuf   = useRef([])
  const phaseBufRef    = useRef([])
  const poincareBufRef = useRef([])
  const lastT2SignRef  = useRef(null)   // Poincaré cross detector
  const rafRef         = useRef(null)
  const lastTsRef      = useRef(0)
  const simTRef        = useRef(0)
  const teleAccRef     = useRef(0)

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
    energyRefBuf.current = []
    phaseBufRef.current = []
    poincareBufRef.current = []
    lastT2SignRef.current = null
    simTRef.current = 0
    setChart([])
    setEnergyChart([])
    setPhasePts([])
    setPoincarePts([])
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

        // Poincaré detector on pendulum 0 — record θ₁, ω₁ whenever
        // θ₂ crosses zero from negative to positive.
        const p0 = stateRef.current[0]
        if (p0) {
          const sign = Math.sign(p0.t2)
          const last = lastT2SignRef.current
          if (last !== null && last < 0 && sign >= 0 && p0.w2 > 0) {
            // Wrap θ₁ into (-π, π] for plotting.
            let th = p0.t1
            th = ((th + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI
            poincareBufRef.current.push({ x: th, y: p0.w1 })
            if (poincareBufRef.current.length > 500) poincareBufRef.current.shift()
          }
          lastT2SignRef.current = sign
        }
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

        // Force arrows — tension along each rod, gravity straight down.
        if (showForces) {
          const { a1: acc1, a2: acc2 } = accelerations({ ...st0, m1, m2, L1, L2, g })
          // Tension magnitude on m₁: T₁ = m₁ g cos θ₁ + m₁ L₁ ω₁² + reaction
          // Tension on m₂: T₂ = m₂ (g cos θ₂ + L₂ ω₂²). Simple projection,
          // fine for a visual arrow.
          const T1mag = Math.abs(m1 * (g * Math.cos(st0.t1) + L1 * st0.w1 * st0.w1)
                                 + m2 * (g * Math.cos(st0.t1)))
          const T2mag = Math.abs(m2 * (g * Math.cos(st0.t2) + L2 * st0.w2 * st0.w2))
          const G1mag = m1 * g
          const G2mag = m2 * g

          // Unit vector along rod 1 (bob → pivot), rod 2 (bob → previous bob).
          const dx1 = cx - x1, dy1 = cy - y1
          const len1 = Math.hypot(dx1, dy1) || 1
          const ux1 = dx1 / len1, uy1 = dy1 / len1
          const dx2 = x1 - x2, dy2 = y1 - y2
          const len2 = Math.hypot(dx2, dy2) || 1
          const ux2 = dx2 / len2, uy2 = dy2 / len2

          // Scale forces to arrow lengths (px). 8 px per Newton.
          const S = 4
          // Tension on m₁ (cyan)
          drawArrow(ctx, x1, y1, x1 + ux1 * T1mag * S * 0.4, y1 + uy1 * T1mag * S * 0.4, '#22d3ee')
          // Tension on m₂ (cyan)
          drawArrow(ctx, x2, y2, x2 + ux2 * T2mag * S, y2 + uy2 * T2mag * S, '#22d3ee')
          // Gravity on m₁ (amber)
          drawArrow(ctx, x1, y1, x1, y1 + G1mag * S, '#fbbf24')
          // Gravity on m₂ (amber)
          drawArrow(ctx, x2, y2, x2, y2 + G2mag * S, '#fbbf24')
          // Net on m₂ (magenta) — m·a where a is the tangential angular accel.
          const Ftx = m2 * L2 * acc2 * Math.cos(st0.t2)
          const Fty = -m2 * L2 * acc2 * Math.sin(st0.t2)
          drawArrow(ctx, x2, y2, x2 + Ftx * S, y2 + Fty * S, '#e879f9')
        }
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

      // Chart samples — one sample per RAF frame while running.
      if (running && subSteps > 0) {
        const p0 = stateRef.current[0]
        if (p0) {
          chartRefBuf.current.push({ t: simTRef.current, a: p0.t1 / DEG, b: p0.t2 / DEG })
          if (chartRefBuf.current.length > CHART_MAX) chartRefBuf.current.shift()

          const { K, V, E } = energies({ ...p0, ...params })
          energyRefBuf.current.push({ t: simTRef.current, K, V, E })
          if (energyRefBuf.current.length > CHART_MAX) energyRefBuf.current.shift()

          // Phase portrait — θ₁ wrapped, ω₁.
          let th = p0.t1
          th = ((th + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI
          phaseBufRef.current.push({ x: th, y: p0.w1 })
          if (phaseBufRef.current.length > 1200) phaseBufRef.current.shift()
        }
      }

      // Live chart renders — separate canvases.
      drawTimeChart(chartRef.current, chartRefBuf.current,
        [{ key: 'a', color: '#fb7185' }, { key: 'b', color: '#22d3ee' }],
        { yLabel: '°' })
      drawTimeChart(energyRef.current, energyRefBuf.current,
        [
          { key: 'K', color: '#fbbf24' },
          { key: 'V', color: '#e879f9' },
          { key: 'E', color: '#4ade80' },
        ], { yLabel: 'J' })
      drawScatter(phaseRef.current, phaseBufRef.current,
        { xLabel: 'θ₁ (rad)', yLabel: 'ω₁ (rad/s)', lines: true, color: '#a78bfa' })
      drawScatter(poincareRef.current, poincareBufRef.current,
        { xLabel: 'θ₁ (rad)', yLabel: 'ω₁ (rad/s)', lines: false, color: '#f472b6' })

      rafRef.current = requestAnimationFrame(step)
    }

    rafRef.current = requestAnimationFrame(step)
    return () => rafRef.current && cancelAnimationFrame(rafRef.current)
  }, [running, m1, m2, L1, L2, g, damping, trailLen, rainbow, showForces])

  // Also stream chart samples into React state periodically so the
  // rendered chart component knows to redraw (~5 Hz is smooth enough).
  useEffect(() => {
    const id = setInterval(() => {
      setChart([...chartRefBuf.current])
      setEnergyChart([...energyRefBuf.current])
      setPhasePts([...phaseBufRef.current])
      setPoincarePts([...poincareBufRef.current])
    }, 200)
    return () => clearInterval(id)
  }, [])

  // Re-draw the BE-returned canvases when their data changes (and on
  // window resize, so a parent-width change repaints them).
  useEffect(() => {
    const paint = () => {
      if (beMode === 'simulate' && beSimulate?.series) {
        drawTimeChart(beSeriesRef.current,
          beSimulate.series.map(p => ({ t: p.t, K: p.K, V: p.V, E: p.E })),
          [
            { key: 'K', color: '#fbbf24' },
            { key: 'V', color: '#e879f9' },
            { key: 'E', color: '#4ade80' },
          ], { yLabel: 'J' })
      }
      if (beMode === 'phase' && bePhase?.curves) {
        // Wrap θ into (-π, π] and flatten curves into colour-keyed lines.
        const wrap = (th) => ((th + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI
        const curvesForCanvas = bePhase.curves.map((c, i) => {
          const points = c.t1.map((th, k) => ({ x: wrap(th), y: c.w1[k] }))
          const hue = (i / Math.max(1, bePhase.curves.length)) * 300 + 20
          return { points, color: `hsla(${hue}, 90%, 62%, 0.75)` }
        })
        drawMultiScatter(bePhaseCanvasRef.current, curvesForCanvas,
          { xLabel: 'θ₁ (rad)', yLabel: 'ω₁ (rad/s)', lines: true })
      }
      if (beMode === 'lyapunov' && beLyapunov?.series) {
        // The BE returns raw separation; plot log(sep / sep₀) so the
        // slope is λ directly.
        const sep0 = beLyapunov.series[0]?.sep || 1e-12
        const growth = beLyapunov.series.map(p => ({
          t: p.t,
          log_sep: Math.log((p.sep || 1e-300) / sep0),
        }))
        drawTimeChart(beLyapunovRef.current, growth,
          [{ key: 'log_sep', color: '#f472b6' }],
          { yLabel: 'log |δ|/|δ₀|' })
      }
    }
    paint()
    const onResize = () => paint()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [beMode, beSimulate, bePhase, beLyapunov])

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
    energyRefBuf.current = []
    phaseBufRef.current = []
    poincareBufRef.current = []
    lastT2SignRef.current = null
    simTRef.current = 0
    setChart([])
    setEnergyChart([])
    setPhasePts([])
    setPoincarePts([])
    setNow(0)
  }

  // Live force estimate on bob 2 (magnitude of net force on m₂).
  const force2 = useMemo(() => {
    const { a2 } = accelerations({
      t1: telemetry.t1, t2: telemetry.t2, w1: telemetry.w1, w2: telemetry.w2,
      m1, m2, L1, L2, g,
    })
    return Math.abs(m2 * L2 * a2)
  }, [telemetry, m1, m2, L1, L2, g])

  // BE compute launcher — reshapes UI state into the BE's contract.
  const runOnServer = useCallback(async () => {
    setBeError('')
    setBeLoading(true)
    const params  = { L1, L2, m1, m2, g }
    const initial = { t1: ic1Deg * DEG, t2: ic2Deg * DEG, w1: ico1, w2: ico2 }
    try {
      if (beMode === 'simulate') {
        setBeSimulate(await simulatePendulum({ params, initial, duration: 30, dt: 0.001 }))
      } else if (beMode === 'phase') {
        // Fan out a small bouquet of initials so the phase-portrait shows
        // chaos not a single dot.
        const initials = Array.from({ length: 8 }, (_, i) => ({
          t1: initial.t1 + i * offsetDeg * DEG,
          t2: initial.t2,
          w1: initial.w1,
          w2: initial.w2,
        }))
        setBePhase(await phasePendulum({ params, initials, duration: 12, dt: 0.005 }))
      } else if (beMode === 'lyapunov') {
        setBeLyapunov(await lyapunovPendulum({ params, initial, duration: 20, dt: 0.005, epsilon: 1e-8 }))
      }
    } catch (e) {
      setBeError(e?.message || 'Server compute failed')
    } finally {
      setBeLoading(false)
    }
  }, [beMode, m1, m2, L1, L2, g, ic1Deg, ic2Deg, ico1, ico2, offsetDeg])

  return (
    <div className='min-h-screen bg-[var(--luxe-bg-base)] text-fg-primary pt-24 sm:pt-28 pb-16 px-3 sm:px-6' style={{ fontVariantNumeric: 'tabular-nums' }}>
      <style>{PULSE_KEYFRAMES}</style>
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
              <p className='text-[11px] text-fg-muted leading-snug mt-1'>
                Snap all sliders to a canned initial condition — instant demo mode.
              </p>
            </div>

            <div className='grid grid-cols-2 gap-x-4 gap-y-1'>
              <NumRow tex='\ell_1' unit='m'    help={HELP.L1}     hint='Upper rod length, m. Longer rods = slower period.'      value={L1}       min={0.3} max={2}   step={0.05} onChange={setL1} />
              <NumRow tex='\ell_2' unit='m'    help={HELP.L2}     hint='Lower rod length, m. Longer rods = slower period.'      value={L2}       min={0.3} max={2}   step={0.05} onChange={setL2} />
              <NumRow tex='m_1'    unit='kg'   help={HELP.m1}     hint='Upper bob mass, kg. Heavy bob 1 dominates the swing.'    value={m1}       min={0.2} max={4}   step={0.1}  onChange={setM1} />
              <NumRow tex='m_2'    unit='kg'   help={HELP.m2}     hint='Lower bob mass, kg. Heavier tip amplifies chaotic motion.' value={m2}     min={0.2} max={4}   step={0.1}  onChange={setM2} />
              <NumRow tex='g'      unit='m/s²' help={HELP.g}      hint='Gravity, m/s². 9.81 = Earth, 1.62 = Moon, 24.79 = Jupiter.' value={g}      min={0}   max={30}  step={0.1}  onChange={setG} />
              <NumRow tex='\zeta'  unit=''     help={HELP.damping} hint='Viscous damping on ω. 0 = frictionless; higher = energy decays.' value={damping} min={0}  max={0.5} step={0.01} onChange={setDamping} />
              <NumRow tex='\theta_{1,0}' unit='°' help={HELP.theta1} hint='Upper pendulum start angle, degrees. Bigger angle = more chaos.' value={ic1Deg}   min={-180} max={180} step={1}   onChange={setIc1Deg} />
              <NumRow tex='\theta_{2,0}' unit='°' help={HELP.theta2} hint='Lower pendulum start angle, degrees.' value={ic2Deg}   min={-180} max={180} step={1}   onChange={setIc2Deg} />
              <NumRow tex='\omega_{1,0}' unit='rad/s' help={HELP.w1} hint='Upper initial angular velocity, rad/s. Start at 0 for a drop.' value={ico1}    min={-8} max={8} step={0.1}     onChange={setIco1} />
              <NumRow tex='\omega_{2,0}' unit='rad/s' help={HELP.w2} hint='Lower initial angular velocity, rad/s. Start at 0 for a drop.' value={ico2}    min={-8} max={8} step={0.1}     onChange={setIco2} />
              <NumRow label='Pendulums' help={HELP.count}  hint='How many near-identical pendulums to run side by side.' value={count}   min={1}   max={200} step={1}    onChange={setCount} />
              <NumRow tex='\Delta\theta' unit='°' help={HELP.offset} hint='Angle offset between neighbours. Even 0.1° fans chaos in seconds.' value={offsetDeg} min={0} max={5} step={0.05} onChange={setOffsetDeg} />
              <NumRow label='Trail length' help={HELP.trail} hint='Past positions kept on screen per pendulum. Higher = prettier trails.' value={trailLen} min={0} max={2000} step={50} onChange={setTrailLen} />
              <div>
                <div className='flex items-center justify-between text-[11px]'>
                  <span className='text-fg-muted'>Rainbow</span>
                  <Switch size='small' checked={rainbow} onChange={setRainbow} />
                </div>
                <p className='text-[11px] text-fg-muted leading-snug mt-1'>
                  Colour each trail by index for a rainbow bouquet effect.
                </p>
              </div>
              <div>
                <div className='flex items-center justify-between text-[11px]'>
                  <span className='text-fg-muted'>Force arrows</span>
                  <Switch size='small' checked={showForces} onChange={setShowForces} />
                </div>
                <p className='text-[11px] text-fg-muted leading-snug mt-1'>
                  Overlay tension, gravity, and net-force vectors on the bobs.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Row 2 · Live canvas + θ(t) chart ── */}
        <div className='grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4 mb-4'>
          <div className='luxe-glass overflow-hidden relative' style={{ height: 'min(60vh, 520px)' }}>
            <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
            {showForces && (
              <div className='absolute bottom-2 right-2 bg-black/60 border border-white/10 rounded-md px-2 py-1.5 text-[10px] font-mono space-y-0.5'>
                <div className='flex items-center gap-1.5'>
                  <span className='w-2.5 h-0.5 bg-cyan-400 inline-block' /> Tension
                  <Tooltip title={HELP.Ftension}><InfoCircleOutlined className='text-fg-muted text-[10px]' /></Tooltip>
                </div>
                <div className='flex items-center gap-1.5'>
                  <span className='w-2.5 h-0.5 bg-amber-400 inline-block' /> Gravity
                  <Tooltip title={HELP.Fgravity}><InfoCircleOutlined className='text-fg-muted text-[10px]' /></Tooltip>
                </div>
                <div className='flex items-center gap-1.5'>
                  <span className='w-2.5 h-0.5 bg-fuchsia-400 inline-block' /> Net force
                  <Tooltip title={HELP.Fnet}><InfoCircleOutlined className='text-fg-muted text-[10px]' /></Tooltip>
                </div>
              </div>
            )}
          </div>
          <div className='luxe-glass p-3 flex flex-col' style={{ height: 'min(60vh, 520px)' }}>
            <div className='flex items-center justify-between mb-2'>
              <p className='eyebrow-mono text-amber-300/80'>— θ(t) · angles over time</p>
              <div className='flex items-center gap-3 text-[10px] font-mono'>
                <span className='flex items-center gap-1'><span className='w-2.5 h-2.5 rounded-full bg-rose-400' /> <Sym tex='\theta_1' help={HELP.theta1} /></span>
                <span className='flex items-center gap-1'><span className='w-2.5 h-2.5 rounded-full bg-cyan-400' /> <Sym tex='\theta_2' help={HELP.theta2} /></span>
              </div>
            </div>
            <div className='flex-1 min-h-0'>
              <canvas ref={chartRef} style={{ display: 'block', width: '100%', height: '100%' }} />
            </div>
          </div>
        </div>

        {/* ── Row 3 · Telemetry ── */}
        <div className='luxe-glass p-4 mb-4'>
          <div className='flex items-center gap-2 mb-3'>
            <ThunderboltFilled className='text-amber-300' />
            <p className='eyebrow-mono text-amber-300/80'>— Live telemetry (pendulum 1)</p>
          </div>
          <div className='grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs'>
            <Metric tex='\theta_1'  unit='°'     value={(telemetry.t1 / DEG).toFixed(1)} color='text-rose-300'    help={HELP.theta1} />
            <Metric tex='\theta_2'  unit='°'     value={(telemetry.t2 / DEG).toFixed(1)} color='text-cyan-300'    help={HELP.theta2} />
            <Metric tex='\omega_1'  unit='rad/s' value={telemetry.w1.toFixed(2)}         color='text-rose-200'    help={HELP.w1} />
            <Metric tex='\omega_2'  unit='rad/s' value={telemetry.w2.toFixed(2)}         color='text-cyan-200'    help={HELP.w2} />
            <Metric tex='K'         unit='J'     value={telemetry.K.toFixed(2)}          color='text-amber-200'   help={HELP.K} />
            <Metric tex='V'         unit='J'     value={telemetry.V.toFixed(2)}          color='text-fuchsia-200' help={HELP.V} />
            <Metric tex='|F_2|'     unit='N'     value={force2.toFixed(2)}               color='text-emerald-200' help={HELP.Fnet} />
          </div>
          <div className='mt-3 text-[10px] font-mono text-fg-muted flex items-center gap-2'>
            <Sym tex='E = K + V' help={HELP.E} />
            <span>=</span>
            <span className='text-amber-300'>{telemetry.E.toFixed(3)} J</span>
            {damping === 0 && <span className='ml-2 text-fg-dim'>(conserved in a lossless system — verify RK4 stability)</span>}
          </div>
        </div>

        {/* ── Row 4 · Energy chart + Phase portrait ── */}
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4'>
          <div className='luxe-glass p-3 flex flex-col' style={{ height: 320 }}>
            <div className='flex items-center justify-between mb-2'>
              <p className='eyebrow-mono text-amber-300/80 flex items-center gap-1'>
                — Energy over time
                <Tooltip title={HELP.energy}><InfoCircleOutlined className='text-fg-muted text-[10px]' /></Tooltip>
              </p>
              <div className='flex items-center gap-3 text-[10px] font-mono'>
                <span className='flex items-center gap-1'><span className='w-2.5 h-2.5 rounded-full bg-amber-400' /> <Sym tex='K' help={HELP.K} /></span>
                <span className='flex items-center gap-1'><span className='w-2.5 h-2.5 rounded-full bg-fuchsia-400' /> <Sym tex='V' help={HELP.V} /></span>
                <span className='flex items-center gap-1'><span className='w-2.5 h-2.5 rounded-full bg-emerald-400' /> <Sym tex='E' help={HELP.E} /></span>
              </div>
            </div>
            <div className='flex-1 min-h-0'>
              <canvas ref={energyRef} style={{ display: 'block', width: '100%', height: '100%' }} />
            </div>
          </div>
          <div className='luxe-glass p-3 flex flex-col' style={{ height: 320 }}>
            <div className='flex items-center justify-between mb-2'>
              <p className='eyebrow-mono text-fuchsia-300/80 flex items-center gap-1'>
                — Phase portrait <span className='text-fg-muted normal-case font-mono ml-1'>θ₁ vs ω₁</span>
                <Tooltip title={HELP.phase}><InfoCircleOutlined className='text-fg-muted text-[10px]' /></Tooltip>
              </p>
            </div>
            <div className='flex-1 min-h-0'>
              <canvas ref={phaseRef} style={{ display: 'block', width: '100%', height: '100%' }} />
            </div>
          </div>
        </div>

        {/* ── Row 5 · Poincaré section ── */}
        <div className='luxe-glass p-3 mb-4' style={{ height: 320 }}>
          <div className='flex items-center justify-between mb-2'>
            <p className='eyebrow-mono text-pink-300/80 flex items-center gap-1'>
              — Poincaré section
              <Tooltip title={HELP.poincare}><InfoCircleOutlined className='text-fg-muted text-[10px]' /></Tooltip>
            </p>
            <span className='text-[10px] font-mono text-fg-muted'>{poincarePts.length} crossings</span>
          </div>
          <div style={{ height: 260 }}>
            <canvas ref={poincareRef} style={{ display: 'block', width: '100%', height: '100%' }} />
          </div>
        </div>

        {/* ── Row 6 · BE compute lane ── */}
        <div className='luxe-glass p-4 mb-4'>
          <div className='flex items-center gap-2 mb-3 flex-wrap'>
            <CloudServerOutlined className='text-cyan-300' />
            <p className='eyebrow-mono text-cyan-300/80'>— Compute on server</p>
            <div className='ml-auto flex flex-col items-end gap-1'>
              <div className='flex items-center gap-2 flex-wrap'>
                <Segmented
                  size='small'
                  value={beMode}
                  onChange={setBeMode}
                  options={[
                    { label: 'Simulate 30s', value: 'simulate' },
                    { label: 'Phase space', value: 'phase' },
                    { label: 'Lyapunov λ', value: 'lyapunov' },
                  ]}
                />
                <button
                  onClick={runOnServer}
                  disabled={beLoading}
                  className='luxe-btn luxe-btn-primary text-xs disabled:opacity-60 disabled:cursor-not-allowed'
                >
                  {beLoading ? <><LoadingOutlined /> Computing…</> : <>Run on server</>}
                </button>
              </div>
              <p className='text-[11px] text-fg-muted leading-snug'>
                Server compute mode. Server compute window ~30s; capped at 60s.
              </p>
            </div>
          </div>

          {beError && (
            <div className='rounded border border-rose-500/40 bg-rose-500/10 text-rose-200 text-xs px-3 py-2 mb-3 font-mono'>
              {beError}
            </div>
          )}

          {beMode === 'simulate' && (
            <div>
              <div className='text-[10px] font-mono text-fg-muted mb-2'>
                POST <span className='text-cyan-300'>/api/physics/pendulum/simulate</span> — 30 s @ dt = 0.001 (server), decimated for wire.
                {beSimulate?.series?.length && <> · <span className='text-emerald-300'>{beSimulate.series.length}</span> samples returned.</>}
              </div>
              <div style={{ height: 280 }} className={beLoading ? 'animate-pulse opacity-70' : ''}>
                <canvas ref={beSeriesRef} style={{ display: 'block', width: '100%', height: '100%' }} />
              </div>
              <div className='flex items-center gap-3 text-[10px] font-mono mt-2'>
                <span className='flex items-center gap-1'><span className='w-2.5 h-2.5 rounded-full bg-amber-400' /> K</span>
                <span className='flex items-center gap-1'><span className='w-2.5 h-2.5 rounded-full bg-fuchsia-400' /> V</span>
                <span className='flex items-center gap-1'><span className='w-2.5 h-2.5 rounded-full bg-emerald-400' /> E</span>
              </div>
            </div>
          )}

          {beMode === 'phase' && (
            <div>
              <div className='text-[10px] font-mono text-fg-muted mb-2'>
                POST <span className='text-cyan-300'>/api/physics/pendulum/phase</span> — 8 seeded trajectories, θ₁ wrapped to [−π, π].
                {bePhase?.curves?.length && <> · <span className='text-emerald-300'>{bePhase.curves.length}</span> curves × <span className='text-emerald-300'>{bePhase.curves[0]?.t1?.length ?? 0}</span> pts.</>}
              </div>
              <div style={{ height: 340 }} className={beLoading ? 'animate-pulse opacity-70' : ''}>
                <canvas ref={bePhaseCanvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
              </div>
            </div>
          )}

          {beMode === 'lyapunov' && (
            <div>
              <div className='text-[10px] font-mono text-fg-muted mb-2'>
                POST <span className='text-cyan-300'>/api/physics/pendulum/lyapunov</span> — two trajectories seeded ε = 10⁻⁸ apart, endpoint-form estimate.
              </div>
              <div className='flex flex-wrap items-center gap-4 mb-2 text-xs font-mono'>
                <div className='flex items-center gap-2'>
                  <span className='text-fg-muted'>Finite-time</span>
                  <Sym tex='\lambda \approx' help={HELP.lyapunov} />
                  <span className='text-lg text-fuchsia-300'>
                    {beLyapunov?.lyapunov != null ? beLyapunov.lyapunov.toFixed(3) : '—'}
                  </span>
                  <span className='text-fg-muted'>s⁻¹</span>
                </div>
                {beLyapunov?.lyapunov != null && (
                  <div className='text-[10px] text-fg-muted'>
                    {beLyapunov.lyapunov > 0.05
                      ? '→ Chaotic. Predictions decay in ~' + (1 / beLyapunov.lyapunov).toFixed(2) + ' s.'
                      : '→ Regular / periodic orbit.'}
                  </div>
                )}
              </div>
              <div style={{ height: 260 }} className={beLoading ? 'animate-pulse opacity-70' : ''}>
                <canvas ref={beLyapunovRef} style={{ display: 'block', width: '100%', height: '100%' }} />
              </div>
              <div className='text-[10px] text-fg-muted mt-2'>
                Slope of the log-separation curve = λ. A straight line for a large duration confirms exponential divergence.
              </div>
            </div>
          )}
        </div>

        {/* ── Row 7 · Equations (KaTeX) ── */}
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
          <div className='luxe-glass p-4'>
            <p className='eyebrow-mono mb-3 text-cyan-300/80'>— Kinetic + Potential Energy</p>
            <div className='space-y-4 text-sm leading-relaxed'>
              <div>
                <div className='text-fg-muted mb-1 flex items-center gap-2'>
                  <Sym tex='K =' help={HELP.K} />
                </div>
                <Tex display src={String.raw`K \;=\; \tfrac{1}{2} m_1 \ell_1^{2} \dot{\theta}_1^{2} + \tfrac{1}{2} m_2 \!\left( \ell_1^{2} \dot{\theta}_1^{2} + \ell_2^{2} \dot{\theta}_2^{2} + 2\,\ell_1 \ell_2\, \dot{\theta}_1 \dot{\theta}_2 \cos(\theta_1 - \theta_2) \right)`} />
              </div>
              <div>
                <div className='text-fg-muted mb-1 flex items-center gap-2'>
                  <Sym tex='V =' help={HELP.V} />
                </div>
                <Tex display src={String.raw`V \;=\; -(m_1 + m_2)\, g\, \ell_1 \cos\theta_1 \;-\; m_2\, g\, \ell_2 \cos\theta_2`} />
              </div>
              <div>
                <Tex display src={String.raw`\mathcal{L} \;=\; K - V \qquad \frac{d}{dt}\!\!\left(\frac{\partial \mathcal{L}}{\partial \dot{\theta}_i}\right) \;-\; \frac{\partial \mathcal{L}}{\partial \theta_i} \;=\; 0`} />
              </div>
            </div>
          </div>

          <div className='luxe-glass p-4'>
            <p className='eyebrow-mono mb-3 text-emerald-300/80'>— Euler–Lagrange EOM</p>
            <div className='space-y-4 text-sm leading-relaxed'>
              <div>
                <div className='text-fg-muted mb-1'><Sym tex='\ddot{\theta}_1' help={HELP.a1} /> =</div>
                <Tex display src={String.raw`\ddot{\theta}_1 = \frac{ -g(2m_1+m_2)\sin\theta_1 - m_2 g \sin(\theta_1-2\theta_2) - 2\sin(\Delta\theta)\,m_2 \!\left(\omega_2^{2}\ell_2 + \omega_1^{2}\ell_1 \cos\Delta\theta\right) }{ \ell_1\!\left(2m_1 + m_2 - m_2 \cos 2\Delta\theta\right) }`} />
              </div>
              <div>
                <div className='text-fg-muted mb-1'><Sym tex='\ddot{\theta}_2' help={HELP.a2} /> =</div>
                <Tex display src={String.raw`\ddot{\theta}_2 = \frac{ 2 \sin(\Delta\theta) \!\left[ \omega_1^{2}\ell_1(m_1+m_2) + g(m_1+m_2)\cos\theta_1 + \omega_2^{2}\ell_2 m_2 \cos\Delta\theta \right] }{ \ell_2\!\left(2m_1 + m_2 - m_2 \cos 2\Delta\theta\right) }`} />
              </div>
              <div className='text-[10px] text-fg-muted flex items-center gap-2'>
                <Sym tex='\Delta\theta = \theta_1 - \theta_2' help='Angle between the two rods; controls the coupling strength.' />
                · Integrated with 4th-order Runge–Kutta at h = 6 ms.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Sub components ───────────────────────────────────────────

// Amber flash on the value box every time it changes — cheap way to
// draw the eye to what's moving without adding a heavy animation lib.
const PULSE_KEYFRAMES = `
@keyframes sid-metric-pulse {
  0%   { background-color: rgba(251, 191, 36, 0.20); }
  100% { background-color: transparent; }
}
.sid-pulse { animation: sid-metric-pulse 200ms ease-out; }
`

function NumRow({ label, tex, unit, help, hint, value, min, max, step, onChange }) {
  const head = (
    <div className='flex items-center justify-between text-[11px] mb-0.5'>
      <span className='text-fg-muted flex items-center gap-1'>
        {tex ? <Sym tex={tex} help={help} /> : label}
        {unit && <span className='text-fg-dim ml-0.5'>({unit})</span>}
      </span>
      <span className='font-mono text-amber-300 tabular-nums'>{Number(value).toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0)}</span>
    </div>
  )
  return (
    <div>
      {head}
      <Slider min={min} max={max} step={step} value={value} onChange={onChange} tooltip={{ open: false }} />
      {hint && <p className='text-[11px] text-fg-muted leading-snug mt-1'>{hint}</p>}
    </div>
  )
}

function Metric({ label, tex, unit, value, color, help }) {
  // `key`d wrapper — remount = re-run animation whenever the number changes.
  return (
    <div className='rounded-lg border border-line bg-surface-elevated px-3 py-2'>
      <div className='text-[10px] uppercase tracking-widest text-fg-muted flex items-center gap-1'>
        {tex ? <Sym tex={tex} help={help} /> : label}
        <span className='text-fg-dim'>({unit})</span>
      </div>
      <div key={value} className={`sid-pulse rounded text-lg font-mono font-semibold ${color} tabular-nums`}>{value}</div>
    </div>
  )
}

// Draw an arrow with head from (x1,y1) to (x2,y2).
function drawArrow(ctx, x1, y1, x2, y2, color) {
  const dx = x2 - x1, dy = y2 - y1
  const len = Math.hypot(dx, dy)
  if (len < 4) return
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
  const ang = Math.atan2(dy, dx)
  const HL = 6
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - HL * Math.cos(ang - Math.PI / 6), y2 - HL * Math.sin(ang - Math.PI / 6))
  ctx.lineTo(x2 - HL * Math.cos(ang + Math.PI / 6), y2 - HL * Math.sin(ang + Math.PI / 6))
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

// Static SVG kinematic diagram showing the labelled geometry.
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
        <line x1={cx} y1={cy} x2={cx} y2={cy + 90} stroke='#666' strokeDasharray='4 4' strokeWidth='1' />
        <line x1={cx} y1={cy} x2={x1} y2={y1} stroke='#fafafa' strokeWidth='2.5' />
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke='#fafafa' strokeWidth='2.5' />
        <line x1={x1} y1={y1} x2={x1} y2={y1 + 80} stroke='#666' strokeDasharray='4 4' strokeWidth='1' />
        <circle cx={cx} cy={cy} r='3' fill='#fbbf24' />
        <circle cx={x1} cy={y1} r={Math.max(6, 6 + m1 * 3)} fill='#3b82f6' stroke='#93c5fd' strokeWidth='1' />
        <circle cx={x2} cy={y2} r={Math.max(6, 6 + m2 * 3)} fill='#3b82f6' stroke='#93c5fd' strokeWidth='1' />
        <path d={`M ${cx} ${cy + 30} A 30 30 0 0 ${t1 > 0 ? 1 : 0} ${cx + 30 * Math.sin(t1)} ${cy + 30 * Math.cos(t1)}`}
              fill='none' stroke='#4ade80' strokeWidth='1.5' />
        <path d={`M ${x1} ${y1 + 30} A 30 30 0 0 ${t2 > 0 ? 1 : 0} ${x1 + 30 * Math.sin(t2)} ${y1 + 30 * Math.cos(t2)}`}
              fill='none' stroke='#4ade80' strokeWidth='1.5' />
        <text x={cx + 8} y={cy + 22} fill='#fbbf24' fontSize='12' fontStyle='italic'>θ₁</text>
        <text x={x1 + 8} y={y1 + 22} fill='#fbbf24' fontSize='12' fontStyle='italic'>θ₂</text>
        <text x={(cx + x1) / 2 + 8} y={(cy + y1) / 2} fill='#e5e5e5' fontSize='12' fontStyle='italic'>ℓ₁</text>
        <text x={(x1 + x2) / 2 + 8} y={(y1 + y2) / 2} fill='#e5e5e5' fontSize='12' fontStyle='italic'>ℓ₂</text>
        <text x={x1 + 12} y={y1 + 4} fill='#93c5fd' fontSize='12' fontStyle='italic'>m₁</text>
        <text x={x2 + 12} y={y2 + 4} fill='#93c5fd' fontSize='12' fontStyle='italic'>m₂</text>
      </svg>
    </div>
  )
}

// ─── Chart canvases ────────────────────────────────────────────

// Ensure canvas is sized to its parent with DPR — returns (w,h) in
// CSS pixels and the 2d context ready for CSS-pixel drawing.
function prepCanvas(canvas) {
  if (!canvas || !canvas.parentElement) return null
  const parent = canvas.parentElement
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = parent.clientWidth, h = parent.clientHeight
  if (!w || !h) return null
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'
  }
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  return { ctx, w, h }
}

// Generic time-series line chart. `series` = [{key, color}]. Each data
// point must have `t` + the keyed values.
function drawTimeChart(canvas, data, series, opts = {}) {
  const P = prepCanvas(canvas)
  if (!P || !data.length) return
  const { ctx, w, h } = P
  const padL = 40, padR = 8, padT = 8, padB = 22
  const cw = w - padL - padR
  const ch = h - padT - padB

  const tMin = data[0].t
  const tMax = data[data.length - 1].t || (tMin + 1)
  let vMin = Infinity, vMax = -Infinity
  for (const p of data) for (const s of series) {
    const v = p[s.key]
    if (v < vMin) vMin = v
    if (v > vMax) vMax = v
  }
  if (!Number.isFinite(vMin) || !Number.isFinite(vMax)) return
  if (vMin === vMax) { vMin -= 1; vMax += 1 }
  const pad = (vMax - vMin) * 0.1
  vMin -= pad; vMax += pad

  const xOf = (t) => padL + (t - tMin) / (tMax - tMin) * cw
  const yOf = (v) => padT + (1 - (v - vMin) / (vMax - vMin)) * ch

  // Grid + tick labels
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 1
  for (let i = 0; i <= 4; i++) {
    const y = padT + (i / 4) * ch
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + cw, y); ctx.stroke()
    const v = vMax - (i / 4) * (vMax - vMin)
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.font = '10px ui-monospace, Menlo, monospace'
    ctx.fillText(v.toFixed(1), 2, y + 4)
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

  for (const s of series) {
    ctx.strokeStyle = s.color
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let i = 0; i < data.length; i++) {
      const p = data[i]
      const v = p[s.key]
      if (i === 0) ctx.moveTo(xOf(p.t), yOf(v))
      else ctx.lineTo(xOf(p.t), yOf(v))
    }
    ctx.stroke()
  }

  if (opts.yLabel) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.font = '10px ui-monospace, Menlo, monospace'
    ctx.fillText(opts.yLabel, padL - 30, padT + 10)
  }
}

// Scatter / continuous curve for phase-space and Poincaré plots.
// data = [{x, y}, ...]. lines: true = draw a polyline; false = dots.
function drawScatter(canvas, data, opts = {}) {
  const P = prepCanvas(canvas)
  if (!P || !data.length) return
  const { ctx, w, h } = P
  const padL = 40, padR = 8, padT = 8, padB = 26
  const cw = w - padL - padR
  const ch = h - padT - padB

  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity
  for (const p of data) {
    if (p.x < xMin) xMin = p.x
    if (p.x > xMax) xMax = p.x
    if (p.y < yMin) yMin = p.y
    if (p.y > yMax) yMax = p.y
  }
  if (!Number.isFinite(xMin)) return
  if (xMin === xMax) { xMin -= 1; xMax += 1 }
  if (yMin === yMax) { yMin -= 1; yMax += 1 }
  const px = (xMax - xMin) * 0.08
  const py = (yMax - yMin) * 0.08
  xMin -= px; xMax += px; yMin -= py; yMax += py

  const xOf = (x) => padL + (x - xMin) / (xMax - xMin) * cw
  const yOf = (y) => padT + (1 - (y - yMin) / (yMax - yMin)) * ch

  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 1
  for (let i = 0; i <= 4; i++) {
    const y = padT + (i / 4) * ch
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + cw, y); ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.font = '10px ui-monospace, Menlo, monospace'
    const v = yMax - (i / 4) * (yMax - yMin)
    ctx.fillText(v.toFixed(1), 2, y + 4)
    const x = padL + (i / 4) * cw
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + ch); ctx.stroke()
    const xv = xMin + (i / 4) * (xMax - xMin)
    ctx.fillText(xv.toFixed(1), x - 8, h - 8)
  }

  // Axes labels
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = '10px ui-monospace, Menlo, monospace'
  if (opts.xLabel) ctx.fillText(opts.xLabel, padL + cw / 2 - 30, h - 2)
  if (opts.yLabel) ctx.fillText(opts.yLabel, padL - 30, padT + 8)

  const color = opts.color || '#a78bfa'
  if (opts.lines) {
    ctx.strokeStyle = color
    ctx.lineWidth = 1.2
    ctx.beginPath()
    for (let i = 0; i < data.length; i++) {
      const p = data[i]
      if (i === 0) ctx.moveTo(xOf(p.x), yOf(p.y))
      else ctx.lineTo(xOf(p.x), yOf(p.y))
    }
    ctx.stroke()
  } else {
    ctx.fillStyle = color
    for (const p of data) {
      ctx.beginPath()
      ctx.arc(xOf(p.x), yOf(p.y), 2, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

// Multi-series scatter — one colour per curve. Each curve is
// { points: [{x,y}], color }.
function drawMultiScatter(canvas, curves, opts = {}) {
  const P = prepCanvas(canvas)
  if (!P || !curves.length) return
  const { ctx, w, h } = P
  const padL = 40, padR = 8, padT = 8, padB = 26
  const cw = w - padL - padR
  const ch = h - padT - padB

  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity
  for (const c of curves) for (const p of c.points) {
    if (p.x < xMin) xMin = p.x
    if (p.x > xMax) xMax = p.x
    if (p.y < yMin) yMin = p.y
    if (p.y > yMax) yMax = p.y
  }
  if (!Number.isFinite(xMin)) return
  if (xMin === xMax) { xMin -= 1; xMax += 1 }
  if (yMin === yMax) { yMin -= 1; yMax += 1 }
  const px = (xMax - xMin) * 0.08
  const py = (yMax - yMin) * 0.08
  xMin -= px; xMax += px; yMin -= py; yMax += py

  const xOf = (x) => padL + (x - xMin) / (xMax - xMin) * cw
  const yOf = (y) => padT + (1 - (y - yMin) / (yMax - yMin)) * ch

  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 1
  for (let i = 0; i <= 4; i++) {
    const y = padT + (i / 4) * ch
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + cw, y); ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.font = '10px ui-monospace, Menlo, monospace'
    const v = yMax - (i / 4) * (yMax - yMin)
    ctx.fillText(v.toFixed(1), 2, y + 4)
    const x = padL + (i / 4) * cw
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + ch); ctx.stroke()
    const xv = xMin + (i / 4) * (xMax - xMin)
    ctx.fillText(xv.toFixed(1), x - 8, h - 8)
  }

  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = '10px ui-monospace, Menlo, monospace'
  if (opts.xLabel) ctx.fillText(opts.xLabel, padL + cw / 2 - 30, h - 2)
  if (opts.yLabel) ctx.fillText(opts.yLabel, padL - 30, padT + 8)

  for (const c of curves) {
    ctx.strokeStyle = c.color
    ctx.lineWidth = 1
    ctx.beginPath()
    // Break the polyline when θ wraps across ±π so we don't draw a
    // horizontal streak across the whole plot.
    let prev = null
    for (let i = 0; i < c.points.length; i++) {
      const p = c.points[i]
      if (prev && Math.abs(p.x - prev.x) > Math.PI) {
        ctx.moveTo(xOf(p.x), yOf(p.y))
      } else if (i === 0) {
        ctx.moveTo(xOf(p.x), yOf(p.y))
      } else {
        ctx.lineTo(xOf(p.x), yOf(p.y))
      }
      prev = p
    }
    ctx.stroke()
  }
}
