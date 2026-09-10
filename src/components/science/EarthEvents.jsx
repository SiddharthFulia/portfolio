// EarthEvents — active natural events tracked by NASA EONET.
//
// Composition:
//   1. Hero strip
//   2. Telemetry — total events, wildfires, volcanoes, storms
//   3. Category filter chips (all + per-category)
//   4. Mini world map SVG with colour-coded pins
//   5. Grid of event cards (luxe glass, click to focus on map)

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { fetchEarthEvents } from '../../api/nasa'
import { LuxeLoader } from '../loaders'
import { ModuleHero, StatCard, SectionHeader, FilterChips, FriendlyError } from './ModuleShell'

/* ── Category config ── */
const CATEGORIES = {
  wildfires:    { key: 'wildfires',    label: 'Wildfires',   color: '#ef4444' },
  volcanoes:    { key: 'volcanoes',    label: 'Volcanoes',   color: '#f97316' },
  severeStorms: { key: 'severeStorms', label: 'Storms',      color: '#a855f7' },
  floods:       { key: 'floods',       label: 'Floods',      color: '#3b82f6' },
  earthquakes:  { key: 'earthquakes',  label: 'Earthquakes', color: '#eab308' },
  landslides:   { key: 'landslides',   label: 'Landslides',  color: '#a3683a' },
  seaLakeIce:   { key: 'seaLakeIce',   label: 'Ice',         color: '#67e8f9' },
  other:        { key: 'other',        label: 'Other',       color: '#94a3b8' },
}

const categoryOf = (event) => {
  const id = (event.categories?.[0]?.id || event.categories?.[0]?.title || '').toLowerCase()
  if (id.includes('wildfire') || id.includes('fire')) return CATEGORIES.wildfires
  if (id.includes('volcan')) return CATEGORIES.volcanoes
  if (id.includes('storm') || id.includes('cyclon') || id.includes('hurricane') || id.includes('typhoon')) return CATEGORIES.severeStorms
  if (id.includes('flood')) return CATEGORIES.floods
  if (id.includes('earthquake')) return CATEGORIES.earthquakes
  if (id.includes('landslide')) return CATEGORIES.landslides
  if (id.includes('ice') || id.includes('snow')) return CATEGORIES.seaLakeIce
  return CATEGORIES.other
}

/* ── Simplified continent paths for the mini map ── */
const CONTINENTS = [
  'M 100,80 L 130,70 160,75 180,90 200,80 220,90 240,100 230,130 220,160 200,180 180,200 160,190 140,200 120,180 110,160 100,140 90,120 95,100Z',
  'M 180,220 L 200,210 220,220 230,250 220,280 210,310 190,340 170,330 160,300 165,270 170,240Z',
  'M 370,80 L 400,70 420,80 430,90 420,110 400,120 380,110 370,100Z',
  'M 370,140 L 400,130 430,140 450,170 440,210 430,250 410,280 390,290 370,270 360,240 355,200 360,170Z',
  'M 440,60 L 500,50 560,60 620,70 660,90 680,120 660,150 620,160 580,150 540,140 500,130 460,120 440,100Z',
  'M 620,260 L 660,250 700,260 720,280 710,310 680,320 640,310 620,290Z',
]

const WorldMap = ({ events, selectedId, onSelect }) => {
  const toXY = (lng, lat) => ({
    x: ((parseFloat(lng) + 180) / 360) * 800,
    y: ((90 - parseFloat(lat)) / 180) * 400,
  })

  return (
    <div className="relative w-full overflow-hidden rounded-2xl bg-gray-950 border border-gray-800">
      <svg viewBox="0 0 800 400" className="w-full h-auto">
        {/* Grid */}
        {[...Array(7)].map((_, i) => (
          <line key={`h${i}`} x1="0" y1={i * (400 / 6)} x2="800" y2={i * (400 / 6)} stroke="#1e293b" strokeWidth="0.5" />
        ))}
        {[...Array(13)].map((_, i) => (
          <line key={`v${i}`} x1={i * (800 / 12)} y1="0" x2={i * (800 / 12)} y2="400" stroke="#1e293b" strokeWidth="0.5" />
        ))}
        {/* Continents */}
        {CONTINENTS.map((d, i) => (
          <path key={i} d={d} fill="#1e293b" stroke="#334155" strokeWidth="0.5" />
        ))}
        {/* Equator */}
        <line x1="0" y1="200" x2="800" y2="200" stroke="#334155" strokeWidth="0.5" strokeDasharray="4,4" />

        {/* Pins */}
        {events.map(event => {
          const geo = event.geometry?.[event.geometry.length - 1]
          if (!geo?.coordinates) return null
          const [lng, lat] = geo.coordinates
          const { x, y } = toXY(lng, lat)
          const cat = categoryOf(event)
          const active = selectedId === event.id

          return (
            <g key={event.id} onClick={() => onSelect(event.id)} className="cursor-pointer">
              {active && (
                <circle cx={x} cy={y} r="14" fill="none" stroke={cat.color} strokeWidth="1" opacity="0.5">
                  <animate attributeName="r" from="6" to="18" dur="1.5s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.6" to="0" dur="1.5s" repeatCount="indefinite" />
                </circle>
              )}
              <circle
                cx={x} cy={y} r={active ? 6 : 4}
                fill={cat.color} stroke="#0f172a" strokeWidth="1.5"
                style={{ filter: `drop-shadow(0 0 4px ${cat.color})` }}
              />
            </g>
          )
        })}
      </svg>
    </div>
  )
}

const EventCard = ({ event, selected, onSelect }) => {
  const cat = categoryOf(event)
  const geo = event.geometry?.[event.geometry.length - 1]
  const date = geo?.date ? new Date(geo.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''
  const coords = geo?.coordinates ? `${(+geo.coordinates[1]).toFixed(2)}°, ${(+geo.coordinates[0]).toFixed(2)}°` : null

  return (
    <button
      onClick={() => onSelect(event.id)}
      className={`w-full text-left luxe-card p-4 transition-colors ${selected ? 'border-cyan-500/40 bg-cyan-500/5' : 'hover:border-gray-700'}`}
    >
      <div className="flex items-start gap-3">
        <div
          className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: cat.color + '20', border: `1px solid ${cat.color}40` }}
        >
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color, boxShadow: `0 0 6px ${cat.color}` }} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-white text-sm font-semibold line-clamp-2 leading-tight">{event.title}</h4>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
              style={{ color: cat.color, backgroundColor: cat.color + '15' }}
            >
              {cat.label}
            </span>
            <span className="text-gray-500 text-[10px] font-mono">{date}</span>
          </div>
          {coords && <p className="text-gray-600 text-[10px] font-mono mt-1">{coords}</p>}
        </div>
      </div>
    </button>
  )
}

const EarthEvents = () => {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [filter, setFilter] = useState('all')
  const [updated, setUpdated] = useState(null)
  const abortRef = useRef(null)

  const fetchEvents = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError(null)

    const { data, error: err } = await fetchEarthEvents({ limit: 100, status: 'open' }, { signal: controller.signal })
    if (err) { setError(err); setLoading(false); return }
    if (data?.events) { setEvents(data.events); setUpdated(new Date()) }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchEvents()
    return () => { if (abortRef.current) abortRef.current.abort() }
  }, [fetchEvents])

  const byCategory = useMemo(() => {
    const m = {}
    events.forEach(e => {
      const k = categoryOf(e).key
      m[k] = (m[k] || 0) + 1
    })
    return m
  }, [events])

  const filtered = useMemo(() => {
    if (filter === 'all') return events
    return events.filter(e => categoryOf(e).key === filter)
  }, [events, filter])

  const mappable = useMemo(
    () => filtered.filter(e => e.geometry?.length && e.geometry[e.geometry.length - 1]?.coordinates),
    [filtered]
  )

  const chipOptions = useMemo(() => {
    const opts = [{ key: 'all', label: 'All', count: events.length }]
    Object.values(CATEGORIES).forEach(c => {
      const count = byCategory[c.key] || 0
      if (count > 0) opts.push({ key: c.key, label: c.label, count })
    })
    return opts
  }, [events.length, byCategory])

  return (
    <div className="space-y-6 sm:space-y-8">
      <ModuleHero
        eyebrow="EONET · NASA feed"
        title="Earth Events"
        subtitle="Live wildfires, volcanic eruptions, severe storms, and other natural events, tracked from orbit by NASA's Earth Observatory Natural Event Tracker."
        updated={updated}
        accent="lime"
      />

      {/* Telemetry */}
      <div>
        <SectionHeader>Live telemetry</SectionHeader>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <StatCard tone="lime"    label="Active events" value={events.length}            ctx="currently open" loading={loading} />
          <StatCard tone="red"     label="Wildfires"     value={byCategory.wildfires || 0} ctx="burning now"    loading={loading} />
          <StatCard tone="orange"  label="Volcanoes"     value={byCategory.volcanoes || 0} ctx="erupting or venting" loading={loading} />
          <StatCard tone="violet"  label="Severe storms" value={byCategory.severeStorms || 0} ctx="tropical / extratropical" loading={loading} />
        </div>
      </div>

      <FriendlyError error={error} onRetry={fetchEvents} />

      {loading ? (
        <div className="py-16 flex items-center justify-center">
          <LuxeLoader variant="cosmos" size="lg" label="reading the atmosphere…" />
        </div>
      ) : (
        <>
          <div>
            <SectionHeader>Filter feed</SectionHeader>
            <FilterChips options={chipOptions} value={filter} onChange={setFilter} />
            <p className="text-[10px] text-gray-600 mt-2 font-mono">tip: pick a category to filter both the map and the list</p>
          </div>

          {/* Map */}
          <WorldMap events={mappable} selectedId={selectedId} onSelect={setSelectedId} />

          {/* Grid */}
          {filtered.length === 0 ? (
            <div className="luxe-card p-6 text-center">
              <p className="text-gray-300 font-semibold mb-1">Nothing in this category right now</p>
              <p className="text-gray-500 text-sm">Try another filter or refresh in a bit.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.slice(0, 24).map(ev => (
                <EventCard
                  key={ev.id}
                  event={ev}
                  selected={selectedId === ev.id}
                  onSelect={setSelectedId}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default EarthEvents
