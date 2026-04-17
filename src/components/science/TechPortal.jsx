import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { fetchNASA, NASA_API_KEY, glassCard, debounce, ErrorWithRetry, corsProxy } from './utils';

/* ── Skeleton ── */
const Skeleton = () => (
  <div className="animate-pulse space-y-3">
    {[1,2,3,4,5].map(i => <div key={i} className="h-28 bg-gray-800 rounded-xl" />)}
  </div>
);

/* ── Detail Modal ── */
const DetailModal = ({ patent, onClose }) => {
  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Patent array items: [id, patent_number, category, title, description, ...]
  const title = patent[2] || 'Space Technology';
  const desc = patent[3] || '';
  const detail = patent[4] || '';

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className={`${glassCard} max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <h3 className="text-white font-bold text-lg">{title}</h3>
          <button onClick={onClose} className="shrink-0 w-8 h-8 rounded-full bg-gray-800 text-white hover:bg-gray-700 flex items-center justify-center text-lg">&times;</button>
        </div>

        {desc && <p className="text-gray-300 text-sm leading-relaxed mb-3">{desc}</p>}
        {detail && detail !== desc && <p className="text-gray-400 text-sm leading-relaxed mb-4">{detail}</p>}

        {patent[5] && (
          <a
            href={patent[5]}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 rounded-lg text-sm hover:bg-cyan-600/30 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            View Original Source
          </a>
        )}

        {patent[10] && (
          <div className="mt-4">
            <img
              src={patent[10]}
              alt={title}
              className="w-full max-h-64 object-contain rounded-lg bg-gray-900"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

/* ── Main ── */
const TechPortal = () => {
  const [patents, setPatents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [selectedPatent, setSelectedPatent] = useState(null);
  const [page, setPage] = useState(1);
  const abortRef = useRef(null);

  const fetchPatents = useCallback(async (q = '') => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    const searchTerm = q.trim() || 'engine';
    const rawUrl = `https://api.nasa.gov/techtransfer/patent/?${encodeURIComponent(searchTerm)}&api_key=${NASA_API_KEY}`;
    const { data, error: err } = await fetchNASA(corsProxy(rawUrl), { signal: controller.signal });

    if (err) { setError(err); setLoading(false); return; }
    if (data?.results) {
      setPatents(data.results);
    }
    setLoading(false);
  }, []);

  const debouncedFetch = useMemo(() => debounce((q) => {
    setPage(1);
    fetchPatents(q);
  }, 500), [fetchPatents]);

  useEffect(() => {
    fetchPatents('');
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [fetchPatents]);

  const handleInput = (e) => {
    const val = e.target.value;
    setQuery(val);
    debouncedFetch(val);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchPatents(query);
  };

  const PER_PAGE = 10;
  const paginatedPatents = useMemo(() => {
    const start = (page - 1) * PER_PAGE;
    return patents.slice(start, start + PER_PAGE);
  }, [patents, page]);

  const totalPages = Math.ceil(patents.length / PER_PAGE);

  // Try to extract categories from data
  const categories = useMemo(() => {
    const cats = {};
    patents.forEach(p => {
      const cat = p[1] || 'Other';
      cats[cat] = (cats[cat] || 0) + 1;
    });
    return cats;
  }, [patents]);

  return (
    <div className="space-y-6">
      {/* Search */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={handleInput}
            placeholder="Search patents & technologies..."
            className="w-full px-4 py-3 pl-10 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <button type="submit" className="px-5 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-sm font-medium transition-colors">
          Search
        </button>
      </form>

      {/* Quick search buttons */}
      <div className="flex flex-wrap gap-2">
        {['engine', 'solar', 'propulsion', 'material', 'sensor', 'robot', 'thermal', 'optical'].map(s => (
          <button
            key={s}
            onClick={() => { setQuery(s); fetchPatents(s); }}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
              query === s
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                : 'bg-gray-800 text-gray-500 hover:text-gray-300 border border-transparent'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Stats */}
      {patents.length > 0 && (
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-500">{patents.length} results</span>
          <span className="text-gray-700">|</span>
          <span className="text-gray-500">Page {page} of {totalPages}</span>
        </div>
      )}

      <ErrorWithRetry error={error} onRetry={() => fetchPatents(query)} />

      {loading && <Skeleton />}

      {/* Patent list */}
      {!loading && !error && (
        <div className="space-y-3">
          {paginatedPatents.map((patent, i) => {
            const title = patent[2] || 'Space Technology';
            const desc = patent[3] || '';
            const link = patent[5] || '';
            const category = patent[1] || '';

            return (
              <button
                key={`${patent[0] || i}-${i}`}
                onClick={() => setSelectedPatent(patent)}
                className={`w-full text-left ${glassCard} p-4 hover:border-cyan-500/30 transition-all duration-300`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-white font-semibold text-sm line-clamp-1">{title}</h4>
                    <p className="text-gray-400 text-xs mt-1 line-clamp-2">{desc}</p>
                    <div className="flex items-center gap-2 mt-2">
                      {category && (
                        <span className="px-2 py-0.5 bg-purple-500/10 text-purple-400 text-xs rounded-full border border-purple-500/20">
                          {category}
                        </span>
                      )}
                      {link && (
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-cyan-500 text-xs hover:underline"
                        >
                          Source
                        </a>
                      )}
                    </div>
                  </div>
                  <svg className="w-5 h-5 text-gray-600 shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            );
          })}

          {patents.length === 0 && (
            <p className="text-center text-gray-600 py-12">No patents found. Try a different search term.</p>
          )}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm transition-colors disabled:opacity-30"
          >
            &larr; Prev
          </button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            let pageNum;
            if (totalPages <= 7) pageNum = i + 1;
            else if (page <= 4) pageNum = i + 1;
            else if (page >= totalPages - 3) pageNum = totalPages - 6 + i;
            else pageNum = page - 3 + i;
            return (
              <button
                key={pageNum}
                onClick={() => setPage(pageNum)}
                className={`w-9 h-9 rounded-lg text-sm font-medium transition-all ${
                  page === pageNum
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {pageNum}
              </button>
            );
          })}
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm transition-colors disabled:opacity-30"
          >
            Next &rarr;
          </button>
        </div>
      )}

      {/* Detail modal */}
      {selectedPatent && <DetailModal patent={selectedPatent} onClose={() => setSelectedPatent(null)} />}
    </div>
  );
};

export default TechPortal;
