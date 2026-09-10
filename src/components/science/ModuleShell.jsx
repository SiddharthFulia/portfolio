// ModuleShell — shared hero + telemetry chrome for every /science/:module page.
//
// Renders the premium hero strip (eyebrow with live pulse + last-sync time,
// gradient title, subtitle), then up to four telemetry stat cards, then any
// children (main content). Matches the Cosmos hub aesthetic used elsewhere
// (Chernobyl / Atoms / OsintHub playbook).
//
// Every module wraps itself in ModuleShell so the ScienceModule.jsx page
// just renders the raw title band and each module owns its own hero.

import { useMemo } from 'react'
import { LuxeLoader } from '../loaders'

/* ── Accent styles (mirrors Science.jsx palette) ── */
const ACCENT = {
  amber:   { bar: 'bg-amber-500',   dot: 'bg-amber-400',   ring: 'hover:border-amber-500/50', ico: 'text-amber-300',   pill: 'text-amber-300 bg-amber-500/15 border-amber-500/30', grad: 'gradient-text-amber' },
  orange:  { bar: 'bg-orange-500',  dot: 'bg-orange-400',  ring: 'hover:border-orange-500/50', ico: 'text-orange-300', pill: 'text-orange-300 bg-orange-500/15 border-orange-500/30', grad: 'gradient-text-amber' },
  yellow:  { bar: 'bg-yellow-500',  dot: 'bg-yellow-400',  ring: 'hover:border-yellow-500/50', ico: 'text-yellow-300', pill: 'text-yellow-300 bg-yellow-500/15 border-yellow-500/30', grad: 'gradient-text-amber' },
  lime:    { bar: 'bg-lime-500',    dot: 'bg-lime-400',    ring: 'hover:border-lime-500/50', ico: 'text-lime-300',     pill: 'text-lime-300 bg-lime-500/15 border-lime-500/30',     grad: 'gradient-text-cyan' },
  emerald: { bar: 'bg-emerald-500', dot: 'bg-emerald-400', ring: 'hover:border-emerald-500/50', ico: 'text-emerald-300', pill: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30', grad: 'gradient-text-cyan' },
  cyan:    { bar: 'bg-cyan-500',    dot: 'bg-cyan-400',    ring: 'hover:border-cyan-500/50', ico: 'text-cyan-300',     pill: 'text-cyan-300 bg-cyan-500/15 border-cyan-500/30',     grad: 'gradient-text-cyan' },
  sky:     { bar: 'bg-sky-500',     dot: 'bg-sky-400',     ring: 'hover:border-sky-500/50', ico: 'text-sky-300',        pill: 'text-sky-300 bg-sky-500/15 border-sky-500/30',        grad: 'gradient-text-cyan' },
  blue:    { bar: 'bg-blue-500',    dot: 'bg-blue-400',    ring: 'hover:border-blue-500/50', ico: 'text-blue-300',      pill: 'text-blue-300 bg-blue-500/15 border-blue-500/30',      grad: 'gradient-text-cyan' },
  violet:  { bar: 'bg-violet-500',  dot: 'bg-violet-400',  ring: 'hover:border-violet-500/50', ico: 'text-violet-300', pill: 'text-violet-300 bg-violet-500/15 border-violet-500/30', grad: 'gradient-text-amber' },
  rose:    { bar: 'bg-rose-500',    dot: 'bg-rose-400',    ring: 'hover:border-rose-500/50', ico: 'text-rose-300',     pill: 'text-rose-300 bg-rose-500/15 border-rose-500/30',     grad: 'gradient-text-amber' },
  red:     { bar: 'bg-red-500',     dot: 'bg-red-400',     ring: 'hover:border-red-500/50', ico: 'text-red-300',       pill: 'text-red-300 bg-red-500/15 border-red-500/30',       grad: 'gradient-text-amber' },
}

export function accentFor(tone) { return ACCENT[tone] || ACCENT.cyan }

/* ── Stat card (matches Cosmos hub telemetry row) ── */
export function StatCard({ tone = 'cyan', label, icon, value, ctx, loading, live = true }) {
  const s = accentFor(tone)
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/70 p-3 sm:p-4 h-full transition-colors ${s.ring}`}>
      <div className={`absolute inset-x-0 top-0 h-0.5 ${s.bar} opacity-60`} />
      <div className="flex items-center gap-2 mb-1.5">
        {icon && <span className={s.ico}>{icon}</span>}
        <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">{label}</span>
        {live && <span className={`ml-auto w-1.5 h-1.5 rounded-full ${s.dot} animate-pulse`} title="live" />}
      </div>
      {loading ? (
        <div className='py-1'><LuxeLoader variant='cosmos' size='sm' /></div>
      ) : (
        <div className="text-white font-bold text-base sm:text-lg leading-tight truncate" title={typeof value === 'string' ? value : undefined}>{value ?? '—'}</div>
      )}
      {ctx && <div className="text-[10px] text-gray-500 mt-1 leading-snug line-clamp-2">{ctx}</div>}
    </div>
  )
}

/* ── Hero strip — eyebrow + gradient title + subtitle + live pill ── */
export function ModuleHero({
  eyebrow,
  title,
  subtitle,
  updated,
  accent = 'cyan',
  live = true,
  pills = [],   // extra pills to render alongside the live pill
}) {
  const s = accentFor(accent)
  const relTime = useMemo(() => {
    if (!updated) return 'syncing…'
    try {
      return updated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    } catch { return 'just now' }
  }, [updated])

  return (
    <div className="relative overflow-hidden">
      <div aria-hidden className="ambient-orb ambient-orb-cool -top-32 -left-24 opacity-60" />
      <div aria-hidden className="ambient-orb -top-16 right-0 opacity-40" />

      <div className="relative">
        {eyebrow && (
          <div className={`eyebrow-mono mb-3 flex items-center gap-2 ${s.ico}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${live ? 'animate-pulse' : ''}`} />
            {eyebrow}
          </div>
        )}

        <h1 className="font-poppins font-black tracking-tight leading-[0.95] text-4xl sm:text-5xl md:text-6xl">
          <span className={s.grad}>{title}</span>
        </h1>

        {subtitle && (
          <p className="text-gray-400 mt-4 text-sm sm:text-base max-w-2xl leading-relaxed">
            {subtitle}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {live && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-[11px] text-emerald-300 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
          )}
          {updated && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-gray-700 bg-gray-900/60 text-[11px] text-gray-400 font-mono">
              last sync {relTime}
            </span>
          )}
          {pills.map((p, i) => (
            <span key={i} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${p.className || 'border-gray-700 bg-gray-900/60 text-gray-400'}`}>
              {p.icon}{p.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Filter chip row (used across modules for date / type / category chips) ── */
export function FilterChips({ options, value, onChange, className = '' }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {options.map(opt => {
        const active = value === opt.key
        const count = typeof opt.count === 'number' ? opt.count : null
        return (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            className={`luxe-press tap-44 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs font-semibold border transition-colors flex items-center gap-2 ${
              active
                ? 'border-cyan-400/60 bg-cyan-500/15 text-cyan-200'
                : 'border-gray-800 bg-gray-900/40 text-gray-400 hover:border-gray-700 hover:text-gray-200'
            }`}
          >
            {opt.label}
            {count !== null && <span className="tabular-nums opacity-70 text-[10px]">{count}</span>}
          </button>
        )
      })}
    </div>
  )
}

/* ── Feed-offline empty state (for retired / broken feeds) ── */
export function FeedOffline({ title = 'This feed is temporarily offline', message, action }) {
  return (
    <div className="luxe-card p-6 sm:p-8 text-center">
      <div className="mx-auto w-12 h-12 rounded-full bg-gray-800/80 flex items-center justify-center mb-4">
        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 010 12.728m-3.536-3.536a4 4 0 010-5.656M12 12h.01M9.172 9.172a4 4 0 000 5.656m-3.536 3.536a9 9 0 010-12.728" />
        </svg>
      </div>
      <p className="text-white font-bold mb-1">{title}</p>
      {message && <p className="text-gray-400 text-sm max-w-md mx-auto">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/* ── Friendly error state (soft copy, retry button) ── */
export function FriendlyError({ error, onRetry }) {
  if (!error) return null
  const isRate = /rate limit|429/i.test(error)
  return (
    <div className="luxe-card p-4 sm:p-5 border-yellow-500/20">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d={isRate ? 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z' : 'M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z'} />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-yellow-200 text-sm font-semibold mb-1">
            {isRate ? 'Cosmos throttled us for a moment' : 'The feed is temporarily unavailable'}
          </p>
          <p className="text-gray-400 text-xs mb-3">
            {isRate ? 'Wait a beat, then try again — the cache is warming.' : 'Please try again in a moment.'}
          </p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-yellow-500/20 border border-yellow-500/40 text-yellow-200 hover:bg-yellow-500/30 transition-colors"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Section header (eyebrow + optional trailing content) ── */
export function SectionHeader({ children, trailing, className = '' }) {
  return (
    <div className={`flex items-center gap-3 mb-3 ${className}`}>
      <div className="eyebrow-mono text-gray-500 flex-1 truncate">// {children}</div>
      {trailing}
    </div>
  )
}
