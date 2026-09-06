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
import { Segmented, Switch, Tooltip } from 'antd'
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

// ─── Reactor core canvas — radial heatmap of 1661 fuel channels ─
function ReactorCore({ series, rodPos, tIdx }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = parent.clientWidth
    // Square-fit the width — mobile-friendly and prevents distortion.
    const h = w
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = w + 'px'
      canvas.style.height = h + 'px'
    }
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    // Background
    ctx.fillStyle = '#05050a'
    ctx.fillRect(0, 0, w, h)

    // Draw the 1661 channels arranged in a circle. Grid pitch = 25 cm on
    // the real RBMK, we scale to fit. We use a hex-like square lattice
    // clipped by a circle of radius R.
    const cx = w / 2, cy = h / 2
    const R = Math.min(w, h) * 0.44
    const cellR = R * 0.045          // per-cell display radius
    const step = cellR * 2.05
    const cells = []
    for (let x = -R; x <= R; x += step) {
      for (let y = -R; y <= R; y += step) {
        if (x * x + y * y <= R * R * 0.99) cells.push([x, y])
      }
    }
    // Flux profile — cosine radial distribution modulated by current
    // total power. Adds a slight azimuthal wobble for realism.
    const state = series && series[tIdx] ? series[tIdx] : null
    const power = state ? state.power : 3200
    const powerFrac = Math.min(6, power / 3200)  // 0..6× nominal
    for (const [x, y] of cells) {
      const r = Math.hypot(x, y) / R
      const az = Math.atan2(y, x)
      const flux = powerFrac * Math.cos(r * Math.PI / 2) * (0.9 + 0.1 * Math.sin(4 * az))
      const cellX = cx + x, cellY = cy + y
      ctx.fillStyle = fluxColor(flux)
      ctx.beginPath()
      ctx.arc(cellX, cellY, cellR, 0, Math.PI * 2)
      ctx.fill()
    }

    // Overlay control rod columns — 211 rods, distributed sparser than
    // the fuel channels. We show them as vertical grey bars whose height
    // is the insertion depth: rodPos=100 → fully out (short bar);
    // rodPos=0 → fully in (bar covers the whole cell).
    const rodStep = step * 2.6
    const insertion = 1 - rodPos / 100   // 0..1
    ctx.fillStyle = 'rgba(180, 180, 200, 0.35)'
    for (let x = -R; x <= R; x += rodStep) {
      for (let y = -R; y <= R; y += rodStep) {
        if (x * x + y * y > R * R * 0.92) continue
        const cellX = cx + x, cellY = cy + y
        const barH = cellR * 2 * insertion
        ctx.fillRect(cellX - cellR * 0.4, cellY - cellR, cellR * 0.8, barH)
      }
    }

    // Outer boundary ring — the graphite moderator + biological shield.
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.02, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = 'rgba(251,191,36,0.25)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.08, 0, Math.PI * 2); ctx.stroke()

    // Meta label
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.font = '11px ui-monospace, Menlo, monospace'
    ctx.fillText(`RBMK-1000  ·  ${cells.length} channels shown  ·  rod = ${rodPos.toFixed(0)}%`, 8, h - 8)
  }, [series, rodPos, tIdx])

  return (
    <div className='w-full' style={{ aspectRatio: '1 / 1' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%', borderRadius: 12 }} />
    </div>
  )
}

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
  const display = useMemo(() => {
    const s = data?.series || []
    return downsample(s, 800)
  }, [data])

  const events = data?.events || []
  const verdict = data?.verdict || 'stable'

  // Current-state readouts (last sample).
  const last = display.length ? display[display.length - 1] : null
  const currentPower = last ? last.power : 0
  const currentReactivity = last ? last.rho : 0
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
          { key: 'rho_c', color: '#22d3ee' },
          { key: 'rho_v', color: '#f472b6' },
          { key: 'rho_d', color: '#4ade80' },
          { key: 'rho_x', color: '#a78bfa' },
        ], { yLabel: 'ρ (Δk/k)' })
      drawLineChart(chartXeRef.current, display,
        [
          { key: 'Xe', color: '#a78bfa' },
          { key: 'I',  color: '#fbbf24' },
        ], { log: true, yLabel: 'log₁₀ conc.' })
      drawLineChart(chartVoidRef.current, display,
        [
          { key: 'alpha', color: '#f472b6' },
          { key: 'flow',  color: '#22d3ee' },
        ], { yLabel: 'α  /  W (kg/s)' })
      drawLineChart(chartCRef.current, display,
        [{ key: 'C', color: '#fbbf24' }],
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
          <p className='eyebrow-mono mb-2 text-rose-300/80 flex items-center gap-2'>
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
              <p className='eyebrow-mono text-fg-muted'>— Reactor status</p>
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
              <p className='eyebrow-mono text-rose-300/80 flex items-center gap-1'>
                <FireFilled /> — Reactor core · neutron flux
                <Tooltip title='Top-down view of the RBMK core. Colours: dark = cold, cyan = normal, amber = high, red = extreme, white = fuel damage. Vertical bars are the 211 control rods; taller = more inserted.'>
                  <InfoCircleOutlined className='text-fg-muted text-[10px]' />
                </Tooltip>
              </p>
              <span className='text-[10px] font-mono text-fg-muted'>1661 fuel channels</span>
            </div>
            <ReactorCore series={display} rodPos={rod} tIdx={display.length - 1} />
            <div className='mt-2 flex flex-wrap items-center gap-2 text-[10px] font-mono text-fg-muted'>
              <span>Flux:</span>
              <FluxSwatch v={0.05} label='cold' />
              <FluxSwatch v={0.5} label='normal' />
              <FluxSwatch v={1.2} label='high' />
              <FluxSwatch v={2.2} label='extreme' />
              <FluxSwatch v={2.9} label='melt' />
            </div>
          </div>

          <div className='luxe-glass p-4 space-y-4'>
            <div>
              <p className='eyebrow-mono mb-1 text-cyan-300/80'>— Scenario</p>
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
                <span className={`font-mono ${rod > 90 ? 'text-rose-300' : 'text-amber-300'}`}>{rod.toFixed(0)}</span>
              </div>
              <Slider min={0} max={100} step={1} value={rod} onChange={setRod}
                accent='rose'
                marks={{ 0: '0', 90: { label: <span className='text-rose-400 text-[10px]'>90</span> }, 100: '100' }}
                tooltip={{ open: false }} />
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
                <span className='font-mono text-cyan-300'>{flow.toFixed(0)}</span>
              </div>
              <Slider min={500} max={12000} step={100} value={flow} onChange={setFlow} accent='cyan' tooltip={{ open: false }} />
              <FieldHelp>Nominal ≈ 8000 kg/s. Low flow → more boiling → higher void fraction α → positive ρ_void kick.</FieldHelp>
            </div>

            <div>
              <div className='flex items-center justify-between text-[11px] mb-0.5'>
                <span className='text-fg-muted flex items-center gap-1'>
                  <Sym tex='P_{\text{set}}' help={HELP.P} /> <span className='text-fg-dim'>(MW)</span>
                </span>
                <span className='font-mono text-amber-300'>{powerSet.toFixed(0)}</span>
              </div>
              <Slider min={50} max={4200} step={10} value={powerSet} onChange={setPowerSet} accent='amber' tooltip={{ open: false }} />
              <FieldHelp>Power set-point. RBMK-1000 nominal = 3200 MW_th. <b className='text-rose-300'>Below 700 MW</b> is the forbidden low-power zone where the accident began.</FieldHelp>
            </div>

            <div>
              <div className='flex items-center justify-between text-[11px] mb-0.5'>
                <span className='text-fg-muted flex items-center gap-1'>
                  <Sym tex='X_0/X_{eq}' help={HELP.xenon0} />
                </span>
                <span className='font-mono text-fuchsia-300'>{xenon0.toFixed(2)}</span>
              </div>
              <Slider min={0} max={4} step={0.05} value={xenon0} onChange={setXenon0} accent='fuchsia' tooltip={{ open: false }} />
              <FieldHelp>Initial Xe-135 relative to equilibrium. Post-shutdown peaks at ~3× → this is the "xenon pit" the operators fought.</FieldHelp>
            </div>

            <div className='grid grid-cols-2 gap-3'>
              <div>
                <div className='flex items-center justify-between text-[11px] mb-0.5'>
                  <span className='text-fg-muted'>Duration (s)</span>
                  <span className='font-mono text-amber-300'>{duration}</span>
                </div>
                <Slider min={10} max={300} step={5} value={duration} onChange={setDuration} accent='amber' tooltip={{ open: false }} />
                <FieldHelp>Longer runs = smoother chart, more xenon dynamics visible.</FieldHelp>
              </div>
              <div>
                <div className='flex items-center justify-between text-[11px] mb-0.5'>
                  <span className='text-fg-muted'>dt (s)</span>
                  <span className='font-mono text-emerald-300'>{dt}</span>
                </div>
                <Slider min={0.001} max={0.2} step={0.001} value={dt} onChange={setDt} accent='emerald' tooltip={{ open: false }} />
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
            <p className='eyebrow-mono text-rose-300/80'>— Event timeline</p>
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
            <p className='eyebrow-mono mb-3 text-cyan-300/80'>— Point kinetics · 6 delayed groups</p>
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
            <p className='eyebrow-mono mb-3 text-fuchsia-300/80'>— Iodine → Xenon chain (Bateman)</p>
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
            <p className='eyebrow-mono mb-3 text-rose-300/80'>— Reactivity balance</p>
            <Tex display src={String.raw`\rho(t) = \rho_{\text{control}}(t) + \rho_{\text{void}}(\alpha) + \rho_D(T_f) + \rho_{Xe}(X)`} />
            <ul className='mt-3 space-y-1.5 text-[12px]'>
              <li className='flex gap-2'><span className='inline-block w-2 h-2 rounded-full bg-cyan-400 mt-1.5' /><span><Sym tex='\rho_{\text{control}}' help={HELP.rho_c} /> — rod position. In RBMK the graphite tip briefly adds <b className='text-rose-300'>positive</b> reactivity on re-entry.</span></li>
              <li className='flex gap-2'><span className='inline-block w-2 h-2 rounded-full bg-fuchsia-400 mt-1.5' /><span><Sym tex='\rho_{\text{void}}' help={HELP.rho_v} /> — <b className='text-rose-300'>positive</b> void coefficient. This is the RBMK design flaw.</span></li>
              <li className='flex gap-2'><span className='inline-block w-2 h-2 rounded-full bg-emerald-400 mt-1.5' /><span><Sym tex='\rho_D' help={HELP.rho_d} /> — Doppler broadening in U-238. Negative, fast, but weak.</span></li>
              <li className='flex gap-2'><span className='inline-block w-2 h-2 rounded-full bg-violet-400 mt-1.5' /><span><Sym tex='\rho_{Xe}' help={HELP.rho_x} /> — Xe-135 absorption. Negative, slow (hours).</span></li>
            </ul>
          </div>

          <div className='luxe-glass p-4'>
            <p className='eyebrow-mono mb-3 text-amber-300/80'>— Way-Wigner decay heat</p>
            <Tex display src={String.raw`\frac{P(t)}{P_0} \approx 0.066\left[\,t^{-0.2} - (t + T)^{-0.2}\right]`} />
            <p className='mt-2 text-[11px] text-fg-muted'>
              Even after SCRAM, fission-product decay produces ~<b className='text-amber-300'>7 %</b> of nominal power for the first minute, dropping to ~1 % after a day. In a loss-of-coolant event this is enough to melt the core.
              <Sym tex='T' help={HELP.decay_heat} /> is the operating time before shutdown.
            </p>
          </div>
        </div>

        {/* ── 6 · Why the accident happened ──────────────────── */}
        <div className='luxe-glass p-4 mb-4 border border-rose-500/20'>
          <p className='eyebrow-mono mb-3 text-rose-300/80 flex items-center gap-2'>
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
          <p className='eyebrow-mono mb-2 text-fg-dim'>— Reactor 4 · Chernobyl Nuclear Power Plant · Pripyat, Ukrainian SSR</p>
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
        <p className={`eyebrow-mono ${color}`}>— {title}</p>
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
