// TechPortal — search NASA's TechTransfer patent + spinoff database.
//
// Composition:
//   1. Hero strip
//   2. Telemetry — result count, currently-showing, unique categories, top category
//   3. Search bar + suggestion chips
//   4. Patent cards (luxe glass, click for full detail modal)
//   5. Pagination

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { fetchTechTransfer, debounce } from '../../api/nasa'
import { LuxeLoader } from '../loaders'
import { ModuleHero, StatCard, SectionHeader, FilterChips, FriendlyError } from './ModuleShell'

const QUICK_TERMS = ['engine', 'solar', 'propulsion', 'material', 'sensor', 'robot', 'thermal', 'optical']

/* ── Detail Modal ── */
const DetailModal = ({ patent, onClose }) => {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  // TechTransfer schema: [id, patent_number, category, title, description, url, ..., image_url]
  const patentId = patent[1] || ''
  const category = patent[0] || ''
  const title    = patent[2] || 'NASA-developed technology'
  const desc     = patent[3] || ''
  const detail   = patent[4] || ''
  const url      = patent[5] || ''
  const image    = patent[10] || ''

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4" onClick={onClose}>
      <div className="luxe-card max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 relative" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 w-9 h-9 rounded-full bg-gray-900/90 border border-gray-700 text-white hover:bg-gray-800 flex items-center justify-center text-lg transition-colors"
        >
          ×
        </button>

        <div className="mb-4 pr-8">
          <h3 className="text-white font-bold text-lg sm:text-xl mb-2">{title}</h3>
          <div className="flex flex-wrap items-center gap-2">
            {patentId && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-[11px] text-cyan-300 font-mono">
                {patentId}
              </span>
            )}
            {category && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 text-[11px] text-fuchsia-300 font-semibold">
                {category}
              </span>
            )}
          </div>
        </div>

        {desc && <p className="text-gray-300 text-sm leading-relaxed mb-3">{desc.replace(/<[^>]+>/g, '')}</p>}
        {detail && detail !== desc && <p className="text-gray-400 text-sm leading-relaxed mb-4">{detail.replace(/<[^>]+>/g, '')}</p>}

        {image && (
          <img
            src={image}
            alt={title}
            className="w-full max-h-64 object-contain rounded-lg bg-gray-900 mb-4 border border-gray-800"
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
        )}

        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-sky-500/40 bg-sky-500/10 text-sky-300 text-sm font-semibold hover:bg-sky-500/20 transition-colors"
          >
            View the patent
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        )}
      </div>
    </div>
  )
}

const TechPortal = () => {
  const [patents, setPatents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('engine')
  const [selectedPatent, setSelectedPatent] = useState(null)
  const [page, setPage] = useState(1)
  const [updated, setUpdated] = useState(null)
  const abortRef = useRef(null)

  const fetchPatents = useCallback(async (q = '') => {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError(null)

    const searchTerm = q.trim() || 'engine'
    const { data, error: err } = await fetchTechTransfer({ q: searchTerm }, { signal: controller.signal })
    if (err) { setError(err); setLoading(false); return }
    if (data?.results) {
      setPatents(data.results)
      setUpdated(new Date())
    }
    setLoading(false)
  }, [])

  const debouncedFetch = useMemo(
    () => debounce((q) => { setPage(1); fetchPatents(q) }, 500),
    [fetchPatents]
  )

  useEffect(() => {
    fetchPatents('engine')
    return () => { if (abortRef.current) abortRef.current.abort() }
  }, [fetchPatents])

  const onInput = (e) => {
    setQuery(e.target.value)
    debouncedFetch(e.target.value)
  }
  const onQuick = (q) => { setQuery(q); setPage(1); fetchPatents(q) }

  const PER_PAGE = 12
  const paginated = useMemo(() => {
    const start = (page - 1) * PER_PAGE
    return patents.slice(start, start + PER_PAGE)
  }, [patents, page])
  const totalPages = Math.max(1, Math.ceil(patents.length / PER_PAGE))

  const byCategory = useMemo(() => {
    const m = {}
    patents.forEach(p => { const c = p[0] || 'Uncategorised'; m[c] = (m[c] || 0) + 1 })
    return m
  }, [patents])
  const uniqueCategories = Object.keys(byCategory).length
  const topCategory = useMemo(() => {
    const entries = Object.entries(byCategory).sort((a, b) => b[1] - a[1])
    return entries[0]?.[0]
  }, [byCategory])

  return (
    <div className="space-y-6 sm:space-y-8">
      <ModuleHero
        eyebrow="TechTransfer · NASA feed"
        title="Tech Portal"
        subtitle="Search NASA's patent catalogue and spinoff database — real technologies developed for space that are now licensable to industry. Filed as JSON, rendered as cards."
        updated={updated}
        accent="sky"
        live={false}
      />

      {/* Telemetry */}
      <div>
        <SectionHeader>Live telemetry</SectionHeader>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <StatCard tone="sky"    label="Match count"     value={patents.length} ctx={`for "${query}"`} loading={loading} />
          <StatCard tone="cyan"   label="Showing"         value={paginated.length} ctx={`page ${page} of ${totalPages}`} loading={loading} live={false} />
          <StatCard tone="violet" label="Categories"      value={uniqueCategories} ctx="unique research areas" loading={loading} live={false} />
          <StatCard tone="amber"  label="Top category"    value={topCategory ? topCategory.slice(0, 20) : '—'} ctx="most common in results" loading={loading} live={false} />
        </div>
      </div>

      {/* Search */}
      <div>
        <SectionHeader>Search patents</SectionHeader>
        <form onSubmit={(e) => { e.preventDefault(); setPage(1); fetchPatents(query) }} className="space-y-3">
          <div className="relative">
            <input
              type="search"
              value={query}
              onChange={onInput}
              placeholder="Try engine, solar, propulsion, sensor…"
              aria-label="Search NASA tech portal"
              className="w-full px-4 py-3 pl-10 bg-gray-900/60 border border-gray-800 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:border-sky-500/50 transition-colors"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <p className="text-[10px] text-gray-600 font-mono">tip: results update as you type</p>
        </form>

        <div className="mt-3">
          <FilterChips
            options={QUICK_TERMS.map(t => ({ key: t, label: t }))}
            value={query}
            onChange={onQuick}
          />
        </div>
      </div>

      <FriendlyError error={error} onRetry={() => fetchPatents(query)} />

      {loading ? (
        <div className="py-16 flex items-center justify-center">
          <LuxeLoader variant="cosmos" size="lg" label="searching NASA patents…" />
        </div>
      ) : patents.length === 0 ? (
        <div className="luxe-card p-6 text-center">
          <p className="text-gray-300 font-semibold mb-1">No patents match "{query}"</p>
          <p className="text-gray-500 text-sm">Try one of the suggestion chips above.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {paginated.map((patent, i) => {
              const patentId = patent[1] || ''
              const category = patent[0] || ''
              const title    = patent[2] || 'NASA technology'
              const desc     = patent[3] || ''
              return (
                <button
                  key={`${patent[0] || i}-${i}-${page}`}
                  onClick={() => setSelectedPatent(patent)}
                  className="w-full text-left luxe-card p-4 hover:border-sky-500/30 transition-all"
                >
                  <div className="absolute inset-x-0 top-0 h-0.5 bg-sky-500 opacity-70" />
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-white font-semibold text-sm line-clamp-2 leading-tight mb-1">{title}</h4>
                      {desc && <p className="text-gray-400 text-xs line-clamp-2">{desc.replace(/<[^>]+>/g, '')}</p>}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {patentId && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-gray-800/80 border border-gray-700 rounded font-mono text-gray-400">
                            {patentId}
                          </span>
                        )}
                        {category && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300">
                            {category}
                          </span>
                        )}
                      </div>
                    </div>
                    <svg className="w-4 h-4 text-gray-600 shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="luxe-press tap-44 px-3 py-2 rounded-full text-xs font-semibold border border-gray-800 bg-gray-900/40 text-gray-300 hover:border-gray-700 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ← Prev
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let n
                if (totalPages <= 7) n = i + 1
                else if (page <= 4) n = i + 1
                else if (page >= totalPages - 3) n = totalPages - 6 + i
                else n = page - 3 + i
                return (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    className={`w-9 h-9 rounded-full text-xs font-bold tabular-nums transition-colors ${
                      page === n
                        ? 'border border-sky-400/60 bg-sky-500/15 text-sky-200'
                        : 'border border-gray-800 bg-gray-900/40 text-gray-400 hover:border-gray-700 hover:text-white'
                    }`}
                  >
                    {n}
                  </button>
                )
              })}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="luxe-press tap-44 px-3 py-2 rounded-full text-xs font-semibold border border-gray-800 bg-gray-900/40 text-gray-300 hover:border-gray-700 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {selectedPatent && <DetailModal patent={selectedPatent} onClose={() => setSelectedPatent(null)} />}
    </div>
  )
}

export default TechPortal
