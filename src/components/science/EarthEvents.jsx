import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { fetchNASA, glassCard, ErrorWithRetry } from './utils';

/* ── Category config ── */
const CATEGORIES = {
  wildfires: { label: 'Wildfires', color: '#ef4444', icon: 'M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z' },
  volcanoes: { label: 'Volcanoes', color: '#f97316', icon: 'M3 21l6-6 3 3 6-9 3 3V21H3z' },
  severeStorms: { label: 'Storms', color: '#8b5cf6', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  floods: { label: 'Floods', color: '#3b82f6', icon: 'M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z' },
  earthquakes: { label: 'Earthquakes', color: '#eab308', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  landslides: { label: 'Landslides', color: '#a3683a', icon: 'M3 21h18L12 3 3 21z' },
  seaLakeIce: { label: 'Ice', color: '#67e8f9', icon: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707' },
  default: { label: 'Other', color: '#94a3b8', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z' },
};

const getCategoryConfig = (cat) => {
  const id = (cat?.id || cat?.title || '').toLowerCase();
  if (id.includes('wildfire') || id.includes('fire')) return CATEGORIES.wildfires;
  if (id.includes('volcan')) return CATEGORIES.volcanoes;
  if (id.includes('storm') || id.includes('cyclon') || id.includes('hurricane') || id.includes('typhoon')) return CATEGORIES.severeStorms;
  if (id.includes('flood')) return CATEGORIES.floods;
  if (id.includes('earthquake')) return CATEGORIES.earthquakes;
  if (id.includes('landslide')) return CATEGORIES.landslides;
  if (id.includes('ice') || id.includes('snow')) return CATEGORIES.seaLakeIce;
  return CATEGORIES.default;
};

/* ── SVG World Map (simplified) ── */
const WorldMap = ({ events, selectedId, onSelect }) => {
  const svgRef = useRef(null);

  // Convert lat/lng to SVG coords (equirectangular)
  const toXY = (lng, lat) => ({
    x: ((parseFloat(lng) + 180) / 360) * 800,
    y: ((90 - parseFloat(lat)) / 180) * 400,
  });

  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-gray-900/80 border border-gray-800">
      <svg ref={svgRef} viewBox="0 0 800 400" className="w-full h-auto">
        {/* Grid lines */}
        {[...Array(7)].map((_, i) => (
          <line key={`h${i}`} x1="0" y1={i * (400/6)} x2="800" y2={i * (400/6)} stroke="#1e293b" strokeWidth="0.5" />
        ))}
        {[...Array(13)].map((_, i) => (
          <line key={`v${i}`} x1={i * (800/12)} y1="0" x2={i * (800/12)} y2="400" stroke="#1e293b" strokeWidth="0.5" />
        ))}

        {/* Simplified continent outlines */}
        {/* North America */}
        <path d="M 100,80 L 130,70 160,75 180,90 200,80 220,90 240,100 230,130 220,160 200,180 180,200 160,190 140,200 120,180 110,160 100,140 90,120 95,100Z" fill="#1e293b" stroke="#334155" strokeWidth="0.5" />
        {/* South America */}
        <path d="M 180,220 L 200,210 220,220 230,250 220,280 210,310 190,340 170,330 160,300 165,270 170,240Z" fill="#1e293b" stroke="#334155" strokeWidth="0.5" />
        {/* Europe */}
        <path d="M 370,80 L 400,70 420,80 430,90 420,110 400,120 380,110 370,100Z" fill="#1e293b" stroke="#334155" strokeWidth="0.5" />
        {/* Africa */}
        <path d="M 370,140 L 400,130 430,140 450,170 440,210 430,250 410,280 390,290 370,270 360,240 355,200 360,170Z" fill="#1e293b" stroke="#334155" strokeWidth="0.5" />
        {/* Asia */}
        <path d="M 440,60 L 500,50 560,60 620,70 660,90 680,120 660,150 620,160 580,150 540,140 500,130 460,120 440,100Z" fill="#1e293b" stroke="#334155" strokeWidth="0.5" />
        {/* Australia */}
        <path d="M 620,260 L 660,250 700,260 720,280 710,310 680,320 640,310 620,290Z" fill="#1e293b" stroke="#334155" strokeWidth="0.5" />

        {/* Equator */}
        <line x1="0" y1="200" x2="800" y2="200" stroke="#334155" strokeWidth="0.5" strokeDasharray="4,4" />

        {/* Event markers */}
        {events.map((event) => {
          const geo = event.geometry?.[event.geometry.length - 1];
          if (!geo?.coordinates) return null;
          const [lng, lat] = geo.coordinates;
          const { x, y } = toXY(lng, lat);
          const catConf = getCategoryConfig(event.categories?.[0]);
          const isSelected = selectedId === event.id;

          return (
            <g key={event.id} onClick={() => onSelect(event.id)} className="cursor-pointer">
              {/* Pulse ring */}
              {isSelected && (
                <circle cx={x} cy={y} r="12" fill="none" stroke={catConf.color} strokeWidth="1" opacity="0.5">
                  <animate attributeName="r" from="6" to="18" dur="1.5s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.6" to="0" dur="1.5s" repeatCount="indefinite" />
                </circle>
              )}
              {/* Marker */}
              <circle
                cx={x} cy={y}
                r={isSelected ? 6 : 4}
                fill={catConf.color}
                stroke="#0f172a"
                strokeWidth="1.5"
                className="transition-all duration-300"
                style={{ filter: `drop-shadow(0 0 4px ${catConf.color})` }}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};

/* ── Event Card ── */
const EventCard = ({ event, isSelected, onSelect }) => {
  const cat = event.categories?.[0];
  const catConf = getCategoryConfig(cat);
  const geo = event.geometry?.[event.geometry.length - 1];
  const date = geo?.date ? new Date(geo.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

  return (
    <button
      onClick={() => onSelect(event.id)}
      className={`w-full text-left p-3 rounded-xl border transition-all duration-300 ${
        isSelected
          ? 'bg-gray-800/80 border-cyan-500/40 shadow-lg shadow-cyan-900/10'
          : 'bg-gray-900/40 border-gray-800 hover:border-gray-700 hover:bg-gray-800/40'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5"
          style={{ backgroundColor: catConf.color + '20' }}
        >
          <svg className="w-4 h-4" fill="none" stroke={catConf.color} viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d={catConf.icon} />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-white text-sm font-medium truncate">{event.title}</h4>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{ color: catConf.color, backgroundColor: catConf.color + '15' }}>
              {catConf.label}
            </span>
            <span className="text-gray-500 text-xs">{date}</span>
          </div>
          {event.sources?.[0]?.url && (
            <a
              href={event.sources[0].url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-cyan-500 text-xs hover:underline mt-1 inline-block"
            >
              Source
            </a>
          )}
        </div>
      </div>
    </button>
  );
};

/* ── Skeleton ── */
const Skeleton = () => (
  <div className="animate-pulse space-y-4">
    <div className="h-64 bg-gray-800 rounded-xl" />
    <div className="grid grid-cols-2 gap-3">
      {[1,2,3,4].map(i => <div key={i} className="h-20 bg-gray-800 rounded-xl" />)}
    </div>
  </div>
);

/* ── Main ── */
const EarthEvents = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const abortRef = useRef(null);

  const fetchEvents = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    const url = 'https://eonet.gsfc.nasa.gov/api/v3/events?limit=50&status=open';
    const { data, error: err } = await fetchNASA(url, { signal: controller.signal });
    if (err) { setError(err); setLoading(false); return; }
    if (data?.events) setEvents(data.events);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchEvents();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [fetchEvents]);

  const categoryTypes = useMemo(() => {
    const types = {};
    events.forEach(e => {
      const cat = e.categories?.[0];
      const conf = getCategoryConfig(cat);
      const key = conf.label;
      types[key] = (types[key] || 0) + 1;
    });
    return types;
  }, [events]);

  const filteredEvents = useMemo(() => {
    if (activeFilter === 'all') return events;
    return events.filter(e => {
      const conf = getCategoryConfig(e.categories?.[0]);
      return conf.label === activeFilter;
    });
  }, [events, activeFilter]);

  const mappableEvents = useMemo(() =>
    filteredEvents.filter(e => e.geometry?.length > 0 && e.geometry[e.geometry.length - 1]?.coordinates),
    [filteredEvents]
  );

  const selectedEvent = useMemo(() => events.find(e => e.id === selectedId), [events, selectedId]);

  return (
    <div className="space-y-6">
      {/* Category badges */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            activeFilter === 'all' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-transparent'
          }`}
        >
          All <span className="ml-1 text-xs opacity-60">{events.length}</span>
        </button>
        {Object.entries(categoryTypes).map(([label, count]) => {
          const catConf = Object.values(CATEGORIES).find(c => c.label === label) || CATEGORIES.default;
          return (
            <button
              key={label}
              onClick={() => setActiveFilter(label)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                activeFilter === label
                  ? 'border shadow-sm'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-transparent'
              }`}
              style={activeFilter === label ? { color: catConf.color, backgroundColor: catConf.color + '20', borderColor: catConf.color + '60' } : {}}
            >
              {label}
              <span className="text-xs opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      <ErrorWithRetry error={error} onRetry={fetchEvents} />

      {loading && <Skeleton />}

      {!loading && !error && (
        <>
          {/* Map */}
          <WorldMap events={mappableEvents} selectedId={selectedId} onSelect={setSelectedId} />

          {/* Selected event detail */}
          {selectedEvent && (
            <div className={`${glassCard} p-5 border-cyan-500/30`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-white font-bold">{selectedEvent.title}</h3>
                  <p className="text-gray-400 text-sm mt-1">
                    Category: {getCategoryConfig(selectedEvent.categories?.[0]).label}
                  </p>
                  {selectedEvent.geometry?.length > 0 && (
                    <p className="text-gray-500 text-xs mt-1">
                      Coordinates: {selectedEvent.geometry[selectedEvent.geometry.length - 1].coordinates?.join(', ')}
                    </p>
                  )}
                  {selectedEvent.description && (
                    <p className="text-gray-300 text-sm mt-2">{selectedEvent.description}</p>
                  )}
                </div>
                <button onClick={() => setSelectedId(null)} className="text-gray-500 hover:text-white text-lg">&times;</button>
              </div>
            </div>
          )}

          {/* Event list */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto pr-1">
            {filteredEvents.map(event => (
              <EventCard
                key={event.id}
                event={event}
                isSelected={selectedId === event.id}
                onSelect={setSelectedId}
              />
            ))}
            {filteredEvents.length === 0 && (
              <p className="col-span-2 text-center text-gray-600 py-8">No events match the current filter.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default EarthEvents;
