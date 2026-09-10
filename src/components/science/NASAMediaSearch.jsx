// NASAMediaSearch — search the NASA Image & Video Library (~140k assets).
//
// Composition:
//   1. Hero strip
//   2. Telemetry — total results, currently loaded, media type, top center
//   3. Search bar + suggestion chips + media-type toggle
//   4. Masonry grid of result cards
//   5. Detail modal — HD image + full description + keywords + credit

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { fetchMediaSearch, debounce } from '../../api/nasa'
import { LuxeLoader } from '../loaders'
import { ModuleHero, StatCard, SectionHeader, FilterChips, FriendlyError } from './ModuleShell'

const SUGGESTIONS = ['nebula', 'mars', 'hubble', 'earth', 'saturn', 'jupiter', 'astronaut', 'apollo', 'galaxy', 'space station']

const DetailModal = ({ item, onClose }) => {
  const data = item?.data?.[0]
  const link = item?.links?.[0]?.href

  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  if (!data) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4" onClick={onClose}>
      <div className="luxe-card max-w-4xl w-full max-h-[92vh] overflow-y-auto relative" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-gray-900/90 border border-gray-700 text-white hover:bg-gray-800 flex items-center justify-center text-lg transition-colors"
        >
          ×
        </button>

        {link && (
          <img src={link} alt={data.title} className="w-full max-h-[55vh] object-contain bg-black rounded-t-2xl" />
        )}

        <div className="p-5 sm:p-6 space-y-4">
          <div>
            <h3 className="text-white font-bold text-lg sm:text-xl mb-2">{data.title}</h3>
            <div className="flex flex-wrap items-center gap-2">
              {data.date_created && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-[11px] text-cyan-300 font-mono">
                  {new Date(data.date_created).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                </span>
              )}
              {data.center && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-[11px] text-emerald-300 font-semibold">
                  NASA {data.center}
                </span>
              )}
              {data.media_type && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-gray-700 bg-gray-900/60 text-[11px] text-gray-400 font-mono">
                  {data.media_type}
                </span>
              )}
            </div>
          </div>

          {data.description && (
            <p className="text-gray-300 text-sm leading-relaxed">{data.description}</p>
          )}

          {data.keywords?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {data.keywords.slice(0, 18).map(kw => (
                <span key={kw} className="px-2 py-0.5 bg-gray-800/80 border border-gray-700/50 text-gray-400 text-[10px] font-mono rounded">{kw}</span>
              ))}
            </div>
          )}

          {(data.photographer || data.secondary_creator) && (
            <div className="text-gray-500 text-xs space-y-0.5">
              {data.photographer && <p>Photographer: <span className="text-gray-400">{data.photographer}</span></p>}
              {data.secondary_creator && <p>Credit: <span className="text-gray-400">{data.secondary_creator}</span></p>}
            </div>
          )}

          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 text-sm font-semibold hover:bg-cyan-500/20 transition-colors"
            >
              Open HD asset
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

const NASAMediaSearch = () => {
  const [query, setQuery] = useState('nebula')
  const [mediaType, setMediaType] = useState('image')
  const [results, setResults] = useState([])
  const [totalHits, setTotalHits] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)
  const [selectedItem, setSelectedItem] = useState(null)
  const [updated, setUpdated] = useState(null)
  const abortRef = useRef(null)

  const search = useCallback(async (q, type, pg, append = false) => {
    if (!q.trim()) return
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    if (!append) setLoading(true)
    setError(null)

    const { data, error: err } = await fetchMediaSearch(
      { q, media_type: type, page: pg, page_size: 24 },
      { signal: controller.signal }
    )
    if (err) { setError(err); setLoading(false); return }
    if (data?.collection) {
      const items = data.collection.items || []
      setResults(prev => append ? [...prev, ...items] : items)
      setTotalHits(data.collection.metadata?.total_hits || 0)
      setUpdated(new Date())
    }
    setLoading(false)
  }, [])

  const debouncedSearch = useMemo(
    () => debounce((q) => { setPage(1); search(q, mediaType, 1) }, 400),
    [search, mediaType]
  )

  useEffect(() => {
    search(query, mediaType, 1)
    return () => { if (abortRef.current) abortRef.current.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaType])

  const onInput = (e) => {
    setQuery(e.target.value)
    debouncedSearch(e.target.value)
  }
  const onSuggest = (s) => {
    setQuery(s); setPage(1); search(s, mediaType, 1)
  }
  const loadMore = () => {
    const next = page + 1
    setPage(next)
    search(query, mediaType, next, true)
  }

  // Top NASA center in the currently-loaded results (fun bonus telemetry)
  const topCenter = useMemo(() => {
    if (!results.length) return null
    const counts = {}
    results.forEach(r => {
      const c = r.data?.[0]?.center
      if (c) counts[c] = (counts[c] || 0) + 1
    })
    const [center] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || []
    return center
  }, [results])

  return (
    <div className="space-y-6 sm:space-y-8">
      <ModuleHero
        eyebrow="Media Library · NASA feed"
        title="Media Library"
        subtitle="Search the full NASA Image & Video Library — hundreds of thousands of stills and clips from every mission, telescope, and centre. Click any card for the HD version."
        updated={updated}
        accent="blue"
      />

      {/* Telemetry */}
      <div>
        <SectionHeader>Live telemetry</SectionHeader>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <StatCard tone="blue"    label="Match count" value={totalHits ? totalHits.toLocaleString() : '—'} ctx={`for "${query}"`} loading={loading && results.length === 0} />
          <StatCard tone="cyan"    label="Loaded"      value={results.length}  ctx="on this page"       loading={loading && results.length === 0} />
          <StatCard tone="violet"  label="Media type"  value={mediaType[0].toUpperCase() + mediaType.slice(1)} ctx="image or video"     loading={false} />
          <StatCard tone="emerald" label="Top centre"  value={topCenter || '—'} ctx="most-represented NASA facility" loading={loading && results.length === 0} />
        </div>
      </div>

      {/* Search + filters */}
      <div>
        <SectionHeader>Search the archive</SectionHeader>
        <form onSubmit={(e) => { e.preventDefault(); setPage(1); search(query, mediaType, 1) }} className="space-y-3">
          <div className="relative">
            <input
              type="search"
              value={query}
              onChange={onInput}
              placeholder="Try nebula, hubble, saturn, apollo…"
              aria-label="Search NASA media library"
              className="w-full px-4 py-3 pl-10 bg-gray-900/60 border border-gray-800 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500/50 transition-colors"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <p className="text-[10px] text-gray-600 font-mono">tip: search updates as you type — press Enter for the exact match</p>
        </form>

        <div className="mt-4 space-y-3">
          <FilterChips
            options={SUGGESTIONS.map(s => ({ key: s, label: s }))}
            value={query}
            onChange={onSuggest}
          />
          <FilterChips
            options={[
              { key: 'image', label: 'Images' },
              { key: 'video', label: 'Videos' },
            ]}
            value={mediaType}
            onChange={setMediaType}
          />
        </div>
      </div>

      <FriendlyError error={error} onRetry={() => search(query, mediaType, 1)} />

      {loading && results.length === 0 && (
        <div className="py-16 flex items-center justify-center">
          <LuxeLoader variant="cosmos" size="lg" label="searching NASA archives…" />
        </div>
      )}

      {results.length > 0 && (
        <>
          <div className="columns-2 sm:columns-3 lg:columns-4 gap-3 space-y-3">
            {results.map((item, i) => {
              const data = item.data?.[0]
              const link = item.links?.[0]?.href
              if (!data || !link) return null
              return (
                <button
                  key={`${data.nasa_id || i}`}
                  onClick={() => setSelectedItem(item)}
                  className="w-full break-inside-avoid group relative rounded-xl overflow-hidden border border-gray-800 hover:border-blue-500/40 transition-all duration-300 block text-left"
                >
                  <img
                    src={link}
                    alt={data.title}
                    className="w-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                    loading="lazy"
                    onError={(e) => { e.currentTarget.style.display = 'none' }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="absolute bottom-0 inset-x-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <p className="text-white text-xs font-semibold line-clamp-2">{data.title}</p>
                    {data.date_created && (
                      <p className="text-gray-400 text-[10px] mt-1 font-mono">{new Date(data.date_created).getFullYear()}</p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {results.length < totalHits && (
            <div className="text-center pt-4">
              <button
                onClick={loadMore}
                disabled={loading}
                className="luxe-press tap-44 px-6 py-3 rounded-xl border border-gray-800 bg-gray-900/60 text-gray-300 hover:border-gray-700 hover:text-white transition-colors disabled:opacity-40 text-sm font-semibold"
              >
                {loading ? 'Loading…' : `Load more (${results.length} of ${totalHits.toLocaleString()})`}
              </button>
            </div>
          )}
        </>
      )}

      {!loading && results.length === 0 && !error && query && (
        <div className="luxe-card p-6 text-center">
          <p className="text-gray-300 font-semibold mb-1">No matches for "{query}"</p>
          <p className="text-gray-500 text-sm">Try a broader term or one of the suggestion chips above.</p>
        </div>
      )}

      {selectedItem && <DetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />}
    </div>
  )
}

export default NASAMediaSearch
