// SatelliteViewer — live ISS position + orbital-elements browser for
// famous satellites (Hubble, TESS, Landsat, etc.).
//
// Composition:
//   1. Hero strip
//   2. Telemetry — ISS lat/lng, ISS speed (derived), astros in space, tracked crafts
//   3. Live world map with the ISS pin (updates every 5 s) + orbit ground track
//   4. "Famous satellites" preset chips → shows orbital elements from TLE
//   5. Satellite search + expandable TLE detail

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { fetchISS as fetchISSPosition, fetchAstros, fetchTLE, debounce } from '../../api/nasa'
import { LuxeLoader } from '../loaders'
import { ModuleHero, StatCard, SectionHeader, FilterChips, FriendlyError } from './ModuleShell'

const FAMOUS_SATS = ['ISS', 'HUBBLE', 'TESS', 'LANDSAT 8', 'STARLINK', 'GOES']

/* ── Continent paths ── */
const CONTINENTS = [
  'M 100,80 L 130,70 160,75 180,90 200,80 220,90 240,100 230,130 220,160 200,180 180,200 160,190 140,200 120,180 110,160 100,140 90,120 95,100Z',
  'M 180,220 L 200,210 220,220 230,250 220,280 210,310 190,340 170,330 160,300 165,270 170,240Z',
  'M 370,80 L 400,70 420,80 430,90 420,110 400,120 380,110 370,100Z',
  'M 370,140 L 400,130 430,140 450,170 440,210 430,250 410,280 390,290 370,270 360,240 355,200 360,170Z',
  'M 440,60 L 500,50 560,60 620,70 660,90 680,120 660,150 620,160 580,150 540,140 500,130 460,120 440,100Z',
  'M 620,260 L 660,250 700,260 720,280 710,310 680,320 640,310 620,290Z',
]

const toXY = (lng, lat) => ({
  x: ((parseFloat(lng) + 180) / 360) * 800,
  y: ((90 - parseFloat(lat)) / 180) * 400,
})

/* ── Live ISS ground-track map ── */
const ISSMap = ({ pos, trail }) => {
  const point = pos ? toXY(pos.longitude, pos.latitude) : null

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

        {/* Ground track trail */}
        {trail.length > 1 && (
          <polyline
            points={trail.map(p => `${toXY(p.lon, p.lat).x},${toXY(p.lon, p.lat).y}`).join(' ')}
            fill="none"
            stroke="#22d3ee"
            strokeWidth="1.5"
            strokeOpacity="0.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="4 3"
          />
        )}

        {/* ISS pin */}
        {point && (
          <g>
            <circle cx={point.x} cy={point.y} r="16" fill="none" stroke="#22d3ee" strokeWidth="1" opacity="0.5">
              <animate attributeName="r" from="8" to="22" dur="1.5s" repeatCount="indefinite" />
              <animate attributeName="opacity" from="0.6" to="0" dur="1.5s" repeatCount="indefinite" />
            </circle>
            <circle cx={point.x} cy={point.y} r="6" fill="#22d3ee" stroke="#0f172a" strokeWidth="1.5" style={{ filter: 'drop-shadow(0 0 6px #22d3ee)' }} />
            <text x={point.x + 10} y={point.y - 6} fill="#67e8f9" fontSize="10" fontFamily="ui-monospace, monospace">ISS</text>
          </g>
        )}
      </svg>
      <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-cyan-500/40 bg-black/70 text-[11px] text-cyan-300 font-mono">
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
        Live · refresh 5 s
      </div>
    </div>
  )
}

/* ── Parse TLE line 2 into orbital elements ── */
function parseTLE(line2) {
  if (!line2) return null
  const parts = line2.trim().split(/\s+/)
  if (parts.length < 8) return null
  const inclination = parseFloat(parts[2])
  const raan = parseFloat(parts[3])
  const eccentricity = parseFloat('0.' + parts[4])
  const argPerigee = parseFloat(parts[5])
  const meanAnomaly = parseFloat(parts[6])
  const meanMotion = parseFloat(parts[7]) // revs/day
  return { inclination, raan, eccentricity, argPerigee, meanAnomaly, meanMotion }
}

/* ── Derive orbital period + altitude from mean motion ── */
function orbitFacts(elements) {
  if (!elements?.meanMotion) return null
  const revsPerDay = elements.meanMotion
  const periodMinutes = 1440 / revsPerDay
  // Kepler's third law — a = (GM/(2π/T)²)^(1/3); Earth GM = 398600.4418 km³/s²
  const GM = 398600.4418
  const n = (revsPerDay * 2 * Math.PI) / 86400
  const a = Math.cbrt(GM / (n * n))
  const altitude = a - 6371 // km above Earth surface
  return { periodMinutes, altitude }
}

const SatelliteViewer = () => {
  const [issPos, setIssPos] = useState(null)
  const [trail, setTrail] = useState([])
  const [people, setPeople] = useState([])
  const [satellites, setSatellites] = useState([])
  const [searchQuery, setSearchQuery] = useState('HUBBLE')
  const [loading, setLoading] = useState(true)
  const [satLoading, setSatLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selectedSat, setSelectedSat] = useState(null)
  const [updated, setUpdated] = useState(null)
  const abortRef = useRef(null)
  const issTimerRef = useRef(null)

  // Fetch ISS position every 5s
  const fetchISSTick = useCallback(async () => {
    const { data } = await fetchISSPosition()
    if (data?.iss_position) {
      const lat = parseFloat(data.iss_position.latitude)
      const lon = parseFloat(data.iss_position.longitude)
      setIssPos({ latitude: lat, longitude: lon })
      setTrail(t => {
        const next = [...t, { lat, lon }]
        return next.slice(-60) // keep last ~5 min of ground track
      })
      setUpdated(new Date())
    }
  }, [])

  const fetchPeople = useCallback(async () => {
    const { data } = await fetchAstros()
    if (data?.people) setPeople(data.people)
  }, [])

  const searchSats = useCallback(async (q) => {
    if (!q.trim()) return
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setSatLoading(true)
    setError(null)

    const { data, error: err } = await fetchTLE(
      { search: q, page_size: 20 },
      { signal: controller.signal }
    )
    if (err) { setError(err); setSatLoading(false); return }
    if (data?.member) setSatellites(data.member)
    setSatLoading(false)
  }, [])

  const debouncedSearch = useMemo(() => debounce(searchSats, 400), [searchSats])

  useEffect(() => {
    Promise.all([fetchISSTick(), fetchPeople(), searchSats('HUBBLE')]).finally(() => setLoading(false))
    issTimerRef.current = setInterval(fetchISSTick, 5000)
    return () => {
      clearInterval(issTimerRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [fetchISSTick, fetchPeople, searchSats])

  const onSearchInput = (e) => {
    setSearchQuery(e.target.value)
    debouncedSearch(e.target.value)
  }
  const onQuickPick = (q) => { setSearchQuery(q); searchSats(q) }

  const craftBreakdown = useMemo(() => {
    const m = {}
    people.forEach(p => { m[p.craft] = (m[p.craft] || 0) + 1 })
    return m
  }, [people])

  return (
    <div className="space-y-6 sm:space-y-8">
      <ModuleHero
        eyebrow="TLE · ISS · open-notify"
        title="Satellite Tracker"
        subtitle="Live position of the International Space Station on a world map, plus the crew currently aboard, plus a searchable catalogue of every tracked satellite with its two-line orbital elements."
        updated={updated}
        accent="violet"
      />

      {/* Telemetry */}
      <div>
        <SectionHeader>Live telemetry</SectionHeader>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <StatCard
            tone="cyan" label="ISS latitude"
            value={issPos ? `${issPos.latitude.toFixed(3)}°` : '—'}
            ctx="north (+) / south (−)"
            loading={loading}
          />
          <StatCard
            tone="violet" label="ISS longitude"
            value={issPos ? `${issPos.longitude.toFixed(3)}°` : '—'}
            ctx="east (+) / west (−)"
            loading={loading}
          />
          <StatCard
            tone="emerald" label="People in space"
            value={people.length}
            ctx={Object.entries(craftBreakdown).map(([c, n]) => `${c}: ${n}`).join(' · ') || 'currently orbiting'}
            loading={loading}
          />
          <StatCard
            tone="amber" label="ISS orbit"
            value="≈ 92 min"
            ctx="one lap around Earth · 27 600 km/h"
            live={false}
          />
        </div>
      </div>

      <FriendlyError error={error} onRetry={() => searchSats(searchQuery)} />

      {loading ? (
        <div className="py-16 flex items-center justify-center">
          <LuxeLoader variant="cosmos" size="lg" label="pinging low-Earth orbit…" />
        </div>
      ) : (
        <>
          {/* ISS map */}
          <ISSMap pos={issPos} trail={trail} />

          {/* Crew list */}
          <div>
            <SectionHeader trailing={<span className="text-[10px] text-gray-600 font-mono">{people.length} humans off-world</span>}>
              Current crew
            </SectionHeader>
            {people.length === 0 ? (
              <div className="luxe-card p-6 text-center">
                <p className="text-gray-500 text-sm">No one is in orbit right now (or the feed is quiet).</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
                {people.map((p, i) => (
                  <div key={i} className="luxe-card p-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                      {p.name?.charAt(0) || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-xs font-semibold truncate">{p.name}</div>
                      <div className="text-[10px] text-violet-300 font-mono">{p.craft}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Satellite search */}
          <div>
            <SectionHeader>Satellite catalogue</SectionHeader>
            <form onSubmit={(e) => { e.preventDefault(); searchSats(searchQuery) }} className="space-y-3">
              <div className="relative">
                <input
                  type="search"
                  value={searchQuery}
                  onChange={onSearchInput}
                  placeholder="Search Hubble, TESS, Landsat, GOES…"
                  aria-label="Search satellites"
                  className="w-full px-4 py-3 pl-10 bg-gray-900/60 border border-gray-800 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:border-violet-500/50 transition-colors"
                />
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <p className="text-[10px] text-gray-600 font-mono">tip: results update as you type</p>
            </form>

            <div className="mt-3">
              <FilterChips
                options={FAMOUS_SATS.map(s => ({ key: s, label: s }))}
                value={searchQuery.toUpperCase()}
                onChange={onQuickPick}
              />
            </div>

            {satLoading && (
              <div className="py-8 flex items-center justify-center">
                <LuxeLoader variant="cosmos" size="md" label="reading NORAD elements…" />
              </div>
            )}

            {!satLoading && satellites.length > 0 && (
              <div className="mt-4 space-y-2 max-h-[520px] overflow-y-auto pr-1">
                {satellites.map((sat) => {
                  const elements = parseTLE(sat.line2)
                  const facts = orbitFacts(elements)
                  const open = selectedSat?.satelliteId === sat.satelliteId
                  return (
                    <button
                      key={sat.satelliteId}
                      onClick={() => setSelectedSat(open ? null : sat)}
                      className={`w-full text-left luxe-card p-3 transition-colors ${
                        open ? 'border-violet-500/40 bg-violet-500/5' : 'hover:border-gray-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-white text-sm font-semibold truncate">{sat.name}</div>
                          <div className="text-[10px] text-gray-500 font-mono mt-0.5">catalog #{sat.satelliteId}</div>
                        </div>
                        <svg className={`w-4 h-4 text-gray-500 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>

                      {open && (
                        <div className="mt-3 pt-3 border-t border-gray-800/60 space-y-2">
                          {elements && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                              <div>
                                <div className="text-[9px] text-gray-500 uppercase tracking-wider">Inclination</div>
                                <div className="text-violet-300 font-mono text-xs">{elements.inclination.toFixed(2)}°</div>
                              </div>
                              <div>
                                <div className="text-[9px] text-gray-500 uppercase tracking-wider">Eccentricity</div>
                                <div className="text-fuchsia-300 font-mono text-xs">{elements.eccentricity.toFixed(5)}</div>
                              </div>
                              <div>
                                <div className="text-[9px] text-gray-500 uppercase tracking-wider">Period</div>
                                <div className="text-cyan-300 font-mono text-xs">{facts ? facts.periodMinutes.toFixed(1) + ' min' : '—'}</div>
                              </div>
                              <div>
                                <div className="text-[9px] text-gray-500 uppercase tracking-wider">Altitude</div>
                                <div className="text-emerald-300 font-mono text-xs">{facts ? facts.altitude.toFixed(0) + ' km' : '—'}</div>
                              </div>
                            </div>
                          )}
                          <div>
                            <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">TLE line 1</div>
                            <code className="block text-cyan-300 text-[10px] font-mono break-all bg-black/40 rounded p-2 border border-gray-800">{sat.line1}</code>
                          </div>
                          <div>
                            <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">TLE line 2</div>
                            <code className="block text-cyan-300 text-[10px] font-mono break-all bg-black/40 rounded p-2 border border-gray-800">{sat.line2}</code>
                          </div>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {!satLoading && satellites.length === 0 && searchQuery && (
              <div className="luxe-card p-6 text-center mt-4">
                <p className="text-gray-300 font-semibold mb-1">No satellites match "{searchQuery}"</p>
                <p className="text-gray-500 text-sm">Try one of the preset chips.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default SatelliteViewer
