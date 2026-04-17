import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { fetchNASA, glassCard, formatNumber, ErrorWithRetry } from './utils';

/* ── Skeleton ── */
const Skeleton = () => (
  <div className="animate-pulse space-y-4">
    <div className="h-64 bg-gray-800 rounded-xl" />
    <div className="grid grid-cols-2 gap-3">
      {[1,2,3,4].map(i => <div key={i} className="h-20 bg-gray-800 rounded-xl" />)}
    </div>
  </div>
);

/* ── World map with fireball markers ── */
const FireballMap = ({ fireballs, selectedIdx, onSelect }) => {
  const toXY = (lat, lon) => ({
    x: ((parseFloat(lon) + 180) / 360) * 800,
    y: ((90 - parseFloat(lat)) / 180) * 400,
  });

  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-gray-950 border border-gray-800">
      <svg viewBox="0 0 800 400" className="w-full h-auto">
        {/* Grid */}
        {[...Array(7)].map((_, i) => (
          <line key={`h${i}`} x1="0" y1={i * (400/6)} x2="800" y2={i * (400/6)} stroke="#1e293b" strokeWidth="0.5" />
        ))}
        {[...Array(13)].map((_, i) => (
          <line key={`v${i}`} x1={i * (800/12)} y1="0" x2={i * (800/12)} y2="400" stroke="#1e293b" strokeWidth="0.5" />
        ))}

        {/* Simplified continents */}
        <path d="M 100,80 L 130,70 160,75 180,90 200,80 220,90 240,100 230,130 220,160 200,180 180,200 160,190 140,200 120,180 110,160 100,140 90,120 95,100Z" fill="#1a1a2e" stroke="#2d2d4e" strokeWidth="0.5" />
        <path d="M 180,220 L 200,210 220,220 230,250 220,280 210,310 190,340 170,330 160,300 165,270 170,240Z" fill="#1a1a2e" stroke="#2d2d4e" strokeWidth="0.5" />
        <path d="M 370,80 L 400,70 420,80 430,90 420,110 400,120 380,110 370,100Z" fill="#1a1a2e" stroke="#2d2d4e" strokeWidth="0.5" />
        <path d="M 370,140 L 400,130 430,140 450,170 440,210 430,250 410,280 390,290 370,270 360,240 355,200 360,170Z" fill="#1a1a2e" stroke="#2d2d4e" strokeWidth="0.5" />
        <path d="M 440,60 L 500,50 560,60 620,70 660,90 680,120 660,150 620,160 580,150 540,140 500,130 460,120 440,100Z" fill="#1a1a2e" stroke="#2d2d4e" strokeWidth="0.5" />
        <path d="M 620,260 L 660,250 700,260 720,280 710,310 680,320 640,310 620,290Z" fill="#1a1a2e" stroke="#2d2d4e" strokeWidth="0.5" />

        <line x1="0" y1="200" x2="800" y2="200" stroke="#2d2d4e" strokeWidth="0.5" strokeDasharray="4,4" />

        {/* Fireball markers */}
        {fireballs.map((fb, i) => {
          if (!fb.lat || !fb.lon) return null;
          const lat = parseFloat(fb.lat) * (fb['lat-dir'] === 'S' ? -1 : 1);
          const lon = parseFloat(fb.lon) * (fb['lon-dir'] === 'W' ? -1 : 1);
          const { x, y } = toXY(lat, lon);
          const energy = parseFloat(fb.energy) || 0.1;
          const radius = Math.max(2, Math.min(12, Math.log10(energy + 1) * 4));
          const isSelected = selectedIdx === i;

          return (
            <g key={i} onClick={() => onSelect(i)} className="cursor-pointer">
              {/* Glow */}
              <circle cx={x} cy={y} r={radius * 2} fill="url(#fireballGlow)" opacity={isSelected ? 0.8 : 0.3}>
                {!isSelected && (
                  <animate attributeName="opacity" values="0.2;0.5;0.2" dur="2s" repeatCount="indefinite" />
                )}
              </circle>
              {/* Core */}
              <circle
                cx={x} cy={y} r={radius}
                fill={isSelected ? '#fbbf24' : '#f97316'}
                stroke={isSelected ? '#fbbf24' : 'none'}
                strokeWidth={isSelected ? 2 : 0}
                style={{ filter: 'drop-shadow(0 0 4px #f97316)' }}
              />
              {isSelected && (
                <circle cx={x} cy={y} r={radius + 4} fill="none" stroke="#fbbf24" strokeWidth="1" opacity="0.6">
                  <animate attributeName="r" from={radius + 2} to={radius + 10} dur="1s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.6" to="0" dur="1s" repeatCount="indefinite" />
                </circle>
              )}
            </g>
          );
        })}

        {/* Gradient for glow */}
        <defs>
          <radialGradient id="fireballGlow">
            <stop offset="0%" stopColor="#f97316" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  );
};

/* ── Energy histogram ── */
const EnergyHistogram = ({ fireballs }) => {
  const buckets = useMemo(() => {
    const ranges = [
      { label: '<0.1', min: 0, max: 0.1 },
      { label: '0.1-1', min: 0.1, max: 1 },
      { label: '1-10', min: 1, max: 10 },
      { label: '10-100', min: 10, max: 100 },
      { label: '>100', min: 100, max: Infinity },
    ];
    return ranges.map(r => ({
      ...r,
      count: fireballs.filter(fb => {
        const e = parseFloat(fb.energy) || 0;
        return e >= r.min && e < r.max;
      }).length,
    }));
  }, [fireballs]);

  const maxCount = Math.max(...buckets.map(b => b.count), 1);

  return (
    <div className={`${glassCard} p-4`}>
      <h4 className="text-sm font-semibold text-gray-400 mb-4">Energy Distribution (10^10 J)</h4>
      <div className="flex items-end gap-2 h-32">
        {buckets.map((b) => (
          <div key={b.label} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-xs text-gray-500">{b.count}</span>
            <div className="w-full relative rounded-t overflow-hidden" style={{ height: `${Math.max((b.count / maxCount) * 100, 2)}%` }}>
              <div className="absolute inset-0 bg-gradient-to-t from-orange-600 to-yellow-500 rounded-t" />
            </div>
            <span className="text-[10px] text-gray-600 mt-1">{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ── Main ── */
const FireballTracker = () => {
  const [fireballs, setFireballs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [sortBy, setSortBy] = useState('date');
  const abortRef = useRef(null);

  const fetchData = useCallback(async (start, end) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    let url = 'https://ssd-api.jpl.nasa.gov/fireball.api?req-loc=true';
    if (start) url += `&date-min=${start}`;
    if (end) url += `&date-max=${end}`;

    const { data, error: err } = await fetchNASA(url, { signal: controller.signal });
    if (err) { setError(err); setLoading(false); return; }

    if (data?.data && data?.fields) {
      const fields = data.fields;
      const parsed = data.data.map(row => {
        const obj = {};
        fields.forEach((f, i) => { obj[f] = row[i]; });
        return obj;
      });
      setFireballs(parsed);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [fetchData]);

  const handleDateFilter = (e) => {
    e.preventDefault();
    fetchData(dateRange.start, dateRange.end);
  };

  const sortedFireballs = useMemo(() => {
    const list = [...fireballs];
    if (sortBy === 'energy') list.sort((a, b) => (parseFloat(b.energy) || 0) - (parseFloat(a.energy) || 0));
    else if (sortBy === 'velocity') list.sort((a, b) => (parseFloat(b.vel) || 0) - (parseFloat(a.vel) || 0));
    else list.sort((a, b) => new Date(b.date) - new Date(a.date));
    return list;
  }, [fireballs, sortBy]);

  const mappableFireballs = useMemo(() => sortedFireballs.filter(fb => fb.lat && fb.lon), [sortedFireballs]);

  const selected = selectedIdx !== null ? sortedFireballs[selectedIdx] : null;

  const totalEnergy = useMemo(() => fireballs.reduce((s, fb) => s + (parseFloat(fb.energy) || 0), 0), [fireballs]);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Fireballs', value: fireballs.length, color: 'text-orange-400' },
          { label: 'With Location', value: mappableFireballs.length, color: 'text-cyan-400' },
          { label: 'Total Energy', value: totalEnergy.toFixed(1), color: 'text-yellow-400' },
          { label: 'Avg Velocity', value: (fireballs.reduce((s, fb) => s + (parseFloat(fb.vel) || 0), 0) / (fireballs.length || 1)).toFixed(1) + ' km/s', color: 'text-purple-400' },
        ].map(s => (
          <div key={s.label} className={`${glassCard} p-3 text-center`}>
            <div className={`text-xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-500">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Date filter */}
      <form onSubmit={handleDateFilter} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-gray-500 block mb-1">From</label>
          <input
            type="date"
            value={dateRange.start}
            onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">To</label>
          <input
            type="date"
            value={dateRange.end}
            onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
          />
        </div>
        <button type="submit" className="px-4 py-2 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 border border-cyan-500/30 rounded-lg text-sm transition-colors">
          Filter
        </button>
        <button
          type="button"
          onClick={() => { setDateRange({ start: '', end: '' }); fetchData(); }}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg text-sm transition-colors"
        >
          Reset
        </button>

        {/* Sort */}
        <div className="flex gap-1.5 ml-auto">
          <span className="text-xs text-gray-500 self-center mr-1">Sort:</span>
          {['date', 'energy', 'velocity'].map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setSortBy(s)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                sortBy === s ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40' : 'bg-gray-800 text-gray-500 hover:text-gray-300'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </form>

      <ErrorWithRetry error={error} onRetry={() => fetchData()} />

      {loading && <Skeleton />}

      {!loading && !error && (
        <>
          {/* Map */}
          <FireballMap fireballs={mappableFireballs} selectedIdx={selectedIdx} onSelect={setSelectedIdx} />

          {/* Energy histogram */}
          <EnergyHistogram fireballs={fireballs} />

          {/* Selected detail */}
          {selected && (
            <div className={`${glassCard} p-4 border-orange-500/30`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-white font-bold text-sm">Fireball Event</h4>
                  <p className="text-gray-400 text-xs mt-1">{selected.date}</p>
                </div>
                <button onClick={() => setSelectedIdx(null)} className="text-gray-500 hover:text-white text-lg">&times;</button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-sm">
                <div>
                  <span className="text-gray-500 text-xs block">Energy</span>
                  <span className="text-orange-400 font-mono">{selected.energy || '—'} &times;10^10 J</span>
                </div>
                <div>
                  <span className="text-gray-500 text-xs block">Velocity</span>
                  <span className="text-cyan-400 font-mono">{selected.vel || '—'} km/s</span>
                </div>
                <div>
                  <span className="text-gray-500 text-xs block">Altitude</span>
                  <span className="text-purple-400 font-mono">{selected.alt || '—'} km</span>
                </div>
                <div>
                  <span className="text-gray-500 text-xs block">Location</span>
                  <span className="text-yellow-400 font-mono text-xs">
                    {selected.lat}{selected['lat-dir']} {selected.lon}{selected['lon-dir']}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Fireball list */}
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
            {sortedFireballs.slice(0, 50).map((fb, i) => (
              <button
                key={i}
                onClick={() => setSelectedIdx(i)}
                className={`w-full text-left p-3 rounded-xl border transition-all duration-200 ${
                  selectedIdx === i
                    ? 'bg-gray-800/80 border-orange-500/40'
                    : 'bg-gray-900/40 border-gray-800 hover:border-gray-700 hover:bg-gray-800/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-orange-400 shadow-[0_0_4px_#f97316]" />
                    <span className="text-white text-sm">{fb.date}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    {fb.energy && <span className="text-orange-400 font-mono">{parseFloat(fb.energy).toFixed(2)} E</span>}
                    {fb.vel && <span className="text-cyan-400 font-mono">{parseFloat(fb.vel).toFixed(1)} km/s</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default FireballTracker;
