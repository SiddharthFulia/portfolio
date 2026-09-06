// Chernobyl RBMK-1000 Reactor Simulator.
//
// Point-kinetics with six delayed neutron groups, Bateman equations for
// the iodine → xenon-135 poison chain, Way–Wigner decay heat, and a
// reactivity balance that includes ρ_control, ρ_void, ρ_Doppler, and
// ρ_xenon. All the heavy compute happens on the backend — this page is
// the control room + telemetry visualisation.
//
// Endpoints consumed:
//   POST /api/chernobyl/simulate   →  { series, events, verdict }
//   POST /api/chernobyl/scenario/az5
//   GET  /api/chernobyl/scenarios
//
// Modeled after PhysicsLab.jsx and Pathfinding.jsx — luxe-glass panels,
// KaTeX equations, antd primitives, mobile-friendly stack under `md:`.

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Segmented, Switch, Tooltip, InputNumber } from 'antd'
import { Slider } from '../components/ui'
import {
  PlayCircleFilled, ReloadOutlined, WarningFilled, FireFilled,
  CloudServerOutlined, LoadingOutlined, InfoCircleOutlined,
  RadarChartOutlined, ExperimentOutlined,
} from '@ant-design/icons'
import katex from 'katex'

const BE_URL = import.meta.env.VITE_BE_URL || 'http://localhost:4001'

// ─── KaTeX helpers (same shape as PhysicsLab) ──────────────────
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

function Sym({ tex, help, className = '' }) {
  return (
    <Tooltip title={help} placement='top' overlayStyle={{ maxWidth: 340 }}>
      <span
        className={`katex-host inline-block cursor-help border-b border-dashed border-white/20 hover:border-amber-300/60 ${className}`}
        dangerouslySetInnerHTML={{ __html: renderTex(tex) }}
      />
    </Tooltip>
  )
}

// ─── Tooltip dictionary — plain-English explanations ───────────
const HELP = {
  n:           'n(t) — neutron population, proportional to fission rate. Reactor power P ∝ n(t).',
  C:           'Cᵢ — concentration of the i-th delayed-neutron precursor group. Six groups (i=1..6) with half-lives from ~55 s down to ~0.2 s.',
  Lambda:     'Λ — prompt neutron generation time. For an RBMK ≈ 10⁻³ s. Sets the pace of prompt-critical transients.',
  beta:       'β — total delayed-neutron fraction, β = Σβᵢ. For U-235 ≈ 0.0065. Reactivity is measured in units of β (dollars).',
  betai:      'βᵢ — delayed-neutron fraction of group i.',
  lambdai:    'λᵢ — decay constant of precursor group i.',
  rho:        'ρ — total reactivity. ρ > 0 → power rises. ρ = β → prompt critical → runaway. ρ in dollars = ρ/β.',
  rho_c:      'ρ_control — rod bank reactivity contribution. Rods in = negative (poison), rods out = positive. The infamous RBMK graphite tip briefly adds POSITIVE reactivity to the bottom of the core when a fully-withdrawn rod is re-inserted — the "positive scram" anomaly.',
  rho_v:      'ρ_void — steam-void reactivity coefficient. RBMK: POSITIVE. More steam → less water → LESS neutron absorption → MORE fission → more heat → more steam. Positive feedback loop.',
  rho_d:      'ρ_Doppler — fuel temperature reactivity. Hotter fuel → broader U-238 absorption resonance → NEGATIVE reactivity. The only fast negative feedback in RBMK. Weak, and outrun by ρ_void on step transients.',
  rho_x:      'ρ_xenon — Xe-135 neutron poison. Absorbs neutrons like a sponge. Builds up from I-135 decay after a shutdown → "xenon pit". Operators lifting rods to fight xenon poisoning is what left Chernobyl with almost no shutdown margin.',
  I:           'I-135 concentration. Fission product with a 6.6-hour half-life; decays to Xe-135.',
  X:           'Xe-135 concentration. Enormous thermal-neutron absorption cross-section (~2.6 million barns). The poison. Decays with a 9.2-hour half-life.',
  Tf:          'Fuel centreline temperature (°C). UO₂ pellet melts around 2800 °C — the meltdown line.',
  Tc:          'Coolant temperature (°C). Water boils at 100 °C at 1 atm; at RBMK pressure ~284 °C.',
  alpha:      'Void fraction α — steam volume / (steam + water). 0 = all water, 1 = dry channel.',
  W:           'W — coolant mass flow (kg/s). Low flow → more boiling → higher α → higher ρ_void.',
  P:           'Reactor thermal power (MW). RBMK-1000 nominal = 3200 MW_th ≈ 1000 MW_e.',
  rodpos:     '0 = rods FULLY INSERTED (max negative reactivity). 100 = FULLY WITHDRAWN. Above 90 % is the danger zone — the graphite displacer at the rod tip briefly adds POSITIVE reactivity when re-inserted. This is what killed Chernobyl on the AZ-5 SCRAM.',
  duration:   'Total simulated time in seconds. AZ-5 accident timeline was ~50 s from initiation to prompt criticality.',
  dt:         'Integrator step. RBMK point-kinetics is stiff (β/Λ ~ 6.5); dt = 0.01 s is safe, dt = 0.001 s for sharp SCRAM transients.',
  xenon0:     'Initial Xe-135 relative to equilibrium. 1.0 = steady-state at full power. Post-shutdown reaches ~3× before decaying (the "xenon pit").',
  az5:        'AZ-5 was the emergency shutdown button on the RBMK control desk. It drops ALL 211 control rods simultaneously. Because of the graphite tip, the FIRST second of insertion added positive reactivity throughout most of the core — igniting prompt criticality. At Chernobyl on 26 Apr 1986 01:23:40, operator Leonid Toptunov pressed AZ-5 to end the test. Within 4 seconds power went from ~200 MW to ~30,000 MW.',
  decay_heat: 'Way–Wigner decay heat law: P(t) / P₀ ≈ 0.066 · [t^-0.2 − (t + T)^-0.2] where T is the operating time. Even after SCRAM, a shut-down RBMK produces ~7 % of nominal power for hours from fission-product decay. This is why Fukushima melted.',
}

// ─── Downsample utility ────────────────────────────────────────
function downsample(arr, target) {
  if (!arr || arr.length <= target) return arr || []
  const step = arr.length / target
  const out = new Array(target)
  for (let i = 0; i < target; i++) out[i] = arr[Math.floor(i * step)]
  return out
}

// ─── Backend caller (bespoke — endpoints not in endpoints.js yet) ─
async function callSimulate(body, signal) {
  const res = await fetch(`${BE_URL}/api/chernobyl/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) {
    let msg = `Server returned ${res.status}`
    try { const j = await res.json(); if (j?.message) msg = j.message } catch {}
    const err = new Error(msg); err.status = res.status
    throw err
  }
  return res.json()
}

async function callAz5(body, signal) {
  const res = await fetch(`${BE_URL}/api/chernobyl/scenario/az5`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
    signal,
  })
  if (!res.ok) {
    let msg = `Server returned ${res.status}`
    try { const j = await res.json(); if (j?.message) msg = j.message } catch {}
    const err = new Error(msg); err.status = res.status
    throw err
  }
  return res.json()
}

async function fetchScenarios(signal) {
  const res = await fetch(`${BE_URL}/api/chernobyl/scenarios`, { signal })
  if (!res.ok) return null
  return res.json()
}

// ─── Preset scenarios (local UI-side; matches the BE presets) ──
const SCENARIOS = {
  nominal:   { label: 'Nominal',          rod: 60, flow: 8000, power: 3200, xenon: 1.0 },
  az5:       { label: 'AZ-5 SCRAM',       rod: 95, flow: 3800, power: 200,  xenon: 2.6 },
  xenon:     { label: 'Xenon transient',  rod: 75, flow: 8000, power: 3000, xenon: 2.8 },
  custom:    { label: 'Custom',           rod: 70, flow: 8000, power: 3200, xenon: 1.0 },
}

const MELT_LINE = 2800

// ─── Client-side lightweight fallback series ───────────────────
// Populates the charts before the BE responds so the UI never sits
// empty. Uses a coarse point-kinetics one-group approximation.
function fallbackSeries({ rod, flow, power, xenon, duration = 60, dt = 0.05 }) {
  const N = Math.max(64, Math.floor(duration / dt))
  const series = []
  let n = Math.max(1, power / 3200)
  const beta = 0.0065, Lambda = 1e-3, lam = 0.08
  let C = beta * n / (lam * Lambda)
  let Xe = xenon * 1e15
  let I = 1e15
  let Tf = 600 + power * 0.3
  let Tc = 285
  const events = []
  for (let i = 0; i < N; i++) {
    const t = i * dt
    // Rod tip effect if rod > 90 during first 3s (mimic AZ-5)
    const rodEffective = rod
    const rho_c = -0.005 * (100 - rodEffective) / 100 + (rodEffective > 90 && t < 3 ? 0.004 * (t / 3) : 0)
    const alpha = Math.min(0.9, Math.max(0, 0.15 + (n * 3200 / Math.max(1000, flow) - 0.4) * 0.6))
    const rho_v = 0.005 * alpha
    const rho_d = -1.5e-5 * (Tf - 600)
    const rho_x = -0.0025 * (Xe / 1e15)
    const rho = rho_c + rho_v + rho_d + rho_x
    const dn = ((rho - beta) / Lambda) * n + lam * C
    const dC = beta / Lambda * n - lam * C
    n = Math.max(1e-3, n + dn * dt)
    C = Math.max(0, C + dC * dt)
    // Xenon burnup + iodine chain
    const gammaI = 0.061, gammaX = 0.003, lI = 2.9e-5, lX = 2.1e-5
    const sigmaXe = 2.65e-22, phi = n * 3e14
    const dI = gammaI * n * 1e15 * 5e-6 - lI * I
    const dX = gammaX * n * 1e15 * 5e-6 + lI * I - lX * Xe - sigmaXe * phi * Xe
    I = Math.max(0, I + dI * dt)
    Xe = Math.max(0, Xe + dX * dt)
    Tf = Tf + (n * 3200 / 3200 * 800 - (Tf - Tc) * 0.02) * dt
    Tc = Tc + ((Tf - Tc) * 0.005 - Math.max(0, (Tc - 285)) * 0.02 * (flow / 8000)) * dt
    series.push({
      t,
      power: n * 3200,        // MW
      n,
      C,
      I,
      Xe,
      Tf,
      Tc,
      alpha,
      flow,
      rho,
      rho_c,
      rho_v,
      rho_d,
      rho_x,
    })
  }
  // Emit a couple of illustrative events for the timeline.
  if (rod > 90) events.push({ t: 2, severity: 'critical', text: 'Graphite tip inserts positive reactivity — prompt critical excursion.' })
  if (series.some(s => s.Tf > MELT_LINE)) events.push({ t: series.find(s => s.Tf > MELT_LINE).t, severity: 'critical', text: 'Fuel centreline exceeds 2800 °C — meltdown.' })
  const finalPower = series[series.length - 1].power
  const verdict = finalPower > 20000 ? 'meltdown' : finalPower > 6000 ? 'runaway' : 'stable'
  return { series, events, verdict, _fallback: true }
}

// ─── Reactor core canvas — rectangular fuel-channel grid ──────
// Grid of ~50 × 25 fuel channels (compact rectangular fit vs. the real
// RBMK's ~1661 hex-arranged channels). Renders live per-cell colours,
// neutron particles, control rods dropping from the top, and SCRAM event
// ticker overlay. Everything is drawn to a single <canvas> via
// requestAnimationFrame for perf — DOM would be far too slow for
// 1250 cells × ~500 particles.
//
// Cell state:
//   fresh   → blue      (U-235 rich, unburnt)
//   normal  → light grey (mixed, baseline U-238 dominated)
//   fission → red       (currently fissioning — recent event)
//   spent   → dark      (burnup complete, fission products dominate)
//   capture → hollow ring overlay (U-238 → U-239 → Np → Pu path)
//
// Physics-lite: neutron dots walk with random velocities, each traversal
// of a fresh cell has p ≈ fissionProbability of triggering a fission →
// recolour red + spawn 2 more neutrons + increment burnup counter. Cap
// at ~500 live neutrons for perf. Numbers are chosen to look right, not
// to be a full transport calculation.
const GRID_COLS = 50
const GRID_ROWS = 25
const MAX_PARTICLES = 500

function RectangularReactorGrid({ series, rodPos, tIdx, az5Fired, onEvent }) {
  const canvasRef = useRef(null)
  const stateRef = useRef(null)      // persistent cell + particle state
  const rafRef = useRef(0)
  const lastRodPosRef = useRef(rodPos)
  const eventCounterRef = useRef(0)
  const scramFlashRef = useRef(0)    // countdown frames for SCRAM banner

  // Initialise cell state once
  if (!stateRef.current) {
    const cells = new Array(GRID_COLS * GRID_ROWS)
    for (let i = 0; i < cells.length; i++) {
      // Radial distance from centre → higher enrichment near middle
      const cx = i % GRID_COLS, cy = Math.floor(i / GRID_COLS)
      const dx = (cx - GRID_COLS / 2) / (GRID_COLS / 2)
      const dy = (cy - GRID_ROWS / 2) / (GRID_ROWS / 2)
      const rr = Math.hypot(dx, dy)
      // Cell type: 0 fresh, 1 normal, 2 spent, 3 capture-marked
      let type = 1
      const roll = Math.random()
      if (rr < 0.5 && roll < 0.55) type = 0
      else if (rr > 0.85 && roll < 0.35) type = 2
      else if (roll < 0.05) type = 3
      cells[i] = {
        type,
        heat: 0,          // recent fission activity 0..1, decays over time
        burnup: type === 2 ? 0.9 : type === 0 ? 0 : 0.3, // 0 fresh → 1 spent
      }
    }
    stateRef.current = {
      cells,
      particles: [],
      neutronsAlive: 0,
      fissionsThisFrame: 0,
      cumFissions: 0,
      lastTs: performance.now(),
      lastSpawn: 0,
    }
  }

  // React to AZ-5 press: cascade a flash + slam rods
  useEffect(() => {
    if (az5Fired) {
      scramFlashRef.current = 90 // ~1.5s of banner
      eventCounterRef.current += 1
      if (onEvent) onEvent({ id: eventCounterRef.current, text: 'SCRAM', kind: 'critical' })
    }
  }, [az5Fired, onEvent])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      const parent = canvas.parentElement
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.min(parent.clientWidth, 1200)
      const h = Math.round(w * (GRID_ROWS / GRID_COLS))
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr
        canvas.height = h * dpr
        canvas.style.width = w + 'px'
        canvas.style.height = h + 'px'
      }
      return { w, h, dpr }
    }

    const step = () => {
      const dims = resize()
      if (!dims) return
      const { w, h, dpr } = dims
      const ctx = canvas.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const now = performance.now()
      const dt = Math.min(0.05, (now - stateRef.current.lastTs) / 1000)
      stateRef.current.lastTs = now

      // Compute current power for spawn rate
      const state = series && series[tIdx] ? series[tIdx] : null
      const power = state ? state.power : 3200
      const powerFrac = Math.max(0.02, Math.min(15, power / 3200))

      // Background
      ctx.fillStyle = '#05050a'
      ctx.fillRect(0, 0, w, h)

      // Cell layout
      const cellW = w / GRID_COLS
      const cellH = h / GRID_ROWS
      const cellR = Math.min(cellW, cellH) * 0.36

      const cells = stateRef.current.cells

      // Decay heat + burnup progression each frame
      // real burnup timescale is years — here we compress massively so
      // the user sees blue → red → grey → black in a demo session.
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i]
        c.heat *= Math.exp(-dt * 1.4)
        // High-flux fresh cells burn out
        if (c.type === 0 && powerFrac > 0.5) {
          c.burnup = Math.min(1, c.burnup + dt * 0.008 * powerFrac)
          if (c.burnup > 0.55) c.type = 1
          if (c.burnup > 0.9) c.type = 2
        } else if (c.type === 1 && powerFrac > 1.5) {
          c.burnup = Math.min(1, c.burnup + dt * 0.004 * powerFrac)
          if (c.burnup > 0.9) c.type = 2
        }
      }

      // Draw cells
      for (let cy = 0; cy < GRID_ROWS; cy++) {
        for (let cx = 0; cx < GRID_COLS; cx++) {
          const idx = cy * GRID_COLS + cx
          const c = cells[idx]
          const px = cx * cellW + cellW / 2
          const py = cy * cellH + cellH / 2
          let col
          if (c.heat > 0.15) {
            // Currently fissioning → red gradient with heat
            const h1 = Math.min(1, c.heat)
            col = `rgb(${Math.round(200 + 55 * h1)},${Math.round(60 * (1 - h1))},${Math.round(70 * (1 - h1))})`
          } else if (c.type === 0) {
            col = '#4a7dc9' // fresh blue
          } else if (c.type === 2) {
            col = '#1a1a22' // spent nearly black
          } else if (c.type === 3) {
            col = '#8b8b95' // capture site grey
          } else {
            col = '#6a6a75' // baseline grey
          }
          ctx.fillStyle = col
          ctx.beginPath()
          ctx.arc(px, py, cellR, 0, Math.PI * 2)
          ctx.fill()
          if (c.type === 3) {
            // hollow ring overlay = capture event
            ctx.strokeStyle = 'rgba(0,0,0,0.9)'
            ctx.lineWidth = 1.4
            ctx.beginPath()
            ctx.arc(px, py, cellR * 0.6, 0, Math.PI * 2)
            ctx.stroke()
          }
        }
      }

      // Control rods — 24 vertical bars evenly spaced across the top,
      // length ∝ (100 - rodPos)/100. On AZ-5 they slam down further.
      const insertion = 1 - rodPos / 100 // 0=out, 1=in
      const rodCount = 24
      const rodW = Math.max(3, cellW * 0.35)
      const rodStep = w / rodCount
      const rodLen = h * insertion
      ctx.fillStyle = 'rgba(15,15,20,0.92)'
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.lineWidth = 1
      for (let i = 0; i < rodCount; i++) {
        const rx = i * rodStep + rodStep / 2 - rodW / 2
        ctx.fillRect(rx, 0, rodW, rodLen)
        ctx.strokeRect(rx, 0, rodW, rodLen)
        // tip highlight (graphite displacer — the Chernobyl flaw)
        if (rodLen > 6 && rodPos > 5) {
          ctx.fillStyle = 'rgba(160, 100, 80, 0.85)' // graphite hue
          ctx.fillRect(rx, rodLen - 4, rodW, 4)
          ctx.fillStyle = 'rgba(15,15,20,0.92)'
        }
      }
      lastRodPosRef.current = rodPos

      // Particle system — spawn neutrons proportional to power
      // Each fission ~2.4 free neutrons; we throttle spawn to visual
      // density. Neutrons walk at fixed speed and randomly trigger
      // new fissions.
      const P = stateRef.current
      const spawnBudget = Math.min(50, Math.floor(powerFrac * 6))
      for (let s = 0; s < spawnBudget && P.particles.length < MAX_PARTICLES; s++) {
        // Spawn at a random fresh cell interior
        const idx = Math.floor(Math.random() * cells.length)
        if (cells[idx].type === 2) continue
        const cx = (idx % GRID_COLS) * cellW + cellW / 2
        const cy = Math.floor(idx / GRID_COLS) * cellH + cellH / 2
        const angle = Math.random() * Math.PI * 2
        const speed = 60 + Math.random() * 80
        P.particles.push({
          x: cx, y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.8 + Math.random() * 1.6,
        })
      }

      // Advance particles + check collisions with cells
      ctx.fillStyle = '#e0f2fe'
      const parts = P.particles
      let kept = 0
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i]
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.life -= dt
        if (p.life <= 0 || p.x < 0 || p.x > w || p.y < 0 || p.y > h) continue
        // Which cell is it in?
        const cx = Math.floor(p.x / cellW)
        const cy = Math.floor(p.y / cellH)
        if (cx >= 0 && cx < GRID_COLS && cy >= 0 && cy < GRID_ROWS) {
          const idx = cy * GRID_COLS + cx
          const c = cells[idx]
          // Fission probability depends on cell type + rod insertion damping
          const rodDamp = 1 - 0.85 * insertion
          let fp = 0
          if (c.type === 0) fp = 0.018 * rodDamp
          else if (c.type === 1) fp = 0.008 * rodDamp
          else if (c.type === 2) fp = 0.001 * rodDamp
          if (Math.random() < fp) {
            c.heat = Math.min(1, c.heat + 0.8)
            c.burnup = Math.min(1, c.burnup + 0.02)
            P.cumFissions++
            // Spawn 2 daughter neutrons
            for (let k = 0; k < 2 && parts.length + kept < MAX_PARTICLES; k++) {
              const a = Math.random() * Math.PI * 2
              const sp = 60 + Math.random() * 80
              parts.push({
                x: p.x, y: p.y,
                vx: Math.cos(a) * sp,
                vy: Math.sin(a) * sp,
                life: 0.8 + Math.random() * 1.5,
              })
            }
            // Emit a UI event on rare big events
            if ((P.cumFissions % 137) === 0 && onEvent) {
              eventCounterRef.current++
              onEvent({ id: eventCounterRef.current, text: `Fission burst · ${cx},${cy}`, kind: 'info' })
            }
            continue // absorbed — don't keep the incoming neutron
          }
        }
        parts[kept++] = p
      }
      parts.length = kept
      P.neutronsAlive = kept

      // Render surviving neutrons
      ctx.fillStyle = '#f0f9ff'
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i]
        ctx.fillRect(p.x - 1, p.y - 1, 2, 2)
      }

      // Grid border
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1)

      // Event ticker bottom-left (matches reference image)
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      ctx.font = '11px ui-monospace, Menlo, monospace'
      ctx.fillText(
        `Ch ${GRID_COLS}×${GRID_ROWS}=${GRID_COLS * GRID_ROWS}  ·  n=${P.neutronsAlive}  ·  fissions=${P.cumFissions}  ·  rod=${rodPos.toFixed(0)}%`,
        8, h - 8,
      )
      if (scramFlashRef.current > 0) {
        const a = Math.min(1, scramFlashRef.current / 45)
        ctx.fillStyle = `rgba(244,63,94,${0.9 * a})`
        ctx.font = 'bold 12px ui-monospace, Menlo, monospace'
        ctx.fillText(`Event ${eventCounterRef.current} SCRAM`, 8, h - 24)
        scramFlashRef.current--
      }

      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    const onResize = () => { /* resize handled per-frame */ }
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', onResize)
    }
  }, [series, tIdx, rodPos, onEvent])

  return (
    <div className='w-full' style={{ aspectRatio: `${GRID_COLS} / ${GRID_ROWS}` }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%', borderRadius: 12 }} />
    </div>
  )
}

// Legacy alias so tests referencing ReactorCore still resolve.
const ReactorCore = RectangularReactorGrid

// Flux → colour: dark → cyan → amber → red → white-hot.
function fluxColor(f) {
  const x = Math.max(0, Math.min(1, f / 3))
  if (x < 0.15) {
    // dark blue
    const t = x / 0.15
    const r = Math.round(6 + t * 6), g = Math.round(10 + t * 30), b = Math.round(20 + t * 80)
    return `rgb(${r},${g},${b})`
  } else if (x < 0.4) {
    const t = (x - 0.15) / 0.25
    const r = Math.round(12 + t * 20), g = Math.round(40 + t * 160), b = Math.round(100 + t * 130)
    return `rgb(${r},${g},${b})`
  } else if (x < 0.65) {
    const t = (x - 0.4) / 0.25
    const r = Math.round(32 + t * 220), g = Math.round(200 + t * 40), b = Math.round(230 - t * 200)
    return `rgb(${r},${g},${b})`
  } else if (x < 0.85) {
    const t = (x - 0.65) / 0.2
    const r = Math.round(252 - t * 20), g = Math.round(240 - t * 160), b = Math.round(30 - t * 20)
    return `rgb(${r},${g},${b})`
  } else {
    const t = Math.min(1, (x - 0.85) / 0.15)
    const r = Math.round(232 + t * 20), g = Math.round(80 + t * 175), b = Math.round(10 + t * 220)
    return `rgb(${r},${g},${b})`
  }
}

// ─── Chart drawing helpers (canvas 2D) ─────────────────────────
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

function axes(ctx, w, h, tMin, tMax, vMin, vMax, opts = {}) {
  const padL = opts.padL ?? 46, padR = opts.padR ?? 8, padT = opts.padT ?? 10, padB = opts.padB ?? 22
  const cw = w - padL - padR
  const ch = h - padT - padB
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 1
  ctx.font = '10px ui-monospace, Menlo, monospace'
  for (let i = 0; i <= 4; i++) {
    const y = padT + (i / 4) * ch
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + cw, y); ctx.stroke()
    const v = vMax - (i / 4) * (vMax - vMin)
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.fillText(formatNum(v), 2, y + 4)
  }
  for (let i = 0; i <= 4; i++) {
    const x = padL + (i / 4) * cw
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + ch); ctx.stroke()
    const t = tMin + (i / 4) * (tMax - tMin)
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.fillText(t.toFixed(1) + 's', x - 12, h - 6)
  }
  return { padL, padR, padT, padB, cw, ch, xOf: (t) => padL + (t - tMin) / (tMax - tMin || 1) * cw, yOf: (v) => padT + (1 - (v - vMin) / (vMax - vMin || 1)) * ch }
}

function formatNum(v) {
  if (!Number.isFinite(v)) return '—'
  const a = Math.abs(v)
  if (a >= 1e5 || (a > 0 && a < 1e-3)) return v.toExponential(1)
  if (a >= 1000) return v.toFixed(0)
  if (a >= 10) return v.toFixed(1)
  return v.toFixed(2)
}

function drawLineChart(canvas, data, series, opts = {}) {
  const P = prepCanvas(canvas)
  if (!P || !data.length) return
  const { ctx, w, h } = P
  const tMin = data[0].t, tMax = data[data.length - 1].t || (tMin + 1)
  let vMin = Infinity, vMax = -Infinity
  for (const p of data) for (const s of series) {
    let v = p[s.key]
    if (opts.log) v = v > 0 ? Math.log10(Math.max(1e-6, v)) : Math.log10(1e-6)
    if (v < vMin) vMin = v
    if (v > vMax) vMax = v
  }
  if (!Number.isFinite(vMin) || !Number.isFinite(vMax)) return
  if (vMin === vMax) { vMin -= 1; vMax += 1 }
  const pad = (vMax - vMin) * 0.08
  vMin -= pad; vMax += pad
  const A = axes(ctx, w, h, tMin, tMax, vMin, vMax)

  if (opts.hline != null) {
    const yv = opts.log && opts.hline > 0 ? Math.log10(opts.hline) : opts.hline
    if (yv >= vMin && yv <= vMax) {
      ctx.strokeStyle = 'rgba(244,63,94,0.6)'
      ctx.setLineDash([4, 4])
      ctx.beginPath(); ctx.moveTo(A.padL, A.yOf(yv)); ctx.lineTo(A.padL + A.cw, A.yOf(yv)); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(244,63,94,0.9)'
      ctx.font = '10px ui-monospace, Menlo, monospace'
      ctx.fillText(opts.hlineLabel || String(opts.hline), A.padL + A.cw - 60, A.yOf(yv) - 3)
    }
  }

  for (const s of series) {
    ctx.strokeStyle = s.color
    ctx.lineWidth = 1.8
    ctx.beginPath()
    for (let i = 0; i < data.length; i++) {
      const p = data[i]
      let v = p[s.key]
      if (opts.log) v = v > 0 ? Math.log10(Math.max(1e-6, v)) : Math.log10(1e-6)
      if (i === 0) ctx.moveTo(A.xOf(p.t), A.yOf(v))
      else ctx.lineTo(A.xOf(p.t), A.yOf(v))
    }
    ctx.stroke()
  }

  if (opts.yLabel) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '10px ui-monospace, Menlo, monospace'
    ctx.fillText(opts.yLabel, 4, 10)
  }
}

// Stacked area chart — for reactivity components. Positive AND negative
// contributions plotted symmetrically around zero so you can see the
// dangerous ρ_void running against ρ_control.
function drawStackedArea(canvas, data, series, opts = {}) {
  const P = prepCanvas(canvas)
  if (!P || !data.length) return
  const { ctx, w, h } = P
  const tMin = data[0].t, tMax = data[data.length - 1].t || (tMin + 1)
  // Find max magnitude across all components to set symmetric axis.
  let mag = 0
  for (const p of data) {
    let pos = 0, neg = 0
    for (const s of series) {
      const v = p[s.key] || 0
      if (v >= 0) pos += v; else neg += v
    }
    mag = Math.max(mag, Math.abs(pos), Math.abs(neg))
  }
  if (mag === 0) mag = 0.001
  const vMin = -mag * 1.15, vMax = mag * 1.15
  const A = axes(ctx, w, h, tMin, tMax, vMin, vMax)

  // Zero line
  ctx.strokeStyle = 'rgba(255,255,255,0.2)'
  ctx.setLineDash([3, 3])
  ctx.beginPath(); ctx.moveTo(A.padL, A.yOf(0)); ctx.lineTo(A.padL + A.cw, A.yOf(0)); ctx.stroke()
  ctx.setLineDash([])

  // Draw each component as its own filled ribbon anchored at 0. Not a
  // true "stack" but easier to read for +/- reactivity balance.
  for (const s of series) {
    ctx.fillStyle = s.color + '55'
    ctx.strokeStyle = s.color
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(A.xOf(data[0].t), A.yOf(0))
    for (const p of data) ctx.lineTo(A.xOf(p.t), A.yOf(p[s.key] || 0))
    ctx.lineTo(A.xOf(data[data.length - 1].t), A.yOf(0))
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
  if (opts.yLabel) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '10px ui-monospace, Menlo, monospace'
    ctx.fillText(opts.yLabel, 4, 10)
  }
}

// Dual-axis time chart (Tf on left, Tc on right).
function drawDualAxis(canvas, data, opts = {}) {
  const P = prepCanvas(canvas)
  if (!P || !data.length) return
  const { ctx, w, h } = P
  const tMin = data[0].t, tMax = data[data.length - 1].t || (tMin + 1)
  let lMin = Infinity, lMax = -Infinity, rMin = Infinity, rMax = -Infinity
  for (const p of data) {
    const lv = p[opts.leftKey], rv = p[opts.rightKey]
    if (lv < lMin) lMin = lv; if (lv > lMax) lMax = lv
    if (rv < rMin) rMin = rv; if (rv > rMax) rMax = rv
  }
  if (!Number.isFinite(lMin)) return
  if (lMin === lMax) { lMin -= 1; lMax += 1 }
  if (rMin === rMax) { rMin -= 1; rMax += 1 }
  // include meltdown line
  if (opts.leftHLine != null) lMax = Math.max(lMax, opts.leftHLine * 1.05)
  const padL = 46, padR = 40, padT = 10, padB = 22
  const cw = w - padL - padR, ch = h - padT - padB
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 1
  ctx.font = '10px ui-monospace, Menlo, monospace'
  for (let i = 0; i <= 4; i++) {
    const y = padT + (i / 4) * ch
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + cw, y); ctx.stroke()
    const lv = lMax - (i / 4) * (lMax - lMin)
    const rv = rMax - (i / 4) * (rMax - rMin)
    ctx.fillStyle = 'rgba(251,191,36,0.7)'
    ctx.fillText(formatNum(lv), 2, y + 4)
    ctx.fillStyle = 'rgba(34,211,238,0.7)'
    ctx.fillText(formatNum(rv), padL + cw + 3, y + 4)
  }
  for (let i = 0; i <= 4; i++) {
    const x = padL + (i / 4) * cw
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + ch); ctx.stroke()
    const t = tMin + (i / 4) * (tMax - tMin)
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.fillText(t.toFixed(1) + 's', x - 12, h - 6)
  }
  const yL = (v) => padT + (1 - (v - lMin) / (lMax - lMin || 1)) * ch
  const yR = (v) => padT + (1 - (v - rMin) / (rMax - rMin || 1)) * ch
  const xOf = (t) => padL + (t - tMin) / (tMax - tMin || 1) * cw

  // Meltdown line
  if (opts.leftHLine != null && opts.leftHLine >= lMin && opts.leftHLine <= lMax) {
    ctx.strokeStyle = 'rgba(244,63,94,0.7)'
    ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(padL, yL(opts.leftHLine)); ctx.lineTo(padL + cw, yL(opts.leftHLine)); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(244,63,94,0.9)'
    ctx.fillText(`UO₂ melt · ${opts.leftHLine} °C`, padL + cw - 100, yL(opts.leftHLine) - 3)
  }

  // Left line (fuel)
  ctx.strokeStyle = '#fbbf24'
  ctx.lineWidth = 1.8
  ctx.beginPath()
  for (let i = 0; i < data.length; i++) {
    const p = data[i]
    if (i === 0) ctx.moveTo(xOf(p.t), yL(p[opts.leftKey]))
    else ctx.lineTo(xOf(p.t), yL(p[opts.leftKey]))
  }
  ctx.stroke()

  // Right line (coolant)
  ctx.strokeStyle = '#22d3ee'
  ctx.lineWidth = 1.8
  ctx.beginPath()
  for (let i = 0; i < data.length; i++) {
    const p = data[i]
    if (i === 0) ctx.moveTo(xOf(p.t), yR(p[opts.rightKey]))
    else ctx.lineTo(xOf(p.t), yR(p[opts.rightKey]))
  }
  ctx.stroke()
}

// ─── Helper text under each control ─────────────────────────────
function FieldHelp({ children }) {
  return <p className='text-[11px] text-fg-muted mt-1 leading-snug'>{children}</p>
}

// ─── Material accounting — nuclear inventory calculator ────────
// Numbers below are real:
//   • RBMK-1000 fuel load ≈ 190 t UO₂ (~114 t U) enriched to 2 % U-235
//     → initial U-235 ≈ 2280 kg fissile.
//   • Each fission ≈ 200 MeV = 3.204 × 10⁻¹¹ J.
//   • Fission products: I-135 (γ_I ≈ 6.1 %), Xe-135 (γ_X ≈ 0.3 % direct, most from I-135 β-decay),
//     Cs-137 (γ ≈ 6.2 %, t½ 30.17 y), Sr-90 (γ ≈ 5.8 %, t½ 28.79 y), I-131 (γ ≈ 2.9 %, t½ 8.02 d).
//   • Pu-239 breeding: U-238 (n,γ) → U-239 (β⁻, 23.5 min) → Np-239 (β⁻, 2.36 d) → Pu-239.
//   • Reference: IAEA-TECDOC-1250, and Kessler "Sustainable and Safe Nuclear Fission Energy".
function materialInventory(series) {
  const initialU235 = 2280 // kg
  const initialU238 = 111720 // kg (114 t U minus ~2 % U-235)
  if (!series || series.length === 0) {
    return {
      u235: initialU235, u238: initialU238, pu239: 0,
      xe135: 0, i131: 0, cs137: 0, sr90: 0,
      cumEnergyMJ: 0, cumFissions: 0,
    }
  }
  // Integrate fission rate over the time series.
  // fissions/s ≈ Power(MW) × 10⁶ / (200 MeV × 1.602e-13 J/MeV) = P × 3.12e16
  let cumFissions = 0, cumEnergyJ = 0
  for (let i = 1; i < series.length; i++) {
    const cur = series[i] || {}
    const prv = series[i - 1] || {}
    const dt  = (cur.t     ?? 0) - (prv.t ?? 0)
    const pw  = cur.power  ?? cur.power_MW ?? 0
    const fr  = pw * 3.12e16
    cumFissions += fr * dt
    cumEnergyJ  += pw * 1e6 * dt
  }
  const molsFissioned = cumFissions / 6.022e23
  // Each U-235 atom weighs 235 g/mol
  const u235Consumed = molsFissioned * 235 // g
  // Yields — grams produced per fission product
  const cs137 = molsFissioned * 137 * 0.062          // g
  const sr90  = molsFissioned * 90 * 0.058           // g
  const i131  = molsFissioned * 131 * 0.029          // g
  const xe135 = molsFissioned * 135 * 0.064          // g (I-135 → Xe-135)
  // Pu-239 breeding: capture rate ≈ 0.8 × fission rate for RBMK spectrum
  const pu239 = (cumFissions * 0.8 / 6.022e23) * 239 // g
  return {
    u235: Math.max(0, initialU235 - u235Consumed / 1000), // kg
    u238: Math.max(0, initialU238 - (cumFissions * 0.8 / 6.022e23) * 238 / 1000), // kg
    pu239: pu239 / 1000, // kg
    xe135, i131, cs137, sr90,
    cumEnergyMJ: cumEnergyJ / 1e6,
    cumFissions,
  }
}

function MaterialAccountingPanel({ series, last }) {
  const inv = useMemo(() => materialInventory(series), [series])
  // Dose rate approximation — geometric mean of prompt γ + fission-product γ,
  // scaled by power fraction. Realistic reactor-vessel-wall dose rates.
  const rawPower  = Number.isFinite(last?.power) ? last.power : 0
  const powerFrac = rawPower / 3200
  const doseGamma = Math.max(0.0001, powerFrac * 12)          // Sv/h at 1 m
  const doseBeta  = Math.max(0.00005, powerFrac * 3.5)
  const doseAlpha = Math.max(0.00001, powerFrac * 0.02)
  const doseNeutron = Math.max(0.00002, powerFrac * 6)
  // Everything below reads inv.* → wrap with ?? 0 in case a future materialInventory
  // rework returns undefined for a key.
  const safe = (x) => Number.isFinite(x) ? x : 0

  return (
    <div className='luxe-glass p-4'>
      <p className='eyebrow-mono font-bold mb-3 text-amber-300/80 flex items-center gap-2'>
        <ExperimentOutlined /> — Fuel inventory · energy · radiation
        <Tooltip title='RBMK-1000 fuel load ≈ 190 t of UO₂ (~114 t uranium) enriched to 2 % U-235. Panel integrates cumulative fission events using instantaneous power × 3.12 × 10¹⁶ fissions/MW/s. Fission-product yields and Pu breeding factors are real (IAEA-TECDOC-1250).'>
          <InfoCircleOutlined className='text-fg-muted text-[10px]' />
        </Tooltip>
      </p>
      <div className='grid grid-cols-2 lg:grid-cols-4 gap-3 text-[11px] font-mono'>
        <InvCell label='U-235 remaining' value={`${safe(inv.u235).toFixed(1)} kg`}   c='text-cyan-300'   note='fissile inventory' />
        <InvCell label='U-238 remaining' value={`${safe(inv.u238).toFixed(0)} kg`}   c='text-cyan-200'   note='fertile bulk' />
        <InvCell label='Pu-239 bred'     value={`${safe(inv.pu239).toFixed(3)} kg`}  c='text-fuchsia-300' note='(n,γ) chain' />
        <InvCell label='Xe-135'          value={`${safe(inv.xe135).toFixed(1)} g`}   c='text-violet-300' note='neutron poison' />
        <InvCell label='I-131'           value={`${safe(inv.i131).toFixed(1)} g`}    c='text-amber-300'  note='t½ 8.02 d' />
        <InvCell label='Cs-137'          value={`${safe(inv.cs137).toFixed(1)} g`}   c='text-rose-300'   note='t½ 30.17 y' />
        <InvCell label='Sr-90'           value={`${safe(inv.sr90).toFixed(1)} g`}    c='text-orange-300' note='t½ 28.79 y' />
        <InvCell label='Energy released' value={`${(safe(inv.cumEnergyMJ)/3600).toFixed(2)} MWh`} c='text-emerald-300' note={`${safe(inv.cumEnergyMJ).toFixed(0)} MJ`} />
      </div>

      <div className='mt-4 grid grid-cols-1 md:grid-cols-2 gap-3'>
        <div>
          <p className='eyebrow-mono font-bold mb-1 text-rose-300/80 text-[11px]'>Radiation output (dose rate @ 1 m, log scale)</p>
          <DoseBar label='α'   sv={doseAlpha}   c='#fbbf24' help='Alpha — Helium nuclei. Stopped by paper. Deadly if inhaled/ingested.' />
          <DoseBar label='β⁻'  sv={doseBeta}    c='#a78bfa' help='Beta — high-energy electrons. Stopped by aluminium foil / plastic.' />
          <DoseBar label='γ'   sv={doseGamma}   c='#22d3ee' help='Gamma — high-energy photons. Need lead / concrete. Cs-137 line: 662 keV.' />
          <DoseBar label='n⁰'  sv={doseNeutron} c='#f472b6' help='Neutrons — deeply penetrating. Best moderated/absorbed by hydrogen (water, polyethylene, borated concrete).' />
          <p className='text-[10px] text-fg-muted mt-1 leading-snug'>
            Total ≈ {(doseAlpha + doseBeta + doseGamma + doseNeutron).toFixed(2)} Sv/h.
            <span className='text-rose-300'> Lethal dose (LD-50) is 4.5 Sv acute whole-body.</span>
          </p>
        </div>
        <div>
          <p className='eyebrow-mono font-bold mb-1 text-emerald-300/80 text-[11px]'>Energy accounting</p>
          <div className='text-[11px] leading-snug text-fg-muted space-y-1'>
            <p>Each fission liberates <b className='text-amber-300'>≈ 200 MeV</b> = 3.204 × 10⁻¹¹ J.</p>
            <p>Fission rate: {(rawPower * 3.12e16).toExponential(2)} fissions/s at current power.</p>
            <p>Cumulative fissions: <b className='text-cyan-300'>{safe(inv.cumFissions).toExponential(2)}</b></p>
            <p>Cumulative energy: <b className='text-emerald-300'>{safe(inv.cumEnergyMJ).toFixed(1)} MJ</b> ≈ <b>{(safe(inv.cumEnergyMJ)/3600).toFixed(2)} MWh</b>.</p>
            <p className='text-[10px] italic'>By comparison, the AZ-5 excursion released roughly 60 GJ of extra thermal energy in 4 seconds — enough to vaporise the fuel.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function InvCell({ label, value, c, note }) {
  return (
    <div className='rounded-md border border-white/5 bg-black/30 px-2.5 py-2'>
      <div className='text-[10px] text-fg-muted uppercase tracking-wide'>{label}</div>
      <div className={`text-[15px] ${c || 'text-fg-primary'} leading-tight`}>{value}</div>
      {note && <div className='text-[9px] text-fg-dim mt-0.5'>{note}</div>}
    </div>
  )
}

function DoseBar({ label, sv, c, help }) {
  // Log scale 1e-4 .. 1e3 Sv/h
  const logMin = -4, logMax = 3
  const l = Math.max(logMin, Math.min(logMax, Math.log10(sv)))
  const pct = ((l - logMin) / (logMax - logMin)) * 100
  return (
    <div className='mb-1.5'>
      <div className='flex items-center justify-between text-[10px] font-mono'>
        <Tooltip title={help}>
          <span className='text-fg-muted cursor-help border-b border-dashed border-white/10'>{label}</span>
        </Tooltip>
        <span style={{ color: c }}>{sv.toFixed(4)} Sv/h</span>
      </div>
      <div className='w-full h-1.5 bg-white/5 rounded overflow-hidden mt-0.5'>
        <div className='h-full' style={{ width: `${pct}%`, background: c }} />
      </div>
    </div>
  )
}

// ─── Radiation-type explainer sidebar ──────────────────────────
function RadiationExplainer() {
  const [material, setMaterial] = useState('paper')
  const [ray, setRay] = useState('alpha')
  // Stopping matrix: does material X stop radiation Y?
  // Rows: paper / aluminium / lead / concrete-1m
  const STOPS = {
    paper:    { alpha: 'stops',   beta: 'passes',  gamma: 'passes', neutron: 'passes' },
    aluminium:{ alpha: 'stops',   beta: 'stops',   gamma: 'passes', neutron: 'passes' },
    lead:     { alpha: 'stops',   beta: 'stops',   gamma: 'stops',  neutron: 'partial' },
    concrete: { alpha: 'stops',   beta: 'stops',   gamma: 'stops',  neutron: 'stops' },
  }
  // Defensive: if some future Segmented picks an unknown value, keep the
  // panel from crashing — default to `passes` so the UI still tells a story.
  const stopsResult = STOPS[material]?.[ray] || 'passes'

  return (
    <div className='luxe-glass p-4'>
      <p className='eyebrow-mono font-bold mb-3 text-cyan-300/80 flex items-center gap-2'>
        <RadarChartOutlined /> — Radiation types · reference
        <Tooltip title='Alpha, beta, gamma, and neutron radiation differ enormously in charge, mass, and penetrating power. This is why shielding design matters — one shield does not stop every ray.'>
          <InfoCircleOutlined className='text-fg-muted text-[10px]' />
        </Tooltip>
      </p>

      <div className='space-y-3 text-[12px] leading-relaxed'>
        <RadRow
          swatch='#fbbf24'
          title='Alpha (⁴₂He)'
          detail='A helium nucleus — 2 protons + 2 neutrons, +2e charge. Massive, slow, ionising. Stopped by paper or 3 cm of air. Deadly if inhaled/ingested (Po-210 case).'
          eq={String.raw`{}^A_Z X \rightarrow {}^{A-4}_{Z-2}Y + {}^{4}_{2}\text{He} + Q_\alpha`}
        />
        <RadRow
          swatch='#a78bfa'
          title='Beta⁻ (e⁻ + ν̄_e)'
          detail={<>A neutron converts to a proton via the weak force, emitting an electron and antineutrino. Stopped by aluminium foil / plastic.</>}
          eq={String.raw`n \rightarrow p^+ + e^- + \bar{\nu}_e`}
          feynman
        />
        <RadRow
          swatch='#22d3ee'
          title='Gamma (γ)'
          detail={<>A photon emitted when an excited nucleus drops to a lower state. Chernobyl γ-lines: <b className='text-amber-300'>Cs-137 at 662 keV</b>, <b className='text-amber-300'>Co-60 at 1.17 & 1.33 MeV</b>. Needs lead or concrete to stop.</>}
          eq={String.raw`E_\gamma = E_i - E_f`}
        />
        <RadRow
          swatch='#f472b6'
          title='Neutrons'
          detail={<>Neutral, no ionising charge — penetrate deeply until they hit a hydrogen nucleus (moderated by water, polyethylene, borated concrete). Cause secondary <b>activation</b> — turn stable materials radioactive.</>}
          eq={String.raw`\sigma_a(E) \propto 1/\sqrt{E}\quad \text{(1/v law, thermal)}`}
        />
      </div>

      <div className='mt-4 border-t border-white/5 pt-3'>
        <p className='eyebrow-mono font-bold mb-2 text-rose-300/80'>Interactive · stop the ray</p>
        <div className='grid grid-cols-2 gap-2 text-[11px]'>
          <div>
            <div className='text-fg-muted mb-1'>Shield material</div>
            <Segmented size='small' value={material} onChange={setMaterial} block
              options={[
                { label: 'Paper',     value: 'paper' },
                { label: 'Aluminium', value: 'aluminium' },
                { label: 'Lead',      value: 'lead' },
                { label: 'Concrete',  value: 'concrete' },
              ]} />
          </div>
          <div>
            <div className='text-fg-muted mb-1'>Radiation type</div>
            <Segmented size='small' value={ray} onChange={setRay} block
              options={[
                { label: 'α',   value: 'alpha' },
                { label: 'β⁻',  value: 'beta' },
                { label: 'γ',   value: 'gamma' },
                { label: 'n⁰',  value: 'neutron' },
              ]} />
          </div>
        </div>
        <div className={`mt-3 rounded border px-3 py-2 text-[12px] font-mono
                         ${stopsResult === 'stops'   ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                         : stopsResult === 'partial' ? 'border-amber-500/40   bg-amber-500/10   text-amber-200'
                                                     : 'border-rose-500/40    bg-rose-500/10    text-rose-200'}`}>
          {stopsResult === 'stops'   && `✓  ${label(material)} stops ${label(ray)}.`}
          {stopsResult === 'partial' && `~  ${label(material)} partially attenuates ${label(ray)} — additional shielding recommended.`}
          {stopsResult === 'passes'  && `✗  ${label(ray)} passes through ${label(material)}. Choose a denser or hydrogen-rich shield.`}
        </div>
      </div>
    </div>
  )
}

function label(k) {
  const m = { paper: 'Paper', aluminium: 'Aluminium', lead: 'Lead', concrete: 'Concrete',
              alpha: 'α particles', beta: 'β⁻ particles', gamma: 'γ photons', neutron: 'neutrons' }
  return m[k] || k
}

function RadRow({ swatch, title, detail, eq, feynman }) {
  return (
    <div className='flex gap-2.5'>
      <span className='shrink-0 mt-1 w-2 h-2 rounded-full' style={{ background: swatch }} />
      <div className='min-w-0'>
        <div className='text-fg-primary font-bold'>{title}</div>
        <div className='text-fg-muted text-[11px] leading-snug'>{detail}</div>
        <div className='mt-1'><Tex src={eq} /></div>
        {feynman && (
          <svg width='140' height='60' className='mt-1 opacity-80' viewBox='0 0 140 60'>
            <line x1='10' y1='10' x2='70' y2='30' stroke='#22d3ee' strokeWidth='1.5' />
            <line x1='70' y1='30' x2='130' y2='10' stroke='#f472b6' strokeWidth='1.5' />
            <line x1='70' y1='30' x2='130' y2='30' stroke='#fbbf24' strokeWidth='1.5' strokeDasharray='3 2' />
            <line x1='70' y1='30' x2='130' y2='50' stroke='#a78bfa' strokeWidth='1.5' strokeDasharray='1 3' />
            <text x='4' y='9' fill='#22d3ee' fontSize='9' fontFamily='ui-monospace'>n</text>
            <text x='132' y='9' fill='#f472b6' fontSize='9' fontFamily='ui-monospace'>p</text>
            <text x='132' y='33' fill='#fbbf24' fontSize='9' fontFamily='ui-monospace'>e⁻</text>
            <text x='132' y='55' fill='#a78bfa' fontSize='9' fontFamily='ui-monospace'>ν̄</text>
            <text x='55' y='45' fill='#fff8' fontSize='8' fontFamily='ui-monospace'>W⁻</text>
          </svg>
        )}
      </div>
    </div>
  )
}

// ─── Fission event breakdown — mass yield + energy split ───────
// Yield curve: real U-235(n,f) mass-yield distribution has two humps
// centred at A≈95 and A≈137. Values below approximate the ENDF-B/VIII.0
// evaluated data (log yield vs mass number).
function FissionYieldChart({ height = 140 }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = parent.clientWidth, h = height
    canvas.width = w * dpr; canvas.height = h * dpr
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px'
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    // Camel-hump curve: two Gaussians centred at A=95, 137, plus valley.
    const gauss = (a, mu, sigma) => Math.exp(-((a - mu) ** 2) / (2 * sigma ** 2))
    const yieldAt = a => 6.5 * gauss(a, 95, 6) + 6.2 * gauss(a, 137, 6) + 0.02 * gauss(a, 118, 8)

    const padL = 30, padR = 8, padT = 8, padB = 20
    const cw = w - padL - padR, ch = h - padT - padB
    const aMin = 70, aMax = 165
    const yMax = 7

    // Axes
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = padT + (i / 4) * ch
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + cw, y); ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.font = '9px ui-monospace, Menlo, monospace'
      ctx.fillText((yMax - (i / 4) * yMax).toFixed(0) + '%', 2, y + 3)
    }
    for (let a = 80; a <= 160; a += 20) {
      const x = padL + (a - aMin) / (aMax - aMin) * cw
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.fillText(`A=${a}`, x - 12, h - 6)
    }

    // Curve fill
    const grd = ctx.createLinearGradient(0, padT, 0, padT + ch)
    grd.addColorStop(0, 'rgba(251,191,36,0.6)')
    grd.addColorStop(1, 'rgba(251,191,36,0.05)')
    ctx.fillStyle = grd
    ctx.beginPath()
    ctx.moveTo(padL, padT + ch)
    for (let a = aMin; a <= aMax; a += 0.5) {
      const y = yieldAt(a)
      const px = padL + (a - aMin) / (aMax - aMin) * cw
      const py = padT + (1 - y / yMax) * ch
      ctx.lineTo(px, py)
    }
    ctx.lineTo(padL + cw, padT + ch)
    ctx.closePath(); ctx.fill()

    // Stroke
    ctx.strokeStyle = '#f472b6'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let a = aMin; a <= aMax; a += 0.5) {
      const y = yieldAt(a)
      const px = padL + (a - aMin) / (aMax - aMin) * cw
      const py = padT + (1 - y / yMax) * ch
      if (a === aMin) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    }
    ctx.stroke()

    // Highlight Kr-92 & Ba-141 canonical pair
    const mark = (a, colour, lbl) => {
      const x = padL + (a - aMin) / (aMax - aMin) * cw
      const y = padT + (1 - yieldAt(a) / yMax) * ch
      ctx.fillStyle = colour
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.font = '9px ui-monospace, Menlo, monospace'
      ctx.fillText(lbl, x - 15, y - 6)
    }
    mark(92, '#22d3ee', 'Kr-92')
    mark(141, '#f472b6', 'Ba-141')
  }, [height])
  return <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height }} />
}

function FissionBreakdownPanel() {
  // Prompt / delayed energy split for U-235 fission — standard values.
  // Total ~200 MeV, ~10 MeV escape as antineutrinos.
  const parts = [
    { label: 'KE of fission fragments',  mev: 168, c: '#fbbf24' },
    { label: 'Prompt γ',                 mev: 7,   c: '#22d3ee' },
    { label: 'Prompt neutrons KE',       mev: 5,   c: '#a78bfa' },
    { label: 'Delayed β⁻',               mev: 8,   c: '#4ade80' },
    { label: 'Delayed γ',                mev: 7,   c: '#f472b6' },
    { label: 'Antineutrinos (escape)',   mev: 10,  c: '#94a3b8' },
  ]
  const total = parts.reduce((a, b) => a + b.mev, 0)
  return (
    <div className='luxe-glass p-4'>
      <p className='eyebrow-mono font-bold mb-3 text-fuchsia-300/80 flex items-center gap-2'>
        <ExperimentOutlined /> — Fission event · U-235 (n,f)
        <Tooltip title='Canonical U-235 thermal-neutron fission. On average each event yields two mid-mass daughters and ν ≈ 2.42 free neutrons — the multiplication factor that runs a reactor.'>
          <InfoCircleOutlined className='text-fg-muted text-[10px]' />
        </Tooltip>
      </p>
      <div className='text-[12px] leading-relaxed mb-2'>
        <Tex display src={String.raw`{}^{235}_{92}U + n \rightarrow {}^{92}_{36}Kr + {}^{141}_{56}Ba + 3n + \sim 200\ \text{MeV}`} />
        <p className='text-fg-muted mt-1'>
          The <b className='text-amber-300'>Kr-92 + Ba-141</b> pair is the canonical example — but any pair on the mass-yield curve is possible.
          Average ν ≈ 2.42 prompt neutrons per fission. Delayed neutrons follow the six-group precursor decay.
        </p>
      </div>

      <p className='eyebrow-mono font-bold mb-1 text-amber-300/80 text-[11px]'>Mass-yield distribution (camel hump)</p>
      <FissionYieldChart height={140} />
      <p className='text-[10px] text-fg-muted mt-1'>Two peaks at A ≈ 95 and A ≈ 137; symmetric fission (A ≈ 118) is ~600× less likely.</p>

      <p className='eyebrow-mono font-bold mt-3 mb-1 text-emerald-300/80 text-[11px]'>Energy release breakdown (per fission)</p>
      <div className='space-y-1.5'>
        {parts.map((p, i) => (
          <div key={i}>
            <div className='flex items-center justify-between text-[10px] font-mono'>
              <span className='text-fg-muted'>{p.label}</span>
              <span style={{ color: p.c }}>{p.mev} MeV</span>
            </div>
            <div className='w-full h-2 bg-white/5 rounded overflow-hidden'>
              <div className='h-full' style={{ width: `${(p.mev / total) * 100}%`, background: p.c }} />
            </div>
          </div>
        ))}
      </div>
      <p className='text-[10px] text-fg-muted mt-2'>
        Total ≈ <b className='text-amber-300'>{total} MeV</b> = 3.2 × 10⁻¹¹ J.
        The 10 MeV in antineutrinos escapes the shielding entirely — the reason reactor thermal output is ~190 MeV recoverable per fission, not 200.
      </p>
    </div>
  )
}

// ─── Fuel burnup timeline — small blue → red → grey → black card ─
function FuelBurnupCard() {
  const stages = [
    { c: '#4a7dc9', l: 'Fresh',    d: 'U-235 rich, ~2 % enrichment. Blue in the grid. High neutron economy.' },
    { c: '#ef4444', l: 'Fissioning', d: 'Peak burn. Cell glows red as prompt fissions occur.' },
    { c: '#6a6a75', l: 'Baseline', d: 'Burnup 30–70 %. Grey. Xe-135 begins competing for neutrons.' },
    { c: '#1a1a22', l: 'Spent',    d: 'Burnup >90 %. Nearly black. Fission-product decay heat dominates.' },
  ]
  return (
    <div className='luxe-glass p-4'>
      <p className='eyebrow-mono font-bold mb-3 text-cyan-300/80 flex items-center gap-2'>
        <FireFilled /> — Fuel burnup lifecycle
        <Tooltip title='RBMK fuel cycles for ~3 years at typical burnup 20 MWd/kg U. Each fresh assembly starts blue in the grid, glows red as it fissions, fades to grey as fission products (Xe, Cs, Sr, I) accumulate, and ends nearly black when discharged for reprocessing.'>
          <InfoCircleOutlined className='text-fg-muted text-[10px]' />
        </Tooltip>
      </p>
      <div className='grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]'>
        {stages.map((s, i) => (
          <div key={i} className='rounded-md border border-white/5 bg-black/30 p-2'>
            <div className='flex items-center gap-2 mb-1'>
              <span className='inline-block w-3 h-3 rounded-full' style={{ background: s.c }} />
              <span className='font-mono text-fg-primary'>{s.l}</span>
            </div>
            <p className='text-fg-muted leading-snug'>{s.d}</p>
          </div>
        ))}
      </div>
      <p className='text-[10px] text-fg-muted mt-2'>Watch the grid — high-power runs accelerate the compressed burnup timeline so you can see the colour march in seconds.</p>
    </div>
  )
}

// ─── The page ───────────────────────────────────────────────────
export default function Chernobyl() {
  useEffect(() => { document.title = 'Chernobyl RBMK · Sid' }, [])

  // Scenario preset — snaps sliders to preset values.
  const [scenario, setScenario] = useState('nominal')

  const [rod, setRod]           = useState(60)
  const [flow, setFlow]         = useState(8000)
  const [powerSet, setPowerSet] = useState(3200)
  const [xenon0, setXenon0]     = useState(1.0)
  const [duration, setDuration] = useState(60)
  const [dt, setDt]             = useState(0.05)

  // Snap sliders when scenario changes.
  useEffect(() => {
    const s = SCENARIOS[scenario]
    if (!s || scenario === 'custom') return
    setRod(s.rod); setFlow(s.flow); setPowerSet(s.power); setXenon0(s.xenon)
  }, [scenario])

  // Series + events + verdict
  const [data, setData] = useState(() => fallbackSeries({ rod: 60, flow: 8000, power: 3200, xenon: 1.0, duration: 60, dt: 0.05 }))
  const [beLoading, setBeLoading] = useState(false)
  const [beError, setBeError]     = useState('')
  const [az5Fired, setAz5Fired]   = useState(false)

  // Live event ticker from the RectangularReactorGrid — SCRAM, fission bursts.
  // Kept short (last 6) so it always renders in-viewport.
  const [gridEvents, setGridEvents] = useState([])
  const onGridEvent = useCallback((ev) => {
    setGridEvents(prev => [ev, ...prev].slice(0, 6))
  }, [])

  // Recompute the local fallback on any slider change so charts move.
  useEffect(() => {
    if (beLoading) return
    setData(prev => (prev && !prev._fallback ? prev : fallbackSeries({ rod, flow, power: powerSet, xenon: xenon0, duration, dt })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rod, flow, powerSet, xenon0, duration, dt])

  // Fetch scenario list (informational only).
  useEffect(() => {
    const ac = new AbortController()
    fetchScenarios(ac.signal).catch(() => {})
    return () => ac.abort()
  }, [])

  const runOnServer = useCallback(async () => {
    setBeError('')
    setBeLoading(true)
    try {
      const body = {
        rod, flow, power: powerSet, xenon: xenon0, duration, dt, scenario,
      }
      const r = await callSimulate(body)
      if (r && r.series) setData(r)
      else if (r && Array.isArray(r?.data?.series)) setData(r.data)
      else if (r) setData({ ...fallbackSeries({ rod, flow, power: powerSet, xenon: xenon0, duration, dt }), _partial: true, ...r })
    } catch (e) {
      setBeError(e?.message || 'Server compute failed — showing client-side fallback.')
      setData(fallbackSeries({ rod, flow, power: powerSet, xenon: xenon0, duration, dt }))
    } finally {
      setBeLoading(false)
    }
  }, [rod, flow, powerSet, xenon0, duration, dt, scenario])

  const fireAz5 = useCallback(async () => {
    setBeError('')
    setAz5Fired(true)
    setBeLoading(true)
    try {
      const r = await callAz5({ rod, flow, power: powerSet, xenon: xenon0, duration, dt })
      if (r && r.series) setData(r)
      else if (r && Array.isArray(r?.data?.series)) setData(r.data)
      else setData({ ...fallbackSeries({ rod: 95, flow, power: powerSet, xenon: xenon0, duration, dt }), _partial: !!r, ...(r || {}) })
    } catch (e) {
      setBeError(e?.message || 'AZ-5 endpoint unavailable — showing client-side fallback.')
      // Local AZ-5 mimic: full rod withdrawal at start, positive tip effect.
      setScenario('az5')
      setRod(95)
      setData(fallbackSeries({ rod: 95, flow, power: powerSet, xenon: xenon0, duration, dt }))
    } finally {
      setBeLoading(false)
      setTimeout(() => setAz5Fired(false), 800)
    }
  }, [rod, flow, powerSet, xenon0, duration, dt])

  const reset = () => {
    setScenario('nominal')
    setRod(60); setFlow(8000); setPowerSet(3200); setXenon0(1.0)
    setDuration(60); setDt(0.05); setBeError('')
    setData(fallbackSeries({ rod: 60, flow: 8000, power: 3200, xenon: 1.0, duration: 60, dt: 0.05 }))
  }

  // Downsample for display (≤ 800 pts per chart).
  // Normalize BE schema (power_MW, T_fuel, rho_total, …) → FE schema
  // (power, Tf, rho, …) so both fallback and server data share one shape.
  const display = useMemo(() => {
    const s = Array.isArray(data?.series) ? data.series : []
    const normalized = s.map(p => {
      const q = p || {}
      return {
        t:       Number.isFinite(q.t) ? q.t : 0,
        // Accept FE fallback keys, BE-v1 keys (power_MW / T_fuel / rho_control …),
        // and normalize into a single FE-side shape used by every chart + panel.
        power:   q.power   ?? q.power_MW   ?? 0,
        Tf:      q.Tf      ?? q.T_fuel     ?? 0,
        Tc:      q.Tc      ?? q.T_coolant  ?? 0,
        rod:     q.rod     ?? q.rod_pos    ?? 0,
        rho:     q.rho     ?? q.rho_total  ?? 0,
        rhoRod:  q.rhoRod  ?? q.rho_c      ?? q.rho_control ?? 0,
        rhoVoid: q.rhoVoid ?? q.rho_v      ?? q.rho_void    ?? 0,
        rhoD:    q.rhoD    ?? q.rho_d      ?? q.rho_doppler ?? 0,
        rhoXe:   q.rhoXe   ?? q.rho_x      ?? q.rho_xenon   ?? 0,
        Xe:      q.Xe      ?? q.xenon      ?? 0,
        I:       q.I       ?? q.iodine     ?? 0,
        alpha:   q.alpha   ?? q.void       ?? 0,
        // Flow arrives as either `flow` (fallback) or `Wcool` / bare BE `flow`.
        Wcool:   q.Wcool   ?? q.flow       ?? 0,
        // Delayed-neutron precursor sum: fallback writes single-group `C`.
        Csum:    q.Csum    ?? q.C          ?? q.precursors  ?? 0,
      }
    })
    return downsample(normalized, 800)
  }, [data])

  const events = data?.events || []
  const verdict = data?.verdict || 'stable'

  // Current-state readouts (last sample).
  const last = display.length ? display[display.length - 1] : null
  const currentPower = Number.isFinite(last?.power) ? last.power : 0
  const currentReactivity = Number.isFinite(last?.rho) ? last.rho : 0
  const reactivityDollars = currentReactivity / 0.0065
  const reactivityCents = reactivityDollars * 100

  // Chart canvas refs
  const chartPowerRef = useRef(null)
  const chartTempRef  = useRef(null)
  const chartRhoRef   = useRef(null)
  const chartXeRef    = useRef(null)
  const chartVoidRef  = useRef(null)
  const chartCRef     = useRef(null)

  // Paint every chart whenever data changes.
  useEffect(() => {
    const paint = () => {
      drawLineChart(chartPowerRef.current, display,
        [{ key: 'power', color: '#f472b6' }],
        { log: true, yLabel: 'log₁₀ P (MW)', hline: 3200, hlineLabel: 'nominal 3200 MW' })
      drawDualAxis(chartTempRef.current, display,
        { leftKey: 'Tf', rightKey: 'Tc', leftHLine: MELT_LINE })
      drawStackedArea(chartRhoRef.current, display,
        [
          { key: 'rhoRod',  color: '#22d3ee' },
          { key: 'rhoVoid', color: '#f472b6' },
          { key: 'rhoD',    color: '#4ade80' },
          { key: 'rhoXe',   color: '#a78bfa' },
        ], { yLabel: 'ρ (Δk/k)' })
      drawLineChart(chartXeRef.current, display,
        [
          { key: 'Xe', color: '#a78bfa' },
          { key: 'I',  color: '#fbbf24' },
        ], { log: true, yLabel: 'log₁₀ conc.' })
      drawLineChart(chartVoidRef.current, display,
        [
          { key: 'alpha', color: '#f472b6' },
          { key: 'Wcool', color: '#22d3ee' },
        ], { yLabel: 'α  /  W (kg/s)' })
      drawLineChart(chartCRef.current, display,
        [{ key: 'Csum', color: '#fbbf24' }],
        { log: true, yLabel: 'log₁₀ ΣCᵢ' })
    }
    paint()
    const onResize = () => paint()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [display])

  return (
    <div className='min-h-screen bg-[var(--luxe-bg-base)] text-fg-primary pt-24 sm:pt-28 pb-16 px-3 sm:px-6'
         style={{ fontVariantNumeric: 'tabular-nums' }}>
      <div className='max-w-7xl mx-auto'>
        <header className='mb-6'>
          <p className='eyebrow-mono font-bold mb-2 text-rose-300/80 flex items-center gap-2'>
            <RadarChartOutlined /> — Simulations · RBMK-1000 Reactor
          </p>
          <h1 className='text-3xl sm:text-4xl font-bold gradient-text-amber leading-tight'>
            Chernobyl · Point-Kinetics Simulator
          </h1>
          <p className='text-sm text-fg-muted mt-1 max-w-3xl'>
            Six delayed-neutron groups, iodine → xenon poison chain, positive void coefficient,
            and the graphite-tip anomaly baked in. Pull the rods above 90 %, drop the flow,
            hit AZ-5, and watch the same physics that turned Reactor 4 into a fountain of neutrons at
            01:23:43 on 26 April 1986.
          </p>
        </header>

        {/* ── 1 · Hero / verdict strip ─────────────────────────── */}
        <div className={`luxe-glass p-4 mb-4 border ${verdict === 'meltdown' ? 'border-rose-500/50' : verdict === 'runaway' ? 'border-amber-500/50' : 'border-emerald-500/40'}`}>
          <div className='flex flex-col md:flex-row md:items-center gap-3'>
            <div className='flex-1 min-w-0'>
              <p className='eyebrow-mono font-bold text-fg-muted'>Reactor status</p>
              <div className='flex flex-wrap items-baseline gap-x-4 gap-y-1 mt-1'>
                <span className='text-3xl font-bold font-mono text-amber-300'>{currentPower.toFixed(0)}</span>
                <span className='text-fg-muted text-sm'>MW thermal</span>
                <span className='ml-2 text-lg font-mono text-cyan-300'>{reactivityCents >= 0 ? '+' : ''}{reactivityCents.toFixed(1)}</span>
                <span className='text-fg-muted text-sm'>¢ reactivity</span>
                <span className='ml-2 text-sm font-mono text-fuchsia-300'>${reactivityDollars.toFixed(3)}</span>
              </div>
              <div className='mt-2 text-[11px] text-fg-muted flex flex-wrap items-center gap-x-3 gap-y-1'>
                <span>Rod: <b className='text-amber-300'>{rod.toFixed(0)}%</b> withdrawn</span>
                <span>Flow: <b className='text-cyan-300'>{flow.toFixed(0)} kg/s</b></span>
                <span>Tf: <b className={last && last.Tf > MELT_LINE ? 'text-rose-300' : 'text-amber-200'}>{last ? last.Tf.toFixed(0) : '—'} °C</b></span>
                <span>α: <b className='text-fuchsia-200'>{last ? last.alpha.toFixed(2) : '—'}</b></span>
                <span>Verdict: <VerdictBadge verdict={verdict} /></span>
              </div>
            </div>
            <button
              onClick={fireAz5}
              disabled={beLoading}
              className={`shrink-0 relative rounded-xl px-5 py-3.5 font-bold text-white shadow-[0_0_30px_rgba(244,63,94,0.4)]
                          bg-gradient-to-b from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600
                          border border-rose-400/50 transition-all
                          ${az5Fired ? 'animate-pulse scale-95' : ''}
                          disabled:opacity-60 disabled:cursor-not-allowed`}>
              <WarningFilled className='mr-2' />
              AZ-5 SCRAM
              <span className='block text-[10px] font-mono opacity-80 mt-0.5'>emergency shutdown</span>
            </button>
          </div>
        </div>

        {/* ── 2 · Reactor core + Controls (mobile stack) ───────── */}
        <div className='grid grid-cols-1 md:grid-cols-2 gap-4 mb-4'>
          <div className='luxe-glass p-3'>
            <div className='flex items-center justify-between mb-2'>
              <p className='eyebrow-mono font-bold text-rose-300/80 flex items-center gap-1'>
                <FireFilled /> — Reactor core · per-channel view
                <Tooltip title='Top-down view of the RBMK core lattice — one dot per fuel channel. Blue = fresh (U-235 rich), grey = baseline U-238 dominated, red = currently fissioning, dark = spent. Small hollow rings mark U-238 (n,γ) capture events (route to Pu-239). White dots are live neutrons; long black bars are the 211 control rods dropping from the top.'>
                  <InfoCircleOutlined className='text-fg-muted text-[10px]' />
                </Tooltip>
              </p>
              <span className='text-[10px] font-mono text-fg-muted'>{GRID_COLS} × {GRID_ROWS} channels</span>
            </div>
            <RectangularReactorGrid
              series={display}
              rodPos={rod}
              tIdx={display.length - 1}
              az5Fired={az5Fired}
              onEvent={onGridEvent}
            />
            <div className='mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono text-fg-muted'>
              <span className='inline-flex items-center gap-1'>
                <span className='inline-block w-3 h-3 rounded' style={{ background: '#4a7dc9' }} /> fresh (U-235)
              </span>
              <span className='inline-flex items-center gap-1'>
                <span className='inline-block w-3 h-3 rounded' style={{ background: '#6a6a75' }} /> normal (U-238)
              </span>
              <span className='inline-flex items-center gap-1'>
                <span className='inline-block w-3 h-3 rounded' style={{ background: '#ef4444' }} /> fissioning
              </span>
              <span className='inline-flex items-center gap-1'>
                <span className='inline-block w-3 h-3 rounded' style={{ background: '#1a1a22', border: '1px solid rgba(255,255,255,0.2)' }} /> spent
              </span>
              <span className='inline-flex items-center gap-1'>
                <span className='inline-block w-3 h-3 rounded-full border border-white/40' /> capture
              </span>
              <span className='inline-flex items-center gap-1'>
                <span className='inline-block w-1.5 h-1.5 rounded-full bg-white/90' /> neutron
              </span>
            </div>
            {gridEvents.length > 0 && (
              <div className='mt-2 rounded border border-white/5 bg-black/40 px-2 py-1.5 max-h-24 overflow-hidden'>
                <div className='text-[9px] font-mono text-fg-dim uppercase mb-0.5'>event log</div>
                <div className='space-y-0.5'>
                  {gridEvents.map(e => (
                    <div key={e.id} className='text-[10px] font-mono'>
                      <span className='text-fg-muted'>Event {e.id}</span>
                      <span className={`ml-2 ${e.kind === 'critical' ? 'text-rose-300' : 'text-cyan-300'}`}>{e.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className='luxe-glass p-4 space-y-4'>
            <div>
              <p className='eyebrow-mono font-bold mb-1 text-cyan-300/80'>Scenario</p>
              <Segmented
                size='small'
                value={scenario}
                onChange={setScenario}
                block
                options={[
                  { label: 'Nominal',       value: 'nominal' },
                  { label: 'AZ-5 SCRAM',    value: 'az5' },
                  { label: 'Xenon transient', value: 'xenon' },
                  { label: 'Custom',        value: 'custom' },
                ]}
              />
              <FieldHelp>Snaps the sliders to a canonical starting condition. Switch to <b>Custom</b> to hand-tune every value.</FieldHelp>
            </div>

            <div>
              <div className='flex items-center justify-between text-[11px] mb-0.5'>
                <span className='text-fg-muted flex items-center gap-1'>
                  <Sym tex='\text{Rod position}' help={HELP.rodpos} /> <span className='text-fg-dim'>(% withdrawn)</span>
                </span>
              </div>
              <div className='flex items-center gap-2'>
                <div className='flex-1 min-w-0'>
                  <Slider min={0} max={100} step={1} value={rod} onChange={setRod}
                    accent='rose'
                    marks={{ 0: '0', 90: { label: <span className='text-rose-400 text-[10px]'>90</span> }, 100: '100' }}
                    tooltip={{ open: false }} />
                </div>
                <InputNumber
                  size='small'
                  min={0} max={100} step={1} precision={0}
                  parser={(v) => (v ?? '').replace(/[^-0-9]/g, '')}
                  value={rod} onChange={v => Number.isFinite(v) && setRod(v)}
                  className={`w-[92px] shrink-0 font-mono ${rod > 90 ? 'text-rose-300' : 'text-amber-300'}`}
                  onBlur={(e) => {
                    const n = Number(e.target.value)
                    if (Number.isFinite(n)) setRod(Math.min(100, Math.max(0, n)))
                  }}
                />
              </div>
              <FieldHelp>
                0 = rods fully in (max negative reactivity), 100 = fully out.
                <b className='text-rose-300'> Above 90 % is the danger zone</b> — the graphite tip inserts positive reactivity on re-entry.
                This is the mechanism that killed Chernobyl.
              </FieldHelp>
            </div>

            <div>
              <div className='flex items-center justify-between text-[11px] mb-0.5'>
                <span className='text-fg-muted flex items-center gap-1'>
                  <Sym tex='W' help={HELP.W} /> <span className='text-fg-dim'>(kg/s coolant)</span>
                </span>
              </div>
              <div className='flex items-center gap-2'>
                <div className='flex-1 min-w-0'>
                  <Slider min={500} max={12000} step={100} value={flow} onChange={setFlow} accent='cyan' tooltip={{ open: false }} />
                </div>
                <InputNumber
                  size='small'
                  min={500} max={12000} step={100} precision={0}
                  parser={(v) => (v ?? '').replace(/[^-0-9]/g, '')}
                  value={flow} onChange={v => Number.isFinite(v) && setFlow(v)}
                  className='w-[92px] shrink-0 font-mono text-cyan-300'
                  onBlur={(e) => {
                    const n = Number(e.target.value)
                    if (Number.isFinite(n)) setFlow(Math.min(12000, Math.max(500, n)))
                  }}
                />
              </div>
              <FieldHelp>Nominal ≈ 8000 kg/s. Low flow → more boiling → higher void fraction α → positive ρ_void kick.</FieldHelp>
            </div>

            <div>
              <div className='flex items-center justify-between text-[11px] mb-0.5'>
                <span className='text-fg-muted flex items-center gap-1'>
                  <Sym tex='P_{\text{set}}' help={HELP.P} /> <span className='text-fg-dim'>(MW)</span>
                </span>
              </div>
              <div className='flex items-center gap-2'>
                <div className='flex-1 min-w-0'>
                  <Slider min={50} max={4200} step={10} value={powerSet} onChange={setPowerSet} accent='amber' tooltip={{ open: false }} />
                </div>
                <InputNumber
                  size='small'
                  min={50} max={4200} step={10} precision={0}
                  parser={(v) => (v ?? '').replace(/[^-0-9]/g, '')}
                  value={powerSet} onChange={v => Number.isFinite(v) && setPowerSet(v)}
                  className='w-[92px] shrink-0 font-mono text-amber-300'
                  onBlur={(e) => {
                    const n = Number(e.target.value)
                    if (Number.isFinite(n)) setPowerSet(Math.min(4200, Math.max(50, n)))
                  }}
                />
              </div>
              <FieldHelp>Power set-point. RBMK-1000 nominal = 3200 MW_th. <b className='text-rose-300'>Below 700 MW</b> is the forbidden low-power zone where the accident began.</FieldHelp>
            </div>

            <div>
              <div className='flex items-center justify-between text-[11px] mb-0.5'>
                <span className='text-fg-muted flex items-center gap-1'>
                  <Sym tex='X_0/X_{eq}' help={HELP.xenon0} />
                </span>
              </div>
              <div className='flex items-center gap-2'>
                <div className='flex-1 min-w-0'>
                  <Slider min={0} max={4} step={0.05} value={xenon0} onChange={setXenon0} accent='fuchsia' tooltip={{ open: false }} />
                </div>
                <InputNumber
                  size='small'
                  min={0} max={4} step={0.05} precision={2}
                  value={xenon0} onChange={v => Number.isFinite(v) && setXenon0(v)}
                  className='w-[92px] shrink-0 font-mono text-fuchsia-300'
                  onBlur={(e) => {
                    const n = Number(e.target.value)
                    if (Number.isFinite(n)) setXenon0(Math.min(4, Math.max(0, n)))
                  }}
                />
              </div>
              <FieldHelp>Initial Xe-135 relative to equilibrium. Post-shutdown peaks at ~3× → this is the "xenon pit" the operators fought.</FieldHelp>
            </div>

            <div className='grid grid-cols-2 gap-3'>
              <div>
                <div className='flex items-center justify-between text-[11px] mb-0.5'>
                  <span className='text-fg-muted'>Duration (s)</span>
                </div>
                <div className='flex items-center gap-2'>
                  <div className='flex-1 min-w-0'>
                    <Slider min={10} max={300} step={5} value={duration} onChange={setDuration} accent='amber' tooltip={{ open: false }} />
                  </div>
                  <InputNumber
                    size='small'
                    min={10} max={300} step={5} precision={0}
                    parser={(v) => (v ?? '').replace(/[^-0-9]/g, '')}
                    value={duration} onChange={v => Number.isFinite(v) && setDuration(v)}
                    className='w-[92px] shrink-0 font-mono text-amber-300'
                    onBlur={(e) => {
                      const n = Number(e.target.value)
                      if (Number.isFinite(n)) setDuration(Math.min(300, Math.max(10, n)))
                    }}
                  />
                </div>
                <FieldHelp>Longer runs = smoother chart, more xenon dynamics visible.</FieldHelp>
              </div>
              <div>
                <div className='flex items-center justify-between text-[11px] mb-0.5'>
                  <span className='text-fg-muted'>dt (s)</span>
                </div>
                <div className='flex items-center gap-2'>
                  <div className='flex-1 min-w-0'>
                    <Slider min={0.001} max={0.2} step={0.001} value={dt} onChange={setDt} accent='emerald' tooltip={{ open: false }} />
                  </div>
                  <InputNumber
                    size='small'
                    min={0.001} max={0.2} step={0.001} precision={3}
                    value={dt} onChange={v => Number.isFinite(v) && setDt(v)}
                    className='w-[92px] shrink-0 font-mono text-emerald-300'
                    onBlur={(e) => {
                      const n = Number(e.target.value)
                      if (Number.isFinite(n)) setDt(Math.min(0.2, Math.max(0.001, n)))
                    }}
                  />
                </div>
                <FieldHelp>Point-kinetics is stiff — smaller dt for sharp SCRAM transients.</FieldHelp>
              </div>
            </div>

            <div className='flex flex-wrap gap-2 pt-1'>
              <button
                onClick={runOnServer}
                disabled={beLoading}
                className='luxe-btn luxe-btn-primary text-xs disabled:opacity-60'>
                {beLoading ? <><LoadingOutlined /> Computing…</> : <><CloudServerOutlined /> Run on server</>}
              </button>
              <button onClick={reset} className='luxe-btn luxe-btn-secondary text-xs'>
                <ReloadOutlined /> Reset
              </button>
              <span className='ml-auto text-[10px] font-mono text-fg-muted self-center'>
                {display.length} samples · dt = {dt}s
              </span>
            </div>
            {beError && (
              <div className='rounded border border-rose-500/40 bg-rose-500/10 text-rose-200 text-xs px-3 py-2 font-mono'>
                {beError}
              </div>
            )}
          </div>
        </div>

        {/* ── 2.5 · Material accounting, fuel burnup, radiation, fission ── */}
        <MaterialAccountingPanel series={display} last={last} />
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-4 my-4'>
          <FuelBurnupCard />
          <FissionBreakdownPanel />
        </div>
        <div className='mb-4'>
          <RadiationExplainer />
        </div>

        {/* ── 3 · Telemetry chart row ────────────────────────── */}
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4'>
          <ChartPanel title='Neutron power (log MW)' color='text-rose-300/80'
                      legend={<><Dot c='#f472b6' /> P(t)</>}>
            <canvas ref={chartPowerRef} style={{ display: 'block', width: '100%', height: '100%' }} />
          </ChartPanel>
          <ChartPanel title='Fuel · coolant temperature' color='text-amber-300/80'
                      legend={<><Dot c='#fbbf24' /> Tf &nbsp;<Dot c='#22d3ee' /> Tc &nbsp;<Dot c='#f43f5e' /> melt</>}>
            <canvas ref={chartTempRef} style={{ display: 'block', width: '100%', height: '100%' }} />
          </ChartPanel>
          <ChartPanel title='Reactivity components (Δk/k)' color='text-cyan-300/80'
                      legend={<><Dot c='#22d3ee' /> ρ_c &nbsp;<Dot c='#f472b6' /> ρ_v &nbsp;<Dot c='#4ade80' /> ρ_d &nbsp;<Dot c='#a78bfa' /> ρ_Xe</>}>
            <canvas ref={chartRhoRef} style={{ display: 'block', width: '100%', height: '100%' }} />
          </ChartPanel>
          <ChartPanel title='I-135 · Xe-135 concentration' color='text-fuchsia-300/80'
                      legend={<><Dot c='#fbbf24' /> I &nbsp;<Dot c='#a78bfa' /> Xe</>}>
            <canvas ref={chartXeRef} style={{ display: 'block', width: '100%', height: '100%' }} />
          </ChartPanel>
          <ChartPanel title='Void fraction · coolant flow' color='text-pink-300/80'
                      legend={<><Dot c='#f472b6' /> α &nbsp;<Dot c='#22d3ee' /> W</>}>
            <canvas ref={chartVoidRef} style={{ display: 'block', width: '100%', height: '100%' }} />
          </ChartPanel>
          <ChartPanel title='Delayed neutron precursors ΣCᵢ' color='text-emerald-300/80'
                      legend={<><Dot c='#fbbf24' /> ΣCᵢ</>}>
            <canvas ref={chartCRef} style={{ display: 'block', width: '100%', height: '100%' }} />
          </ChartPanel>
        </div>

        {/* ── 4 · Event timeline ──────────────────────────────── */}
        <div className='luxe-glass p-4 mb-4'>
          <div className='flex items-center gap-2 mb-3'>
            <ExperimentOutlined className='text-rose-300' />
            <p className='eyebrow-mono font-bold text-rose-300/80'>Event timeline</p>
            <span className='ml-auto text-[10px] font-mono text-fg-muted'>{events.length} events</span>
          </div>
          {events.length === 0 ? (
            <p className='text-[11px] text-fg-muted italic'>No noteworthy events yet — the reactor is stable at the current set-point. Try withdrawing the rods above 90 % or reducing coolant flow, then hit <b className='text-rose-300'>AZ-5 SCRAM</b>.</p>
          ) : (
            <ol className='space-y-2'>
              {events.map((e, i) => (
                <li key={i} className='flex items-start gap-3'>
                  <span className={`shrink-0 mt-1 w-2 h-2 rounded-full ${severityDot(e.severity)}`} />
                  <div className='min-w-0'>
                    <div className='text-[11px] font-mono'>
                      <span className={severityText(e.severity)}>{(e.severity || 'info').toUpperCase()}</span>
                      <span className='text-fg-muted mx-2'>·</span>
                      <span className='text-amber-300'>t = {(e.t ?? 0).toFixed(2)} s</span>
                    </div>
                    <div className='text-sm text-fg-primary/90 mt-0.5'>{e.text || e.message || 'Event.'}</div>
                    {e.detail && <div className='text-[11px] text-fg-muted mt-0.5'>{e.detail}</div>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* ── 5 · Equations ──────────────────────────────────── */}
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4'>
          <div className='luxe-glass p-4'>
            <p className='eyebrow-mono font-bold mb-3 text-cyan-300/80'>Point kinetics · 6 delayed groups</p>
            <div className='space-y-4 text-sm leading-relaxed'>
              <div>
                <div className='text-fg-muted mb-1 flex items-center gap-2'>
                  <Sym tex='\dfrac{dn}{dt}' help={HELP.n} /> =
                </div>
                <Tex display src={String.raw`\frac{dn}{dt} = \frac{\rho - \beta}{\Lambda}\, n(t) + \sum_{i=1}^{6} \lambda_i C_i(t)`} />
              </div>
              <div>
                <div className='text-fg-muted mb-1 flex items-center gap-2'>
                  <Sym tex='\dfrac{dC_i}{dt}' help={HELP.C} /> =
                </div>
                <Tex display src={String.raw`\frac{dC_i}{dt} = \frac{\beta_i}{\Lambda}\, n(t) - \lambda_i\, C_i(t)`} />
              </div>
              <p className='text-[11px] text-fg-muted'>
                Six precursor groups, half-lives ~55 s down to ~0.2 s.
                <Sym tex='\beta' help={HELP.beta} /> ≈ 0.0065 for U-235,
                <Sym tex='\Lambda' help={HELP.Lambda} /> ≈ 10⁻³ s for RBMK.
                When <Sym tex='\rho \geq \beta' help='prompt criticality — delayed neutrons stop mattering, only the prompt cascade counts. Runaway.' />, the reactor is <b className='text-rose-300'>prompt critical</b>. This is what happened at 01:23:43.
              </p>
            </div>
          </div>

          <div className='luxe-glass p-4'>
            <p className='eyebrow-mono font-bold mb-3 text-fuchsia-300/80'>Iodine → Xenon chain (Bateman)</p>
            <div className='space-y-4 text-sm leading-relaxed'>
              <div>
                <div className='text-fg-muted mb-1'><Sym tex='\dfrac{dI}{dt}' help={HELP.I} /> =</div>
                <Tex display src={String.raw`\frac{dI}{dt} = \gamma_I \Sigma_f \phi - \lambda_I\, I`} />
              </div>
              <div>
                <div className='text-fg-muted mb-1'><Sym tex='\dfrac{dX}{dt}' help={HELP.X} /> =</div>
                <Tex display src={String.raw`\frac{dX}{dt} = \gamma_X \Sigma_f \phi + \lambda_I\, I - \lambda_X\, X - \sigma_X^a\, X\, \phi`} />
              </div>
              <p className='text-[11px] text-fg-muted'>
                <Sym tex='\sigma_X^a' help='Thermal-neutron absorption cross-section of Xe-135 — about 2.65 million barns, the largest of any known nuclide. This is why Xe-135 is such a potent poison.' /> ≈ 2.65 × 10⁶ barns.
                When the reactor is shut down, <Sym tex='X' help={HELP.X} /> keeps building from decaying <Sym tex='I' help={HELP.I} /> for hours → the <b className='text-fuchsia-300'>xenon pit</b>. Operators fighting the pit lifted almost every rod, leaving no shutdown margin.
              </p>
            </div>
          </div>

          <div className='luxe-glass p-4'>
            <p className='eyebrow-mono font-bold mb-3 text-rose-300/80'>Reactivity balance</p>
            <Tex display src={String.raw`\rho(t) = \rho_{\text{control}}(t) + \rho_{\text{void}}(\alpha) + \rho_D(T_f) + \rho_{Xe}(X)`} />
            <ul className='mt-3 space-y-1.5 text-[12px]'>
              <li className='flex gap-2'><span className='inline-block w-2 h-2 rounded-full bg-cyan-400 mt-1.5' /><span><Sym tex='\rho_{\text{control}}' help={HELP.rho_c} /> — rod position. In RBMK the graphite tip briefly adds <b className='text-rose-300'>positive</b> reactivity on re-entry.</span></li>
              <li className='flex gap-2'><span className='inline-block w-2 h-2 rounded-full bg-fuchsia-400 mt-1.5' /><span><Sym tex='\rho_{\text{void}}' help={HELP.rho_v} /> — <b className='text-rose-300'>positive</b> void coefficient. This is the RBMK design flaw.</span></li>
              <li className='flex gap-2'><span className='inline-block w-2 h-2 rounded-full bg-emerald-400 mt-1.5' /><span><Sym tex='\rho_D' help={HELP.rho_d} /> — Doppler broadening in U-238. Negative, fast, but weak.</span></li>
              <li className='flex gap-2'><span className='inline-block w-2 h-2 rounded-full bg-violet-400 mt-1.5' /><span><Sym tex='\rho_{Xe}' help={HELP.rho_x} /> — Xe-135 absorption. Negative, slow (hours).</span></li>
            </ul>
          </div>

          <div className='luxe-glass p-4'>
            <p className='eyebrow-mono font-bold mb-3 text-amber-300/80'>Way-Wigner decay heat</p>
            <Tex display src={String.raw`\frac{P(t)}{P_0} \approx 0.066\left[\,t^{-0.2} - (t + T)^{-0.2}\right]`} />
            <p className='mt-2 text-[11px] text-fg-muted'>
              Even after SCRAM, fission-product decay produces ~<b className='text-amber-300'>7 %</b> of nominal power for the first minute, dropping to ~1 % after a day. In a loss-of-coolant event this is enough to melt the core.
              <Sym tex='T' help={HELP.decay_heat} /> is the operating time before shutdown.
            </p>
          </div>
        </div>

        {/* ── 6 · Why the accident happened ──────────────────── */}
        <div className='luxe-glass p-4 mb-4 border border-rose-500/20'>
          <p className='eyebrow-mono font-bold mb-3 text-rose-300/80 flex items-center gap-2'>
            <WarningFilled /> — Why Chernobyl actually happened
          </p>
          <ol className='space-y-2 text-sm leading-relaxed text-fg-primary/90'>
            <li className='flex gap-3'>
              <span className='shrink-0 w-6 h-6 rounded-full bg-rose-500/20 text-rose-300 font-mono text-xs flex items-center justify-center'>1</span>
              <div>
                <b>The safety test.</b> Reactor 4 was running a turbine coast-down test — could the residual spin of the turbine power the coolant pumps long enough for diesels to start? To run the test they needed to be at ~700 MW. They overshot the throttle-back and fell to ~30 MW.
              </div>
            </li>
            <li className='flex gap-3'>
              <span className='shrink-0 w-6 h-6 rounded-full bg-rose-500/20 text-rose-300 font-mono text-xs flex items-center justify-center'>2</span>
              <div>
                <b>Xenon poisoning.</b> The low-power operation flooded the core with Xe-135 — the "xenon pit". To restore power the operators pulled almost all 211 control rods, leaving a reserve of only ~6-8 rods when the safety minimum was 15.
              </div>
            </li>
            <li className='flex gap-3'>
              <span className='shrink-0 w-6 h-6 rounded-full bg-rose-500/20 text-rose-300 font-mono text-xs flex items-center justify-center'>3</span>
              <div>
                <b>Positive void coefficient.</b> At low power the coolant was already close to boiling. As pumps started coasting down for the test, flow dropped, boiling ratio rose, void fraction climbed, and <Sym tex='\rho_{\text{void}}' help={HELP.rho_v} /> pushed reactivity up. Power began to climb on its own.
              </div>
            </li>
            <li className='flex gap-3'>
              <span className='shrink-0 w-6 h-6 rounded-full bg-rose-500/20 text-rose-300 font-mono text-xs flex items-center justify-center'>4</span>
              <div>
                <b>AZ-5 · the graphite-tip anomaly.</b> At 01:23:40 Toptunov pressed AZ-5 to end the test. All 211 rods began descending together. But RBMK rods have a <b className='text-rose-300'>graphite displacer at the tip</b> — for the first few seconds this graphite <b>displaces water (a neutron absorber) with graphite (a neutron moderator)</b> in the lower core. Reactivity spikes <b>positive</b>. Prompt critical.
              </div>
            </li>
            <li className='flex gap-3'>
              <span className='shrink-0 w-6 h-6 rounded-full bg-rose-500/20 text-rose-300 font-mono text-xs flex items-center justify-center'>5</span>
              <div>
                <b>Steam explosion.</b> Power went from ~200 MW to an estimated 30 000 MW in about 4 seconds. Fuel vaporised. Coolant flashed to steam. The 2000-ton upper biological shield ("Elena") was blown off the reactor. A second explosion — probably hydrogen — followed seconds later. The graphite caught fire and burned for 10 days.
              </div>
            </li>
          </ol>
        </div>

        {/* ── 7 · Historical footer ──────────────────────────── */}
        <div className='luxe-glass p-4 text-[12px] text-fg-muted leading-relaxed'>
          <p className='eyebrow-mono font-bold mb-2 text-fg-dim'>Reactor 4 · Chernobyl Nuclear Power Plant · Pripyat, Ukrainian SSR</p>
          <p>
            <b className='text-amber-300'>25 April 1986 · 01:06</b> — Power reduction begins for a planned turbine coast-down test.
            &nbsp;·&nbsp;
            <b className='text-amber-300'>25 April · 14:00</b> — Test postponed 9 hours by grid dispatcher.
            &nbsp;·&nbsp;
            <b className='text-amber-300'>26 April · 00:28</b> — Operator error drops power to ~30 MW (should have held at ~700).
            &nbsp;·&nbsp;
            <b className='text-amber-300'>26 April · 01:23:04</b> — Test begins. Coolant flow drops.
            &nbsp;·&nbsp;
            <b className='text-rose-300'>26 April · 01:23:40</b> — Toptunov presses AZ-5.
            &nbsp;·&nbsp;
            <b className='text-rose-300'>26 April · 01:23:43</b> — Steam explosion. Core destroyed.
          </p>
          <p className='mt-2'>
            The RBMK-1000 was a graphite-moderated, water-cooled channel-type reactor unique to the Soviet Union — its <b>positive void coefficient</b>,
            <b> low delayed-neutron fraction</b> (β ≈ 0.0065), and the <b>graphite-tip anomaly</b> on its control rods together made it uniquely vulnerable
            to a low-power, high-xenon shutdown transient. All subsequent RBMK reactors were retrofitted with faster rods, higher fuel enrichment,
            and a mandatory rod-reserve rule. Reactor 4 remains inside the New Safe Confinement structure completed in 2016.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────
function ChartPanel({ title, color, legend, children }) {
  return (
    <div className='luxe-glass p-3 flex flex-col' style={{ height: 240 }}>
      <div className='flex items-center justify-between mb-2 flex-wrap gap-1'>
        <p className={`eyebrow-mono font-bold ${color}`}>{title}</p>
        <div className='text-[10px] font-mono text-fg-muted flex items-center gap-1'>{legend}</div>
      </div>
      <div className='flex-1 min-h-0'>{children}</div>
    </div>
  )
}

function Dot({ c }) {
  return <span className='inline-block w-2 h-2 rounded-full mr-1 align-middle' style={{ background: c }} />
}

function FluxSwatch({ v, label }) {
  return (
    <span className='inline-flex items-center gap-1'>
      <span className='inline-block w-3 h-3 rounded' style={{ background: fluxColor(v) }} />
      {label}
    </span>
  )
}

function VerdictBadge({ verdict }) {
  const map = {
    stable:   { c: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', label: 'STABLE' },
    runaway:  { c: 'bg-amber-500/15 text-amber-300 border-amber-500/40',       label: 'RUNAWAY' },
    meltdown: { c: 'bg-rose-500/15 text-rose-300 border-rose-500/40',          label: 'MELTDOWN' },
  }
  const m = map[verdict] || map.stable
  return <span className={`inline-block px-2 py-0.5 rounded-md border font-mono text-[10px] ${m.c}`}>{m.label}</span>
}

function severityDot(s) {
  if (s === 'critical') return 'bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.7)]'
  if (s === 'warning')  return 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]'
  if (s === 'info')     return 'bg-cyan-400'
  return 'bg-white/50'
}
function severityText(s) {
  if (s === 'critical') return 'text-rose-300'
  if (s === 'warning')  return 'text-amber-300'
  if (s === 'info')     return 'text-cyan-300'
  return 'text-fg-muted'
}
