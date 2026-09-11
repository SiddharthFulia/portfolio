// Arcade — hub page for the 50-game expansion.
//
// Layout (mirrors Lab / Science / Explore playbook):
//   1. Hero strip     — gradient title, eyebrow, subtitle, live pill
//   2. Category chips — All + 10 categories (Arcade, Puzzle, Card, …, Sim)
//   3. Search box     — filters by title (case-insensitive substring)
//   4. Grid           — 2 / 3 / 4 / 5 columns, GameCard per entry
//
// Clicking a card navigates to /arcade/:slug. Each game is a placeholder
// stub in this drop — sibling agents will replace them in parallel.

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { GAMES, CATEGORIES, CATEGORY_ACCENTS, CATEGORY_GRADIENTS } from '../components/arcade/gameRegistry'

/* ── Difficulty stars ───────────────────────────── */
function DifficultyStars({ level = 1 }) {
  const filled = Math.max(0, Math.min(5, level))
  return (
    <div className="flex items-center gap-0.5" aria-label={`Difficulty ${filled} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          className={`w-3 h-3 ${i <= filled ? 'text-amber-400' : 'text-white/15'}`}
          fill="currentColor"
        >
          <path d="M12 2l2.9 6.1 6.6.6-5 4.6 1.5 6.5L12 16.9 5.9 19.8l1.5-6.5-5-4.6 6.6-.6L12 2z" />
        </svg>
      ))}
    </div>
  )
}

/* ── Game card ─────────────────────────────────── */
function GameCard({ game }) {
  const accent = CATEGORY_ACCENTS[game.category] || CATEGORY_ACCENTS.Arcade
  const gradient = CATEGORY_GRADIENTS[game.category] || CATEGORY_GRADIENTS.Arcade
  return (
    <Link
      to={`/arcade/${game.slug}`}
      className={`group relative flex flex-col rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/[0.04] ${accent.ring}`}
    >
      {/* Thumbnail */}
      <div
        className="relative aspect-square flex items-center justify-center"
        style={{ background: gradient }}
      >
        <div aria-hidden className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
        <span className="relative text-5xl sm:text-6xl select-none drop-shadow-lg" role="img" aria-label={game.title}>
          {game.icon}
        </span>
        <span className={`absolute top-2 left-2 inline-flex items-center gap-1 text-[10px] font-medium border rounded-full px-1.5 py-0.5 backdrop-blur ${accent.chip}`}>
          <span className={`w-1 h-1 rounded-full ${accent.dot}`} />
          {game.category}
        </span>
      </div>

      {/* Body */}
      <div className="p-3 sm:p-4 flex flex-col flex-1">
        <h3 className="font-bold text-sm sm:text-base leading-snug text-white line-clamp-2 mb-1">
          {game.title}
        </h3>
        <p className="text-xs text-white/50 leading-relaxed line-clamp-2 mb-3">
          {game.desc}
        </p>
        <div className="mt-auto flex items-center justify-between">
          <DifficultyStars level={game.difficulty} />
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300 group-hover:text-amber-200 transition-colors">
            Play
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 transition-transform group-hover:translate-x-0.5">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  )
}

export default function Arcade() {
  const [activeCat, setActiveCat] = useState('All')
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return GAMES.filter((g) => {
      if (activeCat !== 'All' && g.category !== activeCat) return false
      if (!q) return true
      return g.title.toLowerCase().includes(q) || g.desc.toLowerCase().includes(q)
    })
  }, [activeCat, query])

  const countByCat = useMemo(() => {
    const m = { All: GAMES.length }
    for (const c of CATEGORIES) m[c] = 0
    for (const g of GAMES) m[g.category] = (m[g.category] || 0) + 1
    return m
  }, [])

  return (
    <section className="relative min-h-screen bg-[#0a0a0e] text-white pt-24 pb-20 px-4 sm:px-6 lg:px-10 overflow-hidden">
      {/* Ambient orbs */}
      <div aria-hidden className="ambient-orb absolute -top-32 left-1/3 opacity-60" />
      <div aria-hidden className="ambient-orb ambient-orb-cool absolute top-1/2 -right-40 opacity-50" />

      <div className="relative z-10 max-w-7xl mx-auto">
        {/* ── Hero strip ─────────────────────────── */}
        <div className="mb-10 max-w-3xl">
          <p className="eyebrow-mono mb-4 flex items-center gap-2 text-amber-300/90">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            {GAMES.length} games · canvas rendered
          </p>
          <h1 className="font-poppins font-black tracking-tight leading-[0.95] text-5xl sm:text-6xl md:text-7xl bg-gradient-to-r from-amber-300 via-rose-300 to-fuchsia-400 bg-clip-text text-transparent">
            Arcade
          </h1>
          <p className="mt-5 text-white/70 text-base sm:text-lg leading-relaxed">
            50+ browser games — canvas-rendered, real physics, real graphics.
            No emulators, no iframes. Every game is a first-class page with
            keyboard + touch controls and localStorage high scores.
          </p>
        </div>

        {/* ── Search + category chips ────────────── */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search 50 games…"
              className="w-full h-10 pl-9 pr-3 rounded-xl bg-white/[0.04] border border-white/10 focus:border-amber-400/60 focus:bg-white/[0.06] outline-none text-sm text-white placeholder-white/40 transition-colors"
            />
          </div>
          <div className="text-xs text-white/40 font-mono whitespace-nowrap">
            {filtered.length} / {GAMES.length} showing
          </div>
        </div>

        <div className="mb-8 flex flex-wrap gap-2">
          {['All', ...CATEGORIES].map((cat) => {
            const isActive = cat === activeCat
            const accent = cat === 'All' ? null : (CATEGORY_ACCENTS[cat] || CATEGORY_ACCENTS.Arcade)
            const activeCls = cat === 'All'
              ? 'bg-white text-black border-white'
              : `${accent.chip} !text-white !bg-white/20 !border-white/40`
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCat(cat)}
                className={`inline-flex items-center gap-1.5 text-xs font-semibold border rounded-full px-3 py-1.5 transition-colors ${
                  isActive
                    ? activeCls
                    : cat === 'All'
                    ? 'border-white/15 text-white/70 hover:text-white hover:border-white/30'
                    : `${accent.chip} hover:!text-white`
                }`}
              >
                {cat !== 'All' && accent && <span className={`w-1.5 h-1.5 rounded-full ${accent.dot}`} />}
                {cat}
                <span className="opacity-60 tabular-nums">{countByCat[cat] ?? 0}</span>
              </button>
            )
          })}
        </div>

        {/* ── Grid ────────────────────────────── */}
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-white/50">
            No games match that filter.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
            {filtered.map((g) => <GameCard key={g.slug} game={g} />)}
          </div>
        )}

        {/* ── Footer note ───────────────────── */}
        <div className="mt-14 text-center text-xs text-white/40">
          <p>
            {GAMES.length} games · {CATEGORIES.length} categories · every score persisted locally.
          </p>
        </div>
      </div>
    </section>
  )
}
