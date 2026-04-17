import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchNASA, nasaUrl, glassCard, glassCardHover, todayStr, ErrorWithRetry } from './utils';

/* ── Loading Skeleton ── */
const Skeleton = () => (
  <div className="animate-pulse space-y-4">
    <div className="w-full aspect-video bg-gray-800 rounded-xl" />
    <div className="h-6 bg-gray-800 rounded w-3/4" />
    <div className="h-4 bg-gray-800 rounded w-full" />
    <div className="h-4 bg-gray-800 rounded w-5/6" />
  </div>
);

/* ── Fullscreen Modal ── */
const ImageModal = ({ src, title, onClose }) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    setZoom(z => Math.max(0.5, Math.min(5, z + (e.deltaY > 0 ? -0.2 : 0.2))));
  }, []);

  const handleMouseDown = (e) => {
    dragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e) => {
    if (!dragging.current) return;
    setPan(p => ({
      x: p.x + (e.clientX - lastPos.current.x),
      y: p.y + (e.clientY - lastPos.current.y),
    }));
    lastPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => { dragging.current = false; };

  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
      onClick={onClose}
      onWheel={handleWheel}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-50 w-10 h-10 rounded-full bg-gray-800/80 text-white hover:bg-gray-700 flex items-center justify-center text-xl font-bold transition-colors"
      >
        &times;
      </button>

      {/* Zoom controls */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-gray-900 rounded-full px-4 py-2">
        <button onClick={(e) => { e.stopPropagation(); setZoom(z => Math.max(0.5, z - 0.3)); }} className="text-white hover:text-cyan-400 text-lg font-bold">-</button>
        <span className="text-gray-400 text-sm min-w-[3rem] text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={(e) => { e.stopPropagation(); setZoom(z => Math.min(5, z + 0.3)); }} className="text-white hover:text-cyan-400 text-lg font-bold">+</button>
        <button onClick={(e) => { e.stopPropagation(); setZoom(1); setPan({ x: 0, y: 0 }); }} className="text-gray-400 hover:text-white text-xs ml-2">Reset</button>
      </div>

      <div
        className="max-w-[90vw] max-h-[90vh] cursor-grab active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <img
          src={src}
          alt={title}
          className="max-w-full max-h-[85vh] object-contain rounded-lg select-none"
          style={{ transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)` }}
          draggable={false}
        />
      </div>

      <p className="absolute top-4 left-4 text-white/80 text-sm font-medium max-w-xs truncate">{title}</p>
    </div>
  );
};

/* ── Main Component ── */
const APODViewer = () => {
  const [date, setDate] = useState(todayStr());
  const [apod, setApod] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const abortRef = useRef(null);

  const fetchAPOD = useCallback(async (selectedDate) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    const url = nasaUrl('https://api.nasa.gov/planetary/apod', { date: selectedDate });
    const { data, error: err } = await fetchNASA(url, { signal: controller.signal });

    if (err) {
      setError(err);
      setLoading(false);
      return;
    }
    if (data) {
      setApod(data);
      setExpanded(false);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAPOD(date);
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [date, fetchAPOD]);

  const goRandom = () => {
    const start = new Date(1995, 5, 16).getTime();
    const end = new Date().getTime();
    const random = new Date(start + Math.random() * (end - start));
    setDate(random.toISOString().slice(0, 10));
  };

  const goYesterday = () => {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    if (d >= new Date(1995, 5, 16)) setDate(d.toISOString().slice(0, 10));
  };

  const goTomorrow = () => {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    if (d <= new Date()) setDate(d.toISOString().slice(0, 10));
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={goYesterday} className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm transition-colors">&larr; Prev</button>
        <input
          type="date"
          value={date}
          min="1995-06-16"
          max={todayStr()}
          onChange={(e) => setDate(e.target.value)}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500 transition-colors"
        />
        <button onClick={goTomorrow} className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm transition-colors">Next &rarr;</button>
        <button onClick={() => setDate(todayStr())} className="px-3 py-2 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 border border-cyan-500/30 rounded-lg text-sm transition-colors">Today</button>
        <button onClick={goRandom} className="px-3 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 border border-purple-500/30 rounded-lg text-sm transition-colors">Random</button>
      </div>

      {/* Error */}
      <ErrorWithRetry error={error} onRetry={() => fetchAPOD(date)} />

      {/* Loading */}
      {loading && <Skeleton />}

      {/* Content */}
      {!loading && !error && apod && (
        <div className={`${glassCard} ${glassCardHover} overflow-hidden`}>
          {/* Media */}
          {apod.media_type === 'image' ? (
            <div className="relative group cursor-pointer" onClick={() => setShowModal(true)}>
              <img
                src={apod.hdurl || apod.url}
                alt={apod.title}
                className="w-full max-h-[70vh] object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 rounded-lg px-3 py-1.5 text-sm text-white flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg>
                Click to zoom
              </div>
            </div>
          ) : (
            <div className="aspect-video">
              <iframe
                src={apod.url}
                title={apod.title}
                className="w-full h-full"
                allow="autoplay; encrypted-media"
                allowFullScreen
              />
            </div>
          )}

          {/* Info */}
          <div className="p-6 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-xl font-bold text-white">{apod.title}</h3>
              <span className="shrink-0 px-3 py-1 bg-cyan-500/10 text-cyan-400 text-xs font-mono rounded-full border border-cyan-500/20">
                {apod.date}
              </span>
            </div>

            {apod.copyright && (
              <p className="text-gray-500 text-xs">Credit: {apod.copyright}</p>
            )}

            <p className={`text-gray-300 text-sm leading-relaxed ${!expanded ? 'line-clamp-4' : ''}`}>
              {apod.explanation}
            </p>

            {apod.explanation && apod.explanation.length > 300 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-cyan-400 hover:text-cyan-300 text-sm transition-colors"
              >
                {expanded ? 'Show less' : 'Read more...'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && apod && apod.media_type === 'image' && (
        <ImageModal
          src={apod.hdurl || apod.url}
          title={apod.title}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
};

export default APODViewer;
