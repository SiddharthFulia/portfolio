import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { fetchMediaSearch, debounce } from '../../api/nasa';
import { glassCard } from './utils';
import ErrorWithRetry from './ErrorWithRetry';

const SUGGESTIONS = ['mars', 'hubble', 'earth', 'nebula', 'galaxy', 'astronaut', 'apollo', 'saturn', 'jupiter', 'space station'];

/* ── Skeleton grid ── */
const SkeletonGrid = () => (
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
    {[...Array(8)].map((_, i) => (
      <div key={i} className="animate-pulse">
        <div className="bg-gray-800 rounded-xl" style={{ height: `${150 + Math.random() * 100}px` }} />
        <div className="h-3 bg-gray-800 rounded mt-2 w-3/4" />
      </div>
    ))}
  </div>
);

/* ── Image modal ── */
const DetailModal = ({ item, onClose }) => {
  const data = item?.data?.[0];
  const link = item?.links?.[0]?.href;

  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!data) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className={`${glassCard} max-w-4xl w-full max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-gray-800/80 text-white hover:bg-gray-700 flex items-center justify-center text-lg">&times;</button>

        {link && (
          <img src={link} alt={data.title} className="w-full max-h-[50vh] object-contain bg-black rounded-t-2xl" />
        )}

        <div className="p-6 space-y-3">
          <h3 className="text-white font-bold text-lg">{data.title}</h3>
          {data.date_created && (
            <span className="inline-block px-2 py-1 bg-cyan-500/10 text-cyan-400 text-xs rounded-full font-mono">
              {new Date(data.date_created).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          )}
          {data.description && (
            <p className="text-gray-300 text-sm leading-relaxed max-h-48 overflow-y-auto">{data.description}</p>
          )}
          {data.keywords && data.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {data.keywords.slice(0, 15).map(kw => (
                <span key={kw} className="px-2 py-0.5 bg-gray-800 text-gray-400 text-xs rounded-full">{kw}</span>
              ))}
            </div>
          )}
          {data.photographer && (
            <p className="text-gray-500 text-xs">Photographer: {data.photographer}</p>
          )}
          {data.center && (
            <p className="text-gray-500 text-xs">Center: {data.center}</p>
          )}
        </div>
      </div>
    </div>
  );
};

/* ── Main ── */
const NASAMediaSearch = () => {
  const [query, setQuery] = useState('nebula');
  const [mediaType, setMediaType] = useState('image');
  const [results, setResults] = useState([]);
  const [totalHits, setTotalHits] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const abortRef = useRef(null);
  const inputRef = useRef(null);

  const search = useCallback(async (q, type, pg, append = false) => {
    if (!q.trim()) return;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!append) setLoading(true);
    setError(null);

    const { data, error: err } = await fetchMediaSearch(
      { q, media_type: type, page: pg, page_size: 24 },
      { signal: controller.signal }
    );

    if (err) { setError(err); setLoading(false); return; }
    if (data?.collection) {
      const items = data.collection.items || [];
      setResults(prev => append ? [...prev, ...items] : items);
      setTotalHits(data.collection.metadata?.total_hits || 0);
    }
    setLoading(false);
  }, []);

  // Debounced search
  const debouncedSearch = useMemo(() => debounce((q) => {
    setPage(1);
    search(q, mediaType, 1);
  }, 400), [search, mediaType]);

  useEffect(() => {
    search(query, mediaType, 1);
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [mediaType]); // eslint-disable-line

  const handleInput = (e) => {
    const val = e.target.value;
    setQuery(val);
    debouncedSearch(val);
  };

  const handleSuggestion = (s) => {
    setQuery(s);
    setShowSuggestions(false);
    setPage(1);
    search(s, mediaType, 1);
    inputRef.current?.blur();
  };

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    search(query, mediaType, next, true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    search(query, mediaType, 1);
    setShowSuggestions(false);
  };

  const filteredSuggestions = useMemo(() =>
    SUGGESTIONS.filter(s => s.toLowerCase().includes(query.toLowerCase()) && s.toLowerCase() !== query.toLowerCase()),
    [query]
  );

  return (
    <div className="space-y-6">
      {/* Search bar */}
      <form onSubmit={handleSubmit} className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={handleInput}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="Search space images & videos..."
              className="w-full px-4 py-3 pl-10 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>

            {/* Suggestions dropdown */}
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden z-20 shadow-xl">
                {filteredSuggestions.map(s => (
                  <button
                    key={s}
                    type="button"
                    onMouseDown={() => handleSuggestion(s)}
                    className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button type="submit" className="px-5 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-sm font-medium transition-colors">
            Search
          </button>
        </div>

        {/* Quick tags */}
        <div className="flex flex-wrap gap-2 mt-3">
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => handleSuggestion(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                query === s
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                  : 'bg-gray-800 text-gray-500 hover:text-gray-300 hover:bg-gray-700 border border-transparent'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </form>

      {/* Media type filter */}
      <div className="flex items-center gap-3">
        {['image', 'video'].map(t => (
          <button
            key={t}
            onClick={() => setMediaType(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              mediaType === t
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-transparent'
            }`}
          >
            {t === 'image' ? 'Images' : 'Videos'}
          </button>
        ))}
        {totalHits > 0 && (
          <span className="text-xs text-gray-500 ml-auto">{totalHits.toLocaleString()} results</span>
        )}
      </div>

      <ErrorWithRetry error={error} onRetry={() => search(query, mediaType, 1)} />

      {loading && results.length === 0 && <SkeletonGrid />}

      {/* Masonry-ish grid */}
      {results.length > 0 && (
        <>
          <div className="columns-2 sm:columns-3 lg:columns-4 gap-3 space-y-3">
            {results.map((item, i) => {
              const data = item.data?.[0];
              const link = item.links?.[0]?.href;
              if (!data || !link) return null;

              return (
                <button
                  key={`${data.nasa_id || i}`}
                  onClick={() => setSelectedItem(item)}
                  className="w-full break-inside-avoid group relative rounded-xl overflow-hidden border border-gray-800 hover:border-cyan-500/30 transition-all duration-300 block text-left"
                >
                  <img
                    src={link}
                    alt={data.title}
                    className="w-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="absolute bottom-0 inset-x-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <p className="text-white text-xs font-medium line-clamp-2">{data.title}</p>
                    {data.date_created && (
                      <p className="text-gray-400 text-[10px] mt-1">{new Date(data.date_created).getFullYear()}</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Load more */}
          {results.length < totalHits && (
            <div className="text-center pt-4">
              <button
                onClick={loadMore}
                disabled={loading}
                className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
              >
                {loading ? 'Loading...' : `Load More (${results.length} of ${totalHits.toLocaleString()})`}
              </button>
            </div>
          )}
        </>
      )}

      {!loading && results.length === 0 && query && (
        <p className="text-center text-gray-600 py-12">No results found for "{query}". Try a different search term.</p>
      )}

      {/* Detail modal */}
      {selectedItem && <DetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />}
    </div>
  );
};

export default NASAMediaSearch;
