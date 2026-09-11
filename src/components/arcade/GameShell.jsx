// <GameShell> — shared wrapper for all arcade games.
//
// Provides:
//   • Full-bleed dark section with the site's signature amber → rose title
//   • Top bar     : back to /arcade · title (gradient) · category chip ·
//                   sound toggle · pause button
//   • Left rail   : score (big) / best / level / status indicator.
//     (desktop)     Collapses to a horizontal HUD strip below `lg`.
//   • Center      : `children` — the actual <canvas> or DOM game viewport.
//   • Bottom bar  : keyboard shortcuts row + Restart. Sticks on mobile.
//   • Overlays    : paused ("Paused — Space to resume") and game-over
//                   ("Score: N · Best: M · New high score!" + Restart).
//   • Persistence : best score auto-persists to localStorage under
//                   `arcade.<slug>.best`. Shell auto-tracks it — pages
//                   pass current `score` and receive game-over UX for free.
//   • a11y        : prefers-reduced-motion respected — no flashes / pulses
//                   / entry animations on overlays.
//   • Mobile      : optional `mobile` prop for touch controls (e.g. D-pad).
//                   Renders below the viewport on <lg screens.
//
// Games are expected to manage their own state; this shell only renders
// chrome + surfaces the current score/level/status coming from the parent.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CATEGORY_ACCENTS } from './gameRegistry'

/* ── localStorage helpers ──────────────────────────────
 * All arcade high scores share a common namespace so we can wipe them
 * in one shot if we ever need to reset. Wrapped in try/catch so
 * private-mode Safari (throws on writes) doesn't crash the shell. */
const bestKey = (slug) => `arcade.${slug}.best`

function readBest(slug) {
  if (!slug) return 0
  try {
    const raw = localStorage.getItem(bestKey(slug))
    if (!raw) return 0
    const n = Number(raw)
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

function writeBest(slug, value) {
  if (!slug) return
  try {
    localStorage.setItem(bestKey(slug), String(value))
  } catch {
    /* private-mode Safari — silently drop */
  }
}

/* ── prefers-reduced-motion hook ─────────────────────
 * Live-updates when the user flips the OS preference mid-session. */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(!!mq.matches)
    sync()
    mq.addEventListener?.('change', sync)
    return () => mq.removeEventListener?.('change', sync)
  }, [])
  return reduced
}

/* ── Slug inference ──────────────────────────────────
 * The shell needs a slug to namespace localStorage. If the page doesn't
 * pass one, derive it from the URL (/arcade/xyz → 'xyz') or fall back
 * to a lowercased title so different games don't clobber each other's
 * best-score entry. */
function useResolvedSlug(explicit, title) {
  const { pathname } = useLocation()
  return useMemo(() => {
    if (explicit) return explicit
    const m = pathname && pathname.match(/\/arcade\/([^/]+)/)
    if (m) return m[1]
    return (title || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-')
  }, [explicit, pathname, title])
}

/* ── Sub-parts ────────────────────────────────────── */
const StatusPill = ({ status, reducedMotion }) => {
  const map = {
    playing: { label: 'Playing',   cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', dot: 'bg-emerald-400', pulse: true },
    paused:  { label: 'Paused',    cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30',       dot: 'bg-amber-400',   pulse: false },
    over:    { label: 'Game Over', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30',          dot: 'bg-rose-400',    pulse: false },
    won:     { label: 'Cleared',   cls: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30', dot: 'bg-fuchsia-400', pulse: false },
    ready:   { label: 'Ready',     cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',          dot: 'bg-cyan-400',    pulse: false },
    idle:    { label: 'Ready',     cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',          dot: 'bg-cyan-400',    pulse: false },
  }
  const s = map[status] || map.playing
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide border ${s.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${s.pulse && !reducedMotion ? 'animate-pulse' : ''}`} />
      {s.label}
    </span>
  )
}

const Stat = ({ label, value, big = false, accent = 'amber' }) => {
  const tints = {
    amber:   'text-amber-300',
    rose:    'text-rose-300',
    cyan:    'text-cyan-300',
    fuchsia: 'text-fuchsia-300',
    emerald: 'text-emerald-300',
  }
  const tint = tints[accent] || tints.amber
  return (
    <div className="flex flex-col items-start">
      <span className="text-[10px] uppercase tracking-widest text-white/40 font-mono">{label}</span>
      <span className={`font-poppins font-black tabular-nums ${big ? 'text-2xl sm:text-3xl lg:text-4xl' : 'text-lg sm:text-xl'} ${tint}`}>
        {value}
      </span>
    </div>
  )
}

const IconBtn = ({ onClick, title, children, tone = 'default', ariaLabel }) => {
  const toneCls = tone === 'danger'
    ? 'border-rose-500/40 hover:border-rose-400 text-rose-200 hover:text-white hover:bg-rose-500/20'
    : tone === 'primary'
    ? 'border-amber-400/50 hover:border-amber-300 text-amber-200 hover:text-white hover:bg-amber-500/20'
    : 'border-white/15 hover:border-white/40 text-white/80 hover:text-white hover:bg-white/10'
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel || title}
      className={`h-9 w-9 flex items-center justify-center rounded-lg border transition-colors ${toneCls}`}
    >
      {children}
    </button>
  )
}

/* Inline SVGs — no icon-lib dependency, keeps chunk size small. */
const IconChevron = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <polyline points="15 18 9 12 15 6" />
  </svg>
)
const IconSoundOn  = () => (<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 10v4h4l5 4V6L7 10H3zm13.5 2a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.06A6.99 6.99 0 0 1 19 12a6.99 6.99 0 0 1-5 6.74v2.06A9 9 0 0 0 21 12 9 9 0 0 0 14 3.2z"/></svg>)
const IconSoundOff = () => (<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M16.5 12A4.5 4.5 0 0 0 14 8v2.18l2.45 2.45c.03-.2.05-.42.05-.63zM19 12c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.96 8.96 0 0 0 21 12a9 9 0 0 0-7-8.77v2.06A6.99 6.99 0 0 1 19 12zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.17v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>)
const IconPause    = () => (<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>)
const IconPlay     = () => (<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>)
const IconReload   = () => (<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4a8 8 0 1 0 7.74 10h-2.09A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>)

/* ── Main component ──────────────────────────────── */
export default function GameShell({
  slug,                      // optional — auto-derived from /arcade/:slug URL
  title = 'Game',
  category = 'Arcade',       // one of gameRegistry.CATEGORIES
  score = 0,
  best,                      // optional — shell tracks its own if unset
  level,                     // optional — hidden if not passed
  status = 'playing',        // playing | paused | over | won | ready | idle
  onRestart,
  onPause,
  soundOn = true,
  onSoundToggle,
  controls = [],             // [{ key: 'Space', label: 'Fire' }, …]
  mobile,                    // ReactNode — usually <TouchDPad />
  extraStats = null,         // optional additional stat blocks
  overlay = null,            // optional custom overlay (renders above viewport)
  footer = null,             // optional extra footer content
  subtitle,                  // optional line under the title
  children,
}) {
  const resolvedSlug = useResolvedSlug(slug, title)
  const reducedMotion = usePrefersReducedMotion()
  const wrapRef = useRef(null)

  // Auto-persist best. If the caller doesn't pass `best`, we track it
  // internally so the game-over overlay can still say "New high score".
  const [internalBest, setInternalBest] = useState(() => readBest(resolvedSlug))
  const displayBest = best ?? internalBest

  // Bump best when score exceeds it. Runs on every score change; cheap.
  useEffect(() => {
    if (typeof score !== 'number' || !Number.isFinite(score)) return
    if (score > displayBest) {
      setInternalBest(score)
      writeBest(resolvedSlug, score)
    }
  }, [score, displayBest, resolvedSlug])

  // Capture whether the current game-over screen is a NEW high — sampled
  // once when status flips to `over` so we don't flicker as best updates.
  const [isNewHigh, setIsNewHigh] = useState(false)
  const prevStatus = useRef(status)
  useEffect(() => {
    if (prevStatus.current !== 'over' && status === 'over') {
      // score has already been folded into best via the effect above.
      // A "new high" is one where the game-over score EQUALS best AND
      // best was raised in this game (score > 0).
      setIsNewHigh(score > 0 && score >= displayBest)
    }
    if (status !== 'over') setIsNewHigh(false)
    prevStatus.current = status
  }, [status, score, displayBest])

  // Space toggles pause; R restarts. Skip when focus is in an input so
  // Wordle etc. don't lose their keystrokes to the shell.
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target
      const tag = t?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return
      if (e.code === 'Space' && onPause) {
        e.preventDefault()
        onPause()
      } else if ((e.key === 'r' || e.key === 'R') && onRestart) {
        onRestart()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onPause, onRestart])

  const accent = CATEGORY_ACCENTS[category] || CATEGORY_ACCENTS.Arcade
  const showPausedOverlay   = status === 'paused'
  const showGameOverOverlay = status === 'over' || status === 'won'

  const scoreStr = typeof score === 'number' ? score.toLocaleString() : String(score ?? 0)
  const bestStr  = typeof displayBest === 'number' ? displayBest.toLocaleString() : String(displayBest ?? 0)

  return (
    <section
      ref={wrapRef}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      className="min-h-screen bg-[#0a0a0e] text-white flex flex-col"
    >
      {/* ── Top bar ───────────────────────────────── */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-black/50 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link
            to="/arcade"
            className="inline-flex items-center gap-1.5 text-white/60 hover:text-white transition-colors text-sm"
          >
            <IconChevron />
            <span className="hidden sm:inline">Arcade</span>
          </Link>

          <div className="h-4 w-px bg-white/10 mx-1" />

          <h1 className="font-poppins font-black tracking-tight text-xl sm:text-2xl bg-gradient-to-r from-amber-300 via-rose-300 to-fuchsia-400 bg-clip-text text-transparent truncate">
            {title}
          </h1>

          <span className={`hidden sm:inline-flex items-center gap-1.5 text-[11px] font-medium border rounded-full px-2.5 py-0.5 ${accent.chip}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${accent.dot}`} />
            {category}
          </span>

          <div className="flex-1" />

          {onSoundToggle && (
            <IconBtn onClick={onSoundToggle} title={soundOn ? 'Mute' : 'Unmute'}>
              {soundOn ? <IconSoundOn /> : <IconSoundOff />}
            </IconBtn>
          )}
          {onPause && (
            <IconBtn onClick={onPause} title={status === 'paused' ? 'Resume' : 'Pause'}>
              {status === 'paused' ? <IconPlay /> : <IconPause />}
            </IconBtn>
          )}
        </div>
      </header>

      {/* ── Body: rail + viewport ─────────────────── */}
      <div className="flex-1 flex flex-col lg:flex-row max-w-7xl w-full mx-auto px-4 sm:px-6 py-5 gap-5">
        {/* Left rail (desktop) / horizontal HUD strip (mobile) */}
        <aside className="lg:w-60 shrink-0">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur px-4 py-3 flex lg:flex-col flex-row flex-wrap items-start lg:items-stretch gap-4 lg:gap-3">
            <Stat label="Score" value={scoreStr} big accent="amber" />
            <Stat label="Best"  value={bestStr}       accent="rose" />
            {typeof level === 'number' && <Stat label="Level" value={level} accent="fuchsia" />}
            {extraStats}
            <div className="lg:mt-1">
              <StatusPill status={status} reducedMotion={reducedMotion} />
            </div>
          </div>
          {subtitle && (
            <p className="mt-3 hidden lg:block text-xs text-white/50 leading-relaxed px-1">
              {subtitle}
            </p>
          )}
        </aside>

        {/* Center — the game itself */}
        <main className="flex-1 relative min-h-[50vh] flex flex-col">
          <div className="relative flex-1 flex items-center justify-center">
            <div className="relative w-full h-full rounded-2xl overflow-hidden bg-black border border-white/10 shadow-[0_0_40px_-10px_rgba(244,114,182,0.15)]">
              {children}
              {overlay}

              {/* Paused overlay */}
              {showPausedOverlay && (
                <div className="absolute inset-0 z-10 backdrop-blur-sm bg-black/60 flex items-center justify-center">
                  <div className="text-center px-6">
                    <div className="font-poppins font-black text-3xl sm:text-4xl mb-2 bg-gradient-to-r from-amber-300 via-rose-300 to-fuchsia-400 bg-clip-text text-transparent">
                      Paused
                    </div>
                    <div className="text-white/60 text-sm">
                      <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/20 text-white/90 font-mono text-[10px] mr-1">Space</kbd>
                      to resume
                    </div>
                  </div>
                </div>
              )}

              {/* Game over / won overlay */}
              {showGameOverOverlay && (
                <div className={`absolute inset-0 z-10 backdrop-blur-sm bg-black/70 flex items-center justify-center ${reducedMotion ? '' : 'transition-opacity duration-200'}`}>
                  <div className="text-center max-w-sm px-6">
                    <div className={`font-poppins font-black text-3xl sm:text-4xl mb-3 bg-clip-text text-transparent ${
                      status === 'won'
                        ? 'bg-gradient-to-r from-cyan-300 via-emerald-300 to-fuchsia-300'
                        : 'bg-gradient-to-r from-amber-300 via-rose-300 to-fuchsia-400'
                    }`}>
                      {status === 'won' ? 'You won!' : 'Game Over'}
                    </div>
                    <div className="text-white/70 mb-2">
                      Score <span className="font-bold text-white tabular-nums">{scoreStr}</span>
                      <span className="text-white/40 mx-2">·</span>
                      Best <span className="font-bold text-white tabular-nums">{bestStr}</span>
                    </div>
                    {isNewHigh ? (
                      <div className="text-amber-300 text-sm font-semibold mb-4">
                        ✨ New high score!
                      </div>
                    ) : (
                      <div className="h-4" />
                    )}
                    {onRestart && (
                      <button
                        type="button"
                        onClick={onRestart}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 border border-amber-500 hover:border-amber-400 text-black font-semibold transition-colors"
                      >
                        <IconReload />
                        Restart
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Mobile touch controls — below viewport, above bottom bar */}
          {mobile && (
            <div className="lg:hidden mt-3 flex justify-center">
              {mobile}
            </div>
          )}
        </main>
      </div>

      {/* ── Bottom bar ────────────────────────────── */}
      <footer className="sticky bottom-0 z-20 backdrop-blur-md bg-black/50 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4 overflow-x-auto">
          {controls.length > 0 && (
            <div className="flex items-center gap-3 min-w-0">
              {controls.map((c, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 text-xs text-white/60 whitespace-nowrap">
                  <kbd className="px-1.5 py-0.5 rounded border border-white/15 bg-white/[0.06] font-mono text-[10px] text-white/90">
                    {c.key}
                  </kbd>
                  <span>{c.label}</span>
                </span>
              ))}
            </div>
          )}
          <div className="flex-1" />
          {footer}
          {onRestart && (
            <button
              type="button"
              onClick={onRestart}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/15 hover:border-white/40 text-white/80 hover:text-white hover:bg-white/10 text-xs font-medium transition-colors"
            >
              <IconReload />
              Restart
            </button>
          )}
        </div>
      </footer>
    </section>
  )
}
