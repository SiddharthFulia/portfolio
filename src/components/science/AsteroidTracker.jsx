// AsteroidTracker — near-Earth objects for the current week.
//
// Composition:
//   1. Hero strip
//   2. Telemetry — total, hazardous, safe, days-tracked
//   3. Filter chips — sort (miss distance / size / date) + "hazardous only"
//   4. Grid cards — name, diameter, miss distance (km + AU + Earth-Moon),
//      velocity, hazardous badge, next-approach date
//   5. Loads sorted by miss distance ascending by default

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { fetchAsteroids, formatNumber, formatDistance, todayStr, daysAgo } from '../../api/nasa'
import { LuxeLoader } from '../loaders'
import { ModuleHero, StatCard, SectionHeader, FilterChips, FriendlyError } from './ModuleShell'

const AU_KM = 149_597_870.7
const LD_KM = 384_400 // 1 lunar distance

/* ── Danger badge ── */
const DangerBadge = ({ hazardous }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
    hazardous
      ? 'bg-red-500/15 text-red-300 border border-red-500/40'
      : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40'
  }`}>
    <span className={`w-1.5 h-1.5 rounded-full ${hazardous ? 'bg-red-400 animate-pulse' : 'bg-emerald-400'}`} />
    {hazardous ? 'Hazardous' : 'Safe'}
  </span>
)

/* ── Card for a single NEO ── */
const AsteroidCard = ({ asteroid, maxDiam }) => {
  const approach = asteroid.close_approach_data?.[0]
  const distKm = parseFloat(approach?.miss_distance?.kilometers || 0)
  const velKmh = parseFloat(approach?.relative_velocity?.kilometers_per_hour || 0)
  const diamMax = asteroid.estimated_diameter?.meters?.estimated_diameter_max || 0
  const diamMin = asteroid.estimated_diameter?.meters?.estimated_diameter_min || 0
  const diam = (diamMin + diamMax) / 2
  const au = distKm / AU_KM
  const ld = distKm / LD_KM
  const sizePct = maxDiam > 0 ? Math.min(100, Math.max(4, (diam / maxDiam) * 100)) : 4

  const hazardous = asteroid.is_potentially_hazardous_asteroid

  return (
    <div className={`luxe-card p-4 sm:p-5 h-full flex flex-col transition-all hover:-translate-y-0.5 ${
      hazardous ? 'hover:border-red-500/40' : 'hover:border-cyan-500/30'
    }`}>
      <div className={`absolute inset-x-0 top-0 h-0.5 opacity-70 ${hazardous ? 'bg-red-500' : 'bg-cyan-500'}`} />
      <div className="flex items-start justify-between gap-2 mb-3">
        <h4 className="text-white font-bold text-sm leading-tight truncate flex-1">{asteroid.name.replace(/[()]/g, '')}</h4>
        <DangerBadge hazardous={hazardous} />
      </div>

      <div className="text-[10px] text-gray-500 font-mono mb-3">
        approach {asteroid.approach_date}
      </div>

      {/* Size bar */}
      <div className="mb-3">
        <div className="flex justify-between text-[10px] mb-1">
          <span className="text-gray-500 uppercase tracking-wider">Diameter</span>
          <span className="text-cyan-300 font-mono">{diam.toFixed(0)} m</span>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500" style={{ width: `${sizePct}%` }} />
        </div>
      </div>

      {/* Miss distance triple readout */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">km</div>
          <div className="text-xs text-white font-mono">{formatDistance(distKm)}</div>
        </div>
        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">AU</div>
          <div className="text-xs text-white font-mono">{au.toFixed(4)}</div>
        </div>
        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">LD</div>
          <div className="text-xs text-white font-mono">{ld.toFixed(1)}</div>
        </div>
      </div>

      <div className="mt-auto pt-3 border-t border-gray-800/60 flex items-center justify-between text-xs">
        <span className="text-gray-500">Velocity</span>
        <span className="text-fuchsia-300 font-mono">{formatNumber(Math.round(velKmh))} km/h</span>
      </div>
    </div>
  )
}

/* ── Approach orbit visualisation (canvas) ── */
const OrbitViz = ({ asteroids }) => {
  const canvasRef = useRef(null)
  const rafRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const ctx = canvas.getContext('2d')
    const resize = () => {
      canvas.width = canvas.offsetWidth * dpr
      canvas.height = canvas.offsetHeight * dpr
    }
    resize()
    const w = () => canvas.width / dpr
    const h = () => canvas.height / dpr

    const rocks = (asteroids || []).slice(0, 16).map((a, i) => ({
      angle: (i / Math.min(asteroids.length, 16)) * Math.PI * 2,
      dist: 40 + Math.random() * 80,
      size: Math.max(2, parseFloat(a.estimated_diameter?.meters?.estimated_diameter_max || 3) / 60),
      speed: 0.0015 + Math.random() * 0.004,
      hazardous: a.is_potentially_hazardous_asteroid,
    }))

    let t = 0
    let alive = true
    const draw = () => {
      if (!alive) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w(), h())
      const cx = w() / 2, cy = h() / 2

      // Earth glow + core
      const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, 24)
      grad.addColorStop(0, 'rgba(59,130,246,0.9)')
      grad.addColorStop(1, 'rgba(59,130,246,0)')
      ctx.fillStyle = grad
      ctx.beginPath(); ctx.arc(cx, cy, 24, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#3b82f6'
      ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill()

      // Orbit rings
      for (let r = 50; r <= 130; r += 20) {
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(100,116,139,0.15)'
        ctx.lineWidth = 0.5
        ctx.stroke()
      }

      rocks.forEach((r) => {
        const x = cx + Math.cos(r.angle + t * r.speed) * r.dist
        const y = cy + Math.sin(r.angle + t * r.speed) * r.dist
        const size = Math.min(r.size, 5)
        ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2)
        ctx.fillStyle = r.hazardous ? '#ef4444' : '#94a3b8'
        ctx.shadowBlur = r.hazardous ? 8 : 0
        ctx.shadowColor = r.hazardous ? '#ef4444' : 'transparent'
        ctx.fill()
        ctx.shadowBlur = 0
      })

      t++
      rafRef.current = requestAnimationFrame(draw)
    }
    draw()

    const onResize = () => resize()
    window.addEventListener('resize', onResize)
    return () => {
      alive = false
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', onResize)
    }
  }, [asteroids])

  const REDUCE = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  if (REDUCE) {
    // Static SVG fallback for reduced-motion users
    return (
      <div className="w-full h-48 rounded-xl bg-gray-950 border border-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="w-4 h-4 rounded-full bg-blue-500 mx-auto mb-2 shadow-[0_0_16px_#3b82f6]" />
          <div className="text-xs text-gray-500">Earth · {asteroids.length} NEOs this week</div>
        </div>
      </div>
    )
  }

  return (
    <canvas ref={canvasRef} className="w-full h-48 rounded-xl bg-gray-950 border border-gray-800" />
  )
}

const AsteroidTracker = () => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sortBy, setSortBy] = useState('distance') // default: nearest first
  const [showHazardousOnly, setShowHazardousOnly] = useState(false)
  const [updated, setUpdated] = useState(null)
  const abortRef = useRef(null)

  const fetchData = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError(null)

    const { data: d, error: e } = await fetchAsteroids({
      start_date: daysAgo(6),
      end_date: todayStr(),
    }, { signal: controller.signal })

    if (e) { setError(e); setLoading(false); return }
    if (d) { setData(d); setUpdated(new Date()) }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
    return () => { if (abortRef.current) abortRef.current.abort() }
  }, [fetchData])

  const allAsteroids = useMemo(() => {
    if (!data?.near_earth_objects) return []
    return Object.entries(data.near_earth_objects).flatMap(([date, objs]) =>
      objs.map(o => ({ ...o, approach_date: date }))
    )
  }, [data])

  const filteredSorted = useMemo(() => {
    let list = [...allAsteroids]
    if (showHazardousOnly) list = list.filter(a => a.is_potentially_hazardous_asteroid)
    list.sort((a, b) => {
      if (sortBy === 'size') {
        return (b.estimated_diameter?.meters?.estimated_diameter_max || 0) - (a.estimated_diameter?.meters?.estimated_diameter_max || 0)
      }
      if (sortBy === 'date') {
        return new Date(a.approach_date) - new Date(b.approach_date)
      }
      // default: distance ascending (closest first)
      const da = parseFloat(a.close_approach_data?.[0]?.miss_distance?.kilometers || 0)
      const db = parseFloat(b.close_approach_data?.[0]?.miss_distance?.kilometers || 0)
      return da - db
    })
    return list
  }, [allAsteroids, sortBy, showHazardousOnly])

  const maxDiam = useMemo(
    () => Math.max(...allAsteroids.map(a => a.estimated_diameter?.meters?.estimated_diameter_max || 0), 1),
    [allAsteroids]
  )
  const hazCount = useMemo(() => allAsteroids.filter(a => a.is_potentially_hazardous_asteroid).length, [allAsteroids])
  const total = data?.element_count ?? allAsteroids.length

  // Nearest approach in km
  const nearestKm = useMemo(() => {
    if (allAsteroids.length === 0) return null
    return Math.min(...allAsteroids.map(a => parseFloat(a.close_approach_data?.[0]?.miss_distance?.kilometers || Infinity)))
  }, [allAsteroids])

  return (
    <div className="space-y-6 sm:space-y-8">
      <ModuleHero
        eyebrow="NeoWs · NASA feed"
        title="Asteroid Tracker"
        subtitle="Every near-Earth object detected in the last seven days, sorted by how close it swept past. Red badge = potentially hazardous per NASA's classification."
        updated={updated}
        accent="orange"
      />

      {/* Telemetry */}
      <div>
        <SectionHeader>Live telemetry</SectionHeader>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <StatCard tone="orange" label="NEOs this week" value={total} ctx="last 7 days · NASA NeoWs" loading={loading} />
          <StatCard tone="red" label="Hazardous" value={hazCount} ctx="PHA classification" loading={loading} />
          <StatCard tone="emerald" label="Safe" value={total - hazCount} ctx="non-hazardous passes" loading={loading} />
          <StatCard
            tone="cyan" label="Closest miss"
            value={nearestKm ? formatDistance(nearestKm) : '—'}
            ctx={nearestKm ? `${(nearestKm / LD_KM).toFixed(1)} lunar distances` : 'tracking…'}
            loading={loading}
          />
        </div>
      </div>

      <FriendlyError error={error} onRetry={fetchData} />

      {loading ? (
        <div className="py-16 flex items-center justify-center">
          <LuxeLoader variant="cosmos" size="lg" label="scanning near-Earth space…" />
        </div>
      ) : (
        <>
          {/* Orbit visualisation */}
          {allAsteroids.length > 0 && (
            <div>
              <SectionHeader>Approach visualisation</SectionHeader>
              <div className="luxe-card p-4">
                <OrbitViz asteroids={allAsteroids} />
                <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-500">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" />Earth</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-400" />Safe pass</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" />Hazardous</span>
                </div>
              </div>
            </div>
          )}

          {/* Filters */}
          <div>
            <SectionHeader>Filter feed</SectionHeader>
            <div className="flex flex-wrap items-center gap-2">
              <FilterChips
                options={[
                  { key: 'distance', label: 'Nearest first' },
                  { key: 'size',     label: 'Biggest first' },
                  { key: 'date',     label: 'By date' },
                ]}
                value={sortBy}
                onChange={setSortBy}
              />
              <button
                onClick={() => setShowHazardousOnly(v => !v)}
                className={`luxe-press tap-44 ml-auto px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs font-semibold border transition-colors flex items-center gap-2 ${
                  showHazardousOnly
                    ? 'border-red-400/60 bg-red-500/15 text-red-200'
                    : 'border-gray-800 bg-gray-900/40 text-gray-400 hover:border-gray-700 hover:text-gray-200'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${showHazardousOnly ? 'bg-red-400 animate-pulse' : 'bg-gray-500'}`} />
                Only hazardous
                <span className="opacity-70 text-[10px]">{hazCount}</span>
              </button>
            </div>
            <p className="text-[10px] text-gray-600 mt-2 font-mono">tip: nearest first shows what to keep an eye on this week</p>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {filteredSorted.slice(0, 36).map((a) => (
              <AsteroidCard key={a.id} asteroid={a} maxDiam={maxDiam} />
            ))}
          </div>

          {filteredSorted.length === 0 && (
            <div className="luxe-card p-6 text-center">
              <p className="text-gray-300 font-semibold mb-1">No NEOs match this filter</p>
              <p className="text-gray-500 text-sm">
                {showHazardousOnly
                  ? 'Good news — no hazardous objects flagged this week.'
                  : 'Try a different sort or clear the filter.'}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default AsteroidTracker
