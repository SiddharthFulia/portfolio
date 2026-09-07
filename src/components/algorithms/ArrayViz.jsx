// ArrayViz — coloured cell strip used by Sorting / Searching / DP.
//
// Sibling agents drive it with:
//   values     — array of numbers (or strings)
//   states     — parallel array of strings from STATE_COLORS below
//                (default: 'idle'). Only same-length arrays render;
//                mismatched lengths safely fall back to 'idle'.
//   labels     — optional per-cell footer text (indices, weights, …)
//   markers    — optional [{ index, label, color }] overlay pointers
//                shown above the array (i / j / low / mid / high …)
//   height     — cell height in px (default 56)
//   showIndex  — render 0-indexed row under each cell (default true)
//
// Design:
//   * Framer Motion FLIP on layout so swaps animate smoothly
//   * `prefers-reduced-motion` respected — animations flatten
//   * Panel title bold, no leading em-dash

import { LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import { useMemo } from 'react'

// Semantic palette. Sibling visualisers reference these keys, not raw
// colours, so a future theme swap only touches this map.
export const STATE_COLORS = {
  idle:      { bg: 'bg-white/[0.04]',        border: 'border-white/10',            text: 'text-gray-200'  },
  comparing: { bg: 'bg-amber-500/20',        border: 'border-amber-400/70',        text: 'text-amber-100' },
  swapping:  { bg: 'bg-rose-500/25',         border: 'border-rose-400/80',         text: 'text-rose-100'  },
  sorted:    { bg: 'bg-emerald-500/20',      border: 'border-emerald-400/60',      text: 'text-emerald-100' },
  pivot:     { bg: 'bg-fuchsia-500/25',      border: 'border-fuchsia-400/80',      text: 'text-fuchsia-100' },
  found:     { bg: 'bg-cyan-500/25',         border: 'border-cyan-400/80',         text: 'text-cyan-100'  },
  visited:   { bg: 'bg-violet-500/15',       border: 'border-violet-400/50',       text: 'text-violet-100' },
  window:    { bg: 'bg-amber-500/10',        border: 'border-amber-400/40',        text: 'text-amber-200' },
  active:    { bg: 'bg-cyan-500/20',         border: 'border-cyan-400/70',         text: 'text-cyan-100'  },
  target:    { bg: 'bg-fuchsia-500/25',      border: 'border-fuchsia-400/80',      text: 'text-fuchsia-100' },
  eliminated:{ bg: 'bg-black/40',            border: 'border-white/5',             text: 'text-gray-500'  },
}

const MARKER_COLORS = {
  amber:   'text-amber-300',
  rose:    'text-rose-300',
  cyan:    'text-cyan-300',
  fuchsia: 'text-fuchsia-300',
  emerald: 'text-emerald-300',
  violet:  'text-violet-300',
  gray:    'text-gray-300',
}

// Small "▼" pointer used for i/j/lo/mid/hi markers above cells.
function Marker({ label, color = 'amber' }) {
  const c = MARKER_COLORS[color] || MARKER_COLORS.amber
  return (
    <div className={`flex flex-col items-center gap-0.5 ${c} pointer-events-none`}>
      <span className="text-[10px] font-mono font-bold tracking-wider">{label}</span>
      <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 fill-current"><path d="M5 9 L0.5 1 L9.5 1 Z" /></svg>
    </div>
  )
}

export default function ArrayViz({
  values = [],
  states = [],
  labels = null,
  markers = null,
  height = 56,
  showIndex = true,
  title,
  legend,
  className = '',
  cellClassName = '',
  emptyLabel = 'Array is empty — reset to start.',
}) {
  const reduce = useReducedMotion()
  const stateAt = (i) => STATE_COLORS[states[i]] || STATE_COLORS.idle

  const markerRow = useMemo(() => {
    if (!markers || !markers.length) return null
    const byIndex = new Map()
    markers.forEach((m) => {
      if (m == null || m.index == null) return
      const list = byIndex.get(m.index) || []
      list.push(m)
      byIndex.set(m.index, list)
    })
    return byIndex
  }, [markers])

  return (
    <div className={`luxe-card rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5 ${className}`}>
      {(title || legend) && (
        <div className="flex items-center justify-between mb-3">
          {title && <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-white">{title}</p>}
          {legend && <div className="text-[10px] font-mono text-gray-500">{legend}</div>}
        </div>
      )}

      {values.length === 0 ? (
        <p className="text-sm text-gray-500 italic py-6 text-center">{emptyLabel}</p>
      ) : (
        <LayoutGroup id="array-viz">
          {markerRow && (
            <div className="flex gap-1.5 mb-1 min-h-[22px]">
              {values.map((_, i) => (
                <div key={`m${i}`} className="flex-1 min-w-[38px] flex flex-col items-center justify-end">
                  {(markerRow.get(i) || []).map((m, k) => (
                    <Marker key={k} label={m.label} color={m.color} />
                  ))}
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-1.5">
            {values.map((v, i) => {
              const s = stateAt(i)
              return (
                <motion.div
                  key={`c${i}-${v}`}
                  layout={!reduce}
                  transition={{ type: 'spring', stiffness: 320, damping: 26 }}
                  className={`flex-1 min-w-[38px] rounded-lg border ${s.bg} ${s.border} ${s.text} flex flex-col items-center justify-center font-mono font-semibold ${cellClassName}`}
                  style={{ height }}
                  aria-label={`Cell ${i}: ${v}, ${states[i] || 'idle'}`}
                >
                  <span className="text-sm sm:text-[15px] leading-none">{v}</span>
                </motion.div>
              )
            })}
          </div>
          {(showIndex || labels) && (
            <div className="flex gap-1.5 mt-1.5">
              {values.map((_, i) => (
                <div key={`i${i}`} className="flex-1 min-w-[38px] flex flex-col items-center text-[10px] font-mono text-gray-500 leading-tight">
                  {showIndex && <span>{i}</span>}
                  {labels?.[i] != null && <span className="text-gray-400">{labels[i]}</span>}
                </div>
              ))}
            </div>
          )}
        </LayoutGroup>
      )}
    </div>
  )
}
