// Atoms — Nuclear Physics Playground.
//
// Engine: the sampling kernel from kavan010/Atoms
// (E:/Github/Atoms/src/atom_raytracer.cpp) — CDF-sampled hydrogen-like
// orbitals via associated Laguerre × associated Legendre polynomials.
// Emscripten is not installed on this machine (checked at build time:
// `emcc --version` returns "command not found"), so the C++ kernel is
// ported verbatim into src/lib/atomsCore.js. The public sim API surface
// (sampleOrbital, semiEmpiricalMass, alphaDecayQ, bohr*) mirrors what
// the WASM export would have looked like.
//
// Everything visual sits inside the same "luxe-glass" chrome as
// PhysicsLab.jsx / Chernobyl.jsx — this page belongs in the Simulations
// group of the mega-menu and reads in the same voice.

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Segmented, Switch, Tooltip, InputNumber } from 'antd'
import { Slider } from '../components/ui'
import {
  PlayCircleFilled, PauseCircleFilled, ReloadOutlined,
  ExperimentOutlined, ThunderboltFilled, RadarChartOutlined,
  InfoCircleOutlined, FireFilled, WarningFilled,
} from '@ant-design/icons'
import katex from 'katex'
import {
  sampleOrbital,
  bohrRadius, bohrEnergy,
  semiEmpiricalMass,
  alphaDecayQ, betaMinusQ, betaPlusQ,
  isotopeTelemetry,
} from '../lib/atomsCore'
import {
  ELEMENTS, BY_Z, CAT_COLORS,
  ISOTOPES, CHAIN_ROOTS, buildChain, fmtHalfLife,
} from '../lib/atomsData'

// ─── KaTeX helpers (identical shape to PhysicsLab / Chernobyl) ─
function renderTex(src, opts = {}) {
  try {
    return katex.renderToString(src, {
      throwOnError: false,
      displayMode: !!opts.display,
      strict: 'ignore',
      output: 'html',
    })
  } catch (e) { return `<span class="text-rose-400">${String(src)}</span>` }
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
    <Tooltip title={help} placement='top' overlayStyle={{ maxWidth: 360 }}>
      <span
        className={`katex-host inline-block cursor-help border-b border-dashed border-white/20 hover:border-amber-300/60 ${className}`}
        dangerouslySetInnerHTML={{ __html: renderTex(tex) }}
      />
    </Tooltip>
  )
}
function FieldHelp({ children }) {
  return <p className='text-[11px] text-fg-muted mt-1 leading-snug'>{children}</p>
}

// ─── Tooltip glossary — physics-major level ────────────────────
const HELP = {
  n:      'Principal quantum number — sets the shell (row of the periodic table) and the mean orbital radius r ≈ n²a₀/Z. Larger n → higher energy, further from the nucleus, longer Bohr period.',
  l:      'Azimuthal (orbital angular momentum) quantum number, 0 ≤ ℓ ≤ n−1. Sets the orbital shape: ℓ=0 s (spherical), 1 p (dumbbell), 2 d, 3 f. Determines |L|² = ℓ(ℓ+1)ℏ².',
  m:      'Magnetic quantum number, −ℓ ≤ m ≤ +ℓ. Sets the z-projection L_z = mℏ — the orbital orientation in the magnetic-field axis.',
  Z:      'Atomic number Z — the number of protons in the nucleus. Uniquely identifies the element.',
  A:      'Mass number A = Z + N — total nucleons. Isotopes of a given element differ only in A.',
  N:      'Neutron count N = A − Z.',
  Ry:     'Rydberg energy Ry = 13.6057 eV. Bohr binding of hydrogen 1s. E_n = −Ry·Z²/n² for hydrogen-like ions.',
  a0:     'Bohr radius a₀ = 5.29177 × 10⁻¹¹ m. Natural length scale of atomic physics; r_n = n²a₀/Z for a hydrogen-like ion.',
  BperA:  'Binding energy per nucleon (MeV). Rises from ~1 MeV/A at deuterium, peaks at 8.79 MeV near ⁶²Ni, falls to ~7.6 MeV/A at U-238. The falling side is what powers fission; the rising side is what powers fusion.',
  Qalpha: 'Q_α = [M(A, Z) − M(A−4, Z−2) − M(⁴He)]·c². Positive Q → α decay is energetically allowed. Actinides typically Q_α ≈ 4–9 MeV.',
  QbetaM: 'Q_β⁻ = [M(A, Z) − M(A, Z+1)]·c². Positive Q → β⁻ allowed. n → p + e⁻ + ν̄, so a neutron-rich nuclide sheds an electron and a antineutrino to move toward stability.',
  QbetaP: 'Q_β⁺ = [M(A, Z) − M(A, Z−1)]·c² − 2m_e c². Positive Q → β⁺ allowed. p → n + e⁺ + ν, so a proton-rich nuclide emits a positron and a neutrino.',
  NoverZ: 'N/Z ratio. Stability follows a curve: 1.0 for light nuclei, rising to ~1.6 at U-238. Deviations trigger the corresponding β decay.',
  chain:  'Radioactive decay chain — every heavy nuclide decays step-by-step through daughters until it reaches a stable lead isotope. U-238 → 14 steps → Pb-206.',
  fission:'Neutron-induced fission of ²³⁵U: n + ²³⁵U → ²³⁶U* → two daughters + 2–3 neutrons + ~200 MeV. The two-hump yield curve peaks near mass 95 (Kr, Rb) and 137 (Ba, Cs).',
  chain_reaction: 'If each emitted neutron triggers another fission on average, k_eff = 1 — steady. k > 1 → super-critical (bomb / prompt-critical excursion). k < 1 → sub-critical (dies out).',
  cloud:  'Quantum cloud mode replaces the Bohr orbit with points sampled from the electron probability density |ψ_nℓm|² for a hydrogen-like ion. Bright regions are where the electron is most likely to be found on measurement.',
  SEMF:   'Semi-empirical mass formula, Bethe–Weizsäcker (1935). Treats the nucleus as a charged incompressible liquid drop with five terms: volume, surface, Coulomb, asymmetry, pairing.',
  Bohr:   'Bohr model — quantised circular orbits, r_n = n²a₀/Z, E_n = −Ry Z²/n². Superseded by full quantum mechanics but excellent for intuition (and dead accurate for hydrogen-like ions).',
}

// ─── Colours ──────────────────────────────────────────────────
const PROTON_COLOR   = '#f43f5e' // rose
const NEUTRON_COLOR  = '#9ca3af' // grey
const ELECTRON_COLOR = '#22d3ee' // cyan
const PHOTON_COLOR   = '#fbbf24' // amber
const ALPHA_COLOR    = '#a78bfa' // violet
const ORBIT_COLOR    = 'rgba(148,163,184,0.35)'

// ─── Isotope A default per Z — the "most abundant / long-lived" mass ───
function defaultA(Z) { return BY_Z.get(Z)?.Astable ?? Math.round(2 * Z + Z * 0.008 * Z) }

// Pack N particles into a spherical cluster around origin (Fibonacci sphere
// for outer shell, radial rings for interior). Fast enough for A ≤ 260.
function packNucleus(A) {
  const positions = []
  const R = Math.cbrt(A) * 0.9 // reduced nuclear radius, arb. units
  let placed = 0
  let ring = 0
  while (placed < A) {
    const targetRing = ring === 0 ? 1 : Math.min(6 * ring, A - placed)
    const r = ring === 0 ? 0 : (ring / (Math.cbrt(A) * 0.8)) * R
    for (let k = 0; k < targetRing; k++) {
      const golden = Math.PI * (3 - Math.sqrt(5))
      const y = ring === 0 ? 0 : 1 - (2 * k) / Math.max(1, targetRing - 1)
      const radius = Math.sqrt(Math.max(0, 1 - y * y))
      const theta = golden * (placed + k)
      positions.push([
        r * radius * Math.cos(theta),
        r * y,
        r * radius * Math.sin(theta),
      ])
    }
    placed += targetRing
    ring++
    if (ring > 40) break // safety
  }
  return positions.slice(0, A)
}

// ─── The page ─────────────────────────────────────────────────
export default function Atoms() {
  useEffect(() => { document.title = 'Atom · Nuclear Playground · Sid' }, [])

  // ── Nuclide state ──────────────────────────────────────────
  const [Z, setZ]         = useState(1)
  const [A, setA]         = useState(1)
  const [running, setRun] = useState(true)

  // ── Orbital mode ───────────────────────────────────────────
  const [mode, setMode]   = useState('bohr')  // 'bohr' | 'cloud'
  const [nQ, setN]        = useState(3)
  const [lQ, setL]        = useState(1)
  const [mQ, setM]        = useState(0)
  const [cloudN, setCloudN] = useState(35000) // # points

  // ── Radiation event log (rolling) ──────────────────────────
  const [events, setEvents] = useState([])
  const pushEvent = useCallback((e) => {
    setEvents(prev => [{ ...e, t: Date.now() }, ...prev].slice(0, 30))
  }, [])

  // ── Fission state ──────────────────────────────────────────
  const [chainReaction, setChainReaction] = useState(false)

  // ── Chain explorer state ───────────────────────────────────
  const [chainRoot, setChainRoot] = useState('U-238')
  const chain = useMemo(() => buildChain(chainRoot), [chainRoot])

  // ── Live perf badge ────────────────────────────────────────
  const [fps, setFps] = useState(0)
  const [particleCount, setPC] = useState(0)

  // ── Refs (canvas + engine state) ───────────────────────────
  const canvasRef  = useRef(null)
  const cloudRef   = useRef(null)     // Float32Array of xyz samples (units of a₀)
  const nucleusRef = useRef([])       // packed proton/neutron positions
  const emissionsRef = useRef([])     // moving particles on canvas
  const fissionRef = useRef({ grid: null, running: false, t: 0, chainOn: false })
  const rafRef     = useRef(null)
  const lastTsRef  = useRef(0)
  const fpsAccRef  = useRef({ frames: 0, t0: 0 })
  const angleRef   = useRef(0)        // global rotation, cloud + orbit
  const cloudRotRef = useRef({ x: -0.35, y: 0.6 })
  const dragRef    = useRef(null)

  // Nuclide element
  const element = BY_Z.get(Z) || BY_Z.get(1)
  const telemetry = useMemo(() => isotopeTelemetry(Z, A), [Z, A])

  // Ensure ℓ, m are in-range whenever n changes.
  useEffect(() => {
    if (lQ >= nQ) setL(nQ - 1)
    if (Math.abs(mQ) > lQ) setM(0)
  }, [nQ]) // eslint-disable-line

  useEffect(() => {
    if (Math.abs(mQ) > lQ) setM(0)
  }, [lQ]) // eslint-disable-line

  // Rebuild the nucleus + cloud whenever the nuclide or quantum #s change.
  useEffect(() => {
    nucleusRef.current = packNucleus(A)
  }, [A])

  useEffect(() => {
    if (mode !== 'cloud') { cloudRef.current = null; setPC(nucleusRef.current.length); return }
    cloudRef.current = sampleOrbital({ n: nQ, l: lQ, m: mQ, N: cloudN })
    setPC(cloudN + nucleusRef.current.length)
  }, [mode, nQ, lQ, mQ, cloudN, A])

  // ─── Element selection → sensible A + shell config guess ───
  const pickElement = useCallback((z) => {
    setZ(z)
    const A0 = defaultA(z)
    setA(A0)
    // Set the orbital sliders to the highest occupied shell if we're
    // in cloud mode — makes the visual actually reflect the element.
    const shells = BY_Z.get(z)?.shells || [1]
    const nHighest = shells.length
    setN(Math.max(1, Math.min(6, nHighest)))
    setL(0)
    setM(0)
    pushEvent({ kind: 'select', text: `Loaded ${BY_Z.get(z)?.symbol}-${A0} (Z=${z}, A=${A0})`, severity: 'info' })
  }, [pushEvent])

  // ─── Radiation buttons ─────────────────────────────────────
  const emit = useCallback((kind) => {
    const el = BY_Z.get(Z)
    const c = canvasRef.current
    if (!c) return
    const cx = c.clientWidth / 2
    const cy = c.clientHeight / 2
    const angle = Math.random() * Math.PI * 2
    const dir = [Math.cos(angle), Math.sin(angle)]
    let color = PHOTON_COLOR, label = 'γ', energyMeV = 0
    let dZ = 0, dA = 0, wavy = false

    if (kind === 'alpha') {
      const Q = alphaDecayQ(Z, A)
      color = ALPHA_COLOR; label = `α · ⁴He²⁺`; energyMeV = Q
      dZ = -2; dA = -4
    } else if (kind === 'beta-') {
      const Q = betaMinusQ(Z, A)
      color = ELECTRON_COLOR; label = `β⁻ · e⁻ + ν̄`; energyMeV = Q
      dZ = +1; dA = 0
    } else if (kind === 'beta+') {
      const Q = betaPlusQ(Z, A)
      color = '#f472b6'; label = `β⁺ · e⁺ + ν`; energyMeV = Q
      dZ = -1; dA = 0
    } else if (kind === 'gamma') {
      color = PHOTON_COLOR; label = 'γ photon'; energyMeV = 0.5 + Math.random() * 2
      wavy = true
    }

    emissionsRef.current.push({
      x: cx, y: cy, vx: dir[0] * 140, vy: dir[1] * 140,
      color, label: `${label} · ${energyMeV > 0 ? energyMeV.toFixed(2) + ' MeV' : ''}`,
      born: performance.now(), wavy,
    })

    // Nuclide transmutation on the periodic table.
    if (dZ !== 0 || dA !== 0) {
      const newZ = Math.max(1, Z + dZ)
      const newA = Math.max(1, A + dA)
      if (BY_Z.has(newZ)) {
        setZ(newZ); setA(newA)
        pushEvent({
          kind, severity: kind === 'alpha' ? 'warning' : 'info',
          text: `${el?.symbol}-${A} → ${BY_Z.get(newZ)?.symbol}-${newA}   ·   ${label}   ·   Q = ${energyMeV.toFixed(2)} MeV`,
        })
      }
    } else {
      pushEvent({ kind, severity: 'info', text: `${el?.symbol}-${A} emits ${label} — E ≈ ${energyMeV.toFixed(2)} MeV` })
    }
  }, [Z, A, pushEvent])

  // ─── U-235 fission ──────────────────────────────────────────
  // Thermal neutron capture → U-236* → daughters (Kr-92 + Ba-141 canonical),
  // + 2-3 fast neutrons, ~200 MeV. Chain-reaction toggle: emitted neutrons
  // travel across a 4x4 grid of U-235 atoms, each with capture prob p.
  const fireNeutron = useCallback(() => {
    if (Z !== 92 || A !== 235) {
      // switch to U-235 automatically
      setZ(92); setA(235)
    }
    const c = canvasRef.current
    if (!c) return
    const W = c.clientWidth, H = c.clientHeight

    // Grid setup on first fire when chain-reaction is on.
    if (chainReaction && !fissionRef.current.grid) {
      const cols = 5, rows = 3
      const grid = []
      for (let r = 0; r < rows; r++) {
        for (let c2 = 0; c2 < cols; c2++) {
          grid.push({
            x: (c2 + 0.5) * W / cols,
            y: (r + 0.5) * H / rows,
            spent: false, glow: 0,
          })
        }
      }
      fissionRef.current.grid = grid
    }

    // Approaching neutron
    emissionsRef.current.push({
      x: -20, y: H / 2, vx: 260, vy: 0,
      color: NEUTRON_COLOR, label: 'n (thermal · 0.025 eV)', born: performance.now(),
      isNeutron: true, canFission: true,
    })
    pushEvent({ kind: 'fission-neutron', severity: 'info', text: 'Thermal neutron incoming → target ²³⁵U' })
  }, [Z, A, chainReaction, pushEvent])

  // ─── The render loop ────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const step = (ts) => {
      const dt = lastTsRef.current ? Math.min(0.05, (ts - lastTsRef.current) / 1000) : 1/60
      lastTsRef.current = ts

      // FPS averaged over 20 frames.
      const acc = fpsAccRef.current
      acc.frames++
      if (!acc.t0) acc.t0 = ts
      if (ts - acc.t0 > 500) {
        setFps(Math.round(acc.frames * 1000 / (ts - acc.t0)))
        acc.frames = 0; acc.t0 = ts
      }

      // Resize with DPR.
      const parent = canvas.parentElement
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = parent.clientWidth
      const h = parent.clientHeight
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr; canvas.height = h * dpr
        canvas.style.width = w + 'px'; canvas.style.height = h + 'px'
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }

      // Wipe with a subtle vignette background.
      const grad = ctx.createRadialGradient(w/2, h/2, 20, w/2, h/2, Math.max(w, h) * 0.7)
      grad.addColorStop(0, '#0d0d14')
      grad.addColorStop(1, '#050508')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)

      const cx = w / 2, cy = h / 2

      // Rotate global (for cloud + orbit).
      if (running) angleRef.current += dt * 0.35

      // ── Nucleus ─────────────────────────────────────────
      const nucleons = nucleusRef.current
      const scale = Math.min(w, h) * 0.045
      for (let i = 0; i < nucleons.length; i++) {
        const p = nucleons[i]
        const rot = angleRef.current * 0.25
        const c = Math.cos(rot), s = Math.sin(rot)
        const x = p[0] * c - p[2] * s
        const z = p[0] * s + p[2] * c
        const y = p[1]
        // depth cue
        const persp = 1 / (1 - z * 0.02)
        const sx = cx + x * scale * persp
        const sy = cy + y * scale * persp
        const isProton = i < Z
        ctx.fillStyle = isProton ? PROTON_COLOR : NEUTRON_COLOR
        ctx.beginPath()
        ctx.arc(sx, sy, 4 * persp, 0, Math.PI * 2)
        ctx.fill()
      }

      // ── Electron cloud OR Bohr orbits ───────────────────
      if (mode === 'cloud' && cloudRef.current) {
        const pts = cloudRef.current
        const count = pts.length / 3
        // rotate around x then y using cloudRotRef
        const rx = cloudRotRef.current.x
        const ry = cloudRotRef.current.y + angleRef.current * 0.15
        const cxr = Math.cos(rx), sxr = Math.sin(rx)
        const cyr = Math.cos(ry), syr = Math.sin(ry)
        const s2 = Math.min(w, h) * 0.032  // pixels per a₀
        ctx.fillStyle = '#22d3ee'
        for (let i = 0; i < count; i++) {
          let x = pts[3*i]
          let y = pts[3*i + 1]
          let z = pts[3*i + 2]
          // rotate x-axis
          const y1 = y * cxr - z * sxr
          const z1 = y * sxr + z * cxr
          // rotate y-axis
          const x2 = x * cyr + z1 * syr
          const z2 = -x * syr + z1 * cyr
          // perspective
          const persp = 1 / (1 + z2 * 0.008)
          const sx = cx + x2 * s2 * persp
          const sy = cy + y1 * s2 * persp
          const shade = 0.35 + persp * 0.4
          // encode depth as alpha
          ctx.fillStyle = `rgba(34,211,238,${Math.min(0.95, shade * 0.9).toFixed(3)})`
          ctx.fillRect(sx, sy, 1.4, 1.4)
        }
        // orbital label
        ctx.fillStyle = 'rgba(255,255,255,0.7)'
        ctx.font = '12px ui-monospace, Menlo, monospace'
        ctx.fillText(`ψ_{n=${nQ}, ℓ=${lQ}, m=${mQ}}  ·  |ψ|²  ·  ${count.toLocaleString()} samples`, 12, 20)
      } else {
        // Bohr shell rings + orbiting electrons.
        const shells = BY_Z.get(Z)?.shells || [1]
        for (let sIx = 0; sIx < shells.length; sIx++) {
          const nS = sIx + 1
          // r_n scaled to pixels; skip nucleus radius floor
          const r = 40 + nS * 40 * Math.pow(Math.min(w, h) / 700, 0.5)
          ctx.strokeStyle = ORBIT_COLOR
          ctx.lineWidth = 1
          ctx.setLineDash([3, 4])
          ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.35, 0, 0, Math.PI * 2); ctx.stroke()
          ctx.setLineDash([])

          const nElectrons = shells[sIx]
          const period = Math.pow(nS, 3) * 3   // τ ∝ n³
          const ω = 2 * Math.PI / period
          const t = angleRef.current * (running ? 1 : 0)
          for (let k = 0; k < nElectrons; k++) {
            const φ = (k / nElectrons) * Math.PI * 2 + ω * t
            const ex = cx + Math.cos(φ) * r
            const ey = cy + Math.sin(φ) * r * 0.35
            ctx.fillStyle = ELECTRON_COLOR
            ctx.beginPath(); ctx.arc(ex, ey, 3, 0, Math.PI * 2); ctx.fill()
            // motion blur trail
            ctx.strokeStyle = 'rgba(34,211,238,0.35)'
            ctx.lineWidth = 1
            ctx.beginPath()
            const φ2 = φ - 0.4
            ctx.moveTo(cx + Math.cos(φ2) * r, cy + Math.sin(φ2) * r * 0.35)
            ctx.lineTo(ex, ey)
            ctx.stroke()
          }
        }
        // element label
        const symBig = element?.symbol || '?'
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.font = 'bold 22px ui-sans-serif, system-ui'
        ctx.fillText(`${symBig}`, cx - 12, cy + 8)
        ctx.font = '11px ui-monospace, Menlo, monospace'
        ctx.fillStyle = 'rgba(255,255,255,0.5)'
        ctx.fillText(`Z=${Z}  A=${A}`, 12, 20)
      }

      // ── Emission particles ──────────────────────────────
      const now = performance.now()
      const remaining = []
      for (const p of emissionsRef.current) {
        const age = (now - p.born) / 1000
        p.x += p.vx * dt
        p.y += p.vy * dt

        // Fission trigger: neutron hits U-235 grid cell OR nucleus.
        if (p.isNeutron && p.canFission) {
          // grid case
          if (chainReaction && fissionRef.current.grid) {
            for (const cell of fissionRef.current.grid) {
              if (cell.spent) continue
              const dx = p.x - cell.x, dy = p.y - cell.y
              if (dx*dx + dy*dy < 24*24) {
                cell.spent = true; cell.glow = 1
                spawnFissionProducts(cell.x, cell.y, emissionsRef, pushEvent, /* chainOn */ true, Z, A)
                p.canFission = false
                break
              }
            }
          } else {
            // single nucleus at center
            const dx = p.x - cx, dy = p.y - cy
            if (dx*dx + dy*dy < 36*36) {
              spawnFissionProducts(cx, cy, emissionsRef, pushEvent, /* chainOn */ false, Z, A)
              p.canFission = false
              // switch nuclide to U-236* → immediately split → conceptually
              // "used", so keep visual but stop the neutron.
              p.vx = 0; p.vy = 0; p.color = 'rgba(255,255,255,0.2)'; p.dying = true
            }
          }
        }

        // Cull off-screen or too old (dying).
        const off = p.x < -50 || p.x > w + 50 || p.y < -50 || p.y > h + 50
        if (age > 4 || off) continue
        remaining.push(p)

        // Draw the particle + trail.
        if (p.wavy) {
          ctx.strokeStyle = p.color
          ctx.lineWidth = 1.4
          ctx.beginPath()
          for (let k = -30; k <= 0; k++) {
            const tx = p.x - k * (p.vx / 100)
            const ty = p.y - k * (p.vy / 100) + Math.sin(k * 0.6 + age * 8) * 4
            if (k === -30) ctx.moveTo(tx, ty)
            else ctx.lineTo(tx, ty)
          }
          ctx.stroke()
        } else {
          ctx.fillStyle = p.color
          ctx.beginPath(); ctx.arc(p.x, p.y, p.isNeutron ? 5 : 4, 0, Math.PI * 2); ctx.fill()
          ctx.strokeStyle = p.color + '88'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(p.x - p.vx * 0.15, p.y - p.vy * 0.15)
          ctx.lineTo(p.x, p.y)
          ctx.stroke()
        }
        if (p.label && age < 1.2) {
          ctx.font = '10px ui-monospace, Menlo, monospace'
          ctx.fillStyle = 'rgba(255,255,255,0.75)'
          ctx.fillText(p.label, p.x + 8, p.y - 6)
        }
      }
      emissionsRef.current = remaining

      // ── Fission grid — highlight spent cells ────────────
      if (chainReaction && fissionRef.current.grid) {
        for (const cell of fissionRef.current.grid) {
          if (cell.glow > 0) {
            ctx.fillStyle = `rgba(251,191,36,${(cell.glow * 0.35).toFixed(3)})`
            ctx.beginPath(); ctx.arc(cell.x, cell.y, 24, 0, Math.PI * 2); ctx.fill()
            cell.glow *= 0.94
          } else {
            ctx.strokeStyle = cell.spent ? 'rgba(148,163,184,0.15)' : 'rgba(251,191,36,0.25)'
            ctx.setLineDash([2, 3])
            ctx.beginPath(); ctx.arc(cell.x, cell.y, 20, 0, Math.PI * 2); ctx.stroke()
            ctx.setLineDash([])
            if (!cell.spent) {
              ctx.fillStyle = 'rgba(251,191,36,0.8)'
              ctx.font = '10px ui-monospace, Menlo, monospace'
              ctx.fillText('²³⁵U', cell.x - 12, cell.y + 3)
            }
          }
        }
      }

      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [Z, A, mode, running, chainReaction, nQ, lQ, mQ, element, pushEvent])

  // Drag on canvas → rotate cloud.
  const onPointerDown = (e) => {
    dragRef.current = { x: e.clientX, y: e.clientY, rx: cloudRotRef.current.x, ry: cloudRotRef.current.y }
  }
  const onPointerMove = (e) => {
    const d = dragRef.current
    if (!d) return
    cloudRotRef.current.x = d.rx + (e.clientY - d.y) * 0.008
    cloudRotRef.current.y = d.ry + (e.clientX - d.x) * 0.008
  }
  const onPointerUp = () => { dragRef.current = null }

  // ─── Render ───────────────────────────────────────────────
  return (
    <div className='min-h-screen bg-[#0a0a0e] text-fg-primary'>
      {/* ── Hero strip ───────────────────────────────────── */}
      <div className='pt-24 sm:pt-28 px-4 sm:px-8 lg:px-12 max-w-[1400px] mx-auto'>
        <div className='flex items-center gap-2 mb-3 flex-wrap'>
          <p className='eyebrow-mono font-bold text-amber-300/80'>— Nuclear Playground</p>
          <span className='text-fg-muted text-xs'>·</span>
          <span className='text-[10px] font-mono uppercase tracking-widest text-fg-muted'>
            algorithm: C++ core ported to JS · Bethe-Weizsäcker · Bohr · Schrödinger
          </span>
        </div>
        <h1 className='gradient-text-amber font-poppins font-black tracking-tight leading-[0.95] text-3xl sm:text-4xl md:text-5xl mb-2'>
          Atom · Nuclear Physics Playground
        </h1>
        <p className='text-fg-muted text-sm sm:text-base leading-relaxed max-w-3xl mb-4'>
          Click an element to load its Z, N and shell configuration. Watch electrons orbit in
          Bohr shells or switch to a probability-cloud render sampled from |ψ<sub>nℓm</sub>|² for
          hydrogen-like orbitals. Fire α, β, γ from the radiation panel to transmute the nuclide
          on the periodic table in real time. For ²³⁵U, fire a thermal neutron to trigger fission —
          toggle chain reaction to watch neutrons cascade across a grid.
        </p>
        <div className='flex flex-wrap items-center gap-2 mb-6'>
          <Badge label={`${fps} fps`}      color='emerald' />
          <Badge label={`${particleCount.toLocaleString()} particles`} color='cyan' />
          <Badge label={`${element?.symbol}-${A}  ·  Z=${Z}, N=${A - Z}`} color='amber' />
          <Badge label={`stability · ${telemetry.stability}`} color={stabilityColor(telemetry.stability)} />
          <Badge label={`B/A · ${telemetry.BperA.toFixed(3)} MeV`} color='rose' />
        </div>
      </div>

      {/* ── Main content grid ────────────────────────────── */}
      <div className='px-4 sm:px-8 lg:px-12 max-w-[1400px] mx-auto pb-16'>
        {/* ── Panel 1: Periodic table ─────────────────── */}
        <div className='luxe-glass p-4 mb-4'>
          <div className='flex items-center gap-2 mb-3'>
            <RadarChartOutlined className='text-amber-300' />
            <p className='eyebrow-mono font-bold text-amber-300/80'>— Periodic table  ·  click to load the nuclide</p>
            <span className='ml-auto text-[10px] font-mono text-fg-muted'>H → Cf  ·  Z = 1..98</span>
          </div>
          <PeriodicTable Z={Z} onPick={pickElement} />
          <div className='mt-3 flex flex-wrap items-center gap-3 text-[11px] text-fg-muted'>
            <CatChip cat='nonmetal' label='nonmetal' />
            <CatChip cat='noble' label='noble gas' />
            <CatChip cat='alkali' label='alkali' />
            <CatChip cat='alkaline' label='alkaline earth' />
            <CatChip cat='metalloid' label='metalloid' />
            <CatChip cat='halogen' label='halogen' />
            <CatChip cat='transition' label='transition' />
            <CatChip cat='poor-metal' label='poor metal' />
            <CatChip cat='lanthanide' label='lanthanide' />
            <CatChip cat='actinide' label='actinide' />
          </div>
        </div>

        {/* ── Row: canvas + right column ───────────────── */}
        <div className='grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4'>
          {/* Bohr / cloud canvas */}
          <div className='xl:col-span-2 luxe-glass p-3'>
            <div className='flex items-center gap-2 mb-2 flex-wrap'>
              <ThunderboltFilled className='text-cyan-300' />
              <p className='eyebrow-mono font-bold text-cyan-300/80'>— {mode === 'cloud' ? 'Quantum probability cloud' : 'Bohr model'}  ·  {element?.symbol}-{A}</p>
              <span className='ml-auto flex items-center gap-2'>
                <Segmented
                  size='small'
                  value={mode}
                  onChange={setMode}
                  options={[
                    { label: 'Bohr orbits', value: 'bohr' },
                    { label: 'Quantum cloud', value: 'cloud' },
                  ]}
                />
                <button
                  onClick={() => setRun(r => !r)}
                  className='luxe-btn luxe-btn-secondary text-xs'
                  aria-label={running ? 'Pause' : 'Play'}
                >
                  {running ? <><PauseCircleFilled /> Pause</> : <><PlayCircleFilled /> Play</>}
                </button>
                <button
                  onClick={() => {
                    emissionsRef.current = []
                    fissionRef.current.grid = null
                    setEvents([])
                  }}
                  className='luxe-btn luxe-btn-secondary text-xs'>
                  <ReloadOutlined /> Clear
                </button>
              </span>
            </div>
            <div style={{ aspectRatio: '1 / 1' }} className='w-full max-w-[720px] mx-auto'>
              <canvas
                ref={canvasRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
                style={{ display: 'block', width: '100%', height: '100%', borderRadius: 12, cursor: mode === 'cloud' ? 'grab' : 'default' }}
              />
            </div>
            <p className='text-[11px] text-fg-muted mt-2'>
              {mode === 'cloud'
                ? <>Drag to rotate. Points are Monte-Carlo samples of <Sym tex='|\psi_{n\ell m}|^2' help={HELP.cloud} /> — brighter regions = higher probability of finding the electron.</>
                : <>Electrons orbit at Bohr-model speed τ ∝ n³. Inner shells sweep faster. Toggle to <b>Quantum cloud</b> for the real probability density.</>}
            </p>
          </div>

          {/* Right column: quantum sliders + radiation panel */}
          <div className='space-y-4'>
            {/* Quantum-number panel */}
            <div className='luxe-glass p-4'>
              <div className='flex items-center gap-2 mb-3'>
                <InfoCircleOutlined className='text-fuchsia-300' />
                <p className='eyebrow-mono font-bold text-fuchsia-300/80'>— Orbital quantum numbers</p>
              </div>
              <div>
                <div className='flex items-center justify-between text-[11px] mb-0.5'>
                  <span className='text-fg-muted flex items-center gap-1'><Sym tex='n' help={HELP.n} /> <span className='text-fg-dim'>(shell)</span></span>
                </div>
                <div className='flex items-center gap-2'>
                  <div className='flex-1 min-w-0'>
                    <Slider min={1} max={6} step={1} value={nQ} onChange={setN} accent='amber' tooltip={{ open: false }} />
                  </div>
                  <InputNumber
                    size='small'
                    min={1} max={6} step={1} precision={0}
                    parser={(v) => (v ?? '').replace(/[^-0-9]/g, '')}
                    value={nQ} onChange={v => Number.isFinite(v) && setN(v)}
                    className='w-[92px] shrink-0 font-mono text-amber-300'
                    onBlur={(e) => {
                      const n = Number(e.target.value)
                      if (Number.isFinite(n)) setN(Math.min(6, Math.max(1, Math.round(n))))
                    }}
                  />
                </div>
                <FieldHelp>Principal quantum number. Sets the shell — same idea as the row of the periodic table. r_n ≈ n²a₀/Z.</FieldHelp>
              </div>
              <div className='mt-2'>
                <div className='flex items-center justify-between text-[11px] mb-0.5'>
                  <span className='text-fg-muted flex items-center gap-1'><Sym tex='\ell' help={HELP.l} /> <span className='text-fg-dim'>(shape)</span></span>
                  <span className='font-mono text-fg-dim'>· { ['s','p','d','f','g','h'][lQ] ?? '?' }</span>
                </div>
                <div className='flex items-center gap-2'>
                  <div className='flex-1 min-w-0'>
                    <Slider min={0} max={Math.max(0, nQ - 1)} step={1} value={lQ} onChange={setL} accent='rose' tooltip={{ open: false }} />
                  </div>
                  <InputNumber
                    size='small'
                    min={0} max={Math.max(0, nQ - 1)} step={1} precision={0}
                    parser={(v) => (v ?? '').replace(/[^-0-9]/g, '')}
                    value={lQ} onChange={v => Number.isFinite(v) && setL(v)}
                    className='w-[92px] shrink-0 font-mono text-rose-300'
                    onBlur={(e) => {
                      const n = Number(e.target.value)
                      const maxL = Math.max(0, nQ - 1)
                      if (Number.isFinite(n)) setL(Math.min(maxL, Math.max(0, Math.round(n))))
                    }}
                  />
                </div>
                <FieldHelp>Azimuthal (angular) quantum number, 0 ≤ ℓ ≤ n−1. Sets the orbital shape: s / p / d / f.</FieldHelp>
              </div>
              <div className='mt-2'>
                <div className='flex items-center justify-between text-[11px] mb-0.5'>
                  <span className='text-fg-muted flex items-center gap-1'><Sym tex='m_\ell' help={HELP.m} /> <span className='text-fg-dim'>(orientation)</span></span>
                </div>
                <div className='flex items-center gap-2'>
                  <div className='flex-1 min-w-0'>
                    <Slider min={-lQ} max={lQ} step={1} value={mQ} onChange={setM} accent='cyan' tooltip={{ open: false }} />
                  </div>
                  <InputNumber
                    size='small'
                    min={-lQ} max={lQ} step={1} precision={0}
                    parser={(v) => (v ?? '').replace(/[^-0-9]/g, '')}
                    value={mQ} onChange={v => Number.isFinite(v) && setM(v)}
                    className='w-[92px] shrink-0 font-mono text-cyan-300'
                    onBlur={(e) => {
                      const n = Number(e.target.value)
                      if (Number.isFinite(n)) setM(Math.min(lQ, Math.max(-lQ, Math.round(n))))
                    }}
                  />
                </div>
                <FieldHelp>Magnetic quantum number, −ℓ ≤ m ≤ +ℓ. Rotates the orbital in the magnetic-field axis.</FieldHelp>
              </div>
              <div className='mt-2'>
                <div className='flex items-center justify-between text-[11px] mb-0.5'>
                  <span className='text-fg-muted'>Cloud samples</span>
                </div>
                <div className='flex items-center gap-2'>
                  <div className='flex-1 min-w-0'>
                    <Slider min={5000} max={80000} step={1000} value={cloudN} onChange={setCloudN} accent='emerald' tooltip={{ open: false }} />
                  </div>
                  <InputNumber
                    size='small'
                    min={5000} max={80000} step={1000} precision={0}
                    parser={(v) => (v ?? '').replace(/[^-0-9]/g, '')}
                    value={cloudN} onChange={v => Number.isFinite(v) && setCloudN(v)}
                    className='w-[92px] shrink-0 font-mono text-emerald-300'
                    onBlur={(e) => {
                      const n = Number(e.target.value)
                      if (Number.isFinite(n)) setCloudN(Math.min(80000, Math.max(5000, Math.round(n))))
                    }}
                  />
                </div>
                <FieldHelp>Number of Monte-Carlo samples of |ψ|². More = crisper cloud, less = smoother frame rate.</FieldHelp>
              </div>
            </div>

            {/* Radiation panel */}
            <div className='luxe-glass p-4'>
              <div className='flex items-center gap-2 mb-3'>
                <FireFilled className='text-rose-300' />
                <p className='eyebrow-mono font-bold text-rose-300/80'>— Radioactive decay</p>
              </div>
              <div className='grid grid-cols-2 gap-2'>
                <DecayBtn label='α  ·  ⁴He'   sub='Z−2, A−4'    color='violet'  onClick={() => emit('alpha')}
                  help='Emits an alpha (⁴He nucleus, 2p+2n). Z drops by 2, A by 4. Q_α ≈ [M(A,Z) − M(A−4,Z−2) − M(⁴He)]c². Actinides and heavier: Q typically 4–9 MeV.' />
                <DecayBtn label='β⁻ · e⁻ + ν̄' sub='Z+1, A same' color='cyan'    onClick={() => emit('beta-')}
                  help='A neutron in the nucleus converts to a proton via the weak force: n → p + e⁻ + ν̄. Z rises by 1, A unchanged.' />
                <DecayBtn label='β⁺ · e⁺ + ν'  sub='Z−1, A same' color='pink'    onClick={() => emit('beta+')}
                  help='A proton converts to a neutron: p → n + e⁺ + ν. Requires Q > 1.022 MeV (2m_e c²).' />
                <DecayBtn label='γ · photon'   sub='no ΔZ, ΔA'  color='amber'   onClick={() => emit('gamma')}
                  help='Nucleus in an excited state relaxes to the ground state by emitting a high-energy photon. Z, A unchanged.' />
              </div>
              <p className='text-[11px] text-fg-muted mt-3'>
                Each emission transmutes the nuclide on the periodic table above.
                Sensible for the current Z/A: <b>{recommendedMode(telemetry)}</b>.
              </p>
            </div>

            {/* Fission panel */}
            <div className='luxe-glass p-4'>
              <div className='flex items-center gap-2 mb-3'>
                <WarningFilled className='text-rose-300' />
                <p className='eyebrow-mono font-bold text-rose-300/80'>— Neutron-induced fission  ·  ²³⁵U</p>
              </div>
              <div className='flex flex-wrap gap-2 items-center'>
                <button className='luxe-btn luxe-btn-primary text-xs' onClick={fireNeutron}>
                  Fire thermal neutron
                </button>
                <div className='flex items-center gap-2'>
                  <span className='text-[11px] text-fg-muted'>Chain reaction</span>
                  <Switch checked={chainReaction} onChange={setChainReaction} size='small' />
                </div>
                <button className='luxe-btn luxe-btn-secondary text-xs ml-auto'
                  onClick={() => { fissionRef.current.grid = null; emissionsRef.current = []; }}>
                  <ReloadOutlined /> Reset grid
                </button>
              </div>
              <FieldHelp>
                n + ²³⁵U → ²³⁶U* → ⁹²Kr + ¹⁴¹Ba + 2–3 n + <b className='text-amber-300'>~200 MeV</b>.
                Chain-reaction toggle populates a 5 × 3 grid of ²³⁵U nuclei — emitted neutrons can trigger neighbours.
                Kinetic energy of an escaping neutron is ≈ 2 MeV (fast); thermalisation is what enables water-moderated LWRs.
              </FieldHelp>
            </div>
          </div>
        </div>

        {/* ── Row: telemetry + decay chain ────────────── */}
        <div className='grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4'>
          {/* Telemetry */}
          <div className='luxe-glass p-4'>
            <p className='eyebrow-mono font-bold text-amber-300/80 mb-3'>— Live telemetry</p>
            <ul className='space-y-2 text-[13px]'>
              <TelRow k={<><Sym tex='Z' help={HELP.Z} /> · protons</>} v={Z} tone='amber' />
              <TelRow k={<><Sym tex='A' help={HELP.A} /> · mass number</>} v={A} tone='rose' />
              <TelRow k={<><Sym tex='N' help={HELP.N} /> · neutrons</>} v={A - Z} tone='cyan' />
              <TelRow k={<>N/Z ratio</>} v={telemetry.NoverZ.toFixed(3)} tone='fuchsia' help={HELP.NoverZ} />
              <TelRow k={<><Sym tex='B/A' help={HELP.BperA} /> · binding · MeV</>} v={telemetry.BperA.toFixed(3)} tone='emerald' />
              <TelRow k={<><Sym tex='B' help='Total nuclear binding energy from Bethe-Weizsäcker.' /> · total · MeV</>} v={telemetry.B.toFixed(1)} tone='cyan' />
              <TelRow k={<><Sym tex='\delta' help='Pairing term δ(A,Z) — positive for even-even, negative for odd-odd, zero for odd-A.' /> · pairing</>} v={telemetry.delta.toFixed(3)} tone='pink' />
              <TelRow k={<><Sym tex='Q_\alpha' help={HELP.Qalpha} /> · alpha · MeV</>} v={telemetry.Qalpha.toFixed(3)} tone='violet' />
              <TelRow k={<><Sym tex='Q_{\beta^-}' help={HELP.QbetaM} /> · β⁻ · MeV</>} v={telemetry.Qbeta.toFixed(3)} tone='cyan' />
              <TelRow k={<><Sym tex='Q_{\beta^+}' help={HELP.QbetaP} /> · β⁺ · MeV</>} v={telemetry.Qpos.toFixed(3)} tone='pink' />
              <TelRow k={<>Bohr radius r_1 · pm</>} v={(bohrRadius(1, Z) * 1e12).toFixed(2)} tone='cyan' help={HELP.a0} />
              <TelRow k={<>E_1 · eV</>} v={bohrEnergy(1, Z).toFixed(1)} tone='amber' help='Ground-state binding of a single electron in a hydrogen-like ion of nuclear charge Z.' />
              <TelRow
                k={<>Half-life · <span className='text-fg-dim'>{element?.symbol}-{A}</span></>}
                v={ISOTOPES[`${element?.symbol}-${A}`] ? fmtHalfLife(ISOTOPES[`${element?.symbol}-${A}`].halfLife) : '—'}
                tone='amber'
              />
            </ul>
          </div>

          {/* Decay chain explorer */}
          <div className='luxe-glass p-4 lg:col-span-2'>
            <div className='flex items-center gap-2 mb-3 flex-wrap'>
              <p className='eyebrow-mono font-bold text-fuchsia-300/80'>— Decay chain explorer</p>
              <Segmented
                size='small'
                value={chainRoot}
                onChange={setChainRoot}
                options={CHAIN_ROOTS.map(r => ({ label: r, value: r }))}
              />
              <span className='ml-auto text-[10px] font-mono text-fg-muted'>{chain.nodes.length} nodes</span>
            </div>
            <DecayGraph chain={chain} currentSym={`${element?.symbol}-${A}`} onPick={(id) => {
              const iso = ISOTOPES[id]
              if (iso) { setZ(iso.Z); setA(iso.A); pushEvent({ kind: 'chain-jump', text: `Jumped to ${id}`, severity: 'info' }) }
            }} />
            <FieldHelp>
              Every heavy nuclide decays through a chain of daughters until reaching a stable Pb isotope. Half-lives quoted from IAEA LiveChart / AME2020. Click any node to load that isotope.
            </FieldHelp>
          </div>
        </div>

        {/* ── Row: events log ─────────────────────────── */}
        <div className='luxe-glass p-4 mb-4'>
          <div className='flex items-center gap-2 mb-3'>
            <ExperimentOutlined className='text-cyan-300' />
            <p className='eyebrow-mono font-bold text-cyan-300/80'>— Event log</p>
            <span className='ml-auto text-[10px] font-mono text-fg-muted'>{events.length} events</span>
          </div>
          {events.length === 0 ? (
            <p className='text-[11px] text-fg-muted italic'>No events yet. Pick an element or fire a decay button.</p>
          ) : (
            <ol className='space-y-1.5'>
              {events.map((e, i) => (
                <li key={i} className='flex items-start gap-3 text-[12px]'>
                  <span className={`shrink-0 mt-1 w-2 h-2 rounded-full ${sevDot(e.severity)}`} />
                  <span className='text-fg-primary/90'>{e.text}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* ── Row: equations (KaTeX) ──────────────────── */}
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4'>
          <div className='luxe-glass p-4'>
            <p className='eyebrow-mono font-bold mb-3 text-cyan-300/80'>— Bohr model</p>
            <Tex display src={String.raw`r_n = \dfrac{n^2 \hbar^2}{m_e k_e e^2 \, Z} \;=\; \dfrac{n^2 a_0}{Z}`} />
            <Tex display src={String.raw`E_n = -\dfrac{Z^2 \, k_e^2 \, e^4 \, m_e}{2 \hbar^2 n^2} \;=\; -\dfrac{13.606\ \text{eV} \cdot Z^2}{n^2}`} />
            <p className='text-[11px] text-fg-muted mt-2'>
              <Sym tex='n' help={HELP.n} /> — principal quantum number.
              <Sym tex='a_0' help={HELP.a0} /> — Bohr radius.
              <Sym tex='Z' help={HELP.Z} /> — nuclear charge.
              For hydrogen (Z=1) the ground state radius is 52.9 pm, energy −13.6 eV.
            </p>
          </div>

          <div className='luxe-glass p-4'>
            <p className='eyebrow-mono font-bold mb-3 text-fuchsia-300/80'>— Hydrogen orbital ψ(r,θ,φ)</p>
            <Tex display src={String.raw`\psi_{n\ell m}(r,\theta,\phi) \;=\; R_{n\ell}(r)\, Y_{\ell}^{m}(\theta,\phi)`} />
            <Tex display src={String.raw`R_{n\ell}(r) \propto e^{-\rho/2}\, \rho^{\ell}\, L_{n-\ell-1}^{2\ell+1}(\rho), \quad \rho = \dfrac{2r}{n a_0}`} />
            <p className='text-[11px] text-fg-muted mt-2'>
              <Sym tex='R_{n\ell}' help='Radial part of the orbital, built from an associated Laguerre polynomial.' /> is sampled by inverse-CDF over r²|R|², <Sym tex='Y_{\ell}^{m}' help='Spherical harmonic — the angular part of the orbital. Combines an associated Legendre polynomial with e^(imφ).' /> by inverse-CDF over sinθ|P_ℓ^m|², with φ uniform. Same kernel as the C++ raytracer.
            </p>
          </div>

          <div className='luxe-glass p-4'>
            <p className='eyebrow-mono font-bold mb-3 text-amber-300/80'>— Semi-empirical mass formula (Bethe–Weizsäcker)</p>
            <Tex display src={String.raw`B(A,Z) = a_V A - a_S A^{2/3} - a_C\dfrac{Z(Z-1)}{A^{1/3}} - a_A\dfrac{(A-2Z)^2}{A} + \delta(A,Z)`} />
            <p className='text-[11px] text-fg-muted mt-2'>
              Volume <Sym tex='a_V' help='a_V ≈ 15.75 MeV — strong-force binding proportional to nucleon count.' />,
              surface <Sym tex='a_S' help='a_S ≈ 17.80 MeV — surface nucleons have fewer neighbours, so binding drops.' />,
              Coulomb <Sym tex='a_C' help='a_C ≈ 0.711 MeV — protons repel each other electrostatically.' />,
              asymmetry <Sym tex='a_A' help='a_A ≈ 23.7 MeV — the Pauli exclusion + isospin term. Wants N = Z for light nuclei.' />,
              pairing <Sym tex='\delta' help='± aP / √A for even-even / odd-odd, zero for odd-A. From the nuclear pairing force.' />.
            </p>
          </div>

          <div className='luxe-glass p-4'>
            <p className='eyebrow-mono font-bold mb-3 text-rose-300/80'>— Radioactive decay & α energetics</p>
            <Tex display src={String.raw`N(t) = N_0\, e^{-\lambda t}, \quad t_{1/2} = \dfrac{\ln 2}{\lambda}`} />
            <Tex display src={String.raw`Q_\alpha = \bigl[M(A,Z) - M(A-4, Z-2) - M(^{4}\!\text{He})\bigr] c^2`} />
            <p className='text-[11px] text-fg-muted mt-2'>
              <Sym tex='\lambda' help='λ = ln 2 / t₁/₂. First-order decay constant.' /> — decay constant.
              <Sym tex='Q_\alpha' help={HELP.Qalpha} /> — kinetic energy released by α emission. Actinide α energies fall on the Geiger-Nuttall line: log t₁/₂ = a/√Q_α + b.
            </p>
          </div>
        </div>

        {/* ── Footer note ─────────────────────────────── */}
        <div className='luxe-glass p-4 text-[12px] text-fg-muted leading-relaxed'>
          <p className='eyebrow-mono font-bold mb-2 text-fg-dim'>— Sources & implementation notes</p>
          <p>
            Sampling kernel: direct JS port of <b className='text-amber-300'>kavan010/Atoms</b> (E:/Github/Atoms/src/atom_raytracer.cpp) — CDF-sampled hydrogen-like orbitals via associated Laguerre × associated Legendre polynomials. Emscripten was not available on this machine so the C++ math kernel was rewritten in JS with identical recurrences; the public sim API mirrors what the WASM export would have been.
            &nbsp;·&nbsp;
            Isotope data & half-lives from <b>IAEA LiveChart of Nuclides</b> and <b>AME2020</b>. Semi-empirical mass coefficients from Rohlf (1994).
            &nbsp;·&nbsp;
            Bethe-Weizsäcker Q-values are estimates — real Q-values track the AME table more tightly for the pairing term. For research use, cross-check against IAEA data.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────
function Badge({ label, color = 'amber' }) {
  const map = {
    amber:   'bg-amber-500/10 text-amber-200 border-amber-500/30',
    cyan:    'bg-cyan-500/10 text-cyan-200 border-cyan-500/30',
    rose:    'bg-rose-500/10 text-rose-200 border-rose-500/30',
    emerald: 'bg-emerald-500/10 text-emerald-200 border-emerald-500/30',
    fuchsia: 'bg-fuchsia-500/10 text-fuchsia-200 border-fuchsia-500/30',
    violet:  'bg-violet-500/10 text-violet-200 border-violet-500/30',
    pink:    'bg-pink-500/10 text-pink-200 border-pink-500/30',
  }
  return <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border font-mono text-[10px] ${map[color] || map.amber}`}>{label}</span>
}

function CatChip({ cat, label }) {
  const c = CAT_COLORS[cat]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border ${c.bg} ${c.border}`}>
      <span className={`w-2 h-2 rounded-sm ${c.bg}`} />
      <span className={c.text}>{label}</span>
    </span>
  )
}

function DecayBtn({ label, sub, color, onClick, help }) {
  const map = {
    violet: 'from-violet-500/30 to-fuchsia-500/20 hover:from-violet-500/40 border-violet-400/40 text-violet-100',
    cyan:   'from-cyan-500/30 to-sky-500/20 hover:from-cyan-500/40 border-cyan-400/40 text-cyan-100',
    pink:   'from-pink-500/30 to-rose-500/20 hover:from-pink-500/40 border-pink-400/40 text-pink-100',
    amber:  'from-amber-500/30 to-rose-500/20 hover:from-amber-500/40 border-amber-400/40 text-amber-100',
  }
  return (
    <Tooltip title={help} overlayStyle={{ maxWidth: 340 }}>
      <button
        type='button'
        onClick={onClick}
        className={`group relative rounded-lg border bg-gradient-to-br ${map[color]} px-3 py-2 text-left transition`}
      >
        <div className='font-mono text-[13px] font-semibold'>{label}</div>
        <div className='text-[10px] opacity-70 mt-0.5'>{sub}</div>
      </button>
    </Tooltip>
  )
}

function TelRow({ k, v, tone = 'amber', help }) {
  const inner = (
    <div className='flex items-center justify-between border-b border-white/[0.05] pb-1.5'>
      <div className='text-fg-muted text-[12px] flex items-center gap-1'>{k}</div>
      <div className={`font-mono text-[13px] text-${tone}-300`}>{String(v)}</div>
    </div>
  )
  if (help) return <Tooltip title={help} placement='left' overlayStyle={{ maxWidth: 340 }}><div className='cursor-help'>{inner}</div></Tooltip>
  return inner
}

function sevDot(s) {
  if (s === 'critical') return 'bg-rose-400'
  if (s === 'warning')  return 'bg-amber-400'
  if (s === 'info')     return 'bg-cyan-400'
  return 'bg-white/40'
}

function stabilityColor(s) {
  if (s === 'stable')     return 'emerald'
  if (s === 'alpha')      return 'violet'
  if (s === 'sf-possible') return 'rose'
  if (s === 'beta-minus') return 'cyan'
  if (s === 'beta-plus')  return 'pink'
  return 'amber'
}

function recommendedMode(t) {
  if (t.stability === 'stable') return 'stable — nothing to emit (try γ for excited-state relaxation)'
  if (t.stability === 'alpha')  return `α — Q_α = ${t.Qalpha.toFixed(2)} MeV`
  if (t.stability === 'beta-minus') return `β⁻ — Q = ${t.Qbeta.toFixed(2)} MeV`
  if (t.stability === 'beta-plus')  return `β⁺ / EC — Q = ${t.Qpos.toFixed(2)} MeV`
  if (t.stability === 'sf-possible') return 'α or spontaneous fission'
  return 'γ · isomeric transition'
}

// ─── Periodic table (18-column grid + f-block strip) ─────────
function PeriodicTable({ Z, onPick }) {
  // Standard 18-column layout with placeholder cells for the lanthanide
  // and actinide rows (labels 57-71 and 89-103 go into the f-block strip).
  const rows = [1, 2, 3, 4, 5, 6, 7]
  return (
    <div className='overflow-x-auto -mx-1 px-1'>
      <div className='inline-grid gap-[3px]' style={{ gridTemplateColumns: 'repeat(18, minmax(28px, 1fr))', minWidth: 500 }}>
        {rows.flatMap(period => {
          const cells = []
          for (let g = 1; g <= 18; g++) {
            const el = ELEMENTS.find(e => e.period === period && e.group === g &&
              !(period === 6 && e.Z > 56 && e.Z < 72 && g === 3) &&
              !(period === 7 && e.Z > 88 && e.Z < 104 && g === 3))
            if (period === 6 && g === 3) {
              cells.push(<Cell key={`${period}-${g}-la`}
                el={{ Z: '57-71', symbol: 'La–Lu', category: 'lanthanide' }} placeholder onPick={() => onPick(57)} active={Z >= 57 && Z <= 71} />)
              continue
            }
            if (period === 7 && g === 3) {
              cells.push(<Cell key={`${period}-${g}-ac`}
                el={{ Z: '89-98', symbol: 'Ac–Cf', category: 'actinide' }} placeholder onPick={() => onPick(89)} active={Z >= 89 && Z <= 98} />)
              continue
            }
            if (el) cells.push(<Cell key={el.Z} el={el} active={el.Z === Z} onPick={() => onPick(el.Z)} />)
            else    cells.push(<div key={`${period}-${g}`} />)
          }
          return cells
        })}
      </div>
      {/* f-block */}
      <div className='mt-1 inline-grid gap-[3px]' style={{ gridTemplateColumns: 'repeat(18, minmax(28px, 1fr))', minWidth: 500 }}>
        {/* spacer 1..2 */}
        <div style={{ gridColumn: 'span 3' }} />
        {ELEMENTS.filter(e => e.Z >= 57 && e.Z <= 71).map(e =>
          <Cell key={e.Z} el={e} active={e.Z === Z} onPick={() => onPick(e.Z)} />)}
      </div>
      <div className='mt-[3px] inline-grid gap-[3px]' style={{ gridTemplateColumns: 'repeat(18, minmax(28px, 1fr))', minWidth: 500 }}>
        <div style={{ gridColumn: 'span 3' }} />
        {ELEMENTS.filter(e => e.Z >= 89 && e.Z <= 98).map(e =>
          <Cell key={e.Z} el={e} active={e.Z === Z} onPick={() => onPick(e.Z)} />)}
      </div>
    </div>
  )
}
function Cell({ el, active, onPick, placeholder }) {
  const c = CAT_COLORS[el.category] || CAT_COLORS['nonmetal']
  return (
    <button
      type='button'
      onClick={onPick}
      title={`${el.symbol}${el.name ? ' · ' + el.name : ''}${el.Astable ? ' · A=' + el.Astable : ''}${el.decay ? ' · ' + el.decay : ''}`}
      className={`aspect-square flex flex-col items-center justify-center rounded ${c.bg} ${c.border} border transition-all
        ${active ? 'ring-2 ring-amber-400 scale-105' : 'hover:ring-1 hover:ring-white/30 hover:scale-[1.03]'}`}
    >
      <div className={`text-[9px] font-mono ${c.text} opacity-70`}>{el.Z}</div>
      <div className={`text-[11px] font-bold ${c.text} leading-none`}>{el.symbol}</div>
      {!placeholder && el.Astable && <div className={`text-[8px] font-mono ${c.text} opacity-70 mt-0.5`}>A{el.Astable}</div>}
    </button>
  )
}

// ─── Decay chain graph ────────────────────────────────────────
function DecayGraph({ chain, currentSym, onPick }) {
  return (
    <div className='overflow-x-auto'>
      <div className='flex items-center gap-2 min-w-max py-1'>
        {chain.nodes.map((n, i) => (
          <div key={n.id} className='flex items-center gap-1'>
            <button
              type='button'
              onClick={() => onPick(n.id)}
              className={`px-2.5 py-2 rounded-lg border text-left transition-all
                ${n.id === currentSym
                  ? 'bg-amber-500/15 border-amber-400/50 ring-1 ring-amber-400/40'
                  : n.mode === 'stable'
                  ? 'bg-emerald-500/10 border-emerald-400/30 hover:bg-emerald-500/20'
                  : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.08]'}`}
            >
              <div className='text-[11px] font-mono text-fg-primary'>{n.id}</div>
              <div className='text-[9px] font-mono text-fg-muted'>
                {n.mode === 'stable' ? 'stable' : fmtHalfLife(n.halfLife)}
              </div>
            </button>
            {i < chain.nodes.length - 1 && (
              <div className='flex flex-col items-center'>
                <span className='text-[10px] font-mono text-amber-300 leading-none'>{n.mode}</span>
                <span className='text-fg-muted text-lg leading-none'>→</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Fission products spawner ─────────────────────────────────
// Canonical U-235 thermal-neutron fission — Kr-92 + Ba-141 + 2-3 n.
// Energy release ~200 MeV total (170 MeV kinetic + 30 MeV delayed).
function spawnFissionProducts(x, y, emissionsRef, pushEvent, chainOn, curZ, curA) {
  const nNeut = 2 + Math.round(Math.random())    // 2 or 3
  // Two heavy daughters — asymmetric (canonical yield curve).
  const α1 = Math.random() * Math.PI * 2
  const α2 = α1 + Math.PI + (Math.random() - 0.5) * 0.4
  const spd = 80
  emissionsRef.current.push({
    x, y, vx: Math.cos(α1) * spd, vy: Math.sin(α1) * spd,
    color: '#f472b6', label: '⁹²Kr', born: performance.now(),
  })
  emissionsRef.current.push({
    x, y, vx: Math.cos(α2) * spd, vy: Math.sin(α2) * spd,
    color: '#c4b5fd', label: '¹⁴¹Ba', born: performance.now(),
  })
  // Fast neutrons — can trigger neighbouring U-235 if chain is on.
  for (let i = 0; i < nNeut; i++) {
    const a = Math.random() * Math.PI * 2
    emissionsRef.current.push({
      x, y, vx: Math.cos(a) * 210, vy: Math.sin(a) * 210,
      color: NEUTRON_COLOR, label: 'n (fast · 2 MeV)', born: performance.now(),
      isNeutron: true, canFission: chainOn,
    })
  }
  pushEvent({
    kind: 'fission', severity: 'critical',
    text: `Fission!  n + ²³⁵U → ⁹²Kr + ¹⁴¹Ba + ${nNeut}n  +  ~200 MeV`,
  })
}
