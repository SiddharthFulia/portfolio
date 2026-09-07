// /algorithms — hub page. Sidebar → per-topic pages live under
// /algorithms/:slug and reuse <TopicShell />.
//
// Sections:
//   1. Hero — gradient title + eyebrow + a search / filter surface
//   2. Featured picks — 6 curated cards at a glance
//   3. Data Structures grid  (I in the spec)
//   4. Algorithms grid       (II in the spec)
//
// The single source of truth for every card is
// src/components/algorithms/topics.js — updating that file surfaces
// the new topic here + in the shell sidebar + in the mobile chip bar.
//
// No `/api/*` fetches — every topic runs in the browser.

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Input } from 'antd'
import { SearchOutlined, ArrowRightOutlined } from '@ant-design/icons'
import {
  TOPICS,
  TOPICS_BY_SLUG,
  CATEGORIES,
  FILTERS,
  FEATURED_SLUGS,
} from '../components/algorithms'

const CATEGORY_ACCENT = {
  'Data Structures': {
    chip:  'bg-cyan-500/15 text-cyan-300 border-cyan-400/30',
    dot:   'bg-cyan-400',
    hover: 'hover:border-cyan-400/40',
  },
  'Algorithms': {
    chip:  'bg-amber-500/15 text-amber-300 border-amber-400/30',
    dot:   'bg-amber-400',
    hover: 'hover:border-amber-400/40',
  },
}

function TopicCard({ topic }) {
  const a = CATEGORY_ACCENT[topic.category] || CATEGORY_ACCENT['Algorithms']
  return (
    <Link
      to={`/algorithms/${topic.slug}`}
      className={`group relative flex flex-col rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5 transition-colors ${a.hover}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-1.5 h-1.5 rounded-full ${a.dot} shrink-0`} />
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-500 truncate">
            {topic.category === 'Data Structures' ? 'DS' : 'ALGO'}
          </p>
        </div>
        <span className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${a.chip}`}>
          {topic.complexity}
        </span>
      </div>
      <h3 className="text-[15px] font-bold text-white leading-tight mb-1.5">
        {topic.title}
      </h3>
      <p className="text-[12.5px] text-gray-400 leading-snug line-clamp-2 mb-3">
        {topic.summary}
      </p>
      <span className="mt-auto text-[11px] font-mono text-gray-500 group-hover:text-amber-300 transition-colors flex items-center gap-1">
        Open <ArrowRightOutlined className="text-[10px] transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  )
}

function FeaturedCard({ topic, index }) {
  const glows = [
    'from-amber-500/25 via-orange-500/15 to-rose-500/20',
    'from-cyan-500/25 via-sky-500/15 to-violet-500/20',
    'from-fuchsia-500/25 via-pink-500/15 to-rose-500/20',
    'from-emerald-500/25 via-teal-500/15 to-cyan-500/20',
    'from-violet-500/25 via-indigo-500/15 to-cyan-500/20',
    'from-rose-500/25 via-fuchsia-500/15 to-violet-500/20',
  ]
  const glow = glows[index % glows.length]
  return (
    <Link
      to={`/algorithms/${topic.slug}`}
      className={`group relative overflow-hidden rounded-2xl border border-white/10 p-5 min-h-[168px] flex flex-col transition-transform hover:-translate-y-0.5 bg-gradient-to-br ${glow}`}
    >
      <div className="relative z-10 flex-1">
        <p className="text-[10px] font-mono uppercase tracking-[0.24em] text-white/80">
          Featured
        </p>
        <h3 className="mt-2 text-lg font-bold text-white leading-tight">{topic.title}</h3>
        <p className="mt-1.5 text-[12.5px] text-white/80 leading-snug line-clamp-3">
          {topic.summary}
        </p>
      </div>
      <div className="relative z-10 mt-3 flex items-center justify-between text-[11px] font-mono">
        <span className="text-white/70">{topic.complexity}</span>
        <span className="text-white/90 group-hover:text-white flex items-center gap-1">
          Open <ArrowRightOutlined className="text-[10px] transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
      <span aria-hidden className="absolute inset-0 opacity-30 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
    </Link>
  )
}

export default function Algorithms() {
  const [query, setQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')

  useEffect(() => { document.title = 'Algorithms · Sid' }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filter = FILTERS.find(f => f.key === activeFilter)
    return TOPICS.filter(t => {
      if (filter && filter.match && !filter.match(t)) return false
      if (!q) return true
      return (
        t.title.toLowerCase().includes(q) ||
        t.summary.toLowerCase().includes(q) ||
        t.tags.some(tag => tag.toLowerCase().includes(q))
      )
    })
  }, [query, activeFilter])

  const featured = FEATURED_SLUGS.map(s => TOPICS_BY_SLUG[s]).filter(Boolean)

  const grouped = useMemo(() => {
    const out = {}
    for (const c of CATEGORIES) out[c] = []
    for (const t of filtered) {
      if (!out[t.category]) out[t.category] = []
      out[t.category].push(t)
    }
    return out
  }, [filtered])

  const total = TOPICS.length
  const shown = filtered.length

  return (
    <div className="min-h-screen bg-[#0a0a0e] text-gray-100 pt-24 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* ── Hero ── */}
        <header className="mb-10">
          <p className="eyebrow-mono text-[11px] font-mono uppercase tracking-[0.24em] text-amber-300/90 mb-3 flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {total} interactive visualisers · runs every step in your browser
          </p>
          <h1
            className="font-poppins font-black tracking-tight leading-[0.95] text-4xl sm:text-5xl md:text-6xl"
            style={{ backgroundImage: 'linear-gradient(90deg,#fbbf24,#f43f5e,#e879f9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}
          >
            Algorithms
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] sm:text-base text-gray-300 leading-relaxed">
            A hands-on tour of every data structure and algorithm worth memorising —
            each one with a scrubbable animation, KaTeX-typeset proofs,
            an annotated pseudocode block, and a real-world use case so the abstraction sticks.
          </p>
        </header>

        {/* ── Search + filter chips ── */}
        <div className="mb-10 space-y-3">
          <div className="max-w-md">
            <Input
              size="large"
              allowClear
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search topics — dijkstra, sorting, DP…"
              prefix={<SearchOutlined className="text-gray-500" />}
              className="!bg-white/[0.03] !border-white/10 !text-white"
              aria-label="Search topics"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setActiveFilter(f.key)}
                className={`text-[11px] font-semibold px-3 py-1.5 rounded-full whitespace-nowrap border transition-colors ${
                  activeFilter === f.key
                    ? 'bg-amber-500/15 border-amber-400/50 text-amber-200'
                    : 'bg-white/[0.02] border-white/10 text-gray-400 hover:text-white hover:border-white/20'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {query && (
            <p className="text-[11px] font-mono text-gray-500">
              Showing <span className="text-white">{shown}</span> of {total} topics
            </p>
          )}
        </div>

        {/* ── Featured strip (hidden while searching) ── */}
        {!query && activeFilter === 'all' && featured.length > 0 && (
          <section className="mb-12" aria-label="Featured picks">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-lg sm:text-xl font-bold text-white">Featured picks</h2>
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-500">
                Six to start with
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {featured.map((t, i) => (
                <FeaturedCard key={t.slug} topic={t} index={i} />
              ))}
            </div>
          </section>
        )}

        {/* ── Category grids ── */}
        {CATEGORIES.map((cat) => {
          const items = grouped[cat] || []
          if (!items.length) return null
          return (
            <section key={cat} className="mb-14" aria-label={cat}>
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="text-xl sm:text-2xl font-bold text-white">
                  {cat === 'Data Structures' ? 'I. Data Structures' : 'II. Algorithms'}
                </h2>
                <span className={`text-[10px] font-mono uppercase tracking-[0.2em] ${
                  cat === 'Data Structures' ? 'text-cyan-300' : 'text-amber-300'
                }`}>
                  {items.length} topics
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {items.map((t) => (
                  <TopicCard key={t.slug} topic={t} />
                ))}
              </div>
            </section>
          )
        })}

        {/* ── Empty state ── */}
        {shown === 0 && (
          <div className="text-center py-16">
            <p className="text-gray-400 text-sm mb-2">
              No topics match <span className="text-white">"{query}"</span>.
            </p>
            <button
              type="button"
              onClick={() => { setQuery(''); setActiveFilter('all') }}
              className="text-[12px] font-semibold text-amber-300 hover:text-amber-200"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
