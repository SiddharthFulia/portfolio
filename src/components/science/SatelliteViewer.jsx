import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { fetchNASA, glassCard, debounce, ErrorWithRetry, corsProxy } from './utils';

/* ── Skeleton ── */
const Skeleton = () => (
  <div className="animate-pulse space-y-4">
    <div className="grid grid-cols-2 gap-3">
      {[1,2].map(i => <div key={i} className="h-32 bg-gray-800 rounded-xl" />)}
    </div>
    <div className="h-64 bg-gray-800 rounded-xl" />
  </div>
);

/* ── Mini Globe (Canvas) showing ISS position ── */
const MiniGlobe = ({ lat, lon }) => {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const rotRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = 240;
    canvas.width = size * 2;
    canvas.height = size * 2;
    ctx.scale(2, 2);
    const cx = size / 2, cy = size / 2, r = 80;

    const draw = () => {
      ctx.clearRect(0, 0, size, size);

      // Globe background
      const grad = ctx.createRadialGradient(cx - 15, cy - 15, 10, cx, cy, r);
      grad.addColorStop(0, '#1e40af');
      grad.addColorStop(0.7, '#1e3a5f');
      grad.addColorStop(1, '#0f172a');
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Glow
      ctx.shadowColor = '#3b82f6';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = '#3b82f640';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Grid lines (latitude)
      for (let i = -60; i <= 60; i += 30) {
        const latRad = (i * Math.PI) / 180;
        const py = cy - Math.sin(latRad) * r;
        const rx = Math.cos(latRad) * r;
        if (rx > 0) {
          ctx.beginPath();
          ctx.ellipse(cx, py, rx, rx * 0.15, 0, 0, Math.PI * 2);
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }

      // Grid lines (longitude) - rotating
      for (let i = 0; i < 6; i++) {
        const angle = (i * 30 + rotRef.current) * Math.PI / 180;
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.abs(Math.cos(angle)) * r, r, 0, 0, Math.PI * 2);
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // ISS position marker
      if (lat !== undefined && lon !== undefined) {
        const latRad = (parseFloat(lat) * Math.PI) / 180;
        const lonRad = ((parseFloat(lon) + rotRef.current) * Math.PI) / 180;

        const px = cx + Math.cos(latRad) * Math.sin(lonRad) * r;
        const py = cy - Math.sin(latRad) * r;
        const behind = Math.cos(latRad) * Math.cos(lonRad) < 0;

        if (!behind) {
          // Pulse
          ctx.beginPath();
          ctx.arc(px, py, 8, 0, Math.PI * 2);
          ctx.fillStyle = '#22d3ee30';
          ctx.fill();

          // Dot
          ctx.beginPath();
          ctx.arc(px, py, 4, 0, Math.PI * 2);
          ctx.fillStyle = '#22d3ee';
          ctx.fill();

          // Label
          ctx.fillStyle = '#22d3ee';
          ctx.font = '9px monospace';
          ctx.fillText('ISS', px + 8, py + 3);
        }
      }

      rotRef.current += 0.2;
      animRef.current = setTimeout(() => requestAnimationFrame(draw), 33);
    };

    draw();
    return () => { clearTimeout(animRef.current); cancelAnimationFrame(animRef.current); };
  }, [lat, lon]);

  return (
    <canvas ref={canvasRef} className="w-60 h-60 mx-auto" style={{ imageRendering: 'auto' }} />
  );
};

/* ── People in Space card ── */
const PeopleInSpace = ({ people }) => (
  <div className={`${glassCard} p-4`}>
    <h4 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
      People in Space Right Now
    </h4>
    {people.length === 0 ? (
      <p className="text-gray-500 text-sm">Loading...</p>
    ) : (
      <div className="space-y-2">
        {people.map((p, i) => (
          <div key={i} className="flex items-center justify-between gap-2 py-1.5 border-b border-gray-800 last:border-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center text-white text-xs font-bold">
                {p.name?.charAt(0) || '?'}
              </div>
              <span className="text-white text-sm">{p.name}</span>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
              {p.craft}
            </span>
          </div>
        ))}
      </div>
    )}
  </div>
);

/* ── Main ── */
const SatelliteViewer = () => {
  const [issPos, setIssPos] = useState(null);
  const [people, setPeople] = useState([]);
  const [satellites, setSatellites] = useState([]);
  const [searchQuery, setSearchQuery] = useState('ISS');
  const [loading, setLoading] = useState(true);
  const [satLoading, setSatLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedSat, setSelectedSat] = useState(null);
  const abortRef = useRef(null);
  const issIntervalRef = useRef(null);

  // Fetch ISS position (polls)
  const fetchISS = useCallback(async () => {
    try {
      const res = await fetch(corsProxy('http://api.open-notify.org/iss-now.json'));
      const data = await res.json();
      if (data?.iss_position) {
        setIssPos(data.iss_position);
      }
    } catch {
      // Silently fail for ISS position
    }
  }, []);

  // Fetch people in space
  const fetchPeople = useCallback(async () => {
    try {
      const res = await fetch(corsProxy('http://api.open-notify.org/astros.json'));
      const data = await res.json();
      if (data?.people) setPeople(data.people);
    } catch {
      // Silently fail
    }
  }, []);

  // Search satellites via TLE API
  const searchSatellites = useCallback(async (query) => {
    if (!query.trim()) return;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSatLoading(true);

    const { data, error: err } = await fetchNASA(
      `https://tle.ivanstanojevic.me/api/tle/?search=${encodeURIComponent(query)}&page_size=20`,
      { signal: controller.signal }
    );

    if (err) {
      setError(err);
      setSatLoading(false);
      return;
    }
    if (data?.member) setSatellites(data.member);
    setSatLoading(false);
  }, []);

  const debouncedSearch = useMemo(() => debounce(searchSatellites, 500), [searchSatellites]);

  useEffect(() => {
    fetchISS();
    fetchPeople();
    searchSatellites('ISS');
    setLoading(false);

    issIntervalRef.current = setInterval(fetchISS, 5000);
    return () => {
      clearInterval(issIntervalRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchISS, fetchPeople, searchSatellites]);

  const handleSearchInput = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    debouncedSearch(val);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    searchSatellites(searchQuery);
  };

  return (
    <div className="space-y-6">
      {loading && <Skeleton />}

      {!loading && (
        <>
          {/* ISS Tracker + People */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ISS Globe */}
            <div className={`${glassCard} p-5`}>
              <h3 className="text-white font-bold text-sm mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                ISS Live Tracker
              </h3>
              <MiniGlobe lat={issPos?.latitude} lon={issPos?.longitude} />
              {issPos && (
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div className={`${glassCard} p-3 text-center`}>
                    <div className="text-cyan-400 font-mono text-lg">{parseFloat(issPos.latitude).toFixed(4)}</div>
                    <div className="text-xs text-gray-500">Latitude</div>
                  </div>
                  <div className={`${glassCard} p-3 text-center`}>
                    <div className="text-purple-400 font-mono text-lg">{parseFloat(issPos.longitude).toFixed(4)}</div>
                    <div className="text-xs text-gray-500">Longitude</div>
                  </div>
                </div>
              )}
              <p className="text-gray-600 text-xs mt-2 text-center">Updates every 5 seconds</p>
            </div>

            {/* People in space */}
            <div className="space-y-4">
              <PeopleInSpace people={people} />
              <div className={`${glassCard} p-4 text-center`}>
                <div className="text-4xl font-black text-cyan-400">{people.length}</div>
                <div className="text-xs text-gray-500 mt-1">Humans currently in space</div>
                <div className="flex flex-wrap justify-center gap-2 mt-3">
                  {[...new Set(people.map(p => p.craft))].map(craft => (
                    <span key={craft} className="px-2 py-1 bg-gray-800 text-gray-400 text-xs rounded-full">
                      {craft}: {people.filter(p => p.craft === craft).length}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Satellite search */}
          <div className={`${glassCard} p-5`}>
            <h3 className="text-white font-bold text-sm mb-4">Satellite Search (TLE Data)</h3>

            <form onSubmit={handleSearchSubmit} className="flex gap-2 mb-4">
              <input
                type="text"
                value={searchQuery}
                onChange={handleSearchInput}
                placeholder="Search satellites (e.g., ISS, NOAA, Hubble)..."
                className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
              />
              <button type="submit" className="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-sm font-medium transition-colors">
                Search
              </button>
            </form>

            {/* Quick search */}
            <div className="flex flex-wrap gap-2 mb-4">
              {['ISS', 'NOAA', 'Hubble', 'Starlink', 'GPS', 'GOES'].map(s => (
                <button
                  key={s}
                  onClick={() => { setSearchQuery(s); searchSatellites(s); }}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                    searchQuery === s
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                      : 'bg-gray-800 text-gray-500 hover:text-gray-300 border border-transparent'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            {satLoading && (
              <div className="flex items-center gap-2 py-4 justify-center">
                <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-gray-500 text-sm">Searching...</span>
              </div>
            )}

            <ErrorWithRetry error={error} onRetry={() => searchSatellites(searchQuery)} />

            {/* Satellite list */}
            {!satLoading && satellites.length > 0 && (
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {satellites.map((sat) => (
                  <button
                    key={sat.satelliteId}
                    onClick={() => setSelectedSat(selectedSat?.satelliteId === sat.satelliteId ? null : sat)}
                    className={`w-full text-left p-3 rounded-xl border transition-all duration-200 ${
                      selectedSat?.satelliteId === sat.satelliteId
                        ? 'bg-gray-800/80 border-cyan-500/40'
                        : 'bg-gray-900/40 border-gray-800 hover:border-gray-700 hover:bg-gray-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="text-white text-sm font-medium">{sat.name}</span>
                        <span className="text-gray-600 text-xs ml-2">ID: {sat.satelliteId}</span>
                      </div>
                      <svg className={`w-4 h-4 text-gray-500 transition-transform ${selectedSat?.satelliteId === sat.satelliteId ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>

                    {/* Expanded detail */}
                    {selectedSat?.satelliteId === sat.satelliteId && (
                      <div className="mt-3 pt-3 border-t border-gray-800 space-y-2">
                        <div>
                          <span className="text-gray-500 text-xs block">TLE Line 1</span>
                          <code className="text-cyan-400 text-xs font-mono break-all">{sat.line1}</code>
                        </div>
                        <div>
                          <span className="text-gray-500 text-xs block">TLE Line 2</span>
                          <code className="text-cyan-400 text-xs font-mono break-all">{sat.line2}</code>
                        </div>
                        {sat.line2 && (() => {
                          // Parse basic orbital elements from TLE line 2
                          const parts = sat.line2.trim().split(/\s+/);
                          const inclination = parts[2];
                          const eccentricity = '0.' + parts[4];
                          const meanMotion = parts[7]?.slice(0, -1);
                          return (
                            <div className="grid grid-cols-3 gap-2 mt-2">
                              <div className={`${glassCard} p-2 text-center`}>
                                <div className="text-cyan-400 font-mono text-sm">{inclination || '—'}</div>
                                <div className="text-[10px] text-gray-500">Inclination</div>
                              </div>
                              <div className={`${glassCard} p-2 text-center`}>
                                <div className="text-purple-400 font-mono text-sm">{eccentricity || '—'}</div>
                                <div className="text-[10px] text-gray-500">Eccentricity</div>
                              </div>
                              <div className={`${glassCard} p-2 text-center`}>
                                <div className="text-orange-400 font-mono text-sm">{meanMotion || '—'}</div>
                                <div className="text-[10px] text-gray-500">Mean Motion</div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}

            {!satLoading && satellites.length === 0 && searchQuery && (
              <p className="text-center text-gray-600 py-6">No satellites found for "{searchQuery}".</p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default SatelliteViewer;
