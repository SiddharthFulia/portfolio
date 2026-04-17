import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { fetchNASA, nasaUrl, glassCard, daysAgo, todayStr, ErrorWithRetry } from './utils';

/* ── Severity color mapping ── */
const severityColor = (level) => {
  if (!level) return { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30', bar: 'bg-gray-500' };
  const l = String(level).toUpperCase();
  if (l.includes('X') || l.includes('G5') || l.includes('G4')) return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', bar: 'bg-red-500' };
  if (l.includes('M') || l.includes('G3') || l.includes('G2')) return { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', bar: 'bg-orange-500' };
  if (l.includes('C') || l.includes('G1')) return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', bar: 'bg-yellow-500' };
  return { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', bar: 'bg-green-500' };
};

/* ── Activity Gauge ── */
const ActivityGauge = ({ value, max, label, color }) => {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const angle = (pct / 100) * 180;
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-32 h-16 overflow-hidden">
        {/* Background arc */}
        <svg viewBox="0 0 120 60" className="w-full h-full">
          <path d="M 10 55 A 50 50 0 0 1 110 55" fill="none" stroke="#1f2937" strokeWidth="8" strokeLinecap="round" />
          <path
            d="M 10 55 A 50 50 0 0 1 110 55"
            fill="none"
            stroke={color || '#22d3ee'}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${(angle / 180) * 157} 157`}
            className="transition-all duration-1000"
            style={{ filter: `drop-shadow(0 0 4px ${color || '#22d3ee'})` }}
          />
        </svg>
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
          <span className="text-xl font-black text-white">{value}</span>
        </div>
      </div>
      <span className="text-xs text-gray-500 mt-1">{label}</span>
    </div>
  );
};

/* ── Timeline event ── */
const TimelineEvent = ({ event, type }) => {
  const dateStr = event.beginTime || event.startTime || event.activityID?.slice(0, 19) || '';
  const date = dateStr ? new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '?';
  const time = dateStr ? new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';

  let severity = '';
  let description = '';

  if (type === 'flare') {
    severity = event.classType || '';
    description = `Solar Flare ${severity} — Source: ${event.sourceLocation || 'Unknown'}`;
  } else if (type === 'storm') {
    severity = event.allKpIndex?.[0]?.kpIndex ? `G${Math.min(5, Math.max(1, Math.round(event.allKpIndex[0].kpIndex - 4)))}` : '';
    description = `Geomagnetic Storm — Kp Index: ${event.allKpIndex?.[0]?.kpIndex || '?'}`;
  } else {
    severity = event.type || '';
    description = `CME — Speed: ${event.cmeAnalyses?.[0]?.speed || '?'} km/s`;
  }

  const sc = severityColor(severity);

  return (
    <div className="flex gap-3 group">
      {/* Timeline dot */}
      <div className="flex flex-col items-center pt-1">
        <div className={`w-3 h-3 rounded-full ${sc.bar} ring-2 ring-gray-900 shadow-[0_0_6px] group-hover:scale-125 transition-transform`}
          style={{ boxShadow: `0 0 8px ${sc.bar === 'bg-red-500' ? '#ef4444' : sc.bar === 'bg-orange-500' ? '#f97316' : '#22d3ee'}` }}
        />
        <div className="w-px flex-1 bg-gray-800 mt-1" />
      </div>

      {/* Content */}
      <div className={`flex-1 ${glassCard} p-3 mb-3 hover:border-cyan-500/20 transition-all`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-white text-sm font-medium">{description}</p>
            <p className="text-gray-500 text-xs mt-1">{date} {time}</p>
          </div>
          {severity && (
            <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-bold ${sc.bg} ${sc.text} border ${sc.border}`}>
              {severity}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

/* ── Skeleton ── */
const Skeleton = () => (
  <div className="animate-pulse space-y-4">
    <div className="grid grid-cols-3 gap-3">
      {[1,2,3].map(i => <div key={i} className="h-32 bg-gray-800 rounded-xl" />)}
    </div>
    <div className="h-64 bg-gray-800 rounded-xl" />
  </div>
);

/* ── Main ── */
const SpaceWeather = () => {
  const [flares, setFlares] = useState([]);
  const [storms, setStorms] = useState([]);
  const [cmes, setCmes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const abortRef = useRef(null);

  const fetchAll = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    const startDate = daysAgo(30);
    const endDate = todayStr();
    const opts = { signal: controller.signal };

    const [flrRes, gstRes, cmeRes] = await Promise.all([
      fetchNASA(nasaUrl('https://api.nasa.gov/DONKI/FLR', { startDate, endDate }), opts),
      fetchNASA(nasaUrl('https://api.nasa.gov/DONKI/GST', { startDate, endDate }), opts),
      fetchNASA(nasaUrl('https://api.nasa.gov/DONKI/CME', { startDate, endDate }), opts),
    ]);

    const err = flrRes.error || gstRes.error || cmeRes.error;
    if (err) { setError(err); setLoading(false); return; }

    setFlares(Array.isArray(flrRes.data) ? flrRes.data : []);
    setStorms(Array.isArray(gstRes.data) ? gstRes.data : []);
    setCmes(Array.isArray(cmeRes.data) ? cmeRes.data : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [fetchAll]);

  const allEvents = useMemo(() => {
    const events = [
      ...flares.map(e => ({ ...e, _type: 'flare', _date: e.beginTime || '' })),
      ...storms.map(e => ({ ...e, _type: 'storm', _date: e.startTime || '' })),
      ...cmes.map(e => ({ ...e, _type: 'cme', _date: e.activityID?.slice(0, 19) || '' })),
    ];
    events.sort((a, b) => new Date(b._date) - new Date(a._date));
    return events;
  }, [flares, storms, cmes]);

  const filteredEvents = useMemo(() => {
    if (activeTab === 'all') return allEvents;
    return allEvents.filter(e => e._type === activeTab);
  }, [allEvents, activeTab]);

  const severeFlares = useMemo(() => flares.filter(f => {
    const c = (f.classType || '').toUpperCase();
    return c.startsWith('M') || c.startsWith('X');
  }).length, [flares]);

  return (
    <div className="space-y-6">
      <ErrorWithRetry error={error} onRetry={fetchAll} />

      {loading && <Skeleton />}

      {!loading && !error && (
        <>
          {/* Dashboard cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className={`${glassCard} p-5 text-center hover:border-orange-500/30 transition-all`}>
              <div className="flex items-center justify-center gap-2 mb-3">
                <svg className="w-5 h-5 text-orange-400" fill="currentColor" viewBox="0 0 20 20">
                  <circle cx="10" cy="10" r="5" />
                  <path d="M10 1v3M10 16v3M1 10h3M16 10h3M3.5 3.5l2 2M14.5 14.5l2 2M3.5 16.5l2-2M14.5 5.5l2-2" stroke="currentColor" strokeWidth="1.5" fill="none" />
                </svg>
                <h3 className="text-white font-bold text-sm">Solar Flares</h3>
              </div>
              <div className="text-3xl font-black text-orange-400">{flares.length}</div>
              <p className="text-xs text-gray-500 mt-1">Last 30 days</p>
              <p className="text-xs text-orange-400/70 mt-1">{severeFlares} severe (M/X class)</p>
              <ActivityGauge value={flares.length} max={50} label="Activity" color="#f97316" />
            </div>

            <div className={`${glassCard} p-5 text-center hover:border-purple-500/30 transition-all`}>
              <div className="flex items-center justify-center gap-2 mb-3">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <h3 className="text-white font-bold text-sm">Geomagnetic Storms</h3>
              </div>
              <div className="text-3xl font-black text-purple-400">{storms.length}</div>
              <p className="text-xs text-gray-500 mt-1">Last 30 days</p>
              <ActivityGauge value={storms.length} max={15} label="Activity" color="#a855f7" />
            </div>

            <div className={`${glassCard} p-5 text-center hover:border-cyan-500/30 transition-all`}>
              <div className="flex items-center justify-center gap-2 mb-3">
                <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="3" strokeWidth={2} />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" />
                </svg>
                <h3 className="text-white font-bold text-sm">CMEs</h3>
              </div>
              <div className="text-3xl font-black text-cyan-400">{cmes.length}</div>
              <p className="text-xs text-gray-500 mt-1">Last 30 days</p>
              <ActivityGauge value={cmes.length} max={40} label="Activity" color="#22d3ee" />
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'all', label: 'All Events', count: allEvents.length },
              { id: 'flare', label: 'Flares', count: flares.length },
              { id: 'storm', label: 'Storms', count: storms.length },
              { id: 'cme', label: 'CMEs', count: cmes.length },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-transparent'
                }`}
              >
                {tab.label}
                <span className="ml-2 text-xs opacity-60">{tab.count}</span>
              </button>
            ))}
          </div>

          {/* Timeline */}
          <div className={`${glassCard} p-5`}>
            <h3 className="text-white font-bold text-sm mb-4">Event Timeline (Last 30 Days)</h3>
            <div className="max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
              {filteredEvents.length === 0 && (
                <p className="text-gray-600 text-center py-8">No events recorded for this period.</p>
              )}
              {filteredEvents.slice(0, 50).map((event, i) => (
                <TimelineEvent key={`${event._type}-${i}`} event={event} type={event._type} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SpaceWeather;
