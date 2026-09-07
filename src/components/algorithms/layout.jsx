// Layout wrappers + small primitives shared by every topic page.
//
// VisualiserSection — the two-column band between the hero and the
//   explainer. Wraps a <VizPanel> + <ControlsPanel>.
// VizPanel          — the big animated canvas / stack / grid on the left.
// ControlsPanel     — the parameter surface on the right (form + buttons).
// Field             — labelled slot with a helper line under it.
// TextInput         — bare-bones text input styled to match antd dark.
// Chip              — small colour-tinted tag.
// OperationLog      — auto-scrolling list of frame messages, active row
//                     highlighted amber.
//
// Panel titles are bold. No leading em-dash. Mobile stacks in a single
// column under `xl:`.

import { useEffect, useRef } from 'react'

/* ── Layout wrappers ─────────────────────────────────────── */

export function VisualiserSection({ children, className = '' }) {
  return (
    <section
      aria-label="Interactive visualiser"
      className={`grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4 sm:gap-5 my-6 ${className}`}
    >
      {children}
    </section>
  )
}

export function VizPanel({ children, title, legend, className = '' }) {
  return (
    <div className={`luxe-card rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5 min-w-0 ${className}`}>
      {(title || legend) && (
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/[0.06]">
          {title && <p className="text-[11px] uppercase tracking-[0.18em] font-bold text-amber-300/90">{title}</p>}
          {legend && <div className="text-[10px] font-mono text-gray-500">{legend}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

export function ControlsPanel({ children, title = 'Controls', className = '' }) {
  return (
    <aside className={`min-w-0 ${className}`}>
      <div className="lg:sticky lg:top-20 luxe-card rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5 space-y-3">
        <div className="flex items-baseline justify-between pb-2 mb-1 border-b border-white/[0.06]">
          <p className="text-[11px] uppercase tracking-[0.18em] font-bold text-amber-300/90">{title}</p>
          <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-gray-600">Panel</span>
        </div>
        {children}
      </div>
    </aside>
  )
}

/* ── Form primitives ─────────────────────────────────────── */

export function Field({ label, helper, children, className = '' }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label className="block text-[10.5px] font-bold text-gray-200 uppercase tracking-[0.14em]">
          {label}
        </label>
      )}
      {children}
      {helper && (
        <p className="text-[11px] text-gray-500 leading-snug mt-1">{helper}</p>
      )}
    </div>
  )
}

// Ultra-thin text input styled for the algorithms theme.
// Used sparingly — for things like "insert 42 at index 3" fields.
// Prefer antd <InputNumber /> for numeric inputs on more complex pages.
export function TextInput({ value, onChange, placeholder, type = 'text', disabled = false, className = '', ...rest }) {
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={`w-full px-2.5 py-1.5 rounded-md bg-white/[0.03] border border-white/10 text-white text-sm font-mono placeholder:text-gray-600 focus:outline-none focus:border-amber-400/60 focus:ring-1 focus:ring-amber-400/30 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      {...rest}
    />
  )
}

/* ── Chip — tag pill in a themed colour ──────────────────── */

const CHIP_TONES = {
  amber:   'bg-amber-500/15 text-amber-300 border-amber-400/30',
  cyan:    'bg-cyan-500/15 text-cyan-300 border-cyan-400/30',
  rose:    'bg-rose-500/15 text-rose-300 border-rose-400/30',
  fuchsia: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-400/30',
  emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30',
  violet:  'bg-violet-500/15 text-violet-300 border-violet-400/30',
  gray:    'bg-white/[0.04] text-gray-300 border-white/10',
  neutral: 'bg-white/[0.04] text-gray-300 border-white/10',
}

export function Chip({ tone = 'gray', children, className = '' }) {
  const t = CHIP_TONES[tone] || CHIP_TONES.gray
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-mono font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full border whitespace-nowrap ${t} ${className}`}>
      {children}
    </span>
  )
}

/* ── OperationLog — scrolling frame message history ──────── */

// Auto-scrolls the active row into view when `activeFrame` changes.
// Used mostly under stack / linked-list / hash-table visualisers where
// each step has a plain-English "what just happened" line.
export function OperationLog({ frames = [], activeFrame = 0, maxHeight = 160, className = '' }) {
  const listRef = useRef(null)
  const rowRefs = useRef({})

  useEffect(() => {
    const row = rowRefs.current[activeFrame]
    if (!row || !listRef.current) return
    const listRect = listRef.current.getBoundingClientRect()
    const rowRect = row.getBoundingClientRect()
    if (rowRect.top < listRect.top || rowRect.bottom > listRect.bottom) {
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [activeFrame])

  if (!frames.length) return null

  return (
    <div
      ref={listRef}
      className={`rounded-lg border border-white/10 bg-[#08080b]/70 overflow-y-auto text-[11px] font-mono ${className}`}
      style={{ maxHeight }}
      aria-label="Operation log"
    >
      {frames.map((f, i) => {
        const active = i === activeFrame
        const err = f?.err === true || f?.ok === false
        return (
          <div
            key={i}
            ref={(el) => { rowRefs.current[i] = el }}
            className={`flex items-baseline gap-2 px-3 py-1 border-l-2 ${
              active
                ? 'bg-amber-500/10 border-amber-400 text-white'
                : err
                  ? 'border-rose-500/40 text-rose-200/80'
                  : 'border-transparent text-gray-400'
            }`}
          >
            <span className={`shrink-0 w-6 text-right ${active ? 'text-amber-300' : 'text-gray-600'}`}>
              {i}
            </span>
            <span className="flex-1 whitespace-pre-wrap break-words">
              {f?.msg ?? ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}
