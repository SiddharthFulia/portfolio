// FireballTracker — bright atmospheric fireball detections from NASA CNEOS.
//
// Composition:
//   1. Hero strip
//   2. Telemetry — total events, with-location, largest event (kt TNT), avg velocity
//   3. Sort chips (energy desc default) + date range
//   4. Mini world map with pins sized by energy
//   5. Card list of events (converted to kt TNT equivalent)

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { fetchFireballs } from '../../api/nasa'
import { LuxeLoader } from '../loaders'
import { ModuleHero, StatCard, SectionHeader, FilterChips, FriendlyError } from './ModuleShell'

// Energy conversion: CNEOS reports impact energy in units of 10^10 J.
// 1 kt TNT ≈ 4.184 × 10^12 J = 418.4 × 10^10 J.
const ENERGY_TO_KT = 1 / 418.4

/* ── Continent paths (same as EarthEvents) ── */
const CONTINENTS = [
  'M 100,80 L 130,70 160,75 180,90 200,80 220,90 240,100 230,130 220,160 200,180 180,200 160,190 140,200 120,180 110,160 100,140 90,120 95,100Z',
  'M 180,220 L 200,210 220,220 230,250 220,280 210,310 190,340 170,330 160,300 165,270 170,240Z',
  'M 370,80 L 400,70 420,80 430,90 420,110 400,120 380,110 370,100Z',
  'M 370,140 L 400,130 430,140 450,170 440,210 430,250 410,280 390,290 370,270 360,240 355,200 360,170Z',
  'M 440,60 L 500,50 560,60 620,70 660,90 680,120 660,150 620,160 580,150 540,140 500,130 460,120 440,100Z',
  'M 620,260 L 660,250 700,260 720,280 710,310 680,320 640,310 620,290Z',
]

const FireballMap = ({ fireballs, selectedIdx, onSelect }) => {
  const toXY = (lat, lon) => ({
    x: ((parseFloat(lon) + 180) / 360) * 800,
    y: ((90 - parseFloat(lat)) / 180) * 400,
  })

  return (
    <div className="relative w-full overflow-hidden rounded-2xl bg-gray-950 border border-gray-800">
      <svg viewBox="0 0 800 400" className="w-full h-auto">
        {[...Array(7)].map((_, i) => (
          <line key={`h${i}`} x1="0" y1={i * (400/6)} x2="800" y2={i * (400/6)} stroke="#1e293b" strokeWidth="0.5" />
        ))}
        {[...Array(13)].map((_, i) => (
          <line key={`v${i}`} x1={i * (800/12)} y1="0" x2={i * (800/12)} y2="400" stroke="#1e293b" strokeWidth="0.5" />
        ))}
        {CONTINENTS.map((d, i) => (
          <path key={i} d={d} fill="#1e293b" stroke="#334155" strokeWidth="0.5" />
        ))}
        <line x1="0" y1="200" x2="800" y2="200" stroke="#334155" strokeWidth="0.5" strokeDasharray="4,4" />

        <defs>
          <radialGradient id="fireballGlow">
            <stop offset="0%" stopColor="#f97316" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
          </radialGradient>
        </defs>

        {fireballs.map((fb, i) => {
          if (!fb.lat || !fb.lon) return null
          const lat = parseFloat(fb.lat) * (fb['lat-dir'] === 'S' ? -1 : 1)
          const lon = parseFloat(fb.lon) * (fb['lon-dir'] === 'W' ? -1 : 1)
          const { x, y } = toXY(lat, lon)
          const energy = parseFloat(fb.energy) || 0.1
          const radius = Math.max(2, Math.min(14, Math.log10(energy + 1) * 4))
          const active = selectedIdx === i

          return (
            <g key={i} onClick={() => onSelect(i)} className="cursor-pointer">
              <circle cx={x} cy={y} r={radius * 2.2} fill="url(#fireballGlow)" opacity={active ? 0.9 : 0.35} />
              <circle
                cx={x} cy={y} r={radius}
                fill={active ? '#fde047' : '#f97316'}
                stroke={active ? '#fde047' : '#0f172a'}
                strokeWidth={active ? 2 : 1}
                style={{ filter: 'drop-shadow(0 0 4px #f97316)' }}
              />
              {active && (
                <circle cx={x} cy={y} r={radius + 4} fill="none" stroke="#fde047" strokeWidth="1" opacity="0.6">
                  <animate attributeName="r" from={radius + 2} to={radius + 12} dur="1s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.6" to="0" dur="1s" repeatCount="indefinite" />
                </circle>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

const FireballCard = ({ fb, active, onSelect }) => {
  const energy = parseFloat(fb.energy) || 0
  const kt = energy * ENERGY_TO_KT
  const vel = parseFloat(fb.vel)
  const alt = parseFloat(fb.alt)
  const loc = fb.lat && fb.lon ? `${fb.lat}° ${fb['lat-dir'] || ''} ${fb.lon}° ${fb['lon-dir'] || ''}` : null

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left luxe-card p-4 transition-colors ${active ? 'border-rose-500/40 bg-rose-500/5' : 'hover:border-gray-700'}`}
    >
      <div className="flex items-start gap-3">
        <div className="w-2 h-2 mt-1.5 rounded-full bg-orange-400 shrink-0" style={{ boxShadow: '0 0 6px #f97316' }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-white text-sm font-mono">{fb.date}</span>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-200">
              {kt.toFixed(3)} kt
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <div>
              <div className="text-[9px] text-gray-500 uppercase tracking-wider">Velocity</div>
              <div className="text-cyan-300 font-mono text-xs">{isFinite(vel) ? vel.toFixed(1) : '—'} km/s</div>
            </div>
            <div>
              <div className="text-[9px] text-gray-500 uppercase tracking-wider">Altitude</div>
              <div className="text-fuchsia-300 font-mono text-xs">{isFinite(alt) ? alt.toFixed(1) : '—'} km</div>
            </div>
            <div>
              <div className="text-[9px] text-gray-500 uppercase tracking-wider">Location</div>
              <div className="text-gray-300 font-mono text-[10px] truncate">{loc || 'unlogged'}</div>
            </div>
          </div>
        </div>
      </div>
    </button>
  )
}

const FireballTracker = () => {
  const [fireballs, setFireballs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedIdx, setSelectedIdx] = useState(null)
  const [dateRange, setDateRange] = useState({ start: '', end: '' })
  const [sortBy, setSortBy] = useState('energy') // default: biggest first
  const [updated, setUpdated] = useState(null)
  const abortRef = useRef(null)

  const fetchData = useCallback(async (start, end) => {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError(null)

    const params = { 'req-loc': true }
    if (start) params['date-min'] = start
    if (end) params['date-max'] = end

    const { data, error: err } = await fetchFireballs(params, { signal: controller.signal })
    if (err) { setError(err); setLoading(false); return }

    if (data?.data && data?.fields) {
      const fields = data.fields
      const parsed = data.data.map(row => {
        const obj = {}
        fields.forEach((f, i) => { obj[f] = row[i] })
        return obj
      })
      setFireballs(parsed)
      setUpdated(new Date())
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
    return () => { if (abortRef.current) abortRef.current.abort() }
  }, [fetchData])

  const sorted = useMemo(() => {
    const list = [...fireballs]
    if (sortBy === 'energy') list.sort((a, b) => (parseFloat(b.energy) || 0) - (parseFloat(a.energy) || 0))
    else if (sortBy === 'velocity') list.sort((a, b) => (parseFloat(b.vel) || 0) - (parseFloat(a.vel) || 0))
    else list.sort((a, b) => new Date(b.date) - new Date(a.date))
    return list
  }, [fireballs, sortBy])

  const mappable = useMemo(() => sorted.filter(fb => fb.lat && fb.lon), [sorted])
  const largest = useMemo(() => sorted.reduce((max, fb) => Math.max(max, parseFloat(fb.energy) || 0), 0), [sorted])
  const avgVel = useMemo(() => {
    const withVel = fireballs.filter(fb => parseFloat(fb.vel))
    if (!withVel.length) return 0
    return withVel.reduce((s, fb) => s + parseFloat(fb.vel), 0) / withVel.length
  }, [fireballs])

  const submitRange = (e) => {
    e.preventDefault()
    fetchData(dateRange.start, dateRange.end)
  }
  const resetRange = () => {
    setDateRange({ start: '', end: '' })
    fetchData()
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <ModuleHero
        eyebrow="CNEOS · NASA feed"
        title="Fireball Tracker"
        subtitle="Bright atmospheric fireball events detected by NASA's Center for Near-Earth Object Studies. Every entry is a rock that lit up the sky — sized here by TNT-equivalent kinetic energy on impact."
        updated={updated}
        accent="rose"
      />

      {/* Telemetry */}
      <div>
        <SectionHeader>Live telemetry</SectionHeader>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <StatCard tone="orange" label="Fireballs tracked" value={fireballs.length} ctx="since 1988" loading={loading} />
          <StatCard tone="cyan"   label="With location"     value={mappable.length}  ctx="mappable events" loading={loading} />
          <StatCard tone="yellow" label="Biggest event"     value={largest ? `${(largest * ENERGY_TO_KT).toFixed(2)} kt` : '—'} ctx="TNT-equivalent · Chelyabinsk was ≈440 kt" loading={loading} />
          <StatCard tone="violet" label="Avg velocity"      value={`${avgVel.toFixed(1)} km/s`} ctx="atmospheric entry speed" loading={loading} />
        </div>
      </div>

      {/* Filters */}
      <div>
        <SectionHeader>Filter feed</SectionHeader>
        <form onSubmit={submitRange} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold block mb-1">From</label>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange(p => ({ ...p, start: e.target.value }))}
              className="px-3 py-2 bg-gray-900/60 border border-gray-800 rounded-full text-white text-xs font-mono focus:outline-none focus:border-rose-500/50 transition-colors"
              aria-describedby="from-help"
            />
            <p id="from-help" className="text-[10px] text-gray-600 mt-1 font-mono">optional lower bound</p>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold block mb-1">To</label>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange(p => ({ ...p, end: e.target.value }))}
              className="px-3 py-2 bg-gray-900/60 border border-gray-800 rounded-full text-white text-xs font-mono focus:outline-none focus:border-rose-500/50 transition-colors"
              aria-describedby="to-help"
            />
            <p id="to-help" className="text-[10px] text-gray-600 mt-1 font-mono">optional upper bound</p>
          </div>
          <button type="submit" className="luxe-press tap-44 px-4 py-2 rounded-full text-xs font-semibold border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 transition-colors">
            Apply
          </button>
          <button type="button" onClick={resetRange} className="luxe-press tap-44 px-4 py-2 rounded-full text-xs font-semibold border border-gray-800 bg-gray-900/40 text-gray-400 hover:text-gray-200 transition-colors">
            Reset
          </button>
        </form>
        <div className="mt-3">
          <FilterChips
            options={[
              { key: 'energy',   label: 'Biggest first' },
              { key: 'velocity', label: 'Fastest first' },
              { key: 'date',     label: 'Newest first' },
            ]}
            value={sortBy}
            onChange={setSortBy}
          />
        </div>
      </div>

      <FriendlyError error={error} onRetry={() => fetchData()} />

      {loading ? (
        <div className="py-16 flex items-center justify-center">
          <LuxeLoader variant="cosmos" size="lg" label="scanning the atmosphere…" />
        </div>
      ) : (
        <>
          <FireballMap fireballs={mappable} selectedIdx={selectedIdx} onSelect={setSelectedIdx} />

          <div>
            <SectionHeader trailing={<span className="text-[10px] text-gray-600 font-mono">showing top {Math.min(sorted.length, 60)}</span>}>
              Events
            </SectionHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {sorted.slice(0, 60).map((fb, i) => (
                <FireballCard key={i} fb={fb} active={selectedIdx === i} onSelect={() => setSelectedIdx(i)} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default FireballTracker
