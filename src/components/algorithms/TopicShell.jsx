// TopicShell — page layout every /algorithms/:slug uses.
//
// Two authoring styles supported (mix freely):
//
//   1. CHILDREN mode (the common one) — the caller drops
//      <VisualiserSection>, <ExplanationBlock>, <PseudocodeBlock>,
//      <ComplexityTable>, <RealWorldCard>, etc. as children in the order
//      they want them to appear. TopicShell paints the hero, sidebar,
//      chip bar, and prev/next nav around them.
//
//      <TopicShell slug="arrays" title="Arrays">
//        <ExplanationBlock>…</ExplanationBlock>
//        <VisualiserSection>
//          <VizPanel>…</VizPanel>
//          <ControlsPanel>…</ControlsPanel>
//        </VisualiserSection>
//        <PseudocodeBlock … />
//        <ComplexityTable … />
//        <RealWorldCard>…</RealWorldCard>
//      </TopicShell>
//
//   2. SLOTTED mode — pass named props (`visual`, `controls`,
//      `explanation`, `pseudocode`, `complexity`, `realWorld`,
//      `furtherReading`). Kept for the placeholder shells and any
//      caller that prefers explicit slots. The children region still
//      renders after the slots.
//
// Design rules — bold gradient title, luxe-glass panels, dark + light
// mode inherit from `#0a0a0e` bg. Mobile: sidebar collapses to a
// horizontal chip bar + a hamburger drawer.

import { Link, NavLink } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { MenuOutlined, CloseOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import { TOPICS, TOPICS_BY_SLUG, CATEGORIES } from './topics'

function SidebarLinks({ slug, onNavigate }) {
  return (
    <nav className="space-y-6" aria-label="Algorithm topics">
      {CATEGORIES.map((cat) => {
        const items = TOPICS.filter(t => t.category === cat)
        return (
          <div key={cat}>
            <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-amber-300 mb-2 px-2">
              {cat}
            </p>
            <ul className="space-y-0.5">
              {items.map((t) => (
                <li key={t.slug}>
                  <NavLink
                    to={`/algorithms/${t.slug}`}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      `flex items-center gap-2 px-2 py-1.5 rounded-md text-[12.5px] transition-colors ${
                        isActive || t.slug === slug
                          ? 'bg-amber-500/15 text-amber-100 ring-1 ring-amber-400/40'
                          : 'text-gray-400 hover:text-white hover:bg-white/[0.03]'
                      }`
                    }
                  >
                    <span className={`w-1 h-1 rounded-full ${
                      t.slug === slug ? 'bg-amber-400' : 'bg-gray-600'
                    }`} />
                    <span className="truncate">{t.title}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}

function TopicChipBar({ slug }) {
  return (
    <nav className="lg:hidden -mx-4 px-4 pb-3 overflow-x-auto" aria-label="Topics">
      <div className="flex gap-1.5 min-w-max">
        {TOPICS.map((t) => (
          <Link
            key={t.slug}
            to={`/algorithms/${t.slug}`}
            className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-full whitespace-nowrap border transition-colors ${
              t.slug === slug
                ? 'bg-amber-500/15 border-amber-400/50 text-amber-200'
                : 'bg-white/[0.02] border-white/10 text-gray-400 hover:text-white hover:border-white/20'
            }`}
          >
            {t.title}
          </Link>
        ))}
      </div>
    </nav>
  )
}

export default function TopicShell({
  slug,
  title,
  category,
  eyebrow,
  intro,
  complexityChip,
  // Slotted mode
  visual,
  controls,
  explanation,
  pseudocode,
  complexity,
  realWorld,
  furtherReading = [],
  // Children mode (preferred)
  children,
}) {
  const topic = slug ? TOPICS_BY_SLUG[slug] : null
  const displayTitle = title || topic?.title || 'Algorithm'
  const displayCategory = category || topic?.category
  const displayEyebrow = eyebrow || (topic?.tags?.includes('DP') ? 'Dynamic Programming' : displayCategory)
  const displayIntro = intro || topic?.summary
  const displayChip = complexityChip || topic?.complexity

  const [drawerOpen, setDrawerOpen] = useState(false)
  const reduce = useReducedMotion()

  // Scroll to top on slug change.
  useEffect(() => {
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'auto' })
    if (typeof document !== 'undefined' && displayTitle) {
      document.title = `${displayTitle} · Sid`
    }
  }, [slug, displayTitle])

  const nextPrev = useMemo(() => {
    if (!slug) return { prev: null, next: null }
    const i = TOPICS.findIndex(t => t.slug === slug)
    return {
      prev: i > 0 ? TOPICS[i - 1] : null,
      next: i >= 0 && i < TOPICS.length - 1 ? TOPICS[i + 1] : null,
    }
  }, [slug])

  const hasSlottedViz = !!(visual || controls)
  const hasSlottedBelowFold = !!(explanation || pseudocode || complexity || realWorld || furtherReading?.length)

  return (
    <div className="min-h-screen bg-[#0a0a0e] text-gray-100 pt-24 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-start gap-8">

          {/* ── Sidebar (desktop only) ── */}
          <aside className="hidden lg:block w-64 shrink-0 sticky top-24 self-start max-h-[calc(100vh-6rem)] overflow-y-auto pr-2 pb-8">
            <Link
              to="/algorithms"
              className="inline-flex items-center gap-1.5 mb-5 text-[11px] font-mono uppercase tracking-[0.2em] text-gray-500 hover:text-amber-300 transition-colors"
            >
              <ArrowLeftOutlined className="text-[10px]" /> All algorithms
            </Link>
            <SidebarLinks slug={slug} />
          </aside>

          {/* ── Main column ── */}
          <div className="flex-1 min-w-0">

            {/* Mobile top row: hamburger + back link */}
            <div className="lg:hidden flex items-center justify-between mb-3">
              <Link
                to="/algorithms"
                className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.2em] text-gray-500 hover:text-amber-300"
              >
                <ArrowLeftOutlined className="text-[10px]" /> All
              </Link>
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-300 hover:text-white bg-white/[0.04] border border-white/10 rounded-md px-2.5 py-1.5"
                aria-label="Open topic list"
              >
                <MenuOutlined /> Topics
              </button>
            </div>

            <TopicChipBar slug={slug} />

            {/* Hero */}
            <header className="mb-6">
              {displayEyebrow && (
                <p className="eyebrow-mono text-[11px] font-mono uppercase tracking-[0.24em] text-amber-300/90 mb-2">
                  {displayEyebrow}
                </p>
              )}
              <h1
                className="font-poppins font-black tracking-tight leading-[0.95] text-3xl sm:text-4xl md:text-5xl"
                style={{ backgroundImage: 'linear-gradient(90deg,#fbbf24,#f43f5e,#e879f9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}
              >
                {displayTitle}
              </h1>
              {displayIntro && (
                <p className="mt-3 max-w-3xl text-[15px] sm:text-base text-gray-300 leading-relaxed">
                  {displayIntro}
                </p>
              )}
              {displayChip && (
                <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/10 text-[11px] font-mono">
                  <span className="text-gray-500 uppercase tracking-wider">Complexity</span>
                  <span className="text-amber-300 font-semibold">{displayChip}</span>
                </div>
              )}
            </header>

            {/* Slotted visualiser (if callers use `visual`/`controls`) */}
            {hasSlottedViz && (
              <section
                aria-label="Interactive visualiser"
                className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4 sm:gap-5 mb-8"
              >
                <div className="min-w-0">{visual}</div>
                {controls && (
                  <aside className="min-w-0">
                    <div className="xl:sticky xl:top-24">{controls}</div>
                  </aside>
                )}
              </section>
            )}

            {/* Children — the page's freeform body. Sections stack with
                consistent vertical rhythm. */}
            {children && (
              <div className="space-y-6">{children}</div>
            )}

            {/* Slotted below-fold blocks (kept after children so a caller
                can mix if they really want). */}
            {hasSlottedBelowFold && (
              <div className={`space-y-6 ${children ? 'mt-6' : ''}`}>
                {explanation}
                {pseudocode}
                {complexity}
                {realWorld}
                {furtherReading?.length > 0 && (
                  <section className="luxe-card rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
                    <h2 className="text-lg font-bold text-white mb-3">Further reading</h2>
                    <ul className="space-y-2">
                      {furtherReading.map((r, i) => (
                        <li key={i}>
                          <a href={r.href} target="_blank" rel="noreferrer noopener"
                            className="text-[13px] text-cyan-300 hover:text-cyan-200 underline underline-offset-2 decoration-cyan-500/30 hover:decoration-cyan-300">
                            {r.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}

            {/* Prev/Next */}
            {(nextPrev.prev || nextPrev.next) && (
              <nav className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-3" aria-label="Adjacent topics">
                {nextPrev.prev ? (
                  <Link
                    to={`/algorithms/${nextPrev.prev.slug}`}
                    className="rounded-xl border border-white/10 bg-white/[0.02] p-4 hover:border-amber-400/40 transition-colors"
                  >
                    <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-500">← Previous</p>
                    <p className="mt-1 text-sm font-semibold text-white">{nextPrev.prev.title}</p>
                  </Link>
                ) : <div />}
                {nextPrev.next ? (
                  <Link
                    to={`/algorithms/${nextPrev.next.slug}`}
                    className="rounded-xl border border-white/10 bg-white/[0.02] p-4 hover:border-amber-400/40 transition-colors text-right"
                  >
                    <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-500">Next →</p>
                    <p className="mt-1 text-sm font-semibold text-white">{nextPrev.next.title}</p>
                  </Link>
                ) : <div />}
              </nav>
            )}
          </div>
        </div>
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              key="algo-drawer-bg"
              className="fixed inset-0 z-40 bg-black/60 lg:hidden"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setDrawerOpen(false)}
            />
            <motion.aside
              key="algo-drawer"
              className="fixed z-50 top-0 bottom-0 left-0 w-72 max-w-[85vw] bg-[#0a0a0e] border-r border-white/10 lg:hidden overflow-y-auto"
              initial={reduce ? false : { x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-amber-300">Algorithms</p>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="text-gray-400 hover:text-white"
                  aria-label="Close topic list"
                >
                  <CloseOutlined />
                </button>
              </div>
              <div className="p-4">
                <SidebarLinks slug={slug} onNavigate={() => setDrawerOpen(false)} />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
