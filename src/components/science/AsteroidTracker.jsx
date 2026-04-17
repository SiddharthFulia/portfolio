import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { fetchNASA, nasaUrl, formatNumber, formatDistance, glassCard, todayStr, daysAgo, ErrorWithRetry } from './utils';

/* ── Danger badge ── */
const DangerBadge = ({ hazardous }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
    hazardous
      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
      : 'bg-green-500/20 text-green-400 border border-green-500/30'
  }`}>
    <span className={`w-1.5 h-1.5 rounded-full ${hazardous ? 'bg-red-400 animate-pulse' : 'bg-green-400'}`} />
    {hazardous ? 'Hazardous' : 'Safe'}
  </span>
);

/* ── Size bar ── */
const SizeBar = ({ diameter, maxDiameter }) => {
  const pct = maxDiameter > 0 ? (diameter / maxDiameter) * 100 : 0;
  return (
    <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
      <div
        className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-700"
        style={{ width: `${Math.max(pct, 2)}%` }}
      />
    </div>
  );
};

/* ── Distance visualization ── */
const DistanceViz = ({ km, maxKm }) => {
  const pct = maxKm > 0 ? (km / maxKm) * 100 : 0;
  return (
    <div className="relative w-full h-6">
      <div className="absolute inset-0 bg-gray-800/50 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-900/50 to-purple-900/50 rounded-full transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      {/* Earth dot */}
      <div className="absolute left-1 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.8)]" />
      {/* Asteroid dot */}
      <div
        className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-orange-400 shadow-[0_0_6px_rgba(251,146,60,0.8)] transition-all duration-700"
        style={{ left: `${Math.max(pct, 3)}%` }}
      />
    </div>
  );
};

/* ── Approach animation ── */
const ApproachAnim = ({ asteroids }) => {
  const canvasRef = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width = canvas.offsetWidth * 2;
    const H = canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    const w = W / 2, h = H / 2;

    const rocks = (asteroids || []).slice(0, 12).map((a, i) => ({
      angle: (i / Math.min(asteroids.length, 12)) * Math.PI * 2,
      dist: 30 + Math.random() * 60,
      size: Math.max(2, parseFloat(a.estimated_diameter?.meters?.estimated_diameter_max || 3) / 50),
      speed: 0.002 + Math.random() * 0.005,
      hazardous: a.is_potentially_hazardous_asteroid,
    }));

    let t = 0;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;

      // Earth
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx.fillStyle = '#3b82f6';
      ctx.fill();

      // Orbit rings
      for (let r = 40; r <= 100; r += 20) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(100,116,139,0.15)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Asteroids
      rocks.forEach((r) => {
        const x = cx + Math.cos(r.angle + t * r.speed) * r.dist;
        const y = cy + Math.sin(r.angle + t * r.speed) * r.dist;
        ctx.beginPath();
        ctx.arc(x, y, Math.min(r.size, 6), 0, Math.PI * 2);
        ctx.fillStyle = r.hazardous ? '#ef4444' : '#94a3b8';
        ctx.fill();
      });

      t++;
      animRef.current = setTimeout(() => requestAnimationFrame(draw), 33);
    };

    draw();
    return () => { clearTimeout(animRef.current); cancelAnimationFrame(animRef.current); };
  }, [asteroids]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-48 rounded-xl bg-gray-900/50"
      style={{ imageRendering: 'auto' }}
    />
  );
};

/* ── Skeleton ── */
const Skeleton = () => (
  <div className="animate-pulse space-y-3">
    {[1,2,3,4].map(i => <div key={i} className="h-24 bg-gray-800 rounded-xl" />)}
  </div>
);

/* ── Main ── */
const AsteroidTracker = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('date');
  const [showHazardousOnly, setShowHazardousOnly] = useState(false);
  const abortRef = useRef(null);

  const fetchData = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    const url = nasaUrl('https://api.nasa.gov/neo/rest/v1/feed', {
      start_date: daysAgo(6),
      end_date: todayStr(),
    });

    const { data: d, error: e } = await fetchNASA(url, { signal: controller.signal });
    if (e) { setError(e); setLoading(false); return; }
    if (d) setData(d);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [fetchData]);

  const allAsteroids = useMemo(() => {
    if (!data?.near_earth_objects) return [];
    const all = Object.entries(data.near_earth_objects).flatMap(([date, objs]) =>
      objs.map(o => ({ ...o, approach_date: date }))
    );
    return all;
  }, [data]);

  const filteredSorted = useMemo(() => {
    let list = [...allAsteroids];
    if (showHazardousOnly) list = list.filter(a => a.is_potentially_hazardous_asteroid);

    list.sort((a, b) => {
      if (sortBy === 'size') {
        return (b.estimated_diameter?.meters?.estimated_diameter_max || 0) - (a.estimated_diameter?.meters?.estimated_diameter_max || 0);
      }
      if (sortBy === 'distance') {
        const da = parseFloat(a.close_approach_data?.[0]?.miss_distance?.kilometers || 0);
        const db = parseFloat(b.close_approach_data?.[0]?.miss_distance?.kilometers || 0);
        return da - db;
      }
      return new Date(a.approach_date) - new Date(b.approach_date);
    });
    return list;
  }, [allAsteroids, sortBy, showHazardousOnly]);

  const maxDiam = useMemo(() => Math.max(...allAsteroids.map(a => a.estimated_diameter?.meters?.estimated_diameter_max || 0), 1), [allAsteroids]);
  const maxDist = useMemo(() => Math.max(...allAsteroids.map(a => parseFloat(a.close_approach_data?.[0]?.miss_distance?.kilometers || 0)), 1), [allAsteroids]);
  const hazCount = useMemo(() => allAsteroids.filter(a => a.is_potentially_hazardous_asteroid).length, [allAsteroids]);

  return (
    <div className="space-y-6">
      {/* Stats */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total NEOs', value: data.element_count, color: 'text-cyan-400' },
            { label: 'Hazardous', value: hazCount, color: 'text-red-400' },
            { label: 'Safe', value: data.element_count - hazCount, color: 'text-green-400' },
            { label: 'Days Tracked', value: 7, color: 'text-purple-400' },
          ].map(s => (
            <div key={s.label} className={`${glassCard} p-3 text-center`}>
              <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Approach animation */}
      {allAsteroids.length > 0 && (
        <div className={`${glassCard} p-4`}>
          <h4 className="text-sm font-semibold text-gray-400 mb-2">Near-Earth Orbit Visualization</h4>
          <ApproachAnim asteroids={allAsteroids} />
          <p className="text-xs text-gray-600 mt-2">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-400 mr-1" /> Earth
            <span className="inline-block w-2 h-2 rounded-full bg-gray-400 ml-3 mr-1" /> Safe
            <span className="inline-block w-2 h-2 rounded-full bg-red-400 ml-3 mr-1" /> Hazardous
          </p>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-gray-500">Sort:</span>
        {['date', 'size', 'distance'].map(s => (
          <button
            key={s}
            onClick={() => setSortBy(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              sortBy === s ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        <label className="flex items-center gap-2 ml-auto cursor-pointer">
          <input
            type="checkbox"
            checked={showHazardousOnly}
            onChange={(e) => setShowHazardousOnly(e.target.checked)}
            className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-red-500 focus:ring-red-500"
          />
          <span className="text-sm text-red-400">Hazardous only</span>
        </label>
      </div>

      <ErrorWithRetry error={error} onRetry={fetchData} />

      {loading && <Skeleton />}

      {/* Asteroid list */}
      {!loading && !error && (
        <div className="space-y-3">
          {filteredSorted.slice(0, 30).map((a) => {
            const diam = a.estimated_diameter?.meters?.estimated_diameter_max || 0;
            const approach = a.close_approach_data?.[0];
            const distKm = parseFloat(approach?.miss_distance?.kilometers || 0);
            const velocity = parseFloat(approach?.relative_velocity?.kilometers_per_hour || 0);

            return (
              <div key={a.id} className={`${glassCard} p-4 hover:border-cyan-500/30 transition-all duration-300`}>
                <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                  <div>
                    <h4 className="text-white font-semibold text-sm">{a.name}</h4>
                    <p className="text-gray-500 text-xs mt-0.5">{a.approach_date} &middot; {formatNumber(Math.round(velocity))} km/h</p>
                  </div>
                  <DangerBadge hazardous={a.is_potentially_hazardous_asteroid} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Size */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-500">Diameter</span>
                      <span className="text-cyan-400 font-mono">{diam.toFixed(1)}m</span>
                    </div>
                    <SizeBar diameter={diam} maxDiameter={maxDiam} />
                  </div>

                  {/* Distance */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-500">Miss Distance</span>
                      <span className="text-purple-400 font-mono">{formatDistance(distKm)}</span>
                    </div>
                    <DistanceViz km={distKm} maxKm={maxDist} />
                  </div>
                </div>
              </div>
            );
          })}

          {filteredSorted.length === 0 && (
            <p className="text-center text-gray-600 py-8">No asteroids match the current filter.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default AsteroidTracker;
