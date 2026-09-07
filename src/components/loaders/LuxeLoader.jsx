// LuxeLoader — branded per-page personality loaders.
//
// A single component with a `variant` prop that swaps in a distinct
// vector animation (SVG + framer-motion) matching the page's theme:
//
//   physics  · double pendulum swing
//   reactor  · pulsing hex fuel channels with a heat sweep
//   orbital  · Bohr shells with electrons orbiting
//   road     · dashed line tracing a curved route
//   qr       · Conway-ish flip wave on a 5×5 QR-like grid
//   tattoo   · thin line-work spiral
//   cosmos   · starfield twinkle + slow comet arc
//   city     · top-down node graph with edges lighting up sequentially
//   osint    · radar sweep (rotating sector wipe)
//   generic  · gradient shimmer bar (Skeleton replacement)
//
// Sizes: sm 40 · md 80 · lg 140 · xl full-viewport hero. Label is
// rendered underneath in the muted mono style used site-wide.
//
// `prefers-reduced-motion` — every variant falls back to a flat
// horizontal shimmer bar so no vestibular / seizure-risk motion runs.

import { useMemo } from 'react'
import { motion } from 'framer-motion'

// Detect once at import; browser prefers-reduced-motion is stable per
// tab, so evaluating on module load is fine.
const REDUCE = typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const SIZE_PX = { sm: 40, md: 80, lg: 140, xl: 320 }

// ── Static shimmer fallback ─────────────────────────────
function ShimmerBar({ px }) {
  return (
    <div
      className='relative overflow-hidden rounded-md bg-white/[0.04]'
      style={{ width: px, height: Math.max(6, Math.round(px * 0.08)) }}
    >
      <div className='absolute inset-0 luxe-skeleton' />
    </div>
  )
}

// ── PHYSICS · double pendulum ───────────────────────────
function PhysicsSVG({ px }) {
  const cx = px / 2, top = px * 0.12
  const L1 = px * 0.28, L2 = px * 0.26
  return (
    <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`}>
      {/* pivot */}
      <circle cx={cx} cy={top} r={2} fill='#fbbf24' />
      <motion.g
        style={{ originX: cx, originY: top }}
        animate={{ rotate: [-55, 55, -55] }}
        transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity }}
      >
        <line x1={cx} y1={top} x2={cx} y2={top + L1} stroke='#fbbf24' strokeWidth='1.5' strokeLinecap='round' />
        <circle cx={cx} cy={top + L1} r={3.5} fill='#fbbf24' />
        <motion.g
          style={{ originX: cx, originY: top + L1 }}
          animate={{ rotate: [90, -120, 60, -90, 90] }}
          transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity }}
        >
          <line x1={cx} y1={top + L1} x2={cx} y2={top + L1 + L2} stroke='#f472b6' strokeWidth='1.5' strokeLinecap='round' />
          <circle cx={cx} cy={top + L1 + L2} r={4} fill='#f472b6' />
        </motion.g>
      </motion.g>
    </svg>
  )
}

// ── REACTOR · pulsing hex grid + ripple sweep ────────────
function ReactorSVG({ px }) {
  // 3-4-3 hex packing. Each cell pulses with a small phase offset so
  // the "heat sweep" reads left→right.
  const hexes = useMemo(() => {
    const rows = [[0,1,2], [0,1,2,3], [0,1,2]] // cells per row
    const r = px * 0.09
    const dx = r * Math.sqrt(3)
    const dy = r * 1.5
    const cy0 = px / 2 - dy
    const out = []
    rows.forEach((cols, ri) => {
      const cy = cy0 + ri * dy
      const rowOff = ri === 1 ? -dx / 2 : 0
      const cx0 = px / 2 - ((cols.length - 1) * dx) / 2 + rowOff + (ri === 1 ? dx / 2 : 0)
      cols.forEach((_, ci) => {
        out.push({ cx: cx0 + ci * dx, cy, r, i: out.length })
      })
    })
    return out
  }, [px])

  return (
    <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`}>
      {hexes.map((h, i) => {
        const pts = [0,1,2,3,4,5].map(k => {
          const a = (Math.PI / 3) * k - Math.PI / 2
          return `${h.cx + h.r * Math.cos(a)},${h.cy + h.r * Math.sin(a)}`
        }).join(' ')
        return (
          <motion.polygon
            key={i}
            points={pts}
            fill='none'
            stroke='#f43f5e'
            strokeWidth='1.2'
            animate={{
              fill: ['rgba(244,63,94,0)', 'rgba(244,63,94,0.55)', 'rgba(244,63,94,0)'],
              opacity: [0.35, 1, 0.35],
            }}
            transition={{
              duration: 1.8,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: i * 0.09,
            }}
          />
        )
      })}
    </svg>
  )
}

// ── ORBITAL · Bohr shells with electrons ─────────────────
function OrbitalSVG({ px }) {
  const cx = px / 2, cy = px / 2
  const shells = [px * 0.18, px * 0.30, px * 0.42]
  const colours = ['#a855f7', '#22d3ee', '#f472b6']
  return (
    <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`}>
      <circle cx={cx} cy={cy} r={3.5} fill='#fbbf24' />
      {shells.map((r, i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r={r} fill='none' stroke={colours[i]} strokeOpacity='0.35' strokeWidth='0.8' strokeDasharray='2 3' />
          <motion.circle
            cx={cx + r}
            cy={cy}
            r={2.2}
            fill={colours[i]}
            style={{ originX: cx, originY: cy }}
            animate={{ rotate: 360 }}
            transition={{ duration: 2 + i * 1.1, ease: 'linear', repeat: Infinity }}
            transform-origin={`${cx} ${cy}`}
          />
        </g>
      ))}
    </svg>
  )
}

// ── ROAD · dashed line tracing a curved path ─────────────
function RoadSVG({ px }) {
  // Simple S-curve that snakes across the square.
  const d = `M ${px*0.08},${px*0.18} C ${px*0.35},${px*0.10} ${px*0.15},${px*0.55} ${px*0.5},${px*0.55} S ${px*0.85},${px*0.90} ${px*0.92},${px*0.82}`
  return (
    <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`}>
      <path d={d} stroke='#22d3ee' strokeOpacity='0.15' strokeWidth='2' fill='none' />
      <motion.path
        d={d}
        stroke='#22d3ee'
        strokeWidth='2'
        strokeDasharray='6 8'
        strokeLinecap='round'
        fill='none'
        animate={{ strokeDashoffset: [0, -28] }}
        transition={{ duration: 1.2, ease: 'linear', repeat: Infinity }}
      />
      <motion.circle
        r={3}
        fill='#fbbf24'
        animate={{
          cx: [px*0.08, px*0.5, px*0.92],
          cy: [px*0.18, px*0.55, px*0.82],
        }}
        transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity }}
      />
    </svg>
  )
}

// ── QR · 5×5 cell wave flip ──────────────────────────────
function QrSVG({ px }) {
  const N = 5
  const cell = px / (N + 1)
  const off = cell * 0.5
  const cells = []
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      cells.push({ x, y, i: x + y })
    }
  }
  return (
    <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`}>
      <rect x='0' y='0' width={px} height={px} rx={px * 0.06} fill='#fef3c7' opacity='0.03' />
      {cells.map(({ x, y, i }) => (
        <motion.rect
          key={`${x}-${y}`}
          x={off + x * cell + 1}
          y={off + y * cell + 1}
          width={cell - 2}
          height={cell - 2}
          rx={1.5}
          animate={{ fill: ['#0a0a0e', '#fbbf24', '#0a0a0e'] }}
          transition={{
            duration: 1.6,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: (i % (N * 2)) * 0.09,
          }}
        />
      ))}
    </svg>
  )
}

// ── TATTOO · thin fine-line spiral ───────────────────────
function TattooSVG({ px }) {
  // Two-turn Archimedean spiral, drawn with stroke-dashoffset animation.
  const d = useMemo(() => {
    const cx = px / 2, cy = px / 2
    const turns = 2.2
    const steps = 240
    const rMax = px * 0.42
    let out = ''
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const a = t * turns * Math.PI * 2
      const r = rMax * t
      const x = cx + r * Math.cos(a)
      const y = cy + r * Math.sin(a)
      out += (i === 0 ? 'M ' : 'L ') + x.toFixed(2) + ',' + y.toFixed(2) + ' '
    }
    return out
  }, [px])
  return (
    <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`}>
      <path d={d} stroke='currentColor' strokeOpacity='0.12' strokeWidth='0.8' fill='none' />
      <motion.path
        d={d}
        stroke='currentColor'
        strokeWidth='1'
        strokeLinecap='round'
        fill='none'
        strokeDasharray='800'
        animate={{ strokeDashoffset: [800, 0] }}
        transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity }}
      />
    </svg>
  )
}

// ── COSMOS · starfield + comet arc ───────────────────────
function CosmosSVG({ px }) {
  const stars = useMemo(() => (
    Array.from({ length: 14 }).map((_, i) => ({
      x: Math.random() * px,
      y: Math.random() * px,
      r: 0.6 + Math.random() * 1.2,
      d: Math.random() * 1.5,
      i,
    }))
  ), [px])
  return (
    <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`}>
      <defs>
        <radialGradient id='cometHead' cx='50%' cy='50%'>
          <stop offset='0%' stopColor='#22d3ee' />
          <stop offset='100%' stopColor='#22d3ee' stopOpacity='0' />
        </radialGradient>
      </defs>
      {stars.map(s => (
        <motion.circle
          key={s.i}
          cx={s.x} cy={s.y} r={s.r} fill='#a5b4fc'
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 2 + s.d, repeat: Infinity, ease: 'easeInOut', delay: s.d }}
        />
      ))}
      {/* Comet arc */}
      <motion.g
        animate={{ rotate: 360 }}
        style={{ originX: px / 2, originY: px / 2 }}
        transition={{ duration: 6, ease: 'linear', repeat: Infinity }}
      >
        <circle cx={px * 0.85} cy={px / 2} r={4} fill='url(#cometHead)' />
        <line x1={px * 0.85} y1={px / 2} x2={px * 0.70} y2={px / 2} stroke='#22d3ee' strokeOpacity='0.4' strokeWidth='1' />
      </motion.g>
    </svg>
  )
}

// ── CITY · top-down node graph, edges light up ───────────
function CitySVG({ px }) {
  const nodes = useMemo(() => ([
    { x: 0.20, y: 0.28 }, { x: 0.55, y: 0.15 }, { x: 0.82, y: 0.35 },
    { x: 0.68, y: 0.65 }, { x: 0.35, y: 0.78 }, { x: 0.14, y: 0.60 },
  ].map(n => ({ x: n.x * px, y: n.y * px }))), [px])
  const edges = useMemo(() => (
    [[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[0,3],[1,4]]
  ), [])
  return (
    <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`}>
      {edges.map(([a, b], i) => (
        <motion.line
          key={i}
          x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y}
          stroke='#34d399'
          strokeWidth='1.2'
          animate={{ opacity: [0.15, 1, 0.15] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay: i * 0.14 }}
        />
      ))}
      {nodes.map((n, i) => (
        <motion.circle
          key={i}
          cx={n.x} cy={n.y} r={2.6}
          fill='#34d399'
          animate={{ scale: [0.8, 1.25, 0.8], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut', delay: i * 0.12 }}
          style={{ originX: n.x, originY: n.y }}
        />
      ))}
    </svg>
  )
}

// ── OSINT · radar sweep sector ───────────────────────────
function OsintSVG({ px }) {
  const cx = px / 2, cy = px / 2
  const R = px * 0.44
  return (
    <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`}>
      <defs>
        <linearGradient id='radarWedge' x1='0%' y1='0%' x2='100%' y2='0%'>
          <stop offset='0%'  stopColor='#fbbf24' stopOpacity='0' />
          <stop offset='100%' stopColor='#f43f5e' stopOpacity='0.7' />
        </linearGradient>
      </defs>
      <circle cx={cx} cy={cy} r={R}       fill='none' stroke='#fbbf24' strokeOpacity='0.20' strokeWidth='1' />
      <circle cx={cx} cy={cy} r={R * 0.66} fill='none' stroke='#fbbf24' strokeOpacity='0.15' strokeWidth='0.8' />
      <circle cx={cx} cy={cy} r={R * 0.33} fill='none' stroke='#fbbf24' strokeOpacity='0.10' strokeWidth='0.6' />
      <line x1={cx - R} y1={cy} x2={cx + R} y2={cy} stroke='#fbbf24' strokeOpacity='0.10' strokeWidth='0.6' />
      <line x1={cx} y1={cy - R} x2={cx} y2={cy + R} stroke='#fbbf24' strokeOpacity='0.10' strokeWidth='0.6' />
      <motion.g
        style={{ originX: cx, originY: cy }}
        animate={{ rotate: 360 }}
        transition={{ duration: 2.4, ease: 'linear', repeat: Infinity }}
      >
        {/* 45° sweep wedge, built as a filled triangle-arc approximation. */}
        <path
          d={`M ${cx} ${cy} L ${cx + R} ${cy} A ${R} ${R} 0 0 0 ${cx + R * Math.cos(-Math.PI / 4)} ${cy + R * Math.sin(-Math.PI / 4)} Z`}
          fill='url(#radarWedge)'
        />
      </motion.g>
      <circle cx={cx} cy={cy} r={2.4} fill='#f43f5e' />
    </svg>
  )
}

// ── GENERIC · shimmer bar ────────────────────────────────
function GenericBar({ px }) {
  return <ShimmerBar px={px} />
}

const VARIANTS = {
  physics: PhysicsSVG,
  reactor: ReactorSVG,
  orbital: OrbitalSVG,
  road:    RoadSVG,
  qr:      QrSVG,
  tattoo:  TattooSVG,
  cosmos:  CosmosSVG,
  city:    CitySVG,
  osint:   OsintSVG,
  generic: GenericBar,
}

export default function LuxeLoader({
  variant = 'generic',
  size    = 'md',
  label   = '',
  className = '',
}) {
  const px = SIZE_PX[size] || SIZE_PX.md
  const Cmp = VARIANTS[variant] || VARIANTS.generic
  // xl = full-viewport hero. Center inside a full-page container.
  const isHero = size === 'xl'

  const inner = REDUCE
    ? <ShimmerBar px={Math.min(px, 160)} />
    : <Cmp px={px} />

  const body = (
    <div className={`flex flex-col items-center justify-center text-center ${className}`}>
      <div
        className='flex items-center justify-center text-fg-primary'
        style={{ width: px, height: px }}
      >
        {inner}
      </div>
      {label && (
        <div className='text-[11px] text-fg-muted mt-2 leading-tight max-w-[16rem]'>
          {label}
        </div>
      )}
    </div>
  )

  if (isHero) {
    return (
      <div className='min-h-screen w-full flex items-center justify-center bg-surface-base'>
        {body}
      </div>
    )
  }
  return body
}
