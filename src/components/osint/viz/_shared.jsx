// Shared helpers for OSINT viz components.
//
// Every viz card is a small React function that receives `{ data }` — the
// unwrapped payload straight from the BE. All viz files sit alongside this
// file so they can pull in the flag emoji helper, the collapsible raw JSON
// footer, and a couple of tiny presentational primitives without dragging
// in the full antd surface for a 40-line component.

import { useState } from 'react'
import { CaretRightOutlined } from '@ant-design/icons'

// ISO 3166 alpha-2 → regional-indicator flag emoji. Falls back to a white
// flag when the code is missing / unknown so the layout never collapses.
export function flagEmoji(code) {
  if (!code || typeof code !== 'string' || code.length !== 2) return '🏳️'
  const A = 0x1F1E6
  const chars = code.toUpperCase().split('').map((c) => String.fromCodePoint(A + c.charCodeAt(0) - 65))
  return chars.join('')
}

// KV — a single "label / value" row used across every viz. Keeps the same
// grid alignment so nested vizzes read like one continuous table.
export function KV({ label, value, mono = false }) {
  return (
    <>
      <div className='text-gray-500 text-[11px] uppercase tracking-widest'>{label}</div>
      <div className={`text-white text-xs truncate ${mono ? 'font-mono' : ''}`}>
        {value ?? <span className='text-gray-600'>—</span>}
      </div>
    </>
  )
}

// KVGrid — the enclosing 2-col grid.
export function KVGrid({ children, cols = 2 }) {
  const gridCols = cols === 3 ? 'grid-cols-[auto_1fr_auto_1fr_auto_1fr]' : 'grid-cols-[auto_1fr]'
  return (
    <div className={`grid ${gridCols} gap-x-3 gap-y-1.5 items-baseline`}>
      {children}
    </div>
  )
}

// Big header cell: tiny eyebrow + large value. Reused by IP, ASN, phone, etc.
export function HeroLine({ eyebrow, value, sub, right }) {
  return (
    <div className='flex items-start justify-between gap-3 mb-3'>
      <div className='min-w-0'>
        <div className='text-[10px] uppercase tracking-widest text-gray-500 font-bold'>{eyebrow}</div>
        <div className='text-white font-bold text-lg sm:text-xl leading-tight truncate'>{value}</div>
        {sub && <div className='text-gray-400 text-xs mt-0.5'>{sub}</div>}
      </div>
      {right && <div className='shrink-0'>{right}</div>}
    </div>
  )
}

// Chip — small tinted pill. `tone` = amber | rose | emerald | cyan | violet | gray.
export function Chip({ tone = 'gray', children }) {
  const map = {
    amber:   'bg-amber-400/15 text-amber-200 border-amber-400/25',
    rose:    'bg-rose-400/15 text-rose-200 border-rose-400/25',
    emerald: 'bg-emerald-400/15 text-emerald-200 border-emerald-400/25',
    cyan:    'bg-cyan-400/15 text-cyan-200 border-cyan-400/25',
    violet:  'bg-violet-400/15 text-violet-200 border-violet-400/25',
    fuchsia: 'bg-fuchsia-400/15 text-fuchsia-200 border-fuchsia-400/25',
    gray:    'bg-white/[0.04] text-gray-300 border-white/[0.08]',
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${map[tone] || map.gray}`}>
      {children}
    </span>
  )
}

// Horizontal probability / percentage bar. Used by gender, nationality, AQI.
export function Bar({ pct, tone = 'amber' }) {
  const clamped = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)))
  const from = {
    amber: 'from-amber-400', rose: 'from-rose-400', emerald: 'from-emerald-400',
    cyan: 'from-cyan-400', violet: 'from-violet-400', fuchsia: 'from-fuchsia-400',
  }[tone] || 'from-amber-400'
  return (
    <div className='h-1.5 bg-white/5 rounded-full overflow-hidden'>
      <div className={`h-full bg-gradient-to-r ${from} to-rose-500`} style={{ width: `${clamped}%` }} />
    </div>
  )
}

// CollapseRawJson — footer of every viz. Closed by default. Truncates giant
// payloads to 8k characters so a runaway response can't wipe out layout.
export function CollapseRawJson({ data }) {
  const [open, setOpen] = useState(false)
  if (data == null) return null
  const text = (() => {
    try {
      const s = JSON.stringify(data, null, 2)
      return s.length > 8000 ? s.slice(0, 8000) + '\n\n… (truncated)' : s
    } catch { return String(data) }
  })()
  return (
    <div className='mt-3 border-t border-white/[0.05] pt-2'>
      <button
        type='button'
        className='flex items-center gap-1 text-[10px] uppercase tracking-widest text-gray-500 hover:text-gray-300 font-bold'
        onClick={() => setOpen((o) => !o)}
      >
        <CaretRightOutlined style={{ fontSize: 9, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
        Raw JSON
      </button>
      {open && (
        <pre className='mt-2 p-2 text-[10px] text-emerald-200/90 bg-black/40 rounded-lg overflow-auto max-h-56 leading-snug whitespace-pre-wrap break-all'>
          {text}
        </pre>
      )}
    </div>
  )
}

// Tiny SVG world map with an amber pulse at (lat, lng). Reused by IpViz and
// LocationViz — pulled out of OsintHub so multiple vizzes share the exact
// same continent silhouettes without a second copy.
export function MiniWorldMap({ lat, lng }) {
  const x = ((Number(lng) + 180) / 360) * 720
  const y = ((90 - Number(lat)) / 180) * 360
  const ok = Number.isFinite(lat) && Number.isFinite(lng)
  return (
    <svg viewBox='0 0 720 360' className='w-full h-auto' aria-hidden>
      <defs>
        <radialGradient id='miniDotGlow'>
          <stop offset='0%'  stopColor='#fbbf24' stopOpacity='1' />
          <stop offset='60%' stopColor='#fb7185' stopOpacity='0.4' />
          <stop offset='100%' stopColor='#fb7185' stopOpacity='0' />
        </radialGradient>
      </defs>
      <rect width='720' height='360' fill='rgba(255,255,255,0.02)' rx='12' />
      <g fill='rgba(148,163,184,0.18)' stroke='rgba(148,163,184,0.35)' strokeWidth='0.5'>
        <path d='M85 70 L200 60 L245 100 L235 155 L185 195 L145 205 L110 175 L80 130 Z' />
        <path d='M195 205 L235 215 L250 260 L235 320 L205 335 L185 300 L180 250 Z' />
        <path d='M340 70 L400 65 L410 95 L390 120 L360 115 L335 100 Z' />
        <path d='M360 130 L420 130 L440 180 L430 245 L400 280 L370 260 L355 200 Z' />
        <path d='M420 60 L590 70 L620 120 L605 175 L555 190 L490 175 L430 145 L415 100 Z' />
        <path d='M555 235 L625 235 L640 275 L610 295 L560 285 Z' />
      </g>
      {ok && (
        <>
          <circle cx={x} cy={y} r='18' fill='url(#miniDotGlow)' />
          <circle cx={x} cy={y} r='4' fill='#fbbf24' stroke='#fff' strokeWidth='1' />
        </>
      )}
    </svg>
  )
}
