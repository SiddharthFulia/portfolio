import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchEPIC, fetchEPICByDate, fetchEPICDates } from '../../api/nasa';
import { glassCard } from './utils';
import ErrorWithRetry from './ErrorWithRetry';

/* ── Skeleton ── */
const Skeleton = () => (
  <div className="animate-pulse space-y-4">
    <div className="flex gap-3 overflow-hidden">
      {[1,2,3].map(i => <div key={i} className="shrink-0 w-64 h-64 bg-gray-800 rounded-xl" />)}
    </div>
    <div className="h-40 bg-gray-800 rounded-xl" />
  </div>
);

/* ── Build EPIC image URL ── */
const buildImageUrl = (image) => {
  if (!image?.date || !image?.image) return '';
  const d = new Date(image.date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `https://epic.gsfc.nasa.gov/archive/natural/${year}/${month}/${day}/png/${image.image}.png`;
};

/* ── Earth Rotation Player ── */
const RotationPlayer = ({ images }) => {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(500);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (playing && images.length > 1) {
      intervalRef.current = setInterval(() => {
        setFrame(f => (f + 1) % images.length);
      }, speed);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing, images.length, speed]);

  if (images.length === 0) return null;

  const current = images[frame];
  const url = buildImageUrl(current);

  return (
    <div className={`${glassCard} p-5`}>
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-white font-bold text-sm">Earth Rotation Animation</h4>
        <span className="text-cyan-400 text-xs font-mono">Frame {frame + 1}/{images.length}</span>
      </div>

      {/* Image */}
      <div className="relative w-full max-w-md mx-auto aspect-square rounded-full overflow-hidden bg-gray-900 border-2 border-gray-700 shadow-[0_0_30px_rgba(59,130,246,0.15)]">
        <img
          src={url}
          alt={`Earth from DSCOVR - ${current?.date}`}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 rounded-full shadow-[inset_-30px_-20px_60px_rgba(0,0,0,0.4)]" />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3 mt-4">
        <button
          onClick={() => setFrame(f => (f - 1 + images.length) % images.length)}
          className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm transition-colors"
        >
          &larr;
        </button>
        <button
          onClick={() => setPlaying(!playing)}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
            playing
              ? 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30'
              : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 hover:bg-cyan-500/30'
          }`}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={() => setFrame(f => (f + 1) % images.length)}
          className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm transition-colors"
        >
          &rarr;
        </button>
      </div>

      {/* Speed control */}
      <div className="flex items-center justify-center gap-3 mt-3">
        <span className="text-xs text-gray-500">Speed:</span>
        {[1000, 500, 250, 100].map(s => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            className={`px-2 py-1 rounded text-xs transition-all ${
              speed === s ? 'bg-cyan-500/20 text-cyan-400' : 'bg-gray-800 text-gray-500 hover:text-gray-300'
            }`}
          >
            {s === 1000 ? '1x' : s === 500 ? '2x' : s === 250 ? '4x' : '10x'}
          </button>
        ))}
      </div>

      {/* Frame scrubber */}
      <input
        type="range"
        min="0"
        max={images.length - 1}
        value={frame}
        onChange={(e) => setFrame(parseInt(e.target.value))}
        className="w-full mt-3 accent-cyan-500"
      />
    </div>
  );
};

/* ── Main ── */
const EPICViewer = () => {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [availableDates, setAvailableDates] = useState([]);
  const [dateIdx, setDateIdx] = useState(0);
  const abortRef = useRef(null);
  const galleryRef = useRef(null);

  const fetchImages = useCallback(async (dateStr) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    const { data, error: err } = dateStr
      ? await fetchEPICByDate(dateStr, { signal: controller.signal })
      : await fetchEPIC({ signal: controller.signal });
    if (err) { setError(err); setLoading(false); return; }
    if (data && Array.isArray(data)) {
      setImages(data);
      setSelectedIdx(0);
    }
    setLoading(false);
  }, []);

  // Fetch available dates + latest images in parallel on mount
  useEffect(() => {
    const controller = new AbortController();
    const opts = { signal: controller.signal };

    // Fire both in parallel
    fetchEPICDates(opts)
      .then(({ data }) => {
        if (data && Array.isArray(data)) {
          setAvailableDates(data.slice(0, 30).map(d => d.date));
        }
      });

    fetchImages();

    return () => { controller.abort(); if (abortRef.current) abortRef.current.abort(); };
  }, [fetchImages]);

  const handleDateNav = (dir) => {
    const newIdx = dateIdx + dir;
    if (newIdx >= 0 && newIdx < availableDates.length) {
      setDateIdx(newIdx);
      fetchImages(availableDates[newIdx]);
    }
  };

  const current = images[selectedIdx];

  return (
    <div className="space-y-6">
      {/* Date navigation */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => handleDateNav(1)}
          disabled={dateIdx >= availableDates.length - 1}
          className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm transition-colors disabled:opacity-30"
        >
          &larr; Older
        </button>
        <span className="text-sm text-gray-400 font-mono">
          {current?.date ? new Date(current.date).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) : 'Latest'}
        </span>
        <button
          onClick={() => handleDateNav(-1)}
          disabled={dateIdx <= 0}
          className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm transition-colors disabled:opacity-30"
        >
          Newer &rarr;
        </button>
        <button
          onClick={() => { setDateIdx(0); fetchImages(); }}
          className="px-3 py-2 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 border border-cyan-500/30 rounded-lg text-sm transition-colors"
        >
          Latest
        </button>
        <span className="text-xs text-gray-600 ml-auto">{images.length} images</span>
      </div>

      <ErrorWithRetry error={error} onRetry={() => fetchImages()} />

      {loading && <Skeleton />}

      {!loading && !error && images.length > 0 && (
        <>
          {/* Gallery strip */}
          <div ref={galleryRef} className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
            {images.map((img, i) => {
              const url = buildImageUrl(img);
              return (
                <button
                  key={img.identifier || i}
                  onClick={() => setSelectedIdx(i)}
                  className={`shrink-0 snap-start relative rounded-xl overflow-hidden transition-all duration-300 ${
                    selectedIdx === i
                      ? 'ring-2 ring-cyan-500 scale-[1.02] shadow-lg shadow-cyan-900/20'
                      : 'opacity-60 hover:opacity-90'
                  }`}
                >
                  <img
                    src={url}
                    alt={`Earth ${img.date}`}
                    className="w-24 h-24 sm:w-32 sm:h-32 object-cover"
                    loading="lazy"
                  />
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-1">
                    <span className="text-white text-[10px] font-mono">{new Date(img.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected image large view */}
          {current && (
            <div className={`${glassCard} overflow-hidden`}>
              <div className="relative">
                <img
                  src={buildImageUrl(current)}
                  alt={`Earth from DSCOVR - ${current.date}`}
                  className="w-full max-h-[60vh] object-contain bg-black"
                  loading="lazy"
                />
              </div>
              <div className="p-5 space-y-3">
                <h3 className="text-white font-bold">DSCOVR/EPIC Earth Image</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500 text-xs block">Date & Time</span>
                    <span className="text-white font-mono text-xs">{current.date}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs block">Center Latitude</span>
                    <span className="text-cyan-400 font-mono text-xs">{current.centroid_coordinates?.lat?.toFixed(2) || '—'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs block">Center Longitude</span>
                    <span className="text-cyan-400 font-mono text-xs">{current.centroid_coordinates?.lon?.toFixed(2) || '—'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs block">Sun Position</span>
                    <span className="text-yellow-400 font-mono text-xs">
                      {current.sun_j2000_position ? `x:${(current.sun_j2000_position.x / 1e6).toFixed(1)}M` : '—'}
                    </span>
                  </div>
                </div>
                {current.caption && (
                  <p className="text-gray-400 text-sm">{current.caption}</p>
                )}
              </div>
            </div>
          )}

          {/* Rotation player */}
          <RotationPlayer images={images} />
        </>
      )}

      {!loading && !error && images.length === 0 && (
        <p className="text-center text-gray-600 py-8">No EPIC images available for this date.</p>
      )}
    </div>
  );
};

export default EPICViewer;
